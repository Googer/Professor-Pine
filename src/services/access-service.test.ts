import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { EAST_CHANNEL, EAST_FORUM, TEST_GUILD_ROW, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  MemoryAccessGrants,
  reportedRaid,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { REGION_ROLE, viewOverwrite } from '../../test/support/region-roles.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const yveltal = { boss: { key: 'yveltal' } } as const;

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** Lets everything that is under way finish: the access, the lines, the posts. */
async function settled(made: Made): Promise<void> {
  await made.attendance.flush();
  await made.access.flush();
  await made.service.flush();
}

/** The calls that changed who may see a forum, in order. */
const accessCalls = (made: Made): string[] =>
  made.gateway.calls.filter((call) => /^(admit|dismiss)Member /.test(call));

/** A second raid in West, at the fountain (gym 2), reported by `REPORTER`; gives its id. */
async function secondRaid(made: Made): Promise<string> {
  const gym = gymsFixture().get(2);
  if (!gym) throw new Error('no gym 2');
  const outcome = await made.service.reportRaid({
    gym,
    guildRow: TEST_GUILD_ROW,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.NotInterested,
    tier: { level: 'T3', shadow: false },
    boss: null,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  return outcome.party.id;
}

function missingPermissions(): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError({ code, message: 'Missing Permissions' }, code, 403, 'PUT', '/x', {});
}

describe('AccessService: who is let into a forum', () => {
  it('lets in a member who signs up and cannot see the forum, and records it first', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(await made.grants.list()).toEqual([
      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: made.clock.now },
    ]);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
    // Whatever else they do in the raid changes nothing about it.
    await made.attendance.changeNumber(made.party.id, alice, 1);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await settled(made);
    expect(accessCalls(made)).toHaveLength(1);
  });

  it('does nothing for a member who can see the forum', async () => {
    const made = await reportedRaid(yveltal);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
    expect(await made.grants.list()).toEqual([]);
  });

  it('lets in whoever reports a raid for a forum they cannot see', async () => {
    const made = await reportedRaid();
    made.gateway.shutOut(EAST_FORUM, BOB);
    const gym = gymsFixture().get(8);
    if (!gym) throw new Error('no gym 8');
    const outcome = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T5', shadow: false },
      boss: null,
      regionChannelId: EAST_CHANNEL,
    });
    expect(outcome.kind).toBe('created');
    await settled(made);
    expect(made.gateway.canSee(EAST_FORUM, BOB)).toBe(true);
    expect(made.access.has(EAST_FORUM, BOB)).toBe(true);
    // The reporter of the first raid sees West, and nobody was let into it.
    expect(made.access.size).toBe(1);
  });

  it('takes the access back when the member leaves', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(accessCalls(made)).toEqual([
      `admitMember ${WEST_FORUM} ${ALICE}`,
      `dismissMember ${WEST_FORUM} ${ALICE}`,
    ]);
    expect(await made.grants.list()).toEqual([]);
    expect(made.access.size).toBe(0);
  });

  it('leaves a member in who has completed the raid, until the raid ends', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.attendance.done(made.party.id, alice);
    await settled(made);
    // Done is not gone: the post stays in sight (Matt, 2026-10-11).
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    await made.service.end(made.party.id);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
  });

  it('keeps the access while the member is in another raid of the same forum', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const other = await secondRaid(made);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(other, alice, PartyStatus.Interested);
    await settled(made);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    await made.attendance.leave(other, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(accessCalls(made)).toHaveLength(2);
  });

  it('takes back what a raid called for when the raid ends', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    const other = await secondRaid(made);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.signUp(other, bob, PartyStatus.Coming);
    await settled(made);
    expect(made.access.size).toBe(2);
    await made.service.end(made.party.id);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    // Bob is still in the other raid of this forum.
    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(true);
    expect((await made.grants.list()).map((grant) => grant.memberId)).toEqual([BOB]);
  });

  it('ends with no access for a member who signs up and leaves at once', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await Promise.all([
      made.attendance.signUp(made.party.id, alice, PartyStatus.Coming),
      made.attendance.leave(made.party.id, alice),
    ]);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
  });
});

