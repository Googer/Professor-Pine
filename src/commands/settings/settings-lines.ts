import type { FillInState } from '../../db/repositories/legacy-fill-in-repository.js';
import type { UserSettings } from '../../db/repositories/user-repository.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { plain, truncate } from '../../render/text.js';

/** The settings that are switched on or off, as `UserSettings` names them. */
export type Flag =
  'mentions' | 'mentionsGroups' | 'mentionsShouts' | 'mentionsTrainStops' | 'bossSetNotification';

/** A setting of the member as a whole that is on or off: a ping in posts, or a DM. */
export interface FlagSetting {
  /** The id of its controls: `settings:<name>:set:on|off`. */
  name: 'mentions' | 'groups' | 'shouts' | 'train-moves' | 'boss-set';
  flag: Flag;
  /** Its line: `Pings for shouts: **on**`. */
  label: string;
  /** Its button among the pings, with the state after it: `Shouts: on`. */
  button: string;
  /** What the panel says once it is on, or off. */
  on: string;
  off: string;
  /** Whether `mentions`, the switch for all pings, also has to be on for this to do anything. */
  underMentions: boolean;
  /** Whether it is about a direct message, which a bot with notifications switched off never sends. */
  dm: boolean;
}

/** The four pings in posts, the switch for all of them first. */
export const PINGS: readonly FlagSetting[] = [
  {
    name: 'mentions',
    flag: 'mentions',
    label: 'Pings in posts',
    button: 'Pings',
    on: 'Pings in posts are on.',
    off: 'Pings in posts are off: no post pings you, not even for groups, shouts or train moves.',
    underMentions: false,
    dm: false,
  },
  {
    name: 'groups',
    flag: 'mentionsGroups',
    label: 'Pings for new groups and meeting times',
    button: 'Groups and times',
    on: 'Pings for new groups and meeting times are on.',
    off: 'Pings for new groups and meeting times are off.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'shouts',
    flag: 'mentionsShouts',
    label: 'Pings for shouts',
    button: 'Shouts',
    on: 'Pings for shouts are on.',
    off: 'Pings for shouts are off.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'train-moves',
    flag: 'mentionsTrainStops',
    label: 'Pings when a train moves',
    button: 'Train moves',
    on: 'Pings when a train moves are on.',
    off: 'Pings when a train moves are off.',
    underMentions: true,
    dm: false,
  },
];

/** The DM when an egg gets its boss. */
export const BOSS_SET: FlagSetting = {
  name: 'boss-set',
  flag: 'bossSetNotification',
  label: 'DM when an egg gets its boss',
  button: 'Boss DMs',
  on: 'You will get a DM when an egg you signed up for gets its boss.',
  off: 'No more DMs when an egg gets its boss.',
  underMentions: false,
  dm: true,
};

/** Every on/off setting of the member as a whole. */
export const FLAGS: readonly FlagSetting[] = [...PINGS, BOSS_SET];

/** The line of the history opt-in, per server (`ctx.historyOptIns`). */
export const HISTORY_LABEL = 'History in this server';
/** The line of the boards, per server (plan 8H-6). */
export const BOARDS_LABEL = 'On this server’s boards';
/** The line of the DM for a new train, per server (`ctx.newTrains`). */
export const NEW_TRAIN_LABEL = 'DM for a new train in this server';

export const AUTO_STATUS = [
  {
    value: 'interested',
    name: 'Interested',
    status: PartyStatus.Interested,
    description: 'You are signed up as interested',
    says: 'A raid or max battle you report, or a train you make, signs you up as interested.',
  },
  {
    value: 'coming',
    name: 'Coming',
    status: PartyStatus.Coming,
    description: 'You are signed up as coming',
    says: 'A raid or max battle you report, or a train you make, signs you up as coming.',
  },
  {
    value: 'here',
    name: 'Here',
    status: PartyStatus.Present,
    description: 'You are signed up as here (a train: coming)',
    says: 'A raid or max battle you report signs you up as here; a train you make, as coming.',
  },
  {
    value: 'none',
    name: 'None',
    status: PartyStatus.NotInterested,
    description: 'You are not signed up',
    says: 'A raid or max battle you report, or a train you make, does not sign you up.',
  },
] as const;

export const PRIVACY = [
  {
    value: 'visible',
    name: 'Visible',
    privacy: RaidPrivacy.Visible,
    description: 'The post names you',
    says: 'Posts of raids and max battles you report, and of trains you make, name you.',
  },
  {
    value: 'anonymous',
    name: 'Anonymous',
    privacy: RaidPrivacy.Anonymous,
    description: 'The post does not name you',
    says: 'Posts of raids and max battles you report, and of trains you make, do not name you.',
  },
] as const;

/** The auto status as the choices name it; whatever signs nobody up is `None`. */
export function autoStatusName(status: PartyStatus): string {
  return AUTO_STATUS.find((choice) => choice.status === status)?.name ?? 'None';
}

/** The value of the auto status's choice; whatever signs nobody up is `none`. */
export function autoStatusValue(status: PartyStatus): string {
  return AUTO_STATUS.find((choice) => choice.status === status)?.value ?? 'none';
}

