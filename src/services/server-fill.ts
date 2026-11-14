import type { ServerNotices } from './server-notices.js';
import {
  CHANNEL_LABELS,
  fileCategoryAndRoleNames,
  fileChannelNames,
  fileDefaults,
  type ServerChannelRole,
  type ServerValues,
  type UnmatchedKey,
} from '../config/server-settings.js';
import type { Settings } from '../config/settings.js';
import type { Logger } from '../log.js';
import type { ServerSettings } from './server-settings.js';
import { channelNameFor } from '../domain/regions/region-import.js';

/**
 * What the fill needs of a server (plan 19A-1): its channels, categories and roles by name, as
 * today's readers found them, from the client's cache (`serverNamesOf`, `src/discord/server-names.ts`).
 */
export interface ServerNames {
  serverId: string;
  /** A text channel or a forum of this name; of several, one the bot may post in, the oldest. */
  channel(name: string, kind: 'text' | 'forum'): string | undefined;
  /** A category of this name, as written. */
  category(name: string): string | undefined;
  /** A role of this name, trimmed and whatever its letter case. */
  role(name: string): string | undefined;
  /** How many text channels, forums or categories have this name (fix round 3, H10). */
  howMany(name: string, kind: 'text' | 'forum' | 'category'): number;
}

/** A name of the file that matched several channels or categories, and the one the fill took. */
export interface SeveralNamed {
  /** The setting with the file's name: `the bot lab #the-bot-lab`, `the PvP category PVP`. */
  setting: string;
  /** The id of the one taken. */
  kept: string;
}

/**
 * A server's first values: the file's server keys (`fileDefaults`), its names as the ids found in
 * that server; a name not found stays unset and is listed in `unmatched`, in words. Where the
 * file names an events forum (none was drawn before 2.1 without, as `eventForumWanted` decided;
 * fix round 3, H7), it is the one recorded for the server (`recordedForum`, the forum its posts
 * are in), its name looked for only without a record (review F3). A moderators' channel or a map member role
 * the file named and the server lacks is kept in the values' own `unmatched` (review F1, F2): it
 * keeps closed what the file's name kept closed, and is listed in `closed`, by its name. A name
 * that several channels or categories have is listed in `several` with the one taken (fix round
 * 3, H10).
 */
export function filledValues(
  settings: Settings,
  names: ServerNames,
  recordedForum?: string,
): {
  values: ServerValues;
  unmatched: string[];
  closed: ClosedSetting[];
  several: SeveralNamed[];
} {
  const unmatched: string[] = [];
  const closed: ClosedSetting[] = [];
  const several: SeveralNamed[] = [];
  const kept: UnmatchedKey[] = [];
  const channels: Partial<Record<ServerChannelRole, string>> = {};
  const fileNames = fileChannelNames(settings);
  if (fileNames.events !== undefined && recordedForum !== undefined) {
    channels.events = recordedForum;
  }
  for (const [role, name] of Object.entries(fileNames) as Array<
    [ServerChannelRole, string | undefined]
  >) {
    if (name === undefined || channels[role] !== undefined) continue;
    // The events forum as Discord stores its name, as `/admin setup-forums` looked for it
    // before 2.1 (review V7, ruling R4: lower case, spaces to hyphens).
    const kind = role === 'events' ? 'forum' : 'text';
    const named = role === 'events' ? channelNameFor(name) || name : name;
    const id = names.channel(named, kind);
    if (id !== undefined) {
      channels[role] = id;
      if (names.howMany(named, kind) > 1) {
        several.push({ setting: `${CHANNEL_LABELS[role]} #${named}`, kept: id });
      }
      continue;
    }
    if (role === 'moderation') {
      kept.push('channels.moderation');
      closed.push({ key: 'channels.moderation', name });
    } else unmatched.push(`${CHANNEL_LABELS[role]} #${name}`);
  }
  const { pvpCategory, unownRole, mapMemberRole: memberName } = fileCategoryAndRoleNames(settings);
  const category = names.category(pvpCategory);
  if (category === undefined) unmatched.push(`the PvP category ${pvpCategory}`);
  else if (names.howMany(pvpCategory, 'category') > 1) {
    several.push({ setting: `the PvP category ${pvpCategory}`, kept: category });
  }
  const unown = names.role(unownRole);
  if (unown === undefined) unmatched.push(`the Unown role ${unownRole}`);
  const mapMember = memberName === undefined ? undefined : names.role(memberName);
  if (memberName !== undefined && mapMember === undefined) {
    kept.push('roles.mapMember');
    closed.push({ key: 'roles.mapMember', name: memberName });
  }
  return {
    values: {
      ...fileDefaults(settings, names.serverId),
      channels,
      categories: category === undefined ? {} : { pvp: category },
      roles: {
        ...(unown === undefined ? {} : { unown }),
        ...(mapMember === undefined ? {} : { mapMember }),
      },
      ...(kept.length === 0 ? {} : { unmatched: kept }),
    },
    unmatched,
    closed,
    several,
  };
}

