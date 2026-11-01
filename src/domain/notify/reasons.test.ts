import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import {
  pokemonTarget,
  type NotificationScope,
  type NotificationTarget,
  type Want,
} from '../pogo/notification-target.js';
import type { RaidLevel } from '../pogo/raid-tier.js';
import { boxTarget, type TargetWant } from './target-wants.js';
import type { TaskReward } from '../research/task.js';
import {
  rocketShadowFiring,
  rocketShadowNumbers,
  rocketTargets,
  rocketWantsFiring,
  maxTargets,
  maxWantsFiring,
  researchTargets,
  researchWantsFiring,
  parseStopArgs,
  raidNumbers,
  raidWantsFiring,
  reasonKey,
  spawnNumbers,
  spawnWantsFiring,
  stopArgs,
  type NotifyReason,
  type RaidSighting,
} from './reasons.js';

const catalogue = catalogueFixture();
const entryOf = (key: string): { dex: number; key: string } => {
  const entry = catalogue.byKey(key);
  if (!entry) throw new Error(`the fixture has no ${key}`);
  return { dex: entry.dex, key: entry.key };
};
const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});
const want = (target: NotificationTarget, scope: NotificationScope = 'raid'): Want => ({
  target,
  scope,
});
const raid = (level: RaidLevel, boss?: string, shadow = false, costumed = false): RaidSighting => ({
  tier: { level, shadow },
  boss: boss === undefined ? undefined : { ...entryOf(boss), costumed },
});
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
const ZERO: NotificationTarget = { kind: 'iv', iv: 'zero' };

describe('raidNumbers', () => {
  it('names the boss and the tier, and the tier alone for an egg or an unknown boss', () => {
    expect(raidNumbers(raid('T5', 'giratina_origin'))).toEqual([487, -5]);
    expect(raidNumbers(raid('T5'))).toEqual([-5]);
    expect(raidNumbers(raid('T5', 'giratina_origin', true))).toEqual([487, -35]);
    expect(raidNumbers(raid('Elite', 'mewtwo'))).toEqual([150, -20]);
    expect(raidNumbers(raid('MegaLegendary'))).toEqual([-6]);
  });

  it('does not throw for a tier without a code', () => {
    expect(raidNumbers({ tier: { level: 'Mega', shadow: true }, boss: undefined })).toEqual([]);
  });
});

describe('raidWantsFiring', () => {
  const firing = (wants: Want[], sighting: RaidSighting) =>
    raidWantsFiring(catalogue, wants, sighting).map((fired) => fired.target);

  it('fires a want for the species in any form, and a want for one form only for that form', () => {
    const species = pokemonTarget(487);
    const origin = pokemonTarget(487, 'giratina_origin');
    const altered = pokemonTarget(487, 'giratina_altered');
    const wants = [want(species), want(origin), want(altered, 'both')];
    expect(firing(wants, raid('T5', 'giratina_origin'))).toEqual([species, origin]);
    expect(firing(wants, raid('T5', 'giratina_altered'))).toEqual([species, altered]);
    expect(firing(wants, raid('T5', 'yveltal'))).toEqual([]);
  });

  it('fires a want for a species for its mega too, and a want for a mega for that mega', () => {
    const species = pokemonTarget(6);
    const megaY = pokemonTarget(6, 'charizard_mega_y');
    expect(firing([want(species), want(megaY)], raid('Mega', 'charizard_mega_y'))).toEqual([
      species,
      megaY,
    ]);
    expect(firing([want(species), want(megaY)], raid('Mega', 'charizard_mega_x'))).toEqual([
      species,
    ]);
  });

  it('fires a want for shadow raids only for a shadow raid, and a plain want for both', () => {
    const plain = pokemonTarget(487);
    const shadow = pokemonTarget(487, undefined, true);
    expect(firing([want(plain), want(shadow)], raid('T5', 'giratina_origin'))).toEqual([plain]);
    expect(firing([want(plain), want(shadow)], raid('T5', 'giratina_origin', true))).toEqual([
      plain,
      shadow,
    ]);
  });

  it('never fires a want that is for spawns alone', () => {
    expect(firing([want(pokemonTarget(487), 'spawn')], raid('T5', 'giratina_origin'))).toEqual([]);
    expect(firing([want(pokemonTarget(487), 'both')], raid('T5', 'giratina_origin'))).toEqual([
      pokemonTarget(487),
    ]);
  });

  it('fires a tier want for that very tier: T5 for ordinary tier 5, shadow T5 for shadow ones', () => {
    const wants = [want(tier('T5')), want(tier('T5', true)), want(tier('T3'))];
    expect(firing(wants, raid('T5'))).toEqual([tier('T5')]);
    expect(firing(wants, raid('T5', undefined, true))).toEqual([tier('T5', true)]);
    expect(firing(wants, raid('T5', 'yveltal'))).toEqual([tier('T5')]);
    expect(firing(wants, raid('T1'))).toEqual([]);
  });

  it('fires only the tier for an egg and for a boss the game data does not know', () => {
    const wants = [want(pokemonTarget(717)), want(tier('T5'))];
    expect(firing(wants, raid('T5'))).toEqual([tier('T5')]);
    expect(firing(wants, raid('T5', 'yveltal'))).toEqual([pokemonTarget(717), tier('T5')]);
  });

  it('treats elite and mega legendary raids like any other', () => {
    expect(firing([want(tier('Elite'))], raid('Elite', 'mewtwo'))).toEqual([tier('Elite')]);
    expect(firing([want(tier('Elite'))], raid('Elite'))).toEqual([tier('Elite')]);
    expect(firing([want(pokemonTarget(150))], raid('Elite', 'mewtwo'))).toEqual([
      pokemonTarget(150),
    ]);
  });

  it('never fires an IV want, also not the one stored under the number of a tier', () => {
    expect(firing([want(PERFECT, 'spawn'), want(ZERO, 'spawn')], raid('MegaLegendary'))).toEqual(
      [],
    );
    expect(firing([want(tier('MegaLegendary'))], raid('MegaLegendary'))).toEqual([
      tier('MegaLegendary'),
    ]);
  });
});

