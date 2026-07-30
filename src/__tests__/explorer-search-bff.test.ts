// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// TEC Explorer — discovery search BFF (C-108 / C-135 §4). Locks the Professional-Bar
// contract: real backend data end-to-end, and an honest `unavailable` state (NO
// fabricated directory) when the backend is unreachable.
//
// The route reads API_GATEWAY_URL at module load, so each test sets the env then
// re-imports the module (vi.resetModules) to pick it up.
type Route = typeof import('@/app/api/bff/explorer/search/route');

const GW = 'https://api.example.com';
const req = (qs = '') => new NextRequest(`http://localhost/api/bff/explorer/search${qs}`);

const backendRow = {
  handle: 'pi-cafe', name: 'Pi Cafe', category: 'FOOD', area: 'City Center',
  summary: 'Coffee in Pi', pi_accepted: true, verification: 'VERIFIED',
  trust_hint: 'Trusted', tags: ['coffee'],
};

const loadGET = async (withGateway: boolean): Promise<Route['GET']> => {
  if (withGateway) process.env.API_GATEWAY_URL = GW;
  else             delete process.env.API_GATEWAY_URL;
  process.env.INTERNAL_SECRET = 'secret';
  vi.resetModules();
  return (await import('@/app/api/bff/explorer/search/route')).GET;
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('GET /api/bff/explorer/search', () => {
  it('returns live results from the backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: { results: [backendRow] } }),
    } as unknown as Response);

    const GET  = await loadGET(true);
    const body = await (await GET(req('?q=coffee'))).json();
    expect(body.source).toBe('live');
    expect(body.count).toBe(1);
    expect(body.results[0].name).toBe('Pi Cafe');
  });

  it('returns an honest empty live result (never sample) when the backend has none', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: { results: [] } }),
    } as unknown as Response);

    const GET  = await loadGET(true);
    const body = await (await GET(req())).json();
    expect(body.source).toBe('live');
    expect(body.results).toEqual([]);
  });

  it('returns source=unavailable with NO results when the backend errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const GET  = await loadGET(true);
    const body = await (await GET(req('?q=x'))).json();
    expect(body.source).toBe('unavailable');
    expect(body.results).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('returns source=unavailable when the gateway is not configured', async () => {
    const GET  = await loadGET(false);
    const body = await (await GET(req())).json();
    expect(body.source).toBe('unavailable');
    expect(body.results).toEqual([]);
  });
});
