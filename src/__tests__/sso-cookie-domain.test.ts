// @vitest-environment node
//
// A session cookie whose `Domain` does not cover the request host is REJECTED by
// the browser, silently — no error server-side, none client-side.
//
// One build serves two Pi apps on two hosts: `connection.tecosystem.app` (the
// Mainnet app) and `tec-connection.vercel.app` (the paired Testnet one). With
// `COOKIE_DOMAIN=.tecosystem.app` every cookie was dropped on the second, and
// the app told a visitor who had just signed in successfully that they were
// "Unauthorized" — 0 followers, an invite card asking them to sign in.
//
// `vercel.app` is on the Public Suffix List, so no wildcard cookie could be set
// on it even if one were wanted. The only correct cookie there is host-only.
import { describe, it, expect } from 'vitest';
// The REAL function the route calls — not a copy of the rule written here. A
// re-implementation in a test passes whatever the source does, which is the
// same as having no test.
import { cookieDomainFor } from '@/lib/cookie-domain';

describe('the SSO cookie domain never exceeds the host', () => {
  it('keeps the configured domain where it genuinely applies', () => {
    // The Mainnet host must be untouched by this fix — cross-subdomain SSO is
    // the reason COOKIE_DOMAIN exists.
    expect(cookieDomainFor('connection.tecosystem.app', '.tecosystem.app')).toBe('.tecosystem.app');
    expect(cookieDomainFor('hub.tecosystem.app', 'tecosystem.app')).toBe('tecosystem.app');
  });

  it('drops it on a host the domain does not cover', () => {
    expect(cookieDomainFor('tec-connection.vercel.app', '.tecosystem.app')).toBeUndefined();
    // Host-only is not a downgrade here. The alternative is not a broader
    // cookie — it is no cookie at all.
  });

  it('is not fooled by a host that merely ENDS with the letters', () => {
    // `nottecosystem.app` ends with "tecosystem.app" as a string. The boundary
    // is the dot, and a suffix test without it would hand a cookie to a domain
    // somebody else can register.
    expect(cookieDomainFor('nottecosystem.app', '.tecosystem.app')).toBeUndefined();
    expect(cookieDomainFor('eviltecosystem.app', 'tecosystem.app')).toBeUndefined();
  });

  it('is host-only when nothing is configured', () => {
    expect(cookieDomainFor('connection.tecosystem.app', undefined)).toBeUndefined();
  });
});

describe('the route and the fallback both obey C-123', () => {
  const src = new URL('../app/api/auth/sso-callback/route.ts', import.meta.url).pathname;
  const read = () => require('node:fs').readFileSync(src, 'utf8') as string;

  it('the route uses that function rather than the raw env var', () => {
    const s = read();
    expect(s).toMatch(/cookieDomainFor\(\s*\n?\s*req\.nextUrl\.hostname/);
    // The raw value must not reach cookieOpts directly any more.
    expect(s).not.toMatch(/const cookieDomain\s*=\s*\n?\s*process\.env\.COOKIE_DOMAIN/);
  });

  it('the document.cookie fallback sets Partitioned (LAW 3)', () => {
    // The server response already carries it. The fallback did not — and the
    // Testnet host is precisely where the fallback is what carries the session.
    const s = read();
    expect(s).toMatch(/secure; samesite=none; partitioned/);
  });

  it('the fallback sets no domain at all', () => {
    // It runs in the browser, on whichever host served the page: host-only by
    // omission is the correct and only safe behaviour there.
    const s = read();
    const line = s.split('\n').find((l) => l.includes("'; path=/; max-age='")) ?? '';
    expect(line).not.toContain('domain');
  });
});
