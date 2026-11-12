import { closedEnd, type PartyEnd } from '../domain/history/party-history.js';
import { randomUUID } from 'node:crypto';
import type { Settings } from '../config/settings.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import type { KnownPlace, Place } from '../domain/geo/place.js';
import {
  makerKnown,
  memberKnown,
  type ApprovalFailure,
  type Decider,
  type MakerKnown,
  type MeetupAppeal,
  type MeetupBlock,
  type MeetupRequestRecord,
  type MeetupSafetyStore,
  type RequestDecision,
  type RequestSource,
  type RulingSource,
  type PlaceAskRecord,
  type PlaceRulingRecord,
} from '../domain/meetups/records.js';
import { isMeetup, type MeetupParty } from '../domain/party/party.js';
import {
  askableAt,
  flaggedWordsOf,
  mayRequestReview,
  meetupPlaceVerdict,
  requestExpiry,
  rulingKeyOf,
  type MeetupVerdict,
  type PlaceRuling,
  type RulingKey,
} from '../domain/meetups/safety.js';
import type { MemberInfo } from '../domain/party/attendance.js';
import { tidyDescription } from '../domain/party/meetup.js';
import { tidyName } from '../domain/party/timed.js';
import type { Logger } from '../log.js';
import {
  APPEAL_WAIT_DAYS,
  appealMessage,
  approvalFailureWords,
  blockableLater,
  appealOutcomeDm,
  blockedDm,
  blockLiftedDm,
  meetupChangeNotice,
  requestMessage,
  requestOutcomeDm,
  type MeetupChangeTold,
} from '../render/meetup-safety.js';
import { postLink } from '../render/notify-dm.js';
import { ASK_OPEN_DAYS, askMessage, askOutcomeDm } from '../render/place-asks.js';
import { DM_PRIORITY, type DmSender } from './dm-sender.js';
import type { MeetupOutcome, PartyService } from './party-service.js';
import type { GymProvider } from './gym-directory.js';
import type { WayspotProvider } from './wayspot-directory.js';
import { addressLine } from '../domain/geo/google.js';
import type { PartyProvider } from './party-store.js';
import { forumBarred } from './forum-access.js';
import type { RegionProvider } from './region-directory.js';
import { moderatorsNamed } from '../config/server-settings.js';
import type { ServerSettingsLookup } from './server-settings.js';

/** Who asks for a check of a place: the maker, in a server, and whether they are staff. */
export interface PlaceAsk {
  /** The server's snowflake. */
  serverId: string;
  place: Place;
  makerId: string;
  /** An admin, a moderator or the owner (`isStaff`): they skip the check. */
  staff: boolean;
  /**
   * Whether the maker is blocked, when the caller has just read it (`MeetupSafety.blocked`):
   * not read again. Left out: read with the ruling.
   */
  blocked?: boolean;
}

/** A meetup its maker asks for, as the moderators are asked about it. */
export interface RequestAsk {
  serverId: string;
  /** The region channel `/meetup` was used in. */
  regionChannelId: string;
  maker: { id: string } & MemberInfo;
  place: Place;
  /** As typed: it is tidied as a meetup's name is. */
  name: string;
  startTime: number;
  /** When it ends, read as `/end` reads a meetup's end (`typedNewEnd`); left out: no end. */
  endTime?: number;
  /** As typed: it is tidied as a meetup's information is. */
  description: string;
  /** Asked for on the live map (plan 8M-5M): its post says so. Left out: `/meetup`. */
  source?: RequestSource;
}

/** What came of asking the moderators. */
export type SubmitOutcome =
  /** The post is in the moderators' channel and the request is kept. */
  | { kind: 'sent'; request: MeetupRequestRecord }
  /** The moderators' channel is not there, or the post failed: nothing is kept. */
  | { kind: 'not-sent' }
  /** The request would expire within the hour (`mayRequestReview`): nothing was sent. */
  | { kind: 'too-soon' }
  /** The name is no name a meetup may have (`tidyName`): nothing was sent. */
  | { kind: 'bad-name' }
  /** The information is empty or too long (`tidyDescription`): nothing was sent. */
  | { kind: 'bad-description' }
  /**
   * The maker was blocked while it was sent (after the check, before the request was kept): the
   * request is withdrawn, its post says so, and nobody is told by DM.
   */
  | { kind: 'blocked' };

/** A meetup its maker asks to make (`MeetupSafety.make`): `/meetup`'s, or 8M-5M's from the map. */
export interface MakeAsk extends RequestAsk {
  /** An admin, a moderator or the owner (`isStaff`): they skip the check. */
  staff: boolean;
}

/** What came of a meetup its maker asked to make (`MeetupSafety.make`). */
export type MakeOutcome =
  /** The place is allowed (or the maker staff): the meetup is made, with its post. */
  | { kind: 'posted'; party: MeetupParty }
  /** The place needs a moderator: the request is with them (`submit`); nothing is posted. */
  | { kind: 'held'; request: MeetupRequestRecord }
  /** A moderator refused the place for good (`NO_MEETUP_HERE`). */
  | { kind: 'refused' }
  /**
   * Somebody keeps the maker out of the forum its post would be in (plan 8Z-2, `forumBarred`):
   * `kept-out`; `forum-unknown` while Discord cannot say (logged), none of the maker's doing.
   */
  | { kind: 'kept-out' | 'forum-unknown' }
  /** The place is a power spot: no meetup is (Matt, 2026-10-17; `/meetup` says `NO_POWER_SPOT`). */
  | { kind: 'power-spot' }
  /**
   * The maker is blocked from making meetups in the server: before anything was made, or while it
   * was (the meetup is closed again, the request withdrawn).
   */
  | { kind: 'blocked' }
  /** What `submit` refuses (`too-soon`, `not-sent`) or the meetup cannot be made with. */
  | Exclude<SubmitOutcome, { kind: 'sent' | 'blocked' }>
  /** What `PartyService.createMeetup` refuses (its region, its forum, its post). */
  | Exclude<MeetupOutcome, { kind: 'created' }>;

/** What came of the look for a block after a meetup was made (`closeIfBlocked`). */
export type CloseIfBlocked =
  /** Not blocked (or staff, or the safety off, or the block could not be read): it stays. */
  | false
  /** Blocked: the meetup is closed. */
  | 'closed'
  /** Blocked, but the meetup could not be closed (logged): it is still there. */
  | 'close-failed';

/** Changes of a meetup's name, information or times that the moderators may have to hear of. */
export interface ApprovedMeetupChange {
  serverId: string;
  /** The meetup as it is now. */
  party: Pick<MeetupParty, 'id' | 'createdById' | 'forumPostId' | 'timed'>;
  by: { id: string; name?: string | undefined };
  /** What changed, as it is now; more than one for changes made together (both times). */
  changes: readonly MeetupChangeTold[];
}

export interface MeetupSafetyOptions {
  storage: MeetupSafetyStore;
  gateway: Pick<
    PartyGateway,
    | 'guildName'
    | 'findChannel'
    | 'sendMessage'
    | 'editMessage'
    | 'deleteMessage'
    | 'serverChannels'
    | 'mayPost'
  >;
  /**
   * Where an approved meetup is made, and a blocked member's meetups are closed; how its maker
   * stands to the forum it would be posted in (`memberAccess`).
   */
  parties: Pick<PartyService, 'createMeetup' | 'end' | 'memberAccess'>;
  /** The regions, by their channels: the forum a meetup would be posted in. */
  regions: Pick<RegionProvider, 'byChannel'>;
  /** The active parties: a blocked member's meetups are found there. */
  store: Pick<PartyProvider, 'active'>;
  /** The row of a server, by which its parties say whose they are. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /** How the makers are told what came of their requests. */
  dms: DmSender;
  /** The gyms, by which a gym is checked by its official name and its nickname alike. */
  gyms?: Pick<GymProvider, 'get'>;
  /** The kept Wayspots: a PokéStop asked about whose ruling kept no place (one of 8S-1). */
  wayspots?: Pick<WayspotProvider, 'byId'>;
  settings: Settings;
  /** Each server's values: its moderators' channel, which turns the safety on (plan 19A-1). */
  servers: ServerSettingsLookup;
  log: Logger;
  now?: () => number;
}

/**
 * Meetup safety (plan 8S-1; spec `2026-10-17-meetup-safety-design.md`): the shared check of a
 * place (`verdict`), the making of a meetup with it (`make`: `/meetup`'s form, and 8M-5M's
 * meetups from the web map), the requests held for the moderators in the server's moderators'
 * channel (its values, plan 19A-1; `submit`), their decisions and expiry, blocks and
 * appeals. Everything is kept in the database
 * (`MeetupSafetyStore`), so a press on a moderators' post works after a restart. Off in a server
 * (`on` false) without that channel: every place is allowed and nothing is kept.
 */
export class MeetupSafety {
  private readonly now: () => number;
  /**
   * The flagged words of each server's list as it is (`flaggedWordsOf`, one expression per
   * list): kept by the list itself, so that a change of the server's values makes a new one.
   */
  private readonly flaggedWordsOfList = new WeakMap<readonly string[], readonly string[]>();
  private readonly changesOnTheirWay = new Set<Promise<void>>();

