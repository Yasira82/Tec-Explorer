import { z } from 'zod';
import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// ══════════════════════════════════════════════════════════════
//  BFF Handler Factory — v3
//  JWT cookie auth + KYC guard + Zod + structured errors
// ══════════════════════════════════════════════════════════════

// ─── Error Model ─────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code   = 'BAD_REQUEST',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor() { super('Unauthorized', 401, 'UNAUTHORIZED'); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(message, 403, 'FORBIDDEN'); }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') { super(`${resource} not found`, 404, 'NOT_FOUND'); }
}

// ─── Context ──────────────────────────────────────────────────

export interface BFFContext {
  userId:      string;
  kycVerified: boolean;
  requestId:   string;
}

// ─── Auth Extractor ───────────────────────────────────────────

async function extractContext(req: NextRequest): Promise<BFFContext> {
  const token = req.cookies.get('tec_access_token')?.value;
  if (!token) throw new UnauthorizedError();

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  try {
    const encoded       = new TextEncoder().encode(secret);
    const { payload }   = await jwtVerify(token, encoded, {
      algorithms: ['HS256'],
    });

    const userId = payload.sub;
    if (!userId) throw new UnauthorizedError();

    return {
      userId,
      kycVerified: (payload as Record<string, unknown>).kycVerified === true,
      requestId:   req.headers.get('x-request-id') ?? crypto.randomUUID(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new UnauthorizedError();
  }
}

// ─── Handler Config ───────────────────────────────────────────

export interface HandlerConfig<TInput, TOutput> {
  schema?:      z.ZodSchema<TInput>;
  requireAuth?: boolean;  // default: true
  requireKYC?:  boolean;  // default: false
  handler: (args: {
    input: TInput;
    ctx:   BFFContext;
    req:   NextRequest;
  }) => Promise<TOutput>;
}

// ─── Factory ──────────────────────────────────────────────────

export function createHandler<TInput = Record<string, never>, TOutput = unknown>(
  config: HandlerConfig<TInput, TOutput>,
) {
  return async (req: NextRequest): Promise<Response> => {
    const startMs = Date.now();
    let ctx: BFFContext = { userId: 'anonymous', kycVerified: false, requestId: crypto.randomUUID() };

    try {
      // 1) Auth
      if (config.requireAuth !== false) {
        ctx = await extractContext(req);
      }

      // 2) KYC guard
      if (config.requireKYC && !ctx.kycVerified) {
        throw new ForbiddenError('KYC_REQUIRED');
      }

      // 3) Parse + validate body
      let input: TInput = {} as TInput;
      if (config.schema) {
        let body: unknown = {};
        try { body = await req.json(); } catch { /* empty body ok */ }
        input = config.schema.parse(body);
      }

      // 4) Execute handler
      const result = await config.handler({ input, ctx, req });

      // 5) Log success
      console.info('[BFF]', {
        path:      req.nextUrl.pathname,
        method:    req.method,
        userId:    ctx.userId,
        requestId: ctx.requestId,
        ms:        Date.now() - startMs,
        status:    200,
      });

      return Response.json(result, {
        headers: { 'X-Request-Id': ctx.requestId },
      });

    } catch (err) {
      // Zod validation error
      if (err instanceof z.ZodError) {
        console.warn('[BFF] Validation error', {
          path:      req.nextUrl.pathname,
          requestId: ctx.requestId,
          errors:    err.flatten(),
        });
        return Response.json(
          { error: 'VALIDATION_ERROR', details: err.flatten() },
          { status: 400, headers: { 'X-Request-Id': ctx.requestId } },
        );
      }

      // Known app error
      if (err instanceof AppError) {
        console.warn('[BFF] App error', {
          path:      req.nextUrl.pathname,
          requestId: ctx.requestId,
          code:      err.code,
          message:   err.message,
        });
        return Response.json(
          { error: err.code, message: err.message },
          { status: err.status, headers: { 'X-Request-Id': ctx.requestId } },
        );
      }

      // Unknown error
      console.error('[BFF] Unexpected error', {
        path:      req.nextUrl.pathname,
        requestId: ctx.requestId,
        err,
      });
      return Response.json(
        { error: 'INTERNAL_ERROR', message: 'Something went wrong' },
        { status: 500, headers: { 'X-Request-Id': ctx.requestId } },
      );
    }
  };
}
