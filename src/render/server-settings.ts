import { CHANNEL_LABELS, NOT_FOUND, type SettingChange } from '../config/server-settings.js';
import type { ValuesProblem } from '../services/server-settings.js';
import { isSnowflake } from '../db/snowflake.js';
import type { SettingsAuditRecord } from '../db/repositories/server-settings-audit-repository.js';
import { clockOrDate, count, fitItems, memberByName, plain } from './text.js';

/**
 * The words of a server's settings (plan 19A-1, `servers.md`): what each setting is called, and
 * what a change of it did, in one place for `/admin settings` (its line of what changed and its
 * Recent changes) and `/audit member:`. Channels, the category and roles are said by mention:
 * these answers are private, and mentions are off (nobody is pinged).
 */

type Kind = 'channel' | 'role' | 'switch' | 'number' | 'choice' | 'code' | 'words';

interface Setting {
  /** What it is called in a sentence: `the moderators’ channel`, `notifications (wants and DMs)`. */
  label: string;
  kind: Kind;
}

/** Every setting of a server's values by its key (`SettingChange.key`). */
export const SETTINGS: Readonly<Record<string, Setting>> = {
  // The channels by the names the fill's message gives them too (`CHANNEL_LABELS`).
  ...Object.fromEntries(
    Object.entries(CHANNEL_LABELS).map(([role, label]) => [
      `channels.${role}`,
      { label, kind: 'channel' as const },
    ]),
  ),
  'categories.pvp': { label: 'the PvP category', kind: 'channel' },
  'roles.unown': { label: 'the Unown role', kind: 'role' },
  'roles.mapMember': { label: 'the map’s member role', kind: 'role' },
  'features.exGymChannel': { label: 'copies of raids at elite raid gyms', kind: 'switch' },
  'features.remoteRaidChannel': { label: 'copies of remote raids', kind: 'switch' },
  'features.notifications': { label: 'notifications (wants and DMs)', kind: 'switch' },
  'features.roles': { label: 'self-assigned roles (`/iam`)', kind: 'switch' },
  postNewGyms: { label: 'posting new gyms', kind: 'switch' },
  passiveReading: { label: 'reading every screenshot in region channels', kind: 'switch' },
  autoAssignRole: { label: 'the auto-assigned role', kind: 'switch' },
  timezone: { label: 'the time zone', kind: 'code' },
  distanceUnits: { label: 'the distance units', kind: 'choice' },
  'eventsForum.horizonDays': { label: 'the days the events forum lists', kind: 'number' },
  'eventsForum.postDaysAhead': {
    label: 'the days before an event that its post opens',
    kind: 'number',
  },
  'eventsForum.onThisDay': { label: 'the big days “On this day” recalls', kind: 'number' },
  flaggedWords: { label: 'the flagged words', kind: 'words' },
  blacklistWords: { label: 'the words gym search ignores', kind: 'words' },
  regionForumSuffix: { label: 'the ending of region forums', kind: 'code' },
  regionMapLink: { label: 'the region map link', kind: 'code' },
  invite: { label: 'the invite', kind: 'code' },
  publicMap: { label: 'the map for visitors who are not logged in', kind: 'switch' },
};

/** What a setting is called; its key where Pine has no name for it. */
export function settingLabel(key: string): string {
  return Object.hasOwn(SETTINGS, key) ? (SETTINGS[key]?.label ?? key) : key;
}

/** How many characters the words a list gained or lost may take in one line. */
const WORDS_ROOM = 300;

/** A value as a sentence shows it; undefined for unset, or a value of another shape. */
function shown(kind: Kind, value: unknown): string | undefined {
  switch (kind) {
    case 'channel':
      return typeof value === 'string' && isSnowflake(value) ? `<#${value}>` : undefined;
    case 'role':
      return typeof value === 'string' && isSnowflake(value) ? `<@&${value}>` : undefined;
    case 'number':
      return typeof value === 'number' ? String(value) : undefined;
    case 'choice':
      return typeof value === 'string' ? plain(value) : undefined;
    case 'code':
      return typeof value === 'string' ? `\`${value.replaceAll('`', '')}\`` : undefined;
    default:
      return undefined;
  }
}

/** The words of a list: each in quotes, as plain text. */
function wordsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((word) => typeof word === 'string') : [];
}

/** `changed the flagged words: added “a”, “b”; removed “c”`, each list within `room`. */
function listWords(label: string, before: unknown, after: unknown, room: number): string {
  const was = wordsOf(before);
  const now = wordsOf(after);
  const quoted = (words: readonly string[]) => words.map((word) => `“${plain(word)}”`);
  const added = now.filter((word) => !was.includes(word));
  const removed = was.filter((word) => !now.includes(word));
  const parts = [
    ...(added.length === 0 ? [] : [`added ${fitItems(quoted(added), room)}`]),
    ...(removed.length === 0 ? [] : [`removed ${fitItems(quoted(removed), room)}`]),
  ];
  return parts.length === 0 ? `changed ${label}` : `changed ${label}: ${parts.join('; ')}`;
}

/** How `changeWords` may be shortened: the lists' room, and whether the value before is said. */
interface WordsFit {
  wordsRoom?: number;
  was?: boolean;
}

/**
 * What a change of one setting did, after who did it: `set the moderators’ channel to <#…>
 * (was <#…>)`, `cleared the PvP category (was <#…>)`, `turned on posting new gyms`, `changed the
 * flagged words: added “condo”`. A setting Pine does not know is named by its key alone.
 */
