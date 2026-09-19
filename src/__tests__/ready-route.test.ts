import { describe, it, expect, vi, afterEach } from 'vitest';

// Readiness contract (C-92/C-96). The counterpart to /api/health, and its opposite in
// one respect: health always answers 200 (liveness must not fail under load — NEW-W),
// while ready is ALLOWED to fail, because that is the only way it can gate anything.
//
// These tests pin that difference. If ready ever starts returning 200 for a broken
// dependency, it has quietly become a second health endpoint and stops being useful.

const ORIGINAL_GW = process.env.API_GATEWAY_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_GW === undefined) delete process.env.API_GATEWAY_URL;
  else process.env.API_GATEWAY_URL = ORIGINAL_GW;
});

async function callGET() {
  const { GET } = await import('@/app/api/ready/route');
  const res = await GET();
  return { res, body: await res.json() };
}

describe('GET /api/ready', () => {
  it('503s when API_GATEWAY_URL is not set — unconfigured is not ready (P6)', async () => {
    // "No config" must never read as "fine". An app that does not know where its
    // gateway is cannot serve a signed-in user.
    delete process.env.API_GATEWAY_URL;
    vi.resetModules();
    const { res, body } = await callGET();
    expect(res.status).toBe(503);
    expect(body.ready).toBe(false);
    expect(body.checks[0].detail).toContain('API_GATEWAY_URL');
  });

  it('200s when the gateway answers', async () => {
    process.env.API_GATEWAY_URL = 'https://gw.example';
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    const { res, body } = await callGET();
    expect(res.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.status).toBe('ready');
  });

  it('503s when the gateway is unreachable — this is the difference from /api/health', async () => {
    process.env.API_GATEWAY_URL = 'https://gw.example';
    vi.resetModules();
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { res, body } = await callGET();
    expect(res.status).toBe(503);          // health returns 200 here, on purpose
    expect(body.ready).toBe(false);
    expect(body.checks[0].detail).toContain('ECONNREFUSED');
  });

  it('503s on a gateway error status, and says which', async () => {
    process.env.API_GATEWAY_URL = 'https://gw.example';
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502 } as unknown as Response);
    const { res, body } = await callGET();
    expect(res.status).toBe(503);
    expect(body.checks[0].detail).toBe('HTTP 502');
  });

  it('leaks no internal host in the body (NEW-A)', async () => {
    process.env.API_GATEWAY_URL = 'https://gateway.railway.internal';
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
    const { body } = await callGET();
    expect(JSON.stringify(body)).not.toContain('railway.internal');
  });
});
