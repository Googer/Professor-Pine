import { existsSync, statSync } from 'node:fs';
import { sql, type Kysely } from 'kysely';
import { HistoryRepository, type RecordsWritten } from '../db/repositories/history-repository.js';
import type { DB } from '../db/types.js';
import {
  LEGACY_SKIPS,
  legacyBossResolver,
  legacyIdentity,
  legacyRecord,
  type LegacyContext,
  type LegacySkip,
} from '../domain/history/legacy-party.js';
import { legacyIndexEntries, writeIndexEntry } from '../domain/history/legacy-index.js';
import type { HistoryRecord } from '../domain/history/party-history.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { indexModesOf, writeServerIndex } from './legacy-index.js';
import { legacyFolderProblem, legacyPartyFiles } from './legacy-parties.js';

/** As many records as one transaction writes. */
const BATCH = 1_000;
/** How often the import says how far it got, in parties read. */
const PROGRESS_EVERY = 25_000;

/** What an import did, in counts (it never says anything of a party itself). */
export interface ImportCounts {
  /** Files read, and those that could not be, by why. */
  files: { complete: number; active: number; unreadable: Record<string, number> };
  /** Parties in the files that could be read. */
  read: number;
  imported: number;
  /** Found in the history already (an import before this one). */
  alreadyThere: number;
  /** The same party a second time in the files (the legacy bot stored some twice). */
  duplicates: number;
  skipped: Partial<Record<LegacySkip, number>>;
  /** Records the database refused, also one by one (their batch failed). */
  writeFailed: number;
  /** Imported without a region: their region channel is no region now. */
  withoutRegion: number;
  /** Of those, put in the fallback server (`--server`, or the one of the other regions). */
  byFallback: number;
  /** Imported raids and train stops at a gym the gym list no longer has (or not matched). */
  gymsGone: number;
  /** Imported raids whose boss the catalogue did not find, kept by the name the file gave. */
  bossesByName: number;
  /** Those names, each once, sorted. */
  bossNames: string[];
  /**
   * The member index it wrote (plan 8H-10), where it was given a folder: per server it replaced,
   * how many members have a file and how many entries they hold; `leftOut`, the attendees'
   * places it did not index because the history holds the party otherwise (H1).
   */
  index?: IndexCounts;
}

export interface IndexCounts {
  servers: { serverId: string; members: number; entries: number }[];
  leftOut: number;
  /**
   * Where no server's index was replaced (A4): parties the database refused, files that could not
   * be read (what either held could be anybody's, so the old index stays whole).
   */
  kept?: { notWritten: number; unreadable: number };
  /** The servers whose index could not be written, with the file system's code (A3). */
  failed: { serverId: string; code: string }[];
}

/** Where the records go (`HistoryRepository`; a test gives one that fails as it needs). */
export interface RecordWriter {
  insertRecords(records: readonly HistoryRecord[]): Promise<RecordsWritten>;
}

export interface ImportOptions {
  /** The legacy bot's `parties/` folder (with `active/` and `complete/`). */
  dir: string;
  db: Kysely<DB>;
  catalogue: PokemonCatalogue;
  /** The server (snowflake) of a party whose region is gone; else the one of the files' regions. */
  server?: string;
  batchSize?: number;
  /** Told how far it got now and then. */
  progress?: (line: string) => void;
  history?: RecordWriter;
  now?: number;
  /**
   * The member index's folder (`LEGACY_INDEX_DIR`, plan 8H-10): the index of each server the run
   * found members of is rebuilt there whole. None: no index is written.
   */
  indexDir?: string;
}

/** A record read, with who the files name in it: kept for the batch only, for the index. */
interface ReadRecord {
  record: HistoryRecord;
  attendeeIds: (string | null)[];
  reporterId: string | null;
}

