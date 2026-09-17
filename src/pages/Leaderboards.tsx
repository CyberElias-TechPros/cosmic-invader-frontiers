import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Filter, RefreshCw, Trophy } from 'lucide-react';
import { Panel, Seo, StatTile } from '@/components/common/atoms';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { useAuth } from '@/lib/auth';
import { useBoards, useLeaderboard, useMyPlacement, useRealtimeBoard } from '@/hooks/useApi';
import { DIFFICULTIES } from '@shared/game/config';
import { formatScore } from '@/lib/format';
import { cn } from '@/lib/utils';

const PERIODS = [
  { id: 'alltime', label: 'All-time' },
  { id: 'weekly', label: 'This week' },
  { id: 'monthly', label: 'This month' },
] as const;

export default function Leaderboards() {
  const auth = useAuth();
  const boards = useBoards();
  const [mode, setMode] = useState<'campaign' | 'gauntlet'>('campaign');
  const [difficulty, setDifficulty] = useState<'all' | 'cadet' | 'pilot' | 'ace' | 'legend'>('all');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('alltime');
  const [page, setPage] = useState(1);

  const realtime = useRealtimeBoard(`${mode}:${difficulty}:${period}`);

  const query = useMemo(
    () => ({
      mode,
      difficulty: difficulty === 'all' ? undefined : difficulty,
      period,
      page,
      pageSize: 25,
    }),
    [mode, difficulty, period, page],
  );

  const leaderboard = useLeaderboard(query);
  const placement = useMyPlacement(mode === 'campaign' && difficulty !== 'all' ? { mode, difficulty } : { mode });

  useEffect(() => {
    setPage(1);
  }, [mode, difficulty, period]);

  const totalPages = leaderboard.data ? Math.max(1, Math.ceil((leaderboard.data.entries.length >= 25 ? page * 25 + 25 : page * 25) / 25)) : 1;
  const myEntry = leaderboard.data?.me ?? null;

  return (
    <>
      <Seo
        title="Leaderboards — verified arcade scores | Cosmic Invader Frontiers"
        description="Global, weekly and monthly boards for Campaign and Overdrive Gauntlet. Every entry links to a run that was re-simulated and verified by the game engine."
        path="/leaderboards"
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <header>
          <p className="label-eyebrow">Standings</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Verified leaderboards</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Every row below belongs to a run the server replayed and reproduced. Click any score to inspect the evidence.
          </p>
        </header>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Your rank" value={myEntry?.rank ? `#${myEntry.rank}` : placement.data?.rank ? `#${placement.data.rank}` : '—'} accent="cyan" hint={myEntry ? `of ${myEntry.total.toLocaleString()}` : placement.data ? `of ${placement.data.total.toLocaleString()}` : 'fly a ranked run'} icon={<Trophy className="h-4 w-4" />} />
          <StatTile label="Your best" value={myEntry?.score ? formatScore(myEntry.score) : placement.data?.score ? formatScore(placement.data.score) : '—'} accent="magenta" />
          <StatTile label="Percentile" value={myEntry?.percentile !== undefined && myEntry !== null ? `Top ${(100 - myEntry.percentile * 100).toFixed(1)}%` : placement.data ? `Top ${(100 - placement.data.percentile * 100).toFixed(1)}%` : '—'} accent="amber" />
          <StatTile
            label="Live feed"
            value={realtime.connected ? 'streaming' : 'polling'}
            hint={realtime.lastEventAt ? 'receiving board updates' : 'waiting for the next run'}
            accent="emerald"
            icon={<Activity className="h-4 w-4" />}
          />
        </div>

        <Panel className="mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              {(['campaign', 'gauntlet'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm transition',
                    mode === option ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={mode === option}
                >
                  {option === 'campaign' ? 'Campaign' : 'Gauntlet'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', ...Object.keys(DIFFICULTIES)] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDifficulty(option as typeof difficulty)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 font-mono text-[0.66rem] uppercase tracking-widest transition',
                    difficulty === option
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
                  )}
                  aria-pressed={difficulty === option}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {PERIODS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPeriod(option.id)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs transition',
                    period === option.id ? 'bg-white/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={period === option.id}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void leaderboard.refetch()}
                className="ml-1 rounded-full border border-white/10 p-2 text-muted-foreground transition hover:text-foreground"
                aria-label="Refresh leaderboard"
              >
                <RefreshCw className={cn('h-4 w-4', leaderboard.isFetching && 'animate-spin')} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5 sm:px-5">
            <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
              {leaderboard.data?.label ?? `${mode} · ${difficulty} · ${period}`}
            </p>
            {boards.data ? (
              <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                {boards.data.find((board) => board.board === leaderboard.data?.board)?.entrants ?? '—'} entrants
              </p>
            ) : null}
          </div>

          <LeaderboardTable
            entries={leaderboard.data?.entries ?? []}
            highlightPlayerId={auth.player?.id ?? null}
            loading={leaderboard.isLoading}
          />
        </Panel>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono text-xs text-muted-foreground">page {page}</span>
            <button
              type="button"
              disabled={(leaderboard.data?.entries.length ?? 0) < 25}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40 disabled:opacity-40"
            >
              Next
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Looking for the daily board? <Link to="/daily" className="text-primary underline-offset-4 hover:underline">Daily Sortie →</Link>
          </p>
        </div>

        {placement.data && placement.data.neighbours.length > 0 ? (
          <Panel className="mt-8 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <p className="label-eyebrow">Around you</p>
              <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                #{placement.data.rank} of {placement.data.total.toLocaleString()}
              </p>
            </div>
            <LeaderboardTable entries={placement.data.neighbours} highlightPlayerId={auth.player?.id ?? null} />
          </Panel>
        ) : null}
      </div>
    </>
  );
}
