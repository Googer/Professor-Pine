import {
  attendeeOf,
  groupStamp,
  bossOf,
  isBattle,
  isMax,
  isRaid,
  isTimed,
  isTrain,
  type Attendee,
  type Party,
  type PartyGroup,
  type RaidBossRef,
  type Team,
  type TrainKind,
} from '../party/party.js';
import { PartyStatus } from '../party/status.js';
import type { MaxTier } from '../pogo/max-tier.js';
import type { PokemonEntry } from '../pogo/game-master.js';
import { gymIdOf } from '../party/stops.js';
import { currentStop, whereOf } from '../party/train.js';

/*
 * The party history (plan 8H): what a party was and what became of it, as plain rows that SQL
 * can count, written once when the party ends (docs/architecture/history.md). This module is
 * the pure part: the steps an active party leaves (`partySteps`), and the record a party that
 * ended becomes (`historyOfParty`). Members are named in it only with their opt-in.
 */

export type HistoryKind = 'raid' | 'train' | 'meetup' | 'max';

/** How far a member got, as the history says it (an attendee's status, worded for SQL). */
export const HISTORY_STATUSES = ['interested', 'joined', 'here', 'done'] as const;
export type HistoryStatus = (typeof HISTORY_STATUSES)[number];

/**
 * How a party ended: `completed` (by the clock, after somebody completed the raid, or was at
 * the train or meetup), `expired` (by the clock, without that), `cancelled` (somebody closed it:
 * `/delete`, its region removed, its post deleted), `cutover` (a party of the legacy bot that
 * was still going on when the bot was replaced), `unknown` (the legacy files do not say).
 */
export const PARTY_ENDINGS = ['completed', 'expired', 'cancelled', 'cutover', 'unknown'] as const;
export type PartyEnding = (typeof PARTY_ENDINGS)[number];

/**
 * A raid's tier as the history keeps it: the bot's levels, and the legacy bot's that the game
 * has dropped (`T2`, `T4`, `EX`).
 */
export type HistoryTier =
  | 'T1'
  | 'T2'
  | 'T3'
  | 'T4'
  | 'T5'
  | 'Mega'
  | 'MegaLegendary'
  | 'SuperMega'
  | 'Elite'
  | 'EX'
  // A max battle's (plan 8X-3; design section 10: one spelling of the tiers).
  | MaxTier;

/**
 * Why a live party ended, as whoever ended it tells the store (`PartyStore.update`'s `ended`):
 * the clock, a person (`cancelled`), a move to another region that goes on as the party `to`,
 * or a failure before it had a post. A party that moved or failed is no party of its own in the
 * history: the one it moved to is, and one that failed never was.
 */
export type PartyEnd =
  { how: 'clock' } | { how: 'cancelled' } | { how: 'moved'; to: string } | { how: 'failed' };

/** A boss the catalogue knows, by its ids; or the name it was given, when it does not. */
export type HistoryBoss =
  { key: string; dex: number; species: string; form: string | null } | { name: string };

/**
 * A member named by a mention, or by a bare id (17 to 20 digits); and, to be kept as they are,
 * the tags of emoji, roles and channels, whose numbers are no member.
 */
const MENTION = /<@!?\d+>|<a?:\w+:\d+>|<@&\d+>|<#\d+>|(?<![\d])\d{17,20}(?![\d])/gu;

