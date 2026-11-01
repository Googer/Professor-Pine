import { describe, expect, it, vi } from 'vitest';
import { watchEachTest, watchImmediates } from '../../test/support/timers.js';
import { heldCall } from '../../test/support/held-call.js';
import { WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, asRaid, at, BOB, CAROL, MINUTE, testRaid } from '../../test/support/parties.js';
import { partyServiceWith, reportedRaid, restarted } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { setMeetingTime } from '../domain/party/attendance.js';
import { attendeeOf, endParty } from '../domain/party/party.js';
import { setEndTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import { WARN_AGAIN_AFTER } from './party-scheduler.js';
import { buttonsOf, header } from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** Runs the clock at a time and lets everything it started go out. */
async function tickAt(made: Made, time: number): Promise<void> {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.scheduler.whenIdle();
  await made.attendance.flush();
  await made.service.flush();
}

/** The names of the tags a post carries. */
function tagsOf(made: Made): string[] {
  const names = Object.entries(made.tags[WEST_FORUM]);
  const applied = made.gateway.posts.get(made.postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

/** The lines said in the post, one by one. */
const lines = (made: Made): string[] => made.said().join('\n').split('\n').filter(Boolean);
const background = watchEachTest();

describe('PartyScheduler: hatch and end', () => {
  it('does nothing while nothing is due', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    // The first tick after a start looks at every post once.
    await tickAt(made, made.clock.now);
    const before = made.gateway.calls.length;
    const stored = made.current();
    await tickAt(made, made.clock.now + 5 * MINUTE);
    expect(made.current()).toBe(stored);
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('shows the hatch in the post (boss, tags, title) and says so once', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    expect(tagsOf(made)).toEqual(['Egg', 'T5']);
    await tickAt(made, HATCH);
    expect(made.current().raid).toMatchObject({ boss: { key: 'yveltal' }, stageSeen: 'hatched' });
    expect(tagsOf(made)).toEqual(['Hatched', 'T5']);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('Yveltal · The Stacks');
    expect(lines(made)).toEqual(['The egg has hatched: **Yveltal**.']);
    await tickAt(made, HATCH + MINUTE);
    expect(lines(made)).toHaveLength(1);
  });

  it('says only that the egg has hatched when nobody knows the boss', async () => {
    const made = await reportedRaid({
      tier: { level: 'T3', shadow: false },
      time: { hatch: HATCH },
    });
    await tickAt(made, HATCH);
    expect(made.current().raid.boss).toBeNull();
    expect(lines(made)).toEqual(['The egg has hatched.']);
  });

  it('warns after the grace time and archives the post when the warning time is over', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const { gateway, postId, store } = made;
    await tickAt(made, HATCH);
    await tickAt(made, END);
    expect(tagsOf(made)).toEqual(['Ended', 'T5']);
    expect(made.current().deletionTime).toBeNull();

    // Grace 5 minutes: not at 15:20 sharp, but after it.
    await tickAt(made, END + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = END + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const deletionTime = warnedAt + 10 * MINUTE;
    expect(made.current().deletionTime).toBe(deletionTime);
    const warning = gateway.messagesIn(postId).at(-1);
    expect(warning?.message.content).toBe(
      `This raid is over. I will archive this post <t:${deletionTime / 1000}:R>; it stays readable afterwards.`,
    );
    expect(made.current().prompts.warning).toBe(warning?.id);

    await tickAt(made, deletionTime - 1);
    expect(store.get(made.party.id)).toBeDefined();
    await tickAt(made, deletionTime);
    expect(store.get(made.party.id)).toBeUndefined();
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.deleted.map((gone) => gone.messageId)).toContain(warning?.id);
    // Nothing more happens to it.
    const calls = gateway.calls.length;
    await tickAt(made, deletionTime + MINUTE);
    expect(gateway.calls).toHaveLength(calls);
  });

  it('catches up after downtime: one tick shows the end without a hatch line, the next ones archive', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, END + 30 * MINUTE);
    expect(made.current().raid).toMatchObject({ boss: { key: 'yveltal' }, stageSeen: 'ended' });
    expect(tagsOf(made)).toEqual(['Ended', 'T5']);
    expect(lines(made)).toEqual([expect.stringContaining('I will archive this post')]);
    await tickAt(made, END + 40 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('archives a raid without times when it cannot be going on any more', async () => {
    const made = await reportedRaid();
    const last = made.current().lastPossibleTime ?? 0;
    expect(last).toBe(made.party.createdAt + 105 * MINUTE);
    await tickAt(made, last + 6 * MINUTE);
    expect(made.current().deletionTime).toBe(last + 16 * MINUTE);
    await tickAt(made, last + 16 * MINUTE);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('never archives a party a moderator keeps', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await made.store.update(made.party.id, (party) => ({ party: { ...party, saved: true } }));
    await tickAt(made, END + 60 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('takes the warning back when a corrected time says the raid is still going on', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    const warning = made.current().prompts.warning;
    expect(warning).not.toBeNull();
    const later = END + 20 * MINUTE;
    await made.store.update(id, (party) => ({
      party: setEndTime(asRaid(party), later, made.service.rules(), made.clock.now),
    }));
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, END + 7 * MINUTE);
    expect(made.current().prompts.warning).toBeNull();
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([warning]);
    expect(made.current().raid.stageSeen).toBe('hatched');
    // And it is warned again when that end has passed.
    await tickAt(made, later + 6 * MINUTE);
    expect(made.current().prompts.warning).not.toBeNull();
    expect(made.current().prompts.warning).not.toBe(warning);
  });

  it('does not archive a raid whose time was corrected while the tick was deciding', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    made.clock.now = END + 16 * MINUTE;
    // The tick is queued, and right behind it a correction of the end time.
    const ticking = made.scheduler.tick();
    const corrected = made.store.update(id, (party) => ({
      party: setEndTime(asRaid(party), END + 40 * MINUTE, made.service.rules(), made.clock.now),
    }));
    await Promise.all([ticking, corrected]);
    await made.attendance.flush();
    await made.service.flush();
    expect(made.store.get(id)).toBeDefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    // The next tick takes the warning away, and the raid runs on.
    await tickAt(made, END + 17 * MINUTE);
    expect(made.current().prompts.warning).toBeNull();
  });

  it('keeps one warning: a new one takes the place of one that was left behind', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    const first = made.current().prompts.warning;
    // The archiving is called off and due again without a tick in between (the bot was down).
    await made.store.update(id, (party) => ({ party: { ...party, deletionTime: null } }));
    await tickAt(made, END + 30 * MINUTE);
    const second = made.current().prompts.warning;
    expect(second).not.toBe(first);
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([first]);
    const warnings = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.content?.includes('I will archive this post'));
    expect(warnings.map((message) => message.id)).toEqual([second]);
  });

  it('ends the party at the next tick when archiving was due but the write failed', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, END + 6 * MINUTE);
    made.storage.failing = new Error('database down');
    await tickAt(made, END + 16 * MINUTE);
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.entries.some((e) => e.msg === 'could not do what the clock asked for')).toBe(true);
    made.storage.failing = undefined;
    await tickAt(made, END + 17 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('goes on with the other parties when one cannot be stored or shown', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('no gym');
    const second = await made.service.reportRaid({
      gym,
      reporterId: ALICE,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      time: { hatch: HATCH },
    });
    if (second.kind !== 'created') throw new Error(second.kind);
    await made.service.flush();
    // The first party's post cannot take a line; the second must still hatch.
    made.gateway.gone.add(made.postId);
    await tickAt(made, HATCH);
    expect(asRaid(made.store.get(second.party.id)).raid.stageSeen).toBe('hatched');
    expect(made.gateway.posts.get(second.party.forumPostId ?? '')?.title).toBe(
      'Yveltal · Old Stone Fountain',
    );
  });
});

describe('PartyScheduler: the warning in a busy post', () => {
  const warnings = (made: Made) =>
    made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.content?.includes('I will archive this post'));

  /** Messages of others in the post, one by one, each given time to be dealt with. */
  async function chatter(made: Made, count: number, channelId = made.postId): Promise<void> {
    for (let n = 0; n < count; n++) made.scheduler.activity(channelId);
    await made.scheduler.whenIdle();
  }

  it('says the warning again below every fifth message, and deletes the one before', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, END + 6 * MINUTE);
    const first = made.current().prompts.warning;
    await chatter(made, WARN_AGAIN_AFTER - 1);
    expect(made.current().prompts.warning).toBe(first);
    expect(warnings(made)).toHaveLength(1);

    await chatter(made, 1);
    const second = made.current().prompts.warning;
    expect(second).not.toBe(first);
    expect(warnings(made).map((message) => message.id)).toEqual([second]);
    expect(made.gateway.deleted.map((gone) => gone.messageId)).toEqual([first]);
    // The same archiving time: the warning is repeated, not put off.
    expect(warnings(made)[0]?.message.content).toContain(
      `<t:${(made.current().deletionTime ?? 0) / 1000}:R>`,
    );

    await chatter(made, WARN_AGAIN_AFTER);
    expect(made.current().prompts.warning).not.toBe(second);
    expect(warnings(made)).toHaveLength(1);
  });

  it('counts nothing for a post that has no warning, for another channel, or after the end', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await chatter(made, 20);
    expect(warnings(made)).toEqual([]);
    await tickAt(made, END + 6 * MINUTE);
    const warned = made.current().prompts.warning;
    await chatter(made, 20, '600000000000000123');
    expect(made.current().prompts.warning).toBe(warned);
    expect(made.scheduler.counted).toBe(0);

    // After the end the post is archived: messages in it change nothing and ask nothing of Discord.
    await tickAt(made, END + 16 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    const calls = made.gateway.calls.length;
    await chatter(made, 20);
    expect(made.gateway.calls).toHaveLength(calls);
    expect(made.scheduler.counted).toBe(0);
  });

  it('forgets the count of a post once its party has ended', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, END + 6 * MINUTE);
    await chatter(made, WARN_AGAIN_AFTER - 1);
    expect(made.scheduler.counted).toBe(1);
    await tickAt(made, END + 16 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.scheduler.counted).toBe(0);
  });

  it('starts counting anew at a fresh warning, even when nobody wrote in between', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    await chatter(made, WARN_AGAIN_AFTER - 1);
    // The archiving is called off and due again through ticks, with no message in between.
    await made.store.update(id, (party) => ({ party: { ...party, deletionTime: null } }));
    await tickAt(made, END + 30 * MINUTE);
    const fresh = made.current().prompts.warning;
    expect(fresh).not.toBeNull();
    await chatter(made, WARN_AGAIN_AFTER - 1);
    expect(made.current().prompts.warning).toBe(fresh);
    await chatter(made, 1);
    expect(made.current().prompts.warning).not.toBe(fresh);
  });

  it('starts counting anew when the archiving was called off and is due again', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await tickAt(made, END + 6 * MINUTE);
    await chatter(made, WARN_AGAIN_AFTER - 1);
    const later = END + 30 * MINUTE;
    await made.store.update(id, (party) => ({
      party: setEndTime(asRaid(party), later, made.service.rules(), made.clock.now),
    }));
    // A message while the raid runs on forgets the count.
    await chatter(made, 1);
    await tickAt(made, later + 6 * MINUTE);
    const warned = made.current().prompts.warning;
    await chatter(made, WARN_AGAIN_AFTER - 1);
    expect(made.current().prompts.warning).toBe(warned);
  });

  it('says it once when many messages come at once, and logs a failure', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, END + 6 * MINUTE);
    await chatter(made, 3 * WARN_AGAIN_AFTER);
    expect(warnings(made)).toHaveLength(1);
    expect(made.gateway.deleted).toHaveLength(1);

    made.gateway.failing.set('sendMessage', new Error('no'));
    await chatter(made, WARN_AGAIN_AFTER);
    expect(
      made.entries.some((entry) => entry.msg === 'could not say the archive warning again'),
    ).toBe(true);
  });
});

