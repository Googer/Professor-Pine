import { PermissionFlagsBits as P } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { RecordingDms } from '../../test/support/dms.js';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { REPORTER } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { hiddenForumOverwrites } from '../discord/party-gateway.js';
import { PartyStatus } from '../domain/party/status.js';
import { DM_PRIORITY } from './dm-sender.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings } from '../config/settings.js';
import {
  Rehearsal,
  RehearsalDms,
  rehearsalGateway,
  rehearsalModeratorsGateway,
  rehearsalPosts,
  servedSettings,
} from './rehearsal.js';

const MATT = '412345678901234501';
const MOD = '412345678901234502';
const MEMBER = '412345678901234503';

const rehearsal = new Rehearsal({
  allowlist: [MATT],
  regions: ['west'],
  staffRoles: ['Moderator'],
});

describe('Rehearsal', () => {
  it('admits the allowlist and staff, by Manage Server or a staff role, and nobody else', () => {
    expect(rehearsal.admits({ userId: MATT, permissions: 0n, roleNames: [] })).toBe(true);
    expect(rehearsal.admits({ userId: MOD, permissions: P.ManageGuild, roleNames: [] })).toBe(true);
    expect(rehearsal.admits({ userId: MOD, permissions: P.Administrator, roleNames: [] })).toBe(
      true,
    );
    expect(rehearsal.admits({ userId: MOD, permissions: 0n, roleNames: ['Moderator'] })).toBe(true);
    expect(
      rehearsal.admits({ userId: MEMBER, permissions: P.SendMessages, roleNames: ['Valor'] }),
    ).toBe(false);
    expect(rehearsal.admits({ userId: MEMBER, permissions: null, roleNames: [] })).toBe(false);
  });

  it('takes a staff role by the same name as the hidden forums do: trimmed, any case', () => {
    const MODS = '412345678901234599';
    const asker = { userId: MEMBER, permissions: 0n, roleNames: [' moderator '] };
    const set = hiddenForumOverwrites(
      {
        everyoneId: '412345678901234590',
        botId: '412345678901234591',
        botHas: 0n,
        roles: [{ id: MODS, name: ' moderator ', permissions: 0n }],
      },
      rehearsal.forumAccess,
    );
    // Seen by the role, so answered too: one staff role, one rule.
    expect(set.some((one) => one.id === MODS)).toBe(true);
    expect(rehearsal.admits(asker)).toBe(true);
  });

  it('serves no web pages in rehearsal mode, and the settings as they are otherwise', () => {
    const settings = loadSettings(TEST_SETTINGS_PATH);
    const web = {
      port: 8080,
      host: '0.0.0.0',
      publicUrl: 'https://map.example.test',
      trustProxy: true,
      tiles: 'osm' as const,
    };
    const both = { ...settings, web, rehearsal: rehearsal.settings };
    expect(servedSettings(both).web).toBeUndefined();
    expect(servedSettings(both).rehearsal).toEqual(rehearsal.settings);
    const plain = { ...settings, web };
    expect(servedSettings(plain)).toBe(plain);
  });

  it('rehearses only the regions whose channels it names', () => {
    expect(rehearsal.rehearses('west')).toBe(true);
    expect(rehearsal.rehearses('east')).toBe(false);
    expect(rehearsal.rehearses(undefined)).toBe(false);
  });
});