  constructor(private readonly options: MeetupSafetyOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Whether meetup safety is on in a server: its staff set a moderators' channel (plan 19A-1,
   * the server's values).
   */
  on(serverId: string): boolean {
    return moderatorsNamed(this.options.servers.of(serverId));
  }

  /**
   * The server's moderators' channel near `nearChannelId` (a region's channel, a post), where the
   * bot may post in it; undefined while the safety is off there, or the channel is gone.
   */
  private channelOf(serverId: string, nearChannelId: string): string | undefined {
    const id = this.options.servers.of(serverId).channels.moderation;
    return id === undefined ? undefined : this.options.gateway.findChannel(nearChannelId, id);
  }

  /** The flagged words of a server: the code's and its own (plan 19A-1, its `flaggedWords`). */
  private flaggedWordsIn(serverId: string): readonly string[] {
    const list = this.options.servers.of(serverId).flaggedWords;
    let words = this.flaggedWordsOfList.get(list);
    if (words === undefined) {
      words = flaggedWordsOf(list);
      this.flaggedWordsOfList.set(list, words);
    }
    return words;
  }

  /**
   * Says at the start where meetup safety cannot work, per server the bot is in: off where its
   * staff set no moderators' channel; a channel that is gone, or one where the bot may not post
   * (`mayPost`: View Channel, Send Messages, Embed Links). Meetups that need a moderator's
   * approval cannot be made there; a channel set or fixed later is found then. Asked at each
   * shard's first ready for that shard's servers (plan 19D), so once per server in the process
   * (the setting being a server's since plan 19A-1, no line is the instance's): one line per
   * reason for the servers of that call, their ids listed (`listedServers`: the first 50 and how
   * many more; fix round 4, I5). Never throws.
   */
  warnAtStart(guildIds: readonly string[]): void {
    const { gateway, servers, log } = this.options;
    const by = new Map<StartWarning, string[]>();
    let lookupErr: unknown;
    const add = (reason: StartWarning, server: string) => {
      const list = by.get(reason);
      if (list === undefined) by.set(reason, [server]);
      else list.push(server);
    };
    for (const server of guildIds) {
      const values = servers.of(server);
      const name = values.channels.moderation;
      if (name === undefined) {
        // Named in the settings file and not found by the fill (review F2): on, unreachable.
        add(moderatorsNamed(values) ? 'unreachable' : 'off', server);
        continue;
      }
      try {
        const found = gateway
          .serverChannels(server)
          ?.find((channel) => channel.kind === 'text' && channel.id === name)?.id;
        if (found === undefined) add('gone', server);
        else if (!gateway.mayPost(found)) add('cannot-post', server);
      } catch (err) {
        // Only a warning was to be said: it never stands in the way of the start.
        lookupErr ??= err;
        add('lookup-failed', server);
      }
    }
    for (const reason of START_WARNINGS) {
      const list = by.get(reason);
      if (list === undefined) continue;
      const fields = { servers: listedServers(list) };
      if (reason === 'lookup-failed') log.warn({ err: lookupErr, ...fields }, START_WORDS[reason]);
      else log.warn(fields, START_WORDS[reason]);
    }
  }

  /**
   * Whether a meetup at `place` may be posted at once, needs a moderator's approval, may not be
   * held there or may not be made by this member (`meetupPlaceVerdict`), with the server's
   * ruling of the place and the maker's block read from the storage (the block not again when
   * `ask.blocked` says it). Nothing is read for staff or while the safety is off.
   */
  async verdict(ask: PlaceAsk): Promise<MeetupVerdict> {
    const { storage } = this.options;
    if (!this.on(ask.serverId) || ask.staff) return 'allowed';
    const key = rulingKeyOf(ask.place);
    const [blocked, ruling] = await Promise.all([
      ask.blocked ?? this.blocked(ask.serverId, ask.makerId, false),
      key === undefined ? Promise.resolve(undefined) : storage.ruling(ask.serverId, key),
    ]);
    return meetupPlaceVerdict({
      on: true,
      place: ask.place,
      staff: false,
      blocked,
      ruling,
      flaggedWords: this.flaggedWordsIn(ask.serverId),
      otherTitles: this.otherTitles(ask.place),
    });
  }

  /**
   * Whether a member is blocked from making meetups in the server: never staff, nobody while the
   * safety is off. `/meetup` asks it before it reads the place and the start, so that a blocked
   * member hears of the block, not of a place it cannot find.
   */
  async blocked(serverId: string, memberId: string, staff: boolean): Promise<boolean> {
    if (!this.on(serverId) || staff) return false;
    return (await this.options.storage.block(serverId, memberId)) !== undefined;
  }

  /**
   * How many meetups of a member wait for a moderator in a server, which count as open ones (plan
   * 8Z, `openPartiesFull`); none while the safety is off.
   */
  async pendingCount(serverId: string, memberId: string): Promise<number> {
    if (!this.on(serverId)) return 0;
    return (await this.options.storage.pendingOf(serverId, memberId)).length;
  }

  /**
   * Tells the moderators, in the background, that an approved meetup's name or information
   * changed (plan 8Z; `/name`, `/info` and the map alike): into the channel of its request, which
   * is what "approved" means (`approvedRequestOf`). Nobody is told of a meetup that needed no
   * approval, nor while the safety is off. The change is made already and is never failed or held
   * up for this: what goes wrong is logged. `flushChanges` waits for those on their way.
   */
  tellChange(change: ApprovedMeetupChange): void {
    if (!this.on(change.serverId)) return;
    const telling: Promise<void> = this.tellOfChange(change)
      .catch((err: unknown) => {
        this.options.log.warn(
          { err, party: change.party.id },
          'could not tell the moderators of a change of an approved meetup',
        );
      })
      .finally(() => {
        this.changesOnTheirWay.delete(telling);
      });
    this.changesOnTheirWay.add(telling);
  }

  private async tellOfChange({
    serverId,
    party,
    by,
    changes,
  }: ApprovedMeetupChange): Promise<void> {
    const { storage, gateway } = this.options;
    const request = await storage.approvedRequestOf(serverId, party.createdById, party.id);
    if (request === undefined) return;
    await gateway.sendMessage(
      request.channelId,
      meetupChangeNotice(party.timed.name, by, changes, {
        post: party.forumPostId === null ? undefined : postLink(serverId, party.forumPostId),
        request: postLink(serverId, request.channelId, request.messageId),
      }),
    );
  }

  /** Waits for the moderators to be told of the changes on their way (`tellChange`). */
  async flushChanges(): Promise<void> {
    await Promise.all(this.changesOnTheirWay);
  }

  /**
   * A meetup its maker asks to make, the whole way (the entry point of `/meetup`'s form and of
   * 8M-5M's meetups from the web map): the check of the place (`verdict`); allowed, the meetup is
   * made (`PartyService.createMeetup`) and closed again when its maker was blocked meanwhile
   * (`closeIfBlocked`); review, the moderators are asked (`submit`). The name and information are
   * checked first (`bad-name`, `bad-description`: information of nothing but white space too).
   * The caller says whether the maker is staff and counts the use against its own throttle; a
   * caller without Discord's answers (the map) has no Appeal button to give a blocked maker: it
   * points them to `/meetup`. A power spot is no place for a meetup, for staff too (`power-spot`):
   * the map offers none, and `/meetup` refuses one before it gets here. A maker somebody keeps
   * out of the forum its post would be in is refused (`kept-out`; `forum-unknown` while Discord
   * cannot say: plan 8Z-2, fix round F-A4), here at the making, whatever the caller asked before
   * (`/meetup`'s guard asks before its form, which stays open up to half an hour).
   */
  async make(ask: MakeAsk): Promise<MakeOutcome> {
    const { parties } = this.options;
    if (ask.place.kind === 'powerspot') return { kind: 'power-spot' };
    if (tidyName(ask.name) === undefined) return { kind: 'bad-name' };
    const description = tidyDescription(ask.description);
    if (description === undefined || description === null) return { kind: 'bad-description' };
    const kept = await this.makerKeptOut(ask.regionChannelId, ask.maker.id);
    if (kept !== undefined) return { kind: kept };
    const verdict = await this.verdict({
      serverId: ask.serverId,
      place: ask.place,
      makerId: ask.maker.id,
      staff: ask.staff,
    });
    if (verdict === 'blocked' || verdict === 'refused') return { kind: verdict };
    if (verdict === 'review') {
      const outcome = await this.submit(ask);
      return outcome.kind === 'sent' ? { kind: 'held', request: outcome.request } : outcome;
    }
    const { id, ...creator } = ask.maker;
    const outcome = await parties.createMeetup({
      name: ask.name,
      creatorId: id,
      creator,
      regionChannelId: ask.regionChannelId,
      place: ask.place,
      startTime: ask.startTime,
      ...(ask.endTime === undefined ? {} : { endTime: ask.endTime }),
      description: ask.description,
    });
    if (outcome.kind !== 'created') return outcome;
    // A block that came after the check, its sweep of the maker's meetups before this one.
    const closed = await this.closeIfBlocked({
      serverId: ask.serverId,
      makerId: id,
      partyId: outcome.party.id,
      staff: ask.staff,
    });
    return closed === false ? { kind: 'posted', party: outcome.party } : { kind: 'blocked' };
  }

  /**
   * Whether somebody keeps a meetup's maker out of the forum of the region it would be posted in
   * (`forumBarred`, the one question of every path into a forum; plan 8Z-2): `kept-out`,
   * `forum-unknown` while Discord cannot say (logged), undefined when not (a forum only hidden
   * from them lets them in; a region gone or without a forum is `createMeetup`'s to refuse).
   * Asked by `make` and by `decide` before an approval is kept (8Z-2 final fix F5).
   */
  private async makerKeptOut(
    regionChannelId: string,
    makerId: string,
  ): Promise<'kept-out' | 'forum-unknown' | undefined> {
    const { parties, regions, log } = this.options;
    const forumId = regions.byChannel(regionChannelId)?.forumChannelId ?? null;
    try {
      const barred = await forumBarred(
        (forum, member) => parties.memberAccess(forum, member),
        forumId,
        makerId,
      );
      return barred ? 'kept-out' : undefined;
    } catch (err) {
      log.warn(
        { err, forum: forumId, member: makerId },
        'could not ask Discord whether the maker of a meetup is kept out of its forum; refused',
      );
      return 'forum-unknown';
    }
  }

  /** A gym's official name and nickname, which its title (the nickname first) may not show. */
  private otherTitles(place: Place): string[] {
    if (place.kind !== 'gym') return [];
    const gym = this.options.gyms?.get(Number(place.id));
    return gym === undefined ? [] : [gym.name, gym.nickname ?? ''].filter((title) => title !== '');
  }

  /**
   * Asks the moderators about a meetup: its post is sent into the moderators' channel of the
   * region's server, then the request is stored (pending) with it. Whatever fails leaves
   * nothing behind (`not-sent`, logged; a post sent is taken back): the member is told to try
   * later. A name or information a meetup cannot have (`tidyName`; `tidyDescription`, which must
   * leave something) is refused (`bad-name`, `bad-description`), and a request that would leave
   * the moderators less than an hour is not made (`too-soon`): nothing is sent.
   */
  async submit(ask: RequestAsk): Promise<SubmitOutcome> {
    const { storage, gateway, log } = this.options;
    const now = this.now();
    const meetupName = tidyName(ask.name);
    if (meetupName === undefined) return { kind: 'bad-name' };
    const description = tidyDescription(ask.description);
    if (description === undefined || description === null) return { kind: 'bad-description' };
    if (!mayRequestReview(now, ask.startTime)) return { kind: 'too-soon' };
    const channelId = this.channelOf(ask.serverId, ask.regionChannelId);
    if (channelId === undefined) {
      log.warn(
        { server: ask.serverId },
        "the moderators' channel is not there: a meetup was not sent for approval",
      );
      return { kind: 'not-sent' };
    }
    const request: MakerKnown = {
      id: randomUUID(),
      serverId: ask.serverId,
      regionChannelId: ask.regionChannelId,
      makerId: ask.maker.id,
      makerName: ask.maker.name ?? null,
      makerTeam: ask.maker.team ?? null,
      place: ask.place,
      name: meetupName,
      startTime: ask.startTime,
      endTime: ask.endTime ?? null,
      description,
      createdAt: now,
      expiresAt: requestExpiry(now, ask.startTime),
      status: 'pending',
      channelId,
      // The post is sent first: a request is never kept without one.
      messageId: '',
      decision: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
      partyId: null,
      source: ask.source ?? null,
      failure: null,
    };
    let messageId: string | undefined;
    try {
      messageId = await gateway.sendMessage(
        channelId,
        requestMessage(request, { officialName: this.officialName(request.place) }),
      );
      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
      await storage.addRequest({ ...request, messageId });
    } catch (err) {
      log.warn(
        { err, request: request.id },
        'could not send a meetup to the moderators for approval',
      );
      if (messageId !== undefined) {
        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
          log.warn({ err: deleteErr }, 'could not take back the post of a meetup request');
        });
      }
      return { kind: 'not-sent' };
    }
    const sent: MakerKnown = { ...request, messageId };
    // A block of its maker that came after the check (over another request) and whose sweep of
    // their pending requests ran before this one was kept: it is withdrawn now. One that cannot
    // be read leaves the request to the moderators (an approval looks again).
    const blocked = await this.blocked(ask.serverId, ask.maker.id, false).catch((err: unknown) => {
      log.error({ err, request: request.id }, 'could not look for a block after a meetup request');
      return false;
    });
    if (blocked) {
      const withdrawn = await storage
        .decideRequest(request.id, 'withdrawn', null, null)
        .catch((err: unknown) => {
          log.error(
            { err, request: request.id },
            'could not withdraw a request of a blocked member',
          );
          return false;
        });
      if (withdrawn) {
        await this.show({ ...sent, status: 'withdrawn' });
      }
      return { kind: 'blocked' };
    }
    return { kind: 'sent', request: sent };
  }

  /**
   * A moderator's decision of a request (a press on its post): one conditional change of the
   * stored request, so the first press wins (`decided-before` for a later one, with the request
   * as it was decided). Approve and Approve once make the meetup as its maker asked
   * (`PartyService.createMeetup`; one that cannot be made marks the request failed, with
   * `failure` said to the moderator and the maker); Approve allows the place for good once the
   * meetup is made, Refuse from now on refuses it (a pin has no ruling: `not-for-a-pin`). Then
   * the post is edited to the outcome without buttons and the maker is told by DM, whatever
   * could not be kept. A request whose time is up is expired instead (`expired`). `serverId` is
   * the presser's: a request of another server is `gone`.
   */
  async decide(
    requestId: string,
    decision: RequestDecision,
    moderator: { id: string; name?: string | undefined },
    serverId: string,
    serverName?: string,
  ): Promise<DecideOutcome> {
    const { storage, log } = this.options;
    const request = await storage.request(requestId);
    if (!request || request.serverId !== serverId) return { kind: 'gone' };
    // Its maker's data was removed on request (plan 8G), which only a request decided and over
    // loses: there is nobody to block, and nothing else to decide.
    if (!makerKnown(request)) {
      if (decision !== 'block') return { kind: 'decided-before', request };
      // The post, which the removal does not edit, still shows Block member and the old name:
      // drawn anew from the stored request, a former member without the button (final review).
      // An approved one keeps its post as it is: its meetup's link is not known here.
      if (request.status !== 'approved') await this.show(request);
      return { kind: 'maker-forgotten' };
    }
    if (request.status !== 'pending') {
      return decision === 'block' && blockableLater(request)
        ? this.blockLater(request, moderator, serverName)
        : { kind: 'decided-before', request };
    }
    const now = this.now();
    if (request.expiresAt <= now) {
      return (await this.expireOne(request)) ? { kind: 'expired' } : this.decidedBefore(request);
    }
    if (request.place.kind === 'pin' && (decision === 'approve' || decision === 'refuse-forever')) {
      return { kind: 'not-for-a-pin' };
    }
    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
    const approving = decision === 'approve' || decision === 'approve-once';
    const status = approving ? 'approved' : 'refused';
    const decided: MakerKnown = {
      ...request,
      status,
      decision,
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    };
    if (decision === 'block') {
      // The refusal and the block in one step: the first press wins, and one block is made.
      const blocked = await storage.blockMaker(request, by);
      if (!blocked.decided) return this.decidedBefore(request);
      return this.block(decided, by, blocked.newBlock, serverName);
    }
    // Whether somebody keeps the maker out of the forum, asked before anything is kept (8Z-2
    // final fix F5): while Discord cannot say, nothing is decided, the request stays open and
    // the moderator presses again; kept out, the approval fails with its reason.
    const kept = approving
      ? await this.makerKeptOut(request.regionChannelId, request.makerId)
      : undefined;
    if (kept === 'forum-unknown' && approving) return { kind: 'unchecked', decision };
    if (!(await storage.decideRequest(request.id, status, decision, by))) {
      return this.decidedBefore(request);
    }
    if (!approving) {
      if (decision === 'refuse-forever') {
        await this.rule(decided, 'refuse', by).catch((err: unknown) => {
          log.error(
            { err, request: decided.id },
            'could not refuse the place of a meetup for good',
          );
        });
      }
      await this.tell(decided);
      return { kind: 'done', request: decided };
    }
    return this.approve(decided, by, kept === 'kept-out');
  }

  /**
   * Makes the meetup of a request just approved, and keeps what came of it: its party, and for
   * Approve the place allowed for good (only once the meetup is made: an approval that fails
   * allows nothing); or `failed`. What cannot be kept is logged (an approval left without its
   * meetup fails with the sweep); the post and the maker's DM come in any case. `keptOut`:
   * somebody keeps the maker out of the forum (`decide` asked it), so no meetup is made.
   */
  private async approve(
    decided: MakerKnown,
    by: Decider,
    keptOut: boolean,
  ): Promise<DecideOutcome> {
    const { storage, log } = this.options;
    // A block of its maker that came meanwhile (over another request) wins: no meetup. One that
    // cannot be read is looked for again once the meetup is made (`closeIfBlocked`).
    const blocked = await storage.block(decided.serverId, decided.makerId).catch((err: unknown) => {
      log.error({ err, request: decided.id }, 'could not look for a block before an approval');
      return undefined;
    });
    if (blocked) return this.withdraw(decided);
    const made: ApprovedMeetup = keptOut
      ? { failure: { kind: 'kept-out' } }
      : await this.makeApproved(decided);
    // Blocked meanwhile, but the meetup could not be closed (logged): it is there, so the
    // approval is kept with it (a moderator closes it by hand); its maker hears of the block alone.
    let unclosed = false;
    if (made.partyId !== undefined) {
      const closed = await this.closeIfBlocked({
        serverId: decided.serverId,
        makerId: decided.makerId,
        partyId: made.partyId,
        // Staff never wait for a moderator: the maker of a request was none when they asked.
        staff: false,
      });
      if (closed === 'closed') return this.withdraw(decided);
      unclosed = closed === 'close-failed';
    }
    const failure: ApprovalFailure = made.failure ?? { kind: 'error' };
    try {
      if (made.partyId === undefined) {
        await storage.settleApproval(decided.id, { failed: failure });
      } else {
        const party = { partyId: made.partyId };
        // The meetup is there: a write that fails once is tried again before the sweep would
        // take the approval for one left without it.
        await storage
          .settleApproval(decided.id, party)
          .catch(() => storage.settleApproval(decided.id, party));
        if (decided.decision === 'approve') await this.rule(decided, 'allow', by);
      }
    } catch (err) {
      log.error(
        { err, request: decided.id },
        'could not keep what came of an approved meetup request',
      );
    }
    const settled: MakerKnown =
      made.partyId === undefined
        ? { ...decided, status: 'failed', failure }
        : { ...decided, partyId: made.partyId };
    if (unclosed) await this.show(settled, made.postId);
    else await this.tell(settled, made.postId);
    return {
      kind: 'done',
      request: settled,
      ...(made.postId === undefined ? {} : { postId: made.postId }),
      ...(made.partyId === undefined ? { failure: approvalFailureWords(failure) } : {}),
    };
  }

  /**
   * An approval that came when its maker was blocked: withdrawn, its post says so; the maker
   * hears of their block alone.
   */
  private async withdraw(decided: MakerKnown): Promise<DecideOutcome> {
    await this.options.storage.settleApproval(decided.id, 'withdrawn').catch((err: unknown) => {
      this.options.log.error({ err, request: decided.id }, 'could not withdraw an approval');
    });
    const withdrawn: MakerKnown = { ...decided, status: 'withdrawn' };
    await this.show(withdrawn);
    return { kind: 'done', request: withdrawn };
  }

  /**
   * After a meetup was made (`/meetup` with an allowed place, or an approval): when its maker
   * was blocked in the server meanwhile (the block came after the check, and its sweep of the
   * maker's meetups before the meetup was there), the meetup is closed at once as Block member
   * closes one (`CLOSED_BY_MODERATORS`): `closed`, or `close-failed` when that failed (logged;
   * the meetup is still there). False when the maker is not blocked, is staff (whom no block
   * concerns), or the block cannot be read (logged). Never throws; nothing while the safety is
   * off. The audit log names the moderator who blocked the maker as who closed it.
   */
  async closeIfBlocked(made: {
    serverId: string;
    makerId: string;
    partyId: string;
    staff: boolean;
  }): Promise<CloseIfBlocked> {
    const { parties, storage, log } = this.options;
    // As `blocked` asks, with the block itself: who blocked the maker closes the meetup.
    if (!this.on(made.serverId) || made.staff) return false;
    let block: MeetupBlock | undefined;
    try {
      block = await storage.block(made.serverId, made.makerId);
    } catch (err) {
      log.error({ err, party: made.partyId }, 'could not look for a block after making a meetup');
      return false;
    }
    if (block === undefined) return false;
    try {
      await parties.end(made.partyId, undefined, {
        lastWords: CLOSED_BY_MODERATORS,
        ended: CLOSED_BY_THEM,
        by: closer({ id: block.blockedBy, name: block.blockedByName }),
      });
      return 'closed';
    } catch (err) {
      log.error({ err, party: made.partyId }, 'could not close a meetup of a blocked member');
      return 'close-failed';
    }
  }

  /** Rules the place of a request for good (a pin has no ruling). */
  private async rule(
    request: MeetupRequestRecord,
    ruling: PlaceRuling,
    by: Decider,
  ): Promise<void> {
    const { place } = request;
    const key = rulingKeyOf(place);
    if (key === undefined || place.kind === 'pin') return;
    await this.options.storage.rule(request.serverId, key, ruling, by, {
      place,
      source: {
        kind: 'request',
        id: request.id,
        channelId: request.channelId,
        messageId: request.messageId,
      },
    });
  }

  /**
   * Block member, after the request was refused and its maker blocked in one step
   * (`blockMaker`): their other pending requests there are withdrawn (their posts edited,
   * nobody told), their active meetups there are closed as `/delete` closes one, with the
   * moderators' line, and they are told by DM, once (`newBlock`: not again for a block that
   * stood already), that they may appeal with `/meetup`. `closed` and `withdrawn` count what
   * went.
   */
  private async block(
    request: MakerKnown,
    by: Decider,
    newBlock: boolean,
    serverName: string | undefined,
  ): Promise<DecideOutcome> {
    const swept = await this.afterBlock(
      request.serverId,
      request.makerId,
      by,
      newBlock,
      serverName,
    );
    await this.show(request);
    return { kind: 'done', request, ...swept };
  }

  /**
   * Block member on a request refused or expired before (8S-1 review W7): its maker is blocked
   * as from a pending request (`afterBlock`: their pending requests withdrawn, meetups closed,
   * one DM), unless a block stands already (`newBlock` false); the post loses its button.
   */
  private async blockLater(
    request: MakerKnown,
    moderator: { id: string; name?: string | undefined },
    serverName: string | undefined,
  ): Promise<DecideOutcome> {
    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: this.now() };
    const newBlock = await this.options.storage.addBlock(
      request.serverId,
      request.makerId,
      by,
      request.makerName,
    );
    const swept = newBlock
      ? await this.afterBlock(request.serverId, request.makerId, by, true, serverName)
      : { closed: 0, withdrawn: 0 };
    await this.show(request);
    return { kind: 'blocked-later', request, newBlock, ...swept };
  }

  /**
   * What follows a block, also one from a report's Block maker… (plan 8S-2): the member's
   * pending requests in the server are withdrawn (their posts edited, nobody told), their active
   * meetups there closed as `/delete` closes one (archived, with the moderators' line), and they
   * are told by DM, once (`newBlock`), that they may appeal with `/meetup`. Each step is caught
   * and logged, so that the DM always comes. `closed` and `withdrawn` count what went.
   */
  private async afterBlock(
    serverId: string,
    memberId: string,
    by: Decider,
    newBlock: boolean,
    serverName: string | undefined,
    except?: string,
  ): Promise<{ closed: number; withdrawn: number }> {
    const { storage, parties, guilds, dms, log } = this.options;
    let withdrawn = 0;
    try {
      for (const other of await storage.pendingOf(serverId, memberId)) {
        if (!(await storage.decideRequest(other.id, 'withdrawn', null, by))) continue;
        withdrawn += 1;
        await this.show({
          ...other,
          status: 'withdrawn',
          decidedBy: by.id,
          decidedByName: by.name,
          decidedAt: by.at,
        });
      }
    } catch (err) {
      log.error(
        { err, member: memberId },
        'could not withdraw the other requests of a blocked member',
      );
    }
    let closed = 0;
    try {
      const row = await guilds.idFor(serverId);
      for (const party of this.meetupsOf(row, memberId).filter((one) => one.id !== except)) {
        try {
          const ended = await parties.end(party.id, undefined, {
            lastWords: CLOSED_BY_MODERATORS,
            ended: CLOSED_BY_THEM,
            // The audit log names the moderator who blocked the maker.
            by: closer(by),
          });
          if (ended) closed += 1;
        } catch (err) {
          log.error({ err, party: party.id }, 'could not close a meetup of a blocked member');
        }
      }
    } catch (err) {
      log.error({ err, member: memberId }, 'could not close the meetups of a blocked member');
    }
    if (newBlock) {
      const now = this.now();
      dms.send({
        userId: memberId,
        message: blockedDm(serverName),
        priority: DM_PRIORITY.normal,
        eventAt: now,
        expiresAt: now + DAY,
      });
    }
    return { closed, withdrawn };
  }

  /**
   * Blocks a member from making meetups in a server outside a request (a report's Block maker…,
   * plan 8S-2): as Block member on a request does (`afterBlock`), the member's name kept for
   * `/places`, their meetup `except` left to the caller (a report's, ended as the moderator chose).
   * `newBlock` false when a block stood already (then nobody is told again). Throws when the
   * block cannot be kept.
   */
  async blockMember(
    serverId: string,
    member: { id: string; name: string | null },
    by: Decider,
    more: { serverName?: string; except?: string } = {},
  ): Promise<{ newBlock: boolean; closed: number; withdrawn: number }> {
    const newBlock = await this.options.storage.addBlock(serverId, member.id, by, member.name);
    return {
      newBlock,
      ...(await this.afterBlock(serverId, member.id, by, newBlock, more.serverName, more.except)),
    };
  }

  /**
   * Refuses a place for good outside a request (a report's Refuse place…, plan 8S-2), with the
   * post it came from: as Refuse from now on does. Throws when it cannot be kept.
   */
  async refusePlace(
    serverId: string,
    place: KnownPlace,
    by: Decider,
    source: RulingSource,
  ): Promise<void> {
    const key = rulingKeyOf(place);
    if (key !== undefined)
      await this.options.storage.rule(serverId, key, 'refuse', by, { place, source });
  }

  /**
   * A blocked member's appeal (the Appeal button of `/meetup`'s refusal and its form): kept
   * (open) and posted in the moderators' channel of the server with who blocked them and when,
   * and their words, with Lift block and Keep block. One open appeal at a time (`open`); after a
   * block was kept, none for `APPEAL_WAIT_DAYS` (`wait`, with when); none from a member who is
   * not blocked. A post that fails leaves nothing behind (`not-sent`, logged). `nearChannelId`
   * is a channel of the server, by which its moderators' channel is found.
   */
  async appeal(ask: {
    serverId: string;
    nearChannelId: string;
    member: { id: string; name?: string | undefined };
    text: string;
  }): Promise<AppealOutcome> {
    const { storage, gateway, log } = this.options;
    const state = await this.appealState(ask.serverId, ask.member.id);
    if (state.kind !== 'may') return state;
    const channelId = this.channelOf(ask.serverId, ask.nearChannelId);
    if (channelId === undefined) {
      log.warn(
        { server: ask.serverId },
        "the moderators' channel is not there: an appeal was not sent",
      );
      return { kind: 'not-sent' };
    }
    const appeal: MeetupAppeal & { memberId: string } = {
      id: randomUUID(),
      serverId: ask.serverId,
      memberId: ask.member.id,
      memberName: ask.member.name ?? null,
      text: ask.text.trim(),
      createdAt: this.now(),
      status: 'open',
      channelId,
      messageId: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
    };
    if ((await storage.addAppeal(appeal)) === 'open') return { kind: 'open' };
    // A keep that came between the look and the appeal: the seven days stand.
    const lastKept = await storage.lastKept(ask.serverId, ask.member.id);
    const wait = this.waitAfterKept(lastKept, state.block);
    if (wait !== undefined) {
      await storage.discardAppeal(appeal.id);
      return wait;
    }
    let messageId: string | undefined;
    try {
      messageId = await gateway.sendMessage(channelId, appealMessage(appeal, state.block));
      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
      await storage.setAppealPost(appeal.id, channelId, messageId);
    } catch (err) {
      log.warn({ err, appeal: appeal.id }, 'could not send an appeal to the moderators');
      if (messageId !== undefined) {
        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
          log.warn({ err: deleteErr }, 'could not take back the post of an appeal');
        });
      }
      await storage.discardAppeal(appeal.id).catch((discardErr: unknown) => {
        log.error({ err: discardErr, appeal: appeal.id }, 'could not forget an appeal');
      });
      return { kind: 'not-sent' };
    }
    return { kind: 'sent', appeal: { ...appeal, messageId } };
  }

  /**
   * Whether a member may appeal now: `may` (with the block), `not-blocked`, `open` (one is
   * with the moderators), or `wait` until seven days after a moderator last kept the block.
   */
  async appealState(serverId: string, memberId: string): Promise<AppealState> {
    const { storage } = this.options;
    const block = await storage.block(serverId, memberId);
    if (!block) return { kind: 'not-blocked' };
    const open = await storage.openAppeal(serverId, memberId);
    // One that went astray (never posted, or nobody decided in time) is closed: they may again.
    if (open && !(this.isStale(open) && (await this.expireAppeal(open, false)))) {
      return { kind: 'open' };
    }
    const wait = this.waitAfterKept(await storage.lastKept(serverId, memberId), block);
    return wait ?? { kind: 'may', block };
  }

  /** The wait after a block was last kept (`kept`), while it lasts. */
  private waitAfterKept(
    kept: number | undefined,
    block: MeetupBlock,
  ): { kind: 'wait'; until: number } | undefined {
    if (kept === undefined || kept <= block.blockedAt) return undefined;
    const until = kept + APPEAL_WAIT_DAYS * DAY;
    return this.now() < until ? { kind: 'wait', until } : undefined;
  }

  /** The bounds of a stale open appeal at this moment (`MeetupSafetyStore.staleAppeals`). */
  private staleBounds(): { unpostedBefore: number; openedBefore: number } {
    const now = this.now();
    return { unpostedBefore: now - STRANDED_MS, openedBefore: now - APPEAL_OPEN_DAYS * DAY };
  }

  /** Whether an open appeal is stale: never posted after a while, or open too long. */
  private isStale(appeal: MeetupAppeal): boolean {
    const { unpostedBefore, openedBefore } = this.staleBounds();
    return (
      (appeal.messageId === null && appeal.createdAt <= unpostedBefore) ||
      appeal.createdAt <= openedBefore
    );
  }

  /**
   * Closes a stale open appeal as expired (false when it was decided meanwhile): its post, if
   * any, says so without buttons, and with `tell` the member hears they may appeal again.
   */
  private async expireAppeal(appeal: MeetupAppeal, tell: boolean): Promise<boolean> {
    const { storage, gateway, dms, log } = this.options;
    if (!(await storage.decideAppeal(appeal.id, 'expired', null))) return false;
    const expired: MeetupAppeal = { ...appeal, status: 'expired' };
    const { channelId, messageId, memberId } = expired;
    if (channelId !== null && messageId !== null) {
      const shown = (async () => {
        // A member the owner removed on request (plan 8G) has no block to show.
        const block =
          memberId === null ? undefined : await storage.block(appeal.serverId, memberId);
        await gateway.editMessage(channelId, messageId, appealMessage(expired, block));
      })().catch((err: unknown) => {
        log.warn({ err, appeal: appeal.id }, 'could not show that an appeal expired');
      });
      // The sweep waits for it; a member who appeals again (a form to open within three
      // seconds) does not.
      if (tell) await shown;
    }
    if (tell && memberId !== null) {
      const now = this.now();
      dms.send({
        userId: memberId,
        message: appealOutcomeDm(expired, gateway.guildName(appeal.serverId)),
        priority: DM_PRIORITY.normal,
        eventAt: now,
        expiresAt: now + DAY,
      });
    }
    return true;
  }

  /**
   * A moderator's decision of an appeal: Lift block lifts it (who lifted it is kept), Keep block
   * keeps it; the first press wins (`decided-before`). The post is edited to the outcome and the
   * member told by DM. An appeal of another server is `gone`.
   */
  async decideAppeal(
    appealId: string,
    decision: 'lift' | 'keep',
    moderator: { id: string; name?: string | undefined },
    serverId: string,
    serverName?: string,
  ): Promise<AppealDecision> {
    const { storage, gateway, dms, log } = this.options;
    const appeal = await storage.appeal(appealId);
    if (!appeal || appeal.serverId !== serverId) return { kind: 'gone' };
    // An appeal loses its member only once it is decided (the owner's removal on request).
    if (appeal.status !== 'open' || !memberKnown(appeal)) {
      return { kind: 'decided-before', appeal };
    }
    const now = this.now();
    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
    const status = decision === 'lift' ? 'lifted' : 'kept';
    // Read before it is lifted: the post keeps saying who blocked them and when (when it can).
    const block = await storage.block(appeal.serverId, appeal.memberId).catch((err: unknown) => {
      log.warn({ err, appeal: appeal.id }, 'could not read the block of an appeal');
      return undefined;
    });
    // No block stands any more (lifted from `/places` or otherwise): the appeal is closed as
    // lifted, nobody told (a Keep would tell of a block that is not there).
    if (
      block === undefined &&
      (await storage.block(appeal.serverId, appeal.memberId).then(
        (found) => found === undefined,
        () => false,
      ))
    ) {
      if (!(await storage.decideAppeal(appeal.id, 'lifted', by))) {
        const later = await storage.appeal(appeal.id);
        return later ? { kind: 'decided-before', appeal: later } : { kind: 'gone' };
      }
      const closed: MeetupAppeal & { memberId: string } = {
        ...appeal,
        status: 'lifted',
        decidedBy: by.id,
        decidedByName: by.name,
        decidedAt: by.at,
      };
      if (closed.channelId !== null && closed.messageId !== null) {
        await gateway
          .editMessage(closed.channelId, closed.messageId, appealMessage(closed, undefined))
          .catch((err: unknown) => {
            log.warn({ err, appeal: appeal.id }, 'could not show the outcome of an appeal');
          });
      }
      return { kind: 'no-block', appeal: closed };
    }
    // Lift block decides the appeal and lifts the block in one step.
    const decidedNow =
      decision === 'lift'
        ? await storage.liftOnAppeal(appeal, by)
        : await storage.decideAppeal(appeal.id, status, by);
    if (!decidedNow) {
      const later = await storage.appeal(appeal.id);
      return later ? { kind: 'decided-before', appeal: later } : { kind: 'gone' };
    }
    const decided: MeetupAppeal & { memberId: string } = {
      ...appeal,
      status,
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    };
    if (decided.channelId !== null && decided.messageId !== null) {
      try {
        await gateway.editMessage(
          decided.channelId,
          decided.messageId,
          appealMessage(decided, block),
        );
      } catch (err) {
        log.warn({ err, appeal: appeal.id }, 'could not show the outcome of an appeal');
      }
    }
    dms.send({
      userId: appeal.memberId,
      message: appealOutcomeDm(decided, serverName),
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: now + DAY,
    });
    return { kind: 'done', appeal: decided };
  }

  /**
   * Whether a member may ask the moderators about a place now (plan 8S-2): `may` (with its
   * ruling), `not-refused` (no refusal of it stands), `open` (an ask of it is with the
   * moderators), or `wait` until `PLACE_ASK_WAIT_DAYS` after the refusal or its last Keep
   * refused. An open ask that went astray (never posted, or nobody decided in time) is closed
   * first.
   */
  async askState(serverId: string, key: RulingKey, memberId: string): Promise<AskState> {
    const { storage } = this.options;
    // A blocked member is refused by the block before the place is looked at (8S-1's order).
    if (await this.blocked(serverId, memberId, false)) return { kind: 'blocked' };
    const ruling = await storage.rulingRecord(serverId, key);
    if (ruling?.ruling !== 'refuse') return { kind: 'not-refused' };
    const open = await storage.openAsk(serverId, key);
    if (open && !(this.isStaleAsk(open) && (await this.expireAsk(open, false)))) {
      return { kind: 'open' };
    }
    const until = askableAt(ruling);
    return this.now() < until ? { kind: 'wait', until } : { kind: 'may', ruling };
  }

  /**
   * A member's ask to allow a place refused for good (Ask the moderators under `/meetup`'s
   * refusal; plan 8S-2): kept (open, one per place: `open` for the member who comes second) and
   * posted in the moderators' channel with the place, its ruling and their words, with Allow
   * place and Keep refused. Refused while it may not be asked (`askState`). A post that fails
   * leaves nothing behind (`not-sent`, logged).
   */
  async askAboutPlace(ask: {
    serverId: string;
    nearChannelId: string;
    member: { id: string; name?: string | undefined };
    key: RulingKey;
    text: string;
  }): Promise<AskOutcome> {
    const { storage, gateway, log } = this.options;
    const state = await this.askState(ask.serverId, ask.key, ask.member.id);
    if (state.kind !== 'may') return state;
    // The place as it was ruled; a ruling of 8S-1 kept none: the gym or Wayspot as it is now.
    const place = state.ruling.place ?? this.placeNow(ask.key);
    if (place === undefined) {
      log.warn({ server: ask.serverId, place: ask.key }, 'an ask names a place that is gone');
      return { kind: 'not-sent' };
    }
    const channelId = this.channelOf(ask.serverId, ask.nearChannelId);
    if (channelId === undefined) {
      log.warn(
        { server: ask.serverId },
        "the moderators' channel is not there: an ask about a place was not sent",
      );
      return { kind: 'not-sent' };
    }
    const record: PlaceAskRecord & { memberId: string } = {
      id: randomUUID(),
      serverId: ask.serverId,
      key: state.ruling.key,
      place,
      memberId: ask.member.id,
      memberName: ask.member.name ?? null,
      text: ask.text.trim(),
      createdAt: this.now(),
      status: 'open',
      channelId,
      messageId: null,
      decidedBy: null,
      decidedByName: null,
      decidedAt: null,
    };
    if ((await storage.addAsk(record)) === 'open') return { kind: 'open' };
    let messageId: string | undefined;
    try {
      messageId = await gateway.sendMessage(
        channelId,
        askMessage(record, state.ruling, this.officialName(place)),
      );
      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
      await storage.setAskPost(record.id, channelId, messageId);
    } catch (err) {
      log.warn({ err, ask: record.id }, 'could not send an ask about a place to the moderators');
      if (messageId !== undefined) {
        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
          log.warn({ err: deleteErr }, 'could not take back the post of an ask');
        });
      }
      await storage.discardAsk(record.id).catch((discardErr: unknown) => {
        log.error({ err: discardErr, ask: record.id }, 'could not forget an ask');
      });
      return { kind: 'not-sent' };
    }
    return { kind: 'sent', ask: { ...record, messageId } };
  }

  /**
   * A moderator's decision of an ask: Allow place allows the place for good (the ask the
   * ruling's source), Keep refused keeps it refused and the 14 days begin again; one step each,
   * the first press winning (`decided-before`). The post is edited to the outcome and the member
   * told by DM, the server named. An ask of another server is `gone`.
   */
  async decideAsk(
    askId: string,
    decision: 'allow' | 'keep',
    moderator: { id: string; name?: string | undefined },
    serverId: string,
    serverName?: string,
  ): Promise<AskDecision> {
    const { storage, gateway, dms, log } = this.options;
    const ask = await storage.ask(askId);
    if (!ask || ask.serverId !== serverId) return { kind: 'gone' };
    // An ask loses its member only once it is decided (the owner's removal on request).
    if (ask.status !== 'open' || !memberKnown(ask)) return { kind: 'decided-before', ask };
    const now = this.now();
    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
    // The ruling asked about, read before the decision changes it: the post keeps showing it
    // (its last line says what was decided). Unread, the post shows the ruling as it is then.
    const asked = await storage.rulingRecord(ask.serverId, ask.key).catch(() => undefined);
    const kept = decision === 'keep' ? await storage.keepOnAsk(ask, by) : undefined;
    // Undone or allowed meanwhile: nothing is kept refused, nobody told.
    if (kept === 'not-refused') return { kind: 'not-refused' };
    const decidedNow = kept === undefined ? await storage.allowOnAsk(ask, by) : kept === 'kept';
    if (!decidedNow) {
      const later = await storage.ask(ask.id);
      return later ? { kind: 'decided-before', ask: later } : { kind: 'gone' };
    }
    const decided: PlaceAskRecord = {
      ...ask,
      status: decision === 'allow' ? 'allowed' : 'kept',
      decidedBy: by.id,
      decidedByName: by.name,
      decidedAt: by.at,
    };
    await this.showAsk(decided, asked);
    dms.send({
      userId: ask.memberId,
      message: askOutcomeDm(decided, serverName ?? gateway.guildName(ask.serverId)),
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: now + DAY,
    });
    log.info({ ask: ask.id, decision, moderator: by.id }, 'an ask about a place was decided');
    return { kind: 'done', ask: decided };
  }

  /**
   * Shows an ask in its post as it is now, with the ruling it asked about: `asked`, read before
   * a decision or an Undo ruling changed it (plan 8S-3: Allow place made a new ruling, from the
   * ask), else the ruling as it is kept (still the one asked about, at an expiry). A failure is
   * logged.
   */
  private async showAsk(ask: PlaceAskRecord, asked?: PlaceRulingRecord): Promise<void> {
    const { storage, gateway, log } = this.options;
    if (ask.channelId === null || ask.messageId === null) return;
    try {
      const ruling = asked ?? (await storage.rulingRecord(ask.serverId, ask.key));
      await gateway.editMessage(
        ask.channelId,
        ask.messageId,
        askMessage(ask, ruling, this.officialName(ask.place)),
      );
    } catch (err) {
      log.warn({ err, ask: ask.id }, 'could not show the outcome of an ask');
    }
  }

  /** Whether an open ask is stale: never posted after a while, or open too long. */
  private isStaleAsk(ask: PlaceAskRecord): boolean {
    const { unpostedBefore, openedBefore } = this.staleAskBounds();
    return (
      (ask.messageId === null && ask.createdAt <= unpostedBefore) || ask.createdAt <= openedBefore
    );
  }

  private staleAskBounds(): { unpostedBefore: number; openedBefore: number } {
    const now = this.now();
    return { unpostedBefore: now - STRANDED_MS, openedBefore: now - ASK_OPEN_DAYS * DAY };
  }

  /**
   * Closes a stale open ask as expired (false when it was decided meanwhile): its post says so,
   * and with `tell` the member hears they may ask again.
   */
  private async expireAsk(ask: PlaceAskRecord, tell: boolean): Promise<boolean> {
    const { storage, gateway, dms } = this.options;
    if (!(await storage.expireAsk(ask.id))) return false;
    const expired: PlaceAskRecord = { ...ask, status: 'expired' };
    const shown = this.showAsk(expired);
    if (tell) await shown;
    // A member the owner removed on request (plan 8G) is nobody to tell.
    if (tell && ask.memberId !== null) {
      const now = this.now();
      dms.send({
        userId: ask.memberId,
        message: askOutcomeDm(expired, gateway.guildName(ask.serverId)),
        priority: DM_PRIORITY.normal,
        eventAt: now,
        expiresAt: now + DAY,
      });
    }
    return true;
  }

  /** A ruled place as it is now, where its ruling kept none: the gym or the kept Wayspot. */
  private placeNow(key: RulingKey): KnownPlace | undefined {
    if (key.kind === 'gym') {
      const gym = /^\d+$/u.test(key.id) ? this.options.gyms?.get(Number(key.id)) : undefined;
      return (
        gym && {
          kind: 'gym',
          id: key.id,
          title: gym.nickname || gym.name,
          lat: gym.lat,
          lon: gym.lon,
          address: addressLine(gym.geodata) || null,
          image: gym.imageUrl,
        }
      );
    }
    const wayspot = this.options.wayspots?.byId(key.id);
    return (
      wayspot && {
        kind: key.kind,
        id: wayspot.id,
        title: wayspot.title,
        lat: wayspot.lat,
        lon: wayspot.lon,
        address: null,
        image: null,
      }
    );
  }

  /**
   * What `/places` lists of a server (plan 8S-2): its rulings, pending requests, open asks,
   * blocks and open appeals, each oldest first.
   */
  async overview(serverId: string): Promise<SafetyOverview> {
    const { storage } = this.options;
    const [rulings, pending, asks, blocks, appeals] = await Promise.all([
      storage.rulings(serverId),
      storage.pendingIn(serverId),
      storage.openAsks(serverId),
      storage.blocks(serverId),
      storage.openAppeals(serverId),
    ]);
    return { rulings, pending, asks, blocks, appeals };
  }

  /** A place's ruling as it is kept (`/places place:`); undefined for none or a pin. */
  async rulingOf(serverId: string, place: Place): Promise<PlaceRulingRecord | undefined> {
    const key = rulingKeyOf(place);
    return key === undefined ? undefined : this.options.storage.rulingRecord(serverId, key);
  }

  /**
   * Undo ruling (`/places`, plan 8S-2): the place's ruling is removed, so that a meetup there is
   * checked by its name again; logged with the moderator, nobody told. The ruling removed, or
   * undefined when none stood.
   */
  async undoRuling(
    serverId: string,
    key: RulingKey,
    moderator: { id: string; name?: string | undefined },
  ): Promise<PlaceRulingRecord | undefined> {
    const undone = await this.options.storage.undoRuling(serverId, key);
    if (!undone) return undefined;
    this.options.log.info(
      { server: serverId, place: key, ruling: undone.ruling.ruling, moderator: moderator.id },
      'a ruling of a place was undone',
    );
    // The place's open ask closed with it: its post says so; nobody is told.
    if (undone.ask) await this.showAsk(undone.ask, undone.ruling);
    return undone.ruling;
  }

  /**
   * Lift block from `/places` (plan 8S-2): as an appeal's Lift block, the member may make meetups
   * again (who lifted it is kept) and is told by DM, the server named. False when no block stood.
   */
  async liftBlock(
    serverId: string,
    memberId: string,
    moderator: { id: string; name?: string | undefined },
    serverName?: string,
  ): Promise<boolean> {
    const { storage, gateway, log } = this.options;
    const now = this.now();
    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
    // Read before it is lifted: the appeal's post keeps saying who blocked them and when.
    const block = await storage.block(serverId, memberId).catch(() => undefined);
    const lifted = await storage.liftWithAppeal(serverId, memberId, by);
    if (!lifted.lifted) return false;
    // Their open appeal is decided with it (one DM, this one): its post says so.
    const { appeal } = lifted;
    if (appeal?.channelId && appeal.messageId) {
      await gateway
        .editMessage(appeal.channelId, appeal.messageId, appealMessage(appeal, block))
        .catch((err: unknown) => {
          log.warn({ err, appeal: appeal.id }, 'could not show the outcome of an appeal');
        });
    }
    this.options.dms.send({
      userId: memberId,
      message: blockLiftedDm(serverName ?? this.options.gateway.guildName(serverId)),
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: now + DAY,
    });
    return true;
  }

  /** A gym's official name where its title (the nickname first) shows another; else null. */
  officialName(place: Place): string | null {
    if (place.kind !== 'gym' || !/^\d+$/u.test(place.id)) return null;
    const gym = this.options.gyms?.get(Number(place.id));
    if (!gym?.nickname || gym.nickname === gym.name) return null;
    return gym.name;
  }

  /**
   * Expires the pending requests whose time is up (with the clock's tick): each is marked
   * expired, its post edited and its maker told. Answers how many. Also while the safety is off:
   * the requests made before it was turned off end all the same. Then the approvals that never
   * got their meetup (the bot stopped in between) fail once they are `STRANDED_MS` old: their
   * posts are edited and their makers told.
   */
  async expire(): Promise<number> {
    const { storage, log } = this.options;
    const now = this.now();
    const due = await storage.duePending(now);
    let expired = 0;
    for (const request of due) {
      try {
        if (await this.expireOne(request)) expired += 1;
      } catch (err) {
        log.error({ err, request: request.id }, 'could not expire a meetup request');
      }
    }
    for (const appeal of await storage.staleAppeals(this.staleBounds())) {
      try {
        await this.expireAppeal(appeal, true);
      } catch (err) {
        log.error({ err, appeal: appeal.id }, 'could not close an appeal nobody decided');
      }
    }
    for (const ask of await storage.staleAsks(this.staleAskBounds())) {
      try {
        await this.expireAsk(ask, true);
      } catch (err) {
        log.error({ err, ask: ask.id }, 'could not close an ask nobody decided');
      }
    }
    for (const request of await storage.strandedApprovals(now - STRANDED_MS)) {
      try {
        await this.settleStranded(request);
      } catch (err) {
        log.error({ err, request: request.id }, 'could not fail an approval without its meetup');
      }
    }
    return expired;
  }

  /**
   * An approval left without its recorded meetup: when the meetup is there all the same (the
   * bot stopped, or the database failed, after it was made: an active meetup of the maker in
   * the server with the request's name and start), it is settled with it, the post shown, and
   * nobody told again (closed and `withdrawn` when its maker was blocked since); otherwise it
   * failed, the post says so and the maker is told.
   */
  private async settleStranded(request: MeetupRequestRecord): Promise<void> {
    const { storage, guilds } = this.options;
    const row = await guilds.idFor(request.serverId);
    // The removal on request (plan 8G) never clears the maker of an approval without its
    // meetup; one without a maker would have no meetup to find, and fails.
    const { makerId } = request;
    const party =
      makerId === null
        ? undefined
        : this.meetupsOf(row, makerId).find(
            (one) => one.timed.name === request.name && one.timed.startTime === request.startTime,
          );
    if (party === undefined || makerId === null) {
      const failure: ApprovalFailure = { kind: 'error' };
      if (await storage.settleApproval(request.id, { failed: failure })) {
        await this.tell({ ...request, status: 'failed', failure });
      }
      return;
    }
    const made = {
      serverId: request.serverId,
      makerId,
      partyId: party.id,
      staff: false,
    };
    // A close that failed leaves the meetup up: the approval is settled with it (logged).
    if ((await this.closeIfBlocked(made)) === 'closed') {
      if (await storage.settleApproval(request.id, 'withdrawn')) {
        await this.show({ ...request, status: 'withdrawn' });
      }
      return;
    }
    if (await storage.settleApproval(request.id, { partyId: party.id })) {
      const postId = party.forumPostId ?? undefined;
      await this.show({ ...request, partyId: party.id }, postId);
    }
  }

  /** The active meetups a member made in the server of this row. */
  private meetupsOf(row: number | undefined, makerId: string): MeetupParty[] {
    return this.options.store
      .active()
      .filter(
        (party): party is MeetupParty =>
          isMeetup(party) && party.guildId === row && party.createdById === makerId,
      );
  }

  /** Marks one request expired (false when it was decided meanwhile), edits its post, tells. */
  private async expireOne(request: MeetupRequestRecord): Promise<boolean> {
    if (!(await this.options.storage.decideRequest(request.id, 'expired', null, null)))
      return false;
    await this.tell({ ...request, status: 'expired' });
    return true;
  }

  /** A decision that came second: the request as the first one left it. */
  private async decidedBefore(request: MeetupRequestRecord): Promise<DecideOutcome> {
    const now = await this.options.storage.request(request.id);
    return now ? { kind: 'decided-before', request: now } : { kind: 'gone' };
  }

  /** Makes the meetup of an approved request, as its maker asked for it. */
  private async makeApproved(request: MakerKnown): Promise<ApprovedMeetup> {
    const { parties, log } = this.options;
    // Whether somebody kept the maker out of the forum since they asked (plan 8Z-2) is asked by
    // `decide` before the approval is kept (8Z-2 final fix F5).
    try {
      const outcome = await parties.createMeetup({
        name: request.name,
        creatorId: request.makerId,
        creator: {
          ...(request.makerName === null ? {} : { name: request.makerName }),
          ...(request.makerTeam === null ? {} : { team: request.makerTeam }),
        },
        regionChannelId: request.regionChannelId,
        place: request.place,
        startTime: request.startTime,
        ...(request.endTime === null ? {} : { endTime: request.endTime }),
        description: request.description,
      });
      if (outcome.kind === 'created') {
        const postId = outcome.party.forumPostId;
        return { partyId: outcome.party.id, ...(postId === null ? {} : { postId }) };
      }
      return {
        failure:
          outcome.kind === 'no-post' && outcome.refused !== undefined
            ? {
                kind: 'posts-refused',
                forumId: outcome.refused.forumId,
                missing: [...outcome.refused.missing],
              }
            : // A reason no failure kind names (what was asked was read before it was kept).
              { kind: outcome.kind === 'cannot-make' ? 'error' : outcome.kind },
      };
    } catch (err) {
      log.error({ err, request: request.id }, 'could not make an approved meetup');
      return { failure: { kind: 'error' } };
    }
  }

  /**
   * Shows what came of a request in its post (without buttons) and tells its maker by DM (a
   * failed one says why, `MeetupRequestRecord.failure`). What fails on Discord is logged: the
   * decision stands.
   */
  private async tell(request: MeetupRequestRecord, postId?: string): Promise<void> {
    const { dms } = this.options;
    const now = this.now();
    await this.show(request, postId);
    // A maker the owner removed on request (plan 8G) is nobody to tell.
    if (request.makerId === null) return;
    dms.send({
      userId: request.makerId,
      message: requestOutcomeDm(
        request,
        postId === undefined ? {} : { postUrl: postLink(request.serverId, postId) },
      ),
      priority: DM_PRIORITY.normal,
      eventAt: now,
      expiresAt: Math.max(request.startTime, now + DM_HOURS * 3_600_000),
    });
  }

  /** Shows what came of a request in its post, without buttons; a failure is logged. */
  private async show(request: MeetupRequestRecord, postId?: string): Promise<void> {
    const { gateway, storage, log } = this.options;
    if (request.channelId === null || request.messageId === null) return;
    // Block member stays on a refused or expired request while its maker is not blocked.
    const makerBlock =
      blockableLater(request) && request.makerId !== null
        ? await storage.block(request.serverId, request.makerId).then(
            (block) => block ?? null,
            () => undefined,
          )
        : undefined;
    const shown = requestMessage(request, {
      ...(postId === undefined ? {} : { postId }),
      officialName: this.officialName(request.place),
      ...(makerBlock === undefined ? {} : { makerBlock }),
    });
    try {
      await gateway.editMessage(request.channelId, request.messageId, shown);
    } catch (err) {
      log.warn({ err, request: request.id }, 'could not show the outcome of a meetup request');
    }
  }
}

