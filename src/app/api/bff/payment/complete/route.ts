import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// CSRF enforced ONCE in middleware (double-submit OR first-party Origin).
// ⚠️ DO NOT add a route-level CSRF check here. (KB C-12 §11; CI guard blocks it.)
const GW = process.env.API_GATEWAY_URL ?? '';

const CompleteSchema = z.object({
  payment_id:     z.string().min(1),
  transaction_id: z.string().min(1),
  pi_payment_id:  z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw    = await req.json().catch(() => ({}));
  const parsed = CompleteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  const gwHeaders: Record<string, string> = {
    'Content-Type':    'application/json',
    Authorization:     `Bearer ${token}`,
    'Idempotency-Key': crypto.randomUUID(),
  };
  if (process.env.INTERNAL_SECRET) gwHeaders['x-internal-key'] = process.env.INTERNAL_SECRET;

  try {
    const res  = await fetch(`${GW}/api/payment/complete`, {
      method:  'POST',
      headers: gwHeaders,
      body:    JSON.stringify(parsed.data),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.error('[bff/payment/complete] error:', res.status, data?.code ?? 'UNKNOWN');
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[bff/payment/complete] network error:', (err as Error).message);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
