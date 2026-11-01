import { containment } from '@pine/wayspot-core/region-membership';
import type { Region } from '../db/repositories/region-repository.js';
import type { StopLineKey, StopLineStorage } from '../db/repositories/stop-line-repository.js';
import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
import { isLeaderOrGiovanni } from '../domain/rocket/lineups.js';
import { localDay, nextLocalMidnight } from '../domain/time/local-day.js';
import { taskOfSubject } from '../domain/research/reports.js';
import type { ReportedStop, RocketReport } from '../domain/stops/report.js';
import type { Logger } from '../log.js';
import { postLink } from '../render/notify-dm.js';
import { hideoutLine, researchLine } from '../render/stop-lines.js';
import type { PostLink } from './stop-posts.js';
import type { ResearchNews, StopReportService } from './stop-reports.js';

/** The longest delay `setTimeout` accepts. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** A claimed line waiting for its board's message (plan 8R-9F, M2). */
interface Waiting {
  claimed: StopLineKey & { createdAt: number };
  subjectKey: string;
  text: (link: string) => string;
}

export interface StopLineServiceOptions {
  storage: StopLineStorage;
  /** The reports at stops: research that is news, and hideouts reported (`hideoutReported`). */
  reports: Pick<StopReportService, 'listen'>;
  /**
   * The posts of the stops (`StopPostService.messageOf`): the message of the board that holds a
   * task or a hideout, once what waits is drawn; undefined where the region has no board.
   */
  posts: {
    messageOf(channelId: string, subjectKey: string): Promise<PostLink | undefined>;
    /**
     * Tells of a channel's post of the stops drawn in full in its board (`StopPostService.onDrawn`,
     * plan 8R-9F, M2): the lines that waited for it are tried once more.
     */
    onDrawn?(listener: (channelId: string) => void): void;
  };
  regions: { all(): readonly Region[] };
  /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
  guilds: { idFor(serverId: string): Promise<number | undefined> };
  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
  /** `settings.timezone`: the local day and its midnight. */
  zone: string;
  log: Logger;
  now?: () => number;
}

/**
 * The lines of a region's channel (plan 8R-9, B9; design "The text channel"): the first time in a
 * local day that a research task (any version of it, "one of" too) or a leader or Giovanni is
 * reported at a stop in a region, a short line in the region's channel links the message of the
 * region's board that holds it (`researchLine`, `hideoutLine`), as a new party's line links its
 * post. A line is claimed by its row first (`StopLineStorage.claim`), then sent, never edited; a
 * region without a board gets none (its claim is let go, so a later report there tries again),
 * and one whose board is being made anew keeps its claim until that board is drawn (plan 8R-9F,
 * M2: tried once more then, or let go at the day's end). No
 * line for a decoy or a grunt; a narrowing is the same task. At each local midnight the lines of
 * the day before are deleted, and at start those of days before (a restart over a midnight); one
 * whose delete failed is tried again in the catch-up and before the next line is sent (W2). None
 * in rehearsal mode: the bot does not make it.
 */
export class StopLineService {
  private readonly now: () => number;
  /** The announcements on their way (`flush` and `close` wait for them). */
  private readonly pending = new Set<Promise<void>>();
  private timer: NodeJS.Timeout | undefined;
  /** Channels where Discord refused a delete for good (review R1), said once each. */
  private readonly deleteRefusalsTold = new Set<string>();
  /**
   * Set where a line of a day that ended is kept (its delete failed, or it was sent after its
   * day ended): the next announcement sweeps first (review W2), as the next midnight may be a
   * day away.
   */
  private stale = false;
  private closed = false;
  /**
   * The lines claimed whose board's message was not there although the region has a board (plan
   * 8R-9F, M2, B9: a moderator deleted it, and it is being made anew), by region channel: tried
   * once more after the next full draw of that channel's post, let go at the day's end.
   */
  private readonly waiting = new Map<string, Waiting[]>();

