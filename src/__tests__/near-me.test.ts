import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { distanceKm, formatDistance } from '@/lib-client/geo';
import { mappable, type Listing } from '@/lib/explorer/directory';

// "Who near me accepts Pi?" — the question C-108 says Explorer exists to answer.
//
// The privacy claim underneath it is strong and easy to erode by accident: the
// SEARCHER's position never leaves the browser. C-108 §6 says location is used
// for search and never stored, and the only version of that promise worth making
// is one where the coordinates are never sent at all.
//
// The last describe block is the guard. It is a grep, and greps are usually weak
// tests — but the thing being prevented is exactly the shape a well-meaning
// change would take: adding `?lat=&lng=` to the search call to move the sort
// server-side. That is a one-line diff that silently converts "we never see your
// location" into "it is in the access log".

const base: Listing = {
  id: 'x', name: 'X', category: 'food', area: 'A', summary: 'S',
  piAccepted: true, verification: 'verified', trustHint: '', tags: [],
};

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm({ lat: 30, lng: 31 }, { lat: 30, lng: 31 })).toBe(0);
  });

  it('measures a known distance', () => {
    // Cairo → Alexandria is about 180 km great-circle.
    const km = distanceKm({ lat: 30.0444, lng: 31.2357 }, { lat: 31.2001, lng: 29.9187 });
    expect(km).toBeGreaterThan(170);
    expect(km).toBeLessThan(190);
  });

  it('is symmetric', () => {
    const a = { lat: 30.0444, lng: 31.2357 };
    const b = { lat: 31.2001, lng: 29.9187 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });

  it('handles antipodes without NaN', () => {
    // sqrt of a value nudged just past 1 by floating point returns NaN without
    // the clamp — and a NaN distance sorts unpredictably rather than failing.
    const km = distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeGreaterThan(20000);
  });
});

describe('formatDistance — precision a person can act on', () => {
  it('uses metres under a kilometre', () => {
    expect(formatDistance(0.42)).toBe('420 m');
  });

  it('uses one decimal in the walking range', () => {
    expect(formatDistance(2.34)).toBe('2.3 km');
  });

  it('drops the decimal when it stops meaning anything', () => {
    expect(formatDistance(17.4)).toBe('17 km');
  });
});

describe('mappable — a pin needs both halves of a pair', () => {
  it('keeps a complete position', () => {
    expect(mappable([{ ...base, lat: 30, lng: 31 }])).toHaveLength(1);
  });

  it('drops a half pair rather than drawing it in the wrong country', () => {
    expect(mappable([{ ...base, lat: 30 }])).toHaveLength(0);
    expect(mappable([{ ...base, lng: 31 }])).toHaveLength(0);
  });

  it('drops a listing with no position at all', () => {
    expect(mappable([base])).toHaveLength(0);
  });

  it('drops NaN rather than letting it reach the map', () => {
    expect(mappable([{ ...base, lat: NaN, lng: 31 }])).toHaveLength(0);
  });
});

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe("the searcher's position never leaves the browser", () => {
  const page = strip(src('app/app/page.tsx'));
  const geo  = strip(src('lib-client/geo.ts'));

  it('the discover page never puts coordinates in a request', () => {
    // The regression this exists to catch: moving the "near me" sort onto the
    // server by appending the visitor's coordinates to the search query.
    expect(page).not.toMatch(/qs\.set\(\s*['"](lat|lng|latitude|longitude)['"]/);
    expect(page).not.toMatch(/[?&](lat|lng)=/);
  });

  it('the geo module never fetches', () => {
    // It reads the device and does arithmetic. Nothing in it should have a
    // reason to talk to a server.
    expect(geo).not.toMatch(/\bfetch\s*\(/);
    expect(geo).not.toMatch(/navigator\.sendBeacon/);
  });

  it('distance is computed client-side', () => {
    expect(page).toContain('distanceKm(');
  });

  it('location is requested on an action, never on mount', () => {
    // A permission prompt fired by a page load is the kind that gets denied
    // permanently, after which "near me" is dead on that device (C-108 §6
    // requires explicit consent anyway).
    expect(page).toMatch(/onClick=\{[^}]*nearMe\.request\(\)/);
    expect(geo).not.toMatch(/useEffect\([^)]*getCurrentPosition/);
  });

  it('the checks can actually fail', () => {
    expect("qs.set('lat', String(p.lat))").toMatch(/qs\.set\(\s*['"](lat|lng)['"]/);
    expect('await fetch("/x")').toMatch(/\bfetch\s*\(/);
  });
});

describe('server components never call a function from a client module', () => {
  // THE PRODUCTION CRASH THIS EXISTS TO PREVENT.
  //
  // `mappable` used to be exported from BusinessMap.tsx, which is `'use client'`.
  // When a SERVER component imports from one of those, Next replaces every
  // export with a client REFERENCE — a marker, not the function. Calling it
  // throws at request time.
  //
  // Nothing caught it: typecheck sees a function, lint sees an import, and the
  // page is force-dynamic so there is no prerender at build. It shipped green
  // and every /business/<id> returned a 500.
  //
  // A component import is fine — that is the whole point of the boundary. A
  // plain VALUE import into a server file is the bug.
  const serverPages = ['app/business/[id]/page.tsx'];
  const clientModules = [
    '@/components/map/BusinessMap',
    '@/lib-client/geo',
  ];

  it.each(serverPages)('%s imports no values from a client module', (page) => {
    const code = strip(src(page));
    expect(code).not.toMatch(/^'use client'/m);   // it really is a server file
    for (const mod of clientModules) {
      expect(code).not.toContain(`from '${mod}'`);
    }
  });

  it('mappable lives in a module with no client boundary', () => {
    // So both sides can call it, which is what a pure filter should be anyway.
    expect(strip(src('lib/explorer/directory.ts'))).not.toMatch(/^'use client'/m);
    expect(src('lib/explorer/directory.ts')).toContain('export const mappable');
  });

  it('the check can actually fail', () => {
    expect("import { mappable } from '@/components/map/BusinessMap';")
      .toContain("from '@/components/map/BusinessMap'");
  });
});
