/**
 * Client-side mirrors of the API contracts.
 *
 * These mirror `backend/src/routes/*` responses 1:1; when a route changes the
 * type change here forces every consumer to be revisited.
 */
import type { AchievementCategory, AchievementTier } from '../../shared/game/achievements';
import type { DailyChallenge } from '../../shared/game/daily';
import type { DifficultyConfig, GameMode } from '../../shared/game/config';
import type { PlayerTotals, ProgressionSnapshot } from '../../shared/game/progression';

export interface Preferences {
  theme?: string;
  sound?: boolean;
  music?: boolean;
  reducedMotion?: boolean;
  screenShake?: boolean;
  assistMode?: boolean;
  defaultDifficulty?: 'cadet' | 'pilot' | 'ace' | 'legend';
  showDamageNumbers?: boolean;
}

export interface PublicPlayer {
  id: string;
  handle: string;
  displayName: string;
  avatarSeed: number;
  isGuest: boolean;
  role: 'player' | 'moderator' | 'admin';
  xp: number;
  level: number;
  rank: string;
  insignia: string;
  country: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface PrivatePlayer extends PublicPlayer {
  email: string | null;
  emailVerified: boolean;
  preferences: Preferences;
  progression: ProgressionSnapshot;
  stats: PlayerTotals;
  achievementsUnlocked: number;
  achievementPoints?: number;
  achievementPointsMax?: number;
  totals?: PlayerTotals;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: string;
  refreshExpiresIn: number;
}

export interface AuthResponse {
  player: PrivatePlayer;
  tokens: Tokens;
}

export interface AppConfig {
  engineVersion: string;
  replayFormat: number;
  arena: { width: number; height: number };
  maxRunTicks: number;
  apiVersion: string;
  environment: string;
  ingestEnabled: boolean;
  difficulty: DifficultyConfig[];
  modes: Array<{ id: GameMode; label: string; blurb: string; difficultyLocked?: string }>;
  daily: DailyChallenge;
  season: { id: number; name: string; theme: string | null; startsAt: string; endsAt: string; status: string } | null;
  achievements: { total: number };
  links: { site: string; api: string | null };
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  handle: string;
  displayName: string;
  avatarSeed: number;
  isGuest: boolean;
  level: number;
  score: number;
  wave: number;
  accuracy: number;
  durationMs: number;
  runId: string;
  mode: string;
  difficulty: string;
  achievedAt: string;
}

export interface LeaderboardResponse {
  board: string;
  period: string;
  label: string;
  entries: LeaderboardEntry[];
  me: { rank: number; total: number; score: number; percentile: number } | null;
}

export interface BoardSummary {
  board: string;
  period: string;
  label: string;
  mode: string;
  difficulty: string;
  entrants: number;
}

export interface Placement {
  rank: number;
  total: number;
  score: number;
  percentile: number;
  neighbours: LeaderboardEntry[];
}

export interface DailySummaryResponse {
  challenge: DailyChallenge;
  participants: number;
  topScore: number | null;
  isToday: boolean;
  todayKey: string;
  leaderboard: LeaderboardEntry[];
  myResult: { score: number; wave: number; run_id: string; completed_at: string; bonus_xp: number } | null;
  myRank: { rank: number; total: number } | null;
  history: Array<{ key: string; participants: number; topScore: number | null }>;
}

export interface GlobalStats {
  players: number;
  runsSubmitted: number;
  totalScore: number;
  bestScore: number;
  totalKills: number;
  totalBossKills: number;
  totalPlayMs: number;
  runsToday: number;
  pilotsToday: number;
  dailiesCompleted: number;
  verifiedRuns: number;
  rejectedSubmissions: number;
  pilotsOnline: number;
}

export interface StoredRun {
  id: string;
  mode: string;
  difficulty: string;
  assist: boolean;
  ranked: boolean;
  score: number;
  wave: number;
  ticks: number;
  durationMs: number;
  kills: number;
  bossKills: number;
  ufosDestroyed: number;
  maxCombo: number;
  livesLost: number;
  accuracy: number;
  seed: number;
  engine: string;
  checksum: string;
  xpAwarded: number;
  dailyKey: string | null;
  createdAt: string;
}

export interface SubmitRunResult {
  run: StoredRun;
  verification: { ms: number; ticks: number; endReason: string };
  ranking: {
    board: string;
    period: string;
    label: string;
    rank: number | null;
    total: number | null;
    percentile: number | null;
    personalBest: boolean;
  };
  xp: { awarded: number; bonus: number; total: number; level: number; levelUp: boolean; previousLevel: number };
  achievements: Array<{ id: string; name: string; description: string; tier: AchievementTier; points: number }>;
  daily: { key: string; parScore: number; bonusAwarded: number; participants: number } | null;
  flags: string[];
}

export interface AchievementView {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
  points: number;
  hidden: boolean;
  unlocked?: boolean;
  unlockedAt?: string | null;
  progress?: { value: number; target: number } | null;
}

export interface RunDetailResponse {
  run: StoredRun;
  player: { id: string; handle: string; displayName: string; avatarSeed: number; isGuest: boolean; xp: number };
  replayAvailable: boolean;
  shareUrl: string;
}

export interface PublicProfileResponse {
  player: PublicPlayer;
  progression: ProgressionSnapshot;
  totals: PlayerTotals;
  achievementsUnlocked: number;
  globalRank: { rank: number; total: number; percentile: number } | null;
  recentRuns: Array<{
    id: string;
    mode: string;
    difficulty: string;
    score: number;
    wave: number;
    accuracy: number;
    duration_ms: number;
    created_at: string;
  }>;
}

export interface SpotlightResponse {
  top: LeaderboardEntry[];
  feed: Array<{ id: string; handle: string; display_name: string; score: number; wave: number; mode: string; created_at: string }>;
}

export interface SessionInfo {
  id: string;
  device: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
}

export interface CloudSave<T = unknown> {
  payload: T | null;
  version: number;
  checksum?: string | null;
  device?: string | null;
  updatedAt: string | null;
  status?: 'stored' | 'conflict' | 'identical';
  current?: T;
}

export interface AdminOverview {
  counts: {
    players: number;
    guests: number;
    registered: number;
    runs: number;
    rejected: number;
    openReports: number;
    unrankedRuns: number;
    achievementUnlocks: number;
    dailyResults: number;
  };
  recentRejections: Array<{ reason: string; detail: string | null; claimed_score: number | null; created_at: string }>;
  reports: Array<{ id: number; run_id: string; reason: string; status: string; created_at: string }>;
  audit: Array<{ action: string; target_type: string | null; target_id: string | null; created_at: string }>;
  config: {
    environment: string;
    ingestEnabled: boolean;
    sessionSecretSource: string;
    maxReplayTicks: string;
  };
}

/**
 * Admin rows are returned exactly as D1 produces them (snake_case, 0/1 flags).
 * Mapping them in the browser would hide the fact that these are raw records,
 * and moderators need to see what the database actually holds.
 */
export interface AdminRejectionRow {
  id: number;
  player_id: string;
  reason: string;
  detail: string | null;
  claimed_score: number | null;
  mode: string;
  difficulty: string;
  created_at: string;
}

export interface AdminRunRow {
  id: string;
  player_id: string;
  handle: string | null;
  mode: string;
  difficulty: string;
  score: number;
  wave: number;
  accuracy: number;
  ranked: number;
  replay_key: string | null;
  created_at: string;
}

export interface AdminPlayerRow {
  id: string;
  handle: string;
  display_name: string;
  email: string | null;
  is_guest: number;
  banned: number;
  xp: number;
  created_at: string;
  last_seen_at: string;
}

export interface AdminReportRow {
  id: number;
  run_id: string;
  reason: string;
  detail: string | null;
  status: string;
  created_at: string;
  score: number | null;
  player_id: string | null;
  handle: string | null;
}

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: string | null;
  created_at: string;
}
