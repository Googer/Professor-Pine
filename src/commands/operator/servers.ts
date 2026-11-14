import {
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { isInstanceOperatorOf, requireInstanceOperator } from '../../discord/guards.js';
import { v2Answer } from '../../discord/late-reply.js';
import { isSnowflake } from '../../db/snowflake.js';
import { serverLines, serverListTexts, type KnownServer } from '../../render/operator-servers.js';
import { plainNoLinks } from '../../render/text.js';
import { LIST_COLOUR, textMessage } from '../../render/v2.js';
import { tellOwnerOfServerChange } from './shared-change.js';

/** The subcommand group of `/operator` the servers live under (plan 19C-1). */
export const SERVERS_GROUP = 'servers';
export const SERVERS_DESCRIPTION = 'The servers this Pine serves: allow, remove, block (operators)';

/** What a `server:` that is no server's id is told. */
export const NOT_A_SERVER_ID = 'That is not a server’s ID: copy it from the server’s menu.';

/** The instance tier, for every part (plan 19B-1, `requireInstanceOperator`). */
const instanceOnly = {
  group: SERVERS_GROUP,
  guards: [requireInstanceOperator],
  // Named in `/help` to the instance operators alone.
  seenBy: (asker: { user: { id: string } }, ctx: AppContext) =>
    isInstanceOperatorOf(asker.user.id, ctx),
  defer: 'ephemeral' as const,
};

/** The `server:` option of a part. */
function withServer(builder: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return builder.addStringOption((option) =>
    option
      .setName('server')
      .setDescription('The server’s ID')
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20),
  );
}

/** The server an operator named, by its id. */
function serverOption(interaction: ChatInputCommandInteraction): string {
  const id = interaction.options.getString('server', true).trim();
  if (!isSnowflake(id)) throw new UserError(NOT_A_SERVER_ID);
  return id;
}

/** The servers the client knows, with their names and member counts where available. */
function knownServers(interaction: ChatInputCommandInteraction): KnownServer[] {
  const cache = interaction.client.guilds.cache as ReadonlyMap<
    string,
    Pick<Guild, 'id' | 'name' | 'available'> & { memberCount?: number }
  >;
  return [...cache.values()].map((guild) => ({
    id: guild.id,
    name: guild.available ? guild.name : undefined,
    members: guild.available ? guild.memberCount : undefined,
  }));
}

/** A server named in an answer: its name where the client knows it, and its id. */
function serverNamed(interaction: ChatInputCommandInteraction, serverId: string): string {
  const name = interaction.client.guilds.cache.get(serverId)?.name;
  return name === undefined ? `\`${serverId}\`` : `**${plainNoLinks(name)}** (\`${serverId}\`)`;
}

async function say(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
  await interaction.editReply(v2Answer(textMessage(LIST_COLOUR, [text])));
}

/**
 * `/operator servers list [page]` (plan 19C-1): every server this Pine is in, by name, with its
 * member count, whether it is set up and when its last party was made (the history's index by
 * server, `LastPartyReader`); then the servers it left, blocked or allowed and is not in. Never
 * a member. Twenty a page at most, within a character budget (`serverListTexts`).
 */
export const listServers: SubcommandPart = {
  ...instanceOnly,
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('The servers this Pine is in, left, blocked or allowed')
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Which page, 20 servers at most each').setMinValue(1),
    ),
  help: {
    details:
      'Every server this Pine is in, by name: how many members it has, whether its staff ' +
      'finished its setup, and when its last party was made. Never a member of a server.\n\n' +
      'Then the servers it left (nothing of them is deleted, and they pick up where they ' +
      'were if they add Pine back), those blocked, and those allowed that have not added it ' +
      'yet. Twenty servers a page at most, fewer where their names are long.\n\nA server’s ' +
      'share of Google’s month is shown in that server by `/gym google`; ' +
      '`/operator google share` raises it.',
    examples: ['/operator servers list', '/operator servers list page:2'],
  },
  async execute(interaction, ctx) {
    const known = knownServers(interaction);
    const standings = ctx.standings.all();
    const ids = [
      ...new Set([...known.map((server) => server.id), ...standings.map((row) => row.serverId)]),
    ];
    const lastParty = await ctx.lastParties.lastPartyAt(ids);
    const lines = serverLines(known, standings, {
      isLeft: (serverId) => ctx.standings.isLeft(serverId),
      setUpAt: (serverId) => ctx.servers.setUpAt(serverId),
      lastParty,
    });
    const page = interaction.options.getInteger('page') ?? 1;
    await interaction.editReply(v2Answer(textMessage(LIST_COLOUR, serverListTexts(lines, page))));
  },
};

