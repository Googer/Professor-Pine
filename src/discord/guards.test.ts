import { describe, expect, it } from 'vitest';
import {
  FAKE_CHANNEL_ID,
  FAKE_PARENT_ID,
  fakeAutocomplete,
  fakeChatInput,
} from '../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { partyStoreWith, testMeetup, testRaid, testTrain } from '../../test/support/parties.js';
import { TestRegions } from '../../test/support/party-service.js';
import {
  TEST_PVP_CATEGORY,
  TEST_SERVER_CHANNELS,
  TestServers,
  testServerValues,
} from '../../test/support/server-values.js';
import { createTestContext } from '../../test/support/test-context.js';
import type { GuardableInteraction, LocatedInteraction } from './command.js';
import { UserError } from './errors.js';
import {
  guildIdOf,
  isBotChannel,
  isBotManagement,
  isManagement,
  isPvpContext,
  isStaffRoleName,
  partyOf,
  raidOf,
  regionChannelOf,
  requireBotChannel,
  requireBotManagement,
  requireGuild,
  requireManagement,
  requireMeetup,
  requireParty,
  requirePvpContext,
  requireRaid,
  requireRegion,
  requireTimed,
} from './guards.js';

const OWNER = '223456789012345678'; // TEST_ENV.OWNER_ID
const USER = '700000000000000001';
const { ctx } = createTestContext();
const values = testServerValues();
const BOT_LAB = TEST_SERVER_CHANNELS['bot-lab'];
const as = (fake: unknown) => fake as GuardableInteraction;

describe('role checks', () => {
  it('treats admin and moderator roles as management, case-insensitively', () => {
    expect(isManagement(['Admin'], USER, OWNER)).toBe(true);
    expect(isManagement(['MODERATOR'], USER, OWNER)).toBe(true);
    expect(isManagement(['bot developer'], USER, OWNER)).toBe(false);
  });

  it('knows the names that make a role one of its staff, as the guards compare them', () => {
    for (const name of ['admin', 'Moderator', 'BOT DEVELOPER']) {
      expect(isStaffRoleName(name), name).toBe(true);
      expect(isBotManagement([name], USER, OWNER), name).toBe(true);
    }
    // Lower case and nothing else: no accents, no spaces around it.
    for (const name of ['Admins', ' admin', 'modérator', 'North', '']) {
      expect(isStaffRoleName(name), name).toBe(false);
      expect(isBotManagement([name], USER, OWNER), name).toBe(false);
    }
  });

  it('treats the owner as management with no roles', () => {
    expect(isManagement([], OWNER, OWNER)).toBe(true);
  });

  it('adds bot developer for bot management', () => {
    expect(isBotManagement(['Bot Developer'], USER, OWNER)).toBe(true);
    expect(isBotManagement(['member'], USER, OWNER)).toBe(false);
  });
});

describe('channel checks', () => {
  it("recognises both bot channels by the server's ids, whatever their names", () => {
    expect(isBotChannel(BOT_LAB, values)).toBe(true);
    expect(isBotChannel(TEST_SERVER_CHANNELS['mod-bot-lab'], values)).toBe(true);
    expect(isBotChannel(FAKE_CHANNEL_ID, values)).toBe(false);
    expect(isBotChannel(undefined, values)).toBe(false);
    expect(isBotChannel(BOT_LAB, testServerValues({ channels: {} }))).toBe(false);
  });

  it("allows PvP commands in DMs and under the server's PvP category", () => {
    expect(isPvpContext({ isDm: true, categoryId: undefined }, undefined)).toBe(true);
    expect(isPvpContext({ isDm: false, categoryId: TEST_PVP_CATEGORY }, values)).toBe(true);
    expect(isPvpContext({ isDm: false, categoryId: FAKE_PARENT_ID }, values)).toBe(false);
    expect(isPvpContext({ isDm: false, categoryId: undefined }, values)).toBe(false);
  });
});

