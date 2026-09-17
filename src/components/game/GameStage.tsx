import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Gauge, Keyboard, MousePointer2, Pause, Play, Smartphone, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { GameHud } from './GameHud';
import { RunResults, type SubmitState } from './RunResults';
import { RunSession, type HudView, type RunConfig, type RunOutcome } from '@/game/session';
import { audio } from '@/game/audio';
import { MODES, type Difficulty, type GameMode } from '@shared/game/config';
import { useSettings } from '@/lib/settings';
import { api, ApiError, tokenStore } from '@/lib/api';
import { formatDuration, formatScore } from '@/lib/format';
import { cn } from '@/lib/utils';

type Phase = 'countdown' | 'playing' | 'paused' | 'results';

const COUNTDOWN_STEPS = ['3', '2', '1', 'SORTIE'];

export function GameStage({
  mode,
  difficulty,
  assist,
  seed,
  dailyKey,
  dailyChallengeLabel,
  onExit,
  onRestartRequested,
}: {
  mode: GameMode;
  difficulty: Difficulty;
  assist: boolean;
  seed: number;
  dailyKey?: string | null;
  dailyChallengeLabel?: string;
  onExit: () => void;
  onRestartRequested?: () => void;
}) {
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<RunSession | null>(null);
  const outcomeRef = useRef<RunOutcome | null>(null);

  const [phase, setPhase] = useState<Phase>('countdown');
  const [countdownIndex, setCountdownIndex] = useState(0);
  const [hud, setHud] = useState<HudView | null>(null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [muted, setMuted] = useState(!settings.sound);
  const [showDebug] = useState(false);

  const layout = useMemo(
    () => ({
      mode,
      difficulty,
      assist,
      seed,
      dailyKey: dailyKey ?? null,
    }),
    [mode, difficulty, assist, seed, dailyKey],
  );

  const submit = useCallback(
    async (runOutcome: RunOutcome) => {
      if (runOutcome.abandoned || runOutcome.result.ticks <= 0) {
        setSubmitState({ status: 'idle' });
        return;
      }
      setSubmitState({ status: 'submitting' });
      try {
        const result = await api.submitRun({
          replay: runOutcome.payload,
          dailyKey: runOutcome.config.dailyKey ?? undefined,
          sessionId: tokenStore.sessionId() ?? undefined,
        });
        setSubmitState({ status: 'success', result });
        if (result.ranking.personalBest) toast.success('New personal best — verified on the board.');
      } catch (error) {
        if (error instanceof ApiError && error.isOffline) {
          setSubmitState({ status: 'offline', message: 'No connection to the verification service.' });
          return;
        }
        if (error instanceof ApiError && (error.code === 'replay_rejected' || error.status === 422)) {
          const details = error.details as { reason?: string; detail?: string } | undefined;
          setSubmitState({
            status: 'rejected',
            code: details?.reason ?? error.code,
            message: error.message,
            detail: details?.detail,
          });
          return;
        }
        setSubmitState({ status: 'offline', message: error instanceof Error ? error.message : 'Submission failed.' });
      }
    },
    [],
  );

  /* ------------------------- session lifecycle ---------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (phase === 'results') return;

    const session = new RunSession({
      canvas,
      config: layout as RunConfig,
      settings: settingsStoreSnapshot(settings),
      sessionId: tokenStore.sessionId() ?? 'local',
      callbacks: {
        onHud: setHud,
        onComplete: (completed) => {
          outcomeRef.current = completed;
          setOutcome(completed);
          setPhase('results');
          void submit(completed);
        },
        onPauseChange: (paused) => setPhase(paused ? 'paused' : 'playing'),
      },
    });
    sessionRef.current = session;
    session.preview();

    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      session.resize(Math.round(rect.width), Math.round(rect.height));
    });
    if (frameRef.current) observer.observe(frameRef.current);

    return () => {
      observer.disconnect();
      session.destroy();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, phase === 'results']);

  const started = useRef(false);

  useEffect(() => {
    if (phase !== 'countdown') return;
    started.current = false;
    setCountdownIndex(0);
    const timers: number[] = [];
    COUNTDOWN_STEPS.forEach((_, index) => {
      timers.push(window.setTimeout(() => setCountdownIndex(index), index * 620));
    });
    timers.push(
      window.setTimeout(() => {
        const session = sessionRef.current;
        if (!session || started.current) return;
        started.current = true;
        session.start();
        setPhase('playing');
      }, COUNTDOWN_STEPS.length * 620),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [phase]);

  /* ---------------------------- input plumbing ---------------------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' && phase === 'paused') {
        event.preventDefault();
        sessionRef.current?.resume();
      }
      if (event.code === 'KeyR' && phase === 'results') onRestartRequested?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onRestartRequested]);

  const handlePause = () => {
    if (phase === 'playing') sessionRef.current?.pause();
    else if (phase === 'paused') sessionRef.current?.resume();
  };

  const handleAbandon = () => {
    const session = sessionRef.current;
    if (!session) {
      onExit();
      return;
    }
    const abandoned = session.abort();
    outcomeRef.current = abandoned;
    setOutcome(abandoned);
    setSubmitState({ status: 'idle' });
    setPhase('results');
  };

  const handleMute = () => {
    const next = !muted;
    setMuted(next);
    audio.soundEnabled = !next;
    if (next) audio.stopMusic(0.2);
    else if (settings.music) audio.startMusic();
  };

  const restart = () => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setOutcome(null);
    setSubmitState({ status: 'idle' });
    setPhase('countdown');
    onRestartRequested?.();
  };

  const modeMeta = MODES[mode];
  const session = sessionRef.current;
  const isTouch = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

  return (
    <div className="relative mx-auto w-full max-w-6xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ------------------------------ arena ------------------------------ */}
        <div
          ref={frameRef}
          className="relative mx-auto w-full max-w-[540px] overflow-hidden rounded-[28px] border border-white/10 bg-[#04030c] shadow-[0_50px_120px_-60px_rgba(56,189,248,0.6)]"
        >
          <div className="relative aspect-[2/3] w-full scanlines">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none select-none"
              aria-label="Cosmic Invader Frontiers play area. Use the arrow keys or A and D to move, and space to fire."
              role="img"
            />

            {hud && phase !== 'results' ? (
              <GameHud
                hud={hud}
                modeLabel={modeMeta.label}
                difficultyLabel={difficulty}
                paused={phase === 'paused'}
                muted={muted}
                onPause={handlePause}
                onToggleMute={handleMute}
                showDebug={showDebug}
              />
            ) : null}

            {/* Countdown */}
            <AnimatePresence>
              {phase === 'countdown' ? (
                <motion.div
                  key="countdown"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#04030c]/70 backdrop-blur-[3px]"
                >
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.4em] text-primary">
                    {dailyKey ? 'Daily Sortie' : modeMeta.label}
                  </p>
                  <AnimatePresence mode="popLayout">
                    <motion.p
                      key={COUNTDOWN_STEPS[countdownIndex]}
                      initial={{ opacity: 0, scale: 0.6, filter: 'blur(12px)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, scale: 1.35, filter: 'blur(10px)' }}
                      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                      className="font-display text-6xl font-bold tracking-tight text-gradient"
                    >
                      {COUNTDOWN_STEPS[countdownIndex]}
                    </motion.p>
                  </AnimatePresence>
                  <p className="mt-3 max-w-xs text-center text-sm text-muted-foreground">
                    {dailyChallengeLabel ?? modeMeta.blurb}
                  </p>
                  <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground">
                    seed {seed.toString(16).toUpperCase()}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Keyboard className="h-3.5 w-3.5" /> ← → / A D</span>
                    <span className="inline-flex items-center gap-1.5"><Play className="h-3.5 w-3.5" /> Space / J</span>
                    <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Shift = overdrive</span>
                    <span className="inline-flex items-center gap-1.5"><Pause className="h-3.5 w-3.5" /> P / Esc</span>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Pause */}
            <AnimatePresence>
              {phase === 'paused' ? (
                <motion.div
                  key="pause"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#04030c]/80 backdrop-blur-sm"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Run paused"
                >
                  <p className="font-display text-4xl font-semibold tracking-tight">Paused</p>
                  <p className="max-w-xs text-center text-sm text-muted-foreground">
                    Your run is live and the clock is frozen. Resume when you are ready — the engine only counts ticks it
                    simulates.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => sessionRef.current?.resume()}
                      className="btn-cosmic inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-2.5 font-semibold text-slate-950"
                    >
                      <Play className="h-4 w-4" /> Resume
                    </button>
                    <button
                      type="button"
                      onClick={handleAbandon}
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium transition hover:border-destructive/50 hover:text-destructive-foreground"
                    >
                      <X className="h-4 w-4" /> Abandon run
                    </button>
                  </div>
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground">
                    space resumes · abandoned runs are never submitted
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Results */}
            <AnimatePresence>
              {phase === 'results' && outcome ? (
                <motion.div
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#04030c]/86 p-3 backdrop-blur-md sm:items-center sm:p-5"
                >
                  <RunResults
                    outcome={outcome}
                    submitState={submitState}
                    onPlayAgain={restart}
                    onExit={onExit}
                    onRetrySubmit={() => outcomeRef.current && void submit(outcomeRef.current)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Mobile overdrive trigger */}
            {isTouch && phase === 'playing' ? (
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  session?.input.pulseSpecial();
                }}
                className="absolute bottom-20 right-3 z-30 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-500/20 text-emerald-100 backdrop-blur active:scale-95"
                aria-label="Trigger overdrive"
              >
                <Zap className="h-6 w-6" />
              </button>
            ) : null}
          </div>
        </div>

        {/* ------------------------------ sidebar ---------------------------- */}
        <aside className="space-y-4">
          <div className="glass rounded-3xl p-4">
            <p className="label-eyebrow">Current sortie</p>
            <h2 className="mt-1 font-display text-lg font-semibold">{modeMeta.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{modeMeta.blurb}</p>
            <dl className="mt-3 space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Difficulty</dt>
                <dd>{difficulty}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Assist</dt>
                <dd>{assist ? 'on · unranked' : 'off · ranked'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Seed</dt>
                <dd>{seed.toString(16).toUpperCase()}</dd>
              </div>
              {dailyKey ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Daily</dt>
                  <dd>{dailyKey}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Elapsed</dt>
                <dd>{hud ? formatDuration(hud.timeSeconds * 1000) : '0:00'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Stage score</dt>
                <dd>{hud ? formatScore(hud.score) : '0'}</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePause}
                disabled={phase === 'results'}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40 disabled:opacity-50"
              >
                <Pause className="h-4 w-4" /> {phase === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                onClick={handleMute}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="glass rounded-3xl p-4">
            <p className="label-eyebrow">Flight manual</p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Keyboard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span><strong className="text-foreground">Move</strong> with ← → or A/D. <strong className="text-foreground">Fire</strong> with Space, or let auto-fire run from Settings.</span>
              </li>
              <li className="flex gap-2">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span><strong className="text-foreground">Overdrive</strong> charges as you land hits and burns for six seconds of triple fire and invulnerability.</span>
              </li>
              <li className="flex gap-2">
                <MousePointer2 className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
                <span><strong className="text-foreground">Touch</strong>: drag anywhere on the arena to fly, the ship fires while you hold.</span>
              </li>
              {isTouch ? (
                <li className="flex gap-2">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  <span>Rotate to landscape for the widest view of the formation.</span>
                </li>
              ) : null}
            </ul>
          </div>

          <div className="glass rounded-3xl p-4">
            <p className="label-eyebrow">Fair play</p>
            <p className="mt-2 flex gap-2 text-sm text-muted-foreground">
              <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <span>
                Inputs are recorded per tick and re-simulated on the server. If the engine cannot reproduce the exact score,
                the run is stored but never ranked.
              </span>
            </p>
            <Link
              to="/about"
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              How verification works →
            </Link>
          </div>

          {phase === 'results' && submitState.status === 'rejected' ? (
            <div className="glass rounded-3xl border-destructive/30 p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-destructive-foreground">
                <AlertTriangle className="h-4 w-4" /> Verification note
              </p>
              <p className="mt-1 text-muted-foreground">
                Rejected runs are visible to you and to moderators only. Nothing about this outcome is hidden from you — the
                exact reason is shown on the result panel.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/**
 * Freeze the live settings into the shape the game loop expects. Reading them
 * once per session keeps mid-run settings changes from altering a ranked run.
 */
function settingsStoreSnapshot(settings: ReturnType<typeof useSettings>) {
  return {
    ...settings,
    autoFire: settings.autoFire,
  };
}
