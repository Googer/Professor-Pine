import type { AutocompleteInteraction, SlashCommandStringOption } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { LocatedInteraction } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { regionChannelOf } from '../../discord/guards.js';
import { gymWithId } from '../../render/gym-view.js';
import { plain, truncate } from '../../render/text.js';
import type { GymView } from '../../services/gym-directory.js';
import { calledBy } from '../gyms/gym-option.js';
import { gymChoices, reportedGym } from '../raids/raid-input.js';

/**
 * The `gym` option of the member commands that name a gym of this server (`/find-gym`,
 * `/request`): free text with autocomplete, as `/raid`'s.
 */
export function serverGymOption(description: string, required: boolean) {
  return (option: SlashCommandStringOption): SlashCommandStringOption =>
    option
      .setName('gym')
      .setDescription(description)
      .setRequired(required)
      .setMaxLength(100)
      .setAutocomplete(true);
}

/** `#123`: a gym by its number, as a view of it shows it. */
const BY_NUMBER = /^#(\d{1,10})$/;

/** The row id of the server an interaction came from; undefined for one the bot has no row of. */
export async function serverOf(
  interaction: LocatedInteraction,
  ctx: AppContext,
): Promise<number | undefined> {
  return interaction.guildId === null ? undefined : ctx.guilds.idFor(interaction.guildId);
}

/**
 * The gyms of the server an interaction came from (plan 19B-2, `ctx.gyms.of`): every gym id or
 * name a member gives is read through it, so that no other server's gym is shown or taken. In a
 * DM, or a server without a row, none.
 */
export async function serverGyms(
  interaction: { guildId: string | null },
  ctx: AppContext,
): Promise<GymView> {
  return ctx.gyms.of(
    interaction.guildId === null ? undefined : await ctx.guilds.idFor(interaction.guildId),
  );
}

/** Whether a gym of the server lies in one of its regions: only those are shown or taken here. */
export function inRegions(gyms: GymView): (gym: Gym) => boolean {
  return (gym) => gyms.regionsOf(gym.id).length > 0;
}

/** Digits alone: the number of a gym of this server, unless another gym is called so. */
const BARE_NUMBER = /^(\d{1,10})$/;

/**
 * The gym of this server a `gym` option names: a choice of the list, `#<number>`, digits alone
 * (as for `/gym`: the number of a gym of this server, unless another gym of it is called by
 * those digits, when both are named), or text that only one gym of the server has every word
 * of (`reportedGym`, the region of the channel first). A text that only one gym may mean (a
 * misspelling) or several gyms fit is answered with them and their numbers, for the member to
 * pick one; nothing is guessed.
 */
export async function serverGym(
  ctx: AppContext,
  interaction: LocatedInteraction,
  typed: string,
): Promise<Gym> {
  const gyms = await serverGyms(interaction, ctx);
  const accepts = inRegions(gyms);
  const text = typed.trim();
  const quoted = `"${plain(truncate(text, 80))}"`;
  const number = BY_NUMBER.exec(text)?.[1];
  if (number !== undefined) {
    const gym = gyms.get(Number(number));
    if (gym && accepts(gym)) return gym;
    throw new UserError(`This server has no gym #${number}.`);
  }
  const digits = BARE_NUMBER.exec(text)?.[1];
  const numbered = digits === undefined ? undefined : gyms.get(Number(digits));
  if (digits !== undefined && numbered && accepts(numbered)) {
    // Another gym that is called so: the digits are a word of its name, nickname or keywords.
    const named = gyms
      .search(null, digits)
      .map((hit) => hit.gym)
      .filter((gym) => gym.id !== numbered.id && accepts(gym) && calledBy(gym, digits));
    if (named.length === 0) return numbered;
    throw new UserError(
      `${quoted} is the number of one gym and in the name of another: ` +
        `${[numbered, ...named].map((gym) => gymWithId(gym)).join(', ')}. Pick one from the ` +
        `list, or write the number as \`#${digits}\`.`,
    );
  }
  // Digits that are no number of a gym here are text, but only for gyms called by them: the
  // search also finds a gym by the beginning of its number (`105` finds gym 1050), which is not
  // a gym called so (as for `/gym`).
  const found = reportedGym(
    gyms,
    regionChannelOf(interaction, ctx),
    text,
    digits === undefined ? accepts : (gym) => accepts(gym) && calledBy(gym, digits),
  );
  if (found.kind === 'gym') return found.gym;
  if (found.kind === 'none' && digits !== undefined) {
    throw new UserError(`This server has no gym #${digits}.`);
  }
  if (found.kind === 'none') {
    throw new UserError(
      `I found no gym of this server for ${quoted}. Type part of its name and pick it from the ` +
        'list.',
    );
  }
  const [only] = found.gyms;
  if (only && found.gyms.length === 1) {
    throw new UserError(
      `No gym has every word of ${quoted}; did you mean ${gymWithId(only)}? Pick it from the ` +
        `list, or give its number (\`#${String(only.id)}\`).`,
    );
  }
  throw new UserError(
    `Several gyms fit ${quoted}: ${found.gyms.map((gym) => gymWithId(gym)).join(', ')}. Pick ` +
      'one from the list, or give its number (`#123`).',
  );
}

/** The choices of the `gym` option: the gyms of this server, the region's own first. */
export async function respondWithServerGyms(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'gym') {
    await interaction.respond([]);
    return;
  }
  const regionName = (channelId: string): string | undefined =>
    interaction.guild?.channels.cache.get(channelId)?.name;
  const gyms = await serverGyms(interaction, ctx);
  await interaction.respond(
    gymChoices(
      gyms,
      regionChannelOf(interaction, ctx),
      String(focused.value),
      regionName,
      inRegions(gyms),
    ),
  );
}
