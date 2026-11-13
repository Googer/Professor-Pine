import { createHash } from 'node:crypto';
import { containment } from '@pine/wayspot-core/region-membership';
import type { StopPostRecord, StopPostStorage } from '../db/repositories/stop-post-repository.js';
import {
  isMissingPermission,
  isRefusedBody,
  type OutgoingMessage,
  type PartyGateway,
} from '../discord/party-gateway.js';
import {
  isResearchReport,
  isRocketReport,
  type ReportedStop,
  type ResearchReport,
  type RocketReport,
} from '../domain/stops/report.js';
import { localDay } from '../domain/time/local-day.js';
import { nextPeriodChange } from '../domain/time/research-periods.js';
import { taskOfSubject, type ResearchSubjectKey } from '../domain/research/reports.js';
import { isEventCategory } from '../domain/research/task.js';
import { versionValue } from '../domain/research/versions.js';
import type { Logger } from '../log.js';
import {
  postPictures,
  stopPostMessages,
  stopPostText,
  type PostLayout,
  type PostHideout,
  type PostTask,
  type PostVersion,
  type StopPostView,
} from '../render/stop-post.js';
import type { Region } from '../db/repositories/region-repository.js';
import { boardThreadOf } from '../domain/regions/board.js';
import { dayWords, zoned } from '../domain/time/zoned.js';
import { periodEndWords } from '../render/research.js';
import type { StopsLine } from '../render/summary.js';
import { Gathered } from './gathered.js';
import { KeyedLock } from './keyed-lock.js';
import { isNetworkError } from './network-error.js';
import type { ResearchEventProvider } from './raid-event-service.js';
import type { PictureMaker } from './stop-pictures.js';
import { isHideoutReport, type StopReportService } from './stop-reports.js';

/** How long after the last change of a channel's reports its post is drawn (design 6). */
export const POST_DELAY_MS = 3_000;

/**
 * Where a message of the post is (plan 8R-9, B1): the board post (a thread) and the message in
 * it. A link to it is `https://discord.com/channels/<server>/<channelId>/<messageId>`.
 */
export interface PostLink {
  channelId: string;
  messageId: string;
}

/** The longest delay `setTimeout` accepts. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export interface StopPostServiceOptions {
  storage: StopPostStorage;
  /** The reports, and the version of each (`versionOf`, review R2), by which the post groups. */
  reports: Pick<StopReportService, 'standing' | 'period' | 'listen' | 'versionOf' | 'linksChanged'>;
  events: ResearchEventProvider;
  regions: { all(): readonly Region[] };
  /**
   * The row of a server in `Guild` (its regions name it so), by its snowflake, and the snowflake
   * by the row (a board made for a region with no post yet, plan 8R-9).
   */
  guilds: {
    idFor(serverId: string): Promise<number | undefined>;
    snowflakeOf(id: number): Promise<string | undefined>;
  };
  gateway: Pick<
    PartyGateway,
    'sendMessage' | 'editMessage' | 'deleteMessage' | 'unpinMessage' | 'postAccess'
  >;
  /** `settings.timezone`: the local day and its midnight. */
  zone: string;
  log: Logger;
  now?: () => number;
  delayMs?: number;
  /**
   * Told after a channel's post was drawn or deleted (plan 8X-G): the region's summary links the
   * post with its counts (`summaryOf`), and is drawn anew (`PartyService.summaryChanged`; one
   * that would be the same is not edited).
   */
  changed?: (channelId: string) => void;
  /**
   * The square pictures (plan 8R-6, `StopPictures`): made before a post is drawn, and named by
   * their address. Without it the post names the feeds' addresses.
   */
  pictures?: PictureMaker;
}

/**
 * The post "Today’s Stops" of every region channel (plan 8R-1; design 6, 9.5–9.7, 9.11): the
 * research of the period on, then the day's Team GO Rocket hideouts (plan 8R-2; a grunt has a
 * message of its own and is not shown here); made at the first report of the day in the region
 * (research or hideout), in the region's board (plan 8R-9: its summary post, the thread of
 * `Region.summaryMessageId`), below the summary, sent without notifying anybody (B13); drawn
 * anew a few seconds after the reports change (`POST_DELAY_MS`, coalesced), spilling into a
 * second and third message as it grows, and deleted once its day has ended. One queue per
 * channel does all of it, the midnight delete included; nothing is sent to Discord while a
 * database lock is held (the reads are done first). A timer at the next period change (midnight,
 * an event's start or end: `nextPeriodChange`, with Temporal in `settings.timezone`) draws the
 * posts anew and deletes those of a day that ended; `start` does the same for what a restart
 * left. Where the bot may not embed in the board's forum the post is plain text, as
 * `spawnTextMessage`; where it may not write there at all (`postAccess`, B6), or the region has
 * no board (B10), nothing is drawn and that is said once. Rehearsal mode makes none: the bot
 * does not start it.
 */
