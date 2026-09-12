import { NextRequest, NextResponse } from 'next/server';
import { isTestnetHost } from '@/lib/pi-network';

// GET /api/bff/subscription — the caller's subscription (plan + status) from
// commerce-service (the Subscription owner, C-47). Session-scoped (P6), read-only.
// Same gateway-forward shape as the payment BFF (token + x-internal-key).
const GW = process.env.API_GATEWAY_URL ?? '';

/**
 * The FREE answer, in the exact envelope commerce returns, so every reader —
 * `resolveProStatus`, the Pro card, the renewal reminder — parses it the same
 * way it parses a real one. A different shape here would be a second contract.
 */
const FREE_ON_TESTNET = {
  success: true,
  data: {
    subscription: {
      plan:               'FREE',
      status:             'ACTIVE',
      isActive:           false,
      isExpired:          false,
      current_period_end: null,
      daysRemaining:      null,
      testnet:            true,
    },
  },
};

export async function GET(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Gateway not configured' }, { status: 503 });

  // A Testnet host activates NOTHING: commerce refuses to grant PRO from a
  // payment marked `testnet` (Test-Pi never buys anything real). So this host
  // must not DISPLAY an entitlement either — otherwise the owner's real
  // Mainnet subscription shows through on the test network and the screen says
  // "You're on Pro" about a plan that nothing here can grant, renew or expire.
  //
  // Read from THIS ROUTE'S OWN Host header, server-side. Never from the client,
  // and never from a build-time constant: one build serves both hosts, which is
  // the whole reason this class of bug exists.
  //
  // This is display-only. The authority is still commerce: it refuses the
  // activation. This route never grants anything — it only declines to show
  // what the other network owns.
  if (isTestnetHost(req.headers.get('host'))) {
    return NextResponse.json(FREE_ON_TESTNET, { status: 200 });
  }

  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
    'x-request-id': crypto.randomUUID(),
  };
  if (process.env.INTERNAL_SECRET) headers['x-internal-key'] = process.env.INTERNAL_SECRET;

  try {
    const res  = await fetch(`${GW}/api/commerce/subscriptions/status`, { method: 'GET', headers, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
