import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { MemberAccess } from '../../discord/party-gateway.js';
import type { Throttle } from '../../discord/throttle.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { noPostWords } from '../../render/activity.js';
import { endSentence, plain } from '../../render/text.js';
import type { Member } from '../../services/attendance-service.js';
import type { RaidScreenshot } from '../../domain/party/party.js';
import type { PartyService, ReportOutcome } from '../../services/party-service.js';
import type { PartyProvider } from '../../services/party-store.js';
import type { ReportedBoss } from './raid-input.js';

/**
 * Reporting a raid as `/raid` (and its short forms) and the live map (plan 8M-4) share it: the
 * report as the member, with their own privacy and automatic status (`reportRaidAs`), and the
 * command's words for what came of it (`reportWords`).
 */

/** The name `/raid` is used and counted under, and the map's reports with it. */
export const RAID_COMMAND = 'raid';

/** How often one member may report a raid, from Discord and from the map together. */
export const RAID_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };

/** What reporting needs: the members' settings and the party service. */
export type RaidReporting = Pick<AppContext, 'users' | 'partyService'>;

/** A report whose gym is known: what it is, its time, where it was made. */
export interface RaidReportRequest {
  reported: ReportedBoss;
  /** Read by `reportedTime`; undefined when none was given. */
  time: { hatch: number } | { end: number } | undefined;
  /**
   * The region channel the report was made in (the map: the region the member picked): the raid
   * goes to that region when the gym lies in it and it has a forum.
   */
  regionChannelId: string | undefined;
  /** Seen hatched without a boss anybody could tell (from a screenshot). */
  hatched?: boolean;
  screenshot?: RaidScreenshot;
  /** Whether the member may be put in the forum of a raid the report would join (`mayJoinAs`). */
  mayJoin?: (forumId: string) => Promise<boolean>;
}

/** What came of a report, and the reporter's automatic status, which the answer names. */
export interface ReportResult {
  outcome: ReportOutcome;
  autoStatus: PartyStatus;
}

/**
 * Reports the raid as the member: anonymous when their privacy setting says so, signed up by
 * their automatic status under their name and team.
 */
export async function reportRaidAs(
  ctx: RaidReporting,
  member: Member,
  gym: Gym,
  request: RaidReportRequest,
): Promise<ReportResult> {
  const { id, ...reporter } = member;
  const settings = await ctx.users.get(id);
  const outcome = await ctx.partyService.reportRaid({
    gym,
    reporterId: id,
    reporter,
    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
    autoStatus: settings.autoStatus,
    tier: request.reported.tier,
    boss: request.reported.boss,
    ...(request.hatched ? { hatched: true } : {}),
    ...(request.screenshot ? { screenshot: request.screenshot } : {}),
    ...(request.regionChannelId === undefined ? {} : { regionChannelId: request.regionChannelId }),
    ...(request.time ? { time: request.time } : {}),
    ...(request.mayJoin ? { mayJoin: request.mayJoin } : {}),
  });
  return { outcome, autoStatus: settings.autoStatus };
}

/**
 * What `/raid`, the map and a screenshot in a region channel answer a report that would put the
 * member in a forum barred to them.
 */
export const REPORT_BARRED =
  'You cannot report a raid at this gym: you are kept out of the forum its raid would be in.';

/**
 * What the check of a report's forums needs: where a new raid would go (`regionFor`), the raid
 * that stands at the gym (`PartyProvider.raidAt`, the one rule), and how a member stands to a forum
 * (`PartyGateway.memberAccess`; on Discord through the party service, on the map through the
 * parties' own deps).
 */
export interface ReportAccess {
  partyService: Pick<PartyService, 'regionFor'>;
  parties: Pick<PartyProvider, 'raidAt'>;
  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined>;
}

/**
 * `ReportAccess` on Discord, for `/raid` and the screenshots posted in a region channel: how a
 * member stands to a forum, through the party service's gateway.
 */
export function reportAccessOf(ctx: Pick<AppContext, 'partyService' | 'parties'>): ReportAccess {
  return {
    partyService: ctx.partyService,
    parties: ctx.parties,
    memberAccess: (forumId, member) => ctx.partyService.memberAccess(forumId, member),
  };
}

/**
 * Whether a report at this gym, made in this region channel (on the map: the region picked),
 * would put the member in a forum somebody keeps them out of (`barred`: `AccessService` would
 * not let them in), as `/raid` and the map both ask it before their throttle (plans 8M-4, 8M-6):
 * the forum a new raid would go to (`regionFor`, as `reportRaid` decides), then that of the raid
 * of the server that stands at the gym now (`raidAt`, the rule the report itself follows: a raid
 * over by the clock stands no more, review 8E-2 of plan 8E), which the report would join and
 * which may stand in another region's forum. Rejects while Discord cannot say.
 */
