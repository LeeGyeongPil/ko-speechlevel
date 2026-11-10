import { describe, expect, it } from 'vitest';
import { analyze, check } from '../src/index.ts';
import { rows as baseRows, rowsRound2 } from './regression-table.ts';

const rows = [...baseRows, ...rowsRound2];

describe('false-positive / false-negative regression table', () => {
  it('has at least 30 rows with negatives and positives', () => {
    expect(rows.length).toBeGreaterThanOrEqual(30);
    expect(rows.filter((r) => r.violations.length === 0).length).toBeGreaterThanOrEqual(10);
    expect(rows.filter((r) => r.violations.length > 0).length).toBeGreaterThanOrEqual(10);
  });

  it.each(rows.map((r) => [r.name, r] as const))('%s', (_name, row) => {
    const result = check(row.text, row.options);
    // Expected offsets come from the first occurrence of each expected sentence in the text.
    let from = 0;
    const expected = row.violations.map((sentence) => {
      const start = row.text.indexOf(sentence, from);
      expect(start, `sentence "${sentence}" must occur in the text`).toBeGreaterThanOrEqual(0);
      from = start + sentence.length;
      return { start, end: start + sentence.length, text: sentence };
    });
    expect(result.violations.map((v) => ({ start: v.start, end: v.end, text: v.text }))).toEqual(expected);
    expect(result.pass).toBe(expected.length === 0);
  });

  it('merges English abbreviations and ordinals into one sentence', () => {
    const sentences = (text: string) => analyze(text).filter((s) => !s.skipped).map((s) => s.text);
    expect(sentences('Dr. Kim이 확인했습니다.')).toEqual(['Dr. Kim이 확인했습니다.']);
    expect(sentences('예: e.g. 이런 경우입니다.')).toEqual(['예: e.g. 이런 경우입니다.']);
    expect(sentences('총 3. 단계입니다.')).toEqual(['총 3. 단계입니다.']);
    expect(sentences('끝났습니다. 다음입니다.')).toEqual(['끝났습니다.', '다음입니다.']);
  });

  it('reports skipped regions with their reason', () => {
    const kinds = analyze('# 제목\n> 인용\n`코드` 입니다.\n| a |').filter((s) => s.skipped).map((s) => s.skipped);
    expect(kinds).toEqual(['heading', 'quote', 'code', 'table']);
  });
});
