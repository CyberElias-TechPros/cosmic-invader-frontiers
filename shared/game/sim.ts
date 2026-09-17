import {
  ARENA,
  ARCHETYPES,
  BOSS,
  BUNKER_SURVIVAL_BONUS,
  COMBAT,
  DIFFICULTIES,
  DT,
  ENEMY,
  ENGINE_VERSION,
  MAX_RUN_TICKS,
  PLAYER,
  POWERUPS,
  type Difficulty,
  type GameMode,
  type PowerupKind,
} from './config';
import { Rng } from './rng';
import type {
  Bullet,
  BossState,
  BunkerState,
  EnemyState,
  HudSnapshot,
  InputState,
  PlayerState,
  PowerupState,
  SimEvent,
  SimState,
  UfoState,
} from './types';
import { buildEnemies, createWavePlan } from './waves';

/* -------------------------------------------------------------------------- */
/*  Deterministic numeric helpers                                             */
/* -------------------------------------------------------------------------- */

/** mulberry32 step, kept inline so no allocation happens per tick. */
function frand(state: SimState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function firand(state: SimState, min: number, max: number): number {
  return min + Math.floor(frand(state) * (max - min + 1));
}

function fbool(state: SimState, chance: number): boolean {
  return frand(state) < chance;
}

/** Unit vectors on a 16 point circle — avoids trig so results are portable. */
const DIRS16: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.92388, 0.38268],
  [0.70711, 0.70711],
  [0.38268, 0.92388],
  [0, 1],
  [-0.38268, 0.92388],
  [-0.70711, 0.70711],
  [-0.92388, 0.38268],
  [-1, 0],
  [-0.92388, -0.38268],
  [-0.70711, -0.70711],
  [-0.38268, -0.92388],
  [0, -1],
  [0.38268, -0.92388],
  [0.70711, -0.70711],
  [0.92388, -0.38268],
];

