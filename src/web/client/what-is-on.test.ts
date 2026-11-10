import { describe, expect, it } from 'vitest';
import type {
  MapAttendance,
  MapMax,
  MapMeetup,
  MapRaid,
  MapTrain,
  PartiesView,
} from '../../domain/web/party-data.js';
import type { MapGym } from './popup.js';
import {
  fixRedraws,
  ListRefresh,
  listGroups,
  listLines,
  lineWords,
  paneShows,
  readSort,
  SORT_KEY,
  stopReportLines,
  waitingNote,
  writeSort,
  type ListLine,
} from './what-is-on.js';
import type { ViewStorage } from './view.js';
import {
  CASE_NOW,
  CASE_ZONE,
  caseGrunt,
  caseHideout,
  caseResearch,
  caseView,
} from './stop-report-cases.js';
import { reportsAtStops } from './stop-reports.js';

const ZONE = 'America/New_York';
/** Tuesday 13 October 2026, 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const MINUTE = 60_000;

const attendance = (coming: number, present = 0): MapAttendance => ({
  groups: [{ id: 'A', interested: 1, coming, present }],
  // As the server counts it (`goingCount`); the list reads it, never sums of its own.
  going: coming + present,
  mine: null,
  actions: [],
  remote: { offered: false, on: false },
  count: false,
});

const gym = (id: number, name: string, lat: number, lon: number): MapGym => ({
  id,
  name,
  nickname: null,
  lat,
  lon,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});

/** Gyms of the map: the fountain at the map's middle, the library 0.3 miles north. */
const GYMS = new Map([
  [1, gym(1, 'Schenley Fountain', 40.44, -79.95)],
  [2, gym(2, 'Carnegie Library', 40.444, -79.95)],
  [3, gym(3, 'Hillman Library', 40.442, -79.95)],
]);
const CENTER = { lat: 40.44, lon: -79.95 };

const raid = (id: string, gymId: number | null, more: Partial<MapRaid> = {}): MapRaid => ({
  kind: 'raid',
  postKey: null,
  id,
  gymId,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid against Mewtwo',
  boss: 'Mewtwo',
  stage: 'hatched',
  hatchTime: NOW - 20 * MINUTE,
  endTime: NOW + 30 * MINUTE,
  link: 'https://discord.com/channels/1/2',
  place: null,
  mayChange: false,
  attendance: attendance(2),
  ...more,
});

const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
  kind: 'train',
  postKey: null,
  id,
  name: 'Oakland loop',
  trainKind: 'raid',
  trainKindWords: 'Raid Train',
  endTime: null,
  startTime: NOW + 60 * MINUTE,
  route: ['3', '2'],
  spots: [],
  stop: 0,
  atEnd: 'finish',
  stopsAhead: [1],
  ahead: null,
  link: 'https://discord.com/channels/1/3',
  attendance: attendance(4, 1),
  may: { arrange: false, clear: false, load: false },
  moves: null,
  conductor: { who: null, mayTake: false, mayDrop: false },
  moveRefusal: null,
  mayManage: false,
  ...more,
});

const meetup = (id: string, more: Partial<MapMeetup> = {}): MapMeetup => ({
  kind: 'meetup',
  postKey: null,
  id,
  name: 'Community Day picnic',
  startTime: NOW + 26 * 60 * MINUTE,
  endTime: null,
  link: 'https://discord.com/channels/1/4',
  attendance: attendance(7),
  place: {
    kind: 'gym',
    words: 'At Schenley Fountain',
    lat: 40.44,
    lon: -79.95,
    gymId: 1,
    at: { key: 'gym:1', name: 'Schenley Fountain' },
  },
  info: null,
  panel: null,
  ...more,
});

const max = (id: string, more: Partial<MapMax> = {}): MapMax => ({
  kind: 'max',
  id,
  spotId: 'spot-1',
  picture: null,
  level: 'D2',
  tier: 'Dynamax 2★',
  boss: 'Machamp',
  title: 'Dynamax Machamp (2★)',
  endTime: NOW + 40 * MINUTE,
  link: 'https://discord.com/channels/1/9',
  place: { name: 'Lake Gazebo', lat: 40.441, lon: -79.95, address: null },
  attendance: attendance(2, 1),
  postKey: null,
  ...more,
});

