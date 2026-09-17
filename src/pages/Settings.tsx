import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CloudUpload, Download, Eye, LogOut, Monitor, Smartphone, Trash2, Volume2, VolumeX, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Panel, Seo } from '@/components/common/atoms';
import { useAuth } from '@/lib/auth';
import { useAuthDialog } from '@/components/auth/AuthDialog';
import { settingsStore, useSettings, updateSettings, type GameSettings } from '@/lib/settings';
import { audio } from '@/game/audio';
import { DIFFICULTIES, type Difficulty } from '@shared/game/config';
import { useCloudSave, useSessions } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/6 py-4 last:border-0">
      <div className="max-w-md">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full border transition',
        checked ? 'border-primary/50 bg-primary/30' : 'border-white/12 bg-white/[0.06]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all',
          checked ? 'left-[1.45rem]' : 'left-0.5',
        )}
        style={{ height: '1.125rem', width: '1.125rem' }}
      />
    </button>
  );
}

export default function Settings() {
  const settings = useSettings();
  const auth = useAuth();
  const dialog = useAuthDialog();
  const save = useCloudSave();
  const sessions = useSessions();
  const [busy, setBusy] = useState<string | null>(null);

  const patch = (values: Partial<GameSettings>) => {
    updateSettings(values);
    if (values.sound !== undefined || values.music !== undefined || values.sfxVolume !== undefined || values.musicVolume !== undefined) {
      audio.init();
      audio.soundEnabled = values.sound ?? settings.sound;
      audio.setVolumes(values.sfxVolume ?? settings.sfxVolume, values.musicVolume ?? settings.musicVolume);
      if ((values.music ?? settings.music) && audio.soundEnabled) audio.startMusic();
      else if (!(values.music ?? settings.music)) audio.stopMusic(0.3);
    }
  };

  const testSound = () => {
    audio.init();
    void audio.unlock();
    audio.soundEnabled = true;
    audio.play('powerup');
  };

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await api.revokeSession(id);
      toast.success('Session revoked');
      void sessions.refetch();
    } catch {
      toast.error('Could not revoke that session.');
    } finally {
      setBusy(null);
    }
  };

  const signOutEverywhere = async () => {
    setBusy('all');
    try {
      await api.logoutAll();
      toast.success('Every other device has been signed out.');
      void sessions.refetch();
    } catch {
      toast.error('Could not sign out other sessions.');
    } finally {
      setBusy(null);
    }
  };

  const pushSave = async () => {
    setBusy('push');
    try {
      const payload = JSON.stringify({ settings, savedAt: new Date().toISOString() });
      const response = await api.putSave({ payload, version: save.data?.version, device: navigator.userAgent.slice(0, 60) });
      toast.success(response.status === 'identical' ? 'Cloud save already current.' : 'Settings uploaded.');
      void save.refetch();
    } catch {
      toast.error('Upload failed.');
    } finally {
      setBusy(null);
    }
  };

  const pullSave = async () => {
    setBusy('pull');
    try {
      const current = await api.getSave();
      const payload = typeof current.payload === 'string' ? JSON.parse(current.payload) : current.payload;
      const incoming = (payload as { settings?: Partial<GameSettings> } | null)?.settings;
      if (!incoming) {
        toast.info('Nothing stored in the cloud yet.');
      } else {
        settingsStore.set(incoming);
        toast.success('Settings restored from the cloud.');
      }
    } catch {
      toast.error('Restore failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Seo
        title="Settings — cockpit configuration | Cosmic Invader Frontiers"
        description="Audio, motion, accessibility and control settings, plus session management and cloud save sync for your pilot record."
        path="/settings"
        noIndex
      />

      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <header>
          <p className="label-eyebrow">Cockpit</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything here applies immediately. Audio is synthesised in the browser, so there are no assets to download.
          </p>
        </header>

        <Panel className="mt-7 px-5">
          <Row title="Sound effects" description="Procedural arcade audio — fire, impacts, Overdrive and UI feedback.">
            <button
              type="button"
              onClick={testSound}
              className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs transition hover:border-primary/40"
            >
              Test
            </button>
            {settings.sound ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            <Toggle checked={settings.sound} onChange={(checked) => patch({ sound: checked })} label="Sound effects" />
          </Row>

          <Row title="SFX volume" description={`${Math.round(settings.sfxVolume * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.sfxVolume}
              onChange={(event) => patch({ sfxVolume: Number(event.target.value) })}
              className="w-44 accent-cyan-400"
              aria-label="Sound effect volume"
            />
          </Row>

          <Row title="Music" description="Ambient synth bed that reacts to combat intensity.">
            <Toggle checked={settings.music} onChange={(checked) => patch({ music: checked })} label="Music" />
          </Row>

          <Row title="Music volume" description={`${Math.round(settings.musicVolume * 100)}%`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              onChange={(event) => patch({ musicVolume: Number(event.target.value) })}
              className="w-44 accent-fuchsia-400"
              aria-label="Music volume"
            />
          </Row>
        </Panel>

        <Panel className="mt-5 px-5">
          <Row
            title="Reduced motion"
            description="Removes drift, parallax and screen shake. The game stays fully playable; only decoration changes."
          >
            <Toggle checked={settings.reducedMotion} onChange={(checked) => patch({ reducedMotion: checked, screenShake: checked ? false : settings.screenShake })} label="Reduced motion" />
          </Row>
          <Row title="Screen shake" description="Impact feedback on explosions and hits.">
            <Toggle checked={settings.screenShake} onChange={(checked) => patch({ screenShake: checked })} label="Screen shake" />
          </Row>
          <Row title="Particle density" description="Lower this on older hardware — the simulation is unaffected.">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              {(['full', 'reduced', 'off'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => patch({ particles: option })}
                  aria-pressed={settings.particles === option}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs capitalize transition',
                    settings.particles === option ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </Row>
        </Panel>

        <Panel className="mt-5 px-5">
          <Row title="Auto-fire" description="Hold nothing and keep shooting. Turning it off restores the classic trigger.">
            <Toggle checked={settings.autoFire} onChange={(checked) => patch({ autoFire: checked })} label="Auto-fire" />
          </Row>
          <Row title="Default difficulty" description="Used when you open a sortie — you can always change it in the briefing.">
            <select
              value={settings.difficulty}
              onChange={(event) => patch({ difficulty: event.target.value as Difficulty })}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
              aria-label="Default difficulty"
            >
              {Object.values(DIFFICULTIES).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Row>
          <Row title="Pilot assist" description="On by default for new pilots. Assisted runs never appear on ranked boards.">
            <Toggle checked={settings.assistMode} onChange={(checked) => patch({ assistMode: checked })} label="Pilot assist" />
          </Row>
          <Row title="Touch controls" description="Auto detects touch devices; force them on for tablets with keyboards.">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              {(['auto', 'always', 'never'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => patch({ virtualControls: option })}
                  aria-pressed={settings.virtualControls === option}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs capitalize transition',
                    settings.virtualControls === option ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </Row>
          <Row title="Show benchmark hints" description="Displays par scores and board context while you fly.">
            <Toggle checked={settings.showBenchmarks} onChange={(checked) => patch({ showBenchmarks: checked })} label="Benchmark hints" />
          </Row>
          <Row title="Reset to defaults" description="Restores every cockpit setting on this device.">
            <button
              type="button"
              onClick={() => {
                settingsStore.reset();
                toast.success('Settings restored to defaults.');
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
            >
              <Wand2 className="h-4 w-4" /> Reset
            </button>
          </Row>
        </Panel>

        <Panel className="mt-5 px-5">
          <Row
            title="Cloud save"
            description={save.data?.updatedAt ? `Version ${save.data.version} · updated ${timeAgo(save.data.updatedAt)}` : 'Carry settings between devices.'}
          >
            <button
              type="button"
              onClick={() => void pushSave()}
              disabled={busy === 'push'}
              className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary transition hover:bg-primary/20 disabled:opacity-50"
            >
              <CloudUpload className="h-4 w-4" /> Upload
            </button>
            <button
              type="button"
              onClick={() => void pullSave()}
              disabled={busy === 'pull'}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Restore
            </button>
          </Row>
        </Panel>

        <Panel className="mt-5 px-5">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium">Sessions & devices</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Refresh tokens rotate on every use; a replayed token revokes its whole family automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOutEverywhere()}
              disabled={busy === 'all'}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> Sign out everywhere
            </button>
          </div>

          <ul className="divide-y divide-white/6 pb-2">
            {(sessions.data?.sessions ?? []).map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  {/mobile|android|iphone/i.test(session.device ?? '') ? (
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{session.device ?? 'Unknown device'}</p>
                  <p className="font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                    started {formatDateTime(session.created_at)} · expires {formatDateTime(session.expires_at)}
                  </p>
                </div>
                {session.current ? (
                  <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> this device
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void revoke(session.id)}
                    disabled={busy === session.id}
                    className="rounded-full border border-white/12 px-3 py-1.5 text-xs transition hover:border-destructive/50 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
            {sessions.data && sessions.data.sessions.length === 0 ? (
              <li className="py-4 text-sm text-muted-foreground">No active sessions recorded.</li>
            ) : null}
          </ul>
        </Panel>

        <Panel className="mt-5 px-5">
          <Row title="Identity" description={auth.player ? `Signed in as @${auth.player.handle}` : 'No record loaded'}>
            {auth.player?.isGuest ? (
              <button
                type="button"
                onClick={() => dialog.open('upgrade')}
                className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary transition hover:bg-primary/20"
              >
                Secure this record
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm transition hover:border-primary/40"
            >
              Sign out
            </button>
          </Row>
          <Row title="Delete account" description="Removes the player, every run, achievement and stored replay. Irreversible.">
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm('Delete this account and all attached data? This cannot be undone.')) return;
                await auth.deleteAccount();
                toast.success('Account deleted.');
              }}
              className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive-foreground transition hover:border-destructive/70"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </Row>
        </Panel>

        <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Accessibility note: keyboard navigation, focus rings, reduced-motion support and screen-reader labels are built in.
            If something blocks you, the <Link to="/about#a11y" className="text-primary underline-offset-4 hover:underline">accessibility statement</Link> explains what is covered.
          </span>
        </p>
      </div>
    </>
  );
}
