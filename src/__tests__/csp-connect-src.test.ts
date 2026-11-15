import { describe, it, expect } from 'vitest';
const nextConfig = require('../../next.config.js');

/**
 * connect-src names the hosts a page may send data to. It read `'self' https: wss:` — ANY
 * host. tec_access_token is readable by script by decision (ADR-001); this directive is one
 * of the controls that decision relies on, so an injected script must not be able to post
 * the token anywhere (audit of 12 Nov 2026, TEC-AUDIT-0018). The Hub was fixed first
 * (tec-app #324); this is the same rule for every app made from the template.
 */
async function connectSrc(): Promise<string[]> {
  const rules: { source: string; headers: { key: string; value: string }[] }[] = await nextConfig.headers();
  const csp = rules.flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  const directive = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src ')) ?? '';
  return directive.split(/\s+/).slice(1);
}

describe('CSP connect-src', () => {
  it('names hosts — no bare scheme, no star', async () => {
    const sources = await connectSrc();
    expect(sources.length).toBeGreaterThan(1);
    for (const s of sources) expect(['https:', 'wss:', 'http:', 'ws:', '*', 'data:', 'blob:']).not.toContain(s);
  });

  it('still allows what every app uses: its own BFF, the Pi SDK, sibling apps, Sentry', async () => {
    const sources = await connectSrc();
    for (const needed of ["'self'", 'https://*.minepi.com', 'wss://*.minepi.com', 'https://*.tecosystem.app', 'https://*.ingest.sentry.io'])
      expect(sources).toContain(needed);
  });
});
