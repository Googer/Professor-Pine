import { MessageFlags, type MessageComponentInteraction } from 'discord.js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { fakeButton, type FakeInteraction } from '../../test/support/fake-interactions.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ClickAnswers } from './click-answers.js';

const privately = (content: string) => ({ content, flags: MessageFlags.Ephemeral });
const real = (fake: FakeInteraction) => fake as unknown as MessageComponentInteraction;

function setup(windowMs = 60_000) {
  const { log, entries } = createTestLogger();
  return { answers: new ClickAnswers({ log, windowMs }), entries };
}

describe('ClickAnswers', () => {
  it('answers the first click at once and privately', async () => {
    const { answers } = setup();
    const click = fakeButton();
    await answers.answer('p:a', real(click), 'You are coming.');
    expect(click.reply).toHaveBeenCalledWith(privately('You are coming.'));
    expect(click.deferUpdate).not.toHaveBeenCalled();
    await answers.flush();
    expect(click.editReply).not.toHaveBeenCalled();
  });

  it('only acknowledges the clicks that follow, and then replaces the first answer by the last', async () => {
    const { answers } = setup();
    const [first, second, third] = [fakeButton(), fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'You are coming.');
    await answers.answer('p:a', real(second), 'You are coming with 1 more.');
    await answers.answer('p:a', real(third), 'You are coming with 2 more.');
    for (const later of [second, third]) {
      expect(later.deferUpdate).toHaveBeenCalledOnce();
      expect(later.reply).not.toHaveBeenCalled();
    }
    expect(first.editReply).not.toHaveBeenCalled();
    await answers.flush();
    expect(first.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'You are coming with 2 more.',
    });
    expect(third.followUp).not.toHaveBeenCalled();
  });

  it('shows it by itself when the member stops clicking for the length of the window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { answers } = setup(20);
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    // The window starts anew with every click: it ends 20 ms after the second.
    vi.advanceTimersByTime(19);
    expect(first.editReply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(first.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'two' });
    // The burst is over: the next click is answered at once again.
    const next = fakeButton();
    await answers.answer('p:a', real(next), 'three');
    expect(next.reply).toHaveBeenCalledWith(privately('three'));
    await answers.flush();
  });

  it('keeps the bursts of different members and parties apart', async () => {
    const { answers } = setup();
    const [alice, bob, other] = [fakeButton(), fakeButton(), fakeButton()];
    await answers.answer('p:a', real(alice), 'a');
    await answers.answer('p:b', real(bob), 'b');
    await answers.answer('q:a', real(other), 'c');
    for (const click of [alice, bob, other]) expect(click.reply).toHaveBeenCalledOnce();
    await answers.flush();
  });

  it('says it under the last click when the first answer cannot be replaced', async () => {
    const { answers, entries } = setup();
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    first.editReply.mockRejectedValueOnce(new Error('Unknown Message'));
    await answers.flush();
    expect(second.followUp).toHaveBeenCalledExactlyOnceWith(privately('two'));
    expect(entries).toEqual([]);
  });

  it('logs a warning when the answer can be shown in neither way', async () => {
    const { answers, entries } = setup();
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    first.editReply.mockRejectedValueOnce(new Error('Unknown Message'));
    second.followUp.mockRejectedValueOnce(new Error('Unknown Webhook'));
    await answers.flush();
    expect(entries.map((entry) => entry.msg)).toEqual([
      'could not show the answer to a burst of clicks',
    ]);
  });

  it('starts anew after a first answer that could not be sent', async () => {
    const { answers } = setup();
    const failed = fakeButton();
    failed.reply.mockRejectedValueOnce(new Error('Unknown interaction'));
    await expect(answers.answer('p:a', real(failed), 'one')).rejects.toThrow('Unknown interaction');
    const next = fakeButton();
    await answers.answer('p:a', real(next), 'two');
    expect(next.reply).toHaveBeenCalledWith(privately('two'));
    await answers.flush();
  });

  it('says the answer of a click that joined a burst whose first answer then failed', async () => {
    const { answers } = setup();
    const [first, second] = [fakeButton(), fakeButton()];
    let fail: (err: Error) => void = () => undefined;
    first.reply.mockReturnValueOnce(
      new Promise<never>((_resolve, reject) => {
        fail = reject;
      }),
    );
    const opening = answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    expect(second.deferUpdate).toHaveBeenCalledOnce();
    fail(new Error('Unknown interaction'));
    await expect(opening).rejects.toThrow('Unknown interaction');
    await answers.flush();
    expect(second.followUp).toHaveBeenCalledExactlyOnceWith(privately('two'));
    expect(first.editReply).not.toHaveBeenCalled();
  });

  it('answers a click acknowledged late in the place of its acknowledgement', async () => {
    const { answers } = setup();
    const first = fakeButton({ deferred: true });
    await answers.answer('p:a', real(first), 'You are coming.');
    expect(first.reply).not.toHaveBeenCalled();
    expect(first.editReply).toHaveBeenCalledExactlyOnceWith({ content: 'You are coming.' });
    // A later click of the burst still replaces it.
    const second = fakeButton();
    await answers.answer('p:a', real(second), 'You are coming with 1 more.');
    expect(second.deferUpdate).toHaveBeenCalledOnce();
    await answers.flush();
    expect(first.editReply).toHaveBeenLastCalledWith({ content: 'You are coming with 1 more.' });
  });

  it('answers a later click of a burst that was acknowledged late by itself', async () => {
    const { answers } = setup();
    const first = fakeButton();
    await answers.answer('p:a', real(first), 'You are coming.');
    const late = fakeButton({ deferred: true });
    await answers.answer('p:a', real(late), 'You are coming with 1 more.');
    expect(late.deferUpdate).not.toHaveBeenCalled();
    expect(late.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'You are coming with 1 more.',
    });
    // Nothing of it is left to show at the end of the burst.
    await answers.flush();
    expect(first.editReply).not.toHaveBeenCalled();
  });

  it('ends the burst at a click acknowledged late, so that no older answer is shown after it', async () => {
    const { answers } = setup();
    const first = fakeButton();
    await answers.answer('p:a', real(first), 'You are coming.');
    const second = fakeButton();
    await answers.answer('p:a', real(second), 'You are coming with 1 more.');
    const late = fakeButton({ deferred: true });
    await answers.answer('p:a', real(late), 'You are coming with 2 more.');
    expect(late.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'You are coming with 2 more.',
    });
    await answers.flush();
    expect(first.editReply).not.toHaveBeenCalled();
    expect(second.followUp).not.toHaveBeenCalled();
    // The next click starts a burst of its own.
    const next = fakeButton();
    await answers.answer('p:a', real(next), 'You are coming with 3 more.');
    expect(next.reply).toHaveBeenCalledOnce();
  });

  it('answers every click by itself with a window of zero', async () => {
    const { answers } = setup(0);
    const [first, second] = [fakeButton(), fakeButton()];
    await answers.answer('p:a', real(first), 'one');
    await answers.answer('p:a', real(second), 'two');
    expect(second.reply).toHaveBeenCalledWith(privately('two'));
    expect(second.deferUpdate).not.toHaveBeenCalled();
  });
});
