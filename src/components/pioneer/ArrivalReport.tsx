'use client';

// Renders nothing. Tells the platform, once per browsing session, that a
// pioneer actually reached this app.
//
// ── Why the Hub cannot do this ─────────────────────────────────────────────
//
// The Hub records a campaign visit when a mission link is TAPPED, and the tap
// and the arrival are two independent events: the record succeeds whether or
// not this app ever loaded. A closed tab, a dead link, or an app that is down
// all count exactly like a visit.
//
// Pi accepts a `.pi` domain claim only once the app has 5 unique KYC'd pioneers
// *engage with the app*, measured at the app. So the only place that can honestly
// say "somebody arrived" is the app itself. This is that sentence.
//
// ── Once per session, not once per page ────────────────────────────────────
//
// The backend upserts, so repeats are harmless — but a POST on every render is
// a cost with no answer attached. `sessionStorage` closes over exactly the right
// window: a new visit is a new report, a second page within the same visit is
// not, and nothing is remembered after the tab closes.
//
// ── Silent, always ─────────────────────────────────────────────────────────
//
// Nobody asked for this request. It is bookkeeping the platform wants, and
// bookkeeping that can interrupt somebody's visit is worse than bookkeeping
// that is occasionally missing. Every failure path ends here, including a
// sessionStorage that throws in a private window.

import { useEffect } from 'react';

const ONCE_KEY = 'tec_arrival_reported';

export function ArrivalReport() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(ONCE_KEY)) return;
    } catch { /* ignore */
      // Private window, or storage blocked. Report anyway — a duplicate costs
      // one upsert; skipping costs the visit.
      //
      // The `/* ignore */` marker is not decoration: `no-silent-failures` reads
      // it as "this emptiness is a decision". A catch that says nothing is
      // indistinguishable from a catch somebody forgot to finish, which is the
      // whole reason that guard exists (C-96).
    }

    // The route requires a session and answers 401 without one, which is the
    // correct outcome for a signed-out visitor: an arrival the platform cannot
    // attribute to a pioneer is not an arrival it can count.
    void fetch('/api/bff/pioneer/arrived', {
      method:      'POST',
      credentials: 'include',
      // The visit may navigate away immediately — this is the tab a mission
      // link opened. `keepalive` lets the browser finish the POST after
      // navigation, which is the same reason the Hub's tap record uses it.
      keepalive:   true,
    })
      .then(async (res) => {
        // Marked only when the platform actually RECORDED it. A failed report
        // should be retried on the next page, not silently treated as done.
        //
        // `res.ok` alone was not that: the route answers 200 with
        // `{ recorded: false }` when the gateway refuses or is not configured —
        // on purpose, so bookkeeping never fails a page. Reading only the
        // status, the reporter took every refusal as success and never asked
        // again for the rest of the visit.
        if (!res.ok) return;
        const body = await res.json().catch(() => null) as { recorded?: unknown } | null;
        if (body?.recorded === true) {
          try { sessionStorage.setItem(ONCE_KEY, '1'); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  return null;
}
