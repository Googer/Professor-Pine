import { sql, type Kysely } from 'kysely';
import type { DB } from '../../src/db/types.js';

/** A server whose data a deletion test deletes (plan 19C-3). */
export const DELETED_SERVER = '412345678901234567';
/** A server whose data a deletion test keeps, every row of it. */
export const KEPT_SERVER = '412345678901234568';
/** Two members of both servers: their `User` rows are theirs and stay. */
export const DATA_MEMBERS = ['700000000000000001', '700000000000000002'] as const;

/** Every row of every table, by table: each row as JSON text, sorted (`dumpTables`). */
export type TableDump = Record<string, string[]>;

/** Every row of each table, as text, sorted: what a deletion must leave as it was. */
export async function dumpTables(db: Kysely<DB>, tables: readonly string[]): Promise<TableDump> {
  const dump: TableDump = {};
  for (const table of tables) {
    // A whole read of a test's table, a dozen rows; the geometry as text.
    const rows = await sql<Record<string, unknown>>`select * from ${sql.table(table)}`.execute(db);
    dump[table] = rows.rows
      .map((row) =>
        JSON.stringify(row, (_key, value: unknown) =>
          Buffer.isBuffer(value) ? value.toString('hex') : value,
        ),
      )
      .sort();
  }
  return dump;
}

/** The members' `User` rows, made once for both servers: what stays of them. */
export async function seedMembers(db: Kysely<DB>): Promise<number[]> {
  const ids: number[] = [];
  for (const userSnowflake of DATA_MEMBERS) {
    const result = await db.insertInto('User').values({ userSnowflake }).executeTakeFirstOrThrow();
    ids.push(Number(result.insertId));
  }
  return ids;
}

/**
 * Rows of a server in every table a server owns or that hangs on one (`TABLE_OWNERS`' `server`,
 * `guild-row`, `through` and `gym` tables), two in some, so that a batch of one is exercised: its
 * `Guild` row, a region with a member's saved route through the gym, a role in a group with an
 * alias and the auto-assigned role, a party with a step, a history record with an attendee, a
 * group and a stop, a report with a reason, a copy of an ended party in its region, an import with
 * a gym review, Google's lines and counts, its Wayspots, and two gyms: its own (with its
 * metadata, its Wayfarer row, Google's asked and the old line) and `shared`, which it shares with
 * the other server (only its link is the server's). `n` makes the ids of its rows its own (1, 2).
 */
