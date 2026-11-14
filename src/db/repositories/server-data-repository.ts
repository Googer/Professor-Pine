import { sql, type Kysely } from 'kysely';
import { TABLE_OWNERS } from '../server-tables.js';
import type { DB } from '../types.js';
import { GymRemovalRepository, type GymRemoval } from './gym-removal-repository.js';

/** As many rows as one statement of a deletion deletes, or one batch of parents reads. */
export const DELETE_BATCH = 1_000;

/**
 * The server's tables in the order a deletion takes them (`TABLE_OWNERS`' `server` and
 * `guild-row` tables but `GymServer`, which goes by `GymRemoval`'s rule, and `Guild`, which goes
 * last): those named by the snowflake first, then those by the `Guild` row, each before what its
 * foreign keys would otherwise set to null (a party before its region, a role before its group, a
 * gym review before its import), the Google line's rows of a gym before the gym's links.
 * `server-data-repository.test.ts` checks that it names every one of them.
 */
export const DELETION_ORDER: readonly string[] = [
  'ActivityBucket',
  'ActivityDay',
  'ActivityProgress',
  'EventForum',
  'EventPost',
  'GruntMessage',
  'HistoryOptIn',
  'LeaderboardOptIn',
  'LegacyFillIn',
  'MeetupAppeal',
  'MeetupBlock',
  'MeetupPlaceAsk',
  'MeetupPlaceRuling',
  'MeetupRequest',
  'ModerationReport',
  'PartyAudit',
  'PartyHistory',
  'PineStop',
  'PokemonNickname',
  'ServerSettingsAudit',
  'SpawnReport',
  'StopLine',
  'StopPost',
  'StopReport',
  'StopReportHistory',
  'WantCountDay',
  'ServerSettings',
  'Party',
  'PartyAccessGrant',
  'EndedPartyPost',
  'GymNotification',
  'PokemonNotification',
  'TargetWant',
  'NewTrainNotification',
  'UnownWantGift',
  'GymReview',
  'WayspotImport',
  'ServerGymLookup',
  'ServerWayspotLookup',
  'ServerWayspot',
  'GoogleUseServerDay',
  'GoogleShareRaise',
  'CommandRoleAuthorization',
  'CommandRoles',
  'AutoAssignRole',
  'Role',
  'RoleGroup',
  'Region',
];

/** What a deletion of a server's data did. */
export interface DeletedServerData {
  /**
   * The rows deleted, by table, those of a cascade uncounted (a history record's attendees, a
   * role's aliases, a region's saved routes); only tables that had any.
   */
  counts: Readonly<Record<string, number>>;
  /** The server's `Guild` row, where it still had one. */
  guildRow: number | undefined;
  /**
   * The gyms of the server: those only unlinked (other servers keep them), and those deleted with
   * their curated text (it was their last server), each by `GymRemoval`'s rule.
   */
  gyms: { unlinked: number[]; deleted: number[] };
}

/** A deletion stopped between two statements (the shutdown): the next sweep goes on with it. */
export class ServerDeletionStopped extends Error {
  constructor(readonly serverId: string) {
    super(`the deletion of server ${serverId} stopped before its end`);
    this.name = 'ServerDeletionStopped';
  }
}

/** What a deletion is told: whether to stop before its next statement. */
export interface DeletionOptions {
  isStopped?: () => boolean;
}

/** Where a test hooks into a deletion: before each table (a step that throws fails it there). */
export interface DeletionHooks {
  step?(table: string): void | Promise<void>;
}

/**
 * The deletion of what the database holds of a server (plan 19C-3; `ServerDataRepository`;
 * `MemoryServerData` in tests).
 */
export interface ServerDataStorage {
  delete(serverId: string, options?: DeletionOptions): Promise<DeletedServerData>;
}

/** The tables that hang on a table's rows without a cascade, deleted before their parents. */
const CHILDREN: ReadonlyMap<string, readonly { table: string; column: string }[]> = (() => {
  const children = new Map<string, { table: string; column: string }[]>();
  for (const [table, owner] of Object.entries(TABLE_OWNERS)) {
    if (owner.kind !== 'through' || owner.cascade) continue;
    children.set(owner.parent, [
      ...(children.get(owner.parent) ?? []),
      { table, column: owner.column },
    ]);
  }
  return children;
})();