describe('AccessService: what it leaves alone and what can fail', () => {
  it('leaves a member alone whom somebody keeps out of the forum on purpose', async () => {
    const made = await reportedRaid(yveltal);
    // Signed up before somebody kept them out (since plan 8Z-2 the attendance service refuses a
    // newcomer who is kept out already): their sign-up stands, and their next change is looked at.
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    await made.attendance.changeNumber(made.party.id, alice, 1);
    await settled(made);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
    expect(made.gateway.barred.get(WEST_FORUM)?.has(ALICE)).toBe(true);
    expect(made.entries.some((entry) => /kept out of a forum/.test(String(entry.msg)))).toBe(true);
  });

  it('never touches an overwrite it did not make', async () => {
    const made = await reportedRaid(yveltal);
    // A moderator let Alice in by hand: she can see the forum, so nothing is recorded.
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.admitted.set(WEST_FORUM, new Set([ALICE]));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    await made.access.sweep();
    expect(accessCalls(made)).toEqual([]);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
  });

  it('leaves a forum alone for ten minutes that refused it, and says why once', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB, CAROL);
    made.gateway.failing.set('admitMember', missingPermissions());
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(await made.grants.list()).toEqual([]);
    expect(made.access.size).toBe(0);
    const warnings = made.entries.filter((entry) => /Manage Permissions/.test(String(entry.msg)));
    expect(warnings).toHaveLength(1);

    made.gateway.failing.delete('admitMember');
    made.clock.now += 10 * MINUTE;
    await made.attendance.signUp(made.party.id, { id: CAROL }, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, CAROL)).toBe(true);
  });

  it('takes back an overwrite that may or may not have been made', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.failing.set('admitMember', new Error('socket hang up'));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([
      `admitMember ${WEST_FORUM} ${ALICE}`,
      `dismissMember ${WEST_FORUM} ${ALICE}`,
    ]);
    expect(await made.grants.list()).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'could not let a member into a forum')).toBe(
      true,
    );
  });

  it('keeps the record when it can neither make an overwrite nor take it back, and the grant goes later', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.failing.set('admitMember', new Error('socket hang up'));
    made.gateway.failing.set('dismissMember', new Error('socket hang up'));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    // Whether Discord has the overwrite is not known: the record stays, so it can be taken back.
    expect(await made.grants.list()).toHaveLength(1);
    const logged = made.entries.map((entry) => entry.msg);
    expect(logged).toContain('could not let a member into a forum');
    expect(logged).toContain('could not settle the access of a member to a forum');
    made.gateway.failing.clear();
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(await made.grants.list()).toEqual([]);
  });

  it('never takes away what a moderator made of its overwrite: a member who was barred stays barred', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    // A moderator turns the overwrite into one that keeps Alice out.
    made.gateway.admitted.get(WEST_FORUM)?.delete(ALICE);
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.barred.get(WEST_FORUM)?.has(ALICE)).toBe(true);
    // The record is dropped all the same: the overwrite is no longer the bot's.
    expect(await made.grants.list()).toEqual([]);
    expect(
      made.entries.some((entry) => /somebody changed the access I gave/.test(String(entry.msg))),
    ).toBe(true);
    // And signing up again does not let her in.
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(accessCalls(made).filter((call) => call.startsWith('admitMember'))).toHaveLength(1);
  });

  it("tries again with the member's next step when Discord could not be asked", async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.failing.set('memberAccess', new Error('503'));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    made.gateway.failing.delete('memberAccess');
    await made.attendance.changeNumber(made.party.id, alice, 1);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
  });

  it('forgets the record again when the forum is gone by the time the member is let in', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const admit = made.gateway.admitMember.bind(made.gateway);
    vi.spyOn(made.gateway, 'admitMember').mockImplementation((forumId, memberId) => {
      made.gateway.gone.add(forumId);
      return admit(forumId, memberId);
    });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(await made.grants.list()).toEqual([]);
    expect(made.access.size).toBe(0);
  });

  it('keeps the record when the row cannot be removed, and the sweep finishes the job', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    const storage = made.grants as MemoryAccessGrants;
    storage.failing = new Error('the database is away');
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
    storage.failing = undefined;
    expect(await made.access.sweep()).toBe(1);
    expect(await made.grants.list()).toEqual([]);
  });

  it('takes the grant back of a member who leaves while the record is being written', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const storage = made.grants as MemoryAccessGrants;
    const add = storage.add.bind(storage);
    let leaving: Promise<unknown> | undefined;
    vi.spyOn(storage, 'add').mockImplementation(async (grant) => {
      // The member leaves while the record is on its way: nothing is recorded in memory yet.
      leaving = made.attendance.leave(made.party.id, alice);
      await leaving;
      return add(grant);
    });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.access.flush();
    await leaving;
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
    expect(accessCalls(made).map((call) => call.split(' ')[0])).toEqual([
      'admitMember',
      'dismissMember',
    ]);
  });

  it('rests for ten minutes when the forum has as many overwrites as Discord allows', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    const code = RESTJSONErrorCodes.MaximumNumberOfChannelPermissionOverwritesReached;
    made.gateway.failing.set(
      'admitMember',
      new DiscordAPIError({ code, message: 'Maximum reached' }, code, 400, 'PUT', '/x', {}),
    );
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(
      made.entries.filter((entry) => /as many permission overwrites/.test(String(entry.msg))),
    ).toHaveLength(1);
  });

  it('keeps the record of a grant it could not take back, and tries again with the sweep', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    made.gateway.failing.set('dismissMember', new Error('Discord is away'));
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(await made.grants.list()).toHaveLength(1);

    made.gateway.failing.delete('dismissMember');
    expect(await made.access.sweep()).toBe(1);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
  });

  it('records nothing when the record cannot be written, and makes no overwrite', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    (made.grants as MemoryAccessGrants).failing = new Error('the database is away');
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
    expect(made.access.size).toBe(0);
  });

  it('does nothing for a member who is no longer in the server', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.leftServer.add(ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
  });
});

