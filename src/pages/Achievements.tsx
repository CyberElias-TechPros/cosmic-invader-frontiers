import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Award, Filter, Lock, Sparkles } from 'lucide-react';
import { EmptyPanel, LoadingBlock, Panel, Seo, StatTile, TierChip } from '@/components/common/atoms';
import { useAchievementCatalog, useMyAchievements } from '@/hooks/useApi';
import { useAuth } from '@/lib/auth';
import { useAuthDialog } from '@/components/auth/AuthDialog';
import type { AchievementView } from '@/lib/types';
import { cn } from '@/lib/utils';

const CATEGORIES = ['all', 'combat', 'survival', 'skill', 'collection', 'dedication'] as const;
const TIERS = ['all', 'bronze', 'silver', 'gold', 'platinum'] as const;

function AchievementCard({ achievement, delay }: { achievement: AchievementView; delay: number }) {
  const reduced = useReducedMotion();
  const unlocked = Boolean(achievement.unlocked);
  const progress = achievement.progress ?? null;
  const ratio = progress ? Math.min(1, progress.value / progress.target) : 0;

  return (
    <motion.article
      initial={reduced ? undefined : { opacity: 0, y: 16 }}
      animate={reduced ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(delay, 0.3) }}
      className={cn(
        'glass relative overflow-hidden rounded-2xl p-4 transition',
        unlocked ? 'border-amber-400/25' : 'opacity-90',
      )}
    >
      {unlocked ? (
        <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-amber-400/20 blur-2xl" />
      ) : null}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-sm font-semibold">{achievement.hidden && !unlocked ? 'Classified' : achievement.name}</h3>
            <TierChip tier={achievement.tier} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {achievement.hidden && !unlocked ? 'Keep flying — this medal reveals itself when earned.' : achievement.description}
          </p>
        </div>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            unlocked ? 'border-amber-400/40 bg-amber-400/15 text-amber-200' : 'border-white/10 bg-white/[0.03] text-muted-foreground',
          )}
        >
          {unlocked ? <Award className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </span>
      </div>

      {progress ? (
        <div className="relative mt-3">
          <div className="hud-bar h-1.5">
            <span
              className={unlocked ? 'h-full bg-gradient-to-r from-amber-300 to-yellow-200' : 'h-full bg-gradient-to-r from-cyan-500/70 to-fuchsia-500/70'}
              style={{ width: `${Math.max(2, ratio * 100)}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
            {progress.value.toLocaleString()} / {progress.target.toLocaleString()}
          </p>
        </div>
      ) : null}

      <div className="relative mt-3 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
        <span>{achievement.category}</span>
        <span className={unlocked ? 'text-amber-200' : ''}>{achievement.points} pts</span>
      </div>
    </motion.article>
  );
}

export default function Achievements() {
  const auth = useAuth();
  const dialog = useAuthDialog();
  const catalog = useAchievementCatalog();
  const mine = useMyAchievements();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [tier, setTier] = useState<(typeof TIERS)[number]>('all');

  const merged: AchievementView[] = useMemo(() => {
    const byId = new Map((mine.data?.achievements ?? []).map((achievement) => [achievement.id, achievement]));
    return (catalog.data ?? []).map((achievement) => ({ ...achievement, ...(byId.get(achievement.id) ?? {}) }));
  }, [catalog.data, mine.data]);

  const filtered = merged.filter(
    (achievement) => (category === 'all' || achievement.category === category) && (tier === 'all' || achievement.tier === tier),
  );

  const unlockedCount = merged.filter((achievement) => achievement.unlocked).length;
  const points = merged.filter((achievement) => achievement.unlocked).reduce((total, achievement) => total + achievement.points, 0);
  const pointsMax = merged.reduce((total, achievement) => total + achievement.points, 0);

  return (
    <>
      <Seo
        title="Achievements — medals from verified runs | Cosmic Invader Frontiers"
        description={`${merged.length || 30} medals across combat, survival, skill, collection and dedication. Every achievement is evaluated server-side from a verified run.`}
        path="/achievements"
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <header>
          <p className="label-eyebrow">Medals</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Achievements</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Evaluated inside the API from the replay it just verified — the client never awards itself anything.
          </p>
        </header>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <StatTile label="Unlocked" value={`${unlockedCount} / ${merged.length || 30}`} accent="amber" icon={<Award className="h-4 w-4" />} />
          <StatTile label="Medal points" value={`${points} / ${pointsMax}`} accent="cyan" />
          <StatTile
            label="Completion"
            value={merged.length ? `${Math.round((unlockedCount / merged.length) * 100)}%` : '—'}
            accent="magenta"
            icon={<Sparkles className="h-4 w-4" />}
          />
        </div>

        {auth.isGuest ? (
          <Panel className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-display text-base font-semibold">You are flying as a guest</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Achievements already unlock on this record. Secure it to an email and nothing is lost — same handle, same medals.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialog.open('upgrade')}
              className="btn-cosmic rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-2.5 font-semibold text-slate-950"
            >
              Secure my record
            </button>
          </Panel>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          {CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              aria-pressed={category === option}
              className={cn(
                'rounded-full border px-3 py-1.5 font-mono text-[0.64rem] uppercase tracking-widest transition',
                category === option
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
              )}
            >
              {option}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          {TIERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTier(option)}
              aria-pressed={tier === option}
              className={cn(
                'rounded-full border px-3 py-1.5 font-mono text-[0.64rem] uppercase tracking-widest transition',
                tier === option
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                  : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
              )}
            >
              {option}
            </button>
          ))}
        </div>

        {catalog.isLoading ? (
          <div className="mt-6">
            <LoadingBlock rows={6} label="Loading achievements" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyPanel
              title="No medals match those filters"
              message="Try a different category or tier — every medal is earnable."
              action={
                <button
                  type="button"
                  onClick={() => { setCategory('all'); setTier('all'); }}
                  className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary"
                >
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((achievement, index) => (
              <AchievementCard key={achievement.id} achievement={achievement} delay={index * 0.02} />
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Locked medals show live progress against the counters the server keeps for your record.{' '}
          <Link to="/play" className="text-primary underline-offset-4 hover:underline">
            Fly a sortie to advance them →
          </Link>
        </p>
      </div>
    </>
  );
}
