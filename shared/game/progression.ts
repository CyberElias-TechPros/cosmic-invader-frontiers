import type { Difficulty } from './config';

/** Player lifetime aggregates used for progression, ranks and achievements. */
export interface PlayerTotals {
  gamesPlayed: number;
  runsSubmitted: number;
  bestScore: number;
  totalScore: number;
  totalKills: number;
  totalBossKills: number;
  totalUfosDestroyed: number;
  bestWave: number;
  bestCombo: number;
  bestAccuracy: number;
  totalPlayMs: number;
  powerupsCollected: number;
  dailiesCompleted: number;
  dailyStreak: number;
  bossRushClears: number;
  aceRuns: number;
  legendRuns: number;
}

export const EMPTY_TOTALS: PlayerTotals = {
  gamesPlayed: 0,
  runsSubmitted: 0,
  bestScore: 0,
  totalScore: 0,
  totalKills: 0,
  totalBossKills: 0,
  totalUfosDestroyed: 0,
  bestWave: 0,
  bestCombo: 0,
  bestAccuracy: 0,
  totalPlayMs: 0,
  powerupsCollected: 0,
  dailiesCompleted: 0,
  dailyStreak: 0,
  bossRushClears: 0,
  aceRuns: 0,
  legendRuns: 0,
};

export const RANKS: ReadonlyArray<{ minLevel: number; name: string; insignia: string }> = [
  { minLevel: 1, name: 'Cadet', insignia: '◦' },
  { minLevel: 5, name: 'Ensign', insignia: '•' },
  { minLevel: 10, name: 'Lieutenant', insignia: '◆' },
  { minLevel: 20, name: 'Captain', insignia: '⬟' },
  { minLevel: 35, name: 'Commander', insignia: '★' },
  { minLevel: 50, name: 'Wing Commander', insignia: '✦' },
  { minLevel: 70, name: 'Star Marshal', insignia: '✵' },
  { minLevel: 90, name: 'Cosmic Legend', insignia: '✷' },
];

export const MAX_LEVEL = 99;

/** Cumulative XP needed to *reach* a level (level 1 => 0 XP). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) - 1;
  return 50 * l * (l + 1);
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  // Inverse of xpForLevel: 50 * l * (l + 1) <= xp  =>  l <= (1 + sqrt(1 + 4x/50)) / 2
  const l = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2);
  return Math.max(1, Math.min(MAX_LEVEL, l));
}

export interface ProgressionSnapshot {
  xp: number;
  level: number;
  rank: string;
  insignia: string;
  nextRank: string | null;
  levelStartXp: number;
  levelEndXp: number;
  levelProgress: number;
  xpToNextLevel: number;
}

export function progressionFromXp(xp: number): ProgressionSnapshot {
  const level = levelFromXp(xp);
  const levelStartXp = xpForLevel(level);
  const levelEndXp = xpForLevel(level + 1);
  const span = Math.max(1, levelEndXp - levelStartXp);
  const rankEntry = [...RANKS].reverse().find((r) => level >= r.minLevel) ?? RANKS[0];
  const nextRankEntry = RANKS.find((r) => r.minLevel > level) ?? null;
  return {
    xp,
    level,
    rank: rankEntry.name,
    insignia: rankEntry.insignia,
    nextRank: nextRankEntry?.name ?? null,
    levelStartXp,
    levelEndXp,
    levelProgress: Math.max(0, Math.min(1, (xp - levelStartXp) / span)),
    xpToNextLevel: Math.max(0, levelEndXp - xp),
  };
}

const DIFFICULTY_XP: Record<Difficulty, number> = {
  cadet: 0.75,
  pilot: 1,
  ace: 1.35,
  legend: 1.8,
};

/**
 * XP awarded for a *verified* run. Deliberately simple and monotonic so it can
 * never be gamed by submitting junk runs.
 */
export function xpForRun(input: {
  score: number;
  wave: number;
  kills: number;
  bossKills: number;
  difficulty: Difficulty;
  assistMode: boolean;
  /** Gauntlet / daily modifiers */
  modeBonus?: number;
}): number {
  const base =
    Math.floor(input.score / 12) + input.wave * 45 + input.kills * 3 + input.bossKills * 260 + (input.modeBonus ?? 0);
  const scaled = base * DIFFICULTY_XP[input.difficulty] * (input.assistMode ? 0.6 : 1);
  return Math.max(10, Math.round(scaled));
}
