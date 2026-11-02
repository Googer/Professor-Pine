import { OverwriteType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';

/*
 * The bot's permissions as Discord computes them, from what its REST API gives (the server's
 * roles, the bot's member, a channel's overwrites), for the cutover check, which works without
 * the gateway and so without discord.js's caches. And what the bot needs, taken from what the
 * code asks of Discord (`PartyGateway` and the services over it).
 */

/** A role as `GET /guilds/{id}` lists it. */
export interface ApiRole {
  id: string;
  name: string;
  /** The permission bits as a decimal string. */
  permissions: string;
  position: number;
}

/** A permission overwrite as a channel of `GET /guilds/{id}/channels` lists it. */
export interface ApiOverwrite {
  id: string;
  type: OverwriteType;
  allow: string;
  deny: string;
}

/** A member: who, and the roles they hold (not the server's everyone role). */
export interface ApiMember {
  id: string;
  roleIds: readonly string[];
}

const ALL = PermissionsBitField.All;

/** The member's permissions in the server: everyone's and their roles'; all for the owner or an administrator. */
export function basePermissions(
  guild: { id: string; ownerId: string },
  roles: readonly ApiRole[],
  member: ApiMember,
): bigint {
  if (member.id === guild.ownerId) return ALL;
  let permissions = BigInt(roles.find((role) => role.id === guild.id)?.permissions ?? '0');
  for (const roleId of member.roleIds) {
    permissions |= BigInt(roles.find((role) => role.id === roleId)?.permissions ?? '0');
  }
  return (permissions & P.Administrator) === P.Administrator ? ALL : permissions;
}

/**
 * The member's permissions in a channel (or a category): the server's, then the overwrite of
 * everyone, then those of the member's roles together (an allowance beats a denial among them),
 * then the member's own. An administrator has everything.
 */
export function channelPermissions(
  base: bigint,
  guildId: string,
  member: ApiMember,
  overwrites: readonly ApiOverwrite[],
): bigint {
  if ((base & P.Administrator) === P.Administrator) return ALL;
  let permissions = base;
  const everyone = overwrites.find((one) => one.id === guildId);
  if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n;
  let deny = 0n;
  for (const one of overwrites) {
    if (one.type !== OverwriteType.Role || one.id === guildId) continue;
    if (!member.roleIds.includes(one.id)) continue;
    allow |= BigInt(one.allow);
    deny |= BigInt(one.deny);
  }
  permissions = (permissions & ~deny) | allow;
  const own = overwrites.find((one) => one.type === OverwriteType.Member && one.id === member.id);
  if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);
  return permissions;
}

/** A permission the bot needs: its flag, its name in Discord's settings, and what for. */
export interface Need {
  flag: bigint;
  name: string;
  why: string;
  /** Without it the bot works, with less: a warning rather than a failure. */
  optional?: boolean;
}

const need = (flag: bigint, name: string, why: string, optional?: boolean): Need => ({
  flag,
  name,
  why,
  ...(optional ? { optional } : {}),
});

const VIEW = need(P.ViewChannel, 'View Channels', 'everything');
const SEND = need(P.SendMessages, 'Send Messages', 'posts and messages');
const EMBED = need(P.EmbedLinks, 'Embed Links', 'copies of posts and links that show their page');
const ATTACH = need(
  P.AttachFiles,
  'Attach Files',
  'map pictures, lists sent as files, eggs without the web pages',
);
const HISTORY = need(
  P.ReadMessageHistory,
  'Read Message History',
  'replies, the cleanup, the tutorial',
);
const MANAGE_CHANNELS = need(
  P.ManageChannels,
  'Manage Channels',
  'the forums of /admin setup-forums and /region, the cleanup of legacy channels',
);
const MANAGE_ROLES = need(
  P.ManageRoles,
  'Manage Roles',
  'self-assigned roles; in a channel, Manage Permissions: who may see and post in a forum',
);
const MANAGE_THREADS = need(
  P.ManageThreads,
  'Manage Threads',
  'archiving, locking, renaming and pinning posts; pinning and opening the board (plan 8R-9F)',
);
const THREADS = need(
  P.SendMessagesInThreads,
  'Send Messages in Threads',
  'messages in posts; "Today’s Stops" in the board',
);
/**
 * Deleting what members write in the board (plan 8R-9F, B5): without it the board works and
 * members' messages stay there, so a warning (R3).
 */
const CLEANS_BOARD = need(
  P.ManageMessages,
  'Manage Messages',
  'deleting what members write in the board (plan 8R-9F)',
  true,
);
const REACT = need(P.AddReactions, 'Add Reactions', 'the marks on a screenshot it reads', true);
const EXTERNAL = need(
  P.UseExternalEmojis,
  'Use External Emojis',
  "other servers' emoji where the application has none of a name",
  true,
);

