import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  SelectMenuDefaultValueType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIChannelSelectComponent,
  type APIComponentInContainer,
  type APIRoleSelectComponent,
  type APIStringSelectComponent,
} from 'discord.js';
import {
  SERVER_CHANNEL_ROLES,
  type ServerChannelRole,
  type ServerValues,
  type UnmatchedKey,
} from '../../config/server-settings.js';
import type { SettingsAuditRecord } from '../../db/repositories/server-settings-audit-repository.js';
import { isSnowflake } from '../../db/snowflake.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { TEXT_ROOM } from '../../discord/dialog.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { clockWords, dayWords, zoned } from '../../domain/time/zoned.js';
import { distanceWords } from '../../render/distance-words.js';
import { settingsChangeLine } from '../../render/server-settings.js';
import { earlierLine, fitted } from '../../render/audit.js';
import { count, fitItems, plain, truncate } from '../../render/text.js';
import {
  actionRow,
  container,
  LIST_COLOUR,
  menuRow,
  section,
  textDisplay,
} from '../../render/v2.js';

/**
 * The custom ids of `/admin settings`' panel (plan 19A-1): `server:<key>:<action>[:<arg>]`, the
 * key a setting's (`channels.moderation`, `features.roles`, `distanceUnits`, `flaggedWords`).
 * `server:panel:show` is the menu of the sections; `server:<key>:set` a channel, category, role
 * or units menu (the value picked; none clears it); `server:<key>:set:on|off` a feature's button
 * (what it sets, never a toggle); `server:<key>:ask` opens a dialog, whose Submit is
 * `server:<key>:set:~<token>`. The flagged words too many to show in a dialog (`wordsTooMany`):
 * `server:flaggedWords:ask` opens the words to add (`server:flaggedWords:add:~<token>`),
 * `server:flaggedWords:ask:remove` those to remove (`server:flaggedWords:remove:~<token>`).
 * `server:<key>:unset` (Leave unset, of a setting the settings file named and the fill did not
 * find: `channels.moderation`, `roles.mapMember`; fix round 3, H9) asks whether to, in that
 * setting's place; `server:<key>:unset:confirm` leaves it unset, `server:<key>:keep` (Keep it
 * closed) leaves it as it was (fix round 4, I2). The server is the interaction's, never in the id.
 */
export const SERVER_KIND = 'server';
export const SET = 'set';
export const ASK = 'ask';
export const SHOW = 'show';
export const ON = 'on';
export const OFF = 'off';
/** The flagged words' dialogs where they are too many to show (review G5): add, remove. */
export const ADD = 'add';
export const REMOVE = 'remove';
/** Leaves a setting the settings file named and the fill did not find unset (fix round 3, H9). */
export const UNSET = 'unset';
/** Leave unset's second press, which writes; Keep it closed (fix round 4, I2). */
export const CONFIRM = 'confirm';
export const KEEP = 'keep';

/**
 * Whether the flagged words are too many to show in a dialog's line of text (Discord's 4,000
 * characters), so that a dialog adds or removes words rather than replacing them (review G5).
 */
export function wordsTooMany(words: readonly string[]): boolean {
  return words.join('\n').length > TEXT_ROOM;
}
/** The id of the sections' menu. */
export const PANEL = 'panel';

/** The sections of the panel (Discord's 40 components a message hold no more than one). */
export const SECTIONS = [
  { value: 'channels', name: 'Channels', description: 'Where Pine posts and reads, by role' },
  { value: 'roles', name: 'Category and roles', description: 'The PvP category, Unown, the map' },
  { value: 'features', name: 'Features', description: 'What Pine does in this server' },
  { value: 'text', name: 'Text and numbers', description: 'Units, the events forum, words, links' },
  { value: 'changes', name: 'Recent changes', description: 'Who changed what, 30 days' },
] as const;
export type SectionName = (typeof SECTIONS)[number]['value'];

export const isSection = (value: string | undefined): value is SectionName =>
  SECTIONS.some((one) => one.value === value);

