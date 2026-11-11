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
// ── Only after THIS app's own Pi sign-in (F3, #47) ─────────────────────────
//
// It used to fire on page load. Pi counts something narrower: a KYC'd Pioneer
// who signed in with Pi IN THIS APP. So coverage read 5/5 while Pi said
// "Requirements Not Met" (C-02 row 2), and a visit opened from the Hub grid —
// a Hub-owned Pi session (ADR-007) that never signs in here — was counted too.
// Now the report waits for `piSession.onSignedIn`: the warm-up's handshake, a
// tap's, or this app's login. No handshake, no arrival — the way Pi sees it.
//
// ── At most every 10 minutes per tab, not once per tab ─────────────────────
//
// The backend upserts, so repeats are harmless — but a POST on every page is a
// cost with no answer attached, so a recorded report is remembered per tab.
//
// It used to be remembered for the life of the tab, and a Pi Browser tab lives
// for days. When the server lost an arrival (a re-sent Hub tap cleared it —
// tec-core-backend #378), going back to this app in the same tab never sent it
// again, and the Round 3 mission stayed on "sign in there with Pi" whatever
// the pioneer did (owner, 2026-10-05). Ten minutes keeps the cost to one
// upsert per visit and lets a lost arrival heal on the next one. A new key
// name, so a tab holding the old forever-flag reports once more.
//
// ── Silent, always ─────────────────────────────────────────────────────────
//
// Nobody asked for this request. It is bookkeeping the platform wants, and
// bookkeeping that can interrupt somebody's visit is worse than bookkeeping
// that is occasionally missing. Every failure path ends here, including a
// sessionStorage that throws in a private window.

import { useEffect } from 'react';
import { piSession } from '@/lib/pi/pi-session';
import { writeTrace, ARRIVAL_TRACE } from '@/lib/pioneer/arrival-trace';

const ONCE_KEY  = 'tec_arrival_reported_at';
const REPORT_EVERY_MS = 10 * 60 * 1000;

export function ArrivalReport() {
  useEffect(() => piSession.onSignedIn(report), []);
  return null;
}

function report(): void {
  try {
    const last = Number(sessionStorage.getItem(ONCE_KEY));
    if (last > 0 && Date.now() - last < REPORT_EVERY_MS) return;
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
      const body = res.ok
        ? await res.json().catch(() => null) as { recorded?: unknown; reason?: unknown } | null
        : null;
      // What the server said, for /pi-test (lib/pioneer/arrival-trace.ts).
      writeTrace(ARRIVAL_TRACE, {
        status:   res.status,
        recorded: body?.recorded === true,
        ...(typeof body?.reason === 'string' ? { reason: body.reason } : {}),
      });
      if (!res.ok) return;
      if (body?.recorded === true) {
        try { sessionStorage.setItem(ONCE_KEY, String(Date.now())); } catch { /* ignore */ }
      }
    })
    .catch((e: unknown) => { writeTrace(ARRIVAL_TRACE, { error: String(e).slice(0, 200) }); });
}
