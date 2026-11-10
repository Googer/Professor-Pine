import { expect, it } from 'vitest';
import type {
  EventForumStorage,
  EventPostRecord,
} from '../../src/db/repositories/event-forum-repository.js';
import type { ListedEventStorage } from '../../src/db/repositories/listed-event-repository.js';
import type { ListedEvent } from '../../src/domain/time/event-listing.js';

/** A listed event of the tests: Pawniard Community Day, 2026-11-21 14:00 to 17:00 (New York). */
export function listedEvent(overrides: Partial<ListedEvent> = {}): ListedEvent {
  return {
    id: 'november-communityday2026',
    name: 'Pawniard Community Day',
    eventType: 'community-day',
    link: 'https://leekduck.com/events/november-communityday2026/',
    image: 'https://cdn.leekduck.com/assets/img/events/cd/pawniard.jpg',
    start: Date.UTC(2026, 10, 21, 19),
    end: Date.UTC(2026, 10, 21, 22),
    formerIds: [],
    ...overrides,
  };
}

/** What the kept listed events do (plan 8V-1), for the repository and its twin. */
export function listedEventCases(made: () => Promise<ListedEventStorage>): void {
  it('keeps nothing before the first read', async () => {
    expect(await (await made()).all()).toEqual([]);
  });

  it('keeps the events as given, every field, in order of their start', async () => {
    const store = await made();
    const day = listedEvent();
    const hour = listedEvent({
      id: 'raidhour20261118',
      name: 'Cresselia and Darkrai Raid Hour',
      eventType: 'raid-hour',
      link: null,
      image: null,
      start: Date.UTC(2026, 10, 18, 23),
      end: Date.UTC(2026, 10, 19, 0),
      formerIds: ['raidhour20261117', 'raidhour20261116'],
    });
    await store.replace([day, hour]);
    expect(await store.all()).toEqual([hour, day]);
  });

  it('keeps what the last replace gave in the place of all it kept before', async () => {
    const store = await made();
    await store.replace([listedEvent()]);
    const other = listedEvent({ id: 'other', name: 'Other' });
    await store.replace([other]);
    expect(await store.all()).toEqual([other]);
    await store.replace([]);
    expect(await store.all()).toEqual([]);
  });
}

const post = (overrides: Partial<EventPostRecord> = {}): EventPostRecord => ({
  serverId: '100000000000000001',
  eventId: 'november-communityday2026',
  postId: '200000000000000001',
  name: 'Pawniard Community Day',
  start: Date.UTC(2026, 10, 21, 19),
  end: Date.UTC(2026, 10, 21, 22),
  endedAt: null,
  archivedAt: null,
  dropped: false,
  gone: false,
  ...overrides,
});

const SERVER = '100000000000000001';
const FORUM = '300000000000000001';

/** What the events forums and their posts do (plan 8V-1), for the repository and its twin. */
export function eventForumCases(made: () => Promise<EventForumStorage>): void {
  it('records a server’s forum without a listing, and finds it', async () => {
    const store = await made();
    expect(await store.forum(SERVER)).toBeUndefined();
    await store.setForum(SERVER, FORUM);
    expect(await store.forum(SERVER)).toEqual({
      serverId: SERVER,
      forumId: FORUM,
      listingPostId: null,
    });
    expect(await store.forums()).toEqual([
      { serverId: SERVER, forumId: FORUM, listingPostId: null },
    ]);
  });

  it('records the listing of the forum it is in, and refuses it for another forum', async () => {
    const store = await made();
    await store.setForum(SERVER, FORUM);
    expect(await store.setListing(SERVER, FORUM, '400000000000000001')).toBe(true);
    // The same post again is no change, and still the forum's.
    expect(await store.setListing(SERVER, FORUM, '400000000000000001')).toBe(true);
    expect(await store.setListing(SERVER, '300000000000000009', '400000000000000002')).toBe(false);
    expect((await store.forum(SERVER))?.listingPostId).toBe('400000000000000001');
  });

  it('keeps the listing for the same forum, and forgets it for another (R7)', async () => {
    const store = await made();
    await store.setForum(SERVER, FORUM);
    await store.setListing(SERVER, FORUM, '400000000000000001');
    await store.setForum(SERVER, FORUM);
    expect((await store.forum(SERVER))?.listingPostId).toBe('400000000000000001');
    await store.setForum(SERVER, '300000000000000002');
    expect(await store.forum(SERVER)).toEqual({
      serverId: SERVER,
      forumId: '300000000000000002',
      listingPostId: null,
    });
  });

  // Review V2: the posts of another forum are no posts of this one.
  it('retires the server’s live posts when its forum changes, and keeps those of the same forum', async () => {
    const store = await made();
    await store.setForum(SERVER, FORUM);
    await store.addPost(post());
    await store.addPost(post({ eventId: 'deleted-by-hand', gone: true }));
    const elsewhere = post({ serverId: '100000000000000002' });
    await store.addPost(elsewhere);
    await store.setForum(SERVER, FORUM);
    expect((await store.posts(SERVER)).map((row) => row.eventId)).toEqual([
      'deleted-by-hand',
      'november-communityday2026',
    ]);
    await store.setForum(SERVER, '300000000000000002');
    expect(await store.posts(SERVER)).toEqual([post({ eventId: 'deleted-by-hand', gone: true })]);
    expect(await store.posts('100000000000000002')).toEqual([elsewhere]);
  });

  it('records a post once per event and server, every field', async () => {
    const store = await made();
    const first = post();
    expect(await store.addPost(first)).toBe(true);
    expect(await store.addPost(post({ postId: '200000000000000009' }))).toBe(false);
    const elsewhere = post({ serverId: '100000000000000002' });
    expect(await store.addPost(elsewhere)).toBe(true);
    expect(await store.posts(SERVER)).toEqual([first]);
    const ended = post({
      eventId: 'into-the-wild-2026',
      endedAt: 5,
      archivedAt: 6,
      dropped: true,
      gone: true,
    });
    await store.addPost(ended);
    expect(await store.posts(SERVER)).toEqual([ended, first]);
  });

  it('changes what is asked of a post, and nothing else', async () => {
    const store = await made();
    await store.addPost(post());
    await store.updatePost(SERVER, 'november-communityday2026', {
      name: 'Pawniard Community Day (Rescheduled)',
      start: 1,
      end: 2,
      endedAt: 3,
    });
    await store.updatePost(SERVER, 'november-communityday2026', { gone: true, archivedAt: 4 });
    await store.updatePost(SERVER, 'november-communityday2026', {});
    expect(await store.posts(SERVER)).toEqual([
      post({
        name: 'Pawniard Community Day (Rescheduled)',
        start: 1,
        end: 2,
        endedAt: 3,
        archivedAt: 4,
        gone: true,
      }),
    ]);
  });

  it('moves a post’s row to its event’s new id, unless that id has one (R12)', async () => {
    const store = await made();
    await store.addPost(post());
    expect(await store.movePost(SERVER, 'november-communityday2026', 'new-id')).toBe(true);
    expect((await store.posts(SERVER)).map((row) => row.eventId)).toEqual(['new-id']);
    expect(await store.movePost(SERVER, 'nothing', 'other')).toBe(false);
    await store.addPost(post({ eventId: 'taken' }));
    expect(await store.movePost(SERVER, 'new-id', 'taken')).toBe(false);
    expect((await store.posts(SERVER)).map((row) => row.eventId).sort()).toEqual([
      'new-id',
      'taken',
    ]);
  });
}
