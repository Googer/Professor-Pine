import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { STAFF_PLACE, withOtherServer } from '../../test/support/gym-admin.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  NORTH_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { ALICE, REPORTER, testTrain } from '../../test/support/parties.js';
import {
  kmlArea,
  OTHER_REGION_STAFF,
  REGION_STAFF,
  regionAdminWith,
  SOUTH_CHANNEL,
  SOUTH_RING,
  squareRing,
  TOWN_CATEGORY,
  WEST_HALF_RING,
  WEST_RING,
} from '../../test/support/region-admin.js';
import type { KmlArea } from '@pine/wayspot-core/kml';
import { PartyStatus } from '../domain/party/status.js';
import type { RaidReport } from './party-service.js';

type Made = Awaited<ReturnType<typeof regionAdminWith>>;

/** Lets everything that is under way go out. */
async function settled(made: Made): Promise<void> {
  await made.attendance.flush();
  await made.access.flush();
  await made.service.flush();
}

const report = (made: Made, gymId: number, more: Partial<RaidReport> = {}): RaidReport => {
  const gym = made.directory.get(gymId);
  if (!gym) throw new Error(`no gym ${gymId}`);
  return {
    gym,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T5', shadow: false },
    boss: null,
    ...more,
  };
};

/** Reports a raid and gives it with its post. */
async function reported(made: Made, gymId: number) {
  const outcome = await made.service.reportRaid(report(made, gymId));
  if (outcome.kind !== 'created') throw new Error(`not created: ${outcome.kind}`);
  await made.service.flush();
  return { party: outcome.party, postId: outcome.party.forumPostId ?? '' };
}

/** Previews these areas and imports what the preview would. */
async function imported(made: Made, areas: KmlArea[]) {
  const preview = made.regionAdmin.preview(REGION_STAFF, areas);
  return made.regionAdmin.import(REGION_STAFF, preview.imports);
}

const regionOf = (made: Made, channelId: string) => made.regions.byChannel(channelId);

function missingPermissions(): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError(
    { code, message: 'Missing Permissions' },
    code,
    403,
    'DELETE',
    '/x',
    {},
  );
}

describe('RegionAdminService.preview', () => {
  it('says what an import would do, and changes nothing', async () => {
    const made = await regionAdminWith();
    const before = JSON.stringify(made.regions.rows);
    const preview = made.regionAdmin.preview(REGION_STAFF, [
      kmlArea('West', WEST_HALF_RING),
      kmlArea('South', SOUTH_RING, { holes: true }),
      kmlArea('Brand New', SOUTH_RING, { description: 'town' }),
    ]);
    expect(preview.mayCreate).toBe(true);
    expect(preview.imports).toMatchObject([
      // West holds gyms 1 to 6, 11 and 12; its western half loses the Bridge, the Mosaic and
      // the Post Office.
      { name: 'West', channel: { id: WEST_CHANNEL }, regionId: 1, gyms: 5, gymsBefore: 8 },
      { name: 'South', channel: { id: SOUTH_CHANNEL }, regionId: null, gyms: 0, holes: true },
      {
        name: 'Brand New',
        channelName: 'brand-new',
        channel: { create: { category: { id: TOWN_CATEGORY, name: 'Town' } } },
      },
    ]);
    expect(preview.newChannels).toEqual(['brand-new']);
    expect(preview.stranded).toBe(3);
    expect(JSON.stringify(made.regions.rows)).toBe(before);
    expect(made.gateway.calls).toEqual([]);
  });

  it('plans no creation where the bot may not create channels', async () => {
    const made = await regionAdminWith();
    made.gateway.noCreating.add(made.gateway.guildId);
    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('Brand New', SOUTH_RING)]);
    expect(preview.mayCreate).toBe(false);
    expect(preview.imports).toEqual([]);
    expect(preview.leftOut).toMatchObject([{ name: 'Brand New', reason: 'cannot-create' }]);
  });

  it('knows a text channel of the server, and nothing else, as what can be a region', async () => {
    const made = await regionAdminWith();
    expect(made.regionAdmin.textChannel(REGION_STAFF, SOUTH_CHANNEL)).toEqual({
      id: SOUTH_CHANNEL,
      name: 'south',
    });
    expect(made.regionAdmin.textChannel(REGION_STAFF, WEST_FORUM)).toBeUndefined();
    expect(made.regionAdmin.textChannel(REGION_STAFF, TOWN_CATEGORY)).toBeUndefined();
    expect(made.regionAdmin.textChannel(OTHER_REGION_STAFF, SOUTH_CHANNEL)).toBeUndefined();
    expect(made.regionAdmin.textChannel(REGION_STAFF, '1')).toBeUndefined();
  });

  it('does not offer a channel that is another server’s region', async () => {
    const made = await regionAdminWith();
    made.regions.rows.push({
      id: 9,
      guildId: 2,
      channelId: SOUTH_CHANNEL,
      description: null,
      bounds: null,
      forumChannelId: null,
      summaryMessageId: null,
    });
    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
    expect(preview.imports).toEqual([]);
    expect(preview.leftOut).toMatchObject([{ name: 'South', reason: 'foreign' }]);
  });
});

