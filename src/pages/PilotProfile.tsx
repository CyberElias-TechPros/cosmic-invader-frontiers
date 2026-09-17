import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Award, CalendarClock, ShieldCheck, Target, Zap } from 'lucide-react';
import { EmptyPanel, LoadingBlock, Panel, PilotAvatar, Seo, StatTile } from '@/components/common/atoms';
import { usePublicProfile } from '@/hooks/useApi';
import { formatDateTime, formatDuration, formatPercent, formatScore, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function PilotProfile() {
  const { handle } = useParams<{ handle: string }>();
  const profile = usePublicProfile(handle);

  if (profile.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <LoadingBlock rows={5} label="Loading pilot record" />
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyPanel
          icon={<Target className="h-6 w-6 text-primary" />}
          title="No pilot found with that handle"
          message={`We could not find @${handle ?? 'that pilot'} in the registry. Handles are case-insensitive but must match exactly.`}
          action={
            <Link to="/leaderboards" className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
              Back to the boards
            </Link>
          }
        />
      </div>
    );
  }

  const { player, progression, totals, achievementsUnlocked, globalRank, recentRuns } = profile.data;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: player.displayName,
      alternateName: player.handle,
      description: `Verified pilot record — ${totals.runsSubmitted} sorties, best score ${formatScore(totals.bestScore)}.`,
    },
  };

  return (
    <>
      <Seo
        title={`${player.displayName} (@${player.handle}) — pilot record | Cosmic Invader Frontiers`}
        description={`${player.rank} · level ${player.level} · best score ${formatScore(totals.bestScore)} across ${totals.runsSubmitted} verified sorties. ${achievementsUnlocked} achievements unlocked.`}
        path={`/pilots/${player.handle}`}
        type="profile"
        jsonLd={jsonLd}
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <Link to="/leaderboards" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Leaderboards
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass relative mt-5 overflow-hidden rounded-3xl p-6 sm:p-7"
        >
          <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-5">
            <PilotAvatar seed={player.avatarSeed} name={player.displayName} size={72} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight">{player.displayName}</h1>
                <span className="rank-chip border-primary/30 bg-primary/10 text-primary">
                  {player.insignia} {progression.rank}
                </span>
                {player.isGuest ? (
                  <span className="rank-chip border-amber-400/35 bg-amber-500/10 text-amber-200">guest</span>
                ) : (
                  <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> verified pilot
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                @{player.handle} · level {player.level} · {player.xp.toLocaleString()} XP
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> joined {formatDateTime(player.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> last seen {timeAgo(player.lastSeenAt)}
                </span>
                {player.country ? <span>{player.country}</span> : null}
              </p>
            </div>
            {globalRank ? (
              <div className="rounded-2xl border border-primary/25 bg-primary/10 px-5 py-3 text-center">
                <p className="label-eyebrow">Global rank</p>
                <p className="font-display text-2xl font-semibold text-primary">#{globalRank.rank}</p>
                <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                  of {globalRank.total.toLocaleString()}
                </p>
              </div>
            ) : null}
          </div>
        </motion.header>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Best score" value={formatScore(totals.bestScore)} accent="cyan" icon={<Target className="h-4 w-4" />} />
          <StatTile label="Total score" value={formatScore(totals.totalScore)} accent="magenta" />
          <StatTile label="Sorties" value={totals.runsSubmitted.toLocaleString()} hint={`${totals.gamesPlayed} started`} accent="amber" />
          <StatTile label="Achievements" value={String(achievementsUnlocked)} accent="emerald" icon={<Award className="h-4 w-4" />} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel className="overflow-hidden">
            <div className="border-b border-white/8 px-5 py-4">
              <p className="label-eyebrow">Recent verified runs</p>
            </div>
            {recentRuns.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">This pilot has not posted a run yet.</p>
            ) : (
              <ul className="divide-y divide-white/6">
                {recentRuns.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <Link to={`/runs/${run.id}`} className="font-mono text-sm text-primary hover:underline">
                        {formatScore(run.score)}
                      </Link>
                      <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                        {run.mode} · {run.difficulty} · wave {run.wave} · {formatPercent(run.accuracy, 1)} ·{' '}
                        {formatDuration(run.duration_ms)} · {timeAgo(run.created_at)}
                      </p>
                    </div>
                    <Link
                      to={`/runs/${run.id}`}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs transition hover:border-primary/40"
                    >
                      Evidence
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-5">
            <p className="label-eyebrow">Career breakdown</p>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Best wave', String(totals.bestWave)],
                ['Best combo', `${totals.bestCombo}×`],
                ['Best accuracy', formatPercent(totals.bestAccuracy, 1)],
                ['Kills', totals.totalKills.toLocaleString()],
                ['Dreadnoughts', String(totals.totalBossKills)],
                ['Saucers', String(totals.totalUfosDestroyed)],
                ['Time in cockpit', formatDuration(totals.totalPlayMs)],
                ['Daily streak', `${totals.dailyStreak} days`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 last:border-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={cn('font-mono')}>{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
