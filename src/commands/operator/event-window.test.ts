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
import { withZones } from '../../../test/support/server-values.js';
import { TEST_ENV } from '../../../test/support/test-env.js';
import { zonedAt } from '../../../test/support/time.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { instanceConfig, OPERATOR_ID } from '../../../test/support/operators.js';
import { ONLY_OPERATORS_IN_A_DM } from '../../discord/guards.js';
import { DM_PRIORITY } from '../../services/dm-sender.js';
import { EventWindowService } from '../../services/event-window-service.js';
import { operator } from './index.js';

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

/** The commands in the fakes' server, in `zone`; `others`: zones of other servers in use. */
async function commands(
  store = new MemoryEventWindows(),
  zone?: string,
  others: readonly string[] = [],
  instance: Parameters<typeof instanceConfig>[1] = {},
) {
  const { log } = createTestLogger();
  const servers = withZones({
    ...(zone === undefined ? {} : { [FAKE_GUILD_ID]: zone }),
    ...Object.fromEntries(others.map((other, n) => [`41234567890123459${String(n)}`, other])),
  });
  const eventWindows = new EventWindowService({ store, log, zones: () => servers.zonesInUse() });
  await eventWindows.load();
  const config = instanceConfig(createTestContext().ctx, instance);
  const made = await bossCommandsWith({ context: { eventWindows, servers, config } });
  return { ...made, eventWindows, store };
}

