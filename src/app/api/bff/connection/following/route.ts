import { NextRequest, NextResponse } from 'next/server';

// TEC Connect (C-107 §14.3) — following someone from inside Explorer.
//
// 🔴 This route is the whole reason the feature is possible here.
//
// `explorer.tecosystem.app` and `connection.tecosystem.app` are SEPARATE
// ORIGINS: they do not share a cookie jar. A Follow button that called
// Connection's API from the browser would be a third-party credentialed
// request — the exact case C-123 documents Pi Browser breaking (Partitioned
// cookies; `Set-Cookie` dropped on XHR and on 3xx). It would work in Chrome and
// fail in Pi Browser, which is the worst kind of failure: it passes every test.
//
// So the button calls THIS route — same origin as far as the browser is
// concerned — and the server calls the gateway with the session token. The graph
// stays owned by Connection (C-107 §4); Explorer only asks.
//
// CSRF is enforced ONCE in middleware (C-12 §11) — never here.
const GW = process.env.API_GATEWAY_URL ?? '';

const headers = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  'x-request-id': crypto.randomUUID(),
  ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
});

const token = (req: NextRequest) => req.cookies.get('tec_access_token')?.value ?? '';

/** Who the caller already follows — so the button can say "Following" on arrival. */
export async function GET(req: NextRequest) {
  const tok = token(req);
  // Not signed in is not an error here: the page is public, and the button
  // simply offers to sign in. An empty list is the honest answer.
  if (!GW || !tok) return NextResponse.json({ following: [] });
  try {
    const res = await fetch(`${GW}/api/identity/connection/following`, {
      headers: headers(tok), cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ following: [] });
    const d = (await res.json().catch(() => ({})))?.data;
    const list = Array.isArray(d?.following) ? d.following : [];
    return NextResponse.json({
      following: list.map((f: unknown) =>
        typeof f === 'string' ? f : String((f as { username?: unknown })?.username ?? '')),
    });
  } catch {
    return NextResponse.json({ following: [] });
  }
}

/** Follow a Pi username. The FOLLOWER is the session, resolved server-side (P6). */
export async function POST(req: NextRequest) {
  const tok = token(req);
  if (!tok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const username = String(body?.username ?? '').trim().replace(/^@+/, '');
  if (!username) return NextResponse.json({ error: 'username is required' }, { status: 400 });

  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  try {
    const res = await fetch(`${GW}/api/identity/connection/follow`, {
      method: 'POST', headers: headers(tok), body: JSON.stringify({ username }), cache: 'no-store',
    });
    // 409 is "already following" — from where the caller stands that is a
    // success, and reporting it as an error would be a lie about their own graph.
    if (!res.ok && res.status !== 409) {
      return NextResponse.json({ error: 'Could not follow.' }, { status: res.status });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
