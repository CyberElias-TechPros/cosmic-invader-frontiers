
export type EntityPosition = {
  x: number;
  y: number;
};

export type EntitySize = {
  width: number;
  height: number;
};

export type Entity = EntityPosition & EntitySize & {
  id: string;
};

export type Star = {
  id: number;
  x: number;
  y: number;
  size: 'small' | 'medium' | 'large';
  duration: number;
  delay: number;
};

export type Player = Entity & {
  lives: number;
  speed: number;
  cooldown: number;
  lastShot: number;
};

export type EnemyType = 'basic' | 'shooter' | 'tank' | 'ufo';

export type Enemy = Entity & {
  type: EnemyType;
  points: number;
  speed: number;
  health: number;
  cooldown?: number;
  lastShot?: number;
};

export type ProjectileSource = 'player' | 'enemy';

export type Projectile = Entity & {
  speed: number;
  source: ProjectileSource;
};

export type Shield = Entity & {
  health: number;
};

export type GameStatus = 'ready' | 'playing' | 'paused' | 'gameOver';

export type GameState = {
  status: GameStatus;
  score: number;
  highScore: number;
  level: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  shields: Shield[];
  ufo: Enemy | null;
  lastUfoSpawn: number;
};

export type GameSettings = {
  soundEnabled: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
};
