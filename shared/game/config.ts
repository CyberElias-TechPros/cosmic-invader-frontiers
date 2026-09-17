/**
 * Tuning + balance tables for Cosmic Invader Frontiers.
 *
 * All numbers are in *logical arena units* (see ARENA) so gameplay is identical
 * on a phone, a laptop and inside a Worker re-simulation.
 */

export const ENGINE_VERSION = '1.1.0';

/** Simulation rate. Fixed timestep → deterministic replays. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Logical playfield. Renderers letterbox this into whatever space they have. */
export const ARENA = { width: 480, height: 720 } as const;

/** Hard cap on a single run so replay verification stays bounded server side. */
export const MAX_RUN_TICKS = 118_800; // ~33 minutes

export type Difficulty = 'cadet' | 'pilot' | 'ace' | 'legend';
export type GameMode = 'campaign' | 'daily' | 'gauntlet';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  blurb: string;
  enemySpeed: number;
  enemyFire: number;
  bulletSpeed: number;
  lives: number;
  scoreMultiplier: number;
  powerupChance: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  cadet: {
    id: 'cadet',
    label: 'Cadet',
    blurb: 'Slower armada, gentler fire. Learn the ropes.',
    enemySpeed: 0.8,
    enemyFire: 0.65,
    bulletSpeed: 0.9,
    lives: 4,
    scoreMultiplier: 0.8,
    powerupChance: 1.35,
  },
  pilot: {
    id: 'pilot',
    label: 'Pilot',
    blurb: 'The intended experience. Balanced threat curve.',
    enemySpeed: 1,
    enemyFire: 1,
    bulletSpeed: 1,
    lives: 3,
    scoreMultiplier: 1,
    powerupChance: 1,
  },
  ace: {
    id: 'ace',
    label: 'Ace',
    blurb: 'Faster formation, aggressive gunners.',
    enemySpeed: 1.22,
    enemyFire: 1.35,
    bulletSpeed: 1.12,
    lives: 3,
    scoreMultiplier: 1.3,
    powerupChance: 0.9,
  },
  legend: {
    id: 'legend',
    label: 'Legend',
    blurb: 'Two lives. The armada shows no mercy.',
    enemySpeed: 1.45,
    enemyFire: 1.75,
    bulletSpeed: 1.25,
    lives: 2,
    scoreMultiplier: 1.75,
    powerupChance: 0.75,
  },
};

export const MODES: Record<GameMode, { id: GameMode; label: string; blurb: string; difficultyLocked?: Difficulty }> = {
  campaign: {
    id: 'campaign',
    label: 'Campaign',
    blurb: 'Endless escalating waves. Boss armada every fifth wave.',
  },
  daily: {
    id: 'daily',
    label: 'Daily Sortie',
    blurb: 'One shared seed per day. Every pilot faces the same armada.',
  },
  gauntlet: {
    id: 'gauntlet',
    label: 'Overdrive Gauntlet',
    blurb: 'Every wave is a boss wave. Score multipliers double.',
    difficultyLocked: 'ace',
  },
};

export const PLAYER = {
  width: 34,
  height: 26,
  speed: 265,
  y: ARENA.height - 58,
  fireCooldown: 14, // ticks
  fireCooldownRapid: 7,
  bulletSpeed: 640,
  invulnTicks: 120, // 2s of mercy after taking a hit
  startLives: 3,
  extraLifeEvery: 25_000,
  maxBullets: 9,
} as const;

export const ENEMY = {
  width: 30,
  height: 24,
  cols: 9,
  rowGap: 38,
  colGap: 46,
  topOffset: 62,
  formationBaseSpeed: 24,
  formationSpeedPerWave: 2.4,
  formationMaxSpeed: 78,
  dropDistance: 12,
  edgeMargin: 16,
  invasionLineOffset: 46,
} as const;