describe('spawnWantsFiring', () => {
  const spawned = (key: string) => ({ ...entryOf(key), costumed: false });
  const firing = (wants: Want[], key: string, iv?: 'perfect' | 'zero') =>
    spawnWantsFiring(catalogue, wants, { pokemon: spawned(key), iv }).map((fired) => fired.target);

  it('names the Pokédex number, and the IV code when the report says so', () => {
    expect(spawnNumbers({ pokemon: spawned('dratini') })).toEqual([147]);
    expect(spawnNumbers({ pokemon: spawned('dratini'), iv: 'perfect' })).toEqual([147, -6]);
    expect(spawnNumbers({ pokemon: spawned('dratini'), iv: 'zero' })).toEqual([147, -8]);
  });

  it('fires wants for the Pokémon in the wild, never those for raids alone', () => {
    const dratini = pokemonTarget(147);
    expect(firing([want(dratini, 'spawn')], 'dratini')).toEqual([dratini]);
    expect(firing([want(dratini, 'both')], 'dratini')).toEqual([dratini]);
    expect(firing([want(dratini, 'raid')], 'dratini')).toEqual([]);
    expect(firing([want(pokemonTarget(147, undefined, true), 'raid')], 'dratini')).toEqual([]);
    expect(firing([want(tier('T1'))], 'dratini')).toEqual([]);
  });

  it('fires a want for one form only for that form', () => {
    const alolan = pokemonTarget(19, 'rattata_alola');
    const species = pokemonTarget(19);
    const wants = [want(alolan, 'spawn'), want(species, 'both')];
    expect(firing(wants, 'rattata_alola')).toEqual([alolan, species]);
    expect(firing(wants, 'rattata')).toEqual([species]);
  });

  it('fires the IV want the report names, and none without', () => {
    const wants = [want(PERFECT, 'spawn'), want(ZERO, 'spawn'), want(pokemonTarget(147), 'spawn')];
    expect(firing(wants, 'dratini')).toEqual([pokemonTarget(147)]);
    expect(firing(wants, 'dratini', 'perfect')).toEqual([PERFECT, pokemonTarget(147)]);
    expect(firing(wants, 'rattata', 'zero')).toEqual([ZERO]);
  });
});

describe('maxWantsFiring (plan 8X-3; its boxes since plan 8R-1)', () => {
  it('fires the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one', () => {
    const machamp = entryOf('machamp');
    const wants = [
      boxTarget('dynamax', 68),
      boxTarget('gigantamax', 68),
      boxTarget('dynamax', 68, 'machamp'),
      boxTarget('research-pokemon', 68),
      boxTarget('dynamax', 66),
    ];
    expect(maxWantsFiring(catalogue, wants, machamp, 'dynamax')).toEqual([
      boxTarget('dynamax', 68),
      boxTarget('dynamax', 68, 'machamp'),
    ]);
    expect(maxWantsFiring(catalogue, wants, machamp, 'gigantamax')).toEqual([
      boxTarget('gigantamax', 68),
    ]);
    expect(maxWantsFiring(catalogue, wants, undefined, 'dynamax')).toEqual([]);
  });

  it('asks for the box of the species and of the boss’s own entry', () => {
    expect(maxTargets(entryOf('machamp'), 'gigantamax')).toEqual([
      boxTarget('gigantamax', 68),
      boxTarget('gigantamax', 68, 'machamp'),
    ]);
  });
});

