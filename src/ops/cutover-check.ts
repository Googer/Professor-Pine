import { trustProxyWarning } from '../config/warnings.js';
import { ApplicationFlags, ChannelType, PermissionFlagsBits, Routes } from 'discord.js';
import { channelNamesOf, type Settings } from '../config/settings.js';
import type { MigrationPlan } from '../db/migrator.js';
import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
import { channelKey, channelNameFor } from '../domain/regions/region-import.js';
import type { DiscordRead } from './discord-rest.js';
import { applicationEmojiNames, failureReason, iconSources, missingIcons } from './emoji-upload.js';
import { cleanupList } from './legacy-cleanup.js';
import { readLegacyActive } from './legacy-parties.js';
import {
  basePermissions,
  channelPermissions,
  ANNOUNCE_NEEDS,
  MODERATION_NEEDS,
  EVENTS_FORUM_NEEDS,
  FORUM_NEEDS,
  HIDDEN_FORUM_NEEDS,
  inForum,
  missingNeeds,
  REGION_CHANNEL_NEEDS,
  SERVER_NEEDS,
  type ApiMember,
  type ApiOverwrite,
  type ApiRole,
  type Need,
} from './permissions.js';
import { exportText, roleAuthExport } from './role-auth.js';
import { isManagementRoleName, isStaffRoleName } from '../discord/guards.js';

/*
 * The cutover check (`./pine cutover-check`, `npm run cutover:check`): whether a legacy
 * installation is ready for the new bot, read only. The database through `CutoverStore` (only
 * `select`s, in a read-only transaction), Discord through its REST API with the bot's token
 * (GETs only: no gateway login, so a legacy bot that runs is not disturbed). Each finding is a
 * pass, warn or fail line; any fail is a no-go.
 */

