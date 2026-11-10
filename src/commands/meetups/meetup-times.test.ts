import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogFields, shownDialog } from '../../../test/support/dialogs.js';
import {
  asV2,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { MAKER, MOD, MODERATOR, SAFETY_SERVER } from '../../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL, meetupSafetyWith } from '../../../test/support/meetup-safety-service.js';
import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import { at, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
import { createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { InteractionRouter } from '../../discord/router.js';
import { attendeeOf, type MeetupParty } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { MEETUP_END_INPUT, MEETUP_START_INPUT } from '../../render/manage-dialogs.js';
import { cancelMeet, meet } from '../parties/meet.js';
import { end } from '../raids/change.js';
import { meetupManageControls } from './manage.js';
import { BLOCKED_FROM_CHANGING, MEETUP_NOT_YOURS, NOT_YOUR_MEETUP } from './meetup-changes.js';

const MODERATOR_MEMBER = { id: MODERATOR, name: 'Mod' };
/** The book swap starts a day after `PARTY_NOW`, at 14:00. */
const START = at('2026-10-14T14:00');
const stamp = (time: number, style = 'f') => `<t:${time / 1000}:${style}>`;

beforeEach(() => {
  // `/meet` and `/end` read the clock themselves; the fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * Alice's (`MAKER`) book swap, held and then approved once, its post on the fake gateway, with
 * Bob signed up for it; the router knows `/meet`, `/cancel-meet` and `/end`.
 */
async function approved() {
  const made = await meetupSafetyWith();
  const request = await made.held();
  await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SAFETY_SERVER);
  const kept = await made.storage.request(request.id);
  if (kept?.partyId === null || kept?.partyId === undefined) throw new Error('not approved');
  const partyId = kept.partyId;
  await made.attendance.signUp(partyId, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
  await made.attendance.flush();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
    meetupSafety: made.safety,
  });
  const router = new InteractionRouter(
    ctx,
    [meet, cancelMeet, end],
    [partyButtons, meetupManageControls],
  );
  const current = (): MeetupParty => {
    const party = made.store.get(partyId);
    if (party?.type !== 'meetup') throw new Error('the meetup is gone');
    return party;
  };
  const postId = current().forumPostId ?? '';
  const handle = async (interaction: FakeInteraction): Promise<void> => {
    await router.handle(interaction as never);
  };
  const run = async (
    commandName: string,
    options: Record<string, string> = {},
    extra: object = {},
  ): Promise<FakeInteraction> => {
    const interaction = fakeChatInput({
      commandName,
      channelId: postId,
      thread: { parentId: WEST_FORUM },
      userId: MAKER,
      displayName: 'Alice',
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const said = async (commandName: string, options?: Record<string, string>, extra?: object) =>
    sent((await run(commandName, options, extra)).reply).content;
  /** What the moderators' channel holds beyond the request's own post, as text. */
  const notices = async () => {
    await made.safety.flushChanges();
    return made.gateway
      .messagesIn(MOD_CHANNEL)
      .filter((message) => message.id !== kept.messageId)
      .map((message) => textDisplays(message.message).join('\n'));
  };
  /**
   * Manage… of the post, opened and submitted by one member with these times typed, every other
   * line left as the dialog showed it.
   */
  const manage = async (typed: { start?: string; end?: string }, extra: object = {}) => {
    const who = { userId: MAKER, displayName: 'Alice', channelId: postId, ...extra };
    const pressed = fakeButton({ customId: `party:${partyId}:manage`, ...who });
    await router.handle(pressed as never);
    const dialog = shownDialog(pressed);
    const shown = new Map(dialogFields(dialog).map((field) => [field.id, field.value ?? '']));
    const submitted = fakeModal({
      customId: dialog.custom_id,
      form: dialog,
      fields: {
        ...Object.fromEntries(shown),
        ...(typed.start === undefined ? {} : { [MEETUP_START_INPUT]: typed.start }),
        ...(typed.end === undefined ? {} : { [MEETUP_END_INPUT]: typed.end }),
      },
      ...who,
    });
    await router.handle(submitted as never);
    return submitted;
  };
  return { ...made, partyId, postId, current, handle, run, said, notices, manage };
}

const AS_BOB = { userId: BOB, displayName: 'Bob' };
const AS_STAFF = { userId: CAROL, displayName: 'Carol', roleNames: ['Moderator'] };

describe("who may set a meetup's start and end on Discord (plan 8Z-2, M1)", () => {
  it('refuses /end, /meet and /cancel-meet to a member who is signed up but did not make it', async () => {
    const made = await approved();
    expect(attendeeOf(made.current(), BOB)).toBeDefined();
    expect(await made.said('end', { time: '10-14 5pm' }, AS_BOB)).toBe(NOT_YOUR_MEETUP);
    expect(await made.said('meet', { time: '10-14 3pm' }, AS_BOB)).toBe(NOT_YOUR_MEETUP);
    expect(await made.said('cancel-meet', {}, AS_BOB)).toBe(NOT_YOUR_MEETUP);
    expect(made.current()).toMatchObject({ endTime: null, timed: { startTime: START } });
    // Nobody was told of anything, in the post or among the moderators.
    await made.timed.flush();
    expect(await made.notices()).toEqual([]);
  });

  it('says "not yours" before it reads the time, and counts no such use', async () => {
    const made = await approved();
    for (let use = 0; use < 5; use += 1) {
      expect(await made.said('meet', { time: 'gibberish' }, AS_BOB)).toBe(NOT_YOUR_MEETUP);
    }
  });

  it('lets its maker set them without being signed up', async () => {
    const made = await approved();
    await made.attendance.leave(made.partyId, { id: MAKER, name: 'Alice' });
    expect(attendeeOf(made.current(), MAKER)).toBeUndefined();
    const start = at('2026-10-14T15:00');
    expect(await made.said('meet', { time: '10-14 3pm' })).toBe(
      `This meetup starts at ${stamp(start)} (${stamp(start, 'R')}). I am telling the others.`,
    );
    const ends = at('2026-10-14T17:00');
    expect(await made.said('end', { time: '5pm' })).toBe(
      `This meetup ends at ${stamp(ends)} (${stamp(ends, 'R')}).`,
    );
    expect(made.current()).toMatchObject({ endTime: ends, timed: { startTime: start } });
    expect(await made.said('cancel-meet')).toBe(
      'This meetup has no start time any more. I am telling the others.',
    );
    expect(made.current().timed.startTime).toBeNull();
    // Setting a time signs nobody up.
    expect(attendeeOf(made.current(), MAKER)).toBeUndefined();
  });

  it('lets staff set them, without a sign-up', async () => {
    const made = await approved();
    const ends = at('2026-10-14T17:00');
    expect(await made.said('end', { time: '10-14 5pm' }, AS_STAFF)).toBe(
      `This meetup ends at ${stamp(ends)} (${stamp(ends, 'R')}).`,
    );
    const start = at('2026-10-14T15:00');
    expect(await made.said('meet', { time: '10-14 3pm' }, AS_STAFF)).toBe(
      `This meetup starts at ${stamp(start)} (${stamp(start, 'R')}). I am telling the others.`,
    );
    expect(await made.said('cancel-meet', {}, AS_STAFF)).toMatch(/^This meetup has no start time/);
    expect(attendeeOf(made.current(), CAROL)).toBeUndefined();
  });

  it('refuses a maker blocked from meetups, with Appeal…; staff are never blocked', async () => {
    const made = await approved();
    await made.storage.addBlock(SAFETY_SERVER, MAKER, MOD);
    for (const [command, options] of [
      ['end', { time: '10-14 5pm' }],
      ['meet', { time: '10-14 3pm' }],
      ['cancel-meet', {}],
    ] as const) {
      const used = await made.run(command, options);
      expect(textOf(asV2(sent(used.reply)))).toContain(BLOCKED_FROM_CHANGING);
      expect(buttonsOf(asV2(sent(used.reply))).map((button) => button.label)).toEqual(['Appeal…']);
    }
    expect(made.current()).toMatchObject({ endTime: null, timed: { startTime: START } });
    await made.storage.addBlock(SAFETY_SERVER, CAROL, MOD);
    expect(await made.said('end', { time: '10-14 5pm' }, AS_STAFF)).toMatch(/^This meetup ends at/);
  });
});

describe("the moderators told of an approved meetup's new times, from the commands", () => {
  it('tells them of a new start, a new end, and of each removed: who and the time', async () => {
    const made = await approved();
    const start = at('2026-10-14T15:00');
    const ends = at('2026-10-14T17:00');
    await made.run('meet', { time: '10-14 3pm' });
    await made.run('end', { time: '5pm' }, AS_STAFF);
    await made.run('end', { time: 'none' });
    await made.run('cancel-meet');
    const [started, ended, endless, startless, more] = await made.notices();
    expect(more).toBeUndefined();
    expect(started).toContain('### An approved meetup changed: Book swap');
    expect(started).toContain(`**Alice** (<@${MAKER}>) set its start: ${stamp(start, 'F')}`);
    expect(ended).toContain(`**Carol** (<@${CAROL}>) set its end: ${stamp(ends, 'F')}`);
    expect(endless).toContain(`**Alice** (<@${MAKER}>) removed its end time.`);
    expect(startless).toContain(`**Alice** (<@${MAKER}>) removed its start time.`);
  });

  it('tells nobody of a time set to what it was, nor of a refusal', async () => {
    const made = await approved();
    await made.run('meet', { time: '10-14 2pm' });
    await made.run('end', { time: 'none' });
    await made.run('end', { time: '10-14 1pm' });
    expect(await made.notices()).toEqual([]);
  });
});

describe("Manage… of an approved meetup's post, its times (plan 8Z-2)", () => {
  it('tells the moderators of both times in one notice, the start first, and of one alone', async () => {
    const made = await approved();
    const start = at('2026-10-14T15:00');
    const ends = at('2026-10-14T17:00');
    const both = await made.manage({ start: '10-14 3pm', end: '5pm' });
    expect(sent(both.editReply).content).toMatch(/^This meetup starts at .* This meetup ends at /u);
    const alone = await made.manage({ end: 'none' }, AS_STAFF);
    expect(sent(alone.editReply).content).toBe('This meetup has no end time any more.');
    const [together, ended, more] = await made.notices();
    expect(more).toBeUndefined();
    expect(together).toMatch(
      new RegExp(
        `\\*\\*Alice\\*\\* \\(<@${MAKER}>\\) set its start: ${stamp(start, 'F')}[^]*` +
          `\\*\\*Alice\\*\\* \\(<@${MAKER}>\\) set its end: ${stamp(ends, 'F')}`,
        'u',
      ),
    );
    expect(ended).toContain(`**Carol** (<@${CAROL}>) removed its end time.`);
  });

  it('refuses a blocked maker the times with Appeal…, and a member who is only signed up', async () => {
    const made = await approved();
    // Bob is signed up: the dialog does not open for him.
    const bob = fakeButton({
      customId: `party:${made.partyId}:manage`,
      channelId: made.postId,
      ...AS_BOB,
    });
    await made.handle(bob);
    expect(sent(bob.reply).content).toBe(MEETUP_NOT_YOURS);
    await made.storage.addBlock(SAFETY_SERVER, MAKER, MOD);
    for (const typed of [
      { start: '10-14 3pm' },
      { end: '10-14 5pm' },
      { start: '3pm', end: '5pm' },
    ]) {
      const refused = await made.manage(typed);
      const answer = asV2(sent(refused.editReply));
      expect(textOf(answer)).toContain(BLOCKED_FROM_CHANGING);
      expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Appeal…']);
    }
    expect(made.current()).toMatchObject({ endTime: null, timed: { startTime: START } });
    expect(await made.notices()).toEqual([]);
  });
});

describe("a train's times, as they were", () => {
  it('lets anybody signed up set the start and anybody in the post the end', async () => {
    const train = await createdTrain();
    await train.attendance.signUp(train.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await train.attendance.flush();
    const { ctx } = createTestContext({
      partyService: train.service,
      attendance: train.attendance,
      timedParties: train.timed,
      parties: train.store,
      regions: train.regions,
    });
    const router = new InteractionRouter(ctx, [meet, end], []);
    const use = async (commandName: string, time: string, userId: string) => {
      const used = fakeChatInput({
        commandName,
        channelId: train.postId,
        thread: { parentId: WEST_FORUM },
        userId,
        displayName: 'Somebody',
        options: { time },
      });
      await router.handle(used as never);
      return sent(used.reply).content;
    };
    expect(await use('meet', '4pm', BOB)).toMatch(/^This train starts at/);
    expect(await use('meet', '4:30pm', CAROL)).toBe('You are not signed up for this train.');
    expect(await use('end', '6pm', CAROL)).toMatch(/^This train ends at/);
  });
});
