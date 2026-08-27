'use client';

// A proper app Settings page for Explorer (modeled on tec-assets' settings):
// sectioned, with a Profile card, an EN/AR language toggle that drives i18n + RTL,
// an About block, and logout. Fully translated.
import { useEffect, useState } from 'react';
import { usePiAuth } from '@yasser172/tec-auth';
import { TEC_COLORS } from '@yasser172/tec-ui';
import { useTranslation } from '@/lib/i18n';
import { useMe } from '@/lib-client/hooks/useMe';

const cardStyle = {
  background: TEC_COLORS.surface, border: `1px solid ${TEC_COLORS.border}`, borderRadius: 16,
} as const;

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 4px 8px', color: TEC_COLORS.subtext }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ ...cardStyle, overflow: 'hidden' }}>{children}</div>
    </section>
  );
}

function Row({ label, desc, children, first }: { label: string; desc?: string; children?: React.ReactNode; first?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '14px 16px', borderTop: first ? 'none' : `1px solid ${TEC_COLORS.border}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEC_COLORS.text }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 2 }}>{desc}</div>}
      </div>
      {children != null && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

function Pills<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{
              padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `1px solid ${active ? TEC_COLORS.gold : TEC_COLORS.border}`,
              background: active ? 'rgba(251,180,74,0.12)' : 'transparent',
              color: active ? TEC_COLORS.gold : TEC_COLORS.subtext,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsView() {
  const { t, locale, setLocale } = useTranslation();
  const { user, isAuthenticated, logout } = usePiAuth();
  const me = useMe();
  const s = t.explorer.settings;
  // Prefer the server-resolved Pi username (/api/auth/me) — Pi Browser hides the
  // tec_user cookie from client JS, so usePiAuth alone shows no name.
  const username = me.username ?? user?.piUsername ?? null;

  const [isPro, setIsPro] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/bff/subscription', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const outer = (d?.data ?? d) as Record<string, unknown>;
        const sub = ((outer?.subscription ?? outer) ?? {}) as Record<string, unknown>;
        const plan = String(sub.plan ?? '').toUpperCase();
        const active = sub.isActive === true || sub.status === 'ACTIVE';
        if (active && plan && plan !== 'FREE') setIsPro(true);
      })
      .catch(() => { /* fail closed to Free */ });
    return () => { alive = false; };
  }, []);

  const signedIn = me.authenticated || isAuthenticated || isPro || !!username;

  return (
    <div>
      <Section title={s.profile} icon="👤">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#0a0800',
          }}>{(username ?? 'Y').charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEC_COLORS.text }}>
              {username ? `@${username}` : signedIn ? s.member : s.notSignedIn}
            </div>
            <div style={{ fontSize: 13, color: TEC_COLORS.subtext, marginTop: 2 }}>{isPro ? s.planPro : s.planFree}</div>
            {signedIn && (
              <span style={{
                display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700,
                color: TEC_COLORS.success, background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999, padding: '3px 10px',
              }}>● {s.connectedPi}</span>
            )}
          </div>
        </div>
      </Section>

      <Section title={s.appearance} icon="🎨">
        <Row label={s.language} desc={s.languageDesc} first>
          <Pills
            value={locale}
            options={[{ value: 'en', label: '🇺🇸 EN' }, { value: 'ar', label: '🇸🇦 AR' }]}
            onChange={(v) => setLocale(v)}
          />
        </Row>
      </Section>

      <Section title={s.about} icon="ℹ️">
        <Row label={s.version} first><span style={{ color: TEC_COLORS.subtext, fontSize: 14 }}>1.0.0</span></Row>
        <Row label={s.domain}><span style={{ color: TEC_COLORS.subtext, fontSize: 14 }}>explorer.pi</span></Row>
        <Row label={s.ecosystem}><span style={{ color: TEC_COLORS.gold, fontSize: 14, fontWeight: 700 }}>TEC · 24</span></Row>
        <Row label={s.builtOn}><span style={{ color: TEC_COLORS.subtext, fontSize: 14 }}>{s.builtOnPi}</span></Row>
      </Section>

      {signedIn && (
        <button
          onClick={() => { void logout(); }}
          style={{
            width: '100%', marginTop: 16, padding: '14px', cursor: 'pointer',
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.28)',
            borderRadius: 14, color: '#ef4444', fontSize: 15, fontWeight: 800,
          }}>
          {s.logout}
        </button>
      )}
    </div>
  );
}
