import type { Env } from '../env';
import { all, count, first, stmt } from '../lib/db';
import { CACHE_KEYS, TTL, withCache } from '../lib/cache';
import { nowIso, utcDayKey } from '../lib/core';
import { progressionFromXp } from '../../../shared/game/progression';

export type BoardPeriod = 'alltime' | 'weekly' | 'monthly' | 'daily';
export type DifficultyBucket = 'all' | 'cadet' | 'pilot' | 'ace' | 'legend';
export type ModeId = 'campaign' | 'daily' | 'gauntlet';

export interface BoardRef {
  board: string;
  period: BoardPeriod;
  label: string;
  mode: ModeId;
  difficulty: DifficultyBucket;
}

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  handle: string;
  displayName: string;
  avatarSeed: number;
  isGuest: boolean;
  level: number;
  score: number;
  wave: number;
  accuracy: number;
  durationMs: number;
  runId: string;
  mode: string;
  difficulty: string;
  achievedAt: string;
}

/** ISO week key (Monday based) e.g. 2026-W38 */
export function weekKey(date: Date = new Date()): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function monthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function boardId(mode: ModeId, difficulty: DifficultyBucket, period: BoardPeriod, key?: string): string {
  if (mode === 'daily') return `daily:${key ?? utcDayKey()}`;
  const scope = period === 'alltime' ? 'alltime' : (key ?? period);
  return `${mode}:${difficulty}:${scope}`;
}

export function describeBoard(board: string, period: BoardPeriod): string {
  const [mode, difficulty, scope] = board.split(':');
  const modeLabel = mode === 'gauntlet' ? 'Overdrive Gauntlet' : mode === 'daily' ? 'Daily Sortie' : 'Campaign';
  const diff = difficulty && difficulty !== 'all' ? ` · ${difficulty}` : '';
  const scopeLabel = scope === 'alltime' ? 'All time' : period === 'weekly' ? 'This week' : period === 'monthly' ? 'This month' : (scope ?? '');
  return `${modeLabel}${diff} · ${scopeLabel}`;
}

/**
 * Which boards a run feeds. Every ranked run feeds the all-time board; ranked
 * runs also feed the weekly/monthly boards and, for Daily Sorties, that day's
 * board. Assisted runs are excluded from every board.
 */
export function boardsForRun(
  mode: ModeId,
  difficulty: string,
  options: { dailyKey?: string | null; date?: Date } = {},
): BoardRef[] {
  const date = options.date ?? new Date();
  if (mode === 'daily') {
    const dailyKey = options.dailyKey ?? utcDayKey(date);
    return [
      {
        board: boardId('daily', 'all', 'daily', dailyKey),
        period: 'daily',
        label: `Daily Sortie · ${dailyKey}`,
        mode: 'daily',
        difficulty: 'all',
      },
    ];
  }

  const diff = difficulty as DifficultyBucket;
  return [
    { board: boardId(mode, 'all', 'alltime'), period: 'alltime', label: describeBoard(`${mode}:all:alltime`, 'alltime'), mode, difficulty: 'all' },
    { board: boardId(mode, diff, 'alltime'), period: 'alltime', label: describeBoard(`${mode}:${diff}:alltime`, 'alltime'), mode, difficulty: diff },
    { board: boardId(mode, 'all', 'weekly', weekKey(date)), period: 'weekly', label: describeBoard(`${mode}:all:${weekKey(date)}`, 'weekly'), mode, difficulty: 'all' },
    { board: boardId(mode, 'all', 'monthly', monthKey(date)), period: 'monthly', label: describeBoard(`${mode}:all:${monthKey(date)}`, 'monthly'), mode, difficulty: 'all' },
  ];
}

export interface RunForBoards {
  id: string;
  playerId: string;
  mode: string;
  difficulty: string;
  score: number;
  wave: number;
  accuracy: number;
  durationMs: number;
  createdAt: string;
}

