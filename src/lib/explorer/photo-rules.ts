// What a browser may upload as a shop photo.
//
// Deliberately NOT in photo.ts: that module is `server-only`, and these are pure
// validation constants the CLIENT needs too — the file picker's `accept` list
// and the size it warns about must be the same values the server enforces, or
// the two drift and a merchant is rejected after the upload rather than before.
//
// Stricter than tec-storage-service's own limits (10MB, gif, pdf, video) on
// purpose — the narrower the accepted set, the less there is to get wrong.
// GIF is excluded: an animated storefront in a directory is a distraction the
// page did not ask for. SVG is excluded because it is a script container, not
// an image — and this one is uploaded by merchants and shown to strangers.
//
// 4MB rather than the avatar's 2: this is a wide banner of a place, not a small
// round face, and a phone photo of a shopfront lands around 3MB. Vercel's
// request body limit is 4.5MB and the bytes pass through the function, so this
// is the ceiling with headroom, not a preference.
export const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_FOLDER = 'business';

export const isAllowedPhoto = (mimeType: string, size: number): boolean =>
  (PHOTO_MIME as readonly string[]).includes(mimeType) &&
  Number.isFinite(size) && size > 0 && size <= PHOTO_MAX_BYTES;
