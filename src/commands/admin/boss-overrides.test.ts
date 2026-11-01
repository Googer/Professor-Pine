import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bossCommandsWith,
  choicesOf,
  MEMBER,
  MODERATOR,
  textsOf,
} from '../../../test/support/boss-commands.js';
import {
  asRaid,
  at as partyAt,
  PARTY_NOW,
  testRaid,
  testRaidRules,
} from '../../../test/support/parties.js';
import { setBoss } from '../../domain/party/raid.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { FEED_READ_AT, feedReply, readRaidBossFeed } from '../../../test/support/raid-bosses.js';
import { admin } from './index.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = FEED_READ_AT + DAY;
const at = (ms: number) => String(Math.floor(ms / 1000));
const RAID = (n: number): string => `00000000-0000-4000-8000-00000000050${String(n)}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const textOf = (interaction: Parameters<typeof textsOf>[0]) => textsOf(interaction).join('\n');

describe('/admin boss: the subcommands', () => {
  it('lists them in the order of the brief', () => {
    const json = admin.data.toJSON();
    const group = json.options?.find((option) => option.name === 'boss');
    const names = (group && 'options' in group ? (group.options ?? []) : []).map((o) => o.name);
    expect(names).toEqual(['list', 'add', 'hide', 'autoset', 'shiny', 'remove', 'sync']);
  });

  it('refuses a member who is not staff, and offers them no choices', async () => {
    const made = await bossCommandsWith();
    const used = await made.use(
      'boss',
      'add',
      { pokemon: 'zekrom', tier: 'T5' },
      { userId: MEMBER, roleNames: [] },
    );
    expect(used.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.bosses.service.overrides()).toEqual([]);
    const typed = await made.typing(
      'boss',
      'add',
      'pokemon',
      'zek',
      {},
      {
        userId: MEMBER,
        roleNames: [],
      },
    );
    expect(choicesOf(typed)).toEqual([]);
  });
});

describe('/admin boss add', () => {
  it('adds a boss for 30 days by default, says so, and shows the tier now', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'add', { pokemon: 'Zekrom', tier: 'T5' });
    expect(made.bosses.service.overrides()).toMatchObject([
      {
        id: 1,
        action: 'add',
        pokemonId: 'ZEKROM',
        form: null,
        tier: { level: 'T5', shadow: false },
        shiny: false,
        expiresAt: NOW + 30 * DAY,
        createdBy: MODERATOR,
      },
    ]);
    expect(textsOf(used)).toEqual([
      `Zekrom is a boss of T5 (override #1, until <t:${at(NOW + 30 * DAY)}:d>).\n` +
        'It lapses after 30 days unless you give `days` (`days:0` for good), so it does not ' +
        'outlive the rotation.\n' +
        '**T5** now: Yveltal (shiny), Zekrom',
    ]);
  });

  it('takes days, 0 for good, and the shiny flag', async () => {
    const made = await bossCommandsWith();
    await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T5', days: 3, shiny: true });
    expect(made.bosses.service.overrides()[0]).toMatchObject({
      expiresAt: NOW + 3 * DAY,
      shiny: true,
    });
    const forGood = await made.use('boss', 'add', { pokemon: 'mew', tier: 'T5', days: 0 });
    expect(textOf(forGood)).toContain('Mew is a boss of T5 (override #2, for good).\n**T5**');
    expect(textOf(forGood)).not.toContain('lapses');
  });

  it('says that the feed lists it already, or that it is hidden', async () => {
    const made = await bossCommandsWith();
    const listed = await made.use('boss', 'add', { pokemon: 'yveltal', tier: 'T5' });
    expect(textOf(listed)).toContain(
      'The feed lists it in that tier already, so this changes nothing while it does.',
    );
    await made.use('boss', 'hide', { pokemon: 'zekrom', tier: 'T5' });
    const hidden = await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T5' });
    expect(textOf(hidden)).toContain(
      'It is hidden by override #2, so members do not see it until that is removed.',
    );
  });

  it('refuses a Pokémon that is no mega for a mega tier', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'add', { pokemon: 'charizard', tier: 'Mega' });
    expect(textOf(used)).toBe(
      'Charizard is no mega or primal form, so it cannot be a boss of Mega raids. Pick its ' +
        'mega form.',
    );
    expect(made.bosses.service.overrides()).toEqual([]);
    await made.use('boss', 'add', { pokemon: 'charizard_mega_x', tier: 'Mega' });
    expect(made.bosses.service.overrides()).toMatchObject([
      { pokemonId: 'CHARIZARD', form: 'CHARIZARD_MEGA_X' },
    ]);
  });

  it('refuses a mega form for a tier that is not of the mega kind', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'autoset', { pokemon: 'blastoise_mega', tier: 'T5' });
    expect(textOf(used)).toBe(
      'Mega Blastoise is a mega form, so it can only be a boss of Mega, Mega Legendary or Super ' +
        'Mega raids.',
    );
    expect(made.bosses.service.overrides()).toEqual([]);
  });

  it('calls a primal form primal when it refuses it for another tier', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'add', { pokemon: 'kyogre_primal', tier: 'T5' });
    expect(textOf(used)).toBe(
      'Primal Kyogre is a primal form, so it can only be a boss of Mega, Mega Legendary or ' +
        'Super Mega raids.',
    );
  });

  it('says which tier of the feed the add moves the boss from (plan 8X-J)', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'add', { pokemon: 'Starmie', tier: 'T1' });
    const text = textOf(used);
    expect(text).toContain('The feed lists it at T3: that one is left out while this lasts.');
    expect(text).not.toContain('changes nothing');
    expect(made.bosses.service.bosses().filter((boss) => boss.key === 'starmie')).toMatchObject([
      { tier: { level: 'T1', shadow: false } },
    ]);
    const shadow = await made.use('boss', 'add', { pokemon: 'Drapion', tier: 'T5:shadow' });
    expect(textOf(shadow)).toContain(
      'The feed lists it at Shadow T3: that one is left out while this lasts.',
    );
  });

  it('names a hide of the boss at the tier the add moves it from as no longer needed', async () => {
    const made = await bossCommandsWith();
    await made.use('boss', 'hide', { pokemon: 'Starmie', tier: 'T3' });
    const used = await made.use('boss', 'add', { pokemon: 'Starmie', tier: 'T1' });
    expect(textOf(used)).toContain('Override #1 already hides it at T3: it is no longer needed.');
  });

  // Review J3: a hidden add moves nothing, so no hide is "no longer needed".
  it('names no hide as no longer needed when the add itself is hidden', async () => {
    const made = await bossCommandsWith();
    await made.use('boss', 'hide', { pokemon: 'Starmie', tier: 'T3' });
    await made.use('boss', 'hide', { pokemon: 'Starmie', tier: 'T1' });
    const used = await made.use('boss', 'add', { pokemon: 'Starmie', tier: 'T1' });
    expect(textOf(used)).not.toContain('no longer needed');
    expect(textOf(used)).not.toContain('left out');
  });

  // Review J1, and E1 of plan 8E: a raid over by the clock (still active, not yet archived) is
  // no running battle: the add neither moves it nor says anything of it. Since plan 8E (one raid
  // per gym, of any kind) no running raid can be in the way of another at its own gym.
  it('says nothing of a raid over by the clock, and moves the running one', async () => {
    const T5 = { level: 'T5', shadow: false } as const;
    const over = setBoss(
      testRaid({ id: RAID(1), tier: T5 }),
      { tier: T5, boss: { key: 'yveltal' } },
      testRaidRules(),
      PARTY_NOW,
    ).party;
    const parties = await partyServiceWith([
      over,
      testRaid({
        id: RAID(3),
        gymId: 2,
        tier: T5,
        boss: { key: 'yveltal' },
        now: partyAt('2026-10-13T15:50'),
      }),
    ]);
    // The egg at gym 1 could last until 15:45 as a T5 egg; as an elite egg until the next day.
    parties.clock.now = partyAt('2026-10-13T15:55');
    const made = await bossCommandsWith({ context: { bossMoves: parties.bossMoves } });
    const used = await made.use('boss', 'add', { pokemon: 'Yveltal', tier: 'Elite' });
    expect(textOf(used)).toContain('1 battle running was moved.');
    expect(textOf(used)).not.toContain('left at its tier');
    expect(asRaid(parties.store.get(RAID(1))).raid.tier).toEqual(T5);
  });

  it('points to the shiny override when the feed lists the boss already', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'add', { pokemon: 'yveltal', tier: 'T5', shiny: true });
    expect(textOf(used)).toContain(
      'The feed lists it in that tier already, so this changes nothing while it does. To change ' +
        'whether it can be shiny, use `/admin boss shiny`.',
    );
  });

  it('refuses text that names no Pokémon outright, with what it could be', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'add', { pokemon: 'zekrm', tier: 'T5' });
    expect(textOf(used)).toMatch(/^"zekrm" is not the name of one Pokémon\. Did you mean Zekrom/);
    const nothing = await made.use('boss', 'add', { pokemon: 'qqqqqq', tier: 'T5' });
    expect(textOf(nothing)).toBe(
      'I do not know a Pokémon called "qqqqqq". Pick one from the list.',
    );
    const tier = await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T4' });
    expect(textOf(tier)).toBe('That is not a raid tier. Pick one from the list.');
    expect(made.bosses.service.overrides()).toEqual([]);
  });

  it('turns what the service refuses into a sentence', async () => {
    const made = await bossCommandsWith();
    const used = await made.use(
      'boss',
      'add',
      { pokemon: 'zekrom', tier: 'T5' },
      { userId: '12', roleNames: ['Moderator'] },
    );
    expect(textOf(used)).toBe('That is not a member id.');
  });
});

