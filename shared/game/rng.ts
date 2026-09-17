/**
 * Deterministic pseudo random number generator.
 *
 * The engine must produce bit-identical results in the browser and inside a
 * Cloudflare Worker so that a run recorded on a client can be re-simulated
 * server side. For that reason the simulation never touches `Math.random`,
 * `Date.now` or transcendental helpers (`Math.sin`, `Math.pow`, ...): only
 * IEEE-754 exact operations (`+ - * /`, `Math.sqrt`, `Math.floor`, `Math.abs`)
 * and this integer PRNG are used.
 *
 * mulberry32 — 32 bit state, period 2^32, uniform enough for game logic.
 */
export function nextRandom(state: number): number {
  // Advance state: state = (state + 0x6D2B79F5) | 0
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const out = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return out;
}

/** Small helper object that keeps the state variable ergonomic to thread through. */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x1a2b3c4d;
  }

  /** float in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  bool(chance: number): boolean {
    return this.next() < chance;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length) % items.length];
  }

  /** Deterministic shuffle (Fisher–Yates). */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }
}

/** FNV-1a 32 bit string hash — used for replay fingerprints and share tokens. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashHex(input: string): string {
  return hashString(input).toString(16).padStart(8, '0');
}

/** Compose a 32 bit seed from a string (used for daily challenges etc.). */
export function seedFromString(input: string): number {
  return hashString(input) || 0x1a2b3c4d;
}