describe('PartyScheduler: meeting times and the completion question', () => {
  /** A hatched raid where Alice, Bob and Carol are here and the group meets at 14:40. */
  async function meeting() {
    const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { end: END } });
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    await made.store.update(id, (party) => setMeetingTime(party, ALICE, at('2026-10-13T14:40')));
    await made.attendance.flush();
    await made.service.flush();
    const questions = () =>
      made.gateway.messagesIn(made.postId).filter((message) => message.message.components?.length);
    return { made, id, questions };
  }

  it('keeps the meeting time shown for the clear time, then asks who is here', async () => {
    const { made, questions } = await meeting();
    await tickAt(made, at('2026-10-13T14:41'));
    expect(made.current().groups[0]).toMatchObject({ startClearTime: at('2026-10-13T14:50') });
    expect(questions()).toEqual([]);
    await tickAt(made, at('2026-10-13T14:51'));
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect(questions()).toHaveLength(1);
    expect(questions()[0]?.message.content).toContain(`<@${ALICE}>, <@${BOB}>, <@${CAROL}>`);
    expect(made.current().prompts.completion).toEqual([
      { id: questions()[0]?.id, members: [ALICE, BOB, CAROL] },
    ]);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.CompletePending,
      pendingUntil: at('2026-10-13T14:56'),
    });
    expect(attendeeOf(made.current(), BOB)?.askedBy).toBeUndefined();
  });

  it('does not ask the group of an egg: its meeting time just goes', async () => {
    const made = await reportedRaid({ time: { hatch: at('2026-10-13T14:55') } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.store.update(id, (party) => setMeetingTime(party, ALICE, at('2026-10-13T14:30')));
    await tickAt(made, at('2026-10-13T14:31'));
    await tickAt(made, at('2026-10-13T14:42'));
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Present);
    expect(lines(made)).toEqual([`**Alice** (<@${ALICE}>) is here.`]);
  });

  it('counts silence as done after the timeout, says so, and removes the question', async () => {
    const { made, id, questions } = await meeting();
    await tickAt(made, at('2026-10-13T14:41'));
    await tickAt(made, at('2026-10-13T14:51'));
    await made.attendance.answer(id, bob, false);
    await tickAt(made, at('2026-10-13T14:55'));
    expect(questions()).toHaveLength(1);
    await tickAt(made, at('2026-10-13T14:56'));
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Complete);
    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.Complete);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(lines(made).at(-1)).toBe(`<@${ALICE}>, <@${CAROL}> did not answer and count as done.`);
    expect(questions()).toEqual([]);
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('keeps the promise of the Done button: who says nothing counts as done', async () => {
    const made = await reportedRaid({
      boss: { key: 'yveltal' },
      time: { end: at('2026-10-13T14:40') },
    });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    await tickAt(made, made.clock.now + 5 * MINUTE);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.Complete,
      askedBy: ALICE,
    });
    expect(lines(made).at(-1)).toBe(`<@${BOB}> did not answer and counts as done.`);
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('puts the group back to here when the question cannot be sent', async () => {
    const { made } = await meeting();
    await tickAt(made, at('2026-10-13T14:41'));
    made.gateway.failing.set('sendMessage', new Error('no'));
    await tickAt(made, at('2026-10-13T14:51'));
    made.gateway.failing.clear();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(made.entries.some((e) => e.msg === 'could not do what the clock asked for')).toBe(true);
  });
});

