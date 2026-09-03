import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATEGORIES, CATEGORY_META, safeWebsite, telHref, mappable, type Listing,
} from '@/lib/explorer/directory';

// `directory.ts` is the SHAPE of a listing. The listings themselves are real and
// come from the explorer module of tec-identity-service.
//
// It used to also carry a curated `DIRECTORY` of eight businesses — six of them
// `verification: 'verified'` — and a client-side `searchDirectory` over it. The
// tests below replaced the tests for those, and one of them exists to keep them
// from coming back.

const SRC = readFileSync(
  join(process.cwd(), 'src/lib/explorer/directory.ts'), 'utf8',
);

/**
 * The same file with its comments removed.
 *
 * The guards below are about CODE. Run against the raw text they also match the
 * header that EXPLAINS what was removed — a gate that fails on a clean tree,
 * which is how a gate teaches people to ignore it. (tec-ui shipped exactly that
 * bug: its Pi-SDK grep matched its own comments.)
 */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the index is the backend, not a fixture in this file', () => {
  it('carries no sample listings', () => {
    // Dead code is usually harmless. This was not: the backend deliberately
    // neutered the same fixture — its seed helper forces UNVERIFIED whatever it
    // is passed — because Explorer PRESENTS verification and never mints it
    // (C-108 §4). Leaving six self-declared "verified" rows here kept the exact
    // artefact the service had removed, one import away from a screen.
    expect(CODE).not.toMatch(/verification:\s*'verified'/);
    expect(CODE).not.toMatch(/\bDIRECTORY\b/);
    expect(CODE).not.toMatch(/piAccepted:\s*true/);
  });

  it('carries no client-side search over one either', () => {
    // Search runs in the database, where the Arabic normalizer lives. A second
    // implementation here would rank differently from the one that shipped.
    expect(CODE).not.toMatch(/searchDirectory|getListing\s*=/);
  });

  it('does not describe the app as a demo over a sample', () => {
    // The stale header outlived the thing it described and was read as current
    // state — by a person and by an assistant. A comment that misreports a
    // shipped product is worse than no comment.
    expect(SRC).not.toMatch(/sample directory|READ-ONLY sample|Phase 1\+/i);
  });
});

describe('verification is Zone’s, and the file says so', () => {
  it('never credits KYC for a business badge', () => {
    // KYC verifies a PERSON; a listing is an ENTITY (C-120 §3). The backend
    // consumer was wired to `kyc.verified` once and silently matched nothing —
    // that event carries a user, and no listing has one. The locales were
    // corrected in #39; the type that defines the field is corrected here.
    const claims = SRC.match(/.*(tec-kyc-service|KYC-verified).*/g) ?? [];
    expect(claims).toEqual([]);
    expect(SRC).toMatch(/zone\.badge\.issued\.v1/);
  });
});

describe('category metadata', () => {
  it('every category has a label and an icon', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_META[c]?.label).toBeTruthy();
      expect(CATEGORY_META[c]?.icon).toBeTruthy();
    }
  });
});

describe('safeWebsite — the second check on a merchant-supplied href', () => {
  // The backend validates on write. This runs on render, because a row is
  // written once and rendered forever: rows predating the validator, rows from a
  // future writer, rows an operator edited by hand. A `javascript:` URL in a
  // link is stored XSS, executed in the browser of everyone who opens it.
  it('passes http and https', () => {
    expect(safeWebsite('https://shop.example')).toBe('https://shop.example/');
    expect(safeWebsite('http://shop.example')).toBe('http://shop.example/');
  });

  it('refuses every executable scheme, by allowlist', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) expect(safeWebsite(bad)).toBeNull();
  });

  it('refuses what is not a URL at all, rather than throwing', () => {
    expect(safeWebsite('shop.example')).toBeNull();   // schemeless: upgraded on write
    expect(safeWebsite('')).toBeNull();
    expect(safeWebsite(undefined)).toBeNull();
    expect(safeWebsite(null)).toBeNull();
  });
});

describe('telHref', () => {
  it('keeps digits and a leading +, and drops the rest', () => {
    expect(telHref('+20 (100) 123-4567')).toBe('tel:+201001234567');
  });

  it('refuses something too short to be a number', () => {
    expect(telHref('12')).toBeNull();
    expect(telHref('n/a')).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
});

describe('mappable — a pin needs both halves of a pair', () => {
  const base: Listing = {
    id: 'x', name: 'X', category: 'food', area: 'A', summary: 'S',
    piAccepted: true, verification: 'unverified', trustHint: '', tags: [],
  };

  it('keeps a listing with a finite lat and lng', () => {
    expect(mappable([{ ...base, lat: 30, lng: 31 }])).toHaveLength(1);
  });

  it('drops half a coordinate, and anything not finite', () => {
    expect(mappable([
      { ...base, lat: 30 },
      { ...base, lng: 31 },
      { ...base },
      { ...base, lat: NaN, lng: 31 },
      { ...base, lat: 30, lng: Infinity },
    ])).toEqual([]);
  });
});
