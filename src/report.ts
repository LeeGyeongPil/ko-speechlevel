import type { CheckResult, SentenceResult } from './types.js';

/** One checked piece of text: a whole file, or one record/message of a JSONL log. */
export interface CheckEntry {
  file: string;
  /** 1-based JSONL line number. */
  line?: number;
  /** Index into `messages[]` for chat-log records. */
  message?: number;
  result: CheckResult;
}

export interface AnalyzeEntry {
  file: string;
  line?: number;
  message?: number;
  sentences: SentenceResult[];
}

export function entryLabel(entry: { file: string; line?: number; message?: number }): string {
  if (entry.line === undefined) return entry.file;
  return `${entry.file}:${entry.line}${entry.message === undefined ? '' : `#${entry.message}`}`;
}

function totalSentences(result: CheckResult): number {
  return Object.values(result.counts).reduce((a, b) => a + b, 0);
}

function pad(value: string, width: number, right = false): string {
  return right ? value.padStart(width) : value.padEnd(width);
}

/** File table, then one line per violation, then a one-line summary. */
export function formatCheckTable(entries: CheckEntry[]): string {
  if (entries.length === 0) return 'no text to check\n';
  const labels = entries.map(entryLabel);
  const width = Math.max(4, ...labels.map((l) => l.length));
  const lines = [
    `${pad('file', width)}  sentences  judged  violations  score  result`,
    ...entries.map((entry, i) => {
      const r = entry.result;
      return [
        pad(labels[i] ?? '', width),
        pad(String(totalSentences(r)), 9, true),
        pad(String(r.judged), 6, true),
        pad(String(r.violations.length), 10, true),
        pad(r.score.toFixed(2), 5, true),
        r.pass ? 'pass' : 'FAIL',
      ].join('  ');
    }),
  ];
  const violationLines: string[] = [];
  entries.forEach((entry, i) => {
    for (const v of entry.result.violations) {
      const where = entry.line === undefined ? `${labels[i]}:${v.line}:${v.column}` : `${labels[i]}`;
      const suffix = entry.line === undefined ? '' : `  (${v.line}:${v.column})`;
      violationLines.push(`${where} [${v.level}] ${v.text}${suffix}`);
    }
  });
  if (violationLines.length > 0) lines.push('', ...violationLines);
  const failed = entries.filter((e) => !e.result.pass).length;
  const expect = entries[0]?.result.expect ?? 'polite';
  lines.push('', `${entries.length} checked, ${failed} failed (expect ${expect})`);
  return `${lines.join('\n')}\n`;
}

export function formatCheckJson(entries: CheckEntry[]): string {
  const out = entries.map((e) => ({
    file: e.file,
    ...(e.line !== undefined ? { line: e.line } : {}),
    ...(e.message !== undefined ? { message: e.message } : {}),
    ...e.result,
  }));
  return `${JSON.stringify(out, null, 2)}\n`;
}

function shorten(text: string, max = 48): string {
  const flat = text.replace(/\s+/g, ' ');
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat;
}

export function formatAnalyzeTable(entries: AnalyzeEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(`== ${entryLabel(entry)} ==`, 'line:col   level     ending  skipped  text');
    for (const s of entry.sentences) {
      lines.push(
        `${pad(`${s.line}:${s.column}`, 9)}  ${pad(s.level, 8)}  ${pad(s.ending, 6)}  ${pad(s.skipped ?? '-', 7)}  ${shorten(s.text)}`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}`;
}

export function formatAnalyzeJson(entries: AnalyzeEntry[]): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}
