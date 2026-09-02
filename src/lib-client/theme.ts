'use client';

/**
 * Light / dark, and the reader's choice remembered.
 *
 * The token layer carried a `[data-theme='light']` block from the start
 * and nothing ever set the attribute — so light mode existed on paper only.
 * This is the missing half: read a stored choice, fall back to the phone, and
 * stamp the attribute on <html> so the token layer can do its job.
 *
 * Three states, not two. "system" is a real choice — it is the default, and it
 * means the app follows the phone at all times rather than freezing whatever
 * the phone happened to be on first launch.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'tec_theme';

export const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export function readTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    // Private mode / blocked storage. A theme is a preference, not a feature —
    // degrade to following the phone rather than failing.
    return 'system';
  }
}

/**
 * Stamp the choice on <html>. "system" REMOVES the attribute rather than
 * resolving it here: the token layer already follows `prefers-color-scheme`
 * when no attribute is present, so the page keeps tracking the phone live
 * instead of freezing at whatever it was when this ran.
 */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  // Tells the browser which UA colours to use for form controls and the
  // scrollbar, so native chrome stops looking pasted on.
  root.style.colorScheme = choice === 'system' ? 'light dark' : choice;
}

export function saveTheme(choice: ThemeChoice): void {
  // /* ignore */ — storage throws in a private window and there is nothing to
  // report: the theme is still APPLIED on the line below, so the reader gets
  // what they asked for for this session and only the remembering is lost.
  try { localStorage.setItem(KEY, choice); } catch { /* ignore */ }
  applyTheme(choice);
}

/** What the reader will actually SEE right now, with "system" resolved. */
export function resolvedTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Runs before paint, inlined in <head>. Without it the page renders in the
 * default theme and then snaps to the stored one — a flash on every load,
 * which is worse than not offering the choice.
 */
/*
 * The empty catch here is deliberate and is the ONE place it is not a smell.
 *
 * This runs synchronously in <head> before anything is painted. There is no
 * reporter loaded yet, no React, and no screen to draw an error on — and a
 * throw here would block the first paint of the whole app to report that a
 * COLOUR PREFERENCE could not be read. The failure mode is already correct: no
 * attribute is stamped, so the page follows the phone.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var v=localStorage.getItem('${KEY}');
if(v==='light'||v==='dark'){document.documentElement.setAttribute('data-theme',v);document.documentElement.style.colorScheme=v;}
else{document.documentElement.style.colorScheme='light dark';}
}catch(e){/* ignore */}})();`;
