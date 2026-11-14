import {
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type SlashCommandStringOption,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireBotManagement, requireGuild } from '../../discord/guards.js';
import { showInPlace } from '../../discord/late-reply.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { waitText, type Throttle } from '../../discord/throttle.js';
import {
  NEIGHBOR_ASK_AGAIN_MS,
  NEIGHBORS_MAX,
  neighborStanding,
  otherOf,
  readServerRef,
  type ServerRef,
} from '../../domain/servers/neighbors.js';
import { serverNameShown } from '../../render/server-admission.js';
import {
  ASKED,
  NEIGHBOR_KIND,
  NEIGHBORS_SHARE,
  neighborAcceptedPost,
  neighborDeclinedPost,
  serverNamed,
} from '../../render/server-neighbors.js';
import { count, fitMessages, timestamp, truncate } from '../../render/text.js';
import type { AskOutcome } from '../../services/server-neighbors.js';
import { COPIED_FIELDS, type CopiedField, type CopyCounts } from '../../services/neighbor-copy.js';
import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';

/** The subcommand group of `/admin` the neighbors live under. */
export const NEIGHBORS_GROUP = 'neighbors';
export const NEIGHBORS_DESCRIPTION =
  'Neighbor servers, which show each other’s raids and max battles in their posts';

/** As long as `server:` may be: an id, or an invite link with its query. */
const SERVER_TEXT = 200;

/** How often one member may ask: each ask may write a request and post in another server. */
const ASK_THROTTLE: Throttle = { uses: 5, perSeconds: 600 };

/**
 * How often one server's staff may ask, all of them together (review R2), beside each member's
 * own: counted by the server's id in the throttles' window `SERVER_ASK_WINDOW`.
 */
const SERVER_ASK_THROTTLE: Throttle = { uses: 5, perSeconds: 600 };
const SERVER_ASK_WINDOW = 'admin neighbors ask, by server';

/** The refusal of an ask past the server's throttle. */
function serverAskRefusal(wait: number): string {
  return (
    `This server’s staff have sent ${String(SERVER_ASK_THROTTLE.uses)} requests to be ` +
    `neighbors in ten minutes, the most they may. Ask again in ${waitText(wait)}.`
  );
}

/** How often one member may press Accept or Decline. */
const ANSWER_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };

export const NOT_A_SERVER =
  'Give the server’s ID (17 to 20 digits) or an invite link to it, such as ' +
  'https://discord.gg/abc123.';
const ITSELF = 'That is this server: a server cannot be its own neighbor.';

/** Why a server cannot take another neighbor, and what staff do about it (`then` …). */
function fullText(then: string): string {
  return (
    `This server already has ${String(NEIGHBORS_MAX)} neighbors and requests it sent, together ` +
    'the most it may have. End a neighbor or take back a request with `/admin neighbors end`, ' +
    `then ${then}.`
  );
}
export const REQUEST_EXPIRED = 'This request has expired or was answered already.';

/** A server named by the id it was given, in a refusal; `that server` where there is none. */
function givenServer(other: string | undefined): string {
  return other === undefined ? 'that server' : `\`${other}\``;
}

/** The `server:` option. */
function serverOption(description: string, autocomplete: boolean) {
  return (option: SlashCommandStringOption) =>
    option
      .setName('server')
      .setDescription(description)
      .setRequired(true)
      .setMaxLength(autocomplete ? 100 : SERVER_TEXT)
      .setAutocomplete(autocomplete);
}

/** What `server:` names: an id or an invite link; text that is neither is refused. */
function typedServer(typed: string): ServerRef {
  const ref = readServerRef(typed);
  if (!ref) throw new UserError(NOT_A_SERVER);
  return ref;
}

/**
 * The server `server:` names: its id, or the server of an invite link (Discord asked, before any
 * turn of the neighbors is taken); undefined for an invite that leads nowhere Discord says
 * (answered as any request). Text that is neither is refused.
 */
