import { describe, it, expect } from 'vitest';
import { en } from '@/lib/i18n/en';
import { ar } from '@/lib/i18n/ar';

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

const EN = flatten(en as unknown as Tree);
const AR = flatten(ar as unknown as Tree);

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
