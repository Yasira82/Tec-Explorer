import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify }     from 'jose';
import { createHandler } from '@/lib/bff/createHandler';
import { APP_SOURCE }    from '@/lib/app-source';
import { log }           from '@/lib/observability/logger';

const GATEWAY = process.env.API_GATEWAY_URL ?? '';

/**
 * POST /api/bff/pioneer/arrived — tell the platform a pioneer reached THIS app.
 *
 * ── The problem this exists to fix ─────────────────────────────────────────
 *
 * The Hub records a campaign visit the instant a mission link is TAPPED. The
 * tap and the arrival are two independent events: the record succeeds whether
 * or not this app ever loaded, so a closed tab, a dead link, or an app that is
 * down all count exactly like a visit.
 *
 * That is not mainly a fraud problem — it is an accuracy one, and an expensive
 * one. Pi accepts a `.pi` domain claim only once the app has 5 unique KYC'd
 * pioneers *engage with the app*, measured AT THE APP. Counting taps means the
 * platform's number and Pi's number measure different things, and a reward
 * campaign can be paid out in full without moving the one it exists to move.
 *
 * ── Why the slug is not in the request ─────────────────────────────────────
 *
 * `APP_SOURCE` is a server constant in this deployment, the same one the
 * payment routes use. It is NOT read from the body, and that is the property
 * that matters: a browser cannot choose which app to credit. The Zone
 * deployment can only ever say "zone".
 *
 * ── The two credentials ────────────────────────────────────────────────────
 *
 * The user's token answers WHO — identity-service takes the owner from the
 * verified claim and never from a field (P6). `x-internal-key` answers that a
 * SERVER called: the Hub's tap endpoint is reachable from a page, this one is
 * not, so the record means a real deployment ran for a real session.
 *
 * ── It never fails the page ────────────────────────────────────────────────
 *
 * Returns `{ recorded: false }` instead of throwing. Nobody asked for this
 * request; it is bookkeeping the platform wants, and bookkeeping that can break
 * somebody's visit is worse than bookkeeping that is occasionally missing. A
 * missing arrival costs one uncounted visit — a thrown error costs the visit
 * itself.
 */
export const POST = createHandler({
  requireAuth: true,
  handler: async ({ ctx, req }) => {
    const secret = process.env.INTERNAL_SECRET ?? '';
    // Unconfigured is not an error worth surfacing here — it means this
    // deployment cannot vouch for anything, and the campaign falls back to the
    // Hub's tap exactly as it did before.
    if (!GATEWAY || !secret) {
      // Said in the log, not only in the response: a deployment missing its
      // gateway or key cannot count a single arrival, and the coverage screen
      // shows that only as a zero. Insure sat at 0/5 with nine pioneers opening
      // it, and nothing anywhere said why.
      log.warn('pioneer.arrival_not_configured', { app: APP_SOURCE, requestId: ctx.requestId });
      return { recorded: false, reason: 'not-configured' };
    }

    try {
      const res = await fetch(`${GATEWAY}/api/identity/pioneer/arrived`, {
        method: 'POST',
        headers: {
          Authorization:    `Bearer ${req.cookies.get('tec_access_token')?.value ?? ''}`,
          'Content-Type':   'application/json',
          'x-internal-key': secret,
          'x-request-id':   ctx.requestId,
        },
        // The slug comes from server code. See the note above — this is the
        // whole reason a browser cannot credit an app it never opened.
        body:  JSON.stringify({ app: APP_SOURCE }),
        cache: 'no-store',
      });
      if (res.ok) return { recorded: true };
      // The status is the whole diagnosis — 401 is the token, 403 the internal
      // key, 404 a gateway without the route. `recorded: false` alone named none
      // of them.
      log.warn('pioneer.arrival_rejected', { app: APP_SOURCE, status: res.status, requestId: ctx.requestId });
      return { recorded: false, reason: `gateway_${res.status}` };
    } catch {
      log.warn('pioneer.arrival_unreachable', { app: APP_SOURCE, requestId: ctx.requestId });
      return { recorded: false, reason: 'unreachable' };
    }
  },
});

/**
 * GET /api/bff/pioneer/arrived — can this deployment count an arrival for YOU?
 *
 * Read-only, and made to be opened by hand on the phone that is not being
 * counted. It answers the three questions a zero on the coverage screen cannot:
 * is this deployment wired to the gateway, did this browser send a session, and
 * is the token in it still good. Booleans only — never a value, a length, or a
 * claim out of the token — and it records nothing: a GET that wrote an arrival
 * would let a link preview count as a visit.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get('tec_access_token')?.value ?? '';
  const user  = req.cookies.get('tec_user')?.value ?? '';

  let tokenValid = false;
  const jwtSecret = process.env.JWT_SECRET;
  if (token && jwtSecret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(jwtSecret), { algorithms: ['HS256'] });
      tokenValid = true;
    } catch { /* ignore */
      // Expired or foreign — which is exactly the answer being asked for.
    }
  }

  return NextResponse.json(
    {
      app:        APP_SOURCE,
      configured: Boolean(GATEWAY && process.env.INTERNAL_SECRET),
      session:    { token: token !== '', user: user !== '', tokenValid },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
