import { MessageFlags } from 'discord.js';
import { dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
import { REMOVAL_INPUT } from '../../render/moderation.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  REPORTER,
} from '../../../test/support/parties.js';
import { createdMeetup } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { LATE_DEFER_MS } from '../../discord/late-reply.js';
import { InteractionRouter } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { admin } from '../admin/index.js';
import { info, INFO_INPUT, infoControls, infoForm } from '../meetups/info.js';
import { NOT_YOUR_MEETUP } from '../meetups/meetup-changes.js';
import { meetup } from '../meetups/meetup.js';
import { end } from '../raids/change.js';
import { done, here, interested, join, leave, local, notHere, remote } from './attendance.js';
import { closeControls, deleteParty } from './delete.js';
import { partyReportForm, report, REPORT_REASON_INPUT, reportControls } from './report.js';
import { group } from './group.js';
import { cancelMeet, meet } from './meet.js';
import { name } from './name.js';
import { shout } from './shout.js';
import { status, where } from './status.js';
import { buttonsOf, header, textDisplays, textOf } from '../../../test/support/messages.js';

const all: CommandModule[] = [
  join,
  interested,
  here,
  notHere,
  done,
  leave,
  remote,
  local,
  group,
  meet,
  cancelMeet,
  end,
  status,
  where,
  shout,
  deleteParty,
  report,
  name,
  info,
  meetup,
  admin,
];
const HOUR = 60 * MINUTE;
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const ADMIN_ROLE = '800000000000000001';

beforeEach(() => {
  // The handlers read the clock themselves; the fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * A meetup with its post, and every command and control that works in the post of a party. It is
 * `REPORTER`'s unless `request` says who made it; the commands are Alice's.
 */
async function setup(request: Parameters<typeof createdMeetup>[0] = {}) {
  const made = await createdMeetup(request);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, [
    partyButtons,
    infoControls,
    reportControls,
    closeControls,
  ]);
  /** Everything a member was told in this test, to look for words that do not belong. */
  const told: string[] = [];
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    for (const responder of [interaction.reply, interaction.editReply, interaction.followUp]) {
      for (const [payload] of responder.mock.calls) {
        const content = (payload as { content?: string } | undefined)?.content;
        if (content !== undefined) told.push(content);
      }
    }
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the post of the meetup, by Alice unless `extra` says otherwise. */
  const run = (
    commandName: string,
    options: Record<string, string | number | boolean> = {},
    extra: object = {},
  ) =>
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
  /** What the member is told: the reply, or the edit of a command that takes its time. */
  const answer = async (
    commandName: string,
    options?: Record<string, string | number | boolean>,
    extra?: object,
  ): Promise<string | undefined> => {
    const used = await run(commandName, options, extra);
    // A refusal of a command that had been deferred comes as a follow-up.
    for (const responder of [used.reply, used.editReply, used.followUp]) {
      if (responder.mock.calls.length > 0) return sent(responder).content;
    }
    return undefined;
  };
  const click = (action: string, extra: object = {}) =>
    handle(
      fakeButton({
        customId: `party:${made.party.id}:${action}`,
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
        ...extra,
      }),
    );
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.timed.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const alice = () => attendeeOf(made.current(), ALICE);
  return { ...made, ctx, handle, run, answer, click, lines, alice, where, told };
}

describe('the attendance commands in the post of a meetup', () => {
  it('sign a member up and take them off again, in the words of a meetup', async () => {
    const made = await setup();
    expect(await made.answer('interested')).toBe('You are interested.');
    expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
    expect(await made.answer('here')).toBe('You are here with 2 more.');
    expect(await made.answer('not-here')).toBe('You are interested with 2 more.');
    expect(await made.answer('remote')).toBe('You are interested with 2 more, remotely.');
    expect(await made.answer('local')).toBe('You are interested with 2 more, in person.');
    expect(made.alice()).toMatchObject({ status: PartyStatus.Interested, number: 3, group: 'A' });
    expect(await made.answer('leave')).toBe('You have left this meetup.');
    expect(made.alice()).toBeUndefined();
    expect(await made.answer('leave')).toBe('You are not signed up for this meetup.');
    expect(await made.answer('not-here')).toBe('You are not signed up for this meetup.');
  });

  it('/done means leave: the member is taken off, and nobody is asked anything', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Present);
    await made.run('here');
    expect(await made.answer('done')).toBe('You have left this meetup.');
    expect(made.alice()).toBeUndefined();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(made.current().prompts.completion).toEqual([]);
    expect(await made.lines()).toEqual([
      `**Bob** (<@${BOB}>) is here.`,
      // The line of a member's standing is replaced by the newest: here, then gone.
      `**Alice** (<@${ALICE}>) has left.`,
    ]);
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.components ?? []).toEqual([]);
    }
    expect(await made.answer('done')).toBe('You are not signed up for this meetup.');
  });

  it('take a head count but no group other than the one a meetup has', async () => {
    const made = await setup();
    expect(await made.answer('join', { group: 'A', count: 2 })).toBe('You are coming with 1 more.');
    expect(await made.answer('join', { group: 'B' })).toBe('This meetup has no such group.');
    expect(await made.answer('join', { group: 'the park' })).toBe('This meetup has no such group.');
    // The list of groups offers nothing: there is nothing to choose.
    const typing = await made.handle(
      fakeAutocomplete({ commandName: 'join', ...made.where, focused: '', focusedName: 'group' }),
    );
    expect(typing.respond).toHaveBeenCalledWith([]);
  });

  it('refuse every part of /group: a meetup has no groups', async () => {
    const made = await setup();
    await made.run('join');
    const before = made.current();
    for (const [subcommand, options] of [
      ['join', { letter: 'A' }],
      ['join', { letter: 'B' }],
      ['new', {}],
      ['label', { text: 'park side' }],
    ] as const) {
      expect(await made.answer('group', options, { subcommand })).toBe('A meetup has no groups.');
    }
    expect(made.current()).toBe(before);
  });
});

