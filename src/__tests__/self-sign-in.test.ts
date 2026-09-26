/**
 * An app opened without a TEC session signs itself in with its own Pi handshake.
 *
 * Seen on a phone (2026-09-25): an app opened from the Quest or the campaign
 * rendered `/app`, and `/api/auth/me` answered `no_token` — "Not signed in" on
 * the app the pioneer had just been sent to. These pin both halves: the route
 * that turns Pi's token into a one-time sign-in token, and the client that
 * decides when to use it — and, above all, that it can never loop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = 'test-sso-secret-at-least-32-characters-long';

describe('POST /api/auth/pi-login', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.API_GATEWAY_URL = 'https://gw.internal';
    process.env.SSO_SECRET      = SECRET;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const post = async (body: unknown) => {
    const { POST } = await import('../app/api/auth/pi-login/route');
    return POST(new NextRequest('https://app.tecosystem.app/api/auth/pi-login', {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    }));
  };

  it('exchanges Pi\'s token for a one-time token addressed to THIS origin', async () => {
    const gateway = vi.fn(async () => new Response(JSON.stringify({
      tokens: { accessToken: 'tec-at', refreshToken: 'tec-rt' },
      user:   { id: 'u1', piUsername: 'pioneer' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', gateway);

    const res  = await post({ accessToken: 'pi-token' });
    expect(res.status).toBe(200);
    const { ssoToken } = await res.json();

    const { payload } = await jwtVerify(ssoToken, new TextEncoder().encode(SECRET), {
      issuer: 'tec.pi', audience: 'https://app.tecosystem.app',
    });
    expect(payload.accessToken).toBe('tec-at');
    expect((payload.user as { piUsername: string }).piUsername).toBe('pioneer');
    expect(payload.jti).toBeTruthy();
  });

  it('sets NO cookies itself — an XHR cookie is the one C-123 LAW 1 says gets dropped', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tokens: { accessToken: 'a', refreshToken: 'r' }, user: { id: 'u' },
    }), { status: 200 })));
    const res = await post({ accessToken: 'pi-token' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('does not send scopes, so the Hub\'s recorded consent is never overwritten', async () => {
    const gateway = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({
      tokens: { accessToken: 'a' }, user: { id: 'u' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', gateway);
    await post({ accessToken: 'pi-token' });
    const [url, init] = gateway.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://gw.internal/api/v1/auth/pi-login');
    expect(JSON.parse(String(init.body))).toEqual({ accessToken: 'pi-token' });
  });

  it('fails closed: refused by auth, or no user in the answer, is not a session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    expect((await post({ accessToken: 'pi-token' })).status).toBe(401);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tokens: { accessToken: 'a' } }), { status: 200 })));
    expect((await post({ accessToken: 'pi-token' })).status).toBe(502);
  });

  it('refuses a request with no Pi token, and says so when unconfigured', async () => {
    expect((await post({})).status).toBe(400);
    delete process.env.SSO_SECRET;
    expect((await post({ accessToken: 'pi-token' })).status).toBe(503);
  });
});

describe('selfSignIn()', () => {
  const replace = vi.fn();
  let calls: string[];

  const load = async (opts: { me: number; pi: string | null; login?: Response | null }) => {
    vi.resetModules();
    calls = [];
    vi.doMock('../lib/pi/pi-session', () => ({
      piSession: {
        ensureAuth:  vi.fn(async () => opts.pi !== null),
        get accessToken() { return opts.pi; },
      },
    }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url === '/api/auth/me') return new Response('{}', { status: opts.me });
      if (url === '/api/auth/pi-login') {
        if (opts.login === null) throw new Error('network');
        return opts.login ?? new Response(JSON.stringify({ ssoToken: 'one-time' }), { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    }));
    return (await import('../lib/pi/self-sign-in')).selfSignIn;
  };

  beforeEach(() => {
    sessionStorage.clear();
    replace.mockReset();
    delete (window as unknown as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/app', search: '?q=1', replace },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../lib/pi/pi-session'); });

  it('with no session, signs in and returns to exactly where the visitor was', async () => {
    const selfSignIn = await load({ me: 401, pi: 'pi-token' });
    expect(await selfSignIn(1_000)).toBe('navigating');
    expect(replace).toHaveBeenCalledWith(
      '/api/auth/sso-callback?token=one-time&redirect=%2Fapp%3Fq%3D1',
    );
  });

  it('does nothing when a session already exists', async () => {
    const selfSignIn = await load({ me: 200, pi: 'pi-token' });
    expect(await selfSignIn()).toBe('has-session');
    expect(calls).toEqual(['/api/auth/me']);
  });

  it('does nothing in a Hub-owned Pi session (ADR-007) — not even ask /me', async () => {
    (window as unknown as { __TEC_PI_FOREIGN_SESSION?: boolean }).__TEC_PI_FOREIGN_SESSION = true;
    const selfSignIn = await load({ me: 401, pi: 'pi-token' });
    expect(await selfSignIn()).toBe('foreign-session');
    expect(calls).toEqual([]);
  });

  it('does not start on a /me failure that is not a definite "no session"', async () => {
    const selfSignIn = await load({ me: 500, pi: 'pi-token' });
    expect(await selfSignIn()).toBe('has-session');
    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing without a Pi handshake (outside Pi Browser)', async () => {
    const selfSignIn = await load({ me: 401, pi: null });
    expect(await selfSignIn()).toBe('no-pi');
    expect(calls).not.toContain('/api/auth/pi-login');
  });

  it('CANNOT LOOP: a second no-session page in the same tab does not try again', async () => {
    // The context refused the cookies: the landing came back, /me still says no.
    let selfSignIn = await load({ me: 401, pi: 'pi-token' });
    expect(await selfSignIn(1_000)).toBe('navigating');
    selfSignIn = await load({ me: 401, pi: 'pi-token' });
    expect(await selfSignIn(2_000)).toBe('already-tried');
    expect(replace).toHaveBeenCalledTimes(1);
    // …and is allowed again only after the window, so a later visit can recover.
    selfSignIn = await load({ me: 401, pi: 'pi-token' });
    expect(await selfSignIn(1_000 + 10 * 60 * 1000 + 1)).toBe('navigating');
  });

  it('a refused or unreachable sign-in leaves the page as it is', async () => {
    let selfSignIn = await load({ me: 401, pi: 'pi-token', login: new Response('{}', { status: 401 }) });
    expect(await selfSignIn()).toBe('refused');
    sessionStorage.clear();
    selfSignIn = await load({ me: 401, pi: 'pi-token', login: null });
    expect(await selfSignIn()).toBe('refused');
    expect(replace).not.toHaveBeenCalled();
  });

  it('without sessionStorage there is no loop guard, so it does not start', async () => {
    const selfSignIn = await load({ me: 401, pi: 'pi-token' });
    // A context with site data blocked throws on ACCESS, not on a method call.
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true, get: () => { throw new Error('blocked'); },
    });
    try {
      expect(await selfSignIn()).toBe('already-tried');
      expect(replace).not.toHaveBeenCalled();
    } finally {
      if (real) Object.defineProperty(window, 'sessionStorage', real);
    }
  });
});

describe('middleware', () => {
  it('guards /api/auth/pi-login against a cross-site POST (login CSRF)', async () => {
    const { middleware } = await import('../middleware');
    const res = middleware(new NextRequest('https://app.tecosystem.app/api/auth/pi-login', {
      method: 'POST', headers: { origin: 'https://evil.example' },
    }));
    expect(res.status).toBe(403);
  });
});
