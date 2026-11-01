import { distance } from 'fastest-levenshtein';
import { searchTokens } from './text.js';

/** One thing that can be found, with every name it answers to. */
export interface Named<T> {
  value: T;
  names: readonly string[];
}

/**
 * Wrong letters allowed: none in fewer than five letters, one up to seven, two beyond. Stricter
 * than the big searches, because here a wrong guess acts ("done" must not be read as "none").
 * A misspelling must also keep the first letter and may not add words, so that "no coming" and
 * "unprivate" are not read as "coming" and "private".
 */
function strictTypos(text: string): number {
  if (text.length < 5) return 0;
  return text.length < 8 ? 1 : 2;
}

/** How well a typed text fits one name; 0 means not at all. */
function fit(typed: readonly string[], name: readonly string[]): number {
  const typedJoined = typed.join('');
  const nameJoined = name.join('');
  if (typedJoined === nameJoined) return 100;
  // One or two letters are too little to guess from ("no" is not "none").
  if (typedJoined.length < 3) return 0;
  if (nameJoined.startsWith(typedJoined)) return 80;
  // Every typed word begins a word of the name ("hydro can" for Hydro Cannon).
  if (typed.every((word) => name.some((part) => part.startsWith(word)))) return 60;
  const edits = distance(typedJoined, nameJoined);
  if (
    edits <= strictTypos(typedJoined) &&
    typedJoined[0] === nameJoined[0] &&
    typed.length <= name.length
  ) {
    return 40 - edits;
  }
  // Every typed word is a word of the name, give or take a letter.
  const close = typed.every((word) =>
    name.some((part) => word[0] === part[0] && distance(word, part) <= strictTypos(word)),
  );
  return close ? 20 : 0;
}

/**
 * Finds things in a short list (a boss's moves, the status words) by what a member typed: the
 * exact name first, then names that begin with the text, names whose words begin with the typed
 * words, and near misspellings. Anything but the exact name needs at least three letters. A
 * misspelling must keep the first letter and may not add words, so that "no coming" and
 * "unprivate" are not read as "coming" and "private".
 * Spaces, case, accents and punctuation do not matter. Best fit first; equal fits keep the order
 * of the list. Each value is returned once.
 */
export function matchNamed<T>(candidates: readonly Named<T>[], text: string): T[] {
  const typed = searchTokens(text);
  if (typed.length === 0) return [];
  const scored: { value: T; score: number; order: number }[] = [];
  candidates.forEach((candidate, order) => {
    const score = Math.max(0, ...candidate.names.map((name) => fit(typed, searchTokens(name))));
    if (score > 0) scored.push({ value: candidate.value, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return [...new Set(scored.map((entry) => entry.value))];
}
