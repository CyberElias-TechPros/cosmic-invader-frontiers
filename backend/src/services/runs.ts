import type { Env } from '../env';
import { all, first, stmt } from '../lib/db';
import { ApiError } from '../lib/http';
import { newId, nowIso, parseIntOr, utcDayKey } from '../lib/core';
import { hardRateLimit } from '../lib/security';
import { cacheDelete, CACHE_KEYS } from '../lib/cache';
import { type ReplayPayload, verifyReplay, type VerificationFailure } from '../../../shared/game/replay';
import { MAX_RUN_TICKS as MAX_REPLAY_TICKS } from '../../../shared/game/config';
import { xpForRun } from '../../../shared/game/progression';
import { currentDailyKey, dailyChallenge } from '../../../shared/game/daily';
import type { RunResult } from '../../../shared/game/types';
import { boardsForRun, getPlacement, leaderboardUpsertStatement, type BoardRef } from './leaderboards';
import { evaluateAchievements, projectTotals, unlockedIdSet } from './achievements';
import { getPlayerStats, toTotals, type PlayerRow, type PlayerStatsRow } from './players';
import { ensureDailyChallenge } from './daily';
import { storeReplay } from './replays';

export interface SubmitRunInput {
  replay: ReplayPayload;
  dailyKey?: string;
  sessionId?: string;
}

export interface SubmitOptions {
  ipHash: string;
  clientVersion: string;
}

export interface RunRow extends StoredRunView {
  player_id: string;
  replay_key: string | null;
  replay_bytes: number;
}

/** D1 returns INTEGER for booleans — normalise before it reaches the client. */
export function mapRunRow(row: (StoredRunView & { assist?: unknown; ranked?: unknown }) | null): StoredRunView | null {
  if (!row) return null;
  return { ...row, assist: Boolean(row.assist), ranked: Boolean(row.ranked) };
}

export interface StoredRunView {
  id: string;
  mode: string;
  difficulty: string;
  assist: boolean;
  ranked: boolean;
  score: number;
  wave: number;
  ticks: number;
  durationMs: number;
  kills: number;
  bossKills: number;
  ufosDestroyed: number;
  maxCombo: number;
  livesLost: number;
  accuracy: number;
  seed: number;
  engine: string;
  checksum: string;
  xpAwarded: number;
  dailyKey: string | null;
  createdAt: string;
}

export interface SubmitRunResult {
  run: StoredRunView;
  verification: { ms: number; ticks: number; endReason: string };
  ranking: {
    board: string;
    period: string;
    label: string;
    rank: number | null;
    total: number | null;
    percentile: number | null;
    personalBest: boolean;
  };
  xp: {
    awarded: number;
    bonus: number;
    total: number;
    level: number;
    levelUp: boolean;
    previousLevel: number;
  };
  achievements: Array<{ id: string; name: string; description: string; tier: string; points: number }>;
  daily: { key: string; parScore: number; bonusAwarded: number; participants: number } | null;
  flags: string[];
}

/**
 * Server-authoritative run submission.
 *
 * 1. cheap abuse guards (rate limit, ingest flag, shape)
 * 2. replay re-simulation — the client's numbers are never trusted
 * 3. one atomic D1 transaction for run + stats + boards + achievements
 * 4. async work (replay archival, notifications) handed to Queues
 */
