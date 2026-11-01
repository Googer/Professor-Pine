import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import type { Logger } from '../../log.js';

/** The name of the unique key on a region's channel. */
export const REGION_CHANNEL_KEY = 'region_channelid_unique';
/** The name of the index by which the forums of a server's parties are listed. */
export const PARTY_FORUM_INDEX = 'party_guildid_forumchannelid_index';

/**
 * One region per channel (plan 5B; Matt, 2026-10-13): a unique key on `Region.channelId`.
 *
 * A region is its channel, and nothing ever kept two rows from naming the same one. Everything
 * of this bot that looks a region up by its channel takes the oldest row (`orderBy('id')`, and
 * in memory the first of the rows read in that order), and the newer row of a channel is not
 * used: it is there, but it is no region of its own. The key is added only where no two rows
 * share a channel (production: 28 rows, no duplicate; looked at on 2026-10-13). Where
 * duplicates exist the key is left out and the bot works as before: a migration must not
 * decide which of two regions to drop. That is said in the log at every start
 * (`warnOfSharedChannels`) until somebody has put it right by hand: the newer rows deleted, and
 * the key added (this migration counts as run, and is not run again). Rows without a channel
 * are no obstacle: a unique key allows any number of NULLs.
 *
 * The legacy bot's `insertIfAbsent('Region', { channelId, guildId })` looks before it inserts
 * and keeps working under the key.
 *
 * With it, an index on `Party (guildId, forumChannelId)`: the forums that the parties of a
 * server name are listed by it (`PartyRepository.partyForums`), also for a forum whose region
 * is gone.
 *
 * Safe to run again after a failure half-way: a key or an index that exists is left alone.
 */
export const regionChannelUnique: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const has = (table: string, index: string) => hasIndex(db, table, index);
    if (!(await has('Party', PARTY_FORUM_INDEX))) {
      await sql`alter table Party add index ${sql.ref(PARTY_FORUM_INDEX)} (guildId, forumChannelId)`.execute(
        db,
      );
    }
    if (await has('Region', REGION_CHANNEL_KEY)) return;
    const shared = await sql<{ channelId: string }>`
      select channelId from Region where channelId is not null
      group by channelId having count(*) > 1 limit 1`.execute(db);
    if (shared.rows.length > 0) return;
    await sql`alter table Region add unique key ${sql.ref(REGION_CHANNEL_KEY)} (channelId)`.execute(
      db,
    );
  },
  async down() {
    // Additive only: the key stays.
  },
};

/** Whether a table of the current database has an index (or a key) of this name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
async function hasIndex(db: Kysely<any>, table: string, index: string): Promise<boolean> {
  const found = await sql<{ n: number }>`
    select count(*) as n from information_schema.statistics
    where table_schema = database() and table_name = ${table}
      and index_name = ${index}`.execute(db);
  return Number(found.rows[0]?.n ?? 0) > 0;
}

/**
 * Says in the log, as a warning, when migration 011 had to leave the unique key on
 * `Region.channelId` out: how many channels have more than one region row (never which). Run
 * after the migrations at every start; silent when the key is there.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
export async function warnOfSharedChannels(db: Kysely<any>, log: Logger): Promise<void> {
  if (await hasIndex(db, 'Region', REGION_CHANNEL_KEY)) return;
  const shared = await sql<{ n: number }>`
    select count(*) as n from (
      select channelId from Region where channelId is not null
      group by channelId having count(*) > 1) as shared`.execute(db);
  const sharedChannels = Number(shared.rows[0]?.n ?? 0);
  if (sharedChannels === 0) return;
  log.warn(
    { sharedChannels },
    'Region has no unique key on channelId: some channels have several region rows, of which ' +
      'only the oldest is used. Delete the newer rows by hand, then add the key: alter table ' +
      `Region add unique key ${REGION_CHANNEL_KEY} (channelId)`,
  );
}
