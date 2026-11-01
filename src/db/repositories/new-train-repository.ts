import { sql, type Kysely } from 'kysely';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/**
 * Who asked to be told of new trains, per member and server (`ctx.newTrains`); lets tests keep
 * it in memory. A member and a server are named by their snowflakes.
 */
export interface NewTrainStorage {
  /** Whether the member asked to be told of new trains in this server. */
  isOn(memberId: string, guildId: string): Promise<boolean>;
  /**
   * Switches it on or off for the member in this server; true when that changed anything
   * (false when it was so already). `now` is when, for a row that is made.
   */
  set(memberId: string, guildId: string, on: boolean, now: number): Promise<boolean>;
  /**
   * The read by event: the snowflakes of the members who asked to be told of new trains in
   * this server, oldest first.
   */
  wanting(guildId: string): Promise<string[]>;
}

/**
 * The `NewTrainNotification` table: a row per member and server that is on, none for off. The
 * primary key is the server's row and the member, so `wanting` reads one server's rows from
 * the key, and two switches at once make one row. The legacy column `User.newTrain` is not
 * touched: the migration that made this table copied it once.
 */
export class NewTrainRepository implements NewTrainStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async isOn(memberId: string, guildId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('NewTrainNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .select('n.memberId')
      .where('g.snowflake', '=', guildId)
      .where('n.memberId', '=', memberId)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Written in one transaction, or in the caller's when `db` is one (`inTransaction`). */
  set(memberId: string, guildId: string, on: boolean, now: number): Promise<boolean> {
    return inTransaction(this.db, async (trx) => {
      if (!on) {
        const gone = await sql`
          delete n from NewTrainNotification n
          inner join Guild g on g.id = n.guildId
          where g.snowflake = ${guildId} and n.memberId = ${memberId}`.execute(trx);
        return Number(gone.numAffectedRows ?? 0) > 0;
      }
      // The bot records a server when it joins it; this is for a row that went missing. Looked
      // for first: an insert that finds the row uses up an id all the same.
      const guild = await trx
        .selectFrom('Guild')
        .select('id')
        .where('snowflake', '=', guildId)
        .executeTakeFirst();
      if (!guild) {
        await trx
          .insertInto('Guild')
          .values({ snowflake: guildId })
          .onDuplicateKeyUpdate({ snowflake: guildId })
          .execute();
      }
      // The server by its row, in the one statement. On already: the row stays as it is and no
      // row counts as changed (`insert ignore`; with `on duplicate key update` the driver,
      // which asks for found rows, counts the row that was there).
      const made = await sql`
        insert ignore into NewTrainNotification (guildId, memberId, createdAt)
        select id, ${memberId}, ${String(now)} from Guild where snowflake = ${guildId}`.execute(
        trx,
      );
      return Number(made.numAffectedRows ?? 0) > 0;
    });
  }

  async wanting(guildId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('NewTrainNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .select('n.memberId')
      .where('g.snowflake', '=', guildId)
      .orderBy('n.createdAt')
      .orderBy('n.memberId')
      .execute();
    return rows.map((row) => row.memberId);
  }
}