describe('RegionAdminService.import', () => {
  it('gives an existing region its new outline and makes a channel a region, with its forum', async () => {
    const made = await regionAdminWith();
    const outcome = await imported(made, [
      kmlArea('West', WEST_HALF_RING),
      kmlArea('South', SOUTH_RING),
    ]);
    expect(outcome.notImported).toEqual([]);
    expect(outcome.categoriesCreated).toEqual([]);
    const south = regionOf(made, SOUTH_CHANNEL);
    expect(outcome.imported).toEqual([
      {
        name: 'West',
        channelId: WEST_CHANNEL,
        regionId: 1,
        newRegion: false,
        unchanged: false,
        channelCreated: false,
        gyms: 5,
        forum: 'had',
      },
      {
        name: 'South',
        channelId: SOUTH_CHANNEL,
        regionId: south?.id,
        newRegion: true,
        unchanged: false,
        channelCreated: false,
        gyms: 0,
        forum: 'created',
      },
    ]);
    // The rows, and both directories: the Bridge (gym 4) lies in no region of West any more.
    expect(regionOf(made, WEST_CHANNEL)).toMatchObject({ bounds: WEST_HALF_RING, guildId: 1 });
    expect(south).toMatchObject({ bounds: SOUTH_RING, guildId: 1 });
    expect(made.directory.regionsOf(1)).toEqual([WEST_CHANNEL]);
    expect(made.directory.regionsOf(4)).toEqual([]);
    expect(made.directory.isRegion(SOUTH_CHANNEL)).toBe(true);
    // The new region has its forum, named after its channel, with the list of active raids.
    const forumId = south?.forumChannelId ?? '';
    expect(made.gateway.forums.get(forumId)).toMatchObject({
      name: `south${made.settings.regionForumSuffix}`,
      regionChannelId: SOUTH_CHANNEL,
    });
    expect(south?.summaryMessageId).not.toBeNull();
    // West kept its forum: nothing was made for it.
    expect(regionOf(made, WEST_CHANNEL)?.forumChannelId).toBe(WEST_FORUM);
  });

  it('notes who imported what in the log, by numbers', async () => {
    const made = await regionAdminWith();
    await imported(made, [kmlArea('West', WEST_HALF_RING), kmlArea('South', SOUTH_RING)]);
    const line = made.entries.find(
      (entry) => entry.msg === 'the outlines of regions were imported',
    );
    expect(line).toMatchObject({
      staff: REGION_STAFF.staffId,
      guild: 1,
      created: 1,
      replaced: 1,
      channelsCreated: 0,
      corners: [4, 4],
    });
  });

  it('creates the channel and the category of an area no channel has, and all at once', async () => {
    const made = await regionAdminWith();
    const outcome = await imported(made, [
      kmlArea('Riverside', SOUTH_RING, { description: 'River Towns' }),
      kmlArea('Hill Top', squareRing(41, -81, 41.1, -80.9), { description: 'river towns' }),
      kmlArea('Old Town', squareRing(42, -81, 42.1, -80.9), { description: 'TOWN' }),
    ]);
    expect(outcome.notImported).toEqual([]);
    expect(outcome.categoriesCreated).toEqual(['River Towns']);
    const channels = made.gateway.serverChannels(made.gateway.guildId) ?? [];
    const category = channels.find((channel) => channel.name === 'River Towns');
    expect(category?.kind).toBe('category');
    for (const [name, categoryId] of [
      ['riverside', category?.id],
      ['hill-top', category?.id],
      // A category of that name existed (whatever its case): it is used.
      ['old-town', TOWN_CATEGORY],
    ] as const) {
      const channel = channels.find((one) => one.name === name);
      expect(channel).toMatchObject({ kind: 'text', categoryId });
      const region = regionOf(made, channel?.id ?? '');
      expect(region).toMatchObject({ guildId: 1 });
      // One command gives channel, outline and forum.
      expect(made.gateway.forums.get(region?.forumChannelId ?? '')?.name).toBe(
        `${name}${made.settings.regionForumSuffix}`,
      );
    }
    expect(
      outcome.imported.map((region) => [region.channelCreated, region.newRegion, region.forum]),
    ).toEqual([
      [true, true, 'created'],
      [true, true, 'created'],
      [true, true, 'created'],
    ]);
    // One category was made, not two.
    expect(made.gateway.calls.filter((call) => call.startsWith('createCategory'))).toEqual([
      'createCategory River Towns',
    ]);
  });

  it('leaves out an area whose channel was deleted since the preview, and imports the rest', async () => {
    const made = await regionAdminWith();
    const preview = made.regionAdmin.preview(REGION_STAFF, [
      kmlArea('South', SOUTH_RING),
      kmlArea('West', WEST_HALF_RING),
    ]);
    made.gateway.gone.add(SOUTH_CHANNEL);
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(outcome.notImported).toEqual([
      { name: 'South', channelName: 'south', reason: 'channel-gone' },
    ]);
    expect(outcome.imported.map((region) => region.name)).toEqual(['West']);
    expect(regionOf(made, SOUTH_CHANNEL)).toBeUndefined();
  });

  it('takes a channel of the name that was made since the preview, and creates none', async () => {
    const made = await regionAdminWith();
    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('Riverside', SOUTH_RING)]);
    made.gateway.addChannel('c-new', 'riverside');
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(outcome.imported).toMatchObject([{ channelId: 'c-new', channelCreated: false }]);
    expect(made.gateway.createdChannels).toEqual([]);
  });

  it('leaves out what Discord refuses to create, with the reason, and imports the rest', async () => {
    const made = await regionAdminWith();
    const preview = made.regionAdmin.preview(REGION_STAFF, [
      kmlArea('Riverside', SOUTH_RING),
      kmlArea('West', WEST_HALF_RING),
    ]);
    made.gateway.noCreating.add(made.gateway.guildId);
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(outcome.notImported).toEqual([
      { name: 'Riverside', channelName: 'riverside', reason: 'no-permission' },
    ]);
    expect(outcome.imported.map((region) => region.name)).toEqual(['West']);
    expect(regionOf(made, WEST_CHANNEL)?.bounds).toEqual(WEST_HALF_RING);
  });

  it('answers a failure for a creation that throws, and goes on', async () => {
    const made = await regionAdminWith();
    const preview = made.regionAdmin.preview(REGION_STAFF, [
      kmlArea('Riverside', SOUTH_RING),
      kmlArea('West', WEST_HALF_RING),
    ]);
    made.gateway.failing.set('createTextChannel', new Error('Discord is down'));
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(outcome.notImported).toMatchObject([{ name: 'Riverside', reason: 'failed' }]);
    expect(outcome.imported.map((region) => region.name)).toEqual(['West']);
  });

  it('writes all outlines or none, and names the channels it had created for nothing', async () => {
    const made = await regionAdminWith();
    const preview = made.regionAdmin.preview(REGION_STAFF, [
      kmlArea('West', WEST_HALF_RING),
      kmlArea('Riverside', SOUTH_RING),
    ]);
    made.regions.failing = new Error('connection lost');
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    made.regions.failing = undefined;
    const [createdId] = made.gateway.createdChannels.slice(-1);
    expect(outcome.imported).toEqual([]);
    expect(outcome.notImported).toEqual([
      { name: 'West', channelName: 'west', reason: 'not-written' },
      {
        name: 'Riverside',
        channelName: 'riverside',
        reason: 'not-written',
        createdChannelId: createdId,
      },
    ]);
    // Nothing is a region that was none, and West is as it was.
    expect(regionOf(made, WEST_CHANNEL)?.bounds).toEqual(WEST_RING);
    expect(regionOf(made, createdId ?? '')).toBeUndefined();
    expect(made.gateway.forums.size).toBe(2);
  });

  it('imports a region although its forum cannot be made, and says why it has none', async () => {
    const made = await regionAdminWith();
    made.gateway.failing.set('createForum', missingPermissions());
    const outcome = await imported(made, [kmlArea('South', SOUTH_RING)]);
    expect(outcome.imported).toMatchObject([
      {
        name: 'South',
        forum: 'none',
        forumReason: expect.stringContaining('Manage Channels') as string,
      },
    ]);
    expect(regionOf(made, SOUTH_CHANNEL)).toMatchObject({
      bounds: SOUTH_RING,
      forumChannelId: null,
    });
  });

  it('leaves a raid in its post when the outline changes under it', async () => {
    const made = await regionAdminWith();
    // The Bridge (gym 4) falls out of West.
    const raid = await reported(made, 4);
    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('West', WEST_HALF_RING)]);
    expect(preview.raidsOutside).toBe(1);
    await made.regionAdmin.import(REGION_STAFF, preview.imports);
    await settled(made);
    expect(made.store.get(raid.party.id)).toMatchObject({ regionId: 1, forumPostId: raid.postId });
    expect(made.gateway.posts.get(raid.postId)?.archived).toBe(false);
  });

  it('runs under the lock of gym administration', async () => {
    const made = await regionAdminWith();
    const order: string[] = [];
    // A gym is being added at a place that the import takes out of West.
    const place = { lat: 40.05, lon: -80.02 };
    const adding = made.admin.add({ name: 'New Gym', ...place }, STAFF_PLACE).then((outcome) => {
      order.push(`gym ${outcome.kind}`);
    });
    const importing = imported(made, [kmlArea('West', WEST_HALF_RING)]).then(() => {
      order.push('import');
    });
    await Promise.all([adding, importing]);
    // The gym was added by the regions as they were; only then did they change.
    expect(order).toEqual(['gym added', 'import']);
  });

  it('shows the active trains anew, whose copies go by the regions', async () => {
    const made = await regionAdminWith([
      { ...testTrain(), forumChannelId: WEST_FORUM, forumPostId: null },
    ]);
    const changed: string[] = [];
    const original = made.service.changed.bind(made.service);
    made.service.changed = (id: string) => {
      changed.push(id);
      original(id);
    };
    await imported(made, [kmlArea('South', SOUTH_RING)]);
    expect(changed).toContain(testTrain().id);
  });
});

