import type { Env } from '../env';

/**
 * KV cache-aside helpers.
 *
 * Every read is best-effort: a KV failure must never take an API request down,
 * so errors degrade to "cache miss" and the caller recomputes.
 */

export async function cacheGet<T>(env: Env, key: string): Promise<T | null> {
  try {
    const raw = await env.CACHE.get(key, 'text');
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('[cache] get failed', key, (error as Error).message);
    return null;
  }
}

export async function cacheSet<T>(env: Env, key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await env.CACHE.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSeconds) });
  } catch (error) {
    console.warn('[cache] set failed', key, (error as Error).message);
  }
}

export async function cacheDelete(env: Env, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      env.CACHE.delete(key).catch((error) => console.warn('[cache] delete failed', key, (error as Error).message)),
    ),
  );
}

export interface CachedResult<T> {
  value: T;
  cached: boolean;
}

export async function withCache<T>(
  env: Env,
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<CachedResult<T>> {
  const hit = await cacheGet<T>(env, key);
  if (hit !== null) return { value: hit, cached: true };
  const value = await loader();
  await cacheSet(env, key, value, ttlSeconds);
  return { value, cached: false };
}

/** Versioned cache keys — bump the version to invalidate a whole namespace. */
export const CACHE_KEYS = {
  leaderboard: (board: string, period: string, page: number, pageSize: number) =>
    `lb:v2:${board}:${period}:${page}:${pageSize}`,
  leaderboardAround: (board: string, period: string, playerId: string) =>
    `lb:v2:around:${board}:${period}:${playerId}`,
  globalStats: () => 'stats:v2:global',
  dailyChallenge: (key: string) => `daily:v2:${key}`,
  playerProfile: (playerId: string) => `player:v2:${playerId}`,
  publicProfile: (handle: string) => `profile:v2:${handle}`,
  config: () => 'config:v2',
  achievements: () => 'achievements:v2',
  season: () => 'season:v2:active',
} as const;

export const TTL = {
  leaderboard: 45,
  aroundMe: 30,
  globalStats: 120,
  daily: 300,
  player: 45,
  publicProfile: 60,
  config: 120,
  achievements: 600,
  season: 600,
} as const;
