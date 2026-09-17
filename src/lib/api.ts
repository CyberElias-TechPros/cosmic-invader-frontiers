import type {
  AchievementView,
  AdminPlayerRow,
  AdminRejectionRow,
  AdminReportRow,
  AdminRunRow,
  AuditEntry,
  AdminOverview,
  AppConfig,
  AuthResponse,
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
  Tokens,
} from './types';

/**
 * Typed API client.
 *
 * - Same-origin `/api` by default, so Vite proxies it in development and
 *   Vercel proxies it to the Cloudflare Worker in production (no CORS, no
 *   third-party cookies, no CORS preflight cost).
 * - Set `VITE_API_BASE_URL` to talk to a Worker host directly instead.
 * - Access tokens are short lived; a 401 triggers a single-flight refresh and
 *   the original request is retried once.
 */

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
export const API_BASE = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : '/api';
const VERSIONED = `${API_BASE}/v1`;

const ACCESS_KEY = 'cif.accessToken';
const REFRESH_KEY = 'cif.refreshToken';
const SESSION_KEY = 'cif.sessionId';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isAuth() {
    return this.status === 401;
  }
  get isOffline() {
    return this.status === 0;
  }
  get isRateLimited() {
    return this.status === 429;
  }
}

interface Envelope<T> {
  ok: boolean;
  data: T;
  meta: Record<string, unknown>;
  error?: { code: string; message: string; details?: unknown };
}