export async function reportBarred(
  access: ReportAccess,
  gym: Gym,
  regionChannelId: string | undefined,
  guildRow: number,
  memberId: string,
  now: number,
): Promise<boolean> {
  const forum = access.partyService.regionFor(gym, regionChannelId).region?.forumChannelId ?? null;
  const standing = access.parties.raidAt(guildRow, gym.id, now)?.forumChannelId ?? null;
  for (const forumId of new Set([forum, standing])) {
    if (forumId !== null && (await access.memberAccess(forumId, memberId)) === 'barred') {
      return true;
    }
  }
  return false;
}

/**
 * What a report asks once it would join a raid already at the gym (`RaidReport.mayJoin`, plan
 * 8W-3): whether the member is kept out of that raid's forum, asked again there, since the raid
 * may have been reported after `reportBarred` looked (at a gym of two regions, in another
 * region's forum). Rejects while Discord cannot say.
 */
export function mayJoinAs(
  access: Pick<ReportAccess, 'memberAccess'>,
  memberId: string,
): (forumId: string) => Promise<boolean> {
  return async (forumId) => (await access.memberAccess(forumId, memberId)) !== 'barred';
}

/**
 * `mayJoinAs` for a caller that answers Discord away in words of its own (a screenshot, the
 * map): a failure to ask is kept (`failure`) and answered false, so that nothing is joined and
 * the report comes back `barred`; the caller then says Discord could not be asked instead.
 */
export function mayJoinNoting(
  access: Pick<ReportAccess, 'memberAccess'>,
  memberId: string,
): { mayJoin: (forumId: string) => Promise<boolean>; failure: () => { err: unknown } | undefined } {
  const ask = mayJoinAs(access, memberId);
  let failed: { err: unknown } | undefined;
  return {
    mayJoin: async (forumId) => {
      try {
        return await ask(forumId);
      } catch (err) {
        failed = { err };
        return false;
      }
    },
    failure: () => failed,
  };
}

/**
 * How an answer names a post and a region channel: as mentions on Discord; on the map no post
 * (the page opens the raid instead: undefined leaves the sentence out) and a channel by its name.
 */
export interface ReportNames {
  post(postId: string): string | undefined;
  channel(channelId: string): string;
}

export const DISCORD_NAMES: ReportNames = {
  post: (postId) => `<#${postId}>`,
  channel: (channelId) => `<#${channelId}>`,
};

const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
  [PartyStatus.Interested]: 'interested',
  [PartyStatus.Coming]: 'coming',
  [PartyStatus.Present]: 'here',
};

const gymName = (gym: Gym): string => plain(gym.nickname ?? gym.name);

/** What `/raid` tells the member came of a report (`label`: what was reported, `T5 egg`). */
export function reportWords(
  result: ReportResult,
  gym: Gym,
  label: string,
  names: ReportNames,
): string {
  const { outcome } = result;
  const postSentence = (postId: string | null, missing: string): string => {
    const named = postId === null ? undefined : names.post(postId);
    if (named !== undefined) return ` Its post is ${named}.`;
    return postId === null ? missing : '';
  };
  switch (outcome.kind) {
    case 'created':
      return (
        endSentence(`Reported: ${label} at ${gymName(gym)}`) +
        postSentence(outcome.party.forumPostId, '')
      );
    case 'exists': {
      const where = postSentence(outcome.party.forumPostId, ' It is being set up right now.');
      const status = STATUS_WORDS[result.autoStatus];
      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
      return `${endSentence(`There is already a raid at ${gymName(gym)}`)}${where}${marked}`;
    }
    case 'gym-gone':
      return `${gymName(gym)} was removed from my gym list just now, so there is no raid to report there.`;
    case 'no-region':
      return `${gymName(gym)} is not in any region of this server, so I have nowhere to post the raid.`;
    case 'no-forum':
      return (
        `The region ${names.channel(outcome.region.channelId)} has no raid forum yet. ` +
        'A moderator can create it with `/admin setup-forums`.'
      );
    case 'no-post':
      return noPostWords(outcome.refused, (id) => names.channel(id));
    case 'barred':
      return REPORT_BARRED;
    case 'none-there':
      return `There is no raid at ${gymName(gym)} to join.`;
  }
}
