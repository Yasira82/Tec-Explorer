import { NextRequest, NextResponse } from 'next/server';
import { searchDirectory, CATEGORIES, type Category } from '@/lib/explorer/directory';

// GET /api/bff/explorer/search?q=&category=&area= — discovery search (C-108 §5).
// Explorer OWNS the listing index + search/ranking. This V1 ranks a curated
// read-only SAMPLE directory server-side (source:'sample'); when a real index
// exists (tec-identity-service business profiles + a search backend, C-108 §5),
// this route proxies it and returns source:'live' with the same shape. No
// personal data, no location stored (C-108 §6) — public business info only.
export async function GET(req: NextRequest) {
  const sp   = req.nextUrl.searchParams;
  const q    = sp.get('q') ?? '';
  const area = sp.get('area') ?? '';
  const raw  = sp.get('category') ?? 'all';
  const category = (CATEGORIES as string[]).includes(raw) ? (raw as Category) : 'all';

  const results = searchDirectory({ query: q, category, area });

  return NextResponse.json(
    { source: 'sample', results, count: results.length },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
