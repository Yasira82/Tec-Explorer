import { PiAuthResult, TecAuthResponse, PiPaymentData, PiPaymentCallbacks } from '@/types/pi.types';
import { PiRuntime } from '@/lib/pi/PiRuntime';

declare global {
  interface Window {
    Pi: {
      authenticate: (
        scopes: string[],
        onIncompletePayment: (payment: unknown) => void
      ) => Promise<PiAuthResult>;
      createPayment: (paymentData: PiPaymentData, callbacks: PiPaymentCallbacks) => void;
      init: (config: { version: string; sandbox: boolean; appId?: string }) => void;
    };
    __PI_SANDBOX?:   boolean;
    __TEC_PI_READY?: boolean;
    __TEC_PI_ERROR?: boolean;
  }
}

const ERRORS = {
  NOT_PI_BROWSER:
    'Please open the app inside Pi Browser to authenticate.\n' +
    'Instructions: Open Pi Network app → Apps → TEC App',
  SDK_LOAD_FAILED:
    'Pi SDK failed to load. Please check your internet connection and try again.',
  SDK_INIT_FAILED:
    'Pi SDK initialization failed. Please try again.',
  AUTH_TIMEOUT:
    'Authentication timed out. Please check your internet connection and try again.',
  SAVE_FAILED:
    'Failed to save authentication data. Please ensure private browsing mode is disabled.',
};

export const isPiBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  return typeof window.Pi !== 'undefined' && typeof window.Pi.authenticate === 'function';
};

export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const match = document.cookie
      .split('; ')
      .find(row => row.startsWith('tec_access_token='));
    if (!match) return null;
    return match.substring(match.indexOf('=') + 1);
  } catch { return null; }
};

export const getRefreshToken = (): string | null => null;

export const getStoredUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    const match = document.cookie
      .split('; ')
      .find(row => row.startsWith('tec_user='));
    if (!match) return null;
    const value = match.substring(match.indexOf('=') + 1);
    return JSON.parse(decodeURIComponent(value));
  } catch { return null; }
};

export const logout = async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    // The session is the HttpOnly cookies; the server clears them. Nothing to clear here.
  } catch (err) {
    console.error('[Pi Auth] Logout failed:', err);
  }
};

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

export const refreshAccessToken = async (): Promise<string | null> => {
  if (isRefreshing) {
    return new Promise(resolve => { refreshQueue.push(resolve); });
  }
  isRefreshing = true;
  try {
    const res = await fetch('/api/auth/refresh', {
      method:      'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      // C-123 §4: a failed refresh never logs out — that was a logout → re-SSO thrash
      // loop. The session stays as it is; the next screen asks to sign in if it must.
      refreshQueue.forEach(cb => cb(null));
      refreshQueue = [];
      return null;
    }
    const data = await res.json();
    refreshQueue.forEach(cb => cb(data.token ?? null));
    refreshQueue = [];
    return data.token ?? null;
  } catch (err) {
    console.error('[Pi Auth] Refresh failed:', err);
    refreshQueue.forEach(cb => cb(null));
    refreshQueue = [];
    return null;
  } finally {
    isRefreshing = false;
  }
};

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
  });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) return res;
    return fetch(url, { ...options, credentials: 'include' });
  }
  return res;
};

export const resolvePendingPayment = async (
  piPaymentId: string
): Promise<{ action: string } | null> => {
  try {
    // Through this app's own route — the gateway address exists on the server only.
    const res = await fetch('/api/payment/resolve-incomplete', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body:        JSON.stringify({ pi_payment_id: piPaymentId }),
    });
    if (!res.ok) throw new Error(`resolve-incomplete ${res.status}`);
    const data = await res.json().catch(() => ({})) as { action?: string };
    return { action: data.action ?? 'resolved' };
  } catch (err) {
    _captureError('resolvePendingPayment failed', { piPaymentId, error: String(err) });
    return null;
  }
};

// ── Sentry Helpers ────────────────────────────────────────
const _captureError = (message: string, data: Record<string, unknown>): void => {
  try {
    import('@sentry/nextjs').then(Sentry => {
      Sentry.captureMessage(`[Pi Recovery] ${message}`, {
        level: 'error',
        extra: data,
        tags:  { component: 'pi-auth', type: 'incomplete-payment' },
      });
    }).catch(() => {});
  } catch { /* the reporter itself failed — there is nowhere left to report it */ }
};

const _reportResolved = (piPaymentId: string, via: string, action?: unknown): void => {
  try {
    import('@sentry/nextjs').then(Sentry => {
      Sentry.addBreadcrumb({
        category: 'pi.payment',
        message:  `Payment resolved via ${via}`,
        level:    'info',
        data:     { piPaymentId, via, action },
      });
    }).catch(() => {});
  } catch { /* the reporter itself failed — there is nowhere left to report it */ }
};

const _addBreadcrumb = (message: string, data: Record<string, unknown>): void => {
  try {
    import('@sentry/nextjs').then(Sentry => {
      Sentry.addBreadcrumb({
        category: 'pi.payment',
        message,
        level:    'warning',
        data,
      });
    }).catch(() => {});
  } catch { /* the reporter itself failed — there is nowhere left to report it */ }
};

// ── Helper — قراءة CSRF token من الـ cookie ───────────────
const getCsrfToken = (): string => {
  if (typeof document === 'undefined') return '';
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('tec_csrf='))
    ?.split('=')?.[1] ?? '';
};

