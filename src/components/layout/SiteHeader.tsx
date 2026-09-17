import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, ChevronDown, LayoutDashboard, LogOut, Menu, Settings as SettingsIcon, ShieldCheck, User, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { PilotAvatar } from '@/components/common/atoms';
import { useAuthDialog } from '@/components/auth/AuthDialog';
import { useAuth } from '@/lib/auth';
import { useGlobalStats } from '@/hooks/useApi';
import { formatCompact } from '@/lib/format';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/play', label: 'Play' },
  { to: '/leaderboards', label: 'Leaderboards' },
  { to: '/daily', label: 'Daily Sortie' },
  { to: '/achievements', label: 'Achievements' },
  { to: '/about', label: 'How it works' },
];

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="Cosmic Invader Frontiers" className={className}>
      <defs>
        <linearGradient id="cif-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="55%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="none" stroke="url(#cif-logo)" strokeWidth="1.6" opacity="0.65" />
      <path d="M24 8 L34 30 L24 25 L14 30 Z" fill="url(#cif-logo)" />
      <path d="M18 33 L24 43 L30 33 L24 36 Z" fill="#e2e8f0" opacity="0.85" />
      <circle cx="24" cy="17" r="2.1" fill="#0b1020" />
    </svg>
  );
}

export function SiteHeader() {
  const auth = useAuth();
  const navigate = useNavigate();
  const dialog = useAuthDialog();
  const stats = useGlobalStats();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const player = auth.player;
  const online = stats.data?.pilotsOnline ?? 0;

  const handleSignOut = async () => {
    await auth.signOut();
    toast.success('Signed out — a fresh guest session is ready.');
    navigate('/');
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        scrolled ? 'border-b border-white/8 bg-[#05060f]/80 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5" aria-label="Cosmic Invader Frontiers home">
          <LogoMark className="h-9 w-9 transition-transform duration-500 group-hover:rotate-[8deg]" />
          <span className="hidden leading-tight sm:block">
            <span className="block font-display text-[0.95rem] font-semibold tracking-tight">Cosmic Invader Frontiers</span>
            <span className="block font-mono text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground">
              Verified score network
            </span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative rounded-full px-3.5 py-2 text-sm transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/[0.06]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 font-mono text-[0.66rem] uppercase tracking-widest text-emerald-300 sm:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {formatCompact(online)} live
          </span>

          {player ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-3 text-sm transition hover:border-primary/40 hover:bg-white/[0.07]"
                  aria-label="Account menu"
                >
                  <PilotAvatar seed={player.avatarSeed} name={player.displayName} size={30} />
                  <span className="hidden max-w-[9rem] truncate sm:block">{player.displayName}</span>
                  {player.isGuest ? (
                    <span className="hidden rounded-full bg-amber-400/15 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-widest text-amber-300 sm:block">
                      guest
                    </span>
                  ) : null}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-strong w-60 border-white/12">
                <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
                  <span className="truncate text-sm">{player.handle}</span>
                  <span className="rank-chip border-primary/30 bg-primary/10 text-primary">Lv {player.level}</span>
                </DropdownMenuLabel>
                <p className="px-2 pb-2 font-mono text-[0.62rem] uppercase tracking-widest text-muted-foreground">
                  {player.rank} · {player.xp.toLocaleString()} XP
                </p>
                <DropdownMenuSeparator className="bg-white/10" />
                {player.isGuest ? (
                  <DropdownMenuItem onSelect={() => dialog.open('upgrade')} className="gap-2 text-primary focus:text-primary">
                    <ShieldCheck className="h-4 w-4" /> Secure this record
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => navigate('/profile')} className="gap-2">
                  <User className="h-4 w-4" /> My profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/settings')} className="gap-2">
                  <SettingsIcon className="h-4 w-4" /> Settings
                </DropdownMenuItem>
                {auth.isAdmin ? (
                  <DropdownMenuItem onSelect={() => navigate('/admin')} className="gap-2">
                    <LayoutDashboard className="h-4 w-4" /> Moderation console
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onSelect={() => void handleSignOut()} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              type="button"
              onClick={() => dialog.open('signin')}
              className="btn-cosmic hidden rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/20 sm:block"
            >
              Sign in
            </button>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="glass-strong w-[86vw] max-w-sm border-white/12 p-0">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <span className="font-display text-sm font-semibold">Navigate</span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-full border border-white/10 p-2"
                  aria-label="Close navigation menu"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <nav className="flex flex-col p-3" aria-label="Mobile">
                <AnimatePresence initial={false}>
                  {NAV.map((item, index) => (
                    <motion.div
                      key={item.to}
                      initial={{ opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04, duration: 0.28 }}
                    >
                      <NavLink
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'block rounded-xl px-4 py-3 text-base transition',
                            isActive ? 'bg-white/[0.07] text-foreground' : 'text-muted-foreground hover:bg-white/[0.04]',
                          )
                        }
                      >
                        {item.label}
                      </NavLink>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div className="divider-glow my-3" />
                {player ? (
                  <>
                    <NavLink to="/profile" onClick={() => setMobileOpen(false)} className="rounded-xl px-4 py-3 text-base text-muted-foreground hover:bg-white/[0.04]">
                      My profile
                    </NavLink>
                    <NavLink to="/settings" onClick={() => setMobileOpen(false)} className="rounded-xl px-4 py-3 text-base text-muted-foreground hover:bg-white/[0.04]">
                      Settings
                    </NavLink>
                    {player.isGuest ? (
                      <button
                        type="button"
                        onClick={() => { setMobileOpen(false); dialog.open('upgrade'); }}
                        className="btn-cosmic mt-3 rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-4 py-3 text-center font-semibold text-slate-950"
                      >
                        Secure this record
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); dialog.open('signin'); }}
                    className="btn-cosmic mt-3 rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-4 py-3 font-semibold text-slate-950"
                  >
                    Sign in
                  </button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
