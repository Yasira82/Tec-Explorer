import { type Category, type Listing } from './directory';

// Server-only Explorer backend access (C-108). Calls the real Explorer search
// module (identity-service) via the gateway with the inter-service key, and maps
// the backend row to the frontend Listing shape. Real data end-to-end (C-135 §4):
// an unreachable backend resolves to `unavailable` (no listing) — it never shows a
// fabricated business from a curated directory. NEW-A: the gateway URL is
// server-only (API_GATEWAY_URL) — never shipped to the client.
const GW = process.env.API_GATEWAY_URL ?? '';

const gwHeaders = () => ({
  'Content-Type': 'application/json',
  'x-request-id': crypto.randomUUID(),
  ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
});

// backend (explorer_businesses) → frontend Listing
export function listingFromBackend(b: Record<string, unknown>): Listing {
  return {
    id:           String(b.handle ?? ''),
    name:         String(b.name ?? ''),
    category:     String(b.category ?? '').toLowerCase() as Category,
    area:         String(b.area ?? ''),
    summary:      String(b.summary ?? ''),
    piAccepted:   Boolean(b.pi_accepted ?? true),
    verification: String(b.verification ?? '').toLowerCase() === 'verified' ? 'verified' : 'unverified',
    trustHint:    String(b.trust_hint ?? ''),
    tags:         Array.isArray(b.tags) ? (b.tags as string[]) : [],
    featured:     Boolean(b.featured),
    // Carried through so the page can offer TEC Connect. It is NOT rendered on
    // its own: `resolveOwnerProfile` gates it on the person having PUBLISHED a
    // Connection profile, because listing a shop is not consent to having your
    // personal handle printed beside it (C-107 §4).
    owner:        b.owner ? String(b.owner) : undefined,
    // Contact details, carried as-is. `website` is NOT trusted here even though
    // the backend validates it on write — the render site checks again
    // (safeWebsite), because these rows outlive any one writer.
    address:      b.address ? String(b.address) : undefined,
    hours:        b.hours   ? String(b.hours)   : undefined,
    phone:        b.phone   ? String(b.phone)   : undefined,
    website:      b.website ? String(b.website) : undefined,
    // Map position, as published by the merchant. Coerced through Number and
    // dropped unless BOTH are finite — a lone latitude would draw a pin in the
    // wrong country, so a half-pair is treated as no pin at all.
    ...(Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lng))
      ? { lat: Number(b.lat), lng: Number(b.lng) }
      : {}),
  };
}

export interface ResolvedBusiness {
  listing: Listing | null;
  source:  'live' | 'unavailable';
}

