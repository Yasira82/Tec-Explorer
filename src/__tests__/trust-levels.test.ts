import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { trustLevel, TRUST_TAG, TRUST_BODY } from '@/lib/explorer/trust';

// Every real merchant was labelled "Unverified", because the only route to the
// other value ran through a TEC KYC review that is a manual queue and is not
// reachable end-to-end today. The app told every honest business it was
// unverified and told every customer the directory was dubious.
//
// A badge with one attainable value is not a badge. It is a warning printed on
// everything.
const root = process.cwd();
const src  = (p: string) => readFileSync(join(root, 'src', p), 'utf8');
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const listing = (over: Partial<{ verification: string; owner?: string }>) =>
  ({ verification: 'unverified', ...over }) as never;

describe('the ladder says what is actually known', () => {
  it('L3 — the business itself was reviewed', () => {
    expect(trustLevel(listing({ verification: 'verified', owner: 'yas' }))).toBe(3);
  });

  it('L2 — a Pi account listed it', () => {
    // `owner` is a Pi username resolved from the JWT server-side at write time.
    // Its presence IS the evidence: a Pi account that can hold a Mainnet wallet
    // has passed Pi Network's own KYC.
    expect(trustLevel(listing({ owner: 'yas55eR82' }))).toBe(2);
  });

  it('L1 — nobody stands behind it', () => {
    expect(trustLevel(listing({}))).toBe(1);
    expect(trustLevel(listing({ owner: '' }))).toBe(1);
  });

  it('a review outranks an owner, never the other way round', () => {
    // If these ever inverted, a self-listing would outrank a reviewed business.
    expect(trustLevel(listing({ verification: 'verified' })))
      .toBeGreaterThan(trustLevel(listing({ owner: 'yas' })));
  });
});

describe('Explorer still never mints verification (C-108 §4)', () => {
  const trust = strip(src('lib/explorer/trust.ts'));

  it('L3 is derived from the backend field, never decided here', () => {
    expect(trust).toMatch(/verification === 'verified'/);
    // Nothing in this module may WRITE a verification — it reads and reports.
    expect(trust).not.toMatch(/fetch\(|await |setVerif/);
  });

  it('L2 rests on the owner, which the client cannot set', () => {
    // The owner column is written from a verified session token in the backend
    // and never from a request body (P6). That is the whole reason L2 is a fact
    // rather than a claim — and why the seeded rows, which had no owner, could
    // never have been dressed up as one.
    expect(trust).toMatch(/l\.owner \? 2 : 1/);
  });

  it('is derived, not stored — no schema, no migration, no drift', () => {
    // A stored trust column can disagree with the facts it summarises. This
    // cannot: it IS the facts.
    expect(trust).not.toMatch(/trust_level|trustLevel:/);
  });
});

describe('every surface reads the same ladder', () => {
  const surfaces = [
    'app/app/page.tsx',                          // the discovery list card
    'components/business/BusinessView.tsx',      // the business page
    'components/map/BusinessMap.tsx',            // the map pin + popup
    'app/app/components/ListingPanel.tsx',       // the merchant's own card
  ];

  it.each(surfaces)('%s imports trustLevel', (f) => {
    expect(src(f)).toContain("from '@/lib/explorer/trust'");
  });

  it.each(surfaces)('%s no longer branches on the raw boolean for its badge', (f) => {
    // Four surfaces each deciding "verified ? A : B" is four chances to
    // disagree — and they did: one printed English into an Arabic page.
    const code = strip(src(f));
    expect(code).not.toMatch(/\?\s*'✅ Verified'\s*:\s*'Unverified'/);
  });

  it('no surface hardcodes an English badge label', () => {
    for (const f of surfaces) {
      const code = strip(src(f));
      expect(code).not.toMatch(/['"`]Unverified['"`]/);
    }
  });
});

describe('the ladder is translated everywhere', () => {
  const locales = readdirSync(join(root, 'src/lib/i18n'))
    .filter((f) => /^[a-z]{2}\.ts$/.test(f));

  it('finds every locale file', () => {
    expect(locales.length).toBe(12);
  });

  it.each(locales)('%s has all three tags and bodies', (file) => {
    const code = readFileSync(join(root, 'src/lib/i18n', file), 'utf8');
    for (const key of [...Object.values(TRUST_TAG), ...Object.values(TRUST_BODY), 'liveTrusted']) {
      expect(code).toContain(`${key}:`);
    }
  });

  it('the counter is no longer pinned to a value nobody can reach', () => {
    // "live · 0 verified" was permanent, because L3 required a review that
    // cannot be requested. A live counter stuck at zero reads as a broken app,
    // not as a high bar.
    expect(strip(src('app/app/page.tsx'))).toMatch(/trustLevel\(l\) >= 2/);
  });
});