export async function submitVerifiedRun(
  env: Env,
  player: PlayerRow,
  input: SubmitRunInput,
  options: SubmitOptions,
): Promise<SubmitRunResult> {
  if ((env.LEADERBOARD_INGEST_ENABLED ?? 'true') !== 'true') {
    throw new ApiError('maintenance', 'Score ingestion is temporarily paused for maintenance');
  }
  if (player.banned === 1) {
    throw ApiError.forbidden('This account is suspended and cannot submit scores');
  }

  const limit = await hardRateLimit(env, 'run-submit', player.id, 30, 60);
  if (!limit.allowed) {
    throw ApiError.rateLimited('You are submitting runs too quickly — take a breath, pilot.', limit.retryAfterSeconds);
  }

  const payload = input.replay;
  const budget = parseIntOr(env.MAX_REPLAY_TICKS, MAX_REPLAY_TICKS);

  // ---- Daily Sortie rules are enforced server side -----------------------
  let dailyKey: string | null = null;
  if (payload.mode === 'daily') {
    dailyKey = input.dailyKey ?? currentDailyKey();
    const todayKey = utcDayKey();
    if (dailyKey !== todayKey) {
      throw ApiError.validation('This Daily Sortie has closed — start today’s sortie instead.');
    }
    const challenge = dailyChallenge(dailyKey);
    if (payload.seed !== challenge.seed) {
      throw ApiError.validation('Daily Sortie seed mismatch — the challenge has been regenerated.');
    }
    if (payload.difficulty !== challenge.difficulty) {
      throw ApiError.validation(`Today’s Daily Sortie must be flown on ${challenge.difficulty}.`);
    }
  }
  if (payload.mode === 'gauntlet' && payload.difficulty !== 'ace') {
    throw ApiError.validation('Overdrive Gauntlet runs are locked to Ace difficulty.');
  }

  // ---- Verification ------------------------------------------------------
  const started = Date.now();
  const verification = verifyReplay(payload, { maxTicks: budget, requireTerminal: false });
  const verificationMs = Date.now() - started;

  if (!verification.ok || !verification.result) {
    await recordRejection(env, player.id, verification.reason ?? 'invalid-payload', verification.detail ?? null, payload, options);
    throw new ApiError('replay_rejected', replayRejectionMessage(verification.reason), {
      details: { reason: verification.reason, detail: verification.detail },
    });
  }

  const result: RunResult = verification.result;
  const ranked = !payload.assist && player.banned === 0;
  const timestamp = nowIso();

  // ---- Idempotency: identical replay already stored -----------------------
  const existingRow = await first<StoredRunView & { id: string }>(
    env,
    `SELECT id, mode, difficulty, assist, ranked, score, wave, ticks, duration_ms AS durationMs, kills,
            boss_kills AS bossKills, ufos_destroyed AS ufosDestroyed, max_combo AS maxCombo, lives_lost AS livesLost,
            accuracy, seed, engine, checksum, xp_awarded AS xpAwarded, daily_key AS dailyKey, created_at AS createdAt
     FROM runs WHERE player_id = ? AND checksum = ?`,
    player.id,
    payload.checksum,
  );
  const existing = mapRunRow(existingRow);
  if (existing) {
    const boards = boardsForRun(result.mode, result.difficulty, { dailyKey });
    const placement = await getPlacement(env, boards[0], player.id);
    return {
      run: existing,
      verification: { ms: verificationMs, ticks: result.ticks, endReason: result.endReason },
      ranking: {
        board: boards[0].board,
        period: boards[0].period,
        label: boards[0].label,
        rank: placement?.rank ?? null,
        total: placement?.total ?? null,
        percentile: placement?.percentile ?? null,
        personalBest: false,
      },
      xp: { awarded: 0, bonus: 0, total: player.xp, level: 0, levelUp: false, previousLevel: 0 },
      achievements: [],
      daily: null,
      flags: ['duplicate'],
    };
  }

  // ---- Transaction -------------------------------------------------------
  const stats = await getPlayerStats(env, player.id);
  const totals = toTotals(stats);
  const unlocked = await unlockedIdSet(env, player.id);

  let bonusXp = 0;
  let dailyBonusAwarded = 0;
  let dailyParticipants = 0;
  const isNewDaily = dailyKey !== null && stats.last_daily_key !== dailyKey;

  if (dailyKey) {
    const challenge = dailyChallenge(dailyKey);
    await ensureDailyChallenge(env, dailyKey);
    if (result.score >= challenge.parScore) {
      dailyBonusAwarded = challenge.bonusXp;
    }
    bonusXp += dailyBonusAwarded;
    dailyParticipants = 1;
  }

  const baseXp = xpForRun({
    score: result.score,
    wave: result.wave,
    kills: result.stats.kills,
    bossKills: result.stats.bossKills,
    difficulty: result.difficulty,
    assistMode: result.assistMode,
    modeBonus: result.mode === 'gauntlet' ? 300 : 0,
  });
  const xpAwarded = baseXp + bonusXp;

  const projected = projectTotals(totals, result, {
    dailyKey,
    previousDailyKey: stats.last_daily_key,
  });

  const runId = newId('run_');
  // Archive the verified input log. Failure here is non-fatal: the run is still
  // valid, we just lose the ability to re-verify it later.
  const archive = await storeReplay(env, player.id, runId, payload);
  const boards = ranked ? boardsForRun(result.mode, result.difficulty, { dailyKey }) : [];
  const personalBest = result.score > stats.best_score;

  const { newlyUnlocked, statements: achievementStatements } = evaluateAchievements(
    env,
    player.id,
    projected,
    result,
    runId,
    unlocked,
  );

  const statements: D1PreparedStatement[] = [];

  statements.push(
    stmt(
      env,
      `INSERT INTO runs (id, player_id, mode, difficulty, assist, ranked, score, wave, ticks, duration_ms, kills,
        boss_kills, ufos_destroyed, max_combo, lives_lost, damage_taken, accuracy, seed, engine, checksum,
        replay_key, replay_bytes, xp_awarded, daily_key, client, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      runId,
      player.id,
      result.mode,
      result.difficulty,
      result.assistMode ? 1 : 0,
      ranked ? 1 : 0,
      result.score,
      result.wave,
      result.ticks,
      result.durationMs,
      result.stats.kills,
      result.stats.bossKills,
      result.stats.ufosDestroyed,
      result.stats.maxCombo,
      result.stats.livesLost,
      result.stats.damageTaken,
      result.accuracy,
      payload.seed,
      result.version,
      payload.checksum,
      archive?.key ?? null,
      archive?.bytes ?? 0,
      xpAwarded,
      dailyKey,
      payload.client ?? options.clientVersion,
      options.ipHash,
      timestamp,
    ),
  );

  for (const ref of boards) {
    statements.push(
      leaderboardUpsertStatement(env, ref, {
        id: runId,
        playerId: player.id,
        mode: result.mode,
        difficulty: result.difficulty,
        score: result.score,
        wave: result.wave,
        accuracy: result.accuracy,
        durationMs: result.durationMs,
        createdAt: timestamp,
      }),
    );
  }

  statements.push(
    stmt(
      env,
      `INSERT INTO player_stats (
         player_id, games_played, runs_submitted, best_score, total_score, total_kills, total_boss_kills,
         total_ufos, best_wave, best_combo, best_accuracy, total_play_ms, powerups_collected,
         dailies_completed, daily_streak, last_daily_key, gauntlet_bosses, ace_runs, legend_runs, updated_at
       ) VALUES (?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id) DO UPDATE SET
         games_played = player_stats.games_played + 1,
         runs_submitted = player_stats.runs_submitted + 1,
         best_score = MAX(player_stats.best_score, excluded.best_score),
         total_score = player_stats.total_score + excluded.total_score,
         total_kills = player_stats.total_kills + excluded.total_kills,
         total_boss_kills = player_stats.total_boss_kills + excluded.total_boss_kills,
         total_ufos = player_stats.total_ufos + excluded.total_ufos,
         best_wave = MAX(player_stats.best_wave, excluded.best_wave),
         best_combo = MAX(player_stats.best_combo, excluded.best_combo),
         best_accuracy = MAX(player_stats.best_accuracy, excluded.best_accuracy),
         total_play_ms = player_stats.total_play_ms + excluded.total_play_ms,
         powerups_collected = player_stats.powerups_collected + excluded.powerups_collected,
         dailies_completed = player_stats.dailies_completed + excluded.dailies_completed,
         daily_streak = CASE
             WHEN excluded.last_daily_key IS NULL THEN player_stats.daily_streak
             WHEN player_stats.last_daily_key IS excluded.last_daily_key THEN player_stats.daily_streak
             WHEN player_stats.last_daily_key IS NULL THEN excluded.daily_streak
             ELSE excluded.daily_streak
           END,
         last_daily_key = COALESCE(excluded.last_daily_key, player_stats.last_daily_key),
         gauntlet_bosses = player_stats.gauntlet_bosses + excluded.gauntlet_bosses,
         ace_runs = player_stats.ace_runs + excluded.ace_runs,
         legend_runs = player_stats.legend_runs + excluded.legend_runs,
         updated_at = excluded.updated_at`,
      player.id,
      result.score,
      result.score,
      result.stats.kills,
      result.stats.bossKills,
      result.stats.ufosDestroyed,
      result.wave,
      result.stats.maxCombo,
      result.accuracy,
      result.durationMs,
      result.stats.powerupsCollected,
      isNewDaily ? 1 : 0,
      projected.dailyStreak,
      dailyKey,
      result.mode === 'gauntlet' ? result.stats.bossKills : 0,
      result.difficulty === 'ace' ? 1 : 0,
      result.difficulty === 'legend' ? 1 : 0,
      timestamp,
    ),
  );

  statements.push(
    stmt(env, `UPDATE players SET xp = xp + ?, last_seen_at = ?, updated_at = ? WHERE id = ?`, xpAwarded, timestamp, timestamp, player.id),
  );

  if (dailyKey) {
    statements.push(
      stmt(
        env,
        `INSERT INTO daily_results (daily_key, player_id, run_id, score, wave, bonus_xp, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(daily_key, player_id) DO UPDATE SET
           run_id = excluded.run_id, score = excluded.score, wave = excluded.wave, bonus_xp = excluded.bonus_xp, completed_at = excluded.completed_at
         WHERE excluded.score > daily_results.score`,
        dailyKey,
        player.id,
        runId,
        result.score,
        result.wave,
        dailyBonusAwarded,
        timestamp,
      ),
    );
  }

  statements.push(...achievementStatements);

  statements.push(
    stmt(
      env,
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      player.id,
      'run.submitted',
      'run',
      runId,
      JSON.stringify({
        score: result.score,
        wave: result.wave,
        mode: result.mode,
        difficulty: result.difficulty,
        ranked,
        verificationMs,
      }),
      timestamp,
    ),
  );

  await env.DB.batch(statements);

  // ---- Post-commit effects ----------------------------------------------
  await cacheDelete(env, [
    CACHE_KEYS.playerProfile(player.id),
    CACHE_KEYS.globalStats(),
    ...boards.map((ref) => CACHE_KEYS.leaderboard(ref.board, ref.period, 1, 25)),
  ]);

  const previousLevel = Math.max(1, levelFromXpValue(player.xp));
  const newXpTotal = player.xp + xpAwarded;
  const newLevel = levelFromXpValue(newXpTotal);

  const primary: BoardRef | null = boards[0] ?? null;
  const placement = primary ? await getPlacement(env, primary, player.id) : null;

  await enqueuePostRun(env, {
    runId,
    playerId: player.id,
    board: primary?.board,
    period: primary?.period,
    score: result.score,
  });

  if (primary && ranked) {
    await broadcastRunToHub(env, primary.board, {
      playerId: player.id,
      handle: player.handle,
      displayName: player.display_name,
      score: result.score,
      wave: result.wave,
      rank: placement?.rank ?? null,
    });
  }

  const storedRun = mapRunRow(
    await first<StoredRunView>(
    env,
    `SELECT id, mode, difficulty, assist, ranked, score, wave, ticks, duration_ms AS durationMs, kills,
            boss_kills AS bossKills, ufos_destroyed AS ufosDestroyed, max_combo AS maxCombo, lives_lost AS livesLost,
            accuracy, seed, engine, checksum, xp_awarded AS xpAwarded, daily_key AS dailyKey, created_at AS createdAt
     FROM runs WHERE id = ?`,
      runId,
    ),
  );

  const flags: string[] = [];
  if (!ranked) flags.push(payload.assist ? 'assisted' : 'unranked');
  if (result.endReason === 'maxTicks') flags.push('duration-capped');
  if (verificationMs > 1500) flags.push('slow-verification');

  return {
    run: storedRun ?? {
      id: runId,
      mode: result.mode,
      difficulty: result.difficulty,
      assist: result.assistMode,
      ranked,
      score: result.score,
      wave: result.wave,
      ticks: result.ticks,
      durationMs: result.durationMs,
      kills: result.stats.kills,
      bossKills: result.stats.bossKills,
      ufosDestroyed: result.stats.ufosDestroyed,
      maxCombo: result.stats.maxCombo,
      livesLost: result.stats.livesLost,
      accuracy: result.accuracy,
      seed: payload.seed,
      engine: result.version,
      checksum: payload.checksum,
      xpAwarded,
      dailyKey,
      createdAt: timestamp,
    },
    verification: { ms: verificationMs, ticks: result.ticks, endReason: result.endReason },
    ranking: {
      board: primary?.board ?? '',
      period: primary?.period ?? '',
      label: primary?.label ?? 'Unranked',
      rank: placement?.rank ?? null,
      total: placement?.total ?? null,
      percentile: placement?.percentile ?? null,
      personalBest: personalBest && ranked,
    },
    xp: {
      awarded: xpAwarded,
      bonus: bonusXp,
      total: newXpTotal,
      level: newLevel,
      levelUp: newLevel > previousLevel,
      previousLevel,
    },
    achievements: newlyUnlocked,
    daily: dailyKey
      ? {
          key: dailyKey,
          parScore: dailyChallenge(dailyKey).parScore,
          bonusAwarded: dailyBonusAwarded,
          participants: dailyParticipants,
        }
      : null,
    flags,
  };
}

function levelFromXpValue(xp: number): number {
  if (xp <= 0) return 1;
  return Math.max(1, Math.min(99, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2)));
}

function replayRejectionMessage(reason?: VerificationFailure): string {
  switch (reason) {
    case 'engine-mismatch':
      return 'This run was recorded by a different game version — reload to update and try again.';
    case 'score-mismatch':
    case 'wave-mismatch':
    case 'kills-mismatch':
    case 'tick-mismatch':
      return 'Score verification failed: the submitted run does not reproduce the claimed result.';
    case 'too-long':
      return 'That sortie exceeded the maximum verifiable length.';
    case 'invalid-payload':
      return 'The replay could not be read.';
    case 'run-not-finished':
      return 'The run ended without a terminal state.';
    default:
      return 'Run verification failed.';
  }
}

async function recordRejection(
  env: Env,
  playerId: string | null,
  reason: string,
  detail: string | null,
  payload: ReplayPayload | undefined,
  options: SubmitOptions,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO rejected_runs (player_id, reason, detail, claimed_score, mode, difficulty, seed, ticks, client, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        playerId,
        reason,
        (detail ?? '').slice(0, 400),
        payload?.claims?.score ?? null,
        payload?.mode ?? null,
        payload?.difficulty ?? null,
        payload?.seed ?? null,
        payload?.ticks ?? null,
        (payload?.client ?? options.clientVersion).slice(0, 64),
        options.ipHash,
        nowIso(),
      )
      .run();
  } catch (error) {
    console.warn('[runs] failed to record rejection', (error as Error).message);
  }
}

async function enqueuePostRun(
  env: Env,
  message: { runId: string; playerId: string; board?: string; period?: string; score?: number },
): Promise<void> {
  try {
    await env.RUN_QUEUE.send({ kind: 'run.archive', ...message });
    await env.RUN_QUEUE.send({ kind: 'run.postprocess', ...message });
  } catch (error) {
    console.warn('[runs] queue enqueue failed', (error as Error).message);
  }
}

async function broadcastRunToHub(
  env: Env,
  board: string,
  entry: Record<string, unknown>,
): Promise<void> {
  try {
    const id = env.LEADERBOARD_HUB.idFromName(board);
    const stub = env.LEADERBOARD_HUB.get(id);
    await stub.fetch(`https://hub/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ board, entry }),
    });
  } catch (error) {
    console.warn('[runs] hub broadcast failed', (error as Error).message);
  }
}