  constructor(private readonly options: StopLineServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    options.posts.onDrawn?.((channelId) => {
      if (this.closed) return;
      const lines = this.waiting.get(channelId) ?? [];
      this.waiting.delete(channelId);
      for (const one of lines) this.track(this.deliver(one, true));
    });
    options.reports.listen({
      reported: (news) => {
        this.track(this.research(news));
      },
      hideoutReported: (report) => {
        this.track(this.hideout(report));
      },
    });
  }

  private track(work: Promise<void>): void {
    const kept = work
      .catch((err: unknown) => {
        this.options.log.warn({ err }, 'could not say a new report in its region’s channel');
      })
      .finally(() => this.pending.delete(kept));
    this.pending.add(kept);
  }

  /** The local day of a moment, `yyyy-mm-dd`. */
  private dayOf(time: number): string {
    return localDay(time, this.options.zone);
  }

  /** The region channels of a server whose outlines hold any of these stops. */
  private async channelsAt(serverId: string, stops: readonly ReportedStop[]): Promise<string[]> {
    const row = await this.options.guilds.idFor(serverId);
    if (row === undefined) return [];
    return this.options.regions
      .all()
      .filter((region) => region.guildId === row && region.bounds !== null)
      .filter((region) => stops.some(containment(region.bounds ?? [])))
      .map((region) => region.channelId);
  }

  /** Research that is news: its task's line in each region channel of its stops, once a day. */
  private async research(news: ResearchNews): Promise<void> {
    const [first] = news.reports;
    if (this.closed || first === undefined) return;
    const task = taskOfSubject(first.subjectKey);
    const day = this.dayOf(this.now());
    const channels = await this.channelsAt(
      news.serverId,
      news.reports.map((report) => report.stop),
    );
    for (const regionChannelId of channels) {
      await this.announce(
        { serverId: news.serverId, regionChannelId, day, key: `research:${task}` },
        task,
        (link) => researchLine(first.research, link),
      );
    }
  }

  /** A hideout reported: a leader's or Giovanni's line in each region channel, once a day. */
  private async hideout(report: RocketReport): Promise<void> {
    const who = report.subjectKey;
    if (this.closed || !isLeaderOrGiovanni(who)) return;
    const day = this.dayOf(this.now());
    for (const regionChannelId of await this.channelsAt(report.serverId, [report.stop])) {
      await this.announce(
        { serverId: report.serverId, regionChannelId, day, key: `rocket:${who}` },
        who,
        (link) => hideoutLine(report.rocket.name, report.stop, link),
      );
    }
  }

  /**
   * Claims a line, then sends it with the link to the board's message that holds `subjectKey`;
   * where there is none (no board), the send fails, or the line's day ended while the board's
   * message was looked for (review W1: midnight's sweep may have forgotten the claim, and the
   * link would be today's post), the claim is let go. A line sent is kept even where a sweep
   * forgot its claim meanwhile (`sent` makes the row anew), so that a sweep deletes it.
   */
  private async announce(
    line: StopLineKey,
    subjectKey: string,
    text: (link: string) => string,
  ): Promise<void> {
    const { storage, log } = this.options;
    if (this.stale) {
      this.stale = false;
      await this.sweep().catch((err: unknown) => {
        this.stale = true;
        log.warn({ err }, 'could not delete the lines of reports of days before');
      });
    }
    const claimed = { ...line, createdAt: this.now() };
    if (!(await storage.claim(claimed))) return;
    await this.deliver({ claimed, subjectKey, text }, false);
  }

