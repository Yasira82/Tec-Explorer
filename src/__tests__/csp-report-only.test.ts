/**
 * connect-src: the way to a named list (the engineering audit, 21 Nov 2026; TEC-AUDIT-0051).
 *
 * The enforced policy stays `'self' https: wss:` — the one proven in Pi Browser. A named list broke Pi
 * sign-in in the Hub on 15 Nov 2026 (#324): the Pi SDK reaches a host nobody could name from here. So the
 * named list runs beside it as REPORT-ONLY first: it blocks nothing, and every host it WOULD block is
 * logged by /api/csp-report. When a Pi Browser sign-in and payment report nothing, it can be enforced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const nextConfig = require('../../next.config.js');

const warn = vi.fn();
vi.mock('@/lib/observability/logger', () => ({ log: { warn: (...a: unknown[]) => warn(...a), info: vi.fn(), error: vi.fn() } }));
import { POST } from '../app/api/csp-report/route';

async function policy(key: string): Promise<Record<string, string[]>> {
  const rules: { source: string; headers: { key: string; value: string }[] }[] = await nextConfig.headers();
  const value = rules.flatMap((r) => r.headers).find((h) => h.key === key)?.value ?? '';
  return Object.fromEntries(value.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...rest] = d.split(/\s+/);
    return [name as string, rest];
  }));
}

describe('the two policies', () => {
  it('the enforced one is unchanged — the policy proven in Pi Browser', async () => {
    expect((await policy('Content-Security-Policy'))['connect-src']).toEqual(["'self'", 'https:', 'wss:']);
  });
  it('a named list runs beside it, report-only, and says where to report', async () => {
    const ro = await policy('Content-Security-Policy-Report-Only');
    expect(ro['connect-src']).toContain("'self'");
    expect(ro['connect-src']).not.toContain('https:');
    expect(ro['connect-src']).not.toContain('wss:');
    expect(ro['report-uri']).toEqual(['/api/csp-report']);
  });
});

const report = (body: unknown, type = 'application/csp-report') =>
  POST(new NextRequest('https://app.tecosystem.app/api/csp-report', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': type } }));

describe('/api/csp-report', () => {
  beforeEach(() => warn.mockClear());

  it('logs the host it would block — never the path or the query (they can carry a token)', async () => {
    const res = await report({ 'csp-report': { 'blocked-uri': 'https://api.example.com/v2/me?token=SECRET', 'effective-directive': 'connect-src' } });
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith('csp.would_block', { directive: 'connect-src', host: 'api.example.com' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });

  it('reads the newer Reporting API shape too', async () => {
    await report([{ type: 'csp-violation', body: { blockedURL: 'wss://rt.example.com/socket', effectiveDirective: 'connect-src' } }], 'application/reports+json');
    expect(warn).toHaveBeenCalledWith('csp.would_block', { directive: 'connect-src', host: 'rt.example.com' });
  });

  it('anything else is answered 204 and logs nothing — a report never fails a page', async () => {
    expect((await report('not json at all')).status).toBe(204);
    expect((await report({ nothing: true })).status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
