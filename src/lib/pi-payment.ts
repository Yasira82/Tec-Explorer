// Canonical Pi payment client for a TEC app (ADR-007 dual-mode, ADR-009 contract).
//
// Usage in a buy handler — ALWAYS keep the ADR-007 hub-navigation guard:
//
//   const isHubNavigation = () =>
//     document.referrer.toLowerCase().includes('hub.tecosystem.app');
//
//   if (isHubNavigation() || !(window as any).Pi || !piReady) {
//     redirectToHubPayment(...);   // Mode 1: Hub modal
//     return;
//   }
//   const internalId = await createPaymentRecord(amount, itemId, memo);   // Mode 2
//   if (!internalId) return;
//   const result = await createU2APayment(amount, memo, { item_id: itemId }, internalId);

const getCsrfToken = (): string =>
  typeof document === 'undefined' ? '' :
  document.cookie.match(/(?:^|;\s*)tec_csrf=([^;]*)/)?.[1] ?? '';

const getToken = (): string | null =>
  typeof document === 'undefined' ? null :
  document.cookie.match(/(?:^|;\s*)tec_access_token=([^;]*)/)?.[1] ?? null;

export interface PaymentResult {
  status:     'completed' | 'cancelled' | 'error';
  success:    boolean;
  paymentId?: string;
  txid?:      string;
  message?:   string;
}

// TODO(new app): set your app slug.
const APP_SOURCE = 'app';

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://hub.tecosystem.app';

/**
 * ADR-007: true when the user arrived FROM the Hub (Pi session is foreign).
 * Two signals (C-12 §3): the sessionStorage flag persisted by the SSO landing
 * page (the C-123 LAW-2 landing erases the hub referrer via location.replace),
 * with document.referrer as fallback for direct hub→app hops.
 */
export const isHubNavigation = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem('__tec_hub_entry') === '1') return true;
  } catch { /* storage unavailable — fall back to referrer */ }
  return document.referrer.toLowerCase().includes('hub.tecosystem.app');
};

/** Mode 1 — hand the payment off to the Hub modal. `/hub?pay=1` is LOCKED (C-76/ADR-007). */
export const redirectToHubPayment = (params: {
  amount: number; itemId: string; memo?: string;
}): void => {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams({
    pay:    '1',
    source: APP_SOURCE,
    amount: String(params.amount),
    item:   params.itemId,
    ...(params.memo ? { memo: params.memo } : {}),
  });
  window.location.href = `${HUB_URL}/hub?${q.toString()}`;
};

/** Step 1 — create the payment record in tec-payment-service; returns internal id. */
export const createPaymentRecord = async (
  amount: number, itemId: string, memo: string,
): Promise<string | null> => {
  try {
    const token = getToken();
    if (!token) return null;
    const res = await fetch('/api/bff/payment/create', {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': getCsrfToken(),
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify({ amount, memo, metadata: { source: APP_SOURCE, item_id: itemId } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.payment?.id ?? data?.data?.id ?? data?.id ?? null;
  } catch { return null; }
};

/** Step 2 — run the Pi User-to-App payment (Mode 2 / standalone in Pi Browser). */
export const createU2APayment = async (
  amount: number, memo: string, metadata: Record<string, unknown>, internalId: string,
): Promise<PaymentResult> => {
  return new Promise(async (resolve) => {
    if (!window.Pi) { resolve({ status: 'error', success: false, message: 'Pi SDK not ready' }); return; }
    if ((window as any).__TEC_PI_FOREIGN_SESSION) { resolve({ status: 'error', success: false, message: 'foreign_session' }); return; }

    let settled = false;
    const done = (result: PaymentResult) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => done({ status: 'error', success: false, message: 'Payment timed out — please try again.' }), 90_000);

    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      await window.Pi.authenticate(['username', 'payments'], async (incomplete: unknown) => {
        const pid = (incomplete as { identifier?: string } | null)?.identifier;
        if (!pid) return;
        try {
          await fetch('/api/bff/payment/resolve-incomplete', {
            method: 'POST', credentials: 'include', headers,
            body: JSON.stringify({ pi_payment_id: pid }),
          });
        } catch {}
      });
    } catch (authErr) {
      done({ status: 'error', success: false, message: 'Pi auth failed: ' + (authErr instanceof Error ? authErr.message : String(authErr)) });
      return;
    }

    try {
      window.Pi.createPayment(
        { amount, memo, metadata: { ...metadata, internalId } },
        {
          onReadyForServerApproval: async (piPaymentId: string) => {
            try {
              const res = await fetch('/api/bff/payment/approve', {
                method: 'POST', credentials: 'include', headers,
                body: JSON.stringify({ payment_id: internalId, pi_payment_id: piPaymentId }),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                done({ status: 'error', success: false, message: (err as Record<string, unknown>)?.error as string ?? 'Approve failed' });
              }
            } catch (err) { done({ status: 'error', success: false, message: String(err) }); }
          },
          onReadyForServerCompletion: async (piPaymentId: string, txid: string) => {
            try {
              const res  = await fetch('/api/bff/payment/complete', {
                method: 'POST', credentials: 'include', headers,
                body: JSON.stringify({ payment_id: internalId, transaction_id: txid, pi_payment_id: piPaymentId }),
              });
              const data = await res.json().catch(() => ({}));
              done(res.ok
                ? { status: 'completed', success: true, paymentId: internalId, txid }
                : { status: 'error', success: false, message: (data as Record<string, unknown>)?.error as string ?? 'Complete failed' });
            } catch (err) { done({ status: 'error', success: false, message: String(err) }); }
          },
          onCancel: () => done({ status: 'cancelled', success: false }),
          onError:  (err: Error) => done({ status: 'error', success: false, message: err.message }),
        },
      );
    } catch (err) {
      done({ status: 'error', success: false, message: err instanceof Error ? err.message : 'Pi payment error — please try again.' });
    }
  });
};
