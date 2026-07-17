import { NextRequest, NextResponse } from 'next/server';
import { searchDirectory, CATEGORIES, type Category } from '@/lib/explorer/directory';
import { listingFromBackend } from '@/lib/explorer/server';

// GET /api/bff/explorer/search?q=&category=&area= — discovery search (C-108 §5).
// Server-only: calls the real Explorer backend (search module in identity-service)
// via the gateway. Discovery is PUBLIC (public business info only, C-108 §5/§6),
// so no auth is required — only the inter-service key. Falls back to the curated
// static directory (ranked locally) if the backend is unreachable, so discovery is
// never blank. NEW-A: the gateway URL is server-only (API_GATEWAY_URL), never shipped.
const GW = process.env.API_GATEWAY_URL ?? '';

const gwHeaders = () => ({
  'Content-Type': 'application/json',
  'x-request-id': crypto.randomUUID(),
  ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
});

export async function GET(req: NextRequest) {
  const sp   = req.nextUrl.searchParams;
  const q    = sp.get('q') ?? '';
  const area = sp.get('area') ?? '';
  const raw  = sp.get('category') ?? 'all';
  const category = (CATEGORIES as string[]).includes(raw) ? (raw as Category) : 'all';

  if (GW) {
    try {
      const qs = new URLSearchParams();
      if (q.trim())          qs.set('q', q.trim());
      if (category !== 'all') qs.set('category', category);
      if (area.trim())       qs.set('area', area.trim());
      const res = await fetch(`${GW}/api/identity/explorer/search?${qs.toString()}`, {
        headers: gwHeaders(), cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const rows = (data?.data?.results ?? []) as Record<string, unknown>[];
        if (Array.isArray(rows)) {
          const results = rows.map(listingFromBackend);
          return NextResponse.json(
            { source: 'live', results, count: results.length },
            { headers: { 'Cache-Control': 'public, max-age=60' } },
          );
        }
      }
    } catch { /* fall through to the curated static directory */ }
  }

  const results = searchDirectory({ query: q, category, area });
  return NextResponse.json(
    { source: 'sample', results, count: results.length },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
