import type { KnownPlace, Place } from '../geo/place.js';
import type { Team } from '../party/party.js';
import type { PlaceRuling, RulingKey } from './safety.js';

/**
 * What meetup safety keeps (plan 8S-1): the requests held for the moderators, the rulings of
 * places, the blocks of members and their appeals. Servers and members are snowflakes; times are
 * epoch milliseconds. Kept in the database (`MeetupSafetyRepository`), so that a press on a
 * moderators' post still works after a restart.
 */

/**
 * Where a request stands: waiting for a moderator; approved (the meetup is made, `partyId`);
 * refused (also by a block of its maker); expired unanswered; failed (approved, but the meetup
 * could not be made, or the bot stopped before it was); withdrawn (its maker was blocked over
 * another request, while it waited or while it was being approved: no meetup).
 */
export type RequestStatus = 'pending' | 'approved' | 'refused' | 'expired' | 'failed' | 'withdrawn';

/** What a moderator pressed on a request's post. */
export type RequestDecision = 'approve' | 'approve-once' | 'refuse' | 'refuse-forever' | 'block';

export const REQUEST_DECISIONS: readonly RequestDecision[] = [
  'approve',
  'approve-once',
  'refuse',
  'refuse-forever',
  'block',
];

/** A meetup as its maker asked for it, held for a moderator. */
export interface MeetupRequestRecord {
  /** A UUID, made before the row: it is in the custom ids of the moderators' post. */
  id: string;
  serverId: string;
  /** The region channel `/meetup` was used in: the meetup's post goes into that region's forum. */
  regionChannelId: string;
  /**
   * Who asked; null once the owner removed their data on request (plan 8G: only on a request
   * that is decided and over, never on one still pending or approved without its meetup).
   */
  makerId: string | null;
  /** The maker's display name and team when they asked (for the post's sign-up list). */
  makerName: string | null;
  makerTeam: Team | null;
  place: Place;
  name: string;
  startTime: number;
  /** When it ends (`/meetup end:`, migration 047); null without an end. */
  endTime: number | null;
  description: string;
  createdAt: number;
  expiresAt: number;
  status: RequestStatus;
  /** The moderators' post: its channel and message (sent before the request is stored). */
  channelId: string;
  messageId: string;
  decision: RequestDecision | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: number | null;
  /** The meetup an approval made. */
  partyId: string | null;
  /**
   * Where the maker asked for it: `map`, the live map (plan 8M-5M), which its post says; null
   * for `/meetup`.
   */
  source: RequestSource | null;
  /**
   * Of a `failed` request: why its meetup could not be made (plan 8S-4), which its post names
   * for the other moderators; null for every other request, and for one that failed before the
   * reason was kept (or whose reason does not read).
   */
  failure: ApprovalFailure | null;
}

/**
 * Why an approved meetup could not be made, kept as a kind the post turns into words: its name
 * or information could not be a meetup's (`bad-name`, `bad-description`), its region or the
 * region's forum is gone (`no-region`, `no-forum`), its post could not be made (`no-post`), or
 * the bot may not make posts in the forum (`posts-refused`: which forum, and what it lacks
 * there by the names its settings show, none when Discord refused all the same); somebody
 * keeps its maker out of the forum its post would be in by the approval (`kept-out`, plan 8Z-2);
 * `error`: anything else (a throw, the bot stopped before the meetup was made).
 */
export type ApprovalFailure =
  | {
      kind:
        | 'bad-name'
        | 'bad-description'
        | 'no-region'
        | 'no-forum'
        | 'no-post'
        | 'kept-out'
        | 'error';
    }
  | { kind: 'posts-refused'; forumId: string; missing: readonly string[] };

const PLAIN_FAILURES: readonly Exclude<ApprovalFailure, { forumId: string }>['kind'][] = [
  'bad-name',
  'bad-description',
  'no-region',
  'no-forum',
  'no-post',
  'kept-out',
  'error',
];

/** A failure as it was kept (parsed JSON), or null when it is none or does not read. */
export function approvalFailureOf(value: unknown): ApprovalFailure | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null;
  const { kind } = value;
  if (kind === 'posts-refused') {
    const forumId = 'forumId' in value ? value.forumId : undefined;
    const missing = 'missing' in value ? value.missing : undefined;
    if (typeof forumId !== 'string' || !Array.isArray(missing)) return null;
    if (!missing.every((one): one is string => typeof one === 'string')) return null;
    return { kind, forumId, missing };
  }
  const plain = PLAIN_FAILURES.find((one) => one === kind);
  return plain === undefined ? null : { kind: plain };
}