describe('/admin boss hide', () => {
  it('hides a boss for good by default', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'hide', { pokemon: 'starmie', tier: 'T3' });
    expect(made.bosses.service.overrides()).toMatchObject([
      { action: 'hide', pokemonId: 'STARMIE', expiresAt: null, shiny: null },
    ]);
    expect(textsOf(used)).toEqual([
      'Starmie is hidden from T3 (override #1, for good).\n' +
        '**T3** now: Gothitelle (shiny), Umbreon (shiny)',
    ]);
  });

  it('says that a Pokémon was no boss of the tier', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'hide', { pokemon: 'zekrom', tier: 'T5', days: 2 });
    expect(textOf(used)).toContain(
      `Zekrom is hidden from T5 (override #1, until <t:${at(NOW + 2 * DAY)}:d>).\n` +
        'It was no boss of T5; it stays off the list if the feed lists it there.',
    );
  });
});

describe('/admin boss autoset', () => {
  // Review J2: an autoset moves its boss as an add does, and says so.
  it('says which tier of the feed it moves the boss from, and moves running raids', async () => {
    const parties = await partyServiceWith([
      testRaid({ id: RAID(1), tier: { level: 'T3', shadow: false }, boss: { key: 'starmie' } }),
    ]);
    const made = await bossCommandsWith({ context: { bossMoves: parties.bossMoves } });
    const used = await made.use('boss', 'autoset', { pokemon: 'Starmie', tier: 'T1' });
    expect(textOf(used)).toContain(
      'The feed lists it at T3: that one is left out while this lasts.',
    );
    expect(textOf(used)).toContain('1 battle running was moved.');
  });
  it('chooses what eggs hatch as, for 30 days by default', async () => {
    const made = await bossCommandsWith();
    const used = await made.use('boss', 'autoset', { pokemon: 'gothitelle', tier: 'T3' });
    expect(made.bosses.service.overrides()).toMatchObject([
      { action: 'autoset', pokemonId: 'GOTHITELLE', expiresAt: NOW + 30 * DAY },
    ]);
    expect(textOf(used)).toContain(
      `Eggs of T3 hatch as Gothitelle (override #1, until <t:${at(NOW + 30 * DAY)}:d>).`,
    );
    expect(textOf(used)).toContain(
      '**T3** now: Gothitelle (shiny), Starmie (shiny), Umbreon (shiny) · eggs hatch as Gothitelle',
    );
  });

  it('replaces the earlier choice for the tier and says which', async () => {
    const made = await bossCommandsWith();
    await made.use('boss', 'autoset', { pokemon: 'gothitelle', tier: 'T3' });
    await made.use('boss', 'autoset', { pokemon: 'mewtwo', tier: 'T5' });
    const used = await made.use('boss', 'autoset', { pokemon: 'umbreon', tier: 'T3' });
    expect(made.bosses.service.overrides()).toMatchObject([
      { action: 'autoset', pokemonId: 'MEWTWO' },
      { action: 'autoset', pokemonId: 'UMBREON' },
    ]);
    expect(textOf(used)).toContain(
      `Eggs of T3 hatch as Umbreon (override #3, until <t:${at(NOW + 30 * DAY)}:d>).\n` +
        'It replaces override #1 (Gothitelle: eggs of T3 hatch as it).',
    );
    // Gothitelle stays a boss of T3: the feed lists it there.
    expect(textOf(used)).toContain(
      '**T3** now: Gothitelle (shiny), Starmie (shiny), Umbreon (shiny) · eggs hatch as Umbreon',
    );
  });
});

