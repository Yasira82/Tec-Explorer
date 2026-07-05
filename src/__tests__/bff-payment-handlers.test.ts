// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const GW = 'https://api.example.com';

const makeReq = (opts: {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  body?:    unknown;
  url?:     string;
}) => {
  const cookieStr = opts.cookies
    ? Object.entries(opts.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
    : '';
  const headers: Record<string, string> = {};
  if (cookieStr) headers['Cookie'] = cookieStr;
  if (opts.headers) Object.assign(headers, opts.headers);
  return new NextRequest(opts.url ?? 'http://localhost/api/bff/payment/create', {
    method:  'POST',
    headers,
    body:    opts.body ? JSON.stringify(opts.body) : undefined,
  });
};

const userCookie = JSON.stringify({ id: 'user-123', piId: 'pi-456' });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_GATEWAY_URL = GW;
});

// ── /api/bff/payment/create ─────────────────────────────────────
describe('POST /api/bff/payment/create', () => {
  it('returns 401 when access token missing', async () => {
    const { POST } = await import('@/app/api/bff/payment/create/route');
    const res = await POST(makeReq({ cookies: { tec_user: userCookie }, body: { amount: 1 } }));
    expect(res.status).toBe(401);
  });

  it('delegates CSRF to middleware — a CSRF mismatch does NOT 403 at the route', async () => {
    // CSRF is enforced once in middleware (double-submit OR first-party Origin).
    const { POST } = await import('@/app/api/bff/payment/create/route');
    const res = await POST(makeReq({
      cookies: { tec_csrf: 'cookie-value' },          // no access token
      headers: { 'x-csrf-token': 'wrong-value' },     // mismatched CSRF
      body:    { amount: 1 },
    }));
    expect(res.status).toBe(401);                       // not 403
  });

  it('forwards to gateway with number amount + x-internal-key on success', async () => {
    process.env.INTERNAL_SECRET = 'secret';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, status: 201, json: async () => ({ data: { payment: { id: 'p1' } } }),
    } as Response);

    const { POST } = await import('@/app/api/bff/payment/create/route');
    const res = await POST(makeReq({
      cookies: { tec_access_token: 'tok', tec_user: userCookie, tec_csrf: 'c' },
      headers: { 'x-csrf-token': 'c' },
      body:    { amount: 5, memo: 'x' },
    }));
    expect(res.status).toBe(201);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GW}/api/payment/create`);
    expect((init.headers as Record<string, string>)['x-internal-key']).toBe('secret');
    expect(typeof JSON.parse(init.body as string).amount).toBe('number');
    fetchSpy.mockRestore();
  });
});

// ── /api/bff/payment/approve ────────────────────────────────────
describe('POST /api/bff/payment/approve', () => {
  it('returns 401 when token missing', async () => {
    const { POST } = await import('@/app/api/bff/payment/approve/route');
    const res = await POST(makeReq({
      url: 'http://localhost/api/bff/payment/approve',
      body: { payment_id: 'p1', pi_payment_id: 'pi1' },
    }));
    expect(res.status).toBe(401);
  });

  it('forwards approve to gateway on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ approved: true }),
    } as Response);
    const { POST } = await import('@/app/api/bff/payment/approve/route');
    const res = await POST(makeReq({
      url: 'http://localhost/api/bff/payment/approve',
      cookies: { tec_access_token: 'tok' },
      body: { payment_id: 'p1', pi_payment_id: 'pi1' },
    }));
    expect(res.status).toBe(200);
    fetchSpy.mockRestore();
  });
});

// ── /api/bff/payment/complete ───────────────────────────────────
describe('POST /api/bff/payment/complete', () => {
  it('returns 401 when token missing', async () => {
    const { POST } = await import('@/app/api/bff/payment/complete/route');
    const res = await POST(makeReq({
      url: 'http://localhost/api/bff/payment/complete',
      body: { payment_id: 'p1', transaction_id: 'tx1' },
    }));
    expect(res.status).toBe(401);
  });

  it('forwards complete (transaction_id) to gateway on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ success: true }),
    } as Response);
    const { POST } = await import('@/app/api/bff/payment/complete/route');
    const res = await POST(makeReq({
      url: 'http://localhost/api/bff/payment/complete',
      cookies: { tec_access_token: 'tok' },
      body: { payment_id: 'p1', transaction_id: 'txid-abc' },
    }));
    expect(res.status).toBe(200);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).transaction_id).toBe('txid-abc');
    fetchSpy.mockRestore();
  });
});
