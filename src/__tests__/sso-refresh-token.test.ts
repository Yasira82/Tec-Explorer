import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GET } from '../app/api/auth/sso-callback/route';

/**
 * TEC-AUDIT-0029 — the app keeps its OWN refresh token, and only its own.
 *  - the app's own Pi sign-in (pi-login) puts a refresh token in the signed token:
 *    the landing stores it HttpOnly and host-only;
 *  - a Hub hand-off carries none — the Hub's single-use refresh token stays the Hub's.
 */
const SECRET = 'sso-secret-for-tests-at-least-32-chars!!';
const ORIGIN = readFileSync(join(process.cwd(), 'src/app/api/auth/sso-callback/route.ts'), 'utf8')
  // the first https origin in the list — reads past a comment if the list opens with one
  .match(/ALLOWED_AUDIENCES = \[[\s\S]*?'(https:\/\/[^']+)'/)?.[1] as string;

let saved: string | undefined;
beforeEach(() => { saved = process.env.SSO_SECRET; process.env.SSO_SECRET = SECRET; });
afterEach(() => { process.env.SSO_SECRET = saved; });

const land = async (claims: Record<string, unknown>) => {
  const t = await new SignJWT({ accessToken: 'tec-at', user: { id: 'u1', piUsername: 'a' }, ...claims })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('tec.pi').setAudience(ORIGIN)
    .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
  const u = new URL('/api/auth/sso-callback', ORIGIN);
  u.searchParams.set('token', t);
  u.searchParams.set('redirect', '/app');
  const res = await GET(new NextRequest(u));
  return { res, cookies: res.headers.getSetCookie() };
};

describe('sso-callback and the refresh token', () => {
  it("the app's own sign-in: stored HttpOnly, host-only, on the 200 landing", async () => {
    const { res, cookies } = await land({ refreshToken: 'own-refresh' });
    expect(res.status).toBe(200);
    const c = cookies.find((x) => x.startsWith('tec_refresh_token='));
    expect(c).toBeDefined();
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/Secure/i);
    expect(c).toMatch(/SameSite=none/i);
    expect(c).toMatch(/Partitioned/i);
    expect(c).not.toMatch(/Domain=/i);
  });

  it('a Hub hand-off (no refresh token in it) sets none', async () => {
    const { cookies } = await land({});
    expect(cookies.some((x) => x.startsWith('tec_refresh_token='))).toBe(false);
  });

  it('the refresh token never reaches the page script (document.cookie fallback)', async () => {
    const { res } = await land({ refreshToken: 'own-refresh' });
    expect(await res.text()).not.toContain('own-refresh');
  });
});