describe('RegionAdminService.list and exported', () => {
  it('lists the regions of the server with what is wrong with each', async () => {
    const made = await regionAdminWith();
    await withOtherServer(made);
    await reported(made, 1);
    made.gateway.gone.add(EAST_CHANNEL);
    made.gateway.gone.add(EAST_FORUM);
    const list = await made.regionAdmin.list(REGION_STAFF);
    expect(list.regions).toMatchObject([
      { region: { id: 1 }, channel: 'there', forum: 'there', gyms: 8, parties: 1 },
      { region: { id: 2 }, channel: 'gone', forum: 'gone', gyms: 3, parties: 0 },
      { region: { id: 3, bounds: null }, channel: 'there', forum: 'none', gyms: 0, parties: 0 },
    ]);
    // The Trailhead (gym 10) lies in no region of any server; the gym of the other server does.
    expect(list.unplacedGyms).toBe(1);
    expect(list.orphanForums).toEqual([]);
    // The other server sees its own region only.
    const other = await made.regionAdmin.list(OTHER_REGION_STAFF);
    expect(other.regions.map((line) => line.region.channelId)).toEqual([NORTH_CHANNEL]);
  });

  it('counts the elite raid gyms of a region', async () => {
    const made = await regionAdminWith();
    await made.admin.setElite(2, true, REGION_STAFF.staffId);
    const list = await made.regionAdmin.list(REGION_STAFF);
    expect(list.regions.map((line) => line.elite)).toEqual([1, 0, 0]);
  });

  it('exports the outlines so that an import finds every channel again', async () => {
    const made = await regionAdminWith();
    const all = made.regionAdmin.exported(REGION_STAFF);
    expect(all.areas).toEqual([
      { name: 'west', description: 'Town', outline: WEST_RING },
      { name: 'east', description: 'Town', outline: squareRing(40.0, -80.0, 40.1, -79.9) },
    ]);
    // The region without an outline is left out and counted.
    expect(all.skipped).toBe(1);
    // What was exported imports again as it is: nothing new, nothing left out.
    const preview = made.regionAdmin.preview(
      REGION_STAFF,
      all.areas.map((area) => ({ ...area, holes: false })),
    );
    expect(preview.leftOut).toEqual([]);
    expect(preview.newChannels).toEqual([]);
    expect(preview.imports.map((one) => one.regionId)).toEqual([1, 2]);
    expect(preview.stranded).toBe(0);
  });

  it('exports one region, also one whose channel is gone', async () => {
    const made = await regionAdminWith();
    made.gateway.gone.add(WEST_CHANNEL);
    expect(made.regionAdmin.exported(REGION_STAFF, 1)).toEqual({
      areas: [{ name: `deleted-channel-${WEST_CHANNEL}`, description: null, outline: WEST_RING }],
      skipped: 0,
    });
    expect(made.regionAdmin.exported(REGION_STAFF, 3)).toEqual({ areas: [], skipped: 1 });
    // Of all regions, the one without a channel is left out: no name would find it again.
    expect(made.regionAdmin.exported(REGION_STAFF).areas.map((area) => area.name)).toEqual([
      'east',
    ]);
    // Another server's region is none.
    expect(made.regionAdmin.exported(OTHER_REGION_STAFF, 1)).toEqual({ areas: [], skipped: 0 });
  });
});