// ── Resolve Incomplete Payment — بعد الـ login ────────────
let _pendingPaymentId: string | null = null;

interface IncompletePayment {
  identifier?: string;
}

const handleIncompletePayment = (payment: unknown): void => {
  const p           = payment as IncompletePayment;
  const piPaymentId = p?.identifier;
  if (!piPaymentId) return;

  _pendingPaymentId = piPaymentId;
  _addBreadcrumb('Incomplete payment detected — will resolve after login', { piPaymentId });
};

const resolveIncompleteAfterLogin = async (piPaymentId: string): Promise<void> => {
  const csrfToken = getCsrfToken();

  // ── Step 1: Backend ──────────────────────────────────────
  try {
    const res = await fetch('/api/payment/resolve-incomplete', {
      method:      'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        // ✅ CSRF token — بدونه الـ middleware بيرجع 403
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ pi_payment_id: piPaymentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      _reportResolved(piPaymentId, 'backend', data?.action);
      return;
    }
    _captureError('resolve-incomplete backend failed', { piPaymentId, status: res.status, data });
  } catch (err) {
    _captureError('resolve-incomplete network error', { piPaymentId, error: String(err) });
  }

  // (There was a step here that asked the server SDK from the browser. The browser has
  // no gateway address, so it could not succeed; it also pulled server-only code into
  // the page bundle — TEC-AUDIT-0045. The route above IS the server path.)

  // ── Step 3: Cancel ────────────────────────────────────────
  try {
    const res = await fetch('/api/payment/cancel', {
      method:      'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ pi_payment_id: piPaymentId }),
    });
    if (res.ok) {
      _reportResolved(piPaymentId, 'cancel');
    } else {
      _captureError('All recovery attempts failed', { piPaymentId, cancelStatus: res.status });
    }
  } catch (err) {
    _captureError('Cancel network error', { piPaymentId, error: String(err) });
  }
};

// ── SDK Wait ──────────────────────────────────────────────
export const waitForPiSDK = (timeout = 15000): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.__TEC_PI_ERROR) {
      reject(new Error(ERRORS.SDK_LOAD_FAILED));
      return;
    }
    if (typeof window !== 'undefined' && typeof window.Pi !== 'undefined' && window.__TEC_PI_READY) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      window.removeEventListener('tec-pi-ready', onReady);
      window.removeEventListener('tec-pi-error', onError);
      reject(new Error(ERRORS.SDK_LOAD_FAILED));
    }, timeout);
    const onReady = () => {
      clearTimeout(timer);
      window.removeEventListener('tec-pi-error', onError);
      resolve();
    };
    const onError = () => {
      clearTimeout(timer);
      window.removeEventListener('tec-pi-ready', onReady);
      reject(new Error(ERRORS.SDK_INIT_FAILED));
    };
    window.addEventListener('tec-pi-ready', onReady, { once: true });
    window.addEventListener('tec-pi-error', onError, { once: true });
  });
};

const getAuthTimeout = (): number => {
  const envTimeout = process.env.NEXT_PUBLIC_PI_AUTH_TIMEOUT
    ? parseInt(process.env.NEXT_PUBLIC_PI_AUTH_TIMEOUT, 10)
    : 45000;
  return !isNaN(envTimeout) && envTimeout > 0 ? envTimeout : 45000;
};

const authenticateWithTimeout = async (timeout?: number): Promise<PiAuthResult> => {
  const effectiveTimeout = timeout ?? getAuthTimeout();
  await waitForPiSDK();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(isPiBrowser() ? ERRORS.AUTH_TIMEOUT : ERRORS.NOT_PI_BROWSER));
    }, effectiveTimeout);
    // Through the PAL (R1): one place to adapt to a Pi SDK change, and the circuit
    // breaker sees sign-in failures too (TEC-AUDIT-0011).
    PiRuntime.authenticate(['username', 'payments'], handleIncompletePayment as (p: unknown) => void)
      .then(result => { clearTimeout(timer); resolve(result as PiAuthResult); })
      .catch(err   => { clearTimeout(timer); reject(err);     });
  });
};

// ── Login with Pi ─────────────────────────────────────────
export const loginWithPi = async (): Promise<TecAuthResponse> => {
  if (!isPiBrowser()) {
    throw new Error(ERRORS.NOT_PI_BROWSER);
  }

  _pendingPaymentId = null;

  const piAuth = await authenticateWithTimeout();

  const res = await fetch('/api/auth/pi-login', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ accessToken: piAuth.accessToken }),
  });

  if (!res.ok) {
    throw new Error(ERRORS.SAVE_FAILED);
  }

  const data = await res.json();

  // ✅ الآن فيه cookie + CSRF — نعالج الـ incomplete payment
  if (_pendingPaymentId) {
    void resolveIncompleteAfterLogin(_pendingPaymentId);
    _pendingPaymentId = null;
  }

  _registerFCMToken(piAuth.accessToken).catch(() => {});

  return {
    success:   data.success,
    isNewUser: data.isNewUser,
    user: {
      id:               data.user.id,
      piId:             data.user.piId,
      piUsername:       data.user.piUsername,
      role:             data.user.role,
      subscriptionPlan: data.user.subscriptionPlan,
      createdAt:        data.user.createdAt,
    },
    tokens: {
      accessToken:  '',
      refreshToken: '',
    },
  };
};

// ── FCM Token Registration ────────────────────────────────
const _registerFCMToken = async (_accessToken: string): Promise<void> => {
  // FCM optional — add @/lib/firebase if needed
};
