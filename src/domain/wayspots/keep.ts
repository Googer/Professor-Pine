import { tidyLine } from '../gyms/gym-text.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import type { ExportedWayspot, WayspotKind } from '@pine/wayspot-core/export-file';
import {
  MAX_KEPT_TEXT,
  type GoneWayspot,
  type Wayspot,
  type WayspotRow,
  type WayspotWrites,
} from './kept.js';
import { pictureOf } from './match.js';

/**
 * What a Wayfarer import does to the kept Wayspots (plan 8W-2): every Wayspot of the file is kept
 * (inside the server's regions or in the scan's margin outside them), but one that is a Pine gym
 * after the import (its id a gym's `pogoId`: that one lives in `Gym`); a kept Wayspot that the
 * file does not have is marked gone where the file covered its cell (`WayspotWrites.gone`), and
 * one that is a Pine gym now is deleted. A row that a scan newer than the file's wrote is left as
 * it is (a week-old file does not undo a fresh scan of another server's), one another scan saw
 * after the file's scan started is not marked gone by it, and one a newer scan found gone is not
 * brought back. The storage keeps the same guards when it writes (`WayspotStorage`), so that
 * imports that are not one after the other cannot undo each other either. Moves and renames are
 * silent. Pure: the import service writes the plan in its batch.
 */

/**
 * The stops and power spots an import adds, changes and deletes (a stop that became a gym is
 * gone from them; a Wayfarer gym that became a stop is new), and `gyms`: the kept Wayfarer gyms
 * it adds, changes or deletes (said nowhere, and no reason to offer an import: nothing members
 * see changes by them).
 */
export interface WayspotCounts {
  added: number;
  changed: number;
  gone: number;
  gyms: number;
}

export const NO_WAYSPOT_CHANGES: Readonly<WayspotCounts> = {
  added: 0,
  changed: 0,
  gone: 0,
  gyms: 0,
};

/** What an import does to the kept Wayspots of one kind, as members are told it. */
export interface KindChanges {
  added: number;
  changed: number;
  gone: number;
}

/**
 * The stops and power spots an import adds, changes and deletes, by the kind each is now (or was,
 * for one gone), as the summary in the channel for bot updates says them (`gymListSummary`):
 * unlike `WayspotCounts`, `gone` holds only those gone from Wayfarer's map, not one that became
 * a gym (the summary says of the gyms added which were PokéStops), and `changed` only a new kind,
 * title or a move over `NOTICED_MOVE_METRES` (`noticeable`), not a new address or picture alone.
 * A stop Wayfarer now shows as a gym, taken by a Pine gym or not, is counted neither as removed
 * nor as a stop.
 */
export interface WayspotChanges {
  stops: KindChanges;
  powerSpots: KindChanges;
}

export const NO_KIND_CHANGES: Readonly<WayspotChanges> = {
  stops: { added: 0, changed: 0, gone: 0 },
  powerSpots: { added: 0, changed: 0, gone: 0 },
};

/** Two sets of counts as one. */
export function addWayspotChanges(a: WayspotChanges, b: WayspotChanges): WayspotChanges {
  const sum = (x: KindChanges, y: KindChanges): KindChanges => ({
    added: x.added + y.added,
    changed: x.changed + y.changed,
    gone: x.gone + y.gone,
  });
  return { stops: sum(a.stops, b.stops), powerSpots: sum(a.powerSpots, b.powerSpots) };
}

/**
 * Whether an import changes any kept PokéStop or power spot (beyond when they were seen): the
 * kept Wayfarer gyms (`gyms`) do not count.
 */
export function changesWayspots(counts: WayspotCounts): boolean {
  return counts.added + counts.changed + counts.gone > 0;
}