async function namedServer(
  ctx: AppContext,
  typed: string | ServerRef,
): Promise<string | undefined> {
  const ref = typeof typed === 'string' ? typedServer(typed) : typed;
  if (ref.kind === 'id') return ref.id;
  try {
    return await ctx.invites.serverOfInvite(ref.code);
  } catch (err) {
    ctx.log.warn({ err }, 'could not read the server of an invite');
    return undefined;
  }
}

/** A server by its name as Discord has it, for a neighbor or a server that asked this one. */
function named(ctx: AppContext, serverId: string): string {
  return serverNamed(serverId, ctx.neighbors.nameOf(serverId));
}

/** `/admin neighbors ask`. */
export const askNeighbor: SubcommandPart = {
  group: NEIGHBORS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('ask')
    .setDescription('Ask another server to be neighbors')
    .addStringOption(serverOption('The server’s ID, or an invite link to it', false)),
  help: {
    details:
      `${NEIGHBORS_SHARE}\n\n` +
      'The other server’s staff accept or decline in their moderators’ bot lab, and your ' +
      'moderators’ bot lab hears the answer.\n\n' +
      `A server may have ${String(NEIGHBORS_MAX)} neighbors and requests it sent, together. ` +
      'A request expires after a week. After a decline, the same server may be asked again a ' +
      'week later.',
    examples: ['/admin neighbors ask server:https://discord.gg/abc123'],
  },
  defer: 'ephemeral',
  throttle: ASK_THROTTLE,
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    const ref = typedServer(interaction.options.getString('server', true));
    if (ref.kind === 'id' && ref.id === serverId) throw new UserError(ITSELF);
    // Counted against the server before Discord is asked of an invite (review R2); given back for
    // its own server, a full one or neighbors already (and where the ask failed); an answer of
    // `ASKED` always counts, and so does the request of the other posted again (`theirs`). Its
    // refusal gives the member's own use back (review RR2): the server's limit is not their doing.
    const countedAt = Date.now();
    const wait = ctx.throttles.use(SERVER_ASK_WINDOW, serverId, SERVER_ASK_THROTTLE, countedAt);
    if (wait !== undefined) throw new UserError(serverAskRefusal(wait), { givesBack: true });
    const giveBack = () => {
      ctx.throttles.giveBack(
        SERVER_ASK_WINDOW,
        serverId,
        SERVER_ASK_THROTTLE,
        Date.now(),
        countedAt,
      );
    };
    let target: string | undefined;
    let outcome: AskOutcome;
    try {
      target = await namedServer(ctx, ref);
      outcome =
        target === undefined ? { kind: 'asked' } : await ctx.neighbors.ask(serverId, target);
    } catch (err) {
      giveBack();
      throw err;
    }
    if (outcome.kind === 'asked' || target === undefined) {
      await interaction.editReply({ content: ASKED });
      return;
    }
    if (outcome.kind !== 'theirs') giveBack();
    switch (outcome.kind) {
      case 'self':
        throw new UserError(ITSELF);
      case 'full':
        throw new UserError(fullText('ask again'));
      case 'neighbors':
        throw new UserError(`This server and ${named(ctx, target)} are neighbors already.`);
      case 'theirs':
        throw new UserError(
          `${named(ctx, target)} already asked to be this server’s neighbor. Its request is ` +
            'posted again in your moderators’ bot lab: accept it there.\n\n' +
            'If it does not show up, choose a moderators’ bot lab in `/admin settings` or allow ' +
            'me to post in it, then ask again.',
        );
    }
  },
};

