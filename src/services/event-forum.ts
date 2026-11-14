import {
  EVENTS_FORUM_GONE,
  eventsForumCannotPostWords,
  eventsForumRefusedWords,
  eventsListingUnpinnedWords,
} from '../render/server-notices.js';
import type { ServerNotices } from './server-notices.js';
import { SnowflakeUtil } from 'discord.js';
import type { Settings } from '../config/settings.js';
import { fileChannelNames } from '../config/server-settings.js';
import { isSnowflake } from '../db/snowflake.js';
import type {
  EventForumRecord,
  EventForumStorage,
  EventPostRecord,
} from '../db/repositories/event-forum-repository.js';
import {
  isMissingPermission,
  PostsRefusedError,
  rateLimitWaitMs,
  type OutgoingMessage,
  type PartyGateway,
} from '../discord/party-gateway.js';
import {
  isPosted,
  listingSections,
  postOpensAt,
  sectionChangesAt,
  type ListedEvent,
} from '../domain/time/event-listing.js';
import {
  EVENTS_TITLE,
  eventPostMessage,
  eventPostTitle,
  listingMessage,
} from '../render/events-forum.js';
import { channelNameFor } from '../domain/regions/region-import.js';
import { BoundedMap } from '../bounded-map.js';
import type { Logger } from '../log.js';
import type { CatchUpOutcome } from './catch-up.js';
import { everyLocalMidnightIn, type ZonesMidnight } from './local-midnight.js';
import { isNetworkError } from './network-error.js';
import type { ListedEventProvider } from './raid-event-service.js';
import type { HistoryDays } from './history-days.js';
import { nextOnThisDayAt, ON_THIS_DAY_HOUR, onThisDayDue } from '../domain/history/on-this-day.js';
import { zoned } from '../domain/time/zoned.js';
import { localDay } from '../domain/time/local-day.js';
import { onThisDayMessage, onThisDayTitle } from '../render/big-days.js';
import {
  changesPlanned,
  plannedCounts,
  plannedDuring,
  startsDuringAny,
} from '../domain/party/event-parties.js';
import type { Party } from '../domain/party/party.js';
import { startTimeOf } from '../domain/party/timed.js';
import type { EventPlannedView } from '../render/event-parties.js';
import type { PartyListener } from './party-store.js';
import type { ServerSettingsService } from './server-settings.js';
import type { SettingsActor } from '../db/repositories/server-settings-audit-repository.js';

const DAY_MS = 24 * 60 * 60_000;
/** A post still open this long after its event's end is archived by the upkeep, once (R1). */
const ARCHIVE_AFTER_END_MS = 3 * DAY_MS;
/** The auto-archive of a post once its event ended: a day without messages (R1). */
const AFTER_END_ARCHIVE_MINUTES = 1_440;
/** How many event posts' last sent messages are kept (a few dozen per server and year). */
const POSTS_SENT_KEPT = 1_000;
/**
 * The most new event posts one draw makes in a server (plan 8Z-2), tried and failed ones
 * counted: the rest are made by a draw `MORE_POSTS_AFTER_MS` later, and so on. Of the kept feed
 * of 2026-10-22 (64 events, 17 of them listed and of posted kinds) at most 6 are due at once by
 * the default `postDaysAhead` of 14 (12 at 35 days): a first draw makes them all, a feed in
 * other hands no flood.
 */
export const MAX_NEW_POSTS_PER_DRAW = 10;
/** How long after a draw that left posts unmade the next one makes more of them. */
export const MORE_POSTS_AFTER_MS = 60_000;
/**
 * How long a post Discord refused (AutoMod on a name, say) is passed over before it is asked for
 * again (fix round of 8Z-2): every draw tried the same earliest ten, and ten refused for good
 * held every later event back.
 */
export const REFUSED_POST_RETRY_MS = 60 * 60_000;
/**
 * The most event posts a server makes in three days (`RECENT_POSTS_MS`), by when each was made
 * (its id's time), whatever became of them (dropped, deleted by a moderator: taking posts away
 * makes room for no others); "On this day" is not counted. About three times the posted events
 * of the whole kept feed (17; 7 have a post at once by the default, 12 at 35 days ahead): the
 * feed as it is never comes near, and one in other hands makes fifty posts in three days at most
 * (plan 8Z-2). Counted by when posts were made, not by their events' ends, which a feed sets: an
 * event that ends in 2099 would otherwise hold its place until then.
 */
export const MAX_OPEN_EVENT_POSTS = 50;
/** How long a post counts against `MAX_OPEN_EVENT_POSTS` after it was made. */
const RECENT_POSTS_MS = 3 * DAY_MS;
/** The longest delay `setTimeout` accepts; anything longer fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;
/**
 * The key of a day's "On this day" among the event posts (`EventPost.eventId`, plan 8H-8), the
 * local day after it: no event of the feed has such an id, so no draw moves, edits or links it.
 */
export const ON_THIS_DAY_KEY = 'on-this-day:';
/**
 * The hours after 10:00 the hourly upkeeps have to bring the raids per day up to date before
 * "On this day" warns that they have not (R5).
 */
const DAYS_CATCH_UP_HOURS = 2;
/** "On this day" archives itself after a day without messages (G6). */
const ON_THIS_DAY_ARCHIVE_MINUTES = 1_440;
/**
 * How long after a change of a train or meetup the forum draws again (Matt, 2026-11-07): the
 * changes meanwhile come with it, one draw for them all.
 */
export const EVENT_PARTY_REDRAW_MS = 5_000;

/**
 * Whether a post's row counts against `MAX_OPEN_EVENT_POSTS`: an event's (not "On this day")
 * made less than `RECENT_POSTS_MS` ago, by the time in its post's id (Discord's snowflake); a row
 * whose id is no snowflake counts.
 */
function countsAsOpen(row: EventPostRecord, now: number): boolean {
  if (row.eventId.startsWith(ON_THIS_DAY_KEY)) return false;
  if (!isSnowflake(row.postId)) return true;
  return SnowflakeUtil.timestampFrom(row.postId) + RECENT_POSTS_MS > now;
}

/** The step of a post's part of a draw that failed (`perPost`, BR-5). */
type PostKind = 'make' | 'edit' | 'rename' | 'reopen' | 'archive' | 'auto-archive';

/**
 * The step of a post's part of a draw under way, and the steps it went through (`perPost`): those
 * passed when the part ends well worked again (re-review RR-2).
 */
class PostStage {
  readonly passed = new Set<PostKind>();
  private current: PostKind;

  constructor(kind: PostKind) {
    this.current = kind;
    this.passed.add(kind);
  }

  get kind(): PostKind {
    return this.current;
  }

  set kind(kind: PostKind) {
    this.current = kind;
    this.passed.add(kind);
  }
}