/** Where a meetup was asked for other than by `/meetup`: the live map. */
export type RequestSource = 'map';

/**
 * A request whose maker is known: every request but one decided and over whose maker the owner
 * removed on request (plan 8G). Only such a request can be approved, block its maker or tell them.
 */
export type MakerKnown = MeetupRequestRecord & { makerId: string };

export function makerKnown(request: MeetupRequestRecord): request is MakerKnown {
  return request.makerId !== null;
}

/**
 * An appeal or an ask whose member is known: every one but those decided and over whose member
 * the owner removed on request (plan 8G).
 */
export function memberKnown<T extends { memberId: string | null }>(
  record: T,
): record is T & { memberId: string } {
  return record.memberId !== null;
}

/** A request as it is first stored: pending, with its post, without a decision, by a member. */
export type NewMeetupRequest = Omit<
  MeetupRequestRecord,
  | 'status'
  | 'decision'
  | 'decidedBy'
  | 'decidedByName'
  | 'decidedAt'
  | 'partyId'
  | 'failure'
  | 'makerId'
> & { makerId: string };

/**
 * What came of an approval: the meetup made (`partyId`), none (`failed`, with why), or none
 * because its maker was blocked meanwhile (`withdrawn`).
 */
export type ApprovalOutcome = { partyId: string } | { failed: ApprovalFailure } | 'withdrawn';

/** Who decided something, and when. */
export interface Decider {
  id: string;
  name: string | null;
  at: number;
}

/** A member blocked from making meetups in a server, until a moderator lifts it. */
export interface MeetupBlock {
  serverId: string;
  memberId: string;
  /**
   * The member's name when they were blocked (plan 8S-2: the request's or the reported party's
   * maker), for the lists of `/places`; null for a block of 8S-1, or where none was known.
   */
  memberName: string | null;
  blockedBy: string;
  blockedByName: string | null;
  blockedAt: number;
}

/** As much as an appeal says. */
export const MAX_APPEAL = 1000;

/**
 * Where an appeal stands: with the moderators; lifted or kept by one; or expired (nobody
 * decided in time, or its post was never made: the member may appeal again).
 */
export type AppealStatus = 'open' | 'lifted' | 'kept' | 'expired';

/** A blocked member's appeal to the moderators. */
export interface MeetupAppeal {
  /** A UUID, in the custom ids of its post. */
  id: string;
  serverId: string;
  /** Who appealed; null once the owner removed their data on request (plan 8G: decided only). */
  memberId: string | null;
  memberName: string | null;
  text: string;
  createdAt: number;
  status: AppealStatus;
  channelId: string | null;
  messageId: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: number | null;
}

export type NewMeetupAppeal = Pick<
  MeetupAppeal,
  'id' | 'serverId' | 'memberName' | 'text' | 'createdAt'
> & { memberId: string };

/**
 * The moderators' post a ruling came from (plan 8S-2): a request's (Approve, Refuse from now
 * on), a report's (Refuse place…) or an ask's (Allow place).
 */
export interface RulingSource {
  kind: 'request' | 'report' | 'ask';
  id: string;
  channelId: string;
  messageId: string;
}

/** A server's ruling of a place as it is kept, with who made it, when and from where. */
export interface PlaceRulingRecord {
  serverId: string;
  key: RulingKey;
  ruling: PlaceRuling;
  ruledBy: string;
  ruledByName: string | null;
  ruledAt: number;
  /** The place as it was ruled; null for a ruling made before plan 8S-2. */
  place: KnownPlace | null;
  source: RulingSource | null;
  /** When a moderator last kept the refusal on an ask: members may ask again 14 days later. */
  keptAt: number | null;
}

/** What else a ruling keeps besides the decision: the place and the post it came from. */
export interface RulingMore {
  place?: KnownPlace;
  source?: RulingSource;
}

/**
 * Where an ask about a refused place stands (plan 8S-2): with the moderators; allowed (the
 * place is allowed from now on); kept (refused still, the 14 days begin again); or expired
 * (nobody decided in seven days, or its post was never made); undone (a moderator undid the
 * place's ruling on `/places`: there is nothing to ask about any more).
 */
export type AskStatus = 'open' | 'allowed' | 'kept' | 'expired' | 'undone';

/** As much as an ask says. */
export const MAX_ASK = 1000;

