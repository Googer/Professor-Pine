import {
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type APIButtonComponentWithCustomId,
  type SlashCommandStringOption,
} from 'discord.js';
import { ringContains } from '@pine/wayspot-core/region-membership';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, LocatedInteraction } from '../../discord/command.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireBotManagement } from '../../discord/guards.js';
import { answerApart, showInPlace } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { tidyLine } from '../../domain/gyms/gym-text.js';
import {
  MAX_PINE_STOP_ADDRESS,
  MAX_PINE_STOP_NAME,
  type PineStop,
  type PineStopChange,
} from '../../domain/stops/pine-stop.js';
import { pineStopKey } from '../../domain/stops/report.js';
import { distanceWords } from '../../render/distance-words.js';
import { GYM_COLOUR, regionsSentence } from '../../render/gym-view.js';
import { count, endSentence, plain, truncate } from '../../render/text.js';
import { actionRow, textMessage } from '../../render/v2.js';
import { EXPIRED, NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
import { PINE_STOP_NEAR_METRES } from '../../services/pine-stops.js';
import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { LOCATION_OPTION, placeOrRefuse, pointLink } from '../gyms/shared.js';
import { serverValuesOf } from '../../discord/server-values.js';

/** The custom-id kind of the question of `/pokestop add`: `pokestop:<token>:add|cancel`. */
export const POKESTOP_KIND = 'pokestop';

/** What `/pokestop add` keeps while it asks "Add anyway?". */
interface PendingStop {
  serverId: string;
  name: string;
  point: LatLon;
  address: string | null;
}

/** The questions of `/pokestop add`, an hour (as long as staff might look elsewhere first). */
const pendingStops = new PendingRequests<PendingStop>({ ttlMs: 60 * 60_000, max: 200 });

/** Said of a place that lies in no region of the server. */
export const STOP_NOT_HERE =
  'That place lies in no region of this server: nobody here could report at a stop there.';

/** Said of a `stop` that names no stop of Pine's own of this server. */
export const NO_SUCH_STOP =
  'I know no PokéStop of Pine’s own here by that name: pick one from the list that appears while ' +
  'you type.';

/** As many stops near a new one as the question names; the rest are counted. */
const NEAR_SHOWN = 3;

/** A stop of Pine's own as an answer names it: `**Coffee Corner** (pine-3)`. */
function stopWithKey(stop: Pick<PineStop, 'id' | 'name'>): string {
  return `**${plain(truncate(stop.name, MAX_PINE_STOP_NAME))}** (\`${pineStopKey(stop.id)}\`)`;
}

/** The regions of this server whose outlines hold a point. */
async function regionsAt(
  interaction: LocatedInteraction,
  ctx: AppContext,
  point: LatLon,
): Promise<{ channelId: string }[]> {
  const row = await ctx.guilds.idFor(guildIdOf(interaction));
  return ctx.regions
    .all()
    .filter(
      (region) =>
        row !== undefined &&
        region.guildId === row &&
        region.bounds !== null &&
        ringContains(region.bounds, point),
    );
}

/** A name as staff typed it, tidied; refused when empty or too long. */
function stopName(typed: string): string {
  const name = tidyLine(typed);
  if (name === '') throw new UserError('A PokéStop needs a name.');
  if (name.length > MAX_PINE_STOP_NAME) {
    throw new UserError(
      `The name is too long: a PokéStop's name may have ${MAX_PINE_STOP_NAME} characters.`,
    );
  }
  return name;
}

/** An address as staff typed it: `-` or `none` takes it away (null). */
function stopAddress(typed: string): string | null {
  const address = tidyLine(typed);
  if (address === '' || address === '-' || address.toLowerCase() === 'none') return null;
  if (address.length > MAX_PINE_STOP_ADDRESS) {
    throw new UserError(
      `The address is too long: it may have ${MAX_PINE_STOP_ADDRESS} characters.`,
    );
  }
  return address;
}

/** A place staff typed, read as `/gym add` reads one, in a region of this server. */
async function stopPlace(
  interaction: LocatedInteraction,
  ctx: AppContext,
  typed: string,
): Promise<{ point: LatLon; regions: { channelId: string }[] }> {
  const { point } = placeOrRefuse(await ctx.gymAdmin.readLocation(typed));
  const regions = await regionsAt(interaction, ctx, point);
  if (regions.length === 0) throw new UserError(STOP_NOT_HERE);
  return { point, regions };
}

function button(
  token: string,
  action: 'add' | 'cancel',
  label: string,
  style: ButtonStyle.Primary | ButtonStyle.Secondary,
) {
  const made: APIButtonComponentWithCustomId = {
    type: ComponentType.Button,
    custom_id: encodeCustomId({ kind: POKESTOP_KIND, id: token, action }),
    label,
    style,
  };
  return made;
}

/** What an added stop's answer says. */
function addedMessage(stop: PineStop, regions: readonly { channelId: string }[]): V2Message {
  return textMessage(GYM_COLOUR, [
    `Added the PokéStop ${stopWithKey(stop)} at ${pointLink(stop)}. ${regionsSentence(regions)}`,
    'Members find it in `/research`, `/wild near:` and `/meetup` from now on.',
  ]);
}

/**
 * `/pokestop add name: at: [address:]`: a sponsored stop (design 3). Within
 * `PINE_STOP_NEAR_METRES` of a PokéStop (an imported one or one of Pine's own of this server) it
 * asks "Add anyway?", as `/gym add` asks near a gym; otherwise it adds it at once.
 */
const addStop: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Add a PokéStop Wayfarer does not list (a sponsored one)')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The name of the PokéStop, as in the game')
        .setRequired(true)
        .setMaxLength(MAX_PINE_STOP_NAME),
    )
    .addStringOption((option) =>
      option.setName('at').setDescription(LOCATION_OPTION).setRequired(true).setMaxLength(1_000),
    )
    .addStringOption((option) =>
      option
        .setName('address')
        .setDescription('Its street address, shown under its name')
        .setMaxLength(MAX_PINE_STOP_ADDRESS),
    ),
  help: {
    details: (_settings, facts) =>
      'Adds a PokéStop that the Wayfarer export does not have (sponsored stops are missing there) ' +
      'to this server. `at` is the link Pokémon GO shares for the stop, a maps link or ' +
      'coordinates; it must lie in a region of this server.\n\nMembers then find it wherever a ' +
      `PokéStop is asked for. Within ${distanceWords(PINE_STOP_NEAR_METRES, facts?.server?.distanceUnits ?? 'imperial')} of another ` +
      'PokéStop I ask before adding it: it may be listed already.',
    examples: ['/pokestop add name:Coffee Corner at:40.4406, -79.9959 address:12 Market Street'],
  },
  // A short link is followed (`readLocation`), which may take a moment.
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const name = stopName(interaction.options.getString('name', true));
    const address = stopAddress(interaction.options.getString('address') ?? '');
    const { point, regions } = await stopPlace(
      interaction,
      ctx,
      interaction.options.getString('at', true),
    );
    const serverId = guildIdOf(interaction);
    const near = ctx.pineStops.nearStops(point, serverId);
    if (near.length === 0) {
      const stop = await ctx.pineStops.add({
        serverId,
        name,
        lat: point.lat,
        lon: point.lon,
        address,
        createdBy: interaction.user.id,
        createdAt: Date.now(),
      });
      await answerApart(interaction, addedMessage(stop, regions));
      return;
    }
    const token = pendingStops.put(interaction.user.id, { serverId, name, point, address });
    const listed = near
      .slice(0, NEAR_SHOWN)
      .map(
        ({ wayspot, metres }) =>
          `- **${plain(truncate(wayspot.title, 80))}**, ${distanceWords(metres, serverValuesOf(interaction, ctx).distanceUnits)} away`,
      );
    await answerApart(
      interaction,
      textMessage(
        GYM_COLOUR,
        [
          `Add the PokéStop **${plain(name)}** at ${pointLink(point)}?`,
          [
            near.length === 1
              ? `A PokéStop lies within ${distanceWords(PINE_STOP_NEAR_METRES, serverValuesOf(interaction, ctx).distanceUnits)} of that place:`
              : `${count(near.length, 'PokéStop')} lie within ` +
                `${distanceWords(PINE_STOP_NEAR_METRES, serverValuesOf(interaction, ctx).distanceUnits)} of that place:`,
            ...listed,
            ...(near.length > NEAR_SHOWN ? [`- …and ${near.length - NEAR_SHOWN} more`] : []),
          ].join('\n'),
        ],
        [
          actionRow([
            button(token, 'add', 'Add anyway', ButtonStyle.Primary),
            button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
          ]),
        ],
      ),
    );
  },
};