/** A setting the file named and the fill could not find, which stays closed (`unmatched`). */
export interface ClosedSetting {
  key: UnmatchedKey;
  /** The name the file gave it. */
  name: string;
}

/** What stays closed of a setting the fill could not find, said after its name. */
const CLOSED_UNTIL: Record<UnmatchedKey, (name: string) => string> = {
  'channels.moderation': (name) =>
    `The moderators’ channel #${name} could not be found, so it stays closed until staff pick ` +
    'one in /admin settings: meetups that need approval and reports are refused until then.',
  'roles.mapMember': (name) =>
    `The map’s member role ${name} could not be found, so it stays closed until staff pick one ` +
    'in /admin settings: the map shows parties to administrators only until then.',
};

/**
 * What the moderators' bot lab is told of the names the fill could not find: those left unset in
 * one sentence, then each that stays closed on a line of its own (the ruling on fix round 1);
 * then the names that matched several channels or categories, with the one taken by mention
 * (fix round 3, H10).
 */
export function unmatchedWords(
  unmatched: readonly string[],
  closed: readonly ClosedSetting[] = [],
  several: readonly SeveralNamed[] = [],
): string {
  const unset =
    unmatched.length === 0
      ? []
      : [
          'I could not find these channels and roles of my settings file in this server, so they ' +
            `are not set: ${unmatched.join(', ')}. Staff set them with /admin settings.`,
        ];
  const taken =
    several.length === 0
      ? []
      : [
          'These names match more than one channel or category in this server, so I took one of ' +
            `each: ${several.map((one) => `<#${one.kept}> as ${one.setting}`).join(', ')}. ` +
            'Staff pick others with /admin settings.',
        ];
  return [...unset, ...closed.map((one) => CLOSED_UNTIL[one.key](one.name)), ...taken].join('\n');
}

/** How many times the fill of a server is tried before it is given up until the next start. */
export const FILL_TRIES = 30;
/** How long after a failed fill it is tried again. */
export const FILL_RETRY_MS = 60_000;

/**
 * The fill (plan 19A-1, `servers.md`): a server the bot is in without a row gets one, from the
 * file's server keys, its names resolved in that server (`begin`: at each shard's ready, when a
 * server becomes available and when the bot joins one, `wireServerStart`). A server its shard's
 * first READY named (`present`) is recorded set up where the instance's record says it was there
 * before 2.1 or was adopted by a new install at its first start (`recorded`, plan 19C-2:
 * `ServerStandings`, never whether the table was empty in this process); any other starts in
 * setup.
 *
 * An interaction waits for its server's fill (`whenFilled`) before it is handled: the fill is
 * begun in the client's own events (a shard's ready, a server available or joined), before
 * discord.js hands on any interaction of that server, and reads only the cache and the events
 * forum's record, so the wait is a read and one write. A change of the server's values waits for
 * it too (`ServerSettings.filling`). A fill whose row cannot be written is tried again a minute
 * later (`FILL_RETRY_MS`), up to `FILL_TRIES` times, a warning each time (review F5); meanwhile,
 * and after it gives up, the server has the file's defaults, which keep closed what the file
 * names (`fileUnmatched`, fix round 4, I1), and nothing waits for it.
 */
export class ServerFill {
  private readonly filling = new Map<string, Promise<void>>();
  private readonly retries = new Map<string, NodeJS.Timeout>();
  /** Stopped for the shutdown: no fill is tried again. */
  private stopped = false;

