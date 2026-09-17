import { Hono } from 'hono';
import type { AppContext } from '../lib/middleware';
import { ApiError, ok } from '../lib/http';
import { bodyLimit, rateLimit, requireAuth } from '../lib/middleware';
import { activeSessions, createSession, hardRateLimit, revokeAllSessions, revokeSession, rotateSession, signAccessToken, SessionError } from '../lib/security';
import { nowIso, normalizeHandle, sanitizeText, sha256Hex, verifyPassword, randomCallsign } from '../lib/core';
import { getPlayerByEmail, getPlayerById, getPlayerStats, toPrivatePlayer, upgradeGuest, createPlayer, invalidatePlayer, getUnlockedAchievementIds } from '../services/players';
import { guestSchema, loginSchema, parseOrThrow, refreshSchema, registerSchema, upgradeSchema } from '../lib/validation';
import type { PlayerRow } from '../services/players';

export const authRoutes = new Hono<AppContext>();

async function issueSessionFor(
  env: AppContext['Bindings'],
  player: PlayerRow,
  context: { ipHash: string; device?: string | null },
) {
  const session = await createSession(env, player.id, {
    device: context.device ?? null,
    ipHash: context.ipHash,
  });
  const accessToken = await signAccessToken(env, {
    sub: player.id,
    sid: session.sessionId,
    role: player.role,
    handle: player.handle,
  });
  return { accessToken, ...session };
}

async function playerPayload(env: AppContext['Bindings'], player: PlayerRow) {
  const stats = await getPlayerStats(env, player.id);
  const unlocked = await getUnlockedAchievementIds(env, player.id);
  const view = toPrivatePlayer(player, stats);
  return { ...view, achievementsUnlocked: unlocked.length };
}

/** Temporary guest identity — created before the first shot is fired. */
authRoutes.post('/guest', rateLimit('auth-guest', 20, 60), bodyLimit(4096), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = guestSchema.safeParse(body ?? {});
  if (!parsed.success) throw ApiError.validation('Invalid guest request');

  const limit = await hardRateLimit(c.env, 'guest', c.get('ipHash'), 60, 3600);
  if (!limit.allowed) throw ApiError.rateLimited('Too many guest pilots from this connection', limit.retryAfterSeconds);

  const player = await createPlayer(c.env, {
    isGuest: true,
    displayName: parsed.data.callsign ?? randomCallsign(),
    handle: parsed.data.callsign,
    ipHash: c.get('ipHash'),
    device: parsed.data.device ?? c.req.header('User-Agent') ?? null,
  });

  const tokens = await issueSessionFor(c.env, player, { ipHash: c.get('ipHash'), device: parsed.data.device });
  return ok(c, { player: await playerPayload(c.env, player), tokens }, {}, { status: 201 });
});

authRoutes.post('/register', rateLimit('auth-register', 20, 60), bodyLimit(8192), async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(registerSchema, body);

  const emailLimit = await hardRateLimit(c.env, 'register-email', await sha256Hex(input.email), 4, 3600);
  if (!emailLimit.allowed) {
    throw ApiError.rateLimited('Too many registration attempts for this email address', emailLimit.retryAfterSeconds);
  }

  const existing = await getPlayerByEmail(c.env, input.email);
  if (existing) throw ApiError.conflict('An account already exists for that email address');

  const player = await createPlayer(c.env, {
    isGuest: false,
    email: input.email,
    password: input.password,
    displayName: input.displayName ?? input.email.split('@')[0],
    handle: input.handle,
    ipHash: c.get('ipHash'),
  });

  const tokens = await issueSessionFor(c.env, player, { ipHash: c.get('ipHash') });
  return ok(c, { player: await playerPayload(c.env, player), tokens }, {}, { status: 201 });
});

authRoutes.post('/login', rateLimit('auth-login', 20, 60), bodyLimit(8192), async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(loginSchema, body);

  const emailHash = await sha256Hex(input.email);
  const emailLimit = await hardRateLimit(c.env, 'login-email', emailHash, 8, 900);
  const ipLimit = await hardRateLimit(c.env, 'login-ip', c.get('ipHash'), 40, 900);
  if (!emailLimit.allowed || !ipLimit.allowed) {
    throw ApiError.rateLimited(
      'Too many sign-in attempts. Wait a few minutes and try again.',
      Math.max(emailLimit.retryAfterSeconds, ipLimit.retryAfterSeconds),
    );
  }

  const player = await getPlayerByEmail(c.env, input.email);
  const passwordOk = player
    ? await verifyPassword(input.password, {
        hash: player.password_hash,
        salt: player.password_salt,
        algo: player.password_algo,
        iterations: player.password_iter,
      })
    : false;

  // Constant-ish response either way: no account enumeration.
  if (!player || !passwordOk) {
    throw new ApiError('unauthorized', 'That email and password combination is not recognised');
  }
  if (player.banned === 1) {
    throw ApiError.forbidden(player.ban_reason ? `Account suspended: ${player.ban_reason}` : 'This account is suspended');
  }

  await c.env.DB.prepare(`UPDATE players SET last_seen_at = ? WHERE id = ?`).bind(nowIso(), player.id).run();
  await invalidatePlayer(c.env, player.id);

  const tokens = await issueSessionFor(c.env, player, { ipHash: c.get('ipHash') });
  return ok(c, { player: await playerPayload(c.env, player), tokens });
});