describe('researchWantsFiring (plan 8R-1)', () => {
  const dratini = entryOf('dratini');
  const rewards: TaskReward[] = [
    {
      kind: 'encounter',
      name: 'Dratini',
      key: dratini?.key ?? null,
      dex: 147,
      shiny: true,
      cp: null,
      image: null,
    },
    { kind: 'item', item: 'rare-candy', name: 'Rare Candy', quantity: 3, image: null },
    { kind: 'energy', dex: 6, name: 'Charizard Mega Energy', quantity: 10, image: null },
    {
      kind: 'encounter',
      name: 'Unknown',
      key: null,
      dex: null,
      shiny: false,
      cp: null,
      image: null,
    },
  ];

  it('asks for the research targets a task’s rewards may be wanted under', () => {
    expect(researchTargets(rewards)).toEqual([
      boxTarget('research-pokemon', 147),
      boxTarget('research-pokemon', 147, 'dratini'),
      { kind: 'research-item', item: 'rare-candy' },
      { kind: 'research-energy', dex: 6 },
    ]);
  });

  it('fires a research want of a reward the task may give, never another box', () => {
    const wants = [
      boxTarget('research-pokemon', 147),
      boxTarget('dynamax', 147),
      { kind: 'research-item', item: 'rare-candy' } as const,
      { kind: 'research-item', item: 'stardust' } as const,
      { kind: 'research-energy', dex: 6 } as const,
      { kind: 'research-energy', dex: 3 } as const,
      boxTarget('research-pokemon', 148),
    ];
    expect(researchWantsFiring(catalogue, wants, rewards)).toEqual([
      boxTarget('research-pokemon', 147),
      { kind: 'research-item', item: 'rare-candy' },
      { kind: 'research-energy', dex: 6 },
    ]);
  });
});

describe('Rocket wants (plan 8R-2)', () => {
  it('fires the who of a report, and any leader for a leader', () => {
    const wants: TargetWant[] = [
      { kind: 'rocket', who: 'grunt:water' },
      { kind: 'rocket', who: 'leader:any' },
      { kind: 'rocket', who: 'leader:arlo' },
      boxTarget('research-pokemon', 258),
    ];
    expect(rocketWantsFiring(wants, 'grunt:water')).toEqual([wants[0]]);
    expect(rocketWantsFiring(wants, 'leader:arlo')).toEqual([wants[1], wants[2]]);
    expect(rocketWantsFiring(wants, 'leader:cliff')).toEqual([wants[1]]);
    expect(rocketWantsFiring(wants, 'giovanni')).toEqual([]);
    // A lineup's report is wanted by its grunt type (plan 8R-4L).
    expect(rocketWantsFiring(wants, 'grunt:water:male')).toEqual([wants[0]]);
    expect(rocketTargets('grunt:water:female')).toEqual([{ kind: 'rocket', who: 'grunt:water' }]);
    expect(rocketTargets('leader:sierra')).toEqual([
      { kind: 'rocket', who: 'leader:sierra' },
      { kind: 'rocket', who: 'leader:any' },
    ]);
  });

  it('fires a shadow want of a catch, the species or the very form, nothing else', () => {
    const grimer = entryOf('grimer_alola');
    const catches = [grimer, { dex: null, key: null }];
    expect(rocketShadowNumbers(catches)).toEqual([88]);
    const shadowSpecies = want(pokemonTarget(88, undefined, true), 'raid');
    const shadowForm = want(pokemonTarget(88, 'grimer_alola', true), 'raid');
    const shadowOther = want(pokemonTarget(88, 'grimer', true), 'raid');
    const plainWant = want(pokemonTarget(88), 'both');
    expect(
      rocketShadowFiring(catalogue, [shadowSpecies, shadowForm, shadowOther, plainWant], catches),
    ).toEqual([shadowSpecies, shadowForm]);
  });
});

