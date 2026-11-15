'use client';

import { useState } from 'react';
import type { FleetStrings } from '@/components/fleet/strings';

const MAX = 2000;
const MIN = 3;

/**
 * "Tell us what you think" — and it goes somewhere: `/api/bff/feedback` → the fleet's
 * feedback inbox, labelled with this app (App Excellence Standard E12). Design tokens
 * only (E4). The button is never disabled in silence: a refusal says why, and a
 * visitor with no session is told to sign in rather than shown a generic failure.
 */
export function FeedbackCard({ f, page }: { f: FleetStrings['feedback']; page?: string }) {
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();
  const tooLong = trimmed.length > MAX;

  const submit = async () => {
    if (trimmed.length < MIN || tooLong) {
      setError(tooLong ? f.tooLong.replace('{n}', String(trimmed.length)) : f.tooShort);
      return;
    }
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/bff/feedback', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ message: trimmed, page }),
      });
      if (res.status === 401) throw new Error(f.signIn);
      if (!res.ok) {
        // The server's own sentence first — it knows which rule was broken (the hourly limit).
        const data = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(data?.message || f.failed);
      }
      setState('sent');
      setMessage('');
    } catch (err) {
      setState('idle');
      setError((err as Error).message || f.failed);
    }
  };

  if (state === 'sent') {
    return (
      <div role="status" style={{ background: 'var(--tec-green-dim)', border: '1px solid var(--tec-green)', borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ color: 'var(--tec-green)', fontWeight: 700, fontSize: 14 }}>{f.thanks}</div>
        <div style={{ color: 'var(--tec-text-2)', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{f.thanksHint}</div>
        <button type="button" onClick={() => setState('idle')}
          style={{ marginTop: 10, minHeight: 40, background: 'none', border: 'none', padding: 0, color: 'var(--tec-gold)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {f.sendAnother}
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="tec-feedback" style={{ display: 'block', fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{f.title}</label>
      <textarea id="tec-feedback" value={message} rows={4} placeholder={f.placeholder}
        onChange={(e) => { setMessage(e.target.value); if (error) setError(null); }}
        aria-invalid={!!error} aria-describedby={error ? 'tec-feedback-error' : 'tec-feedback-note'}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 12, padding: '12px 14px',
          background: 'var(--tec-surface-2)', color: 'var(--tec-text-1)', fontSize: 14, lineHeight: 1.55,
          border: `1px solid ${error ? 'var(--tec-red)' : 'var(--tec-border)'}`,
        }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <span style={{ fontSize: 12, color: tooLong ? 'var(--tec-red)' : 'var(--tec-text-3)' }}>{trimmed.length} / {MAX}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => { void submit(); }} disabled={state === 'sending'}
          style={{
            minHeight: 44, padding: '10px 20px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800,
            color: 'var(--tec-bg)', background: 'var(--tec-gold)', cursor: state === 'sending' ? 'default' : 'pointer',
            opacity: state === 'sending' ? 0.6 : 1,
          }}>
          {state === 'sending' ? f.sending : f.send}
        </button>
      </div>
      {error && <div id="tec-feedback-error" role="alert" style={{ marginTop: 8, color: 'var(--tec-red)', fontSize: 13 }}>{error}</div>}
      <div id="tec-feedback-note" style={{ marginTop: 10, fontSize: 12, color: 'var(--tec-text-3)', lineHeight: 1.5 }}>{f.privacyNote}</div>
    </div>
  );
}
