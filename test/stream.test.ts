import { describe, expect, it } from 'vitest';
import { check, createStreamChecker, type SentenceResult } from '../src/index.ts';
import { chunked, readExample } from './support.ts';

const samples: Record<string, string> = {
  emphasis: '설치했습니다. **이제 끝났어.** 다음 단계입니다. *끝났어*. _됐다._ __했어.__ ~~그만.~~ **`npm i` 하면 돼.**',
  indentedAndComment: '예시입니다.\n\n    echo 끝났다.\n\n    b 한다.\n\n<!-- 메모: 끝났다.\n끝! -->\n준비됐습니다 <!-- x --> 했어.\n- 목록입니다\n\n    이어서 해.',
  mixed: readExample('mixed.md'),
  polite: readExample('polite.md'),
  quoted: readExample('quoted-source.md'),
  crlf: '설치합니다.\r\n켜면 돼.\r\n끝났다.',
  emoji: '좋아요 이제 시작이야😊 다음은 뭐 할까요? 👍🏽 완료했습니다. 🙂',
  numbers: '총 3. 단계입니다. 버전 1.2.3 이며 e.g. 이렇게 합니다. 끝났어.',
  table: '| 항목 | 설명 |\n|---|---|\n| a | 켠다 |\n설명입니다.',
  fenceAndInline: '```js\nconst a = "끝났다.";\n```\n이후 `켜면 돼.` 를 실행합니다. "그만한다." 라고 했어.',
};

describe('createStreamChecker', () => {
  for (const [name, text] of Object.entries(samples)) {
    it(`end() equals check() for every chunk size 1..17 (${name})`, () => {
      const expected = check(text);
      for (let size = 1; size <= 17; size += 1) {
        const checker = createStreamChecker();
        for (const piece of chunked(text, size)) checker.push(piece);
        expect(checker.end(), `chunk size ${size}`).toEqual(expected);
      }
    });
  }

  it('also matches with table cells, quotes and headings included', () => {
    const options = { include: { tables: true, quotes: true, headings: true } };
    for (const text of Object.values(samples)) {
      for (const size of [1, 3, 7]) {
        const checker = createStreamChecker(options);
        for (const piece of chunked(text, size)) checker.push(piece);
        expect(checker.end()).toEqual(check(text, options));
      }
    }
  });

  it('survives a chunk boundary inside a surrogate pair', () => {
    const text = '좋아요😊 다음입니다.';
    const checker = createStreamChecker();
    for (const piece of chunked(text, 1)) checker.push(piece);
    expect(checker.end()).toEqual(check(text));
  });

  it('calls onViolation once, in the chunk that holds the character after the sentence', () => {
    const text = samples.mixed ?? '';
    const [expected] = check(text).violations;
    expect(expected).toBeDefined();
    for (let size = 1; size <= 17; size += 1) {
      const fired: { chunk: number; text: string }[] = [];
      let current = 0;
      const checker = createStreamChecker({ onViolation: (s) => fired.push({ chunk: current, text: s.text }) });
      chunked(text, size).forEach((piece, i) => {
        current = i;
        checker.push(piece);
      });
      checker.end();
      expect(fired, `chunk size ${size}`).toEqual([{ chunk: Math.floor((expected?.end ?? 0) / size), text: expected?.text }]);
    }
  });

  it('holds back "3." and unfinished sentences', () => {
    const seen: string[] = [];
    const violations: string[] = [];
    const checker = createStreamChecker({
      onSentence: (s) => seen.push(s.text),
      onViolation: (s) => violations.push(s.text),
    });
    expect(checker.push('설치합니다. 총 3.')).toHaveLength(1); // only the first sentence is certain
    expect(checker.push(' 단계')).toEqual([]); // "3." followed by text: still pending
    expect(checker.push('입니다. ')).toHaveLength(1);
    expect(seen).toEqual(['설치합니다.', '총 3. 단계입니다.']);
    expect(checker.push('그다음 서버를 켜면')).toEqual([]); // mid-sentence: nothing yet
    expect(violations).toEqual([]);
    expect(checker.push(' 돼')).toEqual([]);
    expect(violations).toEqual([]);
    checker.push('. ');
    expect(violations).toEqual(['그다음 서버를 켜면 돼.']);
    expect(checker.end().violations).toHaveLength(1);
  });

  it('returns the newly completed sentences from push()', () => {
    const checker = createStreamChecker();
    const got: SentenceResult[] = [...checker.push('끝났습니다. 다시 '), ...checker.push('해요. 마지막')];
    expect(got.map((s) => s.text)).toEqual(['끝났습니다.', '다시 해요.']);
    expect(checker.end().judged).toBe(2);
  });

  it('checks 200 KB pushed 10 characters at a time within 3 seconds', { timeout: 3000 }, () => {
    const text = '설치가 끝났습니다. 서버를 켜면 돼. 확인해 주세요.\n'.repeat(5000).slice(0, 200_000);
    const checker = createStreamChecker();
    for (const piece of chunked(text, 10)) checker.push(piece);
    expect(checker.end()).toEqual(check(text));
  });

  it('rejects use after end(), non-string chunks and oversize streams with codes', () => {
    const checker = createStreamChecker({ maxLength: 20 });
    expect(() => checker.push(5 as never)).toThrowError(/string chunk/);
    checker.push('끝났습니다.');
    expect(() => checker.push('가'.repeat(30))).toThrowError(/maxLength/);
    const done = createStreamChecker();
    done.end();
    expect(() => done.push('a')).toThrowError(/after end\(\)/);
    expect(done.end()).toBe(done.end());
    expect(() => createStreamChecker({ expect: 'x' as never })).toThrowError(/Unknown expect/);
  });
});