/** The stop the `stop` option names, of this server. */
function namedStop(interaction: LocatedInteraction, ctx: AppContext, value: string): PineStop {
  const serverId = guildIdOf(interaction);
  const typed = value.trim();
  const byKey = ctx.pineStops.get(serverId, typed);
  if (byKey) return byKey;
  const byName = ctx.pineStops
    .ofServer(serverId)
    .filter((stop) => stop.name.toLowerCase() === typed.toLowerCase());
  const [only] = byName;
  if (only && byName.length === 1) return only;
  throw new UserError(NO_SUCH_STOP);
}

/** The choices of the `stop` option: this server's stops of Pine's own that fit what was typed. */
function stopChoices(interaction: LocatedInteraction, ctx: AppContext, typed: string): Choice[] {
  if (!interaction.inGuild()) return [];
  const text = typed.trim().toLowerCase();
  return ctx.pineStops
    .ofServer(guildIdOf(interaction))
    .map((stop) => ({ stop, name: stop.name }))
    .filter(({ name }) => text === '' || name.toLowerCase().includes(text))
    .sort(beginningFirst(text))
    .slice(0, MAX_CHOICES)
    .map(({ stop }) => ({
      name: truncate(
        `${stop.name}${stop.address === null ? '' : ` · ${stop.address}`}`,
        CHOICE_NAME,
      ),
      value: pineStopKey(stop.id),
    }));
}

