'use client';

// A way back to the Founding 100 Quest that does not depend on the browser.
//
// ── Why the back button cannot do this job ──────────────────────────────────
//
// Pi Browser has NO TABS. Its top-right control opens an "About Current URL"
// panel with a recently-visited list — there is no second tab to return to, so
// `target="_blank"` on the Quest link is inert there and the Hub page does not
// stay open behind the visit.
//
// That leaves the single history stack, and the first visit to any app pushes
// the whole SSO chain onto it (app landing → Hub SSO → back). Pressing back
// from `/app` walks into that chain and surfaces at the HUB'S OWN LANDING PAGE
// — observed, not theorised. A pioneer who wanted the next app instead gets a
// "Sign in with Pi" screen for a session they already have.
//
// So the return has to be a FORWARD navigation to a known URL. That is the one
// thing that behaves the same in every browser.
//
// ── Why a marker, and why it is remembered ─────────────────────────────────
//
// Zone is a real app with real users; a permanent "back to the Quest" bar would
// be wrong for all of them. The Hub's Quest link carries `?q=1`, and only a
// visitor who arrived that way sees the bar.
//
// It is remembered in `sessionStorage` because the param does NOT survive a
// first visit: `/app?q=1` with no session is redirected to the sign-in landing,
// and the query is dropped on the way. The middleware now carries `q` across
// that hop, the landing captures it here, and the bar appears after sign-in —
// which is exactly the visit where the pioneer is most likely to be lost.
//
// Bounded to six hours: the Quest is one sitting. A flag with no end would
// still be showing a campaign bar to somebody using Zone for its own sake
// tomorrow.
//
// ── Strings live here, not in the dictionaries ─────────────────────────────
//
// This file is copied verbatim into twenty-three apps. A version that also
// needed two dictionary edits per app is a version that gets pasted wrong
// somewhere, and the campaign bar is not app vocabulary.
//
// ── Colour: this repo's token map — the ONE fleet variant ─────────────────
//
// Three ways to paint this, and no single one survives the whole fleet:
//
//   hex literals    This repo's theme guard forbids them in a component, and
//                   it is right: a literal is decided at render and can never
//                   follow a theme.
//   var(--tec-*)    Correct in the 21 apps whose layout imports the token file.
//                   Paints NOTHING in Assets, Commerce and Ecommerce, which do
//                   not — and paints nothing SILENTLY, the exact failure that
//                   guard exists to catch.
//   package colours The twenty other apps use the design package's constants:
//                   plain hex at runtime, so they need no token file. Banned
//                   here, for the same reason literals are.
//
// So this is the one variant, and `C` / `goldA()` are this repo's own token
// map. Twenty apps share the other version verbatim; this one is shared by the
// three repos that carry a theme guard AND a palette helper — Life, Connection
// and Explorer.
//
// That is the fleet being uneven, recorded rather than papered over. Forcing
// twenty repos up to this discipline, or these three down to hex, is a much
// larger change than a way back from a campaign link, and it is not this
// change's to make.

import { useEffect, useState } from 'react';
import { C, goldA } from '@/lib-client/palette';

const FLAG   = 'tec_quest_return';
const WINDOW_MS = 6 * 60 * 60 * 1000;

/** The Hub, sanitised. A non-http placeholder here becomes a dead link — the
 *  `C_HUB_URL` shape that once made login 404 across the fleet. */
