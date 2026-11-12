import { describe, expect, it, vi } from 'vitest';
import { OverwriteType, PermissionFlagsBits } from 'discord.js';
import { partyStoreWith, testMeetup, testRaid, testTrain } from '../../test/support/parties.js';
import { isTimed, type Party, type TimedParty } from '../domain/party/party.js';
import { FakePartyGateway, missingPermissions } from '../../test/support/fake-gateway.js';
import { heldCall } from '../../test/support/held-call.js';
import { MemoryEventForums } from '../../test/support/event-forum-store.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings, type Settings } from '../config/settings.js';
import {
  isPosted,
  postOpensAt,
  readListedEvents,
  type ListedEvent,
} from '../domain/time/event-listing.js';
import { parseBigEventFeed, parseMaxEventFeed } from '../domain/time/max-events.js';
import { readSpawnEventFeed } from '../../test/support/spawn-events.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import { listedEvent } from '../../test/support/event-forum-store-cases.js';
import { eventPostMessage } from '../render/events-forum.js';
import { activityDay } from '../../test/support/activity-cases.js';
import { MemoryActivity } from '../../test/support/activity.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { textOf } from '../../test/support/messages.js';
import type { ActivityDay } from '../domain/history/activity.js';
import { dayNumber, dayText } from '../domain/history/big-days.js';
import {
  EVENT_PARTY_REDRAW_MS,
  eventForumWanted,
  EventForumService,
  MAX_NEW_POSTS_PER_DRAW,
  MAX_OPEN_EVENT_POSTS,
  MORE_POSTS_AFTER_MS,
  type EventForumOptions,
} from './event-forum.js';
import { HistoryDays } from './history-days.js';
import { TestServers, testServerValues } from '../../test/support/server-values.js';
import type { ServerValues } from '../config/server-settings.js';

const SERVER = '412345678901234567';
const STAFF = '200000000000000001';
const BOT_UPDATES = '500000000000000010';
const CATEGORY = '500000000000000011';

const ZONE = 'America/New_York';
const at = (iso: string): number =>
  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;
const DAY = 24 * 60 * 60_000;

/** The events forum's service over the fake gateway, the server having its bot-updates channel. */
function eventForumWith(
  options: {
    events?: ListedEvent[];
    settings?: Partial<Settings>;
    now?: number;
    days?: EventForumOptions['days'];
    planned?: EventForumOptions['planned'];
    /** The server's events forum, by id, chosen in `/admin settings`; none unless given. */
    eventsForum?: string;
    /** The server's numbers of its events forum (`eventsForum` of its values). */
    numbers?: ServerValues['eventsForum'];
  } = {},
) {
  const gateway = new FakePartyGateway();
  gateway.addChannel(CATEGORY, 'INFO', { kind: 'category' });
  gateway.addChannel(BOT_UPDATES, 'bot-updates', { categoryId: CATEGORY });
  const loaded = loadSettings(TEST_SETTINGS_PATH);
  const settings: Settings = { ...loaded, ...options.settings };
  // The server's values (plan 19A-1): its channel for bot updates, and its events forum if given.
  const servers = new TestServers(
    testServerValues({
      channels: {
        'bot-updates': BOT_UPDATES,
        ...(options.eventsForum === undefined ? {} : { events: options.eventsForum }),
      },
      ...(options.numbers === undefined ? {} : { eventsForum: options.numbers }),
    }),
  );
  const store = new MemoryEventForums();
  // What the feed's provider knows: the listing, whether it is known, what it dropped (V1).
  const listed = {
    events: options.events ?? [],
    known: true,
    dropped: new Set<string>(),
  };
  const listeners: (() => void)[] = [];
  const clock = { now: options.now ?? at('2026-11-10T12:00') };
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const { log, entries } = createTestLogger();
  const deps: ConstructorParameters<typeof EventForumService>[0] = {
    gateway,
    store,
    events: {
      listedEvents: () => listed.events,
      onListedChange: (listener) => listeners.push(listener),
      listingKnown: () => listed.known,
      droppedIds: () => listed.dropped,
    },
    settings,
    servers,
    forumName: 'events',
    log,
    ...(options.days === undefined ? {} : { days: options.days }),
    ...(options.planned === undefined ? {} : { planned: options.planned }),
    now: () => clock.now,
    setTimer: (run, ms) => {
      // A timer that fired is done, as one cancelled.
      const timer = {
        run: () => {
          timer.cancelled = true;
          run();
        },
        ms,
        cancelled: false,
      };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  const service = new EventForumService(deps);
  /** The service now: the first, or the one of the last restart. */
  let current = service;
  /**
   * The feed read anew: the listeners told, and the draw waited for. `dropped`: the ids the read
   * dropped before their start.
   */
  const read = async (events: ListedEvent[], dropped: string[] = []) => {
    listed.events = events;
    listed.dropped = new Set(dropped);
    for (const listener of listeners) listener();
    await current.flush();
  };
  /** The process started again (plan 8M-15): a new service over the same store and gateway. */
  const restarted = (): EventForumService => {
    current.stop();
    current = new EventForumService(deps);
    current.start();
    return current;
  };
  /** Another service over the same store and gateway (a second bot, plan 8H-8), as `overrides` change it. */
  const another = (overrides: Partial<EventForumOptions> = {}): EventForumService =>
    new EventForumService({ ...deps, ...overrides });
  return {
    service,
    gateway,
    store,
    listed,
    entries,
    settings,
    servers,
    clock,
    timers,
    read,
    listeners,
    restarted,
    another,
  };
}

describe('EventForumService: the forum of /admin setup-forums (plan 8V-1)', () => {
  it('makes the forum in the category of bot-updates, closed to posts by members, and records it', async () => {
    const { service, gateway, store } = eventForumWith();
    const result = await service.setup(SERVER, STAFF);
    expect(result).toMatchObject({
      forum: 'created',
      posting: 'reserved',
      managing: 'allowed',
    });
    const forumId = result.forum === 'created' ? result.forumId : '';
    expect(gateway.forums.get(forumId)).toMatchObject({
      name: 'events',
      regionChannelId: BOT_UPDATES,
    });
    expect(gateway.serverChannels(SERVER)?.find((one) => one.id === forumId)?.categoryId).toBe(
      CATEGORY,
    );
    expect(gateway.reserved.has(forumId)).toBe(true);
    expect(gateway.managedPosts.has(forumId)).toBe(true);
    expect(await store.forum(SERVER)).toMatchObject({ serverId: SERVER, forumId });
  });

  it("keeps the forum it made as the server's events forum, by its id, with who ran the setup", async () => {
    const { service, servers } = eventForumWith();
    const result = await service.setup(SERVER, STAFF);
    const forumId = result.forum === 'created' ? result.forumId : '';
    expect(servers.of(SERVER).channels.events).toBe(forumId);
    expect(servers.changes.map((change) => change.by)).toEqual([STAFF]);
    // Run again, it finds it: nothing more is made or kept.
    expect(await service.setup(SERVER, STAFF)).toMatchObject({ forum: 'ready', forumId });
    expect(servers.changes).toHaveLength(1);
  });

  it('finds the forum its staff chose, whatever its name, and makes nothing then', async () => {
    const { service, gateway, store } = eventForumWith({ eventsForum: '600000000000000001' });
    gateway.addChannel('600000000000000001', 'Game News', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'Game News');
    // A forum named as a new one would be is not it.
    gateway.addChannel('600000000000000002', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000002', [], 'events');
    expect(await service.setup(SERVER, STAFF)).toMatchObject({
      forum: 'ready',
      name: 'Game News',
      forumId: '600000000000000001',
    });
    expect([...gateway.forums.keys()].sort()).toEqual(['600000000000000001', '600000000000000002']);
    expect((await store.forum(SERVER))?.forumId).toBe('600000000000000001');
  });

  it('makes one where the forum its staff chose is gone, and keeps it in its place', async () => {
    const { service, gateway, servers } = eventForumWith({ eventsForum: '600000000000000001' });
    const result = await service.setup(SERVER, STAFF);
    const forumId = result.forum === 'created' ? result.forumId : '';
    expect(gateway.forums.get(forumId)?.name).toBe('events');
    expect(servers.of(SERVER).channels.events).toBe(forumId);
  });

  it("takes back the forum it made when it cannot keep it in the server's values", async () => {
    const { service, gateway, servers } = eventForumWith();
    servers.failing = new Error('database away');
    expect(await service.setup(SERVER, STAFF)).toEqual({
      forum: 'failed',
      name: 'events',
      reason: 'Something went wrong (see the log).',
    });
    expect([...gateway.forums.keys()].filter((id) => !gateway.gone.has(id))).toEqual([]);
  });

  it('takes the forum its staff chose over one recorded before (R7)', async () => {
    const { service, gateway, store } = eventForumWith({ eventsForum: '600000000000000001' });
    await store.setForum(SERVER, '600000000000000009');
    await store.setListing(SERVER, '600000000000000009', '700000000000000001');
    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'events');
    await service.setup(SERVER, STAFF);
    const record = await store.forum(SERVER);
    expect(record?.forumId).toBe('600000000000000001');
    // The listing of the old forum is forgotten; the new forum has its own.
    expect(record?.listingPostId).not.toBe('700000000000000001');
  });

  it('says what it could not do: close it to members, let itself manage the posts', async () => {
    const { service, gateway } = eventForumWith({ eventsForum: '600000000000000001' });
    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'events');
    gateway.noReserving.add('600000000000000001');
    expect(await service.setup(SERVER, STAFF)).toMatchObject({
      forum: 'ready',
      posting: 'not-allowed',
      managing: 'not-allowed',
    });
  });

  // Branch review BR-6: one setup per server at a time.
  it('makes one forum for two setups of a server at once', async () => {
    const { service, gateway } = eventForumWith();
    const [first, second] = await Promise.all([
      service.setup(SERVER, STAFF),
      service.setup(SERVER, STAFF),
    ]);
    expect([...gateway.forums.values()].filter((forum) => forum.name === 'events')).toHaveLength(1);
    expect([first.forum, second.forum].sort()).toEqual(['created', 'ready']);
  });

  // Branch review BR-7.
  it('says who cannot write in the event posts', async () => {
    const { service, gateway } = eventForumWith({ eventsForum: '600000000000000001' });
    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'events');
    gateway.noReplies.set('600000000000000001', ['@everyone']);
    expect(await service.setup(SERVER, STAFF)).toMatchObject({ replies: ['@everyone'] });
  });

  it("makes it beside the server's channel for bot updates, not another of that name", async () => {
    // PGP Bot Development Lab has #bot-updates under two categories.
    const { service, gateway } = eventForumWith();
    gateway.addChannel('500000000000000020', 'DEV', { kind: 'category' });
    gateway.addChannel('500000000000000021', 'bot-updates', { categoryId: '500000000000000020' });
    const result = await service.setup(SERVER, STAFF);
    const forumId = result.forum === 'created' ? result.forumId : '';
    expect(gateway.forums.get(forumId)).toMatchObject({ regionChannelId: BOT_UPDATES });
  });

  it('makes none without a channel for bot updates to make it beside', async () => {
    const { service, gateway, servers } = eventForumWith();
    gateway.channels.delete(BOT_UPDATES);
    expect(await service.setup(SERVER, STAFF)).toEqual({ forum: 'no-bot-updates', name: 'events' });
    servers.values = testServerValues({ channels: {} });
    expect(await service.setup(SERVER, STAFF)).toEqual({ forum: 'no-bot-updates', name: 'events' });
    expect(gateway.forums.size).toBe(0);
  });

  it('says why a forum it could not make is missing', async () => {
    const { service, gateway, entries } = eventForumWith();
    gateway.botPermissions = 0n;
    expect(await service.setup(SERVER, STAFF)).toEqual({
      forum: 'failed',
      name: 'events',
      reason: 'I need Manage Channels in the category of #bot-updates',
    });
    expect(entries.some((entry) => entry.msg === 'could not make the events forum')).toBe(true);
  });
});

