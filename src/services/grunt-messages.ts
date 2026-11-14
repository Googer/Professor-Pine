import { BoundedMap } from '../bounded-map.js';
import type { GruntMessageStorage } from '../db/repositories/grunt-message-repository.js';
import {
  isMissingPermission,
  isRefusedBody,
  type OutgoingMessage,
  type PartyGateway,
} from '../discord/party-gateway.js';
import { AS_FED, rocketPicture, type PictureLookup } from '../domain/stops/pictures.js';
import { isRocketReport, type RocketReport, type StopReport } from '../domain/stops/report.js';
import type { Logger } from '../log.js';
import { gruntMessage, gruntTextMessage, type GruntView } from '../render/rocket.js';
import { KeyedLock } from './keyed-lock.js';
import { ReadsBetweenWrites } from './reads-between-writes.js';
import type { LeftServers } from './server-standings.js';
import type { PictureMaker } from './stop-pictures.js';
import { isHideoutReport, type StopReportListener } from './stop-reports.js';

/** A grunt's message in a region channel. */
export interface PostedGrunt {
  channelId: string;
  messageId: string;
}

/**
 * What came of a refine (fix round 2, F2): the messages that stand, and whether every message of
 * the report was looked at (`complete`). A complete pass that leaves none found each one gone; an
 * incomplete one could not tell, and what it gives is only what it knows to stand. A pass is
 * incomplete (K3) where `messagesOf` failed (twice, L-5: `unread`), where a newer version is
 * shown already, where the service closed or the report ended on the way, and where a delete of
 * one of its messages was on its way.
 */
export interface RefinedGrunt {
  standing: PostedGrunt[];
  complete: boolean;
  /**
   * Its messages could not be read (L-5): none was edited or retimed, and they keep their old
   * end; the caller tells of the report as rehearsal mode does, by its stop's region channels.
   */
  unread?: true;
}

/** How long after a delete that failed at its time it is tried once more. */
export const DELETE_AGAIN_MS = 60_000;

/** How long after its time a message that cannot be deleted is still tried at every sweep. */
export const GIVE_UP_MS = 24 * 60 * 60_000;

/**
 * How many reports that ended early are remembered, for a message still on its way; as many
 * reports' versions shown and messages' kinds.
 */
const ENDED_KEPT = 1_000;

/** How many sets of reports' messages `messagesOfReports` keeps: a map's member sees one. */
const LISTED_READS = 1_000;

/** How a grunt's message was sent: components v2, or plain text where the bot may not embed. */
type MessageKind = 'v2' | 'text';

/** The source of a grunt's one picture by the rule (plan 8R-6, `rocketPicture`), if any. */
function pictureSource(report: RocketReport): string | undefined {
  return rocketPicture(report.subjectKey, report.rocket.catches)?.source;
}

/**
 * What a grunt's message shows of its report: the type's name, never a lineup's gender; its one
 * picture by the rule (plan 8R-6), as `picture` names it.
 */
function viewOf(report: RocketReport, picture: PictureLookup): GruntView {
  const source = pictureSource(report);
  return {
    name: report.rocket.name,
    catches: report.rocket.catches,
    stop: report.stop,
    reporter: report.reporter,
    picture: source === undefined ? undefined : picture(source),
  };
}

/** A view without its pictures, for a message Discord refused for them. */
function withoutPictures(view: GruntView): GruntView {
  return {
    ...view,
    catches: view.catches.map((one) => ({ ...one, image: null })),
    stop: { ...view.stop, image: null },
    picture: undefined,
  };
}

/** A grunt's message of a kind: components v2, or plain text where the bot may not embed. */
function made(kind: MessageKind, view: GruntView, goneAt: number): OutgoingMessage {
  return kind === 'v2' ? gruntMessage(view, goneAt) : gruntTextMessage(view, goneAt);
}

export interface GruntMessageServiceOptions {
  gateway: Pick<PartyGateway, 'sendMessage' | 'editMessage' | 'deleteMessage' | 'mayPost'>;
  store: GruntMessageStorage;
  /** The reports at stops: a grunt that ended early (replaced, taken back) is deleted at once. */
  reports: { listen(listener: StopReportListener): void };
  /**
   * The servers Pine left (plan 19C-1, `ServerStandings`): the sweep passes over their messages,
   * kept for when they are back.
   */
  left?: LeftServers;
  log: Logger;
  now?: () => number;
  /**
   * Starts the timer that deletes a message and gives the function that cancels it. Default:
   * `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
   */
  setTimer?: (run: () => void, ms: number) => () => void;
  /**
   * The square pictures (plan 8R-6, `StopPictures`): made before a grunt is posted or edited,
   * and named by their address. Without it the message names the feed's.
   */
  pictures?: PictureMaker;
}