describe('costumed wants (plan 8R-4)', () => {
  const costumed = (target: NotificationTarget, scope: NotificationScope = 'both'): Want => ({
    target,
    scope,
    costumed: true,
  });
  const PIKACHU = pokemonTarget(25);
  const GALARIAN_CORSOLA = pokemonTarget(222, 'corsola_galarian');

  it('fires a costumed want only for a costumed boss, a plain want for either, and says which', () => {
    const plainWant = want(PIKACHU);
    const costumedWant = costumed(PIKACHU);
    const wants = [plainWant, costumedWant];
    expect(raidWantsFiring(catalogue, wants, raid('T1', 'pikachu'))).toEqual([plainWant]);
    expect(raidWantsFiring(catalogue, wants, raid('T1', 'pikachu', false, true))).toEqual([
      plainWant,
      costumedWant,
    ]);
    // An egg has no boss to be costumed; a tier want is no Pokémon's.
    expect(raidWantsFiring(catalogue, [costumedWant], raid('T1'))).toEqual([]);
  });

  it('matches a costume under the form it copies: Galarian Corsola’s, not Corsola’s', () => {
    const wants = [costumed(GALARIAN_CORSOLA), costumed(pokemonTarget(222, 'corsola'))];
    expect(
      raidWantsFiring(catalogue, wants, raid('T3', 'corsola_galarian', false, true)).map(
        (fired) => fired.target,
      ),
    ).toEqual([GALARIAN_CORSOLA]);
    // A costumed want of every form fits a costume of any of them.
    expect(
      raidWantsFiring(
        catalogue,
        [costumed(pokemonTarget(222))],
        raid('T3', 'corsola_galarian', false, true),
      ),
    ).toHaveLength(1);
  });

  it('fires a costumed want of the whole species for a mega as a plain want (Matt’s ruling 4)', () => {
    const species = costumed(pokemonTarget(6), 'raid');
    // A mega is never costumed: the species row's Costumed leaves it as a plain want would.
    expect(raidWantsFiring(catalogue, [species], raid('Mega', 'charizard_mega_x'))).toEqual([
      species,
    ]);
    expect(raidWantsFiring(catalogue, [species], raid('Mega', 'groudon_primal'))).toEqual([]);
    expect(
      raidWantsFiring(
        catalogue,
        [costumed(pokemonTarget(383), 'raid')],
        raid('Mega', 'groudon_primal'),
      ),
    ).toHaveLength(1);
    // A plain Charizard raid still needs the costume.
    expect(raidWantsFiring(catalogue, [species], raid('T3', 'charizard'))).toEqual([]);
    expect(raidWantsFiring(catalogue, [species], raid('T3', 'charizard', false, true))).toEqual([
      species,
    ]);
    // A costumed want of the plain form is no mega's.
    const plainForm = costumed(pokemonTarget(6, 'charizard'), 'raid');
    expect(raidWantsFiring(catalogue, [plainForm], raid('Mega', 'charizard_mega_x'))).toEqual([]);
  });

  it('fires a costumed spawn want only for a costumed spawn', () => {
    const wants = [want(PIKACHU, 'spawn'), costumed(PIKACHU, 'spawn')];
    const spawn = (isCostumed: boolean) =>
      spawnWantsFiring(catalogue, wants, {
        pokemon: { ...entryOf('pikachu'), costumed: isCostumed },
      });
    expect(spawn(false)).toEqual([wants[0]]);
    expect(spawn(true)).toEqual(wants);
  });

  it('tells a costumed research reward by its name and picture, read anew', () => {
    const reward = (name: string, image: string | null): TaskReward => ({
      kind: 'encounter',
      name,
      key: 'pikachu',
      dex: 25,
      shiny: false,
      cp: null,
      image,
    });
    const plainWant = boxTarget('research-pokemon', 25);
    const costumedWant: TargetWant = boxTarget('research-pokemon', 25, undefined, true);
    const wants = [plainWant, costumedWant];
    const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons/';
    expect(
      researchWantsFiring(catalogue, wants, [reward('Pikachu', `${ICONS}pm25.icon.png`)]),
    ).toEqual([plainWant]);
    expect(
      researchWantsFiring(catalogue, wants, [
        reward('Pikachu wearing a Cosmog suit', `${ICONS}pm25.fPXP_2026.icon.png`),
      ]),
    ).toEqual(wants);
    // A reward a member typed has no picture and the game data's name: never costumed.
    expect(researchWantsFiring(catalogue, [costumedWant], [reward('Pikachu', null)])).toEqual([]);
  });

  it('never fires a costumed want of a max battle or a Rocket catch: none is costumed so far', () => {
    const machamp = entryOf('machamp');
    const costumedDynamax: TargetWant = boxTarget('dynamax', 68, undefined, true);
    expect(maxWantsFiring(catalogue, [costumedDynamax], machamp, 'dynamax')).toEqual([]);
    const shadow = costumed(pokemonTarget(88, undefined, true), 'raid');
    expect(rocketShadowFiring(catalogue, [shadow], [entryOf('grimer_alola')])).toEqual([]);
  });
});

