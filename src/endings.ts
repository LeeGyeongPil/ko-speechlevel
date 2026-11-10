import { JONG_MIEUM, JONG_NIEUN, JONG_PIEUP, isSyllable, jongseong } from './hangul.js';
import type { Level } from './types.js';

/** Only the tail of a sentence matters; longer input is cut to keep the work constant-size. */
const TAIL_LIMIT = 96;

// Trailing punctuation, brackets, emoji (with joiners/variation selectors) and Hangul jamo
// laughter such as "ㅋㅋ" that are skipped before looking at the final word.
const TRAILING_NOISE =
  /[\s.!?~*_…。,·)\]}"'”’」』>:;‍️ㄱ-ㆎ\p{Extended_Pictographic}\p{Emoji_Modifier}]+$/u;
const LAST_WORD = /[가-힣]+$/u;

// Nouns that end like a verb ending. Without these they would be mistaken for a speech level.
// Sentence-final nouns are legitimate in answers ("답변 언어: 한국어"), so they stay `unknown`.
const NOUNS_LIKE_YO = ['필요', '중요', '주요', '개요', '수요', '강요', '요요', '동요', '소요', '긴요', '불필요'];
const NOUNS_LIKE_DA = ['바다'];
const NOUNS_LIKE_RA = ['나라', '미라', '카라'];
const NOUNS_LIKE_JA = [
  '개발자', '사용자', '작성자', '관리자', '제작자', '참가자', '소비자', '이용자', '운영자', '생산자',
  '학자', '연구자', '담당자', '신청자', '가입자', '구매자', '판매자', '설계자', '저자', '필자', '독자',
  '기자', '환자', '당사자', '관계자', '책임자', '대표자', '후보자', '기획자', '제공자', '수신자', '발신자',
  '진행자', '화자', '청자', '탁자', '입자', '분자', '원자', '의자', '상자',
];
const NOUNS_LIKE_HAE = [
  // ends with 어
  '국어', '영어', '본어', '단어', '용어', '언어', '주어', '술어', '검색어', '금칙어', '관련어',
  // ends with 야 / 아
  '분야', '시야', '평야', '러시아', '아시아',
  // ends with 지
  '공지', '용지', '휴지', '주소지', '목적지', '소재지', '신문지', '한지',
];
const NOUNS_LIKE_NOMINAL = ['봄', '몸', '삶', '꿈', '힘', '땀', '숨', '밤', '짐', '곰', '맘'];

const HAE_FINALS = '어아여해돼봐줘워와야지네게래걸까데';

function endsWithAny(word: string, list: readonly string[]): boolean {
  for (const w of list) if (word.endsWith(w)) return true;
  return false;
}

export interface EndingResult {
  level: Level;
  ending: string;
}

/**
 * Decide the speech level of one sentence from its final word only.
 *
 * Subject honorifics ("께서", "-시-") are ignored on purpose: they raise the subject, not the
 * listener, so "선생님께서 오셨다." is plain (`haera`). Never throws; inputs without a
 * Korean final word return `unknown`.
 */
export function classifyEnding(sentence: string): EndingResult {
  const tail = sentence.length > TAIL_LIMIT ? sentence.slice(-TAIL_LIMIT) : sentence;
  const core = tail.replace(TRAILING_NOISE, '');
  const last = LAST_WORD.exec(core)?.[0] ?? '';
  if (!last) return { level: 'unknown', ending: '' };

  const n = last.length;
  const c1 = last.charAt(n - 1);
  const c2 = last.slice(-2);
  const c3 = last.slice(-3);
  const ask = /\?[\s)*_~"'”’」』‍️\p{Extended_Pictographic}]*$/u.test(tail);
  const result = (level: Level, len: number): EndingResult => ({ level, ending: last.slice(-len) });

  // hasipsio: -ㅂ니다 / -습니다, -ㅂ니까 / -습니까
  if ((c2 === '니다' || c2 === '니까') && n >= 3) {
    const before = last.charAt(n - 3);
    if (before === '습' || jongseong(before) === JONG_PIEUP) return result('hasipsio', 3);
  }
  // hasipsio: -(으)십시오, -ㅂ시다 / -읍시다
  if (c3 === '십시오') return result('hasipsio', 3);
  if (c2 === '시다' && n >= 3) {
    const before = last.charAt(n - 3);
    if (before === '읍' || jongseong(before) === JONG_PIEUP) return result('hasipsio', 3);
  }

  // haeyo: -요, -죠
  if (c1 === '요') {
    const copula = /[이에예]요$/.test(last);
    if (!copula && endsWithAny(last, NOUNS_LIKE_YO)) return result('unknown', 2);
    return result('haeyo', 2);
  }
  if (c1 === '죠') return result('haeyo', 2);

  // nominal: -ㅁ / -음 (note style), unless it is an ordinary noun
  if (jongseong(c1) === JONG_MIEUM) {
    return endsWithAny(last, NOUNS_LIKE_NOMINAL) ? result('unknown', 2) : result('nominal', 2);
  }

  // haera: -다, -냐, -구나, -라, -자, -니?, -ㄴ가?
  if (c1 === '다') return endsWithAny(last, NOUNS_LIKE_DA) ? result('unknown', 2) : result('haera', 2);
  if (c1 === '냐' || c2 === '구나') return result('haera', 2);
  if (c1 === '라') return endsWithAny(last, NOUNS_LIKE_RA) ? result('unknown', 2) : result('haera', 2);
  if (c1 === '자') return endsWithAny(last, NOUNS_LIKE_JA) ? result('unknown', 2) : result('haera', 2);
  if (c1 === '니' && ask) return result('haera', 2);
  if (c1 === '가' && n >= 2 && ask && jongseong(last.charAt(n - 2)) === JONG_NIEUN) return result('haera', 2);

  // hae: -어/아/여/해/야/지/네/게/까 ..., -거든
  if (c2 === '거든') return result('hae', 2);
  if (HAE_FINALS.includes(c1)) {
    return endsWithAny(last, NOUNS_LIKE_HAE) ? result('unknown', 2) : result('hae', 2);
  }

  return isSyllable(c1) ? result('unknown', 2) : { level: 'unknown', ending: '' };
}
