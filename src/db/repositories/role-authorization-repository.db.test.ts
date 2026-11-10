import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exportText, roleAuthExport } from '../../ops/role-auth.js';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { RoleAuthorizationRepository } from './role-authorization-repository.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';

describe('RoleAuthorizationRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let repository: RoleAuthorizationRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    repository = new RoleAuthorizationRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('CommandRoles').execute();
    await db.deleteFrom('CommandRoleAuthorization').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  it('reads nothing from empty tables', async () => {
    expect(await repository.list()).toEqual([]);
  });

  it('puts the two tables together per server and command, as the legacy bot wrote them', async () => {
    await sql`
      insert into CommandRoleAuthorization (command, guildId, roleRequired) values
        ('train', 1, 1), ('meetup', 1, 1), ('raid', 1, 0), ('train', 2, 1), (null, 1, 1)
    `.execute(db);
    await sql`
      insert into CommandRoles (command, guildId, roleSnowflakeId) values
        ('meetup', 1, '510000000000000002'), ('meetup', 1, '510000000000000001'),
        ('raid', 1, '510000000000000003'), ('shout', 2, '510000000000000004'),
        ('shout', 2, ''), (null, 1, '510000000000000005')
    `.execute(db);
    expect(await repository.list()).toEqual([
      {
        guild: HOME,
        command: 'meetup',
        roleRequired: true,
        roleIds: ['510000000000000002', '510000000000000001'],
      },
      { guild: HOME, command: 'raid', roleRequired: false, roleIds: ['510000000000000003'] },
      { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
      { guild: AWAY, command: 'shout', roleRequired: null, roleIds: ['510000000000000004'] },
      { guild: AWAY, command: 'train', roleRequired: true, roleIds: [] },
    ]);
  });

  it('leaves out the rows of no server, as the legacy bot ignored them', async () => {
    await sql`
      insert into CommandRoleAuthorization (command, guildId, roleRequired) values
        ('train', null, 1), ('train', 1, 1)
    `.execute(db);
    await sql`
      insert into CommandRoles (command, guildId, roleSnowflakeId) values
        ('meetup', null, '510000000000000009')
    `.execute(db);
    expect(await repository.list()).toEqual([
      { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
    ]);
  });

  it('writes nothing, and makes the export the script prints', async () => {
    await sql`
      insert into CommandRoleAuthorization (command, guildId, roleRequired) values ('meetup', 1, 1)
    `.execute(db);
    await sql`
      insert into CommandRoles (command, guildId, roleSnowflakeId) values
        ('meetup', 1, '510000000000000001')
    `.execute(db);
    const statements: string[] = [];
    const watched = new RoleAuthorizationRepository(
      db.withPlugin({
        transformQuery: (args) => {
          statements.push(args.node.kind);
          return args.node;
        },
        transformResult: (args) => Promise.resolve(args.result),
      }),
    );
    const text = exportText(roleAuthExport(await watched.list()));
    expect(statements.every((kind) => kind === 'SelectQueryNode')).toBe(true);
    expect(text).toContain(
      `Server ${HOME}\n  meetup: required, roles 510000000000000001 -> /meetup`,
    );
    expect(await db.selectFrom('CommandRoles').selectAll().execute()).toHaveLength(1);
    expect(await db.selectFrom('CommandRoleAuthorization').selectAll().execute()).toHaveLength(1);
  });
});
