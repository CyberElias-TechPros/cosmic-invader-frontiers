import type { Env } from '../env';
import type { ReplayPayload } from '../../../shared/game/replay';

/**
 * Verified replays are archived to R2 so they can be re-verified later (the
 * nightly integrity audit re-runs a random sample) and replayed in the browser.
 */

export function replayKey(playerId: string, runId: string): string {
  return `replays/${playerId}/${runId}.json.gz`;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface StoreReplayResult {
  key: string;
  bytes: number;
}

export async function storeReplay(
  env: Env,
  playerId: string,
  runId: string,
  payload: ReplayPayload,
): Promise<StoreReplayResult | null> {
  try {
    const body = JSON.stringify({
      format: 'cif-replay',
      storedAt: new Date().toISOString(),
      payload,
    });
    const compressed = await gzip(body);
    const key = replayKey(playerId, runId);
    await env.REPLAYS.put(key, compressed, {
      httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
      customMetadata: {
        runId,
        playerId,
        engine: payload.engine,
        mode: payload.mode,
        score: String(payload.claims.score),
      },
    });
    return { key, bytes: compressed.byteLength };
  } catch (error) {
    console.warn('[replays] archive failed', (error as Error).message);
    return null;
  }
}

export async function loadReplay(env: Env, key: string): Promise<ReplayPayload | null> {
  const object = await env.REPLAYS.get(key);
  if (!object) return null;
  const stream = object.body.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  const parsed = JSON.parse(text) as { payload?: ReplayPayload };
  return parsed.payload ?? null;
}

export async function deleteReplay(env: Env, key: string): Promise<void> {
  await env.REPLAYS.delete(key).catch(() => undefined);
}

/** Retention sweep: delete replay archives older than the retention window. */
export async function pruneReplays(env: Env, retentionDays = 180): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const rows = await env.DB.prepare(
    `SELECT id, replay_key FROM runs WHERE replay_key IS NOT NULL AND created_at < ? LIMIT 500`,
  )
    .bind(cutoff)
    .all<{ id: string; replay_key: string }>();

  const stale = rows.results ?? [];
  if (stale.length === 0) return 0;

  await env.REPLAYS.delete(stale.map((row) => row.replay_key));
  const statements = stale.map((row) =>
    env.DB.prepare(`UPDATE runs SET replay_key = NULL WHERE id = ?`).bind(row.id),
  );
  await env.DB.batch(statements);
  return stale.length;
}
