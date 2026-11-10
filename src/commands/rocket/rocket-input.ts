import type { AppContext } from '../../app-context.js';
import type { Settings } from '../../config/settings.js';
import { ListChanged, UserError } from '../../discord/errors.js';
import { variedThrottleKey } from '../../discord/router.js';
import type { Throttle } from '../../discord/throttle.js';
import {
  catchesInShort,
  LEADERS,
  lineupChoice,
  lineupValue,
  parseRocketKey,
  rocketKey,
  rocketName,
  typeKeyOf,
  type RocketChoice,
  type RocketWho,
} from '../../domain/rocket/lineups.js';
import { POKEMON_TYPES } from '../../domain/pogo/types.js';
import { searchText, searchTokens } from '../../domain/search/text.js';
import { NOT_SURE_WHICH } from '../../render/rocket.js';
import { plain, truncate } from '../../render/text.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';

/*
 * What `/rocket report` reads (plan 8R-2; design 5.2): who was met (a choice of the lineups:
 * `grunt:water`, or its name typed in full) and the stop.
 */

/** The name `/rocket report` is used and counted under (the router's key of a subcommand). */
export const ROCKET_REPORT = 'rocket report';

/** The name `/rocket remove` is counted under (the map's taking back counts there too). */
export const ROCKET_REMOVE = 'rocket remove';

/** Where `/rocket` works, said wherever it does not. */
export const ROCKET_FROM_A_REGION =
  'Report Team GO Rocket from the channel of a region, its forum or a post there.';

/** Said of a choice gone from the lineups since it was offered. */
export const LINEUPS_CHANGED = 'The lineups just changed: pick again.';

/** Said of a place of another kind than a PokéStop. */
export const NOT_A_ROCKET_STOP =
  'Team GO Rocket is met at PokéStops: pick a PokéStop from the list that appears while you type.';

/** `/rocket report`'s limit, of the settings (10 reports in 30 minutes unless set). */
export function rocketThrottle(settings: Pick<Settings, 'rocket'>): Throttle {
  const { uses, minutes } = settings.rocket.throttle;
  return { uses, perSeconds: minutes * 60 };
}

/**
 * The window `/rocket report` counts in, for the dialog's Submit that carries its use on: its
 * throttle is a function of the settings, so its window is the varied one (design 9.12: a window
 * of its own, not `/research`'s).
 */
export function rocketWindow(settings: Pick<Settings, 'rocket'>): string {
  return variedThrottleKey(ROCKET_REPORT, rocketThrottle(settings));
}

/** What a choice of Giovanni says (design 5.2: report him only once sure it is him). */
const GIOVANNI_NOTE = ' (only when sure it is him)';

/** Why, in full: `/rocket report`'s help, and the note of Giovanni's choice on the map. */
export const GIOVANNI_ONLY_WHEN_SURE =
  'Report Giovanni only once you have seen it is really him: many stops that look like him are ' +
  'decoys, which you report as "Decoy grunt".';

/** A choice as the list offers it: `Water-type grunt · Mudkip, Tentacool, Krabby +2`. */
export function whoChoice(choice: RocketChoice): Choice {
  const catches = catchesInShort(choice.catches);
  const name = `${choice.name}${choice.key === 'giovanni' ? GIOVANNI_NOTE : ''}`;
  return {
    name: truncate(catches === '' ? name : `${name} · ${catches}`, CHOICE_NAME),
    value: choice.key,
  };
}

/**
 * A grunt type's choices once the typed words found it (plan 8R-4L, S8, B3): each lineup by its
 * first slot (`Water-type grunt · Magikarp, Feebas`, picked as `lineupValue`), in the feed's
 * order, then the type itself, "not sure which"; a type of one lineup is its one choice.
 */
function typeChoices(choice: RocketChoice): Choice[] {
  if (choice.lineups === undefined) return [whoChoice(choice)];
  return [
    ...choice.lineups.map((lineup) => ({
      name: truncate(`${choice.name} · ${lineupChoice(choice, lineup).lineup ?? ''}`, CHOICE_NAME),
      value: lineupValue(choice, lineup),
    })),
    { name: truncate(`${choice.name} · ${NOT_SURE_WHICH}`, CHOICE_NAME), value: choice.key },
  ];
}

/** Whether every typed word begins a word of a text. */
function hasWords(text: string, words: readonly string[]): boolean {
  const own = searchTokens(text);
  return words.every((word) => own.some((one) => one.startsWith(word)));
}

/**
 * Every who of Team GO Rocket, with no catches: what `/rocket` offers while no lineups were ever
 * read (a new install without the network), so that a report can still be made.
 */
function bareChoices(): RocketChoice[] {
  const every: RocketWho[] = [
    // In the order the lineups' choices come: grunt types by name first.
    ...[...POKEMON_TYPES].sort().map((type): RocketWho => ({ kind: 'grunt', type })),
    { kind: 'grunt', type: null },
    { kind: 'decoy' },
    ...LEADERS.map((leader): RocketWho => ({ kind: 'leader', leader })),
    { kind: 'giovanni' },
  ];
  return every.map((who) => ({ key: rocketKey(who), name: rocketName(who), catches: [] }));
}

/**
 * The choices of now (fix B5): the grunts of the lineups (every grunt type while there are none),
 * then the hideouts, the decoy, Cliff, Arlo, Sierra and Giovanni, always, with their catches
 * where the lineups have them. Only a grunt type is ever missing.
 */
