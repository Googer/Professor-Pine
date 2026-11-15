import { trustProxyWarning } from '../config/warnings.js';
import { ApplicationFlags, ChannelType, PermissionFlagsBits, Routes } from 'discord.js';
import { parseServerValues, type ServerValues } from '../config/server-settings.js';
import {
  channelNamesOf,
  isOpenInstance,
  listedServers,
  type Settings,
} from '../config/settings.js';
import type { StoredServer } from '../db/repositories/server-settings-repository.js';
import type { StoredServerRecord } from '../db/repositories/server-record-repository.js';
import { mayHave, NO_STANDING, type Standing } from '../domain/operators/admission.js';
import { deletedSinceLeft } from '../domain/servers/deletion.js';
import { filledValues, type ServerNames } from '../services/server-fill.js';
import type { MigrationPlan } from '../db/migrator.js';
import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
import { channelNameFor } from '../domain/regions/region-import.js';
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
  /** The servers' settings (plan 19A-1, `ServerSettings`); none before the first start of 2.1. */
  serverSettings(): Promise<StoredServer[]>;
  /**
   * The servers' records (plan 19C-1, `ServerRecord`: recorded, allowed, blocked, left);
   * undefined where the table is not there yet (before the first start of 2.1, whose migration
   * 061 records every server of `Guild`).
   */
  serverRecords(): Promise<StoredServerRecord[] | undefined>;
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

/**
 * A server's channels, categories and roles by name as the fill finds them (`ServerFill`, plan
 * 19A-1), from what Discord's REST API gives: of several by a name, one the bot may post in
 * first, the oldest first.
 */
function apiNames(
  guildId: string,
  channels: readonly ApiChannel[],
  roles: readonly ApiRole[],
  permissionsIn: (channel: ApiChannel) => bigint,
): ServerNames {
  const all = (name: string, types: readonly ChannelType[]) =>
    channels.filter((one) => one.name === name && types.includes(one.type));
  const typesOf = (kind: 'text' | 'forum' | 'category') => [
    kind === 'forum'
      ? ChannelType.GuildForum
      : kind === 'category'
        ? ChannelType.GuildCategory
        : ChannelType.GuildText,
  ];
  const named = (name: string, types: readonly ChannelType[]) =>
    all(name, types).sort((a, b) => {
      const posts = (one: ApiChannel) =>
        missingNeeds(permissionsIn(one), ANNOUNCE_NEEDS).required.length === 0 ? 0 : 1;
      return posts(a) - posts(b) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);
    })[0]?.id;
  return {
    serverId: guildId,
    channel: (name, kind) => named(name, typesOf(kind)),
    category: (name) => named(name, [ChannelType.GuildCategory]),
    role: (name) => roles.find((one) => roleKey(one.name) === roleKey(name))?.id,
    howMany: (name, kind) => all(name, typesOf(kind)).length,
  };
}

/**
 * A server's values as the bot reads them (plan 19A-1): its row's; without one (before the first
 * start of 2.1), the file's as the fill will make them, its names resolved in the server. A row
 * whose values cannot be read counts as none.
 */
function valuesOf(
  stored: StoredServer | undefined,
  settings: Settings,
  names: ServerNames,
): { values: ServerValues; row: boolean } {
  if (stored !== undefined) {
    try {
      return { values: parseServerValues(stored.settings), row: true };
    } catch {
      // As the bot: the file's defaults, here with the fill's names.
    }
  }
  return { values: filledValues(settings, names).values, row: false };
}