/** What the check reads of the database. */
export interface CutoverStore {
  /** What the migrator would do (`migrationPlan`). */
  migrationPlan(): Promise<MigrationPlan>;
  /** The servers of `Guild`. */
  guilds(): Promise<string[]>;
  regionRows(): Promise<CutoverRegion[]>;
  /** The legacy `CommandRoleAuthorization` and `CommandRoles`; none where they are gone. */
  legacyRestrictions(): Promise<LegacyCommandRoles[]>;
  /** The self-assigned roles of `Role`, which the bot gives and takes. */
  selfRoles(): Promise<CutoverSelfRole[]>;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckLine {
  /** What the line is about: one line of each, but `server`, `region` and `names` per server or region. */
  what:
    | 'database'
    | 'web'
    | 'application'
    | 'public-bot'
    | 'intents'
    | 'emoji'
    | 'commands'
    | 'servers'
    | 'server'
    | 'region'
    | 'names'
    | 'forums'
    | 'boards'
    | 'restrictions'
    | 'cleanup'
    | 'announcements'
    | 'moderation'
    | 'events'
    | 'reports'
    | 'roles'
    | 'discord';
  status: CheckStatus;
  text: string;
  /** Lines under it: the migrations to run, the rows of a table. */
  detail?: string[];
}

export interface CutoverCheckOptions {
  store: CutoverStore;
  discord: DiscordRead;
  /** `DISCORD_APP_ID` of the environment. */
  appId: string;
  settings: Settings;
  /**
   * The legacy bot's `parties` folder: with it, the check counts what `/admin cleanup-legacy`
   * would delete (reading only).
   */
  legacyParties?: string;
}

/** A channel as `GET /guilds/{id}/channels` gives it. */
interface ApiChannel {
  id: string;
  name: string;
  type: ChannelType;
  parent_id?: string | null;
  permission_overwrites?: ApiOverwrite[];
}

function databaseLine(plan: MigrationPlan): CheckLine {
  if (plan.kind === 'refused') {
    return {
      what: 'database',
      status: 'fail',
      text: `database: the migrator would refuse it: ${plan.reason}`,
    };
  }
  const n = plan.pending.length;
  const runs = n === 0 ? 'it is up to date' : `${n} migration${n === 1 ? '' : 's'} will run`;
  const detail = n === 0 ? {} : { detail: plan.pending };
  switch (plan.kind) {
    case 'takeover':
      return {
        what: 'database',
        status: 'pass',
        text: `database: a legacy Professor Pine database, which the migrator takes over; ${runs}`,
        ...detail,
      };
    case 'pine':
      return {
        what: 'database',
        status: 'pass',
        text: `database: a Professor Pine database; ${runs}`,
        ...detail,
      };
    case 'new-install':
      return {
        what: 'database',
        status: 'warn',
        text:
          'database: empty: the migrator would make a new install. Was the dump restored ' +
          "('./pine restore')?",
      };
  }
}

/** The privileged intents, by the application's flags that grant them (either form). */
const PRIVILEGED = [
  {
    name: 'Presence',
    flags: ApplicationFlags.GatewayPresence | ApplicationFlags.GatewayPresenceLimited,
  },
  {
    name: 'Server Members',
    flags: ApplicationFlags.GatewayGuildMembers | ApplicationFlags.GatewayGuildMembersLimited,
  },
  {
    name: 'Message Content',
    flags: ApplicationFlags.GatewayMessageContent | ApplicationFlags.GatewayMessageContentLimited,
  },
] as const;

/**
 * Whether the rate limits of the web pages count each member (`trustProxyWarning`). A warning,
 * never a failure: the bot may be reached with nothing in front of it.
 */
function webLine(web: NonNullable<Settings['web']>): CheckLine {
  const warning = trustProxyWarning(web);
  return warning === undefined
    ? { what: 'web', status: 'pass', text: 'web: the rate limits count each visitor' }
    : { what: 'web', status: 'warn', text: `web: ${warning}` };
}

function intentsLine(flags: number, settings: Settings): CheckLine {
  const granted: string[] = PRIVILEGED.filter((one) => (flags & one.flags) !== 0).map(
    (one) => one.name,
  );
  const asked = [
    ...(settings.ocr.passive ? [{ name: 'Message Content', by: 'ocr.passive' }] : []),
    ...(settings.autoAssignRole ? [{ name: 'Server Members', by: 'autoAssignRole' }] : []),
  ];
  const has = granted.length === 0 ? 'none' : granted.join(', ');
  if (asked.length === 0) {
    return {
      what: 'intents',
      status: 'pass',
      text: `intents: the settings ask for no privileged intent (the application has ${has})`,
    };
  }
  const missing = asked.filter((one) => !granted.includes(one.name));
  const named = asked.map((one) => `${one.name} (${one.by})`).join(', ');
  return {
    what: 'intents',
    status: 'warn',
    text:
      missing.length > 0
        ? `intents: the settings ask for ${named}, which the application lacks: the bot starts without ${missing.length === 1 ? 'it' : 'them'}, and what ${missing.length === 1 ? 'it serves does' : 'they serve do'} nothing`
        : `intents: the settings ask for ${named}; the application has ${asked.length === 1 ? 'it' : 'them'} now, but Discord may take privileged intents away (its review)`,
  };
}

/** The names a list says: "A, B and C". */
function names(items: readonly string[]): string {
  return items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function needNames(needs: readonly Need[]): string {
  return needs.map((one) => one.name).join(', ');
}

/** One server's lines: the bot's member and permissions, each region, the names of the settings. */
async function serverLines(
  discord: DiscordRead,
  guildId: string,
  bot: { id: string; username: string },
  regions: readonly CutoverRegion[],
  settings: Settings,
  selfRoles: readonly CutoverSelfRole[],
): Promise<{ lines: CheckLine[]; withoutForum: string[]; withoutBoard: string[] }> {
  const lines: CheckLine[] = [];
  const guild = (await discord.get(Routes.guild(guildId))) as {
    id: string;
    name: string;
    owner_id: string;
    roles: ApiRole[];
  };
  let member: { roles: string[] };
  try {
    member = (await discord.get(Routes.guildMember(guildId, bot.id))) as { roles: string[] };
  } catch (err) {
    lines.push({
      what: 'server',
      status: 'fail',
      text: `server ${guild.name}: the bot's member could not be read: ${failureReason(err)}`,
    });
    return { lines, withoutForum: [], withoutBoard: [] };
  }
  const channels = (await discord.get(Routes.guildChannels(guildId))) as ApiChannel[];
  const me: ApiMember = { id: bot.id, roleIds: member.roles };
  const base = basePermissions({ id: guild.id, ownerId: guild.owner_id }, guild.roles, me);
  const roleNames = member.roles.map(
    (id) => guild.roles.find((role) => role.id === id)?.name ?? id,
  );
  const missing = missingNeeds(base, SERVER_NEEDS);
  // A rehearsal's forum is made hidden, and a creation's overwrites may give only what the bot
  // has in the server (`HIDDEN_FORUM_NEEDS`, all required): what a category's overwrite gives
  // is not enough.
  const forHiding = settings.rehearsal
    ? HIDDEN_FORUM_NEEDS.filter((one) => (base & one.flag) !== one.flag)
    : [];
  // One problem, one line: an optional permission the rehearsal requires is its failure alone.
  const optional = missing.optional.filter((one) => !forHiding.includes(one));
  const who = `the bot (${bot.username})`;
  const roles = roleNames.length === 0 ? 'no role' : `the roles ${roleNames.join(', ')}`;
  if (missing.required.length > 0) {
    lines.push({
      what: 'server',
      status: 'fail',
      text: `server ${guild.name}: ${who} lacks ${needNames(missing.required)} (it has ${roles})`,
      detail: missing.required.map((one) => `${one.name}: ${one.why}`),
    });
  } else if (optional.length > 0) {
    lines.push({
      what: 'server',
      status: 'warn',
      text: `server ${guild.name}: ${who} has ${roles}, and could use ${needNames(optional)}`,
      detail: optional.map((one) => `${one.name}: ${one.why}`),
    });
  } else if (forHiding.length === 0) {
    lines.push({
      what: 'server',
      status: 'pass',
      text: `server ${guild.name}: ${who} has ${roles}, and every permission it needs`,
    });
  }
  if (forHiding.length > 0) {
    lines.push({
      what: 'server',
      status: 'fail',
      text:
        `server ${guild.name}: in rehearsal mode the bot's own roles must give it ` +
        `${needNames(forHiding)}: a hidden forum is made with what the bot has in the server, ` +
        'and an overwrite of a category does not count',
    });
  }

  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const permissionsIn = (channel: ApiChannel) =>
    channelPermissions(base, guild.id, me, channel.permission_overwrites ?? []);
  const withoutForum: string[] = [];
  // The regions with a forum but no board recorded (plan 8R-9, review P11, R5).
  const withoutBoard: string[] = [];
  // Where the bot could not delete what a report is about (plan 8S-2).
  const reportGaps: string[] = [];
  for (const region of regions) {
    const channel = byId.get(region.channelId);
    if (!channel) {
      lines.push({
        what: 'region',
        status: 'warn',
        text: `region ${region.channelId}: its channel is gone; the region stays until '/region' removes it`,
      });
      withoutForum.push(region.channelId);
      continue;
    }
    const places: { place: string; channel: ApiChannel; needs: readonly Need[] }[] = [
      { place: 'the channel', channel, needs: REGION_CHANNEL_NEEDS },
    ];
    const category = channel.parent_id ? byId.get(channel.parent_id) : undefined;
    if (category) {
      places.push({
        place: `the category ${category.name}`,
        channel: category,
        needs: FORUM_NEEDS,
      });
    }
    const forum = region.forumChannelId === null ? undefined : byId.get(region.forumChannelId);
    if (forum)
      places.push({
        place: `the forum #${forum.name}`,
        channel: forum,
        needs: inForum(FORUM_NEEDS),
      });
    else withoutForum.push(`#${channel.name}`);
    if (region.forumChannelId !== null && region.summaryMessageId === null) {
      withoutBoard.push(`#${channel.name}`);
    }
    const reportPlaces = [
      { place: `#${channel.name}`, channel, needs: REPORT_CHANNEL_NEEDS },
      ...(forum
        ? [
            {
              place: `the forum #${forum.name}`,
              channel: forum,
              needs: inForum(REPORT_FORUM_NEEDS),
            },
          ]
        : []),
    ];
    for (const one of reportPlaces) {
      const gap = missingNeeds(permissionsIn(one.channel), one.needs).required;
      if (gap.length > 0) reportGaps.push(`${needNames(gap)} in ${one.place}`);
    }
    const lacks: string[] = [];
    const wants: string[] = [];
    for (const one of places) {
      const gap = missingNeeds(permissionsIn(one.channel), one.needs);
      if (gap.required.length > 0) lacks.push(`${needNames(gap.required)} in ${one.place}`);
      if (gap.optional.length > 0) wants.push(`${needNames(gap.optional)} in ${one.place}`);
    }
    const gone =
      region.forumChannelId !== null && !forum
        ? '; its forum is gone (/admin setup-forums makes a new one)'
        : '';
    const label = `region #${channel.name}`;
    if (lacks.length > 0) {
      lines.push({
        what: 'region',
        status: 'fail',
        text: `${label}: the bot lacks ${lacks.join(', ')}${gone}`,
      });
    } else if (wants.length > 0 || gone !== '') {
      lines.push({
        what: 'region',
        status: 'warn',
        text: `${label}: ${wants.length > 0 ? `the bot could use ${wants.join(', ')}` : 'the bot has what it needs'}${gone}`,
      });
    } else {
      lines.push({
        what: 'region',
        status: 'pass',
        text: `${label}: the bot has what it needs ${names(places.map((one) => `in ${one.place}`))}`,
      });
    }
  }

  lines.push(namesLine(guild.name, channels, guild.roles, settings));
  lines.push(announceLine(guild.name, channels, settings, permissionsIn));
  // Who may see a staff-only channel beside staff and the bot: everyone (the server's everyone
  // role), or the roles that let a member who is no staff see it. Staff are the roles the bot
  // takes for staff by their names (`isStaffRoleName`) and those that may manage the server.
  const holderOf = (roleIds: readonly string[]): ApiMember => ({ id: '', roleIds });
  const sees = (holder: ApiMember, channel: ApiChannel): boolean =>
    (channelPermissions(
      basePermissions({ id: guild.id, ownerId: guild.owner_id }, guild.roles, holder),
      guild.id,
      holder,
      channel.permission_overwrites ?? [],
    ) &
      PermissionFlagsBits.ViewChannel) !==
    0n;
  const seenBy = (channel: ApiChannel): 'everyone' | string[] => {
    if (sees(holderOf([]), channel)) return 'everyone';
    return guild.roles
      .filter(
        (role) =>
          role.id !== guild.id &&
          !member.roles.includes(role.id) &&
          !isStaffRoleName(role.name) &&
          (BigInt(role.permissions) &
            (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)) ===
            0n &&
          sees(holderOf([role.id]), channel),
      )
      .map((role) => role.name);
  };
  // The staff roles (Admin, Moderator: those who decide there) that cannot see it: the links of
  // `/places` and of the reports do not open for their members (staging of 8S-2).
  const unseenByStaff = (channel: ApiChannel): string[] =>
    guild.roles
      .filter((role) => isManagementRoleName(role.name) && !sees(holderOf([role.id]), channel))
      .map((role) => role.name);
  lines.push(moderationLine(guild.name, channels, settings, permissionsIn, seenBy, unseenByStaff));
  if (settings.channels.moderation !== undefined) lines.push(reportsLine(guild.name, reportGaps));
  // Whether a holder of these roles sees a channel but cannot write in its posts (BR-7; re-review
  // RR-4: one that cannot see it is left out, as a server may keep @everyone out of channels).
  const silentIn = (channel: ApiChannel, roleIds: readonly string[]): boolean => {
    const holder = holderOf(roleIds);
    const has = channelPermissions(
      basePermissions({ id: guild.id, ownerId: guild.owner_id }, guild.roles, holder),
      guild.id,
      holder,
      channel.permission_overwrites ?? [],
    );
    return (
      (has & PermissionFlagsBits.ViewChannel) !== 0n &&
      (has & PermissionFlagsBits.SendMessagesInThreads) === 0n
    );
  };
  const events = eventsLine(guild.name, channels, settings, permissionsIn, {
    guildId: guild.id,
    roles: guild.roles,
    silentIn,
  });
  if (events) lines.push(events);
  const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
  if (rolesCheck) lines.push(rolesCheck);
  return { lines, withoutForum, withoutBoard };
}

/** The channels the bot announces in or copies posts to, as the settings name them. */
function announceChannels(settings: Settings): string[] {
  const { channels: named, features } = settings;
  return [
    named['bot-updates'],
    named['mod-bot-lab'],
    named.unown,
    ...(features.exGymChannel ? [named['elite-gym-raids']] : []),
    ...(features.remoteRaidChannel ? [named['remote-raids']] : []),
  ];
}

/** Whether the bot may post in the channels it announces in (those that exist: `names` says the rest). */
function announceLine(
  server: string,
  channels: readonly ApiChannel[],
  settings: Settings,
  permissionsIn: (channel: ApiChannel) => bigint,
): CheckLine {
  const gaps = announceChannels(settings).flatMap((name) => {
    const channel = channels.find(
      (one) =>
        one.name === name &&
        (one.type === ChannelType.GuildText || one.type === ChannelType.GuildAnnouncement),
    );
    if (!channel) return [];
    const missing = missingNeeds(permissionsIn(channel), ANNOUNCE_NEEDS).required;
    return missing.length === 0 ? [] : [`${needNames(missing)} in #${name}`];
  });
  return gaps.length === 0
    ? {
        what: 'announcements',
        status: 'pass',
        text: `announcements: in ${server} the bot may post in every channel it announces in`,
      }
    : {
        what: 'announcements',
        status: 'warn',
        text: `announcements: in ${server} the bot lacks ${gaps.join(', ')}`,
      };
}

/**
 * Meetup safety (plan 8S-1): whether the moderators' channel is set, the server has it (a text
 * channel, as the bot finds it), the bot may post in it (`MODERATION_NEEDS`), it is staff-only
 * (`seenBy`: not seen by everyone, nor through a role that is no staff role), and every staff
 * role sees it (`unseenByStaff`, plan 8S-3: Admin and Moderator by name). A warning, never a
 * failure: without it every meetup is posted at once, as before.
 */
function moderationLine(
  server: string,
  channels: readonly ApiChannel[],
  settings: Settings,
  permissionsIn: (channel: ApiChannel) => bigint,
  seenBy: (channel: ApiChannel) => 'everyone' | string[],
  unseenByStaff: (channel: ApiChannel) => string[],
): CheckLine {
  const name = settings.channels.moderation;
  if (name === undefined) {
    return {
      what: 'moderation',
      status: 'warn',
      text:
        'moderation: settings.channels.moderation is not set, so meetup safety is off: every ' +
        'meetup is posted at once, wherever it is',
    };
  }
  const channel = channels.find((one) => one.name === name && one.type === ChannelType.GuildText);
  const cannot = 'a meetup that needs approval cannot be made there';
  if (!channel) {
    return {
      what: 'moderation',
      status: 'warn',
      text: `moderation: ${server} has no channel #${name}: ${cannot}`,
    };
  }
  const missing = missingNeeds(permissionsIn(channel), MODERATION_NEEDS).required;
  if (missing.length > 0) {
    return {
      what: 'moderation',
      status: 'warn',
      text: `moderation: in ${server} the bot lacks ${needNames(missing)} in #${name}: ${cannot}`,
    };
  }
  // Who sees it that should not, and which staff role does not: both in one warning (plan 8S-3).
  const problems: string[] = [];
  const seen = seenBy(channel);
  const staffOnly = 'its posts name members and where they meet; make it staff-only';
  if (seen === 'everyone') {
    problems.push(`everyone can see #${name}: ${staffOnly}`);
  } else if (seen.length > 0) {
    const roles = `the role${seen.length === 1 ? '' : 's'} ${seen.join(', ')}`;
    problems.push(
      `${roles} can see #${name} and ` +
        `${seen.length === 1 ? 'is no staff role' : 'are no staff roles'}: ${staffOnly}`,
    );
  }
  const unseen = unseenByStaff(channel);
  if (unseen.length > 0) {
    const one = unseen.length === 1;
    problems.push(
      `the role${one ? '' : 's'} ${unseen.join(', ')} cannot see #${name}: the links of ` +
        `/places and of the reports there do not open for ${one ? 'its' : 'their'} members; ` +
        'let every staff role see it',
    );
  }
  if (problems.length > 0) {
    const [first, ...more] = problems;
    return {
      what: 'moderation',
      status: 'warn',
      text: [`moderation: in ${server} ${first ?? ''}`, ...more.map((one) => `And ${one}`)].join(
        '. ',
      ),
    };
  }
  return {
    what: 'moderation',
    status: 'pass',
    text: `moderation: in ${server} meetups that need approval go to #${name}`,
  };
}

/**
 * The events forum (plan 8V-1), where the settings name one: whether the server has it (a forum,
 * as `/admin setup-forums` finds it by name) and the bot may post, manage and write in it
 * (`EVENTS_FORUM_NEEDS`). A warning, never a failure: the events forum is extra. Nothing while
 * the settings name none.
 */
function eventsLine(
  server: string,
  channels: readonly ApiChannel[],
  settings: Settings,
  permissionsIn: (channel: ApiChannel) => bigint,
  members: {
    guildId: string;
    roles: readonly ApiRole[];
    silentIn: (channel: ApiChannel, roleIds: readonly string[]) => boolean;
  },
): CheckLine | undefined {
  const { guildId, roles, silentIn } = members;
  const named = settings.channels.events;
  if (named === undefined) return undefined;
  // As Discord stores the name, and as `/admin setup-forums` finds it (review V7, ruling R4).
  const name = channelNameFor(named) || named;
  const forum = channels.find(
    (one) => channelKey(one.name) === channelKey(name) && one.type === ChannelType.GuildForum,
  );
  if (!forum) {
    return {
      what: 'events',
      status: 'warn',
      text: `events: ${server} has no forum #${name}: /admin setup-forums makes it`,
    };
  }
  const missing = missingNeeds(permissionsIn(forum), inForum(EVENTS_FORUM_NEEDS)).required;
  if (missing.length > 0) {
    return {
      what: 'events',
      status: 'warn',
      text:
        `events: in ${server} the bot lacks ${needNames(missing)} in #${name}: the listing ` +
        'and the event posts cannot be kept there',
    };
  }
  // Members write in the event posts (branch review BR-7): @everyone, and the map's member role
  // where the settings name one.
  const memberRole = settings.web?.memberRole;
  const silent = [
    { id: guildId, name: '@everyone' },
    ...roles.filter((role) => memberRole !== undefined && role.name === memberRole),
  ]
    .filter((role) => silentIn(forum, role.id === guildId ? [] : [role.id]))
    .map((role) => role.name);
  if (silent.length > 0) {
    return {
      what: 'events',
      status: 'warn',
      text:
        `events: in ${server} ${silent.join(' and ')} cannot write in the posts of #${name}: ` +
        `allow ${silent.length === 1 ? '' : 'them '}Send Messages in Posts there`,
    };
  }
  return {
    what: 'events',
    status: 'pass',
    text: `events: in ${server} the events are listed in #${name}`,
  };
}

/** What Delete message of a report needs in a region's channel (plan 8S-2). */
const REPORT_CHANNEL_NEEDS: readonly Need[] = [
  {
    flag: PermissionFlagsBits.ManageMessages,
    name: 'Manage Messages',
    why: "a report's Delete message deletes what a member wrote",
  },
];

/** What Delete message and Delete post of a report need in a region's forum (plan 8S-2). */
const REPORT_FORUM_NEEDS: readonly Need[] = [
  ...REPORT_CHANNEL_NEEDS,
  {
    flag: PermissionFlagsBits.ManageThreads,
    name: 'Manage Threads',
    why: "a report's Delete post deletes a party's post",
  },
];

/**
 * Reports to the moderators (plan 8S-2), only where the moderators' channel is set: whether
 * the bot may delete a reported message in the regions' channels and forums (Manage Messages)
 * and a party's post (Manage Threads). A warning, never a failure: the moderators then delete
 * them themselves.
 */
function reportsLine(server: string, gaps: readonly string[]): CheckLine {
  return gaps.length === 0
    ? {
        what: 'reports',
        status: 'pass',
        text: `reports: in ${server} the bot may delete reported messages and posts in every region`,
      }
    : {
        what: 'reports',
        status: 'warn',
        text:
          `reports: in ${server} the bot lacks ${gaps.join(', ')}: the moderators delete ` +
          'reported messages and posts there themselves',
      };
}

/** A role's name as the bot compares it (`unown-want-service.ts`): trimmed, lower case. */
const roleKey = (name: string) => name.trim().toLowerCase();

/**
 * The self-assigned roles the bot cannot give: Discord lets a bot manage only roles below its
 * own highest. Nothing when the server has none.
 */
function rolesLine(
  server: string,
  roles: readonly ApiRole[],
  botRoleIds: readonly string[],
  selfRoles: readonly CutoverSelfRole[],
): CheckLine | undefined {
  if (selfRoles.length === 0) return undefined;
  const mine = roles.filter((role) => botRoleIds.includes(role.id));
  const top = mine.reduce<ApiRole | undefined>(
    (best, role) => (best === undefined || role.position > best.position ? role : best),
    undefined,
  );
  const above = selfRoles.flatMap((self) => {
    const role =
      (self.roleId === null ? undefined : roles.find((one) => one.id === self.roleId)) ??
      roles.find((one) => roleKey(one.name) === roleKey(self.name));
    return role && role.position >= (top?.position ?? 0) ? [role.name] : [];
  });
  if (above.length === 0) {
    return {
      what: 'roles',
      status: 'pass',
      text: `roles: in ${server} the bot can give every self-assigned role`,
    };
  }
  return {
    what: 'roles',
    status: 'warn',
    text:
      `roles: in ${server} the self-assigned role${above.length === 1 ? '' : 's'} ${above.join(', ')} ` +
      `${above.length === 1 ? 'is' : 'are'} above the bot's highest role (${top?.name ?? 'none'}): ` +
      `the bot cannot give ${above.length === 1 ? 'it' : 'them'}`,
  };
}

/** The channels, categories and roles the settings name that the server lacks. */
function namesLine(
  server: string,
  channels: readonly ApiChannel[],
  roles: readonly ApiRole[],
  settings: Settings,
): CheckLine {
  const text = new Set(
    channels
      .filter(
        (one) => one.type === ChannelType.GuildText || one.type === ChannelType.GuildAnnouncement,
      )
      .map((one) => one.name),
  );
  const categories = new Set(
    channels.filter((one) => one.type === ChannelType.GuildCategory).map((one) => one.name),
  );
  const roleNames = new Set(roles.map((one) => roleKey(one.name)));
  const { channels: named, features } = settings;
  const wanted: [string, string][] = [
    ['bot-lab', named['bot-lab']],
    ['mod-bot-lab', named['mod-bot-lab']],
    ['unown', named.unown],
    ...(features.exGymChannel
      ? [['elite-gym-raids', named['elite-gym-raids']] as [string, string]]
      : []),
    ...(features.remoteRaidChannel
      ? [['remote-raids', named['remote-raids']] as [string, string]]
      : []),
    ['bot-updates', named['bot-updates']],
  ];
  const lacking = [
    ...wanted
      .filter(([, name]) => !text.has(name))
      .map(([key, name]) => `channels.${key} (#${name})`),
    ...(categories.has(settings.categories.pvp)
      ? []
      : [`categories.pvp (${settings.categories.pvp})`]),
    ...(roleNames.has(roleKey(settings.roles.unown))
      ? []
      : [`roles.unown (${settings.roles.unown})`]),
  ];
  return lacking.length === 0
    ? {
        what: 'names',
        status: 'pass',
        text: `names: ${server} has every channel, category and role the settings name`,
      }
    : {
        what: 'names',
        status: 'warn',
        text: `names: ${server} lacks what the settings name: ${lacking.join(', ')}`,
      };
}

/** What `/admin cleanup-legacy` would list in a server, counted (it deletes nothing here). */
async function cleanupLine(
  discord: DiscordRead,
  dir: string,
  server: {
    guildId: string;
    name: string;
    botId: string;
    regions: readonly CutoverRegion[];
    settings: Settings;
  },
): Promise<CheckLine> {
  const read = readLegacyActive(dir);
  if (!read.ok) return { what: 'cleanup', status: 'warn', text: `cleanup: ${read.error}` };
  const named = new Set(read.parties.map((party) => party.channelId));
  const stays = (n: number) =>
    n === 0
      ? ''
      : n === 1
        ? '; 1 legacy train, meetup or saved party stays as a plain channel'
        : `; ${n} legacy trains, meetups or saved parties stay as plain channels`;
  const list = await cleanupList(discord, {
    guildId: server.guildId,
    botId: server.botId,
    regionChannelIds: server.regions.map((one) => one.channelId),
    regionForumIds: server.regions.flatMap((one) =>
      one.forumChannelId === null ? [] : [one.forumChannelId],
    ),
    settingsChannelNames: channelNamesOf(server.settings),
    legacyParties: read.parties,
  });
  const byFile = list.remove.filter((entry) => named.has(entry.channelId)).length;
  const gone =
    list.gone === 0
      ? ''
      : `; ${list.gone === 1 ? '1 channel the files name is' : `${list.gone} channels the files name are`} gone`;
  const skipped =
    read.skipped.length === 0 ? '' : `; ${read.skipped.length} legacy files could not be read`;
  const text =
    `cleanup: ${server.name}: ${list.remove.length} legacy party channel${list.remove.length === 1 ? '' : 's'} ` +
    `to delete with /admin cleanup-legacy (${byFile} named by the legacy files, ` +
    `${list.remove.length - byFile} found by name and first message)${stays(list.stays.length)}` +
    `${gone}${skipped}`;
  if (list.kept.length === 0 && read.skipped.length === 0) {
    return { what: 'cleanup', status: 'pass', text };
  }
  return {
    what: 'cleanup',
    status: 'warn',
    text:
      list.kept.length === 0
        ? text
        : `${text}; ${list.kept.length} only look${list.kept.length === 1 ? 's' : ''} like one: a person judges`,
    detail: list.kept.map(
      (entry) =>
        `#${entry.name}${entry.category === null ? '' : ` in ${entry.category}`}: ${entry.why}`,
    ),
  };
}

function restrictionsLine(rows: readonly LegacyCommandRoles[]): CheckLine {
  const servers = roleAuthExport(rows);
  if (servers.length === 0) {
    return {
      what: 'restrictions',
      status: 'pass',
      text: 'restrictions: the legacy tables restrict no command',
    };
  }
  return {
    what: 'restrictions',
    status: 'warn',
    text:
      'restrictions: the legacy tables restrict commands: set the same up under Server ' +
      'Settings > Integrations > Professor Pine',
    detail: exportText(servers).trimEnd().split('\n'),
  };
}

/** Discord's part of the check; a failure to read the application ends it with one line. */
async function discordLines(
  options: CutoverCheckOptions,
  regions: readonly CutoverRegion[],
  guildIds: readonly string[],
  selfRoles: readonly CutoverSelfRole[],
): Promise<CheckLine[]> {
  const { discord, appId, settings } = options;
  let application: { id: string; name: string; flags?: number; bot_public?: boolean };
  try {
    application = (await discord.get(Routes.currentApplication())) as typeof application;
  } catch (err) {
    return [
      {
        what: 'application',
        status: 'fail',
        text: `application: Discord could not be read with DISCORD_TOKEN: ${failureReason(err)}`,
      },
    ];
  }
  const lines: CheckLine[] = [];
  if (application.id !== appId) {
    lines.push({
      what: 'application',
      status: 'fail',
      text:
        `application: DISCORD_APP_ID is not the id of the token's application ` +
        `(${application.name} has ${application.id})`,
    });
  } else {
    lines.push({
      what: 'application',
      status: 'pass',
      text: `application: ${application.name}, the application of DISCORD_TOKEN`,
    });
  }
  if (application.bot_public === true) {
    lines.push({
      what: 'public-bot',
      status: 'warn',
      text:
        'public bot: anybody can add this bot to a server of theirs, and the staff of any server ' +
        'it is in can change what all its servers share. Turn it off in the Developer Portal: ' +
        'Installation, Install Link None; then Bot, Public Bot.',
    });
  }
  lines.push(intentsLine(application.flags ?? 0, settings));
  if (settings.web) lines.push(webLine(settings.web));
  // What Discord refuses from here on (a server it no longer answers for, a 5xx) ends the reading
  // with one line; the rest of the check goes on.
  try {
    const missing = missingIcons(
      iconSources(),
      await applicationEmojiNames(discord, application.id),
    );
    lines.push(
      missing.length === 0
        ? {
            what: 'emoji',
            status: 'pass',
            text: 'emoji: the application has every icon the posts show',
          }
        : {
            what: 'emoji',
            status: 'warn',
            text: `emoji: ${missing.length} of the game's icons are not the application's emoji yet: './pine emoji-upload --apply' uploads them`,
          },
    );

    // In rehearsal mode the commands are the servers' own, kept from members by the admin's
    // restriction under Integrations: a global one is every member's to see. A failure to read them is a warning; the rest is still checked.
    if (settings.rehearsal) {
      let global: { name: string }[] | undefined;
      try {
        global = (await discord.get(Routes.applicationCommands(application.id))) as {
          name: string;
        }[];
      } catch (err) {
        lines.push({
          what: 'commands',
          status: 'warn',
          text: `commands: the global commands could not be read: ${failureReason(err)}`,
        });
      }
      if (global)
        lines.push(
          global.length === 0
            ? {
                what: 'commands',
                status: 'pass',
                text: 'commands: the application has no commands for every server',
              }
            : {
                what: 'commands',
                status: 'warn',
                text: `commands: the application has ${global.length === 1 ? 'a command' : `${global.length} commands`} for every server (${global.map((one) => one.name).join(', ')}): every member sees ${global.length === 1 ? 'it' : 'them'} during the rehearsal; take ${global.length === 1 ? 'it' : 'them'} away before it`,
              },
        );
    }
    const bot = (await discord.get(Routes.user())) as { id: string; username: string };
    // The first 200 servers, unpaginated: Pine is in a server or two, not in hundreds.
    const joined = (await discord.get(Routes.userGuilds())) as { id: string; name: string }[];
    const joinedIds = new Set(joined.map((one) => one.id));
    const absent = guildIds.filter((id) => !joinedIds.has(id));
    const unknown = joined.filter((one) => !guildIds.includes(one.id));
    if (guildIds.length === 0) {
      lines.push({
        what: 'servers',
        status: 'warn',
        text: 'servers: the database names no server',
      });
    } else if (absent.length === guildIds.length) {
      // Not one server checked: a go would mean nothing.
      lines.push({
        what: 'servers',
        status: 'fail',
        text: `servers: the bot is in none of the servers of the database (${absent.join(', ')}): none of them was checked`,
      });
    } else if (absent.length > 0) {
      lines.push({
        what: 'servers',
        status: 'warn',
        text: `servers: the bot is not in ${absent.join(', ')}, which the database has: their regions are not checked`,
      });
    } else {
      lines.push({
        what: 'servers',
        status: 'pass',
        text: `servers: the bot is in every server of the database (${guildIds.length})${unknown.length > 0 ? `, and in ${unknown.map((one) => one.name).join(', ')}, which it adds at its start` : ''}`,
      });
    }
    const withoutForum: string[] = [];
    const withoutBoard: string[] = [];
    for (const guildId of guildIds.filter((id) => joinedIds.has(id))) {
      const ofServer = regions.filter((one) => one.guild === guildId);
      // A server that cannot be read is a failure of its own; the others are still checked.
      try {
        const server = await serverLines(
          discord,
          guildId,
          bot,
          ofServer,
          settings,
          selfRoles.filter((one) => one.guild === guildId),
        );
        lines.push(...server.lines);
        withoutForum.push(...server.withoutForum);
        withoutBoard.push(...server.withoutBoard);
      } catch (err) {
        const name = joined.find((one) => one.id === guildId)?.name ?? guildId;
        lines.push({
          what: 'server',
          status: 'fail',
          text: `server ${name}: it could not be read: ${failureReason(err)}`,
        });
        withoutForum.push(...ofServer.map((one) => one.channelId));
        withoutBoard.push(
          ...ofServer
            .filter((one) => one.forumChannelId !== null && one.summaryMessageId === null)
            .map((one) => one.channelId),
        );
      }
      if (options.legacyParties !== undefined) {
        const name = joined.find((one) => one.id === guildId)?.name ?? guildId;
        try {
          lines.push(
            await cleanupLine(discord, options.legacyParties, {
              guildId,
              name,
              botId: bot.id,
              regions: ofServer,
              settings,
            }),
          );
        } catch (err) {
          lines.push({
            what: 'cleanup',
            status: 'fail',
            text: `cleanup: ${name}: the list could not be made: ${failureReason(err)}`,
          });
        }
      }
    }
    const counted = regions.filter((one) => joinedIds.has(one.guild)).length;
    lines.push(
      counted === 0
        ? {
            what: 'forums',
            status: 'warn',
            text: 'forums: the database has no regions in these servers',
          }
        : withoutForum.length === 0
          ? { what: 'forums', status: 'pass', text: 'forums: every region has its forum' }
          : {
              what: 'forums',
              status: 'warn',
              text: `forums: ${withoutForum.length} of ${counted} regions have no forum yet (${withoutForum.join(', ')}): '/admin setup-forums' makes them`,
            },
    );
    // The regions with a forum but no board recorded in the database (plan 8R-9, review P11,
    // R5): their "Today and coming up" and "Today’s Stops" wait for /admin setup-forums.
    if (withoutBoard.length > 0) {
      const withForum = regions.filter(
        (one) => joinedIds.has(one.guild) && one.forumChannelId !== null,
      ).length;
      lines.push({
        what: 'boards',
        status: 'warn',
        text:
          `boards: ${String(withoutBoard.length)} of ${String(withForum)} regions with a forum ` +
          `have no board yet (${withoutBoard.join(', ')}): '/admin setup-forums' makes it`,
      });
    }
  } catch (err) {
    lines.push({
      what: 'discord',
      status: 'fail',
      text: `discord: the check stopped reading Discord: ${failureReason(err)}`,
    });
  }
  return lines;
}

/** Every line of the check, in order: the database, Discord, the legacy restrictions. */
export async function cutoverCheck(options: CutoverCheckOptions): Promise<CheckLine[]> {
  const { store } = options;
  // Each section of the database that cannot be read is a failure of its own (a schema of
  // another shape, a table that is gone); the others are still checked.
  const lines: CheckLine[] = [];
  let plan: MigrationPlan | undefined;
  try {
    plan = await store.migrationPlan();
    lines.push(databaseLine(plan));
  } catch (err) {
    lines.push({
      what: 'database',
      status: 'fail',
      text: `database: it could not be read: ${failureReason(err)}`,
    });
  }
  let guildIds: string[] = [];
  let regions: CutoverRegion[] = [];
  let selfRoles: CutoverSelfRole[] = [];
  let servers: CheckLine | undefined;
  try {
    guildIds = await store.guilds();
    regions = await store.regionRows();
    selfRoles = await store.selfRoles();
  } catch (err) {
    servers = {
      what: 'servers',
      status: 'fail',
      text: `servers: the servers and regions of the database could not be read: ${failureReason(err)}`,
    };
  }
  const found = await discordLines(options, regions, guildIds, selfRoles);
  // A copy of production (a legacy or Pine database) without servers or regions is the wrong
  // copy, not a new install: what is a warning for an empty database fails it.
  const copy = !servers && (plan?.kind === 'takeover' || plan?.kind === 'pine');
  const discord = found.map((one): CheckLine => {
    if (copy && one.what === 'servers' && guildIds.length === 0) {
      return {
        ...one,
        status: 'fail',
        text: 'servers: the database names no server: is it the right copy?',
      };
    }
    if (copy && one.what === 'forums' && regions.length === 0) {
      return {
        ...one,
        status: 'fail',
        text: 'forums: the database has no regions: is it the right copy?',
      };
    }
    return one;
  });
  // The database's failure takes the place of what Discord said of no servers.
  lines.push(
    ...(servers ? [...discord.filter((one) => one.what !== 'servers'), servers] : discord),
  );
  try {
    lines.push(restrictionsLine(await store.legacyRestrictions()));
  } catch (err) {
    lines.push({
      what: 'restrictions',
      status: 'fail',
      text: `restrictions: the legacy tables could not be read: ${failureReason(err)}`,
    });
  }
  return lines;
}

/** How the command line is used (`./pine cutover-check`). */
export const CHECK_USAGE = 'Usage: cutover-check [--legacy-parties <folder>]';

/**
 * The command line's arguments: none, or `--legacy-parties <folder>`; anything else (a flag of
 * its own, a folder missing) is undefined, and the command prints `CHECK_USAGE`.
 */
export function parseCheckArgs(args: readonly string[]): { legacyParties?: string } | undefined {
  if (args.length === 0) return {};
  const [flag, folder] = args;
  if (args.length !== 2 || flag !== '--legacy-parties' || folder === undefined) return undefined;
  return folder.startsWith('--') ? undefined : { legacyParties: folder };
}

/** Whether any line fails: the cutover is a no-go. */
export function checkFailed(lines: readonly CheckLine[]): boolean {
  return lines.some((line) => line.status === 'fail');
}

/** The lines as the operator reads them: the status first, the detail indented. */
export function formatCheck(lines: readonly CheckLine[]): string {
  return lines
    .flatMap((line) => [
      `${line.status.toUpperCase()}  ${line.text}`,
      ...(line.detail ?? []).map((one) => `        ${one}`),
    ])
    .map((text) => `${text}\n`)
    .join('');
}
