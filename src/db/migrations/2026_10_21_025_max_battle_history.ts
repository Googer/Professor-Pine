import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Max battles in the party history (plan 8X-3; design `2026-10-20-max-battles-design.md`, 3.5,
 * section 10): `PartyHistory.wayspotId`, the Wayfarer id of a max battle's power spot
 * (`varchar(40)`: an id is 35 or 36 characters), null for one at a pin ("Unlisted power spot")
 * and for every other party. No foreign key: a Wayspot an import deleted or made a gym stays
 * named by its id, as a gym deleted later does. A max battle's `kind` is `max` and its `tier`
 * `D1` … `D5` or `G` in the columns there are (`varchar`), which take them as they are.
 *
 * 025: after 8W-P's `024_script_access` (the newest of `typescript-migration` and `wayfarer` on
 * 2026-10-21; a 025 of `wayfarer` merged first renumbers this one).
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const maxBattleHistory: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'PartyHistory'
        and column_name = 'wayspotId'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table PartyHistory add column wayspotId varchar(40) null default null`.execute(
        db,
      );
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
