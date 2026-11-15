import type { Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * Pokémon nicknames per server (plan 19B-4, migration 058): what a server's staff added for
 * finding Pokémon, by the server's snowflake and the Pokémon's catalogue key; the nicknames as
 * the caller tidied them (`tidyNickname`). Every statement names its server, which leads the
 * primary key `(serverId, pokemonKey, nickname)`.
 */
export class PokemonNicknameRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * The nicknames of these servers, by server and then by catalogue key, each list in the key's
   * order; a server without any is left out. Read through the primary key's first column, in its
   * order (no sort): one server's, a server first asked about, as a `ref` of its rows; the start's
   * read of every server recorded also reads the table by its key, walking the whole primary key
   * in order (`index`), as it wants nearly every row then.
   */
  async nicknamesOf(serverIds: readonly string[]): Promise<Map<string, Map<string, string[]>>> {
    const byServer = new Map<string, Map<string, string[]>>();
    if (serverIds.length === 0) return byServer;
    const rows = await this.db
      .selectFrom('PokemonNickname')
      .select(['serverId', 'pokemonKey', 'nickname'])
      .where('serverId', 'in', [...new Set(serverIds)])
      .orderBy('serverId')
      .orderBy('pokemonKey')
      .orderBy('nickname')
      .execute();
    for (const row of rows) {
      const ofServer = byServer.get(row.serverId) ?? new Map<string, string[]>();
      ofServer.set(row.pokemonKey, [...(ofServer.get(row.pokemonKey) ?? []), row.nickname]);
      byServer.set(row.serverId, ofServer);
    }
    return byServer;
  }

  /** Adds a nickname of a Pokémon for a server; one it has already changes nothing. */
  async addNickname(serverId: string, key: string, nickname: string): Promise<void> {
    await this.db
      .insertInto('PokemonNickname')
      .values({ serverId, pokemonKey: key, nickname })
      .onDuplicateKeyUpdate({ nickname })
      .execute();
  }

  /** Removes a nickname of a Pokémon from a server; false when it had none such. */
  async removeNickname(serverId: string, key: string, nickname: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('PokemonNickname')
      .where('serverId', '=', serverId)
      .where('pokemonKey', '=', key)
      .where('nickname', '=', nickname)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
