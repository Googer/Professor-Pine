import { describe, expect, it } from 'vitest';
import { PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
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
import { catalogueFixture } from '../../test/support/game-data.js';
import { pageTask } from '../../test/support/research.js';
import { taskKeyOf } from '../domain/research/task.js';
import { taskVersions } from '../domain/research/versions.js';
import type { ResearchEvent } from '../domain/time/research-events.js';
import {
  StopReportService,
  type ResearchNews,
  type ResearchSubject,
  type RocketSubject,
} from './stop-reports.js';
import { zonedAt } from '../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);

const subject = (text: string): ResearchSubject => ({
  subjectKey: taskKeyOf(text),
  research: { text, category: 'Throwing', rewards: [DRATINI], typed: false },
});
const THROWS = subject('Make 2 Excellent Throws');
const CATCHES = subject('Catch 7 Pokémon');

function serviceWith(
  events: ResearchEvent[] = [],
  start = at('2026-11-21T10:00'),
  store = new MemoryStopReports(),
) {
  const clock = { now: start };
  const service = new StopReportService({
    rewardHash: fixtureRewardHash,
    store,
    events: { researchEvents: () => events },
    zone: ZONE,
    log: createTestLogger().log,
    now: () => clock.now,
  });
  // Each change by its server and the keys of the stops it touched.
  const changed: [string, string[]][] = [];
  const news: ResearchNews[] = [];
  service.listen({
    changed: (serverId, stops) => changed.push([serverId, stops.map((stop) => stop.key)]),
    reported: (one) => news.push(one),
  });
  return { store, clock, service, changed, news };
}

describe('StopReportService', () => {
  it('reports a task at several stops in the day’s period, until midnight', async () => {
    const { service, changed, news } = serviceWith();
    const outcome = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1), reportedStop(2)],
      subject: THROWS,
      reporter: REPORTER,
    });
    expect(outcome.period.key).toBe('day:2026-11-21');
    expect(outcome.saved.map(({ report }) => [report.stop.key, report.endsAt])).toEqual([
      [reportedStop(1).key, at('2026-11-22T00:00')],
      [reportedStop(2).key, at('2026-11-22T00:00')],
    ]);
    expect(changed).toEqual([[REPORT_SERVER, [reportedStop(1).key, reportedStop(2).key]]]);
    expect(news.map((one) => one.reports.length)).toEqual([2]);
    expect(await service.standing(REPORT_SERVER)).toHaveLength(2);
  });

  it('leaves the same task again as it stands, and corrects the reporter’s own (plan 8R-5)', async () => {
    const { service, news } = serviceWith();
    await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1)],
      subject: THROWS,
      reporter: REPORTER,
    });
    const again = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1), reportedStop(2)],
      subject: THROWS,
      reporter: OTHER_REPORTER,
    });
    // The same task again at stop 1 is reported already, and no news; stop 2 is.
    expect(news.map((one) => one.reports.map((report) => report.stop.key))).toEqual([
      [reportedStop(1).key],
      [reportedStop(2).key],
    ]);
    expect(again.saved.map(({ report }) => report.stop.key)).toEqual([reportedStop(2).key]);
    expect(again.already.map((report) => [report.stop.key, report.reporter])).toEqual([
      [reportedStop(1).key, REPORTER],
    ]);
    // Another task over one's own report is a correction: no question.
    const other = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1)],
      subject: CATCHES,
      reporter: REPORTER,
    });
    expect(other.saved[0]?.replaced?.research.text).toBe('Make 2 Excellent Throws');
    expect(news).toHaveLength(3);
  });

  it('reports in an intra-day event’s window, the day’s report waiting until it ends', async () => {
    const { service, clock } = serviceWith([PAWNIARD_DAY]);
    await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1), reportedStop(2)],
      subject: THROWS,
      reporter: REPORTER,
    });
    clock.now = at('2026-11-21T15:00');
    const during = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1)],
      subject: CATCHES,
      reporter: REPORTER,
    });
    // Another period: nothing replaced, both stand.
    expect(during.period.key).toBe('event:november-communityday2026');
    expect(during.saved[0]?.replaced).toBeUndefined();
    expect(during.saved[0]?.report.endsAt).toBe(PAWNIARD_DAY.end);
    expect((await service.at(REPORT_SERVER, reportedStop(1).key))?.research.text).toBe(
      'Catch 7 Pokémon',
    );
    // A stop with only the day's report: that one, waiting under the window.
    expect((await service.at(REPORT_SERVER, reportedStop(2).key))?.research.text).toBe(
      'Make 2 Excellent Throws',
    );
    // The window has ended: the day's reports are back, unchanged.
    clock.now = at('2026-11-21T17:00');
    expect((await service.at(REPORT_SERVER, reportedStop(1).key))?.research.text).toBe(
      'Make 2 Excellent Throws',
    );
    expect(await service.standing(REPORT_SERVER)).toHaveLength(2);
  });

  it('takes back a member’s own reports, any for staff, and none of another server', async () => {
    const { service, changed } = serviceWith();
    const { saved } = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1), reportedStop(2)],
      subject: THROWS,
      reporter: REPORTER,
    });
    const [one, two] = saved.map(({ report }) => report.id);
    expect(
      await service.takeBack(REPORT_SERVER, [one!], OTHER_REPORTER.id, 'member'),
    ).toMatchObject({
      removed: [],
      notYours: [{ id: one }],
    });
    expect(await service.takeBack('100000000000000009', [one!], REPORTER.id, 'member')).toEqual({
      removed: [],
      notYours: [],
      changed: [],
    });
    expect(
      (await service.takeBack(REPORT_SERVER, [one!], REPORTER.id, 'member')).removed.map(
        (r) => r.id,
      ),
    ).toEqual([one]);
    expect(
      (await service.takeBack(REPORT_SERVER, [two!], OTHER_REPORTER.id, 'staff')).removed.map(
        (r) => r.id,
      ),
    ).toEqual([two]);
    expect(changed).toEqual([
      [REPORT_SERVER, [reportedStop(1).key, reportedStop(2).key]],
      [REPORT_SERVER, [reportedStop(1).key]],
      [REPORT_SERVER, [reportedStop(2).key]],
    ]);
  });

  describe('Team GO Rocket (plan 8R-2)', () => {
    const WATER: RocketSubject = {
      subjectKey: 'grunt:water',
      rocket: { name: 'Water-type grunt', catches: [MUDKIP] },
    };
    const NONE: RocketSubject = {
      subjectKey: 'grunt:none',
      rocket: { name: 'Grunt (no type)', catches: [] },
    };
    const ARLO: RocketSubject = {
      subjectKey: 'leader:arlo',
      rocket: { name: 'Arlo', catches: [] },
    };
    const rocket = (
      service: StopReportService,
      subject: RocketSubject,
      more: { stop?: number; replacing?: number; reporter?: typeof REPORTER } = {},
    ) =>
      service.reportRocket({
        serverId: REPORT_SERVER,
        stop: reportedStop(more.stop ?? 1),
        subject,
        reporter: more.reporter ?? REPORTER,
        ...(more.replacing === undefined ? {} : { replacing: more.replacing }),
      });

    function rocketServiceWith() {
      const made = serviceWith([], at('2026-10-22T12:00'));
      const ended: number[][] = [];
      made.service.listen({ ended: (reports) => ended.push(reports.map((one) => one.id)) });
      return { ...made, ended };
    }

    it('reports a grunt for gruntMinutes of the day; the same grunt again is reported already', async () => {
      const { service, clock, changed } = rocketServiceWith();
      const first = await rocket(service, WATER);
      expect(first).toMatchObject({ kind: 'reported', replaced: undefined, news: true });
      if (first.kind !== 'reported') return;
      expect(first.report).toMatchObject({
        kind: 'rocket',
        periodKey: 'day:2026-10-22',
        endsAt: at('2026-10-22T12:30'),
        subjectKey: 'grunt:water',
      });
      // A grunt changes no pinned post.
      expect(changed).toEqual([]);
      clock.now += 10 * 60_000;
      expect(await rocket(service, WATER, { reporter: OTHER_REPORTER })).toEqual({
        kind: 'already',
        standing: first.report,
      });
      expect(await service.rocketAt(REPORT_SERVER, reportedStop(1).key)).toEqual(first.report);
      // Once it has ended it is a new report.
      clock.now = at('2026-10-22T12:30');
      expect(await rocket(service, WATER)).toMatchObject({ kind: 'reported', news: true });
    });

    it('refines a grunt by a lineup of its type in place: its id kept, nothing ended (plan 8R-4L)', async () => {
      const { service, clock, ended, changed } = rocketServiceWith();
      const magikarps: RocketSubject = {
        subjectKey: 'grunt:water:male',
        rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
      };
      const mudkips: RocketSubject = {
        subjectKey: 'grunt:water:female',
        rocket: { name: 'Water-type grunt', catches: [MUDKIP], lineup: 'Mudkip, Tentacool' },
      };
      const notSure = await rocket(service, WATER);
      if (notSure.kind !== 'reported') throw new Error(notSure.kind);
      clock.now += 5 * 60_000;
      const refined = await rocket(service, magikarps, { reporter: OTHER_REPORTER });
      expect(refined).toEqual({
        kind: 'refined',
        report: {
          ...notSure.report,
          subjectKey: 'grunt:water:male',
          rocket: magikarps.rocket,
          reporter: OTHER_REPORTER,
          madeAt: clock.now,
          endsAt: clock.now + 30 * 60_000,
        },
        replaced: notSure.report,
      });
      if (refined.kind !== 'refined') return;
      // The other lineup over it, in place again; not sure which over a lineup says less.
      const other = await rocket(service, mudkips);
      expect(other).toMatchObject({ kind: 'refined', report: { id: notSure.report.id } });
      expect(await rocket(service, WATER, { reporter: OTHER_REPORTER })).toMatchObject({
        kind: 'already',
        standing: { subjectKey: 'grunt:water:female' },
      });
      expect(ended).toEqual([]);
      expect(changed).toEqual([]);
      expect((await service.standing(REPORT_SERVER)).map((one) => one.id)).toEqual([
        notSure.report.id,
      ]);
    });

    describe('a report’s version: its id and madeAt (L1)', () => {
      const MAGIKARPS: RocketSubject = {
        subjectKey: 'grunt:water:male',
        rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
      };

      async function refinedByMisty() {
        const made = rocketServiceWith();
        const notSure = await rocket(made.service, WATER);
        if (notSure.kind !== 'reported') throw new Error(notSure.kind);
        made.clock.now += 5 * 60_000;
        const refined = await rocket(made.service, MAGIKARPS, { reporter: OTHER_REPORTER });
        if (refined.kind !== 'refined') throw new Error(refined.kind);
        return { ...made, before: notSure.report, now: refined.report };
      }

      it('takes back nothing by a version refined since, for staff and the first reporter alike', async () => {
        const { service, ended, before, now } = await refinedByMisty();
        const stale = { id: before.id, madeAt: before.madeAt };
        for (const [by, as] of [
          ['200000000000000099', 'staff'],
          [REPORTER.id, 'member'],
        ] as const) {
          expect(await service.takeBack(REPORT_SERVER, [stale], by, as)).toEqual({
            removed: [],
            notYours: [],
            changed: [now],
          });
        }
        expect(ended).toEqual([]);
        expect(await service.rocketAt(REPORT_SERVER, reportedStop(1).key)).toEqual(now);
        // The version that stands is taken back.
        const current = { id: now.id, madeAt: now.madeAt };
        expect(
          (await service.takeBack(REPORT_SERVER, [current], OTHER_REPORTER.id, 'member')).removed,
        ).toEqual([now]);
      });

      it('gives a report as it is kept now, and puts no hideout back over a grunt refined since', async () => {
        const made = rocketServiceWith();
        const arlo = await rocket(made.service, ARLO);
        if (arlo.kind !== 'reported') throw new Error(arlo.kind);
        const grunt = await rocket(made.service, WATER, { replacing: arlo.report.id });
        if (grunt.kind !== 'reported') throw new Error(grunt.kind);
        made.clock.now += 60_000;
        const refined = await rocket(made.service, MAGIKARPS, { reporter: OTHER_REPORTER });
        if (refined.kind !== 'refined') throw new Error(refined.kind);
        expect(await made.service.kept(REPORT_SERVER, grunt.report.id)).toEqual(refined.report);
        // The grunt as it was when it replaced Arlo is no longer what stands.
        expect(await made.service.restore(arlo.report, grunt.report)).toBeUndefined();
        expect(await made.service.rocketAt(REPORT_SERVER, reportedStop(1).key)).toEqual(
          refined.report,
        );
      });
    });

    it('replaces a grunt by another at once, and tells that the first one ended', async () => {
      const { service, ended } = rocketServiceWith();
      const first = await rocket(service, WATER);
      const second = await rocket(service, NONE, { reporter: OTHER_REPORTER });
      expect(second).toMatchObject({ kind: 'reported', news: true });
      if (first.kind !== 'reported' || second.kind !== 'reported') return;
      expect(second.replaced).toEqual(first.report);
      expect(ended).toEqual([[first.report.id]]);
      expect(await service.standing(REPORT_SERVER)).toEqual([second.report]);
    });

    it('names nothing replaced where the grunt before had ended (fix F2)', async () => {
      const { service, clock, ended } = rocketServiceWith();
      expect(await rocket(service, NONE)).toMatchObject({ kind: 'reported' });
      clock.now = at('2026-10-22T13:00');
      const later = await rocket(service, WATER, { reporter: OTHER_REPORTER });
      expect(later).toMatchObject({ kind: 'reported', replaced: undefined, news: true });
      // The same grunt after its end is no "again" either.
      clock.now = at('2026-10-22T14:00');
      expect(await rocket(service, WATER)).toMatchObject({ kind: 'reported', replaced: undefined });
      expect(ended).toEqual([]);
    });

    it('asks before a grunt replaces a hideout; Replace for that hideout reports it', async () => {
      const { service, changed, ended } = rocketServiceWith();
      const arlo = await rocket(service, ARLO);
      if (arlo.kind !== 'reported') throw new Error('not reported');
      expect(arlo.report.endsAt).toBe(at('2026-10-23T00:00'));
      expect(changed).toEqual([[REPORT_SERVER, [reportedStop(1).key]]]);
      expect(await rocket(service, WATER)).toEqual({ kind: 'asks', standing: arlo.report });
      expect(await rocket(service, WATER, { replacing: arlo.report.id + 1 })).toMatchObject({
        kind: 'asks',
      });
      const replaced = await rocket(service, WATER, { replacing: arlo.report.id });
      expect(replaced).toMatchObject({ kind: 'reported', replaced: arlo.report, news: true });
      expect(ended).toEqual([[arlo.report.id]]);
      // The hideout left the post.
      expect(changed).toHaveLength(2);
    });

    it('lets a hideout replace a grunt; the same hideout again is no news', async () => {
      const { service, ended } = rocketServiceWith();
      const grunt = await rocket(service, WATER);
      const arlo = await rocket(service, ARLO);
      expect(arlo).toMatchObject({ kind: 'reported', news: true });
      const again = await rocket(service, ARLO, { reporter: OTHER_REPORTER });
      expect(again).toMatchObject({ kind: 'reported', news: false });
      if (grunt.kind !== 'reported' || arlo.kind !== 'reported') return;
      expect(ended).toEqual([[grunt.report.id], [arlo.report.id]]);
    });

    it('keeps research and Rocket at a stop apart', async () => {
      const { service } = rocketServiceWith();
      await service.reportResearch({
        serverId: REPORT_SERVER,
        stops: [reportedStop(1)],
        subject: THROWS,
        reporter: REPORTER,
      });
      const grunt = await rocket(service, WATER);
      expect(grunt).toMatchObject({ kind: 'reported', replaced: undefined });
      expect((await service.at(REPORT_SERVER, reportedStop(1).key))?.kind).toBe('research');
      expect((await service.rocketAt(REPORT_SERVER, reportedStop(1).key))?.kind).toBe('rocket');
      expect(await service.rocketAt(REPORT_SERVER, reportedStop(2).key)).toBeUndefined();
    });

    it('takes back a Rocket report, and tells that it ended', async () => {
      const { service, ended } = rocketServiceWith();
      const grunt = await rocket(service, WATER);
      if (grunt.kind !== 'reported') throw new Error('not reported');
      const { removed } = await service.takeBack(
        REPORT_SERVER,
        [grunt.report.id],
        REPORTER.id,
        'member',
      );
      expect(removed).toEqual([grunt.report]);
      expect(ended).toEqual([[grunt.report.id]]);
    });

    it('draws no post when only a grunt is taken back; a hideout taken back draws it', async () => {
      const { service, changed } = rocketServiceWith();
      const grunt = await rocket(service, WATER);
      const arlo = await rocket(service, ARLO, { stop: 2 });
      if (grunt.kind !== 'reported' || arlo.kind !== 'reported') throw new Error('not reported');
      changed.length = 0;
      await service.takeBack(REPORT_SERVER, [grunt.report.id], REPORTER.id, 'member');
      expect(changed).toEqual([]);
      await service.takeBack(REPORT_SERVER, [arlo.report.id], REPORTER.id, 'member');
      expect(changed).toEqual([[REPORT_SERVER, [reportedStop(2).key]]]);
    });

    it('keeps one Rocket report per stop across midnight (fix A2)', async () => {
      const { service, clock, ended } = rocketServiceWith();
      clock.now = at('2026-10-22T23:50');
      const late = await rocket(service, WATER);
      if (late.kind !== 'reported') throw new Error('not reported');
      clock.now = at('2026-10-23T00:05');
      // Yesterday's grunt still stands: the same grunt is reported already.
      expect(await rocket(service, WATER)).toEqual({ kind: 'already', standing: late.report });
      // Another grunt replaces it, across the day.
      const other = await rocket(service, NONE);
      expect(other).toMatchObject({ kind: 'reported', replaced: late.report });
      expect(ended).toEqual([[late.report.id]]);
      expect(await service.standing(REPORT_SERVER)).toHaveLength(1);
      // A hideout ends a grunt of yesterday as well.
      clock.now = at('2026-10-23T23:55');
      const lateAgain = await rocket(service, WATER, { stop: 3 });
      if (lateAgain.kind !== 'reported') throw new Error('not reported');
      clock.now = at('2026-10-24T00:01');
      const arlo = await rocket(service, ARLO, { stop: 3 });
      expect(arlo).toMatchObject({ kind: 'reported', replaced: lateAgain.report });
      expect(ended.at(-1)).toEqual([lateAgain.report.id]);
    });
  });

  it('forgets the reports that ended', async () => {
    const { service, clock, store } = serviceWith();
    await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1)],
      subject: THROWS,
      reporter: REPORTER,
    });
    clock.now = at('2026-11-22T00:00');
    expect(await service.standing(REPORT_SERVER)).toEqual([]);
    expect(await service.sweep()).toBe(1);
    expect(store.rows.size).toBe(0);
  });

  it('names nothing replaced where the period’s report there had ended (review R1)', async () => {
    const { service, clock, store, news } = serviceWith();
    // Another member's report of the same task in the period on now, ended already (not swept).
    await store.save({
      serverId: REPORT_SERVER,
      kind: 'research',
      stop: reportedStop(1),
      periodKey: 'day:2026-11-21',
      endsAt: clock.now - 60_000,
      subjectKey: THROWS.subjectKey,
      research: THROWS.research,
      reporter: OTHER_REPORTER,
      madeAt: clock.now - 3_600_000,
    });
    const outcome = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(1)],
      subject: THROWS,
      reporter: REPORTER,
    });
    expect(outcome.saved.map(({ replaced }) => replaced)).toEqual([undefined]);
    // A first report as far as members saw: news, replacing nothing.
    expect(news.map((one) => [one.reports.length, one.replaced])).toEqual([[1, []]]);
  });
});

