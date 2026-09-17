import type { Env } from '../env';
import { all, count, first, execute } from '../lib/db';
import { CACHE_KEYS, TTL, withCache } from '../lib/cache';
import { nowIso, utcDayKey } from '../lib/core';
import { currentDailyKey, dailyChallenge, type DailyChallenge } from '../../../shared/game/daily';

export interface DailyRow {
  daily_key: string;
  seed: number;
  difficulty: string;
  modifier: string;
  par_score: number;
  bonus_xp: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

/** Persist (once) the materialised challenge definition for a UTC day. */
export async function ensureDailyChallenge(env: Env, key: string = currentDailyKey()): Promise<DailyRow> {
  const existing = await first<DailyRow>(env, `SELECT * FROM daily_challenges WHERE daily_key = ?`, key);
  if (existing) return existing;

  const challenge = dailyChallenge(key);
  await execute(
    env,
    `INSERT OR IGNORE INTO daily_challenges (daily_key, seed, difficulty, modifier, par_score, bonus_xp, starts_at, ends_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    challenge.key,
    challenge.seed,
    challenge.difficulty,
    challenge.modifier.id,
    challenge.parScore,
    challenge.bonusXp,
    challenge.startsAt,
    challenge.endsAt,
    nowIso(),
  );
  const row = await first<DailyRow>(env, `SELECT * FROM daily_challenges WHERE daily_key = ?`, key);
  if (!row) throw new Error('Failed to materialise daily challenge');
  return row;
}

export interface DailySummary {
  challenge: DailyChallenge;
  participants: number;
  topScore: number | null;
  isToday: boolean;
  todayKey: string;
}

export async function getDailySummary(env: Env, key: string = currentDailyKey()): Promise<DailySummary> {
  const { value } = await withCache(env, CACHE_KEYS.dailyChallenge(key), TTL.daily, async () => {
    await ensureDailyChallenge(env, key);
    const participants = await count(env, `SELECT COUNT(*) AS n FROM daily_results WHERE daily_key = ?`, key);
    const top = await first<{ score: number }>(
      env,
      `SELECT score FROM daily_results WHERE daily_key = ? ORDER BY score DESC LIMIT 1`,
      key,
    );
    return { participants, topScore: top?.score ?? null };
  });

  return {
    challenge: dailyChallenge(key),
    participants: value.participants,
    topScore: value.topScore,
    isToday: key === utcDayKey(),
    todayKey: utcDayKey(),
  };
}

export async function getPlayerDailyResult(env: Env, key: string, playerId: string) {
  const row = await first<{ score: number; wave: number; run_id: string; completed_at: string; bonus_xp: number }>(
    env,
    `SELECT score, wave, run_id, completed_at, bonus_xp FROM daily_results WHERE daily_key = ? AND player_id = ?`,
    key,
    playerId,
  );
  return row ?? null;
}

/** Recent daily keys with participation counts (used by the history strip). */
export async function recentDailyKeys(env: Env, limit = 7): Promise<
  Array<{ key: string; participants: number; topScore: number | null }>
> {
  const rows = await all<{ daily_key: string; participants: number; top_score: number | null }>(
    env,
    `SELECT dr.daily_key,
            COUNT(*) AS participants,
            MAX(dr.score) AS top_score
     FROM daily_results dr
     GROUP BY dr.daily_key
     ORDER BY dr.daily_key DESC
     LIMIT ?`,
    limit,
  );
  return rows.map((row) => ({ key: row.daily_key, participants: row.participants, topScore: row.top_score }));
}
