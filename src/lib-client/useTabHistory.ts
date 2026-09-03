'use client';

// Make the phone's Back button step back through the app, not out of it.
//
// The tabs are React state, so the browser history knows nothing about them.
// A visitor who opened Discover → My Business → Settings had made ONE history
// entry between them — the page load — so Back went straight past all three and
// left for whatever came before, usually the Hub. Three taps in, and Back
// throws away all three.
//
// So each tab change gets its own entry, and Back walks them.
//
// ── Two details that make this safe ─────────────────────────────────────────
//
// The tab lives in `history.state`, not in the URL. The URL is registered with
// the Pi Developer Portal and is what the SSO landing returns to; adding
// `?tab=settings` to it would mean a share, a bookmark or a re-entry could land
// somewhere other than the app's front door. `history.state` is invisible to
// all of that and survives a reload of the same entry.
//
// A `replaceState` on mount gives the FIRST tab an entry of its own. Without it
// the base entry has no tab recorded, so coming back to it would fall through
// to the default — correct by luck for `discover`, wrong for anyone deep-linked
// anywhere else later.
//
// Back from the first tab still leaves the app, and that is right: there is
// nothing before it to go back to.
import { useCallback, useEffect, useRef, useState } from 'react';

interface TabState { tecTab?: string }

export function useTabHistory<T extends string>(initial: T) {
  const [tab, setTab] = useState<T>(initial);

  // Read by `select` without making it depend on `tab` — a changing callback
  // identity would re-render every consumer of the nav on each switch.
  const current = useRef<T>(initial);
  current.current = tab;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const state = window.history.state as TabState | null;
    if (!state?.tecTab) {
      // Same entry, same URL — only the state gains a field.
      window.history.replaceState({ ...(state ?? {}), tecTab: initial }, '');
    }

    const onPop = (e: PopStateEvent) => {
      const next = (e.state as TabState | null)?.tecTab;
      // An entry that is not ours (anything pushed by another part of the app,
      // or the entry we arrived on) falls back to the front door rather than
      // leaving the screen on whatever was last rendered.
      setTab((next ?? initial) as T);
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [initial]);

  const select = useCallback((next: T) => {
    // Re-tapping the tab you are on must not stack an entry — otherwise Back
    // appears to do nothing, once per stray tap.
    if (next === current.current) return;
    if (typeof window !== 'undefined') {
      window.history.pushState(
        { ...((window.history.state as TabState | null) ?? {}), tecTab: next }, '',
      );
    }
    setTab(next);
  }, []);

  return [tab, select] as const;
}
