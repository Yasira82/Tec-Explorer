'use client';

// "Why didn't the campaign tick this app?" — answered on the phone that asks.
//
// Reads the per-tab trace (lib/pioneer/arrival-trace.ts) and the live flags
// that decide whether this app signs in with Pi at all. Refreshes for a few
// seconds, because the sign-in and the report both happen after load.

import { useEffect, useState } from 'react';
import {
  readTrace, SIGNIN_TRACE, ARRIVAL_TRACE, type SignInTrace, type ArrivalTrace,
} from '@/lib/pioneer/arrival-trace';

interface Snapshot {
  hubEntry:  boolean;
  referrer:  string;
  foreign:   boolean;
  piReady:   boolean;
  piPresent: boolean;
  reported:  boolean;
  signIn:    SignInTrace | null;
  arrival:   ArrivalTrace | null;
}

function snapshot(): Snapshot {
  const w = window as unknown as { __TEC_PI_FOREIGN_SESSION?: boolean; __TEC_PI_READY?: boolean; Pi?: unknown };
  let hubEntry = false;
  let reported = false;
  try {
    hubEntry = sessionStorage.getItem('__tec_hub_entry') === '1';
    reported = Number(sessionStorage.getItem('tec_arrival_reported_at')) > 0;
  } catch { /* ignore */ }
  let referrer = '';
  try { referrer = document.referrer ? new URL(document.referrer).host : ''; } catch { /* ignore */ }
  return {
    hubEntry, referrer, reported,
    foreign:   w.__TEC_PI_FOREIGN_SESSION === true,
    piReady:   w.__TEC_PI_READY === true,
    piPresent: typeof w.Pi !== 'undefined',
    signIn:    readTrace<SignInTrace>(SIGNIN_TRACE),
    arrival:   readTrace<ArrivalTrace>(ARRIVAL_TRACE),
  };
}

const row = (label: string, value: string, good: boolean | null) => (
  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px solid var(--tec-border)' }}>
    <span>{label}</span>
    <strong style={{ color: good === null ? 'var(--tec-text-3)' : good ? 'var(--tec-green)' : 'var(--tec-red)', textAlign: 'end' }}>{value}</strong>
  </div>
);

export function ArrivalTracePanel() {
  const [s, setS] = useState<Snapshot | null>(null);

  useEffect(() => {
    setS(snapshot());
    let n = 0;
    const id = setInterval(() => { setS(snapshot()); if (++n >= 15) clearInterval(id); }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!s) return null;

  const signIn = !s.signIn ? 'not tried yet'
    : s.signIn.result === 'error' ? `error: ${s.signIn.error}` : s.signIn.result;
  const arrival = !s.arrival ? (s.reported ? 'sent earlier in this tab' : 'not sent')
    : 'error' in s.arrival ? `network error: ${s.arrival.error}`
    : `HTTP ${s.arrival.status} · recorded ${s.arrival.recorded}${s.arrival.reason ? ` · ${s.arrival.reason}` : ''}`;

  return (
    <section style={{ marginBottom: 16, padding: '12px 16px', border: '1px solid var(--tec-gold)', borderRadius: 8 }}>
      <h2 style={{ fontSize: '1rem', marginBottom: 8, color: 'var(--tec-gold)' }}>Campaign arrival</h2>
      <div style={{ fontSize: '0.8rem' }}>
        {row('Opened from the Hub (flag)', s.hubEntry ? 'yes' : 'no', !s.hubEntry)}
        {row('Referrer', s.referrer || '(none)', null)}
        {row('Hub-owned Pi session', s.foreign ? 'yes — no Pi sign-in here' : 'no', !s.foreign)}
        {row('Pi SDK', s.piPresent ? (s.piReady ? 'ready' : 'loaded, not ready') : 'missing', s.piPresent && s.piReady)}
        {row('Pi sign-in in this app', signIn, s.signIn ? s.signIn.result === 'ok' : null)}
        {row('Arrival report', arrival, s.arrival && !('error' in s.arrival) ? s.arrival.recorded : (s.reported || null))}
      </div>
    </section>
  );
}
