import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The map drew its controls and attribution over a blank frame — and the CSP,
// the tile URL and the leaflet CSS were all correct.
//
// The map is built inside `await import('leaflet')`, so it does not exist when
// the framing effect first runs. That effect returned early on a null ref, and
// its dependencies never changed again — a memoised list, a stable callback,
// and a position that only moves if the visitor grants location. So it never
// ran a second time and `setView` was never called.
//
// Leaflet queues EVERY layer until a map has a centre and a zoom (`_loaded`).
// A tile layer added to a map that never gets a view is never drawn, and
// nothing throws: the failure is silent and looks like a styling problem.
const src = readFileSync(
  join(process.cwd(), 'src/components/map/BusinessMap.tsx'), 'utf8',
);
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');
const code = strip(src);

describe('the map has a view before anything is added to it', () => {
  it('sets one at CREATION, in the same expression', () => {
    expect(code).toMatch(/L\.map\([\s\S]{0,160}?\)\s*\n?\s*\.setView\(/);
  });

  it('the tile layer is attached after that, not before', () => {
    const created = code.search(/\.setView\(/);
    const tiles = code.search(/L\.tileLayer\(/);
    expect(created).toBeGreaterThan(-1);
    expect(tiles).toBeGreaterThan(created);
  });
});

describe('the framing effect can run once the map exists', () => {
  it('a ready flag is raised when the map is built', () => {
    expect(code).toMatch(/setReady\(true\)/);
  });

  it('and that flag is a dependency of the framing effect', () => {
    // Without it the effect is stranded: it bailed on a null ref and had no
    // reason to re-run.
    expect(code).toMatch(/\}, \[listings, me, onOpen, ready\]\)/);
  });
});
