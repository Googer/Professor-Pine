import { sql, type Kysely, type RawBuilder } from 'kysely';
import type { Migration } from 'kysely/migration';

/** The token of the want that was Eternatus Candy's until a species' Candy was a reward. */
const ENERGY = 'research:energy:890';
/** The token of a want of Eternatus Candy (`research:candy:<dex>`). */
const CANDY = 'research:candy:890';

/**
 * The servers with any want of `TargetWant`: a loose scan of a key that leads with the server
 * (`Using index for group-by`; `targetwant_member_unique` or `targetwant_target_index`), one read
 * per server, never a read of every row.
 */
export function serversWithWants(): RawBuilder<{ guildId: number }> {
  return sql<{ guildId: number }>`select distinct guildId from TargetWant`;
}

/**
 * The rows a server's wants of Eternatus Mega Energy add: the same member, server, time and
 * costume, wanting Eternatus Candy. Read by the server and the token
 * (`targetwant_target_index`).
 */
export function candyRowsOf(guildId: number): RawBuilder<unknown> {
  return sql`select energy.guildId, energy.userId, ${CANDY}, energy.createdAt, energy.costumed
    from TargetWant energy
    where energy.guildId = ${guildId} and energy.target = ${ENERGY}`;
}

/**
 * A species' Candy as a research reward of its own (Matt, 2026-11-16): Leek Duck's research page
 * gives Mega Energy and a species' Candy the same reward type, and Pine read both as Mega Energy,
 * so a member who wanted the event's Eternatus Candy could only pick "Eternatus Mega Energy"
 * (`research:energy:890`; Eternatus has no Mega). Now a want of Candy is `research:candy:<dex>`.
 * So that those members keep being told of Eternatus Candy, each `research:energy:890` row of
 * `TargetWant` gains a `research:candy:890` row beside it: the same server, member, time and
 * costume. The energy rows stay as they are; a member who wants the candy already keeps their row
 * as it is (against `targetwant_member_unique`, an upsert that changes nothing, as
 * `TargetWantRepository` writes: never `insert ignore`, which would hide a foreign key's
 * refusal), so it is safe to run again.
 *
 * Read server by server (`serversWithWants`, then `candyRowsOf` by the server and the token on
 * `targetwant_target_index`): no scan of the whole table.
 */
export const researchCandyWants: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const servers = await serversWithWants().execute(db);
    for (const { guildId } of servers.rows) {
      await sql`insert into TargetWant (guildId, userId, target, createdAt, costumed)
        ${candyRowsOf(Number(guildId))}
        on duplicate key update costumed = TargetWant.costumed`.execute(db);
    }
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
