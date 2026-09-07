'use client';

import { useEffect }               from 'react';
import { useRouter }               from 'next/navigation';
import { usePiAuth, ssoRedirect }  from '@yasser172/tec-auth';
import { C } from '@/lib-client/palette';

// ── تعديل حسب الـ domain ──────────────────────────────────
const HUB_URL    = process.env.NEXT_PUBLIC_HUB_URL    ?? 'https://hub.tecosystem.app';
// The SSO return address must be the host the visitor is ACTUALLY on.
// One build serves the Mainnet app and its paired Testnet app on two
// hosts; a build-time constant returns a Testnet visitor to the Mainnet
// origin, where the session then lives and the Testnet host stays
// "Unauthorized" with nothing logged. The Hub validates the target
// against its own ALLOWED_TARGETS, so nothing is weakened.
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL    ?? 'https://explorer.tecosystem.app';
const APP_NAME   = process.env.NEXT_PUBLIC_APP_NAME   ?? 'TEC Explorer';
const APP_EMOJI  = process.env.NEXT_PUBLIC_APP_EMOJI  ?? '🧭';

export default function HomePage() {
  const { isAuthenticated, isLoading } = usePiAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/app');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogin = () => {
    ssoRedirect(HUB_URL, `${typeof window === 'undefined' ? APP_URL : window.location.origin}/app`);
  };

  return (
    <div style={{
      minHeight:      '100vh',
      background:     C.bg,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{APP_EMOJI}</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: C.gold, marginBottom: 8 }}>
          {APP_NAME}
        </div>
        <div style={{ fontSize: 13, color: C.subtext, marginBottom: 6 }}>
          TEC ECOSYSTEM · DISCOVERY
        </div>
        <div style={{ fontSize: 13, color: C.subtext, marginBottom: 32, maxWidth: 300, lineHeight: 1.5 }}>
          Discover Pi-accepting businesses, services, and opportunities near you.
        </div>
        <button
          onClick={handleLogin}
          disabled={isLoading}
          style={{
            padding:      '14px 32px',
            background:   C.gold,
            border:       'none',
            borderRadius: 16,
            color:        C.onGold,
            fontSize:     15,
            fontWeight:   700,
            cursor:       isLoading ? 'not-allowed' : 'pointer',
            opacity:      isLoading ? 0.6 : 1,
          }}>
          {isLoading ? '...' : 'Login with Pi'}
        </button>
      </div>
    </div>
  );
}