/** Whether the database is one taken over from the legacy bot, whose gym ids the files name. */
async function takenOver(db: Kysely<DB>): Promise<boolean> {
  const found = await sql<{ n: number }>`
    select count(*) as n from information_schema.tables
    where table_schema = database() and table_name = 'knex_migrations'`.execute(db);
  return Number(found.rows[0]?.n ?? 0) > 0;
}

/**
 * Imports the legacy bot's parties into the party history (plan 8H, T4): the ended raids of
 * `complete/` and the parties of `active/` that were going on at the cutover (`legacyRecord`),
 * without any member id. Best effort and idempotent: what cannot be read is counted and left,
 * and a party the history has already (by its key) is not written again.
 *
 * Two passes over the folder: the first learns which region channels the files name (the
 * fallback server is the one server of those that are regions now, unless `server` says) and,
 * of a party the files hold twice, which copy was deleted last; the second writes, in batches of
 * one transaction each, so a stop half-way leaves whole batches that a second run skips. A batch
 * the database refuses is written again record by record, and a record it still refuses is
 * counted (`writeFailed`) and left for a later run.
 */
export async function importLegacyHistory(options: ImportOptions): Promise<ImportCounts> {
  const { dir, db } = options;
  const problem = legacyFolderProblem(dir);
  if (problem !== undefined) throw new Error(problem);
  const batchSize = options.batchSize ?? BATCH;
  const history = options.history ?? new HistoryRepository(db);

  const regions = new Map<string, { regionId: number; serverId: string }>();
  const rows = await db
    .selectFrom('Region as r')
    .innerJoin('Guild as g', 'g.id', 'r.guildId')
    .select(['r.id', 'r.channelId', 'g.snowflake'])
    .execute();
  for (const row of rows) {
    if (row.channelId !== null && row.snowflake !== null) {
      regions.set(row.channelId, { regionId: row.id, serverId: row.snowflake });
    }
  }
  if (options.server !== undefined) {
    const known = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', options.server)
      .executeTakeFirst();
    if (!known) throw new Error(`There is no server ${options.server} in the database.`);
  }
  const gyms = (await takenOver(db))
    ? new Set((await db.selectFrom('Gym').select('id').execute()).map((row) => row.id))
    : new Set<number>();

  // The first pass: the regions the files name, and the copy of a party that was deleted last.
  const named = new Set<string>();
  const latest = new Map<string, number>();
  for (const file of legacyPartyFiles(dir)) {
    if ('unreadable' in file) continue;
    for (const party of file.parties) {
      const identity = legacyIdentity(party);
      if (!identity) continue;
      if (identity.sourceChannelId !== null) named.add(identity.sourceChannelId);
      latest.set(identity.key, Math.max(latest.get(identity.key) ?? -1, identity.deletionTime));
    }
  }
  const servers = new Set(
    [...named].flatMap((channelId) => {
      const region = regions.get(channelId);
      return region ? [region.serverId] : [];
    }),
  );
  const fallbackServerId = options.server ?? (servers.size === 1 ? [...servers][0] : undefined);

  const boss = legacyBossResolver(options.catalogue);
  const counts: ImportCounts = {
    files: { complete: 0, active: 0, unreadable: {} },
    read: 0,
    imported: 0,
    alreadyThere: 0,
    duplicates: 0,
    skipped: {},
    writeFailed: 0,
    withoutRegion: 0,
    byFallback: 0,
    gymsGone: 0,
    bossesByName: 0,
    bossNames: [],
  };
  const names = new Set<string>();
  const taken = new Set<string>();
  // The member index, per server and member: their entries' lines (compact: a large server's
  // members hold over a million), only where a folder was given.
  const index =
    options.indexDir === undefined ? undefined : new Map<string, Map<string, string[]>>();
  const places = new HistoryRepository(db);
  let leftOut = 0;
  /**
   * The index entries of a batch: from the records as the history holds them now (written by
   * this run or an earlier one; the server is the stored record's), so that an entry names only a
   * place the fill-in will find as the files tell it. A record the history does not hold (not
   * written) gives none.
   */
  const indexBatch = async (read: readonly ReadRecord[]) => {
    if (index === undefined) return;
    const held = await places.legacyPlaces(read.map((one) => one.record.legacyKey ?? ''));
    for (const one of read) {
      const stored = held.get(one.record.legacyKey ?? '');
      if (stored === undefined) continue;
      const found = legacyIndexEntries(one, stored.places);
      leftOut += found.leftOut;
      if (found.entries.length === 0) continue;
      let members = index.get(stored.serverId);
      if (members === undefined) {
        members = new Map();
        index.set(stored.serverId, members);
      }
      for (const [memberId, entry] of found.entries) {
        const lines = members.get(memberId);
        if (lines === undefined) members.set(memberId, [writeIndexEntry(entry)]);
        else lines.push(writeIndexEntry(entry));
      }
    }
  };
  let batch: ReadRecord[] = [];
  /** Writes the batch and counts what it did; a refused batch record by record. */
  const flush = async () => {
    if (batch.length === 0) return;
    const read = batch;
    const records = read.map((one) => one.record);
    batch = [];
    try {
      const written = await history.insertRecords(records);
      counts.imported += written.inserted;
      counts.alreadyThere += written.existing;
    } catch {
      for (const record of records) {
        try {
          const written = await history.insertRecords([record]);
          counts.imported += written.inserted;
          counts.alreadyThere += written.existing;
        } catch {
          counts.writeFailed += 1;
        }
      }
    }
    await indexBatch(read);
  };

  for (const file of legacyPartyFiles(dir)) {
    counts.files[file.part] += 1;
    if ('unreadable' in file) {
      counts.files.unreadable[file.unreadable] =
        (counts.files.unreadable[file.unreadable] ?? 0) + 1;
      continue;
    }
    const context: LegacyContext = {
      part: file.part,
      regionOf: (channelId) => regions.get(channelId),
      fallbackServerId,
      gymExists: (id) => gyms.has(id),
      boss,
      now: options.now ?? Date.now(),
    };
    for (const party of file.parties) {
      counts.read += 1;
      if (counts.read % PROGRESS_EVERY === 0) {
        options.progress?.(`… ${counts.read.toLocaleString('en-US')} parties read`);
      }
      const identity = legacyIdentity(party);
      if (identity) {
        // Of two copies of a party only the one deleted last is taken (the first such).
        if (taken.has(identity.key) || identity.deletionTime !== latest.get(identity.key)) {
          counts.duplicates += 1;
          continue;
        }
      }
      const read = legacyRecord(party, context);
      if (!read.ok) {
        counts.skipped[read.reason] = (counts.skipped[read.reason] ?? 0) + 1;
        continue;
      }
      const { record } = read;
      taken.add(record.legacyKey ?? '');
      if (record.regionId === null) counts.withoutRegion += 1;
      if (read.byFallback) counts.byFallback += 1;
      if (record.legacyGymId !== null && record.gymId === null) counts.gymsGone += 1;
      counts.gymsGone += record.stops.filter((stop) => stop.gymId === null).length;
      if (record.boss !== null && 'name' in record.boss) {
        counts.bossesByName += 1;
        names.add(record.boss.name);
      }
      batch.push({ record, attendeeIds: read.attendeeIds, reporterId: read.reporterId });
      if (batch.length >= batchSize) await flush();
    }
  }
  await flush();
  counts.bossNames = [...names].sort();
  if (index !== undefined && options.indexDir !== undefined) {
    const unreadable = Object.values(counts.files.unreadable).reduce((sum, one) => sum + one, 0);
    if (counts.writeFailed > 0 || unreadable > 0) {
      // A party not written, or a file not read, may be some member's: the new index would lose
      // their entries, so the old one stays whole until a run reads and writes everything (A4).
      counts.index = {
        servers: [],
        leftOut,
        kept: { notWritten: counts.writeFailed, unreadable },
        failed: [],
      };
      return counts;
    }
    // Only the servers this run found members of: another server's index stays as it is (H11).
    const modes = indexModesOf(dir);
    const servers: IndexCounts['servers'] = [];
    const failed: IndexCounts['failed'] = [];
    for (const [serverId, members] of [...index].sort(([a], [b]) => a.localeCompare(b))) {
      try {
        writeServerIndex(options.indexDir, serverId, members, modes);
      } catch (err) {
        // Said by the server and the code alone (A3): the path is the operator's host's.
        failed.push({ serverId, code: (err as NodeJS.ErrnoException).code ?? 'unknown' });
        continue;
      }
      let entries = 0;
      for (const lines of members.values()) entries += lines.length;
      servers.push({ serverId, members: members.size, entries });
    }
    counts.index = { servers, leftOut, failed };
  }
  return counts;
}

