import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasMemberIndex,
  indexModesFrom,
  readMemberIndex,
  writeServerIndex,
} from './legacy-index.js';

// Invented ids: nothing here comes from a real server.
const SERVER = '412345678901234567';
const MEMBER_A = '320000000000000001';
const MEMBER_B = '320000000000000002';
const KEY = '310000000000000001:1650000000000';
const MODES = { dir: 0o750, file: 0o640 };

const root = () => mkdtempSync(path.join(tmpdir(), 'legacy-index-'));

describe('the member index on disk', () => {
  it('writes a file per member of a server, and reads one back', async () => {
    const dir = root();
    writeServerIndex(
      dir,
      SERVER,
      new Map([[MEMBER_A, [`${KEY} r`, `${KEY} a 0 done 1 A`]]]),
      MODES,
    );
    expect(readdirSync(dir)).toEqual([SERVER]);
    expect(readdirSync(path.join(dir, SERVER))).toEqual([`${MEMBER_A}.json`]);
    expect(await readMemberIndex(dir, SERVER, MEMBER_A)).toEqual({
      kind: 'entries',
      entries: [
        { key: KEY, role: 'reporter' },
        { key: KEY, role: 'attendee', seq: 0, furthest: 'done', extras: 1, groupId: 'A' },
      ],
    });
    expect(await hasMemberIndex(dir, SERVER, MEMBER_A)).toBe(true);
    expect(await hasMemberIndex(dir, SERVER, MEMBER_B)).toBe(false);
  });

  it('replaces a server index whole, and leaves it as it was when the new one cannot be made', () => {
    const dir = root();
    writeServerIndex(dir, SERVER, new Map([[MEMBER_A, [`${KEY} r`]]]), MODES);
    writeServerIndex(dir, SERVER, new Map([[MEMBER_B, [`${KEY} r`]]]), MODES);
    expect(readdirSync(path.join(dir, SERVER))).toEqual([`${MEMBER_B}.json`]);
    expect(() =>
      writeServerIndex(dir, SERVER, new Map([['../../escape', [`${KEY} r`]]]), MODES),
    ).toThrow(/not a member id/u);
    expect(readdirSync(dir)).toEqual([SERVER]);
    expect(readdirSync(path.join(dir, SERVER))).toEqual([`${MEMBER_B}.json`]);
  });

  it.skipIf(process.platform === 'win32')('gives the files the modes it is told', () => {
    const dir = root();
    writeServerIndex(dir, SERVER, new Map([[MEMBER_A, [`${KEY} r`]]]), MODES);
    expect(statSync(path.join(dir, SERVER)).mode & 0o777).toBe(0o750);
    expect(statSync(path.join(dir, SERVER, `${MEMBER_A}.json`)).mode & 0o777).toBe(0o640);
  });

  it('tells a server without an index from a member without a file and a file it cannot read', async () => {
    const dir = root();
    expect(await readMemberIndex(dir, SERVER, MEMBER_A)).toEqual({ kind: 'no-server' });
    mkdirSync(path.join(dir, SERVER));
    expect(await readMemberIndex(dir, SERVER, MEMBER_A)).toEqual({ kind: 'none' });
    const file = path.join(dir, SERVER, `${MEMBER_A}.json`);
    writeFileSync(file, '{"member":');
    expect(await readMemberIndex(dir, SERVER, MEMBER_A)).toEqual({
      kind: 'unreadable',
      reason: 'not JSON',
    });
    // Another member's file under this member's name, or another server's, is not theirs.
    writeFileSync(file, JSON.stringify({ member: MEMBER_B, server: SERVER, entries: [] }));
    expect(await readMemberIndex(dir, SERVER, MEMBER_A)).toEqual({
      kind: 'unreadable',
      reason: 'not this member',
    });
    writeFileSync(
      file,
      JSON.stringify({ member: MEMBER_A, server: SERVER, entries: ['nonsense'] }),
    );
    expect(await readMemberIndex(dir, SERVER, MEMBER_A)).toEqual({
      kind: 'unreadable',
      reason: 'an entry it cannot read',
    });
    // A path is made of member and server ids only.
    expect(await readMemberIndex(dir, SERVER, '..')).toEqual({ kind: 'none' });
    expect(await hasMemberIndex(dir, '..', MEMBER_A)).toBe(false);
  });

  it('puts back the old index a run left between the swap’s two renames (A2)', () => {
    const dir = root();
    writeServerIndex(dir, SERVER, new Map([[MEMBER_A, [`${KEY} r`]]]), MODES);
    // A run stopped after it moved the index aside and before it moved the new one in.
    renameSync(path.join(dir, SERVER), path.join(dir, `.${SERVER}.old`));
    expect(() =>
      writeServerIndex(dir, SERVER, new Map([['../../escape', [`${KEY} r`]]]), MODES),
    ).toThrow(/not a member id/u);
    expect(readdirSync(dir)).toEqual([SERVER]);
    expect(readdirSync(path.join(dir, SERVER))).toEqual([`${MEMBER_A}.json`]);
  });

  it('makes the index no less readable to its owner than the parties folder is (A5)', () => {
    expect(indexModesFrom(0o750)).toEqual({ dir: 0o750, file: 0o640 });
    // A folder its owner may only search, or files only executable, still give the owner all.
    expect(indexModesFrom(0o511)).toEqual({ dir: 0o711, file: 0o600 });
    expect(indexModesFrom(0o40755)).toEqual({ dir: 0o755, file: 0o644 });
  });

  it('writes what it is given and nothing more', () => {
    const dir = root();
    writeServerIndex(dir, SERVER, new Map([[MEMBER_A, [`${KEY} r`]]]), MODES);
    expect(JSON.parse(readFileSync(path.join(dir, SERVER, `${MEMBER_A}.json`), 'utf8'))).toEqual({
      member: MEMBER_A,
      server: SERVER,
      entries: [`${KEY} r`],
    });
  });
});
