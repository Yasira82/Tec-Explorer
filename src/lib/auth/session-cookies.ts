import type { NextRequest } from 'next/server';

// The three session cookies (C-123 §2 — names LOCKED).
export const SESSION_COOKIES = ['tec_access_token', 'tec_user', 'tec_csrf'] as const;

/**
 * WHICH session cookies a request carried: `none`, `user+csrf`, … — names from
 * the fixed list only, never a value, a length or any other cookie.
 */
export function arrivedSessionCookies(req: NextRequest): string {
  const got = SESSION_COOKIES.filter((n) => req.cookies.has(n)).map((n) => n.slice(4));
  return got.length ? got.join('+') : 'none';
}
