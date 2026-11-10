import { pino } from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { startDatabase, type TestDatabase } from '../../test/support/mysql.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { createDb } from './kysely.js';
import {
  detectDatabaseState,
  LEGACY_REQUIRED_MIGRATION,
} from './migrations/2026_10_09_000_baseline.js';
import { migrations } from './migrations/index.js';
import { migrationPlan, runMigrations } from './migrator.js';

const silent = pino({ level: 'silent' });
const ALL_TABLES =
  'select table_name as name from information_schema.tables where table_schema = database() order by name';
const OWN_TABLES = "table_name not like 'knex\\_%' and table_name not like 'kysely\\_%'";

async function migrate(database: TestDatabase): Promise<void> {
  const db = createDb<unknown>(database.config);
  try {
    await runMigrations(db, silent);
  } finally {
    await db.destroy();
  }
}

/** The tables the new bot adds to a database it takes over. */
const ADDED_TABLES = [
  'RaidBoss',
  'RaidBossOverride',
  'Party',
  'PartyAccessGrant',
  'NewTrainNotification',
  'UnownWantGift',
  'SpawnReport',
  'RoleGroup',
  'GymWayfarer',
  'WayspotImport',
  'GymReview',
  'GymLookup',
  'GymLookupDay',
  'WebSession',
  'Wayspot',
  'PartyHistory',
  'PartyHistoryAttendee',
  'PartyHistoryGroup',
  'PartyHistoryStop',
  'HistoryOptIn',
  'PartyHistoryStep',
  'EndedPartyPost',
  'MeetupRequest',
  'MeetupPlaceRuling',
  'MeetupBlock',
  'MeetupAppeal',
  'ModerationReport',
  'ModerationReportReason',
  'MeetupPlaceAsk',
  'ScriptAccess',
  'PineStop',
  'StopReport',
  'ResearchEvent',
  'StopPost',
  'TargetWant',
  'ResearchTask',
  'RocketLineup',
  'GruntMessage',
  'MaxEvent',
  'WayspotLookup',
  'WayspotPlaces',
  'GymGoogleAsked',
  'GoogleUseDay',
  'StopLine',
  'EventForum',
  'EventPost',
  'ListedEvent',
  'WayspotAddress',
  'StopReportHistory',
  'WantCountDay',
  'ActivityBucket',
  'ActivityProgress',
  'LeaderboardOptIn',
  'ActivityDay',
  'LegacyFillIn',
  'PartyAudit',
  'EndedPartyCopy',
  'EventWindow',
];
/** The columns it adds to tables of the legacy bot, as `Table.column`. */
const ADDED_COLUMNS = [
  'Region.forumChannelId',
  'Region.summaryMessageId',
  'PokemonNotification.form',
  'PokemonNotification.shadow',
  'PokemonNotification.costumed',
  'Role.roleSnowflake',
  'Role.groupId',
  'SavedRoutes.atEnd',
];
/** The indexes it adds to tables of the legacy bot, as `Table.index`. */
const ADDED_INDEXES = [
  'Region.region_forumchannelid_unique',
  'Region.region_channelid_unique',
  'Role.role_rolesnowflake_guildid_unique',
  'Role.role_groupid_foreign',
  'User.user_nickname_index',
];
/** The foreign keys it adds to tables of the legacy bot, as `Table.constraint`. */
const ADDED_FOREIGN_KEYS = ['Role.role_groupid_foreign'];
/**
 * The columns of the legacy bot that an added index covers: MySQL then describes the column
 * itself differently (its key marker), which is no change of the column.
 */
const NEWLY_KEYED_COLUMNS = ['Region.channelId', 'User.nickname'];

/**
 * Everything about the Pine tables that a new install must reproduce exactly. `except` leaves
 * tables out and `exceptColumns` columns, to compare only what the legacy bot created.
 */
async function describeSchema(
  database: TestDatabase,
  except: readonly string[] = [],
  exceptColumns: readonly string[] = [],
  exceptIndexes: readonly string[] = [],
  exceptForeignKeys: readonly string[] = [],
  newlyKeyed: readonly string[] = [],
) {
  const kept = <Row extends { t: string }>(rows: Row[]): Row[] =>
    rows.filter((row) => !except.includes(row.t));
  const described = await describeTables(database);
  return {
    columns: kept(described.columns)
      .filter((row) => !exceptColumns.includes(`${row.t}.${String(row.c)}`))
      .map((row) => (newlyKeyed.includes(`${row.t}.${String(row.c)}`) ? { ...row, k: '' } : row)),
    indexes: kept(described.indexes).filter(
      (row) => !exceptIndexes.includes(`${row.t}.${String(row.i)}`),
    ),
    foreignKeys: kept(described.foreignKeys).filter(
      (row) => !exceptForeignKeys.includes(`${row.t}.${String(row.name)}`),
    ),
  };
}