/** One server's lines: the bot's member and permissions, each region, the names of the settings. */
async function serverLines(
  discord: DiscordRead,
  guildId: string,
  bot: { id: string; username: string },
  regions: readonly CutoverRegion[],
  settings: Settings,
  selfRoles: readonly CutoverSelfRole[],
  stored: StoredServer | undefined,
): Promise<{
  lines: CheckLine[];
  withoutForum: string[];
  withoutBoard: string[];
  values: ServerValues | undefined;
}> {
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
    return { lines, withoutForum: [], withoutBoard: [], values: undefined };
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

  const found = apiNames(guild.id, channels, guild.roles, permissionsIn);
  const { values, row } = valuesOf(stored, settings, found);
  lines.push(
    row
      ? setIdsLine(guild.name, channels, guild.roles, values)
      : namesLine(guild.name, found, settings),
  );
  lines.push(announceLine(guild.name, channels, values, permissionsIn));
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
  // Without a row, what the file names and the fill will not find is said by its name.
  const unfound = (name: string | undefined) => (row ? undefined : name);
  lines.push(
    moderationLine(
      guild.name,
      channels,
      values,
      unfound(settings.channels.moderation),
      permissionsIn,
      seenBy,
      unseenByStaff,
    ),
  );
  if (values.channels.moderation !== undefined) lines.push(reportsLine(guild.name, reportGaps));
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
  const events = eventsLine(
    guild.name,
    channels,
    values,
    unfound(settings.channels.events),
    permissionsIn,
    {
      guildId: guild.id,
      roles: guild.roles,
      silentIn,
    },
  );
  if (events) lines.push(events);
  const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
  if (rolesCheck) lines.push(rolesCheck);
  return { lines, withoutForum, withoutBoard, values };
}

/** The channels the bot announces in or copies posts to, as the server's values set them. */
function announceChannels(values: ServerValues): string[] {
  const { channels: set, features } = values;
  return [
    set['bot-updates'],
    set['mod-bot-lab'],
    set.unown,
    ...(features.exGymChannel ? [set['elite-gym-raids']] : []),
    ...(features.remoteRaidChannel ? [set['remote-raids']] : []),
  ].filter((id) => id !== undefined);
}

