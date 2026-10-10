/**
 * On the Testnet host (`*.vercel.app`) a cookie with Domain=.tecosystem.app is dropped by
 * the browser, silently — Tec-Ecommerce #80 found it the hard way (2026-10-10). Every route
 * here that sets or clears a session cookie decides its Domain with cookieDomainFor.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('session cookies on the Testnet host', () => {
  it('refresh, logout and sso-callback use cookieDomainFor, never the raw COOKIE_DOMAIN', () => {
    for (const f of ['refresh', 'logout', 'sso-callback']) {
      const p = join(process.cwd(), `src/app/api/auth/${f}/route.ts`);
      if (!existsSync(p)) continue;
      const src = readFileSync(p, 'utf8');
      expect(src, f).toContain('cookieDomainFor(');
      expect(src, f).not.toMatch(/const cookieDomain\s*=\s*\n?\s*process\.env\.COOKIE_DOMAIN/);
    }
  });
});
