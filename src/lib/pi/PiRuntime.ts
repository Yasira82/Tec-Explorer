'use client';

// PiRuntime — Pi Abstraction Layer (PAL).
//
// THE single choke-point for every `window.Pi.*` call (R1: a Pi SDK change breaks
// all payments → fix it here once). Never call window.Pi directly in components —
// go through PiRuntime so the circuit breaker, readiness checks, and (future) SDK
// version shims live in one place.
//
// ADR-007 (dual-mode) still belongs at the call site: guard with isHubNavigation()
// before invoking a Mode-2 payment (see src/lib/pi-payment.ts). PiRuntime is the
// runtime wrapper; it does not decide Mode 1 vs Mode 2.

import { piCircuitBreaker } from './PiCircuitBreaker';

type PiSDK = {
  init: (cfg: { version: string; sandbox: boolean }) => void;
  authenticate: (
    scopes: string[],
    onIncompletePayment: (p: unknown) => void,
  ) => Promise<unknown>;
  createPayment: (data: unknown, callbacks: unknown) => unknown;
};

function getPi(): PiSDK | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Pi?: PiSDK }).Pi ?? null;
}

export const PiRuntime = {
  isAvailable(): boolean {
    return getPi() !== null;
  },

  init(sandbox: boolean): boolean {
    const pi = getPi();
    if (!pi) return false;
    pi.init({ version: '2.0', sandbox });
    return true;
  },

  /** True only if the SDK is present AND the breaker isn't OPEN. */
  canPay(): boolean {
    return this.isAvailable() && piCircuitBreaker.canAttempt();
  },

  async authenticate(
    scopes: string[],
    onIncompletePayment: (p: unknown) => void,
  ): Promise<unknown> {
    const pi = getPi();
    if (!pi) throw new Error('Pi SDK not available');
    if (!piCircuitBreaker.canAttempt()) throw new Error('Pi circuit breaker OPEN');
    try {
      const result = await pi.authenticate(scopes, onIncompletePayment);
      piCircuitBreaker.onSuccess();
      return result;
    } catch (err) {
      piCircuitBreaker.onFailure();
      throw err;
    }
  },

  createPayment(data: unknown, callbacks: unknown): unknown {
    const pi = getPi();
    if (!pi) throw new Error('Pi SDK not available');
    return pi.createPayment(data, callbacks);
  },
};
