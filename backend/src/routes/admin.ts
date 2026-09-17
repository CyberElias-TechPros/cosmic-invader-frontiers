import { Hono } from 'hono';
import type { AppContext } from '../lib/middleware';
import { ApiError, ok, pageMeta, parsePage } from '../lib/http';
import { bodyLimit, requireRole } from '../lib/middleware';
import { all, count, execute, first } from '../lib/db';
import { nowIso } from '../lib/core';
import { cacheDelete, CACHE_KEYS } from '../lib/cache';
import { moderationSchema, parseOrThrow } from '../lib/validation';
import { purgeOrphanEntries } from '../services/leaderboards';
import { ensureDaily, pruneTelemetry, seasonRollover, snapshotCurrent, warmBoards } from '../cron/tasks';
import { runIntegrityAudit } from '../queue/consumer';
import { revokeAllSessions, secretSource, verifyAccessToken } from '../lib/security';

export const adminRoutes = new Hono<AppContext>();

/**
 * One-time promotion of the first operator.
 *
 * Disabled unless ADMIN_BOOTSTRAP_TOKEN is configured, and the caller must
 * already hold a valid session. Rotate the secret (or delete it) after the
 * first admin exists — this exists so a fresh deployment is not locked out.
 */
adminRoutes.post('/bootstrap', bodyLimit(2048), async (c) => {
  const configured = c.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!configured) throw ApiError.notFound('Bootstrap is disabled');

  const header = c.req.header('X-Bootstrap-Token') ?? '';
  if (header.length === 0 || header !== configured) {
    throw ApiError.forbidden('Invalid bootstrap token');
  }

  const auth = c.get('player');
  if (!auth) {
    const authorization = c.req.header('Authorization');
    if (!authorization?.startsWith('Bearer ')) throw ApiError.unauthorized('Sign in first, then bootstrap');
    const claims = await verifyAccessToken(c.env, authorization.slice(7).trim());
    if (!claims) throw ApiError.unauthorized('Sign in first, then bootstrap');
    await c.env.DB.prepare(`UPDATE players SET role = 'admin', updated_at = ? WHERE id = ?`)
      .bind(nowIso(), claims.sub)
      .run();
    await cacheDelete(c.env, [CACHE_KEYS.playerProfile(claims.sub)]);
    return ok(c, { promoted: true, playerId: claims.sub, role: 'admin' });
  }

  await c.env.DB.prepare(`UPDATE players SET role = 'admin', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), auth.id)
    .run();
  await cacheDelete(c.env, [CACHE_KEYS.playerProfile(auth.id)]);
  return ok(c, { promoted: true, playerId: auth.id, role: 'admin' });
});

adminRoutes.use('*', requireRole('admin', 'moderator'));

/** Everything an operator needs on one screen. */
adminRoutes.get('/overview', async (c) => {
  const [players, guests, runs, rejected, openReports, flaggedRuns, unlocks, dailies] = await Promise.all([
    count(c.env, `SELECT COUNT(*) AS n FROM players`),
    count(c.env, `SELECT COUNT(*) AS n FROM players WHERE is_guest = 1`),
    count(c.env, `SELECT COUNT(*) AS n FROM runs`),
    count(c.env, `SELECT COUNT(*) AS n FROM rejected_runs`),
    count(c.env, `SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
    count(c.env, `SELECT COUNT(*) AS n FROM runs WHERE ranked = 0`),
    count(c.env, `SELECT COUNT(*) AS n FROM player_achievements`),
    count(c.env, `SELECT COUNT(*) AS n FROM daily_results`),
  ]);

  const recentRejections = await all<{ reason: string; detail: string | null; claimed_score: number | null; created_at: string }>(
    c.env,
    `SELECT reason, detail, claimed_score, created_at FROM rejected_runs ORDER BY created_at DESC LIMIT 10`,
  );
  const reports = await all<{ id: number; run_id: string; reason: string; status: string; created_at: string }>(
    c.env,
    `SELECT id, run_id, reason, status, created_at FROM reports ORDER BY created_at DESC LIMIT 10`,
  );
  const audit = await all<{ action: string; target_type: string | null; target_id: string | null; created_at: string }>(
    c.env,
    `SELECT action, target_type, target_id, created_at FROM audit_log ORDER BY created_at DESC LIMIT 15`,
  );

  return ok(c, {
    counts: { players, guests, registered: players - guests, runs, rejected, openReports, unrankedRuns: flaggedRuns, achievementUnlocks: unlocks, dailyResults: dailies },
    recentRejections,
    reports,
    audit,
    config: {
      environment: c.env.ENVIRONMENT,
      ingestEnabled: (c.env.LEADERBOARD_INGEST_ENABLED ?? 'true') === 'true',
      sessionSecretSource: secretSource(c.env),
      maxReplayTicks: c.env.MAX_REPLAY_TICKS,
    },
  });
});

