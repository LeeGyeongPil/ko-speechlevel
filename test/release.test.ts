import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { checkRelease } from '../scripts/check-release.mjs';

interface Result {
  ok: boolean;
  problems: string[];
  lines: string[];
}
const run = checkRelease as (root: string, options?: Record<string, unknown>) => Result;

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

interface Parts {
  version?: string;
  lockVersion?: string;
  lockRootVersion?: string;
  changelog?: string;
  readme?: string;
}

/** A fake project folder in a temp directory; the real repository is never inspected. */
function project(parts: Parts = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'ksl-release-'));
  dirs.push(root);
  const v = parts.version ?? '1.2.3';
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: v }));
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify({ name: 'x', version: parts.lockVersion ?? v, packages: { '': { name: 'x', version: parts.lockRootVersion ?? v } } }),
  );
  writeFileSync(join(root, 'CHANGELOG.md'), parts.changelog ?? `# Changelog\n\n## [Unreleased]\n\n## [${v}] - 2026-11-11\n\n- change\n\n## [1.0.0] - 2026-01-01\n`);
  writeFileSync(join(root, 'README.md'), parts.readme ?? `Install: npm install github:o/x#v${v}\n`);
  return root;
}

const opts = { skipCli: true };

describe('check-release rules', () => {
  it('passes when every file agrees', () => {
    const result = run(project(), opts);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.lines[0]).toBe('release ok: 1.2.3 (package.json, package-lock.json, CHANGELOG, README)');
    expect(result.lines[1]).toBe('tags: skipped (no git)');
  });

  it('rejects a version that is not X.Y.Z', () => {
    const result = run(project({ version: '1.2' }), opts);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/not X\.Y\.Z/);
  });

  it('catches a stale lock file version and root package entry', () => {
    const result = run(project({ lockVersion: '1.2.2', lockRootVersion: '1.2.1' }), opts);
    expect(result.problems.join('\n')).toMatch(/"version" is 1\.2\.2/);
    expect(result.problems.join('\n')).toMatch(/packages\[""\]\.version is 1\.2\.1/);
  });

  it('catches a CHANGELOG whose top release is another version', () => {
    const result = run(project({ changelog: '## [Unreleased]\n\n## [1.2.2] - 2026-11-10\n' }), opts);
    expect(result.problems.join('\n')).toMatch(/top release is \[1\.2\.2\], expected \[1\.2\.3\]/);
  });

  it('catches a CHANGELOG heading without a date and a non-empty [Unreleased]', () => {
    const noDate = run(project({ changelog: '## [Unreleased]\n\n## [1.2.3]\n' }), opts);
    expect(noDate.problems.join('\n')).toMatch(/YYYY-MM-DD/);
    const filled = run(project({ changelog: '## [Unreleased]\n\n- later\n\n## [1.2.3] - 2026-11-11\n' }), opts);
    expect(filled.problems.join('\n')).toMatch(/\[Unreleased\] must be empty/);
  });

  it('catches every wrong version notation in the README but ignores other packages', () => {
    const readme = 'a#v1.2.2 b ko-speechlevel@1.2.1 c v1.2.0 d promptfoo@0.125.1 e vitest 5.1.0 f #v1.2.3\n';
    const result = run(project({ readme }), opts);
    expect(result.problems).toHaveLength(3);
    expect(result.problems.join('\n')).not.toMatch(/0\.125\.1|5\.1\.0/);
  });

  it('requires the example manifests to be gone', () => {
    const root = project();
    mkdirSync(join(root, 'examples', 'promptfoo'), { recursive: true });
    writeFileSync(join(root, 'examples', 'promptfoo', 'package.json'), '{}');
    expect(run(root, opts).problems.join('\n')).toMatch(/examples\/promptfoo\/package\.json must not exist/);
  });

  it('runs dist/cli.js --version when the CLI is not skipped', () => {
    const root = project();
    expect(run(root).problems.join('\n')).toMatch(/dist\/cli\.js is missing/);
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'cli.js'), "console.log('1.2.2');\n");
    expect(run(root).problems.join('\n')).toMatch(/--version prints "1\.2\.2", expected 1\.2\.3/);
    writeFileSync(join(root, 'dist', 'cli.js'), "console.log('1.2.3');\n");
    expect(run(root).ok).toBe(true);
  });
});

function git(root: string, ...args: string[]): { status: number | null; stdout: string } {
  const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });
  return { status: r.status, stdout: r.stdout.trim() };
}

describe('check-release git rules', () => {
  const hasGit = spawnSync('git', ['--version']).status === 0;

  it.skipIf(!hasGit)('checks tags: missing, on HEAD, moved, too high, wrong --tag', () => {
    const root = project();
    git(root, 'init', '-q');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
    git(root, 'tag', 'v1.0.0');
    git(root, 'tag', 'v1.2.2');

    const notYet = run(root, opts);
    expect(notYet.problems).toEqual([]);
    expect(notYet.lines).toEqual(['release ok: 1.2.3 (package.json, package-lock.json, CHANGELOG, README)', 'tag v1.2.3: not created yet']);
    expect(run(root, { ...opts, requireTag: true }).problems.join('\n')).toMatch(/tag v1\.2\.3 does not exist yet/);
    expect(run(root, { ...opts, tag: 'v1.2.4' }).problems.join('\n')).toMatch(/the tag must be v1\.2\.3/);

    git(root, 'tag', 'v1.2.3');
    const onHead = run(root, { ...opts, tag: 'v1.2.3', requireTag: true });
    expect(onHead.problems).toEqual([]);
    expect(onHead.lines[0]).toMatch(/tag v1\.2\.3 -> HEAD; older tags: v1\.0\.0 v1\.2\.2$/);

    writeFileSync(join(root, 'notes.txt'), 'more');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'later');
    expect(run(root, opts).problems.join('\n')).toMatch(/tag v1\.2\.3 points to .*not HEAD/);

    git(root, 'tag', 'v1.3.0');
    expect(run(root, opts).problems.join('\n')).toMatch(/tag v1\.3\.0 is not lower than version 1\.2\.3/);
  });

  it.skipIf(!hasGit)('rejects tracked node_modules paths and files over 1 MiB', () => {
    const root = project();
    mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'dep', 'index.js'), '1');
    writeFileSync(join(root, 'big.bin'), Buffer.alloc(1024 * 1024 + 1));
    git(root, 'init', '-q');
    git(root, 'add', '-A', '-f');
    git(root, 'commit', '-q', '-m', 'init');
    const text = run(root, opts).problems.join('\n');
    expect(text).toMatch(/node_modules\/dep\/index\.js: node_modules must not be tracked/);
    expect(text).toMatch(/big\.bin: tracked file is over 1 MiB/);
  });
});
