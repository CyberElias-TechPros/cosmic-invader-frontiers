import {
  DIFFICULTIES,
  DT,
  MAX_RUN_TICKS,
  MODES,
  type Difficulty,
  type GameMode,
} from '../../shared/game/config';
import { buildReplayPayload, packInput, type ReplayFrame, type ReplayPayload, type RunClaims } from '../../shared/game/replay';
import { createSim, hudSnapshot, isRunOver, stepSim } from '../../shared/game/sim';
import type { HudSnapshot, InputState, RunResult, SimEvent, SimState } from '../../shared/game/types';
import { audio } from './audio';
import { InputController } from './input';
import { GameRenderer, type RenderPreferences } from './renderer';
import type { GameSettings } from '../lib/settings';

export interface RunConfig {
  mode: GameMode;
  difficulty: Difficulty;
  assist: boolean;
  seed: number;
  /** Present only for Daily Sortie runs. */
  dailyKey?: string | null;
  /** Server session id — lets the API link a run to the sortie that produced it. */
  sessionId?: string | null;
}

export interface RunOutcome {
  result: RunResult;
  payload: ReplayPayload;
  config: RunConfig;
  /** True when the pilot quit early: the run is shown locally but never submitted. */
  abandoned: boolean;
}

export interface HudView extends HudSnapshot {
  fps: number;
  waveModifierLabel: string | null;
  waveAnnouncement: string | null;
  bossActive: boolean;
}

export interface SessionCallbacks {
  onComplete?: (outcome: RunOutcome) => void;
  onHud?: (hud: HudView) => void;
  onPauseChange?: (paused: boolean) => void;
  onFirstInput?: () => void;
}

/**
 * Owns one mission: the deterministic simulation, the render loop, the input
 * recorder and the authoritative result used for submission.
 *
 * Timing model: the simulation always advances in fixed 60 Hz ticks, while the
 * renderer draws with an interpolation alpha so motion stays smooth on any
 * refresh rate. Because input is recorded per tick index (not per frame), a
 * device that drops frames still produces a replay the server verifies exactly.
 */
export class RunSession {
  readonly state: SimState;
  readonly config: RunConfig;
  readonly input = new InputController();

  private renderer: GameRenderer;
  private canvas: HTMLCanvasElement;
  private callbacks: SessionCallbacks;
  private frames: ReplayFrame[] = [];
  private lastBits = 0;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private accumulator = 0;
  private paused = false;
  private destroyed = false;
  private finished = false;
  private slowMotion = 0;
  private fps = 60;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private hudAccumulator = 0;
  private sequence = 0;
  private comboMilestone = 0;
  private settings: GameSettings;
  private sessionId: string;
  private visibilityCleanup: (() => void) | null = null;
  private autoFire: boolean;

  constructor(options: {
    canvas: HTMLCanvasElement;
    config: RunConfig;
    settings: GameSettings;
    callbacks?: SessionCallbacks;
    sessionId?: string;
  }) {
    this.canvas = options.canvas;
    this.config = options.config;
    this.settings = options.settings;
    this.autoFire = options.settings.autoFire;
    this.callbacks = options.callbacks ?? {};
    this.sessionId = options.sessionId ?? 'local';

    this.state = createSim({
      seed: options.config.seed,
      mode: options.config.mode,
      difficulty: options.config.difficulty,
      assistMode: options.config.assist,
    });

    const preferences: RenderPreferences = {
      reducedMotion: options.settings.reducedMotion,
      screenShake: options.settings.screenShake,
      particles: options.settings.particles,
    };
    this.renderer = new GameRenderer(options.canvas);
    this.renderer.setPreferences(preferences);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /* ------------------------------- lifecycle ------------------------------ */

  start(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.resize(
      Math.max(320, Math.round(rect.width || this.canvas.clientWidth || 480)),
      Math.max(360, Math.round(rect.height || this.canvas.clientHeight || 720)),
    );

    this.input.attach(this.canvas, {
      onPause: () => this.togglePause(),
      onToggleMute: () => this.setSoundEnabled(!audio.soundEnabled),
    });
    this.input.setTouchEnabled(this.settings.virtualControls !== 'never');

    if (this.settings.sound || this.settings.music) {
      audio.init();
      audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
      void audio.unlock();
      if (this.settings.music) audio.startMusic();
    }

    this.installVisibilityGuard();
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  private installVisibilityGuard(): void {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !this.paused && !this.finished) {
        this.pause();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.visibilityCleanup = () => document.removeEventListener('visibilitychange', onVisibility);
  }

  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }

  /**
   * Draw a single frozen frame of the opening position. Used behind the
   * countdown overlay so the arena is already "there" when the pilot arrives.
   */
  preview(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.resize(
      Math.max(320, Math.round(rect.width || this.canvas.clientWidth || 480)),
      Math.max(360, Math.round(rect.height || this.canvas.clientHeight || 720)),
    );
    this.renderer.render(this.state, 1 / 60, 1);
  }

  pause(): void {
    if (this.paused || this.finished) return;
    this.paused = true;
    this.input.clearPointer();
    audio.duck(0.18);
    this.callbacks.onPauseChange?.(true);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    audio.unduck();
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    this.callbacks.onPauseChange?.(false);
  }

  togglePause(): void {
    if (this.paused) this.resume();
    else this.pause();
  }

  setSoundEnabled(enabled: boolean): void {
    audio.soundEnabled = enabled;
    if (!enabled) audio.stopMusic();
    else if (this.settings.music) audio.startMusic();
  }

  /** Quit mid-run: produces a local-only result that is never submitted. */
  abort(): RunOutcome {
    this.state.endReason = this.state.endReason === 'none' ? 'aborted' : this.state.endReason;
    return this.finish(true);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.input.detach();
    this.visibilityCleanup?.();
    audio.unduck();
    audio.stopMusic(0.3);
  }

  /* --------------------------------- loop -------------------------------- */

  private frame = (time: number) => {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.frame);

    const elapsed = Math.max(0, (time - this.lastFrameTime) / 1000);
    this.lastFrameTime = time;

    this.fpsAccumulator += elapsed;
    this.fpsFrames += 1;
    if (this.fpsAccumulator >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccumulator);
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
    }

