import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, regionChannelOf } from '../../discord/guards.js';
import { tidyLine } from '../../domain/gyms/gym-text.js';
import type { GymHit } from '../../domain/search/gym-lookup.js';
import { searchTokens } from '../../domain/search/text.js';
import { gymWithId } from '../../render/gym-view.js';
import { plain, truncate } from '../../render/text.js';
import { byName, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { clearGymHit } from '../raids/raid-input.js';

/** The name of the option by which a subcommand of `/gym` takes an existing gym. */
export const GYM_OPTION = 'gym';

/** A gym by its number, written so that it cannot be anything else: `id:123` (a choice), `#123`. */
const EXPLICIT_NUMBER = /^(?:id:|#)(\d{1,10})$/i;
/** Digits alone: the number of a gym, or a name that is a number ("1776"). */
const BARE_NUMBER = /^(\d{1,10})$/;
/** How many gyms a refusal of typed text suggests. */
const SUGGESTIONS = 5;

/** Whether the staff of the server an interaction comes from may touch a gym. */
type Reach = (gym: Pick<Gym, 'id'>) => boolean;

/**
 * Which gyms the staff of the server of an interaction may touch (Matt, 2026-10-13): those in
 * a region of their server, and those in no region of any server
 * (`GymAdminService.mayTouch`). A gym that lies only in regions of other servers is, for
 * everything the `gym` option does, a gym that does not exist: it is not offered, not found
 * and not accepted by its number, and no answer says whose it is. This is the one place the
 * option decides it; every subcommand that takes a gym goes through `chosenGym`.
 */
async function reachOf(interaction: { guildId: string | null }, ctx: AppContext): Promise<Reach> {
  const guildId = await ctx.guilds.idFor(guildIdOf(interaction));
  return (gym) => ctx.gymAdmin.mayTouch(gym.id, guildId);
}

/**
 * The gyms a text names, for staff, among the gyms they may touch (`within`): what the search
 * finds from the region of the channel (its own gyms, then those just outside it), then what
 * it finds among all gyms, as many of each as a list of choices holds. Gyms that have only
 * some of the words (guesses) are given only when no gym within reach has every word.
 */
function staffGymHits(
  ctx: AppContext,
  regionChannelId: string | undefined,
  text: string,
  within: Reach,
): GymHit<Gym>[] {
  const limit = MAX_CHOICES;
  // Searched without a limit and cut afterwards: the gyms of other servers must not use up
  // the places of those that may be shown.
  const near =
    regionChannelId === undefined
      ? []
      : ctx.gyms
          .search(regionChannelId, text)
          .filter((hit) => within(hit.gym))
          .slice(0, limit);
  const seen = new Set(near.map((hit) => hit.gym.id));
  // As many again from everywhere: those already found from the region do not count.
  const anywhere = ctx.gyms
    .search(null, text)
    .filter((hit) => !seen.has(hit.gym.id) && within(hit.gym))
    .slice(0, limit);
  const all = [...near, ...anywhere];
  const whole = all.filter((hit) => hit.allWords);
  return (whole.length > 0 ? whole : all).slice(0, limit);
}

/** Adds the `gym` option to a subcommand: free text, with the list of gyms while typing. */
export function withGymOption(
  builder: SlashCommandSubcommandBuilder,
  description = 'The gym: type part of its name and pick it, or give its number (#123)',
): SlashCommandSubcommandBuilder {
  return builder.addStringOption((option) =>
    option
      .setName(GYM_OPTION)
      .setDescription(description)
      .setRequired(true)
      .setMaxLength(100)
      .setAutocomplete(true),
  );
}

/**
 * A gym as a choice of the list: its name, its nickname and its number, which is what tells two
 * gyms of one name apart and therefore always stays: the texts before it are cut to fit. A
 * choice is shown as it is, so control characters and invisible formatting characters of a
 * legacy name are taken out (a direction override would turn the number around).
 */
function gymChoice(gym: Pick<Gym, 'id' | 'name' | 'nickname'>): Choice {
  const number = ` · #${gym.id}`;
  const nickname = gym.nickname ? tidyLine(gym.nickname) : '';
  // A legacy name of nothing but invisible characters shows as nothing: say what it is.
  const name = tidyLine(gym.name) || 'Gym';
  const texts = [name, ...(nickname === '' ? [] : [nickname])].join(' · ');
  return {
    name: `${truncate(texts, CHOICE_NAME - number.length)}${number}`,
    value: `id:${gym.id}`,
  };
}

/**
 * The choices for the `gym` option: every gym within the server's reach (`reachOf`) that fits
 * what was typed (`staffGymHits`: the gyms of the region the command is used in first). A
 * number finds the gym with that number first. While nothing is typed: the gyms of the region,
 * by name.
 */
async function gymChoices(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<Choice[]> {
  const typed = interaction.options.getFocused().trim();
  const region = regionChannelOf(interaction, ctx);
  const within = await reachOf(interaction, ctx);
  if (typed === '') {
    if (region === undefined) return [];
    return ctx.gyms
      .inRegion(region)
      .filter(within)
      .sort((a, b) => byName(a.name, b.name) || a.id - b.id)
      .slice(0, MAX_CHOICES)
      .map(gymChoice);
  }
  const numbered = EXPLICIT_NUMBER.exec(typed) ?? BARE_NUMBER.exec(typed);
  const byNumber = numbered ? reachable(ctx, Number(numbered[1]), within) : undefined;
  const found = staffGymHits(ctx, region, typed, within).map((hit) => hit.gym);
  const gyms = byNumber ? [byNumber, ...found.filter((gym) => gym.id !== byNumber.id)] : found;
  return gyms.slice(0, MAX_CHOICES).map(gymChoice);
}

/** Answers the list of gyms for the `gym` option of a subcommand of `/gym`. */
export async function respondWithGyms(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<void> {
  await interaction.respond(await gymChoices(interaction, ctx));
}

/** The gym with this number, when the server may touch it: any other number is no gym's. */
function reachable(ctx: AppContext, id: number, within: Reach): Gym | undefined {
  const gym = ctx.gyms.get(id);
  return gym && within(gym) ? gym : undefined;
}

/** Whether a word is one of the words staff gave a gym: of its name, nickname or keywords. */
export function calledBy(gym: Gym, word: string): boolean {
  return [gym.name, gym.nickname ?? '', ...gym.keywords].some((text) =>
    searchTokens(text).includes(word),
  );
}

const listed = (gyms: readonly Gym[]): string =>
  gyms
    .slice(0, SUGGESTIONS)
    .map((gym) => `- ${gymWithId(gym)}`)
    .join('\n');

/**
 * The gym the `gym` option names: a choice of the list or a number with its sign (`id:123`,
 * `#123`), which is always that gym; or text. Text is acted on only when it clearly means one
 * gym (the rule of `/raid`: exactly one gym has every word as typed); otherwise it is refused,
 * with the gyms it might mean.
 *
 * Digits alone are the number of a gym, unless they are also in the name of another gym (a gym
 * called "1776"): then neither is acted on, and both are named. Digits that are no gym's number
 * are text like any other. Throws a `UserError` for anything that names no one gym.
 *
 * All of it among the gyms the server may touch (`reachOf`): the gym of another server is
 * refused by its number as a number no gym has, and by its name as a name that finds nothing.
 */
export async function chosenGym(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<Gym> {
  const typed = interaction.options.getString(GYM_OPTION, true).trim();
  const quoted = `"${plain(truncate(typed, 80))}"`;
  const within = await reachOf(interaction, ctx);
  const explicit = EXPLICIT_NUMBER.exec(typed);
  if (explicit) {
    const gym = reachable(ctx, Number(explicit[1]), within);
    if (!gym) throw new UserError(`There is no gym #${explicit[1] ?? ''}.`);
    return gym;
  }
  const found = staffGymHits(ctx, regionChannelOf(interaction, ctx), typed, within);
  const digits = BARE_NUMBER.test(typed);
  // The search also finds a gym by its own number, and by the beginning of it. For digits a
  // gym that was found by its number alone is not one that is called so: `12` is gym 12, never
  // gym 120. One that has the digits as a word of its own ("12 Apostles", gym 120) stays.
  const hits = digits
    ? found.filter((hit) => calledBy(hit.gym, typed) || !String(hit.gym.id).startsWith(typed))
    : found;
  const numbered = digits ? reachable(ctx, Number(typed), within) : undefined;
  if (numbered) {
    // Another gym that is called so: the digits are a word of its name, its nickname or its
    // keywords (an address with that house number does not make a gym be called so). The gym
    // with that number is not another gym ("Engine 12 Firehouse", gym 12).
    const named = hits
      .map((hit) => hit.gym)
      .filter((gym) => gym.id !== numbered.id && calledBy(gym, typed));
    if (named.length === 0) return numbered;
    throw new UserError(
      `${quoted} is the number of one gym and in the name of another. Pick the one you mean ` +
        `from the list, or write the number as \`#${typed}\`:\n${listed([numbered, ...named])}`,
    );
  }
  const clear = clearGymHit(hits);
  if (clear) return clear;
  if (hits.length === 0) {
    throw new UserError(
      `I found no gym for ${quoted}. Type part of its name and pick it from the list, or give ` +
        'its number (`#123`).',
    );
  }
  throw new UserError(
    `${quoted} does not name one gym for certain. Pick it from the list, or give its number:\n` +
      listed(hits.map((hit) => hit.gym)),
  );
}
