import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A want for one form of a Pokémon, and a want for its shadow raids only (plan 4A).
 *
 * `PokemonNotification.form` holds the catalogue key of the one form that is wanted
 * (`giratina_origin`); NULL, as in every row from before, means every form of the species.
 * `PokemonNotification.shadow` = 1 means shadow raids only; 0, the default, means ordinary and
 * shadow raids alike. Existing rows keep their meaning and nothing is converted. Both columns
 * are read and written only through the codec of `src/domain/pogo/notification-target.ts`.
 *
 * The legacy bot names its columns when it reads and writes this table, so it does not see
 * the two: until cutover it treats a row that has them set as a want for the whole species.
 *
 * Safe to run again after a failure half-way: a column is added only when it is missing.
 */
export const pokemonNotificationForm: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const missing = async (column: string): Promise<boolean> => {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'PokemonNotification'
          and column_name = ${column}`.execute(db);
      return Number(existing.rows[0]?.n ?? 0) === 0;
    };
    if (await missing('form')) {
      await sql`alter table PokemonNotification add column form
        varchar(100) character set utf8mb4 collate utf8mb4_0900_ai_ci default null`.execute(db);
    }
    if (await missing('shadow')) {
      await sql`alter table PokemonNotification add column shadow
        tinyint(1) not null default 0`.execute(db);
    }
  },
  async down() {
    // Additive only: the columns stay.
  },
};