/* --------------------------------- reads ---------------------------------- */

export async function listPlayerRuns(
  env: Env,
  playerId: string,
  page: { page: number; pageSize: number; offset: number },
  filter: { mode?: string } = {},
): Promise<{ rows: StoredRunView[]; total: number }> {
  const params: unknown[] = [playerId];
  let where = `WHERE player_id = ?`;
  if (filter.mode) {
    where += ` AND mode = ?`;
    params.push(filter.mode);
  }
  const rows = await all<StoredRunView>(
    env,
    `SELECT id, mode, difficulty, assist, ranked, score, wave, ticks, duration_ms AS durationMs, kills,
            boss_kills AS bossKills, ufos_destroyed AS ufosDestroyed, max_combo AS maxCombo, lives_lost AS livesLost,
            accuracy, seed, engine, checksum, xp_awarded AS xpAwarded, daily_key AS dailyKey, created_at AS createdAt
     FROM runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params,
    page.pageSize,
    page.offset,
  );
  const total = await first<{ n: number }>(env, `SELECT COUNT(*) AS n FROM runs ${where}`, ...params);
  return { rows: rows.map((row) => mapRunRow(row) as StoredRunView), total: total?.n ?? 0 };
}

export async function getRunById(env: Env, runId: string): Promise<RunRow | null> {
  const row = await first<RunRow>(
    env,
    `SELECT id, player_id, mode, difficulty, assist, ranked, score, wave, ticks, duration_ms AS durationMs, kills,
            boss_kills AS bossKills, ufos_destroyed AS ufosDestroyed, max_combo AS maxCombo, lives_lost AS livesLost,
            accuracy, seed, engine, checksum, xp_awarded AS xpAwarded, daily_key AS dailyKey, created_at AS createdAt,
            replay_key, replay_bytes
     FROM runs WHERE id = ?`,
    runId,
  );
  if (!row) return null;
  return { ...row, assist: Boolean(row.assist), ranked: Boolean(row.ranked) };
}

export async function recentGlobalRuns(env: Env, limit = 10) {
  return all<{ id: string; score: number; wave: number; mode: string; difficulty: string; handle: string; display_name: string; created_at: string }>(
    env,
    `SELECT r.id, r.score, r.wave, r.mode, r.difficulty, p.handle, p.display_name, r.created_at
     FROM runs r JOIN players p ON p.id = r.player_id
     WHERE r.ranked = 1 AND p.banned = 0
     ORDER BY r.created_at DESC LIMIT ?`,
    limit,
  );
}

export { PlayerStatsRow };
