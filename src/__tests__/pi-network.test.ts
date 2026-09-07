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