export class StopPostService {
  private readonly now: () => number;
  private readonly queue = new KeyedLock<string>();
  private readonly gathered: Gathered<string>;
  /** The posts kept, by channel (one a day each; an older day's until it is deleted). */
  private readonly posts = new Map<string, StopPostRecord>();
  /**
   * How many tasks and hideouts each channel's post shows, as last drawn (plan 8X-G), and the
   * day's research waiting under an event's window with when it comes back (plan 8R-6).
   */
  private readonly counts = new Map<string, Omit<StopsLine, 'url'>>();
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  /** Which message of a channel's post holds each task (by its subject), as last drawn. */
  private readonly holding = new Map<string, Map<string, string>>();
  /**
   * What each message of a post was last drawn as (a hash of its payload, and whether it is
   * components v2), by message id: a redraw that would show the same makes no edit (review F2),
   * and a change of kind sends it anew (F3). Forgotten with the message.
   */
  private readonly drawn = new Map<string, { hash: string; v2: boolean }>();
  /** The changes on their way to the queue (their server's regions being looked up). */
  private readonly asking = new Set<Promise<void>>();
  /** The redraws of every post a change of the research events started (`flush` waits). */
  private readonly redraws = new Set<Promise<void>>();
  /**
   * Channels whose post could not be drawn for want of a board (B10) or of the permissions to
   * write in it (B6), said once each in the log until it is drawn again.
   */
  private readonly undrawnTold = new Map<string, 'no-board' | 'refused'>();
  /**
   * Posts of ended days whose delete failed (review P1), by `<channel> <day>`: their rows stay,
   * and the channel's next draw (review W2) or the next turn-over (the timer, the catch-up)
   * deletes them again.
   */
  private readonly leftovers = new Map<string, StopPostRecord>();
  /** Channels where Discord refused a delete for good (review R1), said once each. */
  private readonly deleteRefusalsTold = new Set<string>();
  /** Who hears of a post drawn in full (`onDrawn`, plan 8R-9F, M2). */
  private readonly drawnListeners: ((channelId: string) => void)[] = [];

  constructor(private readonly options: StopPostServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.gathered = new Gathered({
      delayMs: options.delayMs ?? POST_DELAY_MS,
      send: (channelId, serverId) =>
        this.queue.run(channelId, () => this.draw(channelId, serverId)),
      fold: (_older, newer) => newer,
      onError: (err, channelId) => {
        options.log.warn({ err, channel: channelId }, 'could not draw the post of the stops');
      },
    });
    options.reports.listen({
      changed: (serverId, stops) => {
        this.ask(this.changed(serverId, stops));
      },
    });
    // Another event, or one moved or gone (review A5): the timer and every post follow.
    options.events.onResearchChange?.(() => {
      if (this.closed) return;
      // In a set of its own (review R2): what waits for one channel never waits for the
      // redraw of all of them.
      const redraw = this.turnOver()
        .catch((err: unknown) => {
          options.log.warn({ err }, 'could not draw the posts of the stops anew');
        })
        .finally(() => this.redraws.delete(redraw));
      this.redraws.add(redraw);
    });
  }

  /** Keeps a change on its way to the queue, for `messageOf` and `flush` to wait for. */
  private ask(asking: Promise<void>): void {
    const kept = asking.finally(() => this.asking.delete(kept));
    this.asking.add(kept);
  }

  /** The local day of a moment, `yyyy-mm-dd`. */
  private dayOf(time: number): string {
    return localDay(time, this.options.zone);
  }

  /**
   * The reports of a server changed at these stops: the posts of the region channels they lie in
   * are drawn anew, and no other (review F2: a report in one region edits no other's post).
   */
  async changed(serverId: string, stops: readonly ReportedStop[]): Promise<void> {
    if (this.closed) return;
    try {
      const row = await this.options.guilds.idFor(serverId);
      for (const region of this.options.regions.all()) {
        if (row === undefined || region.guildId !== row || region.bounds === null) continue;
        if (!stops.some(containment(region.bounds))) continue;
        this.gathered.later(region.channelId, () => serverId);
      }
    } catch (err) {
      this.options.log.warn({ err, guild: serverId }, 'could not find the posts of the stops');
    }
  }

  /**
   * Tells `listener` of each channel whose post was drawn in full in its board, every message
   * there (plan 8R-9F, M2: the lines of new reports that found no message wait for it); never of
   * a draw whose send failed (a board gone).
   */
  onDrawn(listener: (channelId: string) => void): void {
    this.drawnListeners.push(listener);
  }