describe('reasonKey', () => {
  it('is one text per reason, different for different reasons', () => {
    const keys = [
      reasonKey({ kind: 'want', target: pokemonTarget(487) }),
      reasonKey({ kind: 'want', target: pokemonTarget(487, 'giratina_origin') }),
      reasonKey({ kind: 'want', target: pokemonTarget(487, undefined, true) }),
      reasonKey({ kind: 'want', target: tier('T5') }),
      reasonKey({ kind: 'want', target: tier('T5', true) }),
      reasonKey({ kind: 'want', target: PERFECT }),
      reasonKey({ kind: 'gym', gymId: 4 }),
      reasonKey({ kind: 'gym', gymId: 41 }),
      reasonKey({ kind: 'boss-set' }),
      reasonKey({ kind: 'new-train' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(reasonKey({ kind: 'want', target: pokemonTarget(487) })).toBe(
      reasonKey({ kind: 'want', target: { kind: 'pokemon', dex: 487 } }),
    );
  });
});

describe('stopArgs and parseStopArgs', () => {
  const reasons: Array<[NotifyReason, string[]]> = [
    [{ kind: 'want', target: pokemonTarget(487) }, ['p', '487']],
    [
      { kind: 'want', target: pokemonTarget(487, 'giratina_origin') },
      ['p', '487', 'giratina_origin'],
    ],
    [{ kind: 'want', target: pokemonTarget(487, undefined, true) }, ['ps', '487']],
    [
      { kind: 'want', target: pokemonTarget(487, 'giratina_origin', true) },
      ['ps', '487', 'giratina_origin'],
    ],
    [{ kind: 'want', target: tier('T5') }, ['t', 'T5']],
    [{ kind: 'want', target: tier('T5', true) }, ['ts', 'T5']],
    [{ kind: 'want', target: tier('MegaLegendary') }, ['t', 'MegaLegendary']],
    [{ kind: 'want', target: PERFECT }, ['iv', 'perfect']],
    [{ kind: 'want', target: ZERO }, ['iv', 'zero']],
    [{ kind: 'gym', gymId: 12 }, ['g', '12']],
    [{ kind: 'boss-set' }, ['boss']],
    [{ kind: 'new-train' }, ['train']],
    [{ kind: 'target', want: boxTarget('research-pokemon', 147) }, ['rp', '147']],
    [{ kind: 'target', want: boxTarget('dynamax', 68, 'machamp') }, ['dx', '68', 'machamp']],
    [{ kind: 'target', want: { kind: 'research-item', item: 'rare-candy' } }, ['ri', 'rare-candy']],
    [{ kind: 'target', want: { kind: 'rocket', who: 'grunt:water' } }, ['rg', 'water']],
    [{ kind: 'target', want: { kind: 'rocket', who: 'leader:any' } }, ['rl', 'any']],
    [{ kind: 'target', want: { kind: 'rocket', who: 'giovanni' } }, ['rv']],
    [{ kind: 'subject', subject: { kind: 'pokemon', dex: 147 } }, ['sp', '147']],
    [
      { kind: 'subject', subject: { kind: 'pokemon', dex: 37, form: 'vulpix_alola' } },
      ['sp', '37', 'vulpix_alola'],
    ],
    [{ kind: 'subject', subject: { kind: 'tier', level: 'T5' } }, ['st', 'T5']],
  ];

  it('spells every reason without an empty part or a colon, and reads it back', () => {
    for (const [reason, args] of reasons) {
      expect(stopArgs(reason)).toEqual(args);
      expect(parseStopArgs(args)).toEqual(reason);
      for (const part of args) {
        expect(part).not.toBe('');
        expect(part).not.toContain(':');
      }
    }
  });

  it('reads nothing else', () => {
    for (const args of [
      [],
      ['p'],
      ['p', '0'],
      ['p', '-5'],
      ['p', '1000000'],
      ['p', '487', 'Origin Forme'],
      ['p', '487', 'giratina_origin', 'more'],
      ['ps', 'abc'],
      ['t', 'T9'],
      ['t', 'T5', 'shadow'],
      ['ts', 'Mega'],
      ['ts', 'EX'],
      ['iv', 'some'],
      ['iv'],
      ['g', '0'],
      ['g', '4x'],
      ['g', '12345678901'],
      ['g', '4', '5'],
      ['boss', 'now'],
      ['train', '1'],
      ['pokemon', '150'],
    ]) {
      expect(parseStopArgs(args), args.join(':')).toBeUndefined();
    }
  });
});