describe('StopReportService and the versions of a task (plan 8R-5)', () => {
  const task = pageTask('Make 3 Excellent Throws in a row');
  const versions = taskVersions(task, catalogueFixture());
  const version = (label: string): ResearchSubject => {
    const found = versions.find((one) => one.label === label);
    if (!found) throw new Error(`no version ${label}`);
    return {
      subjectKey: found.value,
      research: { text: task.text, category: task.category, rewards: found.rewards, typed: false },
    };
  };
  const ONE_OF = version('one of Larvitar, Beldum, Gible');
  const GIBLE = version('Gible');
  const BELDUM = version('Beldum');
  const report = (
    service: StopReportService,
    subject: ResearchSubject,
    reporter = REPORTER,
    stops = [reportedStop(1)],
    replacing?: number[],
  ) =>
    service.reportResearch({
      serverId: REPORT_SERVER,
      stops,
      subject,
      reporter,
      ...(replacing === undefined ? {} : { replacing }),
    });

  it('narrows "one of" to its reward without asking, the news carrying what it replaced', async () => {
    const { service, news, changed } = serviceWith();
    const first = await report(service, ONE_OF, OTHER_REPORTER);
    const narrowed = await report(service, GIBLE);
    const [saved] = narrowed.saved;
    expect(saved?.replaced?.id).toBe(first.saved[0]?.report.id);
    expect(saved?.report.subjectKey).toBe(GIBLE.subjectKey);
    expect(news.at(-1)?.replaced.map((one) => one.subjectKey)).toEqual([ONE_OF.subjectKey]);
    expect(changed).toHaveLength(2);
  });

  it('narrows "one of" to its costumed reward, told apart by the catalogue (review L5)', async () => {
    const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
    const pikachu = (picture: string) => ({
      kind: 'encounter' as const,
      name: 'Pikachu',
      key: 'pikachu',
      dex: 25,
      shiny: false,
      cp: null,
      image: `${crop}${picture}`,
    });
    const costumedTask = {
      key: taskKeyOf('Catch 5 Electric-type Pokémon'),
      text: 'Catch 5 Electric-type Pokémon',
      category: 'Catching',
      rewards: [pikachu('pm25.icon.png'), pikachu('pm25.fPXP_2026.icon.png')],
    };
    const [, costumed, oneOf] = taskVersions(costumedTask, catalogueFixture());
    const as = (found: typeof costumed): ResearchSubject => ({
      subjectKey: found!.value,
      research: {
        text: costumedTask.text,
        category: costumedTask.category,
        rewards: found!.rewards,
        typed: false,
      },
    });
    const { service } = serviceWith();
    await report(service, as(oneOf), OTHER_REPORTER);
    const narrowed = await report(service, as(costumed));
    expect(narrowed.asks).toEqual([]);
    expect(narrowed.saved.map(({ report: one }) => one.subjectKey)).toEqual([costumed!.value]);
  });

  it('answers "one of" over its reward, and the same version, as reported already', async () => {
    const { service, news, changed } = serviceWith();
    await report(service, GIBLE, OTHER_REPORTER);
    const less = await report(service, ONE_OF);
    const again = await report(service, GIBLE);
    for (const outcome of [less, again]) {
      expect(outcome.saved).toEqual([]);
      expect(outcome.already.map((one) => one.subjectKey)).toEqual([GIBLE.subjectKey]);
    }
    expect(news).toHaveLength(1);
    expect(changed).toHaveLength(1);
  });

  it('asks before contradicting another’s report, and replaces it where ticked (R7)', async () => {
    const { service, news } = serviceWith();
    const gible = (await report(service, GIBLE, OTHER_REPORTER)).saved[0]!.report;
    expect(await service.contested(REPORT_SERVER, [reportedStop(1)], BELDUM, REPORTER.id)).toEqual([
      gible,
    ]);
    const asked = await report(service, BELDUM);
    expect(asked.saved).toEqual([]);
    expect(asked.asks).toEqual([gible]);
    // Ticked: replaced. The reporter's own report is corrected without asking.
    const ticked = await report(service, BELDUM, REPORTER, [reportedStop(1)], [gible.id]);
    expect(ticked.saved[0]?.replaced?.id).toBe(gible.id);
    expect(await service.contested(REPORT_SERVER, [reportedStop(1)], GIBLE, REPORTER.id)).toEqual(
      [],
    );
    expect((await report(service, GIBLE)).saved).toHaveLength(1);
    expect(news).toHaveLength(3);
  });

  it('decides each stop for itself in a report of several', async () => {
    const { service } = serviceWith();
    await report(service, GIBLE, OTHER_REPORTER, [reportedStop(1)]);
    await report(service, BELDUM, OTHER_REPORTER, [reportedStop(2)]);
    await report(service, ONE_OF, OTHER_REPORTER, [reportedStop(3)]);
    const outcome = await report(service, GIBLE, REPORTER, [
      reportedStop(1),
      reportedStop(2),
      reportedStop(3),
      reportedStop(4),
    ]);
    expect(outcome.already.map((one) => one.stop.key)).toEqual([reportedStop(1).key]);
    expect(outcome.asks.map((one) => one.stop.key)).toEqual([reportedStop(2).key]);
    expect(outcome.saved.map(({ report: made }) => made.stop.key)).toEqual([
      reportedStop(3).key,
      reportedStop(4).key,
    ]);
  });

  it('decides under an intra-day event only against the window’s own report (R15)', async () => {
    const { service, clock } = serviceWith([PAWNIARD_DAY]);
    await report(service, GIBLE, OTHER_REPORTER);
    clock.now = at('2026-11-21T15:00');
    const during = await report(service, BELDUM);
    expect(during.saved.map(({ replaced }) => replaced)).toEqual([undefined]);
    expect(await service.contested(REPORT_SERVER, [reportedStop(1)], GIBLE, REPORTER.id)).toEqual(
      [],
    );
  });
});

