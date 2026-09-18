import { NextResponse } from 'next/server';

// Readiness endpoint (C-92 / C-96) — the counterpart to /api/health, and deliberately
// its opposite in one respect.
//
// ── Why a second endpoint, and why this one is allowed to fail ──────────────────
// /api/health NEVER 500s and always answers 200. That is correct for LIVENESS: during
// the "Backend Offline" incident (NEW-W) a health check that failed under load told
// the platform it was down when it was merely busy, and the false alarm was the outage
// people saw. So health answers "this app is running" and reports the backend inside
// the body.
//
// But that makes health unable to answer the OTHER question, and something has to:
//
//     health  → "am I alive?"   — always 200, never blocks a deploy
//     ready   → "can I serve?"  — 503 when a dependency I need is not usable
//
// A single endpoint cannot be both. One that always returns 200 can never gate a
// rollout; one that fails under load can take a healthy fleet offline. The platform
// already has the honest version of this split in tec-asset-service (/health + /ready);
// this brings it to every app built from the template.
//
// ── What "ready" means here ─────────────────────────────────────────────────────
// An app with no reachable API gateway cannot serve a signed-in user: login, payment
// and every BFF route go through it. Serving the shell in that state is how a user
// gets an app that looks fine and fails at the first action.
//
// Public + unauthenticated (ADR-005, same as /health): a readiness probe holds no
// session. It exposes no internal host — only whether a dependency answered (NEW-A).

const GW = process.env.API_GATEWAY_URL ?? '';
const TIMEOUT_MS = 3000;

// Probes must be cheap and current — a cached readiness answer is a stale one, and a
// stale "ready" is exactly the reading that keeps a broken instance in rotation.
export const dynamic = 'force-dynamic';

type Check = { name: string; ready: boolean; detail?: string };

const body = (ready: boolean, checks: Check[]) => ({
  ready,
  status: ready ? 'ready' : 'not-ready',
  checks,
  timestamp: new Date().toISOString(),
});

export async function GET() {
  const checks: Check[] = [];

  // Unconfigured is NOT ready. Fail closed (P6): an app that does not know where its
  // gateway is cannot serve a session, and "no config" must never read as "fine".
  if (!GW) {
    checks.push({ name: 'api-gateway', ready: false, detail: 'API_GATEWAY_URL is not set' });
    return NextResponse.json(body(false, checks), { status: 503 });
  }

  try {
    const res = await fetch(`${GW}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    checks.push({
      name: 'api-gateway',
      ready: res.ok,
      detail: res.ok ? undefined : `HTTP ${res.status}`,
    });
  } catch (err) {
    checks.push({
      name: 'api-gateway',
      ready: false,
      detail: err instanceof Error ? err.message : 'unreachable',
    });
  }

  const ready = checks.every((c) => c.ready);
  return NextResponse.json(body(ready, checks), { status: ready ? 200 : 503 });
}
