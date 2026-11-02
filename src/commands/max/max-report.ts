import type { AppContext } from '../../app-context.js';
import type { MemberAccess } from '../../discord/party-gateway.js';
import type { Throttle } from '../../discord/throttle.js';
import { maxSpotName } from '../../domain/party/max.js';
import {
  sameBoss,
  type MaxParty,
  type MaxSpot,
  type RaidScreenshot,
} from '../../domain/party/party.js';
import { battleKindOf, maxBossTitle, type MaxTier } from '../../domain/pogo/max-tier.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { noPostWords } from '../../render/activity.js';
import { endSentence, plain, timestamp } from '../../render/text.js';
import type { Member } from '../../services/attendance-service.js';
import type { MaxReportOutcome, PartyService } from '../../services/party-service.js';
import { DISCORD_NAMES, type ReportNames } from '../raids/report.js';
import type { ReadMaxBoss } from './max-input.js';

/*
 * Reporting a max battle as `/max` and the live map (plan 8X-5) share it, as `reportRaidAs` is
 * shared for raids: the report as the member, with their own privacy and automatic status
 * (`reportMaxAs`, which also logs a pin and tells the moderators of it), the checks both make
 * before their throttle (`maxBarred`, `blockedAtPin`), and the command's words for what came of
 * it (`maxReportWords`), a post and a region channel named by the caller's `MaxNames`.
 */

/** The name `/max` is used and counted under, and the map's reports with it. */
export const MAX_COMMAND = 'max';

/** How often one member may report a max battle: as raids (`RAID_THROTTLE`). */
export const MAX_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };

/** What `/max` is refused when the report would put the member in a forum barred to them. */
export const MAX_BARRED =
  'You cannot report a max battle at this spot: you are kept out of the forum its battle would be in.';

/**
 * What `/max` says to a member blocked from meetups (meetup safety's block) who reports at a pin
 * (Matt, 2026-10-21, final review G1): a known power spot is still theirs to report.
 */
export const MAX_PIN_BLOCKED =
  'You are blocked from making meetups in this server, so you cannot report a max battle at an ' +
  'unlisted power spot. Pick a Power Spot from the list.';

/**
 * What `/max` says when the battle a report would join ended while it waited, and the one after
 * it too (fix review F2): nothing was done.
 */
export const MAX_ENDED = 'The max battle there has just ended: use `/max` again.';

/**
 * What the ending-soon question's answer is refused when the end chosen has passed meanwhile
 * (the dialog's Submit, the map's report sent again with its choice).
 */
export const ENDED_MEANWHILE = 'That battle has ended meanwhile: nothing was reported.';

/** A report whose boss, spot and end are read: what, where, until when, made in which region. */
export interface MaxReportRequest {
  boss: ReadMaxBoss;
  spot: MaxSpot;
  end: number;
  /** The region channel the report was made in (the map: the region the member picked). */
  regionChannelId: string;
  /** The screenshot a new battle is reported from (plan 8X-S, `MaxReport.screenshot`). */
  screenshot?: RaidScreenshot;
  /** Since when a new battle has its boss: a screenshot's sure moment (`MaxReport.bossSince`). */
  bossSince?: number;
}

/**
 * What reporting needs: the members' settings, the party service, the moderators, the log, and
 * meetup safety's blocks (`blockedAtPin`).
 */
export type MaxReporting = Pick<
  AppContext,
  'users' | 'partyService' | 'reports' | 'log' | 'meetupSafety'
>;

/**
 * What a report asks of the member beyond the report: whether they may be put in the forum of
 * the battle it would join (`mayJoin`), and whether they are staff (never blocked at a pin).
 */
export interface MaxReporter {
  mayJoin: (forumId: string) => Promise<boolean>;
  staff: boolean;
}

/** What came of a report, and the reporter's automatic status, which the answer names. */
export interface MaxReportResult {
  outcome: MaxReportOutcome;
  autoStatus: PartyStatus;
}

/**
 * Reports the battle as the member (anonymous when their privacy says so, signed up by their
 * automatic status) in the server `serverId` (a snowflake). A new battle at a pin is said in the
 * log for staff (Q7: "a sign to us we need to re-scrape") and told to the moderators once its
 * post is made (G1). `mayJoin` is asked once the report would join the battle at the spot; a
 * member blocked from meetups makes no new battle at a pin (`blockedAtPin`, asked by the service
 * where the battle it would join ended meanwhile: final review F4; `pin-blocked`).
 */
