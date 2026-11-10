import { expect, it } from 'vitest';
import type { ResearchEventStorage } from '../../src/db/repositories/research-event-repository.js';
import type { ResearchTaskStorage } from '../../src/db/repositories/research-task-repository.js';
import type { StopPostStorage } from '../../src/db/repositories/stop-post-repository.js';
import { taskKeyOf, type ResearchTask } from '../../src/domain/research/task.js';
import type { ResearchEvent } from '../../src/domain/time/research-events.js';

/** Into the Wild 2026 as the events feed of 2026-10-21 has it, in New York (10:00 to 20:00 EST). */
export const INTO_THE_WILD: ResearchEvent = {
  id: 'into-the-wild-2026',
  name: 'Into the Wild',
  eventType: 'event',
  start: Date.UTC(2026, 10, 9, 15),
  end: Date.UTC(2026, 10, 14, 1),
};

/** Pawniard Community Day as the events feed of 2026-10-21 has it (14:00 to 17:00 EST). */
export const PAWNIARD_DAY: ResearchEvent = {
  id: 'november-communityday2026',
  name: 'Pawniard Community Day',
  eventType: 'community-day',
  start: Date.UTC(2026, 10, 21, 19),
  end: Date.UTC(2026, 10, 21, 22),
};

/** A task of the list, by its text. */
export function listedTask(text: string, overrides: Partial<ResearchTask> = {}): ResearchTask {
  return {
    key: taskKeyOf(text),
    text,
    category: 'Throwing',
    rewards: [
      {
        kind: 'item',
        item: 'rare-candy',
        name: 'Rare Candy',
        quantity: 3,
        image: 'https://cdn.leekduck.com/assets/img/items/Rare Candy.png',
      },
    ],
    ...overrides,
  };
}

/** What the pinned posts' storage does, for the repository and its twin. */
export function stopPostCases(made: () => Promise<StopPostStorage>): void {
  it('keeps a post per channel and day, in the place of the one there was', async () => {
    const store = await made();
    const post = {
      channelId: '300000000000000001',
      day: '2026-10-21',
      serverId: '100000000000000001',
      threadId: '300000000000000009',
      messageIds: ['400000000000000001'],
      leftover: [],
      updatedAt: 1,
    };
    await store.save(post);
    // A post of before plan 8R-9, pinned in the channel: no board post.
    await store.save({ ...post, day: '2026-10-20', threadId: null });
    // Drawn anew in another board post (a summary replaced, plan 8R-9).
    const moved = {
      ...post,
      threadId: '300000000000000010',
      // An old pinned post's message whose delete failed, kept with it (review P1).
      leftover: ['400000000000000009'],
      messageIds: ['400000000000000001', '400000000000000002'],
      updatedAt: 2,
    };
    await store.save(moved);
    expect(await store.all()).toEqual([{ ...post, day: '2026-10-20', threadId: null }, moved]);
    await store.remove(post.channelId, '2026-10-20');
    await store.remove(post.channelId, '2026-10-19');
    expect((await store.all()).map((one) => one.day)).toEqual(['2026-10-21']);
  });
}

/** What the research events' storage does, for the repository and its twin. */
export function researchEventCases(made: () => Promise<ResearchEventStorage>): void {
  it('keeps the events seen, as the feed has them now, and keeps those it no longer lists', async () => {
    const store = await made();
    await store.saveSeen([PAWNIARD_DAY, INTO_THE_WILD], 1);
    const moved = { ...PAWNIARD_DAY, start: PAWNIARD_DAY.start + 3_600_000 };
    await store.saveSeen([moved], 2);
    await store.saveSeen([], 3);
    expect(await store.all()).toEqual([INTO_THE_WILD, moved]);
  });

  it('forgets an event not begun that a read no longer lists, and keeps a begun one (A4)', async () => {
    const store = await made();
    await store.saveSeen([PAWNIARD_DAY, INTO_THE_WILD], 1);
    // Into the Wild has begun, Pawniard Day has not; the read lists neither.
    expect(await store.removeNotSeen([], INTO_THE_WILD.start + 1)).toBe(1);
    expect(await store.all()).toEqual([INTO_THE_WILD]);
    expect(await store.removeNotSeen([INTO_THE_WILD.id], INTO_THE_WILD.start - 1)).toBe(0);
    expect(await store.all()).toEqual([INTO_THE_WILD]);
  });

  it('forgets the events that ended before a moment', async () => {
    const store = await made();
    await store.saveSeen([PAWNIARD_DAY, INTO_THE_WILD], 1);
    expect(await store.removeEnded(INTO_THE_WILD.end)).toBe(0);
    expect(await store.removeEnded(INTO_THE_WILD.end + 1)).toBe(1);
    expect(await store.all()).toEqual([PAWNIARD_DAY]);
  });
}

/** What the kept task list does, for the repository and its twin. */
export function researchTaskCases(made: () => Promise<ResearchTaskStorage>): void {
  it('has no list before the first read', async () => {
    const store = await made();
    expect(await store.kept()).toEqual({ tasks: [], readAt: undefined });
  });

  it("keeps an event's end with its task, and no end on one without", async () => {
    const store = await made();
    const ending = listedTask('Catch 8 Ghost-type Pokémon', {
      category: 'Halloween',
      endsAt: Date.UTC(2026, 10, 1, 15),
    });
    const standing = listedTask('Catch 7 Pokémon', { category: 'Catching' });
    await store.replace([ending, standing], 1_000);
    expect((await store.kept()).tasks).toEqual([ending, standing]);
    // A read that lists the task with no end any more takes the end away.
    await store.replace([{ ...standing, category: 'Catching' }, listedTask(ending.text)], 2_000);
    expect((await store.kept()).tasks[1]).not.toHaveProperty('endsAt');
  });

  it('keeps the last list read, in the order of the page (review A8)', async () => {
    const store = await made();
    const throws = listedTask('Make 2 Excellent Throws');
    const catches = listedTask('Catch 7 Pokémon', { category: 'Catching' });
    const hatch = listedTask('Hatch an Egg', { category: 'Exploring', rewards: [] });
    await store.replace([throws, catches], 1_000);
    await store.replace([hatch, { ...throws, category: 'Throwing tasks' }], 2_000);
    expect(await store.kept()).toEqual({
      tasks: [hatch, { ...throws, category: 'Throwing tasks' }],
      readAt: 2_000,
    });
  });
}
