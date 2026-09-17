/** Bindings + configuration available to the API Worker. */
export interface Env {
  // --- bindings (see backend/wrangler.toml) ---
  DB: D1Database;
  CACHE: KVNamespace;
  REPLAYS: R2Bucket;
  LEADERBOARD_HUB: DurableObjectNamespace;
  PRESENCE_HUB: DurableObjectNamespace;
  RUN_QUEUE: Queue<RunQueueMessage>;
  EVENT_QUEUE: Queue<EventQueueMessage>;

  // --- vars ---
  ENVIRONMENT: string;
  API_VERSION: string;
  ALLOWED_ORIGINS: string;
  PUBLIC_SITE_URL: string;
  PUBLIC_API_URL?: string;
  MAX_REPLAY_TICKS: string;
  LEADERBOARD_INGEST_ENABLED: string;
  ADMIN_BOOTSTRAP_TOKEN?: string;

  // --- secrets (wrangler secret / .dev.vars) ---
  SESSION_SECRET?: string;
}

export interface RunQueueMessage {
  kind: 'run.archive' | 'run.postprocess' | 'run.notify';
  runId: string;
  playerId: string;
  board?: string;
  period?: string;
  score?: number;
}

export interface EventQueueMessage {
  kind: 'telemetry.flush' | 'leaderboard.snapshot' | 'integrity.audit';
  payload?: Record<string, unknown>;
}

export type PlayerRole = 'player' | 'moderator' | 'admin';

export interface AuthedPlayer {
  id: string;
  handle: string;
  displayName: string;
  role: PlayerRole;
  isGuest: boolean;
  banned: boolean;
  sessionId: string;
  xp: number;
}

/** Hono context variables. */
export interface Variables {
  requestId: string;
  player: AuthedPlayer | null;
  ipHash: string;
  startedAt: number;
  origin: string | null;
}
