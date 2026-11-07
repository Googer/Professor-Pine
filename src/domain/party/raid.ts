import type { RaidBoss } from '../pogo/raid-bosses.js';
import { stageAt } from './raid-stage.js';
import { raidDurationKind, sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
import type { RaidKind } from '../time/party-time.js';
import {
  hatchTimeForEnd,
  longestRaidDurations,
  standsWithoutTimes,
  raidDurationsAt,
  type RaidDurationRules,
} from '../time/raid-durations.js';
import {
  NO_PROMPTS,
  refused,
  sameBoss,
  withLastPossibleTime,
  type Attendee,
  type Change,
  type GroupId,
  type RaidBossRef,
  type RaidParty,
  type RaidStage,
} from './party.js';
import { PartyStatus } from './status.js';

const MINUTE = 60_000;

export interface NewRaid {
  /** A fresh UUID. */
  id: string;
  guildId: number;
  regionId: number;
  gymId: number;
  /** Snowflake of the reporter. */
  createdById: string;
  anonymous: boolean;
  /** The reporter's automatic status (`User.status`); not interested signs nobody up. */
  autoStatus: PartyStatus;
  tier: RaidTier;
  /** Null for an egg; a boss means the raid was seen hatched. */
  boss: RaidBossRef | null;
  /** Seen hatched without a boss anybody could tell (a screenshot report). */
  hatched?: boolean;
  fastMove?: string | null;
  chargedMove?: string | null;
  now: number;
}

/**
 * The reference to store for a boss of `ctx.raidBosses`: its catalogue key when the game master
 * knows it, otherwise the feed's name (the boss's own `key` is then no catalogue key).
 */
export function raidBossRef(boss: Pick<RaidBoss, 'entry' | 'name'>): RaidBossRef {
  return boss.entry ? { key: boss.entry.key } : { name: boss.name };
}

/**
 * Exactly the reference and nothing else, whatever object it was cut from. A `RaidBoss` is
 * structurally a `{ key }`, so one handed in by mistake is read the way `raidBossRef` reads it
 * (its own `key` is no catalogue key when the game master does not know it). Any other value
 * with both `key` and `name` is read as the key.
 */
function cleanBossRef(ref: RaidBossRef | null): RaidBossRef | null {
  if (ref === null) return null;
  if (Object.hasOwn(ref, 'entry') && 'name' in ref) {
    return raidBossRef(ref as unknown as Pick<RaidBoss, 'entry' | 'name'>);
  }
  return 'key' in ref ? { key: ref.key } : { name: ref.name };
}

/**
 * The moves that are certain for a boss: the fast move of a Pokémon that has only one (Kyogre
 * has only Waterfall), and the same for the charged move; null where there is a choice or the
 * Pokémon is not known. Set whenever a raid gets its boss: when it is reported, when a member
 * names the boss and when an egg hatches as the one boss of its tier.
 */
export function certainMoves(
  entry: { fastMoves: readonly string[]; chargedMoves: readonly string[] } | undefined,
): { fastMove: string | null; chargedMove: string | null } {
  const only = (moves: readonly string[] | undefined): string | null =>
    moves?.length === 1 ? (moves[0] ?? null) : null;
  return { fastMove: only(entry?.fastMoves), chargedMove: only(entry?.chargedMoves) };
}

export function raidKindOf(party: RaidParty): RaidKind {
  return raidDurationKind(party.raid.tier);
}

/**
 * Egg, hatched or ended, by the clock. A raid without times is what it was reported as (an
 * egg, or hatched when the report named a boss) until the last moment it could be going on has
 * passed. Naming the boss later changes nothing here.
 */
export function raidStage(party: RaidParty, now: number): RaidStage {
  // One rule with the map's page (plan 8M-7): `stageAt`.
  return stageAt(
    {
      hatchTime: party.hatchTime,
      endTime: party.endTime,
      lastPossibleTime: party.lastPossibleTime,
      reportedHatched: party.raid.reportedHatched,
    },
    now,
  );
}

/**
 * Whether the egg of a raid may hatch at `time`, by what was seen of it: a raid reported hatched
 * (a boss named, or `hatched`: what `raidStage` takes a raid without times for) had hatched when
 * it was reported, whatever times it was given since, so it hatches at no time after `now`
 * (`hatched-already`). An egg's hatch time may move either way (a correction).
 */
export function mayHatchAt(party: RaidParty, time: number, now: number): boolean {
  return !party.raid.reportedHatched || time <= now;
}

/**
 * Whether a gym is an elite raid gym, as the game now calls what was an EX gym: either of the
 * two stored flags says so (`taggedEx`: it has the tag; `confirmedEx`: it has hosted such a
 * raid). The columns keep their names, which the legacy bot shares; what anybody reads is
 * "elite raid gym". The one place that knows the rule.
 */
export function isEliteGym(gym: { taggedEx: boolean; confirmedEx: boolean }): boolean {
  return gym.taggedEx || gym.confirmedEx;
}

/**
 * The channels besides its own post in which a raid's message should stand (spec 5.2): `ex` for
 * a raid at an elite raid gym; `remote` for a raid that can be
 * joined remotely (every raid but an elite one). None once the raid has ended by the clock: what
 * is over is of no use to somebody looking for a raid. Whether the server has such channels, and
 * wants them, is the caller's to know.
 */
export function raidMirrors(
  party: RaidParty,
  gym: { taggedEx: boolean; confirmedEx: boolean } | undefined,
  now: number,
): ('ex' | 'remote')[] {
  if (party.status !== 'active' || raidStage(party, now) === 'ended') return [];
  const { level } = party.raid.tier;
  return [
    ...(gym && isEliteGym(gym) ? ['ex' as const] : []),
    ...(level !== 'Elite' ? ['remote' as const] : []),
  ];
}

/** Whether this raid stands in the way of a new report for its gym: it does until it has ended. */
export function blocksNewRaid(party: RaidParty, now: number): boolean {
  return party.status === 'active' && raidStage(party, now) !== 'ended';
}

/**
 * Whether this raid stands at this gym for this server (`guildId`, its row): it is a raid of the
 * server at the gym and blocks a new report there (`blocksNewRaid`). Of any kind (plan 8E; Matt,
 * 2026-10-26): an elite raid shows its egg on the gym, usually from the evening before, so a gym
 * has one raid, standard or elite, at a time. Per server (review E7, as `maxAt`): a raid of
 * another server that has the same gym is none of this server's.
 */
export function standsAtGym(
  party: RaidParty,
  guildId: number,
  gymId: number,
  now: number,
): boolean {
  return party.guildId === guildId && party.gymId === gymId && blocksNewRaid(party, now);
}

/**
 * The raid that stands at this gym for this server (`standsAtGym`), whatever its kind, leaving
 * out the raid `except` (one that is being changed): the one rule of "the gym has a raid already"
 * for every report and every change of a raid's gym, tier or times. Of two raids at one gym,
 * which only reports from before plan 8E can have left, the first in `raids`' order (the store's:
 * oldest first).
 */
export function raidStandingAt(
  raids: Iterable<RaidParty>,
  guildId: number,
  gymId: number,
  now: number,
  except?: string,
): RaidParty | undefined {
  for (const raid of raids) {
    if (raid.id !== except && standsAtGym(raid, guildId, gymId, now)) return raid;
  }
  return undefined;
}

/**
 * The latest moment a raid without an end time can be going on (`standsWithoutTimes`, the rule
 * the history's `raidTime` shares). An egg reported at `createdAt`
 * hatches within the incubation time and then lasts the hatched time; a raid reported hatched
 * hatched before `createdAt` and lasts no longer than the hatched time from then.
 */
function latestWithoutTimes(party: RaidParty, rules: RaidDurationRules): number {
  const kind = raidKindOf(party);
  const { createdAt } = party;
  const usual = raidDurationsAt(kind, createdAt, rules);
  const reportedHatched = party.raid.reportedHatched;
  // The span of possible hatch times: before the report, or within the incubation time after it.
  const from = reportedHatched ? createdAt - usual.hatched * MINUTE : createdAt;
  const to = reportedHatched ? createdAt : createdAt + usual.incubation * MINUTE;
  const longest = longestRaidDurations(kind, from, to, rules);
  const hatched = party.raid.hatchedDuration ?? longest.hatched;
  return (
    createdAt +
    standsWithoutTimes(kind, reportedHatched, { incubation: longest.incubation, hatched }) * MINUTE
  );
}

/**
 * Brings what follows from the times up to date: the last possible time, and with it a
 * scheduled archiving, which is called off when the raid turns out to be still going on
 * (`withLastPossibleTime`).
 */
function settled(party: RaidParty, rules: RaidDurationRules, now: number): RaidParty {
  return withLastPossibleTime(party, party.endTime ?? latestWithoutTimes(party, rules), now);
}

/** Minutes this raid lasts once hatched at `hatchTime`. */
function hatchedMinutes(party: RaidParty, hatchTime: number, rules: RaidDurationRules): number {
  return party.raid.hatchedDuration ?? raidDurationsAt(raidKindOf(party), hatchTime, rules).hatched;
}

export function createRaid(input: NewRaid, rules: RaidDurationRules): RaidParty {
  const { autoStatus, now } = input;
  const boss = cleanBossRef(input.boss);
  const attendees: Record<string, Attendee> = {};
  if (
    autoStatus === PartyStatus.Interested ||
    autoStatus === PartyStatus.Coming ||
    autoStatus === PartyStatus.Present
  ) {
    attendees[input.createdById] = { number: 1, status: autoStatus, group: 'A', remote: false };
  }
  const raid: RaidParty = {
    id: input.id,
    type: 'raid',
    guildId: input.guildId,
    status: 'active',
    regionId: input.regionId,
    gymId: input.gymId,
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    createdById: input.createdById,
    anonymous: input.anonymous,
    hatchTime: null,
    endTime: null,
    lastPossibleTime: null,
    deletionTime: null,
    saved: false,
    createdAt: now,
    updatedAt: now,
    attendees,
    groups: [{ id: 'A' }],
    defaultGroupId: 'A',
    prompts: NO_PROMPTS,
    raid: {
      tier: input.tier,
      boss,
      fastMove: boss ? (input.fastMove ?? null) : null,
      chargedMove: boss ? (input.chargedMove ?? null) : null,
      reportedHatched: boss !== null || input.hatched === true,
      hatchedDuration: null,
      stageSeen: boss === null && input.hatched !== true ? 'egg' : 'hatched',
      screenshot: null,
    },
  };
  return settled(raid, rules, now);
}

/**
 * The raid once a member has set its time (`/hatch`, `/end`, "Set time"; not `/duration`, which
 * is no time): a time guessed from a screenshot is then no guess. The same raid when there was
 * none.
 */
export function timeConfirmed(party: RaidParty): RaidParty {
  const { screenshot } = party.raid;
  if (!screenshot?.timeUncertain) return party;
  return { ...party, raid: { ...party.raid, screenshot: { ...screenshot, timeUncertain: false } } };
}

/**
 * Sets when the egg hatches (or hatched); the end follows from it. Seconds are dropped. The
 * caller has checked the time (`resolvePartyTime`).
 */
export function setHatchTime(
  party: RaidParty,
  time: number,
  rules: RaidDurationRules,
  now: number,
): RaidParty {
  const hatchTime = Math.floor(time / MINUTE) * MINUTE;
  const endTime = hatchTime + hatchedMinutes(party, hatchTime, rules) * MINUTE;
  return settled({ ...party, hatchTime, endTime }, rules, now);
}

/** Sets when the raid ends; the hatch time follows from it. Seconds are dropped. */
export function setEndTime(
  party: RaidParty,
  time: number,
  rules: RaidDurationRules,
  now: number,
): RaidParty {
  const endTime = Math.floor(time / MINUTE) * MINUTE;
  const byHand = party.raid.hatchedDuration;
  const hatchTime =
    byHand === null
      ? hatchTimeForEnd(raidKindOf(party), endTime, rules)
      : endTime - byHand * MINUTE;
  return settled({ ...party, hatchTime, endTime }, rules, now);
}

/**
 * Sets how long this raid lasts once hatched, for the raids that differ from the rule. The
 * hatch time stays and the end moves, whether the raid has hatched or not (as the legacy bot
 * did): a member who gives a duration is correcting how long the boss stays.
 */
export function setHatchedDuration(
  party: RaidParty,
  minutes: number,
  maxMinutes: number,
  rules: RaidDurationRules,
  now: number,
): Change<RaidParty> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > maxMinutes)
    return refused('bad-duration');
  const changed: RaidParty = { ...party, raid: { ...party.raid, hatchedDuration: minutes } };
  const endTime = party.hatchTime === null ? party.endTime : party.hatchTime + minutes * MINUTE;
  return { ok: true, party: settled({ ...changed, endTime }, rules, now) };
}

