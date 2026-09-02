import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// TEC Connect inside Explorer (C-107 §14.3).
//
// One constraint shapes this whole feature and it is invisible at runtime in a
// desktop browser:
//
//   `explorer.tecosystem.app` and `connection.tecosystem.app` are SEPARATE
//   ORIGINS. A Follow button calling Connection's API from the browser is a
//   third-party credentialed request — the exact case C-123 documents Pi Browser
//   breaking (Partitioned cookies; Set-Cookie dropped on XHR and on 3xx).
//
// Built that way it WORKS IN CHROME AND FAILS IN PI BROWSER. Every functional
// test passes. So the check has to be structural: the client must reach only
// this app's own origin, and the cross-origin hop must happen on the server.
//
// The second thing checked here is a privacy gate. A Pi username is a personal
// identifier: someone who self-listed a shop agreed to list the shop, not to
// have their handle printed beside it. Publishing a Connection profile is the
// opt-in, and that gate is the only thing standing between the two.

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

/**
 * The file with its comments removed.
 *
 * A check that matches a comment reports FAIL on a clean tree, and that is how a
 * gate teaches people to ignore it — the exact mistake recorded against the
 * tec-ui release gate, which grepped for `Pi.create` and matched the package's
 * own explanation of why it must not appear.
 *
 * These files EXPLAIN the cross-origin rule in prose, so the rule has to be
 * checked against the code alone.
 */
const code = (p: string) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

describe('the follow request never crosses an origin in the browser', () => {
  const button = code('components/connect/FollowOwner.tsx');

  it('fetches only same-origin paths', () => {
    // Every fetch in the component must start with "/". A single absolute URL
    // here is the whole bug.
    const urls = [...button.matchAll(/fetch\(\s*(['"`])([^'"`]+)\1/g)]
      .map((m) => m[2] ?? '');
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith('/')).toBe(true);
  });

  it('never names Connection\'s host in CODE', () => {
    // The comments in that file explain this rule at length; only the code is
    // checked, or the gate fails on its own documentation.
    expect(button).not.toMatch(/connection\.tecosystem\.app/);
    expect(button).not.toMatch(/identity\/connection/);
  });

  it('the check can actually fail', () => {
    // A guard that cannot fail is not a guard. Comment-stripping must not also
    // strip the thing being looked for.
    const withHost = "await fetch('https://connection.tecosystem.app/api/x');";
    expect(withHost).toMatch(/connection\.tecosystem\.app/);
  });

  it('goes through this app\'s own BFF', () => {
    expect(button).toContain('/api/bff/connection/following');
  });
});

describe('the BFF is where the cross-origin hop happens', () => {
  const route = code('app/api/bff/connection/following/route.ts');

  it('calls the gateway from the server, with the session token', () => {
    expect(route).toContain('API_GATEWAY_URL');
    expect(route).toContain('/api/identity/connection/follow');
    expect(route).toMatch(/Bearer \$\{token\}/);
  });

  it('never ships the gateway URL to the client (NEW-A)', () => {
    // A NEXT_PUBLIC_ gateway var would put an internal host in the bundle.
    expect(route).not.toMatch(/NEXT_PUBLIC_API_GATEWAY_URL/);
  });

  it('treats "already following" as success', () => {
    // 409 means the edge exists. Reporting that as an error would be a lie
    // about the caller's own graph.
    expect(route).toContain('409');
  });

  it('answers an unauthenticated READ with an empty list, not a 401', () => {
    // The business page is public. A 401 on page load would surface as an error
    // to someone who has done nothing wrong.
    expect(route).toMatch(/if \(!GW \|\| !tok\) return NextResponse\.json\(\{ following: \[\] \}\)/);
  });
});

describe('the owner handle is gated on a published Connection profile', () => {
  const server = code('lib/explorer/server.ts');
  const page   = code('app/business/[id]/page.tsx');

  it('resolves the owner through the gate, never straight from the listing', () => {
    // `l.owner` must not reach the screen on its own: listing a shop is not
    // consent to having your personal handle printed beside it.
    expect(page).toContain('resolveOwnerProfile(l?.owner)');
    expect(page).toMatch(/\{owner && \(/);
  });

  it('returns null on any doubt', () => {
    // No owner, no published profile, unreachable backend — all the same answer:
    // the page does not offer to follow anyone (P6).
    expect(server).toMatch(/if \(!res\.ok\) return null;/);
    expect(server).toMatch(/catch \{\s*return null;/);
  });
});