/**
 * Why meetup safety cannot work in a server, as the start says it (`warnAtStart`), in the order
 * the lines are said.
 */
const START_WARNINGS = ['off', 'unreachable', 'gone', 'cannot-post', 'lookup-failed'] as const;
type StartWarning = (typeof START_WARNINGS)[number];

const START_WORDS: Readonly<Record<StartWarning, string>> = {
  off: "meetup safety is off in these servers: they have no moderators' channel set",
  unreachable:
    "the moderators' channel of the settings file is not in these servers: meetups that need a moderator's approval cannot be made there until their staff set one",
  gone: "the moderators' channel of these servers is gone: meetups that need a moderator's approval cannot be made there",
  'cannot-post':
    "the bot cannot post in the moderators' channel of these servers (View Channel, Send Messages, Embed Links): meetups that need a moderator's approval cannot be made there",
  'lookup-failed': "could not look for the moderators' channel of these servers",
};

/** How many servers' ids a line of the start lists at most (`listedServers`). */
const LISTED_SERVERS = 50;

/** The servers a line of the log lists: the first `LISTED_SERVERS`, then `and N more`. */
function listedServers(servers: readonly string[]): string[] {
  const more = servers.length - LISTED_SERVERS;
  return more <= 0
    ? [...servers]
    : [...servers.slice(0, LISTED_SERVERS), `and ${String(more)} more`];
}

