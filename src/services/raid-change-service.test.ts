import { describe, expect, it } from 'vitest';
import { EAST_FORUM, testGym, WEST_CHANNEL } from '../../test/support/gyms.js';
import {
  ALICE,
  asRaid,
  at,
  BOB,
  CAROL,
  MINUTE,
  REPORTER,
  testMeetup,
  testRaid,
} from '../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { attendeeOf } from '../domain/party/party.js';
import { certainMoves } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import type { RaidReport } from './party-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const T5 = { level: 'T5', shadow: false } as const;
const ELITE = { level: 'Elite', shadow: false } as const;
const OTHER_SERVER_RAID = '00000000-0000-4000-8000-000000000902';
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** Everything said in the post, line by line, once all of it has gone out. */
async function lines(made: Made): Promise<string[]> {
  await made.attendance.flush();
  await made.service.flush();
  return made.said().join('\n').split('\n').filter(Boolean);
}

/** A second raid, reported through the same service at another gym. */
async function secondRaid(made: Made, gymId: number, report: Partial<RaidReport> = {}) {
  const gym = gymsFixture().get(gymId);
  if (!gym) throw new Error('no gym');
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: BOB,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: T5,
    boss: null,
    ...report,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  await made.service.flush();
  return outcome.party;
}

describe('RaidChangeService: a party that is no raid', () => {
  it('answers gone and leaves the party alone: there is no such raid', async () => {
    const meetup = { ...testMeetup(), forumPostId: '300000000000000077' };
    const made = await partyServiceWith([meetup]);
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('no gym');
    const gone = { kind: 'gone' };
    expect(await made.raids.setHatchTime(meetup.id, alice, HATCH)).toEqual(gone);
    expect(await made.raids.setEndTime(meetup.id, alice, END)).toEqual(gone);
    expect(await made.raids.setDuration(meetup.id, alice, 30)).toEqual(gone);
    expect(
      await made.raids.setBoss(meetup.id, alice, { tier: T5, boss: null, label: 'T5 egg' }),
    ).toEqual(gone);
    expect(await made.raids.setMoveset(meetup.id, alice, { fastMove: 'SNARL_FAST' })).toEqual(gone);
    expect(await made.raids.setGym(meetup.id, alice, gym.id)).toEqual(gone);
    expect(made.store.get(meetup.id)).toBe(meetup);
    expect(made.storage.writes).toEqual([]);
    await made.attendance.flush();
    expect(made.gateway.messagesIn('300000000000000077')).toEqual([]);
  });
});

