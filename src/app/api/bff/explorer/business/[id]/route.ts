import { NextRequest, NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/explorer/directory';
import { resolveBusiness, updateListingBackend } from '@/lib/explorer/server';

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

// PATCH /api/bff/explorer/business/:id — edit your OWN listing (C-108). The JWT is
// forwarded; the backend enforces owner-scope (P6) and never lets verification be
// self-set (KYC-owned). CSRF is enforced ONCE in middleware — not here.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body?.category !== undefined && !(CATEGORIES as string[]).includes(String(body.category).toLowerCase())) {
    return NextResponse.json({ error: 'invalid category' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body?.name !== undefined)        patch.name = String(body.name);
  if (body?.category !== undefined)    patch.category = String(body.category).toLowerCase();
  if (body?.area !== undefined)        patch.area = String(body.area);
  if (body?.summary !== undefined)     patch.summary = String(body.summary);
  if (body?.pi_accepted !== undefined) patch.pi_accepted = Boolean(body.pi_accepted);
  if (Array.isArray(body?.tags))       patch.tags = (body.tags as unknown[]).map(String);
  // Contact fields. Forwarded raw and normalized ONCE, in the backend service —
  // a second opinion here is how create and edit start disagreeing about what a
  // valid website is. The `!== undefined` test is load-bearing: it preserves the
  // difference between "cleared" ('') and "not sent", so editing one field
  // cannot wipe another.
  if (body?.address !== undefined)     patch.address = String(body.address);
  if (body?.hours   !== undefined)     patch.hours   = String(body.hours);
  if (body?.phone   !== undefined)     patch.phone   = String(body.phone);
  if (body?.website !== undefined)     patch.website = String(body.website);

  const r = await updateListingBackend(token, id, patch);
  if (r.ok) return NextResponse.json({ business: r.listing });
  return NextResponse.json({ error: r.error }, { status: r.status || 502 });
}
