// Streaming demo: fixed chunks (not real model output) are pushed one by one.
// A warning appears the moment the violating sentence is complete.
import { createStreamChecker } from '../dist/index.js';

const chunks = ['설치가 끝났', '습니다. 이제 서버를 ', '켜면 돼', '. 문제가 있으면 알려 ', '주세요.'];

const checker = createStreamChecker({
  expect: 'polite',
  onViolation: (s) => console.log(`  ⚠ violation: ${s.text}  (${s.line}:${s.column} [${s.level}])`),
});

for (const chunk of chunks) {
  console.log(`push ${JSON.stringify(chunk)}`);
  checker.push(chunk);
}
const result = checker.end();
console.log(`end: pass=${result.pass} score=${result.score} violations=${result.violations.length}`);