const stopOption = (option: SlashCommandStringOption) =>
  option
    .setName('stop')
    .setDescription('A PokéStop of Pine’s own: pick from the list')
    .setRequired(true)
    .setMaxLength(MAX_PINE_STOP_NAME)
    .setAutocomplete(true);

/** `/pokestop edit stop: [name:] [at:] [address:]`. */
const editStop: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('edit')
    .setDescription('Change a PokéStop of Pine’s own')
    .addStringOption(stopOption)
    .addStringOption((option) =>
      option.setName('name').setDescription('Its new name').setMaxLength(MAX_PINE_STOP_NAME),
    )
    .addStringOption((option) =>
      option.setName('at').setDescription(LOCATION_OPTION).setMaxLength(1_000),
    )
    .addStringOption((option) =>
      option
        .setName('address')
        .setDescription('Its new street address; - takes it away')
        .setMaxLength(MAX_PINE_STOP_ADDRESS),
    ),
  help: {
    details:
      'Changes the name, the place or the address of a PokéStop added with `/pokestop add` ' +
      '(`address:-` takes the address away). Reports made at it today keep it as it was.',
    examples: ['/pokestop edit stop:Coffee Corner name:Corner Coffee'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const stop = namedStop(interaction, ctx, interaction.options.getString('stop', true));
    const change: PineStopChange = {};
    const name = interaction.options.getString('name');
    if (name !== null) change.name = stopName(name);
    const address = interaction.options.getString('address');
    if (address !== null) change.address = stopAddress(address);
    const at = interaction.options.getString('at');
    if (at !== null) {
      const { point } = await stopPlace(interaction, ctx, at);
      change.lat = point.lat;
      change.lon = point.lon;
    }
    if (Object.keys(change).length === 0) {
      throw new UserError('Say what to change: `name`, `at` or `address`.');
    }
    const changed = await ctx.pineStops.edit(
      stop.id,
      guildIdOf(interaction),
      change,
      interaction.user.id,
      Date.now(),
    );
    if (!changed) throw new UserError(NO_SUCH_STOP);
    await answerApart(
      interaction,
      textMessage(GYM_COLOUR, [
        endSentence(
          `Changed the PokéStop ${stopWithKey(changed)} at ${pointLink(changed)}` +
            (changed.address === null ? '' : `, ${plain(changed.address)}`),
        ),
      ]),
    );
  },
  async autocomplete(interaction, ctx) {
    await interaction.respond(stopChoices(interaction, ctx, interaction.options.getFocused()));
  },
};

