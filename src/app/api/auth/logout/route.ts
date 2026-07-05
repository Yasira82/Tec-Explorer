import { NextResponse } from 'next/server';

// C-123 §2 rule 2: deletion attributes MUST match creation (none + secure +
// Partitioned + same domain) or the clear targets a different cookie jar and
// silently fails — which breaks re-login. This route was previously missing.
export async function POST() {
  const res = NextResponse.json({ success: true });

  const cookieDomain =
    process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_SSO_DOMAIN ?? undefined;
  const gone = {
    maxAge:      0,
    path:        '/',
    secure:      true,
    sameSite:    'none' as const,
    partitioned: true,
    domain:      cookieDomain,
  };

  res.cookies.set('tec_access_token', '', gone);
  res.cookies.set('tec_user',         '', gone);
  res.cookies.set('tec_csrf',         '', gone);

  return res;
}
