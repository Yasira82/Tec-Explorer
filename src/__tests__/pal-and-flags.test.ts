import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PiCircuitBreaker } from '@/lib/pi/PiCircuitBreaker';
import { isEnabled } from '@/lib/flags';

describe('PiCircuitBreaker', () => {
  let cb: PiCircuitBreaker;
  beforeEach(() => {
    cb = new PiCircuitBreaker();
    cb.reset();
  });

  it('starts CLOSED and allows attempts', () => {
    expect(cb.currentState).toBe('CLOSED');
    expect(cb.canAttempt()).toBe(true);
  });

  it('opens after 3 consecutive failures', () => {
    cb.onFailure();
    cb.onFailure();
    expect(cb.canAttempt()).toBe(true); // still CLOSED at 2
    cb.onFailure();
    expect(cb.currentState).toBe('OPEN');
    expect(cb.canAttempt()).toBe(false);
  });

  it('success resets the breaker', () => {
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    expect(cb.currentState).toBe('OPEN');
    cb.onSuccess();
    expect(cb.currentState).toBe('CLOSED');
    expect(cb.canAttempt()).toBe(true);
  });

  it('transitions OPEN → HALF_OPEN after the timeout window', () => {
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    expect(cb.currentState).toBe('OPEN');
    // jump 61s into the future
    const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    expect(cb.currentState).toBe('HALF_OPEN');
    expect(cb.canAttempt()).toBe(true);
    spy.mockRestore();
  });
});

describe('feature flags', () => {
  const KEY = 'NEXT_PUBLIC_FLAG_BETA';
  afterEach(() => {
    delete process.env[KEY];
  });

  it('returns the default when unset', () => {
    expect(isEnabled('beta', false)).toBe(false);
    expect(isEnabled('beta', true)).toBe(true);
  });

  it('reads truthy env values', () => {
    process.env[KEY] = '1';
    expect(isEnabled('beta')).toBe(true);
    process.env[KEY] = 'true';
    expect(isEnabled('beta')).toBe(true);
    process.env[KEY] = 'off';
    expect(isEnabled('beta')).toBe(false);
  });
});
