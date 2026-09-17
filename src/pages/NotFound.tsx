import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Compass, Home, Radar } from 'lucide-react';
import { Panel, PlayNowButton, Seo } from '@/components/common/atoms';

export default function NotFound() {
  const location = useLocation();

  return (
    <>
      <Seo
        title="Lost in the dark — 404 | Cosmic Invader Frontiers"
        description="That coordinate does not exist in this sector. Head back to the bridge and pick a route that does."
        path={location.pathname}
        noIndex
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <Radar className="h-16 w-16 text-primary/70" aria-hidden="true" />
          <span className="absolute inset-0 animate-pulse-glow rounded-full bg-primary/20 blur-2xl" />
        </motion.div>

        <p className="label-eyebrow mt-6">Navigation failure · 404</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          This coordinate is empty space
        </h1>
        <p className="mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">
          Nothing is parked at <span className="font-mono text-foreground">{location.pathname}</span>. The bridge suggests one of
          the routes below.
        </p>

        <Panel className="mt-8 w-full p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { to: '/', label: 'Bridge', hint: 'Home', icon: <Home className="h-4 w-4" /> },
              { to: '/leaderboards', label: 'Standings', hint: 'Verified boards', icon: <Compass className="h-4 w-4" /> },
              { to: '/about', label: 'Manual', hint: 'How it works', icon: <Radar className="h-4 w-4" /> },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="card-hover rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  {link.icon}
                </span>
                <p className="mt-3 text-sm font-medium">{link.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{link.hint}</p>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <PlayNowButton size="sm">Fly a sortie instead</PlayNowButton>
          </div>
        </Panel>
      </div>
    </>
  );
}
