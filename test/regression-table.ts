import type { CheckOptions } from '../src/index.ts';

export interface Row {
  name: string;
  text: string;
  options: CheckOptions;
  /** Sentences that must be reported as violations, in order. Offsets are taken from `text`. */
  violations: string[];
}

const polite: CheckOptions = { expect: 'polite' };

/** Negatives first (must not be flagged), then positives (must be flagged). All text is original. */
export const rows: Row[] = [
  // ---- negatives: no violation ----
  { name: 'direct quote with plain style', text: '문서에는 "이 옵션은 꺼져 있다"라고 나옵니다.', options: polite, violations: [] },
  { name: 'nested quote marks', text: 'A 문서는 “그가 「떠났다」고 했다”라고 적었습니다.', options: polite, violations: [] },
  { name: 'block quote', text: '> 원문: 재시작해야 한다.\n답변은 아래와 같습니다.', options: polite, violations: [] },
  { name: 'nested block quote', text: '> > > 깊은 인용이다.\n> 바깥 인용이다.\n정리했습니다.', options: polite, violations: [] },
  { name: 'code fence', text: '```\n설치 완료했다\n```\n끝났습니다.', options: polite, violations: [] },
  { name: 'tilde fence', text: '~~~\n설치 완료했다\n~~~\n끝났습니다.', options: polite, violations: [] },
  { name: 'unclosed fence runs to the end', text: '설명드립니다.\n```py\n# 설치했다\nprint(1)', options: polite, violations: [] },
  { name: 'inline code with plain style', text: '`설치했다` 라고 출력됩니다.', options: polite, violations: [] },
  { name: 'table cells', text: '| 항목 | 설명 |\n|---|---|\n| a | 켠다 |', options: polite, violations: [] },
  { name: 'heading', text: '# 설치 방법이다\n\n아래 순서로 진행합니다.', options: polite, violations: [] },
  { name: 'list with note-style endings', text: '- 설정 파일 수정함\n- 캐시 삭제됨\n- 재시작 필요', options: polite, violations: [] },
  { name: 'ordered list with note-style endings', text: '1. 설치함\n2. 실행함', options: polite, violations: [] },
  { name: 'noun 필요 at the end', text: '이 단계는 재시작 필요.', options: polite, violations: [] },
  { name: 'noun 중요 at the end', text: '이 단계가 중요.', options: polite, violations: [] },
  { name: 'subject honorific with polite ending', text: '선생님께서 오셨습니다.', options: polite, violations: [] },
  { name: 'decimal point and product name', text: '지연은 3.5배 늘었습니다. Node.js 22를 씁니다.', options: polite, violations: [] },
  { name: 'abbreviation does not split', text: '예: e.g. 이런 경우입니다.', options: polite, violations: [] },
  { name: 'haeyo and hasipsio mixed is polite', text: '설치합니다. 켜세요. 확인해 볼게요.', options: polite, violations: [] },
  { name: 'emoji after polite ending', text: '좋아요😊 다음은 뭐 할까요?', options: polite, violations: [] },
  { name: 'emoji at the very end', text: '완료했습니다 ✅', options: polite, violations: [] },
  { name: 'laughter jamo after haeyo', text: '정말 좋아요ㅋㅋ', options: polite, violations: [] },
  { name: 'quote then polite body', text: '"안녕하세요" 라고 말했습니다.', options: polite, violations: [] },
  { name: 'url with dots', text: '자세한 내용은 https://example.com/a.b 에서 봅니다.', options: polite, violations: [] },
  { name: 'question ending in haeyo', text: '무엇이 필요한가요?', options: polite, violations: [] },
  { name: 'noun ending in 자 is not a proposal', text: '작성자는 관리자입니다. 대상은 개발자.', options: polite, violations: [] },
  { name: 'language name ending in 어', text: '답변 언어: 한국어', options: polite, violations: [] },
  { name: 'casual target accepts hae and haera', text: '그냥 해. 간다.', options: { expect: 'casual' }, violations: [] },
  { name: 'strict hasipsio accepts hasipsio', text: '설치합니다. 확인하십시오.', options: { expect: 'hasipsio' }, violations: [] },
  { name: 'lists can be skipped entirely', text: '- 켜면 돼.\n- 끝났다.', options: { expect: 'polite', include: { lists: false } }, violations: [] },
  { name: 'nominal is not judged under any target', text: '- 서버 재시작함', options: { expect: 'hasipsio' }, violations: [] },

  // ---- positives: must be flagged ----
  {
    name: 'plain style after a block quote',
    text: '> 원문: 켠다.\n그러니까 직접 켜면 돼.',
    options: polite,
    violations: ['그러니까 직접 켜면 돼.'],
  },
  {
    name: 'plain style inside a list item',
    text: '- 먼저 설치합니다\n- 그다음 서버를 켜면 돼.\n- 마지막으로 확인합니다',
    options: polite,
    violations: ['그다음 서버를 켜면 돼.'],
  },
  {
    name: 'plain style ending in an emoji',
    text: '좋아요 이제 시작이야😊 다음은 뭐 할까요?',
    options: polite,
    violations: ['좋아요 이제 시작이야😊'],
  },
  { name: 'subject honorific does not make haera polite', text: '선생님께서 오셨다.', options: polite, violations: ['선생님께서 오셨다.'] },
  {
    name: 'haeyo is a violation under strict hasipsio',
    text: '설치합니다. 켜 주세요.',
    options: { expect: 'hasipsio' },
    violations: ['켜 주세요.'],
  },
  {
    name: 'haera among hasipsio',
    text: '문서를 읽는다. 그리고 실행합니다.',
    options: polite,
    violations: ['문서를 읽는다.'],
  },
  { name: 'hae question', text: '이거 맞아? 네, 맞습니다.', options: polite, violations: ['이거 맞아?'] },
  {
    name: 'haeyo is a violation under casual',
    text: '그냥 가. 설치했어요.',
    options: { expect: 'casual' },
    violations: ['설치했어요.'],
  },
  { name: 'proposal in haera', text: '같이 해 보자. 괜찮으시죠?', options: polite, violations: ['같이 해 보자.'] },
  { name: 'imperative in haera', text: '지금 바로 닫아라. 감사합니다.', options: polite, violations: ['지금 바로 닫아라.'] },
  { name: 'two violations in a row', text: '합니다. 해. 했다. 해요.', options: polite, violations: ['해.', '했다.'] },
  {
    name: 'quote does not hide the sentence it sits in',
    text: '"안녕하세요" 라고 말했다.',
    options: polite,
    violations: ['"안녕하세요" 라고 말했다.'],
  },
  { name: 'CRLF line endings keep offsets', text: '설치합니다.\r\n켜면 돼.\r\n', options: polite, violations: ['켜면 돼.'] },
  { name: 'inline code stays inside the sentence span', text: '`npm i` 하면 돼.', options: polite, violations: ['`npm i` 하면 돼.'] },
  {
    name: 'table cells judged when included',
    text: '| 항목 | 설명 |\n| a | 켠다 |',
    options: { expect: 'polite', include: { tables: true } },
    violations: ['켠다'],
  },
  {
    name: 'block quote judged when included',
    text: '> 원문: 켠다.\n정리했습니다.',
    options: { expect: 'polite', include: { quotes: true } },
    violations: ['원문: 켠다.'],
  },
  {
    name: 'heading judged when included',
    text: '## 설치한다\n\n진행합니다.',
    options: { expect: 'polite', include: { headings: true } },
    violations: ['설치한다'],
  },
  {
    name: 'quotation marks judged when included',
    text: '그는 "이제 간다" 라고 했습니다.\n"끝났다"',
    options: { expect: 'polite', include: { quotes: true } },
    violations: ['"끝났다"'],
  },
];

