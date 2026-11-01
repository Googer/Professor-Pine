import { describe, expect, it } from 'vitest';
import {
  bossCommandsWith,
  choicesOf,
  MEMBER,
  textsOf,
} from '../../../test/support/boss-commands.js';
import { admin } from './index.js';

const textOf = (interaction: Parameters<typeof textsOf>[0]) => textsOf(interaction).join('\n');

describe('/admin nickname', () => {
  it('is a group of /admin with add, remove and list', () => {
    expect([...admin.subcommands.keys()]).toEqual(
      expect.arrayContaining(['nickname add', 'nickname remove', 'nickname list']),
    );
    const json = admin.data.toJSON();
    const group = json.options?.find((option) => option.name === 'nickname');
    expect(group?.description).toBe('The nicknames members can find Pokémon by');
  });

  it('is for staff only', async () => {
    const made = await bossCommandsWith();
    const used = await made.use(
      'nickname',
      'add',
      { pokemon: 'dratini', nickname: 'wiggle' },
      { userId: MEMBER, roleNames: [] },
    );
    expect(textOf(used)).toBe('Only admins, moderators and bot developers can do that.');
    expect(made.search.rows.rows.size).toBe(0);
  });
});

describe('/admin nickname add', () => {
  it('adds a nickname that members find the Pokémon by at once', async () => {
    const made = await bossCommandsWith({ nicknames: { dratini: ['danger noodle'] } });
    const used = await made.use('nickname', 'add', {
      pokemon: 'Dratini',
      nickname: ' Wiggle  Worm',
    });
    expect(textOf(used)).toBe(
      'Members find Dratini by **wiggle worm** now. Its nicknames: danger noodle, wiggle worm.',
    );
    expect(made.search.rows.rows.get('dratini')).toEqual(['danger noodle', 'wiggle worm']);
    expect(made.ctx.pokemon.exact('wiggle worm')?.key).toBe('dratini');
    expect(
      made.logged.filter((e) => e['msg'] === 'a Pokémon nickname was asked for'),
    ).toMatchObject([{ pokemon: 'dratini', outcome: 'added' }]);
  });

  it('refuses a nickname of another Pokémon, naming it, and one that is no nickname', async () => {
    const made = await bossCommandsWith();
    expect(
      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'ttar' })),
    ).toBe(
      '**ttar** already finds Tyranitar. A nickname must name one Pokémon only: pick another.',
    );
    expect(textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'a,b' }))).toBe(
      'A nickname has letters, digits, spaces and hyphens only.',
    );
    expect(
      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'Shadow Noodle' })),
    ).toBe(
      'A nickname cannot be or have a word that the Pokémon options read as something else: a ' +
        'tier, `shadow`, `mega`, an egg, an IV target, `none`; nor begin with a tier (`3`, `t5`).',
    );
    expect(textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: '147' }))).toBe(
      'A nickname needs a letter: digits alone are read as a Pokédex number.',
    );
    expect(
      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'noodle' })),
    ).toBe('**noodle** finds Dratini already.');
    expect(made.search.rows.rows.size).toBe(0);
  });

  it('says how long the stored list of nicknames may be when it is full', async () => {
    const made = await bossCommandsWith({ nicknames: { dratini: ['x'.repeat(250)] } });
    expect(
      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'wiggle' })),
    ).toBe(
      'Dratini has as many nicknames as the stored list holds (255 characters with their ' +
        'commas), so **wiggle** does not fit. Remove one first with `/admin nickname remove`.',
    );
  });

  it('refuses text that names no Pokémon outright', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('nickname', 'add', { pokemon: 'dratni', nickname: 'wiggle' });
    expect(textOf(used)).toMatch(/^"dratni" is not the name of one Pokémon\. Did you mean Dratini/);
  });
});

describe('/admin nickname remove', () => {
  it('offers the nicknames of the Pokémon picked, and removes one', async () => {
    const made = await bossCommandsWith({
      nicknames: { dratini: ['danger noodle', 'wiggle'], magikarp: ['splashy'] },
    });
    const offered = await made.typing('nickname', 'remove', 'nickname', 'w', {
      pokemon: 'dratini',
    });
    expect(choicesOf(offered)).toEqual([{ name: 'wiggle', value: 'wiggle' }]);
    const pokemon = await made.typing('nickname', 'remove', 'pokemon', '');
    expect(choicesOf(pokemon)).toEqual([
      { name: 'Dratini', value: 'dratini' },
      { name: 'Magikarp', value: 'magikarp' },
    ]);
    const used = await made.use('nickname', 'remove', { pokemon: 'dratini', nickname: 'Wiggle' });
    expect(textOf(used)).toBe(
      "Members no longer find Dratini by **wiggle**. Dratini: danger noodle (and the bot's own: noodle)",
    );
    expect(made.ctx.pokemon.exact('wiggle')).toBeUndefined();
  });

  it('does not offer a stored nickname too long for the value of a choice', async () => {
    const long = `wiggle ${'w'.repeat(100)}`;
    const made = await bossCommandsWith({ nicknames: { dratini: ['wiggle', long] } });
    const offered = await made.typing('nickname', 'remove', 'nickname', 'w', {
      pokemon: 'dratini',
    });
    expect(choicesOf(offered)).toEqual([{ name: 'wiggle', value: 'wiggle' }]);
  });

  it("refuses a nickname the Pokémon does not have, and the bot's own", async () => {
    const made = await bossCommandsWith({ nicknames: { dratini: ['danger noodle'] } });
    expect(
      textOf(await made.use('nickname', 'remove', { pokemon: 'dratini', nickname: 'splashy' })),
    ).toBe(
      "Dratini has no nickname **splashy**. Dratini: danger noodle (and the bot's own: noodle)",
    );
    expect(
      textOf(await made.use('nickname', 'remove', { pokemon: 'dratini', nickname: 'Noodle' })),
    ).toBe(
      "**noodle** is one of the bot's own nicknames of Dratini, and the bot's own (see " +
        '`/admin nickname list`) cannot be removed.',
    );
  });
});

describe('/admin nickname list', () => {
  it('lists every Pokémon with nicknames staff added, or every nickname of one', async () => {
    const made = await bossCommandsWith({
      nicknames: { magikarp: ['splashy'], dratini: ['danger noodle', 'wiggle'], ex: ['x'] },
    });
    expect(textOf(await made.use('nickname', 'list'))).toBe(
      '**Nicknames staff added** (2 Pokémon)\n- Dratini: danger noodle, wiggle\n- Magikarp: splashy',
    );
    expect(textOf(await made.use('nickname', 'list', { pokemon: 'tyranitar' }))).toBe(
      "Tyranitar: none added (and the bot's own: ttar)",
    );
  });

  it('says when staff added none', async () => {
    const made = await bossCommandsWith();
    expect(textOf(await made.use('nickname', 'list'))).toBe(
      'Staff have added no nicknames. `/admin nickname add` adds one.',
    );
  });
});
