import { DT, ENGINE_VERSION, MAX_RUN_TICKS, type Difficulty, type GameMode } from './config';
import { createSim, stepSim } from './sim';
import type { InputState, RunResult, SimState } from './types';
import { hashString } from './rng';

/**
 * Replay transport + server-side verification.
 *
 * A replay is a compressed list of input transitions plus the seed/config used
 * to build the run. Because the simulation is deterministic and shared between
 * client and Worker, the server can re-run the whole mission and prove that the
 * submitted score really is achievable. Client claims are never trusted.
 */

export const REPLAY_FORMAT_VERSION = 1;
export const MAX_REPLAY_BYTES = 800_000;
export const MAX_REPLAY_FRAMES = 200_000;

const BIT_LEFT = 1;
const BIT_RIGHT = 2;
const BIT_FIRE = 4;
const BIT_SPECIAL = 8;

export interface RunClaims {
  score: number;
  wave: number;
  ticks: number;
  kills: number;
  bossKills: number;
  ufosDestroyed: number;
  maxCombo: number;
  livesLost: number;
  accuracy: number;
}

export interface ReplayPayload {
  v: number;
  engine: string;
  mode: GameMode;
  difficulty: Difficulty;
  assist: boolean;
  seed: number;
  ticks: number;
  frames: string;
  claims: RunClaims;
  client: string;
  checksum: string;
}

export interface ReplayFrame {
  t: number;
  bits: number;
}

export function packInput(input: InputState): number {
  return (
    (input.left ? BIT_LEFT : 0) |
    (input.right ? BIT_RIGHT : 0) |
    (input.fire ? BIT_FIRE : 0) |
    (input.special ? BIT_SPECIAL : 0)
  );
}

export function unpackInput(bits: number): InputState {
  return {
    left: (bits & BIT_LEFT) !== 0,
    right: (bits & BIT_RIGHT) !== 0,
    fire: (bits & BIT_FIRE) !== 0,
    special: (bits & BIT_SPECIAL) !== 0,
  };
}

/* ------------------------------- base64 ---------------------------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]);
    const c1 = B64.indexOf(clean[i + 1] ?? 'A');
    const c2 = B64.indexOf(clean[i + 2] ?? 'A');
    const c3 = B64.indexOf(clean[i + 3] ?? 'A');
    if (c0 < 0 || c1 < 0) break;
    bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (p < len) bytes[p++] = ((c1 & 15) << 4) | (Math.max(0, c2) >> 2);
    if (p < len) bytes[p++] = ((Math.max(0, c2) & 3) << 6) | Math.max(0, c3);
  }
  return bytes.subarray(0, p);
}

/* --------------------------- frame compression ---------------------------- */

/** Encode input transitions as varint(tick delta) + bits, base64 encoded. */
export function encodeFrames(frames: ReplayFrame[]): string {
  const bytes: number[] = [];
  let prevTick = 0;
  for (const frame of frames) {
    let delta = frame.t - prevTick;
    prevTick = frame.t;
    // LEB128 varint
    do {
      let byte = delta & 0x7f;
      delta >>>= 7;
      if (delta > 0) byte |= 0x80;
      bytes.push(byte);
    } while (delta > 0);
    bytes.push(frame.bits & 0xff);
  }
  return bytesToBase64(new Uint8Array(bytes));
}

export function decodeFrames(encoded: string): ReplayFrame[] {
  const bytes = base64ToBytes(encoded);
  const frames: ReplayFrame[] = [];
  let tick = 0;
  let i = 0;
  while (i < bytes.length) {
    let shift = 0;
    let delta = 0;
    while (true) {
      const byte = bytes[i++];
      if (byte === undefined) return frames;
      delta |= (byte & 0x7f) << shift;
      shift += 7;
      if ((byte & 0x80) === 0) break;
      if (shift > 28) throw new Error('Malformed replay varint');
    }
    tick += delta;
    const bits = bytes[i++];
    if (bits === undefined) break;
    frames.push({ t: tick, bits });
    if (frames.length > MAX_REPLAY_FRAMES) throw new Error('Replay frame budget exceeded');
  }
  return frames;
}

/* ------------------------------- verification ----------------------------- */

export type VerificationFailure =
  | 'engine-mismatch'
  | 'invalid-payload'
  | 'too-long'
  | 'score-mismatch'
  | 'wave-mismatch'
  | 'kills-mismatch'
  | 'tick-mismatch'
  | 'run-not-finished';

export interface VerificationResult {
  ok: boolean;
  reason?: VerificationFailure;
  result?: RunResult;
  detail?: string;
}

export interface VerifyOptions {
  /** Maximum ticks the verifier is willing to simulate (budget guard). */
  maxTicks?: number;
  /** Require that the simulation ends with the player dead (true for ranked runs). */
  requireTerminal?: boolean;
}

