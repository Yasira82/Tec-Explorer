import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { createElement } from 'react';
import { looksLikePiBrowser } from '@/lib/pi/pi-browser';

// PiNet (Pi Next hackathon requirement, 27 Nov 2026): an app opened through its pinet.com link in an ordinary
// browser may be looked at without a Pi account, but «once the application invokes Pi.authenticate the user's
// experience will end» (developers.minepi.com/docs/build-first-app/PiNet). The warm-up signed in on every page
// load, so a PiNet visitor was stopped on arrival. It now runs only in Pi Browser; elsewhere sign-in waits for
// a tap. Pi Browser is recognised the way the Hub already does (tec-app hub/page.tsx looksLikePiBrowser), plus
// the React Native bridge Pi Browser's webview carries.

const UA = {
  piBrowserAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 PiBrowser/2.4.1',
  piBrowserNamed:   'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Pi Network',
  androidWebView:   'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36',
  chromeAndroid:    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  safariIphone:     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeDesktop:    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  firefoxDesktop:   'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
};

describe('looksLikePiBrowser', () => {
  it('Pi Browser by its name, or an Android webview — the Hub\'s rule', () => {
    expect(looksLikePiBrowser(UA.piBrowserAndroid)).toBe(true);
    expect(looksLikePiBrowser(UA.piBrowserNamed)).toBe(true);
    expect(looksLikePiBrowser(UA.androidWebView)).toBe(true);
  });
  it('an ordinary browser — where a PiNet link opens — is not', () => {
    for (const ua of [UA.chromeAndroid, UA.safariIphone, UA.chromeDesktop, UA.firefoxDesktop]) expect(looksLikePiBrowser(ua), ua).toBe(false);
  });
  it('the React Native bridge of Pi Browser\'s webview counts, whatever the user agent', () => {
    expect(looksLikePiBrowser(UA.safariIphone, { ReactNativeWebView: {} })).toBe(true);
  });
});

const session = vi.hoisted(() => ({ warm: vi.fn(), announceCountedVisit: vi.fn(), onSignedIn: vi.fn(), username: null as string | null }));
const signIn = vi.hoisted(() => ({ selfSignIn: vi.fn() }));
vi.mock('@/lib/pi/pi-session', () => ({ piSession: session }));
vi.mock('@/lib/pi/self-sign-in', () => signIn);

describe('PiWarmup outside Pi Browser (a PiNet visit)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    session.warm.mockReset(); signIn.selfSignIn.mockReset();
    (window as unknown as { __TEC_PI_READY?: boolean }).__TEC_PI_READY = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ authenticated: false, user: null }) }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('an ordinary browser: no handshake and no sign-in on load — the visitor can look around', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(UA.chromeAndroid);
    const { PiWarmup } = await import('@/components/pi/PiWarmup');
    await act(async () => { render(createElement(PiWarmup)); });
    await new Promise((r) => setTimeout(r, 30));
    expect(session.warm).not.toHaveBeenCalled();
    expect(signIn.selfSignIn).not.toHaveBeenCalled();
  });

  it('Pi Browser: exactly as before — warms up and signs in', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(UA.piBrowserAndroid);
    const { PiWarmup } = await import('@/components/pi/PiWarmup');
    await act(async () => { render(createElement(PiWarmup)); });
    await vi.waitFor(() => expect(session.warm).toHaveBeenCalledTimes(1));
    expect(signIn.selfSignIn).toHaveBeenCalledTimes(1);
  });
});
