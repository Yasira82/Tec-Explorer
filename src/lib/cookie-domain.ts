/**
 * Which `Domain` a session cookie may carry on a given host.
 *
 * A cookie whose `Domain` does not cover the request host is REJECTED by the
 * browser — silently, with no error on either side.
 *
 * One build serves two Pi apps on two hosts: `<app>.tecosystem.app` (the
 * Mainnet app) and `tec-<app>.vercel.app` (the paired Testnet one). With
 * `COOKIE_DOMAIN=.tecosystem.app` every session cookie is dropped on the
 * second, and the app tells a visitor who has just signed in successfully that
 * they are "Unauthorized". `vercel.app` is also on the Public Suffix List, so
 * no wildcard cookie could be set there in any case.
 *
 * Host-only is not a downgrade in that situation. The alternative is not a
 * broader cookie — it is no cookie at all.
 */
export const cookieDomainFor = (host: string, configured?: string): string | undefined => {
  const h = (host ?? '').trim().toLowerCase();
  if (!h || !configured) return undefined;
  const bare = configured.replace(/^\./, '').toLowerCase();
  // The dot is the boundary. A bare `endsWith` would hand a cookie to
  // `nottecosystem.app` — a domain somebody else can register.
  return h === bare || h.endsWith(`.${bare}`) ? configured : undefined;
};
