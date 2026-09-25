import { NextRequest, NextResponse } from 'next/server';
import { randomUUID }                from 'crypto';
import { SignJWT }                   from 'jose';

// The app signs ITSELF in with Pi — C-123 §3, the same flow as the Hub's own login.
//
// Why an app needs this at all
// ----------------------------
// An app reached from the Hub's grid arrives through Hub SSO and lands with a
// session. An app reached any other way — the Founding Quest and the reward
// campaign open it as a STANDALONE visit on purpose, so the app loads the Pi SDK
// and Pi counts the visit — arrives with whatever cookies this browser context
// happens to hold. Seen on a phone (2026-09-25): opened from the Quest, `/app`
// rendered, and `/api/auth/me` answered `no_token` — "Not signed in" on an app
// the pioneer had just been sent to. The Pi handshake had already run (the
// warm-up); nothing turned it into a TEC session.
//
// What this does
// --------------
// Exchanges Pi's access token for a TEC session at tec-auth-service (the only
// identity authority, ADR-002), and hands back a one-time token for this app's
// OWN /api/auth/sso-callback. It sets NO cookies itself: a cookie on an XHR
// response is exactly what C-123 LAW 1 says gets dropped. The client navigates to
// the callback, whose 200 landing sets them (LAW 2) and confirms the session is
// visible before entering the app (§3 verified entry).
//
// The audience is this request's own origin. The callback accepts it only if it
// is in its ALLOWED_AUDIENCES, so an origin it does not serve gets nothing.
const GATEWAY = process.env.API_GATEWAY_URL ?? '';

export async function POST(req: NextRequest) {
  if (!GATEWAY) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const secret = process.env.SSO_SECRET;
  if (!secret) return NextResponse.json({ error: 'sso_not_configured' }, { status: 503 });

  const body        = await req.json().catch(() => ({})) as { accessToken?: unknown };
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  if (!accessToken) return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 });

  let backend: Response;
  try {
    backend = await fetch(`${GATEWAY}/api/v1/auth/pi-login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // No `scopes`: auth records them only when sent, and this app asks Pi for
      // fewer than the Hub does. Sending ours would overwrite the Hub's record and
      // tell a paid-campaign pioneer to sign in again for nothing.
      body:    JSON.stringify({ accessToken }),
      signal:  AbortSignal.timeout(25_000),
    });
  } catch {
    return NextResponse.json({ error: 'Auth service unavailable' }, { status: 504 });
  }

  const data = await backend.json().catch(() => ({})) as {
    tokens?: { accessToken?: string; refreshToken?: string };
    user?:   { id?: string } & Record<string, unknown>;
  };
  // Fail closed (P6): anything short of a token AND a user is not a session.
  if (!backend.ok) return NextResponse.json({ error: 'Sign-in refused' }, { status: backend.status });
  if (!data.tokens?.accessToken || !data.user) {
    return NextResponse.json({ error: 'Invalid auth response' }, { status: 502 });
  }

  const ssoToken = await new SignJWT({
    accessToken:  data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    user:         data.user,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(data.user.id ?? ''))
    .setIssuer('tec.pi')
    .setAudience(req.nextUrl.origin)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ ssoToken }, { headers: { 'Cache-Control': 'no-store' } });
}
