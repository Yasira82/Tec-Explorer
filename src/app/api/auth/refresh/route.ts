import { NextRequest, NextResponse } from 'next/server';
import { cookieDomainFor } from '@/lib/cookie-domain';

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
      const cookieDomain = cookieDomainFor(
        req.nextUrl.hostname,
        process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_SSO_DOMAIN ?? undefined,
      );
      // A session is BOTH cookies, so a refresh renews both.
      //
      // This used to renew the token alone. `tec_user` kept the lifetime the
      // sign-in gave it, so a day later the name cookie expired while the token
      // was still being renewed — a half session: the page opened, and every
      // screen said "Not signed in" with no way to sign in again. The values are
      // re-issued exactly as they are, never invented: a cookie that has already
      // lapsed stays lapsed, and the page guard sends that visitor back through
      // SSO (P6).
      const sessionCookieOpts = {
        httpOnly: false, secure: true, sameSite: 'none', partitioned: true,
        path: '/', domain: cookieDomain, maxAge: 60 * 60 * 24,
      } as const;
      response.cookies.set('tec_access_token', newToken, sessionCookieOpts);
      for (const name of ['tec_user', 'tec_csrf'] as const) {
        const raw   = req.cookies.get(name)?.value;
        const value = name === 'tec_user' ? onceEncoded(raw) : raw;
        if (value) response.cookies.set(name, value, sessionCookieOpts);
      }
    }
    return response;
  } catch {
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}

// `tec_user` as the browser must hold it: JSON, which `cookies.set` encodes once.
// A copy written by the SSO landing before 2026-10-10 was encoded twice and reads
// here as `%7B…`; re-issuing it unchanged renewed, for another day, a cookie that
// getStoredUser() cannot read — a signed-in member shown the sign-in again.
function onceEncoded(value: string | undefined): string | undefined {
  if (!value || value.startsWith('{')) return value;
  try {
    const decoded = decodeURIComponent(value);
    JSON.parse(decoded);
    return decoded;
  } catch {
    return value;
  }
}
