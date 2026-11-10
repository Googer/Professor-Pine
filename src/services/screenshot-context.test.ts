import { describe, expect, it } from 'vitest';
import { OTHER_GUILD_ROW, testGym, WEST_CHANNEL } from '../../test/support/gyms.js';
import { gymsFixture } from '../../test/support/providers.js';
import { MAX_FEED_READ_AT } from '../../test/support/max-bosses.js';
import { maxReading } from '../../test/support/screenshots.js';
import { createTestContext } from '../../test/support/test-context.js';
import type { AppContext } from '../app-context.js';
import { maxScreenshotReport } from '../domain/ocr/max-report.js';
import { typedMaxBoss } from '../domain/pogo/max-boss-list.js';
import { maxBossesAt } from '../domain/pogo/max-bosses.js';
import { maxReportContext, reportContext } from './screenshot-context.js';

/** The row of the server the invented regions belong to. */
const GUILD_ROW = 1;

describe('reportContext', () => {
  it('gives the report the bosses, the gym search by names where it was posted, and the settings', () => {
    const { ctx } = createTestContext();
    const context = reportContext(ctx, { channelId: WEST_CHANNEL, guildRow: GUILD_ROW }, 1_000);
    expect(context.bosses).toEqual(ctx.raidBosses.bosses());
    expect(context.searchGym('Old Stone Fountain')[0]?.gym.id).toBe(2);
    // A gym's nickname and description are not on a raid screen: names only.
    expect(context.searchGym('readers beside the front doors')).toEqual([]);
    const { settings } = ctx.config;
    expect(context).toMatchObject({
      uploadedAt: 1_000,
      zone: settings.timezone,
      standardIncubate: settings.standardRaidIncubateDuration,
      standardHatched: settings.standardRaidHatchedDuration,
      maxHatched: settings.maxRaidHatchedDuration,
      guessOffsetSeconds: settings.screenshotMessageOffsetTime,
    });
  });

  it('finds only this server’s gyms, also outside a region channel', () => {
    const { ctx } = createTestContext();
    const here = reportContext(ctx, { channelId: null, guildRow: GUILD_ROW }, 1_000);
    expect(here.searchGym('Old Stone Fountain')[0]?.gym.id).toBe(2);
    // Several hits are looked at: both gyms of this name.
    expect(
      here
        .searchGym('Starbucks')
        .map((hit) => hit.gym.id)
        .sort(),
    ).toEqual([5, 9]);
    // Gym 10 lies in no region of any server.
    expect(here.searchGym('Lakeview Trailhead')).toEqual([]);
    const elsewhere = reportContext(ctx, { channelId: null, guildRow: OTHER_GUILD_ROW }, 1_000);
    expect(elsewhere.searchGym('Old Stone Fountain')).toEqual([]);
  });

  // Review of the exact-name rule (2026-11-10): every longer name beginning with the one read is
  // seen, also the fourth (the report looked at three hits before).
  it('gives the report more than three hits of a search', () => {
    const halls = ['Cedar Hall', 'Cedar Hall East', 'Cedar Hall West', 'Cedar Hall North'].map(
      (name, i) => testGym(60 + i, name, 40.05, -80.05),
    );
    const { ctx } = createTestContext({ gyms: gymsFixture(halls) });
    const here = reportContext(ctx, { channelId: WEST_CHANNEL, guildRow: GUILD_ROW }, 1_000);
    expect(
      here
        .searchGym('Cedar Hall')
        .map((hit) => hit.gym.id)
        .sort(),
    ).toEqual([60, 61, 62, 63]);
  });
});

describe('maxReportContext', () => {
  // Matt, 2026-10-25: the reader decides a max boss as `/max` does (`typedMaxBoss`). Its search
  // looked only at what the game master lets battle, so a name read cut short found a Pokémon
  // the game lets battle and never the listed boss `/max` takes.
  it('finds a name read cut short among the max bosses `/max` takes, the listed ones too', () => {
    const { ctx } = createTestContext();
    const { catalogue } = ctx.gameData;
    const listed = maxBossesAt(
      [],
      [
        {
          id: 1,
          action: 'add',
          pokemonId: 'KINGDRA',
          form: null,
          tier: 'D3',
          shiny: false,
          expiresAt: null,
          createdBy: '123456789012345678',
          createdAt: MAX_FEED_READ_AT,
        },
      ],
      catalogue,
      MAX_FEED_READ_AT,
    );
    const kingdra = ctx.pokemon.exact('Kingdra');
    if (!kingdra) throw new Error('kingdra');
    expect(catalogue.canDynamax(kingdra)).toBe(false);
    expect(typedMaxBoss(kingdra, listed, catalogue).listed).toHaveLength(1);
    const withKingdra = {
      ...ctx,
      maxBosses: { bosses: () => listed } as unknown as AppContext['maxBosses'],
    };
    const context = maxReportContext(
      withKingdra,
      { channelId: WEST_CHANNEL, guildRow: GUILD_ROW },
      MAX_FEED_READ_AT,
    );
    const report = maxScreenshotReport(maxReading('GAZEBO', { species: 'KINGDR' }, {}, 3), context);
    expect(report).toMatchObject({
      boss: { ref: { key: 'kingdra' }, listed: true },
      tier: 'D3',
      tierFrom: 'list',
    });
  });
});
