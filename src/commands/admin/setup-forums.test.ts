import {
  DiscordAPIError,
  OverwriteType,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import { FakePartyGateway, missingPermissions } from '../../../test/support/fake-gateway.js';
import { watchEachTest } from '../../../test/support/timers.js';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { testRaid } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { endParty } from '../../domain/party/party.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
import { loadSettings, type Settings } from '../../config/settings.js';
import { InteractionRouter } from '../../discord/router.js';
import { FORUM_TAGS } from '../../render/party-post.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { EventForumService } from '../../services/event-forum.js';
import { MemoryEventForums } from '../../../test/support/event-forum-store.js';
import { admin } from './index.js';
import {
  TEST_SERVER_CHANNELS,
  type TestServers,
  testServerValues,
} from '../../../test/support/server-values.js';

/** The server's bot-updates channel, beside which the events forum is made (plan 8V-1). */
const BOT_UPDATES = '500000000000000010';

/** The server's staff chose this forum as its events forum in `/admin settings`. */
function chooseForum(servers: TestServers, forumId: string): void {
  servers.values = {
    ...servers.values,
    channels: { ...servers.values.channels, events: forumId },
  };
}

async function setup(
  changed: Partial<Settings> = {},
  rehearsal?: Rehearsal,
  options: { events?: boolean; feedUnread?: boolean } = {},
) {
  const made = await partyServiceWith([], {
    settings: { ...loadSettings(TEST_SETTINGS_PATH), ...changed },
    ...(rehearsal ? { rehearsal } : {}),
  });
  // The events forum (plan 8V-1); never in rehearsal mode. Beside the server's channel for bot
  // updates (plan 19A-1: by id, in its values).
  const loaded = loadSettings(TEST_SETTINGS_PATH);
  made.gateway.addChannel(BOT_UPDATES, 'bot-updates');
  made.servers.values = testServerValues({
    channels: { ...TEST_SERVER_CHANNELS, 'bot-updates': BOT_UPDATES },
  });
  const eventForum =
    options.events === true
      ? new EventForumService({
          gateway: made.gateway,
          store: new MemoryEventForums(),
          events: {
            listedEvents: () => [],
            onListedChange: () => undefined,
            listingKnown: () => options.feedUnread !== true,
            droppedIds: () => new Set<string>(),
          },
          settings: loaded,
          servers: made.servers,
          forumName: 'events',
          log: made.log,
        })
      : undefined;
  const { ctx, entries: said } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    servers: made.servers,
    ...(rehearsal ? { rehearsal } : {}),
    ...(eventForum ? { eventForum } : {}),
  });
  const router = new InteractionRouter(ctx, [admin], []);
  const run = async (roleNames: string[] = ['Admin']) => {
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'setup-forums',
      roleNames,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, run, said };
}

const NEWLINE = String.fromCharCode(10);
const background = watchEachTest();