adminRoutes.get('/runs', async (c) => {
  const page = parsePage(c.req.url, 25, 100);
  const status = c.req.query('status') ?? 'rejected';

  if (status === 'rejected') {
    const rows = await all(
      c.env,
      `SELECT id, player_id, reason, detail, claimed_score, mode, difficulty, created_at
       FROM rejected_runs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      page.pageSize,
      page.offset,
    );
    const total = await count(c.env, `SELECT COUNT(*) AS n FROM rejected_runs`);
    return ok(c, rows, pageMeta(page, total));
  }

  const onlyUnranked = status === 'unranked';
  const where = onlyUnranked ? 'WHERE r.ranked = 0' : '';
  const rows = await all(
    c.env,
    `SELECT r.id, r.player_id, p.handle, r.mode, r.difficulty, r.score, r.wave, r.accuracy, r.ranked, r.replay_key, r.created_at
     FROM runs r JOIN players p ON p.id = r.player_id
     ${where}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    page.pageSize,
    page.offset,
  );
  const total = await count(c.env, `SELECT COUNT(*) AS n FROM runs ${onlyUnranked ? 'WHERE ranked = 0' : ''}`);
  return ok(c, rows, pageMeta(page, total));
});

adminRoutes.get('/players', async (c) => {
  const page = parsePage(c.req.url, 25, 100);
  const search = (c.req.query('q') ?? '').trim().toLowerCase();
  const rows = await all(
    c.env,
    `SELECT id, handle, display_name, email, is_guest, banned, xp, created_at, last_seen_at
     FROM players
     ${search ? `WHERE handle_lower LIKE ? OR display_name LIKE ? OR email LIKE ?` : ''}
     ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`,
    ...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []),
    page.pageSize,
    page.offset,
  );
  const total = await count(c.env, `SELECT COUNT(*) AS n FROM players`);
  return ok(c, rows, pageMeta(page, total));
});

adminRoutes.get('/reports', async (c) => {
  const page = parsePage(c.req.url, 25, 100);
  const rows = await all(
    c.env,
    `SELECT rp.id, rp.run_id, rp.reason, rp.detail, rp.status, rp.created_at, r.score, r.player_id, p.handle
     FROM reports rp
     LEFT JOIN runs r ON r.id = rp.run_id
     LEFT JOIN players p ON p.id = r.player_id
     ORDER BY rp.created_at DESC LIMIT ? OFFSET ?`,
    page.pageSize,
    page.offset,
  );
  const total = await count(c.env, `SELECT COUNT(*) AS n FROM reports`);
  return ok(c, rows, pageMeta(page, total));
});

