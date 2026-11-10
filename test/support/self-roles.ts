import type {
  GroupSaved,
  RoleSaved,
  SelfRoleRows,
  SelfRoleStorage,
} from '../../src/db/repositories/self-role-repository.js';
import {
  planSaveGroup,
  planSaveRole,
  type GroupInput,
  type RoleInput,
} from '../../src/domain/roles/self-role-edits.js';
import {
  orderedGroups,
  sameName,
  type RosterWrites,
  type SelfRoleGroup,
  type SelfRoleRow,
} from '../../src/domain/roles/self-roles.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';

interface StoredRow extends SelfRoleRow {
  guildId: string;
  aliases: string[];
}

interface StoredGroup extends SelfRoleGroup {
  guildId: string;
}

/**
 * The self-assigned roles kept in memory as `SelfRoleRepository` keeps them, whose behaviour
 * self-role-repository.db.test.ts pins down: the same decisions (`planSaveRole`,
 * `planSaveGroup`) over rows per server. `legacyRow` puts a row as the legacy bot left it:
 * a name, no id of a Discord role, no group. Set `failing` to make every call reject.
 */
export class MemorySelfRoles implements SelfRoleStorage {
  failing: Error | undefined;
  readonly rows: StoredRow[] = [];
  readonly groups: StoredGroup[] = [];
  private nextRow = 1;
  private nextGroup = 1;

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private of(guildId: string): SelfRoleRows {
    return {
      rows: this.rows
        .filter((row) => row.guildId === guildId)
        .map(({ guildId: _guild, ...row }) => ({ ...row, aliases: [...row.aliases] })),
      groups: orderedGroups(
        this.groups
          .filter((group) => group.guildId === guildId)
          .map(({ guildId: _guild, ...group }) => group),
      ),
    };
  }

  /** A row as the legacy bot made it, for a test. */
  legacyRow(
    name: string,
    more: { description?: string; aliases?: string[]; guildId?: string } = {},
  ): number {
    const id = this.nextRow++;
    this.rows.push({
      id,
      guildId: more.guildId ?? FAKE_GUILD_ID,
      name,
      description: more.description ?? null,
      roleId: null,
      groupId: null,
      aliases: more.aliases ?? [],
    });
    return id;
  }

  list(guildId: string): Promise<SelfRoleRows> {
    return this.attempt(() => this.of(guildId));
  }

  remember(guildId: string, writes: RosterWrites): Promise<number> {
    return this.attempt(() => {
      const mine = this.rows.filter((row) => row.guildId === guildId);
      let written = 0;
      for (const { rowId, roleId } of writes.links) {
        const row = mine.find((other) => other.id === rowId);
        // As the unique key has it: one row per Discord role.
        if (row?.roleId === null && !mine.some((other) => other.roleId === roleId)) {
          row.roleId = roleId;
          written += 1;
        }
      }
      for (const { rowId, name } of writes.renames) {
        const row = mine.find((other) => other.id === rowId);
        if (
          row &&
          row.name !== name &&
          !mine.some((other) => other !== row && sameName(other.name, name))
        ) {
          row.name = name;
          written += 1;
        }
      }
      return written;
    });
  }

  saveRole(guildId: string, input: RoleInput): Promise<RoleSaved> {
    return this.attempt((): RoleSaved => {
      const { rows, groups } = this.of(guildId);
      const plan = planSaveRole(rows, groups, input);
      if (!plan.ok) {
        const { ok: _ok, ...problem } = plan;
        return { kind: 'refused', ...problem };
      }
      const existing = this.rows.find((row) => row.guildId === guildId && row.id === plan.rowId);
      const stored: StoredRow = existing ?? {
        id: this.nextRow++,
        guildId,
        name: '',
        description: null,
        roleId: null,
        groupId: null,
        aliases: [],
      };
      Object.assign(stored, plan.values, { aliases: [...plan.values.aliases] });
      if (!existing) this.rows.push(stored);
      const { guildId: _guild, ...row } = stored;
      return { kind: existing ? 'changed' : 'added', row: { ...row, aliases: [...row.aliases] } };
    });
  }

  removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined> {
    return this.attempt(() => {
      const index = this.rows.findIndex((row) => row.guildId === guildId && row.id === rowId);
      if (index < 0) return undefined;
      const [{ guildId: _guild, ...row } = {} as StoredRow] = this.rows.splice(index, 1);
      return row;
    });
  }

  private place(guildId: string, order: readonly number[]): void {
    for (const group of this.groups) {
      if (group.guildId === guildId) group.position = order.indexOf(group.id) + 1;
    }
  }

  saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    return this.attempt((): GroupSaved => {
      const plan = planSaveGroup(this.of(guildId).groups, input);
      if (!plan.ok) {
        const { ok: _ok, ...problem } = plan;
        return { kind: 'refused', ...problem };
      }
      let stored = this.groups.find((group) => group.guildId === guildId && group.id === plan.id);
      const created = !stored;
      if (!stored) {
        stored = { id: this.nextGroup++, guildId, name: '', position: 0, pickOne: false };
        this.groups.push(stored);
      }
      stored.name = plan.name;
      stored.pickOne = plan.pickOne;
      const id = stored.id;
      this.place(
        guildId,
        plan.order.map((other) => other ?? id),
      );
      const { guildId: _guild, ...group } = stored;
      return { kind: created ? 'added' : 'changed', group };
    });
  }

  removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined> {
    return this.attempt(() => {
      const index = this.groups.findIndex(
        (group) => group.guildId === guildId && group.id === groupId,
      );
      if (index < 0) return undefined;
      const [{ guildId: _guild, ...group } = {} as StoredGroup] = this.groups.splice(index, 1);
      let roles = 0;
      for (const row of this.rows) {
        if (row.guildId === guildId && row.groupId === groupId) {
          row.groupId = null;
          roles += 1;
        }
      }
      this.place(
        guildId,
        this.of(guildId).groups.map((other) => other.id),
      );
      return { group, roles };
    });
  }
}
