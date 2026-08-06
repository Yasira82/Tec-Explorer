import { NextRequest, NextResponse } from 'next/server';

// GET /api/bff/subscription — the caller's subscription (plan + status) from
// commerce-service (the Subscription owner, C-47). Session-scoped (P6), read-only.
// Same gateway-forward shape as the payment BFF (token + x-internal-key).
const GW = process.env.API_GATEWAY_URL ?? '';

export async function GET(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Gateway not configured' }, { status: 503 });
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
