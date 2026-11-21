import { fetchWithTimeout } from '@/lib/server/fetch-with-timeout';

/**
 * Was this the FIRST use of a sign-in token (its `jti`)? Asked of auth-service, through the gateway, with
 * the session the token carries (tec-core-backend #534, POST /api/auth/sso/consume).
 *
 * Why not in this process: the landing kept its "already used" list in the memory of one Vercel instance,
 * so the same 5-minute token was accepted again by any other instance (the engineering audit,
 * 21 Nov 2026). auth-service's mark is one for every instance of every app.
 *
 *   'first'       → sign in.
 *   'replayed'    → used before, anywhere: refused.
 *   'unavailable' → not configured, no answer, or an answer that is not one of those: refused (P6). A
 *                   sign-in that cannot be checked is not let through on the chance that it is fine.
 */
export type FirstUse = 'first' | 'replayed' | 'unavailable';

export async function firstUse(jti: string, accessToken: string): Promise<FirstUse> {
  const gw = process.env.API_GATEWAY_URL;
  if (!gw) return 'unavailable';
  try {
    const res = await fetchWithTimeout(`${gw}/api/auth/sso/consume`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
        ...(process.env.INTERNAL_SECRET ? { 'x-internal-key': process.env.INTERNAL_SECRET } : {}),
      },
      body: JSON.stringify({ jti }),
      cache: 'no-store',
    }, 4000);
    if (!res.ok) return 'unavailable';
    const body = (await res.json()) as { first?: unknown; data?: { first?: unknown } };
    const first = body?.first ?? body?.data?.first;
    return first === true ? 'first' : first === false ? 'replayed' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
