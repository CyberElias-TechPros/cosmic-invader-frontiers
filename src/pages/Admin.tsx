import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CheckCircle2, Database, Flag, Play, RefreshCw, ShieldAlert, ShieldCheck, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyPanel, LoadingBlock, Panel, PilotAvatar, Seo, StatTile } from '@/components/common/atoms';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatDateTime, formatScore, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  AdminOverview,
  AdminPlayerRow,
  AdminRejectionRow,
  AdminReportRow,
  AdminRunRow,
  AuditEntry,
} from '@/lib/types';

const MAINTENANCE_TASKS = [
  { id: 'ensure-daily', label: 'Ensure daily challenge', hint: 'Materialise today’s shared-seed sortie row.' },
  { id: 'warm-boards', label: 'Warm board caches', hint: 'Pre-compute the top pages of every tracked board.' },
  { id: 'snapshot-boards', label: 'Snapshot boards', hint: 'Archive today’s standings for history and rollover.' },
  { id: 'purge-orphans', label: 'Purge orphan entries', hint: 'Delete leaderboard rows whose run no longer exists.' },
  { id: 'prune-telemetry', label: 'Prune telemetry', hint: 'Drop product events past the retention window.' },
  { id: 'integrity-audit', label: 'Integrity audit', hint: 'Re-check board rows against the runs they claim.' },
  { id: 'season-rollover', label: 'Season rollover', hint: 'Close the current season and open the next one.' },
] as const;

type Tab = 'overview' | 'reports' | 'rejections' | 'runs' | 'players' | 'audit';

