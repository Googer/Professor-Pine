import { expect, it } from 'vitest';
import type { TargetWantStorage } from '../../src/db/repositories/target-want-repository.js';
import { boxTarget, type TargetWant } from '../../src/domain/notify/target-wants.js';

export const WANT_SERVER = '100000000000000011';
export const OTHER_WANT_SERVER = '100000000000000012';
export const ASH = '200000000000000041';
export const GARY = '200000000000000042';
export const WANTED_AT = Date.UTC(2026, 9, 21, 12);

export const DRATINI_RESEARCH = boxTarget('research-pokemon', 147);
export const ALOLAN_VULPIX_RESEARCH = boxTarget('research-pokemon', 37, 'vulpix_alola');
export const RARE_CANDY: TargetWant = { kind: 'research-item', item: 'rare-candy' };
export const CHARIZARD_ENERGY: TargetWant = { kind: 'research-energy', dex: 6 };
export const MACHAMP_DYNAMAX = boxTarget('dynamax', 68);
export const MACHAMP_GIGANTAMAX = boxTarget('gigantamax', 68);

/**
 * What the wants of `TargetWant` do, run against the repository and its twin in memory alike.
 * `made` gives a fresh, empty store.
 */
export function targetWantCases(made: () => Promise<TargetWantStorage>): void {
  it('adds targets once each, lists them in the order made, and counts them', async () => {
    const store = await made();
    await store.change(
      ASH,
      WANT_SERVER,
      { add: [DRATINI_RESEARCH, RARE_CANDY], remove: [] },
      WANTED_AT,
    );
    await store.change(
      ASH,
      WANT_SERVER,
      { add: [RARE_CANDY, MACHAMP_DYNAMAX], remove: [] },
      WANTED_AT + 1,
    );
    expect(await store.list(ASH, WANT_SERVER)).toEqual({
      wants: [DRATINI_RESEARCH, RARE_CANDY, MACHAMP_DYNAMAX],
      unreadable: 0,
    });
    expect(await store.count(ASH, WANT_SERVER)).toBe(3);
    expect(await store.list(ASH, OTHER_WANT_SERVER)).toEqual({ wants: [], unreadable: 0 });
    expect(await store.list(GARY, WANT_SERVER)).toEqual({ wants: [], unreadable: 0 });
  });

  it('reads only the targets asked for, and a species apart from its form', async () => {
    const store = await made();
    await store.change(
      ASH,
      WANT_SERVER,
      { add: [ALOLAN_VULPIX_RESEARCH, MACHAMP_GIGANTAMAX, CHARIZARD_ENERGY], remove: [] },
      WANTED_AT,
    );
    expect(
      await store.of(ASH, WANT_SERVER, [boxTarget('research-pokemon', 37), MACHAMP_GIGANTAMAX]),
    ).toEqual([MACHAMP_GIGANTAMAX]);
    expect(await store.of(ASH, WANT_SERVER, [])).toEqual([]);
    expect(await store.of(GARY, WANT_SERVER, [MACHAMP_GIGANTAMAX])).toEqual([]);
  });

  it('adds and removes in one change, and removing what is not there is no error', async () => {
    const store = await made();
    await store.change(
      ASH,
      WANT_SERVER,
      { add: [DRATINI_RESEARCH, MACHAMP_DYNAMAX], remove: [] },
      WANTED_AT,
    );
    // It says how many of those to remove were there (plan 8R-4, B8).
    expect(
      await store.change(
        ASH,
        WANT_SERVER,
        { add: [MACHAMP_GIGANTAMAX], remove: [MACHAMP_DYNAMAX, RARE_CANDY] },
        WANTED_AT,
      ),
    ).toBe(1);
    expect(await store.change(ASH, WANT_SERVER, { add: [], remove: [RARE_CANDY] }, WANTED_AT)).toBe(
      0,
    );
    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([
      DRATINI_RESEARCH,
      MACHAMP_GIGANTAMAX,
    ]);
  });

  it('removes one target, and all of a member in a server', async () => {
    const store = await made();
    await store.change(
      ASH,
      WANT_SERVER,
      { add: [DRATINI_RESEARCH, RARE_CANDY], remove: [] },
      WANTED_AT,
    );
    await store.change(ASH, OTHER_WANT_SERVER, { add: [RARE_CANDY], remove: [] }, WANTED_AT);
    expect(await store.remove(ASH, WANT_SERVER, RARE_CANDY)).toBe(true);
    expect(await store.remove(ASH, WANT_SERVER, RARE_CANDY)).toBe(false);
    expect(await store.remove(GARY, WANT_SERVER, RARE_CANDY)).toBe(false);
    expect(await store.removeAll(ASH, WANT_SERVER)).toBe(1);
    expect(await store.removeAll(ASH, WANT_SERVER)).toBe(0);
    expect((await store.list(ASH, OTHER_WANT_SERVER)).wants).toEqual([RARE_CANDY]);
  });

  it('keeps whether a Pokémon’s target is costumed, as a row’s own, apart from its token', async () => {
    const store = await made();
    const costumed = boxTarget('research-pokemon', 147, undefined, true);
    await store.change(ASH, WANT_SERVER, { add: [costumed, RARE_CANDY], remove: [] }, WANTED_AT);
    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([costumed, RARE_CANDY]);
    expect(await store.of(ASH, WANT_SERVER, [DRATINI_RESEARCH])).toEqual([costumed]);
    expect(await store.wanting(WANT_SERVER, [DRATINI_RESEARCH])).toEqual([
      { memberId: ASH, wants: [costumed] },
    ]);
    // Added again plain, the row is plain; removed by its token, whatever its costume.
    await store.change(ASH, WANT_SERVER, { add: [DRATINI_RESEARCH], remove: [] }, WANTED_AT);
    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([DRATINI_RESEARCH, RARE_CANDY]);
    await store.change(ASH, WANT_SERVER, { add: [costumed], remove: [] }, WANTED_AT);
    expect(await store.remove(ASH, WANT_SERVER, DRATINI_RESEARCH)).toBe(true);
    expect((await store.list(ASH, WANT_SERVER)).wants).toEqual([RARE_CANDY]);
  });

  it('finds who wants which of the targets in a server', async () => {
    const store = await made();
    await store.change(
      ASH,
      WANT_SERVER,
      { add: [DRATINI_RESEARCH, RARE_CANDY], remove: [] },
      WANTED_AT,
    );
    await store.change(GARY, WANT_SERVER, { add: [RARE_CANDY], remove: [] }, WANTED_AT);
    await store.change(GARY, OTHER_WANT_SERVER, { add: [DRATINI_RESEARCH], remove: [] }, WANTED_AT);
    const found = await store.wanting(WANT_SERVER, [
      DRATINI_RESEARCH,
      RARE_CANDY,
      CHARIZARD_ENERGY,
    ]);
    expect(found.sort((a, b) => a.memberId.localeCompare(b.memberId))).toEqual([
      { memberId: ASH, wants: [DRATINI_RESEARCH, RARE_CANDY] },
      { memberId: GARY, wants: [RARE_CANDY] },
    ]);
    expect(await store.wanting(WANT_SERVER, [])).toEqual([]);
  });
}
