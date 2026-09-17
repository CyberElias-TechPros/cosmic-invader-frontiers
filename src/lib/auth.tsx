import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, tokenStore } from './api';
import type { PrivatePlayer, Tokens } from './types';

/**
 * Identity bootstrap.
 *
 * The product rule is "you can always play": a guest identity is provisioned
 * silently on first visit so scores, achievements and the Daily Sortie all work
 * immediately, and registering later upgrades that same identity in place.
 * If the API is unreachable the app degrades to a local-only session rather
 * than blocking the game.
 */

export type AuthStatus = 'loading' | 'guest' | 'authenticated' | 'offline';

interface AuthContextValue {
  status: AuthStatus;
  player: PrivatePlayer | null;
  error: string | null;
  isOffline: boolean;
  isGuest: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<PrivatePlayer>;
  signUp: (input: { email: string; password: string; displayName?: string; handle?: string }) => Promise<PrivatePlayer>;
  linkAccount: (input: { email: string; password: string }) => Promise<PrivatePlayer>;
  signOut: () => Promise<void>;
  updateProfile: (patch: { displayName?: string; handle?: string; avatarSeed?: number; preferences?: Record<string, unknown> }) => Promise<void>;
  setIdentity: (player: PrivatePlayer, tokens: Tokens) => void;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [player, setPlayer] = useState<PrivatePlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const setIdentity = useCallback((nextPlayer: PrivatePlayer, tokens: Tokens) => {
    tokenStore.set(tokens);
    setPlayer(nextPlayer);
    setStatus(nextPlayer.isGuest ? 'guest' : 'authenticated');
    setError(null);
  }, []);

  const createGuest = useCallback(async () => {
    const response = await api.guest({ device: navigator.userAgent.slice(0, 80) });
    setIdentity(response.player, response.tokens);
    return response.player;
  }, [setIdentity]);

  const refresh = useCallback(async () => {
    try {
      const profile = await api.me();
      setPlayer(profile);
      setStatus(profile.isGuest ? 'guest' : 'authenticated');
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.isAuth) {
        tokenStore.set(null);
        try {
          await createGuest();
          return;
        } catch {
          setStatus('offline');
          setError('Cannot reach the frontier network');
          return;
        }
      }
      setStatus('offline');
      setError(caught instanceof Error ? caught.message : 'Unknown error');
    }
  }, [createGuest]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const boot = async () => {
      if (tokenStore.access() || tokenStore.refresh()) {
        await refresh();
        // A stale token that cannot be refreshed falls back to a fresh guest.
        if (tokenStore.access()) return;
      }
      try {
        await createGuest();
      } catch (caught) {
        setStatus('offline');
        setError(caught instanceof Error ? caught.message : 'Cannot reach the frontier network');
      }
    };

    void boot();
  }, [refresh, createGuest]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await api.login({ email, password });
      setIdentity(response.player, response.tokens);
      return response.player;
    },
    [setIdentity],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName?: string; handle?: string }) => {
      const response = await api.register({ ...input, acceptTerms: true });
      setIdentity(response.player, response.tokens);
      return response.player;
    },
    [setIdentity],
  );

  /** Convert the current guest into a permanent account. */
  const linkAccount = useCallback(
    async (input: { email: string; password: string }) => {
      const response = await api.upgrade({ ...input, acceptTerms: true });
      setIdentity(response.player, response.tokens);
      return response.player;
    },
    [setIdentity],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    tokenStore.set(null);
    setPlayer(null);
    setStatus('loading');
    try {
      await createGuest();
    } catch {
      setStatus('offline');
    }
  }, [createGuest]);

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(
    async (patch) => {
      const updated = await api.updateMe(patch);
      setPlayer(updated);
    },
    [],
  );

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    tokenStore.set(null);
    setPlayer(null);
    setStatus('loading');
    await createGuest().catch(() => setStatus('offline'));
  }, [createGuest]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      player,
      error,
      isOffline: status === 'offline',
      isGuest: status === 'guest',
      isAdmin: player?.role === 'admin' || player?.role === 'moderator',
      refresh,
      signIn,
      signUp,
      linkAccount,
      signOut,
      updateProfile,
      setIdentity,
      deleteAccount,
    }),
    [status, player, error, refresh, signIn, signUp, linkAccount, signOut, updateProfile, setIdentity, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
