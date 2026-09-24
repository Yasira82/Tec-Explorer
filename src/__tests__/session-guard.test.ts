/**
 * A session is BOTH cookies — the guard and `/api/auth/me` must agree.
 *
 * Seen on a phone: an app opened from the Hub rendered its screens, and every
 * one of them said "Not signed in". The guard admitted the visitor on
 * `tec_access_token` alone; `/me` also needs `tec_user`. With one cookie
 * lapsed and the other not, the person sat between the two definitions — past
 * the door, with no name and no way to sign in.
 *
 * Run against the real middleware, not its source text: what matters is where
 * a request ends up.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

const visit = (cookies: Record<string, string>, path = '/app?q=1') => {
  const req = new NextRequest(`https://explorer.tecosystem.app${path}`);
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return middleware(req);
};

const redirectedTo = (res: Response) => res.headers.get('location');

describe('the page guard admits a WHOLE session only', () => {
  it('sends a half session (token, no tec_user) to sign in', () => {
    const res = visit({ tec_access_token: 'tok' });
    expect(res.status).toBe(307);
    expect(redirectedTo(res)).toContain('/?redirect=%2Fapp');
  });

  it('keeps the Hub-surface marker across that hop', () => {
    // The one visitor who had to sign in is the one most likely to be lost
    // afterwards — the way back must survive the redirect.
    expect(redirectedTo(visit({ tec_access_token: 'tok' }))).toContain('q=1');
  });

  it('sends the other half (tec_user, no token) too', () => {
    expect(visit({ tec_user: '{"piUsername":"a"}' }).status).toBe(307);
  });

  it('treats a blank cookie as absent', () => {
    expect(visit({ tec_access_token: 'tok', tec_user: '  ' }).status).toBe(307);
  });

  it('lets a whole session through', () => {
    const res = visit({ tec_access_token: 'tok', tec_user: '{"piUsername":"a"}' });
    expect(redirectedTo(res)).toBeNull();
  });
});

/**
 * When the name is missing, `/api/auth/me` says which half of the session is.
 *
 * The name appeared on one visit and not the next, in the same app. Guessing
 * between "tec_user lapsed", "no token" and "Pi Browser did not send the cookie
 * in this context" is how the last three fixes to this area went wrong; the
 * browser that failed can simply be asked. Nothing about the token is returned.
 */
import { GET as me } from '../app/api/auth/me/route';

const askMe = async (cookies: Record<string, string>) => {
  const req = new NextRequest('https://explorer.tecosystem.app/api/auth/me');
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  const res = await me(req);
  return { status: res.status, body: await res.json() };
};

describe('/api/auth/me says which half is missing', () => {
  it('no token', async () => {
    expect((await askMe({ tec_user: '{"piUsername":"a"}' })).body.reason).toBe('no_token');
  });
  it('no tec_user', async () => {
    expect((await askMe({ tec_access_token: 'tok' })).body.reason).toBe('no_user');
  });
  it('an unreadable tec_user', async () => {
    expect((await askMe({ tec_access_token: 'tok', tec_user: '{nope' })).body.reason).toBe('bad_user');
  });
  it('never echoes the token', async () => {
    const r = await askMe({ tec_user: 'x', tec_access_token: 'SECRET-TOKEN-VALUE' });
    expect(JSON.stringify(r.body)).not.toContain('SECRET-TOKEN-VALUE');
  });
  it('a whole session answers with the user', async () => {
    const r = await askMe({ tec_access_token: 'tok', tec_user: '{"piUsername":"yas"}' });
    expect(r).toMatchObject({ status: 200, body: { authenticated: true, user: { piUsername: 'yas' } } });
  });
});
