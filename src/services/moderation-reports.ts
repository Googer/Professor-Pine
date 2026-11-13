import { closedEnd } from '../domain/history/party-history.js';
import { randomUUID } from 'node:crypto';
import type { Settings } from '../config/settings.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { addressLine } from '../domain/geo/google.js';
import { cutWhole, type Place } from '../domain/geo/place.js';
import type { Wayspot } from '../domain/wayspots/kept.js';
import type { WayspotProvider } from './wayspot-directory.js';
import {
  MAX_ATTACHMENT_NAMES,
  MAX_REPORT_REASON,
  MESSAGE_COPY_ROOM,
  messageSeenAgain,
  type MessageSubject,
  type ModerationReport,
  reportTargetKey,
  type PartySubject,
  type PostRemoval,
  type ReportReason,
  type ReportRemoval,
  type ReportStatus,
  type ReportStore,
} from '../domain/moderation/reports.js';
import type { Decider } from '../domain/meetups/records.js';
import { sightingKey } from '../domain/ocr/list-tier-doubt.js';
import { spotNameKey } from '../domain/ocr/power-spot-match.js';
import { isMax, isMeetup, isTrain, partyWord, type Party } from '../domain/party/party.js';
import { currentStop } from '../domain/party/train.js';
import { BoundedMap } from '../bounded-map.js';
import type { Logger } from '../log.js';
import {
  maxPinNotice,
  listTierNote,
  missingSpotNote,
  type ListTierNotice,
  type MaxPinNotice,
  type MaxPinOutcome,
  ENDING_ACTIONS,
  reportActions,
  reportMessage,
  type ReportAction,
} from '../render/moderation.js';
import type { MeetupSafety } from './meetup-safety.js';
import type { NamedMember } from '../render/text.js';
import type { GymProvider } from './gym-directory.js';
import type { PartyService, PostRemoved } from './party-service.js';
import type { PartyListener, PartyProvider } from './party-store.js';
import type { RegionProvider } from './region-directory.js';
import { moderatorsNamed } from '../config/server-settings.js';
import type { ServerSettingsLookup } from './server-settings.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';
import { listTierOwnerDm } from '../render/shared-change-dm.js';

/** A member's report of a party, as `/report` (or the Apps menu) gives it. */
export interface PartyReportAsk {
  /** The server's snowflake. */
  serverId: string;
  partyId: string;
  reporter: NamedMember;
  /** As typed: trimmed here. */
  reason: string;
}

/** A member's report of one message, as the Apps menu gives it. */
export interface MessageReportAsk {
  serverId: string;
  /** The message as Discord sent it with the interaction. */
  message: {
    channelId: string;
    messageId: string;
    authorId: string;
    authorName: string | null;
    sentAt: number;
    text: string;
    attachments: readonly string[];
    /** The text and attachments are those of the message it forwards (its first snapshot). */
    forwarded?: boolean;
  };
  /** The title of the party whose post the message is in; null for none. */
  partyTitle: string | null;
  /** A channel of the server, by which its moderators' channel is found. */
  nearChannelId: string;
  reporter: NamedMember;
  reason: string;
}

/** What came of a moderator's decision of a report. */
export type ReportDecision =
  /** No such report in the presser's server. */
  | { kind: 'gone' }
  /** Somebody decided it first, or its party ended: the report as it is. */
  | { kind: 'decided-before'; report: ModerationReport }
  /** Not an action this report offers. */
  | { kind: 'not-offered' }
  /** Delete post chosen where the bot may not delete posts (Manage Threads): nothing changed. */
  | { kind: 'may-not-delete'; forumId: string | null }
  /** Refuse place… where the party's place is now a pin or none: nothing changed. */
  | { kind: 'no-place' }
  /**
   * A step of its work failed (logged): the party not closed; whether its place was refused or
   * its maker blocked before that, and whether the report is open again (its buttons back).
   */
  | { kind: 'failed'; word: string; placeRefused: boolean; blocked: boolean; reopened: boolean }
  /** Delete message where the bot may not delete messages (Manage Messages): it stays open. */
  | { kind: 'may-not-delete-message'; channelId: string }
  /**
   * Decided; for Block maker…, whether the block is new and how many other meetups were closed
   * and requests withdrawn; `refusedDeletion` where Discord refused to delete the post, which is
   * archived instead; `deletionPending` where the deletion failed for the network: archived for
   * now, deleted with the hourly upkeep (plan 8X-H, review r1 C1).
   */
  | {
      kind: 'done';
      report: ModerationReport;
      newBlock?: boolean;
      closed?: number;
      withdrawn?: number;
      refusedDeletion?: boolean;
      deletionPending?: boolean;
    };

/** What came of a report. */
export type ReportOutcome =
  /** With the moderators: a new report, or a reason more on the open one. */
  | { kind: 'sent'; report: ModerationReport }
  /** This member reported it already, and the report is still open. */
  | { kind: 'already' }
  /** The party has ended (or is not there). */
  | { kind: 'gone' }
  /** The moderators' channel is not there, or Discord refused the post: nothing is kept. */
  | { kind: 'not-sent' }
  /** A reason of nothing but white space, or longer than `MAX_REPORT_REASON`. */
  | { kind: 'no-reason' }
  /**
   * Where the server has no moderators' channel (plan 19A-1: `reportRefusal`): refused, never
   * put into the open.
   */
  | { kind: 'no-channel' };