  constructor(
    private readonly options: {
      servers: Pick<ServerSettings, 'has' | 'of' | 'create' | 'filling'>;
      settings: Settings;
      log: Logger;
      /**
       * Whether the instance's record has the server as there before 2.1 (migration 061) or
       * adopted by a new install at its first start (`ServerStandings.standingOf(…).recorded`,
       * plan 19C-2): such a server, present at the login, is set up already.
       */
      recorded: (serverId: string) => boolean;
      /**
       * Tells a server's staff in its moderators' bot lab, or logs it without one (plan 19B-1,
       * `ServerNotices`); returns at once and never throws.
       */
      notices: Pick<ServerNotices, 'tell'>;
      /** The events forum recorded for a server (`EventForumRepository.forum`), if any. */
      recordedForum?: (serverId: string) => Promise<string | undefined>;
    },
  ) {}

  /**
   * Begins the fill of a server without a row (none twice at once, none while it waits to be
   * tried again); its end is `whenFilled`. `present`: its shard's first READY named it (the bot
   * was in it at the login, available then or later); `joined`: the bot was added to it since,
   * which is never recorded set up.
   */
  begin(names: ServerNames, how: 'present' | 'joined'): void {
    const { serverId } = names;
    if (this.options.servers.has(serverId) || this.filling.has(serverId)) return;
    if (this.retries.has(serverId)) return;
    this.start(names, how, 1);
  }

  /** Resolves once the server's fill under way is done; at once without one (or in a DM). */
  whenFilled(serverId: string | null): Promise<void> {
    return (serverId === null ? undefined : this.filling.get(serverId)) ?? Promise.resolve();
  }

  /**
   * Stops the fills waiting to be tried again (the shutdown), and keeps one under way that fails
   * from being tried again (fix round 3, H12).
   */
  stop(): void {
    this.stopped = true;
    for (const timer of this.retries.values()) clearTimeout(timer);
    this.retries.clear();
  }

  private start(names: ServerNames, how: 'present' | 'joined', attempt: number): void {
    const { serverId } = names;
    const done = this.fill(names, how, attempt).finally(() => {
      this.filling.delete(serverId);
    });
    this.filling.set(serverId, done);
    this.options.servers.filling(serverId, done);
  }

  /**
   * One try of a server's fill. Never rejects (fix round 3, H5): whatever fails, the names read
   * from the cache as well as the write, is tried again (`tryAgain`). Done once the row is
   * written: the bot lab is told on the side (H4; `ServerNotices.tell` never throws).
   */
  private async fill(
    names: ServerNames,
    how: 'present' | 'joined',
    attempt: number,
  ): Promise<void> {
    const { servers, settings, log } = this.options;
    try {
      const setUp = how === 'present' && this.options.recorded(names.serverId);
      const { values, unmatched, closed, several } = filledValues(
        settings,
        names,
        await this.recordedForum(names.serverId),
      );
      const made = await servers.create(names.serverId, values, setUp);
      if (!made) return;
      log.info({ server: names.serverId, setUp }, "server's settings filled");
      if (unmatched.length === 0 && closed.length === 0 && several.length === 0) return;
      // In the server's moderators' bot lab, or the log without one (plan 19B-1).
      this.options.notices.tell(
        names.serverId,
        'unmatched-settings',
        unmatchedWords(unmatched, closed, several),
      );
    } catch (err) {
      this.tryAgain(names, how, attempt, err);
    }
  }

  /** The events forum recorded for the server; none where there is none or it cannot be read. */
  private async recordedForum(serverId: string): Promise<string | undefined> {
    try {
      return await this.options.recordedForum?.(serverId);
    } catch (err) {
      this.options.log.warn(
        { err, server: serverId },
        'could not read the events forum recorded for a server: its name is looked for',
      );
      return undefined;
    }
  }

  private tryAgain(
    names: ServerNames,
    how: 'present' | 'joined',
    attempt: number,
    err: unknown,
  ): void {
    const { log } = this.options;
    const { serverId } = names;
    if (this.stopped) {
      log.warn({ err, server: serverId }, "could not fill a server's settings while stopping");
      return;
    }
    if (attempt >= FILL_TRIES) {
      log.error(
        { err, server: serverId, attempts: attempt },
        "could not fill a server's settings: it has the file's defaults until the bot starts again",
      );
      return;
    }
    log.warn(
      { err, server: serverId, attempt },
      "could not fill a server's settings: trying again in a minute",
    );
    const timer = setTimeout(() => {
      this.retries.delete(serverId);
      if (!this.options.servers.has(serverId)) this.start(names, how, attempt + 1);
    }, FILL_RETRY_MS);
    timer.unref();
    this.retries.set(serverId, timer);
  }
}
