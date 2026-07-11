import { describe, it, expect } from 'vitest';
import {
  DIRECTORY, CATEGORIES, CATEGORY_META, getListing, searchDirectory,
} from '@/lib/explorer/directory';

describe('TEC Explorer — discovery directory (C-108, read-only)', () => {
  it('every category has display metadata', () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_META[c]?.label).toBeTruthy();
      expect(CATEGORY_META[c]?.icon).toBeTruthy();
    }
  });

  it('every indexed listing is Pi-accepting (C-108 §5 — required to index)', () => {
    for (const l of DIRECTORY) expect(l.piAccepted).toBe(true);
  });

  it('getListing fails closed for an unknown id', () => {
    expect(getListing('nope')).toBeNull();
    expect(getListing('olive-branch-cafe')?.name).toBe('Olive Branch Café');
  });

  it('text search matches name, summary, area, tags, and category label', () => {
    expect(searchDirectory({ query: 'coffee' }).some((l) => l.id === 'olive-branch-cafe')).toBe(true);
    expect(searchDirectory({ query: 'repair' }).some((l) => l.id === 'swift-fix-repairs')).toBe(true);
    expect(searchDirectory({ query: 'tech' }).some((l) => l.id === 'pixel-forge-studio')).toBe(true);
  });

  it('category filter restricts the result set', () => {
    const food = searchDirectory({ category: 'food' });
    expect(food.length).toBeGreaterThan(0);
    expect(food.every((l) => l.category === 'food')).toBe(true);
  });

  it('area filter is case-insensitive and substring', () => {
    const remote = searchDirectory({ area: 'remote' });
    expect(remote.length).toBeGreaterThan(0);
    expect(remote.every((l) => l.area.toLowerCase().includes('remote'))).toBe(true);
  });

  it('ranking is trust-first: verified listings sort ahead of unverified', () => {
    const all = searchDirectory({});
    const firstUnverified = all.findIndex((l) => l.verification === 'unverified');
    const lastVerified    = all.map((l) => l.verification).lastIndexOf('verified');
    // Every verified listing appears before the first unverified one.
    expect(lastVerified).toBeLessThan(firstUnverified === -1 ? Infinity : firstUnverified);
  });

  it('an empty query returns the whole directory (ranked), never fewer', () => {
    expect(searchDirectory({}).length).toBe(DIRECTORY.length);
  });

  it('a no-match query returns an empty array, not a throw', () => {
    expect(searchDirectory({ query: 'zzz-nonexistent-zzz' })).toEqual([]);
  });
});
