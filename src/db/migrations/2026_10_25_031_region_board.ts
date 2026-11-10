import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The region's board (plan 8R-9; design `2026-10-25-region-board-design.md`): "Today’s Stops"
 * is posted in the region's locked summary post instead of pinned in its text channel.
 *
 * - `StopPost.threadId`: the board post (the summary's thread) the post of a day was drawn in;
 *   null for a post the bot before plan 8R-9 pinned in the region's channel, which the first
 *   draw unpins and deletes. The row stays keyed by the region's channel and the day (review B2:
 *   a summary replaced or taken over is another thread, and the post is drawn anew in it).
 * - `StopPost.leftoverIds`: the messages of such a pinned post in the region's channel whose
 *   delete failed (JSON, null for none; review P1): kept with the day's board post, which has the
 *   same channel and day, and deleted at the next draw or catch-up.
 * - `StopLine`: the lines of the region channels (B9), one per server, region channel, local day
 *   and key (`research:<task key>`, `rocket:<leader:… | giovanni>`), unique on the four: claimed
 *   by its row before it is sent, so two reports at once or a restart never post a line twice;
 *   the message id once sent (null till then), so that the day's lines are deleted at midnight,
 *   also after a restart; when it was claimed.
 *
 * Safe to run again after a failure half-way: a column is added only when it is missing, the
 * table made only when it is missing.
 */
export const regionBoard: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'StopPost'
        and column_name = 'threadId'`.execute(db);
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table StopPost add column threadId varchar(30) null`.execute(db);
    }
    const leftover = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'StopPost'
        and column_name = 'leftoverIds'`.execute(db);
    if (Number(leftover.rows[0]?.n ?? 0) === 0) {
      await sql`alter table StopPost add column leftoverIds json null`.execute(db);
    }
    await sql`
      create table if not exists StopLine (
        id int unsigned not null auto_increment,
        serverId varchar(30) not null,
        regionChannelId varchar(30) not null,
        day varchar(10) not null,
        lineKey varchar(80) not null,
        messageId varchar(30) null,
        createdAt bigint not null,
        primary key (id),
        unique key stopline_line_unique (serverId, regionChannelId, day, lineKey),
        key stopline_day_index (day)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: nothing is ever dropped.
  },
};