describe('RegionAdminService.remove', () => {
  it('says beforehand what the removal does', async () => {
    const made = await regionAdminWith();
    await reported(made, 1);
    await reported(made, 7);
    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
    made.routes.add(ALICE, 2, 'East loop', [7]);
    expect(await made.regionAdmin.removalQuestion(1, REGION_STAFF)).toMatchObject({
      region: { id: 1 },
      channel: 'there',
      forum: 'there',
      parties: 1,
      strandedGyms: 8,
      routes: 1,
    });
    expect(await made.regionAdmin.removalQuestion(1, OTHER_REGION_STAFF)).toBeUndefined();
    expect(await made.regionAdmin.removalQuestion(99, REGION_STAFF)).toBeUndefined();
  });

  it('ends the parties, deletes the list and the row, and keeps the forum as history', async () => {
    const made = await regionAdminWith();
    const west = regionOf(made, WEST_CHANNEL);
    if (!west) throw new Error('no West');
    await made.service.ensureSummary(west);
    const summaryId = regionOf(made, WEST_CHANNEL)?.summaryMessageId ?? '';
    const raid = await reported(made, 1);
    const elsewhere = await reported(made, 7);
    made.routes.add(ALICE, 1, 'Loop', [1, 2]);
    made.routes.add(ALICE, 2, 'East loop', [7]);

    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    await settled(made);

    expect(outcome).toMatchObject({
      kind: 'removed',
      region: { id: 1 },
      ended: 1,
      routes: 1,
      strandedGyms: 8,
      forum: 'kept',
    });
    // The raid is over, its post says why and is archived; the raid of East goes on.
    expect(made.store.get(raid.party.id)).toBeUndefined();
    const post = made.gateway.posts.get(raid.postId);
    expect(post).toMatchObject({ archived: true, locked: true });
    expect(
      made.gateway.messagesIn(raid.postId).map((message) => message.message.content),
    ).toContain('This region is being removed, so this raid was closed.');
    expect(made.store.get(elsewhere.party.id)).toBeDefined();
    // The list of active raids is gone, the forum and its posts stay.
    expect(made.gateway.deletedPosts).toContain(summaryId);
    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
    expect(made.gateway.deletedChannels).toEqual([]);
    // The row, its routes, and what the directories know.
    expect(made.regions.byId(1)).toBeUndefined();
    expect(made.routes.rows.map((row) => row.name)).toEqual(['East loop']);
    expect(made.directory.isRegion(WEST_CHANNEL)).toBe(false);
    expect(made.directory.regionsOf(1)).toEqual([]);
    // The gyms are all still there, and so is the channel.
    expect(made.directory.get(1)).toBeDefined();
    expect(made.gateway.serverChannels(made.gateway.guildId)?.map((one) => one.id)).toContain(
      WEST_CHANNEL,
    );
    const line = made.entries.find((entry) => entry.msg === 'a region was removed');
    expect(line).toMatchObject({ staff: REGION_STAFF.staffId, region: 1, ended: 1, forum: 'kept' });
  });

  it('deletes the forum when asked, with every post in it', async () => {
    const made = await regionAdminWith();
    const raid = await reported(made, 1);
    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
    await settled(made);
    expect(outcome).toMatchObject({ kind: 'removed', forum: 'deleted', ended: 1 });
    expect(made.gateway.deletedChannels).toEqual([WEST_FORUM]);
    expect(made.gateway.posts.has(raid.postId)).toBe(false);
    // The party ended before its post went: nothing is left active without a post.
    expect(made.store.active()).toEqual([]);
  });

  it('removes the region although its forum cannot be deleted, and says so', async () => {
    const made = await regionAdminWith();
    made.gateway.failing.set('deleteChannel', missingPermissions());
    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
    expect(outcome).toMatchObject({ kind: 'removed', forum: 'not-deleted', forumDenied: true });
    expect(made.regions.byId(1)).toBeUndefined();
    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
  });

  it('says of a region without a forum, or whose forum is gone, that there is none to keep', async () => {
    const made = await regionAdminWith();
    expect(await made.regionAdmin.remove(3, REGION_STAFF, 'delete')).toMatchObject({
      kind: 'removed',
      forum: 'none',
      strandedGyms: 0,
    });
    made.gateway.gone.add(EAST_FORUM);
    expect(await made.regionAdmin.remove(2, REGION_STAFF, 'delete')).toMatchObject({
      kind: 'removed',
      forum: 'gone',
    });
    expect(made.gateway.calls.filter((call) => call.startsWith('deleteChannel'))).toEqual([]);
  });

  it('is no region for the staff of another server, nor one that is gone', async () => {
    const made = await regionAdminWith();
    expect(await made.regionAdmin.remove(1, OTHER_REGION_STAFF, 'delete')).toEqual({
      kind: 'gone',
    });
    expect(made.regions.byId(1)).toBeDefined();
    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    expect(await made.regionAdmin.remove(1, REGION_STAFF, 'keep')).toEqual({ kind: 'gone' });
  });

  it('does nothing more when a party cannot be ended, and takes parties again', async () => {
    const made = await regionAdminWith();
    const raid = await reported(made, 1);
    made.storage.failing = new Error('connection lost');
    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
    made.storage.failing = undefined;
    expect(outcome).toMatchObject({ kind: 'stuck', ended: 0, party: { id: raid.party.id } });
    expect(made.regions.byId(1)).toBeDefined();
    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
    expect(made.store.get(raid.party.id)).toBeDefined();
    // The region is open again: a raid can be reported in it.
    await expect(reported(made, 2)).resolves.toBeDefined();
  });

  it('leaves the region as it was when its row cannot be deleted', async () => {
    const made = await regionAdminWith();
    await reported(made, 1);
    made.regions.failing = new Error('connection lost');
    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
    made.regions.failing = undefined;
    await settled(made);
    expect(outcome).toEqual({ kind: 'failed', ended: 1 });
    expect(made.regions.byId(1)).toBeDefined();
    expect(made.gateway.forums.has(WEST_FORUM)).toBe(true);
    expect(made.directory.isRegion(WEST_CHANNEL)).toBe(true);
    await expect(reported(made, 2)).resolves.toBeDefined();
  });

  it('ends a party that was being stored while the removal began', async () => {
    const made = await regionAdminWith();
    // Both in one turn: the report is on its way to the database when the removal starts.
    const reporting = made.service.reportRaid(report(made, 1)).then(
      (reportOutcome) => reportOutcome.kind,
      // Its raid was ended under it while its post was being made: the report says there is
      // no region (its post is taken back); anything else is a failure.
      (err: unknown) => (err instanceof Error ? err.message : 'failed'),
    );
    const removing = made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    const [reportOutcome, outcome] = await Promise.all([reporting, removing]);
    await settled(made);
    expect(outcome).toMatchObject({ kind: 'removed', ended: 1 });
    expect(reportOutcome).toBe('no-region');
    // Never an active party of a region that is gone, and no post left behind for it.
    expect(made.store.active()).toEqual([]);
    expect(made.gateway.postsIn(WEST_FORUM).filter((post) => !post.archived)).toEqual([]);
    expect(made.regions.byId(1)).toBeUndefined();
  });

  it('refuses whoever still holds the region after it is gone', async () => {
    const made = await regionAdminWith();
    const held = regionOf(made, WEST_CHANNEL);
    if (!held) throw new Error('no West');
    const raid = await reported(made, 7);
    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    // A report, a meetup and a train in what was the channel of West.
    expect((await made.service.reportRaid(report(made, 1))).kind).toBe('no-region');
    expect(
      (
        await made.service.createMeetup({
          name: 'Picnic',
          creatorId: REPORTER,
          regionChannelId: WEST_CHANNEL,
        })
      ).kind,
    ).toBe('no-region');
    // A raid of East that is moved into the region somebody still holds: it stays where it is.
    const gym = made.directory.get(1);
    if (!gym) throw new Error('no gym 1');
    expect((await made.service.relocate(raid.party.id, gym, held)).kind).toBe('no-forum');
    expect(made.store.get(raid.party.id)).toMatchObject({ regionId: 2 });
    expect(
      made.storage.writes.every((party) => party.regionId !== 1 || party.status === 'ended'),
    ).toBe(true);
  });

  it('keeps the sweeps working for a forum that no region has', async () => {
    const made = await regionAdminWith();
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const raid = await reported(made, 1);
    await made.attendance.signUp(raid.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
    await settled(made);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);

    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    await settled(made);
    // Her access went with the party, as at any end.
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(false);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);

    // The forum is one that parties name and no region has.
    expect(await made.regionAdmin.orphanForums(REGION_STAFF)).toEqual([WEST_FORUM]);
    expect((await made.regionAdmin.list(REGION_STAFF)).orphanForums).toEqual([WEST_FORUM]);
    expect(await made.regionAdmin.orphanForums(OTHER_REGION_STAFF)).toEqual([]);

    // A late message opens the archived post again: the hourly sweep archives it as before.
    await made.gateway.sendMessage(raid.postId, { content: 'late' }, { reopen: true });
    expect(made.gateway.posts.get(raid.postId)?.archived).toBe(false);
    expect(await made.service.sweepPosts()).toBe(1);
    expect(made.gateway.posts.get(raid.postId)?.archived).toBe(true);
    // And the sweep of forum access copes with a grant in such a forum.
    expect(await made.access.sweep()).toBe(0);
    await made.service.checkSummaries();

    // Once the forum is deleted by hand it is no orphan any more, and the sweep is not troubled.
    made.gateway.gone.add(WEST_FORUM);
    expect(await made.regionAdmin.orphanForums(REGION_STAFF)).toEqual([]);
    expect(await made.service.sweepPosts()).toBe(0);
  });

  it('takes back a grant of access to a forum whose region is gone', async () => {
    const made = await regionAdminWith();
    made.gateway.shutOut(WEST_FORUM, ALICE);
    // What a stop of the process left behind: a recorded grant that nothing calls for.
    await made.grants.add({
      forumChannelId: WEST_FORUM,
      memberId: ALICE,
      guildId: 1,
      createdAt: 1,
    });
    await made.access.load();
    await made.gateway.admitMember(WEST_FORUM, ALICE);
    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    expect(await made.access.sweep()).toBe(1);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
  });

  it('leaves the gyms of an overlapping region of the server in that region', async () => {
    const made = await regionAdminWith();
    // South is given the outline of West: every gym of West lies in both.
    await imported(made, [kmlArea('South', WEST_RING)]);
    const question = await made.regionAdmin.removalQuestion(1, REGION_STAFF);
    expect(question?.strandedGyms).toBe(0);
    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    expect(outcome).toMatchObject({ kind: 'removed', strandedGyms: 0 });
    expect(made.directory.regionsOf(1)).toEqual([SOUTH_CHANNEL]);
    expect(regionOf(made, UNBOUNDED_CHANNEL)).toBeDefined();
  });
});