/** What the bot needs in the server as a whole (its roles). */
export const SERVER_NEEDS: readonly Need[] = [
  VIEW,
  SEND,
  THREADS,
  EMBED,
  ATTACH,
  HISTORY,
  MANAGE_CHANNELS,
  MANAGE_ROLES,
  MANAGE_THREADS,
  REACT,
  EXTERNAL,
];

/**
 * What it needs in a region's channel: the link to a new post, spawn reports, screenshot replies,
 * the lines of new tasks and leaders (plan 8R-9). "Today’s Stops" is in the region's board since
 * plan 8R-9, so nothing is pinned here.
 */
export const REGION_CHANNEL_NEEDS: readonly Need[] = [
  VIEW,
  SEND,
  EMBED,
  ATTACH,
  HISTORY,
  REACT,
  need(
    P.ManageMessages,
    'Manage Messages',
    'taking a screenshot away once it is a raid (src/discord/screenshot-message.ts)',
    true,
  ),
];

/**
 * What it needs in a channel it announces in or copies posts to (bot-updates, the moderators'
 * channel, Unown sightings, the elite and remote raid channels).
 */
export const ANNOUNCE_NEEDS: readonly Need[] = [VIEW, SEND, EMBED, ATTACH];

/** What `/admin tutorial` needs in its channel (plan 8M-18): to find its own messages too. */
export const TUTORIAL_NEEDS: readonly Need[] = [VIEW, SEND, EMBED, HISTORY];

/**
 * What it needs in the moderators' channel of meetup safety (`settings.channels.moderation`,
 * plan 8S-1): its posts of requests and appeals, with their buttons and the Wayspot's picture.
 */
export const MODERATION_NEEDS: readonly Need[] = [VIEW, SEND, EMBED];

/**
 * What it needs in a region's forum, and in the category the forum is made in (a new forum
 * takes the category's overwrites): posts, their messages, archiving them, who may see them, and
 * since plan 8R-9 the region's board with "Today’s Stops" in it. Since plan 8R-9F (B5) the board
 * is open to members: writing in it takes Send Messages in Threads and Embed Links
 * (`PartyGateway.postAccess`), pinning and opening it Manage Threads, and deleting what members
 * write there Manage Messages (optional, R3).
 */
export const FORUM_NEEDS: readonly Need[] = [
  VIEW,
  SEND,
  THREADS,
  EMBED,
  ATTACH,
  HISTORY,
  MANAGE_CHANNELS,
  MANAGE_ROLES,
  MANAGE_THREADS,
  CLEANS_BOARD,
];

/**
 * What it needs in the events forum (`settings.channels.events`, plan 8V-1): its posts (Create
 * Posts, a forum's Send Messages: members make none), their messages and the listing's edits,
 * and pinning, locking and archiving them (Manage Posts).
 */
export const EVENTS_FORUM_NEEDS: readonly Need[] = [
  VIEW,
  SEND,
  THREADS,
  EMBED,
  HISTORY,
  MANAGE_THREADS,
];

/**
 * What the bot's own roles must give it in the server to make a hidden forum (rehearsal mode,
 * `HIDDEN_FORUM_REFUSED` of `src/services/party-service.ts`): a creation's overwrites may give
 * only what it has there, and the staff and testers get to see, read, write in posts and react
 * (Add Reactions, optional elsewhere, is required here).
 */
export const HIDDEN_FORUM_NEEDS: readonly Need[] = [
  MANAGE_CHANNELS,
  MANAGE_ROLES,
  VIEW,
  SEND,
  HISTORY,
  THREADS,
  REACT,
];

/** What a forum's settings call a permission that a text channel's call otherwise (plan 8S-3). */
const FORUM_NAMES = new Map<bigint, string>([
  [P.SendMessages, 'Create Posts'],
  [P.SendMessagesInThreads, 'Send Messages in Posts'],
  [P.ManageThreads, 'Manage Posts'],
]);

/**
 * The needs as a forum's settings name them, the usual name beside (`Manage Posts (Manage
 * Threads)`): what an admin finds in the forum's permissions.
 */
export function inForum(needs: readonly Need[]): Need[] {
  return needs.map((one) => {
    const name = FORUM_NAMES.get(one.flag);
    return name === undefined ? one : { ...one, name: `${name} (${one.name})` };
  });
}

/** The needs that `permissions` lack, the required apart from the optional. */
export function missingNeeds(
  permissions: bigint,
  needs: readonly Need[],
): { required: Need[]; optional: Need[] } {
  const missing = needs.filter((one) => (permissions & one.flag) !== one.flag);
  return {
    required: missing.filter((one) => !one.optional),
    optional: missing.filter((one) => one.optional),
  };
}
