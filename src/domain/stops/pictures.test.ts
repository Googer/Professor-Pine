import { describe, expect, it } from 'vitest';
import type { TaskReward } from '../research/task.js';
import type { RocketCatch } from '../rocket/lineups.js';
import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../rocket/portraits.js';
import {
  ENCOUNTER_PICTURE,
  isPictureSource,
  lineupPictureSources,
  researchPicture,
  rocketPicture,
  taskPictureSources,
  type StopPicture,
} from './pictures.js';

const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';

function encounter(name: string, dex: number, image: string | null = `${ICONS}pm${dex}.icon.png`) {
  return {
    kind: 'encounter',
    name,
    key: name.toLowerCase(),
    dex,
    shiny: false,
    cp: null,
    image,
  } satisfies TaskReward;
}

const GIBLE = encounter('Gible', 443);
const LARVITAR = encounter('Larvitar', 246);
const UNPICTURED = encounter('Missingno', 0, null);
const RARE_CANDY: TaskReward = {
  kind: 'item',
  item: 'rare-candy',
  name: 'Rare Candy',
  quantity: 3,
  image: 'https://cdn.leekduck.com/assets/img/items/Rare%20Candy.png',
};
const RAZZ: TaskReward = {
  kind: 'item',
  item: 'golden-razz-berry',
  name: 'Golden Razz Berry',
  quantity: 2,
  image: 'https://cdn.leekduck.com/assets/img/items/Golden%20Razz%20Berry.png',
};
const ENERGY: TaskReward = {
  kind: 'energy',
  dex: 254,
  name: 'Sceptile Mega Energy',
  quantity: 20,
  image: 'https://cdn.leekduck.com/assets/img/items/mega-energy.png',
};
const TYPED_ITEM: TaskReward = {
  kind: 'item',
  item: 'stardust',
  name: 'Stardust',
  quantity: 0,
  image: null,
};

function catchOf(name: string, dex: number): RocketCatch {
  return {
    name,
    key: name.toLowerCase(),
    dex,
    shiny: false,
    image: `${ICONS}pm${dex}.icon.png`,
  };
}

const MAGIKARP = catchOf('Magikarp', 129);
const FEEBAS = catchOf('Feebas', 349);
const CUBONE = catchOf('Cubone', 104);

describe('the picture of a research reward line, a DM and a confirmation', () => {
  const cases: [string, readonly TaskReward[], StopPicture | undefined][] = [
    ['a Pokémon named: its picture', [GIBLE], { source: GIBLE.image!, kind: 'pokemon' }],
    [
      '"one of" a task’s encounters: the encounter picture',
      [GIBLE, LARVITAR],
      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
    ],
    [
      'a report of before plan 8R-5 with encounters and items: "one of", the encounter picture',
      [GIBLE, RARE_CANDY],
      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
    ],
    ['an item: its picture', [RARE_CANDY], { source: RARE_CANDY.image!, kind: 'item' }],
    ['Mega Energy: its picture', [ENERGY], { source: ENERGY.image!, kind: 'item' }],
    ['a typed task without a reward: none', [], undefined],
    ['a typed reward without a picture: none', [TYPED_ITEM], undefined],
    ['a Pokémon the feed gave no picture: none', [UNPICTURED], undefined],
    ['items alone, several (a report of before plan 8R-5): none', [RARE_CANDY, RAZZ], undefined],
  ];
  it.each(cases)('%s', (_name, rewards, expected) => {
    expect(researchPicture(rewards)).toEqual(expected);
  });
});

