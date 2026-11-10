import { assertText, resolveCheckOptions } from './options.js';
import { Scanner } from './scanner.js';
import { ALLOWED, type CheckOptions, type CheckResult, type Expect, type Level, type SentenceResult } from './types.js';

/** Counts and violations are accumulated sentence by sentence, shared with the stream checker. */
export class Tally {
  readonly counts: Record<Level, number> = { hasipsio: 0, haeyo: 0, hae: 0, haera: 0, nominal: 0, unknown: 0 };
  readonly violations: SentenceResult[] = [];
  judged = 0;

  constructor(private readonly expect: Expect) {}

  /** Record a sentence; returns true when it violates the expected style. */
  add(sentence: SentenceResult): boolean {
    this.counts[sentence.level] += 1;
    if (sentence.level === 'nominal' || sentence.level === 'unknown') return false;
    this.judged += 1;
    if (ALLOWED[this.expect].includes(sentence.level)) return false;
    this.violations.push(sentence);
    return true;
  }

  result(minScore: number): CheckResult {
    const score = this.judged === 0 ? 1 : (this.judged - this.violations.length) / this.judged;
    return {
      expect: this.expect,
      pass: score >= minScore,
      score,
      judged: this.judged,
      counts: { ...this.counts },
      violations: this.violations,
    };
  }
}

/**
 * Check that `text` keeps the expected speech level.
 *
 * `check(text, 'hasipsio')` is shorthand for `check(text, { expect: 'hasipsio' })`.
 * Only sentences with a decidable level are judged; note-style (`nominal`) and unclassifiable
 * (`unknown`) sentences never count as violations.
 */
export function check(text: string, options?: CheckOptions | Expect): CheckResult {
  const resolved = resolveCheckOptions(options);
  assertText(text, resolved.maxLength);
  const tally = new Tally(resolved.expect);
  const scanner = new Scanner(resolved.flags, { onSentence: (s) => tally.add(s) });
  scanner.feed(text);
  scanner.finish();
  return tally.result(resolved.minScore);
}
