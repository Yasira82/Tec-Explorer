import { NextResponse } from 'next/server';

export function isE2eMode(): boolean {
  return (
    process.env.E2E_MODE === 'true' ||
    process.env.NEXT_PUBLIC_E2E_MODE === 'true' ||
    (process.env.CI === 'true' && process.env.E2E_ALLOW_NETWORK !== 'true')
  );
}

export function e2eStub(status: number, extra?: Record<string, unknown>): NextResponse {
  const success = status >= 200 && status < 300;
  return NextResponse.json(
    { success, error: success ? undefined : 'e2e-stub', ...extra },
    { status },
  );
}
