import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bossCommandsWith, MEMBER } from '../../../test/support/boss-commands.js';
import { MemoryEventWindows } from '../../../test/support/event-window-store.js';
import {
  asV2,
  FAKE_GUILD_ID,
  type FakeInteraction,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import type { RecordingDms } from '../../../test/support/dms.js';
import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import { TEST_ENV } from '../../../test/support/test-env.js';
import { zonedAt } from '../../../test/support/time.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { DM_PRIORITY } from '../../services/dm-sender.js';
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

  it('refuses an end in the past in its own words (review LW-5)', async () => {
    const made = await commands();
    const past = 'The event window must end in the future.';
    expect(answerOf(await made.use('event-window', 'set', { until: '11-08 8pm' }))).toBe(past);
    // A time of today already gone: read on today, it is past.
    expect(answerOf(await made.use('event-window', 'set', { until: '8am' }))).toBe(past);
    // Far ahead is another refusal.
    expect(answerOf(await made.use('event-window', 'set', { until: '6-01 8pm' }))).toMatch(
      /^"6-01 8pm" cannot be the end of the event window: it must be between /,
    );
    expect(made.eventWindows.current()).toBeUndefined();
  });

  describe('set again without from: (review LW-1)', () => {
    const START = at('2026-11-09T10:00');
    const kept = { start: START, end: at('2026-11-13T20:00'), setBy: '1', setAt: START };

    it('keeps the start of the window on, and says so', async () => {
      const made = await commands(new MemoryEventWindows(kept));
      vi.setSystemTime(at('2026-11-12T12:00'));
      const used = await made.use('event-window', 'set', { until: '11-15 8pm' });
      expect(made.eventWindows.current()).toMatchObject({
        start: START,
        end: at('2026-11-15T20:00'),
      });
      expect(answerOf(used)).toBe(
        'Until Sunday, November 15 at 8:00 PM, raids last 25 minutes as in a Raid Hour, and ' +
          'Dynamax and Gigantamax battles change every 30 minutes, as on a Max Battle Day. ' +
          'Raids and battles already reported keep their times.\n' +
          'Still counted from Monday, November 9 at 10:00 AM.\n' +
          'This replaces the window that was to last until Friday, November 13 at 8:00 PM.',
      );
    });

    it('counts the 14 days from now, not from the kept start', async () => {
      const made = await commands(new MemoryEventWindows(kept));
      vi.setSystemTime(at('2026-11-12T12:00'));
      await made.use('event-window', 'set', { until: '11-25 8pm' });
      expect(made.eventWindows.current()).toMatchObject({ start: START });
      expect(made.eventWindows.current()?.end).toBe(at('2026-11-25T20:00'));
    });

    it('keeps the start of one that ended less than 2 hours ago', async () => {
      const made = await commands(new MemoryEventWindows(kept));
      vi.setSystemTime(at('2026-11-13T21:00'));
      const used = await made.use('event-window', 'set', { until: '11-15 8pm' });
      expect(made.eventWindows.current()).toMatchObject({ start: START });
      expect(answerOf(used)).toContain('Still counted from Monday, November 9 at 10:00 AM.');
    });

    it('starts now after one that ended 2 hours ago or more', async () => {
      const made = await commands(new MemoryEventWindows(kept));
      const now = at('2026-11-13T23:00');
      vi.setSystemTime(now);
      const used = await made.use('event-window', 'set', { until: '11-15 8pm' });
      expect(made.eventWindows.current()).toMatchObject({ start: now });
      expect(answerOf(used)).not.toContain('Still counted');
    });

    it('takes from: when it is given', async () => {
      const made = await commands(new MemoryEventWindows(kept));
      vi.setSystemTime(at('2026-11-12T12:00'));
      await made.use('event-window', 'set', { from: '1pm', until: '11-15 8pm' });
      expect(made.eventWindows.current()).toMatchObject({ start: at('2026-11-12T13:00') });
    });
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

  // Matt's ruling 5 of 2026-11-10 (the audit's L-D1): one window for every server, on the word
  // of one server's staff, with only a log line naming who. The owner is told by DM.
  describe('telling the owner', () => {
    const OWNER = TEST_ENV.OWNER_ID ?? '';
    const told = (made: Awaited<ReturnType<typeof commands>>) =>
      (made.ctx.dms as RecordingDms).jobs;
    const WEEK = 7 * 24 * 3_600_000;

    it('tells the owner who set a window, in which server, and from when until when', async () => {
      const made = await commands();
      await made.use('event-window', 'set', { from: '10am', until: '11-13 8pm' });
      const [job, more] = told(made);
      expect(more).toBeUndefined();
      expect(job).toMatchObject({
        userId: OWNER,
        priority: DM_PRIORITY.normal,
        eventAt: NOW,
        expiresAt: NOW + WEEK,
      });
      expect(textDisplays(job?.message)).toEqual([
        '### Shared data changed',
        `**Morgan** · ${made.staff.userId ?? ''}\nin **Test Server** · ${FAKE_GUILD_ID}`,
        'Set the event window, for every server: from Monday, November 9 at 10:00 AM until ' +
          'Friday, November 13 at 8:00 PM.',
      ]);
      // Nobody is pinged, and nothing is on it to press.
      expect(job?.message.mention).toBeUndefined();
      expect(buttonsOf(job?.message)).toEqual([]);
    });

    it('tells the owner of a window ended and of one called off, each by itself', async () => {
      const made = await commands();
      await made.use('event-window', 'set', { until: '11-13 8pm' });
      vi.setSystemTime(at('2026-11-11T12:00'));
      await made.use('event-window', 'end');
      await made.use('event-window', 'set', { from: '11-12 10am', until: '11-13 8pm' });
      await made.use('event-window', 'end');
      expect(told(made).map((job) => textDisplays(job.message).at(-1))).toEqual([
        expect.stringMatching(/^Set the event window, for every server: from /u),
        'Ended the event window, for every server: it had run since Monday, November 9 at ' +
          '9:00 AM and was to last until Friday, November 13 at 8:00 PM.',
        expect.stringMatching(/^Set the event window, for every server: from /u),
        'Called off the event window that was to begin Thursday, November 12 at 10:00 AM, ' +
          'for every server.',
      ]);
    });

    it('names the member through plainNoLinks, and tells of nothing that changed nothing', async () => {
      const made = await commands();
      await made.use(
        'event-window',
        'set',
        { until: '11-13 8pm' },
        { displayName: '**Mo** https://evil.example', guildName: '[Pit](https://evil.example)' },
      );
      const [who] = textDisplays(told(made)[0]?.message).slice(1);
      expect(who).not.toContain('https://evil.example');
      expect(who).toContain('\\*\\*Mo\\*\\*');
      // A refusal and an end of nothing reach nobody.
      await made.use('event-window', 'set', { until: 'soon' });
      await made.use('event-window', 'end');
      await made.use('event-window', 'end');
      expect(told(made)).toHaveLength(2);
    });

    it('sends the owner nothing of what they did themselves', async () => {
      const made = await commands();
      await made.use('event-window', 'set', { until: '11-13 8pm' }, { userId: OWNER });
      await made.use('event-window', 'end', {}, { userId: OWNER });
      expect(told(made)).toEqual([]);
    });
  });
});
