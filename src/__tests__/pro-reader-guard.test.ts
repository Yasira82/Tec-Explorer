import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every screen that reads `/api/bff/subscription` reads it through readProState
 * (lib/subscription/read-pro-state.ts) — never by hand. Two hand-written readers
 * in one app disagreed about expiry and about a missing `isActive` (TEC-AUDIT-0044,
 * 14 Nov 2026); a third written tomorrow would be a third rule.
 */
const SRC = join(process.cwd(), 'src');
const READS_STATUS = /fetch\(\s*['"`]\/api\/bff\/subscription['"`]/;   // the status read — not /cancel

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'api' ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.(test|spec)\./.test(n) ? [p] : [];
  });

describe('the Pro status is read one way', () => {
  it('the search finds a status read and ignores the cancel (self-check)', () => {
    expect(READS_STATUS.test("fetch('/api/bff/subscription', { credentials: 'include' })")).toBe(true);
    expect(READS_STATUS.test("fetch('/api/bff/subscription/cancel', { method: 'POST' })")).toBe(false);
  });

  it('every screen that reads it uses readProState', () => {
    const handRolled = files(SRC)
      .filter((f) => READS_STATUS.test(readFileSync(f, 'utf8')))
      .filter((f) => !/\breadProState\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f));
    expect(handRolled).toEqual([]);
  });
});