describe('RaidChangeService: times', () => {
  it('sets the hatch time, the end with it, shows the post anew and says who did it', async () => {
    const made = await reportedRaid();
    const edits = () => made.gateway.posts.get(made.postId)?.edits ?? 0;
    const before = edits();
    const outcome = await made.raids.setHatchTime(made.party.id, alice, HATCH + 30_000);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) set the hatch time: <t:${HATCH / 1000}:t>.`,
    ]);
    expect(edits()).toBe(before + 1);
    expect(made.gateway.messagesIn(made.postId)[0]?.message.mention).toBeUndefined();
  });

  it('sets the end time and works the hatch time out', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const outcome = await made.raids.setEndTime(made.party.id, alice, END);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) set the end time: <t:${END / 1000}:t>.`,
    ]);
  });

  it('says an end that stays was confirmed, not set, by name or for an anonymous reporter', async () => {
    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
    // Named by name when the raid is not anonymous; the anonymous reporter confirms unnamed.
    const confirming = async (anonymous: boolean) => {
      const made = await reportedRaid({ time: { hatch: HATCH }, screenshot, anonymous });
      expect(made.current()).toMatchObject({ endTime: END });
      const who = anonymous ? { id: REPORTER, name: 'Rhea' } : alice;
      await made.raids.setEndTime(made.party.id, who, END);
      return lines(made);
    };
    expect(await confirming(false)).toEqual([
      `**Alice** (<@${ALICE}>) confirmed the end time: <t:${END / 1000}:t>.`,
    ]);
    expect(await confirming(true)).toEqual([`The end time was confirmed: <t:${END / 1000}:t>.`]);
  });

  it('says a hatch time that stays was confirmed, not set, by name or for an anonymous reporter', async () => {
    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
    const confirming = async (anonymous: boolean) => {
      const made = await reportedRaid({ time: { hatch: HATCH }, screenshot, anonymous });
      expect(made.current()).toMatchObject({ hatchTime: HATCH });
      const who = anonymous ? { id: REPORTER, name: 'Rhea' } : alice;
      await made.raids.setHatchTime(made.party.id, who, HATCH);
      return lines(made);
    };
    expect(await confirming(false)).toEqual([
      `**Alice** (<@${ALICE}>) confirmed the hatch time: <t:${HATCH / 1000}:t>.`,
    ]);
    expect(await confirming(true)).toEqual([
      `The hatch time was confirmed: <t:${HATCH / 1000}:t>.`,
    ]);
  });

  it('makes a time guessed from a screenshot sure by a time set, also the same, not by a length', async () => {
    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
    const made = await reportedRaid({ time: { hatch: HATCH }, screenshot });
    expect(made.current()).toMatchObject({ raid: { screenshot } });
    const outcome = await made.raids.setHatchTime(made.party.id, alice, HATCH);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({
      raid: { screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false } },
    });
    // A length is no time: the guess stays a guess (Matt, 2026-10-14).
    const lengthened = await reportedRaid({ time: { hatch: HATCH }, screenshot });
    await lengthened.raids.setDuration(lengthened.party.id, alice, 30);
    expect(lengthened.current()).toMatchObject({ raid: { screenshot } });
    // An end set by a member does.
    const ended = await reportedRaid({ time: { hatch: HATCH }, screenshot });
    await ended.raids.setEndTime(ended.party.id, alice, END);
    expect(ended.current()).toMatchObject({ raid: { screenshot: { timeUncertain: false } } });
  });

  it('says nothing and writes nothing for the time the raid already has', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const writes = made.storage.writes.length;
    const outcome = await made.raids.setHatchTime(made.party.id, alice, HATCH);
    expect(outcome).toMatchObject({ kind: 'ok', changed: false });
    expect(made.storage.writes).toHaveLength(writes);
    expect(await lines(made)).toEqual([]);
  });

  it('names the day for a time that is far off', async () => {
    const made = await reportedRaid({ tier: { level: 'Elite', shadow: false } });
    const far = at('2026-10-14T12:00');
    await made.raids.setHatchTime(made.party.id, alice, far);
    expect(await lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) set the hatch time: <t:${far / 1000}:f>.`,
    ]);
  });

  it('sets how long the raid lasts and moves the end', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    expect(await made.raids.setDuration(id, alice, 90)).toMatchObject({ kind: 'ok' });
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: HATCH + 90 * MINUTE });
    expect(made.current().raid.hatchedDuration).toBe(90);
    expect(await lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) set the length of this raid to 90 minutes.`,
    ]);
    for (const minutes of [0, 181, 2.5]) {
      expect(await made.raids.setDuration(id, alice, minutes)).toEqual({
        kind: 'refused',
        reason: 'bad-duration',
      });
    }
  });

  it('notes the name and team of an attendee who changes something', async () => {
    const made = await reportedRaid();
    await made.raids.setHatchTime(
      made.party.id,
      { id: REPORTER, name: 'Rhea', team: 'valor' },
      HATCH,
    );
    expect(attendeeOf(made.current(), REPORTER)).toMatchObject({ name: 'Rhea', team: 'valor' });
    // Somebody who is not signed up is not signed up by it.
    await made.raids.setHatchTime(made.party.id, alice, HATCH + MINUTE);
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
  });

  it('answers gone for a raid that has ended', async () => {
    const made = await reportedRaid();
    await made.service.end(made.party.id);
    expect(await made.raids.setHatchTime(made.party.id, alice, HATCH)).toEqual({ kind: 'gone' });
  });
});

