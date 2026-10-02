import { NextRequest, NextResponse } from 'next/server';
import { isTestnetHost } from '@/lib/pi-network';
import { APP_SOURCE } from '@/lib/app-source';

const GW = process.env.API_GATEWAY_URL ?? '';

/**
 * POST /api/bff/subscription/cancel — cancel THIS app's Pro (commerce owns the
 * subscription, C-47; `?app=` scopes it to this app — the Hub plan and other
 * apps are untouched). Identity is the session token, never the body (P6).
 * CSRF is enforced in middleware.
 */
export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Gateway not configured' }, { status: 503 });
  if (isTestnetHost(req.headers.get('host'))) {
    return NextResponse.json({ error: 'TESTNET', message: 'Nothing to cancel on the Testnet host.' }, { status: 400 });
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
    const res = await fetch(`${GW}/api/commerce/subscriptions/cancel?app=${encodeURIComponent(APP_SOURCE)}`, {
      method: 'PATCH', headers, body: JSON.stringify({ reason: 'Cancelled in app' }), cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
