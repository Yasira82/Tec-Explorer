import { NextRequest, NextResponse } from 'next/server';
import { cookieDomainFor } from '@/lib/cookie-domain';

// C-123 §2 rule 2: deletion attributes MUST match creation (none + secure +
// Partitioned + same domain) or the clear targets a different cookie jar and
// silently fails — which breaks re-login. This route was previously missing.
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true });

  // The domain the cookies were SET with: host-only on the Testnet host, where a
  // `.tecosystem.app` Domain is rejected (cookie-domain.ts) — and so is a clear for it.
  const cookieDomain = cookieDomainFor(
    req.nextUrl.hostname,
    process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_SSO_DOMAIN ?? undefined,
  );
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
