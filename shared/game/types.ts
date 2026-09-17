import type { Difficulty, EnemyKind, GameMode, PowerupKind } from './config';

/** A single simulation tick's worth of player intent. */
export interface InputState {
  left: boolean;
  right: boolean;
  fire: boolean;
  special: boolean;
}

export const EMPTY_INPUT: InputState = { left: false, right: false, fire: false, special: false };

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  from: 'player' | 'enemy';
  damage: number;
  kind: 'bolt' | 'plasma' | 'orb' | 'lance';
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  col: number;
  row: number;
  /** offset from the formation origin while docked */
  ox: number;
  oy: number;
  /** absolute position, always maintained for collision */
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  fireTimer: number;
  swayPhase: number;
  swayAmount: number;
  mode: 'formation' | 'diving' | 'returning';
  vx: number;
  vy: number;
  scoreValue: number;
  /** hit flash counter for the renderer */
  flash: number;
}

export interface PowerupState {
  id: number;
  kind: PowerupKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  phase: number;
}

export interface BunkerState {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
}

export interface UfoState {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  hp: number;
  scoreValue: number;
  flash: number;
}

export interface BossState {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  phase: number;
  entryTimer: number;
  attackTimer: number;
  pattern: number;
  patternStep: number;
  hitFlash: number;
  scoreValue: number;
  enraged: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  cooldown: number;
  invuln: number;
  lives: number;
  shieldCharges: number;
  rapidTicks: number;
  spreadTicks: number;
  doubleTicks: number;
  overdriveCharge: number;
  overdriveTicks: number;
  specialHeld: boolean;
  thrust: number;
}

export interface WaveModifier {
  id: string;
  label: string;
  blurb: string;
  speedMult: number;
  fireMult: number;
  hpBonus: number;
  bonusPoints: number;
}

export interface WavePlan {
  wave: number;
  isBoss: boolean;
  cols: number;
  rows: number;
  slots: Array<{ col: number; row: number; kind: EnemyKind }>;
  modifier: WaveModifier | null;
  speedMult: number;
  fireMult: number;
  announcement: string;
}

export interface RunStats {
  shotsFired: number;
  shotsHit: number;
  kills: number;
  bossKills: number;
  livesLost: number;
  powerupsCollected: number;
  maxCombo: number;
  ufosDestroyed: number;
  bunkersLost: number;
  diversKilled: number;
  damageTaken: number;
}

export type SimEventType =
  | 'playerShot'
  | 'enemyShot'
  | 'enemyHit'
  | 'explosion'
  | 'bossExplosion'
  | 'playerHit'
  | 'playerDeath'
  | 'powerupSpawn'
  | 'powerupPickup'
  | 'bunkerHit'
  | 'bunkerDestroyed'
  | 'waveStart'
  | 'waveClear'
  | 'bossSpawn'
  | 'bossPhase'
  | 'bossDefeated'
  | 'ufoAppear'
  | 'ufoDestroyed'
  | 'dive'
  | 'extraLife'
  | 'overdriveStart'
  | 'overdriveEnd'
  | 'comboBreak'
  | 'invasion'
  | 'gameOver'
  | 'maxTicks';

export interface SimEvent {
  type: SimEventType;
  x?: number;
  y?: number;
  value?: number;
  text?: string;
  kind?: EnemyKind | PowerupKind;
}

export type SimStatus = 'playing' | 'waveClear' | 'gameOver';

export interface SimState {
  /** engine version that produced this state — replays are only valid for a match */
  version: string;
  tick: number;
  time: number;
  seed: number;
  rng: number;
  mode: GameMode;
  difficulty: Difficulty;
  assistMode: boolean;
  status: SimStatus;
  endReason: 'none' | 'destroyed' | 'invaded' | 'maxTicks' | 'aborted';

  score: number;
  combo: number;
  comboTimer: number;
  wave: number;
  waveClearTimer: number;
  extraLifeAt: number;
  powerupCounter: number;

  player: PlayerState;
  enemies: EnemyState[];
  bullets: Bullet[];
  powerups: PowerupState[];
  bunkers: BunkerState[];
  ufo: UfoState | null;
  boss: BossState | null;

  /** Formation is stored as an offset from each enemy's docked slot. */
  formation: { offsetX: number; offsetY: number; dir: 1 | -1; speedMult: number; fireMult: number; ufoTimer: number };

  waveModifier: WaveModifier | null;
  stats: RunStats;
  events: SimEvent[];

  nextId: number;
  /** number of ticks the player was firing — used for input compression */
  firedTicks: number;
  maxTicks: number;
}

export interface HudSnapshot {
  status: SimStatus;
  score: number;
  combo: number;
  comboMultiplier: number;
  wave: number;
  isBossWave: boolean;
  lives: number;
  shieldCharges: number;
  overdriveCharge: number;
  overdriveReady: boolean;
  overdriveActive: boolean;
  waveModifier: string | null;
  bossHp: number;
  bossMaxHp: number;
  enemiesRemaining: number;
  accuracy: number;
  timeSeconds: number;
}

export interface RunResult {
  version: string;
  mode: GameMode;
  difficulty: Difficulty;
  assistMode: boolean;
  seed: number;
  score: number;
  wave: number;
  ticks: number;
  durationMs: number;
  endReason: SimState['endReason'];
  stats: RunStats;
  accuracy: number;
}
