import { describe, expect, it } from 'vitest';
import { boxTarget } from '../notify/target-wants.js';
import { pokemonTarget, type Want } from './notification-target.js';
import { catalogueFixture } from '../../../test/support/game-data.js';
import {
  heldBoxes,
  pokemonBoxes,
  subjectOf,
  subjectOfTarget,
  targetReasonLabel,
  targetWantLabel,
  tierBoxes,
  type BoxFacts,
  type BoxSubject,
} from './want-boxes.js';

const DRATINI: BoxSubject = { kind: 'pokemon', dex: 147 };
const T5: BoxSubject = { kind: 'tier', level: 'T5' };

describe('the boxes of /want’s dialog', () => {
  it('reads what a member holds from both tables', () => {
    const wants: Want[] = [
      { target: pokemonTarget(147), scope: 'both' },
      { target: pokemonTarget(147, undefined, true), scope: 'raid' },
      { target: pokemonTarget(148), scope: 'raid' },
    ];
    expect([...heldBoxes(DRATINI, wants, [boxTarget('research-pokemon', 147)])].sort()).toEqual([
      'raids',
      'research',
      'shadow',
      'spawns',
    ]);
    // A form is a subject of its own: the species' rows are not its.
    expect([...heldBoxes({ kind: 'pokemon', dex: 147, form: 'dratini' }, wants, [])]).toEqual([]);
    const tiers: Want[] = [
      { target: { kind: 'tier', tier: { level: 'T5', shadow: true } }, scope: 'raid' },
    ];
    expect([...heldBoxes(T5, tiers, [])]).toEqual(['shadow-raids']);
  });

  it('shows only what can happen', () => {
    const facts = (overrides: Partial<BoxFacts>): BoxFacts => ({
      entries: [{ kind: 'species', shadow: false, key: 'x' }],
      wild: () => true,
      canDynamax: () => false,
      canGigantamax: () => false,
      dynamaxListed: false,
      gigantamaxListed: false,
      shadowBoss: false,
      ...overrides,
    });
    expect(pokemonBoxes(facts({}))).toEqual(['raids', 'spawns', 'research']);
    expect(
      pokemonBoxes(
        facts({
          entries: [{ kind: 'species', shadow: true, key: 'machamp' }],
          canDynamax: () => true,
          gigantamaxListed: true,
        }),
      ),
    ).toEqual(['raids', 'dynamax', 'gigantamax', 'spawns', 'research', 'shadow']);
    // A legendary: no spawns; a shadow raid boss now: Shadow.
    expect(pokemonBoxes(facts({ wild: () => false, shadowBoss: true }))).toEqual([
      'raids',
      'research',
      'shadow',
    ]);
    expect(pokemonBoxes(facts({ entries: [{ kind: 'mega', shadow: false, key: 'm' }] }))).toEqual([
      'raids',
    ]);
    // In today's Rocket lineups (plan 8R-2): Shadow, before the game master may have it.
    expect(pokemonBoxes(facts({ rocketCatch: true }))).toEqual([
      'raids',
      'spawns',
      'research',
      'shadow',
    ]);
    expect(tierBoxes('T5')).toEqual(['raids', 'shadow-raids']);
    expect(tierBoxes('Mega')).toEqual(['raids']);
  });

  it('names the Rocket targets, which have no boxes (plan 8R-2)', () => {
    const label = (who: string) => targetWantLabel(catalogueFixture(), { kind: 'rocket', who });
    expect(
      ['grunt:water', 'grunt:none', 'decoy', 'leader:arlo', 'leader:any', 'giovanni'].map(label),
    ).toEqual([
      'Water-type grunt',
      'Grunt (no type)',
      'Decoy grunt',
      'Arlo (Team GO Rocket leader)',
      'Any Team GO Rocket leader',
      'Giovanni (Team GO Rocket boss)',
    ]);
    expect(subjectOfTarget({ kind: 'rocket', who: 'giovanni' })).toBeUndefined();
  });

  it('names an item’s and Mega Energy’s reason in a DM as a Pokémon’s is, the rest as before (plan 8R-6)', () => {
    const reason = (want: Parameters<typeof targetReasonLabel>[1]) =>
      targetReasonLabel(catalogueFixture(), want);
    expect(reason({ kind: 'research-item', item: 'rare-candy' })).toBe('Rare Candy · Research');
    expect(reason({ kind: 'research-energy', dex: 6 })).toBe('Charizard Mega Energy · Research');
    expect(reason({ kind: 'rocket', who: 'leader:arlo' })).toBe('Arlo (Team GO Rocket leader)');
  });

  it('takes a shadow want for its Pokémon’s subject, and none of IVs', () => {
    expect(subjectOf(pokemonTarget(645, undefined, true))).toEqual({ kind: 'pokemon', dex: 645 });
    expect(subjectOf({ kind: 'tier', tier: { level: 'T5', shadow: true } })).toEqual(T5);
    expect(subjectOf({ kind: 'iv', iv: 'perfect' })).toBeUndefined();
  });
});
