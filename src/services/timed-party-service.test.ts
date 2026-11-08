import { describe, expect, it, onTestFinished } from 'vitest';
import { watchImmediates } from '../../test/support/timers.js';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import { createdMeetup, reportedRaid } from '../../test/support/party-service.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import { textDisplays, textOf } from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const HOUR = 60 * MINUTE;
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

type Made = Awaited<ReturnType<typeof createdMeetup>>;

/** Lets everything that is under way go out: the start message, the lines, the post. */
async function settled(made: Made): Promise<void> {
  await made.timed.flush();
  await made.attendance.flush();
  await made.service.flush();
}

/** A meetup with Alice and Bob coming, beside the member who made it. */
async function withMembers(): Promise<Made> {
  const made = await createdMeetup();
  await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
  await settled(made);
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  return made;
}

const edits = (made: Made): number => made.gateway.posts.get(made.postId)?.edits ?? 0;

describe('TimedPartyService.setStartTime', () => {
  it('sets the start for everybody, shows the post anew and tells the others with a ping', async () => {
    const made = await withMembers();
    const before = edits(made);
    const outcome = await made.timed.setStartTime(made.party.id, alice, START + 30_000);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, others: [REPORTER, BOB] });
    expect(made.current().timed.startTime).toBe(START);
    expect(made.current().lastPossibleTime).toBe(START + 24 * HOUR);
    await settled(made);
    expect(edits(made)).toBe(before + 1);
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content:
          `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(START)} (${stamp(START, 'R')}).\n` +
          `<@${REPORTER}> <@${BOB}>`,
        mention: { users: [REPORTER, BOB] },
      },
    ]);
  });

  it('pings only those who allow it, and names the day of a start that is far off', async () => {
    const made = await withMembers();
    made.userSettings.set(BOB, { mentions: false });
    made.userSettings.set(REPORTER, { mentionsGroups: false });
    await made.attendance.signUp(made.party.id, carol, PartyStatus.Interested);
    await settled(made);
    const friday = at('2026-10-16T18:00');
    await made.timed.setStartTime(made.party.id, alice, friday);
    await settled(made);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content:
        `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(friday, 'f')} (${stamp(friday, 'R')}).\n` +
        `<@${CAROL}>`,
      mention: { users: [CAROL] },
    });
  });

  it('is only for a member who is signed up', async () => {
    const made = await withMembers();
    expect(await made.timed.setStartTime(made.party.id, carol, START)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.timed.setStartTime(made.party.id, carol, null)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    await settled(made);
    expect(made.current().timed.startTime).toBeNull();
    expect(made.said()).toEqual([]);
  });

  it('refuses a start that is not before the end', async () => {
    const made = await withMembers();
    await made.timed.setEndTime(made.party.id, alice, END);
    expect(await made.timed.setStartTime(made.party.id, alice, END)).toEqual({
      kind: 'refused',
      reason: 'start-after-end',
    });
    expect(await made.timed.setStartTime(made.party.id, alice, END - MINUTE)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
  });

  it('says and writes nothing for the start the meetup already has', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    await settled(made);
    const writes = made.storage.writes.length;
    const said = made.said().length;
    const before = edits(made);
    const again = await made.timed.setStartTime(made.party.id, bob, START + 10_000);
    expect(again).toMatchObject({ kind: 'ok', changed: false, others: [] });
    await settled(made);
    expect(made.storage.writes).toHaveLength(writes);
    expect(made.said()).toHaveLength(said);
    expect(edits(made)).toBe(before);
  });

  it('removes the start with null, and tells the others that too', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    await settled(made);
    const removed = await made.timed.setStartTime(made.party.id, bob, null);
    expect(removed).toMatchObject({ kind: 'ok', changed: true, others: [REPORTER, ALICE] });
    expect(made.current().timed.startTime).toBeNull();
    await settled(made);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `**Bob** (<@${BOB}>) removed the start time of this meetup.\n<@${REPORTER}> <@${ALICE}>`,
      mention: { users: [REPORTER, ALICE] },
    });
    expect(await made.timed.setStartTime(made.party.id, bob, null)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
  });

  it('reads the settings of everybody it may ping in one read', async () => {
    const made = await withMembers();
    const before = { ...made.users.reads };
    await made.timed.setStartTime(made.party.id, bob, START);
    await settled(made);
    expect(made.users.reads).toEqual({ get: before.get, getMany: before.getMany + 1 });
    expect(made.users.asked.at(-1)).toEqual([REPORTER, ALICE]);
  });

  it('notes the name and team of the member who set it', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
    await made.timed.setStartTime(made.party.id, alice, START);
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ name: 'Alice', team: 'mystic' });
  });

  it('says nothing in the post of a meetup that ended while the settings were read', async () => {
    const made = await withMembers();
    const slow = made.users.getMany.bind(made.users);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let reading: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => (reading = resolve));
    made.users.getMany = async (snowflakes) => {
      reading();
      await gate;
      return slow(snowflakes);
    };
    const outcome = await made.timed.setStartTime(made.party.id, alice, START);
    expect(outcome.kind).toBe('ok');
    // The announcement is on its way and has come to the settings of those it would ping.
    const announced = made.timed.flush();
    await reached;
    expect(made.store.get(made.party.id)).toBeDefined();
    await made.service.end(made.party.id);
    const before = made.gateway.messagesIn(made.postId).length;
    release();
    await announced;
    await settled(made);
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(before);
    expect(made.said().some((text) => text.includes('set the start'))).toBe(false);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});

