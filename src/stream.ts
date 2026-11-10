import { Tally } from './check.js';
import { SpeechLevelInputError } from './errors.js';
import { resolveCheckOptions } from './options.js';
import { Scanner } from './scanner.js';
import type { CheckOptions, CheckResult, SentenceResult } from './types.js';

export interface StreamOptions extends CheckOptions {
  /** Called once for every completed, judged-or-not sentence. */
  onSentence?: (sentence: SentenceResult) => void;
  /** Called once, as soon as a violating sentence is complete. */
  onViolation?: (sentence: SentenceResult) => void;
}

export interface StreamChecker {
  /** Feed the next piece of the response. Returns the sentences that became complete. */
  push(chunk: string): SentenceResult[];
  /** Flush the last sentence and return the same result `check` gives for the whole text. */
  end(): CheckResult;
}

/**
 * Incremental checker for streamed responses.
 *
 * A sentence is reported only once its end is certain: the character after the terminator has
 * arrived ("3." followed by more text, or a sentence still being written, stays pending). Any
 * chunking of the same text gives `end()` results equal to `check(text)`.
 */
export function createStreamChecker(options?: StreamOptions): StreamChecker {
  const resolved = resolveCheckOptions(options);
  const tally = new Tally(resolved.expect);
  let batch: SentenceResult[] = [];
  let received = 0;
  let result: CheckResult | undefined;

  const scanner = new Scanner(resolved.flags, {
    onSentence: (sentence) => {
      const violated = tally.add(sentence);
      batch.push(sentence);
      options?.onSentence?.(sentence);
      if (violated) options?.onViolation?.(sentence);
    },
  });

  return {
    push(chunk: string): SentenceResult[] {
      if (result) {
        throw new SpeechLevelInputError('ERR_STATE', 'push() was called after end(). Create a new stream checker per response.');
      }
      if (typeof chunk !== 'string') {
        throw new SpeechLevelInputError('ERR_INPUT_TYPE', `Expected a string chunk but got ${chunk === null ? 'null' : typeof chunk}.`);
      }
      received += chunk.length;
      if (received > resolved.maxLength) {
        throw new SpeechLevelInputError(
          'ERR_INPUT_TOO_LARGE',
          `Stream passed ${received} characters, over the maxLength of ${resolved.maxLength}. Raise maxLength or check shorter responses.`,
        );
      }
      batch = [];
      scanner.feed(chunk);
      return batch;
    },
    end(): CheckResult {
      if (!result) {
        scanner.finish();
        result = tally.result(resolved.minScore);
      }
      return result;
    },
  };
}