export async function reportMaxAs(
  ctx: MaxReporting,
  member: Member,
  serverId: string,
  request: MaxReportRequest,
  { mayJoin, staff }: MaxReporter,
): Promise<MaxReportResult> {
  const { id, ...reporter } = member;
  const settings = await ctx.users.get(id);
  const outcome = await ctx.partyService.reportMax({
    spot: request.spot,
    reporterId: id,
    reporter,
    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
    autoStatus: settings.autoStatus,
    tier: request.boss.tier,
    boss: request.boss.boss,
    endTime: request.end,
    regionChannelId: request.regionChannelId,
    ...(request.screenshot ? { screenshot: request.screenshot } : {}),
    ...(request.bossSince === undefined ? {} : { bossSince: request.bossSince }),
    mayJoin,
    mayCreateAtPin: async () => !(await blockedAtPin(ctx, serverId, id, staff, request.spot)),
  });
  if (outcome.kind === 'created' && request.spot.kind === 'pin') {
    ctx.log.info(
      {
        party: outcome.party.id,
        reporter: id,
        server: serverId,
        lat: request.spot.lat,
        lon: request.spot.lon,
        boss: request.boss.label,
      },
      'a max battle was reported at an unlisted power spot',
    );
    // The moderators hear of it on the side (G1): the post is made already.
    const postId = outcome.party.forumPostId;
    if (postId !== null) {
      ctx.reports.maxAtPin({
        serverId,
        partyId: outcome.party.id,
        postId,
        boss: request.boss.label,
        reporter: { id, name: reporter.name },
        regionChannelId: request.regionChannelId,
        pin: request.spot,
      });
    }
  }
  return { outcome, autoStatus: settings.autoStatus };
}

/**
 * What the check of a report's forums needs: where a new battle would go (`regionForSpot`), and
 * how a member stands to a forum (on Discord through the party service, on the map through the
 * parties' own deps).
 */
export interface MaxAccess {
  partyService: Pick<PartyService, 'regionForSpot'>;
  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined>;
}

/**
 * Whether a report at this spot would put the member in a forum somebody keeps them out of, as
 * `/raid` asks it (`reportBarred`): the forum a new battle would go to, and that of the battle at
 * the spot (`joins`). Rejects while Discord cannot say.
 */
export async function maxBarred(
  access: MaxAccess,
  ask: { spot: MaxSpot; regionChannelId: string; joins: MaxParty | undefined },
  memberId: string,
): Promise<boolean> {
  const forum = access.partyService.regionForSpot(ask.spot, ask.regionChannelId).region
    ?.forumChannelId;
  const there = ask.joins?.forumChannelId;
  for (const forumId of new Set([forum, there])) {
    if (forumId && (await access.memberAccess(forumId, memberId)) === 'barred') return true;
  }
  return false;
}

/**
 * Whether a member blocked from meetups (`MeetupSafety.blocked`: never staff, nobody while the
 * safety is off) asks for a new battle at a pin, a place nobody checked (Matt, 2026-10-21, final
 * review G1): refused then (`MAX_PIN_BLOCKED`). Ask it only for a new battle: joining the battle
 * there is allowed (fix review 4); `reportMaxAs` asks it again where that battle ended before
 * the report was written (8X-5 final review F4). A member appeals the block with `/meetup`. A
 * spawn at a pin is asked the same (`/wild near:` and the map, `WILD_PIN_BLOCKED`; plan 8Z).
 */
export async function blockedAtPin(
  ctx: Pick<AppContext, 'meetupSafety'>,
  serverId: string,
  memberId: string,
  staff: boolean,
  spot: { kind: string },
): Promise<boolean> {
  if (spot.kind !== 'pin') return false;
  return ctx.meetupSafety.blocked(serverId, memberId, staff);
}

/** Whether a battle at the spot is one of another boss than the report's (design Q3). */
export function otherBoss(there: MaxParty, boss: ReadMaxBoss): boolean {
  return !sameBoss(there.max.boss, boss.boss) || there.max.tier !== boss.tier;
}

/** `at Gazebo of the Park`, `at an unlisted power spot`: where a battle is, in a sentence. */
export function atSpot(spot: MaxSpot): string {
  return spot.kind === 'pin' ? 'at an unlisted power spot' : `at ${plain(maxSpotName(spot))}`;
}

/**
 * `There is already a max battle against Dynamax Sneasel (1★) at <spot>: <#post>. …` (design
 * 3.1), with the hint of `/boss` only where it could make the battle the one reported: never
 * between Dynamax and Gigantamax (`reported`: the tier of the report), in the caller's words
 * (`names.bossHint`). The post as `names` names it: on the map not at all.
 */
export function takenWords(
  ctx: Pick<AppContext, 'partyService'>,
  party: MaxParty,
  reported: MaxTier,
  names: MaxNames = DISCORD_MAX_NAMES,
): string {
  const hint = battleKindOf(reported) === battleKindOf(party.max.tier) ? names.bossHint : '';
  return `${alreadyThere(ctx, party, atSpot(party.max.spot), names)}${hint}`;
}

