#!/usr/bin/env node
/**
 * Make a fresh clone runnable without a manual setup step.
 *
 * `backend/.dev.vars` is git-ignored (it holds secrets), so it is missing on a
 * clean checkout, in CI and after a `git clean`. The Worker falls back to an
 * insecure development signing key when `SESSION_SECRET` is absent, but
 * `ADMIN_BOOTSTRAP_TOKEN` has no fallback — without it the operator bootstrap
 * endpoint disables itself and the admin flows are unreachable.
 *
 * This script creates the file from `backend/.dev.vars.example` when it does
 * not exist and never touches an existing one.
 *
 *   node scripts/ensure-dev-vars.mjs            # create if missing
 *   node scripts/ensure-dev-vars.mjs --print-token
 *
 * `--print-token` also prints the resolved bootstrap token on stdout (used by
 * the end-to-end suite so it always knows how to promote a test operator).
 * Progress notices go to stderr so `--print-token` stdout stays machine-clean.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const varsPath = path.join(root, 'backend', '.dev.vars');
const examplePath = path.join(root, 'backend', '.dev.vars.example');

/** Parse wrangler's dotenv-style file: KEY="value" */
function parseVars(source) {
  const out = {};
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

if (!existsSync(varsPath)) {
  if (!existsSync(examplePath)) {
    console.error('[dev-vars] backend/.dev.vars.example is missing — cannot generate local secrets');
    process.exit(1);
  }
  copyFileSync(examplePath, varsPath);
  console.error('[dev-vars] created backend/.dev.vars from the example (git-ignored, local only)');
}

if (process.argv.includes('--print-token')) {
  const vars = parseVars(readFileSync(varsPath, 'utf8'));
  process.stdout.write(vars.ADMIN_BOOTSTRAP_TOKEN ?? '');
}