describe('guards', () => {
  it('requireGuild refuses DMs', () => {
    expect(() => requireGuild(as(fakeChatInput({ isDm: true })), ctx)).toThrow(UserError);
    expect(() => requireGuild(as(fakeChatInput()), ctx)).not.toThrow();
  });

  it('requireManagement checks the member roles', () => {
    expect(() => requireManagement(as(fakeChatInput({ roleNames: ['member'] })), ctx)).toThrow(
      UserError,
    );
    expect(() =>
      requireManagement(as(fakeChatInput({ roleNames: ['moderator'] })), ctx),
    ).not.toThrow();
  });

  it('requireBotManagement accepts bot developers', () => {
    expect(() =>
      requireBotManagement(as(fakeChatInput({ roleNames: ['bot developer'] })), ctx),
    ).not.toThrow();
  });

  it('requireBotChannel names the channel to use', () => {
    expect(() => requireBotChannel(as(fakeChatInput({ channelName: 'the-bot-lab' })), ctx)).toThrow(
      `Use this in <#${BOT_LAB}>.`,
    );
    expect(() => requireBotChannel(as(fakeChatInput({ channelId: BOT_LAB })), ctx)).not.toThrow();
  });

  it('requireBotChannel says that staff have set no bot lab in a server without one', () => {
    const { ctx: unset } = createTestContext({
      servers: new TestServers(testServerValues({ channels: {} })),
    });
    // `/admin settings` named only to staff (review F11).
    expect(() => requireBotChannel(as(fakeChatInput({ channelId: BOT_LAB })), unset)).toThrow(
      /^This server has no bot lab yet\.$/u,
    );
    const staff = fakeChatInput({ channelId: BOT_LAB, roleNames: ['Moderator'] });
    expect(() => requireBotChannel(as(staff), unset)).toThrow(
      'This server has no bot lab yet: staff set one with /admin settings.',
    );
  });

  it('requireBotChannel also holds in a thread of the bot channel', () => {
    const inThread = fakeChatInput({
      channelName: 'How do I add a gym?',
      thread: { parentId: BOT_LAB, parentName: 'renamed-lab' },
    });
    expect(() => requireBotChannel(as(inThread), ctx)).not.toThrow();
    const elsewhere = fakeChatInput({
      channelName: 'the-bot-lab',
      thread: { parentName: 'the-bot-lab' },
    });
    expect(() => requireBotChannel(as(elsewhere), ctx)).toThrow(UserError);
  });

  it("requirePvpContext uses the parent category, named in the server's words", () => {
    expect(() =>
      requirePvpContext(as(fakeChatInput({ parentName: 'PVP CHAT AND TOURNAMENTS' })), ctx),
    ).toThrow(`Use this in a DM with me or under <#${TEST_PVP_CATEGORY}>.`);
    expect(() => requirePvpContext(as(fakeChatInput({ isDm: true })), ctx)).not.toThrow();
    expect(() =>
      requirePvpContext(as(fakeChatInput({ parentId: TEST_PVP_CATEGORY })), ctx),
    ).not.toThrow();
    const { ctx: unset } = createTestContext({
      servers: new TestServers(testServerValues({ categories: {} })),
    });
    expect(() =>
      requirePvpContext(as(fakeChatInput({ parentId: TEST_PVP_CATEGORY })), unset),
    ).toThrow('Use this in a DM with me.');
  });

  it('requirePvpContext holds in a thread under the PvP category and in an uncached DM', () => {
    const thread = fakeChatInput({
      thread: { parentName: 'rank-checker', categoryId: TEST_PVP_CATEGORY },
    });
    expect(() => requirePvpContext(as(thread), ctx)).not.toThrow();
    expect(() =>
      requirePvpContext(as(fakeChatInput({ isDm: true, uncachedChannel: true })), ctx),
    ).not.toThrow();
    expect(() => requirePvpContext(as(fakeChatInput({ uncachedChannel: true })), ctx)).toThrow(
      UserError,
    );
  });

  it('finds the region of a region channel and of a thread in it', () => {
    const inChannel = fakeChatInput({ channelId: WEST_CHANNEL });
    expect(regionChannelOf(as(inChannel), ctx)).toBe(WEST_CHANNEL);
    const inThread = fakeChatInput({ thread: { parentId: WEST_CHANNEL } });
    expect(regionChannelOf(as(inThread), ctx)).toBe(WEST_CHANNEL);
    expect(regionChannelOf(as(fakeChatInput()), ctx)).toBeUndefined();
    expect(regionChannelOf(as(fakeChatInput({ uncachedChannel: true })), ctx)).toBeUndefined();
  });

  it('finds the region of an autocomplete in a region channel', () => {
    const autocomplete = fakeAutocomplete({ channelId: WEST_CHANNEL });
    expect(regionChannelOf(autocomplete as unknown as LocatedInteraction, ctx)).toBe(WEST_CHANNEL);
  });

  it('regionChannelOf also knows a region by its forum and by a post in that forum', () => {
    expect(regionChannelOf(as(fakeChatInput({ channelId: WEST_FORUM })), ctx)).toBe(WEST_CHANNEL);
    const inPost = fakeChatInput({ thread: { parentId: WEST_FORUM } });
    expect(regionChannelOf(as(inPost), ctx)).toBe(WEST_CHANNEL);
    expect(() => requireRegion(as(inPost), ctx)).not.toThrow();
    const elsewhere = fakeChatInput({ thread: { parentId: '100000000000000099' } });
    expect(regionChannelOf(as(elsewhere), ctx)).toBeUndefined();
  });

  it('gives no region for the forum of a region without an outline', () => {
    const regions = new TestRegions();
    const unbounded = regions.rows[2];
    if (!unbounded) throw new Error('no region');
    unbounded.forumChannelId = '100000000000000041';
    const { ctx: withForum } = createTestContext({ regions });
    expect(
      regionChannelOf(as(fakeChatInput({ channelId: '100000000000000041' })), withForum),
    ).toBeUndefined();
  });

  it('guildIdOf gives the server of an interaction, and refuses like the guards without one', () => {
    expect(guildIdOf({ guildId: '100000000000000001' })).toBe('100000000000000001');
    expect(() => guildIdOf({ guildId: null })).toThrow(UserError);
    expect(() => guildIdOf({ guildId: null })).toThrow('This only works in a server.');
  });

  it('requireRegion refuses anywhere else, and DMs', () => {
    expect(() => requireRegion(as(fakeChatInput({ channelId: WEST_CHANNEL })), ctx)).not.toThrow();
    expect(() => requireRegion(as(fakeChatInput()), ctx)).toThrow('Use this in a region channel.');
    expect(() => requireRegion(as(fakeChatInput({ isDm: true })), ctx)).toThrow(
      'This only works in a server.',
    );
  });
});