const HUB = (() => {
  const raw = (process.env.NEXT_PUBLIC_HUB_URL ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return 'https://hub.tecosystem.app';
  try { return new URL(raw).origin; } catch { return 'https://hub.tecosystem.app'; }
})();

/**
 * Where `q` sends you back to — a CLOSED SET, keyed by a fixed value.
 *
 * Two Hub surfaces send pioneers into apps and both leave them stranded the
 * same way: the Founding 100 Quest (`/pioneers`) and the reward campaign
 * (`/hub/campaign`). A pioneer sent by the campaign and handed a link back to
 * the Quest has been returned to the wrong errand.
 *
 * The destination is LOOKED UP, never taken from the URL. `?q=/hub/campaign`
 * would have been shorter and would have made this component render a path a
 * stranger chose — on a page that exists to tell somebody where to go next.
 * The value is an index into this table or it is nothing.
 */
const RETURN_TO: Record<string, { path: string; en: [string, string]; ar: [string, string] }> = {
  '1': {
    path: '/pioneers',
    en: ['Back to the Quest',   'Founding 100'],
    ar: ['ارجع للمهمة',          'المئة المؤسِّسة'],
  },
  '2': {
    path: '/hub/campaign',
    en: ['Back to the campaign', 'Pioneer reward'],
    ar: ['ارجع للحملة',           'مكافأة الرواد'],
  },
};

/**
 * The reader's language, read the way the provider WRITES it.
 *
 * Deliberately not `useTranslation()`. This file is copied verbatim into
 * twenty-two more apps, and a hook import is a dependency each of them has to
 * satisfy identically — `tec-template-base` has no `LocaleProvider` at all, so
 * the hook there does not degrade, it THROWS ("must be used within
 * LocaleProvider") and takes the whole layout with it. A component whose job is
 * to rescue a stranded visitor must not be the thing that breaks the page.
 *
 * `tec_locale` is the same key `setLocale` persists, and `<html lang>` is set
 * by the same provider — so this agrees with the app when there is one, and
 * still answers when there is not. Server render has neither; 'en' until the
 * effect runs, which is also when the bar first appears.
 */
function readLocale(): 'en' | 'ar' {
  try {
    if (localStorage.getItem('tec_locale') === 'ar') return 'ar';
  } catch { /* ignore */ } // storage blocked — the document answers next
  try {
    if (document.documentElement.lang === 'ar') return 'ar';
  } catch { /* ignore */ } // no document — server render; 'en' until the effect
  return 'en';
}

export function QuestReturn() {
  const [locale, setLocale] = useState<'en' | 'ar'>('en');
  /** The key into RETURN_TO, or null. Never a path read off the URL. */
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    setLocale(readLocale());
    let marked: string | null = null;

    // Arrived from a Hub surface — remember WHICH one before the URL is cleaned.
    try {
      const q = new URLSearchParams(window.location.search).get('q');
      if (q && Object.prototype.hasOwnProperty.call(RETURN_TO, q)) {
        // `key|timestamp`. One entry, because two would eventually disagree —
        // a remembered destination and a separate remembered time can be
        // written apart and read together.
        sessionStorage.setItem(FLAG, `${q}|${Date.now()}`);
        marked = q;
      }
    } catch { /* ignore */ } // private window, or storage blocked — the read decides

    // Take the marker out of the address bar. It is campaign plumbing; leaving
    // it there means it gets shared, bookmarked, and eventually reported as a
    // bug in a URL nobody meant to publish.
    if (marked) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('q');
        window.history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch { /* ignore */ } // replaceState is cosmetic — it never decides the bar
    }

    try {
      const parts = (sessionStorage.getItem(FLAG) ?? '').split('|');
      const key = parts[0] ?? '';
      const at  = Number(parts[1] ?? '');
      const fresh = Number.isFinite(at) && at > 0 && Date.now() - at < WINDOW_MS;
      // Checked against the table on the way OUT as well as the way in. A value
      // written by an older build, or by hand, resolves to nothing rather than
      // to a broken link.
      setFrom(fresh && Object.prototype.hasOwnProperty.call(RETURN_TO, key) ? key : null);
    } catch {
      // Storage unreadable. Show it only if THIS load carried the marker —
      // a pioneer who just arrived still gets their way back.
      setFrom(marked);
    }
  }, []);

  const dest = from ? RETURN_TO[from] : undefined;
  if (!dest) return null;

  const [back, hint] = locale === 'ar' ? dest.ar : dest.en;

  return (
    <a
      href={`${HUB}${dest.path}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', textDecoration: 'none',
        background: C.surface, borderBottom: `1px solid ${goldA(0.2)}`,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* The arrow points back in reading order, so it still means "back" in
          Arabic instead of pointing at the next app. */}
      <span style={{ color: C.gold, fontSize: 16, lineHeight: 1 }}>
        {locale === 'ar' ? '→' : '←'}
      </span>
      <span style={{ color: C.gold, fontSize: 13, fontWeight: 800 }}>{back}</span>
      <span style={{ color: C.subtext, fontSize: 11, marginInlineStart: 'auto' }}>
        {hint}
      </span>
    </a>
  );
}
