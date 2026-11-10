#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { analyze } from './analyze.js';
import { check } from './check.js';
import { SpeechLevelInputError } from './errors.js';
import { MAX_JSON_DEPTH, extractTexts, jsonDepth } from './jsonl.js';
import { parseExpect } from './options.js';
import {
  formatAnalyzeJson,
  formatAnalyzeTable,
  formatCheckJson,
  formatCheckTable,
  type AnalyzeEntry,
  type CheckEntry,
} from './report.js';
import type { CheckOptions, Include } from './types.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_WARNINGS_PER_FILE = 20;
const INCLUDE_NAMES = ['tables', 'headings', 'quotes'] as const;

const USAGE = `Usage: ko-speechlevel <check|analyze> <file...> [options]

Checks that Korean text keeps one speech level (polite by default).
Use "-" as a file name to read standard input.

Options:
  --expect <polite|hasipsio|haeyo|casual>   target style (default polite)
  --format <table|json>                     output format (default table)
  --include <tables,headings,quotes>        also judge these normally skipped regions
  --skip-lists                              do not judge list items
  --min-score <0..1>                        lowest passing score (default 1)
  --jsonl                                   inputs are JSON Lines chat logs
  --field <path>                            JSONL field to check (default content)
  --role <name>                             JSONL role to check (default assistant)
  --max-bytes <n>                           largest accepted input (default ${DEFAULT_MAX_BYTES})
  --exit-zero                               exit 0 even when violations are found
  -h, --help | -v, --version

Exit codes: 0 pass, 1 violations found, 2 input or usage error.
`;

class UsageError extends Error {}

interface Io {
  out(text: string): void;
  err(text: string): void;
}

interface Source {
  label: string;
  text: string;
}

/** First line of a message only: the CLI promises one "error:" line and never a stack. */
function oneLine(message: string): string {
  return (message.split('\n')[0] ?? '').trim();
}

/** What each value option needs, shown when its value is missing or starts with a dash. */
const OPTION_NEEDS: Readonly<Record<string, string>> = {
  expect: 'one of polite, hasipsio, haeyo, casual (e.g. --expect polite)',
  format: 'one of table, json (e.g. --format json)',
  include: 'a comma-separated list such as --include tables,quotes',
  'min-score': 'a number from 0 to 1, e.g. --min-score 0.8',
  field: 'a field name, e.g. --field answer',
  role: 'a role name, e.g. --role assistant',
  'max-bytes': 'a positive integer, e.g. --max-bytes 1048576',
};

/** Turn a parseArgs failure into one line that says how to fix the command. */
function usageMessage(error: unknown): string {
  const message = oneLine(error instanceof Error ? error.message : String(error));
  if (errnoCode(error) === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
    const name = message.match(/'--([a-z-]+)'/)?.[1] ?? '';
    const needs = OPTION_NEEDS[name];
    if (needs) return `--${name} needs ${needs}; a value that starts with "-" must be written as --${name}=<value>`;
  }
  return message;
}

function errnoCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : 'unknown';
}

function decode(label: string, buffer: Buffer): Source | string {
  if (buffer.includes(0)) return `${label}: binary file (contains a NUL byte); pass a text file`;
  try {
    return { label, text: new TextDecoder('utf-8', { fatal: true }).decode(buffer) };
  } catch {
    return `${label}: not valid UTF-8; convert the file to UTF-8`;
  }
}

function readFileSource(file: string, maxBytes: number): Source | string {
  let size: number;
  try {
    const st = statSync(file);
    if (st.isDirectory()) return `${file}: is a directory, not a file`;
    if (!st.isFile()) return `${file}: not a regular file`;
    size = st.size;
  } catch (error) {
    return errnoCode(error) === 'ENOENT' ? `${file}: no such file` : `${file}: cannot be read (${errnoCode(error)})`;
  }
  if (size > maxBytes) return `${file}: file is ${size} bytes, over --max-bytes ${maxBytes}`;
  let buffer: Buffer;
  try {
    buffer = readFileSync(file);
  } catch (error) {
    return `${file}: cannot be read (${errnoCode(error)})`;
  }
  if (buffer.length > maxBytes) return `${file}: file is ${buffer.length} bytes, over --max-bytes ${maxBytes}`;
  return decode(file, buffer);
}

