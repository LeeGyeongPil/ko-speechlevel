import { expect } from 'vitest';
import { check } from '../check.js';
import { SpeechLevelInputError } from '../errors.js';
import type { CheckOptions, Expect } from '../types.js';

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    /** Passes when every judged sentence keeps the given speech level. */
    toHaveSpeechLevel(level: Expect, options?: Omit<CheckOptions, 'expect'>): R;
  }
}

expect.extend({
  toHaveSpeechLevel(received: unknown, level: Expect, options?: Omit<CheckOptions, 'expect'>) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () => `toHaveSpeechLevel expects a string but received ${received === null ? 'null' : typeof received}`,
      };
    }
    try {
      const result = check(received, { ...options, expect: level });
      return {
        pass: result.pass,
        message: () =>
          result.pass
            ? `expected the text not to keep speech level "${level}", but all ${result.judged} judged sentence(s) do`
            : `expected the text to keep speech level "${level}", but ${result.violations.length}/${result.judged} sentence(s) are off-level:\n` +
              result.violations.map((v) => `  ${v.line}:${v.column} [${v.level}] ${v.text}`).join('\n'),
      };
    } catch (error) {
      if (error instanceof SpeechLevelInputError) {
        return { pass: false, message: () => `toHaveSpeechLevel: ${error.message}` };
      }
      throw error;
    }
  },
});
