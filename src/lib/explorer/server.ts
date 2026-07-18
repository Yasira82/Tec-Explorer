import { getListing, type Category, type Listing } from './directory';

// Server-only Explorer backend access (C-108). Calls the real Explorer search
// module (identity-service) via the gateway with the inter-service key, and maps
// the backend row to the frontend Listing shape. Everything here degrades to the
// curated static directory so the app is never blank / never 500s. NEW-A: the
// gateway URL is server-only (API_GATEWAY_URL) — never shipped to the client.
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
  };
}

export interface ResolvedBusiness {
  listing: Listing | null;
  source:  'live' | 'sample';
}

// One business by handle — live backend first, curated sample as fallback. A live
// 404 is authoritative (listing: null, source: 'live'); an unreachable backend
// falls back to the sample directory (source: 'sample').
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
    } catch { /* fall through to the curated static directory */ }
  }
  return { listing: getListing(id), source: 'sample' };
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
  token: string, body: { name: string; category: string; area: string; summary: string; tags?: string[] },
) => writeCall('/api/identity/explorer/business', token, 'POST', body);

/** Edit the caller's OWN listing (owner-scope enforced by the backend, P6). */
export const updateListingBackend = (
  token: string, handle: string,
  body: { name?: string; category?: string; area?: string; summary?: string; tags?: string[]; pi_accepted?: boolean },
) => writeCall(`/api/identity/explorer/business/${encodeURIComponent(handle)}`, token, 'PATCH', body);
