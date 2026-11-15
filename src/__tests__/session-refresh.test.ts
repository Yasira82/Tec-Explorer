import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import {
  needsRefresh, refreshAtGateway, writeRotated, dropRefresh, refreshesOn,
  _resetInflight, REFRESH_AHEAD_SECONDS,
} from '@/lib/session-refresh';

/**
 * TEC-AUDIT-0029 — C-123 §4 server-side refresh. Template apps kept no refresh token
 * and sent the ACCESS token where auth-service expects the REFRESH token, so no session
 * could ever be renewed.
 */
const SECRET = 'x'.repeat(40);
const token = (expInSeconds: number, now: number) =>
  new SignJWT({ sub: 'u-1' }).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now - 10).setExpirationTime(now + expInSeconds).sign(new TextEncoder().encode(SECRET));

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => { _resetInflight(); });

describe('needsRefresh', () => {
  const now = 1_800_000_000;
  it('a fresh token is left alone', async () => {
    expect(await needsRefresh(await token(3600, now), SECRET, now)).toBe(false);
  });
  it('a token about to expire is renewed ahead of time', async () => {
    expect(await needsRefresh(await token(REFRESH_AHEAD_SECONDS - 5, now), SECRET, now)).toBe(true);
  });
  it('an expired token is renewed', async () => {
    expect(await needsRefresh(await token(-60, now), SECRET, now)).toBe(true);
  });
  it('a missing token is renewed (the refresh cookie may still hold a session)', async () => {
    expect(await needsRefresh(undefined, SECRET, now)).toBe(true);
  });
  it('a forged token is NOT refreshed — the route refuses it (P6)', async () => {
    const forged = await new SignJWT({ sub: 'u-1' }).setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(now + 3600).sign(new TextEncoder().encode('y'.repeat(40)));
    expect(await needsRefresh(forged, SECRET, now)).toBe(false);
  });
});

describe('refreshAtGateway', () => {
  it('sends the REFRESH token as the bearer, to the gateway refresh route', async () => {
    const f = vi.fn(async () => ok({ token: 'new-access', refreshToken: 'new-refresh' }));
    const out = await refreshAtGateway('r-1', 'https://gw.test/', f as unknown as typeof fetch);
    expect(out).toEqual({ token: 'new-access', refreshToken: 'new-refresh' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gw.test/api/v1/auth/refresh');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer r-1');
  });

  it('spends a single-use token ONCE however many requests ask at the same time', async () => {
    const f = vi.fn(async () => ok({ token: 'a', refreshToken: 'b' }));
    const all = await Promise.all([1, 2, 3, 4].map(() => refreshAtGateway('r-2', 'https://gw.test', f as unknown as typeof fetch)));
    expect(f).toHaveBeenCalledTimes(1);
    expect(new Set(all.map((x) => JSON.stringify(x))).size).toBe(1);
  });

  it('a refresh token the backend refuses is "rejected"; an outage is "unavailable"', async () => {
    expect(await refreshAtGateway('r-3', 'https://gw.test', (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch)).toBe('rejected');
    expect(await refreshAtGateway('r-4', 'https://gw.test', (async () => new Response('{}', { status: 502 })) as unknown as typeof fetch)).toBe('unavailable');
    expect(await refreshAtGateway('r-5', 'https://gw.test', (async () => { throw new TypeError('down'); }) as unknown as typeof fetch)).toBe('unavailable');
  });
});

describe('cookies', () => {
  const jar = () => {
    const set = vi.fn();
    return { set, get: (name: string) => set.mock.calls.find((c) => c[0] === name) };
  };

  it('the refresh token is HttpOnly and HOST-ONLY; the access token keeps its domain', () => {
    const c = jar();
    writeRotated(c, { token: 'a', refreshToken: 'r' }, '.tecosystem.app');
    const [, , access]  = c.get('tec_access_token')!;
    const [, , refresh] = c.get('tec_refresh_token')!;
    expect(access).toMatchObject({ httpOnly: false, secure: true, sameSite: 'none', partitioned: true, domain: '.tecosystem.app' });
    expect(refresh).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/' });
    expect(refresh.domain).toBeUndefined();
  });

  it('a dropped refresh token is cleared with the attributes it was created with', () => {
    const c = jar();
    dropRefresh(c);
    expect(c.get('tec_refresh_token')![2]).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none', partitioned: true, maxAge: 0 });
    expect(c.get('tec_refresh_token')![2].domain).toBeUndefined();
  });
});

describe('where a refresh may happen', () => {
  it('BFF calls and the session check — never a page (a redirect would drop the cookies)', () => {
    expect(refreshesOn('/api/bff/payment/create')).toBe(true);
    expect(refreshesOn('/api/auth/me')).toBe(true);
    expect(refreshesOn('/app')).toBe(false);
    expect(refreshesOn('/api/auth/sso-callback')).toBe(false);
  });
});
