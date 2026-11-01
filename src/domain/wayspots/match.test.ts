import { describe, expect, it } from 'vitest';
import { testGyms } from '../../../test/support/gyms.js';
import { seededRandom } from '../../../test/support/random.js';
import { metresBetween } from '@pine/wayspot-core/distance';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { wayfarerCellAt } from '@pine/wayspot-core/s2';
import type { ExportedWayspot, WayspotKind } from '@pine/wayspot-core/export-file';
import {
  cellsAround,
  matchGyms,
  looseNameKey,
  MAX_PICTURE_ADDRESS,
  newGymName,
  pictureOf,
  tidiesName,
  withAnswers,
  type ImportGym,
  type ImportPlan,
} from './match.js';

const METRES_PER_DEGREE = (6_371_000 * Math.PI) / 180;

/** A point `north` and `east` metres from `from`. */
function at(from: LatLon, north: number, east = 0): LatLon {
  return {
    lat: from.lat + north / METRES_PER_DEGREE,
    lon: from.lon + east / (METRES_PER_DEGREE * Math.cos((from.lat * Math.PI) / 180)),
  };
}

const idOf = (n: number): string => `${n.toString(16).padStart(32, '0')}.16`;

function wayspot(
  n: number,
  title: string,
  place: LatLon,
  kind: WayspotKind = 'gym',
): ExportedWayspot {
  return {
    id: idOf(n),
    kind,
    status: 'ACTIVE',
    lat: place.lat,
    lon: place.lon,
    title,
    address: '',
    description: '',
    image: '',
  };
}

/** The invented gyms, none matched or marked yet. */
function gyms(): ImportGym[] {
  return testGyms().map(({ id, name, lat, lon }) => ({
    id,
    pogoId: null,
    name,
    lat,
    lon,
    notInWayfarer: false,
    imageUrl: null,
  }));
}