/** What `/admin setup-forums` did for the events forum (`EventForumService.setup`). */
export type EventsForumSetup =
  /** The server has no `bot-updates` channel to make the forum beside: nothing was made. */
  | { forum: 'no-bot-updates'; name: string }
  /** Discord refused the forum, or something went wrong: `reason` for staff. */
  | { forum: 'failed'; name: string; reason: string }
  | {
      forum: 'created' | 'ready';
      name: string;
      forumId: string;
      /** Create Posts denied to everyone and allowed to the bot (`reservePosts`). */
      posting: 'reserved' | 'was-reserved' | 'not-allowed';
      /** Manage Posts allowed to the bot in its own overwrite (`letBotManagePosts`). */
      managing: 'allowed' | 'was-allowed' | 'not-allowed';
      /**
       * Who cannot write in its posts: `@everyone`, and the map's member role where the settings
       * name one (`rolesWithoutReplies`, branch review BR-7).
       */
      replies: string[];
      /**
       * The listing "Events": made now, standing, not made, or waiting for the feed, or for the
       * server to be set up (`setup`, plan 19C-2).
       */
      listing: ListingOutcome | 'setup';
    };

/**
 * What a draw did to a server's listing: made now, standing, not made (the log says why), or
 * waiting for the events feed (`listingKnown`, review V1); for `setup`, also waiting for the
 * server to be set up (plan 19C-2: nothing is drawn for a server in setup).
 */
type ListingOutcome = 'made' | 'ready' | 'failed' | 'waiting';

export interface EventForumOptions {
  gateway: PartyGateway;
  store: EventForumStorage;
  events: ListedEventProvider;
  settings: Pick<Settings, 'web'>;
  /**
   * What keeps the forum from being drawn as it should, told to the server's staff in its
   * moderators' bot lab (plan 19B-1, `ServerNotices`): the forum gone, Manage Posts refused, the
   * listing not pinned.
   */
  notices: Pick<ServerNotices, 'tell'>;
  /**
   * Each server's values (plan 19A-1): its events forum, by id (set by `setup` when it makes
   * one), its channel for bot updates, the map's member role; its zone and the zones in use
   * (plan 19A-2), in which its forum is drawn and its midnights come.
   */
  servers: ServerSettingsService;
  /** The name a new events forum is given (the file's `channels.events`, else `events`). */
  forumName: string;
  log: Logger;
  /**
   * The big days (plan 8H-8, `HistoryDays`): "On this day" is posted only with them, and
   * the server's `eventsForum.onThisDay` above 0 (plan 19A-1).
   */
  days?: Pick<HistoryDays, 'onThisDay'>;
  /**
   * The trains and meetups planned during the events (follow-ups, 8V-1; Matt, 2026-11-07): the
   * parties, whose changes draw again, and the row of a server, by which parties name it. Without
   * them the forum shows none.
   */
  planned?: {
    parties: { active(): Party[]; onChange(listener: PartyListener): void };
    guilds: { idFor(serverId: string): Promise<number | undefined> };
  };
  /** The clock, in epoch milliseconds. Default `Date.now`. */
  now?: () => number;
  /** Sets a timer and gives what cancels it. Default an unref'd `setTimeout`. */
  setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * Whether the bot has events forums (`app.ts` makes `EventForumService` only then): never in
 * rehearsal mode (R8: the rehearsal's gateway would drop and log its posts at every draw; plan
 * 8H-8, G18: nor "On this day"). Which servers have one is theirs (plan 19A-1): those whose staff
 * ran `/admin setup-forums` or chose a forum in `/admin settings`.
 */
export function eventForumWanted(settings: Pick<Settings, 'rehearsal'>): boolean {
  return settings.rehearsal === undefined;
}

/** The name of a new events forum: the file's `channels.events` (plan 8V-1), else `events`. */
export function newEventsForumName(settings: Pick<Settings, 'channels'>): string {
  const name = fileChannelNames(settings).events ?? 'events';
  return channelNameFor(name) || name;
}

/**
 * The events forum of each server (plan 8V-1; design `2026-10-28-events-forum-design.md`): one
 * forum, the server's events forum (plan 19A-1: by id), made by `/admin setup-forums` in the
 * category of its channel for bot updates, with Pine's pinned and locked listing "Events" (`EVENTS_TITLE`: Now, This week,
 * Coming up, `listingSections`) and a post per event of a posted kind (`isPosted`), opened
 * the server's `eventsForum.postDaysAhead` before its start (plan 19A-1). Made wherever
 * rehearsal mode is off (`app.ts`, R8), drawing in a server only the forum its values name.
 *
 * Everything is drawn from the listed events (`ListedEventProvider`) and the rows of the forums
 * and posts, so a draw at any time puts right what a restart or the network missed. Draws run one
 * at a time (`request` coalesces): after each read of the feed, at the next start or end among
 * the listed events (one timer set anew at each draw), a second after local midnight, in the
 * hourly upkeep and in the catch-up on reconnect. An unchanged listing is not edited.
 */
export class EventForumService {
  /** The servers whose forums the last draw went through: the timer's numbers are theirs. */
  private drawnServers: string[] = [];
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  /** The draw under way, and whether another was asked for meanwhile. */
  private drawing: Promise<void> | undefined;
  private again = false;
  /** The listing last sent to each server's post (as JSON): the same is not edited again. */
  private readonly listingSent = new Map<string, { postId: string; text: string }>();
  /** What was last sent to each event post (as JSON): the same is not edited again (W1). */
  private readonly postsSent = new BoundedMap<string, string>(POSTS_SENT_KEPT);
  /**
   * The message (as JSON) of each post found archived and left so though it differs from what
   * was sent (plan 8M-15, review R1-4): not asked about again until the message changes or the
   * hourly draw.
   */
  private readonly postsLeft = new BoundedMap<string, string>(POSTS_SENT_KEPT);
  /** The failures of one post's step, said once each (`perPost`, BR-5). */
  private readonly postFailuresTold = new BoundedMap<string, true>(POSTS_SENT_KEPT);
  /**
   * The events (`<server>:<event id>`) whose post Discord refused, with when they are asked for
   * again (`REFUSED_POST_RETRY_MS`): passed over until then, before the ten of a draw are counted.
   */
  private readonly refusedPosts = new BoundedMap<string, number>(POSTS_SENT_KEPT);
  /** The setup under way of each server (`setup`, BR-6). */
  private readonly setups = new Map<string, Promise<unknown>>();
  /** The servers whose forum is gone, logged once each until it is back. */
  private readonly forumGoneTold = new Set<string>();
  /** What Discord refused, logged once per server and what (`pin`, `lock`, `archive`). */
  private readonly refusedTold = new Set<string>();
  /** The servers whose forum has as many event posts as it may, said once each (`tellFull`). */
  private readonly fullTold = new Set<string>();
  /** Whether the draw under way left posts unmade for a later one (`MAX_NEW_POSTS_PER_DRAW`). */
  private morePostsDue = false;
  /**
   * What the draws since `setup` asked did to each server's listing (`made` stays: a later draw
   * of the same run finds it standing).
   */
  private readonly outcomes = new Map<string, ListingOutcome>();
  /**
   * The local day each server's "On this day" was settled for (posted, found posted, or nothing to
   * post): not asked again that day.
   */
  private readonly onThisDaySettled = new Map<string, string>();
  /**
   * The local day each server's "On this day" was warned of, per warning (`<server>|behind`: the
   * days not caught up, R5; `<server>|failed`: a failure, A4): each once a day, neither keeping
   * the other unsaid (review W4).
   */
  private readonly onThisDayWarned = new Map<string, string>();
  /** Whether the next draw opens the posts that archived themselves before their end (V6). */
  private reopenDue = false;
  private cancelNext: (() => void) | undefined;
  /** The draw a change of a train or meetup asked for, waiting (`EVENT_PARTY_REDRAW_MS`). */
  private cancelPartyRedraw: (() => void) | undefined;
  /** Whether the changes of the parties are listened to (once: a store's listeners stay). */
  private partiesWatched = false;
  /**
   * The servers warned that who sees the regions of their trains and meetups could not be told:
   * once each until it works again (review EP-2).
   */
  private readonly plannedWarned = new Set<string>();
  /** The ends of the trains and meetups the draw under way counted, for the next timer (EP-5). */
  private plannedEnds: number[] = [];
  /** The timers of the midnights of the zones in use (plan 19A-2). */
  private midnights: ZonesMidnight | undefined;
  /** The timers of draws after a wait Discord named (`drawLater`). */
  private readonly waits = new Set<() => void>();
  private stopped = false;