    if (!this.paused && !this.finished) {
      this.accumulator += Math.min(0.25, elapsed);
      let steps = 0;
      // Cap catch-up work so a stalled tab cannot spiral into a freeze.
      while (this.accumulator >= DT && steps < 6 && !this.finished) {
        this.renderer.capturePrevious(this.state);
        this.step();
        this.accumulator -= DT;
        steps += 1;
      }
      this.slowMotion = Math.max(0, this.slowMotion - elapsed * 2.2);
      this.renderer.setSlowMotion(this.slowMotion);
    }

    this.renderer.render(this.state, Math.min(0.05, elapsed), Math.min(1, this.accumulator / DT));

    this.hudAccumulator += elapsed;
    if (this.hudAccumulator >= 0.06) {
      this.hudAccumulator = 0;
      this.publishHud();
    }
  };

  private step(): void {
    const input = this.resolveInput();
    const bits = packInput(input);
    if (bits !== this.lastBits) {
      this.frames.push({ t: this.state.tick, bits });
      this.lastBits = bits;
    }

    const events = stepSim(this.state, input);
    if (events.length > 0) this.handleEvents(events);
    this.updateAudioIntensity();
    this.sequence += 1;

    if (isRunOver(this.state)) this.finish(false);
  }

  private resolveInput(): InputState {
    const input = this.input.poll();
    const target = this.input.pointerTarget;

    if (target.x !== null) {
      // Drag-to-fly: steer toward the finger/mouse rather than snapping to it.
      const center = this.state.player.x + this.state.player.w / 2;
      const delta = target.x - center;
      input.left = delta < -1.5;
      input.right = delta > 1.5;
    }
    if (this.autoFire) input.fire = true;

    if (!this.firstInputSeen && (input.left || input.right || input.fire || input.special)) {
      this.firstInputSeen = true;
      this.callbacks.onFirstInput?.();
    }
    return input;
  }

  private firstInputSeen = false;

  private handleEvents(events: SimEvent[]): void {
    this.renderer.consumeEvents(events);

    for (const event of events) {
      switch (event.type) {
        case 'playerShot':
          audio.play('shoot', { pitch: 1 + Math.min(0.35, this.state.combo * 0.02), pan: this.panFor(event.x) });
          break;
        case 'enemyShot':
          audio.play('enemyShoot', { pan: this.panFor(event.x) });
          break;
        case 'enemyHit':
          audio.play('enemyHit', { pitch: 1 + Math.random() * 0.1 });
          break;
        case 'explosion':
          audio.play('explosion', { pan: this.panFor(event.x), gain: event.kind === 'tank' ? 1.2 : 1 });
          break;
        case 'bossExplosion':
          audio.play('bossExplosion');
          this.slowMotion = 1;
          break;
        case 'playerHit':
          audio.play('playerHit');
          break;
        case 'playerDeath':
          audio.play('playerDeath');
          break;
        case 'powerupPickup':
          audio.play('powerup');
          break;
        case 'extraLife':
          audio.play('extraLife');
          break;
        case 'overdriveStart':
          audio.play('overdrive');
          break;
        case 'waveClear':
          audio.play('waveClear');
          this.slowMotion = 0.8;
          break;
        case 'waveStart':
          audio.play('waveStart');
          break;
        case 'bossSpawn':
          audio.play('bossSpawn');
          break;
        case 'ufoAppear':
          audio.play('ufo', { pan: this.panFor(event.x) });
          break;
        case 'gameOver':
          audio.play('gameOver');
          audio.stopMusic(2.4);
          break;
        default:
          break;
      }
    }

    // Combo milestones are a separate, quieter flourish.
    const milestone = Math.floor(this.state.combo / 5);
    if (milestone > this.comboMilestone) {
      this.comboMilestone = milestone;
      audio.play('comboUp', { pitch: 1 + Math.min(0.6, milestone * 0.05) });
    } else if (milestone < this.comboMilestone) {
      this.comboMilestone = milestone;
    }
  }

  private panFor(x: number | undefined): number {
    if (x === undefined) return 0;
    return (x / 480) * 1.4 - 0.7;
  }

  private updateAudioIntensity(): void {
    const state = this.state;
    const bossFactor = state.boss ? 0.45 + (1 - state.boss.hp / state.boss.maxHp) * 0.4 : 0;
    const density = Math.min(0.5, state.enemies.length / 70);
    const waveFactor = Math.min(0.35, state.wave / 30);
    audio.setIntensity(Math.min(1, bossFactor + density + waveFactor));
  }

  private publishHud(): void {
    if (!this.callbacks.onHud) return;
    const snapshot = hudSnapshot(this.state);
    this.callbacks.onHud({
      ...snapshot,
      fps: this.fps,
      waveModifierLabel: this.state.waveModifier?.label ?? null,
      waveAnnouncement: snapshot.isBossWave ? 'DREADNOUGHT INBOUND' : null,
      bossActive: this.state.boss !== null,
    });
  }

  /* -------------------------------- results ------------------------------- */

  private finish(abandoned: boolean): RunOutcome {
    if (this.finished && !abandoned) {
      // Defensive: exactly one completion per session.
      return this.buildOutcome(false);
    }
    this.finished = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.input.detach();
    this.publishHud();

    const outcome = this.buildOutcome(abandoned);
    this.callbacks.onComplete?.(outcome);
    return outcome;
  }

  private buildOutcome(abandoned: boolean): RunOutcome {
    const state = this.state;
    const result: RunResult = {
      version: state.version,
      mode: state.mode,
      difficulty: state.difficulty,
      assistMode: state.assistMode,
      seed: state.seed,
      score: state.score,
      wave: state.wave,
      ticks: state.tick,
      durationMs: Math.round(state.tick * DT * 1000),
      endReason: state.endReason,
      stats: { ...state.stats },
      accuracy: state.stats.shotsFired === 0 ? 0 : state.stats.shotsHit / state.stats.shotsFired,
    };

    const claims: RunClaims = {
      score: result.score,
      wave: result.wave,
      ticks: result.ticks,
      kills: result.stats.kills,
      bossKills: result.stats.bossKills,
      ufosDestroyed: result.stats.ufosDestroyed,
      maxCombo: result.stats.maxCombo,
      livesLost: result.stats.livesLost,
      accuracy: result.accuracy,
    };

    const payload = buildReplayPayload({
      mode: this.config.mode,
      difficulty: this.config.difficulty,
      assist: this.config.assist,
      seed: this.config.seed,
      ticks: Math.min(result.ticks, MAX_RUN_TICKS),
      frames: this.frames,
      claims,
      client: this.sessionId,
    });

    return { result, payload, config: this.config, abandoned };
  }

  /** Live HUD accessor for imperative reads (results screen, tests). */
  hud(): HudView {
    const snapshot = hudSnapshot(this.state);
    return {
      ...snapshot,
      fps: this.fps,
      waveModifierLabel: this.state.waveModifier?.label ?? null,
      waveAnnouncement: null,
      bossActive: this.state.boss !== null,
    };
  }

  get difficultyConfig() {
    return DIFFICULTIES[this.config.difficulty];
  }

  get modeLabel(): string {
    return MODES[this.config.mode].label;
  }

  get bulletsInFlight(): number {
    return this.state.bullets.length;
  }
}