function gym(id: number, more: Partial<ImportGym> = {}): ImportGym {
  const found = gyms().find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no gym ${id}`);
  return { ...found, ...more };
}

/** Every cell a gym of the list lies in or near (`cellsAround`). */
const cellsOf = (list: readonly LatLon[]): Set<string> => new Set(list.flatMap(cellsAround));

function plan(
  list: readonly ImportGym[],
  wayspots: readonly ExportedWayspot[],
  covered: ReadonlySet<string> = cellsOf(list),
): ImportPlan {
  return matchGyms({ gyms: list, wayspots, covered, storedLength: (text) => text.length });
}

/** What became of each gym, in a word. */
function fates(result: ImportPlan): Map<number, string> {
  const fate = new Map<number, string>();
  const set = (id: number, what: string): void => {
    expect(fate.has(id), `gym ${id} is in two lists`).toBe(false);
    fate.set(id, what);
  };
  for (const match of result.matched) set(match.gymId, `matched-${match.by}`);
  for (const review of result.reviews) set(review.gymId, review.kind);
  for (const id of result.notInWayfarer) set(id, 'not-in-wayfarer');
  for (const { gymId } of result.notCovered) set(gymId, 'not-covered');
  return fate;
}

const LIBRARY = gym(1);
const FOUNTAIN = gym(2);

describe('looseNameKey', () => {
  it('drops the words the, a and an, punctuation, case and accents', () => {
    expect(looseNameKey('The Old Mill')).toBe('oldmill');
    expect(looseNameKey('Old Mill!')).toBe('oldmill');
    expect(looseNameKey('A Café, an Élan')).toBe('cafeelan');
    expect(looseNameKey("St. Mary's Church")).toBe('stmaryschurch');
  });

  it('drops them only as whole words', () => {
    expect(looseNameKey('Theater Annex')).toBe('theaterannex');
    expect(looseNameKey('The Ater')).toBe('ater');
  });

  it('is empty for a name of nothing else', () => {
    expect(looseNameKey('The')).toBe('');
    expect(looseNameKey('...')).toBe('');
  });
});

describe('matchGyms by id', () => {
  it('finds a gym by its stored id up to 100 metres away whatever its title, and moves it', () => {
    const far = wayspot(1, 'Pinewood Public Library', at(LIBRARY, 99));
    const result = plan([gym(1, { pogoId: far.id })], [far]);
    expect(result.matched).toEqual([
      expect.objectContaining({ gymId: 1, by: 'id', rename: null, move: true }),
    ]);
    expect(result.matched[0]!.metres).toBeCloseTo(99, 0);
    expect(result.unchangedSeen).toEqual([]);
  });

  it('counts a gym found by id with the same name and place as seen and unchanged', () => {
    const same = wayspot(1, 'Pinewood Public Library', at(LIBRARY, 2));
    const result = plan([gym(1, { pogoId: same.id })], [same]);
    expect(result.matched).toEqual([
      expect.objectContaining({
        gymId: 1,
        by: 'id',
        rename: null,
        titleProblem: null,
        move: false,
      }),
    ]);
    expect(result.unchangedSeen).toEqual([1]);
  });

  it('writes a name that only tidies spaces or capitals, as no change', () => {
    const tidy = wayspot(1, 'Pinewood Public Library', at(LIBRARY, 2));
    const result = plan([gym(1, { pogoId: tidy.id, name: ' pinewood  public library ' })], [tidy]);
    expect(result.matched).toEqual([
      expect.objectContaining({ rename: 'Pinewood Public Library', tidyOnly: true }),
    ]);
    // Not up to date: the tidy spelling is written.
    expect(result.unchangedSeen).toEqual([]);
    // Another name is a rename, wholly or in part.
    const renamed = plan([gym(1, { pogoId: tidy.id, name: 'Pinewood Library' })], [tidy]);
    expect(renamed.matched[0]).toMatchObject({ tidyOnly: false });
    expect(renamed.unchangedSeen).toEqual([]);
  });

  it('tells a name only tidied from another name', () => {
    expect(tidiesName('Monastery fountains', 'Monastery Fountains')).toBe(true);
    expect(tidiesName('Mural  of  Hope ', 'Mural of Hope')).toBe(true);
    expect(tidiesName('Mural of Hope', 'Mural of Hope')).toBe(false);
    expect(tidiesName('Mural of Hope', 'Murals of Hope')).toBe(false);
    expect(tidiesName("Hanna's Town Cabin", 'Klingensmith Cabin')).toBe(false);
    expect(tidiesName('St. Mary', 'St Mary')).toBe(false);
  });

  it('takes the id before any certain match of another gym', () => {
    const shared = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1));
    const holder = { ...gym(1, { pogoId: shared.id }), ...at(FOUNTAIN, 30) };
    const result = plan([holder, FOUNTAIN], [shared]);
    expect(fates(result)).toEqual(
      new Map([
        [1, 'matched-id'],
        [2, 'unknown'],
      ]),
    );
  });

  it('gives a Wayspot two gyms hold to the nearer, and asks about the other as sharing it', () => {
    const one = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1));
    // Gym 1 lies 60 m off, gym 2 a metre: the nearer is the Wayspot, whatever their ids.
    const far = { ...gym(1, { pogoId: one.id }), ...at(FOUNTAIN, 61) };
    const result = plan([far, gym(2, { pogoId: one.id })], [one]);
    expect(fates(result)).toEqual(
      new Map([
        [1, 'missing'],
        [2, 'matched-id'],
      ]),
    );
    expect(result.reviews).toEqual([
      {
        gymId: 1,
        kind: 'missing',
        candidates: [expect.objectContaining({ id: one.id, own: true, heldBy: 2 })],
      },
    ]);
  });

  it('gives a Wayspot two gyms hold as far to the lower id', () => {
    const one = wayspot(1, 'Old Stone Fountain', FOUNTAIN);
    const east = { ...gym(2, { pogoId: one.id }), ...at(FOUNTAIN, 0, 20) };
    const west = { ...gym(1, { pogoId: one.id }), ...at(FOUNTAIN, 0, -20) };
    expect(fates(plan([east, west], [one]))).toEqual(
      new Map([
        [1, 'matched-id'],
        [2, 'missing'],
      ]),
    );
  });

  it('asks which Wayfarer gym near is the gym that shares its Wayspot with a nearer one', () => {
    const one = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1));
    const mural = wayspot(2, 'Mural', at(FOUNTAIN, 70));
    const far = { ...gym(1, { pogoId: one.id }), ...at(FOUNTAIN, 61) };
    const result = plan([far, gym(2, { pogoId: one.id })], [one, mural]);
    expect(result.reviews).toEqual([
      {
        gymId: 1,
        kind: 'match',
        candidates: [
          expect.objectContaining({ id: mural.id }),
          expect.objectContaining({ id: one.id, own: true, heldBy: 2 }),
        ],
      },
    ]);
  });
});

describe('matchGyms certainly', () => {
  it('matches the same name within 20 metres and renames to the title as Wayfarer writes it', () => {
    const title = 'old stone fountain.';
    const result = plan([FOUNTAIN], [wayspot(1, title, at(FOUNTAIN, 19))]);
    expect(result.matched).toEqual([
      expect.objectContaining({ gymId: 2, by: 'name', rename: title, move: true }),
    ]);
  });

  it('does not rename when the tidied title is the name', () => {
    const result = plan([FOUNTAIN], [wayspot(1, '  Old  Stone Fountain ', at(FOUNTAIN, 1))]);
    expect(result.matched).toEqual([
      expect.objectContaining({ by: 'name', rename: null, titleProblem: null, move: false }),
    ]);
  });

  it('matches a name differing by "The" and punctuation within 50 metres, not beyond', () => {
    const near = plan([FOUNTAIN], [wayspot(1, 'The Old Stone-Fountain', at(FOUNTAIN, 49))]);
    expect(near.matched).toEqual([expect.objectContaining({ by: 'name', move: true })]);
    const far = plan([FOUNTAIN], [wayspot(1, 'The Old Stone-Fountain', at(FOUNTAIN, 51), 'stop')]);
    expect(far.matched).toEqual([]);
    expect(far.reviews).toEqual([
      expect.objectContaining({
        gymId: 2,
        kind: 'unknown',
        candidates: [expect.objectContaining({ id: idOf(1) })],
      }),
    ]);
  });

  it('offers a Wayfarer gym of the same name beyond 50 metres for the gym, never adds it', () => {
    const far = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 51));
    const result = plan([FOUNTAIN], [far]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      { gymId: 2, kind: 'match', candidates: [expect.objectContaining({ id: far.id })] },
    ]);
  });

  it('does not take the same name from 20 to 50 metres when only the letters agree', () => {
    // "Theater" and "The Ater" are one name by letters, two by words.
    const theater = { ...FOUNTAIN, name: 'Theater' };
    expect(plan([theater], [wayspot(1, 'The Ater', at(FOUNTAIN, 15))]).matched).toHaveLength(1);
    expect(plan([theater], [wayspot(1, 'The Ater', at(FOUNTAIN, 30))]).matched).toHaveLength(0);
  });

  it('matches any title within 5 metres as a rename, and moves the gym 4 metres', () => {
    const result = plan([FOUNTAIN], [wayspot(1, 'Town Square Water Feature', at(FOUNTAIN, 4))]);
    expect(result.matched).toEqual([
      expect.objectContaining({ by: 'place', rename: 'Town Square Water Feature', move: true }),
    ]);
  });

  it('does not move a gym 3 metres or less', () => {
    const result = plan([FOUNTAIN], [wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 2.9))]);
    expect(result.matched[0]!.move).toBe(false);
  });

  it('needs exactly one candidate: two queue the gym with both, nearest first', () => {
    const result = plan(
      [FOUNTAIN],
      [
        wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 15)),
        wayspot(2, 'Old Stone Fountain', at(FOUNTAIN, -10)),
      ],
    );
    expect(result.matched).toEqual([]);
    expect(result.reviews).toEqual([
      {
        gymId: 2,
        kind: 'match',
        candidates: [
          expect.objectContaining({ id: idOf(2), kind: 'gym', title: 'Old Stone Fountain' }),
          expect.objectContaining({ id: idOf(1) }),
        ],
      },
    ]);
    expect(result.reviews[0]!.candidates[0]!.metres).toBeCloseTo(10, 5);
    // Each could be the gym: neither is added as a gym of its own.
    expect(result.added).toEqual([]);
  });

  it('counts a namesake of any kind as a candidate', () => {
    const result = plan(
      [FOUNTAIN],
      [
        wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 15)),
        wayspot(2, 'Old Stone Fountain', at(FOUNTAIN, 3), 'stop'),
      ],
    );
    expect(result.matched).toEqual([]);
    expect(result.reviews[0]!.kind).toBe('match');
  });

  it('takes the Wayfarer gym of its name beside a stop of another title 3 metres off', () => {
    const result = plan(
      [FOUNTAIN],
      [
        wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 15)),
        wayspot(2, 'Bench', at(FOUNTAIN, 3), 'stop'),
      ],
    );
    expect(result.matched).toEqual([expect.objectContaining({ gymId: 2, by: 'name' })]);
  });

  it('matches a gym marked not in Wayfarer by its name, never by its place alone', () => {
    const sponsored = gym(5, { notInWayfarer: true });
    const result = plan([sponsored], [wayspot(1, 'Kiosk', at(sponsored, 2))]);
    expect(fates(result)).toEqual(new Map([[5, 'not-in-wayfarer']]));
    // Nobody may be that Wayspot then: it is a gym of its own.
    expect(result.added).toHaveLength(1);
  });

  it('lets the gym nearest to a Wayspot take it first', () => {
    // Gym 21 (lower id) could take the Wayspot only by its place, 4 metres off; gym 22 by its
    // name, 1 metre off. The nearer pair goes first, and gym 21 is left with nothing.
    const spot = at(FOUNTAIN, 1);
    const renamed = { ...FOUNTAIN, id: 21, name: 'Bandstand', ...at(spot, 0, 4) };
    const named = { ...FOUNTAIN, id: 22 };
    const result = plan([renamed, named], [wayspot(1, 'Old Stone Fountain', spot)]);
    expect(fates(result)).toEqual(
      new Map([
        [21, 'unknown'],
        [22, 'matched-name'],
      ]),
    );
  });

  it('takes every pick certain by name before any certain by place alone', () => {
    // Gym A has a statue 3 m off (by place) and its namesake X 15 m off (by name): it would take
    // X. Gym B would take X too, by place alone, 4 m off: a name goes first, so A takes X and B
    // does not; the statue is then offered to B, the gym left that may be it.
    const named = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 15));
    const statue = wayspot(2, 'Statue', at(FOUNTAIN, -3));
    const kiosk = { ...FOUNTAIN, id: 21, name: 'Kiosk', ...at(FOUNTAIN, 19) };
    const result = plan([FOUNTAIN, kiosk], [named, statue]);
    expect(result.matched.map((match) => [match.gymId, match.wayspot.id, match.by])).toEqual([
      [2, named.id, 'name'],
    ]);
    expect(result.reviews).toEqual([
      expect.objectContaining({
        gymId: 21,
        kind: 'match',
        candidates: [expect.objectContaining({ id: statue.id })],
      }),
    ]);
  });

  it('waits with picks by place alone while a pick by name may still come of a later pass', () => {
    // Gym A has two namesakes, X 10 m south and Y 12 m north: undecided until gym C takes Y by
    // its loose name. Gym D, 14 m south of A, could take X by place alone (4 m): it waits, and A
    // takes X by name once C has Y.
    const a = { ...FOUNTAIN, id: 21 };
    const c = { ...FOUNTAIN, id: 22, name: 'The Old Stone Fountain', ...at(FOUNTAIN, 60) };
    const d = { ...FOUNTAIN, id: 23, name: 'Kiosk', ...at(FOUNTAIN, -14) };
    const result = plan(
      [a, c, d],
      [
        wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, -10)),
        wayspot(2, 'Old Stone Fountain', at(FOUNTAIN, 12)),
      ],
    );
    expect(result.matched.map((match) => [match.gymId, match.wayspot.id, match.by])).toEqual([
      [21, idOf(1), 'name'],
      [22, idOf(2), 'name'],
    ]);
  });

  it('decides a gym again once another gym took one of its two candidates', () => {
    // On a line: X 10 m south of gym A, Y 12 m north; gym C 60 m north of A sees only Y (48 m,
    // loose name). A goes first and is undecided; C takes Y; then A has X alone.
    const a = { ...FOUNTAIN, id: 21 };
    const c = { ...FOUNTAIN, id: 22, name: 'The Old Stone Fountain', ...at(FOUNTAIN, 60) };
    const result = plan(
      [a, c],
      [
        wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, -10)),
        wayspot(2, 'Old Stone Fountain', at(FOUNTAIN, 12)),
      ],
    );
    expect(result.matched.map((match) => [match.gymId, match.wayspot.id])).toEqual([
      [21, idOf(1)],
      [22, idOf(2)],
    ]);
  });

  it('gives a Wayspot to at most one gym', () => {
    const twin = { ...FOUNTAIN, id: 21, ...at(FOUNTAIN, 2) };
    const result = plan([FOUNTAIN, twin], [wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1))]);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]!.gymId).toBe(2);
    expect(fates(result).get(21)).toBe('unknown');
  });

  it('keeps the name and the match when the title is blank or too long for the column', () => {
    const blank = plan([FOUNTAIN], [wayspot(1, ' \u200b ', at(FOUNTAIN, 1))]);
    expect(blank.matched).toEqual([
      expect.objectContaining({ by: 'place', rename: null, titleProblem: 'blank' }),
    ]);
    const long = matchGyms({
      gyms: [FOUNTAIN],
      wayspots: [wayspot(1, 'Old Stone Fountain & Plaza', at(FOUNTAIN, 1))],
      covered: cellsOf([FOUNTAIN]),
      storedLength: () => 256,
    });
    expect(long.matched).toEqual([
      expect.objectContaining({ rename: null, titleProblem: 'too-long' }),
    ]);
  });
});

describe('matchGyms: gyms that are missing', () => {
  it('queues a gym whose Wayspot is now a stop for deletion, the stop first among its candidates', () => {
    const stop = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 30), 'stop');
    const other = wayspot(2, 'Cafe Luna', at(FOUNTAIN, 20), 'stop');
    const result = plan([gym(2, { pogoId: stop.id })], [stop, other]);
    expect(result.matched).toEqual([]);
    expect(result.reviews).toEqual([
      {
        gymId: 2,
        kind: 'missing',
        candidates: [
          expect.objectContaining({ id: other.id, kind: 'stop' }),
          expect.objectContaining({ id: stop.id, kind: 'stop' }),
        ],
      },
    ]);
  });

  it('queues a never matched gym whose namesake is a Power Spot as missing, its own candidate marked', () => {
    const spot = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 10), 'powerspot');
    const result = plan([FOUNTAIN], [spot]);
    expect(result.matched).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      {
        gymId: 2,
        kind: 'missing',
        candidates: [expect.objectContaining({ id: spot.id, own: true })],
      },
    ]);
  });

  it('takes no stop or Power Spot by its place alone: it is a candidate, a gym near is offered', () => {
    // A power spot 3 m off and a Wayfarer gym "New Name" 15 m off: the gym was renamed and
    // moved, or is another one. Never added beside it, never queued as missing.
    const spot = wayspot(1, 'Field', at(FOUNTAIN, 3), 'powerspot');
    const renamed = wayspot(2, 'New Name', at(FOUNTAIN, 15));
    const result = plan([FOUNTAIN], [spot, renamed]);
    expect(result.matched).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      {
        gymId: 2,
        kind: 'match',
        candidates: [
          expect.objectContaining({ id: spot.id }),
          expect.objectContaining({ id: renamed.id }),
        ],
      },
    ]);
    expect(result.reviews[0]!.candidates.some((candidate) => candidate.own)).toBe(false);
  });

  it('asks which when the namesake is a stop and a Wayfarer gym lies near', () => {
    const statue = { ...FOUNTAIN, name: 'Statue' };
    const stop = wayspot(1, 'Statue', at(FOUNTAIN, 4), 'stop');
    const memorial = wayspot(2, 'Memorial', at(FOUNTAIN, 12));
    const result = plan([statue], [stop, memorial]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      {
        gymId: 2,
        kind: 'match',
        candidates: [
          expect.objectContaining({ id: stop.id, own: true }),
          expect.objectContaining({ id: memorial.id }),
        ],
      },
    ]);
  });

  it('tries a gym whose Wayspot is a stop now against the Wayfarer gyms near it', () => {
    const stop = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 2), 'stop');
    const moved = wayspot(2, 'Old Stone Fountain', at(FOUNTAIN, 15));
    const result = plan([gym(2, { pogoId: stop.id })], [stop, moved]);
    expect(result.matched).toEqual([
      expect.objectContaining({ gymId: 2, by: 'name', wayspot: moved }),
    ]);
    expect(result.reviews).toEqual([]);
  });

  it('queues a gym whose Wayspot is gone from a covered cell', () => {
    const result = plan(
      [gym(2, { pogoId: idOf(9) })],
      [wayspot(1, 'Bench', at(FOUNTAIN, 60), 'stop')],
    );
    expect(result.reviews).toEqual([
      { gymId: 2, kind: 'missing', candidates: [expect.objectContaining({ id: idOf(1) })] },
    ]);
  });

  it('leaves a gym alone whose Wayspot is absent from a cell that was not covered', () => {
    const result = plan([gym(2, { pogoId: idOf(9) })], [], new Set());
    expect(result.notCovered).toEqual([{ gymId: 2, cell: wayfarerCellAt(FOUNTAIN) }]);
    expect(result.reviews).toEqual([]);
  });

  it('never matches a gym whose Wayspot the file lacks where it did not cover its cell', () => {
    // Its Wayspot is there, unseen: a namesake beside it is another Wayspot.
    const namesake = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 8));
    const result = plan([gym(2, { pogoId: idOf(9) })], [namesake], new Set());
    expect(result.matched).toEqual([]);
    expect(result.notCovered).toEqual([{ gymId: 2, cell: wayfarerCellAt(FOUNTAIN) }]);
    expect(result.added).toEqual([namesake]);
  });

  it('never matches a gym whose Wayspot the file lacks where a cell within 50 m was not covered', () => {
    // A gym 30 m south of the edge of its cell: its Wayspot may lie unseen across that edge.
    let north = 0;
    while (wayfarerCellAt(at(FOUNTAIN, north)) === wayfarerCellAt(FOUNTAIN)) north++;
    const edge = { ...FOUNTAIN, id: 21, pogoId: idOf(9), ...at(FOUNTAIN, north - 30) };
    const own = wayfarerCellAt(edge);
    const neighbour = wayfarerCellAt(at(edge, 31));
    const namesake = wayspot(1, 'Old Stone Fountain', at(edge, -8));
    expect(wayfarerCellAt(namesake)).toBe(own);
    const result = plan([edge], [namesake], new Set([own]));
    expect(result.matched).toEqual([]);
    expect(result.notCovered).toEqual([{ gymId: 21, cell: neighbour }]);
    expect(result.added).toEqual([namesake]);
    // With that cell covered too, its Wayspot is gone and the namesake is it.
    expect(fates(plan([edge], [namesake], new Set([own, neighbour])))).toEqual(
      new Map([[21, 'matched-name']]),
    );
  });

  it('matches a gym whose Wayspot is gone certainly to another, with its new id', () => {
    const now = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 8));
    const result = plan([gym(2, { pogoId: idOf(9) })], [now]);
    expect(result.matched).toEqual([expect.objectContaining({ gymId: 2, by: 'name' })]);
  });

  it('queues a never matched gym of a covered cell with no Wayspot near as unknown', () => {
    const result = plan([FOUNTAIN], [wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 101))]);
    expect(result.reviews).toEqual([{ gymId: 2, kind: 'unknown', candidates: [] }]);
    expect(result.added).toHaveLength(1);
  });

  it('asks whether a gym is missing or unknown only when every cell within 50 m was covered', () => {
    // A gym 30 m south of the edge of its cell: the cell north of it may hold its Wayspot.
    let north = 0;
    while (wayfarerCellAt(at(FOUNTAIN, north)) === wayfarerCellAt(FOUNTAIN)) north++;
    const edge = { ...FOUNTAIN, id: 21, ...at(FOUNTAIN, north - 30) };
    const own = wayfarerCellAt(edge);
    const neighbour = wayfarerCellAt(at(edge, 31));
    expect(neighbour).not.toBe(own);
    const gone = { ...edge, pogoId: idOf(9) };
    for (const one of [edge, gone]) {
      expect(plan([one], [], new Set([own])).notCovered).toEqual([{ gymId: 21, cell: neighbour }]);
      expect(fates(plan([one], [], new Set([own, neighbour])))).toEqual(
        new Map([[21, one === edge ? 'unknown' : 'missing']]),
      );
    }
  });

  it('leaves a never matched gym of a cell that was not covered alone', () => {
    const result = plan([FOUNTAIN], [], new Set());
    expect(result.notCovered).toEqual([{ gymId: 2, cell: wayfarerCellAt(FOUNTAIN) }]);
  });

  it('asks about a never matched gym with only stops near as unknown, listing them', () => {
    const near = [wayspot(1, 'Bench', at(FOUNTAIN, 99), 'stop')];
    expect(plan([FOUNTAIN], near).reviews).toEqual([
      { gymId: 2, kind: 'unknown', candidates: [expect.objectContaining({ id: idOf(1) })] },
    ]);
    // Its cell not covered, a stop near says nothing of the gym.
    expect(fates(plan([FOUNTAIN], near, new Set()))).toEqual(new Map([[2, 'not-covered']]));
  });

  it('queues a never matched gym with a Wayfarer gym near as a match, covered or not', () => {
    const result = plan([FOUNTAIN], [wayspot(1, 'Mural', at(FOUNTAIN, 99))], new Set());
    expect(result.reviews).toEqual([
      { gymId: 2, kind: 'match', candidates: [expect.objectContaining({ id: idOf(1) })] },
    ]);
    expect(result.added).toEqual([]);
  });

  it('offers at most five candidates within 100 metres, nearest first, none taken', () => {
    const near = [10, 20, 30, 40, 60, 70, 99].map((metres, index) =>
      wayspot(index + 1, `Spot ${index}`, at(FOUNTAIN, metres), 'stop'),
    );
    const taken = wayspot(20, 'Old Stone Fountain', at(FOUNTAIN, -30));
    const holder = gym(1, { pogoId: taken.id });
    const result = plan(
      [FOUNTAIN, holder],
      [...near, taken, wayspot(30, 'Far', at(FOUNTAIN, 101), 'stop')],
    );
    const review = result.reviews.find((item) => item.gymId === 2);
    expect(review?.candidates.map((candidate) => candidate.id)).toEqual([1, 2, 3, 4, 5].map(idOf));
  });

  it('never queues a gym marked not in Wayfarer, matched or not', () => {
    const sponsored = gym(5, { notInWayfarer: true });
    expect(fates(plan([sponsored], []))).toEqual(new Map([[5, 'not-in-wayfarer']]));
    expect(fates(plan([sponsored], [], new Set()))).toEqual(new Map([[5, 'not-in-wayfarer']]));
    const near = wayspot(1, 'Bench', at(sponsored, 40), 'stop');
    expect(fates(plan([sponsored], [near]))).toEqual(new Map([[5, 'not-in-wayfarer']]));
    const turned = wayspot(2, 'Starbucks', at(sponsored, 1), 'stop');
    expect(fates(plan([{ ...sponsored, pogoId: turned.id }], [turned]))).toEqual(
      new Map([[5, 'not-in-wayfarer']]),
    );
  });

  it('matches a gym marked not in Wayfarer when Wayfarer has it after all, and clears the mark', () => {
    const sponsored = gym(5, { notInWayfarer: true });
    const result = plan([sponsored], [wayspot(1, 'Starbucks', at(sponsored, 3))]);
    expect(fates(result)).toEqual(new Map([[5, 'matched-name']]));
    expect(result.matched[0]?.unmark).toBe(true);
    // Found by its id with nothing else to change, it is still no "unchanged": the mark goes.
    const same = wayspot(1, 'Starbucks', at(sponsored, 1));
    const byId = plan([{ ...sponsored, pogoId: same.id }], [same]);
    expect(byId.matched).toEqual([expect.objectContaining({ by: 'id', unmark: true })]);
    expect(byId.unchangedSeen).toEqual([]);
  });
});

describe('matchGyms: the picture', () => {
  const PICTURE = 'https://lh3.googleusercontent.com/abc';

  it('writes the picture address of the Wayspot when it differs from the gym’s', () => {
    const same = { ...wayspot(1, 'Pinewood Public Library', at(LIBRARY, 1)), image: PICTURE };
    const result = plan([gym(1, { pogoId: same.id })], [same]);
    expect(result.matched).toEqual([expect.objectContaining({ picture: PICTURE })]);
    expect(result.unchangedSeen).toEqual([]);
    const kept = plan([gym(1, { pogoId: same.id, imageUrl: PICTURE })], [same]);
    expect(kept.matched).toEqual([expect.objectContaining({ picture: null })]);
    expect(kept.unchangedSeen).toEqual([1]);
  });

  it('leaves the picture as it is for a Wayspot without one, or with one too long to store', () => {
    const none = wayspot(1, 'Pinewood Public Library', at(LIBRARY, 1));
    const old = gym(1, { pogoId: none.id, imageUrl: PICTURE });
    expect(plan([old], [none]).matched[0]?.picture).toBeNull();
    const long = { ...none, image: `https://x/${'a'.repeat(MAX_PICTURE_ADDRESS)}` };
    expect(plan([old], [long]).matched[0]?.picture).toBeNull();
    expect(pictureOf('')).toBeNull();
    expect(pictureOf('a'.repeat(MAX_PICTURE_ADDRESS))).toBe('a'.repeat(MAX_PICTURE_ADDRESS));
  });
});

