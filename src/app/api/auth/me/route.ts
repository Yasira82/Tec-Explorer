import { NextRequest, NextResponse } from 'next/server';

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
    return NextResponse.json({ authenticated: false, user: null, reason: 'no_token' }, { status: 401 });
  }
  if (!userRaw) {
    return NextResponse.json({ authenticated: false, user: null, reason: 'no_user' }, { status: 401 });
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
    return NextResponse.json({ authenticated: false, user: null, reason: 'bad_user' }, { status: 401 });
  }
}
