import { Hono } from 'hono';
import type { AppContext } from '../lib/middleware';
import { ApiError, ok, pageMeta, parsePage } from '../lib/http';
import { optionalAuth } from '../lib/middleware';
import {
  boardId,
  describeBoard,
  getLeaderboard,
  getPlacement,
  monthKey,
  trackedBoards,
  weekKey,
  type BoardPeriod,
  type BoardRef,
  type DifficultyBucket,
  type ModeId,
} from '../services/leaderboards';
import { getDailySummary, getPlayerDailyResult, recentDailyKeys } from '../services/daily';
import { getPlayerByHandle, getPlayerStats, toPublicPlayer, toTotals } from '../services/players';
import { all, count } from '../lib/db';
import { TTL, withCache } from '../lib/cache';
import { progressionFromXp } from '../../../shared/game/progression';

export const leaderboardRoutes = new Hono<AppContext>();

const MODES: ModeId[] = ['campaign', 'gauntlet', 'daily'];
const DIFFICULTIES: DifficultyBucket[] = ['all', 'cadet', 'pilot', 'ace', 'legend'];

function resolveBoard(query: URLSearchParams): BoardRef {
  const explicit = query.get('board');
  if (explicit) {
    const parts = explicit.split(':');
    if (parts[0] === 'daily') {
      const key = parts[1] ?? query.get('dailyKey') ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw ApiError.badRequest('Daily board requires a YYYY-MM-DD key');
      return { board: `daily:${key}`, period: 'daily', label: `Daily Sortie · ${key}`, mode: 'daily', difficulty: 'all' };
    }
    const mode = (MODES.includes(parts[0] as ModeId) ? parts[0] : 'campaign') as ModeId;
    const difficulty = (DIFFICULTIES.includes(parts[1] as DifficultyBucket) ? parts[1] : 'all') as DifficultyBucket;
    const scope = parts[2] ?? 'alltime';
    const period: BoardPeriod = scope === 'alltime' ? 'alltime' : scope.startsWith('W') ? 'weekly' : scope.includes('-') ? 'monthly' : 'alltime';
    const board = `${mode}:${difficulty}:${scope}`;
    return { board, period, label: describeBoard(board, period), mode, difficulty };
  }

  const mode = (query.get('mode') ?? 'campaign') as ModeId;
  const difficulty = (query.get('difficulty') ?? 'all') as DifficultyBucket;
  const period = (query.get('period') ?? 'alltime') as BoardPeriod;

  if (mode === 'daily') {
    const key = query.get('dailyKey') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw ApiError.badRequest('Daily board requires ?dailyKey=YYYY-MM-DD');
    return { board: boardId('daily', 'all', 'daily', key), period: 'daily', label: `Daily Sortie · ${key}`, mode, difficulty: 'all' };
  }

  if (period === 'alltime') {
    return { board: boardId(mode, difficulty, 'alltime'), period, label: describeBoard(`${mode}:${difficulty}:alltime`, period), mode, difficulty };
  }
  if (period === 'weekly') {
    const key = weekKey();
    return { board: boardId(mode, difficulty, 'weekly', key), period, label: describeBoard(`${mode}:${difficulty}:${key}`, period), mode, difficulty };
  }
  if (period === 'monthly') {
    const key = monthKey();
    return { board: boardId(mode, difficulty, 'monthly', key), period, label: describeBoard(`${mode}:${difficulty}:${key}`, period), mode, difficulty };
  }
  throw ApiError.badRequest('Unsupported period');
}

/** Catalogue of boards the client can switch between. */
leaderboardRoutes.get('/boards', optionalAuth, async (c) => {
  const { value } = await withCache(c.env, 'boards:v1:index', TTL.leaderboard, async () => {
    const boards = trackedBoards();
    const counts = await all<{ board: string; period: string; n: number }>(
      c.env,
      `SELECT board, period, COUNT(*) AS n FROM leaderboard_entries GROUP BY board, period`,
    );
    const countMap = new Map(counts.map((row) => [`${row.board}|${row.period}`, row.n]));
    return boards.map((ref) => ({
      board: ref.board,
      period: ref.period,
      label: ref.label,
      mode: ref.mode,
      difficulty: ref.difficulty,
      entrants: countMap.get(`${ref.board}|${ref.period}`) ?? 0,
    }));
  });
  return ok(c, value);
});

