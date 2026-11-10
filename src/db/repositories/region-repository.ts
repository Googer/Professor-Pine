import { sql, type Kysely } from 'kysely';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { isDuplicateEntry } from '../errors.js';
import { snowflakeParam } from '../snowflake.js';
import { inTransaction } from '../transaction.js';
import { polygonWkt, ringFromPolygon } from '../spatial.js';
import type { DB, Polygon } from '../types.js';

/** A region: a Discord text channel and the area it covers. */
export interface Region {
  id: number;
  guildId: number | null;
  channelId: string;
  description: string | null;
  /** Closed outline; null for a row created before its outline was imported. */
  bounds: LatLon[] | null;
  /** The forum that holds the region's party posts; null until `/admin setup-forums` made one. */
  forumChannelId: string | null;
  /**
   * The region's board in that forum (plan 8R-9): the pinned post "Today and coming up" ("Going
   * on now" before plan 8R-9, "Active raids" before plan 8X-G), with "Today’s Stops" under it;
   * open to members' commands since plan 8R-9F.
   */
  summaryMessageId: string | null;
}

/** A channel and the outline it gets: a closed ring. */
export interface RegionOutline {
  channelId: string;
  ring: readonly LatLon[];
}

/** What a channel is after its outline was written: its region, and whether that is new. */
export interface SavedOutline {
  channelId: string;
  regionId: number;
  created: boolean;
}

/**
 * What came of removing a region: nothing, or the region is gone with the saved routes of
 * members that went with it, and its forum and list of what is going on as its row had them when it
 * was locked and deleted (what to delete or keep on Discord).
 */
export type RemovedRegion =
  | { removed: false }
  | {
      removed: true;
      routes: number;
      forumChannelId: string | null;
      summaryMessageId: string | null;
    };

/** What region administration writes; lets tests keep the regions in memory. */
export interface RegionAdminStorage {
  saveOutlines(guildId: number, outlines: readonly RegionOutline[]): Promise<SavedOutline[]>;
  remove(id: number, guildId: number): Promise<RemovedRegion>;
}

interface RegionRow {
  id: number;
  guildId: number | null;
  channelId: string | null;
  description: string | null;
  bounds: Polygon | null;
  forumChannelId: string | null;
  summaryMessageId: string | null;
}

function toRegion(row: RegionRow): Region | undefined {
  if (row.channelId === null) return undefined;
  return {
    id: row.id,
    guildId: row.guildId,
    channelId: row.channelId,
    description: row.description,
    bounds: ringFromPolygon(row.bounds),
    forumChannelId: row.forumChannelId,
    summaryMessageId: row.summaryMessageId,
  };
}

function toRegions(rows: RegionRow[]): Region[] {
  return rows.map(toRegion).filter((region): region is Region => region !== undefined);
}

const COLUMNS = [
  'id',
  'guildId',
  'channelId',
  'description',
  'bounds',
  'forumChannelId',
  'summaryMessageId',
] as const;

