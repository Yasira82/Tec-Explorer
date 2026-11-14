import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/observability/logger';
import { arrivedSessionCookies } from '@/lib/auth/session-cookies';

// A refused request says WHICH session cookies it carried (names only) — see
// session-cookies.ts. It is how C-123 §11 was found: `cookies: none` on a page
// that "only a session could open" meant the guard was not running.
function refuse(req: NextRequest, reason: string) {
  const cookies = arrivedSessionCookies(req);
  log.warn('auth.me_refused', {
    reason,
    cookies,
    cookieCount:   req.cookies.getAll().length,
    fetchSite:     req.headers.get('sec-fetch-site'),
    fetchMode:     req.headers.get('sec-fetch-mode'),
    storageAccess: req.headers.get('sec-fetch-storage-access'),
  });
  return NextResponse.json({ authenticated: false, user: null, reason, cookies }, { status: 401 });
}

// Server-side session resolver (C-123 §3). Fail closed: no session → 401 (P6).
export async function GET(req: NextRequest) {
  const token   = req.cookies.get('tec_access_token')?.value;
  const userRaw = req.cookies.get('tec_user')?.value;

  // `reason` names WHICH half of the session is missing — and nothing else: no
  // value, no length, no hint of the token. The name appears on one visit and
  // not the next, and the only way to tell a lapsed `tec_user` from a missing
  // token from a cookie Pi Browser did not send in this context is to ask the
  // browser that failed. Open this URL on the phone the moment it happens.
  if (!token || token.trim() === '') {
    return refuse(req, 'no_token');
  }
  if (!userRaw) {
    return refuse(req, 'no_user');
  }

  try {
    let user: unknown;
    try {
      user = JSON.parse(userRaw);
    } catch {
      user = JSON.parse(decodeURIComponent(userRaw));
    }
    return NextResponse.json({ authenticated: true, user });
  } catch {
    return refuse(req, 'bad_user');
  }
}
