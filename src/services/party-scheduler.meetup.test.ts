import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import {
  ALICE,
  AS_MAKER,
  asMeetup,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
} from '../../test/support/parties.js';
import { createdMeetup, restarted } from '../../test/support/party-service.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { setStartTime, setTimedEnd } from '../domain/party/timed.js';
import type { Member } from './attendance-service.js';
import { WARN_AGAIN_AFTER } from './party-scheduler.js';
import { accentOf, buttonsOf, header, textOf } from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

type Made = Awaited<ReturnType<typeof createdMeetup>>;

/** Runs the clock at a time and lets everything it started go out. */
async function tickAt(made: Made, time: number): Promise<void> {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.scheduler.whenIdle();
  await made.attendance.flush();
  await made.service.flush();
}

function tagsOf(made: Made): string[] {
  const names = Object.entries(made.tags[WEST_FORUM]);
  const applied = made.gateway.posts.get(made.postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

const lines = (made: Made): string[] => made.said().join('\n').split('\n').filter(Boolean);
const shownPost = (made: Made) => made.gateway.posts.get(made.postId)?.message;

/** A meetup from 16:00 to 18:00, with Alice and Bob here. */
async function planned(): Promise<Made> {
  const made = await createdMeetup();
  const id = made.party.id;
  await made.store.update(id, (party) => setStartTime(asMeetup(party), AS_MAKER, START, PARTY_NOW));
  await made.store.update(id, (party) => setTimedEnd(asMeetup(party), AS_MAKER, END, PARTY_NOW));
  await made.attendance.signUp(id, alice, PartyStatus.Present);
  await made.attendance.signUp(id, bob, PartyStatus.Present);
  await made.attendance.flush();
  await made.service.flush();
  return made;
}

describe('PartyScheduler: a meetup while it goes on', () => {
  it('does nothing while nothing is due', async () => {
    const made = await planned();
    // The first tick after a start looks at every post once.
    await tickAt(made, PARTY_NOW);
    const before = made.gateway.calls.length;
    const stored = made.current();
    await tickAt(made, PARTY_NOW + 5 * MINUTE);
    expect(made.current()).toBe(stored);
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('shows the post anew when the start time passes, and says nothing', async () => {
    const made = await planned();
    await tickAt(made, START - MINUTE);
    const stored = made.current();
    const said = lines(made);
    const edits = () => made.gateway.posts.get(made.postId)?.edits ?? 0;
    const before = edits();
    expect(textOf(shownPost(made))).toContain(`Starts ${stamp(START, 'R')}`);
    await tickAt(made, START);
    expect(textOf(shownPost(made))).toContain(
      `Started at ${stamp(START)}. Ends ${stamp(END, 'R')}, at ${stamp(END)}.`,
    );
    expect(edits()).toBe(before + 1);
    // Nothing is written and nothing said; long after the start nothing happens either.
    await tickAt(made, START + 11 * MINUTE);
    await tickAt(made, END - MINUTE);
    expect(made.current()).toBe(stored);
    expect(edits()).toBe(before + 1);
    expect(lines(made)).toEqual(said);
  });

  it('asks nobody whether they are done, and never counts anybody as done', async () => {
    const made = await planned();
    await tickAt(made, PARTY_NOW);
    await tickAt(made, END + 4 * MINUTE);
    expect(made.current().prompts.completion).toEqual([]);
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Present);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(lines(made).some((line) => /completed|done/.test(line))).toBe(false);
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.components ?? []).toEqual([]);
    }
  });

  it('shows the post as ended when the end time passes, and says nothing', async () => {
    const made = await planned();
    await tickAt(made, END - MINUTE);
    expect(tagsOf(made)).toEqual(['Meetup']);
    expect(accentOf(shownPost(made))).toBe(0x3498db);
    const said = lines(made);
    await tickAt(made, END);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
    expect(textOf(shownPost(made))).toContain(`Ended at ${stamp(END, 'F')}.`);
    expect(lines(made)).toEqual(said);
    // The title does not change with the end, and the controls stay until the archiving.
    expect(made.gateway.posts.get(made.postId)?.renames).toBe(0);
    expect(
      buttonsOf(made.gateway.posts.get(made.postId)?.message).map((b) => b.label ?? b.emoji),
    ).toEqual(['🤔', '🏃', '✅', '👋', '⬇️', '⬆️', '📡', 'Manage…']);
  });

  it('shows the date of its times once the day has changed', async () => {
    const made = await createdMeetup();
    const tomorrow = at('2026-10-14T10:00');
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), AS_MAKER, tomorrow, PARTY_NOW),
    );
    await tickAt(made, PARTY_NOW + MINUTE);
    expect(textOf(shownPost(made))).toContain(`at ${stamp(tomorrow, 'F')}.`);
    await tickAt(made, at('2026-10-14T00:00'));
    expect(textOf(shownPost(made))).toContain(`at ${stamp(tomorrow)}.`);
  });
});

