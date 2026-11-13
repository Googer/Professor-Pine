import { asTestServerGyms } from '../../test/support/providers.js';
import { describe, expect, it, vi } from 'vitest';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  REMOTE_CHANNEL,
  TEST_GUILD_ROW,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { ALICE, asRaid, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import {
  gatewayWithMirrorChannels,
  reportedRaid,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import type { RaidParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import { buttonsOf, header, textDisplays, textOf } from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const yveltal = { boss: { key: 'yveltal' } } as const;

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** The café (gym 8), which lies in East. */
function cafe(): Gym {
  const gym = gymsFixture().get(8);
  if (!gym) throw new Error('no gym 8');
  return gym;
}

function east(made: Made): Region {
  const region = made.regions.byId(2);
  if (!region) throw new Error('no region East');
  return region;
}

async function settled(made: Made): Promise<void> {
  await made.attendance.flush();
  await made.service.flush();
  await made.access.flush();
}

/** Moves the raid to the café and gives the party it became. */
async function moved(made: Made, by?: Member): Promise<RaidParty> {
  const outcome = await made.service.relocate(made.party.id, cafe(), east(made), by);
  if (outcome.kind !== 'moved') throw new Error(`not moved: ${outcome.kind}`);
  await settled(made);
  return outcome.party;
}

const texts = (made: Made, channelId: string): string[] =>
  made.gateway.messagesIn(channelId).map((message) => message.message.content ?? '');

describe('PartyService.relocate into a forum where the bot may not make posts', () => {
  it('leaves the raid where it is and says what the bot lacks there', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.refusePosts.set(EAST_FORUM, ['Manage Posts']);
    const outcome = await made.service.relocate(made.party.id, cafe(), east(made));
    expect(outcome).toEqual({
      kind: 'no-post',
      refused: { forumId: EAST_FORUM, missing: ['Manage Posts'] },
    });
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
  });
});

describe('PartyService.relocate', () => {
  it('makes the raid a new party with a post in the other forum, as it was', async () => {
    const made = await reportedRaid({ ...yveltal, time: { end: at('2026-10-13T14:40') } });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 2 });
    await settled(made);
    const before = made.current();

    const party = await moved(made);

    expect(party.id).not.toBe(before.id);
    expect(made.store.active().map((active) => active.id)).toEqual([party.id]);
    const stored = made.store.get(party.id);
    expect(stored).toMatchObject({
      regionId: 2,
      gymId: 8,
      forumChannelId: EAST_FORUM,
      createdById: REPORTER,
      createdAt: before.createdAt,
      hatchTime: before.hatchTime,
      endTime: before.endTime,
      attendees: before.attendees,
    });
    expect(asRaid(stored).raid).toEqual(before.raid);
    const post = made.gateway.posts.get(party.forumPostId ?? '');
    expect(post).toMatchObject({ forumId: EAST_FORUM, archived: false });
    expect(post?.title).toBe('Yveltal · Café Élan Fresco');
    const tags = made.tags[EAST_FORUM];
    expect([...(post?.tagIds ?? [])].sort()).toEqual([tags.Hatched, tags.T5].sort());
    expect(textOf(post?.message)).toContain('Alice');
    expect(buttonsOf(post?.message).length).toBeGreaterThan(0);
  });

  it('closes the old post with where the raid went, and archives it', async () => {
    const made = await reportedRaid(yveltal);
    const party = await moved(made);

    expect(made.storage.rows.get(made.party.id)).toMatchObject({
      status: 'ended',
      forumPostId: made.postId,
    });
    const old = made.gateway.posts.get(made.postId);
    expect(old).toMatchObject({ forumId: WEST_FORUM, archived: true, locked: true, reopened: 0 });
    expect(buttonsOf(old?.message)).toEqual([]);
    const words = `This raid has moved to **Café Élan Fresco** in <#${EAST_CHANNEL}>: <#${party.forumPostId ?? ''}>`;
    // The reporter is signed up (interested) and allows pings.
    expect(made.said().at(-1)).toBe(`${words}\n<@${REPORTER}>`);
    // In the place of the times.
    expect(header(old?.message)[1]).toBe(words);
    const tags = made.tags[WEST_FORUM];
    expect([...(old?.tagIds ?? [])].sort()).toEqual([tags.Ended, tags.T5].sort());
    const calls = made.gateway.calls.filter((call) => call.endsWith(` ${made.postId}`));
    expect(calls.at(-1)).toBe(`archivePost ${made.postId}`);
    // The hourly look finds nothing left to do for it.
    expect(await made.service.sweepPosts()).toBe(0);
  });

  it('moves the link line to the channel of the other region', async () => {
    const made = await reportedRaid(yveltal);
    expect(texts(made, WEST_CHANNEL)).toHaveLength(1);
    const party = await moved(made);
    expect(texts(made, WEST_CHANNEL)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([`New raid: <#${party.forumPostId ?? ''}>`]);
    expect(made.store.get(party.id)?.regionLinkMessageId).toBe(
      made.gateway.messagesIn(EAST_CHANNEL)[0]?.id,
    );
  });

  it('takes the copies with it: the old ones go, the new one names the new region', async () => {
    const made = await reportedRaid(
      yveltal,
      { sharedDelayMs: 0 },
      {
        gateway: gatewayWithMirrorChannels(),
      },
    );
    await made.service.showStatus(made.party.id);
    await settled(made);
    const [copy] = made.gateway.messagesIn(REMOTE_CHANNEL);
    expect(textDisplays(copy?.message)[0]).toContain(`<#${WEST_CHANNEL}>`);

    const party = await moved(made);

    const copies = made.gateway.messagesIn(REMOTE_CHANNEL);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).not.toBe(copy?.id);
    expect(textDisplays(copies[0]?.message)[0]).toContain(`<#${EAST_CHANNEL}>`);
    expect(textDisplays(copies[0]?.message)[0]).toContain(`<#${party.forumPostId ?? ''}>`);
    // The copy `/status` put into the old post is gone as well; only the last words are left.
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(1);
    expect(made.store.get(party.id)?.mirrorMessages.map((mirror) => mirror.kind)).toEqual([
      'remote',
    ]);
  });

  it('takes the question and the warning away with the old post; who was asked is here again', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await settled(made);
    expect(made.current().prompts.completion).toHaveLength(1);
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.CompletePending);
    const question = made.current().prompts.completion[0]?.id;
    expect(made.gateway.messagesIn(made.postId).map((message) => message.id)).toContain(question);

    const party = await moved(made);

    expect(made.gateway.messagesIn(made.postId).map((message) => message.id)).not.toContain(
      question,
    );
    expect(made.said().at(-1)).toMatch(/^This raid has moved/);
    const now = made.store.get(party.id);
    expect(now?.prompts).toEqual({ completion: [], warning: null });
    expect(now?.attendees[BOB]?.status).toBe(PartyStatus.Present);
    expect(now?.attendees[ALICE]?.status).toBe(PartyStatus.Complete);
  });

  it('pings in the old post those who are signed up and allow it, not who moved it or is done', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    made.userSettings.set(BOB, { mentions: false });
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Present);
    await made.attendance.done(id, carol);
    await settled(made);

    await moved(made, alice);

    const last = made.gateway.messagesIn(made.postId).at(-1);
    expect(last?.message.mention).toEqual({ users: [REPORTER] });
    expect(last?.message.content).toMatch(new RegExp(`\\n<@${REPORTER}>$`));
    // The sentence in the post's own message has no mentions.
    const old = made.gateway.posts.get(made.postId);
    expect(header(old?.message)[1]).toMatch(/<#\d+>$/);
  });

  it('reads the settings of everybody it may ping in one read', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Present);
    await settled(made);
    const before = { ...made.users.reads };
    const asked = made.users.asked.length;

    await moved(made, alice);

    expect(made.users.reads).toEqual({ get: before.get, getMany: before.getMany + 1 });
    expect([...(made.users.asked[asked] ?? [])].sort()).toEqual([BOB, CAROL, REPORTER].sort());
    const last = made.gateway.messagesIn(made.postId).at(-1);
    expect([...(last?.message.mention?.users ?? [])].sort()).toEqual([BOB, CAROL, REPORTER].sort());
  });

  it('lets the caller answer before the old post is closed, and does not wait for long', async () => {
    const made = await reportedRaid(yveltal);
    const seen: string[] = [];
    const outcome = await made.service.relocate(
      made.party.id,
      cafe(),
      east(made),
      undefined,
      (party) => {
        const old = made.gateway.posts.get(made.postId);
        seen.push(`${party.gymId ?? 0} ${String(old?.archived)} ${made.said().length}`);
        return Promise.reject(new Error('the answer failed'));
      },
    );
    expect(outcome.kind).toBe('moved');
    // The raid was in its new place; the old post had the word that it moved and was still open.
    expect(seen).toEqual(['8 false 1']);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
    expect(
      made.entries.some((entry) => entry.msg === 'could not answer before closing a party'),
    ).toBe(true);

    // An answer that never comes does not keep the old post open.
    const again = await reportedRaid(yveltal, {
      setTimer: (run) => {
        setImmediate(run);
        return () => undefined;
      },
    });
    const hanging = await again.service.relocate(
      again.party.id,
      cafe(),
      east(again),
      undefined,
      () => new Promise(() => undefined),
    );
    expect(hanging.kind).toBe('moved');
    expect(again.gateway.posts.get(again.postId)?.archived).toBe(true);
  });

  it('tells the notifier of the move also when the old post cannot be shown one last time', async () => {
    const gyms = gymsFixture();
    const state = { away: false };
    const made = await reportedRaid(yveltal, {
      gyms: asTestServerGyms({
        // The gym of the old party cannot be read once the raid has moved.
        get: (id) => {
          if (state.away && id === made.party.gymId) throw new Error('the gyms are away');
          return gyms.get(id);
        },
        regionsOf: (id) => gyms.regionsOf(id),
      }),
    });
    const told: string[] = [];
    made.notify.raidMoved = (from, to) => {
      told.push(`${from.id} to gym ${String(to.gymId)}`);
    };
    const moving = made.service.relocate(made.party.id, cafe(), east(made), undefined, () => {
      state.away = true;
      return Promise.resolve();
    });
    await expect(moving).rejects.toThrow('the gyms are away');
    // The raid is in its new place all the same, and who wants it there hears of it.
    expect(told).toEqual([`${made.party.id} to gym 8`]);
    expect(made.store.active().map((party) => party.gymId)).toEqual([8]);
    state.away = false;
    await settled(made);
  });

  it('notes the name of the member who moved it, when they are signed up', async () => {
    const made = await reportedRaid(yveltal);
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
    const party = await moved(made, { id: ALICE, name: 'Alice', team: 'valor' });
    expect(made.store.get(party.id)?.attendees[ALICE]).toMatchObject({
      name: 'Alice',
      team: 'valor',
    });
  });

  it('brings both summaries up to date', async () => {
    const made = await reportedRaid(yveltal);
    await made.service.checkSummaries();
    await settled(made);
    const summary = (regionId: number): string =>
      textOf(made.gateway.posts.get(made.regions.byId(regionId)?.summaryMessageId ?? '')?.message);
    expect(summary(1)).toContain(made.postId);
    const party = await moved(made);
    expect(summary(1)).not.toContain(made.postId);
    expect(summary(2)).toContain(party.forumPostId ?? 'none');
  });

  it('lets those into the other forum who cannot see it, and takes back what the old one called for', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.shutOut(EAST_FORUM, BOB, CAROL);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, carol, PartyStatus.Present);
    await made.attendance.done(made.party.id, carol);
    await settled(made);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);

    await moved(made);

    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.gateway.canSee(EAST_FORUM, BOB)).toBe(true);
    // Carol is done with the raid and still part of it: she sees it until it ends.
    expect(made.gateway.canSee(EAST_FORUM, CAROL)).toBe(true);
    expect((await made.grants.list()).map((grant) => grant.memberId).sort()).toEqual(
      [BOB, CAROL].sort(),
    );
  });
});

