import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemorySelfRoles } from '../../../test/support/self-roles.js';
import { isDuplicateEntry } from '../errors.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { SelfRoleRepository, type SelfRoleStorage } from './self-role-repository.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NEW_SERVER = '412345678901234569';
const NORTH = '510000000000000001';
const SOUTH = '510000000000000002';
const WEST = '510000000000000003';

describe('SelfRoleRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let roles: SelfRoleRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    roles = new SelfRoleRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  /** A row as the legacy bot wrote it: its columns only, the alias in lower case. */
  async function legacyRow(name: string, description: string | null, aliases: string[] = []) {
    const inserted = await sql`
      insert into Role (roleName, roleDescription, guildId) values (${name}, ${description}, 1)
    `.execute(db);
    const id = Number(inserted.insertId);
    for (const alias of aliases) {
      await sql`insert into Alias (aliasName, roleId) values (${alias}, ${id})`.execute(db);
    }
    return id;
  }

  const storedRoles = () =>
    db
      .selectFrom('Role')
      .select(['roleName', 'roleDescription', 'roleSnowflake', 'groupId', 'guildId'])
      .orderBy('id')
      .execute();

  it('reads what the legacy bot wrote: no id of a Discord role, no group', async () => {
    const id = await legacyRow('North', 'The north side', ['n', 'north side']);
    await legacyRow('Bare', '');
    expect(await roles.list(HOME)).toEqual({
      rows: [
        {
          id,
          name: 'North',
          description: 'The north side',
          roleId: null,
          groupId: null,
          aliases: ['n', 'north side'],
        },
        { id: id + 1, name: 'Bare', description: null, roleId: null, groupId: null, aliases: [] },
      ],
      groups: [],
    });
    expect(await roles.list(AWAY)).toEqual({ rows: [], groups: [] });
    expect(await roles.list('499999999999999999')).toEqual({ rows: [], groups: [] });
  });

  it('adds a role with its id, description, aliases and group, in columns the legacy bot reads', async () => {
    const group = await roles.saveGroup(HOME, { name: 'Regions' });
    if (group.kind === 'refused') throw new Error('refused');
    const saved = await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'North' },
      description: 'The north side',
      aliases: ['n', 'north side'],
      groupId: group.group.id,
    });
    expect(saved).toMatchObject({ kind: 'added', row: { name: 'North', roleId: NORTH } });
    expect(await storedRoles()).toEqual([
      {
        roleName: 'North',
        roleDescription: 'The north side',
        roleSnowflake: NORTH,
        groupId: group.group.id,
        guildId: 1,
      },
    ]);
    const aliases = await db.selectFrom('Alias').select('aliasName').orderBy('id').execute();
    expect(aliases.map((alias) => alias.aliasName)).toEqual(['n', 'north side']);
  });

  it('changes a row it finds by the id, and keeps the rows of aliases that stay', async () => {
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, aliases: ['n', 'up'] });
    const before = await db.selectFrom('Alias').select(['id', 'aliasName']).orderBy('id').execute();
    const saved = await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'Northside' },
      description: 'Renamed',
      aliases: ['top', 'n'],
    });
    expect(saved).toMatchObject({
      kind: 'changed',
      row: { name: 'Northside', description: 'Renamed', aliases: ['top', 'n'] },
    });
    const after = await db.selectFrom('Alias').select(['id', 'aliasName']).orderBy('id').execute();
    expect(after.map((alias) => alias.aliasName)).toEqual(['n', 'top']);
    expect(after[0]?.id).toBe(before[0]?.id);
    expect((await roles.list(HOME)).rows).toHaveLength(1);

    // What is not said stays.
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'Northside' } });
    expect((await roles.list(HOME)).rows[0]).toMatchObject({
      description: 'Renamed',
      aliases: ['n', 'top'],
    });
  });

  it('takes over a legacy row of the same name instead of making a second one', async () => {
    const id = await legacyRow('north', 'Old words', ['n']);
    const saved = await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' } });
    expect(saved).toMatchObject({ kind: 'changed', row: { id, roleId: NORTH, aliases: ['n'] } });
    expect(await storedRoles()).toEqual([
      {
        roleName: 'North',
        roleDescription: 'Old words',
        roleSnowflake: NORTH,
        groupId: null,
        guildId: 1,
      },
    ]);
  });

  it('takes over the row of the same name whose role the server no longer has', async () => {
    await roles.saveGroup(HOME, { name: 'Regions' });
    const [regions] = (await roles.list(HOME)).groups;
    const first = await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'North' },
      description: 'Up',
      aliases: ['n'],
      groupId: regions?.id ?? null,
    });
    if (first.kind !== 'added') throw new Error(first.kind);
    // The role was deleted and made anew: the server has WEST now, called North.
    const again = await roles.saveRole(HOME, { role: { id: WEST, name: 'North' }, live: [WEST] });
    expect(again).toMatchObject({
      kind: 'changed',
      row: { id: first.row.id, roleId: WEST, description: 'Up', aliases: ['n'] },
    });
    expect(await storedRoles()).toEqual([
      {
        roleName: 'North',
        roleDescription: 'Up',
        roleSnowflake: WEST,
        groupId: regions?.id,
        guildId: 1,
      },
    ]);
    // While the role is there, the name is taken.
    expect(
      await roles.saveRole(HOME, { role: { id: SOUTH, name: 'North' }, live: [WEST, SOUTH] }),
    ).toMatchObject({ kind: 'refused', reason: 'name-taken' });
  });

  it('refuses names and aliases that another row of the server has, and only of that server', async () => {
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, aliases: ['n'] });
    expect(await roles.saveRole(HOME, { role: { id: SOUTH, name: 'north' } })).toEqual({
      kind: 'refused',
      reason: 'name-taken',
      other: 'North',
    });
    expect(await roles.saveRole(HOME, { role: { id: SOUTH, name: 'N' } })).toEqual({
      kind: 'refused',
      reason: 'name-is-alias',
      other: 'North',
    });
    expect(
      await roles.saveRole(HOME, { role: { id: SOUTH, name: 'South' }, aliases: ['n'] }),
    ).toEqual({ kind: 'refused', reason: 'alias-taken', alias: 'n', other: 'North' });
    expect((await roles.list(HOME)).rows).toHaveLength(1);
    expect(
      await roles.saveRole(AWAY, { role: { id: SOUTH, name: 'North' }, aliases: ['n'] }),
    ).toMatchObject({ kind: 'added' });
  });

  it('recognises the duplicate key the database answers with, and nothing else as one', async () => {
    await legacyRow('North', null);
    const duplicate = await legacyRow('north', null).catch((error: unknown) => error);
    expect(isDuplicateEntry(duplicate)).toBe(true);
    // Another refusal of the database: a role of a server that does not exist.
    const other = await sql`insert into Role (roleName, guildId) values ('East', 99)`
      .execute(db)
      .catch((error: unknown) => error);
    expect(other).toBeInstanceOf(Error);
    expect(isDuplicateEntry(other)).toBe(false);
    expect(isDuplicateEntry(undefined)).toBe(false);
  });

  it('makes whoever adds a role without its lock wait, so that the check sees every row', async () => {
    // The legacy bot adds a role and has not committed yet. Its insert holds the server's
    // `Guild` row through the foreign key, so the save waits for it instead of checking the
    // names without that row: it finds the row and takes it over, as for any legacy row.
    const legacy = await db.startTransaction().execute();
    let committed = false;
    try {
      await sql`insert into Role (roleName, guildId) values ('North', 1)`.execute(legacy);
      const saving = roles
        .saveRole(HOME, { role: { id: NORTH, name: 'North' } })
        .then((saved) => ({ saved, afterCommit: committed }));
      // eslint-disable-next-line no-restricted-syntax -- a real MySQL: nothing tells when the statement waits for the lock
      await new Promise((resolve) => setTimeout(resolve, 300));
      committed = true;
      await legacy.commit().execute();
      const { saved, afterCommit } = await saving;
      expect(afterCommit).toBe(true);
      expect(saved.kind).toBe('changed');
    } finally {
      if (!legacy.isCommitted) await legacy.rollback().execute();
    }
    expect((await storedRoles()).map((row) => [row.roleName, row.roleSnowflake])).toEqual([
      ['North', NORTH],
    ]);
  });

  it('makes one row when the same role is added many times at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        roles.saveRole(NEW_SERVER, { role: { id: NORTH, name: 'North' }, aliases: ['n'] }),
      ),
    );
    expect(results.filter((result) => result.kind === 'added')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'changed')).toHaveLength(7);
    const { rows } = await roles.list(NEW_SERVER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.aliases).toEqual(['n']);
  });

  it('remembers the id of a legacy row once, and a new name unless it is taken', async () => {
    const north = await legacyRow('North', null);
    const south = await legacyRow('South', null);
    // It answers how many rows it changed.
    expect(
      await roles.remember(HOME, {
        links: [
          { rowId: north, roleId: NORTH },
          { rowId: south, roleId: SOUTH },
        ],
        renames: [],
      }),
    ).toBe(2);
    const second = {
      // Neither a second id for a row nor one role for two rows.
      links: [
        { rowId: north, roleId: WEST },
        { rowId: south, roleId: NORTH },
      ],
      renames: [
        { rowId: north, name: 'south' },
        { rowId: south, name: 'Southside' },
      ],
    };
    expect(await roles.remember(HOME, second)).toBe(1);
    // A name the row has already is not a write.
    expect(
      await roles.remember(HOME, { links: [], renames: [{ rowId: south, name: 'Southside' }] }),
    ).toBe(0);
    // Rows of another server are not touched by a write that names them.
    expect(
      await roles.remember(AWAY, { links: [], renames: [{ rowId: north, name: 'Hijacked' }] }),
    ).toBe(0);
    expect((await storedRoles()).map((row) => [row.roleName, row.roleSnowflake])).toEqual([
      ['North', NORTH],
      ['Southside', SOUTH],
    ]);
  });

  it('refuses a link to a role that another row of the server got meanwhile', async () => {
    const legacy = await legacyRow('Old', null);
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' } });
    await roles.remember(HOME, { links: [{ rowId: legacy, roleId: NORTH }], renames: [] });
    expect((await storedRoles()).map((row) => row.roleSnowflake)).toEqual([null, NORTH]);
  });

  it('removes a row with its aliases, of its own server only', async () => {
    const saved = await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'North' },
      aliases: ['n'],
    });
    if (saved.kind === 'refused') throw new Error('refused');
    expect(await roles.removeRole(AWAY, saved.row.id)).toBeUndefined();
    expect(await roles.removeRole('499999999999999999', saved.row.id)).toBeUndefined();
    expect(await roles.removeRole(HOME, saved.row.id)).toMatchObject({ name: 'North' });
    expect(await roles.removeRole(HOME, saved.row.id)).toBeUndefined();
    expect(await storedRoles()).toEqual([]);
    expect(await db.selectFrom('Alias').select('id').execute()).toEqual([]);
  });

  it('keeps the groups of a server in places 1 to their number', async () => {
    const names = async () => (await roles.list(HOME)).groups.map((g) => [g.name, g.position]);
    await roles.saveGroup(HOME, { name: 'Regions' });
    await roles.saveGroup(HOME, { name: 'Teams', pickOne: true });
    expect(await roles.saveGroup(HOME, { name: 'Hobbies', position: 1 })).toMatchObject({
      kind: 'added',
      group: { name: 'Hobbies', position: 1, pickOne: false },
    });
    expect(await names()).toEqual([
      ['Hobbies', 1],
      ['Regions', 2],
      ['Teams', 3],
    ]);
    expect(
      await roles.saveGroup(HOME, { name: 'hobbies', newName: 'Play', position: 3 }),
    ).toMatchObject({ kind: 'changed', group: { name: 'Play', position: 3 } });
    expect(await names()).toEqual([
      ['Regions', 1],
      ['Teams', 2],
      ['Play', 3],
    ]);
    expect(await roles.saveGroup(HOME, { name: 'Other' })).toEqual({
      kind: 'refused',
      reason: 'reserved-name',
    });
    expect((await roles.list(HOME)).groups[1]).toMatchObject({ name: 'Teams', pickOne: true });
    // Another server has its own groups, also of the same name.
    expect(await roles.saveGroup(AWAY, { name: 'Regions' })).toMatchObject({
      kind: 'added',
      group: { position: 1 },
    });
  });

  it('removes a group, whose roles are without one from then on', async () => {
    const regions = await roles.saveGroup(HOME, { name: 'Regions' });
    const teams = await roles.saveGroup(HOME, { name: 'Teams' });
    if (regions.kind === 'refused' || teams.kind === 'refused') throw new Error('refused');
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, groupId: regions.group.id });
    await roles.saveRole(HOME, { role: { id: SOUTH, name: 'South' }, groupId: regions.group.id });
    await roles.saveRole(HOME, { role: { id: WEST, name: 'Valor' }, groupId: teams.group.id });
    expect(await roles.removeGroup(AWAY, regions.group.id)).toBeUndefined();
    expect(await roles.removeGroup(HOME, regions.group.id)).toEqual({
      group: regions.group,
      roles: 2,
    });
    expect(await roles.removeGroup(HOME, regions.group.id)).toBeUndefined();
    const { rows, groups } = await roles.list(HOME);
    expect(rows.map((row) => row.groupId)).toEqual([null, null, teams.group.id]);
    expect(groups).toEqual([{ ...teams.group, position: 1 }]);
  });

  it('refuses a group of another server for a role', async () => {
    const away = await roles.saveGroup(AWAY, { name: 'Regions' });
    if (away.kind === 'refused') throw new Error('refused');
    expect(
      await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, groupId: away.group.id }),
    ).toEqual({ kind: 'refused', reason: 'no-group' });
  });

  it('loses its rows and groups with the server', async () => {
    const group = await roles.saveGroup(HOME, { name: 'Regions' });
    if (group.kind === 'refused') throw new Error('refused');
    await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'North' },
      aliases: ['n'],
      groupId: group.group.id,
    });
    await new GuildRepository(db).remove(HOME);
    expect(await storedRoles()).toEqual([]);
    expect(await db.selectFrom('RoleGroup').select('id').execute()).toEqual([]);
    expect(await db.selectFrom('Alias').select('id').execute()).toEqual([]);
  });

  it('lets the legacy bot keep working on the same rows', async () => {
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, aliases: ['n'] });
    // As the legacy bot finds a role: by name, without case, in its server.
    const found = await sql<{ id: number }>`
      select Role.id from Role inner join Guild on Guild.id = Role.guildId
      where roleName = 'NORTH' and Guild.snowflake = ${HOME}`.execute(db);
    expect(found.rows).toHaveLength(1);
    // And as it adds one of its own, naming only its columns.
    await legacyRow('South', 'by the legacy bot', ['s']);
    expect((await roles.list(HOME)).rows.map((row) => [row.name, row.roleId])).toEqual([
      ['North', NORTH],
      ['South', null],
    ]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemorySelfRoles();
    const script = async (storage: SelfRoleStorage) => {
      const steps: unknown[] = [];
      const group = async (input: Parameters<SelfRoleStorage['saveGroup']>[1]) => {
        const saved = await storage.saveGroup(HOME, input);
        steps.push(saved.kind === 'refused' ? saved : [saved.kind, saved.group.name]);
        return saved.kind === 'refused' ? -1 : saved.group.id;
      };
      const role = async (input: Parameters<SelfRoleStorage['saveRole']>[1]) => {
        const saved = await storage.saveRole(HOME, input);
        steps.push(
          saved.kind === 'refused'
            ? saved
            : [saved.kind, { ...saved.row, id: 0, groupId: saved.row.groupId !== null }],
        );
        return saved.kind === 'refused' ? -1 : saved.row.id;
      };
      /** Ids differ between the two; everything else must not. */
      const state = async () => {
        const { rows, groups } = await storage.list(HOME);
        const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name ?? null;
        steps.push({
          rows: rows.map(({ id: _id, groupId, ...row }) => ({ ...row, group: groupName(groupId) })),
          groups: groups.map(({ id: _id, ...g }) => g),
        });
      };
      const regions = await group({ name: 'Regions' });
      const teams = await group({ name: 'Teams', pickOne: true, position: 1 });
      await group({ name: 'none' });
      await group({ name: 'regions', newName: 'teams' });
      const north = await role({
        role: { id: NORTH, name: 'North' },
        description: 'Up',
        aliases: ['n'],
        groupId: regions,
      });
      await role({ role: { id: SOUTH, name: 'South' }, aliases: ['n'] });
      await role({ role: { id: SOUTH, name: 'South' }, aliases: ['s'], groupId: teams });
      await role({ role: { id: NORTH, name: 'Northside' }, aliases: [], description: null });
      await role({ role: { id: WEST, name: 'West' }, groupId: 999_999 });
      await state();
      await storage.remember(HOME, {
        links: [{ rowId: north, roleId: WEST }],
        renames: [
          { rowId: north, name: 'south' },
          { rowId: north, name: 'Upper' },
        ],
      });
      steps.push(await storage.removeGroup(HOME, 999_999));
      const removed = await storage.removeGroup(HOME, teams);
      steps.push(removed && { name: removed.group.name, roles: removed.roles });
      await state();
      const gone = await storage.removeRole(HOME, north);
      steps.push(gone && { ...gone, id: 0, groupId: 0 });
      steps.push(await storage.removeRole(HOME, north));
      await state();
      return steps;
    };
    expect(await script(roles)).toEqual(await script(memory));
  });
});