describe('RegionAdminService: the forums of an import', () => {
  it('gives a region whose forum was deleted by hand a new one', async () => {
    const made = await regionAdminWith();
    made.gateway.gone.add(WEST_FORUM);
    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('West', WEST_HALF_RING)]);
    expect(preview.imports.map((one) => one.hasForum)).toEqual([false]);
    expect(preview.newForums).toBe(1);
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(outcome.imported.map((one) => one.forum)).toEqual(['created']);
    const forumId = regionOf(made, WEST_CHANNEL)?.forumChannelId ?? '';
    expect(forumId).not.toBe(WEST_FORUM);
    expect(made.gateway.channelKind(forumId)).toBe('forum');
  });

  /** West's forum named and placed as the bot makes one; then West removed, the forum kept. */
  async function removedWithKeptForum(made: Made): Promise<string[]> {
    const forum = made.gateway.forums.get(WEST_FORUM);
    if (!forum) throw new Error('no forum of West');
    forum.name = 'west-meetups';
    forum.categoryId = TOWN_CATEGORY;
    await reported(made, 1);
    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    await settled(made);
    return made.regionAdmin.orphanForums(REGION_STAFF);
  }

  it('takes back the forum it kept when a removed region is imported again', async () => {
    const made = await regionAdminWith();
    const orphans = await removedWithKeptForum(made);
    expect(orphans).toEqual([WEST_FORUM]);
    const preview = made.regionAdmin.preview(
      REGION_STAFF,
      [kmlArea('West', WEST_RING)],
      undefined,
      orphans,
    );
    expect(preview.imports[0]).toMatchObject({
      hasForum: false,
      adoptForum: { id: WEST_FORUM, name: 'west-meetups' },
    });
    expect(preview.newForums).toBe(0);
    const calls = made.gateway.calls.length;
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(outcome.imported.map((one) => one.forum)).toEqual(['adopted']);
    const west = regionOf(made, WEST_CHANNEL);
    expect(west?.forumChannelId).toBe(WEST_FORUM);
    expect(
      made.gateway.calls.slice(calls).filter((call) => call.startsWith('createForum')),
    ).toEqual([]);
    // Set up like any forum of a region: its list of active raids is there again.
    expect(west?.summaryMessageId).not.toBeNull();
    expect(await made.regionAdmin.orphanForums(REGION_STAFF)).toEqual([]);
  });

  it('makes a new forum when the one it would take back is gone by the press', async () => {
    const made = await regionAdminWith();
    const orphans = await removedWithKeptForum(made);
    const preview = made.regionAdmin.preview(
      REGION_STAFF,
      [kmlArea('West', WEST_RING)],
      undefined,
      orphans,
    );
    made.gateway.gone.add(WEST_FORUM);
    const outcome = await made.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(outcome.imported.map((one) => one.forum)).toEqual(['created']);
    expect(regionOf(made, WEST_CHANNEL)?.forumChannelId).not.toBe(WEST_FORUM);
  });
});
