/** Helpers for reading chat logs in JSON Lines form. Pure functions, no I/O. */

/** JSON nested deeper than this is rejected before parsing. */
export const MAX_JSON_DEPTH = 100;

export interface TextUnit {
  text: string;
  /** Index into `messages[]` when the text came from a message list. */
  index?: number;
}

export interface Extraction {
  units: TextUnit[];
  warnings: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deepest bracket nesting of a JSON text, ignoring brackets inside strings. Linear, no recursion. */
export function jsonDepth(source: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i += 1; // backslash escape
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) inString = true;
    else if (c === 0x7b || c === 0x5b) {
      depth += 1;
      if (depth > max) max = depth;
    } else if (c === 0x7d || c === 0x5d) depth -= 1;
  }
  return max;
}

/** Read a dotted path such as `reply.text`, following own properties only. */
export function getPath(record: unknown, path: string): unknown {
  let current: unknown = record;
  for (const key of path.split('.')) {
    if (!isObject(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Pick the texts to check from one JSONL record.
 *
 * - With `fieldGiven` false and a `messages` array: every message whose `role` equals `role`.
 * - Otherwise the `field` path (default `content`); a record whose own `role` differs is skipped.
 */
export function extractTexts(record: unknown, field: string, fieldGiven: boolean, role: string): Extraction {
  const units: TextUnit[] = [];
  const warnings: string[] = [];
  if (!isObject(record)) {
    warnings.push('record is not a JSON object, skipped');
    return { units, warnings };
  }
  if (!fieldGiven && Array.isArray(record.messages)) {
    record.messages.forEach((message: unknown, index: number) => {
      if (!isObject(message) || message.role !== role) return;
      if (typeof message.content === 'string') units.push({ text: message.content, index });
      else warnings.push(`messages[${index}].content is not a string, skipped`);
    });
    return { units, warnings };
  }
  if (typeof record.role === 'string' && record.role !== role) return { units, warnings };
  const value = getPath(record, field);
  if (typeof value === 'string') units.push({ text: value });
  else if (value === undefined) warnings.push(`field "${field}" not found, skipped`);
  else warnings.push(`field "${field}" is not a string, skipped`);
  return { units, warnings };
}
