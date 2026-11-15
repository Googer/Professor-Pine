import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Region } from '../../db/repositories/region-repository.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { Throttle } from '../../discord/throttle.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { LOCATION_FORMS, readLocation } from '../../domain/geo/location-input.js';
import { regionsBox, regionsTouching, widenedBox, type Shape } from '@pine/wayspot-core/shape';
import { fitItems, plainNoLinks, truncate } from '../../render/text.js';
import { container, mapPicture, textDisplay } from '../../render/v2.js';
import { mapOrNothing } from '../../services/static-maps.js';
import { REGION_COLOUR } from '../regions/shared.js';
import type { PlaceOutcome } from '../../services/place-search.js';
import { serverOf } from './server-gym.js';

/** A search of an outside service, with a map: five in a minute. */
export const FIND_REGION_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };

/** The longest place a member may type. */
export const MAX_LOCATION = 200;

/** OpenStreetMap's licence asks that what comes from it says so. */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * How far beyond the box of the regions a name is searched, in kilometres: a town just outside
 * the regions is found, and the answer says it lies in none of them.
 */
export const SEARCH_MARGIN_KM = 10;

/** The regions of the server that have an outline, oldest first. */
async function serverRegions(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<Region[]> {
  const guildRow = await serverOf(interaction, ctx);
  const regions =
    guildRow === undefined
      ? []
      : ctx.regions.all().filter((region) => region.guildId === guildRow && region.bounds !== null);
  if (regions.length === 0) throw new UserError('This server has no regions with an outline.');
  return regions;
}

/** What the member typed, which must say something. */
function typedLocation(interaction: ChatInputCommandInteraction): string {
  const text = interaction.options.getString('location', true).trim();
  if (text === '') throw new UserError('Say which place: its name, its coordinates or a link.');
  if (text.length > MAX_LOCATION) {
    throw new UserError(`A place has at most ${String(MAX_LOCATION)} characters.`);
  }
  return text;
}

/** A place that was read from what was typed, or searched for by its name. */
type Reading =
  { kind: 'point'; point: LatLon; approximate: boolean } | { kind: 'link' } | { kind: 'name' };

/** Coordinates and links are read; a text that is neither is a name to search for. */
function readTyped(text: string): Reading {
  const reading = readLocation(text);
  switch (reading.kind) {
    case 'point':
      return { kind: 'point', point: reading.point, approximate: reading.approximate === true };
    case 'short-link':
      return { kind: 'link' };
    case 'out-of-range':
      throw new UserError(`Those coordinates are no place on earth. ${LOCATION_FORMS}`);
    case 'unreadable':
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
        throw new UserError(`I cannot read a place from that link. ${LOCATION_FORMS}`);
      }
      return { kind: 'name' };
  }
}

/**
 * What can be known before anything is searched or downloaded is refused here, before the
 * answer is deferred and before the use counts.
 */
const requireFindable: Guard = async (interaction, ctx) => {
  if (!interaction.isChatInputCommand()) return;
  readTyped(typedLocation(interaction));
  await serverRegions(interaction, ctx);
};

/** What the member is told when the search gave nothing. */
function failureText(outcome: Extract<PlaceOutcome, { ok: false }>): string {
  switch (outcome.reason) {
    case 'busy':
      return 'Many places are being looked up just now. Please try again in a minute.';
    case 'paused':
      return 'Nominatim asked me to wait; please try again later.';
    case 'disabled':
      return 'Looking up places by name is not set up here. Give coordinates or a map link.';
    case 'refused':
    case 'timeout':
    case 'unreachable':
    case 'too-large':
    case 'unreadable':
      return 'The search for places did not answer just now. Please try again later.';
  }
}

/** Where the place is, and what it is called in the answer (`label`, Markdown that shows as it is). */
async function placeOf(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  text: string,
  regions: readonly Region[],
): Promise<{
  label: string;
  shape: Shape;
  approximate: boolean;
  fromOsm: boolean;
  tooDetailed: boolean;
}> {
  const reading = readTyped(text);
  if (reading.kind === 'point') {
    return {
      label: `**${String(reading.point.lat)}, ${String(reading.point.lon)}**`,
      shape: { kind: 'point', point: reading.point },
      approximate: reading.approximate,
      fromOsm: false,
      tooDetailed: false,
    };
  }
  if (reading.kind === 'link') {
    const followed = await ctx.gymAdmin.readLocation(text);
    if (followed.kind !== 'point') {
      throw new UserError(`I could not follow that link to a place. ${LOCATION_FORMS}`);
    }
    return {
      label: `**${String(followed.point.lat)}, ${String(followed.point.lon)}**`,
      shape: { kind: 'point', point: followed.point },
      approximate: followed.approximate,
      fromOsm: false,
      tooDetailed: false,
    };
  }
  const box = regionsBox(regions);
  if (!box) throw new UserError('This server has no regions with an outline.');
  const outcome = await ctx.places.search(text, widenedBox(box, SEARCH_MARGIN_KM));
  if (!outcome.ok) throw new UserError(failureText(outcome));
  const found = outcome.place;
  if (!found) {
    throw new UserError(
      `I found no place called **${plainNoLinks(truncate(text, 80))}** in or near this ` +
        'server’s regions.',
    );
  }
  ctx.log.info(
    { member: interaction.user.id, found: outcome.found, kind: found.shape.kind },
    'a member looked up the regions of a place',
  );
  return {
    label:
      `**${plainNoLinks(truncate(shortName(found.name), 200))}**` +
      (outcome.found > 1
        ? ` (the most likely of ${String(outcome.found)} places by that name)`
        : ''),
    shape: found.shape,
    approximate: false,
    fromOsm: true,
    tooDetailed: found.tooDetailed === true,
  };
}

