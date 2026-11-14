import { NextRequest, NextResponse } from 'next/server';
import { cookieDomainFor } from '@/lib/cookie-domain';
import { REFRESH_COOKIE, refreshAtGateway, writeRotated, dropRefresh } from '@/lib/session-refresh';

// Refreshes the session on request. CSRF enforced in middleware.
//
// It used to send the ACCESS token where auth-service expects the REFRESH token, so it
// never succeeded (TEC-AUDIT-0029). It now spends the HttpOnly refresh cookie through the
// same single-flight helper the middleware uses — one rule, one place (C-123 §4) — and
// renews the access token with tec_user + tec_csrf on THIS response.
export async function POST(req: NextRequest) {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const gateway = process.env.API_GATEWAY_URL;
  if (!refresh || !gateway) return NextResponse.json({ error: 'No refresh token' }, { status: 401 });

  const out = await refreshAtGateway(refresh, gateway);
  if (out === 'rejected') {
    const res = NextResponse.json({ error: 'Refresh token rejected' }, { status: 401 });
    dropRefresh(res.cookies);
    return res;
  }
  if (out === 'unavailable') return NextResponse.json({ error: 'Refresh unavailable' }, { status: 503 });

  const res = NextResponse.json({ token: out.token }, { status: 200 });
  const domain = cookieDomainFor(
    req.nextUrl.hostname,
    process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_SSO_DOMAIN ?? undefined,
  );
  writeRotated(res.cookies, out, domain, (name) => req.cookies.get(name)?.value);
  return res;
}
