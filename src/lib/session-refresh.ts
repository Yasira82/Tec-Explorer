import { jwtVerify } from 'jose';

/**
 * Server-side session refresh — C-123 §4, for every app made from the template.
 *
 * ── Why this exists (TEC-AUDIT-0029, 12 Nov 2026) ───────────────────────────
 * Template apps never kept a refresh token, and their /api/auth/refresh sent the
 * ACCESS token where auth-service expects the REFRESH token. A session therefore
 * lasted exactly as long as its access token, and nothing could renew it — which
 * also made the access token's lifetime impossible to shorten (ADR-001 says 24 h)
 * without signing every Pioneer out daily.
 *
 * ── The rules it keeps ───────────────────────────────────────────────────────
 * - The refresh happens HERE, on the server, never from the browser (§4: browser
 *   refresh is not durable — LAW 1).
 * - SINGLE-FLIGHT per refresh token: refresh tokens are single-use, and an app fires
 *   several BFF calls at once; each racing to spend the same token would burn the
 *   session ("Refresh token already used").
 * - The rotated cookies ride the SAME response (§4), with the creation attributes
 *   (§2 rule 2): the access token as the sign-in set it (shared domain when
 *   configured), the refresh token HttpOnly and HOST-ONLY. Host-only matters: the
 *   Hub keeps its own refresh token host-only too, so no two holders ever share one
 *   single-use token — whichever spent it first would kill the other's session.
 * - A failed refresh degrades QUIETLY (§4 forbids logout on refresh failure): the
 *   request continues with the token it had, and the route answers as it would.
 *   A refresh token the backend REJECTS is dropped, so it is not retried on every
 *   request.
 */

export const REFRESH_COOKIE = 'tec_refresh_token';
export const ACCESS_COOKIE  = 'tec_access_token';

/** Renew this long before expiry, so a request never reaches the backend with a token
 *  that expires on the way. */
export const REFRESH_AHEAD_SECONDS = 120;

export const ACCESS_MAX_AGE  = 60 * 60 * 24;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

/** The requests a refresh is attempted for: the BFF and the session check. Never a page
 *  navigation — a page can answer with a redirect, and LAW 2 drops cookies on a 3xx,
 *  which would burn the single-use token. */
export const refreshesOn = (pathname: string): boolean =>
  pathname.startsWith('/api/bff/') || pathname === '/api/auth/me';

export interface Rotated { token: string; refreshToken: string | null }
export type RefreshOutcome = Rotated | 'rejected' | 'unavailable';

/** True when the access token is expired or about to be. A token that does not verify
 *  for any other reason is NOT refreshed here — the route refuses it (P6). */
export async function needsRefresh(
  token: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return true;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      currentDate: new Date(nowSeconds * 1000),
    });
    return typeof payload.exp === 'number' && payload.exp - nowSeconds < REFRESH_AHEAD_SECONDS;
  } catch (err) {
    return (err as { code?: string })?.code === 'ERR_JWT_EXPIRED';
  }
}

const inflight = new Map<string, Promise<RefreshOutcome>>();

/** Spends the refresh token at the gateway, once per token however many requests ask. */
export function refreshAtGateway(
  refreshToken: string,
  gateway: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RefreshOutcome> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const attempt = (async (): Promise<RefreshOutcome> => {
    try {
      const res = await fetchImpl(`${gateway.replace(/\/$/, '')}/api/v1/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${refreshToken}` },
        cache:   'no-store',
        signal:  AbortSignal.timeout(8000),
      });
      if (res.status === 401 || res.status === 403) return 'rejected';
      if (!res.ok) return 'unavailable';
      const data  = await res.json().catch(() => ({})) as Record<string, any>;
      const token = data.token ?? data.accessToken ?? data.data?.token ?? data.data?.accessToken ?? null;
      if (typeof token !== 'string' || !token) return 'unavailable';
      const next = data.refreshToken ?? data.data?.refreshToken ?? null;
      return { token, refreshToken: typeof next === 'string' && next ? next : null };
    } catch {
      return 'unavailable';
    }
  })();

  inflight.set(refreshToken, attempt);
  // Kept for a few seconds so a straggler reuses the result instead of spending the
  // (now rotated) token again.
  attempt.finally(() => { setTimeout(() => inflight.delete(refreshToken), 5000); });
  return attempt;
}

/** For tests only. */
export const _resetInflight = (): void => { inflight.clear(); };

interface CookieWriter {
  set(name: string, value: string, opts: Record<string, unknown>): unknown;
}

/**
 * Writes the rotated cookies with the attributes their creation used (C-123 §2).
 *
 * A session is the token AND `tec_user` + `tec_csrf` (C-123: "refresh renews the token
 * with tec_user + tec_csrf"). Renewing the token alone once left a half session a day
 * later: the name cookie expired while the token lived on, and every screen said "Not
 * signed in". The companions are re-issued exactly as they are — never invented: one
 * that has already lapsed stays lapsed.
 */
export function writeRotated(
  cookies: CookieWriter,
  rotated: Rotated,
  accessDomain: string | undefined,
  read: (name: string) => string | undefined = () => undefined,
): void {
  const base = { secure: true, sameSite: 'none' as const, partitioned: true, path: '/' };
  const session = { ...base, httpOnly: false, domain: accessDomain, maxAge: ACCESS_MAX_AGE };
  cookies.set(ACCESS_COOKIE, rotated.token, session);
  for (const name of ['tec_user', 'tec_csrf'] as const) {
    const raw   = read(name);
    const value = name === 'tec_user' ? onceEncoded(raw) : raw;
    if (value) cookies.set(name, value, session);
  }
  if (rotated.refreshToken) {
    cookies.set(REFRESH_COOKIE, rotated.refreshToken, { ...base, httpOnly: true, maxAge: REFRESH_MAX_AGE });
  }
}

/** `tec_user` as the browser must hold it: JSON, which `cookies.set` encodes once. A copy
 *  written before 2026-10-10 was encoded twice; re-issuing that unchanged would renew a
 *  cookie getStoredUser() cannot read. */
export function onceEncoded(value: string | undefined): string | undefined {
  if (!value || value.startsWith('{')) return value;
  try {
    const decoded = decodeURIComponent(value);
    JSON.parse(decoded);
    return decoded;
  } catch {
    return value;
  }
}

/** Drops a refresh token the backend rejected — host-only, exactly as it was created. */
export function dropRefresh(cookies: CookieWriter): void {
  cookies.set(REFRESH_COOKIE, '', { secure: true, sameSite: 'none', partitioned: true, path: '/', httpOnly: true, maxAge: 0 });
}
