import { describe, expect, it } from 'vitest';
import { SpeechLevelInputError, analyze, check } from '../src/index.ts';
import { readExample } from './support.ts';

const mixed = readExample('mixed.md');

describe('check', () => {
  it('reports exactly the plain-style sentence of the mixed sample, score 0.75', () => {
    const result = check(mixed);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.text).toBe('그다음 서버를 다시 켜면 돼.');
    expect(result.violations[0]?.level).toBe('hae');
    expect(result.score).toBe(0.75);
    expect(result.judged).toBe(4);
    expect(result.pass).toBe(false);
    expect(result.expect).toBe('polite');
  });

  it('keeps text equal to the input slice for every sentence and region', () => {
    for (const s of analyze(mixed)) expect(mixed.slice(s.start, s.end)).toBe(s.text);
    for (const v of check(mixed).violations) expect(mixed.slice(v.start, v.end)).toBe(v.text);
  });

  it('computes 1-based line and column', () => {
    const text = '첫째 줄입니다.\n  둘째 줄은 반말이야.\n셋째입니다.';
    const [violation] = check(text).violations;
    expect(violation).toMatchObject({ line: 2, column: 3, text: '둘째 줄은 반말이야.' });
    // The same sentence located by hand.
    const lines = text.split('\n');
    expect(lines[(violation?.line ?? 0) - 1]?.slice((violation?.column ?? 0) - 1)).toBe('둘째 줄은 반말이야.');
  });

  it('counts every level', () => {
    const result = check('설치합니다. 켜세요. 해. 했다.\n- 수정함\n- 필요');
    expect(result.counts).toEqual({ hasipsio: 1, haeyo: 1, hae: 1, haera: 1, nominal: 1, unknown: 1 });
  });

  it('honors minScore', () => {
    expect(check(mixed, { minScore: 0.75 }).pass).toBe(true);
    expect(check(mixed, { minScore: 0.8 }).pass).toBe(false);
    expect(check(mixed, { minScore: 0 }).pass).toBe(true);
  });

  it('accepts the string shorthand', () => {
    const text = '설치합니다. 켜 주세요.';
    expect(check(text, 'hasipsio').violations.map((v) => v.text)).toEqual(['켜 주세요.']);
    expect(check(text, 'polite').pass).toBe(true);
    expect(check(text, { expect: 'hasipsio' })).toEqual(check(text, 'hasipsio'));
  });

  it('passes when nothing can be judged', () => {
    const result = check('```\n끝났다\n```');
    expect(result).toMatchObject({ pass: true, score: 1, judged: 0 });
    expect(check('')).toMatchObject({ pass: true, score: 1, judged: 0 });
  });

  it('rejects bad options with a fix hint', () => {
    expect(() => check('a', 'formal' as never)).toThrowError(/Use one of: polite, hasipsio, haeyo, casual/);
    expect(() => check('a', { minScore: 2 })).toThrowError(SpeechLevelInputError);
    expect(() => check('a', { include: { tabels: true } as never })).toThrowError(/Unknown include key "tabels"/);
    expect(() => check('a', { include: { tables: 'yes' } as never })).toThrowError(/include.tables must be true or false/);
    expect(() => check('a', { maxLength: 0 })).toThrowError(/maxLength/);
    try {
      check('a', { minScore: -1 });
      expect.unreachable('check should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SpeechLevelInputError);
      expect((error as SpeechLevelInputError).code).toBe('ERR_OPTION');
    }
  });
});
