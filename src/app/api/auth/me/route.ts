import { NextRequest, NextResponse } from 'next/server';

// Server-side session resolver (C-123 §3). Fail closed: no session → 401 (P6).
export async function GET(req: NextRequest) {
  const token   = req.cookies.get('tec_access_token')?.value;
  const userRaw = req.cookies.get('tec_user')?.value;

  if (!token || token.trim() === '' || !userRaw) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
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
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }
}
