// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// TEC Explorer — self-listing BFF (C-108). These tests lock the contract: the write
// routes forward the session JWT as Bearer (owner derived server-side, never the body
// — P6), validate before hitting the backend, map the backend row to the frontend
// Listing, and pass backend status codes (401/409) through.

const GW = 'https://api.example.com';

const makeReq = (opts: { cookies?: Record<string, string>; body?: unknown; method?: string; url?: string }) => {
  const cookieStr = opts.cookies
    ? Object.entries(opts.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
    : '';
  const headers: Record<string, string> = {};
  if (cookieStr) headers['Cookie'] = cookieStr;
  return new NextRequest(opts.url ?? 'http://localhost/api/bff/explorer/listings', {
    method:  opts.method ?? 'POST',
    headers,
    body:    opts.body ? JSON.stringify(opts.body) : undefined,
  });
};

const backendBiz = (over: Record<string, unknown> = {}) => ({
  handle: 'pi-cafe', name: 'Pi Cafe', category: 'FOOD', area: 'City Center',
  summary: 'Coffee in Pi', pi_accepted: true, verification: 'UNVERIFIED',
  trust_hint: 'New listing', tags: ['coffee'], ...over,
});

const okJson = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => ({ data }),
});
const errJson = (message: string, status: number) => ({
  ok: false, status, json: async () => ({ message }),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.API_GATEWAY_URL = GW;
  process.env.INTERNAL_SECRET = 'secret';
});

describe('GET /api/bff/explorer/listings (my listings)', () => {
  it('returns 401 without a token', async () => {
    const { GET } = await import('@/app/api/bff/explorer/listings/route');
    const res = await GET(makeReq({ method: 'GET' }));
    expect(res.status).toBe(401);
  });

  it('forwards the JWT and maps backend rows to Listings', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ listings: [backendBiz()] }));
    const { GET } = await import('@/app/api/bff/explorer/listings/route');
    const res  = await GET(makeReq({ method: 'GET', cookies: { tec_access_token: 'jwt-1' } }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.listings[0]).toMatchObject({ id: 'pi-cafe', category: 'food', verification: 'unverified' });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers.Authorization).toBe('Bearer jwt-1');
  });
});

describe('POST /api/bff/explorer/listings (self-list)', () => {
  it('returns 401 without a token', async () => {
    const { POST } = await import('@/app/api/bff/explorer/listings/route');
    const res = await POST(makeReq({ body: { name: 'Pi Cafe', category: 'food', area: 'City', summary: 'coffee' } }));
    expect(res.status).toBe(401);
  });

  it('forwards Bearer + x-internal-key and sends NO owner (P6); maps the created row', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ business: backendBiz() }, 201));
    const { POST } = await import('@/app/api/bff/explorer/listings/route');
    const res = await POST(makeReq({
      cookies: { tec_access_token: 'jwt-1' },
      body:    { name: 'Pi Cafe', category: 'food', area: 'City Center', summary: 'coffee in Pi', tags: ['coffee'] },
    }));
    expect(res.status).toBe(201);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(`${GW}/api/identity/explorer/business`);
    expect(init.headers.Authorization).toBe('Bearer jwt-1');
    expect(init.headers['x-internal-key']).toBe('secret');
    expect(JSON.parse(init.body as string).owner).toBeUndefined();
    expect((await res.json()).listing).toMatchObject({ id: 'pi-cafe', verification: 'unverified' });
  });

  it('rejects an invalid category at the BFF (no backend call)', async () => {
    global.fetch = vi.fn();
    const { POST } = await import('@/app/api/bff/explorer/listings/route');
    const res = await POST(makeReq({ cookies: { tec_access_token: 'jwt-1' }, body: { name: 'X', category: 'nope', area: 'City', summary: 'y' } }));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('passes a backend 409 (one listing per owner) through', async () => {
    global.fetch = vi.fn().mockResolvedValue(errJson('You already have a listing', 409));
    const { POST } = await import('@/app/api/bff/explorer/listings/route');
    const res = await POST(makeReq({ cookies: { tec_access_token: 'jwt-1' }, body: { name: 'Another', category: 'tech', area: 'Remote', summary: 'more work' } }));
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/bff/explorer/business/:id (edit own)', () => {
  it('returns 401 without a token', async () => {
    const { PATCH } = await import('@/app/api/bff/explorer/business/[id]/route');
    const res = await PATCH(
      makeReq({ method: 'PATCH', body: { summary: 'x' }, url: 'http://localhost/api/bff/explorer/business/pi-cafe' }),
      { params: Promise.resolve({ id: 'pi-cafe' }) },
    );
    expect(res.status).toBe(401);
  });

  it('forwards only provided fields as a PATCH to the backend business path', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ business: backendBiz({ summary: 'Now open late' }) }));
    const { PATCH } = await import('@/app/api/bff/explorer/business/[id]/route');
    const res = await PATCH(
      makeReq({ method: 'PATCH', cookies: { tec_access_token: 'jwt-1' }, body: { summary: 'Now open late' }, url: 'http://localhost/api/bff/explorer/business/pi-cafe' }),
      { params: Promise.resolve({ id: 'pi-cafe' }) },
    );
    expect(res.status).toBe(200);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GW}/api/identity/explorer/business/pi-cafe`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ summary: 'Now open late' });  // verification not touched
  });

  it('rejects an invalid category at the BFF (no backend call)', async () => {
    global.fetch = vi.fn();
    const { PATCH } = await import('@/app/api/bff/explorer/business/[id]/route');
    const res = await PATCH(
      makeReq({ method: 'PATCH', cookies: { tec_access_token: 'jwt-1' }, body: { category: 'nope' }, url: 'http://localhost/api/bff/explorer/business/pi-cafe' }),
      { params: Promise.resolve({ id: 'pi-cafe' }) },
    );
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
