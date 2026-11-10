import { SpeechLevelInputError } from './errors.js';
import type { ScanFlags } from './scanner.js';
import { DEFAULT_MAX_LENGTH, EXPECTS, type AnalyzeOptions, type CheckOptions, type Expect, type Include } from './types.js';

const INCLUDE_KEYS = ['lists', 'tables', 'headings', 'quotes'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseExpect(value: unknown): Expect {
  if (typeof value === 'string' && (EXPECTS as readonly string[]).includes(value)) return value as Expect;
  throw new SpeechLevelInputError(
    'ERR_OPTION',
    `Unknown expect ${JSON.stringify(value)}. Use one of: ${EXPECTS.join(', ')}.`,
  );
}

export interface ResolvedAnalyzeOptions {
  flags: ScanFlags;
  maxLength: number;
}

export function resolveAnalyzeOptions(options: AnalyzeOptions | undefined): ResolvedAnalyzeOptions {
  if (options !== undefined && !isPlainObject(options as unknown)) {
    throw new SpeechLevelInputError('ERR_OPTION', 'Options must be an object, e.g. { expect: "polite" }.');
  }
  const include = (options?.include ?? {}) as Include;
  if (!isPlainObject(include as unknown)) {
    throw new SpeechLevelInputError('ERR_OPTION', 'include must be an object such as { tables: true }.');
  }
  for (const key of Object.keys(include)) {
    if (!(INCLUDE_KEYS as readonly string[]).includes(key)) {
      throw new SpeechLevelInputError(
        'ERR_OPTION',
        `Unknown include key "${key}". Valid keys: ${INCLUDE_KEYS.join(', ')}.`,
      );
    }
    if (typeof (include as Record<string, unknown>)[key] !== 'boolean') {
      throw new SpeechLevelInputError('ERR_OPTION', `include.${key} must be true or false.`);
    }
  }
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH;
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new SpeechLevelInputError('ERR_OPTION', 'maxLength must be a positive integer.');
  }
  return {
    flags: {
      lists: include.lists ?? true,
      tables: include.tables ?? false,
      headings: include.headings ?? false,
      quotes: include.quotes ?? false,
    },
    maxLength,
  };
}

export interface ResolvedCheckOptions extends ResolvedAnalyzeOptions {
  expect: Expect;
  minScore: number;
}

/** Accepts the string shorthand `check(text, 'hasipsio')` as well as an options object. */
export function resolveCheckOptions(options: CheckOptions | Expect | undefined): ResolvedCheckOptions {
  const obj: CheckOptions = typeof options === 'string' ? { expect: options } : (options ?? {});
  const base = resolveAnalyzeOptions(obj);
  const expect = parseExpect(obj.expect ?? 'polite');
  const minScore = obj.minScore ?? 1;
  if (typeof minScore !== 'number' || !Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new SpeechLevelInputError('ERR_OPTION', 'minScore must be a number between 0 and 1.');
  }
  return { ...base, expect, minScore };
}

export function assertText(text: unknown, maxLength: number): asserts text is string {
  if (typeof text !== 'string') {
    throw new SpeechLevelInputError(
      'ERR_INPUT_TYPE',
      `Expected the text to be a string but got ${text === null ? 'null' : typeof text}. Convert it with String(value) first.`,
    );
  }
  if (text.length > maxLength) {
    throw new SpeechLevelInputError(
      'ERR_INPUT_TOO_LARGE',
      `Input has ${text.length} characters, over the maxLength of ${maxLength}. Split the text or raise maxLength.`,
    );
  }
}