describe('newGymName', () => {
  const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
  const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e);
  const length = (text: string): number => text.length;

  it('is the title tidied, cut by characters to what the column holds', () => {
    expect(newGymName(`  Old${ZERO_WIDTH_SPACE}Mill \n`, length)).toBe('OldMill');
    expect(newGymName('é'.repeat(300), length)).toBe('é'.repeat(255));
    // Cut by what is stored: an encoding that doubles every character halves the name.
    expect(newGymName('x'.repeat(300), (text) => text.length * 2)).toBe('x'.repeat(127));
  });

  it('is null for a title of nothing that shows', () => {
    expect(newGymName('', length)).toBeNull();
    expect(newGymName(` ${RIGHT_TO_LEFT_OVERRIDE} `, length)).toBeNull();
  });
});

describe('matchGyms: new gyms', () => {
  it('adds a Wayfarer gym that no gym is and that has no gym it may be within 100 metres', () => {
    const fresh = wayspot(1, 'New Mural', at(FOUNTAIN, 101));
    const stop = wayspot(2, 'Bench', at(FOUNTAIN, 500), 'stop');
    const result = plan([FOUNTAIN], [fresh, stop]);
    expect(result.added).toEqual([fresh]);
    expect(result.reviews).toEqual([{ gymId: 2, kind: 'unknown', candidates: [] }]);
  });

  it('offers a Wayfarer gym of another name 25 metres off for the gym, never adds it', () => {
    const library = { ...LIBRARY, name: 'Library' };
    const carnegie = wayspot(1, 'Carnegie Library', at(LIBRARY, 25));
    const result = plan([library], [carnegie]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      { gymId: 1, kind: 'match', candidates: [expect.objectContaining({ id: carnegie.id })] },
    ]);
  });

  it('offers a Wayfarer gym of the same name 60 metres off for the gym, never adds it', () => {
    const park = { ...FOUNTAIN, name: 'PNC Park' };
    const far = wayspot(1, 'PNC Park', at(FOUNTAIN, 60));
    const result = plan([park], [far]);
    expect(result.added).toEqual([]);
    expect(result.reviews.map((item) => [item.gymId, item.kind])).toEqual([[2, 'match']]);
  });

  it('offers a Wayfarer gym for the gym of its name before a nearer one', () => {
    const fresh = wayspot(1, 'Kiosk', at(FOUNTAIN, 40));
    const nearer = { ...FOUNTAIN, id: 21, name: 'Bandstand', ...at(FOUNTAIN, 25) };
    const named = { ...FOUNTAIN, id: 22, name: 'Kiosk', ...at(FOUNTAIN, -50) };
    const result = plan([nearer, named], [fresh]);
    expect(result.added).toEqual([]);
    // Both list it (it lies within 100 m of both); it was placed with the namesake.
    expect(fates(result)).toEqual(
      new Map([
        [21, 'match'],
        [22, 'match'],
      ]),
    );
  });

  it('offers a Wayfarer gym within 10 metres of an unmatched gym for that gym instead', () => {
    // Two Wayfarer gyms 7 m and 9 m off, neither certain: both are the gym's candidates.
    const one = wayspot(1, 'New Mural', at(FOUNTAIN, 7));
    const two = wayspot(2, 'Other Mural', at(FOUNTAIN, -9));
    const result = plan([FOUNTAIN], [one, two]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      {
        gymId: 2,
        kind: 'match',
        candidates: [
          expect.objectContaining({ id: one.id }),
          expect.objectContaining({ id: two.id }),
        ],
      },
    ]);
  });

  it('offers it for the nearest of two unmatched gyms, and always, even past five candidates', () => {
    const stops = [1, 2, 3, 4, 5, 6].map((metres) =>
      wayspot(metres, `Stop ${metres}`, at(FOUNTAIN, -metres - 0.5, 6), 'stop'),
    );
    const fresh = wayspot(10, 'New Mural', at(FOUNTAIN, 8));
    const farther = { ...FOUNTAIN, id: 21, name: 'Kiosk', ...at(FOUNTAIN, 17) };
    const result = plan([FOUNTAIN, farther], [...stops, fresh]);
    const review = result.reviews.find((item) => item.gymId === 2);
    expect(review?.candidates).toHaveLength(5);
    expect(review?.candidates.map((candidate) => candidate.id)).toContain(fresh.id);
    expect(result.reviews.find((item) => item.gymId === 21)?.candidates.map((c) => c.id)).toContain(
      fresh.id,
    );
    expect(result.added).toEqual([]);
  });

  it('turns a missing gym with a Wayfarer gym within 10 metres into a match', () => {
    const fresh = wayspot(1, 'New Mural', at(FOUNTAIN, 8));
    const gone = gym(2, { pogoId: idOf(9) });
    expect(plan([gone], [fresh]).reviews.map((item) => item.kind)).toEqual(['match']);
    // Where the file did not cover its cell, its Wayspot was not seen: it is that one, and the
    // Wayfarer gym is added (the service's ten metres then hold it back).
    const result = plan([gone], [fresh], new Set());
    expect(result.notCovered).toEqual([{ gymId: 2, cell: wayfarerCellAt(FOUNTAIN) }]);
    expect(result.reviews).toEqual([]);
    expect(result.added).toEqual([fresh]);
  });

  it('adds a Wayfarer gym beside a gym that is matched or marked', () => {
    const own = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1));
    const beside = wayspot(2, 'Wall Mural', at(FOUNTAIN, -8));
    expect(plan([FOUNTAIN], [own, beside]).added).toEqual([beside]);
    const sponsored = gym(5, { notInWayfarer: true });
    const mural = wayspot(3, 'Coffee Mural', at(sponsored, 6));
    expect(plan([sponsored], [mural]).added).toEqual([mural]);
  });

  // Promotion: the game makes a stop a gym once its level-14 cell holds 2, 6 or 20 stops and
  // gyms, so new Wayfarer gyms appear beside gyms Pine has.
  it('promotion: adds a Wayfarer gym 40 metres from a matched gym with no unmatched gym near', () => {
    const own = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1));
    const promoted = wayspot(2, 'Park Sign', at(FOUNTAIN, 40));
    const result = plan([FOUNTAIN], [own, promoted]);
    expect(fates(result)).toEqual(new Map([[2, 'matched-name']]));
    expect(result.added).toEqual([promoted]);
  });

  it('promotion: offers it for an unmatched gym of another name 40 metres off, never adds it', () => {
    const promoted = wayspot(2, 'Park Sign', at(FOUNTAIN, 40));
    const result = plan([FOUNTAIN], [promoted]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      { gymId: 2, kind: 'match', candidates: [expect.objectContaining({ id: promoted.id })] },
    ]);
  });

  it('never adds a stop or a Power Spot', () => {
    const result = plan(
      [],
      [wayspot(1, 'Bench', FOUNTAIN, 'stop'), wayspot(2, 'Field', LIBRARY, 'powerspot')],
    );
    expect(result.added).toEqual([]);
  });
});