  constructor(private readonly options: EventForumOptions) {
    this.now = options.now ?? (() => Date.now());
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
  }

  /**
   * Draws after each read of the feed and a second after each local midnight of every zone in use
   * from now on (plan 19A-2), and once now. Once Discord is there (`app.ts`); nothing after
   * `stop`.
   */
  start(): void {
    if (this.stopped) return;
    this.options.events.onListedChange(() => {
      this.request();
    });
    this.midnights?.cancel();
    this.midnights = everyLocalMidnightIn({
      zones: () => this.options.servers.zonesInUse(),
      now: this.now,
      setTimer: this.setTimer,
      run: () => {
        this.request();
      },
    });
    const { planned } = this.options;
    if (planned !== undefined && !this.partiesWatched) {
      this.partiesWatched = true;
      planned.parties.onChange((before, after) => {
        if (!changesPlanned(before, after)) return;
        // Only where it started, or starts, within a listed event (review EP-4), in any zone in
        // use: the party names its server's row, not its zone, and a draw too many is cheap.
        const during = this.options.servers.zonesInUse().some((zone) => {
          const events = this.options.events.listedEvents(zone);
          return startsDuringAny(before, events) || startsDuringAny(after, events);
        });
        if (during) this.redrawSoon();
      });
    }
    this.request();
  }

  /**
   * A server's zone changed (plan 19A-2; `ServerSettings.onZoneChange`): the midnights follow the
   * zones in use, and every forum is drawn anew (its times, its sections, "On this day" on the
   * new clock). Nothing after `stop`.
   */
  zonesChanged(): void {
    if (this.stopped) return;
    this.midnights?.refresh();
    this.request();
  }

  /**
   * A draw `EVENT_PARTY_REDRAW_MS` from now, for a change of a train or meetup: one waiting takes
   * the changes after it too. Nothing after `stop`.
   */
  private redrawSoon(): void {
    if (this.stopped || this.cancelPartyRedraw !== undefined) return;
    this.cancelPartyRedraw = this.setTimer(() => {
      this.cancelPartyRedraw = undefined;
      this.request();
    }, EVENT_PARTY_REDRAW_MS);
  }

  /** Stops the timers; a draw under way ends, and none starts after it. */
  stop(): void {
    this.stopped = true;
    this.midnights?.cancel();
    this.cancelNext?.();
    this.cancelNext = undefined;
    this.cancelPartyRedraw?.();
    this.cancelPartyRedraw = undefined;
    for (const cancel of this.waits) cancel();
    this.waits.clear();
  }

  /** Asks for a draw of every server's forum; one under way is followed by one more. */
  request(): void {
    if (this.stopped) return;
    if (this.drawing) {
      this.again = true;
      return;
    }
    this.drawing = (async () => {
      do {
        this.again = false;
        await this.drawAll();
      } while (this.again && !this.stopped);
    })().finally(() => {
      this.drawing = undefined;
    });
  }

