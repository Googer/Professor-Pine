/**
 * What a nickname that staff add for a Pokémon may be (`/admin nickname add`). The legacy table
 * keeps every nickname of a Pokémon in one string joined with ", ", in lower case; that format
 * stays while the legacy bot reads it.
 */
import { searchTokens } from '../search/text.js';
import { leadingTier } from './tier-words.js';
import { wantWord } from './wants.js';

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 30;

/**
 * Words the options that take a Pokémon read as something else: a tier, shadow, an egg, an IV
 * target, `none` (clears a train's boss). A nickname with one of them as a word would be read
 * that way, or take the word from every Pokémon. Words that only a phrase makes a tier (`5 star`,
 * `tier 5`, `super mega`) are refused as that phrase by `wantWord`, and free by themselves.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'shadow',
  'none',
  'mega',
  'primal',
  'legendary',
  'elite',
  'ex',
  'exclusive',
  'egg',
  'eggs',
  'raid',
  'raids',
  'spawn',
  'spawns',
  'boss',
  'bosses',
  'perfect',
  'hundo',
  'zero',
  'useless',
  'nundo',
]);

/** Letters (with their accents), digits, spaces and hyphens; nothing else. */
const ALLOWED = /^[\p{L}\p{M}\p{N} -]+$/u;
const LETTER = /\p{L}/u;

/** A nickname as it is stored: trimmed, one space between words, lower case. */
export function tidyNickname(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * - `length`: shorter than `NICKNAME_MIN` or longer than `NICKNAME_MAX` characters;
 * - `characters`: something other than letters, digits, spaces and hyphens (a comma would split
 *   the stored string);
 * - `no-letter`: digits alone, which members type as a Pokédex number;
 * - `reserved`: a word the Pokémon options read as something else (`RESERVED_WORDS`), a tier or
 *   IV target as `/want` reads it (`t5`, `5 star`), or a beginning that a raid report reads as
 *   an egg's tier (`leadingTier`: `3 headed dog` would report an egg of tier 3).
 */
export type NicknameProblem = 'length' | 'characters' | 'no-letter' | 'reserved';

/** What is wrong with a tidied nickname (`tidyNickname`); undefined when it can be stored. */
export function nicknameProblem(nickname: string): NicknameProblem | undefined {
  const length = [...nickname].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return 'length';
  if (!ALLOWED.test(nickname)) return 'characters';
  if (!LETTER.test(nickname)) return 'no-letter';
  if (
    wantWord(nickname) ||
    leadingTier(nickname) ||
    searchTokens(nickname).some((word) => RESERVED_WORDS.has(word))
  ) {
    return 'reserved';
  }
  return undefined;
}
