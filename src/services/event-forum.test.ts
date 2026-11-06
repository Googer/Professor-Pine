import { describe, expect, it, vi } from 'vitest';
import { FakePartyGateway, missingPermissions } from '../../test/support/fake-gateway.js';
import { heldCall } from '../../test/support/held-call.js';
import { MemoryEventForums } from '../../test/support/event-forum-store.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
import { loadSettings, type Settings } from '../config/settings.js';
import type { ListedEvent } from '../domain/time/event-listing.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import { listedEvent } from '../../test/support/event-forum-store-cases.js';
import { eventPostMessage } from '../render/events-forum.js';
import { activityDay } from '../../test/support/activity-cases.js';
import { MemoryActivity } from '../../test/support/activity.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { textOf } from '../../test/support/messages.js';
import type { ActivityDay } from '../domain/history/activity.js';
import { dayNumber, dayText } from '../domain/history/big-days.js';
import { eventForumWanted, EventForumService, type EventForumOptions } from './event-forum.js';
import { HistoryDays } from './history-days.js';

const SERVER = '412345678901234567';
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
  } = {},
) {
  const gateway = new FakePartyGateway();
  gateway.addChannel(CATEGORY, 'INFO', { kind: 'category' });
  gateway.addChannel(BOT_UPDATES, 'bot-updates', { categoryId: CATEGORY });
  const loaded = loadSettings(TEST_SETTINGS_PATH);
  const settings: Settings = {
    ...loaded,
    channels: { ...loaded.channels, events: 'events' },
    ...options.settings,
  };
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
    log,
    ...(options.days === undefined ? {} : { days: options.days }),
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
    const result = await service.setup(SERVER);
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

  it('finds the forum by its name when it is there, and makes nothing then', async () => {
    const { service, gateway, store } = eventForumWith();
    gateway.addChannel('600000000000000001', 'Events', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'Events');
    expect(await service.setup(SERVER)).toMatchObject({
      forum: 'ready',
      forumId: '600000000000000001',
    });
    expect([...gateway.forums.keys()]).toEqual(['600000000000000001']);
    expect((await store.forum(SERVER))?.forumId).toBe('600000000000000001');
  });

  // Review V7 (ruling R4): the name compared as Discord stores it, lower case, spaces to hyphens.
  it('makes and finds the forum by its name as Discord stores it', async () => {
    const loaded = loadSettings(TEST_SETTINGS_PATH);
    const named = { channels: { ...loaded.channels, events: 'Game Events' } };
    const made = eventForumWith({ settings: named });
    const result = await made.service.setup(SERVER);
    const forumId = result.forum === 'created' ? result.forumId : '';
    expect(made.gateway.forums.get(forumId)?.name).toBe('game-events');
    const found = eventForumWith({ settings: named });
    found.gateway.addChannel('600000000000000001', 'game-events', { kind: 'forum' });
    found.gateway.addForum('600000000000000001', [], 'game-events');
    expect(await found.service.setup(SERVER)).toMatchObject({
      forum: 'ready',
      forumId: '600000000000000001',
    });
  });

  it('takes the forum the name names over one recorded under another name (R7)', async () => {
    const { service, gateway, store } = eventForumWith();
    await store.setForum(SERVER, '600000000000000009');
    await store.setListing(SERVER, '600000000000000009', '700000000000000001');
    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'events');
    await service.setup(SERVER);
    const record = await store.forum(SERVER);
    expect(record?.forumId).toBe('600000000000000001');
    // The listing of the old forum is forgotten; the new forum has its own.
    expect(record?.listingPostId).not.toBe('700000000000000001');
  });

  it('says what it could not do: close it to members, let itself manage the posts', async () => {
    const { service, gateway } = eventForumWith();
    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'events');
    gateway.noReserving.add('600000000000000001');
    expect(await service.setup(SERVER)).toMatchObject({
      forum: 'ready',
      posting: 'not-allowed',
      managing: 'not-allowed',
    });
  });

  // Branch review BR-6: one setup per server at a time.
  it('makes one forum for two setups of a server at once', async () => {
    const { service, gateway } = eventForumWith();
    const [first, second] = await Promise.all([service.setup(SERVER), service.setup(SERVER)]);
    expect([...gateway.forums.values()].filter((forum) => forum.name === 'events')).toHaveLength(1);
    expect([first.forum, second.forum].sort()).toEqual(['created', 'ready']);
  });

  // Branch review BR-7.
  it('says who cannot write in the event posts', async () => {
    const { service, gateway } = eventForumWith();
    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
    gateway.addForum('600000000000000001', [], 'events');
    gateway.noReplies.set('600000000000000001', ['@everyone']);
    expect(await service.setup(SERVER)).toMatchObject({ replies: ['@everyone'] });
  });

  it('makes none without a bot-updates channel to make it beside', async () => {
    const { service, gateway } = eventForumWith();
    gateway.channels.delete(BOT_UPDATES);
    expect(await service.setup(SERVER)).toEqual({ forum: 'no-bot-updates', name: 'events' });
    expect(gateway.forums.size).toBe(0);
  });

  it('says why a forum it could not make is missing', async () => {
    const { service, gateway, entries } = eventForumWith();
    gateway.botPermissions = 0n;
    expect(await service.setup(SERVER)).toEqual({
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
    const setup = await made.service.setup(SERVER);
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
    const setup = await made.service.setup(SERVER);
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
    const setup = await made.service.setup(SERVER);
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
    const again = await service.setup(SERVER);
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
    const made = eventForumWith({ events: [COMMUNITY_DAY] });
    made.gateway.addForum('600000000000000001', [], 'events');
    const other =
      (await made.gateway.createPost('600000000000000001', {
        title: 'Rules',
        message: { content: 'Be kind.' },
        tagIds: [],
      })) ?? '';
    await made.gateway.pinPost(other);
    const setup = await made.service.setup(SERVER);
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
    const setup = await made.service.setup(SERVER);
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
    const { store, gateway, forumId, read, service } = await drawn();
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
    // The old forum is renamed by hand and a new one takes the settings' name.
    const old = gateway.forums.get(forumId);
    if (old) old.name = 'old-events';
    gateway.addForum('600000000000000002', [], 'events');
    const setup = service.setup(SERVER);
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
    await made.service.setup(SERVER);
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
    await made.service.setup(SERVER);
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
      settings: {
        eventsForum: { horizonDays: 35, postDaysAhead: 14, onThisDay: options.onThisDay ?? 3 },
        web: WEB,
      },
    });
    made.listed.known = options.known ?? true;
    const setup = await made.service.setup(SERVER);
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
    const setup = await made.service.setup(SERVER);
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

  it('is never made in rehearsal mode, nor without a forum named (G18)', () => {
    const loaded = loadSettings(TEST_SETTINGS_PATH);
    const named = { ...loaded, channels: { ...loaded.channels, events: 'events' } };
    expect(eventForumWanted(named)).toBe(true);
    expect(eventForumWanted(loaded)).toBe(false);
    expect(
      eventForumWanted({
        ...named,
        rehearsal: { allowlist: ['200000000000000001'], regions: ['west'], staffRoles: [] },
      }),
    ).toBe(false);
  });
});