/**
 * The grunts' messages (plan 8R-2; design 5.2): a grunt's report is a message in each region
 * channel that holds its stop, as a spawn report is (components v2, or plain text where the bot
 * may not embed; a message Discord refuses for its pictures is sent once more without them),
 * deleted when the report ends (`endsAt`, `settings.rocket.gruntMinutes` after it was made) and
 * at once when it ends early (a newer report at the stop, taken back: `ended`). Every message
 * is recorded (`GruntMessageStorage`) until it is deleted; `sweep` (at start and hourly) takes
 * up what is recorded and does not wait in this process. A delete that fails is tried once more
 * a minute later, then by the sweeps until a day after its time. A grunt refined in place (plan
 * 8R-4L: a lineup of its type) has its messages edited and their delete moved (`refine`).
 *
 * Unlike spawn reports, a shutdown deletes nothing (`close`): the report stands on through a
 * restart, and so does its message; the next start's sweep deletes what is overdue then.
 */
export class GruntMessageService {
  private readonly now: () => number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  /** The messages that wait for their delete, by message. */
  private readonly waiting = new Map<string, { channelId: string; cancel: () => void }>();
  /** The work on the side (deletes, the ends of reports): `flush` waits for it. */
  private readonly work = new Set<Promise<unknown>>();
  /** The messages whose delete is on its way. */
  private readonly removing = new Set<string>();
  /** The reports that ended early (by id): a message of one still on its way goes at once. */
  private readonly endedEarly = new BoundedMap<number, true>(ENDED_KEPT);
  /**
   * A report's posting, refines and end, one after the other per report id (review R1): a refine
   * finds every message its posting sent, and an end every message a refine kept.
   */
  private readonly turns = new KeyedLock<number>();
  /**
   * The newest version (`madeAt`) of each report its messages show (review R2): a refine of an
   * older one that comes after it is not shown.
   */
  private readonly shown = new BoundedMap<number, number>(ENDED_KEPT);
  /**
   * How each message was sent (review R6): an edit keeps it so, whatever the bot may do in its
   * channel by then. A message of an earlier process is guessed by the rule `send` used (F4).
   */
  private readonly sentAs = new BoundedMap<string, MessageKind>(ENDED_KEPT);
  /**
   * The reads `messagesOfReports` keeps (the map's list asks the same reports over and over), by
   * the reports asked for, until a message is recorded or forgotten (`listed.writing`).
   */
  private readonly listed = new ReadsBetweenWrites<
    string,
    ReadonlyMap<number, readonly PostedGrunt[]>
  >(LISTED_READS);
  private closed = false;
  /**
   * The options without the store, which is reached only as `store` and `written`, so that a
   * write past the count does not typecheck (review of map-speed).
   */
  private readonly options: Omit<GruntMessageServiceOptions, 'store'>;
  /**
   * The store's reads, and `retime`: a message's time of deletion, which `messagesOfReports`
   * does not give, so the map's kept reads need not hear of it.
   */
  private readonly store: Omit<GruntMessageStorage, 'add' | 'remove'>;
  /** The store's writes of messages, each counted (`listed.writing`). */
  private readonly written: Pick<GruntMessageStorage, 'add' | 'remove'>;

  constructor(options: GruntMessageServiceOptions) {
    this.options = options;
    const { store } = options;
    this.store = store;
    this.written = {
      add: (row) => this.listed.writing(() => store.add(row)),
      remove: (messageId) => this.listed.writing(() => store.remove(messageId)),
    };
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
    options.reports.listen({
      ended: (reports) => {
        this.ended(reports);
      },
    });
  }

  /**
   * Posts a grunt's report in these region channels and has each message deleted when the report
   * ends; gives the messages posted and recorded. Never rejects (fix A1): a channel where the bot
   * may not post, one that is gone, and any other failure (Discord's 5xx, a time-out) is passed
   * over and logged, and the next channel is posted; a message that cannot be recorded is
   * deleted at once (nothing would delete it after a restart) and counts as not posted. In turn
   * with the report's refines and end (review R1).
   */
  post(report: RocketReport, channelIds: readonly string[]): Promise<PostedGrunt[]> {
    return this.turns.run(report.id, () => this.postNow(report, channelIds));
  }

