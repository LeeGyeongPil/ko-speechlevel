import { describe, expect, it } from 'vitest';
import '../src/adapters/vitest.ts';
import speechLevelAssertion from '../src/adapters/promptfoo.mts';
import { readExample } from './support.ts';

const mixed = readExample('mixed.md');
const polite = readExample('polite.md');

describe('vitest matcher toHaveSpeechLevel', () => {
  it('passes for polite text', () => {
    expect(polite).toHaveSpeechLevel('polite');
    expect('설치합니다. 확인하십시오.').toHaveSpeechLevel('hasipsio');
  });

  it('fails for mixed text with "line:column [level] sentence" in the message', () => {
    let message = '';
    try {
      expect(mixed).toHaveSpeechLevel('polite');
      expect.unreachable('the matcher should have failed');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('17:1 [hae] 그다음 서버를 다시 켜면 돼.');
    expect(message).toContain('1/4 sentence(s) are off-level');
  });

  it('supports .not', () => {
    expect(mixed).not.toHaveSpeechLevel('polite');
    expect(polite).not.toHaveSpeechLevel('casual');
    expect(() => expect(polite).not.toHaveSpeechLevel('polite')).toThrowError(/not to keep speech level/);
  });

  it('fails with a message (no crash) for non-strings and bad levels', () => {
    expect(() => expect(42).toHaveSpeechLevel('polite')).toThrowError(/expects a string but received number/);
    expect(() => expect('a').toHaveSpeechLevel('formal' as never)).toThrowError(/Unknown expect/);
  });

  it('passes options through', () => {
    expect('| a | 켠다 |').toHaveSpeechLevel('polite');
    expect('| a | 켠다 |').not.toHaveSpeechLevel('polite', { include: { tables: true } });
  });
});

describe('promptfoo assertion', () => {
  it('returns { pass, score, reason } for polite text', () => {
    const result = speechLevelAssertion(polite, { config: { expect: 'polite' } });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('all 5 judged sentence(s) are polite');
  });

  it('explains violations with offset, level and sentence', () => {
    const result = speechLevelAssertion(mixed, { config: { expect: 'polite' } });
    const offset = mixed.indexOf('그다음 서버를 다시 켜면 돼.');
    expect(result).toEqual({
      pass: false,
      score: 0.75,
      reason: `1/4 off-level: @${offset} [hae] 그다음 서버를 다시 켜면 돼.`,
    });
  });

  it('defaults to polite without config', () => {
    expect(speechLevelAssertion(mixed).pass).toBe(false);
    expect(speechLevelAssertion(polite, {}).pass).toBe(true);
    expect(speechLevelAssertion(polite, { config: {} }).pass).toBe(true);
  });

  it('honors minScore and caps the listed violations', () => {
    expect(speechLevelAssertion(mixed, { config: { minScore: 0.75 } }).pass).toBe(true);
    const many = '해. '.repeat(8) + '합니다.';
    const reason = speechLevelAssertion(many).reason;
    expect(reason).toContain('8/9 off-level');
    expect(reason).toContain('(+3 more)');
  });

  it('turns bad config and bad output into pass:false instead of throwing', () => {
    const badExpect = speechLevelAssertion(polite, { config: { expect: 'formal' } });
    expect(badExpect.pass).toBe(false);
    expect(badExpect.reason).toMatch(/invalid assertion config: Unknown expect "formal"/);
    expect(speechLevelAssertion(undefined).pass).toBe(false);
    expect(speechLevelAssertion({ text: '합니다.' }).reason).toMatch(/must be a string/);
    expect(speechLevelAssertion(polite, { config: { include: { nope: true } as never } }).pass).toBe(false);
  });

  it('passes with a note when nothing is judged', () => {
    expect(speechLevelAssertion('```\n끝났다\n```')).toEqual({ pass: true, score: 1, reason: 'no judged sentences (expect polite)' });
  });
});
