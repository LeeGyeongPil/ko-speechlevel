import { describe, expect, it } from 'vitest';
import { classifyEnding, type Level } from '../src/index.ts';

// [sentence, expected level, expected ending]. Sentences are written for this project.
const rows: [string, Level, string][] = [
  // hasipsio: statements, questions, commands, proposals
  ['설치가 끝났습니다.', 'hasipsio', '습니다'],
  ['이것이 답입니다.', 'hasipsio', '입니다'],
  ['지금 시작합니다!', 'hasipsio', '합니다'],
  ['다시 시도하시겠습니까?', 'hasipsio', '습니까'],
  ['어느 쪽이 맞습니까?', 'hasipsio', '습니까'],
  ['아래 명령을 실행하십시오.', 'hasipsio', '십시오'],
  ['함께 해 봅시다.', 'hasipsio', '봅시다'],
  ['곧 도와드리겠습니다', 'hasipsio', '습니다'],
  // haeyo
  ['설치가 끝났어요.', 'haeyo', '어요'],
  ['그건 버그예요.', 'haeyo', '예요'],
  ['괜찮으시죠?', 'haeyo', '시죠'],
  ['이 파일은 어디에 두면 될까요?', 'haeyo', '까요'],
  ['잠깐만 기다려 주세요.', 'haeyo', '세요'],
  ['이렇게 하면 돼요!', 'haeyo', '돼요'],
  ['같이 가요.', 'haeyo', '가요'],
  ['정말 좋아요ㅋㅋ', 'haeyo', '아요'],
  // hae
  ['설치가 끝났어.', 'hae', '났어'],
  ['그건 버그야.', 'hae', '그야'],
  ['다시 해 볼까?', 'hae', '볼까'],
  ['그럼 되지.', 'hae', '되지'],
  ['이거 먹어 봐.', 'hae', '봐'],
  ['나중에 줄게.', 'hae', '줄게'],
  ['진짜 고마워.', 'hae', '마워'],
  ['그냥 두면 돼.', 'hae', '돼'],
  ['설명해 줘.', 'hae', '줘'],
  ['아직 안 왔거든.', 'hae', '거든'],
  // haera
  ['설치가 끝났다.', 'haera', '났다'],
  ['이 함수는 배열을 반환한다.', 'haera', '한다'],
  ['어디서 막혔냐?', 'haera', '혔냐'],
  ['직접 해 보자.', 'haera', '보자'],
  ['빨리 가라.', 'haera', '가라'],
  ['이제 알겠구나.', 'haera', '구나'],
  ['선생님께서 오셨다.', 'haera', '셨다'],
  ['오늘 뭐 먹니?', 'haera', '먹니'],
  ['무엇인가?', 'haera', '인가'],
  ['문을 닫아라.', 'haera', '아라'],
  // nominal (note style)
  ['설정 파일 수정함', 'nominal', '정함'],
  ['테스트 통과 확인됨', 'nominal', '인됨'],
  ['캐시 삭제 필요 없음', 'nominal', '없음'],
  ['서버 재시작 완료됨.', 'nominal', '료됨'],
  ['오류 발생 확인함', 'nominal', '인함'],
  ['문서 갱신 예정임', 'nominal', '정임'],
  // unknown: nouns that look like endings, fragments, non-Korean
  ['재시작 필요', 'unknown', '필요'],
  ['이 단계가 중요.', 'unknown', '중요'],
  ['답변 언어: 한국어', 'unknown', '국어'],
  ['핵심은 속도', 'unknown', '속도'],
  ['대상은 개발자.', 'unknown', '발자'],
  ['하시오.', 'unknown', '시오'],
  ['이 분야', 'unknown', '분야'],
  ['Node.js', 'unknown', ''],
  ['123', 'unknown', ''],
  ['', 'unknown', ''],
];

describe('classifyEnding table', () => {
  it.each(rows)('%s -> %s (%s)', (sentence, level, ending) => {
    expect(classifyEnding(sentence)).toEqual({ level, ending });
  });

  it('has at least 6 rows per level and 40 rows overall', () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
    for (const level of ['hasipsio', 'haeyo', 'hae', 'haera', 'nominal', 'unknown'] as Level[]) {
      expect(rows.filter((r) => r[1] === level).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('covers statements, questions, commands and proposals', () => {
    const text = rows.map((r) => r[0]).join('\n');
    expect(text).toMatch(/\?/); // questions
    expect(text).toMatch(/십시오|세요|아라|가라/); // commands
    expect(text).toMatch(/봅시다|보자/); // proposals
    expect(text).toMatch(/습니다/); // statements
  });

  it('judges the final ending, not subject honorifics', () => {
    expect(classifyEnding('선생님께서 오셨습니다.').level).toBe('hasipsio');
    expect(classifyEnding('선생님께서 오셨다.').level).toBe('haera');
  });

  it('does not throw on odd or very long input', () => {
    expect(classifyEnding('가'.repeat(100000) + '요').level).toBe('haeyo');
    expect(classifyEnding('\u0000\ud83d').level).toBe('unknown');
  });
});
