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
