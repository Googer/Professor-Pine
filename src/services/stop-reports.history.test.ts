import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { pageTask } from '../../test/support/research.js';
import {
  DRATINI,
  MAGIKARP,
  MUDKIP,
  OTHER_REPORTER,
  REPORT_SERVER,
  REPORTER,
  reportedStop,
} from '../../test/support/stop-report-cases.js';
import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { zonedAt } from '../../test/support/time.js';
import { taskKeyOf } from '../domain/research/task.js';
import { taskVersions } from '../domain/research/versions.js';
import { reportCell } from '../domain/stops/report-history.js';
import type { ReportedStop } from '../domain/stops/report.js';
import { testRegions } from '../../test/support/gyms.js';
import type { Region } from '../db/repositories/region-repository.js';
import { StopReportService, type ResearchSubject, type RocketSubject } from './stop-reports.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const GARY = { id: '200000000000000033', name: 'Gary' };

const subject = (text: string): ResearchSubject => ({
  subjectKey: taskKeyOf(text),
  research: { text, category: 'Throwing', rewards: [DRATINI], typed: false },
});
const THROWS = subject('Make 2 Excellent Throws');
const CATCHES = subject('Catch 7 Pokémon');

const WATER: RocketSubject = {
  subjectKey: 'grunt:water',
  rocket: { name: 'Water-type grunt', catches: [MUDKIP] },
};
const MAGIKARPS: RocketSubject = {
  subjectKey: 'grunt:water:male',
  rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
};
const NONE: RocketSubject = {
  subjectKey: 'grunt:none',
  rocket: { name: 'Grunt (no type)', catches: [] },
};
const ARLO: RocketSubject = {
  subjectKey: 'leader:arlo',
  rocket: { name: 'Arlo', catches: [] },
};

/** A stop in West, one where West and Downtown overlap, and one in no region. */
const IN_WEST = reportedStop(1, { lat: 40.02, lon: -80.08 });
const DOWNTOWN = reportedStop(2, { lat: 40.05, lon: -80.05 });
const NOWHERE = reportedStop(3);

/** The invented regions of server row 1, with Downtown (id 9) inside West, and one elsewhere. */
function regionsOf(): Region[] {
  const [west] = testRegions();
  if (!west) throw new Error('no West');
  return [
    ...testRegions(),
    {
      ...west,
      id: 9,
      channelId: '100000000000000009',
      bounds: [
        { lat: 40.04, lon: -80.06 },
        { lat: 40.04, lon: -80.04 },
        { lat: 40.06, lon: -80.04 },
        { lat: 40.06, lon: -80.06 },
      ],
    },
    { ...west, id: 12, guildId: 2, channelId: '100000000000000012' },
  ];
}

/**
 * A service over memory whose regions are the directory's (`regionsOf`, server row 1 for
 * `REPORT_SERVER`), or whose lookup of the server's row fails with `failing`; the clock at
 * `start`.
 */
function historyServiceWith(options: { start?: number; failing?: Error } = {}) {
  const clock = { now: options.start ?? at('2026-11-21T10:00') };
  const store = new MemoryStopReports();
  const { log, entries } = createTestLogger();
  const service = new StopReportService({
    rewardHash: fixtureRewardHash,
    store,
    events: { researchEvents: () => [] },
    zoneOf: () => ZONE,
    log,
    now: () => clock.now,
    guilds: {
      idFor: (serverId) =>
        options.failing
          ? Promise.reject(options.failing)
          : Promise.resolve(serverId === REPORT_SERVER ? 1 : undefined),
    },
    regions: { all: regionsOf },
  });
  return { service, store, clock, entries };
}

const research = (
  service: StopReportService,
  what: ResearchSubject,
  reporter = REPORTER,
  stops: ReportedStop[] = [reportedStop(1)],
  replacing?: number[],
) =>
  service.reportResearch({
    serverId: REPORT_SERVER,
    stops,
    subject: what,
    reporter,
    ...(replacing === undefined ? {} : { replacing }),
  });

const rocket = (
  service: StopReportService,
  who: RocketSubject,
  reporter = REPORTER,
  replacing?: number,
) =>
  service.reportRocket({
    serverId: REPORT_SERVER,
    stop: reportedStop(1),
    subject: who,
    reporter,
    ...(replacing === undefined ? {} : { replacing }),
  });

