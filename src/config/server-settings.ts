import { z } from 'zod';
import {
  distanceUnitsSchema,
  eventsForumSchema,
  flaggedWordsSchema,
  ignoredWordsSchema,
  inviteSchema,
  regionForumSuffixSchema,
  regionMapLinkSchema,
  timezoneSchema,
  type Settings,
} from './settings.js';
import { sameZone } from '../domain/time/zoned.js';

/**
 * A server's values (plan 19A-1; spec `2026-11-12-multi-server-instance-design.md`, "Per-server
 * settings"): what the settings file held that is really a server's, one JSON document per server
 * in the table `ServerSettings`, read through `ServerSettings.of(serverId)`
 * (`src/services/server-settings.ts`), never from `config.settings`. Every key is optional with a
 * default, and checked as strictly as the file's (the same schemas, `settings.ts`).
 *
 * Unlike the file, the channels, the PvP category and the roles are ids (snowflakes), chosen in
 * `/admin settings`' selects; the upgrade resolved the file's names in each server (the fill).
 */

/** A Discord id. */
const snowflake = z.string().regex(/^\d{17,20}$/u, 'must be a Discord ID');

/**
 * The channels of a server by their role, as the file's `channels` named them: the bot lab, the
 * moderators' bot lab, Unown sightings, elite gym raids' copies, remote raids' copies, PvP, bot
 * updates, the moderators' channel (meetup safety and reports) and the events forum.
 */
export const SERVER_CHANNEL_ROLES = [
  'bot-lab',
  'mod-bot-lab',
  'unown',
  'elite-gym-raids',
  'remote-raids',
  'pvp',
  'bot-updates',
  'moderation',
  'events',
] as const;
export type ServerChannelRole = (typeof SERVER_CHANNEL_ROLES)[number];

/**
 * What each channel of a server is called in what Pine says to staff (the fill's message to the
 * bot lab, `/admin settings`), never its key (fix round 3, H2).
 */
export const CHANNEL_LABELS: Readonly<Record<ServerChannelRole, string>> = {
  'bot-lab': 'the bot lab',
  'mod-bot-lab': 'the moderators’ bot lab',
  unown: 'the Unown channel',
  'elite-gym-raids': 'the elite gym raids channel',
  'remote-raids': 'the remote raids channel',
  pvp: 'the PvP channel',
  'bot-updates': 'the bot updates channel',
  moderation: 'the moderators’ channel',
  events: 'the events forum',
};

const channelsSchema = z
  .strictObject(
    Object.fromEntries(SERVER_CHANNEL_ROLES.map((role) => [role, snowflake.optional()])) as Record<
      ServerChannelRole,
      z.ZodOptional<typeof snowflake>
    >,
  )
  .superRefine((channels, ctx) => {
    // As the file's (`settings.ts`): the moderators' own bot channel may be it, nothing else.
    const { moderation, 'mod-bot-lab': _staffOnly, ...others } = channels;
    if (moderation === undefined) return;
    const same = Object.entries(others).find(([, id]) => id === moderation);
    if (same !== undefined) {
      // The message is for the log; the panel words it by the setting's name (`same`, its key).
      ctx.addIssue({
        code: 'custom',
        path: ['moderation'],
        message: `must be a channel of its own, not the ${same[0]} channel`,
        params: { same: `channels.${same[0]}` },
      });
    }
  })
  .default({});

/** Whether a server uses a feature; the code's defaults are those of a server set up from nothing. */
const FEATURE_DEFAULTS = {
  exGymChannel: false,
  remoteRaidChannel: false,
  notifications: true,
  roles: false,
};

