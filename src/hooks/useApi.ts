import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api, ApiError, realtimeUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type {
  AchievementView,
  AppConfig,
  BoardSummary,
  CloudSave,
  DailySummaryResponse,
  GlobalStats,
  LeaderboardResponse,
  Placement,
  PrivatePlayer,
  PublicProfileResponse,
  RunDetailResponse,
  SessionInfo,
  SpotlightResponse,
  StoredRun,
  SubmitRunResult,
} from '@/lib/types';

/** Shared defaults: numbers change constantly, so keep them fresh but cached. */
const LIVE = { staleTime: 20_000, refetchOnWindowFocus: true } as const;
const STATIC = { staleTime: 5 * 60_000 } as const;

export function useConfig() {
  return useQuery<AppConfig>({ queryKey: ['config'], queryFn: () => api.config(), ...STATIC });
}

export function useGlobalStats() {
  return useQuery<GlobalStats>({ queryKey: ['stats'], queryFn: () => api.stats(), ...LIVE });
}

export function useSpotlight() {
  return useQuery<SpotlightResponse>({ queryKey: ['spotlight'], queryFn: () => api.spotlight(), ...LIVE });
}

export function useBoards() {
  return useQuery<BoardSummary[]>({ queryKey: ['boards'], queryFn: () => api.boards(), staleTime: 60_000 });
}

export function useLeaderboard(params: {
  board?: string;
  mode?: string;
  difficulty?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', params],
    queryFn: () => api.leaderboard(params),
    placeholderData: (previous) => previous,
    ...LIVE,
  });
}

/**
 * Placement on one specific board. Returns null (rather than throwing) when the
 * player has no verified run yet — that is a normal state, not an error.
 */
export function useMyPlacement(params: { mode?: string; difficulty?: string; dailyKey?: string } = {}) {
  const { status } = useAuth();
  return useQuery<Placement | null>({
    queryKey: ['placement', params],
    queryFn: async () => {
      const response = await api.placement(params);
      return response.placement;
    },
    enabled: status === 'guest' || status === 'authenticated',
    staleTime: 45_000,
  });
}

export function useDaily(key?: string) {
  return useQuery<DailySummaryResponse>({
    queryKey: ['daily', key ?? 'today'],
    queryFn: () => api.daily(key),
    staleTime: 60_000,
  });
}

export function useAchievementCatalog() {
  return useQuery<AchievementView[]>({
    queryKey: ['achievements', 'catalog'],
    queryFn: () => api.achievementCatalog(),
    ...STATIC,
  });
}

export function useMyAchievements() {
  const { status } = useAuth();
  return useQuery<{ achievements: AchievementView[]; unlocked: number; total: number; points: number; pointsMax: number }>({
    queryKey: ['achievements', 'me'],
    queryFn: async () => {
      const response = await api.myAchievements();
      return {
        achievements: response.achievements,
        unlocked: response.unlockedCount,
        total: response.totalCount,
        points: response.points,
        pointsMax: response.pointsMax,
      };
    },
    enabled: status === 'guest' || status === 'authenticated',
  });
}

export function useMyRuns(page = 1, mode?: string, pageSize = 20) {
  const { status } = useAuth();
  return useQuery<{ runs: StoredRun[]; page: number; pageSize: number; hasMore: boolean }>({
    queryKey: ['runs', 'me', page, mode ?? 'all', pageSize],
    queryFn: async () => {
      const runs = await api.myRuns({ page, pageSize, mode });
      return { runs, page, pageSize, hasMore: runs.length >= pageSize };
    },
    enabled: status === 'guest' || status === 'authenticated',
    placeholderData: (previous) => previous,
  });
}

export function useRun(id: string | undefined) {
  return useQuery<RunDetailResponse>({
    queryKey: ['run', id],
    queryFn: () => api.run(id as string),
    enabled: Boolean(id),
  });
}