export function rocketChoices(ctx: Pick<AppContext, 'rocketLineups'>): readonly RocketChoice[] {
  const listed = ctx.rocketLineups.choices();
  const bare = bareChoices();
  const isGrunt = (choice: RocketChoice): boolean => choice.key.startsWith('grunt:');
  const grunts = listed.length > 0 ? listed.filter(isGrunt) : bare.filter(isGrunt);
  const hideouts = bare
    .filter((choice) => !isGrunt(choice))
    .map((choice) => listed.find((one) => one.key === choice.key) ?? choice);
  return [...grunts, ...hideouts];
}

/**
 * The choices of the list the typed words find: those whose name has every typed word (as the
 * beginning of a word), then those that have them among their catches' names (`noibat` finds the
 * Dragon-type grunt), each in the list's order; one per type.
 */
function found(ctx: Pick<AppContext, 'rocketLineups'>, words: readonly string[]): RocketChoice[] {
  const choices = rocketChoices(ctx);
  const byName = choices.filter((choice) => hasWords(choice.name, words));
  const byCatch = choices.filter(
    (choice) =>
      !byName.includes(choice) && hasWords(choice.catches.map((one) => one.name).join(' '), words),
  );
  return [...byName, ...byCatch];
}

/**
 * The choices of the `who` option (`found`). Plan 8R-4L (S8, B4): with nothing typed, one per
 * type; once the words find something, a type of two lineups as its three choices
 * (`typeChoices`), while the whole list fits Discord's 25, else one per type again.
 */
export function whoChoices(ctx: Pick<AppContext, 'rocketLineups'>, typed: string): Choice[] {
  const words = searchTokens(typed);
  const choices = found(ctx, words);
  if (words.length > 0) {
    const apart = choices.flatMap(typeChoices);
    if (apart.length <= MAX_CHOICES) return apart;
  }
  return choices.slice(0, MAX_CHOICES).map(whoChoice);
}

/**
 * The lineup a value `<lineup key>#<fingerprint>` picks, as a choice (`lineupChoice`), while the
 * type's lineups hold that lineup with that fingerprint; `LINEUPS_CHANGED` else (a rotation
 * changed it, the type lost its second lineup).
 */
function lineupOfNow(choices: readonly RocketChoice[], value: string): RocketChoice {
  const mark = value.lastIndexOf('#');
  const key = value.slice(0, mark);
  const who = parseRocketKey(key);
  // Only a lineup's key carries a fingerprint (B14).
  if (who?.kind !== 'grunt' || who.lineup === undefined) throw new ListChanged(LINEUPS_CHANGED);
  const type = choices.find((choice) => choice.key === typeKeyOf(key));
  const lineup = type?.lineups?.find(
    (one) => one.lineup === who.lineup && one.fingerprint === value.slice(mark + 1),
  );
  if (!type || !lineup) throw new ListChanged(LINEUPS_CHANGED);
  return lineupChoice(type, lineup);
}

/** The names a choice is known by, typed: its own, and a grunt's type alone or with `grunt`. */
function namesOf(choice: RocketChoice): string[] {
  const who = parseRocketKey(choice.key);
  const names = [choice.name];
  if (who?.kind === 'grunt' && who.type !== null) {
    names.push(who.type, `${who.type} grunt`, `${who.type} type grunt`);
  }
  if (who?.kind === 'grunt' && who.type === null) names.push('grunt', 'no type grunt');
  if (who?.kind === 'decoy') names.push('decoy');
  return names.map(searchText);
}

/**
 * Who `who:` names (design 5.2): a choice of the list (its key; one no longer in the lineups is
 * `LINEUPS_CHANGED`), or a name typed in full (`Water-type grunt`, `water`, `arlo`); refused
 * otherwise, with what the list offers for the words. Plan 8R-4L (S11, B14): a lineup is picked
 * as `<its key>#<fingerprint>` and taken while the lineups have it so (`lineupChoice`); any other
 * value with `#`, or a lineup's key without one, is `LINEUPS_CHANGED`; a name typed is the merged
 * choice ("not sure which").
 */
export function readWho(ctx: Pick<AppContext, 'rocketLineups'>, value: string): RocketChoice {
  const text = value.trim();
  const choices = rocketChoices(ctx);
  if (text.includes('#')) return lineupOfNow(choices, text);
  const who = parseRocketKey(text);
  if (who !== undefined) {
    const chosen =
      who.kind === 'grunt' && who.lineup !== undefined
        ? undefined
        : choices.find((choice) => choice.key === text);
    if (!chosen) throw new ListChanged(LINEUPS_CHANGED);
    return chosen;
  }
  const folded = searchText(text);
  const named = choices.find((choice) => namesOf(choice).includes(folded));
  if (named) return named;
  // From one choice per type (B5): a type found by its catches is suggested once.
  const suggested = found(ctx, searchTokens(text))
    .slice(0, 5)
    .map((choice) => plain(whoChoice(choice).name.split(' · ')[0] ?? choice.name));
  throw new UserError(
    `I do not know "${plain(truncate(text, 80))}" in Team GO Rocket’s lineups. ` +
      (suggested.length === 0 ? '' : `Did you mean ${suggested.join(', ')}? `) +
      'Pick one from the list that appears while you type.',
  );
}