describe('RaidChangeService: members who are asked', () => {
  /**
   * A raid hatched by its time (a raid reported hatched cannot be made an egg again:
   * `hatched-already`); Alice is done, Bob and Carol are asked and their question is in the post.
   */
  async function asked() {
    const made = await reportedRaid({ time: { hatch: at('2026-10-13T13:50') } });
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Present);
    }
    await made.attendance.done(id, alice);
    await made.attendance.flush();
    await made.service.flush();
    const questions = () =>
      made.gateway.messagesIn(made.postId).filter((message) => message.message.components?.length);
    expect(questions()).toHaveLength(1);
    return { made, id, questions };
  }

  it('asks nobody when the raid is corrected back into an egg, and takes the question away', async () => {
    const { made, id, questions } = await asked();
    const hatch = made.clock.now + 20 * MINUTE;
    expect(await made.raids.setHatchTime(id, alice, hatch)).toMatchObject({ kind: 'ok' });
    for (const member of [BOB, CAROL]) {
      const attendee = attendeeOf(made.current(), member);
      expect(attendee?.status).toBe(PartyStatus.Present);
      expect(attendee?.pendingUntil).toBeUndefined();
      expect(attendee?.askedBy).toBeUndefined();
    }
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Complete);
    const said = await lines(made);
    expect(said.at(-1)).toBe(
      'The raid has not hatched yet, so nobody is asked whether they are done.',
    );
    expect(questions()).toEqual([]);
    expect(made.current().prompts.completion).toEqual([]);
  });

  it('leaves those who are asked alone when the raid stays hatched', async () => {
    const { made, id, questions } = await asked();
    const hatch = made.clock.now - 10 * MINUTE;
    await made.raids.setHatchTime(id, alice, hatch);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.CompletePending);
    expect(attendeeOf(made.current(), CAROL)?.status).toBe(PartyStatus.CompletePending);
    expect(await lines(made)).not.toContain(
      'The raid has not hatched yet, so nobody is asked whether they are done.',
    );
    expect(questions()).toHaveLength(1);
  });
});

