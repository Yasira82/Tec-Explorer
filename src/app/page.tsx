'use client';

import { useEffect }               from 'react';
import { useRouter }               from 'next/navigation';
import { usePiAuth, ssoRedirect }  from '@yasser172/tec-auth';
import { TEC_COLORS }              from '@yasser172/tec-ui';

// ── تعديل حسب الـ domain ──────────────────────────────────
const HUB_URL    = process.env.NEXT_PUBLIC_HUB_URL    ?? 'https://hub.tecosystem.app';
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL    ?? 'https://app.tecosystem.app';
const APP_NAME   = process.env.NEXT_PUBLIC_APP_NAME   ?? 'TEC App';
const APP_EMOJI  = process.env.NEXT_PUBLIC_APP_EMOJI  ?? '🔷';

export default function HomePage() {
  const { isAuthenticated, isLoading } = usePiAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/app');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogin = () => {
    ssoRedirect(HUB_URL, `${APP_URL}/app`);
  };

  return (
    <div style={{
      minHeight:      '100vh',
      background:     '#020205',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{APP_EMOJI}</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: TEC_COLORS.gold, marginBottom: 8 }}>
          {APP_NAME}
        </div>
        <div style={{ fontSize: 13, color: TEC_COLORS.subtext, marginBottom: 32 }}>
          TEC ECOSYSTEM
        </div>
        <button
          onClick={handleLogin}
          disabled={isLoading}
          style={{
            padding:      '14px 32px',
            background:   `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})`,
            border:       'none',
            borderRadius: 16,
            color:        '#0a0800',
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