describe('/admin boss shiny', () => {
  it('sets shiny in every tier, or in one', async () => {
    const made = await bossCommandsWith();
    const every = await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
    expect(textsOf(every)).toEqual([
      'Yveltal is never shiny, in any raid tier (override #1, for good).\n' +
        '**T5** now: Yveltal · eggs hatch as Yveltal',
    ]);
    const one = await made.use('boss', 'shiny', {
      pokemon: 'mewtwo',
      'can-be-shiny': true,
      tier: 'T5',
    });
    expect(textsOf(one)).toEqual([
      'Mewtwo can be shiny in T5 (override #2, for good).\nIt is no boss of T5 now.',
    ]);
    expect(made.bosses.service.overrides()).toMatchObject([
      { action: 'shiny', tier: null, shiny: false },
      { action: 'shiny', tier: { level: 'T5' }, shiny: true },
    ]);
  });
});

describe('/admin boss remove', () => {
  it('offers the overrides in force with what they do and when they lapse', async () => {
    const made = await bossCommandsWith();
    await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T5' });
    await made.use('boss', 'hide', { pokemon: 'starmie', tier: 'T3' });
    const typed = await made.typing('boss', 'remove', 'override', '');
    expect(choicesOf(typed)).toEqual([
      { name: '#1 Zekrom added to T5 · until 2026-11-11', value: 'id:1' },
      { name: '#2 Starmie hidden from T3 · for good', value: 'id:2' },
    ]);
    expect(choicesOf(await made.typing('boss', 'remove', 'override', 'star'))).toEqual([
      { name: '#2 Starmie hidden from T3 · for good', value: 'id:2' },
    ]);
    await made.use('boss', 'autoset', { pokemon: 'mewtwo', tier: 'T5', days: 0 });
    await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
    expect(choicesOf(await made.typing('boss', 'remove', 'override', '')).slice(2)).toEqual([
      { name: '#3 Mewtwo: eggs of T5 hatch as it · for good', value: 'id:3' },
      { name: '#4 Yveltal: never shiny (any raid tier) · for good', value: 'id:4' },
    ]);
  });

  it('offers at most 25 overrides', async () => {
    const overrides = Array.from({ length: 32 }, (_, index) => ({
      action: 'hide' as const,
      pokemonId: `NEWMON${String(index)}`,
      form: null,
      tier: { level: index % 2 ? ('T1' as const) : ('T3' as const), shadow: false },
      shiny: null,
      expiresAt: NOW + (index + 1) * DAY,
      createdBy: MODERATOR,
    }));
    const made = await bossCommandsWith({ overrides });
    expect(made.bosses.service.overrides().length).toBeGreaterThan(25);
    const choices = choicesOf(await made.typing('boss', 'remove', 'override', ''));
    expect(choices).toHaveLength(25);
    expect(choicesOf(await made.typing('boss', 'remove', 'override', '#1'))).toHaveLength(1);
  });

  it('removes one by choice or number and shows the tier now', async () => {
    const made = await bossCommandsWith();
    await made.use('boss', 'hide', { pokemon: 'starmie', tier: 'T3' });
    const used = await made.use('boss', 'remove', { override: 'id:1' });
    expect(textsOf(used)).toEqual([
      'Removed override #1: Starmie hidden from T3.\n' +
        '**T3** now: Gothitelle (shiny), Starmie (shiny), Umbreon (shiny)',
    ]);
    expect(made.bosses.service.overrides()).toEqual([]);
    await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
    const typed = await made.use('boss', 'remove', { override: '#2' });
    expect(textsOf(typed)).toEqual([
      'Removed override #2: Yveltal: never shiny (any raid tier).\n' +
        '**T5** now: Yveltal (shiny) · eggs hatch as Yveltal',
    ]);
  });

  it('refuses what is no override in force', async () => {
    const made = await bossCommandsWith();
    expect(textOf(await made.use('boss', 'remove', { override: 'id:9' }))).toBe(
      'There is no override #9. It may have lapsed or been removed.',
    );
    expect(textOf(await made.use('boss', 'remove', { override: 'zekrom' }))).toBe(
      'Pick an override from the list, or give its number (`3` or `#3`).',
    );
  });
});

