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

// Every call from server code to another server must have a deadline: to the
// gateway through gatewayFetch, anything else (object storage, a price feed) with
// its own `signal`. Exempt: a relative URL or this app's OWN origin
// (`${req.nextUrl.origin}/api/...`), a 'use client' file, and src/lib-client —
// browser code never reaches the gateway (BFF-first).
//
// History (TEC-AUDIT-0033): the first version matched only `${X}/api/` and missed
// every helper that builds the URL first — `${GW}${path}`, `fetch(url, …)`,
// `fetch(BASE, …)` — the whole BFF of seven apps and the shared GET helper of three
// (found 14 Nov 2026). So this matches EVERY fetch( and decides by its arguments;
// the self-check holds each shape.
const FETCH = /(?<![\w.])fetch\(/g;
const EXEMPT_URL = /^\s*(['"`]\/|`\$\{[^}]*\borigin\b|new URL\(\s*['"`]\/)/;

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
  /^\s*['"]use client['"]/.test(text) ? [] :
  [...text.matchAll(FETCH)]
    .map((m) => callAt(text, m.index!))
    .filter((call) => !/\bsignal\b/.test(call) && !EXEMPT_URL.test(call.slice(call.indexOf('(') + 1)));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'lib-client' ? [] : files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.(test|spec)\./.test(n) ? [p] : [];
  });

describe('no server call without a deadline', () => {
  it('the search finds a bare call, in every shape (self-check)', () => {
    for (const bare of [
      'await fetch(`${GW}/api/items`, {})',
      'await fetch(`${GW}${gatewayPath}`, { headers: h(x) })',
      'await fetch(`${BASE}/preview?u=${u}`, { cache: "no-store" })',
      'const attempt = () => fetch(url, { ...init, method: "GET" })',
      'await fetch(BASE, { method: "POST" })',
      'await fetch(uploadUrl, { method: "PUT", body })',
      'await fetch("https://prices.example/ticker", {})',
    ]) expect(callsWithoutDeadline(bare)).toHaveLength(1);
    for (const fine of [
      'await gatewayFetch(`${GW}${path}`, {})',
      'await fetch(`${GW}/health`, { signal: AbortSignal.timeout(3000) })',
      'await fetch(`${req.nextUrl.origin}/api/auth/refresh`, {})',
      "await fetch('/api/bff/items', { credentials: 'include' })",
      "'use client';\nawait fetch(url)",
    ]) expect(callsWithoutDeadline(fine)).toEqual([]);
  });

  it('src/ has none', () => {
    const offenders = files(join(process.cwd(), 'src'))
      .filter((f) => !f.endsWith('lib/gateway-fetch.ts'))
      .flatMap((f) => callsWithoutDeadline(readFileSync(f, 'utf8')).map((c) => `${f.replace(process.cwd() + '/', '')}: ${c.slice(0, 60)}`));
    expect(offenders).toEqual([]);
  });
});