/**
 * A place as OpenStreetMap names it, by its first three parts: "Schenley Park, Squirrel Hill
 * North, Pittsburgh" of a name that goes on to the county, the state and the post code. A name
 * without parts is shown whole, and a blank one as "this place".
 */
export function shortName(name: string): string {
  const short = name
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .slice(0, 3)
    .join(', ');
  if (short !== '') return short;
  const whole = name.trim();
  return whole === '' ? 'this place' : whole;
}

/**
 * The sentence of the answer; for a place whose outline had too many corners to read (it was
 * taken by its point), one more that says so.
 */
function answerText(
  label: string,
  shape: Shape,
  found: readonly Region[],
  approximate: boolean,
  tooDetailed: boolean,
): string {
  const after = tooDetailed
    ? ' Its outline is too detailed for me to read, so this is where its center lies.'
    : '';
  return regionsText(label, shape, found, approximate) + after;
}

function regionsText(
  place: string,
  shape: Shape,
  found: readonly Region[],
  approximate: boolean,
): string {
  const where = approximate ? ' (where the map of the link was centered)' : '';
  if (found.length === 0) return `${place}${where} lies in none of this server’s regions.`;
  const channels = fitItems(
    found.map((region) => `<#${region.channelId}>`),
    CHANNELS_SHOWN,
  );
  return shape.kind === 'point'
    ? `${place}${where} lies in ${channels}.`
    : `${place} lies wholly or partly in ${channels}.`;
}

/** How much room the channels of the regions get in the answer of `/find-region`. */
const CHANNELS_SHOWN = 3_000;

/**
 * The answer of `/find-region` as a components-v2 message (plan 8B-4): what the place lies in,
 * the map of the place with those regions at full width (`map`; without one, none), and the
 * licence of OpenStreetMap in small print when the place came from it.
 */
export function findRegionMessage(
  text: string,
  map: string | undefined,
  fromOsm: boolean,
): V2Message {
  const picture = mapPicture(map, 'The place and the regions it lies in');
  return {
    v2: true,
    components: [
      container(REGION_COLOUR, [
        textDisplay(text),
        ...picture.gallery,
        ...(fromOsm ? [textDisplay(`-# ${OSM_ATTRIBUTION}`)] : []),
      ]),
    ],
    ...(picture.files.length === 0 ? {} : { files: picture.files }),
  };
}

/**
 * `/find-region` (spec row 200, the legacy `!find`): which of this server's regions a place
 * lies in. The place is coordinates or a map link (read as `/gym add` reads them), or a name,
 * looked up in OpenStreetMap (Nominatim) among the places of the area the regions cover. The
 * answer names the region channels and shows a map of the place with them; for the member
 * alone. Offered where `settings.findRegion` is set.
 */
export const findRegion: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('find-region')
    .setDescription('Which regions a place lies in')
    .addStringOption((option) =>
      option
        .setName('location')
        .setDescription('A place name, coordinates, or a link from a maps app')
        .setRequired(true)
        .setMaxLength(MAX_LOCATION),
    ),
  help: {
    category: 'util',
    details:
      'Says which of this server’s regions a place lies in, with a map of the place and those ' +
      'regions. Name the place (a park, a street, a town: it is looked up in OpenStreetMap ' +
      'within the area of the regions), or give its coordinates or a link to it from a maps ' +
      'app. Only you see the answer.',
    examples: ['/find-region location:Schenley Park', '/find-region location:40.4406, -79.9959'],
  },
  enabled: (config) => config.settings.findRegion !== undefined,
  guards: [requireGuild, requireFindable],
  defer: 'ephemeral',
  throttle: FIND_REGION_THROTTLE,
  async execute(interaction, ctx) {
    const text = typedLocation(interaction);
    const regions = await serverRegions(interaction, ctx);
    const place = await placeOf(interaction, ctx, text, regions);
    const found = regionsTouching(place.shape, regions);
    // A map that is downloaded takes one of the month's and of the member's day (plan 8Z-2), and
    // of the server's month (plan 19B-5); without one, no map.
    const guildRow = await ctx.guilds.idFor(guildIdOf(interaction));
    const map = await mapOrNothing(
      ctx.maps.place(
        place.shape,
        found.flatMap((region) => (region.bounds ? [region.bounds] : [])),
        () => ctx.mapBudget.spend(interaction.user.id, guildRow),
      ),
      ctx.log,
      'a place',
    );
    const said = answerText(place.label, place.shape, found, place.approximate, place.tooDetailed);
    await interaction.editReply(v2Answer(findRegionMessage(said, map, place.fromOsm)));
  },
};