export async function seedServer(
  db: Kysely<DB>,
  options: { serverId: string; n: number; members: readonly number[]; shared?: number },
): Promise<{ guildRow: number; ownGym: number }> {
  const { serverId, n, members } = options;
  const [memberRow, otherRow] = members as [number, number];
  const [memberId, otherId] = DATA_MEMBERS;
  const t = (text: string) => `${text}-${String(n)}`;
  const snow = (k: number) => `${String(n)}${String(k).padStart(17, '0')}`;
  const at = 1_763_000_000_000 + n;
  const guildRow = Number(
    (await db.insertInto('Guild').values({ snowflake: serverId }).executeTakeFirstOrThrow())
      .insertId,
  );
  // Its gym, and its link to the shared one.
  const ownGym = Number(
    (
      await db
        .insertInto('Gym')
        .values({ name: t('Gym'), lat: 40.4, lon: -80 })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  await db
    .insertInto('GymMeta')
    .values({ gymId: ownGym, nickname: t('Nick') })
    .execute();
  await db.insertInto('GymWayfarer').values({ gymId: ownGym }).execute();
  await db
    .insertInto('GymGoogleAsked')
    .values({ gymId: ownGym, askedAt: String(at) })
    .execute();
  await db
    .insertInto('GymLookup')
    .values({ gymId: ownGym, queuedAt: String(at) })
    .execute();
  const gyms = options.shared === undefined ? [ownGym] : [ownGym, options.shared];
  await db
    .insertInto('GymServer')
    .values(gyms.map((gymId) => ({ gymId, guildId: guildRow })))
    .execute();
  await db
    .insertInto('ServerGymLookup')
    .values(gyms.map((gymId) => ({ gymId, guildId: guildRow, queuedAt: String(at) })))
    .execute();
  // A region, a member's route through the gym, a copy of an ended party in the region.
  await sql`insert into Region (guildId, channelId, description, bounds)
    values (${guildRow}, ${snow(1)}, ${t('Region')},
      ST_GeomFromText('POLYGON((40 -80, 41 -80, 41 -79, 40 -80))'))`.execute(db);
  const region = Number(
    (
      await db
        .selectFrom('Region')
        .select('id')
        .where('guildId', '=', guildRow)
        .executeTakeFirstOrThrow()
    ).id,
  );
  const route = Number(
    (
      await db
        .insertInto('SavedRoutes')
        .values({ userId: memberRow, region, name: t('Route'), gyms: `[${String(ownGym)}]` })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  await db.insertInto('SavedRouteGym').values({ routeId: route, gymId: ownGym }).execute();
  await db
    .insertInto('EndedPartyCopy')
    .values([
      { messageId: snow(2), regionId: region, partyId: t('ended-a'), endedAt: String(at) },
      { messageId: snow(3), regionId: region, partyId: t('ended-b'), endedAt: String(at) },
    ])
    .execute();
  // Roles.
  const group = Number(
    (
      await db
        .insertInto('RoleGroup')
        .values({ guildId: guildRow, name: t('Teams'), position: 1 })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  const role = Number(
    (
      await db
        .insertInto('Role')
        .values({
          roleName: t('Mystic'),
          guildId: guildRow,
          roleSnowflake: snow(4),
          groupId: group,
        })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  const alias = Number(
    (
      await db
        .insertInto('Alias')
        .values({ aliasName: t('blue'), roleId: role })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  await db
    .insertInto('AutoAssignRole')
    .values({ guildId: guildRow, roleId: role, aliasId: alias })
    .execute();
  await db
    .insertInto('CommandRoleAuthorization')
    .values({ command: 'raid', guildId: guildRow, roleRequired: 1 })
    .execute();
  await db
    .insertInto('CommandRoles')
    .values({ command: 'raid', guildId: guildRow, roleSnowflakeId: snow(4) })
    .execute();
  // Wants and targets.
  await db
    .insertInto('GymNotification')
    .values({ gym: String(ownGym), userId: memberRow, guildId: guildRow })
    .execute();
  await db
    .insertInto('PokemonNotification')
    .values([
      { pokemon: 150, guildId: guildRow, userId: memberRow },
      { pokemon: 151, guildId: guildRow, userId: otherRow },
    ])
    .execute();
  await db
    .insertInto('TargetWant')
    .values({ guildId: guildRow, userId: memberRow, target: 'research', createdAt: String(at) })
    .execute();
  await db
    .insertInto('NewTrainNotification')
    .values({ guildId: guildRow, memberId, createdAt: String(at) })
    .execute();
  await db
    .insertInto('UnownWantGift')
    .values({ guildId: guildRow, memberId, createdAt: String(at) })
    .execute();
  // A party with a step, its forum's grant, an ended post.
  await db
    .insertInto('Party')
    .values({
      id: t('party'),
      guildId: guildRow,
      type: 'raid',
      regionId: region,
      gymId: ownGym,
      mirrorMessages: '[]',
      createdById: memberId,
      state: '{}',
      createdAt: String(at),
      updatedAt: String(at),
    })
    .execute();
  await db
    .insertInto('PartyHistoryStep')
    .values({ partyId: t('party'), at: String(at), kind: 'join', subject: memberId })
    .execute();
  await db
    .insertInto('PartyAccessGrant')
    .values({ forumChannelId: snow(5), memberId, guildId: guildRow, createdAt: String(at) })
    .execute();
  await db
    .insertInto('EndedPartyPost')
    .values({
      forumPostId: snow(6),
      forumChannelId: snow(5),
      guildId: guildRow,
      endedAt: String(at),
    })
    .execute();
  // An import and its review; Google's counts and lines; Wayspots.
  const imported = Number(
    (
      await db
        .insertInto('WayspotImport')
        .values({ guildId: guildRow, staffId: memberId, importedAt: String(at), counts: '{}' })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  await db
    .insertInto('GymReview')
    .values({
      guildId: guildRow,
      gymId: ownGym,
      kind: 'moved',
      candidates: '[]',
      importId: imported,
      createdAt: String(at),
      queuedAt: String(at),
    })
    .execute();
  await db
    .insertInto('GoogleUseServerDay')
    .values({ guildId: guildRow, day: '2026-11-14', kind: 'address', questions: 3 })
    .execute();
  await db
    .insertInto('GoogleShareRaise')
    .values({ month: '2026-11', guildId: guildRow, extra: 10, raisedAt: String(at) })
    .execute();
  await db
    .insertInto('ServerWayspot')
    .values(
      ['a', 'b'].map((k) => ({
        guildId: guildRow,
        id: t(`wayspot-${k}`),
        kind: 'stop',
        lat: 40.4,
        lon: -80,
        title: t('Stop'),
        firstSeen: String(at),
        lastSeen: String(at),
      })),
    )
    .execute();
  await db
    .insertInto('ServerWayspotLookup')
    .values({ guildId: guildRow, wayspotId: t('wayspot-a'), kind: 'stop', queuedAt: String(at) })
    .execute();
  // What names the server by its snowflake.
  await db
    .insertInto('ActivityBucket')
    .values({
      serverId,
      regionId: region,
      placeKind: 'gym',
      placeId: String(ownGym),
      month: '2026-11',
      weekday: 1,
      hour: 12,
    })
    .execute();
  await db
    .insertInto('ActivityDay')
    .values({ serverId, regionId: region, day: '2026-11-14', boss: 'mewtwo' })
    .execute();
  await db.insertInto('ActivityProgress').values({ serverId }).execute();
  await db
    .insertInto('EventForum')
    .values({ serverId, forumId: snow(7) })
    .execute();
  await db
    .insertInto('EventPost')
    .values({
      serverId,
      eventId: 'community-day',
      postId: snow(8),
      name: 'Community Day',
      startsAt: String(at),
      endsAt: String(at),
    })
    .execute();
  const stopReport = Number(
    (
      await db
        .insertInto('StopReport')
        .values({
          serverId,
          stopKey: t('stop'),
          kind: 'research',
          periodKey: '2026-11-14',
          endsAt: String(at),
          stopName: t('Stop'),
          lat: 40.4,
          lon: -80,
          subjectKey: 'task',
          detail: '{}',
          reporterId: memberId,
          reporterName: 'Ash',
          madeAt: String(at),
        })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  await db
    .insertInto('GruntMessage')
    .values({
      messageId: snow(9),
      channelId: snow(1),
      serverId,
      reportId: stopReport,
      deleteAt: String(at),
    })
    .execute();
  await db
    .insertInto('StopReportHistory')
    .values({
      reportId: stopReport,
      reportMadeAt: String(at),
      serverId,
      kind: 'research',
      periodKey: '2026-11-14',
      subjectKey: 'task',
      detail: '{}',
      madeAt: String(at),
      endsAt: String(at),
      endedAt: String(at),
      ending: 'expired',
    })
    .execute();
  await db
    .insertInto('StopLine')
    .values({
      serverId,
      regionChannelId: snow(1),
      day: '2026-11-14',
      lineKey: 'line',
      createdAt: String(at),
    })
    .execute();
  await db
    .insertInto('StopPost')
    .values({
      channelId: snow(1),
      day: '2026-11-14',
      serverId,
      messageIds: '[]',
      updatedAt: String(at),
    })
    .execute();
  await db
    .insertInto('WantCountDay')
    .values({ serverId, day: '2026-11-14', target: 'research', count: 2 })
    .execute();
  for (const id of [memberId, otherId]) {
    await db
      .insertInto('HistoryOptIn')
      .values({ serverId, memberId: id, createdAt: String(at) })
      .execute();
  }
  await db
    .insertInto('LeaderboardOptIn')
    .values({ serverId, memberId, createdAt: String(at) })
    .execute();
  await db
    .insertInto('LegacyFillIn')
    .values({ serverId, memberId, requestedAt: String(at) })
    .execute();
  await db
    .insertInto('MeetupAppeal')
    .values({
      id: t('appeal'),
      serverId,
      memberId,
      text: 'please',
      createdAt: String(at),
      status: 'open',
    })
    .execute();
  await db
    .insertInto('MeetupBlock')
    .values({ serverId, memberId, blockedBy: otherId, blockedAt: String(at) })
    .execute();
  await db
    .insertInto('MeetupPlaceAsk')
    .values({
      id: t('ask'),
      serverId,
      placeKind: 'gym',
      placeId: String(ownGym),
      place: '{}',
      text: 'here?',
      createdAt: String(at),
      status: 'open',
    })
    .execute();
  await db
    .insertInto('MeetupPlaceRuling')
    .values({
      serverId,
      placeKind: 'gym',
      placeId: String(ownGym),
      ruling: 'allow',
      ruledBy: otherId,
      ruledAt: String(at),
    })
    .execute();
  await db
    .insertInto('MeetupRequest')
    .values({
      id: t('request'),
      serverId,
      regionChannelId: snow(1),
      place: '{}',
      name: 'Meetup',
      startTime: String(at),
      description: 'come',
      createdAt: String(at),
      expiresAt: String(at),
      status: 'waiting',
      channelId: snow(1),
      messageId: snow(10),
    })
    .execute();
  for (const k of ['a', 'b']) {
    await db
      .insertInto('ModerationReport')
      .values({
        id: t(`report-${k}`),
        serverId,
        kind: 'party',
        subject: '{}',
        createdAt: String(at),
        status: 'open',
      })
      .execute();
    await db
      .insertInto('ModerationReportReason')
      .values({
        reportId: t(`report-${k}`),
        reporterId: memberId,
        text: 'bad',
        createdAt: String(at),
      })
      .execute();
  }
  await db
    .insertInto('PartyAudit')
    .values({ serverId, partyId: t('party'), at: String(at), action: 'join', actorId: memberId })
    .execute();
  const history = Number(
    (
      await db
        .insertInto('PartyHistory')
        .values({ source: 'live', kind: 'raid', serverId, createdAt: String(at), ending: 'done' })
        .executeTakeFirstOrThrow()
    ).insertId,
  );
  await db
    .insertInto('PartyHistoryAttendee')
    .values({ historyId: history, seq: 1, memberId, furthest: 'done' })
    .execute();
  await db.insertInto('PartyHistoryGroup').values({ historyId: history, groupId: 'A' }).execute();
  await db
    .insertInto('PartyHistoryStop')
    .values({ historyId: history, seq: 1, gymId: ownGym })
    .execute();
  await db
    .insertInto('PineStop')
    .values({
      serverId,
      name: t('Pine stop'),
      lat: 40.4,
      lon: -80,
      createdBy: memberId,
      createdAt: String(at),
      updatedBy: memberId,
      updatedAt: String(at),
    })
    .execute();
  await db
    .insertInto('PokemonNickname')
    .values({ serverId, pokemonKey: 'mewtwo', nickname: t('two') })
    .execute();
  await db
    .insertInto('ServerSettings')
    .values({ serverId, settings: '{}', updatedAt: String(at) })
    .execute();
  await db
    .insertInto('ServerSettingsAudit')
    .values({ serverId, at: String(at), actorId: memberId, key: 'distanceUnits' })
    .execute();
  await db
    .insertInto('SpawnReport')
    .values({ messageId: snow(11), channelId: snow(1), deleteAt: String(at), guildId: serverId })
    .execute();
  return { guildRow, ownGym };
}