function aabb(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/* -------------------------------------------------------------------------- */
/*  Construction                                                              */
/* -------------------------------------------------------------------------- */

export interface SimOptions {
  seed: number;
  mode: GameMode;
  difficulty: Difficulty;
  assistMode?: boolean;
  /** Wave to start on (daily challenges always start at wave 1). */
  startWave?: number;
}

export const RUN_MODES: readonly GameMode[] = ['campaign', 'daily', 'gauntlet'] as const;

function createPlayer(difficulty: Difficulty, assistMode: boolean): PlayerState {
  const cfg = DIFFICULTIES[difficulty];
  return {
    x: ARENA.width / 2 - PLAYER.width / 2,
    y: PLAYER.y,
    w: PLAYER.width,
    h: PLAYER.height,
    vx: 0,
    cooldown: 0,
    invuln: 90,
    lives: cfg.lives + (assistMode ? 1 : 0),
    shieldCharges: 0,
    rapidTicks: 0,
    spreadTicks: 0,
    doubleTicks: 0,
    overdriveCharge: 0,
    overdriveTicks: 0,
    specialHeld: false,
    thrust: 0,
  };
}

function createBunkers(): BunkerState[] {
  const count = 4;
  const w = 52;
  const h = 34;
  const gap = (ARENA.width - count * w) / (count + 1);
  const y = ARENA.height - 168;
  const bunkers: BunkerState[] = [];
  for (let i = 0; i < count; i++) {
    bunkers.push({
      id: i + 1,
      x: gap + i * (w + gap),
      y,
      w,
      h,
      hp: 6,
      maxHp: 6,
    });
  }
  return bunkers;
}

export function createSim(options: SimOptions): SimState {
  const { seed, mode, difficulty, assistMode = false, startWave = 1 } = options;
  const state: SimState = {
    version: ENGINE_VERSION,
    tick: 0,
    time: 0,
    seed: seed >>> 0,
    rng: (seed >>> 0) || 0x1a2b3c4d,
    mode,
    difficulty,
    assistMode,
    status: 'playing',
    endReason: 'none',
    score: 0,
    combo: 0,
    comboTimer: 0,
    wave: startWave - 1,
    waveClearTimer: 0,
    extraLifeAt: PLAYER.extraLifeEvery,
    powerupCounter: 0,
    player: createPlayer(difficulty, assistMode),
    enemies: [],
    bullets: [],
    powerups: [],
    bunkers: createBunkers(),
    ufo: null,
    boss: null,
    formation: { offsetX: 0, offsetY: 0, dir: 1, speedMult: 1, fireMult: 1, ufoTimer: 900 },
    waveModifier: null,
    stats: {
      shotsFired: 0,
      shotsHit: 0,
      kills: 0,
      bossKills: 0,
      livesLost: 0,
      powerupsCollected: 0,
      maxCombo: 0,
      ufosDestroyed: 0,
      bunkersLost: 0,
      diversKilled: 0,
      damageTaken: 0,
    },
    events: [],
    nextId: 1,
    firedTicks: 0,
    maxTicks: MAX_RUN_TICKS,
  };
  beginWave(state);
  return state;
}

function id(state: SimState): number {
  return state.nextId++;
}

/** Spawn the next wave of the armada (or the boss). */
export function beginWave(state: SimState): void {
  state.wave += 1;
  const plan = createWavePlan(state.seed, state.wave, state.mode);
  state.waveModifier = plan.modifier;
  state.formation.offsetX = 0;
  state.formation.offsetY = 0;
  state.formation.dir = 1;
  state.formation.speedMult = plan.speedMult;
  state.formation.fireMult = plan.fireMult;
  state.bullets = state.bullets.filter((b) => b.from === 'player');
  state.ufo = null;
  state.formation.ufoTimer = firand(state, 720, 1500);

  if (plan.isBoss) {
    const hp = BOSS.baseHp + BOSS.hpPerWave * state.wave;
    const boss: BossState = {
      id: id(state),
      x: ARENA.width / 2 - BOSS.width / 2,
      y: -BOSS.height,
      w: BOSS.width,
      h: BOSS.height,
      hp,
      maxHp: hp,
      phase: 1,
      entryTimer: BOSS.entryTicks,
      attackTimer: 90,
      pattern: 0,
      patternStep: 0,
      hitFlash: 0,
      scoreValue: COMBAT.bossBonusPoints + state.wave * 120,
      enraged: false,
    };
    state.boss = boss;
    state.enemies = [];
    state.events.push({ type: 'bossSpawn', x: boss.x + boss.w / 2, y: 80 });
  } else {
    const rng = new Rng(state.rng);
    state.enemies = buildEnemies(plan, plan.modifier?.hpBonus ?? 0, rng, () => id(state));
    state.rng = rng.state;
    state.boss = null;
  }

  state.events.push({ type: 'waveStart', value: state.wave, text: plan.announcement });
}

/* -------------------------------------------------------------------------- */
/*  Score / damage helpers                                                    */
/* -------------------------------------------------------------------------- */

function comboMultiplier(state: SimState): number {
  const raw = 1 + Math.floor(state.combo / COMBAT.comboPerMultiplier);
  return Math.min(COMBAT.maxMultiplier, raw);
}

function scoreMultiplier(state: SimState): number {
  let mult = DIFFICULTIES[state.difficulty].scoreMultiplier * comboMultiplier(state);
  if (state.mode === 'gauntlet') mult *= 2;
  if (state.player.doubleTicks > 0) mult *= 2;
  return mult;
}

function addScore(state: SimState, base: number): number {
  const gained = Math.round(base * scoreMultiplier(state));
  state.score += gained;
  while (state.score >= state.extraLifeAt) {
    state.player.lives += 1;
    state.extraLifeAt += PLAYER.extraLifeEvery;
    state.events.push({ type: 'extraLife', value: state.player.lives, text: 'REINFORCEMENT' });
  }
  return gained;
}

function registerKill(state: SimState, enemy: EnemyState, x: number, y: number): void {
  state.stats.kills += 1;
  if (enemy.kind === 'diver') state.stats.diversKilled += 1;
  state.combo += 1;
  state.comboTimer = COMBAT.comboWindowTicks;
  if (state.combo > state.stats.maxCombo) state.stats.maxCombo = state.combo;
  addScore(state, enemy.scoreValue);
  state.player.overdriveCharge = Math.min(
    COMBAT.overdriveCost,
    state.player.overdriveCharge + COMBAT.overdrivePerKill,
  );
  state.events.push({ type: 'explosion', x, y, kind: enemy.kind, value: enemy.scoreValue });
  maybeDropPowerup(state, x, y, 0.07 + (enemy.kind === 'tank' ? 0.18 : 0));
}

function maybeDropPowerup(state: SimState, x: number, y: number, chance: number): void {
  const cfg = DIFFICULTIES[state.difficulty];
  if (!fbool(state, Math.min(0.9, chance * cfg.powerupChance))) return;
  spawnPowerup(state, x, y, rollPowerupKind(state));
}

function rollPowerupKind(state: SimState): PowerupKind {
  const roll = frand(state);
  if (roll < 0.2) return 'rapid';
  if (roll < 0.4) return 'spread';
  if (roll < 0.56) return 'shield';
  if (roll < 0.7) return 'double';
  if (roll < 0.86) return 'charge';
  return 'life';
}

export function spawnPowerup(state: SimState, x: number, y: number, kind: PowerupKind): void {
  const size = COMBAT.powerupSize;
  state.powerups.push({
    id: id(state),
    kind,
    x: x - size / 2,
    y: y - size / 2,
    w: size,
    h: size,
    vy: COMBAT.powerupFallSpeed,
    phase: state.powerupCounter++,
  });
  state.events.push({ type: 'powerupSpawn', x, y, kind });
}

function damagePlayer(state: SimState, cause: 'bullet' | 'contact'): void {
  const player = state.player;
  if (player.invuln > 0) return;

  if (player.shieldCharges > 0) {
    player.shieldCharges -= 1;
    player.invuln = 48;
    state.events.push({ type: 'playerHit', x: player.x + player.w / 2, y: player.y, text: 'AEGIS ABSORBED' });
    // A shield save keeps the combo alive: rewarding, but not free.
    state.comboTimer = Math.max(state.comboTimer, 60);
    return;
  }

  state.stats.damageTaken += 1;
  state.stats.livesLost += 1;
  player.lives -= 1;
  player.invuln = PLAYER.invulnTicks;
  player.x = ARENA.width / 2 - player.w / 2;
  player.shieldCharges = 0;
  player.rapidTicks = 0;
  player.spreadTicks = 0;
  player.doubleTicks = 0;
  player.overdriveTicks = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.events.push({
    type: 'playerHit',
    x: player.x + player.w / 2,
    y: player.y,
    text: cause === 'contact' ? 'HULL BREACH' : 'SHIP DESTROYED',
  });

  if (player.lives <= 0) {
    endRun(state, 'destroyed');
  }
}

function endRun(state: SimState, reason: SimState['endReason']): void {
  if (state.status === 'gameOver') return;
  state.status = 'gameOver';
  state.endReason = reason;
  state.events.push({ type: 'gameOver', value: state.score, text: reason });
}

/* -------------------------------------------------------------------------- */
/*  Bullets                                                                   */
/* -------------------------------------------------------------------------- */

function playerBulletSpeed(): number {
  return PLAYER.bulletSpeed;
}

function spawnPlayerBullets(state: SimState): void {
  const player = state.player;
  const bullets = state.bullets;
  const playerBulletCount = bullets.filter((b) => b.from === 'player').length;
  if (playerBulletCount >= PLAYER.maxBullets) return;

  const spread = player.spreadTicks > 0 || player.overdriveTicks > 0;
  const damage = player.overdriveTicks > 0 ? 2 : 1;
  const cx = player.x + player.w / 2;
  const y = player.y - 4;

  const push = (dx: number, vx: number) => {
    bullets.push({
      id: id(state),
      x: cx + dx - 2,
      y,
      vx,
      vy: -playerBulletSpeed(),
      w: 4,
      h: 16,
      from: 'player',
      damage,
      kind: player.overdriveTicks > 0 ? 'lance' : 'bolt',
    });
  };

  if (spread) {
    push(0, 0);
    push(-9, -60);
    push(9, 60);
  } else {
    push(0, 0);
  }
  state.stats.shotsFired += spread ? 3 : 1;
}

function spawnEnemyBullet(state: SimState, x: number, y: number, vx: number, vy: number, kind: Bullet['kind'] = 'orb'): void {
  state.bullets.push({
    id: id(state),
    x,
    y,
    vx,
    vy,
    w: 8,
    h: 8,
    from: 'enemy',
    damage: 1,
    kind,
  });
  state.events.push({ type: 'enemyShot', x, y });
}

function maxEnemyBullets(state: SimState): number {
  const base = 10 + Math.floor(state.wave * 1.4);
  return Math.min(38, base);
}

/* -------------------------------------------------------------------------- */
/*  Main step                                                                 */
/* -------------------------------------------------------------------------- */

export function stepSim(state: SimState, input: InputState): SimEvent[] {
  state.events = [];
  if (state.status === 'gameOver') return state.events;

  state.tick += 1;
  state.time = state.tick * DT;

  if (state.tick >= state.maxTicks) {
    addScore(state, 0);
    endRun(state, 'maxTicks');
    state.events.push({ type: 'maxTicks', text: 'SORTIE LIMIT REACHED' });
    return state.events;
  }

  updatePlayer(state, input);
  updateWaveState(state);
  updateFormation(state);
  updateEnemies(state);
  updateBoss(state);
  updateUfo(state);
  updateBullets(state);
  updatePowerups(state);
  resolveCollisions(state);

  // combo decay
  if (state.comboTimer > 0) {
    state.comboTimer -= 1;
    if (state.comboTimer === 0 && state.combo > 0) {
      state.combo = 0;
    }
  }

  return state.events;
}

function updatePlayer(state: SimState, input: InputState): void {
  const player = state.player;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    player.x += dir * PLAYER.speed * DT;
    player.vx = dir * PLAYER.speed;
    player.thrust = Math.min(1, player.thrust + 0.08);
  } else {
    player.vx *= 0.8;
    player.thrust = Math.max(0, player.thrust - 0.05);
  }
  player.x = Math.max(8, Math.min(ARENA.width - player.w - 8, player.x));

  if (player.cooldown > 0) player.cooldown -= 1;
  if (player.invuln > 0) player.invuln -= 1;
  if (player.rapidTicks > 0) player.rapidTicks -= 1;
  if (player.spreadTicks > 0) player.spreadTicks -= 1;
  if (player.doubleTicks > 0) player.doubleTicks -= 1;

  if (player.overdriveTicks > 0) {
    player.overdriveTicks -= 1;
    if (player.overdriveTicks === 0) {
      state.events.push({ type: 'overdriveEnd' });
    }
  }

  // Overdrive activation (edge triggered)
  if (input.special && !player.specialHeld && player.overdriveTicks === 0 && player.overdriveCharge >= COMBAT.overdriveCost) {
    player.overdriveCharge = 0;
    player.overdriveTicks = COMBAT.overdriveTicks;
    state.events.push({
      type: 'overdriveStart',
      x: player.x + player.w / 2,
      y: player.y,
      text: 'OVERDRIVE ENGAGED',
    });
  }
  player.specialHeld = input.special;

  const cooldown = player.overdriveTicks > 0 ? 5 : player.rapidTicks > 0 ? PLAYER.fireCooldownRapid : PLAYER.fireCooldown;
  if (input.fire && player.cooldown <= 0 && state.status === 'playing') {
    spawnPlayerBullets(state);
    player.cooldown = cooldown;
    state.firedTicks += 1;
    state.events.push({ type: 'playerShot', x: player.x + player.w / 2, y: player.y });
  }
}

