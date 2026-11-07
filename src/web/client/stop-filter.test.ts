import { describe, expect, it } from 'vitest';
import {
  caseGrunt,
  caseHideout,
  caseResearch,
  caseResearchOptions,
  caseRocketOptions,
  caseView,
} from './stop-report-cases.js';
import {
  FILTERS_KEY,
  FILTER_LEGENDS,
  filterChoices,
  filterWords,
  hiddenCount,
  NO_FILTERS,
  readFilters,
  shownBy,
  writeFilters,
} from './stop-filter.js';
import type { ViewStorage } from './view.js';

const CANDY = {
  kind: 'item' as const,
  name: 'Rare Candy',
  value: 'item:rare-candy',
  quantity: 3,
  shiny: false,
};
const spin = caseResearch(2, { rewards: [CANDY], rewardText: 'Rare Candy ×3' });
const oneOf = caseResearch(3, {
  rewards: [
    caseResearch(1).rewards[0]!,
    { ...CANDY, kind: 'encounter', name: 'Bagon', value: 'pokemon:bagon' },
  ],
});
const unknown = caseResearch(4, {
  rewards: [{ ...CANDY, kind: 'encounter', name: 'Missingno', value: null }],
});

describe('the filters of the reports at stops (plan 8M-9B, goal 5)', () => {
  it('shows research of a reward chosen, "one of" when any of its rewards is (B12)', () => {
    const filters = { research: ['pokemon:bagon'], rocket: [] };
    expect(shownBy(filters)(caseResearch(1), 'research')).toBe(false);
    expect(shownBy(filters)(oneOf, 'research')).toBe(true);
    expect(shownBy(filters)(spin, 'research')).toBe(false);
    // A reward the game data does not know is no choice: such a report is hidden by any filter.
    expect(shownBy(filters)(unknown, 'research')).toBe(false);
    // No filter: everything.
    expect(shownBy(NO_FILTERS)(unknown, 'research')).toBe(true);
    // A filter of the other layer changes nothing here.
    expect(shownBy({ research: [], rocket: ['grunt:fire'] })(spin, 'research')).toBe(true);
  });

  it('shows a grunt of a type chosen, its lineup by its type, a hideout by who, or by a catch', () => {
    const lineup = caseGrunt(1);
    const filters = { research: [], rocket: ['grunt:water', 'leader:sierra'] };
    expect(shownBy(filters)(lineup, 'rocket')).toBe(true);
    expect(
      shownBy(filters)(caseGrunt(2, { who: 'grunt:fire', typeKey: 'grunt:fire' }), 'rocket'),
    ).toBe(false);
    expect(shownBy(filters)(caseHideout(1), 'rocket')).toBe(false);
    expect(shownBy({ research: [], rocket: ['leader:arlo'] })(caseHideout(1), 'rocket')).toBe(true);
    // By a catch: Arlo's Mudkip.
    expect(shownBy({ research: [], rocket: ['pokemon:mudkip'] })(caseHideout(1), 'rocket')).toBe(
      true,
    );
  });

  it('counts what a filter hides, for the list’s group to say', () => {
    const view = caseView({ research: [caseResearch(1), spin, oneOf], grunts: [caseGrunt(1)] });
    expect(hiddenCount(view, { research: ['item:rare-candy'], rocket: [] }, 'research')).toBe(2);
    expect(hiddenCount(view, { research: ['item:rare-candy'], rocket: [] }, 'rocket')).toBe(0);
  });

  it('offers the rewards and who of today’s reports and of the pick lists, each once, by name', () => {
    const view = caseView({
      research: [spin, unknown],
      grunts: [caseGrunt(1)],
      hideouts: [caseHideout(1)],
    });
    const none = filterChoices(view, undefined, undefined);
    expect(none.research.map((one) => one.value)).toEqual(['item:rare-candy']);
    expect(none.rocket.map((one) => [one.value, one.name])).toEqual([
      ['grunt:water', 'Water-type grunt'],
      ['leader:arlo', 'Arlo'],
      ['pokemon:magikarp', 'Magikarp'],
      ['pokemon:mudkip', 'Mudkip'],
    ]);
    const lists = filterChoices(view, caseResearchOptions(), caseRocketOptions());
    expect(lists.research.map((one) => one.name)).toEqual(['Bagon', 'Dratini', 'Rare Candy']);
    expect(lists.rocket.map((one) => one.name)).toEqual([
      'Water-type grunt',
      'Fire-type grunt',
      'Arlo',
      'Giovanni',
      'Magikarp',
      'Mudkip',
    ]);
  });

  it('says a filter in sight: the one choice by name, else how many', () => {
    const names = new Map([['item:rare-candy', 'Rare Candy']]);
    expect(filterWords([], names)).toBeUndefined();
    expect(filterWords(['item:rare-candy'], names)).toBe('Rare Candy');
    expect(filterWords(['item:rare-candy', 'pokemon:bagon'], names)).toBe('2 filters');
    // One whose name the page has not (yet): one filter.
    expect(filterWords(['pokemon:bagon'], names)).toBe('1 filter');
  });

  it('heads each filter’s choices with what they keep', () => {
    expect(FILTER_LEGENDS.research).toBe('Show only research that gives');
    // Rocket's choices are who it is, then the Pokémon it gives (`filterChoices`).
    expect(FILTER_LEGENDS.rocket).toBe(
      'Show only Team GO Rocket of these kinds, or with these Pokémon to catch',
    );
  });

  it('keeps the filters per browser, nothing odd taken, and works where nothing can be kept', () => {
    const items = new Map<string, string>();
    const storage: ViewStorage = {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
      },
    };
    expect(readFilters(storage)).toEqual(NO_FILTERS);
    writeFilters(storage, { research: ['item:rare-candy'], rocket: [] });
    expect(readFilters(storage)).toEqual({ research: ['item:rare-candy'], rocket: [] });
    items.set(FILTERS_KEY, '{"research":"x","rocket":[1,"giovanni"]}');
    expect(readFilters(storage)).toEqual({ research: [], rocket: ['giovanni'] });
    const refusing: ViewStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readFilters(refusing)).toEqual(NO_FILTERS);
    expect(() => {
      writeFilters(refusing, NO_FILTERS);
    }).not.toThrow();
  });
});
