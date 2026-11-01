import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Power spots as stops of a train in the party history (plan 8X-4; design
 * `2026-10-20-max-battles-design.md`, 6.2, section 10): `PartyHistoryStop.wayspotId`, the Wayfarer
 * id of a power spot the train stopped at (`varchar(40)`: an id is 35 or 36 characters), null for
 * a gym's stop and for every stop before. No foreign key: a Wayspot an import deleted or made a
 * gym stays named by its id, as a gym deleted later does. And `PartyHistory.trainKind`
 * (`varchar(10)`): what a train went to, `raid`, `dynamax` or `gigantamax`; null for every party
 * that is no train. The trains recorded before are set to `raid` (they all were: the kinds came
 * with 8X-4); nothing else is changed.
 *
 * 026: after 8X-3's `025_max_battle_history` (the newest of `typescript-migration` on
 * 2026-10-21; `wayfarer`'s newest is 024). A 026 of `wayfarer` merged first renumbers this one.
 *
 * Safe to run again after a failure half-way: each column is added only when it is missing, and
 * the trains without a kind are set again (a train recorded since has its kind).
 */
export const trainSpotStops: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistoryStop'
        and column_name = 'wayspotId'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table PartyHistoryStop add column wayspotId varchar(40) null default null`.execute(
        db,
      );
    }
    const kind = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistory'
        and column_name = 'trainKind'`.execute(db);
    if (Number(kind.rows[0]?.n ?? 0) === 0) {
      await sql`alter table PartyHistory add column trainKind varchar(10) null default null`.execute(
        db,
      );
    }
    // The trains recorded before were raid trains, every one: the kinds came with 8X-4.
    await sql`update PartyHistory set trainKind = 'raid'
              where kind = 'train' and trainKind is null`.execute(db);
  },
  async down() {
    // Additive only: the column stays.
  },
};
