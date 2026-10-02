/**
 * A tap in a tab opened from the Hub grid starts its own Pi handshake.
 *
 * Seen on a phone (2026-10-02): every app opened from the Hub grid hung at Pro
 * for the 90 s payment timeout — the record created, Pi never asking for
 * approval — while the same app opened from Pi's own list paid at once. The tap
 * JOINED the load-time warm-up, and Pi Browser does not answer that warm-up in a
 * handoff-opened tab. Ecommerce, which authenticates afresh at the tap, paid
 * from the grid the same day.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authenticate = vi.fn();
vi.mock('../lib/pi/PiRuntime', () => ({
  PiRuntime: {
    isAvailable:  () => true,
    authenticate: (...a: unknown[]) => authenticate(...a),
  },
}));

const load = async () => (await import('../lib/pi/pi-session')).piSession;

beforeEach(() => {
  vi.resetModules();
  authenticate.mockReset();
  delete (window as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION;
});

describe('piSession.ensureAuth', () => {
  it('joins a warm-up already in flight by default — one handshake, not two', async () => {
    authenticate.mockReturnValue(new Promise(() => { /* Pi has not answered */ }));
    const s = await load();
    s.warm();
    void s.ensureAuth();
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('{ fresh: true } starts its own handshake instead of waiting on a silent warm-up', async () => {
    authenticate
      .mockReturnValueOnce(new Promise(() => { /* the warm-up: never answered */ }))
      .mockResolvedValueOnce({ accessToken: 'pi-at' });
    const s = await load();
    s.warm();
    await expect(s.ensureAuth({ fresh: true })).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(s.isAuthenticated).toBe(true);
    expect(s.accessToken).toBe('pi-at');
  });

  it('a superseded warm-up that fails later does not undo the tap\'s success', async () => {
    let failWarmUp!: (e: Error) => void;
    authenticate
      .mockReturnValueOnce(new Promise((_, rej) => { failWarmUp = rej; }))
      .mockResolvedValueOnce({ accessToken: 'pi-at' });
    const s = await load();
    s.warm();
    await s.ensureAuth({ fresh: true });
    failWarmUp(new Error('late'));
    await new Promise((r) => setTimeout(r, 0));
    expect(s.isAuthenticated).toBe(true);
    expect(s.accessToken).toBe('pi-at');
  });

  it('{ fresh: true } after the session is already up does not ask Pi again', async () => {
    authenticate.mockResolvedValue({ accessToken: 'pi-at' });
    const s = await load();
    await s.ensureAuth();
    await s.ensureAuth({ fresh: true });
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});

describe('enteredByHandoff', () => {
  it('reads the mark the SSO landing leaves', async () => {
    const { enteredByHandoff } = await import('../lib/pi-payment');
    sessionStorage.removeItem('__tec_handoff_entry');
    expect(enteredByHandoff()).toBe(false);
    sessionStorage.setItem('__tec_handoff_entry', '1');
    expect(enteredByHandoff()).toBe(true);
    sessionStorage.removeItem('__tec_handoff_entry');
  });
});
