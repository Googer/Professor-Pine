import { describe, expect, it } from 'vitest';
import {
  bossCommandsWith,
  choicesOf,
  MEMBER,
  textsOf,
} from '../../../test/support/boss-commands.js';
import { instanceConfig } from '../../../test/support/operators.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import { OTHER_GUILD_ID } from '../../../test/support/gyms.js';
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
    expect(made.search.rows.rows.get(FAKE_GUILD_ID)).toEqual(new Map());
  });

  // Plan 19B-4: the nicknames are a server's own: its staff change them, also on an open
  // instance, and another server neither finds a Pokémon by them nor changes them.
  it('changes and lists the nicknames of the server it is used in, for that server’s staff', async () => {
    const config = instanceConfig(createTestContext().ctx, { servers: 'open' });
    const made = await bossCommandsWith({
      nicknames: { dratini: ['danger noodle'] },
      context: { config },
    });
    const add = await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'wiggle' });
    expect(textOf(add)).toBe(
      'Members find Dratini by **wiggle** now. Its nicknames: danger noodle, wiggle.',
    );
    expect(made.ctx.pokemon.of(FAKE_GUILD_ID).exact('wiggle')?.key).toBe('dratini');
    expect(made.ctx.pokemon.of(OTHER_GUILD_ID).exact('wiggle')).toBeUndefined();
    // In another server its staff see and change their own.
    const abroad = { guildId: OTHER_GUILD_ID };
    expect(textOf(await made.use('nickname', 'list', {}, abroad))).toBe(
      'Staff have added no nicknames. `/admin nickname add` adds one.',
    );
    const theirs = await made.use(
      'nickname',
      'add',
      { pokemon: 'magikarp', nickname: 'wiggle' },
      abroad,
    );
    expect(textOf(theirs)).toBe('Members find Magikarp by **wiggle** now. Its nicknames: wiggle.');
    expect(made.ctx.pokemon.of(OTHER_GUILD_ID).exact('wiggle')?.key).toBe('magikarp');
    expect(made.ctx.pokemon.of(FAKE_GUILD_ID).exact('wiggle')?.key).toBe('dratini');
    const removed = await made.use(
      'nickname',
      'remove',
      { pokemon: 'dratini', nickname: 'danger noodle' },
      abroad,
    );
    expect(textOf(removed)).toMatch(/^Dratini has no nickname \*\*danger noodle\*\*\./);
    expect(made.search.rows.rows.get(FAKE_GUILD_ID)?.get('dratini')).toEqual([
      'danger noodle',
      'wiggle',
    ]);
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
    expect(made.search.rows.rows.get(FAKE_GUILD_ID)?.get('dratini')).toEqual([
      'danger noodle',
      'wiggle worm',
    ]);
    expect(made.ctx.pokemon.of(FAKE_GUILD_ID).exact('wiggle worm')?.key).toBe('dratini');
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
    expect(made.search.rows.rows.get(FAKE_GUILD_ID)).toEqual(new Map());
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
    expect(made.ctx.pokemon.of(FAKE_GUILD_ID).exact('wiggle')).toBeUndefined();
  });

  it('starts reading, with nothing typed, the nicknames of a server not read since the start', async () => {
    const made = await bossCommandsWith();
    // Rows of a server that joined after the start: none of its nicknames are in memory yet.
    await made.search.rows.addNickname(OTHER_GUILD_ID, 'magikarp', 'splashy');
    await made.search.rows.addNickname(OTHER_GUILD_ID, 'dratini', 'danger noodle');
    const abroad = { guildId: OTHER_GUILD_ID };
    const before = await made.typing('nickname', 'remove', 'pokemon', '', {}, abroad);
    // Until its read is back the list has none of them, as a search has the instance's names.
    expect(choicesOf(before)).toEqual([]);
    expect(made.search.rows.asked.at(-1)).toEqual([OTHER_GUILD_ID]);
    await made.search.search.flush();
    const after = await made.typing('nickname', 'remove', 'pokemon', '', {}, abroad);
    expect(choicesOf(after)).toEqual([
      { name: 'Dratini', value: 'dratini' },
      { name: 'Magikarp', value: 'magikarp' },
    ]);
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

  it('reads first the nicknames of a server not read since the start', async () => {
    const made = await bossCommandsWith();
    // Rows of a server that joined after the start: none of its nicknames are in memory yet.
    await made.search.rows.addNickname(OTHER_GUILD_ID, 'magikarp', 'splashy');
    await made.search.rows.addNickname(OTHER_GUILD_ID, 'dratini', 'danger noodle');
    const abroad = { guildId: OTHER_GUILD_ID };
    expect(textOf(await made.use('nickname', 'list', {}, abroad))).toBe(
      '**Nicknames staff added** (2 Pokémon)\n- Dratini: danger noodle\n- Magikarp: splashy',
    );
  });

  it('names the stored nicknames of a server not read since the start in a refusal', async () => {
    const made = await bossCommandsWith();
    await made.search.rows.addNickname(OTHER_GUILD_ID, 'dratini', 'danger noodle');
    const refused = await made.use(
      'nickname',
      'remove',
      { pokemon: 'dratini', nickname: 'splashy' },
      { guildId: OTHER_GUILD_ID },
    );
    expect(textOf(refused)).toBe(
      "Dratini has no nickname **splashy**. Dratini: danger noodle (and the bot's own: noodle)",
    );
  });

  it('says when staff added none', async () => {
    const made = await bossCommandsWith();
    expect(textOf(await made.use('nickname', 'list'))).toBe(
      'Staff have added no nicknames. `/admin nickname add` adds one.',
    );
  });
});
