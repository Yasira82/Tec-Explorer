import { NextResponse } from 'next/server';

// Platform health endpoint (C-92 / C-96). Public — health checks need no auth (ADR-005).
// Returns a C-92-shaped snapshot; NEVER throws (a health endpoint that 500s is a
// silent runtime). Consumed by clients (checkBackendHealth) + observability scrape.
//
// New v2 in tec-template-base: every app ships this so the platform health runtime
// and the SLO/runtime-evidence loop have a uniform signal.

const GW = process.env.API_GATEWAY_URL ?? '';
const TIMEOUT_MS = 5000;

export async function GET() {
  const timestamp = new Date().toISOString();

  // No gateway configured → report self as up but backend unknown (fail-safe, not fail-throw).
  if (!GW) {
    return NextResponse.json(
      { online: true, status: 'ok', services: {}, timestamp, note: 'no API_GATEWAY_URL configured' },
      { status: 200 },
    );
  }

  try {
    const res = await fetch(`${GW}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    const online = res.ok && (data.online ?? (data.status === 'ok' || data.status === 'degraded' || true));
    return NextResponse.json(
      { online, status: data.status ?? (online ? 'ok' : 'down'), services: data.services ?? {}, timestamp },
      { status: 200 },
    );
  } catch (err) {
    // Unreachable/timeout → online:false, but the endpoint itself still answers 200.
    return NextResponse.json(
      { online: false, status: 'down', services: {}, timestamp, error: err instanceof Error ? err.message : 'unreachable' },
      { status: 200 },
    );
  }
}
