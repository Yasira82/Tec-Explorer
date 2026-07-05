import { NextRequest, NextResponse } from 'next/server';

// Resolves an incomplete Pi payment (Pi SDK onIncompletePaymentFound).
// CSRF enforced ONCE in middleware. Auto-refreshes an expired access token so
// a stuck "Pending Payment Found" can always clear.
const GW = process.env.API_GATEWAY_URL ?? '';

const tryRefresh = async (refreshToken: string): Promise<string | null> => {
  try {
    const res = await fetch(`${GW}/api/auth/refresh`, {
      method:  'POST',
      headers: { Cookie: `tec_refresh_token=${refreshToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.token ?? data?.token ?? null;
  } catch { return null; }
};

const resolve = (token: string, pi_payment_id: string) =>
  fetch(`${GW}/api/payment/resolve-incomplete?pi_payment_id=${encodeURIComponent(pi_payment_id)}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
    },
    body: JSON.stringify({ pi_payment_id }),
  });

export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  let token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body          = await req.json().catch(() => ({}));
  const pi_payment_id = body?.pi_payment_id as string | undefined;
  if (!pi_payment_id) return NextResponse.json({ error: 'pi_payment_id required' }, { status: 400 });

  let res = await resolve(token, pi_payment_id);

  if (res.status === 401) {
    const refreshToken = req.cookies.get('tec_refresh_token')?.value;
    if (refreshToken) {
      const newToken = await tryRefresh(refreshToken);
      if (newToken) { token = newToken; res = await resolve(token, pi_payment_id); }
    }
  }

  const data     = await res.json().catch(() => ({}));
  const response = NextResponse.json(data, { status: res.status });

  if (token !== req.cookies.get('tec_access_token')?.value) {
    response.cookies.set('tec_access_token', token, {
      httpOnly: false, secure: true, sameSite: 'none', path: '/', maxAge: 60 * 60 * 24,
    });
  }
  return response;
}