const view = (more: Partial<PartiesView> = {}): PartiesView => ({
  zone: ZONE,
  readOnly: false,
  raids: [],
  maxes: [],
  trains: [],
  meetups: [],
  ...more,
});

const keys = (lines: readonly ListLine[]) => lines.map((line) => line.key);
const allOn = () => true;

describe('the list of what is on (plan 8M-7)', () => {
  it('holds every live thing, grouped by kind in order, each group headed with its count', () => {
    const lines = listLines(
      view({
        raids: [raid('r1', 1), raid('r2', 2)],
        trains: [train('t1')],
        meetups: [meetup('m1')],
      }),
      GYMS,
    );
    const groups = listGroups(lines, { on: allOn, sort: 'nearest', origin: CENTER });
    expect(groups.map((group) => group.heading)).toEqual([
      'Raids and max battles · 2',
      'Trains · 1',
      'Meetups · 1',
    ]);
    // A layer turned off takes its group out.
    const noTrains = listGroups(lines, {
      on: (kind) => kind !== 'trains',
      sort: 'nearest',
      origin: CENTER,
    });
    expect(noTrains.map((group) => group.kind)).toEqual(['raids', 'meetups']);
    expect(listGroups([], { on: allOn, sort: 'nearest', origin: CENTER })).toEqual([]);
  });

  it('sorts Nearest from your location, else the middle of the map, the unplaced last', () => {
    const lines = listLines(
      view({
        raids: [
          raid('far', 2),
          raid('nowhere', null),
          raid('near', 1),
          raid('middle', 3),
          // A raid at a gym the map does not show, by where its post says it is.
          raid('posted', 99, {
            place: { name: 'Hilltop Shrine', lat: 40.46, lon: -79.95, address: null },
          }),
        ],
      }),
      GYMS,
    );
    const [raids] = listGroups(lines, { on: allOn, sort: 'nearest', origin: CENTER });
    expect(keys(raids?.lines ?? [])).toEqual([
      'raid:near',
      'raid:middle',
      'raid:far',
      'raid:posted',
      'raid:nowhere',
    ]);
    // From the library: the library first.
    const [fromThere] = listGroups(lines, {
      on: allOn,
      sort: 'nearest',
      origin: { lat: 40.444, lon: -79.95 },
    });
    expect(keys(fromThere?.lines ?? []).slice(0, 2)).toEqual(['raid:far', 'raid:middle']);
  });

  it('sorts Soonest by the end of raids and the start of trains and meetups', () => {
    const lines = listLines(
      view({
        raids: [
          raid('late', 1, { endTime: NOW + 40 * MINUTE }),
          raid('soon', 2, { endTime: NOW + 5 * MINUTE }),
        ],
        trains: [
          train('t-later', { startTime: NOW + 90 * MINUTE }),
          train('t-unset', { startTime: null }),
          train('t-sooner', { startTime: NOW + 10 * MINUTE }),
        ],
      }),
      GYMS,
    );
    const [raids, trains] = listGroups(lines, { on: allOn, sort: 'soonest', origin: CENTER });
    expect(keys(raids?.lines ?? [])).toEqual(['raid:soon', 'raid:late']);
    expect(keys(trains?.lines ?? [])).toEqual(['train:t-sooner', 'train:t-later', 'train:t-unset']);
  });

  it('sorts Most going first, ties broken by name', () => {
    const lines = listLines(
      view({
        raids: [
          raid('few', 1, { attendance: attendance(1) }),
          raid('many', 2, { attendance: attendance(5, 2) }),
          raid('b', 3, { heading: 'Level 5 raid against Zapdos', attendance: attendance(3) }),
          raid('a', 1, { heading: 'Level 5 raid against Articuno', attendance: attendance(3) }),
        ],
      }),
      GYMS,
    );
    const [raids] = listGroups(lines, { on: allOn, sort: 'going', origin: CENTER });
    expect(keys(raids?.lines ?? [])).toEqual(['raid:many', 'raid:a', 'raid:b', 'raid:few']);
  });

  it('words each line: picture, name, place, distance, time, how many are going', () => {
    const lines = listLines(
      view({
        raids: [
          raid('r1', 2, { attendance: attendance(3, 1) }),
          raid('egg', 1, {
            stage: 'egg',
            boss: null,
            heading: 'Level 5 raid (egg)',
            hatchTime: NOW + 40 * MINUTE,
            endTime: NOW + 85 * MINUTE,
            attendance: attendance(0),
          }),
          raid('ending', 1, { endTime: NOW + 3 * MINUTE }),
        ],
        trains: [train('t1')],
        meetups: [meetup('m1'), meetup('m2', { place: null, name: 'Walk' })],
      }),
      GYMS,
    );
    const words = (key: string) => {
      const line = lines.find((one) => one.key === key);
      if (!line) throw new Error(key);
      return lineWords(line, CENTER, NOW, ZONE, 'imperial');
    };
    expect(words('raid:r1')).toEqual({
      // The post's own heading words (fix round 1).
      name: 'Level 5 raid against Mewtwo',
      place: 'Carnegie Library',
      distance: '0.3 mi',
      time: '30 min left',
      going: '4 going',
      dimmed: false,
    });
    expect(words('raid:egg')).toMatchObject({
      name: 'Level 5 raid (egg)',
      place: 'Schenley Fountain',
      distance: '0 ft',
      time: 'hatches 2:40 PM',
      going: '',
    });
    expect(words('raid:ending')).toMatchObject({ time: '3 min left', dimmed: true });
    expect(words('train:t1')).toMatchObject({
      name: 'Oakland loop',
      place: 'At stop 1 of 2: Hillman Library',
      distance: '0.1 mi',
      time: 'starts 3:00 PM',
      going: '5 going',
    });
    expect(words('meetup:m1')).toMatchObject({
      place: 'At Schenley Fountain',
      time: 'starts Wed, Oct 14, 4:00 PM',
      going: '7 going',
    });
    // In the units the settings name (task 7): one wording with Discord.
    const r1 = lines.find((one) => one.key === 'raid:r1');
    if (!r1) throw new Error('no line');
    expect(lineWords(r1, CENTER, NOW, ZONE, 'metric').distance).toBe('440 m');
    // A meetup without a place keeps its line, without a distance.
    expect(words('meetup:m2')).toMatchObject({ place: null, distance: null });
    // Plan 8M-11A (S5): where nobody said when, and once over, capitalized as the badge.
    const timed = (times: (typeof r1)['times']) =>
      lineWords({ ...r1, times }, CENTER, NOW, ZONE, 'imperial').time;
    expect(timed({ stage: 'egg', hatch: null })).toBe('Egg');
    expect(timed({ stage: 'hatched', hatch: null, end: null })).toBe('Hatched');
    expect(timed({ stage: 'hatched', hatch: null, end: NOW - 60_000 })).toBe('Ended');
  });

  // Plan 8M-9A (A2): max battles are lines of the raids' group, by their title and end.
  it('lists max battles with the raids, by their post title, sorted by their end', () => {
    const lines = listLines(
      view({
        raids: [raid('r1', 1, { endTime: NOW + 30 * MINUTE })],
        maxes: [
          max('x1', { endTime: NOW + 50 * MINUTE }),
          max('x2', {
            spotId: null,
            title: 'Gigantamax Machamp',
            level: 'G',
            endTime: NOW + 4 * MINUTE,
            place: { name: 'Unlisted power spot', lat: 40.444, lon: -79.95, address: null },
          }),
        ],
      }),
      GYMS,
    );
    const [raids] = listGroups(lines, { on: allOn, sort: 'soonest', origin: CENTER });
    expect(raids?.heading).toBe('Raids and max battles · 3');
    expect(keys(raids?.lines ?? [])).toEqual(['max:x2', 'raid:r1', 'max:x1']);
    const pin = lines.find((line) => line.key === 'max:x2');
    expect(pin).toMatchObject({ kind: 'raids', id: 'x2', marker: 'max:x2', going: 3 });
    if (!pin) throw new Error('no line');
    expect(lineWords(pin, CENTER, NOW, ZONE, 'imperial')).toEqual({
      name: 'Gigantamax Machamp',
      place: 'Unlisted power spot',
      distance: '0.3 mi',
      time: '4 min left',
      going: '3 going',
      dimmed: true,
    });
    // The raids' layer off takes them out with the raids.
    expect(
      listGroups(lines, { on: (kind) => kind !== 'raids', sort: 'soonest', origin: CENTER }),
    ).toEqual([]);
  });

  it('words a line of Find: a place without a time, a report with its mark (plan 8M-12)', () => {
    const place: ListLine = {
      key: 'place:gym:2',
      kind: 'gyms',
      id: '2',
      marker: null,
      name: 'Carnegie Library',
      place: 'Gym',
      point: { lat: 40.444, lon: -79.95 },
      picture: null,
      going: 0,
      soonest: null,
      times: {},
    };
    expect(lineWords(place, CENTER, NOW, ZONE, 'imperial')).toEqual({
      name: 'Carnegie Library',
      place: 'Gym',
      distance: '0.3 mi',
      time: '',
      going: '',
      dimmed: false,
    });
    const marked = { ...place, mark: 'not confirmed: one of 6 encounters' };
    expect(lineWords(marked, CENTER, NOW, ZONE, 'imperial').mark).toBe(
      'not confirmed: one of 6 encounters',
    );
  });

  it('shows a form in the side pane over the list, the list again once it closes', () => {
    expect(paneShows({ loggedIn: true, formOpen: false })).toBe('list');
    expect(paneShows({ loggedIn: true, formOpen: true })).toBe('form');
    expect(paneShows({ loggedIn: false, formOpen: false })).toBe('login');
  });

  it('keeps the sort per browser, Nearest by default and where nothing is kept', () => {
    const items = new Map<string, string>();
    const kept: ViewStorage = {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
      },
    };
    expect(readSort(kept)).toBe('nearest');
    writeSort(kept, 'going');
    expect(items.get(SORT_KEY)).toBe('going');
    expect(readSort(kept)).toBe('going');
    items.set(SORT_KEY, 'loudest');
    expect(readSort(kept)).toBe('nearest');
    const refusing: ViewStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readSort(refusing)).toBe('nearest');
    expect(() => {
      writeSort(refusing, 'soonest');
    }).not.toThrow();
  });
});