  /**
   * The region of this channel has another board post, or one at last (plan 8R-9, B2: the party
   * service made its summary, or took one over): its post is drawn anew there, every message
   * sent again where the board changed; a region with nothing reported today gets none.
   */
  boardChanged(channelId: string): void {
    if (this.closed) return;
    this.ask(
      (async () => {
        const serverId = await this.serverOf(channelId);
        if (serverId !== undefined) this.gathered.later(channelId, () => serverId);
      })().catch((err: unknown) => {
        this.options.log.warn({ err, channel: channelId }, 'could not find the post of the stops');
      }),
    );
  }

  /** The server of a region channel: its kept post's, else its region's by the row. */
  private async serverOf(channelId: string): Promise<string | undefined> {
    const kept = this.posts.get(channelId);
    if (kept) return kept.serverId;
    const region = this.options.regions.all().find((one) => one.channelId === channelId);
    if (region?.guildId === null || region?.guildId === undefined) return undefined;
    return this.options.guilds.snowflakeOf(region.guildId);
  }

  /**
   * At start: the kept posts read, every one drawn as things stand now (a day that has ended
   * deleted, today's made where reports stand); then the timer of the next period change, which
   * is set also when the kept posts cannot be read (review A5).
   */
  async start(): Promise<void> {
    let rows: StopPostRecord[];
    try {
      rows = await this.options.storage.all();
    } catch (err) {
      this.schedule();
      throw err;
    }
    // The last of each channel (they come by day); a channel a report has drawn meanwhile
    // keeps what it drew (review F6).
    const read = new Map<string, StopPostRecord>();
    for (const post of rows.map(fromStorage)) read.set(post.channelId, post);
    for (const [channelId, post] of read) this.posts.getOrInsert(channelId, post);
    // A post older than its channel's newest (one whose delete failed at its midnight, or one
    // the bot before plan 8R-9 pinned in the channel, B11) is deleted now, or its messages would
    // stand for good (review G3).
    const older = rows.map(fromStorage).filter((post) => {
      const newest = this.posts.get(post.channelId);
      return newest !== undefined && post.day < newest.day;
    });
    await Promise.all(
      older.map((post) =>
        this.queue
          .run(post.channelId, () => this.remove(post))
          .catch((err: unknown) => {
            this.options.log.warn(
              { err, channel: post.channelId },
              'could not delete the post of the stops',
            );
          }),
      ),
    );
    await this.turnOver();
  }

