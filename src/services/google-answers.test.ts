import { metresBetween } from '@pine/wayspot-core/distance';
import { describe, expect, it } from 'vitest';
import { googleAnswerCases } from '../../test/support/google-answer-cases.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  GoogleAnswers,
  MemoryGoogleAnswerStorage,
  SWEEP_ANSWERS_A_TURN,
  type GoogleAnswer,
} from './google-answers.js';

describe('MemoryGoogleAnswerStorage', () => {
  googleAnswerCases(() => Promise.resolve(new MemoryGoogleAnswerStorage()));
});

/** About one meter north, at Pittsburgh's latitude. */
const METER = 1 / 111_000;

async function answersWith(rows: GoogleAnswer[] = []) {
  const storage = new MemoryGoogleAnswerStorage();
  await storage.save(rows);
  const answers = new GoogleAnswers({ storage, log: createTestLogger().log });
  await answers.load();
  const saved: GoogleAnswer[][] = [];
  answers.whenSaved((rows) => saved.push([...rows]));
  return { answers, storage, saved };
}

describe('GoogleAnswers', () => {
  it('gives the answer of a point within ten meters, of the kind asked, and none farther', async () => {
    const { answers } = await answersWith([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: 'Corner Bakery', askedAt: 1 },
      { kind: 'address', lat: 40.06, lon: -80.06, answer: '{"a":1}', askedAt: 1 },
    ]);
    expect(answers.at('places', { lat: 40.05, lon: -80.05 })?.answer).toBe('Corner Bakery');
    expect(answers.at('places', { lat: 40.05 + 9 * METER, lon: -80.05 })?.answer).toBe(
      'Corner Bakery',
    );
    expect(answers.at('places', { lat: 40.05 + 11 * METER, lon: -80.05 })).toBeUndefined();
    // The other kind of question has nothing there.
    expect(answers.at('address', { lat: 40.05, lon: -80.05 })).toBeUndefined();
    expect(answers.at('address', { lat: 40.06, lon: -80.06 })?.answer).toBe('{"a":1}');
  });

  it('tells a place’s own answer (within a meter) from a neighbor’s shown meanwhile', async () => {
    const { answers } = await answersWith([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: 'Corner Bakery', askedAt: 1 },
    ]);
    expect(answers.ownAt('places', { lat: 40.05 + 0.5 * METER, lon: -80.05 })?.answer).toBe(
      'Corner Bakery',
    );
    const neighbor = { lat: 40.05 + 8 * METER, lon: -80.05 };
    expect(answers.at('places', neighbor)?.answer).toBe('Corner Bakery');
    expect(answers.ownAt('places', neighbor)).toBeUndefined();
  });

  it('carries the answers of a place that moved a few meters, unless the new place has its own', async () => {
    const { answers } = await answersWith([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: 'Corner Bakery', askedAt: 7 },
      { kind: 'address', lat: 40.05, lon: -80.05, answer: '{"a":1}', askedAt: 7 },
      { kind: 'places', lat: 40.06, lon: -80.06, answer: 'Old Mill', askedAt: 1 },
      { kind: 'places', lat: 40.06 + 15 * METER, lon: -80.06, answer: 'New Mill', askedAt: 2 },
    ]);
    const to = { lat: 40.05 + 15 * METER, lon: -80.05 };
    await answers.carry([
      { from: { lat: 40.05, lon: -80.05 }, to },
      { from: { lat: 40.06, lon: -80.06 }, to: { lat: 40.06 + 15 * METER, lon: -80.06 } },
    ]);
    expect(answers.ownAt('places', to)).toMatchObject({ answer: 'Corner Bakery', askedAt: 7 });
    expect(answers.ownAt('address', to)?.answer).toBe('{"a":1}');
    expect(answers.ownAt('places', { lat: 40.06 + 15 * METER, lon: -80.06 })?.answer).toBe(
      'New Mill',
    );
  });

  it('carries only what was answered about a place’s own point, never a neighbor’s', async () => {
    const { answers } = await answersWith([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: 'Corner Bakery', askedAt: 7 },
    ]);
    // A place 8 m from the one answered, never asked itself, moves 15 m on.
    const from = { lat: 40.05 + 8 * METER, lon: -80.05 };
    const to = { lat: 40.05 + 23 * METER, lon: -80.05 };
    await answers.carry([{ from, to }]);
    expect(answers.at('places', to)).toBeUndefined();
  });

  it('finds an answer across the edge of its cells', async () => {
    // 40.0999999 and 40.1000001 fall in two cells of a thousandth of a degree.
    const { answers } = await answersWith([
      { kind: 'places', lat: 40.0999995, lon: -80.0000005, answer: 'Edge Cafe', askedAt: 1 },
    ]);
    expect(answers.at('places', { lat: 40.1000005, lon: -79.9999995 })?.answer).toBe('Edge Cafe');
  });

  it('gives the nearest of several answers', async () => {
    const { answers } = await answersWith([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: 'Far', askedAt: 2 },
      { kind: 'places', lat: 40.05 + 6 * METER, lon: -80.05, answer: 'Near', askedAt: 1 },
    ]);
    expect(answers.at('places', { lat: 40.05 + 5 * METER, lon: -80.05 })?.answer).toBe('Near');
  });

  it('keeps a null for nothing found: the point was answered', async () => {
    const { answers } = await answersWith([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: null, askedAt: 1 },
    ]);
    expect(answers.at('places', { lat: 40.05, lon: -80.05 })).toEqual({
      kind: 'places',
      lat: 40.05,
      lon: -80.05,
      answer: null,
      askedAt: 1,
    });
  });

  it('saves an answer at its rounded point, over the one there, writes it first and tells of it', async () => {
    const { answers, storage, saved } = await answersWith([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: 'Old Cafe', askedAt: 1 },
    ]);
    await answers.save([
      { kind: 'places', lat: 40.0500001, lon: -80.0499999, answer: 'New Cafe', askedAt: 2 },
    ]);
    expect(answers.at('places', { lat: 40.05, lon: -80.05 })?.answer).toBe('New Cafe');
    expect(await storage.all()).toEqual([
      { kind: 'places', lat: 40.05, lon: -80.05, answer: 'New Cafe', askedAt: 2 },
    ]);
    expect(saved).toEqual([
      [{ kind: 'places', lat: 40.05, lon: -80.05, answer: 'New Cafe', askedAt: 2 }],
    ]);
    expect(answers.size).toBe(1);
  });

  it('keeps nothing in memory and tells nothing when the write fails', async () => {
    const { answers, storage, saved } = await answersWith();
    storage.failing = true;
    await expect(
      answers.save([{ kind: 'places', lat: 40, lon: -80, answer: 'Cafe', askedAt: 1 }]),
    ).rejects.toThrow();
    expect(answers.at('places', { lat: 40, lon: -80 })).toBeUndefined();
    expect(saved).toEqual([]);
  });

  it('reads nothing before its load', () => {
    const answers = new GoogleAnswers({
      storage: new MemoryGoogleAnswerStorage(),
      log: createTestLogger().log,
    });
    expect(answers.at('places', { lat: 40, lon: -80 })).toBeUndefined();
  });
});