  /**
   * Sends a claimed line with its link. Where the board's message is not found though the region
   * has a board (plan 8R-9F, M2: the board was deleted and is being made anew), the claim is kept
   * and the line waits for the next full draw of that channel's post (`retry` then: tried once,
   * let go if still nothing). Otherwise a line not sent lets its claim go.
   */
  private async deliver(one: Waiting, retry: boolean): Promise<void> {
    const { storage, posts, gateway, log, regions } = this.options;
    const { claimed, subjectKey, text } = one;
    const line: StopLineKey = claimed;
    let sent: string | undefined;
    // Whether the board held the line's message (or a send was tried and failed).
    let found: boolean;
    try {
      const held = await posts.messageOf(line.regionChannelId, subjectKey);
      found = held !== undefined;
      if (held !== undefined && this.dayOf(this.now()) === line.day) {
        const link = postLink(line.serverId, held.channelId, held.messageId);
        sent = await gateway.sendMessage(line.regionChannelId, { content: text(link) });
      }
    } catch (err) {
      log.warn({ err, channel: line.regionChannelId }, 'could not send the line of a new report');
      found = true;
    }
    if (sent === undefined) {
      const boarded = regions
        .all()
        .some((region) => region.channelId === line.regionChannelId && region.summaryMessageId);
      if (!found && !retry && boarded && !this.closed && this.dayOf(this.now()) === line.day) {
        const list = this.waiting.get(line.regionChannelId) ?? [];
        list.push(one);
        this.waiting.set(line.regionChannelId, list);
        return;
      }
      await storage.forget(line);
      return;
    }
    await storage.sent(claimed, sent);
    // Sent as its day ended (a sweep may have forgotten its claim): the next one deletes it.
    if (this.dayOf(this.now()) !== line.day) this.stale = true;
  }

  /**
   * Deletes the lines of the days before today, and forgets each once its delete resolved (a
   * message gone counts); one whose delete fails stays for the next sweep (review P1): at
   * midnight, at start, in the catch-up on reconnect, and before the next announcement (W2).
   */
  async sweep(): Promise<void> {
    const { storage, gateway, log } = this.options;
    const today = this.dayOf(this.now());
    // A line that waited for its board through the day's end is let go (M2): its row below.
    for (const [channelId, lines] of this.waiting) {
      const kept = lines.filter((one) => one.claimed.day === today);
      if (kept.length > 0) this.waiting.set(channelId, kept);
      else this.waiting.delete(channelId);
    }
    for (const line of await storage.before(today)) {
      if (line.messageId !== null) {
        try {
          await gateway.deleteMessage(line.regionChannelId, line.messageId);
        } catch (err) {
          if (isMissingPermission(err)) {
            // Refused for good (review R1: 50001, 50013): forgotten, said once per channel.
            if (!this.deleteRefusalsTold.has(line.regionChannelId)) {
              this.deleteRefusalsTold.add(line.regionChannelId);
              log.warn(
                { err, channel: line.regionChannelId },
                'the bot may not delete the line of a report',
              );
            }
          } else {
            // Kept (review P1): the next sweep (midnight, start, the catch-up) tries again.
            log.warn(
              { err, channel: line.regionChannelId },
              'could not delete the line of a report',
            );
            this.stale = true;
            continue;
          }
        }
      }
      await storage.forget(line);
    }
  }

  /** At start: the lines of days before deleted, and the timer of the next local midnight set. */
  async start(): Promise<void> {
    try {
      await this.sweep();
    } finally {
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    const now = this.now();
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.track(this.sweep().finally(() => this.schedule()));
      },
      // A moment after midnight: the day after it is today.
      Math.min(nextLocalMidnight(now, this.options.zone) - now + 1_000, MAX_TIMER_MS),
    );
    this.timer.unref();
  }

  /** Waits for every announcement and delete on its way. For tests and shutdown. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  /**
   * Stops the timer; what is on its way is finished first, and the claims of the lines still
   * waiting for their board are let go (review F4), so that a report after a restart that day
   * can claim them again.
   */
  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.flush();
    const waiting = [...this.waiting.values()].flat();
    this.waiting.clear();
    for (const { claimed } of waiting) {
      await this.options.storage.forget(claimed).catch((err: unknown) => {
        this.options.log.warn({ err }, 'could not let go of the line of a report');
      });
    }
  }
}
