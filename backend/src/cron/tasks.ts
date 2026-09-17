import type { Env } from '../env';
import { nowIso, utcDayKey } from '../lib/core';
import { pruneExpiredSessions, pruneRateLimits } from '../lib/security';
import { cacheDelete, CACHE_KEYS } from '../lib/cache';
import { ensureDailyChallenge } from '../services/daily';
import { purgeOrphanEntries, snapshotBoard, trackedBoards } from '../services/leaderboards';
import { pruneReplays } from '../services/replays';
import { runIntegrityAudit } from '../queue/consumer';

export interface CronSummary {
  cron: string;
  ranAt: string;
  tasks: Array<{ name: string; result: unknown }>;
}

const DAILY_CRON = '0 0 * * *';
const QUARTER_HOURLY_CRON = '*/15 * * * *';
const NIGHTLY_CRON = '30 3 * * *';

/** Dispatch a scheduled event to the right task set. */
export async function runScheduled(
  controller: ScheduledController,
  env: Env,
): Promise<CronSummary> {
  const summary: CronSummary = { cron: controller.cron, ranAt: nowIso(), tasks: [] };

  if (controller.cron === DAILY_CRON) {
    summary.tasks.push({ name: 'daily.ensure', result: await ensureDaily(env) });
    summary.tasks.push({ name: 'season.rollover', result: await seasonRollover(env) });
    summary.tasks.push({ name: 'daily.snapshot', result: await snapshotYesterday(env) });
  } else if (controller.cron === QUARTER_HOURLY_CRON) {
    summary.tasks.push({ name: 'boards.warm', result: await warmBoards(env) });
    summary.tasks.push({ name: 'boards.snapshot', result: await snapshotCurrent(env) });
  } else if (controller.cron === NIGHTLY_CRON) {
    summary.tasks.push({ name: 'retention.sessions', result: { removed: await pruneExpiredSessions(env) } });
    summary.tasks.push({ name: 'retention.rate-limits', result: { removed: await pruneRateLimits(env) } });
    summary.tasks.push({ name: 'retention.telemetry', result: { removed: await pruneTelemetry(env) } });
    summary.tasks.push({ name: 'retention.replays', result: { removed: await pruneReplays(env) } });
    summary.tasks.push({ name: 'boards.orphans', result: { removed: await purgeOrphanEntries(env) } });
    summary.tasks.push({ name: 'integrity.audit', result: await runIntegrityAudit(env, 8) });
  } else {
    // Unknown schedule: run the cheapest safe task so nothing is silently lost.
    summary.tasks.push({ name: 'daily.ensure', result: await ensureDaily(env) });
  }

  return summary;
}

export async function ensureDaily(env: Env): Promise<{ key: string; seed: number }> {
  const key = utcDayKey();
  const row = await ensureDailyChallenge(env, key);
  await cacheDelete(env, [CACHE_KEYS.dailyChallenge(key), CACHE_KEYS.config()]);
  return { key: row.daily_key, seed: row.seed };
}

/**
 * Season rollover: archive the finished season and activate the next one.
 * Seasons without a successor simply stay active until an operator schedules one.
 */
export async function seasonRollover(env: Env): Promise<Record<string, unknown>> {
  const active = await env.DB.prepare(
    `SELECT id, name, ends_at FROM seasons WHERE status = 'active' ORDER BY ends_at ASC LIMIT 1`,
  ).first<{ id: number; name: string; ends_at: string }>();

  if (!active) return { action: 'none', reason: 'no-active-season' };
  if (Date.parse(active.ends_at) > Date.now()) return { action: 'none', season: active.name };

  const upcoming = await env.DB.prepare(
    `SELECT id, name, starts_at FROM seasons WHERE status = 'upcoming' AND starts_at <= ? ORDER BY starts_at ASC LIMIT 1`,
  )
    .bind(nowIso())
    .first<{ id: number; name: string; starts_at: string }>();

  if (!upcoming) {
    await env.DB.prepare(`UPDATE seasons SET status = 'archived' WHERE id = ?`).bind(active.id).run();
    return { action: 'archived', season: active.name, next: null };
  }

  await env.DB.batch([
    env.DB.prepare(`UPDATE seasons SET status = 'archived' WHERE id = ?`).bind(active.id),
    env.DB.prepare(`UPDATE seasons SET status = 'active' WHERE id = ?`).bind(upcoming.id),
    env.DB.prepare(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(null, 'season.rollover', 'season', String(upcoming.id), JSON.stringify({ from: active.name, to: upcoming.name }), nowIso()),
  ]);
  await cacheDelete(env, [CACHE_KEYS.season(), CACHE_KEYS.config()]);
  return { action: 'rolled-over', from: active.name, to: upcoming.name };
}

/** Warm the KV cache for every board the UI can request. */
export async function warmBoards(env: Env): Promise<{ warmed: number }> {
  const boards = trackedBoards();
  let warmed = 0;
  for (const board of boards) {
    try {
      const page = await snapshotBoard(env, board, 25);
      if (page.rows.length > 0) warmed += 1;
    } catch (error) {
      console.warn('[cron] warm failed', board.board, (error as Error).message);
    }
  }
  await cacheDelete(env, ['boards:v1:index']);
  return { warmed };
}

/** Persist a rolling snapshot of the current ladder (season recaps, archives). */
export async function snapshotCurrent(env: Env): Promise<{ snapped: number }> {
  const boards = trackedBoards().filter((board) => board.period === 'weekly' || board.period === 'monthly' || board.period === 'daily');
  let snapped = 0;
  for (const board of boards) {
    try {
      const { rows } = await snapshotBoard(env, board, 100);
      if (rows.length === 0) continue;
      await env.DB.prepare(
        `INSERT INTO leaderboard_snapshots (board, period, captured_at, payload) VALUES (?, ?, ?, ?)`,
      )
        .bind(board.board, board.period, nowIso(), JSON.stringify(rows).slice(0, 200_000))
        .run();
      snapped += 1;
    } catch (error) {
      console.warn('[cron] snapshot failed', board.board, (error as Error).message);
    }
  }
  // Keep the archive table bounded (last 30 snapshots per board).
  await env.DB.prepare(
    `DELETE FROM leaderboard_snapshots WHERE id NOT IN (
       SELECT id FROM leaderboard_snapshots ls
       WHERE ls.board = leaderboard_snapshots.board AND ls.period = leaderboard_snapshots.period
       ORDER BY captured_at DESC LIMIT 30
     )`,
  ).run();
  return { snapped };
}

async function snapshotYesterday(env: Env): Promise<{ key: string; rows: number }> {
  const yesterday = utcDayKey(new Date(Date.now() - 86_400_000));
  const result = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM daily_results WHERE daily_key = ?`,
  )
    .bind(yesterday)
    .first<{ n: number }>();
  return { key: yesterday, rows: result?.n ?? 0 };
}

export async function pruneTelemetry(env: Env, retentionDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const result = await env.DB.prepare(`DELETE FROM telemetry_events WHERE created_at < ?`).bind(cutoff).run();
  return result.meta.changes ?? 0;
}