async function describeTables(database: TestDatabase) {
  type Row = { t: string } & Record<string, unknown>;
  return {
    columns: await database.query<Row>(
      `select table_name as t, column_name as c, column_type as type, is_nullable as nullable,
              column_default as dflt, column_key as k, extra
       from information_schema.columns
       where table_schema = database() and ${OWN_TABLES} order by t, c`,
    ),
    indexes: await database.query<Row>(
      `select table_name as t, index_name as i, seq_in_index as s, column_name as c, non_unique as nu
       from information_schema.statistics
       where table_schema = database() and ${OWN_TABLES} order by t, i, s`,
    ),
    foreignKeys: await database.query<Row>(
      `select r.table_name as t, r.constraint_name as name, r.referenced_table_name as rt,
              r.delete_rule as onDelete, r.update_rule as onUpdate
       from information_schema.referential_constraints r
       where r.constraint_schema = database() order by t, name`,
    ),
  };
}

describe('runMigrations', () => {
  let database: TestDatabase | undefined;
  let other: TestDatabase | undefined;

  afterEach(async () => {
    await database?.stop();
    await other?.stop();
    database = other = undefined;
  });

  it('takes over a fully migrated legacy database, changing none of its tables', async () => {
    database = await startDatabase({ legacySchema: true });
    const before = await describeSchema(database);
    await migrate(database);
    const rows = await database.query<{ name: string }>(
      'select name from kysely_migration order by name',
    );
    expect(rows.map((r) => r.name)).toEqual([
      '2026_10_09_000_baseline',
      '2026_10_10_001_raid_bosses',
      '2026_10_11_002_parties',
      '2026_10_11_003_raid_boss_image',
      '2026_10_11_004_party_access_grants',
      '2026_10_12_005_pokemon_notification_form',
      '2026_10_12_006_new_train_notifications',
      '2026_10_12_007_unown_want_gifts',
      '2026_10_13_008_self_role_groups',
      '2026_10_13_009_ex_wants_to_elite',
      '2026_10_13_010_spawn_reports',
      '2026_10_13_011_region_channel_unique',
      '2026_10_15_012_wayfarer',
      '2026_10_16_013_saved_route_at_end',
      '2026_10_16_014_gym_lookups',
      '2026_10_16_015_web_session',
      '2026_10_16_017_wayspot',
      '2026_10_16_018_party_history',
      '2026_10_17_019_meetup_safety',
      '2026_10_17_020_train_split',
      '2026_10_17_021_meetup_request_source',
      '2026_10_17_022_moderation_reports',
      '2026_10_18_023_meetup_request_failure',
      '2026_10_19_024_script_access',
      '2026_10_21_025_max_battle_history',
      '2026_10_21_026_train_spot_stops',
      '2026_10_21_027_stop_reports',
      '2026_10_22_028_rocket',
      '2026_10_22_029_max_events',
      '2026_10_22_030_costumed_wants',
      '2026_10_25_031_region_board',
      '2026_10_26_032_google_line',
      '2026_10_29_033_events_forum',
      '2026_10_31_034_research_task_ends',
      '2026_11_04_035_wayspot_address',
      '2026_11_04_036_stop_report_history',
      '2026_11_04_037_reach_and_want_counts',
      '2026_11_05_038_activity_buckets',
      '2026_11_05_039_conductors',
      '2026_11_05_040_leaderboard_opt_in',
      '2026_11_05_041_train_card',
      '2026_11_06_042_activity_days',
      '2026_11_06_043_legacy_fill_in',
      '2026_11_07_044_spawns_on_map',
      '2026_11_07_045_party_audit',
      '2026_11_07_046_ended_party_copies',
      '2026_11_07_047_meetup_request_end',
      '2026_11_07_048_checked_foreign_keys',
      '2026_11_09_049_event_window',
      '2026_11_10_050_sweep_indexes',
    ]);
    expect(
      await describeSchema(
        database,
        ADDED_TABLES,
        ADDED_COLUMNS,
        ADDED_INDEXES,
        ADDED_FOREIGN_KEYS,
        NEWLY_KEYED_COLUMNS,
      ),
    ).toEqual(before);
    const columns = await database.query<{
      name: string;
      type: string;
      nullable: string;
      charset: string;
      collation: string;
    }>(
      `select column_name as name, column_type as type, is_nullable as nullable,
              character_set_name as charset, collation_name as collation
       from information_schema.columns
       where table_schema = database() and table_name = 'Region' and column_name in (?, ?)
       order by name`,
      ['forumChannelId', 'summaryMessageId'],
    );
    const added = { type: 'varchar(30)', nullable: 'YES', charset: 'utf8mb4' };
    expect(columns).toEqual([
      { name: 'forumChannelId', ...added, collation: 'utf8mb4_0900_ai_ci' },
      { name: 'summaryMessageId', ...added, collation: 'utf8mb4_0900_ai_ci' },
    ]);
    const forumIndex = await database.query<{ nonUnique: number; column: string }>(
      `select non_unique as nonUnique, column_name as \`column\`
       from information_schema.statistics
       where table_schema = database() and table_name = 'Region'
         and index_name = 'region_forumchannelid_unique'`,
    );
    expect(forumIndex.map((r) => ({ ...r, nonUnique: Number(r.nonUnique) }))).toEqual([
      { nonUnique: 0, column: 'forumChannelId' },
    ]);
    const tables = await database.query<{ name: string }>(ALL_TABLES);
    expect(tables.map((r) => r.name)).toEqual(expect.arrayContaining(ADDED_TABLES));
  });

  it('creates the raid boss tables again if the migration failed half-way', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    // What a failure between the two statements leaves behind: one table, no migration record.
    await database.query('drop table RaidBossOverride');
    // Later migrations are forgotten with it: Kysely refuses a gap in what was executed.
    await database.query("delete from kysely_migration where name >= '2026_10_10_001_raid_bosses'");
    await expect(migrate(database)).resolves.toBeUndefined();
    const tables = await database.query<{ name: string }>(ALL_TABLES);
    expect(tables.map((r) => r.name)).toEqual(expect.arrayContaining(ADDED_TABLES));
  });

  it('finishes the party migration if it failed half-way', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    const complete = await describeSchema(database);
    // What a failure after the first added column leaves behind: no second column, no index.
    await database.query('alter table Region drop index region_forumchannelid_unique');
    await database.query('alter table Region drop column summaryMessageId');
    await database.query("delete from kysely_migration where name >= '2026_10_11_002_parties'");
    await expect(migrate(database)).resolves.toBeUndefined();
    expect(await describeSchema(database)).toEqual(complete);
  });

  it('finishes the migration of the self-assigned roles if it failed half-way', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    const complete = await describeSchema(database);
    // What a failure after the first added column leaves behind: the table of groups and the
    // role's id, but no group of a role, no unique key and no link to the groups.
    await database.query('alter table Role drop foreign key role_groupid_foreign');
    await database.query('alter table Role drop column groupId');
    await database.query('alter table Role drop index role_rolesnowflake_guildid_unique');
    await database.query(
      "delete from kysely_migration where name >= '2026_10_13_008_self_role_groups'",
    );
    await expect(migrate(database)).resolves.toBeUndefined();
    expect(await describeSchema(database)).toEqual(complete);
  });

  it('lets the legacy bot delete a gym, a region or a guild that a party refers to', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    await database.query("insert into Guild (id, snowflake) values (1, '412345678901234567')");
    await database.query('insert into Region (id, guildId, channelId) values (1, 1, 1)');
    await database.query("insert into Gym (id, name) values (1, 'Fountain')");
    const insert = `insert into Party (id, guildId, type, regionId, gymId, mirrorMessages, createdById, state, createdAt, updatedAt)
                    values (?, 1, 'raid', 1, 1, '[]', '1', '{}', 0, 0)`;
    await database.query(insert, ['a']);
    await database.query(insert, ['b']);

    await database.query('delete from Gym where id = 1');
    await database.query('delete from Region where id = 1');
    const kept = await database.query('select id, gymId, regionId, status from Party order by id');
    expect(kept).toEqual([
      { id: 'a', gymId: null, regionId: null, status: 'active' },
      { id: 'b', gymId: null, regionId: null, status: 'active' },
    ]);
    await database.query('delete from Guild where id = 1');
    await expect(database.query('select id from Party')).resolves.toEqual([]);

    // The legacy bot also deletes a guild while its regions, gyms and parties still exist.
    await database.query("insert into Guild (id, snowflake) values (2, '412345678901234568')");
    await database.query('insert into Region (id, guildId, channelId) values (2, 2, 2)');
    await database.query("insert into Gym (id, name) values (2, 'Statue')");
    await database.query(
      `insert into Party (id, guildId, type, regionId, gymId, mirrorMessages, createdById, state, createdAt, updatedAt)
       values ('c', 2, 'raid', 2, 2, '[]', '1', '{}', 0, 0)`,
    );
    await database.query('delete from Guild where id = 2');
    await expect(database.query('select id from Party')).resolves.toEqual([]);
    await expect(database.query('select id from Region where id = 2')).resolves.toEqual([]);
  });

  it('is idempotent', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    await expect(migrate(database)).resolves.toBeUndefined();
  });

  it('is idempotent on a new install', async () => {
    database = await startDatabase({ legacySchema: false });
    await migrate(database);
    const before = await describeSchema(database);
    await expect(migrate(database)).resolves.toBeUndefined();
    expect(await describeSchema(database)).toEqual(before);
  });

  it('classifies each kind of database', async () => {
    database = await startDatabase({ legacySchema: false });
    other = await startDatabase({ legacySchema: true });
    const empty = createDb<unknown>(database.config);
    const legacy = createDb<unknown>(other.config);
    try {
      expect((await detectDatabaseState(empty)).state).toBe('empty');
      await database.query('create table invoices (id int primary key)');
      expect(await detectDatabaseState(empty)).toEqual({ state: 'foreign', tables: ['invoices'] });

      expect((await detectDatabaseState(legacy)).state).toBe('legacy-complete');
      await other.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
      expect((await detectDatabaseState(legacy)).state).toBe('legacy-incomplete');
    } finally {
      await empty.destroy();
      await legacy.destroy();
    }
  });

  it('takes over when knex_migrations has extra unknown rows', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query(
      "insert into knex_migrations (name, batch, migration_time) values ('20230101-hand-fix.js', 99, now())",
    );
    await expect(migrate(database)).resolves.toBeUndefined();
  });

  it('creates the legacy schema on an empty database', async () => {
    database = await startDatabase({ legacySchema: false });
    await migrate(database);
    const tables = await database.query<{ name: string }>(
      'select table_name as name from information_schema.tables where table_schema = database()',
    );
    expect(tables.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Guild', 'Region', 'User', 'Gym', ...ADDED_TABLES]),
    );
    expect(tables.map((r) => r.name)).not.toContain('knex_migrations');
  });

  it('gives a new install exactly the schema of a taken-over database', async () => {
    database = await startDatabase({ legacySchema: false });
    other = await startDatabase({ legacySchema: true });
    await migrate(database);
    await migrate(other);
    expect(await describeSchema(database)).toEqual(await describeSchema(other));
  });

  // The backups are made without triggers, routines and events, and `./pine restore` refuses a
  // dump that holds one, or a definer (a view's): a migration that adds any of them would leave
  // every backup without it, or unrestorable (docker/backup.sh, `check_dump` of pine).
  it('leaves no trigger, routine, event or view in the schema, taken over or new', async () => {
    database = await startDatabase({ legacySchema: true });
    other = await startDatabase({ legacySchema: false });
    for (const migrated of [database, other]) {
      await migrate(migrated);
      const [found] = await migrated.query<Record<string, string>>(
        `select
           (select count(*) from information_schema.triggers where trigger_schema = database()) as triggers,
           (select count(*) from information_schema.routines where routine_schema = database()) as routines,
           (select count(*) from information_schema.events where event_schema = database()) as events,
           (select count(*) from information_schema.views where table_schema = database()) as views`,
      );
      // Counts are BIGINT, which the pool gives as text.
      expect(found).toEqual({ triggers: '0', routines: '0', events: '0', views: '0' });
    }
  });

  it("refuses a non-empty database that is not Pine's", async () => {
    database = await startDatabase({ legacySchema: false });
    await database.query('create table invoices (id int primary key)');
    await expect(migrate(database)).rejects.toThrow(/invoices/);
    const tables = await database.query<{ name: string }>(ALL_TABLES);
    expect(tables.map((r) => r.name)).toEqual(['invoices']);
  });

  it('logs a refusal of a foreign or incomplete database as a refusal, not a failed migration', async () => {
    database = await startDatabase({ legacySchema: false });
    await database.query('create table invoices (id int primary key)');
    other = await startDatabase({ legacySchema: true });
    await other.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
    for (const [refused, state] of [
      [database, 'foreign'],
      [other, 'legacy-incomplete'],
    ] as const) {
      const { log, entries } = createTestLogger();
      const db = createDb<unknown>(refused.config);
      try {
        await expect(runMigrations(db, log)).rejects.toThrow();
      } finally {
        await db.destroy();
      }
      expect(entries.map((entry) => [entry.msg, entry.state])).toEqual([
        ['database refused', state],
      ]);
    }
  });

  it('refuses a non-Pine database whose only tables are named kysely_something', async () => {
    database = await startDatabase({ legacySchema: false });
    await database.query('create table kysely_reports (id int primary key)');
    await expect(migrate(database)).rejects.toThrow(/kysely_reports/);
    const tables = await database.query<{ name: string }>(ALL_TABLES);
    expect(tables.map((r) => r.name)).toEqual(['kysely_reports']);
  });

  it('refuses a legacy database whose table names a Windows server lower-cased', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query('rename table `Guild` to `guild`, `GymMeta` to `gymmeta`');
    const before = await database.query<{ name: string }>(ALL_TABLES);
    const { log, entries } = createTestLogger();
    const db = createDb<unknown>(database.config);
    try {
      await expect(runMigrations(db, log)).rejects.toThrow(
        'The tables guild, gymmeta have lower-case names, as MySQL on Windows writes them; ' +
          "the bot needs Guild, GymMeta. './pine restore' renames them when it loads a dump.",
      );
    } finally {
      await db.destroy();
    }
    expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual(before);
    // A refusal, said as one: no migration ran, so none failed.
    expect(entries.map((entry) => entry.msg)).toEqual([
      'database refused: its table names are lower case',
    ]);
  });

  it('refuses a legacy database missing the latest legacy migration', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
    const before = await database.query<{ name: string }>(ALL_TABLES);
    await expect(migrate(database)).rejects.toThrow(LEGACY_REQUIRED_MIGRATION);
    expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual(before);
  });
});