/** Whether the bot may post in the channels it announces in (those that exist: `names` says the rest). */
function announceLine(
  server: string,
  channels: readonly ApiChannel[],
  values: ServerValues,
  permissionsIn: (channel: ApiChannel) => bigint,
): CheckLine {
  const gaps = announceChannels(values).flatMap((id) => {
    // A channel that is gone is the names line's.
    const channel = channels.find(
      (one) =>
        one.id === id &&
        (one.type === ChannelType.GuildText || one.type === ChannelType.GuildAnnouncement),
    );
    if (!channel) return [];
    const missing = missingNeeds(permissionsIn(channel), ANNOUNCE_NEEDS).required;
    return missing.length === 0 ? [] : [`${needNames(missing)} in #${channel.name}`];
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
  values: ServerValues,
  fileName: string | undefined,
  permissionsIn: (channel: ApiChannel) => bigint,
  seenBy: (channel: ApiChannel) => 'everyone' | string[],
  unseenByStaff: (channel: ApiChannel) => string[],
): CheckLine {
  const id = values.channels.moderation;
  const cannot = 'a meetup that needs approval cannot be made there';
  if (id === undefined && fileName !== undefined) {
    return {
      what: 'moderation',
      status: 'warn',
      text: `moderation: ${server} has no channel #${fileName}: ${cannot}`,
    };
  }
  if (id === undefined) {
    return {
      what: 'moderation',
      status: 'warn',
      text:
        `moderation: ${server} has no moderators' channel set, so meetup safety is off there: ` +
        'every meetup is posted at once, wherever it is',
    };
  }
  const channel = channels.find((one) => one.id === id && one.type === ChannelType.GuildText);
  if (!channel) {
    return {
      what: 'moderation',
      status: 'warn',
      text: `moderation: the moderators' channel of ${server} is gone: ${cannot}`,
    };
  }
  const { name } = channel;
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
  values: ServerValues,
  fileName: string | undefined,
  permissionsIn: (channel: ApiChannel) => bigint,
  members: {
    guildId: string;
    roles: readonly ApiRole[];
    silentIn: (channel: ApiChannel, roleIds: readonly string[]) => boolean;
  },
): CheckLine | undefined {
  const { guildId, roles, silentIn } = members;
  const id = values.channels.events;
  if (id === undefined && fileName !== undefined) {
    // As Discord stores the name, and as the fill looks for it (review V7, ruling R4).
    const name = channelNameFor(fileName) || fileName;
    return {
      what: 'events',
      status: 'warn',
      text: `events: ${server} has no forum #${name}: /admin setup-forums makes it`,
    };
  }
  if (id === undefined) return undefined;
  const forum = channels.find((one) => one.id === id && one.type === ChannelType.GuildForum);
  if (!forum) {
    return {
      what: 'events',
      status: 'warn',
      text: `events: the events forum of ${server} is gone: /admin setup-forums makes one`,
    };
  }
  const { name } = forum;
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
  // where the server sets one.
  const memberRole = values.roles.mapMember;
  const silent = [
    { id: guildId, name: '@everyone' },
    ...roles.filter((role) => memberRole !== undefined && role.id === memberRole),
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

/**
 * The channels, categories and roles the settings name that the server lacks, as the fill of the
 * first start of 2.1 finds them (`apiNames`): what it does not find stays unset.
 */
function namesLine(server: string, found: ServerNames, settings: Settings): CheckLine {
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
      .filter(([, name]) => found.channel(name, 'text') === undefined)
      .map(([key, name]) => `channels.${key} (#${name})`),
    ...(found.category(settings.categories.pvp) !== undefined
      ? []
      : [`categories.pvp (${settings.categories.pvp})`]),
    ...(found.role(settings.roles.unown) !== undefined
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

/**
 * The channels, category and roles a server's row sets (plan 19A-1, by id) that the server no
 * longer has: unset in effect until its staff set them again in `/admin settings`.
 */
function setIdsLine(
  server: string,
  channels: readonly ApiChannel[],
  roles: readonly ApiRole[],
  values: ServerValues,
): CheckLine {
  const has = new Set(channels.map((one) => one.id));
  const roleIds = new Set(roles.map((one) => one.id));
  const lacking = [
    ...Object.entries(values.channels)
      .filter(([, id]) => id !== undefined && !has.has(id))
      .map(([key]) => `the ${key} channel`),
    ...(values.categories.pvp !== undefined && !has.has(values.categories.pvp)
      ? ['the PvP category']
      : []),
    ...(values.roles.unown !== undefined && !roleIds.has(values.roles.unown)
      ? ['the Unown role']
      : []),
    ...(values.roles.mapMember !== undefined && !roleIds.has(values.roles.mapMember)
      ? ["the map's member role"]
      : []),
  ];
  return lacking.length === 0
    ? {
        what: 'names',
        status: 'pass',
        text: `names: ${server} has every channel, category and role its settings set`,
      }
    : {
        what: 'names',
        status: 'warn',
        text: `names: ${server} no longer has ${lacking.join(', ')} of its settings: set them again with /admin settings`,
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
    /** The channels of the server's settings (plan 19A-1: by id), never listed. */
    settingsChannelIds: readonly string[];
    /** The names the settings file gives its channels, never listed either (review F6). */
    settingsChannelNames: readonly string[];
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
    settingsChannelIds: server.settingsChannelIds,
    settingsChannelNames: server.settingsChannelNames,
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

/** How Public Bot is turned off, in the Developer Portal. */
const PUBLIC_BOT_OFF =
  'Turn it off in the Developer Portal: Installation, Install Link None; then Bot, Public Bot.';

/**
 * Discord's Public Bot beside the instance's `servers` (plan 19C-4; spec "Discord's verification
 * and the public switch"): where they agree a pass that says who can add the bot; Public Bot on
 * where `servers` is not `"open"` warns that anybody can add it and Pine leaves every server it
 * does not allow (`mayHave`), off where it is `"open"` that nobody but the application's owner
 * (or its team) can, so that the instance is open in name only.
 */
function publicBotLine(publicBot: boolean, settings: Settings): CheckLine {
  const open = isOpenInstance(settings);
  if (publicBot && open) {
    return {
      what: 'public-bot',
      status: 'pass',
      text: 'public bot: Public Bot is on and servers is "open": anybody can add this bot to a server of theirs',
    };
  }
  if (publicBot) {
    return {
      what: 'public-bot',
      status: 'warn',
      text:
        'public bot: Public Bot is on, so anybody can add this bot to a server of theirs, but ' +
        'servers is not "open": Pine tells each server it does not allow that this Pine is ' +
        `private, and leaves every server it does not allow. ${PUBLIC_BOT_OFF} For a public ` +
        'instance, set servers to "open" instead.',
    };
  }
  if (open) {
    return {
      what: 'public-bot',
      status: 'warn',
      text:
        'public bot: servers is "open", but Public Bot is off: nobody but the application’s ' +
        'owner (or its team’s members) can add this bot, so the instance is open in name only. ' +
        'Turn Public Bot on in the Developer Portal (Bot, Public Bot) once it is to be public, ' +
        'or list its servers in servers.',
    };
  }
  return {
    what: 'public-bot',
    status: 'pass',
    text:
      'public bot: Public Bot is off: only the application’s owner (or its team’s members) can ' +
      'add this bot, and Pine keeps only the servers this Pine allows',
  };
}

/** As many servers as `GET /users/@me/guilds` gives in one page (Discord's most). */
const GUILDS_PAGE = 200;

/**
 * Every server the bot is in, as Discord lists them (`GET /users/@me/guilds`), page by page:
 * `GUILDS_PAGE` at a time by id, each page after the last id of the one before, until a page is
 * not full (plan 19C-4: an open instance may be in thousands of servers).
 */
async function joinedServers(discord: DiscordRead): Promise<{ id: string; name: string }[]> {
  const joined: { id: string; name: string }[] = [];
  let after: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ limit: String(GUILDS_PAGE) });
    if (after !== undefined) query.set('after', after);
    const page = (await discord.get(Routes.userGuilds(), { query })) as {
      id: string;
      name: string;
    }[];
    joined.push(...page);
    const last = page.at(-1);
    if (page.length < GUILDS_PAGE || last === undefined) return joined;
    after = last.id;
  }
}

/** How many servers a clause of the servers line names before it counts the rest. */
const SERVERS_NAMED = 10;

/** Names, the first `SERVERS_NAMED`, then how many more. */
function named(names: readonly string[]): string {
  const shown = names.slice(0, SERVERS_NAMED).join(', ');
  const more = names.length - SERVERS_NAMED;
  return more > 0 ? `${shown}, and ${String(more)} more` : shown;
}

/** What the servers line is decided from. */
interface ServersFacts {
  /** The servers of `Guild`: those Pine has had. */
  guildIds: readonly string[];
  /** The servers' records; undefined before 2.1's migration 061 (`CutoverStore.serverRecords`). */
  records: readonly StoredServerRecord[] | undefined;
  /** The servers the bot is in, as Discord lists them (every page). */
  joined: readonly { id: string; name: string }[];
  settings: Settings;
  publicBot: boolean;
}

/**
 * The servers line (plan 19C-4): the servers the bot is in, every page of them, beside those Pine
 * records. A server of the database Pine was removed from (`leftAt`) is named as left, never as
 * missing, and one the bot is in again comes back at its start (anew, in setup, where its data is
 * being deleted, plan 19C-3); one whose data was deleted 30 days after (its record alone left) is
 * named as deleted, and starts anew where the bot is in it again; one whose deletion took its
 * `Guild` row and has not ended (`deletingAt`, its record alone left) is named as being deleted,
 * and where the bot is in it again starts anew once it ends; one the bot is in that this Pine
 * does not allow (`mayHave`, with the file's `servers` and the records) is left at its start, and
 * is neither counted among those it keeps nor said to come back; one it allows and has no row of
 * is added; a new install (no server recorded, `servers` unset) keeps those it is in at its first
 * start (`ServerAdoption`: with Public Bot on, only those whose owner is the owner or an operator,
 * the others told and left at that start, a warning). Where it keeps none of the database's
 * servers and leaves one of them at its start, the line fails, as where the bot is in none of them.
 * Before 2.1 every server of `Guild` counts as recorded, as its migration 061 records them.
 */
function serversLine(facts: ServersFacts): CheckLine {
  const { guildIds, records, joined, settings } = facts;
  const ofDatabase = new Set(guildIds);
  const joinedIds = new Set(joined.map((one) => one.id));
  const nameOf = (id: string) => joined.find((one) => one.id === id)?.name ?? id;
  const recordOf = new Map((records ?? []).map((row) => [row.serverId, row]));
  const standingOf = (id: string): Standing => {
    if (records === undefined) return { ...NO_STANDING, recorded: ofDatabase.has(id) };
    const row = recordOf.get(id);
    return row === undefined
      ? NO_STANDING
      : {
          recorded: row.recordedAt !== null,
          allowed: row.allowedAt !== null,
          blocked: row.blockedAt !== null,
        };
  };
  const admission = { open: isOpenInstance(settings), listed: listedServers(settings) };
  // A new install adopts the servers present at its first start (plan 19C-1).
  const adopting =
    !admission.open &&
    admission.listed === undefined &&
    (records === undefined
      ? guildIds.length === 0
      : !records.some((row) => row.recordedAt !== null));
  // A new install leaves none it adopts: with Public Bot on it adopts only those its owner or an
  // operator owns, which the check cannot know, and says so (`addedWords`).
  const refused = adopting
    ? []
    : joined.filter((one) => !mayHave(one.id, admission, standingOf(one.id)));
  const refusedIds = new Set(refused.map((one) => one.id));
  // A server it leaves at its start is neither kept nor back (fix round 1, R5): it is said once,
  // as left at the start.
  const left = guildIds.filter((id) => recordOf.get(id)?.leftAt != null);
  const kept = guildIds.filter((id) => !left.includes(id) && !refusedIds.has(id));
  const absent = kept.filter((id) => !joinedIds.has(id));
  const back = left.filter((id) => joinedIds.has(id) && !refusedIds.has(id));
  // A server whose deletion took its `Guild` row and has not ended (`deletingAt`, its record
  // alone left; fix round 3, R5): being deleted, and where the bot is in it again, back anew.
  const deletingOnRecord = new Set(
    (records ?? [])
      .filter(
        (row) => !ofDatabase.has(row.serverId) && row.leftAt !== null && row.deletingAt !== null,
      )
      .map((row) => row.serverId),
  );
  const deletingGone = [...deletingOnRecord].filter((id) => !joinedIds.has(id));
  // One whose data is being deleted (plan 19C-3, `deletingAt`) comes back anew once it is.
  const backAnew = [
    ...back.filter((id) => recordOf.get(id)?.deletingAt != null),
    ...joined
      .filter((one) => deletingOnRecord.has(one.id) && !refusedIds.has(one.id))
      .map((one) => one.id),
  ];
  const gone = left.filter((id) => !joinedIds.has(id));
  // A server whose data was deleted 30 days after Pine was removed (plan 19C-3): its `Guild` row
  // went with it, its record stays. Named as deleted, never missing; the bot in it again, it
  // starts anew, in setup (`ServerStandings.setUpOnRecord`), not as a server added.
  const deleted = new Set(
    (records ?? [])
      .filter(
        (row) =>
          !ofDatabase.has(row.serverId) &&
          !deletingOnRecord.has(row.serverId) &&
          deletedSinceLeft(row),
      )
      .map((row) => row.serverId),
  );
  const deletedGone = [...deleted].filter((id) => !joinedIds.has(id));
  const deletedBack = joined.filter((one) => deleted.has(one.id) && !refusedIds.has(one.id));
  const added = joined.filter(
    (one) =>
      !ofDatabase.has(one.id) &&
      !refusedIds.has(one.id) &&
      !deleted.has(one.id) &&
      !deletingOnRecord.has(one.id),
  );
  // Not one server of the database kept, nor back, and one it is in left at the start (fix
  // round 2, F2): a go would mean nothing, as where the bot is in none of them.
  const keepsNone =
    kept.length === 0 && back.length === 0 && guildIds.some((id) => refusedIds.has(id));

  let status: CheckStatus = 'pass';
  const clauses: string[] = [];
  // With Public Bot on, a new install's first start keeps only the servers its owner or an
  // operator owns, and tells and leaves the others (`ServerAdoption`, then
  // `ServerAdmission.everyShardReady`; fix round 1, R2).
  const addedWords = adopting
    ? facts.publicBot
      ? 'which this new install keeps at its first start only where their owner is OWNER_ID or ' +
        'an operator, since Public Bot is on: the others are told this Pine is private and left ' +
        'at that start. Turn Public Bot off before it, or list them in servers'
      : 'which this new install keeps at its first start'
    : 'which it adds at its start';
  const addedCount = `${String(added.length)} ${added.length === 1 ? 'other' : 'others'}`;
  if (guildIds.length === 0) {
    status = 'warn';
    clauses.push(
      'the database names no server' +
        (added.length === 0
          ? ''
          : `; the bot is in ${String(added.length)} (${named(added.map((one) => one.name))}), ${addedWords}`),
    );
  } else if (kept.length > 0) {
    if (absent.length === kept.length && back.length === 0) {
      // Not one server checked: a go would mean nothing.
      status = 'fail';
      clauses.push(
        `the bot is in none of the servers of the database (${named(absent)}): none of them was checked`,
      );
    } else if (absent.length > 0) {
      status = 'warn';
      clauses.push(
        `the bot is not in ${named(absent)}, which the database has: their regions are not checked`,
      );
    } else {
      clauses.push(
        `the bot is in every server of the database (${String(kept.length)})` +
          (added.length === 0
            ? ''
            : `, and in ${addedCount} (${named(added.map((one) => one.name))}), ${addedWords}`),
      );
    }
  } else {
    // The servers it leaves are named once, below, with every other it leaves.
    if (keepsNone) {
      status = 'fail';
      clauses.push('the bot keeps none of the servers of the database');
    }
    if (added.length > 0) {
      clauses.push(
        `the bot is in ${addedCount} (${named(added.map((one) => one.name))}), ${addedWords}`,
      );
    }
  }
  const backKept = back.filter((id) => !backAnew.includes(id));
  if (backKept.length > 0) {
    clauses.push(
      `the bot is in ${named(backKept.map(nameOf))} again, marked left: it comes back at its start`,
    );
  }
  if (backAnew.length > 0) {
    clauses.push(
      `the bot is in ${named(backAnew.map(nameOf))} again, its data being deleted: it starts ` +
        'anew there, in setup, once the deletion ends',
    );
  }
  if (deletedBack.length > 0) {
    clauses.push(
      `the bot is in ${named(deletedBack.map((one) => one.name))} again, its data deleted: it ` +
        'starts anew there, in setup, at its start',
    );
  }
  if (gone.length > 0) {
    clauses.push(`Pine was removed from ${named(gone)}, marked left: not checked`);
    // Every server of the database left, and the bot in none of them: nothing was checked.
    if (kept.length === 0 && back.length === 0 && status === 'pass') status = 'warn';
  }
  if (deletingGone.length > 0) {
    clauses.push(
      `the data of ${named(deletingGone)} is being deleted, 30 days after Pine was removed: not checked`,
    );
  }
  if (deletedGone.length > 0) {
    clauses.push(
      `the data of ${named(deletedGone)} was deleted 30 days after Pine was removed: not checked`,
    );
  }
  // Servers a new install may leave at its first start (R2) warn as those it leaves do.
  if (adopting && facts.publicBot && added.length > 0 && status === 'pass') status = 'warn';
  if (refused.length > 0) {
    if (status === 'pass') status = 'warn';
    clauses.push(
      `Pine leaves ${named(refused.map((one) => one.name))} at its start: this Pine does not ` +
        'allow them (servers, or /operator servers allow)',
    );
  }
  return { what: 'servers', status, text: `servers: ${clauses.join('; ')}` };
}

/** Discord's part of the check; a failure to read the application ends it with one line. */
async function discordLines(
  options: CutoverCheckOptions,
  regions: readonly CutoverRegion[],
  guildIds: readonly string[],
  selfRoles: readonly CutoverSelfRole[],
  stored: readonly StoredServer[],
  records: readonly StoredServerRecord[] | undefined,
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
  lines.push(publicBotLine(application.bot_public === true, settings));
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
    // Every server the bot is in, page by page (plan 19C-4): an open instance may be in thousands.
    const joined = await joinedServers(discord);
    const joinedIds = new Set(joined.map((one) => one.id));
    lines.push(
      serversLine({
        guildIds,
        records,
        joined,
        settings,
        publicBot: application.bot_public === true,
      }),
    );
    const withoutForum: string[] = [];
    const withoutBoard: string[] = [];
    // The channels of each server's settings, by id, which the cleanup never lists.
    const settingsChannels = new Map<string, string[]>();
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
          stored.find((one) => one.serverId === guildId),
        );
        settingsChannels.set(
          guildId,
          Object.values(server.values?.channels ?? {}).filter((id) => id !== undefined),
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
              settingsChannelIds: settingsChannels.get(guildId) ?? [],
              settingsChannelNames: channelNamesOf(options.settings),
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
  let stored: StoredServer[] = [];
  let records: StoredServerRecord[] | undefined;
  let servers: CheckLine | undefined;
  try {
    guildIds = await store.guilds();
    regions = await store.regionRows();
    selfRoles = await store.selfRoles();
    stored = await store.serverSettings();
    records = await store.serverRecords();
  } catch (err) {
    servers = {
      what: 'servers',
      status: 'fail',
      text: `servers: the servers and regions of the database could not be read: ${failureReason(err)}`,
    };
  }
  const found = await discordLines(options, regions, guildIds, selfRoles, stored, records);
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
