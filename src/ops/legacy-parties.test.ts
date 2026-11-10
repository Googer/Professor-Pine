import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readLegacyActive, staysAtCutover } from './legacy-parties.js';

/**
 * A legacy `parties` folder as the legacy bot wrote it: `active/` of files without an extension,
 * each `{ key, value }`. Every id and name here is made up.
 */
function partiesFolder(files: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
  mkdirSync(path.join(root, 'active'));
  mkdirSync(path.join(root, 'complete'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(
      path.join(root, 'active', name),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }
  return root;
}

const TRAIN = {
  key: 'a1',
  value: {
    type: 'raid train',
    channelId: '512345678901234501',
    sourceChannelId: '512345678901234599',
    trainName: 'Made-up loop',
    createdById: '412345678901234567',
    creationTime: 1_560_000_000_000,
    attendees: {
      '412345678901234567': { number: 1, status: 1 },
      '412345678901234568': { number: 3, status: 2 },
    },
  },
};
const MEETUP = {
  key: 'b2',
  value: { type: 'meet-up', channelId: '512345678901234502', meetupName: 'Made-up meetup' },
};
const SAVED_RAID = {
  key: 'c3',
  value: {
    type: 'raid',
    channelId: '512345678901234503',
    creationTime: 1_600_000_000_000,
    deletionTime: -1,
    attendees: {},
  },
};

describe('readLegacyActive', () => {
  it('reads the channel, kind, region, name, age and sign-ups of every active party, and none of its members', () => {
    const read = readLegacyActive(partiesFolder({ a1: TRAIN, b2: MEETUP, c3: SAVED_RAID }));
    if (!read.ok) throw new Error(read.error);
    expect(read.parties).toEqual([
      {
        file: 'a1',
        type: 'raid train',
        channelId: '512345678901234501',
        sourceChannelId: '512345678901234599',
        name: 'Made-up loop',
        createdAt: 1_560_000_000_000,
        signedUp: 2,
        saved: false,
      },
      {
        file: 'b2',
        type: 'meet-up',
        channelId: '512345678901234502',
        sourceChannelId: null,
        name: 'Made-up meetup',
        createdAt: null,
        signedUp: 0,
        saved: false,
      },
      {
        file: 'c3',
        type: 'raid',
        channelId: '512345678901234503',
        sourceChannelId: null,
        name: null,
        createdAt: 1_600_000_000_000,
        signedUp: 0,
        saved: true,
      },
    ]);
    expect(JSON.stringify(read)).not.toContain('41234567890123456');
    expect(read.skipped).toEqual([]);
  });

  it('tells the parties whose channels stay at the cutover: trains, meetups and saved parties', () => {
    const ended = {
      ...SAVED_RAID,
      value: { ...SAVED_RAID.value, deletionTime: 1_600_000_000_000 },
    };
    const read = readLegacyActive(
      partiesFolder({ a1: TRAIN, b2: MEETUP, c3: SAVED_RAID, d4: ended }),
    );
    if (!read.ok) throw new Error(read.error);
    expect(read.parties.map(staysAtCutover)).toEqual([true, true, true, false]);
  });

  it('skips a file it cannot read, or that names no channel, and says why', () => {
    const read = readLegacyActive(
      partiesFolder({
        a1: TRAIN,
        broken: '{"key": "x", "value": {',
        empty: { key: 'c3', value: { type: 'raid' } },
        odd: [1, 2],
      }),
    );
    if (!read.ok) throw new Error(read.error);
    expect(read.parties.map((party) => party.file)).toEqual(['a1']);
    expect(read.skipped).toEqual([
      { file: 'broken', reason: 'not JSON' },
      { file: 'empty', reason: 'no channel' },
      { file: 'odd', reason: 'not a party' },
    ]);
  });

  it('refuses a folder without active/', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
    expect(readLegacyActive(root)).toEqual({
      ok: false,
      error: `${root} has no folder active/: name the legacy bot's parties folder.`,
    });
  });
});