describe('migrationPlan', () => {
  let database: TestDatabase | undefined;

  afterEach(async () => {
    await database?.stop();
    database = undefined;
  });

  /** The plan, asked inside a read-only transaction as the cutover check asks it. */
  async function planOf(of: TestDatabase) {
    const db = createDb<unknown>(of.config);
    try {
      return await db
        .transaction()
        .setAccessMode('read only')
        .execute((trx) => migrationPlan(trx));
    } finally {
      await db.destroy();
    }
  }

  const ALL = Object.keys(migrations);

  it('says a legacy database is taken over by every migration, and writes nothing', async () => {
    database = await startDatabase({ legacySchema: true });
    const before = await database.query<{ name: string }>(ALL_TABLES);
    expect(await planOf(database)).toEqual({ kind: 'takeover', pending: ALL });
    expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual(before);
  });

  it('says an empty database is a new install', async () => {
    database = await startDatabase({ legacySchema: false });
    expect(await planOf(database)).toEqual({ kind: 'new-install', pending: ALL });
    expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual([]);
  });

  it('names the migrations a Pine database still lacks', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    expect(await planOf(database)).toEqual({ kind: 'pine', pending: [] });
    const last = ALL.at(-1) ?? '';
    await database.query('delete from kysely_migration where name = ?', [last]);
    expect(await planOf(database)).toEqual({ kind: 'pine', pending: [last] });
  });

  it('refuses, as Kysely would, a migration it does not know or one run out of order', async () => {
    database = await startDatabase({ legacySchema: true });
    await migrate(database);
    await database.query(
      "insert into kysely_migration (name, timestamp) values ('2099_01_01_999_elsewhere', '2099-01-01T00:00:00Z')",
    );
    expect(await planOf(database)).toEqual({
      kind: 'refused',
      reason:
        'corrupted migrations: previously executed migration 2099_01_01_999_elsewhere is missing',
    });
    await database.query("delete from kysely_migration where name = '2099_01_01_999_elsewhere'");
    const second = ALL[1] ?? '';
    await database.query('delete from kysely_migration where name = ?', [second]);
    const plan = await planOf(database);
    expect(plan.kind === 'refused' && plan.reason).toMatch(
      new RegExp(
        `^corrupted migrations: expected previously executed migration ${ALL[2] ?? ''} to be at index 1`,
      ),
    );
  });

  it('gives the refusal the migrator would give, in its words', async () => {
    database = await startDatabase({ legacySchema: true });
    await database.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
    const incomplete = await planOf(database);
    expect(incomplete.kind).toBe('refused');
    expect(incomplete.kind === 'refused' && incomplete.reason).toContain(LEGACY_REQUIRED_MIGRATION);

    await database.query('rename table `Guild` to `guild`');
    expect(await planOf(database)).toEqual({
      kind: 'refused',
      reason:
        'The tables guild have lower-case names, as MySQL on Windows writes them; the bot ' +
        "needs Guild. './pine restore' renames them when it loads a dump.",
    });
  });

  it('refuses a database that is not Pine’s', async () => {
    database = await startDatabase({ legacySchema: false });
    await database.query('create table invoices (id int primary key)');
    const plan = await planOf(database);
    expect(plan.kind === 'refused' && plan.reason).toMatch(/invoices.*not a Professor Pine/);
  });
});
