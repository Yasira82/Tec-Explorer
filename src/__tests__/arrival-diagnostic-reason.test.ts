import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

// GET /api/bff/pioneer/arrived is the hand-opened check for "why is this app
// refusing me?". tokenValid alone could not tell an expired token (nothing renewed
// it) from one signed with another key (a JWT_SECRET that differs) — two causes
// with two different fixes. These pin that it says which, in minutes and labels
// only, never a value or a claim.

const SECRET = 's'.repeat(40);
const sign = async (secret: string, iatAgo: number, ttl: number) => {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: 'u1' }).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now - iatAgo).setExpirationTime(now - iatAgo + ttl)
    .sign(new TextEncoder().encode(secret));
};
const req = (token?: string) => {
  const r = new NextRequest('https://app.tecosystem.app/api/bff/pioneer/arrived');
  if (token) { r.cookies.set('tec_access_token', token); r.cookies.set('tec_user', '{}'); }
  return r;
};

let GET: (r: NextRequest) => Promise<Response>;
beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  vi.resetModules();
  ({ GET } = await import('@/app/api/bff/pioneer/arrived/route'));
});

const session = async (token?: string) => (await (await GET(req(token))).json()).session;

describe('the arrival check says WHY a token is refused', () => {
  it('a good token: valid, with its lifetime in minutes', async () => {
    expect(await session(await sign(SECRET, 60, 24 * 3600))).toMatchObject({ tokenValid: true, tokenProblem: null, lifetimeMinutes: 1440 });
  });

  it('an expired one: says expired, how long it lived, and how long ago it ran out', async () => {
    const s = await session(await sign(SECRET, 3600, 900));
    expect(s).toMatchObject({ tokenValid: false, tokenProblem: 'expired', lifetimeMinutes: 15 });
    expect(s.expiredMinutesAgo).toBe(45);
  });

  it('one signed with another key: says signature, and nothing about its contents', async () => {
    const s = await session(await sign('x'.repeat(40), 60, 3600));
    expect(s).toMatchObject({ tokenValid: false, tokenProblem: 'signature', lifetimeMinutes: null, expiredMinutesAgo: null });
  });

  it('garbage: malformed; no cookie: no problem to report', async () => {
    expect((await session('not-a-jwt')).tokenProblem).toBe('malformed');
    expect(await session()).toMatchObject({ token: false, tokenValid: false, tokenProblem: null });
  });

  it('never echoes the token or a claim', async () => {
    const t = await sign(SECRET, 60, 3600);
    const body = JSON.stringify(await (await GET(req(t))).json());
    expect(body).not.toContain(t);
    expect(body).not.toContain('u1');
  });
});
