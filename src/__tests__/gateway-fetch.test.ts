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

// A call from server code to another server is `fetch(`${SOMEWHERE}...`)`: the
// gateway (`${GW}/api/x`, or `${GW}${path}` in a shared helper), or a direct URL.
// It must have a deadline: go through gatewayFetch, or pass its own `signal`
// (health/ready probes do, with a short one). A call to this app's OWN origin
// (`${req.nextUrl.origin}/api/...`) is not one. Browser code (src/lib-client) never
// reaches the gateway (BFF-first) and is not searched.
//
// The first version of this test matched only `${...}/api/` and so missed every
// helper that builds the path in a variable — the whole BFF of seven apps
// (TEC-AUDIT-0033, found 14 Nov 2026). The self-check below holds both shapes.
const SERVER_FETCH = /(?<![\w.])fetch\(\s*`\$\{(?![^}]*\borigin\b)[^}]+\}/g;

/** The full argument list of the call that starts at `at` (balanced parentheses). */
const callAt = (text: string, at: number): string => {
  let depth = 0;
  for (let j = text.indexOf('(', at); j < text.length; j++) {
    if (text[j] === '(') depth++;
    else if (text[j] === ')' && --depth === 0) return text.slice(at, j + 1);
  }
  return text.slice(at);
};

const callsWithoutDeadline = (text: string): string[] =>
  [...text.matchAll(SERVER_FETCH)]
    .map((m) => callAt(text, m.index!))
    .filter((call) => !/\bsignal\b/.test(call));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'lib-client' ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });

describe('no server call without a deadline', () => {
  it('the search finds a bare call, in both shapes (self-check)', () => {
    expect(callsWithoutDeadline('await fetch(`${GW}/api/items`, {})')).toHaveLength(1);
    expect(callsWithoutDeadline('await fetch(`${GW}${gatewayPath}`, { headers: h(x) })')).toHaveLength(1);
    expect(callsWithoutDeadline('await fetch(`${BASE}/preview?u=${u}`, { cache: "no-store" })')).toHaveLength(1);
    expect(callsWithoutDeadline('await gatewayFetch(`${GW}${path}`, {})')).toEqual([]);
    expect(callsWithoutDeadline('await fetch(`${GW}/health`, { signal: AbortSignal.timeout(3000) })')).toEqual([]);
    expect(callsWithoutDeadline('await fetch(`${req.nextUrl.origin}/api/auth/refresh`, {})')).toEqual([]);
  });

  it('src/ has none', () => {
    const offenders = files(join(process.cwd(), 'src'))
      .filter((f) => !f.endsWith('lib/gateway-fetch.ts'))
      .flatMap((f) => callsWithoutDeadline(readFileSync(f, 'utf8')).map((c) => `${f.replace(process.cwd() + '/', '')}: ${c.slice(0, 60)}`));
    expect(offenders).toEqual([]);
  });
});
