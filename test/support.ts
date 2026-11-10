import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Project root, derived from this file's location (no cwd dependence). */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function readExample(name: string): string {
  return readFileSync(new URL(`../examples/answers/${name}`, import.meta.url), 'utf8');
}

/** Split text into pieces of `size` UTF-16 units (may cut surrogate pairs on purpose). */
export function chunked(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
