import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import type { RaidReport } from '../../services/party-service.js';
import { commands } from '../index.js';
import { boss, moveset } from './boss.js';
import { CHANGE_THROTTLE } from './change.js';

const all: CommandModule[] = [boss, moveset];

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, []);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  const run = (commandName: string, options: Record<string, string> = {}, extra = {}) =>
    handle(
      fakeChatInput({
        commandName,
        ...where,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  const answer = async (commandName: string, options?: Record<string, string>) =>
    sent((await run(commandName, options)).reply).content;
  /** The choices offered while typing into an option. */
  const offered = async (commandName: string, focusedName: string, focused: string, extra = {}) => {
    const interaction = await handle(
      fakeAutocomplete({ commandName, ...where, focusedName, focused, ...extra }),
    );
    return interaction.respond.mock.calls[0]?.[0];
  };
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, offered, lines };
}

describe('/boss', () => {
  it('sets the boss of an egg, privately, and the post says who did it', async () => {
    const made = await setup();
    const used = await made.run('boss', { pokemon: 'b:yveltal:T5:0' });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'The boss is now Yveltal (T5).',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().raid.boss).toEqual({ key: 'yveltal' });
    expect(await made.lines()).toEqual([`**Alice** (<@${ALICE}>) set the boss: **Yveltal (T5)**.`]);
    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(
      'This raid already is: Yveltal (T5).',
    );
  });

  it('reads typed text as `/raid` does: a tier makes it an egg of that tier', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 't3' })).toBe('This is now: T3 egg.');
    expect(made.current().raid).toMatchObject({ tier: { level: 'T3', shadow: false }, boss: null });
    expect(await made.answer('boss', { pokemon: 'zzzz' })).toMatch(
      /^I do not know a raid boss or tier called "zzzz"\./,
    );
  });

  // Final review of 8X-F, F6: the refusal uses up nothing of /boss's window.
  it('gives back the use it refuses for `tier:`', async () => {
    const made = await setup();
    for (let use = 0; use <= CHANGE_THROTTLE.uses; use++) {
      expect(await made.answer('boss', { pokemon: 'yveltal', tier: 'D5' })).toBe(
        '`tier:` is for a max battle whose boss is on no list. Leave it out here.',
      );
    }
    expect(await made.answer('boss', { pokemon: 'b:yveltal:T5:0' })).toBe(
      'The boss is now Yveltal (T5).',
    );
  });

  it('refuses `tier:`, which is for max battles only (plan 8X-F)', async () => {
    const made = await setup();
    const before = made.current().raid;
    expect(await made.answer('boss', { pokemon: 'yveltal', tier: 'D5' })).toBe(
      '`tier:` is for a max battle whose boss is on no list. Leave it out here.',
    );
    expect(made.current().raid).toEqual(before);
  });

  it('offers the bosses and the eggs while typing', async () => {
    const made = await setup();
    expect(await made.offered('boss', 'pokemon', 'yve')).toEqual([
      { name: 'Yveltal (T5)', value: 'b:yveltal:T5:0' },
    ]);
  });
});

describe('/moveset', () => {
  it('sets one move or both, by a choice of the list or by typed text', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.answer('moveset', { quick: 'SNARL_FAST' })).toBe(
      'The moves are now Snarl / ????.',
    );
    expect(await made.answer('moveset', { charge: 'dark pulse' })).toBe(
      'The moves are now Snarl / Dark Pulse.',
    );
    expect(made.current().raid).toMatchObject({
      fastMove: 'SNARL_FAST',
      chargedMove: 'DARK_PULSE',
    });
    expect(await made.answer('moveset', { quick: 'gust', charge: 'hurricane' })).toBe(
      'The moves are now Gust / Hurricane.',
    );
    expect(await made.answer('moveset', { quick: 'gust' })).toBe(
      'The raid already had those moves.',
    );
    expect((await made.lines()).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) set the moves: Gust / Hurricane.`,
    );
  });

  it('refuses a move the boss does not have, listing those it has', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.answer('moveset', { quick: 'waterfall' })).toBe(
      '"waterfall" is not one fast move of Yveltal. Its fast moves are: Sucker Punch, Snarl, Gust.',
    );
    // A charged move is no fast move.
    expect(await made.answer('moveset', { quick: 'DARK_PULSE' })).toMatch(/is not one fast move/);
    // Nothing is set when one of two is wrong.
    expect(await made.answer('moveset', { quick: 'snarl', charge: 'nonsense' })).toMatch(
      /is not one charged move of Yveltal/,
    );
    expect(made.current().raid.fastMove).toBeNull();
  });

  it('needs a move, a boss, and a boss the game master knows', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.answer('moveset')).toBe('Give the fast move, the charged move, or both.');
    const egg = await setup();
    expect(await egg.answer('moveset', { quick: 'snarl' })).toBe('This raid has no boss yet.');
    const unknown = await setup({ boss: { name: 'Newmon' } });
    expect(await unknown.answer('moveset', { quick: 'snarl' })).toBe(
      'I do not know the moves of Newmon yet.',
    );
  });

  it('offers the moves of the boss while typing, and nothing without a boss', async () => {
    const made = await setup({ boss: { key: 'yveltal' } });
    expect(await made.offered('moveset', 'quick', '')).toEqual([
      { name: 'Sucker Punch', value: 'SUCKER_PUNCH_FAST' },
      { name: 'Snarl', value: 'SNARL_FAST' },
      { name: 'Gust', value: 'GUST_FAST' },
    ]);
    expect(await made.offered('moveset', 'charge', 'pu')).toEqual([
      { name: 'Dark Pulse', value: 'DARK_PULSE' },
    ]);
    const egg = await setup();
    expect(await egg.offered('moveset', 'quick', '')).toEqual([]);
    expect(await made.offered('moveset', 'quick', '', { channelId: '600000000000000009' })).toEqual(
      [],
    );
  });
});

describe('the command list', () => {
  it('has every command of this plan once, each with help', () => {
    const names = commands.map((command) => command.data.name);
    for (const name of [
      'hatch',
      'end',
      'duration',
      'boss',
      'moveset',
      'location',
      'meet',
      'cancel-meet',
    ]) {
      expect(
        names.filter((n) => n === name),
        name,
      ).toHaveLength(1);
    }
    // `/gym` is the gym administration (plan 5A), a group of subcommands: the raid command for
    // another gym is `/location`.
    expect(commands.find((command) => command.data.name === 'gym')?.subcommands).toBeDefined();
  });
});
