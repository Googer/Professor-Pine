import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePartyGateway, missingPermissions } from '../../../test/support/fake-gateway.js';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import { boardedRegions, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { regionsFixture } from '../../../test/support/providers.js';
import { feedChoice } from '../../../test/support/rocket.js';
import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import { rocketWords } from '../../render/rocket.js';
import { GruntMessageService } from '../../services/grunt-messages.js';
import { RocketService } from '../../services/rocket-reports.js';
import { StopReportService } from '../../services/stop-reports.js';
import { stopsByKey } from '../research/research-report.js';
import { hideoutQuestion, reportRocketAs } from './rocket-report.js';

const ASH = { id: '200000000000000061', name: 'Ash' };
const MISTY = { id: '200000000000000062', name: 'Misty' };
const WEST = (id: string) => (id === WEST_CHANNEL ? '#west' : '?');

// Noon in Pittsburgh on 2026-10-22: a report never meets a real midnight.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 22, 16) });
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const { wayspots } = await wayspotsWith([
    keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
  ]);
  const store = new MemoryStopReports();
  const gateway = new FakePartyGateway();
  const { ctx } = createTestContext({ wayspots });
  const stopReports = new StopReportService({
    rewardHash: fixtureRewardHash,
    store,
    events: ctx.raidEvents,
    zone: ctx.config.settings.timezone,
    log: ctx.log,
  });
  const messages = new GruntMessageService({
    gateway,
    store: new MemoryGruntMessages(),
    reports: stopReports,
    log: ctx.log,
    setTimer: () => () => undefined,
  });
  Object.assign(ctx, {
    stopReports,
    rocket: new RocketService({
      reports: stopReports,
      messages,
      regions: ctx.regions,
      guilds: ctx.guilds,
      log: ctx.log,
    }),
  });
  const [stop] = await stopsByKey(ctx, FAKE_GUILD_ID, [wayspotId(1)]);
  if (!stop) throw new Error('no stop');
  const report = (who: string, reporter = ASH, replacing?: number) =>
    reportRocketAs(
      ctx,
      FAKE_GUILD_ID,
      { choice: feedChoice(who), stop, reporter, ...(replacing ? { replacing } : {}) },
      WEST,
    );
  return { ctx, store, gateway, report };
}

describe('reportRocketAs', () => {
  it('reports a grunt, posted in its region, and gives the view of its words', async () => {
    const { report, gateway } = await setup();
    const reported = await report('grunt:water');
    if (reported.kind !== 'reported') throw new Error(reported.kind);
    expect(rocketWords(reported.view, WEST).where).toMatch(
      /^Posted in #west; it goes away <t:\d+:R>\.$/,
    );
    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
  });

  it('names the board of a hideout only where the region has one recorded (review W4)', async () => {
    const { report, ctx } = await setup();
    const unboarded = await report('leader:arlo');
    if (unboarded.kind !== 'reported') throw new Error(unboarded.kind);
    expect(rocketWords(unboarded.view, WEST).where).toBe('It stands until midnight.');
    Object.assign(ctx, { regions: regionsFixture(boardedRegions()) });
    const boarded = await report('giovanni', MISTY);
    if (boarded.kind !== 'reported') throw new Error(boarded.kind);
    expect(rocketWords(boarded.view, WEST).where).toBe(
      'In "Today’s Stops" on the board of #west, until midnight.',
    );
  });

  it('gives the grunt that stands, with its messages, for the same grunt again', async () => {
    const { report, gateway } = await setup();
    await report('grunt:water');
    const again = await report('grunt:water', MISTY);
    expect(again).toMatchObject({
      kind: 'already',
      standing: { subjectKey: 'grunt:water', reporter: ASH },
      posted: [{ channelId: WEST_CHANNEL }],
    });
    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
  });

  it('asks before a grunt replaces a hideout, and replaces the hideout it was told', async () => {
    const { report } = await setup();
    const arlo = await report('leader:arlo');
    if (arlo.kind !== 'reported') throw new Error(arlo.kind);
    expect(await report('grunt:water')).toMatchObject({
      kind: 'asks',
      standing: { id: arlo.report.id },
    });
    const replaced = await report('grunt:water', ASH, arlo.report.id);
    expect(replaced).toMatchObject({
      kind: 'reported',
      view: { replaced: { id: arlo.report.id } },
    });
  });

  it('says in the caller’s words where a grunt could not be posted, the hideout back', async () => {
    const { report, gateway, store } = await setup();
    const arlo = await report('leader:arlo');
    if (arlo.kind !== 'reported') throw new Error(arlo.kind);
    gateway.failing.set('sendMessage', missingPermissions('POST'));
    expect(await report('grunt:water', ASH, arlo.report.id)).toEqual({
      kind: 'unposted',
      text:
        'I could not post the grunt in #west, so nothing was reported; **Arlo** stands as ' +
        'before. Try again in a moment.',
    });
    expect([...store.rows.values()].map((one) => one.subjectKey)).toEqual(['leader:arlo']);
  });
});

describe('hideoutQuestion', () => {
  it('asks whether a grunt replaces the hideout of the day', () => {
    expect(hideoutQuestion('Arlo', 'Water-type grunt')).toBe(
      'Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s ' +
        'report with the Water-type grunt?',
    );
  });
});