export interface ModerationReportsOptions {
  storage: ReportStore;
  /** Meetup safety's gateway (its own in rehearsal mode): the moderators' posts go through it. */
  gateway: Pick<
    PartyGateway,
    'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage' | 'deleteReported' | 'guildName'
  >;
  parties: Pick<
    PartyService,
    'briefOf' | 'postTitle' | 'placeOf' | 'endAs' | 'mayDeletePost' | 'deletePostOf'
  >;
  /** Meetup safety: a place refused for good, a maker blocked (Refuse place…, Block maker…). */
  safety: Pick<MeetupSafety, 'refusePlace' | 'blockMember'>;
  /** The active parties. */
  store: Pick<PartyProvider, 'get'>;
  regions: Pick<RegionProvider, 'byId'>;
  /** The gyms, for a raid's and a train's place and a gym's official name. */
  gyms?: Pick<GymProvider, 'get'>;
  /** The kept Wayspots, for a train at a power spot (plan 8X-4); without them it is at no place. */
  wayspots?: Pick<WayspotProvider, 'byId' | 'addressOf'>;
  settings: Settings;
  /** Each server's values: its moderators' channel, which reports go to (plan 19A-1). */
  servers: ServerSettingsLookup;
  /**
   * Whether a server's staff change what every server shares from it (plan 19B-1,
   * `serverStaffShareData`: the operators' tiers): where they may not, a note of screenshots
   * against the boss list names no command, and the owner is told. Unless given, they may.
   */
  staffChangeShared?: (serverId: string) => boolean;
  /** `OWNER_ID`, told through `dms`; blank or none: nobody is. */
  ownerId?: string;
  /** The DM queue, for the owner's note of screenshots against the boss list (plan 19B-1). */
  dms?: DmSender;
  log: Logger;
  now?: () => number;
  /**
   * How long the read before a report's form may take (`reportedBefore`): a form must open within
   * Discord's three seconds. A second by default.
   */
  checkTimeoutMs?: number;
}

/**
 * How old a report must be whose post was never recorded (the bot stopped between keeping it and
 * sending its post) before a new reason opens one anew in its place.
 */
const STRANDED_MS = 5 * 60_000;

const DAY = 24 * 3_600_000;

/** How long the moderators are not told again of a Power Spot Pine may be missing (design 3). */
export const MISSING_SPOT_DAYS = 7;

/**
 * How long the moderators are not told again of screenshots against the boss list (plan 8X-J,
 * review M4).
 */
export const LIST_TIER_NOTE_DAYS = 7;

/** As many of a party's brief lines as a report keeps, and as much of each. */
const MAX_LINES = 10;
const LINE_ROOM = 1000;

/**
 * Reports to the moderators (plan 8S-2; spec `2026-10-17-moderation-reports-design.md`): a
 * member's report of a party (`/report`, the Apps menu on its post) or of a message goes to the
 * moderators' channel (the server's moderators' channel, meetup safety's) as a post with what is
 * reported and every reporter's reason, where the moderators decide. Reports are kept in the
 * database (`ReportStore`), so that a press on an old post works after a restart; reasons of one
 * party or message gather on its one open report. Without the moderators' channel a party's
 * report goes into its post for all to read, as a member's `/delete` did (`requestDeletion`).
 */
export class ModerationReports {
  private readonly now: () => number;
  /** The work done on the side (a party that ended), for `flush`. */
  private readonly pending = new Set<Promise<void>>();
  /** By report: the edit of its post under way, after which the next one waits. */
  private readonly showing = new BoundedMap<string, Promise<void>>(1_000);
  /** By subject (`reportTargetKey`): reasons of reports that are gone, for the next one opened. */
  private readonly orphans = new BoundedMap<string, ReportReason[]>(1_000);
  /** By party: the reports its end settled as `ended`, for staff who closed it (`closedByStaff`). */
  private readonly endedOf = new BoundedMap<string, string[]>(1_000);
  /** The moderators' notice of each pin battle (fix review (a)), by party, while it is told. */
  private readonly pinNotices = new BoundedMap<
    string,
    {
      channelId: string;
      messageId: string;
      notice: MaxPinNotice;
      tail: Promise<void>;
      closed?: boolean;
    }
  >(1_000);

  /** By server and Power Spot name (`spotNameKey`): when the moderators were told it is missing. */
  private readonly spotsNoted = new BoundedMap<string, number>(1_000);
  /** By sighting (`sightingKey`), of any server: when the owner was told the list disagrees. */
  private readonly ownerNoted = new BoundedMap<string, number>(1_000);
  /** By server and sighting (`sightingKey`): when the moderators were told the list disagrees. */
  private readonly tiersNoted = new BoundedMap<string, number>(1_000);