describe('matchGyms: what is asked rather than written', () => {
  it('asks about a gym whose Wayspot by id lies 3 km away, writing nothing', () => {
    const far = wayspot(1, 'Pinewood Public Library', at(LIBRARY, 3_000));
    const result = plan([gym(1, { pogoId: far.id })], [far]);
    expect(result.matched).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([
      {
        gymId: 1,
        kind: 'match',
        candidates: [expect.objectContaining({ id: far.id, own: true })],
      },
    ]);
  });

  it('asks about a match that would move the gym where this server may not put it', () => {
    const own = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 8));
    const result = matchGyms({
      gyms: [FOUNTAIN],
      wayspots: [own],
      covered: cellsOf([FOUNTAIN]),
      storedLength: (text) => text.length,
      mayPlace: () => false,
    });
    expect(result.matched).toEqual([]);
    expect(result.reviews).toEqual([
      { gymId: 2, kind: 'match', candidates: [expect.objectContaining({ id: own.id, own: true })] },
    ]);
    // A match that moves nothing needs no place.
    const still = matchGyms({
      gyms: [FOUNTAIN],
      wayspots: [wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 2))],
      covered: cellsOf([FOUNTAIN]),
      storedLength: (text) => text.length,
      mayPlace: () => false,
    });
    expect(still.matched).toHaveLength(1);
  });

  it('treats a Wayspot a gym outside the import holds as taken', () => {
    const held = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1));
    const result = matchGyms({
      gyms: [FOUNTAIN],
      wayspots: [held],
      covered: cellsOf([FOUNTAIN]),
      storedLength: (text) => text.length,
      takenElsewhere: new Set([held.id]),
    });
    expect(result.matched).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.reviews).toEqual([{ gymId: 2, kind: 'unknown', candidates: [] }]);
  });

  it('matches a gym inside the regions to its Wayspot just outside, and adds nothing outside', () => {
    const inside = (point: LatLon): boolean => point.lat <= FOUNTAIN.lat + 5 / METRES_PER_DEGREE;
    const own = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 10));
    const outsideNear = wayspot(2, 'Mural', at(FOUNTAIN, 300));
    const outsideFar = wayspot(3, 'Far Mural', at(FOUNTAIN, 5_000));
    const result = matchGyms({
      gyms: [FOUNTAIN],
      wayspots: [own, outsideNear, outsideFar],
      covered: cellsOf([FOUNTAIN]),
      storedLength: (text) => text.length,
      inRegion: inside,
    });
    expect(result.matched).toEqual([expect.objectContaining({ gymId: 2, wayspot: own })]);
    expect(result.added).toEqual([]);
    expect(result.outside).toBe(2);
    expect(result.outsideGyms).toEqual([]);
  });

  it('lists the Wayfarer gyms outside the regions that no gym took or may be, within the margin', () => {
    const edge = FOUNTAIN.lat + 5 / METRES_PER_DEGREE;
    const inside = (point: LatLon): boolean => point.lat <= edge;
    const nearOutline = (point: LatLon) => {
      const metres = (point.lat - edge) * METRES_PER_DEGREE;
      return metres <= 500 ? { metres, channelId: 'west' } : undefined;
    };
    const offered = wayspot(1, 'Mural', at(FOUNTAIN, 60));
    const lone = wayspot(2, 'Water Tower', at(FOUNTAIN, 300));
    const stop = wayspot(3, 'Bench', at(FOUNTAIN, 310), 'stop');
    const held = wayspot(4, 'Gazebo', at(FOUNTAIN, 400));
    const far = wayspot(5, 'Far Mural', at(FOUNTAIN, 5_000));
    const added = wayspot(6, 'Sculpture', at(FOUNTAIN, -300));
    const input = {
      gyms: [FOUNTAIN],
      wayspots: [offered, lone, stop, held, far, added],
      covered: cellsOf([FOUNTAIN]),
      storedLength: (text: string) => text.length,
      inRegion: inside,
      takenElsewhere: new Set([held.id]),
    };
    const result = matchGyms({ ...input, nearOutline });
    expect(result.reviews).toEqual([
      expect.objectContaining({
        gymId: 2,
        kind: 'match',
        candidates: [expect.objectContaining({ id: offered.id })],
      }),
    ]);
    expect(result.added).toEqual([added]);
    expect(result.outsideGyms).toEqual([
      { wayspot: lone, metres: expect.closeTo(295, 0) as number, channelId: 'west' },
    ]);
    // Without a margin nothing is listed.
    expect(matchGyms(input).outsideGyms).toEqual([]);
    // Nor one in a region of another server, nor one a gym outside the import may be.
    const foreign = matchGyms({
      ...input,
      nearOutline,
      mayPlace: (point) => point.lat < FOUNTAIN.lat + 200 / METRES_PER_DEGREE,
    });
    expect(foreign.outsideGyms).toEqual([]);
    const theirs = { ...FOUNTAIN, id: 31, name: 'Tower Base', ...at(FOUNTAIN, 330) };
    const another = matchGyms({ ...input, nearOutline, others: [theirs] });
    expect(another.outsideGyms).toEqual([]);
    expect(another.held).toEqual([]);
  });
});

