/**
 * An unusable token at the SSO landing carries on to the page — it never ends
 * on a JSON error (C-123 §7, §12).
 *
 * The Hub's Quest and campaign open apps through this landing with a one-time,
 * 5-minute token (tec-app #258). Tapping a link twice, or after its 5 minutes,
 * used to answer `{"error":"replay_detected"}` — a dead end on a phone. The
 * worst case must be the visit as it was before those links: the page, signed out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GET } from '../app/api/auth/sso-callback/route';

const SECRET = 'sso-secret-for-tests-at-least-32-chars!!';
const ORIGIN = readFileSync(join(process.cwd(), 'src/app/api/auth/sso-callback/route.ts'), 'utf8')
  .match(/ALLOWED_AUDIENCES = \[\s*'([^']+)'/)?.[1] as string;

let saved: string | undefined;
beforeEach(() => { saved = process.env.SSO_SECRET; process.env.SSO_SECRET = SECRET; });
afterEach(() => { process.env.SSO_SECRET = saved; });

const token = (opts: { exp?: string; jti?: string; audience?: string } = {}) =>
  new SignJWT({ accessToken: 'tec-at', user: { id: 'u1', piUsername: 'pioneer' } })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('tec.pi')
    .setAudience(opts.audience ?? ORIGIN)
    .setJti(opts.jti ?? crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(new TextEncoder().encode(SECRET));

const land = (t: string | null, redirect = '/app?q=1') => {
  const u = new URL('/api/auth/sso-callback', ORIGIN);
  if (t !== null) u.searchParams.set('token', t);
  u.searchParams.set('redirect', redirect);
  return GET(new NextRequest(u));
};

const wentOnTo = (res: Response) => {
  expect(res.status).toBe(307);
  expect(res.headers.get('set-cookie')).toBeNull(); // LAW 2: nothing set on a 3xx
  const loc = new URL(res.headers.get('location') as string);
  return loc.pathname + loc.search;
};

describe('sso-callback with a token it cannot use', () => {
  it('a good token still signs in (200 landing, cookies set)', async () => {
    const res = await land(await token());
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('tec_access_token=');
  });

  it('the SAME token a second time → the page, not replay_detected', async () => {
    const t = await token();
    expect((await land(t)).status).toBe(200);
    expect(wentOnTo(await land(t))).toBe('/app?q=1');
  });

  it('an expired token → the page', async () => {
    const t = await token({ exp: '1s' });
    await new Promise((r) => setTimeout(r, 1500));
    expect(wentOnTo(await land(t))).toBe('/app?q=1');
  });

  it('a token for another app → the page', async () => {
    expect(wentOnTo(await land(await token({ audience: 'https://other.example' })))).toBe('/app?q=1');
  });

  it('no token → the page it was going to', async () => {
    expect(wentOnTo(await land(null))).toBe('/app?q=1');
  });

  it('SSO not configured → the page, not a 503 JSON', async () => {
    delete process.env.SSO_SECRET;
    expect(wentOnTo(await land(await token()))).toBe('/app?q=1');
  });

  it('never leaves the origin', async () => {
    for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example']) {
      expect(wentOnTo(await land(null, bad))).toBe('/app');
    }
  });
});