/**
 * Statement that keeps only each player's best run per board. Expressed as an
 * upsert with a guard so the whole submission can run in one D1 transaction.
 */
export function leaderboardUpsertStatement(env: Env, ref: BoardRef, run: RunForBoards): D1PreparedStatement {
  return stmt(
    env,
    `INSERT INTO leaderboard_entries (board, period, player_id, run_id, score, wave, accuracy, duration_ms, mode, difficulty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(board, period, player_id) DO UPDATE SET
       run_id = excluded.run_id,
       score = excluded.score,
       wave = excluded.wave,
       accuracy = excluded.accuracy,
       duration_ms = excluded.duration_ms,
       updated_at = excluded.updated_at,
       created_at = excluded.created_at
     WHERE excluded.score > leaderboard_entries.score`,
    ref.board,
    ref.period,
    run.playerId,
    run.id,
    run.score,
    run.wave,
    run.accuracy,
    run.durationMs,
    run.mode,
    run.difficulty,
    run.createdAt,
    run.createdAt,
  );
}

/* --------------------------------- reads ---------------------------------- */

interface RawLeaderboardRow {
  score: number;
  wave: number;
  accuracy: number;
  duration_ms: number;
  run_id: string;
  mode: string;
  difficulty: string;
  created_at: string;
  player_id: string;
  handle: string;
  display_name: string;
  avatar_seed: number;
  is_guest: number;
  xp: number;
}

function mapRow(row: RawLeaderboardRow, rank: number): LeaderboardRow {
  const level = progressionFromXp(row.xp).level;
  return {
    rank,
    playerId: row.player_id,
    handle: row.handle,
    displayName: row.display_name,
    avatarSeed: row.avatar_seed,
    isGuest: row.is_guest === 1,
    level,
    score: row.score,
    wave: row.wave,
    accuracy: row.accuracy,
    durationMs: row.duration_ms,
    runId: row.run_id,
    mode: row.mode,
    difficulty: row.difficulty,
    achievedAt: row.created_at,
  };
}

const SELECT_ROWS = `
  SELECT le.score, le.wave, le.accuracy, le.duration_ms, le.run_id, le.mode, le.difficulty, le.created_at,
         p.id AS player_id, p.handle, p.display_name, p.avatar_seed, p.is_guest, p.xp
  FROM leaderboard_entries le
  JOIN players p ON p.id = le.player_id
  WHERE le.board = ? AND le.period = ? AND p.banned = 0
`;

export interface LeaderboardPage {
  board: string;
  period: BoardPeriod;
  label: string;
  rows: LeaderboardRow[];
  total: number;
  cached: boolean;
}

export async function getLeaderboard(
  env: Env,
  ref: BoardRef,
  page: { page: number; pageSize: number; offset: number },
): Promise<LeaderboardPage> {
  const cacheKey = CACHE_KEYS.leaderboard(ref.board, ref.period, page.page, page.pageSize);
  const { value, cached } = await withCache(env, cacheKey, TTL.leaderboard, async () => {
    const rows = await all<RawLeaderboardRow>(
      env,
      `${SELECT_ROWS} ORDER BY le.score DESC, le.created_at ASC LIMIT ? OFFSET ?`,
      ref.board,
      ref.period,
      page.pageSize,
      page.offset,
    );
    const total = await count(
      env,
      `SELECT COUNT(*) AS n FROM leaderboard_entries le JOIN players p ON p.id = le.player_id
       WHERE le.board = ? AND le.period = ? AND p.banned = 0`,
      ref.board,
      ref.period,
    );
    return {
      rows: rows.map((row, index) => mapRow(row, page.offset + index + 1)),
      total,
    };
  });

  return {
    board: ref.board,
    period: ref.period,
    label: ref.label,
    rows: value.rows,
    total: value.total,
    cached,
  };
}

export interface PlacementInfo {
  rank: number;
  total: number;
  score: number;
  percentile: number;
  neighbours: LeaderboardRow[];
}

