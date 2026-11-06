import { countsAsActivity, type ActivityRecord } from './activity.js';
import {
  joinedStops,
  stopWindows,
  type CardAttendee,
  type CardStop,
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
  /** `live` or `legacy`. */
  source: string;
  /** The boss as the catalogue knew it; a train's, the Pokémon it was after. */
  bossKey: string | null;
  /** Epoch ms: a train's start, where it had one. */
  startTime: number | null;
  endTime: number | null;
  /** Null only for a legacy record. */
  endedAt: number | null;
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
 * The parties a record counts as (plan 8H-9). A record `countsAsActivity` keeps is its own one
 * party. A train whose stops count (`trainStopsCount`) counts each stop its card counts as made
 * (`stopWindows`: reached by its end, a minute at least; a loop's stop each time) as a raid at a
 * gym or a max battle at a Power Spot, at its arrival; a legacy train, whose stops have no times,
 * counts every stop, at its start, else when it was made (a live train whose stops have no times,
 * one that ended before its steps were kept, made none the card counts: nothing, review T4). A
 * stop at a gym the list no longer has is a raid at no place. A stop has the train's boss where
 * its kind is the train's (a gym stop of a `raid` train, a Power Spot stop of a `dynamax` or
 * `gigantamax` one), none otherwise; the train's ending; nobody's heads (who rode is the train's,
 * not a stop's). A stop where the train joined a raid with a record of its own (`joinedStops`) is
 * that raid, which its own record counts: it counts nothing. `train` absent (its rows not read)
 * counts nothing of a train.
 */
export function countedParties(record: CountedRecord, train?: TrainRows): CountedParty[] {
  if (countsAsActivity(record)) return [record];
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
  const windows = stopWindows(record, train.stops, train.attendees);
  const joined = joinedStops(windows, train.raids);
  return windows.flatMap((w, index) =>
    joined[index] === true ? [] : [stop(w, w.regionIds, w.from)],
  );
}