describe('/admin boss: the pokemon option', () => {
  it('offers the bosses first, then what the text finds', async () => {
    const made = await bossCommandsWith();
    const empty = choicesOf(await made.typing('boss', 'add', 'pokemon', ''));
    expect(empty.slice(0, 3)).toEqual([
      { name: 'Pikachu', value: 'pikachu' },
      { name: 'Gastly', value: 'gastly' },
      { name: 'Gible', value: 'gible' },
    ]);
    expect(choicesOf(await made.typing('boss', 'add', 'pokemon', 'zekr'))[0]).toEqual({
      name: 'Zekrom',
      value: 'zekrom',
    });
    expect(choicesOf(await made.typing('boss', 'hide', 'pokemon', 'yvel'))[0]).toEqual({
      name: 'Yveltal',
      value: 'yveltal',
    });
  });

  it('offers a boss the game data does not know by its ids, and acts on them', async () => {
    const made = await bossCommandsWith();
    made.bosses.state.respond = () =>
      Promise.resolve(
        feedReply(
          200,
          JSON.stringify([
            ...(readRaidBossFeed() as object[]),
            { name: 'Brandnewmon', tier: '5-Star Raids', canBeShiny: false },
          ]),
        ),
      );
    await made.bosses.service.sync();
    const choices = choicesOf(await made.typing('boss', 'hide', 'pokemon', 'brand'));
    expect(choices).toEqual([
      { name: 'Brandnewmon (not in the game data: BRANDNEWMON)', value: 'ids:BRANDNEWMON' },
    ]);
    const used = await made.use('boss', 'hide', { pokemon: 'ids:BRANDNEWMON', tier: 'T5' });
    expect(textOf(used)).toContain('Brandnewmon is hidden from T5 (override #1, for good).');
    expect(made.bosses.service.bosses().some((boss) => boss.pokemonId === 'BRANDNEWMON')).toBe(
      false,
    );
    expect(textOf(await made.use('boss', 'hide', { pokemon: 'ids:GONEMON', tier: 'T5' }))).toBe(
      'That boss is no longer in the feed. Pick again from the list.',
    );
  });
});
