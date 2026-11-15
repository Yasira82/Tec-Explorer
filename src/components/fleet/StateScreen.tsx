'use client';

// One look for the screens every app has (App Excellence Standard E1): an error with
// a way out, a page that does not exist, and a wait. Design tokens only (E4), in the
// app's language (components/fleet/strings). The template's own StateScreen reads its
// twelve-language dictionary; this one is for the apps that do not have it yet.

import { type ReactNode } from 'react';

export function StateScreen({ icon, title, body, children, dir, lang }: {
  icon: string; title: string; body?: string; children?: ReactNode; dir: 'ltr' | 'rtl'; lang: string;
}) {
  return (
    <main dir={dir} lang={lang} style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 22,
      background: 'var(--tec-bg)', color: 'var(--tec-text-1)', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <section style={{
        width: '100%', maxWidth: 420, textAlign: 'center', padding: '28px 22px', borderRadius: 16,
        background: 'var(--tec-surface-1)', border: '1px solid var(--tec-border)',
      }}>
        <div aria-hidden="true" style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>{title}</h1>
        {body && <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--tec-text-3)', margin: '0 0 18px' }}>{body}</p>}
        {children}
      </section>
    </main>
  );
}

export const primaryButton = {
  width: '100%', minHeight: 44, padding: '12px 18px', fontSize: 15, fontWeight: 700, borderRadius: 12,
  border: 'none', cursor: 'pointer', color: 'var(--tec-bg)', background: 'var(--tec-gold)',
} as const;

export const secondaryLink = {
  display: 'inline-block', marginTop: 12, minHeight: 40, lineHeight: '40px', fontSize: 14,
  color: 'var(--tec-text-3)', textDecoration: 'underline',
} as const;
