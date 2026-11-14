/**
 * /pi-test shows why a campaign mission did not tick (same panel as Commerce).
 *
 * Owner, 2026-10-05: Zone stayed at "tapped 1 → arrived 0" while Life — the
 * same sign-in code — read 1 → 1, and the phone showed nothing of which step
 * stopped. Each step now writes its outcome; nothing about who signed in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';
import { readTrace, SIGNIN_TRACE, ARRIVAL_TRACE } from '../lib/pioneer/arrival-trace';

const authenticate = vi.fn();
let available = true;
vi.mock('../lib/pi/PiRuntime', () => ({
  PiRuntime: {
    isAvailable:  () => available,
    authenticate: (...a: unknown[]) => authenticate(...a),
  },
}));

type W = { __TEC_PI_FOREIGN_SESSION?: boolean };
const w = window as unknown as W;
const tick = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const session = async () => (await import('../lib/pi/pi-session')).piSession;

beforeEach(() => {
  vi.resetModules();
  authenticate.mockReset();
  available = true;
  sessionStorage.clear();
  delete w.__TEC_PI_FOREIGN_SESSION;
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the sign-in step', () => {
  it('records a Hub-owned session', async () => {
    w.__TEC_PI_FOREIGN_SESSION = true;
    await (await session()).ensureAuth();
    expect(readTrace<{ result: string }>(SIGNIN_TRACE)?.result).toBe('foreign-session');
  });

  it('records a missing SDK', async () => {
    available = false;
    await (await session()).ensureAuth();
    expect(readTrace<{ result: string }>(SIGNIN_TRACE)?.result).toBe('no-sdk');
  });

  it("records Pi's refusal with its message", async () => {
    authenticate.mockRejectedValue(new Error('user cancelled'));
    await (await session()).ensureAuth();
    expect(readTrace(SIGNIN_TRACE)).toMatchObject({ result: 'error', error: 'user cancelled' });
  });

  it('records a success — and nothing about who signed in', async () => {
    authenticate.mockResolvedValue({ user: { uid: 'secret-uid', username: 'someone' }, accessToken: 'tok' });
    await (await session()).ensureAuth();
    const raw = sessionStorage.getItem(SIGNIN_TRACE) ?? '';
    expect(JSON.parse(raw).result).toBe('ok');
    expect(raw).not.toMatch(/secret-uid|someone|tok"/);
  });
});

describe('the report step', () => {
  const signInAndReport = async () => {
    authenticate.mockResolvedValue({});
    const s = await session();
    const { ArrivalReport } = await import('../components/pioneer/ArrivalReport');
    render(<ArrivalReport />);
    await s.ensureAuth();
    await tick();
  };

  it("records the server's answer, including a refusal's reason", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ recorded: false, reason: 'gateway_403' }) })));
    await signInAndReport();
    expect(readTrace(ARRIVAL_TRACE)).toMatchObject({ status: 200, recorded: false, reason: 'gateway_403' });
  });

  it('records an HTTP failure status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    await signInAndReport();
    expect(readTrace(ARRIVAL_TRACE)).toMatchObject({ status: 401, recorded: false });
  });
});

describe('/pi-test panel', () => {
  it('prints each step', async () => {
    sessionStorage.setItem(SIGNIN_TRACE, JSON.stringify({ at: 'x', result: 'foreign-session' }));
    const { ArrivalTracePanel } = await import('../app/pi-test/ArrivalTracePanel');
    render(<ArrivalTracePanel />);
    await tick();
    expect(screen.getByText('Campaign arrival')).toBeTruthy();
    expect(screen.getByText('foreign-session')).toBeTruthy();
    expect(screen.getByText('not sent')).toBeTruthy();
  });
});
