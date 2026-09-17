import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../env';
import { ApiError, assertBodySize, corsHeaders, isOriginAllowed, SECURITY_HEADERS } from './http';
import { getPlayerById, invalidatePlayer, touchPlayer } from '../services/players';
import { isSessionRevoked, softRateLimit, verifyAccessToken } from './security';
import { newId, sha256Hex } from './core';

export type AppContext = { Bindings: Env; Variables: Variables };

/* ------------------------------- request id ------------------------------- */

export const requestContext: MiddlewareHandler<AppContext> = async (c, next) => {
  const incoming = c.req.header('X-Request-Id');
  const requestId = incoming && /^[A-Za-z0-9_-]{6,64}$/.test(incoming) ? incoming : newId('req_');
  c.set('requestId', requestId);
  c.set('startedAt', Date.now());
  c.set('player', null);

  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown';
  c.set('ipHash', (await sha256Hex(`ip:${ip}:${c.env.ENVIRONMENT}`)).slice(0, 32));
  c.set('origin', c.req.header('Origin') ?? null);

  await next();

  c.header('X-Request-Id', requestId);
  const duration = Date.now() - c.get('startedAt');
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) c.header(key, value);
  const origin = c.get('origin');
  if (origin) {
    for (const [key, value] of Object.entries(corsHeaders(c.env, origin))) c.header(key, value);
  }
  const line = JSON.stringify({
    level: c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info',
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs: duration,
    environment: c.env.ENVIRONMENT,
  });
  if (c.res.status >= 500) console.error(line);
  else if (c.res.status >= 400) console.warn(line);
  else if (c.req.method !== 'OPTIONS') console.log(line);
};

/* ---------------------------------- CORS ---------------------------------- */

export const corsMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const origin = c.req.header('Origin') ?? null;
  if (c.req.method === 'OPTIONS') {
    const headers = corsHeaders(c.env, origin);
    if (origin && !isOriginAllowed(c.env, origin)) {
      return new Response(null, { status: 403, headers });
    }
    return new Response(null, { status: 204, headers });
  }
  if (origin && !isOriginAllowed(c.env, origin)) {
    // Blocked origins get a plain 403 for state changing calls; read-only calls
    // still work but without CORS headers (browsers will refuse the response).
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      throw ApiError.forbidden('Origin is not allowed to call this API');
    }
  }
  await next();
};

/* ------------------------------ body limits ------------------------------- */

export function bodyLimit(maxBytes: number): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    assertBodySize(c.req.raw, maxBytes);
    await next();
  };
}

/* ------------------------------- soft limits ------------------------------ */

export function rateLimit(scope: string, limit: number, windowSeconds: number): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const key = c.get('player')?.id ?? c.get('ipHash');
    const result = await softRateLimit(c.env, scope, key, limit, windowSeconds);
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      throw ApiError.rateLimited(`Rate limit exceeded for ${scope}`, result.retryAfterSeconds);
    }
    await next();
  };
}

/* --------------------------------- auth ----------------------------------- */

const LAST_SEEN_PREFIX = 'seen:';

export const optionalAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const claims = await verifyAccessToken(c.env, token);
    if (claims) {
      if (await isSessionRevoked(c.env, claims.sid)) {
        c.set('player', null);
      } else {
        const player = await getPlayerById(c.env, claims.sub);
        if (player) {
          c.set('player', {
            id: player.id,
            handle: player.handle,
            displayName: player.display_name,
            role: player.role,
            isGuest: player.is_guest === 1,
            banned: player.banned === 1,
            sessionId: claims.sid,
            xp: player.xp,
          });
          // Throttle presence writes: once per player per 5 minutes.
          const seenKey = `${LAST_SEEN_PREFIX}${player.id}`;
          const seen = await c.env.CACHE.get(seenKey).catch(() => null);
          if (!seen) {
            await c.env.CACHE.put(seenKey, '1', { expirationTtl: 300 }).catch(() => undefined);
            await touchPlayer(c.env, player.id).catch(() => undefined);
          }
        }
      }
    }
  }
  await next();
};

export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  await optionalAuth(c, async () => undefined);
  if (!c.get('player')) throw ApiError.unauthorized();
  await next();
};

export const requireRole = (...roles: string[]): MiddlewareHandler<AppContext> => async (c, next) => {
  await optionalAuth(c, async () => undefined);
  const player = c.get('player');
  if (!player) throw ApiError.unauthorized();
  if (!roles.includes(player.role)) throw ApiError.forbidden('Your rank does not grant access to this console');
  await next();
};

/**
 * Sensitive endpoints (profile changes, deletions) require a fresh session so a
 * stolen long-lived token cannot be used to change account details.
 */
export const requireRecentSession: MiddlewareHandler<AppContext> = async (c, next) => {
  const player = c.get('player');
  if (!player) throw ApiError.unauthorized();
  const header = c.req.header('Authorization')?.slice(7).trim();
  if (!header) throw ApiError.unauthorized();
  const claims = await verifyAccessToken(c.env, header);
  if (!claims) throw ApiError.unauthorized();
  const ageSeconds = Math.floor(Date.now() / 1000) - claims.iat;
  if (ageSeconds > 60 * 60) {
    throw new ApiError('forbidden', 'Please sign in again before making this change', {
      details: { code: 'reauth_required' },
    });
  }
  await next();
};

/* ------------------------------ housekeeping ------------------------------ */

export function invalidatePlayerCache(env: Env, playerId: string) {
  return invalidatePlayer(env, playerId);
}

export { ApiError };
