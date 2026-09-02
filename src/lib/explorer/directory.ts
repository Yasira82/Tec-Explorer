// TEC Explorer — Economic Discovery data model (C-108). Explorer makes the Pi
// economy discoverable: Pi-accepting businesses, services, and opportunities,
// searchable by category, text, and area. This is a curated READ-ONLY sample
// directory — a demo of the discovery surface. Explorer OWNS the listing index +
// search/ranking; it does NOT own verification (tec-kyc-service), trust scores
// (Connection, C-107), or payments (tec-payment-service) — those are referenced,
// never re-derived here (C-108 §4).

export type Category =
  | 'food' | 'retail' | 'services' | 'tech' | 'health' | 'education' | 'crafts' | 'opportunities';

// Verification is EARNED via tec-kyc-service — Explorer only presents the badge,
// it never mints it (C-108 §4/§6). 'verified' here means "KYC-verified business".
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
  verification: VerificationStatus;  // from tec-kyc-service (presented, not minted)
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

// Curated sample directory (demo). Read-only — a real index lives in
// tec-identity-service business profiles + a search backend (C-108 §5, Phase 1+).
export const DIRECTORY: Listing[] = [
  {
    id: 'olive-branch-cafe', name: 'Olive Branch Café', category: 'food', area: 'City Center',
    summary: 'Specialty coffee and brunch — pay in Pi at the counter.',
    piAccepted: true, verification: 'verified', trustHint: 'Trusted by many (Connection)',
    tags: ['coffee', 'brunch', 'wifi'],
  },
  {
    id: 'pixel-forge-studio', name: 'Pixel Forge Studio', category: 'tech', area: 'Remote',
    summary: 'Web & Pi-app development studio accepting Pi for project work.',
    piAccepted: true, verification: 'verified', trustHint: 'Trusted (Connection)',
    tags: ['development', 'pi-apps', 'design'],
  },
  {
    id: 'green-thumb-grocer', name: 'Green Thumb Grocer', category: 'retail', area: 'North District',
    summary: 'Local organic grocery. Pi accepted in-store and for delivery.',
    piAccepted: true, verification: 'verified', trustHint: 'Established seller',
    tags: ['grocery', 'organic', 'delivery'],
  },
  {
    id: 'swift-fix-repairs', name: 'Swift Fix Repairs', category: 'services', area: 'East Side',
    summary: 'Phone & laptop repair. Pi accepted; quote before work.',
    piAccepted: true, verification: 'unverified', trustHint: 'New — verification pending',
    tags: ['repair', 'electronics'],
  },
  {
    id: 'lumen-tutoring', name: 'Lumen Tutoring', category: 'education', area: 'Remote',
    summary: 'Maths & coding tutoring, priced in Pi per session.',
    piAccepted: true, verification: 'verified', trustHint: 'Trusted (Connection)',
    tags: ['tutoring', 'coding', 'maths'],
  },
  {
    id: 'harbor-wellness', name: 'Harbor Wellness', category: 'health', area: 'Coast Road',
    summary: 'Physiotherapy & wellness clinic accepting Pi for consultations.',
    piAccepted: true, verification: 'verified', trustHint: 'Verified business',
    tags: ['wellness', 'physio', 'consult'],
  },
  {
    id: 'artisan-clay-co', name: 'Artisan Clay Co.', category: 'crafts', area: 'Old Town',
    summary: 'Handmade ceramics & workshops. Pay in Pi for pieces or classes.',
    piAccepted: true, verification: 'unverified', trustHint: 'New listing',
    tags: ['ceramics', 'handmade', 'workshops'],
  },
  {
    id: 'pi-merchant-onboarding', name: 'Pi Merchant Onboarding (Part-time)', category: 'opportunities', area: 'Remote',
    summary: 'Help local shops accept Pi. Paid in Pi per onboarded merchant.',
    piAccepted: true, verification: 'verified', trustHint: 'Posted by a verified org',
    tags: ['job', 'onboarding', 'part-time'],
  },
];

export const getListing = (id: string): Listing | null =>
  DIRECTORY.find((l) => l.id === id) ?? null;

// ── Search / ranking (C-108 §5) ─────────────────────────────────────────────
// Client-side demo of the discovery pipeline: category filter → text/area match
// → rank (Pi-accepted + verified first — the "trust boost" that Connection will
// power in Phase 2). Deterministic + pure so it is unit-testable.
export interface SearchParams {
  query?:    string;
  category?: Category | 'all';
  area?:     string;
}

const norm = (s: string) => s.trim().toLowerCase();

export const searchDirectory = (params: SearchParams, source: Listing[] = DIRECTORY): Listing[] => {
  const q    = norm(params.query ?? '');
  const area = norm(params.area ?? '');
  const cat  = params.category && params.category !== 'all' ? params.category : null;

  const matches = source.filter((l) => {
    if (cat && l.category !== cat) return false;
    if (area && !norm(l.area).includes(area)) return false;
    if (!q) return true;
    const hay = [l.name, l.summary, l.area, ...l.tags, CATEGORY_META[l.category].label].map(norm).join(' ');
    return hay.includes(q);
  });

  // Rank: verified before unverified, then Pi-accepted, then name — a stable,
  // trust-weighted order (Connection trust scores refine this in Phase 2, C-108 §10).
  const score = (l: Listing) => (l.verification === 'verified' ? 2 : 0) + (l.piAccepted ? 1 : 0);
  return [...matches].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
};
