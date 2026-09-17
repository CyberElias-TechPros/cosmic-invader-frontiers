import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  Award,
  Cpu,
  Crown,
  Gauge,
  Globe2,
  Radar,
  ShieldCheck,
  Skull,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import {
  CountUp,
  MotionSection,
  Panel,
  PilotAvatar,
  PlayNowButton,
  SectionHeading,
  Seo,
  StatTile,
  TierChip,
} from '@/components/common/atoms';
import {
  useAchievementCatalog,
  useConfig,
  useDaily,
  useGlobalStats,
  useLeaderboard,
  useMyPlacement,
  useSpotlight,
  useRealtimeBoard,
} from '@/hooks/useApi';
import { useAuth } from '@/lib/auth';
import { useCountdown } from '@/lib/useCountdown';
import { formatCompact, formatScore, timeAgo } from '@/lib/format';
import { ENGINE_VERSION } from '@shared/game/config';

const PIPELINE = [
  {
    title: 'You fly',
    body: 'The deterministic engine advances in fixed 60 Hz ticks. Your inputs are recorded as tick-indexed transitions, not video.',
    icon: <Radar className="h-5 w-5" />,
  },
  {
    title: 'The server re-flies it',
    body: 'A Cloudflare Worker loads the same engine module and replays your inputs against your seed. It computes the authoritative result itself.',
    icon: <Cpu className="h-5 w-5" />,
  },
  {
    title: 'The board accepts the truth',
    body: 'Only if the replayed score, wave and kill count match exactly does the run earn a leaderboard position, XP and achievements.',
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

function LiveFeed() {
  const { connected, feed } = useRealtimeBoard('campaign:all:alltime');
  const spotlight = useSpotlight();
  const items = feed.length > 0
    ? feed.map((item) => ({
        id: item.runId,
        handle: item.handle,
        displayName: item.displayName ?? item.handle,
        score: item.score,
        mode: 'campaign',
        at: new Date(item.at).toISOString(),
        avatarSeed: item.handle.length * 37,
      }))
    : (spotlight.data?.feed ?? []).map((item) => ({ ...item, at: item.created_at, avatarSeed: item.handle.length * 37 }));

  return (
    <Panel className="relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <p className="label-eyebrow">Live board feed</p>
        <span
          className={
            connected
              ? 'inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-emerald-300'
              : 'inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground'
          }
        >
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          {connected ? 'streaming' : 'polling'}
        </span>
      </div>
      <ul className="mt-4 space-y-2.5" aria-live="polite">
        {items.slice(0, 6).map((item, index) => (
          <motion.li
            key={`${item.id}-${index}`}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
            className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-2"
          >
            <PilotAvatar seed={item.avatarSeed} name={item.displayName} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{item.displayName}</span>
              <span className="block font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                {item.mode} · {timeAgo(item.at)}
              </span>
            </span>
            <span className="font-mono text-sm text-primary">{formatScore(item.score)}</span>
          </motion.li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-muted-foreground">
            The board is quiet. Fly a sortie and light it up.
          </li>
        ) : null}
      </ul>
      <Link
        to="/leaderboards"
        className="mt-4 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
      >
        Full standings <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </Panel>
  );
}

export default function Home() {
  const stats = useGlobalStats();
  const spotlight = useSpotlight();
  const config = useConfig();
  const daily = useDaily();
  const auth = useAuth();
  const placement = useMyPlacement({ mode: 'campaign' });
  const campaignBoard = useLeaderboard({ board: 'campaign:all:alltime', pageSize: 5 });
  const achievements = useAchievementCatalog();
  const reduced = useReducedMotion();

  const challenge = daily.data?.challenge ?? config.data?.daily ?? null;
  const remaining = useCountdown(challenge?.endsAt);
  const topEntries = campaignBoard.data?.entries ?? spotlight.data?.top ?? [];
  // Medal showcase: the three rarest achievements in the game, from the
  // catalogue the API serves rather than a hand-written list.
  const showcase = achievements.data ?? [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How are leaderboard scores verified?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Every ranked run is re-simulated inside a Cloudflare Worker using the same deterministic engine build the browser ran. The server computes the result itself and rejects any run whose score cannot be reproduced.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is the Daily Sortie?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'A single shared seed for every pilot in the world, refreshed at 00:00 UTC. Everyone faces the same armada, so the daily board is a direct skill comparison.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do I need an account to play?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. A guest identity is created instantly so you can play and appear on boards. Registering later keeps the same record, XP and achievements.',
        },
      },
    ],
  };

  return (
    <>
      <Seo
        title="Cosmic Invader Frontiers — Verified-Score Arcade Shooter"
        description="A deterministic arcade shooter with server-verified scores. Every ranked run is re-simulated on Cloudflare Workers, so the leaderboards are real. Play the Daily Sortie and climb."
        path="/"
        jsonLd={jsonLd}
      />

      {/* ---------------------------------- hero --------------------------------- */}
      <section className="relative overflow-hidden px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
          <div>
            <motion.div
              initial={reduced ? undefined : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex flex-wrap items-center gap-2"
            >
              <span className="rank-chip border-primary/35 bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> {config.data?.season?.name ?? 'Season 1'}
              </span>
              <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> engine v{ENGINE_VERSION}
              </span>
              <span className="rank-chip border-white/12 bg-white/[0.04] text-muted-foreground">
                {formatCompact(stats.data?.verifiedRuns ?? 0)} runs re-simulated
              </span>
            </motion.div>

            <motion.h1
              initial={reduced ? undefined : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.62, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.1rem]"
            >
              <span className="block">Every score on this</span>
              <span className="block text-gradient">leaderboard is real.</span>
            </motion.h1>

            <motion.p
              initial={reduced ? undefined : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.14 }}
              className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Cosmic Invader Frontiers runs one deterministic simulation shared by your browser and the server. Fly a sortie,
              and the same engine re-flies it in a Cloudflare Worker — the score it computes is the score that counts. No
              client claims. No rigged boards.
            </motion.p>

            <motion.div
              initial={reduced ? undefined : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-7 flex flex-wrap items-center gap-3"
            >
              <PlayNowButton />
              <Link
                to="/leaderboards"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-medium transition hover:border-primary/40 hover:bg-white/[0.07]"
              >
                <Trophy className="h-4 w-4" /> See the standings
              </Link>
              {auth.isGuest && !auth.isOffline ? (
                <span className="text-sm text-muted-foreground">
                  Playing as <strong className="text-foreground">{auth.player?.displayName}</strong> — progress saves automatically.
                </span>
              ) : null}
            </motion.div>

            <dl className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="Pilots"
                value={<CountUp value={stats.data?.players ?? 0} />}
                hint={`${stats.data?.pilotsToday ?? 0} flew today`}
                accent="cyan"
                icon={<Users className="h-4 w-4" />}
              />
              <StatTile
                label="Sorties"
                value={<CountUp value={stats.data?.runsSubmitted ?? 0} />}
                hint={`${stats.data?.runsToday ?? 0} today`}
                accent="magenta"
                icon={<Gauge className="h-4 w-4" />}
              />
              <StatTile
                label="Best score"
                value={<CountUp value={stats.data?.bestScore ?? 0} />}
                hint="all-time, verified"
                accent="amber"
                icon={<Crown className="h-4 w-4" />}
              />
              <StatTile
                label="Invaders killed"
                value={<CountUp value={stats.data?.totalKills ?? 0} format={(value) => formatCompact(value)} />}
                hint={`${stats.data?.totalBossKills ?? 0} dreadnoughts`}
                accent="emerald"
                icon={<Skull className="h-4 w-4" />}
              />
            </dl>
          </div>

          <div className="space-y-4">
            <LiveFeed />
            <Panel className="p-5">
              <p className="label-eyebrow">Your standing</p>
              {placement.data && placement.data.rank > 0 ? (
                <div className="mt-3 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 font-display text-xl font-semibold text-primary">
                    #{placement.data.rank}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      Top {(100 - placement.data.percentile * 100).toFixed(1)}% of {placement.data.total.toLocaleString()} campaign pilots
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">best {formatScore(placement.data.score)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {auth.isOffline
                    ? 'The API is unreachable right now — your runs are kept locally and submitted when it returns.'
                    : 'No verified campaign run yet. Your first sortie claims a position immediately.'}
                </p>
              )}
              <Link
                to="/profile"
                className="mt-4 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
              >
                Open my record <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Panel>
          </div>
        </div>
      </section>

      {/* -------------------------------- daily ---------------------------------- */}
      <MotionSection className="px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <Panel className="relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="label-eyebrow">Daily sortie · refreshes 00:00 UTC</p>
                <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
                  {challenge?.title ?? "Today's challenge"}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
                  One seed for every pilot on Earth. Same armada, same modifier, one board. {challenge?.modifier?.label ? `Today's modifier: ${challenge.modifier.label} — ${challenge.modifier.blurb}` : ''}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="rank-chip border-white/12 bg-white/[0.04]">{challenge?.difficultyLabel ?? 'pilot'}</span>
                  <span className="rank-chip border-white/12 bg-white/[0.04]">par {challenge ? formatScore(challenge.parScore) : '—'}</span>
                  <span className="rank-chip border-white/12 bg-white/[0.04]">
                    {daily.data?.participants ?? 0} pilots today
                  </span>
                  {daily.data?.myResult ? (
                    <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                      your run logged · {formatScore(daily.data.myResult.score)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <PlayNowButton to="/daily">Fly today's sortie</PlayNowButton>
                  <Link
                    to="/daily"
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-medium transition hover:border-primary/40"
                  >
                    Daily standings
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-3 lg:flex-col lg:items-stretch">
                {(
                  [
                    { label: 'hours', value: remaining.hours },
                    { label: 'minutes', value: remaining.minutes },
                    { label: 'seconds', value: remaining.seconds },
                  ] as const
                ).map((unit) => (
                  <div key={unit.label} className="glass-strong min-w-[5.5rem] rounded-2xl px-4 py-3 text-center lg:min-w-[7rem]">
                    <p className="font-mono text-3xl font-semibold tabular-nums">{unit.value}</p>
                    <p className="label-eyebrow">{unit.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </MotionSection>

      {/* ------------------------------- pipeline -------------------------------- */}
      <MotionSection className="px-4 py-8 sm:px-6" id="verification">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeading
            eyebrow="The verification pipeline"
            title="Three steps between your run and a real rank"
            description="The engine is a pure module — no DOM, no randomness outside its seed, no clock. That is what makes server-side verification possible at all."
          />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PIPELINE.map((step, index) => (
              <motion.article
                key={step.title}
                initial={reduced ? undefined : { opacity: 0, y: 24 }}
                whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="glass card-hover relative overflow-hidden rounded-3xl p-6"
              >
                <span className="absolute right-5 top-4 font-mono text-5xl font-bold text-white/[0.06]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                  {step.icon}
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </MotionSection>

      {/* ------------------------------ leaderboard ------------------------------ */}
      <MotionSection className="px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeading
            eyebrow="Hall of pilots"
            title="Top verified campaign scores"
            description="Updated live. Every row links to a run that anyone can re-verify."
            action={
              <Link
                to="/leaderboards"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
              >
                All boards <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <Panel className="mt-6 overflow-hidden">
            <ol className="divide-y divide-white/6">
              {topEntries.slice(0, 5).map((entry) => (
                <li key={`${entry.rank}-${entry.playerId}`} className="flex items-center gap-4 px-5 py-4">
                  <span
                    className={
                      entry.rank === 1
                        ? 'flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/15 font-mono text-sm text-amber-200'
                        : 'flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] font-mono text-sm text-muted-foreground'
                    }
                  >
                    {entry.rank}
                  </span>
                  <PilotAvatar seed={entry.avatarSeed} name={entry.displayName} size={34} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/pilots/${entry.handle}`} className="truncate text-sm hover:text-primary">
                      {entry.displayName}
                    </Link>
                    <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                      {entry.handle} · lv {entry.level} · wave {entry.wave}
                    </p>
                  </div>
                  <span className="hidden font-mono text-xs text-muted-foreground sm:block">
                    {(entry.accuracy * 100).toFixed(1)}%
                  </span>
                  <span className="font-mono text-base text-primary">{formatScore(entry.score)}</span>
                </li>
              ))}
              {topEntries.length === 0 ? (
                <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No verified runs on this board yet — the first pilot writes history.
                </li>
              ) : null}
            </ol>
          </Panel>
        </div>
      </MotionSection>

      {/* --------------------------------- modes --------------------------------- */}
      <MotionSection className="px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeading eyebrow="Three ways to fly" title="Pick your sortie" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                to: '/play',
                label: 'Campaign',
                blurb: 'Endless waves, escalating formations, a Dreadnought every fifth wave. The board that matters.',
                badge: 'ranked',
                accent: 'from-cyan-400/25',
              },
              {
                to: '/play/gauntlet',
                label: 'Overdrive Gauntlet',
                blurb: 'Boss after boss, no filler waves. Locked to Ace difficulty and built for score hunters.',
                badge: 'Ace only',
                accent: 'from-amber-400/25',
              },
              {
                to: '/daily',
                label: 'Daily Sortie',
                blurb: 'One shared seed per UTC day with a rotating difficulty and wave modifier. Par bonus XP available.',
                badge: '24h board',
                accent: 'from-fuchsia-500/25',
              },
            ].map((mode, index) => (
              <motion.div
                key={mode.label}
                initial={reduced ? undefined : { opacity: 0, y: 22 }}
                whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: index * 0.07 }}
              >
                <Link
                  to={mode.to}
                  className="glass card-hover group relative flex h-full flex-col overflow-hidden rounded-3xl p-6"
                >
                  <div className={`pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${mode.accent} to-transparent blur-2xl`} />
                  <span className="rank-chip relative border-white/12 bg-white/[0.04] text-muted-foreground">{mode.badge}</span>
                  <h3 className="relative mt-4 font-display text-xl font-semibold">{mode.label}</h3>
                  <p className="relative mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{mode.blurb}</p>
                  <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm text-primary">
                    Launch <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </MotionSection>

      {/* ------------------------------ achievements ----------------------------- */}
      <MotionSection className="px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeading
            eyebrow="Pilot record"
            title="Achievements that follow the same rules"
            description={`${config.data?.achievements.total ?? 30} medals across combat, survival, skill, collection and dedication. Unlocked server-side from verified results only.`}
            action={
              <Link
                to="/achievements"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
              >
                All medals <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(showcase.length > 0
              ? showcase
                  .slice()
                  .sort((a, b) => b.points - a.points)
                  .slice(0, 6)
              : []
            ).map((achievement) => (
              <div key={achievement.id} className="glass flex items-start gap-3 rounded-2xl p-4">
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-200">
                  <Award className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{achievement.name}</p>
                    <TierChip tier={achievement.tier} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{achievement.description}</p>
                  <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-amber-200/80">
                    {achievement.points} pts · {achievement.category}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MotionSection>

      {/* ---------------------------------- close -------------------------------- */}
      <MotionSection className="px-4 pb-4 pt-10 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <Panel className="relative overflow-hidden px-6 py-10 text-center sm:px-12 sm:py-14">
            <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-56 w-[70%] rounded-full bg-primary/20 blur-3xl" />
            <p className="label-eyebrow relative">Ready when you are</p>
            <h2 className="relative mx-auto mt-3 max-w-2xl font-display text-3xl font-semibold sm:text-4xl">
              The armada does not care whether you are ready.
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Guests get a full record instantly — boards, XP, achievements and the Daily Sortie. Secure it to an email later
              without losing a single point.
            </p>
            <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
              <PlayNowButton size="sm" className="px-7 py-3" />
              <Link
                to="/about"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-medium transition hover:border-primary/40"
              >
                <Zap className="h-4 w-4" /> How it works
              </Link>
            </div>
          </Panel>
        </div>
      </MotionSection>
    </>
  );
}
