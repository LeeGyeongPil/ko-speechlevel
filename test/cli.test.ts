import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROOT } from './support.ts';

const CLI = join(ROOT, 'dist', 'cli.js');
const POLITE = 'examples/answers/polite.md';
const MIXED = 'examples/answers/mixed.md';

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run the built CLI in a child process. Every call has a hard timeout of 10 seconds. */
function cli(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10_000,
    ...(input !== undefined ? { input } : {}),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Input errors must be exactly one "error:" line and never a stack trace. */
function expectCleanError(run: Run, pattern: RegExp): void {
  expect(run.status).toBe(2);
  const lines = run.stderr.split('\n').filter((l) => l.trim() !== '');
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^error: /);
  expect(lines[0]).toMatch(pattern);
  expect(run.stderr).not.toMatch(/^\s+at /m);
  expect(run.stderr).not.toMatch(/Error:|node:internal/);
}

beforeAll(() => {
  // `npm test` builds first (pretest). When this file runs alone, build once if dist is missing.
  if (!existsSync(CLI)) {
    const built = spawnSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], { cwd: ROOT, timeout: 120_000 });
    expect(built.status).toBe(0);
  }
}, 150_000);

describe('cli check', () => {
  it('prints a table for several files and exits 1 when one has violations', () => {
    const run = cli(['check', POLITE, MIXED, '--expect', 'polite']);
    expect(run.status).toBe(1);
    expect(run.stderr).toBe('');
    expect(run.stdout).toMatch(/examples\/answers\/polite\.md\s+7\s+5\s+0\s+1\.00\s+pass/);
    expect(run.stdout).toMatch(/examples\/answers\/mixed\.md\s+6\s+4\s+1\s+0\.75\s+FAIL/);
    expect(run.stdout).toContain('examples/answers/mixed.md:17:1 [hae] 그다음 서버를 다시 켜면 돼.');
    expect(run.stdout).not.toContain('polite.md:');
    expect(run.stdout).toContain('2 checked, 1 failed (expect polite)');
  });

  it('exits 0 for a polite file only, and for violations with --exit-zero', () => {
    expect(cli(['check', POLITE]).status).toBe(0);
    const zero = cli(['check', POLITE, MIXED, '--exit-zero']);
    expect(zero.status).toBe(0);
    expect(zero.stdout).toContain('mixed.md:17:1 [hae]');
  });

  it('--format json prints an array with one entry per file', () => {
    const run = cli(['check', POLITE, MIXED, '--format', 'json']);
    expect(run.status).toBe(1);
    const data = JSON.parse(run.stdout) as { file: string; pass: boolean; score: number; violations: { start: number; end: number; line: number; column: number; text: string }[] }[];
    expect(data.map((d) => d.file)).toEqual([POLITE, MIXED]);
    expect(data.map((d) => d.pass)).toEqual([true, false]);
    expect(data[1]?.score).toBe(0.75);
    expect(data[1]?.violations).toHaveLength(1);
    expect(data[1]?.violations[0]).toMatchObject({ line: 17, column: 1, text: '그다음 서버를 다시 켜면 돼.' });
  });

  it('reads standard input for "-"', () => {
    const run = cli(['check', '-', '--expect', 'polite'], '설치합니다. 켜면 돼.\n');
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('<stdin>:1:');
    expect(cli(['check', '-'], '끝났습니다.\n').status).toBe(0);
    const both = cli(['check', POLITE, '-', '--format', 'json'], '켜면 돼.');
    expect(JSON.parse(both.stdout).map((e: { file: string }) => e.file)).toEqual([POLITE, '<stdin>']);
  });

  it('supports --expect, --min-score, --include and --skip-lists', () => {
    expect(cli(['check', MIXED, '--min-score', '0.75']).status).toBe(0);
    expect(cli(['check', MIXED, '--expect', 'casual']).status).toBe(1);
    expect(cli(['check', '-', '--include', 'tables'], '| a | 켠다 |').status).toBe(1);
    expect(cli(['check', '-'], '| a | 켠다 |').status).toBe(0);
    expect(cli(['check', '-', '--skip-lists'], '- 켜면 돼.').status).toBe(0);
    expect(cli(['check', '-'], '- 켜면 돼.').status).toBe(1);
  });

  it('analyze lists each sentence with level, ending and skip reason', () => {
    const run = cli(['analyze', 'examples/answers/quoted-source.md']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('== examples/answers/quoted-source.md ==');
    expect(run.stdout).toMatch(/quote/);
    expect(run.stdout).toMatch(/code/);
    expect(run.stdout).toMatch(/heading/);
    const json = JSON.parse(cli(['analyze', MIXED, '--format', 'json']).stdout) as { sentences: { level: string }[] }[];
    expect(json[0]?.sentences.some((s) => s.level === 'hae')).toBe(true);
  });

  it('prints help and version with exit 0', () => {
    expect(cli(['--help']).stdout).toContain('Usage: ko-speechlevel');
    expect(cli(['--version']).stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('cli jsonl', () => {
  it('checks assistant content per line and reports file:line', () => {
    const run = cli(['check', '--jsonl', 'examples/chat.jsonl', '--expect', 'polite']);
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/examples\/chat\.jsonl:2\s+2\s+2\s+0\s+1\.00\s+pass/);
    expect(run.stdout).toMatch(/examples\/chat\.jsonl:3#1\s+2\s+2\s+1\s+0\.50\s+FAIL/);
    expect(run.stdout).toContain('examples/chat.jsonl:3#1 [hae] 먼저 서버를 끄면 돼.');
    // Line 1 is the user turn and is not checked.
    expect(run.stdout).not.toContain('chat.jsonl:1');
  });

  it('warns and skips non-string content without failing', () => {
    const run = cli(['check', '--jsonl', 'examples/chat.jsonl', '--exit-zero']);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe('warning: examples/chat.jsonl: line 4: field "content" is not a string, skipped\n');
  });

  it('supports --field paths and --role', () => {
    const field = cli(['check', '--jsonl', 'test/fixtures/nested.jsonl', '--field', 'reply.text', '--format', 'json']);
    const data = JSON.parse(field.stdout) as { line: number; pass: boolean }[];
    expect(data.map((d) => [d.line, d.pass])).toEqual([[2, false], [4, true]]);
    expect(field.stderr).toContain('line 1: field "reply.text" not found, skipped');
    expect(field.status).toBe(1);

    const user = cli(['check', '--jsonl', 'test/fixtures/nested.jsonl', '--role', 'user', '--expect', 'casual']);
    expect(user.stdout).toContain('test/fixtures/nested.jsonl:1#0');
    expect(user.status).toBe(0);
  });

  it('warns about non-string message content inside messages[]', () => {
    const run = cli(['check', '--jsonl', 'test/fixtures/nested.jsonl', '--exit-zero']);
    expect(run.stderr).toContain('line 1: messages[2].content is not a string, skipped');
  });

  it('a broken JSON line gives one error line and exit 2', () => {
    const run = cli(['check', '--jsonl', 'test/fixtures/bad.jsonl']);
    expectCleanError(run, /^error: test\/fixtures\/bad\.jsonl: line 3: invalid JSON$/);
  });
});

describe('cli errors', () => {
  it('missing file', () => {
    expectCleanError(cli(['check', 'test/fixtures/does-not-exist.md']), /does-not-exist\.md: no such file/);
  });

  it('directory', () => {
    expectCleanError(cli(['check', 'test/fixtures']), /test\/fixtures: is a directory/);
  });

  it('file over --max-bytes', () => {
    expectCleanError(cli(['check', POLITE, '--max-bytes', '10']), /over --max-bytes 10/);
    expect(cli(['check', POLITE, '--max-bytes', '100000']).status).toBe(0);
  });

  it('stdin over --max-bytes', () => {
    expectCleanError(cli(['check', '-', '--max-bytes', '5'], '설치합니다.'), /<stdin>: input is over --max-bytes 5/);
  });

  it('NUL byte (binary file)', () => {
    expectCleanError(cli(['check', 'test/fixtures/nul.dat']), /binary file \(contains a NUL byte\)/);
  });

  it('invalid UTF-8', () => {
    expectCleanError(cli(['check', 'test/fixtures/bad-utf8.dat']), /not valid UTF-8/);
  });

  it('unknown --expect', () => {
    expectCleanError(cli(['check', POLITE, '--expect', 'formal']), /unknown --expect "formal"/);
  });

  it('usage mistakes', () => {
    expectCleanError(cli(['check']), /no input files/);
    expectCleanError(cli([]), /missing command/);
    expectCleanError(cli(['lint', POLITE]), /unknown command "lint"/);
    expectCleanError(cli(['check', POLITE, '--bogus']), /--bogus/);
    expectCleanError(cli(['check', POLITE, '--format', 'xml']), /unknown --format "xml"/);
    expectCleanError(cli(['check', POLITE, '--include', 'lists']), /unknown --include "lists"/);
    expectCleanError(cli(['check', POLITE, '--min-score', '2']), /--min-score must be a number from 0 to 1/);
    expectCleanError(cli(['check', POLITE, '--max-bytes', 'abc']), /--max-bytes must be a positive integer/);
    expectCleanError(cli(['check', POLITE, '--max-bytes']), /--max-bytes/);
  });

  it('a dash-leading option value gets a fix-it hint instead of "ambiguous"', () => {
    const negative = cli(['check', POLITE, '--max-bytes', '-1']);
    expectCleanError(negative, /--max-bytes needs a positive integer, e\.g\. --max-bytes 1048576/);
    expect(negative.stderr).not.toMatch(/ambiguous/);
    expectCleanError(cli(['check', POLITE, '--min-score', '-1']), /--min-score needs a number from 0 to 1, e\.g\. --min-score 0\.8/);
    expectCleanError(cli(['check', POLITE, '--expect', '-x']), /--expect needs one of/);
    expectCleanError(cli(['check', POLITE, '--format', '-x']), /--format needs one of table, json/);
  });

  it('JSONL nested deeper than the limit', () => {
    const deep = `${'['.repeat(500)}${']'.repeat(500)}\n`;
    expectCleanError(cli(['check', '--jsonl', '-'], deep), /<stdin>: line 1: JSON nested deeper than 100 levels/);
  });

  it('one bad file among several: the rest are still checked and the final code is 2', () => {
    const run = cli(['check', POLITE, 'test/fixtures/does-not-exist.md', MIXED, 'test/fixtures/nul.dat']);
    expect(run.status).toBe(2);
    expect(run.stdout).toMatch(/polite\.md\s+7\s+5\s+0\s+1\.00\s+pass/);
    expect(run.stdout).toMatch(/mixed\.md\s+6\s+4\s+1\s+0\.75\s+FAIL/);
    const errors = run.stderr.split('\n').filter(Boolean);
    expect(errors).toHaveLength(2);
    expect(errors.every((l) => l.startsWith('error: '))).toBe(true);
    expect(run.stderr).not.toMatch(/^\s+at /m);
  });

  it('--exit-zero does not hide input errors', () => {
    expect(cli(['check', 'test/fixtures/does-not-exist.md', '--exit-zero']).status).toBe(2);
  });
});