/**
 * Everything of one server in the database (plan 19C-3; spec "Leaving"): every table the server
 * owns (`TABLE_OWNERS`), table by table in the order of `DELETION_ORDER`, each in batches of
 * `DELETE_BATCH` along an index that leads with the server (its snowflake, or its `Guild` row:
 * `server-tables.db.test.ts` checks the indexes, `server-data-repository.db.test.ts` the plans),
 * repeated until none is left; a table whose rows others hang on without a cascade (a report's
 * reasons, a region's copies of ended parties) reads a batch of its ids first and deletes theirs
 * by the children's index, then them by the primary key. Then its gyms, link by link along
 * `gymserver_guildid_index`, by `GymRemoval` (the link, and a gym no other server has with its
 * row, its curated text, and what still names it); then its `Guild` row, whose cascades take what
 * is left on it (nothing, but for the rows of a cascade further down: a history record's
 * attendees go with the record, a role's aliases with the role).
 *
 * Not one transaction: a server's history may hold hundreds of thousands of rows. Each statement
 * is its own, and each is safe to make again: after a failure, or a stop between statements
 * (`isStopped`: `ServerDeletionStopped`), the next run deletes what is left and finds nothing of
 * what went. The server is gone from Discord's point of view while it runs, and its record
 * (`ServerRecord.deletingAt`) keeps it from coming back half deleted (`ServerStandings`).
 */
export class ServerDataRepository implements ServerDataStorage {
  private readonly gymRemoval: GymRemoval;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly hooks: DeletionHooks = {},
    private readonly batch = DELETE_BATCH,
  ) {
    this.gymRemoval = new GymRemovalRepository(db);
  }

  async delete(serverId: string, options: DeletionOptions = {}): Promise<DeletedServerData> {
    const counts: Record<string, number> = {};
    const count = (table: string, rows: number): void => {
      if (rows > 0) counts[table] = (counts[table] ?? 0) + rows;
    };
    const going = async (table: string): Promise<void> => {
      if (options.isStopped?.() === true) throw new ServerDeletionStopped(serverId);
      await this.hooks.step?.(table);
    };
    // By `guild_snowflake_unique`, never the process's memory: a row made again has another id.
    const guild = await this.db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', serverId)
      .executeTakeFirst();
    const guildRow = guild?.id;
    for (const table of DELETION_ORDER) {
      const owner = TABLE_OWNERS[table];
      if (owner?.kind !== 'server' && owner?.kind !== 'guild-row') continue;
      const value = owner.kind === 'server' ? serverId : guildRow;
      if (value === undefined) continue;
      await going(table);
      const children = CHILDREN.get(table) ?? [];
      if (children.length === 0) await this.deleteAll(table, owner.column, value, count);
      else await this.deleteWithChildren(table, owner.column, value, children, count, going);
    }
    const gyms = { unlinked: [] as number[], deleted: [] as number[] };
    if (guildRow !== undefined) {
      await going('GymServer');
      for (;;) {
        const links = await this.db
          .selectFrom('GymServer')
          .select('gymId')
          .where('guildId', '=', guildRow)
          .orderBy('gymId')
          .limit(this.batch)
          .execute();
        for (const { gymId } of links) {
          // The server's routes and targets went with its regions and its members' rows above.
          const removed = await this.gymRemoval.remove(gymId, { guildId: guildRow, regionIds: [] });
          (removed.deleted ? gyms.deleted : gyms.unlinked).push(gymId);
        }
        count('GymServer', links.length);
        if (links.length < this.batch) break;
        await going('GymServer');
      }
      await going('Guild');
      const result = await this.db
        .deleteFrom('Guild')
        .where('id', '=', guildRow)
        .executeTakeFirst();
      count('Guild', Number(result.numDeletedRows));
    }
    return { counts, guildRow, gyms };
  }

  /** `delete … where column = value limit batch`, again until a statement deletes fewer. */
  private async deleteAll(
    table: string,
    column: string,
    value: string | number,
    count: (table: string, rows: number) => void,
  ): Promise<void> {
    for (;;) {
      // Table and column are `TABLE_OWNERS`' own names, never a value from outside.
      const result = await sql`
        delete from ${sql.table(table)} where ${sql.ref(column)} = ${value}
        limit ${this.batch}`.execute(this.db);
      const rows = Number(result.numAffectedRows ?? 0n);
      count(table, rows);
      if (rows < this.batch) return;
    }
  }

  /**
   * A batch of the table's ids at a time (along its server's index), their children deleted by
   * the children's index, then they by the primary key; again until none is left.
   */
  private async deleteWithChildren(
    table: string,
    column: string,
    value: string | number,
    children: readonly { table: string; column: string }[],
    count: (table: string, rows: number) => void,
    going: (table: string) => Promise<void>,
  ): Promise<void> {
    for (;;) {
      const ids = (
        await sql<{ id: string | number }>`
          select id from ${sql.table(table)} where ${sql.ref(column)} = ${value}
          limit ${this.batch}`.execute(this.db)
      ).rows.map((row) => row.id);
      if (ids.length === 0) return;
      for (const child of children) {
        const result = await sql`
          delete from ${sql.table(child.table)} where ${sql.ref(child.column)} in (${sql.join(ids)})`.execute(
          this.db,
        );
        count(child.table, Number(result.numAffectedRows ?? 0n));
      }
      const result = await sql`
        delete from ${sql.table(table)} where id in (${sql.join(ids)})`.execute(this.db);
      count(table, Number(result.numAffectedRows ?? 0n));
      if (ids.length < this.batch) return;
      await going(table);
    }
  }
}
