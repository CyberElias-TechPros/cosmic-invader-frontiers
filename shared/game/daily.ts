import { DIFFICULTIES, type Difficulty, type GameMode } from './config';
import { seedFromString } from './rng';
import type { WaveModifier } from './types';
import { WAVE_MODIFIERS } from './waves';

/**
 * Daily Sortie: one shared seed per UTC day, so every pilot in the world faces
 * an identical armada and the daily board is a true skill comparison.
 */

export function dailyKeyFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function parseDailyKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

const DIFFICULTY_ROTATION: Difficulty[] = ['pilot', 'pilot', 'ace', 'cadet', 'pilot', 'ace', 'legend'];

export interface DailyChallenge {
  key: string;
  seed: number;
  difficulty: Difficulty;
  difficultyLabel: string;
  modifier: WaveModifier;
  /** Score that grants the "par" bonus — tuned from historical daily medians. */
  parScore: number;
  bonusXp: number;
  startsAt: string;
  endsAt: string;
  title: string;
}

export function dailyChallenge(key: string): DailyChallenge {
  const parsed = parseDailyKey(key) ?? { year: 2026, month: 1, day: 1 };
  const seed = seedFromString(`cosmic-daily:${key}`);
  const weekday = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  const difficulty = DIFFICULTY_ROTATION[weekday % DIFFICULTY_ROTATION.length];
  const modifier = WAVE_MODIFIERS[seed % WAVE_MODIFIERS.length];
  const base = 12_000 + (seed % 9_000);
  const parScore = Math.round(base * DIFFICULTIES[difficulty].scoreMultiplier);

  const startsAt = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0)).toISOString();
  const endsAt = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1, 0, 0, 0)).toISOString();

  return {
    key,
    seed,
    difficulty,
    difficultyLabel: DIFFICULTIES[difficulty].label,
    modifier,
    parScore,
    bonusXp: 250 + Math.round(base / 40),
    startsAt,
    endsAt,
    title: `Sortie ${key}`,
  };
}

export function currentDailyKey(now: Date = new Date()): string {
  return dailyKeyFromDate(now);
}

export function modeLabel(mode: GameMode): string {
  if (mode === 'daily') return 'Daily Sortie';
  if (mode === 'gauntlet') return 'Overdrive Gauntlet';
  return 'Campaign';
}