/**
 * Re-simulate a submitted run. Returns the *authoritative* result produced by
 * the server, which is what gets stored — never the numbers sent by the client.
 */
export function verifyReplay(payload: ReplayPayload, options: VerifyOptions = {}): VerificationResult {
  const maxTicks = Math.min(options.maxTicks ?? MAX_RUN_TICKS, MAX_RUN_TICKS);

  if (!payload || payload.v !== REPLAY_FORMAT_VERSION) {
    return { ok: false, reason: 'invalid-payload', detail: 'Unsupported replay format' };
  }
  if (payload.engine !== ENGINE_VERSION) {
    return { ok: false, reason: 'engine-mismatch', detail: `Replay engine ${payload.engine} != ${ENGINE_VERSION}` };
  }
  if (payload.ticks > maxTicks || payload.ticks <= 0) {
    return { ok: false, reason: 'too-long', detail: `ticks=${payload.ticks} budget=${maxTicks}` };
  }

  let frames: ReplayFrame[];
  try {
    frames = decodeFrames(payload.frames);
  } catch (error) {
    return { ok: false, reason: 'invalid-payload', detail: (error as Error).message };
  }

  const state: SimState = createSim({
    seed: payload.seed,
    mode: payload.mode,
    difficulty: payload.difficulty,
    assistMode: payload.assist,
  });

  let frameIndex = 0;
  let current = unpackInput(frames.length > 0 && frames[0].t === 0 ? frames[0].bits : 0);
  if (frames.length > 0 && frames[0].t === 0) frameIndex = 1;

  for (let tick = 0; tick < payload.ticks && state.status !== 'gameOver'; tick++) {
    while (frameIndex < frames.length && frames[frameIndex].t <= tick) {
      current = unpackInput(frames[frameIndex].bits);
      frameIndex++;
    }
    stepSim(state, current);
  }

  if (options.requireTerminal && state.status !== 'gameOver') {
    return { ok: false, reason: 'run-not-finished', detail: 'Replay ended without a terminal state' };
  }

  const claims = payload.claims;
  if (!claims || typeof claims.score !== 'number') {
    return { ok: false, reason: 'invalid-payload', detail: 'Missing claims' };
  }
  if (state.score !== claims.score) {
    return {
      ok: false,
      reason: 'score-mismatch',
      detail: `claimed ${claims.score}, simulated ${state.score}`,
    };
  }
  if (state.wave !== claims.wave) {
    return { ok: false, reason: 'wave-mismatch', detail: `claimed ${claims.wave}, simulated ${state.wave}` };
  }
  if (state.stats.kills !== claims.kills) {
    return { ok: false, reason: 'kills-mismatch', detail: `claimed ${claims.kills}, simulated ${state.stats.kills}` };
  }
  if (state.tick !== claims.ticks && state.status !== 'gameOver') {
    return { ok: false, reason: 'tick-mismatch', detail: `claimed ${claims.ticks}, simulated ${state.tick}` };
  }

  const accuracy = state.stats.shotsFired === 0 ? 0 : state.stats.shotsHit / state.stats.shotsFired;

  const result: RunResult = {
    version: ENGINE_VERSION,
    mode: payload.mode,
    difficulty: payload.difficulty,
    assistMode: payload.assist,
    seed: payload.seed,
    score: state.score,
    wave: state.wave,
    ticks: state.tick,
    durationMs: Math.round(state.tick * DT * 1000),
    endReason: state.endReason,
    stats: { ...state.stats },
    accuracy,
  };

  return { ok: true, result };
}

/** Fingerprint used for dedupe + share links (stable for identical replays). */
export function replayChecksum(payload: Omit<ReplayPayload, 'checksum'>): string {
  const raw = `${payload.v}|${payload.engine}|${payload.mode}|${payload.difficulty}|${payload.assist ? 1 : 0}|${payload.seed}|${payload.ticks}|${payload.frames}|${payload.claims.score}`;
  return hashString(raw).toString(16).padStart(8, '0');
}

export function buildReplayPayload(input: {
  mode: GameMode;
  difficulty: Difficulty;
  assist: boolean;
  seed: number;
  ticks: number;
  frames: ReplayFrame[];
  claims: RunClaims;
  client: string;
}): ReplayPayload {
  const base = {
    v: REPLAY_FORMAT_VERSION,
    engine: ENGINE_VERSION,
    mode: input.mode,
    difficulty: input.difficulty,
    assist: input.assist,
    seed: input.seed,
    ticks: input.ticks,
    frames: encodeFrames(input.frames),
    claims: input.claims,
    client: input.client,
  };
  return { ...base, checksum: replayChecksum(base) };
}