describe('TimedPartyService.setEndTime', () => {
  it('sets the end, shows the post anew and says who did it, pinging nobody', async () => {
    const made = await withMembers();
    const before = edits(made);
    // Carol is not signed up: anybody in the post may set the end.
    const outcome = await made.timed.setEndTime(made.party.id, carol, END + 20_000);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ endTime: END, lastPossibleTime: END });
    expect(attendeeOf(made.current(), CAROL)).toBeUndefined();
    await settled(made);
    expect(edits(made)).toBe(before + 1);
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content: `**Carol** (<@${CAROL}>) set the end of this meetup: ${stamp(END)} (${stamp(END, 'R')}).`,
      },
    ]);
  });

  it('removes the end with null', async () => {
    const made = await withMembers();
    await made.timed.setEndTime(made.party.id, alice, END);
    const removed = await made.timed.setEndTime(made.party.id, alice, null);
    expect(removed).toMatchObject({ kind: 'ok', changed: true, party: { endTime: null } });
    expect(made.current().lastPossibleTime).toBe(made.party.createdAt + 24 * HOUR);
    await settled(made);
    expect(made.said().join('\n').split('\n').at(-1)).toBe(
      `**Alice** (<@${ALICE}>) removed the end time of this meetup.`,
    );
    expect(await made.timed.setEndTime(made.party.id, alice, null)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
  });

  it('refuses an end that is not after the start', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    expect(await made.timed.setEndTime(made.party.id, bob, START)).toEqual({
      kind: 'refused',
      reason: 'end-before-start',
    });
    expect(made.current().endTime).toBeNull();
  });

  it('says and writes nothing for the end the meetup already has', async () => {
    const made = await withMembers();
    await made.timed.setEndTime(made.party.id, alice, END);
    await settled(made);
    const writes = made.storage.writes.length;
    const said = made.said();
    expect(await made.timed.setEndTime(made.party.id, bob, END)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    await settled(made);
    expect(made.storage.writes).toHaveLength(writes);
    expect(made.said()).toEqual(said);
  });
});

describe('TimedPartyService.setName', () => {
  it('renames the meetup, says who did it, and the title of the post follows', async () => {
    const made = await withMembers();
    // Carol is not signed up: anybody in the post may rename it.
    const outcome = await made.timed.setName(made.party.id, carol, '  Raid hour   meet ');
    expect(outcome).toMatchObject({
      kind: 'ok',
      changed: true,
      party: { timed: { name: 'Raid hour meet' } },
    });
    await settled(made);
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      { content: `**Carol** (<@${CAROL}>) renamed this meetup: **Raid hour meet**.` },
    ]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({
      title: 'Meetup · Raid hour meet',
      renames: 1,
    });
    expect(textOf(made.service.summaryMessage(1))).toContain(`<#${made.postId}>`);
  });

  it('refuses a text that is no name, and does nothing for the name it has', async () => {
    const made = await withMembers();
    expect(await made.timed.setName(made.party.id, alice, '  ')).toEqual({
      kind: 'refused',
      reason: 'bad-name',
    });
    expect(await made.timed.setName(made.party.id, alice, 'x'.repeat(81))).toEqual({
      kind: 'refused',
      reason: 'bad-name',
    });
    const writes = made.storage.writes.length;
    expect(await made.timed.setName(made.party.id, alice, ' Community Day  picnic ')).toMatchObject(
      { kind: 'ok', changed: false },
    );
    await settled(made);
    expect(made.storage.writes).toHaveLength(writes);
    expect(made.said()).toEqual([]);
    expect(made.gateway.posts.get(made.postId)?.renames).toBe(0);
  });
});

