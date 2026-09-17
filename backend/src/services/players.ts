import type { Env, PlayerRole } from '../env';
import { all, count, execute, first, stmt } from '../lib/db';
import { CACHE_KEYS, TTL, cacheDelete, cacheGet, cacheSet, withCache } from '../lib/cache';
import {
  hashPassword,
  newId,
  normalizeHandle,
  nowIso,
  randomBytes,
  randomCallsign,
  sanitizeText,
} from '../lib/core';
import { ApiError } from '../lib/http';
import { EMPTY_TOTALS, progressionFromXp, type PlayerTotals } from '../../../shared/game/progression';
import { ACHIEVEMENT_INDEX } from '../../../shared/game/achievements';

export interface PlayerRow {
  id: string;
  handle: string;
  handle_lower: string;
  display_name: string;
  email: string | null;
  email_verified: number;
  password_hash: string | null;
  password_salt: string | null;
  password_algo: string | null;
  password_iter: number | null;
  is_guest: number;
  role: PlayerRole;
  xp: number;
  avatar_seed: number;
  country: string | null;
  preferences: string;
  banned: number;
  ban_reason: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface PlayerStatsRow {
  player_id: string;
  games_played: number;
  runs_submitted: number;
  best_score: number;
  total_score: number;
  total_kills: number;
  total_boss_kills: number;
  total_ufos: number;
  best_wave: number;
  best_combo: number;
  best_accuracy: number;
  total_play_ms: number;
  powerups_collected: number;
  dailies_completed: number;
  daily_streak: number;
  last_daily_key: string | null;
  gauntlet_bosses: number;
  ace_runs: number;
  legend_runs: number;
  updated_at: string;
}

/* ------------------------------- reads ----------------------------------- */

export async function getPlayerById(env: Env, id: string, useCache = true): Promise<PlayerRow | null> {
  if (useCache) {
    const cached = await cacheGet<PlayerRow>(env, CACHE_KEYS.playerProfile(id));
    if (cached) return cached;
  }
  const row = await first<PlayerRow>(env, `SELECT * FROM players WHERE id = ?`, id);
  if (row && useCache) await cacheSet(env, CACHE_KEYS.playerProfile(id), row, TTL.player);
  return row ?? null;
}

export async function getPlayerByHandle(env: Env, handle: string): Promise<PlayerRow | null> {
  return first<PlayerRow>(env, `SELECT * FROM players WHERE handle_lower = ?`, normalizeHandle(handle));
}

export async function getPlayerByEmail(env: Env, email: string): Promise<PlayerRow | null> {
  return first<PlayerRow>(env, `SELECT * FROM players WHERE email = ?`, email.trim().toLowerCase());
}

export async function getPlayerStats(env: Env, playerId: string): Promise<PlayerStatsRow> {
  const row = await first<PlayerStatsRow>(env, `SELECT * FROM player_stats WHERE player_id = ?`, playerId);
  if (row) return row;
  const timestamp = nowIso();
  await execute(
    env,
    `INSERT OR IGNORE INTO player_stats (player_id, updated_at) VALUES (?, ?)`,
    playerId,
    timestamp,
  );
  return {
    player_id: playerId,
    games_played: 0,
    runs_submitted: 0,
    best_score: 0,
    total_score: 0,
    total_kills: 0,
    total_boss_kills: 0,
    total_ufos: 0,
    best_wave: 0,
    best_combo: 0,
    best_accuracy: 0,
    total_play_ms: 0,
    powerups_collected: 0,
    dailies_completed: 0,
    daily_streak: 0,
    last_daily_key: null,
    gauntlet_bosses: 0,
    ace_runs: 0,
    legend_runs: 0,
    updated_at: timestamp,
  };
}

export async function getUnlockedAchievementIds(env: Env, playerId: string): Promise<string[]> {
  const rows = await all<{ achievement_id: string }>(
    env,
    `SELECT achievement_id FROM player_achievements WHERE player_id = ?`,
    playerId,
  );
  return rows.map((row) => row.achievement_id);
}

export async function getAchievementUnlocks(
  env: Env,
  playerId: string,
): Promise<Array<{ id: string; unlockedAt: string; runId: string | null }>> {
  const rows = await all<{ achievement_id: string; unlocked_at: string; run_id: string | null }>(
    env,
    `SELECT achievement_id, unlocked_at, run_id FROM player_achievements WHERE player_id = ? ORDER BY unlocked_at DESC`,
    playerId,
  );
  return rows.map((row) => ({ id: row.achievement_id, unlockedAt: row.unlocked_at, runId: row.run_id }));
}

/* ------------------------------ creation --------------------------------- */

async function uniqueHandle(env: Env, base: string): Promise<string> {
  let attempt = normalizeHandle(base) || `pilot${randomBytes(2).join('')}`;
  if (attempt.length < 3) attempt = `pilot${attempt}`.slice(0, 20);
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? attempt : `${attempt.slice(0, 16)}${(randomBytes(1)[0] % 900) + 10}`;
    const existing = await first<{ id: string }>(env, `SELECT id FROM players WHERE handle_lower = ?`, candidate.toLowerCase());
    if (!existing) return candidate;
  }
  return `${attempt.slice(0, 12)}${Date.now().toString(36).slice(-4)}`;
}

