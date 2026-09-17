import type { RunResult } from './types';
import type { PlayerTotals } from './progression';

export type AchievementCategory = 'combat' | 'survival' | 'skill' | 'collection' | 'dedication';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AchievementContext {
  /** The run being evaluated, if this evaluation follows a submission. */
  run: RunResult | null;
  totals: PlayerTotals;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  points: number;
  hidden?: boolean;
  /** Optional numeric progress (value/target) for the UI. */
  progress?: (ctx: AchievementContext) => { value: number; target: number };
  check: (ctx: AchievementContext) => boolean;
}

function fromRun(run: RunResult | null, fallback: number, pick: (run: RunResult) => number): number {
  return run ? pick(run) : fallback;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Destroy your first invader.',
    category: 'combat',
    tier: 'bronze',
    points: 5,
    progress: (ctx) => ({ value: Math.min(1, ctx.totals.totalKills), target: 1 }),
    check: (ctx) => ctx.totals.totalKills >= 1,
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Destroy 100 invaders across all sorties.',
    category: 'combat',
    tier: 'bronze',
    points: 15,
    progress: (ctx) => ({ value: Math.min(100, ctx.totals.totalKills), target: 100 }),
    check: (ctx) => ctx.totals.totalKills >= 100,
  },
  {
    id: 'exterminator',
    name: 'Exterminator',
    description: 'Destroy 1,000 invaders across all sorties.',
    category: 'combat',
    tier: 'gold',
    points: 60,
    progress: (ctx) => ({ value: Math.min(1000, ctx.totals.totalKills), target: 1000 }),
    check: (ctx) => ctx.totals.totalKills >= 1000,
  },
  {
    id: 'armada-breaker',
    name: 'Armada Breaker',
    description: 'Destroy 5,000 invaders.',
    category: 'combat',
    tier: 'platinum',
    points: 150,
    progress: (ctx) => ({ value: Math.min(5000, ctx.totals.totalKills), target: 5000 }),
    check: (ctx) => ctx.totals.totalKills >= 5000,
  },
  {
    id: 'dreadnought-slayer',
    name: 'Dreadnought Slayer',
    description: 'Defeat your first Dreadnought.',
    category: 'combat',
    tier: 'silver',
    points: 25,
    progress: (ctx) => ({ value: Math.min(1, ctx.totals.totalBossKills), target: 1 }),
    check: (ctx) => ctx.totals.totalBossKills >= 1,
  },
  {
    id: 'boss-hunter',
    name: 'Boss Hunter',
    description: 'Defeat 5 Dreadnoughts.',
    category: 'combat',
    tier: 'gold',
    points: 70,
    progress: (ctx) => ({ value: Math.min(5, ctx.totals.totalBossKills), target: 5 }),
    check: (ctx) => ctx.totals.totalBossKills >= 5,
  },
  {
    id: 'saucer-down',
    name: 'Saucer Down',
    description: 'Shoot down a bonus saucer.',
    category: 'combat',
    tier: 'bronze',
    points: 10,
    check: (ctx) => ctx.totals.totalUfosDestroyed >= 1 || fromRun(ctx.run, 0, (r) => r.stats.ufosDestroyed) >= 1,
  },
  {
    id: 'ufo-hunter',
    name: 'Saucer Hunter',
    description: 'Shoot down 25 bonus saucers.',
    category: 'combat',
    tier: 'silver',
    points: 45,
    progress: (ctx) => ({ value: Math.min(25, ctx.totals.totalUfosDestroyed), target: 25 }),
    check: (ctx) => ctx.totals.totalUfosDestroyed >= 25,
  },
  {
    id: 'wave-five',
    name: 'Holding the Line',
    description: 'Reach wave 5 in a single sortie.',
    category: 'survival',
    tier: 'bronze',
    points: 15,
    progress: (ctx) => ({ value: Math.min(5, ctx.totals.bestWave), target: 5 }),
    check: (ctx) => ctx.totals.bestWave >= 5,
  },
  {
    id: 'wave-ten',
    name: 'Frontier Veteran',
    description: 'Reach wave 10 in a single sortie.',
    category: 'survival',
    tier: 'silver',
    points: 40,
    progress: (ctx) => ({ value: Math.min(10, ctx.totals.bestWave), target: 10 }),
    check: (ctx) => ctx.totals.bestWave >= 10,
  },
  {
    id: 'wave-twenty',
    name: 'Deep Frontier',
    description: 'Reach wave 20 in a single sortie.',
    category: 'survival',
    tier: 'gold',
    points: 90,
    progress: (ctx) => ({ value: Math.min(20, ctx.totals.bestWave), target: 20 }),
    check: (ctx) => ctx.totals.bestWave >= 20,
  },
  {
    id: 'score-10k',
    name: 'Ten Thousand',
    description: 'Score 10,000 points in a single sortie.',
    category: 'skill',
    tier: 'bronze',
    points: 20,
    progress: (ctx) => ({ value: Math.min(10_000, ctx.totals.bestScore), target: 10_000 }),
    check: (ctx) => ctx.totals.bestScore >= 10_000,
  },
  {
    id: 'score-50k',
    name: 'Fifty Thousand',
    description: 'Score 50,000 points in a single sortie.',
    category: 'skill',
    tier: 'silver',
    points: 50,
    progress: (ctx) => ({ value: Math.min(50_000, ctx.totals.bestScore), target: 50_000 }),
    check: (ctx) => ctx.totals.bestScore >= 50_000,
  },
  {
    id: 'score-250k',
    name: 'Quarter Million',
    description: 'Score 250,000 points in a single sortie.',
    category: 'skill',
    tier: 'platinum',
    points: 200,
    progress: (ctx) => ({ value: Math.min(250_000, ctx.totals.bestScore), target: 250_000 }),
    check: (ctx) => ctx.totals.bestScore >= 250_000,
  },
  {
    id: 'combo-16',
    name: 'Combo Pilot',
    description: 'Reach a x5 score multiplier.',
    category: 'skill',
    tier: 'bronze',
    points: 20,
    progress: (ctx) => ({ value: Math.min(16, ctx.totals.bestCombo), target: 16 }),
    check: (ctx) => ctx.totals.bestCombo >= 16,
  },
  {
    id: 'combo-40',
    name: 'Untouchable',
    description: 'Reach a x8 score multiplier.',
    category: 'skill',
    tier: 'gold',
    points: 80,
    progress: (ctx) => ({ value: Math.min(40, ctx.totals.bestCombo), target: 40 }),
    check: (ctx) => ctx.totals.bestCombo >= 40,
  },
  {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    description: 'Finish a sortie with 45% or better accuracy.',
    category: 'skill',
    tier: 'silver',
    points: 45,
    check: (ctx) => (ctx.run ? ctx.run.accuracy >= 0.45 && ctx.run.stats.shotsFired >= 60 : ctx.totals.bestAccuracy >= 0.45),
  },
  {
    id: 'flawless-wave',
    name: 'Flawless',
    description: 'Complete a sortie without losing a single ship on Ace or higher.',
    category: 'skill',
    tier: 'platinum',
    points: 220,
    check: (ctx) =>
      ctx.run !== null &&
      ctx.run.stats.livesLost === 0 &&
      (ctx.run.difficulty === 'ace' || ctx.run.difficulty === 'legend') &&
      ctx.run.wave >= 4,
  },
  {
    id: 'ace-pilot',
    name: 'Ace Pilot',
    description: 'Submit a ranked sortie on Ace difficulty.',
    category: 'dedication',
    tier: 'silver',
    points: 35,
    progress: (ctx) => ({ value: Math.min(1, ctx.totals.aceRuns), target: 1 }),
    check: (ctx) => ctx.totals.aceRuns >= 1,
  },
  {
    id: 'legend-pilot',
    name: 'Legend',
    description: 'Submit a ranked sortie on Legend difficulty.',
    category: 'dedication',
    tier: 'gold',
    points: 110,
    progress: (ctx) => ({ value: Math.min(1, ctx.totals.legendRuns), target: 1 }),
    check: (ctx) => ctx.totals.legendRuns >= 1,
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Collect 50 power-ups.',
    category: 'collection',
    tier: 'silver',
    points: 40,
    progress: (ctx) => ({ value: Math.min(50, ctx.totals.powerupsCollected), target: 50 }),
    check: (ctx) => ctx.totals.powerupsCollected >= 50,
  },
  {
    id: 'gauntlet-clear',
    name: 'Gauntlet Clear',
    description: 'Defeat three Dreadnoughts in one Overdrive Gauntlet sortie.',
    category: 'skill',
    tier: 'gold',
    points: 120,
    check: (ctx) => ctx.run !== null && ctx.run.mode === 'gauntlet' && ctx.run.stats.bossKills >= 3,
  },
  {
    id: 'daily-first',
    name: 'Report for Duty',
    description: 'Complete your first Daily Sortie.',
    category: 'dedication',
    tier: 'bronze',
    points: 15,
    progress: (ctx) => ({ value: Math.min(1, ctx.totals.dailiesCompleted), target: 1 }),
    check: (ctx) => ctx.totals.dailiesCompleted >= 1,
  },
  {
    id: 'daily-streak-3',
    name: 'Consistent',
    description: 'Complete Daily Sorties three days in a row.',
    category: 'dedication',
    tier: 'silver',
    points: 55,
    progress: (ctx) => ({ value: Math.min(3, ctx.totals.dailyStreak), target: 3 }),
    check: (ctx) => ctx.totals.dailyStreak >= 3,
  },
  {
    id: 'daily-streak-7',
    name: 'Irreplaceable',
    description: 'Complete Daily Sorties seven days in a row.',
    category: 'dedication',
    tier: 'gold',
    points: 140,
    progress: (ctx) => ({ value: Math.min(7, ctx.totals.dailyStreak), target: 7 }),
    check: (ctx) => ctx.totals.dailyStreak >= 7,
  },
  {
    id: 'century-club',
    name: 'Century Club',
    description: 'Submit 100 verified sorties.',
    category: 'dedication',
    tier: 'gold',
    points: 100,
    progress: (ctx) => ({ value: Math.min(100, ctx.totals.runsSubmitted), target: 100 }),
    check: (ctx) => ctx.totals.runsSubmitted >= 100,
  },
  {
    id: 'marathon',
    name: 'Marathon Pilot',
    description: 'Fly for two hours in total.',
    category: 'dedication',
    tier: 'silver',
    points: 45,
    progress: (ctx) => ({ value: Math.min(7_200_000, ctx.totals.totalPlayMs), target: 7_200_000 }),
    check: (ctx) => ctx.totals.totalPlayMs >= 7_200_000,
  },
  {
    id: 'deep-run',
    name: 'Long Haul',
    description: 'Survive a single sortie for over 10 minutes.',
    category: 'survival',
    tier: 'gold',
    points: 95,
    check: (ctx) => ctx.run !== null && ctx.run.durationMs >= 600_000,
  },
  {
    id: 'nightmare',
    name: 'Nightmare Run',
    description: 'Reach wave 15 on Legend difficulty.',
    category: 'survival',
    tier: 'platinum',
    points: 260,
    check: (ctx) => ctx.run !== null && ctx.run.difficulty === 'legend' && ctx.run.wave >= 15,
  },
  {
    id: 'untouched',
    name: 'Untouched',
    description: 'Clear three waves in a row without taking damage.',
    category: 'skill',
    tier: 'gold',
    points: 100,
    hidden: true,
    check: (ctx) => ctx.run !== null && ctx.run.wave >= 3 && ctx.run.stats.livesLost === 0 && ctx.run.stats.damageTaken === 0,
  },
];

export const ACHIEVEMENT_INDEX: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export const TIER_POINTS: Record<AchievementTier, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export function totalAchievementScore(unlockedIds: string[]): number {
  return unlockedIds.reduce((sum, id) => sum + (ACHIEVEMENT_INDEX[id]?.points ?? 0), 0);
}
