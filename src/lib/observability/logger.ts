// Minimal structured (JSON) logger — observability by default (Template v2).
//
// Zero-dependency on purpose: emits one JSON object per line (Pino-compatible shape:
// level/time/msg + fields) so any app inherits structured logs that ship straight to
// a log drain without per-app wiring. Swap for full Pino later without changing callers.
//
// A silent error handler is an invisible failure (C-96). Use log.error in catch blocks
// so failures become evidence, never get swallowed.

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN: Level = (process.env.LOG_LEVEL as Level) ?? 'info';

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[MIN]) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg,
    ...(fields ?? {}),
  });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};