function updateWaveState(state: SimState): void {
  if (state.enemies.length > 0 || state.boss) return;
  if (state.status === 'gameOver') return;

  if (state.status === 'playing') {
    // wave cleared
    const modifierBonus = state.waveModifier?.bonusPoints ?? 0;
    const bunkerBonus = state.bunkers.reduce((total, b) => total + b.hp, 0) * BUNKER_SURVIVAL_BONUS;
    const bonus = modifierBonus + bunkerBonus + 150 + state.wave * 25;
    addScore(state, bonus);
    state.status = 'waveClear';
    state.waveClearTimer = 110;
    state.bullets = state.bullets.filter((b) => b.from === 'player');
    state.events.push({
      type: 'waveClear',
      value: bonus,
      text: `WAVE ${state.wave} CLEARED · +${bonus}`,
    });
    return;
  }

  if (state.status === 'waveClear') {
    state.waveClearTimer -= 1;
    if (state.waveClearTimer <= 0) {
      state.status = 'playing';
      beginWave(state);
    }
  }
}

function updateFormation(state: SimState): void {
  const docked = state.enemies.filter((e) => e.mode !== 'diving');
  if (docked.length === 0) return;

  // Formation accelerates as its numbers thin out (classic arcade pressure).
  const total = Math.max(1, state.enemies.length);
  const pressure = 1 + (1 - Math.min(1, docked.length / Math.max(1, total))) * 1.9;
  const cfg = DIFFICULTIES[state.difficulty];
  const base = Math.min(
    ENEMY.formationMaxSpeed,
    ENEMY.formationBaseSpeed + state.wave * ENEMY.formationSpeedPerWave,
  );
  const speed = base * state.formation.speedMult * pressure * cfg.enemySpeed;

  let minX = Infinity;
  let maxX = -Infinity;
  for (const enemy of docked) {
    minX = Math.min(minX, enemy.ox + state.formation.offsetX);
    maxX = Math.max(maxX, enemy.ox + state.formation.offsetX + enemy.w);
  }

  const willHitRight = maxX + speed * DT >= ARENA.width - ENEMY.edgeMargin;
  const willHitLeft = minX - speed * DT <= ENEMY.edgeMargin;

  if ((state.formation.dir === 1 && willHitRight) || (state.formation.dir === -1 && willHitLeft)) {
    state.formation.dir = state.formation.dir === 1 ? -1 : 1;
    state.formation.offsetY += ENEMY.dropDistance;
  } else {
    state.formation.offsetX += state.formation.dir * speed * DT;
  }
}

