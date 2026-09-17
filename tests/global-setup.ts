import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

/**
 * Boots `wrangler dev` (workerd + local D1/KV/R2/DO/Queues) for the API
 * end-to-end suite. Migrations are applied to the local D1 instance first so
 * the tests always run against the real schema.
 */

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.E2E_API_PORT ?? 8788);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Hermetic local state for the suite.
 *
 * Wrangler normally persists to `backend/.wrangler`, which is shared with
 * `npm run dev` and kept between runs. That is fine for development but makes
 * a test run inherit whatever the last one left behind — most visibly the
 * per-IP guest quota (60/hour), which fails unrelated tests once a few runs
 * happen within the hour. The suite therefore gets its own storage directory
 * that is deleted before every run, so each run starts from an empty D1/KV/R2.
 */
const PERSIST_DIR = path.join(ROOT, 'backend', '.wrangler-e2e');

let server: ChildProcess | null = null;

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
    child.on('error', reject);
  });
}

async function waitForHealth(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/v1/health`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await delay(1000);
  }
  throw new Error(`API did not become healthy at ${BASE_URL} within ${timeoutMs}ms`);
}

/**
 * The Worker reads `backend/.dev.vars` (git-ignored, so absent on a clean
 * checkout and in CI). Generate it from the example when missing, then hand the
 * resolved bootstrap token to the tests so operator flows never depend on a
 * hard-coded local secret.
 */
function ensureDevVars(): void {
  const token = execFileSync('node', ['scripts/ensure-dev-vars.mjs', '--print-token'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();

  if (!token) {
    throw new Error('ADMIN_BOOTSTRAP_TOKEN is empty in backend/.dev.vars — admin e2e tests cannot promote a user');
  }
  process.env.E2E_BOOTSTRAP_TOKEN = token;
}

export default async function setup() {
  ensureDevVars();

  // Start from a clean slate: no leftover players, runs, KV counters or R2
  // objects from a previous run.
  rmSync(PERSIST_DIR, { recursive: true, force: true });

  await run('npx', [
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'cosmic-invader-frontiers',
    '--local',
    '--persist-to',
    PERSIST_DIR,
    '--config',
    'backend/wrangler.toml',
  ]);

  server = spawn(
    'npx',
    [
      'wrangler',
      'dev',
      '--config',
      'backend/wrangler.toml',
      '--port',
      String(PORT),
      '--ip',
      '127.0.0.1',
      '--local',
      '--persist-to',
      PERSIST_DIR,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own process group so teardown can kill wrangler + its workerd child.
      detached: true,
    },
  );

  server.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (/error|Error|ERROR/.test(text)) process.stderr.write(`[wrangler] ${text}`);
  });
  server.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[wrangler] ${chunk.toString()}`));

  await waitForHealth();

  return async () => {
    if (!server || server.killed) return;
    const pid = server.pid;
    try {
      if (pid) process.kill(-pid, 'SIGTERM');
      else server.kill('SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
    await delay(1200);
    try {
      if (pid) process.kill(-pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  };
}

export { BASE_URL, PORT };
