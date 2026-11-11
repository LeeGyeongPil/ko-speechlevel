import { classifyEnding } from './endings.js';
import { isSyllable } from './hangul.js';
import type { Level, SentenceResult, SkipKind } from './types.js';

/**
 * Single-pass, chunk-invariant sentence scanner.
 *
 * It masks regions that must not be judged (code, quotes, tables, headings), splits the visible
 * text into sentences and classifies each one. Every decision depends only on characters seen so
 * far plus at most one character of look-ahead, so feeding a text in any chunking yields exactly
 * the same sentences as feeding it at once. `check` and the stream checker both run on it.
 *
 * Cost is linear in the input. There is no recursion and no backtracking regex on unbounded text,
 * so deeply nested `>` quotes or lists and single huge lines are handled in constant stack.
 */

export interface ScanFlags {
  /** Judge list items. */
  lists: boolean;
  tables: boolean;
  headings: boolean;
  quotes: boolean;
}

export interface ScannerHooks {
  onSentence(sentence: SentenceResult): void;
  /** Called for each skipped region. Omit when regions are not needed. */
  onRegion?: (region: SentenceResult) => void;
}

const TERMINATORS = new Set(['.', '!', '?', '…', '。']);
// Characters that may follow a sentence terminator and still belong to the sentence: closing
// brackets/quotes and the emphasis markers of `**bold.**`, `_italic._` and `~~strike.~~`.
const CLOSERS = new Set([')', ']', '’', '”', '」', '』', "'", '*', '_', '~']);
const HTML_OPEN = '<!--';
const QUOTE_PAIRS: Readonly<Record<string, string>> = { '"': '"', '“': '”', '「': '」', '『': '』' };
const SPECIAL_LINE_STARTS = new Set(['`', '~', '>', '#', '|', '-', '*', '+', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
// English abbreviations that end with a period but do not end a sentence.
const ABBREVIATION = /(?:^|[^A-Za-z.])(?:e\.g|i\.e|vs|cf|approx|Dr|Mr|Mrs|Ms)$/i;
const ORDINAL = /(?:^|\s)\d{1,3}$/;
const EMOJI = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}]$/u;
const WS = /\s/;
const TAIL_KEEP = 64;

function isWs(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || (ch.charCodeAt(0) > 0x7f && WS.test(ch)) || ch === '\f' || ch === '\v';
}

function isEmojiChar(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp > 0xff && (cp === 0x200d || cp === 0xfe0f || EMOJI.test(ch));
}

type Phase = 'start' | 'lead' | 'body';

interface Pending {
  kind: 'term' | 'emoji';
  ordinal: boolean;
  abbreviation: boolean;
  prevHangul: boolean;
}

export class Scanner {
  private pos = 0;
  private line = 1;
  private col = 1;
  private held = '';
  private finished = false;

  // Per-line state.
  private phase: Phase = 'start';
  private lead: string[] = [];
  private leadRun = 0; // length of the run of identical first characters in `lead`
  private blankRemaining = 0;
  private maskKind: SkipKind | null = null;
  private tableLine = false;
  private lineInFence = false;
  private fence: { ch: string; len: number } | null = null;
  private openingFence: { ch: string; len: number } | null = null;
  private fenceState = 0; // 0 leading blanks, 1 in marker run, 2 trailing blanks, 3 not a closing line
  private fenceRun = 0;

  // Indented code and HTML comments.
  private lineIndent = 0; // width of the leading blanks of the current line (tab = 4)
  private lineHasContent = false; // a non-blank character was seen on the current line
  private prevBlank = true; // the previous line was blank (the start of the document counts as blank)
  private inIndentedCode = false;
  private listContext = false; // inside a list: indented lines continue an item, they are not code
  private htmlProbe = 0; // how many characters of "<!--" were just seen
  private htmlComment = false; // inside <!-- ... -->, may span lines
  private bodySeen = 0; // non-blank body characters seen so far on the current line
  // A "<!--" in the middle of a line is held back until the line ends or "-->" arrives: it is a
  // comment only if it closes on the same line (CommonMark), otherwise it is plain text.
  private hold: string | null = null;
  private holdLen = 0; // characters held (counted by code point)
  private holdTail = ''; // last three held characters, to spot "-->" without re-reading the buffer
  private replaying = false; // the held characters are being fed back in
  private noComment = false; // while replaying an unclosed "<!--": treat it as text
  private dashRun = 0;