describe('StopReportService.latestToday (Matt, 2026-10-27: "Last today")', () => {
  const WATER: RocketSubject = {
    subjectKey: 'grunt:water',
    rocket: { name: 'Water-type grunt', catches: [MUDKIP] },
  };

  const MAGIKARPS: RocketSubject = {
    subjectKey: 'grunt:water:male',
    rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
  };
  const grunt = (service: StopReportService, stop: number, subject = WATER, reporter = REPORTER) =>
    service.reportRocket({ serverId: REPORT_SERVER, stop: reportedStop(stop), subject, reporter });
  const research = (
    service: StopReportService,
    stop: number,
    reporter = REPORTER,
    replacing?: number[],
  ) =>
    service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(stop)],
      subject: THROWS,
      reporter,
      ...(replacing ? { replacing } : {}),
    });
  const where = (stop: number, madeAt: number) => ({
    lat: reportedStop(stop).lat,
    lon: reportedStop(stop).lon,
    madeAt,
  });

  it('gives where the member last reported today, also a grunt whose time is over and swept', async () => {
    const { service, clock, store } = serviceWith([], at('2026-11-21T23:50'));
    // Made yesterday: no report of today.
    await research(service, 1);
    clock.now = at('2026-11-22T09:00');
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toBeUndefined();
    expect(await grunt(service, 2)).toMatchObject({ kind: 'reported' });
    // An hour on, the grunt has gone, and the hourly upkeep forgets every report that has ended
    // (yesterday's research and the grunt): the record still says where the member was.
    clock.now = at('2026-11-22T10:00');
    expect(await service.sweep()).toBe(2);
    expect(store.rows.size).toBe(0);
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(2, at('2026-11-22T09:00')),
    );
    expect(await service.latestToday(REPORT_SERVER, OTHER_REPORTER.id)).toBeUndefined();
    // Past midnight it is yesterday's.
    clock.now = at('2026-11-23T00:00');
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toBeUndefined();
  });

  it('keeps where the member reported when another member replaces or refines it (review R2)', async () => {
    const { service, clock } = serviceWith([], at('2026-11-22T09:00'));
    await grunt(service, 2);
    clock.now = at('2026-11-22T09:05');
    const mine = await research(service, 1);
    // Misty replaces Ash's research at stop 1.
    clock.now = at('2026-11-22T09:06');
    await research(service, 1, OTHER_REPORTER, [mine.saved[0]!.report.id]);
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(1, at('2026-11-22T09:05')),
    );
    // Ash's grunt at stop 3, refined in place by Misty: the row is hers now, the record Ash's.
    clock.now = at('2026-11-22T09:10');
    await grunt(service, 3);
    clock.now = at('2026-11-22T09:12');
    expect(await grunt(service, 3, MAGIKARPS, OTHER_REPORTER)).toMatchObject({
      kind: 'refined',
    });
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(3, at('2026-11-22T09:10')),
    );
    expect(await service.latestToday(REPORT_SERVER, OTHER_REPORTER.id)).toEqual(
      where(3, at('2026-11-22T09:12')),
    );
  });

  it('records nothing for a report already standing or one that asks first (review S2)', async () => {
    const ARLO: RocketSubject = {
      subjectKey: 'leader:arlo',
      rocket: { name: 'Arlo', catches: [] },
    };
    const { service, clock } = serviceWith([], at('2026-11-22T09:00'));
    // Ash's grunt at stop 1, research at stop 2 and Arlo at stop 3; Misty last reported at stop 5.
    await grunt(service, 1);
    await research(service, 2);
    await grunt(service, 3, ARLO);
    await grunt(service, 5, WATER, OTHER_REPORTER);
    clock.now = at('2026-11-22T09:05');
    // The same grunt and the same task again are reported already; a grunt over Arlo asks.
    expect(await grunt(service, 1, WATER, OTHER_REPORTER)).toMatchObject({ kind: 'already' });
    expect((await research(service, 2, OTHER_REPORTER)).already).toHaveLength(1);
    expect(await grunt(service, 3, WATER, OTHER_REPORTER)).toMatchObject({ kind: 'asks' });
    // Another task over Ash's research asks.
    const other = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(2)],
      subject: CATCHES,
      reporter: OTHER_REPORTER,
    });
    expect(other.asks).toHaveLength(1);
    expect(await service.latestToday(REPORT_SERVER, OTHER_REPORTER.id)).toEqual(
      where(5, at('2026-11-22T09:00')),
    );
  });

  it('records the last stop a research report saved, not the last one asked for (review S2)', async () => {
    const { service, clock } = serviceWith([], at('2026-11-22T09:00'));
    await research(service, 1, OTHER_REPORTER);
    clock.now = at('2026-11-22T09:05');
    // Stop 1 has this task already (Misty's): stops 3 and 4 are saved, in that order.
    const outcome = await service.reportResearch({
      serverId: REPORT_SERVER,
      stops: [reportedStop(3), reportedStop(4), reportedStop(1)],
      subject: THROWS,
      reporter: REPORTER,
    });
    expect(outcome.saved.map(({ report }) => report.stop.key)).toEqual([
      reportedStop(3).key,
      reportedStop(4).key,
    ]);
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(4, at('2026-11-22T09:05')),
    );
  });

  it('records a refine in place by the row’s time, which is later than the one it refined', async () => {
    const { service } = serviceWith([], at('2026-11-22T09:10'));
    await grunt(service, 3);
    // Misty's refine reads the same clock: the row is written a millisecond after Ash's.
    const refined = await grunt(service, 3, MAGIKARPS, OTHER_REPORTER);
    if (refined.kind !== 'refined') throw new Error(refined.kind);
    expect(refined.report.madeAt).toBe(at('2026-11-22T09:10') + 1);
    expect(await service.latestToday(REPORT_SERVER, OTHER_REPORTER.id)).toEqual(
      where(3, refined.report.madeAt),
    );
  });

  it('forgets the member’s latest report once they take it back: the one before it counts (review S1)', async () => {
    const { service, clock } = serviceWith([], at('2026-11-22T09:00'));
    await research(service, 1);
    clock.now = at('2026-11-22T09:01');
    const earlier = await grunt(service, 4);
    if (earlier.kind !== 'reported') throw new Error(earlier.kind);
    clock.now = at('2026-11-22T09:05');
    const wrong = await grunt(service, 2);
    if (wrong.kind !== 'reported') throw new Error(wrong.kind);
    // Taking back an earlier report leaves the latest recorded.
    clock.now = at('2026-11-22T09:06');
    expect(
      (await service.takeBack(REPORT_SERVER, [earlier.report.id], REPORTER.id, 'member')).removed,
    ).toEqual([earlier.report]);
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(2, at('2026-11-22T09:05')),
    );
    // Ash reports at the wrong stop 3 and takes it back by its version: stop 2 counts again.
    clock.now = at('2026-11-22T09:08');
    const third = await grunt(service, 3);
    if (third.kind !== 'reported') throw new Error(third.kind);
    const version = { id: third.report.id, madeAt: third.report.madeAt };
    await service.takeBack(REPORT_SERVER, [version], REPORTER.id, 'member');
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(2, at('2026-11-22T09:05')),
    );
    // And the grunt at stop 2 by its id: the research at stop 1 is all that is left of today.
    await service.takeBack(REPORT_SERVER, [wrong.report.id], REPORTER.id, 'member');
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(1, at('2026-11-22T09:00')),
    );
  });

  it('keeps the record when staff take the member’s report back, and forgets a refine its maker takes back', async () => {
    const { service, clock } = serviceWith([], at('2026-11-22T09:00'));
    const ash = await grunt(service, 2);
    if (ash.kind !== 'reported') throw new Error(ash.kind);
    await service.takeBack(REPORT_SERVER, [ash.report.id], OTHER_REPORTER.id, 'staff');
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(2, at('2026-11-22T09:00')),
    );
    // Misty refines Ash's grunt at stop 3 on the same clock, then takes her version back.
    clock.now = at('2026-11-22T09:10');
    await grunt(service, 3);
    const refined = await grunt(service, 3, MAGIKARPS, OTHER_REPORTER);
    if (refined.kind !== 'refined') throw new Error(refined.kind);
    const version = { id: refined.report.id, madeAt: refined.report.madeAt };
    expect(
      (await service.takeBack(REPORT_SERVER, [version], OTHER_REPORTER.id, 'member')).removed,
    ).toHaveLength(1);
    expect(await service.latestToday(REPORT_SERVER, OTHER_REPORTER.id)).toBeUndefined();
    expect(await service.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(3, at('2026-11-22T09:10')),
    );
  });

  it('after a restart reads the member’s latest report kept of today', async () => {
    const { service, clock, store } = serviceWith([], at('2026-11-22T09:00'));
    await research(service, 1);
    clock.now = at('2026-11-22T09:05');
    await grunt(service, 2);
    // A new service over the same reports: its record is empty.
    const restarted = serviceWith([], at('2026-11-22T09:10'), store).service;
    expect(await restarted.latestToday(REPORT_SERVER, REPORTER.id)).toEqual(
      where(2, at('2026-11-22T09:05')),
    );
    expect(await restarted.latestToday(REPORT_SERVER, OTHER_REPORTER.id)).toBeUndefined();
  });
});
