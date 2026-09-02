import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Light mode existed on paper for months: the token file carried a
// `[data-theme='light']` block, no code ever set the attribute, and every
// component painted from hex literals that could not follow a theme anyway.
//
// Every rule below fails SILENTLY when broken — a wrong colour is not an error,
// it is a screen nobody can read — so each one is pinned here rather than
// trusted to review.
const root = process.cwd();
const src  = (p: string) => readFileSync(join(root, 'src', p), 'utf8');
const css  = readFileSync(join(root, 'src/styles/tec-design-tokens.css'), 'utf8');

const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/** Every component file the app paints with. */
function paintedFiles(dir = 'src', acc: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      paintedFiles(p, acc);
    } else if (/\.tsx?$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe('the token layer defines all three theme states', () => {
  it('has an explicit dark block and an explicit light block', () => {
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain("[data-theme='light']");
  });

  it('follows the phone only when the reader has NOT chosen', () => {
    // Scoped to `:root:not([data-theme])`. Unscoped, a light phone would
    // silently overrule someone who explicitly picked dark — and they would
    // have no way to tell the setting was being ignored.
    expect(css).toMatch(/@media \(prefers-color-scheme: light\)[\s\S]{0,80}:root:not\(\[data-theme\]\)/);
  });

  it('does not pin color-scheme in CSS', () => {
    // It has to follow the stored choice, which only the boot script knows. A
    // hardcoded `dark` gave light mode dark scrollbars and dark form controls.
    expect(strip(css)).not.toMatch(/color-scheme:\s*dark/);
  });

  it('paints the page from a token, not a literal', () => {
    const shell = strip(css).slice(0, strip(css).indexOf(':root'));
    expect(shell).toContain('background: var(--tec-bg)');
    expect(shell).not.toMatch(/background:\s*#[0-9a-fA-F]{6}/);
  });

  it('publishes colour CHANNELS, not just colours', () => {
    // Without these, opacity cannot follow a theme — see the next block.
    for (const t of ['--tec-gold-rgb', '--tec-text-rgb', '--tec-green-rgb']) {
      expect(css).toContain(t);
    }
  });

  it('the ink channels actually flip between the themes', () => {
    const light = css.slice(css.indexOf("[data-theme='light']"));
    expect(light).toMatch(/--tec-text-rgb:\s*0, 0, 0/);
    const dark = css.slice(css.indexOf("[data-theme='dark']"), css.indexOf("[data-theme='light']"));
    expect(dark).toMatch(/--tec-text-rgb:\s*255, 255, 255/);
  });
});

describe('nothing appends alpha to a CSS variable', () => {
  // `var(--tec-gold)33` is invalid CSS and raises NO error: the declaration is
  // dropped and the border silently stops painting. This is the single most
  // likely way for this change to be undone by someone doing the obvious thing.
  const files = paintedFiles();

  it('checks a real set of files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  /**
   * Any interpolation that yields a token, with two hex digits stuck on the end.
   *
   * This started as `\$\{\s*C\.\w+\s*\}` — matching only the ONE form I had
   * seen. Three more turned up afterwards, each doing exactly the same damage:
   *
   *     `${C.gold}22`                      the original
   *     `${(v ? C.gold : C.subtext)}55`     an expression, not a bare member
   *     C.subtext + '55'                    concatenation, no template at all
   *     rgba(5,8,22,0.92)                   a raw colour (covered further down)
   *
   * So this matches an interpolation CONTAINING a token rather than one shaped
   * a particular way. Chasing syntax one form at a time is how a guard ends up
   * finding each bug once.
   */
  const ALPHA_ON_TOKEN = /\$\{[^}]*(?:C\.[a-zA-Z0-9]+|var\(--tec-[a-z0-9-]+\))[^}]*\}[0-9a-fA-F]{2}/;
  const CONCAT_ALPHA   = /(?:C\.[a-zA-Z0-9]+|var\(--tec-[a-z0-9-]+\)['"`]?)\s*\+\s*['"`][0-9a-fA-F]{2}['"`]/;

  it('no alpha appended to an interpolated token, in ANY form', () => {
    const offenders = files.filter((f) => ALPHA_ON_TOKEN.test(strip(src(f.slice(4)))));
    expect(offenders).toEqual([]);
  });

  it('no alpha CONCATENATED onto a token', () => {
    const offenders = files.filter((f) => CONCAT_ALPHA.test(strip(src(f.slice(4)))));
    expect(offenders).toEqual([]);
  });

  it('no bare `var(--tec-…)NN`', () => {
    const offenders = files.filter((f) => /var\(--tec-[a-z0-9-]+\)[0-9a-fA-F]{2}/.test(strip(src(f.slice(4)))));
    expect(offenders).toEqual([]);
  });

  it('every form the app has actually shipped is caught', () => {
    // Each of these was real, in this repo, and each shipped past an earlier
    // version of this test.
    expect(ALPHA_ON_TOKEN.test('`1px solid ${C.gold}22`')).toBe(true);
    expect(ALPHA_ON_TOKEN.test('`1px solid ${(v ? C.gold : C.subtext)}55`')).toBe(true);
    expect(CONCAT_ALPHA.test("border: C.subtext + '55'")).toBe(true);
    // …and the correct forms must NOT trip it, or the guard becomes noise
    // people learn to route around.
    expect(ALPHA_ON_TOKEN.test('`1px solid ${goldA(0.33)}`')).toBe(false);
    expect(CONCAT_ALPHA.test('const s = C.gold + suffix')).toBe(false);
  });
});

describe('components paint from tokens, not from fixed hex', () => {
  it('TEC_COLORS is no longer imported into any component', () => {
    // Those are plain hex by contract (the package pins it), which is right for
    // the package and fatal here: a hex baked into a style={{}} is decided at
    // render and can never follow the page.
    const offenders = paintedFiles()
      .filter((f) => !f.endsWith('lib-client/palette.ts'))
      .filter((f) => /TEC_COLORS/.test(src(f.slice(4))));
    expect(offenders).toEqual([]);
  });
});

describe('the theme is applied before the first paint', () => {
  const layout = strip(src('app/layout.tsx'));

  it('runs the boot script inline in <head>', () => {
    // Anything deferred paints too late: the page renders dark and snaps to
    // light on every load, which is worse than not offering the choice.
    expect(layout).toContain('THEME_BOOT_SCRIPT');
    expect(layout).toMatch(/<head>[\s\S]*THEME_BOOT_SCRIPT/);
  });

  it('suppresses the hydration warning it deliberately causes', () => {
    expect(layout).toMatch(/<html[^>]*suppressHydrationWarning/);
  });

  it('gives the browser chrome a colour per scheme', () => {
    // One dark theme-color left a black bar sitting on top of a light app.
    expect(layout).toMatch(/theme-color[\s\S]{0,80}prefers-color-scheme: dark/);
    expect(layout).toMatch(/theme-color[\s\S]{0,80}prefers-color-scheme: light/);
  });

  it('no longer declares a fixed color-scheme meta', () => {
    expect(layout).not.toMatch(/name="color-scheme"/);
  });
});

describe('"system" stays a live choice, not a snapshot', () => {
  const theme = strip(src('lib-client/theme.ts'));

  it('REMOVES the attribute for system instead of resolving it', () => {
    // Resolving it here would freeze the page at whatever the phone was when
    // this ran; removing it lets the media query keep tracking.
    expect(theme).toMatch(/choice === 'system'[\s\S]{0,80}removeAttribute\('data-theme'\)/);
  });

  it('degrades to following the phone when storage is blocked', () => {
    // Private mode. A theme is a preference, not a feature.
    expect(theme).toMatch(/catch[\s\S]{0,120}return 'system'/);
  });
});

// ── The hole this suite had, and the bug that found it ──────────────────────
//
// The first version checked for `${C.x}NN`, for `var(--tec-…)NN`, and for
// TEC_COLORS imports. The bottom nav was a hardcoded `rgba(5,8,22,0.92)` —
// none of those patterns — so it sailed through, and on a light page the bar
// stayed black while the inactive tab icons, drawn from an ink token, flipped
// to black. Every tab was invisible until you tapped it and it turned gold.
//
// A guard that only knows the shapes of the bugs already found is a guard that
// finds each bug once. These check for a RAW COLOUR of any shape.
describe('no component paints a raw colour', () => {
  /**
   * The two places a literal is CORRECT, each for a different reason.
   *
   * Listed by file rather than by value, so adding one is a visible decision in
   * a diff — the same shape as TEMPLATE_FILES in the silent-failures guard.
   *
   *   · sso-callback — plain HTML served BEFORE any stylesheet loads. It cannot
   *     read a CSS variable at all, so its colours are hex by necessity. This
   *     is a platform-wide rule, not a local shortcut: the KB says explicitly
   *     not to "fix" this file or `next/og` into var(), because Satori and a
   *     pre-stylesheet document both resolve no custom properties.
   *   · layout — the two `theme-color` metas. A <meta> content attribute is not
   *     CSS; it takes a literal, and there are already two of them, one per
   *     scheme, which is the whole point.
   */
  const EXEMPT_FILES = [
    'app/api/auth/sso-callback/route.ts',
    'app/layout.tsx',
  ];

  const files = paintedFiles()
    .filter((f) => !f.endsWith('lib-client/palette.ts'))
    .filter((f) => !EXEMPT_FILES.some((e) => f.endsWith(e)));

  /**
   * Colours that are correct to hardcode.
   *
   * `#0a0800` and the ink-on-a-solid-object family are fixed in both themes by
   * design — but they have TOKENS now (`C.onGold`), so nothing needs the
   * literal. This list is empty on purpose: if a real exception turns up, it is
   * added here in a diff someone can see, rather than by widening the pattern.
   */
  const ALLOWED_LITERALS: string[] = [];

  it('no `rgba()` with literal channels — use bgA / inkA / goldA / successA / errorA', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = strip(src(f.slice(4)));
      for (const m of code.matchAll(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g)) {
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no `#rrggbb` literal in a component', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = strip(src(f.slice(4)));
      for (const m of code.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        if (ALLOWED_LITERALS.includes(m[0])) continue;
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('both checks can actually fail', () => {
    expect(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+/.test("background: 'rgba(5,8,22,0.92)'")).toBe(true);
    expect(/#[0-9a-fA-F]{6}\b/.test("color: '#050816'")).toBe(true);
    // …and must NOT fire on the token form that replaced them.
    expect(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+/.test('rgba(var(--tec-bg-rgb), 0.92)')).toBe(false);
  });
});

describe('a translucent surface follows the theme too', () => {
  it('the page background publishes channels', () => {
    // A frosted bar cannot use `var(--tec-bg)` — it needs an alpha — so without
    // channels it will be hardcoded again by whoever builds the next one.
    expect(css).toContain('--tec-bg-rgb');
    const light = css.slice(css.indexOf("[data-theme='light']"));
    expect(light).toMatch(/--tec-bg-rgb:\s*244, 243, 241/);
  });

  it('the bottom nav paints from them', () => {
    const nav = strip(src('app/app/components/BottomNav.tsx'));
    expect(nav).toContain('bgA(');
    expect(nav).not.toContain('rgba(5,8,22');
  });
});
