'use client';

// Sign this app in with its OWN Pi handshake, when it has no TEC session.
//
// The Founding Quest and the reward campaign open an app as a standalone visit
// (no referrer, no Hub SSO), so the app loads the Pi SDK and Pi counts the visit.
// The price was that the app arrived with no session of its own: `/me` answered
// `no_token` and every screen said "Not signed in" (seen on a phone, 2026-09-25).
//
// The warm-up has already run `Pi.authenticate` on such a visit. This finishes
// the job the way the Hub's own login does (C-123 §3): Pi's token → our
// /api/auth/pi-login → a one-time token → a TOP-LEVEL navigation to this app's
// /api/auth/sso-callback, whose 200 landing sets the cookies in THIS browser
// context and confirms `/me` can see them before coming back here.
//
// When it does nothing — each one on purpose:
//   · a Hub-owned Pi session (ADR-007): authenticate never answers there, and an
//     app entered through Hub SSO already has a session;
//   · `/me` already says yes: nothing to fix;
//   · it already tried in this tab within the window below. If this browser
//     context refuses the cookies (C-123 LAW 3), the landing still proceeds back
//     here (§7), `/me` still says no — and without this guard that would be a
//     sign-in loop. One attempt, then the page stays as it is;
//   · sessionStorage is unavailable: without the guard there is no loop
//     protection, so it does not start.

import { piSession } from './pi-session';

const TRIED_KEY = '__tec_self_signin';
const RETRY_AFTER_MS = 10 * 60 * 1000;

const isForeignSession = (): boolean =>
  (window as unknown as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION === true;

/** True when an attempt may start; records the attempt. False when it must not. */
function claimAttempt(now: number): boolean {
  try {
    const last = Number(sessionStorage.getItem(TRIED_KEY) ?? 0);
    if (last && now - last < RETRY_AFTER_MS) return false;
    sessionStorage.setItem(TRIED_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

export type SelfSignInOutcome =
  | 'foreign-session' | 'has-session' | 'already-tried' | 'no-pi'
  | 'refused' | 'navigating';

export async function selfSignIn(now: number = Date.now()): Promise<SelfSignInOutcome> {
  if (typeof window === 'undefined' || isForeignSession()) return 'foreign-session';

  const me = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }).catch(() => null);
  // Only a definite "no session" starts a sign-in. A network failure is not one.
  if (!me || me.ok || me.status !== 401) return 'has-session';

  if (!(await piSession.ensureAuth())) return 'no-pi';
  const accessToken = piSession.accessToken;
  if (!accessToken) return 'no-pi';

  if (!claimAttempt(now)) return 'already-tried';

  const res = await fetch('/api/auth/pi-login', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ accessToken }),
  }).catch(() => null);
  const ssoToken = res?.ok
    ? ((await res.json().catch(() => null)) as { ssoToken?: unknown } | null)?.ssoToken
    : null;
  if (typeof ssoToken !== 'string' || !ssoToken) return 'refused';

  // Back to exactly where the visitor is — path and query, so the Quest's `q`
  // marker (the way back) survives the trip. Same-origin by construction; the
  // callback re-checks it anyway.
  const here = window.location.pathname + window.location.search;
  window.location.replace(
    `/api/auth/sso-callback?token=${encodeURIComponent(ssoToken)}&redirect=${encodeURIComponent(here)}`,
  );
  return 'navigating';
}