/** `/pokestop remove stop:`. */
const removeStop: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove a PokéStop of Pine’s own')
    .addStringOption(stopOption),
  help: {
    details:
      'Removes a PokéStop added with `/pokestop add` (one Wayfarer now lists, or one that is ' +
      'gone). Reports made at it today stay until they end.',
    examples: ['/pokestop remove stop:Coffee Corner'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const stop = namedStop(interaction, ctx, interaction.options.getString('stop', true));
    const removed = await ctx.pineStops.remove(
      stop.id,
      guildIdOf(interaction),
      interaction.user.id,
    );
    if (!removed) throw new UserError(NO_SUCH_STOP);
    await answerApart(
      interaction,
      textMessage(GYM_COLOUR, [
        `Removed the PokéStop ${stopWithKey(removed)}. Reports made at it today stay until they end.`,
      ]),
    );
  },
  async autocomplete(interaction, ctx) {
    await interaction.respond(stopChoices(interaction, ctx, interaction.options.getFocused()));
  },
};

/**
 * `/pokestop` (plan 8R-1; design 3, Matt's answer 8: not `/stop`, as trains have stops and DMs
 * Stop buttons): the PokéStops of Pine's own, for staff, shaped like `/gym add`. Every answer is
 * for the staff member alone.
 */
export const pokestop = commandGroup({
  data: new SlashCommandBuilder()
    .setName('pokestop')
    .setDescription('Look after the PokéStops Wayfarer does not list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  help: { category: 'admin' },
  guards: [requireBotManagement],
  parts: [addStop, editStop, removeStop],
});

/**
 * The buttons of the question of `/pokestop add`: Add anyway adds the stop as asked (the near
 * stops are not looked for again: staff saw them), Cancel says so; both in the question's place.
 */
export const pokestopControls: ComponentHandler = {
  kind: POKESTOP_KIND,
  guards: [requireBotManagement],
  async button(interaction, id, ctx) {
    if (id.action !== 'add' && id.action !== 'cancel') throw new UserError(STALE_COMPONENT);
    const taken = pendingStops.take(id.id, interaction.user.id);
    if (taken === 'expired') throw new UserError(EXPIRED);
    if (taken === 'not-yours') throw new UserError(NOT_YOURS);
    const request = taken.value;
    if (id.action === 'cancel') {
      await showInPlace(interaction, textMessage(GYM_COLOUR, ['Canceled: nothing was added.']));
      return;
    }
    await interaction.deferUpdate();
    const stop = await ctx.pineStops.add({
      serverId: request.serverId,
      name: request.name,
      lat: request.point.lat,
      lon: request.point.lon,
      address: request.address,
      createdBy: interaction.user.id,
      createdAt: Date.now(),
    });
    await showInPlace(
      interaction,
      addedMessage(stop, await regionsAt(interaction, ctx, request.point)),
    );
  },
};
