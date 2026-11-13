import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bossCommandsWith, choicesOf, textsOf } from '../../../test/support/boss-commands.js';
import { at as local } from '../../../test/support/max-bosses.js';
import { testMax } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { admin } from './index.js';

/** The zone of the test settings, every server's here. */
const ZONE = 'America/New_York';

// Plan 8X-2: `/admin boss` with the max tiers beside the raid tiers.
const NOW = local('2026-10-21T12:00');
// Plan 8X-J: running battles, on the party fixtures' own clock (their day, before their end).
const BATTLE = (n: number): string => `00000000-0000-4000-8000-00000000040${String(n)}`;
const POST = '300000000000000401';
const DAY = 24 * 60 * 60 * 1000;
const stamp = (ms: number) => String(Math.floor(ms / 1000));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function withMax() {
  const made = await bossCommandsWith({ max: true });
  made.max.state.now = NOW;
  return made;
}

const tierChoices = (subcommand: string) => {
  const group = admin.data.toJSON().options?.find((option) => option.name === 'boss');
  const part = (group && 'options' in group ? (group.options ?? []) : []).find(
    (option) => option.name === subcommand,
  );
  const tier = (part && 'options' in part ? (part.options ?? []) : []).find(
    (option) => option.name === 'tier',
  );
  return (tier && 'choices' in tier ? (tier.choices ?? []) : []).map((choice) => [
    choice.name,
    choice.value,
  ]);
};

describe('/admin boss: the tiers', () => {
  it('offers the max tiers after the raid tiers where an override may have one', () => {
    for (const subcommand of ['add', 'hide', 'shiny', 'list']) {
      expect(tierChoices(subcommand).slice(-6), subcommand).toEqual([
        ['Dynamax 1★', 'D1'],
        ['Dynamax 2★', 'D2'],
        ['Dynamax 3★', 'D3'],
        ['Dynamax 4★', 'D4'],
        ['Dynamax 5★', 'D5'],
        ['Gigantamax', 'G'],
      ]);
      expect(tierChoices(subcommand)[0], subcommand).toEqual(['T1', 'T1']);
    }
  });

  it('offers no max tier for autoset: a max battle has no egg', async () => {
    expect(tierChoices('autoset').some(([, value]) => value === 'D2')).toBe(false);
    const made = await withMax();
    const used = await made.use('boss', 'autoset', { pokemon: 'Machop', tier: 'D2' });
    expect(textsOf(used).join('\n')).toMatch(/autoset.*raid tiers/);
    expect(made.max.service.overrides()).toEqual([]);
  });
});

