'use client';

// Explorer Pro — the monetization surface (C-108 §7: Sponsored Discovery +
// premium Business Profiles). A real Pi User-to-App payment; this also satisfies
// the Pi Portal "Process a Transaction" step. ADR-007 dual-mode: Hub navigation →
// Mode 1 (Hub modal); standalone → Mode 2 (direct createU2APayment). Approves
// under PI_API_KEY_EXPLORER (never the default Hub key — C-12 §11).
//
// This is a SERVICE subscription (premium visibility for a business listing).
// Explorer never processes the merchant's own sales — payments happen at the
// merchant via tec-payment-service (C-108 §4).
import { useEffect, useState } from 'react';
import { TEC_COLORS } from '@yasser172/tec-ui';
import {
  isHubNavigation,
  redirectToHubPayment,
  createPaymentRecord,
  createU2APayment,
} from '@/lib/pi-payment';

const PRICE   = 12;                       // π / month
const ITEM_ID = 'explorer_pro_monthly';
const MEMO    = 'TEC Explorer — Business Pro (1 month)';

const asText = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    if (typeof o.error === 'string')   return o.error;
    try { return JSON.stringify(v); } catch { return 'Payment failed.'; }
  }
  return v == null ? '' : String(v);
};

type Status = 'idle' | 'creating' | 'paying' | 'success' | 'error';

export function ExplorerPro() {
  const [piReady, setPiReady] = useState(false);
  const [status,  setStatus]  = useState<Status>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as { __TEC_PI_READY?: boolean }).__TEC_PI_READY) { setPiReady(true); return; }
    const h = () => setPiReady(true);
    window.addEventListener('tec-pi-ready', h, { once: true });
    return () => window.removeEventListener('tec-pi-ready', h);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p  = new URLSearchParams(window.location.search);
    const st = p.get('payment_status');
    if (!st) return;
    if (st === 'success') setStatus('success');
    else if (st === 'error') { setStatus('error'); setMessage('Payment did not complete. Please try again.'); }
    window.history.replaceState({}, '', '/app');
  }, []);

  const handleUpgrade = async () => {
    if (status === 'creating' || status === 'paying') return;

    // ADR-007 (C-76): check Hub navigation FIRST — before any Pi SDK call.
    if (isHubNavigation() || (window as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION
        || !(window as { Pi?: unknown }).Pi || !piReady) {
      redirectToHubPayment({ amount: PRICE, itemId: ITEM_ID, memo: MEMO });
      return;
    }

    setStatus('creating');
    setMessage('');
    try {
      const internalId = await createPaymentRecord(PRICE, ITEM_ID, MEMO);
      if (!internalId) {
        setStatus('error');
        setMessage('Could not start the payment. Please sign in again and retry.');
        return;
      }
      setStatus('paying');
      const result = await createU2APayment(PRICE, MEMO, { item_id: ITEM_ID, plan: 'explorer_pro' }, internalId);
      if (result.success && result.status === 'completed') {
        setStatus('success');
      } else if (result.status === 'cancelled') {
        setStatus('idle');
      } else {
        setStatus('error');
        setMessage(asText(result.message) || 'Payment failed. Please try again.');
      }
    } catch (err) {
      setStatus('error');
      setMessage(asText(err) || 'Payment failed. Please try again.');
    }
  };

  const card: React.CSSProperties = {
    background:   TEC_COLORS.surface,
    border:       `1px solid ${TEC_COLORS.gold}55`,
    borderRadius: 16,
    padding:      20,
    marginTop:    24,
  };

  if (status === 'success') {
    return (
      <div style={{ ...card, borderColor: `${TEC_COLORS.success}66` }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: TEC_COLORS.success }}>✅ Business Pro active</div>
        <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 6 }}>
          Payment received. Your listing gets premium visibility in discovery 🧭.
        </div>
      </div>
    );
  }

  const busy = status === 'creating' || status === 'paying';

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: TEC_COLORS.gold }}>🧭 Explorer Business Pro</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: TEC_COLORS.text }}>
          {PRICE}π<span style={{ fontSize: 12, color: TEC_COLORS.subtext, fontWeight: 600 }}> / month</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: TEC_COLORS.subtext, marginTop: 8, lineHeight: 1.5 }}>
        For businesses — premium profile, sponsored discovery placement, and listing
        analytics. A service subscription: Explorer never processes your customers’
        payments — those happen at your business via tec-payment-service (C-108 §4).
      </div>

      <button
        onClick={() => { void handleUpgrade(); }}
        disabled={busy}
        style={{
          marginTop: 14, width: '100%', padding: '12px 16px', borderRadius: 12,
          background: busy ? '#333' : `linear-gradient(135deg, ${TEC_COLORS.gold}, ${TEC_COLORS.goldDark})`,
          color: busy ? '#888' : '#0a0800',
          border: 'none', fontSize: 14, fontWeight: 800,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {status === 'creating' ? 'Preparing…'
          : status === 'paying' ? 'Confirm in Pi…'
          : `Upgrade — ${PRICE}π / month`}
      </button>

      {status === 'error' && (
        <div style={{ fontSize: 12, color: TEC_COLORS.error, marginTop: 10 }}>{message}</div>
      )}
    </div>
  );
}
