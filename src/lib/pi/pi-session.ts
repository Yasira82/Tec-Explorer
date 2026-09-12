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

/** A Hub-owned session (ADR-007) — authenticating here would never answer. */
const isForeignSession = (): boolean =>
  typeof window !== 'undefined' &&
  (window as unknown as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION === true;

export const piSession = {
  /** True only while the SDK is still present — a marked session with no SDK is stale. */
  get isAuthenticated(): boolean {
    return authenticated && PiRuntime.isAvailable();
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
  ensureAuth(): Promise<boolean> {
    if (this.isAuthenticated) return Promise.resolve(true);
    if (isForeignSession())   return Promise.resolve(false);
    if (!PiRuntime.isAvailable()) return Promise.resolve(false);

    if (!inFlight) {
      inFlight = PiRuntime
        .authenticate(['username', 'payments'], (p: unknown) => { void resolveIncomplete(p); })
        .then(() => { authenticated = true;  return true;  })
        .catch(() => { authenticated = false; return false; })
        .finally(() => { inFlight = null; });
    }
    return inFlight;
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
  },

  reset(): void {
    authenticated = false;
    inFlight      = null;
  },
};