describe('PartyService.relocate: when it cannot be done', () => {
  it('leaves the raid where it is when the gym has a raid already', async () => {
    const made = await reportedRaid(yveltal);
    const other = await made.service.reportRaid({
      gym: cafe(),
      guildRow: TEST_GUILD_ROW,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T3', shadow: false },
      boss: null,
      regionChannelId: EAST_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    await settled(made);
    const calls = made.gateway.calls.length;
    const writes = made.storage.writes.length;

    const outcome = await made.service.relocate(made.party.id, cafe(), east(made));

    expect(outcome).toMatchObject({ kind: 'taken', other: { id: other.party.id } });
    expect(made.gateway.calls).toHaveLength(calls);
    expect(made.storage.writes).toHaveLength(writes);
    expect(made.current().gymId).toBe(1);
  });

  it('answers gone for a raid that is not active, and no-forum for a region without one', async () => {
    const made = await reportedRaid(yveltal);
    const noForum = { ...east(made), forumChannelId: null };
    expect(await made.service.relocate(made.party.id, cafe(), noForum)).toEqual({
      kind: 'no-forum',
    });
    await made.service.end(made.party.id);
    expect(await made.service.relocate(made.party.id, cafe(), east(made))).toEqual({
      kind: 'gone',
    });
    expect(made.store.active()).toEqual([]);
  });

  it('leaves the raid as it was when the forum is gone, and the gym free', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.gone.add(EAST_FORUM);
    expect(await made.service.relocate(made.party.id, cafe(), east(made))).toEqual({
      kind: 'no-forum',
    });
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: false });
    expect(texts(made, WEST_CHANNEL)).toHaveLength(1);
    expect(made.store.raidAt(1, 8, made.clock.now)).toBeUndefined();
  });

  it('leaves the raid as it was when the post cannot be made', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    await expect(made.service.relocate(made.party.id, cafe(), east(made))).rejects.toThrow(
      'Discord is away',
    );
    made.gateway.failing.delete('createPost');
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(made.said()).toEqual([]);
    // And it can be moved after all.
    await moved(made);
    expect(made.gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });

  it('takes the new party back when the old one cannot be ended, and says that the raid stays', async () => {
    const made = await reportedRaid(yveltal);
    const save = made.storage.save.bind(made.storage);
    vi.spyOn(made.storage, 'save').mockImplementation((party) =>
      party.id === made.party.id && party.status === 'ended'
        ? Promise.reject(new Error('the database is away'))
        : save(party),
    );
    await expect(made.service.relocate(made.party.id, cafe(), east(made))).rejects.toThrow(
      'the database is away',
    );
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    // The post that was a moment old is deleted, not left archived in the other forum.
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: false });
    expect(made.said().map((text) => text.split('\n')[0]?.replace(/<#\d+>$/, '<#post>'))).toEqual([
      `This raid has moved to **Café Élan Fresco** in <#${EAST_CHANNEL}>: <#post>`,
      'The move did not work: this raid stays here.',
    ]);
  });

  it('reports the failure itself when nothing can be stored any more', async () => {
    const made = await reportedRaid(yveltal);
    const save = made.storage.save.bind(made.storage);
    let posted = false;
    // The database goes away once the new party has its post.
    const saving = vi.spyOn(made.storage, 'save').mockImplementation((party) => {
      if (posted) return Promise.reject(new Error('the database is away'));
      if (party.forumChannelId === EAST_FORUM && party.regionLinkMessageId !== null) posted = true;
      return save(party);
    });
    await expect(made.service.relocate(made.party.id, cafe(), east(made))).rejects.toThrow(
      'the database is away',
    );
    // Nothing of the new party is left on Discord, although it could not be ended in the table.
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([]);
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.store.active()).toHaveLength(2);
    // Once the database is back, the render that was asked for ends it: it has no post, and
    // must not hold its gym.
    saving.mockImplementation(save);
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.store.raidAt(1, 8, made.clock.now)).toBeUndefined();
  });
});