leaderboardRoutes.get('/leaderboard', optionalAuth, async (c) => {
  const url = new URL(c.req.url);
  const ref = resolveBoard(url.searchParams);
  const page = parsePage(c.req.url, 25, 100);
  const result = await getLeaderboard(c.env, ref, page);

  const auth = c.get('player');
  const mine = auth ? await getPlacement(c.env, ref, auth.id) : null;

  return ok(
    c,
    {
      board: result.board,
      period: result.period,
      label: result.label,
      entries: result.rows,
      me: mine
        ? {
            rank: mine.rank,
            total: mine.total,
            score: mine.score,
            percentile: mine.percentile,
          }
        : null,
    },
    pageMeta(page, result.total, { cached: result.cached }),
  );
});

leaderboardRoutes.get('/leaderboard/me', optionalAuth, async (c) => {
  const auth = c.get('player');
  if (!auth) throw ApiError.unauthorized();
  const url = new URL(c.req.url);
  const ref = resolveBoard(url.searchParams);
  const placement = await getPlacement(c.env, ref, auth.id);
  return ok(c, {
    board: ref.board,
    period: ref.period,
    label: ref.label,
    placement,
  });
});

/** Daily Sortie definition + board for a UTC day (today by default). */
leaderboardRoutes.get('/leaderboard/daily', optionalAuth, async (c) => {
  const url = new URL(c.req.url);
  const key = url.searchParams.get('key') ?? undefined;
  const summary = await getDailySummary(c.env, key);
  const auth = c.get('player');

  const ref: BoardRef = {
    board: boardId('daily', 'all', 'daily', summary.challenge.key),
    period: 'daily',
    label: `Daily Sortie · ${summary.challenge.key}`,
    mode: 'daily',
    difficulty: 'all',
  };
  const page = parsePage(c.req.url, 10, 100);
  const board = await getLeaderboard(c.env, ref, page);
  const myResult = auth ? await getPlayerDailyResult(c.env, summary.challenge.key, auth.id) : null;
  const placement = auth ? await getPlacement(c.env, ref, auth.id) : null;
  const history = await recentDailyKeys(c.env, 7);

  return ok(
    c,
    {
      challenge: summary.challenge,
      participants: summary.participants,
      topScore: summary.topScore,
      isToday: summary.isToday,
      todayKey: summary.todayKey,
      leaderboard: board.rows,
      myResult,
      myRank: placement ? { rank: placement.rank, total: placement.total } : null,
      history,
    },
    pageMeta(page, board.total, { cached: board.cached }),
  );
});

/** Public pilot profile: progression, headline stats and recent verified runs. */
leaderboardRoutes.get('/leaderboard/players/:handle', optionalAuth, async (c) => {
  const handle = c.req.param('handle');
  const player = await getPlayerByHandle(c.env, handle);
  if (!player) throw ApiError.notFound('Pilot not found');
  if (player.banned === 1) throw ApiError.forbidden('This pilot is suspended');

  const stats = await getPlayerStats(c.env, player.id);
  const runs = await all<{
    id: string;
    mode: string;
    difficulty: string;
    score: number;
    wave: number;
    accuracy: number;
    duration_ms: number;
    created_at: string;
  }>(
    c.env,
    `SELECT id, mode, difficulty, score, wave, accuracy, duration_ms, created_at
     FROM runs WHERE player_id = ? AND ranked = 1 ORDER BY created_at DESC LIMIT 8`,
    player.id,
  );
  const achievements = await count(c.env, `SELECT COUNT(*) AS n FROM player_achievements WHERE player_id = ?`, player.id);
  const placement = await getPlacement(
    c.env,
    { board: boardId('campaign', 'all', 'alltime'), period: 'alltime', label: 'Campaign · All time', mode: 'campaign', difficulty: 'all' },
    player.id,
  );

  return ok(c, {
    player: toPublicPlayer(player),
    progression: progressionFromXp(player.xp),
    totals: toTotals(stats),
    achievementsUnlocked: achievements,
    globalRank: placement ? { rank: placement.rank, total: placement.total, percentile: placement.percentile } : null,
    recentRuns: runs,
  });
});