// One business by handle from the live backend. A live 404 is authoritative
// (listing: null, source: 'live' → "not found"); an unreachable backend resolves
// to (listing: null, source: 'unavailable' → "couldn't load"). Never a fabricated
// listing from a curated directory (C-135 §4).
export async function resolveBusiness(id: string): Promise<ResolvedBusiness> {
  if (GW) {
    try {
      const res = await fetch(`${GW}/api/identity/explorer/business/${encodeURIComponent(id)}`, {
        headers: gwHeaders(), cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const b = data?.data?.business;
        if (b) return { listing: listingFromBackend(b as Record<string, unknown>), source: 'live' };
      }
      if (res.status === 404) return { listing: null, source: 'live' };
    } catch { /* unreachable → unavailable below */ }
  }
  return { listing: null, source: 'unavailable' };
}

// ── WRITE PATH — self-listing (C-108) ─────────────────────────────────────────
// A business owner self-lists their business into the discovery index and edits it.
// Writes forward the caller's verified JWT as `Authorization: Bearer` so the backend
// derives the owner from the token (never the body — P6). Explorer never self-mints
// verification; a new listing is always UNVERIFIED (KYC's to set). Ranking stays
// Analytics' job. Reads of discovery stay public.
const authHeaders = (token: string): Record<string, string> => ({
  ...gwHeaders(),
  Authorization: `Bearer ${token}`,
});

export interface ListingWriteResult {
  ok: boolean;
  status: number;
  listing?: Listing;
  error?: string;
}

async function writeCall(
  path: string, token: string, method: 'POST' | 'PATCH', body: unknown,
): Promise<ListingWriteResult> {
  if (!GW) return { ok: false, status: 503, error: 'Gateway not configured' };
  try {
    const res = await fetch(`${GW}${path}`, {
      method, headers: authHeaders(token), body: JSON.stringify(body), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.data?.business) {
      return { ok: true, status: res.status, listing: listingFromBackend(data.data.business) };
    }
    return { ok: false, status: res.status, error: String(data?.message ?? data?.error ?? 'Request failed') };
  } catch (err) {
    return { ok: false, status: 503, error: (err as Error).message };
  }
}

/** The caller's OWN listings (identity from the forwarded JWT, P6). */
export async function listOwnListings(token: string): Promise<{ ok: boolean; status: number; listings: Listing[]; error?: string }> {
  if (!GW) return { ok: false, status: 503, listings: [], error: 'Gateway not configured' };
  try {
    const res = await fetch(`${GW}/api/identity/explorer/my/listings`, {
      headers: authHeaders(token), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const rows = (data?.data?.listings ?? []) as Record<string, unknown>[];
      return { ok: true, status: res.status, listings: rows.map(listingFromBackend) };
    }
    return { ok: false, status: res.status, listings: [], error: String(data?.message ?? data?.error ?? 'Request failed') };
  } catch (err) {
    return { ok: false, status: 503, listings: [], error: (err as Error).message };
  }
}

/** Self-list a business (starts UNVERIFIED — never self-minted, C-108 §4). */
export const createListingBackend = (
  token: string,
  body: {
    name: string; category: string; area: string; summary: string; tags?: string[];
    address?: string; hours?: string; phone?: string; website?: string;
    lat?: number | null; lng?: number | null;
  },
) => writeCall('/api/identity/explorer/business', token, 'POST', body);

/** Edit the caller's OWN listing (owner-scope enforced by the backend, P6). */
export const updateListingBackend = (
  token: string, handle: string,
  body: {
    name?: string; category?: string; area?: string; summary?: string;
    tags?: string[]; pi_accepted?: boolean;
    address?: string; hours?: string; phone?: string; website?: string;
    lat?: number | null; lng?: number | null;
  },
) => writeCall(`/api/identity/explorer/business/${encodeURIComponent(handle)}`, token, 'PATCH', body);

// ── Explorer Pro → FEATURED sync (C-108 §7) ───────────────────────────────────
// Explorer never sells Pro nor stores subscription truth (P5/C-47). The subscription
// is commerce-owned; we READ the caller's live status and tell Explorer to set/clear
// `featured` on their listing so the paid visibility boost reflects the real plan.

/** The caller's live subscription (Pro?) + period end — read from commerce (the owner). */
export async function resolveProStatus(token: string): Promise<{ isPro: boolean; untilIso?: string }> {
  if (!GW) return { isPro: false };
  try {
    const res = await fetch(`${GW}/api/commerce/subscriptions/status`, {
      headers: authHeaders(token), cache: 'no-store',
    });
    if (!res.ok) return { isPro: false };
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const root = (d.data ?? d) as Record<string, unknown>;
    // commerce returns { data: { subscription: {...} } } — unwrap the subscription
    // (a flat shape is also tolerated). Missing this returned FREE for real Pro users.
    const s = ((root.subscription ?? root) ?? {}) as Record<string, unknown>;
    const plan = String(s.plan ?? s.tier ?? '').toUpperCase();
    const active   = s.isActive === true || s.active === true || (plan !== '' && plan !== 'FREE');
    const expired  = s.isExpired === true;
    const end      = s.current_period_end ?? s.currentPeriodEnd ?? s.expires_at;
    const notExpired = !expired && (!end || new Date(String(end)).getTime() > Date.now());
    const isPro = active && notExpired && plan !== 'FREE' && plan !== '';
    return { isPro, untilIso: end ? String(end) : undefined };
  } catch { return { isPro: false }; }
}

/** Set/clear the caller's FEATURED placement to match their live Pro status. Fail-safe. */
export async function syncFeatured(token: string, featured: boolean, untilIso?: string): Promise<boolean> {
  if (!GW) return false;
  try {
    const res = await fetch(`${GW}/api/identity/explorer/featured`, {
      method: 'PATCH', headers: authHeaders(token),
      body: JSON.stringify({ featured, untilIso: featured ? untilIso : undefined }),
      cache: 'no-store',
    });
    return res.ok;
  } catch { return false; }
}

// ── TEC Connect (C-107 §14.3) — the person behind a listing ─────────────────
//
// The Follow button in Explorer talks to Explorer's OWN BFF, which talks to the
// gateway from the server. It must NEVER be a browser call to
// connection.tecosystem.app: that is a different origin, so it is a third-party
// credentialed request — the exact case C-123 documents Pi Browser breaking
// (Partitioned cookies; Set-Cookie dropped on XHR and on 3xx). Built that way it
// works in Chrome and fails in Pi Browser, which is the worst kind of failure
// because it passes every test.

/** What Explorer may say about the person who listed a business. */
export interface OwnerProfile {
  username: string;
  headline: string;
  verified: boolean;
}

/**
 * The owner of a listing, but ONLY when that person has PUBLISHED a Connection
 * profile.
 *
 * A Pi username is a personal identifier. Someone who self-listed a shop agreed
 * to list the shop — they did not agree to have their handle printed on a public
 * page beside it. Publishing a Connection profile IS the opt-in to being
 * discoverable as a person (C-107 §4, sovereignty), so that is the gate: no
 * published profile → no handle, no Follow button, nothing.
 *
 * Returns null on ANY doubt — no owner recorded, no published profile, an
 * unreachable backend. Fail closed (P6): the page simply does not offer to
 * follow anyone.
 */
export async function resolveOwnerProfile(owner: string | null | undefined): Promise<OwnerProfile | null> {
  const handle = (owner ?? '').trim().replace(/^@+/, '');
  if (!GW || !handle) return null;
  try {
    const res = await fetch(
      `${GW}/api/identity/connection/profile/${encodeURIComponent(handle)}`,
      { headers: gwHeaders(), cache: 'no-store' },
    );
    // 404 is the published-profile gate answering "no". It is the expected
    // answer for most listings, not an error.
    if (!res.ok) return null;
    const p = (await res.json().catch(() => ({})))?.data?.profile;
    if (!p?.username) return null;
    return {
      username: String(p.username),
      headline: String(p.headline ?? ''),
      verified: Boolean(p.verified ?? false),
    };
  } catch {
    return null;
  }
}