/** The events of the tests, around 2026-11-10 12:00 in New York. */
const COMMUNITY_DAY = listedEvent({ start: at('2026-11-21T14:00'), end: at('2026-11-21T17:00') });
const RAID_HOUR = listedEvent({
  id: 'raidhour20261118',
  name: 'Cresselia and Darkrai Raid Hour',
  eventType: 'raid-hour',
  link: 'https://leekduck.com/events/raidhour20261118/',
  image: null,
  start: at('2026-11-18T18:00'),
  end: at('2026-11-18T19:00'),
});
const INTO_THE_WILD = listedEvent({
  id: 'into-the-wild-2026',
  name: 'Into the Wild',
  eventType: 'event',
  link: 'https://leekduck.com/events/into-the-wild-2026/',
  image: null,
  start: at('2026-11-09T10:00'),
  end: at('2026-11-13T20:00'),
});
const FAR_OFF = listedEvent({
  id: 'twilight-wishes-2026',
  name: 'Twilight Wishes',
  eventType: 'event',
  image: null,
  start: at('2026-11-30T10:00'),
  end: at('2026-12-01T20:00'),
});

/** A message as JSON, to look for what a member reads in it. */
function words(message: OutgoingMessage | undefined): string {
  return JSON.stringify(message ?? null);
}

describe('EventForumService: the listing "Events" (plan 8V-1)', () => {
  /** The service with its forum made by the setup, and the feed read once. */
  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
    const made = eventForumWith({ events });
    const setup = await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const forumId = setup.forum === 'created' ? setup.forumId : '';
    const record = async () => (await made.store.forum(SERVER))?.listingPostId ?? '';
    const listing = async () => made.gateway.posts.get(await record());
    return { ...made, setup, forumId, record, listing };
  };

  it('posts the listing with setup-forums: pinned, locked, recorded, and says so', async () => {
    const { setup, listing, forumId } = await drawn();
    expect(setup).toMatchObject({ listing: 'made' });
    expect(await listing()).toMatchObject({
      forumId,
      title: 'Events',
      pinned: true,
      locked: true,
      autoArchiveMinutes: 10_080,
    });
    const text = words((await listing())?.message);
    expect(text).toContain('1 now · 2 coming up');
    expect(text).toContain('Into the Wild');
    expect(text).toContain('Pawniard Community Day');
  });

  it('edits it in place after a read that changed it, and not at all after one that did not', async () => {
    const { read, listing } = await drawn();
    const edits = (await listing())?.edits ?? 0;
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    expect((await listing())?.edits).toBe(edits);
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD, FAR_OFF]);
    expect((await listing())?.edits).toBe(edits + 1);
    expect(words((await listing())?.message)).toContain('Twilight Wishes');
  });

  it('opens an archived listing for the edit and pins it again; a moderator’s unlock stands', async () => {
    const { read, listing } = await drawn();
    const post = await listing();
    if (!post) throw new Error('no listing');
    post.archived = true;
    post.pinned = false;
    post.locked = false;
    await read([COMMUNITY_DAY, FAR_OFF]);
    expect(post).toMatchObject({ archived: false, pinned: true, locked: false });
  });

  it('takes over a listing whose record is lost, among the archived posts too, never making a second', async () => {
    const { read, listing, store, forumId, gateway } = await drawn();
    const post = await listing();
    if (!post) throw new Error('no listing');
    post.archived = true;
    await store.setListing(SERVER, forumId, null);
    await read([COMMUNITY_DAY]);
    expect(gateway.postsIn(forumId).filter((one) => one.title === 'Events')).toHaveLength(1);
    expect((await store.forum(SERVER))?.listingPostId).toBe(post.id);
    expect(words(post.message)).not.toContain('Into the Wild');
  });

  it('makes a new listing where the old one was deleted', async () => {
    const { read, record, gateway } = await drawn();
    const old = await record();
    gateway.gone.add(old);
    await read([COMMUNITY_DAY]);
    expect(await record()).not.toBe(old);
    expect(gateway.posts.get(await record())).toMatchObject({ title: 'Events', pinned: true });
  });

  it('says that nothing is listed, and draws the listing anew a second after local midnight', async () => {
    const { read, listing, timers, clock } = await drawn();
    await read([]);
    expect(words((await listing())?.message)).toContain('No events listed right now.');
    const midnight = timers.find(
      (timer) => !timer.cancelled && timer.ms === at('2026-11-11T00:00') - clock.now + 1_000,
    );
    expect(midnight).toBeDefined();
  });

  it('draws again at the next start, end or post opening among the listed events, one timer set anew each draw', async () => {
    const { read, timers, clock, listing, service, store } = await drawn();
    await read([RAID_HOUR, FAR_OFF]);
    // Besides the midnight's timer.
    const midnight = at('2026-11-11T00:00') - clock.now + 1_000;
    const live = () => timers.filter((timer) => !timer.cancelled && timer.ms !== midnight);
    // The Raid Hour comes within a week first (BR-9): a second after it, a draw.
    const week = at('2026-11-11T18:00');
    const before = live().find((timer) => timer.ms === week - clock.now + 1_000);
    expect(before).toBeDefined();
    expect(live()).toEqual([before]);
    clock.now = week + 1_000;
    before?.run();
    await service.flush();
    expect(words((await listing())?.message)).toContain('1 this week');
    // Then Twilight Wishes' post opens (14 days before its start).
    const opening = at('2026-11-16T10:00');
    const first = live().find((timer) => timer.ms === opening - clock.now + 1_000);
    expect(first).toBeDefined();
    expect(live()).toEqual([first]);
    clock.now = opening + 1_000;
    first?.run();
    await service.flush();
    expect((await store.posts(SERVER)).map((row) => row.eventId)).toContain(FAR_OFF.id);
    // Then the Raid Hour's start: Now is drawn at once.
    const next = live().find((timer) => timer.ms === RAID_HOUR.start - clock.now + 1_000);
    expect(live()).toEqual([next]);
    clock.now = RAID_HOUR.start + 1_000;
    next?.run();
    await service.flush();
    expect(words((await listing())?.message)).toContain('1 now');
  });

  // Branch review BR-2: the clock's step stops the forum first; its upkeep then asks nothing.
  it('draws nothing in an upkeep once stopped', async () => {
    const { listed, service, gateway, clock } = await drawn();
    service.stop();
    listed.events = [FAR_OFF];
    clock.now += 60_000;
    const calls = gateway.calls.length;
    gateway.failing.set('postInfo', new Error('the upkeep asked Discord'));
    await service.upkeep();
    expect(gateway.calls.length).toBe(calls);
  });

  // Branch review BR-9: a line that moves to This week, or comes within the horizon, moves on time.
  it('draws again when an event comes within a week, or within the horizon', async () => {
    const { read, timers, clock } = await drawn();
    const midnight = at('2026-11-11T00:00') - clock.now + 1_000;
    const live = () => timers.filter((timer) => !timer.cancelled && timer.ms !== midnight);
    const hour = listedEvent({
      id: 'raidhour20261202',
      name: 'Raid Hour',
      eventType: 'raid-hour',
      start: at('2026-12-02T18:00'),
      end: at('2026-12-02T19:00'),
    });
    await read([hour]);
    expect(live().map((timer) => timer.ms)).toEqual([at('2026-11-25T18:00') - clock.now + 1_000]);
    const far = { ...hour, id: 'far', start: at('2026-12-20T18:00'), end: at('2026-12-20T19:00') };
    await read([far]);
    expect(live().map((timer) => timer.ms)).toEqual([at('2026-11-15T18:00') - clock.now + 1_000]);
  });

  it('draws in the hourly upkeep and the catch-up', async () => {
    const { listing, listed, service, clock } = await drawn();
    listed.events = [FAR_OFF];
    clock.now += 60_000;
    await service.upkeep();
    expect(words((await listing())?.message)).not.toContain('Into the Wild');
    listed.events = [];
    await expect(service.catchUp()).resolves.toBe('done');
    expect(words((await listing())?.message)).toContain('No events listed right now.');
  });

  it('says once that a forum is gone, and does nothing for that server until it is back', async () => {
    const { read, gateway, forumId, entries } = await drawn();
    gateway.gone.add(forumId);
    const posts = gateway.posts.size;
    await read([COMMUNITY_DAY, FAR_OFF]);
    await read([COMMUNITY_DAY]);
    expect(gateway.posts.size).toBe(posts);
    expect(entries.filter((entry) => entry.msg === 'the events forum is gone')).toEqual([
      expect.objectContaining({ level: 40, guild: SERVER, forum: forumId }),
    ]);
  });
});