describe('TimedPartyService.setDescription', () => {
  it('sets what the post says about the meetup and says that it changed, not what to', async () => {
    const made = await withMembers();
    const outcome = await made.timed.setDescription(made.party.id, carol, ' Bring snacks.\n ');
    expect(outcome).toMatchObject({
      kind: 'ok',
      changed: true,
      party: { meetup: { description: 'Bring snacks.' } },
    });
    await settled(made);
    expect(made.said()).toEqual([`**Carol** (<@${CAROL}>) changed the information.`]);
    expect(textDisplays(made.gateway.posts.get(made.postId)?.message)).toContain(
      '**Meeting Information**\nBring snacks.',
    );
  });

  it('removes it with an empty text, refuses one that is too long, and knows no change', async () => {
    const made = await withMembers();
    expect(await made.timed.setDescription(made.party.id, alice, '')).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    expect(await made.timed.setDescription(made.party.id, alice, 'x'.repeat(1001))).toEqual({
      kind: 'refused',
      reason: 'description-too-long',
    });
    await made.timed.setDescription(made.party.id, alice, 'Bring snacks.');
    expect(await made.timed.setDescription(made.party.id, bob, '   ')).toMatchObject({
      kind: 'ok',
      changed: true,
      party: { meetup: { description: null } },
    });
    await settled(made);
    expect(made.said().join('\n').split('\n')).toEqual([
      `**Alice** (<@${ALICE}>) changed the information.`,
      `**Bob** (<@${BOB}>) removed the information.`,
    ]);
  });
});

describe('TimedPartyService: a party that is no meetup, or no more', () => {
  it('answers gone for a raid and leaves it alone', async () => {
    const made = await reportedRaid();
    const before = made.current();
    expect(await made.timed.setStartTime(made.party.id, { id: REPORTER }, START)).toEqual({
      kind: 'gone',
    });
    expect(await made.timed.setEndTime(made.party.id, alice, END)).toEqual({ kind: 'gone' });
    expect(await made.timed.setName(made.party.id, alice, 'Picnic')).toEqual({ kind: 'gone' });
    expect(await made.timed.setDescription(made.party.id, alice, 'x')).toEqual({ kind: 'gone' });
    expect(made.current()).toBe(before);
    await made.attendance.flush();
    expect(made.said()).toEqual([]);
  });

  it('answers gone for a meetup that has ended, and for an id it does not know', async () => {
    const made = await withMembers();
    await made.service.end(made.party.id);
    expect(await made.timed.setStartTime(made.party.id, alice, START)).toEqual({ kind: 'gone' });
    expect(await made.timed.setEndTime(made.party.id, alice, END)).toEqual({ kind: 'gone' });
    expect(await made.timed.setEndTime('00000000-0000-4000-8000-00000000ffff', alice, END)).toEqual(
      { kind: 'gone' },
    );
  });
});

describe('TimedPartyService: a change drawn from what the party was (the live map)', () => {
  it('refuses each change whose value it was drawn from is no longer the party’s, and changes nothing', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    await made.timed.setEndTime(made.party.id, alice, END);
    await made.timed.setDescription(made.party.id, alice, 'Bring snacks.');
    await settled(made);
    const before = made.current();
    const stale = { kind: 'refused', reason: 'changed-meanwhile' };
    expect(await made.timed.setName(made.party.id, alice, 'Picnic', 'Another name')).toEqual(stale);
    expect(await made.timed.setDescription(made.party.id, alice, 'x', null)).toEqual(stale);
    expect(await made.timed.setStartTime(made.party.id, alice, START + HOUR, null)).toEqual(stale);
    expect(await made.timed.setEndTime(made.party.id, alice, END + HOUR, END - HOUR)).toEqual(
      stale,
    );
    expect(made.current()).toBe(before);
  });

  it('makes a change drawn from the party as it is', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    await made.timed.setDescription(made.party.id, alice, 'Bring snacks.');
    expect(
      await made.timed.setName(made.party.id, alice, 'Picnic', 'Community Day picnic'),
    ).toMatchObject({ kind: 'ok', changed: true });
    expect(
      await made.timed.setDescription(made.party.id, alice, 'Bring tea.', 'Bring snacks.'),
    ).toMatchObject({ kind: 'ok', changed: true });
    expect(await made.timed.setStartTime(made.party.id, alice, START + HOUR, START)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(await made.timed.setEndTime(made.party.id, alice, END + HOUR, null)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(made.current()).toMatchObject({
      timed: { name: 'Picnic', startTime: START + HOUR },
      endTime: END + HOUR,
      meetup: { description: 'Bring tea.' },
    });
  });
});

