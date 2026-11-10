import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { feedChoice, readRocketFeed, rocketChoicesOfFeed } from '../../../test/support/rocket.js';
import {
  isHideout,
  isLeaderOrGiovanni,
  lineupChoice,
  lineupFingerprint,
  parseRocketKey,
  parseRocketLineups,
  rocketKey,
  rocketName,
  typeKeyOf,
  type RocketWho,
} from './lineups.js';

const names = (key: string): string[] => feedChoice(key).catches.map((one) => one.name);

describe('parseRocketLineups', () => {
  it('makes one choice per grunt type, the untyped grunts, the decoy, the leaders and Giovanni', () => {
    const parsed = parseRocketLineups(readRocketFeed(), catalogueFixture());
    expect(parsed.skipped).toBe(0);
    expect(parsed.unknown).toEqual([]);
    expect(parsed.choices.map((choice) => choice.name)).toEqual([
      'Bug-type grunt',
      'Dark-type grunt',
      'Dragon-type grunt',
      'Electric-type grunt',
      'Fairy-type grunt',
      'Fighting-type grunt',
      'Fire-type grunt',
      'Flying-type grunt',
      'Ghost-type grunt',
      'Grass-type grunt',
      'Ground-type grunt',
      'Ice-type grunt',
      'Normal-type grunt',
      'Poison-type grunt',
      'Psychic-type grunt',
      'Rock-type grunt',
      'Steel-type grunt',
      'Water-type grunt',
      'Grunt (no type)',
      'Decoy grunt',
      'Cliff',
      'Arlo',
      'Sierra',
      'Giovanni',
    ]);
    expect(parsed.choices.map((choice) => choice.key).slice(-7)).toEqual([
      'grunt:water',
      'grunt:none',
      'decoy',
      'leader:cliff',
      'leader:arlo',
      'leader:sierra',
      'giovanni',
    ]);
  });

  it('takes the catchable Pokémon of every slot, a type of two lineups as their union', () => {
    // The female and the male water grunt: Magikarp once.
    expect(names('grunt:water')).toEqual(['Mudkip', 'Tentacool', 'Krabby', 'Magikarp', 'Feebas']);
    // Catches in the first and the second slot.
    expect(names('grunt:normal')).toEqual([
      'Teddiursa',
      'Hoothoot',
      'Porygon',
      'Loudred',
      'Stufful',
      'Starly',
    ]);
    expect(names('grunt:none')).toEqual([
      'Bulbasaur',
      'Charmander',
      'Squirtle',
      'Snorlax',
      'Lapras',
    ]);
    expect(names('decoy')).toEqual(['Bellsprout']);
    // Giovanni's is in the third slot.
    expect(names('giovanni')).toEqual(['Zekrom']);
    expect(names('leader:sierra')).toEqual(['Pancham']);
  });

  it('names each catch by the catalogue, a regional form by its own entry', () => {
    const [grimer] = feedChoice('leader:arlo').catches;
    const grimerEntry = catalogueFixture().byKey(grimer?.key ?? '');
    expect(grimer).toMatchObject({ name: 'Alolan Grimer', dex: 88, shiny: true });
    expect(grimerEntry?.form).not.toBeNull();
    expect(grimer?.image).toBe(
      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm88.fALOLA.icon.png',
    );
    const [zekrom] = feedChoice('giovanni').catches;
    expect(zekrom).toMatchObject({ name: 'Zekrom', key: 'zekrom', dex: 644, shiny: true });
  });

  it('skips and counts a lineup it cannot place, and says which Pokémon it does not know', () => {
    const feed = readRocketFeed() as Record<string, unknown>[];
    const odd = [
      ...feed,
      { name: 'Jessie', title: 'Team GO Rocket Leader', type: '', firstPokemon: [] },
      { name: 'Shadow-type Grunt', title: 'Team GO Rocket Grunt', type: 'shadow' },
      {
        name: 'Male Grunt',
        title: 'Team GO Rocket Grunt',
        type: '',
        firstPokemon: [{ name: 'Missingno', image: 'x', isEncounter: true, canBeShiny: false }],
      },
    ];
    const parsed = parseRocketLineups(odd, catalogueFixture());
    expect(parsed.skipped).toBe(2);
    expect(parsed.unknown).toEqual(['Missingno']);
    expect(parsed.choices.find((choice) => choice.key === 'grunt:none')?.catches.at(-1)).toEqual({
      name: 'Missingno',
      key: null,
      dex: null,
      shiny: false,
      image: null,
    });
  });

  it('throws for a feed of no lineup it can read, so a broken read never empties the list', () => {
    expect(() => parseRocketLineups([], catalogueFixture())).toThrow(/no lineup/);
    expect(() => parseRocketLineups({ lineups: [] }, catalogueFixture())).toThrow(/no lineup/);
    expect(() => parseRocketLineups([{ name: 'Jessie' }], catalogueFixture())).toThrow(/no lineup/);
  });

  it('shares the parse of the fixture', () => {
    expect(rocketChoicesOfFeed()).toHaveLength(24);
  });
});