const SKIP_WORDS: Readonly<Record<LegacySkip, string>> = {
  'not-a-party': 'not a party',
  'unknown-kind': 'of a kind it does not know',
  'no-creation-time': 'without a creation time',
  'no-channel': 'without a channel',
  'no-creator': 'without a maker (active/)',
  'no-attendees': 'without attendees (active/)',
  'no-server': 'of no known server',
};

const n = (value: number): string => value.toLocaleString('en-US');

/** What an import did, in a few lines for the operator. `ms`: how long it took. */
export function importReport(counts: ImportCounts, ms: number): string[] {
  const skipped = LEGACY_SKIPS.filter((reason) => (counts.skipped[reason] ?? 0) > 0).map(
    (reason) => `${n(counts.skipped[reason] ?? 0)} ${SKIP_WORDS[reason]}`,
  );
  const unreadable = Object.entries(counts.files.unreadable);
  const failed = unreadable.reduce((sum, [, count]) => sum + count, 0);
  const why = unreadable.map(([reason, count]) => `${n(count)} ${reason}`).join(', ');
  const named = counts.bossNames.length;
  return [
    `Read ${n(counts.files.complete)} files of complete/ and ${n(counts.files.active)} of active/; ${n(failed)} could not be read${failed > 0 ? ` (${why})` : ''}.`,
    `Parties read: ${n(counts.read)}. Imported: ${n(counts.imported)}. Already there: ${n(counts.alreadyThere)}. In the files twice: ${n(counts.duplicates)}. Not written: ${n(counts.writeFailed)}.`,
    skipped.length === 0 ? 'Skipped: none.' : `Skipped: ${skipped.join(', ')}.`,
    `Without their region: ${n(counts.withoutRegion)} (put in the server of the other regions: ${n(counts.byFallback)}). At a gym no longer in the gym list: ${n(counts.gymsGone)}. Boss kept by its name: ${n(counts.bossesByName)} (${n(named)} ${named === 1 ? 'name' : 'names'}).`,
    ...indexReport(counts.index),
    `Took ${(ms / 1000).toFixed(1)} s.`,
  ];
}