describe('/admin boss with a max tier', () => {
  it('adds a max boss, kept apart from the raid bosses, and shows its tier now', async () => {
    const made = await withMax();
    const used = await made.use('boss', 'add', { pokemon: 'Machamp', tier: 'G' });
    expect(made.max.service.overrides()).toMatchObject([
      { id: 1, action: 'add', pokemonId: 'MACHAMP', tier: 'G', expiresAt: NOW + 30 * DAY },
    ]);
    expect(made.bosses.service.overrides()).toEqual([]);
    expect(textsOf(used)).toEqual([
      `Machamp is a boss of Gigantamax (override #1, until <t:${stamp(NOW + 30 * DAY)}:d>).\n` +
        'It lapses after 30 days unless you give `days` (`days:0` for good), so it does not ' +
        'outlive the rotation.\n' +
        '**Gigantamax** now: Machamp',
    ]);
  });

  it('moves a Dynamax boss from the feed’s tier, and says so (plan 8X-J)', async () => {
    const made = await withMax();
    const used = await made.use('boss', 'add', { pokemon: 'Sneasel', tier: 'D2', days: 7 });
    const [first, moved, now] = (textsOf(used)[0] ?? '').split('\n');
    expect([first, moved]).toEqual([
      `Sneasel is a boss of Dynamax 2★ (override #1, until <t:${stamp(NOW + 7 * DAY)}:d>).`,
      'The feed lists it at Dynamax 1★: that one is left out while this lasts.',
    ]);
    expect(now).toMatch(/^\*\*Dynamax 2★\*\* now: .*Sneasel/);
    expect(
      made.max.service
        .bosses(ZONE)
        .filter((boss) => boss.key === 'sneasel')
        .map((boss) => boss.tier),
    ).toEqual(['D2']);
    const list = textsOf(await made.use('boss', 'list', { tier: 'D2' })).join('\n');
    expect(list).toContain(
      // Shiny: the feed's row at 1★ is.
      `- **Sneasel** · shiny · added (#1, until <t:${stamp(NOW + 7 * DAY)}:d>) · moves it from Dynamax 1★`,
    );
  });

  it('moves the battles running at the tier it moved from in every server, and counts them', async () => {
    const parties = await partyServiceWith([
      { ...testMax({ id: BATTLE(1), boss: { key: 'sneasel' }, tier: 'D1' }), forumPostId: POST },
      testMax({ id: BATTLE(2), boss: { key: 'sneasel' }, tier: 'D1' }),
      // Review J5: another server's battle too: the boss list is the installation's.
      testMax({ id: BATTLE(3), boss: { key: 'sneasel' }, tier: 'D1', guildId: 2 }),
    ]);
    const written: string[] = [];
    parties.store.onChange((_before, after) => {
      if (after.type === 'max' && after.max.tier === 'D2') written.push(after.id);
    });
    const made = await bossCommandsWith({ max: true, context: { bossMoves: parties.bossMoves } });
    made.max.state.now = NOW;
    const used = await made.use('boss', 'add', { pokemon: 'Sneasel', tier: 'D2' });
    expect(textsOf(used)[0]).toContain('3 battles running were moved.');
    expect(written).toContain(BATTLE(1));
    await parties.attendance.flush();
    expect(parties.gateway.messagesIn(POST).map((m) => m.message.content)).toEqual([
      'Staff moved **Dynamax Sneasel** to 2★.',
    ]);
    // A second add that moves nothing more moves no battle.
    const again = await made.use('boss', 'add', { pokemon: 'Sneasel', tier: 'D2' });
    expect(textsOf(again)[0]).not.toContain('running');
  });

  it('hides a max boss from its tier only', async () => {
    const made = await withMax();
    const used = await made.use('boss', 'hide', { pokemon: 'Sneasel', tier: 'D1' });
    expect(textsOf(used)[0]).toMatch(
      /^Sneasel is hidden from Dynamax 1★ \(override #1, for good\)\./,
    );
    expect(made.max.service.bosses(ZONE).some((boss) => boss.key === 'sneasel')).toBe(false);
  });

  it('sets a max boss shiny in its tier, and a shiny override without a tier is a raid one', async () => {
    const made = await withMax();
    await made.use('boss', 'shiny', { pokemon: 'Machop', 'can-be-shiny': false, tier: 'D2' });
    expect(made.max.service.bosses(ZONE).find((boss) => boss.key === 'machop')?.shiny).toBe(false);
    const every = await made.use('boss', 'shiny', { pokemon: 'Machop', 'can-be-shiny': true });
    expect(made.bosses.service.overrides()).toMatchObject([{ action: 'shiny', tier: null }]);
    expect(made.max.service.bosses(ZONE).find((boss) => boss.key === 'machop')?.shiny).toBe(false);
    expect(textsOf(every)[0]).toMatch(/can be shiny, in any raid tier/);
  });

  it('warns, and stores all the same, where the game data has no such max boss', async () => {
    const made = await withMax();
    const sneasel = textsOf(await made.use('boss', 'add', { pokemon: 'Sneasel', tier: 'G' }));
    expect(sneasel[0]?.split('\n')[1]).toBe(
      'The game data does not list Sneasel as a Gigantamax boss; the override is stored all the same.',
    );
    const rattata = textsOf(await made.use('boss', 'hide', { pokemon: 'Rattata', tier: 'D1' }));
    expect(rattata[0]).toContain('does not list Rattata as a Dynamax boss');
    expect(made.max.service.overrides()).toHaveLength(2);
    const machop = textsOf(await made.use('boss', 'add', { pokemon: 'Machop', tier: 'D3' }));
    expect(machop[0]).not.toContain('does not list');
  });

  it('refuses a mega as a max boss', async () => {
    const made = await withMax();
    const used = await made.use('boss', 'add', { pokemon: 'Mega Venusaur', tier: 'D5' });
    expect(textsOf(used).join('\n')).toMatch(/no max boss/);
    expect(made.max.service.overrides()).toEqual([]);
  });

  it('offers and removes overrides of both kinds by their number', async () => {
    const made = await withMax();
    await made.use('boss', 'add', { pokemon: 'Zekrom', tier: 'T5' });
    await made.use('boss', 'add', { pokemon: 'Machamp', tier: 'G' });
    const choices = choicesOf(await made.typing('boss', 'remove', 'override', ''));
    expect(choices.map((choice) => choice.value)).toEqual(['id:1', 'id:2']);
    expect(choices[1]?.name).toMatch(/^#2 Machamp added to Gigantamax · until /);
    const used = await made.use('boss', 'remove', { override: 'id:2' });
    expect(textsOf(used)).toEqual([
      'Removed override #2: Machamp added to Gigantamax.\n**Gigantamax** now has no bosses.',
    ]);
    expect(made.max.service.overrides()).toEqual([]);
    expect(made.bosses.service.overrides()).toHaveLength(1);
  });
});

describe('/admin boss list and sync with max battles', () => {
  it('lists a max tier, an upcoming boss under what is coming', async () => {
    const made = await withMax();
    const used = await made.use('boss', 'list', { tier: 'D5' });
    const text = textsOf(used).join('\n');
    expect(text).toMatch(/^\*\*Max bosses\*\* · the feed was read <t:\d+:R>/);
    expect(text).toContain('That tier has no bosses.');
    expect(text).toContain('**Coming**');
    expect(text).toContain(
      `- **Uxie** (Dynamax 5★) · from <t:${stamp(local('2026-10-24T00:00'))}:f>`,
    );
    const four = textsOf(await made.use('boss', 'list', { tier: 'D4' })).join('\n');
    expect(four).toContain('**Dynamax 4★**\n- **Duraludon** · shiny · from the feed, since <t:');
    expect(four).not.toContain('Raid bosses');
  });

  it('leaves out of Coming an upcoming boss an add moved to another tier (plan 8X-J)', async () => {
    const made = await withMax();
    await made.use('boss', 'add', { pokemon: 'Uxie', tier: 'D4' });
    const text = textsOf(await made.use('boss', 'list', { tier: 'D5' })).join('\n');
    expect(text).not.toContain('**Uxie**');
    expect(text).toContain('- **Azelf** (Dynamax 5★) · from <t:');
  });

  it('lists the max bosses after the raid bosses when no tier is given', async () => {
    const made = await withMax();
    const text = textsOf(await made.use('boss', 'list')).join('\n');
    expect(text).toContain('**Raid bosses**');
    expect(text).toContain('**Max bosses**');
    expect(text.indexOf('**Raid bosses**')).toBeLessThan(text.indexOf('**Max bosses**'));
  });

  it('reads the max boss feed on request', async () => {
    const made = await withMax();
    const requests = made.max.state.requests;
    const used = await made.use('boss', 'sync', { max: true });
    expect(made.max.state.requests).toBe(requests + 1);
    expect(textsOf(used)).toEqual(['The max boss feed lists the same bosses as before.']);
  });
});