  constructor(private readonly options: ModerationReportsOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Whether reports go to the moderators of a server: its staff set their channel (plan 19A-1),
   * or the settings file named one the server lacks (`moderatorsNamed`, review F2: unreachable).
   */
  on(serverId: string): boolean {
    return moderatorsNamed(this.options.servers.of(serverId));
  }

  /**
   * The server's moderators' channel near `nearChannelId`, where the bot may post in it;
   * undefined where none is set or it is gone.
   */
  private channelOf(serverId: string, nearChannelId: string): string | undefined {
    const id = this.options.servers.of(serverId).channels.moderation;
    return id === undefined ? undefined : this.options.gateway.findChannel(nearChannelId, id);
  }

  /**
   * Follows the parties: when a reported party ends without a moderator (the clock, its maker,
   * a move, staff's `/delete`), its open report ends with it, its post edited without buttons.
   */
  watch(store: { onChange(listener: PartyListener): void }): void {
    store.onChange((before, after) => {
      if (after.status === 'ended' && before?.status !== 'ended') {
        this.aside(this.partyEnded(after.id), { party: after.id });
        if (this.pinNotices.has(after.id)) {
          this.aside(this.pinOver(after.id, { kind: 'ended' }), { party: after.id });
        }
      }
    });
  }

  /**
   * A max battle reported at an unlisted power spot (Matt, 2026-10-21, final review G1): the
   * moderators' channel near the region channel it was reported in gets a notice of it
   * (`maxPinNotice`), on the side: the battle is posted already, nothing waits on it, and a
   * notice that cannot be sent is logged. Nothing without the moderators' channel.
   */
  maxAtPin(notice: MaxPinNotice): void {
    if (!this.on(notice.serverId)) return;
    const { gateway, store, log } = this.options;
    const work = async (): Promise<void> => {
      const channelId = this.channelOf(notice.serverId, notice.regionChannelId);
      if (channelId === undefined) {
        log.warn({ party: notice.partyId }, "the moderators' channel is not there");
        return;
      }
      const messageId = await gateway.sendMessage(channelId, maxPinNotice(notice));
      if (messageId === undefined) return;
      this.pinNotices.set(notice.partyId, {
        channelId,
        messageId,
        notice,
        tail: Promise.resolve(),
      });
      // Over while the notice was on its way: the listener found no notice to edit.
      if (!store.get(notice.partyId)) await this.pinOver(notice.partyId, { kind: 'ended' });
    };
    this.aside(work(), { party: notice.partyId }, 'could not tell the moderators of a pin battle');
  }

  /**
   * A Power Spot a screenshot showed, read surely, that Pine does not know (plan 8X-S, design 3):
   * the moderators' channel near the channel it was posted in gets a note that a new Wayspot
   * export may be due, at most once per name (`spotNameKey`) and server in `MISSING_SPOT_DAYS`
   * (kept in memory: a restart may note a name once more). True when the staff were told, now or
   * before, so that the member may be told so (review R13); false without the moderators'
   * channel, which is a log line only (the server and the channel, never the name). The note is
   * sent on the side; one that is not sent or that Discord refuses is logged and forgotten, so
   * the next screenshot of the name sends it.
   */
  missingSpot(notice: { serverId: string; channelId: string; name: string }): boolean {
    const { gateway, log } = this.options;
    // Where only: the name a member's screenshot showed stays out of the log (review r4 B2).
    const about = { server: notice.serverId, channel: notice.channelId };
    const channelId = this.channelOf(notice.serverId, notice.channelId);
    if (channelId === undefined) {
      log.info(about, 'a screenshot showed a Power Spot Pine does not know');
      return false;
    }
    const key = `${notice.serverId}\n${spotNameKey(notice.name)}`;
    const now = this.now();
    const noted = this.spotsNoted.get(key);
    if (noted !== undefined && now - noted < MISSING_SPOT_DAYS * DAY) return true;
    this.spotsNoted.set(key, now);
    const work = async (): Promise<void> => {
      let sent: string | undefined;
      try {
        sent = await gateway.sendMessage(channelId, {
          content: missingSpotNote(notice.channelId, notice.name),
        });
      } finally {
        // Not sent, or refused: the next screenshot of the name tells the staff (review r4 B7).
        if (sent === undefined) this.spotsNoted.delete(key);
      }
    };
    this.aside(work(), about, 'could not tell the moderators of a Power Spot Pine does not know');
    return true;
  }

  /**
   * Screenshots that keep disagreeing with the boss list (plan 8X-J; `ListTierWatch` decides when,
   * by `listTierDoubt`): the moderators' channel near the channel of the screenshot that tipped
   * it gets `listTierNote`, at most once per server, family, boss, list's tier and heads' tier in
   * `LIST_TIER_NOTE_DAYS` (review M4; in memory: a restart may tell once more). True when the
   * staff were told, now or before; false without the moderators' channel, which is a log line
   * only (the server and the channel). Sent on the side; one not sent or refused is forgotten,
   * so the next screenshot sends it. Where the server's staff may not change the list (plan
   * 19B-1, `staffChangeShared`), the note names no command, and the owner is told by DM instead
   * (`listTierOwnerDm`), once per sighting of any server in `LIST_TIER_NOTE_DAYS`.
   */
  listTier(notice: ListTierNotice): boolean {
    const { gateway, log } = this.options;
    const about = { server: notice.serverId, channel: notice.channelId };
    const operatorsDecide = this.options.staffChangeShared?.(notice.serverId) === false;
    const who = {
      operatorsDecide,
      operatorsTold: operatorsDecide && this.tellOwnerOfListTier(notice),
    };
    const channelId = this.channelOf(notice.serverId, notice.channelId);
    if (channelId === undefined) {
      log.info(about, 'screenshots disagree with the boss list');
      return false;
    }
    const key = `${notice.serverId}\n${sightingKey(notice)}`;
    const now = this.now();
    const noted = this.tiersNoted.get(key);
    if (noted !== undefined && now - noted < LIST_TIER_NOTE_DAYS * DAY) return true;
    this.tiersNoted.set(key, now);
    const work = async (): Promise<void> => {
      let sent: string | undefined;
      try {
        sent = await gateway.sendMessage(channelId, { content: listTierNote(notice, who) });
      } finally {
        if (sent === undefined) this.tiersNoted.delete(key);
      }
    };
    this.aside(work(), about, 'could not tell the moderators of screenshots against the boss list');
    return true;
  }

  /**
   * Tells the owner by DM of screenshots against the boss list where the server's staff may not
   * change it (plan 19B-1), through the queue as the other DMs about shared data, once per
   * sighting in `LIST_TIER_NOTE_DAYS` whichever server it came from. True where there is an owner
   * to tell (told now or before).
   */
  private tellOwnerOfListTier(notice: ListTierNotice): boolean {
    const { dms, gateway } = this.options;
    const ownerId = this.options.ownerId?.trim() ?? '';
    if (ownerId === '' || dms === undefined) return false;
    const key = sightingKey(notice);
    const now = this.now();
    const noted = this.ownerNoted.get(key);
    if (noted !== undefined && now - noted < LIST_TIER_NOTE_DAYS * DAY) return true;
    this.ownerNoted.set(key, now);
    dms.send({
      userId: ownerId,
      message: listTierOwnerDm(notice, gateway.guildName(notice.serverId)),
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: now + DAY,
    });
    return true;
  }

  /**
   * Says in a pin battle's notice how it went (fix review (a)), one edit at a time per battle, the
   * last word staff's. The notice is remembered in memory only: after a restart its Delete answers
   * that the battle has ended. A failure is logged.
   */
  private pinOver(partyId: string, outcome: MaxPinOutcome): Promise<void> {
    const kept = this.pinNotices.get(partyId);
    if (!kept) return Promise.resolve();
    const tail = kept.tail
      .then(async () => {
        if (kept.closed && outcome.kind === 'ended') return;
        if (outcome.kind === 'closed') kept.closed = true;
        await this.options.gateway.editMessage(
          kept.channelId,
          kept.messageId,
          maxPinNotice(kept.notice, outcome),
        );
      })
      .catch((err: unknown) => {
        this.options.log.warn({ err, party: partyId }, 'could not edit the notice of a pin battle');
      });
    kept.tail = tail;
    return tail;
  }

  /** Waits for the work done on the side and the edits of posts. For tests and shutdown. */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
    for (const key of this.showing.keys()) await this.showing.get(key);
  }