/** Each channel role on the panel: its name and what it is for. */
const CHANNELS: Readonly<Record<ServerChannelRole, { name: string; about: string }>> = {
  'bot-lab': { name: 'Bot lab', about: 'the bot channel of members' },
  'mod-bot-lab': { name: 'Moderators’ bot lab', about: 'where Pine tells staff what needs them' },
  unown: { name: 'Unown', about: 'Unown sightings' },
  'elite-gym-raids': {
    name: 'Elite gym raids',
    about: 'copies of raids at elite raid gyms, where that feature is on',
  },
  'remote-raids': {
    name: 'Remote raids',
    about: 'copies of remote raids, where that feature is on',
  },
  pvp: { name: 'PvP', about: 'PvP chat' },
  'bot-updates': { name: 'Bot updates', about: 'Pine’s news to the server, new gyms' },
  moderation: {
    name: 'Moderators’ channel',
    // What clearing its select does, as Leave unset says it (fix round 4, I2).
    about:
      'reports and meetup safety; a channel of its own. Clearing it turns meetup safety off: ' +
      'meetups are no longer held for the moderators, blocks stop applying, and reports are ' +
      'refused',
  },
  events: { name: 'Events forum', about: 'in-game events (`/admin setup-forums` makes one)' },
};

/** The kinds of channel each role takes: a text channel, the events forum a forum. */
export const channelTypes = (role: ServerChannelRole): ChannelType[] =>
  role === 'events' ? [ChannelType.GuildForum] : [ChannelType.GuildText];

/** A feature's button and words: the setting's key and its name on the panel. */
export interface Switch {
  key: string;
  name: string;
  /** Whether the instance allows it (passive reading, the auto-assigned role); always else. */
  allowed?: (instance: Instance) => boolean;
  on(values: ServerValues): boolean;
}

/** What the instance allows a server, of what decides the intents Pine logs in with. */
export interface Instance {
  passiveReading: boolean;
  autoAssignRole: boolean;
}

export const SWITCHES: readonly Switch[] = [
  {
    key: 'features.exGymChannel',
    name: 'Copies of raids at elite raid gyms',
    on: (v) => v.features.exGymChannel,
  },
  {
    key: 'features.remoteRaidChannel',
    name: 'Copies of remote raids',
    on: (v) => v.features.remoteRaidChannel,
  },
  {
    key: 'features.notifications',
    name: 'Notifications (wants and DMs)',
    on: (v) => v.features.notifications,
  },
  { key: 'features.roles', name: 'Self-assigned roles (`/iam`)', on: (v) => v.features.roles },
  { key: 'postNewGyms', name: 'Posting new gyms in bot updates', on: (v) => v.postNewGyms },
  {
    key: 'passiveReading',
    name: 'Reading every screenshot in region channels',
    allowed: (instance) => instance.passiveReading,
    on: (v) => v.passiveReading,
  },
  {
    key: 'autoAssignRole',
    name: 'The auto-assigned role',
    allowed: (instance) => instance.autoAssignRole,
    on: (v) => v.autoAssignRole,
  },
];

/** The switches the panel shows on this instance. */
export const switchesOf = (instance: Instance): Switch[] =>
  SWITCHES.filter((one) => one.allowed?.(instance) ?? true);

/** The settings changed in a dialog: `server:<key>:ask`. */
export const DIALOGS = [
  'timezone',
  'eventsForum',
  'flaggedWords',
  'regionForumSuffix',
  'regionMapLink',
  'invite',
] as const;
export type DialogKey = (typeof DIALOGS)[number];

/** The section a setting is shown in, and a press on it shows again. */
export function sectionOf(key: string): SectionName {
  if (key.startsWith('channels.')) return 'channels';
  if (key.startsWith('categories.') || key.startsWith('roles.')) return 'roles';
  if (SWITCHES.some((one) => one.key === key)) return 'features';
  return 'text';
}

/** What the panel shows. */
export interface ServerPanelState {
  values: ServerValues;
  section: SectionName;
  instance: Instance;
  /** The server's zone (`ServerSettings.zoneOf`: its own, else the instance's default). */
  timezone: string;
  /** The moment the panel is drawn at: the time in the zone it shows (plan 19A-2). */
  now: number;
  /**
   * Recent changes, oldest first (shown newest first), with the moment they are worded at: up to
   * one more than `RECENT_CHANGES`, the oldest of which says there are earlier ones.
   */
  changes?: { records: readonly SettingsAuditRecord[]; now: number };
  /**
   * The channels and roles the server has now (the client's cache), by id: a set one it no
   * longer has is not offered as a select's default but said not found (review G2). Not said:
   * every id is taken as there.
   */
  known?: { channels: ReadonlySet<string>; roles: ReadonlySet<string> };
  /**
   * The setting whose Leave unset was pressed once: its line asks whether to (fix round 4, I2),
   * while the settings file's name of it is still not found.
   */
  confirming?: UnmatchedKey;
}

const id = (key: string, action: string, args: string[] = []) =>
  encodeCustomId({ kind: SERVER_KIND, id: key, action, args });

