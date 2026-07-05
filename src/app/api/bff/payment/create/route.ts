import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ── ADR-009 canonical payment contract — identical across all TEC apps ──
//   gateway path:  ${GW}/api/payment/create  (gateway rewrites ^/api/payment → /payments)
//   internal hdr:  x-internal-key + INTERNAL_SECRET  (the ONLY header the gateway validates)
//   amount:        number  (Zod coerces; forward Number)
// CSRF is enforced ONCE in middleware (double-submit OR first-party Origin).
// ⚠️ DO NOT add a CSRF check here — it 403's legit Mode-2 payments in Pi Browser. (KB C-12 §11)
const GW = process.env.API_GATEWAY_URL ?? '';

// TODO(new app): set your app slug — tags the payment in tec-payment-service.
const APP_SOURCE = 'app';

const CreateSchema = z.object({
  amount:   z.coerce.number().positive(),
  memo:     z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const getUserId = (req: NextRequest): string => {
  try {
    const raw = req.cookies.get('tec_user')?.value ?? '';
    const u   = JSON.parse(decodeURIComponent(raw));
    return u?.id ?? u?.sub ?? u?.piId ?? '';
  } catch { return ''; }
};

export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Gateway not configured' }, { status: 503 });

  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody = await req.json().catch(() => ({}));
  const parsed  = CreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  const { amount, memo, metadata } = parsed.data;

  const gwHeaders: Record<string, string> = {
    'Content-Type':    'application/json',
    Authorization:     `Bearer ${token}`,
    'Idempotency-Key': crypto.randomUUID(),
  };
  if (process.env.INTERNAL_SECRET) gwHeaders['x-internal-key'] = process.env.INTERNAL_SECRET;

  try {
    const res = await fetch(`${GW}/api/payment/create`, {
      method:  'POST',
      headers: gwHeaders,
      body: JSON.stringify({
        userId,
        amount:         Number(amount),
        currency:       'PI',
        payment_method: 'pi',
        memo,
        metadata:       { ...metadata, source: APP_SOURCE },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) console.error('[bff/payment/create] gateway error:', res.status, JSON.stringify(data));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[bff/payment/create] network error:', (err as Error).message);
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}
