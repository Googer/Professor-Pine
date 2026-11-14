import { PermissionFlagsBits, type Guild } from 'discord.js';
import type { AppContext } from '../app-context.js';
import type { ServerValues } from '../config/server-settings.js';
import { isOpenInstance, listedServers } from '../config/settings.js';
import {
  isInstanceOperator,
  isSharedDataOperator,
  type Instance,
} from '../domain/operators/tiers.js';
import {
  isMax,
  isMeetup,
  isRaid,
  isTimed,
  isTrain,
  partyWord,
  type Party,
  type RaidParty,
  type TrainParty,
} from '../domain/party/party.js';
import { channelContext } from './channel-context.js';
import type { Guard, LocatedInteraction } from './command.js';
import { UserError } from './errors.js';

const MANAGEMENT_ROLES = new Set(['admin', 'moderator']);
const BOT_MANAGEMENT_ROLES = new Set([...MANAGEMENT_ROLES, 'bot developer']);

function hasRole(roleNames: Iterable<string>, allowed: Set<string>): boolean {
  for (const name of roleNames) if (allowed.has(name.toLowerCase())) return true;
  return false;
}

/**
 * Whether a role of this name makes whoever holds it staff of this bot (an admin, a moderator
 * or a bot developer), by the comparison the guards themselves make. Such a role must never be
 * one a member can give themself.
 */
export function isStaffRoleName(name: string): boolean {
  return hasRole([name], BOT_MANAGEMENT_ROLES);
}

/**
 * Whether a role of this name makes whoever holds it an admin or a moderator of the server (the
 * staff of `isManagement`, who decide in the moderators' channel), by the guards' comparison.
 */
export function isManagementRoleName(name: string): boolean {
  return hasRole([name], MANAGEMENT_ROLES);
}

export function isManagement(
  roleNames: Iterable<string>,
  userId: string,
  ownerId: string,
): boolean {
  return userId === ownerId || hasRole(roleNames, MANAGEMENT_ROLES);
}

export function isBotManagement(
  roleNames: Iterable<string>,
  userId: string,
  ownerId: string,
): boolean {
  return userId === ownerId || hasRole(roleNames, BOT_MANAGEMENT_ROLES);
}

/** Whether a channel is one of the server's two bot channels (the bot lab, the moderators'). */
export function isBotChannel(channelId: string | undefined, values: ServerValues): boolean {
  return (
    channelId !== undefined &&
    (channelId === values.channels['bot-lab'] || channelId === values.channels['mod-bot-lab'])
  );
}

/** Whether PvP commands may be used here: in a DM, or under the server's PvP category. */
export function isPvpContext(
  context: { isDm: boolean; categoryId: string | undefined },
  values: ServerValues | undefined,
): boolean {
  if (context.isDm) return true;
  const category = values?.categories.pvp;
  return category !== undefined && context.categoryId === category;
}

/** Role names of the invoking member; empty outside a cached guild. */
export function memberRoleNames(interaction: LocatedInteraction): string[] {
  if (!interaction.inCachedGuild()) return [];
  return interaction.member.roles.cache.map((role) => role.name);
}

/** Whether the invoking member is an admin or a moderator of the server, or the bot's owner. */
export function isStaff(interaction: LocatedInteraction, ctx: AppContext): boolean {
  return isManagement(memberRoleNames(interaction), interaction.user.id, ctx.config.env.OWNER_ID);
}

/**
 * Who may set a server up (plan 19C-2, `servers.md`): its Discord owner, a member who may manage
 * it (Manage Server, which administrators have), and its staff as `/admin` counts them
 * (`isBotManagement`: an admin, a moderator or a bot developer by role, or the bot's owner). A
 * new community's staff may lack the role names, so the server's own word counts too. The one
 * rule of `requireServerAdmin`, of the router's and `/help`'s staff test, and of the web's region
 * editor (`mayEditRegions`).
 */
export function mayManageServer(
  facts: { roleNames: Iterable<string>; manageGuild: boolean; guildOwner: boolean },
  userId: string,
  ownerId: string,
): boolean {
  return facts.guildOwner || facts.manageGuild || isBotManagement(facts.roleNames, userId, ownerId);
}

/**
 * Whether the invoking member may set the server up (`mayManageServer`): the server's owner, as
 * the client has the server; Manage Server from the interaction (`memberPermissions`); or staff
 * by role. In a DM only the bot's owner. Also who is staff as the router and `/help` count them
 * (plan 19C-2): only they are told of a staff command, such as `/admin settings` or `/admin
 * setup` in a refusal (plan 19A-1, review F11), and `/help` lists the staff commands to them.
 */