  // Inline state (reset at every line end).
  private inlineCode = 0;
  private tickRun = 0;
  private quoteCloser = '';

  // Current sentence.
  private open = false;
  private sStart = 0;
  private sLine = 0;
  private sCol = 0;
  private cur = '';
  private lastEnd = 0;
  private hasVisible = false;
  private tail = '';
  private pend: Pending | null = null;

  // Current skipped region (only tracked when `onRegion` is set).
  private rKind: SkipKind | null = null;
  private rStart = 0;
  private rLine = 0;
  private rCol = 0;
  private rText = '';

  constructor(
    private readonly flags: ScanFlags,
    private readonly hooks: ScannerHooks,
  ) {}

  /** Feed the next chunk of text. Chunks may split anywhere, even inside a surrogate pair. */
  feed(chunk: string): void {
    let s = this.held + chunk;
    this.held = '';
    if (s.length > 0) {
      const last = s.charCodeAt(s.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) {
        this.held = s.slice(-1);
        s = s.slice(0, -1);
      }
    }
    for (let i = 0; i < s.length; ) {
      const c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        this.consume(s.slice(i, i + 2));
        i += 2;
      } else {
        this.consume(s.charAt(i));
        i += 1;
      }
    }
  }

  /** Signal the end of input and flush the last sentence. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.held) {
      const h = this.held;
      this.held = '';
      this.consume(h);
    }
    if (this.hold !== null) this.releaseHold(false);
    if (this.phase === 'lead') this.decideLead(true);
    this.pend = null;
    this.closeRegion();
    this.emitSentence();
  }

  // ---- character dispatch -------------------------------------------------------------

  private consume(ch: string): void {
    if (this.hold !== null) {
      this.holdChar(ch);
      return;
    }
    if (this.pend) this.resolvePending(ch);
    if (ch === '\n') {
      this.newline();
      return;
    }
    if (this.blankRemaining > 0) {
      this.blankRemaining -= 1;
      this.blank(ch);
      return;
    }
    if (this.lineInFence) {
      if (!isWs(ch)) this.lineHasContent = true;
      this.fenceChar(ch);
      return;
    }
    if (this.htmlComment) {
      this.commentChar(ch);
      return;
    }
    if (this.phase === 'start') {
      if (isWs(ch)) {
        if (!this.lineHasContent) this.lineIndent += ch === '\t' ? 4 : 1;
        this.blank(ch);
        return;
      }
      if (!this.lineHasContent) {
        this.lineHasContent = true;
        if (this.startsIndentedCode()) {
          this.phase = 'body';
          this.maskKind = 'code';
          this.maskLine(ch, 'code');
          return;
        }
      }
      if (!SPECIAL_LINE_STARTS.has(ch)) {
        this.phase = 'body';
        this.body(ch);
        return;
      }
      this.phase = 'lead';
      this.lead = [ch];
      this.leadRun = 1;
      this.decideLead(false);
      return;
    }
    if (this.phase === 'lead') {
      if (this.leadRun === this.lead.length && ch === this.lead[0]) this.leadRun += 1;
      this.lead.push(ch);
      this.decideLead(false);
      return;
    }
    if (this.maskKind) {
      this.maskLine(ch, this.maskKind);
      return;
    }
    this.body(ch);
  }

  private newline(): void {
    if (this.phase === 'lead') this.decideLead(true);
    this.inlineCode = 0;
    this.tickRun = 0;
    this.quoteCloser = '';
    this.htmlProbe = 0;
    this.dashRun = 0;
    this.bodySeen = 0;
    this.closeRegion();
    this.emitSentence();
    this.prevBlank = !this.lineHasContent;
    this.lineHasContent = false;
    this.lineIndent = 0;
    if (this.lineInFence) this.inIndentedCode = false;
    if (this.lineInFence) {
      if ((this.fenceState === 1 || this.fenceState === 2) && this.fence && this.fenceRun >= this.fence.len) this.fence = null;
    } else if (this.openingFence) {
      this.fence = this.openingFence;
    }
    this.openingFence = null;
    this.pos += 1;
    this.line += 1;
    this.col = 1;
    this.phase = 'start';
    this.lead = [];
    this.blankRemaining = 0;
    this.maskKind = null;
    this.tableLine = false;
    this.lineInFence = this.fence !== null;
    this.fenceState = 0;
    this.fenceRun = 0;
  }

  private advance(ch: string): void {
    this.pos += ch.length;
    this.col += ch.length;
  }

  /** Consume a character that belongs to no sentence (indentation, list or quote markers). */
  private blank(ch: string): void {
    this.closeRegion();
    this.advance(ch);
  }

  // ---- line starts: fences, quotes, headings, tables, lists -----------------------------

  /** Decide how to treat the line from its first characters. Replays buffered characters. */
  private decideLead(ended: boolean): void {
    const lead = this.lead;
    const c0 = lead[0] ?? '';
    let mask: SkipKind | null = null;
    let marker = 0; // leading characters that are only markers
    let restart = false; // go back to 'start' after the marker (nested quote markers)

    if (c0 === '`' || c0 === '~') {
      const run = this.leadRun;
      if (run === lead.length && !ended) return;
      if (run >= 3) {
        mask = 'code';
        this.openingFence = { ch: c0, len: run };
      }
    } else if (c0 === '>') {
      if (!this.flags.quotes) mask = 'quote';
      else {
        marker = 1;
        restart = true;
      }
    } else if (c0 === '#') {
      const run = this.leadRun;
      if (run === lead.length && !ended) return;
      if (run <= 6 && run < lead.length && isWs((lead[run] ?? ''))) {
        if (!this.flags.headings) mask = 'heading';
        else marker = run;
      }
    } else if (c0 === '|') {
      if (!this.flags.tables) mask = 'table';
      else this.tableLine = true;
    } else if (c0 === '-' || c0 === '*' || c0 === '+') {
      if (lead.length === 1 && !ended) return;
      if (lead.length > 1 && isWs((lead[1] ?? ''))) {
        this.listContext = true;
        if (!this.flags.lists) mask = 'list';
        else marker = 1;
      }
    } else {
      // digits: ordered-list marker "12." or "12)" followed by a blank
      let run = 1;
      while (run < 10 && /[0-9]/.test((lead[run] ?? ''))) run += 1;
      if (run < 10) {
        if (run === lead.length && !ended) return;
        const sep = (lead[run] ?? '');
        if (sep === '.' || sep === ')') {
          if (run + 1 === lead.length && !ended) return;
          if (run + 1 < lead.length && isWs((lead[run + 1] ?? ''))) {
            this.listContext = true;
            if (!this.flags.lists) mask = 'list';
            else marker = run + 1;
          }
        }
      }
    }

    this.lead = [];
    this.phase = restart ? 'start' : 'body';
    this.maskKind = mask;
    this.blankRemaining = marker;
    // Replay the buffered characters through the normal path (positions advance as they are consumed).
    for (const ch of lead) this.consume(ch);
  }

  /**
   * Called on the first non-blank character of a line. A line indented by 4+ columns is an
   * indented code block when it follows a blank line (or another code line) and no list is open;
   * inside a list the same indentation only continues the item.
   */
  private startsIndentedCode(): boolean {
    if (this.lineIndent >= 4 && !this.listContext && (this.prevBlank || this.inIndentedCode)) {
      this.inIndentedCode = true;
      return true;
    }
    this.inIndentedCode = false;
    if (this.lineIndent === 0) this.listContext = false;
    return false;
  }

  /** Mask the inside of an HTML comment until "-->"; it may continue over several lines. */
  private commentChar(ch: string): void {
    this.lineHasContent = this.lineHasContent || !isWs(ch);
    this.maskInline(ch, 'comment');
    if (ch === '-') this.dashRun += 1;
    else {
      if (ch === '>' && this.dashRun >= 2) this.htmlComment = false;
      this.dashRun = 0;
    }
  }

  private fenceChar(ch: string): void {
    this.maskLine(ch, 'code');
    const fence = this.fence;
    if (!fence) return;
    if (isWs(ch)) {
      if (this.fenceState === 1) this.fenceState = 2;
    } else if (ch === fence.ch && (this.fenceState === 0 || this.fenceState === 1)) {
      this.fenceState = 1;
      this.fenceRun += 1;
    } else {
      this.fenceState = 3;
    }
  }

  // ---- masking --------------------------------------------------------------------------

  /** Mask a character on a line that is skipped as a whole. It never touches a sentence. */
  private maskLine(ch: string, kind: SkipKind): void {
    this.regionAdd(ch, kind);
    this.advance(ch);
  }

  /** Mask a character inside a normal line; it still belongs to the surrounding sentence span. */
  private maskInline(ch: string, kind: SkipKind): void {
    this.regionAdd(ch, kind);
    if (isWs(ch)) {
      if (this.open) {
        this.cur += ch;
        this.pushTail(' ');
      }
    } else {
      this.touch(ch);
      this.pushTail(' ');
    }
    this.advance(ch);
  }

  private regionAdd(ch: string, kind: SkipKind): void {
    if (!this.hooks.onRegion) return;
    if (this.rKind !== kind) {
      this.closeRegion();
      this.rKind = kind;
      this.rStart = this.pos;
      this.rLine = this.line;
      this.rCol = this.col;
      this.rText = '';
    }
    this.rText += ch;
  }

  private closeRegion(): void {
    const kind = this.rKind;
    if (!kind) return;
    this.rKind = null;
    const text = this.rText;
    this.rText = '';
    const trimmed = text.trim();
    if (!trimmed || !this.hooks.onRegion) return;
    const lead = text.length - text.trimStart().length;
    // Region text can span lines inside a fence only line by line, so no newline is inside.
    this.hooks.onRegion({
      text: trimmed,
      start: this.rStart + lead,
      end: this.rStart + lead + trimmed.length,
      line: this.rLine,
      column: this.rCol + lead,
      level: 'unknown',
      ending: '',
      skipped: kind,
    });
  }

  // ---- inline characters ----------------------------------------------------------------

  /** Add a character to the held "<!--" candidate and decide as soon as the answer is known. */
  private holdChar(ch: string): void {
    this.hold = (this.hold ?? '') + ch;
    this.holdLen += 1;
    this.holdTail = (this.holdTail + ch).slice(-3);
    if (this.holdLen <= HTML_OPEN.length && !HTML_OPEN.startsWith(this.hold)) this.releaseHold(false);
    else if (ch === '\n') this.releaseHold(false);
    else if (this.holdLen >= HTML_OPEN.length + 3 && this.holdTail === '-->') this.releaseHold(true);
  }

  /** Feed the held characters back in, as a comment (closed on this line) or as plain text. */
  private releaseHold(closed: boolean): void {
    const held = this.hold ?? '';
    this.hold = null;
    this.holdLen = 0;
    this.holdTail = '';
    this.replaying = true;
    this.noComment = !closed;
    for (const ch of held) this.consume(ch);
    this.replaying = false;
    this.noComment = false;
  }

  private body(ch: string): void {
    if (!isWs(ch)) this.bodySeen += 1;
    if (this.tickRun > 0 && ch !== '`') {
      if (this.inlineCode === 0) this.inlineCode = this.tickRun;
      else if (this.tickRun === this.inlineCode) this.inlineCode = 0;
      this.tickRun = 0;
    }
    if (this.quoteCloser) {
      this.maskInline(ch, 'quote');
      if (ch === this.quoteCloser) this.quoteCloser = '';
      return;
    }
    if (ch === '`') {
      this.tickRun += 1;
      this.maskInline(ch, 'code');
      return;
    }
    if (this.inlineCode > 0) {
      this.maskInline(ch, 'code');
      return;
    }
    if (!this.flags.quotes) {
      const closer = QUOTE_PAIRS[ch];
      if (closer) {
        this.quoteCloser = closer;
        this.maskInline(ch, 'quote');
        return;
      }
    }
    if (ch === '<' && this.bodySeen > 1 && !this.replaying) {
      // Mid-line "<": it may start a comment, so hold it (and what follows) until it is known.
      this.bodySeen -= 1;
      this.hold = ch;
      this.holdLen = 1;
      this.holdTail = ch;
      return;
    }
    if (ch === HTML_OPEN.charAt(this.htmlProbe)) {
      this.htmlProbe += 1;
      if (this.htmlProbe === HTML_OPEN.length && this.noComment) {
        this.htmlProbe = 0; // unclosed on this line: "<!--" stays plain text
      } else if (this.htmlProbe === HTML_OPEN.length) {
        // "<!--" itself stays visible text; drop it from the ending tail and mask what follows.
        this.htmlProbe = 0;
        this.htmlComment = true;
        this.dashRun = 0;
        this.closeRegion();
        this.visible(ch);
        this.tail = this.tail.slice(0, -HTML_OPEN.length);
        return;
      }
    } else {
      this.htmlProbe = ch === '<' ? 1 : 0;
    }
    this.closeRegion();
    this.visible(ch);
  }

  private visible(ch: string): void {
    if (isWs(ch)) {
      if (this.open) {
        this.cur += ch;
        this.pushTail(' ');
      }
      this.advance(ch);
      return;
    }
    if (this.tableLine && ch === '|') {
      this.emitSentence();
      this.advance(ch);
      return;
    }
    this.touch(ch);
    this.hasVisible = true;
    if (TERMINATORS.has(ch)) {
      const p = this.pend;
      if (p && p.kind === 'term') {
        p.ordinal = false;
        p.abbreviation = false;
      } else {
        const before = this.tail;
        this.pend = {
          kind: 'term',
          ordinal: ch === '.' && ORDINAL.test(before),
          abbreviation: ch === '.' && ABBREVIATION.test(before),
          prevHangul: isSyllable(before.charAt(before.length - 1)),
        };
      }
    } else if (CLOSERS.has(ch)) {
      const p = this.pend;
      if (p && p.kind === 'term') {
        p.ordinal = false;
        p.abbreviation = false;
      }
    } else if (isEmojiChar(ch)) {
      if (!this.pend) this.pend = { kind: 'emoji', ordinal: false, abbreviation: false, prevHangul: false };
    }
    this.pushTail(ch);
    this.advance(ch);
  }

  /** Decide, from the next character, whether a pending sentence terminator ended the sentence. */
  private resolvePending(ch: string): void {
    const p = this.pend;
    if (!p) return;
    if (p.kind === 'term') {
      if (TERMINATORS.has(ch) || CLOSERS.has(ch)) return;
    } else if (isEmojiChar(ch)) {
      return;
    }
    this.pend = null;
    const blank = ch === '\n' || isWs(ch);
    let boundary: boolean;
    if (p.kind === 'term') {
      boundary = !p.ordinal && !p.abbreviation && (blank || (p.prevHangul && isSyllable(ch)));
    } else {
      boundary = blank && classifyEnding(this.tail).level !== 'unknown';
    }
    if (boundary) this.emitSentence();
  }

  // ---- sentences ------------------------------------------------------------------------

  private touch(ch: string): void {
    if (!this.open) {
      this.open = true;
      this.sStart = this.pos;
      this.sLine = this.line;
      this.sCol = this.col;
      this.cur = '';
      this.hasVisible = false;
      this.tail = '';
    }
    this.cur += ch;
    this.lastEnd = this.pos + ch.length;
  }

  private pushTail(s: string): void {
    const t = this.tail + s;
    this.tail = t.length > TAIL_KEEP ? t.slice(-TAIL_KEEP) : t;
  }

  private emitSentence(): void {
    if (this.open && this.hasVisible) {
      const text = this.cur.slice(0, this.lastEnd - this.sStart);
      const { level, ending } = classifyEnding(this.tail);
      const sentence: SentenceResult = {
        text,
        start: this.sStart,
        end: this.lastEnd,
        line: this.sLine,
        column: this.sCol,
        level: level as Level,
        ending,
      };
      this.hooks.onSentence(sentence);
    }
    this.open = false;
    this.cur = '';
    this.tail = '';
    this.hasVisible = false;
    this.pend = null;
  }
}