describe('two lineups of one grunt type (plan 8R-4L)', () => {
  /** A grunt of the feed's shape: the first slot's names, catches marked by `*`. */
  const grunt = (name: string, type: string, first: string[]) => ({
    name,
    title: 'Team GO Rocket Grunt',
    type,
    firstPokemon: first.map((one) => ({
      name: one.replace('*', ''),
      image: '',
      isEncounter: one.endsWith('*'),
      canBeShiny: false,
    })),
  });
  const parse = (feed: unknown[]) => parseRocketLineups(feed, catalogueFixture()).choices;

  it('keeps both lineups of a type inside its choice, in the feed’s order, by gender', () => {
    const water = feedChoice('grunt:water');
    expect(water.lineups).toEqual([
      {
        lineup: 'female',
        first: ['Mudkip', 'Tentacool', 'Krabby'],
        catches: water.catches.slice(0, 3),
        fingerprint: expect.any(String) as string,
      },
      {
        lineup: 'male',
        first: ['Magikarp', 'Feebas'],
        catches: water.catches.slice(3),
        fingerprint: expect.any(String) as string,
      },
    ]);
    // The type's own catches stay the union.
    expect(names('grunt:water')).toEqual(['Mudkip', 'Tentacool', 'Krabby', 'Magikarp', 'Feebas']);
    expect(feedChoice('grunt:none').lineups?.map((one) => [one.lineup, one.first])).toEqual([
      ['male', ['Bulbasaur', 'Charmander', 'Squirtle']],
      ['female', ['Snorlax', 'Lapras']],
    ]);
    // A type of one lineup, and the decoy (a female grunt by the feed's name), have none.
    expect(feedChoice('grunt:fire').lineups).toBeUndefined();
    expect(feedChoice('decoy').lineups).toBeUndefined();
    expect(rocketChoicesOfFeed().filter((choice) => choice.lineups !== undefined)).toHaveLength(2);
  });

  it('gives a lineup a fingerprint of its first slot and catches, computed from the data', () => {
    const [female, male] = feedChoice('grunt:water').lineups ?? [];
    if (!female || !male) throw new Error('the water grunt has two lineups');
    expect(female.fingerprint).toBe(lineupFingerprint(female));
    expect(female.fingerprint).toMatch(/^[0-9a-z]{1,7}$/);
    expect(male.fingerprint).not.toBe(female.fingerprint);
    // Another catch, or another first slot, is another fingerprint.
    expect(lineupFingerprint({ ...male, catches: male.catches.slice(0, 1) })).not.toBe(
      male.fingerprint,
    );
    expect(lineupFingerprint({ ...male, first: ['Magikarp'] })).not.toBe(male.fingerprint);
  });

  it('gives the merged choice only where the two lineups cannot be told apart by gender or slot', () => {
    const same = parse([
      grunt('Fire-type Male Grunt', 'fire', ['Litwick*', 'Ponyta*']),
      grunt('Fire-type Female Grunt', 'fire', ['Litwick*', 'Ponyta*']),
    ]);
    expect(same[0]?.lineups).toBeUndefined();
    const genderless = parse([
      grunt('Fire-type Grunt', 'fire', ['Litwick*']),
      grunt('Fire-type Female Grunt', 'fire', ['Ponyta*']),
    ]);
    expect(genderless[0]?.lineups).toBeUndefined();
    expect(genderless[0]?.catches.map((one) => one.name)).toEqual(['Litwick', 'Ponyta']);
    const twice = parse([
      grunt('Fire-type Female Grunt', 'fire', ['Litwick*']),
      grunt('Fire-type Female Grunt', 'fire', ['Ponyta*']),
    ]);
    expect(twice[0]?.lineups).toBeUndefined();
    const three = parse([
      grunt('Fire-type Female Grunt', 'fire', ['Litwick*']),
      grunt('Fire-type Male Grunt', 'fire', ['Ponyta*']),
      grunt('Fire-type Male Grunt', 'fire', ['Torchic*']),
    ]);
    expect(three[0]?.lineups).toBeUndefined();
    // A lineup with an empty first slot cannot be told apart by it (L-2).
    const empty = parse([
      grunt('Fire-type Female Grunt', 'fire', ['Litwick*']),
      grunt('Fire-type Male Grunt', 'fire', []),
    ]);
    expect(empty[0]?.lineups).toBeUndefined();
    expect(empty[0]?.catches.map((one) => one.name)).toEqual(['Litwick']);
    // "Female" is read before "male", and only as a word.
    const words = parse([
      grunt('Fire-type FEMALE Grunt', 'fire', ['Litwick*']),
      grunt('Fire-type Male Grunt', 'fire', ['Ponyta*']),
    ]);
    expect(words[0]?.lineups?.map((one) => one.lineup)).toEqual(['female', 'male']);
    const glued = parse([
      grunt('Fire-type Femalegrunt', 'fire', ['Litwick*']),
      grunt('Fire-type Male Grunt', 'fire', ['Ponyta*']),
    ]);
    expect(glued[0]?.lineups).toBeUndefined();
  });

  it('takes a lineup as a choice of its own: its key, the type’s name, its catches and first slot', () => {
    const water = feedChoice('grunt:water');
    const [female, male] = water.lineups ?? [];
    if (!female || !male) throw new Error('the water grunt has two lineups');
    expect(lineupChoice(water, male)).toEqual({
      key: 'grunt:water:male',
      name: 'Water-type grunt',
      catches: male.catches,
      lineup: 'Magikarp, Feebas',
    });
    const untyped = feedChoice('grunt:none');
    const [, snorlax] = untyped.lineups ?? [];
    if (!snorlax) throw new Error('the untyped grunts have two lineups');
    expect(lineupChoice(untyped, snorlax)).toMatchObject({
      key: 'grunt:none:female',
      name: 'Grunt (no type)',
      lineup: 'Snorlax, Lapras',
    });
  });
});

