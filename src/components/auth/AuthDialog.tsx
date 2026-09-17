import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles, User } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'register' | 'upgrade';

interface AuthDialogContextValue {
  open: (mode?: Mode) => void;
  close: () => void;
}

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null);

export function useAuthDialog(): AuthDialogContextValue {
  const context = useContext(AuthDialogContext);
  if (!context) throw new Error('useAuthDialog must be used inside <AuthDialogProvider>');
  return context;
}

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: Mode }>({ open: false, mode: 'signin' });

  const value = useMemo<AuthDialogContextValue>(
    () => ({
      open: (mode: Mode = 'signin') => setState({ open: true, mode }),
      close: () => setState((current) => ({ ...current, open: false })),
    }),
    [],
  );

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      <AuthDialog
        open={state.open}
        mode={state.mode}
        onModeChange={(mode) => setState((current) => ({ ...current, mode }))}
        onOpenChange={(open) => setState((current) => ({ ...current, open }))}
      />
    </AuthDialogContext.Provider>
  );
}

function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  icon,
  hint,
  required = true,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  icon?: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && revealed ? 'text' : type;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label-eyebrow block">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        <input
          id={id}
          name={id}
          type={resolvedType}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(
            'w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 text-sm text-foreground placeholder:text-muted-foreground/60',
            'focus:border-primary/50 focus:bg-white/[0.06] focus:outline-none focus-visible:outline-none',
            isPassword && 'pr-11',
          )}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AuthDialog({
  open,
  mode,
  onModeChange,
  onOpenChange,
}: {
  open: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPassword('');
    setError(null);
    setAcceptTerms(false);
  }, []);

  const describeError = (caught: unknown): string => {
    if (caught instanceof ApiError) {
      if (caught.status === 401) return 'That email and password combination did not match a pilot record.';
      if (caught.status === 409) return caught.message || 'That email or callsign is already registered.';
      if (caught.status === 422) return caught.message || 'Please check the details and try again.';
      if (caught.status === 429) return 'Too many attempts. Take a breath and try again shortly.';
      if (caught.isOffline) return 'Cannot reach the frontier network. Your guest progress is safe locally.';
      return caught.message;
    }
    return caught instanceof Error ? caught.message : 'Unexpected error';
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        const player = await auth.signIn(email.trim(), password);
        toast.success(`Welcome back, ${player.displayName}`);
      } else if (mode === 'register') {
        if (!acceptTerms) {
          setError('Please accept the terms to create an account.');
          setBusy(false);
          return;
        }
        const player = await auth.signUp({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          handle: handle.trim() || undefined,
        });
        toast.success(`Account created — welcome, ${player.displayName}`);
      } else {
        if (!acceptTerms) {
          setError('Please accept the terms to keep your record.');
          setBusy(false);
          return;
        }
        const player = await auth.linkAccount({ email: email.trim(), password });
        toast.success(`Progress secured under ${player.handle}`);
      }
      reset();
      onOpenChange(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, { title: string; description: string; cta: string }> = {
    signin: { title: 'Pilot sign-in', description: 'Return to your record, ranks and achievements.', cta: 'Sign in' },
    register: { title: 'Create a pilot record', description: 'Claim a callsign and keep every verified run.', cta: 'Create account' },
    upgrade: { title: 'Secure your progress', description: 'Turn this guest session into a permanent record. Your scores, achievements and XP carry over.', cta: 'Secure my record' },
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="glass-strong max-w-md overflow-hidden border-white/12 p-0 sm:rounded-3xl">
        <div className="relative overflow-hidden px-6 pb-5 pt-6">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />
          <DialogHeader className="relative text-left">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified run network
            </div>
            <DialogTitle className="font-display text-2xl">{titles[mode].title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{titles[mode].description}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          {mode !== 'upgrade' ? (
            <Tabs value={mode} onValueChange={(value) => { onModeChange(value as Mode); setError(null); }}>
              <TabsList className="mb-5 grid w-full grid-cols-2 bg-white/[0.04]">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="register">Create account</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          <form onSubmit={submit} className="space-y-4">
            {mode !== 'signin' ? (
              <Field
                id="auth-email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="pilot@frontier.net"
                autoComplete="email"
                icon={<Mail className="h-4 w-4" />}
              />
            ) : (
              <Field
                id="auth-email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="pilot@frontier.net"
                autoComplete="email"
                icon={<Mail className="h-4 w-4" />}
              />
            )}

            <Field
              id="auth-password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              icon={<Lock className="h-4 w-4" />}
              hint={mode === 'signin' ? undefined : 'At least 10 characters. Length beats punctuation.'}
            />

            {mode === 'register' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="auth-display"
                  label="Callsign"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Nova Vex"
                  autoComplete="nickname"
                  icon={<Sparkles className="h-4 w-4" />}
                  required={false}
                />
                <Field
                  id="auth-handle"
                  label="Handle"
                  value={handle}
                  onChange={setHandle}
                  placeholder="nova-vex"
                  icon={<User className="h-4 w-4" />}
                  required={false}
                />
              </div>
            ) : null}

            {mode !== 'signin' ? (
              <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(event) => setAcceptTerms(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent accent-cyan-400"
                />
                <span>
                  I understand my scores are re-simulated for verification and that I accept fair-play terms.
                </span>
              </label>
            ) : null}

            {error ? (
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="btn-cosmic flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {titles[mode].cta}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => onModeChange('register')}>
                  Create a pilot record
                </button>
              </>
            ) : (
              <>
                Already have a record?{' '}
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => onModeChange('signin')}>
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