describe('EventForumService: an event’s post (plan 8V-1)', () => {
  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
    const made = eventForumWith({ events });
    const setup = await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const forumId = setup.forum === 'created' ? setup.forumId : '';
    const postOf = async (eventId: string) => {
      const row = (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
      return row && made.gateway.posts.get(row.postId);
    };
    return { ...made, forumId, postOf };
  };

  it('posts the bigger events from postDaysAhead before their start, and ones on now at once; lines only else', async () => {
    const { postOf, store, read, clock } = await drawn([
      COMMUNITY_DAY,
      RAID_HOUR,
      INTO_THE_WILD,
      FAR_OFF,
    ]);
    expect(await postOf(COMMUNITY_DAY.id)).toMatchObject({
      title: 'Pawniard Community Day',
      tagIds: [],
      locked: false,
    });
    expect(words((await postOf(COMMUNITY_DAY.id))?.message)).toContain('More on Leek Duck');
    expect(await postOf(INTO_THE_WILD.id)).toBeDefined();
    // Twilight Wishes starts in 20 days; a Raid Hour is a line only.
    expect((await store.posts(SERVER)).map((row) => row.eventId).sort()).toEqual(
      [INTO_THE_WILD.id, COMMUNITY_DAY.id].sort(),
    );
    clock.now = at('2026-11-16T10:00');
    await read([COMMUNITY_DAY, RAID_HOUR, FAR_OFF]);
    expect(await postOf(FAR_OFF.id)).toBeDefined();
    expect(await postOf(RAID_HOUR.id)).toBeUndefined();
  });

  it('links each post in the listing', async () => {
    const { store, gateway, postOf } = await drawn();
    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
    expect(words(listing?.message)).toContain(`<#${(await postOf(COMMUNITY_DAY.id))?.id ?? ''}>`);
  });

  it('edits a post when its event’s times or name change, and not otherwise', async () => {
    const { postOf, read } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    const edits = post?.edits ?? 0;
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    expect(post?.edits).toBe(edits);
    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
    await read([later, RAID_HOUR, INTO_THE_WILD]);
    expect(post?.edits).toBe(edits + 1);
    expect(words(post?.message)).toContain('Sat, Nov 21, 3–6 PM');
  });

  it('carries a moved event’s post over to its new id and edits it (R12)', async () => {
    const { postOf, read, gateway, forumId, store } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    const posts = gateway.postsIn(forumId).length;
    const moved: ListedEvent = {
      ...COMMUNITY_DAY,
      id: 'november-communityday2026-rescheduled',
      name: 'Pawniard Community Day (Rescheduled)',
      start: at('2026-11-22T14:00'),
      end: at('2026-11-22T17:00'),
      formerIds: [COMMUNITY_DAY.id],
    };
    await read([moved, RAID_HOUR, INTO_THE_WILD]);
    expect(gateway.postsIn(forumId)).toHaveLength(posts);
    expect(await postOf(moved.id)).toBe(post);
    expect((await store.posts(SERVER)).map((row) => row.eventId)).not.toContain(COMMUNITY_DAY.id);
    expect(words(post?.message)).toContain('Sun, Nov 22, 2–5 PM');
  });

  it('says in the post that Leek Duck dropped an event before its start, archives it, and lists it no more', async () => {
    const { postOf, read, store, gateway } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    await read([RAID_HOUR, INTO_THE_WILD], [COMMUNITY_DAY.id]);
    expect(words(post?.message)).toContain('Leek Duck no longer lists this event.');
    expect(post).toMatchObject({ archived: true, locked: false });
    const row = (await store.posts(SERVER)).find((one) => one.eventId === COMMUNITY_DAY.id);
    expect(row).toMatchObject({ dropped: true });
    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
    expect(words(listing?.message)).not.toContain('Pawniard');
    // Never again: a later draw leaves it archived.
    await read([RAID_HOUR]);
    expect(post?.archived).toBe(true);
  });

  // Branch review BR-1, revised ruling R2: the feed lists a dropped event again.
  it('restores a dropped post whose event the feed lists again, drawn anew and linked', async () => {
    const { postOf, read, store, gateway } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    await read([RAID_HOUR, INTO_THE_WILD], [COMMUNITY_DAY.id]);
    expect(post?.archived).toBe(true);
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    expect(words(post?.message)).not.toContain('Leek Duck no longer lists this event.');
    expect(words(post?.message)).toContain('Pawniard Community Day');
    expect(post?.archived).toBe(false);
    const row = (await store.posts(SERVER)).find((one) => one.eventId === COMMUNITY_DAY.id);
    expect(row).toMatchObject({ dropped: false, archivedAt: null });
    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
    expect(words(listing?.message)).toContain(`<#${post?.id ?? ''}>`);
  });

  it('lets a post archive itself a day after the end, unlocked, and archives one still open three days after, once', async () => {
    const { postOf, read, clock, store, service } = await drawn();
    const post = await postOf(INTO_THE_WILD.id);
    clock.now = INTO_THE_WILD.end + 60_000;
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    expect(post).toMatchObject({ autoArchiveMinutes: 1_440, archived: false, locked: false });
    const row = (await store.posts(SERVER)).find((one) => one.eventId === INTO_THE_WILD.id);
    expect(row?.endedAt).toBe(clock.now);
    clock.now = INTO_THE_WILD.end + 3 * DAY + 60_000;
    await service.upkeep();
    expect(post).toMatchObject({ archived: true, locked: false });
    // A member's message opened it again: the upkeep leaves it so.
    if (post) post.archived = false;
    await service.upkeep();
    expect(post?.archived).toBe(false);
  });

  it('edits rather than ends a post whose event the feed extends after its old end', async () => {
    const { postOf, read, clock } = await drawn();
    const post = await postOf(INTO_THE_WILD.id);
    clock.now = INTO_THE_WILD.end + 60_000;
    const longer = { ...INTO_THE_WILD, end: INTO_THE_WILD.end + DAY };
    await read([COMMUNITY_DAY, RAID_HOUR, longer]);
    expect(post?.autoArchiveMinutes).toBe(10_080);
    expect(words(post?.message)).toContain('Nov 9 – Nov 14');
  });

  it('marks a post a moderator deleted as gone, never makes it again, and drops its link', async () => {
    const { postOf, read, gateway, store, forumId } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    gateway.gone.add(post?.id ?? '');
    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
    await read([later, RAID_HOUR, INTO_THE_WILD]);
    const row = (await store.posts(SERVER)).find((one) => one.eventId === COMMUNITY_DAY.id);
    expect(row).toMatchObject({ gone: true });
    const posts = gateway.postsIn(forumId).length;
    await read([later, RAID_HOUR, INTO_THE_WILD]);
    expect(gateway.postsIn(forumId)).toHaveLength(posts);
    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
    expect(words(listing?.message)).not.toContain(`<#${post?.id ?? ''}>`);
    expect(words(listing?.message)).toContain('Pawniard');
  });
});

