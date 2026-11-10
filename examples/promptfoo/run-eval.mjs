// Runs `promptfoo eval` with the echo provider and prints a one-line verdict.
// promptfoo exits non-zero when a test fails, which is expected here, so the result file decides.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const bin = join(dir, 'node_modules', '.bin', 'promptfoo');
const resultFile = join(dir, 'result.json');

const run = spawnSync(
  bin,
  ['eval', '-c', 'promptfooconfig.yaml', '--no-cache', '--no-write', '-o', 'result.json'],
  {
    cwd: dir,
    encoding: 'utf8',
    timeout: 240_000,
    env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1' },
  },
);
if (run.error) {
  console.error(`could not run promptfoo: ${run.error.message}. Did you run "npm install" in this folder?`);
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
