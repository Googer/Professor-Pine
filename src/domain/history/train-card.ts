import { longestRaidStand, type RaidStandSettings } from '../time/raid-durations.js';
import { countsAsActivity } from './activity.js';
import { historyCounts, type HistoryAttendee, type HistoryStop } from './party-history.js';

/*
 * The card of an ended train (plan 8H-7A; design `2026-11-04-history-on-show-design.md`, Part F):
 * about how many stops in how long, the regions crossed in order, the riders and the most at
 * once, and the raids recorded along the way, by tier. One pure function over the record's plain
 * rows, as the ending transaction wrote them or as they are read back (the web's list of 8H-7B
 * takes the same), so the post and the web say the same. It names nobody.
 *
 * Approximate on purpose: a stop can be made in the game without the train being moved in Pine,
 * and a train moved by mistake stays a moment at a stop it never made.
 */

const MINUTE = 60_000;

/** The longest any one stop counts for (Matt, 2026-11-05): a train that sat still went on later. */
export const TRAIN_STOP_MAX_DWELL_MS = 30 * MINUTE;

/** A stop of less than this is a move made by mistake, and is not counted (review F-B10). */
export const TRAIN_STOP_MIN_DWELL_MS = MINUTE;

/** What the card reads of the record itself (`PartyHistory`'s columns). Epoch ms. */
export interface CardRecord {
  /** When it ended; null only for a legacy record (whose stops have no times anyway). */
  endedAt: number | null;
  /** The train's own end time, when one was set. */
  endTime: number | null;
  /** `PartyHistory.peakRiders`: null or absent where not known. */
  peakRiders?: number | null;
}

/** What the card reads of an attendee (`PartyHistoryAttendee`). */
export type CardAttendee = Pick<
  HistoryAttendee,
  'furthest' | 'status' | 'extras' | 'remote' | 'splitOff' | 'leftAt' | 'doneAt'
>;

/** What the card reads of a stop (`PartyHistoryStop`). */
export type CardStop = Pick<
  HistoryStop,
  'gymId' | 'wayspotId' | 'arrivedAt' | 'leftAt' | 'regionIds'
>;

/** A stop the card counts, with when the train was there (`stopWindows`). */
export interface StopWindow {
  gymId: number | null;
  wayspotId: string | null;
  from: number;
  to: number;
  regionIds: readonly number[] | null;
}

/**
 * A raid or max battle of the history, as the card's read gives it (`PartyHistory`'s columns):
 * its id, to count it once, what `countsAsActivity` asks, its tier and where and when it was.
 */
export interface RaidAlongRow {
  id: number;
  source: string;
  kind: string;
  ending: string;
  tier: string | null;
  shadow: boolean;
  gymId: number | null;
  wayspotId: string | null;
  createdAt: number;
  hatchTime: number | null;
  endTime: number | null;
  endedAt: number | null;
}

/** How many raids of a tier the train passed (`raidsAlong`). */
export interface RaidTally {
  tier: string | null;
  shadow: boolean;
  count: number;
}

/** What the card says; null for a line it leaves out. */
export interface TrainCard {
  /** How many stops it counts, and the time it spent at them, each at most `TRAIN_STOP_MAX_DWELL_MS`. */
  stops: { count: number; durationMs: number } | null;
  /** The regions crossed, each once at its first visit; null where none can be said. */
  regionIds: readonly number[] | null;
  /** Who came (Here or Done at some point), and with their +1s at the end. */
  riders: { members: number; heads: number };
  peakRiders: number | null;
  /** The raids recorded along the way, by tier; null where not started or not read. */
  raids: readonly RaidTally[] | null;
}

/**
 * When the last riders were gone: the last departure (Leave, or Done, which on a train means
 * leaving) once every member who came had gone; undefined while one of them was still on it at
 * the end, or nobody came.
 */
function lastRiderGone(attendees: readonly CardAttendee[]): number | undefined {
  const riders = attendees.filter((a) => a.furthest === 'here' || a.furthest === 'done');
  if (riders.length === 0) return undefined;
  let last = -Infinity;
  for (const rider of riders) {
    const gone =
      rider.status === null ? rider.leftAt : rider.status === 'done' ? rider.doneAt : undefined;
    if (gone === undefined || gone === null) return undefined;
    last = Math.max(last, gone);
  }
  return last;
}

