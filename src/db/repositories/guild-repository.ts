import type { Kysely } from 'kysely';
import type { DB } from '../types.js';
import { RowIds } from './row-ids.js';

/** What guild syncing needs; lets tests use an in-memory fake. */
export interface GuildStore {
  /** Creates the guild's row if it is missing and returns its id. */
  ensure(snowflake: string): Promise<number>;
  remove(snowflake: string): Promise<void>;
}

/**
 * The Guild table: one row per Discord server the bot is in. With `ids` (the process's memory
 * of rows it has seen) a server's row id is asked for once. The row can be deleted behind this
 * process (the legacy bot does when it leaves a server), so `ensure` never trusts the memory:
 * it is what puts it right (`RowIds`).
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
    if (!this.db.isTransaction) this.ids.sawGuild(snowflake, row.id);
    return row.id;
  }

  /** Deleting a guild cascades to its regions, roles and notifications. */
  async remove(snowflake: string): Promise<void> {
    // Forgotten before and after: a look-up that runs beside the deletion may see the row.
    this.ids.forgetGuild(snowflake);
    await this.db.deleteFrom('Guild').where('snowflake', '=', snowflake).execute();
    this.ids.forgetGuild(snowflake);
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
    if (snowflake !== undefined && !this.db.isTransaction) this.ids.sawGuild(snowflake, id);
    return snowflake;
  }

  /**
   * The servers that have a row: those the bot is in, as the table has them (a row is made at
   * each start and when the bot joins a server, and deleted when it leaves one). For what must
   * know the servers before the login, when the client has none yet (the line that waits for
   * Google ranks its regions at start, plan 8Z-2).
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
    if (row && !this.db.isTransaction) this.ids.sawGuild(snowflake, row.id);
    return row?.id;
  }
}