describe('EventForumService: the review’s fixes (plan 8V-1, round 1)', () => {
  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
    const made = eventForumWith({ events });
    const setup = await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const forumId = setup.forum === 'created' ? setup.forumId : '';
    const rowOf = async (eventId: string) =>
      (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
    const postOf = async (eventId: string) => {
      const row = await rowOf(eventId);
      return row && made.gateway.posts.get(row.postId);
    };
    const listing = async () =>
      made.gateway.posts.get((await made.store.forum(SERVER))?.listingPostId ?? '');
    return { ...made, forumId, rowOf, postOf, listing };
  };

  // V1: after a restart whose kept listing could not be read, nothing is dropped or made.
  it('neither drops nor posts nor draws the listing while the listing is not known', async () => {
    const { postOf, listed, service, listing, gateway, forumId } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    const text = words((await listing())?.message);
    const posts = gateway.postsIn(forumId).length;
    listed.known = false;
    listed.events = [];
    await service.upkeep();
    expect(words(post?.message)).not.toContain('Leek Duck no longer lists this event.');
    expect(post?.archived).toBe(false);
    expect(words((await listing())?.message)).toBe(text);
    listed.events = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD, FAR_OFF];
    await service.upkeep();
    expect(gateway.postsIn(forumId)).toHaveLength(posts);
  });

  it('drops only what the read said it dropped, and keeps an event merely not listed', async () => {
    const { postOf, read, rowOf } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    await read([RAID_HOUR, INTO_THE_WILD]);
    expect(words(post?.message)).not.toContain('Leek Duck no longer lists this event.');
    expect((await rowOf(COMMUNITY_DAY.id))?.dropped).toBe(false);
    await read([RAID_HOUR, INTO_THE_WILD], [COMMUNITY_DAY.id]);
    expect((await rowOf(COMMUNITY_DAY.id))?.dropped).toBe(true);
  });

  // V2: a forum replaced at setup gets its own posts; none of the old ones is marked gone.
  it('makes the posts anew in a forum that replaced the old one, none marked gone', async () => {
    const { service, gateway, forumId, store } = await drawn();
    gateway.gone.add(forumId);
    const again = await service.setup(SERVER, STAFF);
    const newForum = again.forum === 'created' ? again.forumId : '';
    expect(newForum).not.toBe(forumId);
    await service.flush();
    const rows = await store.posts(SERVER);
    expect(rows.map((row) => row.eventId).sort()).toEqual(
      [COMMUNITY_DAY.id, INTO_THE_WILD.id].sort(),
    );
    expect(rows.every((row) => !row.gone)).toBe(true);
    for (const row of rows) expect(gateway.posts.get(row.postId)?.forumId).toBe(newForum);
  });

  // V3: a new name renames the post, by Discord's rename limit.
  it('renames a post whose event’s name changed, after the wait Discord names', async () => {
    const { postOf, read, rowOf, gateway, timers, service } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    const renamed = { ...COMMUNITY_DAY, name: 'Pawniard and Bisharp Community Day' };
    gateway.renameLater.set(post?.id ?? '', 60_000);
    await read([renamed, RAID_HOUR, INTO_THE_WILD]);
    expect(post?.title).toBe('Pawniard Community Day');
    expect((await rowOf(COMMUNITY_DAY.id))?.name).toBe('Pawniard Community Day');
    const later = timers.find((timer) => !timer.cancelled && timer.ms === 60_000);
    expect(later).toBeDefined();
    gateway.renameLater.delete(post?.id ?? '');
    later?.run();
    await service.flush();
    expect(post?.title).toBe('Pawniard and Bisharp Community Day');
    expect((await rowOf(COMMUNITY_DAY.id))?.name).toBe('Pawniard and Bisharp Community Day');
    expect(words(post?.message)).toContain('Pawniard and Bisharp Community Day');
  });

  it('cuts a long name to Discord’s 100 characters for the title', async () => {
    const long = { ...COMMUNITY_DAY, id: 'long', name: `${'Ä'.repeat(99)}Bé` };
    const { postOf } = await drawn([long]);
    expect(Array.from((await postOf('long'))?.title ?? '')).toHaveLength(100);
  });

  // V4: another pinned post (Discord's one pin per forum) keeps nothing else from happening.
  it('makes, locks and records the listing although the forum’s one pin is taken, said once', async () => {
    const made = eventForumWith({ events: [COMMUNITY_DAY], eventsForum: '600000000000000001' });
    made.gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
    made.gateway.addForum('600000000000000001', [], 'events');
    const other =
      (await made.gateway.createPost('600000000000000001', {
        title: 'Rules',
        message: { content: 'Be kind.' },
        tagIds: [],
      })) ?? '';
    await made.gateway.pinPost(other);
    const setup = await made.service.setup(SERVER, STAFF);
    expect(setup).toMatchObject({ listing: 'made' });
    const listingId = (await made.store.forum(SERVER))?.listingPostId ?? '';
    expect(made.gateway.posts.get(listingId)).toMatchObject({ locked: true, pinned: false });
    made.service.start();
    await made.read([COMMUNITY_DAY, FAR_OFF]);
    const edits = made.gateway.posts.get(listingId)?.edits ?? 0;
    await made.read([COMMUNITY_DAY, FAR_OFF]);
    expect(made.gateway.posts.get(listingId)?.edits).toBe(edits);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not pin the events listing'),
    ).toHaveLength(1);
  });

  // V5: a post a moderator deleted follows its event's move, so it is not made under the new id.
  it('moves a gone post’s row with its event, and makes no post for the new id', async () => {
    const { postOf, read, gateway, forumId, store } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    gateway.gone.add(post?.id ?? '');
    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
    await read([later, RAID_HOUR, INTO_THE_WILD]);
    const posts = gateway.postsIn(forumId).length;
    const moved: ListedEvent = {
      ...later,
      id: 'november-communityday2026-rescheduled',
      formerIds: [COMMUNITY_DAY.id],
    };
    await read([moved, RAID_HOUR, INTO_THE_WILD]);
    expect(gateway.postsIn(forumId)).toHaveLength(posts);
    expect((await store.posts(SERVER)).find((row) => row.eventId === moved.id)).toMatchObject({
      gone: true,
    });
  });

  // V6 (ruling R3): a quiet post stays open until its event ends.
  it('opens again in the hourly draw a post that archived itself before its event ended', async () => {
    const { postOf, service, clock } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    if (post) post.archived = true;
    await service.upkeep();
    expect(post).toMatchObject({ archived: false, locked: false });
    // After the end it is left archived.
    clock.now = COMMUNITY_DAY.end + 60_000;
    if (post) post.archived = true;
    await service.upkeep();
    expect(post?.archived).toBe(true);
  });
});

describe('EventForumService: the re-review’s fixes (plan 8V-1, round 2)', () => {
  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
    const made = eventForumWith({ events });
    const setup = await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const forumId = setup.forum === 'created' ? setup.forumId : '';
    const postOf = async (eventId: string) => {
      const row = (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
      return row && made.gateway.posts.get(row.postId);
    };
    return { ...made, forumId, postOf };
  };

  // W1: a rename that keeps failing does not have the unchanged message sent again each draw.
  it('edits a renamed event’s message once, and retries only the rename while it is refused', async () => {
    const { postOf, read, gateway } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    gateway.failing.set('renamePost', missingPermissions('PATCH'));
    const renamed = { ...COMMUNITY_DAY, name: 'Pawniard and Bisharp Community Day' };
    const edits = post?.edits ?? 0;
    await read([renamed, RAID_HOUR, INTO_THE_WILD]);
    await read([renamed, RAID_HOUR, INTO_THE_WILD]);
    expect(post?.edits).toBe(edits + 1);
    expect(gateway.calls.filter((call) => call === `renamePost ${post?.id ?? ''}`)).toHaveLength(2);
    expect(post?.title).toBe('Pawniard Community Day');
  });

  // W2: no draw straddles setup's change of forum: a draw under way ends first.
  it('lets a draw under way end before setup changes the forum, so no row of the old forum is left', async () => {
    const { store, gateway, forumId, read, service, servers } = await drawn();
    const hold = heldCall('the posts of a draw');
    const posts = store.posts.bind(store);
    let holding = true;
    store.posts = async (serverId: string) => {
      if (holding) {
        holding = false;
        hold.arrive();
        await hold.released;
      }
      return posts(serverId);
    };
    const reading = read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD, FAR_OFF]);
    await hold.reached;
    // Staff choose another forum in /admin settings, and set it up.
    gateway.addChannel('600000000000000002', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000002', [], 'events');
    servers.changed.set(SERVER, {
      ...servers.of(SERVER),
      channels: { ...servers.of(SERVER).channels, events: '600000000000000002' },
    });
    expect(forumId).not.toBe('600000000000000002');
    const setup = service.setup(SERVER, STAFF);
    hold.release();
    await setup;
    await reading;
    await service.flush();
    const rows = await store.posts(SERVER);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(gateway.posts.get(row.postId)?.forumId, row.eventId).toBe('600000000000000002');
    }
  });
});

describe('EventForumService: the branch review’s fixes to the posts (BR-3 to BR-5)', () => {
  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
    const made = eventForumWith({ events });
    await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const rowOf = async (eventId: string) =>
      (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
    const postOf = async (eventId: string) => {
      const row = await rowOf(eventId);
      return row && made.gateway.posts.get(row.postId);
    };
    return { ...made, rowOf, postOf };
  };

  // BR-3: the hourly draw finds a post deleted although its event did not change.
  it('marks a post gone in the hourly draw when Discord no longer has it', async () => {
    const { postOf, rowOf, service, gateway } = await drawn();
    gateway.gone.add((await postOf(COMMUNITY_DAY.id))?.id ?? '');
    await service.upkeep();
    expect((await rowOf(COMMUNITY_DAY.id))?.gone).toBe(true);
  });

  // BR-4: a moderator's close and lock stand.
  it('leaves an archived post a moderator locked as it is in the hourly draw', async () => {
    const { postOf, service } = await drawn();
    const post = await postOf(COMMUNITY_DAY.id);
    if (post) Object.assign(post, { archived: true, locked: true });
    await service.upkeep();
    expect(post).toMatchObject({ archived: true, locked: true });
  });

  // BR-5: one post Discord refuses keeps neither the other posts nor the listing from a draw.
  it('goes on to the next post and the listing when one post is refused, said once', async () => {
    const { postOf, read, gateway, store, entries } = await drawn();
    const refused = (await postOf(INTO_THE_WILD.id))?.id ?? '';
    const day = await postOf(COMMUNITY_DAY.id);
    const editPost = gateway.editPost.bind(gateway);
    gateway.editPost = (postId, message, options) =>
      postId === refused
        ? Promise.reject(missingPermissions('PATCH'))
        : editPost(postId, message, options);
    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
    const longer = { ...INTO_THE_WILD, end: at('2026-11-14T20:00') };
    await read([later, RAID_HOUR, longer]);
    await read([later, RAID_HOUR, longer, FAR_OFF]);
    expect(words(day?.message)).toContain('Sat, Nov 21, 3–6 PM');
    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
    expect(words(listing?.message)).toContain('Twilight Wishes');
    expect(entries.filter((entry) => entry.msg === 'could not update an event post')).toEqual([
      expect.objectContaining({ level: 40, post: refused, kind: 'edit' }),
    ]);
  });

  // Re-review RR-3: a stop cuts a draw under way short, between posts.
  it('draws no further post nor the listing once stopped in the middle of a draw', async () => {
    const { postOf, read, gateway, store, service } = await drawn();
    const first = (await postOf(INTO_THE_WILD.id))?.id ?? '';
    const day = await postOf(COMMUNITY_DAY.id);
    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
    const dayEdits = day?.edits ?? 0;
    const listingEdits = listing?.edits ?? 0;
    const hold = heldCall('the first post’s edit');
    const editPost = gateway.editPost.bind(gateway);
    gateway.editPost = async (postId, message, options) => {
      if (postId === first) {
        hold.arrive();
        await hold.released;
      }
      return editPost(postId, message, options);
    };
    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
    const longer = { ...INTO_THE_WILD, end: at('2026-11-14T20:00') };
    const reading = read([later, RAID_HOUR, longer]);
    await hold.reached;
    service.stop();
    hold.release();
    await reading;
    expect(day?.edits).toBe(dayEdits);
    expect(listing?.edits).toBe(listingEdits);
  });

  // Re-review RR-2: said once until it works again.
  it('says a post’s failure again once the step worked in between', async () => {
    const { postOf, read, gateway, entries } = await drawn();
    const refused = (await postOf(INTO_THE_WILD.id))?.id ?? '';
    const editPost = gateway.editPost.bind(gateway);
    let refusing = true;
    gateway.editPost = (postId, message, options) =>
      postId === refused && refusing
        ? Promise.reject(missingPermissions('PATCH'))
        : editPost(postId, message, options);
    const ends = ['2026-11-14T20:00', '2026-11-15T20:00', '2026-11-16T20:00'];
    const longer = (end: string) => ({ ...INTO_THE_WILD, end: at(end) });
    await read([COMMUNITY_DAY, longer(ends[0] ?? '')]);
    refusing = false;
    await read([COMMUNITY_DAY, longer(ends[1] ?? '')]);
    refusing = true;
    await read([COMMUNITY_DAY, longer(ends[2] ?? '')]);
    expect(entries.filter((entry) => entry.msg === 'could not update an event post')).toHaveLength(
      2,
    );
  });
});

