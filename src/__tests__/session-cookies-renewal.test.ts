// @vitest-environment node
/**
 * A refresh renews `tec_user` in the form the browser can read, on the host it
 * was set for — and logout clears it there.
 *
 * Two bugs met here (2026-10-10). The SSO landing wrote `tec_user` encoded twice,
 * and `refresh` re-issued whatever it found, so an unreadable cookie was renewed
 * every day and a signed-in member kept seeing "Sign in with Pi". And on the
 * Testnet host (`*.vercel.app`) a `Domain=.tecosystem.app` cookie is dropped by
 * the browser silently: the renewal never landed, and logout never cleared.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

const USER = { id: 'u1', piUsername: 'mans809' };

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  process.env.API_GATEWAY_URL = 'https://gw';
  process.env.COOKIE_DOMAIN   = '.tecosystem.app';
  vi.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
    token: 'new', accessToken: 'new', data: { token: 'new' }, tokens: { accessToken: 'new' },
  }), { status: 200 }));
});

const refresh = async (host: string, userCookie: string) => {
  const { POST } = await import('@/app/api/auth/refresh/route');
  const req = new NextRequest(`https://${host}/api/auth/refresh`, { method: 'POST' });
  req.cookies.set('tec_access_token', 'old');
  req.cookies.set('tec_refresh_token', 'r');
  req.cookies.set('tec_user', userCookie);
  req.cookies.set('tec_csrf', 'c');
  const res = await POST(req);
  return res.headers.getSetCookie();
};
const userOf = (cookies: string[]) => cookies.find((c) => c.startsWith('tec_user=')) ?? '';
const readLikeTheBrowser = (setCookie: string) =>
  JSON.parse(decodeURIComponent(/^tec_user=([^;]*)/.exec(setCookie)?.[1] ?? ''));

describe('refresh renews tec_user readable', () => {
  it('heals a copy that was encoded twice', async () => {
    // What Next hands the route for a browser cookie `%257B…`: one layer decoded.
    const c = userOf(await refresh('tec-app.vercel.app', encodeURIComponent(JSON.stringify(USER))));
    expect(c).not.toContain('%25');
    expect(readLikeTheBrowser(c)).toEqual(USER);
  });

  it('leaves a good one as it is', async () => {
    const c = userOf(await refresh('tec-app.vercel.app', JSON.stringify(USER)));
    expect(readLikeTheBrowser(c)).toEqual(USER);
  });

  it('on the Testnet host the renewal is host-only — a Domain it is not under is dropped', async () => {
    for (const c of await refresh('tec-app.vercel.app', JSON.stringify(USER))) {
      expect(c).not.toMatch(/Domain=/i);
    }
  });
});

describe('logout clears on the Testnet host', () => {
  const route = join(process.cwd(), 'src/app/api/auth/logout/route.ts');
  it.skipIf(!existsSync(route))('no Domain the host is not under', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const res = await (POST as (r: NextRequest) => Promise<Response>)(
      new NextRequest('https://tec-app.vercel.app/api/auth/logout', { method: 'POST' }));
    const cleared = res.headers.getSetCookie().filter((c) => c.startsWith('tec_user='));
    expect(cleared.length).toBeGreaterThan(0);
    for (const c of cleared) expect(c).not.toMatch(/Domain=/i);
  });
});