describe('the buttons of a meetup post', () => {
  it('sign up, count and leave like those of a raid', async () => {
    const made = await setup();
    expect(sent((await made.click('join')).reply).content).toBe('You are coming.');
    expect(sent((await made.click('more')).reply).content).toBe('You are coming with 1 more.');
    expect(sent((await made.click('remote')).reply).content).toBe(
      'You are coming with 1 more, remotely.',
    );
    expect(sent((await made.click('here')).reply).content).toBe(
      'You are here with 1 more, remotely.',
    );
    expect(sent((await made.click('leave')).reply).content).toBe('You have left this meetup.');
    expect(sent((await made.click('less')).reply).content).toBe(
      'You are not signed up for this meetup.',
    );
  });

  it('take a Done that somebody still has on screen as leave, and a group button as refused', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('group:A')).reply).content).toBe('A meetup has no groups.');
    expect(sent((await made.click('done')).reply).content).toBe('You have left this meetup.');
    expect(made.alice()).toBeUndefined();
    expect(sent((await made.click('answer:yes')).reply).content).toBe(
      'You were not asked, or you have answered already.',
    );
  });
});

/**
 * Alice's own meetup, whose times are hers to set (plan 8Z-2: its maker's and staff's), with
 * `REPORTER` signed up as interested, to be told, in Alice's place on its list (she joins it in
 * most tests, as anybody new would). Written into the store as it is, so that nothing has been
 * said in its post yet: the first line of a test goes out at once.
 */
async function own() {
  const made = await setup({ creatorId: ALICE, creator: { name: 'Alice' } });
  await made.store.update(made.party.id, (party) => {
    const maker = attendeeOf(party, ALICE);
    if (!maker) throw new Error('the maker is not signed up');
    return { ok: true, party: { ...party, attendees: { [REPORTER]: maker } } };
  });
  return made;
}

