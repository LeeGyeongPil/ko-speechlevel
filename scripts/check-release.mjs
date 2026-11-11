// Release consistency check (never publishes, never creates tags).
// Verifies that package.json, package-lock.json, CHANGELOG, README and `--version` agree on one
// version, that git tags are consistent with it, and that the repository stays small and clean.
//
// Usage: node scripts/check-release.mjs [--tag vX.Y.Z] [--require-tag]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_TRACKED_BYTES = 1024 * 1024;

function parse(v) {
  const m = SEMVER.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative when a < b. Both are "X.Y.Z" strings. */
function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

function readJson(file, problems) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`cannot read ${file}: ${error.message}`);
    return null;
  }
}

/**
 * Check one repository folder. Returns `{ ok, problems, lines }`.
 * Options: `tag` (expected tag, e.g. "v0.1.2"), `requireTag`, `skipCli` (do not run dist/cli.js), `skipGit`.
 */
export function checkRelease(root, options = {}) {
  const problems = [];
  const lines = [];

  // (a) package.json version
  const pkg = readJson(join(root, 'package.json'), problems);
  const version = pkg?.version;
  if (typeof version !== 'string' || !parse(version)) {
    problems.push(`package.json: version "${version}" is not X.Y.Z; use a plain semver such as 0.1.2`);
    return { ok: false, problems, lines };
  }

  // (b) lock file
  const lock = readJson(join(root, 'package-lock.json'), problems);
  if (lock) {
    if (lock.version !== version) problems.push(`package-lock.json: "version" is ${lock.version}, expected ${version}; run "npm install --package-lock-only"`);
    const rootEntry = lock.packages?.[''];
    if (rootEntry?.version !== version) problems.push(`package-lock.json: packages[""].version is ${rootEntry?.version}, expected ${version}`);
  }

  // (b) CHANGELOG: top release heading and an empty [Unreleased]
  try {
    const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
    const headings = [...changelog.matchAll(/^## \[([^\]]+)\](.*)$/gm)];
    const releases = headings.filter((h) => h[1] !== 'Unreleased');
    const top = releases[0];
    if (!top) problems.push('CHANGELOG.md: no release heading like "## [0.1.2] - 2026-11-11"');
    else if (top[1] !== version) problems.push(`CHANGELOG.md: top release is [${top[1]}], expected [${version}]`);
    else if (!/^ - \d{4}-\d{2}-\d{2}\s*$/.test(top[2])) problems.push(`CHANGELOG.md: heading for [${version}] needs " - YYYY-MM-DD"`);
    const unreleased = headings.find((h) => h[1] === 'Unreleased');
    if (unreleased) {
      const start = unreleased.index + unreleased[0].length;
      const next = headings.find((h) => h.index > unreleased.index);
      const body = changelog.slice(start, next ? next.index : undefined).trim();
      if (body) problems.push('CHANGELOG.md: [Unreleased] must be empty at release time; move its entries under the new version');
    }
  } catch (error) {
    problems.push(`cannot read CHANGELOG.md: ${error.message}`);
  }

  // (b) README: every version notation (#vX.Y.Z, ko-speechlevel@X.Y.Z, bare vX.Y.Z)
  try {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const pattern = /ko-speechlevel@(\d+\.\d+\.\d+)|#v(\d+\.\d+\.\d+)|(?<![\w@/.#-])v(\d+\.\d+\.\d+)/g;
    for (const m of readme.matchAll(pattern)) {
      const found = m[1] ?? m[2] ?? m[3];
      if (found !== version) problems.push(`README.md: mentions version ${found} ("${m[0]}"), expected ${version}`);
    }
  } catch (error) {
    problems.push(`cannot read README.md: ${error.message}`);
  }

  // (b) CLI --version
  if (!options.skipCli) {
    const cli = join(root, 'dist', 'cli.js');
    if (!existsSync(cli)) problems.push('dist/cli.js is missing; run "npm run build" first');
    else {
      const r = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8', timeout: 30_000 });
      const printed = (r.stdout ?? '').trim();
      if (printed !== version) problems.push(`cli --version prints "${printed}", expected ${version}`);
    }
  }

  // (e) example manifests must not come back
  for (const name of ['package.json', 'package-lock.json']) {
    if (existsSync(join(root, 'examples', 'promptfoo', name))) {
      problems.push(`examples/promptfoo/${name} must not exist; the example runs through a pinned npx instead`);
    }
  }

  // (c) (d) (e) git parts
  const hasGit = !options.skipGit && existsSync(join(root, '.git')) && git(root, ['rev-parse', '--git-dir']) !== null;
  let tagLine = 'tags: skipped (no git)';
  if (hasGit) {
    const expected = `v${version}`;
    if (options.tag && options.tag !== expected) {
      problems.push(`release tag is ${options.tag} but package.json says ${version}; the tag must be ${expected}`);
    }
    const tags = (git(root, ['tag', '--list', 'v*']) ?? '').split('\n').filter(Boolean);
    const older = tags.filter((t) => t !== expected && parse(t.slice(1)));
    for (const t of older) {
      if (compare(t.slice(1), version) >= 0) problems.push(`tag ${t} is not lower than version ${version}; bump package.json above every existing tag`);
    }
    if (tags.includes(expected)) {
      const target = git(root, ['rev-list', '-n', '1', expected]);
      const head = git(root, ['rev-parse', 'HEAD']);
      if (target !== head) problems.push(`tag ${expected} points to ${target?.slice(0, 7)}, not HEAD ${head?.slice(0, 7)}; never move a published tag, bump the version instead`);
      tagLine = `tag ${expected} -> HEAD; older tags: ${older.sort((a, b) => compare(a.slice(1), b.slice(1))).join(' ') || '(none)'}`;
    } else if (options.requireTag) {
      problems.push(`tag ${expected} does not exist yet (--require-tag)`);
    } else {
      tagLine = `tag ${expected}: not created yet`;
    }
    const files = (git(root, ['ls-files']) ?? '').split('\n').filter(Boolean);
    for (const f of files) {
      if (f.split('/').includes('node_modules')) problems.push(`${f}: node_modules must not be tracked`);
      else if (existsSync(join(root, f)) && statSync(join(root, f)).size > MAX_TRACKED_BYTES) problems.push(`${f}: tracked file is over 1 MiB`);
    }
  }

  if (problems.length === 0) {
    const summary = `release ok: ${version} (package.json, package-lock.json, CHANGELOG, README${options.skipCli ? '' : ', cli'})`;
    if (tagLine.startsWith('tag v') && tagLine.includes('->')) lines.push(`${summary} ${tagLine}`);
    else lines.push(summary, tagLine);
  }
  return { ok: problems.length === 0, problems, lines };
}

// ---- command line -----------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const options = { requireTag: argv.includes('--require-tag') };
  const at = argv.indexOf('--tag');
  if (at !== -1) {
    options.tag = argv[at + 1];
    if (!options.tag) {
      console.error('error: --tag needs a value, e.g. --tag v0.1.2');
      process.exit(2);
    }
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = checkRelease(root, options);
  for (const line of result.lines) console.log(line);
  for (const problem of result.problems) console.error(`release problem: ${problem}`);
  process.exit(result.ok ? 0 : 1);
}