/** The member index's lines: counts only (H16), a line per server it rebuilt. */
function indexReport(index: IndexCounts | undefined): string[] {
  if (index === undefined) return [];
  if (index.kept !== undefined) {
    const { notWritten, unreadable } = index.kept;
    const why = [
      ...(notWritten > 0
        ? [`${n(notWritten)} ${notWritten === 1 ? 'party' : 'parties'} not written`]
        : []),
      ...(unreadable > 0
        ? [`${n(unreadable)} ${unreadable === 1 ? 'file' : 'files'} could not be read`]
        : []),
    ].join(', ');
    return [`Member index kept as it was: ${why}.`];
  }
  const failed = index.failed.map(
    (one) => `Could not write the member index of server ${one.serverId} (${one.code}).`,
  );
  const servers = index.servers.map(
    (server) =>
      `Member index: ${n(server.members)} ${server.members === 1 ? 'member' : 'members'} of server ${server.serverId} (${n(server.entries)} ${server.entries === 1 ? 'entry' : 'entries'}).`,
  );
  const lines =
    servers.length === 0 && failed.length === 0
      ? ['Member index: no member of any server.']
      : servers;
  if (index.leftOut === 0 || lines.length === 0) return [...lines, ...failed];
  const left = `Left out: ${n(index.leftOut)} ${index.leftOut === 1 ? 'place' : 'places'} the history holds otherwise.`;
  return [...lines.slice(0, -1), `${lines.at(-1) ?? ''} ${left}`, ...failed];
}