  /**
   * Runs `work` alone in the line of draws: after the draw under way, and with none starting
   * until it is done (a draw asked for meanwhile follows it).
   */
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    while (this.drawing) await this.drawing;
    const run = work();
    this.drawing = run
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        this.drawing = undefined;
        if (this.again) {
          this.again = false;
          this.request();
        }
      });
    return run;
  }

  /** Resolves once no draw is under way (at once when none is). Never rejects. */
  async flush(): Promise<void> {
    while (this.drawing) await this.drawing;
  }

  /** The hourly upkeep (`PartyScheduler`): a draw, waited for. Never rejects. */
  async upkeep(): Promise<void> {
    // The hourly draw opens a quiet post archived before its event's end (review V6, R3).
    this.reopenDue = true;
    this.request();
    await this.flush();
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H): every forum drawn anew, as a midnight
   * or a start may have passed while the network was away. Never rejects.
   */
  async catchUp(): Promise<CatchUpOutcome> {
    if (this.stopped) return 'not-owed';
    await this.upkeep();
    return 'done';
  }

  /**
   * Gives the server its events forum (`/admin setup-forums`, by staff member `by`): the forum its
   * values name (plan 19A-1: by id, chosen in `/admin settings`; a forum recorded before is
   * replaced, R7), else one made beside its channel for bot updates, in its category and with its
   * permissions, and kept in its values; Create Posts denied to everyone (members write in Pine's
   * posts but make none) and Manage Posts allowed to the bot. Recorded, then drawn: its listing
   * and posts. What is there already is left as it is, so it is safe to run again.
   */
  setup(guildId: string, by: SettingsActor): Promise<EventsForumSetup> {
    // One setup per server at a time (branch review BR-6): a second waits and finds the forum.
    const previous = this.setups.get(guildId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.setupOnce(guildId, by));
    // What is kept for the next setup never rejects: the caller has the failure (`run`).
    const kept = run
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        if (this.setups.get(guildId) === kept) this.setups.delete(guildId);
      });
    this.setups.set(guildId, kept);
    return run;
  }

  /** `setup`, one at a time per server. */
  private async setupOnce(guildId: string, by: SettingsActor): Promise<EventsForumSetup> {
    const { gateway, store, servers, log } = this.options;
    const values = servers.of(guildId);
    const channels = gateway.serverChannels(guildId) ?? [];
    const chosen = channels.find(
      (one) => one.kind === 'forum' && one.id === values.channels.events,
    );
    let forumId = chosen?.id;
    const name = chosen?.name ?? this.options.forumName;
    const created = forumId === undefined;
    if (forumId === undefined) {
      const botUpdates = channels.find(
        (one) => one.kind === 'text' && one.id === values.channels['bot-updates'],
      );
      if (!botUpdates) return { forum: 'no-bot-updates', name };
      try {
        forumId = (await gateway.createForum(botUpdates.id, name, []))?.forumId;
      } catch (err) {
        log.warn({ err, guild: guildId }, 'could not make the events forum');
        const reason = isMissingPermission(err)
          ? `I need Manage Channels in the category of #${botUpdates.name}`
          : 'Something went wrong (see the log).';
        return { forum: 'failed', name, reason };
      }
      if (forumId === undefined) {
        return { forum: 'failed', name, reason: `#${botUpdates.name} is gone.` };
      }
      // Kept as the server's events forum (plan 19A-1); one that cannot be kept is taken back.
      const made = forumId;
      try {
        await servers.set(
          guildId,
          (now) => ({ ...now, channels: { ...now.channels, events: made } }),
          by,
        );
      } catch (err) {
        log.error({ err, guild: guildId }, 'could not keep the new events forum');
        await gateway.deleteChannel(made).catch((deleteErr: unknown) => {
          log.warn({ err: deleteErr, guild: guildId }, 'could not take back the events forum');
        });
        return { forum: 'failed', name, reason: 'Something went wrong (see the log).' };
      }
    }
    // In the one line of draws (re-review W2): a draw that read the old forum ends first, so none
    // makes a post in it after its rows were retired.
    const recordedId = forumId;
    await this.exclusive(() => store.setForum(guildId, recordedId));
    const posting = (await gateway.reservePosts(forumId)) ?? 'not-allowed';
    const managing = (await gateway.letBotManagePosts(forumId)) ?? 'not-allowed';
    const memberRole = values.roles.mapMember;
    const replies =
      (await gateway.rolesWithoutReplies(forumId, memberRole === undefined ? [] : [memberRole])) ??
      [];
    // A server in setup (plan 19C-2) has nothing drawn: its listing and posts come once it is
    // set up (`serverSetUpWork` draws every forum again).
    if (servers.inSetup(guildId)) {
      return {
        forum: created ? 'created' : 'ready',
        name,
        forumId,
        posting,
        managing,
        replies,
        listing: 'setup',
      };
    }
    // Drawn now, through the one line of draws (two at once could make two listings): what it
    // did to the listing is in the answer.
    this.outcomes.delete(guildId);
    this.request();
    await this.flush();
    const listing = this.outcomes.get(guildId) ?? 'failed';
    return {
      forum: created ? 'created' : 'ready',
      name,
      forumId,
      posting,
      managing,
      replies,
      listing,
    };
  }

  /** Every server's forum drawn, one after the other; one that fails does not stop the others. */
  private async drawAll(): Promise<void> {
    const { store, log } = this.options;
    const reopen = this.reopenDue;
    this.reopenDue = false;
    let forums: EventForumRecord[];
    try {
      forums = await store.forums();
    } catch (err) {
      log.warn({ err }, 'could not read the events forums');
      return;
    }
    this.plannedEnds = [];
    this.morePostsDue = false;
    this.drawnServers = forums.map((forum) => forum.serverId);
    for (const forum of forums) {
      if (this.stopped) return;
      const outcome = await this.drawServer(forum, reopen);
      if (this.outcomes.get(forum.serverId) !== 'made') this.outcomes.set(forum.serverId, outcome);
    }
    this.setNextTimer();
    // The posts a server's draw left unmade (`MAX_NEW_POSTS_PER_DRAW`) come with a later draw.
    if (this.morePostsDue) this.drawLater(MORE_POSTS_AFTER_MS);
  }

  /**
   * One server's forum drawn: its posts first (made, moved, edited, dropped, ended), then its
   * listing, which links them. A forum that is gone is said once and nothing is done there until
   * it is back. Never rejects: what fails is logged (a warning for the network, which the
   * catch-up puts right).
   */
  private async drawServer(forum: EventForumRecord, reopen = false): Promise<ListingOutcome> {
    const { gateway, servers, log } = this.options;
    const { serverId, forumId } = forum;
    // Only the forum the server's staff chose (plan 19A-1): none chosen, or another one not set
    // up yet (`/admin setup-forums` records it), nothing is drawn.
    if (servers.of(serverId).channels.events !== forumId) return 'failed';
    // A server Discord says is unavailable (an outage) is not drawn, and its forum, which the
    // cache may not show, is not said to be gone (fix round 2, G4); the next draw tries again.
    if (!gateway.serverAvailable(serverId)) return 'failed';
    if (gateway.channelKind(forumId) !== 'forum') {
      if (!this.forumGoneTold.has(serverId)) {
        this.forumGoneTold.add(serverId);
        log.warn({ guild: serverId, forum: forumId }, 'the events forum is gone');
      }
      // At every draw (fix round 2, G2): `ServerNotices` says it once, and again at the next
      // draw where it could not, so a lab set later hears of it.
      this.options.notices.tell(serverId, 'events-forum:gone', EVENTS_FORUM_GONE);
      return 'failed';
    }
    this.forumGoneTold.delete(serverId);
    // "On this day" is the history's, not the feed's (G6): drawn whatever the listing.
    await this.drawOnThisDay(forum);
    // Until the listing is known (a kept one loaded, or a read), an empty or stale one says
    // nothing: no post is made, dropped or drawn, and the listing stands (review V1).
    if (!this.options.events.listingKnown()) return 'waiting';
    try {
      // The events on the server's clock (plan 19A-2): a feed's local times in its zone.
      const zone = servers.zoneOf(serverId);
      const events = this.options.events.listedEvents(zone);
      const planned = await this.plannedOf(forum, events);
      const posts = await this.drawPosts(forum, events, zone, reopen, planned);
      // Nor the listing after a stop (RR-3).
      if (this.stopped) return 'failed';
      return await this.drawListing(forum, events, zone, posts, planned);
    } catch (err) {
      const where = { err, guild: serverId, forum: forumId };
      if (isNetworkError(err)) log.warn(where, 'could not draw the events forum');
      else log.error(where, 'could not draw the events forum');
      // The listing's post refused for a permission: the staff must give it (plan 19B-1).
      this.tellIfPostsRefused(serverId, forumId, err);
      return 'failed';
    }
  }

  /**
   * A day's "On this day" (plan 8H-8, design Part G): from 10:00 local time (`onThisDayDue`), at
   * the first draw of the day after it (its own timer, a start, the hourly upkeep, a catch-up),
   * once a day per server, where today's date was one of an earlier year's top
   * `eventsForum.onThisDay` big days of the server's values (`HistoryDays.onThisDay`): a post of its own, never
   * pinned, nobody pinged, archiving itself after a day without messages, recorded among the event
   * posts under `on-this-day:<day>` (start and end its making, ended at once), which the upkeep
   * archives three days on as an event's post. A day missed (the bot down) is never posted later.
   * A post made before a restart that was not recorded is found by its title (it has the year)
   * among the open posts and taken over; one another bot recorded first is deleted. Counts every
   * region (G16, round 2 R4: a member of no roles is never barred, `MemberAccess`, so their page
   * counts every region too). While the days are still being filled (`complete` false: after
   * migration 042 or a rebuild, A1) nothing is posted nor settled: a later draw that day posts;
   * still so two hours after 10:00 (the upkeeps should have caught up), it is warned of once a day
   * (R5). A failure is warned of once a day per server (A4). Nothing after `stop`: a draw under
   * way makes no post once it came (W7). Never rejects.
   */
  private async drawOnThisDay(forum: EventForumRecord): Promise<void> {
    // Nothing after a stop, nor a post once one came while the days were read (review W7).
    if (this.stopped) return;
    const { days, settings, store, gateway, log, servers } = this.options;
    const count = servers.of(forum.serverId).eventsForum.onThisDay;
    const now = this.now();
    // 10:00 and today on the server's clock (plan 19A-2).
    const zone = servers.zoneOf(forum.serverId);
    if (days === undefined || count <= 0 || !onThisDayDue(now, zone)) return;
    const { serverId, forumId } = forum;
    const today = localDay(now, zone);
    if (this.onThisDaySettled.get(serverId) === today) return;
    const key = `${ON_THIS_DAY_KEY}${today}`;
    try {
      const recorded = async () => (await store.posts(serverId)).find((row) => row.eventId === key);
      if ((await recorded()) !== undefined) {
        this.onThisDaySettled.set(serverId, today);
        return;
      }
      // Every region (G16): a member of no roles is barred from none.
      const found = await days.onThisDay(serverId, new Set(), now, count);
      // The days not caught up yet: not settled, a later draw asks again (A1).
      if (!found.complete) {
        if (
          zoned(now, zone).hour >= ON_THIS_DAY_HOUR + DAYS_CATCH_UP_HOURS &&
          this.onThisDayWarned.get(`${serverId}|behind`) !== today
        ) {
          this.onThisDayWarned.set(`${serverId}|behind`, today);
          log.warn({ guild: serverId }, 'raids per day not caught up');
        }
        return;
      }
      if (found.years.length === 0) {
        this.onThisDaySettled.set(serverId, today);
        return;
      }
      const title = onThisDayTitle(today);
      const message = onThisDayMessage(
        today,
        found.years.map((one) => ({ years: one.years, boss: one.day.boss, raids: one.day.raids })),
        settings.web === undefined ? undefined : `${settings.web.publicUrl}/s/${serverId}/history`,
      );
      const left = await this.openPostTitled(forumId, title);
      if (this.stopped) return;
      const postId =
        left ??
        (await gateway.createPost(forumId, {
          title,
          message,
          tagIds: [],
          autoArchiveMinutes: ON_THIS_DAY_ARCHIVE_MINUTES,
        }));
      if (postId === undefined) return;
      const row: EventPostRecord = {
        serverId,
        eventId: key,
        postId,
        name: title,
        start: now,
        end: now,
        // Set to archive itself as it is made: the draws need not set it again.
        endedAt: now,
        archivedAt: null,
        dropped: false,
        gone: false,
      };
      if (!(await store.addPost(row))) {
        // Another bot recorded its own first: this one goes (one it took over is that one).
        if ((await recorded())?.postId !== postId) await gateway.deletePost(postId);
      } else {
        log.info(
          { guild: serverId, post: postId },
          left === undefined ? 'posted "On this day"' : 'took over "On this day"',
        );
      }
      this.onThisDaySettled.set(serverId, today);
      this.onThisDayWarned.delete(`${serverId}|behind`);
      this.onThisDayWarned.delete(`${serverId}|failed`);
    } catch (err) {
      // Once a day per server: every draw of the day tries again (A4).
      if (this.onThisDayWarned.get(`${serverId}|failed`) === today) return;
      this.onThisDayWarned.set(`${serverId}|failed`, today);
      log.warn({ err, guild: serverId, forum: forumId }, 'could not post "On this day"');
    }
  }

  /**
   * The trains and meetups planned during each listed event of a server (`plannedDuring`, every
   * region; Matt, 2026-11-07), by event id; an event with none is left out. All are counted; a
   * party is named (its post linked) only where everybody who sees the events forum sees its
   * region's forum, the rule by which a region's counts are shared into a channel
   * (`PartyGateway.shareKeeps`, plan 8H-5, R-A). Where that cannot be told (the forum unknown to
   * the cache, or a throw, warned once per server until it works again), none is named and
   * nothing is said of who sees them (`named` undefined, review EP-1 and EP-2). The ends of the
   * counted parties join `plannedEnds` for the next timer (EP-5).
   */
  private async plannedOf(
    forum: EventForumRecord,
    events: readonly ListedEvent[],
  ): Promise<ReadonlyMap<string, EventPlannedView>> {
    const found = new Map<string, EventPlannedView>();
    const { planned, gateway, log } = this.options;
    if (planned === undefined) return found;
    const guildRow = await planned.guilds.idFor(forum.serverId);
    if (guildRow === undefined) return found;
    const now = this.now();
    const parties = planned.parties.active();
    const byEvent = events
      .map((event) => ({ event, during: plannedDuring(parties, guildRow, event, now) }))
      .filter(({ during }) => during.length > 0);
    if (byEvent.length === 0) return found;
    // The next moment a counted party is over by the clock (review EP-5): the timer draws then.
    for (const { during } of byEvent) {
      for (const party of during) if (party.endTime !== null) this.plannedEnds.push(party.endTime);
    }
    const gates = [
      ...new Set(
        byEvent.flatMap(({ during }) =>
          during.flatMap((party) => (party.forumChannelId === null ? [] : [party.forumChannelId])),
        ),
      ),
    ];
    // Undefined where it cannot be told (review EP-1): nobody named, nothing said of the others.
    let open: ReadonlySet<string> | undefined;
    try {
      open = await gateway.shareKeeps(forum.forumId, gates);
      this.plannedWarned.delete(forum.serverId);
    } catch (err) {
      // Once per server until it works again (review EP-2).
      if (!this.plannedWarned.has(forum.serverId)) {
        this.plannedWarned.add(forum.serverId);
        log.warn(
          { err, guild: forum.serverId },
          'could not tell who sees the regions of the trains and meetups of the events',
        );
      }
    }
    for (const { event, during } of byEvent) {
      found.set(event.id, {
        counts: plannedCounts(during),
        named:
          open === undefined
            ? undefined
            : during.flatMap((party) =>
                party.forumChannelId !== null &&
                party.forumPostId !== null &&
                open.has(party.forumChannelId)
                  ? [{ postId: party.forumPostId, start: startTimeOf(party) ?? event.start }]
                  : [],
              ),
      });
    }
    return found;
  }

  /** The bot's open post of a forum with this title, if any. */
  private async openPostTitled(forumId: string, title: string): Promise<string | undefined> {
    const { gateway } = this.options;
    for (const postId of (await gateway.openPosts(forumId)) ?? []) {
      if ((await gateway.postInfo(postId))?.title === title) return postId;
    }
    return undefined;
  }

  /**
   * The server's event posts brought up to date; gives the posts the listing links (event id to
   * post id, none gone). In order: a post whose event moved to a new id goes with it (R12); a
   * post is made for each posted event from its opening (`postOpensAt`) until its end; a post
   * whose event's name or times changed is edited; one whose event was dropped before its start
   * says so and is archived; one whose event ended archives itself after a day (R1), and one
   * still open three days after the end is archived, once. A post that is gone is marked so and
   * never made again (R7).
   */
  private async drawPosts(
    forum: EventForumRecord,
    events: readonly ListedEvent[],
    zone: string,
    reopen: boolean,
    planned: ReadonlyMap<string, EventPlannedView> = new Map(),
  ): Promise<Map<string, string>> {
    const { store } = this.options;
    const { serverId } = forum;
    const now = this.now();
    const byId = new Map(events.map((event) => [event.id, event]));
    // The server's numbers (plan 19A-1).
    const { postDaysAhead } = this.options.servers.of(serverId).eventsForum;
    const rows = await store.posts(serverId);
    // Moves first: the row of an old id follows its event (R12).
    // A stop cuts a draw under way short, between posts (re-review RR-3).
    for (const row of rows) {
      if (this.stopped) break;
      // A gone row moves too (review V5): its event's new id gets no post either.
      if (row.dropped || byId.has(row.eventId)) continue;
      const moved = events.find((event) => event.formerIds.includes(row.eventId));
      if (!moved || rows.some((other) => other.eventId === moved.id)) continue;
      if (await store.movePost(serverId, row.eventId, moved.id)) row.eventId = moved.id;
    }
    const known = new Set(rows.map((row) => row.eventId));
    // What a feed may make (plan 8Z-2): so many posts a draw, so many in three days. The events
    // come in order of their start: the earliest get theirs first.
    let open = rows.filter((row) => countsAsOpen(row, now)).length;
    let tried = 0;
    let made = 0;
    let full = false;
    for (const event of events) {
      if (this.stopped) break;
      if (known.has(event.id) || !isPosted(event) || event.end <= now) continue;
      if (postOpensAt(event, postDaysAhead, zone) > now) continue;
      // Refused a while ago: passed over until it is asked for again, not counted among the ten.
      const refusedKey = `${serverId}:${event.id}`;
      if ((this.refusedPosts.get(refusedKey) ?? 0) > now) continue;
      if (open >= MAX_OPEN_EVENT_POSTS) {
        full = true;
        break;
      }
      if (tried >= MAX_NEW_POSTS_PER_DRAW) {
        // The rest soon, where this draw made any: where Discord refused them all, a draw a
        // minute later would only ask again, and they wait for the next draw there is.
        if (made > 0) this.morePostsDue = true;
        break;
      }
      tried += 1;
      const stage = new PostStage('make');
      let refused = false;
      const row = await this.perPost(serverId, event.id, undefined, stage, async () => {
        try {
          return await this.makePost(forum, event, zone, planned.get(event.id));
        } catch (err) {
          refused = true;
          this.tellIfPostsRefused(serverId, forum.forumId, err);
          throw err;
        }
      });
      if (refused) this.refusedPosts.set(refusedKey, now + REFUSED_POST_RETRY_MS);
      else this.refusedPosts.delete(refusedKey);
      if (row) {
        rows.push(row);
        open += 1;
        made += 1;
      }
    }
    this.tellFull(forum, full, open);
    for (const row of rows) {
      if (this.stopped) break;
      if (row.gone) continue;
      const event = byId.get(row.eventId);
      // One post Discord refuses keeps neither the others nor the listing from the draw (BR-5).
      const stage = new PostStage('edit');
      await this.perPost(serverId, row.eventId, row.postId, stage, () =>
        this.drawPost(row, event, zone, now, reopen, stage, event && planned.get(event.id)),
      );
    }
    // A dropped post is never linked (BR-1, revised ruling R2).
    return new Map(
      rows.filter((row) => !row.gone && !row.dropped).map((row) => [row.eventId, row.postId]),
    );
  }

  /**
   * Says once per server, until there is room again, that the forum has as many event posts as
   * it may (`MAX_OPEN_EVENT_POSTS`) and an event waits for its own: the feed lists far fewer, so
   * whoever runs the bot should look at what the feed lists.
   */
  private tellFull(forum: EventForumRecord, full: boolean, posts: number): void {
    const { serverId } = forum;
    if (!full) {
      this.fullTold.delete(serverId);
      return;
    }
    if (this.fullTold.has(serverId)) return;
    this.fullTold.add(serverId);
    this.options.log.warn(
      { guild: serverId, forum: forum.forumId, posts, most: MAX_OPEN_EVENT_POSTS },
      'the events forum has as many event posts as it may',
    );
  }

  /**
   * Runs one post's part of a draw (branch review BR-5): what fails is warned once per post and
   * kind of step until that step works again (re-review RR-2) (`stage`: make, edit, rename, reopen, archive, auto-archive), and the draw goes
   * on with the next post and the listing; undefined then.
   */
  private async perPost<T>(
    serverId: string,
    eventId: string,
    postId: string | undefined,
    stage: PostStage,
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    const keyOf = (kind: PostKind): string => `${serverId}:${postId ?? eventId}:${kind}`;
    try {
      const done = await work();
      // Said once until it works again (re-review RR-2): every step passed worked.
      for (const kind of stage.passed) this.postFailuresTold.delete(keyOf(kind));
      return done;
    } catch (err) {
      const key = keyOf(stage.kind);
      if (!this.postFailuresTold.has(key)) {
        this.postFailuresTold.set(key, true);
        this.options.log.warn(
          { err, guild: serverId, event: eventId, post: postId, kind: stage.kind },
          'could not update an event post',
        );
      }
      return undefined;
    }
  }

  /** Makes an event's post and records it; undefined where the forum is gone. */
  private async makePost(
    forum: EventForumRecord,
    event: ListedEvent,
    zone: string,
    planned?: EventPlannedView,
  ): Promise<EventPostRecord | undefined> {
    const { gateway, store, log } = this.options;
    const message = this.postMessage(event, zone, planned);
    const postId = await gateway.createPost(forum.forumId, {
      title: eventPostTitle(event.name),
      message,
      tagIds: [],
    });
    if (postId === undefined) return undefined;
    this.postsSent.set(postId, JSON.stringify(message));
    const row: EventPostRecord = {
      serverId: forum.serverId,
      eventId: event.id,
      postId,
      name: event.name,
      start: event.start,
      end: event.end,
      endedAt: null,
      archivedAt: null,
      dropped: false,
      gone: false,
    };
    if (!(await store.addPost(row))) {
      // Made meanwhile by another draw: this one goes again.
      log.warn({ guild: forum.serverId, event: event.id }, 'an event post was made twice');
      await gateway.deletePost(postId);
      return undefined;
    }
    log.info({ guild: forum.serverId, event: event.id, post: postId }, 'made an event post');
    return row;
  }

  /**
   * One post brought up to date with its event (`drawPosts`). With `reopen` (the hourly draw,
   * review V6, R3) a post that archived itself before its event's end is opened again.
   */
  private async drawPost(
    row: EventPostRecord,
    event: ListedEvent | undefined,
    zone: string,
    now: number,
    reopen: boolean,
    stage: PostStage,
    planned?: EventPlannedView,
  ): Promise<void> {
    const { gateway, store } = this.options;
    const { serverId, eventId } = row;
    if (row.dropped) {
      // Listed again under its id before its end (BR-1, revised ruling R2): restored, its body
      // drawn anew (the edit opens it); otherwise it stays dropped.
      if (!(row.endedAt === null && event && event.end > now)) return;
      if (!(await this.editEventPost(row, this.postMessage(event, zone, planned)))) {
        return this.postGone(row);
      }
      const restored = { dropped: false, archivedAt: null, start: event.start, end: event.end };
      Object.assign(row, restored);
      await store.updatePost(serverId, eventId, restored);
      stage.kind = 'rename';
      if (event.name !== row.name) await this.rename(row, event.name);
      return;
    }
    // Its event's end as the feed has it now: one extended after its old end is not over.
    if (row.endedAt === null && event && event.end > now) {
      const named = event.name === row.name;
      if (named && event.start === row.start && event.end === row.end) {
        const message = this.postMessage(event, zone, planned);
        // Its message may differ though its event did not (plan 8M-15, V1: a multi-day event's
        // post loses the Campfire line): brought to it, once; after a restart, which knows
        // nothing it sent, once per open post. Otherwise only the hourly draw asks Discord.
        // A post found archived with this message is not asked about again before the hourly
        // draw or another message (review R1-4: a draw comes with every read, start and end).
        const text = JSON.stringify(message);
        const differs = this.postsSent.get(row.postId) !== text;
        if (!reopen && (!differs || this.postsLeft.get(row.postId) === text)) return;
        if (reopen) stage.kind = 'reopen';
        const info = await gateway.postInfo(row.postId);
        // Deleted by hand while nothing changed (BR-3).
        if (!info) return this.postGone(row);
        // A moderator's close and lock stand (BR-4); a post that archived itself is opened only by
        // the hourly draw (V6), which draws it anew. A locked post that is open is edited, as one
        // whose event changed is.
        if (info.archived && (info.locked || !reopen)) {
          if (differs) this.postsLeft.set(row.postId, text);
          return;
        }
        this.postsLeft.delete(row.postId);
        if (!info.archived) {
          if (differs && !(await this.editEventPost(row, message))) return this.postGone(row);
          return;
        }
        // An edit opens an archived post, as everything sent or edited in it does.
        if (!(await gateway.editPost(row.postId, message))) return this.postGone(row);
        this.postsSent.set(row.postId, JSON.stringify(message));
        return;
      }
      // Only where the message would show something else than was sent (re-review W1): a
      // rename Discord keeps refusing has the rename tried again alone.
      if (!(await this.editEventPost(row, this.postMessage(event, zone, planned)))) {
        return this.postGone(row);
      }
      const drawn = { start: event.start, end: event.end };
      Object.assign(row, drawn);
      await store.updatePost(serverId, eventId, drawn);
      // A new name renames the post too (review V3); `row.name` follows only a rename done.
      stage.kind = 'rename';
      if (!named) await this.rename(row, event.name);
      return;
    }
    if (!event && row.endedAt === null && row.start > now) {
      // Dropped before its start, not moved: moved or canceled (the design). Only what the read
      // said it dropped (review V1): an event merely not listed now is left as it is.
      if (!this.options.events.droppedIds().has(eventId)) return;
      const shown: ListedEvent = {
        id: eventId,
        name: row.name,
        eventType: 'event',
        link: null,
        image: null,
        start: row.start,
        end: row.end,
        formerIds: [],
      };
      const message = eventPostMessage(shown, zone, { dropped: true });
      if (!(await this.editEventPost(row, message))) return this.postGone(row);
      stage.kind = 'archive';
      await this.archive(serverId, row.postId);
      Object.assign(row, { dropped: true, archivedAt: now });
      await store.updatePost(serverId, eventId, { dropped: true, archivedAt: now });
      return;
    }
    if (row.end > now) return;
    if (row.endedAt === null) {
      // Discord archives it after a day without messages; a member's message restarts that day.
      stage.kind = 'auto-archive';
      if (!(await gateway.setAutoArchive(row.postId, AFTER_END_ARCHIVE_MINUTES))) {
        return this.postGone(row);
      }
      row.endedAt = now;
      await store.updatePost(serverId, eventId, { endedAt: now });
    }
    if (row.archivedAt === null && now >= row.end + ARCHIVE_AFTER_END_MS) {
      stage.kind = 'archive';
      if (!(await this.archive(serverId, row.postId))) return this.postGone(row);
      row.archivedAt = now;
      await store.updatePost(serverId, eventId, { archivedAt: now });
    }
  }

  /** An event's post's message, with the trains and meetups planned during it. */
  private postMessage(event: ListedEvent, zone: string, planned: EventPlannedView | undefined) {
    return eventPostMessage(event, zone, planned === undefined ? {} : { planned });
  }

  /**
   * Renames an event's post to its event's new name (review V3), cut as titles are
   * (`eventPostTitle`): `row.name` is the new name once renamed; a wait Discord names (two renames
   * in ten minutes, a rate limit) is waited by a timer that draws again; a refused permission is
   * said once per server, and the next draw tries again.
   */
  private async rename(row: EventPostRecord, name: string): Promise<void> {
    const { gateway, store } = this.options;
    let answer: Awaited<ReturnType<PartyGateway['renamePost']>>;
    try {
      answer = await gateway.renamePost(row.postId, eventPostTitle(name));
    } catch (err) {
      const wait = rateLimitWaitMs(err);
      if (wait !== undefined) {
        this.drawLater(wait);
        return;
      }
      if (!isMissingPermission(err)) throw err;
      this.refused(row.serverId, 'rename', err);
      return;
    }
    if (answer === 'gone') return this.postGone(row);
    if (answer !== 'renamed') {
      this.drawLater(answer.laterMs);
      return;
    }
    row.name = name;
    await store.updatePost(row.serverId, row.eventId, { name });
  }

  /** A draw after `waitMs` (a rename Discord made wait), beside the other timers. */
  private drawLater(waitMs: number): void {
    if (this.stopped) return;
    const cancel = this.setTimer(
      () => {
        this.waits.delete(cancel);
        this.request();
      },
      Math.min(Math.max(waitMs, 1_000), MAX_TIMER_MS),
    );
    this.waits.add(cancel);
  }

  /**
   * Edits an event's post where `message` differs from what was last sent to it (`postsSent`;
   * after a restart, once); true where it stands, false where it is gone.
   */
  private async editEventPost(row: EventPostRecord, message: OutgoingMessage): Promise<boolean> {
    const text = JSON.stringify(message);
    if (this.postsSent.get(row.postId) === text) return true;
    if (!(await this.options.gateway.editPost(row.postId, message))) return false;
    this.postsSent.set(row.postId, text);
    return true;
  }

  /** Archives a post unlocked; a refused permission is said once per server. False when gone. */
  private async archive(serverId: string, postId: string): Promise<boolean> {
    try {
      return await this.options.gateway.archiveUnlocked(postId);
    } catch (err) {
      if (!isMissingPermission(err)) throw err;
      this.refused(serverId, 'archive', err);
      return true;
    }
  }

  /** A post a moderator deleted: marked gone, never made again, its link left out (R7). */
  private async postGone(row: EventPostRecord): Promise<void> {
    row.gone = true;
    await this.options.store.updatePost(row.serverId, row.eventId, { gone: true });
    this.options.log.info(
      { guild: row.serverId, event: row.eventId, post: row.postId },
      'an event post is gone; it is not made again',
    );
  }

  /**
   * The listing drawn: edited in place where it stands (an unchanged one not at all), pinned again
   * after each edit (an archived post opened again comes back unpinned); where its record is lost
   * or it is gone, one the bot made in the forum (open or archived, R2) is taken over, else a new
   * one is made, pinned and locked. A moderator's unlock stands.
   */
  private async drawListing(
    forum: EventForumRecord,
    events: readonly ListedEvent[],
    zone: string,
    posts: ReadonlyMap<string, string>,
    planned: ReadonlyMap<string, EventPlannedView> = new Map(),
  ): Promise<ListingOutcome> {
    const { gateway, store, log } = this.options;
    const { serverId, forumId } = forum;
    const sections = listingSections(
      events,
      this.now(),
      zone,
      this.options.servers.of(serverId).eventsForum.horizonDays,
    );
    const message = listingMessage(
      sections,
      (id) => posts.get(id),
      zone,
      (id) => planned.get(id)?.counts,
    );
    const text = JSON.stringify(message);
    const postId = forum.listingPostId;
    if (postId !== null) {
      const last = this.listingSent.get(serverId);
      if (last?.postId === postId && last.text === text) return 'ready';
      this.listingSent.delete(serverId);
      if (await this.editListing(serverId, postId, message, text)) return 'ready';
      log.warn({ guild: serverId, post: postId }, 'the events listing is gone');
    }
    const taken = await this.takeOverListing(forumId);
    if (taken !== undefined) {
      if (!(await store.setListing(serverId, forumId, taken))) return 'failed';
      log.info({ guild: serverId, post: taken }, 'took over the events listing');
      return (await this.editListing(serverId, taken, message, text)) ? 'ready' : 'failed';
    }
    const made = await gateway.createPost(forumId, { title: EVENTS_TITLE, message, tagIds: [] });
    if (made === undefined) return 'failed';
    await this.pin(serverId, made);
    try {
      await gateway.lockPost(made);
    } catch (err) {
      if (!isMissingPermission(err)) throw err;
      this.refused(serverId, 'lock', err);
    }
    if (!(await store.setListing(serverId, forumId, made))) {
      log.warn({ guild: serverId, post: made }, 'the events forum changed meanwhile');
      return 'failed';
    }
    this.listingSent.set(serverId, { postId: made, text });
    log.info({ guild: serverId, post: made }, 'made the events listing');
    return 'made';
  }

  /** Edits the listing and pins it again where it is not; false when it is gone. */
  private async editListing(
    serverId: string,
    postId: string,
    message: OutgoingMessage,
    text: string,
  ): Promise<boolean> {
    if (!(await this.options.gateway.editPost(postId, message))) return false;
    const info = await this.options.gateway.postInfo(postId);
    if (info && !info.pinned) await this.pin(serverId, postId);
    this.listingSent.set(serverId, { postId, text });
    return true;
  }

  /**
   * Pins a post; a refusal is logged once per server (a moderator can pin it), and the server's
   * staff are told at every refusal (fix round 2, G2: `ServerNotices` says it once).
   */
  private async pin(serverId: string, postId: string): Promise<void> {
    try {
      await this.options.gateway.pinPost(postId);
    } catch (err) {
      // Whatever it is (Manage Posts refused, another post holding the forum's one pin, 30047):
      // logged once per server, and the lock, the record and the draw carry on (review V4).
      const key = `${serverId}:pin`;
      if (!this.refusedTold.has(key)) {
        this.refusedTold.add(key);
        this.options.log.warn(
          { err, guild: serverId, post: postId },
          'could not pin the events listing',
        );
      }
      const forumId = this.options.servers.of(serverId).channels.events;
      if (forumId !== undefined) {
        this.options.notices.tell(
          serverId,
          'events-forum:pin',
          eventsListingUnpinnedWords(forumId),
        );
      }
    }
  }

  /**
   * Says that Discord refused the bot a permission: in the log once per server and what, to the
   * server's staff at every refusal (fix round 2, G2: `ServerNotices` says it once).
   */
  private refused(serverId: string, what: 'lock' | 'archive' | 'rename', err: unknown): void {
    const key = `${serverId}:${what}`;
    if (!this.refusedTold.has(key)) {
      this.refusedTold.add(key);
      this.options.log.warn(
        { err, guild: serverId, what },
        'the bot may not do this in the events forum (Manage Posts)',
      );
    }
    // One notice for the three: each needs Manage Posts (plan 19B-1).
    const forumId = this.options.servers.of(serverId).channels.events;
    if (forumId !== undefined) {
      this.options.notices.tell(
        serverId,
        'events-forum:manage-posts',
        eventsForumRefusedWords(forumId),
      );
    }
  }

  /**
   * Tells the server's staff that the bot may not make posts in the events forum (plan 19B-1),
   * where Discord refused a post for a permission (`PostsRefusedError`, a missing permission or
   * access): they must give it. Any other refusal (AutoMod, an outage) is only logged, as it is.
   */
  private tellIfPostsRefused(serverId: string, forumId: string, err: unknown): void {
    const missing =
      err instanceof PostsRefusedError ? err.missing : isMissingPermission(err) ? [] : undefined;
    if (missing === undefined) return;
    this.options.notices.tell(
      serverId,
      'events-forum:cannot-post',
      eventsForumCannotPostWords(forumId, missing),
    );
  }

  /**
   * A listing the bot made in the forum, where the record lost it: the pinned one among the open
   * posts, else the oldest open one, else the latest archived one (R2: a second listing beside an
   * archived first would not get the forum's one pin). Undefined for none.
   */
  private async takeOverListing(forumId: string): Promise<string | undefined> {
    const { gateway } = this.options;
    let oldest: string | undefined;
    for (const postId of (await gateway.openPosts(forumId)) ?? []) {
      const info = await gateway.postInfo(postId);
      if (info?.title !== EVENTS_TITLE) continue;
      if (info.pinned) return postId;
      oldest ??= postId;
    }
    if (oldest !== undefined) return oldest;
    for (const postId of (await gateway.archivedPosts(forumId)) ?? []) {
      if ((await gateway.postInfo(postId))?.title === EVENTS_TITLE) return postId;
    }
    return undefined;
  }

  /**
   * The one timer of the next change among the listed events (a start, an end, a post's opening,
   * the end of a counted train or meetup), set anew at each draw, a second after it, so that Now
   * never goes stale (R10).
   */
  private setNextTimer(): void {
    this.cancelNext?.();
    this.cancelNext = undefined;
    if (this.stopped) return;
    const { servers } = this.options;
    const now = this.now();
    // The numbers and the zone of every server drawn (plan 19A-1: each its own; plan 19A-2: its
    // zone), each triple once.
    const drawn = this.drawnServers.map((serverId) => ({
      ...servers.of(serverId).eventsForum,
      zone: servers.zoneOf(serverId),
    }));
    const numbers = [
      ...new Map(
        drawn.map(({ horizonDays, postDaysAhead, zone }) => [
          `${String(horizonDays)}:${String(postDaysAhead)}:${zone}`,
          { horizonDays, postDaysAhead, zone },
        ]),
      ).values(),
    ];
    const times = numbers
      .flatMap(({ horizonDays, postDaysAhead, zone }) =>
        this.options.events.listedEvents(zone).flatMap((event) => [
          // Every move of its line between sections (BR-9), and its post's opening.
          ...sectionChangesAt(event, horizonDays, zone),
          ...(isPosted(event) ? [postOpensAt(event, postDaysAhead, zone)] : []),
        ]),
      )
      .filter((time) => time > now);
    // A counted train or meetup over by the clock leaves its event's count (review EP-5).
    times.push(...this.plannedEnds.filter((time) => time > now));
    // The next 10:00 of "On this day" (plan 8H-8), on the clock of each server drawn that posts
    // its days, not of the triples above (review F12): two servers of one triple may differ in it.
    if (this.options.days !== undefined) {
      const zones = new Set(drawn.filter((one) => one.onThisDay > 0).map((one) => one.zone));
      for (const zone of zones) times.push(nextOnThisDayAt(now, zone));
    }
    if (times.length === 0) return;
    const next = Math.min(...times);
    this.cancelNext = this.setTimer(
      () => {
        this.cancelNext = undefined;
        this.request();
      },
      Math.min(next - now + 1_000, MAX_TIMER_MS),
    );
  }
}
