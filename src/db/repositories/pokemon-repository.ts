import type { Kysely } from 'kysely';
import {
  keyForLegacyName,
  legacyNameForKey,
  legacyNamesForKey,
} from '../../domain/pogo/legacy-names.js';
import { tidyNickname } from '../../domain/pogo/nickname-rules.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** The legacy bot stores nicknames as one string joined with ", ". */
const SEPARATOR = ', ';

/** The size of the `Pokemon.nickname` column. */
const MAX_STORED_LENGTH = 255;

/** The stored nicknames as they are written, trimmed, without empties. */
function storedNicknames(stored: string | null): string[] {
  if (!stored) return [];
  return stored
    .split(',')
    .map((nickname) => nickname.trim())
    .filter((nickname) => nickname !== '');
}

/** The stored nicknames as they are compared and searched: tidied (`tidyNickname`). */
function parseNicknames(stored: string | null): string[] {
  return storedNicknames(stored).map(tidyNickname);
}

function clean(nickname: string): string {
  const value = nickname.trim().toLowerCase();
  if (value === '') throw new RangeError('A nickname cannot be empty');
  if (value.includes(',')) throw new RangeError('A nickname cannot contain a comma');
  return value;
}

/**
 * The legacy Pokemon table. Only `nickname` is used: nicknames moderators added for searching.
 * The tier, exclusive, mega, elite and shiny columns are stale and are neither read nor written.
 */
export class PokemonRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Moderator-added nicknames, in lower case, by `keyForLegacyName` of the row's name. Some rows
   * are not Pokémon (production has `ex`, `perfect`, `zero` and `undefined`); the repository does
   * not know the catalogue and returns them, so callers ignore keys the catalogue does not have.
   */
  async nicknames(): Promise<Map<string, string[]>> {
    const rows = await this.db
      .selectFrom('Pokemon')
      .select(['name', 'nickname'])
      .where('name', 'is not', null)
      .orderBy('id')
      .execute();
    const byKey = new Map<string, string[]>();
    for (const row of rows) {
      const nicknames = parseNicknames(row.nickname);
      if (row.name === null || nicknames.length === 0) continue;
      const key = keyForLegacyName(row.name);
      byKey.set(key, [...new Set([...(byKey.get(key) ?? []), ...nicknames])]);
    }
    return byKey;
  }

  /**
   * Adds a nickname and returns the Pokémon's nicknames afterwards (lower case). The row is
   * found under any name the legacy data may use for the key, lowest id first; the nicknames
   * already stored are kept exactly as they are and compared without regard to case. A missing
   * row is created under `legacyNameForKey(key)` with the column defaults. Unlike the legacy bot,
   * which copied the Pokémon's tier and flags into the new row, this can make the legacy bot
   * (after a rollback) stop treating that Pokémon as a raid boss when its boss status came only
   * from `data/pokemon.json`; in the production data of 2026-10 that applies to two Pokémon
   * (`venusaur_mega`, `blastoise_mega`). Throws RangeError for a nickname that is empty, has a
   * comma, or would make the stored string longer than the column.
   */
  async addNickname(key: string, nickname: string): Promise<string[]> {
    const added = clean(nickname);
    if (added.length > MAX_STORED_LENGTH) throw new RangeError('The nickname is too long');
    return inTransaction(this.db, async (trx) => {
      const rows = await this.findRows(trx, key);
      const all = [...new Set(rows.flatMap((one) => parseNicknames(one.nickname)))];
      if (all.includes(tidyNickname(added))) return all;
      const [row] = rows;
      if (!row) {
        await trx
          .insertInto('Pokemon')
          .values({ name: legacyNameForKey(key), nickname: added })
          .execute();
        return [added];
      }
      const stored = storedNicknames(row.nickname);
      const joined = [...stored, added].join(SEPARATOR);
      if (joined.length > MAX_STORED_LENGTH) {
        throw new RangeError('The nicknames would not fit in the stored string');
      }
      await trx.updateTable('Pokemon').set({ nickname: joined }).where('id', '=', row.id).execute();
      return [...all, tidyNickname(added)];
    });
  }

  /**
   * Removes a nickname from every row that holds the Pokémon (`nicknames` reads them together),
   * compared as `tidyNickname` writes it. Returns false when none had it. Other nicknames are
   * untouched.
   */
  async removeNickname(key: string, nickname: string): Promise<boolean> {
    const removed = tidyNickname(nickname);
    return inTransaction(this.db, async (trx) => {
      let found = false;
      for (const row of await this.findRows(trx, key)) {
        const stored = storedNicknames(row.nickname);
        const kept = stored.filter((one) => tidyNickname(one) !== removed);
        if (kept.length === stored.length) continue;
        found = true;
        await trx
          .updateTable('Pokemon')
          .set({ nickname: kept.join(SEPARATOR) })
          .where('id', '=', row.id)
          .execute();
      }
      return found;
    });
  }

  /**
   * The rows holding this Pokémon under any of its legacy names, lowest id first, locked for the
   * rest of the transaction.
   */
  private findRows(db: Kysely<DB>, key: string) {
    return db
      .selectFrom('Pokemon')
      .select(['id', 'nickname'])
      .where('name', 'in', legacyNamesForKey(key))
      .orderBy('id')
      .forUpdate()
      .execute();
  }
}