/** How long the DM of an outcome may wait at least: past the meetup's start it says nothing. */
const DM_HOURS = 1;

/**
 * How old an approval without its meetup must be before the sweep fails it: making a meetup
 * takes seconds, so one this old was left by a stop in between.
 */
const STRANDED_MS = 5 * 60_000;

const DAY = 24 * 3_600_000;

/** How long an appeal waits for a moderator: after that it is closed, and may be made again. */
const APPEAL_OPEN_DAYS = 7;

/** What the post of a meetup closed because its maker was blocked says last. */
export const CLOSED_BY_MODERATORS = 'This meetup was closed by the moderators.';

/** How such a meetup ends for the party history: closed by the moderators (plan 8H-6, A1). */
const CLOSED_BY_THEM: PartyEnd = closedEnd('moderators');

/** The moderator who blocked a maker, as the audit log names who closed their meetup. */
function closer(by: { id: string; name: string | null }): { id: string; name?: string } {
  return by.name === null ? { id: by.id } : { id: by.id, name: by.name };
}

/** What `/places` lists of meetup safety in a server (`MeetupSafety.overview`). */
export interface SafetyOverview {
  rulings: PlaceRulingRecord[];
  pending: MeetupRequestRecord[];
  asks: PlaceAskRecord[];
  blocks: MeetupBlock[];
  appeals: MeetupAppeal[];
}

