/*
 * A short hash of what a member was shown, to tell a choice made then from the data of now: the
 * Which field of `/want`'s dialog (plan 8R-4, review R5), a grunt type's lineup (plan 8R-4L,
 * B13) and a research reward's version (plan 8R-5). Pure, and of no module of its own area, so that both can import it without a cycle.
 */

/** The Which field's hash where a dialog shows none (`whichHash` of no keys). */
export const NO_WHICH = '0';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * A short hash of the keys a Which field showed, in its order (review R5): a Submit whose hash is
 * not that of the keys the field would show now is out of date. FNV-1a of the keys joined by
 * `,`, 32 bits in base 36.
 */
export function whichHash(keys: readonly string[]): string {
  if (keys.length === 0) return NO_WHICH;
  return fnv32(keys.join(',')).toString(36);
}

/**
 * A short hash of a text as 8 hex digits (FNV-1a, 32 bits): a research reward's version in a
 * report's subject (plan 8R-5), far under a choice's 100 characters.
 */
export function hexHash(text: string): string {
  return fnv32(text).toString(16).padStart(8, '0');
}

/** FNV-1a of a text's UTF-8, 32 bits. */
function fnv32(text: string): number {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
  }
  return hash;
}