describe('/operator event-window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a group of /operator with set and end', () => {
    expect([...operator.subcommands.keys()]).toEqual(
      expect.arrayContaining(['event-window set', 'event-window end']),
    );
    const group = operator.data.toJSON().options?.find((option) => option.name === 'event-window');
    expect(group?.description).toBe('All-day Raid Hour raids and Max Battle Day rotations');
  });

  it('says in its help who may set the one window of every server (plan 19B-1)', () => {
    const { details } = operator.subcommands.get('event-window set')?.help ?? {};
    const text =
      typeof details === 'function' ? details(createTestContext().ctx.config.settings) : details;
    expect(text).toContain(
      'There is one window for all servers: the operators of this Pine set and end it, from any ' +
        'server or a direct message with me. Unless this Pine is open to every server, the ' +
        'admins, moderators and bot developers of its servers may too, from their server (where ' +
        'it lists its servers, those of the listed ones only).\n\nMy owner is told who ' +
        'did, and from where.',
    );
    expect(text).not.toContain('/admin');
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
    // Plan 19A-2: the end typed is local time, kept so; the start of now is a moment.
    const window = {
      start: NOW,
      end: at('2026-11-13T20:00'),
      endLocal: '2026-11-13T20:00:00',
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

  // Plan 19A-2: times are typed in the zone of the server of whoever types them, kept as local
  // time, and on at those hours on every server's clock.
  describe('in each server’s zone (plan 19A-2)', () => {
    const BERLIN = 'Europe/Berlin';
    const inBerlin = (local: string): number => zonedAt(local, BERLIN);

    it('reads and says the times in the server’s zone, and keeps them as local time', async () => {
      const made = await commands(undefined, BERLIN);
      const used = await made.use('event-window', 'set', {
        from: '11-10 10am',
        until: '11-13 8pm',
      });
      expect(answerOf(used)).toMatch(
        /^From Tuesday, November 10 at 10:00 AM until Friday, November 13 at 8:00 PM, raids last/,
      );
      expect(await made.store.current()).toEqual({
        start: at('2026-11-10T10:00'),
        end: at('2026-11-13T20:00'),
        startLocal: '2026-11-10T10:00:00',
        endLocal: '2026-11-13T20:00:00',
        setBy: made.staff.userId,
        setAt: NOW,
      });
      expect(made.eventWindows.current(BERLIN)).toMatchObject({
        start: inBerlin('2026-11-10T10:00'),
        end: inBerlin('2026-11-13T20:00'),
      });
      expect(made.eventWindows.current(ZONE)).toMatchObject({
        start: at('2026-11-10T10:00'),
        end: at('2026-11-13T20:00'),
      });
      expect(textDisplays((made.ctx.dms as RecordingDms).jobs[0]?.message).at(-1)).toBe(
        'Set the event window, for every server: from Tuesday, November 10 at 10:00 AM until ' +
          'Friday, November 13 at 8:00 PM, local time in every server’s zone.',
      );
    });

    it('counts the 14 days and an end in the past on the server’s clock', async () => {
      const made = await commands(undefined, BERLIN);
      // 09:00 in New York is 15:00 in Berlin: 2pm there is gone, 4pm is not.
      expect(answerOf(await made.use('event-window', 'set', { until: '2pm' }))).toBe(
        'The event window must end in the future.',
      );
      expect(answerOf(await made.use('event-window', 'set', { until: '11-30 8pm' }))).toBe(
        'An event window lasts at most 14 days: end it by Monday, November 23 at 3:00 PM.',
      );
      await made.use('event-window', 'set', { until: '4pm' });
      expect(made.eventWindows.current(BERLIN)?.end).toBe(inBerlin('2026-11-09T16:00'));
    });

    it('keeps a time typed as a span from now as a moment, the same in every zone (fix round 1, M2)', async () => {
      const made = await commands(undefined, BERLIN);
      await made.use('event-window', 'set', { from: 'in 30', until: '11-13 8pm' });
      const kept = await made.store.current();
      expect(kept?.start).toBe(NOW + 30 * 60_000);
      expect(kept?.startLocal).toBeUndefined();
      expect(made.eventWindows.current(ZONE)?.start).toBe(NOW + 30 * 60_000);
      expect(made.eventWindows.current(BERLIN)?.start).toBe(NOW + 30 * 60_000);
    });

    it('ends a window on in another zone only, keeping what ran there (fix round 1, M1)', async () => {
      const made = await commands(undefined, undefined, [BERLIN]);
      await made.use('event-window', 'set', { from: '11-10 10am', until: '11-13 8pm' });
      // 09:00 on Tuesday in New York, 15:00 in Berlin: begun there, not here.
      const now = at('2026-11-10T09:00');
      vi.setSystemTime(now);
      const used = await made.use('event-window', 'end');
      expect(answerOf(used)).toBe(
        'The event window that was to begin Tuesday, November 10 at 10:00 AM is called off.',
      );
      expect(made.eventWindows.current(BERLIN)).toMatchObject({
        start: inBerlin('2026-11-10T10:00'),
        end: now,
      });
      expect(made.eventWindows.current(ZONE)).toBeUndefined();
      // It ran in Berlin: the owner is never told it was called off for every server.
      expect(textDisplays((made.ctx.dms as RecordingDms).jobs.at(-1)?.message).at(-1)).toMatch(
        /^Ended the event window, for every server: it had run since /u,
      );
    });

    it('ends a window over here that is still on elsewhere, and says so (fix round 1, M4)', async () => {
      const made = await commands(undefined, BERLIN);
      await made.use('event-window', 'set', { from: '11-10 10am', until: '11-13 8pm' });
      // 21:00 on Friday in Berlin, over there; 15:00 in New York, still on.
      const now = inBerlin('2026-11-13T21:00');
      vi.setSystemTime(now);
      const used = await made.use('event-window', 'end');
      expect(answerOf(used)).toBe('Ended the event window in the servers where it was still on.');
      expect(made.eventWindows.current(ZONE)?.end).toBe(now);
    });

    it('keeps the start of a window ended in Berlin when Berlin sets it again (fix round 1, M3)', async () => {
      const made = await commands(undefined, BERLIN);
      await made.use('event-window', 'set', { from: '11-10 10am', until: '11-13 8pm' });
      vi.setSystemTime(inBerlin('2026-11-10T15:00'));
      await made.use('event-window', 'end');
      vi.setSystemTime(inBerlin('2026-11-10T15:30'));
      await made.use('event-window', 'set', { until: '11-13 8pm' });
      expect(made.eventWindows.current(BERLIN)?.start).toBe(inBerlin('2026-11-10T10:00'));
    });

    it('keeps the start of a window on in Berlin when New York sets it again (fix round 1, M3)', async () => {
      const made = await commands(undefined, undefined, [BERLIN]);
      await made.use('event-window', 'set', { from: '11-10 10am', until: '11-13 8pm' });
      // 09:00 in New York, 15:00 in Berlin: on there.
      vi.setSystemTime(at('2026-11-10T09:00'));
      await made.use('event-window', 'set', { until: '11-14 8pm' });
      expect(made.eventWindows.current(BERLIN)?.start).toBe(inBerlin('2026-11-10T10:00'));
      expect(made.eventWindows.current(ZONE)?.start).toBe(at('2026-11-10T10:00'));
    });

    it('ends a window begun on the server’s clock now, for every server', async () => {
      const made = await commands(undefined, BERLIN);
      await made.use('event-window', 'set', { from: '11-10 10am', until: '11-13 8pm' });
      // 09:00 on Tuesday in New York, 15:00 in Berlin: begun there, not in New York.
      const now = at('2026-11-10T09:00');
      vi.setSystemTime(now);
      const used = await made.use('event-window', 'end');
      expect(answerOf(used)).toMatch(/^The event window is over/);
      expect(made.eventWindows.current(BERLIN)).toMatchObject({ end: now });
      expect(made.eventWindows.current(ZONE)).toBeUndefined();
    });
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
        `**Morgan** · ${made.staff.userId ?? ''}\nfrom **Test Server** · ${FAKE_GUILD_ID}`,
        'Set the event window, for every server: from Monday, November 9 at 10:00 AM until ' +
          'Friday, November 13 at 8:00 PM, local time in every server’s zone.',
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
          '9:00 AM (America/New_York) and was to last until Friday, November 13 at 8:00 PM, ' +
          'local time in every server’s zone.',
        expect.stringMatching(/^Set the event window, for every server: from /u),
        'Called off the event window that was to begin Thursday, November 12 at 10:00 AM, ' +
          'local time in every server’s zone, for every server.',
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

    it('takes a window set by an operator in a DM, on the instance’s clock (plan 19B-1)', async () => {
      // The fakes' server in Berlin: a DM has no server, and is read in the default zone.
      const made = await commands(new MemoryEventWindows(), 'Europe/Berlin', [], {
        operators: [OPERATOR_ID],
      });
      const inDm = { userId: OPERATOR_ID, isDm: true, globalName: 'Ollie' };
      const used = await made.use(
        'event-window',
        'set',
        { from: '10am', until: '11-13 8pm' },
        inDm,
      );
      expect(answerOf(used)).toMatch(/^From Monday, November 9 at 10:00 AM until Friday/u);
      expect(made.eventWindows.current()).toMatchObject({ start: at('2026-11-09T10:00') });
      expect(textDisplays(told(made)[0]?.message)[1]).toBe(
        `**Ollie** · ${OPERATOR_ID}\nfrom a direct message`,
      );
      await made.use('event-window', 'end', {}, inDm);
      expect(told(made)).toHaveLength(2);
      // A server's moderator is refused there: their roles are of a server.
      const refused = await made.use(
        'event-window',
        'set',
        { until: '11-13 8pm' },
        { ...inDm, userId: made.staff.userId ?? '' },
      );
      expect(answerOf(refused)).toBe(ONLY_OPERATORS_IN_A_DM);
    });

    it('sends the owner nothing of what they did themselves', async () => {
      const made = await commands();
      await made.use('event-window', 'set', { until: '11-13 8pm' }, { userId: OWNER });
      await made.use('event-window', 'end', {}, { userId: OWNER });
      expect(told(made)).toEqual([]);
    });
  });
});