export const serverValuesSchema = z.strictObject({
  channels: channelsSchema,
  categories: z.strictObject({ pvp: snowflake.optional() }).default({}),
  /** The Unown role (`roles.unown` of the file) and the map's member role (`web.memberRole`). */
  roles: z
    .strictObject({ unown: snowflake.optional(), mapMember: snowflake.optional() })
    .default({}),
  features: z
    .strictObject({
      exGymChannel: z.boolean().default(FEATURE_DEFAULTS.exGymChannel),
      remoteRaidChannel: z.boolean().default(FEATURE_DEFAULTS.remoteRaidChannel),
      notifications: z.boolean().default(FEATURE_DEFAULTS.notifications),
      roles: z.boolean().default(FEATURE_DEFAULTS.roles),
    })
    .default(() => ({ ...FEATURE_DEFAULTS })),
  /**
   * The server's zone (plan 19A-2; `ServerSettings.zoneOf`): the file's at the fill, then its
   * staff's in `/admin settings`. Absent: the instance's default.
   */
  timezone: timezoneSchema.optional(),
  distanceUnits: distanceUnitsSchema,
  eventsForum: eventsForumSchema,
  /** `meetupSafety.flaggedWords` of the file. */
  flaggedWords: flaggedWordsSchema,
  regionForumSuffix: regionForumSuffixSchema,
  /**
   * The words the server's gym search ignores (`blacklistWords` of the file; plan 19B-2): its
   * gym directory's view reads them. A blank word is none, so that a row holding one stays
   * readable; the flagged words' limits (`ignoredWordsSchema`).
   */
  blacklistWords: ignoredWordsSchema,
  postNewGyms: z.boolean().default(false),
  regionMapLink: regionMapLinkSchema,
  /** The server's invite for a visitor of its map who is not in it (`web.invites` of the file). */
  invite: inviteSchema.optional(),
  /**
   * Whether the server uses passive screenshot reading and the auto-assigned role, where the
   * instance allows them (`ocr.passive`, `autoAssignRole` of the file, which decide the intents):
   * on unless its staff turn them off.
   */
  passiveReading: z.boolean().default(true),
  autoAssignRole: z.boolean().default(true),
  /**
   * The settings the file named that the fill could not find in the server (`UNMATCHED_KEYS`),
   * kept so that a name not found opens nothing the file kept closed: the map stays for
   * administrators (`mapMemberRole`), meetup safety and reports stay on, the moderators
   * unreachable (`moderatorsNamed`). Absent when none; a key is forgotten once its value is
   * chosen (`parseServerValues`).
   */
  unmatched: z.array(z.enum(['roles.mapMember', 'channels.moderation'])).optional(),
});

export type ServerValues = z.output<typeof serverValuesSchema>;

/** The settings whose name, not found by the fill, is kept (`ServerValues.unmatched`). */
export type UnmatchedKey = NonNullable<ServerValues['unmatched']>[number];

/**
 * A server's values from a stored or changed document: the defaults filled in, and of the
 * settings the fill could not find (`unmatched`) only those still unset; throws a `ZodError`.
 */
export function parseServerValues(raw: unknown): ServerValues {
  const values = serverValuesSchema.parse(raw);
  if (values.unmatched === undefined) return values;
  const { unmatched, ...rest } = values;
  const set: Record<UnmatchedKey, boolean> = {
    'roles.mapMember': rest.roles.mapMember !== undefined,
    'channels.moderation': rest.channels.moderation !== undefined,
  };
  const still = [...new Set(unmatched)].filter((key) => !set[key]);
  return still.length === 0 ? rest : { ...rest, unmatched: still };
}

// The map's member role and whether the moderators can be reached, as the values say them: pure
// rules of the domain (fix round 3, H3), here for the code that reads a server's values.
export { ADMINISTRATORS_ONLY, mapMemberRole, moderatorsNamed } from '../domain/servers/standing.js';

/**
 * One setting of a server that a change changed (plan 19A-1, the staff's log of settings,
 * `ServerSettingsAudit`): its key (`channels.moderation`, `features.roles`,
 * `eventsForum.onThisDay`, `flaggedWords`), and its value before and after as stored (ids, not
 * names), null for unset.
 */
export interface SettingChange {
  key: string;
  before: unknown;
  after: unknown;
}

