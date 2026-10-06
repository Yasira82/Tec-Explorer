'use client';

// The door of the app — a sign-in BUTTON before any screen, not a screen that
// says "Not signed in" with nothing to press (owner, 2026-10-06, Tec-Life #72).
//
// Not a page guard: a server redirect for a session-less visit was tried and
// rolled back (middleware.ts — C-123 §7/§9/§11), because a standalone visit from
// the Quest or the campaign has Pi bound to THIS app and a trip to the Hub never
// came back. So the gate renders here, and the button runs the app's OWN sign-in
// (§10): Pi → /api/auth/pi-login → the 200 landing that sets the cookies. When
// Pi cannot answer on this page (a Hub-owned session, no SDK, a refusal), the
// Hub signs them in instead and sends them back to this exact page.
//
// A visit opened FROM the Hub arrives already signed in (the Hub signs the link,
// §12), so it never sees this. While the session is still unknown it renders
// neither — a gate flashed at a signed-in member on every load is its own bug.
//
// Self-contained on purpose (one file for 18 apps): it asks /api/auth/me itself,
// carries its own two languages, and paints with the fleet tokens only.

import { useEffect, useState } from 'react';
import { usePiAuth, ssoRedirect } from '@yasser172/tec-auth';
import { selfSignIn } from '@/lib/pi/self-sign-in';

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.tecosystem.app';

const STRINGS = {
  en: { title: 'Sign in to continue', body: 'This space is yours alone. Sign in with Pi to open it.', button: 'Sign in with Pi', busy: 'Signing you in…', viaHub: 'Sign in through the Hub instead' },
  ar: { title: 'سجّل دخولك للمتابعة', body: 'هذه المساحة ملكك وحدك. سجّل دخولك بـ Pi لتفتحها.', button: 'تسجيل الدخول بـ Pi', busy: 'جارٍ تسجيل دخولك…', viaHub: 'أو سجّل الدخول من خلال الـ Hub' },
} as const;

type Session = 'unknown' | 'yes' | 'no';

export function SignInGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = usePiAuth();
  const [session, setSession] = useState<Session>('unknown');
  const [state, setState]     = useState<'idle' | 'busy'>('idle');
  const [lang, setLang]       = useState<'en' | 'ar'>('en');

  useEffect(() => {
    // The language after mount, so the server and the first client paint agree.
    setLang((document.documentElement.lang || '').toLowerCase().startsWith('ar') ? 'ar' : 'en');
    let live = true;
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then((r) => { if (live) setSession(r.ok ? 'yes' : 'no'); })
      .catch(() => { if (live) setSession('no'); });
    return () => { live = false; };
  }, []);

  if (session === 'yes' || isAuthenticated) return <>{children}</>;
  if (session === 'unknown' || isLoading) return <div aria-busy="true" style={{ minHeight: 240 }} />;

  const s = STRINGS[lang];
  const viaHub = () => { setState('busy'); ssoRedirect(HUB_URL, window.location.href); };
  const signIn = async () => {
    setState('busy');
    // `force`: the attempt window guards a LOOP, not a person pressing a button.
    const r = await selfSignIn(Date.now(), { force: true });
    if (r === 'navigating') return;                       // the landing takes it from here
    if (r === 'has-session') { window.location.reload(); return; }
    viaHub();                                             // foreign-session · no-pi · refused
  };

  return (
    <main dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: 'var(--tec-bg)', color: 'var(--tec-text-1)', display: 'grid', placeItems: 'center', padding: 22, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <section aria-label={s.title} style={{ width: '100%', maxWidth: 420, textAlign: 'center', background: 'var(--tec-surface-1)', border: '1px solid var(--tec-border)', borderRadius: 16, padding: '28px 22px' }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, margin: '0 auto 14px', background: 'var(--tec-gold-dim)', display: 'grid', placeItems: 'center', color: 'var(--tec-gold)', fontSize: 24, fontWeight: 900 }}>π</div>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>{s.title}</h1>
        <p style={{ fontSize: 14, color: 'var(--tec-text-3)', margin: '0 0 18px', lineHeight: 1.5 }}>{s.body}</p>
        <button onClick={() => { void signIn(); }} disabled={state !== 'idle'}
          style={{ width: '100%', padding: '13px 18px', fontSize: 15, fontWeight: 700, borderRadius: 12, border: 'none', cursor: 'pointer', color: 'var(--tec-bg)', background: 'var(--tec-gold)', opacity: state !== 'idle' ? 0.6 : 1 }}>
          {state === 'idle' ? s.button : s.busy}
        </button>
        <button onClick={viaHub} disabled={state !== 'idle'}
          style={{ background: 'none', border: 'none', color: 'var(--tec-text-3)', fontSize: 13, marginTop: 12, cursor: 'pointer', textDecoration: 'underline' }}>
          {s.viaHub}
        </button>
      </section>
    </main>
  );
}