describe('RaidChangeService: boss and moves', () => {
  it('sets the boss of an egg, with the title of the post', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const outcome = await made.raids.setBoss(made.party.id, alice, {
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current().raid).toMatchObject({ boss: { key: 'yveltal' }, fastMove: null });
    // Naming the boss does not hatch the egg.
    expect(made.current()).toMatchObject({ hatchTime: HATCH, endTime: END });
    expect(await lines(made)).toEqual([`**Alice** (<@${ALICE}>) set the boss: **Yveltal (T5)**.`]);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('Yveltal · The Stacks');
  });

  it('sets the one move of a boss that has no other', async () => {
    const made = await reportedRaid();
    await made.raids.setBoss(made.party.id, alice, {
      tier: T5,
      boss: { key: 'kyogre' },
      label: 'Kyogre (T5)',
    });
    expect(made.current().raid).toMatchObject({
      boss: { key: 'kyogre' },
      fastMove: 'WATERFALL_FAST',
      chargedMove: null,
    });
  });

  it('turns the raid into an egg of another tier, in other words', async () => {
    const made = await reportedRaid();
    await made.raids.setBoss(made.party.id, alice, {
      tier: { level: 'T3', shadow: false },
      boss: null,
      label: 'T3 egg',
    });
    expect(made.current().raid).toMatchObject({ tier: { level: 'T3' }, boss: null });
    expect(await lines(made)).toEqual([`**Alice** (<@${ALICE}>) changed this to: T3 egg.`]);
  });

  it('refuses to make an Elite egg without a hatch time, whatever the raid was (8E-1)', async () => {
    const eliteEgg = { tier: ELITE, boss: null, label: 'Elite egg' };
    const made = await reportedRaid();
    const before = made.current();
    expect(await made.raids.setBoss(made.party.id, alice, eliteEgg)).toEqual({
      kind: 'refused',
      reason: 'elite-egg-time',
    });
    expect(made.current()).toBe(before);
    expect(await lines(made)).toEqual([]);
    // A raid reported hatched is no egg by `raidStage`, though its boss is cleared (review BR-2).
    const hatched = await reportedRaid({ boss: { key: 'yveltal' } });
    expect(await hatched.raids.setBoss(hatched.party.id, alice, eliteEgg)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(hatched.current().raid).toMatchObject({ tier: { level: 'Elite' }, boss: null });
    // With its hatch time it may become one.
    const timed = await reportedRaid({ time: { hatch: HATCH } });
    expect(await timed.raids.setBoss(timed.party.id, alice, eliteEgg)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    // A Level 5 egg without its hatch time is no more made an Elite boss: naming the boss does
    // not hatch it, and it would stand as an Elite egg (Matt, 2026-10-29).
    const eliteBoss = { tier: ELITE, boss: { key: 'yveltal' }, label: 'Yveltal (Elite)' };
    const timeless = await reportedRaid();
    const untouched = timeless.current();
    expect(await timeless.raids.setBoss(timeless.party.id, alice, eliteBoss)).toEqual({
      kind: 'refused',
      reason: 'elite-egg-time',
    });
    expect(timeless.current()).toBe(untouched);
    expect(await lines(timeless)).toEqual([]);
    // With its hatch time it may, and so may a raid that has hatched.
    const timedEgg = await reportedRaid({ time: { hatch: HATCH } });
    expect(await timedEgg.raids.setBoss(timedEgg.party.id, alice, eliteBoss)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    const seen = await reportedRaid({ boss: { key: 'yveltal' } });
    expect(await seen.raids.setBoss(seen.party.id, alice, eliteBoss)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
  });

  it('changes nothing for the boss the raid has', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const outcome = await made.raids.setBoss(made.party.id, alice, {
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
    expect(outcome).toMatchObject({ kind: 'ok', changed: false });
    expect(await lines(made)).toEqual([]);
  });

  it('sets one move or both, and refuses a raid without a boss', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const id = made.party.id;
    await made.raids.setMoveset(id, alice, { fastMove: 'SNARL_FAST' });
    expect(made.current().raid).toMatchObject({ fastMove: 'SNARL_FAST', chargedMove: null });
    await made.raids.setMoveset(id, alice, { chargedMove: 'DARK_PULSE' });
    expect(made.current().raid).toMatchObject({
      fastMove: 'SNARL_FAST',
      chargedMove: 'DARK_PULSE',
    });
    expect(await lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) set the fast move: Snarl.`,
      `**Alice** (<@${ALICE}>) set the charged move: Dark Pulse.`,
    ]);
    const egg = await reportedRaid();
    expect(await egg.raids.setMoveset(egg.party.id, alice, { fastMove: 'SNARL_FAST' })).toEqual({
      kind: 'refused',
      reason: 'no-boss',
    });
  });
});

describe('RaidChangeService: moves are checked against the boss the raid has', () => {
  it('refuses a move the boss of the raid does not have', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const id = made.party.id;
    for (const moves of [
      { fastMove: 'WATERFALL_FAST' },
      { chargedMove: 'SNARL_FAST' },
      { fastMove: 'SNARL_FAST', chargedMove: 'SURF' },
    ]) {
      expect(await made.raids.setMoveset(id, alice, moves)).toEqual({
        kind: 'refused',
        reason: 'not-a-move',
      });
    }
    expect(made.current().raid.fastMove).toBeNull();
  });

  it("refuses the old boss's move when the boss was changed meanwhile", async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    const id = made.party.id;
    const [changed, moved] = await Promise.all([
      made.raids.setBoss(id, bob, { tier: T5, boss: { key: 'kyogre' }, label: 'Kyogre (T5)' }),
      made.raids.setMoveset(id, alice, { fastMove: 'SNARL_FAST' }),
    ]);
    expect(changed.kind).toBe('ok');
    expect(moved).toEqual({ kind: 'refused', reason: 'not-a-move' });
    expect(made.current().raid).toMatchObject({
      boss: { key: 'kyogre' },
      fastMove: 'WATERFALL_FAST',
    });
  });

  it('says both moves when both are set at once', async () => {
    const made = await reportedRaid({ boss: { key: 'yveltal' } });
    await made.raids.setMoveset(made.party.id, alice, {
      fastMove: 'GUST_FAST',
      chargedMove: 'HURRICANE',
    });
    expect(await lines(made)).toEqual([`**Alice** (<@${ALICE}>) set the moves: Gust / Hurricane.`]);
  });
});

describe('RaidChangeService: meeting times follow corrected raid times', () => {
  const stamp = (time: number) => `<t:${time / 1000}:t>`;

  /** An egg that hatches at 14:30; Alice is here and her group meets at `meet`. */
  async function meeting(meet: number) {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.setMeetingTime(id, alice, meet);
    await lines(made);
    return { made, id };
  }

  it('moves a meeting time that was the hatch time along with the hatch time', async () => {
    const { made, id } = await meeting(HATCH);
    const later = HATCH + 25 * MINUTE;
    await made.raids.setHatchTime(id, bob, later);
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: later });
    expect((await lines(made)).slice(-2)).toEqual([
      `**Bob** (<@${BOB}>) set the hatch time: ${stamp(later)}.`,
      `The meeting time moves with it: ${stamp(later)}.`,
    ]);
  });

  it('cancels a meeting time that the corrected times leave outside the raid', async () => {
    const { made, id } = await meeting(HATCH + 10 * MINUTE);
    // The egg hatches later than the group wanted to meet.
    await made.raids.setHatchTime(id, bob, HATCH + 25 * MINUTE);
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect((await lines(made)).at(-1)).toBe(
      'The meeting time no longer fits the raid and is canceled.',
    );

    // The raid ends before the group wanted to meet.
    const short = await meeting(HATCH + 40 * MINUTE);
    await short.made.raids.setDuration(short.id, bob, 30);
    expect(short.made.current().groups[0]).toEqual({ id: 'A' });
  });

  it('leaves a meeting time alone that still fits, and names the group when there are several', async () => {
    const { made, id } = await meeting(HATCH + 20 * MINUTE);
    await made.raids.setHatchTime(id, bob, HATCH + 5 * MINUTE);
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: HATCH + 20 * MINUTE });
    await made.attendance.newGroup(id, carol);
    await made.attendance.setMeetingTime(id, carol, HATCH + 6 * MINUTE);
    await made.raids.setHatchTime(id, bob, HATCH + 10 * MINUTE);
    expect(made.current().groups).toEqual([
      { id: 'A', startTime: HATCH + 20 * MINUTE },
      { id: 'B', opened: expect.any(Number) as number },
    ]);
    expect((await lines(made)).at(-1)).toBe(
      'The meeting time of group B no longer fits the raid and is canceled.',
    );
  });
});

describe('RaidChangeService: the gym, and one raid per gym', () => {
  it('moves the raid to another gym of its region', async () => {
    const made = await reportedRaid();
    const outcome = await made.raids.setGym(made.party.id, alice, 2);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ gymId: 2, regionId: 1 });
    expect(await lines(made)).toEqual([
      `**Alice** (<@${ALICE}>) moved this raid to **Old Stone Fountain**.`,
    ]);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('T5 egg · Old Stone Fountain');
    // The gym it left is free again, the one it is at is taken.
    expect(made.store.raidAt(1, 1, made.clock.now)).toBeUndefined();
    expect(made.store.raidAt(1, 2, made.clock.now)?.id).toBe(made.party.id);
  });

  // Final review of 8X-F, F2: the line ends once after a gym whose name ends in a period.
  it('ends the line of a move once after a gym whose name ends in a period', async () => {
    const inc = testGym(13, 'Corner Store Inc.', 40.051, -80.051);
    const made = await reportedRaid({}, { gyms: gymsFixture([inc]) });
    await made.raids.setGym(made.party.id, alice, 13);
    expect((await lines(made)).at(-1)).toBe(
      `**Alice** (<@${ALICE}>) moved this raid to **Corner Store Inc.**`,
    );
  });

  it('changes nothing for the gym the raid is at', async () => {
    const made = await reportedRaid();
    expect(await made.raids.setGym(made.party.id, alice, 1)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
  });

  it('refuses a gym that lies in no region, or in none of this server with a forum', async () => {
    const made = await reportedRaid();
    const east = made.regions.byId(2);
    if (!east) throw new Error('no region East');
    expect(await made.raids.setGym(made.party.id, alice, 10)).toEqual({
      kind: 'refused',
      reason: 'other-region',
    });
    east.guildId = 2;
    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({
      kind: 'refused',
      reason: 'other-region',
    });
    east.guildId = 1;
    east.forumChannelId = null;
    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({
      kind: 'refused',
      reason: 'other-region',
    });
    expect(made.current().gymId).toBe(1);
    expect(made.store.active()).toHaveLength(1);
  });

  it('moves the raid to a gym of another region: a new party, and a line in its new post', async () => {
    const made = await reportedRaid();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    const outcome = await made.raids.setGym(made.party.id, { ...alice, team: 'valor' }, 8);
    if (outcome.kind !== 'ok') throw new Error(outcome.kind);
    await made.attendance.flush();
    await made.service.flush();
    expect(outcome).toMatchObject({ changed: true, from: { id: made.party.id, status: 'ended' } });
    expect(outcome.party).toMatchObject({ gymId: 8, regionId: 2, forumChannelId: EAST_FORUM });
    expect(outcome.party.id).not.toBe(made.party.id);
    expect(outcome.party.attendees[ALICE]).toMatchObject({ name: 'Alice', team: 'valor' });
    expect(made.store.active().map((party) => party.id)).toEqual([outcome.party.id]);
    const newPost = outcome.party.forumPostId ?? '';
    expect(made.gateway.messagesIn(newPost).map((message) => message.message.content)).toEqual([
      `**Alice** (<@${ALICE}>) moved this raid here from **The Stacks** in <#${WEST_CHANNEL}>.`,
    ]);
    // The old post has its last words, and nothing of the line.
    expect(made.said().join('\n')).not.toContain('moved this raid here');
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('says where a move would take the raid: its own region, another one of the server, or nowhere', async () => {
    const made = await reportedRaid();
    const gym = (id: number) => {
      const found = gymsFixture().get(id);
      if (!found) throw new Error(`no gym ${String(id)}`);
      return found;
    };
    const party = made.current();
    expect(made.raids.gymMove(party, gym(1))).toEqual({ kind: 'local' });
    expect(made.raids.gymMove(party, gym(2))).toEqual({ kind: 'local' });
    expect(made.raids.gymMove(party, gym(8))).toMatchObject({ kind: 'region', region: { id: 2 } });
    expect(made.raids.gymMove(party, gym(10))).toEqual({ kind: 'nowhere' });
    const east = made.regions.byId(2);
    if (!east) throw new Error('no region East');
    east.forumChannelId = null;
    expect(made.raids.gymMove(party, gym(8))).toEqual({ kind: 'nowhere' });
  });

  it('copes with a raid whose own region is gone: its gym is still its gym, other servers do not count', async () => {
    const made = await reportedRaid();
    const west = made.regions.rows.findIndex((region) => region.id === 1);
    made.regions.rows.splice(west, 1);
    // The gym the raid is at: nothing to do, and not "taken" by the raid itself.
    expect(await made.raids.setGym(made.party.id, alice, 1)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    expect(made.store.active()).toHaveLength(1);
    // A region of another server that has the gym does not take the raid.
    const east = made.regions.byId(2);
    if (!east) throw new Error('no region East');
    east.guildId = 2;
    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({
      kind: 'refused',
      reason: 'other-region',
    });
    east.guildId = 1;
    expect(await made.raids.setGym(made.party.id, alice, 8)).toMatchObject({
      kind: 'ok',
      changed: true,
      party: { regionId: 2 },
    });
  });

  it('hands the answer for a move to another region on, and calls it for no other change', async () => {
    const made = await reportedRaid();
    const answered: number[] = [];
    const answer = (party: { gymId: number | null }): Promise<void> => {
      answered.push(party.gymId ?? 0);
      return Promise.resolve();
    };
    await made.raids.setGym(made.party.id, alice, 2, answer);
    await made.raids.setGym(made.party.id, alice, 10, answer);
    expect(answered).toEqual([]);
    await made.raids.setGym(made.party.id, alice, 8, answer);
    expect(answered).toEqual([8]);
  });

  it('refuses the move to another region when that gym has a raid, naming it', async () => {
    const made = await reportedRaid();
    const other = await secondRaid(made, 8);
    const outcome = await made.raids.setGym(made.party.id, alice, 8);
    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: 'gym-taken',
      other: { id: other.id },
    });
    expect(made.current().gymId).toBe(1);
  });

  it('answers gone for a move of a raid that has ended', async () => {
    const made = await reportedRaid();
    await made.service.end(made.party.id);
    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({ kind: 'gone' });
    expect(await made.raids.setGym(made.party.id, alice, 2)).toEqual({ kind: 'gone' });
  });

  it('refuses a gym that has a raid already, naming it', async () => {
    const made = await reportedRaid();
    const other = await secondRaid(made, 2);
    const outcome = await made.raids.setGym(made.party.id, alice, 2);
    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: 'gym-taken',
      other: { id: other.id },
    });
    expect(made.current().gymId).toBe(1);
    expect(await lines(made)).toEqual([]);
  });

  // Plan 8E (Matt, 2026-10-26): one raid per gym, of any kind.
  it('refuses a gym that has an elite raid for a standard one, and the reverse', async () => {
    const standard = await reportedRaid();
    const elite = await secondRaid(standard, 2, { tier: ELITE });
    expect(await standard.raids.setGym(standard.party.id, alice, 2)).toMatchObject({
      kind: 'refused',
      reason: 'gym-taken',
      other: { id: elite.id },
    });
    expect(standard.current().gymId).toBe(1);

    const eliteMade = await reportedRaid({ tier: ELITE });
    const other = await secondRaid(eliteMade, 2);
    expect(await eliteMade.raids.setGym(eliteMade.party.id, alice, 2)).toMatchObject({
      kind: 'refused',
      reason: 'gym-taken',
      other: { id: other.id },
    });
    expect(eliteMade.current().gymId).toBe(1);
  });

  it('refuses an end time that would bring a finished raid back beside its successor', async () => {
    const made = await reportedRaid({
      boss: { key: 'yveltal' },
      time: { end: at('2026-10-13T14:10') },
    });
    made.clock.now = at('2026-10-13T14:12');
    // The first raid is over by the clock, so the gym takes a new report.
    const next = await secondRaid(made, 1);
    const outcome = await made.raids.setEndTime(made.party.id, alice, at('2026-10-13T14:40'));
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'gym-taken', other: { id: next.id } });
    expect(made.current().endTime).toBe(at('2026-10-13T14:10'));
    // A time that leaves it over is fine.
    expect(await made.raids.setEndTime(made.party.id, alice, at('2026-10-13T14:11'))).toMatchObject(
      { kind: 'ok', changed: true },
    );
  });

  // Review E6 of plan 8E: the successor of the other kind stands in the way all the same.
  it('refuses an end time that would bring a finished raid back beside an elite successor', async () => {
    const made = await reportedRaid({
      boss: { key: 'yveltal' },
      time: { end: at('2026-10-13T14:10') },
    });
    made.clock.now = at('2026-10-13T14:12');
    const next = await secondRaid(made, 1, { tier: ELITE });
    const outcome = await made.raids.setEndTime(made.party.id, alice, at('2026-10-13T14:40'));
    expect(outcome).toMatchObject({ kind: 'refused', reason: 'gym-taken', other: { id: next.id } });
    expect(made.current().endTime).toBe(at('2026-10-13T14:10'));
  });

  // Review E7 of plan 8E (the coordinator's ruling): a raid stands at a gym for its server.
  it('moves a raid to a gym where only a raid of another server stands', async () => {
    const made = await reportedRaid();
    await made.store.add(testRaid({ id: OTHER_SERVER_RAID, guildId: 2, gymId: 2 }));
    expect(await made.raids.setGym(made.party.id, alice, 2)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(made.current().gymId).toBe(2);
  });

  // Plan 8E, goal 4: an elite and a standard raid stored at one gym before the rule both run
  // out by the clock, and either may still change its tier at its own gym.
  it('lets either of two raids stored at one gym before change its kind there', async () => {
    const made = await reportedRaid({ tier: ELITE });
    // With its hatch time: a Level 5 egg without one is made no Elite boss (plan 8F-1, review BR-2).
    const standard = await secondRaid(made, 2, { time: { hatch: HATCH } });
    await made.store.update(standard.id, (party) => ({ party: { ...asRaid(party), gymId: 1 } }));
    expect(
      await made.raids.setBoss(made.party.id, alice, {
        tier: T5,
        boss: { key: 'yveltal' },
        label: 'Yveltal (T5)',
      }),
    ).toMatchObject({ kind: 'ok', changed: true });
    expect(
      await made.raids.setBoss(standard.id, bob, {
        tier: ELITE,
        boss: { key: 'yveltal' },
        label: 'Yveltal (Elite)',
      }),
    ).toMatchObject({ kind: 'ok', changed: true });
  });

  it('gives a gym to one of two raids that move there at once', async () => {
    const made = await reportedRaid();
    const other = await secondRaid(made, 2);
    const [first, second] = await Promise.all([
      made.raids.setGym(made.party.id, alice, 3),
      made.raids.setGym(other.id, bob, 3),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(['ok', 'refused']);
    expect(made.store.active().filter((party) => party.gymId === 3)).toHaveLength(1);
  });

  it('lets two raids swap towards each other without waiting for ever', async () => {
    const made = await reportedRaid();
    const other = await secondRaid(made, 2);
    const outcomes = await Promise.all([
      made.raids.setGym(made.party.id, alice, 2),
      made.raids.setGym(other.id, bob, 1),
    ]);
    // Each finds the other in its way: neither moves, and neither hangs.
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['refused', 'refused']);
  });

  it('looks again when the raid was moved while it waited for the gym', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    const outcomes = await Promise.all([
      made.raids.setGym(id, alice, 2),
      made.raids.setGym(id, bob, 3),
    ]);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['ok', 'ok']);
    expect(made.current().gymId).toBe(3);
    expect(made.store.raidAt(1, 2, made.clock.now)).toBeUndefined();
  });

  it('may still change a raid that shares its gym already', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    // Two raids at one gym, as only a fault could leave them.
    const twin = await secondRaid(made, 2, { time: { hatch: HATCH } });
    await made.store.update(twin.id, (party) => ({ party: { ...asRaid(party), gymId: 1 } }));
    expect(await made.raids.setHatchTime(made.party.id, alice, HATCH + MINUTE)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
  });
});

