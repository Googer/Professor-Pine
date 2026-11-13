import { asTestServerGyms } from '../../test/support/providers.js';
import path from 'node:path';
import { endParty } from '../domain/party/party.js';
import { OverwriteType, PermissionFlagsBits, RateLimitError } from 'discord.js';
import { loadSettings } from '../config/settings.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { EGG_FOLDER, EggPictures } from './egg-pictures.js';
import { describe, expect, it, vi } from 'vitest';
import {
  FakePartyGateway,
  missingPermissions,
  networkAway,
} from '../../test/support/fake-gateway.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  TEST_GUILD_ROW,
  testGym,
  testGyms,
  testRegions,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { gymsFixture } from '../../test/support/providers.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import { FORUM_TAGS } from '../render/party-post.js';
import { renderRaidPost } from '../render/raid-post.js';
import {
  ALICE,
  asRaid,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_ZONE,
  REPORTER,
  testRaid,
} from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { watchBackground } from '../../test/support/timers.js';
import {
  attendanceLimits,
  createGroup,
  leaveParty,
  setAttendance,
} from '../domain/party/attendance.js';
import { setBoss } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import { HIDDEN_FORUM_REFUSED, type RaidReport } from './party-service.js';
import { Rehearsal } from './rehearsal.js';
import {
  header,
  textDisplays,
  textOf,
  thumbnailOf,
  thumbnailsOf,
  v2,
} from '../../test/support/messages.js';

const [library, fountain, , , , , lighthouse, , , trailhead] = testGyms();
const T5 = { level: 'T5', shadow: false } as const;
/** A tier whose egg has no picture. */
const SUPER_MEGA = { level: 'SuperMega', shadow: false } as const;
const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });

/** Changes the text of region 1 summary without any call to Discord: a raid that has no post yet. */
/** A meetup made through the service, starting at `startTime`: its post. */
async function addMeetup(
  made: Awaited<ReturnType<typeof partyServiceWith>>,
  startTime: number,
): Promise<{ postId: string }> {
  const outcome = await made.service.createMeetup({
    name: 'Community Day picnic',
    creatorId: REPORTER,
    regionChannelId: WEST_CHANNEL,
    startTime,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  await made.service.flush();
  return { postId: outcome.party.forumPostId ?? '' };
}

async function addQuietRaid(
  made: Awaited<ReturnType<typeof partyServiceWith>>,
  overrides: Parameters<typeof testRaid>[0] = {},
): Promise<void> {
  await made.store.addRaidUnlessTaken(testRaid(overrides), made.clock.now);
}

function report(extra: Partial<RaidReport> = {}): RaidReport {
  if (!library) throw new Error('no gym');
  return {
    gym: library,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: T5,
    boss: null,
    guildRow: TEST_GUILD_ROW,
    ...extra,
  };
}

describe('PartyService.reportRaid', () => {
  it('notes the name and team of a reporter who is signed up, for a new raid and an existing one', async () => {
    const { service, store } = await partyServiceWith();
    const first = await service.reportRaid(report({ reporter: { name: 'Rhea', team: 'valor' } }));
    if (first.kind !== 'created') throw new Error(first.kind);
    expect(store.get(first.party.id)?.attendees[REPORTER]).toMatchObject({
      name: 'Rhea',
      team: 'valor',
    });
    const second = await service.reportRaid(
      report({ reporterId: ALICE, reporter: { name: 'Alice' }, autoStatus: PartyStatus.Coming }),
    );
    expect(second).toMatchObject({ kind: 'exists', joined: true });
    expect(store.get(first.party.id)?.attendees[ALICE]).toMatchObject({ name: 'Alice' });
    // A second report by somebody who is signed up changes nothing of theirs.
    await service.reportRaid(report({ reporter: { name: 'Other', team: 'mystic' } }));
    expect(store.get(first.party.id)?.attendees[REPORTER]).toMatchObject({
      name: 'Rhea',
      team: 'valor',
    });
  });

  // Plan 8E (Matt, 2026-10-26): one raid per gym, of any kind. A report of the other kind joins
  // the raid there and changes nothing of it, as a report of another tier does.
  it('joins the raid of the other kind at the gym, and leaves its tier, boss and times alone', async () => {
    const ELITE = { level: 'Elite', shadow: false } as const;
    for (const [standing, reported] of [
      [T5, ELITE],
      [ELITE, T5],
    ] as const) {
      const { service, store } = await partyServiceWith();
      const first = await service.reportRaid(report({ tier: standing }));
      if (first.kind !== 'created') throw new Error(first.kind);
      const before = asRaid(store.get(first.party.id));
      const joined = await service.reportRaid(
        report({
          reporterId: ALICE,
          autoStatus: PartyStatus.Coming,
          tier: reported,
          boss: { key: 'yveltal' },
          time: { end: at('2026-10-13T14:20') },
        }),
      );
      expect(joined).toMatchObject({ kind: 'exists', joined: true, party: { id: first.party.id } });
      expect(store.active()).toHaveLength(1);
      const after = asRaid(store.get(first.party.id));
      expect(after.raid.tier).toEqual(standing);
      expect(after.raid.boss).toBeNull();
      expect([after.hatchTime, after.endTime]).toEqual([before.hatchTime, before.endTime]);
      expect(after.attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming });
    }
  });

  // Review E7 of plan 8E (the coordinator's ruling): a raid stands at a gym for its server.
  it('makes a raid at a gym where only a raid of another server stands', async () => {
    const elsewhere = testRaid({ id: '00000000-0000-4000-8000-000000000903', guildId: 2 });
    const { service, store } = await partyServiceWith([elsewhere]);
    expect(library?.id).toBe(elsewhere.gymId);
    const outcome = await service.reportRaid(report());
    expect(outcome).toMatchObject({ kind: 'created', party: { guildId: 1, gymId: library?.id } });
    expect(store.active()).toHaveLength(2);
    expect(store.get(elsewhere.id)).toBe(elsewhere);
  });

  it('asks whether the reporter may join a raid in another forum, and refuses one moved meanwhile', async () => {
    const { service, store } = await partyServiceWith();
    const first = await service.reportRaid(report());
    if (first.kind !== 'created') throw new Error(first.kind);
    const id = first.party.id;
    // In the region's own forum, which the caller checked already: nothing is asked.
    const asked: string[] = [];
    const joined = await service.reportRaid(
      report({ reporterId: ALICE, mayJoin: (forum) => Promise.resolve(asked.push(forum) > 0) }),
    );
    expect(joined).toMatchObject({ kind: 'exists', joined: true });
    expect(asked).toEqual([]);
    // In another forum: asked; and moved to a third while it was asked, refused.
    await store.update(id, (party) => ({ party: { ...party, forumChannelId: EAST_FORUM } }));
    const moved = await service.reportRaid(
      report({
        reporterId: BOB,
        mayJoin: async (forum) => {
          asked.push(forum);
          await store.update(id, (party) => ({
            party: { ...party, forumChannelId: '100000000000000999' },
          }));
          return true;
        },
      }),
    );
    expect(asked).toEqual([EAST_FORUM]);
    expect(moved).toEqual({ kind: 'barred' });
    expect(store.get(id)?.attendees[BOB]).toBeUndefined();
  });

  it('makes no raid of a report that may only join one, and joins one that is there', async () => {
    const { service, store, gateway } = await partyServiceWith();
    expect(await service.reportRaid(report({ joinOnly: true }))).toEqual({ kind: 'none-there' });
    expect(store.active()).toEqual([]);
    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
    const first = await service.reportRaid(report());
    if (first.kind !== 'created') throw new Error(first.kind);
    const joined = await service.reportRaid(report({ reporterId: ALICE, joinOnly: true }));
    expect(joined).toMatchObject({ kind: 'exists', joined: true });
    expect(store.active()).toHaveLength(1);
  });

  it('keeps the name of a reporter who is not signed up, and the post names them by it', async () => {
    const { service, store, gateway } = await partyServiceWith();
    const outcome = await service.reportRaid(
      report({ autoStatus: PartyStatus.NotInterested, reporter: { name: 'Rhea' } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const stored = store.get(outcome.party.id);
    expect(stored?.attendees).toEqual({});
    expect(stored?.makerName).toBe('Rhea');
    const post = gateway.posts.get(outcome.party.forumPostId ?? '');
    expect(textDisplays(post?.message).at(-1)).toBe('-# Reported by **Rhea**');
  });

  it('stores the raid, creates its post with tags, links it in the region channel and lists it', async () => {
    const { service, store, gateway, tags, regions } = await partyServiceWith();
    regions.rows[0]!.summaryMessageId = (await gateway.createPost(WEST_FORUM, {
      title: 'Active raids',
      message: { content: 'x' },
      tagIds: [],
    }))!;
    const outcome = await service.reportRaid(report({ time: { hatch: at('2026-10-13T14:30') } }));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const { party } = outcome;

    const [, post] = gateway.postsIn(WEST_FORUM);
    expect(post).toMatchObject({
      id: party.forumPostId,
      title: 'T5 egg · The Stacks',
      tagIds: [tags[WEST_FORUM].Egg, tags[WEST_FORUM].T5],
    });
    expect(header(post?.message)[0]).toBe('### Level 5 raid (egg)');
    expect(party).toMatchObject({
      forumChannelId: WEST_FORUM,
      regionId: 1,
      gymId: 1,
      hatchTime: at('2026-10-13T14:30'),
      endTime: at('2026-10-13T15:15'),
    });
    const [link] = gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(`New raid: <#${party.forumPostId}>`);
    expect(party.regionLinkMessageId).toBe(link?.id);
    expect(store.get(party.id)).toBe(party);

    await service.flush();
    expect(textOf(gateway.posts.get(regions.rows[0]!.summaryMessageId)?.message)).toContain(
      `<#${party.forumPostId}> · hatches`,
    );
  });

  it('takes an end time for a raid seen hatched, and the reporter as its first attendee', async () => {
    const { service } = await partyServiceWith();
    const outcome = await service.reportRaid(
      report({
        boss: { key: 'yveltal' },
        time: { end: at('2026-10-13T14:40') },
        autoStatus: PartyStatus.Coming,
      }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    expect(outcome.party).toMatchObject({
      hatchTime: at('2026-10-13T13:55'),
      endTime: at('2026-10-13T14:40'),
      raid: { boss: { key: 'yveltal' }, reportedHatched: true },
      attendees: { [REPORTER]: { status: PartyStatus.Coming } },
    });
  });

  it('puts a raid in the forum of the region its gym lies in', async () => {
    const { service, gateway } = await partyServiceWith();
    const outcome = await service.reportRaid(report({ gym: lighthouse! }));
    expect(outcome).toMatchObject({
      kind: 'created',
      party: { regionId: 2, forumChannelId: EAST_FORUM },
    });
    expect(gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });

  it('signs the reporter up for the raid the gym already has, without a second post', async () => {
    const { service, gateway, store } = await partyServiceWith();
    const first = await service.reportRaid(report());
    const again = await service.reportRaid(
      report({ reporterId: ALICE, autoStatus: PartyStatus.Coming }),
    );
    if (first.kind !== 'created' || again.kind !== 'exists') throw new Error('unexpected');
    expect(again.joined).toBe(true);
    expect(again.party.id).toBe(first.party.id);
    expect(store.get(first.party.id)?.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Coming,
    });
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    // Somebody who is signed up already stays exactly as they are.
    const third = await service.reportRaid(
      report({ reporterId: ALICE, autoStatus: PartyStatus.Interested }),
    );
    expect(third).toMatchObject({ kind: 'exists', joined: false });
    expect(store.get(first.party.id)?.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Coming,
    });
  });

  it('makes one raid of two reports of a gym at the same moment', async () => {
    const { service, gateway } = await partyServiceWith();
    const outcomes = await Promise.all([
      service.reportRaid(report()),
      service.reportRaid(report({ reporterId: ALICE })),
    ]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['created', 'exists']);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });

  it('says so when the gym lies in no region, or its region has no forum', async () => {
    const { service, regions, storage } = await partyServiceWith();
    await expect(service.reportRaid(report({ gym: trailhead! }))).resolves.toEqual({
      kind: 'no-region',
    });
    regions.rows[0]!.forumChannelId = null;
    await expect(service.reportRaid(report({ gym: fountain! }))).resolves.toMatchObject({
      kind: 'no-forum',
      region: { id: 1 },
    });
    expect(storage.writes).toEqual([]);
  });

  it('ends the raid again when its post cannot be created, so that the gym is free', async () => {
    const { service, store, gateway, entries } = await partyServiceWith();
    gateway.failing.set('createPost', new Error('Missing Permissions'));
    await expect(service.reportRaid(report())).rejects.toThrow('Missing Permissions');
    expect(store.active()).toEqual([]);
    gateway.failing.clear();
    await expect(service.reportRaid(report())).resolves.toMatchObject({ kind: 'created' });
    expect(entries.filter((entry) => Number(entry.level) >= 50)).toEqual([]);
  });

  it('treats a forum that was deleted by hand as no forum', async () => {
    const { service, store, gateway } = await partyServiceWith();
    gateway.gone.add(WEST_FORUM);
    await expect(service.reportRaid(report())).resolves.toMatchObject({ kind: 'no-forum' });
    expect(store.active()).toEqual([]);
  });

  it('keeps the raid when only the link line fails', async () => {
    const { service, gateway, entries } = await partyServiceWith();
    gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    const outcome = await service.reportRaid(report());
    expect(outcome).toMatchObject({ kind: 'created', party: { regionLinkMessageId: null } });
    expect(entries.some((entry) => entry.msg === 'could not post the link to a new raid')).toBe(
      true,
    );
  });
});

describe('PartyService: keeping posts up to date', () => {
  async function withRaid() {
    const made = await partyServiceWith();
    const outcome = await made.service.reportRaid(
      report({ time: { hatch: at('2026-10-13T14:30') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    // The report asks for a render of the new post: it sends nothing, the post is as created.
    await made.service.flush();
    const postId = outcome.party.forumPostId ?? '';
    return { ...made, party: outcome.party, postId };
  }

  it('shows the first change after a quiet time at once, and gathers the ones after it', async () => {
    const background = watchBackground(Date.now());
    const { service, store, gateway, party, postId } = await withRaid();
    expect(gateway.posts.get(postId)?.edits).toBe(0);
    vi.setSystemTime(Date.now() + 2 * 3_600_000);
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
    service.changed(party.id);
    await background.settle();
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    await store.update(party.id, (p) => setAttendance(p, BOB, PartyStatus.Coming, {}, limits));
    service.changed(party.id);
    await background.settle();
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    // The gathered change shows once the delay (an hour, the test service's) is over.
    vi.advanceTimersByTime(3_600_000 - 1);
    await background.settle();
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    vi.advanceTimersByTime(1);
    await background.settle();
    expect(gateway.posts.get(postId)?.edits).toBe(2);
  });

  it('makes one edit of many changes', async () => {
    const { service, store, gateway, party, postId } = await withRaid();
    for (const member of [ALICE, '200000000000000003', '200000000000000004']) {
      await store.update(party.id, (p) => setAttendance(p, member, PartyStatus.Coming, {}, limits));
      service.changed(party.id);
    }
    expect(gateway.posts.get(postId)?.edits).toBe(0);
    await service.flush();
    const post = gateway.posts.get(postId);
    expect(post?.edits).toBe(1);
    expect(textOf(post?.message)).toContain('🏃 Coming (3): ');
    // Title and tags did not change, so neither was touched.
    expect(post).toMatchObject({ renames: 0, retags: 0 });
  });

  it('renames the post and changes its tags when the raid hatches and gets its boss', async () => {
    const { service, store, gateway, party, postId, tags, clock } = await withRaid();
    clock.now = at('2026-10-13T14:31');
    await store.update(party.id, (p) =>
      setBoss(
        asRaid(p),
        { tier: T5, boss: { key: 'yveltal' } },
        service.rulesIn(PARTY_ZONE),
        clock.now,
      ),
    );
    service.changed(party.id);
    await service.flush();
    expect(gateway.posts.get(postId)).toMatchObject({
      title: 'Yveltal · The Stacks',
      tagIds: [tags[WEST_FORUM].Hatched, tags[WEST_FORUM].T5],
      renames: 1,
      retags: 1,
    });
  });

  it('renames a post at most twice in ten minutes; the latest title is applied later', async () => {
    const { service, store, gateway, party, postId, clock } = await withRaid();
    const name = async (key: string) => {
      await store.update(party.id, (p) =>
        setBoss(asRaid(p), { tier: T5, boss: { key } }, service.rulesIn(PARTY_ZONE), clock.now),
      );
      service.changed(party.id);
      await service.flush();
    };
    await name('yveltal');
    await name('xerneas');
    await name('mewtwo');
    expect(gateway.posts.get(postId)).toMatchObject({ title: 'Xerneas · The Stacks', renames: 2 });
    clock.now += 10 * MINUTE;
    service.changed(party.id);
    await service.flush();
    expect(gateway.posts.get(postId)).toMatchObject({ title: 'Mewtwo · The Stacks', renames: 3 });
  });

  it('ends a party whose post somebody deleted', async () => {
    const { service, store, gateway, party, postId, entries } = await withRaid();
    gateway.gone.add(postId);
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
    service.changed(party.id);
    await service.flush();
    expect(store.get(party.id)).toBeUndefined();
    expect(entries.some((entry) => entry.msg === 'a party post is gone; ending the party')).toBe(
      true,
    );
  });

  it('records a party whose post was deleted as closed by staff, who alone may (R-A1)', async () => {
    const made = await withRaid();
    made.gateway.gone.add(made.postId);
    await made.store.update(made.party.id, (p) =>
      setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
    );
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: made.party.id, ending: 'cancelled', closedBy: 'staff' }),
    ]);
  });

  it('ends a party at once when Discord says its post was deleted, as when a render finds it gone', async () => {
    const made = await withRaid();
    const { party, postId, gateway, store } = made;
    const link = party.regionLinkMessageId;
    expect(link).not.toBeNull();
    gateway.gone.add(postId);
    await made.service.postDeleted(postId);
    expect(store.get(party.id)).toBeUndefined();
    expect(made.history.records).toEqual([
      expect.objectContaining({ partyId: party.id, ending: 'cancelled', closedBy: 'staff' }),
    ]);
    // Its link line in the region's channel goes with it, and nothing is edited any more.
    expect(gateway.deleted.map((gone) => gone.messageId)).toContain(link);
    const calls = gateway.calls.length;
    await made.service.postDeleted(postId);
    // A thread that is no party's post (another forum's, a post that ended) changes nothing.
    await made.service.postDeleted('600000000000000999');
    made.service.changed(party.id);
    await made.service.flush();
    expect(gateway.calls).toHaveLength(calls);
  });

  it('ends a party whose post is gone once, when Discord says so while a render finds it gone', async () => {
    const made = await withRaid();
    const { party, postId, gateway, store, entries } = made;
    gateway.gone.add(postId);
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
    made.service.changed(party.id);
    await Promise.all([made.service.postDeleted(postId), made.service.flush()]);
    expect(store.get(party.id)).toBeUndefined();
    expect(
      entries.filter((entry) => entry.msg === 'a party post is gone; ending the party'),
    ).toHaveLength(1);
    expect(gateway.calls.filter((call) => call === `deletePost ${postId}`)).toHaveLength(1);
  });

  it('warns of an edit that failed for the network, and errors for any other failure (plan 8X-H)', async () => {
    const { service, store, gateway, party, entries } = await withRaid();
    const failed = () => entries.filter((entry) => entry.msg === 'could not update a party post');
    gateway.failing.set(
      'editPost',
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
      }),
    );
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
    service.changed(party.id);
    await service.flush();
    expect(failed().map((entry) => entry.level)).toEqual([40]);
    gateway.failing.set('editPost', new Error('500'));
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Present, {}, limits));
    service.changed(party.id);
    await service.flush();
    expect(failed().map((entry) => entry.level)).toEqual([40, 50]);
  });

  it('logs a failed edit and tries again with the next change', async () => {
    const { service, store, gateway, party, postId, entries } = await withRaid();
    gateway.failing.set('editPost', new Error('500'));
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
    service.changed(party.id);
    await service.flush();
    expect(entries.some((entry) => entry.msg === 'could not update a party post')).toBe(true);
    gateway.failing.clear();
    service.changed(party.id);
    await service.flush();
    expect(gateway.posts.get(postId)?.edits).toBe(1);
  });

  it('does nothing for a party that has ended or has no post', async () => {
    const { service, gateway } = await partyServiceWith([testRaid()]);
    service.changed(testRaid().id);
    service.changed('00000000-0000-4000-8000-000000000099');
    await service.flush();
    expect(gateway.calls).toEqual([]);
  });
});

describe('PartyService: the summary and tidying up', () => {
  it('creates the pinned summary post once and records it for its forum', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    const [summary] = gateway.postsIn(WEST_FORUM);
    expect(summary).toMatchObject({ title: 'Today and coming up', pinned: true, tagIds: [] });
    expect(textOf(summary?.message)).toBe(
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    );
    expect(regions.summaries).toEqual([
      { id: 1, forumChannelId: WEST_FORUM, messageId: summary?.id },
    ]);
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });

  it('makes the board open, with its slowmode, and pins it again whenever it is drawn (plan 8R-9F, R2, B4)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    expect(board).toMatchObject({ pinned: true, locked: false, slowmode: 45 });
    // A week without messages archived it (unpinned on opening).
    board.archived = true;
    board.pinned = false;
    // The stops were drawn in it (opening it): the summary's text is the same, yet it is pinned.
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ pinned: true, locked: false });
  });

  it('removes the reactions on the board post when it edits it, and leaves a party post’s (plan 8R-9G)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions, store } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = west.summaryMessageId ?? '';
    const outcome = await service.reportRaid(report({ time: { hatch: at('2026-10-13T14:30') } }));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await service.flush();
    const postId = outcome.party.forumPostId ?? '';
    gateway.react(board, 2);
    gateway.react(postId, 3);
    // A change of the raid edits its post; another raid edits the board.
    await store.update(outcome.party.id, (p) =>
      setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
    );
    service.changed(outcome.party.id);
    await addQuietRaid(made, { id: '00000000-0000-4000-8000-000000000002', gymId: 2 });
    service.summaryChanged(west.id);
    await service.flush();
    expect(gateway.posts.get(postId)?.edits).toBe(1);
    expect(textOf(gateway.posts.get(board)?.message)).toMatch(/2 raids/);
    expect(gateway.reactionsCleared).toEqual([board]);
    expect(gateway.reactions.get(postId)).toBe(3);
  });

  it('opens a board that plan 8R-9 locked once, and leaves a moderator’s later lock alone (R2)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    // As plan 8R-9 left it: locked, without slowmode.
    board.locked = true;
    board.slowmode = 0;
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    expect(textOf(board.message)).toMatch(/1 raid/);
    expect(board).toMatchObject({ locked: false, slowmode: 45 });
    // A moderator locks it now: drawn again, it stays locked.
    board.locked = true;
    await addQuietRaid(made, { id: '00000000-0000-4000-8000-000000000002', gymId: 2 });
    service.summaryChanged(west.id);
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(textOf(board.message)).toMatch(/2 raids/);
    expect(board.locked).toBe(true);
    expect(gateway.calls.filter((call) => call.startsWith('openBoard'))).toHaveLength(2);
  });

  it('opens a locked board whose forum gives posts a slowmode of its own: only 45 seconds is its mark (review F2)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    // Plan 8R-9 locked it, in a forum whose posts get a minute of slowmode by default.
    board.locked = true;
    board.slowmode = 60;
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: false, slowmode: 45 });
  });

  it('opens again a board a moderator locked and took the slowmode from, and leaves an open board’s own slowmode (review F2)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    // Locked and its slowmode cleared: Discord keeps no mark of Pine's opening, so it is opened.
    board.locked = true;
    board.slowmode = 0;
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: false, slowmode: 45 });
    // Open, with a slowmode a moderator chose: left as it is.
    board.slowmode = 300;
    const opened = gateway.calls.filter((call) => call.startsWith('openBoard')).length;
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: false, slowmode: 300 });
    expect(gateway.calls.filter((call) => call.startsWith('openBoard'))).toHaveLength(opened);
    // Open without any: given its slowmode.
    board.slowmode = 0;
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board.slowmode).toBe(45);
  });

  it('moves the old mark of six hours to 45 seconds: an open board stays open, a locked one locked (plan 8R-9H)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    const opened = gateway.calls.filter((call) => call.startsWith('openBoard')).length;
    // Opened by Pine before plan 8R-9H.
    board.slowmode = 21_600;
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: false, slowmode: 45 });
    // Opened by Pine before plan 8R-9H, then locked by a moderator: the lock stands.
    board.slowmode = 21_600;
    board.locked = true;
    board.archived = true;
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: true, slowmode: 45 });
    expect(gateway.calls.filter((call) => call.startsWith('openBoard'))).toHaveLength(opened);
    // Locked with the new mark: a moderator's lock, left as it is.
    const moved = gateway.calls.filter((call) => call.startsWith('setBoardSlowmode')).length;
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: true, slowmode: 45 });
    expect(gateway.calls.filter((call) => call.startsWith('openBoard'))).toHaveLength(opened);
    expect(gateway.calls.filter((call) => call.startsWith('setBoardSlowmode'))).toHaveLength(moved);
  });

  it.each([30, 60, 2 * 60 * 60])(
    'treats a slowmode of %i seconds as before: locked, opened with the mark; open, left (plan 8R-9H)',
    async (slowmode) => {
      const { service, gateway, regions } = await partyServiceWith();
      const west = regions.rows[0]!;
      await service.ensureSummary(west);
      const board = gateway.posts.get(west.summaryMessageId ?? '')!;
      board.locked = true;
      board.slowmode = slowmode;
      service.summaryChanged(west.id, true);
      await service.flush();
      expect(board).toMatchObject({ locked: false, slowmode: 45 });
      board.slowmode = slowmode;
      service.summaryChanged(west.id, true);
      await service.flush();
      expect(board).toMatchObject({ locked: false, slowmode });
      expect(gateway.calls.some((call) => call.startsWith('setBoardSlowmode'))).toBe(false);
    },
  );

  it('says once per region that it may not move the old mark, tries again at each draw, and gives the lock as it is (plan 8R-9H)', async () => {
    const { service, gateway, regions, entries } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    board.slowmode = 21_600;
    board.locked = true;
    gateway.failing.set('setBoardSlowmode', missingPermissions('PATCH'));
    const results = await service.setupForums(gateway.guildId);
    expect(results.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
      closed: 'locked',
    });
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: true, slowmode: 21_600 });
    expect(gateway.calls.filter((call) => call.startsWith('setBoardSlowmode'))).toHaveLength(2);
    const said = (): number =>
      entries.filter((entry) => entry.msg === 'could not move the board’s slowmode to its mark')
        .length;
    expect(said()).toBe(1);
    // Allowed again: moved; a later refusal is said anew.
    gateway.failing.clear();
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: true, slowmode: 45 });
    board.slowmode = 21_600;
    gateway.failing.set('setBoardSlowmode', missingPermissions('PATCH'));
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(said()).toBe(2);
  });

  it('keeps a locked board’s six hours where the forum denies Manage Posts, said once over two draws (plan 8R-9H)', async () => {
    const { service, gateway, regions, entries } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    board.slowmode = 21_600;
    board.locked = true;
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    const results = await service.setupForums(gateway.guildId);
    expect(results.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
      closed: 'locked',
    });
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(board).toMatchObject({ locked: true, slowmode: 21_600 });
    expect(gateway.calls.filter((call) => call.startsWith('setBoardSlowmode'))).toHaveLength(2);
    expect(
      entries.filter((entry) => entry.msg === 'could not move the board’s slowmode to its mark'),
    ).toHaveLength(1);
  });

  it('warns at each draw when moving the old mark fails for another reason, and says a later refusal (plan 8R-9H)', async () => {
    const { service, gateway, regions, entries } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    board.slowmode = 21_600;
    gateway.failing.set('setBoardSlowmode', new Error('Discord is away'));
    const said = (): number =>
      entries.filter((entry) => entry.msg === 'could not move the board’s slowmode to its mark')
        .length;
    service.summaryChanged(west.id, true);
    await service.flush();
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(said()).toBe(2);
    expect(board).toMatchObject({ locked: false, slowmode: 21_600 });
    // Such failures are no refusal: the first refusal after them is said.
    gateway.failing.set('setBoardSlowmode', missingPermissions('PATCH'));
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(said()).toBe(3);
  });

  it('says once that it may not open the board, and pins it all the same (B4)', async () => {
    const { service, gateway, regions, entries } = await partyServiceWith();
    const west = regions.rows[0]!;
    gateway.failing.set('openBoard', missingPermissions('PATCH'));
    await service.ensureSummary(west);
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({
      pinned: true,
      slowmode: 0,
    });
    expect(entries.filter((entry) => entry.msg === 'could not open the board post')).toHaveLength(
      1,
    );
  });

  it('says in the setup that the board could not be opened, and why (review P12)', async () => {
    const { service, gateway } = await partyServiceWith();
    gateway.failing.set('openBoard', missingPermissions('PATCH'));
    const results = await service.setupForums(gateway.guildId);
    expect(results.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
      summary: true,
      closed: 'refused',
    });
    gateway.failing.set('openBoard', new Error('Discord is away'));
    gateway.posts.clear();
    const again = await service.setupForums(gateway.guildId);
    expect(again.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
      closed: 'failed',
    });
  });

  it('opens a board plan 8R-9 locked in the setup, and says a moderator’s lock stands (R2, W3)', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    // Unpinned, and locked as plan 8R-9 left it.
    board.pinned = false;
    board.locked = true;
    board.slowmode = 0;
    const results = await service.setupForums(gateway.guildId);
    const mine = results.find((one) => one.region.channelId === WEST_CHANNEL);
    expect(mine).toMatchObject({ summary: false, cleaning: true });
    expect(mine?.closed).toBeUndefined();
    expect(mine?.unpinned).toBeUndefined();
    expect(board).toMatchObject({ pinned: true, locked: false, slowmode: 45 });
    // A moderator locked it since, and the bot may not delete members' messages there.
    board.locked = true;
    gateway.noManaging.add(WEST_FORUM);
    const again = await service.setupForums(gateway.guildId);
    expect(again.find((one) => one.region.channelId === WEST_CHANNEL)).toMatchObject({
      summary: false,
      closed: 'locked',
      cleaning: false,
    });
    expect(board.locked).toBe(true);
  });

  it('makes the board anew when it was deleted while its text stood (review P2)', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const old = west.summaryMessageId ?? '';
    // Deleted by hand; the stops were drawn (or tried to be) in it: the text is the same.
    gateway.gone.add(old);
    service.summaryChanged(west.id, true);
    await service.flush();
    expect(west.summaryMessageId).not.toBe(old);
    expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({
      pinned: true,
      locked: false,
      slowmode: 45,
    });
  });

  it('takes over a post titled "Going on now", as before plan 8R-9, and renames it (B12)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const old = west.summaryMessageId ?? '';
    gateway.posts.get(old)!.title = 'Going on now';
    west.summaryMessageId = null;
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(west.summaryMessageId).toBe(old);
    await addQuietRaid(made);
    await service.flush();
    expect(gateway.posts.get(old)).toMatchObject({ title: 'Today and coming up', locked: false });
  });

  it('lists what starts after midnight under Coming up, and the stops as below it (B8)', async () => {
    const made = await partyServiceWith();
    const { service, gateway } = made;
    const tomorrow = await addMeetup(made, at('2026-10-14T18:00'));
    const texts = textDisplays(service.summaryMessage(1, 'board'));
    expect(texts[0]).toBe('### Today and coming up\n1 coming up');
    expect(texts.at(-1)).toBe(
      `**Coming up**\n<#${tomorrow.postId}> · <t:${at('2026-10-14T18:00') / 1000}:f> · 1 trainer`,
    );
    service.setStopPosts({
      summaryOf: () => ({
        serverId: gateway.guildId,
        threadId: '1700000000000000009',
        messageId: '1700000000000000001',
        tasks: 2,
        hideouts: 0,
      }),
      boardChanged: () => undefined,
    });
    // In the board the stops are below; in `/status` in the region's channel they are not.
    expect(textDisplays(service.summaryMessage(1, 'board')).at(-1)).toMatch(
      /^\[Today’s Stops\]\(<[^>]+>\) \(below\): 2 tasks$/,
    );
    expect(textDisplays(service.summaryMessage(1)).at(-1)).toMatch(
      /^\[Today’s Stops\]\(<[^>]+>\): 2 tasks$/,
    );
  });

  it('draws every summary anew at local midnight, so tomorrow’s parties become today’s (B7)', async () => {
    const timers: { run: () => void; ms: number }[] = [];
    const made = await partyServiceWith([], {
      setTimer: (run, ms) => {
        timers.push({ run, ms });
        return () => undefined;
      },
    });
    const { service, regions, gateway, clock } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    await addMeetup(made, at('2026-10-14T18:00'));
    await service.flush();
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 coming up/);
    service.watchMidnight();
    // A second after midnight, as the other timers (review P10).
    const midnight = timers.find(
      (timer) => timer.ms === at('2026-10-14T00:00') - clock.now + 1_000,
    );
    expect(midnight).toBeDefined();
    clock.now = at('2026-10-14T00:00:01');
    midnight?.run();
    await service.flush();
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 meetup/);
    // And the next midnight is waited for.
    expect(timers.at(-1)?.ms).toBe(at('2026-10-15T00:00') - at('2026-10-14T00:00:01') + 1_000);
  });

  it('draws the summaries anew on a catch-up (B7)', async () => {
    const made = await partyServiceWith();
    const { service, regions, gateway } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    // An edit the network failed: the summary stands as it was.
    gateway.failing.set('editPost', networkAway());
    await addQuietRaid(made);
    await service.flush();
    gateway.failing.delete('editPost');
    const board = gateway.posts.get(west.summaryMessageId ?? '')!;
    expect(textOf(board.message)).not.toMatch(/1 raid/);
    service.redrawPosts();
    await service.flush();
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 raid/);
  });

  it('makes a new summary post when the old one was deleted', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    gateway.gone.add(west.summaryMessageId ?? '');
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  // Review S7: an archived board whose record is lost is found among the newest archived posts.
  it('takes over its own archived summary post when the record of it is lost', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = west.summaryMessageId ?? '';
    const post = gateway.posts.get(board);
    if (post) post.archived = true;
    west.summaryMessageId = null;
    const reads = () => gateway.calls.filter((call) => call.startsWith('archivedPosts ')).length;
    const before = reads();
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(west.summaryMessageId).toBe(board);
    // The forum's archived posts are read once.
    expect(reads() - before).toBe(1);
  });

  it('takes over its own pinned summary post when the recorded one is gone', async () => {
    // Seen at staging: the record pointed at a post that was gone (the forum was put back by SQL)
    // while the forum still had the bot's pinned "Active raids" post; a second one was made and
    // Discord refused its pin (30047, one pinned post per forum).
    const made = await partyServiceWith();
    const { service, gateway, regions, entries } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const pinned = west.summaryMessageId;
    west.summaryMessageId = '1500000000000000099';
    await addQuietRaid(made);
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(west.summaryMessageId).toBe(pinned);
    expect(regions.summaries.at(-1)).toEqual({
      id: 1,
      forumChannelId: WEST_FORUM,
      messageId: pinned,
    });
    expect(entries.filter((entry) => entry.msg === 'could not pin the summary post')).toEqual([]);
    // The post taken over shows the region's list as it is now.
    await service.flush();
    expect(textOf(gateway.posts.get(pinned ?? '')?.message)).toMatch(
      /^### Today and coming up\n1 raid/,
    );
  });

  it('takes over a summary post made as "Active raids" and renames it "Today and coming up" (plan 8X-G)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const old = west.summaryMessageId ?? '';
    // A post made before the update, its record lost.
    gateway.posts.get(old)!.title = 'Active raids';
    west.summaryMessageId = null;
    await addQuietRaid(made);
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(west.summaryMessageId).toBe(old);
    await service.flush();
    expect(gateway.posts.get(old)).toMatchObject({ title: 'Today and coming up', renames: 1 });
    expect(textOf(gateway.posts.get(old)?.message)).toMatch(/^### Today and coming up\n1 raid/);
    // Its record kept, a later render renames nothing more.
    service.summaryChanged(west.id);
    await service.flush();
    expect(gateway.posts.get(old)?.renames).toBe(1);
  });

  it('renames a recorded summary post still called "Active raids" with its next edit', async () => {
    const timers: { run: () => void; ms: number }[] = [];
    const made = await partyServiceWith([], {
      setTimer: (run, ms) => {
        timers.push({ run, ms });
        return () => undefined;
      },
    });
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const post = gateway.posts.get(west.summaryMessageId ?? '')!;
    post.title = 'Active raids';
    // Discord's limit of renames says to wait: it is tried again then.
    gateway.renameLater.set(west.summaryMessageId ?? '', 60_000);
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    expect(post.title).toBe('Active raids');
    const edits = post.edits;
    // While the rename waits, requests with the same text edit nothing (review r1, R1-6).
    service.summaryChanged(west.id);
    service.summaryChanged(west.id);
    await service.flush();
    expect(post.edits).toBe(edits);
    gateway.renameLater.delete(west.summaryMessageId ?? '');
    // The timer of the wait Discord named renames it, with nothing else changed (review r0 C3),
    // and edits nothing (R1-6).
    const due = timers.find((timer) => timer.ms >= 60_000 && timer.ms < 3_600_000);
    expect(due).toBeDefined();
    due?.run();
    await service.flush();
    expect(post.title).toBe('Today and coming up');
    expect(post.edits).toBe(edits);
  });

  it('takes a summary whose rename fails for good as done, and warns once (review r0 C1)', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions, entries } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const post = gateway.posts.get(west.summaryMessageId ?? '')!;
    post.title = 'Active raids';
    gateway.failing.set('renamePost', missingPermissions('renamePost'));
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    const edits = post.edits;
    // The same text again: no edit, no second warning.
    service.summaryChanged(west.id);
    await service.flush();
    expect(post.edits).toBe(edits);
    expect(entries.filter((entry) => entry.msg === 'could not rename a summary post')).toHaveLength(
      1,
    );
    // Allowed again: a later change of the text tries the rename once more (review r1, R1-5).
    gateway.failing.delete('renamePost');
    await made.store.update(made.store.active()[0]?.id ?? '', (party) => ({
      party: { ...party, endTime: (party.endTime ?? 0) + 60_000 },
    }));
    service.summaryChanged(west.id);
    await service.flush();
    expect(post.title).toBe('Today and coming up');
  });

  it('tries a rename that failed otherwise again after the rename window (review r1, R1-5)', async () => {
    const timers: { run: () => void; ms: number }[] = [];
    const made = await partyServiceWith([], {
      setTimer: (run, ms) => {
        timers.push({ run, ms });
        return () => undefined;
      },
    });
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const post = gateway.posts.get(west.summaryMessageId ?? '')!;
    post.title = 'Active raids';
    gateway.failing.set('renamePost', new Error('Discord is away'));
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    expect(post.title).toBe('Active raids');
    gateway.failing.delete('renamePost');
    const due = timers.find((timer) => timer.ms === 10 * 60_000);
    expect(due).toBeDefined();
    due?.run();
    await service.flush();
    expect(post.title).toBe('Today and coming up');
  });

  it('links the region’s post of the stops today, with its counts (plan 8X-G)', async () => {
    const { service, gateway } = await partyServiceWith();
    expect(textDisplays(service.summaryMessage(1))).toHaveLength(1);
    // The post is in the region's board, the summary's own post (plan 8R-9, B1).
    const board = '1700000000000000009';
    service.setStopPosts({
      summaryOf: (channelId) =>
        channelId === WEST_CHANNEL
          ? {
              serverId: gateway.guildId,
              threadId: board,
              messageId: '1700000000000000001',
              tasks: 3,
              hideouts: 1,
            }
          : undefined,
      boardChanged: () => undefined,
    });
    expect(textDisplays(service.summaryMessage(1)).at(-1)).toBe(
      `[Today’s Stops](<https://discord.com/channels/${gateway.guildId}/${board}/` +
        '1700000000000000001>): 3 tasks · 1 hideout',
    );
    expect(textDisplays(service.summaryMessage(2))).toHaveLength(1);
    // The day's research waiting under an event's window is counted apart (plan 8R-6).
    const at = Date.UTC(2026, 10, 21, 22);
    service.setStopPosts({
      summaryOf: () => ({
        serverId: gateway.guildId,
        threadId: board,
        messageId: '1700000000000000001',
        tasks: 0,
        hideouts: 0,
        waiting: { tasks: 4, at },
      }),
      boardChanged: () => undefined,
    });
    expect(textDisplays(service.summaryMessage(1)).at(-1)).toBe(
      `[Today’s Stops](<https://discord.com/channels/${gateway.guildId}/${board}/` +
        `1700000000000000001>): 4 tasks back at <t:${String(at / 1_000)}:t>`,
    );
  });

  it('has the region’s stops drawn in its board once the summary is made or taken over (plan 8R-9, B2)', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const asked: string[] = [];
    service.setStopPosts({
      summaryOf: () => undefined,
      boardChanged: (channelId) => asked.push(channelId),
    });
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    expect(asked).toEqual([WEST_CHANNEL]);
    // Its record lost: the post is taken over, and the stops drawn in it again.
    gateway.posts.get(west.summaryMessageId ?? '')!.pinned = false;
    west.summaryMessageId = null;
    await service.ensureSummary(west);
    expect(asked).toEqual([WEST_CHANNEL, WEST_CHANNEL]);
  });

  it('takes over an unpinned summary post left over and pins it', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const older = west.summaryMessageId ?? '';
    gateway.posts.get(older)!.pinned = false;
    west.summaryMessageId = null;
    // Nothing pinned: the leftover is taken over, and pinned with its next edit.
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(west.summaryMessageId).toBe(older);
    await service.flush();
    expect(gateway.posts.get(older)?.pinned).toBe(true);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });

  it('prefers the pinned summary post to an older unpinned one', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const older = west.summaryMessageId ?? '';
    gateway.posts.get(older)!.pinned = false;
    gateway.gone.add(older);
    await service.ensureSummary(west);
    const pinned = west.summaryMessageId ?? '';
    gateway.gone.delete(older);
    west.summaryMessageId = null;
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(west.summaryMessageId).toBe(pinned);
  });

  it('takes over no post of a member and none by another title', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const first = west.summaryMessageId ?? '';
    const post = gateway.posts.get(first);
    if (post) post.title = 'Raid rules';
    west.summaryMessageId = null;
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    const second = west.summaryMessageId ?? '';
    expect(second).not.toBe(first);

    // A member's pinned "Active raids" (openPosts leaves it out) and the bot's post by another
    // title: neither is taken over, and a third post is made.
    gateway.posts.get(second)!.title = 'Raid rules';
    if (post) {
      post.title = 'Active raids';
      gateway.foreign.add(first);
    }
    west.summaryMessageId = null;
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    expect([first, second]).not.toContain(west.summaryMessageId);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(3);
  });

  it('makes no post when the region changed its forum while a summary was being taken over', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    west.summaryMessageId = null;
    regions.setSummaryMessage = () => Promise.resolve(false);
    const before = gateway.calls.length;
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(gateway.calls.slice(before).filter((call) => call.startsWith('createPost'))).toEqual([]);
  });

  it('makes a new summary post when the look for one to take over fails, with a warning', async () => {
    const { service, gateway, regions, entries } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    gateway.gone.add(west.summaryMessageId ?? '');
    gateway.failing.set('openPosts', new Error('Service Unavailable'));
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    expect(
      entries.filter((entry) => entry.msg === 'could not look for a summary post to take over'),
    ).toHaveLength(1);
  });

  it('refuses a region without a forum', async () => {
    const { service, regions } = await partyServiceWith();
    await expect(service.ensureSummary(regions.rows[2]!)).rejects.toThrow('has no forum');
  });

  it('ends active parties that have no post, as a stop half-way through a report leaves them', async () => {
    const orphan = testRaid();
    const posted = {
      ...testRaid({ id: '00000000-0000-4000-8000-000000000002', gymId: 2 }),
      forumPostId: '300000000000000001',
    };
    const { service, store, entries } = await partyServiceWith([orphan, posted]);
    await expect(service.endPartiesWithoutPost()).resolves.toBe(1);
    expect(store.active().map((party) => party.id)).toEqual([posted.id]);
    expect(entries.some((entry) => entry.msg === 'ended parties that had no post')).toBe(true);
    await expect(service.endPartiesWithoutPost()).resolves.toBe(0);
  });
});

