import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_SOURCE } from '@/lib/app-source';

// Feedback → the fleet's one inbox (tec-identity-service, /identity/feedback),
// through the gateway (App Excellence Standard E12). The person is the session's
// token — the service resolves it; this route names no user.
//
// The app label is set HERE, server-side, from APP_SOURCE; a client's is discarded.
// It is only a triage label — nothing is authorized on it — but a label anyone can
// set is a label nobody can sort by.
const GW = process.env.API_GATEWAY_URL ?? '';

const SubmitSchema = z.object({
  // Mirrors the service's bounds so an over-long message is refused before a
  // gateway hop. The SERVICE stays the authority (P5).
  message: z.string().trim().min(3).max(2000),
  page:    z.string().max(120).optional(),
});

async function forward(req: NextRequest, method: 'GET' | 'POST', path: string, body?: unknown) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const token = req.cookies.get('tec_access_token')?.value ?? '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const res = await fetch(`${GW}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
        'x-request-id': crypto.randomUUID(),
        ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
      },
      body:   body === undefined ? undefined : JSON.stringify(body),
      cache:  'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Feedback is unavailable right now' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const parsed = SubmitSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }
  // `app` last, so a client that sent one cannot override it.
  return forward(req, 'POST', '/api/identity/feedback', { ...parsed.data, app: APP_SOURCE });
}

/** The caller's own messages — so a person can see that theirs landed. */
export async function GET(req: NextRequest) {
  return forward(req, 'GET', '/api/identity/feedback/mine');
}