export function changeWords(change: SettingChange, fit: WordsFit = {}): string {
  const setting = Object.hasOwn(SETTINGS, change.key) ? SETTINGS[change.key] : undefined;
  if (setting === undefined) return `changed ${change.key}`;
  const { label, kind } = setting;
  if (kind === 'switch') {
    return change.after === true
      ? `turned on ${label}`
      : change.after === false
        ? `turned off ${label}`
        : `changed ${label}`;
  }
  if (kind === 'words') {
    return listWords(label, change.before, change.after, fit.wordsRoom ?? WORDS_ROOM);
  }
  // The settings file's, which the fill did not find, left unset by staff (fix round 3, H9).
  if (change.before === NOT_FOUND && change.after === null) {
    return `left ${label} unset (it was not found)`;
  }
  const was = fit.was === false ? undefined : shown(kind, change.before);
  const now = shown(kind, change.after);
  if (now !== undefined) return `set ${label} to ${now}${was === undefined ? '' : ` (was ${was})`}`;
  if (fit.was === false && shown(kind, change.before) !== undefined) return `cleared ${label}`;
  return was === undefined ? `changed ${label}` : `cleared ${label} (was ${was})`;
}

/** The words of a change as a sentence of its own: `Set the bot lab to <#…>.` */
export function changeSentence(change: SettingChange, fit: WordsFit = {}): string {
  const words = changeWords(change, fit);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

/** How many characters the words a list gained or lost take in the line of what changed. */
const SAID_WORDS_ROOM = 150;
/** What the sentence of the changes not said takes at most. */
const MORE_ROOM = 50;

/**
 * The line of what a press changed (`/admin settings`, fix round 3, H11), within `room`, fitted
 * by whole parts, never cut inside a word, a mention or a code span: a sentence a setting, its
 * lists in a smaller room (`SAID_WORDS_ROOM`); a sentence too long without the value it was, else
 * without its values (`Changed the region map link.`); the sentences that do not fit dropped
 * whole, and said as `And 2 more changes: see Recent changes.`
 */
export function changesSaid(changes: readonly SettingChange[], room: number): string {
  const kept: string[] = [];
  let used = 0;
  for (const [index, change] of changes.entries()) {
    const gap = kept.length === 0 ? 0 : 1;
    const left = room - used - gap - (index === changes.length - 1 ? 0 : MORE_ROOM);
    const forms = [
      changeSentence(change, { wordsRoom: SAID_WORDS_ROOM }),
      changeSentence(change, { wordsRoom: SAID_WORDS_ROOM, was: false }),
      `Changed ${settingLabel(change.key)}.`,
    ];
    const form = forms.find((one) => one.length <= left);
    if (form === undefined) break;
    kept.push(form);
    used += gap + form.length;
  }
  const more = changes.length - kept.length;
  return more === 0
    ? kept.join(' ')
    : [...kept, `And ${count(more, 'more change')}: see Recent changes.`].join(' ');
}

/** A line of the panel's Recent changes: `<t:…> **Ash** set the moderators’ channel to <#…>.` */
export function settingsChangeLine(record: SettingsAuditRecord, now: number): string {
  return `${clockOrDate(record.at, now)} ${memberByName(record.actor)} ${changeWords(record)}.`;
}

/**
 * What the panel says of a change it refused (`ServerValuesError.problems`): `Not changed: the
 * moderators’ channel must be a channel of its own, not the same as the bot lab.`
 */
export function refusalWords(problems: readonly ValuesProblem[]): string {
  const said = [...new Set(problems.map(problemWords))];
  return `Not changed: ${said.length === 0 ? NOT_VALID : said.join('; ')}.`;
}

const NOT_VALID = 'that is not a valid value';

/** What each number of the events forum may be, by its bounds (`eventsForumSchema`). */
const NUMBER_BOUNDS: Readonly<Record<string, string>> = {
  'eventsForum.horizonDays': 'must be 1 to 365',
  'eventsForum.postDaysAhead': 'must be 0 to 365',
  'eventsForum.onThisDay': 'must be 0 to 10',
};

/**
 * The settings whose checker words its refusal itself, in the panel's words (`settings.ts`,
 * `server-settings.ts`): the forums' ending, the invite, the time zone, and the panel's own
 * `must be a whole number`.
 */
const OWN_WORDS = new Set(['regionForumSuffix', 'invite', 'timezone']);

/**
 * One refused setting in the panel's own words (review G4): never the checker's English nor a
 * key; a refusal Pine has no words for is `that is not a valid value`. The moderators' channel
 * that would be another of the server's names that one by its label (fix round 3, H2).
 */
function problemWords({ key, message, same }: ValuesProblem): string {
  const label = settingLabel(key);
  if (key === 'channels.moderation' && same !== undefined && Object.hasOwn(SETTINGS, same)) {
    return `${label} must be a channel of its own, not the same as ${settingLabel(same)}`;
  }
  const own = message.replace(/\.$/u, '');
  if (own === 'must be a whole number') return `${label} ${own}`;
  if (key === 'eventsForum.postDaysAhead' && own.startsWith('must be at most')) {
    return `${label} must be at most the days listed`;
  }
  const bounds = NUMBER_BOUNDS[key];
  if (bounds !== undefined) return `${label} ${bounds}`;
  if (/^flaggedWords\.\d+$/u.test(key)) return 'a flagged word is longer than 100 characters';
  if (key === 'flaggedWords') return 'there may be at most 500 flagged words';
  if (/^blacklistWords\.\d+$/u.test(key)) {
    return 'a word gym search ignores is longer than 100 characters';
  }
  if (key === 'blacklistWords') return 'there may be at most 500 words gym search ignores';
  if (key === 'regionMapLink') return `${label} must be an https:// address`;
  if (key === 'distanceUnits') return `${label} must be imperial or metric`;
  if (OWN_WORDS.has(key)) return `${label} ${own}`;
  return NOT_VALID;
}
