import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../test/support/migrated-db.js';
import { ALICE, asRaid, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
import {
  EAST_FORUM,
  REMOTE_CHANNEL,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import {
  gatewayWithMirrorChannels,
  partyServiceWith,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { AccessGrantRepository } from '../db/repositories/access-grant-repository.js';
import { HistoryRepository } from '../db/repositories/history-repository.js';
import { PartyRepository } from '../db/repositories/party-repository.js';
import { HISTORY_MUST_NOT_FAIL } from '../../test/support/history.js';
import type { DB } from '../db/types.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob 🎉' };
const HATCH = at('2026-10-13T14:30');
/** The raid is given a length of 50 minutes on the way. */
const END = at('2026-10-13T15:20');

/**
 * A raid from the report to the archived post with the real `Party` table under the store, and
 * a restart in the middle: everything the services decide must survive the state document.
 */
describe('a raid from report to archive, in MySQL, over a restart', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    await sql`insert into Guild (id, snowflake) values (1, '412345678901234567')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
    await sql`insert into Region (id, guildId, channelId) values (2, 1, 1234567890123456789)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Library'), (2, 'Fountain'), (8, 'Cafe')`.execute(
      db,
    );
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Party').execute();
    await db.deleteFrom('PartyAccessGrant').execute();
  });

  it('hatches, asks, catches up after the restart, warns and archives', async () => {
    const repository = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
    const first = await partyServiceWith(
      [],
      {},
      {
        database: repository,
        historyStorage: new HistoryRepository(db),
        gateway: gatewayWithMirrorChannels(),
      },
    );
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym');
    const outcome = await first.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: REPORTER,
      reporter: { name: 'Rhea', team: 'valor' },
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      time: { hatch: HATCH },
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const id = outcome.party.id;
    const postId = outcome.party.forumPostId ?? '';
    await first.attendance.signUp(id, alice, PartyStatus.Present);
    await first.attendance.signUp(id, bob, PartyStatus.Present, { number: 2 });

    first.clock.now = HATCH;
    await first.scheduler.tick();
    await first.raids.setMoveset(id, alice, { fastMove: 'SNARL_FAST' });
    expect(await first.raids.setGym(id, alice, 2)).toMatchObject({ kind: 'ok', changed: true });
    expect(await first.raids.setDuration(id, alice, 50)).toMatchObject({ kind: 'ok' });
    const meet = HATCH + 40 * MINUTE;
    await first.attendance.setMeetingTime(id, bob, meet);
    first.clock.now = HATCH + 10 * MINUTE;
    expect(await first.attendance.done(id, alice)).toMatchObject({ kind: 'ok', asked: [BOB] });
    await first.attendance.flush();
    await first.service.flush();
    const question = first.store.get(id)?.prompts.completion[0];
    expect(question?.members).toEqual([BOB]);
    // The raid has a copy in the remote channel, and `/status` puts one into the post.
    expect(await first.service.showStatus(id)).toBe(true);
    const copies = first.store.get(id)?.mirrorMessages ?? [];
    expect(copies.map((copy) => [copy.kind, copy.channelId])).toEqual([
      ['remote', REMOTE_CHANNEL],
      ['status', postId],
    ]);
    expect(first.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);

    // The bot stops and starts again after the raid has ended.
    const second = await restarted(first);
    const loaded = second.store.get(id);
    expect(loaded).toEqual(first.store.get(id));
    expect(asRaid(loaded).raid).toMatchObject({
      boss: { key: 'yveltal' },
      fastMove: 'SNARL_FAST',
      hatchedDuration: 50,
      stageSeen: 'hatched',
    });
    expect(loaded).toMatchObject({
      gymId: 2,
      endTime: END,
      groups: [{ id: 'A', startTime: meet }],
    });
    expect(attendeeOf(loaded ?? outcome.party, BOB)).toMatchObject({
      status: PartyStatus.CompletePending,
      askedBy: ALICE,
      name: 'Bob 🎉',
      number: 2,
    });

    second.clock.now = END + 6 * MINUTE;
    await second.scheduler.start();
    await second.attendance.flush();
    await second.service.flush();
    const caughtUp = second.store.get(id);
    expect(asRaid(caughtUp).raid.stageSeen).toBe('ended');
    expect(attendeeOf(caughtUp ?? outcome.party, BOB)?.status).toBe(PartyStatus.Complete);
    expect(caughtUp?.prompts.completion).toEqual([]);
    expect(caughtUp?.prompts.warning).not.toBeNull();
    expect(caughtUp?.deletionTime).toBe(END + 16 * MINUTE);
    expect(second.gateway.deleted.map((gone) => gone.messageId)).toContain(question?.id);
    // A raid that is over has no copy in the remote channel; the one in its post stays for now.
    expect(second.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(caughtUp?.mirrorMessages.map((copy) => copy.kind)).toEqual(['status']);

    second.clock.now = END + 16 * MINUTE;
    await second.scheduler.tick();
    await second.scheduler.stop();
    expect(second.store.get(id)).toBeUndefined();
    expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
    // Nothing with buttons is left in the post: the copy went before the archiving.
    const deleted = second.gateway.deleted.map((gone) => gone.messageId);
    for (const copy of copies) expect(deleted).toContain(copy.messageId);
    expect(second.gateway.posts.get(postId)?.reopened).toBe(0);
    // Recorded in the history; its row (with its members' ids) deleted, its post kept.
    expect(await repository.findById(id)).toBeUndefined();
    expect(
      await db
        .selectFrom('PartyHistory')
        .select(['partyId', 'ending'])
        .where('partyId', '=', id)
        .execute(),
    ).toEqual([{ partyId: id, ending: 'completed' }]);
    expect(await repository.endedPosts([postId])).toEqual([postId]);

    // Nothing is left for a third start to do.
    const third = await restarted(second);
    expect(third.store.active()).toEqual([]);
  });

  it('lets a member of another region in, moves the raid to another region, and tidies up after a restart', async () => {
    const repository = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
    const grants = new AccessGrantRepository(db);
    const first = await partyServiceWith(
      [],
      {},
      { database: repository, historyStorage: new HistoryRepository(db), grants },
    );
    first.gateway.shutOut(WEST_FORUM, ALICE);
    first.gateway.shutOut(EAST_FORUM, ALICE, BOB);
    const gym = gymsFixture().get(1);
    const cafe = gymsFixture().get(8);
    if (!gym || !cafe) throw new Error('no gym');
    const outcome = await first.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      time: { hatch: HATCH },
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const oldId = outcome.party.id;
    const oldPost = outcome.party.forumPostId ?? '';
    await first.attendance.signUp(oldId, alice, PartyStatus.Coming);
    await first.attendance.signUp(oldId, bob, PartyStatus.Coming, { number: 2 });
    await first.attendance.flush();
    await first.access.flush();
    expect(await grants.list()).toEqual([
      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: first.clock.now },
    ]);

    // The raid was reported at the wrong gym: it is at the café, in East.
    const moved = await first.raids.setGym(oldId, bob, 8);
    if (moved.kind !== 'ok') throw new Error(moved.kind);
    await first.attendance.flush();
    await first.service.flush();
    await first.access.flush();
    const id = moved.party.id;
    const postId = moved.party.forumPostId ?? '';
    expect(id).not.toBe(oldId);
    expect(await repository.findById(oldId)).toMatchObject({
      ok: true,
      party: { status: 'ended', forumPostId: oldPost, gymId: 1, regionId: 1 },
    });
    expect(first.gateway.posts.get(oldPost)).toMatchObject({ archived: true, locked: true });
    // Both cannot see East by themselves; nothing calls for Alice to see West any more.
    expect((await grants.list()).map((grant) => [grant.forumChannelId, grant.memberId])).toEqual([
      [EAST_FORUM, ALICE],
      [EAST_FORUM, BOB],
    ]);
    expect(first.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);

    const second = await restarted(first);
    const loaded = second.store.get(id);
    expect(loaded).toEqual(first.store.get(id));
    expect(loaded).toMatchObject({
      gymId: 8,
      regionId: 2,
      forumChannelId: EAST_FORUM,
      forumPostId: postId,
      hatchTime: HATCH,
      createdAt: outcome.party.createdAt,
    });
    expect(Object.keys(loaded?.attendees ?? {})).toEqual([REPORTER, ALICE, BOB]);
    expect(attendeeOf(loaded ?? moved.party, BOB)).toMatchObject({ number: 2, name: 'Bob 🎉' });
    expect(second.access.size).toBe(2);

    // Bob leaves after the restart; the raid runs out and the rest is taken back with it.
    await second.attendance.leave(id, bob);
    await second.attendance.flush();
    await second.access.flush();
    expect((await grants.list()).map((grant) => grant.memberId)).toEqual([ALICE]);
    second.clock.now = HATCH + 45 * MINUTE + 6 * MINUTE;
    await second.scheduler.start();
    second.clock.now += 11 * MINUTE;
    await second.scheduler.tick();
    await second.scheduler.stop();
    await second.access.flush();
    expect(second.store.active()).toEqual([]);
    expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
    expect(await grants.list()).toEqual([]);
    expect(second.gateway.canSee(EAST_FORUM, ALICE)).toBe(false);
  });

  it('keeps a meetup from /meetup to the archived post, over a restart', async () => {
    const repository = new PartyRepository(db, HISTORY_MUST_NOT_FAIL);
    const first = await partyServiceWith(
      [],
      {},
      { database: repository, historyStorage: new HistoryRepository(db) },
    );
    const outcome = await first.service.createMeetup({
      name: 'Community Day picnic 🧺',
      creatorId: REPORTER,
      creator: { name: 'Rhea', team: 'valor' },
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const id = outcome.party.id;
    const postId = outcome.party.forumPostId ?? '';
    const start = at('2026-10-13T16:00');
    const end = at('2026-10-13T18:00');
    await first.attendance.signUp(id, alice, PartyStatus.Coming, { number: 2 });
    await first.attendance.signUp(id, bob, PartyStatus.Present);
    expect(
      await first.timed.setStartTime(id, { id: REPORTER, name: 'Rhea' }, false, start),
    ).toMatchObject({ kind: 'ok' });
    expect(
      await first.timed.setEndTime(id, { id: REPORTER, name: 'Rhea' }, false, end),
    ).toMatchObject({ kind: 'ok' });
    // Done means leave in a meetup.
    expect(await first.attendance.done(id, bob)).toMatchObject({ kind: 'ok', left: true });
    await first.timed.flush();
    await first.attendance.flush();
    await first.service.flush();

    // What is in the table is what the services hold, and a meetup in every column.
    const stored = await repository.findById(id);
    expect(stored).toEqual({ ok: true, party: first.store.get(id) });
    const row = await db
      .selectFrom('Party')
      .select(['type', 'gymId', 'hatchTime', 'endTime', 'lastPossibleTime', 'forumChannelId'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      type: 'meetup',
      gymId: null,
      hatchTime: null,
      endTime: String(end),
      lastPossibleTime: String(end),
      forumChannelId: WEST_FORUM,
    });

    const second = await restarted(first);
    const loaded = second.store.get(id);
    expect(loaded).toEqual(first.store.get(id));
    expect(loaded).toMatchObject({
      type: 'meetup',
      forumPostId: postId,
      timed: { name: 'Community Day picnic 🧺', startTime: start },
      meetup: { description: null },
    });
    expect(Object.keys(loaded?.attendees ?? {})).toEqual([REPORTER, ALICE]);
    expect(attendeeOf(loaded ?? outcome.party, ALICE)).toMatchObject({ number: 2, name: 'Alice' });

    // The clock catches up after the restart: ended, warned an hour ahead, archived.
    second.clock.now = end + 6 * MINUTE;
    await second.scheduler.start();
    expect(second.store.get(id)?.deletionTime).toBe(end + 66 * MINUTE);
    expect(second.store.get(id)?.prompts.warning).not.toBeNull();
    second.clock.now = end + 66 * MINUTE;
    await second.scheduler.tick();
    await second.scheduler.stop();
    expect(second.store.active()).toEqual([]);
    expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
    expect(await repository.findById(id)).toBeUndefined();
    expect(
      await db
        .selectFrom('PartyHistory')
        .select(['partyId', 'kind'])
        .where('partyId', '=', id)
        .execute(),
    ).toEqual([{ partyId: id, kind: 'meetup' }]);
  });
});
