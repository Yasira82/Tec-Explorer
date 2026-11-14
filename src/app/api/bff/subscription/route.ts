import { NextRequest, NextResponse } from 'next/server';
import { resolveProState } from '@/lib/subscription/pro-status';
import { isTestnetHost } from '@/lib/pi-network';

// GET /api/bff/subscription — the caller's OWN Pro entitlement + renewal signal.
// Subscription is COMMERCE-OWNED (C-47); this only reflects it (P5). Identity is
// the session token, resolved by the gateway — never a client field (P6). Fails
// closed to FREE. Use `pro` to gate a feature; use `daysRemaining` / `isExpired`
// to show a renewal reminder (Pi Pro is one-time, no auto-renewal).
export async function GET(req: NextRequest) {
  // A Testnet host activates NOTHING: commerce refuses to grant PRO from a
  // payment marked `testnet`. So it must not DISPLAY an entitlement either —
  // otherwise a real Mainnet subscription shows through on the test network.
  // Read from THIS ROUTE'S OWN Host header, server-side; one build serves both
  // hosts, so a build constant cannot answer this.
  if (isTestnetHost(req.headers.get('host'))) {
    return NextResponse.json(
      { pro: false, plan: 'FREE', isExpired: false, daysRemaining: null, testnet: true },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  }

  const token = req.cookies.get('tec_access_token')?.value ?? '';
  const state = await resolveProState(token);
  return NextResponse.json(state, { headers: { 'Cache-Control': 'private, max-age=30' } });
}
