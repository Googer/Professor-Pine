import type { Kysely } from 'kysely';
import type { DB } from '../types.js';

/** When each server's last party was made, as the history recorded it (`/operator servers`). */
export interface LastPartyReader {
  /** By server: when its last recorded party was made; none for a server without one. */
  lastPartyAt(serverIds: readonly string[]): Promise<Map<string, number>>;
}

/**
 * The time of each server's last party (plan 19C-1, `/operator servers list`): the latest
 * `createdAt` of its live records (`source = 'live'`: the legacy import's are the old bot's), of
 * any kind. One statement, along `partyhistory_server_source_kind_createdat_index`
 * (`(serverId, source, kind, createdAt)`, migration 040): grouped by the index's first three
 * columns, MySQL reads the last entry of each server's live records of each kind (a loose index
 * scan, "Using index for group-by"), a few kinds a server, never its records one by one
 * (`last-party-repository.db.test.ts`); the latest of a server's kinds is taken here.
 */
export class LastPartyRepository implements LastPartyReader {
  constructor(private readonly db: Kysely<DB>) {}

  async lastPartyAt(serverIds: readonly string[]): Promise<Map<string, number>> {
    const last = new Map<string, number>();
    if (serverIds.length === 0) return last;
    const newest = await this.db
      .selectFrom('PartyHistory')
      .select(({ fn }) => ['serverId', fn.max('createdAt').as('createdAt')])
      .where('serverId', 'in', [...new Set(serverIds)])
      .where('source', '=', 'live')
      .groupBy(['serverId', 'source', 'kind'])
      .execute();
    for (const row of newest) {
      const at = Number(row.createdAt);
      if (at > (last.get(row.serverId) ?? -Infinity)) last.set(row.serverId, at);
    }
    return last;
  }
}
