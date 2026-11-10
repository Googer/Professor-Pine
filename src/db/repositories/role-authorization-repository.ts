import type { Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * What the legacy bot's role authorization says of one command in one server: whether a role is
 * required (`CommandRoleAuthorization.roleRequired`; null when that table has no row for it) and
 * the roles listed for it (`CommandRoles`).
 */
export interface LegacyCommandRoles {
  /** The server's snowflake. */
  guild: string;
  /** The legacy command's name, as the legacy bot keyed it (the command, not an alias). */
  command: string;
  roleRequired: boolean | null;
  /** Role snowflakes, each once, in the order of their rows. */
  roleIds: string[];
}

/**
 * The legacy tables `CommandRoleAuthorization` and `CommandRoles`, read for the export that
 * cutover needs (`npm run role-auth:export`). Read only: the legacy bot keeps them until the
 * final migration drops them.
 */
export class RoleAuthorizationRepository {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Every command either table names, per server, ordered by server and command. A row without
   * a command, or of no server (no `Guild` row with a snowflake), is left out: the legacy bot
   * looked its settings up by the server's snowflake and never found such a row.
   */
  async list(): Promise<LegacyCommandRoles[]> {
    const [required, roles] = await Promise.all([
      this.db
        .selectFrom('CommandRoleAuthorization as a')
        .innerJoin('Guild as g', 'g.id', 'a.guildId')
        .select(['a.command', 'a.roleRequired', 'g.snowflake'])
        .where('a.command', 'is not', null)
        .where('g.snowflake', 'is not', null)
        .orderBy('a.id')
        .execute(),
      this.db
        .selectFrom('CommandRoles as r')
        .innerJoin('Guild as g', 'g.id', 'r.guildId')
        .select(['r.command', 'r.roleSnowflakeId', 'g.snowflake'])
        .where('r.command', 'is not', null)
        .where('g.snowflake', 'is not', null)
        .orderBy('r.id')
        .execute(),
    ]);
    const byKey = new Map<string, LegacyCommandRoles>();
    const entry = (guild: string, command: string): LegacyCommandRoles => {
      const key = `${guild}|${command}`;
      let found = byKey.get(key);
      if (!found) {
        found = { guild, command, roleRequired: null, roleIds: [] };
        byKey.set(key, found);
      }
      return found;
    };
    for (const row of required) {
      if (row.command === null || row.snowflake === null) continue;
      entry(row.snowflake, row.command).roleRequired =
        row.roleRequired === null ? null : row.roleRequired !== 0;
    }
    for (const row of roles) {
      if (row.command === null || row.snowflake === null) continue;
      const found = entry(row.snowflake, row.command);
      const id = row.roleSnowflakeId?.trim() ?? '';
      if (id !== '' && !found.roleIds.includes(id)) found.roleIds.push(id);
    }
    return [...byKey.values()].sort(
      (a, b) => a.guild.localeCompare(b.guild) || a.command.localeCompare(b.command),
    );
  }
}