function updateEnemies(state: SimState): void {
  const cfg = DIFFICULTIES[state.difficulty];
  const fireMult = state.formation.fireMult * cfg.enemyFire * (state.assistMode ? 0.78 : 1);
  const maxBullets = maxEnemyBullets(state);
  const enemyBullets = state.bullets.reduce((n, b) => n + (b.from === 'enemy' ? 1 : 0), 0);
  let bulletsSpawned = 0;

  for (const enemy of state.enemies) {
    if (enemy.flash > 0) enemy.flash -= 1;

    if (enemy.mode === 'formation') {
      const sway = enemy.swayAmount === 0 ? 0 : swayValue(state.tick, enemy.swayPhase) * enemy.swayAmount * 6;
      enemy.x = enemy.ox + state.formation.offsetX + sway;
      enemy.y = enemy.oy + state.formation.offsetY;
    } else if (enemy.mode === 'diving') {
      enemy.x += enemy.vx * DT;
      enemy.y += enemy.vy * DT;
      if (enemy.y > ARENA.height + 40) {
        enemy.mode = 'returning';
        enemy.y = -enemy.h - 10;
        enemy.x = Math.max(12, Math.min(ARENA.width - enemy.w - 12, enemy.ox + state.formation.offsetX));
        enemy.vx = 0;
        enemy.vy = 120;
      }
    } else {
      // returning to formation slot
      const targetX = enemy.ox + state.formation.offsetX;
      const targetY = enemy.oy + state.formation.offsetY;
      const dx = targetX - enemy.x;
      const dy = targetY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 6) {
        enemy.mode = 'formation';
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.x = targetX;
        enemy.y = targetY;
      } else {
        const inv = 200 / dist;
        enemy.x += dx * inv * DT;
        enemy.y += dy * inv * DT;
      }
    }

    // Fire control
    const archetype = ARCHETYPES[enemy.kind];
    if (archetype.fires && state.status === 'playing' && bulletsSpawned + enemyBullets < maxBullets) {
      enemy.fireTimer -= 1;
      if (enemy.fireTimer <= 0) {
        const next = firand(state, archetype.fireCooldown[0], archetype.fireCooldown[1]);
        enemy.fireTimer = Math.max(28, Math.round(next / fireMult));
        if (fbool(state, Math.min(0.85, 0.55 * fireMult))) {
          const bx = enemy.x + enemy.w / 2 - 4;
          const by = enemy.y + enemy.h;
          const speed = COMBAT.enemyBulletSpeed * cfg.bulletSpeed;
          if (enemy.kind === 'tank') {
            // Bulwarks bracket the player.
            spawnEnemyBullet(state, bx, by, -40, speed, 'plasma');
            spawnEnemyBullet(state, bx, by, 40, speed, 'plasma');
            bulletsSpawned += 2;
          } else if (enemy.kind === 'weaver') {
            const dir = aimDirection(state, bx, by);
            spawnEnemyBullet(state, bx, by, dir * speed * 0.55, speed * 0.92, 'plasma');
            bulletsSpawned += 1;
          } else {
            spawnEnemyBullet(state, bx, by, 0, speed, 'orb');
            bulletsSpawned += 1;
          }
        }
      }
    }

    // Dive decision
    if (archetype.canDive && enemy.mode === 'formation' && state.status === 'playing') {
      const diveChance = 0.0016 * (state.wave > 3 ? 1.4 : 1) * fireMult;
      if (fbool(state, diveChance)) {
        enemy.mode = 'diving';
        const dx = state.player.x + state.player.w / 2 - (enemy.x + enemy.w / 2);
        const dy = Math.max(60, state.player.y - enemy.y);
        const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const speed = 190 + state.wave * 4;
        enemy.vx = (dx / len) * speed * 0.55;
        enemy.vy = (dy / len) * speed;
        state.events.push({ type: 'dive', x: enemy.x, y: enemy.y, kind: enemy.kind });
      }
    }
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}