describe('Rocket keys', () => {
  const every: RocketWho[] = [
    { kind: 'grunt', type: 'water' },
    { kind: 'grunt', type: null },
    { kind: 'decoy' },
    { kind: 'leader', leader: 'cliff' },
    { kind: 'giovanni' },
  ];

  it('spells each who as a key and reads it back', () => {
    expect(every.map(rocketKey)).toEqual([
      'grunt:water',
      'grunt:none',
      'decoy',
      'leader:cliff',
      'giovanni',
    ]);
    for (const who of every) expect(parseRocketKey(rocketKey(who))).toEqual(who);
    for (const text of ['grunt:shadow', 'grunt:', 'leader:jessie', 'leader:any', 'boss', 'Decoy']) {
      expect(parseRocketKey(text)).toBeUndefined();
    }
  });

  it('tells a leader or Giovanni from a grunt, a decoy and anything else (review W5)', () => {
    expect(every.map(rocketKey).filter(isLeaderOrGiovanni)).toEqual(['leader:cliff', 'giovanni']);
    for (const text of ['grunt:water:male', 'leader:jessie', 'leader:any', 'Giovanni', '']) {
      expect(isLeaderOrGiovanni(text)).toBe(false);
    }
  });

  it('spells a lineup of a grunt type with its gender, and reads nothing else in a third part', () => {
    const lineups: RocketWho[] = [
      { kind: 'grunt', type: 'electric', lineup: 'female' },
      { kind: 'grunt', type: null, lineup: 'male' },
    ];
    expect(lineups.map(rocketKey)).toEqual(['grunt:electric:female', 'grunt:none:male']);
    for (const who of lineups) expect(parseRocketKey(rocketKey(who))).toEqual(who);
    for (const text of [
      'grunt:water:other',
      'grunt:water:',
      'grunt:water:male:female',
      'leader:arlo:male',
      'decoy:female',
      'giovanni:male',
      'grunt:shadow:male',
    ]) {
      expect(parseRocketKey(text)).toBeUndefined();
    }
  });

  it('gives the type key of a lineup, and any other key as it is', () => {
    expect(typeKeyOf('grunt:water:male')).toBe('grunt:water');
    expect(typeKeyOf('grunt:none:female')).toBe('grunt:none');
    for (const key of ['grunt:water', 'grunt:none', 'decoy', 'leader:arlo', 'giovanni', 'x:y:z']) {
      expect(typeKeyOf(key)).toBe(key);
    }
  });

  it('names each who and tells hideouts from grunts', () => {
    expect(every.map(rocketName)).toEqual([
      'Water-type grunt',
      'Grunt (no type)',
      'Decoy grunt',
      'Cliff',
      'Giovanni',
    ]);
    expect(every.map(isHideout)).toEqual([false, false, true, true, true]);
  });
});
