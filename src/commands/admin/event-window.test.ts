import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bossCommandsWith, MEMBER } from '../../../test/support/boss-commands.js';
import { MemoryEventWindows } from '../../../test/support/event-window-store.js';
import {
  asV2,
  type FakeInteraction,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import { textOf } from '../../../test/support/messages.js';
import { zonedAt } from '../../../test/support/time.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { EventWindowService } from '../../services/event-window-service.js';
import { admin } from './index.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
/** Monday of Into the Wild 2026, before it began at 10:00. */
const NOW = at('2026-11-09T09:00');

/** What the command answered: the text of its v2 answer, or of a refusal. */
function answerOf(interaction: FakeInteraction): string {
  const calls = [
    ...interaction.reply.mock.calls,
    ...interaction.editReply.mock.calls,
    ...interaction.followUp.mock.calls,
  ] as unknown as [SentPayload][];
  const payload = calls.at(-1)?.[0];
  if (!payload) return '';
  if (payload.content !== undefined && payload.content !== '') return payload.content;
  return textOf(asV2(payload));
}

async function commands(store = new MemoryEventWindows()) {
  const { log } = createTestLogger();
  const eventWindows = new EventWindowService({ store, log });
  await eventWindows.load();
  const made = await bossCommandsWith({ context: { eventWindows } });
  return { ...made, eventWindows, store };
}

describe('/admin event-window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a group of /admin with set and end', () => {
    expect([...admin.subcommands.keys()]).toEqual(
      expect.arrayContaining(['event-window set', 'event-window end']),
    );
    const group = admin.data.toJSON().options?.find((option) => option.name === 'event-window');
    expect(group?.description).toBe('All-day Raid Hour raids and Max Battle Day rotations');
  });

  it('sets a window from now until a date and time, and says what it changes', async () => {
    const made = await commands();
    const used = await made.use('event-window', 'set', { until: '11-13 8pm' });
    expect(answerOf(used)).toBe(
      'Until Friday, November 13 at 8:00 PM, raids last 25 minutes as in a Raid Hour, and ' +
        'Dynamax and Gigantamax battles change every 30 minutes, as on a Max Battle Day. ' +
        'Raids and battles already reported keep their times.',
    );
    expect(asV2(used.editReply.mock.calls[0]?.[0] as SentPayload).v2).toBe(true);
    const window = {
      start: NOW,
      end: at('2026-11-13T20:00'),
      setBy: made.staff.userId,
      setAt: NOW,
    };
    expect(made.eventWindows.current()).toEqual(window);
    expect(await made.store.current()).toEqual(window);
    expect(made.logged.find((entry) => entry['msg'] === 'an event window was set')).toMatchObject({
      by: made.staff.userId,
      start: NOW,
      end: window.end,
    });
  });

  it('takes a start to come, and names it; setting again replaces the window', async () => {
    const made = await commands();
    await made.use('event-window', 'set', { until: '11-13 8pm' });
    const used = await made.use('event-window', 'set', { from: '10am', until: '11-12 9pm' });
    expect(answerOf(used)).toBe(
      'From Monday, November 9 at 10:00 AM until Thursday, November 12 at 9:00 PM, raids last ' +
        '25 minutes as in a Raid Hour, and Dynamax and Gigantamax battles change every 30 ' +
        'minutes, as on a Max Battle Day. Raids and battles already reported keep their times.' +
        '\nThis replaces the window that was to last until Friday, November 13 at 8:00 PM.',
    );
    expect(made.eventWindows.current()).toMatchObject({
      start: at('2026-11-09T10:00'),
      end: at('2026-11-12T21:00'),
    });
  });

  it('says the minutes of the settings, not a number of its own', async () => {
    const made = await commands();
    made.ctx.config.settings.raidEvents.hatchedDuration['raid-hour'] = 30;
    const used = await made.use('event-window', 'set', { until: '11-13 8pm' });
    expect(answerOf(used)).toContain('raids last 30 minutes as in a Raid Hour');
  });

  it('refuses an end not after the start, a time it cannot read, and more than 14 days', async () => {
    const made = await commands();
    expect(
      answerOf(await made.use('event-window', 'set', { from: '11-12 6pm', until: '11-12 5pm' })),
    ).toBe('The event window must end after it starts.');
    expect(answerOf(await made.use('event-window', 'set', { until: 'soon' }))).toMatch(
      /^I could not read "soon" as the end of the event window\. Try `6:15pm`/,
    );
    expect(answerOf(await made.use('event-window', 'set', { until: '11-30 8pm' }))).toBe(
      'An event window lasts at most 14 days: end it by Monday, November 23 at 9:00 AM.',
    );
    expect(made.eventWindows.current()).toBeUndefined();
  });

  it('refuses an end in the past', async () => {
    const made = await commands();
    const used = await made.use('event-window', 'set', { until: '11-08 8pm' });
    expect(answerOf(used)).toMatch(
      /^"11-08 8pm" cannot be the end of the event window: it must be between /,
    );
    expect(made.eventWindows.current()).toBeUndefined();
  });

  it('ends the window now, and says so when there is none', async () => {
    const made = await commands();
    expect(answerOf(await made.use('event-window', 'end'))).toBe('No event window is set.');
    await made.use('event-window', 'set', { from: 'in 1', until: '11-13 8pm' });
    vi.setSystemTime(at('2026-11-11T12:00'));
    const used = await made.use('event-window', 'end');
    expect(answerOf(used)).toBe(
      'The event window is over: raids and battles reported from now on last as usual. ' +
        'Those already reported keep their times.',
    );
    expect(made.eventWindows.current()).toMatchObject({ end: at('2026-11-11T12:00') });
    expect(made.logged.find((entry) => entry['msg'] === 'an event window was ended')).toMatchObject(
      { by: made.staff.userId, end: at('2026-11-11T12:00') },
    );
    expect(answerOf(await made.use('event-window', 'end'))).toBe('No event window is set.');
  });

  it('calls off a window that has not begun', async () => {
    const made = await commands();
    await made.use('event-window', 'set', { from: '11-10 10am', until: '11-13 8pm' });
    const used = await made.use('event-window', 'end');
    expect(answerOf(used)).toBe(
      'The event window that was to begin Tuesday, November 10 at 10:00 AM is called off.',
    );
    expect(made.eventWindows.current()).toBeUndefined();
  });

  it('is for staff only', async () => {
    const made = await commands();
    const used = await made.use(
      'event-window',
      'set',
      { until: '11-13 8pm' },
      { userId: MEMBER, roleNames: [] },
    );
    expect(answerOf(used)).toBe('Only admins, moderators and bot developers can do that.');
    expect(made.eventWindows.current()).toBeUndefined();
  });
});
