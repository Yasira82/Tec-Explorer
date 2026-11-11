// Count a visitor once a day — not on every visit, and not only once ever.
//
// The visit sign-in exists so Pi sees a Pioneer sign in with Pi IN this app:
// that is what Pi's domain claim reads ("at least 5 unique KYC'd approved
// Pioneers engage with the app"), and the domain is then "periodically
// reviewed for compliance and utility" and renewed after a year only if the app
// still meets the thresholds (Pi's claim screen, 11 Nov 2026). So Pi has to keep
// seeing the people who use the app — a person counted once and never again
// reads, months later, as an app nobody uses.
//
// What every repeat handshake also did (owner, 10 Nov 2026): after a few apps
// signed in from the Hub in one Pi Browser session, each with its own App ID,
// Pi's wallet stopped opening for ANY app until Pi Browser was restarted.
//
// So: once Pi has signed a username in here TODAY, this device remembers it and
// later visits that day skip the visit handshake (the arrival is still
// announced). The next day, the first visit signs in again. A visitor we cannot
// name yet (no TEC session) always signs in — that is also how they log in. A
// payment always authenticates at the tap; nothing here touches that path.

const KEY = '__tec_pi_counted_day';

/** The visitor's local calendar day, YYYY-MM-DD. */
export const today = (now: Date = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

const read = (): Record<string, string> => {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {};
  } catch { return {}; }
};

/** Has Pi already signed this username in here today, on this device? */
export function wasCounted(username: string | null | undefined, now: Date = new Date()): boolean {
  if (!username) return false;
  return read()[username.toLowerCase()] === today(now);
}

/** Remember that Pi signed this username in here today. Never throws. */
export function rememberCounted(username: string | null | undefined, now: Date = new Date()): void {
  if (!username) return;
  try {
    const map = read();
    map[username.toLowerCase()] = today(now);
    // A shared phone keeps the last few people, not an ever-growing list.
    const kept = Object.entries(map).sort((a, b) => (a[1] < b[1] ? 1 : -1)).slice(0, 20);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch { /* storage unavailable: the next visit signs in again, as before */ }
}

/** The signed-in TEC username, read server-side (Pi Browser hides tec_user from JS — C-123 §3). */
export async function currentUsername(): Promise<string | null> {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const d = (await r.json()) as { authenticated?: boolean; user?: { username?: unknown; piUsername?: unknown } };
    const u = d?.authenticated ? (d.user?.piUsername ?? d.user?.username) : null;
    return typeof u === 'string' && u ? u : null;
  } catch { return null; }
}
