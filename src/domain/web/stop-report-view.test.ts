import { describe, expect, it } from 'vitest';
import {
  DRATINI,
  MAGIKARP,
  magikarpLineup,
  MUDKIP,
  REPORT_NOW,
  REPORTER,
  reportedStop,
  researchReport,
  rocketReport,
} from '../../../test/support/stop-report-cases.js';
import { LEADER_PORTRAITS } from '../rocket/portraits.js';
import type { RocketCatch } from '../rocket/lineups.js';
import { ENCOUNTER_PICTURE } from '../stops/pictures.js';
import type { StopReport } from '../stops/report.js';
import { stopReportView, type StopReportViewInput } from './stop-report-view.js';

const CDN = 'https://cdn.leekduck.com';
const ASH = '200000000000000061';

/** The reports of a day: research of the day and of an event's window, grunts, a hideout. */
function reports(): StopReport[] {
  return [
    { ...researchReport(), id: 1 },
    // Of the day, waiting under the window that is on.
    { ...researchReport({ stop: reportedStop(2), periodKey: 'day:2026-10-21' }), id: 2 },
    {
      ...researchReport({
        stop: reportedStop(3, { lat: 40.1234567, lon: -79.7654321 }),
        periodKey: 'event:cd',
        subjectKey: 'typed:0000000000000001',
        research: {
          text: 'Catch 3 Pawniard',
          category: null,
          rewards: [
            { kind: 'item', item: 'rare-candy', name: 'Rare Candy', quantity: 0, image: null },
            {
              kind: 'energy',
              dex: 3,
              name: 'Venusaur Mega Energy',
              quantity: 20,
              image: 'https://elsewhere.test/energy.png',
            },
          ],
          typed: true,
        },
        reporter: { id: ASH, name: '' },
      }),
      id: 3,
    },
    { ...rocketReport({ stop: reportedStop(4) }), id: 4 },
    // A grunt whose half hour has passed (the store keeps it until the upkeep).
    { ...rocketReport({ stop: reportedStop(5), endsAt: REPORT_NOW - 1 }), id: 5 },
    {
      ...rocketReport({
        stop: reportedStop(6),
        subjectKey: 'leader:arlo',
        rocket: { name: 'Arlo', catches: [{ ...MUDKIP, key: null, dex: null }] },
        endsAt: REPORT_NOW + 10 * 3_600_000,
      }),
      id: 6,
    },
  ];
}

const input = (overrides: Partial<StopReportViewInput> = {}): StopReportViewInput => ({
  reports: reports(),
  period: {
    key: 'event:cd',
    start: 0,
    event: { id: 'cd', name: 'Pawniard Community Day' },
    waiting: { key: 'day:2026-10-21', at: REPORT_NOW + 3 * 3_600_000, from: 0 },
  },
  now: REPORT_NOW,
  zone: 'America/New_York',
  shown: () => true,
  memberId: ASH,
  staff: false,
  readOnly: false,
  link: (report) => `https://discord.com/channels/1/2/${String(report.id)}`,
  pictureOrigins: [CDN],
  // The water grunts have two lineups today (plan 8R-4L).
  search: { lineupsOf: (typeKey) => (typeKey === 'grunt:water' ? 2 : 1) },
  ...overrides,
});