/** The list of `/admin neighbors list`, by kind. */
function listLines(ctx: AppContext, serverId: string): string[] {
  const now = Date.now();
  const rows = ctx.neighbors.rowsOf(serverId);
  const neighbors: string[] = [];
  const sent: string[] = [];
  const toUs: string[] = [];
  const declined: string[] = [];
  for (const row of rows) {
    const other = otherOf(row, serverId);
    const standing = neighborStanding(row, now);
    const ends = ctx.neighbors.endsAt(row);
    if (standing === 'neighbors') {
      neighbors.push(`- ${named(ctx, other)}, since ${timestamp(row.acceptedAt ?? now, 'D')}`);
    } else if (standing === 'asked' && row.askedBy === serverId) {
      // By the id it was given: the asker learns nothing of a server from its own request.
      sent.push(
        `- \`${other}\`, asked ${timestamp(row.askedAt, 'R')}, expires ${timestamp(ends ?? now, 'R')}`,
      );
    } else if (standing === 'asked') {
      toUs.push(
        `- ${named(ctx, other)}, asked ${timestamp(row.askedAt, 'R')}: answer it in your ` +
          'moderators’ bot lab',
      );
    } else if (standing === 'declined' && row.askedBy === serverId) {
      declined.push(
        `- \`${other}\` declined ${timestamp(row.declinedAt ?? now, 'R')}; you may ask again ` +
          timestamp(ends ?? now, 'R'),
      );
    }
  }
  const parts = [
    // Neighbors alone: the limit counts the requests sent too, so it is not named here (T20).
    `**Neighbors** (${String(neighbors.length)})`,
    ...(neighbors.length === 0
      ? ['None yet. Ask a server with `/admin neighbors ask`.']
      : neighbors),
  ];
  if (sent.length > 0) parts.push('**Requests sent**', ...sent);
  if (toUs.length > 0) parts.push('**Requests received**', ...toUs);
  if (declined.length > 0) parts.push('**Requests declined**', ...declined);
  return parts;
}