/** Smooth triangle wave in [-1, 1] used for enemy sway + boss movement. */
function swayValue(tick: number, phase: number): number {
  const period = 120;
  const p = ((tick + phase * 17) % period) / period;
  return 1 - 4 * Math.abs(p - 0.5);
}

function aimDirection(state: SimState, x: number, y: number): number {
  const dx = state.player.x + state.player.w / 2 - x;
  return dx > 0 ? 1 : -1;
}

function updateBoss(state: SimState): void {
  const boss = state.boss;
  if (!boss) return;
  const cfg = DIFFICULTIES[state.difficulty];
  if (boss.hitFlash > 0) boss.hitFlash -= 1;

  if (boss.entryTimer > 0) {
    boss.entryTimer -= 1;
    boss.y = -BOSS.height + (BOSS.entryTicks - boss.entryTimer) * ((140 + BOSS.height) / BOSS.entryTicks);
    return;
  }

  const hpRatio = boss.hp / boss.maxHp;
  if (boss.phase === 1 && hpRatio <= BOSS.phaseThresholds[0]) {
    boss.phase = 2;
    boss.enraged = false;
    state.events.push({ type: 'bossPhase', value: 2, x: boss.x + boss.w / 2, y: boss.y, text: 'PHASE TWO' });
  } else if (boss.phase === 2 && hpRatio <= BOSS.phaseThresholds[1]) {
    boss.phase = 3;
    boss.enraged = true;
    state.events.push({ type: 'bossPhase', value: 3, x: boss.x + boss.w / 2, y: boss.y, text: 'FINAL PHASE' });
  }

  const speedFactor = boss.phase === 3 ? 1.6 : boss.phase === 2 ? 1.25 : 1;
  const tri = swayValue(state.tick, boss.phase * 3);
  const margin = 12;
  const span = ARENA.width - boss.w - margin * 2;
  boss.x = margin + ((tri + 1) / 2) * span;
  boss.y = 78 + swayValue(state.tick, boss.phase * 11) * (6 + boss.phase * 3);

  boss.attackTimer -= speedFactor;
  if (boss.attackTimer > 0) return;

  const speed = COMBAT.enemyBulletSpeed * cfg.bulletSpeed * (boss.enraged ? 1.25 : 1) * (state.assistMode ? 0.85 : 1);
  const cx = boss.x + boss.w / 2;
  const cy = boss.y + boss.h - 6;

  const pattern = (boss.pattern + (boss.phase - 1)) % 4;
  boss.patternStep += 1;

  if (pattern === 0) {
    // triple volley from three cannons
    spawnEnemyBullet(state, boss.x + 14, cy, -18, speed, 'plasma');
    spawnEnemyBullet(state, cx - 4, cy + 6, 0, speed * 1.05, 'plasma');
    spawnEnemyBullet(state, boss.x + boss.w - 22, cy, 18, speed, 'plasma');
    boss.attackTimer = boss.phase === 3 ? 34 : 46;
  } else if (pattern === 1) {
    // fan of eight using the fixed direction table
    for (let i = 2; i <= 6; i++) {
      const dir = DIRS16[(i + 2) % 16];
      spawnEnemyBullet(state, cx - 4, cy, dir[0] * speed * 0.8, dir[1] * speed * 0.55, 'orb');
    }
    boss.attackTimer = boss.phase === 3 ? 60 : 84;
  } else if (pattern === 2) {
    // aimed burst
    const dx = state.player.x + state.player.w / 2 - cx;
    const dy = Math.max(30, state.player.y - cy);
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    spawnEnemyBullet(state, cx - 4, cy, (dx / len) * speed, (dy / len) * speed, 'plasma');
    spawnEnemyBullet(state, cx - 18, cy, (dx / len) * speed * 0.9, (dy / len) * speed, 'plasma');
    boss.attackTimer = boss.phase === 3 ? 26 : 40;
  } else {
    // rain sweep
    const count = boss.phase === 3 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const x = firand(state, 20, ARENA.width - 28);
      spawnEnemyBullet(state, x, boss.y + boss.h, 0, speed * (0.9 + 0.1 * i), 'orb');
    }
    boss.attackTimer = boss.phase === 3 ? 50 : 70;
  }
}

