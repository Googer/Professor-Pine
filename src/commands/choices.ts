import { searchTokens } from '../domain/search/text.js';

/** A choice of the list that appears while a member types an option. */
export interface Choice {
  name: string;
  value: string;
}

/** Discord shows at most this many choices, each with a name of at most 100 characters. */
export const MAX_CHOICES = 25;
export const CHOICE_NAME = 100;

/**
 * Whether the name a guess would be offered under shows the words that were guessed
 * (`PokemonHit.guessed`), so that the reader sees why it is there: `meadow` for `shadow` under
 * `Scatterbug (Meadow Pattern)`, but no Zygarde for `perfect`, which only its key resembles.
 */
export function showsGuessed(name: string, guessed: readonly string[]): boolean {
  const shown = searchTokens(name);
  return guessed.every((word) => shown.includes(word));
}

/** Names in the order a list shows them. */
export const byName = (a: string, b: string): number => a.localeCompare(b, 'en');

/**
 * The order of a member's own things narrowed to what was typed (`text`: trimmed, in lower
 * case): those whose name begins with it first, then by name.
 */
export function beginningFirst(text: string): (a: { name: string }, b: { name: string }) => number {
  const begins = (name: string): boolean => name.toLowerCase().startsWith(text);
  return (a, b) => Number(!begins(a.name)) - Number(!begins(b.name)) || byName(a.name, b.name);
}

/**
 * Two lists of choices as one (plan 8R-6, the 8R staging's finding 5): `first` in its order, and
 * the choices of `more` whose name holds every word typed as a whole word moved up before the
 * first of `first` that is only a near match (a guess: a typed word begins none of its name's
 * words), the rest of `more` after. `rocket` gives Team GO Rocket before Rowlet; nothing
 * changes for words only begun (`dra`), nor in the order of `first`.
 */
export function wholeWordsBeforeGuesses<T extends { name: string }>(
  first: readonly T[],
  more: readonly T[],
  typed: string,
): T[] {
  const words = searchTokens(typed);
  if (words.length === 0) return [...first, ...more];
  const holds = (name: string): boolean => {
    const shown = searchTokens(name);
    return words.every((word) => shown.includes(word));
  };
  const begun = (name: string): boolean => {
    const shown = searchTokens(name);
    return words.every((word) => shown.some((one) => one.startsWith(word)));
  };
  const whole = more.filter((one) => holds(one.name));
  const rest = more.filter((one) => !holds(one.name));
  const at = first.findIndex((one) => !begun(one.name));
  const cut = at < 0 ? first.length : at;
  return [...first.slice(0, cut), ...whole, ...first.slice(cut), ...rest];
}
