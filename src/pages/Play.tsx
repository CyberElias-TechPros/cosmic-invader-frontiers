import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Info, Rocket, ShieldCheck, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import { GameStage } from '@/components/game/GameStage';
import { Panel, PilotAvatar, Seo, VerifiedBadge } from '@/components/common/atoms';
import { DIFFICULTIES, MODES, type Difficulty } from '@shared/game/config';
import { useConfig, useLeaderboard, useMyPlacement } from '@/hooks/useApi';
import { useSettings, updateSettings } from '@/lib/settings';
import { track } from '@/lib/telemetry';
import { formatScore } from '@/lib/format';
import { cn } from '@/lib/utils';

type Stage = { kind: 'briefing' } | { kind: 'flying'; seed: number };

export default function Play() {
  const params = useParams<{ mode?: string }>();
  const navigate = useNavigate();
  const settings = useSettings();
  const config = useConfig();
  const reduced = useReducedMotion();

  const mode: 'campaign' | 'gauntlet' = params.mode === 'gauntlet' ? 'gauntlet' : 'campaign';
  const meta = MODES[mode];
  const lockedDifficulty = meta.difficultyLocked;

  const [difficulty, setDifficulty] = useState<Difficulty>((settings.difficulty as Difficulty) ?? 'pilot');
  const [assist, setAssist] = useState(settings.assistMode);
  const [stage, setStage] = useState<Stage>({ kind: 'briefing' });

  useEffect(() => {
    if (lockedDifficulty) setDifficulty(lockedDifficulty);
  }, [lockedDifficulty]);

  const board = `${mode}:${difficulty}:alltime`;
  const leaderboard = useLeaderboard({ mode, difficulty, pageSize: 5 });
  const placement = useMyPlacement({ mode, difficulty });

  const launch = useCallback(() => {
    updateSettings({ difficulty, assistMode: assist });
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    setStage({ kind: 'flying', seed });
    track('run_start', { mode, difficulty, assist });
  }, [assist, difficulty, mode]);

  const nextSeed = useCallback(() => {
    setStage({ kind: 'flying', seed: Math.floor(Math.random() * 0xffffffff) >>> 0 });
  }, []);

  const difficultyCards = useMemo(() => Object.values(DIFFICULTIES), []);

  if (stage.kind === 'flying') {
    return (
      <>
        <Seo
          title={`${meta.label} — in flight | Cosmic Invader Frontiers`}
          description={`Flying ${meta.label} on ${difficulty} difficulty with server-verified scoring.`}
          path={mode === 'gauntlet' ? '/play/gauntlet' : '/play'}
          noIndex
        />
        <div className="px-3 py-6 sm:px-6 sm:py-8">
          <GameStage
            mode={mode}
            difficulty={difficulty}
            assist={assist}
            seed={stage.seed}
            onExit={() => setStage({ kind: 'briefing' })}
            onRestartRequested={nextSeed}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title={`${meta.label} — play verified | Cosmic Invader Frontiers`}
        description={`${meta.blurb} Choose a difficulty, fly a sortie and have your score re-simulated on the server before it counts.`}
        path={mode === 'gauntlet' ? '/play/gauntlet' : '/play'}
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to base
        </button>

        <motion.header
          initial={reduced ? undefined : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mt-6"
        >
          <p className="label-eyebrow">Pre-flight briefing</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{meta.label}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{meta.blurb}</p>
        </motion.header>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="label-eyebrow">Difficulty</p>
                {lockedDifficulty ? (
                  <span className="rank-chip border-amber-400/30 bg-amber-500/10 text-amber-200">
                    locked to {DIFFICULTIES[lockedDifficulty].label}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {difficultyCards.map((option) => {
                  const active = option.id === difficulty;
                  const locked = Boolean(lockedDifficulty) && option.id !== lockedDifficulty;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={locked}
                      onClick={() => setDifficulty(option.id)}
                      className={cn(
                        'relative rounded-2xl border p-4 text-left transition',
                        active
                          ? 'border-primary/50 bg-primary/10 shadow-[0_20px_60px_-40px_rgba(56,189,248,0.9)]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20',
                        locked && 'cursor-not-allowed opacity-40',
                      )}
                      aria-pressed={active}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-base font-semibold">{option.label}</span>
                        <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                          ×{option.scoreMultiplier.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">{option.blurb}</p>
                      <div className="mt-3 flex flex-wrap gap-2 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                        <span className="rounded-full border border-white/10 px-2 py-0.5">{option.lives} lives</span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5">speed ×{option.enemySpeed}</span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5">fire ×{option.enemyFire}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel className="p-5">
              <p className="label-eyebrow">Options</p>
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <input
                  type="checkbox"
                  checked={assist}
                  onChange={(event) => setAssist(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-cyan-400"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    Pilot assist <ShieldCheck className="h-3.5 w-3.5 text-amber-300" />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    An extra life, slower enemy fire and double the power-up drops. Assisted runs are stored and counted in your
                    record but never appear on ranked boards — that is the honest trade.
                  </span>
                </span>
              </label>

              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <input
                  type="checkbox"
                  checked={settings.autoFire}
                  onChange={(event) => updateSettings({ autoFire: event.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-cyan-400"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    Auto-fire <Target className="h-3.5 w-3.5 text-cyan-300" />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Hold nothing — the cannon fires continuously. Turn it off for the classic trigger feel.
                  </span>
                </span>
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={launch}
                  className="btn-cosmic inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-300 px-6 py-3 font-semibold text-slate-950"
                >
                  <Rocket className="h-4 w-4" /> Launch sortie
                </button>
                <span className="text-xs text-muted-foreground">
                  {assist ? 'Unranked practice' : 'Ranked — score will be re-simulated on submission'}
                </span>
              </div>
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <p className="label-eyebrow">Board preview</p>
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">{board}</span>
              </div>
              <ol className="mt-3 space-y-2">
                {(leaderboard.data?.entries ?? []).map((entry) => (
                  <li key={entry.runId} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2">
                    <span className="w-5 text-center font-mono text-xs text-muted-foreground">{entry.rank}</span>
                    <PilotAvatar seed={entry.avatarSeed} name={entry.displayName} size={26} />
                    <span className="min-w-0 flex-1 truncate text-sm">{entry.displayName}</span>
                    <span className="font-mono text-sm text-primary">{formatScore(entry.score)}</span>
                  </li>
                ))}
                {leaderboard.isLoading ? <li className="py-4 text-center text-sm text-muted-foreground">Loading board…</li> : null}
                {!leaderboard.isLoading && (leaderboard.data?.entries.length ?? 0) === 0 ? (
                  <li className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-muted-foreground">
                    No verified runs on this board yet.
                  </li>
                ) : null}
              </ol>
            </Panel>

            <Panel className="p-5">
              <p className="label-eyebrow">Your position</p>
              {placement.data && placement.data.rank > 0 ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 font-display text-lg text-primary">
                    #{placement.data.rank}
                  </span>
                  <div>
                    <p className="text-sm">Best {formatScore(placement.data.score)}</p>
                    <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                      of {placement.data.total.toLocaleString()} pilots
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Fly a ranked sortie on this difficulty to claim a position.
                </p>
              )}
            </Panel>

            <Panel className="p-5">
              <p className="label-eyebrow">Verified run</p>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                <p className="flex gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-300" />
                  <span>
                    {config.data?.achievements.total ?? 30} achievements and XP are awarded from the <em>server's</em> replay, so a
                    lucky client cannot invent progression.
                  </span>
                </p>
                <p className="flex gap-2">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>Overdrive charges through hits — spend it on a boss, not on a grunt wave.</span>
                </p>
                <p className="flex gap-2">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>Only your best score per board is kept, so replaying is always safe.</span>
                </p>
                <div className="pt-1">
                  <VerifiedBadge label="server-verified" />
                </div>
              </div>
            </Panel>

            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Prefer a different mode? <Link to="/play/gauntlet" className="text-primary underline-offset-4 hover:underline">Overdrive Gauntlet</Link>{' '}
                is the boss rush, and the{' '}
                <Link to="/daily" className="text-primary underline-offset-4 hover:underline">Daily Sortie</Link> shares one seed with
                the whole world.
              </span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
