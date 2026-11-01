import { ComponentType } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkModal, fakeModal } from '../../test/support/fake-interactions.js';
import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import {
  DIALOG_READ_MS,
  SLOW_READ,
  channelInDialog,
  dialog,
  openToken,
  pickedOf,
  readInTime,
  selectedOf,
  withoutOpenToken,
} from './dialog.js';
import { UserError } from './errors.js';

describe('dialog', () => {
  it('is a title and a text, with Discord’s own Submit and Cancel', () => {
    const shown = dialog({ customId: 'x:1:go', title: 'Remove a region', text: 'Remove it?' });
    checkModal(shown);
    expect(shown.custom_id).toBe('x:1:go');
    expect(shown.title).toBe('Remove a region');
    expect(dialogTexts(shown)).toEqual(['Remove it?']);
    expect(dialogChoices(shown)).toEqual([]);
  });

  it('asks a choice as a required radio group with nothing picked', () => {
    const shown = dialog({
      customId: 'x:1:go',
      title: 'Close this raid',
      text: 'Close this raid?',
      choice: {
        id: 'removal',
        label: 'The post',
        options: [
          { value: 'archive', label: 'Archive post', description: 'Keeps it.' },
          { value: 'delete', label: 'Delete post', description: 'Removes it.' },
        ],
      },
    });
    checkModal(shown);
    expect(dialogTexts(shown)).toEqual(['Close this raid?']);
    const [label] = shown.components.filter((one) => one.type === ComponentType.Label);
    expect(label).toMatchObject({
      label: 'The post',
      component: { type: ComponentType.RadioGroup, custom_id: 'removal', required: true },
    });
    expect(dialogChoices(shown)).toEqual([
      { value: 'archive', label: 'Archive post', description: 'Keeps it.', picked: false },
      { value: 'delete', label: 'Delete post', description: 'Removes it.', picked: false },
    ]);
  });

  it('marks the choice that starts picked, which goes first in its list (plan 8X-1B)', () => {
    const shown = dialog({
      customId: 'x:1:go',
      title: 'Join this raid',
      choice: {
        id: 'group',
        label: 'Which group?',
        options: [
          { value: 'B', label: 'Group B' },
          { value: 'A', label: 'Group A' },
        ],
        picked: 'B',
      },
    });
    checkModal(shown);
    // A dialog may be its choice alone: Discord adds a box of its own at the top.
    expect(dialogTexts(shown)).toEqual([]);
    expect(dialogChoices(shown).map(({ value, picked }) => [value, picked])).toEqual([
      ['B', true],
      ['A', false],
    ]);
    // A choice it does not have picks nothing.
    const none = dialog({
      customId: 'x:1:go',
      title: 'Join this raid',
      choice: {
        id: 'group',
        label: 'Which group?',
        options: [
          { value: 'B', label: 'Group B' },
          { value: 'A', label: 'Group A' },
        ],
        picked: 'C',
      },
    });
    expect(dialogChoices(none).some(({ picked }) => picked)).toBe(false);
  });

  it('asks a long choice in a menu, its default chosen to start with, and takes a line of text', () => {
    const shown = dialog({
      customId: 'x:1:go',
      title: 'Meeting time',
      text: 'For your group: everybody in it is told.',
      choice: {
        id: 'time',
        label: 'When does your group meet?',
        menu: true,
        options: Array.from({ length: 12 }, (_, n) => ({ value: `t${n}`, label: `7:${n}5` })),
        picked: 't3',
      },
      field: { id: 'label', label: 'Label for a new group (optional)', maxLength: 100 },
    });
    checkModal(shown);
    const menu = shown.components.find(
      (one) =>
        one.type === ComponentType.Label && one.component.type === ComponentType.StringSelect,
    );
    expect(menu).toMatchObject({
      label: 'When does your group meet?',
      component: { custom_id: 'time', required: true, min_values: 1, max_values: 1 },
    });
    const field = shown.components.find(
      (one) => one.type === ComponentType.Label && one.component.type === ComponentType.TextInput,
    );
    expect(field).toMatchObject({
      label: 'Label for a new group (optional)',
      component: { custom_id: 'label', required: false, max_length: 100 },
    });
  });

  it('is refused by the fake as Discord would refuse two choices picked to start with', () => {
    const shown = dialog({
      customId: 'x:1:go',
      title: 'Join this raid',
      choice: {
        id: 'group',
        label: 'Which group?',
        options: [
          { value: 'B', label: 'Group B' },
          { value: 'A', label: 'Group A' },
        ],
        picked: 'B',
      },
    });
    const twice = structuredClone(shown);
    const label = twice.components.find((one) => one.type === ComponentType.Label);
    if (label?.type !== ComponentType.Label || label.component.type !== ComponentType.RadioGroup) {
      throw new Error('no radio group');
    }
    for (const option of label.component.options) option.default = true;
    expect(() => checkModal(twice)).toThrow(/2 options ticked by default, at most 1/);
  });

  it('asks several choices, each under its label, in order (plan 8X-G: Manage…)', () => {
    const shown = dialog({
      customId: 'x:1:go',
      title: 'Manage the train',
      text: 'At stop 2 of 4.',
      choices: [
        {
          id: 'route',
          label: 'The route',
          options: [
            { value: 'keep', label: 'Keep it as it is' },
            { value: 'reverse', label: 'Reverse it' },
          ],
          picked: 'keep',
        },
        {
          id: 'atend',
          label: 'At the end of the route',
          menu: true,
          options: [
            { value: 'finish', label: 'Finish', emoji: '🏁' },
            { value: 'loop', label: 'Loop', emoji: '🔁' },
          ],
          picked: 'loop',
        },
      ],
    });
    checkModal(shown);
    const labels = shown.components.flatMap((component) =>
      component.type === ComponentType.Label ? [[component.label, component.component.type]] : [],
    );
    expect(labels).toEqual([
      ['The route', ComponentType.RadioGroup],
      ['At the end of the route', ComponentType.StringSelect],
    ]);
    expect(dialogChoices(shown).map(({ value, picked }) => [value, picked])).toEqual([
      ['keep', true],
      ['reverse', false],
      ['finish', false],
      ['loop', true],
    ]);
    // A menu's option keeps its emoji.
    const menu = shown.components.find(
      (component) =>
        component.type === ComponentType.Label &&
        component.component.type === ComponentType.StringSelect,
    );
    expect(menu).toMatchObject({ component: { options: [{ emoji: { name: '🏁' } }, {}] } });
  });

  it('cuts a title and a text to what Discord takes', () => {
    const shown = dialog({ customId: 'x:1:go', title: 'T'.repeat(60), text: 'w'.repeat(5_000) });
    checkModal(shown);
    expect(shown.title).toHaveLength(45);
    expect(dialogTexts(shown)[0]).toHaveLength(4_000);
  });
});