function sectionsMenu(chosen: SectionName): APIActionRowComponent<APIStringSelectComponent> {
  return menuRow({
    type: ComponentType.StringSelect,
    custom_id: id(PANEL, SHOW),
    placeholder: 'Section',
    min_values: 1,
    max_values: 1,
    options: SECTIONS.map((one) => ({
      label: one.name,
      value: one.value,
      description: one.description,
      ...(one.value === chosen ? { default: true } : {}),
    })),
  });
}

/** A select of one channel of `types`, the one set marked; empty clears it. */
function channelSelect(
  key: string,
  types: ChannelType[],
  set: string | undefined,
): APIActionRowComponent<APIChannelSelectComponent> {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.ChannelSelect,
        custom_id: id(key, SET),
        channel_types: types,
        placeholder: 'Not set',
        min_values: 0,
        max_values: 1,
        // Only an id: Discord refuses anything else (50035), and the panel would not open.
        default_values:
          set === undefined || !isSnowflake(set)
            ? []
            : [{ id: set, type: SelectMenuDefaultValueType.Channel }],
      },
    ],
  };
}

function roleSelect(
  key: string,
  set: string | undefined,
): APIActionRowComponent<APIRoleSelectComponent> {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.RoleSelect,
        custom_id: id(key, SET),
        placeholder: 'Not set',
        min_values: 0,
        max_values: 1,
        default_values:
          set === undefined || !isSnowflake(set)
            ? []
            : [{ id: set, type: SelectMenuDefaultValueType.Role }],
      },
    ],
  };
}

/** The button beside a feature: what pressing it sets (blue `Turn on`, gray `Turn off`). */
function switchButton(key: string, on: boolean): APIButtonComponentWithCustomId {
  return on
    ? {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: 'Turn off',
        custom_id: id(key, SET, [OFF]),
      }
    : {
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        label: 'Turn on',
        custom_id: id(key, SET, [ON]),
      };
}

function changeButton(
  key: DialogKey,
  label = 'Change…',
  args: string[] = [],
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    style: ButtonStyle.Secondary,
    label,
    custom_id: id(key, ASK, args),
  };
}

/** A text or a link as the panel shows it: in code, or `not set`. */
const code = (value: string | undefined): string =>
  value === undefined ? 'not set' : `\`${value.replaceAll('`', '')}\``;

/** How many characters the flagged words take on the panel. */
const WORDS_ROOM = 300;

/** A set id as a select may offer it: an id the server still has; undefined otherwise. */
function offered(
  set: string | undefined,
  known: ReadonlySet<string> | undefined,
): string | undefined {
  return set !== undefined && isSnowflake(set) && (known === undefined || known.has(set))
    ? set
    : undefined;
}

/**
 * What stays closed while the settings file's name of a setting is not found in the server
 * (`unmatched`, review F1, F2), and what leaving it unset does (fix round 4, I2), said under its
 * name (fix round 3, H9).
 */
const STILL_CLOSED: Readonly<Record<UnmatchedKey, string>> = {
  'channels.moderation':
    'not found: meetups that need approval and reports are refused. Leaving it unset turns ' +
    'meetup safety off: meetups are no longer held for the moderators, blocks stop applying, and ' +
    'reports stay refused.',
  'roles.mapMember':
    'not found: the map shows parties to administrators only. Leaving it unset opens the map: ' +
    'every member sees the map’s parties.',
};

/** What the first press of Leave unset asks, in that setting's place (fix round 4, I2). */
const LEAVE_UNSET_ASKED: Readonly<Record<UnmatchedKey, string>> = {
  'channels.moderation':
    'Leave the moderators’ channel unset? Meetup safety goes off in this server: meetups are no ' +
    'longer held for the moderators, blocks stop applying, and reports stay refused.',
  'roles.mapMember':
    'Leave the map’s member role unset? The map opens: every member sees the map’s parties.',
};

/** What the panel says once a setting was left unset: what it did (fix round 4, I2). */
export const LEFT_UNSET: Readonly<Record<UnmatchedKey, string>> = {
  'channels.moderation':
    'Left the moderators’ channel unset: meetup safety is off in this server; reports are refused.',
  'roles.mapMember': 'Left the map’s member role unset: every member sees the map’s parties.',
};

/**
 * The setting's name and what it is for, and under them: where the settings file named it and
 * the fill did not find it (`unmatched`), what stays closed until staff pick one and what leaving
 * it unset does, with Leave unset beside it (fix round 3, H9); once that was pressed
 * (`confirming`), the question and its two buttons, Leave unset (which writes) and Keep it closed
 * (fix round 4, I2); `not found: pick a channel` (or role) where the one set is no longer in the
 * server (review G2).
 */
