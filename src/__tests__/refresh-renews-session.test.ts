/**
 * A refresh renews the WHOLE session, not just the token.
 *
 * The refresh route used to re-issue `tec_access_token` for another day and
 * leave `tec_user` on the lifetime the sign-in gave it. A day later the name
 * cookie expired while the token kept being renewed — the half session behind
 * "Not signed in" on one visit and the Pi username on the next.
 *
 * Run against the real route with the gateway stubbed: what matters is which
 * cookies the browser is told to keep.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const USER = JSON.stringify({ piUsername: 'pioneer' });

async function refresh(cookies: Record<string, string>) {
  vi.stubEnv('API_GATEWAY_URL', 'https://gateway.test');
  vi.resetModules();
  const { POST } = await import('../app/api/auth/refresh/route');
  const req = new NextRequest('https://app.tecosystem.app/api/auth/refresh', { method: 'POST' });
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return POST(req);
}

const setCookieFor = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

describe('refresh keeps the session whole', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      { token: 'new-token', accessToken: 'new-token', data: { token: 'new-token', accessToken: 'new-token' } },
    )));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  const whole = { tec_access_token: 'old', tec_refresh_token: 'r', tec_user: USER, tec_csrf: 'c' };

  it('renews tec_user with the token — the half session this prevents', async () => {
    const res = await refresh(whole);
    expect(setCookieFor(res, 'tec_access_token')).toBeDefined();
    const user = setCookieFor(res, 'tec_user');
    expect(user).toBeDefined();
    expect(user).toMatch(/Max-Age=86400/i);
    const value = (user ?? '').split(';')[0] ?? '';
    expect(decodeURIComponent(value.slice('tec_user='.length))).toBe(USER);
  });

  it('renews tec_csrf too, so writes keep working after the refresh', async () => {
    expect(setCookieFor(await refresh(whole), 'tec_csrf')).toBeDefined();
  });

  it('never invents a tec_user that had already lapsed (P6)', async () => {
    const res = await refresh({ tec_access_token: 'old', tec_refresh_token: 'r', tec_csrf: 'c' });
    expect(setCookieFor(res, 'tec_user')).toBeUndefined();
  });
});
