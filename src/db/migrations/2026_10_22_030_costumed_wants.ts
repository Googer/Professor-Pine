import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Costumed wants (plan 8R-4; design `2026-10-22-costume-form-wants-design.md`, section 2): a
 * Pokémon want, of either table, may be for costumed sightings only. `PokemonNotification.costumed`
 * and `TargetWant.costumed` say so with 1; 0, the default, is every row from before and means
 * costumed and plain alike. A property of the row, like `PokemonNotification.type`: tokens,
 * unique keys and ids are unchanged. Read and written only through the codec of
 * `src/domain/pogo/notification-target.ts` and `TargetWantRepository`.
 *
 * The legacy bot names its columns when it reads and writes `PokemonNotification`, so it does not
 * see the new one; until the cutover it never runs on a database with such rows.
 *
 * Safe to run again after a failure half-way: a column is added only when it is missing.
 */
export const costumedWants: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    for (const table of ['PokemonNotification', 'TargetWant']) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = ${table}
          and column_name = 'costumed'`.execute(db);
      if (Number(existing.rows[0]?.n ?? 0) > 0) continue;
      await sql`alter table ${sql.table(table)} add column costumed
        tinyint(1) not null default 0`.execute(db);
    }
  },
  async down() {
    // Additive only: the columns stay.
  },
};
