import type { Settings } from '../../config/settings.js';
import { OPEN_PARTY_HOURS } from '../party/timed.js';
import type { RaidStandSettings } from '../time/raid-durations.js';
import { countsAsActivity, type ActivityRecord } from './activity.js';
import {
  hasOwnCount,
  joinedRaid,
  joinedStops,
  raidTime,
  stopWindows,
  type CardAttendee,
  type CardRecord,
  type CardStop,
  type PairedRaid,
  type PairedTrain,
  type RaidAlongRow,
} from './train-card.js';

/*
 * What a record of the party history counts as where the history counts raids (plan 8H-9, Matt's
 * ruling of 2026-11-06): the heatmap's buckets (and so the region tally) and the raids per day
 * (and so the big days). A raid or a max battle counts as itself; a train's stops are raids that
 * never had a party of their own, so each counts as one; a meetup counts as nothing. One domain
 * path: `bucketOf` and `dayOf` take what this gives, one party at a time.
 */

/** A record of the party history as `countedParties` reads it (`PartyHistory`'s columns). */
export interface CountedRecord extends ActivityRecord {
  /** `PartyHistory.id`: the order the adding goes in, which the pairing rule follows (W1). */
  id: number;
  /** `live` or `legacy`. */
  source: string;
  /** The boss as the catalogue knew it; a train's, the Pokémon it was after. */
  bossKey: string | null;
  /** Epoch ms: a train's start, where it had one. */
  startTime: number | null;
  endTime: number | null;
  /** Null only for a legacy record. */
  endedAt: number | null;
  /** The tier (`Elite` stands its own times, `raidTime`); null where not known. */
  tier: string | null;
  /** What a train went to (`raid`, `dynamax`, `gigantamax`); null for every other party. */
  trainKind: string | null;
}

/**
 * What a train's record holds beyond its row (`PartyHistoryStop`, `PartyHistoryAttendee`), and the
 * raids and max battles of the history its card reads along its stops (`raidsAlongQuery`).
 */
export interface TrainRows {
  stops: readonly CardStop[];
  attendees: readonly CardAttendee[];
  raids: readonly RaidAlongRow[];
}

/** What `countedParties` reads beside a record. */
export interface CountedRows {
  /** A train's own rows; a train without them counts nothing. */
  train?: TrainRows;
  /** The trains around a raid or max battle (`trainsAroundQuery`), as `pairedTrain` gives them. */
  trains?: readonly PairedTrain[];
}

/** One raid or max battle a record counts as, as `bucketOf` and `dayOf` take it. */
export interface CountedParty extends ActivityRecord {
  bossKey: string | null;
}

/**
 * The region a train's stop counts in: once, never in each of the regions it lay in (the
 * buckets and the days sum a server's regions, so a stop in two would count as two raids). The
 * train's own region where the stop lay in it, or where its regions are not known (null, before
 * migration 041) or it lay in none (`[]`, a gym deleted since); else the first of its regions.
 */
function stopRegion(
  regionIds: readonly number[] | null,
  trainRegion: number | null,
): number | null {
  if (regionIds === null || regionIds.length === 0) return trainRegion;
  if (trainRegion !== null && regionIds.includes(trainRegion)) return trainRegion;
  return regionIds[0] ?? trainRegion;
}

/**
 * The endings of a train whose stops count (the controller's ruling of round 1, review T2): it
 * took place (`completed`: somebody came), or nobody could say (`unknown`: a legacy train, or one
 * the sweep recorded; `cutover`). A canceled train counts nothing, nor one nobody came to
 * (`expired`): its moves were no raids.
 */
const STOPS_COUNT_ENDINGS: readonly string[] = ['completed', 'unknown', 'cutover'];

/** Whether a record is a train whose stops count as raids (`countedParties`). */
export function trainStopsCount(record: Pick<CountedRecord, 'kind' | 'ending'>): boolean {
  return record.kind === 'train' && STOPS_COUNT_ENDINGS.includes(record.ending);
}

/**
 * A train as the pairing rule reads it (`joinedRaid`): its record's id and the stops it counts
 * as raids (`countedParties`' own: `stopWindows`), none where its stops count nothing
 * (`trainStopsCount`) or have no times (a legacy train, which pairs with nothing).
 */
export function pairedTrain(
  record: Pick<CountedRecord, 'id' | 'kind' | 'ending' | 'source'> & CardRecord,
  stops: readonly CardStop[],
  attendees: readonly CardAttendee[],
): PairedTrain {
  const counts = record.source === 'live' && trainStopsCount(record);
  return { id: record.id, windows: counts ? stopWindows(record, stops, attendees) : [] };
}

/** What a train may run for after it was made, as `trainReachMs` reads it from the settings. */
export type TrainReachSettings = Pick<
  Settings,
  'maximumMeetupLeadtime' | 'maxMeetupLeadupDuration'