describe('PartyScheduler: running', () => {
  it('runs one tick at a time: a second call while one runs is the same run', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    made.clock.now = HATCH;
    const first = made.scheduler.tick();
    const second = made.scheduler.tick();
    expect(second).toBe(first);
    await first;
    await made.attendance.flush();
    expect(lines(made)).toEqual(['The egg has hatched: **Yveltal**.']);
    expect(made.scheduler.tick()).not.toBe(first);
  });

  it('shows every post anew at start, catches up, looks after the forums, and stops', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const { gateway, scheduler, regions, postId } = made;
    // What a restart forgets: the post on Discord is older than the party.
    const post = gateway.posts.get(postId);
    if (!post) throw new Error('no post');
    post.message = { content: 'stale' };
    const open = await endedButOpen(made);
    const again = await restarted(made);
    again.clock.now = HATCH + MINUTE;

    let ready: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const started = again.scheduler.start(waiting);
    await background.settle();
    // Nothing happens before what it waits for: not a tick, not a call to Discord.
    expect(asRaid(again.store.get(made.party.id)).raid.stageSeen).toBe('egg');
    expect(gateway.posts.get(postId)?.message).toEqual({ content: 'stale' });
    ready();
    await started;
    await again.scheduler.whenIdle();
    await again.attendance.flush();
    await again.service.flush();

    expect(asRaid(again.store.get(made.party.id)).raid.stageSeen).toBe('hatched');
    expect(header(gateway.posts.get(postId)?.message)[0]).toMatch(/^### Level 5 raid against /);
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    expect(gateway.posts.get(open)?.archived).toBe(true);
    expect(regions.byId(1)?.summaryMessageId).not.toBeNull();
    await again.scheduler.stop();
    await scheduler.stop();
  });

  it('records the parties left without their history with the forums, at start and hourly', async () => {
    const left = (n: number) => ({
      ...endParty({ ...testRaid(), id: `00000000-0000-4000-8000-00000000000${String(n)}` }),
      forumChannelId: WEST_FORUM,
      forumPostId: `90000000000000000${String(n)}`,
    });
    const made = await partyServiceWith([left(1)]);
    await made.scheduler.start();
    await made.scheduler.whenIdle();
    expect(made.history.records.map((record) => record.partyId)).toEqual([left(1).id]);
    // One that a record gave up on meanwhile is recorded by the next hour's upkeep.
    made.storage.rows.set(left(2).id, left(2));
    made.clock.now += 61 * MINUTE;
    await made.scheduler.tick();
    await made.scheduler.whenIdle();
    expect(made.history.records.map((record) => record.partyId)).toEqual([left(1).id, left(2).id]);
    await made.scheduler.stop();
  });

  it('stops recording the parties left without their history when it stops', async () => {
    const left = [1, 2, 3].map((n) => ({
      ...endParty({ ...testRaid(), id: `00000000-0000-4000-8000-00000000000${String(n)}` }),
      forumChannelId: WEST_FORUM,
      forumPostId: `90000000000000000${String(n)}`,
    }));
    const made = await partyServiceWith(left);
    await made.scheduler.start();
    // The upkeep is under way: the stop does not wait for all of it.
    await made.scheduler.stop();
    expect(made.history.records).toEqual([]);
    expect(made.storage.rows.size).toBe(3);
  });

  it('starts all the same when what it waits for fails', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    made.clock.now = HATCH;
    await made.scheduler.start(Promise.reject(new Error('no events')));
    await made.scheduler.whenIdle();
    expect(made.current().raid.stageSeen).toBe('hatched');
    await made.scheduler.stop();
  });

  it('does not start when it was stopped while waiting', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    made.clock.now = HATCH;
    let ready: () => void = () => undefined;
    const started = made.scheduler.start(
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
    );
    await made.scheduler.stop();
    ready();
    await started;
    expect(made.current().raid.stageSeen).toBe('egg');
  });

  it('never rejects, also when the parties cannot be listed', async () => {
    const made = await reportedRaid();
    const broken = Object.assign(Object.create(made.store) as typeof made.store, {
      active: () => {
        throw new Error('not loaded');
      },
    });
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: broken,
      posts: made.service,
      attendance: made.attendance,
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
    });
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(made.entries.some((entry) => entry.msg === 'the party clock failed')).toBe(true);
  });

  /** Holds the look through a forum until `release` is called. */
  function holdSweep(made: Made): () => void {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = made.gateway.openPosts.bind(made.gateway);
    vi.spyOn(made.gateway, 'openPosts').mockImplementation(async (forumId) => {
      await held;
      return original(forumId);
    });
    return release;
  }
  /** Whether `work` is done once everything has run that is not held. */
  async function within(work: () => Promise<unknown>): Promise<'done' | 'held'> {
    const immediates = watchImmediates();
    try {
      let done = false;
      void work().then(() => {
        done = true;
      });
      await immediates.settle();
      return done ? 'done' : 'held';
    } finally {
      immediates.restore();
    }
  }

  it('does not hold the clock while the forums are looked through', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    await tickAt(made, made.clock.now);
    const release = holdSweep(made);
    made.clock.now = HATCH;
    // The hourly look is due, and held; the tick must still do its work and end.
    made.clock.now += 61 * MINUTE;
    expect(await within(() => made.scheduler.tick())).toBe('done');
    expect(made.current().raid.stageSeen).not.toBe('egg');
    release();
    await made.scheduler.whenIdle();
  });

  it('starts the clock without waiting for the forums to be looked through', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const release = holdSweep(made);
    expect(await within(() => made.scheduler.start())).toBe('done');
    release();
    await made.scheduler.stop();
  });

  it('looks after the forums again after an hour', async () => {
    const made = await reportedRaid();
    const open = await endedButOpen(made);
    await tickAt(made, made.clock.now + 59 * MINUTE);
    expect(made.gateway.posts.get(open)?.archived).toBe(false);
    await tickAt(made, made.clock.now + MINUTE);
    expect(made.gateway.posts.get(open)?.archived).toBe(true);
  });

  it('has the trains look for stops whose gym is gone, with the forums: every hour', async () => {
    const made = await reportedRaid();
    const looked = vi.spyOn(made.trains, 'removeUnknownStops');
    await tickAt(made, made.clock.now + 59 * MINUTE);
    expect(looked).not.toHaveBeenCalled();
    await tickAt(made, made.clock.now + MINUTE);
    expect(looked).toHaveBeenCalledTimes(1);
    await tickAt(made, made.clock.now + 60 * MINUTE);
    expect(looked).toHaveBeenCalledTimes(2);
  });

  it('has old pictures of places deleted with the upkeep', async () => {
    const made = await reportedRaid();
    let pruned = 0;
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      pictures: {
        prunePlaces: () => {
          pruned += 1;
          return Promise.resolve(0);
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(pruned).toBe(1);
  });

  // Plan 8V-1: the events forum is drawn hourly (a post still open three days after its end).
  it('has the events forum drawn with the upkeep', async () => {
    const made = await reportedRaid();
    let drawn = 0;
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      eventForum: {
        upkeep: () => {
          drawn += 1;
          return Promise.resolve();
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(drawn).toBe(1);
  });

  it('has the emoji of the application read anew with the upkeep', async () => {
    const made = await reportedRaid();
    let read = 0;
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      emoji: {
        refresh: () => {
          read += 1;
          return Promise.resolve();
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(read).toBe(1);
  });

  it('runs the upkeep again on a catch-up, after the one under way, an hour or not (plan 8X-H)', async () => {
    const made = await reportedRaid();
    let read = 0;
    const held = heldCall('the first upkeep’s read of the emoji');
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      emoji: {
        refresh: async () => {
          read += 1;
          // The upkeep at wake, while the network is still away.
          if (read === 1) {
            held.arrive();
            await held.released;
          }
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
    });
    // Before the clock runs there is nothing to catch up, and it says it ran none (review F6).
    expect(await scheduler.catchUp()).toBe(false);
    expect(read).toBe(0);
    await scheduler.start();
    await held.reached;
    const catching = scheduler.catchUp();
    held.release();
    expect(await catching).toBe(true);
    // The one under way, then one of the catch-up's own, though no hour has passed.
    expect(read).toBe(2);
    await scheduler.stop();
    expect(await scheduler.catchUp()).toBe(false);
    expect(read).toBe(2);
  });

  it('redoes the closings the network failed first in the upkeep, before the sweep (plan 8X-H, review r0 B4)', async () => {
    const made = await reportedRaid();
    const away = new TypeError('fetch failed', {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
    });
    made.gateway.failing.set('editPost', away);
    made.gateway.failing.set('archivePost', away);
    await made.service.end(made.party.id);
    made.gateway.failing.clear();
    const redo = vi.spyOn(made.service, 'redoClosings');
    const sweep = vi.spyOn(made.service, 'sweepPosts');
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    const [redoneAt] = redo.mock.invocationCallOrder;
    const [sweptAt] = sweep.mock.invocationCallOrder;
    expect(redoneAt).toBeLessThan(sweptAt ?? 0);
    // Told of the clock's stop, as the history's sweep is.
    expect(redo.mock.calls[0]?.[0]?.isStopped?.()).toBe(false);
    // Its last showing without controls is the redo's: the sweep only archives.
    const post = made.gateway.posts.get(made.postId);
    expect(post?.archived).toBe(true);
    expect(buttonsOf(post?.message)).toEqual([]);
  });

  it('runs no step of the upkeep more once the clock stopped (review r1 C3)', async () => {
    const made = await reportedRaid();
    const ran: string[] = [];
    const held = heldCall('the upkeep’s sweep of the spawn reports');
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      spawns: {
        sweep: async () => {
          ran.push('spawns');
          held.arrive();
          await held.released;
          return 0;
        },
      },
      emoji: {
        refresh: () => {
          ran.push('emoji');
          return Promise.resolve();
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await held.reached;
    const stopping = scheduler.stop();
    held.release();
    await stopping;
    expect(ran).toEqual(['spawns']);
  });

  it('has the standing spawn reports swept with the forums, also when another step fails', async () => {
    const made = await reportedRaid();
    let swept = 0;
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      routes: { removeUnknownStops: () => Promise.reject(new Error('no gyms')) },
      spawns: {
        sweep: () => {
          swept += 1;
          return Promise.resolve(0);
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(swept).toBe(1);
  });

  it('has the grunts’ messages swept with the reports at stops, also when that fails (8R-2)', async () => {
    const made = await reportedRaid();
    const swept: string[] = [];
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      stops: {
        sweep: () => {
          swept.push('stops');
          return Promise.reject(new Error('the database is away'));
        },
      },
      grunts: {
        sweep: () => {
          swept.push('grunts');
          return Promise.resolve(0);
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(swept).toEqual(['stops', 'grunts']);
  });

  it('expires the meetup requests whose time is up at every tick, a failure only logged', async () => {
    const made = await reportedRaid();
    let expired = 0;
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      requests: {
        expire: () => {
          expired += 1;
          return expired === 1
            ? Promise.reject(new Error('the database is away'))
            : Promise.resolve(0);
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
    });
    await scheduler.tick();
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(expired).toBe(2);
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not expire the meetup requests whose time is up',
    );
  });

  it('does not wait for the expiry of the meetup requests, and never runs two at once', async () => {
    const made = await reportedRaid();
    let calls = 0;
    let finish: (() => void) | undefined;
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      requests: {
        expire: () => {
          calls += 1;
          return new Promise<number>((resolve) => {
            finish = () => resolve(0);
          });
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
    });
    // The ticks end while the first expiry is still under way, and start no second one.
    await scheduler.tick();
    await scheduler.tick();
    expect(calls).toBe(1);
    finish?.();
    await scheduler.whenIdle();
    await scheduler.tick();
    expect(calls).toBe(2);
    finish?.();
    await scheduler.whenIdle();
  });

  it('has the new trains of splits settled with the upkeep that a minute left pending', async () => {
    const made = await reportedRaid();
    const asked: number[] = [];
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      splits: {
        settlePendingSplits: (olderThanMs) => {
          asked.push(olderThanMs ?? 0);
          return Promise.resolve(0);
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(asked).toEqual([60_000]);
  });

  it('has the expired sessions of the web pages deleted with the upkeep', async () => {
    const made = await reportedRaid();
    let swept = 0;
    const { PartyScheduler } = await import('./party-scheduler.js');
    const scheduler = new PartyScheduler({
      store: made.store,
      posts: made.service,
      attendance: made.attendance,
      webSessions: {
        sweep: () => {
          swept += 1;
          return Promise.resolve(0);
        },
      },
      lines: made.lines,
      gateway: made.gateway,
      raidBosses: { autoset: () => undefined },
      settings: made.settings,
      log: made.log,
      now: () => made.clock.now,
      upkeepMs: 0,
    });
    await scheduler.tick();
    await scheduler.whenIdle();
    expect(swept).toBe(1);
  });
});

/** A second raid that has ended and whose post a late message opened again; gives the post. */
async function endedButOpen(made: Made): Promise<string> {
  const gym = gymsFixture().get(3);
  if (!gym) throw new Error('no gym');
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: BOB,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T3', shadow: false },
    boss: null,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  const postId = outcome.party.forumPostId ?? '';
  await made.service.end(outcome.party.id);
  await made.gateway.sendMessage(postId, { content: 'late' }, { reopen: true });
  return postId;
}
