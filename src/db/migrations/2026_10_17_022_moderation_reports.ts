import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Reports to the moderators and asks about refused places (plan 8S-2; spec
 * `2026-10-17-moderation-reports-design.md`). Servers and members are snowflakes without a
 * foreign key, times epoch milliseconds, as in 019.
 *
 * - `ModerationReport`: a report of a party (`kind` `party`, `partyId`) or of one message (`kind`
 *   `message`, `targetChannelId`, `targetMessageId`), with what the moderators' post shows of it
 *   (`subject`, JSON: the party's title, lines, place and maker, or the message's author, time,
 *   text and attachment names, so that the post can be drawn again once the party or the message
 *   is gone), its `status` (`open`, `closed`, `refused`, `blocked`, `deleted`, `dismissed`,
 *   `ended`, `gone`), how a party's post went (`removal`: `archive` or `delete`), the moderators'
 *   post (`channelId`, `messageId`: null until it is sent) and who decided. `openKey`
 *   (`party <id>` or `message <channel> <message>` while open, null once decided) is unique: one
 *   open report per party and per message.
 * - `ModerationReportReason`: the reasons of a report, one per reporter (`reporterId`, the name
 *   they had, `text`, when).
 * - `MeetupPlaceAsk`: a member's ask to allow a refused place (`placeKind`, `placeId`, the place
 *   as JSON for the post), their words, `open`, `allowed`, `kept` or `expired`, its post and who
 *   decided. `openKey` (`<server> <kind> <id>` while open) is unique: one open ask per place.
 * - `MeetupPlaceRuling` gains what `/places` and an ask show of a ruling: who made it by name
 *   (`ruledByName`), the place (`place`, JSON), the post it came from (`sourceKind` `request`,
 *   `report` or `ask`, `sourceId`, `sourceChannelId`, `sourceMessageId`) and when a moderator
 *   last kept a refusal on an ask (`keptAt`: members may ask again 14 days after the later of it
 *   and `ruledAt`). A ruling of 019 has them null.
 * - `MeetupBlock` gains the blocked member's name (`memberName`: the request's or the reported
 *   party's maker), for the lists of `/places`; null for a block of 019.
 *
 * 022: after 8M-5M's `021_meetup_request_source`; renumbered at the merge if another branch took
 * it first.
 *
 * Safe to run again after a failure half-way: each table is created only when it is missing,
 * each column added only when it is missing.
 */
export const moderationReports: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists ModerationReport (
        id char(36) not null,
        serverId varchar(30) not null,
        kind varchar(8) not null,
        partyId char(36) default null,
        targetChannelId varchar(30) default null,
        targetMessageId varchar(30) default null,
        subject json not null,
        createdAt bigint not null,
        status varchar(10) not null,
        openKey varchar(80) default null,
        removal varchar(8) default null,
        channelId varchar(30) default null,
        messageId varchar(30) default null,
        decidedBy varchar(30) default null,
        decidedByName varchar(100) default null,
        decidedAt bigint default null,
        primary key (id),
        unique key moderationreport_openkey_unique (openKey),
        key moderationreport_server_status_index (serverId, status),
        key moderationreport_party_index (partyId, status)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists ModerationReportReason (
        reportId char(36) not null,
        reporterId varchar(30) not null,
        reporterName varchar(100) default null,
        text text not null,
        createdAt bigint not null,
        primary key (reportId, reporterId)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    await sql`
      create table if not exists MeetupPlaceAsk (
        id char(36) not null,
        serverId varchar(30) not null,
        placeKind varchar(10) not null,
        placeId varchar(64) not null,
        place json not null,
        memberId varchar(30) not null,
        memberName varchar(100) default null,
        text text not null,
        createdAt bigint not null,
        status varchar(8) not null,
        openKey varchar(120) default null,
        channelId varchar(30) default null,
        messageId varchar(30) default null,
        decidedBy varchar(30) default null,
        decidedByName varchar(100) default null,
        decidedAt bigint default null,
        primary key (id),
        unique key meetupplaceask_openkey_unique (openKey),
        key meetupplaceask_server_status_index (serverId, status)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
    const columns: [string, string][] = [
      ['ruledByName', 'varchar(100) default null'],
      ['place', 'json default null'],
      ['sourceKind', 'varchar(8) default null'],
      ['sourceId', 'char(36) default null'],
      ['sourceChannelId', 'varchar(30) default null'],
      ['sourceMessageId', 'varchar(30) default null'],
      ['keptAt', 'bigint default null'],
    ];
    const added: [string, string, string][] = [
      ...columns.map(([name, type]): [string, string, string] => ['MeetupPlaceRuling', name, type]),
      ['MeetupBlock', 'memberName', 'varchar(100) default null'],
    ];
    for (const [table, name, type] of added) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = ${table}
          and column_name = ${name}`.execute(db);
      if (Number(existing.rows[0]?.n ?? 0) === 0) {
        await sql`alter table ${sql.raw(table)} add column ${sql.raw(name)} ${sql.raw(type)}`.execute(
          db,
        );
      }
    }
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