describe('matchGyms as a whole', () => {
  it('puts every gym in exactly one list, ordered by id', () => {
    const list = gyms().map((one) =>
      one.id === 5
        ? { ...one, notInWayfarer: true }
        : one.id === 3
          ? { ...one, pogoId: idOf(9) }
          : one,
    );
    const covered = cellsOf(list.filter((one) => one.id !== 10));
    const result = plan(
      list,
      [
        wayspot(1, 'Pinewood Public Library', at(LIBRARY, 4)),
        wayspot(2, 'Bench', at(FOUNTAIN, 40), 'stop'),
        wayspot(3, 'Veterans Memorial Bridge', at(gym(4), 6), 'powerspot'),
      ],
      covered,
    );
    const fate = fates(result);
    expect([...fate.keys()].sort((a, b) => a - b)).toEqual(list.map((one) => one.id));
    expect(Object.fromEntries(fate)).toEqual({
      1: 'matched-name',
      2: 'unknown',
      3: 'missing',
      4: 'missing',
      5: 'not-in-wayfarer',
      6: 'unknown',
      7: 'unknown',
      8: 'unknown',
      9: 'unknown',
      10: 'not-covered',
      11: 'unknown',
      12: 'unknown',
    });
    for (const list of [result.matched, result.reviews, result.notCovered]) {
      const ids = list.map((entry) => entry.gymId);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    }
  });

  it('plans a city of 3,200 gyms and 30,000 Wayspots', () => {
    const random = seededRandom(8);
    const centre: LatLon = { lat: 40.44, lon: -79.99 };
    const somewhere = (): LatLon =>
      at(centre, (random() - 0.5) * 40_000, (random() - 0.5) * 40_000);
    const kinds: WayspotKind[] = ['gym', 'stop', 'stop', 'stop', 'powerspot'];
    const wayspots = Array.from({ length: 30_000 }, (_, index) =>
      wayspot(index + 1, `Wayspot ${index}`, somewhere(), kinds[index % kinds.length]),
    );
    const city: ImportGym[] = Array.from({ length: 3_200 }, (_, index) => {
      const id = index + 1;
      const own = wayspots[index * 5]!;
      const place = index % 4 === 3 ? somewhere() : at(own, random() * 30, random() * 30);
      return {
        id,
        pogoId: index % 4 === 0 ? own.id : null,
        name: index % 4 === 1 ? own.title : `Gym ${id}`,
        ...place,
        notInWayfarer: false,
        imageUrl: null,
      };
    });
    const covered = cellsOf([...city, ...wayspots]);
    const result = matchGyms({
      gyms: city,
      wayspots,
      covered,
      storedLength: (text) => text.length,
    });
    expect(fates(result).size).toBe(3_200);
    expect(result.matched.length).toBeGreaterThan(1_500);
    const used = new Set(result.matched.map((match) => match.wayspot.id));
    expect(used.size).toBe(result.matched.length);
    for (const review of result.reviews) {
      const own = city[review.gymId - 1]!;
      for (const candidate of review.candidates) {
        expect(metresBetween(own, candidate)).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('withAnswers', () => {
  const item = (gymId: number, kind: 'match' | 'unknown', ids: number[]) => ({
    gymId,
    kind,
    candidates: ids.map((n) => ({
      id: idOf(n),
      kind: 'stop' as const,
      title: '',
      lat: 40 + n / 100,
      lon: -80,
      metres: n,
    })),
  });
  /** The cells of the candidates numbered so. */
  const cellsOfIds = (...ids: number[]): Set<string> =>
    new Set(ids.map((n) => wayfarerCellAt({ lat: 40 + n / 100, lon: -80 })));
  const EVERY_CELL = cellsOfIds(1, 2, 3);

  it('compares only the Wayspots answered about whose cells the new file covered', () => {
    // Answered about 1 and 2; a file that covers only the cell of 1 lacks 2, and says nothing of it.
    const last = new Map([
      [1, { ...item(1, 'match', [1, 2]), decision: 'none-of-these' as const }],
      [2, { ...item(2, 'match', [1, 2]), decision: 'keep' as const }],
      [3, { ...item(3, 'match', [1, 2]), decision: 'none-of-these' as const }],
    ]);
    const asked = {
      ...plan([], []),
      reviews: [item(1, 'match', [1]), item(2, 'match', [1]), item(3, 'match', [1, 3])],
    };
    const result = withAnswers(asked, last, cellsOfIds(1));
    expect(result.answered).toEqual([1, 2]);
    // A Wayspot new to the question is a change wherever it lies.
    expect(result.reviews.map((one) => one.gymId)).toEqual([3]);
    // Where the file covered the cell of 2 and lacks it, Wayfarer changed.
    expect(withAnswers(asked, last, cellsOfIds(1, 2)).answered).toEqual([]);
  });

  it('leaves out a gym answered Keep or None of these to the same question', () => {
    const asked = { ...plan([], []), reviews: [item(1, 'match', [1, 2]), item(2, 'unknown', [])] };
    const result = withAnswers(
      asked,
      new Map([
        [1, { ...item(1, 'match', [2, 1]), decision: 'none-of-these' as const }],
        [2, { ...item(2, 'unknown', []), decision: 'keep' as const }],
      ]),
      EVERY_CELL,
    );
    expect(result.reviews).toEqual([]);
    expect(result.answered).toEqual([1, 2]);
  });

  it('asks again when Wayfarer changed or the answer was another', () => {
    const asked = {
      ...plan([], []),
      reviews: [item(1, 'match', [1, 2]), item(2, 'match', [1]), item(3, 'match', [1])],
    };
    const result = withAnswers(
      asked,
      new Map([
        [1, { ...item(1, 'match', [1]), decision: 'none-of-these' as const }],
        [2, { ...item(2, 'unknown', [1]), decision: 'keep' as const }],
        [3, { ...item(3, 'match', [1]), decision: 'resolved' as const }],
      ]),
      EVERY_CELL,
    );
    expect(result.reviews.map((one) => one.gymId)).toEqual([1, 2, 3]);
    expect(result.answered).toEqual([]);
  });
});

describe('matchGyms: who may be a Wayfarer gym nobody took', () => {
  const STORED = (text: string): number => text.length;

  it('never offers a Wayfarer gym for a gym that answered None of these about it', () => {
    const promoted = wayspot(2, 'Park Sign', at(FOUNTAIN, 40));
    const refused = new Map([[2, new Set([promoted.id])]]);
    const alone = matchGyms({
      gyms: [FOUNTAIN],
      wayspots: [promoted],
      covered: cellsOf([FOUNTAIN]),
      storedLength: STORED,
      refused,
    });
    expect(alone.added).toEqual([promoted]);
    // A Wayspot that is added is no candidate of the gym: it becomes a gym of its own.
    expect(alone.reviews).toEqual([{ gymId: 2, kind: 'unknown', candidates: [] }]);
    // Offered for the next gym that may be it instead.
    const kiosk = { ...FOUNTAIN, id: 21, name: 'Kiosk', ...at(FOUNTAIN, 80) };
    const beside = matchGyms({
      gyms: [FOUNTAIN, kiosk],
      wayspots: [promoted],
      covered: cellsOf([FOUNTAIN, kiosk]),
      storedLength: STORED,
      refused,
    });
    expect(beside.added).toEqual([]);
    expect(beside.reviews.find((item) => item.gymId === 21)?.kind).toBe('match');
  });

  it('offers a gym at most five Wayfarer gyms, nearest first; the rest go on or are held', () => {
    const seven = [20, 30, 40, 50, 60, 70, 80].map((metres, i) =>
      wayspot(i + 1, `Mural ${i + 1}`, at(FOUNTAIN, metres * Math.cos(i), metres * Math.sin(i))),
    );
    const result = plan([FOUNTAIN], seven);
    const offered = result.reviews[0]!.candidates.map((candidate) => candidate.id);
    expect(offered).toEqual(seven.slice(0, 5).map((one) => one.id));
    // Neither added nor offered: the gym may be them, once a later import frees a place.
    expect(result.added).toEqual([]);
    expect(result.held).toEqual(seven.slice(5).map((one) => ({ wayspot: one, gymId: 2 })));
    // Past five, the next gym within 100 metres is offered them.
    const kiosk = { ...FOUNTAIN, id: 21, name: 'Kiosk', ...at(FOUNTAIN, 10) };
    const two = plan([FOUNTAIN, kiosk], seven);
    const all = two.reviews.flatMap((item) => item.candidates.map((candidate) => candidate.id));
    for (const one of seven) expect(all).toContain(one.id);
    expect(two.added).toEqual([]);
    expect(two.held).toEqual([]);
  });

  it('never offers one for a gym whose Wayspot the file lacks where it did not cover its cell', () => {
    const unseen = gym(2, { pogoId: idOf(9) });
    const promoted = wayspot(2, 'Park Sign', at(FOUNTAIN, 50));
    const covered = cellsOf([LIBRARY]);
    expect(covered.has(wayfarerCellAt(FOUNTAIN))).toBe(false);
    const result = plan([unseen], [promoted], covered);
    expect(result.added).toEqual([promoted]);
    expect(fates(result)).toEqual(new Map([[2, 'not-covered']]));
  });

  it('holds a Wayfarer gym back that a gym outside the import may be', () => {
    const promoted = wayspot(2, 'Park Sign', at(FOUNTAIN, 30));
    const input = {
      gyms: [],
      wayspots: [promoted],
      covered: cellsOf([FOUNTAIN]),
      storedLength: STORED,
    };
    const held = matchGyms({ ...input, others: [FOUNTAIN] });
    expect(held.added).toEqual([]);
    expect(held.held).toEqual([{ wayspot: promoted, gymId: 2 }]);
    // Not by a gym that is another Wayspot, nor by one marked not in Wayfarer.
    const own = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 1));
    for (const other of [gym(2, { pogoId: own.id }), gym(2, { notInWayfarer: true })]) {
      const result = matchGyms({ ...input, wayspots: [own, promoted], others: [other] });
      expect(result.held).toEqual([]);
      expect(result.added).toContainEqual(promoted);
    }
    // Nor by one whose last answer, on any server, was None of these about it.
    const refused = matchGyms({
      ...input,
      others: [FOUNTAIN],
      refused: new Map([[2, new Set([promoted.id])]]),
    });
    expect(refused.held).toEqual([]);
    expect(refused.added).toEqual([promoted]);
  });

  it('takes the one certain by name over one certain by its place alone', () => {
    const named = wayspot(1, 'Old Stone Fountain', at(FOUNTAIN, 15));
    const statue = wayspot(2, 'Statue', at(FOUNTAIN, 3));
    const result = plan([FOUNTAIN], [named, statue]);
    expect(result.matched).toEqual([
      expect.objectContaining({ gymId: 2, by: 'name', wayspot: named }),
    ]);
    expect(result.added).toEqual([statue]);
  });
});
