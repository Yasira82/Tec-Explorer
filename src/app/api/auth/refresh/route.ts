import { NextRequest, NextResponse } from 'next/server';

// Refreshes the access token via the gateway. CSRF enforced in middleware.
const GW = process.env.API_GATEWAY_URL;

export async function POST(req: NextRequest) {
  try {
    const token   = req.cookies.get('tec_access_token')?.value;
    const refresh = req.cookies.get('tec_refresh_token')?.value;

    const res = await fetch(`${GW}/api/auth/refresh`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token   ? { Authorization: `Bearer ${token}` }      : {}),
        ...(refresh ? { Cookie: `tec_refresh_token=${refresh}` } : {}),
      },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    const newToken = data?.token ?? data?.data?.token ?? data?.accessToken;
    const response = NextResponse.json(data, { status: 200 });

    if (newToken) {
      const cookieDomain = process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_SSO_DOMAIN ?? undefined;
      response.cookies.set('tec_access_token', newToken, {
        httpOnly: false, secure: true, sameSite: 'none', partitioned: true,
        path: '/', domain: cookieDomain, maxAge: 60 * 60 * 24,
      });
    }
    return response;
  } catch {
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
