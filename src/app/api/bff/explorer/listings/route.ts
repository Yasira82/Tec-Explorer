import { NextRequest, NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/explorer/directory';
import {
  listOwnListings, createListingBackend, resolveProStatus, syncFeatured,
} from '@/lib/explorer/server';

// TEC Explorer — self-listing (C-108).
//   GET  → the caller's OWN listings (identity from the session JWT, P6).
//   POST → self-list a business. Starts UNVERIFIED (never self-minted, C-108 §4);
//          the JWT is forwarded and the backend derives the owner from the token,
//          never the request body.
// CSRF is enforced ONCE in middleware — do NOT re-check it here (KB C-12 §11).

export async function GET(req: NextRequest) {
  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const r = await listOwnListings(token);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 502 });

  // Re-sync FEATURED to the owner's LIVE Pro status on each visit (C-108 §7): Pro →
  // featured, lapsed Pro → cleared. Explorer never stores subscription truth (P5) — it
  // reads commerce and reflects it. Fail-safe: a sync failure never blocks the listing.
  const { isPro, untilIso } = await resolveProStatus(token);
  const first = r.listings[0];
  if (first && first.featured !== isPro) {
    const ok = await syncFeatured(token, isPro, untilIso);
    if (ok) r.listings = r.listings.map((l) => ({ ...l, featured: isPro }));
  }
  return NextResponse.json({ listings: r.listings, isPro });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name    = String(body?.name ?? '').trim();
  const area    = String(body?.area ?? '').trim();
  const summary = String(body?.summary ?? '').trim();
  const category = String(body?.category ?? '').toLowerCase();
  if (name.length < 2)    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (area.length < 2)    return NextResponse.json({ error: 'area is required' }, { status: 400 });
  if (summary.length < 2) return NextResponse.json({ error: 'summary is required' }, { status: 400 });
  if (!(CATEGORIES as string[]).includes(category)) return NextResponse.json({ error: 'invalid category' }, { status: 400 });

  const tags = Array.isArray(body?.tags) ? (body.tags as unknown[]).map(String) : undefined;
  // Contact fields are optional and normalized in the backend service (one
  // place, so create and edit cannot drift on what a valid website is).
  const optional = (v: unknown) => (v === undefined ? undefined : String(v));
  const r = await createListingBackend(token, {
    name, category, area, summary, tags,
    address: optional(body?.address), hours: optional(body?.hours),
    phone:   optional(body?.phone),   website: optional(body?.website),
  });
  if (r.ok) return NextResponse.json({ listing: r.listing }, { status: 201 });
  return NextResponse.json({ error: r.error }, { status: r.status || 502 });
}
