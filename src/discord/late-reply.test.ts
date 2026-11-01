import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
} from '../../test/support/fake-interactions.js';
import { createTestContext } from '../../test/support/test-context.js';
import { watchImmediates, type ImmediateWatch } from '../../test/support/timers.js';
import type { SimpleCommand } from './command.js';
import { UserError } from './errors.js';
import { container, textDisplay } from '../render/v2.js';
import {
  answer,
  answerPress,
  deferPress,
  LATE_DEFER_MS,
  ANSWERED_BELOW,
  answerApart,
  pressAnswer,
  sayInPlace,
  showInPlace,
  v2Answer,
} from './late-reply.js';
import type { V2Message } from './party-gateway.js';
import { InteractionRouter } from './router.js';

const asInteraction = (fake: unknown) => fake as Interaction;
const EPHEMERAL = { flags: MessageFlags.Ephemeral };

/** A late command whose work is `work`; `timers` are the acknowledgements that wait. */
function late(work: (interaction: ChatInputCommandInteraction) => Promise<void>) {
  const { ctx, entries } = createTestContext();
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const command: SimpleCommand = {
    data: { name: 'test', toJSON: () => ({ name: 'test', description: 'Test' }) },
    help: { category: 'util' },
    defer: 'late',
    execute: work,
  };
  const router = new InteractionRouter(ctx, [command], [], {
    setTimer: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  const handled = () => entries.find((entry) => entry.msg === 'interaction handled');
  return { router, timers, entries, handled };
}

/** A promise with its `resolve` and `reject` outside. */
function gate() {
  let open: () => void = () => undefined;
  let fail: (err: unknown) => void = () => undefined;
  const closed = new Promise<void>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });
  return { closed, open, fail };
}

/** What the handling began is done, as far as it can come without a gate being opened. */
let immediates: ImmediateWatch;
beforeEach(() => {
  immediates = watchImmediates();
});
afterEach(() => {
  immediates.restore();
});
const settle = () => immediates.settle();

