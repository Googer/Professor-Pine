import { ChannelType } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_BOT_ID,
  FakeDiscordApi,
  type FakeApiChannel,
  type FakeApiGuild,
} from '../../test/support/fake-discord-api.js';
import {
  cleanupList,
  deleteListed,
  legacyNameOf,
  type CleanupList,
  type LegacyParty,
} from './legacy-cleanup.js';

const MEMBER = '412345678901234567';

/** A legacy raid's file naming this channel, that ends as raids do. */
const raidFile = (channelId: string): LegacyParty => ({
  channelId,
  type: 'raid',
  name: null,
  createdAt: null,
  signedUp: 0,
  saved: false,
});

describe('legacyNameOf', () => {
  it('knows every name the legacy bot gave a party channel', () => {
    for (const [name, kind] of [
      ['train-made-up-loop', 'train'],
      ['train', 'train'],
      ['meetup-community-day-walk', 'meetup'],
      ['egg-5-pinewood-public-library', 'raid'],
      ['egg-mega-old-stone-fountain', 'raid'],
      ['boss-5-old-stone-fountain', 'raid'],
      ['expired-mewtwo-the-stacks', 'raid'],
      ['expired-5-the-stacks', 'raid'],
      ['ex-raid-harbor-lighthouse-mural', 'raid'],
      ['elite-raid-harbor-lighthouse-mural', 'raid'],
    ] as const) {
      expect(legacyNameOf(name), name).toEqual({ kind, sure: true });
    }
  });

  it('takes a name of two words or more for a hatched raid, unsure: it may be a chat channel', () => {
    expect(legacyNameOf('mewtwo-the-stacks')).toEqual({ kind: 'raid', sure: false });
    expect(legacyNameOf('mr_mime-old-stone-fountain')).toEqual({ kind: 'raid', sure: false });
    expect(legacyNameOf('general')).toBeUndefined();
    expect(legacyNameOf('trainers-chat')).toEqual({ kind: 'raid', sure: false });
  });
});