describe('PartyService.relocate: what happens meanwhile', () => {
  /** Holds the creation of the new post until `release` is called. */
  function holdPost(made: Made): { release: () => void; reached: Promise<void> } {
    let release: () => void = () => undefined;
    let arrive: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const original = made.gateway.createPost.bind(made.gateway);
    vi.spyOn(made.gateway, 'createPost').mockImplementation(async (forumId, post) => {
      arrive();
      await held;
      return original(forumId, post);
    });
    return { release, reached };
  }

  it('keeps what members did in the old post while the new one was being made', async () => {
    const made = await reportedRaid(yveltal);
    const { release, reached } = holdPost(made);
    const moving = made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 3 });
    await made.raids.setEndTime(made.party.id, bob, at('2026-10-13T14:30'));
    release();
    const outcome = await moving;
    if (outcome.kind !== 'moved') throw new Error(outcome.kind);
    await settled(made);
    const party = made.store.get(outcome.party.id);
    expect(party?.attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming, number: 3 });
    expect(party?.endTime).toBe(at('2026-10-13T14:30'));
    expect(outcome.party.attendees[ALICE]).toBeDefined();
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(textOf(post?.message)).toContain('Alice');
  });

  it('moves a raid once: a second move at the same time finds it gone', async () => {
    const made = await reportedRaid(yveltal);
    const gym9 = gymsFixture().get(9);
    if (!gym9) throw new Error('no gym 9');
    const [first, second] = await Promise.all([
      made.service.relocate(made.party.id, cafe(), east(made)),
      made.service.relocate(made.party.id, gym9, east(made)),
    ]);
    await settled(made);
    expect(first.kind).toBe('moved');
    expect(second).toEqual({ kind: 'gone' });
    expect(made.store.active()).toHaveLength(1);
    expect(made.gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });

  it('takes the new party back when the old one was closed meanwhile: it does not come back elsewhere', async () => {
    const made = await reportedRaid(yveltal);
    const { release, reached } = holdPost(made);
    const moving = made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    await made.service.end(made.party.id, undefined, { lastWords: 'Closed.' });
    release();
    const outcome = await moving;
    await settled(made);
    expect(outcome).toEqual({ kind: 'gone' });
    expect(made.store.active()).toEqual([]);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([]);
    // The old post was closed by whoever ended it, once, and nothing was said into it after.
    expect(made.said()).toEqual(['Closed.']);
    expect(made.gateway.posts.get(made.postId)?.reopened).toBe(0);
    expect(made.store.raidAt(1, 8, made.clock.now)).toBeUndefined();
  });

  it('says that the raid moved while those who are in the old forum only for it can still see it', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    const send = made.gateway.sendMessage.bind(made.gateway);
    const seen: boolean[] = [];
    vi.spyOn(made.gateway, 'sendMessage').mockImplementation((channelId, message) => {
      if (channelId === made.postId && message.mention?.users?.includes(ALICE)) {
        seen.push(made.gateway.canSee(WEST_FORUM, ALICE));
      }
      return send(channelId, message);
    });
    await moved(made);
    // Alice was pinged once, and could see the post she was pinged in.
    expect(seen).toEqual([true]);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
  });

  it('closes the old post with the word in it also when the word could not be said first', async () => {
    const made = await reportedRaid(yveltal);
    const send = made.gateway.sendMessage.bind(made.gateway);
    let failed = false;
    vi.spyOn(made.gateway, 'sendMessage').mockImplementation((channelId, message) => {
      if (channelId === made.postId && !failed) {
        failed = true;
        return Promise.reject(new Error('Discord is away'));
      }
      return send(channelId, message);
    });
    const party = await moved(made);
    expect(made.store.get(party.id)).toBeDefined();
    // Said by the close instead, once, without pings.
    expect(made.said()).toHaveLength(1);
    expect(made.gateway.messagesIn(made.postId)[0]?.message.mention).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('makes a report of the new gym wait for the move and then join the raid', async () => {
    const made = await reportedRaid(yveltal);
    const { release, reached } = holdPost(made);
    const moving = made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    const reporting = made.service.reportRaid({
      gym: cafe(),
      guildRow: TEST_GUILD_ROW,
      reporterId: CAROL,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T5', shadow: false },
      boss: null,
      regionChannelId: EAST_CHANNEL,
    });
    release();
    const [outcome, report] = await Promise.all([moving, reporting]);
    await settled(made);
    if (outcome.kind !== 'moved') throw new Error(outcome.kind);
    expect(report).toMatchObject({ kind: 'exists', joined: true, party: { id: outcome.party.id } });
    expect(made.store.get(outcome.party.id)?.attendees[CAROL]).toBeDefined();
    expect(made.gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });

  it('makes a report of the new gym during a move that then fails a raid of its own, with a post that stays', async () => {
    const made = await reportedRaid(yveltal);
    const { release, reached } = holdPost(made);
    const moving = made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    const reporting = made.service.reportRaid({
      gym: cafe(),
      guildRow: TEST_GUILD_ROW,
      reporterId: CAROL,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T3', shadow: false },
      boss: null,
      regionChannelId: EAST_CHANNEL,
    });
    // The old raid is closed while its new post is being made: the move fails.
    await made.service.end(made.party.id, undefined, { lastWords: 'Closed.' });
    release();
    const [outcome, report] = await Promise.all([moving, reporting]);
    await settled(made);
    expect(outcome).toEqual({ kind: 'gone' });
    if (report.kind !== 'created') throw new Error(`not created: ${report.kind}`);
    // The report made the raid it reported, with a post that is there.
    expect(report.party).toMatchObject({ gymId: 8, raid: { tier: { level: 'T3' } } });
    expect(made.store.get(report.party.id)?.attendees[CAROL]).toBeDefined();
    expect(made.gateway.postsIn(EAST_FORUM).map((post) => post.id)).toEqual([
      report.party.forumPostId,
    ]);
  });
});

describe('PartyService.relocate: the clock and a restart', () => {
  it('gives a raid that was about to be archived a new warning in its new post', async () => {
    const made = await reportedRaid({ ...yveltal, time: { end: at('2026-10-13T14:10') } });
    const tick = async (time: number): Promise<void> => {
      made.clock.now = time;
      await made.scheduler.tick();
      await made.scheduler.whenIdle();
      await settled(made);
    };
    await tick(at('2026-10-13T14:10') + 6 * MINUTE);
    expect(made.current().deletionTime).not.toBeNull();
    expect(made.said().some((text) => /I will archive this post/.test(text))).toBe(true);

    const party = await moved(made);
    expect(made.store.get(party.id)?.deletionTime).toBeNull();
    // The old post keeps only its last words.
    expect(made.said()).toHaveLength(1);

    await tick(made.clock.now + MINUTE);
    const stored = made.store.get(party.id);
    expect(stored?.deletionTime).not.toBeNull();
    expect(
      texts(made, party.forumPostId ?? '').some((text) => /I will archive this post/.test(text)),
    ).toBe(true);
  });

  it('after a stop between storing the new party and making its post, the raid is where it was', async () => {
    const made = await reportedRaid(yveltal);
    // The process stops while the post is being made: it never comes back.
    const reached = new Promise<void>((arrive) => {
      vi.spyOn(made.gateway, 'createPost').mockImplementation(() => {
        arrive();
        return new Promise(() => undefined);
      });
    });
    void made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    expect([...made.storage.rows.values()].filter((row) => row.status === 'active')).toHaveLength(
      2,
    );

    const again = await restarted(made);
    expect(await again.service.endPartiesWithoutPost()).toBe(1);
    expect(again.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(again.store.get(made.party.id)?.gymId).toBe(1);
  });
});