/** Whether a member may ask the moderators about a refused place now (`askState`). */
export type AskState =
  | { kind: 'may'; ruling: PlaceRulingRecord }
  | { kind: 'blocked' }
  | { kind: 'not-refused' }
  | { kind: 'open' }
  | { kind: 'wait'; until: number };

/** What came of an ask about a place. */
export type AskOutcome =
  Exclude<AskState, { kind: 'may' }> | { kind: 'sent'; ask: PlaceAskRecord } | { kind: 'not-sent' };

/** What came of a moderator's press on an ask's post. */
export type AskDecision =
  | { kind: 'gone' }
  | { kind: 'decided-before'; ask: PlaceAskRecord }
  /** Keep refused where no refusal stands any more (undone or allowed meanwhile). */
  | { kind: 'not-refused' }
  | { kind: 'done'; ask: PlaceAskRecord };

/** Whether a member may appeal their block now. */
export type AppealState =
  | { kind: 'may'; block: MeetupBlock }
  | { kind: 'not-blocked' }
  | { kind: 'open' }
  | { kind: 'wait'; until: number };

/** What came of an appeal. */
export type AppealOutcome =
  | Exclude<AppealState, { kind: 'may' }>
  | { kind: 'sent'; appeal: MeetupAppeal }
  | { kind: 'not-sent' };

