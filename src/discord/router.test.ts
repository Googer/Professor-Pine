import {
  ApplicationCommandType,
  ButtonStyle,
  ComponentType,
  ContextMenuCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type Interaction,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeMessageCommand,
  fakeModal,
  fakeSelect,
  sent,
} from '../../test/support/fake-interactions.js';
import { createTestContext } from '../../test/support/test-context.js';
import { commandGroup, type SubcommandPart } from './command-group.js';
import {
  alsoAs,
  type ComponentHandler,
  type Guard,
  type MessageCommand,
  type SimpleCommand,
} from './command.js';
import { UserError } from './errors.js';
import { answer } from './late-reply.js';
import { controlThrottleKey, InteractionRouter, STALE_COMPONENT, whenCounted } from './router.js';
import { Throttles } from './throttle.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Rehearsal, REHEARSAL_REFUSAL } from '../services/rehearsal.js';
import { actionRow, textMessage } from '../render/v2.js';

const asInteraction = (fake: unknown) => fake as Interaction;

function command(overrides: Partial<SimpleCommand> = {}): SimpleCommand {
  return {
    data: { name: 'test', toJSON: () => ({ name: 'test', description: 'Test' }) },
    help: { category: 'util' },
    execute: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function part(name: string, extra: Partial<SubcommandPart> = {}): SubcommandPart {
  return {
    data: new SlashCommandSubcommandBuilder().setName(name).setDescription(name),
    execute: vi.fn(() => Promise.resolve()),
    ...extra,
  };
}

function gym(parts: SubcommandPart[], guards?: Guard[]) {
  return commandGroup({
    data: new SlashCommandBuilder().setName('gym').setDescription('Gyms'),
    help: { category: 'admin' },
    ...(guards ? { guards } : {}),
    ...(parts.some((p) => p.group) ? { groups: { queue: 'The import queue' } } : {}),
    parts,
  });
}

const ran = () => vi.fn(() => Promise.resolve());

describe('InteractionRouter', () => {
  it('runs guards then the command', async () => {
    const { ctx } = createTestContext();
    const order: string[] = [];
    const cmd = command({
      guards: [() => void order.push('guard')],
      execute: vi.fn(() => {
        order.push('execute');
        return Promise.resolve();
      }),
    });
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(fakeChatInput()));
    expect(order).toEqual(['guard', 'execute']);
  });

  it('shows a UserError ephemerally without logging an error', async () => {
    const { ctx, entries } = createTestContext();
    const execute = vi.fn(() => Promise.resolve());
    const cmd = command({
      guards: [
        () => {
          throw new UserError('Use this in a raid post.');
        },
      ],
      execute,
    });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({
      content: 'Use this in a raid post.',
      flags: MessageFlags.Ephemeral,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(entries.filter((e) => e.level === 50)).toHaveLength(0);
  });

  it('shows a UserError that carries a message of its own as that message, privately', async () => {
    const { ctx } = createTestContext();
    const shown = textMessage(
      0xed4245,
      ['You can’t do that here.'],
      [
        actionRow([
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            label: 'Ask',
            custom_id: 'x:1:ask',
          },
        ]),
      ],
    );
    const cmd = command({
      guards: [
        () => {
          throw new UserError('You can’t do that here.', { answer: shown });
        },
      ],
      execute: () => Promise.resolve(),
    });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({
      components: shown.components,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    // After a deferral it is the answer's edit, as any answer apart.
    const deferred = command({
      defer: 'ephemeral',
      execute: () => Promise.reject(new UserError('You can’t do that here.', { answer: shown })),
    });
    const later = fakeChatInput();
    await new InteractionRouter(ctx, [deferred], []).handle(asInteraction(later));
    expect(later.editReply).toHaveBeenCalledWith({
      components: shown.components,
      flags: MessageFlags.IsComponentsV2,
    });
  });

  it('writes one debug line per handled command or control, and none for autocomplete', async () => {
    const { ctx, entries } = createTestContext();
    const router = new InteractionRouter(ctx, [], []);
    await router.handle(fakeChatInput({ commandName: 'nothing' }) as unknown as Interaction);
    await router.handle(fakeButton({ customId: 'p:1:join' }) as unknown as Interaction);
    await router.handle(fakeAutocomplete({ commandName: 'nothing' }) as unknown as Interaction);
    const handled = entries.filter((entry) => entry.msg === 'interaction handled');
    expect(handled).toHaveLength(2);
    expect(handled[0]).toMatchObject({
      level: 20,
      interaction: { command: 'nothing', user: '700000000000000001' },
      ms: expect.any(Number) as number,
      lateMs: expect.any(Number) as number,
    });
    expect(handled[0]).not.toHaveProperty('deferMs');
    expect(handled[1]).toMatchObject({ interaction: { customId: 'p:1:join' } });
  });

  it('says in that line how long the deferral of a deferred command took', async () => {
    const { ctx, entries } = createTestContext();
    const cmd = command({
      defer: 'ephemeral',
      execute: async (i) => void (await i.editReply('ok')),
    });
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(fakeChatInput()));
    const handled = entries.find((entry) => entry.msg === 'interaction handled');
    expect(handled).toMatchObject({ deferMs: expect.any(Number) as number });
  });

  it('logs an unexpected error with a reference shown to the user', async () => {
    const { ctx, entries } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new Error('boom')) });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));

    const logged = entries.find((e) => e.msg === 'interaction failed');
    expect(logged?.ref).toMatch(/^[0-9a-f]{6}$/);
    expect(i.reply).toHaveBeenCalledWith({
      content: `Something went wrong. Try again in a moment; if it happens again, tell staff the code \`${String(logged?.ref)}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('uses followUp when the interaction was already deferred', async () => {
    const { ctx } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new UserError('Too late.')) });
    const i = fakeChatInput({ deferred: true });
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.followUp).toHaveBeenCalledWith({
      content: 'Too late.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('logs, does not throw, when the error reply itself fails', async () => {
    const { ctx, entries } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new Error('boom')) });
    const i = fakeChatInput();
    i.reply.mockImplementation(() => Promise.reject(new Error('Unknown interaction')));
    await expect(
      new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i)),
    ).resolves.toBeUndefined();
    const failed = entries.find((e) => e.msg === 'interaction failed');
    expect(entries.find((e) => e.msg === 'could not send error reply')).toMatchObject({
      level: 40,
      ref: failed?.ref,
      interaction: { command: 'test', user: '700000000000000001' },
    });
  });

  it('uses followUp when the command had already answered', async () => {
    const { ctx } = createTestContext();
    const cmd = command({
      execute: async (interaction) => {
        await interaction.reply({ content: 'Working on it.' });
        throw new UserError('That gym is in another region.');
      },
    });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.deleteReply).not.toHaveBeenCalled();
    expect(i.followUp).toHaveBeenCalledWith({
      content: 'That gym is in another region.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('acknowledges first when the command asks for it, after the guards', async () => {
    const { ctx } = createTestContext();
    const order: string[] = [];
    const cmd = (defer: 'ephemeral' | 'public') =>
      command({
        defer,
        guards: [() => void order.push('guard')],
        execute: (interaction) => {
          order.push(interaction.deferred ? 'execute after deferral' : 'execute');
          return Promise.resolve();
        },
      });
    const hidden = fakeChatInput();
    await new InteractionRouter(ctx, [cmd('ephemeral')], []).handle(asInteraction(hidden));
    expect(order).toEqual(['guard', 'execute after deferral']);
    expect(hidden.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });

    const open = fakeChatInput();
    await new InteractionRouter(ctx, [cmd('public')], []).handle(asInteraction(open));
    expect(open.deferReply).toHaveBeenCalledWith({});
    expect(open.ephemeral).toBe(false);
  });

  it('asks a command whose acknowledgement depends on the use, after guards and throttle', async () => {
    const { ctx } = createTestContext();
    const order: string[] = [];
    const cmd = command({
      guards: [() => void order.push('guard')],
      throttle: { uses: 2, perSeconds: 60 },
      defer: (interaction, context) => {
        order.push('defer?');
        expect(context).toBe(ctx);
        return interaction.user.id === 'staff' ? 'ephemeral' : undefined;
      },
      execute: (interaction) => {
        order.push(interaction.deferred ? 'execute after deferral' : 'execute');
        return Promise.resolve();
      },
    });
    const router = new InteractionRouter(ctx, [cmd], []);
    const staff = fakeChatInput({ userId: 'staff' });
    await router.handle(asInteraction(staff));
    expect(staff.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const member = fakeChatInput({ userId: 'member' });
    await router.handle(asInteraction(member));
    expect(member.deferReply).not.toHaveBeenCalled();
    expect(order).toEqual([
      'guard',
      'defer?',
      'execute after deferral',
      'guard',
      'defer?',
      'execute',
    ]);

    // A use the throttle refuses is not asked.
    await router.handle(asInteraction(fakeChatInput({ userId: 'staff' })));
    const third = fakeChatInput({ userId: 'staff' });
    await router.handle(asInteraction(third));
    expect(third.deferReply).not.toHaveBeenCalled();
    expect(order.filter((step) => step === 'defer?')).toHaveLength(3);
  });

  it('does not acknowledge a command that a guard refuses', async () => {
    const { ctx } = createTestContext();
    const cmd = command({
      defer: 'public',
      guards: [
        () => {
          throw new UserError('Use this in a raid post.');
        },
      ],
    });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.deferReply).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith({
      content: 'Use this in a raid post.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('keeps an error private after a public deferral by removing the "thinking" message', async () => {
    const { ctx } = createTestContext();
    const cmd = command({
      defer: 'public',
      execute: () => Promise.reject(new UserError('There is already a raid at that gym.')),
    });
    const i = fakeChatInput();
    const order: string[] = [];
    i.deleteReply.mockImplementation(() => {
      order.push('delete');
      return Promise.resolve();
    });
    i.followUp.mockImplementation(() => {
      order.push('followUp');
      return Promise.resolve();
    });
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(order).toEqual(['delete', 'followUp']);
    expect(i.followUp).toHaveBeenCalledWith({
      content: 'There is already a raid at that gym.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('cuts an error text to the length Discord allows', async () => {
    const { ctx } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new UserError('x'.repeat(3000))) });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    const content = (i.reply.mock.calls[0]?.[0] as { content: string }).content;
    expect(content).toHaveLength(2000);
    expect(content.endsWith('…')).toBe(true);
    expect(content.startsWith('x'.repeat(1999))).toBe(true);
  });

  it('leaves a text of exactly the limit as it is', async () => {
    const { ctx } = createTestContext();
    const cmd = command({ execute: () => Promise.reject(new UserError('y'.repeat(2000))) });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect((i.reply.mock.calls[0]?.[0] as { content: string }).content).toBe('y'.repeat(2000));
  });

  it('does not send the error as a follow-up when the "thinking" message could not be removed', async () => {
    const { ctx, entries } = createTestContext();
    const cmd = command({
      defer: 'public',
      execute: () => Promise.reject(new UserError('There is already a raid at that gym.')),
    });
    const i = fakeChatInput();
    i.deleteReply.mockImplementation(() => Promise.reject(new Error('Unknown Message')));
    await expect(
      new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i)),
    ).resolves.toBeUndefined();
    expect(i.followUp).not.toHaveBeenCalled();
    expect(entries.find((e) => e.msg === 'could not send error reply')).toMatchObject({
      level: 40,
      interaction: { command: 'test' },
    });
  });

  it('leaves the answer alone when the error comes after it, or the deferral was private', async () => {
    const { ctx } = createTestContext();
    const answered = command({
      defer: 'public',
      execute: async (interaction) => {
        await interaction.editReply({ content: 'Raid created.' });
        throw new Error('boom');
      },
    });
    const i = fakeChatInput();
    await new InteractionRouter(ctx, [answered], []).handle(asInteraction(i));
    expect(i.deleteReply).not.toHaveBeenCalled();
    expect(i.followUp).toHaveBeenCalledTimes(1);

    const hidden = command({
      defer: 'ephemeral',
      execute: () => Promise.reject(new UserError('No such gym.')),
    });
    const j = fakeChatInput();
    await new InteractionRouter(ctx, [hidden], []).handle(asInteraction(j));
    expect(j.deleteReply).not.toHaveBeenCalled();
    expect(j.followUp).toHaveBeenCalledWith({
      content: 'No such gym.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('refuses a member who uses a throttled command too often, until the window closes', async () => {
    const { ctx } = createTestContext();
    let now = 1_800_000_000_000;
    const execute = ran();
    const cmd = command({ throttle: { uses: 2, perSeconds: 180 }, execute });
    const router = new InteractionRouter(ctx, [cmd], [], { now: () => now });
    const use = async (userId?: string) => {
      const i = fakeChatInput(userId ? { userId } : {});
      await router.handle(asInteraction(i));
      return i;
    };

    await use();
    await use();
    now += 30_000;
    const third = await use();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(third.reply).toHaveBeenCalledWith({
      content: 'You can use /test again in 3 minutes.',
      flags: MessageFlags.Ephemeral,
    });

    await use('700000000000000002');
    expect(execute).toHaveBeenCalledTimes(3);

    now += 150_000;
    await use();
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('gives back the use of a command that failed unexpectedly, but not of one it refused', async () => {
    const { ctx } = createTestContext();
    let fail: Error | undefined = new Error('Missing Access');
    const execute = vi.fn(() => (fail ? Promise.reject(fail) : Promise.resolve()));
    const router = new InteractionRouter(
      ctx,
      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
      [],
    );
    const use = async () => {
      const i = fakeChatInput();
      await router.handle(asInteraction(i));
      return i;
    };
    // Failed, the use is given back: the member may try again at once.
    expect(sent((await use()).reply).content).toMatch(/^Something went wrong/);
    fail = new UserError('No such gym.');
    expect(sent((await use()).reply).content).toBe('No such gym.');
    // A refusal is the member's: it counted.
    expect(sent((await use()).reply).content).toBe('You can use /test again in 1 minute.');
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('gives back the use of a refusal that says it is none of the member’s doing', async () => {
    const { ctx } = createTestContext();
    const execute = vi.fn(() =>
      Promise.reject(new UserError('I may not make posts there.', { givesBack: true })),
    );
    const router = new InteractionRouter(
      ctx,
      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
      [],
    );
    for (let n = 0; n < 2; n++) {
      const i = fakeChatInput();
      await router.handle(asInteraction(i));
      expect(sent(i.reply).content).toBe('I may not make posts there.');
    }
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('tells the command when it counted its use, by its own clock', async () => {
    const { ctx } = createTestContext();
    let seen: number | undefined;
    const execute = vi.fn((interaction: ChatInputCommandInteraction) => {
      seen = whenCounted(interaction);
      return Promise.resolve();
    });
    const router = new InteractionRouter(
      ctx,
      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
      [],
      { now: () => 5_000 },
    );
    await router.handle(asInteraction(fakeChatInput()));
    expect(seen).toBe(5_000);
    // A command without a limit counted nothing.
    const free = new InteractionRouter(ctx, [command({ execute })], [], { now: () => 5_000 });
    await free.handle(asInteraction(fakeChatInput()));
    expect(seen).toBeUndefined();
  });

  it('counts the uses of another name of a command as the command’s, and names the name typed', async () => {
    const { ctx } = createTestContext();
    const execute = ran();
    const cmd = command({ throttle: { uses: 2, perSeconds: 180 }, execute });
    const router = new InteractionRouter(ctx, [cmd, alsoAs(cmd, 'other')], [], {
      now: () => 1_800_000_000_000,
    });
    await router.handle(asInteraction(fakeChatInput()));
    await router.handle(asInteraction(fakeChatInput({ commandName: 'other' })));
    const third = fakeChatInput({ commandName: 'other' });
    await router.handle(asInteraction(third));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(third.reply).toHaveBeenCalledWith({
      content: 'You can use /other again in 3 minutes.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('asks a command whose limit depends on where it is used, and counts each limit apart', async () => {
    const { ctx } = createTestContext();
    let now = 1_800_000_000_000;
    const execute = ran();
    const quick = { uses: 1, perSeconds: 60 };
    const slow = { uses: 1, perSeconds: 180 };
    const cmd = command({
      throttle: (interaction) => (interaction.channelId === 'slow' ? slow : quick),
      execute,
    });
    const router = new InteractionRouter(ctx, [cmd], [], { now: () => now });
    const use = async (channelId: string) => {
      const i = fakeChatInput({ channelId });
      await router.handle(asInteraction(i));
      return i;
    };

    await use('quick');
    // The other limit has its own count.
    await use('slow');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(sent((await use('quick')).reply).content).toBe('You can use /test again in 1 minute.');
    expect(sent((await use('slow')).reply).content).toBe('You can use /test again in 3 minutes.');
    now += 61_000;
    await use('quick');
    expect(execute).toHaveBeenCalledTimes(3);
    expect(sent((await use('slow')).reply).content).toBe('You can use /test again in 2 minutes.');
  });

  it('counts two limits of one length apart too', async () => {
    const { ctx } = createTestContext();
    const execute = ran();
    const once = { uses: 1, perSeconds: 60 };
    const twice = { uses: 2, perSeconds: 60 };
    const cmd = command({
      throttle: (interaction) => (interaction.channelId === 'once' ? once : twice),
      execute,
    });
    const router = new InteractionRouter(ctx, [cmd], [], { now: () => 1_800_000_000_000 });
    const use = async (channelId: string) => {
      const i = fakeChatInput({ channelId });
      await router.handle(asInteraction(i));
      return i;
    };
    await use('once');
    await use('twice');
    // The use that was counted once has not used up one of the two.
    await use('twice');
    expect(execute).toHaveBeenCalledTimes(3);
    expect(sent((await use('twice')).reply).content).toBe('You can use /test again in 1 minute.');
    expect(sent((await use('once')).reply).content).toBe('You can use /test again in 1 minute.');
  });

  it('does not limit a use for which the command names no limit', async () => {
    const { ctx } = createTestContext();
    const execute = ran();
    const router = new InteractionRouter(
      ctx,
      [command({ throttle: () => undefined, execute })],
      [],
    );
    for (let n = 0; n < 5; n++) await router.handle(asInteraction(fakeChatInput()));
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('does not count a use that a guard refused, and throttles subcommands separately', async () => {
    const { ctx } = createTestContext();
    let allowed = false;
    const [create, remove] = [ran(), ran()];
    const once = { uses: 1, perSeconds: 60 };
    const router = new InteractionRouter(
      ctx,
      [
        gym([
          part('create', {
            throttle: once,
            execute: create,
            guards: [
              () => {
                if (!allowed) throw new UserError('Not here.');
              },
            ],
          }),
          part('delete', { throttle: once, execute: remove }),
        ]),
      ],
      [],
      { now: () => 1_800_000_000_000 },
    );
    const use = async (subcommand: string) => {
      const i = fakeChatInput({ commandName: 'gym', subcommand });
      await router.handle(asInteraction(i));
      return i;
    };

    await use('create');
    allowed = true;
    await use('create');
    expect(create).toHaveBeenCalledTimes(1);
    await use('delete');
    expect(remove).toHaveBeenCalledTimes(1);
    const again = await use('create');
    expect(again.reply).toHaveBeenCalledWith({
      content: 'You can use /gym create again in 1 minute.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('answers an unknown command and logs a warning', async () => {
    const { ctx, entries } = createTestContext();
    const i = fakeChatInput({ commandName: 'gone' });
    await new InteractionRouter(ctx, [], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({
      content: 'That command is not available.',
      flags: MessageFlags.Ephemeral,
    });
    expect(entries.find((e) => e.msg === 'no handler for command')).toMatchObject({
      level: 40,
      interaction: { command: 'gone' },
    });
  });

  it('runs the subcommand that was used, alone and inside a group', async () => {
    const { ctx } = createTestContext();
    const [create, show] = [ran(), ran()];
    const router = new InteractionRouter(
      ctx,
      [gym([part('create', { execute: create }), part('show', { group: 'queue', execute: show })])],
      [],
    );

    await router.handle(asInteraction(fakeChatInput({ commandName: 'gym', subcommand: 'create' })));
    expect(create).toHaveBeenCalledTimes(1);
    expect(show).not.toHaveBeenCalled();

    await router.handle(
      asInteraction(
        fakeChatInput({ commandName: 'gym', subcommandGroup: 'queue', subcommand: 'show' }),
      ),
    );
    expect(show).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('runs the guards of the command, then those of the subcommand, then the subcommand', async () => {
    const { ctx } = createTestContext();
    const order: string[] = [];
    const create = part('create', {
      guards: [() => void order.push('create guard')],
      execute: vi.fn(() => {
        order.push('create');
        return Promise.resolve();
      }),
    });
    const remove = part('delete', { guards: [() => void order.push('delete guard')] });
    const router = new InteractionRouter(
      ctx,
      [gym([create, remove], [() => void order.push('gym guard')])],
      [],
    );
    await router.handle(asInteraction(fakeChatInput({ commandName: 'gym', subcommand: 'create' })));
    expect(order).toEqual(['gym guard', 'create guard', 'create']);
  });

  it('does not run a subcommand whose own guard refuses', async () => {
    const { ctx } = createTestContext();
    const removed = ran();
    const create = part('create');
    const remove = part('delete', {
      execute: removed,
      guards: [
        () => {
          throw new UserError('Only admins and moderators can do that.');
        },
      ],
    });
    const router = new InteractionRouter(ctx, [gym([create, remove])], []);
    const i = fakeChatInput({ commandName: 'gym', subcommand: 'delete' });
    await router.handle(asInteraction(i));
    expect(removed).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith({
      content: 'Only admins and moderators can do that.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('answers a subcommand it does not know (the deployed commands are out of date)', async () => {
    const { ctx, entries } = createTestContext();
    const router = new InteractionRouter(ctx, [gym([part('create')])], []);
    const i = fakeChatInput({ commandName: 'gym', subcommand: 'rename' });
    await router.handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({
      content: 'That command is not available.',
      flags: MessageFlags.Ephemeral,
    });
    expect(entries.find((e) => e.msg === 'no handler for command')).toMatchObject({
      interaction: { command: 'gym', subcommand: 'rename' },
    });
  });

  it('answers a subcommand that a simple command does not have, without running it', async () => {
    const { ctx, entries } = createTestContext();
    const execute = ran();
    const router = new InteractionRouter(ctx, [command({ execute })], []);
    const i = fakeChatInput({ commandName: 'test', subcommand: 'new' });
    await router.handle(asInteraction(i));
    expect(execute).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith({
      content: 'That command is not available.',
      flags: MessageFlags.Ephemeral,
    });
    expect(entries.find((e) => e.msg === 'no handler for command')).toMatchObject({
      level: 40,
      interaction: { command: 'test', subcommand: 'new' },
    });
  });

  it('does not run a subcommand when the guard of the whole command refuses', async () => {
    const { ctx } = createTestContext();
    const created = ran();
    const refuse: Guard = () => {
      throw new UserError('Only admins and moderators can do that.');
    };
    const router = new InteractionRouter(
      ctx,
      [gym([part('create', { execute: created })], [refuse])],
      [],
    );
    const i = fakeChatInput({ commandName: 'gym', subcommand: 'create' });
    await router.handle(asInteraction(i));
    expect(created).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith({
      content: 'Only admins and moderators can do that.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('sends autocomplete to the subcommand being typed', async () => {
    const { ctx } = createTestContext();
    const editChoices = vi.fn(() => Promise.resolve());
    const router = new InteractionRouter(
      ctx,
      [gym([part('create'), part('edit', { autocomplete: editChoices })])],
      [],
    );
    await router.handle(
      asInteraction(fakeAutocomplete({ commandName: 'gym', subcommand: 'edit' })),
    );
    expect(editChoices).toHaveBeenCalledTimes(1);

    const none = fakeAutocomplete({ commandName: 'gym', subcommand: 'create' });
    await router.handle(asInteraction(none));
    expect(none.respond).toHaveBeenCalledWith([]);
  });

  describe('autocomplete of a command for staff', () => {
    const refuse: Guard = () => {
      throw new UserError('Only staff can do that.');
    };
    /** `/gym edit` with a list; for staff (`default_member_permissions`) unless told otherwise. */
    function staffGym(options: { staff?: boolean; guards?: Guard[]; partGuards?: Guard[] }) {
      const choices = vi.fn((i: { respond(c: unknown[]): Promise<void> }) =>
        i.respond([{ name: 'Big Fountain', value: 'id:1' }]),
      );
      const data = new SlashCommandBuilder().setName('gym').setDescription('Gyms');
      if (options.staff !== false)
        data.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
      const grouped = commandGroup({
        data,
        help: { category: 'admin' },
        ...(options.guards ? { guards: options.guards } : {}),
        parts: [
          part('edit', {
            autocomplete: choices as never,
            ...(options.partGuards ? { guards: options.partGuards } : {}),
          }),
        ],
      });
      return { grouped, choices };
    }
    const typing = () => fakeAutocomplete({ commandName: 'gym', subcommand: 'edit' });

    it('runs the guards of the command and answers an empty list to whom they refuse', async () => {
      const { ctx, entries } = createTestContext();
      const { grouped, choices } = staffGym({ guards: [refuse] });
      const i = typing();
      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(i));
      expect(choices).not.toHaveBeenCalled();
      expect(i.respond).toHaveBeenCalledTimes(1);
      expect(i.respond).toHaveBeenCalledWith([]);
      // A refusal is no error: nothing is logged, nothing is said.
      expect(entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
    });

    it('answers the list to whom the guards let through, also an asynchronous one', async () => {
      const { ctx } = createTestContext();
      const seen: unknown[] = [];
      const allow: Guard = async (interaction) => {
        await Promise.resolve();
        seen.push(interaction);
      };
      const { grouped, choices } = staffGym({ guards: [allow] });
      const i = typing();
      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(i));
      expect(seen).toEqual([i]);
      expect(choices).toHaveBeenCalledTimes(1);
      expect(i.respond).toHaveBeenCalledWith([{ name: 'Big Fountain', value: 'id:1' }]);
    });

    it('does not run the guards of the subcommand', async () => {
      const { ctx } = createTestContext();
      const { grouped, choices } = staffGym({ guards: [], partGuards: [refuse] });
      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(typing()));
      expect(choices).toHaveBeenCalledTimes(1);
    });

    it('does not run the guards of a command that is for everybody', async () => {
      const { ctx } = createTestContext();
      const { grouped, choices } = staffGym({ staff: false, guards: [refuse] });
      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(typing()));
      expect(choices).toHaveBeenCalledTimes(1);
    });

    it('answers an empty list and logs when a guard fails for another reason', async () => {
      const { ctx, entries } = createTestContext();
      const broken: Guard = () => {
        throw new Error('roles unavailable');
      };
      const { grouped, choices } = staffGym({ guards: [broken] });
      const i = typing();
      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(i));
      expect(choices).not.toHaveBeenCalled();
      expect(i.respond).toHaveBeenCalledWith([]);
      expect(entries.some((entry) => entry.msg === 'autocomplete failed')).toBe(true);
    });
  });

  it('responds with no choices for a command without autocomplete', async () => {
    const { ctx } = createTestContext();
    const i = fakeAutocomplete();
    await new InteractionRouter(ctx, [command()], []).handle(asInteraction(i));
    expect(i.respond).toHaveBeenCalledWith([]);
  });

  it('refuses at construction a command whose definition and handlers disagree', () => {
    const { ctx } = createTestContext();
    const grouped = gym([part('create')]);
    const missingHandler = { ...grouped, subcommands: new Map() };
    expect(() => new InteractionRouter(ctx, [missingHandler], [])).toThrow(
      '/gym declares the subcommands [create] but handles []',
    );
    const extraHandler = {
      ...grouped,
      subcommands: new Map([...grouped.subcommands, ['edit', part('edit')]]),
    };
    expect(() => new InteractionRouter(ctx, [extraHandler], [])).toThrow(
      '/gym declares the subcommands [create] but handles [create, edit]',
    );
    // A command that declares subcommands needs a handler for each, not one `execute`.
    const simple = command({ data: grouped.data });
    expect(() => new InteractionRouter(ctx, [simple], [])).toThrow(
      '/gym declares the subcommands [create] but handles []',
    );
  });

  it('routes a button, a select menu and a modal to the handler of their kind', async () => {
    const { ctx } = createTestContext();
    const [button, select, modal, other] = [ran(), ran(), ran(), ran()];
    const router = new InteractionRouter(
      ctx,
      [],
      [
        { kind: 'p', button, select, modal },
        { kind: 'dm', button: other },
      ],
    );

    const click = fakeButton({ customId: 'p:abc:join' });
    await router.handle(asInteraction(click));
    expect(button).toHaveBeenCalledWith(
      click,
      { kind: 'p', id: 'abc', action: 'join', args: [] },
      ctx,
    );

    const choice = fakeSelect({ customId: 'p:abc:group', values: ['B'] });
    await router.handle(asInteraction(choice));
    expect(select).toHaveBeenCalledWith(
      choice,
      { kind: 'p', id: 'abc', action: 'group', args: [] },
      ctx,
    );

    const form = fakeModal({ customId: 'p:abc:time:hatch', fields: { time: '6pm' } });
    await router.handle(asInteraction(form));
    expect(modal).toHaveBeenCalledWith(
      form,
      { kind: 'p', id: 'abc', action: 'time', args: ['hatch'] },
      ctx,
    );

    expect([button, select, modal].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(other).not.toHaveBeenCalled();
  });

  it('answers a kind of control its handler does not have as no longer active', async () => {
    const { ctx, entries } = createTestContext();
    const button = ran();
    const router = new InteractionRouter(ctx, [], [{ kind: 'p', button }]);
    const form = fakeModal({ customId: 'p:abc:time' });
    await router.handle(asInteraction(form));
    expect(form.reply).toHaveBeenCalledWith({
      content: STALE_COMPONENT,
      flags: MessageFlags.Ephemeral,
    });
    expect(button).not.toHaveBeenCalled();
    expect(entries.find((e) => e.msg === 'no handler for component')).toMatchObject({
      level: 40,
      interaction: { customId: 'p:abc:time' },
      reason: 'no-such-control',
    });
  });

  it('answers a select menu its handler does not have as no longer active', async () => {
    const { ctx } = createTestContext();
    const button = ran();
    const router = new InteractionRouter(ctx, [], [{ kind: 'p', button }]);
    const menu = fakeSelect({ customId: 'p:abc:group', values: ['B'] });
    await router.handle(asInteraction(menu));
    expect(sent(menu.reply).content).toBe(STALE_COMPONENT);
    expect(button).not.toHaveBeenCalled();
  });

  it('says in the log why a control had no handler', async () => {
    const { ctx, entries } = createTestContext();
    const router = new InteractionRouter(ctx, [], [{ kind: 'p', button: ran() }]);
    await router.handle(asInteraction(fakeButton({ customId: 'pinejoin' })));
    await router.handle(asInteraction(fakeButton({ customId: 'q:abc:join' })));
    const reasons = entries
      .filter((e) => e.msg === 'no handler for component')
      .map((e) => e.reason);
    expect(reasons).toEqual(['undecodable', 'unknown-kind']);
  });

  it('limits how often a member may use the controls of one kind, all of them together', async () => {
    const { ctx } = createTestContext();
    let now = 1_800_000_000_000;
    const button = ran();
    const select = ran();
    const other = ran();
    const router = new InteractionRouter(
      ctx,
      [],
      [
        { kind: 'p', throttle: { uses: 2, perSeconds: 60 }, button, select },
        { kind: 'q', button: other },
      ],
      { now: () => now },
    );
    const click = async (customId: string, userId?: string) => {
      const i = fakeButton({ customId, ...(userId ? { userId } : {}) });
      await router.handle(asInteraction(i));
      return i;
    };
    await click('p:abc:join');
    await router.handle(asInteraction(fakeSelect({ customId: 'p:abc:group', values: ['B'] })));
    now += 20_000;
    const third = await click('p:xyz:here');
    expect(button).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(third.reply).toHaveBeenCalledWith({
      content: 'That was a lot of clicks. Try again in 40 seconds.',
      flags: MessageFlags.Ephemeral,
    });
    // Another member, and another kind of control, are not held back.
    await click('p:abc:join', '700000000000000002');
    expect(button).toHaveBeenCalledTimes(2);
    await click('q:abc:go');
    expect(other).toHaveBeenCalledTimes(1);
    now += 40_000;
    await click('p:abc:join');
    expect(button).toHaveBeenCalledTimes(3);
  });

  it('counts the controls of a kind in the throttles it is given, which the live map shares', async () => {
    const { ctx } = createTestContext();
    const now = 1_800_000_000_000;
    const throttles = new Throttles();
    const button = ran();
    const router = new InteractionRouter(
      ctx,
      [],
      [{ kind: 'p', throttle: { uses: 2, perSeconds: 60 }, button }],
      { now: () => now, throttles },
    );
    // Two uses elsewhere (the map's presses) leave none for the post.
    for (let n = 0; n < 2; n++) {
      throttles.use(
        controlThrottleKey('p'),
        '700000000000000001',
        { uses: 2, perSeconds: 60 },
        now,
      );
    }
    const i = fakeButton({ customId: 'p:abc:join', userId: '700000000000000001' });
    await router.handle(asInteraction(i));
    expect(button).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledWith({
      content: 'That was a lot of clicks. Try again in 1 minute.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('asks a kind whose controls count differently which limit a control has', async () => {
    const { ctx } = createTestContext();
    const button = ran();
    const modal = ran();
    const router = new InteractionRouter(
      ctx,
      [],
      [
        {
          kind: 'p',
          // Opening the form is free; submitting it counts, one in a minute.
          throttle: (_interaction, id) =>
            id.action === 'form' ? { uses: 1, perSeconds: 60 } : undefined,
          button,
          modal,
        },
      ],
    );
    for (let n = 0; n < 3; n++) {
      await router.handle(asInteraction(fakeButton({ customId: 'p:abc:open' })));
    }
    const submit = async () => {
      const i = fakeModal({ customId: 'p:abc:form' });
      await router.handle(asInteraction(i));
      return i;
    };
    await submit();
    const second = await submit();
    expect(button).toHaveBeenCalledTimes(3);
    expect(modal).toHaveBeenCalledTimes(1);
    expect(second.reply).toHaveBeenCalledWith({
      content: 'That was a lot of clicks. Try again in 1 minute.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('counts a control that names a command in that command’s window', async () => {
    const { ctx } = createTestContext();
    const execute = ran();
    const modal = ran();
    const cmd = command({ throttle: { uses: 2, perSeconds: 60 }, execute });
    const router = new InteractionRouter(
      ctx,
      [cmd],
      [
        {
          kind: 'p',
          throttle: (_interaction, id) =>
            id.action === 'form' ? { uses: 2, perSeconds: 60, as: 'test' } : undefined,
          modal,
        },
      ],
    );
    await router.handle(asInteraction(fakeChatInput({ commandName: 'test' })));
    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
    const third = fakeModal({ customId: 'p:abc:form' });
    await router.handle(asInteraction(third));
    const fourth = fakeChatInput({ commandName: 'test' });
    await router.handle(asInteraction(fourth));
    expect([execute.mock.calls.length, modal.mock.calls.length]).toEqual([1, 1]);
    expect(sent(third.reply).content).toBe('You can use /test again in 1 minute.');
    expect(sent(fourth.reply).content).toBe('You can use /test again in 1 minute.');
  });

  it('refuses a command before its form when the window its form counts in is full, counting nothing', async () => {
    const { ctx } = createTestContext();
    const execute = ran();
    const modal = ran();
    const order: string[] = [];
    const window = { uses: 2, perSeconds: 60, as: 'test' };
    const router = new InteractionRouter(
      ctx,
      [
        command({
          guards: [() => void order.push('guard')],
          checks: window,
          execute,
        }),
      ],
      [{ kind: 'p', throttle: () => window, modal }],
    );
    // Opening the form counts nothing: any number of times.
    for (let n = 0; n < 3; n++) {
      await router.handle(asInteraction(fakeChatInput({ commandName: 'test' })));
    }
    expect(execute).toHaveBeenCalledTimes(3);
    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
    const refused = fakeChatInput({ commandName: 'test' });
    await router.handle(asInteraction(refused));
    expect(execute).toHaveBeenCalledTimes(3);
    expect(sent(refused.reply).content).toBe('You can use /test again in 1 minute.');
    expect(order).toHaveLength(4);
    // Another member's window is their own.
    await router.handle(
      asInteraction(fakeChatInput({ commandName: 'test', userId: '700000000000000002' })),
    );
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('checks a control before its form in the window the form counts in, after the guards', async () => {
    const { ctx } = createTestContext();
    const button = ran();
    const modal = ran();
    let refuse = false;
    const form = { uses: 1, perSeconds: 60 };
    const router = new InteractionRouter(
      ctx,
      [],
      [
        {
          kind: 'p',
          guards: [
            () => {
              if (refuse) throw new UserError('Not you.');
            },
          ],
          // The press that opens the form counts as reading; the form counts in its own window.
          throttle: (_interaction, id) =>
            id.action === 'form' ? form : { uses: 30, perSeconds: 60 },
          checks: (_interaction, id) => (id.action === 'open' ? form : undefined),
          button,
          modal,
        },
      ],
    );
    const press = async () => {
      const i = fakeButton({ customId: 'p:abc:open' });
      await router.handle(asInteraction(i));
      return i;
    };
    await press();
    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
    const full = await press();
    expect(sent(full.reply).content).toBe('That was a lot of clicks. Try again in 1 minute.');
    refuse = true;
    const guarded = await press();
    expect(sent(guarded.reply).content).toBe('Not you.');
    expect([button.mock.calls.length, modal.mock.calls.length]).toEqual([1, 1]);
  });

  it('gives back the use of a control that failed, and of the command whose use its form carries on', async () => {
    const { ctx } = createTestContext();
    let fails = true;
    const execute = ran();
    const modal = vi.fn(() =>
      fails ? Promise.reject(new Error('Missing Access')) : Promise.resolve(),
    );
    const button = vi.fn(() => Promise.reject(new Error('Unknown interaction')));
    const router = new InteractionRouter(
      ctx,
      [command({ throttle: { uses: 1, perSeconds: 60 }, execute })],
      [
        {
          kind: 'p',
          throttle: (_interaction, id) =>
            id.action === 'press' ? { uses: 1, perSeconds: 60 } : undefined,
          // The form of `/test`: its command counted the use, which a failure here gives back.
          carriesOn: (_interaction, id) =>
            id.action === 'form'
              ? { uses: 1, perSeconds: 60, as: 'test', countedAt: Date.now() }
              : undefined,
          button,
          modal,
        },
      ],
    );
    const run = async () => {
      const i = fakeChatInput();
      await router.handle(asInteraction(i));
      return i;
    };
    await run();
    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
    await run();
    fails = false;
    await router.handle(asInteraction(fakeModal({ customId: 'p:abc:form' })));
    expect(sent((await run()).reply).content).toBe('You can use /test again in 1 minute.');
    expect(execute).toHaveBeenCalledTimes(2);
    // A press that failed is given back too.
    for (let n = 0; n < 2; n++) {
      await router.handle(asInteraction(fakeButton({ customId: 'p:abc:press' })));
    }
    expect(button).toHaveBeenCalledTimes(2);
  });

  it('keeps the budget of a kind of control apart from a command of a like name', async () => {
    const { ctx } = createTestContext();
    const execute = ran();
    const button = ran();
    // A command named like the throttle of a kind would be: `component` with subcommand `p`.
    const cmd = commandGroup({
      data: new SlashCommandBuilder().setName('component').setDescription('x'),
      help: { category: 'util' },
      parts: [part('p', { throttle: { uses: 1, perSeconds: 60 }, execute })],
    });
    const router = new InteractionRouter(
      ctx,
      [cmd],
      [{ kind: 'p', throttle: { uses: 1, perSeconds: 60 }, button }],
    );
    await router.handle(
      asInteraction(fakeChatInput({ commandName: 'component', subcommand: 'p' })),
    );
    await router.handle(asInteraction(fakeButton({ customId: 'p:abc:join' })));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(button).toHaveBeenCalledTimes(1);
  });

  it('does not count a click that a guard of the handler refused', async () => {
    const { ctx } = createTestContext();
    let allowed = false;
    const guard: Guard = () => {
      if (!allowed) throw new UserError('Not yet.');
    };
    const button = ran();
    const router = new InteractionRouter(
      ctx,
      [],
      [{ kind: 'p', guards: [guard], throttle: { uses: 1, perSeconds: 60 }, button }],
    );
    await router.handle(asInteraction(fakeButton({ customId: 'p:abc:join' })));
    allowed = true;
    await router.handle(asInteraction(fakeButton({ customId: 'p:abc:join' })));
    expect(button).toHaveBeenCalledTimes(1);
  });

  it('runs the guards of a component handler before it', async () => {
    const { ctx } = createTestContext();
    const button = ran();
    const refuse: Guard = () => {
      throw new UserError('This only works in a server.');
    };
    const router = new InteractionRouter(ctx, [], [{ kind: 'p', guards: [refuse], button }]);
    const click = fakeButton({ customId: 'p:abc:join' });
    await router.handle(asInteraction(click));
    expect(button).not.toHaveBeenCalled();
    expect(click.reply).toHaveBeenCalledWith({
      content: 'This only works in a server.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('reports an error from a component after it acknowledged, as a follow-up', async () => {
    const { ctx } = createTestContext();
    const handler: ComponentHandler = {
      kind: 'p',
      button: async (interaction) => {
        await interaction.deferUpdate();
        throw new UserError('This raid has ended.');
      },
    };
    const click = fakeButton({ customId: 'p:abc:join' });
    await new InteractionRouter(ctx, [], [handler]).handle(asInteraction(click));
    expect(click.deleteReply).not.toHaveBeenCalled();
    expect(click.followUp).toHaveBeenCalledWith({
      content: 'This raid has ended.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('rejects duplicate component kinds at construction', () => {
    const { ctx } = createTestContext();
    expect(
      () =>
        new InteractionRouter(
          ctx,
          [],
          [
            { kind: 'p', button: ran() },
            { kind: 'p', modal: ran() },
          ],
        ),
    ).toThrow('Duplicate component kind "p"');
  });

  it('tells the user a legacy or unknown control is no longer active', async () => {
    const { ctx } = createTestContext();
    const i = fakeButton({ customId: 'pinejoin' });
    await new InteractionRouter(ctx, [], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({
      content: STALE_COMPONENT,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('responds with no choices when autocomplete fails', async () => {
    const { ctx } = createTestContext();
    const cmd = command({ autocomplete: () => Promise.reject(new Error('search down')) });
    const i = fakeAutocomplete();
    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
    expect(i.respond).toHaveBeenCalledWith([]);
  });

  it('rejects duplicate command names at construction', () => {
    const { ctx } = createTestContext();
    expect(() => new InteractionRouter(ctx, [command(), command()], [])).toThrow(
      /Duplicate command \/test/,
    );
  });
});

describe('InteractionRouter and message commands', () => {
  function onMessage(overrides: Partial<MessageCommand> = {}): MessageCommand {
    return {
      target: 'message',
      data: new ContextMenuCommandBuilder()
        .setName('Report to moderators')
        .setType(ApplicationCommandType.Message),
      help: { category: 'util', description: 'Tell the moderators about a message' },
      run: vi.fn(() => Promise.resolve()),
      ...overrides,
    };
  }
  const used = (o: Parameters<typeof fakeMessageCommand>[0] = {}) =>
    fakeMessageCommand({ targetMessage: { id: '800000000000000001', authorId: '1' }, ...o });

  it('runs the guards, then the command used on a message, by its name', async () => {
    const { ctx } = createTestContext();
    const order: string[] = [];
    const run = vi.fn((interaction: { targetMessage: { id: string } }) => {
      order.push(`run ${interaction.targetMessage.id}`);
      return Promise.resolve();
    });
    const reported = onMessage({ guards: [() => void order.push('guard')], run });
    const otherRun = ran();
    const other = onMessage({
      data: new ContextMenuCommandBuilder()
        .setName('Something else')
        .setType(ApplicationCommandType.Message),
      run: otherRun,
    });
    const router = new InteractionRouter(ctx, [command(), reported, other], []);
    await router.handle(asInteraction(used()));
    expect(order).toEqual(['guard', 'run 800000000000000001']);
    expect(otherRun).not.toHaveBeenCalled();
  });

  it('answers a refusal privately, and counts only what the guards let through', async () => {
    const { ctx } = createTestContext();
    let refuse = true;
    const run = ran();
    const router = new InteractionRouter(
      ctx,
      [
        onMessage({
          guards: [
            () => {
              if (refuse) throw new UserError('Nothing to report there.');
            },
          ],
          throttle: { uses: 1, perSeconds: 3600 },
          run,
        }),
      ],
      [],
    );
    const refused = used();
    await router.handle(asInteraction(refused));
    expect(refused.reply).toHaveBeenCalledWith({
      content: 'Nothing to report there.',
      flags: MessageFlags.Ephemeral,
    });
    refuse = false;
    await router.handle(asInteraction(used()));
    const again = used();
    await router.handle(asInteraction(again));
    expect(run).toHaveBeenCalledTimes(1);
    expect(again.reply).toHaveBeenCalledWith({
      content: 'You can use Report to moderators again in 60 minutes.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('checks the window of the command its form counts in before it runs, counting nothing', async () => {
    const { ctx } = createTestContext();
    const run = ran();
    const window = { uses: 1, perSeconds: 3600, as: 'report' };
    const router = new InteractionRouter(
      ctx,
      [onMessage({ checks: window, run })],
      [{ kind: 'report', throttle: () => window, modal: ran() }],
    );
    await router.handle(asInteraction(used()));
    await router.handle(asInteraction(used()));
    expect(run).toHaveBeenCalledTimes(2);
    await router.handle(asInteraction(fakeModal({ customId: 'report:abc:party' })));
    const full = used();
    await router.handle(asInteraction(full));
    expect(run).toHaveBeenCalledTimes(2);
    expect(sent(full.reply).content).toBe('You can use /report again in 60 minutes.');
  });

  it('gives back the use of a message command that failed unexpectedly', async () => {
    const { ctx } = createTestContext();
    const run = vi.fn(() => Promise.reject(new Error('Missing Access')));
    const router = new InteractionRouter(
      ctx,
      [onMessage({ throttle: { uses: 1, perSeconds: 3600 }, run })],
      [],
    );
    for (let n = 0; n < 2; n++) await router.handle(asInteraction(used()));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('acknowledges privately first when the command asks for it', async () => {
    const { ctx } = createTestContext();
    const i = used();
    const run = vi.fn(() => {
      expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      return Promise.resolve();
    });
    await new InteractionRouter(ctx, [onMessage({ defer: 'ephemeral', run })], []).handle(
      asInteraction(i),
    );
    expect(run).toHaveBeenCalled();
  });

  it('answers a message command it does not know, and refuses two of one name', async () => {
    const { ctx, entries } = createTestContext();
    const i = used({ commandName: 'Gone' });
    await new InteractionRouter(ctx, [onMessage()], []).handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledWith({
      content: 'That command is not available.',
      flags: MessageFlags.Ephemeral,
    });
    expect(entries.some((entry) => entry.msg === 'no handler for command')).toBe(true);
    expect(() => new InteractionRouter(ctx, [onMessage(), onMessage()], [])).toThrow(
      /Duplicate command Report to moderators/,
    );
  });
});

describe('InteractionRouter in rehearsal mode', () => {
  const MATT = '412345678901234501';
  const rehearsing = () =>
    createTestContext({
      rehearsal: new Rehearsal({ allowlist: [MATT], regions: ['west'], staffRoles: ['Moderator'] }),
    });

  it('answers a member who is neither on the allowlist nor staff with the refusal alone', async () => {
    const { ctx } = rehearsing();
    const execute = ran();
    const cmd = command({ execute });
    const button = ran();
    const handler: ComponentHandler = { kind: 'p', button };
    const router = new InteractionRouter(ctx, [cmd], [handler]);
    const typed = fakeChatInput({ permissions: PermissionFlagsBits.SendMessages });
    await router.handle(asInteraction(typed));
    const pressed = fakeButton({ customId: 'p:1:join' });
    await router.handle(asInteraction(pressed));
    expect(execute).not.toHaveBeenCalled();
    expect(button).not.toHaveBeenCalled();
    for (const fake of [typed, pressed]) {
      expect(sent(fake.reply)).toMatchObject({
        content: REHEARSAL_REFUSAL,
        flags: MessageFlags.Ephemeral,
      });
    }
    const typing = fakeAutocomplete({ commandName: 'test' });
    await router.handle(asInteraction(typing));
    expect(typing.respond).toHaveBeenCalledWith([]);
  });

  it('answers privately outside the rehearsed forums, and as usual in their posts', async () => {
    const { ctx } = rehearsing();
    const execute = vi.fn((interaction: ChatInputCommandInteraction) =>
      interaction.reply({ content: 'Public' }).then(() => undefined),
    );
    const router = new InteractionRouter(ctx, [command({ execute })], []);
    const outside = fakeChatInput({ userId: MATT, channelId: WEST_CHANNEL });
    await router.handle(asInteraction(outside));
    expect(sent(outside.reply).flags).toBe(MessageFlags.Ephemeral);
    const inPost = fakeChatInput({
      userId: MATT,
      channelId: '100000000000000099',
      thread: { parentId: WEST_FORUM },
      guildChannelNames: { [WEST_CHANNEL]: 'west' },
    });
    await router.handle(asInteraction(inPost));
    expect(sent(inPost.reply).flags ?? 0).toBe(0);
  });

  it('keeps a public deferral, its edit and its follow-ups private outside the rehearsed forums', async () => {
    const { ctx } = rehearsing();
    const execute = vi.fn(async (interaction: ChatInputCommandInteraction) => {
      await interaction.editReply({ content: 'Raid created.' });
      await interaction.followUp({ content: 'And one more thing.' });
    });
    const router = new InteractionRouter(ctx, [command({ defer: 'public', execute })], []);
    const i = fakeChatInput({ userId: MATT, channelId: WEST_CHANNEL });
    await router.handle(asInteraction(i));
    // The edit is of the deferral, as private as it is.
    expect(sent(i.deferReply).flags).toBe(MessageFlags.Ephemeral);
    expect(i.editReply).toHaveBeenCalledWith({ content: 'Raid created.' });
    expect(sent(i.followUp)).toEqual({
      content: 'And one more thing.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('answers a late command privately, quick or acknowledged late', async () => {
    const { ctx } = rehearsing();
    const timers: (() => void)[] = [];
    const work = { slow: false };
    const execute = vi.fn(async (interaction: ChatInputCommandInteraction) => {
      // A slow one: the acknowledgement's time comes first, through the same interaction.
      if (work.slow) timers.at(-1)?.();
      await answer(interaction, { content: 'Saved.' });
    });
    const router = new InteractionRouter(ctx, [command({ defer: 'late', execute })], [], {
      setTimer: (run) => {
        timers.push(run);
        return () => undefined;
      },
    });
    const quick = fakeChatInput({ userId: MATT, channelId: WEST_CHANNEL });
    await router.handle(asInteraction(quick));
    expect(quick.reply).toHaveBeenCalledExactlyOnceWith({
      content: 'Saved.',
      flags: MessageFlags.Ephemeral,
    });
    work.slow = true;
    const slow = fakeChatInput({ userId: MATT, channelId: WEST_CHANNEL });
    await router.handle(asInteraction(slow));
    expect(sent(slow.deferReply).flags).toBe(MessageFlags.Ephemeral);
    expect(slow.reply).not.toHaveBeenCalled();
    expect(slow.editReply).toHaveBeenCalledWith({ content: 'Saved.' });
  });

  it('answers the allowlist and staff as always', async () => {
    const { ctx } = rehearsing();
    const execute = ran();
    const router = new InteractionRouter(ctx, [command({ execute })], []);
    await router.handle(asInteraction(fakeChatInput({ userId: MATT })));
    await router.handle(
      asInteraction(fakeChatInput({ permissions: PermissionFlagsBits.ManageGuild })),
    );
    await router.handle(asInteraction(fakeChatInput({ roleNames: ['Moderator'] })));
    expect(execute).toHaveBeenCalledTimes(3);
  });
});
