/**
 * The one way a BFF route calls the API gateway — `fetch` with a deadline
 * (TEC-AUDIT-0033).
 *
 * Before this, 439 of 467 gateway calls across the fleet had none. When the
 * gateway itself was the slow part (the "Backend Offline" freeze, NEW-W) every
 * pending call waited until the platform killed the function, and the screen
 * spun instead of showing "try again". With a deadline the call fails in time,
 * as an error the route's own `catch` already turns into a 5xx.
 *
 * Same signature and result as `fetch`. A caller's own `signal`, if any, still
 * works — whichever fires first aborts. A timeout rejects with a DOMException
 * named `TimeoutError`; `isGatewayTimeout()` tells it apart.
 */
//
// The deadline sits just PAST the gateway's own: the gateway answers 504 after
// 25 s (main.ts) and its proxy gives up on a service after 15 s, so while the
// gateway is alive its answer always arrives first and nothing it would still
// complete is cut — a payment approve included. This deadline only fires when the
// gateway cannot answer at all. TEC AI's chat waits up to 75 s at the gateway
// (AI_PROXY_TIMEOUT_MS), so an `/ai/` path gets the longer one.
export const GATEWAY_TIMEOUT_MS = 30_000;
export const GATEWAY_AI_TIMEOUT_MS = 90_000;

const deadlineFor = (input: string | URL): number =>
  /\/ai\//.test(String(input)) ? GATEWAY_AI_TIMEOUT_MS : GATEWAY_TIMEOUT_MS;

export function gatewayFetch(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number = deadlineFor(input),
): Promise<Response> {
  // A plain timer (not AbortSignal.timeout) so the deadline is cleared once the
  // call settles and runs on the same clock as everything else, tests included.
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new DOMException(`gateway did not answer in ${timeoutMs} ms`, 'TimeoutError')),
    timeoutMs,
  );
  const signal = init.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
}

export const isGatewayTimeout = (err: unknown): boolean =>
  err instanceof Error && err.name === 'TimeoutError';
