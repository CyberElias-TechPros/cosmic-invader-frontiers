import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { CalendarClock, Flame, Rocket, Sparkles, Trophy } from 'lucide-react';
import { GameStage } from '@/components/game/GameStage';
import { CountUp, Panel, Seo, StatTile } from '@/components/common/atoms';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { useAuth } from '@/lib/auth';
import { useDaily } from '@/hooks/useApi';
import { useCountdown } from '@/lib/useCountdown';
import { formatDate, formatScore } from '@/lib/format';
import type { DailyChallenge } from '@shared/game/daily';

export default function Daily() {
  const auth = useAuth();
  const daily = useDaily();
  const [flying, setFlying] = useState<DailyChallenge | null>(null);
  const [seed, setSeed] = useState(0);

  const challenge = daily.data?.challenge;
  // The countdown is presentation only; the server owns the authoritative key.
  const remaining = useCountdown(challenge?.endsAt);
  const alreadyPlayed = Boolean(daily.data?.myResult);

  if (flying) {
    return (
      <>
        <Seo
          title="Daily Sortie — in flight | Cosmic Invader Frontiers"
          description="Flying today's shared-seed Daily Sortie. One armada, one board, everyone measured against the same challenge."
          path="/daily"
          noIndex
        />
        <div className="px-3 py-6 sm:px-6 sm:py-8">
          <GameStage
            mode="daily"
            difficulty={flying.difficulty}
            assist={false}
            seed={seed}
            dailyKey={flying.key}
            dailyChallengeLabel={`${flying.title} · par ${formatScore(flying.parScore)}`}
            onExit={() => {
              setFlying(null);
              void daily.refetch();
            }}
            onRestartRequested={() => setSeed(flying.seed)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Daily Sortie — one seed, one world | Cosmic Invader Frontiers"
        description="Every pilot faces the same armada each UTC day. Compare your verified Daily Sortie score against the global board and earn the par bonus."
        path="/daily"
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-eyebrow">Daily sortie</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {challenge?.title ?? "Today's challenge"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              One seed, generated from the UTC date and shared by every pilot. Difficulty rotates through the week and a wave
              modifier is rolled into the run — the same one for everybody.
            </p>
          </div>
          {remaining ? (
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono text-sm tabular-nums">
                {remaining.hours}:{remaining.minutes}:{remaining.seconds}
              </span>
              <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">until reset</span>
            </div>
          ) : null}
        </header>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Difficulty" value={challenge?.difficultyLabel ?? '—'} hint={challenge ? `×${challenge.modifier?.bonusPoints ?? 0} modifier bonus` : undefined} accent="cyan" />
          <StatTile label="Par score" value={challenge ? formatScore(challenge.parScore) : '—'} hint={`+${challenge?.bonusXp ?? 0} XP bonus`} accent="amber" />
          <StatTile label="Participants" value={<CountUp value={daily.data?.participants ?? 0} />} hint={daily.data?.topScore ? `top ${formatScore(daily.data.topScore)}` : 'no verified runs yet'} accent="magenta" />
          <StatTile
            label="Your result"
            value={daily.data?.myResult ? formatScore(daily.data.myResult.score) : '—'}
            hint={daily.data?.myRank ? `rank #${daily.data.myRank.rank} of ${daily.data.myRank.total}` : 'not flown yet today'}
            accent="emerald"
            icon={<Trophy className="h-4 w-4" />}
          />
        </div>

        <Panel className="relative mt-6 overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-center">
            <div>
              <p className="label-eyebrow">Today's modifier</p>
              <h2 className="mt-1 font-display text-xl font-semibold">
                {challenge?.modifier?.label ?? 'Standard armada'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {challenge?.modifier?.blurb ?? 'No modifier today — pure formation flying.'}
              </p>
              <ul className="mt-4 space-y-1.5 font-mono text-xs text-muted-foreground">
                <li>key {challenge?.key ?? daily.data?.todayKey ?? '—'}</li>
                <li>seed {challenge ? challenge.seed.toString(16).toUpperCase() : '—'}</li>
                <li>starts {challenge ? formatDate(challenge.startsAt) : '—'}</li>
                <li>ends {challenge ? formatDate(challenge.endsAt) : '—'} 00:00 UTC</li>
              </ul>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!challenge}
                  onClick={() => {
                    if (!challenge) return;
                    setSeed(challenge.seed);
                    setFlying(challenge);
                  }}
                  className="btn-cosmic inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-300 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50"
                >
                  <Rocket className="h-4 w-4" />
                  {alreadyPlayed ? 'Fly again (best score counts)' : "Fly today's sortie"}
                </button>
                {alreadyPlayed ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                    <Sparkles className="h-3.5 w-3.5" /> logged at {daily.data?.myResult ? formatDate(daily.data.myResult.completed_at) : ''}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <Flame className="h-4 w-4 text-amber-300" /> Streak rules
              </p>
              <p className="mt-2">
                Finishing a sortie on consecutive UTC days builds your streak. The achievement ladder tracks 3, 7 and 30-day
                streaks, and a broken streak resets to one.
              </p>
              <Link to="/achievements" className="mt-3 inline-flex text-primary underline-offset-4 hover:underline">
                See the streak medals →
              </Link>
            </div>
          </div>
        </Panel>

        <Panel className="mt-8 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <p className="label-eyebrow">Today's board</p>
            <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
              {challenge?.key ?? '—'}
            </p>
          </div>
          <LeaderboardTable
            entries={daily.data?.leaderboard ?? []}
            highlightPlayerId={auth.player?.id ?? null}
            loading={daily.isLoading}
            emptyMessage="Nobody has posted a verified run today. Be the first name on the board."
          />
        </Panel>

        {daily.data?.history && daily.data.history.length > 0 ? (
          <Panel className="mt-8 overflow-hidden">
            <div className="border-b border-white/8 px-5 py-4">
              <p className="label-eyebrow">Recent sorties</p>
            </div>
            <ul className="divide-y divide-white/6">
              {daily.data.history.map((entry) => (
                <li key={entry.key} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="font-mono text-sm">{entry.key}</p>
                    <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                      {entry.participants.toLocaleString()} pilots
                    </p>
                  </div>
                  <p className="font-mono text-sm text-primary">{entry.topScore ? formatScore(entry.topScore) : '—'}</p>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 text-center text-xs text-muted-foreground"
        >
          Daily scores are verified exactly like campaign runs — no exceptions, no manual overrides.
        </motion.p>
      </div>
    </>
  );
}
