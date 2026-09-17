import type { Env, PlayerRole } from '../env';
import { ApiError } from './http';
import { all, batch, execute, first, stmt } from './db';
import {
  bytesToBase64Url,
  base64UrlToBytes,
  hmacSha256,
  newId,
  nowIso,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from './core';

/* -------------------------------------------------------------------------- */
/*  Secrets                                                                   */
/* -------------------------------------------------------------------------- */

let warnedAboutDevSecret = false;

/**
 * Signing key for access tokens. In production this *must* come from
 * `wrangler secret put SESSION_SECRET`; the development fallback exists only so
 * `wrangler dev` works out of the box and is loudly logged once.
 */
export function sessionSecret(env: Env): string {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  if (env.ENVIRONMENT === 'production') {
    throw new ApiError('service_unavailable', 'SESSION_SECRET is not configured for this environment');
  }
  if (!warnedAboutDevSecret) {
    warnedAboutDevSecret = true;
    console.warn(
      '[security] SESSION_SECRET missing — using an insecure development key. Set it in backend/.dev.vars or via `wrangler secret put SESSION_SECRET`.',
    );
  }
  return 'cosmic-invader-frontiers-development-only-secret-key';
}

export type SessionSecretSource = 'env' | 'development-fallback';

export function secretSource(env: Env): SessionSecretSource {
  return env.SESSION_SECRET && env.SESSION_SECRET.length >= 32 ? 'env' : 'development-fallback';
}

/* -------------------------------------------------------------------------- */
/*  Access tokens (compact HMAC-signed, stateless)                            */
/* -------------------------------------------------------------------------- */

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 30; // 30 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const TOKEN_VERSION = 2;

export interface AccessClaims {
  sub: string;
  sid: string;
  role: PlayerRole;
  handle: string;
  iat: number;
  exp: number;
  v: number;
}

export async function signAccessToken(env: Env, claims: Omit<AccessClaims, 'iat' | 'exp' | 'v'>): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AccessClaims = {
    ...claims,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
    v: TOKEN_VERSION,
  };
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256(sessionSecret(env), body);
  return `${body}.${bytesToBase64Url(signature)}`;
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = await hmacSha256(sessionSecret(env), body);
  if (!timingSafeEqual(bytesToBase64Url(expected), signature)) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as AccessClaims;
    if (claims.v !== TOKEN_VERSION) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    if (!claims.sub || !claims.sid) return null;
    return claims;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Sessions (opaque rotating refresh tokens, hashed at rest)                 */
/* -------------------------------------------------------------------------- */

export interface SessionRecord {
  id: string;
  player_id: string;
  token_hash: string;
  rotated_from: string | null;
  device: string | null;
  ip_hash: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresIn: number;
}

export async function createSession(
  env: Env,
  playerId: string,
  options: { device?: string | null; ipHash?: string | null; rotatedFrom?: string | null; ttlSeconds?: number } = {},
): Promise<IssuedSession> {
  const sessionId = newId('sess_');
  const refreshToken = randomToken(32);
  const tokenHash = await sha256Hex(refreshToken);
  const ttl = options.ttlSeconds ?? REFRESH_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const timestamp = nowIso();

  await execute(
    env,
    `INSERT INTO sessions (id, player_id, token_hash, rotated_from, device, ip_hash, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sessionId,
    playerId,
    tokenHash,
    options.rotatedFrom ?? null,
    options.device ?? null,
    options.ipHash ?? null,
    timestamp,
    timestamp,
    expiresAt,
  );

  return { sessionId, refreshToken, expiresAt, refreshExpiresIn: ttl };
}

export class SessionError extends Error {
  code: 'invalid' | 'expired' | 'revoked' | 'reused';
  constructor(code: SessionError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Rotate a refresh token. Presenting a revoked token is treated as token theft
 * and revokes every session in the family.
 */
export async function rotateSession(
  env: Env,
  refreshToken: string,
  options: { device?: string | null; ipHash?: string | null } = {},
): Promise<{ session: IssuedSession; playerId: string }> {
  const tokenHash = await sha256Hex(refreshToken);
  const existing = await first<SessionRecord>(
    env,
    `SELECT * FROM sessions WHERE token_hash = ?`,
    tokenHash,
  );
  if (!existing) throw new SessionError('invalid', 'Refresh token not recognised');

  if (existing.revoked_at) {
    await revokeFamily(env, existing.id, 'refresh-token-reuse-detected');
    throw new SessionError('reused', 'Refresh token reuse detected — all sessions revoked');
  }
  if (Date.parse(existing.expires_at) < Date.now()) {
    await execute(env, `UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?`, nowIso(), 'expired', existing.id);
    throw new SessionError('expired', 'Session expired');
  }

  const session = await createSession(env, existing.player_id, {
    device: options.device ?? existing.device,
    ipHash: options.ipHash ?? existing.ip_hash,
    rotatedFrom: existing.id,
  });

  await execute(
    env,
    `UPDATE sessions SET revoked_at = ?, revoked_reason = ?, last_used_at = ? WHERE id = ?`,
    nowIso(),
    'rotated',
    nowIso(),
    existing.id,
  );
  await markRevoked(env, existing.id, ACCESS_TOKEN_TTL_SECONDS);

  return { session, playerId: existing.player_id };
}

async function revokeFamily(env: Env, sessionId: string, reason: string): Promise<void> {
  // Walk the rotation chain forwards and backwards to kill every descendant.
  const chain = new Set<string>([sessionId]);
  let cursor: string | null = sessionId;
  for (let depth = 0; depth < 12 && cursor; depth++) {
    const parent: SessionRecord | null = await first<SessionRecord>(
      env,
      `SELECT * FROM sessions WHERE id = ?`,
      cursor,
    );
    cursor = parent?.rotated_from ?? null;
    if (cursor) chain.add(cursor);
  }
  let frontier = [...chain];
  for (let depth = 0; depth < 12 && frontier.length > 0; depth++) {
    const placeholders = frontier.map(() => '?').join(',');
    const children = await all<{ id: string }>(
      env,
      `SELECT id FROM sessions WHERE rotated_from IN (${placeholders})`,
      ...frontier,
    );
    frontier = children.map((child) => child.id).filter((id) => !chain.has(id));
    frontier.forEach((id) => chain.add(id));
  }

  const ids = [...chain];
  await batch(
    env,
    ids.map((id) => stmt(env, `UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ?`, nowIso(), reason, id)),
  );
  await Promise.all(ids.map((id) => markRevoked(env, id, ACCESS_TOKEN_TTL_SECONDS)));
}

export async function revokeSession(env: Env, sessionId: string, reason = 'logout'): Promise<void> {
  await execute(
    env,
    `UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL`,
    nowIso(),
    reason,
    sessionId,
  );
  await markRevoked(env, sessionId, ACCESS_TOKEN_TTL_SECONDS);
}

export async function revokeAllSessions(env: Env, playerId: string, reason = 'security'): Promise<number> {
  const sessions = await all<{ id: string }>(
    env,
    `SELECT id FROM sessions WHERE player_id = ? AND revoked_at IS NULL`,
    playerId,
  );
  await execute(
    env,
    `UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE player_id = ? AND revoked_at IS NULL`,
    nowIso(),
    reason,
    playerId,
  );
  await Promise.all(sessions.map((session) => markRevoked(env, session.id, ACCESS_TOKEN_TTL_SECONDS)));
  return sessions.length;
}

const REVOKED_PREFIX = 'revoked-session:';

export async function markRevoked(env: Env, sessionId: string, ttlSeconds: number): Promise<void> {
  await env.CACHE.put(`${REVOKED_PREFIX}${sessionId}`, '1', { expirationTtl: Math.max(60, ttlSeconds) });
}

export async function isSessionRevoked(env: Env, sessionId: string): Promise<boolean> {
  const value = await env.CACHE.get(`${REVOKED_PREFIX}${sessionId}`);
  return value !== null;
}

export async function activeSessions(env: Env, playerId: string): Promise<
  Array<{ id: string; device: string | null; created_at: string; last_used_at: string; expires_at: string }>
> {
  return all(
    env,
    `SELECT id, device, created_at, last_used_at, expires_at FROM sessions
     WHERE player_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY last_used_at DESC LIMIT 25`,
    playerId,
    nowIso(),
  );
}

/* -------------------------------------------------------------------------- */
/*  Rate limiting                                                             */
/* -------------------------------------------------------------------------- */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window limiter backed by D1.
 *
 * Used for security critical surfaces (auth, run ingestion) where an eventual
 * consistency window would be a real problem. Cheaper soft limits for general
 * traffic use KV via {@link softRateLimit}.
 */
export async function hardRateLimit(
  env: Env,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  // Single round trip: upsert the counter and read it back.
  const row = await first<{ count: number }>(
    env,
    `INSERT INTO auth_attempts (scope, key, window_start, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(scope, key, window_start) DO UPDATE SET count = count + 1
     RETURNING count`,
    scope,
    key,
    windowStart,
  );
  const used = row?.count ?? 1;
  return {
    allowed: used <= limit,
    remaining: Math.max(0, limit - used),
    retryAfterSeconds: Math.max(1, windowSeconds - (now - windowStart)),
  };
}

/** Soft limiter for high-volume but non-critical endpoints (KV counter). */
export async function softRateLimit(
  env: Env,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const cacheKey = `ratelimit:${scope}:${key}:${windowStart}`;
  const current = Number.parseInt((await env.CACHE.get(cacheKey)) ?? '0', 10) || 0;
  const next = current + 1;
  if (next <= limit) {
    await env.CACHE.put(cacheKey, String(next), { expirationTtl: windowSeconds + 30 });
  }
  return {
    allowed: next <= limit,
    remaining: Math.max(0, limit - next),
    retryAfterSeconds: Math.max(1, windowSeconds - (now - windowStart)),
  };
}

export async function pruneRateLimits(env: Env, olderThanSeconds = 3600): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
  const result = await execute(env, `DELETE FROM auth_attempts WHERE window_start < ?`, cutoff);
  return result.meta.changes ?? 0;
}

export async function pruneExpiredSessions(env: Env): Promise<number> {
  const result = await execute(
    env,
    `DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`,
    nowIso(),
    new Date(Date.now() - 7 * 86_400_000).toISOString(),
  );
  return result.meta.changes ?? 0;
}
