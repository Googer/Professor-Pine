/*
 * The words of the completion question (whether a member who was here is done too), on Discord
 * and on the map (plan 8M-8B, review W-4), without an import, so that the map's page takes them
 * whole: one wording for both.
 */

/** The question, after the members it names on Discord: `have you completed this raid?`. */
export function completionAsk(word: string): string {
  return `have you completed this ${word}?`;
}

/** What no answer means, after when it is no longer waited for. */
export const TAKEN_AS_DONE = 'I will take it that you have.';

/** The two answers. */
export const YES_DONE = 'Yes, done';
export const NOT_YET = 'Not yet';
