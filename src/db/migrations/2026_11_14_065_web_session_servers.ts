import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The servers of a web login (final review R4-1): which of this Pine's servers the member is in,
 * read once from Discord at a login with Discord (the scope `guilds`), so that the top page `/`
 * asks Discord nothing per server.
 *
 * `WebSession.serversListed` says whether the login read them (1: a login with Discord whose
 * list Discord gave); 0 for every session from before, and for a login by a link of `/maps`,
 * which knows only the link's server. `WebSessionServer` is one row per session and server Pine
 * serves on the web that the member was in at the login: the server's snowflake (`serverId`),
 * never the other servers', their names or icons. A row goes with its session (the foreign key
 * cascades: a logout, an expired session, one pushed out of the account's ten, `/operator
 * forget`), and with its server's data (`ServerDataRepository`, by
 * `websessionserver_serverid_index`). Read by the primary key's first column, the session.
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing, the
 * table only made when it is missing, with its index and key in one statement.
 */
export const webSessionServers: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'WebSession'
        and column_name = 'serversListed'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table WebSession
        add column serversListed tinyint(1) not null default 0`.execute(db);
    }
    await sql`
      create table if not exists WebSessionServer (
        sessionId char(64) not null,
        serverId varchar(20) not null,
        primary key (sessionId, serverId),
        key websessionserver_serverid_index (serverId),
        constraint websessionserver_sessionid_foreign foreign key (sessionId)
          references WebSession (id) on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the column and the table stay.
  },
};