/** The settings inside a key of several, in the order the panel shows them. */
const INNER_KEYS: Readonly<Record<string, readonly string[]>> = {
  channels: SERVER_CHANNEL_ROLES,
  categories: ['pvp'],
  roles: ['unown', 'mapMember'],
  features: ['exGymChannel', 'remoteRaidChannel', 'notifications', 'roles'],
  eventsForum: ['horizonDays', 'postDaysAhead', 'onThisDay'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What changed between two values of a server, one entry per setting: a channel, a role, a
 * feature or one of the events forum's numbers by itself, a list or a text as one; in the
 * order of the schema's keys. None between equal values.
 */
export function settingChanges(before: ServerValues, after: ServerValues): SettingChange[] {
  const changes: SettingChange[] = [];
  const compare = (key: string, was: unknown, now: unknown): void => {
    // Two names of one zone are the same zone (fix round 1, K3): no change.
    if (key === 'timezone' && typeof was === 'string' && typeof now === 'string') {
      if (sameZone(was, now)) return;
    }
    if (JSON.stringify(was ?? null) !== JSON.stringify(now ?? null)) {
      changes.push({ key, before: was ?? null, after: now ?? null });
    }
  };
  const was = before as Record<string, unknown>;
  const now = after as Record<string, unknown>;
  for (const key of Object.keys(serverValuesSchema.shape)) {
    // Not a setting: what the fill could not find, forgotten once its setting is chosen, which
    // is the change logged.
    if (key === 'unmatched') continue;
    const inner = INNER_KEYS[key];
    const a = was[key];
    const b = now[key];
    if (inner === undefined || !isRecord(a) || !isRecord(b)) {
      compare(key, a, b);
      continue;
    }
    const keys = [
      ...inner,
      ...[...Object.keys(a), ...Object.keys(b)].filter((k) => !inner.includes(k)),
    ];
    for (const name of new Set(keys)) compare(`${key}.${name}`, a[name], b[name]);
  }
  // A setting the fill could not find that staff left unset (fix round 3, H9): its marker gone,
  // no value chosen. Logged as from `NOT_FOUND` to unset.
  for (const key of before.unmatched ?? []) {
    const chosen =
      key === 'channels.moderation' ? after.channels.moderation : after.roles.mapMember;
    if (after.unmatched?.includes(key) !== true && chosen === undefined) {
      changes.push({ key, before: NOT_FOUND, after: null });
    }
  }
  return changes;
}

/**
 * What the log keeps as the value before of a setting the settings file named, the fill did not
 * find, and staff left unset (`settingChanges`; fix round 3, H9).
 */
export const NOT_FOUND = 'not found';

/** A server's invite in the file (`web.invites`, one per server), the default of its `invite`. */
export function fileInvite(settings: Pick<Settings, 'web'>, serverId: string): string | undefined {
  return settings.web?.invites?.[serverId];
}

/**
 * The names the file gives a server's channels by their role (the file names them, a server's
 * values hold ids): what the fill looks for in each server (`filledValues`), and the name a new
 * events forum is made with (`newEventsForumName`).
 */
export function fileChannelNames(
  settings: Pick<Settings, 'channels'>,
): Partial<Record<ServerChannelRole, string>> {
  return settings.channels;
}

/** The names the file gives the PvP category, the Unown role and the map's member role. */
export function fileCategoryAndRoleNames(
  settings: Pick<Settings, 'categories' | 'roles' | 'web'>,
): {
  pvpCategory: string;
  unownRole: string;
  mapMemberRole: string | undefined;
} {
  return {
    pvpCategory: settings.categories.pvp,
    unownRole: settings.roles.unown,
    mapMemberRole: settings.web?.memberRole,
  };
}

/**
 * The values of the file's server keys (spec: the defaults of a server's first row), for a server
 * without a row: the channels, the category and the roles are names in the file and ids here, so
 * they stay unset until the fill has resolved them in that server (`fillValues`).
 */
export function fileDefaults(settings: Settings, serverId?: string): ServerValues {
  const invite = serverId === undefined ? undefined : fileInvite(settings, serverId);
  return parseServerValues({
    features: settings.features,
    timezone: settings.timezone,
    distanceUnits: settings.distanceUnits,
    eventsForum: settings.eventsForum,
    flaggedWords: settings.meetupSafety?.flaggedWords ?? [],
    regionForumSuffix: settings.regionForumSuffix,
    blacklistWords: settings.blacklistWords,
    postNewGyms: settings.postNewGyms,
    ...(settings.regionMapLink === undefined ? {} : { regionMapLink: settings.regionMapLink }),
    ...(invite === undefined ? {} : { invite }),
    // Passive reading and the auto-assigned role: on (the code's default), used where the
    // instance allows them (`ocr.passive`, `autoAssignRole` of the file).
  });
}

/**
 * The settings the file names that keep something closed, as `unmatched` keeps them (fix round 4,
 * I1): a server without a readable row has no ids, so where the file names a moderators' channel
 * or a map member role, meetup safety and reports stay on and the map closed (`moderatorsNamed`,
 * `mapMemberRole`) until a row with ids exists, as they would with a name the fill did not find.
 */
export function fileUnmatched(settings: Pick<Settings, 'channels' | 'web'>): UnmatchedKey[] {
  return [
    ...(settings.channels.moderation === undefined ? [] : ['channels.moderation' as const]),
    ...(settings.web?.memberRole === undefined ? [] : ['roles.mapMember' as const]),
  ];
}