/** A member's ask to allow meetups at a place the moderators refused for good. */
export interface PlaceAskRecord {
  /** A UUID, in the custom ids of its post. */
  id: string;
  serverId: string;
  key: RulingKey;
  /** The place as the member named it. */
  place: KnownPlace;
  /** Who asked; null once the owner removed their data on request (plan 8G: decided only). */
  memberId: string | null;
  memberName: string | null;
  text: string;
  createdAt: number;
  status: AskStatus;
  channelId: string | null;
  messageId: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: number | null;
}

export type NewPlaceAsk = Pick<
  PlaceAskRecord,
  'id' | 'serverId' | 'key' | 'place' | 'memberName' | 'text' | 'createdAt'
> & { memberId: string };

/** What meetup safety keeps: `MeetupSafetyRepository`, and `MemoryMeetupSafety` in tests. */
export interface MeetupSafetyStore {
  /** A server's ruling of a place; undefined for none. */
  ruling(serverId: string, key: RulingKey): Promise<PlaceRuling | undefined>;
  /** A server's ruling of a place as it is kept; undefined for none. */
  rulingRecord(serverId: string, key: RulingKey): Promise<PlaceRulingRecord | undefined>;
  /**
   * Rules a place for good, in place of a ruling it had (whose kept refusal, `keptAt`, goes with
   * it), with the place and the post it came from when given.
   */
  rule(
    serverId: string,
    key: RulingKey,
    ruling: PlaceRuling,
    by: Decider,
    more?: RulingMore,
  ): Promise<void>;
  /**
   * Removes a place's ruling (Undo ruling), and closes the place's open ask as `undone` in the
   * same step (no decider): the ruling that was removed and the ask closed, undefined for none.
   */
  undoRuling(
    serverId: string,
    key: RulingKey,
  ): Promise<{ ruling: PlaceRulingRecord; ask: PlaceAskRecord | undefined } | undefined>;

  /** The member's block in a server, while it stands. */
  block(serverId: string, memberId: string): Promise<MeetupBlock | undefined>;
  /**
   * Blocks a member; false when they are blocked already (the first block stands). A block
   * lifted before is blocked again in its place: only the last lift is kept.
   */
  addBlock(
    serverId: string,
    memberId: string,
    by: Decider,
    memberName?: string | null,
  ): Promise<boolean>;
  /**
   * Block member on a request, in one step: the request, while pending, is refused (`decision`
   * `block`), and its maker blocked in its server. `decided` false: it was not pending any more
   * (the first press won), and nobody is blocked by this one; `newBlock` false: a block stood
   * already. Its own transaction (read committed, against deadlocks): it never joins a
   * caller's, and throws when asked to (`inTransaction`).
   */
  blockMaker(
    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerName'> & { makerId: string },
    by: Decider,
  ): Promise<{ decided: boolean; newBlock: boolean }>;
  /** Lifts a member's block, keeping who lifted it (the last lift); false when none stood. */
  liftBlock(serverId: string, memberId: string, by: Decider): Promise<boolean>;
  /**
   * Lift block on an appeal, in one step: the appeal, while open, is decided `lifted`, and the
   * member's block in its server lifted. False when it was not open any more (the first press
   * won): nothing is lifted.
   */
  /**
   * Lift block from `/places` (plan 8S-2), in one step: the member's block lifted (who lifted it
   * kept), and their open appeal, if any, decided `lifted`. `lifted` false when no block stood.
   */
  liftWithAppeal(
    serverId: string,
    memberId: string,
    by: Decider,
  ): Promise<{ lifted: boolean; appeal: MeetupAppeal | undefined }>;
  liftOnAppeal(
    appeal: Pick<MeetupAppeal, 'id' | 'serverId'> & { memberId: string },
    by: Decider,
  ): Promise<boolean>;

