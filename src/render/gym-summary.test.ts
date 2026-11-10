import { describe, expect, it } from 'vitest';
import { textOf } from '../../test/support/messages.js';
import { addChanges, gymListSummary, NO_CHANGES } from './gym-summary.js';
import { GYM_COLOUR } from './gym-view.js';

interface Kind {
  added: number;
  changed: number;
  gone: number;
}

/** Changes of the PokéStops and power spots alone. */
const wayspots = (stops: Partial<Kind>, powerSpots: Partial<Kind> = {}) => ({
  ...NO_CHANGES,
  wayspots: {
    stops: { added: 0, changed: 0, gone: 0, ...stops },
    powerSpots: { added: 0, changed: 0, gone: 0, ...powerSpots },
  },
});

describe('gymListSummary', () => {
  it('says what changed in one sentence, without its source, the first count with its noun', () => {
    const message = gymListSummary({ ...NO_CHANGES, added: 2_596, renamed: 169, moved: 109 });
    expect(textOf(message)).toBe(
      '### The gym list changed\nProfessor Pine has added 2,596 gyms, renamed 169, and moved 109.',
    );
    expect(message?.v2).toBe(true);
    expect(message?.components[0]).toMatchObject({ accent_color: GYM_COLOUR });
  });

  it('puts the serial comma before the last of three, none between two, and one gym as one', () => {
    expect(textOf(gymListSummary({ ...NO_CHANGES, deleted: 1 }))).toBe(
      '### The gym list changed\nProfessor Pine has deleted 1 gym.',
    );
    expect(textOf(gymListSummary({ ...NO_CHANGES, added: 2, moved: 1 }))).toBe(
      '### The gym list changed\nProfessor Pine has added 2 gyms and moved 1.',
    );
    expect(
      textOf(gymListSummary({ ...NO_CHANGES, added: 1, renamed: 2, moved: 3, deleted: 4 })),
    ).toBe(
      '### The gym list changed\nProfessor Pine has added 1 gym, renamed 2, moved 3, and deleted 4.',
    );
  });

  it('says how many of the gyms added were PokéStops', () => {
    expect(textOf(gymListSummary({ ...NO_CHANGES, added: 12, promoted: 3, moved: 2 }))).toBe(
      '### The gym list changed\nProfessor Pine has added 12 gyms (3 of them were PokéStops) and ' +
        'moved 2.',
    );
    expect(textOf(gymListSummary({ ...NO_CHANGES, added: 1, promoted: 1 }))).toBe(
      '### The gym list changed\nProfessor Pine has added 1 gym (it was a PokéStop).',
    );
  });

  it('says what changed of the PokéStops and Power Spots in a second sentence, each by its kind', () => {
    expect(
      textOf(
        gymListSummary({
          ...wayspots({ added: 120, changed: 4 }, { added: 3, gone: 2 }),
          added: 30,
          renamed: 1,
          moved: 1,
        }),
      ),
    ).toBe(
      '### The gym list changed\nProfessor Pine has added 30 gyms, renamed 1, and moved 1. It ' +
        'also added 120 PokéStops and 3 Power Spots, changed 4 PokéStops, and removed 2 Power ' +
        'Spots.',
    );
    expect(
      textOf(gymListSummary({ ...wayspots({ gone: 1 }, { changed: 1, gone: 2 }), deleted: 2_000 })),
    ).toBe(
      '### The gym list changed\nProfessor Pine has deleted 2,000 gyms. It also changed 1 Power ' +
        'Spot and removed 1 PokéStop and 2 Power Spots.',
    );
  });

  it('says nothing when no gym changed, however many PokéStops and Power Spots did (8W-3)', () => {
    expect(gymListSummary(wayspots({ added: 1_500 }, { added: 1 }))).toBeUndefined();
  });

  it('says nothing of nothing, and adds counts up', () => {
    expect(gymListSummary(NO_CHANGES)).toBeUndefined();
    expect(
      addChanges(
        {
          ...wayspots({ added: 1, changed: 2 }, { gone: 3 }),
          added: 1,
          promoted: 1,
          renamed: 2,
          moved: 3,
          deleted: 4,
        },
        { ...wayspots({ added: 10 }, { gone: 1, added: 5 }), moved: 1 },
      ),
    ).toEqual({
      added: 1,
      promoted: 1,
      renamed: 2,
      moved: 4,
      deleted: 4,
      wayspots: {
        stops: { added: 11, changed: 2, gone: 0 },
        powerSpots: { added: 5, changed: 0, gone: 4 },
      },
    });
  });
});
