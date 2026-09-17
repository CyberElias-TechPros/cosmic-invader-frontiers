import type { Env, EventQueueMessage, RunQueueMessage } from '../env';
import { cacheDelete, CACHE_KEYS } from '../lib/cache';
import { newId, nowIso } from '../lib/core';
import { getRunById } from '../services/runs';
import { getPlayerById } from '../services/players';
import { getLeaderboard, boardId } from '../services/leaderboards';
import { renderShareCard, putShareCard } from '../services/share';
import { loadReplay } from '../services/replays';
import { verifyReplay } from '../../../shared/game/replay';

/**
 * Queue consumer for both `cosmic-run-processing` and `cosmic-events`.
 *
 * Everything here is deliberately idempotent: Cloudflare Queues are at-least
 * once, so a message may be delivered twice (for example after a retry).
 */
export async function handleQueue(
  batch: MessageBatch<RunQueueMessage | EventQueueMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const body = message.body as unknown as {
        kind: string;
        runId?: string;
        playerId?: string;
        board?: string;
        period?: string;
        score?: number;
        payload?: Record<string, unknown>;
      };
      switch (body.kind) {
        case 'run.archive':
          await handleRunArchive(env, body as unknown as RunQueueMessage);
          break;
        case 'run.postprocess':
          await handleRunPostprocess(env, body as unknown as RunQueueMessage);
          break;
        case 'run.notify':
          await handleRunNotify(env, body as unknown as RunQueueMessage);
          break;
        case 'telemetry.flush':
          await handleTelemetry(env, body as unknown as EventQueueMessage);
          break;
        case 'leaderboard.snapshot':
          await handleLeaderboardSnapshot(env, body as unknown as EventQueueMessage);
          break;
        case 'integrity.audit':
          await handleIntegrityAudit(env, body as unknown as EventQueueMessage);
          break;
        default:
          console.warn('[queue] unknown message kind', JSON.stringify(body).slice(0, 200));
      }
      message.ack();
    } catch (error) {
      console.error('[queue] handler failed', (error as Error).message);
      // Retry with backoff; after max_retries the message lands in the DLQ.
      message.retry({ delaySeconds: 15 });
    }
  }
}

/* ------------------------------- run.archive ------------------------------ */

/** Render + cache the share card so social previews are instant. */
async function handleRunArchive(env: Env, body: RunQueueMessage): Promise<void> {
  const run = await getRunById(env, body.runId);
  if (!run) return;
  const player = await getPlayerById(env, run.player_id, false);
  if (!player) return;

  const board = boardId('campaign', 'all', 'alltime');
  void board;

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
  await putShareCard(env, run.id, svg);
}

/* ----------------------------- run.postprocess ---------------------------- */

/** Warm caches and drop anything that the new run invalidated. */
async function handleRunPostprocess(env: Env, body: RunQueueMessage): Promise<void> {
  await cacheDelete(env, [CACHE_KEYS.globalStats(), 'boards:v1:index']);
  if (body.board) {
    for (let page = 1; page <= 2; page++) {
      await cacheDelete(env, [CACHE_KEYS.leaderboard(body.board, body.period ?? 'alltime', page, 25)]);
    }
    await getLeaderboard(
      env,
      {
        board: body.board,
        period: (body.period as 'alltime' | 'weekly' | 'monthly' | 'daily') ?? 'alltime',
        label: body.board,
        mode: (body.board.startsWith('daily') ? 'daily' : body.board.startsWith('gauntlet') ? 'gauntlet' : 'campaign'),
        difficulty: 'all',
      },
      { page: 1, pageSize: 25, offset: 0 },
    );
  }
}

/* -------------------------------- run.notify ------------------------------ */

