import { expect, it } from 'vitest';
import type { StopReportStorage } from '../../src/db/repositories/stop-report-repository.js';
import type { RocketCatch } from '../../src/domain/rocket/lineups.js';
import type { ReportedStop, ResearchReport, RocketReport } from '../../src/domain/stops/report.js';
import { taskKeyOf, type TaskReward } from '../../src/domain/research/task.js';

/** When the reports of these cases are made (2026-10-21 10:00 in New York). */
export const REPORT_NOW = Date.UTC(2026, 9, 21, 14);
/** Local midnight after `REPORT_NOW` in New York: the end of the day's period. */
export const REPORT_MIDNIGHT = Date.UTC(2026, 9, 22, 4);
export const REPORT_SERVER = '100000000000000001';
export const OTHER_SERVER = '100000000000000002';
export const REPORTER = { id: '200000000000000031', name: 'Brock' };
export const OTHER_REPORTER = { id: '200000000000000032', name: 'Misty' };

/** The Dratini reward of "Make 2 Excellent Throws", as the page lists it. */
export const DRATINI: TaskReward = {
  kind: 'encounter',
  name: 'Dratini',
  key: 'dratini',
  dex: 147,
  shiny: true,
  cp: { min: 397, max: 430 },
  image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm147.icon.png',
};

/** An invented stop: a kept Wayspot by its key (`n` makes another). */
export function reportedStop(n = 1, overrides: Partial<ReportedStop> = {}): ReportedStop {
  return {
    key: `${String(n).padStart(32, 'a')}.16`,
    name: `Yellow Mural ${String(n)}`,
    address: 'Market Street',
    image: null,
    lat: 40.44 + n / 10_000,
    lon: -79.99,
    ...overrides,
  };
}

/** A report of "Make 2 Excellent Throws" (Dratini) by Brock at stop 1, in the day's period. */
export function researchReport(
  overrides: Partial<Omit<ResearchReport, 'id'>> = {},
): Omit<ResearchReport, 'id'> {
  const text = 'Make 2 Excellent Throws';
  return {
    serverId: REPORT_SERVER,
    kind: 'research',
    stop: reportedStop(),
    periodKey: 'day:2026-10-21',
    endsAt: REPORT_MIDNIGHT,
    subjectKey: taskKeyOf(text),
    research: { text, category: 'Throwing', rewards: [DRATINI], typed: false },
    reporter: REPORTER,
    madeAt: REPORT_NOW,
    ...overrides,
  };
}

/** The catch of the water grunts' first lineup, as the feed of 2026-10-22 has it. */
export const MUDKIP: RocketCatch = {
  name: 'Mudkip',
  key: 'mudkip',
  dex: 258,
  shiny: true,
  image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm258.icon.png',
};

/** The first catch of the water grunts' other lineup (plan 8R-4L). */
export const MAGIKARP: RocketCatch = {
  name: 'Magikarp',
  key: 'magikarp',
  dex: 129,
  shiny: true,
  image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png',
};

/**
 * The Water-type grunt's lineup of Magikarp and Feebas (plan 8R-4L) by Misty at stop 1, a minute
 * after `REPORT_NOW`, for half an hour from then.
 */
export function magikarpLineup(
  overrides: Partial<Omit<RocketReport, 'id'>> = {},
): Omit<RocketReport, 'id'> {
  return rocketReport({
    subjectKey: 'grunt:water:male',
    rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
    reporter: OTHER_REPORTER,
    madeAt: REPORT_NOW + 60_000,
    endsAt: REPORT_NOW + 31 * 60_000,
    ...overrides,
  });
}

/** A Water-type grunt by Brock at stop 1, for half an hour from `REPORT_NOW`. */
export function rocketReport(
  overrides: Partial<Omit<RocketReport, 'id'>> = {},
): Omit<RocketReport, 'id'> {
  return {
    serverId: REPORT_SERVER,
    kind: 'rocket',
    stop: reportedStop(),
    periodKey: 'day:2026-10-21',
    endsAt: REPORT_NOW + 30 * 60_000,
    subjectKey: 'grunt:water',
    rocket: { name: 'Water-type grunt', catches: [MUDKIP] },
    reporter: REPORTER,
    madeAt: REPORT_NOW,
    ...overrides,
  };
}

/**
 * What the reports at stops do, run against the repository and its twin in memory alike. `made`
 * gives a fresh, empty store.
 */
