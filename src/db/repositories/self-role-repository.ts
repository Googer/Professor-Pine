import { sql, type Kysely } from 'kysely';
import {
  planSaveGroup,
  planSaveRole,
  type GroupInput,
  type GroupSaveProblem,
  type RoleInput,
  type RoleSaveProblem,
} from '../../domain/roles/self-role-edits.js';
import {
  orderedGroups,
  type RosterWrites,
  type SelfRoleGroup,
  type SelfRoleRow,
} from '../../domain/roles/self-roles.js';
import { isDuplicateEntry } from '../errors.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** The rows and the groups of one server. */
export interface SelfRoleRows {
  rows: SelfRoleRow[];
  groups: SelfRoleGroup[];
}

export type RoleSaved =
  { kind: 'added' | 'changed'; row: SelfRoleRow } | ({ kind: 'refused' } & RoleSaveProblem);

export type GroupSaved =
  { kind: 'added' | 'changed'; group: SelfRoleGroup } | ({ kind: 'refused' } & GroupSaveProblem);

/**
 * What the self-assigned roles need of the database; lets tests keep them in memory
 * (`MemorySelfRoles`). A server is named by its snowflake, a row and a group by their ids.
 */
export interface SelfRoleStorage {
  /** The rows of a server with their aliases, and its groups; nothing for a server without a row. */
  list(guildId: string): Promise<SelfRoleRows>;
  /**
   * Writes what resolving the rows found (`buildRoster`): the ids of legacy rows, and new names.
   * A write that no longer fits (the row has an id by now, the name is taken) is left out.
   * Answers how many rows it changed.
   */
  remember(guildId: string, writes: RosterWrites): Promise<number>;
  /** Adds a role or changes the row it has, as `planSaveRole` decides inside the server's lock. */
  saveRole(guildId: string, input: RoleInput): Promise<RoleSaved>;
  /** Deletes a row and its aliases; the row as it was, or undefined when the server has none such. */
  removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined>;
  /** Makes a group or changes one, as `planSaveGroup` decides inside the server's lock. */
  saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved>;
  /**
   * Deletes a group; its roles are without a group from then on. The group as it was and how
   * many roles it had, or undefined when the server has none such.
   */
  removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined>;
}

/**
 * The legacy tables `Role` and `Alias` with what plan 4C added: `Role.roleSnowflake` (the
 * Discord role's id), `Role.groupId` and the table `RoleGroup`. The legacy bot keeps reading
 * and writing `roleName`, `roleDescription` and the aliases on the same database, so those keep
 * their meaning: `roleName` is the Discord role's name, an alias is in lower case.
 * `AutoAssignRole` is neither read nor written (its rows go with the row or alias they point at).
 *
 * Everything that changes a server's rows runs with the server's `Guild` row locked, so that
 * two members of staff cannot both pass the checks for names and aliases, which the tables
 * themselves enforce only in part (`roleName` and the role's id are unique per server; aliases
 * are not).
 */
export class SelfRoleRepository implements SelfRoleStorage {
  constructor(private readonly db: Kysely<DB>) {}

  private async guildRow(db: Kysely<DB>, guildId: string): Promise<number | undefined> {
    const row = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', guildId)
      .executeTakeFirst();
    return row?.id;
  }

  /**
   * Runs `work` in a transaction that holds the server's `Guild` row locked. With `create` the
   * row is made when it is missing (before the transaction, as `withMemberLocked` does and for
   * its reasons); without it `work` is not run for a server without a row, which has nothing to
   * change. The first read inside `work` comes after the lock, so it sees everything that was
   * written before the lock was got.
   */
  private async locked<T>(
    guildId: string,
    create: boolean,
    work: (trx: Kysely<DB>, guildRow: number) => Promise<T>,
  ): Promise<T | undefined> {
    if ((await this.guildRow(this.db, guildId)) === undefined) {
      if (!create) return undefined;
      // The bot records a server when it joins it; this is for a row that went missing.
      await this.db
        .insertInto('Guild')
        .values({ snowflake: guildId })
        .onDuplicateKeyUpdate({ snowflake: guildId })
        .execute();
    }
    return inTransaction(this.db, async (trx) => {
      const guild = await trx
        .selectFrom('Guild')
        .select('id')
        .where('snowflake', '=', guildId)
        .forUpdate()
        .executeTakeFirst();
      if (!guild) {
        if (!create) return undefined;
        throw new Error(`Guild row for ${guildId} vanished while its roles were being changed`);
      }
      return work(trx, guild.id);
    });
  }

