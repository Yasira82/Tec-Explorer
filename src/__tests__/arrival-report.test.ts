import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A tap is not an arrival.
 *
 * The Hub records a campaign visit the instant a mission link is pressed. The
 * tap and the arrival are two independent events: the record succeeds whether
 * or not this app ever loaded, so a closed tab, a dead link or an app that is
 * down all count exactly like a visit.
 *
 * That matters because Pi accepts a `.pi` domain claim only once an app has 5
 * unique KYC'd pioneers ENGAGE WITH THE APP — measured at the app. The only
 * place that can honestly say somebody arrived is the app itself.
 *
 * These assertions guard the two properties that make the report worth having.
 */
const read = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the arrival report says which app from SERVER code', () => {
  const route = code('app/api/bff/pioneer/arrived/route.ts');

  it('sends APP_SOURCE, never a slug out of the request', () => {
    // The property that stops a browser crediting an app it never opened. This
    // deployment can only ever vouch for itself.
    expect(route).toMatch(/app: APP_SOURCE/);
    expect(route).toContain("from '@/lib/app-source'");
    expect(route).not.toMatch(/body\?\.app|input\.app|body\.app/);
  });

  it('carries the internal key — which is what a browser cannot forge', () => {
    // The Hub's tap endpoint is reachable from a page; this one is not. That
    // difference is the whole evidential value of the record.
    expect(route).toMatch(/'x-internal-key'/);
  });

  it('takes the owner from the session, not the payload', () => {
    expect(route).toContain('requireAuth: true');
    expect(route).not.toMatch(/owner|username|pi_uid/);
  });

  it('says WHY an arrival was not recorded', () => {
    // A zero on the coverage screen is the only symptom otherwise — Insure sat
    // at 0/5 with nine pioneers opening it and nothing said which link broke.
    expect(route).toMatch(/reason: `gateway_\$\{res\.status\}`/);
    expect(route).toMatch(/log\.warn\('pioneer\.arrival_not_configured'/);
  });

  it('offers a read-only check that records nothing', () => {
    const get = route.slice(route.indexOf('export async function GET'));
    expect(get).toMatch(/configured:/);
    expect(get).toMatch(/tokenValid/);
    expect(get).not.toMatch(/fetch\(/);
  });

  it('never fails the visit it is reporting', () => {
    // Nobody asked for this request. Bookkeeping that can break somebody's
    // visit is worse than bookkeeping that is occasionally missing.
    expect(route).toMatch(/recorded: false/);
    expect(route).not.toMatch(/throw /);
  });
});

describe('the reporter is silent and bounded', () => {
  const cmp = code('components/pioneer/ArrivalReport.tsx');

  it('reports once per browsing session, not once per page', () => {
    expect(cmp).toMatch(/sessionStorage/);
  });

  it('marks it done only when the server actually took it', () => {
    // A failed report should be retried on the next page, not silently treated
    // as done.
    // `res.ok` is not enough: the route answers 200 with `recorded: false` so it
    // never fails a page, and a status-only check took every refusal as done.
    expect(cmp).toMatch(/body\?\.recorded === true/);
    expect(cmp).not.toMatch(/if \(res\.ok\) \{/);
  });

  it('survives navigation, like the Hub tap record does', () => {
    // This is the tab a mission link opened; it may navigate away at once.
    expect(cmp).toMatch(/keepalive:\s+true/);
  });

  it('renders nothing and swallows every failure', () => {
    expect(cmp).toMatch(/return null;/);
    expect(cmp).toMatch(/\.catch\(\(\) => \{/);
  });
});

describe('it is actually mounted', () => {
  it('sits in the root layout, so every page of the app reports', () => {
    // A reporter nothing renders is the same as no reporter — and this is the
    // exact failure mode the platform has hit repeatedly: a module written,
    // tested, and never wired.
    const layout = code('app/layout.tsx');
    expect(layout).toMatch(/<ArrivalReport \/>/);
    expect(layout).toContain("from '@/components/pioneer/ArrivalReport'");
  });
});