/** The Region table. All spatial SQL for regions lives here. */
export class RegionRepository implements RegionAdminStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async findByChannel(channelId: string): Promise<Region | undefined> {
    const row = await this.db
      .selectFrom('Region')
      .select(COLUMNS)
      .where('channelId', '=', snowflakeParam(channelId))
      .orderBy('id')
      .executeTakeFirst();
    return row ? toRegion(row) : undefined;
  }

  async findById(id: number): Promise<Region | undefined> {
    const row = await this.db
      .selectFrom('Region')
      .select(COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRegion(row) : undefined;
  }

  /** The region whose party posts are in this forum. */
  async findByForum(forumChannelId: string): Promise<Region | undefined> {
    const row = await this.db
      .selectFrom('Region')
      .select(COLUMNS)
      .where('forumChannelId', '=', forumChannelId)
      .orderBy('id')
      .executeTakeFirst();
    return row ? toRegion(row) : undefined;
  }

  /**
   * Sets or clears the region's forum. One forum holds the posts of one region, so `'forum-taken'`
   * means another region already has it and nothing was changed. The summary post belongs to the
   * forum, so it is forgotten whenever the forum changes; asking for the forum the region already
   * has is `'set'` and keeps it. `'no-region'` when there is no such row.
   */
  async setForum(
    id: number,
    forumChannelId: string | null,
  ): Promise<'set' | 'no-region' | 'forum-taken'> {
    const row = await this.db
      .selectFrom('Region')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return 'no-region';
    try {
      await this.db
        .updateTable('Region')
        .set({ forumChannelId, summaryMessageId: null })
        .where('id', '=', id)
        .where((eb) =>
          forumChannelId === null
            ? eb('forumChannelId', 'is not', null)
            : eb.or([eb('forumChannelId', 'is', null), eb('forumChannelId', '!=', forumChannelId)]),
        )
        .execute();
    } catch (error) {
      if (isDuplicateEntry(error)) return 'forum-taken';
      throw error;
    }
    return 'set';
  }

  /**
   * Remembers the pinned summary post, which belongs to the forum it was made in: the row is
   * written only while the region still has `forumChannelId`. Returns false when there is no such
   * region or its forum has changed in between (nothing is written then).
   */
  async setSummaryMessage(
    id: number,
    forumChannelId: string,
    summaryMessageId: string | null,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('Region')
      .select('id')
      .where('id', '=', id)
      .where('forumChannelId', '=', forumChannelId)
      .executeTakeFirst();
    if (!row) return false;
    await this.db
      .updateTable('Region')
      .set({ summaryMessageId })
      .where('id', '=', id)
      .where('forumChannelId', '=', forumChannelId)
      .execute();
    return true;
  }

  async listForGuild(guildId: number): Promise<Region[]> {
    const rows = await this.db
      .selectFrom('Region')
      .select(COLUMNS)
      .where('guildId', '=', guildId)
      .orderBy('id')
      .execute();
    return toRegions(rows);
  }

  async listAll(): Promise<Region[]> {
    const rows = await this.db.selectFrom('Region').select(COLUMNS).orderBy('id').execute();
    return toRegions(rows);
  }

  /** Creates the channel's region or replaces its outline. The ring must be closed. */
  async saveBounds(guildId: number, channelId: string, ring: readonly LatLon[]): Promise<Region> {
    const bounds = sql<Polygon>`ST_PolygonFromText(${polygonWkt(ring)})`;
    await inTransaction(this.db, async (trx) => {
      const existing = await trx
        .selectFrom('Region')
        .select('id')
        .where('channelId', '=', snowflakeParam(channelId))
        .orderBy('id')
        .executeTakeFirst();
      if (existing) {
        await trx
          .updateTable('Region')
          .set({ bounds, guildId })
          .where('id', '=', existing.id)
          .execute();
      } else {
        await trx.insertInto('Region').values({ guildId, channelId, bounds }).execute();
      }
    });
    const saved = await this.findByChannel(channelId);
    if (!saved) throw new Error(`Region for channel ${channelId} vanished after save`);
    return saved;
  }

  /**
   * Gives several channels of one server their outlines, all or none (`/region import`): a
   * channel that is a region of that server gets the new outline, a channel that is none
   * becomes a region. A channel that is the region of another server (or of none) fails the
   * whole call: nothing is written then. Every ring must be closed. Answers what each channel
   * is now, in the order given.
   */
  async saveOutlines(guildId: number, outlines: readonly RegionOutline[]): Promise<SavedOutline[]> {
    return inTransaction(this.db, async (trx) => {
      const saved: SavedOutline[] = [];
      for (const { channelId, ring } of outlines) {
        const bounds = sql<Polygon>`ST_PolygonFromText(${polygonWkt(ring)})`;
        const existing = await trx
          .selectFrom('Region')
          .select(['id', 'guildId'])
          .where('channelId', '=', snowflakeParam(channelId))
          .orderBy('id')
          .forUpdate()
          .executeTakeFirst();
        if (existing && existing.guildId !== guildId) {
          throw new Error(`Region ${existing.id} of channel ${channelId} is another server's`);
        }
        if (existing) {
          await trx.updateTable('Region').set({ bounds }).where('id', '=', existing.id).execute();
          saved.push({ channelId, regionId: existing.id, created: false });
        } else {
          const inserted = await trx
            .insertInto('Region')
            .values({ guildId, channelId, bounds })
            .executeTakeFirstOrThrow();
          saved.push({ channelId, regionId: Number(inserted.insertId), created: true });
        }
      }
      return saved;
    });
  }

  /**
   * Removes a region of a server (`/region remove`). With its row go the saved routes of that
   * region, by their foreign key, and the parties that were in it lose their region
   * (`Party.regionId` becomes null); its channel, its forum and the gyms are not touched.
   * `removed` is false when the server has no such region: nothing was changed. `routes` is
   * how many saved routes went with it; the forum and the list of what is going on are those of the
   * row as it was locked, whatever the directory in memory says.
   */
  async remove(id: number, guildId: number): Promise<RemovedRegion> {
    return inTransaction(this.db, async (trx) => {
      const row = await trx
        .selectFrom('Region')
        .select(['id', 'forumChannelId', 'summaryMessageId'])
        .where('id', '=', id)
        .where('guildId', '=', guildId)
        .forUpdate()
        .executeTakeFirst();
      if (!row) return { removed: false };
      const counted = await trx
        .selectFrom('SavedRoutes')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('region', '=', id)
        .executeTakeFirstOrThrow();
      await trx.deleteFrom('Region').where('id', '=', id).execute();
      return {
        removed: true,
        routes: Number(counted.n),
        forumChannelId: row.forumChannelId,
        summaryMessageId: row.summaryMessageId,
      };
    });
  }

  /** Returns false when the channel is not a region. */
  async setDescription(channelId: string, description: string | null): Promise<boolean> {
    const existing = await this.findByChannel(channelId);
    if (!existing) return false;
    await this.db
      .updateTable('Region')
      .set({ description })
      .where('id', '=', existing.id)
      .execute();
    return true;
  }

  /** Channel IDs of the regions containing the point, oldest region first. Empty when none do. */
  async channelsContaining(point: LatLon, guildId?: number): Promise<string[]> {
    let query = this.db
      .selectFrom('Region')
      .select('channelId')
      .where('channelId', 'is not', null)
      .where('bounds', 'is not', null)
      .where(sql<boolean>`ST_Contains(bounds, POINT(${point.lat}, ${point.lon}))`);
    if (guildId !== undefined) query = query.where('guildId', '=', guildId);
    const rows = await query.orderBy('id').execute();
    return rows.map((row) => row.channelId).filter((id): id is string => id !== null);
  }

  /** The regions containing the point, oldest first. Empty when none do. */
  async regionsContaining(point: LatLon, guildId?: number): Promise<Region[]> {
    let query = this.db
      .selectFrom('Region')
      .select(COLUMNS)
      .where('channelId', 'is not', null)
      .where('bounds', 'is not', null)
      .where(sql<boolean>`ST_Contains(bounds, POINT(${point.lat}, ${point.lon}))`);
    if (guildId !== undefined) query = query.where('guildId', '=', guildId);
    return toRegions(await query.orderBy('id').execute());
  }

  /** Returns false when the channel was not a region. */
  async delete(channelId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('Region')
      .where('channelId', '=', snowflakeParam(channelId))
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
