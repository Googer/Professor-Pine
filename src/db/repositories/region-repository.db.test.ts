import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import { RegionRepository } from './region-repository.js';

const GUILD = '412345678901234567';
const OTHER_GUILD = '412345678901234568';
const DOWNTOWN = '1234567890123456788';
const NORTH = '1234567890123456789';
const OTHER = '1234567890123456790';
const FORUM = '1234567890123456800';
const OTHER_FORUM = '1234567890123456801';
const SUMMARY = '1234567890123456900';

/** About 11 km square around downtown Pittsburgh. */
const DOWNTOWN_RING: LatLon[] = [
  { lat: 40.4, lon: -80.05 },
  { lat: 40.4, lon: -79.95 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.5, lon: -80.05 },
  { lat: 40.4, lon: -80.05 },
];
/** The square directly north of it. */
const NORTH_RING: LatLon[] = [
  { lat: 40.5, lon: -80.05 },
  { lat: 40.5, lon: -79.95 },
  { lat: 40.6, lon: -79.95 },
  { lat: 40.6, lon: -80.05 },
  { lat: 40.5, lon: -80.05 },
];

describe('RegionRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let regions: RegionRepository;
  let guildId: number;
  let otherGuildId: number;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    regions = new RegionRepository(db);
    const guilds = new GuildRepository(db);
    guildId = await guilds.ensure(GUILD);
    otherGuildId = await guilds.ensure(OTHER_GUILD);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Region').execute();
  });

  it('saves a region and reads its outline back exactly', async () => {
    const saved = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    expect(saved).toEqual({
      id: expect.any(Number) as number,
      guildId,
      channelId: DOWNTOWN,
      description: null,
      bounds: DOWNTOWN_RING,
      forumChannelId: null,
      summaryMessageId: null,
    });
    expect(await regions.findByChannel(DOWNTOWN)).toEqual(saved);
  });

  it('replaces the outline of an existing region instead of adding a row', async () => {
    const first = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    const second = await regions.saveBounds(guildId, DOWNTOWN, NORTH_RING);
    expect(second.id).toBe(first.id);
    expect(second.bounds).toEqual(NORTH_RING);
    expect(await regions.listAll()).toHaveLength(1);
  });

  it('refuses an open outline and stores nothing', async () => {
    await expect(regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING.slice(0, 4))).rejects.toThrow(
      /closed/,
    );
    expect(await regions.listAll()).toHaveLength(0);
  });

  it('tells apart channel IDs that differ only in the last digit', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(guildId, NORTH, NORTH_RING);
    expect((await regions.findByChannel(DOWNTOWN))?.bounds).toEqual(DOWNTOWN_RING);
    expect((await regions.findByChannel(NORTH))?.bounds).toEqual(NORTH_RING);
    expect(await regions.delete(DOWNTOWN)).toBe(true);
    expect(await regions.findByChannel(DOWNTOWN)).toBeUndefined();
    expect(await regions.findByChannel(NORTH)).toBeDefined();
  });

  it('returns undefined for a channel that is not a region', async () => {
    expect(await regions.findByChannel('999999999999999999')).toBeUndefined();
    expect(await regions.delete('999999999999999999')).toBe(false);
  });

  it('finds the channels whose region contains a point', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(guildId, NORTH, NORTH_RING);
    expect(await regions.channelsContaining({ lat: 40.45, lon: -80 })).toEqual([DOWNTOWN]);
    expect(await regions.channelsContaining({ lat: 40.55, lon: -80 })).toEqual([NORTH]);
  });

  it('returns no channels for a point outside every region', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    expect(await regions.channelsContaining({ lat: 41, lon: -80 })).toEqual([]);
    expect(await regions.channelsContaining({ lat: 0, lon: 0 })).toEqual([]);
  });

  it('limits a containment search to one guild when asked', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(otherGuildId, NORTH, DOWNTOWN_RING);
    const point = { lat: 40.45, lon: -80 };
    expect(await regions.channelsContaining(point)).toEqual([DOWNTOWN, NORTH]);
    expect(await regions.channelsContaining(point, otherGuildId)).toEqual([NORTH]);
  });

  it('lists the regions of one guild', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(otherGuildId, NORTH, NORTH_RING);
    expect((await regions.listForGuild(guildId)).map((r) => r.channelId)).toEqual([DOWNTOWN]);
    expect((await regions.listAll()).map((r) => r.channelId)).toEqual([DOWNTOWN, NORTH]);
  });

  it('sets and clears a description', async () => {
    await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    expect(await regions.setDescription(DOWNTOWN, 'Downtown and the North Shore')).toBe(true);
    expect((await regions.findByChannel(DOWNTOWN))?.description).toBe(
      'Downtown and the North Shore',
    );
    expect(await regions.setDescription(DOWNTOWN, null)).toBe(true);
    expect((await regions.findByChannel(DOWNTOWN))?.description).toBeNull();
    expect(await regions.setDescription(NORTH, 'nope')).toBe(false);
  });

  it('reads a legacy row that has no outline yet', async () => {
    await db.insertInto('Region').values({ guildId, channelId: DOWNTOWN }).execute();
    expect((await regions.findByChannel(DOWNTOWN))?.bounds).toBeNull();
    expect(await regions.channelsContaining({ lat: 40.45, lon: -80 })).toEqual([]);
  });

  it('finds a region by its row id', async () => {
    const saved = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await expect(regions.findById(saved.id)).resolves.toEqual(saved);
    await expect(regions.findById(saved.id + 1000)).resolves.toBeUndefined();
  });

  it('gives the regions containing a point as rows, oldest first', async () => {
    const downtown = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.saveBounds(guildId, NORTH, NORTH_RING);
    const overlapping = await regions.saveBounds(otherGuildId, OTHER, DOWNTOWN_RING);
    const point = { lat: 40.45, lon: -80.0 };
    await expect(regions.regionsContaining(point)).resolves.toEqual([downtown, overlapping]);
    await expect(regions.regionsContaining(point, otherGuildId)).resolves.toEqual([overlapping]);
    await expect(regions.regionsContaining({ lat: 41, lon: -80 })).resolves.toEqual([]);
  });

  it('links a region to its forum and finds it by the forum', async () => {
    const { id } = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await expect(regions.setForum(id, FORUM)).resolves.toBe('set');
    await expect(regions.findByForum(FORUM)).resolves.toMatchObject({ id, forumChannelId: FORUM });
    await expect(regions.findByChannel(DOWNTOWN)).resolves.toMatchObject({ forumChannelId: FORUM });
    await expect(regions.findByForum(DOWNTOWN)).resolves.toBeUndefined();
    await expect(regions.setForum(id + 1000, FORUM)).resolves.toBe('no-region');
  });

  it('gives one forum to one region only', async () => {
    const first = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    const second = await regions.saveBounds(guildId, NORTH, NORTH_RING);
    await expect(regions.setForum(first.id, FORUM)).resolves.toBe('set');
    await expect(regions.setForum(second.id, FORUM)).resolves.toBe('forum-taken');
    await expect(regions.findById(second.id)).resolves.toMatchObject({ forumChannelId: null });
    await expect(regions.findByForum(FORUM)).resolves.toMatchObject({ id: first.id });

    await expect(regions.setForum(first.id, null)).resolves.toBe('set');
    await expect(regions.setForum(second.id, FORUM)).resolves.toBe('set');
    await expect(regions.findByForum(FORUM)).resolves.toMatchObject({ id: second.id });
  });

  it('finds a row with no channel when setting its forum', async () => {
    await db.insertInto('Region').values({ guildId }).execute();
    const row = await db.selectFrom('Region').select('id').executeTakeFirstOrThrow();
    await expect(regions.setForum(row.id, FORUM)).resolves.toBe('set');
  });

  it('remembers the summary post and forgets it when the forum changes', async () => {
    const { id } = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.setForum(id, FORUM);
    await expect(regions.setSummaryMessage(id, FORUM, SUMMARY)).resolves.toBe(true);
    await expect(regions.findById(id)).resolves.toMatchObject({ summaryMessageId: SUMMARY });

    // The same forum again keeps the post; another forum, or none, forgets it.
    await expect(regions.setForum(id, FORUM)).resolves.toBe('set');
    await expect(regions.findById(id)).resolves.toMatchObject({ summaryMessageId: SUMMARY });
    await regions.setForum(id, OTHER_FORUM);
    await expect(regions.findById(id)).resolves.toMatchObject({
      forumChannelId: OTHER_FORUM,
      summaryMessageId: null,
    });
    await regions.setSummaryMessage(id, OTHER_FORUM, SUMMARY);
    await regions.setForum(id, null);
    await expect(regions.findById(id)).resolves.toMatchObject({
      forumChannelId: null,
      summaryMessageId: null,
    });
    await expect(regions.setSummaryMessage(id + 1000, FORUM, SUMMARY)).resolves.toBe(false);
  });

  it('writes the summary post only while the region still has the forum it was made in', async () => {
    const { id } = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await expect(regions.setSummaryMessage(id, FORUM, SUMMARY)).resolves.toBe(false);
    await expect(regions.findById(id)).resolves.toMatchObject({ summaryMessageId: null });

    await regions.setForum(id, OTHER_FORUM);
    await expect(regions.setSummaryMessage(id, FORUM, SUMMARY)).resolves.toBe(false);
    await expect(regions.findById(id)).resolves.toMatchObject({ summaryMessageId: null });

    // Setting the value it already has is still a success.
    await expect(regions.setSummaryMessage(id, OTHER_FORUM, SUMMARY)).resolves.toBe(true);
    await expect(regions.setSummaryMessage(id, OTHER_FORUM, SUMMARY)).resolves.toBe(true);
  });

  it('keeps the outline and the forum apart when the outline is replaced', async () => {
    const { id } = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
    await regions.setForum(id, FORUM);
    await regions.saveBounds(guildId, DOWNTOWN, NORTH_RING);
    await expect(regions.findById(id)).resolves.toMatchObject({
      bounds: NORTH_RING,
      forumChannelId: FORUM,
    });
  });

  describe('saveOutlines', () => {
    it('gives several channels their outlines: a new region for one, a new outline for another', async () => {
      const existing = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
      await regions.setForum(existing.id, FORUM);
      const saved = await regions.saveOutlines(guildId, [
        { channelId: DOWNTOWN, ring: NORTH_RING },
        { channelId: NORTH, ring: DOWNTOWN_RING },
      ]);
      expect(saved).toEqual([
        { channelId: DOWNTOWN, regionId: existing.id, created: false },
        { channelId: NORTH, regionId: expect.any(Number) as number, created: true },
      ]);
      // The replaced outline keeps its row, its forum and its server.
      await expect(regions.findByChannel(DOWNTOWN)).resolves.toMatchObject({
        id: existing.id,
        guildId,
        bounds: NORTH_RING,
        forumChannelId: FORUM,
      });
      await expect(regions.findByChannel(NORTH)).resolves.toMatchObject({
        id: saved[1]?.regionId,
        guildId,
        bounds: DOWNTOWN_RING,
        forumChannelId: null,
      });
      await expect(regions.saveOutlines(guildId, [])).resolves.toEqual([]);
    });

    it('writes all or none: a channel of another server fails the whole call', async () => {
      await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
      await regions.saveBounds(otherGuildId, OTHER, DOWNTOWN_RING);
      await expect(
        regions.saveOutlines(guildId, [
          { channelId: DOWNTOWN, ring: NORTH_RING },
          { channelId: NORTH, ring: NORTH_RING },
          { channelId: OTHER, ring: NORTH_RING },
        ]),
      ).rejects.toThrow(/another server/u);
      await expect(regions.findByChannel(DOWNTOWN)).resolves.toMatchObject({
        bounds: DOWNTOWN_RING,
      });
      await expect(regions.findByChannel(NORTH)).resolves.toBeUndefined();
      await expect(regions.findByChannel(OTHER)).resolves.toMatchObject({
        guildId: otherGuildId,
        bounds: DOWNTOWN_RING,
      });
    });

    it('writes none when one outline is no closed ring', async () => {
      await expect(
        regions.saveOutlines(guildId, [
          { channelId: DOWNTOWN, ring: DOWNTOWN_RING },
          { channelId: NORTH, ring: NORTH_RING.slice(0, -1) },
        ]),
      ).rejects.toThrow(/closed ring/u);
      await expect(regions.listAll()).resolves.toEqual([]);
    });

    it('keeps an outline of five thousand corners exactly', async () => {
      const corners = 5_000;
      const ring = Array.from({ length: corners }, (_unused, i) => {
        const angle = (2 * Math.PI * i) / corners;
        return { lat: 40 + 0.2 * Math.sin(angle), lon: -80 + 0.2 * Math.cos(angle) };
      });
      const closed = [...ring, ring[0] ?? { lat: 0, lon: 0 }];
      await regions.saveOutlines(guildId, [{ channelId: DOWNTOWN, ring: closed }]);
      const read = await regions.findByChannel(DOWNTOWN);
      expect(read?.bounds).toEqual(closed);
      // MySQL and the membership in memory agree on it.
      await expect(regions.channelsContaining({ lat: 40, lon: -80 }, guildId)).resolves.toEqual([
        DOWNTOWN,
      ]);
      await expect(regions.channelsContaining({ lat: 40.3, lon: -80 }, guildId)).resolves.toEqual(
        [],
      );
    });
  });

  describe('remove', () => {
    it('removes a region of the server with its saved routes, and frees its parties', async () => {
      const going = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
      const staying = await regions.saveBounds(guildId, NORTH, NORTH_RING);
      await regions.setForum(going.id, FORUM);
      await regions.setSummaryMessage(going.id, FORUM, SUMMARY);
      await db.deleteFrom('SavedRoutes').execute();
      await db.deleteFrom('Party').execute();
      await db
        .insertInto('SavedRoutes')
        .values([
          { region: going.id, name: 'Loop', gyms: '1,2' },
          { region: going.id, name: 'Other', gyms: '3' },
          { region: staying.id, name: 'Stays', gyms: '4' },
        ])
        .execute();
      await sql`
        insert into Party (id, guildId, type, status, regionId, forumChannelId, mirrorMessages,
          createdById, state, createdAt, updatedAt)
        values ('p1', ${guildId}, 'raid', 'ended', ${going.id}, ${FORUM}, '[]', '1', '{}', 1, 1)`.execute(
        db,
      );

      // With the forum and the list of active raids of the row as it was locked and deleted.
      await expect(regions.remove(going.id, guildId)).resolves.toEqual({
        removed: true,
        routes: 2,
        forumChannelId: FORUM,
        summaryMessageId: SUMMARY,
      });

      await expect(regions.findById(going.id)).resolves.toBeUndefined();
      await expect(regions.findById(staying.id)).resolves.toBeDefined();
      const routes = await db.selectFrom('SavedRoutes').select('name').execute();
      expect(routes.map((row) => row.name)).toEqual(['Stays']);
      // The row of the party stays, without its region and with its forum: by that the forum
      // is still found.
      const party = await db
        .selectFrom('Party')
        .select(['regionId', 'forumChannelId'])
        .executeTakeFirstOrThrow();
      expect(party).toEqual({ regionId: null, forumChannelId: FORUM });
      await db.deleteFrom('Party').execute();
      await db.deleteFrom('SavedRoutes').execute();
    });

    it('removes nothing for another server, or for a region that is not there', async () => {
      const region = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
      await expect(regions.remove(region.id, otherGuildId)).resolves.toEqual({ removed: false });
      await expect(regions.remove(region.id + 1000, guildId)).resolves.toEqual({
        removed: false,
      });
      await expect(regions.findById(region.id)).resolves.toBeDefined();
    });
  });
});
