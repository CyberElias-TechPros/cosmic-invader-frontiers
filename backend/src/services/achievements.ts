import type { Env } from '../env';
import { all, stmt } from '../lib/db';
import { nowIso } from '../lib/core';
import { ACHIEVEMENTS, type AchievementContext } from '../../../shared/game/achievements';
import { progressionFromXp, type PlayerTotals } from '../../../shared/game/progression';
import type { RunResult } from '../../../shared/game/types';

export interface AchievementEvaluation {
  newlyUnlocked: Array<{ id: string; name: string; description: string; tier: string; points: number }>;
  statements: D1PreparedStatement[];
}

/**
 * Evaluate the catalogue against the player's *projected* totals (including the
 * run being submitted) and return the insert statements so the caller can fold
 * them into the same D1 transaction as the run itself.
 */
export function evaluateAchievements(
  env: Env,
  playerId: string,
  totals: PlayerTotals,
  run: RunResult | null,
  runId: string | null,
  alreadyUnlocked: Set<string>,
): AchievementEvaluation {
  const context: AchievementContext = { run, totals };
  const timestamp = nowIso();
  const newlyUnlocked: AchievementEvaluation['newlyUnlocked'] = [];
  const statements: D1PreparedStatement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(achievement.id)) continue;
    let passed = false;
    try {
      passed = achievement.check(context);
    } catch {
      passed = false;
    }
    if (!passed) continue;
    statements.push(
      stmt(
        env,
        `INSERT OR IGNORE INTO player_achievements (player_id, achievement_id, unlocked_at, run_id) VALUES (?, ?, ?, ?)`,
        playerId,
        achievement.id,
        timestamp,
        runId,
      ),
    );
    newlyUnlocked.push({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      tier: achievement.tier,
      points: achievement.points,
    });
  }

  return { newlyUnlocked, statements };
}

/** Projected totals after applying a run — used for achievement evaluation. */
export function projectTotals(
  totals: PlayerTotals,
  run: RunResult,
  extra: { dailyKey?: string | null; previousDailyKey?: string | null },
): PlayerTotals {
  const next: PlayerTotals = {
    ...totals,
    runsSubmitted: totals.runsSubmitted + 1,
    totalScore: totals.totalScore + run.score,
    totalKills: totals.totalKills + run.stats.kills,
    totalBossKills: totals.totalBossKills + run.stats.bossKills,
    totalUfosDestroyed: totals.totalUfosDestroyed + run.stats.ufosDestroyed,
    totalPlayMs: totals.totalPlayMs + run.durationMs,
    powerupsCollected: totals.powerupsCollected + run.stats.powerupsCollected,
    bestScore: Math.max(totals.bestScore, run.score),
    bestWave: Math.max(totals.bestWave, run.wave),
    bestCombo: Math.max(totals.bestCombo, run.stats.maxCombo),
    bestAccuracy: Math.max(totals.bestAccuracy, run.accuracy),
    aceRuns: totals.aceRuns + (run.difficulty === 'ace' ? 1 : 0),
    legendRuns: totals.legendRuns + (run.difficulty === 'legend' ? 1 : 0),
    bossRushClears: totals.bossRushClears + (run.mode === 'gauntlet' && run.stats.bossKills >= 3 ? 1 : 0),
  };

  const dailyKey = extra.dailyKey ?? null;
  if (dailyKey && dailyKey !== extra.previousDailyKey) {
    next.dailiesCompleted = totals.dailiesCompleted + 1;
    next.dailyStreak = computeStreak(extra.previousDailyKey ?? null, dailyKey, totals.dailyStreak);
  }

  return next;
}

/** Consecutive-day streak: increments when the previous key was yesterday. */
export function computeStreak(previousKey: string | null, currentKey: string, currentStreak: number): number {
  if (!previousKey) return 1;
  if (previousKey === currentKey) return Math.max(1, currentStreak);
  const previous = Date.parse(`${previousKey}T00:00:00.000Z`);
  const current = Date.parse(`${currentKey}T00:00:00.000Z`);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 1;
  const days = Math.round((current - previous) / 86_400_000);
  if (days === 1) return currentStreak + 1;
  if (days <= 0) return Math.max(1, currentStreak);
  return 1;
}

export async function unlockedIdSet(env: Env, playerId: string): Promise<Set<string>> {
  const rows = await all<{ achievement_id: string }>(
    env,
    `SELECT achievement_id FROM player_achievements WHERE player_id = ?`,
    playerId,
  );
  return new Set(rows.map((row) => row.achievement_id));
}

export function levelAfterXp(xp: number): number {
  return progressionFromXp(xp).level;
}
