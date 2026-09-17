import { Hono } from 'hono';
import type { AppContext } from '../lib/middleware';
import { ApiError, ok, parsePage, pageMeta } from '../lib/http';
import { bodyLimit, requireAuth, requireRecentSession } from '../lib/middleware';
import { sha256Hex } from '../lib/core';
import {
  achievementCatalogView,
  deletePlayer,
  exportPlayerData,
  getAchievementUnlocks,
  getCloudSave,
  getPlayerById,
  getPlayerStats,
  getUnlockedAchievementIds,
  putCloudSave,
  toPrivatePlayer,
  toTotals,
  updatePlayer,
} from '../services/players';
import { listPlayerRuns } from '../services/runs';
import { getPlacement, boardsForRun } from '../services/leaderboards';
import { progressionFromXp } from '../../../shared/game/progression';
import { parseOrThrow, saveSchema, telemetrySchema, updateMeSchema } from '../lib/validation';
import { ACHIEVEMENTS } from '../../../shared/game/achievements';

export const meRoutes = new Hono<AppContext>();

meRoutes.use('*', requireAuth);

meRoutes.get('/', async (c) => {
  const auth = c.get('player')!;
  const player = await getPlayerById(c.env, auth.id);
  if (!player) throw ApiError.notFound('Player not found');
  const stats = await getPlayerStats(c.env, player.id);
  const unlocked = await getUnlockedAchievementIds(c.env, player.id);
  const totals = toTotals(stats);
  const view = toPrivatePlayer(player, stats);
  const catalogue = achievementCatalogView(unlocked);
  const points = catalogue.filter((entry) => entry.unlocked).reduce((sum, entry) => sum + entry.points, 0);
  const maxPoints = ACHIEVEMENTS.reduce((sum, entry) => sum + entry.points, 0);

  return ok(c, {
    ...view,
    achievementsUnlocked: unlocked.length,
    achievementPoints: points,
    achievementPointsMax: maxPoints,
    totals,
    progression: progressionFromXp(player.xp),
  });
});

meRoutes.patch('/', requireRecentSession, bodyLimit(8192), async (c) => {
  const auth = c.get('player')!;
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(updateMeSchema, body);

  try {
    const updated = await updatePlayer(c.env, auth.id, {
      displayName: input.displayName,
      handle: input.handle,
      avatarSeed: input.avatarSeed,
      preferences: input.preferences as Record<string, unknown> | undefined,
    });
    const stats = await getPlayerStats(c.env, updated.id);
    return ok(c, toPrivatePlayer(updated, stats));
  } catch (error) {
    const message = (error as Error).message ?? '';
    if (message.includes('handle_lower')) throw ApiError.conflict('That callsign is already taken');
    throw error;
  }
});

meRoutes.get('/stats', requireAuth, async (c) => {
  const auth = c.get('player')!;
  const stats = await getPlayerStats(c.env, auth.id);
  const player = await getPlayerById(c.env, auth.id);
  return ok(c, {
    totals: toTotals(stats),
    xp: player?.xp ?? 0,
    progression: progressionFromXp(player?.xp ?? 0),
  });
});

meRoutes.get('/achievements', requireAuth, async (c) => {
  const auth = c.get('player')!;
  const [unlocked, unlocks, stats] = await Promise.all([
    getUnlockedAchievementIds(c.env, auth.id),
    getAchievementUnlocks(c.env, auth.id),
    getPlayerStats(c.env, auth.id),
  ]);
  const totals = toTotals(stats);
  const unlockTimes = new Map(unlocks.map((entry) => [entry.id, entry.unlockedAt]));
  const catalogue = ACHIEVEMENTS.map((achievement) => {
    let progress: { value: number; target: number } | null = null;
    if (achievement.progress) {
      try {
        progress = achievement.progress({ run: null, totals });
      } catch {
        progress = null;
      }
    }
    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      category: achievement.category,
      tier: achievement.tier,
      points: achievement.points,
      hidden: achievement.hidden ?? false,
      unlocked: unlocked.includes(achievement.id),
      unlockedAt: unlockTimes.get(achievement.id) ?? null,
      progress,
    };
  });
  return ok(c, {
    achievements: catalogue,
    unlockedCount: unlocked.length,
    totalCount: catalogue.length,
    points: catalogue.filter((entry) => entry.unlocked).reduce((sum, entry) => sum + entry.points, 0),
    pointsMax: catalogue.reduce((sum, entry) => sum + entry.points, 0),
  });
});

meRoutes.get('/runs', async (c) => {
  const auth = c.get('player')!;
  const page = parsePage(c.req.url, 20, 100);
  const mode = c.req.query('mode');
  const { rows, total } = await listPlayerRuns(c.env, auth.id, page, { mode: mode && mode !== 'all' ? mode : undefined });
  return ok(c, rows, pageMeta(page, total));
});

meRoutes.get('/placement', async (c) => {
  const auth = c.get('player')!;
  const boards = boardsForRun(
    (c.req.query('mode') as 'campaign' | 'daily' | 'gauntlet') ?? 'campaign',
    c.req.query('difficulty') ?? 'pilot',
    { dailyKey: c.req.query('dailyKey') ?? null },
  );
  const results = await Promise.all(
    boards.map(async (board) => {
      const placement = await getPlacement(c.env, board, auth.id);
      return {
        board: board.board,
        period: board.period,
        label: board.label,
        rank: placement?.rank ?? null,
        total: placement?.total ?? null,
        score: placement?.score ?? null,
        percentile: placement?.percentile ?? null,
      };
    }),
  );
  return ok(c, { placements: results.filter((entry) => entry.rank !== null) });
});

/* ------------------------------- cloud save ------------------------------- */

meRoutes.get('/save', async (c) => {
  const auth = c.get('player')!;
  const save = await getCloudSave(c.env, auth.id);
  return ok(c, save ?? { payload: null, version: 0, updatedAt: null });
});

meRoutes.put('/save', bodyLimit(200_000), async (c) => {
  const auth = c.get('player')!;
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(saveSchema, body);
  const checksum = await sha256Hex(input.payload);
  const result = await putCloudSave(c.env, auth.id, {
    payload: input.payload,
    version: input.version,
    device: input.device,
    checksum,
  });
  const status = result.status === 'conflict' ? 409 : 200;
  return ok(c, { ...result, checksum }, {}, { status });
});

/* ------------------------------ telemetry -------------------------------- */

meRoutes.post('/telemetry', bodyLimit(64_000), async (c) => {
  const auth = c.get('player')!;
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(telemetrySchema, body);
  try {
    await c.env.EVENT_QUEUE.send({
      kind: 'telemetry.flush',
      payload: { playerId: auth.id, sessionId: input.sessionId ?? null, events: input.events },
    });
  } catch (error) {
    console.warn('[telemetry] enqueue failed', (error as Error).message);
  }
  return ok(c, { accepted: input.events.length }, {}, { status: 202 });
});

/* ------------------------------- data rights ------------------------------ */

meRoutes.get('/export', async (c) => {
  const auth = c.get('player')!;
  const data = await exportPlayerData(c.env, auth.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="cosmic-invader-frontiers-${auth.handle}.json"`,
    },
  });
});

meRoutes.delete('/', requireRecentSession, async (c) => {
  const auth = c.get('player')!;
  const confirm = c.req.query('confirm');
  if (confirm !== 'delete-my-account') {
    throw ApiError.badRequest('Confirmation required: append ?confirm=delete-my-account');
  }
  await deletePlayer(c.env, auth.id);
  return ok(c, { deleted: true });
});
