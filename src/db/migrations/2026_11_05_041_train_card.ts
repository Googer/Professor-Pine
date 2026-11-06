import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * What the card of an ended train is drawn from (plan 8H-7A; design
 * `2026-11-04-history-on-show-design.md`, Part F):
 *
 * - `PartyHistory.peakRiders` (`smallint unsigned`, null): the most members Here on the train at
 *   one moment, from its steps, which go once the record is written (`historyOfParty`). Null for
 *   every record of before, for a legacy train, for a train whose steps never said a status, and
 *   for every other party.
 * - `PartyHistoryStop.regionIds` (`json`, null): the `Region.id`s the stop lay in when the train
 *   ended, in the region directory's order (`stopRegionsInGuild`): the regions crossed, in order,
 *   once the gym list or the outlines change. A list in the stop's own row, as
 *   `StopReport.regionIds` (036) keeps a report's: read with the stop, its order kept, no join and
 *   no table more; nothing counts the history by these regions in SQL (the boards count by
 *   `PartyHistory.regionId`). `[]` is a stop in no region, null not known (a record of before).
 *
 * Safe to run again after a failure half-way: each column is added only when it is missing.
 */
export const trainCardFacts: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const missing = async (table: string, column: string): Promise<boolean> => {
      const found = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = ${table}
          and column_name = ${column}`.execute(db);
      return Number(found.rows[0]?.n ?? 0) === 0;
    };
    if (await missing('PartyHistory', 'peakRiders')) {
      await sql`alter table PartyHistory add column peakRiders smallint unsigned null default null
        after reached`.execute(db);
    }
    if (await missing('PartyHistoryStop', 'regionIds')) {
      await sql`alter table PartyHistoryStop add column regionIds json null
        after leftAt`.execute(db);
    }
  },
  async down() {
    // Additive only: the columns stay.
  },
};
