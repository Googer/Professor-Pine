import { describe, expect, it } from 'vitest';
import type { GoogleBudget } from './google-line.js';
import { monthShares, serverFloor, withinFloors, type ShareNeed } from './google-shares.js';

/** 4,000 places searches above the reserve and 9,000 addresses a month. */
const BUDGET: GoogleBudget = { places: 4_500, reserve: 500, geocodes: 9_000, geocodesReserve: 500 };
const HOME = 1;
const AWAY = 2;
const THIRD = 3;

const needs = (...rows: [number, ShareNeed][]) => new Map(rows);
const shares = (
  of: Map<number, ShareNeed>,
  { max, raises = new Map() }: { max?: number; raises?: Map<number, number> } = {},
) => monthShares({ needs: of, budget: BUDGET, ...(max === undefined ? {} : { max }), raises });

describe('monthShares', () => {
  it('gives the one server that waits the whole month: a Pine of one server notices nothing', () => {
    expect(shares(needs([HOME, { places: 12_000, geocodes: 3_000 }]))).toEqual(
      new Map([[HOME, { places: 4_000, geocodes: 9_000 }]]),
    );
  });

  it('shares the month by need and leaves none of it unused: the half holds a server only so far as the others can use the rest', () => {
    const made = shares(
      needs(
        [HOME, { places: 10_000, geocodes: 900 }],
        [AWAY, { places: 600, geocodes: 100 }],
        [THIRD, { places: 400, geocodes: 0 }],
      ),
    );
    // Away and Third want their need and a tenth over it, 660 and 440; Home, whose 10,000 of
    // 11,000 would be 3,636, takes what they leave, 2,900, more than half the month.
    expect(made.get(HOME)?.places).toBe(2_900);
    expect(made.get(AWAY)?.places).toBe(660);
    expect(made.get(THIRD)?.places).toBe(440);
    expect([...made.values()].reduce((sum, share) => sum + share.places, 0)).toBe(4_000);
    // Of the addresses each wants less than its half: what is over goes to them by need.
    expect(made.get(HOME)?.geocodes).toBe(8_100);
    expect(made.get(AWAY)?.geocodes).toBe(900);
    expect(made.get(THIRD)?.geocodes).toBe(0);
  });

  it('holds a server to half the month while another wants the rest', () => {
    const made = shares(
      needs([HOME, { places: 9_000, geocodes: 0 }], [AWAY, { places: 3_000, geocodes: 0 }]),
    );
    expect(made.get(HOME)?.places).toBe(2_000);
    expect(made.get(AWAY)?.places).toBe(2_000);
  });

  it('counts what the line asked of each server this month: a share is of the whole month', () => {
    const made = monthShares({
      needs: needs([HOME, { places: 8_000, geocodes: 0 }], [AWAY, { places: 100, geocodes: 0 }]),
      used: new Map([
        [HOME, { places: 2_000, geocodes: 0 }],
        [AWAY, { places: 10, geocodes: 0 }],
      ]),
      budget: BUDGET,
      raises: new Map(),
    });
    // Away wants its 10, its 100 and 10 more; Home the rest of the month.
    expect(made.get(AWAY)?.places).toBe(120);
    expect(made.get(HOME)?.places).toBe(3_880);
  });

  it('holds every server to the fixed most, also the only one', () => {
    expect(shares(needs([HOME, { places: 100, geocodes: 100 }]), { max: 1_500 })).toEqual(
      new Map([[HOME, { places: 1_500, geocodes: 1_500 }]]),
    );
    const two = shares(
      needs([HOME, { places: 900, geocodes: 0 }], [AWAY, { places: 100, geocodes: 0 }]),
      { max: 1_500 },
    );
    expect(two.get(HOME)?.places).toBe(1_500);
    expect(two.get(AWAY)?.places).toBe(1_500);
  });

  it('gives a server with nothing waiting nothing, unless an operator raised its share', () => {
    const made = shares(
      needs([HOME, { places: 50, geocodes: 0 }], [AWAY, { places: 0, geocodes: 0 }]),
      { raises: new Map([[THIRD, 30]]) },
    );
    expect(made.get(HOME)).toEqual({ places: 4_000, geocodes: 0 });
    expect(made.get(AWAY)).toEqual({ places: 0, geocodes: 0 });
    expect(made.get(THIRD)).toEqual({ places: 30, geocodes: 30 });
  });

  it('adds an operator’s raise on top of the share, past the half and the most', () => {
    const made = shares(
      needs([HOME, { places: 9_000, geocodes: 0 }], [AWAY, { places: 1_000, geocodes: 0 }]),
      { max: 2_500, raises: new Map([[HOME, 700]]) },
    );
    // Away wants 1,100: Home could take 2,900 but for the most, 2,500.
    expect(made.get(HOME)?.places).toBe(3_200);
  });

  it('gives each server that waits at least one question, however small its part, out of what the parts leave (fix round 4, R5)', () => {
    const made = shares(
      needs(
        [HOME, { places: 3_000_000, geocodes: 0 }],
        [AWAY, { places: 3_000_000, geocodes: 0 }],
        [THIRD, { places: 1, geocodes: 0 }],
      ),
    );
    // Home and Away 1,999.9997 each, Third 0.0007: the two questions the parts leave go to
    // Third first, then to the largest remainder.
    expect(made.get(HOME)?.places).toBe(2_000);
    expect(made.get(AWAY)?.places).toBe(1_999);
    expect(made.get(THIRD)?.places).toBe(1);
  });

  it('shares out the month to the question, by the largest remainders (fix round 4, R5)', () => {
    const made = shares(
      needs(
        [HOME, { places: 1, geocodes: 1 }],
        [AWAY, { places: 1, geocodes: 1 }],
        [THIRD, { places: 1, geocodes: 1 }],
      ),
    );
    const of = (kind: 'places' | 'geocodes') => [...made.values()].map((share) => share[kind]);
    expect(of('places').toSorted((a, b) => a - b)).toEqual([1_333, 1_333, 1_334]);
    expect(of('geocodes').reduce((sum, n) => sum + n, 0)).toBe(9_000);
  });

  it('never gives the minimum past the month: a month shorter than the servers that wait', () => {
    const made = monthShares({
      needs: needs(
        [HOME, { places: 10, geocodes: 0 }],
        [AWAY, { places: 10, geocodes: 0 }],
        [THIRD, { places: 10, geocodes: 0 }],
      ),
      budget: { places: 3, reserve: 1, geocodes: 0, geocodesReserve: 0 },
      raises: new Map(),
    });
    expect([...made.values()].map((share) => share.places)).toEqual([1, 1, 0]);
  });

  it('shares out again only what the servers no longer waiting left of the month (fix round 4, R1)', () => {
    const made = monthShares({
      needs: needs([AWAY, { places: 2_000, geocodes: 0 }], [THIRD, { places: 2_000, geocodes: 0 }]),
      // Home used 3,500 of the 4,000 and waits for nothing now.
      used: new Map([[HOME, { places: 3_500, geocodes: 0 }]]),
      budget: BUDGET,
      raises: new Map(),
    });
    expect(made.get(AWAY)?.places).toBe(250);
    expect(made.get(THIRD)?.places).toBe(250);
    expect(made.has(HOME)).toBe(false);
  });

  it('shares a month without a budget as nothing', () => {
    const made = monthShares({
      needs: needs([HOME, { places: 10, geocodes: 10 }]),
      budget: { places: 0, reserve: 0, geocodes: 0, geocodesReserve: 0 },
      raises: new Map(),
    });
    expect(made.get(HOME)).toEqual({ places: 0, geocodes: 0 });
  });
});