describe('stopReportView', () => {
  it('shows the research of the period on, counts what waits, the grunts standing and the hideouts', () => {
    const view = stopReportView(input());
    expect(view.event).toBe('Pawniard Community Day');
    expect(view.zone).toBe('America/New_York');
    expect(view.research.map((one) => one.id)).toEqual([3]);
    expect(view.waiting).toEqual({ stops: 2, at: REPORT_NOW + 3 * 3_600_000 });
    expect(view.grunts.map((one) => one.id)).toEqual([4]);
    expect(view.hideouts.map((one) => one.id)).toEqual([6]);
  });

  it('gives each report its stop, words, rewards with the keys a filter needs, and its link', () => {
    const view = stopReportView(input());
    expect(view.research[0]).toEqual({
      id: 3,
      stop: {
        key: reportedStop(3).key,
        name: 'Yellow Mural 3',
        address: 'Market Street',
        lat: 40.123457,
        lon: -79.765432,
      },
      madeAt: researchReport().madeAt,
      endsAt: researchReport().endsAt,
      reporter: 'a member',
      mayTakeBack: true,
      link: 'https://discord.com/channels/1/2/3',
      task: 'typed:0000000000000001',
      text: 'Catch 3 Pawniard',
      category: null,
      typed: true,
      // A task's key alone with two rewards or more reads as "one of" (plan 8R-5, R10), which
      // Find marks as not confirmed (plan 8M-12).
      oneOf: true,
      unconfirmed: { kind: 'one-of', count: 2, encounters: false },
      words: ['catch', '3', 'pawniard', 'rare', 'candy', 'venusaur', 'mega', 'energy'],
      rewardText: 'one of Rare Candy, Venusaur Mega Energy ×20',
      rewards: [
        { kind: 'item', name: 'Rare Candy', value: 'item:rare-candy', quantity: 0, shiny: false },
        // A picture from no host the page may load is left out.
        {
          kind: 'energy',
          name: 'Venusaur Mega Energy',
          value: 'energy:3',
          quantity: 20,
          shiny: false,
        },
      ],
    });
    expect(view.grunts[0]).toMatchObject({
      who: 'grunt:water',
      name: 'Water-type grunt',
      reporter: REPORTER.name,
      mayTakeBack: false,
      catches: [
        { kind: 'encounter', name: 'Mudkip', value: 'pokemon:mudkip', quantity: 0, shiny: true },
      ],
    });
    expect(view.grunts[0]?.catches[0]?.image).toBe(MUDKIP.image);
    // A leader's picture is the portrait, as the post of the stops shows it (plan 8R-6).
    expect(view.hideouts[0]).toMatchObject({
      who: 'leader:arlo',
      name: 'Arlo',
      picture: LEADER_PORTRAITS.arlo,
      catches: [{ name: 'Mudkip', value: null }],
    });
  });

  it('gives a decoy its one catch’s picture, and the encounter picture where it has several (plan 8R-6)', () => {
    const decoy = (catches: RocketCatch[], id: number): StopReport => ({
      ...rocketReport({
        stop: reportedStop(id),
        subjectKey: 'decoy',
        rocket: { name: 'Decoy grunt', catches },
        endsAt: REPORT_NOW + 12 * 3_600_000,
      }),
      id,
    });
    const reports = [decoy([MUDKIP], 8), decoy([MUDKIP, MAGIKARP], 9)];
    const origins = [CDN, new URL(ENCOUNTER_PICTURE).origin];
    expect(
      stopReportView(input({ reports, pictureOrigins: origins })).hideouts.map(
        (one) => one.picture,
      ),
    ).toEqual([MUDKIP.image, ENCOUNTER_PICTURE]);
    // Only from a host the page may load.
    expect(stopReportView(input({ reports })).hideouts.map((one) => one.picture)).toEqual([
      MUDKIP.image,
      undefined,
    ]);
  });

  it('names a hideout’s picture as the post does: the square one Pine serves, none where it is gone (plan 8R-6)', () => {
    const leader = (key: string, id: number): StopReport => ({
      ...rocketReport({
        stop: reportedStop(id),
        subjectKey: key,
        rocket: { name: key, catches: [MUDKIP] },
        endsAt: REPORT_NOW + 12 * 3_600_000,
      }),
      id,
    });
    const pine = 'https://map.example.test';
    const view = stopReportView(
      input({
        reports: [leader('leader:arlo', 8), leader('leader:cliff', 9)],
        pictureOrigins: [CDN, pine],
        picture: (source) =>
          source === LEADER_PORTRAITS.cliff ? undefined : `${pine}/pictures/arlo.png`,
      }),
    );
    expect(view.hideouts.map((one) => one.picture)).toEqual([
      `${pine}/pictures/arlo.png`,
      undefined,
    ]);
    expect(view.hideouts[1]).not.toHaveProperty('picture');
  });

  it('names rewards’, catches’ and reports’ pictures as the post does: the square ones Pine serves (plan 8M-9B)', () => {
    const pine = 'https://map.example.test';
    const square = (source: string) => `${pine}/pictures/${source.slice(-12)}`;
    const oneOf = {
      ...researchReport({
        stop: reportedStop(7),
        subjectKey: 'dragon',
        research: {
          text: 'Catch a Dragon-type Pokémon',
          category: 'Catching',
          rewards: [
            DRATINI,
            {
              kind: 'encounter',
              name: 'Bagon',
              key: 'bagon',
              dex: 371,
              shiny: false,
              cp: null,
              image: null,
            },
          ],
          typed: false,
        },
      }),
      id: 7,
    };
    const typed = {
      ...researchReport({
        stop: reportedStop(8),
        subjectKey: 'typed:0000000000000002',
        research: { text: 'Spin 3 stops', category: null, rewards: [], typed: true },
      }),
      id: 8,
    };
    const twoCatches = {
      ...rocketReport({
        stop: reportedStop(9),
        rocket: { name: 'Water-type grunt', catches: [MUDKIP, MAGIKARP] },
      }),
      id: 9,
    };
    const view = stopReportView(
      input({
        reports: [
          { ...researchReport(), id: 1 },
          oneOf,
          typed,
          { ...rocketReport(), id: 4 },
          twoCatches,
        ],
        period: { key: 'day:2026-10-21', start: 0 },
        pictureOrigins: [CDN, pine],
        // Mudkip's picture is gone (it answered 404): none.
        picture: (source) => (source === MUDKIP.image ? undefined : square(source)),
      }),
    );
    const [one, dragon, spin] = view.research;
    expect(one?.rewards[0]?.image).toBe(square(DRATINI.image!));
    // A reward line's picture by the post's rule: the one reward's; "one of" the encounter picture.
    expect(one?.picture).toBe(square(DRATINI.image!));
    expect(dragon?.picture).toBe(square(ENCOUNTER_PICTURE));
    expect(dragon?.rewards.map((reward) => reward.image)).toEqual([
      square(DRATINI.image!),
      undefined,
    ]);
    // A typed task without its reward has none.
    expect(spin).not.toHaveProperty('picture');
    // A grunt's: its one catch's (gone here: none), else the encounter picture.
    const [water, two] = view.grunts;
    expect(water).not.toHaveProperty('picture');
    expect(water?.catches[0]).not.toHaveProperty('image');
    expect(two?.picture).toBe(square(ENCOUNTER_PICTURE));
    expect(two?.catches.map((caught) => caught.image)).toEqual([
      undefined,
      square(MAGIKARP.image!),
    ]);
  });

  it('names a grunt of one lineup by its first slot, the gender never (plan 8R-4L)', () => {
    const view = stopReportView(
      input({ reports: [{ ...magikarpLineup({ stop: reportedStop(4) }), id: 7 }] }),
    );
    expect(view.grunts).toMatchObject([
      {
        who: 'grunt:water:male',
        name: 'Water-type grunt',
        lineup: 'Magikarp, Feebas',
        // With its id the version a take-back names (review L1).
        madeAt: magikarpLineup().madeAt,
      },
    ]);
    expect(stopReportView(input()).grunts[0]).not.toHaveProperty('lineup');
  });

  it('gives what the page shows and filters by, as the server words and reads them (plan 8M-9B)', () => {
    const view = stopReportView(
      input({
        reports: [
          { ...magikarpLineup({ stop: reportedStop(4) }), id: 7 },
          { ...rocketReport({ stop: reportedStop(5) }), id: 8 },
        ],
      }),
    );
    // A grunt's type, which a filter by grunt type matches (the lineup's too).
    expect(view.grunts.map((grunt) => grunt.typeKey)).toEqual(['grunt:water', 'grunt:water']);
    // The rewards in short, as a reward line of the post says them.
    const day = stopReportView(input({ period: { key: 'day:2026-10-21', start: 0 } }));
    expect(day.research.map((one) => one.rewardText)).toEqual(['Dratini', 'Dratini']);
    expect(view.research).toEqual([]);
    const typed = stopReportView(input()).research[0];
    expect(typed?.rewardText).toBe('one of Rare Candy, Venusaur Mega Energy ×20');
  });

  it('gives an encounter its catalogue key, and the day’s research when no window is on', () => {
    const view = stopReportView(input({ period: { key: 'day:2026-10-21', start: 0 } }));
    expect(view.event).toBeNull();
    expect(view.waiting).toBeNull();
    expect(view.research.map((one) => one.id)).toEqual([1, 2]);
    expect(view.research[0]?.rewards).toEqual([
      {
        kind: 'encounter',
        name: 'Dratini',
        value: 'pokemon:dratini',
        quantity: 0,
        shiny: true,
        image: DRATINI.image,
      },
    ]);
  });

  it('leaves out what the member may not see, and their links', () => {
    const view = stopReportView(
      input({
        shown: (report) => report.id !== 4,
        link: (report) => (report.id === 6 ? undefined : 'https://discord.com/channels/1/2/3'),
      }),
    );
    expect(view.grunts).toEqual([]);
    expect(view.hideouts[0]?.link).toBeUndefined();
    expect(stopReportView(input({ shown: () => false })).waiting).toBeNull();
  });

  it('gives each report its search words and whether it is confirmed, as the domain reads them (plan 8M-12)', () => {
    const view = stopReportView(
      input({
        period: { key: 'day:2026-10-21', start: 0 },
        reports: [
          ...reports(),
          { ...magikarpLineup({ stop: reportedStop(7) }), id: 7 },
          {
            ...researchReport({
              stop: reportedStop(8),
              research: { ...researchReport().research, rewards: [DRATINI, DRATINI] },
            }),
            id: 8,
          },
        ],
      }),
    );
    const research = new Map(view.research.map((one) => [one.id, one]));
    expect(research.get(1)?.words).toEqual(
      expect.arrayContaining(['make', 'excellent', 'throws', 'dratini']),
    );
    expect(research.get(1)).not.toHaveProperty('unconfirmed');
    expect(research.get(8)?.unconfirmed).toEqual({ kind: 'one-of', count: 2, encounters: true });
    // "Not sure which" of the water grunts' two lineups, then one lineup told.
    const grunts = new Map(view.grunts.map((one) => [one.id, one]));
    expect(grunts.get(4)?.unconfirmed).toEqual({ kind: 'not-sure-which', count: 2 });
    expect(grunts.get(4)?.words).toEqual(expect.arrayContaining(['water', 'grunt', 'mudkip']));
    expect(grunts.get(7)).not.toHaveProperty('unconfirmed');
    expect(view.hideouts[0]?.words).toEqual(expect.arrayContaining(['arlo', 'leader']));
    expect(view.hideouts[0]).not.toHaveProperty('unconfirmed');
    // The research waiting under an event's window is not in the view, so nothing finds it.
    const windowed = stopReportView(input());
    expect(windowed.research.map((one) => one.id)).toEqual([3]);
  });

  it('lets staff take back any report, and nobody while read-only', () => {
    const staff = stopReportView(input({ staff: true, memberId: '200000000000000099' }));
    expect(staff.grunts[0]?.mayTakeBack).toBe(true);
    const readOnly = stopReportView(input({ staff: true, readOnly: true }));
    expect(readOnly.research[0]?.mayTakeBack).toBe(false);
    expect(readOnly.grunts[0]?.mayTakeBack).toBe(false);
  });

  it('says whether it is read-only, by which the page keeps polling at its 20 seconds', () => {
    expect(stopReportView(input({ readOnly: true })).readOnly).toBe(true);
    expect(stopReportView(input()).readOnly).toBe(false);
  });
});
