import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isTestnetHost, networkMetadata } from '@/lib/pi-network';

/**
 * Which Pi network a request is on.
 *
 * A `.pi` domain requires a Pi app, and Pi issues every app TWICE — a Mainnet
 * one and a paired Testnet one, both registered against the SAME deployment on
 * different hosts. One build serves both, so `NEXT_PUBLIC_PI_SANDBOX` cannot
 * answer this: it is baked at build time and there is only one build.
 *
 * The consequence of getting it wrong in the permissive direction is a free
 * subscription: a payment made with Test-Pi that a consumer treats as real.
 */

describe('the host decides the network', () => {
  it('reads the paired Testnet app from a vercel.app host', () => {
    for (const h of [
      'tec-app.vercel.app',
      'tec-app-frontend.vercel.app',
      'TEC-APP.VERCEL.APP',
      'tec-app.vercel.app:443',
      ' tec-app.vercel.app ',
    ]) {
      expect(isTestnetHost(h)).toBe(true);
    }
  });

  it('reads a custom domain as Mainnet', () => {
    for (const h of [
      'app.tecosystem.app',
      'hub.tecosystem.app',
      'localhost:3000',
    ]) {
      expect(isTestnetHost(h)).toBe(false);
    }
  });

  it('is not fooled by a host that merely CONTAINS the string', () => {
    // The match is anchored to the end. Without that, anyone who could get a
    // request to this app under a hostname they control could ask for the test
    // network — and the whole point of deciding server-side is that they cannot.
    for (const h of [
      'vercel.app.attacker.com',
      'notvercel.app.example.com',
      'tec-app.vercel.app.evil.com',
    ]) {
      expect(isTestnetHost(h)).toBe(false);
    }
  });

  it('treats a missing host as Mainnet, never as testnet', () => {
    // Fail closed in the direction that costs nothing: an unknown host means a
    // real payment, which at worst fails. The other way round it succeeds with
    // Test-Pi and something real gets granted.
    expect(isTestnetHost(undefined)).toBe(false);
    expect(isTestnetHost(null)).toBe(false);
    expect(isTestnetHost('')).toBe(false);
  });
});

describe('what travels with the payment', () => {
  it('marks a testnet payment, and marks nothing on a real one', () => {
    // Present only when true: a `testnet: false` on every Mainnet payment would
    // put a field about the test network on 100% of real money, and the day it
    // is written wrong is the day it means the opposite of what it says.
    expect(networkMetadata('tec-app.vercel.app')).toEqual({ testnet: true });
    expect(networkMetadata('app.tecosystem.app')).toEqual({});
  });
});

describe('the client and the server read the same fact separately', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
  const route  = readFileSync(join(process.cwd(), 'src/app/api/bff/payment/create/route.ts'), 'utf8');

  it('Pi.init picks the network from the browser’s own hostname', () => {
    // Not from a build-time flag alone — one build serves both Pi apps.
    expect(layout).toContain('.test(location.hostname)');
    expect(layout).toContain('vercel');
  });

  it('the BFF derives it from its OWN Host header', () => {
    expect(route).toContain("networkMetadata(req.headers.get('host'))");
  });

  it('the Testnet host gets sandbox=FALSE — sandbox is not testnet', () => {
    // Measured, not assumed. With sandbox:true on `*.vercel.app` the Pi bridge
    // never answered its first message ("Messaging promise with id 1 timed out
    // after 120000ms"). Same host, same build, that flag false: the wallet
    // opened and the payment reached approve.
    //
    // They are different axes. The HOST decides which Pi app the visitor is in
    // (and so which network the server approves against); `sandbox` points the
    // SDK at Pi's Sandbox ENVIRONMENT, a third thing. A paired Testnet app is a
    // normal app on its own domain, not the sandbox.
    expect(layout).toMatch(/__isTestnetHost\s*\n?\s*\?\s*\(__q === '1'\)/);
    // The opposite default must not creep back.
    expect(layout).not.toMatch(/__q !== '0'/);
  });

  it('the sandbox override is confined to the Testnet host', () => {
    expect(layout).toContain("get('pi_sandbox')");
    // The Mainnet arm of that ternary is the build flag, untouched by the URL.
    expect(layout).toMatch(/:\s*\$\{process\.env\.NEXT_PUBLIC_PI_SANDBOX === 'true'\}/);
    // …and `__q` is read in exactly one place, so it cannot have grown a second
    // use on the Mainnet side.
    expect(layout.match(/__q === '1'/g) ?? []).toHaveLength(1);
  });

  it('the BFF DROPS whatever the client sent', () => {
    // Removed before the spread, not merely overwritten by it: a later edit
    // that reorders the object must not quietly hand the network back to the
    // caller. A client that could set it could pay with Test-Pi and have a
    // consumer grant it something real.
    expect(route).toMatch(/const \{ testnet: _clientTestnet, \.\.\.metadata \}/);
  });
});