  private async postNow(
    report: RocketReport,
    channelIds: readonly string[],
  ): Promise<PostedGrunt[]> {
    const posted: PostedGrunt[] = [];
    const view = await this.viewWithPicture(report);
    this.shown.set(report.id, Math.max(this.shown.get(report.id) ?? 0, report.madeAt));
    for (const channelId of channelIds) {
      // Ended meanwhile (replaced, taken back): nothing more of it is sent (fix F3).
      if (this.closed || this.endedEarly.has(report.id)) break;
      let messageId: string | undefined;
      try {
        messageId = await this.send(channelId, view, report.endsAt);
      } catch (err) {
        this.options.log.warn(
          { err, guild: report.serverId, channel: channelId },
          isMissingPermission(err)
            ? 'the bot may not post a grunt in a region channel'
            : 'could not post a grunt in a region channel',
        );
        continue;
      }
      if (messageId === undefined) continue;
      if (!(await this.record(report, channelId, messageId))) {
        this.removeNow(channelId, messageId);
        continue;
      }
      posted.push({ channelId, messageId });
      // Ended while it was on its way (a newer report, taken back): it goes at once.
      if (this.endedEarly.has(report.id)) this.removeNow(channelId, messageId);
      else this.deleteLater(channelId, messageId, Math.max(0, report.endsAt - this.now()), true);
    }
    return posted;
  }

  /**
   * Shows a grunt refined in place (plan 8R-4L, Matt's B2: a lineup of its type over "not sure
   * which" or over the other lineup, the report's id kept) in the messages it has: each edited
   * where it stands, keeping its id, so that every DM's "Go to report" still finds it, and deleted
   * at the report's new end. A message whose edit fails stays as it was and is logged, and its
   * delete follows the new end all the same; one that is gone is forgotten. Gives the messages
   * that stand, and whether every message was looked at (`RefinedGrunt`, F2). Never rejects. In
   * turn with the report's posting, other refines and end (review R1): it edits every message its
   * posting sent. A refine older (`madeAt`) than what the messages show already edits nothing
   * (review R2), and gives the messages as they stand, not looked at.
   */
  refine(report: RocketReport): Promise<RefinedGrunt> {
    return this.turns.run(report.id, () => this.refineNow(report));
  }

  private async refineNow(report: RocketReport): Promise<RefinedGrunt> {
    const { log } = this.options;
    let messages: PostedGrunt[];
    try {
      // Read once more where the first read fails (L-5).
      messages = await this.messagesOf(report.id).catch((err: unknown) => {
        log.info({ err, report: report.id }, 'could not find a grunt’s messages; reading again');
        return this.messagesOf(report.id);
      });
    } catch (err) {
      log.warn({ err, report: report.id }, 'could not find a grunt’s messages');
      return { standing: [], complete: false, unread: true };
    }
    const newest = this.shown.get(report.id);
    if (newest !== undefined && report.madeAt < newest) {
      return { standing: messages, complete: false };
    }
    this.shown.set(report.id, report.madeAt);
    // A narrowed grunt takes the picture its new catches give (design Q9).
    const view = await this.viewWithPicture(report);
    const standing: PostedGrunt[] = [];
    // Ended meanwhile (replaced, taken back): its messages go, nothing more is edited, retimed or
    // kept; also where it ended while an edit was on its way (review R4). At shutdown nothing
    // more is edited, but an edit made is recorded (F5).
    const ended = () => this.endedEarly.has(report.id);
    // A message whose delete is on its way is passed over: whether it goes is not known here.
    let complete = true;
    for (const { channelId, messageId } of messages) {
      if (this.closed || ended()) return { standing, complete: false };
      if (this.removing.has(messageId)) {
        complete = false;
        continue;
      }
      try {
        if (!(await this.edit(channelId, messageId, view, report.endsAt))) {
          await this.forget(channelId, messageId);
          continue;
        }
      } catch (err) {
        log.warn(
          { err, guild: report.serverId, channel: channelId },
          'could not edit a grunt report',
        );
      }
      if (ended()) return { standing, complete: false };
      if (this.removing.has(messageId)) {
        complete = false;
        continue;
      }
      try {
        await this.store.retime(messageId, report.endsAt);
      } catch (err) {
        // The timer below deletes it in this process; a restart's sweep, at its first end.
        log.warn({ err, channel: channelId }, 'could not record a grunt report’s new end');
      }
      // No timer once shut down (`deleteLater`): the next start's sweep deletes it at its end.
      this.deleteLater(channelId, messageId, Math.max(0, report.endsAt - this.now()), true);
      standing.push({ channelId, messageId });
    }
    return { standing, complete };
  }

