import { z } from 'zod';
import type { Place } from '../geo/place.js';
import type { Decider } from '../meetups/records.js';
import type { PartyType } from '../party/party.js';
import { PARTY_TYPES } from '../party/party.js';
import { placeDocument } from '../party/party-state.js';

/**
 * Reports to the moderators (plan 8S-2; spec `2026-10-17-moderation-reports-design.md`): a
 * member reports a party (`/report`, or "Report to moderators" in the Apps menu of its post) or
 * a single message, privately, with a reason; the moderators decide on the report's post in
 * their channel. Reports of one party or one message gather on one open report, a reason per
 * reporter. Kept in the database (`ReportRepository`), so that a press on an old post works
 * after a restart.
 */

/**
 * Where a report stands: open; for a party, `closed` (ended by a moderator), `refused` (a
 * meetup ended and its place refused for good), `blocked` (a meetup ended and its maker
 * blocked), `ended` (the party ended by itself first); for a message, `deleted` (a moderator
 * deleted it) or `gone` (it was deleted before); `dismissed` for either.
 */
export const REPORT_STATUSES = [
  'open',
  'closed',
  'refused',
  'blocked',
  'deleted',
  'dismissed',
  'ended',
  'gone',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** How a party's post went when a moderator ended the party: archived and locked, or deleted. */
export type PostRemoval = 'archive' | 'delete';

/**
 * How a party's post went, as a decided report keeps it: as chosen, or `denied` where Delete
 * post was chosen and Discord refused to delete it (the post archived instead).
 */
export type ReportRemoval = PostRemoval | 'denied';

/** As much as a reason says. */
export const MAX_REPORT_REASON = 1000;

/** What the moderators' post shows of a reported party: as it was when it was last reported. */
export interface PartySubject {
  kind: 'party';
  partyId: string;
  partyType: PartyType;
  /** The post's title. */
  title: string;
  /** What the party is and when, as a direct message's brief says it (`PartyBrief.lines`). */
  lines: string[];
  /** The region's text channel; null for a party whose region is gone. */
  regionChannelId: string | null;
  postId: string | null;
  /** Where it is: a raid's gym, a train's stop, a meetup's place; null for none. */
  place: Place | null;
  /** A gym's official name when its post shows another (its nickname). */
  officialName: string | null;
  makerId: string;
  makerName: string | null;
  /** What a meetup's members wrote about it. */
  information: string | null;
}

/** What the moderators' post shows of a reported message: a copy, kept when it is deleted. */
export interface MessageSubject {
  kind: 'message';
  channelId: string;
  messageId: string;
  authorId: string;
  authorName: string | null;
  /** When it was written. */
  sentAt: number;
  /** Its text, cut to `MESSAGE_COPY_ROOM`. */
  text: string;
  /** The names of its attachments (Discord deletes the files of a deleted message). */
  attachments: string[];
  /** The party whose post it is in, when it is: named in the moderators' post. */
  partyTitle: string | null;
  /**
   * True once a later report found its text or attachments changed: the copy stays the first
   * report's (what was reported), and the post says it was edited since.
   */
  edited?: boolean;
  /** True when it is a forward: `text` and `attachments` are those of the message it forwards. */
  forwarded?: boolean;
}

export type ReportSubject = PartySubject | MessageSubject;

/** As much of a reported message's text as is kept and shown. */
export const MESSAGE_COPY_ROOM = 1500;

/** As many of a reported message's attachments as are named. */
export const MAX_ATTACHMENT_NAMES = 10;

const snowflake = z.string().min(1).max(30);
const text = (max: number) => z.string().max(max);

/** The subject as it is stored (`ModerationReport.subject`), checked when it is read. */
export const reportSubject = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('party'),
    partyId: z.string().min(1).max(36),
    partyType: z.enum(PARTY_TYPES),
    title: text(200),
    lines: z.array(text(1000)).max(10),
    regionChannelId: snowflake.nullable(),
    postId: snowflake.nullable(),
    place: placeDocument.nullable(),
    officialName: text(255).nullable(),
    makerId: snowflake,
    makerName: text(100).nullable(),
    information: text(2000).nullable(),
  }),
  z.object({
    kind: z.literal('message'),
    channelId: snowflake,
    messageId: snowflake,
    authorId: snowflake,
    authorName: text(100).nullable(),
    sentAt: z.number().int().nonnegative(),
    text: text(MESSAGE_COPY_ROOM),
    attachments: z.array(text(255)).max(MAX_ATTACHMENT_NAMES),
    partyTitle: text(200).nullable(),
    edited: z.boolean().optional(),
    forwarded: z.boolean().optional(),
  }),
]);

/**
 * What a report of a message keeps when another member reports it: the first copy (what was
 * reported; the author may have edited it since), marked `edited` when this one differs in its
 * text or attachments. The same object when nothing is to change.
 */