function updateUfo(state: SimState): void {
  if (state.ufo) {
    const ufo = state.ufo;
    if (ufo.flash > 0) ufo.flash -= 1;
    ufo.x += ufo.vx * DT;
    if (ufo.x > ARENA.width + 60) {
      state.ufo = null;
      state.formation.ufoTimer = firand(state, 900, 1900);
    }
    return;
  }

  if (state.status !== 'playing') return;
  state.formation.ufoTimer -= 1;
  if (state.formation.ufoTimer > 0) return;

  const ufo: UfoState = {
    id: id(state),
    x: -COMBAT.ufoSize.width - 10,
    y: 34,
    w: COMBAT.ufoSize.width,
    h: COMBAT.ufoSize.height,
    vx: COMBAT.ufoSpeed * (fbool(state, 0.5) ? 1 : -1),
    hp: 1,
    scoreValue: COMBAT.ufoBasePoints,
    flash: 0,
  };
  if (ufo.vx < 0) {
    ufo.x = ARENA.width + 10;
    ufo.y = 34;
  }
  state.ufo = ufo;
  state.events.push({ type: 'ufoAppear', x: ufo.x, y: ufo.y });
}

function updateBullets(state: SimState): void {
  const bullets: Bullet[] = [];
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * DT;
    bullet.y += bullet.vy * DT;
    if (bullet.y < -30 || bullet.y > ARENA.height + 30 || bullet.x < -30 || bullet.x > ARENA.width + 30) {
      continue;
    }
    bullets.push(bullet);
  }
  state.bullets = bullets;
}

