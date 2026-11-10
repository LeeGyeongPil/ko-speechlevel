// vitest matcher demo. Run: npx vitest run --config examples/vitest.example.config.ts
import 'ko-speechlevel/vitest';
import { expect, test } from 'vitest';

test('polite answer keeps the level', () => {
  expect('설치가 끝났습니다. 문제가 있으면 알려 주세요.').toHaveSpeechLevel('polite');
});

test('mixed answer is caught (this test fails on purpose)', () => {
  expect('설치가 끝났습니다. 이제 서버를 켜면 돼.').toHaveSpeechLevel('polite');
});