export interface CreatePlayerOptions {
  isGuest: boolean;
  email?: string | null;
  password?: string | null;
  displayName?: string | null;
  handle?: string | null;
  ipHash?: string | null;
  device?: string | null;
  role?: PlayerRole;
}

export async function createPlayer(env: Env, options: CreatePlayerOptions): Promise<PlayerRow> {
  const id = newId('ply_');
  const time = nowIso();
  const displayName = sanitizeText(options.displayName?.trim() || randomCallsign(), 24);
  const handle = await uniqueHandle(env, options.handle ?? displayName);

  let passwordHash: string | null = null;
  let passwordSalt: string | null = null;
  let passwordAlgo: string | null = null;
  let passwordIter: number | null = null;

  if (options.password) {
    const hashed = await hashPassword(options.password);
    passwordHash = hashed.hash;
    passwordSalt = hashed.salt;
    passwordAlgo = hashed.algo;
    passwordIter = hashed.iterations;
  }

  const preferences = JSON.stringify({ theme: 'dark', sound: true, music: true, screenShake: true });

  try {
    await execute(
      env,
      `INSERT INTO players (id, handle, handle_lower, display_name, email, password_hash, password_salt, password_algo,
        password_iter, is_guest, role, xp, avatar_seed, preferences, created_at, updated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      id,
      handle,
      handle.toLowerCase(),
      displayName,
      options.email ? options.email.trim().toLowerCase() : null,
      passwordHash,
      passwordSalt,
      passwordAlgo,
      passwordIter,
      options.isGuest ? 1 : 0,
      options.role ?? 'player',
      randomBytes(2)[0] % 9999,
      preferences,
      time,
      time,
      time,
    );
  } catch (error) {
    const message = (error as Error).message ?? '';
    if (message.includes('players_email_unique') || message.includes('UNIQUE constraint failed: players.email')) {
      throw ApiError.conflict('An account already exists for that email address');
    }
    if (message.includes('players.handle_lower')) {
      throw ApiError.conflict('That callsign is already taken');
    }
    throw error;
  }

  await execute(env, `INSERT OR IGNORE INTO player_stats (player_id, updated_at) VALUES (?, ?)`, id, time);

  const player = await getPlayerById(env, id, false);
  if (!player) throw new ApiError('internal_error', 'Player creation failed');
  return player;
}

/** Promote a guest account in place, preserving every stat and achievement. */
export async function upgradeGuest(
  env: Env,
  playerId: string,
  input: { email: string; password: string; displayName?: string; handle?: string },
): Promise<PlayerRow> {
  const player = await getPlayerById(env, playerId, false);
  if (!player) throw ApiError.notFound('Player not found');
  if (!player.is_guest) throw ApiError.conflict('This account is already registered');

  const existing = await getPlayerByEmail(env, input.email);
  if (existing && existing.id !== playerId) throw ApiError.conflict('An account already exists for that email address');

  const hashed = await hashPassword(input.password);
  const handle = input.handle ? await uniqueHandle(env, input.handle) : player.handle;

  await execute(
    env,
    `UPDATE players SET email = ?, password_hash = ?, password_salt = ?, password_algo = ?, password_iter = ?,
      is_guest = 0, handle = ?, handle_lower = ?, display_name = ?, updated_at = ? WHERE id = ?`,
    input.email.trim().toLowerCase(),
    hashed.hash,
    hashed.salt,
    hashed.algo,
    hashed.iterations,
    handle,
    handle.toLowerCase(),
    sanitizeText(input.displayName ?? player.display_name, 24),
    nowIso(),
    playerId,
  );

  await invalidatePlayer(env, playerId);
  const updated = await getPlayerById(env, playerId, false);
  if (!updated) throw new ApiError('internal_error', 'Upgrade failed');
  return updated;
}

export async function updatePlayer(
  env: Env,
  playerId: string,
  patch: { displayName?: string; handle?: string; avatarSeed?: number; preferences?: Record<string, unknown> },
): Promise<PlayerRow> {
  const player = await getPlayerById(env, playerId, false);
  if (!player) throw ApiError.notFound('Player not found');

  let handle = player.handle;
  if (patch.handle && normalizeHandle(patch.handle) !== player.handle_lower) {
    handle = await uniqueHandle(env, patch.handle);
  }

  const preferences = patch.preferences
    ? JSON.stringify({ ...(JSON.parse(player.preferences || '{}') as Record<string, unknown>), ...patch.preferences })
    : player.preferences;

  await execute(
    env,
    `UPDATE players SET display_name = ?, handle = ?, handle_lower = ?, avatar_seed = ?, preferences = ?, updated_at = ? WHERE id = ?`,
    patch.displayName ? sanitizeText(patch.displayName, 24) : player.display_name,
    handle,
    handle.toLowerCase(),
    patch.avatarSeed ?? player.avatar_seed,
    preferences,
    nowIso(),
    playerId,
  );

  await invalidatePlayer(env, playerId);
  const updated = await getPlayerById(env, playerId, false);
  if (!updated) throw new ApiError('internal_error', 'Profile update failed');
  return updated;
}

export async function touchPlayer(env: Env, playerId: string): Promise<void> {
  await execute(env, `UPDATE players SET last_seen_at = ? WHERE id = ?`, nowIso(), playerId);
}

export async function invalidatePlayer(env: Env, playerId: string): Promise<void> {
  await cacheDelete(env, [CACHE_KEYS.playerProfile(playerId)]);
}

/** GDPR-style hard delete. Sessions, runs, saves and achievements cascade. */
export async function deletePlayer(env: Env, playerId: string): Promise<void> {
  await execute(env, `DELETE FROM players WHERE id = ?`, playerId);
  await invalidatePlayer(env, playerId);
}

export async function countPlayers(env: Env): Promise<number> {
  return count(env, `SELECT COUNT(*) AS n FROM players`);
}

/* ------------------------------- views ----------------------------------- */

export interface PublicPlayerView {
  id: string;
  handle: string;
  displayName: string;
  avatarSeed: number;
  isGuest: boolean;
  role: PlayerRole;
  xp: number;
  level: number;
  rank: string;
  insignia: string;
  country: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export function toPublicPlayer(player: PlayerRow): PublicPlayerView {
  const progression = progressionFromXp(player.xp);
  return {
    id: player.id,
    handle: player.handle,
    displayName: player.display_name,
    avatarSeed: player.avatar_seed,
    isGuest: player.is_guest === 1,
    role: player.role,
    xp: player.xp,
    level: progression.level,
    rank: progression.rank,
    insignia: progression.insignia,
    country: player.country,
    createdAt: player.created_at,
    lastSeenAt: player.last_seen_at,
  };
}

export function toPrivatePlayer(player: PlayerRow, stats: PlayerStatsRow) {
  const progression = progressionFromXp(player.xp);
  return {
    ...toPublicPlayer(player),
    email: player.email,
    emailVerified: player.email_verified === 1,
    preferences: safeJson<Record<string, unknown>>(player.preferences, {}),
    progression,
    stats: toTotals(stats),
    achievementsUnlocked: 0,
  };
}

export function toTotals(stats: PlayerStatsRow): PlayerTotals {
  return {
    gamesPlayed: stats.games_played,
    runsSubmitted: stats.runs_submitted,
    bestScore: stats.best_score,
    totalScore: stats.total_score,
    totalKills: stats.total_kills,
    totalBossKills: stats.total_boss_kills,
    totalUfosDestroyed: stats.total_ufos,
    bestWave: stats.best_wave,
    bestCombo: stats.best_combo,
    bestAccuracy: stats.best_accuracy,
    totalPlayMs: stats.total_play_ms,
    powerupsCollected: stats.powerups_collected,
    dailiesCompleted: stats.dailies_completed,
    dailyStreak: stats.daily_streak,
    bossRushClears: stats.gauntlet_bosses,
    aceRuns: stats.ace_runs,
    legendRuns: stats.legend_runs,
  };
}

export function emptyTotals(): PlayerTotals {
  return { ...EMPTY_TOTALS };
}

export function achievementCatalogView(unlocked: string[]) {
  const set = new Set(unlocked);
  return Object.values(ACHIEVEMENT_INDEX).map((achievement) => ({
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    category: achievement.category,
    tier: achievement.tier,
    points: achievement.points,
    hidden: achievement.hidden ?? false,
    unlocked: set.has(achievement.id),
  }));
}

export function safeJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------ data export ------------------------------ */

export async function exportPlayerData(env: Env, playerId: string) {
  const player = await getPlayerById(env, playerId, false);
  if (!player) throw ApiError.notFound('Player not found');
  const stats = await getPlayerStats(env, playerId);
  const runs = await all(
    env,
    `SELECT id, mode, difficulty, score, wave, kills, boss_kills, accuracy, duration_ms, created_at, ranked
     FROM runs WHERE player_id = ? ORDER BY created_at DESC LIMIT 500`,
    playerId,
  );
  const achievements = await getAchievementUnlocks(env, playerId);
  const save = await first<{ payload: string; version: number; updated_at: string }>(
    env,
    `SELECT payload, version, updated_at FROM saves WHERE player_id = ?`,
    playerId,
  );
  const dailyResults = await all(
    env,
    `SELECT daily_key, score, wave, completed_at FROM daily_results WHERE player_id = ? ORDER BY daily_key DESC LIMIT 400`,
    playerId,
  );

  return {
    exportedAt: nowIso(),
    account: { ...toPrivatePlayer(player, stats), password_hash: undefined, password_salt: undefined },
    runs,
    achievements,
    dailyResults,
    cloudSave: save ? { ...save, payload: safeJson(save.payload, null) } : null,
  };
}

/* ------------------------------ cloud saves ------------------------------ */

export async function getCloudSave(env: Env, playerId: string) {
  const row = await first<{ payload: string; version: number; checksum: string | null; device: string | null; updated_at: string }>(
    env,
    `SELECT payload, version, checksum, device, updated_at FROM saves WHERE player_id = ?`,
    playerId,
  );
  if (!row) return null;
  return {
    payload: safeJson<Record<string, unknown>>(row.payload, {}),
    version: row.version,
    checksum: row.checksum,
    device: row.device,
    updatedAt: row.updated_at,
  };
}

export interface SaveWriteResult {
  status: 'stored' | 'conflict' | 'identical';
  version: number;
  updatedAt: string;
  current?: unknown;
}

/**
 * Optimistic-concurrency cloud save.
 *
 * The client sends the version it based its save on; if the stored version has
 * moved on we return the server copy as a conflict instead of silently
 * clobbering another device's progress.
 */
export async function putCloudSave(
  env: Env,
  playerId: string,
  input: { payload: string; version?: number; device?: string; checksum: string },
): Promise<SaveWriteResult> {
  const existing = await first<{ version: number; checksum: string | null; payload: string; updated_at: string }>(
    env,
    `SELECT version, checksum, payload, updated_at FROM saves WHERE player_id = ?`,
    playerId,
  );
  const timestamp = nowIso();

  if (!existing) {
    await execute(
      env,
      `INSERT INTO saves (player_id, payload, version, checksum, device, updated_at) VALUES (?, ?, 1, ?, ?, ?)`,
      playerId,
      input.payload,
      input.checksum,
      input.device ?? null,
      timestamp,
    );
    return { status: 'stored', version: 1, updatedAt: timestamp };
  }

  if (existing.checksum && existing.checksum === input.checksum) {
    return { status: 'identical', version: existing.version, updatedAt: existing.updated_at };
  }

  const expected = input.version ?? existing.version;
  if (expected !== existing.version) {
    return {
      status: 'conflict',
      version: existing.version,
      updatedAt: existing.updated_at,
      current: safeJson<Record<string, unknown>>(existing.payload, {}),
    };
  }

  const nextVersion = existing.version + 1;
  await execute(
    env,
    `UPDATE saves SET payload = ?, version = ?, checksum = ?, device = ?, updated_at = ? WHERE player_id = ?`,
    input.payload,
    nextVersion,
    input.checksum,
    input.device ?? null,
    timestamp,
    playerId,
  );
  await execute(
    env,
    `INSERT INTO save_history (player_id, version, payload, device, created_at) VALUES (?, ?, ?, ?, ?)`,
    playerId,
    existing.version,
    existing.payload,
    input.device ?? null,
    timestamp,
  );
  // Keep only the last 10 revisions per player.
  await execute(
    env,
    `DELETE FROM save_history WHERE player_id = ? AND id NOT IN (
       SELECT id FROM save_history WHERE player_id = ? ORDER BY version DESC LIMIT 10
     )`,
    playerId,
    playerId,
  );

  return { status: 'stored', version: nextVersion, updatedAt: timestamp };
}

export async function cachedPlayerProfile<T>(env: Env, key: string, loader: () => Promise<T>) {
  const result = await withCache(env, key, TTL.publicProfile, loader);
  return result;
}

export { stmt, nowIso };