describe('PartyScheduler: archiving a meetup', () => {
  it('warns five minutes after the end, an hour ahead, and archives the post then', async () => {
    const made = await planned();
    await tickAt(made, END + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = END + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const due = warnedAt + 60 * MINUTE;
    expect(made.current().deletionTime).toBe(due);
    expect(lines(made).at(-1)).toBe(
      `This meetup is over. I will archive this post ${stamp(due, 'R')}; it stays readable afterwards.`,
    );
    expect(made.current().prompts.warning).not.toBeNull();
    // Not after the ten minutes of a raid.
    await tickAt(made, warnedAt + 11 * MINUTE);
    expect(made.store.get(made.party.id)).toBeDefined();
    await tickAt(made, due - MINUTE);
    expect(made.store.get(made.party.id)).toBeDefined();
    await tickAt(made, due);
    expect(made.store.get(made.party.id)).toBeUndefined();
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(buttonsOf(post?.message)).toEqual([]);
    // The warning and the link line went with it.
    expect(made.said().some((text) => text.includes('I will archive'))).toBe(false);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('gives a meetup nobody gave a time a day, and says that a time keeps it open', async () => {
    const made = await createdMeetup();
    await tickAt(made, PARTY_NOW + DAY + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = PARTY_NOW + DAY + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const due = warnedAt + 60 * MINUTE;
    // The member who made it is told, with a ping: nothing else says that their meetup goes.
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content:
          'This meetup has no end time, so I take it to be over. ' +
          `I will archive this post ${stamp(due, 'R')}; it stays readable afterwards. ` +
          `A time set with \`/meet\` or \`/end\` keeps it open.\n<@${REPORTER}>`,
        mention: { users: [REPORTER] },
      },
    ]);
    // It is not shown as ended yet: nobody said that it has. The post says when it goes.
    expect(tagsOf(made)).toEqual(['Meetup']);
    expect(accentOf(shownPost(made))).toBe(0x3498db);
    expect(textOf(shownPost(made))).toContain(
      `Without one this post is archived ${stamp(due, 'R')}.`,
    );
    await tickAt(made, due);
    expect(made.store.get(made.party.id)).toBeUndefined();
    // The archived post does not look as if the meetup were still going on.
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(buttonsOf(post?.message)).toEqual([]);
    expect(header(shownPost(made))).toEqual([
      '### Meetup: Community Day picnic',
      'This meetup is over.',
    ]);
    expect(textOf(shownPost(made))).toContain(`-# Created by <@${REPORTER}>`);
    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
  });

  it('shows a meetup that only had a start as over too when its day has run out', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), AS_MAKER, START, PARTY_NOW),
    );
    await tickAt(made, START + DAY + 6 * MINUTE);
    await tickAt(made, START + DAY + 66 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(header(shownPost(made))[1]).toBe('This meetup is over.');
    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('pings nobody for the warning when the maker does not allow it, or the meetup had an end', async () => {
    const quiet = await createdMeetup();
    quiet.userSettings.set(REPORTER, { mentions: false });
    await tickAt(quiet, PARTY_NOW + DAY + 6 * MINUTE);
    expect(quiet.gateway.messagesIn(quiet.postId).at(-1)?.message.mention).toBeUndefined();
    expect(quiet.said().at(-1)).not.toContain('<@');

    const ended = await planned();
    await tickAt(ended, END + 6 * MINUTE);
    expect(ended.gateway.messagesIn(ended.postId).at(-1)?.message).toEqual({
      content: `This meetup is over. I will archive this post ${stamp(END + 66 * MINUTE, 'R')}; it stays readable afterwards.`,
    });
  });

  it("warns without a ping, and says so in the log, when the maker's settings cannot be read", async () => {
    const made = await createdMeetup();
    made.users.get = () => Promise.reject(new Error('the database is away'));
    made.users.getMany = () => Promise.reject(new Error('the database is away'));
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    const warning = made.gateway.messagesIn(made.postId).at(-1)?.message;
    expect(warning?.content).toMatch(/^This meetup has no end time, so I take it to be over\./);
    expect(warning?.mention).toBeUndefined();
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        msg: 'could not read the settings of members',
        members: 1,
      }),
    );
  });

  it('pings the maker only while they are still signed up for it', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.leave(made.party.id, { id: REPORTER });
    await made.attendance.flush();
    expect(attendeeOf(made.current(), REPORTER)).toBeUndefined();
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    const warning = made.gateway.messagesIn(made.postId).at(-1)?.message;
    expect(warning?.content).toMatch(/^This meetup has no end time, so I take it to be over\./);
    expect(warning?.content).not.toContain('<@');
    expect(warning?.mention).toBeUndefined();
  });

  it('pings the maker once: the warning that is said again pings nobody', async () => {
    const made = await createdMeetup();
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    for (let n = 0; n < WARN_AGAIN_AFTER; n++) made.scheduler.activity(made.postId);
    await made.scheduler.whenIdle();
    const [again, ...others] = made.gateway.messagesIn(made.postId);
    expect(others).toEqual([]);
    expect(again?.message.mention).toBeUndefined();
    expect(again?.message.content).toMatch(/^This meetup has no end time/);
  });

  it('gives an old meetup a day when its last time is taken away: no warning before', async () => {
    const made = await planned();
    const late = END + 3 * DAY;
    // Kept by nobody, long over, and warned.
    await tickAt(made, late);
    expect(made.current().deletionTime).not.toBeNull();
    await made.store.update(made.party.id, (party) =>
      setTimedEnd(asMeetup(party), AS_MAKER, null, late),
    );
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), AS_MAKER, null, late),
    );
    expect(made.current()).toMatchObject({ deletionTime: null, lastPossibleTime: late + DAY });
    await tickAt(made, late + MINUTE);
    expect(made.current().prompts.warning).toBeNull();
    expect(made.said().some((text) => text.includes('I will archive'))).toBe(false);
    await tickAt(made, late + DAY + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, late + DAY + 6 * MINUTE);
    expect(made.current().deletionTime).toBe(late + DAY + 66 * MINUTE);
  });

  it('does not archive a meetup whose end was set while the tick was deciding', async () => {
    const made = await planned();
    await tickAt(made, END + 6 * MINUTE);
    const due = made.current().deletionTime ?? 0;
    made.clock.now = due;
    // The tick is queued, and right behind it a later end.
    const ticking = made.scheduler.tick();
    const corrected = made.store.update(made.party.id, (party) =>
      setTimedEnd(asMeetup(party), AS_MAKER, due + 2 * HOUR, made.clock.now),
    );
    await Promise.all([ticking, corrected]);
    await made.scheduler.whenIdle();
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.current()).toMatchObject({ endTime: due + 2 * HOUR, deletionTime: null });
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('counts the day from the start of a meetup that has one', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), AS_MAKER, START, PARTY_NOW),
    );
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, START + DAY + 6 * MINUTE);
    expect(made.current().deletionTime).toBe(START + DAY + 66 * MINUTE);
  });

  it('takes the warning back when a time that is set says the meetup goes on', async () => {
    const made = await createdMeetup();
    const warnedAt = PARTY_NOW + DAY + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const warning = made.current().prompts.warning;
    expect(warning).not.toBeNull();
    // Somebody says when it ends after all.
    const later = warnedAt + 3 * HOUR;
    await made.store.update(made.party.id, (party) =>
      setTimedEnd(asMeetup(party), AS_MAKER, later, made.clock.now),
    );
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, warnedAt + MINUTE);
    expect(made.current().prompts.warning).toBeNull();
    expect(lines(made)).toEqual([]);
    expect(made.gateway.deleted).toContainEqual({ channelId: made.postId, messageId: warning });
    // Its hour is long past: nothing archives it before the new end.
    await tickAt(made, warnedAt + 2 * HOUR);
    expect(made.store.get(made.party.id)).toBeDefined();
    await tickAt(made, later + 6 * MINUTE);
    expect(lines(made).at(-1)).toMatch(/^This meetup is over\. I will archive this post/);
  });

  it('never archives a meetup a moderator keeps', async () => {
    const made = await planned();
    await made.service.keep(made.party.id, true, { id: ALICE });
    await tickAt(made, END + 3 * DAY);
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.current().deletionTime).toBeNull();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('says the warning again below every fifth message, as in the post of a raid', async () => {
    const made = await planned();
    await tickAt(made, END + 6 * MINUTE);
    const first = made.current().prompts.warning;
    for (let n = 0; n < WARN_AGAIN_AFTER; n++) made.scheduler.activity(made.postId);
    await made.scheduler.whenIdle();
    const second = made.current().prompts.warning;
    expect(second).not.toBe(first);
    expect(made.gateway.deleted).toContainEqual({ channelId: made.postId, messageId: first });
    expect(made.said().filter((text) => text.startsWith('This meetup is over.'))).toHaveLength(1);
  });

  it('catches up after downtime: one tick shows the end, the next ones warn and archive', async () => {
    const made = await planned();
    const again = await restarted(made);
    const tick = async (time: number) => {
      again.clock.now = time;
      await again.scheduler.tick();
      await again.scheduler.whenIdle();
      await again.attendance.flush();
      await again.service.flush();
    };
    await tick(END + 2 * HOUR);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    const due = again.store.get(made.party.id)?.deletionTime ?? 0;
    expect(due).toBe(END + 3 * HOUR);
    await tick(due);
    expect(again.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });
});