describe('StopReportService and the history of reports at stops (plan 8H-2)', () => {
  it('fixes the cell and the regions of each stop when it is reported, from the directory', async () => {
    const { service, store, clock } = historyServiceWith();
    await research(service, THROWS, REPORTER, [IN_WEST, DOWNTOWN, NOWHERE]);
    clock.now = at('2026-11-22T00:00');
    await service.sweep();
    // In no region is none, not unknown (null).
    expect(store.records.map(({ cell, regionIds, ending }) => [cell, regionIds, ending])).toEqual([
      [reportCell(IN_WEST), [1], 'stood'],
      [reportCell(DOWNTOWN), [1, 9], 'stood'],
      [reportCell(NOWHERE), [], 'stood'],
    ]);
  });

  it('knows no regions of a server it has no row of', async () => {
    const { service, store, clock } = historyServiceWith();
    await service.reportResearch({
      serverId: '100000000000000009',
      stops: [IN_WEST],
      subject: THROWS,
      reporter: REPORTER,
    });
    clock.now = at('2026-11-22T00:00');
    await service.sweep();
    expect(store.records).toMatchObject([{ regionIds: [] }]);
  });

  it('saves the report where its regions cannot be read, with none known, logged', async () => {
    const { service, store, clock, entries } = historyServiceWith({
      failing: new Error('the pool is gone'),
    });
    const { saved } = await research(service, THROWS);
    expect(saved).toHaveLength(1);
    clock.now = at('2026-11-22T00:00');
    await service.sweep();
    expect(store.records).toMatchObject([{ cell: reportCell(reportedStop(1)), regionIds: null }]);
    expect(entries.some((entry) => entry.msg === 'could not find the regions of a stop')).toBe(
      true,
    );
  });

  it('counts who met the very version with a report of their own, and corrects the reporter’s own', async () => {
    const { service, store } = historyServiceWith();
    await research(service, THROWS);
    // Misty twice and Brock himself: one confirmation.
    await research(service, THROWS, OTHER_REPORTER);
    await research(service, THROWS, OTHER_REPORTER);
    await research(service, THROWS);
    await research(service, CATCHES);
    expect(store.records).toMatchObject([
      { subjectKey: THROWS.subjectKey, ending: 'corrected', confirmations: 1 },
    ]);
  });

  it('ends a report another member ticked as contradicted, and a "one of" a reward narrowed', async () => {
    const task = pageTask('Make 3 Excellent Throws in a row');
    const versions = taskVersions(task, catalogueFixture());
    const version = (label: string): ResearchSubject => {
      const found = versions.find((one) => one.label === label);
      if (!found) throw new Error(`no version ${label}`);
      return {
        subjectKey: found.value,
        research: {
          text: task.text,
          category: task.category,
          rewards: found.rewards,
          typed: false,
        },
      };
    };
    const { service, store } = historyServiceWith();
    await research(service, version('one of Larvitar, Beldum, Gible'), OTHER_REPORTER);
    // Gary says less ("one of" again): a confirmation; Brock narrows it: one more.
    await research(service, version('one of Larvitar, Beldum, Gible'), GARY);
    const gible = await research(service, version('Gible'));
    const id = gible.saved[0]?.report.id ?? 0;
    // Misty ticks Brock's Gible in "Replace field research?".
    const asks = await research(service, version('Beldum'), OTHER_REPORTER);
    expect(asks.asks.map((one) => one.id)).toEqual([id]);
    await research(service, version('Beldum'), OTHER_REPORTER, [reportedStop(1)], [id]);
    expect(store.records.map(({ ending, confirmations }) => [ending, confirmations])).toEqual([
      ['narrowed', 2],
      ['contradicted', 0],
    ]);
  });

  describe('Team GO Rocket', () => {
    const start = at('2026-10-22T12:00');

    it('churns a grunt another replaced, counting who met it again', async () => {
      const { service, store, clock } = historyServiceWith({ start });
      await rocket(service, WATER);
      clock.now += 60_000;
      expect(await rocket(service, WATER, OTHER_REPORTER)).toMatchObject({ kind: 'already' });
      clock.now += 60_000;
      await rocket(service, NONE, OTHER_REPORTER);
      expect(store.records).toMatchObject([
        { subjectKey: 'grunt:water', ending: 'churned', confirmations: 1, endedAt: clock.now },
      ]);
    });

    it('ends the version a refine changes in place as refined, at the refine', async () => {
      const { service, store, clock } = historyServiceWith({ start });
      const first = await rocket(service, WATER);
      clock.now += 5 * 60_000;
      const refined = await rocket(service, MAGIKARPS, OTHER_REPORTER);
      if (first.kind !== 'reported' || refined.kind !== 'refined') throw new Error('not refined');
      expect(store.records).toEqual([
        expect.objectContaining({
          reportId: first.report.id,
          reportMadeAt: first.report.madeAt,
          subjectKey: 'grunt:water',
          ending: 'refined',
          endedAt: refined.report.madeAt,
        }),
      ]);
    });

    it('forgets the record of a hideout put back, and ends the grunt in its place unposted', async () => {
      const { service, store, clock } = historyServiceWith({ start });
      const arlo = await rocket(service, ARLO, OTHER_REPORTER);
      clock.now += 60_000;
      const grunt = await rocket(
        service,
        WATER,
        REPORTER,
        arlo.kind === 'reported' ? arlo.report.id : 0,
      );
      if (arlo.kind !== 'reported' || grunt.kind !== 'reported') throw new Error('not reported');
      expect(store.records).toMatchObject([{ subjectKey: 'leader:arlo', ending: 'churned' }]);
      clock.now += 60_000;
      const back = await service.restore(arlo.report, grunt.report);
      expect(back).toMatchObject({ subjectKey: 'leader:arlo', madeAt: arlo.report.madeAt });
      expect(store.records).toMatchObject([
        { reportId: grunt.report.id, ending: 'unposted', endedAt: clock.now },
      ]);
      // The hideout put back is recorded once, when it ends.
      clock.now = at('2026-10-23T00:00');
      await service.sweep();
      expect(store.records.map(({ subjectKey, ending }) => [subjectKey, ending])).toEqual([
        ['grunt:water', 'unposted'],
        ['leader:arlo', 'stood'],
      ]);
    });
  });

  describe('taking back', () => {
    it('ends a report its reporter takes back as withdrawn, another’s by staff as staff', async () => {
      const { service, store } = historyServiceWith();
      const { saved } = await research(service, THROWS, REPORTER, [
        reportedStop(1),
        reportedStop(2),
      ]);
      const [one, two] = saved.map(({ report }) => report.id);
      await service.takeBack(REPORT_SERVER, [one ?? 0], REPORTER.id, 'member');
      await service.takeBack(REPORT_SERVER, [two ?? 0], OTHER_REPORTER.id, 'staff');
      expect(store.records.map(({ reportId, ending }) => [reportId, ending])).toEqual([
        [one, 'withdrawn'],
        [two, 'staff'],
      ]);
    });

    it('takes back a report as staff that is the member’s own as withdrawn', async () => {
      const { service, store } = historyServiceWith();
      const { saved } = await research(service, THROWS);
      await service.takeBack(REPORT_SERVER, [saved[0]?.report.id ?? 0], REPORTER.id, 'staff');
      expect(store.records).toMatchObject([{ ending: 'withdrawn' }]);
    });

    it('ends a grunt Pine undoes as unposted, and leaves another’s to a member', async () => {
      const { service, store } = historyServiceWith({ start: at('2026-10-22T12:00') });
      const grunt = await rocket(service, WATER);
      if (grunt.kind !== 'reported') throw new Error('not reported');
      expect(
        await service.takeBack(REPORT_SERVER, [grunt.report.id], OTHER_REPORTER.id, 'member'),
      ).toMatchObject({ removed: [], notYours: [{ id: grunt.report.id }] });
      await service.takeBack(REPORT_SERVER, [grunt.report.id], REPORTER.id, 'unposted');
      expect(store.records).toMatchObject([{ ending: 'unposted' }]);
    });
  });

  describe('a grunt overtaken while its messages went out (8H2-2)', () => {
    it('records one another report replaced as unposted, one taken back as its take-back says', async () => {
      const { service, store, clock } = historyServiceWith({ start: at('2026-10-22T12:00') });
      const churned = await rocket(service, WATER);
      clock.now += 60_000;
      await rocket(service, NONE, OTHER_REPORTER);
      const withdrawn = await service.reportRocket({
        serverId: REPORT_SERVER,
        stop: reportedStop(2),
        subject: WATER,
        reporter: REPORTER,
      });
      if (churned.kind !== 'reported' || withdrawn.kind !== 'reported') throw new Error('kept');
      await service.takeBack(REPORT_SERVER, [withdrawn.report.id], REPORTER.id, 'member');
      await service.overtaken(churned.report);
      await service.overtaken(withdrawn.report);
      expect(store.records.map(({ reportId, ending }) => [reportId, ending])).toEqual([
        [churned.report.id, 'unposted'],
        [withdrawn.report.id, 'withdrawn'],
      ]);
    });
  });
});