authRoutes.post('/refresh', rateLimit('auth-refresh', 60, 60), bodyLimit(4096), async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(refreshSchema, body);

  try {
    const { session, playerId } = await rotateSession(c.env, input.refreshToken, { ipHash: c.get('ipHash') });
    const player = await getPlayerById(c.env, playerId, false);
    if (!player) throw ApiError.unauthorized('Session no longer valid');
    if (player.banned === 1) {
      await revokeAllSessions(c.env, playerId, 'banned');
      throw ApiError.forbidden('This account is suspended');
    }
    const accessToken = await signAccessToken(c.env, {
      sub: player.id,
      sid: session.sessionId,
      role: player.role,
      handle: player.handle,
    });
    return ok(c, {
      player: await playerPayload(c.env, player),
      tokens: { accessToken, ...session },
    });
  } catch (error) {
    if (error instanceof SessionError) {
      if (error.code === 'reused') {
        await c.env.DB.prepare(
          `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(null, 'auth.refresh-reuse-detected', 'ip', c.get('ipHash'), JSON.stringify({}), nowIso())
          .run()
          .catch(() => undefined);
      }
      throw ApiError.unauthorized('Your session has expired — please sign in again');
    }
    throw error;
  }
});

authRoutes.post('/logout', requireAuth, bodyLimit(2048), async (c) => {
  const player = c.get('player');
  if (player) await revokeSession(c.env, player.sessionId, 'logout');
  return ok(c, { signedOut: true });
});

authRoutes.post('/logout-all', requireAuth, bodyLimit(2048), async (c) => {
  const player = c.get('player')!;
  const revoked = await revokeAllSessions(c.env, player.id, 'logout-all');
  return ok(c, { revokedSessions: revoked });
});

/**
 * Turn the current guest identity into a permanent account. Progress, runs and
 * achievements are all preserved because the row is updated in place.
 */
authRoutes.post('/upgrade', requireAuth, rateLimit('auth-upgrade', 8, 60), bodyLimit(8192), async (c) => {
  const player = c.get('player')!;
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(upgradeSchema, body);

  const existing = await getPlayerByEmail(c.env, input.email);
  if (existing && existing.id !== player.id) {
    throw ApiError.conflict('An account already exists for that email address');
  }

  const updated = await upgradeGuest(c.env, player.id, {
    email: input.email,
    password: input.password,
    displayName: player.displayName,
  });

  // Rotate every token so the new permanent account is not tied to a guest session.
  await revokeAllSessions(c.env, player.id, 'account-upgrade');
  const tokens = await issueSessionFor(c.env, updated, { ipHash: c.get('ipHash') });
  return ok(c, { player: await playerPayload(c.env, updated), tokens });
});

authRoutes.get('/sessions', requireAuth, async (c) => {
  const player = c.get('player')!;
  const sessions = await activeSessions(c.env, player.id);
  return ok(c, {
    sessions: sessions.map((session) => ({ ...session, current: session.id === player.sessionId })),
  });
});

authRoutes.delete('/sessions/:id', requireAuth, async (c) => {
  const player = c.get('player')!;
  const sessionId = c.req.param('id');
  const target = await c.env.DB.prepare(`SELECT player_id FROM sessions WHERE id = ?`).bind(sessionId).first<{ player_id: string }>();
  if (!target || target.player_id !== player.id) throw ApiError.notFound('Session not found');
  await revokeSession(c.env, sessionId, 'revoked-by-user');
  return ok(c, { revoked: true, wasCurrent: sessionId === player.sessionId });
});

/** Availability check used by the signup form for instant feedback. */
authRoutes.get('/handle-available', rateLimit('handle-check', 60, 60), async (c) => {
  const raw = c.req.query('handle') ?? '';
  const handle = normalizeHandle(raw);
  if (handle.length < 3) return ok(c, { handle, available: false, reason: 'Callsign must be at least 3 characters' });
  const existing = await c.env.DB.prepare(`SELECT id FROM players WHERE handle_lower = ?`).bind(handle).first();
  return ok(c, { handle: sanitizeText(handle, 20), available: !existing });
});