describe('the list kept current (plan 8M-7, fix round 1)', () => {
  it('is not drawn anew while a form holds, and once when it lets go', () => {
    let held = true;
    let drawn = 0;
    const refresh = new ListRefresh({
      held: () => held,
      draw: () => {
        drawn += 1;
      },
    });
    refresh.moved();
    refresh.layers();
    refresh.fixed({ lat: 40.5, lon: -79.9 }, 'nearest');
    // A form (a line's change form, its group menu, its focus) stays as it is.
    expect(drawn).toBe(0);
    held = false;
    refresh.released();
    expect(drawn).toBe(1);
    // Nothing waited: letting go again draws nothing.
    refresh.released();
    expect(drawn).toBe(1);
    refresh.moved();
    expect(drawn).toBe(2);
  });

  it('draws for a new fix of your location only past 25 m, and only sorted Nearest', () => {
    const here = { lat: 40.44, lon: -79.95 };
    expect(fixRedraws(undefined, here, 'nearest')).toBe(true);
    expect(fixRedraws(here, { lat: 40.4401, lon: -79.95 }, 'nearest')).toBe(false);
    expect(fixRedraws(here, { lat: 40.4404, lon: -79.95 }, 'nearest')).toBe(true);
    expect(fixRedraws(here, { lat: 40.45, lon: -79.95 }, 'soonest')).toBe(false);
    let drawn = 0;
    const refresh = new ListRefresh({
      held: () => false,
      draw: () => {
        drawn += 1;
      },
    });
    refresh.fixed(here, 'nearest');
    refresh.fixed({ lat: 40.4401, lon: -79.95 }, 'nearest');
    expect(drawn).toBe(1);
  });
});

