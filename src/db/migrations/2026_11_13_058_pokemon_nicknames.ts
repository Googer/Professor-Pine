import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import { keyForLegacyName } from '../../domain/pogo/legacy-names.js';
import { tidyNickname } from '../../domain/pogo/nickname-rules.js';

/** How many rows one insert of the copy writes. */
const COPY_BATCH = 500;

/**
 * The legacy rows' nicknames by catalogue key, as `PokemonRepository` read them until plan 19B-4:
 * the comma-joined `Pokemon.nickname` of every row with a name, tidied (`tidyNickname`), several
 * rows of one Pokémon together under `keyForLegacyName` of their names, each nickname once. Rows
 * that are no Pokémon (production has `ex`, `perfect`, `zero`) come along; the search leaves out
 * keys the catalogue does not know, as it did.
 */
function legacyNicknames(rows: readonly { name: string | null; nickname: string | null }[]) {
  const byKey = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.name === null || row.nickname === null) continue;
    const key = keyForLegacyName(row.name);
    for (const part of row.nickname.split(',')) {
      const nickname = tidyNickname(part);
      if (nickname === '') continue;
      byKey.set(key, (byKey.get(key) ?? new Set()).add(nickname));
    }
  }
  return byKey;
}

/**
 * Pokémon nicknames per server (plan 19B-4; spec `2026-11-12-multi-server-instance-design.md`,
 * "Gyms, stops and Wayspots per server": a server's staff add their own): one row per server,
 * Pokémon (its catalogue key) and nickname (tidied: trimmed, one space between words, lower
 * case), the primary key leading with the server, which serves the search's reads of a server's
 * nicknames. The two text columns compare as the code does (`utf8mb4_bin`).
 *
 * At the upgrade every server recorded (`Guild` rows) starts with the nicknames the legacy column
 * `Pokemon.nickname` held, copied to each in one transaction, and only while the table is empty
 * (made now, or a copy that failed before): from then on nothing writes `Pokemon.nickname`, which
 * 2.0, going back, reads as it was at the upgrade.
 *
 * Safe to run again after a failure half-way: the table is made only when missing, and the copy
 * is all or nothing.
 */
export const pokemonNicknames: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists PokemonNickname (
        serverId varchar(20) not null,
        pokemonKey varchar(100) collate utf8mb4_bin not null,
        nickname varchar(255) collate utf8mb4_bin not null,
        primary key (serverId, pokemonKey, nickname)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    // Empty unless the copy below went through already (a run again after a failure later on).
    const held = await sql<{ n: number }>`
      select count(*) as n from (select 1 from PokemonNickname limit 1) as one`.execute(db);
    if (Number(held.rows[0]?.n ?? 0) > 0) return;
    // Both tables are small by their nature: the legacy list of Pokémon, the servers recorded.
    const legacy = await sql<{ name: string | null; nickname: string | null }>`
      select name, nickname from Pokemon where name is not null order by id`.execute(db);
    const servers = await sql<{ snowflake: string }>`
      select snowflake from Guild where snowflake is not null order by id`.execute(db);
    const copies: { serverId: string; pokemonKey: string; nickname: string }[] = [];
    for (const [pokemonKey, nicknames] of legacyNicknames(legacy.rows)) {
      for (const nickname of nicknames) {
        for (const { snowflake } of servers.rows) {
          copies.push({ serverId: String(snowflake), pokemonKey, nickname });
        }
      }
    }
    if (copies.length === 0) return;
    await db.transaction().execute(async (trx) => {
      for (let at = 0; at < copies.length; at += COPY_BATCH) {
        await trx
          .insertInto('PokemonNickname')
          .values(copies.slice(at, at + COPY_BATCH))
          .execute();
      }
    });
  },
  async down() {
    // Additive only: the table stays.
  },
};
