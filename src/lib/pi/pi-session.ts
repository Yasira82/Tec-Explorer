'use client';

// The Pi session for this origin — authenticated ONCE, reused by every caller.
//
// Why this file exists
// --------------------
// `createU2APayment` used to call `Pi.authenticate(...)` unconditionally, on
// every Pay tap. That put the entire Pi handshake AFTER the tap, so the button
// held the user for however long the handshake took.
//
// Normally that is fast. It is NOT fast right after a payment in the Hub: Pi
// Browser is then inside the Hub's Pi app, and the next authenticate here has
// to switch the Pi app context first. Same code, same tap, a much longer wait —
// which is exactly the "I pay in the Hub, come back, and the app payment hangs"
// sequence.
//
// The handshake cannot be made faster; it can be made to happen at a moment
// that costs the user nothing. So it runs on PAGE LOAD (see PiWarmup) while the
// user is still reading the screen, and the tap reuses the result. The wait did
// not get shorter — it moved off the tap.
//
// Two rules this enforces, both learned the hard way:
//   1. Never two concurrent `Pi.authenticate` calls. Pi Browser answers neither
//      reliably; the loser dies silently on its own timer. Every caller here —
//      login and payment — goes through the same single-flight promise.
//   2. Never authenticate in a Hub-owned session (ADR-007). It never answers.

import { PiRuntime } from './PiRuntime';

const getCookie = (name: string): string =>
  typeof document === 'undefined' ? '' :
  document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1] ?? '';

/**
 * Default incomplete-payment handler. It must live here, not at the payment
 * call site: once the warm-up owns the authenticate, the handler passed to Pi
 * is this one for the whole page — an unfinished payment has to be resolvable
 * even when nobody has tapped Pay yet.
 */
const resolveIncomplete = async (incomplete: unknown): Promise<void> => {
  const pid = (incomplete as { identifier?: string } | null)?.identifier;
  if (!pid) return;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-csrf-token': getCookie('tec_csrf'),
  };
  const token = getCookie('tec_access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    await fetch('/api/bff/payment/resolve-incomplete', {
      method: 'POST', credentials: 'include', headers,
      body: JSON.stringify({ pi_payment_id: pid }),
    });
  } catch { /* resolving is best-effort — it must never fail the payment */ }
};

let authenticated = false;
let inFlight: Promise<boolean> | null = null;
// Pi answered a handshake in THIS app (F3, #47). What Pi itself counts for a `.pi`
// domain is a KYC'd Pioneer who signed in with Pi in the app — so this, not a page
// load, is the moment a visit is a visit (ArrivalReport waits for it).
let signedInHere = false;
const signedInListeners = new Set<() => void>();
const announceSignedIn = (): void => {
  if (signedInHere) return;
  signedInHere = true;
  for (const fn of [...signedInListeners]) { try { fn(); } catch { /* ignore */ } }
};
let generation = 0;
// Pi's access token from the last handshake, in MEMORY only (ADR-001: never
// localStorage/sessionStorage). It is what lets this app sign itself in when it
// was opened without a TEC session — see self-sign-in.ts.
let piAccessToken: string | null = null;

/** A Hub-owned session (ADR-007) — authenticating here would never answer. */
const isForeignSession = (): boolean =>
  typeof window !== 'undefined' &&
  (window as unknown as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION === true;

export const piSession = {
  /** True only while the SDK is still present — a marked session with no SDK is stale. */
  get isAuthenticated(): boolean {
    return authenticated && PiRuntime.isAvailable();
  },

  /** Pi's access token from the last successful handshake, or null. Memory only. */
  get accessToken(): string | null {
    return piAccessToken;
  },

  /** True while a handshake is running (warm-up or tap). */
  get isAuthInFlight(): boolean {
    return inFlight !== null;
  },

  /**
   * Resolve to an authenticated Pi session, authenticating at most once.
   * A tap arriving mid-warm-up joins the SAME promise — it never starts a
   * second concurrent authenticate.
   */
  /**
   * `fresh`: do not join a handshake already in flight — start one inside THIS
   * call (a tap). For a tab opened through a signed handoff from the Hub: Pi
   * Browser does not answer the load-time warm-up there, so a tap that joined it
   * waited out the 90 s payment timeout with Pi silent — every grid-opened app,
   * while the same app opened from Pi's own list paid at once (owner, phone,
   * 2026-10-02). Ecommerce has always authenticated afresh at the tap, and paid
   * from the grid the same day. (tec-template-base #45)
   */
  ensureAuth(opts: { fresh?: boolean } = {}): Promise<boolean> {
    if (this.isAuthenticated) return Promise.resolve(true);
    if (isForeignSession())   return Promise.resolve(false);
    if (!PiRuntime.isAvailable()) return Promise.resolve(false);

    if (!inFlight || opts.fresh) {
      // A superseded handshake (the warm-up a fresh tap stepped past) may still
      // settle later; only the CURRENT one may write the outcome.
      const gen = ++generation;
      const call: Promise<boolean> = PiRuntime
        .authenticate(['username', 'payments'], (p: unknown) => { void resolveIncomplete(p); })
        .then((result: unknown) => {
          const t = (result as { accessToken?: unknown } | null)?.accessToken;
          if (typeof t === 'string' && t) piAccessToken = t;
          authenticated = true;      // any answer from Pi is a live session
          announceSignedIn();
          return true;
        })
        .catch(() => {
          if (gen === generation) { authenticated = false; piAccessToken = null; }
          return false;
        })
        .finally(() => { if (inFlight === call) inFlight = null; });
      inFlight = call;
    }
    return inFlight;
  },

  /** True once Pi has answered a handshake in this app, this page. */
  get signedInHere(): boolean {
    return signedInHere;
  },

  /**
   * Call `fn` once this app has signed in with Pi — now, if it already has.
   * Returns the unsubscribe. A Hub-owned session (ADR-007) never signs in here,
   * so `fn` never runs there — which is exactly how Pi counts that visit.
   */
  onSignedIn(fn: () => void): () => void {
    if (signedInHere) { fn(); return () => undefined; }
    signedInListeners.add(fn);
    return () => { signedInListeners.delete(fn); };
  },

  /** Fire-and-forget warm-up. Failure is silent: the tap will simply retry. */
  warm(): void {
    void this.ensureAuth();
  },

  /**
   * Record a session established elsewhere (login authenticates with the same
   * scopes). Without this the first Pay tap ran a second, redundant handshake.
   */
  markAuthenticated(): void {
    authenticated = true;
    announceSignedIn(); // the login in this app authenticated with Pi
  },

  reset(): void {
    authenticated = false;
    signedInHere  = false;
    inFlight      = null;
    piAccessToken = null;
    generation++;
  },
};
