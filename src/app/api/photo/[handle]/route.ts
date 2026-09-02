import { NextRequest, NextResponse } from 'next/server';
import { resolvePhotoBytes } from '@/lib/explorer/photo';

// GET /api/photo/<handle> — a shop photo, served same-origin.
//
// Public and session-free by design: this is what an <img> on the directory and
// on a shared business link points at, and both are reachable without signing
// in. The storage bucket is private, so the bytes are fetched server-side (see
// src/lib/explorer/photo.ts) and streamed from here.
//
// 404 rather than a placeholder when there is no photo: the caller renders the
// listing without an image, and an endpoint that invented one would make "no
// photo" indistinguishable from "photo failed to load".
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ handle: string }> },
) {
  const { handle } = await ctx.params;
  const img = await resolvePhotoBytes(handle);
  if (!img) return new NextResponse(null, { status: 404 });

  return new NextResponse(img.body, {
    headers: {
      'Content-Type': img.contentType,
      // Cached hard. A new photo mints a NEW storage key, so a stale copy can
      // only ever be the photo the viewer already had — never someone else's.
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      // These bytes came from a merchant upload. Never let a browser sniff its
      // way to a content type other than the one that was validated.
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