describe('withinFloors', () => {
  /** Takes one of a cap of 10 for a server (or none) as long as it may; how many it took. */
  const takeAll = (
    used: Map<number, number>,
    guildId: number | undefined,
    { cap = 10, floor = 3, servers = [HOME, AWAY, THIRD] } = {},
  ) => {
    let taken = 0;
    for (;;) {
      const total = [...used.values()].reduce((sum, n) => sum + n, 0) + 1;
      const usedOf = (server: number) => (used.get(server) ?? 0) + (server === guildId ? 1 : 0);
      if (!withinFloors({ cap, floor, servers, usedOf, total, guildId })) return taken;
      if (guildId !== undefined) used.set(guildId, (used.get(guildId) ?? 0) + 1);
      else used.set(0, (used.get(0) ?? 0) + 1);
      taken++;
    }
  };

  it('leaves every other server its floor when one server takes all it may', () => {
    const used = new Map<number, number>();
    // Of 10, the floors of Away and Third are kept: Home takes 4.
    expect(takeAll(used, HOME)).toBe(4);
    expect(takeAll(used, AWAY)).toBe(3);
    expect(takeAll(used, THIRD)).toBe(3);
    expect(takeAll(used, HOME)).toBe(0);
  });

  it('gives a server under its floor one as long as the cap has any', () => {
    const used = new Map([[HOME, 9]]);
    // Home went past what the floors left before Away and Third came (a server new since).
    expect(takeAll(used, AWAY)).toBe(1);
  });

  it('scales the floors down where they add up to more than the cap', () => {
    const used = new Map<number, number>();
    // Four servers of 10, floors of 5: 2 each are kept.
    const servers = [HOME, AWAY, THIRD, 4];
    expect(takeAll(used, HOME, { floor: 5, servers })).toBe(4);
    expect(takeAll(used, AWAY, { floor: 5, servers })).toBe(2);
    expect(serverFloor(10, 5, 4)).toBe(2);
    expect(serverFloor(500, 20, 3)).toBe(20);
  });

  it('gives a Pine of one server the whole cap', () => {
    expect(takeAll(new Map(), HOME, { servers: [HOME] })).toBe(10);
    // A server Pine has not listed yet counts itself.
    expect(takeAll(new Map(), HOME, { servers: [] })).toBe(10);
  });

  it('gives what no server asks for only from what the floors leave', () => {
    expect(takeAll(new Map(), undefined)).toBe(1);
  });
});
