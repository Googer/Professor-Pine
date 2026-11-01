import { metresBetween } from '@pine/wayspot-core/distance';
import { PIN_NEAR_METRES } from '../geo/place.js';
import { battleKindOf, type MaxTier } from '../pogo/max-tier.js';
import {
  NO_PROMPTS,
  refused,
  sameBoss,
  withLastPossibleTime,
  type Attendee,
  type Change,
  type MaxParty,
  type MaxSpot,
  type RaidBossRef,
  type RaidScreenshot,
  type Refusal,
} from './party.js';
import { PartyStatus } from './status.js';

const MINUTE = 60_000;

/** What a reported max battle is made of (`createMax`). */
export interface NewMax {
  /** A fresh UUID. */
  id: string;
  guildId: number;
  regionId: number;
  /** Snowflake of the reporter. */
  createdById: string;
  anonymous: boolean;
  /** The reporter's automatic status (`User.status`); not interested signs nobody up. */
  autoStatus: PartyStatus;
  tier: MaxTier;
  boss: RaidBossRef;
  spot: MaxSpot;
  /** When it ends: the default end of its tier and event, or the end the report gave. */
  endTime: number;
  now: number;
  /** Since when it has its boss (`MaxDetails.bossSince`): a screenshot's sure moment; else `now`. */
  bossSince?: number;
  /** The screenshot it was reported from (`MaxDetails.screenshot`); none when left out. */
  screenshot?: RaidScreenshot | null;
}

/**
 * The lock and the rule of one max battle per spot (`PartyStore.maxAt`): a power spot by its
 * Wayfarer id (`w<id>`: no colon, as a custom id's part may hold, design 6.2), every pin by one
 * key (`pin`), since a pin blocks the pins within `PIN_NEAR_METRES` of it, whatever their
 * points: reports at pins are rare, and one lock for them all keeps the check and the write one
 * step.
 */
export function spotKey(spot: MaxSpot): string {
  return spot.kind === 'pin' ? 'pin' : `w${spot.id}`;
}

/**
 * Whether two spots are one for the rule of one max battle per spot: the same power spot, or two
 * pins within `PIN_NEAR_METRES` of each other.
 */
export function sameSpot(a: MaxSpot, b: MaxSpot): boolean {
  if (a.kind === 'pin' || b.kind === 'pin') {
    return a.kind === 'pin' && b.kind === 'pin' && metresBetween(a, b) <= PIN_NEAR_METRES;
  }
  return a.id === b.id;
}

/** Over by the clock: its end has come (a max battle always has one). */
export function maxEnded(party: MaxParty, now: number): boolean {
  return now >= (party.endTime ?? party.lastPossibleTime ?? Infinity);
}

/**
 * Whether this max battle stands in the way of a new report at its spot (design 3.1, as
 * `blocksNewRaid`): while it is active and its end has not come.
 */
export function blocksNewMax(party: MaxParty, now: number): boolean {
  return party.status === 'active' && !maxEnded(party, now);
}

/** The time floored to the minute, as every time a member gives. */
function minute(time: number): number {
  return Math.floor(time / MINUTE) * MINUTE;
}

export function createMax(input: NewMax): MaxParty {
  const { autoStatus, now } = input;
  const attendees: Record<string, Attendee> = {};
  if (
    autoStatus === PartyStatus.Interested ||
    autoStatus === PartyStatus.Coming ||
    autoStatus === PartyStatus.Present
  ) {
    attendees[input.createdById] = { number: 1, status: autoStatus, group: 'A', remote: false };
  }
  const endTime = minute(input.endTime);
  const boss: RaidBossRef =
    'key' in input.boss ? { key: input.boss.key } : { name: input.boss.name };
  const party: MaxParty = {
    id: input.id,
    type: 'max',
    guildId: input.guildId,
    status: 'active',
    regionId: input.regionId,
    gymId: null,
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    createdById: input.createdById,
    anonymous: input.anonymous,
    hatchTime: null,
    endTime,
    lastPossibleTime: null,
    deletionTime: null,
    saved: false,
    createdAt: now,
    updatedAt: now,
    attendees,
    groups: [{ id: 'A' }],
    defaultGroupId: 'A',
    prompts: NO_PROMPTS,
    max: {
      tier: input.tier,
      boss,
      spot: input.spot,
      bossSince: input.bossSince ?? now,
      screenshot: input.screenshot ? { ...input.screenshot } : null,
    },
  };
  return withLastPossibleTime(party, endTime, now);
}

/**
 * Sets when the max battle ends (`/end`), floored to the minute; the caller has checked the time
 * (within the day, never past the last battle time). The very same party when nothing changes. A
 * meeting time after the new end is removed (`removed`): the group would meet after the battle.
 * An end given confirms a screenshot's guessed time, also when it is the end the battle has
 * (`maxTimeConfirmed`, as a raid's `/end`).
 */
export function setMaxEnd(
  party: MaxParty,
  time: number,
  now: number,
): { party: MaxParty; removed: string[] } {
  const endTime = minute(time);
  if (endTime === party.endTime) return { party: maxTimeConfirmed(party), removed: [] };
  party = maxTimeConfirmed(party);
  const removed: string[] = [];
  const groups = party.groups.map((group) => {
    if (group.startTime === undefined || group.startTime <= endTime) return group;
    const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
    removed.push(group.id);
    return rest;
  });
  return { party: withLastPossibleTime({ ...party, endTime, groups }, endTime, now), removed };
}

/** The battle with its screenshot's time no longer a guess (`/end`); the same one if it was not. */
export function maxTimeConfirmed(party: MaxParty): MaxParty {
  const { screenshot } = party.max;
  if (!screenshot?.timeUncertain) return party;
  return { ...party, max: { ...party.max, screenshot: { ...screenshot, timeUncertain: false } } };
}

