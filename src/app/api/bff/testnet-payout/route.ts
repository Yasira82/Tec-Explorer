import { NextRequest, NextResponse } from 'next/server';
import { isTestnetHost } from '@/lib/pi-network';

/**
 * One 0.01 Test-Pi payout to the person signed in — the Pi Portal's "5 unique wallets"
 * gate for Explorer's Mainnet App Wallet (tec-core-backend #410).
 *
 * Only on the TESTNET host: on Mainnet this route does not exist (404). payment-service
 * decides everything that matters — Testnet only, once per Pi account, the cap, and
 * that the Pi sign-in is the signed-in person; this route forwards the session token
 * and the Pi sign-in, and names the app.
 */
const GW = process.env.API_GATEWAY_URL ?? '';

export async function POST(req: NextRequest) {
  if (!isTestnetHost(req.headers.get('host') || req.nextUrl.host)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: { message: 'Sign in first.' } }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const piToken = typeof body?.pi_access_token === 'string' ? body.pi_access_token : '';
  if (!piToken) return NextResponse.json({ error: { message: 'Sign in with Pi first.' } }, { status: 400 });

  try {
    const res = await fetch(`${GW}/api/payment/testnet-gate/claim`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ source: 'explorer', pi_access_token: piToken }),
      cache:   'no-store',
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: { message: 'Service unavailable' } }, { status: 503 });
  }
}
