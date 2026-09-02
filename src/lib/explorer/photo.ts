import 'server-only';
import { reportError } from '@/lib/observability/reportError';

// Shop photos (C-108), server side.
//
// The same shape as Connection's avatars, and for the same reason: the storage
// bucket is PRIVATE, so there is no URL a browser can load. Explorer fetches the
// bytes itself and serves them same-origin from /api/photo/<handle>.
//
// Three consequences, each a decision rather than an accident:
//
//   · No CSP change. Images are `'self'`, which the app already allows. Making
//     the bucket public would mean editing img-src in every consuming app —
//     and exposing every key that was ever guessed.
//   · No credentialed URL ever reaches a browser, and no URL expires. A shared
//     link to a business keeps working.
//   · Removal is instant and total. Clearing `photo_key` kills every copy,
//     because every byte passes through here. On a surface where merchants
//     upload their own images, that is the only moderation control there is,
//     and it is worth keeping cheap.
//
// The object KEY never leaves the server: it is read from the listing on the
// server and used immediately. Public responses carry `hasPhoto` only.
const GW = process.env.API_GATEWAY_URL ?? '';

const internalHeaders = () => ({
  'Content-Type': 'application/json',
  'x-request-id': crypto.randomUUID(),
  ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
});

export interface PhotoBytes { body: ArrayBuffer; contentType: string }

/**
 * The photo bytes for a business handle, or null when there is none.
 *
 * Any failure — unreachable gateway, missing key, storage refusing the key —
 * yields null so the caller can render the listing without an image. A business
 * page must never fail because a photo could not be loaded.
 */
export async function resolvePhotoBytes(handle: string): Promise<PhotoBytes | null> {
  if (!GW || !handle) return null;
  try {
    const bizRes = await fetch(
      `${GW}/api/identity/explorer/business/${encodeURIComponent(handle)}`,
      { headers: internalHeaders(), cache: 'no-store' },
    );
    if (!bizRes.ok) return null;
    const key = (await bizRes.json().catch(() => ({})))?.data?.business?.photo_key;
    if (typeof key !== 'string' || !key) return null;

    const res = await fetch(`${GW}/api/storage/internal/public-object`, {
      method: 'POST', headers: internalHeaders(),
      body: JSON.stringify({ key }), cache: 'no-store',
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    // Serve only what we asked for. The upload path restricts the type, but this
    // is the response that reaches a browser: anything that is not an image is
    // dropped rather than passed through with a content type a browser might
    // decide to execute.
    if (!contentType.startsWith('image/')) return null;

    return { body: await res.arrayBuffer(), contentType };
  } catch (err) {
    // Null so the listing still renders without its image — a business page
    // must never fail because a photo could not be loaded. Reported, because
    // "photos stopped working" is otherwise invisible until someone says so.
    reportError(err, { where: 'resolvePhotoBytes', handle });
    return null;
  }
}
