import { describe, it, expect } from 'vitest';
import { LOCALES, type Locale } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';
import { ar } from '@/lib/i18n/ar';
import { zh } from '@/lib/i18n/zh';
import { ko } from '@/lib/i18n/ko';
import { vi } from '@/lib/i18n/vi';
import { id } from '@/lib/i18n/id';
import { es } from '@/lib/i18n/es';
import { tr } from '@/lib/i18n/tr';
import { fr } from '@/lib/i18n/fr';
import { fa } from '@/lib/i18n/fa';
import { ur } from '@/lib/i18n/ur';
import { hi } from '@/lib/i18n/hi';

// Every string a person reads must exist in BOTH languages.
//
// This app ships to an Arabic-speaking user base, and it already had `ar.ts`
// and a working RTL switch — then a whole feature set (map, photos, reviews,
// follow, the listing form) was added in hardcoded English. It looked complete
// in development and half-translated on a real phone.
//
// TypeScript does not catch it: `ar` only has to satisfy the shape it is
// declared with, and a hardcoded string in JSX satisfies nothing at all. So the
// parity check is here, and the placeholder check with it — a key whose Arabic
// forgot `{n}` renders the literal braces to the user.

type Tree = { [k: string]: string | Tree };

const flatten = (obj: Tree, prefix = ''): Record<string, string> =>
  Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});

const BUNDLES: Record<Locale, Tree> = {
  en, ar, zh, ko, vi, id, es, tr, fr, fa, ur, hi,
} as unknown as Record<Locale, Tree>;

const EN = flatten(en as unknown as Tree);
const AR = flatten(ar as unknown as Tree);
/** Every locale except the source one, flattened. */
const OTHERS = (Object.keys(BUNDLES) as Locale[])
  .filter((c) => c !== 'en')
  .map((c) => [c, flatten(BUNDLES[c])] as const);

/** `{name}` / `{n}` / `{total}` — the slots a caller fills in. */
const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the two locales carry the same keys', () => {
  it('Arabic is missing nothing English has', () => {
    expect(Object.keys(EN).filter((k) => !(k in AR))).toEqual([]);
  });

  it('English is missing nothing Arabic has', () => {
    // A stray Arabic-only key is dead weight, and usually the sign of a rename
    // applied to one file.
    expect(Object.keys(AR).filter((k) => !(k in EN))).toEqual([]);
  });

  it('no value is left empty', () => {
    // An empty string renders as nothing, which reads as a broken screen rather
    // than an untranslated one.
    expect(Object.entries(AR).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    expect(Object.entries(EN).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });
});

describe('placeholders survive translation', () => {
  it('every key has the same slots in both languages', () => {
    // "{n} نتيجة" that lost its {n} silently drops the number; one that gained
    // a slot nobody fills renders literal braces on screen.
    const mismatched = Object.keys(EN)
      .filter((k) => k in AR)
      .filter((k) => JSON.stringify(slots(EN[k]!)) !== JSON.stringify(slots(AR[k]!)));
    expect(mismatched).toEqual([]);
  });

  it('the check can actually fail', () => {
    expect(slots('{n} results')).toEqual(['n']);
    expect(slots('results')).toEqual([]);
  });
});

describe('the Arabic really is Arabic', () => {
  it('the new feature strings are not English left in place', () => {
    // The regression this file exists for: a key added to ar.ts by copying the
    // English value. Checked on the keys that were added last, where it would
    // have happened.
    const arabic = /[؀-ۿ]/;
    for (const key of ['reviews', 'nearMe', 'visitContact', 'listPitchTitle', 'photoHint']) {
      expect(AR[`explorer.${key}`], key).toMatch(arabic);
    }
  });
});

describe('every language stays in step with English', () => {
  it.each(OTHERS)('%s has exactly the English keys', (_code, T) => {
    // Both directions. A missing key renders English to someone who chose
    // another language; a stray one is dead weight, and usually the sign of a
    // rename applied to one file out of twelve.
    expect(Object.keys(EN).filter((k) => !(k in T))).toEqual([]);
    expect(Object.keys(T).filter((k) => !(k in EN))).toEqual([]);
  });

  it.each(OTHERS)('%s leaves no value empty', (_code, T) => {
    expect(Object.entries(T).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it.each(OTHERS)('%s keeps every placeholder', (_code, T) => {
    // "{n} results" that lost its {n} silently drops the number; one that
    // gained a slot nobody fills renders literal braces on screen.
    const bad = Object.keys(EN)
      .filter((k) => JSON.stringify(slots(EN[k]!)) !== JSON.stringify(slots(T[k]!)));
    expect(bad).toEqual([]);
  });

  it.each(OTHERS)('%s is not just English copied across', (code, T) => {
    // The failure mode when adding a language in bulk: a file that parses, has
    // every key, and is entirely untranslated. A handful of values SHOULD stay
    // identical (brand names, "Pi", "Spam" in several languages), so this
    // measures the proportion rather than demanding every string differ.
    const comparable = Object.keys(EN).filter((k) => EN[k]!.length > 12);
    const same = comparable.filter((k) => T[k] === EN[k]);
    expect(same.length / comparable.length, `${code}: ${same.length}/${comparable.length} identical`)
      .toBeLessThan(0.15);
  });

  it('the language menu lists exactly the bundles that exist', () => {
    // A locale in LOCALES with no bundle is a crash on selection; a bundle not
    // in LOCALES is a language nobody can reach.
    expect(Object.keys(LOCALES).sort()).toEqual(Object.keys(BUNDLES).sort());
  });

  it('every language is offered under its own name', () => {
    // Someone who cannot read the current UI language cannot read "Vietnamese"
    // either — but they can always read "Tiếng Việt".
    for (const [code, meta] of Object.entries(LOCALES)) {
      expect(meta.native.trim(), code).not.toBe('');
    }
  });
});
