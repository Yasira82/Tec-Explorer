/**
 * This app's Pro is this app's own (owner decision, 2026-10-02): the status read
 * and the cancel both name THIS app to commerce, so an NX Pro never shows as Pro
 * here and a cancel here never touches the Hub plan or another app.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { APP_SOURCE } from '@/lib/app-source';

const req = (url: string, init: RequestInit = {}, token = true) => {
  const r = new NextRequest(url, init as never);
  if (token) r.cookies.set('tec_access_token', 'tok');
  return r;
};

beforeEach(() => {
  vi.resetModules();
  process.env.API_GATEWAY_URL = 'https://gw.internal';
  process.env.INTERNAL_SECRET = 'k';
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('this app\'s Pro', () => {
  it('the status read asks commerce for THIS app\'s Pro', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { subscription: { plan: 'FREE' } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/bff/subscription/route');
    await GET(req(`https://${APP_SOURCE}.tecosystem.app/api/bff/subscription`));
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(`/api/commerce/subscriptions/status?app=${APP_SOURCE}`);
  });

  it('cancel cancels THIS app only — PATCH ?app=, with the session token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('@/app/api/bff/subscription/cancel/route');
    const res = await POST(req(`https://${APP_SOURCE}.tecosystem.app/api/bff/subscription/cancel`, { method: 'POST', body: '{}' }));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://gw.internal/api/commerce/subscriptions/cancel?app=${APP_SOURCE}`);
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('cancel without a session is refused, and nothing is sent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import('@/app/api/bff/subscription/cancel/route');
    const res = await POST(req(`https://${APP_SOURCE}.tecosystem.app/api/bff/subscription/cancel`, { method: 'POST', body: '{}' }, false));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
