import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Region } from '../../db/repositories/region-repository.js';
import { UserError } from '../../discord/errors.js';
import type { ServerChannel } from '../../domain/regions/region-import.js';
import { plain, truncate } from '../../render/text.js';
import type { RegionStaff } from '../../services/region-admin-service.js';
import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { regionHere, regionStaff } from './shared.js';

/** The name of the option by which a subcommand of `/region` takes a region. */
export const REGION_OPTION = 'region';

/** A choice of the list: the row id of the region. */
const CHOSEN = /^id:(\d{1,10})$/iu;
/** A channel as Discord writes a mention of it, or its bare id. */
const CHANNEL = /^(?:<#(\d{15,22})>|(\d{15,22}))$/u;

/** Adds the `region` option to a subcommand: free text, with the server's regions while typing. */
export function withRegionOption(
  builder: SlashCommandSubcommandBuilder,
  description: string,
  required: boolean,
): SlashCommandSubcommandBuilder {
  return builder.addStringOption((option) =>
    option
      .setName(REGION_OPTION)
      .setDescription(description)
      .setRequired(required)
      .setMaxLength(100)
      .setAutocomplete(true),
  );
}

/**
 * A region as the list shows it: the name of its channel, or "deleted channel" with the id
 * for a region whose channel is gone, so that such a region can still be picked.
 */
function shownName(region: Region, channels: readonly ServerChannel[]): string {
  const channel = channels.find((one) => one.id === region.channelId);
  return channel ? `#${channel.name}` : `deleted channel ${region.channelId}`;
}

/**
 * Answers the list of the server's regions for the `region` option: those whose name has what
 * was typed, the ones that begin with it first. Only the regions of the server the command is
 * used in: another server's are neither offered nor accepted.
 */
export async function respondWithRegions(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<void> {
  await interaction.respond(await regionChoices(interaction, ctx));
}

/** The value of the choice "All regions" (`/region export`), which may also be typed. */
export const ALL_REGIONS = 'all';

/**
 * `respondWithRegions` with "All regions" first, while what was typed may still be the
 * beginning of it (`/region export`).
 */
export async function respondWithRegionsOrAll(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<void> {
  const typed = interaction.options.getFocused().trim().toLowerCase();
  const all: Choice[] = 'all regions'.startsWith(typed)
    ? [{ name: 'All regions', value: ALL_REGIONS }]
    : [];
  const choices = await regionChoices(interaction, ctx);
  await interaction.respond([...all, ...choices].slice(0, MAX_CHOICES));
}

/** Whether the `region` option asks for all regions (the choice, or `all` typed). */
export function allRegionsAsked(interaction: ChatInputCommandInteraction): boolean {
  return interaction.options.getString(REGION_OPTION)?.trim().toLowerCase() === ALL_REGIONS;
}

async function regionChoices(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<Choice[]> {
  const staff = await regionStaff(interaction, ctx);
  const channels = ctx.regionAdmin.channelsOf(staff);
  const typed = interaction.options.getFocused().trim().toLowerCase().replace(/^#/u, '');
  const choices: Choice[] = ctx.regionAdmin
    .regionsOf(staff.guildId)
    .map((region) => ({
      name: truncate(shownName(region, channels), CHOICE_NAME),
      value: `id:${region.id}`,
    }))
    .filter((choice) => choice.name.toLowerCase().includes(typed))
    .sort((a, b) => beginningFirst(typed)({ name: a.name.slice(1) }, { name: b.name.slice(1) }))
    .slice(0, MAX_CHOICES);
  return choices;
}

/**
 * The region the `region` option names, among the regions of this server: a choice of the list
 * (`id:<n>`), a mention of its channel or the channel's id, or the channel's exact name (with
 * or without `#`, without case). Without the option: the region of the channel the command is
 * used in (`regionHere`), or undefined when that is none, which the caller answers. Throws a
 * `UserError` for text that names no one region.
 */
export function chosenRegion(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  staff: RegionStaff,
): Region | undefined {
  const typed = interaction.options.getString(REGION_OPTION)?.trim() ?? '';
  if (typed === '') return regionHere(interaction, ctx, staff.guildId);
  const none = new UserError(
    `"${plain(truncate(typed, 80))}" is no region of this server. Pick one from the list; ` +
      '`/region list` shows them all.',
  );
  const chosen = CHOSEN.exec(typed);
  if (chosen) {
    const region = ctx.regionAdmin.regionOf(Number(chosen[1]), staff.guildId);
    if (!region) throw none;
    return region;
  }
  const own = ctx.regionAdmin.regionsOf(staff.guildId);
  const mentioned = CHANNEL.exec(typed);
  if (mentioned) {
    const channelId = mentioned[1] ?? mentioned[2];
    const region = own.find((one) => one.channelId === channelId);
    if (!region) throw none;
    return region;
  }
  const channels = ctx.regionAdmin.channelsOf(staff);
  const wanted = typed.replace(/^#/u, '').toLowerCase();
  const named = own.filter(
    (region) =>
      channels.find((channel) => channel.id === region.channelId)?.name.toLowerCase() === wanted,
  );
  const [region] = named;
  if (!region) throw none;
  if (named.length > 1) {
    throw new UserError(
      `Several regions of this server have a channel called "${plain(truncate(typed, 80))}". ` +
        'Pick the one you mean from the list.',
    );
  }
  return region;
}