describe('/meet, /cancel-meet and /end in the post of a meetup', () => {
  it('/meet sets when the meetup starts, for everybody, and tells the others', async () => {
    const made = await own();
    await made.run('join');
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      `This meetup starts at ${stamp(START)} (${stamp(START, 'R')}). I am telling the others.`,
    );
    expect(made.current().timed.startTime).toBe(START);
    expect(made.current().groups).toEqual([{ id: 'A' }]);
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) is coming.`,
      `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(START)} (${stamp(START, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
      users: [REPORTER],
    });
    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}.`,
    );
    expect(await made.answer('meet', { time: '16:00' })).toBe(
      `This meetup already starts at ${stamp(START)} (${stamp(START, 'R')}).`,
    );
  });

  it('tells the others once of a start that was corrected right away', async () => {
    const made = await own();
    await made.run('join');
    await made.run('meet', { time: '4pm' });
    await made.run('meet', { time: '5pm' });
    const five = at('2026-10-13T17:00');
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) is coming.`,
      `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(five)} (${stamp(five, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
  });

  it('/meet takes a date, minutes with "in", and reads a bare number as an hour', async () => {
    const made = await own();
    await made.run('join');
    const friday = at('2026-10-16T18:30');
    expect(await made.answer('meet', { time: '10-16 6:30pm' })).toBe(
      `This meetup starts at ${stamp(friday, 'f')} (${stamp(friday, 'R')}). I am telling the others.`,
    );
    await made.run('meet', { time: 'in 45' });
    expect(made.current().timed.startTime).toBe(PARTY_NOW + 45 * MINUTE);
    await made.run('meet', { time: '20' });
    expect(made.current().timed.startTime).toBe(at('2026-10-13T20:00'));
  });

  it('/meet reads a time that has passed today as tomorrow, never as the past', async () => {
    const made = await own();
    await made.run('join');
    // It is 14:00: nine o'clock this morning has passed, this evening has not.
    await made.run('meet', { time: '9' });
    expect(made.current().timed.startTime).toBe(at('2026-10-13T21:00'));
    await made.run('meet', { time: '1pm' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T13:00'));
  });

  it('reads times typed on a later day than the meetup was made, without "pm"', async () => {
    const made = await own();
    await made.run('join');
    // The day after it was made, at 15:00.
    const tuesday = at('2026-10-14T15:00');
    vi.setSystemTime(tuesday);
    made.clock.now = tuesday;
    // Not 06:15 this morning, which lies after the meetup was made: 18:15 today.
    await made.run('meet', { time: '6:15' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T18:15'));
    // The end is after the start: "8" is 20:00, and "1" is one o'clock the next morning.
    await made.run('end', { time: '8' });
    expect(made.current().endTime).toBe(at('2026-10-14T20:00'));
    await made.run('end', { time: '1' });
    expect(made.current().endTime).toBe(at('2026-10-15T01:00'));
  });

  it('reads a new start today once the day of the old start has passed', async () => {
    const made = await own();
    await made.run('join');
    await made.run('meet', { time: '6pm' });
    const next = at('2026-10-14T15:00');
    vi.setSystemTime(next);
    made.clock.now = next;
    // Yesterday 19:00 would be in the past, and would ping everybody for nothing.
    await made.run('meet', { time: '7pm' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T19:00'));
    expect(await made.answer('end', { time: '9pm' })).toBe(
      `This meetup ends at ${stamp(at('2026-10-14T21:00'))} (${stamp(at('2026-10-14T21:00'), 'R')}).`,
    );
  });

  it('/meet, /cancel-meet and /end are for its maker and staff, not for who is signed up', async () => {
    // The reporter's meetup: Alice signs up for it, and may not set its times.
    const made = await setup();
    await made.run('join');
    expect(await made.answer('meet', { time: '4pm' })).toBe(NOT_YOUR_MEETUP);
    expect(await made.answer('cancel-meet')).toBe(NOT_YOUR_MEETUP);
    expect(await made.answer('end', { time: '6pm' })).toBe(NOT_YOUR_MEETUP);
    expect(made.current()).toMatchObject({ endTime: null, timed: { startTime: null } });
  });

  // Plan 8Z-2, fix round F-A5: the guard reads the maker's block before the write, which may eat
  // Discord's three seconds: the commands are acknowledged late, and answer in its place.
  it('/meet, /cancel-meet and /end acknowledge a write that runs late, and answer in its place', async () => {
    const uses: Array<[string, Record<string, string>, string]> = [
      ['meet', { time: '4pm' }, 'This meetup starts at'],
      ['cancel-meet', {}, 'This meetup has no start time any more.'],
      ['end', { time: '6pm' }, 'This meetup ends at'],
    ];
    const made = await own();
    for (const [commandName, options, said] of uses) {
      const asked = Promise.withResolvers<void>();
      const written = Promise.withResolvers<void>();
      const update = made.store.update.bind(made.store);
      vi.spyOn(made.store, 'update').mockImplementationOnce(async (id, change, cause) => {
        asked.resolve();
        await written.promise;
        return update(id, change, cause);
      });
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
      const using = made.run(commandName, options);
      await asked.promise;
      await vi.advanceTimersByTimeAsync(LATE_DEFER_MS);
      written.resolve();
      const used = await using;
      vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
      expect(used.deferReply).toHaveBeenCalledExactlyOnceWith({ flags: MessageFlags.Ephemeral });
      expect(used.reply).not.toHaveBeenCalled();
      expect(sent(used.editReply).content).toContain(said);
      await made.timed.flush();
    }
  });

  it('explains a time it cannot read', async () => {
    const made = await own();
    await made.run('join');
    const hint =
      'Try `6:15pm`, `10-16 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';
    expect(await made.answer('meet', { time: 'soonish' })).toBe(
      `I could not read "soonish" as the time the meetup starts. ${hint}`,
    );
    expect(await made.answer('end', { time: 'whenever' })).toBe(
      `I could not read "whenever" as the time the meetup ends. ${hint}`,
    );
    expect(made.current().timed.startTime).toBeNull();
  });

  it('explains a time the meetup cannot have: with a date, by the range alone', async () => {
    const made = await own();
    await made.run('join');
    const last = PARTY_NOW + 133_920 * MINUTE;
    expect(await made.answer('meet', { time: '10-12 6pm' })).toBe(
      '"10-12 6pm" cannot be the time the meetup starts: ' +
        `it must be between ${stamp(PARTY_NOW, 'f')} and ${stamp(last, 'f')}.`,
    );
  });

  it('says on which day it read a time without a date that fits on no day', async () => {
    const made = await own();
    await made.run('join');
    // Ninety-three days on, to the minute the latest start: 15:00 is past it on any day.
    const late = PARTY_NOW + 133_920 * MINUTE;
    vi.setSystemTime(late);
    made.clock.now = late;
    const read = at('2027-01-14T15:00');
    expect(await made.answer('meet', { time: '3pm' })).toBe(
      `"3pm" cannot be the time the meetup starts: I read it as ${stamp(read, 'F')}, and ` +
        `it must be between ${stamp(late)} and ${stamp(late)}. ` +
        'For another day, give the date first, month-day: `1-15 3pm`.',
    );
  });

  it('/cancel-meet and "/meet cancel" remove the start, and the others are told that too', async () => {
    const made = await own();
    await made.run('join');
    expect(await made.answer('cancel-meet')).toBe('This meetup had no start time.');
    await made.run('meet', { time: '4pm' });
    await made.timed.flush();
    expect(await made.answer('cancel-meet')).toBe(
      'This meetup has no start time any more. I am telling the others.',
    );
    expect(made.current().timed.startTime).toBeNull();
    expect((await made.lines()).at(-2)).toBe(
      `**Alice** (<@${ALICE}>) removed the start time of this meetup.`,
    );
    await made.run('meet', { time: '4pm' });
    expect(await made.answer('meet', { time: 'cancel' })).toBe(
      'This meetup has no start time any more. I am telling the others.',
    );
    // Set and removed again before anybody was told: there is nothing to tell.
    const said = made.said().length;
    await made.timed.flush();
    expect(made.said()).toHaveLength(said);
  });

  it('/end sets when the meetup ends, for its maker signed up or not, and "none" removes it', async () => {
    const made = await own();
    // Alice made it, and is not signed up.
    expect(await made.answer('end', { time: '6pm' })).toBe(
      `This meetup ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    expect(made.current()).toMatchObject({ endTime: END, lastPossibleTime: END, hatchTime: null });
    expect(made.alice()).toBeUndefined();
    expect(await made.answer('end', { time: '18:00' })).toBe(
      `This meetup already ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    expect(await made.lines()).toEqual([
      `**Alice** (<@${ALICE}>) set the end of this meetup: ${stamp(END)} (${stamp(END, 'R')}).`,
    ]);
    for (const word of ['none', 'cancel', 'unset']) {
      await made.run('end', { time: '6pm' });
      expect(await made.answer('end', { time: word })).toBe(
        'This meetup has no end time any more.',
      );
      expect(made.current().endTime).toBeNull();
    }
    expect(await made.answer('end', { time: 'none' })).toBe('This meetup had no end time.');
    expect(made.current().lastPossibleTime).toBe(PARTY_NOW + 24 * HOUR);
  });

  it('/end reads a time without a date on the day of the start, and names that day', async () => {
    const made = await own();
    await made.run('join');
    await made.run('meet', { time: '10-16 6:30pm' });
    const end = at('2026-10-16T21:00');
    expect(await made.answer('end', { time: '9pm' })).toBe(
      `This meetup ends at ${stamp(end, 'f')} (${stamp(end, 'R')}).`,
    );
    // Set while the start's message waited: it follows the start there (staging of 2026-11-07),
    // before the others are pinged.
    expect((await made.lines()).slice(-3, -1)).toEqual([
      `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(at('2026-10-16T18:30'), 'f')} (${stamp(at('2026-10-16T18:30'), 'R')}).`,
      `**Alice** (<@${ALICE}>) set the end of this meetup: ${stamp(end, 'f')} (${stamp(end, 'R')}).`,
    ]);
  });

  it('/end reads a time without a date on the day of the end when there is no start', async () => {
    const made = await own();
    // Tuesday 14:00; the meetup ends on Saturday at 21:00.
    await made.run('end', { time: '10-17 9pm' });
    const end = at('2026-10-17T22:00');
    expect(await made.answer('end', { time: '10pm' })).toBe(
      `This meetup ends at ${stamp(end, 'f')} (${stamp(end, 'R')}).`,
    );
    expect(made.current()).toMatchObject({ endTime: end, lastPossibleTime: end });
  });

  it('/meet reads a time without a date on the day of the end when there is no start', async () => {
    const made = await own();
    await made.run('join');
    await made.run('end', { time: '10-17 9pm' });
    const start = at('2026-10-17T18:00');
    expect(await made.answer('meet', { time: '6pm' })).toBe(
      `This meetup starts at ${stamp(start, 'f')} (${stamp(start, 'R')}). I am telling the others.`,
    );
    expect(made.current().timed.startTime).toBe(start);
    expect(await made.lines()).toContain(
      `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(start, 'f')} (${stamp(start, 'R')}).`,
    );
  });

  it('names the day of a time that is not today, also when it is only hours off', async () => {
    const made = await own();
    await made.run('join');
    // 14:00: one in the night is tomorrow, eleven hours on.
    const end = at('2026-10-14T01:00');
    expect(await made.answer('end', { time: '1am' })).toBe(
      `This meetup ends at ${stamp(end, 'f')} (${stamp(end, 'R')}).`,
    );
    expect((await made.lines()).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) set the end of this meetup: ${stamp(end, 'f')} (${stamp(end, 'R')}).`,
    );
    // Late in the evening, a start early the next morning: nine hours on, and another day.
    const evening = at('2026-10-13T23:00');
    vi.setSystemTime(evening);
    made.clock.now = evening;
    await made.run('end', { time: 'none' });
    // A time of today keeps the clock time alone.
    const late = at('2026-10-13T23:30');
    expect(await made.answer('end', { time: '11:30pm' })).toBe(
      `This meetup ends at ${stamp(late)} (${stamp(late, 'R')}).`,
    );
    await made.run('end', { time: 'none' });
    const start = at('2026-10-14T08:00');
    expect(await made.answer('meet', { time: '8am' })).toBe(
      `This meetup starts at ${stamp(start, 'f')} (${stamp(start, 'R')}). I am telling the others.`,
    );
    expect(await made.lines()).toContain(
      `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(start, 'f')} (${stamp(start, 'R')}).`,
    );
  });

  it('refuses an end that is not after the start, and a start that is not before the end', async () => {
    const made = await own();
    await made.run('join');
    await made.run('meet', { time: '4pm' });
    const last = at('2027-01-15T14:00');
    // An earlier hour of that day, said with its date, is before the start.
    expect(await made.answer('end', { time: '10-13 3:30pm' })).toBe(
      '"10-13 3:30pm" cannot be the time the meetup ends: ' +
        `it must be between ${stamp(START, 'f')} and ${stamp(last, 'f')}.`,
    );
    expect(await made.answer('end', { time: '10-13 4pm' })).toBe(
      'A meetup cannot end before it starts. Give a later end, or change the start first with `/meet`.',
    );
    // Without a date it is read on the day of the start, and not as the day after: that
    // would be nearly a day on, and is more likely a slip.
    expect(await made.answer('end', { time: '3:30pm' })).toBe(
      '"3:30pm" cannot be the time the meetup ends: ' +
        `I read it as ${stamp(at('2026-10-13T15:30'), 'F')}, and ` +
        `it must be between ${stamp(START, 'f')} and ${stamp(last, 'f')}. ` +
        'For another day, give the date first, month-day: `10-14 3:30pm`.',
    );
    expect(made.current().endTime).toBeNull();
    await made.run('end', { time: '6pm' });
    expect(await made.answer('meet', { time: '7pm' })).toBe(
      'A meetup cannot start after it ends. Give an earlier start, or change the end first with `/end`.',
    );
    expect(made.current()).toMatchObject({ endTime: END, timed: { startTime: START } });
  });

  it('gives an old meetup a day when its last time is removed', async () => {
    const made = await own();
    await made.run('join');
    await made.run('meet', { time: '4pm' });
    await made.run('end', { time: '6pm' });
    const late = END + 3 * 24 * HOUR;
    vi.setSystemTime(late);
    made.clock.now = late;
    await made.run('end', { time: 'none' });
    await made.run('cancel-meet');
    expect(made.current()).toMatchObject({
      endTime: null,
      timed: { startTime: null },
      lastPossibleTime: late + 24 * HOUR,
      deletionTime: null,
    });
  });

  it('does not count a use of /meet or /cancel-meet that could not change anything', async () => {
    const made = await setup();
    // The reporter's meetup, not hers, twice: refused before it is counted.
    expect(await made.answer('meet', { time: '4pm' })).toBe(NOT_YOUR_MEETUP);
    expect(await made.answer('cancel-meet')).toBe(NOT_YOUR_MEETUP);
    // As a moderator she may. A text that is no time, and a time the meetup cannot have.
    const staff = { roleNames: ['Moderator'] };
    expect(await made.answer('meet', { time: 'soonish' }, staff)).toMatch(
      /^I could not read "soonish"/,
    );
    expect(await made.answer('meet', { time: '10-12 6pm' }, staff)).toMatch(/cannot be the time/);
    // Three good ones still work; the fourth is the first that is held back.
    for (const time of ['4pm', '4:10pm', '4:20pm']) {
      expect(await made.answer('meet', { time }, staff)).toMatch(/^This meetup starts at/);
    }
    expect(await made.answer('meet', { time: '4:30pm' }, staff)).toBe(
      'You can use /meet again in 3 minutes.',
    );
    // `/cancel-meet` has its own three.
    expect(await made.answer('cancel-meet', {}, staff)).toMatch(
      /^This meetup has no start time any more/,
    );
  });

  it('reads a start of 1 to 6 as the afternoon, also when it has passed today', async () => {
    const made = await own();
    await made.run('join');
    // It is 14:00: one o'clock is tomorrow at 13:00, not in the night.
    await made.run('meet', { time: '1' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T13:00'));
    await made.run('meet', { time: '10-16 6' });
    expect(made.current().timed.startTime).toBe(at('2026-10-16T18:00'));
  });

  it('holds back a member who changes the start more than three times in three minutes', async () => {
    const made = await own();
    await made.run('join');
    for (const time of ['4pm', '4:10pm', '4:20pm']) await made.run('meet', { time });
    expect(await made.answer('meet', { time: '4:30pm' })).toBe(
      'You can use /meet again in 3 minutes.',
    );
    expect(made.current().timed.startTime).toBe(at('2026-10-13T16:20'));
    // A minute on, when the limit of a raid's meeting time would be open again, it still holds.
    vi.setSystemTime(PARTY_NOW + 61_000);
    expect(await made.answer('meet', { time: '4:30pm' })).toBe(
      'You can use /meet again in 2 minutes.',
    );
  });
});

describe('the other commands in the post of a meetup', () => {
  it('/where says that a meetup is at no gym', async () => {
    const made = await setup();
    expect(await made.answer('where')).toBe('A meetup is at no gym, so there is no place to show.');
  });

  it('/shout tells everybody in the meetup, and says so when there is nobody else', async () => {
    const made = await setup();
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'You are not signed up for this meetup.',
    );
    await made.run('join');
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'Your message is in the post. I pinged 1 trainer.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `**Alice** (<@${ALICE}>) to everybody in this meetup:\n> On my way\n<@${REPORTER}>`,
      mention: { users: [REPORTER] },
    });
    await made.attendance.leave(made.party.id, { id: REPORTER });
    expect(await made.answer('shout', { message: 'Anybody?' })).toBe(
      'Nobody else is signed up for this meetup, so I said nothing.',
    );
  });

  it('/status puts the meetup at the bottom of its post again', async () => {
    const made = await setup();
    expect(await made.answer('status')).toBe(
      'The meetup is at the bottom of the post again, with its buttons.',
    );
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(header(copy?.message)[0]).toBe('### Meetup: Community Day picnic');
    expect(buttonsOf(copy?.message)).toEqual(
      buttonsOf(made.gateway.posts.get(made.postId)?.message),
    );
  });

  it('/status in the channel of the region lists the meetup under the raids', async () => {
    const made = await setup();
    const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
    expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
      '### Today and coming up\n1 meetup',
      `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
    ]);
  });

  it('/delete from staff asks first, and Archive post closes the meetup: the post says who did it', async () => {
    const made = await setup();
    const used = await made.run('delete', {}, { roleNames: ['Moderator'] });
    const dialog = shownDialog(used);
    expect(dialogTexts(dialog)).toEqual(['Close this meetup?']);
    expect(made.store.get(made.party.id)).toBeDefined();
    const pressed = await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { [REMOVAL_INPUT]: 'archive' },
        userId: ALICE,
        displayName: 'Alice',
        roleNames: ['Moderator'],
        ...made.where,
      }),
    );
    expect(textOf(asV2(sent(pressed.editReply)))).toBe(
      'This meetup is closed: I am archiving and locking its post.',
    );
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.said().at(-1)).toBe(`This meetup was closed by **Alice** (<@${ALICE}>).`);
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true });
    expect(header(post?.message)[1]).toBe(`This meetup was closed by **Alice** (<@${ALICE}>).`);
    expect(await made.answer('join')).toBe(
      'Use this in the post of a raid, max battle, train or meetup that is still active.',
    );
  });

  it('/report asks what is wrong, and puts it into the post without a moderators’ channel', async () => {
    const made = await setup();
    const used = await made.run('report');
    expect(used.showModal).toHaveBeenCalledWith(partyReportForm(made.party));
    const submit = (reason: string, userId = ALICE) =>
      made.handle(
        fakeModal({
          customId: partyReportForm(made.party).custom_id,
          userId,
          fields: { [REPORT_REASON_INPUT]: reason },
          guildRoleNames: { [ADMIN_ROLE]: 'Admin' },
          ...made.where,
        }),
      );
    expect(sent((await submit('   ')).reply).content).toBe(
      'Say what is wrong, so that the moderators know what to look at.',
    );
    expect(sent((await submit('Made twice')).editReply).content).toBe(
      'I have put your report into the post, for the moderators.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@&${ADMIN_ROLE}>: **Member** (<@${ALICE}>) asks for this meetup to be deleted.\n> Made twice`,
      mention: { roles: [ADMIN_ROLE] },
    });
    expect(sent((await submit('Again')).editReply).content).toBe(
      'You have already asked the moderators about this meetup.',
    );
    await made.service.end(made.party.id);
    expect(sent((await submit('Too late', CAROL)).reply).content).toBe('This has ended.');
  });

  it('/admin save-party keeps the post of a meetup and lets it go again', async () => {
    const made = await setup();
    const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
    expect(await made.answer('admin', {}, staff)).toMatch(/^This post is kept/);
    expect(made.current().saved).toBe(true);
    expect(await made.answer('admin', { keep: false }, staff)).toBe(
      'This post is no longer kept: it is archived as usual once the meetup is over.',
    );
    expect(made.current().saved).toBe(false);
  });
});

