/**
 * A sign-in token is used ONCE across every instance (the engineering audit, 21 Nov 2026).
 *
 * The landing kept its "already used" list in the memory of one Vercel instance: the same 5-minute token
 * was accepted again by any other. auth-service now records the first use (tec-core-backend #534,
 * POST /api/auth/sso/consume); the landing asks it, and refuses a token it cannot check (P6). A token with
 * no `jti` cannot be checked at all, so it is refused too — the Hub and this app's own pi-login always set one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstUse } from '../lib/sso-once';
import { GET } from '../app/api/auth/sso-callback/route';

const SECRET = 'sso-secret-for-tests-at-least-32-chars!!';
const ORIGIN = readFileSync(join(process.cwd(), 'src/app/api/auth/sso-callback/route.ts'), 'utf8')
  .match(/ALLOWED_AUDIENCES = \[[\s\S]*?'(https:\/\/[^']+)'/)?.[1] as string;

const saved = { ...process.env };
let calls: { url: string; init: RequestInit }[];
const answer = (status: number, body: unknown) => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }));
};
beforeEach(() => {
  process.env.SSO_SECRET = SECRET;
  process.env.API_GATEWAY_URL = 'https://gw.example';
  process.env.INTERNAL_SECRET = 'i'.repeat(40);
});
afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

const token = (jti: string | null) => {
  const t = new SignJWT({ accessToken: 'tec-at', user: { id: 'u1', piUsername: 'pioneer' } })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('tec.pi').setAudience(ORIGIN).setIssuedAt().setExpirationTime('5m');
  if (jti) t.setJti(jti);
  return t.sign(new TextEncoder().encode(SECRET));
};
const land = async (jti: string | null) => {
  const u = new URL('/api/auth/sso-callback', ORIGIN);
  u.searchParams.set('token', await token(jti));
  return GET(new NextRequest(u));
};
const signedIn = (res: Response) => res.status === 200 && (res.headers.get('set-cookie') ?? '').includes('tec_access_token=');

describe('firstUse — asks auth-service, through the gateway, with the session the token carries', () => {
  it('first, replayed, or unavailable — never a guess', async () => {
    answer(200, { first: true });
    expect(await firstUse('jti-1', 'tec-at')).toBe('first');
    expect(calls[0]!.url).toBe('https://gw.example/api/auth/sso/consume');
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h.authorization).toBe('Bearer tec-at');
    expect(h['x-internal-key']).toBe('i'.repeat(40));
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ jti: 'jti-1' });

    answer(200, { data: { first: false } });            // the gateway's envelope, too
    expect(await firstUse('jti-1', 'tec-at')).toBe('replayed');
    answer(404, { error: 'not found' });                // an auth-service without the route: no answer
    expect(await firstUse('jti-1', 'tec-at')).toBe('unavailable');
    answer(200, { something: 'else' });
    expect(await firstUse('jti-1', 'tec-at')).toBe('unavailable');
    delete process.env.API_GATEWAY_URL;
    expect(await firstUse('jti-1', 'tec-at')).toBe('unavailable');
  });
});

describe('the landing', () => {
  it('signs in on the first use', async () => {
    answer(200, { first: true });
    expect(signedIn(await land('jti-a'))).toBe(true);
  });

  it('refuses a token another instance already used — and sets nothing', async () => {
    answer(200, { first: false });
    const res = await land('jti-b');
    expect(res.status).toBe(307);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses when the use cannot be checked (P6)', async () => {
    answer(503, { error: 'unavailable' });
    expect(signedIn(await land('jti-c'))).toBe(false);
  });

  it('refuses a token with no jti — it cannot be checked at all', async () => {
    answer(200, { first: true });
    expect(signedIn(await land(null))).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
