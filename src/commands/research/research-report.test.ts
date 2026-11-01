import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import {
  boardedRegions,
  OTHER_GUILD_ID,
  OTHER_GUILD_ROW,
  WEST_CHANNEL,
} from '../../../test/support/gyms.js';
import { regionsFixture } from '../../../test/support/providers.js';
import { pageTask } from '../../../test/support/research.js';
import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import type { PineStop } from '../../domain/stops/pine-stop.js';
import type { WayspotRow } from '../../domain/wayspots/kept.js';
import { researchWords } from '../../render/research.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { StopReportService } from '../../services/stop-reports.js';
import { readTask } from './research-input.js';
import {
  NOT_YOUR_REPORT,
  NOTHING_LEFT,
  REPORT_CHANGED,
  reportResearchAs,
  reporterNamed,
  stopsByKey,
  takeBackAs,
} from './research-report.js';

const ASH = { id: '200000000000000061', name: 'Ash' };
const MISTY = { id: '200000000000000062', name: 'Misty' };
const DRAGON = pageTask('Catch a Dragon-type Pokémon');

/** Stops in West, and a power spot. */
const STOPS: WayspotRow[] = [
  keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
  keptRow(2, { title: 'Paititi Inti', lat: 40.061, lon: -80.06, address: null }),
  keptRow(5, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
  keptRow(6, { title: 'Corner Store Inc.', lat: 40.062, lon: -80.06, address: null }),
];

/** A stop of Pine's own of a server, in West's outline (North's too, another server's). */
const sponsored = (id: number, serverId: string): PineStop => ({
  id,
  serverId,
  name: `Coffee Corner ${String(id)}`,
  lat: 40.0505,
  lon: -80.05,
  address: '12 Market Street',
  createdBy: '200000000000000051',
  createdAt: 5_000,
  updatedBy: '200000000000000051',
  updatedAt: 6_000,
});

// Noon in Pittsburgh: a report never meets a real midnight.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 22, 16) });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const { wayspots } = await wayspotsWith(STOPS);
  wayspots.setPineStops([
    { stop: sponsored(1, FAKE_GUILD_ID), guildRow: 1 },
    { stop: sponsored(2, OTHER_GUILD_ID), guildRow: OTHER_GUILD_ROW },
  ]);
  const store = new MemoryStopReports();
  const { ctx } = createTestContext({ wayspots });
  Object.assign(ctx, {
    stopReports: new StopReportService({
      rewardHash: fixtureRewardHash,
      store,
      events: ctx.raidEvents,
      zone: ctx.config.settings.timezone,
      log: ctx.log,
    }),
  });
  return { ctx, store };
}

describe('stopsByKey', () => {
  it('gives this server’s PokéStops by their keys, each once, Pine’s own among them', async () => {
    const { ctx } = await setup();
    const stops = await stopsByKey(ctx, FAKE_GUILD_ID, [
      wayspotId(2),
      'pine-1',
      wayspotId(2),
      // A power spot, another server's stop of its own, and a key of nothing.
      wayspotId(5),
      'pine-2',
      'nothing',
    ]);
    expect(stops.map((stop) => [stop.key, stop.name])).toEqual([
      [wayspotId(2), 'Paititi Inti'],
      ['pine-1', 'Coffee Corner 1'],
    ]);
    expect(stops[1]).toMatchObject({ address: '12 Market Street', lat: 40.0505, lon: -80.05 });
    expect(await stopsByKey(ctx, OTHER_GUILD_ID, ['pine-1'])).toEqual([]);
  });
});

