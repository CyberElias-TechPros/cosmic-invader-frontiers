import { Link } from 'react-router-dom';
import { Cloud, Github, Server, ShieldCheck, Zap } from 'lucide-react';
import { ENGINE_VERSION } from '@shared/game/config';
import { useConfig } from '@/hooks/useApi';

const COLUMNS: Array<{ title: string; links: Array<{ to: string; label: string }> }> = [
  {
    title: 'Play',
    links: [
      { to: '/play', label: 'Campaign' },
      { to: '/play/gauntlet', label: 'Overdrive Gauntlet' },
      { to: '/daily', label: 'Daily Sortie' },
      { to: '/settings', label: 'Settings' },
    ],
  },
  {
    title: 'Compete',
    links: [
      { to: '/leaderboards', label: 'Global leaderboards' },
      { to: '/achievements', label: 'Achievements' },
      { to: '/profile', label: 'My record' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { to: '/about', label: 'How verification works' },
      { to: '/about#systems', label: 'Architecture' },
      { to: '/about#faq', label: 'FAQ' },
    ],
  },
];

export function SiteFooter() {
  const config = useConfig();
  const season = config.data?.season;

  return (
    <footer className="relative mt-24 border-t border-white/8 bg-[#04050c]/70 backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-display text-base font-semibold">Cosmic Invader Frontiers</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            A deterministic arcade shooter where every ranked score is re-simulated by the same engine that ran it. No client
            claim is ever trusted with a leaderboard position.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rank-chip border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Engine v{ENGINE_VERSION}
            </span>
            {season ? (
              <span className="rank-chip border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200">
                {season.name} · {season.status}
              </span>
            ) : null}
          </div>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="label-eyebrow">{column.title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map((link) => (
                <li key={link.to + link.label}>
                  <Link to={link.to} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="divider-glow" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} Cosmic Invader Frontiers · Deterministic engine {ENGINE_VERSION} · API{' '}
          {config.data?.apiVersion ?? '—'}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" aria-hidden="true" /> Vercel frontend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cloud className="h-3.5 w-3.5" aria-hidden="true" /> Cloudflare Workers · D1 · R2 · KV · Queues
          </span>
          <a
            href="https://github.com/CyberElias-TechPros/cosmic-invader-frontiers"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            rel="noopener noreferrer"
            target="_blank"
          >
            <Github className="h-3.5 w-3.5" aria-hidden="true" /> Source
          </a>
        </div>
      </div>
    </footer>
  );
}