export interface KeptInput {
  /** The Wayspots of the file. */
  wayspots: readonly ExportedWayspot[];
  /** The cells the file covered (`coveredCells`). */
  covered: ReadonlySet<string>;
  /** The kept Wayspots as they are before the import. */
  kept: readonly Wayspot[];
  /**
   * The Wayspots an import found gone from a covered cell (`WayspotStorage.gone`), with when the
   * scan that found them gone was made and the kind they had: one the file has is not brought
   * back when that scan is newer than the file's, and one brought back remembers that kind
   * (`formerKind`: a stop back as a gym was a stop). Default: none.
   */
  gone?: ReadonlyMap<string, GoneWayspot>;
  /** The Wayfarer ids of every Pine gym (of any server) after the import. */
  gymIds: ReadonlySet<string>;
  /**
   * When the file's scan was made (`scanTimeOf`): a kept row last seen later than this is not
   * written again, unless a Pine gym is it now.
   */
  scannedAt: number;
  /**
   * When the file's scan started (`scanStartOf`), the earliest it can have seen a cell: a kept row
   * last seen later than this is not deleted, unless a Pine gym is it now.
   */
  startedAt: number;
}

export interface KeptPlan {
  writes: WayspotWrites;
  counts: WayspotCounts;
  /** The stops and power spots changed, as members are told it. */
  byKind: WayspotChanges;
}

const isStopOrSpot = (kind: WayspotKind | undefined): boolean =>
  kind === 'stop' || kind === 'powerspot';

/** A text as the columns hold it: one line, tidied, at most `MAX_KEPT_TEXT` characters. */
function keptText(text: string): string {
  const tidy = tidyLine(text);
  const characters = [...tidy];
  return characters.length <= MAX_KEPT_TEXT
    ? tidy
    : characters.slice(0, MAX_KEPT_TEXT).join('').trimEnd();
}

/**
 * A Wayspot of a file as it is kept, given its row before (if any): `formerKind` is the kind it
 * had when it was last seen as another.
 */
export function keptRowOf(
  wayspot: ExportedWayspot,
  before: Pick<Wayspot, 'kind' | 'formerKind'> | undefined,
): WayspotRow {
  const address = keptText(wayspot.address);
  return {
    id: wayspot.id,
    kind: wayspot.kind,
    formerKind:
      before === undefined ? null : before.kind !== wayspot.kind ? before.kind : before.formerKind,
    lat: wayspot.lat,
    lon: wayspot.lon,
    title: keptText(wayspot.title),
    address: address === '' ? null : address,
    image: pictureOf(wayspot.image),
  };
}

/** Whether a kept Wayspot was a PokéStop: one now, or a gym that was one before. */
export function wasStop(row: Pick<Wayspot, 'kind' | 'formerKind'> | undefined): boolean {
  return row !== undefined && (row.kind === 'stop' || row.formerKind === 'stop');
}

/** Whether a row differs from what was kept in what anybody sees of it. */
function differs(row: WayspotRow, before: Wayspot): boolean {
  return (
    row.kind !== before.kind ||
    row.title !== before.title ||
    row.lat !== before.lat ||
    row.lon !== before.lon ||
    row.address !== before.address ||
    row.image !== before.image
  );
}

/** How far a stop or power spot moves before members are told it changed (`noticeable`). */
export const NOTICED_MOVE_METRES = 10;

/**
 * Whether a row differs from what was kept in what members are told of (the summary's
 * `changed`): its kind, its title, or its place by more than `NOTICED_MOVE_METRES`; a new address
 * or picture alone is written but not said, so that routine re-imports post nothing.
 */
function noticeable(row: WayspotRow, before: Wayspot): boolean {
  return (
    row.kind !== before.kind ||
    row.title !== before.title ||
    metresBetween(row, before) > NOTICED_MOVE_METRES
  );
}