/** Reported runs land here so a moderator can triage them quickly. */
async function handleRunNotify(env: Env, body: RunQueueMessage): Promise<void> {
  const openReports = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM reports WHERE status = 'open' AND run_id = ?`,
  )
    .bind(body.runId)
    .first<{ n: number }>();
  console.log(
    JSON.stringify({
      level: 'warn',
      event: 'moderation.open-reports',
      runId: body.runId,
      open: openReports?.n ?? 0,
    }),
  );
}

/* ------------------------------- telemetry -------------------------------- */

interface TelemetryPayload {
  playerId?: string | null;
  sessionId?: string | null;
  events?: Array<{ name: string; props?: Record<string, unknown>; at?: string }>;
}

async function handleTelemetry(env: Env, body: EventQueueMessage): Promise<void> {
  const payload = (body.payload ?? {}) as TelemetryPayload;
  const events = payload.events ?? [];
  if (events.length === 0) return;

  const statements = events.slice(0, 100).map((event) =>
    env.DB.prepare(
      `INSERT INTO telemetry_events (player_id, name, props, session_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      payload.playerId ?? null,
      String(event.name).slice(0, 60),
      JSON.stringify(event.props ?? {}).slice(0, 2000),
      payload.sessionId ?? null,
      event.at && !Number.isNaN(Date.parse(event.at)) ? event.at : nowIso(),
    ),
  );
  await env.DB.batch(statements);
}

/* --------------------------- leaderboard.snapshot ------------------------- */

async function handleLeaderboardSnapshot(env: Env, body: EventQueueMessage): Promise<void> {
  const payload = (body.payload ?? {}) as { board?: string; period?: string };
  if (!payload.board || !payload.period) return;
  const board = await getLeaderboard(
    env,
    {
      board: payload.board,
      period: payload.period as 'alltime' | 'weekly' | 'monthly' | 'daily',
      label: payload.board,
      mode: payload.board.startsWith('daily') ? 'daily' : payload.board.startsWith('gauntlet') ? 'gauntlet' : 'campaign',
      difficulty: 'all',
    },
    { page: 1, pageSize: 100, offset: 0 },
  );
  await env.DB.prepare(
    `INSERT INTO leaderboard_snapshots (board, period, captured_at, payload) VALUES (?, ?, ?, ?)`,
  )
    .bind(payload.board, payload.period, nowIso(), JSON.stringify(board.rows).slice(0, 200_000))
    .run();
}

/* ----------------------------- integrity.audit ---------------------------- */

/**
 * Re-verify archived replays. Catches engine drift (for example after a
 * dependency upgrade) and any run that slipped through with a doctored claim.
 */
export async function runIntegrityAudit(env: Env, sampleSize = 5): Promise<{
  checked: number;
  failed: number;
  flagged: string[];
  skipped: number;
}> {
  const rows = await env.DB.prepare(
    `SELECT id, player_id, replay_key FROM runs
     WHERE replay_key IS NOT NULL AND ranked = 1 AND created_at >= ?
     ORDER BY RANDOM() LIMIT ?`,
  )
    .bind(new Date(Date.now() - 7 * 86_400_000).toISOString(), sampleSize)
    .all<{ id: string; player_id: string; replay_key: string }>();

  const results = { checked: 0, failed: 0, flagged: [] as string[], skipped: 0 };

  for (const row of rows.results ?? []) {
    const replay = await loadReplay(env, row.replay_key);
    if (!replay) {
      results.skipped += 1;
      continue;
    }
    const verification = verifyReplay(replay, { maxTicks: 200_000 });
    results.checked += 1;
    if (!verification.ok) {
      results.failed += 1;
      results.flagged.push(row.id);
      await env.DB.prepare(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(null, 'integrity.audit-failed', 'run', row.id, JSON.stringify({ reason: verification.reason }), nowIso())
        .run();
    }
  }

  return results;
}

async function handleIntegrityAudit(env: Env, body: EventQueueMessage): Promise<void> {
  const payload = (body.payload ?? {}) as { sampleSize?: number };
  const result = await runIntegrityAudit(env, payload.sampleSize ?? 5);
  console.log(JSON.stringify({ level: 'info', event: 'integrity.audit', ...result, id: newId('audit_') }));
}
