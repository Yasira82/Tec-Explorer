import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gatewayFetch, isGatewayTimeout } from '@/lib/gateway-fetch';

/**
 * TEC-AUDIT-0033 — every call from this app's server code to the gateway has a
 * deadline. Two halves: the helper does what it says, and nothing bypasses it.
 */
afterEach(() => vi.unstubAllGlobals());

const hangingFetch = () =>
  vi.fn((_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
  }));

describe('gatewayFetch', () => {
  it('gives up on a gateway that never answers', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const err = await gatewayFetch('https://gw.test/api/x', {}, 30).catch((e) => e);
    expect(isGatewayTimeout(err)).toBe(true);
  });

  it("keeps the caller's own signal working", async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const ac = new AbortController();
    const p = gatewayFetch('https://gw.test/api/x', { signal: ac.signal }, 60_000).catch((e) => e);
    ac.abort();
    expect(isGatewayTimeout(await p)).toBe(false);
  });

  it("waits past the gateway's own 504 (25 s), and longer for TEC AI", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', hangingFetch());
      let gaveUp = false;
      void gatewayFetch('https://gw.test/api/payments/approve').catch(() => { gaveUp = true; });
      await vi.advanceTimersByTimeAsync(26_000);
      expect(gaveUp).toBe(false);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(gaveUp).toBe(true);

      let aiGaveUp = false;
      void gatewayFetch('https://gw.test/api/identity/ai/chat').catch(() => { aiGaveUp = true; });
      await vi.advanceTimersByTimeAsync(80_000);
      expect(aiGaveUp).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('passes the request through unchanged otherwise', async () => {
    const f = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', f);
    const res = await gatewayFetch('https://gw.test/api/x', { method: 'POST', body: 'b' });
    expect(res.status).toBe(201);
    expect(f.mock.calls[0]![1]).toMatchObject({ method: 'POST', body: 'b' });
  });
});

// A call to the gateway is `fetch(`${...}/api/...`)` in server code. A call to
// this app's OWN origin (`${req.nextUrl.origin}/api/...`) is not one, and is left
// alone. The search was shown to find before its silence is trusted: see the
// self-check below.
const GATEWAY_FETCH = /(?<![\w.])fetch\(\s*`\$\{(?![^}]*\borigin\b)[^}]+\}\/api\//g;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });

describe('no gateway call without a deadline', () => {
  it('the search finds a bare call (self-check)', () => {
    expect('await fetch(`${GW}/api/items`, {})'.match(GATEWAY_FETCH)).toHaveLength(1);
    expect('await gatewayFetch(`${GW}/api/items`, {})'.match(GATEWAY_FETCH)).toBeNull();
    expect('await fetch(`${req.nextUrl.origin}/api/auth/refresh`, {})'.match(GATEWAY_FETCH)).toBeNull();
  });

  it('src/ has none', () => {
    const offenders = files(join(process.cwd(), 'src'))
      .filter((f) => !f.endsWith('lib/gateway-fetch.ts'))
      .flatMap((f) => (readFileSync(f, 'utf8').match(GATEWAY_FETCH) ?? []).map(() => f.replace(process.cwd() + '/', '')));
    expect(offenders).toEqual([]);
  });
});
