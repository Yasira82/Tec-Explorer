import { NextRequest, NextResponse } from 'next/server';

// ── Per-app config — adjust for the new app ──────────────────────────
const PROTECTED_ROUTES  = ['/app', '/dashboard', '/profile', '/settings'];
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_PROTECTED    = [
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/bff/',          // all BFF routes (payment, orders, …)
  '/api/payment',
];

// Double-submit CSRF token cookie. Not a secret — same-origin policy stops
// cross-origin attackers from reading it. httpOnly:false so client JS can
// echo it back in the x-csrf-token header.
const CSRF_COOKIE_OPTS = {
  httpOnly: false,
  secure:   true,
  sameSite: 'none' as const,
  partitioned: true,
  path:     '/',
  maxAge:   60 * 60 * 24,
};

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  return diff === 0;
}

// CSRF is enforced in EXACTLY ONE place — here. A state-changing request is
// trusted if EITHER the double-submit token matches OR it is first-party
// (same-origin / a *.tecosystem.app origin).
//
// ⚠️ DO NOT re-validate CSRF inside a route handler. Pure double-submit is
// unreliable across SSO domains and inside Pi Browser (sameSite=None cookies
// get dropped) → legit payment/order POSTs 403. Verifying the Origin is an
// OWASP-recommended, cookie-independent CSRF defence; a cross-site attacker
// cannot forge the browser-set Origin header. (See KB C-12 §11. A CI guard
// blocks route-level CSRF checks.)
function isTrustedCsrf(req: NextRequest): boolean {
  const cookie = req.cookies.get('tec_csrf')?.value ?? '';
  const header = req.headers.get('x-csrf-token') ?? '';
  if (cookie && header && timingSafeStringEqual(cookie, header)) return true;

  const host   = req.headers.get('host') ?? '';
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const oh = new URL(origin).host;
      if (oh === host || oh.endsWith('.tecosystem.app')) return true;
    } catch { /* malformed Origin → not trusted */ }
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method       = req.method.toUpperCase();

  // ── Page auth guard ──────────────────────────────────────
  if (PROTECTED_ROUTES.some(r => pathname.startsWith(r))) {
    const token = req.cookies.get('tec_access_token')?.value;
    if (!token || token.trim() === '') {
      const loginUrl = new URL('/', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Unsafe method → CSRF (double-submit OR first-party origin) ────────
  if (!CSRF_SAFE_METHODS.has(method)) {
    const isCsrfProtected = CSRF_PROTECTED.some(r => pathname.startsWith(r));
    if (isCsrfProtected && !isTrustedCsrf(req)) {
      return NextResponse.json(
        { error: 'Invalid CSRF token', code: 'CSRF_INVALID' },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  // ── Safe method → ensure a tec_csrf cookie exists ────────
  const res = NextResponse.next();
  if (!req.cookies.get('tec_csrf')?.value) {
    res.cookies.set('tec_csrf', crypto.randomUUID(), CSRF_COOKIE_OPTS);
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
