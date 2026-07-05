import { describe, it, expect, vi, afterEach } from 'vitest';

// Health endpoint contract (C-92/C-96): always answers 200 with a C-92-shaped body,
// never throws. Drives the platform health runtime + observability scrape.

const ORIGINAL_GW = process.env.API_GATEWAY_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_GW === undefined) delete process.env.API_GATEWAY_URL;
  else process.env.API_GATEWAY_URL = ORIGINAL_GW;
});

async function callGET() {
  const { GET } = await import('@/app/api/health/route');
  const res = await GET();
  return { res, body: await res.json() };
}

describe('GET /api/health', () => {
  it('reports up (backend unknown) when no gateway configured', async () => {
    delete process.env.API_GATEWAY_URL;
    vi.resetModules();
    const { res, body } = await callGET();
    expect(res.status).toBe(200);
    expect(body.online).toBe(true);
    expect(body.timestamp).toBeDefined();
  });

  it('returns online:true when gateway is healthy', async () => {
    process.env.API_GATEWAY_URL = 'https://gw.example';
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', services: { auth: { status: 'up' } } }),
    } as unknown as Response);
    const { res, body } = await callGET();
    expect(res.status).toBe(200);
    expect(body.online).toBe(true);
    expect(body.status).toBe('ok');
  });

  it('returns online:false (still 200) when gateway is unreachable', async () => {
    process.env.API_GATEWAY_URL = 'https://gw.example';
    vi.resetModules();
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { res, body } = await callGET();
    expect(res.status).toBe(200);          // endpoint never 500s
    expect(body.online).toBe(false);
    expect(body.status).toBe('down');
  });
});
