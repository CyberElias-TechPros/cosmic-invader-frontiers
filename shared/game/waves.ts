import { ARCHETYPES, ARENA, BOSS_EVERY, ENEMY, type EnemyKind, type GameMode } from './config';
import { Rng } from './rng';
import type { EnemyState, WaveModifier, WavePlan } from './types';

/**
 * Wave composition is derived purely from (seed, wave) so that a replay
 * recorded on a client reproduces exactly the same armada in the verifier.
 */

export const WAVE_MODIFIERS: WaveModifier[] = [
  {
    id: 'swarm',
    label: 'Swarm Protocol',
    blurb: 'Faster formation, brittle hulls.',
    speedMult: 1.4,
    fireMult: 1,
    hpBonus: 0,
    bonusPoints: 250,
  },
  {
    id: 'barrage',
    label: 'Barrage Doctrine',
    blurb: 'Gunners fire far more often.',
    speedMult: 0.95,
    fireMult: 1.7,
    hpBonus: 0,
    bonusPoints: 350,
  },
  {
    id: 'armored',
    label: 'Armoured Column',
    blurb: 'Reinforced hulls across the fleet.',
    speedMult: 0.88,
    fireMult: 1.05,
    hpBonus: 1,
    bonusPoints: 400,
  },
  {
    id: 'strikers',
    label: 'Striker Wing',
    blurb: 'Divers peel off and hunt you down.',
    speedMult: 1.08,
    fireMult: 1.1,
    hpBonus: 0,
    bonusPoints: 300,
  },
  {
    id: 'blackout',
    label: 'Blackout Run',
    blurb: 'Low visibility, high reward.',
    speedMult: 1.15,
    fireMult: 1.2,
    hpBonus: 0,
    bonusPoints: 600,
  },
];

function pickModifier(rng: Rng, wave: number, mode: GameMode): WaveModifier | null {
  // Waves 1-2 stay vanilla so newcomers get a clean read of the rules.
  if (wave <= 2) return null;
  // Gauntlet keeps modifiers off — the bosses are the modifier.
  if (mode === 'gauntlet') return null;
  const chance = Math.min(0.62, 0.18 + wave * 0.035);
  if (!rng.bool(chance)) return null;
  return WAVE_MODIFIERS[rng.int(0, WAVE_MODIFIERS.length - 1)];
}

function kindForSlot(rng: Rng, wave: number, row: number, rows: number, modifier: WaveModifier | null): EnemyKind {
  if (modifier?.id === 'strikers' && (row === rows - 1 || row === rows - 2) && rng.bool(0.35)) {
    return 'diver';
  }
  if (row === 0 && wave >= 3) return rng.bool(0.5) ? 'tank' : 'weaver';
  if (row <= 1) return wave >= 2 ? 'shooter' : 'grunt';
  if (row === rows - 1 && wave >= 4 && rng.bool(0.25)) return 'diver';
  if (wave >= 3 && rng.bool(0.22)) return 'weaver';
  return 'grunt';
}

export function isBossWave(mode: GameMode, wave: number): boolean {
  return mode === 'gauntlet' ? true : wave % BOSS_EVERY === 0;
}

export function createWavePlan(seed: number, wave: number, mode: GameMode): WavePlan {
  const rng = new Rng((seed + Math.imul(wave, 0x9e3779b1)) >>> 0);
  const boss = isBossWave(mode, wave);

  if (boss) {
    const modifier = pickModifier(rng, wave, mode);
    return {
      wave,
      isBoss: true,
      cols: 0,
      rows: 0,
      slots: [],
      modifier,
      speedMult: 1,
      fireMult: 1,
      announcement: `WAVE ${wave} · DREADNOUGHT INBOUND`,
    };
  }

  const cols = Math.min(ENEMY.cols, 6 + Math.floor((wave - 1) / 3));
  const rows = Math.min(6, 3 + Math.floor((wave - 1) / 4));
  const modifier = pickModifier(rng, wave, mode);

  const slots: WavePlan['slots'] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slots.push({ col, row, kind: kindForSlot(rng, wave, row, rows, modifier) });
    }
  }

  return {
    wave,
    isBoss: false,
    cols,
    rows,
    slots,
    modifier,
    speedMult: (modifier?.speedMult ?? 1) * (1 + (wave - 1) * 0.03),
    fireMult: (modifier?.fireMult ?? 1) * (1 + (wave - 1) * 0.045),
    announcement: modifier ? `WAVE ${wave} · ${modifier.label.toUpperCase()}` : `WAVE ${wave}`,
  };
}

/** Docked (un-offset) top-left corner of a formation slot. */
export function slotDockX(plan: WavePlan, col: number): number {
  const width = plan.cols * ENEMY.colGap - (ENEMY.colGap - ENEMY.width);
  const originX = (ARENA.width - width) / 2;
  return originX + col * ENEMY.colGap;
}

export function slotDockY(row: number): number {
  return ENEMY.topOffset + row * ENEMY.rowGap;
}

export function buildEnemies(plan: WavePlan, hpBonus: number, rng: Rng, nextId: () => number): EnemyState[] {
  return plan.slots.map((slot) => {
    const archetype = ARCHETYPES[slot.kind];
    const maxHp = archetype.hp + hpBonus;
    const dockX = slotDockX(plan, slot.col);
    const dockY = slotDockY(slot.row);
    return {
      id: nextId(),
      kind: slot.kind,
      col: slot.col,
      row: slot.row,
      ox: dockX,
      oy: dockY,
      x: dockX,
      y: dockY,
      w: ENEMY.width,
      h: ENEMY.height,
      hp: maxHp,
      maxHp,
      // deterministic stagger so the fleet does not fire in perfect unison
      fireTimer: archetype.fires ? rng.int(archetype.fireCooldown[0], archetype.fireCooldown[1]) : 0,
      swayPhase: slot.col * 0.7 + slot.row * 1.3,
      swayAmount: archetype.sway,
      mode: 'formation',
      vx: 0,
      vy: 0,
      scoreValue: archetype.points,
      flash: 0,
    } satisfies EnemyState;
  });
}
