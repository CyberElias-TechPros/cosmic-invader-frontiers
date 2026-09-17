import { motion } from 'motion/react';
import { Flame, Heart, Pause, Shield, Target, Volume2, VolumeX, Zap } from 'lucide-react';
import type { HudView } from '@/game/session';
import { formatClock, formatScore } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * In-run heads-up display.
 *
 * Layout rule: the two numbers a pilot checks mid-fight — score and lives —
 * are the largest things on screen, and nothing overlaps the play area except
 * a thin top bar and a bottom-right stack.
 */
export function GameHud({
  hud,
  modeLabel,
  difficultyLabel,
  paused,
  muted,
  onPause,
  onToggleMute,
  showDebug,
}: {
  hud: HudView;
  modeLabel: string;
  difficultyLabel: string;
  paused: boolean;
  muted: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  showDebug?: boolean;
}) {
  const multiplier = hud.comboMultiplier;
  const chargeRatio = Math.min(1, hud.overdriveCharge / 30);
  const overdriveReady = hud.overdriveReady;

  return (
    <>
      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2 sm:p-3">
        <div className="pointer-events-auto glass rounded-2xl px-3 py-2">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-muted-foreground">
            {modeLabel} · {difficultyLabel}
          </p>
          <p className="font-display text-xl font-semibold leading-none tracking-tight sm:text-2xl">
            <motion.span
              key={hud.score}
              initial={{ scale: 1.08, opacity: 0.85 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="stat-value inline-block"
            >
              {formatScore(hud.score)}
            </motion.span>
          </p>
          <div className="mt-1 flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Heart className={cn('h-3 w-3', hud.lives <= 1 ? 'text-rose-400' : 'text-rose-300')} aria-hidden="true" />
              {hud.lives}
            </span>
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3 w-3 text-cyan-300" aria-hidden="true" />
              {hud.shieldCharges}
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3 text-emerald-300" aria-hidden="true" />
              {Math.round(hud.accuracy * 100)}%
            </span>
            <span className="inline-flex items-center gap-1">
              <Flame className="h-3 w-3 text-amber-300" aria-hidden="true" />
              {hud.wave}
            </span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {hud.combo >= 3 ? (
            <motion.div
              key={multiplier}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass rounded-2xl px-3 py-2 text-center"
            >
              <p className="font-mono text-[0.55rem] uppercase tracking-[0.24em] text-amber-300">combo</p>
              <p className="font-display text-lg font-semibold leading-none text-amber-200">
                {hud.combo}
                <span className="ml-1 font-mono text-xs text-amber-300/80">×{multiplier.toFixed(1)}</span>
              </p>
            </motion.div>
          ) : null}

          <button
            type="button"
            onClick={onToggleMute}
            className="glass rounded-xl p-2 text-muted-foreground transition hover:text-foreground"
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={onPause}
            className="glass rounded-xl p-2 text-muted-foreground transition hover:text-foreground"
            aria-label={paused ? 'Resume run' : 'Pause run'}
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Bottom stack: overdrive + wave state */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 p-2 sm:p-3">
        <div className="glass min-w-[9rem] rounded-2xl px-3 py-2">
          <div className="flex items-center justify-between font-mono text-[0.58rem] uppercase tracking-[0.22em]">
            <span className={cn(overdriveReady || hud.overdriveActive ? 'text-emerald-300' : 'text-muted-foreground')}>
              {hud.overdriveActive ? 'overdrive active' : overdriveReady ? 'overdrive ready' : 'overdrive'}
            </span>
            <span className="text-muted-foreground">{Math.floor(chargeRatio * 100)}%</span>
          </div>
          <div className="hud-bar mt-1.5 h-2">
            <span
              className={cn(
                'h-full',
                hud.overdriveActive
                  ? 'bg-gradient-to-r from-emerald-300 to-lime-300'
                  : overdriveReady
                    ? 'bg-gradient-to-r from-emerald-400 to-cyan-300 animate-pulse-glow'
                    : 'bg-gradient-to-r from-cyan-500/70 to-fuchsia-500/70',
              )}
              style={{ width: `${Math.max(2, chargeRatio * 100)}%` }}
            />
          </div>
          <p className="mt-1 hidden font-mono text-[0.55rem] uppercase tracking-widest text-muted-foreground sm:block">
            shift / tap ⚡ to trigger
          </p>
        </div>

        <div className="glass rounded-2xl px-3 py-2 text-right">
          {hud.isBossWave && hud.bossMaxHp > 0 ? (
            <>
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-rose-300">dreadnought</p>
              <div className="hud-bar mt-1 h-2 w-40">
                <span
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-300"
                  style={{ width: `${Math.max(0, (hud.bossHp / hud.bossMaxHp) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">hostiles</p>
              <p className="font-display text-lg font-semibold leading-none">{hud.enemiesRemaining}</p>
            </>
          )}
          <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-widest text-muted-foreground">
            {hud.waveModifierLabel ? <span className="inline-flex items-center gap-1 text-fuchsia-300"><Zap className="h-3 w-3" />{hud.waveModifierLabel}</span> : formatClock(hud.timeSeconds)}
          </p>
        </div>
      </div>

      {/* Wave announcement */}
      {hud.waveAnnouncement ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-none absolute inset-x-0 top-24 z-20 text-center"
        >
          <p className="font-display text-xl font-semibold uppercase tracking-[0.3em] text-rose-300 text-glow sm:text-2xl">
            {hud.waveAnnouncement}
          </p>
        </motion.div>
      ) : null}

      {showDebug ? (
        <p className="pointer-events-none absolute bottom-1 left-1 z-20 font-mono text-[0.55rem] text-muted-foreground/70">
          {hud.fps} fps · tick-accurate
        </p>
      ) : null}
    </>
  );
}