  private aside(
    work: Promise<void>,
    about: Record<string, string>,
    failed = 'could not end the report of a party',
  ): void {
    const tracked = work
      .catch((err: unknown) => {
        this.options.log.error({ err, ...about }, failed);
      })
      .finally(() => {
        this.pending.delete(tracked);
      });
    this.pending.add(tracked);
  }

  /**
   * A member's report of a party: kept and sent to the moderators' channel of its server with
   * the reason (a new post), or added to the open report of the party (its post edited), unless
   * the member reported it already (`already`). Without the moderators' channel it goes into the
   * party's post (`asked`). Never public otherwise: nothing is said in the party's post, nobody
   * pinged.
   */
  async reportParty(ask: PartyReportAsk): Promise<ReportOutcome> {
    const reason = ask.reason.trim();
    if (reason === '' || reason.length > MAX_REPORT_REASON) return { kind: 'no-reason' };
    const party = this.options.store.get(ask.partyId);
    if (!party?.forumPostId) return { kind: 'gone' };
    // Never into the open (plan 19A-1): without the moderators' channel, refused.
    if (!this.on(ask.serverId)) return { kind: 'no-channel' };
    const subject = this.subjectOf(party);
    const nearChannelId = subject.regionChannelId;
    if (nearChannelId === null) return { kind: 'gone' };
    return this.report({ serverId: ask.serverId, subject }, ask.reporter, reason, nearChannelId);
  }

  /**
   * A member's report of one message (the Apps menu on any message but the bot's own; plan
   * 8S-2): a copy of it (its text cut to `MESSAGE_COPY_ROOM`, the names of its attachments, who
   * wrote it where and when, the party whose post it is in) goes to the moderators as a party's
   * report does, reports of one message gathering on one post. Refused without a moderators'
   * channel (`no-channel`): a message has no post of its own to put it into.
   */
  async reportMessage(ask: MessageReportAsk): Promise<ReportOutcome> {
    const reason = ask.reason.trim();
    if (reason === '' || reason.length > MAX_REPORT_REASON) return { kind: 'no-reason' };
    if (!this.on(ask.serverId)) return { kind: 'no-channel' };
    const { message } = ask;
    const subject: MessageSubject = {
      kind: 'message',
      channelId: message.channelId,
      messageId: message.messageId,
      authorId: message.authorId,
      authorName: message.authorName === null ? null : cutWhole(message.authorName, 100),
      sentAt: message.sentAt,
      text: cutWhole(message.text, MESSAGE_COPY_ROOM),
      attachments: message.attachments
        .slice(0, MAX_ATTACHMENT_NAMES)
        .map((name) => cutWhole(name, 255)),
      partyTitle: ask.partyTitle === null ? null : cutWhole(ask.partyTitle, 200),
      ...(message.forwarded === true ? { forwarded: true } : {}),
    };
    return this.report(
      { serverId: ask.serverId, subject },
      ask.reporter,
      reason,
      ask.nearChannelId,
    );
  }

