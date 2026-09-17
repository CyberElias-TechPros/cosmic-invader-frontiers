import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertTriangle, CheckCircle2, Loader2, Play, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { avatarGradient, initials } from '@/lib/format';
import type { AchievementTier } from '@shared/game/achievements';

export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || 'https://cosmic-invader-frontiers.vercel.app';

/* ------------------------------- SEO head -------------------------------- */

export function Seo({
  title,
  description,
  path = '/',
  image,
  type = 'website',
  jsonLd,
  noIndex,
}: {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  jsonLd?: Record<string, unknown>;
  noIndex?: boolean;
}) {
  const canonical = `${SITE_URL}${path === '/' ? '/' : path}`;
  const ogImage = image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : `${SITE_URL}/og-image.jpg`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content={noIndex ? 'noindex, follow' : 'index, follow, max-image-preview:large'} />

      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {jsonLd ? <script type="application/ld+json">{JSON.stringify(jsonLd)}</script> : null}
    </Helmet>
  );
}

/* ------------------------------- numerals -------------------------------- */

/** Animated count-up that never lies: it always lands exactly on `value`. */
export function CountUp({
  value,
  durationMs = 900,
  format = (input: number) => Math.round(input).toLocaleString('en-US'),
  className,
}: {
  value: number;
  durationMs?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    if (reduced || durationMs <= 0) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const from = previous.current;
    const to = value;
    previous.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // easeOutExpo — matches the CSS motion tokens
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setDisplay(to);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);

  return <span className={cn('stat-value', className)}>{format(display)}</span>;
}

/* -------------------------------- identity ------------------------------- */

export function PilotAvatar({
  seed,
  name,
  size = 40,
  className,
  ring = true,
}: {
  seed: number;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold text-slate-950',
        ring && 'ring-1 ring-white/25',
        className,
      )}
      style={{
        width: size,
        height: size,
        background: avatarGradient(seed),
        fontSize: Math.max(10, size * 0.36),
        boxShadow: '0 8px 24px -12px rgba(56,189,248,0.7)',
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function TierChip({ tier, className }: { tier: AchievementTier; className?: string }) {
  const styles: Record<AchievementTier, string> = {
    bronze: 'border-amber-700/50 bg-amber-900/20 text-amber-300',
    silver: 'border-slate-400/40 bg-slate-500/15 text-slate-200',
    gold: 'border-yellow-400/45 bg-yellow-500/15 text-yellow-200',
    platinum: 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100',
  };
  return <span className={cn('rank-chip', styles[tier], className)}>{tier}</span>;
}

export function VerifiedBadge({
  label = 'Verified',
  detail,
  className,
}: {
  label?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/12 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-widest text-emerald-300',
        className,
      )}
      title={detail ?? 'This score was re-simulated by the game engine before it was accepted.'}
    >
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/* --------------------------------- states -------------------------------- */

export function LoadingBlock({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-14 w-full animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]"
          style={{ animationDelay: `${index * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function InlineSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-primary', className)} aria-hidden="true" />;
}

export function ErrorPanel({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn('glass rounded-3xl p-6 text-center', className)}
      role="alert"
    >
      <AlertTriangle className="mx-auto h-7 w-7 text-amber-300" aria-hidden="true" />
      <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
      {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="btn-cosmic mt-4 rounded-full border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/25"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyPanel({
  icon = <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden="true" />,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('glass rounded-3xl p-8 text-center', className)}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      {message ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{message}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* --------------------------------- layout -------------------------------- */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="max-w-2xl">
        {eyebrow ? <p className="label-eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
        {description ? <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent = 'cyan',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: 'cyan' | 'magenta' | 'amber' | 'emerald';
  icon?: ReactNode;
  className?: string;
}) {
  const accents: Record<string, string> = {
    cyan: 'from-cyan-400/20 text-cyan-200',
    magenta: 'from-fuchsia-500/20 text-fuchsia-200',
    amber: 'from-amber-400/20 text-amber-200',
    emerald: 'from-emerald-400/20 text-emerald-200',
  };
  return (
    <div className={cn('glass relative overflow-hidden rounded-2xl p-4', className)}>
      <div className={cn('pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-gradient-to-br to-transparent blur-2xl', accents[accent])} />
      <div className="flex items-center justify-between gap-2">
        <p className="label-eyebrow">{label}</p>
        {icon ? <span className={cn('opacity-80', accents[accent].split(' ')[1])}>{icon}</span> : null}
      </div>
      <p className="mt-2 font-display text-xl font-semibold sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PlayNowButton({
  to = '/play',
  children = 'Launch a sortie',
  size = 'lg',
  className,
}: {
  to?: string;
  children?: ReactNode;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'btn-cosmic group inline-flex items-center gap-2 rounded-full font-semibold text-slate-950',
        'bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-300 shadow-[0_18px_46px_-20px_rgba(56,189,248,0.85)]',
        size === 'lg' ? 'px-6 py-3 text-base' : 'px-4 py-2 text-sm',
        className,
      )}
    >
      <Play className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Shared panel wrapper so every card in the app breathes identically. */
export function Panel({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'aside';
}) {
  return <Tag className={cn('glass rounded-3xl', className)}>{children}</Tag>;
}

export function MotionSection({
  children,
  className,
  delay = 0,
  id,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  id?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      id={id}
      initial={reduced ? undefined : { opacity: 0, y: 22 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.56, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}