describe('RehearsalDms', () => {
  const job = (userId: string) => ({
    userId,
    message: { content: 'A raid you want' },
    priority: DM_PRIORITY.normal,
    eventAt: 0,
    expiresAt: 1,
  });

  it('delivers to the allowlist only, and logs one count of what it dropped a minute', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const inner = new RecordingDms();
      const { log, entries } = createTestLogger();
      const dms = new RehearsalDms(inner, rehearsal, log);
      dms.send(job(MEMBER));
      dms.send(job(MATT));
      dms.send(job(MOD));
      expect(inner.recipients).toEqual([MATT]);
      expect(entries).toEqual([]);
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(60_000);
      expect(entries.map((entry) => [entry.msg, entry.dropped])).toEqual([
        ['rehearsal: direct messages to members not on the allowlist were dropped', 2],
      ]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs the count so far at once when flushed (the shutdown), and nothing more later', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { log, entries } = createTestLogger();
      const dms = new RehearsalDms(new RecordingDms(), rehearsal, log);
      dms.flush();
      expect(entries).toEqual([]);
      dms.send(job(MEMBER));
      dms.flush();
      expect(entries.map((entry) => entry.dropped)).toEqual([1]);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(entries).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('rehearsalGateway', () => {
  /** The party services over a gateway that rehearses the region West. */
  async function rehearsed() {
    const { log, entries } = createTestLogger();
    const fake = new FakePartyGateway();
    fake.channelNames.set(WEST_CHANNEL, 'west');
    fake.channelNames.set(EAST_CHANNEL, 'east');
    const later: { made?: Awaited<ReturnType<typeof partyServiceWith>> } = {};
    const gateway = rehearsalGateway(
      fake,
      rehearsalPosts({
        rehearsal,
        byPost: (postId) => later.made?.store.byPost(postId),
        regions: () => later.made?.regions.all() ?? [],
        channelName: (channelId) => fake.channelName(channelId),
      }),
      log,
    );
    later.made = await partyServiceWith([], {}, { gateway });
    return { ...later.made, fake, entries };
  }

  const report = (gymId: number) => {
    const gym = gymsFixture().get(gymId);
    if (!gym) throw new Error(`no gym ${gymId}`);
    return {
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5' as const, shadow: false },
      boss: null,
    };
  };

  it('makes the post of a raid in a rehearsed region, but posts no link in the region channel', async () => {
    const { service, fake, entries } = await rehearsed();
    const outcome = await service.reportRaid(report(1));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    expect(fake.postsIn(WEST_FORUM).map((post) => post.id)).toContain(outcome.party.forumPostId);
    expect(fake.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(outcome.party.regionLinkMessageId).toBeNull();
    expect(entries.map((entry) => entry.msg)).toContain(
      'rehearsal: no message outside the posts of parties',
    );
  });

  it('lets a message into the post of a rehearsed party, and into no other channel', async () => {
    const { service, gateway, fake } = await rehearsed();
    const outcome = await service.reportRaid(report(1));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    expect(await gateway.sendMessage(postId, { content: 'Raid is starting' })).toBeDefined();
    expect(fake.messagesIn(postId).map((one) => one.message.content)).toContain('Raid is starting');
    expect(await gateway.sendMessage('100000000000000099', { content: 'Bosses changed' })).toBe(
      undefined,
    );
    expect(fake.messagesIn('100000000000000099')).toEqual([]);
  });

  it('deletes a reported message only in the post of a rehearsed party', async () => {
    const { service, gateway, fake, entries } = await rehearsed();
    const outcome = await service.reportRaid(report(1));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    expect(await gateway.deleteReported(postId, '800000000000000001')).toBe('deleted');
    expect(await gateway.deleteReported(WEST_CHANNEL, '800000000000000002')).toBe('not-allowed');
    expect(fake.deleted.map((one) => one.messageId)).not.toContain('800000000000000002');
    expect(entries.map((entry) => entry.msg)).toContain(
      'rehearsal: no member’s message is deleted outside the posts of parties',
    );
  });

  it('deletes many messages at once only in the post of a rehearsed party (review W2)', async () => {
    const { service, gateway, fake, entries, regions } = await rehearsed();
    const outcome = await service.reportRaid(report(1));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    const inPost = [fake.write(postId, MEMBER), fake.write(postId, MEMBER)];
    expect(await gateway.bulkDelete(postId, inPost)).toBe('deleted');
    // The rehearsed region's board, where members of production write: never, answered as a
    // refused permission.
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = west.summaryMessageId ?? '';
    expect(fake.posts.has(board)).toBe(true);
    const outside = [fake.write(board, MEMBER), fake.write(board, MEMBER)];
    expect(await gateway.bulkDelete(board, outside)).toBe('not-allowed');
    expect(fake.bulkDeleted).toEqual([inPost]);
    expect(entries.map((entry) => entry.msg)).toContain(
      'rehearsal: no member’s message is deleted outside the posts of parties',
    );
  });

  it('removes no reactions outside the posts of parties, the board’s included (plan 8R-9G)', async () => {
    const { service, gateway, fake, entries, regions } = await rehearsed();
    // The rehearsed region's board, where members of production react.
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    const board = west.summaryMessageId ?? '';
    fake.react(board);
    const edits = fake.posts.get(board)?.edits ?? 0;
    // A raid changes the summary: its edit asks to remove the reactions, which the rehearsal drops.
    const outcome = await service.reportRaid(report(1));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await service.flush();
    expect(fake.posts.get(board)?.edits).toBeGreaterThan(edits);
    expect(await gateway.clearReactions(board, board)).toBe('not-allowed');
    expect(fake.reactions.get(board)).toBe(1);
    expect(fake.reactionsCleared).toEqual([]);
    // Said once per channel, not at every edit of the board (review R-F3).
    expect(fake.posts.get(board)?.message).toBeDefined();
    await gateway.editPost(board, fake.posts.get(board)!.message, { clearReactions: true });
    expect(
      entries.filter(
        (entry) => entry.msg === 'rehearsal: no reactions are removed outside the posts of parties',
      ),
    ).toHaveLength(1);
    // In the post of a rehearsed party, as asked.
    const postId = outcome.party.forumPostId ?? '';
    fake.react(postId);
    expect(await gateway.clearReactions(postId, postId)).toBe('cleared');
    expect(fake.reactionsCleared).toEqual([postId]);
  });

  it('unpins only in the post of a rehearsed party', async () => {
    const { service, gateway, fake, entries } = await rehearsed();
    const outcome = await service.reportRaid(report(1));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    const inPost = (await fake.sendMessage(postId, { content: 'Raid is starting' })) ?? '';
    fake.pin(postId, inPost);
    expect(await gateway.unpinMessage(postId, inPost)).toBe(true);
    expect(fake.pinnedIn(postId)).toEqual([]);
    // A member's message in the region channel, pinned by somebody else.
    const other = (await fake.sendMessage(WEST_CHANNEL, { content: 'Rules' })) ?? '';
    fake.pin(WEST_CHANNEL, other);
    expect(await gateway.unpinMessage(WEST_CHANNEL, other)).toBe(false);
    expect(fake.pinnedIn(WEST_CHANNEL)).toEqual([other]);
    expect(entries.map((entry) => entry.msg)).toContain(
      'rehearsal: no message is unpinned outside the posts',
    );
  });

  it('lets the moderators’ posts of meetup safety into their channel, and nothing else beside', async () => {
    const { log } = createTestLogger();
    const fake = new FakePartyGateway();
    fake.addChannel(MOD_CHANNEL, 'meetup-review');
    fake.addChannel(WEST_CHANNEL, 'west');
    // A forum (or any channel that is no text channel) of that name is not the one.
    const forum = '600000000000000778';
    fake.addChannel(forum, 'meetup-review', { kind: 'forum' });
    const guarded = rehearsalGateway(
      fake,
      rehearsalPosts({
        rehearsal,
        byPost: () => undefined,
        regions: () => [],
        channelName: (channelId) => fake.channelName(channelId),
      }),
      log,
    );
    // The moderators' channel by its server's values (plan 19A-1): the forum is not it.
    const safety = rehearsalModeratorsGateway(
      guarded,
      fake,
      (channelId) => channelId === MOD_CHANNEL || channelId === forum,
      log,
    );
    expect(await safety.sendMessage(MOD_CHANNEL, { content: 'Meetup waiting' })).toBeDefined();
    expect(await safety.sendMessage(forum, { content: 'Meetup waiting' })).toBeUndefined();
    expect(await safety.sendMessage(WEST_CHANNEL, { content: 'New meetup' })).toBeUndefined();
    // The rest of the bot (the boss list, bot updates) posts through the rehearsal's gateway:
    // nothing of it reaches that channel, whatever its name.
    expect(await guarded.sendMessage(MOD_CHANNEL, { content: 'Bosses changed' })).toBeUndefined();
    expect(fake.messagesIn(MOD_CHANNEL).map((one) => one.message.content)).toEqual([
      'Meetup waiting',
    ]);
  });

  it('makes no post in the forum of a region it does not rehearse, nor a forum for it', async () => {
    const { service, gateway, fake, store } = await rehearsed();
    // Gym 8 lies in East: the report is refused as one where the forum is gone, leaving nothing.
    expect(await service.reportRaid(report(8))).toMatchObject({ kind: 'no-forum' });
    expect(fake.postsIn(EAST_FORUM)).toEqual([]);
    expect(store.active()).toEqual([]);
    expect(
      await gateway.createPost(EAST_FORUM, { title: 'x', message: { content: 'x' }, tagIds: [] }),
    ).toBe(undefined);
    expect(await gateway.createForum(EAST_CHANNEL, 'east-meetups', [])).toBe(undefined);
    // Never one members could see: a forum is made only hidden.
    expect(await gateway.createForum(WEST_CHANNEL, 'west-meetups', [])).toBe(undefined);
    expect(
      await gateway.createForum(WEST_CHANNEL, 'west-meetups', [], rehearsal.forumAccess),
    ).toBeDefined();
  });

  it('makes no category or text channel, and deletes only a forum it made itself', async () => {
    const { gateway, fake } = await rehearsed();
    expect(await gateway.createCategory(fake.guildId, 'new region')).toEqual({
      ok: false,
      reason: 'no-permission',
    });
    expect(await gateway.createTextChannel(fake.guildId, 'new-region', null)).toEqual({
      ok: false,
      reason: 'no-permission',
    });
    expect(fake.calls.filter((call) => /^create(Category|TextChannel)/.test(call))).toEqual([]);
    await gateway.deleteChannel(EAST_CHANNEL);
    await gateway.deleteChannel(WEST_FORUM);
    expect(fake.deletedChannels).toEqual([]);
    const made = await gateway.createForum(WEST_CHANNEL, 'west-meetups', [], rehearsal.forumAccess);
    await gateway.deleteChannel(made?.forumId ?? '');
    expect(fake.deletedChannels).toEqual([made?.forumId]);
  });
});
