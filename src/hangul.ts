const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

/** Final-consonant (jongseong) indexes used by the ending rules. */
export const JONG_NIEUN = 4;
export const JONG_MIEUM = 16;
export const JONG_PIEUP = 17;

/** True when `ch` (one UTF-16 unit) is a precomposed Hangul syllable. */
export function isSyllable(ch: string | undefined): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= SYLLABLE_BASE && c <= SYLLABLE_LAST;
}

/** Jongseong index 0..27 of a syllable (0 = none), or -1 when `ch` is not a syllable. */
export function jongseong(ch: string | undefined): number {
  if (!ch || !isSyllable(ch)) return -1;
  return (ch.charCodeAt(0) - SYLLABLE_BASE) % 28;
}
