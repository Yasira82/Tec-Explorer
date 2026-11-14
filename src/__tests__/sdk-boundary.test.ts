import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * The Two-SDK boundary: `@yasser172/tec-sdk` is SERVER code (BFF routes) — it
 * reads API_GATEWAY_URL, which the browser does not have, and since 1.3.0 it
 * imports node's `async_hooks`. Browser code reaching it, even through a wrapper,
 * is a call with no gateway that cannot work, and a production build that fails
 * on the first SDK release that uses a server-only module.
 *
 * Found 14 Nov 2026 (TEC-AUDIT-0045): Ecommerce's lib-client/pi/pi-auth.ts →
 * lib/sdk.ts → tec-sdk. It built only because 1.2.2 happened to use nothing
 * server-only; moving to 1.4.0 broke the build. The rule had been written down
 * ("lint rule — no tec-sdk in client components") and never enforced.
 *
 * Browser code = a file that starts with 'use client', and anything under
 * src/lib-client. The search follows imports TRANSITIVELY (`@/…` and relative).
 */
const SRC = join(process.cwd(), 'src');
const SERVER_SDK = /['"]@yasser172\/tec-sdk['"]/;
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.(test|spec)\./.test(n) ? [p] : [];
  });

const resolve = (from: string, spec: string): string | null => {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
};

/** The import chain from `file` to the server SDK, or null. Type-only imports are erased and do not count. */
const chainToServerSdk = (file: string, seen = new Set<string>()): string[] | null => {
  if (seen.has(file)) return null;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(IMPORT)) {
    if (/^(?:import|export)\s+type\s/.test(m[0])) continue;
    const spec = m[1] ?? m[2] ?? '';
    if (SERVER_SDK.test(`'${spec}'`)) return [file, spec];
    const next = resolve(file, spec);
    const rest = next && chainToServerSdk(next, seen);
    if (rest) return [file, ...rest];
  }
  return null;
};

const isBrowserCode = (f: string) =>
  /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')) || f.includes(`${join('src', 'lib-client')}`);

describe('the Two-SDK boundary', () => {
  it('the search finds an indirect import (self-check)', () => {
    // Two lines of real shape: a wrapper that imports the SDK, and a client that imports the wrapper.
    expect(SERVER_SDK.test("import { TecSdk } from '@yasser172/tec-sdk';")).toBe(true);
    expect([..."import sdk from '@/lib/sdk';".matchAll(IMPORT)].map((m) => m[1])).toEqual(['@/lib/sdk']);
    expect([..."import type { X } from '@yasser172/tec-sdk';".matchAll(IMPORT)][0]![0]).toMatch(/^import\s+type\s/);
  });

  it('no browser code reaches @yasser172/tec-sdk, directly or through a wrapper', () => {
    const offenders = files(SRC)
      .filter(isBrowserCode)
      .map((f) => chainToServerSdk(f))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.map((p) => (p.startsWith('/') ? relative(process.cwd(), p) : p)).join(' → '));
    expect(offenders).toEqual([]);
  });
});