describe('certain moves when a raid is reported', () => {
  it('gives a reported Kyogre its one fast move, and leaves a given move alone', async () => {
    const made = await reportedRaid({ boss: { key: 'kyogre' } });
    expect(made.party.raid).toMatchObject({ fastMove: 'WATERFALL_FAST', chargedMove: null });
    const given = await reportedRaid({ boss: { key: 'kyogre' }, chargedMove: 'SURF' });
    expect(given.party.raid).toMatchObject({ fastMove: 'WATERFALL_FAST', chargedMove: 'SURF' });
  });

  it('is nothing for a Pokémon with a choice, and for one that is not known', () => {
    expect(certainMoves({ fastMoves: ['A', 'B'], chargedMoves: ['C'] })).toEqual({
      fastMove: null,
      chargedMove: 'C',
    });
    expect(certainMoves({ fastMoves: [], chargedMoves: [] })).toEqual({
      fastMove: null,
      chargedMove: null,
    });
    expect(certainMoves(undefined)).toEqual({ fastMove: null, chargedMove: null });
  });
});

describe('AttendanceService.setMeetingTime', () => {
  const MEET = at('2026-10-13T14:45');

  it("sets the time of the member's group and tells the others, pinging who allows it", async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    for (const member of [alice, bob, carol]) {
      await made.attendance.signUp(id, member, PartyStatus.Coming);
    }
    made.userSettings.set(BOB, { mentionsGroups: false });
    await made.attendance.flush();
    const outcome = await made.attendance.setMeetingTime(id, alice, MEET + 20_000);
    expect(outcome).toMatchObject({ kind: 'ok', acted: true, group: 'A' });
    expect(made.current().groups[0]).toEqual({ id: 'A', startTime: MEET });
    await made.attendance.flush();
    const notice = made.gateway.messagesIn(made.postId).at(-1);
    expect(notice?.message.content).toBe(
      `**Alice** (<@${ALICE}>) set the meeting time: <t:${MEET / 1000}:t> (<t:${MEET / 1000}:R>).\n` +
        `<@${REPORTER}> <@${CAROL}>`,
    );
    expect(notice?.message.mention).toEqual({ users: [REPORTER, CAROL] });
  });

  it('names the group when the raid has several, and tells only that group', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.newGroup(id, bob);
    await made.attendance.signUp(id, carol, PartyStatus.Coming);
    await made.attendance.flush();
    await made.attendance.setMeetingTime(id, bob, MEET);
    await made.attendance.flush();
    const notice = made.gateway.messagesIn(made.postId).at(-1);
    expect(notice?.message.content).toBe(
      `**Bob** (<@${BOB}>) set the meeting time of group B: <t:${MEET / 1000}:t> (<t:${MEET / 1000}:R>).\n` +
        `<@${CAROL}>`,
    );
  });

  it('cancels it, says so, and says nothing when there was none', async () => {
    const made = await reportedRaid({ time: { hatch: HATCH } });
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.setMeetingTime(id, alice, MEET);
    await made.attendance.flush();
    const before = made.gateway.messagesIn(made.postId).length;
    expect(await made.attendance.setMeetingTime(id, alice, null)).toMatchObject({ acted: true });
    await made.attendance.flush();
    expect(made.current().groups[0]).toEqual({ id: 'A' });
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toBe(
      `**Alice** (<@${ALICE}>) canceled the meeting time.\n<@${REPORTER}>`,
    );
    expect(await made.attendance.setMeetingTime(id, alice, null)).toMatchObject({ acted: false });
    await made.attendance.flush();
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(before + 1);
  });

  it('is only for somebody who is signed up', async () => {
    const made = await reportedRaid();
    expect(await made.attendance.setMeetingTime(made.party.id, alice, MEET)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
  });
});
