'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Explorer Testnet payout — the Pi Portal will not grant Explorer's Mainnet App Wallet
 * until this Testnet app has paid 5 unique wallets (tec-core-backend #410).
 * Five people open this page in the TESTNET app, sign in with Pi, and tap once; each
 * receives 0.01 Test-Pi (worth nothing). Pi must be asked for `wallet_address`, or it
 * has nowhere to send (audits/A2U_FIRST_PAYOUT_ROUND_2026-09-13.md §2).
 *
 * A visitor with no TEC session is signed in the way this app always signs itself in
 * (C-123 §3): `/api/auth/pi-login` hands back a one-time token, `sso-callback` sets the
 * session and returns here, and the claim is sent once more on arrival — no second tap.
 * Same page as Tec-Ecommerce #78–#80, adapted to the template's sign-in.
 *
 * ADR-007: in a Hub-owned session Pi.authenticate never answers — say so instead.
 */

type PiWindow = {
  __TEC_PI_FOREIGN_SESSION?: boolean;
  Pi?: { authenticate?: (scopes: string[], onIncomplete: (p: unknown) => void) => Promise<{ accessToken?: string }> };
};

const RESUME = '__tec_testnet_payout_resume';
const TESTNET = /\.vercel\.app$|-test\.tecosystem\.app$/i;

const csrf = (): string =>
  document.cookie.split('; ').find((r) => r.startsWith('tec_csrf='))?.split('=')[1] ?? '';

export default function TestnetPayoutPage() {
  const [testnet, setTestnet] = useState<boolean | null>(null);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const resumed = useRef(false);

  const claim = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      const w = window as unknown as PiWindow;
      if (w.__TEC_PI_FOREIGN_SESSION === true) throw new Error('Open this page directly in the Explorer Testnet app, not from the Hub.');
      if (typeof w.Pi?.authenticate !== 'function') throw new Error('Open this page in Pi Browser.');
      const auth = await w.Pi.authenticate(['username', 'payments', 'wallet_address'], () => { /* no payment to resume here */ });
      if (!auth?.accessToken) throw new Error('Pi did not sign you in.');
      const res = await fetch('/api/bff/testnet-payout', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf() },
        body: JSON.stringify({ pi_access_token: auth.accessToken }),
      });
      if (res.status === 401) {
        // No TEC session: sign in through this app's own door, come back, claim on arrival.
        let once = false;
        try { once = sessionStorage.getItem(RESUME) === 'done'; } catch { /* ignore */ }   // no sessionStorage: still try once
        if (once) throw new Error('Could not sign you in to TEC — try again.');
        const login = await fetch('/api/auth/pi-login', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: auth.accessToken }),
        });
        const token = login.ok ? ((await login.json().catch(() => null)) as { ssoToken?: unknown } | null)?.ssoToken : null;
        if (typeof token !== 'string' || !token) throw new Error('Could not sign you in to TEC — try again.');
        try { sessionStorage.setItem(RESUME, '1'); } catch { /* ignore */ }   // no sessionStorage: the visitor taps once more
        window.location.replace(`/api/auth/sso-callback?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent('/testnet-payout')}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? `Failed (${res.status})`);
      setMsg({ ok: true, text: data?.data?.already ? 'You have already received your test payout. Thank you!' : 'Sent — 0.01 Test-Pi is on its way to your Testnet wallet. Thank you!' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const isTestnet = TESTNET.test(window.location.hostname);
    setTestnet(isTestnet);
    // Back from sso-callback with a session: send the claim the visitor already asked for.
    let pending = false;
    try { pending = sessionStorage.getItem(RESUME) === '1'; if (pending) sessionStorage.setItem(RESUME, 'done'); } catch { /* ignore */ }
    if (isTestnet && pending && !resumed.current) { resumed.current = true; void claim(); }
  }, [claim]);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--tec-bg)', color: 'var(--tec-text-1)', padding: '32px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Explorer · Testnet payout</h1>
        {testnet === false ? (
          <p style={{ color: 'var(--tec-text-3)', fontSize: 14 }}>This page only works in the Explorer <b>Testnet</b> app.</p>
        ) : (
          <>
            <p style={{ color: 'var(--tec-text-3)', fontSize: 14, lineHeight: 1.6 }}>
              Help TEC Explorer get its Mainnet wallet: sign in with Pi and receive <b>0.01 Test-Pi</b> (Testnet coins,
              no real value). One per person. Pi will ask to share your wallet address — that is where the Test-Pi goes.
            </p>
            <button type="button" onClick={() => { void claim(); }} disabled={busy || testnet === null}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 15, background: 'var(--tec-gold)', color: 'var(--tec-on-gold)', opacity: busy ? 0.5 : 1, marginTop: 8 }}>
              {busy ? 'Sending…' : 'Sign in with Pi and receive 0.01 Test-Pi'}
            </button>
            {msg && <p role="status" style={{ marginTop: 12, fontSize: 14, color: msg.ok ? 'var(--tec-green)' : 'var(--tec-red)' }}>{msg.text}</p>}
          </>
        )}
      </div>
    </main>
  );
}
