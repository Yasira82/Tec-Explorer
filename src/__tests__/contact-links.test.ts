import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeWebsite, telHref } from '@/lib/explorer/directory';

// A business listing now carries an address, hours, a phone and a website — all
// typed by the merchant, all untrusted, and one of them lands in an `href`.
//
// The backend validates the website on write. This is the SECOND check, and it
// is not redundant: a row is written once and rendered forever, so the guarantee
// has to hold for rows that predate the validator, rows written by some future
// caller, and rows an operator edited by hand. A stored `javascript:` URL in a
// link is XSS delivered by the discovery index to everyone who opens that
// business.

describe('safeWebsite — an allowlist, because a denylist ages badly', () => {
  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    '  javascript:alert(1)  ',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ])('refuses to link %s', (evil) => {
    expect(safeWebsite(evil)).toBeNull();
  });

  it('passes an ordinary https link through', () => {
    expect(safeWebsite('https://shop.example/menu')).toBe('https://shop.example/menu');
  });

  it('passes http — not every small merchant has TLS', () => {
    expect(safeWebsite('http://shop.example/')).toBe('http://shop.example/');
  });

  it('returns null rather than throwing on nonsense', () => {
    // A crash here would take down the whole business page over one bad row.
    expect(safeWebsite('not a url')).toBeNull();
    expect(safeWebsite('')).toBeNull();
    expect(safeWebsite(undefined)).toBeNull();
    expect(safeWebsite(null)).toBeNull();
  });
});

describe('telHref', () => {
  it('keeps digits and the leading +', () => {
    expect(telHref('+20 100 123 4567')).toBe('tel:+201001234567');
  });

  it('drops anything that is not dialable', () => {
    expect(telHref('call me')).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
});

// The guards above only matter if the page actually calls them, so check that
// the rendered link comes from the checked value and not the raw field.
const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('the business page links only through the guards', () => {
  // The presentation moved into a client component so it could be translated;
  // the links live with it, so the guard follows them there.
  const page = strip(src('components/business/BusinessView.tsx'));

  it('never puts the raw merchant field in an href', () => {
    expect(page).not.toMatch(/href=\{\s*l\.website\s*\}/);
    expect(page).not.toMatch(/href=\{\s*`tel:\$\{l\.phone\}`\s*\}/);
  });

  it('routes the website through safeWebsite', () => {
    expect(page).toMatch(/safeWebsite\(\s*l\.website\s*\)/);
  });

  it('opens external links with noopener', () => {
    // Without it the opened page inherits window.opener and can navigate this
    // tab elsewhere — a phishing primitive on a page full of merchant links.
    const externals = [...page.matchAll(/target="_blank"[^>]*/g)].map((m) => m[0]);
    expect(externals.length).toBeGreaterThan(0);
    for (const tag of externals) expect(tag).toContain('noopener');
  });

  it('the check can actually fail', () => {
    expect('<a href={l.website}>').toMatch(/href=\{\s*l\.website\s*\}/);
    expect('<a target="_blank" rel="nofollow">').not.toContain('noopener');
  });
});