/**
 * The stops the card counts, with when the train was there (reviews F-B3, F-B4, F-B10): only
 * arrivals at or before the end (`endedAt`; a route laid early is reached at the start, which may
 * come after a `/delete`); a stop's time ends at its leaving, else at the next arrival, and an
 * open last stop at the first of the train's end time and the last rider gone that came after
 * its arrival (review A2), else at the end; every time at the end at the latest, and any one stop at most `TRAIN_STOP_MAX_DWELL_MS`. A stop of
 * less than `TRAIN_STOP_MIN_DWELL_MS` is left out; a loop's second lap counts.
 */
export function stopWindows(
  record: CardRecord,
  stops: readonly CardStop[],
  attendees: readonly CardAttendee[],
): StopWindow[] {
  const end = record.endedAt ?? Infinity;
  const made = stops.filter(
    (stop): stop is CardStop & { arrivedAt: number } =>
      stop.arrivedAt !== null && stop.arrivedAt <= end,
  );
  const gone = lastRiderGone(attendees);
  // Of the train's end time and the last rider gone, the first that came after the arrival:
  // one before it (a train run past its end time, a last move after everybody left) says
  // nothing of how long it stayed there.
  const openEnd = (from: number): number => {
    const after = [record.endTime, gone].filter(
      (time): time is number => time !== null && time !== undefined && time > from,
    );
    return Math.min(end, ...after);
  };
  const windows: StopWindow[] = [];
  for (const [index, stop] of made.entries()) {
    const from = stop.arrivedAt;
    const until = stop.leftAt ?? made[index + 1]?.arrivedAt ?? openEnd(from);
    const to = Math.max(from, Math.min(until, end, from + TRAIN_STOP_MAX_DWELL_MS));
    if (to - from < TRAIN_STOP_MIN_DWELL_MS) continue;
    windows.push({
      gymId: stop.gymId,
      wayspotId: stop.wayspotId,
      from,
      to,
      regionIds: stop.regionIds ?? null,
    });
  }
  return windows;
}

/** What to read for `raidsAlong`: the stops' gyms and Power Spots, and the time they span. */
export interface RaidsAlongQuery {
  gymIds: number[];
  wayspotIds: string[];
  from: number;
  to: number;
}

/** The read `raidsAlong` needs; undefined for a train that counts no stop. */
export function raidsAlongQuery(windows: readonly StopWindow[]): RaidsAlongQuery | undefined {
  if (windows.length === 0) return undefined;
  const gymIds = [...new Set(windows.flatMap((w) => (w.gymId === null ? [] : [w.gymId])))];
  const wayspotIds = [
    ...new Set(windows.flatMap((w) => (w.wayspotId === null ? [] : [w.wayspotId]))),
  ];
  return {
    gymIds,
    wayspotIds,
    from: Math.min(...windows.map((w) => w.from)),
    to: Math.max(...windows.map((w) => w.to)),
  };
}

/**
 * Tiers from the biggest down, raids before max battles: how the tally is ordered among tiers of
 * as many raids. A tier not named (a legacy one of another spelling, none) comes last.
 */
const TIER_ORDER: readonly string[] = [
  'Elite',
  'SuperMega',
  'MegaLegendary',
  'EX',
  'T5',
  'Mega',
  'T4',
  'T3',
  'T2',
  'T1',
  'G',
  'D5',
  'D4',
  'D3',
  'D2',
  'D1',
];

const rank = (tier: string | null): number => {
  const at = tier === null ? -1 : TIER_ORDER.indexOf(tier);
  return at < 0 ? TIER_ORDER.length : at;
};

/**
 * When a raid or max battle stood, as `raidsAlong` counts it: from its hatch (its report where
 * it has none) to its end time; where it has none (a raid reported without times; a max battle
 * always has one), as long as a raid of its tier can stand (`longestRaidStand`, from the
 * settings: an elite raid's own times, a standard one's the longest of its own and the events'):
 * from its report, an egg's incubation and its hatched time (whether it was reported as an egg is
 * not kept, so the longer of the two), from its hatch, the hatched time (W5: never when it ended,
 * which a sweep after a restart may put hours late). The read bounds by no more than that
 * (review A4).
 */