describe('a command with a late deferral', () => {
  it('answers directly, for the member alone, when its work is quick', async () => {
    const { router, timers, handled } = late((i) => answer(i, { content: 'Saved.' }));
    const i = fakeChatInput();
    await router.handle(asInteraction(i));
    expect(i.deferReply).not.toHaveBeenCalled();
    expect(i.editReply).not.toHaveBeenCalled();
    expect(i.reply).toHaveBeenCalledExactlyOnceWith({ content: 'Saved.', ...EPHEMERAL });
    expect(timers).toMatchObject([{ cancelled: true }]);
    expect(handled()).not.toHaveProperty('deferMs');
  });

  it('is acknowledged for the member alone when its work takes long, and then edits that', async () => {
    const work = gate();
    const { router, timers, handled } = late(async (i) => {
      await work.closed;
      await answer(i, { content: 'Saved.' });
      await answer(i, { content: 'Saved twice.' });
    });
    const i = fakeChatInput();
    const handling = router.handle(asInteraction(i));
    await settle();
    expect(i.deferReply).not.toHaveBeenCalled();
    timers[0]?.run();
    await settle();
    expect(i.deferReply).toHaveBeenCalledExactlyOnceWith(EPHEMERAL);
    work.open();
    await handling;
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.editReply.mock.calls).toEqual([
      [{ content: 'Saved.' }],
      [{ content: 'Saved twice.' }],
    ]);
    expect(handled()).toMatchObject({ deferMs: expect.any(Number) as number });
  });

  it('waits for an acknowledgement that is on its way before it answers', async () => {
    const acknowledged = gate();
    const reached = gate();
    const { router, timers } = late(async (i) => {
      await reached.closed;
      await answer(i, { content: 'Saved.' });
    });
    const i = fakeChatInput();
    const deferReply = i.deferReply.getMockImplementation();
    i.deferReply.mockImplementationOnce(async (payload) => {
      await acknowledged.closed;
      await deferReply?.(payload);
    });
    const handling = router.handle(asInteraction(i));
    await settle();
    timers[0]?.run();
    reached.open();
    await settle();
    // Neither a second acknowledgement nor an edit of what is not there yet.
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.editReply).not.toHaveBeenCalled();
    acknowledged.open();
    await handling;
    expect(i.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'Saved.' });
  });

  it('answers a refusal directly when nothing was acknowledged', async () => {
    const { router, timers } = late(() => Promise.reject(new UserError('Not like that.')));
    const i = fakeChatInput();
    await router.handle(asInteraction(i));
    expect(i.reply).toHaveBeenCalledExactlyOnceWith({ content: 'Not like that.', ...EPHEMERAL });
    expect(timers).toMatchObject([{ cancelled: true }]);
    // The timer comes to nothing even if it fires after all.
    timers[0]?.run();
    expect(i.deferReply).not.toHaveBeenCalled();
  });

  it('answers a refusal after an acknowledgement that was on its way', async () => {
    const acknowledged = gate();
    const reached = gate();
    const { router, timers } = late(async () => {
      await reached.closed;
      throw new UserError('Not like that.');
    });
    const i = fakeChatInput();
    const deferReply = i.deferReply.getMockImplementation();
    i.deferReply.mockImplementationOnce(async (payload) => {
      await acknowledged.closed;
      await deferReply?.(payload);
    });
    const handling = router.handle(asInteraction(i));
    await settle();
    timers[0]?.run();
    reached.open();
    await settle();
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.followUp).not.toHaveBeenCalled();
    acknowledged.open();
    await handling;
    expect(i.reply).not.toHaveBeenCalled();
    expect(i.followUp).toHaveBeenCalledExactlyOnceWith({ content: 'Not like that.', ...EPHEMERAL });
  });

  it('says so when the late acknowledgement fails, and still answers', async () => {
    const work = gate();
    const { router, timers, entries } = late(async (i) => {
      await work.closed;
      await answer(i, { content: 'Saved.' });
    });
    const i = fakeChatInput();
    i.deferReply.mockImplementationOnce(() => Promise.reject(new Error('Discord is away')));
    const handling = router.handle(asInteraction(i));
    await settle();
    timers[0]?.run();
    await settle();
    work.open();
    await handling;
    expect(i.reply).toHaveBeenCalledExactlyOnceWith({ content: 'Saved.', ...EPHEMERAL });
    expect(
      entries.filter((entry) => entry.msg === 'could not acknowledge a command late'),
    ).toMatchObject([{ level: 40, err: { message: 'Discord is away' } }]);
  });

  it('acknowledges an interaction that arrived late so much sooner', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: 1_800_000_000_000 });
    try {
      const { router, timers } = late((i) => answer(i, { content: 'Saved.' }));
      await router.handle(asInteraction(fakeChatInput()));
      await router.handle(
        asInteraction(fakeChatInput({ createdTimestamp: 1_800_000_000_000 - 600 })),
      );
      await router.handle(
        asInteraction(fakeChatInput({ createdTimestamp: 1_800_000_000_000 - 5_000 })),
      );
      // A clock that is ahead of Discord's makes nothing later.
      await router.handle(
        asInteraction(fakeChatInput({ createdTimestamp: 1_800_000_000_000 + 900 })),
      );
      expect(timers.map((timer) => timer.ms)).toEqual([
        LATE_DEFER_MS,
        LATE_DEFER_MS - 600,
        0,
        LATE_DEFER_MS,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('answer', () => {
  it('edits what stands for an interaction that was acknowledged', async () => {
    const i = fakeChatInput({ deferred: true });
    await answer(i as unknown as ChatInputCommandInteraction, { content: 'Done.' });
    expect(i.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'Done.' });
    expect(i.reply).not.toHaveBeenCalled();
  });

  it('is the first answer, for the member alone, for one that was not', async () => {
    const i = fakeChatInput();
    await answer(i as unknown as ChatInputCommandInteraction, { content: 'Done.' });
    await answer(i as unknown as ChatInputCommandInteraction, { content: 'Done again.' });
    expect(i.reply).toHaveBeenCalledExactlyOnceWith({ content: 'Done.', ...EPHEMERAL });
    expect(i.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'Done again.' });
  });

  it('edits an acknowledgement into a components-v2 message with its flag and components', async () => {
    const i = fakeChatInput({ deferred: true });
    const message: V2Message = {
      v2: true,
      components: [container(0x5865f2, [textDisplay('### A list')])],
    };
    await answer(i as unknown as ChatInputCommandInteraction, v2Answer(message));
    expect(i.editReply).toHaveBeenCalledExactlyOnceWith({
      components: message.components,
      flags: MessageFlags.IsComponentsV2,
    });
  });

  it('sends a components-v2 first answer for the member alone, with both flags', async () => {
    const i = fakeChatInput();
    const message: V2Message = { v2: true, components: [container(0x5865f2, [textDisplay('x')])] };
    await answer(i as unknown as ChatInputCommandInteraction, v2Answer(message));
    expect(i.reply).toHaveBeenCalledExactlyOnceWith({
      components: message.components,
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  });
});

describe('a press on the controls of an answer', () => {
  const ASKER = '700000000000000001';
  const OTHER = '700000000000000002';
  const message: V2Message = { v2: true, components: [container(0x5865f2, [textDisplay('x')])] };
  const V2_PRIVATE = { flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };

  it('changes a public answer when its asker pressed, and gives anybody else a copy', async () => {
    const own = fakeButton({ customId: 'a:1:b', userId: ASKER, askedBy: ASKER, v2Message: true });
    expect(pressAnswer(own as unknown as ButtonInteraction)).toBe('update');
    await answerPress(own as unknown as ButtonInteraction, 'update', message);
    expect(own.update).toHaveBeenCalledExactlyOnceWith(v2Answer(message));

    const other = fakeButton({ customId: 'a:1:b', userId: OTHER, askedBy: ASKER });
    expect(pressAnswer(other as unknown as ButtonInteraction)).toBe('copy');
    await answerPress(other as unknown as ButtonInteraction, 'copy', message);
    expect(other.reply).toHaveBeenCalledExactlyOnceWith({
      components: message.components,
      ...V2_PRIVATE,
    });
    expect(other.update).not.toHaveBeenCalled();
    // Without metadata nobody is known to have asked: a copy.
    expect(pressAnswer(fakeButton({ customId: 'a:1:b' }) as unknown as ButtonInteraction)).toBe(
      'copy',
    );
  });

  it('always changes a private answer, and never shows what is private in a public one', () => {
    const own = fakeButton({ customId: 'a:1:b', userId: ASKER, ephemeralMessage: true });
    expect(pressAnswer(own as unknown as ButtonInteraction)).toBe('update');
    expect(pressAnswer(own as unknown as ButtonInteraction, { onlyPrivate: true })).toBe('update');
    const asker = fakeButton({ customId: 'a:1:b', userId: ASKER, askedBy: ASKER });
    expect(pressAnswer(asker as unknown as ButtonInteraction, { onlyPrivate: true })).toBe('copy');
  });

  it('acknowledges first as it will answer, and then edits what it acknowledged', async () => {
    const own = fakeModal({ customId: 'a:1:form', userId: ASKER, askedBy: ASKER, v2Message: true });
    await deferPress(own as unknown as ModalSubmitInteraction, 'update');
    expect(own.deferUpdate).toHaveBeenCalledOnce();
    await answerPress(own as unknown as ModalSubmitInteraction, 'update', message);
    expect(own.editReply).toHaveBeenCalledExactlyOnceWith(v2Answer(message));

    const other = fakeModal({ customId: 'a:1:form', userId: OTHER, askedBy: ASKER });
    await deferPress(other as unknown as ModalSubmitInteraction, 'copy');
    expect(other.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
    await answerPress(other as unknown as ModalSubmitInteraction, 'copy', message);
    expect(other.editReply).toHaveBeenCalledExactlyOnceWith(v2Answer(message));
  });

  it('updates the message a form came from, and answers privately a form that came from none', async () => {
    const fromMessage = fakeModal({
      customId: 'a:1:form',
      userId: ASKER,
      askedBy: ASKER,
      v2Message: true,
    });
    await answerPress(fromMessage as unknown as ModalSubmitInteraction, 'update', message);
    expect(fromMessage.update).toHaveBeenCalledOnce();
    const fromCommand = fakeModal({ customId: 'a:1:form', modalFromCommand: true });
    await answerPress(fromCommand as unknown as ModalSubmitInteraction, 'update', message);
    expect(fromCommand.reply).toHaveBeenCalledExactlyOnceWith({
      components: message.components,
      ...V2_PRIVATE,
    });
    // Acknowledged first, it is a private "thinking…", which the answer then edits.
    const slow = fakeModal({ customId: 'a:1:form', modalFromCommand: true });
    await deferPress(slow as unknown as ModalSubmitInteraction, 'update');
    expect(slow.deferUpdate).not.toHaveBeenCalled();
    expect(slow.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
  });
});

describe('showInPlace and sayInPlace', () => {
  const view: V2Message = {
    v2: true,
    components: [container(1, [textDisplay('The new view')])],
    files: ['var/images/gyms/1-abc.png'],
  };
  const pictured: V2Message = {
    ...view,
    components: [
      container(1, [
        textDisplay('The new view'),
        { type: 12, items: [{ media: { url: 'attachment://1-abc.png' } }] },
      ]),
    ],
  };

  it('updates a v2 message in place, its files replacing the old ones', async () => {
    const press = fakeButton({ customId: 'x:1:y', v2Message: true });
    await showInPlace(press as unknown as ButtonInteraction, pictured);
    expect(sent(press.update)).toEqual({
      components: pictured.components,
      flags: MessageFlags.IsComponentsV2,
      files: view.files,
      attachments: [],
    });
    expect(press.followUp).not.toHaveBeenCalled();
  });

  it('closes a classic message with a line and sends the view privately below it', async () => {
    const press = fakeButton({ customId: 'x:1:y' });
    await press.deferUpdate();
    await showInPlace(press as unknown as ButtonInteraction, pictured, 'Old.');
    expect(sent(press.editReply)).toEqual({
      content: 'Old.',
      embeds: [],
      components: [],
      attachments: [],
    });
    expect(sent(press.followUp)).toEqual({
      components: pictured.components,
      files: view.files,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    const other = fakeButton({ customId: 'x:1:y' });
    await showInPlace(other as unknown as ButtonInteraction, view);
    expect(sent(other.update).content).toBe(ANSWERED_BELOW);
  });

  it('refuses to show in place what follows a private deferral: that is an answer apart', async () => {
    const press = fakeButton({ customId: 'x:1:y', v2Message: true });
    await press.deferReply({ flags: MessageFlags.Ephemeral });
    await expect(showInPlace(press as unknown as ButtonInteraction, view)).rejects.toThrow(
      'answerApart',
    );
    await answerApart(press as unknown as ButtonInteraction, view);
    expect(sent(press.editReply)).toEqual({ ...v2Answer(view) });
    const fresh = fakeButton({ customId: 'x:1:y', v2Message: true });
    await answerApart(fresh as unknown as ButtonInteraction, view);
    expect(sent(fresh.reply).flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    expect(fresh.update).not.toHaveBeenCalled();
  });

  it('answers a form a command opened with a private message', async () => {
    const form = fakeModal({ customId: 'x:1:y', modalFromCommand: true });
    await showInPlace(form as unknown as ModalSubmitInteraction, view);
    expect(sent(form.reply).flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
  });

  it('answers a form a command opened after its deferral, and says a sentence apart after one', async () => {
    const form = fakeModal({ customId: 'x:1:y', modalFromCommand: true });
    await form.deferReply({ flags: MessageFlags.Ephemeral });
    await showInPlace(form as unknown as ModalSubmitInteraction, view);
    expect(sent(form.editReply).flags).toBe(MessageFlags.IsComponentsV2);
    // A press answered in a private message of its own says a refusal there, not in place.
    const apart = fakeButton({ customId: 'x:1:y', v2Message: true });
    await apart.deferReply({ flags: MessageFlags.Ephemeral });
    await sayInPlace(apart as unknown as ButtonInteraction, 'Gone.', 7);
    expect(sent(apart.editReply)).toEqual(
      v2Answer({
        v2: true,
        components: [container(7, [textDisplay('Gone.')])],
      }),
    );
  });

  it('says a sentence as v2 on a v2 message and as text on a classic one', async () => {
    const onV2 = fakeButton({ customId: 'x:1:y', v2Message: true });
    await sayInPlace(onV2 as unknown as ButtonInteraction, 'Expired.', 7);
    expect(sent(onV2.update)).toMatchObject({
      components: [container(7, [textDisplay('Expired.')])],
      flags: MessageFlags.IsComponentsV2,
      attachments: [],
    });
    const onClassic = fakeButton({ customId: 'x:1:y' });
    await sayInPlace(onClassic as unknown as ButtonInteraction, 'Expired.', 7);
    expect(sent(onClassic.update)).toEqual({
      content: 'Expired.',
      embeds: [],
      components: [],
      attachments: [],
    });
  });
});
