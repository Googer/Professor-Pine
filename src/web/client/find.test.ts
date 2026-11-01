import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIND_MAX_TEXT, type FoundPlace } from '../../domain/web/find-data.js';
import type {
  MapAttendance,
  MapMax,
  MapMeetup,
  MapRaid,
  MapTrain,
  PartiesView,
} from '../../domain/web/party-data.js';
import {
  FIND_PAUSE_MS,
  FindSearch,
  FINDING_PLACES,
  findsAll,
  firstFound,
  foundGroups,
  nothingFound,
  PLACES_FAILED,
  typedWords,
  type FindData,
  type FindState,
} from './find.js';
import type { MapGym } from './popup.js';
import {
  CASE_NOW,
  CASE_ZONE,
  caseGrunt,
  caseHideout,
  caseResearch,
  caseView,
} from './stop-report-cases.js';

const MINUTE = 60_000;

const attendance: MapAttendance = {
  groups: [],
  going: 2,
  mine: null,
  actions: [],
  remote: { offered: false, on: false },
  count: false,
};

const gym = (id: number, name: string, lat: number): MapGym => ({
  id,
  name,
  nickname: null,
  lat,
  lon: -79.95,
  regionIds: [1],
  address: null,
  description: null,
  notice: null,
});

/** The gyms of the map, north of the stops of the cases. */
const GYMS = new Map([
  [1, gym(1, 'Schenley Fountain', 40.45)],
  [2, gym(2, 'Carnegie Library', 40.46)],
]);

const raid = (id: string, gymId: number, boss: string): MapRaid => ({
  kind: 'raid',
  postKey: null,
  id,
  gymId,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: `Level 5 raid against ${boss}`,
  boss,
  stage: 'hatched',
  hatchTime: CASE_NOW - 20 * MINUTE,
  endTime: CASE_NOW + 30 * MINUTE,
  link: 'https://discord.com/channels/1/2',
  place: null,
  mayChange: false,
  attendance,
});

const train = (id: string, name: string, route: string[]): MapTrain => ({
  kind: 'train',
  postKey: null,
  id,
  name,
  trainKind: 'raid',
  trainKindWords: 'Raid Train',
  endTime: null,
  startTime: CASE_NOW + 60 * MINUTE,
  route,
  spots: [{ key: 'wabc', name: 'Lake Gazebo', lat: 40.47, lon: -79.95 }],
  stop: 0,
  atEnd: 'finish',
  stopsAhead: route.slice(1).map((_key, index) => index + 1),
  ahead: null,
  link: 'https://discord.com/channels/1/3',
  attendance,
  may: { arrange: false, clear: false, load: false },
  moves: null,
  conductor: { who: null, mayTake: false, mayDrop: false },
  moveRefusal: null,
  mayManage: false,
});

const meetup = (id: string, name: string, words: string): MapMeetup => ({
  kind: 'meetup',
  postKey: null,
  id,
  name,
  startTime: CASE_NOW + 60 * MINUTE,
  endTime: null,
  link: 'https://discord.com/channels/1/4',
  attendance,
  place: { kind: 'pin', words, lat: 40.43, lon: -79.95, gymId: null, at: null },
  info: null,
  panel: null,
});

const max = (id: string, boss: string): MapMax => ({
  kind: 'max',
  id,
  spotId: 'spot-1',
  picture: null,
  level: 'D2',
  tier: 'Dynamax 2★',
  boss,
  title: `Dynamax ${boss} (2★)`,
  endTime: CASE_NOW + 40 * MINUTE,
  link: 'https://discord.com/channels/1/9',
  place: { name: 'Lake Gazebo', lat: 40.47, lon: -79.95, address: null },
  attendance,
  postKey: null,
});

const parties = (more: Partial<PartiesView> = {}): PartiesView => ({
  zone: CASE_ZONE,
  readOnly: false,
  raids: [],
  maxes: [],
  trains: [],
  meetups: [],
  ...more,
});

/** Stop 1 is the southernmost of the cases (40.441); the origin a little south of it. */
const ORIGIN = { lat: 40.44, lon: -79.95 };

const data = (more: Partial<FindData> = {}): FindData => ({
  parties: parties(),
  gyms: GYMS,
  reports: caseView(),
  now: CASE_NOW,
  origin: ORIGIN,
  ...more,
});

const state = (text: string, places: FindState['places'] = []): FindState => ({
  text,
  words: typedWords(text) ?? [],
  places,
});

