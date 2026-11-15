import { expect, it } from 'vitest';
import type {
  UnreadableWayfarerRow,
  WayfarerStorage,
} from '../../src/db/repositories/wayfarer-repository.js';
import type { ReviewCandidate } from '../../src/domain/wayspots/review.js';

/** A store under test, with what the cases need to know of its rows. */
export interface WayfarerSetup {
  store: WayfarerStorage;
  /** What the store reported as unreadable. */
  unreadable: UnreadableWayfarerRow[];
  /** Row ids of two servers. */
  home: number;
  away: number;
  /** Ids of three gyms. */
  gyms: readonly [number, number, number];
  /** Writes these values into a stored row, as a newer version or a damaged row might. */
  spoilReview: (id: number, columns: { kind?: string; candidates?: unknown }) => Promise<void>;
  spoilImport: (id: number, counts: unknown) => Promise<void>;
}

const STAFF = '312345678901234567';
const OTHER_STAFF = '312345678901234568';
const NOW = 1_800_000_000_000;

export const CANDIDATE: ReviewCandidate = {
  id: '0123456789abcdef0123456789abcdef.16',
  kind: 'gym',
  title: 'Mural of the Three Rivers',
  lat: 40.4417331,
  lon: -79.9958865,
  metres: 12.25,
};
export const STOP: ReviewCandidate = {
  id: 'fedcba9876543210fedcba9876543210.11',
  kind: 'stop',
  title: '',
  lat: 40.4419,
  lon: -79.9961,
  metres: 40,
};

/**
 * The behaviour of `WayfarerStorage` that the repository and its twin in memory share: run by
 * wayfarer-repository.db.test.ts for both and by wayfarer.test.ts for the twin alone.
 */