/** The tags `MENTION` finds that name no member. */
const KEPT_TAG = /^<(?:a?:|@&|#)/u;

/**
 * Text a member wrote (a name, a description, a group's label) with every member it names
 * written `@member`: the history keeps no id of a member by the words of another (the tag of an
 * emoji, a role or a channel stays). For the live history and the legacy import alike.
 */
export function withoutMembers(text: string): string {
  return text.replace(MENTION, (found) => (KEPT_TAG.test(found) ? found : '@member'));
}

/** As `withoutMembers`, for a text that may be absent. */
function scrubbed(text: string | null | undefined): string | null {
  return text === null || text === undefined ? null : withoutMembers(text);
}

/** A catalogue entry as the history keeps a boss: a mega's form is its species and evolution. */
export function historyBoss(entry: PokemonEntry): HistoryBoss {
  const form =
    entry.form ?? (entry.tempEvolution ? `${entry.pokemonId}_${entry.tempEvolution}` : null);
  return { key: entry.key, dex: entry.dex, species: entry.pokemonId, form };
}

export interface HistoryAttendee {
  /** Only with the member's opt-in; null otherwise (the row still counts). */
  memberId: string | null;
  /** At the end; null for a member who left before it. */
  status: HistoryStatus | null;
  furthest: HistoryStatus;
  groupId: string | null;
  /** The +1s: who they brought besides themself. */
  extras: number;
  remote: boolean;
  team: Team | null;
  signedUpAt: number | null;
  joinedAt: number | null;
  hereAt: number | null;
  doneAt: number | null;
  leftAt: number | null;
  /**
   * Left with a group that was split off into a train of its own (plan 8T): one who left at
   * `leftAt` without leaving the train behind, so no departure (`HistoryCounts.departed`); the
   * column `PartyHistoryAttendee.splitOff` (migration 020).
   */
  splitOff?: true;
}

export interface HistoryGroup {
  groupId: string;
  label: string | null;
  meetingTime: number | null;
  /** Its members at the end, and with their +1s. */
  members: number;
  heads: number;
}

/** A stop a train made, in the order it made them (a loop makes a gym's stop more than once). */
export interface HistoryStop {
  gymId: number | null;
  /** The legacy file's gym where it is not (or no longer) in the gym list. */
  legacyGymId: number | null;
  /**
   * The Wayfarer id of a power spot the train stopped at (plan 8X-4, migration 026), null for a
   * gym.
   */
  wayspotId: string | null;
  arrivedAt: number | null;
  leftAt: number | null;
}

/** A party as the history keeps it. Times are epoch milliseconds. */
export interface HistoryRecord {
  source: 'live' | 'legacy';
  partyId: string | null;
  legacyKey: string | null;
  kind: HistoryKind;
  /** The server's snowflake: the history outlives its `Guild` row. */
  serverId: string;
  regionId: number | null;
  gymId: number | null;
  legacyGymId: number | null;
  /**
   * The Wayspot (Wayfarer id) of a max battle's power spot (plan 8X-3, migration 025); null for a
   * pin and for every other party.
   */
  wayspotId: string | null;
  name: string | null;
  description: string | null;
  tier: HistoryTier | null;
  shadow: boolean;
  mega: boolean;
  elite: boolean;
  ex: boolean;
  /** Whether the boss could be shiny; null where that is not known. */
  shiny: boolean | null;
  boss: HistoryBoss | null;
  fastMove: string | null;
  chargedMove: string | null;
  createdAt: number;
  hatchTime: number | null;
  startTime: number | null;
  endTime: number | null;
  endedAt: number | null;
  ending: PartyEnding;
  createdById: string | null;
  conductorId: string | null;
  anonymous: boolean;
  /** The stops of a train's route at the end; null for other parties. */
  routeStops: number | null;
  /**
   * What a train went to (plan 8X-4, migration 026): raids, Dynamax or Gigantamax battles; null
   * for other parties.
   */
  trainKind: TrainKind | null;
  /**
   * The train this one was split off from (plan 8T): its `partyId`, a link only (its record is
   * its own). Null for every other party.
   */
  splitFromId: string | null;
  /**
   * How many members the notifier's news of it was sent to (plan 8H-3, migration 037: put in
   * line, not delivered), the sum of its `reach` steps and those of the parties it went on from.
   * 0 where not recorded: a legacy party, one recorded before 8H-3.
   */
  reached: number;
  attendees: readonly HistoryAttendee[];
  groups: readonly HistoryGroup[];
  stops: readonly HistoryStop[];
}

/** The counts kept with a party, so that the common questions need no join. */
export interface HistoryCounts {
  attendees: number;
  /** Members by the furthest status they reached, and the same with their +1s. */
  interested: number;
  joined: number;
  here: number;
  done: number;
  interestedHeads: number;
  joinedHeads: number;
  hereHeads: number;
  doneHeads: number;
  extras: number;
  remote: number;
  /** Members who left before the end; not those who went with a group split off it. */
  departed: number;
}

export function historyCounts(attendees: readonly HistoryAttendee[]): HistoryCounts {
  const counts: HistoryCounts = {
    attendees: attendees.length,
    interested: 0,
    joined: 0,
    here: 0,
    done: 0,
    interestedHeads: 0,
    joinedHeads: 0,
    hereHeads: 0,
    doneHeads: 0,
    extras: 0,
    remote: 0,
    departed: 0,
  };
  for (const attendee of attendees) {
    counts[attendee.furthest] += 1;
    counts[`${attendee.furthest}Heads`] += 1 + attendee.extras;
    counts.extras += attendee.extras;
    if (attendee.remote) counts.remote += 1;
    if (attendee.status === null && attendee.splitOff !== true) counts.departed += 1;
  }
  return counts;
}

/**
 * What happened to an active party that its model does not keep: a member's status (`value`,
 * a `PartyStatus`), a member who left, a member who went with a group split off a train into a
 * train of its own (`split`, plan 8T), where a train is (`stop`: `subject` its place, `value`
 * the gym, null at the end of the route or without one; `spot`, plan 8X-4: at a power spot,
 * `subject` its bare Wayfarer id, `value` null), a group's meeting time (`subject` the group),
 * the party it goes on from (`from`: `subject` the id of a raid that moved and became this
 * party; the record of this party takes that party's steps and its row with it), and how many
 * members a run of the notifier's news reached (`reach`, plan 8H-3: `subject` the event,
 * `reported`, `boss`, `gym`; `value` the count; written by `HistoryStorage.addReach`, never by
 * `partySteps`).
 */
export interface HistoryStep {
  partyId: string;
  at: number;
  kind: 'status' | 'left' | 'split' | 'stop' | 'spot' | 'meet' | 'from' | 'reach';
  subject: string;
  value: number | null;
}

/** The kinds of step that are about one member, by their snowflake (`subject`). */
const MEMBER_STEPS: ReadonlySet<HistoryStep['kind']> = new Set(['status', 'left', 'split']);

/**
 * Whether this write split a group off a train: the train remembers a split it did not before.
 * Whoever left in such a write left with the group (`splitOffGroup` changes nothing else).
 */
function splitIn(before: Party | undefined, after: Party): boolean {
  if (before === undefined || !isTrain(before) || !isTrain(after)) return false;
  const known = new Set(before.train.splitOff.map((split) => split.partyId));
  return after.train.splitOff.some((split) => !known.has(split.partyId));
}

/**
 * Whether a party is the new train of a split that is not settled yet (`splitFrom.pending`):
 * stored with its post, the old train perhaps not yet without the group.
 */
export function splitPending(party: Party): boolean {
  return isTrain(party) && party.train.splitFrom?.pending === true;
}

/**
 * The subject of a group's meeting time among the steps: its letter and when it was opened
 * (`B:<stamp>`, plan 8X-1B), since a group nobody is in goes and a later one may take its
 * letter: a meeting time is kept with the group that had it. A step of before the stamps names
 * the letter alone, and counts for the group of that letter.
 */
function meetSubject(party: Party, group: PartyGroup): string {
  return `${group.id}:${groupStamp(party, group)}`;
}

/**
 * The steps from one stored form of a party to the next (`before` undefined: a new party).
 *
 * The new train of a split has no history while it is pending (plan 8T): who is on it then may
 * still leave the group of the old train and never be on it. The write that settles it is its
 * start, as if it were new then: who is on it signs up then, and it reaches its stop then. So
 * its history starts at the split and holds nobody who never was on it.
 */
export function partySteps(before: Party | undefined, after: Party, at: number): HistoryStep[] {
  if (splitPending(after)) return [];
  if (before !== undefined && splitPending(before)) return partySteps(undefined, after, at);
  const steps: HistoryStep[] = [];
  const step = (kind: HistoryStep['kind'], subject: string, value: number | null) => {
    steps.push({ partyId: after.id, at, kind, subject, value });
  };
  for (const [memberId, attendee] of Object.entries(after.attendees)) {
    const was = before === undefined ? undefined : attendeeOf(before, memberId);
    if (was?.status !== attendee.status) step('status', memberId, attendee.status);
  }
  const gone = splitIn(before, after) ? 'split' : 'left';
  for (const memberId of Object.keys(before?.attendees ?? {})) {
    if (attendeeOf(after, memberId) === undefined) step(gone, memberId, null);
  }
  for (const group of after.groups) {
    if (group.startTime === undefined) continue;
    const subject = meetSubject(after, group);
    const was = before?.groups.find((other) => meetSubject(before, other) === subject)?.startTime;
    if (was !== group.startTime) step('meet', subject, group.startTime);
  }
  if (isTrain(after)) {
    const place = whereOf(after);
    const was = before !== undefined && isTrain(before) ? whereOf(before) : 'none';
    const at = currentStop(after);
    if (place !== was) {
      if (at?.kind === 'powerspot') step('spot', at.id, null);
      else step('stop', place, gymIdOf(at) ?? null);
    }
  }
  return steps;
}

/** Everybody the record of a party can name, for the look-up of their opt-ins. */
export function historyMembers(party: Party, steps: readonly HistoryStep[]): string[] {
  const members = new Set<string>();
  for (const step of steps) {
    if (MEMBER_STEPS.has(step.kind)) members.add(step.subject);
  }
  for (const memberId of Object.keys(party.attendees)) members.add(memberId);
  members.add(party.createdById);
  if (isTrain(party) && party.train.conductorId !== null) members.add(party.train.conductorId);
  return [...members];
}

/** How far each status gets, in the order of `HISTORY_STATUSES`. A pending answer is here. */
function reach(status: number): number {
  switch (status) {
    case PartyStatus.Interested:
      return 0;
    case PartyStatus.Coming:
      return 1;
    case PartyStatus.Present:
    case PartyStatus.CompletePending:
      return 2;
    case PartyStatus.Complete:
      return 3;
    default:
      return 0;
  }
}

function word(level: number): HistoryStatus {
  return HISTORY_STATUSES[level] ?? 'interested';
}

function attendeeRecord(
  memberId: string,
  steps: readonly HistoryStep[],
  final: Attendee | undefined,
  optedIn: ReadonlySet<string>,
): HistoryAttendee {
  const own = steps.filter((step) => step.subject === memberId && MEMBER_STEPS.has(step.kind));
  // How they last left the party, when they are not on it at the end.
  const departure = final
    ? undefined
    : own.findLast((step) => step.kind === 'left' || step.kind === 'split');
  const firstAt = (level: number): number | null =>
    own.find((step) => step.kind === 'status' && reach(step.value ?? 0) >= level)?.at ?? null;
  const levels = own.filter((step) => step.kind === 'status').map((step) => reach(step.value ?? 0));
  if (final) levels.push(reach(final.status));
  const furthest = Math.max(0, ...levels);
  return {
    memberId: optedIn.has(memberId) ? memberId : null,
    status: final ? word(reach(final.status)) : null,
    furthest: word(furthest),
    groupId: final?.group ?? null,
    extras: final ? Math.max(0, final.number - 1) : 0,
    remote: final?.remote ?? false,
    team: final?.team ?? null,
    signedUpAt: own.find((step) => step.kind === 'status')?.at ?? null,
    joinedAt: firstAt(1),
    hereAt: firstAt(2),
    doneAt: firstAt(3),
    leftAt: departure?.at ?? null,
    ...(departure?.kind === 'split' ? { splitOff: true as const } : {}),
  };
}

/**
 * The stops a train made as far as its route and current stop say, without times: the whole
 * route once finished; up to the current stop once it started (moved on, or its start time had
 * come by `at`); none before. For a train of which no step was seen, live or legacy alike.
 */
export function stopsByRoute<Stop>(
  route: readonly Stop[],
  stop: number,
  startTime: number | null,
  at: number,
): Stop[] {
  if (route.length > 0 && stop >= route.length) return [...route];
  const started = stop > 0 || (startTime !== null && startTime <= at);
  return started ? route.slice(0, stop + 1) : [];
}

/** The stops a train made, from the steps of its place; from its route where there are none. */
function trainStops(party: Party, steps: readonly HistoryStep[]): HistoryStop[] {
  if (!isTrain(party)) return [];
  const places = steps.filter((step) => step.kind === 'stop' || step.kind === 'spot');
  if (places.length === 0) {
    const { route, stop } = party.train;
    return stopsByRoute(route, stop, party.timed.startTime, party.updatedAt).map((ref) => ({
      gymId: ref.kind === 'gym' ? ref.id : null,
      legacyGymId: null,
      wayspotId: ref.kind === 'powerspot' ? ref.id : null,
      arrivedAt: null,
      leftAt: null,
    }));
  }
  const stops: HistoryStop[] = [];
  for (const place of places) {
    // Where the step says the train is: a gym, a power spot (plan 8X-4), or none (the end).
    const gymId = place.kind === 'stop' ? place.value : null;
    const wayspotId = place.kind === 'spot' ? place.subject : null;
    const last = stops.at(-1);
    if (last && last.leftAt === null) {
      if (gymId === last.gymId && wayspotId === last.wayspotId) continue;
      last.leftAt = place.at;
    }
    if (gymId !== null || wayspotId !== null) {
      stops.push({ gymId, legacyGymId: null, wayspotId, arrivedAt: place.at, leftAt: null });
    }
  }
  // A first stop laid before the start was reached at the start.
  const first = stops[0];
  const start = party.timed.startTime;
  if (
    first?.arrivedAt != null &&
    start !== null &&
    start > first.arrivedAt &&
    (first.leftAt === null || start <= first.leftAt)
  ) {
    first.arrivedAt = start;
  }
  return stops;
}

/**
 * How a party ended: completed whenever it took place (somebody completed the raid, or was at
 * the train or meetup), however it was closed; otherwise as whoever closed it says.
 */
function endingOf(
  party: Party,
  end: PartyEnd | undefined,
  attendees: readonly HistoryAttendee[],
): PartyEnding {
  // A battle (a raid, a max battle) took place when somebody completed it.
  const took = isBattle(party)
    ? attendees.some((attendee) => attendee.furthest === 'done')
    : attendees.some((attendee) => attendee.furthest === 'here' || attendee.furthest === 'done');
  if (took) return 'completed';
  if (end === undefined) return 'unknown';
  return end.how === 'clock' ? 'expired' : 'cancelled';
}

export interface HistoryInput {
  /** How it ended; undefined when whoever ended it did not say. */
  end: { how: 'clock' } | { how: 'cancelled' } | undefined;
  /** Its steps, oldest first. */
  steps: readonly HistoryStep[];
  /** The members who opted in to be named in the history of its server. */
  optedIn: ReadonlySet<string>;
  describeBoss: (ref: RaidBossRef) => HistoryBoss;
  /** Whether its boss could be shiny, when that is known. */
  shiny: boolean | null;
}

/** The record of a live party before the storage adds its server (`serverId`), which it reads. */
export type LiveRecord = Omit<HistoryRecord, 'serverId'>;

/**
 * The record of a live party that ended (`party` as it was stored at its end, `updatedAt` the
 * moment it ended). Attendees in the order they first signed up, then those the steps never saw.
 */
export function historyOfParty(party: Party, input: HistoryInput): LiveRecord {
  const { steps, optedIn } = input;
  const order: string[] = [];
  for (const step of steps) {
    if (step.kind === 'status' && !order.includes(step.subject)) order.push(step.subject);
  }
  for (const memberId of Object.keys(party.attendees)) {
    if (!order.includes(memberId)) order.push(memberId);
  }
  const attendees = order.map((memberId) =>
    attendeeRecord(memberId, steps, attendeeOf(party, memberId), optedIn),
  );
  const groups = party.groups.map((group): HistoryGroup => {
    const members = attendees.filter((a) => a.status !== null && a.groupId === group.id);
    const subject = meetSubject(party, group);
    const meetings = steps.filter(
      (step) => step.kind === 'meet' && (step.subject === subject || step.subject === group.id),
    );
    return {
      groupId: group.id,
      label: scrubbed(group.label),
      meetingTime: group.startTime ?? meetings.at(-1)?.value ?? null,
      members: members.length,
      heads: members.reduce((sum, a) => sum + 1 + a.extras, 0),
    };
  });
  const named = (id: string | null): string | null => (id !== null && optedIn.has(id) ? id : null);
  const raid = isRaid(party) ? party.raid : undefined;
  const level = raid?.tier.level;
  const max = isMax(party) ? party.max : undefined;
  const boss = bossOf(party);
  return {
    source: 'live',
    partyId: party.id,
    legacyKey: null,
    kind: party.type,
    regionId: party.regionId,
    gymId: party.gymId,
    legacyGymId: null,
    wayspotId: max && max.spot.kind !== 'pin' ? max.spot.id : null,
    name: isTimed(party) ? withoutMembers(party.timed.name) : null,
    description: party.type === 'meetup' ? scrubbed(party.meetup.description) : null,
    tier: level ?? max?.tier ?? null,
    shadow: raid?.tier.shadow ?? false,
    mega: level === 'Mega' || level === 'MegaLegendary' || level === 'SuperMega',
    elite: level === 'Elite',
    ex: false,
    shiny: input.shiny,
    boss: boss === null ? null : input.describeBoss(boss),
    fastMove: raid?.fastMove ?? null,
    chargedMove: raid?.chargedMove ?? null,
    createdAt: startOf(party, steps),
    hatchTime: party.hatchTime,
    startTime: isTimed(party) ? party.timed.startTime : null,
    endTime: party.endTime,
    endedAt: party.updatedAt,
    ending: endingOf(party, input.end, attendees),
    createdById: named(party.createdById),
    conductorId: isTrain(party) ? named(party.train.conductorId) : null,
    anonymous: party.anonymous,
    routeStops: isTrain(party) ? party.train.route.length : null,
    trainKind: isTrain(party) ? party.train.kind : null,
    splitFromId: isTrain(party) ? (party.train.splitFrom?.partyId ?? null) : null,
    reached: reachedOf(steps),
    attendees,
    groups,
    stops: trainStops(party, steps),
  };
}

/**
 * How many members a party's news reached (plan 8H-3): the sum of the `reach` steps, its own and
 * those of the parties it went on from (each run counted the members not counted before, while
 * the notifier remembered the party).
 */
function reachedOf(steps: readonly HistoryStep[]): number {
  return steps.reduce((sum, step) => sum + (step.kind === 'reach' ? (step.value ?? 0) : 0), 0);
}

/**
 * When the history of a party starts: when it was made; for the new train of a split, at the
 * split (its first step, of the write that settled it, `partySteps`), which comes a moment
 * after it was made with its post. When it has no step (nobody went with it, and it has no
 * route), when it was made.
 */
function startOf(party: Party, steps: readonly HistoryStep[]): number {
  if (!isTrain(party) || party.train.splitFrom === null) return party.createdAt;
  // A count of what its news reached is no step of its life.
  const own = steps
    .filter((step) => step.partyId === party.id && step.kind !== 'reach')
    .map((step) => step.at);
  return own.length === 0 ? party.createdAt : Math.min(...own);
}

/**
 * What a write of a party adds to the history (`PartyStore` asks `noteOf` for each write and
 * the storage writes it with the party): its steps, and when the write ended the party, what
 * becomes of it:
 * - `record`: its record (`build`, given its steps and those of the parties it went on from, and
 *   the members of `members` who opted in), written once; then its row and theirs are deleted
 *   (their posts kept in `EndedPartyPost`), so that no member id stays behind.
 * - `move`: it goes on as the party `to`, whose record will take its steps and its row; a `from`
 *   step under `to` says so (written again here, in case the new party's own did not make it).
 * - `drop`: it never was a party (no post): its steps and its row go, nothing is recorded.
 */
export interface HistoryNote {
  partyId: string;
  /** Row id of the server (`Party.guildId`); the storage reads its snowflake. */
  guildId: number;
  steps: readonly HistoryStep[];
  end?: HistoryNoteEnd;
}

export type HistoryNoteEnd =
  | {
      kind: 'record';
      members: (steps: readonly HistoryStep[]) => string[];
      build: (steps: readonly HistoryStep[], optedIn: ReadonlySet<string>) => LiveRecord;
    }
  | { kind: 'move'; to: string }
  | { kind: 'drop' };

/**
 * A write of a party, as the store makes it: as it was (undefined: new), as it is, why it ended,
 * and for a new party the raid it goes on from (`movedFrom`: a move to another region).
 */
export interface PartyWrite {
  before: Party | undefined;
  after: Party;
  ended?: PartyEnd;
  movedFrom?: string;
}
