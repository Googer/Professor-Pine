import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import type { ScreenshotMax } from '../../domain/ocr/max-decision.js';
import type { MaxSpot, RaidScreenshot } from '../../domain/party/party.js';
import type { PartyStatus } from '../../domain/party/status.js';
import { maxBossTitle } from '../../domain/pogo/max-tier.js';
import { MAX_BATTLE_OVER } from '../../render/screenshot-reading.js';
import { plain, timestamp } from '../../render/text.js';
import type { Member } from '../../services/attendance-service.js';
import type { MaxShotOutcome } from '../../services/max-change-service.js';
import { battlesOver, spotAt, type ReadMaxBoss, type SpotReading } from './max-input.js';
import {
  atSpot,
  MAX_BARRED,
  maxBarred,
  maxReportWords,
  reportMaxAs,
  takenWords,
  type MaxReporter,
  type MaxReporting,
  type MaxReportResult,
} from './max-report.js';

/*
 * A max battle reported from a screenshot (plan 8X-S; design 6): what a mention, passive reading
 * and `/max screenshot:` share. The battle at the spot is looked at first (`PartyStore.maxAt`):
 * one there is joined, has its boss changed, or refuses the screenshot, in one change of the
 * store (`MaxChangeService.fromScreenshot`); a free spot is reported as `/max` reports it
 * (`reportMaxAs`), once, also where the battle there ended between the look and the change.
 */

/** A max battle as a screenshot gives it, with what was typed over it already put in. */
export interface MaxShotRequest {
  boss: ReadMaxBoss;
  /** A Power Spot: a screenshot makes no pin. */
  spot: MaxSpot;
  end: number;
  /** The region channel it was posted in. */
  regionChannelId: string;
  /**
   * When the screenshot was taken, whether that moment is sure (never with a boss or spot typed
   * beside it: those change no battle's boss nor move its end, review S-2), and the countdown's
   * kind.
   */
  takenAt: number;
  sureMoment: boolean;
  rotationEnd: boolean;
  /** The end is the day's last battle time the countdown was capped at (Matt's M2). */
  capped: boolean;
  screenshot: RaidScreenshot;
}

/**
 * What came of it. `over`: the end had passed by the time of reporting (the reading may have
 * waited in the queue; review R11): `over-for-today` for an end capped at the last battle time,
 * else `battle-over`; nothing was done. `barred`: the battle there stands in a forum the member
 * is kept out of. `at-battle`: the battle there was joined, changed or refused the screenshot
 * (the member's automatic status for the answer). `reported`: as `/max` reports it.
 */
export type MaxShotResult =
  | { kind: 'over'; reason: 'battle-over' | 'over-for-today' }
  | { kind: 'barred' }
  | {
      kind: 'at-battle';
      outcome: Exclude<MaxShotOutcome, { kind: 'gone' }>;
      autoStatus: PartyStatus;
    }
  | { kind: 'reported'; result: MaxReportResult }
  /** Asked to join only (`joinOnly`), and no battle was there: nothing was done. */
  | { kind: 'none-there' };

/** What reporting from a screenshot needs beyond `/max`'s reporting. */
export type MaxShotReporting = MaxReporting & Pick<AppContext, 'guilds' | 'parties' | 'maxBattles'>;

/**
 * Reports the screenshot's battle as the member in the server `serverId` (a snowflake): checks
 * its end against the clock first (R11), then looks at the spot. `mayJoin` is asked before the
 * battle there is changed or joined; a new battle gets the screenshot, and the boss since its
 * moment when that is sure (review R10). A battle there whose post is still being made is reported
 * as `/max` reports it (joined once its post is made), unless only joining was asked. With `joinOnly` only a battle there is joined or
 * changed: none there is `none-there` (the passive reading of another region's spot, Matt's M1).
 */
