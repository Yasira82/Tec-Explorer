'use client';

// App-shell bottom navigation — vector icons (not emoji), glass backdrop, active
// scale + underline, light haptic. Same quality bar as tec-assets.
import { Icon, type ExpIconName } from './Icon';
import { useTranslation } from '@/lib/i18n';

export type ExpTab = 'discover' | 'listing' | 'pro' | 'settings';

export function BottomNav({ active, onSelect }: { active: ExpTab; onSelect: (t: ExpTab) => void }) {
  const { t } = useTranslation();
  const ITEMS: { key: ExpTab; icon: ExpIconName; label: string }[] = [
    { key: 'discover', icon: 'search',   label: t.explorer.nav.discover },
    { key: 'listing',  icon: 'store',    label: t.explorer.nav.listing  },
    { key: 'pro',      icon: 'star',     label: t.explorer.nav.pro      },
    { key: 'settings', icon: 'settings', label: t.explorer.nav.settings },
  ];
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      background: 'rgba(5,8,22,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {ITEMS.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => { navigator.vibrate?.(8); onSelect(item.key); }}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              position: 'relative', flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 5, padding: '10px 0 12px',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            <div style={{ transform: isActive ? 'scale(1.08)' : 'scale(1)', transition: 'transform 0.2s' }}>
              <Icon name={item.icon} size={21} color={isActive ? '#FBB44A' : '#3a3a4a'} strokeWidth={isActive ? 2.2 : 1.9} />
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: isActive ? '#FBB44A' : '#3a3a4a', transition: 'color 0.2s' }}>
              {item.label}
            </div>
            {isActive && (
              <div style={{ position: 'absolute', bottom: 0, width: 20, height: 2, borderRadius: 1, background: '#FBB44A' }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
