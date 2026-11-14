import { LEGACY_SCHEMA_STATEMENTS } from './baseline/legacy-schema.js';

/** The legacy bot's tables, as its migrations named them (`Guild`, `GymMeta` …). */
const LEGACY_TABLES = LEGACY_SCHEMA_STATEMENTS.map(
  (statement) => /^CREATE TABLE `(\w+)`/.exec(statement)?.[1],
).filter((name): name is string => name !== undefined);

/**
 * Every table of a Pine database, as the bot names them: the legacy bot's, its knex
 * bookkeeping, the tables the Kysely migrations add, and Kysely's bookkeeping. A migration that
 * adds a table adds it here (`restore.db.test.ts` checks it).
 */
export const PINE_TABLES: readonly string[] = [
  ...LEGACY_TABLES,
  'knex_migrations',
  'knex_migrations_lock',
  'ActivityBucket',
  'ActivityDay',
  'ActivityProgress',
  'GruntMessage',
  'GymLookup',
  'GymLookupDay',
  'GymGoogleAsked',
  'GoogleAnswer',
  'GoogleUseDay',
  'GoogleUseServerDay',
  'GoogleShareRaise',
  'GymReview',
  'GymServer',
  'GymWayfarer',
  'DmContact',
  'EndedPartyCopy',
  'EndedPartyPost',
  'EventForum',
  'EventPost',
  'EventWindow',
  'HistoryOptIn',
  'LeaderboardOptIn',
  'LegacyFillIn',
  'ListedEvent',
  'MaxEvent',
  'MeetupAppeal',
  'MeetupBlock',
  'MeetupPlaceAsk',
  'MeetupPlaceRuling',
  'MeetupRequest',
  'ModerationReport',
  'ModerationReportReason',
  'NewTrainNotification',
  'Party',
  'PartyAccessGrant',
  'PartyAudit',
  'PartyHistory',
  'PartyHistoryAttendee',
  'PartyHistoryGroup',
  'PartyHistoryStep',
  'PartyHistoryStop',
  'PineStop',
  'PokemonNickname',
  'RaidBoss',
  'RaidBossOverride',
  'ResearchEvent',
  'ResearchTask',
  'RocketLineup',
  'RoleGroup',
  'SavedRouteGym',
  'ScriptAccess',
  'ServerSettings',
  'ServerSettingsAudit',
  'ServerGymLookup',
  'ServerWayspot',
  'ServerWayspotLookup',
  'SpawnReport',
  'StopLine',
  'StopPost',
  'StopReport',
  'StopReportHistory',
  'TargetWant',
  'UnownWantGift',
  'WantCountDay',
  'Wayspot',
  'WayspotAddress',
  'WayspotLookup',
  'WayspotPlaces',
  'WayspotImport',
  'WebSession',
  'kysely_migration',
  'kysely_migration_lock',
];

/**
 * The renames that give a database the table names the bot uses, when it has them in lower case
 * (`guild`, `gymmeta`: MySQL on Windows lower-cases every name, and a dump keeps that). A table
 * whose right name is there already, and a table the bot does not know, stay as they are. In
 * the order of the lower-case names.
 */
export function canonicalRenames(tables: readonly string[]): Array<{ from: string; to: string }> {
  const present = new Set(tables);
  return PINE_TABLES.filter((name) => name !== name.toLowerCase())
    .filter((name) => !present.has(name) && present.has(name.toLowerCase()))
    .map((name) => ({ from: name.toLowerCase(), to: name }))
    .sort((a, b) => a.from.localeCompare(b.from));
}
