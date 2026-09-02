import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/observability/reportError';

// Report abusive content (C-108), proxied through this app's own BFF.
//
// A session is required: an anonymous report is a report from nobody, and the
// one-per-person rule that keeps the count honest needs a person to key on.
//
// The reporter's identity, the author of the reported content, and a snapshot of
// it are ALL resolved on the backend from the token and the target — none of the
// three is accepted from this request. A client that could name the author would
// be able to aim the moderation queue at a rival (P6).
export const dynamic = 'force-dynamic';

const GW = process.env.API_GATEWAY_URL ?? '';

export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const token = req.cookies.get('tec_access_token')?.value ?? '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${GW}/api/identity/explorer/report`, {
      method: 'POST', cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-request-id': crypto.randomUUID(),
        ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
      },
      body: JSON.stringify({
        targetKind: body?.targetKind,
        targetId:   body?.targetId,
        reason:     body?.reason,
        note:       body?.note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: String(data?.message ?? data?.error ?? 'Could not send your report.') },
        { status: res.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Reported, not swallowed. A moderation path that fails silently means
    // abuse reports quietly stop arriving and nobody finds out (C-96).
    reportError(err, { where: 'bff/explorer/report' });
    return NextResponse.json({ error: 'Network error' }, { status: 502 });
  }
}