describe('GoogleAnswers.sweep', () => {
  /**
   * Places kept somewhere (a server's gyms, every server's Wayspots), at these points; `built`
   * counts the indexes the sweeps asked for.
   */
  const keptAt = (points: readonly { lat: number; lon: number }[]) => {
    const source = {
      built: 0,
      keptPlaces: () => {
        source.built += 1;
        return {
          anyNear: (point: { lat: number; lon: number }) =>
            points.some((one) => metresBetween(one, point) <= 10),
        };
      },
    };
    return source;
  };
  const GYM = { lat: 40.05, lon: -80.05 };
  const STOP = { lat: 40.06, lon: -80.06 };
  const GONE = { lat: 40.07, lon: -80.07 };

  async function swept(now: () => number = () => 1_000) {
    const storage = new MemoryGoogleAnswerStorage();
    await storage.save([
      { kind: 'places', ...GYM, answer: 'Corner Bakery', askedAt: 1 },
      { kind: 'address', ...GYM, answer: '{"a":1}', askedAt: 1 },
      // A Wayspot 8 m off keeps it: it is what that Wayspot shows.
      { kind: 'places', ...STOP, answer: 'Old Mill', askedAt: 1 },
      // The gym that was here moved 11 m: nothing shows it any more.
      { kind: 'places', ...GONE, answer: 'Dock', askedAt: 1 },
      { kind: 'address', ...GONE, answer: null, askedAt: 1 },
    ]);
    const { log, entries } = createTestLogger();
    const answers = new GoogleAnswers({ storage, log, now });
    await answers.load();
    const places = [keptAt([GYM]), keptAt([{ lat: STOP.lat + 8 * METER, lon: STOP.lon }])];
    places.push(keptAt([{ lat: GONE.lat + 11 * METER, lon: GONE.lon }]));
    return { answers, storage, places, entries };
  }

  it('drops the answers no gym or Wayspot of any server lies within ten meters of', async () => {
    const { answers, storage, places, entries } = await swept();
    await expect(answers.sweep(places)).resolves.toBe(2);
    expect(answers.at('places', GONE)).toBeUndefined();
    expect(answers.at('address', GONE)).toBeUndefined();
    expect(answers.at('places', GYM)?.answer).toBe('Corner Bakery');
    expect(answers.at('places', STOP)?.answer).toBe('Old Mill');
    expect((await storage.all()).map((row) => row.lat).sort()).toEqual([
      GYM.lat,
      GYM.lat,
      STOP.lat,
    ]);
    expect(answers.size).toBe(3);
    expect(entries).toContainEqual(
      expect.objectContaining({ answers: 2, msg: 'dropped answers of Google no place uses' }),
    );
  });

  it('sweeps at most once a day, the first time at once', async () => {
    let now = 1_000;
    const { answers, storage, places } = await swept(() => now);
    await answers.sweep([]);
    expect(await storage.all()).toEqual([]);
    await storage.save([{ kind: 'places', ...GONE, answer: 'Dock', askedAt: 2 }]);
    await answers.load();
    now += 23 * 3_600_000;
    await expect(answers.sweep(places)).resolves.toBe(0);
    expect(answers.at('places', GONE)).toBeDefined();
    now += 3_600_000;
    await expect(answers.sweep(places)).resolves.toBe(1);
    // The places' index is asked for by a sweep that sweeps, never by the hourly ask between.
    expect(places.map((one) => one.built)).toEqual([1, 1, 1]);
  });

  it('lets other work run every few thousand answers while it looks', async () => {
    const storage = new MemoryGoogleAnswerStorage();
    const many = Array.from({ length: 2 * SWEEP_ANSWERS_A_TURN + 1 }, (_, n) => ({
      kind: 'places' as const,
      lat: 40 + n / 10_000,
      lon: -80,
      answer: 'Dock',
      askedAt: 1,
    }));
    await storage.save(many);
    const answers = new GoogleAnswers({ storage, log: createTestLogger().log, now: () => 1_000 });
    await answers.load();
    let turns = 0;
    let counting = true;
    const turn = (): void => {
      turns += 1;
      if (counting) setImmediate(turn);
    };
    setImmediate(turn);
    await expect(answers.sweep([keptAt([])])).resolves.toBe(many.length);
    counting = false;
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(answers.size).toBe(0);
  });

  it('keeps an answer saved anew at its point while the sweep wrote', async () => {
    const { answers, storage, places } = await swept();
    const remove = storage.remove.bind(storage);
    storage.remove = async (rows) => {
      // The gym's place was asked about again meanwhile (a gym added there by hand).
      await answers.save([{ kind: 'places', ...GONE, answer: 'Pier', askedAt: 9 }]);
      await remove(rows);
    };
    await answers.sweep(places);
    expect(answers.at('places', GONE)?.answer).toBe('Pier');
    expect(await storage.all()).toContainEqual(expect.objectContaining({ answer: 'Pier' }));
  });

  it('keeps everything when the write fails, and sweeps again at the next turn', async () => {
    const { answers, storage, places, entries } = await swept();
    storage.failing = true;
    await expect(answers.sweep(places)).resolves.toBe(0);
    expect(answers.at('places', GONE)).toBeDefined();
    expect(entries).toContainEqual(
      expect.objectContaining({ msg: 'could not drop the answers of Google no place uses' }),
    );
    storage.failing = false;
    await expect(answers.sweep(places)).resolves.toBe(2);
  });
});
