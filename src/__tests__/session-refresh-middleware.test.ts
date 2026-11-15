import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { _resetInflight } from '@/lib/session-refresh';

/**
 * TEC-AUDIT-0029 through the real middleware: an expired access token on a BFF call is
 * renewed with the refresh token before the route runs; the route sees the NEW token;
 * the rotated cookies ride the same response. Nothing happens on a page navigation.
 */
const SECRET = 'x'.repeat(40);
const expired = () => new SignJWT({ sub: 'u-1' }).setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
  .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode(SECRET));

const request = (path: string, cookies: Record<string, string>) => {
  const req = new NextRequest(`https://app.tecosystem.app${path}`);
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
};
const setCookies = (res: Response) => res.headers.getSetCookie();

beforeEach(() => {
  _resetInflight();
  vi.stubEnv('JWT_SECRET', SECRET);
  vi.stubEnv('API_GATEWAY_URL', 'https://gw.test');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('middleware refreshes an expired session on a BFF call', () => {
  it('renews it, hands the route the new token, and sets the rotated cookies', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: 'new-access', refreshToken: 'new-refresh' })));
    vi.stubGlobal('fetch', fetchMock);
    const { middleware } = await import('../middleware');
    const res = await middleware(request('/api/bff/items', {
      tec_access_token: await expired(), tec_refresh_token: 'old-refresh', tec_user: '{"piUsername":"a"}', tec_csrf: 'c',
    }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const cookies = setCookies(res).join('\n');
    expect(cookies).toMatch(/tec_access_token=new-access/);
    expect(cookies).toMatch(/tec_refresh_token=new-refresh;[^\n]*HttpOnly/i);
    expect(cookies).toMatch(/tec_user=/);
    // the route runs with the new token
    expect(res.headers.get('x-middleware-request-cookie') ?? '').toContain('tec_access_token=new-access');
  });

  it('a refresh token the backend refuses is dropped; the request goes on as it came (no logout)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const { middleware } = await import('../middleware');
    const res = await middleware(request('/api/bff/items', { tec_access_token: await expired(), tec_refresh_token: 'spent' }));
    expect(res.status).toBe(200);
    const cookies = setCookies(res).join('\n');
    expect(cookies).toMatch(/tec_refresh_token=;/);
    expect(cookies).not.toMatch(/tec_access_token=/);
  });

  it('a page navigation never refreshes (a redirect would drop the rotated cookies)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { middleware } = await import('../middleware');
    await middleware(request('/app', { tec_access_token: await expired(), tec_refresh_token: 'r' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no refresh token → nothing to do', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { middleware } = await import('../middleware');
    await middleware(request('/api/bff/items', { tec_access_token: await expired() }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
