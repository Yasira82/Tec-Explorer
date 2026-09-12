import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A silent error handler is an invisible failure (C-96).
//
// The app ships `reportError` for exactly this, and then every feature added
// this month wrote `catch { … }` and swallowed the error. The screens degraded
// politely — "couldn't load", an empty list, a photo that just isn't there —
// which is correct for the READER and useless for us: the day photos stop
// working for every merchant, the first anyone hears of it is a screenshot.
//
// So: a catch block may still degrade quietly on screen. It may not degrade
// quietly in the logs.

const ROOT = join(process.cwd(), 'src');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : walk(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });

/** `catch { … }` and `catch (e) { … }` that bind nothing useful. */
const EMPTY_CATCH = /catch\s*(\([^)]*\))?\s*\{([^{}]*)\}/g;

/**
 * Handlers that are ALLOWED to stay silent, with the reason.
 *
 * Kept deliberately short. Each one is a place where the failure carries no
 * information — a parse of a body we already have a default for, or a browser
 * API that is simply absent — so reporting it would be noise that trains people
 * to ignore the real ones.
 */
// Shared template files (template v2), identical across ~20 TEC apps.
//
// They have silent catches too, and they should be fixed — but in the TEMPLATE,
// once, not diverged here. Patching them in this repo alone would make Explorer
// the odd one out and guarantee the next template sync reverts it.
//
// Listed explicitly rather than pattern-matched, so adding a file to this set is
// a visible decision in a diff and not something that quietly happens.
const TEMPLATE_FILES = [
  'app/layout.tsx',
  'app/api/auth/sso-callback/route.ts',
  'lib-client/pi/pi-auth.ts',
  'lib/pi-payment.ts',
  'lib/pi/PiCircuitBreaker.ts',
  // Shared session manager (the authenticate gate). Its one silent catch is the
  // best-effort incomplete-payment resolve; like the rest of this list it should
  // be fixed in the TEMPLATE, once, not diverged here.
  'lib/pi/pi-session.ts',
  'lib/bff/createHandler.ts',
];

const ALLOWED = [
  /\/\*\s*ignore\s*\*\//,          // explicitly marked, e.g. localStorage in a private window
  /=>\s*\(\{\}\)\)/,               // `.catch(() => ({}))` on a JSON body with a default
  /=>\s*null\)/,                   // `.catch(() => null)` likewise
  /not supported/i,                // a browser API that does not exist here
  /keep\s+empty/i,
];

describe('no feature swallows its errors', () => {
  const files = walk(ROOT)
    .filter((f) => /(components|lib|lib-client|app)\//.test(f) && !/node_modules/.test(f))
    .filter((f) => !TEMPLATE_FILES.some((t) => f.endsWith(t)));

  it('finds source files to check', () => {
    // A test that scans nothing passes forever.
    expect(files.length).toBeGreaterThan(20);
  });

  it('every catch block either reports or is explicitly excused', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(EMPTY_CATCH)) {
        const body = m[2] ?? '';
        const whole = m[0];
        // A body that does something visible (setState, return a value, rethrow)
        // is a handled failure; only a body that does NOTHING but a comment is
        // the silent kind this catches.
        const meaningful = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
        if (meaningful) continue;
        if (ALLOWED.some((re) => re.test(whole))) continue;
        offenders.push(`${file.replace(ROOT, 'src')}: ${whole.replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the reporter is actually used by the features added this month', () => {
    // The check above passes trivially if nothing calls reportError at all.
    const uses = files.filter((f) => readFileSync(f, 'utf8').includes('reportError('));
    expect(uses.length).toBeGreaterThanOrEqual(6);
  });
});
