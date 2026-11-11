// Runs `promptfoo eval` (pinned version, fetched by npx) with the echo provider and prints a one-line verdict.
// promptfoo exits non-zero when a test fails, which is expected here, so the result file decides.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTFOO = 'promptfoo@0.125.1';
const dir = fileURLToPath(new URL('.', import.meta.url));
const resultFile = join(dir, 'result.json');
if (existsSync(resultFile)) rmSync(resultFile); // never read a stale result

const run = spawnSync(
  'npx',
  ['--yes', PROMPTFOO, 'eval', '-c', 'promptfooconfig.yaml', '--no-cache', '--no-write', '-o', 'result.json'],
  {
    cwd: dir,
    encoding: 'utf8',
    timeout: 300_000,
    env: {
      ...process.env,
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: '1',
      npm_config_update_notifier: 'false', // no "npm notice" lines
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  },
);
if (run.error || !existsSync(resultFile)) {
  const why = run.error ? run.error.message : `no result file, exit ${run.status}: ${(run.stderr ?? '').trim().split('\n').slice(-3).join(' | ')}`;
  console.error(`could not run ${PROMPTFOO} via npx: ${why}. It needs npm registry access and "npm run build" first.`);
  process.exit(2);
}

const data = JSON.parse(readFileSync(resultFile, 'utf8'));
const rows = data.results?.results ?? [];
const passed = rows.filter((r) => r.success).length;
const failed = rows.filter((r) => !r.success);
for (const r of failed) {
  const reason = r.gradingResult?.reason ?? r.error ?? 'unknown';
  console.log(`failed case: ${reason}`);
}
const reasonsHaveOffset = failed.every((r) => /@\d+ \[hae\]/.test(r.gradingResult?.reason ?? ''));
const asExpected = rows.length === 2 && passed === 1 && failed.length === 1 && reasonsHaveOffset;
console.log(`promptfoo: ${passed} passed, ${failed.length} failed${asExpected ? ' (as expected)' : ' (UNEXPECTED)'}`);
process.exit(asExpected ? 0 : 1);
