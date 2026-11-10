// Quick start: check a hand-written answer (not real model output).
import { check } from 'ko-speechlevel';

const answer = '설치가 끝났습니다. 이제 서버를 켜면 돼. 문제가 있으면 알려 주세요.';
const r = check(answer, 'polite');
console.log(`pass=${r.pass} score=${r.score.toFixed(2)} judged=${r.judged}`);
for (const v of r.violations) console.log(`${v.line}:${v.column} [${v.level}] ${v.text}`);
