import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  ARENA,
  COMBAT,
  DIFFICULTIES,
  ENGINE_VERSION,
  EMPTY_TOTALS,
  REPLAY_FORMAT_VERSION,
  buildReplayPayload,
  createSim,
  createWavePlan,
  decodeFrames,
  encodeFrames,
  hudSnapshot,
  levelFromXp,
  progressionFromXp,
  stepSim,
  verifyReplay,
  xpForRun,
  xpForLevel,
  packInput,
  unpackInput,
  type InputState,
  type ReplayFrame,
  type SimState,
} from '../shared/game';

/**
 * A deterministic reference "bot pilot" used to generate realistic runs.
 * Because the policy is a pure function of the simulation state, the recorded
 * input log can be replayed bit-for-bit on the server.
 */
function botInput(state: SimState): InputState {
  const player = state.player;
  const px = player.x + player.w / 2;

  // Track the lowest enemy (closest to invasion) or the boss / ufo.
  let targetX = ARENA.width / 2;
  let bestY = -Infinity;
  for (const enemy of state.enemies) {
    if (enemy.y > bestY) {
      bestY = enemy.y;
      targetX = enemy.x + enemy.w / 2;
    }
  }
  if (state.boss) targetX = state.boss.x + state.boss.w / 2;
  if (state.ufo) targetX = state.ufo.x + state.ufo.w / 2;

  // Dodge incoming bullets when they are close.
  let threatX: number | null = null;
  for (const bullet of state.bullets) {
    if (bullet.from !== 'enemy') continue;
    if (bullet.y > player.y - 150 && Math.abs(bullet.x + bullet.w / 2 - px) < 26) {
      threatX = bullet.x;
    }
  }

  let desired = targetX;
  if (threatX !== null) {
    desired = threatX < px ? px + 90 : px - 90;
  }

  const dx = desired - px;
  const dead = 8;
  return {
    left: dx < -dead,
    right: dx > dead,
    fire: true,
    special: state.player.overdriveCharge >= COMBAT.overdriveCost,
  };
}

interface RecordedRun {
  frames: ReplayFrame[];
  ticks: number;
  state: SimState;
}

function recordRun(config: Parameters<typeof createSim>[0], maxTicks = 40_000): RecordedRun {
  const state = createSim(config);
  const frames: ReplayFrame[] = [];
  let lastBits = -1;

  for (let tick = 0; tick < maxTicks; tick++) {
    if (state.status === 'gameOver') break;
    const input = botInput(state);
    const bits = packInput(input);
    if (bits !== lastBits) {
      frames.push({ t: tick, bits });
      lastBits = bits;
    }
    stepSim(state, input);
  }
  return { frames, ticks: state.tick, state };
}

function claimsFrom(state: SimState) {
  return {
    score: state.score,
    wave: state.wave,
    ticks: state.tick,
    kills: state.stats.kills,
    bossKills: state.stats.bossKills,
    ufosDestroyed: state.stats.ufosDestroyed,
    maxCombo: state.stats.maxCombo,
    livesLost: state.stats.livesLost,
    accuracy: state.stats.shotsFired === 0 ? 0 : state.stats.shotsHit / state.stats.shotsFired,
  };
}

function allFinite(state: SimState): boolean {
  const nums = [
    state.player.x,
    state.player.y,
    state.time,
    state.comboTimer,
    state.formation.offsetX,
    state.formation.offsetY,
    ...state.enemies.flatMap((e) => [e.x, e.y, e.hp]),
    ...state.bullets.flatMap((b) => [b.x, b.y]),
    ...state.powerups.flatMap((p) => [p.x, p.y]),
  ];
  return nums.every((n) => Number.isFinite(n));
}

describe('simulation core', () => {
  it('advances a run without NaN and terminates', () => {
    const { state } = recordRun({ seed: 12345, mode: 'campaign', difficulty: 'pilot' }, 40_000);
    expect(allFinite(state)).toBe(true);
    expect(state.tick).toBeGreaterThan(0);
    expect(state.score).toBeGreaterThan(0);
    expect(['gameOver', 'playing']).toContain(state.status);
  });

  it('is deterministic for identical seed and input log', () => {
    const a = recordRun({ seed: 777, mode: 'campaign', difficulty: 'ace' }, 30_000);
    const b = recordRun({ seed: 777, mode: 'campaign', difficulty: 'ace' }, 30_000);
    expect(b.state.tick).toBe(a.state.tick);
    expect(b.state.score).toBe(a.state.score);
    expect(b.state.wave).toBe(a.state.wave);
    expect(b.state.stats).toEqual(a.state.stats);
    expect(JSON.stringify(b.frames)).toBe(JSON.stringify(a.frames));
  });

  it('produces different armadas for different seeds', () => {
    const a = createWavePlan(1, 4, 'campaign');
    const b = createWavePlan(2, 4, 'campaign');
    expect(JSON.stringify(a.slots)).not.toBe(JSON.stringify(b.slots));
  });

  it('schedules a boss every fifth campaign wave', () => {
    for (let wave = 1; wave <= 20; wave++) {
      const plan = createWavePlan(99, wave, 'campaign');
      expect(plan.isBoss).toBe(wave % 5 === 0);
    }
    expect(createWavePlan(99, 1, 'gauntlet').isBoss).toBe(true);
  });

  it('keeps every difficulty playable', () => {
    for (const difficulty of Object.keys(DIFFICULTIES) as Array<keyof typeof DIFFICULTIES>) {
      const { state } = recordRun({ seed: 4242, mode: 'campaign', difficulty }, 20_000);
      expect(allFinite(state)).toBe(true);
      expect(state.score).toBeGreaterThan(0);
    }
  });

  it('reports a HUD snapshot the UI can render', () => {
    const state = createSim({ seed: 5, mode: 'campaign', difficulty: 'pilot' });
    const hud = hudSnapshot(state);
    expect(hud.status).toBe('playing');
    expect(hud.wave).toBe(1);
    expect(hud.lives).toBeGreaterThan(0);
    expect(hud.enemiesRemaining).toBeGreaterThan(0);
  });
});

