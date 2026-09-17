import type { Env } from '../env';

/** Thin typed helpers over D1 so route code stays readable. */

export async function first<T>(env: Env, sql: string, ...args: unknown[]): Promise<T | null> {
  const stmt = env.DB.prepare(sql).bind(...args);
  const row = await stmt.first<T>();
  return row ?? null;
}

export async function all<T>(env: Env, sql: string, ...args: unknown[]): Promise<T[]> {
  const stmt = env.DB.prepare(sql).bind(...args);
  const result = await stmt.all<T>();
  return result.results ?? [];
}

export async function count(env: Env, sql: string, ...args: unknown[]): Promise<number> {
  const row = await first<{ n: number }>(env, sql, ...args);
  return row?.n ?? 0;
}

export async function execute(env: Env, sql: string, ...args: unknown[]): Promise<D1Result> {
  return env.DB.prepare(sql).bind(...args).run();
}

/** Batched writes run as a single implicit transaction in D1. */
export async function batch(env: Env, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  if (statements.length === 0) return [];
  return env.DB.batch(statements);
}

export function stmt(env: Env, sql: string, ...args: unknown[]): D1PreparedStatement {
  return env.DB.prepare(sql).bind(...args);
}

/** SQLite LIKE escaping so user input cannot broaden a search wildcard. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}
