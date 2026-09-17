import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Award, BarChart3, Flag, Loader2, RefreshCw, Share2, Sparkles, Trophy, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { CountUp, TierChip, VerifiedBadge } from '@/components/common/atoms';
import { api, ApiError, shareCardUrl } from '@/lib/api';
import { audio } from '@/game/audio';
import type { RunOutcome } from '@/game/session';
import type { SubmitRunResult } from '@/lib/types';
import { formatDuration, formatPercent, formatScore } from '@/lib/format';
import { cn } from '@/lib/utils';

export type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: SubmitRunResult }
  | { status: 'rejected'; message: string; code: string; detail?: string }
  | { status: 'offline'; message: string };

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold leading-none">{value}</p>
      {hint ? <p className="mt-1 text-[0.68rem] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function RunResults({
  outcome,
  submitState,
  onPlayAgain,
  onExit,
  onRetrySubmit,
}: {
  outcome: RunOutcome;
  submitState: SubmitState;
  onPlayAgain: () => void;
  onExit: () => void;
  onRetrySubmit: () => void;
}) {
  const { result, abandoned } = outcome;
  const success = submitState.status === 'success' ? submitState.result : null;
  const [shareState, setShareState] = useState<'idle' | 'working'>('idle');
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    // Sound the result with a short procedural fanfare — no asset needed.
    audio.init();
    if (!audio.soundEnabled) return;
    if (success?.ranking.personalBest) audio.play('extraLife');
    else if (success) audio.play('waveClear');
    else audio.play('gameOver');
  }, [success]);

  const shareText = success
    ? `I scored ${formatScore(result.score)} on Cosmic Invader Frontiers (wave ${result.wave}, ${formatPercent(result.accuracy)} accuracy) — verified, not claimed.`
    : `Run complete: ${formatScore(result.score)} on Cosmic Invader Frontiers.`;

  const handleShare = async () => {
    setShareState('working');
    const runId = success?.run.id;
    const url = runId ? shareCardUrl(runId) : `${window.location.origin}/leaderboards`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Cosmic Invader Frontiers', text: shareText, url });
        setShareState('idle');
        return;
      }
      await navigator.clipboard.writeText(`${shareText} ${url}`);
      toast.success('Share link copied to clipboard');
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Could not open the share sheet — copy the URL from the address bar instead.');
      }
    } finally {
      setShareState('idle');
    }
  };

  const handleDownload = async () => {
    const runId = success?.run.id;
    if (!runId) return;
    try {
      const response = await fetch(shareCardUrl(runId));
      if (!response.ok) throw new Error('Card unavailable');
      const svg = await response.text();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cosmic-run-${runId.slice(0, 8)}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Share card downloaded');
    } catch {
      toast.error('Could not download the card. Try again in a moment.');
    }
  };

  const reportProblem = async () => {
    if (!success) return;
    try {
      await api.reportRun(success.run.id, 'result-disputed', 'Pilot flagged their own submitted run for review.');
      toast.success('Report filed — a moderator will review this run.');
    } catch {
      toast.error('Could not file the report right now.');
    }
  };

  const statusBanner = () => {
    if (abandoned) {
      return (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Run abandoned — nothing was submitted, and this score will not appear on any board. Launch a fresh sortie whenever you
          are ready.
        </div>
      );
    }
    switch (submitState.status) {
      case 'submitting':
        return (
          <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Re-simulating your run server-side to verify the score…
          </div>
        );
      case 'rejected':
        return (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            <p className="font-medium text-destructive-foreground">
              This run was not ranked ({submitState.code}).
            </p>
            <p className="mt-1 text-muted-foreground">
              {submitState.message}
              {submitState.detail ? ` · ${submitState.detail}` : ''}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Nothing is hidden here: an unverified run stays out of the leaderboards on purpose. Seeded gameplay variations
              (assist mode, mid-run tab switches on a throttled device) are the usual causes.
            </p>
          </div>
        );
      case 'offline':
        return (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <p className="font-medium">The frontier network did not answer.</p>
            <p className="mt-1 text-amber-200/80">
              Your result is kept in this tab so it can be submitted the moment the connection returns.
            </p>
            <button
              type="button"
              onClick={onRetrySubmit}
              className="btn-cosmic mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/20 px-4 py-2 text-sm font-medium text-amber-100"
            >
              <RefreshCw className="h-4 w-4" /> Retry submission
            </button>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadge
              label={`Verified in ${success.verification.ms} ms`}
              detail={`The engine re-simulated ${success.verification.ticks.toLocaleString()} ticks and reproduced this score exactly.`}
            />
            {success.flags.includes('duplicate') ? (
              <span className="rank-chip border-white/15 bg-white/[0.04] text-muted-foreground">
                identical replay · already scored
              </span>
            ) : null}
            {!success.run.ranked ? (
              <span className="rank-chip border-amber-400/30 bg-amber-500/10 text-amber-200">
                assist mode · unranked
              </span>
            ) : null}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={reduced ? undefined : { opacity: 0, y: 20, scale: 0.99 }}
      animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="glass-strong relative z-30 w-full max-w-2xl overflow-hidden rounded-3xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-results-title"
    >
      <div className="relative overflow-hidden border-b border-white/10 px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 top-10 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <p className="label-eyebrow relative">Sortie complete</p>
        <h2 id="run-results-title" className="relative mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          <CountUp value={result.score} className="text-gradient" />
        </h2>
        <div className="relative mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rank-chip border-white/15 bg-white/[0.04]">
            {result.mode === 'daily' ? 'Daily Sortie' : result.mode === 'gauntlet' ? 'Overdrive Gauntlet' : 'Campaign'}
          </span>
          <span className="rank-chip border-white/15 bg-white/[0.04]">{result.difficulty}</span>
          <span className="rank-chip border-white/15 bg-white/[0.04]">wave {result.wave}</span>
          <span className="rank-chip border-white/15 bg-white/[0.04]">
            {result.endReason === 'destroyed' ? 'ship destroyed' : result.endReason === 'invaded' ? 'line breached' : result.endReason}
          </span>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-7">
        {statusBanner()}

        {success ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-3">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-primary">
                {success.ranking.personalBest ? 'personal best' : 'board position'}
              </p>
              <p className="mt-1 font-display text-xl font-semibold">
                {success.ranking.personalBest ? (
                  <span className="inline-flex items-center gap-1.5 text-primary">
                    <Trophy className="h-4 w-4" /> New record
                  </span>
                ) : success.ranking.rank ? (
                  <>
                    #{success.ranking.rank}
                    <span className="text-sm text-muted-foreground"> / {success.ranking.total?.toLocaleString()}</span>
                  </>
                ) : (
                  '—'
                )}
              </p>
              <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                {success.ranking.label}
              </p>
            </div>

            <div className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 p-3">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-fuchsia-200">xp awarded</p>
              <p className="mt-1 font-display text-xl font-semibold text-fuchsia-100">
                +<CountUp value={success.xp.awarded} durationMs={700} />
              </p>
              <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-fuchsia-200/80">
                {success.xp.levelUp ? `level up → ${success.xp.level}` : `level ${success.xp.level} · ${success.xp.total.toLocaleString()} total`}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-emerald-200">accuracy</p>
              <p className="mt-1 font-display text-xl font-semibold text-emerald-100">{formatPercent(result.accuracy, 1)}</p>
              <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-emerald-200/80">
                {result.stats.shotsHit}/{result.stats.shotsFired} shots landed
              </p>
            </div>
          </div>
        ) : null}

        {success && success.achievements.length > 0 ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] p-4">
            <p className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.24em] text-amber-200">
              <Sparkles className="h-3.5 w-3.5" /> {success.achievements.length} achievement{success.achievements.length > 1 ? 's' : ''} unlocked
            </p>
            <ul className="mt-3 space-y-2">
              {success.achievements.map((achievement, index) => (
                <motion.li
                  key={achievement.id}
                  initial={reduced ? undefined : { opacity: 0, x: -12 }}
                  animate={reduced ? undefined : { opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + index * 0.06 }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Award className="h-4 w-4 text-amber-200" aria-hidden="true" />
                    <span>
                      <span className="font-medium">{achievement.name}</span>
                      <span className="block text-xs text-muted-foreground">{achievement.description}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <TierChip tier={achievement.tier} />
                    <span className="font-mono text-xs text-amber-200">+{achievement.points}</span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        ) : null}

        {success?.daily ? (
          <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            <span className="font-medium">Daily Sortie logged.</span> Par was {formatScore(success.daily.parScore)} — you scored{' '}
            {formatScore(result.score)}. Par bonus: +{success.daily.bonusAwarded} XP ·{' '}
            {success.daily.participants.toLocaleString()} pilots on today's board.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCell label="kills" value={result.stats.kills.toLocaleString()} />
          <StatCell label="max combo" value={`${result.stats.maxCombo}×`} />
          <StatCell label="bosses" value={String(result.stats.bossKills)} />
          <StatCell label="ufos" value={String(result.stats.ufosDestroyed)} />
          <StatCell label="time" value={formatDuration(result.durationMs)} />
          <StatCell label="lives lost" value={String(result.stats.livesLost)} />
          <StatCell label="powerups" value={String(result.stats.powerupsCollected)} />
          <StatCell label="divers" value={String(result.stats.diversKilled)} />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className="btn-cosmic inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-300 px-5 py-2.5 font-semibold text-slate-950"
          >
            <RefreshCw className="h-4 w-4" /> Play again
          </button>
          <Link
            to="/leaderboards"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium transition hover:border-primary/40 hover:bg-white/[0.07]"
          >
            <BarChart3 className="h-4 w-4" /> Leaderboards
          </Link>
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={shareState === 'working'}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium transition hover:border-primary/40 hover:bg-white/[0.07]"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          {success ? (
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium transition hover:border-primary/40 hover:bg-white/[0.07]"
            >
              Download card
            </button>
          ) : null}
          <button
            type="button"
            onClick={onExit}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          >
            Change mode <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3">
            <Link to={`/runs/${success.run.id}`} className="text-xs text-primary underline-offset-4 hover:underline">
              View the verified run page →
            </Link>
            <button
              type="button"
              onClick={() => void reportProblem()}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <Flag className="h-3.5 w-3.5" /> Flag this result
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export { ApiError };