/** What came of a moderator's press on an appeal's post. */
export type AppealDecision =
  | { kind: 'gone' }
  /** No block stood any more: the appeal is closed as lifted, nobody told. */
  | { kind: 'no-block'; appeal: MeetupAppeal & { memberId: string } }
  | { kind: 'decided-before'; appeal: MeetupAppeal }
  | { kind: 'done'; appeal: MeetupAppeal & { memberId: string } };

/** What `makeApproved` made of an approval: its meetup and post, or why none. */
interface ApprovedMeetup {
  partyId?: string;
  postId?: string;
  failure?: ApprovalFailure;
}

/** What came of a moderator's press on a request's post. */
export type DecideOutcome =
  /** There is no such request in the presser's server. */
  | { kind: 'gone' }
  /** Somebody decided it first (or it expired): the request as it was decided. */
  | { kind: 'decided-before'; request: MeetupRequestRecord }
  /** Its time was up: it is expired now. */
  | { kind: 'expired' }
  /** Approve and Refuse from now on are not for a pin. */
  | { kind: 'not-for-a-pin' }
  /**
   * An approval while Discord cannot say whether somebody keeps the maker out of the forum
   * (8Z-2 final fix F5): nothing is kept, the request stays open, and the moderator may press
   * `decision` again.
   */
  | { kind: 'unchecked'; decision: 'approve' | 'approve-once' }
  /**
   * Block member on a request whose maker's data the owner removed on request (plan 8G): there
   * is nobody to block, and nothing is changed.
   */
  | { kind: 'maker-forgotten' }
  /**
   * Block member on a request decided before: its maker blocked now (`newBlock`), or blocked
   * already; how many meetups were closed and requests withdrawn.
   */
  | {
      kind: 'blocked-later';
      request: MakerKnown;
      newBlock: boolean;
      closed: number;
      withdrawn: number;
    }
  /**
   * Decided: `postId` the meetup's post, `failure` why an approved one could not be made; of a
   * block, how many active meetups of the maker were `closed` and pending requests `withdrawn`.
   */
  | {
      kind: 'done';
      request: MakerKnown;
      postId?: string;
      failure?: string;
      closed?: number;
      withdrawn?: number;
    };
