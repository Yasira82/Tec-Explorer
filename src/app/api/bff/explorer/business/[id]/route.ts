import { NextRequest, NextResponse } from 'next/server';
import { resolveBusiness } from '@/lib/explorer/server';

// GET /api/bff/explorer/business/:id — one business listing (C-108).
// Server-only: resolves via the real Explorer backend (search module in
// identity-service) through the gateway, falling back to the curated static
// directory. Public read (public business info only, C-108 §5/§6) — no auth.
// Fails closed on a missing record → 404, never a throw.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { listing, source } = await resolveBusiness(id);

  if (!listing) {
    return NextResponse.json(
      { id, found: false, source },
      { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  }
  return NextResponse.json(
    { found: true, source, business: listing },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