describe('party posts', () => {
  const POST = '300000000000000001';

  async function withParty() {
    const raid = { ...testRaid(), forumPostId: POST };
    const { store } = await partyStoreWith([raid]);
    return { raid, ctx: createTestContext({ parties: store }).ctx };
  }

  it('partyOf finds the party by the id of its post, cached or not', async () => {
    const { raid, ctx: withRaid } = await withParty();
    const inPost = fakeChatInput({ channelId: POST, thread: {} });
    expect(partyOf(as(inPost), withRaid)).toBe(raid);
    const uncached = fakeChatInput({ channelId: POST, uncachedChannel: true });
    expect(partyOf(as(uncached), withRaid)).toBe(raid);
    const autocomplete = fakeAutocomplete({ channelId: POST, thread: {} });
    expect(partyOf(autocomplete as unknown as LocatedInteraction, withRaid)).toBe(raid);
    expect(partyOf(as(fakeChatInput({ channelId: WEST_CHANNEL })), withRaid)).toBeUndefined();
    expect(partyOf(as(fakeChatInput({ isDm: true })), withRaid)).toBeUndefined();
  });

  it('requireParty passes in the post of an active party and refuses anywhere else', async () => {
    const { ctx: withRaid } = await withParty();
    expect(() =>
      requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), withRaid),
    ).not.toThrow();
    expect(() => requireParty(as(fakeChatInput({ channelId: WEST_CHANNEL })), withRaid)).toThrow(
      'Use this in the post of a raid, max battle, train or meetup that is still active.',
    );
    expect(() => requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), ctx)).toThrow(
      UserError,
    );
    expect(() => requireParty(as(fakeChatInput({ isDm: true })), withRaid)).toThrow(
      'This only works in a server.',
    );
  });

  const MEETUP_POST = '300000000000000002';

  async function withRaidAndMeetup() {
    const raid = { ...testRaid(), forumPostId: POST };
    const meetup = { ...testMeetup(), forumPostId: MEETUP_POST };
    const { store } = await partyStoreWith([raid, meetup]);
    return { raid, meetup, ctx: createTestContext({ parties: store }).ctx };
  }

  it('requireParty passes in the post of a meetup too', async () => {
    const { meetup, ctx: both } = await withRaidAndMeetup();
    const inMeetup = as(fakeChatInput({ channelId: MEETUP_POST, thread: {} }));
    expect(partyOf(inMeetup, both)).toBe(meetup);
    expect(() => requireParty(inMeetup, both)).not.toThrow();
  });

  it('requireRaid passes in the post of a raid and names the kind of any other post', async () => {
    const { ctx: both } = await withRaidAndMeetup();
    expect(() =>
      requireRaid(as(fakeChatInput({ channelId: POST, thread: {} })), both),
    ).not.toThrow();
    expect(() =>
      requireRaid(as(fakeChatInput({ channelId: MEETUP_POST, thread: {} })), both),
    ).toThrow('This is the post of a meetup: that only works in the post of a raid.');
    expect(() => requireRaid(as(fakeChatInput({ channelId: WEST_CHANNEL })), both)).toThrow(
      'Use this in the post of a raid that is still active.',
    );
    expect(() => requireRaid(as(fakeChatInput({ isDm: true })), both)).toThrow(
      'This only works in a server.',
    );
  });

  it('raidOf finds the raid of a post, and nothing in the post of a meetup', async () => {
    const { raid, ctx: both } = await withRaidAndMeetup();
    expect(raidOf(as(fakeChatInput({ channelId: POST, thread: {} })), both)).toBe(raid);
    expect(raidOf(as(fakeChatInput({ channelId: MEETUP_POST, thread: {} })), both)).toBeUndefined();
    expect(raidOf(as(fakeChatInput({ channelId: WEST_CHANNEL })), both)).toBeUndefined();
  });

  it('takes a train for a party and a timed party, and for neither a raid nor a meetup', async () => {
    const TRAIN_POST = '300000000000000003';
    const train = { ...testTrain(), forumPostId: TRAIN_POST };
    const raid = { ...testRaid(), forumPostId: POST };
    const { store } = await partyStoreWith([raid, train]);
    const { ctx: both } = createTestContext({ parties: store });
    const inTrain = as(fakeChatInput({ channelId: TRAIN_POST, thread: {} }));
    expect(partyOf(inTrain, both)).toBe(train);
    expect(() => requireParty(inTrain, both)).not.toThrow();
    expect(() => requireTimed(inTrain, both)).not.toThrow();
    expect(raidOf(inTrain, both)).toBeUndefined();
    expect(() => requireRaid(inTrain, both)).toThrow(
      'This is the post of a train: that only works in the post of a raid.',
    );
    expect(() => requireMeetup(inTrain, both)).toThrow(
      'This is the post of a train: that only works in the post of a meetup.',
    );
    const inRaid = as(fakeChatInput({ channelId: POST, thread: {} }));
    expect(() => requireTimed(inRaid, both)).toThrow(
      'This is the post of a raid: that only works in the post of a train or meetup.',
    );
    expect(() => requireTimed(as(fakeChatInput({ channelId: WEST_CHANNEL })), both)).toThrow(
      'Use this in the post of a train or meetup that is still active.',
    );
  });
});
