import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/observability/logger';

/**
 * Where the browser reports what the REPORT-ONLY policy would have blocked (next.config.js). It blocks
 * nothing; it is how the named connect-src list is checked in Pi Browser before it is ever enforced
 * (TEC-AUDIT-0051: an untried named list broke Pi sign-in in the Hub, 15 Nov 2026).
 *
 * Logged: the directive and the HOST only. A blocked URL's path or query can carry a token or a name;
 * it is never written. Always 204 — a report never fails, and never tells a sender anything.
 */
const MAX_BYTES = 16 * 1024;

type Violation = { directive?: unknown; blocked?: unknown };

function violations(body: unknown): Violation[] {
  // The older shape: { "csp-report": { "blocked-uri", "effective-directive" } }.
  const old = (body as { 'csp-report'?: Record<string, unknown> } | null)?.['csp-report'];
  if (old) return [{ directive: old['effective-directive'] ?? old['violated-directive'], blocked: old['blocked-uri'] }];
  // The Reporting API: [{ type: 'csp-violation', body: { blockedURL, effectiveDirective } }].
  if (Array.isArray(body)) {
    return body
      .filter((r) => (r as { type?: unknown })?.type === 'csp-violation')
      .map((r) => (r as { body?: Record<string, unknown> }).body ?? {})
      .map((b) => ({ directive: b.effectiveDirective, blocked: b.blockedURL }));
  }
  return [];
}

function hostOf(blocked: unknown): string | null {
  if (typeof blocked !== 'string') return null;
  try { return new URL(blocked).host || null; } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (text.length <= MAX_BYTES) {
      for (const v of violations(JSON.parse(text)).slice(0, 10)) {
        const host = hostOf(v.blocked);
        if (host && typeof v.directive === 'string') log.warn('csp.would_block', { directive: v.directive.slice(0, 40), host: host.slice(0, 120) });
      }
    }
    // A body that is not a report carries nothing worth logging (no-silent-failures: the agreed marker).
  } catch { /* ignore */ }
  return new NextResponse(null, { status: 204 });
}