describe('cleanupList', () => {
  let api: FakeDiscordApi;
  let guild: FakeApiGuild;
  let category: FakeApiChannel;
  let region: FakeApiChannel;

  beforeEach(() => {
    api = new FakeDiscordApi();
    guild = api.addGuild('Pittsburgh');
    category = api.addChannel(guild, 'EAST', { type: ChannelType.GuildCategory });
    region = api.addChannel(guild, 'squirrelbreeze', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
  });

  const list = (
    files: readonly (string | LegacyParty)[] | undefined = [],
    more: { forums?: string[] } = {},
  ) =>
    cleanupList(api, {
      guildId: guild.id,
      botId: FAKE_BOT_ID,
      regionChannelIds: [region.id],
      regionForumIds: more.forums ?? [],
      settingsChannelNames: ['the-bot-lab', 'bot-updates'],
      legacyParties: files?.map((one) => (typeof one === 'string' ? raidFile(one) : one)),
    });
  /** The first message of a legacy raid's channel, as the legacy bot wrote it. */
  const status = {
    author: FAKE_BOT_ID,
    content: `Use <#${'5'.repeat(18)}> to return to this raid's regional channel.`,
  };
  const names = (entries: CleanupList['remove']) => entries.map((entry) => entry.name);

  it('lists the channels the legacy files name, and orphans: party names with the bot first', async () => {
    const named = api.addChannel(guild, 'train-made-up-loop', {
      parentId: category.id,
      messages: [MEMBER],
    });
    api.addChannel(guild, 'egg-5-the-stacks', {
      parentId: category.id,
      messages: [FAKE_BOT_ID, MEMBER],
    });
    api.addChannel(guild, 'mewtwo-the-stacks', { parentId: category.id, messages: [status] });
    const listed = await list([named.id, '512345678901234599']);
    expect(names(listed.remove)).toEqual([
      'train-made-up-loop',
      'egg-5-the-stacks',
      'mewtwo-the-stacks',
    ]);
    expect(listed.remove[0]).toMatchObject({
      channelId: named.id,
      category: 'EAST',
      kind: 'train',
      why: 'a legacy file names it',
    });
    expect(listed.remove[1]?.why).toBe(
      'named like a legacy raid channel, and its first message is the bot’s',
    );
    expect(listed.kept).toEqual([]);
    expect(listed.stays).toEqual([]);
    expect(listed.gone).toBe(1);
    expect(api.onlyRead()).toBe(true);
  });

  it('never lists a channel of the settings, a region channel or a forum, even one a file names', async () => {
    const lab = api.addChannel(guild, 'the-bot-lab', { parentId: category.id, messages: [status] });
    api.addChannel(guild, 'bot-updates', { parentId: category.id, messages: [FAKE_BOT_ID] });
    const forum = api.addChannel(guild, 'squirrelbreeze-meetups', {
      type: ChannelType.GuildText,
      parentId: category.id,
      messages: [status],
    });
    const listed = await list([lab.id, region.id, forum.id], { forums: [forum.id] });
    expect(listed).toMatchObject({ remove: [], kept: [] });
  });

  it('keeps for a person a hatched raid’s name the bot wrote first, unless it wrote a legacy status', async () => {
    api.addChannel(guild, 'mewtwo-the-stacks', { parentId: category.id, messages: [FAKE_BOT_ID] });
    api.addChannel(guild, 'kyogre-the-pier', { parentId: category.id, messages: [status] });
    const listed = await list();
    expect(names(listed.remove)).toEqual(['kyogre-the-pier']);
    expect(listed.remove[0]?.why).toBe(
      'named like a legacy raid channel, and its first message is the legacy bot’s status',
    );
    expect(listed.kept.map((entry) => [entry.name, entry.why])).toEqual([
      [
        'mewtwo-the-stacks',
        'named like a legacy raid channel and the bot wrote first, but not a legacy status',
      ],
    ]);
  });

  it('never looks for orphans among channels in no category, where region channels are', async () => {
    const lonely = api.addChannel(guild, 'downtown', { messages: [FAKE_BOT_ID] });
    api.addChannel(guild, 'train-loop', { messages: [FAKE_BOT_ID] });
    const named = api.addChannel(guild, 'meetup-picnic', { messages: [MEMBER] });
    const listed = await cleanupList(api, {
      guildId: guild.id,
      botId: FAKE_BOT_ID,
      regionChannelIds: [lonely.id],
      regionForumIds: [],
      settingsChannelNames: [],
      legacyParties: [raidFile(named.id)],
    });
    expect(names(listed.remove)).toEqual(['meetup-picnic']);
    expect(listed.kept).toEqual([]);
  });

  it('never lists a region channel, nor a channel outside the categories of the regions', async () => {
    api.addChannel(guild, 'meetup-picnic', { messages: [FAKE_BOT_ID] });
    const other = api.addChannel(guild, 'WEST', { type: ChannelType.GuildCategory });
    api.addChannel(guild, 'train-loop', { parentId: other.id, messages: [FAKE_BOT_ID] });
    const listed = await list();
    expect(listed).toMatchObject({ remove: [], kept: [] });
  });

  it('scans the category of a channel a file names, beyond the regions’ categories', async () => {
    const other = api.addChannel(guild, 'WEST', { type: ChannelType.GuildCategory });
    const named = api.addChannel(guild, 'train-loop', { parentId: other.id, messages: [] });
    api.addChannel(guild, 'meetup-picnic', { parentId: other.id, messages: [FAKE_BOT_ID] });
    expect(names((await list([named.id])).remove)).toEqual(['train-loop', 'meetup-picnic']);
  });

  it('keeps for a person what looks like a party channel but is not surely one', async () => {
    api.addChannel(guild, 'train-made-up-loop', { parentId: category.id, messages: [MEMBER] });
    api.addChannel(guild, 'meetup-picnic', { parentId: category.id, messages: [] });
    api.addChannel(guild, 'bot-notes', { parentId: category.id, messages: [FAKE_BOT_ID] }).name =
      'notes';
    const unreadable = api.addChannel(guild, 'egg-5-the-stacks', { parentId: category.id });
    unreadable.unreadable = true;
    // A chat channel named like a hatched raid, whose first message is a member's: not listed.
    api.addChannel(guild, 'trainers-chat', { parentId: category.id, messages: [MEMBER] });
    const listed = await list();
    expect(listed.remove).toEqual([]);
    expect(listed.kept.map((entry) => [entry.name, entry.why])).toEqual([
      [
        'train-made-up-loop',
        'named like a legacy train channel, but its first message is not the bot’s',
      ],
      ['meetup-picnic', 'named like a legacy meetup channel, but it has no messages'],
      ['notes', 'its first message is the bot’s, but its name is no legacy party name'],
      ['egg-5-the-stacks', 'named like a legacy raid channel, but I may not read its messages'],
    ]);
  });
});

describe('cleanupList at the cutover', () => {
  let api: FakeDiscordApi;
  let guild: FakeApiGuild;
  let category: FakeApiChannel;
  let region: FakeApiChannel;

  beforeEach(() => {
    api = new FakeDiscordApi();
    guild = api.addGuild('Pittsburgh');
    category = api.addChannel(guild, 'EAST', { type: ChannelType.GuildCategory });
    region = api.addChannel(guild, 'squirrelbreeze', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
  });

  const list = (legacyParties: readonly LegacyParty[] | undefined) =>
    cleanupList(api, {
      guildId: guild.id,
      botId: FAKE_BOT_ID,
      regionChannelIds: [region.id],
      regionForumIds: [],
      settingsChannelNames: [],
      legacyParties,
    });

  it('leaves the channels of legacy trains, meetups and saved parties, with their name, age and sign-ups', async () => {
    const train = api.addChannel(guild, 'train-made-up-discussion', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
    const meetup = api.addChannel(guild, 'meetup-made-up-signups', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
    const saved = api.addChannel(guild, 'boss-5-the-stacks', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
    const raid = api.addChannel(guild, 'egg-5-the-pier', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
    const listed = await list([
      {
        channelId: train.id,
        type: 'raid train',
        name: 'Made-up discussion',
        createdAt: 1_560_000_000_000,
        signedUp: 51,
        saved: false,
      },
      {
        channelId: meetup.id,
        type: 'meet-up',
        name: 'Made-up signups',
        createdAt: null,
        signedUp: 0,
        saved: false,
      },
      { ...raidFile(saved.id), createdAt: 1_600_000_000_000, signedUp: 3, saved: true },
      raidFile(raid.id),
      // A train whose channel is gone: counted as gone, as any other.
      { ...raidFile('512345678901234599'), type: 'raid train' },
    ]);
    expect(listed.remove.map((entry) => entry.name)).toEqual(['egg-5-the-pier']);
    expect(listed.kept).toEqual([]);
    expect(listed.stays).toEqual([
      {
        channelId: train.id,
        name: 'train-made-up-discussion',
        category: 'EAST',
        kind: 'train',
        why: 'a legacy train',
        party: { name: 'Made-up discussion', createdAt: 1_560_000_000_000, signedUp: 51 },
      },
      {
        channelId: meetup.id,
        name: 'meetup-made-up-signups',
        category: 'EAST',
        kind: 'meetup',
        why: 'a legacy meetup',
        party: { name: 'Made-up signups', createdAt: null, signedUp: 0 },
      },
      {
        channelId: saved.id,
        name: 'boss-5-the-stacks',
        category: 'EAST',
        kind: 'raid',
        why: 'a raid saved with !save-party',
        party: { name: null, createdAt: 1_600_000_000_000, signedUp: 3 },
      },
    ]);
    expect(listed.gone).toBe(1);
    expect(api.onlyRead()).toBe(true);
  });

  it('without the legacy files, leaves to a person a train or meetup the bot wrote first: it may be open', async () => {
    api.addChannel(guild, 'train-made-up-discussion', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
    api.addChannel(guild, 'meetup-made-up-signups', {
      parentId: category.id,
      messages: [FAKE_BOT_ID],
    });
    api.addChannel(guild, 'egg-5-the-pier', { parentId: category.id, messages: [FAKE_BOT_ID] });
    const unread = await list(undefined);
    expect(unread.remove.map((entry) => entry.name)).toEqual(['egg-5-the-pier']);
    expect(unread.kept.map((entry) => [entry.name, entry.why])).toEqual([
      [
        'train-made-up-discussion',
        'named like a legacy train channel, and its first message is the bot’s, but without the legacy files I cannot tell whether it is still open',
      ],
      [
        'meetup-made-up-signups',
        'named like a legacy meetup channel, and its first message is the bot’s, but without the legacy files I cannot tell whether it is still open',
      ],
    ]);
    // With the files read, a train no file names is an orphan, deleted as before.
    expect((await list([])).remove.map((entry) => entry.name)).toEqual([
      'train-made-up-discussion',
      'meetup-made-up-signups',
      'egg-5-the-pier',
    ]);
  });
});

describe('deleteListed', () => {
  it('deletes one channel after the other, skips one that is gone, and says what failed', async () => {
    const api = new FakeDiscordApi();
    const guild = api.addGuild('Pittsburgh');
    const one = api.addChannel(guild, 'train-a');
    const two = api.addChannel(guild, 'train-b');
    const waits: number[] = [];
    const entry = (channel: { id: string; name: string }) => ({
      channelId: channel.id,
      name: channel.name,
      category: null,
      kind: 'train' as const,
      why: 'a legacy file names it',
    });
    guild.channels = guild.channels.filter((channel) => channel.id !== two.id);
    const failing = {
      channelId: '512345678901234598',
      name: 'meetup-x',
      category: null,
      kind: 'meetup' as const,
      why: 'x',
    };
    const done = await deleteListed(api, [entry(one), entry(two)], {
      pauseMs: 1_000,
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      reason: 'Legacy party channel',
    });
    expect(done.deleted.map((one) => one.name)).toEqual(['train-a']);
    expect(done.gone.map((one) => one.name)).toEqual(['train-b']);
    expect(done.failed).toEqual([]);
    expect(waits).toEqual([1_000]);
    expect(api.requests.filter((request) => request.method === 'DELETE')).toEqual([
      { method: 'DELETE', route: `/channels/${one.id}`, reason: 'Legacy party channel' },
      { method: 'DELETE', route: `/channels/${two.id}`, reason: 'Legacy party channel' },
    ]);

    api.failWith = new Error('503: Service Unavailable');
    const failed = await deleteListed(api, [failing], {
      pauseMs: 0,
      wait: () => Promise.resolve(),
      reason: 'x',
    });
    expect(failed.failed).toEqual([{ entry: failing, reason: '503: Service Unavailable' }]);
  });
});