export interface ImportStepDeps {
  db: Kysely<DB>;
  /** The game data's catalogue, loaded only once the folder and the database are known good. */
  loadCatalogue: () => Promise<PokemonCatalogue>;
  say: (line: string) => void;
  now?: () => number;
  /** The member index's folder (`LEGACY_INDEX_DIR`); undefined (blank) writes none. */
  indexDir?: string;
}

const USAGE = "Usage: history-import <the legacy bot's parties folder> [--server <server id>]";

/**
 * The command (`npm run history:import`, `./pine import-history`): `<folder> [--server <id>]`.
 * Answers its exit code: 0 done, 1 refused or failed (said why), 2 used wrongly.
 */
export async function importStep(args: readonly string[], deps: ImportStepDeps): Promise<number> {
  const { db, say } = deps;
  const now = deps.now ?? (() => Date.now());
  const [dir, ...rest] = args;
  let server: string | undefined;
  if (rest.length === 2 && rest[0] === '--server' && /^\d{15,20}$/u.test(rest[1] ?? '')) {
    server = rest[1];
  } else if (rest.length > 0) {
    say(USAGE);
    return 2;
  }
  if (dir === undefined || dir.startsWith('-')) {
    say(USAGE);
    return 2;
  }
  const problem = legacyFolderProblem(dir);
  if (problem !== undefined) {
    say(problem);
    return 1;
  }
  const { indexDir } = deps;
  if (indexDir !== undefined && !(existsSync(indexDir) && statSync(indexDir).isDirectory())) {
    say(
      `There is no folder ${indexDir} for the member index (LEGACY_INDEX_DIR): make it, or leave LEGACY_INDEX_DIR blank.`,
    );
    return 1;
  }
  const tables = await sql<{ n: number }>`
    select count(*) as n from information_schema.tables
    where table_schema = database() and table_name = 'PartyHistory'`.execute(db);
  if (Number(tables.rows[0]?.n ?? 0) === 0) {
    say(
      'The database has no party history yet: run the migrations first (./pine migrate, or npm run migrate).',
    );
    return 1;
  }
  const catalogue = await deps.loadCatalogue();
  say(`Importing the legacy parties of ${dir} into the party history.`);
  if (indexDir === undefined) {
    say(
      'LEGACY_INDEX_DIR is not set: no member index is written, so members cannot add their old-bot history.',
    );
  }
  const started = now();
  let counts: ImportCounts;
  try {
    counts = await importLegacyHistory({
      dir,
      db,
      catalogue,
      ...(server === undefined ? {} : { server }),
      ...(indexDir === undefined ? {} : { indexDir }),
      progress: say,
      now: started,
    });
  } catch (err) {
    say(err instanceof Error ? err.message : String(err));
    return 1;
  }
  for (const line of importReport(counts, now() - started)) say(line);
  const files = counts.files.complete + counts.files.active;
  const unreadable = Object.values(counts.files.unreadable).reduce((sum, count) => sum + count, 0);
  if (files > 0 && unreadable === files) {
    say('No file of the folder could be read: nothing was imported.');
    return 1;
  }
  // A server's index that could not be written fails the run, after its report (A3).
  return counts.writeFailed > 0 || (counts.index?.failed.length ?? 0) > 0 ? 1 : 0;
}