/** Runs `after` once the real `createPost` of a gateway has answered, before its caller goes on. */
function afterCreatePost(
  gateway: FakePartyGateway,
  after: (postId: string | undefined) => Promise<void>,
): void {
  const original = gateway.createPost.bind(gateway);
  gateway.createPost = async (forumId, post) => {
    const postId = await original(forumId, post);
    await after(postId);
    return postId;
  };
}

async function withRaidFor() {
  const made = await partyServiceWith();
  const outcome = await made.service.reportRaid(
    report({ time: { hatch: at('2026-10-13T14:30') } }),
  );
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  await made.service.flush();
  return { ...made, party: outcome.party, postId: outcome.party.forumPostId ?? '' };
}

describe('PartyService.reportRaid: a report never leaves a raid without a post', () => {
  it('stores nothing when the post cannot be rendered', async () => {
    const bosses = raidBossesFixture();
    const { service, store, storage } = await partyServiceWith([], {
      raidBosses: {
        bosses: () => {
          throw new Error('renderer broke');
        },
        bossesOf: (tier) => bosses.bossesOf(tier),
        autoset: (tier) => bosses.autoset(tier),
      },
    });
    await expect(service.reportRaid(report())).rejects.toThrow('renderer broke');
    expect(storage.writes).toEqual([]);
    expect(store.active()).toEqual([]);
  });

  it('deletes the post and ends the raid when the post id cannot be recorded', async () => {
    const { service, store, storage, gateway } = await partyServiceWith();
    vi.spyOn(storage, 'save').mockRejectedValueOnce(new Error('db down'));
    await expect(service.reportRaid(report())).rejects.toThrow('db down');
    expect(gateway.deletedPosts).toHaveLength(1);
    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
    expect(store.active()).toEqual([]);
    await expect(service.reportRaid(report())).resolves.toMatchObject({ kind: 'created' });
  });

  it('deletes the post and throws when the raid ended while its post was being made', async () => {
    const { service, store, gateway } = await partyServiceWith();
    afterCreatePost(gateway, async () => {
      for (const party of store.active()) {
        await store.update(party.id, (p) => ({ party: endParty(p) }));
      }
    });
    await expect(service.reportRaid(report())).rejects.toThrow(
      'The raid ended while its post was being created',
    );
    expect(gateway.deletedPosts).toHaveLength(1);
    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
  });

  it('sends no link and tells nobody when the raid ended right after its post was recorded', async () => {
    const made = await partyServiceWith();
    const { service, store, gateway, notify } = made;
    const told = vi.spyOn(notify, 'raidReported');
    const update = store.update.bind(store);
    let ended = false;
    // The post is recorded, and before anything else happens the raid ends (a removal of its
    // region, `/delete`): the store holds no such party when the link line is next.
    store.update = async (id, change) => {
      const result = await update(id, change);
      if (!ended && result?.party?.forumPostId) {
        ended = true;
        await update(id, (party) => ({ party: endParty(party) }));
      }
      return result;
    };
    const outcome = await service.reportRaid(report());
    expect(outcome.kind).toBe('created');
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(told).not.toHaveBeenCalled();
  });

  it('takes the link back and tells nobody when the raid ended while the link was being sent', async () => {
    const made = await partyServiceWith();
    const { service, store, gateway, notify } = made;
    const told = vi.spyOn(notify, 'raidReported');
    const send = gateway.sendMessage.bind(gateway);
    gateway.sendMessage = async (channelId, message) => {
      const id = await send(channelId, message);
      if (channelId === WEST_CHANNEL) {
        for (const party of store.active()) {
          await store.update(party.id, (p) => ({ party: endParty(p) }));
        }
      }
      return id;
    };
    const outcome = await service.reportRaid(report());
    expect(outcome.kind).toBe('created');
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(told).not.toHaveBeenCalled();
  });

  it('gives a second report made during the creation the link of the post', async () => {
    const { service } = await partyServiceWith();
    const [first, second] = await Promise.all([
      service.reportRaid(report()),
      service.reportRaid(report({ reporterId: ALICE })),
    ]);
    if (first.kind !== 'created' || second.kind !== 'exists') throw new Error('unexpected');
    expect(second.party.forumPostId).toBe(first.party.forumPostId);
    expect(second.party.forumPostId).not.toBeNull();
  });

  it('reports again from the start when the creation a report waited for failed', async () => {
    const { service, gateway, store } = await partyServiceWith();
    vi.spyOn(gateway, 'createPost').mockRejectedValueOnce(new Error('Missing Permissions'));
    const [first, second] = await Promise.allSettled([
      service.reportRaid(report()),
      service.reportRaid(report({ reporterId: ALICE })),
    ]);
    expect(first.status).toBe('rejected');
    expect(second).toMatchObject({ status: 'fulfilled', value: { kind: 'created' } });
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(store.active()).toHaveLength(1);
  });

  it('shows somebody who signed up while the post was being created', async () => {
    const { service, store, gateway } = await partyServiceWith();
    afterCreatePost(gateway, async () => {
      const [party] = store.active();
      await store.update(party?.id ?? '', (p) =>
        setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
      );
    });
    const outcome = await service.reportRaid(report());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await service.flush();
    const message = gateway.posts.get(outcome.party.forumPostId ?? '')?.message;
    expect(textOf(message)).toContain(`🏃 Coming (1): <@${ALICE}>`);
  });

  it('creates the post without the picture when Discord refuses the embed', async () => {
    const { service, gateway, entries } = await partyServiceWith();
    const withPicture = await service.reportRaid(
      report({ boss: { key: 'yveltal' }, time: { end: at('2026-10-13T14:40') } }),
    );
    if (withPicture.kind !== 'created') throw new Error(withPicture.kind);
    const picture = thumbnailOf(gateway.posts.get(withPicture.party.forumPostId ?? '')?.message);
    expect(picture).toBeDefined();

    gateway.rejectThumbnails = true;
    const outcome = await service.reportRaid(
      report({ gym: fountain!, boss: { key: 'yveltal' }, time: { end: at('2026-10-13T14:40') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const message = gateway.posts.get(outcome.party.forumPostId ?? '')?.message;
    expect(textOf(message)).toContain('Yveltal');
    expect(thumbnailOf(message)).toBeUndefined();
    expect(
      entries.some(
        (entry) =>
          entry.level === 40 && entry.party === outcome.party.id && entry.picture === picture,
      ),
    ).toBe(true);
  });

  it('edits the post without the picture when Discord refuses the embed', async () => {
    const { service, store, gateway, party, postId, entries } = await withRaidFor();
    gateway.rejectThumbnails = true;
    await store.update(party.id, (p) =>
      setBoss(
        asRaid(p),
        { tier: T5, boss: { key: 'yveltal' } },
        service.rulesIn(PARTY_ZONE),
        at('2026-10-13T14:31'),
      ),
    );
    service.changed(party.id);
    await service.flush();
    const post = gateway.posts.get(postId);
    expect(thumbnailOf(post?.message)).toBeUndefined();
    expect(textOf(post?.message)).toContain('**Hatches as Yveltal**');
    expect(entries.some((entry) => entry.level === 40 && entry.party === party.id)).toBe(true);
  });

  it("creates and edits the post without the gym's picture when Discord refuses it", async () => {
    const picture = 'https://lh3.googleusercontent.com/arch';
    const arch = testGym(50, 'Pictured Arch', library!.lat + 0.0002, library!.lon, {
      imageUrl: picture,
    });
    const gate = testGym(51, 'Pictured Gate', library!.lat + 0.0004, library!.lon, {
      imageUrl: picture,
    });
    const { service, store, gateway, entries } = await partyServiceWith([], {
      gyms: gymsFixture([arch, gate]),
    });
    // A super mega egg has no picture of its own: the gym’s is the post’s only one.
    const taken = await service.reportRaid(report({ gym: gate, tier: SUPER_MEGA }));
    if (taken.kind !== 'created') throw new Error(taken.kind);
    expect(thumbnailsOf(gateway.posts.get(taken.party.forumPostId ?? '')?.message)).toEqual([
      `${picture}=s400`,
    ]);

    gateway.rejectThumbnails = true;
    const outcome = await service.reportRaid(report({ gym: arch, tier: SUPER_MEGA }));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    const shown = () => gateway.posts.get(postId)?.message;
    expect(thumbnailsOf(shown())).toEqual([]);
    // The gym has no address: without its picture, its Where does not say so.
    const where = textDisplays(shown()).find((text) => text.startsWith('**Where**'));
    expect(where).toMatch(/^\*\*Where\*\*\n\*\*[^\n]+\*\* · \[Map\]\(<[^>]+>\)$/);
    expect(entries.some((entry) => entry.level === 40 && entry.party === outcome.party.id)).toBe(
      true,
    );

    await store.update(outcome.party.id, (p) =>
      setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
    );
    service.changed(outcome.party.id);
    await service.flush();
    expect(textOf(shown())).toContain(`🏃 Coming (1): <@${ALICE}>`);
    expect(thumbnailsOf(shown())).toEqual([]);
  });
});

describe('PartyService.reportRaid: the region a raid goes to', () => {
  const OVERLAP_CHANNEL = '100000000000000021';
  const OVERLAP_FORUM = '100000000000000022';
  const OTHER_CHANNEL = '100000000000000031';
  const OTHER_FORUM = '100000000000000032';

  async function overlapping() {
    const real = gymsFixture();
    const made = await partyServiceWith([], {
      gyms: asTestServerGyms({
        get: (id) => real.stored(id),
        regionsOf: (id) =>
          id === library!.id
            ? [WEST_CHANNEL, OVERLAP_CHANNEL, OTHER_CHANNEL]
            : real.of(TEST_GUILD_ROW).regionsOf(id),
      }),
    });
    made.gateway.addForum(OVERLAP_FORUM, FORUM_TAGS);
    made.gateway.addForum(OTHER_FORUM, FORUM_TAGS);
    const [west] = testRegions();
    made.regions.rows.push(
      { ...west!, id: 4, channelId: OVERLAP_CHANNEL, forumChannelId: OVERLAP_FORUM },
      { ...west!, id: 5, guildId: 2, channelId: OTHER_CHANNEL, forumChannelId: OTHER_FORUM },
    );
    return made;
  }

  it('is the region it was reported from, when the gym lies in it', async () => {
    const { service } = await overlapping();
    await expect(
      service.reportRaid(report({ regionChannelId: OVERLAP_CHANNEL })),
    ).resolves.toMatchObject({
      kind: 'created',
      party: { regionId: 4, forumChannelId: OVERLAP_FORUM },
    });
  });

  it('is a region of the same server when the gym does not lie in the one reported from', async () => {
    const { service } = await overlapping();
    const outcome = await service.reportRaid(report({ regionChannelId: EAST_CHANNEL }));
    expect(outcome).toMatchObject({ kind: 'created', party: { regionId: 1 } });
  });

  it('is the first region with a forum when no region channel is given', async () => {
    const { service } = await overlapping();
    await expect(service.reportRaid(report())).resolves.toMatchObject({
      kind: 'created',
      party: { regionId: 1 },
    });
  });

  it('is a region of the server it was reported in, though the channel is a region of another (plan 19B-2)', async () => {
    const { service } = await overlapping();
    // The library lies in a region of the second server too: its channel is no region here.
    expect(service.regionFor(library!, TEST_GUILD_ROW, OTHER_CHANNEL).region?.id).toBe(1);
    await expect(
      service.reportRaid(report({ regionChannelId: OTHER_CHANNEL })),
    ).resolves.toMatchObject({ kind: 'created', party: { regionId: 1, guildId: TEST_GUILD_ROW } });
  });

  it('is no region of another server than the one the report came from', async () => {
    const { service, regions } = await overlapping();
    regions.rows = regions.rows.filter((region) => region.id === 5 || region.id === 2);
    await expect(service.reportRaid(report({ regionChannelId: EAST_CHANNEL }))).resolves.toEqual({
      kind: 'no-region',
    });
  });

  it('says no region when the gym’s region belongs to no server: no server has it (plan 19B-2)', async () => {
    const { service, regions, storage } = await partyServiceWith();
    regions.rows[0]!.guildId = null;
    await expect(service.reportRaid(report())).resolves.toEqual({ kind: 'no-region' });
    expect(storage.writes).toEqual([]);
  });
});

describe('PartyService: renders, tags and the summary', () => {
  function timers() {
    const set: { run: () => void; ms: number; cancelled: boolean }[] = [];
    return {
      set,
      setTimer: (run: () => void, ms: number) => {
        const timer = { run, ms, cancelled: false };
        set.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    };
  }

  async function raidWith(timer = timers()) {
    const made = await partyServiceWith([], { setTimer: timer.setTimer });
    const outcome = await made.service.reportRaid(
      report({ time: { hatch: at('2026-10-13T14:30') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await made.service.flush();
    return { ...made, party: outcome.party, postId: outcome.party.forumPostId ?? '', timer };
  }

  async function name(
    made: Awaited<ReturnType<typeof raidWith>>,
    key: string,
    now = made.clock.now,
  ) {
    await made.store.update(made.party.id, (p) =>
      setBoss(asRaid(p), { tier: T5, boss: { key } }, made.service.rulesIn(PARTY_ZONE), now),
    );
    made.service.changed(made.party.id);
    await made.service.flush();
  }

  it('sets the tags although the rename throws', async () => {
    const made = await raidWith();
    made.gateway.failing.set('renamePost', new Error('Missing Access'));
    made.clock.now = at('2026-10-13T14:31');
    await name(made, 'yveltal');
    expect(made.gateway.posts.get(made.postId)).toMatchObject({
      title: 'T5 egg · The Stacks',
      retags: 1,
    });
    expect(made.entries.some((entry) => entry.level === 40)).toBe(true);
  });

  it('applies a title that had to wait when the timer fires, without another change', async () => {
    const made = await raidWith();
    made.gateway.renameLater.set(made.postId, 90_000);
    made.clock.now = at('2026-10-13T14:31');
    await name(made, 'yveltal');
    expect(made.gateway.posts.get(made.postId)?.title).toBe('T5 egg · The Stacks');
    expect(made.timer.set).toHaveLength(1);
    // Nothing was counted, so it is tried again after the wait Discord named.
    expect(made.timer.set[0]?.ms).toBe(90_000);

    made.gateway.renameLater.clear();
    made.timer.set[0]?.run();
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.title).toBe('Yveltal · The Stacks');
  });

  it('asks again when the oldest counted rename leaves the window, and flush clears the timer', async () => {
    const made = await raidWith();
    made.clock.now = at('2026-10-13T14:31');
    await name(made, 'yveltal');
    made.clock.now += 3 * MINUTE;
    await name(made, 'xerneas');
    made.clock.now += 2 * MINUTE;
    await name(made, 'mewtwo');
    expect(made.gateway.posts.get(made.postId)).toMatchObject({
      title: 'Xerneas · The Stacks',
      renames: 2,
    });
    expect(made.timer.set).toHaveLength(1);
    expect(made.timer.set[0]?.ms).toBe(5 * MINUTE);
    expect(made.timer.set[0]?.cancelled).toBe(true);
  });

  it('asks again for the tags of a forum after creating a post in it failed', async () => {
    const { service, gateway } = await partyServiceWith();
    vi.spyOn(gateway, 'createPost').mockRejectedValueOnce(new Error('Missing Permissions'));
    await expect(service.reportRaid(report())).rejects.toThrow();
    await service.reportRaid(report());
    expect(gateway.calls.filter((call) => call.startsWith('ensureTags'))).toHaveLength(2);
  });

  it('asks again for the tags of a forum after setting them failed', async () => {
    const made = await raidWith();
    const asked = () => made.gateway.calls.filter((call) => call.startsWith('ensureTags')).length;
    const before = asked();
    made.gateway.failing.set('setPostTags', new Error('Missing Permissions'));
    made.clock.now = at('2026-10-13T14:31');
    await name(made, 'yveltal');
    made.gateway.failing.clear();
    await name(made, 'yveltal');
    expect(asked()).toBeGreaterThan(before);
    expect(made.gateway.posts.get(made.postId)?.retags).toBe(1);
  });

  // Final review, G2: a forum full of the server's own tags still takes reports.
  it('posts a report in a forum with no room for its tags, without them', async () => {
    const { service, gateway } = await partyServiceWith();
    const own = Array.from({ length: 20 }, (_, n) => `Own ${String(n)}`);
    const ids = gateway.addForum(WEST_FORUM, own);
    const outcome = await service.reportRaid(report());
    expect(outcome.kind).toBe('created');
    const [post] = gateway.postsIn(WEST_FORUM);
    expect(post?.tagIds.every((id) => Object.values(ids).includes(id))).toBe(true);
  });

  it('asks for the tags of a forum once when two first reports come at once', async () => {
    const { service, gateway } = await partyServiceWith();
    await Promise.all([
      service.reportRaid(report()),
      service.reportRaid(report({ gym: fountain! })),
    ]);
    expect(gateway.calls.filter((call) => call.startsWith('ensureTags'))).toHaveLength(1);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  it('refreshes the summary of the region of a party that has ended', async () => {
    const made = await raidWith();
    const west = made.regions.rows[0]!;
    await made.service.ensureSummary(west);
    await made.service.flush();
    const summary = () => textOf(made.gateway.posts.get(west.summaryMessageId ?? '')?.message);
    expect(summary()).toContain(`<#${made.postId}>`);
    const ended = await made.store.update(made.party.id, (p) => ({ party: endParty(p) }));
    made.service.ended(ended?.party ?? made.party);
    await made.service.flush();
    expect(summary()).toBe(
      '### Today and coming up\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    );
  });

  it('does not edit the summary when its text did not change, and does when it did', async () => {
    const made = await raidWith();
    const west = made.regions.rows[0]!;
    await made.service.ensureSummary(west);
    await made.service.flush();
    const edits = (id: string | null) =>
      made.gateway.calls.filter((call) => call === `editPost ${id}`).length;
    const summaryId = west.summaryMessageId;
    expect(edits(summaryId)).toBe(0);
    made.service.summaryChanged(west.id);
    await made.service.flush();
    made.service.summaryChanged(west.id);
    await made.service.flush();
    expect(edits(summaryId)).toBe(0);

    await made.service.reportRaid(report({ gym: fountain! }));
    await made.service.flush();
    expect(edits(summaryId)).toBe(1);
    expect(textOf(made.gateway.posts.get(summaryId ?? '')?.message)).toContain('<#');
    made.service.summaryChanged(west.id);
    await made.service.flush();
    expect(edits(summaryId)).toBe(1);
  });

  it('makes a summary post of the classic kind a components-v2 message by its next edit', async () => {
    const made = await raidWith();
    const west = made.regions.rows[0]!;
    await made.service.ensureSummary(west);
    await made.service.flush();
    const summaryId = west.summaryMessageId ?? '';
    const post = made.gateway.posts.get(summaryId);
    if (!post) throw new Error('no summary post');
    expect(post.message.v2).toBe(true);
    // As one made before the summary was a v2 message.
    post.message = {
      content:
        'Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
    };
    await made.service.reportRaid(report({ gym: fountain! }));
    await made.service.flush();
    expect(made.gateway.converted).toEqual([{ id: summaryId, direct: false }]);
    expect(textOf(made.gateway.posts.get(summaryId)?.message)).toMatch(
      /^### Today and coming up\n2 raids/,
    );
  });

  it('edits the new summary post after the old one was deleted by hand and replaced', async () => {
    const made = await raidWith();
    const west = made.regions.rows[0]!;
    await made.service.ensureSummary(west);
    await made.service.flush();
    const old = west.summaryMessageId;
    made.gateway.gone.add(old ?? '');
    await expect(made.service.ensureSummary(west)).resolves.toBe(true);
    await made.service.flush();
    const replacement = west.summaryMessageId;
    expect(replacement).not.toBe(old);
    await made.service.reportRaid(report({ gym: fountain! }));
    await made.service.flush();
    expect(made.gateway.calls.filter((call) => call === `editPost ${replacement}`)).toHaveLength(1);
  });

  it('makes a new summary post when editing the summary finds it gone', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const old = west.summaryMessageId;
    gateway.gone.add(old ?? '');
    await service.reportRaid(report());
    await service.flush();
    expect(west.summaryMessageId).not.toBe(old);
    expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({ pinned: true });
  });

  it('pins the summary again when it is not pinned any more', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const summary = gateway.posts.get(west.summaryMessageId ?? '');
    expect(summary?.pinned).toBe(true);
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    expect(gateway.calls.filter((call) => call.startsWith('pinPost'))).toHaveLength(1);

    // A post that was archived and opened again comes back unpinned.
    if (summary) summary.pinned = false;
    await addQuietRaid(made, { id: '00000000-0000-4000-8000-000000000002', gymId: 2 });
    service.summaryChanged(west.id);
    await service.flush();
    expect(summary?.pinned).toBe(true);
  });

  it('warns and goes on when pinning the summary again fails', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions, entries } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const summary = gateway.posts.get(west.summaryMessageId ?? '');
    if (summary) summary.pinned = false;
    gateway.failing.set('pinPost', new Error('Missing Permissions'));
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    expect(entries.some((entry) => entry.level === 40 && entry.region === west.id)).toBe(true);
    expect(entries.some((entry) => entry.level === 50)).toBe(false);
  });

  it('creates one summary post when two calls come at once', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    const results = await Promise.all([service.ensureSummary(west), service.ensureSummary(west)]);
    expect(results.sort()).toEqual([false, true]);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });

  it('records the summary post although pinning it fails, with a warning', async () => {
    const { service, gateway, regions, entries } = await partyServiceWith();
    const west = regions.rows[0]!;
    gateway.failing.set('pinPost', new Error('Missing Permissions'));
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    expect(west.summaryMessageId).not.toBeNull();
    expect(entries.some((entry) => entry.level === 40)).toBe(true);
    gateway.failing.clear();
    vi.spyOn(gateway, 'pinPost').mockResolvedValueOnce(false);
    // The unpinned post above would be taken over; a fresh one is what this checks.
    gateway.gone.add(west.summaryMessageId ?? '');
    west.summaryMessageId = null;
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    expect(west.summaryMessageId).not.toBeNull();
  });

  it('answers false and deletes its post when the forum changed meanwhile', async () => {
    const { service, gateway, regions, entries } = await partyServiceWith();
    const west = regions.rows[0]!;
    regions.setSummaryMessage = () => Promise.resolve(false);
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
    expect(gateway.deletedPosts).toHaveLength(1);
    expect(entries.some((entry) => entry.level === 40)).toBe(true);
  });
});

describe('PartyService: a post whose first message was deleted', () => {
  it('replaces the summary post once, deleting the old thread', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const old = west.summaryMessageId ?? '';
    gateway.messageGone.add(old);
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    expect(gateway.deletedPosts).toEqual([old]);
    expect(west.summaryMessageId).not.toBe(old);
    expect(gateway.posts.get(west.summaryMessageId ?? '')).toMatchObject({ pinned: true });
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    const calls = gateway.calls.length;
    await service.flush();
    expect(gateway.calls).toHaveLength(calls);
  });

  it('warns when the old summary thread cannot be deleted, as it may keep the forum pin', async () => {
    const made = await partyServiceWith();
    const { service, gateway, regions, entries } = made;
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const old = west.summaryMessageId ?? '';
    gateway.messageGone.add(old);
    gateway.failing.set('deletePost', new Error('Missing Permissions'));
    await addQuietRaid(made);
    service.summaryChanged(west.id);
    await service.flush();
    expect(entries.some((entry) => entry.level === 40 && entry.post === old)).toBe(true);
    expect(west.summaryMessageId).not.toBe(old);
  });

  it('ends the party and deletes the thread of a raid post whose message is gone', async () => {
    const { service, store, gateway, party, postId } = await withRaidFor();
    gateway.messageGone.add(postId);
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
    service.changed(party.id);
    await service.flush();
    expect(store.get(party.id)).toBeUndefined();
    expect(gateway.deletedPosts).toContain(postId);
  });

  it('ends the party although the thread cannot be deleted, with a debug line', async () => {
    const { service, store, gateway, party, postId, entries } = await withRaidFor();
    gateway.messageGone.add(postId);
    gateway.failing.set('deletePost', new Error('Missing Permissions'));
    await store.update(party.id, (p) => setAttendance(p, ALICE, PartyStatus.Coming, {}, limits));
    service.changed(party.id);
    await service.flush();
    expect(store.get(party.id)).toBeUndefined();
    expect(entries.some((entry) => entry.level === 20 && entry.post === postId)).toBe(true);
  });
});

function limited(extra: {
  timeToReset?: number;
  sublimitTimeout?: number;
  retryAfter?: number;
}): RateLimitError {
  return new RateLimitError({
    global: false,
    hash: 'h',
    limit: 2,
    majorParameter: 'x',
    method: 'PATCH',
    retryAfter: 0,
    route: '/channels/:id',
    scope: 'user',
    sublimitTimeout: 0,
    timeToReset: 0,
    url: 'https://discord.com/api/v10/channels/1',
    ...extra,
  });
}

describe('PartyService: rate limits and unchanged posts', () => {
  function timers() {
    const set: { run: () => void; ms: number; cancelled: boolean }[] = [];
    return {
      set,
      setTimer: (run: () => void, ms: number) => {
        const timer = { run, ms, cancelled: false };
        set.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    };
  }

  async function raid(timer = timers()) {
    const made = await partyServiceWith([], { setTimer: timer.setTimer });
    const outcome = await made.service.reportRaid(
      report({ time: { hatch: at('2026-10-13T14:30') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await made.service.flush();
    return { ...made, party: outcome.party, postId: outcome.party.forumPostId ?? '', timer };
  }

  async function nameBoss(made: Awaited<ReturnType<typeof raid>>, key: string) {
    await made.store.update(made.party.id, (p) =>
      setBoss(
        asRaid(p),
        { tier: T5, boss: { key } },
        made.service.rulesIn(PARTY_ZONE),
        made.clock.now,
      ),
    );
    made.service.changed(made.party.id);
    await made.service.flush();
  }

  it('asks for the tags again after the wait Discord named, without a warning', async () => {
    const made = await raid();
    made.gateway.failing.set('setPostTags', limited({ timeToReset: 45_000 }));
    made.clock.now = at('2026-10-13T14:31');
    await nameBoss(made, 'yveltal');
    expect(made.gateway.posts.get(made.postId)?.retags).toBe(0);
    expect(made.timer.set).toHaveLength(1);
    expect(made.timer.set[0]?.ms).toBe(45_000);
    expect(made.entries.some((entry) => entry.level === 40)).toBe(false);

    made.gateway.failing.clear();
    made.timer.set[0]?.run();
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.retags).toBe(1);
  });

  it('asks for the render again after a rate limit on the edit, without an error', async () => {
    const made = await raid();
    made.gateway.failing.set('editPost', limited({ timeToReset: 45_000 }));
    made.clock.now = at('2026-10-13T14:31');
    await nameBoss(made, 'yveltal');
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(0);
    expect(made.timer.set).toHaveLength(1);
    expect(made.timer.set[0]?.ms).toBe(45_000);
    expect(made.entries.some((entry) => entry.level === 40 || entry.level === 50)).toBe(false);
    expect(made.entries.some((entry) => entry.level === 20 && entry.party === made.party.id)).toBe(
      true,
    );

    made.gateway.failing.clear();
    made.timer.set[0]?.run();
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
  });

  it('asks for the summary again after a rate limit on its edit, without an error', async () => {
    const timer = timers();
    const made = await partyServiceWith([], { setTimer: timer.setTimer });
    const west = made.regions.rows[0]!;
    await made.service.ensureSummary(west);
    const summary = made.gateway.posts.get(west.summaryMessageId ?? '');
    made.gateway.failing.set('editPost', limited({ retryAfter: 45_000 }));
    await addQuietRaid(made);
    made.service.summaryChanged(west.id);
    await made.service.flush();
    expect(summary?.edits).toBe(0);
    expect(timer.set).toHaveLength(1);
    expect(timer.set[0]?.ms).toBe(45_000);
    expect(made.entries.some((entry) => entry.level === 50)).toBe(false);

    made.gateway.failing.clear();
    timer.set[0]?.run();
    await made.service.flush();
    expect(summary?.edits).toBe(1);
  });

  function recordingTimers() {
    const events: string[] = [];
    return {
      events,
      setTimer: (_run: () => void, ms: number) => {
        events.push(`set ${ms}`);
        return () => {
          events.push(`cancel ${ms}`);
        };
      },
    };
  }

  it('keeps the earlier of two waits of one post', async () => {
    const recorded = recordingTimers();
    const made = await partyServiceWith([], { setTimer: recorded.setTimer });
    const outcome = await made.service.reportRaid(
      report({ time: { hatch: at('2026-10-13T14:30') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await made.service.flush();
    const postId = outcome.party.forumPostId ?? '';
    made.gateway.failing.set('setPostTags', limited({ timeToReset: 120_000 }));
    made.gateway.renameLater.set(postId, 30_000);
    made.clock.now = at('2026-10-13T14:31');
    await made.store.update(outcome.party.id, (p) =>
      setBoss(
        asRaid(p),
        { tier: T5, boss: { key: 'yveltal' } },
        made.service.rulesIn(PARTY_ZONE),
        made.clock.now,
      ),
    );
    made.service.changed(outcome.party.id);
    await made.service.flush();
    // The tags asked for 120 s first; the earlier wait of the title replaces it.
    expect(recorded.events).toEqual(['set 120000', 'cancel 120000', 'set 30000', 'cancel 30000']);
  });

  it('does not start a later timer when an earlier one waits already', async () => {
    const recorded = recordingTimers();
    const made = await partyServiceWith([], { setTimer: recorded.setTimer });
    const outcome = await made.service.reportRaid(
      report({ time: { hatch: at('2026-10-13T14:30') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await made.service.flush();
    const postId = outcome.party.forumPostId ?? '';
    made.gateway.failing.set('setPostTags', limited({ timeToReset: 30_000 }));
    made.gateway.renameLater.set(postId, 120_000);
    made.clock.now = at('2026-10-13T14:31');
    await made.store.update(outcome.party.id, (p) =>
      setBoss(
        asRaid(p),
        { tier: T5, boss: { key: 'yveltal' } },
        made.service.rulesIn(PARTY_ZONE),
        made.clock.now,
      ),
    );
    made.service.changed(outcome.party.id);
    await made.service.flush();
    expect(recorded.events).toEqual(['set 30000', 'cancel 30000']);
  });

  it('treats a wait that is not a finite number as one second', async () => {
    for (const wait of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const made = await raid();
      made.gateway.renameLater.set(made.postId, wait);
      made.clock.now = at('2026-10-13T14:31');
      await nameBoss(made, 'yveltal');
      expect(made.timer.set[0]?.ms).toBe(1_000);
    }
  });

  it('forgets what it sent before an edit, so a failure after it hides nothing', async () => {
    const made = await raid();
    // The egg has hatched by now: the post shows that first, and this is the state to come back to.
    made.clock.now = at('2026-10-13T14:31');
    made.service.changed(made.party.id);
    await made.service.flush();
    const base = made.gateway.posts.get(made.postId)?.edits ?? 0;
    // The party with Alice is sent; asking afterwards how the post looks fails.
    await made.store.update(made.party.id, (p) =>
      setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
    );
    made.gateway.failing.set('postInfo', new Error('Boom'));
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(base + 1);
    // Back to the state that was sent before: the post must be edited, not left as it is.
    made.gateway.failing.clear();
    await made.store.update(made.party.id, (p) => leaveParty(p, ALICE));
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(base + 2);
  });

  it('uses the larger of the sublimit and the bucket wait', async () => {
    const made = await raid();
    made.gateway.failing.set(
      'setPostTags',
      limited({ timeToReset: 2_000, sublimitTimeout: 120_000 }),
    );
    made.clock.now = at('2026-10-13T14:31');
    await nameBoss(made, 'yveltal');
    expect(made.timer.set[0]?.ms).toBe(120_000);
  });

  it('waits between one second and ten minutes for a refused rename', async () => {
    const made = await raid();
    made.gateway.renameLater.set(made.postId, 10);
    made.clock.now = at('2026-10-13T14:31');
    await nameBoss(made, 'yveltal');
    expect(made.timer.set[0]?.ms).toBe(1_000);

    const other = await raid();
    other.gateway.renameLater.set(other.postId, 3 * 3_600_000);
    other.clock.now = at('2026-10-13T14:31');
    await nameBoss(other, 'yveltal');
    expect(other.timer.set[0]?.ms).toBe(10 * MINUTE);
  });

  it('sends the one message the renderer made, with its components', async () => {
    const made = await raid();
    const message = () => made.gateway.posts.get(made.postId)?.message;
    const rendered = () => {
      const party = made.store.get(made.party.id);
      if (!party) throw new Error('the raid is gone');
      return renderRaidPost(made.service.view(asRaid(party))).message;
    };
    expect(message()).toEqual(rendered());
    expect(textOf(message())).not.toContain('**Group B**');
    // A second group changes the post, and the edit carries it.
    await made.store.update(made.party.id, (p) => createGroup(p, ALICE, limits));
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(message()).toEqual(rendered());
    expect(textOf(message())).toContain('**Group B**');
  });

  it('sends nothing for a render right after creation, and nothing for an unchanged party', async () => {
    const made = await raid();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ edits: 0, renames: 0, retags: 0 });
    made.service.changed(made.party.id);
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ edits: 0, renames: 0, retags: 0 });
  });

  it('edits once for a change, and not again for the same state', async () => {
    const made = await raid();
    made.clock.now = at('2026-10-13T14:31');
    await nameBoss(made, 'yveltal');
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
    made.service.changed(made.party.id);
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
  });

  it('still notices a deleted post, at most every ten minutes, when nothing changed', async () => {
    const made = await raid();
    made.gateway.gone.add(made.postId);
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.calls.some((call) => call.startsWith('postInfo'))).toBe(false);

    made.clock.now += 11 * MINUTE;
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.store.get(made.party.id)).toBeUndefined();
  });

  it('forgets what it sent when an edit fails, so the next render sends again', async () => {
    const made = await raid();
    made.clock.now = at('2026-10-13T14:31');
    made.gateway.failing.set('editPost', new Error('Boom'));
    await nameBoss(made, 'yveltal');
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(0);
    made.gateway.failing.clear();
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
  });

  it('does not rename on every render for a gym name with extra white space', async () => {
    const real = gymsFixture();
    const made = await partyServiceWith([], {
      gyms: asTestServerGyms({
        get: (id) => {
          const gym = real.stored(id);
          return gym && id === library!.id
            ? { ...gym, name: ' The  Stacks ', nickname: null }
            : gym;
        },
        regionsOf: (id) => real.of(TEST_GUILD_ROW).regionsOf(id),
      }),
    });
    const outcome = await made.service.reportRaid(
      report({ time: { hatch: at('2026-10-13T14:30') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    await made.service.flush();
    expect(made.gateway.posts.get(postId)?.title).toBe('T5 egg · The Stacks');
    // Discord may report the title with the spaces as typed.
    const post = made.gateway.posts.get(postId);
    if (post) post.title = 'T5 egg · The  Stacks';
    await made.store.update(outcome.party.id, (p) =>
      setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
    );
    made.service.changed(outcome.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(postId)).toMatchObject({ edits: 1, renames: 0 });
  });
});

/** A bot whose role is no administrator and gives what a forum needs, Manage Roles among it. */
const NON_ADMIN_BOT =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageThreads |
  PermissionFlagsBits.AddReactions;

/** The bot's own overwrite of a forum on the fake gateway: what it allows, or undefined. */
function botAllowIn(gateway: FakePartyGateway, forumId: string): bigint | undefined {
  const own = gateway.forumOverwrites
    .get(forumId)
    ?.find((one) => one.id === FakePartyGateway.BOT_ID);
  return own === undefined ? undefined : BigInt(own.allow);
}

describe('PartyService.setupForums: one run at a time per server', () => {
  it('makes a second call wait for the first and find everything ready', async () => {
    const { service, gateway } = await partyServiceWith();
    const first = service.setupForums(gateway.guildId);
    expect(service.setupRunning(gateway.guildId)).toBe(true);
    const second = service.setupForums(gateway.guildId);
    const [one, two] = await Promise.all([first, second]);
    expect(service.setupRunning(gateway.guildId)).toBe(false);
    expect(one.some((r) => r.forum === 'created')).toBe(true);
    expect(two.every((r) => r.forum === 'ready' && !r.summary)).toBe(true);
  });

  it('deletes a forum it created when recording it fails', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    regions.setForum = () => Promise.resolve('forum-taken');
    const before = new Set(gateway.forums.keys());
    const results = await service.setupForums(gateway.guildId);
    expect(results.some((r) => r.forum === 'failed')).toBe(true);
    expect(gateway.deletedChannels.length).toBeGreaterThan(0);
    // Only a forum made by the run itself is deleted, never one that was there.
    expect(gateway.deletedChannels.some((id) => before.has(id))).toBe(false);
  });

  it('makes forums in rehearsal mode only for its regions, seen by staff and its allowlist', async () => {
    const rehearsal = new Rehearsal({
      allowlist: [ALICE],
      regions: ['unbounded', 'west'],
      staffRoles: ['Moderator'],
    });
    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    gateway.channelNames.set(EAST_CHANNEL, 'east');
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'unbounded');
    const results = await service.setupForums(gateway.guildId);
    expect(results.map((r) => [r.region.channelId, r.forum, r.hidden])).toEqual([
      [WEST_CHANNEL, 'ready', 'hidden'],
      [UNBOUNDED_CHANNEL, 'created', 'hidden'],
    ]);
    const made = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    for (const forumId of [WEST_FORUM, made]) {
      expect(gateway.hidden.get(forumId)).toEqual({ roleNames: ['Moderator'], memberIds: [ALICE] });
      expect(gateway.canSee(forumId, ALICE)).toBe(true);
      expect(gateway.canSee(forumId, BOB)).toBe(false);
    }
    expect(gateway.hidden.has(EAST_FORUM)).toBe(false);
  });

  it('says in rehearsal mode when it may not hide a forum, and posts nothing in it', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['west'], staffRoles: [] });
    const { service, gateway } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    gateway.noHiding.add(WEST_FORUM);
    const [west] = await service.setupForums(gateway.guildId);
    expect(west).toMatchObject({ forum: 'ready', hidden: 'not-allowed', summary: false });
    expect(gateway.hidden.has(WEST_FORUM)).toBe(false);
    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
  });

  it('hides a forum in rehearsal mode from a role its category lets in, before posting in it', async () => {
    const rehearsal = new Rehearsal({
      allowlist: [ALICE],
      regions: ['west', 'unbounded'],
      staffRoles: ['Moderator'],
    });
    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
    const VALOR = '300000000000000011';
    const MODS = '300000000000000012';
    gateway.serverRoles.set(VALOR, { name: 'Valor', permissions: 0n });
    gateway.serverRoles.set(MODS, { name: 'Moderator', permissions: 0n });
    gateway.memberRoles.set(BOB, [VALOR]);
    gateway.memberRoles.set(CAROL, [MODS]);
    // The category lets Valor in; a forum made in it, or made before, takes that over.
    gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded', { categoryId: 'category-1' });
    gateway.categoryOverwrites.set('category-1', [
      {
        id: VALOR,
        type: OverwriteType.Role,
        allow: String(PermissionFlagsBits.ViewChannel),
        deny: '0',
      },
    ]);
    gateway.forumOverwrites.set(WEST_FORUM, [
      {
        id: VALOR,
        type: OverwriteType.Role,
        allow: String(PermissionFlagsBits.ViewChannel),
        deny: '0',
      },
    ]);
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    await service.setupForums(gateway.guildId);
    const made = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    for (const forumId of [WEST_FORUM, made]) {
      expect(gateway.canSee(forumId, BOB)).toBe(false);
      expect(gateway.canSee(forumId, CAROL)).toBe(true);
      expect(gateway.canSee(forumId, ALICE)).toBe(true);
    }
    // Hidden before the first post in it (the list of what is going on).
    const at = (call: string) => gateway.calls.indexOf(call);
    expect(at(`hideForum ${WEST_FORUM}`)).toBeGreaterThanOrEqual(0);
    expect(at(`hideForum ${WEST_FORUM}`)).toBeLessThan(at(`createPost ${WEST_FORUM}`));
    expect(gateway.createdHidden).toContain(made);
  });

  it('makes no forum in rehearsal mode that it cannot make hidden', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'unbounded');
    gateway.noHiding.add(UNBOUNDED_CHANNEL);
    const before = new Set(gateway.forums.keys());
    const [unbounded] = await service.setupForums(gateway.guildId);
    expect(unbounded).toMatchObject({ forum: 'failed' });
    expect([...gateway.forums.keys()].filter((id) => !before.has(id))).toEqual([]);
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
  });

  it('makes a hidden forum for a bot whose role is no administrator', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'unbounded');
    // The bot's role as a server gives it: what a forum needs, Manage Roles among it.
    gateway.botPermissions = NON_ADMIN_BOT | PermissionFlagsBits.UseExternalEmojis;
    const [unbounded] = await service.setupForums(gateway.guildId);
    expect(unbounded).toMatchObject({ forum: 'created', hidden: 'hidden', summary: true });
    const made = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    expect(gateway.createdHidden).toContain(made);
    // The list of active raids is posted in it.
    expect(gateway.postsIn(made)).toHaveLength(1);
  });

  it('gives the bot in a new hidden forum, on the second hide, what only the category gives it', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
    gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded', { categoryId: 'category-1' });
    gateway.botPermissions = NON_ADMIN_BOT;
    const emoji = PermissionFlagsBits.UseExternalEmojis;
    // The category gives the bot what its role does not: a creation may not, the PATCH may.
    gateway.categoryOverwrites.set('category-1', [
      { id: FakePartyGateway.BOT_ID, type: OverwriteType.Member, allow: String(emoji), deny: '0' },
    ]);
    const [unbounded] = await service.setupForums(gateway.guildId);
    expect(unbounded).toMatchObject({ forum: 'created', hidden: 'hidden', summary: true });
    const made = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    expect(gateway.calls).toContain(`hideForum ${made}`);
    expect((botAllowIn(gateway, made) ?? 0n) & emoji).toBe(emoji);
    expect(gateway.canSee(made, BOB)).toBe(false);
  });

  it('takes a new forum as hidden when Discord refuses the second hide, and says what the bot lacks', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
    const { service, gateway, regions, entries } = await partyServiceWith([], { rehearsal });
    gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded', { categoryId: 'category-1' });
    gateway.botPermissions = NON_ADMIN_BOT;
    const emoji = PermissionFlagsBits.UseExternalEmojis;
    gateway.categoryOverwrites.set('category-1', [
      { id: FakePartyGateway.BOT_ID, type: OverwriteType.Member, allow: String(emoji), deny: '0' },
    ]);
    // Discord refuses the bot the bit in the forum although the category gives it.
    gateway.unsettable = emoji;
    const [unbounded] = await service.setupForums(gateway.guildId);
    expect(unbounded).toMatchObject({
      forum: 'created',
      hidden: 'hidden',
      refused: ['Use External Emojis'],
      summary: true,
    });
    const made = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    // Hidden as it was made, and set up all the same.
    expect(gateway.canSee(made, BOB)).toBe(false);
    expect(gateway.canSee(made, ALICE)).toBe(true);
    expect((botAllowIn(gateway, made) ?? 0n) & emoji).toBe(0n);
    expect(gateway.postsIn(made)).toHaveLength(1);
    expect(gateway.reserved.has(made)).toBe(true);
    const warned = entries.filter((entry) => entry.level === 40 && entry.forum === made);
    expect(warned.map((entry) => entry.msg)).toEqual([
      'a new hidden forum stays as it was made: Discord refused the bot Use External Emojis there, which only the category gives it',
    ]);
  });

  it('takes a forum that is there as hidden when Discord refuses the hide but it is hidden already', async () => {
    const rehearsal = new Rehearsal({
      allowlist: [ALICE],
      regions: ['west'],
      staffRoles: ['Moderator'],
    });
    const { service, gateway, entries } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    const MODS = '300000000000000012';
    gateway.serverRoles.set(MODS, { name: 'Moderator', permissions: 0n });
    const see = String(PermissionFlagsBits.ViewChannel);
    // Hidden by hand (or by an earlier run): everyone shut out, the bot, staff and Alice let in.
    gateway.forumOverwrites.set(WEST_FORUM, [
      { id: gateway.guildId, type: OverwriteType.Role, allow: '0', deny: see },
      { id: FakePartyGateway.BOT_ID, type: OverwriteType.Member, allow: see, deny: '0' },
      { id: MODS, type: OverwriteType.Role, allow: see, deny: '0' },
      { id: ALICE, type: OverwriteType.Member, allow: see, deny: '0' },
    ]);
    gateway.noHiding.add(WEST_FORUM);
    const [west] = await service.setupForums(gateway.guildId);
    expect(west).toMatchObject({ forum: 'ready', hidden: 'hidden', refused: [], summary: true });
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    const warned = entries.filter((entry) => entry.level === 40 && entry.forum === WEST_FORUM);
    expect(warned.map((entry) => entry.msg)).toEqual([
      'a hidden forum stays as it is: Discord refused to set its permissions',
    ]);
  });

  it('posts nothing in a forum that is there when Discord refuses the hide and somebody else may see it', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['west'], staffRoles: [] });
    const { service, gateway } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    const VALOR = '300000000000000011';
    gateway.serverRoles.set(VALOR, { name: 'Valor', permissions: 0n });
    const see = String(PermissionFlagsBits.ViewChannel);
    gateway.forumOverwrites.set(WEST_FORUM, [
      { id: gateway.guildId, type: OverwriteType.Role, allow: '0', deny: see },
      { id: VALOR, type: OverwriteType.Role, allow: see, deny: '0' },
    ]);
    gateway.noHiding.add(WEST_FORUM);
    const [west] = await service.setupForums(gateway.guildId);
    expect(west).toMatchObject({ forum: 'ready', hidden: 'not-allowed', summary: false });
    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
  });

  it('makes no hidden forum for a bot whose role lacks Manage Roles, whatever the category gives', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
    gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded', { categoryId: 'category-1' });
    gateway.botPermissions = NON_ADMIN_BOT & ~PermissionFlagsBits.ManageRoles;
    gateway.categoryOverwrites.set('category-1', [
      {
        id: FakePartyGateway.BOT_ID,
        type: OverwriteType.Member,
        allow: String(PermissionFlagsBits.ManageRoles),
        deny: '0',
      },
    ]);
    const before = new Set(gateway.forums.keys());
    const [unbounded] = await service.setupForums(gateway.guildId);
    expect(unbounded).toMatchObject({ forum: 'failed', reason: HIDDEN_FORUM_REFUSED });
    expect([...gateway.forums.keys()].filter((id) => !before.has(id))).toEqual([]);
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
  });

  it('makes no hidden forum for a bot without Manage Channels', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
    const { service, gateway } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'unbounded');
    gateway.botPermissions = NON_ADMIN_BOT & ~PermissionFlagsBits.ManageChannels;
    const before = new Set(gateway.forums.keys());
    const [unbounded] = await service.setupForums(gateway.guildId);
    expect(unbounded).toMatchObject({ forum: 'failed', reason: HIDDEN_FORUM_REFUSED });
    expect([...gateway.forums.keys()].filter((id) => !before.has(id))).toEqual([]);
  });

  it('says in rehearsal mode why a forum that is there failed, not why one was not made', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['west'], staffRoles: [] });
    const { service, gateway } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    gateway.failing.set('ensureTags', missingPermissions('PATCH'));
    const [west] = await service.setupForums(gateway.guildId);
    expect(west).toMatchObject({
      forum: 'failed',
      reason: 'I need the Manage Channels and Manage Threads permissions here.',
    });
  });

  it('says why it cannot make a hidden forum when the bot lacks a permission it gives', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
    const { service, gateway } = await partyServiceWith([], { rehearsal });
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'unbounded');
    const P = PermissionFlagsBits;
    // No Add Reactions: the testers' overwrite allows it.
    gateway.botPermissions =
      P.ViewChannel |
      P.SendMessages |
      P.SendMessagesInThreads |
      P.ReadMessageHistory |
      P.ManageChannels |
      P.ManageRoles |
      P.ManageThreads;
    const [unbounded] = await service.setupForums(gateway.guildId);
    expect(unbounded).toMatchObject({ forum: 'failed' });
    expect(unbounded?.reason).toBe(HIDDEN_FORUM_REFUSED);
  });

  it('deletes the forum also when recording it throws', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    regions.setForum = () => Promise.reject(new Error('db down'));
    const before = new Set(gateway.forums.keys());
    const results = await service.setupForums(gateway.guildId);
    expect(results.some((r) => r.forum === 'failed')).toBe(true);
    expect(gateway.deletedChannels.length).toBeGreaterThan(0);
    expect(gateway.deletedChannels.some((id) => before.has(id))).toBe(false);
  });
});

