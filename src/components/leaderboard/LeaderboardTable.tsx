import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Crown, Medal, ShieldCheck } from 'lucide-react';
import { PilotAvatar } from '@/components/common/atoms';
import type { LeaderboardEntry } from '@/lib/types';
import { formatDuration, formatPercent, formatScore, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/15 text-amber-200">
        <Crown className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (rank <= 3) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/30 bg-slate-300/10 text-slate-200">
        <Medal className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] font-mono text-sm text-muted-foreground">
      {rank}
    </span>
  );
}

export function LeaderboardTable({
  entries,
  highlightPlayerId,
  loading,
  emptyMessage = 'No verified runs on this board yet.',
}: {
  entries: LeaderboardEntry[];
  highlightPlayerId?: string | null;
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading && entries.length === 0) {
    return (
      <div className="space-y-2 p-4" role="status" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
        ))}
        <span className="sr-only">Loading leaderboard</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <ol className="divide-y divide-white/6">
      {entries.map((entry, index) => {
        const isMe = highlightPlayerId ? entry.playerId === highlightPlayerId : false;
        return (
          <motion.li
            key={entry.runId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: Math.min(index * 0.015, 0.2) }}
            className={cn(
              'flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5',
              isMe && 'bg-primary/[0.07] ring-1 ring-inset ring-primary/25',
            )}
          >
            <RankBadge rank={entry.rank} />
            <PilotAvatar seed={entry.avatarSeed} name={entry.displayName} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link to={`/pilots/${entry.handle}`} className="truncate text-sm hover:text-primary">
                  {entry.displayName}
                </Link>
                {entry.isGuest ? (
                  <span className="hidden rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-widest text-muted-foreground sm:inline">
                    guest
                  </span>
                ) : null}
                {isMe ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-widest text-primary">
                    you
                  </span>
                ) : null}
              </div>
              <p className="truncate font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                {entry.handle} · lv {entry.level} · wave {entry.wave} · {formatDuration(entry.durationMs)}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="font-mono text-xs text-muted-foreground">{formatPercent(entry.accuracy, 1)}</p>
              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">{timeAgo(entry.achievedAt)}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-base text-primary">{formatScore(entry.score)}</p>
              <Link
                to={`/runs/${entry.runId}`}
                className="inline-flex items-center gap-1 font-mono text-[0.58rem] uppercase tracking-widest text-muted-foreground transition hover:text-primary"
              >
                <ShieldCheck className="h-3 w-3" aria-hidden="true" /> verify
              </Link>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