describe('AccessService: over a restart, and the sweep', () => {
  it('knows its grants after a restart and takes them back when the member leaves', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    const again = await restarted(made);
    expect(again.access.has(WEST_FORUM, ALICE)).toBe(true);
    await again.attendance.leave(made.party.id, alice);
    await again.attendance.flush();
    await again.access.flush();
    expect(again.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await again.grants.list()).toEqual([]);
  });

  it('sweeps what nothing calls for any more and keeps the rest', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    // Left behind by a stop of the process: a grant for somebody who is in no raid here, and
    // one for a forum that is gone.
    await made.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    await made.grants.add({
      forumChannelId: '100000000000000099',
      memberId: BOB,
      guildId: 1,
      createdAt: 2,
    });
    made.gateway.admitted.get(WEST_FORUM)?.add(BOB);
    const again = await restarted(made);
    expect(again.access.size).toBe(3);
    expect(await again.access.sweep()).toBe(2);
    expect(again.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
    expect(again.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect((await again.grants.list()).map((grant) => grant.memberId)).toEqual([ALICE]);
    expect(await again.access.sweep()).toBe(0);
  });

  it('lets a member in again whose record has no overwrite, with the sweep', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await settled(made);
    // A stop between the record and the overwrite, or an overwrite deleted by hand.
    made.gateway.admitted.get(WEST_FORUM)?.delete(ALICE);
    const again = await restarted(made);
    expect(await again.access.sweep()).toBe(0);
    expect(again.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    // Bob's was fine and is not made again.
    expect(accessCalls(made).filter((call) => call.endsWith(BOB))).toHaveLength(1);
    // The sweep lets nobody in who has no record.
    made.gateway.shutOut(WEST_FORUM, REPORTER);
    await again.access.sweep();
    expect(again.gateway.canSee(WEST_FORUM, REPORTER)).toBe(false);
  });

  it('does its part of the upkeep also when the look through the forums fails', async () => {
    const made = await reportedRaid(yveltal);
    await made.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    const again = await restarted(made);
    vi.spyOn(again.service, 'sweepPosts').mockRejectedValue(new Error('no forums today'));
    await again.scheduler.start();
    await again.scheduler.whenIdle();
    await again.scheduler.stop();
    expect(await again.grants.list()).toEqual([]);
  });

  it('is swept by the clock with the forums, at start and hourly', async () => {
    const made = await reportedRaid(yveltal);
    await made.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    const again = await restarted(made);
    await again.scheduler.start();
    await again.scheduler.whenIdle();
    expect(await again.grants.list()).toEqual([]);

    await again.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    const third = await restarted(again);
    third.clock.now += 59 * MINUTE;
    await third.scheduler.tick();
    await third.scheduler.whenIdle();
    expect(await third.grants.list()).toHaveLength(1);
    third.clock.now += MINUTE;
    await third.scheduler.tick();
    await third.scheduler.whenIdle();
    expect(await third.grants.list()).toEqual([]);
    await third.scheduler.stop();
  });
});

