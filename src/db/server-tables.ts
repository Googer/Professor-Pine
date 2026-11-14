/**
 * Whose each table of a Pine database is, for the deletion of a server Pine left more than 30 days
 * ago (plan 19C-3, `ServerDataRepository`): every table of `PINE_TABLES` is here, so that a table a
 * migration adds fails `server-tables.test.ts` until it is said whose it is.
 *
 * - `server`: a server's own, named by its snowflake (`column`); deleted by it, in batches along an
 *   index that leads with that column.
 * - `guild-row`: a server's own, named by its `Guild` row (`column`, a foreign key to `Guild.id`
 *   that cascades); deleted by it in batches before the row, which goes last (`Guild` itself, by
 *   its id). `GymServer` goes by `GymRemoval`'s rule: the server's link, and a gym no other server
 *   has with its row.
 * - `through`: goes with the rows of `parent` it hangs on, by `column` (a cascade of the parent's
 *   foreign key, or deleted by the deletion itself before its parent, `cascade: false`).
 * - `gym`: a gym's, which goes with a gym no server has any more (its foreign key cascades).
 * - `member`: a member's own, of no server: it stays (members' settings, the record of a DM, web
 *   logins, the export tool's access).
 * - `instance`: the instance's, of no server: it stays (the feeds' lists, Google's answers by the
 *   point and its counts of every server, the record of the servers, 2.0's Wayspots, the
 *   migrations' own).
 */
export type TableOwner =
  | { kind: 'server'; column: string }
  | { kind: 'guild-row'; column: string }
  | { kind: 'through'; parent: string; column: string; cascade: boolean }
  | { kind: 'gym' }
  | { kind: 'member' }
  | { kind: 'instance' };

const server = (column = 'serverId'): TableOwner => ({ kind: 'server', column });
const guildRow = (column = 'guildId'): TableOwner => ({ kind: 'guild-row', column });
const through = (parent: string, column: string, cascade = true): TableOwner => ({
  kind: 'through',
  parent,
  column,
  cascade,
});
const GYM: TableOwner = { kind: 'gym' };
const MEMBER: TableOwner = { kind: 'member' };
const INSTANCE: TableOwner = { kind: 'instance' };

/** Every table, whose it is. */
export const TABLE_OWNERS: Readonly<Record<string, TableOwner>> = {
  // A server's, by its snowflake.
  ActivityBucket: server(),
  ActivityDay: server(),
  ActivityProgress: server(),
  EventForum: server(),
  EventPost: server(),
  GruntMessage: server(),
  // Per server and member (`(serverId, memberId)`): whether they are in this server's history and
  // on its boards, and their old-bot history asked for here; a member's settings are `User`'s.
  HistoryOptIn: server(),
  LeaderboardOptIn: server(),
  LegacyFillIn: server(),
  MeetupAppeal: server(),
  MeetupBlock: server(),
  MeetupPlaceAsk: server(),
  MeetupPlaceRuling: server(),
  MeetupRequest: server(),
  ModerationReport: server(),
  PartyAudit: server(),
  PartyHistory: server(),
  PineStop: server(),
  PokemonNickname: server(),
  ServerSettings: server(),
  ServerSettingsAudit: server(),
  SpawnReport: server('guildId'),
  StopLine: server(),
  StopPost: server(),
  StopReport: server(),
  StopReportHistory: server(),
  WantCountDay: server(),
  // A server's, by its `Guild` row.
  Guild: guildRow('id'),
  AutoAssignRole: guildRow(),
  CommandRoleAuthorization: guildRow(),
  CommandRoles: guildRow(),
  EndedPartyPost: guildRow(),
  GoogleShareRaise: guildRow(),
  GoogleUseServerDay: guildRow(),
  GymNotification: guildRow(),
  GymReview: guildRow(),
  GymServer: guildRow(),
  NewTrainNotification: guildRow(),
  Party: guildRow(),
  PartyAccessGrant: guildRow(),
  PokemonNotification: guildRow(),
  Region: guildRow(),
  Role: guildRow(),
  RoleGroup: guildRow(),
  ServerGymLookup: guildRow(),
  ServerWayspot: guildRow(),
  ServerWayspotLookup: guildRow(),
  TargetWant: guildRow(),
  UnownWantGift: guildRow(),
  WayspotImport: guildRow(),
  // Through another row of the server's.
  Alias: through('Role', 'roleId'),
  EndedPartyCopy: through('Region', 'regionId', false),
  ModerationReportReason: through('ModerationReport', 'reportId', false),
  PartyHistoryAttendee: through('PartyHistory', 'historyId'),
  PartyHistoryGroup: through('PartyHistory', 'historyId'),
  PartyHistoryStep: through('Party', 'partyId'),
  PartyHistoryStop: through('PartyHistory', 'historyId'),
  SavedRouteGym: through('SavedRoutes', 'routeId'),
  // A member's saved routes are of a region of the server's.
  SavedRoutes: through('Region', 'region'),
  // A gym's.
  Gym: GYM,
  GymGoogleAsked: GYM,
  GymLookup: GYM,
  GymMeta: GYM,
  GymWayfarer: GYM,
  // A member's.
  DmContact: MEMBER,
  ScriptAccess: MEMBER,
  User: MEMBER,
  WebSession: MEMBER,
  // The instance's.
  AutosetPokemon: INSTANCE,
  EventWindow: INSTANCE,
  GoogleAnswer: INSTANCE,
  GoogleUseDay: INSTANCE,
  GymLookupDay: INSTANCE,
  ListedEvent: INSTANCE,
  MaxEvent: INSTANCE,
  Pokemon: INSTANCE,
  RaidBoss: INSTANCE,
  RaidBossOverride: INSTANCE,
  ResearchEvent: INSTANCE,
  ResearchTask: INSTANCE,
  RocketLineup: INSTANCE,
  ServerRecord: INSTANCE,
  // 2.0's Wayspots (the import of the one server a 2.0 instance had, and Google's answers for
  // them): no code reads them since plan 19B-3 (`ServerWayspot`, `ServerWayspotLookup`), and no
  // column names a server, so a server's deletion cannot tell its rows from another's. They stay
  // until a one-time cleanup removes them (follow-ups, "From Phase 19C-3").
  Wayspot: INSTANCE,
  WayspotAddress: INSTANCE,
  WayspotLookup: INSTANCE,
  WayspotPlaces: INSTANCE,
  knex_migrations: INSTANCE,
  knex_migrations_lock: INSTANCE,
  kysely_migration: INSTANCE,
  kysely_migration_lock: INSTANCE,
};