export interface BossChange {
  tier: RaidTier;
  /** Null removes the boss; whether the raid is an egg is decided by its times, or by how it was reported. */
  boss: RaidBossRef | null;
  /** Moves to preset, e.g. when the boss has only one. Earlier moves are forgotten in any case. */
  fastMove?: string | null;
  chargedMove?: string | null;
}

/**
 * Sets the boss, or the tier of an egg. Only when the new tier is another kind of raid (a
 * standard raid turns out to be elite) are the times touched: an egg keeps its hatch time and a
 * hatched raid keeps its end, and the other time is worked out again. Any other boss change
 * leaves both times exactly as they are. An elite raid is in person only, so remote flags are
 * dropped.
 *
 * `changed` is false when boss and tier are what they were; `wasEgg` says whether the raid had
 * no boss before (attendees who asked to be told about the boss are told then).
 */
export function setBoss(
  party: RaidParty,
  change: BossChange,
  rules: RaidDurationRules,
  now: number,
): { party: RaidParty; changed: boolean; wasEgg: boolean } {
  const before = party.raid;
  const wasEgg = before.boss === null;
  const boss = cleanBossRef(change.boss);
  if (sameBoss(before.boss, boss) && sameRaidTier(before.tier, change.tier)) {
    return { party, changed: false, wasEgg };
  }
  let next: RaidParty = {
    ...party,
    raid: {
      ...before,
      tier: change.tier,
      boss,
      fastMove: boss ? (change.fastMove ?? null) : null,
      chargedMove: boss ? (change.chargedMove ?? null) : null,
    },
  };
  if (change.tier.level === 'Elite') {
    next = {
      ...next,
      attendees: Object.fromEntries(
        Object.entries(next.attendees).map(([id, attendee]) => [
          id,
          { ...attendee, remote: false },
        ]),
      ),
    };
  }
  const kindChanged = raidDurationKind(before.tier) !== raidDurationKind(change.tier);
  if (kindChanged && next.hatchTime !== null && next.endTime !== null) {
    next =
      now < next.hatchTime
        ? setHatchTime(next, next.hatchTime, rules, now)
        : setEndTime(next, next.endTime, rules, now);
  }
  return { party: settled(next, rules, now), changed: true, wasEgg };
}

