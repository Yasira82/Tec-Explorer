import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAllowedPhoto, PHOTO_MAX_BYTES } from '@/lib/explorer/photo-rules';

// Shop photos and reviews — the two things that turn a list of names into a
// place worth walking to, and the two that carry the most user-supplied content
// on this surface.

describe('isAllowedPhoto — narrower than storage allows, on purpose', () => {
  const ok = 1024;

  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (mime) => {
    expect(isAllowedPhoto(mime, ok)).toBe(true);
  });

  it('refuses SVG — it is a script container, not an image', () => {
    // Uploaded by merchants and shown to strangers: the one image format that
    // can carry script must not be in the set.
    expect(isAllowedPhoto('image/svg+xml', ok)).toBe(false);
  });

  it('refuses GIF, PDF and video that storage itself would take', () => {
    // The narrower the accepted set, the less there is to get wrong.
    expect(isAllowedPhoto('image/gif', ok)).toBe(false);
    expect(isAllowedPhoto('application/pdf', ok)).toBe(false);
    expect(isAllowedPhoto('video/mp4', ok)).toBe(false);
  });

  it('refuses an empty file', () => {
    expect(isAllowedPhoto('image/jpeg', 0)).toBe(false);
  });

  it('caps below the serverless body limit', () => {
    // The bytes pass through a function; Vercel's limit is 4.5MB, so this is a
    // ceiling with headroom rather than a preference.
    expect(PHOTO_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(isAllowedPhoto('image/jpeg', PHOTO_MAX_BYTES)).toBe(true);
    expect(isAllowedPhoto('image/jpeg', PHOTO_MAX_BYTES + 1)).toBe(false);
  });

  it('refuses a size that is not a number', () => {
    expect(isAllowedPhoto('image/jpeg', NaN)).toBe(false);
  });
});

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('the photo key never reaches a browser', () => {
  const mapper = strip(src('lib/explorer/server.ts'));
  const page   = strip(src('components/business/BusinessView.tsx'));

  it('the listing mapper exposes only whether a photo exists', () => {
    // A storage key is a path. A client has no use for one and every reason not
    // to receive one.
    expect(mapper).toContain('hasPhoto');
    expect(mapper).not.toMatch(/photo_?[Kk]ey:\s*(String\(|b\.photo_key)/);
  });

  it('the page requests bytes from its own origin', () => {
    expect(page).toContain('/api/photo/');
    expect(page).not.toMatch(/r2\.|cloudflarestorage|amazonaws/);
  });

  it('the check can actually fail', () => {
    expect('photo_key: String(b.photo_key)').toMatch(/photo_?[Kk]ey:\s*(String\(|b\.photo_key)/);
  });
});

describe('the photo upload derives the target from the session', () => {
  const route = strip(src('app/api/bff/explorer/photo/route.ts'));

  it('never takes the listing to attach to from the request', () => {
    // A handle in the body would let anyone attach an image to anyone's
    // business (P6).
    expect(route).toContain('listOwnListings(token)');
    expect(route).not.toMatch(/body\??\.\s*handle/);
  });

  it('validates the real byte length, not a claimed size', () => {
    expect(route).toContain('bytes.byteLength');
  });

  it('removes with null, which is the backends "clear it"', () => {
    // '' would also clear, but null is the documented signal and the tri-state
    // is what stops an unrelated edit from wiping the photo.
    expect(route).toContain('photo_key: null');
  });
});

describe('reviews are read publicly and written as the session', () => {
  const route = strip(src('app/api/bff/explorer/reviews/route.ts'));
  const ui    = strip(src('components/reviews/Reviews.tsx'));

  it('a read forwards no token', () => {
    // A listing is public and so is what people said about it.
    expect(route).toMatch(/headers\(\)/);
  });

  it('a write forwards the session token so the author comes from it', () => {
    expect(route).toContain('headers(token)');
  });

  it('an unreadable review list degrades to empty rather than an error', () => {
    // The business page renders fine with no reviews; a 4xx would turn a
    // cosmetic gap into a broken section.
    expect(route).toContain('return NextResponse.json(empty)');
  });

  it('never renders a missing average as a zero rating', () => {
    // Zero is a rating — the worst one — and showing it for "nobody has
    // reviewed this" would libel every new shop. The BRANCH is what matters;
    // the words themselves moved into the locale files.
    expect(ui).toContain('summary.average !== null');
    expect(ui).toContain('x.noReviews');
  });

  it('states the evidence on every review, not only the strong ones', () => {
    // A badge on some and nothing on the rest leaves the reader guessing what
    // the absence means.
    expect(ui).toContain('x.verifiedPurchase');
    expect(ui).toContain('x.signedInWithPi');
  });
});
