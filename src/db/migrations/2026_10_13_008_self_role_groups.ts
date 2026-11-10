import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Self-assigned roles: the Discord role a row stands for, and groups of roles (plan 4C).
 *
 * `Role.roleSnowflake` is the id of the Discord role. The legacy bot tied a row to a Discord
 * role by `roleName` only, so a renamed role silently stopped working; a row made by the new
 * bot has the id from the start, and a legacy row gets it the first time the new bot resolves
 * it by name (NULL until then). One Discord role has at most one row in a server (the unique
 * key; any number of rows may be without an id).
 *
 * `RoleGroup` is a group of a server's roles (regions, teams): a name, its place in the order
 * (`position`, 1 first) and whether only one of its roles may be held (`pickOne`).
 * `Role.groupId` puts a role into at most one group; NULL, as for every row from before, is
 * "Other". Removing a group leaves its roles without one.
 *
 * The legacy bot names its columns when it reads and writes `Role`, so it does not see the two
 * new ones and keeps finding a role by `roleName`; `Alias` is unchanged.
 *
 * Safe to run again after a failure half-way: every part is added only when it is missing.
 */
export const selfRoleGroups: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const count = async (query: ReturnType<typeof sql<{ n: number }>>): Promise<number> =>
      Number((await query.execute(db)).rows[0]?.n ?? 0);
    const missingColumn = async (column: string): Promise<boolean> =>
      (await count(sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'Role' and column_name = ${column}`)) ===
      0;

    await sql`
      create table if not exists RoleGroup (
        id int unsigned not null auto_increment,
        guildId int unsigned not null,
        name varchar(50) not null,
        position int not null,
        pickOne tinyint(1) not null default 0,
        primary key (id),
        unique key rolegroup_guildid_name_unique (guildId, name),
        constraint rolegroup_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);

    if (await missingColumn('roleSnowflake')) {
      await sql`alter table Role add column roleSnowflake
        varchar(30) character set utf8mb4 collate utf8mb4_0900_ai_ci default null`.execute(db);
    }
    if (await missingColumn('groupId')) {
      await sql`alter table Role add column groupId int unsigned default null`.execute(db);
    }
    const hasIndex = await count(sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'Role'
        and index_name = 'role_guildid_rolesnowflake_unique'`);
    if (hasIndex === 0) {
      await sql`alter table Role
        add unique key role_guildid_rolesnowflake_unique (guildId, roleSnowflake)`.execute(db);
    }
    const hasForeignKey = await count(sql<{ n: number }>`
      select count(*) as n from information_schema.referential_constraints
      where constraint_schema = database() and table_name = 'Role'
        and constraint_name = 'role_groupid_foreign'`);
    if (hasForeignKey === 0) {
      await sql`alter table Role
        add constraint role_groupid_foreign foreign key (groupId) references RoleGroup (id)
          on delete set null`.execute(db);
    }
  },
  async down() {
    // Additive only: the table and the columns stay.
  },
};