export async function getPlacement(
  env: Env,
  ref: BoardRef,
  playerId: string,
): Promise<PlacementInfo | null> {
  const mine = await first<{ score: number; created_at: string }>(
    env,
    `SELECT score, created_at FROM leaderboard_entries WHERE board = ? AND period = ? AND player_id = ?`,
    ref.board,
    ref.period,
    playerId,
  );
  if (!mine) return null;

  const ahead = await count(
    env,
    `SELECT COUNT(*) AS n FROM leaderboard_entries le JOIN players p ON p.id = le.player_id
     WHERE le.board = ? AND le.period = ? AND p.banned = 0
       AND (le.score > ? OR (le.score = ? AND le.created_at < ?))`,
    ref.board,
    ref.period,
    mine.score,
    mine.score,
    mine.created_at,
  );
  const total = await count(
    env,
    `SELECT COUNT(*) AS n FROM leaderboard_entries le JOIN players p ON p.id = le.player_id
     WHERE le.board = ? AND le.period = ? AND p.banned = 0`,
    ref.board,
    ref.period,
  );
  const rank = ahead + 1;
  const from = Math.max(0, rank - 3);
  const rows = await all<RawLeaderboardRow>(
    env,
    `${SELECT_ROWS} ORDER BY le.score DESC, le.created_at ASC LIMIT 5 OFFSET ?`,
    ref.board,
    ref.period,
    from,
  );

  return {
    rank,
    total,
    score: mine.score,
    percentile: total <= 1 ? 100 : Math.max(0, Math.min(100, Math.round(((total - rank) / (total - 1)) * 100))),
    neighbours: rows.map((row, index) => mapRow(row, from + index + 1)),
  };
}

export async function snapshotBoard(env: Env, ref: BoardRef, limit = 100): Promise<{ rows: LeaderboardRow[] }> {
  const rows = await all<RawLeaderboardRow>(
    env,
    `${SELECT_ROWS} ORDER BY le.score DESC, le.created_at ASC LIMIT ?`,
    ref.board,
    ref.period,
    limit,
  );
  return { rows: rows.map((row, index) => mapRow(row, index + 1)) };
}

/** Boards that the cron worker keeps warm + snapshots. */
export function trackedBoards(date: Date = new Date()): BoardRef[] {
  const refs: BoardRef[] = [];
  const modes: ModeId[] = ['campaign', 'gauntlet'];
  const buckets: DifficultyBucket[] = ['all', 'cadet', 'pilot', 'ace', 'legend'];
  for (const mode of modes) {
    for (const bucket of buckets) {
      refs.push({
        board: boardId(mode, bucket, 'alltime'),
        period: 'alltime',
        label: describeBoard(`${mode}:${bucket}:alltime`, 'alltime'),
        mode,
        difficulty: bucket,
      });
    }
    refs.push({
      board: boardId(mode, 'all', 'weekly', weekKey(date)),
      period: 'weekly',
      label: describeBoard(`${mode}:all:${weekKey(date)}`, 'weekly'),
      mode,
      difficulty: 'all',
    });
    refs.push({
      board: boardId(mode, 'all', 'monthly', monthKey(date)),
      period: 'monthly',
      label: describeBoard(`${mode}:all:${monthKey(date)}`, 'monthly'),
      mode,
      difficulty: 'all',
    });
  }
  const today = utcDayKey(date);
  refs.push({
    board: boardId('daily', 'all', 'daily', today),
    period: 'daily',
    label: `Daily Sortie · ${today}`,
    mode: 'daily',
    difficulty: 'all',
  });
  return refs;
}

export async function purgeOrphanEntries(env: Env): Promise<number> {
  const result = await env.DB.prepare(
    `DELETE FROM leaderboard_entries WHERE player_id NOT IN (SELECT id FROM players)`,
  ).run();
  return result.meta.changes ?? 0;
}

export { nowIso };
