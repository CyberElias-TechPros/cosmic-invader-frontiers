import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Award, CloudUpload, Download, Gamepad2, LogOut, ShieldCheck, Target, Trash2, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { CountUp, EmptyPanel, LoadingBlock, Panel, PilotAvatar, PlayNowButton, Seo, StatTile } from '@/components/common/atoms';
import { useAuthDialog } from '@/components/auth/AuthDialog';
import { useAuth } from '@/lib/auth';
import { useAchievementCatalog, useCloudSave, useMyAchievements, useMyPlacement, useMyRuns } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { settingsSnapshot, updateSettings } from '@/lib/settings';
import { formatDateTime, formatDuration, formatPercent, formatScore, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

const MODE_FILTERS = [
  { id: 'all', label: 'All modes' },
  { id: 'campaign', label: 'Campaign' },
  { id: 'gauntlet', label: 'Gauntlet' },
  { id: 'daily', label: 'Daily' },
] as const;

export default function Profile() {
  const auth = useAuth();
  const dialog = useAuthDialog();
  const [mode, setMode] = useState<(typeof MODE_FILTERS)[number]['id']>('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const runs = useMyRuns(page, mode === 'all' ? undefined : mode);
  const achievements = useMyAchievements();
  const catalog = useAchievementCatalog();
  const placement = useMyPlacement({ mode: 'campaign' });
  const save = useCloudSave();

  const player = auth.player;
  const totals = player?.stats ?? player?.totals;
  const unlocked = achievements.data?.unlocked ?? player?.achievementsUnlocked ?? 0;
  const totalAchievements = catalog.data?.length ?? 30;
  const levelProgress = player?.progression;

  const syncSave = async () => {
    setBusy('save');
    try {
      const current = save.data;
      const payload = JSON.stringify({ settings: settingsSnapshot(), savedAt: new Date().toISOString(), level: player?.level ?? 1 });
      const response = await api.putSave({ payload, version: current?.version, device: navigator.userAgent.slice(0, 60) });
      if (response.status === 'conflict') {
        toast.warning('A newer cloud save exists on another device. Reload it below to avoid overwriting.');
      } else {
        toast.success(response.status === 'identical' ? 'Cloud save already up to date.' : 'Progress uploaded to the cloud.');
      }
      void save.refetch();
    } catch {
      toast.error('Could not reach the cloud save service.');
    } finally {
      setBusy(null);
    }
  };

  const loadSave = async () => {
    setBusy('load');
    try {
      const current = await api.getSave();
      const payload = typeof current.payload === 'string' ? JSON.parse(current.payload) : current.payload;
      const settings = (payload as { settings?: Record<string, unknown> } | null)?.settings;
      if (settings) {
        updateSettings(settings as never);
        toast.success('Cockpit settings restored from the cloud.');
      } else {
        toast.info('No cloud payload stored yet.');
      }
    } catch {
      toast.error('Could not read the cloud save.');
    } finally {
      setBusy(null);
    }
  };

  const exportData = async () => {
    setBusy('export');
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cosmic-invader-frontiers-${player?.handle ?? 'record'}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Your data export has been downloaded.');
    } catch {
      toast.error('Export failed — try again shortly.');
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Delete this account and every run, achievement and replay attached to it? This cannot be undone.')) return;
    setBusy('delete');
    try {
      await auth.deleteAccount();
      toast.success('Account deleted. A fresh guest session has been created.');
    } catch {
      toast.error('Deletion failed — nothing was removed.');
    } finally {
      setBusy(null);
    }
  };

  if (auth.status === 'loading' && !player) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <LoadingBlock rows={5} label="Loading your record" />
      </div>
    );
  }

  if (auth.isOffline) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyPanel
          title="The record service is unreachable"
          message="Your local progress is intact and will sync as soon as the API answers again."
          action={<PlayNowButton size="sm">Play offline-friendly modes</PlayNowButton>}
        />
      </div>
    );
  }

  return (
    <>
      <Seo
        title={`${player?.displayName ?? 'Pilot record'} — profile | Cosmic Invader Frontiers`}
        description="Your verified runs, XP, rank and achievements. Every number on this page came from a run the server re-simulated."
        path="/profile"
        noIndex
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass relative overflow-hidden rounded-3xl p-6 sm:p-7"
        >
          <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-5">
            <PilotAvatar seed={player?.avatarSeed ?? 1} name={player?.displayName ?? 'Pilot'} size={72} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight">{player?.displayName ?? 'Pilot'}</h1>
                <span className="rank-chip border-primary/30 bg-primary/10 text-primary">
                  {player?.insignia} {player?.rank ?? 'Cadet'}
                </span>
                {player?.isGuest ? (
                  <span className="rank-chip border-amber-400/35 bg-amber-500/10 text-amber-200">guest</span>
                ) : (
                  <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> registered
                  </span>
                )}
                {auth.isAdmin ? <span className="rank-chip border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-200">{player?.role}</span> : null}
              </div>
              <p className="mt-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                @{player?.handle} · level {player?.level ?? 1} · joined {player?.createdAt ? formatDateTime(player.createdAt) : '—'}
              </p>

              {levelProgress ? (
                <div className="mt-4 max-w-md">
                  <div className="flex items-center justify-between font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                    <span>{(player?.xp ?? 0).toLocaleString()} XP</span>
                    <span>
                      {levelProgress.xpToNextLevel.toLocaleString()} XP to level {levelProgress.level + 1}
                      {levelProgress.nextRank ? ` · next rank ${levelProgress.nextRank}` : ''}
                    </span>
                  </div>
                  <div className="hud-bar mt-1.5 h-2">
                    <span
                      className="h-full bg-gradient-to-r from-cyan-300 to-fuchsia-300"
                      style={{ width: `${Math.max(2, Math.min(100, levelProgress.levelProgress * 100))}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <PlayNowButton size="sm">Fly a sortie</PlayNowButton>
              {player?.isGuest ? (
                <button
                  type="button"
                  onClick={() => dialog.open('upgrade')}
                  className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
                >
                  Secure this record
                </button>
              ) : null}
            </div>
          </div>
        </motion.header>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Best score" value={formatScore(totals?.bestScore ?? 0)} hint={placement.data?.rank ? `global #${placement.data.rank}` : undefined} accent="cyan" icon={<Target className="h-4 w-4" />} />
          <StatTile label="Sorties" value={<CountUp value={totals?.runsSubmitted ?? 0} />} hint={`${totals?.gamesPlayed ?? 0} started`} accent="magenta" icon={<Gamepad2 className="h-4 w-4" />} />
          <StatTile label="Kills" value={<CountUp value={totals?.totalKills ?? 0} format={(value) => Math.round(value).toLocaleString('en-US')} />} hint={`${totals?.totalBossKills ?? 0} dreadnoughts`} accent="amber" icon={<Zap className="h-4 w-4" />} />
          <StatTile label="Medals" value={`${unlocked} / ${totalAchievements}`} hint={`${totals?.dailiesCompleted ?? 0} dailies · ${totals?.dailyStreak ?? 0}-day streak`} accent="emerald" icon={<Award className="h-4 w-4" />} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
              <p className="label-eyebrow">Recent sorties</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {MODE_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { setMode(option.id); setPage(1); }}
                    aria-pressed={mode === option.id}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs transition',
                      mode === option.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {runs.isLoading ? (
              <div className="p-5">
                <LoadingBlock rows={4} label="Loading runs" />
              </div>
            ) : (runs.data?.runs.length ?? 0) === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                No runs recorded yet — your first sortie appears here instantly.
              </p>
            ) : (
              <ul className="divide-y divide-white/6">
                {runs.data?.runs.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/runs/${run.id}`} className="font-mono text-sm text-primary hover:underline">
                          {formatScore(run.score)}
                        </Link>
                        <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                          {run.mode} · {run.difficulty} · wave {run.wave}
                        </span>
                        {run.ranked ? (
                          <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">ranked</span>
                        ) : (
                          <span className="rank-chip border-amber-400/30 bg-amber-500/10 text-amber-200">unranked</span>
                        )}
                        {run.dailyKey ? <span className="rank-chip border-white/12 bg-white/[0.04]">{run.dailyKey}</span> : null}
                      </div>
                      <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                        {formatPercent(run.accuracy, 1)} accuracy · {formatDuration(run.durationMs)} · +{run.xpAwarded} XP ·{' '}
                        {timeAgo(run.createdAt)}
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

            <div className="flex items-center justify-between border-t border-white/8 px-5 py-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-primary/40 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                {runs.data ? `${runs.data.runs.length} runs shown · page ${runs.data.page}` : '—'}
              </span>
              <button
                type="button"
                disabled={!runs.data?.hasMore}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-primary/40 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel className="p-5">
              <p className="label-eyebrow">Career stats</p>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Total score', formatScore(totals?.totalScore ?? 0)],
                  ['Best wave', String(totals?.bestWave ?? 0)],
                  ['Best combo', `${totals?.bestCombo ?? 0}×`],
                  ['Best accuracy', formatPercent(totals?.bestAccuracy ?? 0, 1)],
                  ['Time in cockpit', formatDuration(totals?.totalPlayMs ?? 0)],
                  ['Power-ups', String(totals?.powerupsCollected ?? 0)],
                  ['Saucers destroyed', String(totals?.totalUfosDestroyed ?? 0)],
                  ['Ace / Legend runs', `${totals?.aceRuns ?? 0} / ${totals?.legendRuns ?? 0}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-1.5 last:border-0">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-mono">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel className="p-5">
              <p className="label-eyebrow">Cloud save</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {save.data?.version
                  ? `Version ${save.data.version} · updated ${save.data.updatedAt ? timeAgo(save.data.updatedAt) : '—'}`
                  : 'No cloud payload yet. Upload your cockpit setup to carry it across devices.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void syncSave()}
                  disabled={busy === 'save'}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary transition hover:bg-primary/20 disabled:opacity-50"
                >
                  <CloudUpload className="h-4 w-4" /> Upload settings
                </button>
                <button
                  type="button"
                  onClick={() => void loadSave()}
                  disabled={busy === 'load'}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" /> Restore
                </button>
              </div>
            </Panel>

            <Panel className="p-5">
              <p className="label-eyebrow">Account & data</p>
              <div className="mt-3 space-y-2 text-sm">
                <Link to="/settings" className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-primary/40">
                  <span>Sessions & devices</span>
                  <span className="font-mono text-xs text-muted-foreground">manage</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void exportData()}
                  disabled={busy === 'export'}
                  className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-primary/40 disabled:opacity-50"
                >
                  <span>Export my data (JSON)</span>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => void auth.signOut()}
                  className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-primary/40"
                >
                  <span>Sign out</span>
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAccount()}
                  disabled={busy === 'delete'}
                  className="flex w-full items-center justify-between rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-destructive-foreground transition hover:border-destructive/60 disabled:opacity-50"
                >
                  <span>Delete account and all runs</span>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