/** What an import writes of the kept Wayspots, and what that changes, counted. */
export function planKept(input: KeptInput): KeptPlan {
  const before = new Map(input.kept.map((row) => [row.id, row]));
  const counts: WayspotCounts = { ...NO_WAYSPOT_CHANGES };
  const byKind: WayspotChanges = {
    stops: { ...NO_KIND_CHANGES.stops },
    powerSpots: { ...NO_KIND_CHANGES.powerSpots },
  };
  const ofKind = (kind: WayspotKind): KindChanges | undefined =>
    kind === 'stop' ? byKind.stops : kind === 'powerspot' ? byKind.powerSpots : undefined;
  const upsert: WayspotRow[] = [];
  const remove: string[] = [];
  const gone: string[] = [];
  const inFile = new Set<string>();
  const goneOf = input.gone ?? new Map<string, GoneWayspot>();
  /**
   * A kept row taken away: deleted when a Pine gym is it now (`becameGym`), else marked gone.
   */
  const removed = (row: Wayspot, becameGym: boolean): void => {
    (becameGym ? remove : gone).push(row.id);
    if (isStopOrSpot(row.kind)) counts.gone++;
    else counts.gyms++;
    if (!becameGym) {
      const kind = ofKind(row.kind);
      if (kind) kind.gone++;
    }
  };
  const newer = (row: Wayspot): boolean => row.lastSeen > input.scannedAt;
  // Seen by another scan after this one started: a row seen when the file's scan was made is the
  // file's own (an earlier import of the same scan).
  const seenSinceStart = (row: Wayspot): boolean =>
    row.lastSeen > input.startedAt && row.lastSeen !== input.scannedAt;
  for (const wayspot of input.wayspots) {
    inFile.add(wayspot.id);
    const old = before.get(wayspot.id);
    if (input.gymIds.has(wayspot.id)) {
      if (old) removed(old, true);
      // Found gone once, and a gym now: its gone row goes, uncounted.
      else if (goneOf.has(wayspot.id)) remove.push(wayspot.id);
      continue;
    }
    if (old && newer(old)) continue;
    // Found gone by a scan newer than the file's: an older file does not bring it back.
    const wentAs = old ? undefined : goneOf.get(wayspot.id);
    if (wentAs && wentAs.goneAt > input.scannedAt) continue;
    // Brought back: the kind it had when it went is the kind before.
    const row = keptRowOf(wayspot, old ?? (wentAs && { kind: wentAs.kind, formerKind: null }));
    upsert.push(row);
    const kind = ofKind(row.kind);
    if (kind) {
      if (!old || !isStopOrSpot(old.kind)) {
        counts.added++;
        kind.added++;
      } else if (differs(row, old)) {
        counts.changed++;
        if (noticeable(row, old)) kind.changed++;
      }
    } else {
      // A stop or power spot that became a Wayfarer gym: gone from them, but not from the map.
      if (old && isStopOrSpot(old.kind)) counts.gone++;
      if (!old || differs(row, old)) counts.gyms++;
    }
  }
  for (const row of input.kept) {
    if (inFile.has(row.id)) continue;
    if (input.gymIds.has(row.id)) removed(row, true);
    else if (!seenSinceStart(row) && input.covered.has(wayfarerCellAt(row))) removed(row, false);
  }
  return { writes: { upsert, remove, gone }, counts, byKind };
}

/** The first of the texts that is a time, never later than `now`; else `now`. */
function firstTime(texts: readonly string[], now: number): number {
  for (const text of texts) {
    const ms = Date.parse(text);
    if (Number.isFinite(ms)) return Math.min(ms, now);
  }
  return now;
}

/**
 * When the scan of a file was made, as the kept rows' `lastSeen` holds it: its `finishedAt`,
 * else its `startedAt`, else `now` (when it is imported); never later than `now` (a file that
 * says it was made in the future would freeze its rows against every later scan).
 */
export function scanTimeOf(file: { startedAt: string; finishedAt: string }, now: number): number {
  return firstTime([file.finishedAt, file.startedAt], now);
}

/**
 * When the scan of a file started, the earliest it can have seen a cell: its `startedAt`, else
 * its `finishedAt`, else `now`; never later than `now`. What another scan saw after this is not
 * deleted by the file.
 */
export function scanStartOf(file: { startedAt: string; finishedAt: string }, now: number): number {
  return firstTime([file.startedAt, file.finishedAt], now);
}