describe("Find's words (plan 8M-12)", () => {
  it('searches from two letters, case and accents ignored', () => {
    expect(typedWords('c')).toBeUndefined();
    expect(typedWords('  ')).toBeUndefined();
    expect(typedWords('Pokémon GO')).toEqual(['pokemon', 'go']);
    expect(typedWords('é1')).toEqual(['e1']);
  });

  it('matches every word typed, as typed or as the start of a word', () => {
    const words = ['make', '5', 'great', 'curveball', 'throws', 'spinda'];
    expect(findsAll(['curve'], words)).toBe(true);
    expect(findsAll(['great', 'spin'], words)).toBe(true);
    expect(findsAll(['ball'], words)).toBe(false);
    expect(findsAll(['spinda', 'skiddo'], words)).toBe(false);
  });
});

describe("Find's groups (plan 8M-12)", () => {
  it('finds reports by the words the server gave, confirmed first, each part by distance', () => {
    const near = caseResearch(1);
    const far = caseResearch(5);
    const unsure = caseResearch(2, {
      oneOf: true,
      rewardText: 'one of Dratini, Bagon',
      unconfirmed: { kind: 'one-of', count: 2, encounters: true },
    });
    const groups = foundGroups(
      state('dragon'),
      data({ reports: caseView({ research: [far, unsure, near] }) }),
    );
    expect(groups.map((group) => group.heading)).toEqual(['Reports at stops · 3']);
    const lines = groups[0]?.lines ?? [];
    expect(lines.map((line) => line.key)).toEqual(['research:1', 'research:5', 'research:2']);
    // The stop's name, then what matched; the mark of what is not confirmed.
    expect(lines[0]).toMatchObject({
      name: 'Yellow Mural 1',
      place: 'Catch a Dragon-type Pokémon · Dratini',
      marker: 'stop:stop-1',
    });
    expect(lines[0]).not.toHaveProperty('mark');
    expect(lines[2]?.mark).toBe('not confirmed: one of 2 encounters');
  });

  it('finds Team GO Rocket by type, lineup, leader; a grunt "not sure which" marked', () => {
    const reports = caseView({
      grunts: [
        caseGrunt(1),
        caseGrunt(2, {
          who: 'grunt:water',
          lineup: undefined,
          words: ['water', 'type', 'grunt', 'magikarp', 'mudkip', 'rocket'],
          unconfirmed: { kind: 'not-sure-which', count: 2 },
        }),
      ],
      hideouts: [caseHideout(3)],
    });
    const water = foundGroups(state('water'), data({ reports }))[0]?.lines ?? [];
    expect(water.map((line) => [line.place, line.mark])).toEqual([
      ['Water-type grunt · Magikarp, Feebas', undefined],
      ['Water-type grunt', 'not confirmed: one of 2 lineups'],
    ]);
    const arlo = foundGroups(state('arlo'), data({ reports }))[0]?.lines ?? [];
    expect(arlo.map((line) => [line.key, line.place])).toEqual([['hideout:203', 'Arlo']]);
    expect(foundGroups(state('rocket'), data({ reports }))[0]?.lines).toHaveLength(3);
  });

  it('leaves out a report that has ended, and ignores the layers and filters', () => {
    const ended = caseGrunt(1, { endsAt: CASE_NOW - 1 });
    expect(foundGroups(state('water'), data({ reports: caseView({ grunts: [ended] }) }))).toEqual(
      [],
    );
  });

  it('finds the parties going on: raids by boss, trains by stops, meetups by place', () => {
    const groups = foundGroups(
      state('lake'),
      data({
        parties: parties({
          raids: [raid('r1', 1, 'Mewtwo')],
          maxes: [max('x1', 'Machamp')],
          trains: [train('t1', 'Oakland loop', ['2', 'wabc'])],
          meetups: [meetup('m1', 'Picnic', 'Near Lake Gazebo')],
        }),
      }),
    );
    expect(groups.map((group) => group.kind)).toEqual(['going']);
    // By distance: the meetup's pin, then the train at Carnegie Library, then the battle. A train
    // is named first, its stop under it (review F5).
    expect(groups[0]?.lines.map((line) => [line.key, line.name, line.place])).toEqual([
      ['meetup:m1', 'Near Lake Gazebo', 'Picnic'],
      ['train:t1', 'Oakland loop', 'At stop 1 of 2: Carnegie Library'],
    ]);
    // A party without a place keeps its name alone, never twice (review F5).
    const placeless = foundGroups(
      state('picnic'),
      data({ parties: parties({ meetups: [{ ...meetup('m2', 'Picnic', ''), place: null }] }) }),
    );
    expect(placeless[0]?.lines.map((line) => [line.name, line.place])).toEqual([['Picnic', null]]);
    const mewtwo = foundGroups(
      state('mewt'),
      data({
        parties: parties({ raids: [raid('r1', 1, 'Mewtwo')], maxes: [max('x1', 'Mewtwo')] }),
      }),
    );
    expect(mewtwo[0]?.lines.map((line) => [line.name, line.place])).toEqual([
      ['Schenley Fountain', 'Level 5 raid against Mewtwo'],
      ['Lake Gazebo', 'Dynamax Mewtwo (2★)'],
    ]);
  });

  it("shows the server's places in its order, and says while they are asked for", () => {
    const places: FoundPlace[] = [
      { kind: 'stop', id: 'abc.16', name: 'Dragon Mural', lat: 40.5, lon: -79.95, guess: false },
      { kind: 'gym', id: '2', name: 'Dragon Gate', lat: 40.6, lon: -79.95, guess: false },
      {
        kind: 'powerspot',
        id: 'def.16',
        name: 'Dragon Spot',
        lat: 40.4,
        lon: -79.95,
        guess: false,
      },
    ];
    const found = foundGroups(state('dragon', places), data());
    expect(found.map((group) => group.heading)).toEqual(['Places · 3']);
    expect(found[0]?.lines.map((line) => [line.kind, line.name, line.place])).toEqual([
      ['stops', 'Dragon Mural', 'PokéStop'],
      ['gyms', 'Dragon Gate', 'Gym'],
      ['spots', 'Dragon Spot', 'Power Spot'],
    ]);
    expect(foundGroups(state('dragon', 'waiting'), data())).toEqual([
      { kind: 'places', heading: 'Places', lines: [], note: FINDING_PLACES },
    ]);
    expect(foundGroups(state('dragon', 'failed'), data())[0]?.note).toBe(PLACES_FAILED);
  });

  // Plan 8M-13 (O1, Matt's A): a place found only by a misspelling is shown only when Find found
  // nothing else for the text.
  describe('places found only by a misspelling', () => {
    const HOCKEY: FoundPlace = {
      kind: 'stop',
      id: 'h.16',
      name: 'Hockey Rink',
      lat: 40.5,
      lon: -79.95,
      guess: true,
    };
    const POCKET: FoundPlace = {
      kind: 'gym',
      id: '7',
      name: 'Pocket Park',
      lat: 40.5,
      lon: -79.96,
      guess: true,
    };
    const ROCKET_ST: FoundPlace = {
      kind: 'stop',
      id: 'r.16',
      name: 'Rocket Street Mural',
      lat: 40.5,
      lon: -79.97,
      guess: false,
    };

    it('are left out where reports or parties were found', () => {
      const rocket = foundGroups(
        state('rocket', [HOCKEY, POCKET]),
        data({ reports: caseView({ grunts: [caseGrunt(1)] }) }),
      );
      expect(rocket.map((group) => group.kind)).toEqual(['reports']);
      const gible = foundGroups(
        state('gible', [HOCKEY]),
        data({ parties: parties({ raids: [raid('r1', 1, 'Gible')] }) }),
      );
      expect(gible.map((group) => group.kind)).toEqual(['going']);
    });

    it('are left out where a place was found by its words, the count what is shown', () => {
      const places = foundGroups(state('rocket', [ROCKET_ST, HOCKEY, POCKET]), data());
      expect(places.map((group) => group.heading)).toEqual(['Places · 1']);
      expect(places[0]?.lines.map((line) => line.name)).toEqual(['Rocket Street Mural']);
    });

    it('are shown where Find found nothing else for the text', () => {
      const places = foundGroups(state('ansus hall', [HOCKEY, POCKET]), data());
      expect(places.map((group) => group.heading)).toEqual(['Places · 2']);
    });
  });

  it('puts the groups in order, empty ones left out, and Enter takes the first line', () => {
    const groups = foundGroups(
      state('dragon', [
        { kind: 'gym', id: '2', name: 'Dragon Gate', lat: 40.6, lon: -79.95, guess: false },
      ]),
      data({
        reports: caseView({ research: [caseResearch(1)] }),
        parties: parties({ raids: [raid('r1', 1, 'Dragonite')] }),
      }),
    );
    expect(groups.map((group) => group.kind)).toEqual(['reports', 'going', 'places']);
    expect(firstFound(groups)?.key).toBe('research:1');
    expect(foundGroups(state('zz'), data())).toEqual([]);
    expect(firstFound([])).toBeUndefined();
    expect(nothingFound(' zz ')).toBe('Nothing found for ‘zz’.');
  });
});