export function isServerAdmin(
  interaction: LocatedInteraction,
  ctx: Pick<AppContext, 'config'>,
): boolean {
  return mayManageServer(
    {
      roleNames: memberRoleNames(interaction),
      manageGuild: interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
      guildOwner: interaction.inCachedGuild() && interaction.guild.ownerId === interaction.user.id,
    },
    interaction.user.id,
    ctx.config.env.OWNER_ID,
  );
}

/**
 * Whether the invoking member may manage the server's channels (Manage Channels), which
 * deleting or creating one through the bot takes as doing it by hand does (`/region remove`'s
 * forum, an import's new channels, `/admin cleanup-legacy`). Read from the server
 * (`GuildMember.permissions`, which counts the owner and administrators in), never from the
 * channel of the interaction, whose overwrites may grant it there alone.
 */
export function managesChannels(interaction: LocatedInteraction): boolean {
  return (
    interaction.inCachedGuild() &&
    interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)
  );
}

/** The ids of the server's roles that make a member an admin or a moderator, to ping them. */
export function managementRoleIds(interaction: LocatedInteraction): string[] {
  if (!interaction.inCachedGuild()) return [];
  return managementRoleIdsOf(interaction.guild);
}

/**
 * `managementRoleIds` of a server as the client has it, keyed by the server rather than an
 * interaction (plan 8M-8B: the map's report pings them as `/report` does).
 */
export function managementRoleIdsOf(guild: Pick<Guild, 'roles'>): string[] {
  return guild.roles.cache
    .filter((role) => MANAGEMENT_ROLES.has(role.name.toLowerCase()))
    .map((role) => role.id);
}

/**
 * The region an interaction happened in, as the id of the region's text channel: that channel
 * itself or a thread in it, or the region's forum or a post in it. Undefined anywhere else.
 */
export function regionChannelOf(
  interaction: LocatedInteraction,
  ctx: AppContext,
): string | undefined {
  const { baseChannelId } = channelContext(interaction);
  if (baseChannelId === undefined) return undefined;
  // A region with an outline (as `GymLookup.isRegion`: of several rows, the first), read from the
  // regions, which belong to the server whose channel it is (plan 19B-2: no list of every
  // server's gyms is asked).
  const outlined = (channelId: string) =>
    (ctx.regions.byChannel(channelId)?.bounds ?? null) !== null;
  if (outlined(baseChannelId)) return baseChannelId;
  const ofForum = ctx.regions.byForum(baseChannelId)?.channelId;
  return ofForum !== undefined && outlined(ofForum) ? ofForum : undefined;
}

const SERVER_ONLY = 'This only works in a server.';

function assertGuild(interaction: LocatedInteraction): void {
  if (!interaction.inCachedGuild()) throw new UserError(SERVER_ONLY);
}

/**
 * A guard that decides by who the member is, with whom it lets through (`Guard.admits`, plan
 * 19C-2): the same rule the guard asks, so that `/help` lists what it guards to them alone.
 */
function byMember(
  admits: (asker: LocatedInteraction, ctx: AppContext) => boolean,
  guard: (interaction: LocatedInteraction, ctx: AppContext) => void,
): Guard {
  return Object.assign(guard, { admits });
}

/**
 * Whether a member passes these guards by who they are (plan 19C-2, C3: what `/help` lists of a
 * staff command): every guard that decides by the member (`Guard.admits`) lets them through;
 * where none does, staff as `/admin` counts them (`isBotManagementAt`), the default of a staff
 * command's parts (`staffParts`). Where they ask is the guards' own concern, not this.
 */
export function admittedBy(
  guards: readonly Guard[],
  asker: LocatedInteraction,
  ctx: AppContext,
): boolean {
  const deciding = guards.flatMap((guard) => (guard.admits === undefined ? [] : [guard.admits]));
  if (deciding.length === 0) return isBotManagementAt(asker, ctx);
  return deciding.every((admits) => admits(asker, ctx));
}

/**
 * The server an interaction came from, as its snowflake, for a handler behind `requireGuild`
 * (or a control of such a command); refused like the guard refuses when there is none.
 */
