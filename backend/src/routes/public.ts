import { Hono } from 'hono';
import type { AppContext } from '../lib/middleware';
import { ApiError, ok } from '../lib/http';
import { bodyLimit, optionalAuth, rateLimit, requireAuth } from '../lib/middleware';
import { CACHE_KEYS, TTL, withCache } from '../lib/cache';
import { all, count, first } from '../lib/db';
import { getRunById } from '../services/runs';
import { getPlayerById } from '../services/players';
import { renderShareCard } from '../services/share';
import { getLeaderboard, boardId } from '../services/leaderboards';
import { ENGINE_VERSION, DIFFICULTIES, MODES, ARENA, MAX_RUN_TICKS } from '../../../shared/game/config';
import { REPLAY_FORMAT_VERSION } from '../../../shared/game/replay';
import { ACHIEVEMENTS } from '../../../shared/game/achievements';
import { currentDailyKey, dailyChallenge } from '../../../shared/game/daily';
import { nowIso } from '../lib/core';
import { parseOrThrow, telemetrySchema } from '../lib/validation';

export const publicRoutes = new Hono<AppContext>();

/* -------------------------------- health --------------------------------- */

publicRoutes.get('/health', async (c) => {
  const checks: Record<string, { ok: boolean; detail?: string; ms?: number }> = {};
  const started = Date.now();
  try {
    const row = await first<{ ok: number }>(c.env, `SELECT 1 AS ok`);
    checks.database = { ok: row?.ok === 1, ms: Date.now() - started };
  } catch (error) {
    checks.database = { ok: false, detail: (error as Error).message };
  }
  try {
    await c.env.CACHE.get('health-probe');
    checks.cache = { ok: true };
  } catch (error) {
    checks.cache = { ok: false, detail: (error as Error).message };
  }
  try {
    await c.env.REPLAYS.head('health-probe');
    checks.storage = { ok: true };
  } catch (error) {
    checks.storage = { ok: false, detail: (error as Error).message };
  }

  const healthy = Object.values(checks).every((check) => check.ok);
  return ok(
    c,
    {
      status: healthy ? 'healthy' : 'degraded',
      environment: c.env.ENVIRONMENT,
      apiVersion: c.env.API_VERSION,
      engineVersion: ENGINE_VERSION,
      replayFormat: REPLAY_FORMAT_VERSION,
      time: nowIso(),
      checks,
    },
    {},
    { status: healthy ? 200 : 503 },
  );
});

publicRoutes.get('/ready', async (c) => {
  const migrations = await count(c.env, `SELECT COUNT(*) AS n FROM seasons`);
  return ok(c, { ready: true, seasons: migrations });
});

/* -------------------------------- config --------------------------------- */

/**
 * Everything the client needs to boot: engine contract, feature flags, balance
 * tables and the current season. Cached in KV so it is a single cheap read.
 */
publicRoutes.get('/config', async (c) => {
  const { value, cached } = await withCache(c.env, CACHE_KEYS.config(), TTL.config, async () => {
    const season = await first<{ id: number; name: string; theme: string | null; starts_at: string; ends_at: string; status: string }>(
      c.env,
      `SELECT id, name, theme, starts_at, ends_at, status FROM seasons WHERE status = 'active' ORDER BY ends_at ASC LIMIT 1`,
    );
    const dailyKey = currentDailyKey();
    return {
      engineVersion: ENGINE_VERSION,
      replayFormat: REPLAY_FORMAT_VERSION,
      arena: ARENA,
      maxRunTicks: MAX_RUN_TICKS,
      apiVersion: c.env.API_VERSION,
      environment: c.env.ENVIRONMENT,
      ingestEnabled: (c.env.LEADERBOARD_INGEST_ENABLED ?? 'true') === 'true',
      difficulty: Object.values(DIFFICULTIES),
      modes: Object.values(MODES),
      daily: dailyChallenge(dailyKey),
      season: season
        ? { id: season.id, name: season.name, theme: season.theme, startsAt: season.starts_at, endsAt: season.ends_at, status: season.status }
        : null,
      achievements: { total: ACHIEVEMENTS.length },
      links: {
        site: c.env.PUBLIC_SITE_URL,
        api: c.env.PUBLIC_API_URL ?? null,
      },
    };
  });
  return ok(c, value, { cached });
});

publicRoutes.get('/achievements', async (c) => {
  const { value } = await withCache(c.env, CACHE_KEYS.achievements(), TTL.achievements, async () =>
    ACHIEVEMENTS.map((achievement) => ({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      category: achievement.category,
      tier: achievement.tier,
      points: achievement.points,
      hidden: achievement.hidden ?? false,
    })),
  );
  return ok(c, value);
});

/* --------------------------------- stats --------------------------------- */

