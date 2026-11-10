import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isSnowflake } from '../db/snowflake.js';

/*
 * The legacy bot's `parties/` folder (node-persist): `active/` holds a file per party that had
 * not ended, `complete/` a file per gym with the list of every raid that ended there. Each file
 * is JSON, `{ key, value }`, without an extension. The files hold member ids and names: what
 * reads them keeps only what it needs (the party history keeps no member; the cleanup of plan 8C
 * the channel ids) and never prints a party.
 *
 * Two readers: `legacyPartyFiles` (every party of both folders, for the history import of plan
 * 8H) and `readLegacyActive` (the channels of `active/`, for the cleanup of plan 8C, with what
 * a person needs to judge the channels that stay: the party's name, age and how many signed up).
 */

export type LegacyPart = 'active' | 'complete';

/**
 * A file of the folder: the parties in it, or why it could not be read (`not JSON`, `not a
 * record`, or the file system's code: `cannot be read (EACCES)`).
 */
export type LegacyPartyFile =
  | { part: LegacyPart; file: string; parties: unknown[] }
  | { part: LegacyPart; file: string; unreadable: string };

function isFolder(dir: string): boolean {
  return existsSync(dir) && statSync(dir).isDirectory();
}

/** Why a folder is not the legacy bot's `parties/` folder; undefined when it is. */
export function legacyFolderProblem(dir: string): string | undefined {
  if (isFolder(path.join(dir, 'active')) || isFolder(path.join(dir, 'complete'))) return undefined;
  return `${dir} has neither active/ nor complete/: name the legacy bot's parties folder.`;
}

/**
 * The files of the folder, `complete/` first (a party the legacy bot had written to `complete/`
 * but not yet taken out of `active/` is the ended one), each folder in the order of its names,
 * one file at a time (the folder of a large server is hundreds of megabytes). A value that is a
 * list (`complete/`) gives its items; any other value is one party.
 */
export function* legacyPartyFiles(dir: string): Generator<LegacyPartyFile> {
  for (const part of ['complete', 'active'] as const) {
    const folder = path.join(dir, part);
    if (!isFolder(folder)) continue;
    for (const file of readdirSync(folder).sort()) {
      const full = path.join(folder, file);
      let text: string;
      try {
        if (!statSync(full).isFile()) continue;
        text = readFileSync(full, 'utf8');
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
        yield { part, file, unreadable: `cannot be read (${code})` };
        continue;
      }
      let content: unknown;
      try {
        content = JSON.parse(text);
      } catch {
        yield { part, file, unreadable: 'not JSON' };
        continue;
      }
      if (typeof content !== 'object' || content === null || !('value' in content)) {
        yield { part, file, unreadable: 'not a record' };
        continue;
      }
      const { value } = content;
      yield { part, file, parties: Array.isArray(value) ? value : [value] };
    }
  }
}

/** A legacy active party, as far as the cleanup needs it. */
export interface LegacyActive {
  /** The file's name in `active/`. */
  file: string;
  /** `raid`, `raid train` or `meet-up` (as the legacy bot wrote it). */
  type: string;
  /** The party's channel. */
  channelId: string;
  /** The region channel it was made from, if the file says. */
  sourceChannelId: string | null;
  /** A train's or meetup's name (`trainName`, `meetupName`); null for a raid. */
  name: string | null;
  /** When it was made (`creationTime`, epoch milliseconds), if the file says. */
  createdAt: number | null;
  /** How many members signed up (its `attendees`, counted; nobody named). */
  signedUp: number;
  /** Saved with `!save-party` (`deletionTime` -1): the legacy bot never deletes it. */
  saved: boolean;
}

/**
 * Whether the channel of a legacy party stays at the cutover (Matt, 2026-10-21): a train or a
 * meetup (the legacy bot deletes one only once it has an end time, so the open ones are
 * long-lived discussion channels) and a party saved with `!save-party`. Raids are deleted.
 */
export function staysAtCutover(party: Pick<LegacyActive, 'type' | 'saved'>): boolean {
  return party.saved || party.type === 'raid train' || party.type === 'meet-up';
}

export type LegacyActiveRead =
  | {
      ok: true;
      parties: LegacyActive[];
      /** Files that were not read, and why (`not JSON`, `not a party`, `no channel`). */
      skipped: { file: string; reason: string }[];
    }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The active parties of a legacy `parties` folder (the one that holds `active/`). */
export function readLegacyActive(dir: string): LegacyActiveRead {
  const active = path.join(dir, 'active');
  if (!existsSync(active) || !statSync(active).isDirectory()) {
    return {
      ok: false,
      error: `${dir} has no folder active/: name the legacy bot's parties folder.`,
    };
  }
  const parties: LegacyActive[] = [];
  const skipped: { file: string; reason: string }[] = [];
  for (const file of readdirSync(active).sort()) {
    const full = path.join(active, file);
    if (!statSync(full).isFile()) continue;
    let content: unknown;
    try {
      content = JSON.parse(readFileSync(full, 'utf8'));
    } catch {
      skipped.push({ file, reason: 'not JSON' });
      continue;
    }
    const value = isObject(content) ? content.value : undefined;
    if (!isObject(value)) {
      skipped.push({ file, reason: 'not a party' });
      continue;
    }
    const channelId = typeof value.channelId === 'string' ? value.channelId : '';
    if (!isSnowflake(channelId)) {
      skipped.push({ file, reason: 'no channel' });
      continue;
    }
    const source = typeof value.sourceChannelId === 'string' ? value.sourceChannelId : '';
    const name = [value.trainName, value.meetupName].find((one) => typeof one === 'string');
    parties.push({
      file,
      type: typeof value.type === 'string' ? value.type : 'unknown',
      channelId,
      sourceChannelId: isSnowflake(source) ? source : null,
      name: typeof name === 'string' ? name : null,
      createdAt: Number.isFinite(value.creationTime) ? (value.creationTime as number) : null,
      signedUp: isObject(value.attendees) ? Object.keys(value.attendees).length : 0,
      saved: value.deletionTime === -1,
    });
  }
  return { ok: true, parties, skipped };
}