  /** Stores a new request, pending, with its post. */
  addRequest(request: NewMeetupRequest): Promise<void>;
  request(id: string): Promise<MeetupRequestRecord | undefined>;
  /**
   * Decides a pending request: one conditional change, so that of two presses the first wins.
   * False when it was not pending any more (or is gone).
   */
  decideRequest(
    id: string,
    status: Exclude<RequestStatus, 'pending' | 'failed'>,
    decision: RequestDecision | null,
    by: Decider | null,
  ): Promise<boolean>;
  /**
   * What came of an approval (`ApprovalOutcome`), once: false when the request is not approved
   * and without its meetup any more (settled before).
   */
  settleApproval(id: string, outcome: ApprovalOutcome): Promise<boolean>;
  /**
   * The approvals decided at `decidedBefore` or earlier that never got their meetup (the bot
   * stopped between the decision and the meetup), oldest first.
   */
  strandedApprovals(decidedBefore: number): Promise<MeetupRequestRecord[]>;
  /** A member's pending requests in a server, oldest first. */
  pendingOf(serverId: string, makerId: string): Promise<MeetupRequestRecord[]>;
  /**
   * The approved request that made this meetup of its maker (plan 8Z); undefined for a meetup
   * that needed none, also one at a place an earlier Approve allowed.
   */
  approvedRequestOf(
    serverId: string,
    makerId: string,
    partyId: string,
  ): Promise<MeetupRequestRecord | undefined>;
  /**
   * The pending requests whose time is up at `now`, oldest first. One of them that cannot be
   * read is marked failed instead (and logged, once).
   */
  duePending(now: number): Promise<MeetupRequestRecord[]>;

  /** Stores a new appeal, open; `open` when the member has one open already in that server. */
  addAppeal(appeal: NewMeetupAppeal): Promise<'added' | 'open'>;
  discardAppeal(id: string): Promise<void>;
  setAppealPost(id: string, channelId: string, messageId: string): Promise<void>;
  appeal(id: string): Promise<MeetupAppeal | undefined>;
  /** The member's open appeal in a server. */
  openAppeal(serverId: string, memberId: string): Promise<MeetupAppeal | undefined>;
  /** When a moderator last kept the member's block on an appeal; undefined for never. */
  lastKept(serverId: string, memberId: string): Promise<number | undefined>;
  /**
   * Decides an open appeal, the first press winning (`expired` without a decider); false when
   * it was not open.
   */
  decideAppeal(
    id: string,
    status: Exclude<AppealStatus, 'open'>,
    by: Decider | null,
  ): Promise<boolean>;
  /**
   * The open appeals that are stale: whose post was never recorded and that were made at
   * `unpostedBefore` or earlier, or that were made at `openedBefore` or earlier. Oldest first.
   */
  staleAppeals(stale: { unpostedBefore: number; openedBefore: number }): Promise<MeetupAppeal[]>;

  /** Stores a new ask, open; `open` when the place has one open already in that server. */
  addAsk(ask: NewPlaceAsk): Promise<'added' | 'open'>;
  discardAsk(id: string): Promise<void>;
  setAskPost(id: string, channelId: string, messageId: string): Promise<void>;
  ask(id: string): Promise<PlaceAskRecord | undefined>;
  /** The open ask of a place in a server. */
  openAsk(serverId: string, key: RulingKey): Promise<PlaceAskRecord | undefined>;
  /** Expires an open ask (nobody decided in time); false when it was not open. */
  expireAsk(id: string): Promise<boolean>;
  /**
   * Allow place on an ask, in one step: the ask, while open, is decided `allowed`, and the place
   * allowed for good (its source the ask's post). False when it was not open (the first press
   * won): nothing is ruled.
   */
  allowOnAsk(ask: PlaceAskRecord, by: Decider): Promise<boolean>;
  /**
   * Keep refused on an ask, in one step: the ask, while open, is decided `kept`, and the place's
   * refusal kept (`keptAt`: the 14 days begin again). `not-open` when it was not open (the first
   * press won); `not-refused` when no refusal of the place stands (undone or allowed meanwhile):
   * nothing is decided or kept.
   */
  keepOnAsk(ask: PlaceAskRecord, by: Decider): Promise<'kept' | 'not-open' | 'not-refused'>;
  /** The open asks that are stale (as `staleAppeals`), oldest first. */
  staleAsks(stale: { unpostedBefore: number; openedBefore: number }): Promise<PlaceAskRecord[]>;

  /** What `/places` lists of a server (plan 8S-2), each oldest first: its rulings, */
  rulings(serverId: string): Promise<PlaceRulingRecord[]>;
  /** its pending requests, */
  pendingIn(serverId: string): Promise<MeetupRequestRecord[]>;
  /** its open asks, */
  openAsks(serverId: string): Promise<PlaceAskRecord[]>;
  /** the blocks that stand, */
  blocks(serverId: string): Promise<MeetupBlock[]>;
  /** and its open appeals. */
  openAppeals(serverId: string): Promise<MeetupAppeal[]>;
}
