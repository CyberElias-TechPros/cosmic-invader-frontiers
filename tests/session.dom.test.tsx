// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunSession, type HudView, type RunOutcome } from '../src/game/session';
import { verifyReplay } from '../shared/game/replay';
import { DEFAULT_SETTINGS, type GameSettings } from '../src/lib/settings';
import { installCanvasStub } from './setup.dom';

/**
 * Headless run-session tests.
 *
 * These drive the *real* game loop — input controller, fixed-timestep
 * simulator, replay recorder — against a stubbed canvas, then hand the produced
 * replay to the shared verifier. That is exactly the round trip the API
 * performs on submission, so a green result here means a browser run is
 * verifiable on the server.
 */

const settings: GameSettings = { ...DEFAULT_SETTINGS, autoFire: true, sound: false, music: false, particles: 'off' };

let pendingFrame: FrameRequestCallback | null = null;
let clock = 0;

function pumpFrames(count: number, stepMs = 1000 / 60): void {
  for (let index = 0; index < count; index += 1) {
    clock += stepMs;
    const callback = pendingFrame;
    pendingFrame = null;
    if (!callback) return;
    callback(clock);
  }
}

function createSession(overrides: Partial<Parameters<typeof RunSession.prototype.constructor>[0]> = {}) {
  const canvas = document.createElement('canvas');
  installCanvasStub(canvas);
  const hudUpdates: HudView[] = [];
  let outcome: RunOutcome | null = null;

  const session = new RunSession({
    canvas,
    config: {
      mode: 'campaign',
      difficulty: 'pilot',
      assist: false,
      seed: 0x5eed_1234,
    },
    settings,
    callbacks: {
      onHud: (hud) => hudUpdates.push(hud),
      onComplete: (completed) => {
        outcome = completed;
      },
    },
    ...overrides,
  });

  return { session, hudUpdates, getOutcome: () => outcome };
}

beforeEach(() => {
  clock = 0;
  pendingFrame = null;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrame = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RunSession', () => {
  it('advances the simulation in fixed ticks and reports HUD state', () => {
    const { session, hudUpdates } = createSession();
    session.start();
    expect(session.state.tick).toBe(0);

    pumpFrames(90, 1000 / 60);

    expect(session.state.tick).toBeGreaterThan(60);
    expect(hudUpdates.length).toBeGreaterThan(0);
    expect(hudUpdates.at(-1)?.lives).toBeGreaterThan(0);
    session.destroy();
  });

  it('records player input and produces a replay the engine verifies', () => {
    const { session, getOutcome } = createSession();
    session.start();

    // Fly right for a second, then left, firing continuously (auto-fire).
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    pumpFrames(60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    pumpFrames(60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));

    // Fly the rest of the mission unattended until the run ends.
    let guard = 0;
    while (!session.isFinished && guard < 30_000) {
      pumpFrames(1);
      guard += 1;
    }

    expect(session.isFinished).toBe(true);
    const outcome = getOutcome();
    expect(outcome).not.toBeNull();
    expect(outcome!.result.ticks).toBeGreaterThan(0);
    expect(outcome!.result.score).toBeGreaterThan(0);

    const verification = verifyReplay(outcome!.payload);
    expect(verification.ok).toBe(true);
    expect(verification.result?.score).toBe(outcome!.result.score);
    expect(verification.result?.wave).toBe(outcome!.result.wave);
    session.destroy();
  });

  it('pauses and resumes without advancing ticks', () => {
    const { session } = createSession();
    session.start();
    pumpFrames(30);
    const before = session.state.tick;

    session.pause();
    pumpFrames(30);
    expect(session.state.tick).toBe(before);

    session.resume();
    pumpFrames(30);
    expect(session.state.tick).toBeGreaterThan(before);
    session.destroy();
  });

  it('marks an abandoned run as local-only', () => {
    const { session, getOutcome } = createSession();
    session.start();
    pumpFrames(120);

    const abandoned = session.abort();
    expect(abandoned.abandoned).toBe(true);
    expect(getOutcome()?.abandoned).toBe(true);
    // A partial run is still a valid replay payload, but the API will never
    // rank it because its end reason is 'aborted' rather than a real ending.
    expect(abandoned.result.endReason).toBe('aborted');
    session.destroy();
  });

  it('accepts a pulsing overdrive trigger from the touch control', () => {
    const { session } = createSession();
    session.start();
    // Overdrive needs charge, so grant it directly and pulse the input.
    session.state.player.overdriveCharge = 30;
    session.input.pulseSpecial();
    pumpFrames(2);
    expect(session.state.player.overdriveTicks).toBeGreaterThan(0);
    session.destroy();
  });
});
