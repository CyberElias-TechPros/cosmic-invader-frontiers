/**
 * Shared, isomorphic game core.
 *
 * The exact same module graph runs in the browser (Vite) and inside the
 * Cloudflare Worker (wrangler/esbuild) which is what makes server-side replay
 * verification possible. Keep it free of DOM, Node and network APIs.
 */
export * from './config';
export * from './types';
export * from './rng';
export * from './waves';
export * from './sim';
export * from './replay';
export * from './achievements';
export * from './progression';
export * from './daily';
export { ENGINE_VERSION as GAME_ENGINE_VERSION } from './config';
