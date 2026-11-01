import { UserError } from '../../discord/errors.js';
import { plain } from '../../render/text.js';
import type { PokebattlerFailure } from '../../services/pokebattler-gateway.js';

/** A query Pokebattler has not worked out lately: the next try is often answered at once. */
export const STILL_WORKING = 'Pokebattler is still working this out: try again in a minute.';

/**
 * What a member is told when Pokebattler gave nothing for a reason that is not about the boss
 * (no answer, too many asking, an answer that could not be read): the same for the raid counters
 * and the max battle teams. Undefined for `unknown` and `empty`, which each says in its own words.
 * A 503 is a query Pokebattler is still computing (the staging of 8X-G: the same query a minute
 * later was answered at once), said as a timeout is (plan 8X-H).
 */
export function troubleText(outcome: PokebattlerFailure): string | undefined {
  switch (outcome.reason) {
    case 'unknown':
    case 'empty':
      return undefined;
    case 'timeout':
      return STILL_WORKING;
    case 'refused':
      return outcome.status === 503
        ? STILL_WORKING
        : 'Pokebattler did not answer just now. Please try again later.';
    case 'unreachable':
    case 'unavailable':
      return 'Pokebattler did not answer just now. Please try again later.';
    case 'busy':
      return 'Many are asking Pokebattler just now. Please try again in a minute.';
    case 'too-large':
    case 'unreadable':
      return 'The answer of Pokebattler could not be read. Please try again later.';
  }
}

/**
 * Whether a failure is not the member's doing, so the use is given back (plan 8X-G): no answer,
 * too many asking, an answer too large or unreadable, or Pokebattler's own error (5xx). A
 * refusal of another kind (4xx: what Pine asked) counts, as an unknown boss does.
 */
export function givesBackFor(outcome: PokebattlerFailure): boolean {
  switch (outcome.reason) {
    case 'unknown':
    case 'empty':
      return false;
    case 'refused':
      return outcome.status === undefined || outcome.status >= 500;
    default:
      return true;
  }
}

/** A page on Pokebattler's site and its words in a sentence (`full results on Pokebattler`). */
export interface SitePage {
  words: string;
  link: string;
}

/**
 * The refusal of a failure that is not about the boss: `troubleText`, but for an answer too large
 * to read the page on Pokebattler's site that the answer's link would open (`site`: a raid's
 * full results, a max battle's Lobby), where the member can read it after all.
 */
export function troubleError(
  outcome: PokebattlerFailure,
  bossTitle: string,
  site: SitePage,
  fallback: string,
): UserError {
  const text =
    outcome.reason === 'too-large'
      ? `Pokebattler’s answer for ${plain(bossTitle)} is too large for me to read. See the ` +
        `[${site.words}](<${site.link}>).`
      : (troubleText(outcome) ?? fallback);
  return new UserError(text, { givesBack: givesBackFor(outcome) });
}
