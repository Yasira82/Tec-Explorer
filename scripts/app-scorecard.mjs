#!/usr/bin/env node
/**
 * App Excellence scorecard — the App Excellence Standard, checked
 * (tec-knowledge-base audits/APP_EXPANSION_ARCHITECTURE_2026-10-11.md §2).
 *
 * Every TEC app is cloned from this template, so one script can score them all.
 * Each check is a fact about the repository — a file, a line, a setting — never
 * an opinion. The score is printed; the build FAILS only when a check that this
 * app has already passed stops passing (a ratchet: `.app-scorecard.json` lists
 * them). New apps start from the template, which passes them all.
 *
 *   node scripts/app-scorecard.mjs                 score + ratchet (no install needed)
 *   node scripts/app-scorecard.mjs --after-build   also E15 (needs .next from `next build`)
 *   node scripts/app-scorecard.mjs --write-floor   record today's passing checks as the floor
 *   node scripts/app-scorecard.mjs --json          machine-readable
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const FLOOR_FILE = join(ROOT, '.app-scorecard.json');
const LOCALES = ['en', 'ar', 'zh', 'vi', 'ko', 'id', 'hi', 'es', 'pt', 'fr', 'tr', 'ru'];
/** First-load JavaScript budget for /app, gzip (owner, 2026-10-11). */
const APP_JS_BUDGET_KB = 250;

const read = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };
const has  = (p) => existsSync(join(ROOT, p));
const any  = (...ps) => ps.some(has);

function walk(dir, out = []) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(abs, name);
    if (statSync(p).isDirectory()) walk(relative(ROOT, p), out);
    else out.push(relative(ROOT, p));
  }
  return out;
}
const SRC   = walk('src');
const CODE  = SRC.filter((f) => /\.(ts|tsx)$/.test(f) && !/__tests__|\.test\.|\.spec\./.test(f));
const UI    = CODE.filter((f) => f.endsWith('.tsx'));

