#!/usr/bin/env node
/**
 * Reset the local Cloudflare development state.
 *
 *   npm run dev:reset
 *
 * Deleting `backend/.wrangler` drops the local D1 database, KV cache, R2
 * bucket, queue contents and Durable Object storage in one step, then the
 * migrations are replayed so the environment is immediately usable again.
 *
 * This is the supported way to clear stale rate-limit counters, seed data or a
 * corrupted local cache between test runs. It never touches production
 * resources — `--remote` is deliberately not used anywhere in this script.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(root, 'backend', '.wrangler');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log(`→ removing local state: ${path.relative(root, stateDir)}`);
if (existsSync(stateDir)) rmSync(stateDir, { recursive: true, force: true });
else console.log('  (nothing to remove)');

console.log('→ applying D1 migrations to the fresh local database');
execFileSync(npm, ['run', 'db:migrate:local'], { cwd: root, stdio: 'inherit' });

console.log('\n✓ local Cloudflare state reset. Start the stack with `npm run dev:all`.');
