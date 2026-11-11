import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { createElement } from 'react';
import { today } from '@/lib/pi/counted-once';

// Once per person per day, not per visit (owner, 10 Nov 2026): a person Pi already
// signed in here is counted again (the arrival is announced) without a new
// Pi handshake; anyone else gets the warm-up as before.

const session = vi.hoisted(() => ({
  warm: vi.fn(),
  announceCountedVisit: vi.fn(),
  onSignedIn: vi.fn(),
  username: 'Yas55eR82' as string | null,
}));
vi.mock('@/lib/pi/pi-session', () => ({ piSession: session }));
vi.mock('@/lib/pi/self-sign-in', () => ({ selfSignIn: vi.fn() }));

const me = (username: string | null) => vi.fn().mockResolvedValue(username
  ? { ok: true, status: 200, json: async () => ({ authenticated: true, user: { username } }) }
  : { ok: false, status: 401, json: async () => ({ authenticated: false, user: null }) });

describe('PiWarmup counts a visitor once', () => {
  beforeEach(() => {
    window.localStorage.clear();
    session.warm.mockReset(); session.announceCountedVisit.mockReset(); session.onSignedIn.mockReset();
    (window as unknown as { __TEC_PI_READY?: boolean }).__TEC_PI_READY = true;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('first visit: warms up (signs in with Pi) and remembers the person once Pi answers', async () => {
    vi.stubGlobal('fetch', me('yas55eR82'));
    const { PiWarmup } = await import('@/components/pi/PiWarmup');
    await act(async () => { render(createElement(PiWarmup)); });
    await vi.waitFor(() => expect(session.warm).toHaveBeenCalledTimes(1));
    expect(session.announceCountedVisit).not.toHaveBeenCalled();
    // Pi answered: the registered callback remembers the person
    const remember = session.onSignedIn.mock.calls[0]?.[0] as () => void;
    remember();
    expect(JSON.parse(window.localStorage.getItem('__tec_pi_counted_day') ?? '{}')).toEqual({ yas55er82: today() });
  });

  it('a repeat visit by the same person: arrival announced, no handshake', async () => {
    window.localStorage.setItem('__tec_pi_counted_day', JSON.stringify({ yas55er82: today() }));
    vi.stubGlobal('fetch', me('yas55eR82'));
    const { PiWarmup } = await import('@/components/pi/PiWarmup');
    await act(async () => { render(createElement(PiWarmup)); });
    await vi.waitFor(() => expect(session.announceCountedVisit).toHaveBeenCalledTimes(1));
    expect(session.warm).not.toHaveBeenCalled();
  });

  it('no session yet: warms up — that handshake is also how the visitor logs in', async () => {
    window.localStorage.setItem('__tec_pi_counted_day', JSON.stringify({ yas55er82: today() }));
    vi.stubGlobal('fetch', me(null));
    const { PiWarmup } = await import('@/components/pi/PiWarmup');
    await act(async () => { render(createElement(PiWarmup)); });
    await vi.waitFor(() => expect(session.warm).toHaveBeenCalledTimes(1));
  });

  it('counted yesterday: today\'s first visit warms up again', async () => {
    window.localStorage.setItem('__tec_pi_counted_day', JSON.stringify({ yas55er82: '2000-01-01' }));
    vi.stubGlobal('fetch', me('yas55eR82'));
    const { PiWarmup } = await import('@/components/pi/PiWarmup');
    await act(async () => { render(createElement(PiWarmup)); });
    await vi.waitFor(() => expect(session.warm).toHaveBeenCalledTimes(1));
    expect(session.announceCountedVisit).not.toHaveBeenCalled();
  });
});
