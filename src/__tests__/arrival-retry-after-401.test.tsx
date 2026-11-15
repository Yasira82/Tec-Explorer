/**
 * The arrival report fires the moment Pi signs the visitor in — which is BEFORE this
 * app has a fresh TEC session when the old one expired or the visitor came straight
 * from Pi: the app signs itself in a moment later (lib/pi/self-sign-in). The first
 * report then meets no valid session and gets 401; nothing asked again, so the visit
 * went uncounted (owner's phone, Assets /pi-test, 15 Nov 2026: `HTTP 401 · recorded
 * false` on the first visit, `HTTP 200 · recorded true` on the next).
 *
 * A 401 is now asked again a few seconds later — twice at most. Any other answer is
 * final: 200 recorded, or a refusal that waiting does not change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

const authenticate = vi.fn();
vi.mock('../lib/pi/PiRuntime', () => ({
  PiRuntime: {
    isAvailable:  () => true,
    authenticate: (...a: unknown[]) => authenticate(...a),
  },
}));

const answer = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
let fetchMock: ReturnType<typeof vi.fn>;
const arrivals = () => fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/bff/pioneer/arrived').length;

const start = async () => {
  const { piSession } = await import('../lib/pi/pi-session');
  const { ArrivalReport } = await import('../components/pioneer/ArrivalReport');
  authenticate.mockResolvedValue({ accessToken: 'pi-token' });
  render(<ArrivalReport />);
  await act(async () => { await piSession.ensureAuth(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};
const wait = async (ms: number) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ shouldAdvanceTime: false });
  authenticate.mockReset();
  sessionStorage.clear();
  delete (window as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('an arrival refused for want of a session is asked again', () => {
  it('401, then the session exists → recorded on the retry', async () => {
    fetchMock = vi.fn()
      .mockResolvedValueOnce(answer(401))
      .mockResolvedValue(answer(200, { recorded: true }));
    vi.stubGlobal('fetch', fetchMock);
    await start();
    expect(arrivals()).toBe(1);
    await wait(3_000);
    expect(arrivals()).toBe(2);
    expect(Number(sessionStorage.getItem('tec_arrival_reported_at'))).toBeGreaterThan(0);
    await wait(30_000);
    expect(arrivals()).toBe(2);   // recorded: nothing more
  });

  it('gives up after two retries — a signed-out visitor is not chased', async () => {
    fetchMock = vi.fn().mockResolvedValue(answer(401));
    vi.stubGlobal('fetch', fetchMock);
    await start();
    await wait(60_000);
    expect(arrivals()).toBe(3);
  });

  it('any answer but 401 is final', async () => {
    fetchMock = vi.fn().mockResolvedValue(answer(200, { recorded: false, reason: 'gateway_403' }));
    vi.stubGlobal('fetch', fetchMock);
    await start();
    await wait(60_000);
    expect(arrivals()).toBe(1);
  });
});
