/**
 * F3 (tec-template-base #47): count a visit the way Pi counts it.
 *
 * For a `.pi` domain, Pi counts KYC'd Pioneers who SIGNED IN WITH PI in that app.
 * The arrival report used to fire on page load — before, and without, any Pi
 * handshake — so TEC's coverage read 5/5 while Pi said "Requirements Not Met"
 * (C-02 row 2). A visit opened from the Hub grid (a Hub-owned Pi session, ADR-007)
 * never signs in here at all, and was counted anyway.
 *
 * Now the report waits for THIS app's own successful `Pi.authenticate`.
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

const recorded = () => ({ ok: true, json: async () => ({ recorded: true }) }) as unknown as Response;
let fetchMock: ReturnType<typeof vi.fn>;

const load = async () => ({
  piSession:     (await import('../lib/pi/pi-session')).piSession,
  ArrivalReport: (await import('../components/pioneer/ArrivalReport')).ArrivalReport,
});
const arrivals = () => fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/bff/pioneer/arrived').length;

beforeEach(() => {
  vi.resetModules();
  authenticate.mockReset();
  sessionStorage.clear();
  delete (window as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION;
  fetchMock = vi.fn(async () => recorded());
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('an arrival is reported only after this app\'s own Pi sign-in', () => {
  it('a page load alone reports nothing', async () => {
    authenticate.mockReturnValue(new Promise(() => { /* Pi has not answered */ }));
    const { piSession, ArrivalReport } = await load();
    render(<ArrivalReport />);
    piSession.warm();
    await act(async () => { await Promise.resolve(); });
    expect(arrivals()).toBe(0);
  });

  it('reports once Pi answers the handshake — and only once', async () => {
    let answer: (v: unknown) => void = () => undefined;
    authenticate.mockReturnValue(new Promise((r) => { answer = r; }));
    const { piSession, ArrivalReport } = await load();
    render(<ArrivalReport />);
    piSession.warm();
    await act(async () => { answer({ accessToken: 'pi-token', user: { uid: 'u' } }); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(arrivals()).toBe(1);
    await act(async () => { await piSession.ensureAuth(); });
    expect(arrivals()).toBe(1);
  });

  it('a sign-in that already happened before the reporter mounted still counts', async () => {
    authenticate.mockResolvedValue({ accessToken: 'pi-token' });
    const { piSession, ArrivalReport } = await load();
    await piSession.ensureAuth();
    render(<ArrivalReport />);
    await act(async () => { await Promise.resolve(); });
    expect(arrivals()).toBe(1);
  });

  it('Pi refusing the handshake reports nothing', async () => {
    authenticate.mockRejectedValue(new Error('user cancelled'));
    const { piSession, ArrivalReport } = await load();
    render(<ArrivalReport />);
    await act(async () => { await piSession.ensureAuth(); });
    expect(arrivals()).toBe(0);
  });

  it('a Hub-owned session (opened from the Hub grid) never signs in here, so it is not counted', async () => {
    (window as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION = true;
    const { piSession, ArrivalReport } = await load();
    render(<ArrivalReport />);
    await act(async () => { await piSession.ensureAuth(); });
    expect(authenticate).not.toHaveBeenCalled();
    expect(arrivals()).toBe(0);
  });
});