/** Round 2 additions: emphasis markup, indented code and HTML comments. */
export const rowsRound2: Row[] = [
  // ---- negatives ----
  { name: 'bold polite sentence followed by a polite one', text: '**중요합니다.** 꼭 확인하세요.', options: polite, violations: [] },
  { name: 'underscore bold polite', text: '__중요합니다.__ 꼭 확인하세요.', options: polite, violations: [] },
  { name: 'italic polite with the period outside', text: '*중요합니다*. 꼭 확인하세요.', options: polite, violations: [] },
  { name: 'strikethrough polite', text: '~~예전 방식입니다.~~ 지금은 다릅니다.', options: polite, violations: [] },
  { name: 'indented code block after a blank line', text: '아래를 보세요.\n\n    echo 끝났다.\n\n잘 됩니다.', options: polite, violations: [] },
  { name: 'indented code block with blank lines inside', text: '예시입니다.\n\n    a 했다.\n\n    b 한다.\n\n끝입니다.', options: polite, violations: [] },
  { name: 'tab indented code block', text: '예시입니다.\n\n\techo 끝났다.\n\n끝입니다.', options: polite, violations: [] },
  { name: 'HTML comment on its own line', text: '준비됐습니다.\n<!-- 끝났다. -->', options: polite, violations: [] },
  { name: 'HTML comment across lines', text: '<!--\n메모: 이건 끝났다.\n-->\n준비됐습니다.', options: polite, violations: [] },
  { name: 'HTML comment after a polite sentence', text: '준비됐습니다 <!-- 끝났다. --> 이어서 진행합니다.', options: polite, violations: [] },

  // ---- positives ----
  { name: 'bold plain sentence at the end', text: '설치했습니다. **이제 끝났어.**', options: polite, violations: ['**이제 끝났어.**'] },
  { name: 'bold with the period outside', text: '설치했습니다. **이제 끝났어**.', options: polite, violations: ['**이제 끝났어**.'] },
  { name: 'italic star plain sentence', text: '설치했습니다. 이제 *끝났어.*', options: polite, violations: ['이제 *끝났어.*'] },
  { name: 'italic underscore plain sentence', text: '설치했습니다. _끝났어._', options: polite, violations: ['_끝났어._'] },
  { name: 'underscore bold plain sentence', text: '설치했습니다. __끝났어.__', options: polite, violations: ['__끝났어.__'] },
  { name: 'strikethrough plain sentence', text: '설치했습니다. ~~끝났어.~~', options: polite, violations: ['~~끝났어.~~'] },
  { name: 'bold around inline code', text: '**`npm i` 하면 돼.**', options: polite, violations: ['**`npm i` 하면 돼.**'] },
  { name: 'bold plain sentence is split from the next one', text: '**끝났어.** 다음입니다.', options: polite, violations: ['**끝났어.**'] },
  {
    name: 'bold plain sentence between polite ones',
    text: '설치했습니다. **이제 끝났어.** 다음 단계입니다.',
    options: polite,
    violations: ['**이제 끝났어.**'],
  },
  { name: 'indented line right after a paragraph is not code', text: '설명합니다.\n    그래서 끝났다.', options: polite, violations: ['그래서 끝났다.'] },
  { name: 'indented continuation of a list item is judged', text: '- 먼저 합니다\n\n    그다음 켜면 돼.', options: polite, violations: ['그다음 켜면 돼.'] },
  { name: 'plain text after an indented code block', text: '예시입니다.\n\n    echo 끝났다.\n\n그래서 끝났다.', options: polite, violations: ['그래서 끝났다.'] },
  { name: 'plain sentence after an HTML comment', text: '<!-- 메모 -->\n끝났다.', options: polite, violations: ['끝났다.'] },
  { name: 'plain sentence before an HTML comment', text: '준비됐다 <!-- 메모입니다 -->', options: polite, violations: ['준비됐다 <!-- 메모입니다 -->'] },
];
