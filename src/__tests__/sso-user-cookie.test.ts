/**
 * `tec_user` reaches the browser encoded ONCE — the way every reader decodes it.
 *
 * `getStoredUser()` (@yasser172/tec-auth) reads `document.cookie`, decodes once,
 * and parses JSON. This route used to hand the cookie API a value it had ALREADY
 * passed through encodeURIComponent, and Next's `res.cookies.set` encodes again —
 * so the browser held `%257B%2522id…`, one decode gave `%7B%22id…`, the parse
 * failed, and the page decided nobody was signed in.
 *
 * The server never noticed: `/api/auth/me` reads through Next, which decodes once,
 * and then tries a second decode. So `/app` (gated on `/me`) opened while every
 * screen gated on `usePiAuth()` (the landing, its redirect into the app) showed
 * the sign-in again. It looked like "only the owner's account works" (2026-10-10):
 * the owner's browser still held an older copy written by the landing's
 * document.cookie fallback, which encodes once.
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

const USER = { id: 'u1', piUsername: 'mans809', role: 'user' };

const signIn = async () => {
  const t = await new SignJWT({ accessToken: 'tec-at', user: USER })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('tec.pi')
    .setAudience(ORIGIN)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET));
  const u = new URL('/api/auth/sso-callback', ORIGIN);
  u.searchParams.set('token', t);
  u.searchParams.set('redirect', '/app');
  return GET(new NextRequest(u));
};

describe('the tec_user cookie the landing sets', () => {
  it('is readable the way getStoredUser reads it — one decode, then JSON', async () => {
    const res = await signIn();
    expect(res.status).toBe(200);
    const raw = /tec_user=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
    expect(raw).not.toBe('');
    expect(raw).not.toContain('%25'); // an encoded "%" = encoded twice
    expect(JSON.parse(decodeURIComponent(raw))).toEqual(USER);
  });
});
