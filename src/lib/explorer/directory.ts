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
  piAccepted:  boolean;              // required to be indexed (C-108 §5)
  verification: VerificationStatus;  // from tec-kyc-service (presented, not minted)
  // Indicative only — the real trust score is owned by Connection (C-107).
  trustHint:   string;
  tags:        string[];
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