describe("Find's timing (plan 8M-12)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A search whose server answers each text when the test says. */
  function search() {
    const asked: string[] = [];
    const answers = new Map<string, (places: FoundPlace[]) => void>();
    const fail = new Map<string, () => void>();
    const shown: Array<FindState | undefined> = [];
    const whys: string[] = [];
    const picked: FindState[] = [];
    const find = new FindSearch({
      places: (text) =>
        new Promise((resolve, reject) => {
          asked.push(text);
          answers.set(text, resolve);
          fail.set(text, () => {
            reject(new Error('503'));
          });
        }),
      changed: (now, why) => {
        shown.push(now);
        whys.push(why);
      },
      pick: (now) => {
        picked.push(now);
      },
    });
    return { find, asked, answers, fail, shown, whys, picked };
  }

  const DRAGON: FoundPlace = {
    kind: 'gym',
    id: '2',
    name: 'Dragon Gate',
    lat: 40.6,
    lon: -79.95,
    guess: false,
  };

  it('asks the server once, a pause after the last keystroke', async () => {
    const made = search();
    for (const text of ['d', 'dr', 'dra', 'drag']) made.find.typed(text);
    expect(made.asked).toEqual([]);
    expect(made.shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS - 1);
    expect(made.asked).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(made.asked).toEqual(['drag']);
    expect(made.shown).toEqual([{ text: 'drag', words: ['drag'], places: 'waiting' }]);
    made.answers.get('drag')?.([DRAGON]);
    await vi.advanceTimersByTimeAsync(0);
    expect(made.find.state).toEqual({ text: 'drag', words: ['drag'], places: [DRAGON] });
  });

  it('drops an answer for a text no longer in the box', async () => {
    const made = search();
    made.find.typed('dra');
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    made.find.typed('drat');
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    made.answers.get('dra')?.([DRAGON]);
    await vi.advanceTimersByTimeAsync(0);
    expect(made.find.state).toEqual({ text: 'drat', words: ['drat'], places: 'waiting' });
    made.fail.get('drat')?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(made.find.state?.places).toBe('failed');
  });

  it('gives the list back at once below two letters, and asks nothing', async () => {
    const made = search();
    made.find.typed('dra');
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    made.find.typed('d');
    expect(made.find.state).toBeUndefined();
    expect(made.shown.at(-1)).toBeUndefined();
    made.find.typed('');
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    expect(made.asked).toEqual(['dra']);
  });

  it('searches at once on Enter, and picks the first place once it comes', async () => {
    const made = search();
    made.find.typed('drag');
    expect(made.find.now()).toBe(true);
    expect(made.asked).toEqual(['drag']);
    made.find.pickWhenFound();
    made.answers.get('drag')?.([DRAGON]);
    await vi.advanceTimersByTimeAsync(0);
    expect(made.picked.map((one) => one.places)).toEqual([[DRAGON]]);
    // Nothing is searched twice for the pause that was cut short.
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    expect(made.asked).toEqual(['drag']);
    made.find.typed('d');
    expect(made.find.now()).toBe(false);
  });

  // Review F1: the list's sheet opens when a search begins, never when its places come.
  it('says why it changed: a search begun, its places come, or the search ended', async () => {
    const made = search();
    made.find.typed('drag');
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    made.answers.get('drag')?.([DRAGON]);
    await vi.advanceTimersByTimeAsync(0);
    made.find.typed('d');
    expect(made.whys).toEqual(['began', 'settled', 'ended']);
  });

  // Review F4: a failed places search is asked again by Enter, the text unchanged.
  it('asks again on Enter when the places failed, as the same search', async () => {
    const made = search();
    made.find.typed('drag');
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    made.fail.get('drag')?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(made.find.state?.places).toBe('failed');
    expect(made.find.now()).toBe(true);
    expect(made.asked).toEqual(['drag', 'drag']);
    expect(made.find.state?.places).toBe('waiting');
    expect(made.whys).toEqual(['began', 'settled', 'settled']);
    made.answers.get('drag')?.([DRAGON]);
    await vi.advanceTimersByTimeAsync(0);
    expect(made.find.state?.places).toEqual([DRAGON]);
    // Places that came are not asked for again.
    expect(made.find.now()).toBe(true);
    expect(made.asked).toEqual(['drag', 'drag']);
  });

  // Branch review BR-4: the page never sends what the route refuses.
  it('asks for the places of the first 100 characters at most', async () => {
    const made = search();
    made.find.typed(`dragon ${'x'.repeat(150)}`);
    await vi.advanceTimersByTimeAsync(FIND_PAUSE_MS);
    expect(made.asked.map((text) => text.length)).toEqual([FIND_MAX_TEXT]);
  });
});