export async function reportMaxShotAs(
  ctx: MaxShotReporting,
  member: Member,
  serverId: string,
  request: MaxShotRequest,
  reporter: MaxReporter,
  options: { joinOnly?: boolean } = {},
): Promise<MaxShotResult> {
  const now = Date.now();
  if (request.end <= now) {
    return { kind: 'over', reason: request.capped ? 'over-for-today' : 'battle-over' };
  }
  const guild = await ctx.guilds.idFor(serverId);
  const there = guild === undefined ? undefined : ctx.parties.maxAt(guild, request.spot, now);
  // A battle whose post is still being made is `/max`'s to join: `reportMaxAs` waits for the
  // post and decides again (review r4 A1); asked only to join (`joinOnly`), it is joined here.
  if (there && (there.forumPostId !== null || options.joinOnly === true)) {
    const forum = there.forumChannelId;
    if (forum !== null && !(await reporter.mayJoin(forum))) return { kind: 'barred' };
    const settings = await ctx.users.get(member.id);
    const outcome = await ctx.maxBattles.fromScreenshot(
      there.id,
      member,
      {
        boss: request.boss.boss,
        tier: request.boss.tier,
        label: request.boss.label,
        end: request.end,
        takenAt: request.takenAt,
        sureMoment: request.sureMoment,
        rotationEnd: request.rotationEnd,
        screenshot: request.screenshot,
      },
      settings.autoStatus,
    );
    if (outcome.kind !== 'gone') {
      return { kind: 'at-battle', outcome, autoStatus: settings.autoStatus };
    }
    // Its end came meanwhile: the spot is free, and reported anew below.
  }
  if (options.joinOnly === true) return { kind: 'none-there' };
  const result = await reportMaxAs(
    ctx,
    member,
    serverId,
    {
      boss: request.boss,
      spot: request.spot,
      end: request.end,
      regionChannelId: request.regionChannelId,
      screenshot: request.screenshot,
      ...(request.sureMoment ? { bossSince: request.takenAt } : {}),
    },
    reporter,
  );
  return { kind: 'reported', result };
}
/**
 * What came of a screenshot's battle on Discord (`reportMaxShot`): `reportMaxShotAs`'s, or
 * `unknown-access` when Discord could not say whether the member may be put in the forum.
 */
export type MaxShotAnswer = MaxShotResult | { kind: 'unknown-access' };

/** What reporting a screenshot's battle needs of the bot (`reportMaxShot`, `maxShotRequest`). */
export type MaxShotContext = MaxShotReporting &
  SpotReading &
  Pick<AppContext, 'screenshots' | 'config'>;

/** Said when the Power Spot a screenshot named left the list before its battle was reported. */
export const SPOT_GONE = 'That Power Spot is no longer on my list: use `/max spot:`.';

/** What a screenshot's author is told when Discord cannot say whether they may see the forum. */
export const MAX_ACCESS_UNKNOWN =
  'Discord cannot be reached just now, so nothing was reported. Try again in a moment.';

/**
 * The report of the battle a screenshot was decided as (`ScreenshotMax`), with its Power Spot of
 * the server (`spotAt`; undefined once it is gone from the list) and the boss as `/max` names it
 * (`bossName` the report's), from the region channel it was posted in; `boss` typed beside it
 * (`/max screenshot:`) in the place of what was read, `bossShown` when it is the boss read.
 */
export function maxShotRequest(
  ctx: SpotReading,
  guildRow: number,
  battle: ScreenshotMax,
  bossName: string,
  regionChannelId: string,
  screenshotId: string | undefined,
  typed: { boss?: ReadMaxBoss; bossShown?: boolean; spot?: MaxSpot; end?: number } = {},
): MaxShotRequest | undefined {
  let spot = typed.spot;
  if (spot === undefined) {
    try {
      spot = spotAt(ctx, guildRow, { spot: battle.spotId });
    } catch (err) {
      if (err instanceof UserError) return undefined;
      throw err;
    }
  }
  return {
    boss: typed.boss ?? {
      boss: battle.boss,
      tier: battle.tier,
      label: plain(maxBossTitle(bossName, battle.tier)),
    },
    spot,
    end: typed.end ?? battle.end,
    regionChannelId,
    takenAt: battle.takenAt,
    // Only a boss and a spot the screen itself showed change a battle's boss or move its end
    // (review S-2, Matt 2026-10-23): with either typed, the moment counts as no sure one; a boss
    // typed that is the very one the screen shows (`bossShown`) is the screen's.
    sureMoment:
      battle.sureMoment &&
      (typed.boss === undefined || typed.bossShown === true) &&
      typed.spot === undefined,
    rotationEnd: battle.rotationEnd,
    capped: typed.end === undefined && battle.capped,
    screenshot: { id: screenshotId ?? null, timeUncertain: battle.timeUncertain },
  };
}

/**
 * Reports a screenshot's battle as the member (plan 8X-S): what a mention, passive reading and
 * `/max screenshot:` share. A report that would put the member in a forum somebody keeps them out
 * of is refused first, as `/max` refuses it (`maxBarred`: the forum a new battle would go to and
 * that of the battle there; `unknown-access`, logged, while Discord cannot say); then
 * `reportMaxShotAs`. A screenshot its battle's post now shows (a new battle, a boss changed, an
 * end moved) is kept while the battle lasts (`ScreenshotService.inUse`). A screenshot's own
 * Power Spot is never a pin; a pin is only typed beside it (`/max screenshot: spot:`), and then
 * `staff` lets a member of staff with a block report there as `/max` does (`reportMaxAs`).
 */
