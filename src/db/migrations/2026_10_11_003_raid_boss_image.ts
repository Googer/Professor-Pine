import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The address of a boss's picture, as the raid boss feed gives it (`assets.image`). The public
 * icon files cannot be worked out from a Pokémon's ids, so the feed's address is kept with the
 * boss. Null for a boss stored before this column existed, until the next sync fills it in (the first read after a restart is unconditional, so a 304 cannot
 * leave it empty).
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const raidBossImage: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'RaidBoss' and column_name = 'image'`.execute(
      db,
    );
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table RaidBoss add column image varchar(300) default null`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