const checks = [
  ['E1', 'Failure states — error (with retry) · not-found · loading', () => {
    const err = read('src/app/error.tsx');
    const miss = [
      !err && 'src/app/error.tsx',
      err && !/reset\(/.test(err) && 'error.tsx has no retry (reset())',
      !has('src/app/not-found.tsx') && 'src/app/not-found.tsx',
      !any('src/app/loading.tsx', 'src/app/app/loading.tsx') && 'loading.tsx',
    ].filter(Boolean);
    return [miss.length === 0, miss.join(' · ')];
  }],
  ['E3', 'Twelve languages — a dictionary per locale + a key-parity test', () => {
    const dirs = ['src/lib/i18n', 'src/lib/i18n/dictionaries', 'src/i18n'];
    const missing = LOCALES.filter((c) => !dirs.some((d) => has(`${d}/${c}.ts`)));
    const parity = SRC.some((f) => /parity/i.test(f) && /i18n|locale|dictionar/i.test(f));
    return [missing.length === 0 && parity, [missing.length && `missing: ${missing.join(',')}`, !parity && 'no i18n parity test'].filter(Boolean).join(' · ')];
  }],
  ['E4', 'Design tokens only — no raw hex colours in components', () => {
    const hits = UI.filter((f) => /['"`]#[0-9a-fA-F]{3,8}\b/.test(read(f)));
    return [hits.length === 0, hits.length ? `${hits.length} file(s), e.g. ${hits.slice(0, 3).join(', ')}` : ''];
  }],
  ['E5', 'Session — the sign-in door, cookieDomainFor on every cookie route, the cookie tests', () => {
    const routes = ['src/app/api/auth/sso-callback/route.ts', 'src/app/api/auth/refresh/route.ts', 'src/app/api/auth/logout/route.ts'].filter(has);
    const raw = routes.filter((r) => !read(r).includes('cookieDomainFor('));
    const miss = [
      !has('src/components/pi/SignInGate.tsx') && 'SignInGate',
      raw.length && `no cookieDomainFor: ${raw.join(', ')}`,
      !SRC.some((f) => /sso-user-cookie\.test/.test(f)) && 'sso-user-cookie test',
    ].filter(Boolean);
    return [miss.length === 0, miss.join(' · ')];
  }],
  ['E6', 'Payments — the payment-policy CI step and the ADR-007 guard', () => {
    const ci = read('.github/workflows/ci.yml') || read('../.github/workflows/ci.yml'); // a monorepo app (the Hub) keeps CI one level up
    const guard = CODE.some((f) => /isHubNavigation|__tec_hub_entry/.test(read(f)));
    return [/payment[- ]contract|payment-policy|ADR-009/i.test(ci) && guard, [!/payment[- ]contract|payment-policy|ADR-009/i.test(ci) && 'no payment-policy step', !guard && 'no ADR-007 guard'].filter(Boolean).join(' · ')];
  }],
  ['E7', 'Health and readiness — /api/health · /api/ready', () => {
    const miss = ['src/app/api/health/route.ts', 'src/app/api/ready/route.ts'].filter((p) => !has(p));
    return [miss.length === 0, miss.join(' · ')];
  }],
  ['E8', 'No silent failures — no empty catch block', () => {
    // Template strings are blanked first: an inline <script> (the SSO landing, the Pi
    // loader) is browser code inside a string, not this app's control flow.
    const code = (f) => read(f).replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``');
    const hits = CODE.filter((f) => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(code(f)));
    return [hits.length === 0, hits.length ? `${hits.length} file(s), e.g. ${hits.slice(0, 3).join(', ')}` : ''];
  }],
  ['E9', 'Tests — a coverage floor of at least 60 % lines', () => {
    const cfg = read('vitest.config.ts') || read('vitest.config.mts') || read('vitest.config.js');
    const m = cfg.match(/lines:\s*(\d+)/);
    return [!!m && Number(m[1]) >= 60, m ? `lines: ${m[1]}` : 'no coverage threshold'];
  }],
  ['E10', 'Accessibility — jsx-a11y rules in the lint config', () => {
    const cfg = ['eslint.config.mjs', 'eslint.config.js', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs'].map(read).join('\n');
    return [/jsx-a11y/.test(cfg), 'add eslint-plugin-jsx-a11y'];
  }],
  ['E11', 'Install and share — manifest · icon · Open Graph', () => {
    const miss = [
      !any('src/app/manifest.ts', 'src/app/manifest.json', 'public/manifest.json', 'public/manifest.webmanifest') && 'manifest',
      !any('src/app/icon.png', 'src/app/icon.svg', 'src/app/icon.tsx', 'public/icon.png') && 'icon',
      !/openGraph/.test(read('src/app/layout.tsx')) && 'openGraph metadata',
    ].filter(Boolean);
    return [miss.length === 0, miss.join(' · ')];
  }],
  ['E12', 'Help and feedback reachable', () => {
    const ok = SRC.some((f) => /(^|\/)(help|support|feedback)(\/|[A-Z.-])/i.test(f));
    return [ok, 'no help / feedback page or component'];
  }],
  ['E13', 'Legal — /privacy · /terms', () => {
    const miss = ['src/app/privacy/page.tsx', 'src/app/terms/page.tsx'].filter((p) => !has(p));
    return [miss.length === 0, miss.join(' · ')];
  }],
  ['E14', 'Pi Browser — an e2e run with the Pi Browser user agent', () => {
    const e2e = [...walk('e2e'), 'playwright.config.ts'].map(read).join('\n');
    return [/PiBrowser/.test(e2e), 'no e2e project using the PiBrowser user agent'];
  }],
];

if (args.has('--after-build')) {
  checks.push(['E15', `Performance — /app first-load JS ≤ ${APP_JS_BUDGET_KB} KB gzip`, () => {
    const manifest = read('.next/app-build-manifest.json');
    if (!manifest) return [false, 'no .next/app-build-manifest.json — run `next build` first'];
    const pages = JSON.parse(manifest).pages ?? {};
    const files = new Set([...(pages['/app/page'] ?? []), ...(pages['/layout'] ?? [])].filter((f) => f.endsWith('.js')));
    const kb = [...files].reduce((n, f) => n + gzipSync(readFileSync(join(ROOT, '.next', f))).length, 0) / 1024;
    return [kb <= APP_JS_BUDGET_KB, `${kb.toFixed(0)} KB`];
  }]);
}

const results = checks.map(([id, title, fn]) => { const [pass, detail] = fn(); return { id, title, pass: !!pass, detail: pass ? '' : detail }; });
// Read, never "check then read": no existsSync before the read or the write (CodeQL
// js/file-system-race). A missing floor file reads as an empty floor.
const floorText = read('.app-scorecard.json');
const floor = floorText ? JSON.parse(floorText).required ?? [] : [];
const passing = results.filter((r) => r.pass).map((r) => r.id);
const regressed = floor.filter((id) => results.some((r) => r.id === id && !r.pass));
const gained = passing.filter((id) => !floor.includes(id) && id !== 'E15');

if (args.has('--write-floor')) {
  const required = passing.filter((id) => id !== 'E15');
  writeFileSync(FLOOR_FILE, `${JSON.stringify({ required }, null, 2)}\n`);
  console.log(`floor written: ${required.join(' · ')}`);
  process.exit(0);
}

if (args.has('--json')) {
  console.log(JSON.stringify({ score: passing.length, of: results.length, results, regressed, gained }, null, 2));
} else {
  console.log(`App Excellence scorecard — ${passing.length}/${results.length}`);
  for (const r of results) console.log(`  ${r.pass ? '✅' : (floor.includes(r.id) ? '❌' : '·  ')} ${r.id.padEnd(4)} ${r.title}${r.detail ? `  — ${r.detail}` : ''}`);
  if (gained.length) console.log(`\nNow passing and not yet in the floor: ${gained.join(' · ')} — run with --write-floor to lock them in.`);
}
if (regressed.length) {
  console.error(`\n::error::App Excellence regressed: ${regressed.join(' · ')} passed before and fails now.`);
  process.exit(1);
}