export function guildIdOf(interaction: { guildId: string | null }): string {
  if (interaction.guildId === null) throw new UserError(SERVER_ONLY);
  return interaction.guildId;
}

export const requireGuild: Guard = (interaction) => {
  assertGuild(interaction);
};

/**
 * What `requireManagement` tells somebody who is not staff; the live map's Delete… says it too
 * (plan 8M-8B).
 */
export const STAFF_ONLY = 'Only admins and moderators can do that.';

export const requireManagement: Guard = byMember(isStaff, (interaction, ctx) => {
  assertGuild(interaction);
  if (!isStaff(interaction, ctx)) {
    throw new UserError(STAFF_ONLY);
  }
});

/** What `requireBotManagement` tells a member who is no staff of the bot. */
export const BOT_STAFF_ONLY = 'Only admins, moderators and bot developers can do that.';

/** Whether the invoking member is staff as `/admin` counts them (`isBotManagement`). */
export function isBotManagementAt(
  interaction: LocatedInteraction,
  ctx: Pick<AppContext, 'config'>,
): boolean {
  return isBotManagement(
    memberRoleNames(interaction),
    interaction.user.id,
    ctx.config.env.OWNER_ID,
  );
}

export const requireBotManagement: Guard = byMember(isBotManagementAt, (interaction, ctx) => {
  assertGuild(interaction);
  if (!isBotManagementAt(interaction, ctx)) throw new UserError(BOT_STAFF_ONLY);
});

/** What `requireServerAdmin` tells anybody else (plan 19C-2). */
export const SERVER_ADMIN_ONLY =
  'Only the server’s owner, members who may manage the server, and its admins, moderators and ' +
  'bot developers can do that.';

/**
 * For what sets a server up (plan 19C-2, `isServerAdmin`): `/admin setup`, `/admin settings` and
 * their controls and dialogs, and the ways to a server's regions its checklist sends to
 * (`/region import`, `/region edit`, the import's questions). In a server only.
 */
export const requireServerAdmin: Guard = byMember(isServerAdmin, (interaction, ctx) => {
  assertGuild(interaction);
  if (!isServerAdmin(interaction, ctx)) throw new UserError(SERVER_ADMIN_ONLY);
});

/**
 * The instance as the operators' tiers read it (`src/domain/operators/tiers.ts`): the file's
 * operators and servers, and each server's standing (plan 19C-1).
 */
export function instanceOf(ctx: Pick<AppContext, 'config' | 'standings'>): Instance {
  return {
    ownerId: ctx.config.env.OWNER_ID.trim(),
    operators: ctx.config.settings.operators,
    open: isOpenInstance(ctx.config.settings),
    listed: listedServers(ctx.config.settings),
    standingOf: (serverId) => ctx.standings.standingOf(serverId),
  };
}

/** Whether this user is an instance operator (plan 19B-1): the owner or an operator of the file. */
export function isInstanceOperatorOf(
  userId: string,
  ctx: Pick<AppContext, 'config' | 'standings'>,
): boolean {
  return isInstanceOperator(userId, instanceOf(ctx));
}

/**
 * Whether the invoking member may change what every server shares where they ask (plan 19B-1,
 * `isSharedDataOperator`): an instance operator anywhere; on an instance that is not open, also
 * the bot-management staff of the server asked from, where that server is allowed (plan 19C-1:
 * listed, recorded at the upgrade or allowed by an operator, not blocked); in a DM the instance
 * operators alone.
 */
export function isSharedDataOperatorAt(
  interaction: LocatedInteraction,
  ctx: Pick<AppContext, 'config' | 'standings'>,
): boolean {
  return isSharedDataOperator(
    {
      userId: interaction.user.id,
      serverId: interaction.guildId ?? undefined,
      botManagement: hasRole(memberRoleNames(interaction), BOT_MANAGEMENT_ROLES),
    },
    instanceOf(ctx),
  );
}

/**
 * Whether a server's bot-management staff change what every server shares from that server (plan
 * 19B-1): the shared-data tier asked for a member of its staff who is no operator. False on an
 * open instance, and for a server that is not allowed (plan 19C-1).
 */
export function serverStaffShareData(
  serverId: string,
  ctx: Pick<AppContext, 'config' | 'standings'>,
): boolean {
  return isSharedDataOperator({ userId: '', serverId, botManagement: true }, instanceOf(ctx));
}

/** What the operators' guards tell anybody they refuse in a server (plan 19B-1). */
export const ONLY_OPERATORS = 'Only the operators of this Pine can do that.';

