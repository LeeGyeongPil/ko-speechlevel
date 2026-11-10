import { assertText, resolveAnalyzeOptions } from './options.js';
import { Scanner } from './scanner.js';
import type { AnalyzeOptions, SentenceResult } from './types.js';

/**
 * Split `text` into sentences and classify each one. Regions that were left out of judgement
 * (code, quotes, tables, headings, ...) are returned as entries with `skipped` set and level
 * `unknown`, so the output explains why they were not judged. Entries are ordered by `start`.
 */
export function analyze(text: string, options?: AnalyzeOptions): SentenceResult[] {
  const { flags, maxLength } = resolveAnalyzeOptions(options);
  assertText(text, maxLength);
  const out: SentenceResult[] = [];
  const scanner = new Scanner(flags, {
    onSentence: (s) => out.push(s),
    onRegion: (r) => out.push(r),
  });
  scanner.feed(text);
  scanner.finish();
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