/** Moderate a run or a player. Every action is written to the audit log. */
adminRoutes.post('/actions', bodyLimit(8192), async (c) => {
  const actor = c.get('player')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const input = parseOrThrow(moderationSchema, body);
  const runId = typeof body.runId === 'string' ? body.runId : c.req.query('runId');
  const playerId = typeof body.playerId === 'string' ? body.playerId : c.req.query('playerId');

  if (input.action === 'delete-run') {
    if (typeof runId !== 'string') throw ApiError.badRequest('runId is required');
    const run = await first<{ id: string; player_id: string; score: number }>(
      c.env,
      `SELECT id, player_id, score FROM runs WHERE id = ?`,
      runId,
    );
    if (!run) throw ApiError.notFound('Run not found');
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM leaderboard_entries WHERE run_id = ?`).bind(runId),
      c.env.DB.prepare(`DELETE FROM runs WHERE id = ?`).bind(runId),
      c.env.DB.prepare(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(actor.id, 'moderation.delete-run', 'run', runId, JSON.stringify({ reason: input.reason ?? null }), nowIso()),
    ]);
    await cacheDelete(c.env, [CACHE_KEYS.globalStats(), 'boards:v1:index']);
    return ok(c, { deleted: true, runId });
  }

  if (input.action === 'ban-player' || input.action === 'unban-player') {
    if (typeof playerId !== 'string' || playerId.length === 0) throw ApiError.badRequest('playerId is required');
    const banned = input.action === 'ban-player' ? 1 : 0;
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE players SET banned = ?, ban_reason = ?, updated_at = ? WHERE id = ?`).bind(
        banned,
        banned ? (input.reason ?? 'Terms of service violation') : null,
        nowIso(),
        playerId,
      ),
      c.env.DB.prepare(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(actor.id, `moderation.${input.action}`, 'player', playerId, JSON.stringify({ reason: input.reason ?? null }), nowIso()),
    ]);
    if (banned) {
      await revokeAllSessions(c.env, playerId, 'banned');
      await c.env.DB.prepare(`DELETE FROM leaderboard_entries WHERE player_id = ?`).bind(playerId).run();
    }
    await cacheDelete(c.env, [CACHE_KEYS.playerProfile(playerId), CACHE_KEYS.globalStats(), 'boards:v1:index']);
    return ok(c, { playerId, banned: banned === 1 });
  }

  if (input.action === 'dismiss' || input.action === 'flag-run') {
    const reportId = Number.parseInt(String(body.reportId ?? c.req.query('reportId') ?? ''), 10);
    if (Number.isFinite(reportId)) {
      await c.env.DB.prepare(
        `UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`,
      )
        .bind(input.action === 'dismiss' ? 'dismissed' : 'actioned', actor.id, nowIso(), reportId)
        .run();
    }
    await execute(
      c.env,
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      actor.id,
      `moderation.${input.action}`,
      'run',
      typeof runId === 'string' ? runId : null,
      JSON.stringify({ reason: input.reason ?? null, reportId: Number.isFinite(reportId) ? reportId : null }),
      nowIso(),
    );
    return ok(c, { ok: true });
  }

  throw ApiError.badRequest('Unsupported moderation action');
});

/** Run a maintenance task on demand (same code paths as the cron triggers). */
adminRoutes.post('/maintenance', bodyLimit(8192), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { task?: string };
  const task = body.task ?? 'warm-boards';
  const map: Record<string, () => Promise<unknown>> = {
    'ensure-daily': () => ensureDaily(c.env),
    'warm-boards': () => warmBoards(c.env),
    'snapshot-boards': () => snapshotCurrent(c.env),
    'season-rollover': () => seasonRollover(c.env),
    'prune-telemetry': () => pruneTelemetry(c.env),
    'purge-orphans': () => purgeOrphanEntries(c.env),
    'integrity-audit': () => runIntegrityAudit(c.env, 10),
  };
  const runner = map[task];
  if (!runner) throw ApiError.badRequest(`Unknown maintenance task: ${task}`);
  const result = await runner();
  await execute(
    c.env,
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    c.get('player')!.id,
    'maintenance.run',
    'task',
    task,
    JSON.stringify({ result }).slice(0, 2000),
    nowIso(),
  );
  return ok(c, { task, result });
});

adminRoutes.get('/audit', async (c) => {
  const page = parsePage(c.req.url, 50, 200);
  const rows = await all(
    c.env,
    `SELECT id, actor_id, action, target_type, target_id, meta, created_at FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    page.pageSize,
    page.offset,
  );
  const total = await count(c.env, `SELECT COUNT(*) AS n FROM audit_log`);
  return ok(c, rows, pageMeta(page, total));
});