/** What the operators' guards tell anybody they refuse in a DM with the bot (plan 19B-1). */
export const ONLY_OPERATORS_IN_A_DM =
  'In a direct message only the operators of this Pine can do that.';

/**
 * The shared-data tier (plan 19B-1): what every server shares (the boss list's overrides and its
 * sync, the event window, the image cache). Refused in the words of where it would pass: in a
 * server whose staff it passes (an allowed server of an instance that is not open), as `/admin`
 * refuses; in another server, the operators'; in a DM, the DM's.
 */
export const requireSharedDataOperator: Guard = byMember(
  isSharedDataOperatorAt,
  (interaction, ctx) => {
    if (isSharedDataOperatorAt(interaction, ctx)) return;
    if (!interaction.inGuild()) throw new UserError(ONLY_OPERATORS_IN_A_DM);
    throw new UserError(
      serverStaffShareData(interaction.guildId, ctx) ? BOT_STAFF_ONLY : ONLY_OPERATORS,
    );
  },
);

/**
 * The instance tier (plan 19B-1): the owner and the file's operators alone, who need no role,
 * anywhere: for what spans every server and cannot be undone (`/operator forget`). Server staff
 * are refused (in a DM in the DM's words).
 */
export const requireInstanceOperator: Guard = byMember(
  (asker, ctx) => isInstanceOperatorOf(asker.user.id, ctx),
  (interaction, ctx) => {
    if (isInstanceOperatorOf(interaction.user.id, ctx)) return;
    throw new UserError(interaction.inGuild() ? ONLY_OPERATORS : ONLY_OPERATORS_IN_A_DM);
  },
);

export const requireBotChannel: Guard = (interaction, ctx) => {
  assertGuild(interaction);
  const values = ctx.servers.of(guildIdOf(interaction));
  if (!isBotChannel(channelContext(interaction).baseChannelId, values)) {
    const lab = values.channels['bot-lab'];
    // `/admin settings` is named only to who may use it (review F11; plan 19C-2).
    throw new UserError(
      lab !== undefined
        ? `Use this in <#${lab}>.`
        : isServerAdmin(interaction, ctx)
          ? 'This server has no bot lab yet: staff set one with /admin settings.'
          : 'This server has no bot lab yet.',
    );
  }
};

export const requireRegion: Guard = (interaction, ctx) => {
  assertGuild(interaction);
  if (regionChannelOf(interaction, ctx) === undefined) {
    throw new UserError('Use this in a region channel.');
  }
};

export const requirePvpContext: Guard = (interaction, ctx) => {
  const { isDm, categoryId } = channelContext(interaction);
  const values = interaction.guildId === null ? undefined : ctx.servers.of(interaction.guildId);
  if (!isPvpContext({ isDm, categoryId }, values)) {
    throw new UserError(pvpPlaces(values));
  }
};

/** Where PvP commands may be used, in words: in a DM, or under the server's PvP category. */
export function pvpPlaces(values: ServerValues | undefined): string {
  const category = values?.categories.pvp;
  return category === undefined
    ? 'Use this in a DM with me.'
    : `Use this in a DM with me or under <#${category}>.`;
}

/**
 * The party whose forum post an interaction came from, by the id of the post alone: the post
 * need not be in the cache. Undefined anywhere else, also for a copy of the party's message in
 * another channel (a control there carries the party's id in its custom id instead).
 */
export function partyOf(interaction: LocatedInteraction, ctx: AppContext): Party | undefined {
  const { channelId } = channelContext(interaction);
  return channelId === null ? undefined : ctx.parties.byPost(channelId);
}

/**
 * The party a control, a dialog or a guard names by its custom id, only where it is a party of
 * the server the interaction came from (spec, "The rule": every id checked against the server it
 * came from). A custom id can be sent from anywhere, so a party of another server, and any party
 * named from a DM, is undefined, as a party that has ended is: the caller answers it with the
 * words it has for that, and nothing tells that it exists. The party's server is its `Guild`
 * row's, read in memory (`PartyService.serverOf`, over every row read at the start, never a
 * bounded memory), so the check reads nothing slow and a guard can ask it.
 */
export function partyOfServer(
  interaction: { guildId: string | null },
  ctx: Pick<AppContext, 'parties' | 'partyService'>,
  partyId: string,
): Party | undefined {
  const party = ctx.parties.get(partyId);
  if (party === undefined || interaction.guildId === null) return undefined;
  return ctx.partyService.serverOf(party) === interaction.guildId ? party : undefined;
}

