// Error reporter — Sentry-ready single swap-point (Template v2).
//
// Today it emits a structured error via the logger (so failures are never silent —
// C-96). When you adopt Sentry, wire Sentry.captureException HERE only; every
// call site (`reportError(err, { where })`) stays unchanged. This avoids hard-
// depending on @sentry/nextjs in the template (the platform hit Sentry v8/v10
// version drift — keep the dep out of the golden template, add per-app if needed).

import { log } from './logger';

export function reportError(err: unknown, context?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log.error(message, { ...context, stack });

  // ── Sentry adoption point (per app): ───────────────────────────────
  // import * as Sentry from '@sentry/nextjs';
  // if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.captureException(err, { extra: context });
}