export function raidTime(
  raid: Pick<RaidAlongRow, 'createdAt' | 'hatchTime' | 'endTime' | 'tier'>,
  durations: RaidStandSettings,
): { start: number; end: number } {
  const start = raid.hatchTime ?? raid.createdAt;
  if (raid.endTime !== null) return { start, end: raid.endTime };
  const longest = longestRaidStand(raid.tier === 'Elite' ? 'elite' : 'standard', durations);
  const minutes = (raid.hatchTime === null ? longest.incubation : 0) + longest.hatched;
  return { start, end: start + minutes * MINUTE };
}

/**
 * Whether the card may count a raid record at all: a live one the heatmap counts
 * (`countsAsActivity`), recorded by the train's end (`endedAt`; null, a legacy train: no bound).
 */
function onTheCard(raid: RaidAlongRow, endedAt: number | null): boolean {
  const recordedLate = endedAt !== null && (raid.endedAt === null || raid.endedAt > endedAt);
  return hasOwnCount(raid) && !recordedLate;
}

/** A live raid or max battle record the heatmap counts (`countsAsActivity`). */
export function hasOwnCount(raid: Pick<RaidAlongRow, 'source' | 'kind' | 'ending'>): boolean {
  return raid.source === 'live' && countsAsActivity(raid);
}

/** What the pairing rule reads of a raid or max battle record (W1): a `RaidAlongRow`'s part. */
export type PairedRaid = Pick<
  RaidAlongRow,
  | 'id'
  | 'source'
  | 'kind'
  | 'ending'
  | 'tier'
  | 'gymId'
  | 'wayspotId'
  | 'createdAt'
  | 'hatchTime'
  | 'endTime'
  | 'endedAt'
>;

/** A train as the pairing rule reads it (`pairedTrain`): its record's id, the stops it counts. */
export interface PairedTrain {
  id: number;
  windows: readonly StopWindow[];
}

/** Whether a raid stood at a stop's gym or Power Spot while the train was there. */
function passedAt(w: StopWindow, raid: PairedRaid, durations: RaidStandSettings): boolean {
  const { start, end } = raidTime(raid, durations);
  return (
    ((raid.gymId !== null && w.gymId === raid.gymId) ||
      (raid.wayspotId !== null && w.wayspotId === raid.wayspotId)) &&
    start <= w.to &&
    end >= w.from
  );
}

/**
 * The pairing rule (plan 8H-9, W1): a stop a train counts (`stopWindows`, of the train whose
 * record is `train`) and a live raid or max battle record that counts (`hasOwnCount`) where the
 * train passed it (`raidsAlong`'s matcher, `passedAt`, without the card's bound of being recorded
 * by the train's end) are one raid of the game, which counts once: of the two records, the one
 * with the higher id (`PartyHistory.id`, the order the adding goes in) counts nothing for it.
 * `stop` where the raid's record came first, `raid` where the train's did; undefined where they
 * are no pair. Deterministic, so a rebuild, which goes in the same order, counts the same.
 */
export function laterOfPair(
  train: number,
  w: StopWindow,
  raid: PairedRaid,
  durations: RaidStandSettings,
): 'stop' | 'raid' | undefined {
  if (!hasOwnCount(raid) || !passedAt(w, raid, durations)) return undefined;
  return raid.id < train ? 'stop' : 'raid';
}

/**
 * For each stop a train counts (`windows`, of the train whose record is `train`), whether it is a
 * raid recorded before the train (`laterOfPair`): that record counts it, and the stop nothing.
 */
export function joinedStops(
  train: number,
  windows: readonly StopWindow[],
  raids: readonly PairedRaid[],
  durations: RaidStandSettings,
): boolean[] {
  return windows.map((w) =>
    raids.some((raid) => laterOfPair(train, w, raid, durations) === 'stop'),
  );
}

/**
 * Whether a raid or max battle record is a stop of a train recorded before it (`laterOfPair`,
 * `trains` as `pairedTrain` gives them): that train counts it, and the record nothing.
 */