/** What a member is told who uses a command for the post of a party anywhere else. */
export const IN_A_PARTY_POST =
  'Use this in the post of a raid, max battle, train or meetup that is still active.';

/**
 * For commands that act on the party of the post they are used in. The guard does not hand the
 * party on, so a handler asks `partyOf` again and must cope with undefined: the party can end
 * between the guard and the handler.
 */
export const requireParty: Guard = (interaction, ctx) => {
  assertGuild(interaction);
  if (!partyOf(interaction, ctx)) throw new UserError(IN_A_PARTY_POST);
};

/**
 * What a member is told who uses something that is for one kind of party (`wanted`: `a raid`,
 * `a meetup`) in the post of another: the sentence names the kind of post they are in.
 */
function wrongPost(party: Pick<Party, 'type'>, wanted: string): string {
  return `This is the post of a ${partyWord(party)}: that only works in the post of ${wanted}.`;
}

/** What a member is told who uses something that is for raids in the post of another party. */
export function notARaid(party: Pick<Party, 'type'>): string {
  return wrongPost(party, 'a raid');
}

/** The raid whose forum post an interaction came from; undefined in any other place. */
export function raidOf(interaction: LocatedInteraction, ctx: AppContext): RaidParty | undefined {
  const party = partyOf(interaction, ctx);
  return party && isRaid(party) ? party : undefined;
}

/**
 * A guard for commands that are about one kind of party: `requireParty`, and the party of the
 * post must be of that kind (`wanted`: `a raid`, `a meetup`).
 */
function requirePartyOf(fits: (party: Party) => boolean, wanted: string): Guard {
  return (interaction, ctx) => {
    assertGuild(interaction);
    const party = partyOf(interaction, ctx);
    if (!party) throw new UserError(`Use this in the post of ${wanted} that is still active.`);
    if (!fits(party)) throw new UserError(wrongPost(party, wanted));
  };
}

/** For commands that are about a raid as such: its egg, boss, gym. */
export const requireRaid: Guard = requirePartyOf(isRaid, 'a raid');

/** The kinds of party that are at a place and can have a boss, as a sentence names them. */
export const A_RAID_OR_TRAIN = 'a raid, max battle or train';

/** What a member is told who uses something that is for raids and trains in a meetup's post. */
export function notARaidOrTrain(party: Pick<Party, 'type'>): string {
  return wrongPost(party, A_RAID_OR_TRAIN);
}

/**
 * For commands that are about the boss or the place of a party (`/boss`, `/where`): a raid, a
 * max battle (plan 8X-3), and a train, which is after a boss and at the stop it has reached.
 * Named outright: a kind added later is none of them by elimination.
 */
export const requireRaidOrTrain: Guard = requirePartyOf(
  (party) => isRaid(party) || isMax(party) || isTrain(party),
  A_RAID_OR_TRAIN,
);

/**
 * The kinds of party that have a name and times of their own (`TimedParty`), as a sentence
 * names where a command for them works.
 */
export const A_TIMED_PARTY = 'a train or meetup';

/** What a member is told who uses something that is for timed parties in the post of a raid. */
export function notTimed(party: Pick<Party, 'type'>): string {
  return wrongPost(party, A_TIMED_PARTY);
}

/** What a member is told who uses something that is for meetups in the post of another party. */
export function notAMeetup(party: Pick<Party, 'type'>): string {
  return wrongPost(party, 'a meetup');
}

/** For commands that are about a party with a name of its own (`/name`). */
export const requireTimed: Guard = requirePartyOf(isTimed, A_TIMED_PARTY);

/** For commands that are about a meetup as such (`/info`). */
export const requireMeetup: Guard = requirePartyOf(isMeetup, 'a meetup');

/** What a member is told who uses something that is for trains in the post of another party. */
export function notATrain(party: Pick<Party, 'type'>): string {
  return wrongPost(party, 'a train');
}

/** For commands that are about a train as such: its route, its conductor, moving it. */
export const requireTrain: Guard = requirePartyOf(isTrain, 'a train');

/** The train whose forum post an interaction came from; undefined in any other place. */
export function trainOf(interaction: LocatedInteraction, ctx: AppContext): TrainParty | undefined {
  const party = partyOf(interaction, ctx);
  return party && isTrain(party) ? party : undefined;
}
