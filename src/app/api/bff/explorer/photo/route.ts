import { NextRequest, NextResponse } from 'next/server';
import { PHOTO_FOLDER, PHOTO_MAX_BYTES, isAllowedPhoto } from '@/lib/explorer/photo-rules';
import { listOwnListings, updateListingBackend } from '@/lib/explorer/server';

// POST /api/bff/explorer/photo — upload a shop photo, whole thing server-side.
//
// ── Why the bytes come through here instead of browser→R2 ────────────────────
// A presigned URL lets a BROWSER write to R2 only if the bucket carries a CORS
// policy allowing PUT from this origin. It does not. Every direct upload failed
// with an opaque "Network error", because a blocked cross-origin request is
// indistinguishable from a dead network — the browser refuses it before it is
// sent. Connection learned this the expensive way (tec-core-backend #237); this
// route is that lesson applied rather than repeated.
//
// The browser POSTs to its own origin, so no CORS is involved at all, and this
// route — which has no browser security model — does the presign and the PUT.
//
// The cost is real and bounded: the image passes through a serverless function.
// Vercel's request body limit is 4.5MB, so the 4MB cap has headroom.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GW = process.env.API_GATEWAY_URL ?? '';

export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const token = req.cookies.get('tec_access_token')?.value ?? '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mimeType = (req.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  const bytes    = await req.arrayBuffer().catch(() => null);
  if (!bytes) return NextResponse.json({ error: 'INVALID_FILE' }, { status: 400 });

  // The declared type is the request's own Content-Type and the size is the
  // ACTUAL byte length — never a number the client claimed.
  if (!isAllowedPhoto(mimeType, bytes.byteLength)) {
    return NextResponse.json({
      error: 'INVALID_FILE',
      message: `Use a JPEG, PNG or WebP image under ${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)}MB.`,
    }, { status: 400 });
  }

  // WHICH listing to attach to.
  //
  // The caller names it — an owner may have several businesses now, and picking
  // `listings[0]` would silently put shop B's photo on shop A. But the name is
  // only a SELECTOR: it is matched against the caller's OWN listings, fetched
  // with their token, so a handle that is not theirs simply is not found (P6).
  // Ownership is never taken on trust from the request.
  const own = await listOwnListings(token);
  const wanted = req.nextUrl.searchParams.get('handle');
  const listing = wanted
    ? own.listings.find((l) => l.id === wanted)
    : own.listings[0];

  if (!listing) {
    return NextResponse.json({
      error: 'NO_LISTING',
      message: wanted
        // Not "forbidden": to this caller a listing they do not own and one that
        // does not exist are the same thing, and saying which would confirm the
        // existence of someone else's row.
        ? 'That listing is not yours.'
        : 'Create your listing first, then add a photo.',
    }, { status: 400 });
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const headers = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
    'x-request-id': crypto.randomUUID(),
    ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
  };

  try {
    // 1. Presign. The uploader's identity is never sent — storage derives it from
    //    the session token and embeds it in the key, which is exactly what makes
    //    ownership provable when the key is attached below.
    const signRes = await fetch(`${GW}/api/storage/upload-url`, {
      method: 'POST', headers, cache: 'no-store',
      body: JSON.stringify({
        filename: `shop.${ext}`, mimeType, size: bytes.byteLength, folder: PHOTO_FOLDER,
      }),
    });
    const signed = await signRes.json().catch(() => ({}));
    const { uploadUrl, key } = signed?.data ?? {};
    if (!signRes.ok || !uploadUrl || !key) {
      return NextResponse.json({ error: 'UPLOAD_FAILED', step: 'sign' }, { status: 502 });
    }

    // 2. PUT the bytes. Content-Type must match what the URL was signed for or
    //    R2 rejects the signature.
    const put = await fetch(uploadUrl, {
      method: 'PUT', body: bytes, headers: { 'Content-Type': mimeType },
    });
    if (!put.ok) return NextResponse.json({ error: 'UPLOAD_FAILED', step: 'put' }, { status: 502 });

    // 3. Attach. Only `photo_key` is sent: the listing PATCH is a real patch (it
    //    touches only the fields present), so unlike Connection's profile PUT
    //    there is no read-modify-write needed and no risk of erasing the rest.
    const attached = await updateListingBackend(token, listing.id, { photo_key: key });
    if (!attached.ok) return NextResponse.json({ error: 'UPLOAD_FAILED', step: 'attach' }, { status: 502 });

    return NextResponse.json({ ok: true, listing: attached.listing });
  } catch {
    return NextResponse.json({ error: 'UPLOAD_FAILED', step: 'network' }, { status: 502 });
  }
}

/** DELETE /api/bff/explorer/photo — remove your own shop photo. */
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get('tec_access_token')?.value ?? '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Same rule as the upload: the handle selects, the session authorises.
  const own = await listOwnListings(token);
  const wanted = req.nextUrl.searchParams.get('handle');
  const listing = wanted
    ? own.listings.find((l) => l.id === wanted)
    : own.listings[0];
  if (!listing) return NextResponse.json({ error: 'NO_LISTING' }, { status: 400 });

  // null, not '' — null is the backend's "remove it" and the whole point of the
  // tri-state. Sending nothing at all would leave the photo in place.
  const r = await updateListingBackend(token, listing.id, { photo_key: null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 502 });
  return NextResponse.json({ ok: true, listing: r.listing });
}
