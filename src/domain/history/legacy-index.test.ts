import { describe, expect, it } from 'vitest';
import {
  legacyIndexEntries,
  readIndexEntry,
  writeIndexEntry,
  type LegacyIndexEntry,
} from './legacy-index.js';
import type { HistoryAttendee } from './party-history.js';

// Invented ids: nothing here comes from a real server.
const KEY = '310000000000000001:1650000000000';
const MEMBER_A = '320000000000000001';
const MEMBER_B = '320000000000000002';

function attendee(overrides: Partial<HistoryAttendee> = {}): HistoryAttendee {
  return {
    memberId: null,
    status: 'done',
    furthest: 'done',
    groupId: 'A',
    extras: 0,
    remote: false,
    team: null,
    signedUpAt: null,
    joinedAt: null,
    hereAt: null,
    doneAt: null,
    leftAt: null,
    ...overrides,
  };
}

describe('the entries of the member index', () => {
  it('are short lines that read back as they were written', () => {
    const entries: LegacyIndexEntry[] = [
      { key: KEY, role: 'reporter' },
      { key: KEY, role: 'attendee', seq: 3, furthest: 'here', extras: 2, groupId: 'B' },
      { key: KEY, role: 'attendee', seq: 0, furthest: 'interested', extras: 0, groupId: null },
      { key: KEY, role: 'attendee', seq: 1, furthest: 'done', extras: 0, groupId: ' ' },
      // A group the files named "" (the history keeps it as it was cut: empty).
      { key: KEY, role: 'attendee', seq: 2, furthest: 'done', extras: 0, groupId: '' },
    ];
    const lines = entries.map(writeIndexEntry);
    expect(lines.slice(0, 3)).toEqual([
      `${KEY} r`,
      `${KEY} a 3 here 2 B`,
      `${KEY} a 0 interested 0`,
    ]);
    expect(lines.map(readIndexEntry)).toEqual(entries);
  });

  it('refuse what the import did not write', () => {
    for (const line of [
      42,
      '',
      `${KEY} x`,
      `${KEY} r extra`,
      `310000000000000001 r`,
      `${KEY} a -1 done 0`,
      `${KEY} a 0 gone 0`,
      `${KEY} a 0 done 256`,
      `${KEY} a 0 done 0 AB`,
    ]) {
      expect(readIndexEntry(line)).toBeUndefined();
    }
  });
});

describe('legacyIndexEntries', () => {
  const read = {
    record: {
      legacyKey: KEY,
      attendees: [attendee({ extras: 1 }), attendee({ groupId: 'B', furthest: 'joined' })],
    },
    attendeeIds: [MEMBER_A, MEMBER_B],
    reporterId: MEMBER_A,
  };
  const stored = (
    changes: Partial<{ furthest: string; extras: number; groupId: string | null }>[],
  ) =>
    read.record.attendees.map((one, seq) => ({
      seq,
      furthest: one.furthest,
      extras: one.extras,
      groupId: one.groupId,
      ...changes[seq],
    }));

  it('names each member where the history holds the party as the files tell it', () => {
    expect(legacyIndexEntries(read, stored([]))).toEqual({
      entries: [
        [MEMBER_A, { key: KEY, role: 'reporter' }],
        [
          MEMBER_A,
          { key: KEY, role: 'attendee', seq: 0, furthest: 'done', extras: 1, groupId: 'A' },
        ],
        [
          MEMBER_B,
          { key: KEY, role: 'attendee', seq: 1, furthest: 'joined', extras: 0, groupId: 'B' },
        ],
      ],
      leftOut: 0,
    });
  });

  it('leaves out an attendee whose place the history holds otherwise, and counts it', () => {
    const changed = legacyIndexEntries(read, stored([{}, { extras: 4 }]));
    expect(changed.entries.map(([member, entry]) => [member, entry.role])).toEqual([
      [MEMBER_A, 'reporter'],
      [MEMBER_A, 'attendee'],
    ]);
    expect(changed.leftOut).toBe(1);
    // Another number of attendees: none of its places can be trusted, the maker still can.
    const fewer = legacyIndexEntries(read, stored([]).slice(0, 1));
    expect(fewer.entries.map(([, entry]) => entry.role)).toEqual(['reporter']);
    expect(fewer.leftOut).toBe(2);
  });

  it('names nobody the files do not name as a member', () => {
    const nobody = legacyIndexEntries(
      { ...read, attendeeIds: [null, MEMBER_B], reporterId: null },
      stored([]),
    );
    expect(nobody.entries.map(([member, entry]) => [member, entry.role])).toEqual([
      [MEMBER_B, 'attendee'],
    ]);
  });
});