/**
 * Sets the boss of a max battle (`/boss`, a rotation within an event; design 3.1): the tier
 * follows the boss, and it has the boss since `since` (`MaxDetails.bossSince`); a change between
 * Dynamax and Gigantamax is refused (`max-kind-change`: the lobby size would jump; report anew).
 * `changed` is false when boss and tier are what they were.
 */
export function setMaxBoss(
  party: MaxParty,
  boss: RaidBossRef,
  tier: MaxTier,
  since: number,
): Change<MaxParty, { changed: boolean }> {
  if (battleKindOf(tier) !== battleKindOf(party.max.tier)) return refused('max-kind-change');
  if (sameBoss(party.max.boss, boss) && party.max.tier === tier) {
    return { ok: true, party, changed: false };
  }
  const ref: RaidBossRef = 'key' in boss ? { key: boss.key } : { name: boss.name };
  return {
    ok: true,
    party: { ...party, max: { ...party.max, boss: ref, tier, bossSince: since } },
    changed: true,
  };
}

/**
 * What a max battle's screenshot says of the battle at its spot (plan 8X-S; `decideMax`'s
 * `ScreenshotMax` with the screenshot kept): its boss and tier, its end (the countdown's, capped
 * at the day's last battle), when it was taken and whether that moment is sure, and whether the
 * countdown ends at a rotation.
 */
export interface MaxShot {
  boss: RaidBossRef;
  tier: MaxTier;
  end: number;
  takenAt: number;
  sureMoment: boolean;
  rotationEnd: boolean;
  screenshot: RaidScreenshot;
}

/**
 * What a screenshot does to the battle at its spot (design 6, Matt's answers of 2026-10-22):
 * - the same boss (`join`), at whatever tier of the kind (the tier is `/boss`'s; Matt, review r4
 *   A2): the battle is joined; its end moves only later, and only on a clean read (a sure moment
 *   and a countdown that ends at a rotation, not the all-day kind), the screenshot then the
 *   post's (`endMoved`); a clean read of the end it has confirms its time (`confirmed`,
 *   `maxTimeConfirmed`), the screenshot then the post's too; a screenshot that was not kept
 *   (`id` null) leaves the post the one it has, its time no guess any more;
 * - another boss of the same kind on a sure moment newer than the battle's boss (`change`): boss,
 *   tier and end change together, it has the boss since the screenshot was taken, the screenshot
 *   is the post's; a meeting time after the new end is removed (`removed`, as `setMaxEnd`);
 * - another boss otherwise: refused (`max-other-boss`), and the other kind always
 *   (`max-kind-change`).
 * The very same party when nothing changes. Attendance is the caller's.
 */
export function screenshotAtBattle(
  party: MaxParty,
  shot: MaxShot,
  now: number,
):
  | {
      ok: true;
      party: MaxParty;
      did: 'join';
      endMoved: boolean;
      confirmed: boolean;
      removed: string[];
    }
  | { ok: true; party: MaxParty; did: 'change'; removed: string[] }
  | Refusal {
  // A screenshot that was not kept leaves the post the one it shows (review r4 A4); the very same
  // party when that is the screenshot it has already (review S-9).
  const withShot = (changed: MaxParty): MaxParty => {
    const screenshot =
      shot.screenshot.id === null
        ? { id: changed.max.screenshot?.id ?? null, timeUncertain: false }
        : { ...shot.screenshot };
    const had = changed.max.screenshot;
    if (had?.id === screenshot.id && had.timeUncertain === screenshot.timeUncertain) return changed;
    return { ...changed, max: { ...changed.max, screenshot } };
  };
  if (battleKindOf(shot.tier) !== battleKindOf(party.max.tier)) return refused('max-kind-change');
  // The same boss at another tier of the kind is joined: the tier is `/boss`'s (Matt, A2).
  if (sameBoss(party.max.boss, shot.boss)) {
    const clean = shot.sureMoment && shot.rotationEnd;
    const end = minute(shot.end);
    if (clean && end === party.endTime) {
      // The end the battle has, read surely: its time is no guess any more (review r4 A3).
      const confirmed = withShot(maxTimeConfirmed(party));
      return {
        ok: true,
        party: confirmed,
        did: 'join',
        endMoved: false,
        confirmed: true,
        removed: [],
      };
    }
    if (!clean || end <= (party.endTime ?? Infinity)) {
      return { ok: true, party, did: 'join', endMoved: false, confirmed: false, removed: [] };
    }
    const set = setMaxEnd(party, shot.end, now);
    return {
      ok: true,
      party: withShot(set.party),
      did: 'join',
      endMoved: true,
      confirmed: false,
      removed: [],
    };
  }
  if (!shot.sureMoment || shot.takenAt <= party.max.bossSince) return refused('max-other-boss');
  const changed = setMaxBoss(party, shot.boss, shot.tier, shot.takenAt);
  if (!changed.ok) return changed;
  const set = setMaxEnd(changed.party, shot.end, now);
  return { ok: true, party: withShot(set.party), did: 'change', removed: set.removed };
}

/** What a pin of a max battle is called (design 3.2, Q7): a power spot Pine does not know. */
export const UNLISTED_SPOT = 'Unlisted power spot';

/**
 * What a command about a gym says in a max battle's post, where it cannot take the party's gym
 * (`/request`, `/target`, `/untarget`; final review X3-F6).
 */
export const MAX_NO_GYM = 'A max battle is at a Power Spot, not a gym: name the gym with `gym`.';

/** A max battle's spot by name: the power spot's title, or `UNLISTED_SPOT` for a pin. */
export function maxSpotName(spot: MaxSpot): string {
  return spot.kind === 'pin' ? UNLISTED_SPOT : spot.title;
}
