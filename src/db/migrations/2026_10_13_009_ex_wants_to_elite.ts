import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/** The number a want for the EX tier was stored under (`notification-target.ts`, until plan 4F). */
const EX_CODE = -21;
/** The number a want for the elite tier is stored under. */
const ELITE_CODE = -20;

/**
 * A want for EX raids becomes a want for elite raids (plan 4F; Matt, 2026-10-13: explicit, not
 * read-as). The EX tier is gone from the bot: the game has had no EX raid since early 2020 and
 * turned EX gyms into elite raid gyms.
 *
 * Only a database this bot has written to has such rows: the legacy bot had no code for an EX
 * want (production holds the tier codes -1, -3, -4, -5, -6, -7 and -8 only), so on a takeover
 * of production this changes nothing.
 *
 * A row is touched only when it reads as a tier want, which is when its type is `raid` or
 * `both` in any letter case and with or without blanks around it, as the codec reads it (a
 * tier row typed `spawn` is one the codec cannot read, and such a row is never changed or
 * deleted on its own). The scope of a tier want is always raids,
 * whatever the type says, so two rows of one member cannot differ in scope and there is no
 * union to keep: where the member already has the elite want in that server, the EX row is
 * deleted; otherwise it is rewritten, with the type the codec writes. Several EX rows of one
 * member without an elite row all become elite rows: the reader takes rows for one target as
 * one want, and the next change of it leaves one row.
 *
 * Safe to run again after a failure half-way: both statements find nothing to do the second
 * time. There is no way back: an elite want does not say that it was an EX want.
 */
export const exWantsToElite: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      delete ex from PokemonNotification ex
      join PokemonNotification elite
        on elite.userId = ex.userId and elite.guildId = ex.guildId
      where ex.pokemon = ${EX_CODE} and trim(lower(ex.type)) in ('raid', 'both')
        and elite.pokemon = ${ELITE_CODE}
        and trim(lower(elite.type)) in ('raid', 'both')`.execute(db);
    await sql`
      update PokemonNotification
      set pokemon = ${ELITE_CODE}, type = 'raid'
      where pokemon = ${EX_CODE} and trim(lower(type)) in ('raid', 'both')`.execute(db);
  },
  async down() {
    // The rows stay elite wants: nothing says which of them were for EX raids.
  },
};