export const COMBAT = {
  enemyBulletSpeed: 250,
  enemyBulletDamage: 1,
  comboWindowTicks: 96, // 1.6s
  comboPerMultiplier: 4,
  maxMultiplier: 8,
  overdrivePerKill: 1,
  overdriveCost: 30,
  overdriveTicks: 360, // 6s
  powerupFallSpeed: 95,
  powerupSize: 22,
  ufoSize: { width: 46, height: 20 },
  ufoSpeed: 105,
  ufoBasePoints: 150,
  bossBonusPoints: 1200,
} as const;

/** Enemy archetypes. `points` are pre-multiplier. */
export type EnemyKind = 'grunt' | 'shooter' | 'tank' | 'weaver' | 'diver';

export interface EnemyArchetype {
  kind: EnemyKind;
  label: string;
  hp: number;
  points: number;
  color: string;
  glow: string;
  fires: boolean;
  fireCooldown: [number, number];
  canDive: boolean;
  sway: number;
  radius?: number;
}

export const ARCHETYPES: Record<EnemyKind, EnemyArchetype> = {
  grunt: {
    kind: 'grunt',
    label: 'Drone',
    hp: 1,
    points: 10,
    color: '#7dd3fc',
    glow: '#38bdf8',
    fires: false,
    fireCooldown: [0, 0],
    canDive: false,
    sway: 0,
  },
  shooter: {
    kind: 'shooter',
    label: 'Gunner',
    hp: 1,
    points: 20,
    color: '#f0abfc',
    glow: '#e879f9',
    fires: true,
    fireCooldown: [110, 210],
    canDive: false,
    sway: 0,
  },
  tank: {
    kind: 'tank',
    label: 'Bulwark',
    hp: 3,
    points: 45,
    color: '#fca5a5',
    glow: '#f87171',
    fires: true,
    fireCooldown: [190, 320],
    canDive: false,
    sway: 0,
  },
  weaver: {
    kind: 'weaver',
    label: 'Weaver',
    hp: 2,
    points: 30,
    color: '#86efac',
    glow: '#4ade80',
    fires: true,
    fireCooldown: [150, 280],
    canDive: false,
    sway: 1,
  },
  diver: {
    kind: 'diver',
    label: 'Striker',
    hp: 1,
    points: 60,
    color: '#fdba74',
    glow: '#fb923c',
    fires: false,
    fireCooldown: [0, 0],
    canDive: true,
    sway: 0.5,
  },
};

export type PowerupKind = 'rapid' | 'spread' | 'shield' | 'life' | 'double' | 'charge';

export const POWERUPS: Record<
  PowerupKind,
  { kind: PowerupKind; label: string; color: string; duration: number; description: string }
> = {
  rapid: { kind: 'rapid', label: 'Rapid Fire', color: '#38bdf8', duration: 720, description: 'Double rate of fire.' },
  spread: { kind: 'spread', label: 'Tri-Spread', color: '#a855f7', duration: 720, description: 'Three-way cannon.' },
  shield: { kind: 'shield', label: 'Aegis', color: '#22d3ee', duration: 0, description: 'Absorbs the next hit.' },
  life: { kind: 'life', label: 'Reinforcement', color: '#f472b6', duration: 0, description: 'Gain one ship.' },
  double: { kind: 'double', label: 'Score Surge', color: '#facc15', duration: 900, description: 'Double score for 15s.' },
  charge: { kind: 'charge', label: 'Overdrive Cell', color: '#4ade80', duration: 0, description: 'Instantly refills Overdrive.' },
};

/** Score bonus for surviving structures at wave clear (per remaining HP). */
export const BUNKER_SURVIVAL_BONUS = 8;

/** Waves use a boss on every Nth wave. */
export const BOSS_EVERY = 5;

export const BOSS = {
  width: 148,
  height: 92,
  baseHp: 220,
  hpPerWave: 62,
  entryTicks: 90,
  /** Phase thresholds as fraction of max hp. */
  phaseThresholds: [0.66, 0.33],
} as const;
