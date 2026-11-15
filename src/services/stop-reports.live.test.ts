import { describe, expect, it, vi } from 'vitest';
import { WEST_CHANNEL, testRegions } from '../../test/support/gyms.js';
import {
  DRATINI,
  MAGIKARP,
  MUDKIP,
  OTHER_REPORTER,
  REPORT_NOW,
  REPORT_SERVER,
  REPORTER,
  reportedStop,
} from '../../test/support/stop-report-cases.js';
import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { taskKeyOf } from '../domain/research/task.js';
import type { GruntMessageService } from './grunt-messages.js';
import { RocketService } from './rocket-reports.js';
import { StopReportService, type RocketSubject } from './stop-reports.js';

const THROWS = {
  subjectKey: taskKeyOf('Make 2 Excellent Throws'),
  research: {
    text: 'Make 2 Excellent Throws',
    category: 'Throwing',
    rewards: [DRATINI],
    typed: false,
  },
};
const WATER: RocketSubject = {
  subjectKey: 'grunt:water',
  rocket: { name: 'Water-type grunt', catches: [MUDKIP] },
};
const MAGIKARPS: RocketSubject = {
  subjectKey: 'grunt:water:male',
  rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
};
const ARLO: RocketSubject = {
  subjectKey: 'leader:arlo',
  rocket: { name: 'Arlo', catches: [] },
};

function serviceWith() {
  const clock = { now: REPORT_NOW };
  const service = new StopReportService({
    rewardHash: fixtureRewardHash,
    store: new MemoryStopReports(),
    events: { researchEvents: () => [] },
    zoneOf: () => 'America/New_York',
    log: createTestLogger().log,
    now: () => clock.now,
  });
  const told: string[] = [];
  service.listen({
    listChanged: (serverId) => {
      told.push(serverId);
    },
  });
  const research = () =>
    service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1)],
      subject: THROWS,
      reporter: REPORTER,
    });
  const rocket = (
    subject: RocketSubject,
    more: { stop?: number; reporter?: typeof REPORTER; replacing?: number } = {},
  ) =>
    service.reportRocket({
      serverId: REPORT_SERVER,
      stop: reportedStop(more.stop ?? 2),
      subject,
      reporter: more.reporter ?? REPORTER,
      ...(more.replacing === undefined ? {} : { replacing: more.replacing }),
    });
  return { clock, service, told, research, rocket };
}

describe('who hears that the list of reports changed (listChanged)', () => {
  it('hears of field research reported, and not of the same report made again', async () => {
    const { told, research } = serviceWith();
    await research();
    expect(told).toEqual([REPORT_SERVER]);
    await research();
    expect(told).toEqual([REPORT_SERVER]);
  });

  it('hears of a grunt, which `changed` is not told of', async () => {
    const { told, rocket } = serviceWith();
    await rocket(WATER);
    expect(told).toEqual([REPORT_SERVER]);
  });

  it('hears of a hideout', async () => {
    const { told, rocket } = serviceWith();
    await rocket(ARLO);
    expect(told).toEqual([REPORT_SERVER]);
  });

  it('hears of a grunt refined in place', async () => {
    const { clock, told, rocket } = serviceWith();
    await rocket(WATER);
    clock.now += 60_000;
    const refined = await rocket(MAGIKARPS, { reporter: OTHER_REPORTER });
    expect(refined.kind).toBe('refined');
    expect(told).toHaveLength(2);
  });

  it('hears nothing where nothing was saved', async () => {
    const { told, rocket } = serviceWith();
    await rocket(WATER);
    expect((await rocket(WATER)).kind).toBe('already');
    expect(told).toHaveLength(1);
  });

  it('hears of a report taken back, a grunt too, and not of a refusal', async () => {
    const { service, told, rocket } = serviceWith();
    const grunt = await rocket(WATER);
    if (grunt.kind !== 'reported') throw new Error(grunt.kind);
    await service.takeBack(REPORT_SERVER, [grunt.report.id], OTHER_REPORTER.id, 'member');
    expect(told).toHaveLength(1);
    await service.takeBack(REPORT_SERVER, [grunt.report.id], REPORTER.id, 'member');
    expect(told).toHaveLength(2);
  });

  it('hears of a hideout put back', async () => {
    const { service, told, rocket } = serviceWith();
    const arlo = await rocket(ARLO);
    if (arlo.kind !== 'reported') throw new Error(arlo.kind);
    const grunt = await rocket(WATER, { replacing: arlo.report.id });
    if (grunt.kind !== 'reported') throw new Error(grunt.kind);
    told.length = 0;
    expect(await service.restore(arlo.report, grunt.report)).toBeDefined();
    expect(told).toEqual([REPORT_SERVER]);
  });

  it('hears of a grunt’s message stored, which the map’s view links', async () => {
    const { service, told } = serviceWith();
    const post = vi.fn<GruntMessageService['post']>(() => {
      // The report's own word came first, the message's after it.
      expect(told).toHaveLength(1);
      return Promise.resolve([{ channelId: WEST_CHANNEL, messageId: '300000000000000001' }]);
    });
    const rocket = new RocketService({
      reports: service,
      messages: {
        post,
        refine: () => Promise.reject(new Error('no refine in this test')),
        messagesOf: () => Promise.resolve([]),
      },
      regions: { all: () => testRegions() },
      guilds: { idFor: () => Promise.resolve(1) },
      log: createTestLogger().log,
    });
    const outcome = await rocket.report({
      serverId: REPORT_SERVER,
      stop: reportedStop(1, { lat: 40.051, lon: -80.05 }),
      subject: WATER,
      reporter: REPORTER,
    });
    expect(outcome.kind).toBe('reported');
    expect(post).toHaveBeenCalledOnce();
    expect(told).toEqual([REPORT_SERVER, REPORT_SERVER]);
  });

  it('a listener that throws is logged and stops nothing', async () => {
    const { service, told, research } = serviceWith();
    service.listen({
      listChanged: () => {
        throw new Error('a listener failed');
      },
    });
    await expect(research()).resolves.toBeDefined();
    expect(told).toHaveLength(1);
  });
});