export function wayfarerStorageCases(setup: () => Promise<WayfarerSetup>): void {
  it('keeps when a gym was seen and that it is not in Wayfarer', async () => {
    const { store, gyms } = await setup();
    const [first, second, third] = gyms;
    expect(await store.records([first, second])).toEqual(new Map());
    await store.seen([first, second], NOW);
    await store.markNotInWayfarer(second, STAFF, NOW + 1);
    await store.markNotInWayfarer(third, OTHER_STAFF, NOW + 2);
    await store.seen([first, second], NOW + 3);
    expect(await store.records([first, second, third])).toEqual(
      new Map([
        [
          first,
          {
            gymId: first,
            lastSeen: NOW + 3,
            notInWayfarer: false,
            notInWayfarerBy: null,
            notInWayfarerAt: null,
          },
        ],
        [
          second,
          {
            gymId: second,
            lastSeen: NOW + 3,
            notInWayfarer: true,
            notInWayfarerBy: STAFF,
            notInWayfarerAt: NOW + 1,
          },
        ],
        [
          third,
          {
            gymId: third,
            lastSeen: null,
            notInWayfarer: true,
            notInWayfarerBy: OTHER_STAFF,
            notInWayfarerAt: NOW + 2,
          },
        ],
      ]),
    );
    expect([...(await store.records([third])).keys()]).toEqual([third]);
    await store.seen([], NOW);
    expect(await store.records([])).toEqual(new Map());
  });

  it('takes the mark not in Wayfarer off, keeping when a gym was seen', async () => {
    const { store, gyms } = await setup();
    const [first, second, third] = gyms;
    await store.seen([first], NOW);
    await store.markNotInWayfarer(first, STAFF, NOW + 1);
    await store.markNotInWayfarer(second, STAFF, NOW + 2);
    await store.clearNotInWayfarer([first, third]);
    await store.clearNotInWayfarer([]);
    expect(await store.records([first, second, third])).toEqual(
      new Map([
        [
          first,
          {
            gymId: first,
            lastSeen: NOW,
            notInWayfarer: false,
            notInWayfarerBy: null,
            notInWayfarerAt: null,
          },
        ],
        [
          second,
          {
            gymId: second,
            lastSeen: null,
            notInWayfarer: true,
            notInWayfarerBy: STAFF,
            notInWayfarerAt: NOW + 2,
          },
        ],
      ]),
    );
  });

  it("answers a server's newest import and never another server's", async () => {
    const { store, home, away } = await setup();
    expect(await store.lastImport(home)).toBeUndefined();
    const older = await store.addImport({
      guildId: home,
      staffId: STAFF,
      importedAt: NOW,
      startedAt: NOW - 3_600_000,
      finishedAt: NOW - 60_000,
      counts: { matched: 120, added: 2 },
    });
    const newer = await store.addImport({
      guildId: home,
      staffId: OTHER_STAFF,
      importedAt: NOW + 1,
      startedAt: null,
      finishedAt: null,
      counts: {},
    });
    await store.addImport({
      guildId: away,
      staffId: STAFF,
      importedAt: NOW + 2,
      startedAt: null,
      finishedAt: null,
      counts: { matched: 1 },
    });
    expect(newer).toBeGreaterThan(older);
    expect(await store.lastImport(home)).toEqual({
      id: newer,
      guildId: home,
      staffId: OTHER_STAFF,
      importedAt: NOW + 1,
      startedAt: null,
      finishedAt: null,
      counts: {},
    });
    expect(await store.lastImport(away)).toMatchObject({ counts: { matched: 1 } });
  });

  it('passes over an import it cannot read, and says so once', async () => {
    const { store, home, unreadable, spoilImport } = await setup();
    const older = await store.addImport({
      guildId: home,
      staffId: STAFF,
      importedAt: NOW,
      startedAt: NOW - 1,
      finishedAt: NOW,
      counts: { matched: 3 },
    });
    const newer = await store.addImport({
      guildId: home,
      staffId: STAFF,
      importedAt: NOW + 1,
      startedAt: null,
      finishedAt: null,
      counts: { matched: 4 },
    });
    await spoilImport(newer, { matched: 'many' });
    expect(await store.lastImport(home)).toMatchObject({ id: older, counts: { matched: 3 } });
    expect(await store.lastImport(home)).toMatchObject({ id: older });
    expect(unreadable).toEqual([
      { table: 'WayspotImport', id: newer, problem: expect.stringContaining('counts') as string },
    ]);
  });

  it('queues new items at the end and keeps the place of an item queued again', async () => {
    const { store, home, gyms } = await setup();
    const [first, second, third] = gyms;
    const importId = await store.addImport({
      guildId: home,
      staffId: STAFF,
      importedAt: NOW,
      startedAt: null,
      finishedAt: null,
      counts: {},
    });
    await store.saveReviews(home, null, [{ gymId: first, kind: 'match', candidates: [STOP] }], NOW);
    await store.saveReviews(
      home,
      importId,
      [
        { gymId: second, kind: 'unknown', candidates: [] },
        { gymId: first, kind: 'missing', candidates: [CANDIDATE, STOP], gymPogoId: STOP.id },
      ],
      NOW + 10,
    );
    await store.saveReviews(home, importId, [{ gymId: third, kind: 'match', candidates: [] }], NOW);

    const open = await store.openReviews(home);
    expect(open.map((item) => item.gymId)).toEqual([first, third, second]);
    expect(open[0]).toEqual({
      id: open[0]?.id,
      guildId: home,
      gymId: first,
      kind: 'missing',
      candidates: [CANDIDATE, STOP],
      gymPogoId: STOP.id,
      importId,
      createdAt: NOW,
      queuedAt: NOW,
      decision: null,
      decidedAt: null,
      decidedBy: null,
    });
    expect(await store.nextReview(home)).toEqual(open[0]);
    expect(await store.openCounts(home)).toEqual({ match: 1, missing: 1, unknown: 1 });
  });

  it('closes the open items of some gyms, and queues a gym anew afterwards', async () => {
    const { store, home, gyms } = await setup();
    const [first, second, third] = gyms;
    await store.saveReviews(
      home,
      null,
      [
        { gymId: first, kind: 'match', candidates: [CANDIDATE] },
        { gymId: second, kind: 'missing', candidates: [] },
      ],
      NOW,
    );
    const [item] = await store.openReviews(home);
    expect(await store.closeReviews(home, [first, third], 'resolved', null, NOW + 5)).toBe(1);
    expect(await store.closeReviews(home, [first], 'resolved', null, NOW + 6)).toBe(0);
    expect(await store.closeReviews(home, [], 'resolved', null, NOW + 6)).toBe(0);
    expect(await store.review(home, item?.id ?? 0)).toMatchObject({
      gymId: first,
      decision: 'resolved',
      decidedAt: NOW + 5,
      decidedBy: null,
    });
    expect((await store.openReviews(home)).map((open) => open.gymId)).toEqual([second]);

    await store.saveReviews(
      home,
      null,
      [{ gymId: first, kind: 'unknown', candidates: [] }],
      NOW + 9,
    );
    const again = await store.openReviews(home);
    expect(again.map((open) => open.gymId)).toEqual([second, first]);
    expect(again[1]?.id).not.toBe(item?.id);
    expect(again[1]).toMatchObject({ createdAt: NOW + 9, queuedAt: NOW + 9, kind: 'unknown' });
    expect(await store.review(home, item?.id ?? 0)).toMatchObject({ decision: 'resolved' });
  });

  it('decides an open item once, and skips one to the end of the queue', async () => {
    const { store, home, gyms } = await setup();
    const [first, second] = gyms;
    await store.saveReviews(
      home,
      null,
      [
        { gymId: first, kind: 'match', candidates: [CANDIDATE] },
        { gymId: second, kind: 'unknown', candidates: [] },
      ],
      NOW,
    );
    const [one, two] = await store.openReviews(home);
    if (!one || !two) throw new Error('two items were queued');

    expect(await store.skip(home, one.id, NOW + 1)).toBe(true);
    expect(await store.nextReview(home)).toMatchObject({ id: two.id });
    expect(await store.review(home, one.id)).toMatchObject({ queuedAt: NOW + 1, createdAt: NOW });

    expect(await store.decide(home, two.id, 'not-in-wayfarer', STAFF, NOW + 2)).toBe(true);
    expect(await store.decide(home, two.id, 'keep', OTHER_STAFF, NOW + 3)).toBe(false);
    expect(await store.skip(home, two.id, NOW + 4)).toBe(false);
    expect(await store.review(home, two.id)).toMatchObject({
      decision: 'not-in-wayfarer',
      decidedBy: STAFF,
      decidedAt: NOW + 2,
      queuedAt: NOW,
    });
    expect(await store.nextReview(home)).toMatchObject({ id: one.id });
    expect(await store.openCounts(home)).toEqual({ match: 1, missing: 0, unknown: 0 });

    expect(await store.decide(home, one.id, 'none-of-these', STAFF, NOW + 5)).toBe(true);
    expect(await store.nextReview(home)).toBeUndefined();
    expect(await store.openReviews(home)).toEqual([]);
    expect(await store.decide(home, 999_999, 'keep', STAFF, NOW)).toBe(false);
  });

  it('answers the newest decided item of each gym, of this server only', async () => {
    const { store, home, away, gyms } = await setup();
    const [first, second, third] = gyms;
    await store.saveReviews(home, null, [{ gymId: first, kind: 'match', candidates: [STOP] }], NOW);
    await store.closeReviews(home, [first], 'none-of-these', STAFF, NOW + 1);
    await store.saveReviews(
      home,
      null,
      [{ gymId: first, kind: 'missing', candidates: [CANDIDATE, STOP] }],
      NOW + 2,
    );
    await store.closeReviews(home, [first], 'keep', OTHER_STAFF, NOW + 3);
    // Open again: an open item is no decided one.
    await store.saveReviews(
      home,
      null,
      [{ gymId: first, kind: 'unknown', candidates: [] }],
      NOW + 4,
    );
    await store.saveReviews(home, null, [{ gymId: second, kind: 'unknown', candidates: [] }], NOW);
    await store.saveReviews(away, null, [{ gymId: third, kind: 'match', candidates: [] }], NOW);
    await store.closeReviews(away, [third], 'keep', STAFF, NOW + 1);

    const decided = await store.latestDecided(home, [first, second, third]);
    expect([...decided.keys()]).toEqual([first]);
    expect(decided.get(first)).toMatchObject({
      gymId: first,
      kind: 'missing',
      candidates: [CANDIDATE, STOP],
      decision: 'keep',
      decidedBy: OTHER_STAFF,
      decidedAt: NOW + 3,
    });
    expect(await store.latestDecided(home, [])).toEqual(new Map());
  });

  it("answers a server's own last answer, never another server's newer one (plan 19B-2)", async () => {
    const { store, home, away, gyms } = await setup();
    const [first, second] = gyms;
    await store.saveReviews(home, null, [{ gymId: first, kind: 'match', candidates: [STOP] }], NOW);
    await store.closeReviews(home, [first], 'keep', STAFF, NOW + 1);
    await store.saveReviews(
      away,
      null,
      [{ gymId: first, kind: 'match', candidates: [CANDIDATE] }],
      NOW + 2,
    );
    await store.closeReviews(away, [first], 'none-of-these', OTHER_STAFF, NOW + 3);
    await store.saveReviews(away, null, [{ gymId: second, kind: 'unknown', candidates: [] }], NOW);

    const decided = await store.latestDecided(home, [first, second]);
    expect([...decided.keys()]).toEqual([first]);
    expect(decided.get(first)).toMatchObject({
      guildId: home,
      candidates: [STOP],
      decision: 'keep',
    });
    expect([...(await store.latestDecided(away, [first, second])).keys()]).toEqual([first]);
  });

  it("keeps each server's items apart, also for one gym", async () => {
    const { store, home, away, gyms } = await setup();
    const [first] = gyms;
    await store.saveReviews(home, null, [{ gymId: first, kind: 'match', candidates: [] }], NOW);
    await store.saveReviews(away, null, [{ gymId: first, kind: 'missing', candidates: [] }], NOW);
    const [mine] = await store.openReviews(home);
    const [theirs] = await store.openReviews(away);
    if (!mine || !theirs) throw new Error('both servers have an item');
    expect(mine.kind).toBe('match');
    expect(theirs.kind).toBe('missing');

    expect(await store.review(home, theirs.id)).toBeUndefined();
    expect(await store.decide(home, theirs.id, 'keep', STAFF, NOW)).toBe(false);
    expect(await store.skip(home, theirs.id, NOW + 1)).toBe(false);
    expect(await store.closeReviews(home, [first], 'resolved', null, NOW)).toBe(1);
    expect(await store.openReviews(away)).toEqual([theirs]);
    expect(await store.openCounts(away)).toEqual({ match: 0, missing: 1, unknown: 0 });
  });

  it('passes over an item it cannot read, says so once, and counts it still', async () => {
    const { store, home, gyms, unreadable, spoilReview } = await setup();
    const [first, second, third] = gyms;
    await store.saveReviews(
      home,
      null,
      [
        { gymId: first, kind: 'match', candidates: [CANDIDATE] },
        { gymId: second, kind: 'match', candidates: [CANDIDATE] },
        { gymId: third, kind: 'unknown', candidates: [] },
      ],
      NOW,
    );
    const [one, two, three] = await store.openReviews(home);
    if (!one || !two || !three) throw new Error('three items were queued');
    await spoilReview(one.id, { candidates: [{ ...CANDIDATE, kind: 'portal' }] });
    await spoilReview(two.id, { kind: 'question' });

    expect(await store.nextReview(home)).toEqual(three);
    expect(await store.openReviews(home)).toEqual([three]);
    expect(await store.review(home, one.id)).toBeUndefined();
    expect(await store.openCounts(home)).toEqual({ match: 1, missing: 0, unknown: 1 });
    expect(unreadable).toEqual([
      { table: 'GymReview', id: one.id, problem: expect.stringContaining('candidates') as string },
      { table: 'GymReview', id: two.id, problem: 'kind "question"' },
    ]);

    // Queued again, the item is written anew and can be read.
    await store.saveReviews(home, null, [{ gymId: first, kind: 'missing', candidates: [] }], NOW);
    expect(await store.review(home, one.id)).toMatchObject({ kind: 'missing', candidates: [] });
  });
}