/**
 * Brings the meeting times of the groups in line with raid times that were corrected. A meeting
 * time that was the hatch time ("meet at hatch") follows the new hatch time (`moved`); one that
 * no longer lies between the hatch and the end is removed (`removed`): otherwise the group
 * would be asked whether it is done with an egg, or meet after the raid. A raid without times
 * keeps its meeting times. The very same party comes back when no meeting time is touched.
 */
export function fitMeetingTimes(
  before: RaidParty,
  after: RaidParty,
): { party: RaidParty; moved: GroupId[]; removed: GroupId[] } {
  const moved: GroupId[] = [];
  const removed: GroupId[] = [];
  const { hatchTime, endTime } = after;
  if (hatchTime === null || endTime === null) return { party: after, moved, removed };
  const groups = after.groups.map((group) => {
    if (group.startTime === undefined) return group;
    const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
    if (group.startTime === before.hatchTime && hatchTime !== before.hatchTime) {
      moved.push(group.id);
      return { ...rest, startTime: hatchTime };
    }
    if (group.startTime < hatchTime || group.startTime > endTime) {
      removed.push(group.id);
      return rest;
    }
    return group;
  });
  if (moved.length === 0 && removed.length === 0) return { party: after, moved, removed };
  return { party: { ...after, groups }, moved, removed };
}

/** Sets one or both moves of the boss. The caller has checked that the boss can have them. */
export function setMoveset(
  party: RaidParty,
  moves: { fastMove?: string; chargedMove?: string },
): Change<RaidParty> {
  if (party.raid.boss === null) return refused('no-boss');
  return {
    ok: true,
    party: {
      ...party,
      raid: {
        ...party.raid,
        fastMove: moves.fastMove ?? party.raid.fastMove,
        chargedMove: moves.chargedMove ?? party.raid.chargedMove,
      },
    },
  };
}

/** Moves the raid to another gym. `regionChanged` means its post must move to another forum. */
export function setGym(
  party: RaidParty,
  gymId: number,
  regionId: number,
): { party: RaidParty; regionChanged: boolean } {
  return { party: { ...party, gymId, regionId }, regionChanged: regionId !== party.regionId };
}
