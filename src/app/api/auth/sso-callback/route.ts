import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify }                 from 'jose';
import { cookieDomainFor }           from '@/lib/cookie-domain';
import { HUB_HOSTS }                 from '@/lib/pi-network';

// Hub SSO landing — C-123 compliant (Pi Browser Session & Cookie Spec):
//   LAW 2: Set-Cookie on 3xx responses is dropped by Pi Browser → cookies are
//          established on a plain 200 HTML landing page, never on a redirect.
//   LAW 3: embedded contexts require Secure; SameSite=None; Partitioned.
//   §3:    VERIFIED ENTRY — the landing script confirms the session is
//          server-visible (/api/auth/me) BEFORE navigating into the app.
const ALLOWED_AUDIENCES = [
  'https://tec-explorer.vercel.app',
  'https://explorer.tecosystem.app',
  'https://explorer-test.tecosystem.app',
];
const DEFAULT_REDIRECT = '/app';

// One-time-use tokens (replay guard — parity with the Hub callback).
const usedJtis = new Map<string, number>();
const isJtiUsed = (jti: string): boolean => {
  const now = Date.now();
  for (const [key, exp] of usedJtis) {
    if (now > exp) usedJtis.delete(key);
  }
  return usedJtis.has(jti);
};
const markJtiUsed = (jti: string): void => {
  usedJtis.set(jti, Date.now() + 5 * 60 * 1000);
};

export async function GET(req: NextRequest) {
  const token       = req.nextUrl.searchParams.get('token');
  const rawRedirect = req.nextUrl.searchParams.get('redirect') ?? DEFAULT_REDIRECT;
  // Block open redirect: only same-origin absolute paths (no //host, no scheme).
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect : DEFAULT_REDIRECT;

  if (!token) return NextResponse.redirect(new URL(DEFAULT_REDIRECT, req.url));

  const secret = process.env.SSO_SECRET;
  if (!secret) return NextResponse.json({ error: 'sso_not_configured' }, { status: 503 });

  const encoded = new TextEncoder().encode(secret);
  let payload: Record<string, unknown> | null = null;

  for (const audience of ALLOWED_AUDIENCES) {
    try {
      const result = await jwtVerify(decodeURIComponent(token), encoded, {
        algorithms: ['HS256'], issuer: 'tec.pi', audience,
      });
      payload = result.payload as Record<string, unknown>;
      break;
    } catch { /* try next audience */ }
  }

  if (!payload) return NextResponse.redirect(new URL('/', req.url));

  const jti = payload.jti as string | undefined;
  if (jti) {
    if (isJtiUsed(jti)) return NextResponse.json({ error: 'replay_detected' }, { status: 401 });
    markJtiUsed(jti);
  }

  const accessToken = payload.accessToken as string;
  const user        = payload.user as Record<string, unknown>;
  if (!accessToken || !user) return NextResponse.redirect(new URL('/', req.url));

  const csrf = crypto.randomUUID();

  // Host-only wherever the configured domain does not cover this host — see
  // cookie-domain.ts. A Domain the host is not under is rejected silently.
  const cookieDomain = cookieDomainFor(
    req.nextUrl.hostname,
    process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_SSO_DOMAIN ?? undefined,
  );
  const cookieOpts = {
    httpOnly:    false,
    secure:      true,
    sameSite:    'none' as const,
    partitioned: true,
    path:        '/',
    domain:      cookieDomain,
    maxAge:      60 * 60 * 24,
  };

  const userValue = encodeURIComponent(JSON.stringify(user));

  // Values for the document.cookie fallback (non-httpOnly cookies only; this
  // page is one-time via the jti guard). The script encodes values itself.
  const jsCookies = [
    { name: 'tec_access_token', value: accessToken,          maxAge: 60 * 60 * 24 },
    { name: 'tec_user',         value: JSON.stringify(user), maxAge: 60 * 60 * 24 },
    { name: 'tec_csrf',         value: csrf,                 maxAge: 60 * 60 * 24 },
  ];
  const esc = (s: string) => s.replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>TEC App — Signing in…</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<noscript><meta http-equiv="refresh" content="0;url=${redirect.replace(/"/g, '')}"></noscript>
</head>
<body style="margin:0;background:#050816;color:#FBB44A;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
<div style="text-align:center"><div style="font-size:28px;font-weight:900">🧭 TEC EXPLORER</div>
<div style="font-size:13px;color:#6b6b7a;margin-top:8px">Signing you in…</div></div>
<script>
(function () {
  var redirect = ${esc(JSON.stringify(redirect))};
  var cookies  = ${esc(JSON.stringify(jsCookies))};
  // ADR-007/C-12 §3: this landing replaces the old 3xx chain (C-123 LAW 2),
  // so location.replace() below erases the hub referrer. Persist the
  // hub-entry signal per-tab — isHubNavigation() consults it (pi-payment.ts).
  //
  // BOTH Hub hosts (HUB_HOSTS, lib/pi-network.ts). This named only the Mainnet
  // Hub, so an SSO hop from the TESTNET Hub set no flag and the app then
  // treated a Hub-owned Pi session as its own — Pi.authenticate never answers
  // and the buy ends in a 90s timeout with the wallet never opening.
  var hubHosts = ${esc(JSON.stringify(HUB_HOSTS))};
  try {
    if (document.referrer &&
        hubHosts.indexOf(new URL(document.referrer).hostname.toLowerCase()) !== -1) {
      sessionStorage.setItem('__tec_hub_entry', '1');
    }
  } catch (e) {}
  function setDocCookies() {
    for (var i = 0; i < cookies.length; i++) {
      var c = cookies[i];
      // NOTE: no backticks anywhere in this script — it lives inside a template
      // literal, and one would end the string mid-file.
      //
      // "partitioned" is deliberately NOT set here, and that is a REVERSAL.
      // C-123 LAW 3 wants it and the server response above DOES set it, so
      // adding it here looked like making the fallback consistent. What it
      // actually removed was the UNPARTITIONED duplicate this fallback had
      // always written beside the server's partitioned one. In any context
      // where the partitioned copy is not sent — and Pi Browser is a custom
      // WebView — that duplicate was the only cookie left.
      //
      // Not a theory: Mainnet Assets went intermittent the moment it shipped
      // (uploads and mints hanging, ~2 successes in 12) and went steady again
      // the moment it was reverted. The Testnet host is carried by the SERVER
      // cookie (host-only + partitioned), not by this fallback, so nothing
      // depends on the attribute being here.
      //
      // Host-only by omission of "domain" — deliberately: this runs in the
      // browser, on whichever host served the page.
      document.cookie = c.name + '=' + encodeURIComponent(c.value) +
        '; path=/; max-age=' + c.maxAge + '; secure; samesite=none';
    }
  }
  function sessionVisible(cb) {
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { cb(r.ok); })
      .catch(function () { cb(false); });
  }
  sessionVisible(function (ok) {
    if (ok) { location.replace(redirect); return; }
    setTimeout(function () {
      sessionVisible(function (okDelayed) {
        if (okDelayed) { location.replace(redirect); return; }
        setDocCookies();
        // Proceed regardless (C-123 §7): the app renders without cookies and
        // page guards degrade gracefully; bouncing to login was the visible
        // "app won't open".
        sessionVisible(function () { location.replace(redirect); });
      });
    }, 350);
  });
})();
</script></body></html>`;

  const res = new NextResponse(html, {
    status:  200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

  res.cookies.set('tec_access_token', accessToken, cookieOpts);
  res.cookies.set('tec_user',         userValue,   cookieOpts);
  res.cookies.set('tec_csrf',         csrf,        cookieOpts);

  return res;
}