async function readStdinSource(maxBytes: number): Promise<Source | string> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of process.stdin) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      total += buf.length;
      if (total > maxBytes) return `<stdin>: input is over --max-bytes ${maxBytes}`;
      chunks.push(buf);
    }
  } catch (error) {
    return `<stdin>: cannot be read (${errnoCode(error)})`;
  }
  return decode('<stdin>', Buffer.concat(chunks));
}

interface Settings {
  command: 'check' | 'analyze';
  files: string[];
  check: CheckOptions;
  format: 'table' | 'json';
  jsonl: boolean;
  field: string;
  fieldGiven: boolean;
  role: string;
  maxBytes: number;
  exitZero: boolean;
}

function parseSettings(argv: string[]): Settings | 'help' | 'version' {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        expect: { type: 'string' },
        format: { type: 'string' },
        include: { type: 'string' },
        'skip-lists': { type: 'boolean' },
        'min-score': { type: 'string' },
        jsonl: { type: 'boolean' },
        field: { type: 'string' },
        role: { type: 'string' },
        'max-bytes': { type: 'string' },
        'exit-zero': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new UsageError(usageMessage(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return 'help';
  if (values.version) return 'version';

  const [command, ...files] = positionals;
  if (command !== 'check' && command !== 'analyze') {
    throw new UsageError(
      command === undefined ? 'missing command; use "check" or "analyze" (see --help)' : `unknown command "${command}"; use "check" or "analyze"`,
    );
  }
  if (files.length === 0) throw new UsageError(`no input files; pass one or more files (or "-" for stdin) after "${command}"`);

  const format = values.format ?? 'table';
  if (format !== 'table' && format !== 'json') throw new UsageError(`unknown --format "${format}"; use table or json`);

  let maxBytes = DEFAULT_MAX_BYTES;
  if (values['max-bytes'] !== undefined) {
    if (!/^[0-9]{1,15}$/.test(values['max-bytes']) || Number(values['max-bytes']) < 1) {
      throw new UsageError(`--max-bytes must be a positive integer, got "${values['max-bytes']}"`);
    }
    maxBytes = Number(values['max-bytes']);
  }

  const include: Include = {};
  if (values.include !== undefined) {
    for (const name of values.include.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!(INCLUDE_NAMES as readonly string[]).includes(name)) {
        throw new UsageError(`unknown --include "${name}"; use ${INCLUDE_NAMES.join(', ')}`);
      }
      include[name as (typeof INCLUDE_NAMES)[number]] = true;
    }
  }
  if (values['skip-lists']) include.lists = false;

  const checkOptions: CheckOptions = { include };
  try {
    checkOptions.expect = parseExpect(values.expect ?? 'polite');
  } catch {
    throw new UsageError(`unknown --expect "${values.expect}"; use polite, hasipsio, haeyo or casual`);
  }
  if (values['min-score'] !== undefined) {
    const n = Number(values['min-score']);
    if (values['min-score'].trim() === '' || !Number.isFinite(n) || n < 0 || n > 1) {
      throw new UsageError(`--min-score must be a number from 0 to 1, got "${values['min-score']}"`);
    }
    checkOptions.minScore = n;
  }

  return {
    command,
    files,
    check: checkOptions,
    format,
    jsonl: values.jsonl === true,
    field: values.field ?? 'content',
    fieldGiven: values.field !== undefined,
    role: values.role ?? 'assistant',
    maxBytes,
    exitZero: values['exit-zero'] === true,
  };
}

function packageVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    return String((JSON.parse(raw) as { version?: unknown }).version ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

/** Run the CLI. Returns the exit code; never throws for user mistakes. */
async function run(argv: string[], io: Io): Promise<number> {
  let settings: Settings | 'help' | 'version';
  try {
    settings = parseSettings(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`error: ${error.message}\n`);
      return 2;
    }
    throw error;
  }
  if (settings === 'help') {
    io.out(USAGE);
    return 0;
  }
  if (settings === 'version') {
    io.out(`${packageVersion()}\n`);
    return 0;
  }

  let hadError = false;
  const checkEntries: CheckEntry[] = [];
  const analyzeEntries: AnalyzeEntry[] = [];

  const fail = (message: string): void => {
    hadError = true;
    io.err(`error: ${oneLine(message)}\n`);
  };

  /** Run check or analyze on one piece of text; input errors become an "error:" line. */
  const handle = (label: string, text: string, where: { line?: number; message?: number }): void => {
    try {
      if (settings.command === 'check') {
        checkEntries.push({ file: label, ...where, result: check(text, settings.check) });
      } else {
        const sentences = analyze(text, settings.check.include ? { include: settings.check.include } : {});
        analyzeEntries.push({ file: label, ...where, sentences });
      }
    } catch (error) {
      if (error instanceof SpeechLevelInputError) {
        const prefix = where.line === undefined ? label : `${label}: line ${where.line}`;
        fail(`${prefix}: ${error.message}`);
        return;
      }
      throw error;
    }
  };

  for (const file of settings.files) {
    const source = file === '-' ? await readStdinSource(settings.maxBytes) : readFileSource(file, settings.maxBytes);
    if (typeof source === 'string') {
      fail(source);
      continue;
    }
    if (!settings.jsonl) {
      handle(source.label, source.text, {});
      continue;
    }
    processJsonl(source, settings, handle, fail, io);
  }

  if (settings.command === 'check') {
    io.out(settings.format === 'json' ? formatCheckJson(checkEntries) : formatCheckTable(checkEntries));
  } else {
    io.out(settings.format === 'json' ? formatAnalyzeJson(analyzeEntries) : formatAnalyzeTable(analyzeEntries));
  }

  if (hadError) return 2;
  if (settings.command === 'check' && !settings.exitZero && checkEntries.some((e) => !e.result.pass)) return 1;
  return 0;
}

/** Check each record of a JSONL file. One broken line fails the whole file with a single error line. */
function processJsonl(
  source: Source,
  settings: Settings,
  handle: (label: string, text: string, where: { line?: number; message?: number }) => void,
  fail: (message: string) => void,
  io: Io,
): void {
  const pending: { text: string; line: number; message?: number }[] = [];
  const warnings: string[] = [];
  const lines = source.text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '') continue;
    const lineNo = i + 1;
    let record: unknown;
    if (jsonDepth(raw) > MAX_JSON_DEPTH) {
      fail(`${source.label}: line ${lineNo}: JSON nested deeper than ${MAX_JSON_DEPTH} levels`);
      return;
    }
    try {
      record = JSON.parse(raw);
    } catch {
      fail(`${source.label}: line ${lineNo}: invalid JSON`);
      return;
    }
    const { units, warnings: w } = extractTexts(record, settings.field, settings.fieldGiven, settings.role);
    for (const message of w) warnings.push(`warning: ${source.label}: line ${lineNo}: ${message}\n`);
    for (const unit of units) {
      pending.push({ text: unit.text, line: lineNo, ...(unit.index !== undefined ? { message: unit.index } : {}) });
    }
  }
  for (const text of warnings.slice(0, MAX_WARNINGS_PER_FILE)) io.err(text);
  if (warnings.length > MAX_WARNINGS_PER_FILE) {
    io.err(`warning: ${source.label}: ${warnings.length - MAX_WARNINGS_PER_FILE} more warnings not shown\n`);
  }
  for (const item of pending) {
    handle(source.label, item.text, { line: item.line, ...(item.message !== undefined ? { message: item.message } : {}) });
  }
}

const io: Io = {
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
};

// Broken pipes (for example `| head`) are not our error.
process.stdout.on('error', () => undefined);

run(process.argv.slice(2), io).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Last resort: still one line, no stack trace.
    io.err(`error: unexpected failure: ${oneLine(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 2;
  },
);
