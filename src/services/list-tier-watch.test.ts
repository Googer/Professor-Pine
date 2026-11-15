import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { maxBossServiceWith } from '../../test/support/max-boss-service.js';
import { raidBossServiceWith } from '../../test/support/raid-bosses.js';
import type { ListTierSighting } from '../domain/ocr/list-tier-doubt.js';
import type { ListTierNotice } from '../render/moderation.js';
import { ListTierWatch } from './list-tier-watch.js';

const SERVER = '400000000000000001';
const CHANNEL = '400000000000000002';
const HOUR = 3_600_000;
const SNEASEL: ListTierSighting = {
  family: 'max',
  bossKey: 'sneasel',
  listTier: 'D1',
  headsTier: 'D2',
};

async function watchWith() {
  const max = await maxBossServiceWith();
  await max.service.sync();
  const raid = await raidBossServiceWith();
  const told: ListTierNotice[] = [];
  const clock = { now: max.state.now };
  const watch = new ListTierWatch({
    raidBossAdmin: raid.service,
    maxBossAdmin: max.service,
    gameData: { catalogue: catalogueFixture() },
    reports: {
      listTier: (notice) => {
        told.push(notice);
        return true;
      },
    },
    now: () => clock.now,
  });
  const where = (memberId: string, place: string, channelId: string | null = CHANNEL) => ({
    serverId: SERVER,
    channelId,
    memberId,
    place,
    at: clock.now,
  });
  return { watch, told, clock, where, max };
}

describe('ListTierWatch (plan 8X-J)', () => {
  it('tells the moderators at the third screenshot, with the boss as /operator boss names it', async () => {
    const { watch, told, where } = await watchWith();
    watch.observe(where('100000000000000001', 'w1'), SNEASEL);
    watch.observe(where('100000000000000001', 'w1'), SNEASEL);
    watch.observe(where('100000000000000001', 'w2'), SNEASEL);
    expect(told).toEqual([]);
    watch.observe(where('100000000000000002', 'w1'), SNEASEL);
    expect(told).toEqual([
      {
        serverId: SERVER,
        channelId: CHANNEL,
        ...SNEASEL,
        name: 'Sneasel',
        pokemon: 'sneasel',
        count: 3,
      },
    ]);
  });

  it('forgets screenshots older than a day, and keeps servers apart', async () => {
    const { watch, told, where, clock } = await watchWith();
    watch.observe(where('100000000000000001', 'w1'), SNEASEL);
    watch.observe(where('100000000000000001', 'w2'), SNEASEL);
    clock.now += 25 * HOUR;
    watch.observe(where('100000000000000001', 'w3'), SNEASEL);
    watch.observe(
      { ...where('100000000000000001', 'w4'), serverId: '400000000000000009' },
      SNEASEL,
    );
    expect(told).toEqual([]);
  });

  it('names the add whose tier the list has (review M7)', async () => {
    const { watch, told, where, max } = await watchWith();
    const added = await max.service.addOverride({
      action: 'add',
      pokemonId: 'MACHAMP',
      form: null,
      tier: 'D4',
      shiny: false,
      expiresAt: null,
      createdBy: '123456789012345678',
    });
    const machamp: ListTierSighting = { ...SNEASEL, bossKey: 'machamp', listTier: 'D4' };
    for (const place of ['w1', 'w2', 'w3']) {
      watch.observe(where('100000000000000001', place), machamp);
    }
    expect(told).toMatchObject([{ bossKey: 'machamp', overrideId: added.id }]);
  });

  it('reads the list as the sighting’s server sees it, in its zone (fix round 1, L6)', async () => {
    const max = await maxBossServiceWith();
    await max.service.sync();
    const raid = await raidBossServiceWith();
    const asked: Array<string | undefined> = [];
    const told: ListTierNotice[] = [];
    const watch = new ListTierWatch({
      raidBossAdmin: raid.service,
      maxBossAdmin: {
        feedBosses: (zone) => {
          asked.push(zone);
          return max.service.feedBosses(zone);
        },
        overrides: () => max.service.overrides(),
      },
      gameData: { catalogue: catalogueFixture() },
      reports: {
        listTier: (notice) => {
          told.push(notice);
          return true;
        },
      },
      zoneOf: (serverId) => (serverId === SERVER ? 'Asia/Tokyo' : 'America/New_York'),
      now: () => max.state.now,
    });
    for (const [memberId, place] of [
      ['100000000000000001', 'w1'],
      ['100000000000000001', 'w2'],
      ['100000000000000002', 'w1'],
    ] as const) {
      watch.observe(
        { serverId: SERVER, channelId: CHANNEL, memberId, place, at: max.state.now },
        SNEASEL,
      );
    }
    expect(told).toHaveLength(1);
    expect(asked).toEqual(['Asia/Tokyo']);
  });

  it('tells nothing outside a channel of a region, nor of a boss the list no longer has there', async () => {
    const { watch, told, where } = await watchWith();
    for (const place of ['w1', 'w2', 'w3']) {
      watch.observe(where('100000000000000001', place, null), SNEASEL);
    }
    const gone: ListTierSighting = { ...SNEASEL, listTier: 'D5' };
    for (const place of ['w1', 'w2', 'w3']) {
      watch.observe(where('100000000000000001', place), gone);
    }
    expect(told).toEqual([]);
  });
});