/** `/operator servers allow server:` (plan 19C-1): the server may add this Pine. */
export const allowServer: SubcommandPart = {
  ...instanceOnly,
  data: withServer(
    new SlashCommandSubcommandBuilder()
      .setName('allow')
      .setDescription('Let a server add this Pine'),
  ),
  help: {
    details:
      'Lets a server add this Pine, besides those the settings list and those it served at ' +
      'its update to 2.1. A blocked server stays blocked until you unblock it.\n\nMy owner is ' +
      'told who allowed it, and from where.',
    examples: ['/operator servers allow server:412345678901234567'],
  },
  async execute(interaction, ctx) {
    const serverId = serverOption(interaction);
    await ctx.standings.allow(serverId, interaction.user.id);
    tellOwnerOfServerChange(
      interaction,
      ctx,
      `Allowed the server \`${serverId}\` to add this Pine.`,
    );
    const blocked = ctx.standings.standingOf(serverId).blocked;
    await say(
      interaction,
      `Allowed ${serverNamed(interaction, serverId)}: its staff may add this Pine.` +
        (blocked
          ? ' It is blocked, which wins: `/operator servers unblock` takes the block back.'
          : ''),
    );
  },
};

/**
 * What an operator is told where a leave failed and is tried again (`LEAVE_RETRY_MS`, J8: 1, 6
 * and 36 minutes after the first try).
 */
const TRYING_AGAIN = 'I try again over the next forty minutes';

/** What an operator is told where Pine is not in the server they name. */
export const NOT_IN_THAT_SERVER = 'This Pine is not in that server.';

/** `/operator servers remove server:` (plan 19C-1): Pine leaves the server now. */
export const removeServer: SubcommandPart = {
  ...instanceOnly,
  data: withServer(
    new SlashCommandSubcommandBuilder()
      .setName('remove')
      .setDescription('Have this Pine leave a server now'),
  ),
  help: {
    details:
      'Has this Pine leave a server now, without a word there. The server is kept as one Pine ' +
      'left: nothing of it is deleted, and its staff may add Pine back if it is ' +
      'allowed; to keep it from coming back, block it instead.\n\nMy owner is told who removed ' +
      'it, and from where.',
    examples: ['/operator servers remove server:412345678901234567'],
  },
  async execute(interaction, ctx) {
    const serverId = serverOption(interaction);
    const named = serverNamed(interaction, serverId);
    const outcome = await ctx.admission.remove(serverId);
    if (outcome === 'not-in') throw new UserError(NOT_IN_THAT_SERVER);
    if (outcome === 'rehearsal') throw new UserError('Rehearsal mode leaves no server.');
    tellOwnerOfServerChange(interaction, ctx, `Had this Pine leave the server \`${serverId}\`.`);
    if (outcome === 'trying') {
      await say(interaction, `I could not leave ${named} just now: ${TRYING_AGAIN}.`);
      return;
    }
    await say(
      interaction,
      `I left ${named}. ` +
        (ctx.standings.mayHave(serverId)
          ? 'Its staff may add me again; `/operator servers block` keeps it from coming back.'
          : 'It may not add me again unless it is allowed.'),
    );
  },
};

/** `/operator servers block server:` (plan 19C-1): the server may never have this Pine. */
export const blockServer: SubcommandPart = {
  ...instanceOnly,
  data: withServer(
    new SlashCommandSubcommandBuilder()
      .setName('block')
      .setDescription('Keep a server from having this Pine, and leave it'),
  ),
  help: {
    details:
      'Keeps a server from having this Pine, whatever allows it, and leaves it now where Pine ' +
      'is in it. If its staff add Pine again, it says this Pine is private and leaves.\n\nMy ' +
      'owner is told who blocked it, and from where.',
    examples: ['/operator servers block server:412345678901234567'],
  },
  async execute(interaction, ctx) {
    const serverId = serverOption(interaction);
    const named = serverNamed(interaction, serverId);
    await ctx.standings.block(serverId, interaction.user.id);
    // Told once the block is written, whatever the leave does (J8).
    tellOwnerOfServerChange(interaction, ctx, `Blocked the server \`${serverId}\`.`);
    const outcome = await ctx.admission.remove(serverId);
    await say(
      interaction,
      `Blocked ${named}: it may not have this Pine.` +
        (outcome === 'left' ? ' I left it.' : '') +
        (outcome === 'trying'
          ? ` I could not leave it just now: ${TRYING_AGAIN}, and at my next start.`
          : ''),
    );
  },
};

/** `/operator servers unblock server:` (plan 19C-1): the block is taken back. */
export const unblockServer: SubcommandPart = {
  ...instanceOnly,
  data: withServer(
    new SlashCommandSubcommandBuilder()
      .setName('unblock')
      .setDescription('Take back a server’s block'),
  ),
  help: {
    details:
      'Takes back a server’s block. It may add this Pine again where something allows it: the ' +
      'settings list it, it was served at the update to 2.1, or an operator allowed it.\n\nMy ' +
      'owner is told who unblocked it, and from where.',
    examples: ['/operator servers unblock server:412345678901234567'],
  },
  async execute(interaction, ctx) {
    const serverId = serverOption(interaction);
    await ctx.standings.unblock(serverId);
    tellOwnerOfServerChange(interaction, ctx, `Took back the block of the server \`${serverId}\`.`);
    await say(
      interaction,
      `Unblocked ${serverNamed(interaction, serverId)}. ` +
        (ctx.standings.mayHave(serverId)
          ? 'Its staff may add this Pine again.'
          : 'It may still not add this Pine: nothing allows it (`/operator servers allow`).'),
    );
  },
};

/** The parts of the group, in their order. */
export const serverParts: readonly SubcommandPart[] = [
  listServers,
  allowServer,
  removeServer,
  blockServer,
  unblockServer,
];
