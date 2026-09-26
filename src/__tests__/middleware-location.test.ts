/**
 * The middleware must be where Next.js LOADS it (C-123 §11).
 *
 * With the app under `src/app`, Next.js reads `src/middleware.ts` and ignores
 * one at the repo root. The root copy passed every unit test here — they
 * import the file directly — while production ran no page guard and no CSRF
 * check at all. A test that imports a file is not evidence that it runs; this
 * one pins the location, and CI checks the build's middleware manifest.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('middleware location', () => {
  it('lives beside the app directory, in src/', () => {
    expect(existsSync(join(process.cwd(), 'src', 'app'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src', 'middleware.ts'))).toBe(true);
  });

  it('has no copy at the root, where it would silently be ignored', () => {
    expect(existsSync(join(process.cwd(), 'middleware.ts'))).toBe(false);
  });
});
