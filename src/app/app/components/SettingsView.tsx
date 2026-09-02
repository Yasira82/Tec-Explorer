'use client';

// A proper app Settings page for Explorer (modeled on tec-assets' settings):
// sectioned, with a Profile card, a 12-language selector that drives i18n + RTL,
// an About block, and logout. Fully translated.
import { useEffect, useState } from 'react';
import { usePiAuth } from '@yasser172/tec-auth';
import { useTranslation, LOCALES, type Locale } from '@/lib/i18n';
import { THEME_ORDER, readTheme, saveTheme, type ThemeChoice } from '@/lib-client/theme';
import { useMe } from '@/lib-client/hooks/useMe';
import { C, goldA } from '@/lib-client/palette';

const cardStyle = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
} as const;

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 4px 8px', color: C.subtext }}>
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
      padding: '14px 16px', borderTop: first ? 'none' : `1px solid ${C.border}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: C.subtext, marginTop: 2 }}>{desc}</div>}
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
              border: `1px solid ${active ? C.gold : C.border}`,
              background: active ? goldA(0.12) : 'transparent',
              color: active ? C.gold : C.subtext,
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
  /**
   * The theme, read on the client only.
   *
   * Starts at 'system' during SSR and the first client render, then syncs in the
   * effect below: reading localStorage during render would make the server and
   * the client disagree and hydration would fail. The PAGE is already correct by
   * then — the boot script stamped the attribute before first paint — so this
   * state exists only to show which pill is selected, and a one-tick delay in a
   * settings row is invisible.
   */
  const [theme, setTheme] = useState<ThemeChoice>('system');
  useEffect(() => { setTheme(readTheme()); }, []);
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
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: C.onGold,
          }}>{(username ?? 'Y').charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>
              {username ? `@${username}` : signedIn ? s.member : s.notSignedIn}
            </div>
            <div style={{ fontSize: 13, color: C.subtext, marginTop: 2 }}>{isPro ? s.planPro : s.planFree}</div>
            {signedIn && (
              <span style={{
                display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700,
                color: C.success, background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999, padding: '3px 10px',
              }}>● {s.connectedPi}</span>
            )}
          </div>
        </div>
      </Section>

      <Section title={s.appearance} icon="🎨">
        <Row label={s.theme} desc={s.themeDesc} first>
          {/* Three options, not a switch. "System" is a real choice and the
              default: it means the app keeps following the phone, rather than
              freezing whatever the phone happened to be on at first launch.
              A two-state toggle cannot express that, and every reader who has
              their phone on automatic would silently lose it. */}
          <Pills
            value={theme}
            onChange={(v) => { setTheme(v); saveTheme(v); }}
            options={THEME_ORDER.map((v) => ({
              value: v,
              label: v === 'system' ? s.themeSystem : v === 'light' ? s.themeLight : s.themeDark,
            }))}
          />
        </Row>
        <Row label={s.language} desc={s.languageDesc}>
          {/* A select, not pills: twelve options do not fit in a row, and a
              horizontally-scrolling strip hides the languages that happen to
              sit off-screen — including, for some readers, their own.

              Each is written in ITS OWN SCRIPT. Someone who cannot read the
              current interface language cannot read "Vietnamese" either, but
              they can always read "Tiếng Việt". That is the whole reason a
              language menu lists native names. */}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={s.language}
            style={{
              background: C.bg, color: C.text, fontSize: 14,
              border: `1px solid ${goldA(0.2)}`, borderRadius: 8,
              padding: '8px 10px', outline: 'none', maxWidth: 200,
            }}
          >
            {(Object.keys(LOCALES) as Locale[]).map((code) => (
              <option key={code} value={code}>{LOCALES[code].native}</option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title={s.about} icon="ℹ️">
        <Row label={s.version} first><span style={{ color: C.subtext, fontSize: 14 }}>1.0.0</span></Row>
        <Row label={s.domain}><span style={{ color: C.subtext, fontSize: 14 }}>explorer.pi</span></Row>
        <Row label={s.ecosystem}><span style={{ color: C.gold, fontSize: 14, fontWeight: 700 }}>TEC · 24</span></Row>
        <Row label={s.builtOn}><span style={{ color: C.subtext, fontSize: 14 }}>{s.builtOnPi}</span></Row>
      </Section>

      {signedIn && (
        <button
          onClick={() => { void logout(); }}
          style={{
            width: '100%', marginTop: 16, padding: '14px', cursor: 'pointer',
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.28)',
            borderRadius: 14, color: C.error, fontSize: 15, fontWeight: 800,
          }}>
          {s.logout}
        </button>
      )}
    </div>
  );
}