describe('PartyService: the square picture of an egg (8D-F)', () => {
  const EGG = 'raid_egg_2_icon.png';
  const hatching = () =>
    report({ boss: { key: 'yveltal' }, time: { hatch: at('2026-10-13T14:30') } });

  it('carries the egg as a file of the post without web pages, and takes it away at hatch', async () => {
    const { service, store, gateway, clock } = await partyServiceWith();
    const outcome = await service.reportRaid(hatching());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    const shown = () => gateway.posts.get(postId);
    expect(thumbnailOf(shown()?.message)).toBe(`attachment://${EGG}`);
    expect(v2(shown()?.message).files).toEqual([path.join(EGG_FOLDER, EGG)]);
    expect(shown()?.attachments).toEqual([EGG]);
    // A DM about it shows the same picture, and carries the file too.
    expect(service.briefOf(outcome.party)).toMatchObject({
      picture: `attachment://${EGG}`,
      pictureFile: path.join(EGG_FOLDER, EGG),
    });
    // Every edit while it is an egg carries it again.
    await store.update(outcome.party.id, (p) =>
      setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
    );
    service.changed(outcome.party.id);
    await service.flush();
    expect(shown()?.edits).toBe(1);
    expect(shown()?.attachments).toEqual([EGG]);
    // Hatched, the post shows its boss by address, and the egg's file is gone from it.
    clock.now = at('2026-10-13T14:40');
    service.changed(outcome.party.id);
    await service.flush();
    expect(thumbnailOf(shown()?.message)).toMatch(/^https:\/\/.*pm717/);
    expect(shown()?.attachments).toEqual([]);
  });

  it('names the egg on its own web server when Discord can reach it, and carries nothing', async () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const eggPictures = new EggPictures({
      web: {
        port: 8080,
        host: '127.0.0.1',
        publicUrl: 'https://map.example.test',
        trustProxy: false,
        tiles: 'osm',
      },
    });
    // The web server listens (`startWebServer` answered true).
    eggPictures.serving();
    const { service, gateway } = await partyServiceWith([], { settings, eggPictures });
    const outcome = await service.reportRaid(hatching());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const post = gateway.posts.get(outcome.party.forumPostId ?? '');
    expect(thumbnailOf(post?.message)).toMatch(
      new RegExp(`^https://map\\.example\\.test/eggs/${EGG}\\?v=[0-9a-f]{8}$`),
    );
    expect(post?.attachments).toEqual([]);
    expect(service.briefOf(outcome.party)).not.toHaveProperty('pictureFile');
  });

  it('carries the egg also where the post is made with a line and converted at once', async () => {
    const { service, store, gateway } = await partyServiceWith();
    gateway.refuseV2Starter = true;
    const outcome = await service.reportRaid(hatching());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    expect(gateway.converted).toEqual([{ id: postId, direct: true }]);
    expect(thumbnailOf(gateway.posts.get(postId)?.message)).toBe(`attachment://${EGG}`);
    expect(gateway.posts.get(postId)?.attachments).toEqual([EGG]);
    // Discord refused the first message, not its file: the next edits carry the egg still.
    await store.update(outcome.party.id, (p) =>
      setAttendance(p, ALICE, PartyStatus.Coming, {}, limits),
    );
    service.changed(outcome.party.id);
    await service.flush();
    expect(gateway.posts.get(postId)?.edits).toBe(2);
    expect(gateway.posts.get(postId)?.attachments).toEqual([EGG]);
    // And so does the next post in that forum.
    const next = await service.reportRaid({ ...hatching(), gym: fountain! });
    if (next.kind !== 'created') throw new Error(next.kind);
    expect(gateway.posts.get(next.party.forumPostId ?? '')?.attachments).toEqual([EGG]);
  });

  it('makes the post without the egg where Discord refuses its file, and asks no more', async () => {
    const { service, store, gateway, entries } = await partyServiceWith();
    // Without Attach Files Discord answers Missing Permissions (50013).
    gateway.refuseFiles = true;
    const outcome = await service.reportRaid(hatching());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const post = () => gateway.posts.get(outcome.party.forumPostId ?? '');
    expect(post()?.message).toBeDefined();
    expect(thumbnailOf(post()?.message)).toBeUndefined();
    expect(post()?.attachments).toEqual([]);
    expect(gateway.filesRefused).toBe(1);
    // Its edits go without the file at once: no refused call, no warning each time.
    for (const member of [ALICE, BOB]) {
      await store.update(outcome.party.id, (p) =>
        setAttendance(p, member, PartyStatus.Coming, {}, limits),
      );
      service.changed(outcome.party.id);
      await service.flush();
    }
    expect(post()?.edits).toBe(2);
    expect(gateway.filesRefused).toBe(1);
    expect(entries.filter((entry) => entry.level === 40)).toHaveLength(1);
  });

  it('edits a post without the egg once Discord refuses its file, and asks no more', async () => {
    const { service, store, gateway } = await partyServiceWith();
    const outcome = await service.reportRaid(hatching());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const post = () => gateway.posts.get(outcome.party.forumPostId ?? '');
    gateway.refuseFiles = true;
    for (const member of [ALICE, BOB]) {
      await store.update(outcome.party.id, (p) =>
        setAttendance(p, member, PartyStatus.Coming, {}, limits),
      );
      service.changed(outcome.party.id);
      await service.flush();
    }
    expect(post()?.edits).toBe(2);
    expect(thumbnailOf(post()?.message)).toBeUndefined();
    expect(post()?.attachments).toEqual([]);
    expect(gateway.filesRefused).toBe(1);
  });

  it('makes the post without the egg also on the way of a line converted at once', async () => {
    const { service, gateway } = await partyServiceWith();
    gateway.refuseV2Starter = true;
    gateway.refuseFiles = true;
    const outcome = await service.reportRaid(hatching());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const post = gateway.posts.get(outcome.party.forumPostId ?? '');
    expect(thumbnailOf(post?.message)).toBeUndefined();
    expect(post?.attachments).toEqual([]);
  });

  it('edits the line into the post without the egg at once where the first way had its file refused', async () => {
    const { service, gateway } = await partyServiceWith();
    gateway.refuseFiles = true;
    // Discord refuses the file (no Attach Files) before it refuses a v2 first message: only the
    // post without the egg is refused as a first message.
    const create = gateway.createPost.bind(gateway);
    gateway.createPost = (forumId, post) => {
      gateway.refuseV2Starter = !JSON.stringify(post.message).includes(EGG);
      return create(forumId, post);
    };
    const outcome = await service.reportRaid(hatching());
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    expect(gateway.converted).toEqual([{ id: postId, direct: true }]);
    expect(gateway.posts.get(postId)?.attachments).toEqual([]);
    // Refused once, on the first way: the edit of the line goes without the file at once.
    expect(gateway.filesRefused).toBe(1);
    expect(gateway.posts.get(postId)?.edits).toBe(1);
  });
});
