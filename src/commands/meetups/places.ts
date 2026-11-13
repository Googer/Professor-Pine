import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { SAFETY_THROTTLE } from '../../components/meetup-safety.js';
import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild, requireManagement } from '../../discord/guards.js';
import { showInPlace, v2Answer } from '../../discord/late-reply.js';
import { memberInfo } from '../../discord/member-info.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { PlaceRulingRecord } from '../../domain/meetups/records.js';
import type { PlaceKind } from '../../domain/search/place-merge.js';
import { PLACE_KIND_WORDS } from '../../render/place.js';
import { PLACES_KIND, placePage, placesList } from '../../render/places.js';
import { memberText } from '../../render/text.js';
import { LIST_COLOUR, textMessage } from '../../render/v2.js';
import { MAX_PLACE_TEXT, namedPlace, nearChoices } from '../place-option.js';

const PLACE_KINDS: readonly PlaceKind[] = ['gym', 'stop', 'powerspot'];

/**
 * The name a ruled place is listed by: as its ruling kept it, else as it is now (8S-1's kept
 * none: `MeetupSafety.placeNow`, the server's gym or kept Wayspot).
 */
function titleOf(ctx: AppContext, guildRow: number | undefined, ruling: PlaceRulingRecord): string {
  return (
    ruling.place?.title ??
    ctx.meetupSafety.placeNow(ruling.key, guildRow)?.title ??
    `${PLACE_KIND_WORDS[ruling.key.kind]} ${ruling.key.id}`
  );
}

/** The list of `/places` at a page, read anew. */
async function listPage(ctx: AppContext, serverId: string, page: number): Promise<V2Message> {
  const [overview, reports, guildRow] = await Promise.all([
    ctx.meetupSafety.overview(serverId),
    ctx.reports.openReports(serverId),
    ctx.guilds.idFor(serverId),
  ]);
  // A block of 8S-1 kept no name: the member as the server knows them now, else the mention.
  const blocks = await Promise.all(
    overview.blocks.map(async (block) =>
      block.memberName !== null
        ? block
        : {
            ...block,
            memberName:
              (await ctx.members.find(serverId, block.memberId).catch(() => undefined))?.name ??
              null,
          },
    ),
  );
  return placesList(
    { serverId, ...overview, blocks, reports, titleOf: (ruling) => titleOf(ctx, guildRow, ruling) },
    page,
  );
}

/**
 * `/places [place]` (plan 8S-2; Matt: a command of its own, for staff, hidden from the others by
 * Manage Messages as `/delete` is): with a place (a gym, PokéStop or power spot, as `/meetup
 * near:` finds it) its ruling, who made it, when and from which post, with Undo ruling (the place
 * is checked by its name again; logged, nobody told); without, the rulings of the server and
 * everything open (pending requests, asks about places, blocks with Lift block, appeals,
 * reports), each with the way to its post, paged with arrows. Answered privately.
 */
export const places: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('places')
    .setDescription('Rulings of places, and what waits for the moderators (moderators)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName('place')
        .setDescription('A gym or PokéStop: its ruling (pick from the list)')
        .setMaxLength(MAX_PLACE_TEXT)
        .setAutocomplete(true),
    ),
  help: {
    category: 'admin',
    details:
      'For admins and moderators. With a place: whether meetups there are allowed or refused ' +
      'for good, who decided, when and from which post, with the button Undo ruling (meetups ' +
      'there are then checked as usual again; nobody is told).\n\nWithout a place: the refused ' +
      'and allowed places, meetup requests waiting for a decision, members asking to allow a ' +
      'refused place, blocked members (with Lift block), and open appeals and reports, each ' +
      'with a link to its post in the moderators’ channel.\n\nServer Settings › Integrations ' +
      'decide who sees it (Manage Messages by default). Only you see the answer.',
    examples: ['/places', '/places place:Riverside Park Gazebo'],
  },
  guards: [requireGuild, requireManagement],
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    const typed = interaction.options.getString('place');
    if (typed === null) {
      await interaction.editReply(v2Answer(await listPage(ctx, serverId, 0)));
      return;
    }
    const place = await namedPlace(interaction, ctx, typed, 'or pick it from the list');
    if (place === undefined) throw new UserError('Say which place.');
    const ruling = await ctx.meetupSafety.rulingOf(serverId, place);
    await interaction.editReply(
      v2Answer(
        placePage(place, ruling, serverId, { officialName: ctx.meetupSafety.officialName(place) }),
      ),
    );
  },
  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    await interaction.respond(
      focused.name === 'place' ? await nearChoices(interaction, ctx, focused.value) : [],
    );
  },
};

/**
 * The controls of `/places` (kind `places`), for staff: the list's arrows, Lift block (as an
 * appeal's Lift block: the member is told by DM; the list is shown again) and Undo ruling. Each
 * press reads the server's lists anew and shows the page in the place of the answer.
 */
export const placesControls: ComponentHandler = {
  kind: PLACES_KIND,
  guards: [requireGuild, requireManagement],
  throttle: SAFETY_THROTTLE,
  async button(interaction, id, ctx) {
    const serverId = guildIdOf(interaction);
    const moderator = { id: interaction.user.id, name: memberInfo(interaction).name };
    const [arg = ''] = id.args;
    const page = Number(arg);
    const kind = PLACE_KINDS.find((one) => one === id.id);
    const listing = id.action === 'page' || id.action === 'lift';
    if (
      listing
        ? !Number.isInteger(page) || page < 0
        : id.action !== 'undo' || kind === undefined || arg === ''
    ) {
      throw new UserError(STALE_COMPONENT);
    }
    // The lists are read anew and a lift or an undo written first: acknowledged before that.
    await interaction.deferUpdate();
    if (listing) {
      if (id.action === 'lift') {
        await ctx.meetupSafety.liftBlock(serverId, id.id, moderator, interaction.guild?.name);
      }
      await showInPlace(interaction, await listPage(ctx, serverId, page));
      return;
    }
    if (kind === undefined) throw new UserError(STALE_COMPONENT);
    const key = { kind, id: arg };
    const undone = await ctx.meetupSafety.undoRuling(serverId, key, moderator);
    const place = undone?.place ?? ctx.meetupSafety.placeNow(key, await ctx.guilds.idFor(serverId));
    const said =
      undone === undefined
        ? 'It had no ruling any more.'
        : `Undone by ${memberText(moderator)}: a meetup there is checked by its name again.`;
    await showInPlace(
      interaction,
      place === undefined
        ? textMessage(LIST_COLOUR, [said])
        : placePage(place, undefined, serverId, {
            officialName: ctx.meetupSafety.officialName(place),
            said,
          }),
    );
  },
};
