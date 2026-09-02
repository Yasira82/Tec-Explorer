import { NextRequest, NextResponse } from 'next/server';

// Reviews on a business listing (C-108), proxied through this app's own BFF.
//
// Reads are PUBLIC and forward no token — a listing is public and so is what
// people said about it. Writes forward the caller's JWT so the backend derives
// the author from the session and never from the body (P6).
//
// NEW-A: the gateway URL is server-only and never reaches the client.
export const dynamic = 'force-dynamic';

const GW = process.env.API_GATEWAY_URL ?? '';

const headers = (token?: string) => ({
  'Content-Type': 'application/json',
  'x-request-id': crypto.randomUUID(),
  ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
  ...(token && { Authorization: `Bearer ${token}` }),
});

const path = (handle: string) =>
  `${GW}/api/identity/explorer/business/${encodeURIComponent(handle)}/reviews`;

/** The handle to act on, from the query string. Reviews are per-business. */
const handleOf = (req: NextRequest) => (req.nextUrl.searchParams.get('handle') ?? '').trim();

export async function GET(req: NextRequest) {
  const handle = handleOf(req);
  // An empty list, not an error: the business page renders fine with no reviews,
  // and a 4xx here would turn a cosmetic gap into a broken section (P6 applies
  // to permission, not to an absent optional read).
  const empty = { reviews: [], summary: { count: 0, average: null, verifiedCount: 0 } };
  if (!GW || !handle) return NextResponse.json(empty);
  try {
    const res = await fetch(path(handle), { headers: headers(), cache: 'no-store' });
    if (!res.ok) return NextResponse.json(empty);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      reviews: data?.data?.reviews ?? [],
      summary: data?.data?.summary ?? empty.summary,
    });
  } catch { return NextResponse.json(empty); }
}

export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const token = req.cookies.get('tec_access_token')?.value ?? '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const handle = handleOf(req);
  if (!handle) return NextResponse.json({ error: 'handle is required' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(path(handle), {
      method: 'POST', headers: headers(token), cache: 'no-store',
      body: JSON.stringify({ rating: Number(body?.rating), body: String(body?.body ?? '') }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: String(data?.message ?? data?.error ?? 'Could not save your review.') },
        { status: res.status },
      );
    }
    return NextResponse.json({ review: data?.data?.review });
  } catch { return NextResponse.json({ error: 'Network error' }, { status: 502 }); }
}

export async function DELETE(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const token = req.cookies.get('tec_access_token')?.value ?? '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const handle = handleOf(req);
  if (!handle) return NextResponse.json({ error: 'handle is required' }, { status: 400 });
  try {
    const res = await fetch(path(handle), { method: 'DELETE', headers: headers(token), cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: 'Could not remove your review.' }, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Network error' }, { status: 502 }); }
}