// ── Hub-entry detection: BOTH hosts ─────────────────────────────────────────
// ADR-007 exists because a visitor who arrived from the Hub is inside a Pi
// session the HUB owns: this app must not Pi.init() (it poisons that session)
// and must not Pi.authenticate() (it never answers). The detection named only
// `hub.tecosystem.app`, so a hop from the TESTNET Hub read as standalone —
// there is no error to catch, and the only thing the user sees is the app's
// own payment timeout with the Pi wallet never having opened.
describe('isHubReferrer', () => {
  it('recognises the Mainnet Hub — unchanged', async () => {
    const { isHubReferrer } = await import('@/lib/pi-network');
    expect(isHubReferrer('https://hub.tecosystem.app/hub')).toBe(true);
    expect(isHubReferrer('https://hub.tecosystem.app/')).toBe(true);
  });

  it('recognises the TESTNET Hub — the case that was blind', async () => {
    const { isHubReferrer } = await import('@/lib/pi-network');
    expect(isHubReferrer('https://tec-app-frontend.vercel.app/hub')).toBe(true);
    expect(isHubReferrer('https://TEC-APP-FRONTEND.vercel.app/hub')).toBe(true);
  });

  it('is not fooled by a host that merely CONTAINS a Hub name', async () => {
    // The old check was `referrer.includes('hub.tecosystem.app')`, and that
    // direction fails OPEN: a hostile referrer could force Mode 1 and choose
    // the Hub URL the buyer is sent to.
    const { isHubReferrer } = await import('@/lib/pi-network');
    for (const r of [
      'https://hub.tecosystem.app.attacker.com/x',
      'https://evil.com/?r=hub.tecosystem.app',
      'https://tec-app-frontend.vercel.app.evil.com/',
    ]) {
      expect(isHubReferrer(r)).toBe(false);
    }
  });

  it('treats no referrer / junk as standalone, not as a Hub hop', async () => {
    // Mode 2 is the safe reading: a wrong Mode 1 sends the buyer away from an
    // app that could have paid.
    const { isHubReferrer } = await import('@/lib/pi-network');
    for (const r of ['', null, undefined, 'not a url']) {
      expect(isHubReferrer(r as string | null | undefined)).toBe(false);
    }
  });

  it('covers exactly the origin Mode 1 pays through', async () => {
    // hubPaymentOrigin sends a Testnet buyer to the Testnet Hub. If that host
    // were not also a recognised hub REFERRER, the return hop would look
    // standalone and the next buy would hang the same way.
    const { isHubReferrer, hubPaymentOrigin, HUB_HOSTS } = await import('@/lib/pi-network');
    const testnetHubOrigin = hubPaymentOrigin('https://hub.tecosystem.app', 'tec-app.vercel.app');
    expect(isHubReferrer(`${testnetHubOrigin}/hub?pay=1`)).toBe(true);
    expect(HUB_HOSTS).toContain(new URL(testnetHubOrigin).hostname);
  });
});

// The two inline scripts (layout.tsx, sso-callback) run before any module and
// cannot import — so they interpolate HUB_HOSTS. These pin that they use the
// shared list instead of regrowing their own literal, which is how this bug
// survived in three places at once.
describe('the inline scripts read the SHARED host list', () => {
  const read = (p: string) =>
    require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');

  it('layout.tsx interpolates HUB_HOSTS and matches on hostname', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('JSON.stringify(HUB_HOSTS)');
    expect(layout).toContain('new URL(document.referrer).hostname.toLowerCase()');
    expect(layout).not.toContain("indexOf('hub.tecosystem.app')");
  });

  it('the SSO landing sets __tec_hub_entry for BOTH Hubs', () => {
    const sso = read('src/app/api/auth/sso-callback/route.ts');
    expect(sso).toContain('JSON.stringify(HUB_HOSTS)');
    expect(sso).toContain('__tec_hub_entry');
    expect(sso).not.toContain("indexOf('hub.tecosystem.app')");
  });
});

// ── The Pi SDK must not load in a Hub-owned session ────────────────────────
// The Hub's payment trace stopped at "warming the Pi session" and nothing
// followed: the wait was inside Pi.authenticate on the HUB, after a Mode-1
// bounce from this app. Skipping Pi.init() here was not enough — pi-sdk.js was
// still being pulled on this origin, which opens Pi's bridge and contests the
// app context the Hub holds, so the bounce back had to switch context first.
//
// ADR-007 says an app in a Hub-owned session must not touch Pi. Loading its
// SDK is touching it.
describe('the Pi SDK is loaded conditionally, not in the document head', () => {
  const layout = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('has no static <script src="pi-sdk">', () => {
    // A JSX <script src> in <head> loads on EVERY page, hub-entered included —
    // which is the regression this pins.
    expect(/<script\s+src=["']https:\/\/sdk\.minepi\.com/.test(layout)).toBe(false);
  });

  it('injects it only after the hub-entry branch has returned', () => {
    const lines: string[] = layout.split('\n');
    const hubReturn = lines.findIndex(l => l.includes("__tec_hub_entry"));
    const inject    = lines.findIndex(l => l.includes('sdk.minepi.com'));
    expect(hubReturn).toBeGreaterThan(-1);
    expect(inject).toBeGreaterThan(hubReturn);
  });

  it('still signals readiness on the hub-entered path, so nothing hangs', () => {
    // No SDK must never mean no signal: the page still gets tec-pi-ready with
    // __TEC_PI_FOREIGN_SESSION set, and every buy handler bounces to the Hub.
    expect(layout).toContain('window.__TEC_PI_FOREIGN_SESSION = true');
    expect(layout).toContain("window.dispatchEvent(new Event('tec-pi-ready'))");
  });

  it('reports an SDK that fails to load instead of failing silently', () => {
    expect(layout).toContain('__s.onerror');
    expect(layout).toContain("new Event('tec-pi-error')");
  });
});