/**
 * `There is already a max battle against <boss> <where>: <post>.`, the battle's own boss
 * (whatever the report named), its post as `names` names it (on the map none: the sentence ends
 * at `where`, once, `endSentence`); while it has none, `names.postPending` (on Discord `: its
 * post is being made`, on the map nothing).
 */
function alreadyThere(
  ctx: Pick<AppContext, 'partyService'>,
  party: MaxParty,
  where: string,
  names: MaxNames,
): string {
  const title = maxBossTitle(ctx.partyService.maxView(party).boss.name, party.max.tier);
  const named = party.forumPostId === null ? undefined : names.post(party.forumPostId);
  const post =
    party.forumPostId === null ? names.postPending : named === undefined ? '' : `: ${named}`;
  return endSentence(`There is already a max battle against ${plain(title)} ${where}${post}`);
}

/**
 * How an answer of a report names a post and a region channel (`ReportNames`), and says what
 * `/max` says in words of Discord's (`ended`: "use `/max` again"; `bossHint`, after another
 * boss's battle is named: "`/boss` there changes its boss.", with its space before it;
 * `pinBlocked`, a member blocked from meetups at a pin: "Pick a Power Spot from the list."): on
 * Discord as `/max` says it (`DISCORD_MAX_NAMES`), on the map in the map's words (plan 8X-5).
 * `postPending` follows the battle there while it has no post yet: `: its post is being made` on
 * Discord, nothing on the map, which names no post at all (review r0 of 8X-F, X5-5).
 */
export interface MaxNames extends ReportNames {
  ended: string;
  bossHint: string;
  pinBlocked: string;
  postPending: string;
}

/**
 * `/max`'s own names and words: mentions, `MAX_ENDED`, the hint of `/boss` in the post and
 * `MAX_PIN_BLOCKED`.
 */
export const DISCORD_MAX_NAMES: MaxNames = {
  ...DISCORD_NAMES,
  ended: MAX_ENDED,
  bossHint: ' `/boss` there changes its boss.',
  pinBlocked: MAX_PIN_BLOCKED,
  postPending: ': its post is being made',
};

export const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
  [PartyStatus.Interested]: 'interested',
  [PartyStatus.Coming]: 'coming',
  [PartyStatus.Present]: 'here',
};

/**
 * What `/max` tells the member came of a report; a post and a region's channel as `names` names
 * them (mentions on Discord; on the map no post and a channel by its name), and a battle that
 * ended twice while the report waited (`names.ended`) or a member blocked at a pin
 * (`names.pinBlocked`) in its words.
 */
export function maxReportWords(
  ctx: Pick<AppContext, 'partyService'>,
  outcome: MaxReportOutcome,
  ask: Pick<MaxReportRequest, 'boss' | 'spot' | 'end'>,
  autoStatus: PartyStatus,
  names: MaxNames = DISCORD_MAX_NAMES,
): string {
  const at = atSpot(ask.spot);
  const post = (party: MaxParty, missing: string): string => {
    const named = party.forumPostId === null ? undefined : names.post(party.forumPostId);
    if (named !== undefined) return ` Its post is ${named}.`;
    return party.forumPostId === null ? missing : '';
  };
  const beingMade = ' It is being set up right now.';
  switch (outcome.kind) {
    case 'created':
      return (
        `Reported: ${ask.boss.label} ${at}, until ${timestamp(ask.end)}.` +
        post(outcome.party, beingMade)
      );
    case 'exists': {
      // The battle there by its own boss, at "this spot" (plan 8X-F, Matt: "against it at an
      // unlisted power spot" read as any spot).
      const status = STATUS_WORDS[autoStatus];
      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
      return `${alreadyThere(ctx, outcome.party, 'at this spot', names)}${marked}`;
    }
    case 'taken':
      return takenWords(ctx, outcome.party, ask.boss.tier, names);
    case 'no-region':
      return (
        `${ask.spot.kind === 'pin' ? 'That unlisted power spot' : plain(maxSpotName(ask.spot))} ` +
        'is not in any region of this server, so I have nowhere to post the battle.'
      );
    case 'no-forum':
      return (
        `The region ${names.channel(outcome.region.channelId)} has no raid forum yet. ` +
        'A moderator can create it with `/admin setup-forums`.'
      );
    case 'no-post':
      return noPostWords(outcome.refused, (id) => names.channel(id));
    case 'barred':
      return MAX_BARRED;
    case 'ended':
      return names.ended;
    case 'pin-blocked':
      return names.pinBlocked;
  }
}