  /**
   * Draws every kept post as things stand now (review A2: `draw` deletes the post of a day that
   * ended and makes today's where reports stand, none where nothing does), and the regions told
   * as undrawn (review P6: no board, or no right to write in it, then); deletes again the posts of
   * ended days whose delete failed (review P1); and waits for the next change.
   */
  private async turnOver(): Promise<void> {
    try {
      const undrawn = [...this.undrawnTold.keys()].filter(
        (channelId) => !this.posts.has(channelId),
      );
      await Promise.all([
        ...[...this.posts.values()].map((post) =>
          this.queue.run(post.channelId, () => this.draw(post.channelId, post.serverId)),
        ),
        ...[...this.leftovers.values()].map((post) =>
          this.queue.run(post.channelId, async () => {
            await this.remove(post);
          }),
        ),
        ...undrawn.map(async (channelId) => {
          const serverId = await this.serverOf(channelId);
          if (serverId !== undefined) {
            await this.queue.run(channelId, () => this.draw(channelId, serverId));
          }
        }),
      ]);
    } finally {
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    const now = this.now();
    const next = nextPeriodChange(
      this.options.events.researchEvents(this.options.zone),
      now,
      this.options.zone,
    );
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.turnOver().catch((err: unknown) => {
          // The network away is a warning (plan 8X-H, review F5: the catch-up draws the posts
          // anew once the gateway is back); anything else needs a person.
          if (isNetworkError(err)) {
            this.options.log.warn({ err }, 'could not turn the posts of the stops over');
          } else {
            this.options.log.error({ err }, 'could not turn the posts of the stops over');
          }
          this.schedule();
        });
      },
      // A moment after the change: the period after it is the one drawn.
      Math.min(Math.max(1_000, next - now + 1_000), MAX_TIMER_MS),
    );
    this.timer.unref();
  }

  /** The view of a channel's post: the reports of the period on now whose stop lies in its region. */
  private async view(region: Region, serverId: string): Promise<StopPostView | undefined> {
    if (!region.bounds) return undefined;
    const inside = containment(region.bounds);
    const now = this.now();
    const period = this.options.reports.period(now);
    const standing = (await this.options.reports.standing(serverId)).filter((report) =>
      inside(report.stop),
    );
    const here = standing.filter(isResearchReport);
    const shown = here.filter((report) => report.periodKey === period.key);
    const waiting = here.filter((report) => report.periodKey === period.waiting?.key);
    // Hideouts belong to the day, whatever research period is on (plan 8R-2).
    const hideouts = standing.filter(isRocketReport).filter(isHideoutReport);
    return {
      day: dayWords(zoned(now, this.options.zone)),
      tasks: grouped(shown, (report) => this.options.reports.versionOf(report)),
      hideouts: hideoutsOf(hideouts),
      event: period.event?.name,
      until: period.kind === 'day' ? undefined : periodEndWords(period.end, now, this.options.zone),
      // The day's research under an event's window stays, below the window's (plan 8R-6).
      waiting:
        period.waiting && waiting.length > 0
          ? {
              at: period.waiting.at,
              tasks: grouped(waiting, (report) => this.options.reports.versionOf(report)),
            }
          : undefined,
    };
  }

  /**
   * The post is not drawn (B6, B10): what the summary and the links read of it is forgotten, and
   * why is said once in the log while it lasts.
   */
  private undrawn(channelId: string, why: 'no-board' | 'refused', threadId?: string): void {
    const shown = this.counts.delete(channelId) || this.holding.delete(channelId);
    this.holding.delete(channelId);
    if (shown) this.options.changed?.(channelId);
    if (this.undrawnTold.get(channelId) === why) return;
    this.undrawnTold.set(channelId, why);
    if (why === 'no-board') {
      this.options.log.warn({ channel: channelId }, 'the region has no board post');
    } else {
      this.options.log.warn(
        { channel: channelId, post: threadId },
        'the bot may not write in the board post',
      );
    }
  }

  /** Draws a channel's post as its reports are now; in the channel's queue. */
  private async draw(channelId: string, serverId: string): Promise<void> {
    const { gateway, storage, log } = this.options;
    const day = this.dayOf(this.now());
    await this.retryLeftovers(channelId, day);
    let kept = this.posts.get(channelId) ?? (await this.recall(channelId, day));
    // A post of a day that ended goes (its row stays where a delete failed, review P1).
    if (kept && kept.day !== day) {
      await this.remove(kept);
      kept = undefined;
    }
    // The messages of a post the bot before plan 8R-9 pinned in the region's channel (B11), and
    // those whose delete failed before (P1): deleted now, those that fail again kept with the post.
    const held = kept?.leftover ?? [];
    const leftover = held.length === 0 ? [] : await this.clear(channelId, held);
    // A row of such messages alone (no board post drawn yet) is no post.
    if (kept?.threadId === null) kept = undefined;
    const region = this.options.regions.all().find((one) => one.channelId === channelId);
    const view = region ? await this.view(region, serverId) : undefined;
    // Nothing reported and no post yet: none is made (design 6: at the first report, research or
    // hideout).
    const empty =
      view === undefined ||
      (view.tasks.length === 0 &&
        (view.hideouts ?? []).length === 0 &&
        (view.waiting?.tasks ?? []).length === 0);
    const threadId = region === undefined ? null : boardThreadOf(region);
    const access = threadId === null ? undefined : await gateway.postAccess(threadId);
    if (!view || (!kept && empty) || threadId === null || access === 'refused') {
      await this.keepLeftover(channelId, day, serverId, held, leftover);
      if (!view || (!kept && empty)) return;
      if (threadId === null) this.undrawn(channelId, 'no-board');
      else this.undrawn(channelId, 'refused', threadId);
      return;
    }
    this.undrawnTold.delete(channelId);
    const { pictures } = this.options;
    let layout: PostLayout<OutgoingMessage>;
    // A board replaced or taken over (B2): the old one's messages go first (review P5: a post
    // taken over must not keep a second copy; a thread that is gone is fine).
    if (kept?.threadId && kept.threadId !== threadId) {
      // Never opened for it (review R2): an archived old board refuses the delete (50083), which
      // is logged and accepted, so that no old board is left open.
      await this.deleteAll(kept.threadId, kept.messageIds, false);
    }
    if (access === 'v2') {
      // The pictures made first (plan 8R-6): one not ready names the feed's address till the next.
      // Both laid out with the same lookup: a source gone frees its place for the next picture.
      const lookup = pictures ? (source: string) => pictures.url(source) : undefined;
      await pictures?.prepare(postPictures(view, lookup));
      layout = stopPostMessages(view, lookup);
    } else {
      layout = stopPostText(view);
    }
    const { messages } = layout;
    const ids: string[] = [];
    // Another board than the one drawn in (B2: the summary replaced or taken over): every
    // message is sent anew there; the old ones went with their thread, or stay in a post that is
    // no longer the region's.
    const before = kept?.threadId === threadId ? kept.messageIds : [];
    // Set once a message is sent anew in its place: those after it are deleted, and sent anew
    // below it (B5: a message sent lands last, below any a moderator kept, plan 8R-9F).
    let anew = false;
    // Whether every message is there (M2): a send that found no thread leaves it false.
    let complete = true;
    // The messages drawn so far, then those of the post not reached yet.
    const sofar = (): StopPostRecord => ({
      channelId,
      day,
      serverId,
      threadId,
      messageIds: anew ? [...ids] : [...ids, ...before.slice(ids.length)],
      leftover,
      updatedAt: this.now(),
    });
    try {
      for (const [index, message] of messages.entries()) {
        const id = anew ? undefined : before[index];
        const drawn = id === undefined ? undefined : this.drawn.get(id);
        const now = { hash: payloadHash(message), v2: message.v2 === true };
        if (id !== undefined && drawn?.hash === now.hash) {
          ids.push(id);
          continue;
        }
        if (id !== undefined && (await this.edit(threadId, id, message, drawn))) {
          this.drawn.set(id, now);
          ids.push(id);
          continue;
        }
        if (id !== undefined) {
          this.drawn.delete(id);
          anew = true;
          await this.deleteAll(threadId, before.slice(index + 1));
        }
        const sent = await gateway.sendMessage(threadId, message, { silent: true, reopen: true });
        if (sent === undefined) {
          log.warn(
            { channel: channelId, post: threadId },
            'the post of the stops could not be sent',
          );
          complete = false;
          break;
        }
        this.drawn.set(sent, now);
        ids.push(sent);
        // Kept at once (review A9): a message sent is never lost to the storage.
        await storage.save(sofar());
      }
    } catch (err) {
      // An edit Discord failed (review F3): the post stands as it is, with what was sent, and
      // the next change draws it again.
      this.posts.set(channelId, sofar());
      await storage.save(sofar()).catch(() => undefined);
      throw err;
    }
    if (!anew) await this.deleteAll(threadId, before.slice(ids.length));
    const record: StopPostRecord = {
      channelId,
      day,
      serverId,
      threadId,
      messageIds: ids,
      leftover,
      updatedAt: this.now(),
    };
    this.posts.set(channelId, record);
    this.counts.set(channelId, {
      tasks: view.tasks.length,
      // As the post counts them: one per leader (or decoy) shown, whatever its stops (r0 C2).
      hideouts: (view.hideouts ?? []).length,
      // The day's research below an event's window, named apart in the summary (plan 8R-6).
      waiting: view.waiting && { tasks: view.waiting.tasks.length, at: view.waiting.at },
    });
    this.holding.set(
      channelId,
      new Map(
        [...layout.placement].flatMap(([key, index]): [string, string][] => {
          const id = ids[index];
          return id === undefined ? [] : [[key, id]];
        }),
      ),
    );
    await storage.save(record);
    this.options.changed?.(channelId);
    // The links of the map's reports read what was just drawn (`linkOf`).
    this.options.reports.linksChanged(serverId);
    if (complete) for (const listener of this.drawnListeners) listener(channelId);
  }

  /**
   * The channel's posts of ended days whose delete failed (`leftovers`), deleted again at its next
   * draw (review W2: not only at the next turn-over or catch-up, which may be a day away); in its
   * queue. A failure is logged, and the draw goes on.
   */
  private async retryLeftovers(channelId: string, day: string): Promise<void> {
    const mine = [...this.leftovers.values()].filter(
      (post) => post.channelId === channelId && post.day !== day,
    );
    for (const post of mine) {
      await this.remove(post).catch((err: unknown) => {
        this.options.log.warn(
          { err, channel: channelId },
          'could not delete the post of the stops',
        );
      });
    }
  }

  /** Deletes messages of the post that are not drawn any more; a failure is logged. */
  private async deleteAll(
    threadId: string,
    messageIds: readonly string[],
    reopen = true,
  ): Promise<void> {
    for (const id of messageIds) {
      this.drawn.delete(id);
      await this.options.gateway.deleteMessage(threadId, id, { reopen }).catch((err: unknown) => {
        this.options.log.warn(
          { err, post: threadId },
          'could not delete a message of the post of the stops',
        );
      });
    }
  }

  /**
   * What the summary of the channel's region shows of its post (plan 8X-G): the server, the board
   * post and its first message of the stops (the link, plan 8R-9), and how many tasks and
   * hideouts it shows, as last drawn, with the day's research waiting under an event's window
   * and when it comes back (plan 8R-6); undefined where the channel has no post of today drawn
   * since the start.
   */
  summaryOf(
    channelId: string,
  ):
    | ({ serverId: string; threadId: string; messageId: string } & Omit<StopsLine, 'url'>)
    | undefined {
    const post = this.posts.get(channelId);
    const counts = this.counts.get(channelId);
    const [messageId] = post?.messageIds ?? [];
    if (
      !post ||
      !counts ||
      post.threadId === null ||
      messageId === undefined ||
      post.day !== this.dayOf(this.now())
    ) {
      return undefined;
    }
    return { serverId: post.serverId, threadId: post.threadId, messageId, ...counts };
  }

  /**
   * A channel's kept post read from storage, for a channel that has none in memory (review F6:
   * a report drawn before `start` has read the kept posts, or after it failed to, edits the post
   * a restart left instead of making a second one): the posts of days that ended are deleted,
   * today's is kept in memory and given. Throws what reading throws, so nothing is drawn then.
   */
  private async recall(channelId: string, day: string): Promise<StopPostRecord | undefined> {
    const rows = (await this.options.storage.all())
      .map(fromStorage)
      .filter((row) => row.channelId === channelId);
    for (const row of rows) if (row.day !== day) await this.remove(row);
    const today = rows.find((row) => row.day === day);
    if (today) this.posts.set(channelId, today);
    return today;
  }

  /**
   * Edits a message of the post; false when it is gone, or when it changes kind (components v2
   * to plain text, or back: Discord makes no v2 message plain), when it is deleted to be sent
   * anew (review F3). Any other failure is thrown: the post stands, and the next change draws
   * it again. A message not drawn since the start (`drawn` unknown: its kind is not known) is
   * deleted and sent anew when Discord refuses its edit for what it holds (`isRefusedBody`: a
   * v2 message made plain), and only then (review G1).
   */
  private async edit(
    threadId: string,
    messageId: string,
    message: OutgoingMessage,
    drawn: { v2: boolean } | undefined,
  ): Promise<boolean> {
    const { gateway, log } = this.options;
    if (drawn !== undefined && drawn.v2 !== (message.v2 === true)) {
      await gateway.deleteMessage(threadId, messageId, { reopen: true }).catch(() => undefined);
      return false;
    }
    try {
      // In the region's board: its reactions are removed (plan 8R-9G).
      return await gateway.editMessage(threadId, messageId, message, { clearReactions: true });
    } catch (err) {
      if (drawn !== undefined || !isRefusedBody(err)) throw err;
      log.warn({ err, post: threadId }, 'the post of the stops is sent anew');
      await gateway.deleteMessage(threadId, messageId, { reopen: true }).catch(() => undefined);
      return false;
    }
  }

  /**
   * Deletes a post of a day that ended (its messages in the board, and any left in the region's
   * channel by the bot before plan 8R-9, unpinned first: B11), and forgets it once every delete
   * resolved (a message gone counts); where one fails its row stays with what is left (review P1)
   * and the channel's next draw or the next turn-over deletes it again. In its channel's queue. True when it is gone.
   */
  private async remove(post: StopPostRecord): Promise<boolean> {
    const { gateway, storage, log } = this.options;
    const key = `${post.channelId} ${post.day}`;
    const failed: string[] = [];
    for (const id of post.messageIds) {
      this.drawn.delete(id);
      if (post.threadId === null) continue;
      try {
        await gateway.deleteMessage(post.threadId, id, { reopen: true });
      } catch (err) {
        if (this.refusedForGood(err, post.channelId)) continue;
        log.warn({ err, channel: post.channelId }, 'could not delete the post of the stops');
        failed.push(id);
      }
    }
    const leftover = await this.clear(post.channelId, post.leftover);
    if (this.posts.get(post.channelId) === post) {
      this.posts.delete(post.channelId);
      this.holding.delete(post.channelId);
      this.counts.delete(post.channelId);
    }
    if (failed.length > 0 || leftover.length > 0) {
      const kept = { ...post, messageIds: failed, leftover, updatedAt: this.now() };
      this.leftovers.set(key, kept);
      await storage.save(kept);
      return false;
    }
    this.leftovers.delete(key);
    await storage.remove(post.channelId, post.day);
    this.options.changed?.(post.channelId);
    return true;
  }

  /**
   * Unpins and deletes messages the bot before plan 8R-9 pinned in a region's channel (B11), or
   * whose delete failed before (P1); gives those whose delete failed again.
   */
  private async clear(channelId: string, messageIds: readonly string[]): Promise<string[]> {
    const { gateway, log } = this.options;
    const failed: string[] = [];
    for (const id of messageIds) {
      await gateway.unpinMessage(channelId, id).catch(() => false);
      try {
        await gateway.deleteMessage(channelId, id);
      } catch (err) {
        if (this.refusedForGood(err, channelId)) continue;
        log.warn({ err, channel: channelId }, 'could not delete the post of the stops');
        failed.push(id);
      }
    }
    return failed;
  }

  /**
   * Whether Discord refused a delete for good (review R1: Missing Access or Missing Permissions,
   * 50001 or 50013): the message is forgotten, as trying again would meet the same refusal, and
   * that is said once per channel while the bot runs.
   */
  private refusedForGood(err: unknown, channelId: string): boolean {
    if (!isMissingPermission(err)) return false;
    if (!this.deleteRefusalsTold.has(channelId)) {
      this.deleteRefusalsTold.add(channelId);
      this.options.log.warn(
        { err, channel: channelId },
        'the bot may not delete a message of the post of the stops',
      );
    }
    return true;
  }

  /**
   * Where no post is drawn: the messages of the region's channel still to delete are kept in a
   * row of their own (P1), forgotten once none are left.
   */
  private async keepLeftover(
    channelId: string,
    day: string,
    serverId: string,
    held: readonly string[],
    leftover: string[],
  ): Promise<void> {
    if (held.length === 0) return;
    const kept = this.posts.get(channelId);
    if (kept && kept.threadId !== null) {
      // A board post of today stands: what is left goes with it.
      const record = { ...kept, leftover, updatedAt: this.now() };
      this.posts.set(channelId, record);
      await this.options.storage.save(record);
      return;
    }
    if (leftover.length === 0) {
      this.posts.delete(channelId);
      await this.options.storage.remove(channelId, day);
      return;
    }
    const record: StopPostRecord = {
      channelId,
      day,
      serverId,
      threadId: null,
      messageIds: [],
      leftover,
      updatedAt: this.now(),
    };
    this.posts.set(channelId, record);
    await this.options.storage.save(record);
  }

  /**
   * The message of a channel's post that holds a task, in its board post, once what waits is
   * drawn (a DM of the task links to it: design 9.7; plan 8R-9, B1); undefined where no post
   * holds it.
   */
  async messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined> {
    // Only this channel is drawn at once; the others keep their delay.
    await Promise.all(this.asking);
    await this.gathered.flushKey(channelId);
    await this.queue.run(channelId, () => Promise.resolve());
    // Else the post's first message, for a task only counted (review P9, as `linkOf`).
    return this.linkOf(channelId, subjectKey);
  }

  /**
   * The message of a channel's post that holds a task or a hideout as the post was last drawn,
   * else its first message (one counted only, "…and N more"), in its board post (B1); undefined
   * where the channel has no post of today drawn (past midnight, before the posts are drawn
   * anew, yesterday's is none). Read only (plan 8R-3: the map asks on every poll): unlike
   * `messageOf` it draws nothing and waits for nothing, so a change still gathering shows at the
   * next poll.
   */
  linkOf(channelId: string, subjectKey: string): PostLink | undefined {
    const held = this.holding.get(channelId);
    const post = this.posts.get(channelId);
    if (held === undefined || post?.day !== this.dayOf(this.now()) || post.threadId === null) {
      return undefined;
    }
    const messageId = held.get(subjectKey) ?? post.messageIds[0];
    return messageId === undefined ? undefined : { channelId: post.threadId, messageId };
  }

  /** Draws what waits now, and waits for every draw. For tests and shutdown. */
  async flush(): Promise<void> {
    await Promise.all(this.redraws);
    await Promise.all(this.asking);
    await this.gathered.flush();
    await this.queue.whenIdle();
  }

  /**
   * The gateway is back after a real disconnect (plan 8X-H, review R5): every kept post is drawn
   * as things stand now (a draw that failed meanwhile, such as the turn-over at midnight, waited
   * for the next change of period before); one that would show the same makes no edit. Nothing
   * after `close`.
   */
  async catchUp(): Promise<void> {
    if (this.closed) return;
    await this.turnOver();
  }

  /** Stops the timer; what waits is drawn first. */
  async close(): Promise<void> {
    await this.flush();
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

/**
 * A kept row as the service reads it: a post the bot before plan 8R-9 pinned in the region's
 * channel (no board post, B11) is messages of that channel still to delete, as `leftover`.
 */
function fromStorage(row: StopPostRecord): StopPostRecord {
  if (row.threadId !== null || row.messageIds.length === 0) return row;
  return { ...row, messageIds: [], leftover: [...row.leftover, ...row.messageIds] };
}

/** A message's payload as a short hash: the same payload, the same hash (files included). */
function payloadHash(message: OutgoingMessage): string {
  return createHash('sha256').update(JSON.stringify(message)).digest('base64');
}

/** The order of the hideouts in the post (design 6): Giovanni, Cliff, Arlo, Sierra, the decoy. */
const HIDEOUT_ORDER = ['giovanni', 'leader:cliff', 'leader:arlo', 'leader:sierra', 'decoy'];

/**
 * Hideout reports grouped by who (plan 8R-2): in `HIDEOUT_ORDER` (one of a later version's last),
 * each with its stops in the order reported, as the first report of it names it.
 */
export function hideoutsOf(reports: readonly RocketReport[]): PostHideout[] {
  const byWho = new Map<string, PostHideout>();
  for (const report of reports) {
    const stop = { stop: report.stop, reporter: report.reporter };
    const known = byWho.get(report.subjectKey);
    if (known) known.stops.push(stop);
    else {
      byWho.set(report.subjectKey, {
        key: report.subjectKey,
        name: report.rocket.name,
        catches: report.rocket.catches,
        stops: [stop],
      });
    }
  }
  const rank = (key: string): number => {
    const at = HIDEOUT_ORDER.indexOf(key);
    return at < 0 ? HIDEOUT_ORDER.length : at;
  };
  return [...byWho.values()].sort((a, b) => rank(a.key) - rank(b.key));
}

/**
 * Reports grouped by task (plan 8R-5, R9: the subject read by `researchSubjectOf`), then by
 * version as the decision sees it (`versionOf`, review R2: a report of before plan 8R-5 of a task
 * of one reward is that reward's version, R10; "one of" before and now are one), each in the
 * words of its newest report: an event's tasks first (plan 8R-8, `isEventTask`), then the rest,
 * each part the tasks of most stops in all first, then by the first report;
 * within a task the versions of a reward first (most stops first, then by the first report),
 * then the open ones ("one of", a typed task without its reward).
 */
export function grouped(
  reports: readonly ResearchReport[],
  versionOf: (report: ResearchReport) => ResearchSubjectKey | undefined,
): PostTask[] {
  type Collected = PostVersion & { first: number; newest: number; open: boolean };
  const byTask = new Map<
    string,
    { task: PostTask; first: number; event: boolean; versions: Map<string, Collected> }
  >();
  for (const report of reports) {
    const version = versionOf(report);
    const taskKey = version?.task ?? taskOfSubject(report.subjectKey);
    const versionKey =
      version === undefined ? report.subjectKey : versionValue(version.task, version.hash);
    let task = byTask.get(taskKey);
    if (!task) {
      task = {
        task: { key: taskKey, research: report.research, versions: [] },
        first: report.madeAt,
        event: isEventTask(report),
        versions: new Map(),
      };
      byTask.set(taskKey, task);
    }
    const stop = { stop: report.stop, reporter: report.reporter };
    const known = task.versions.get(versionKey);
    if (known) {
      known.stops.push(stop);
      if (report.madeAt >= known.newest) {
        known.rewards = report.research.rewards;
        known.newest = report.madeAt;
      }
    } else {
      task.versions.set(versionKey, {
        key: versionKey,
        rewards: report.research.rewards,
        stops: [stop],
        first: report.madeAt,
        newest: report.madeAt,
        open: version?.hash === undefined,
      });
    }
  }
  const byStops = (a: { stops: number; first: number }, b: { stops: number; first: number }) =>
    b.stops - a.stops || a.first - b.first;
  return [...byTask.values()]
    .map(({ task, first, event, versions }) => {
      const ordered = [...versions.values()].sort(
        (a, b) =>
          Number(a.open) - Number(b.open) ||
          byStops(
            { stops: a.stops.length, first: a.first },
            { stops: b.stops.length, first: b.first },
          ),
      );
      return {
        first,
        event,
        stops: ordered.reduce((sum, version) => sum + version.stops.length, 0),
        task: {
          ...task,
          versions: ordered.map(({ key, rewards, stops }) => ({ key, rewards, stops })),
        },
      };
    })
    .sort((a, b) => Number(b.event) - Number(a.event) || byStops(a, b))
    .map(({ task }) => task);
}

/**
 * Whether a report is of an event's task (plan 8R-8, `isEventCategory`): its category is none of
 * the page's standing ones; a typed task, which has no category of the page, never is.
 */
function isEventTask(report: ResearchReport): boolean {
  const { category, typed } = report.research;
  return !typed && category !== null && isEventCategory(category);
}
