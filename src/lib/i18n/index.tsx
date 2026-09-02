'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { reportError } from '@/lib/observability/reportError';
import { en } from './en';

// The languages Explorer speaks.
//
// Chosen by where the Pi community actually is, not by what is easy: Chinese,
// Korean, Vietnamese and Indonesian are among the largest Pi populations in the
// world, and a discovery app that only speaks English is invisible to most of
// the people it exists to serve.
//
// ⚠️ HONEST LABEL: these translations are mine, not native-reviewed. They are
// meant to be correct and idiomatic, and a native speaker will still find
// phrasing to improve. Treat each file as a good first draft that a speaker of
// that language should read — the structure is what is guaranteed here (the
// parity test enforces it); the wording is what deserves a second pair of eyes.
export const LOCALES = {
  en: { label: 'English',    native: 'English' },
  ar: { label: 'Arabic',     native: 'العربية' },
  zh: { label: 'Chinese',    native: '中文' },
  ko: { label: 'Korean',     native: '한국어' },
  vi: { label: 'Vietnamese', native: 'Tiếng Việt' },
  id: { label: 'Indonesian', native: 'Bahasa Indonesia' },
  es: { label: 'Spanish',    native: 'Español' },
  tr: { label: 'Turkish',    native: 'Türkçe' },
  fr: { label: 'French',     native: 'Français' },
  fa: { label: 'Persian',    native: 'فارسی' },
  ur: { label: 'Urdu',       native: 'اردو' },
  hi: { label: 'Hindi',      native: 'हिन्दी' },
} as const;

export type Locale = keyof typeof LOCALES;

/**
 * Right-to-left scripts.
 *
 * A SET, not `locale === 'ar'`. That comparison was correct while Arabic was the
 * only RTL language and silently wrong the moment Persian and Urdu arrived —
 * they would have rendered left-to-right with no error anywhere, which is the
 * kind of bug that only a reader of that language notices.
 */
const RTL: ReadonlySet<Locale> = new Set<Locale>(['ar', 'fa', 'ur']);

type Translations = typeof en;

/**
 * Every language EXCEPT the default is loaded on demand.
 *
 * Importing all twelve statically put 33 kB of translations into the first load
 * of every visit — eleven languages nobody in that session reads, downloaded
 * over a phone connection before the app can paint. On a Pi Browser app whose
 * whole point is being opened casually, that is a real cost for zero benefit.
 *
 * `en` stays static because it is what the first render uses (see below), so
 * making it async would only add a flash of nothing.
 *
 * Each bundle is ~9 kB and is fetched once, when a person actually picks that
 * language or their browser asks for it.
 */
const LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<Translations>> = {
  ar: () => import('./ar').then((m) => m.ar),
  zh: () => import('./zh').then((m) => m.zh),
  ko: () => import('./ko').then((m) => m.ko),
  vi: () => import('./vi').then((m) => m.vi),
  id: () => import('./id').then((m) => m.id),
  es: () => import('./es').then((m) => m.es),
  tr: () => import('./tr').then((m) => m.tr),
  fr: () => import('./fr').then((m) => m.fr),
  fa: () => import('./fa').then((m) => m.fa),
  ur: () => import('./ur').then((m) => m.ur),
  hi: () => import('./hi').then((m) => m.hi),
};

interface LocaleContextValue {
  locale:    Locale;
  setLocale: (locale: Locale) => void;
  t:         Translations;
  dir:       'ltr' | 'rtl';
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

const isLocale = (v: string | null): v is Locale => !!v && v in LOCALES;

function applyDir(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', RTL.has(locale) ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', locale);
}

/**
 * The language to start in, when nobody has chosen one.
 *
 * Reads the browser's own preference rather than defaulting everyone to English.
 * A Vietnamese speaker opening this app should not have to find the language
 * menu before the app makes sense — and the menu is on the LAST tab, which they
 * cannot read either.
 *
 * Matched on the primary subtag only: `zh-Hans-CN`, `zh-TW` and `zh` all mean
 * Chinese here, and refusing them over a region code would default a Chinese
 * speaker to English for no reason.
 */
function preferredLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const primary = String(tag ?? '').toLowerCase().split('-')[0];
    if (isLocale(primary ?? null)) return primary as Locale;
  }
  return null;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Starts at 'en' on the server AND on the first client render, deliberately:
  // reading navigator during render would make the two disagree and hydration
  // would fail. The real choice is applied in the effect below.
  const [locale, setLocaleState] = useState<Locale>('en');
  const [bundle, setBundle] = useState<Translations>(en);

  /**
   * Switch language, fetching the bundle if it is not the default.
   *
   * The direction flips IMMEDIATELY and the text follows when the bundle
   * arrives. That ordering is deliberate: the layout is what a reader notices
   * first, and a page that jumps from LTR to RTL a moment after the words
   * changed looks broken twice instead of once.
   *
   * A failed fetch (offline mid-switch) leaves the previous language on screen
   * rather than blanking the app — English text is a worse outcome than the
   * language you were already reading, and no text at all is worse than both.
   */
  const apply = useCallback(async (next: Locale) => {
    applyDir(next);
    setLocaleState(next);
    if (next === 'en') { setBundle(en); return; }
    try {
      setBundle(await LOADERS[next]());
    } catch (err) {
      reportError(err, { where: 'i18n.load', locale: next });
    }
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('tec_locale');
    } catch { /* ignore */ }
    // Storage throws in a private window and there is nothing to report: the
    // browser preference resolved below is a better answer than English anyway,
    // so the failure carries no information worth logging.
    // An explicit choice always wins over the browser's guess — someone who
    // picked English on an Arabic phone meant it.
    const next = isLocale(saved) ? saved : preferredLocale();
    if (next && next !== 'en') void apply(next);
  }, [apply]);

  const setLocale = (newLocale: Locale) => {
    void apply(newLocale);
    try { localStorage.setItem('tec_locale', newLocale); } catch { /* ignore */ }
  };

  return (
    <LocaleContext.Provider value={{
      locale,
      setLocale,
      t:   bundle,
      dir: RTL.has(locale) ? 'rtl' : 'ltr',
    }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useTranslation must be used inside a LocaleProvider');
  return ctx;
}