export function usePublicProfile(handle: string | undefined) {
  return useQuery<PublicProfileResponse>({
    queryKey: ['pilot', handle],
    queryFn: () => api.publicProfile(handle as string),
    enabled: Boolean(handle),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

export function useSessions() {
  const { status } = useAuth();
  return useQuery<{ sessions: SessionInfo[] }>({
    queryKey: ['sessions'],
    queryFn: () => api.sessions(),
    enabled: status === 'guest' || status === 'authenticated',
  });
}

export function useCloudSave() {
  const { status } = useAuth();
  return useQuery<CloudSave>({
    queryKey: ['save'],
    queryFn: () => api.getSave(),
    enabled: status === 'guest' || status === 'authenticated',
  });
}

/** Submits a verified run and refreshes everything the result can change. */
export function useSubmitRun() {
  const queryClient = useQueryClient();
  return useMutation<
    SubmitRunResult,
    ApiError,
    { replay: unknown; dailyKey?: string | null; sessionId?: string | null }
  >({
    mutationFn: (variables) =>
      api.submitRun({
        replay: variables.replay,
        dailyKey: variables.dailyKey ?? undefined,
        sessionId: variables.sessionId ?? undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      void queryClient.invalidateQueries({ queryKey: ['placement'] });
      void queryClient.invalidateQueries({ queryKey: ['runs', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['achievements', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['daily'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['spotlight'] });
    },
  });
}

export interface BoardFeedItem {
  runId: string;
  handle: string;
  displayName: string | null;
  score: number;
  wave: number;
  at: number;
}

export interface RealtimeState {
  connected: boolean;
  feed: BoardFeedItem[];
  lastEventAt: number | null;
}

/**
 * Live leaderboard feed over the Durable Object WebSocket.
 *
 * Reconnects with backoff and silently degrades to nothing when the endpoint
 * is unavailable — the pages it feeds always render from cached HTTP data, so
 * a dead socket can never leave a user staring at a spinner.
 */
export function useRealtimeBoard(board: string | null): RealtimeState {
  const [state, setState] = useState<RealtimeState>({ connected: false, feed: [], lastEventAt: null });
  const retryRef = useRef(0);

  useEffect(() => {
    if (!board) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let timer: number | null = null;

    const connect = () => {
      if (closed) return;
      try {
        socket = new WebSocket(realtimeUrl(board));
      } catch {
        return;
      }

      socket.onopen = () => {
        retryRef.current = 0;
        setState((current) => ({ ...current, connected: true }));
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            data?: { runId?: string; handle?: string; displayName?: string; score?: number; wave?: number };
          };
          if (payload.type !== 'run' || !payload.data) return;
          const item: BoardFeedItem = {
            runId: String(payload.data.runId ?? ''),
            handle: String(payload.data.handle ?? 'pilot'),
            displayName: payload.data.displayName ?? null,
            score: Number(payload.data.score ?? 0),
            wave: Number(payload.data.wave ?? 0),
            at: Date.now(),
          };
          setState((current) => ({ ...current, feed: [item, ...current.feed].slice(0, 12), lastEventAt: Date.now() }));
        } catch {
          /* ignore malformed frames — the feed is decoration, not data of record */
        }
      };

      const scheduleRetry = () => {
        if (closed) return;
        setState((current) => ({ ...current, connected: false }));
        retryRef.current = Math.min(retryRef.current + 1, 6);
        const delay = Math.min(30_000, 1200 * 2 ** (retryRef.current - 1));
        timer = window.setTimeout(connect, delay);
      };

      socket.onclose = scheduleRetry;
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closed = true;
      if (timer !== null) window.clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        /* already closed */
      }
    };
  }, [board]);

  return state;
}

/** Tiny helper for pages that need a boolean "am I the owner" check. */
export function isOwnProfile(player: PrivatePlayer | null, handle: string | undefined): boolean {
  return Boolean(player && handle && player.handle.toLowerCase() === handle.toLowerCase());
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export type { UseQueryOptions };
