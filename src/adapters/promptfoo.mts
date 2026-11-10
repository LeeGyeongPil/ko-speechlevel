import { check } from '../check.js';
import { SpeechLevelInputError } from '../errors.js';
import type { CheckOptions, Expect } from '../types.js';

/** What promptfoo expects back from a JavaScript assertion. */
export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

export interface SpeechLevelAssertionContext {
  config?: {
    /** Target style. Default `polite`. */
    expect?: Expect | string;
    minScore?: number;
    include?: CheckOptions['include'];
  };
}

const MAX_LISTED = 5;

/**
 * promptfoo assertion: `type: javascript`, `value: file://speechlevel.mjs`, `config: { expect: polite }`.
 *
 * Never throws: bad config or non-text output becomes `pass: false` with a reason.
 */
export default function speechLevelAssertion(output: unknown, context?: SpeechLevelAssertionContext): GradingResult {
  if (typeof output !== 'string') {
    return {
      pass: false,
      score: 0,
      reason: `output must be a string but was ${output === null ? 'null' : typeof output}; check the provider/transform.`,
    };
  }
  const config = context?.config ?? {};
  try {
    const result = check(output, {
      expect: (config.expect ?? 'polite') as Expect,
      ...(config.minScore !== undefined ? { minScore: config.minScore } : {}),
      ...(config.include !== undefined ? { include: config.include } : {}),
    });
    if (result.judged === 0) {
      return { pass: true, score: 1, reason: `no judged sentences (expect ${result.expect})` };
    }
    if (result.violations.length === 0) {
      return { pass: result.pass, score: result.score, reason: `all ${result.judged} judged sentence(s) are ${result.expect}` };
    }
    const shown = result.violations
      .slice(0, MAX_LISTED)
      .map((v) => `@${v.start} [${v.level}] ${v.text}`)
      .join(' | ');
    const more = result.violations.length > MAX_LISTED ? ` | (+${result.violations.length - MAX_LISTED} more)` : '';
    return {
      pass: result.pass,
      score: result.score,
      reason: `${result.violations.length}/${result.judged} off-level: ${shown}${more}`,
    };
  } catch (error) {
    if (error instanceof SpeechLevelInputError) {
      return { pass: false, score: 0, reason: `invalid assertion config: ${error.message}` };
    }
    throw error;
  }
}
