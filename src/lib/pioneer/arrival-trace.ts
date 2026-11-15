// What happened to this tab's campaign arrival, step by step — for /pi-test.
//
// An arrival is three steps in two places: this app signs in with Pi (F3), the
// browser POSTs /api/bff/pioneer/arrived, the server forwards it to identity.
// When a mission stays unticked, a phone shows none of that. Each step writes
// its outcome here, and /pi-test prints it, so the answer is on the screen of
// the phone that has the problem instead of in a log nobody can open there.
//
// Outcomes only — never a token, a username or a Pi uid. Per tab
// (sessionStorage), gone when the tab closes, and every write is best-effort:
// bookkeeping about bookkeeping must never break a visit.

export const SIGNIN_TRACE  = 'tec_trace_pi_signin';
export const ARRIVAL_TRACE = 'tec_trace_arrival';

export type SignInTrace =
  | { at: string; result: 'foreign-session' | 'no-sdk' | 'ok' }
  | { at: string; result: 'error'; error: string };

export type ArrivalTrace =
  | { at: string; status: number; recorded: boolean; reason?: string }
  | { at: string; error: string };

export function writeTrace(key: string, value: object): void {
  try { sessionStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), ...value })); } catch { /* ignore */ }
}

export function readTrace<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