/** `/admin neighbors list`. */
export const listNeighbors: SubcommandPart = {
  group: NEIGHBORS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('List this server’s neighbors and the requests to and from it'),
  help: {
    details:
      'Lists this server’s neighbors, the requests it sent, the requests sent to it, and its ' +
      'requests declined in the last week.\n\n' +
      'A request this server sent shows the other server by its ID alone, not its name, until ' +
      'they accept.',
    examples: ['/admin neighbors list'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const [first = '', ...rest] = fitMessages(listLines(ctx, guildIdOf(interaction)));
    await interaction.editReply({ content: first });
    for (const more of rest) {
      await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
    }
  },
};

/**
 * The choices of `server:` of `end` (and `copy`): this server's neighbors by name, then (for
 * `end`, `withRequests`) its own requests by id, those whose text has what is typed.
 */
export function neighborChoices(
  ctx: AppContext,
  serverId: string,
  typed: string,
  withRequests: boolean,
): Choice[] {
  const now = Date.now();
  const lower = typed.trim().toLowerCase();
  const choices: Choice[] = [];
  for (const row of ctx.neighbors.rowsOf(serverId)) {
    const other = otherOf(row, serverId);
    const standing = neighborStanding(row, now);
    if (standing === 'neighbors') {
      const name = ctx.neighbors.nameOf(other);
      choices.push({
        name: name === undefined ? other : `${serverNameShown(name)} (${other})`,
        value: other,
      });
    } else if (withRequests && standing === 'asked' && row.askedBy === serverId) {
      choices.push({ name: `${other} (asked)`, value: other });
    }
  }
  return choices
    .filter((choice) => lower === '' || choice.name.toLowerCase().includes(lower))
    .slice(0, MAX_CHOICES)
    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
}

async function respondWithNeighbors(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
  withRequests: boolean,
): Promise<void> {
  const serverId = interaction.guildId;
  const focused = interaction.options.getFocused(true);
  await interaction.respond(
    serverId === null || focused.name !== 'server'
      ? []
      : neighborChoices(ctx, serverId, String(focused.value), withRequests),
  );
}

/** `/admin neighbors end`. */
export const endNeighbor: SubcommandPart = {
  group: NEIGHBORS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('end')
    .setDescription('Stop being neighbors with a server, or take back a request')
    .addStringOption(serverOption('The neighbor, or the server you asked', true)),
  help: {
    details:
      'Ends being neighbors at once. Each server’s posts stop showing the other’s raids and max ' +
      'battles the next time they update, and both servers’ moderators’ bot labs are told.\n\n' +
      'A request this server sent that is not answered yet is taken back instead, without ' +
      'telling anyone.',
    examples: ['/admin neighbors end server:123456789012345678'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    const other = await namedServer(ctx, interaction.options.getString('server', true));
    const name = other === undefined ? undefined : ctx.neighbors.nameOf(other);
    const ended = other === undefined ? 'none' : await ctx.neighbors.end(serverId, other);
    switch (ended) {
      case 'ended':
        await interaction.editReply({
          content:
            `This server and ${name === undefined ? `\`${other ?? ''}\`` : `**${serverNameShown(name)}**`} ` +
            'are no longer neighbors. Both servers’ moderators’ bot labs are told.',
        });
        return;
      case 'withdrawn':
        await interaction.editReply({
          content: `Took back this server’s request to \`${other ?? ''}\`.`,
        });
        return;
      case 'none':
        throw new UserError(
          `This server is not neighbors with ${givenServer(other)} and has no open request to it.`,
        );
    }
  },
  autocomplete: (interaction, ctx) => respondWithNeighbors(interaction, ctx, true),
};

/** How often one member may copy: a copy writes up to every gym of the server. */
const COPY_THROTTLE: Throttle = { uses: 2, perSeconds: 600 };

/** `1 nickname, 1 notice and 2 lists of search words`: what was copied, by field. */
function copiedWords(counts: CopyCounts): string {
  const words: Record<CopiedField, [string, string]> = {
    nickname: ['nickname', 'nicknames'],
    notice: ['notice', 'notices'],
    description: ['description', 'descriptions'],
    keywords: ['list of search words', 'lists of search words'],
  };
  const said = COPIED_FIELDS.filter((field) => counts[field] > 0).map((field) =>
    count(counts[field], words[field][0], words[field][1]),
  );
  return said.length <= 1
    ? (said[0] ?? '')
    : `${said.slice(0, -1).join(', ')} and ${said.at(-1) ?? ''}`;
}

/**
 * What `copy` says of the gyms both servers have as one row, where there are any: one gym in both,
 * its texts the same in both already.
 */
function sharedWords(counts: CopyCounts): string {
  if (counts.shared === 0) return '';
  const are = counts.shared === 1 ? 'is' : 'are';
  return ` ${count(counts.shared, 'gym')} ${are} already shared by both servers, with the same texts in both.`;
}

/** What `copy` says of a copy from the neighbor `name` (staging F2: one gym in the singular). */
export function copySaid(name: string, copied: CopyCounts): string {
  if (copied.gyms === 0) {
    return (
      `Nothing to copy from ${name}: on the gyms you both have, this server’s texts are filled ` +
      `in already, or ${name}’s are empty.${sharedWords(copied)}`
    );
  }
  return (
    `Copied from ${name} onto ${count(copied.gyms, 'gym')} of this server: ` +
    `${copiedWords(copied)}. Nothing your staff set was replaced.${sharedWords(copied)}\n\n` +
    `Run it again later to copy what ${name} adds.`
  );
}

/** The refusal of `copy` from a server that is not a neighbor. */
function notANeighbor(other: string | undefined): UserError {
  return new UserError(
    `This server is not neighbors with ${givenServer(other)}. You can copy only from a neighbor.`,
  );
}

/**
 * `copy` from a server named by its id that is not a neighbor is refused before the throttle
 * (uncounted); one named by an invite link is checked once Discord said which it is.
 */
const requireNeighborNamed: Guard = (interaction, ctx) => {
  if (!interaction.isChatInputCommand() || interaction.guildId === null) return;
  const ref = readServerRef(interaction.options.getString('server') ?? '');
  if (ref?.kind === 'id' && !ctx.neighbors.areNeighbors(interaction.guildId, ref.id)) {
    throw notANeighbor(ref.id);
  }
};

/** `/admin neighbors copy`. */
export const copyFromNeighbor: SubcommandPart = {
  group: NEIGHBORS_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('copy')
    .setDescription('Copy a neighbor’s gym nicknames, notices, descriptions and search words')
    .addStringOption(serverOption('The neighbor to copy from', true)),
  help: {
    details:
      'Copies the neighbor’s gym nicknames, notices, descriptions and search words onto the ' +
      'same gyms in this server. A gym is the same when it has the same Wayfarer ID, or the ' +
      'same name at the same place.\n\n' +
      'Each text is copied only where this server’s is empty, so nothing your staff set is ' +
      'replaced. It is a one-time copy, not a live link: run it again to copy what the ' +
      'neighbor adds later.',
    examples: ['/admin neighbors copy server:123456789012345678'],
  },
  guards: [requireNeighborNamed],
  defer: 'ephemeral',
  throttle: COPY_THROTTLE,
  async execute(interaction, ctx) {
    const serverId = guildIdOf(interaction);
    const other = await namedServer(ctx, interaction.options.getString('server', true));
    if (other === undefined || !ctx.neighbors.areNeighbors(serverId, other)) {
      throw notANeighbor(other);
    }
    const [ourRow, theirRow] = await Promise.all([
      ctx.guilds.idFor(serverId),
      ctx.guilds.idFor(other),
    ]);
    if (ourRow === undefined || theirRow === undefined) {
      throw new UserError(
        'I do not know this server’s gyms or the neighbor’s yet: try again later.',
      );
    }
    if (ctx.neighborCopy.busy(ourRow)) {
      throw new UserError('A copy onto this server is under way: try again once it is done.');
    }
    const copied = await ctx.neighborCopy.copy(ourRow, theirRow, interaction.user.id);
    ctx.log.info(
      { by: interaction.user.id, server: serverId, from: other, ...copied },
      'a neighbor’s gym texts were copied',
    );
    const name = named(ctx, other).replace(/ \(`\d+`\)$/, '');
    await interaction.editReply({ content: copySaid(name, copied) });
  },
  autocomplete: (interaction, ctx) => respondWithNeighbors(interaction, ctx, false),
};

export const neighborParts: readonly SubcommandPart[] = [
  askNeighbor,
  listNeighbors,
  endNeighbor,
  copyFromNeighbor,
];

/**
 * Accept and Decline under a request in a server's moderators' bot lab (kind `neighbor`;
 * `neighbor:<asking server>:accept|decline`): for that server's bot staff (`requireBotManagement`
 * of the server the press came from, refused uncounted). Decided against the pair as it is now
 * (`ServerNeighbors.answer`): a request of another pair (a press from another server), answered
 * or expired says so, privately; otherwise the post is shown anew in its place, without buttons.
 * Nothing is kept but the pair's row, so a post from before a restart works.
 */
export const neighborControls: ComponentHandler = {
  kind: NEIGHBOR_KIND,
  guards: [requireGuild, requireBotManagement],
  throttle: ANSWER_THROTTLE,
  async button(interaction, id, ctx) {
    const accept = id.action === 'accept' ? true : id.action === 'decline' ? false : undefined;
    if (accept === undefined) throw new UserError(STALE_COMPONENT);
    const outcome = await ctx.neighbors.answer(id.id, guildIdOf(interaction), accept);
    switch (outcome.kind) {
      case 'expired':
        throw new UserError(REQUEST_EXPIRED);
      case 'full':
        throw new UserError(fullText('accept this one'));
      case 'accepted':
        await showInPlace(interaction, neighborAcceptedPost(id.id, outcome.name));
        return;
      case 'declined':
        await showInPlace(
          interaction,
          neighborDeclinedPost(id.id, outcome.name, Date.now() + NEIGHBOR_ASK_AGAIN_MS),
        );
        return;
    }
  },
};
