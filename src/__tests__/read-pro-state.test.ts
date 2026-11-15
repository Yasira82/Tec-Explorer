/**
 * The one reading of "is this person on Pro here?" (TEC-AUDIT-0044). Every case
 * below is a shape commerce really returns — copied from
 * tec-commerce-service/src/modules/subscription/app-subscription.service.ts
 * getStatus/gift/legacy — wrapped in the envelope its controller sends, plus the
 * flat shape this app's own route answers. A reader tested against a shape nobody
 * sends is how Pro once stayed locked for every paying user (pro-status.ts).
 */
import { describe, it, expect } from 'vitest';
import { readProState, FREE_STATE } from '@/lib/subscription/read-pro-state';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const IN_10_DAYS = '2026-11-24T12:00:00.000Z';
const YESTERDAY  = '2026-11-13T12:00:00.000Z';
const env = (subscription: Record<string, unknown>) => ({ success: true, data: { subscription } });

describe("commerce's real answers", () => {
  it("this app's own live Pro", () => {
    const s = readProState(env({ app: 'dx', plan: 'PRO', status: 'ACTIVE', isActive: true, isExpired: false,
      daysRemaining: 10, current_period_end: IN_10_DAYS, cancelled_at: null }), NOW);
    expect(s).toMatchObject({ pro: true, plan: 'PRO', daysRemaining: 10, legacy: false, gift: false });
  });

  it('the every-app gift: Pro, nothing here to cancel (legacy), and for an admin it can be', () => {
    const gift = { app: 'dx', plan: 'PRO', status: 'ACTIVE', isActive: true, isExpired: false,
      daysRemaining: 10, current_period_end: IN_10_DAYS, cancelled_at: null, gift: true };
    expect(readProState(env({ ...gift, legacy: true }), NOW)).toMatchObject({ pro: true, gift: true, legacy: true });
    expect(readProState(env({ ...gift, legacy: false }), NOW)).toMatchObject({ pro: true, gift: true, legacy: false });
  });

  it('a pre-split Hub Pro still honoured here (legacy)', () => {
    expect(readProState(env({ app: 'dx', plan: 'ENTERPRISE', status: 'ACTIVE', isActive: true, isExpired: false,
      daysRemaining: 3, current_period_end: IN_10_DAYS, cancelled_at: null, legacy: true }), NOW))
      .toMatchObject({ pro: true, plan: 'ENTERPRISE', legacy: true });
  });

  it('cancelled, expired, gift switched off, never bought → FREE', () => {
    for (const sub of [
      { app: 'dx', plan: 'FREE', status: 'CANCELLED', isActive: false, isExpired: false, daysRemaining: null, current_period_end: null, cancelled_at: YESTERDAY },
      { app: 'dx', plan: 'FREE', status: 'EXPIRED', isActive: false, isExpired: true, daysRemaining: 0, current_period_end: YESTERDAY, cancelled_at: null },
      { app: 'dx', plan: 'FREE', status: 'ACTIVE', isActive: false, isExpired: false, daysRemaining: null, current_period_end: null, cancelled_at: null },
    ]) expect(readProState(env(sub), NOW)).toMatchObject({ pro: false, plan: 'FREE', daysRemaining: null });
  });
});

describe('fail closed (P6) — where the hand-written readers disagreed', () => {
  it('a paid plan WITHOUT isActive is not Pro (one reader counted a missing isActive as active)', () => {
    expect(readProState(env({ plan: 'PRO', isExpired: false, current_period_end: IN_10_DAYS }), NOW).pro).toBe(false);
    expect(readProState(env({ plan: 'PRO', isActive: false, current_period_end: IN_10_DAYS }), NOW).pro).toBe(false);
  });

  it('a paid, active plan whose period has ended is not Pro (the other reader never looked)', () => {
    expect(readProState(env({ plan: 'PRO', status: 'ACTIVE', isActive: true, isExpired: false, current_period_end: YESTERDAY }), NOW).pro).toBe(false);
    expect(readProState(env({ plan: 'PRO', status: 'ACTIVE', isActive: true, isExpired: true }), NOW).pro).toBe(false);
  });

  it('`status: ACTIVE` alone grants nothing — commerce says ACTIVE for a never-bought FREE row', () => {
    expect(readProState(env({ plan: 'FREE', status: 'ACTIVE', isActive: false }), NOW).pro).toBe(false);
  });

  it('an unknown plan, an error body, nothing at all → FREE', () => {
    expect(readProState(env({ plan: 'GOLD', isActive: true }), NOW)).toEqual(FREE_STATE);
    for (const junk of [{ error: 'Unauthorized' }, null, undefined, 'x', 42, { data: null }]) {
      expect(readProState(junk, NOW).pro).toBe(false);
    }
  });
});

describe("this app's flat route", () => {
  it("reads the server's verdict, and still refuses an expired or Testnet one", () => {
    expect(readProState({ pro: true, plan: 'PRO', isExpired: false, daysRemaining: 5, currentPeriodEnd: IN_10_DAYS }, NOW))
      .toMatchObject({ pro: true, daysRemaining: 5 });
    expect(readProState({ pro: false, plan: 'FREE', isExpired: false, daysRemaining: null }, NOW).pro).toBe(false);
    expect(readProState({ pro: true, plan: 'PRO', isExpired: true }, NOW).pro).toBe(false);
    expect(readProState({ pro: false, plan: 'FREE', isExpired: false, daysRemaining: null, testnet: true }, NOW))
      .toMatchObject({ pro: false, testnet: true });
  });

  it('days left come from the period end when commerce leaves them out', () => {
    expect(readProState(env({ plan: 'PRO', isActive: true, current_period_end: IN_10_DAYS }), NOW).daysRemaining).toBe(10);
  });
});