describe('/admin setup-forums', () => {
  it('makes in rehearsal mode only the forums of its regions, hidden, and says so', async () => {
    const rehearsal = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['north'],
      staffRoles: ['Moderator'],
    });
    const { run, gateway, regions } = await setup({}, rehearsal);
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
    // Staff by the rehearsal's own staff role: anybody else is not answered.
    const interaction = await run(['Admin', 'Moderator']);
    const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    expect(gateway.hidden.has(north)).toBe(true);
    expect(gateway.hidden.has(WEST_FORUM)).toBe(false);
    expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the board, hid it from all but staff and the testers.`,
      'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
    ]);
  });

  it('names the rehearsed regions that no region channel of the server is called', async () => {
    const rehearsal = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['nowhere', 'north'],
      staffRoles: ['Moderator'],
    });
    const { run, gateway } = await setup({}, rehearsal);
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
    const content = sent((await run(['Admin', 'Moderator'])).editReply).content ?? '';
    expect(content).toContain(
      'No region channel of this server is called nowhere: settings.rehearsal.regions names a region by its channel, as it is written, without #.',
    );
    const none = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['nowhere'],
      staffRoles: ['Moderator'],
    });
    const alone = await setup({}, none);
    const said = sent((await alone.run(['Admin', 'Moderator'])).editReply).content ?? '';
    expect(said).not.toContain('This server has no regions yet.');
    expect(said).toContain('No region channel of this server is called nowhere');
  });

  it('gives every region its forum, tags and pinned summary, and says what it did', async () => {
    const { run, gateway, regions } = await setup();
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
    const interaction = await run();

    const north = regions.byChannel(UNBOUNDED_CHANNEL);
    expect(north?.forumChannelId).toEqual(expect.any(String));
    const created = gateway.forums.get(north?.forumChannelId ?? '');
    expect(created).toMatchObject({ name: 'north-meetups', regionChannelId: UNBOUNDED_CHANNEL });
    expect(Object.keys(created?.tags ?? {})).toEqual([...FORUM_TAGS]);
    for (const region of regions.all()) {
      const summary = gateway.posts.get(region.summaryMessageId ?? '');
      expect(summary).toMatchObject({
        title: 'Today and coming up',
        pinned: true,
        forumId: region.forumChannelId,
      });
    }
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(sent(interaction.editReply).content?.split('\n')).toEqual([
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the board.`,
      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and pinned the board.`,
      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, closed it to posts by members, posted and pinned the board.`,
    ]);
  });

  // Plan 8V-1: the events forum, where the settings name one.
  it('makes the events forum beside bot-updates and says so, after the regions', async () => {
    const { run, gateway } = await setup({}, undefined, { events: true });
    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
    const forumId = [...gateway.forums].find(([, forum]) => forum.name === 'events')?.[0];
    expect(forumId).toBeDefined();
    expect(gateway.forums.get(forumId ?? '')?.regionChannelId).toBe(BOT_UPDATES);
    expect(lines.at(-1)).toBe(
      `Events forum: created <#${forumId}>, closed it to posts by members, posted, pinned and ` +
        'locked the listing.',
    );
    // Run again: it is there.
    const again = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
    expect(again.at(-1)).toBe(`Events forum: <#${forumId}> is ready.`);
  });

  // Review V1: before the events feed is read, the listing waits for it.
  it('says that the listing waits for the events feed while it is not read', async () => {
    const { run } = await setup({}, undefined, { events: true, feedUnread: true });
    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
    expect(lines.at(-1)).toMatch(
      /^Events forum: created <#\d+>, closed it to posts by members\. The listing is posted once the events feed is read\.$/u,
    );
  });

  it('says what it could not do in the events forum, or why it has none', async () => {
    const { run, gateway, servers } = await setup({}, undefined, { events: true });
    chooseForum(servers, '600000000000000001');
    gateway.addForum('600000000000000001', [], 'events');
    gateway.noReserving.add('600000000000000001');
    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
    expect(lines.at(-1)).toBe(
      'Events forum: <#600000000000000001> is ready, posted, pinned and locked the listing. I ' +
        'could not close it to posts by members ' +
        '(I need Manage Permissions and Send Messages there; see the log). I could not let ' +
        'myself manage its posts (give me Manage Posts and Manage Permissions there).',
    );
    const without = await setup({}, undefined, { events: true });
    without.gateway.channels.delete(BOT_UPDATES);
    const said = sent((await without.run()).editReply).content?.split(NEWLINE) ?? [];
    expect(said.at(-1)).toBe(
      'Events forum: this server has no channel for bot updates to make #events beside: set ' +
        'one with /admin settings, or choose a forum there, and run this again.',
    );
  });

  // Branch review BR-6: a setup of the events forum that throws is said, not left out.
  it('says that something went wrong where the events forum’s setup throws', async () => {
    const { run, gateway } = await setup({}, undefined, { events: true });
    gateway.failing.set('reservePosts', new Error('Discord is down'));
    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
    expect(lines.at(-1)).toBe('Events forum: something went wrong (see the log).');
  });

  // Branch review BR-7.
  it('says where members cannot write in the event posts', async () => {
    const { run, gateway, servers } = await setup({}, undefined, { events: true });
    chooseForum(servers, '600000000000000001');
    gateway.addForum('600000000000000001', [], 'events');
    gateway.noReplies.set('600000000000000001', ['@everyone']);
    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
    expect(lines.at(-1)).toBe(
      'Events forum: <#600000000000000001> is ready, closed it to posts by members, posted, ' +
        'pinned and locked the listing. @everyone cannot write in its posts (allow Send Messages in Posts there).',
    );
  });

  it('leaves the events forum out in rehearsal mode', async () => {
    const rehearsal = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['north'],
      staffRoles: ['Moderator'],
    });
    const { run, gateway } = await setup({}, rehearsal, { events: true });
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
    const content = sent((await run(['Admin', 'Moderator'])).editReply).content ?? '';
    expect(content).not.toContain('Events forum');
    expect([...gateway.forums.values()].map((forum) => forum.name)).not.toContain('events');
  });

  it('leaves the making of posts in a forum to the bot, in a new forum and in an old one', async () => {
    const { run, gateway, regions } = await setup();
    await run();
    expect([...gateway.reserved].sort()).toEqual(
      regions
        .all()
        .map((region) => region.forumChannelId ?? '')
        .sort(),
    );
  });

  it("names a forum after its region with the ending of its server's settings, and renames one that has another", async () => {
    const { run, gateway, regions, servers } = await setup();
    servers.values = { ...servers.values, regionForumSuffix: '-gatherings' };
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    gateway.channelNames.set(WEST_FORUM, 'west-raids');
    // A name somebody chose by hand is not the bot's to change.
    gateway.channelNames.set(EAST_CHANNEL, 'east');
    gateway.channelNames.set(EAST_FORUM, 'east-side-raid-posts');
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
    const interaction = await run();
    const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    expect(gateway.forums.get(north)?.name).toBe('north-gatherings');
    expect(gateway.channelNames.get(WEST_FORUM)).toBe('west-gatherings');
    expect(gateway.channelNames.get(EAST_FORUM)).toBe('east-side-raid-posts');
    const lines = sent(interaction.editReply).content?.split(NEWLINE) ?? [];
    expect(lines[0]).toContain(`<#${WEST_FORUM}> is ready, renamed it,`);
    expect(lines[1]).not.toContain('renamed');
    // Run again, nothing is renamed.
    const again = await run();
    expect(sent(again.editReply).content).not.toContain('renamed');
  });

  it('leaves the name of a forum as it is when it cannot be changed', async () => {
    const { run, gateway, entries } = await setup();
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    gateway.channelNames.set(WEST_FORUM, 'west-raids');
    gateway.failing.set('renameForum', new Error('Missing Permissions'));
    const interaction = await run();
    expect(sent(interaction.editReply).content).toContain(`<#${WEST_FORUM}> is ready, closed`);
    expect(gateway.channelNames.get(WEST_FORUM)).toBe('west-raids');
    expect(entries.some((entry) => entry.msg === 'could not rename a forum')).toBe(true);
  });

  it('says so when it may not close a forum to posts by members, and sets up the rest', async () => {
    const { run, gateway } = await setup();
    gateway.noReserving.add(WEST_FORUM);
    const interaction = await run();
    const lines = sent(interaction.editReply).content?.split(NEWLINE) ?? [];
    expect(lines[0]).toBe(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted and pinned the board. ` +
        'I could not close it to posts by members (I need Manage Permissions and Send Messages there; see the log).',
    );
    expect(lines[1]).toContain('closed it to posts by members');
    expect(gateway.reserved.has(WEST_FORUM)).toBe(false);
  });

  it('changes nothing when run again', async () => {
    const { run, gateway } = await setup();
    await run();
    const forums = gateway.forums.size;
    const posts = gateway.posts.size;
    const again = await run();
    expect(gateway.forums.size).toBe(forums);
    expect(gateway.posts.size).toBe(posts);
    expect(sent(again.editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready.`,
    );
  });

  it('adds the tags an older forum lacks', async () => {
    const { run, gateway } = await setup();
    const west = gateway.forums.get(WEST_FORUM);
    if (west) west.tags = { Egg: '1' };
    await run();
    expect(Object.keys(gateway.forums.get(WEST_FORUM)?.tags ?? {}).sort()).toEqual(
      [...FORUM_TAGS].sort(),
    );
    expect(gateway.forums.get(WEST_FORUM)?.tags.Egg).toBe('1');
  });

  it('makes a new forum for a region whose forum was deleted', async () => {
    const { run, gateway, regions } = await setup();
    gateway.gone.add(WEST_FORUM);
    const interaction = await run();
    const west = regions.byChannel(WEST_CHANNEL);
    expect(west?.forumChannelId).not.toBe(WEST_FORUM);
    expect(sent(interaction.editReply).content).toContain(
      `<#${WEST_CHANNEL}>: created <#${west?.forumChannelId}>`,
    );
  });

  it('says so for a region whose channel is gone, and carries on with the others', async () => {
    const { run, gateway, regions } = await setup();
    gateway.gone.add(UNBOUNDED_CHANNEL);
    const interaction = await run();
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
    expect(sent(interaction.editReply).content).toContain(
      `Region channel ${UNBOUNDED_CHANNEL}: I cannot see it any more, so it has no forum.`,
    );
    expect(sent(interaction.editReply).content).toContain(`<#${EAST_CHANNEL}>`);
  });

  it('names a region whose channel is gone by its description when it has one', async () => {
    const { run, gateway, regions } = await setup();
    gateway.gone.add(UNBOUNDED_CHANNEL);
    const north = regions.byChannel(UNBOUNDED_CHANNEL);
    if (north) north.description = 'North Hills';
    const interaction = await run();
    expect(sent(interaction.editReply).content).toContain(
      'North Hills: I cannot see it any more, so it has no forum.',
    );
  });

  it('leaves the regions of other servers alone', async () => {
    const { run, regions } = await setup();
    const north = regions.byChannel(UNBOUNDED_CHANNEL);
    if (north) north.guildId = 2;
    await run();
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
  });

  it('reports a region that failed, and carries on with the others', async () => {
    const { run, gateway, regions, entries } = await setup();
    const missing = new DiscordAPIError(
      { code: RESTJSONErrorCodes.MissingPermissions, message: 'Missing Permissions' },
      RESTJSONErrorCodes.MissingPermissions,
      403,
      'POST',
      '/guilds',
      {},
    );
    gateway.failing.set('createForum', missing);
    const interaction = await run();
    const text = sent(interaction.editReply).content;
    expect(text).toContain(
      `<#${UNBOUNDED_CHANNEL}>: I need the Manage Channels and Manage Threads permissions here.`,
    );
    expect(text).toContain(`<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready`);
    expect(text).toContain(`<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready`);
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();

    gateway.failing.set('createForum', new Error('boom'));
    const other = await run();
    expect(sent(other.editReply).content).toContain(
      `<#${UNBOUNDED_CHANNEL}>: Something went wrong (see the log).`,
    );
    expect(entries.some((entry) => entry.level === 50 && entry.region === 3)).toBe(true);
  });

  it('posts the summary where the bot lacks only Manage Posts, and says plainly what else it lacks', async () => {
    const { run, gateway, regions } = await setup();
    // The summary has no tags: Manage Posts is not needed to make it (only to pin it).
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    // Create Posts denied stays denied only where the bot may not change the forum's
    // permissions: closing it to members allows it to the bot.
    gateway.refusePosts.set(EAST_FORUM, ['Create Posts']);
    gateway.noReserving.add(EAST_FORUM);
    const text = sent((await run()).editReply).content ?? '';
    expect(text).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
        'board (I could not pin it or open it to members: give me Manage Posts there).',
    );
    expect(
      gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? ''),
    ).toMatchObject({ pinned: false });
    expect(text).toContain(
      `<#${EAST_CHANNEL}>: I am not allowed to post the board in <#${EAST_FORUM}>: ` +
        'I lack the permission Create Posts there. Give it to me and run this again.',
    );
    gateway.refusePosts.set(EAST_FORUM, []);
    expect(sent((await run()).editReply).content).toContain(
      `<#${EAST_CHANNEL}>: Discord does not let me post the board in <#${EAST_FORUM}>. ` +
        'Check that I have View Channel, Create Posts, Send Messages in Posts and Manage Posts ' +
        'there, and run this again.',
    );
  });

  it('posts the summary where Create Posts was denied: closing the forum to members allows it to the bot', async () => {
    const { run, gateway, regions } = await setup();
    gateway.refusePosts.set(EAST_FORUM, ['Create Posts']);
    const text = sent((await run()).editReply).content ?? '';
    expect(text).toContain(
      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and ` +
        'pinned the board.',
    );
    expect(gateway.posts.has(regions.byChannel(EAST_CHANNEL)?.summaryMessageId ?? '')).toBe(true);
  });

  it('says so when the summary could not be pinned for another reason', async () => {
    const { run, gateway } = await setup();
    gateway.failing.set('pinPost', new Error('Discord is away'));
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted ` +
        'the board (I could not pin it; see the log).',
    );
  });

  it('says so when the board could not be opened to members (review P12; plan 8R-9F)', async () => {
    const { run, gateway } = await setup();
    gateway.failing.set('openBoard', new Error('Discord is away'));
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and ` +
        'pinned the board (I could not open it to members; see the log).',
    );
  });

  it('opens a board plan 8R-9 locked, and says when it could not or a moderator locked it (R2)', async () => {
    const { run, gateway, regions } = await setup();
    await run();
    const board = gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? '')!;
    // As plan 8R-9 left it: locked, without slowmode.
    board.locked = true;
    board.slowmode = 0;
    gateway.failing.set('openBoard', missingPermissions('PATCH'));
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, the board is not open to members (I could ` +
        'not open it: give me Manage Posts there).',
    );
    // Opened where it may: nothing more is said.
    gateway.failing.clear();
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready.`,
    );
    expect(board).toMatchObject({ locked: false, slowmode: 45 });
    // A moderator locks it: left so, and said.
    board.locked = true;
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, the board is locked, so members cannot use ` +
        'commands in it (a moderator locked it; unlock it to let them).',
    );
    expect(board.locked).toBe(true);
  });

  it('moves the old mark of six hours to 45 seconds, and says a moderator’s lock stands (plan 8R-9H)', async () => {
    const { run, gateway, regions } = await setup();
    await run();
    const board = gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? '')!;
    // Opened by Pine before plan 8R-9H: open, then locked by a moderator.
    board.slowmode = 21_600;
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready.`,
    );
    expect(board).toMatchObject({ locked: false, slowmode: 45 });
    board.slowmode = 21_600;
    board.locked = true;
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, the board is locked, so members cannot use ` +
        'commands in it (a moderator locked it; unlock it to let them).',
    );
    expect(board).toMatchObject({ locked: true, slowmode: 45 });
  });

  it('says where it may not delete what members write in the board (plan 8R-9F)', async () => {
    const { run, gateway } = await setup();
    gateway.noManaging.add(WEST_FORUM);
    expect(sent((await run()).editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and ` +
        'pinned the board, but I may not delete what members write in it (give me Manage ' +
        'Messages there).',
    );
  });

  it('reports a forum that already belongs to another region', async () => {
    const { run, regions } = await setup();
    regions.setForum = () => Promise.resolve('forum-taken' as const);
    const interaction = await run();
    expect(sent(interaction.editReply).content).toContain(
      `<#${UNBOUNDED_CHANNEL}>: That forum already belongs to another region.`,
    );
  });

  it('says how many tags it added', async () => {
    const { run, gateway } = await setup();
    const west = gateway.forums.get(WEST_FORUM);
    if (west) west.tags = { Egg: '1' };
    const east = gateway.forums.get(EAST_FORUM);
    if (east)
      east.tags = Object.fromEntries(FORUM_TAGS.slice(0, FORUM_TAGS.length - 1).map((t) => [t, t]));
    const interaction = await run();
    const text = sent(interaction.editReply).content;
    expect(text).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, added ${FORUM_TAGS.length - 1} tags`,
    );
    expect(text).toContain(`<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, added 1 tag,`);
    const again = await run();
    expect(sent(again.editReply).content).not.toContain('added');
  });

  it('takes the tags the bot no longer uses off a forum, and leaves the server’s own', async () => {
    const { run, gateway } = await setup();
    const west = gateway.forums.get(WEST_FORUM);
    if (west)
      west.tags = { ...Object.fromEntries(FORUM_TAGS.map((t) => [t, t])), EX: 'x', Ours: 'o' };
    const interaction = await run();
    expect(gateway.forums.get(WEST_FORUM)?.tags).not.toHaveProperty('EX');
    expect(gateway.forums.get(WEST_FORUM)?.tags.Ours).toBe('o');
    expect(sent(interaction.editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, removed 1 tag it no longer uses`,
    );
    const again = await run();
    expect(sent(again.editReply).content).not.toContain('removed');
  });

  // Its help says what a run changes in a forum that is there (follow-ups, 8R-9).
  it('has a help that names what it changes in a forum that is there', () => {
    const details = admin.subcommands.get('setup-forums')?.help?.details;
    expect(typeof details).toBe('string');
    const text = typeof details === 'string' ? details : '';
    expect(text).toMatch(/removes the EX tag/);
    expect(text).toMatch(/closes the forum to posts by members/);
    expect(text).toMatch(/pinned again/);
    expect(text).not.toMatch(/Nothing else/);
  });

  // Final review, G2: Discord allows a forum 20 tags; the server's own count too.
  it('says which tags a forum has no room for, after taking off the retired ones', async () => {
    const { run, gateway } = await setup();
    const own = Array.from({ length: 10 }, (_, n): [string, string] => [
      `Own ${String(n)}`,
      `o${String(n)}`,
    ]);
    const west = gateway.forums.get(WEST_FORUM);
    if (west) west.tags = { ...Object.fromEntries(own), EX: 'x' };
    const interaction = await run();
    const tags = Object.keys(gateway.forums.get(WEST_FORUM)?.tags ?? {});
    expect(tags).toHaveLength(20);
    expect(tags).not.toContain('EX');
    expect(sent(interaction.editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, added 10 tags, ` +
        'removed 1 tag it no longer uses, has no room for 2 tags (Discord allows a forum 20): ' +
        'Meetup, Max battle',
    );
  });

  it('refuses a second setup while one is running for the server', async () => {
    const { run, gateway } = await setup();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ensureTags = gateway.ensureTags.bind(gateway);
    gateway.ensureTags = async (forumId, names) => {
      await held;
      return ensureTags(forumId, names);
    };
    const first = run();
    await background.settle();
    const second = await run().finally(release);
    expect(sent(second.followUp).content).toBe('A setup is already running for this server.');
    const done = await first;
    expect(sent(done.editReply).content).toContain('is ready');
    const third = await run();
    expect(sent(third.editReply).content).toContain('is ready');
  });

  it('sends a long report as several messages, never cutting inside a line', async () => {
    const { run, gateway, regions } = await setup();
    const [west] = regions.all();
    for (let i = 0; i < 30; i++) {
      const channelId = `1000000000000001${String(i).padStart(2, '0')}`;
      regions.rows.push({
        ...west!,
        id: 100 + i,
        channelId,
        description: `Region number ${i} ${'x'.repeat(70)}`,
        forumChannelId: null,
      });
      gateway.gone.add(channelId);
    }
    const interaction = await run();
    const messages = [
      sent(interaction.editReply).content ?? '',
      ...interaction.followUp.mock.calls.map(([payload]) => payload.content ?? ''),
    ];
    expect(messages.length).toBeGreaterThan(1);
    for (const message of messages) expect(message.length).toBeLessThanOrEqual(2000);
    for (const [payload] of interaction.followUp.mock.calls) expect(payload.flags).toBe(64);
    const lines = messages.join('\n').split('\n');
    expect(lines).toHaveLength(33);
    expect(
      lines.filter((l) => l.startsWith('Region number')).every((l) => l.endsWith('no forum.')),
    ).toBe(true);
  });

  it('cuts a long channel name so that the name of the forum fits Discord', async () => {
    const { run, gateway, regions } = await setup();
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'n'.repeat(120));
    await run();
    const forum = gateway.forums.get(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '');
    expect(forum?.name).toBe(`${'n'.repeat(92)}-meetups`);
  });

  it('says what the bot lacks in a hidden forum whose second hide Discord refused', async () => {
    const rehearsal = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['north'],
      staffRoles: ['Moderator'],
    });
    const { run, gateway, regions } = await setup({}, rehearsal);
    gateway.addChannel(UNBOUNDED_CHANNEL, 'north', { categoryId: 'category-1' });
    const P = PermissionFlagsBits;
    gateway.botPermissions =
      P.ViewChannel |
      P.SendMessages |
      P.SendMessagesInThreads |
      P.EmbedLinks |
      P.AttachFiles |
      P.ReadMessageHistory |
      P.ManageChannels |
      P.ManageRoles |
      P.ManageThreads |
      P.AddReactions;
    gateway.categoryOverwrites.set('category-1', [
      {
        id: FakePartyGateway.BOT_ID,
        type: OverwriteType.Member,
        allow: String(P.UseExternalEmojis),
        deny: '0',
      },
    ]);
    gateway.unsettable = P.UseExternalEmojis;
    const interaction = await run(['Admin', 'Moderator']);
    const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    expect(sent(interaction.editReply).content?.split(NEWLINE)[0]).toBe(
      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the board, it is hidden from all but staff and the testers (without Use External Emojis there, which only its category gives me; see the log).`,
    );
  });

  it('says a forum that was there was hidden already when Discord refuses to hide it again', async () => {
    const rehearsal = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['west'],
      staffRoles: ['Moderator'],
    });
    const { run, gateway } = await setup({}, rehearsal);
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    const see = String(PermissionFlagsBits.ViewChannel);
    gateway.forumOverwrites.set(WEST_FORUM, [
      { id: gateway.guildId, type: OverwriteType.Role, allow: '0', deny: see },
      { id: FakePartyGateway.BOT_ID, type: OverwriteType.Member, allow: see, deny: '0' },
    ]);
    gateway.noHiding.add(WEST_FORUM);
    const first = sent((await run(['Admin', 'Moderator'])).editReply).content?.split(NEWLINE)[0];
    expect(first).toBe(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the board, it was already hidden from members (Discord refused to set its permissions; see the log).`,
    );
  });

  it('says how to hide by hand a forum it may not hide', async () => {
    const rehearsal = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['west'],
      staffRoles: ['Moderator'],
    });
    const { run, gateway } = await setup({}, rehearsal);
    gateway.channelNames.set(WEST_CHANNEL, 'west');
    gateway.noHiding.add(WEST_FORUM);
    const first = sent((await run(['Admin', 'Moderator'])).editReply).content?.split(NEWLINE)[0];
    expect(first).toBe(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready. I could not hide it from members for the ` +
        'rehearsal (I need Manage Permissions there; see the log). Hide it by hand: deny View ' +
        'Channel to @everyone, and allow it only to Professor Pine itself (my member or my own ' +
        'role), the staff roles (those settings.rehearsal.staffRoles names, and every role with ' +
        'Manage Server or Administrator) and the testers.',
    );
  });

  it('still says what it did when the rehearsed regions cannot be compared', async () => {
    const rehearsal = new Rehearsal({
      allowlist: ['200000000000000002'],
      regions: ['north'],
      staffRoles: ['Moderator'],
    });
    const { run, gateway, regions, service, said } = await setup({}, rehearsal);
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
    service.unmatchedRehearsedRegions = () => Promise.reject(new Error('db down'));
    const interaction = await run(['Admin', 'Moderator']);
    const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
    expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the board, hid it from all but staff and the testers.`,
      'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
      'I could not check that every region of settings.rehearsal.regions names a region channel of this server (see the log).',
    ]);
    expect(
      said.some(
        (entry) =>
          entry.level === 40 &&
          entry.msg === 'could not compare the rehearsed regions with the region channels',
      ),
    ).toBe(true);
  });

  it('names the forums whose region is gone, and leaves them as they are', async () => {
    const made = await setup();
    const ORPHAN = '100000000000000099';
    made.gateway.addForum(ORPHAN, [], 'old-meetups');
    await made.storage.insert(
      endParty({ ...testRaid(), forumChannelId: ORPHAN, forumPostId: '900000000000004321' }),
    );
    // A forum that a party names and that is a region's own is none of them.
    await made.storage.insert(
      endParty({
        ...testRaid({ id: '00000000-0000-4000-8000-000000000009' }),
        forumChannelId: WEST_FORUM,
        forumPostId: '900000000000004322',
      }),
    );
    const interaction = await made.run();
    const text = sent(interaction.editReply).content ?? '';
    expect(text.split(NEWLINE).at(-1)).toBe(
      `A forum whose region is gone: <#${ORPHAN}>. I left it as it is (history); delete by ` +
        'hand what is not wanted.',
    );
    expect(made.gateway.calls.filter((call) => call.endsWith(ORPHAN))).toEqual([]);
    // Once it is deleted by hand it is not named any more.
    made.gateway.gone.add(ORPHAN);
    const again = await made.run();
    expect(sent(again.editReply).content).not.toContain(ORPHAN);
  });

  it('is for staff only', async () => {
    const { run, gateway } = await setup();
    const interaction = await run(['Member']);
    expect(sent(interaction.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(gateway.calls).toEqual([]);
  });

  it('is offered only to members who may manage the server', () => {
    expect(admin.data.toJSON().default_member_permissions).toBe('32');
  });
});