describe('channelInDialog', () => {
  it('names a channel by its name, and one the bot cannot find as a deleted one', () => {
    expect(channelInDialog('oakland')).toBe('#oakland');
    expect(channelInDialog('north_hills_')).toBe('#north\\_hills\\_');
    expect(channelInDialog(undefined)).toBe('a deleted channel');
  });
});

describe('the per-open token (plan 8X-F)', () => {
  it('is a custom id argument of its own each time, which a Submit leaves out', () => {
    expect(openToken(1_000)).not.toBe(openToken(2_000));
    expect(withoutOpenToken(['in', 'A', 'mh0k', openToken(1_000)])).toEqual(['in', 'A', 'mh0k']);
    // A dialog drawn before the token: as it was.
    expect(withoutOpenToken(['in', 'A', 'mh0k'])).toEqual(['in', 'A', 'mh0k']);
  });

  // Review r0, F-A5: only the last argument is the token.
  it('leaves an argument that is not last as it is, whatever it begins with', () => {
    expect(withoutOpenToken(['~x', 'A', openToken(1_000)])).toEqual(['~x', 'A']);
    expect(withoutOpenToken(['~x', 'A'])).toEqual(['~x', 'A']);
  });
});

describe('readInTime', () => {
  const NOW = 1_800_000_000_000;
  /** An interaction made just now, by the faked clock. */
  const fresh = { createdTimestamp: NOW };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives what was read in time, and leaves no timer behind', async () => {
    const { log } = createTestLogger();
    await expect(readInTime(log, fresh, () => Promise.resolve(12))).resolves.toBe(12);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a refusal of the read on as it is', async () => {
    const { log } = createTestLogger();
    const refusal = new UserError('A raid is there.');
    await expect(readInTime(log, fresh, () => Promise.reject(refusal))).rejects.toBe(refusal);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a read that throws at once on, and leaves no timer behind', async () => {
    const { log } = createTestLogger();
    const refusal = new UserError('There is no gym #13.');
    await expect(
      readInTime(log, fresh, () => {
        throw refusal;
      }),
    ).rejects.toBe(refusal);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses a read past the budget, giving the use back, and logs its late failure', async () => {
    const { log, entries } = createTestLogger();
    let fail: (err: Error) => void = () => undefined;
    const slow = new Promise<number>((_, reject) => {
      fail = reject;
    });
    const read = readInTime(log, fresh, () => slow);
    const refused = expect(read).rejects.toMatchObject({
      message: SLOW_READ,
      givesBack: true,
    });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS - 1);
    await vi.advanceTimersByTimeAsync(1);
    await refused;
    fail(new Error('connection lost'));
    // The read's own handler was attached first: it has run once this one does.
    await slow.catch(() => undefined);
    expect(entries.some((entry) => entry.level === 40 && entry.msg === 'a slow read failed')).toBe(
      true,
    );
  });

  it('counts the budget from when the interaction was made, not from when the read began', async () => {
    const { log } = createTestLogger();
    let settled = false;
    const read = readInTime(
      log,
      { createdTimestamp: NOW - 1_500 },
      () => new Promise<number>(() => undefined),
    );
    const refused = expect(read).rejects.toMatchObject({ message: SLOW_READ });
    void read.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS - 1_500 - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await refused;
    // An interaction older than the budget gets no time at all.
    const old = readInTime(
      log,
      { createdTimestamp: NOW - 5_000 },
      () => new Promise(() => undefined),
    );
    const refusedAtOnce = expect(old).rejects.toMatchObject({ message: SLOW_READ });
    await vi.advanceTimersByTimeAsync(0);
    await refusedAtOnce;
  });

  it('refuses a read that comes past the budget before its timer ran (a busy event loop)', async () => {
    const { log } = createTestLogger();
    let done: (n: number) => void = () => undefined;
    const read = readInTime(
      log,
      fresh,
      () =>
        new Promise<number>((resolve) => {
          done = resolve;
        }),
    );
    // The clock moves past the budget, but the timer has not run yet.
    vi.setSystemTime(NOW + DIALOG_READ_MS + 1);
    done(3);
    await expect(read).rejects.toMatchObject({ message: SLOW_READ, givesBack: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not refuse a read that comes just in time', async () => {
    const { log } = createTestLogger();
    let done: (n: number) => void = () => undefined;
    const read = readInTime(
      log,
      fresh,
      () =>
        new Promise<number>((resolve) => {
          done = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS - 1);
    done(3);
    await expect(read).resolves.toBe(3);
  });
});

describe('pickedOf', () => {
  it('gives the choice picked, and nothing for one that is no choice of the dialog', () => {
    const picked = fakeModal({ customId: 'x:1:go', picked: { removal: 'delete' } });
    expect(pickedOf(picked as never, 'removal', ['archive', 'delete'])).toBe('delete');
    const other = fakeModal({ customId: 'x:1:go', picked: { removal: 'burn' } });
    expect(pickedOf(other as never, 'removal', ['archive', 'delete'])).toBeUndefined();
  });

  it('gives nothing for a Submit without the radio group (a dialog of an older shape)', () => {
    const older = fakeModal({ customId: 'x:1:go' });
    expect(pickedOf(older as never, 'removal', ['archive', 'delete'])).toBeUndefined();
  });
});

describe('selectedOf', () => {
  it('gives the option a menu chose, and nothing for none of its values or no menu', () => {
    const chosen = fakeModal({ customId: 'x:1:go', selected: { atend: ['loop'] } });
    expect(selectedOf(chosen as never, 'atend', ['finish', 'loop'])).toBe('loop');
    const other = fakeModal({ customId: 'x:1:go', selected: { atend: ['spin'] } });
    expect(selectedOf(other as never, 'atend', ['finish', 'loop'])).toBeUndefined();
    const older = fakeModal({ customId: 'x:1:go' });
    expect(selectedOf(older as never, 'atend', ['finish', 'loop'])).toBeUndefined();
  });
});