describe('replay transport', () => {
  it('round-trips frame encoding', () => {
    const frames: ReplayFrame[] = [
      { t: 0, bits: 4 },
      { t: 3, bits: 6 },
      { t: 900, bits: 0 },
      { t: 120_000, bits: 1 },
    ];
    expect(decodeFrames(encodeFrames(frames))).toEqual(frames);
  });

  it('round-trips input bit packing', () => {
    const input = { left: true, right: false, fire: true, special: false };
    expect(unpackInput(packInput(input))).toEqual(input);
  });

  it('verifies an honest run and returns server-authoritative numbers', () => {
    const run = recordRun({ seed: 2024, mode: 'campaign', difficulty: 'pilot' }, 30_000);
    const payload = buildReplayPayload({
      mode: 'campaign',
      difficulty: 'pilot',
      assist: false,
      seed: 2024,
      ticks: run.ticks,
      frames: run.frames,
      claims: claimsFrom(run.state),
      client: 'test',
    });
    const verification = verifyReplay(payload);
    expect(verification.ok).toBe(true);
    expect(verification.result?.score).toBe(run.state.score);
    expect(verification.result?.stats.kills).toBe(run.state.stats.kills);
  });

  it('rejects a tampered score', () => {
    const run = recordRun({ seed: 2024, mode: 'campaign', difficulty: 'pilot' }, 30_000);
    const payload = buildReplayPayload({
      mode: 'campaign',
      difficulty: 'pilot',
      assist: false,
      seed: 2024,
      ticks: run.ticks,
      frames: run.frames,
      claims: { ...claimsFrom(run.state), score: run.state.score + 100_000 },
      client: 'test',
    });
    const verification = verifyReplay(payload);
    expect(verification.ok).toBe(false);
    expect(verification.reason).toBe('score-mismatch');
  });

  it('rejects replays from a different engine version', () => {
    const payload = buildReplayPayload({
      mode: 'campaign',
      difficulty: 'pilot',
      assist: false,
      seed: 1,
      ticks: 10,
      frames: [{ t: 0, bits: 4 }],
      claims: claimsFrom(createSim({ seed: 1, mode: 'campaign', difficulty: 'pilot' })),
      client: 'test',
    });
    expect(verifyReplay({ ...payload, engine: '0.0.1' }).reason).toBe('engine-mismatch');
    expect(verifyReplay({ ...payload, v: REPLAY_FORMAT_VERSION + 1 }).reason).toBe('invalid-payload');
    expect(verifyReplay({ ...payload, ticks: 10_000_000 }).reason).toBe('too-long');
  });

  it('exposes the current engine version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('progression + achievements', () => {
  it('maps XP to levels monotonically', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(xpForLevel(1)).toBe(0);
    let previous = xpForLevel(1);
    for (let level = 2; level <= 40; level++) {
      const xp = xpForLevel(level);
      expect(xp).toBeGreaterThan(previous);
      previous = xp;
      expect(levelFromXp(xp)).toBe(level);
    }
    const snapshot = progressionFromXp(xpForLevel(12) + 5);
    expect(snapshot.level).toBe(12);
    expect(snapshot.rank).toBe('Lieutenant');
  });

  it('awards XP scaled by difficulty', () => {
    const base = { score: 20_000, wave: 6, kills: 120, bossKills: 1 };
    const pilot = xpForRun({ ...base, difficulty: 'pilot', assistMode: false });
    const legend = xpForRun({ ...base, difficulty: 'legend', assistMode: false });
    const assisted = xpForRun({ ...base, difficulty: 'pilot', assistMode: true });
    expect(legend).toBeGreaterThan(pilot);
    expect(assisted).toBeLessThan(pilot);
  });

  it('every achievement is reachable by definition shape', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.name.length).toBeGreaterThan(2);
      expect(achievement.points).toBeGreaterThan(0);
      expect(() => achievement.check({ run: null, totals: EMPTY_TOTALS })).not.toThrow();
    }
  });

  it('unlocks combat achievements from lifetime totals', () => {
    const centurion = ACHIEVEMENTS.find((a) => a.id === 'centurion')!;
    expect(centurion.check({ run: null, totals: { ...EMPTY_TOTALS, totalKills: 99 } })).toBe(false);
    expect(centurion.check({ run: null, totals: { ...EMPTY_TOTALS, totalKills: 150 } })).toBe(true);
    expect(centurion.progress?.({ run: null, totals: { ...EMPTY_TOTALS, totalKills: 150 } })).toEqual({
      value: 100,
      target: 100,
    });
  });
});