  /** A report's view, its picture made first (plan 8R-6); `prepare` never rejects. */
  private async viewWithPicture(report: RocketReport): Promise<GruntView> {
    const { pictures } = this.options;
    const source = pictureSource(report);
    if (pictures && source !== undefined) await pictures.prepare([source]);
    return viewOf(report, pictures ? (one) => pictures.url(one) : AS_FED);
  }

  /** Deletes a message now; one whose delete fails is tried once more a minute later (fix A3). */
  private removeNow(channelId: string, messageId: string): void {
    this.track(
      this.remove(channelId, messageId).then((removed) => {
        if (!removed && !this.closed) {
          this.deleteLater(channelId, messageId, DELETE_AGAIN_MS, false);
        }
      }),
    );
  }

  /** The messages of a report that stand (for "Already reported" and a DM's link). */
  async messagesOf(reportId: number): Promise<PostedGrunt[]> {
    return (await this.store.ofReport(reportId)).map(({ channelId, messageId }) => ({
      channelId,
      messageId,
    }));
  }

  /**
   * The messages of several reports that stand, in one read (plan 8R-3: the map's grunts, polled,
   * each with a link), by report; a report with none is not in it. Kept for the same reports until
   * a message is recorded or forgotten (`ReadsBetweenWrites`: every write of the store is this
   * service's): the same map comes back, which callers must not change.
   */
  async messagesOfReports(
    reportIds: readonly number[],
  ): Promise<ReadonlyMap<number, readonly PostedGrunt[]>> {
    if (reportIds.length === 0) return new Map();
    return this.listed.read(reportIds.join(','), async () => {
      const byReport = new Map<number, PostedGrunt[]>();
      for (const { reportId, channelId, messageId } of await this.store.ofReports(reportIds)) {
        const kept = byReport.get(reportId);
        if (kept) kept.push({ channelId, messageId });
        else byReport.set(reportId, [{ channelId, messageId }]);
      }
      return byReport;
    });
  }

  /**
   * Sends a grunt's message; when Discord refuses it for what it holds (an address of a picture),
   * once more without its pictures.
   */
  private async send(
    channelId: string,
    view: GruntView,
    goneAt: number,
  ): Promise<string | undefined> {
    const { gateway, log } = this.options;
    const kind: MessageKind = gateway.mayPost(channelId) ? 'v2' : 'text';
    let messageId: string | undefined;
    try {
      messageId = await gateway.sendMessage(channelId, made(kind, view, goneAt));
    } catch (err) {
      if (!isRefusedBody(err)) throw err;
      log.warn({ err, channel: channelId }, 'Discord refused the pictures of a grunt report');
      messageId = await gateway.sendMessage(channelId, made(kind, withoutPictures(view), goneAt));
    }
    if (messageId !== undefined) this.sentAs.set(messageId, kind);
    return messageId;
  }

  /**
   * Edits a grunt's message into a view (plan 8R-4L) of the kind it was sent as (review R6), never
   * by what the bot may do in its channel now: Discord keeps a components-v2 message so. Where
   * Discord refuses the edit for what it holds, components v2 is tried once more without its
   * pictures. A message known to be components v2 is never edited as plain text (F4); one sent
   * as plain text is tried as components v2 after. A message of an earlier process, whose kind is
   * not known, is guessed by the rule `send` used (`mayPost`: components v2, else plain text),
   * then tried as the other kind. False where the message is gone.
   */
  private async edit(
    channelId: string,
    messageId: string,
    view: GruntView,
    goneAt: number,
  ): Promise<boolean> {
    const { gateway, log } = this.options;
    const known = this.sentAs.get(messageId);
    const asV2 = [made('v2', view, goneAt), made('v2', withoutPictures(view), goneAt)];
    const asText = made('text', view, goneAt);
    const first: MessageKind = known ?? (gateway.mayPost(channelId) ? 'v2' : 'text');
    const tries: OutgoingMessage[] =
      first === 'text' ? [asText, ...asV2] : known === 'v2' ? asV2 : [...asV2, asText];
    for (const [n, message] of tries.entries()) {
      try {
        const edited = await gateway.editMessage(channelId, messageId, message);
        if (edited) this.sentAs.set(messageId, message.v2 === true ? 'v2' : 'text');
        return edited;
      } catch (err) {
        if (!isRefusedBody(err) || n === tries.length - 1) throw err;
        log.warn({ err, channel: channelId }, 'Discord refused the edit of a grunt report');
      }
    }
    return false;
  }

  /** Records a message; whether it was. Never rejects (the failure is logged). */
  private async record(
    report: RocketReport,
    channelId: string,
    messageId: string,
  ): Promise<boolean> {
    try {
      const row = {
        messageId,
        channelId,
        serverId: report.serverId,
        reportId: report.id,
        deleteAt: report.endsAt,
      };
      await this.written.add(row);
      return true;
    } catch (err) {
      this.options.log.warn(
        { err, channel: channelId },
        'could not record a grunt report; its message is deleted',
      );
      return false;
    }
  }

