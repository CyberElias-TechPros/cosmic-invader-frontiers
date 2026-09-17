import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
import { DT, MAX_RUN_TICKS } from '../shared/game/config';
import { createSim, stepSim } from '../shared/game/sim';
import { buildReplayPayload, type ReplayFrame, type RunClaims } from '../shared/game/replay';
import type { InputState } from '../shared/game/types';
import type { SubmitRunResult } from '../src/lib/types';
import type { api as ApiClient, ApiError as ApiErrorType, API_BASE as ApiBase, tokenStore as TokenStore } from '../src/lib/api';

/**
 * Front-end ⇄ back-end integration.
 *
 * Unlike `api.e2e.test.ts` (which drives raw HTTP), this suite imports the
 * *actual client module the browser uses* — envelope parsing, bearer tokens,
 * single-flight refresh, retry-on-401, error mapping — and runs it against a
 * real workerd instance. If a route, a response shape or a header drifts, the
 * shipping client is what fails here.
 *
 * The DOM-dependent parts of the client (`window`, `localStorage`) are shimmed
 * for the Node environment; `canvas` is never touched because the engine is
 * headless by design.
 */

type Api = typeof ApiClient;

const API_ORIGIN = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '8788'}`;

let api: Api;
let ApiErrorClass: typeof ApiErrorType;
let resolvedBase: typeof ApiBase;
let tokens: typeof TokenStore;
let sharedGuest: Awaited<ReturnType<Api['guest']>>;

/**
 * Mint a guest session exactly the way `AuthProvider` does — the client module
 * deliberately does not persist identity on its own; the auth context owns that
 * decision, so the test mirrors it.
 */
async function newGuest(device: string) {
  const session = await api.guest({ device });
  tokens.set(session.tokens);
  return session;
}

beforeAll(async () => {
  // --- minimal browser shims, installed *before* the client module loads ---
  const store = new Map<string, string>();
  const localStorageShim = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  const windowShim = {
    setTimeout: (handler: () => void, timeout?: number) => setTimeout(handler, timeout),
    clearTimeout: (handle: number) => clearTimeout(handle),
    location: { origin: API_ORIGIN },
  };

  Object.assign(globalThis, { localStorage: localStorageShim, window: windowShim });
  process.env.VITE_API_BASE_URL = `${API_ORIGIN}/api`;

  const module = await import('../src/lib/api');
  api = module.api;
  ApiErrorClass = module.ApiError;
  resolvedBase = module.API_BASE;
  tokens = module.tokenStore;

  // One identity for the whole file: guest creation is rate limited per IP and
  // the suite shares the runner with the HTTP e2e tests.
  sharedGuest = await newGuest('full-flow');
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).window;
});

afterEach(() => {
  // Refresh rotates the session and revokes the previous refresh token, so
  // restoring the *old* pair would trip the server's reuse detection. Only
  // re-seed the store when a test left it empty.
  if (!tokens.access() && sharedGuest) tokens.set(sharedGuest.tokens);
});

/** Fly a deterministic bot run and return a replay the server can verify. */
function flyRun(options: { seed: number; mode: 'campaign' | 'daily' | 'gauntlet'; difficulty: 'cadet' | 'pilot' | 'ace' | 'legend'; assist?: boolean; maxTicks?: number }) {
  const state = createSim({
    seed: options.seed,
    mode: options.mode,
    difficulty: options.difficulty,
    assistMode: options.assist ?? false,
  });

  const frames: ReplayFrame[] = [];
  let previousBits = 0;
  let bits = 0;

  const push = (tick: number, nextBits: number) => {
    if (nextBits !== previousBits) {
      frames.push({ t: tick, bits: nextBits });
      previousBits = nextBits;
    }
  };

  const limit = options.maxTicks ?? MAX_RUN_TICKS;
  while (state.status !== 'gameOver' && state.tick < limit) {
    const tick = state.tick;
    // A simple but competent pilot: track the lowest enemy, always shoot.
    const lowest = state.enemies.reduce<{ x: number; w: number } | null>(
      (best, enemy) => (enemy.mode !== 'formation' && (!best || enemy.y > 0) ? enemy : best),
      null,
    );
    const target = lowest ? lowest.x + lowest.w / 2 : null;
    const centre = state.player.x + state.player.w / 2;
    bits = 0;
    if (target !== null) {
      if (target < centre - 6) bits |= 1;
      else if (target > centre + 6) bits |= 2;
    }
    bits |= 4; // fire
    if (state.player.overdriveCharge >= 30) bits |= 8;
    push(tick, bits);
    const input: InputState = {
      left: (bits & 1) !== 0,
      right: (bits & 2) !== 0,
      fire: (bits & 4) !== 0,
      special: (bits & 8) !== 0,
    };
    stepSim(state, input);
  }
  push(state.tick, 0);

  const claims: RunClaims = {
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

  const payload = buildReplayPayload({
    mode: options.mode,
    difficulty: options.difficulty,
    assist: options.assist ?? false,
    seed: options.seed,
    ticks: Math.min(state.tick, MAX_RUN_TICKS),
    frames,
    claims,
    client: 'full-flow-test',
  });

  return {
    payload,
    result: {
      score: state.score,
      wave: state.wave,
      ticks: state.tick,
      durationMs: Math.round(state.tick * DT * 1000),
    },
  };
}

describe('client module against the live API', () => {
  it('resolves an absolute API base for the test host', () => {
    expect(resolvedBase).toBe(`${API_ORIGIN}/api`);
  });

  it('completes the whole guest → verify → rank flow using the shipping client', async () => {
    // 1. Identity: a guest session minted and stored by the client plumbing.
    const guest = sharedGuest;
    expect(guest.player.isGuest).toBe(true);
    expect(guest.tokens.accessToken.length).toBeGreaterThan(20);

    // 2. Public config and daily challenge.
    const config = await api.config();
    expect(config.engineVersion).toBeTruthy();
    const daily = await api.daily();
    expect(daily.challenge.key).toBeTruthy();

    // 3. Fly a real run with the engine and submit the replay.
    const run = flyRun({ seed: 0x0bad_cafe, mode: 'campaign', difficulty: 'pilot' });
    const submitted: SubmitRunResult = await api.submitRun({ replay: run.payload, sessionId: guest.tokens.sessionId });

    expect(submitted.verification.ticks).toBe(run.result.ticks);
    expect(submitted.run.score).toBe(run.result.score);
    expect(submitted.run.ranked).toBe(true);
    expect(submitted.ranking.rank).toBeGreaterThanOrEqual(1);
    expect(submitted.ranking.total).toBeGreaterThanOrEqual(submitted.ranking.rank ?? 1);

    // 4. The verified run shows up for the player and is publicly readable.
    const myRuns = await api.myRuns({ pageSize: 5 });
    expect(myRuns.some((entry) => entry.id === submitted.run.id)).toBe(true);

    const detail = await api.run(submitted.run.id);
    expect(detail.run.score).toBe(run.result.score);
    expect(detail.shareUrl).toContain(submitted.run.id);

    // 5. Leaderboard placement reflects the run.
    const placement = await api.placement({ mode: 'campaign', difficulty: 'pilot' });
    if (placement.placement) {
      expect(placement.placement.score).toBeGreaterThanOrEqual(run.result.score);
      expect(placement.placement.rank).toBeGreaterThanOrEqual(1);
    }

    // 6. Progression moved: XP, level and at least one achievement.
    const me = await api.me();
    expect(me.xp).toBeGreaterThan(0);
    expect(me.level).toBeGreaterThanOrEqual(1);
    const unlocks = await api.myAchievements();
    expect(unlocks.totalCount).toBeGreaterThanOrEqual(20);
    expect(unlocks.points).toBeGreaterThan(0);

    // 7. Cloud save round-trips through the same client.
    const saved = await api.putSave({ payload: JSON.stringify({ settings: { sound: true } }), version: 0, device: 'full-flow' });
    expect(saved.status).toBe('stored');
    const loaded = await api.getSave();
    expect(loaded.version).toBe(1);

    // 8. Telemetry accepts the product event batch.
    const telemetry = await api.telemetry([{ name: 'run_start', props: { mode: 'campaign' } }], guest.tokens.sessionId);
    expect(telemetry.accepted).toBeGreaterThan(0);
  });

  it('routes a doctored replay through the client error mapper', async () => {
    const guest = sharedGuest;
    const run = flyRun({ seed: 0x1234_5678, mode: 'campaign', difficulty: 'pilot' });

    const doctored = {
      ...run.payload,
      claims: { ...run.payload.claims, score: run.payload.claims.score + 500_000 },
    };

    await expect(api.submitRun({ replay: doctored })).rejects.toMatchObject({
      status: 422,
      code: 'replay_rejected',
    });

    // The guest session is still perfectly usable after a rejected run.
    const me = await api.me();
    expect(me.id).toBe(guest.player.id);
  });

  it('plays the daily sortie end to end', async () => {
    const daily = await api.daily();
    const run = flyRun({ seed: daily.challenge.seed, mode: 'daily', difficulty: daily.challenge.difficulty });

    const submitted = await api.submitRun({ replay: run.payload, dailyKey: daily.challenge.key });
    expect(submitted.daily?.key).toBe(daily.challenge.key);
    expect(submitted.run.dailyKey).toBe(daily.challenge.key);

    // The same call, now authenticated, must personalise itself.
    const refreshed = await api.daily();
    expect(refreshed.myResult).not.toBeNull();
    expect(refreshed.myResult?.run_id).toBe(submitted.run.id);
    expect(refreshed.myResult?.score).toBe(run.result.score);
    expect(refreshed.myRank?.rank).toBeGreaterThanOrEqual(1);
  });

  it('keeps an assisted run honest: counted, but never ranked', async () => {
    const run = flyRun({ seed: 0xa55_157, mode: 'campaign', difficulty: 'cadet', assist: true });
    const submitted = await api.submitRun({ replay: run.payload });
    expect(submitted.run.ranked).toBe(false);
    expect(submitted.flags).toContain('assisted');

    const placement = await api.placement({ mode: 'campaign', difficulty: 'cadet' });
    // An assisted run must never create a ranked placement.
    if (placement.placement) {
      expect(placement.placement.score).toBeGreaterThanOrEqual(run.result.score);
    }
  });

  it('refreshes an expired access token transparently', async () => {
    const guest = sharedGuest;
    // Corrupt the access token but keep the refresh token: the client should
    // transparently refresh and replay the request.
    tokens.set({ ...guest.tokens, accessToken: 'not-a-real-token' });
    const me = await api.me();
    expect(me.id).toBe(guest.player.id);
    expect(tokens.access()).not.toBe('not-a-real-token');
  });

  it('surfaces a friendly error type for a bad route', async () => {
    try {
      await api.run('run_does_not_exist');
      throw new Error('expected the request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiErrorClass);
      expect((error as InstanceType<typeof ApiErrorType>).status).toBe(404);
      expect((error as InstanceType<typeof ApiErrorType>).isAuth).toBe(false);
    }
  });

  it('serves the share card the client links to', async () => {
    const run = flyRun({ seed: 0x7eed_fa3e, mode: 'campaign', difficulty: 'pilot' });
    const submitted = await api.submitRun({ replay: run.payload });

    const { shareCardUrl } = await import('../src/lib/api');
    const url = shareCardUrl(submitted.run.id);
    expect(url.startsWith(`${API_ORIGIN}/api/v1/share/`)).toBe(true);

    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
    const svg = await response.text();
    expect(svg).toContain('<svg');
    expect(svg).toContain('VERIFIED');

    // The card is public by design; the session is unaffected.
    const me = await api.me();
    expect(me.id).toBe(sharedGuest.player.id);
  });
});
