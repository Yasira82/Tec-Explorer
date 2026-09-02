import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/observability/reportError';
import { CATEGORIES, type Category } from '@/lib/explorer/directory';
import { listingFromBackend } from '@/lib/explorer/server';

// GET /api/bff/explorer/search?q=&category=&area= — discovery search (C-108 §5).
// Server-only: calls the real Explorer backend (search module in identity-service)
// via the gateway. Discovery is PUBLIC (public business info only, C-108 §5/§6),
// so no auth is required — only the inter-service key. Real data end-to-end: if the
// backend is unreachable it returns `source:'unavailable'` with NO results — it
// never fabricates a curated directory on screen (C-135 §4 Professional Bar). The
// client renders an honest empty/error state instead. NEW-A: the gateway URL is
// server-only (API_GATEWAY_URL), never shipped to the client.
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
          const results = rows.map(listingFromBackend);   // may be empty — that's honest
          return NextResponse.json(
            { source: 'live', results, count: results.length },
            { headers: { 'Cache-Control': 'public, max-age=60' } },
          );
        }
      }
    } catch (err) {
    // The screen still falls through to an honest "unavailable" with a retry.
    // This is the other half: search breaking for everyone must not be
    // something we learn from a screenshot (C-96).
    reportError(err, { where: 'bff/explorer/search' });
  }
  }

  // Backend unreachable/unset — never fabricate a directory on screen (C-135 §4).
  return NextResponse.json(
    { source: 'unavailable', results: [], count: 0 },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
