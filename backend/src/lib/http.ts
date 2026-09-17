import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env, Variables } from '../env';

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'validation_failed'
  | 'replay_rejected'
  | 'payload_too_large'
  | 'internal_error'
  | 'service_unavailable'
  | 'maintenance';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  validation_failed: 422,
  replay_rejected: 422,
  payload_too_large: 413,
  internal_error: 500,
  service_unavailable: 503,
  maintenance: 503,
};

/** Throwable API error that carries a stable machine-readable code. */
export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;
  headers?: Record<string, string>;

  constructor(code: ErrorCode, message: string, options: { details?: unknown; headers?: Record<string, string>; status?: number } = {}) {
    super(message);
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.details = options.details;
    this.headers = options.headers;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError('bad_request', message, { details });
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError('unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError('forbidden', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError('not_found', message);
  }
  static conflict(message: string, details?: unknown) {
    return new ApiError('conflict', message, { details });
  }
  static validation(message: string, details?: unknown) {
    return new ApiError('validation_failed', message, { details });
  }
  static rateLimited(message = 'Too many requests', retryAfterSeconds = 60) {
    return new ApiError('rate_limited', message, {
      headers: { 'Retry-After': String(retryAfterSeconds) },
    });
  }
}

export interface ApiMeta {
  requestId: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  cached?: boolean;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  meta: ApiMeta;
  error?: { code: ErrorCode; message: string; details?: unknown };
}

/** Successful JSON response in the API's standard envelope. */
export function ok<T>(c: Context<{ Bindings: Env; Variables: Variables }>, data: T, meta: Partial<ApiMeta> = {}, init: ResponseInit = {}) {
  const body: ApiEnvelope<T> = {
    ok: true,
    data,
    meta: { requestId: c.get('requestId'), ...meta },
  };
  return c.json(body, (init.status ?? 200) as ContentfulStatusCode, withHeaders(init.headers));
}

export function errorResponse(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  error: ApiError,
) {
  const body: ApiEnvelope<null> = {
    ok: false,
    data: null,
    meta: { requestId: c.get('requestId') },
    error: { code: error.code, message: error.message, details: error.details },
  };
  return c.json(body, error.status as ContentfulStatusCode, withHeaders(error.headers));
}

function withHeaders(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

/* ---------------------------------- CORS ---------------------------------- */

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Origin allow-list. Vercel preview deployments use generated hostnames, so
 * they are matched by suffix when the environment is not production.
 */
export function isOriginAllowed(env: Env, origin: string | null): boolean {
  if (!origin) return false;
  const list = allowedOrigins(env);
  if (list.includes('*')) return true;
  if (list.includes(origin)) return true;
  if (env.ENVIRONMENT !== 'production') {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
      if (url.hostname.endsWith('.workers.dev') || url.hostname.endsWith('.e2b.app')) return true;
      if (url.hostname.endsWith('.vercel.app')) return true;
    } catch {
      return false;
    }
  } else {
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith('.vercel.app')) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id,X-Client-Version',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && isOriginAllowed(env, origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Expose-Headers'] = 'X-Request-Id';
  }
  return headers;
}

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

/* ------------------------------- pagination ------------------------------- */

export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePage(url: string, defaultSize = 25, maxSize = 100): PageParams {
  const params = new URL(url).searchParams;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(params.get('page') ?? '1', 10) || 1));
  const requested = Number.parseInt(params.get('pageSize') ?? String(defaultSize), 10) || defaultSize;
  const pageSize = Math.max(1, Math.min(maxSize, requested));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageMeta(page: PageParams, total: number, extra: Partial<ApiMeta> = {}): Partial<ApiMeta> {
  return {
    page: page.page,
    pageSize: page.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
    ...extra,
  };
}

/** Reject oversized bodies before we try to parse them. */
export function assertBodySize(request: Request, maxBytes: number) {
  const header = request.headers.get('content-length');
  if (header && Number.parseInt(header, 10) > maxBytes) {
    throw new ApiError('payload_too_large', `Request body exceeds ${maxBytes} bytes`);
  }
}