function settingText(
  words: string,
  set: string | undefined,
  shown: string | undefined,
  unmatched: UnmatchedKey | undefined,
  what: 'channel' | 'role',
  confirming: UnmatchedKey | undefined,
): APIComponentInContainer[] {
  if (unmatched !== undefined && confirming === unmatched) {
    return [
      textDisplay(`${words}\n${LEAVE_UNSET_ASKED[unmatched]}`),
      actionRow([
        {
          type: ComponentType.Button,
          style: ButtonStyle.Danger,
          label: 'Leave unset',
          custom_id: id(unmatched, UNSET, [CONFIRM]),
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: 'Keep it closed',
          custom_id: id(unmatched, KEEP),
        },
      ]),
    ];
  }
  if (unmatched !== undefined) {
    return [
      section(`${words}\n-# ${STILL_CLOSED[unmatched]}`, {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: 'Leave unset',
        custom_id: id(unmatched, UNSET),
      }),
    ];
  }
  const lost = set !== undefined && shown === undefined;
  return [textDisplay(lost ? `${words}\n-# not found: pick a ${what}` : words)];
}

/** The key's marker where the settings file named it and the fill did not find it. */
const unmatchedOf = (values: ServerValues, key: UnmatchedKey): UnmatchedKey | undefined =>
  values.unmatched?.includes(key) === true ? key : undefined;

function channelsSection(
  values: ServerValues,
  known: ServerPanelState['known'],
  confirming: UnmatchedKey | undefined,
): APIComponentInContainer[] {
  return SERVER_CHANNEL_ROLES.flatMap((role) => {
    const set = values.channels[role];
    const shown = offered(set, known?.channels);
    const unmatched =
      role === 'moderation' ? unmatchedOf(values, 'channels.moderation') : undefined;
    return [
      ...settingText(
        `**${CHANNELS[role].name}** · ${CHANNELS[role].about}`,
        set,
        shown,
        unmatched,
        'channel',
        confirming,
      ),
      channelSelect(`channels.${role}`, channelTypes(role), shown),
    ];
  });
}

function rolesSection(
  values: ServerValues,
  known: ServerPanelState['known'],
  confirming: UnmatchedKey | undefined,
): APIComponentInContainer[] {
  const category = offered(values.categories.pvp, known?.channels);
  const unown = offered(values.roles.unown, known?.roles);
  const member = offered(values.roles.mapMember, known?.roles);
  return [
    ...settingText(
      '**PvP category** · PvP commands are used in its channels',
      values.categories.pvp,
      category,
      undefined,
      'channel',
      undefined,
    ),
    channelSelect('categories.pvp', [ChannelType.GuildCategory], category),
    ...settingText(
      '**Unown role** · the old bot’s role for Unown sightings: its holders are given a want for Unown',
      values.roles.unown,
      unown,
      undefined,
      'role',
      undefined,
    ),
    roleSelect('roles.unown', unown),
    ...settingText(
      '**Map’s member role** · only members with it (and administrators) see and press the ' +
        'parties on the web map; not set: every member',
      values.roles.mapMember,
      member,
      unmatchedOf(values, 'roles.mapMember'),
      'role',
      confirming,
    ),
    roleSelect('roles.mapMember', member),
  ];
}

function featuresSection(values: ServerValues, instance: Instance): APIComponentInContainer[] {
  return switchesOf(instance).map((one) => {
    const on = one.on(values);
    return section(`${one.name}: **${on ? ON : OFF}**`, switchButton(one.key, on));
  });
}

/**
 * The time zone's line (plan 19A-2): the zone, and the time there now, so that staff can see it
 * is right.
 */
function zoneLine(timezone: string, now: number): string {
  const there = zoned(now, timezone);
  return (
    `**Time zone** · ${code(timezone)}: it is ${clockWords(there)}, ${dayWords(there)} there ` +
    'now · every time members type and Pine shows here'
  );
}