export function messageSeenAgain(kept: MessageSubject, now: MessageSubject): MessageSubject {
  if (kept.edited === true) return kept;
  const same =
    kept.text === now.text &&
    kept.attachments.length === now.attachments.length &&
    kept.attachments.every((name, i) => name === now.attachments[i]);
  return same ? kept : { ...kept, edited: true };
}

/** One member's reason. */
export interface ReportReason {
  /** Who gave it; null once the owner removed their data on request (plan 8G). */
  reporterId: string | null;
  reporterName: string | null;
  text: string;
  at: number;
}

/** A report to the moderators, with its reasons in the order they came. */
export interface ModerationReport {
  /** A UUID, in the custom ids of its post. */
  id: string;
  serverId: string;
  subject: ReportSubject;
  createdAt: number;
  status: ReportStatus;
  /** How a party's post went, once a moderator ended the party. */
  removal: ReportRemoval | null;
  /** The moderators' post: null until it is sent. */
  channelId: string | null;
  messageId: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: number | null;
  reasons: ReportReason[];
}

/** A report as it is first stored: open, without its post. */
export type NewReport = Pick<ModerationReport, 'id' | 'serverId' | 'subject' | 'createdAt'>;

/** What came of a reason given (`ReportStore.addReport`). */
export type ReasonAdded =
  /** A new report, with this reason as its first. */
  | { kind: 'opened'; report: ModerationReport }
  /** The reason joined the open report of the same party or message. */
  | { kind: 'added'; report: ModerationReport }
  /** This member has a reason in the open report already. */
  | { kind: 'already'; report: ModerationReport };

/**
 * The key of what a report is about, which one open report at a time may have: `party <id>`,
 * `message <channel> <message>`.
 */
export function reportTargetKey(
  subject:
    | Pick<PartySubject, 'kind' | 'partyId'>
    | Pick<MessageSubject, 'kind' | 'channelId' | 'messageId'>,
): string {
  return subject.kind === 'party'
    ? `party ${subject.partyId}`
    : `message ${subject.channelId} ${subject.messageId}`;
}

/** What is kept of reports: `ReportRepository`, and `MemoryReports` in tests. */
export interface ReportStore {
  /**
   * A member's reason: it opens a report of its subject (with `report`'s id), or joins the open
   * report of the same party or message (`added`), unless this member has a reason there already
   * (`already`). Opening one and its first reason are one step.
   */
  addReport(report: NewReport, reason: ReportReason): Promise<ReasonAdded>;
  report(id: string): Promise<ModerationReport | undefined>;
  /**
   * The open report of a subject by its key (`reportTargetKey`), with its reasons; undefined for
   * none (whether a member reported it already, asked before the form opens: plan 8S-3).
   */
  openReport(key: string): Promise<ModerationReport | undefined>;
  setReportPost(id: string, channelId: string, messageId: string): Promise<void>;
  /** What the post shows of the subject, as it is now (a party changed since it was reported). */
  setSubject(id: string, subject: ReportSubject): Promise<void>;
  /** Forgets a report whose post could not be sent, with its reasons. */
  discardReport(id: string): Promise<void>;
  /**
   * Decides an open report, the first decision winning: false when it was not open (or is gone).
   * `by` is null for what nobody decided (`ended`, `gone` found by the sweep).
   */
  decideReport(
    id: string,
    status: Exclude<ReportStatus, 'open'>,
    removal: PostRemoval | null,
    by: Decider | null,
  ): Promise<boolean>;
  /**
   * A report its party's end settled (`ended`, nobody decided) as closed by `by`, its post gone
   * as `removal` says: staff closed the party with `/delete` (the end's listener is quicker than
   * the closing). False when the report is not `ended`.
   */
  closeEnded(id: string, removal: ReportRemoval, by: Decider): Promise<boolean>;
  /** The open reports of a party (one at most, but a stale one may linger), oldest first. */
  openReportsOfParty(partyId: string): Promise<ModerationReport[]>;
  /**
   * Opens a decided report again (a moderator's decision whose work failed, plan 8S-2): open, its
   * decision forgotten. False when another report of its subject was opened meanwhile (it stays
   * decided).
   */
  reopenReport(id: string): Promise<boolean>;
  /**
   * A report decided as `deleted` whose message was found deleted already: `gone` (Delete message
   * claims the report first, then deletes).
   */
  markGone(id: string): Promise<void>;
  /** How a decided report's party post really went (Discord refused a deletion). */
  setRemoval(id: string, removal: ReportRemoval): Promise<void>;
  /** The open reports of parties, of every server, oldest first (the sweep). */
  openPartyReports(): Promise<ModerationReport[]>;
  /** The open reports of a server, oldest first. */
  openReports(serverId: string): Promise<ModerationReport[]>;
  /** The open reports whose post was never recorded and that were made at `before` or earlier. */
  unpostedReports(before: number): Promise<ModerationReport[]>;
}
