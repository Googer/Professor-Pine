import { describe, expect, it, onTestFinished } from 'vitest';
import { Tally } from '../../test/support/tally.js';
import { watchImmediates } from '../../test/support/timers.js';
import { EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
import { REPORTER, testRaid } from '../../test/support/parties.js';
import {
  kmlArea,
  REGION_STAFF,
  regionAdminWith,
  SOUTH_CHANNEL,
  SOUTH_RING,
} from '../../test/support/region-admin.js';
import { PartyStatus } from '../domain/party/status.js';

type Made = Awaited<ReturnType<typeof regionAdminWith>>;

async function reported(made: Made, gymId: number) {
  const gym = made.directory.get(gymId);
  if (!gym) throw new Error(`no gym ${gymId}`);
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T5', shadow: false },
    boss: null,
  });
  if (outcome.kind !== 'created') throw new Error(`not created: ${outcome.kind}`);
  await made.service.flush();
  return { party: outcome.party, postId: outcome.party.forumPostId ?? '' };
}

/** Makes the next `times` loads of the gym directory fail. */
function failLoads(made: Made, times: number): void {
  const load = made.directory.load.bind(made.directory);
  let left = times;
  made.directory.load = () => {
    if (left > 0) {
      left--;
      return Promise.reject(new Error('connection lost'));
    }
    return load();
  };
}

describe('RegionAdminService: what review A asked for', () => {
  it('says in its post that the region is being removed', async () => {
    const made = await regionAdminWith();
    const raid = await reported(made, 1);
    await made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    expect(made.gateway.messagesIn(raid.postId).map((one) => one.message.content)).toContain(
      'This region is being removed, so this raid was closed.',
    );
  });

  it('deletes the forum and the list the row had when it was deleted, not what memory says', async () => {
    const made = await regionAdminWith();
    const remove = made.regions.remove;
    // The row in the database names East's forum (memory had not caught up with a change).
    made.regions.remove = async (id, guildId) => {
      const removed = await remove(id, guildId);
      return removed.removed ? { ...removed, forumChannelId: EAST_FORUM } : removed;
    };
    const outcome = await made.regionAdmin.remove(1, REGION_STAFF, 'delete');
    expect(outcome).toMatchObject({
      kind: 'removed',
      forum: 'deleted',
      forumChannelId: EAST_FORUM,
    });
    expect(made.gateway.deletedChannels).toEqual([EAST_FORUM]);
  });

  it('answers gone when the row was gone already, after loading the regions again', async () => {
    const made = await regionAdminWith();
    made.regions.remove = () => Promise.resolve({ removed: false });
    let loads = 0;
    const load = made.directory.load.bind(made.directory);
    made.directory.load = () => {
      loads++;
      return load();
    };
    expect(await made.regionAdmin.remove(1, REGION_STAFF, 'delete')).toEqual({ kind: 'gone' });
    expect(loads).toBe(1);
    expect(made.gateway.deletedChannels).toEqual([]);
  });

  it('counts a forum of a server the bot does not know as gone, and deletes nothing', async () => {
    const made = await regionAdminWith();
    const outcome = await made.regionAdmin.remove(
      1,
      { ...REGION_STAFF, server: '999999999999999999' },
      'delete',
    );
    expect(outcome).toMatchObject({ kind: 'removed', forum: 'gone' });
    expect(made.gateway.deletedChannels).toEqual([]);
  });

  it('loads the regions once more when that fails, and says when it failed twice', async () => {
    const once = await regionAdminWith();
    failLoads(once, 1);
    const preview = once.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
    const imported = await once.regionAdmin.import(REGION_STAFF, preview.imports);
    expect(imported.reloaded).toBe(true);
    expect(once.directory.isRegion(SOUTH_CHANNEL)).toBe(true);

    const twice = await regionAdminWith();
    failLoads(twice, 2);
    const again = twice.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
    expect((await twice.regionAdmin.import(REGION_STAFF, again.imports)).reloaded).toBe(false);

    const removing = await regionAdminWith();
    failLoads(removing, 2);
    expect(await removing.regionAdmin.remove(3, REGION_STAFF, 'keep')).toMatchObject({
      kind: 'removed',
      reloaded: false,
    });
  });

  it('sets up the forums under the lock, so that gym administration waits for them', async () => {
    const made = await regionAdminWith();
    // The forum is made only when the test says so.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const asked = new Tally('the forums asked for');
    const createForum = made.gateway.createForum.bind(made.gateway);
    made.gateway.createForum = async (...args) => {
      asked.add();
      await held;
      return createForum(...args);
    };
    const immediates = watchImmediates();
    onTestFinished(() => {
      immediates.restore();
    });
    const preview = made.regionAdmin.preview(REGION_STAFF, [kmlArea('South', SOUTH_RING)]);
    const importing = made.regionAdmin.import(REGION_STAFF, preview.imports);
    await asked.reached(1);
    // The outlines are written; the forum is on its way. A gym added now waits for it.
    let added = false;
    const adding = made.admin
      .add(
        { name: 'New Gym', lat: 40.015, lon: -80.015 },
        { staffId: '1', guildId: 1, channelIds: [] },
      )
      .then(() => {
        added = true;
      });
    // All the gym can do while the forum is held is done: it waits.
    await immediates.settle();
    expect(added).toBe(false);
    release();
    await Promise.all([importing, adding]);
    expect(added).toBe(true);
    expect(made.regions.byChannel(SOUTH_CHANNEL)?.forumChannelId).toEqual(expect.any(String));
  });

  it('answers a report that races the removal as one in no region', async () => {
    const made = await regionAdminWith();
    const gym = made.directory.get(1);
    if (!gym) throw new Error('no gym 1');
    const reporting = made.service.reportRaid({
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    const removing = made.regionAdmin.remove(1, REGION_STAFF, 'keep');
    const [outcome] = await Promise.all([reporting, removing]);
    expect(outcome.kind).toBe('no-region');
    expect(made.store.active()).toEqual([]);
    expect(made.entries.filter((entry) => Number(entry.level) >= 50)).toEqual([]);
    // Said in the log all the same, with why: a genuine failure in that moment is not lost.
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'a post was not made: its region is being removed',
      ),
    ).toMatchObject([{ region: 1, err: { message: expect.any(String) as string } }]);
  });
});

describe('PartyService.sweepPosts: forums no region has', () => {
  it('looks only at forums the gateway still knows as forums', async () => {
    const made = await regionAdminWith([
      {
        ...testRaid(),
        status: 'ended',
        forumChannelId: '100000000000000777',
        forumPostId: '900000000000001111',
      },
      {
        ...testRaid({ id: '00000000-0000-4000-8000-000000000009' }),
        status: 'ended',
        forumChannelId: WEST_FORUM,
        forumPostId: '900000000000001112',
      },
    ]);
    await made.service.sweepPosts();
    const asked = made.gateway.calls.filter((call) => call.startsWith('openPosts'));
    expect(asked).toContain(`openPosts ${WEST_FORUM}`);
    expect(asked).not.toContain('openPosts 100000000000000777');
  });
});