/* --------------------------- token plumbing ------------------------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

export const tokenStore = {
  access(): string | null {
    try {
      return localStorage.getItem(ACCESS_KEY);
    } catch {
      return null;
    }
  },
  refresh(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  /** Session id for the current access token — sent with submitted runs so the
   *  server can correlate a score with the session that produced it. */
  sessionId(): string | null {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(tokens: Tokens | null) {
    try {
      if (!tokens) {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(SESSION_KEY);
      } else {
        localStorage.setItem(ACCESS_KEY, tokens.accessToken);
        localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
        localStorage.setItem(SESSION_KEY, tokens.sessionId);
      }
    } catch {
      /* private mode — session just won't persist */
    }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

let refreshInFlight: Promise<Tokens | null> | null = null;

async function refreshTokens(): Promise<Tokens | null> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = tokenStore.refresh();
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${VERSIONED}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        tokenStore.set(null);
        return null;
      }
      const envelope = (await response.json()) as Envelope<{ tokens: Tokens }>;
      tokenStore.set(envelope.data.tokens);
      return envelope.data.tokens;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/* ------------------------------ core request ------------------------------ */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Retry the request once after refreshing tokens (internal). */
  _retried?: boolean;
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${VERSIONED}${path}`;
  const token = options.auth === false ? null : tokenStore.access();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        'X-Client-Version': CLIENT_VERSION,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    window.clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'The request timed out. Check your connection and try again.');
    }
    throw new ApiError(0, 'network_error', 'Cannot reach the frontier network. Check your connection and retry.');
  }
  window.clearTimeout(timeout);

  // Expired access token → refresh once and replay the request.
  if (response.status === 401 && options.auth !== false && !options._retried && tokenStore.refresh()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, _retried: true });
    }
  }

  const text = await response.text();
  let envelope: Envelope<T> | null = null;
  try {
    envelope = text ? (JSON.parse(text) as Envelope<T>) : null;
  } catch {
    envelope = null;
  }

  if (!response.ok || !envelope || envelope.ok === false) {
    const code = envelope?.error?.code ?? `http_${response.status}`;
    const message = envelope?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(response.status, code, message, envelope?.error?.details);
  }

  return envelope.data;
}

export const CLIENT_VERSION =
  (import.meta.env.VITE_CLIENT_VERSION as string | undefined) ?? 'web-1.0.0';

/* -------------------------------- endpoints ------------------------------- */

export const api = {
  health: () => apiRequest<{ status: string; checks: Record<string, { ok: boolean }> }>('/health', { auth: false }),
  config: () => apiRequest<AppConfig>('/config', { auth: false }),
  stats: () => apiRequest<GlobalStats>('/stats', { auth: false }),
  spotlight: () => apiRequest<SpotlightResponse>('/spotlight', { auth: false }),
  achievementCatalog: () => apiRequest<AchievementView[]>('/achievements', { auth: false }),

  guest: (payload: { device?: string; callsign?: string } = {}) =>
    apiRequest<AuthResponse>('/auth/guest', { method: 'POST', body: payload, auth: false }),
  register: (payload: { email: string; password: string; displayName?: string; handle?: string; acceptTerms: true }) =>
    apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload: { email: string; password: string }) =>
    apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: payload, auth: false }),
  logout: () => apiRequest<{ signedOut: boolean }>('/auth/logout', { method: 'POST' }),
  logoutAll: () => apiRequest<{ revokedSessions: number }>('/auth/logout-all', { method: 'POST' }),
  upgrade: (payload: { email: string; password: string; acceptTerms: true; displayName?: string; handle?: string }) =>
    apiRequest<AuthResponse>('/auth/upgrade', { method: 'POST', body: payload }),
  sessions: () => apiRequest<{ sessions: SessionInfo[] }>('/auth/sessions'),
  revokeSession: (id: string) => apiRequest<{ revoked: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  handleAvailable: (handle: string) =>
    apiRequest<{ handle: string; available: boolean; reason?: string }>(
      `/auth/handle-available?handle=${encodeURIComponent(handle)}`,
      { auth: false },
    ),

  me: () => apiRequest<PrivatePlayer>('/me'),
  updateMe: (payload: {
    displayName?: string;
    handle?: string;
    avatarSeed?: number;
    preferences?: Record<string, unknown>;
  }) => apiRequest<PrivatePlayer>('/me', { method: 'PATCH', body: payload }),
  myStats: () => apiRequest<{ totals: PrivatePlayer['stats']; xp: number; progression: PrivatePlayer['progression'] }>('/me/stats'),
  myAchievements: () =>
    apiRequest<{ achievements: AchievementView[]; unlockedCount: number; totalCount: number; points: number; pointsMax: number }>(
      '/me/achievements',
    ),
  myRuns: (params: { page?: number; pageSize?: number; mode?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.mode && params.mode !== 'all') query.set('mode', params.mode);
    return apiRequest<StoredRun[]>(`/me/runs?${query.toString()}`);
  },
  /** Every board this player currently appears on. */
  myPlacements: (params: { mode?: string; difficulty?: string; dailyKey?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.mode) query.set('mode', params.mode);
    if (params.difficulty) query.set('difficulty', params.difficulty);
    if (params.dailyKey) query.set('dailyKey', params.dailyKey);
    return apiRequest<{
      placements: Array<{ board: string; period: string; label: string; rank: number; total: number; score: number; percentile: number }>;
    }>(`/me/placement?${query.toString()}`);
  },
  getSave: () => apiRequest<CloudSave>('/me/save'),
  putSave: (payload: { payload: string; version?: number; device?: string }) =>
    apiRequest<CloudSave>('/me/save', { method: 'PUT', body: payload }),
  exportData: () => apiRequest<Record<string, unknown>>('/me/export'),
  deleteAccount: () => apiRequest<{ deleted: boolean }>('/me?confirm=delete-my-account', { method: 'DELETE' }),
  telemetry: (events: Array<{ name: string; props?: Record<string, unknown>; at?: string }>, sessionId?: string) =>
    apiRequest<{ accepted: number }>('/telemetry', { method: 'POST', body: { events, sessionId } }),

  submitRun: (body: { replay: unknown; dailyKey?: string; sessionId?: string }) =>
    apiRequest<SubmitRunResult>('/runs', { method: 'POST', body, timeoutMs: 30_000 }),
  run: (id: string) => apiRequest<RunDetailResponse>(`/runs/${id}`, { auth: false }),
  runReplay: (id: string) => apiRequest<{ replay: unknown }>(`/runs/${id}/replay`),
  recentRuns: () =>
    apiRequest<Array<{ id: string; score: number; wave: number; mode: string; difficulty: string; handle: string; display_name: string; created_at: string }>>(
      '/runs/recent',
      { auth: false },
    ),
  reportRun: (id: string, reason: string, detail?: string) =>
    apiRequest<{ reported: boolean }>(`/runs/${id}/report`, { method: 'POST', body: { reason, detail } }),

  boards: () => apiRequest<BoardSummary[]>('/boards', { auth: false }),
  leaderboard: (params: { board?: string; mode?: string; difficulty?: string; period?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params.board) query.set('board', params.board);
    if (params.mode) query.set('mode', params.mode);
    if (params.difficulty) query.set('difficulty', params.difficulty);
    if (params.period) query.set('period', params.period);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    return apiRequest<LeaderboardResponse>(`/leaderboard?${query.toString()}`);
  },
  placement: (params: { mode?: string; difficulty?: string; dailyKey?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.mode) query.set('mode', params.mode);
    if (params.difficulty) query.set('difficulty', params.difficulty);
    if (params.dailyKey) query.set('dailyKey', params.dailyKey);
    return apiRequest<{ placement: Placement | null; board: string; label: string }>(`/leaderboard/me?${query.toString()}`);
  },
  /**
   * The daily board is public, but it personalises itself when a token is
   * present (your result + your rank), so the token is attached when the
   * client has one and omitted when it does not.
   */
  daily: (key?: string) =>
    apiRequest<DailySummaryResponse>(`/leaderboard/daily${key ? `?key=${key}` : ''}`),
  publicProfile: (handle: string) => apiRequest<PublicProfileResponse>(`/leaderboard/players/${encodeURIComponent(handle)}`, { auth: false }),

  adminOverview: () => apiRequest<AdminOverview>('/admin/overview'),
  adminRuns: (status: 'rejected' | 'recent' | 'unranked', page = 1) =>
    status === 'rejected'
      ? apiRequest<AdminRejectionRow[]>(`/admin/runs?status=rejected&page=${page}`)
      : apiRequest<AdminRunRow[]>(`/admin/runs?status=${status}&page=${page}`),
  adminPlayers: (query = '') => apiRequest<AdminPlayerRow[]>(`/admin/players?q=${encodeURIComponent(query)}`),
  adminReports: () => apiRequest<AdminReportRow[]>('/admin/reports'),
  adminAction: (body: Record<string, unknown>) =>
    apiRequest<{ ok?: boolean; deleted?: boolean; runId?: string; playerId?: string; banned?: boolean }>(
      '/admin/actions',
      { method: 'POST', body },
    ),
  adminMaintenance: (task: string) =>
    apiRequest<{ task: string; result: unknown }>('/admin/maintenance', { method: 'POST', body: { task } }),
  adminAudit: () => apiRequest<AuditEntry[]>('/admin/audit'),
};

/** Absolute URL for the OG share card of a run. */
export function shareCardUrl(runId: string): string {
  return `${API_BASE}/v1/share/${runId}.svg`;
}

/** WebSocket URL for the realtime leaderboard feed. */
export function realtimeUrl(board: string): string {
  const base = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : window.location.origin;
  const url = new URL(`${base}/v1/realtime/leaderboard`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('board', board);
  return url.toString();
}
