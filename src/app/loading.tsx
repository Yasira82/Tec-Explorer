'use client';

// The wait between a tap and the screen (E1): a quiet pulse, announced to screen
// readers, never a frozen blank page.

import { useFleetStrings } from '@/components/fleet/strings';

export default function Loading() {
  const { s, dir, lang } = useFleetStrings();
  return (
    <main dir={dir} lang={lang} role="status" aria-live="polite" aria-busy="true" aria-label={s.states.loadingLabel}
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--tec-bg)' }}>
      <div aria-hidden="true" style={{
        width: 40, height: 40, borderRadius: 999, border: '3px solid var(--tec-border)',
        borderTopColor: 'var(--tec-gold)', animation: 'tec-spin 0.9s linear infinite',
      }} />
      <style>{'@keyframes tec-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){[aria-busy] div{animation:none}}'}</style>
    </main>
  );
}
