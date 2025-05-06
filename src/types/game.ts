
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

export type Player = Entity & {
  lives: number;
  speed: number;
  cooldown: number;
  lastShot: number;
};

export type Enemy = Entity & {
  type: 'basic' | 'shooter' | 'tank' | 'ufo';
  points: number;
  speed: number;
  health: number;
  cooldown?: number;
  lastShot?: number;
};

export type Projectile = Entity & {
  speed: number;
  source: 'player' | 'enemy';
};

export type Shield = Entity & {
  health: number;
};

export type GameState = {
  status: 'ready' | 'playing' | 'paused' | 'gameOver';
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
