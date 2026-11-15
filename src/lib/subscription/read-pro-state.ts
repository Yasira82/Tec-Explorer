// ─────────────────────────────────────────────────────────────────────────────
// ONE reading of "is this person on Pro here?" — for the server resolver AND for
// every screen. Pure (no fetch, no server import), so a Pro card, the settings
// page and the cancel button read the answer the same way the server does.
//
// Before this (TEC-AUDIT-0044, 14 Nov 2026) each app parsed the answer by hand,
// in two different ways: the settings page ignored expiry, the Pro card counted
// a missing `isActive` as active. They agreed only because commerce always sends
// `plan: 'FREE'` when there is nothing to show — a change there would have made
// two screens of one app disagree about whether someone paid.
//
// Two shapes reach a reader:
//   commerce's envelope  { success, data: { subscription: { plan, isActive,
//                          isExpired, current_period_end, daysRemaining, … } } }
//   this app's route     { pro, plan, isExpired, daysRemaining, … }   (flat)
// The rule is commerce's, read FAIL-CLOSED (P6): Pro only when the plan is paid,
// `isActive` is exactly true, it has not expired, and its period has not ended.
// Anything missing, unknown or malformed reads FREE.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProState {
  pro:              boolean;           // live entitlement (paid + active + not expired)
  plan:             string;            // 'FREE' | 'PRO' | 'ENTERPRISE'
  isExpired:        boolean;
  daysRemaining:    number | null;     // whole days left in the period, if any
  currentPeriodEnd: string | null;     // ISO, if any
  /**
   * True when this Pro is NOT this app's own purchase — the Founding gift that
   * covers every app, or a Pro bought before the per-app split. There is nothing
   * here to cancel, so <CancelProButton /> hides. Passed through as commerce says it.
   */
  legacy:           boolean;
  /** True for the every-app gift (the Founding Pioneers' Pro) — a card can say so. */
  gift:             boolean;
  /** True on a Testnet host: nothing is granted there, so nothing is shown. */
  testnet:          boolean;
}

export const FREE_STATE: ProState = {
  pro: false, plan: 'FREE', isExpired: false, daysRemaining: null,
  currentPeriodEnd: null, legacy: false, gift: false, testnet: false,
};

const DAY_MS = 86_400_000;

export function readProState(body: unknown, now: number = Date.now()): ProState {
  if (!body || typeof body !== 'object') return FREE_STATE;
  const root = ((body as Record<string, unknown>).data ?? body) as Record<string, unknown>;
  const s    = ((root && typeof root === 'object' ? (root.subscription ?? root) : null) ?? {}) as Record<string, unknown>;
  if (typeof s !== 'object') return FREE_STATE;

  const plan      = String(s.plan ?? s.tier ?? 'FREE').toUpperCase();
  const paid      = plan === 'PRO' || plan === 'ENTERPRISE';
  const isExpired = s.isExpired === true;
  const testnet   = s.testnet === true;
  const endRaw    = (s.current_period_end ?? s.currentPeriodEnd ?? s.expires_at) as unknown;
  const endMs     = typeof endRaw === 'string' ? new Date(endRaw).getTime() : NaN;
  const endLive   = typeof endRaw !== 'string' || (Number.isFinite(endMs) && endMs > now);

  // The flat shape carries the server's own verdict in `pro`; the envelope carries
  // commerce's `isActive`. Either must be exactly true — never inferred from the plan.
  const asserted  = typeof s.pro === 'boolean' ? s.pro === true : s.isActive === true;
  const pro       = paid && asserted && !isExpired && endLive && !testnet;

  const days = typeof s.daysRemaining === 'number'
    ? s.daysRemaining
    : Number.isFinite(endMs) ? Math.max(0, Math.ceil((endMs - now) / DAY_MS)) : null;

  return {
    pro,
    plan:             paid ? plan : 'FREE',
    isExpired,
    daysRemaining:    paid ? days : null,
    currentPeriodEnd: typeof endRaw === 'string' ? endRaw : null,
    legacy:           s.legacy === true,
    gift:             s.gift === true,
    testnet,
  };
}