describe('reportResearchAs', () => {
  it('reports the task at the stops and gives the words’ view: the posts of its regions', async () => {
    const { ctx, store } = await setup();
    Object.assign(ctx, { regions: regionsFixture(boardedRegions()) });
    const stops = await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1), 'pine-1']);
    const reported = await reportResearchAs(ctx, FAKE_GUILD_ID, {
      stops,
      subject: readTask(ctx, DRAGON.key, null),
      reporter: ASH,
    });
    expect(reported.outcome.saved.map(({ report }) => report.stop.name)).toEqual([
      'Yellow Mural',
      'Coffee Corner 1',
    ]);
    expect(reported.view).toMatchObject({
      channels: [WEST_CHANNEL],
      boards: [WEST_CHANNEL],
      until: 'until midnight',
    });
    expect(researchWords(reported.view, () => '#west').where).toBe(
      'In "Today’s Stops" on the board of #west, until midnight.',
    );
    expect(store.rows.size).toBe(2);
  });

  it('names no board where the region has none recorded (review W4)', async () => {
    const { ctx } = await setup();
    const reported = await reportResearchAs(ctx, FAKE_GUILD_ID, {
      stops: await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1)]),
      subject: readTask(ctx, DRAGON.key, null),
      reporter: ASH,
    });
    expect(reported.view).toMatchObject({ channels: [WEST_CHANNEL], boards: [] });
    expect(researchWords(reported.view, () => '#west').where).toBe('It stands until midnight.');
  });

  it('names no post of the stops in rehearsal mode, which makes none', async () => {
    const { ctx } = await setup();
    Object.assign(ctx, {
      rehearsal: new Rehearsal({ allowlist: [ASH.id], regions: ['west'], staffRoles: [] }),
    });
    const reported = await reportResearchAs(ctx, FAKE_GUILD_ID, {
      stops: await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1)]),
      subject: readTask(ctx, DRAGON.key, null),
      reporter: ASH,
    });
    expect(researchWords(reported.view, () => '#west').where).toBe('It stands until midnight.');
  });
});

describe('takeBackAs', () => {
  it('takes back one’s own report, another’s only as staff, and nothing of one gone', async () => {
    const { ctx, store } = await setup();
    const { outcome } = await reportResearchAs(ctx, FAKE_GUILD_ID, {
      stops: await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1)]),
      subject: readTask(ctx, DRAGON.key, null),
      reporter: ASH,
    });
    const id = outcome.saved[0]?.report.id ?? 0;
    expect(await takeBackAs(ctx, FAKE_GUILD_ID, id, MISTY.id, false)).toMatchObject({
      kind: 'not-yours',
    });
    expect(await takeBackAs(ctx, OTHER_GUILD_ID, id, ASH.id, false)).toEqual({ kind: 'gone' });
    expect(store.rows.size).toBe(1);
    expect(await takeBackAs(ctx, FAKE_GUILD_ID, id, MISTY.id, true)).toMatchObject({
      kind: 'removed',
      text: 'Took back **Catch a Dragon-type Pokémon** at **Yellow Mural**.',
    });
    expect(await takeBackAs(ctx, FAKE_GUILD_ID, id, ASH.id, false)).toEqual({ kind: 'gone' });
    expect(store.rows.size).toBe(0);
  });

  // Final review of 8X-F, F3: the sentence ends once after a stop whose name ends in a period.
  it('ends its answer once after a stop whose name ends in a period', async () => {
    const { ctx } = await setup();
    const { outcome } = await reportResearchAs(ctx, FAKE_GUILD_ID, {
      stops: await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(6)]),
      subject: readTask(ctx, DRAGON.key, null),
      reporter: ASH,
    });
    const id = outcome.saved[0]?.report.id ?? 0;
    expect(await takeBackAs(ctx, FAKE_GUILD_ID, id, ASH.id, false)).toMatchObject({
      kind: 'removed',
      text: 'Took back **Catch a Dragon-type Pokémon** at **Corner Store Inc.**',
    });
  });

  it('keeps the words of the commands', () => {
    expect(NOT_YOUR_REPORT).toBe('Only the member who reported it, or staff, can take that back.');
    expect(REPORT_CHANGED).toBe(
      'The report at that PokéStop changed meanwhile: nothing was taken back. Look again.',
    );
    expect(NOTHING_LEFT).toBe(
      'There was nothing left to take back: the report has ended, was taken back, or was ' +
        'replaced by a newer one.',
    );
  });
});

describe('reporterNamed', () => {
  it('names a reporter by the name shown, else the account’s, cut to what is kept', () => {
    expect(reporterNamed(ASH.id, 'Ash', 'ash99')).toEqual(ASH);
    expect(reporterNamed(ASH.id, undefined, 'ash99')).toEqual({ id: ASH.id, name: 'ash99' });
    expect(reporterNamed(ASH.id, 'x'.repeat(150), 'ash99').name.length).toBeLessThanOrEqual(100);
  });
});