describe('what a member of a meetup is told', () => {
  it('never calls the meetup a raid, whatever they try in its post', async () => {
    const made = await setup();
    const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
    const tries: [string, Record<string, string | number | boolean>?, object?][] = [
      ['leave'],
      ['done'],
      ['not-here'],
      ['meet', { time: '4pm' }],
      ['cancel-meet'],
      ['shout', { message: 'hello' }],
      ['join', { group: 'Z' }],
      ['join', { count: 99 }],
      ['join'],
      ['interested'],
      ['here'],
      ['remote'],
      ['local'],
      ['group', {}, { subcommand: 'new' }],
      ['group', { letter: 'B' }, { subcommand: 'join' }],
      ['group', { text: 'x' }, { subcommand: 'label' }],
      ['meet', { time: 'gibberish' }],
      ['meet', { time: '1pm' }],
      ['meet', { time: '4pm' }],
      ['meet', { time: '4pm' }],
      ['end', { time: '3pm' }],
      ['end', { time: 'gibberish' }],
      ['end', { time: '6pm' }],
      ['end', { time: '6pm' }],
      ['meet', { time: '7pm' }],
      ['end', { time: 'none' }],
      ['end', { time: 'none' }],
      ['cancel-meet'],
      ['cancel-meet'],
      ['where'],
      ['shout', { message: 'hello' }],
      ['status'],
      ['admin', {}, staff],
      ['admin', {}, staff],
      ['admin', { keep: false }, staff],
      ['done'],
      ['name', { name: 'Evening picnic' }],
      ['name', { name: 'Evening picnic' }, { roleNames: ['Admin'] }],
      ['name', { name: 'Evening picnic' }, { roleNames: ['Admin'] }],
      ['name', { name: '   ' }, { roleNames: ['Admin'] }],
      ['meetup', { name: 'Another one' }],
      ['meetup', { name: '   ' }],
    ];
    for (const [command, options, extra] of tries) await made.run(command, options, extra);
    // The form of `/info`: sent, sent again unchanged, and with more than it takes.
    const asStaff = { roleNames: ['Admin'] };
    expect((await made.run('info', {}, asStaff)).showModal).toHaveBeenCalledOnce();
    for (const text of ['Bring snacks.', 'Bring snacks.', 'x'.repeat(1001), '']) {
      await made.handle(
        fakeModal({
          customId: infoForm(made.current()).custom_id,
          userId: ALICE,
          ...asStaff,
          fields: { [INFO_INPUT]: text },
          ...made.where,
        }),
      );
    }
    const closing = shownDialog(await made.run('delete', {}, { roleNames: ['Admin'] }));
    await made.handle(
      fakeModal({
        customId: closing.custom_id,
        form: closing,
        picked: { [REMOVAL_INPUT]: 'archive' },
        userId: ALICE,
        roleNames: ['Admin'],
      }),
    );
    // A form that was still open when the meetup was closed.
    await made.handle(
      fakeModal({
        customId: `info:${made.party.id}:set`,
        userId: ALICE,
        fields: { [INFO_INPUT]: 'Too late.' },
        ...made.where,
      }),
    );
    expect(made.told.at(-1)).toMatch(/^This meetup is over\./);
    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'leave']) {
      // The meetup is closed by now: a control that is still on screen says so, without a
      // kind, since nothing remembers what kind of party it was.
      await made.click(action);
    }
    expect(made.told.slice(-7)).toEqual(Array.from({ length: 7 }, () => 'This has ended.'));
    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 12);
    // "raid or meetup" is said where the kind does not matter; a raid alone never.
    const wrong = made.told.filter((text) => /raid(?! or meetup)/i.test(text));
    expect(wrong).toEqual([]);
    await made.timed.flush();
    await made.attendance.flush();
    expect(made.said().filter((text) => /raid/i.test(text))).toEqual([]);
  });
});
