import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Example domain BFF route — copy this pattern for your app's resources.
// CSRF is enforced in middleware; identity comes from the cookie, NEVER the body.
const GW = process.env.API_GATEWAY_URL ?? '';

const getUserId = (req: NextRequest): string => {
  try {
    const u = JSON.parse(decodeURIComponent(req.cookies.get('tec_user')?.value ?? ''));
    return u?.id ?? u?.sub ?? u?.piId ?? '';
  } catch { return ''; }
};

const gwHeaders = (token: string, userId: string) => ({
  'Content-Type':  'application/json',
  Authorization:   `Bearer ${token}`,
  'x-request-id':  crypto.randomUUID(),
  'x-user-id':     userId,
  ...(process.env.INTERNAL_SECRET && { 'x-internal-key': process.env.INTERNAL_SECRET }),
});

export async function GET(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const token  = req.cookies.get('tec_access_token')?.value ?? '';
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const res  = await fetch(`${GW}/api/items?limit=20`, { headers: gwHeaders(token, userId), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

const CreateItemSchema = z.object({
  name:       z.string().min(1),
  payment_id: z.string().min(1).optional(),  // link to an approved payment, if relevant
});

export async function POST(req: NextRequest) {
  if (!GW) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  const token  = req.cookies.get('tec_access_token')?.value ?? '';
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = CreateItemSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const res  = await fetch(`${GW}/api/items`, {
      method: 'POST', headers: gwHeaders(token, userId), body: JSON.stringify(parsed.data),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
