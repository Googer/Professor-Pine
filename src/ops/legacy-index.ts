import {
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isSnowflake } from '../db/snowflake.js';
import { readIndexEntry, type LegacyIndexEntry } from '../domain/history/legacy-index.js';

/*
 * The member index of the legacy history on disk (plan 8H-10): `<root>/<server>/<member>.json`,
 * `{ member, server, entries }` with the entries' lines (`writeIndexEntry`). The root is
 * `LEGACY_INDEX_DIR`, beside the legacy `parties/` folder on the host: the history import writes
 * it, the bot only reads it (mounted read-only). It holds the files' member ids, so it is never
 * in the database or the repository, and is no more readable than the parties folder. A path is
 * made of snowflakes only.
 */

/** Who may read the index: the parties folder's own modes (`indexModesOf`). */
export interface IndexModes {
  dir: number;
  file: number;
}

/**
 * The index's modes from the parties folder's: the folder's for folders, without x for files, and
 * always all of them for the owner (A5: whatever the parties folder lacks, the index's writer must
 * be able to replace it, and the bot that reads it as the owner to read it).
 */
export function indexModesFrom(mode: number): IndexModes {
  const bits = mode & 0o777;
  return { dir: bits | 0o700, file: (bits & 0o666) | 0o600 };
}

/** The modes of the parties folder for the index (`indexModesFrom`). */
export function indexModesOf(partiesDir: string): IndexModes {
  return indexModesFrom(statSync(partiesDir).mode);
}

/**
 * Whether the root holds an index of the server: its folder, or the old one a run stopped
 * between its two renames left aside (`writeServerIndex` puts it back).
 */
export function hasServerIndex(root: string, serverId: string): boolean {
  if (!isSnowflake(serverId)) throw new Error(`${serverId} is not a server id`);
  return existsSync(path.join(root, serverId)) || existsSync(path.join(root, `.${serverId}.old`));
}

/**
 * Replaces the index of one server whole: written into `.<server>.new` beside it, then swapped
 * in for the old one, so that a run that fails half-way leaves the old index as it was (and the
 * bot sees no folder only for the moment between the two renames, which the fill-in waits out).
 * `members`: each member's entry lines.
 */
export function writeServerIndex(
  root: string,
  serverId: string,
  members: ReadonlyMap<string, readonly string[]>,
  modes: IndexModes,
): void {
  if (!isSnowflake(serverId)) throw new Error(`${serverId} is not a server id`);
  const fresh = path.join(root, `.${serverId}.new`);
  const old = path.join(root, `.${serverId}.old`);
  const target = path.join(root, serverId);
  // A run stopped between the two renames below left the old index aside: back first (A2).
  if (!existsSync(target) && existsSync(old)) renameSync(old, target);
  rmSync(fresh, { recursive: true, force: true });
  try {
    mkdirSync(fresh, { mode: modes.dir });
    chmodSync(fresh, modes.dir);
    for (const [memberId, entries] of members) {
      if (!isSnowflake(memberId)) throw new Error(`${memberId} is not a member id`);
      const file = path.join(fresh, `${memberId}.json`);
      writeFileSync(file, JSON.stringify({ member: memberId, server: serverId, entries }), {
        mode: modes.file,
      });
      chmodSync(file, modes.file);
    }
  } catch (err) {
    rmSync(fresh, { recursive: true, force: true });
    throw err;
  }
  rmSync(old, { recursive: true, force: true });
  if (existsSync(target)) renameSync(target, old);
  renameSync(fresh, target);
  rmSync(old, { recursive: true, force: true });
}

/**
 * A member's index file: their entries; `none` where the server's index has no file of theirs;
 * `no-server` where there is no index of the server (none was made, or a new one is being swapped
 * in); `unreadable` with why, in words without ids.
 */
export type MemberIndexRead =
  | { kind: 'entries'; entries: LegacyIndexEntry[] }
  | { kind: 'none' }
  | { kind: 'no-server' }
  | { kind: 'unreadable'; reason: string };

function fileOf(root: string, serverId: string, memberId: string): string | undefined {
  return isSnowflake(serverId) && isSnowflake(memberId)
    ? path.join(root, serverId, `${memberId}.json`)
    : undefined;
}

/** Whether the member has a file in the server's index (the panel's question; reads no file). */
export async function hasMemberIndex(
  root: string,
  serverId: string,
  memberId: string,
): Promise<boolean> {
  const file = fileOf(root, serverId, memberId);
  if (file === undefined) return false;
  try {
    // Readable, not only there (A6): a file the bot may not read is no offer.
    await access(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The servers whose index holds a file of the member, in ascending order (plan 8G: `/admin
 * forget` names those files to the owner, who deletes them on the host, since the bot's mount is
 * read-only). A file counts when it is there, readable to the bot or not; only folders named as
 * a server's id are looked into (not a `.<server>.new` or `.old` of an import under way), and no
 * file is read. Nothing for an id that is none, or a root that is not there.
 */
export async function memberIndexServers(root: string, memberId: string): Promise<string[]> {
  if (!isSnowflake(memberId)) return [];
  const names = await readdir(root).catch(() => [] as string[]);
  const found: string[] = [];
  for (const serverId of names.filter((name) => isSnowflake(name)).sort()) {
    const file = fileOf(root, serverId, memberId);
    if (file === undefined) continue;
    try {
      await access(file);
      found.push(serverId);
    } catch {
      // None of theirs there, or a folder the bot may not search: nothing it can name.
    }
  }
  return found;
}

/** Reads a member's index file of a server, checking it is theirs and every entry. */
export async function readMemberIndex(
  root: string,
  serverId: string,
  memberId: string,
): Promise<MemberIndexRead> {
  const file = fileOf(root, serverId, memberId);
  if (file === undefined) return { kind: 'none' };
  const read = async (): Promise<string | { code: string }> => {
    try {
      return await readFile(file, 'utf8');
    } catch (err) {
      return { code: (err as NodeJS.ErrnoException).code ?? 'unknown' };
    }
  };
  let text = await read();
  if (typeof text !== 'string' && text.code === 'ENOENT') {
    try {
      await access(path.join(root, serverId));
    } catch {
      return { kind: 'no-server' };
    }
    // The folder is there: the file is missing, or the import swapped a new folder in between
    // the two looks (A2). Read once more before saying there is none.
    text = await read();
    if (typeof text !== 'string' && text.code === 'ENOENT') return { kind: 'none' };
  }
  if (typeof text !== 'string') {
    return { kind: 'unreadable', reason: `cannot be read (${text.code})` };
  }
  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch {
    return { kind: 'unreadable', reason: 'not JSON' };
  }
  if (
    typeof content !== 'object' ||
    content === null ||
    !('member' in content) ||
    !('server' in content) ||
    !('entries' in content) ||
    !Array.isArray(content.entries)
  ) {
    return { kind: 'unreadable', reason: 'not an index file' };
  }
  if (content.member !== memberId || content.server !== serverId) {
    return { kind: 'unreadable', reason: 'not this member' };
  }
  const entries: LegacyIndexEntry[] = [];
  for (const line of content.entries as unknown[]) {
    const entry = readIndexEntry(line);
    if (entry === undefined) return { kind: 'unreadable', reason: 'an entry it cannot read' };
    entries.push(entry);
  }
  return { kind: 'entries', entries };
}
