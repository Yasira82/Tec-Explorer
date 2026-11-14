/**
 * `/api/auth/me` says which session cookies a refused request carried.
 *
 * Vercel's logs showed `/app` served 200 — the guard only admits a navigation
 * that carried both halves of the session — and then `/me`, fetched by that
 * same page, answered `no_token`. The next question is whether that fetch
 * arrived with no cookies at all or with some of them. Names only, from a
 * fixed list: never a value, and never any other cookie.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as me } from '../app/api/auth/me/route';

const askMe = async (cookies: Record<string, string>) => {
  const req = new NextRequest('https://app.tecosystem.app/api/auth/me');
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  const res = await me(req);
  return { status: res.status, body: await res.json() };
};

describe('/api/auth/me names the session cookies that arrived', () => {
  it('none at all', async () => {
    expect((await askMe({})).body).toMatchObject({ reason: 'no_token', cookies: 'none' });
  });

  it('some of them — and never another cookie or any value', async () => {
    const { body } = await askMe({ tec_user: '{"piUsername":"a"}', tec_csrf: 'c', other: 'x' });
    expect(body.cookies).toBe('user+csrf');
    expect(JSON.stringify(body)).not.toMatch(/piUsername|other|"c"/);
  });

  it('says nothing extra when signed in', async () => {
    const { status, body } = await askMe({ tec_access_token: 't', tec_user: '{"piUsername":"a"}' });
    expect(status).toBe(200);
    expect(body.cookies).toBeUndefined();
  });
});