describe('the picture of Team GO Rocket', () => {
  const cases: [string, string, readonly RocketCatch[], StopPicture | undefined][] = [
    [
      'a grunt of one possible catch: that Pokémon',
      'grunt:water:male',
      [MAGIKARP],
      { source: MAGIKARP.image!, kind: 'pokemon' },
    ],
    [
      'a lineup of two or more catches: the encounter picture',
      'grunt:water:female',
      [MAGIKARP, FEEBAS],
      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
    ],
    [
      'a grunt "not sure which": the encounter picture',
      'grunt:water',
      [MAGIKARP, FEEBAS, CUBONE],
      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
    ],
    ['a grunt whose catches are not known: none', 'grunt:none', [], undefined],
    [
      'a decoy of one catch: that Pokémon',
      'decoy',
      [CUBONE],
      { source: CUBONE.image!, kind: 'pokemon' },
    ],
    [
      'a decoy of several: the encounter picture',
      'decoy',
      [MAGIKARP, FEEBAS],
      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
    ],
    [
      'Cliff: his portrait, whatever can be caught',
      'leader:cliff',
      [CUBONE],
      { source: LEADER_PORTRAITS.cliff, kind: 'pokemon' },
    ],
    [
      'Arlo: his portrait',
      'leader:arlo',
      [MAGIKARP, FEEBAS],
      { source: LEADER_PORTRAITS.arlo, kind: 'pokemon' },
    ],
    [
      'Sierra: her portrait, also with nothing known',
      'leader:sierra',
      [],
      { source: LEADER_PORTRAITS.sierra, kind: 'pokemon' },
    ],
    [
      'Giovanni: his portrait',
      'giovanni',
      [CUBONE],
      { source: GIOVANNI_PORTRAIT, kind: 'pokemon' },
    ],
    ['a key that names nobody: none', 'grunt:nothing', [MAGIKARP], undefined],
  ];
  it.each(cases)('%s', (_name, key, catches, expected) => {
    expect(rocketPicture(key, catches)).toEqual(expected);
  });

  it('a catch the feed gave no picture: none', () => {
    expect(rocketPicture('grunt:water', [{ ...MAGIKARP, image: null }])).toBeUndefined();
  });
});

describe('where a picture may be fetched from', () => {
  it('takes the encounter picture, the portraits and Leek Duck’s pictures', () => {
    for (const url of [
      ENCOUNTER_PICTURE,
      GIOVANNI_PORTRAIT,
      ...Object.values(LEADER_PORTRAITS),
      GIBLE.image!,
      RARE_CANDY.image!,
    ]) {
      expect(isPictureSource(url), url).toBe(true);
    }
  });

  it('refuses any other host, scheme, port, or a user in the address', () => {
    for (const url of [
      'http://cdn.leekduck.com/assets/img/items/Rare%20Candy.png',
      'https://leekduck.com/assets/img/items/Rare%20Candy.png',
      'https://cdn.leekduck.com.example.com/x.png',
      'https://cdn.leekduck.com:8443/x.png',
      'https://user@cdn.leekduck.com/x.png',
      'https://raw.githubusercontent.com/someone/else/master/x.png',
      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/refs/heads/master/Images/Quests/Other.png',
      'not an address',
      '',
    ]) {
      expect(isPictureSource(url), url).toBe(false);
    }
  });

  it('takes the encounter picture from one commit of PokeMiners’ assets, never from a branch that may change', () => {
    expect(ENCOUNTER_PICTURE).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/Quests\/QuestPokemonReward\.png$/,
    );
    expect(
      isPictureSource(
        'https://raw.githubusercontent.com/PokeMiners/pogo_assets/refs/heads/master/Images/Quests/QuestPokemonReward.png',
      ),
    ).toBe(false);
  });
});

describe('the pictures made square when a list is read (plan 8M-9B)', () => {
  it('names every reward of the task list with a picture, and the encounter picture of "one of"', () => {
    const tasks = [
      { key: 'a', text: 'Catch a Dragon', category: 'Catching', rewards: [GIBLE, LARVITAR] },
      { key: 'b', text: 'Spin', category: 'Other', rewards: [RARE_CANDY, UNPICTURED, GIBLE] },
    ];
    expect([...taskPictureSources(tasks)].sort()).toEqual(
      [ENCOUNTER_PICTURE, GIBLE.image!, LARVITAR.image!, RARE_CANDY.image!].sort(),
    );
  });

  it('names every catch of the lineups, both lineups of a type, the portraits and the encounter picture', () => {
    const choices = [
      // A type of two lineups: its own catches are both lineups'.
      { catches: [MAGIKARP], lineups: [{ catches: [MAGIKARP] }, { catches: [FEEBAS] }] },
      { catches: [CUBONE] },
    ];
    expect([...lineupPictureSources(choices)].sort()).toEqual(
      [
        ENCOUNTER_PICTURE,
        MAGIKARP.image!,
        FEEBAS.image!,
        CUBONE.image!,
        GIOVANNI_PORTRAIT,
        ...Object.values(LEADER_PORTRAITS),
      ].sort(),
    );
  });
});
