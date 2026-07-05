'use client';

// Example protected page demonstrating the canonical ADR-007 dual-mode buy flow.
// Copy this handler into your real product/checkout components.
import { useEffect, useState } from 'react';
import { TEC_COLORS } from '@yasser172/tec-ui';
import {
  isHubNavigation,
  redirectToHubPayment,
  createPaymentRecord,
  createU2APayment,
} from '@/lib/pi-payment';

// TODO(new app): replace with real items from your BFF (/api/bff/items).
const DEMO_ITEM = { id: 'demo-1', name: 'Demo Item', price: 1 };

export default function AppHomePage() {
  const [piReady, setPiReady] = useState(false);
  const [status, setStatus]   = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as { __TEC_PI_READY?: boolean }).__TEC_PI_READY) setPiReady(true);
    const onReady = () => setPiReady(true);
    window.addEventListener('tec-pi-ready', onReady);
    return () => window.removeEventListener('tec-pi-ready', onReady);
  }, []);

  const handleBuy = async () => {
    const { id, name, price } = DEMO_ITEM;

    // ── ADR-007 guard — ALWAYS keep this before touching window.Pi ──
    if (isHubNavigation() || !(window as { Pi?: unknown }).Pi || !piReady) {
      redirectToHubPayment({ amount: price, itemId: id, memo: name });   // Mode 1
      return;
    }

    // ── Mode 2: standalone Pi Browser payment ──
    setStatus('Creating payment…');
    const internalId = await createPaymentRecord(price, id, name);
    if (!internalId) { setStatus('Could not start payment.'); return; }

    setStatus('Awaiting Pi approval…');
    const result = await createU2APayment(price, name, { item_id: id }, internalId);
    setStatus(
      result.success ? `✅ Paid — txid ${result.txid}` :
      result.status === 'cancelled' ? 'Payment cancelled.' :
      `❌ ${result.message ?? 'Payment failed.'}`,
    );
    // On success, create the domain record: POST /api/bff/items { ..., payment_id: internalId }
  };

  return (
    <main style={{ minHeight: '100vh', background: TEC_COLORS.bg, color: '#e7e7ea', padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: TEC_COLORS.gold }}>TEC App</h1>
      <p style={{ opacity: 0.7 }}>Pi SDK: {piReady ? 'ready' : 'loading…'}</p>

      <div style={{ marginTop: 24, padding: 20, background: TEC_COLORS.surface, borderRadius: 12, maxWidth: 360 }}>
        <h2 style={{ margin: 0 }}>{DEMO_ITEM.name}</h2>
        <p style={{ color: TEC_COLORS.gold }}>π {DEMO_ITEM.price}</p>
        <button
          onClick={handleBuy}
          style={{ background: TEC_COLORS.goldDark, color: '#020205', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
        >
          Buy with Pi
        </button>
        {status && <p style={{ marginTop: 12 }}>{status}</p>}
      </div>
    </main>
  );
}