/** As much of a text a member registered as the lines show: a legacy value may be long. */
const SHOWN_VALUE = 60;

/** What a line is about, so that the panel can put its control beside it. */
export type SettingName =
  | FlagSetting['name']
  | 'new-train'
  | 'history'
  | 'leaderboard'
  | 'legacy'
  | 'auto-status'
  | 'privacy'
  | 'friend-code'
  | 'nickname'
  | 'pokebattler';

/** One line of a member's settings. */
export interface SettingLine {
  setting: SettingName;
  text: string;
}

/**
 * The member's history of the old bot in a server (plan 8H-10): `offer`, it can be added (their
 * history is on and the member index has a file of theirs); else where their request stands.
 */
export type LegacyLine = { state: 'offer' } | FillInState;

/** The settings of a member that are per server: those of the server asked in. */
export interface ServerSettings {
  newTrain: boolean;
  history: boolean;
  leaderboard: boolean;
  /** Their old bot's history; none where there is nothing to say of it. */
  legacy?: LegacyLine;
}

const onOff = (value: boolean): string => (value ? 'on' : 'off');

/** The label of the old bot's history: staff's line (`settingsLines`). */
const LEGACY_LABEL = 'Old-bot history';

const counted = (value: number): string => value.toLocaleString('en-US');

/** Staff's words of the old bot's history: neutral, with why it failed. */
function legacyText(legacy: LegacyLine): string {
  switch (legacy.state) {
    case 'offer':
      return `${LEGACY_LABEL}: **not added**`;
    case 'queued':
      return `${LEGACY_LABEL}: **being added**`;
    case 'done':
      return `${LEGACY_LABEL}: **added** (on ${counted(legacy.filled)} ${legacy.filled === 1 ? 'party' : 'parties'})`;
    case 'failed':
      return `${LEGACY_LABEL}: **could not be added** (${plain(legacy.failure)})`;
  }
}

/** The member's words of their old bot's history, on their own panel (plan 8H-10). */
export function legacyWords(legacy: LegacyLine): string {
  switch (legacy.state) {
    case 'offer':
      return 'Your raids, trains and meetups with the old bot in this server can be added to your history.';
    case 'queued':
      return 'Your old-bot history is being added.';
    case 'done':
      return legacy.filled === 0
        ? 'None of your old-bot parties could be added: this bot holds them otherwise.'
        : `Your Discord id is now on ${counted(legacy.filled)} ${legacy.filled === 1 ? 'party' : 'parties'} of the old bot.`;
    case 'failed':
      // With "Try again" beside it (A1: the member retries).
      return 'Your old-bot history could not be added. Ask staff, then press **Try again**.';
  }
}

/**
 * Everything a member has set, one line each, in words that suit the member's own panel and
 * staff's `/admin member-settings` alike (plan 8S-5: one function for both). `server`: their
 * settings in the server asked in; undefined in a DM, where the lines leave them out. The friend
 * code and the in-game name only where registered.
 */
export function settingsLines(settings: UserSettings, server?: ServerSettings): SettingLine[] {
  const lines: SettingLine[] = FLAGS.map((setting) => {
    const quiet = setting.underMentions && settings[setting.flag] && !settings.mentions;
    return {
      setting: setting.name,
      text:
        `${setting.label}: **${onOff(settings[setting.flag])}**` +
        (quiet ? ' (quiet while pings in posts are off)' : ''),
    };
  });
  if (server !== undefined) {
    lines.push(
      { setting: 'new-train', text: `${NEW_TRAIN_LABEL}: **${onOff(server.newTrain)}**` },
      { setting: 'history', text: `${HISTORY_LABEL}: **${onOff(server.history)}**` },
      { setting: 'leaderboard', text: `${BOARDS_LABEL}: **${onOff(server.leaderboard)}**` },
    );
    if (server.legacy !== undefined) {
      lines.push({ setting: 'legacy', text: legacyText(server.legacy) });
    }
  }
  lines.push(
    {
      setting: 'auto-status',
      text: `Status on reports and trains: **${autoStatusName(settings.autoStatus)}**`,
    },
    {
      setting: 'privacy',
      text: `Name on reports and trains: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}**`,
    },
  );
  // What a member registered is their own text: shown plain, and only when there is any.
  const friendCode = settings.friendCode?.trim() ?? '';
  if (friendCode !== '') {
    lines.push({
      setting: 'friend-code',
      text: `Friend code: **${plain(truncate(friendCode, SHOWN_VALUE))}**`,
    });
  }
  const nickname = settings.nickname?.trim() ?? '';
  if (nickname !== '') {
    lines.push({
      setting: 'nickname',
      text: `In-game name: **${plain(truncate(nickname, SHOWN_VALUE))}**`,
    });
  }
  lines.push({
    setting: 'pokebattler',
    text:
      settings.pokebattlerId === null
        ? 'Pokebattler user id: none'
        : `Pokebattler user id: **${String(settings.pokebattlerId)}**`,
  });
  return lines;
}
