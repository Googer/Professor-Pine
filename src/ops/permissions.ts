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

/**
 * What a Share of the region board (plan 8H-5) reads of a server, from the gateway's cache: every
 * role with its permissions (the everyone role, whose id is the server's, among them), the
 * overwrites of the region's forum (or its text channel where it has none) and of the channel
 * shared into (its parent's for a thread), and a member's roles where the cache has the member.
 */
export interface ShareView {
  guildId: string;
  roles: ReadonlyArray<{ id: string; permissions: bigint }>;
  region: readonly ApiOverwrite[];
  share: readonly ApiOverwrite[];
  /**
   * The roles of a member (not the everyone role): undefined when nobody can say (not in the
   * cache, and not fetched), null for somebody who is not in the server (their overwrite lets
   * nobody in).
   */
  rolesOf(memberId: string): readonly string[] | null | undefined;
}

/**
 * Whether a region's counts may go into a channel (Matt, 2026-11-05, R-A): only if everybody who
 * can view the channel shared into can view the region's forum, judged as Discord computes it
 * (`channelPermissions`), the gateway and its fake alike:
 * - each role alone, the everyone role included (a member of no role): one that views the share
 *   channel must view the region;
 * - each role beside each role the region's overwrites name: a denial on the forum of a role held
 *   beside one that views the share channel is a gap, as allowances beat denials among roles;
 * - each member the share channel's overwrites let in by name: dropped unless their roles are
 *   known and they view the region (one not in the server lets nobody in).
 * A member's own denial on the forum is accepted: the board names nobody.
 *
 * These sets are complete (R1): take any set of roles S that views the share channel and not the
 * region. It views the share channel through one role W of S alone (a role allowing View there,
 * or, where no role of S allows and none denies it, the role whose server permissions or the
 * everyone overwrite give it; W empty for everyone), so W alone views it too. S does not view the
 * region: no role of S allows View there, so either W alone does not view it either (a single
 * catches it), or some role D of S denies it there, a role the region's overwrites name; then
 * {W, D} views the share channel (W allows, or D denied nothing there, else S would need a role
 * allowing it, which is then W) and not the region (D denies, nothing allows): a pair catches it.
 * An administrator sees both. `permissions.test.ts` checks this against a search over every set
 * of four roles on random servers.
 */
export function shareKeeps(view: ShareView): boolean {
  const { guildId, region, share } = view;
  const permissionsOf = new Map(view.roles.map((role) => [role.id, role.permissions]));
  const base = (roleIds: readonly string[]): bigint => {
    let permissions = permissionsOf.get(guildId) ?? 0n;
    for (const id of roleIds) permissions |= permissionsOf.get(id) ?? 0n;
    return (permissions & P.Administrator) === P.Administrator ? ALL : permissions;
  };
  const views = (overwrites: readonly ApiOverwrite[], member: ApiMember): boolean =>
    (channelPermissions(base(member.roleIds), guildId, member, overwrites) & P.ViewChannel) !== 0n;
  const others = view.roles.map((role) => role.id).filter((id) => id !== guildId);
  const named = region
    .filter((one) => one.type === OverwriteType.Role && one.id !== guildId)
    .map((one) => one.id);
  const sets: string[][] = [
    [],
    ...others.map((id) => [id]),
    ...named.flatMap((denied) =>
      [...others, ...named].filter((id) => id !== denied).map((id) => [id, denied]),
    ),
  ];
  for (const roleIds of sets) {
    const member = { id: '', roleIds };
    if (views(share, member) && !views(region, member)) return false;
  }
  for (const one of share) {
    if (one.type !== OverwriteType.Member || (BigInt(one.allow) & P.ViewChannel) === 0n) continue;
    const roleIds = view.rolesOf(one.id);
    if (roleIds === null) continue;
    if (roleIds === undefined || !views(region, { id: one.id, roleIds })) return false;
  }
  return true;
}

/** The members a share channel's overwrites let in by name (View allowed), whom `shareKeeps` asks of. */
export function namedViewers(share: readonly ApiOverwrite[]): string[] {
  return share
    .filter(
      (one) => one.type === OverwriteType.Member && (BigInt(one.allow) & P.ViewChannel) !== 0n,
    )
    .map((one) => one.id);
}

/**
 * The regions a board shared into a channel keeps (plan 8H-5, R-A, R2), by their forum's (or
 * text channel's) id: a region whose channel is the share channel or the channel a shared-in
 * post is in has the same audience and is kept before anything is checked; every other region by
 * `shareKeeps`.
 */
export function regionsKept(
  view: Omit<ShareView, 'region'> & {
    /** The share channel's id, and its parent's for a post. */
    shareIds: readonly string[];
    regions: ReadonlyArray<{ id: string; overwrites: readonly ApiOverwrite[] }>;
  },
): Set<string> {
  return new Set(
    view.regions
      .filter(
        (region) =>
          view.shareIds.includes(region.id) || shareKeeps({ ...view, region: region.overwrites }),
      )
      .map((region) => region.id),
  );
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
