import { Hono } from 'hono';
import type { AppContext } from '../lib/middleware';
import { ApiError, ok, pageMeta, parsePage } from '../lib/http';
import { bodyLimit, optionalAuth, rateLimit, requireAuth } from '../lib/middleware';
import { getPlayerById } from '../services/players';
import { getRunById, listPlayerRuns, recentGlobalRuns, submitVerifiedRun } from '../services/runs';
import { parseOrThrow, reportSchema, runSubmissionSchema } from '../lib/validation';
import { nowIso } from '../lib/core';
import type { ReplayPayload } from '../../../shared/game/replay';

export const runRoutes = new Hono<AppContext>();

/**
 * Submit a finished sortie. The Worker re-simulates the replay and stores the
 * server's result — the client's numbers are only ever used as a claim.
 */
runRoutes.post('/', requireAuth, rateLimit('run-submit', 30, 60), bodyLimit(1_200_000), async (c) => {
  const auth = c.get('player')!;
  if (c.get('player')!.banned) throw ApiError.forbidden('This account is suspended');

  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(runSubmissionSchema, body, 'Invalid run submission');

  const player = await getPlayerById(c.env, auth.id, false);
  if (!player) throw ApiError.unauthorized('Player record missing');

  const result = await submitVerifiedRun(
    c.env,
    player,
    {
      replay: input.replay as unknown as ReplayPayload,
      dailyKey: input.dailyKey,
      sessionId: input.sessionId,
    },
    {
      ipHash: c.get('ipHash'),
      clientVersion: c.req.header('X-Client-Version') ?? input.replay.client ?? 'unknown',
    },
  );

  return ok(c, result, {}, { status: 201 });
});

runRoutes.get('/recent', optionalAuth, async (c) => {
  const runs = await recentGlobalRuns(c.env, 12);
  return ok(c, runs);
});

runRoutes.get('/mine', requireAuth, async (c) => {
  const auth = c.get('player')!;
  const page = parsePage(c.req.url, 20, 100);
  const { rows, total } = await listPlayerRuns(c.env, auth.id, page, { mode: c.req.query('mode') });
  return ok(c, rows, pageMeta(page, total));
});

runRoutes.get('/:id', optionalAuth, async (c) => {
  const runId = c.req.param('id');
  const run = await getRunById(c.env, runId);
  if (!run) throw ApiError.notFound('Run not found');

  const auth = c.get('player');
  const owner = auth && auth.id === run.player_id;
  const player = await getPlayerById(c.env, run.player_id);
  if (!player) throw ApiError.notFound('Run not found');
  if (player.banned === 1 && !owner) throw ApiError.forbidden('This run is no longer available');

  const rankedPublic = run.ranked;
  if (!owner && !rankedPublic) throw ApiError.forbidden('This run is private');

  return ok(c, {
    run: {
      id: run.id,
      mode: run.mode,
      difficulty: run.difficulty,
      assist: run.assist,
      ranked: run.ranked,
      score: run.score,
      wave: run.wave,
      durationMs: run.durationMs,
      kills: run.kills,
      bossKills: run.bossKills,
      ufosDestroyed: run.ufosDestroyed,
      maxCombo: run.maxCombo,
      livesLost: run.livesLost,
      accuracy: run.accuracy,
      seed: run.seed,
      engine: run.engine,
      checksum: run.checksum,
      xpAwarded: run.xpAwarded,
      dailyKey: run.dailyKey,
      createdAt: run.createdAt,
    },
    player: {
      id: player.id,
      handle: player.handle,
      displayName: player.display_name,
      avatarSeed: player.avatar_seed,
      isGuest: player.is_guest === 1,
      xp: player.xp,
    },
    replayAvailable: run.replay_key !== null,
    shareUrl: `${c.env.PUBLIC_SITE_URL}/runs/${run.id}`,
  });
});

/** Signed-in spectators can pull the verified input log (used by the replay viewer). */
runRoutes.get('/:id/replay', optionalAuth, rateLimit('replay-read', 60, 60), async (c) => {
  const runId = c.req.param('id');
  const run = await getRunById(c.env, runId);
  if (!run) throw ApiError.notFound('Run not found');
  if (!run.replay_key) throw new ApiError('service_unavailable', 'The replay for this run is still being archived');

  const auth = c.get('player');
  const owner = auth?.id === run.player_id;
  if (!run.ranked && !owner) throw ApiError.forbidden('This replay is private');

  const object = await c.env.REPLAYS.get(run.replay_key);
  if (!object) throw ApiError.notFound('Replay archive missing');

  const encoding = object.httpMetadata?.contentEncoding ?? '';
  let text: string;
  if (encoding.includes('gzip')) {
    const stream = object.body.pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = await object.text();
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;
  return ok(c, {
    runId: run.id,
    playerId: run.player_id,
    engine: run.engine,
    seed: run.seed,
    replay: parsed,
    bytes: run.replay_bytes,
  });
});

runRoutes.post('/:id/report', requireAuth, rateLimit('reports', 10, 3600), bodyLimit(8192), async (c) => {
  const auth = c.get('player')!;
  const runId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const input = parseOrThrow(reportSchema, { ...(body ?? {}), runId });

  const run = await getRunById(c.env, runId);
  if (!run) throw ApiError.notFound('Run not found');
  if (run.player_id === auth.id) throw ApiError.badRequest('You cannot report your own run');

  const existing = await c.env.DB.prepare(
    `SELECT id FROM reports WHERE run_id = ? AND reporter_id = ? AND status = 'open'`,
  )
    .bind(runId, auth.id)
    .first();
  if (existing) return ok(c, { reported: true, duplicate: true });

  await c.env.DB.prepare(
    `INSERT INTO reports (run_id, reporter_id, reason, detail, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`,
  )
    .bind(runId, auth.id, input.reason, input.detail ?? null, nowIso())
    .run();

  // Sending one report to the moderation queue lets moderators triage fast.
  try {
    await c.env.RUN_QUEUE.send({ kind: 'run.notify', runId, playerId: run.player_id });
  } catch {
    /* non-critical */
  }

  return ok(c, { reported: true }, {}, { status: 201 });
});