// Plan 8M-15 (V1): a post of an event of a day or more no longer names Campfire; one whose event
// is unchanged loses the line at the next draw, edited once.
describe('EventForumService: a post brought to its message though its event is unchanged (plan 8M-15)', () => {
  const drawn = async () => {
    const made = eventForumWith({ events: [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD] });
    await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const postOf = async (eventId: string) => {
      const row = (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
      const post = row && made.gateway.posts.get(row.postId);
      if (!post) throw new Error(`no post of ${eventId}`);
      return post;
    };
    // As plan 8V-1 drew Into the Wild, a multi-day event: with the Campfire line.
    const wild = await postOf(INTO_THE_WILD.id);
    const before = eventPostMessage(
      { ...INTO_THE_WILD, end: INTO_THE_WILD.start + 3_600_000 },
      ZONE,
    );
    expect(words(before)).toContain('Official meetups, if any');
    wild.message = before;
    return { ...made, wild, day: await postOf(COMMUNITY_DAY.id) };
  };

  it('leaves a post whose message is the one last sent, draw after draw', async () => {
    const { day, read } = await drawn();
    const edits = day.edits;
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    expect(day.edits).toBe(edits);
    // A short event keeps the line.
    expect(words(day.message)).toContain('Official meetups, if any');
  });

  // Review R1-4: after a restart each post is asked about once, and an archived one is not asked
  // about again at every draw; only the hourly draw asks again. A locked post that is open is
  // edited, as a post whose event changed is (`editEventPost` edits whatever the lock).
  it.each([
    { state: 'open', archived: false, locked: false, asked: 1, edits: 1, hourly: [1, 0] },
    { state: 'locked, open', archived: false, locked: true, asked: 1, edits: 1, hourly: [1, 0] },
    {
      state: 'archived by itself',
      archived: true,
      locked: false,
      asked: 1,
      edits: 0,
      hourly: [1, 1],
    },
    {
      state: 'closed and locked',
      archived: true,
      locked: true,
      asked: 1,
      edits: 0,
      hourly: [1, 0],
    },
  ])(
    'asks about a post $state once after a restart, and edits it $edits time(s)',
    async ({ archived, locked, asked, edits, hourly }) => {
      const { wild, read, restarted, gateway } = await drawn();
      Object.assign(wild, { archived, locked });
      const askedAbout = vi.spyOn(gateway, 'postInfo');
      const asks = () => askedAbout.mock.calls.filter(([postId]) => postId === wild.id).length;
      const before = wild.edits;
      const fresh = restarted();
      await fresh.flush();
      // Draws of feed reads: asked once, then remembered.
      await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
      await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
      expect(asks()).toBe(asked);
      expect(wild.edits - before).toBe(edits);
      expect(wild).toMatchObject({ archived, locked });
      expect(words(wild.message).includes('Campfire')).toBe(edits === 0);
      // The hourly draw asks again; it opens and draws anew only a post that archived itself.
      const [hourlyAsks, hourlyEdits] = hourly;
      await fresh.upkeep();
      expect(asks()).toBe(asked + (hourlyAsks ?? 0));
      expect(wild.edits - before).toBe(edits + (hourlyEdits ?? 0));
      // And a draw after it asks nothing more.
      await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
      expect(asks()).toBe(asked + (hourlyAsks ?? 0));
    },
  );

  it('edits a post once after a restart whose message is the one Discord shows already', async () => {
    const { day, read, restarted } = await drawn();
    const before = day.edits;
    const fresh = restarted();
    await fresh.flush();
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    // The restarted process knows nothing it sent: one edit, no more.
    expect(day.edits).toBe(before + 1);
    expect(words(day.message)).toContain('Official meetups, if any');
  });
});

describe('EventForumService: how many posts a feed may make (plan 8Z-2)', () => {
  /**
   * `count` events of a posted kind that begin within the days ahead, in order, each ending a
   * day after the one before.
   */
  const events = (count: number): ListedEvent[] =>
    Array.from({ length: count }, (_unused, n) =>
      listedEvent({
        id: `event-${String(n).padStart(2, '0')}`,
        name: `Event ${String(n).padStart(2, '0')}`,
        eventType: 'event',
        image: null,
        start: at('2026-11-11T10:00'),
        end: at('2026-11-12T10:00') + n * DAY,
      }),
    );
  /** The forum set up and drawn with nothing listed yet. */
  const empty = async () => {
    const made = eventForumWith({ events: [] });
    // Posts made with ids of the clock's time, as Discord's are: the cap counts by them.
    made.gateway.clock = () => made.clock.now;
    await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const posted = async () =>
      (await made.store.posts(SERVER)).map((row) => row.eventId).sort((a, b) => a.localeCompare(b));
    /** The timers of the draws that make the posts a draw left for later. */
    const later = () =>
      made.timers.filter((timer) => !timer.cancelled && timer.ms === MORE_POSTS_AFTER_MS);
    /** Every such draw, one after the other, until none is left. */
    const drawRest = async () => {
      for (let timer = later()[0]; timer !== undefined; timer = later()[0]) {
        timer.run();
        await made.service.flush();
      }
    };
    return { ...made, posted, later, drawRest };
  };

  it('makes at most ten new posts in one draw, the earliest first, and the rest a minute later each', async () => {
    const { read, posted, later, service } = await empty();
    const listed = events(25);
    const ids = listed.map((event) => event.id);
    await read(listed);
    expect(await posted()).toEqual(ids.slice(0, MAX_NEW_POSTS_PER_DRAW));
    expect(later()).toHaveLength(1);
    later()[0]?.run();
    await service.flush();
    expect(await posted()).toEqual(ids.slice(0, 2 * MAX_NEW_POSTS_PER_DRAW));
    expect(later()).toHaveLength(1);
    later()[0]?.run();
    await service.flush();
    expect(await posted()).toEqual(ids);
    // Nothing is left: no draw is set for more.
    expect(later()).toEqual([]);
  });

  it('counts a post Discord refused among the ten, and sets no draw for more where it refused all', async () => {
    const { read, gateway, later, posted } = await empty();
    gateway.failing.set('createPost', missingPermissions('POST'));
    const asked = () => gateway.calls.filter((call) => call.startsWith('createPost ')).length;
    const before = asked();
    const listed = events(25);
    await read(listed);
    expect(asked() - before).toBe(MAX_NEW_POSTS_PER_DRAW);
    // A draw a minute later would only ask again: the posts wait for the next draw there is.
    expect(later()).toEqual([]);
    gateway.failing.delete('createPost');
    await read(listed);
    expect(await posted()).toHaveLength(MAX_NEW_POSTS_PER_DRAW);
    expect(later()).toHaveLength(1);
  });

  it('passes over the posts Discord refused in this run, and asks for them again an hour later', async () => {
    const { read, gateway, posted, clock } = await empty();
    // Discord refuses the posts of the first ten events for good (AutoMod on their names).
    const create = gateway.createPost.bind(gateway);
    const refused: string[] = [];
    gateway.createPost = (forumId, post) => {
      if (post.title.includes('Event 10')) return create(forumId, post);
      refused.push(post.title);
      return Promise.reject(new Error('blocked by AutoMod'));
    };
    const listed = events(11);
    await read(listed);
    expect(refused).toHaveLength(MAX_NEW_POSTS_PER_DRAW);
    expect(await posted()).toEqual([]);
    // The next draw passes over them: the eleventh gets its post.
    await read(listed);
    expect(await posted()).toEqual(['event-10']);
    expect(refused).toHaveLength(MAX_NEW_POSTS_PER_DRAW);
    // An hour later they are asked for again.
    clock.now += 60 * 60_000;
    await read(listed);
    expect(refused).toHaveLength(2 * MAX_NEW_POSTS_PER_DRAW);
  });

  it('makes no post beyond fifty made in three days, said once, until one is older', async () => {
    const { read, posted, drawRest, entries, clock, gateway, store, service } = await empty();
    const madeAt = clock.now;
    const listed = events(60);
    const ids = listed.map((event) => event.id);
    const full = () =>
      entries.filter((entry) => entry.msg === 'the events forum has as many event posts as it may');
    await read(listed);
    await drawRest();
    expect(await posted()).toEqual(ids.slice(0, MAX_OPEN_EVENT_POSTS));
    expect(full()).toEqual([
      expect.objectContaining({ level: 40, guild: SERVER, posts: MAX_OPEN_EVENT_POSTS }),
    ]);
    // Draw after draw: nothing more, and nothing said again.
    await read(listed);
    await drawRest();
    expect(await posted()).toHaveLength(MAX_OPEN_EVENT_POSTS);
    expect(full()).toHaveLength(1);
    // A post a moderator deleted keeps its place: deleting posts makes room for no others.
    const row = (await store.posts(SERVER)).find((one) => one.eventId === 'event-10');
    gateway.gone.add(row?.postId ?? '');
    await service.upkeep();
    expect((await store.posts(SERVER)).find((one) => one.eventId === 'event-10')?.gone).toBe(true);
    await drawRest();
    expect(await posted()).toHaveLength(MAX_OPEN_EVENT_POSTS);
    // Just under three days after they were made, they still count.
    clock.now = madeAt + 3 * DAY - 1;
    await read(listed);
    await drawRest();
    expect(await posted()).toHaveLength(MAX_OPEN_EVENT_POSTS);
    // Three days after: the events still due get theirs.
    clock.now = madeAt + 3 * DAY;
    await read(listed);
    await drawRest();
    expect(await posted()).toEqual(ids);
  });

  it('is filled for three days at most by events that end far in the future', async () => {
    // A feed in other hands lists sixty events that end in 2099: before plan 8Z-2's fix round,
    // their fifty posts counted until 2099, and no real event was posted again.
    const { read, posted, drawRest, clock } = await empty();
    const madeAt = clock.now;
    const far = events(60).map((event) => ({ ...event, end: at('2099-01-01T00:00') }));
    await read(far);
    await drawRest();
    expect(await posted()).toHaveLength(MAX_OPEN_EVENT_POSTS);
    clock.now = madeAt + 3 * DAY;
    const real = listedEvent({
      id: 'real-event',
      name: 'A real event',
      eventType: 'event',
      image: null,
      start: madeAt + 3 * DAY + 60 * 60_000,
      end: madeAt + 4 * DAY,
    });
    await read([real]);
    await drawRest();
    expect(await posted()).toContain('real-event');
  });

  // The real feed stays far below both limits: 64 events, 17 of them listed and of posted kinds.
  it('makes every post the kept feed of 2026-10-22 is due in one draw, at its fullest moment', async () => {
    const { read, posted, later, entries, clock, settings } = await empty();
    const zone = settings.timezone;
    const json = readSpawnEventFeed();
    const feed = readListedEvents(json, zone, {
      max: parseMaxEventFeed(json, zone).events,
      big: parseBigEventFeed(json, zone),
    }).read.filter(isPosted);
    expect(feed).toHaveLength(17);
    const opens = (event: ListedEvent): number =>
      postOpensAt(event, settings.eventsForum.postDaysAhead, zone);
    const dueAt = (time: number): ListedEvent[] =>
      feed.filter((event) => opens(event) <= time && event.end > time);
    // The most are due right as a post opens.
    const fullest = feed
      .map(opens)
      .reduce((best, time) => (dueAt(time).length > dueAt(best).length ? time : best));
    expect(dueAt(fullest).length).toBe(6);
    clock.now = fullest;
    await read(feed);
    expect(await posted()).toEqual(
      dueAt(fullest)
        .map((event) => event.id)
        .sort((a, b) => a.localeCompare(b)),
    );
    expect(later()).toEqual([]);
    expect(entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
  });
});

describe('EventForumService: "On this day" (plan 8H-8)', () => {
  /** `count` days from `first`: 40 raids of no known boss a day in region 1, and the spikes given. */
  const stretch = (first: string, count: number, spikes: Record<string, ActivityDay[]>) => {
    const start = dayNumber(first);
    return Array.from({ length: count }, (_, index) => {
      const day = dayText(start + index);
      return spikes[day] ?? [activityDay(day, '', 40 + ((index * 7) % 5) - 2)];
    }).flat();
  };
  /** Big days on November 10th: Lugia's in 2018, Mewtwo's in 2019 (a third of it in East, 2). */
  const DAYS = [
    ...stretch('2018-10-25', 40, { '2018-11-10': [activityDay('2018-11-10', 'lugia', 300)] }),
    ...stretch('2019-10-25', 40, {
      '2019-11-10': [
        activityDay('2019-11-10', 'mewtwo', 120),
        activityDay('2019-11-10', 'mewtwo', 60, { regionId: 2 }),
        activityDay('2019-11-10', '', 232),
      ],
    }),
  ];
  const TITLE = 'On this day, November 10, 2026';
  const WEB = {
    port: 8080,
    host: '127.0.0.1',
    publicUrl: 'https://pine.example',
    trustProxy: false,
    tiles: 'stadia',
  } as Settings['web'];

  /** The service with its forum, the raids per day of `DAYS`, at `now` (12:00 by default). */
  const recalling = async (
    options: {
      now?: number;
      onThisDay?: number;
      days?: boolean;
      known?: boolean;
      complete?: boolean;
      failing?: Error;
    } = {},
  ) => {
    const activity = new MemoryActivity();
    await activity.addDays(SERVER, DAYS);
    activity.complete = options.complete ?? true;
    activity.failing = options.failing;
    const days = new HistoryDays({
      reader: activity,
      zone: ZONE,
      bossName: (key) => catalogueFixture().byKey(key)?.name,
    });
    const made = eventForumWith({
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.days === false ? {} : { days }),
      settings: { web: WEB },
      // The server's numbers (plan 19A-1).
      numbers: { horizonDays: 35, postDaysAhead: 14, onThisDay: options.onThisDay ?? 3 },
    });
    made.listed.known = options.known ?? true;
    const setup = await made.service.setup(SERVER, STAFF);
    const forumId = setup.forum === 'created' ? setup.forumId : '';
    const recalled = () =>
      made.gateway.postsIn(forumId).filter((post) => post.title.startsWith('On this day'));
    const record = async () =>
      (await made.store.posts(SERVER)).filter((row) => row.eventId.startsWith('on-this-day:'));
    return { ...made, forumId, recalled, record, activity };
  };

  it('posts at 10:00 the earlier years’ big days of today’s date, newest first, a post of its own', async () => {
    const { recalled, record, gateway, store } = await recalling();
    const [post] = recalled();
    expect(recalled()).toHaveLength(1);
    expect(post).toMatchObject({ title: TITLE, pinned: false, locked: false, tagIds: [] });
    // Every region counts (G16: none is barred to a member of no roles), East's 60 and 100 too.
    expect(textOf(post?.message)).toBe(
      [
        `## ${TITLE}`,
        'Seven years ago today: Mewtwo day, 180 of 412 raids.',
        'Eight years ago today: Lugia day, 300 of 300 raids.',
        `-# [This server’s history](<https://pine.example/s/${SERVER}/history>)`,
      ].join('\n'),
    );
    // It archives itself after a day without messages (G6), set as it is made.
    expect(post?.autoArchiveMinutes).toBe(1_440);
    expect(gateway.calls.filter((call) => call.startsWith('setAutoArchive'))).toEqual([]);
    expect(await record()).toEqual([
      expect.objectContaining({ eventId: 'on-this-day:2026-11-10', postId: post?.id, name: TITLE }),
    ]);
    // The listing links only events.
    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
    expect(words(listing?.message)).not.toContain(post?.id ?? 'none');
  });

  it('waits for 10:00, then posts at the next draw, the timer set for it', async () => {
    const { recalled, clock, timers, service } = await recalling({ now: at('2026-11-10T09:00') });
    service.start();
    await service.flush();
    expect(recalled()).toEqual([]);
    // The one timer of the next change: 10:00, a second after.
    const timer = timers.filter((one) => !one.cancelled).at(-1);
    expect(timer?.ms).toBe(60 * 60_000 + 1_000);
    clock.now = at('2026-11-10T10:00:01');
    timer?.run();
    await service.flush();
    expect(recalled().map((post) => post.title)).toEqual([TITLE]);
  });

  it('sets the timer for 10:00 while any server drawn posts its days, whatever another of the same numbers says (review F12)', async () => {
    const { timers, service, store, servers } = await recalling({ now: at('2026-11-10T09:00') });
    // Another server drawn after it, with the same horizon, that recalls nothing.
    const other = '412345678901234999';
    const otherForum = '600000000000000999';
    await store.setForum(other, otherForum);
    const values = servers.of(SERVER);
    servers.changed.set(other, {
      ...values,
      channels: { ...values.channels, events: otherForum },
      eventsForum: { ...values.eventsForum, onThisDay: 0 },
    });
    service.start();
    await service.flush();
    const timer = timers.filter((one) => !one.cancelled).at(-1);
    expect(timer?.ms).toBe(60 * 60_000 + 1_000);
  });

  it('posts at the first draw of the day after 10:00 passed while it was down, never a day missed', async () => {
    const late = await recalling({ now: at('2026-11-10T22:00') });
    expect(late.recalled()).toHaveLength(1);
    // The day after, the 10th is not posted for: nothing fell on the 11th.
    const missed = await recalling({ now: at('2026-11-11T12:00') });
    expect(missed.recalled()).toEqual([]);
  });

  it('posts nothing on a day no big day fell on, with onThisDay 0, or without the days', async () => {
    expect((await recalling({ now: at('2026-11-12T12:00') })).recalled()).toEqual([]);
    expect((await recalling({ onThisDay: 0 })).recalled()).toEqual([]);
    expect((await recalling({ days: false })).recalled()).toEqual([]);
  });

  it('posts once whatever draws come that day: a timer and the upkeep at once, a catch-up, a restart', async () => {
    const { recalled, service, clock, restarted } = await recalling();
    clock.now += 60_000;
    service.request();
    await Promise.all([service.upkeep(), service.catchUp()]);
    clock.now += 3_600_000;
    await restarted().upkeep();
    expect(recalled()).toHaveLength(1);
  });

  it('takes over a post made before a restart that was not recorded, never making a second', async () => {
    const made = eventForumWith({ settings: { web: WEB } });
    const setup = await made.service.setup(SERVER, STAFF);
    const forumId = setup.forum === 'created' ? setup.forumId : '';
    // The run before made the post and stopped before its record was written.
    const left = await made.gateway.createPost(forumId, {
      title: TITLE,
      message: { content: 'x' },
      tagIds: [],
      autoArchiveMinutes: 1_440,
    });
    const { recalled, record } = await (async () => {
      const activity = new MemoryActivity();
      await activity.addDays(SERVER, DAYS);
      const service = made.another({
        days: new HistoryDays({
          reader: activity,
          zone: ZONE,
          bossName: (key) => catalogueFixture().byKey(key)?.name,
        }),
      });
      await service.upkeep();
      return {
        recalled: () =>
          made.gateway.postsIn(forumId).filter((post) => post.title.startsWith('On this day')),
        record: async () =>
          (await made.store.posts(SERVER)).filter((row) => row.eventId.startsWith('on-this-day:')),
      };
    })();
    expect(recalled().map((post) => post.id)).toEqual([left]);
    expect((await record()).map((row) => row.postId)).toEqual([left]);
  });

  it('makes one post for two services over one store at once, the other’s deleted', async () => {
    const { recalled, record, another, gateway, forumId } = await recalling({
      now: at('2026-11-10T09:00'),
    });
    expect(recalled()).toEqual([]);
    const activity = new MemoryActivity();
    await activity.addDays(SERVER, DAYS);
    const days = () =>
      new HistoryDays({
        reader: activity,
        zone: ZONE,
        bossName: (key) => catalogueFixture().byKey(key)?.name,
      });
    const first = another({ days: days(), now: () => at('2026-11-10T10:30') });
    const second = another({ days: days(), now: () => at('2026-11-10T10:30') });
    await Promise.all([first.upkeep(), second.upkeep()]);
    const kept = recalled();
    expect(kept).toHaveLength(1);
    expect((await record()).map((row) => row.postId)).toEqual([kept[0]?.id]);
    expect(
      gateway.postsIn(forumId).every((post) => post.title !== TITLE || post.id === kept[0]?.id),
    ).toBe(true);
  });

  it('is archived with the event posts three days on, and never edited', async () => {
    const { recalled, clock, service } = await recalling();
    clock.now = at('2026-11-12T12:00');
    await service.upkeep();
    expect(recalled()[0]).toMatchObject({ archived: false, edits: 0 });
    clock.now = at('2026-11-13T12:01');
    await service.upkeep();
    expect(recalled()[0]).toMatchObject({ archived: true, edits: 0, pinned: false });
  });

  it('waits while the days are still being filled, then posts at a later draw that day (A1)', async () => {
    const { recalled, record, activity, clock, service } = await recalling({ complete: false });
    expect(recalled()).toEqual([]);
    expect(await record()).toEqual([]);
    // Caught up by the next hourly upkeep: its draw posts.
    activity.complete = true;
    clock.now += 3_600_000;
    await service.upkeep();
    expect(recalled().map((post) => post.title)).toEqual([TITLE]);
  });

  it('warns once a day where the days have not caught up two hours after 10:00 (R5)', async () => {
    const warned = (entries: Array<Record<string, unknown>>) =>
      entries.filter((entry) => entry.msg === 'raids per day not caught up').length;
    // At 11:00 still within the upkeeps' reach: nothing said.
    const early = await recalling({ complete: false, now: at('2026-11-10T11:00') });
    expect(warned(early.entries)).toBe(0);
    // From 12:00, once that day whatever the draws.
    const late = await recalling({ complete: false });
    late.clock.now += 3_600_000;
    await late.service.upkeep();
    expect(late.recalled()).toEqual([]);
    expect(warned(late.entries)).toBe(1);
    late.clock.now = at('2026-11-11T12:00');
    await late.service.upkeep();
    expect(warned(late.entries)).toBe(2);
  });

  it('warns once a day of a post it could not make, whatever the draws that try again (A4)', async () => {
    const { recalled, clock, service, entries } = await recalling({
      failing: new Error('the database is away'),
    });
    const warned = () =>
      entries.filter((entry) => entry.msg === 'could not post "On this day"').length;
    clock.now += 3_600_000;
    await service.upkeep();
    clock.now += 3_600_000;
    await service.upkeep();
    expect(recalled()).toEqual([]);
    expect(warned()).toBe(1);
    // The next day, once more.
    clock.now = at('2026-11-11T12:00');
    await service.upkeep();
    expect(warned()).toBe(2);
  });

  it('warns of a failure and of days not caught up apart, each once on one day (W4)', async () => {
    const { recalled, clock, service, entries, activity } = await recalling({
      failing: new Error('the database is away'),
    });
    const warned = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
    expect(warned('could not post "On this day"')).toBe(1);
    // The database back, the days still being filled: that is said too, the same day.
    activity.failing = undefined;
    activity.complete = false;
    clock.now += 3_600_000;
    await service.upkeep();
    clock.now += 3_600_000;
    await service.upkeep();
    expect(recalled()).toEqual([]);
    expect(warned('raids per day not caught up')).toBe(1);
    // And a failure again that day is not said twice.
    activity.failing = new Error('the database is away');
    clock.now += 3_600_000;
    await service.upkeep();
    expect(warned('could not post "On this day"')).toBe(1);
  });

  it('posts nothing once stopped while it read the days (W7)', async () => {
    const { recalled, record, clock, service, activity } = await recalling({
      now: at('2026-11-10T09:00'),
    });
    // The days' read waits until the test lets it go, the service stopped meanwhile.
    const read = activity.daySeries.bind(activity);
    let reading: () => void = () => undefined;
    const asked = new Promise<void>((resolve) => {
      reading = resolve;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(activity, 'daySeries').mockImplementation(async (...args) => {
      reading();
      await released;
      return read(...args);
    });
    clock.now = at('2026-11-10T10:00:01');
    const drawn = service.upkeep();
    await asked;
    service.stop();
    release();
    await drawn;
    spy.mockRestore();
    expect(recalled()).toEqual([]);
    expect(await record()).toEqual([]);
  });

  it('posts though the events feed is not known yet: it is not the feed’s (G6)', async () => {
    const { recalled } = await recalling({ known: false });
    expect(recalled()).toHaveLength(1);
  });

  it('is never made in rehearsal mode (G18); which servers have a forum is theirs', () => {
    const loaded = loadSettings(TEST_SETTINGS_PATH);
    expect(eventForumWanted(loaded)).toBe(true);
    expect(
      eventForumWanted({
        ...loaded,
        rehearsal: { allowlist: ['200000000000000001'], regions: ['west'], staffRoles: [] },
      }),
    ).toBe(false);
  });
});

// Trains and meetups in an event's post and line (follow-ups, 8V-1; Matt, 2026-11-07).
describe('EventForumService: the trains and meetups planned during an event', () => {
  const PUBLIC_FORUM = '600000000000000001';
  const GATED_FORUM = '600000000000000002';
  const NORTH = '300000000000000021';

  /** A train or meetup of the server's row 1, posted in a forum, starting then. */
  const planned = <P extends TimedParty>(
    party: P,
    n: number,
    forumId: string,
    start: number,
  ): P => ({
    ...party,
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
    forumChannelId: forumId,
    forumPostId: `7100000000000000${String(n).padStart(2, '0')}`,
    timed: { ...party.timed, startTime: start },
  });

  /** The forum drawn over a party store with these parties; North's forum hidden from @everyone. */
  const drawnWith = async (parties: Party[]) => {
    const { store: partyStore } = await partyStoreWith(parties);
    const made = eventForumWith({
      events: [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD],
      planned: {
        parties: partyStore,
        guilds: { idFor: (id) => Promise.resolve(id === SERVER ? 1 : undefined) },
      },
    });
    const { gateway } = made;
    gateway.addForum(PUBLIC_FORUM, [], 'downtown');
    gateway.addForum(GATED_FORUM, [], 'north');
    gateway.serverRoles.set(NORTH, { name: 'North', permissions: 0n });
    gateway.forumOverwrites.set(GATED_FORUM, [
      {
        id: gateway.guildId,
        type: OverwriteType.Role,
        allow: '0',
        deny: String(PermissionFlagsBits.ViewChannel),
      },
      {
        id: NORTH,
        type: OverwriteType.Role,
        allow: String(PermissionFlagsBits.ViewChannel),
        deny: '0',
      },
    ]);
    await made.service.setup(SERVER, STAFF);
    made.service.start();
    await made.service.flush();
    const postOf = async (eventId: string) => {
      const row = (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
      const post = row && gateway.posts.get(row.postId);
      if (!post) throw new Error(`no post of ${eventId}`);
      return post;
    };
    const listing = async () =>
      gateway.posts.get((await made.store.forum(SERVER))?.listingPostId ?? '');
    /** The redraw a party's change asked for, run and waited for. */
    const redrawn = async () => {
      const due = made.timers.filter(
        (timer) => !timer.cancelled && timer.ms === EVENT_PARTY_REDRAW_MS,
      );
      for (const timer of due) timer.run();
      await made.service.flush();
      return due.length;
    };
    return { ...made, partyStore, postOf, listing, redrawn };
  };

  it('links those of regions everyone sees with their start, and counts the others', async () => {
    const { postOf, listing } = await drawnWith([
      planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00')),
      planned(testMeetup(), 2, GATED_FORUM, at('2026-11-11T18:00')),
      planned(testTrain(), 3, PUBLIC_FORUM, at('2026-11-21T15:00')),
      // Between the events, and before Into the Wild: in neither.
      planned(testTrain(), 4, PUBLIC_FORUM, at('2026-11-16T18:00')),
      planned(testMeetup(), 5, PUBLIC_FORUM, at('2026-11-09T09:00')),
    ]);
    const wild = textOf((await postOf(INTO_THE_WILD.id)).message);
    expect(wild).toContain(
      '**Trains and meetups planned**\n1 train, 1 meetup\n' +
        '<#710000000000000001> · Tue, Nov 10, 6 PM\n' +
        '-# 1 more is in a region not everyone here can see.',
    );
    // The gated meetup is never named.
    expect(wild).not.toContain('710000000000000002');
    expect(textOf((await postOf(COMMUNITY_DAY.id)).message)).toContain(
      '**Trains and meetups planned**\n1 train\n<#710000000000000003> · Sat, Nov 21, 3 PM',
    );
    const lines = textOf((await listing())?.message);
    expect(lines).toContain('Nov 9 – Nov 13 · <#');
    expect(lines).toMatch(/Into the Wild.*· 1 train, 1 meetup planned/u);
    expect(lines).toMatch(/Pawniard Community Day.*· 1 train planned/u);
    expect(lines).not.toMatch(/Raid Hour.*planned/u);
  });

  it('draws as before without the parties', async () => {
    const { postOf, listing } = await drawnWith([]);
    expect(textOf((await postOf(INTO_THE_WILD.id)).message)).not.toContain('planned');
    expect(textOf((await listing())?.message)).not.toContain('planned');
  });

  it('draws again a few seconds after a party is made, once for several changes', async () => {
    const { partyStore, postOf, listing, redrawn, timers } = await drawnWith([]);
    const wild = await postOf(INTO_THE_WILD.id);
    const edits = wild.edits;
    await partyStore.add(planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00')));
    await partyStore.add(planned(testMeetup(), 2, PUBLIC_FORUM, at('2026-11-11T18:00')));
    // Not drawn yet: one redraw waits.
    expect(textOf(wild.message)).not.toContain('planned');
    expect(timers.filter((one) => !one.cancelled && one.ms === EVENT_PARTY_REDRAW_MS)).toHaveLength(
      1,
    );
    expect(await redrawn()).toBe(1);
    expect(textOf(wild.message)).toContain('1 train, 1 meetup');
    expect(wild.edits).toBe(edits + 1);
    expect(textOf((await listing())?.message)).toContain('· 1 train, 1 meetup planned');
    // Nothing changed since: no redraw is due, and another draw edits nothing.
    expect(await redrawn()).toBe(0);
  });

  it('draws again when a party’s start moves out of the event, or it ends', async () => {
    const train = planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00'));
    const meetup = planned(testMeetup(), 2, PUBLIC_FORUM, at('2026-11-11T18:00'));
    const { partyStore, postOf, redrawn } = await drawnWith([train, meetup]);
    const wild = await postOf(INTO_THE_WILD.id);
    expect(textOf(wild.message)).toContain('1 train, 1 meetup');
    await partyStore.update(train.id, (party) => ({
      party: isTimed(party)
        ? { ...party, timed: { ...party.timed, startTime: at('2026-11-15T18:00') } }
        : party,
    }));
    expect(await redrawn()).toBe(1);
    expect(textOf(wild.message)).toContain('\n1 meetup\n');
    await partyStore.update(meetup.id, (party) => ({ party: { ...party, status: 'ended' } }));
    expect(await redrawn()).toBe(1);
    expect(textOf(wild.message)).not.toContain('planned');
  });

  it('leaves a change of a raid, or of attendance alone, without a redraw', async () => {
    const train = planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00'));
    const { partyStore, redrawn } = await drawnWith([train]);
    await partyStore.add(testRaid());
    await partyStore.update(train.id, (party) => ({ party: { ...party, anonymous: true } }));
    expect(await redrawn()).toBe(0);
  });

  // Review EP-6.
  it('edits neither the post nor the listing at a draw that finds the same', async () => {
    const { postOf, listing, read } = await drawnWith([
      planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00')),
    ]);
    const wild = await postOf(INTO_THE_WILD.id);
    const list = await listing();
    const edits = [wild.edits, list?.edits];
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    expect([wild.edits, list?.edits]).toEqual(edits);
  });

  // Review EP-1 and EP-2: "cannot tell" is not "hidden".
  it('names nobody and says nothing of who sees them where that cannot be told, warning once', async () => {
    const { gateway, postOf, read, entries } = await drawnWith([
      planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00')),
      planned(testMeetup(), 2, GATED_FORUM, at('2026-11-11T18:00')),
    ]);
    const wild = await postOf(INTO_THE_WILD.id);
    const events = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD];
    const keeps = gateway.shareKeeps.bind(gateway);
    const failing = () => Promise.reject(new Error('the cache is gone'));
    const warned = () =>
      entries.filter(
        (entry) =>
          entry.msg ===
          'could not tell who sees the regions of the trains and meetups of the events',
      ).length;
    gateway.shareKeeps = failing;
    await read(events);
    await read(events);
    const unknown = '**Trains and meetups planned**\n1 train, 1 meetup';
    expect(textOf(wild.message)).toContain(unknown);
    expect(textOf(wild.message)).not.toContain('<#7100');
    expect(textOf(wild.message)).not.toContain('not everyone');
    expect(warned()).toBe(1);
    // A forum the cache does not know: the same, without a warning.
    gateway.shareKeeps = () => Promise.resolve(undefined);
    await read(events);
    expect(textOf(wild.message)).toContain(unknown);
    expect(textOf(wild.message)).not.toContain('not everyone');
    // Working again: named; a later failure is warned of again.
    gateway.shareKeeps = keeps;
    await read(events);
    expect(textOf(wild.message)).toContain('<#710000000000000001>');
    expect(textOf(wild.message)).toContain('not everyone here can see');
    gateway.shareKeeps = failing;
    await read(events);
    expect(warned()).toBe(2);
  });

  // Review EP-4.
  it('sets no redraw for a party that starts within no listed event, before or after', async () => {
    const { partyStore, redrawn } = await drawnWith([]);
    const outside = planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-16T18:00'));
    await partyStore.add(outside);
    await partyStore.update(outside.id, (party) => ({
      party: isTimed(party)
        ? { ...party, timed: { ...party.timed, startTime: at('2026-11-17T18:00') } }
        : party,
    }));
    expect(await redrawn()).toBe(0);
  });

  // Review EP-5.
  it('draws again a second after a counted party is over by the clock', async () => {
    const end = at('2026-11-10T15:00');
    const train = {
      ...planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T13:00')),
      endTime: end,
    };
    const { clock, timers, service, postOf } = await drawnWith([train]);
    const wild = await postOf(INTO_THE_WILD.id);
    expect(textOf(wild.message)).toContain('1 train');
    const due = timers.filter((one) => !one.cancelled && one.ms === end - clock.now + 1_000);
    expect(due).toHaveLength(1);
    clock.now = end + 1_000;
    due[0]?.run();
    await service.flush();
    expect(textOf(wild.message)).not.toContain('planned');
  });

  // Review EP-6.
  it('draws a change whose redraw comes during a draw once that draw ends', async () => {
    const { store, partyStore, postOf, read, timers, service } = await drawnWith([]);
    const wild = await postOf(INTO_THE_WILD.id);
    const hold = heldCall('the posts of a draw');
    const posts = store.posts.bind(store);
    let holding = true;
    store.posts = async (serverId: string) => {
      if (holding) {
        holding = false;
        hold.arrive();
        await hold.released;
      }
      return posts(serverId);
    };
    const reading = read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
    await hold.reached;
    await partyStore.add(planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00')));
    const due = timers.filter((one) => !one.cancelled && one.ms === EVENT_PARTY_REDRAW_MS);
    expect(due).toHaveLength(1);
    for (const timer of due) timer.run();
    hold.release();
    await reading;
    await service.flush();
    expect(textOf(wild.message)).toContain('\n1 train\n');
  });

  // Review EP-6.
  it('leaves an archived post to the hourly draw', async () => {
    const { partyStore, postOf, redrawn, service } = await drawnWith([]);
    const wild = await postOf(INTO_THE_WILD.id);
    wild.archived = true;
    const edits = wild.edits;
    await partyStore.add(planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00')));
    expect(await redrawn()).toBe(1);
    expect(wild.edits).toBe(edits);
    expect(wild.archived).toBe(true);
    await service.upkeep();
    expect(textOf(wild.message)).toContain('\n1 train\n');
  });

  it('sets no redraw once stopped', async () => {
    const { partyStore, service, redrawn } = await drawnWith([]);
    service.stop();
    await partyStore.add(planned(testTrain(), 1, PUBLIC_FORUM, at('2026-11-10T18:00')));
    expect(await redrawn()).toBe(0);
  });
});
