import { describe, expect, it } from 'vitest';
import { SpeechLevelInputError, analyze, check, createStreamChecker } from '../src/index.ts';

// Each robustness case must finish within 2 seconds (vitest enforces it) and never overflow the stack.
const LIMIT = { timeout: 2000 };

describe('input limits and errors', () => {
  it('handles 1,000,000 characters of text', LIMIT, () => {
    const text = '설치가 끝났습니다. '.repeat(100_000).slice(0, 1_000_000);
    expect(text.length).toBe(1_000_000);
    const result = check(text);
    expect(result.violations).toHaveLength(0);
    expect(result.judged).toBeGreaterThan(90_000);
  });

  it('handles 10,000 nested ">" quote levels', LIMIT, () => {
    const result = check('> '.repeat(10_000) + '깊은 인용이다.\n설명합니다.');
    expect(result).toMatchObject({ pass: true, judged: 1 });
    expect(check('>'.repeat(10_000) + ' 깊은 인용이다.')).toMatchObject({ pass: true, judged: 0 });
  });

  it('judges nested quotes when included, still without recursion', LIMIT, () => {
    const result = check('> '.repeat(10_000) + '깊은 인용이다.', { include: { quotes: true } });
    expect(result.violations).toHaveLength(1);
  });

  it('handles 10,000 nested list levels on one line and on separate lines', LIMIT, () => {
    const oneLine = check('- '.repeat(10_000) + '끝났다.');
    expect(oneLine.violations).toHaveLength(1);
    expect(oneLine.violations[0]?.text.endsWith('끝났다.')).toBe(true);
    const lines = Array.from({ length: 10_000 }, (_, i) => `${' '.repeat((i % 100) * 2)}- 항목 ${i}입니다.`).join('\n');
    const nested = check(lines);
    expect(nested.judged).toBe(10_000);
    expect(nested.pass).toBe(true);
  });

  it('handles a 500,000-character line without any period', LIMIT, () => {
    const text = '설치 '.repeat(166_667);
    expect(text.length).toBeGreaterThanOrEqual(500_000);
    const result = check(text + '끝났습니다');
    expect(result).toMatchObject({ pass: true, judged: 1 });
    expect(analyze(text).length).toBe(1);
  });

  it('handles 100 unclosed fences', LIMIT, () => {
    const backticks = '```js\n'.repeat(100) + '설치했다\n';
    expect(check(backticks)).toMatchObject({ pass: true, judged: 0 });
    const alternating = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? '```py' : '~~~sh')).join('\n') + '\n끝났다';
    expect(check(alternating)).toMatchObject({ pass: true, judged: 0 });
    // Separate documents that each leave a fence open, 100 times.
    for (let i = 0; i < 100; i += 1) expect(check('```\n끝났다')).toMatchObject({ pass: true, judged: 0 });
  });

  it('handles an unbroken run of quote marks and backticks', LIMIT, () => {
    // An odd number of quote marks leaves the last one open, which masks the rest of the line.
    expect(check('"'.repeat(200_001) + '끝났다.').judged).toBe(0);
    expect(check('"'.repeat(200_000) + '끝났다.').judged).toBe(1);
    expect(check('`'.repeat(200_000) + '끝났다.').judged).toBe(0);
    expect(check('“'.repeat(200_000)).judged).toBe(0);
  });

  it('handles 250,000 unclosed mid-line "<!--" openers on one line', LIMIT, () => {
    const text = '설명입니다 ' + '<!--'.repeat(250_000) + ' 끝났다.';
    expect(check(text).judged).toBeGreaterThan(0);
    const stream = createStreamChecker();
    for (let i = 0; i < text.length; i += 1000) stream.push(text.slice(i, i + 1000));
    expect(stream.end().judged).toBeGreaterThan(0);
  });

  it('rejects input over maxLength with ERR_INPUT_TOO_LARGE and a hint', () => {
    for (const run of [
      () => check('가'.repeat(11), { maxLength: 10 }),
      () => analyze('가'.repeat(11), { maxLength: 10 }),
    ]) {
      try {
        run();
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SpeechLevelInputError);
        expect((error as SpeechLevelInputError).code).toBe('ERR_INPUT_TOO_LARGE');
        expect((error as Error).message).toMatch(/Split the text or raise maxLength/);
      }
    }
    expect(() => check('가'.repeat(10), { maxLength: 10 })).not.toThrow();
    expect(() => check('a'.repeat(2_000_001))).toThrowError(/maxLength of 2000000/);
  });

  it('rejects non-string input with ERR_INPUT_TYPE', () => {
    for (const value of [undefined, null, 42, {}, ['a'], Buffer.from('a')]) {
      for (const run of [() => check(value as never), () => analyze(value as never)]) {
        try {
          run();
          expect.unreachable('should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(SpeechLevelInputError);
          expect((error as SpeechLevelInputError).code).toBe('ERR_INPUT_TYPE');
        }
      }
    }
    expect(() => check(undefined as never)).toThrowError(/got undefined/);
    expect(() => check(null as never)).toThrowError(/got null/);
  });

  it('streams oversize input into ERR_INPUT_TOO_LARGE', () => {
    const checker = createStreamChecker({ maxLength: 5 });
    try {
      checker.push('가나다라마바');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as SpeechLevelInputError).code).toBe('ERR_INPUT_TOO_LARGE');
    }
  });

  it('copes with lone surrogates and control characters', () => {
    expect(() => check('\ud83d 끝났습니다.\u0000\u0007')).not.toThrow();
    expect(() => analyze('\ude00')).not.toThrow();
  });
});
