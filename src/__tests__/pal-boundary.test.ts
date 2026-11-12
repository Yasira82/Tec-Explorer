import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * R1 — a Pi SDK change must be a one-file fix. Signing in and paying go through
 * PiRuntime (src/lib/pi/PiRuntime.ts), the Pi Abstraction Layer, never straight to
 * window.Pi. The audit of 11 Nov 2026 found both calls bypassing it in every app
 * (TEC-AUDIT-0011). The only direct call allowed is the inline Pi.init in
 * layout.tsx, which runs before any module is loaded.
 */
const ROOT = join(__dirname, '..');
const DIRECT = /(window as any)?\.?\bwindow\.Pi\.(authenticate|createPayment)\(|\(window as any\)\.Pi\.(authenticate|createPayment)\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('PAL boundary', () => {
  it('no code outside PiRuntime calls window.Pi.authenticate or createPayment', () => {
    const offenders = files(ROOT)
      .filter((f) => !f.endsWith('PiRuntime.ts'))
      .flatMap((f) => readFileSync(f, 'utf8').split('\n')
        .map((line, i) => ({ line, at: `${relative(ROOT, f)}:${i + 1}` }))
        .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line) && DIRECT.test(line))
        .map(({ at }) => at));
    expect(offenders).toEqual([]);
  });
});