>;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * How long after it was made a train may still stop somewhere: its end at the furthest a member
 * may set it (`maximumMeetupLeadtime` days and one, as `resolvePartyTime` allows), or its start
 * at the furthest (`maxMeetupLeadupDuration`) where that is later, and `OPEN_PARTY_HOURS` after
 * either (a train without an end goes that long; the clocks' change). Not a bound the party
 * keeps: a member who takes its times away again and again keeps it going, and so does staff's
 * keeping it (`/admin save-party`, `PartyService.keep`: a saved party is never archived by the
 * clock); a stop of such a train made later than this is not seen from a raid's side
 * (`trainsAroundQuery`).
 */
export function trainReachMs(settings: TrainReachSettings): number {
  return (
    Math.max(
      settings.maxMeetupLeadupDuration * 60_000,
      (settings.maximumMeetupLeadtime + 1) * DAY,
    ) +
    OPEN_PARTY_HOURS * HOUR
  );
}

/** The settings the adding's counting reads: a train's reach, and how long a raid stands. */
export type CountingSettings = TrainReachSettings & RaidStandSettings;

/** The trains to read for a batch's raids (`trainsAroundQuery`). */
export interface TrainsAroundQuery {
  /** Made from `from` to `to` (`createdAt`, the index's range). */
  from: number;
  to: number;
  /** Ended at `endedFrom` or later: a train that ended before a raid stood never passed it. */
  endedFrom: number;
  /** Recorded before the last raid (`PartyHistory.id` below this): only an earlier train pairs. */
  below: number;
}

/**
 * The read the pairing rule needs for the raids and max battles of a batch of the adding (W1):
 * the server's trains made within a train's reach (`trainReachMs`) before the first of them
 * stood (`raidTime`) up to the end of the last, that ended once the first stood, recorded before
 * the last; undefined where none of them has a count of its own to give up (`joinedRaid`).
 */
export function trainsAroundQuery(
  raids: readonly PairedRaid[],
  settings: CountingSettings,
): TrainsAroundQuery | undefined {
  const own = raids.filter(hasOwnCount);
  if (own.length === 0) return undefined;
  const times = own.map((raid) => raidTime(raid, settings));
  const first = Math.min(...times.map((time) => time.start));
  return {
    from: first - trainReachMs(settings),
    to: Math.max(...times.map((time) => time.end)),
    endedFrom: first,
    below: Math.max(...own.map((raid) => raid.id)),
  };
}

/**
 * The parties a record counts as (plan 8H-9). A record `countsAsActivity` keeps is its own one
 * party. A train whose stops count (`trainStopsCount`) counts each stop its card counts as made
 * (`stopWindows`: reached by its end, a minute at least; a loop's stop each time) as a raid at a
 * gym or a max battle at a Power Spot, at its arrival; a legacy train, whose stops have no times,
 * counts every stop, at its start, else when it was made (a live train whose stops have no times,
 * one that ended before its steps were kept, made none the card counts: nothing, review T4). A
 * stop at a gym the list no longer has is a raid at no place. A stop has the train's boss where
 * its kind is the train's (a gym stop of a `raid` train, a Power Spot stop of a `dynamax` or
 * `gigantamax` one), none otherwise; the train's ending; nobody's heads (who rode is the train's,
 * not a stop's). A stop and a raid the train joined there are one raid, counted once by the record
 * of the two that came first (the pairing rule, `laterOfPair`, W1): a stop where the train joined
 * a raid recorded before it (`joinedStops`) counts nothing, and so does a raid or max battle a
 * train recorded before it stopped at (`joinedRaid`, of `rows.trains`). `rows.train` absent (its
 * rows not read) counts nothing of a train. `durations`: how long a raid without an end time
 * stood (`raidTime`).
 */
export function countedParties(
  record: CountedRecord,
  rows: CountedRows,
  durations: RaidStandSettings,
): CountedParty[] {
  const { train } = rows;
  if (countsAsActivity(record)) {
    return joinedRaid(record, rows.trains ?? [], durations) ? [] : [record];
  }
  if (!trainStopsCount(record) || train === undefined) return [];
  const boss = (kind: 'raid' | 'max'): string | null =>
    (kind === 'raid') === ((record.trainKind ?? 'raid') === 'raid') ? record.bossKey : null;
  const stop = (
    place: Pick<CardStop, 'gymId' | 'wayspotId'>,
    regionIds: readonly number[] | null,
    at: number,
  ): CountedParty => {
    const kind = place.gymId === null && place.wayspotId !== null ? 'max' : 'raid';
    return {
      kind,
      ending: record.ending,
      createdAt: at,
      hatchTime: at,
      regionId: stopRegion(regionIds, record.regionId),
      gymId: place.gymId,
      wayspotId: place.wayspotId,
      hereHeads: 0,
      doneHeads: 0,
      bossKey: boss(kind),
    };
  };
  if (record.source === 'legacy') {
    const at = record.startTime ?? record.createdAt;
    return train.stops.map((one) => stop(one, one.regionIds ?? null, at));
  }
  const { windows } = pairedTrain(record, train.stops, train.attendees);
  const joined = joinedStops(record.id, windows, train.raids, durations);
  return windows.flatMap((w, index) =>
    joined[index] === true ? [] : [stop(w, w.regionIds, w.from)],
  );
}