describe('AccessService: a meetup', () => {
  /** Lets everything that is under way finish, for a meetup made through the service. */
  async function done(made: Awaited<ReturnType<typeof createdMeetup>>): Promise<void> {
    await made.attendance.flush();
    await made.access.flush();
    await made.service.flush();
  }
  const calls = (made: Awaited<ReturnType<typeof createdMeetup>>): string[] =>
    made.gateway.calls.filter((call) => /^(admit|dismiss)Member /.test(call));

  it('lets a member of another region into the forum of a meetup they sign up for', async () => {
    const made = await createdMeetup();
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Interested);
    await done(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(calls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(await made.grants.list()).toEqual([
      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: made.clock.now },
    ]);
  });

  it('takes the access back when they leave, also by Done, which means leave there', async () => {
    const made = await createdMeetup();
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await done(made);
    await made.attendance.leave(made.party.id, alice);
    await made.attendance.done(made.party.id, bob);
    await done(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
    expect(calls(made).slice(2).sort()).toEqual([
      `dismissMember ${WEST_FORUM} ${ALICE}`,
      `dismissMember ${WEST_FORUM} ${BOB}`,
    ]);
    expect(await made.grants.list()).toEqual([]);
  });

  it('takes it back when the meetup ends, and lets in who makes one where they cannot see', async () => {
    const made = await createdMeetup({ creatorId: CAROL });
    // Whoever made it is signed up; a forum they cannot see is opened to them afterwards.
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await done(made);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
    await made.service.end(made.party.id);
    await done(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);

    const other = await createdMeetup({}, {}, { gateway: made.gateway });
    other.gateway.shutOut(WEST_FORUM, REPORTER);
    const second = await other.service.createMeetup({
      name: 'Second',
      creatorId: REPORTER,
      regionChannelId: '100000000000000001',
    });
    expect(second.kind).toBe('created');
    await done(other);
    expect(other.gateway.canSee(WEST_FORUM, REPORTER)).toBe(true);
  });
});

describe('AccessService: a train', () => {
  type Train = Awaited<ReturnType<typeof createdTrain>>;
  async function done(made: Train): Promise<void> {
    await made.trains.flush();
    await made.attendance.flush();
    await made.access.flush();
    await made.service.flush();
  }
  const calls = (made: Train): string[] =>
    made.gateway.calls.filter((call) => /^(admit|dismiss)Member /.test(call));

  it('lets a member of another region into the forum of a train they sign up for', async () => {
    const made = await createdTrain({ route: [4, 8] });
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await done(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(calls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(await made.grants.list()).toEqual([
      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: made.clock.now },
    ]);
  });

  it('keeps them in while the train moves, also to a gym of another region and past its route', async () => {
    const made = await createdTrain({ route: [4, 8] });
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await done(made);
    // Gym 8 lies in East: the post of the train stays in the forum of West.
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'finish', false);
    await done(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(calls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(made.gateway.admitted.get(EAST_FORUM) ?? new Set()).toEqual(new Set());
  });

  it('takes the access back when they leave, also as the conductor and by Done, and when the train ends', async () => {
    const made = await createdTrain({ route: [4] });
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB, CAROL);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await made.attendance.signUp(made.party.id, { id: CAROL }, PartyStatus.Interested);
    await made.trains.setConductor(made.party.id, alice);
    await done(made);
    await made.attendance.leave(made.party.id, alice);
    await made.attendance.done(made.party.id, bob);
    await done(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
    expect(made.gateway.canSee(WEST_FORUM, CAROL)).toBe(true);
    await made.service.end(made.party.id);
    await done(made);
    expect(made.gateway.canSee(WEST_FORUM, CAROL)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
  });
});

describe('AccessService: a member whose roles changed (plan 8M-20, W2)', () => {
  it('lets them into the forums of their parties by a fresh look at them, not the cache', async () => {
    const made = await reportedRaid(yveltal);
    // West's forum opens to the role West alone, which Alice holds as the cache last saw her.
    made.gateway.forumOverwrites.set(WEST_FORUM, [
      viewOverwrite(FAKE_GUILD_ID, false),
      viewOverwrite(REGION_ROLE.west, true),
    ]);
    let roles: string[] = [REGION_ROLE.west];
    made.gateway.rolesOf = () => roles;
    made.gateway.memberFetched(ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(false);
    // West is taken away; the cache still holds her with it.
    roles = [];
    made.access.memberChanged(FAKE_GUILD_ID, ALICE);
    await settled(made);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    // Somebody of no party, or of another server, is left alone.
    made.access.memberChanged(FAKE_GUILD_ID, BOB);
    made.access.memberChanged('499999999999999999', ALICE);
    await settled(made);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
  });
});