  /**
   * Whether this member's reason is on the open report of the party or message already: asked
   * before the form opens (plan 8S-3), so that nobody types a reason only to hear "You already
   * reported this." False where reports go into the party's post (no moderators' channel), for
   * a report stranded without its post (the next reason opens it anew), and when the read fails
   * or takes longer than `checkTimeoutMs` (logged): the form opens then, and its submit says it.
   */
  async reportedBefore(
    serverId: string,
    subject:
      | Pick<PartySubject, 'kind' | 'partyId'>
      | Pick<MessageSubject, 'kind' | 'channelId' | 'messageId'>,
    reporterId: string,
  ): Promise<boolean> {
    if (!this.on(serverId)) return false;
    const ms = this.options.checkTimeoutMs ?? 1_000;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${String(ms)} ms`)), ms);
      timer.unref();
    });
    try {
      const open = await Promise.race([
        this.options.storage.openReport(reportTargetKey(subject)),
        timeout,
      ]);
      if (!open) return false;
      const stranded = open.messageId === null && open.createdAt <= this.now() - STRANDED_MS;
      return !stranded && open.reasons.some((one) => one.reporterId === reporterId);
    } catch (err) {
      this.options.log.warn({ err }, 'could not read whether a member reported this already');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Opens a report with the reason or adds the reason to the open one of the same subject, and
   * shows it in the moderators' channel. A report whose post was never made (stranded) is
   * forgotten and opened anew, its reasons carried over; so are the reasons of a report whose post
   * failed or that the sweep forgot (`orphans`): nobody told "Sent" loses their reason.
   */
  private async report(
    what: { serverId: string; subject: ModerationReport['subject'] },
    reporter: NamedMember,
    reason: string,
    nearChannelId: string,
    carried: readonly ReportReason[] = [],
  ): Promise<ReportOutcome> {
    const { storage, log } = this.options;
    const now = this.now();
    const newReport = () => ({
      id: randomUUID(),
      serverId: what.serverId,
      subject: what.subject,
      createdAt: now,
    });
    const added = await storage.addReport(newReport(), {
      reporterId: reporter.id,
      reporterName: reporter.name ?? null,
      text: reason,
      at: now,
    });
    const { report } = added;
    if (added.kind !== 'opened' && report.messageId === null && carried.length === 0) {
      if (report.createdAt <= now - STRANDED_MS) {
        log.warn({ report: report.id }, 'a report never got its post; it is opened anew');
        await storage.discardReport(report.id);
        return this.report(what, reporter, reason, nearChannelId, report.reasons);
      }
    }
    if (added.kind === 'already') return { kind: 'already' };
    if (added.kind === 'added') {
      // What the post shows of a party is what it is now; of a message, the copy first reported
      // (its author may have edited it since), marked edited when this one differs.
      const kept = report.subject;
      const subject =
        kept.kind === 'message' && what.subject.kind === 'message'
          ? messageSeenAgain(kept, what.subject)
          : what.subject;
      if (subject !== kept) {
        await storage.setSubject(report.id, subject).catch((err: unknown) => {
          log.warn({ err, report: report.id }, 'could not keep what a report shows');
        });
      }
      // A post on its way shows it once it is recorded (`post` draws it anew).
      await this.show(report.id);
      return { kind: 'sent', report };
    }
    const key = reportTargetKey(what.subject);
    const others = [...carried, ...(this.orphans.get(key) ?? [])].filter(
      (one) => one.reporterId !== reporter.id,
    );
    this.orphans.delete(key);
    for (const other of others) {
      await storage.addReport(newReport(), other).catch((err: unknown) => {
        log.warn({ err, report: report.id }, 'could not carry a reason over to a report');
      });
    }
    return this.post(report.id, nearChannelId, reporter.id);
  }

  /**
   * Sends the post of a report just opened and records it; then draws it anew when anything
   * changed while it was on its way (a reason more, its party ended: the party is looked at once
   * more). Whatever fails leaves nothing behind (`not-sent`; a post sent is taken back); the
   * reasons of others that had joined are kept for the report opened next (`orphans`).
   */
  private async post(
    reportId: string,
    nearChannelId: string,
    openerId: string,
  ): Promise<ReportOutcome> {
    const { storage, gateway, store, log } = this.options;
    const report = await storage.report(reportId);
    if (!report) return { kind: 'not-sent' };
    const channelId = this.channelOf(report.serverId, nearChannelId);
    const sentMessage = reportMessage(report);
    let messageId: string | undefined;
    try {
      if (channelId === undefined) throw new Error("the moderators' channel is not there");
      messageId = await gateway.sendMessage(channelId, sentMessage);
      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
      await storage.setReportPost(report.id, channelId, messageId);
    } catch (err) {
      log.warn({ err, report: report.id }, 'could not send a report to the moderators');
      if (channelId !== undefined && messageId !== undefined) {
        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
          log.warn({ err: deleteErr }, 'could not take back the post of a report');
        });
      }
      const now = await storage.report(report.id).catch(() => undefined);
      await storage.discardReport(report.id).catch((discardErr: unknown) => {
        log.error({ err: discardErr, report: report.id }, 'could not forget a report');
      });
      this.orphan(
        report.subject,
        (now ?? report).reasons.filter((one) => one.reporterId !== openerId),
      );
      return { kind: 'not-sent' };
    }
    // Its party ended while the post was on its way, before the listener could see the post.
    const { subject } = report;
    if (subject.kind === 'party' && !store.get(subject.partyId)) {
      await storage.decideReport(report.id, 'ended', null, null).catch((err: unknown) => {
        log.warn({ err, report: report.id }, 'could not end the report of a party that ended');
      });
    }
    const now = await storage.report(report.id).catch(() => undefined);
    if (now && JSON.stringify(reportMessage(now)) !== JSON.stringify(sentMessage)) {
      await this.show(report.id);
    }
    return { kind: 'sent', report: now ?? { ...report, channelId, messageId } };
  }

  /**
   * Drops the reasons of `memberId` held for the next report of their subject (`orphans`): the
   * operators' `/operator forget` (plan 8G) calls it once the removal has committed, so that their id
   * and name are not written back with somebody's next report.
   */
  forgetReporter(memberId: string): void {
    for (const key of this.orphans.keys()) {
      const reasons = this.orphans.get(key) ?? [];
      const kept = reasons.filter((one) => one.reporterId !== memberId);
      if (kept.length === reasons.length) continue;
      if (kept.length === 0) this.orphans.delete(key);
      else this.orphans.set(key, kept);
    }
  }

  /** Keeps reasons of a report that is gone for the next report of the same subject. */
  private orphan(subject: ModerationReport['subject'], reasons: readonly ReportReason[]): void {
    if (reasons.length === 0) return;
    const key = reportTargetKey(subject);
    this.orphans.set(key, [...(this.orphans.get(key) ?? []), ...reasons]);
  }

  /**
   * The sweep (at start and with the appeals' sweep, `PartySchedulerOptions.requests`): the open
   * reports of parties that are over end (their posts edited; the bot stopped before the listener
   * saw the end), and a report never posted for `STRANDED_MS` is forgotten, its reasons kept for
   * the next report of its subject. Never throws (logged).
   */
  async sweep(): Promise<void> {
    const { storage, store, log } = this.options;
    try {
      for (const report of await storage.unpostedReports(this.now() - STRANDED_MS)) {
        await storage.discardReport(report.id);
        this.orphan(report.subject, report.reasons);
        log.warn({ report: report.id }, 'a report never got its post; it is forgotten');
      }
      for (const report of await storage.openPartyReports()) {
        if (report.subject.kind !== 'party' || store.get(report.subject.partyId)) continue;
        if (await storage.decideReport(report.id, 'ended', null, null)) await this.show(report.id);
      }
    } catch (err) {
      log.error({ err }, 'could not sweep the reports');
    }
  }

  /**
   * A moderator's decision of a report (a press on its post, or on the private question of an
   * action that ends a party): one conditional change of the stored report, so the first press
   * wins (`decided-before`, with the report as it was decided). `close` ends the party, `refuse`
   * also refuses its place for good (as Refuse from now on, with the report's post as the ruling's
   * source), `block` also blocks its maker as Block member does (their other meetups archived, one
   * DM); the party's post is archived or deleted as `removal` says (deleting where the bot may
   * not is refused before anything changes: `may-not-delete`), and the history records the end
   * as `/delete`'s (`cancelled`). `dismiss` changes nothing else. The report's post is edited
   * to the outcome without its buttons. A party that ended first ends the report (`ended`). A
   * report of another server than the presser's is `gone`; an action it does not offer, or an
   * ending one without `removal`, `not-offered`; Refuse place… where the place is now a pin or
   * none, `no-place`. Where a step of the work fails the report is opened again, and `failed`
   * says what was done before it (a ruling and a block stay) and whether it is open again.
   * Discord refusing to delete the post leaves it archived, kept as removal `denied`.
   */
  async decide(
    reportId: string,
    action: ReportAction,
    removal: PostRemoval | null,
    moderator: NamedMember,
    serverId: string,
    serverName?: string,
  ): Promise<ReportDecision> {
    const { storage, parties, store, log } = this.options;
    const report = await storage.report(reportId);
    if (!report || report.serverId !== serverId) return { kind: 'gone' };
    if (report.status !== 'open') return { kind: 'decided-before', report };
    const ending = ENDING_ACTIONS.includes(action);
    if (!reportActions(report).includes(action) || (ending && removal === null)) {
      return { kind: 'not-offered' };
    }
    const { subject } = report;
    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: this.now() };
    if (action === 'dismiss') return this.settle(report, 'dismissed', null, by);
    if (subject.kind === 'message') {
      return this.deleteMessage(report, subject, by);
    }
    if (subject.kind !== 'party' || removal === null) return { kind: 'not-offered' };
    const party = store.get(subject.partyId);
    if (!party) {
      // Over before anybody decided, and the listener has not said so yet.
      await this.partyEnded(subject.partyId);
      return this.decidedBefore(report);
    }
    if (removal === 'delete' && !parties.mayDeletePost(party.id)) {
      return { kind: 'may-not-delete', forumId: party.forumChannelId };
    }
    // What the post shows of the party, and the place refused, as they are now.
    const now = this.subjectOf(party);
    // A place that became a pin (or none) since the report has no ruling to make.
    if (action === 'refuse' && (now.place === null || now.place.kind === 'pin')) {
      return { kind: 'no-place' };
    }
    const status = action === 'refuse' ? 'refused' : action === 'block' ? 'blocked' : 'closed';
    // The first press wins: the decision is kept first. Its work follows; where a step of it
    // fails, the report is opened again (its buttons back) and the moderator told.
    if (!(await storage.decideReport(report.id, status, removal, by))) {
      return this.decidedBefore(report);
    }
    await storage.setSubject(report.id, now).catch((err: unknown) => {
      log.warn({ err, report: report.id }, 'could not keep what a report shows');
    });
    let blocked: { newBlock: boolean; closed: number; withdrawn: number } | undefined;
    let removed: PostRemoved | false;
    let placeRefused = false;
    try {
      if (action === 'refuse' && now.place !== null && now.place.kind !== 'pin') {
        const { channelId, messageId } = report;
        if (channelId === null || messageId === null) throw new Error('the report has no post');
        await this.options.safety.refusePlace(serverId, now.place, by, {
          kind: 'report',
          id: report.id,
          channelId,
          messageId,
        });
        placeRefused = true;
      }
      if (action === 'block') {
        // The maker's other meetups are closed archived; this one as the moderator chose.
        blocked = await this.options.safety.blockMember(
          serverId,
          { id: now.makerId, name: now.makerName },
          by,
          { ...(serverName === undefined ? {} : { serverName }), except: party.id },
        );
      }
      removed = await parties.endAs(party.id, undefined, {
        lastWords: `This ${partyWord(party)} was closed by the moderators.`,
        removal,
        ended: closedEnd('moderators'),
        // The audit log names the moderator who decided.
        by: moderator,
      });
    } catch (err) {
      log.error({ err, report: report.id }, 'could not carry out a decision of a report');
      // Opened again for another try (what was done stays: a ruling and a block are kept once).
      const reopened = await storage.reopenReport(report.id).catch((reopenErr: unknown) => {
        log.error({ err: reopenErr, report: report.id }, 'could not open a report again');
        return false;
      });
      await this.show(report.id);
      return {
        kind: 'failed',
        word: partyWord(party),
        placeRefused,
        blocked: blocked !== undefined,
        reopened,
      };
    }
    // Over between the press and the closing: Delete post deletes the post all the same.
    if (removed === false && removal === 'delete' && now.postId !== null) {
      removed = (await parties.deletePostOf(now.postId)) === 'deleted' ? 'deleted' : 'archived';
    }
    const refusedDeletion = removal === 'delete' && removed === 'archived';
    // A deletion the network failed is redone (`redoClosings`): it stays `delete` (review r1 C1).
    const deletionPending = removed === 'deleting';
    if (refusedDeletion) {
      await storage.setRemoval(report.id, 'denied').catch((err: unknown) => {
        log.warn({ err, report: report.id }, 'could not keep how a reported post went');
      });
    }
    await this.show(report.id);
    const decided: ModerationReport = {
      ...report,
      subject: now,
      status,
      removal: refusedDeletion ? 'denied' : removal,
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    };
    return {
      kind: 'done',
      report: decided,
      ...(blocked ?? {}),
      ...(refusedDeletion ? { refusedDeletion } : {}),
      ...(deletionPending ? { deletionPending } : {}),
    };
  }

  /**
   * Delete message: the report claimed first (the first press wins, so a Dismiss at the same
   * moment leaves the message), then the message deleted. Where the bot may not delete it, or
   * deleting fails, the report is opened again; a message deleted already makes it `gone`.
   */
  private async deleteMessage(
    report: ModerationReport,
    subject: MessageSubject,
    by: Decider,
  ): Promise<ReportDecision> {
    const { storage, gateway, log } = this.options;
    if (!(await storage.decideReport(report.id, 'deleted', null, by))) {
      return this.decidedBefore(report);
    }
    let deleted: Awaited<ReturnType<typeof gateway.deleteReported>> | undefined;
    try {
      deleted = await gateway.deleteReported(subject.channelId, subject.messageId);
    } catch (err) {
      log.error({ err, report: report.id }, 'could not delete a reported message');
    }
    if (deleted === undefined || deleted === 'not-allowed') {
      const reopened = await storage.reopenReport(report.id).catch((err: unknown) => {
        log.error({ err, report: report.id }, 'could not open a report again');
        return false;
      });
      await this.show(report.id);
      if (deleted === 'not-allowed' && reopened) {
        return { kind: 'may-not-delete-message', channelId: subject.channelId };
      }
      return { kind: 'failed', word: 'message', placeRefused: false, blocked: false, reopened };
    }
    const status = deleted === 'deleted' ? 'deleted' : 'gone';
    if (status === 'gone') {
      await storage.markGone(report.id).catch((err: unknown) => {
        log.warn({ err, report: report.id }, 'could not keep that a reported message was gone');
      });
    }
    await this.show(report.id);
    const decided: ModerationReport = {
      ...report,
      status,
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    };
    return { kind: 'done', report: decided };
  }

  /** Decides a report that needs nothing else (Dismiss), and shows it. */
  private async settle(
    report: ModerationReport,
    status: Exclude<ReportStatus, 'open'>,
    removal: PostRemoval | null,
    by: Decider,
  ): Promise<ReportDecision> {
    if (!(await this.options.storage.decideReport(report.id, status, removal, by))) {
      return this.decidedBefore(report);
    }
    const decided: ModerationReport = {
      ...report,
      status,
      removal,
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    };
    await this.show(report.id);
    return { kind: 'done', report: decided };
  }

  /** A decision that came second: the report as the first one left it. */
  private async decidedBefore(report: ModerationReport): Promise<ReportDecision> {
    const now = await this.options.storage.report(report.id);
    return now ? { kind: 'decided-before', report: now } : { kind: 'gone' };
  }

  /** The open reports of a server, oldest first (`/places`). */
  openReports(serverId: string): Promise<ModerationReport[]> {
    return this.options.storage.openReports(serverId);
  }

  /** A report as it is kept; undefined for none. */
  reportOf(id: string): Promise<ModerationReport | undefined> {
    return this.options.storage.report(id);
  }

  /** What the moderators' post shows of a party, as it is now. */
  subjectOf(party: Party): PartySubject {
    const { parties, regions } = this.options;
    const place = this.placeOfParty(party);
    const gym = place?.kind === 'gym' ? this.gym(place.id) : undefined;
    const official =
      gym?.nickname !== null && gym?.nickname !== undefined && gym.nickname !== gym.name
        ? gym.name
        : null;
    const region = party.regionId === null ? undefined : regions.byId(party.regionId);
    const brief = parties.briefOf(party);
    return {
      kind: 'party',
      partyId: party.id,
      partyType: party.type,
      title: cutWhole(parties.postTitle(party), 200),
      // Where is the post's own section (with a gym's official name): not the brief's line of it.
      lines: brief.lines
        .filter((line) => line !== brief.whereLine)
        .slice(0, MAX_LINES)
        .map((line) => cutWhole(line, LINE_ROOM)),
      regionChannelId: region?.channelId ?? null,
      postId: party.forumPostId,
      place,
      officialName: official,
      makerId: party.createdById,
      makerName: party.makerName ?? null,
      information: isMeetup(party) ? party.meetup.description : null,
    };
  }

  /**
   * Where a party is: a raid's gym, a train's current stop, a meetup's place as it is now, a max
   * battle's spot (a power spot as it was named, a pin as a pin: plan 8X-3).
   */
  private placeOfParty(party: Party): Place | null {
    if (isMeetup(party)) return this.options.parties.placeOf(party);
    if (isMax(party)) return party.max.spot;
    const at = isTrain(party) ? currentStop(party) : undefined;
    if (at?.kind === 'powerspot') {
      // A power spot of a train's route (plan 8X-4), as it is kept now.
      const { wayspots } = this.options;
      const kept = wayspots?.byId(at.id);
      return wayspots && kept?.kind === 'powerspot'
        ? spotPlace(kept, wayspots.addressOf(kept))
        : null;
    }
    const gymId = isTrain(party) ? at?.id : party.gymId;
    const gym = gymId === undefined || gymId === null ? undefined : this.options.gyms?.get(gymId);
    return gym === undefined ? null : gymPlace(gym);
  }

  private gym(id: string): Gym | undefined {
    return /^\d+$/u.test(id) ? this.options.gyms?.get(Number(id)) : undefined;
  }

  /** A party ended without a moderator: its open reports end with it. */
  private async partyEnded(partyId: string): Promise<void> {
    const { storage } = this.options;
    for (const report of await storage.openReportsOfParty(partyId)) {
      if (await storage.decideReport(report.id, 'ended', null, null)) {
        this.endedOf.set(partyId, [...(this.endedOf.get(partyId) ?? []), report.id]);
        await this.show(report.id);
      }
    }
  }

  /**
   * Staff closed a party with `/delete`'s question (plan 8S-2 review): its reports read closed by
   * them, the post gone as `removal` says (`denied` where Discord refused to delete it and it was
   * archived), not over before a moderator decided. Called once the party has ended: the end's
   * listener, which settles them as `ended`, is waited for, and those it settled are restated
   * (`closeEnded`), as is a report still open. Never throws (logged).
   */
  async closedByStaff(partyId: string, removal: ReportRemoval, by: NamedMember): Promise<void> {
    const { storage, log } = this.options;
    const decider: Decider = { id: by.id, name: by.name ?? null, at: this.now() };
    try {
      while (this.pending.size > 0) await Promise.all([...this.pending]);
      await this.pinOver(partyId, { kind: 'closed', by });
      for (const report of await storage.openReportsOfParty(partyId)) {
        if (await storage.decideReport(report.id, 'ended', null, null)) {
          this.endedOf.set(partyId, [...(this.endedOf.get(partyId) ?? []), report.id]);
        }
      }
      const ended = this.endedOf.get(partyId) ?? [];
      this.endedOf.delete(partyId);
      for (const id of ended) {
        if (await storage.closeEnded(id, removal, decider)) await this.show(id);
      }
    } catch (err) {
      log.error({ err, party: partyId }, 'could not close the reports of a party staff closed');
    }
  }

  /**
   * Shows a report in its post as it is kept now: read just before the edit, one edit at a time
   * per report (so that an older edit never lands after a newer one). A failure is logged.
   */
  private show(reportId: string): Promise<void> {
    const tail = (this.showing.get(reportId) ?? Promise.resolve()).then(() =>
      this.redraw(reportId),
    );
    this.showing.set(reportId, tail);
    return tail;
  }

  private async redraw(reportId: string): Promise<void> {
    const { storage, gateway, log } = this.options;
    try {
      const report = await storage.report(reportId);
      if (!report || report.channelId === null || report.messageId === null) return;
      await gateway.editMessage(report.channelId, report.messageId, reportMessage(report));
    } catch (err) {
      log.warn({ err, report: reportId }, 'could not show a report as it is now');
    }
  }
}

/** A kept power spot as a place a report shows. */
function spotPlace(spot: Wayspot, address: string): Place {
  return {
    kind: 'powerspot',
    id: spot.id,
    title: spot.title,
    lat: spot.lat,
    lon: spot.lon,
    address: address || null,
    image: spot.image,
  };
}

/** A gym as a place (its nickname first, as its post names it). */
function gymPlace(gym: Gym): Place {
  return {
    kind: 'gym',
    id: String(gym.id),
    title: gym.nickname || gym.name,
    lat: gym.lat,
    lon: gym.lon,
    address: addressLine(gym.geodata) || null,
    image: gym.imageUrl,
  };
}