  /**
   * The reports that ended early: the messages of the grunts among them are deleted now, once
   * the posting or refine on its way has settled (review R1), which sends and edits no more.
   */
  private ended(reports: readonly StopReport[]): void {
    for (const report of reports) {
      if (!isRocketReport(report) || isHideoutReport(report)) continue;
      this.endedEarly.set(report.id, true);
      this.track(
        this.turns
          .run(report.id, () => this.messagesOf(report.id))
          .then(
            (messages) => {
              for (const { channelId, messageId } of messages) {
                this.waiting.get(messageId)?.cancel();
                this.waiting.delete(messageId);
                if (!this.removing.has(messageId)) this.removeNow(channelId, messageId);
              }
            },
            (err: unknown) => {
              this.options.log.warn(
                { err, report: report.id },
                'could not find a grunt’s messages',
              );
            },
          ),
      );
    }
  }

  /**
   * Takes up the recorded messages that do not wait in this process; answers how many. Each is
   * deleted when it is due (now, when that has passed), and tried again at the next sweep when
   * that fails, until `GIVE_UP_MS` after its time. Those of a server Pine left (plan 19C-1) are
   * passed over, neither deleted nor given up: kept for when it is back.
   */
  async sweep(): Promise<number> {
    if (this.closed) return 0;
    const rows = await this.store.all();
    const now = this.now();
    let taken = 0;
    for (const { channelId, messageId, deleteAt, serverId } of rows) {
      if (this.closed) break;
      if (this.waiting.has(messageId) || this.removing.has(messageId)) continue;
      if (this.options.left?.isLeft(serverId) === true) continue;
      if (now - deleteAt >= GIVE_UP_MS) {
        await this.forget(channelId, messageId);
        this.options.log.warn(
          { channel: channelId, message: messageId },
          'gave up deleting a grunt report',
        );
        continue;
      }
      this.deleteLater(channelId, messageId, Math.max(0, deleteAt - now), false);
      taken += 1;
    }
    return taken;
  }

  /**
   * Has a message deleted after `ms`; one that fails then is tried once more (`again`). Nothing
   * once shut down (F5): the next start's sweep takes up what is recorded.
   */
  private deleteLater(channelId: string, messageId: string, ms: number, again: boolean): void {
    if (this.closed) return;
    const cancel = this.setTimer(() => {
      this.waiting.delete(messageId);
      this.track(
        this.remove(channelId, messageId).then((removed) => {
          if (!removed && again && !this.closed) {
            this.deleteLater(channelId, messageId, DELETE_AGAIN_MS, false);
          }
        }),
      );
    }, ms);
    this.waiting.get(messageId)?.cancel();
    this.waiting.set(messageId, { channelId, cancel });
  }

  /** Deletes a message and forgets it; whether it went. Never rejects (a failure is logged). */
  private async remove(channelId: string, messageId: string): Promise<boolean> {
    this.removing.add(messageId);
    try {
      await this.options.gateway.deleteMessage(channelId, messageId);
      await this.forget(channelId, messageId);
      return true;
    } catch (err) {
      this.options.log.warn({ err, channel: channelId }, 'could not delete a grunt report');
      return false;
    } finally {
      this.removing.delete(messageId);
    }
  }

  /** Forgets a recorded message; never rejects. */
  private async forget(channelId: string, messageId: string): Promise<void> {
    try {
      await this.written.remove(messageId);
    } catch (err) {
      this.options.log.warn({ err, channel: channelId }, 'could not forget a grunt report');
    }
  }

  private track(promise: Promise<unknown>): void {
    const tracked = promise.finally(() => this.work.delete(tracked));
    this.work.add(tracked);
  }

  /** Waits for the work on the side (deletes, the ends of reports). For tests and `close`. */
  async flush(): Promise<void> {
    while (this.work.size > 0) await Promise.allSettled([...this.work]);
  }

  /**
   * For shutdown: posts and edits no more, cancels the timers, and waits for the postings,
   * refines and ends on their way (F5: an edit made is recorded with its new end, without a
   * timer) and the deletes. What still stands is deleted by the next start's sweep (the report
   * stands on as well).
   */
  async close(): Promise<void> {
    this.closed = true;
    for (const { cancel } of this.waiting.values()) cancel();
    this.waiting.clear();
    await this.turns.whenIdle();
    await this.flush();
  }
}
