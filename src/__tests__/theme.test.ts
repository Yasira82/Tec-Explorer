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

  it('no `${C.x}NN` anywhere', () => {
    const offenders = files.filter((f) => /\$\{\s*C\.[a-zA-Z0-9]+\s*\}[0-9a-fA-F]{2}/.test(strip(src(f.slice(4)))));
    expect(offenders).toEqual([]);
  });

  it('no `var(--tec-…)NN` anywhere', () => {
    const offenders = files.filter((f) => /var\(--tec-[a-z0-9-]+\)[0-9a-fA-F]{2}/.test(strip(src(f.slice(4)))));
    expect(offenders).toEqual([]);
  });

  it('the check can actually fail', () => {
    // Guards against a regex that matches nothing and reports green forever.
    expect(/\$\{\s*C\.[a-zA-Z0-9]+\s*\}[0-9a-fA-F]{2}/.test('`1px solid ${C.gold}22`')).toBe(true);
    expect(/var\(--tec-[a-z0-9-]+\)[0-9a-fA-F]{2}/.test('var(--tec-gold)33')).toBe(true);
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
