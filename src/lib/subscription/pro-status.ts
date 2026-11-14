// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL Pro-status resolver (server-only) — copy nothing, import THIS.
//
// The commerce subscription status is the single source of truth for "is this
// user on Pro?". It is COMMERCE-OWNED (C-47) — an app never stores billing truth,
// it only reflects it (P5). Read it here with the session JWT; the gateway
// resolves the user server-side (never a client field, P6).
//
// ⚠️ THE CONTRACT (do not re-parse it by hand per app):
//     GET /api/commerce/subscriptions/status →
//       { success, data: { subscription: { plan, isActive, isExpired,
//                                           current_period_end, daysRemaining } } }
//
// A production incident came from re-parsing this wrong: an app read `.data.plan`
// instead of `.data.subscription.plan`, silently resolved FREE, and every
// Pro-gated feature stayed locked for paying users — and the unit test had mocked
// a FLAT shape, so it green-lit the bug. This module unwraps the envelope in ONE
// place (tolerating a flat fallback), and `pro-status.test.ts` pins it against the
// REAL nested shape. New apps: import `resolveProStatus` / `resolveProState` — do
// not hand-roll another parser.
// ─────────────────────────────────────────────────────────────────────────────

import { APP_SOURCE } from '@/lib/app-source';
import { gatewayFetch } from '@/lib/gateway-fetch';

const GW = process.env.API_GATEWAY_URL ?? '';

const gwHeaders = (token: string) => ({
  'Content-Type':  'application/json',
  Authorization:   `Bearer ${token}`,
  'x-request-id':  crypto.randomUUID(),
  ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
});

// The shape and the rule live in read-pro-state.ts (pure — screens use it too).
export type { ProState } from './read-pro-state';
import { readProState, FREE_STATE as FREE, type ProState } from './read-pro-state';

// The caller's LIVE Pro entitlement IN THIS APP (`?app=` — each app's Pro is its
// own, owner decision 2026-10-02; the Hub plan is separate) + renewal signal. Any failure → FREE (fail
// closed, P6). Reads the session token; never trusts a client-sent plan.
export async function resolveProState(token: string): Promise<ProState> {
  if (!GW || !token) return FREE;
  try {
    const res = await gatewayFetch(`${GW}/api/commerce/subscriptions/status?app=${encodeURIComponent(APP_SOURCE)}`, {
      headers: gwHeaders(token), cache: 'no-store',
    });
    if (!res.ok) return FREE;
    return readProState(await res.json().catch(() => null));
  } catch { return FREE; }
}

// Boolean convenience for the common Pro-gate check.
export async function resolveProStatus(token: string): Promise<boolean> {
  return (await resolveProState(token)).pro;
}