export default function Admin() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const enabled = auth.isAdmin;

  const overview = useQuery<AdminOverview>({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.adminOverview(),
    enabled,
  });

  const reports = useQuery<AdminReportRow[]>({
    queryKey: ['admin', 'reports'],
    queryFn: () => api.adminReports(),
    enabled: enabled && (tab === 'reports' || tab === 'overview'),
  });

  const rejections = useQuery<AdminRejectionRow[]>({
    queryKey: ['admin', 'rejections'],
    queryFn: async () => (await api.adminRuns('rejected')) as AdminRejectionRow[],
    enabled: enabled && tab === 'rejections',
  });

  const runs = useQuery<AdminRunRow[]>({
    queryKey: ['admin', 'runs'],
    queryFn: async () => (await api.adminRuns('recent')) as AdminRunRow[],
    enabled: enabled && tab === 'runs',
  });

  const players = useQuery<AdminPlayerRow[]>({
    queryKey: ['admin', 'players'],
    queryFn: () => api.adminPlayers(),
    enabled: enabled && tab === 'players',
  });

  const audit = useQuery<AuditEntry[]>({
    queryKey: ['admin', 'audit'],
    queryFn: () => api.adminAudit(),
    enabled: enabled && tab === 'audit',
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin'] });

  const moderate = async (body: Record<string, unknown>, successMessage: string, key: string) => {
    setBusy(key);
    try {
      const response = await api.adminAction(body);
      toast.success(successMessage, {
        description: response.deleted ? 'The run was deleted with its board entries.' : undefined,
      });
      await invalidate();
    } catch {
      toast.error('Action failed — nothing was changed.');
    } finally {
      setBusy(null);
    }
  };

  const runMaintenance = async (task: string) => {
    setBusy(task);
    try {
      const result = await api.adminMaintenance(task);
      toast.success(`${task} complete`, { description: JSON.stringify(result.result).slice(0, 160) });
      await invalidate();
    } catch {
      toast.error(`${task} failed.`);
    } finally {
      setBusy(null);
    }
  };

  if (!auth.isAdmin) {
    return (
      <>
        <Seo title="Moderation console — restricted | Cosmic Invader Frontiers" description="Restricted area." path="/admin" noIndex />
        <div className="mx-auto max-w-2xl px-4 py-20">
          <EmptyPanel
            icon={<ShieldAlert className="h-6 w-6 text-amber-300" />}
            title="Moderator access required"
            message="This console shows rejected submissions, player reports and integrity audits. It is only available to accounts with the moderator or admin role."
            action={
              <Link to="/" className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
                Back to the bridge
              </Link>
            }
          />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Operators: the first administrator is promoted with{' '}
            <span className="font-mono">POST /api/v1/admin/bootstrap</span> and the{' '}
            <span className="font-mono">ADMIN_BOOTSTRAP_TOKEN</span> secret. When that secret is unset the endpoint does not exist.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Seo title="Moderation console | Cosmic Invader Frontiers" description="Administrative console." path="/admin" noIndex />

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-eyebrow">Restricted</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Moderation console</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {auth.player?.displayName} · role {auth.player?.role}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void invalidate()}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
          >
            <RefreshCw className={cn('h-4 w-4', overview.isFetching && 'animate-spin')} /> Refresh
          </button>
        </header>

        {overview.isLoading ? (
          <div className="mt-7">
            <LoadingBlock rows={4} label="Loading console" />
          </div>
        ) : overview.data ? (
          <>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Players"
                value={overview.data.counts.players.toLocaleString()}
                hint={`${overview.data.counts.registered} registered · ${overview.data.counts.guests} guests`}
                accent="cyan"
              />
              <StatTile
                label="Runs"
                value={overview.data.counts.runs.toLocaleString()}
                hint={`${overview.data.counts.rejected} rejected · ${overview.data.counts.unrankedRuns} unranked`}
                accent="magenta"
              />
              <StatTile
                label="Open reports"
                value={overview.data.counts.openReports.toLocaleString()}
                accent="amber"
                icon={<Flag className="h-4 w-4" />}
              />
              <StatTile
                label="Environment"
                value={overview.data.config.environment}
                hint={`ingest ${overview.data.config.ingestEnabled ? 'live' : 'paused'} · secret ${overview.data.config.sessionSecretSource}`}
                accent="emerald"
                icon={<ShieldCheck className="h-4 w-4" />}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-1.5">
              {(['overview', 'reports', 'rejections', 'runs', 'players', 'audit'] as Tab[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTab(option)}
                  aria-pressed={tab === option}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm capitalize transition',
                    tab === option
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <Panel className="overflow-hidden">
                  <div className="border-b border-white/8 px-5 py-4">
                    <p className="label-eyebrow">Recent rejections</p>
                  </div>
                  <ul className="divide-y divide-white/6">
                    {overview.data.recentRejections.map((rejection, index) => (
                      <li key={`${rejection.created_at}-${index}`} className="flex items-start gap-3 px-5 py-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-amber-200">{rejection.reason}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            claimed {rejection.claimed_score?.toLocaleString() ?? '—'} · {rejection.detail ?? 'no detail'} ·{' '}
                            {timeAgo(rejection.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                    {overview.data.recentRejections.length === 0 ? (
                      <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                        No rejected submissions. The board is clean.
                      </li>
                    ) : null}
                  </ul>
                </Panel>

                <div className="space-y-5">
                  <Panel className="overflow-hidden">
                    <div className="border-b border-white/8 px-5 py-4">
                      <p className="label-eyebrow">Latest reports</p>
                    </div>
                    <ul className="divide-y divide-white/6">
                      {overview.data.reports.map((report) => (
                        <li key={report.id} className="flex items-center gap-3 px-5 py-3">
                          <span className="font-mono text-xs text-amber-200">{report.reason}</span>
                          <Link to={`/runs/${report.run_id}`} className="font-mono text-xs text-primary hover:underline">
                            {report.run_id.slice(0, 8)}
                          </Link>
                          <span className="ml-auto font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                            {timeAgo(report.created_at)}
                          </span>
                        </li>
                      ))}
                      {overview.data.reports.length === 0 ? (
                        <li className="px-5 py-8 text-center text-sm text-muted-foreground">No reports filed.</li>
                      ) : null}
                    </ul>
                  </Panel>

                  <Panel className="p-5">
                    <p className="label-eyebrow flex items-center gap-2">
                      <Wrench className="h-3.5 w-3.5" /> Maintenance
                    </p>
                    <div className="mt-3 space-y-2">
                      {MAINTENANCE_TASKS.map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                          <div>
                            <p className="text-sm">{task.label}</p>
                            <p className="text-xs text-muted-foreground">{task.hint}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void runMaintenance(task.id)}
                            disabled={busy === task.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-primary/40 disabled:opacity-50"
                          >
                            <Play className="h-3 w-3" /> Run
                          </button>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>
            ) : null}

            {tab === 'reports' ? (
              <Panel className="mt-5 overflow-hidden">
                <div className="border-b border-white/8 px-5 py-4">
                  <p className="label-eyebrow">Player reports</p>
                </div>
                {reports.isLoading ? (
                  <div className="p-5">
                    <LoadingBlock rows={3} />
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {(reports.data ?? []).map((report) => (
                      <li key={report.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-mono text-xs text-amber-200">{report.reason}</span>
                            <Link to={`/runs/${report.run_id}`} className="font-mono text-xs text-primary hover:underline">
                              {report.run_id.slice(0, 8)}
                            </Link>
                            <span
                              className={cn(
                                'rank-chip',
                                report.status === 'open'
                                  ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                                  : 'border-white/12 bg-white/[0.04] text-muted-foreground',
                              )}
                            >
                              {report.status}
                            </span>
                            {report.score !== null ? (
                              <span className="font-mono text-xs text-primary">{formatScore(report.score)}</span>
                            ) : null}
                          </p>
                          {report.detail ? <p className="mt-1 text-xs text-muted-foreground">{report.detail}</p> : null}
                          <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                            {report.handle ? `@${report.handle}` : 'unknown pilot'} · {formatDateTime(report.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void moderate({ action: 'flag-run', reportId: report.id, runId: report.run_id }, 'Report marked as actioned — run kept.', `flag-${report.id}`)}
                            disabled={busy === `flag-${report.id}`}
                            className="rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-primary/40 disabled:opacity-50"
                          >
                            Keep run
                          </button>
                          <button
                            type="button"
                            onClick={() => void moderate({ action: 'dismiss', reportId: report.id }, 'Report dismissed.', `dismiss-${report.id}`)}
                            disabled={busy === `dismiss-${report.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-primary/40 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Dismiss
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm('Delete this run and every leaderboard entry it created?')) return;
                              void moderate({ action: 'delete-run', runId: report.run_id, reason: report.reason }, 'Run deleted from every board.', `delete-${report.id}`);
                            }}
                            disabled={busy === `delete-${report.id}`}
                            className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive-foreground transition hover:border-destructive/70 disabled:opacity-50"
                          >
                            Delete run
                          </button>
                        </div>
                      </li>
                    ))}
                    {(reports.data ?? []).length === 0 ? (
                      <li className="px-5 py-10 text-center text-sm text-muted-foreground">No reports filed.</li>
                    ) : null}
                  </ul>
                )}
              </Panel>
            ) : null}

            {tab === 'rejections' ? (
              <Panel className="mt-5 overflow-hidden">
                <div className="border-b border-white/8 px-5 py-4">
                  <p className="label-eyebrow">Rejected submissions</p>
                </div>
                {rejections.isLoading ? (
                  <div className="p-5">
                    <LoadingBlock rows={3} />
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {(rejections.data ?? []).map((rejection) => (
                      <li key={rejection.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="font-mono text-xs text-amber-200">{rejection.reason}</span>
                        <span className="text-sm text-muted-foreground">
                          claimed {rejection.claimed_score?.toLocaleString() ?? '—'} · {rejection.mode}/{rejection.difficulty}
                        </span>
                        {rejection.detail ? (
                          <span className="font-mono text-[0.66rem] text-muted-foreground">{rejection.detail}</span>
                        ) : null}
                        <span className="ml-auto font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                          {timeAgo(rejection.created_at)}
                        </span>
                      </li>
                    ))}
                    {(rejections.data ?? []).length === 0 ? (
                      <li className="px-5 py-10 text-center text-sm text-muted-foreground">Every submission verified cleanly.</li>
                    ) : null}
                  </ul>
                )}
              </Panel>
            ) : null}

            {tab === 'runs' ? (
              <Panel className="mt-5 overflow-hidden">
                <div className="border-b border-white/8 px-5 py-4">
                  <p className="label-eyebrow">Recent submissions</p>
                </div>
                {runs.isLoading ? (
                  <div className="p-5">
                    <LoadingBlock rows={3} />
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {(runs.data ?? []).map((run) => (
                      <li key={run.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <Link to={`/pilots/${run.handle ?? ''}`} className="font-mono text-xs text-muted-foreground hover:text-primary">
                          @{run.handle ?? 'unknown'}
                        </Link>
                        <span className="font-mono text-sm text-primary">{formatScore(run.score)}</span>
                        <span className="text-sm text-muted-foreground">
                          {run.mode} · {run.difficulty} · wave {run.wave}
                        </span>
                        {run.ranked ? (
                          <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">ranked</span>
                        ) : (
                          <span className="rank-chip border-amber-400/30 bg-amber-500/10 text-amber-200">unranked</span>
                        )}
                        <span className="ml-auto flex items-center gap-2">
                          <Link to={`/runs/${run.id}`} className="rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-primary/40">
                            Inspect
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm('Delete this run and its board entries?')) return;
                              void moderate({ action: 'delete-run', runId: run.id, reason: 'moderator-review' }, 'Run deleted.', `del-${run.id}`);
                            }}
                            disabled={busy === `del-${run.id}`}
                            className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive-foreground transition hover:border-destructive/70 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </span>
                      </li>
                    ))}
                    {(runs.data ?? []).length === 0 ? (
                      <li className="px-5 py-10 text-center text-sm text-muted-foreground">No runs recorded yet.</li>
                    ) : null}
                  </ul>
                )}
              </Panel>
            ) : null}

            {tab === 'players' ? (
              <Panel className="mt-5 overflow-hidden">
                <div className="border-b border-white/8 px-5 py-4">
                  <p className="label-eyebrow">Pilot registry</p>
                </div>
                {players.isLoading ? (
                  <div className="p-5">
                    <LoadingBlock rows={3} />
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6">
                    {(players.data ?? []).map((player) => (
                      <li key={player.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <PilotAvatar seed={(player.handle.length * 37) % 360} name={player.display_name} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            {player.display_name}{' '}
                            <span className="font-mono text-xs text-muted-foreground">@{player.handle}</span>
                            {player.banned ? (
                              <span className="ml-2 rank-chip border-destructive/40 bg-destructive/10 text-destructive-foreground">banned</span>
                            ) : null}
                          </p>
                          <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                            {player.xp.toLocaleString()} xp · {player.is_guest ? 'guest' : player.email ?? 'registered'} · joined{' '}
                            {timeAgo(player.created_at)}
                          </p>
                        </div>
                        <Link to={`/pilots/${player.handle}`} className="rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-primary/40">
                          View
                        </Link>
                        {player.banned ? (
                          <button
                            type="button"
                            onClick={() => void moderate({ action: 'unban-player', playerId: player.id }, 'Player unbanned.', `unban-${player.id}`)}
                            disabled={busy === `unban-${player.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Unban
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Ban @${player.handle}? This revokes every session and removes their board entries.`)) return;
                              void moderate({ action: 'ban-player', playerId: player.id, reason: 'moderator-action' }, 'Player banned.', `ban-${player.id}`);
                            }}
                            disabled={busy === `ban-${player.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-50"
                          >
                            <Ban className="h-3 w-3" /> Ban
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}

            {tab === 'audit' ? (
              <Panel className="mt-5 overflow-hidden">
                <div className="border-b border-white/8 px-5 py-4">
                  <p className="label-eyebrow flex items-center gap-2">
                    <Database className="h-3.5 w-3.5" /> Audit trail
                  </p>
                </div>
                {audit.isLoading ? (
                  <div className="p-5">
                    <LoadingBlock rows={3} />
                  </div>
                ) : (
                  <ul className="divide-y divide-white/6 font-mono text-xs">
                    {(audit.data ?? []).map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                        <span className="text-primary">{entry.action}</span>
                        <span className="text-muted-foreground">{(entry.actor_id ?? 'system').slice(0, 12)}</span>
                        <span className="text-muted-foreground">
                          {entry.target_type ?? '—'} {(entry.target_id ?? '').slice(0, 12)}
                        </span>
                        <span className="ml-auto text-muted-foreground">{timeAgo(entry.created_at)}</span>
                      </li>
                    ))}
                    {(audit.data ?? []).length === 0 ? (
                      <li className="px-5 py-10 text-center text-sm text-muted-foreground">No recorded actions yet.</li>
                    ) : null}
                  </ul>
                )}
              </Panel>
            ) : null}
          </>
        ) : (
          <div className="mt-7">
            <EmptyPanel title="Console unavailable" message="The admin overview could not be loaded — check the API logs." />
          </div>
        )}
      </div>
    </>
  );
}
