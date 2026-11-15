import { sql, type Kysely } from 'kysely';
import type { DB } from '../types.js';
import { RowIds } from './row-ids.js';

/** What guild syncing needs; lets tests use an in-memory fake. */
export interface GuildStore {
  /** Creates the guild's row if it is missing and returns its id. */
  ensure(snowflake: string): Promise<number>;
  /** Creates the rows of those servers that lack one, in chunks (`ensure` for many). */
  ensureAll(snowflakes: readonly string[]): Promise<void>;
}

/** As many servers as one statement of `ensureAll` writes and reads back. */
export const GUILD_CHUNK = 500;

/**
 * The Guild table: one row per Discord server the bot is in or was in. Since plan 19C-1 a server
 * that removes Pine keeps its row (it is marked left in `ServerRecord`), so that one that adds
 * it back keeps its row id and everything hanging on it; plan 19C-3 deletes the rows of servers
 * left more than 30 days. With `ids` (the process's memory of rows it has seen) a server's row
 * id is asked for once. The row can be deleted behind this process (the legacy bot does when it
 * leaves a server), so `ensure` never trusts the memory: it is what puts it right (`RowIds`).
 */
export class GuildRepository implements GuildStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly ids: RowIds = RowIds.none,
  ) {}

  /**
   * Always writes and reads, whatever is remembered: this runs for every server at each start
   * and when the bot joins one, and is where a row that was deleted and made again behind the
   * process gets its new id into the memory.
   */
  async ensure(snowflake: string): Promise<number> {
    await this.db
      .insertInto('Guild')
      .values({ snowflake })
      .onDuplicateKeyUpdate({ snowflake })
      .execute();
    const row = await this.db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', snowflake)
      .executeTakeFirst();
    if (!row) {
      this.ids.forgetGuild(snowflake);
      throw new Error(`Guild row for ${snowflake} vanished after insert`);
    }
    this.ids.knowGuildRow(snowflake, row.id);
    if (!this.db.isTransaction) this.ids.sawGuild(snowflake, row.id);
    return row.id;
  }

  /**
   * `ensure` for many servers (19D fix round 1, F3: a shard's ready records up to 2,500): per
   * chunk of `GUILD_CHUNK`, one insert of every row with a no-op on a duplicate, then one read of
   * their ids, remembered as `ensure` remembers them. Every chunk is tried; the first failure is
   * thrown after the others.
   */
  async ensureAll(snowflakes: readonly string[]): Promise<void> {
    const unique = [...new Set(snowflakes)];
    let failure: Error | undefined;
    for (let start = 0; start < unique.length; start += GUILD_CHUNK) {
      const chunk = unique.slice(start, start + GUILD_CHUNK);
      try {
        await this.db
          .insertInto('Guild')
          .values(chunk.map((snowflake) => ({ snowflake })))
          .onDuplicateKeyUpdate({ snowflake: sql`snowflake` })
          .execute();
        const rows = await this.db
          .selectFrom('Guild')
          .select(['id', 'snowflake'])
          .where('snowflake', 'in', chunk)
          .execute();
        for (const row of rows)
          if (row.snowflake !== null) this.ids.knowGuildRow(row.snowflake, row.id);
        if (this.db.isTransaction) continue;
        for (const row of rows)
          if (row.snowflake !== null) this.ids.sawGuild(row.snowflake, row.id);
      } catch (err) {
        failure ??= err instanceof Error ? err : new Error(String(err));
      }
    }
    if (failure !== undefined) throw failure;
  }

  /** The snowflake of the server with this row id: parties and regions name a server by its row. */
  async snowflakeOf(id: number): Promise<string | undefined> {
    const seen = this.ids.guildSnowflake(id);
    if (seen !== undefined) return seen;
    const row = await this.db
      .selectFrom('Guild')
      .select('snowflake')
      .where('id', '=', id)
      .executeTakeFirst();
    const snowflake = row?.snowflake ?? undefined;
    if (snowflake !== undefined) this.ids.knowGuildRow(snowflake, id);
    if (snowflake !== undefined && !this.db.isTransaction) this.ids.sawGuild(snowflake, id);
    return snowflake;
  }

  /**
   * Makes the server of every row known (`RowIds.serverOfRow`; fix round 1, K1): read once at
   * start, before the parties are loaded, so that a party's server, and so its zone, is known
   * from its first moment on, whatever the bounded memory of seen rows holds. A whole read, at
   * start: one row per server, bounded small by nature.
   */
  async loadRows(): Promise<void> {
    const rows = await this.db.selectFrom('Guild').select(['id', 'snowflake']).execute();
    for (const row of rows)
      if (row.snowflake !== null) this.ids.knowGuildRow(row.snowflake, row.id);
  }

  /**
   * The servers that have a row: those the bot is in or was in, as the table has them (a row is
   * made at each start and when the bot joins a server, and kept when it leaves one, plan
   * 19C-1). For what must know the servers before the login, when the client has none yet (the
   * line that waits for Google ranks its regions at start, plan 8Z-2), and the check of who is in
   * at every ready (`ServerAdmission`, the servers Pine was in). A whole read: one row per
   * server, bounded small by nature.
   */
  async snowflakes(): Promise<string[]> {
    const rows = await this.db.selectFrom('Guild').select('snowflake').orderBy('id').execute();
    return rows.flatMap((row) => (row.snowflake === null ? [] : [row.snowflake]));
  }

  /** The row id of a server; undefined (and asked again the next time) while it has no row. */
  async idFor(snowflake: string): Promise<number | undefined> {
    const seen = this.ids.guild(snowflake);
    if (seen !== undefined) return seen;
    const row = await this.db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', snowflake)
      .executeTakeFirst();
    if (row) this.ids.knowGuildRow(snowflake, row.id);
    if (row && !this.db.isTransaction) this.ids.sawGuild(snowflake, row.id);
    return row?.id;
  }
}