function updatePowerups(state: SimState): void {
  const kept: PowerupState[] = [];
  for (const powerup of state.powerups) {
    powerup.y += powerup.vy * DT;
    powerup.phase += 1;
    if (powerup.y > ARENA.height + 30) continue;
    kept.push(powerup);
  }
  state.powerups = kept;
}

function applyPowerup(state: SimState, kind: PowerupKind): void {
  const player = state.player;
  const cfg = POWERUPS[kind];
  switch (kind) {
    case 'rapid':
      player.rapidTicks = cfg.duration;
      break;
    case 'spread':
      player.spreadTicks = cfg.duration;
      break;
    case 'shield':
      player.shieldCharges = Math.min(3, player.shieldCharges + 1);
      break;
    case 'life':
      player.lives = Math.min(9, player.lives + 1);
      break;
    case 'double':
      player.doubleTicks = cfg.duration;
      break;
    case 'charge':
      player.overdriveCharge = COMBAT.overdriveCost;
      break;
  }
  state.stats.powerupsCollected += 1;
  state.events.push({ type: 'powerupPickup', kind, x: player.x + player.w / 2, y: player.y, value: cfg.duration });
}

function resolveCollisions(state: SimState): void {
  const player = state.player;

  // ---- player bullets vs. bunkers (friendly fire is part of the strategy)
  const survivingBullets: Bullet[] = [];
  for (const bullet of state.bullets) {
    let consumed = false;
    for (const bunker of state.bunkers) {
      if (bunker.hp <= 0) continue;
      if (aabb(bullet.x, bullet.y, bullet.w, bullet.h, bunker.x, bunker.y, bunker.w, bunker.h)) {
        if (bullet.from === 'player') {
          bunker.hp -= 1;
          state.events.push({ type: 'bunkerHit', x: bullet.x, y: bullet.y });
          consumed = true;
          break;
        }
        // enemy fire also chews through cover
        bunker.hp -= 1;
        state.events.push({ type: 'bunkerHit', x: bullet.x, y: bullet.y });
        consumed = true;
        break;
      }
    }
    if (!consumed) survivingBullets.push(bullet);
  }
  state.bullets = survivingBullets;

  const destroyedBunkers = state.bunkers.filter((b) => b.hp <= 0);
  if (destroyedBunkers.length > 0) {
    for (const bunker of destroyedBunkers) {
      state.stats.bunkersLost += 1;
      state.events.push({ type: 'bunkerDestroyed', x: bunker.x + bunker.w / 2, y: bunker.y + bunker.h / 2 });
    }
    state.bunkers = state.bunkers.filter((b) => b.hp > 0);
  }

  // ---- player bullets vs. enemies / boss / ufo
  const remainingBullets: Bullet[] = [];
  for (const bullet of state.bullets) {
    if (bullet.from !== 'player') {
      remainingBullets.push(bullet);
      continue;
    }
    let hitSomething = false;

    if (state.ufo && aabb(bullet.x, bullet.y, bullet.w, bullet.h, state.ufo.x, state.ufo.y, state.ufo.w, state.ufo.h)) {
      const ufo = state.ufo;
      ufo.hp -= bullet.damage;
      ufo.flash = 6;
      state.stats.shotsHit += 1;
      if (ufo.hp <= 0) {
        addScore(state, ufo.scoreValue);
        state.stats.ufosDestroyed += 1;
        state.events.push({ type: 'ufoDestroyed', x: ufo.x + ufo.w / 2, y: ufo.y, value: ufo.scoreValue });
        spawnPowerup(state, ufo.x + ufo.w / 2, ufo.y + ufo.h / 2, rollPowerupKind(state));
        state.ufo = null;
        state.formation.ufoTimer = firand(state, 900, 1900);
      }
      hitSomething = true;
      continue;
    }

    if (state.boss && aabb(bullet.x, bullet.y, bullet.w, bullet.h, state.boss.x, state.boss.y, state.boss.w, state.boss.h)) {
      const boss = state.boss;
      boss.hp -= bullet.damage;
      boss.hitFlash = 6;
      state.stats.shotsHit += 1;
      hitSomething = true;
      if (boss.hp <= 0) {
        addScore(state, boss.scoreValue);
        state.stats.bossKills += 1;
        state.combo += 3;
        state.comboTimer = COMBAT.comboWindowTicks;
        state.events.push({ type: 'bossExplosion', x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, value: boss.scoreValue });
        for (let i = 0; i < 3; i++) {
          spawnPowerup(
            state,
            boss.x + 24 + i * (boss.w - 48) / 2,
            boss.y + boss.h / 2,
            i === 1 ? 'life' : rollPowerupKind(state),
          );
        }
        state.boss = null;
        state.enemies = [];
      }
      continue;
    }

    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      if (aabb(bullet.x, bullet.y, bullet.w, bullet.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
        enemy.hp -= bullet.damage;
        enemy.flash = 5;
        state.stats.shotsHit += 1;
        hitSomething = true;
        if (enemy.hp <= 0) {
          registerKill(state, enemy, enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
        } else {
          state.events.push({ type: 'enemyHit', x: bullet.x, y: bullet.y, kind: enemy.kind });
        }
        break;
      }
    }

    if (!hitSomething) remainingBullets.push(bullet);
  }
  state.bullets = remainingBullets;
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // ---- enemy bullets / enemies vs. player
  const keptBullets: Bullet[] = [];
  for (const bullet of state.bullets) {
    if (bullet.from === 'enemy' && aabb(bullet.x, bullet.y, bullet.w, bullet.h, player.x, player.y, player.w, player.h)) {
      damagePlayer(state, 'bullet');
      if (state.status === 'gameOver') return;
      continue;
    }
    keptBullets.push(bullet);
  }
  state.bullets = keptBullets;

  for (const enemy of state.enemies) {
    if (enemy.x + enemy.w < 0 || enemy.x > ARENA.width) continue;
    if (aabb(enemy.x, enemy.y, enemy.w, enemy.h, player.x, player.y, player.w, player.h)) {
      if (enemy.mode === 'diving') {
        enemy.hp = 0;
        state.events.push({ type: 'explosion', x: enemy.x + enemy.w / 2, y: enemy.y, kind: enemy.kind });
      }
      damagePlayer(state, 'contact');
      if (state.status === 'gameOver') return;
      break;
    }
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // ---- powerup pickup
  const keptPowerups: PowerupState[] = [];
  for (const powerup of state.powerups) {
    if (aabb(powerup.x, powerup.y, powerup.w, powerup.h, player.x, player.y, player.w, player.h)) {
      applyPowerup(state, powerup.kind);
      continue;
    }
    keptPowerups.push(powerup);
  }
  state.powerups = keptPowerups;

  // ---- enemies vs. bunkers (armada grinds cover away)
  for (const enemy of state.enemies) {
    for (const bunker of state.bunkers) {
      if (bunker.hp > 0 && aabb(enemy.x, enemy.y, enemy.w, enemy.h, bunker.x, bunker.y, bunker.w, bunker.h)) {
        bunker.hp = 0;
        state.events.push({ type: 'bunkerDestroyed', x: bunker.x + bunker.w / 2, y: bunker.y + bunker.h / 2 });
      }
    }
  }
  const beforeBunkers = state.bunkers.length;
  state.bunkers = state.bunkers.filter((b) => b.hp > 0);
  state.stats.bunkersLost += beforeBunkers - state.bunkers.length;

  // ---- invasion check
  const invasionLine = player.y - ENEMY.invasionLineOffset;
  for (const enemy of state.enemies) {
    if (enemy.mode === 'formation' && enemy.y + enemy.h >= invasionLine) {
      state.events.push({ type: 'invasion', x: enemy.x, y: enemy.y });
      endRun(state, 'invaded');
      return;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Introspection helpers (shared by UI + API)                                */
/* -------------------------------------------------------------------------- */

export function hudSnapshot(state: SimState): HudSnapshot {
  const accuracy = state.stats.shotsFired === 0 ? 0 : state.stats.shotsHit / state.stats.shotsFired;
  return {
    status: state.status,
    score: state.score,
    combo: state.combo,
    comboMultiplier: comboMultiplier(state),
    wave: state.wave,
    isBossWave: state.boss !== null,
    lives: state.player.lives,
    shieldCharges: state.player.shieldCharges,
    overdriveCharge: state.player.overdriveCharge,
    overdriveReady: state.player.overdriveCharge >= COMBAT.overdriveCost,
    overdriveActive: state.player.overdriveTicks > 0,
    waveModifier: state.waveModifier?.label ?? null,
    bossHp: state.boss?.hp ?? 0,
    bossMaxHp: state.boss?.maxHp ?? 0,
    enemiesRemaining: state.enemies.length,
    accuracy,
    timeSeconds: state.time,
  };
}

export function isRunOver(state: SimState): boolean {
  return state.status === 'gameOver';
}

export { comboMultiplier, scoreMultiplier };