export function joinedRaid(
  raid: PairedRaid,
  trains: readonly PairedTrain[],
  durations: RaidStandSettings,
): boolean {
  return trains.some((train) =>
    train.windows.some((w) => laterOfPair(train.id, w, raid, durations) === 'raid'),
  );
}

/**
 * The raids along the way (review F-B6): the raid and max battle records the heatmap counts
 * (`countsAsActivity`), live ones only, at a counted stop's gym (`gymId`) or Power Spot
 * (`wayspotId`), whose time (`raidTime`) overlaps the train's time at that stop; each raid once,
 * however often the train passed. By tier and shadow, the most first. Records only (Matt): a raid
 * still running when the train ended has none yet, and one recorded after the train's end
 * (`endedAt`, review G6) is left out, so that the card read back later for the web is the one its
 * post showed. `endedAt` null (a legacy record): no such bound.
 */
export function raidsAlong(
  windows: readonly StopWindow[],
  endedAt: number | null,
  raids: readonly RaidAlongRow[],
  durations: RaidStandSettings,
): RaidTally[] {
  const counted = new Set<number>();
  const tallies = new Map<string, RaidTally>();
  for (const raid of raids) {
    if (counted.has(raid.id) || !onTheCard(raid, endedAt)) continue;
    if (!windows.some((w) => passedAt(w, raid, durations))) continue;
    counted.add(raid.id);
    const key = `${raid.tier ?? ''}:${String(raid.shadow)}`;
    const tally = tallies.get(key) ?? { tier: raid.tier, shadow: raid.shadow, count: 0 };
    tallies.set(key, { ...tally, count: tally.count + 1 });
  }
  return [...tallies.values()].sort(
    (a, b) =>
      b.count - a.count || rank(a.tier) - rank(b.tier) || Number(a.shadow) - Number(b.shadow),
  );
}

/**
 * The regions crossed: each counted stop's, in visit order, each once; null where there is none
 * to name (no stop's regions known, a record of before 041, or every stop in none).
 */
function regionsCrossed(windows: readonly StopWindow[]): number[] | null {
  const seen = new Set<number>();
  for (const w of windows) for (const id of w.regionIds ?? []) seen.add(id);
  return seen.size === 0 ? null : [...seen];
}

/**
 * The card of an ended train, from its record's rows (`record`, `stops` in their order,
 * `attendees`) and the raids read for it (`raids`, as `raidsAlongQuery` asks, with the settings'
 * raid times `raidTime` reads; undefined where they could not be read or are not asked for, and
 * the card says nothing of raids then). A train that counts no stop (it never started: no arrival
 * at or before its end, or only moves made by mistake) says only its riders. Riders are the
 * record's own counts (`historyCounts`): members who reached Here or Done, and with the +1s they
 * had at the end.
 */
export function trainCard(
  record: CardRecord,
  stops: readonly CardStop[],
  attendees: readonly CardAttendee[],
  raids: undefined,
): TrainCard;
export function trainCard(
  record: CardRecord,
  stops: readonly CardStop[],
  attendees: readonly CardAttendee[],
  raids: readonly RaidAlongRow[] | undefined,
  durations: RaidStandSettings,
): TrainCard;
export function trainCard(
  record: CardRecord,
  stops: readonly CardStop[],
  attendees: readonly CardAttendee[],
  raids: readonly RaidAlongRow[] | undefined,
  durations?: RaidStandSettings,
): TrainCard {
  const counts = historyCounts(attendees);
  const riders = { members: counts.here + counts.done, heads: counts.hereHeads + counts.doneHeads };
  const peakRiders = record.peakRiders ?? null;
  const windows = stopWindows(record, stops, attendees);
  if (windows.length === 0) {
    return { stops: null, regionIds: null, riders, peakRiders, raids: null };
  }
  // The stops' own times, each capped (review A1): a train that sat an hour at one stop is not
  // said to have run that hour.
  const durationMs = windows.reduce((sum, w) => sum + (w.to - w.from), 0);
  return {
    stops: { count: windows.length, durationMs },
    regionIds: regionsCrossed(windows),
    riders,
    peakRiders,
    raids:
      raids === undefined || durations === undefined
        ? null
        : raidsAlong(windows, record.endedAt, raids, durations),
  };
}
