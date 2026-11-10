import { sql, type Kysely } from 'kysely';

/** A region as the cutover check reads it. */
export interface CutoverRegion {
  /** The server's snowflake. */
  guild: string;
  /** The region's channel. */
  channelId: string;
  /** Its forum; null where it has none, and in a legacy database, which has no forums yet. */
  forumChannelId: string | null;
  /** Its board, the forum's summary post (plan 8R-9); null where none is recorded. */
  summaryMessageId: string | null;
}

/** A self-assigned role as the cutover check reads it. */
export interface CutoverSelfRole {
  /** The server's snowflake. */
  guild: string;
  /** The role's snowflake, where the database has it (a legacy one has only the name). */
  roleId: string | null;
  name: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the cutover check reads a database
   before the bot's migrations as well as after them: the generated types describe only after */

/**
 * What the cutover check (`src/ops/cutover-check.ts`) reads of the database: the servers and the
 * regions, from a legacy database (before the takeover) as from a Pine one. Only `select`s.
 */
export class CutoverRepository {
  constructor(private readonly db: Kysely<any>) {}

  private async hasColumn(table: string, column: string): Promise<boolean> {
    const found = await sql<{ name: string }>`
      select column_name as name from information_schema.columns
      where table_schema = database() and table_name = ${table} and column_name = ${column}`.execute(
      this.db,
    );
    return found.rows.length > 0;
  }

  private async hasTable(table: string): Promise<boolean> {
    const found = await sql<{ name: string }>`
      select table_name as name from information_schema.tables
      where table_schema = database() and table_name = ${table}`.execute(this.db);
    return found.rows.length > 0;
  }

  /** The snowflakes of the servers of `Guild`, in the order of their rows. */
  async servers(): Promise<string[]> {
    if (!(await this.hasTable('Guild'))) return [];
    const rows = await sql<{ snowflake: string }>`
      select snowflake from Guild where snowflake is not null order by id`.execute(this.db);
    return rows.rows.map((row) => String(row.snowflake));
  }

  /** Whether the database has every table named (a schema of another shape may lack them). */
  async hasTables(...tables: string[]): Promise<boolean> {
    for (const table of tables) if (!(await this.hasTable(table))) return false;
    return true;
  }

  /** The self-assigned roles of the servers (`Role`), by snowflake where the database has it. */
  async selfRoles(): Promise<CutoverSelfRole[]> {
    if (!(await this.hasTables('Role', 'Guild'))) return [];
    const snowflakes = await this.hasColumn('Role', 'roleSnowflake');
    const rows = await sql<{ guild: string; roleId: string | null; name: string | null }>`
      select g.snowflake as guild, ${snowflakes ? sql`r.roleSnowflake` : sql`null`} as roleId,
        r.roleName as name
      from Role r join Guild g on g.id = r.guildId
      where g.snowflake is not null
      order by r.id`.execute(this.db);
    return rows.rows.map((row) => ({
      guild: String(row.guild),
      roleId: row.roleId === null ? null : String(row.roleId),
      name: row.name ?? '',
    }));
  }

  /** The regions of the servers, with their forums where the database has them. */
  async regions(): Promise<CutoverRegion[]> {
    if (!(await this.hasTable('Region')) || !(await this.hasTable('Guild'))) return [];
    const forums = await this.hasColumn('Region', 'forumChannelId');
    const boards = await this.hasColumn('Region', 'summaryMessageId');
    const rows = await sql<{
      guild: string;
      channelId: string;
      forumChannelId: string | null;
      summaryMessageId: string | null;
    }>`
      select g.snowflake as guild, r.channelId as channelId,
        ${forums ? sql`r.forumChannelId` : sql`null`} as forumChannelId,
        ${boards ? sql`r.summaryMessageId` : sql`null`} as summaryMessageId
      from Region r join Guild g on g.id = r.guildId
      where g.snowflake is not null and r.channelId is not null
      order by r.id`.execute(this.db);
    return rows.rows.map((row) => ({
      guild: String(row.guild),
      channelId: String(row.channelId),
      forumChannelId: row.forumChannelId === null ? null : String(row.forumChannelId),
      summaryMessageId: row.summaryMessageId === null ? null : String(row.summaryMessageId),
    }));
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