publicRoutes.get('/stats', async (c) => {
  const { value, cached } = await withCache(c.env, CACHE_KEYS.globalStats(), TTL.globalStats, async () => {
    const totals = await first<{
      players: number;
      runs: number;
      scores: number;
      best: number;
      kills: number;
      bosses: number;
      play_ms: number;
    }>(
      c.env,
      `SELECT COUNT(*) AS players, SUM(runs_submitted) AS runs, SUM(total_score) AS scores,
              MAX(best_score) AS best, SUM(total_kills) AS kills, SUM(total_boss_kills) AS bosses,
              SUM(total_play_ms) AS play_ms
       FROM player_stats`,
    );
    const today = await first<{ runs: number; players: number }>(
      c.env,
      `SELECT COUNT(*) AS runs, COUNT(DISTINCT player_id) AS players FROM runs WHERE created_at >= ?`,
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const dailies = await count(c.env, `SELECT COUNT(*) AS n FROM daily_results`);
    const verification = await first<{ total: number; rejected: number }>(
      c.env,
      `SELECT (SELECT COUNT(*) FROM runs) AS total, (SELECT COUNT(*) FROM rejected_runs) AS rejected`,
    );
    const online = await hubPresence(c.env);
    return {
      players: totals?.players ?? 0,
      runsSubmitted: totals?.runs ?? 0,
      totalScore: totals?.scores ?? 0,
      bestScore: totals?.best ?? 0,
      totalKills: totals?.kills ?? 0,
      totalBossKills: totals?.bosses ?? 0,
      totalPlayMs: totals?.play_ms ?? 0,
      runsToday: today?.runs ?? 0,
      pilotsToday: today?.players ?? 0,
      dailiesCompleted: dailies,
      verifiedRuns: verification?.total ?? 0,
      rejectedSubmissions: verification?.rejected ?? 0,
      pilotsOnline: online,
    };
  });
  return ok(c, value, { cached });
});

/* ----------------------------- share cards ------------------------------- */

publicRoutes.get('/share/:runId', async (c) => {
  const runId = (c.req.param('runId') ?? '').replace(/\.svg$/, '');
  if (!runId) throw ApiError.notFound('Run not found');
  const run = await getRunById(c.env, runId);
  if (!run) throw ApiError.notFound('Run not found');
  const player = await getPlayerById(c.env, run.player_id);
  if (!player || player.banned === 1) throw ApiError.notFound('Run not found');

  const svg = renderShareCard({
    runId: run.id,
    handle: player.handle,
    displayName: player.display_name,
    score: run.score,
    wave: run.wave,
    accuracy: run.accuracy,
    durationMs: run.durationMs,
    mode: run.mode,
    difficulty: run.difficulty,
    seed: run.seed,
    rank: null,
    total: null,
    createdAt: run.createdAt,
  });

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
    },
  });
});

/* ------------------------------ leaderboards ----------------------------- */

publicRoutes.get('/spotlight', async (c) => {
  const ref = {
    board: boardId('campaign', 'all', 'alltime'),
    period: 'alltime' as const,
    label: 'Campaign · All time',
    mode: 'campaign' as const,
    difficulty: 'all' as const,
  };
  const board = await getLeaderboard(c.env, ref, { page: 1, pageSize: 5, offset: 0 });
  const feed = await all<{ id: string; handle: string; display_name: string; score: number; wave: number; mode: string; created_at: string }>(
    c.env,
    `SELECT r.id, p.handle, p.display_name, r.score, r.wave, r.mode, r.created_at
     FROM runs r JOIN players p ON p.id = r.player_id
     WHERE r.ranked = 1 AND p.banned = 0
     ORDER BY r.created_at DESC LIMIT 8`,
  );
  return ok(c, { top: board.rows, feed });
});

/* ------------------------------- telemetry ------------------------------- */

publicRoutes.post('/telemetry', optionalAuth, rateLimit('telemetry', 60, 60), bodyLimit(64_000), async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(telemetrySchema, body);
  const player = c.get('player');
  try {
    await c.env.EVENT_QUEUE.send({
      kind: 'telemetry.flush',
      payload: { playerId: player?.id ?? null, sessionId: input.sessionId ?? null, events: input.events },
    });
  } catch (error) {
    console.warn('[telemetry] enqueue failed', (error as Error).message);
  }
  return ok(c, { accepted: input.events.length }, {}, { status: 202 });
});

/* ------------------------------- realtime -------------------------------- */

/**
 * WebSocket fan-out for live leaderboards. The Durable Object holds the sockets
 * (hibernation friendly) and receivers get pushed score events as verified runs
 * land, plus an online-pilot pulse.
 */
publicRoutes.get('/realtime/leaderboard', requireAuth, async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    throw ApiError.badRequest('This endpoint requires a WebSocket upgrade');
  }
  const board = c.req.query('board') ?? boardId('campaign', 'all', 'alltime');
  if (!/^[a-z0-9:_-]{3,80}$/i.test(board)) throw ApiError.badRequest('Invalid board id');

  const id = c.env.LEADERBOARD_HUB.idFromName(board);
  const stub = c.env.LEADERBOARD_HUB.get(id);
  const url = new URL('https://hub/ws');
  url.searchParams.set('board', board);
  url.searchParams.set('handle', c.get('player')!.handle);
  return stub.fetch(url.toString(), { headers: c.req.raw.headers });
});

/* ------------------------------ admin probes ------------------------------ */

async function hubPresence(env: AppContext['Bindings']): Promise<number> {
  try {
    const id = env.PRESENCE_HUB.idFromName('global');
    const stub = env.PRESENCE_HUB.get(id);
    const response = await stub.fetch('https://hub/presence');
    const payload = (await response.json()) as { online?: number };
    return payload.online ?? 0;
  } catch {
    return 0;
  }
}

publicRoutes.get('/robots-reference', (c) =>
  ok(c, {
    note: 'The public site owns robots.txt and sitemap.xml; this API is not meant for indexing.',
  }),
);
