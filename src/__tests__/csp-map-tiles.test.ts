import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The map rendered its zoom controls, its marker and its popup — over nothing.
//
// The tile host was not in `img-src`, so every tile request was refused by the
// browser's own policy. Nothing in the app could tell: a blocked image fires no
// error a script can catch, the CSP violation goes to a console nobody has open
// on a phone, and Leaflet has no opinion about tiles that never arrive. It looks
// like a styling bug, which is the most expensive way for it to look.
//
// Two files in two languages have to agree — a URL in TSX and a policy string in
// a config — and nothing makes them. So this test does.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** The hosts `img-src` actually permits. */
function imgSrcHosts(): string[] {
  const csp = read('next.config.js');
  const directive = csp.match(/"img-src ([^"]+)"/)?.[1];
  if (!directive) throw new Error('img-src not found in next.config.js');
  return directive.split(/\s+/).filter(Boolean);
}

/** Every absolute image URL host the map layer fetches from. */
function tileHosts(): string[] {
  const map = read('src/components/map/BusinessMap.tsx');
  return [...map.matchAll(/https:\/\/([^/'"`{}\s]+)\/[^'"`]*\{z\}/g)].map((m) => m[1] ?? '');
}

/**
 * Does this CSP source allow this host?
 *
 * The rule that caused the bug: `*.example.com` matches a SUBDOMAIN and not the
 * bare host. Written out here rather than assumed, because assuming it is what
 * a future edit will do too.
 */
const allows = (source: string, host: string): boolean =>
  source === host || (source.startsWith('*.') && host.endsWith(source.slice(1)) && host !== source.slice(2));

describe('the CSP allows the tiles the map asks for', () => {
  const hosts = tileHosts();
  const sources = imgSrcHosts();

  it('finds a tile host to check (the test is not vacuously passing)', () => {
    expect(hosts.length).toBeGreaterThan(0);
  });

  it.each(hosts)('img-src permits %s', (host) => {
    expect(sources.some((s) => allows(s, host))).toBe(true);
  });

  it('a wildcard does NOT stand in for the bare host', () => {
    // The exact mistake that blanked the map: listing only the wildcard.
    expect(allows('*.tile.openstreetmap.org', 'tile.openstreetmap.org')).toBe(false);
    expect(allows('*.tile.openstreetmap.org', 'a.tile.openstreetmap.org')).toBe(true);
    expect(allows('tile.openstreetmap.org', 'tile.openstreetmap.org')).toBe(true);
  });

  it('an unrelated host is still refused', () => {
    // Guard against a matcher that says yes to everything, which would let the
    // next real regression through while reporting green.
    expect(sources.some((s) => allows(s, 'tiles.example.net'))).toBe(false);
  });
});
