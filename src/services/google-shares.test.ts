import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { OUT_OF_SHARE_RANK, type GoogleBudget } from '../domain/geo/google-line.js';
import { GoogleShares, MemoryGoogleShareRaises } from './google-shares.js';
import { MemoryGoogleUse } from './google-use.js';

const HOME = 1;
const AWAY = 2;
/** Noon in California on October 16. */
const OCTOBER = new Date('2026-10-16T12:00:00-07:00').getTime();
/** Ten places searches above the reserve and ten addresses a month. */
const BUDGET: GoogleBudget = { places: 12, reserve: 2, geocodes: 10, geocodesReserve: 0 };

function sharesOver(use = new MemoryGoogleUse()) {
  const { log } = createTestLogger();
  const told: number[] = [];
  const shares = new GoogleShares({
    budget: BUDGET,
    use,
    raises: new MemoryGoogleShareRaises(),
    tellServer: (guildId) => told.push(guildId),
    log,
    now: () => OCTOBER,
  });
  return { shares, use, told };
}

describe('GoogleShares (plan 19B-5)', () => {
  it('never holds a server out of a kind it had nothing of waiting (fix round 3, T1)', async () => {
    const { shares, told } = sharesOver();
    // Away waited for places alone: it has no share of addresses, and is not out of them.
    await shares.refresh(
      new Map([
        [HOME, { places: 30, geocodes: 30 }],
        [AWAY, { places: 3, geocodes: 0 }],
      ]),
    );
    expect(shares.outOfShare().geocodes.has(AWAY)).toBe(false);
    expect(shares.rank(AWAY, true, 0)).toBe(0);
    // A gym of Away's that wants its address is one the shares do not know: worked out anew.
    expect(shares.knows(AWAY, true)).toBe(false);
    expect(told).toEqual([]);
  });

  it('knows a server only for as much as waited of it: once that is asked, it is out of nothing and told nothing', async () => {
    const { shares, told } = sharesOver();
    await shares.refresh(
      new Map([
        [HOME, { places: 30, geocodes: 0 }],
        [AWAY, { places: 1, geocodes: 0 }],
      ]),
    );
    expect(shares.of(AWAY)?.share.places).toBe(1);
    expect(shares.knows(AWAY, false)).toBe(true);
    // Its one row asked: its share is used, but nothing of it waits.
    expect(shares.counted(AWAY, 'places')).toBe(false);
    expect(shares.outOfShare().places.has(AWAY)).toBe(false);
    expect(shares.rank(AWAY, false, 0)).toBe(0);
    // A row of it that comes now is one to work the shares out for.
    expect(shares.knows(AWAY, false)).toBe(false);
    expect(told).toEqual([]);
  });

  it('holds a server out of its share while rows of it wait, and tells its staff', async () => {
    const { shares, told } = sharesOver();
    await shares.refresh(
      new Map([
        [HOME, { places: 30, geocodes: 0 }],
        [AWAY, { places: 6, geocodes: 0 }],
      ]),
    );
    // Each wants more than half the month: each has its half.
    expect(shares.of(HOME)?.share.places).toBe(5);
    for (let n = 0; n < 4; n++) expect(shares.counted(HOME, 'places')).toBe(false);
    expect(shares.counted(HOME, 'places')).toBe(true);
    expect(shares.rank(HOME, false, 0)).toBe(OUT_OF_SHARE_RANK);
    expect(told).toEqual([HOME]);
  });

  it('tells no server whose share was the whole month: the owner’s alert says the month is used (fix round 4, R2)', async () => {
    const { shares, told } = sharesOver();
    // Home alone waits: its share is the whole month of each kind.
    await shares.refresh(new Map([[HOME, { places: 30, geocodes: 30 }]]));
    expect(shares.of(HOME)?.share).toEqual({ places: 10, geocodes: 10 });
    for (let n = 0; n < 9; n++) expect(shares.counted(HOME, 'places')).toBe(false);
    expect(shares.counted(HOME, 'places')).toBe(true);
    for (let n = 0; n < 9; n++) expect(shares.counted(HOME, 'geocode')).toBe(false);
    expect(shares.counted(HOME, 'geocode')).toBe(true);
    // Held all the same, as the line is.
    expect(shares.rank(HOME, true, 0)).toBe(OUT_OF_SHARE_RANK);
    expect(told).toEqual([]);
  });
});