  private async read(db: Kysely<DB>, guildRow: number): Promise<SelfRoleRows> {
    const roles = await db
      .selectFrom('Role')
      .select(['id', 'roleName', 'roleDescription', 'roleSnowflake', 'groupId'])
      .where('guildId', '=', guildRow)
      .orderBy('id')
      .execute();
    const aliases =
      roles.length === 0
        ? []
        : await db
            .selectFrom('Alias')
            .select(['roleId', 'aliasName'])
            .where(
              'roleId',
              'in',
              roles.map((role) => role.id),
            )
            .orderBy('id')
            .execute();
    const groups = await db
      .selectFrom('RoleGroup')
      .select(['id', 'name', 'position', 'pickOne'])
      .where('guildId', '=', guildRow)
      .orderBy('position')
      .orderBy('id')
      .execute();
    return {
      rows: roles.map((role) => ({
        id: role.id,
        name: role.roleName ?? '',
        description:
          role.roleDescription === null || role.roleDescription.trim() === ''
            ? null
            : role.roleDescription,
        roleId: role.roleSnowflake,
        groupId: role.groupId,
        aliases: aliases.flatMap((alias) =>
          alias.roleId === role.id && alias.aliasName !== null && alias.aliasName.trim() !== ''
            ? [alias.aliasName]
            : [],
        ),
      })),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        position: group.position,
        pickOne: group.pickOne !== 0,
      })),
    };
  }

  async list(guildId: string): Promise<SelfRoleRows> {
    const guildRow = await this.guildRow(this.db, guildId);
    return guildRow === undefined ? { rows: [], groups: [] } : this.read(this.db, guildRow);
  }

  async remember(guildId: string, writes: RosterWrites): Promise<number> {
    const guildRow = await this.guildRow(this.db, guildId);
    if (guildRow === undefined) return 0;
    // Statement by statement, without the lock: each is right or changes nothing, and the unique
    // keys refuse what another writer made wrong meanwhile.
    let written = 0;
    const unlessDuplicate = async (write: Promise<{ numUpdatedRows: bigint }>): Promise<void> => {
      try {
        written += Number((await write).numUpdatedRows);
      } catch (error) {
        if (!isDuplicateEntry(error)) throw error;
      }
    };
    for (const { rowId, roleId } of writes.links) {
      await unlessDuplicate(
        this.db
          .updateTable('Role')
          .set({ roleSnowflake: roleId })
          .where('id', '=', rowId)
          .where('guildId', '=', guildRow)
          .where('roleSnowflake', 'is', null)
          .executeTakeFirstOrThrow(),
      );
    }
    for (const { rowId, name } of writes.renames) {
      await unlessDuplicate(
        this.db
          .updateTable('Role')
          .set({ roleName: name })
          .where('id', '=', rowId)
          .where('guildId', '=', guildRow)
          // Only a row that is spelled otherwise is found: one that has the name already is
          // not counted as written (the driver counts the rows found, not the rows changed).
          .where(sql<boolean>`not (cast(roleName as binary) <=> cast(${name} as binary))`)
          .executeTakeFirstOrThrow(),
      );
    }
    return written;
  }

  async saveRole(guildId: string, input: RoleInput): Promise<RoleSaved> {
    try {
      const saved = await this.locked(guildId, true, async (trx, guildRow): Promise<RoleSaved> => {
        const { rows, groups } = await this.read(trx, guildRow);
        const plan = planSaveRole(rows, groups, input);
        if (!plan.ok) {
          const { ok: _ok, ...problem } = plan;
          return { kind: 'refused', ...problem };
        }
        const { values } = plan;
        const columns = {
          roleName: values.name,
          roleDescription: values.description,
          roleSnowflake: values.roleId,
          groupId: values.groupId,
        };
        let rowId = plan.rowId;
        if (rowId === undefined) {
          const inserted = await trx
            .insertInto('Role')
            .values({ ...columns, guildId: guildRow })
            .executeTakeFirstOrThrow();
          rowId = Number(inserted.insertId);
        } else {
          await trx.updateTable('Role').set(columns).where('id', '=', rowId).execute();
        }
        // An alias that stays keeps its row (the legacy bot's auto-assigned role may point at it).
        const before = rows.find((row) => row.id === rowId)?.aliases ?? [];
        const dropped = before.filter((alias) => !values.aliases.includes(alias));
        const fresh = values.aliases.filter((alias) => !before.includes(alias));
        if (dropped.length > 0) {
          await trx
            .deleteFrom('Alias')
            .where('roleId', '=', rowId)
            .where('aliasName', 'in', dropped)
            .execute();
        }
        if (fresh.length > 0) {
          const roleId = rowId;
          await trx
            .insertInto('Alias')
            .values(fresh.map((aliasName) => ({ aliasName, roleId })))
            .execute();
        }
        return {
          kind: plan.rowId === undefined ? 'added' : 'changed',
          row: {
            id: rowId,
            name: values.name,
            description: values.description,
            roleId: values.roleId,
            groupId: values.groupId,
            aliases: values.aliases,
          },
        };
      });
      if (!saved) throw new Error(`No Guild row for ${guildId}`);
      return saved;
    } catch (error) {
      // The database refuses a name the check let through, because its collation knows more
      // equal letters than `sameName`: the name is taken all the same. (Nobody gets between
      // the check and the insert: whoever adds a role of this server, the legacy bot too, holds
      // a lock on the server's `Guild` row through the foreign key and so waits for this one.
      // That is also why no test reaches this branch; the db test pins the lock, and that a
      // duplicate key is recognised.)
      if (isDuplicateEntry(error)) {
        return { kind: 'refused', reason: 'name-taken', other: input.role.name };
      }
      throw error;
    }
  }

  async removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined> {
    return this.locked(guildId, false, async (trx, guildRow) => {
      const row = (await this.read(trx, guildRow)).rows.find((other) => other.id === rowId);
      if (!row) return undefined;
      // The aliases go with it (ON DELETE CASCADE).
      await trx.deleteFrom('Role').where('id', '=', rowId).execute();
      return row;
    });
  }

  /** Gives the groups the places 1, 2, … in this order. */
  private async place(trx: Kysely<DB>, order: readonly number[]): Promise<void> {
    for (const [index, id] of order.entries()) {
      await trx
        .updateTable('RoleGroup')
        .set({ position: index + 1 })
        .where('id', '=', id)
        .execute();
    }
  }

  async saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    try {
      return await this.savedGroup(guildId, input);
    } catch (error) {
      // As for a role's name: the database takes two names for one where the check did not.
      if (isDuplicateEntry(error)) return { kind: 'refused', reason: 'name-taken' };
      throw error;
    }
  }

  private async savedGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    const saved = await this.locked(guildId, true, async (trx, guildRow): Promise<GroupSaved> => {
      const { groups } = await this.read(trx, guildRow);
      const plan = planSaveGroup(groups, input);
      if (!plan.ok) {
        const { ok: _ok, ...problem } = plan;
        return { kind: 'refused', ...problem };
      }
      let id = plan.id;
      const pickOne = plan.pickOne ? 1 : 0;
      if (id === undefined) {
        const inserted = await trx
          .insertInto('RoleGroup')
          .values({ guildId: guildRow, name: plan.name, pickOne, position: plan.order.length })
          .executeTakeFirstOrThrow();
        id = Number(inserted.insertId);
      } else {
        await trx
          .updateTable('RoleGroup')
          .set({ name: plan.name, pickOne })
          .where('id', '=', id)
          .execute();
      }
      const made = id;
      const order = plan.order.map((other) => other ?? made);
      await this.place(trx, order);
      return {
        kind: plan.id === undefined ? 'added' : 'changed',
        group: { id, name: plan.name, pickOne: plan.pickOne, position: order.indexOf(id) + 1 },
      };
    });
    if (!saved) throw new Error(`No Guild row for ${guildId}`);
    return saved;
  }

  async removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined> {
    return this.locked(guildId, false, async (trx, guildRow) => {
      const { rows, groups } = await this.read(trx, guildRow);
      const group = groups.find((other) => other.id === groupId);
      if (!group) return undefined;
      // Its roles lose it (ON DELETE SET NULL).
      await trx.deleteFrom('RoleGroup').where('id', '=', groupId).execute();
      await this.place(
        trx,
        orderedGroups(groups)
          .filter((other) => other !== group)
          .map((other) => other.id),
      );
      return { group, roles: rows.filter((row) => row.groupId === groupId).length };
    });
  }
}