describe('the reports at stops in the list (plan 8M-9B)', () => {
  /** The stops of the cases from the Library of stop 1 (40.441 N), stop 5 the farthest. */
  const at = reportsAtStops(
    caseView({
      research: [caseResearch(5), caseResearch(2, { text: 'Spin 3 PokéStops' })],
      grunts: [caseGrunt(3, { endsAt: CASE_NOW + 4 * MINUTE }), caseGrunt(1)],
      hideouts: [caseHideout(4)],
    }),
    { on: () => true, now: CASE_NOW },
  );
  const origin = { lat: 40.441, lon: -79.95 };

  it('follows the parties as "Field research" and "Team GO Rocket", before the spawns', () => {
    const lines = [...listLines(view({ raids: [raid('r1', 1)] }), GYMS), ...stopReportLines(at)];
    const groups = listGroups(lines, { on: allOn, sort: 'nearest', origin });
    expect(groups.map((group) => group.heading)).toEqual([
      'Raids and max battles · 1',
      'Field research · 2',
      'Team GO Rocket · 3',
    ]);
    // A layer off takes its group out.
    expect(
      listGroups(lines, { on: (kind) => kind !== 'rocket', sort: 'nearest', origin }).map(
        (group) => group.kind,
      ),
    ).toEqual(['raids', 'research']);
    // Each line opens its stop's popup.
    expect(groups[1]?.lines.map((line) => [line.key, line.marker, line.place])).toEqual([
      ['research:2', 'stop:stop-2', 'Yellow Mural 2'],
      ['research:5', 'stop:stop-5', 'Yellow Mural 5'],
    ]);
  });

  it('sorts Soonest by their end, and keeps them nearest first under Most going (B13)', () => {
    const lines = stopReportLines(at);
    const soonest = listGroups(lines, { on: allOn, sort: 'soonest', origin });
    expect(soonest[1]?.lines.map((line) => line.key)).toEqual([
      'grunt:103',
      'grunt:101',
      'hideout:204',
    ]);
    const going = listGroups(lines, { on: allOn, sort: 'going', origin });
    expect(going[1]?.lines.map((line) => line.key)).toEqual([
      'grunt:101',
      'grunt:103',
      'hideout:204',
    ]);
  });

  it('words research and hideouts until their end, a grunt by the minutes it has left', () => {
    const words = (key: string) => {
      const line = stopReportLines(at).find((one) => one.key === key);
      if (!line) throw new Error(key);
      return lineWords(line, origin, CASE_NOW, CASE_ZONE, 'imperial');
    };
    expect(words('research:5')).toMatchObject({
      name: 'Catch a Dragon-type Pokémon',
      place: 'Yellow Mural 5',
      // The day's end: midnight, not tomorrow's 12:00 AM.
      time: 'until midnight',
      going: '',
      dimmed: false,
    });
    expect(words('grunt:101')).toMatchObject({ name: 'Water-type grunt', time: '25 min left' });
    expect(words('grunt:103')).toMatchObject({ time: '4 min left', dimmed: true });
    expect(words('hideout:204')).toMatchObject({ name: 'Arlo', time: 'until 11:00 PM' });
    // Its picture: the research's, a grunt's, a hideout's.
    expect(stopReportLines(at).find((one) => one.key === 'hideout:204')?.picture).toBe(
      'https://map.example.test/pictures/arlo.png',
    );
  });

  it('says when the day’s research comes back under an event, as the post of the stops does (B5)', () => {
    expect(
      waitingNote(
        caseView({
          event: 'Pawniard Community Day',
          waiting: { stops: 3, at: CASE_NOW + 2 * 60 * MINUTE },
        }),
        CASE_NOW,
        CASE_ZONE,
      ),
    ).toBe('Back at 4:00 PM, after Pawniard Community Day: the day’s research at 3 stops.');
    expect(
      waitingNote(
        caseView({ waiting: { stops: 1, at: CASE_NOW + 60 * MINUTE } }),
        CASE_NOW,
        CASE_ZONE,
      ),
    ).toBe('Back at 3:00 PM: the day’s research at 1 stop.');
    expect(waitingNote(caseView(), CASE_NOW, CASE_ZONE)).toBeUndefined();
    // The group is headed with its note, even with no research shown yet.
    const groups = listGroups([], {
      on: allOn,
      sort: 'nearest',
      origin,
      notes: { research: 'Back at 3:00 PM: the day’s research at 1 stop.' },
    });
    expect(groups).toEqual([
      {
        kind: 'research',
        heading: 'Field research · 0',
        lines: [],
        note: 'Back at 3:00 PM: the day’s research at 1 stop.',
      },
    ]);
  });
});