function textSection(
  values: ServerValues,
  timezone: string,
  now: number,
): APIComponentInContainer[] {
  const forum = values.eventsForum;
  const words = values.flaggedWords;
  return [
    section(zoneLine(timezone, now), changeButton('timezone')),
    textDisplay('**Distance units** · how Pine says distances'),
    menuRow({
      type: ComponentType.StringSelect,
      custom_id: id('distanceUnits', SET),
      min_values: 1,
      max_values: 1,
      // Each by how it says two distances (`distanceWords`, the one wording of a distance).
      options: (['imperial', 'metric'] as const).map((units) => ({
        label: units === 'imperial' ? 'Imperial' : 'Metric',
        value: units,
        description: `${distanceWords(1_500, units)}, ${distanceWords(60, units)}`,
        ...(units === values.distanceUnits ? { default: true } : {}),
      })),
    }),
    section(
      `**Events forum** · lists **${String(forum.horizonDays)}** days ahead, opens an event’s ` +
        `post **${String(forum.postDaysAhead)}** days before it, recalls the top ` +
        `**${String(forum.onThisDay)}** big days “On this day”`,
      changeButton('eventsForum'),
    ),
    section(
      `**Flagged words** · a meetup at a place whose name has one asks the moderators first: ` +
        (words.length === 0
          ? 'none besides Pine’s own'
          : `${count(words.length, 'word')} (${fitItems(
              words.map((word) => `“${plain(word)}”`),
              WORDS_ROOM,
            )})`),
      wordsTooMany(words) ? changeButton('flaggedWords', 'Add…') : changeButton('flaggedWords'),
    ),
    // Too many to show in a dialog: added and removed, never typed anew (review G5).
    ...(wordsTooMany(words)
      ? [
          section(
            'Take some of the flagged words off the list',
            changeButton('flaggedWords', 'Remove…', [REMOVE]),
          ),
        ]
      : []),
    section(
      `**Ending of region forums** · ${code(values.regionForumSuffix)}`,
      changeButton('regionForumSuffix'),
    ),
    section(
      `**Region map link** · \`/maps\` gives it: ${code(values.regionMapLink)}`,
      changeButton('regionMapLink'),
    ),
    section(
      `**Invite** · for a visitor of the web map who is not in this server: ${code(values.invite)}`,
      changeButton('invite'),
    ),
  ];
}

/** How many changes Recent changes shows (the newest). */
export const RECENT_CHANGES = 15;

/**
 * How many characters the panel's text may take in all: Discord's 4,000 for a message's text
 * displays, less what the menus' and buttons' words may add, as `/audit` keeps (review G1).
 */
const PANEL_TEXT_ROOM = 3_500;
/** How many characters the line of what the last press changed takes at most. */
export const SAID_ROOM = 500;

/**
 * The newest changes, newest first, as many as fit `room` (`fitted`, as `/audit` fits its lines),
 * and a line of how many earlier ones are not shown. Given one more than `RECENT_CHANGES` (the
 * read asks one more, as `/audit` does), there are earlier ones than were read (fix round 3, H8).
 */
function changesSection(
  changes: ServerPanelState['changes'],
  room: number,
): APIComponentInContainer[] {
  const read = changes?.records ?? [];
  if (read.length === 0) return [textDisplay('Nothing was changed here in the last 30 days.')];
  const more = read.length > RECENT_CHANGES;
  const records = read.slice(-RECENT_CHANGES);
  const now = changes?.now ?? Date.now();
  const lines = records.map((record) => settingsChangeLine(record, now));
  const { kept, dropped } = fitted(lines, room - EARLIER_ROOM);
  const earlier = earlierLine(dropped, more);
  return [textDisplay([...kept.reverse(), ...(earlier === undefined ? [] : [earlier])].join('\n'))];
}

/** What the line of earlier changes takes. */
const EARLIER_ROOM = 40;

/**
 * `/admin settings`' panel (plan 19A-1): one private container of `LIST_COLOUR`, its title with
 * what the last press changed (`said`), the menu of the sections, and the section chosen, each
 * within Discord's 40 components (the fullest is Channels, its moderators' channel asking whether
 * to leave it unset; the tests count every section).
 */
export function serverPanel(state: ServerPanelState, said?: string): V2Message {
  const { values, section: chosen, confirming } = state;
  const title =
    said === undefined
      ? '### This server’s settings'
      : `### This server’s settings\n${truncate(said, SAID_ROOM)}`;
  const body =
    chosen === 'channels'
      ? channelsSection(values, state.known, confirming)
      : chosen === 'roles'
        ? rolesSection(values, state.known, confirming)
        : chosen === 'features'
          ? featuresSection(values, state.instance)
          : chosen === 'text'
            ? textSection(values, state.timezone, state.now)
            : changesSection(state.changes, PANEL_TEXT_ROOM - title.length);
  return {
    v2: true,
    components: [container(LIST_COLOUR, [textDisplay(title), sectionsMenu(chosen), ...body])],
  };
}
