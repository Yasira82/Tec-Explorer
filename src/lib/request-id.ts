const REQUEST_ID_KEY = 'tec_last_request_id';

export const generateRequestId = (): string => crypto.randomUUID();

export const storeRequestId = (requestId: string): void => {
  try { sessionStorage.setItem(REQUEST_ID_KEY, requestId); } catch { /* ignore */ }
};

export const getLastRequestId = (): string | null => {
  try { return sessionStorage.getItem(REQUEST_ID_KEY); } catch { return null; }
};

const getCsrfToken = (): string | null => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)tec_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

export const buildHeaders = (
  token?: string | null,
  extra?: Record<string, string>,
): Record<string, string> => {
  const requestId = generateRequestId();
  storeRequestId(requestId);
  const csrf = getCsrfToken();
  return {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(csrf  ? { 'X-CSRF-Token': csrf }             : {}),
    ...extra,
  };
};
