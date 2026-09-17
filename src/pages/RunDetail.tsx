import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, Copy, Download, Flag, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyPanel, LoadingBlock, Panel, PilotAvatar, Seo, VerifiedBadge } from '@/components/common/atoms';
import { useRun } from '@/hooks/useApi';
import { api, shareCardUrl } from '@/lib/api';
import { formatDateTime, formatDuration, formatPercent, formatScore, timeAgo } from '@/lib/format';

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const run = useRun(id);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('impossible-score');
  const [detail, setDetail] = useState('');

  if (run.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <LoadingBlock rows={5} label="Loading run evidence" />
      </div>
    );
  }

  if (run.isError || !run.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyPanel
          icon={<XCircle className="h-6 w-6 text-destructive" />}
          title="That run is not in the archive"
          message="The run may have been removed with its account, or the link may be mistyped."
          action={
            <Link to="/leaderboards" className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary">
              Back to the boards
            </Link>
          }
        />
      </div>
    );
  }

  const { run: stored, player, replayAvailable, shareUrl } = run.data;
  const cardUrl = shareCardUrl(stored.id);

  const submitReport = async () => {
    try {
      await api.reportRun(stored.id, reason, detail || undefined);
      toast.success('Report submitted — moderators review flagged runs with the stored replay.');
      setReporting(false);
      setDetail('');
    } catch {
      toast.error('Could not submit the report right now.');
    }
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl || `${window.location.origin}/runs/${stored.id}`);
      toast.success('Share link copied');
    } catch {
      toast.error('Clipboard unavailable — copy the address bar instead.');
    }
  };

  const downloadCard = async () => {
    try {
      const response = await fetch(cardUrl);
      if (!response.ok) throw new Error('unavailable');
      const svg = await response.text();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cosmic-run-${stored.id.slice(0, 8)}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Share card downloaded');
    } catch {
      toast.error('Could not download the card.');
    }
  };

  const downloadReplay = async () => {
    try {
      const data = await api.runReplay(stored.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data.replay, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cosmic-replay-${stored.id.slice(0, 8)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Replay downloaded — re-verify it yourself with the shared engine.');
    } catch {
      toast.error('Replay unavailable (it may have been pruned from cold storage).');
    }
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${player.displayName} scored ${formatScore(stored.score)} on ${stored.mode} (${stored.difficulty})`,
    datePublished: stored.createdAt,
    author: { '@type': 'Person', name: player.displayName },
    description: `Server-verified arcade run: ${formatScore(stored.score)} points, wave ${stored.wave}, ${formatPercent(stored.accuracy, 1)} accuracy.`,
  };

  return (
    <>
      <Seo
        title={`${player.displayName} — ${formatScore(stored.score)} ${stored.mode} run | Cosmic Invader Frontiers`}
        description={`Verified run evidence: ${formatScore(stored.score)} points on ${stored.mode} ${stored.difficulty}, wave ${stored.wave}, ${formatPercent(stored.accuracy, 1)} accuracy. Engine replay re-simulated on the server.`}
        path={`/runs/${stored.id}`}
        image={cardUrl.startsWith('http') ? cardUrl : undefined}
        type="article"
        jsonLd={jsonLd}
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <Link to="/leaderboards" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Leaderboards
        </Link>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-5">
          <Panel className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="label-eyebrow">Verified run</p>
                <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                  <span className="text-gradient">{formatScore(stored.score)}</span>
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rank-chip border-white/12 bg-white/[0.04]">{stored.mode}</span>
                  <span className="rank-chip border-white/12 bg-white/[0.04]">{stored.difficulty}</span>
                  <span className="rank-chip border-white/12 bg-white/[0.04]">wave {stored.wave}</span>
                  {stored.ranked ? (
                    <VerifiedBadge label="ranked" />
                  ) : (
                    <span className="rank-chip border-amber-400/30 bg-amber-500/10 text-amber-200">
                      unranked {stored.assist ? '· assist mode' : ''}
                    </span>
                  )}
                  {stored.dailyKey ? <span className="rank-chip border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200">daily {stored.dailyKey}</span> : null}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <PilotAvatar seed={player.avatarSeed} name={player.displayName} size={52} />
                <div>
                  <Link to={`/pilots/${player.handle}`} className="text-sm hover:text-primary">
                    {player.displayName}
                  </Link>
                  <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                    @{player.handle} · {timeAgo(stored.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Panel className="overflow-hidden">
              <img
                src={cardUrl}
                alt={`Share card for ${player.displayName}'s ${formatScore(stored.score)} point run`}
                className="w-full border-b border-white/8 bg-[#05060f]"
                width={1200}
                height={630}
                loading="lazy"
              />
              <div className="flex flex-wrap items-center gap-2 p-4">
                <button
                  type="button"
                  onClick={() => void downloadCard()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
                >
                  <Download className="h-4 w-4" /> Download card
                </button>
                <button
                  type="button"
                  onClick={() => void copyShare()}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
                >
                  <Copy className="h-4 w-4" /> Copy link
                </button>
                {replayAvailable ? (
                  <button
                    type="button"
                    onClick={() => void downloadReplay()}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
                  >
                    <Download className="h-4 w-4" /> Download replay
                  </button>
                ) : null}
              </div>
            </Panel>

            <div className="space-y-5">
              <Panel className="p-5">
                <p className="label-eyebrow">Verification</p>
                <ul className="mt-3 space-y-2.5 text-sm">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      Engine <span className="font-mono">{stored.engine}</span> replayed this run server-side and reproduced the
                      score exactly.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      Seed <span className="font-mono">{stored.seed.toString(16).toUpperCase()}</span> · {stored.ticks.toLocaleString()} simulated ticks ·{' '}
                      {formatDuration(stored.durationMs)} of play.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>
                      Replay checksum <span className="font-mono">{stored.checksum}</span> — used to reject duplicate submissions atomically.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Recorded {formatDateTime(stored.createdAt)} · XP awarded +{stored.xpAwarded}</span>
                  </li>
                </ul>
              </Panel>

              <Panel className="p-5">
                <p className="label-eyebrow">Run metrics</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Kills', stored.kills.toLocaleString()],
                    ['Bosses', String(stored.bossKills)],
                    ['Saucers', String(stored.ufosDestroyed)],
                    ['Max combo', `${stored.maxCombo}×`],
                    ['Accuracy', formatPercent(stored.accuracy, 1)],
                    ['Lives lost', String(stored.livesLost)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                      <dt className="font-mono text-[0.58rem] uppercase tracking-widest text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel className="p-5">
                <p className="label-eyebrow">Dispute this run</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Anyone can flag a run. Moderators see the same replay the engine verified, so false reports cost you nothing but
                  time.
                </p>
                {reporting ? (
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs text-muted-foreground">
                      Reason
                      <select
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground"
                      >
                        <option value="impossible-score">Score looks impossible</option>
                        <option value="suspected-automation">Suspected automation</option>
                        <option value="offensive-handle">Offensive handle or name</option>
                        <option value="other">Something else</option>
                      </select>
                    </label>
                    <textarea
                      value={detail}
                      onChange={(event) => setDetail(event.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="Anything a moderator should know (optional)"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void submitReport()}
                        className="rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive-foreground transition hover:border-destructive/70"
                      >
                        Submit report
                      </button>
                      <button type="button" onClick={() => setReporting(false)} className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReporting(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-destructive/50"
                  >
                    <Flag className="h-4 w-4" /> Flag this run
                  </button>
                )}
              </Panel>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
