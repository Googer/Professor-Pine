import { HISTORY_STATUSES, type HistoryRecord, type HistoryStatus } from './party-history.js';

/*
 * The member index of the legacy history (plan 8H-10): what the legacy files say a member did,
 * by the legacy record's key, so that a member who asks has their id filled into the legacy
 * records they made or signed up to without the whole folder being read again. The import writes
 * it (`legacyIndexEntries`, from the very reading that numbered the attendees), a file per member
 * and server; the fill-in reads one. An entry is a short line, so that a member's thousands of
 * entries are a small file and the import holds a server's in memory.
 *
 * `<legacyKey> r`: the member made the party (its `createdById`). `<legacyKey> a <seq> <furthest>
 * <extras> [<group>]`: the member is its attendee at `seq`, as the history stored that attendee
 * (the fill-in writes only where the stored place still says so). No conductor: the legacy
 * history credits none (`conducted` 0), and nothing reads one of a legacy record.
 */

export type LegacyIndexEntry =
  | { key: string; role: 'reporter' }
  | {
      key: string;
      role: 'attendee';
      seq: number;
      furthest: HistoryStatus;
      extras: number;
      groupId: string | null;
    };

/** What the history stored of an attendee's place (`PartyHistoryAttendee`), as the entry holds it. */
export interface StoredPlace {
  seq: number;
  furthest: string;
  extras: number;
  groupId: string | null;
}

/** A legacy record's key as the import makes it: `<channel>:<creation ms>`. */
const KEY = /^\d{15,20}:\d{1,15}$/u;
const SEQ = /^\d{1,5}$/u;
const EXTRAS = /^\d{1,3}$/u;

/** The line of an entry. A group's letter is escaped (it may be anything the files had). */
export function writeIndexEntry(entry: LegacyIndexEntry): string {
  if (entry.role === 'reporter') return `${entry.key} r`;
  const group = entry.groupId === null ? '' : ` ${encodeURIComponent(entry.groupId)}`;
  return `${entry.key} a ${String(entry.seq)} ${entry.furthest} ${String(entry.extras)}${group}`;
}

/** An entry from its line; undefined for anything the import does not write. */
export function readIndexEntry(line: unknown): LegacyIndexEntry | undefined {
  if (typeof line !== 'string') return undefined;
  const [key = '', role, ...rest] = line.split(' ');
  if (!KEY.test(key)) return undefined;
  if (role === 'r') return rest.length === 0 ? { key, role: 'reporter' } : undefined;
  if (role !== 'a' || rest.length < 3 || rest.length > 4) return undefined;
  const [seq = '', furthest = '', extras = '', group] = rest;
  const status = HISTORY_STATUSES.find((one) => one === furthest);
  if (!SEQ.test(seq) || status === undefined || !EXTRAS.test(extras)) return undefined;
  let groupId: string | null = null;
  if (group !== undefined) {
    try {
      groupId = decodeURIComponent(group);
    } catch {
      return undefined;
    }
    // One letter, or none where the files named a group "" (`slice(0, 1)` of it).
    if ([...groupId].length > 1) return undefined;
  }
  if (Number(extras) > 255) return undefined;
  return {
    key,
    role: 'attendee',
    seq: Number(seq),
    furthest: status,
    extras: Number(extras),
    groupId,
  };
}

/** Whether an attendee as the files read and its place as the history stored it are one. */
function samePlace(
  attendee: Pick<HistoryRecord['attendees'][number], 'furthest' | 'extras' | 'groupId'>,
  stored: StoredPlace | undefined,
  seq: number,
): boolean {
  return (
    stored !== undefined &&
    stored.seq === seq &&
    stored.furthest === attendee.furthest &&
    stored.extras === Math.min(255, attendee.extras) &&
    stored.groupId === attendee.groupId
  );
}

/**
 * The entries of one legacy record, by member: its maker, and each attendee the files name
 * whose place the history holds as the files tell it (`stored`, in `seq` order: the record as
 * it was written, by this import or an earlier one). An attendee whose place differs, or every
 * attendee where the history holds another number of them, is left out and counted (`leftOut`):
 * a fill-in must never name a member at someone else's place.
 */
export function legacyIndexEntries(
  read: {
    record: Pick<HistoryRecord, 'legacyKey' | 'attendees'>;
    attendeeIds: readonly (string | null)[];
    reporterId: string | null;
  },
  stored: readonly StoredPlace[],
): { entries: [string, LegacyIndexEntry][]; leftOut: number } {
  const key = read.record.legacyKey ?? '';
  const entries: [string, LegacyIndexEntry][] = [];
  if (read.reporterId !== null) entries.push([read.reporterId, { key, role: 'reporter' }]);
  const sameCount = stored.length === read.record.attendees.length;
  let leftOut = 0;
  for (const [seq, attendee] of read.record.attendees.entries()) {
    const memberId = read.attendeeIds[seq] ?? null;
    if (memberId === null) continue;
    if (!sameCount || !samePlace(attendee, stored[seq], seq)) {
      leftOut += 1;
      continue;
    }
    entries.push([
      memberId,
      {
        key,
        role: 'attendee',
        seq,
        furthest: attendee.furthest,
        extras: Math.min(255, attendee.extras),
        groupId: attendee.groupId,
      },
    ]);
  }
  return { entries, leftOut };
}