export function stopReportCases(made: () => Promise<StopReportStorage>): void {
  it('keeps a report and reads it back by id and among the standing ones', async () => {
    const store = await made();
    const { report, replaced } = await store.save(researchReport());
    expect(replaced).toBeUndefined();
    expect(report).toEqual({ ...researchReport(), id: report.id });
    expect(await store.byId(report.id)).toEqual(report);
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([report]);
    expect(await store.standing(OTHER_SERVER, REPORT_NOW)).toEqual([]);
    expect(await store.serversStanding(REPORT_NOW)).toEqual([REPORT_SERVER]);
  });

  it('keeps that a reward is costumed (plan 8R-5, review W1)', async () => {
    const store = await made();
    const costumed: TaskReward = {
      kind: 'encounter',
      name: 'Pikachu',
      key: 'pikachu',
      dex: 25,
      shiny: false,
      cp: null,
      image: null,
      costumed: true,
    };
    const research = { ...researchReport().research, rewards: [costumed, DRATINI] };
    const { report } = await store.save(researchReport({ research }));
    expect(await store.byId(report.id)).toMatchObject({
      research: { rewards: [costumed, DRATINI] },
    });
  });

  it('replaces the report of the same server, stop, kind and period, whoever made it', async () => {
    const store = await made();
    const first = await store.save(researchReport());
    const text = 'Catch 7 Pokémon';
    const second = await store.save(
      researchReport({
        subjectKey: taskKeyOf(text),
        research: { text, category: 'Catching', rewards: [], typed: false },
        reporter: OTHER_REPORTER,
        madeAt: REPORT_NOW + 60_000,
      }),
    );
    expect(second.replaced).toEqual(first.report);
    // An id never changes what it is: the replacement is a report of its own, the replaced one
    // gone (an old answer's Take back finds nothing).
    expect(second.report.id).not.toBe(first.report.id);
    expect(await store.byId(first.report.id)).toBeUndefined();
    expect(await store.remove(first.report.id, REPORT_SERVER)).toBeUndefined();
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([second.report]);
  });

  it('keeps reports of other stops, periods and servers apart', async () => {
    const store = await made();
    const one = await store.save(researchReport());
    const otherStop = await store.save(researchReport({ stop: reportedStop(2) }));
    const otherPeriod = await store.save(
      researchReport({ periodKey: 'event:november-communityday2026' }),
    );
    const otherServer = await store.save(researchReport({ serverId: OTHER_SERVER }));
    for (const saved of [otherStop, otherPeriod, otherServer])
      expect(saved.replaced).toBeUndefined();
    expect((await store.standing(REPORT_SERVER, REPORT_NOW)).map((r) => r.id)).toEqual([
      one.report.id,
      otherStop.report.id,
      otherPeriod.report.id,
    ]);
    expect(await store.serversStanding(REPORT_NOW)).toEqual([REPORT_SERVER, OTHER_SERVER].sort());
  });

  it('stands until its end, and is forgotten once ended', async () => {
    const store = await made();
    const { report } = await store.save(researchReport());
    expect(await store.standing(REPORT_SERVER, REPORT_MIDNIGHT - 1)).toEqual([report]);
    expect(await store.standing(REPORT_SERVER, REPORT_MIDNIGHT)).toEqual([]);
    expect(await store.removeEnded(REPORT_MIDNIGHT - 1)).toBe(0);
    expect(await store.removeEnded(REPORT_MIDNIGHT)).toBe(1);
    expect(await store.byId(report.id)).toBeUndefined();
  });

  it('takes back a report of its own server only, once', async () => {
    const store = await made();
    const { report } = await store.save(researchReport());
    expect(await store.remove(report.id, OTHER_SERVER)).toBeUndefined();
    expect(await store.remove(report.id, REPORT_SERVER)).toEqual(report);
    expect(await store.remove(report.id, REPORT_SERVER)).toBeUndefined();
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([]);
  });

  it('keeps a Rocket report beside the research of the same stop and day (plan 8R-2)', async () => {
    const store = await made();
    const research = await store.save(researchReport());
    const rocket = await store.save(rocketReport());
    expect(rocket.replaced).toBeUndefined();
    expect(rocket.report).toEqual({ ...rocketReport(), id: rocket.report.id });
    expect(await store.byId(rocket.report.id)).toEqual(rocket.report);
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([
      research.report,
      rocket.report,
    ]);
  });

  it('keeps what stands when the decision says so, and replaces it else (plan 8R-2)', async () => {
    const store = await made();
    const grunt = await store.save(rocketReport());
    const arlo = rocketReport({
      subjectKey: 'leader:arlo',
      rocket: { name: 'Arlo', catches: [] },
      endsAt: REPORT_MIDNIGHT,
      reporter: OTHER_REPORTER,
    });
    const asked: unknown[] = [];
    expect(
      await store.saveUnless(arlo, (standing) => {
        asked.push(standing);
        return 'keep';
      }),
    ).toEqual({ saved: false, standing: grunt.report });
    expect(asked).toEqual([grunt.report]);
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([grunt.report]);
    const replaced = await store.saveUnless(arlo, () => 'replace');
    expect(replaced).toMatchObject({ saved: true, inPlace: false, replaced: grunt.report });
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([
      replaced.saved ? replaced.report : undefined,
    ]);
    // Nothing standing: nothing to ask about.
    const other = await store.saveUnless(rocketReport({ stop: reportedStop(2) }), () => 'keep');
    expect(other).toMatchObject({ saved: true, inPlace: false, replaced: undefined });
  });

  it('keeps a grunt’s lineup with its report (plan 8R-4L)', async () => {
    const store = await made();
    const { report } = await store.save(magikarpLineup());
    expect(report).toEqual({ ...magikarpLineup(), id: report.id });
    expect(await store.byId(report.id)).toEqual(report);
  });

  it('changes the report standing in place when the decision says so (plan 8R-4L)', async () => {
    const store = await made();
    const notSure = await store.save(rocketReport());
    const refined = await store.saveUnless(magikarpLineup(), () => 'update');
    // The same row and id; who it is of, what it says, who reported and its times are the new.
    const expected = { ...magikarpLineup(), id: notSure.report.id };
    expect(refined).toEqual({
      saved: true,
      inPlace: true,
      report: expected,
      replaced: notSure.report,
    });
    expect(await store.byId(notSure.report.id)).toEqual(expected);
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([expected]);
  });

  it('changes a report in place into a strictly newer version, its length kept (F1)', async () => {
    const store = await made();
    const notSure = await store.save(rocketReport());
    const { id } = notSure.report;
    // A clock behind the one that made it: the version written is a millisecond newer, and the
    // grunt ends as much later, its half hour kept.
    const older = magikarpLineup({
      madeAt: REPORT_NOW - 5_000,
      endsAt: REPORT_NOW - 5_000 + 30 * 60_000,
    });
    const behind = await store.saveUnless(older, () => 'update');
    const first = { ...older, id, madeAt: REPORT_NOW + 1, endsAt: REPORT_NOW + 1 + 30 * 60_000 };
    expect(behind).toEqual({ saved: true, inPlace: true, report: first, replaced: notSure.report });
    expect(await store.byId(id)).toEqual(first);
    // The same moment as the standing version: a millisecond newer too, never equal.
    const same = magikarpLineup({ madeAt: first.madeAt, endsAt: first.endsAt });
    const again = await store.saveUnless(same, () => 'update');
    const second = { ...same, id, madeAt: first.madeAt + 1, endsAt: first.endsAt + 1 };
    expect(again).toMatchObject({ saved: true, inPlace: true, report: second });
    expect(await store.byId(id)).toEqual(second);
  });

  it('takes back a report by its id only while it was made when expected (L1)', async () => {
    const store = await made();
    const notSure = await store.save(rocketReport());
    await store.saveUnless(magikarpLineup(), () => 'update');
    const { id } = notSure.report;
    // The id stays, the version is gone: a Take back of the report as it stood removes nothing.
    expect(await store.remove(id, REPORT_SERVER, REPORT_NOW)).toBeUndefined();
    expect(await store.byId(id)).toEqual({ ...magikarpLineup(), id });
    expect(await store.remove(id, REPORT_SERVER, REPORT_NOW + 60_000)).toEqual({
      ...magikarpLineup(),
      id,
    });
    expect(await store.byId(id)).toBeUndefined();
  });

  it('changes a report of yesterday that still stands into today’s, in place (plan 8R-4L)', async () => {
    const store = await made();
    const yesterday = await store.save(
      rocketReport({ periodKey: 'day:2026-10-20', endsAt: REPORT_NOW + 60_000 }),
    );
    // Today's grunt at the stop, ended already: it goes, as a replacement takes it.
    const ended = await store.save(rocketReport({ subjectKey: 'grunt:fire', endsAt: REPORT_NOW }));
    const refined = await store.saveUnless(magikarpLineup(), () => 'update', REPORT_NOW);
    const expected = { ...magikarpLineup(), id: yesterday.report.id };
    expect(refined).toEqual({
      saved: true,
      inPlace: true,
      report: expected,
      replaced: yesterday.report,
    });
    expect(await store.byId(ended.report.id)).toBeUndefined();
    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([expected]);
  });

  it('decides against what still stands at the stop in another period, if asked (fix A2)', async () => {
    const store = await made();
    // A grunt of yesterday that stands past midnight, and an ended one of today at stop 2.
    const yesterday = await store.save(
      rocketReport({ periodKey: 'day:2026-10-20', endsAt: REPORT_NOW + 60_000 }),
    );
    const research = await store.save(researchReport({ periodKey: 'day:2026-10-20' }));
    const asked: unknown[] = [];
    const keep = await store.saveUnless(
      rocketReport({ subjectKey: 'grunt:fire' }),
      (standing) => {
        asked.push(standing);
        return 'keep';
      },
      REPORT_NOW,
    );
    expect(keep).toEqual({ saved: false, standing: yesterday.report });
    expect(asked).toEqual([yesterday.report]);
    const replaced = await store.saveUnless(
      rocketReport({ subjectKey: 'grunt:fire' }),
      () => 'replace',
      REPORT_NOW,
    );
    expect(replaced).toMatchObject({ saved: true, replaced: yesterday.report });
    // The other kind of report at the stop is left alone.
    expect((await store.standing(REPORT_SERVER, REPORT_NOW)).map((one) => one.id)).toEqual([
      research.report.id,
      replaced.saved ? replaced.report.id : 0,
    ]);
    // Without `standingAt` another period is no matter.
    const apart = await store.saveUnless(
      rocketReport({ periodKey: 'day:2026-10-22', subjectKey: 'decoy' }),
      () => 'keep',
    );
    expect(apart).toMatchObject({ saved: true, replaced: undefined });
  });

  it('keeps a typed task with its typed reward and no category', async () => {
    const store = await made();
    const text = 'Win 3 raids in the rain';
    const { report } = await store.save(
      researchReport({
        subjectKey: `typed:${taskKeyOf(text)}`,
        research: { text, category: null, rewards: [DRATINI], typed: true },
      }),
    );
    expect(await store.byId(report.id)).toMatchObject({
      research: { text, category: null, typed: true, rewards: [DRATINI] },
    });
  });

  it('keeps a research version, and what stands where the decision keeps it (plan 8R-5)', async () => {
    const store = await made();
    const task = taskKeyOf('Win 3 raids in the rain');
    // The longest subject: a typed task's version.
    const typed = `typed:${task}:0123abcd`;
    const { report: standing } = await store.save(researchReport({ subjectKey: typed }));
    const asked: string[] = [];
    const kept = await store.saveUnless(
      researchReport({ subjectKey: `${task}:89abcdef`, reporter: OTHER_REPORTER }),
      (there) => {
        asked.push(there.subjectKey);
        return 'keep';
      },
    );
    expect(asked).toEqual([typed]);
    expect(kept).toEqual({ saved: false, standing });
    const replaced = await store.saveUnless(
      researchReport({ subjectKey: `${task}:89abcdef`, reporter: OTHER_REPORTER }),
      () => 'replace',
    );
    expect(replaced).toMatchObject({ saved: true, replaced: standing });
    expect((await store.standing(REPORT_SERVER, REPORT_NOW)).map((one) => one.subjectKey)).toEqual([
      `${task}:89abcdef`,
    ]);
  });

  it('gives a member’s latest report of a server made since a time, ended or not (Matt, 2026-10-27)', async () => {
    const store = await made();
    expect(await store.latestBy(REPORT_SERVER, REPORTER.id, 0)).toBeUndefined();
    const { report: research } = await store.save(researchReport());
    // A grunt of Brock's at stop 2 a minute later, long ended at the time asked.
    const { report: grunt } = await store.save(
      rocketReport({
        stop: reportedStop(2),
        madeAt: REPORT_NOW + 60_000,
        endsAt: REPORT_NOW + 31 * 60_000,
      }),
    );
    // Misty's later report, and Brock's of another server, are not his here.
    await store.save(
      rocketReport({
        stop: reportedStop(3),
        reporter: OTHER_REPORTER,
        madeAt: REPORT_NOW + 120_000,
      }),
    );
    await store.save(
      researchReport({
        serverId: OTHER_SERVER,
        stop: reportedStop(4),
        madeAt: REPORT_NOW + 180_000,
      }),
    );
    expect(await store.latestBy(REPORT_SERVER, REPORTER.id, REPORT_NOW)).toEqual(grunt);
    expect(await store.latestBy(REPORT_SERVER, REPORTER.id, REPORT_NOW + 60_001)).toBeUndefined();
    // Of two made at once, the later id.
    const { report: again } = await store.save(
      researchReport({ stop: reportedStop(5), madeAt: REPORT_NOW + 60_000 }),
    );
    expect(await store.latestBy(REPORT_SERVER, REPORTER.id, REPORT_NOW)).toEqual(again);
    // Taken back, a report is no longer his latest.
    await store.remove(again.id, REPORT_SERVER);
    await store.remove(grunt.id, REPORT_SERVER);
    expect(await store.latestBy(REPORT_SERVER, REPORTER.id, REPORT_NOW)).toEqual(research);
  });
}
