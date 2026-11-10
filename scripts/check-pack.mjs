// Publish readiness check (never publishes): inspects `npm pack --dry-run --json`,
// confirms there are no runtime dependencies and that every exports path resolves via import().
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const problems = [];

// 1. What would be packed.
const pack = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 120_000,
});
if (pack.status !== 0) {
  console.error(`npm pack failed (exit ${pack.status}):\n${pack.stderr}`);
  process.exit(1);
}
const packed = JSON.parse(pack.stdout)[0].files.map((f) => f.path);
const required = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/adapters/promptfoo.mjs',
  'dist/adapters/vitest.js',
  'dist/cli.js',
  'LICENSE',
  'package.json',
];
for (const file of required) if (!packed.includes(file)) problems.push(`missing from package: ${file}`);
// README is written by the docs step; require it once REQUIRE_README=1 (CI and release set it).
if (!packed.includes('README.md')) {
  if (process.env.REQUIRE_README === '1') problems.push('missing from package: README.md');
  else console.warn('note: README.md not present yet (set REQUIRE_README=1 to require it)');
}
for (const file of packed) {
  if (/^(src|test|examples|scripts)\//.test(file)) problems.push(`unexpected file in package: ${file}`);
}

// 2. No runtime dependencies.
const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length > 0) problems.push(`runtime dependencies must be empty, found: ${deps.join(', ')}`);

// 3. Every exports path resolves (self-reference by package name).
const subpaths = Object.keys(pkg.exports).filter((key) => key !== './package.json');
let resolved = 0;
for (const key of subpaths) {
  const specifier = key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`;
  try {
    // import.meta.resolve with a parent URL inside the package root enables self-referencing.
    const url = import.meta.resolve(specifier, pathToFileURL(join(root, 'scripts', 'x.mjs')).href);
    await import(url);
    resolved += 1;
  } catch (error) {
    problems.push(`exports "${key}" does not resolve: ${error.message}`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`pack check failed: ${p}`);
  process.exit(1);
}
console.log(`pack ok: ${deps.length} runtime deps, exports resolved (${resolved})`);