export async function reportMaxShot(
  ctx: MaxShotContext,
  request: MaxShotRequest,
  who: { member: Member; serverId: string; guildRow: number; staff: boolean; joinOnly?: boolean },
): Promise<MaxShotAnswer> {
  const { member } = who;
  const memberAccess = (forumId: string, memberId: string) =>
    ctx.partyService.memberAccess(forumId, memberId);
  try {
    const joins = ctx.parties.maxAt(who.guildRow, request.spot, Date.now());
    const ask = { spot: request.spot, regionChannelId: request.regionChannelId, joins };
    if (await maxBarred({ partyService: ctx.partyService, memberAccess }, ask, member.id)) {
      return { kind: 'barred' };
    }
  } catch (err) {
    ctx.log.warn(
      { err, user: member.id },
      'could not ask Discord whether a screenshot would report a max battle in a forum its author is kept out of',
    );
    return { kind: 'unknown-access' };
  }
  const result = await reportMaxShotAs(
    ctx,
    member,
    who.serverId,
    request,
    {
      mayJoin: async (forumId) => (await memberAccess(forumId, member.id)) !== 'barred',
      staff: who.staff,
    },
    who.joinOnly === true ? { joinOnly: true } : {},
  );
  const { id } = request.screenshot;
  if (id !== null && showsScreenshot(result)) await ctx.screenshots.inUse(id);
  return result;
}

/**
 * Whether the battle's post shows the screenshot now (`MaxDetails.screenshot`): a new battle, a
 * boss changed, an end moved or confirmed.
 */
function showsScreenshot(result: MaxShotResult): boolean {
  if (result.kind === 'reported') return result.result.outcome.kind === 'created';
  if (result.kind !== 'at-battle') return false;
  const { outcome } = result;
  return (
    outcome.kind === 'changed' ||
    (outcome.kind === 'joined' && (outcome.endMoved || outcome.confirmed))
  );
}

/**
 * Whether a screenshot's battle gives the use back, as `/max` gives these back: its post could not
 * be made, or the battle there ended twice while it waited (none of the member's doing), or a
 * member blocked from meetups typed a pin (`pin-blocked`, which `/max`'s guard refuses uncounted;
 * review r4 B3).
 */
export function maxShotGivesBack(answer: MaxShotAnswer): boolean {
  if (answer.kind !== 'reported') return false;
  const { kind } = answer.result.outcome;
  return kind === 'no-post' || kind === 'ended' || kind === 'pin-blocked';
}

/**
 * Whether the battle there refused the screenshot (another boss, `max-other-boss`, or the other
 * kind, `max-kind-change`): `/max screenshot:` gives that use back, as `/max`'s guard refuses
 * another boss there uncounted (review F-1). A mention's use is not given back for it.
 */
export function refusedAtBattle(answer: MaxShotAnswer): boolean {
  return answer.kind === 'at-battle' && answer.outcome.kind === 'refused';
}

/** Whether the member is in the screenshot's battle now: reported, joined, or its boss changed. */
export function maxShotMade(answer: MaxShotAnswer): boolean {
  if (answer.kind === 'reported') {
    return answer.result.outcome.kind === 'created' || answer.result.outcome.kind === 'exists';
  }
  return answer.kind === 'at-battle' && answer.outcome.kind !== 'refused';
}

/**
 * What the member is told came of a screenshot's battle (plan 8X-S), in `/max`'s words where
 * `/max` says the same (`maxReportWords`, `takenWords`: another boss there named with its post,
 * the hint of `/boss` only within one kind); a boss changed or an end moved by the screenshot
 * says so; an end passed by now in the words of its kind (review R11, Matt's M2).
 */
export function maxShotWords(
  ctx: Pick<AppContext, 'partyService' | 'config'>,
  answer: MaxShotAnswer,
  request: MaxShotRequest,
): string {
  switch (answer.kind) {
    case 'over':
      return answer.reason === 'over-for-today' ? battlesOver(ctx) : MAX_BATTLE_OVER;
    case 'barred':
      return MAX_BARRED;
    case 'unknown-access':
      return MAX_ACCESS_UNKNOWN;
    case 'none-there':
      return `There is no max battle ${atSpot(request.spot)} to join.`;
    case 'reported':
      return maxReportWords(ctx, answer.result.outcome, request, answer.result.autoStatus);
    case 'at-battle': {
      const { outcome } = answer;
      if (outcome.kind === 'refused') return takenWords(ctx, outcome.party, request.boss.tier);
      const post =
        outcome.party.forumPostId === null ? '' : ` Its post is <#${outcome.party.forumPostId}>.`;
      const end = outcome.party.endTime ?? request.end;
      if (outcome.kind === 'changed') {
        return (
          `Changed the boss of the max battle ${atSpot(request.spot)} to ${request.boss.label} ` +
          `from your screenshot, until ${timestamp(end)}.${post}`
        );
      }
      const joined = maxReportWords(
        ctx,
        { kind: 'exists', party: outcome.party, joined: outcome.joined },
        request,
        answer.autoStatus,
      );
      return outcome.endMoved
        ? `${joined} Its end is now ${timestamp(end)}, from your screenshot.`
        : joined;
    }
  }
}
