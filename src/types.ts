/** Relative-honorific level of a Korean sentence, decided from its final ending only. */
export type Level = 'hasipsio' | 'haeyo' | 'hae' | 'haera' | 'nominal' | 'unknown';

/** Target style a text is expected to keep. */
export type Expect = 'polite' | 'hasipsio' | 'haeyo' | 'casual';

/** Why a stretch of text was left out of judgement. */
export type SkipKind = 'code' | 'quote' | 'table' | 'heading' | 'list' | 'comment';

/** Region kinds that are skipped by default and can be switched back on (lists are judged by default). */
export interface Include {
  /** Judge list items (default `true`). Set `false` to skip them. */
  lists?: boolean;
  /** Judge table cells (default `false`). */
  tables?: boolean;
  /** Judge headings (default `false`). */
  headings?: boolean;
  /** Judge `>` block quotes and text inside quotation marks (default `false`). */
  quotes?: boolean;
}

export interface AnalyzeOptions {
  include?: Include;
  /** Maximum accepted input length in UTF-16 code units. Default 2,000,000. */
  maxLength?: number;
}

export interface CheckOptions extends AnalyzeOptions {
  /** Target style. Default `polite`. */
  expect?: Expect;
  /** Smallest acceptable score (0..1) for `pass`. Default 1 (no violation allowed). */
  minScore?: number;
}

export interface SentenceResult {
  /** Exact slice of the input: `input.slice(start, end)`. */
  text: string;
  /** UTF-16 offset of the first character. */
  start: number;
  /** UTF-16 offset after the last character. */
  end: number;
  /** 1-based line of `start`. */
  line: number;
  /** 1-based column (UTF-16 units) of `start`. */
  column: number;
  level: Level;
  /** Last 2 characters (3 for `hasipsio`) of the final Korean word; `''` if none. */
  ending: string;
  /** Set only on region entries returned by `analyze` for text that was not judged. */
  skipped?: SkipKind;
}

export interface CheckResult {
  expect: Expect;
  pass: boolean;
  /** `(judged - violations) / judged`, or 1 when nothing was judged. */
  score: number;
  /** Sentences with a decidable level (everything except `nominal` and `unknown`). */
  judged: number;
  counts: Record<Level, number>;
  violations: SentenceResult[];
}

export const LEVELS: readonly Level[] = ['hasipsio', 'haeyo', 'hae', 'haera', 'nominal', 'unknown'];

export const EXPECTS: readonly Expect[] = ['polite', 'hasipsio', 'haeyo', 'casual'];

/** Levels that satisfy each target style. */
export const ALLOWED: Readonly<Record<Expect, readonly Level[]>> = {
  polite: ['hasipsio', 'haeyo'],
  hasipsio: ['hasipsio'],
  haeyo: ['haeyo'],
  casual: ['hae', 'haera'],
};

export const DEFAULT_MAX_LENGTH = 2_000_000;