// Staging of 2026-11-07: Manage… changed both times, and the post said the end at once and the
// start in a message of its own seconds later.
describe('TimedPartyService: a start and an end set together', () => {
  const startLine = `**Alice** (<@${ALICE}>) set the start of this meetup: ${stamp(START)} (${stamp(START, 'R')}).`;
  const endLine = `**Alice** (<@${ALICE}>) set the end of this meetup: ${stamp(END)} (${stamp(END, 'R')}).`;
  const contents = (made: Made) =>
    made.gateway.messagesIn(made.postId).map((message) => message.message.content);

  it('says the end after the start, in the message that tells the others of the start', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    await made.timed.setEndTime(made.party.id, alice, END);
    // The lines that ping nobody go out first: the end is not among them.
    await made.attendance.flush();
    expect(contents(made)).toEqual([]);
    await settled(made);
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content: `${startLine}\n${endLine}\n<@${REPORTER}> <@${BOB}>`,
        mention: { users: [REPORTER, BOB] },
      },
    ]);
  });

  it('says the end after the start also where the end was set first (`together`)', async () => {
    const made = await withMembers();
    await made.timed.together(made.party.id, async () => {
      await made.timed.setEndTime(made.party.id, alice, END);
      await made.timed.setStartTime(made.party.id, alice, START);
    });
    await made.attendance.flush();
    expect(contents(made)).toEqual([]);
    await settled(made);
    expect(contents(made)).toEqual([`${startLine}\n${endLine}\n<@${REPORTER}> <@${BOB}>`]);
  });

  it('still says the end where the start comes to nothing new, as a line of its own', async () => {
    const made = await withMembers();
    await made.timed.together(made.party.id, async () => {
      await made.timed.setEndTime(made.party.id, alice, END);
      // Signed up nowhere: the start is refused, the end stands.
      await made.timed.setStartTime(made.party.id, carol, START);
    });
    await settled(made);
    expect(contents(made)).toEqual([endLine]);
    // A start put back to what it was before the message went out: the end alone, as a line.
    const again = await withMembers();
    await again.timed.setStartTime(again.party.id, alice, START);
    await again.timed.setEndTime(again.party.id, alice, END);
    await again.timed.setStartTime(again.party.id, alice, null);
    await settled(again);
    expect(contents(again)).toEqual([endLine]);
  });
});

describe('TimedPartyService: starts set while an announcement is on its way', () => {
  it('says every start once, and the last one last', async () => {
    const made = await withMembers();
    // Sending the announcement takes longer than the wait for the next one.
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const send = made.gateway.sendMessage.bind(made.gateway);
    made.gateway.sendMessage = async (channelId, message) => {
      if (message.mention) await gate;
      return send(channelId, message);
    };
    // What is under way comes as far as it can while the announcement is held.
    const immediates = watchImmediates();
    onTestFinished(() => {
      immediates.restore();
    });
    const settle = () => immediates.settle();
    await made.timed.setStartTime(made.party.id, alice, START);
    const one = made.timed.flush();
    await settle();
    // The second announcement has waited for its delay and stands behind the first.
    await made.timed.setStartTime(made.party.id, alice, START + HOUR);
    const two = made.timed.flush();
    await settle();
    await made.timed.setStartTime(made.party.id, alice, START + 2 * HOUR);
    release();
    await Promise.all([one, two]);
    await settled(made);
    const announced = made.gateway
      .messagesIn(made.postId)
      .map((message) => message.message)
      .filter((message) => message.mention)
      .map((message) => /<t:(\d+):t>/.exec(message.content ?? '')?.[1]);
    expect(announced).toEqual([String(START / 1000), String((START + 2 * HOUR) / 1000)]);
  });

  it('says nothing of a start that was put back to what the last message said', async () => {
    const made = await withMembers();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const send = made.gateway.sendMessage.bind(made.gateway);
    made.gateway.sendMessage = async (channelId, message) => {
      if (message.mention) await gate;
      return send(channelId, message);
    };
    // What is under way comes as far as it can while the announcement is held.
    const immediates = watchImmediates();
    onTestFinished(() => {
      immediates.restore();
    });
    const settle = () => immediates.settle();
    await made.timed.setStartTime(made.party.id, alice, START);
    const one = made.timed.flush();
    await settle();
    await made.timed.setStartTime(made.party.id, alice, START + HOUR);
    const two = made.timed.flush();
    await settle();
    await made.timed.setStartTime(made.party.id, alice, START);
    release();
    await Promise.all([one, two]);
    await settled(made);
    const announced = made.gateway
      .messagesIn(made.postId)
      .map((message) => message.message)
      .filter((message) => message.mention);
    expect(announced).toHaveLength(1);
  });
});
