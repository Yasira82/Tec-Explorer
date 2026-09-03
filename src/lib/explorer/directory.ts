// TEC Explorer — Economic Discovery data model (C-108). Explorer makes the Pi
// economy discoverable: Pi-accepting businesses, services, and opportunities,
// searchable by category, text, and area.
//
// This file is the SHAPE ONLY. The index itself is real and lives in the
// explorer module of `tec-identity-service`; every row on screen arrives from
// it through `lib/explorer/server.ts` → the gateway. Search, ranking, reviews,
// reports and the Zone verification seam are all backend-side.
//
// ── What used to be here, and why it is gone ────────────────────────────────
// A curated `DIRECTORY` fixture with eight businesses, six of them marked
// `verification: 'verified'`, plus a client-side `searchDirectory` over it.
// Nothing in the app had rendered any of it for a long time — only its own
// tests referenced it. Two reasons that mattered more than dead code usually
// does:
//
//   · The backend DELIBERATELY neutered the same fixture (its seed helper now
//     forces UNVERIFIED whatever it is passed) because Explorer PRESENTS
//     verification and never mints it — C-108 §4. Keeping six self-declared
//     "verified" rows here left the exact artefact the service had removed,
//     one import away from being rendered again.
//   · It described the app as a demo over a sample. Read as current state — by
//     a person or by an assistant — that is a false report about a shipped
//     product, and it was believed at least once.
//
// Explorer OWNS the listing index + search/ranking. It does NOT own
// verification (**Zone**, C-120 §3 — via `zone.badge.issued.v1`), trust scores
// (Connection, C-107) or payments (tec-payment-service): those are referenced,
// never re-derived here (C-108 §4).

export type Category =
  | 'food' | 'retail' | 'services' | 'tech' | 'health' | 'education' | 'crafts' | 'opportunities';

// Verification is EARNED via **Zone** — Explorer only presents the badge, it
// never mints it (C-108 §4/§6). 'verified' means Zone issued a badge for this
// business; the backend consumer flips it on `zone.badge.issued.v1` and back on
// `.revoked.v1`.
//
// NOT KYC. KYC verifies a PERSON; a listing is an ENTITY, and entity
// verification is Zone's (C-120 §3). The consumer was wired to `kyc.verified`
// once and it silently matched nothing — the event carries a user, and no
// listing has ever had one.
export type VerificationStatus = 'verified' | 'unverified';

export interface Listing {
  id:          string;
  name:        string;
  category:    Category;
  // Short area label only — Explorer never stores precise/personal location
  // (C-108 §6: location is used for search, never persisted).
  area:        string;
  summary:     string;
  piAccepted: boolean; // required to be indexed
  verification: VerificationStatus;  // from Zone (presented, not minted)
  // Indicative only — the real trust score is owned by Connection (C-107).
  trustHint:   string;
  tags:        string[];
  featured?: boolean; // Explorer Pro — a paid visibility boost
  /**
   * Pi username of whoever self-listed this, when there is one.
   *
   * Never rendered directly. The page shows it only through
   * `resolveOwnerProfile`, which requires that person to have PUBLISHED a
   * Connection profile — listing a shop is not consent to having your personal
   * handle printed beside it (C-107 §4).
   */
  owner?: string;
  /**
   * How a customer actually reaches the business. All optional, all self-declared
   * by the merchant, all public by intent — they publish these to be found.
   *
   * `area` above stays a coarse label for the INDEX (C-108 §6 protects the
   * searcher's location); `address` is the shop's own, which the merchant chose
   * to print. Opposite parties, opposite defaults.
   *
   * ⚠️ `website` reaches an href. Validated to http/https on write, and AGAIN on
   * render (`safeWebsite`) — these rows outlive any one writer, and a
   * `javascript:` URL in a link is stored XSS.
   */
  address?: string;
  hours?:   string;
  phone?:   string;
  website?: string;
  /**
   * Where the shop is, as the merchant published it. A pair or neither — half a
   * coordinate is not a place (the backend enforces this; nothing here should
   * assume it holds for an old row, hence the `mappable` filter before drawing).
   *
   * This is the BUSINESS's location. The searcher's own position is never
   * stored, never sent, and never appears in this type — it lives only in the
   * browser (C-108 §6, src/lib-client/geo.ts).
   */
  lat?: number;
  lng?: number;
  /**
   * Whether this listing has a shop photo, NOT the key.
   *
   * The key is a storage path (`business/<sub>/<uuid>.jpg`). A client has no use
   * for one and every reason not to receive one, so the bytes are served
   * same-origin from `/api/photo/<handle>` and only this boolean crosses.
   */
  hasPhoto?: boolean;
}

/**
 * A merchant-supplied website, or null if it is not safe to put in an href.
 *
 * The backend already validates this on write. This is the SECOND check, and it
 * is not redundant: a listing row is written once and rendered forever, so the
 * guarantee has to hold for rows that predate the validator, rows from a future
 * writer, and rows an operator edited by hand. A `javascript:` or
 * `data:text/html` URL in a link is stored XSS — executed in the browser of
 * everyone who opens that business.
 *
 * Allowlist, never a denylist: a denylist misses the next scheme a browser
 * learns to execute.
 */
export function safeWebsite(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : null;
  } catch {
    // No scheme at all → not a URL we will link to. The backend upgrades a bare
    // domain to https on write; anything still schemeless here is malformed.
    return null;
  }
}

/**
 * A listing with a position that can actually be drawn.
 *
 * ⚠️ THIS LIVES HERE, NOT IN THE MAP COMPONENT, AND THAT IS LOAD-BEARING.
 *
 * `BusinessMap.tsx` is a `'use client'` module. When a SERVER component imports
 * from one, Next replaces every export with a client REFERENCE — a marker, not
 * the function. Calling it on the server throws at request time ("attempted to
 * call mappable() from the server"), and because the business page is
 * force-dynamic there is no prerender to catch it: the build passes and the
 * page 500s in production. That is exactly what happened.
 *
 * A plain module with no client boundary can be called from both sides, which
 * is what a pure filter should be anyway.
 */
export type MappableListing = Listing & { lat: number; lng: number };

/** Listings that can actually be drawn. A pin needs both halves of a pair. */
export const mappable = (ls: Listing[]): MappableListing[] =>
  ls.filter((l): l is MappableListing =>
    typeof l.lat === 'number' && typeof l.lng === 'number'
    && Number.isFinite(l.lat) && Number.isFinite(l.lng));

/** A phone number reduced to what `tel:` accepts. */
export function telHref(raw: string | undefined | null): string | null {
  const v = (raw ?? '').replace(/[^\d+]/g, '');
  return v.length >= 4 ? `tel:${v}` : null;
}

export const CATEGORY_META: Record<Category, { icon: string; label: string }> = {
  food:          { icon: '🍽️', label: 'Food & Drink' },
  retail:        { icon: '🛍️', label: 'Retail' },
  services:      { icon: '🔧', label: 'Services' },
  tech:          { icon: '💻', label: 'Tech' },
  health:        { icon: '🩺', label: 'Health' },
  education:     { icon: '📚', label: 'Education' },
  crafts:        { icon: '🎨', label: 'Crafts' },
  opportunities: { icon: '💼', label: 'Opportunities' },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as Category[];
