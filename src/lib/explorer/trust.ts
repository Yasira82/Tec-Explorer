import type { Listing } from './directory';

/**
 * How much is actually known about a listing — as a LADDER, not a yes/no.
 *
 * ── Why this replaced "Verified / Unverified" ───────────────────────────────
 * Every real merchant was labelled **Unverified**, because the only route to
 * the other value ran through a Zone review that (a) is a manual queue and
 * (b) is not reachable end-to-end today. So the app told every honest business
 * it was unverified, and told every customer the whole directory was dubious.
 * A badge with one attainable value is not a badge, it is a warning printed on
 * everything.
 *
 * Two labels also forced a false choice. "Verified" is a strong claim about a
 * BUSINESS — that someone checked it exists and is what it says. "Unverified"
 * reads as "we have doubts". Neither describes the true situation, which is:
 * a real Pi account, one that holds a Mainnet wallet, put this here.
 *
 * ── What each level actually asserts ────────────────────────────────────────
 *   L1  Self-listed. Nobody stands behind it. In practice only legacy rows with
 *       no owner — nothing a person can create today lands here.
 *   L2  A Pi account listed this. Not nothing: creating a listing requires a
 *       verified Hub session, and a Pi account that can hold a Mainnet wallet
 *       has passed Pi Network's OWN KYC. The person is real. The BUSINESS is
 *       still self-declared.
 *   L3  The business itself was reviewed by **Zone** (C-120 §3), which reaches
 *       here as `zone.badge.issued.v1`. The strong claim, and the only one that
 *       survives a customer walking to the address.
 *
 * L2 and L3 answer different questions, which is why both exist: Pi's KYC says
 * the PERSON is real; Zone's badge says the BUSINESS is. Neither substitutes for
 * the other, and the ladder is the only honest way to show that.
 *
 * ── The line this must not cross (C-108 §4) ─────────────────────────────────
 * Explorer PRESENTS verification and never mints it. L2 is not Explorer
 * verifying anything — it is Explorer stating a fact it already holds: this row
 * has an `owner`, set server-side from a verified session token, never from a
 * request body. L3 is the only level Explorer cannot award itself, and it still
 * arrives from Zone.
 *
 * Deriving this instead of storing it is deliberate: a stored trust column can
 * drift from the facts, and there is no migration to get wrong.
 */
export type TrustLevel = 1 | 2 | 3;

export function trustLevel(l: Pick<Listing, 'verification' | 'owner'>): TrustLevel {
  if (l.verification === 'verified') return 3;
  // An owner is a Pi username resolved from the JWT at write time. Its presence
  // is the whole evidence for L2 — and its absence is why the seeded rows, which
  // had no owner, could never have been dressed up as one.
  return l.owner ? 2 : 1;
}

/** The i18n key for each level's short chip. */
export const TRUST_TAG = { 1: 'trustL1', 2: 'trustL2', 3: 'trustL3' } as const;
/** The i18n key for each level's one-line explanation. */
export const TRUST_BODY = { 1: 'trustL1Body', 2: 'trustL2Body', 3: 'trustL3Body' } as const;
