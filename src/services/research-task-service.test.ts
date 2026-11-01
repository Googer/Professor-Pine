import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { readResearchPage } from '../../test/support/research.js';
import { listedTask } from '../../test/support/research-store-cases.js';
import { MemoryResearchTasks } from '../../test/support/research-store.js';
import { jsonResponse } from '../../test/support/responses.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { taskPictureSources } from '../domain/stops/pictures.js';
import {
  MAX_RESEARCH_PAGE_BYTES,
  PINE_USER_AGENT,
  ResearchTaskService,
  type FetchPage,
} from './research-task-service.js';

const URL = 'https://leekduck.example.test/research/';
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 21, 22);

/** A service over the kept list in memory, reading what `answer` gives, at `clock.now`. */
function serviceWith(answer: () => ReturnType<FetchPage>, store = new MemoryResearchTasks()) {
  const { log, entries } = createTestLogger();
  const clock = { now: NOW };
  const asked: { url: string; headers: Record<string, string>; redirect: string }[] = [];
  const prepared: string[][] = [];
  /** Whether each `prepare` was a background one's (branch review W5). */
  const inBackground: boolean[] = [];
  const service = new ResearchTaskService({
    pictures: {
      prepare: (sources, how) => {
        prepared.push([...sources]);
        inBackground.push(how?.background === true);
        return Promise.resolve();
      },
    },
    url: URL,
    zone: 'America/New_York',
    refreshMs: HOUR,
    staleAfterMs: 6 * HOUR,
    store,
    gameData: { catalogue: catalogueFixture() },
    fetch: (url, init) => {
      asked.push({ url, headers: init.headers, redirect: init.redirect });
      return answer();
    },
    log,
    now: () => clock.now,
  });
  const said = (msg: string) => entries.filter((entry) => entry.msg === msg).length;
  return { service, store, clock, asked, said, entries, prepared, inBackground };
}

const page = (html = readResearchPage(), options: { status?: number } = {}) =>
  Promise.resolve({
    ...jsonResponse(null, { raw: html, ...options }),
    ok: (options.status ?? 200) < 300,
  });

describe('ResearchTaskService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('catches up at once after a failed read, and only then (plan 8X-H)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let answer = () => page();
    const { service, asked } = serviceWith(() => answer());
    expect(await service.catchUp()).toBe('not-owed');
    expect(asked).toHaveLength(0);
    answer = () => Promise.reject(new TypeError('fetch failed'));
    service.start();
    await vi.advanceTimersToNextTimerAsync();
    await service.whenIdle();
    expect(asked).toHaveLength(1);
    // Back: read at once, not at the retry a quarter of an hour on.
    answer = () => page();
    expect(await service.catchUp()).toBe('done');
    expect(asked).toHaveLength(2);
    expect(service.tasks()).toHaveLength(58);
    expect(await service.catchUp()).toBe('not-owed');
    // The next read is a refresh's interval on.
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(HOUR - 1);
    expect(asked).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await service.whenIdle();
    expect(asked).toHaveLength(3);
    service.stop();
  });

  it('reads the page with Pine’s User-Agent and keeps the list in the database', async () => {
    const { service, store, asked } = serviceWith(() => page());
    expect(service.tasks()).toEqual([]);
    expect(await service.refresh()).toEqual({ status: 'updated', tasks: 58 });
    expect(asked).toEqual([
      {
        url: URL,
        headers: { Accept: 'text/html', 'User-Agent': PINE_USER_AGENT },
        redirect: 'error',
      },
    ]);
    expect(service.tasks()).toHaveLength(58);
    expect(service.readAt()).toBe(NOW);
    const [first] = service.tasks();
    expect(service.byKey(first!.key)).toEqual(first);
    expect((await store.kept()).tasks).toHaveLength(58);
  });

  it('works out the versions of each task when it takes a list, and finds them (plan 8R-5)', async () => {
    let html = readResearchPage();
    const { service, clock } = serviceWith(() => page(html));
    expect(service.byVersion('6458b09802613fa3')).toBeUndefined();
    await service.refresh();
    const dragon = service.tasks().find((task) => task.text === 'Catch a Dragon-type Pokémon');
    const versions = service.versions(dragon!);
    expect(versions.map((version) => version.label)).toEqual([
      'Dratini',
      'Bagon',
      'Axew',
      'Golden Razz Berry ×2',
      'Rare Candy ×3',
      'Stardust ×1500',
      'Ultra Ball ×10',
      'one of Dratini, Bagon, Axew',
    ]);
    const bagon = versions[1]!;
    expect(service.byVersion(bagon.value)).toEqual({ task: dragon, version: bagon });
    expect(service.byVersion(dragon!.key)?.version.oneOf).toBe(true);
    expect(service.byVersion(`${dragon!.key}:00000000`)).toBeUndefined();
    // A list without the task: its versions are gone with it.
    html = readResearchPage().replace('Catch a Dragon-type Pokémon', 'Catch a Fairy-type Pokémon');
    clock.now += HOUR;
    await service.refresh();
    expect(service.byVersion(bagon.value)).toBeUndefined();
  });

  it('offers an event’s tasks first wherever the page lists them (plan 8R-8)', async () => {
    const event =
      // The class and attributes as the page of 2026-10-30 has them on an event's section.
      '<div class="task-category event-field-research" style="--cat:#f39c12;" ' +
      'data-event-end="2026-11-01T10:00:00-0800"><h2>Ultra Unlock: Water Festival Tasks</h2>' +
      '<li class="task-item"><span class="task-text"><span>Catch 3 Water-type Pokémon</span></span></li>' +
      '<li class="task-item"><span class="task-text"><span>Make 3 Splash Throws</span></span></li></div>';
    // Below the standing categories, where Leek Duck has never put it (made up).
    const html = readResearchPage().replace(
      '<section class="research-breakthrough-section',
      `${event}<section class="research-breakthrough-section`,
    );
    const { service, said } = serviceWith(() => page(html));
    await service.refresh();
    const plain = serviceWith(() => page());
    await plain.service.refresh();
    expect(service.tasks().map((task) => task.text)).toEqual([
      'Catch 3 Water-type Pokémon',
      'Make 3 Splash Throws',
      ...plain.service.tasks().map((task) => task.text),
    ]);
    // The event's headings are logged at each read, so a standing heading Leek Duck renames or
    // adds (read as an event's) shows in the log (review 8R8-3); a page without one logs none.
    expect(said('research tasks of an event read')).toBe(1);
    expect(plain.said('research tasks of an event read')).toBe(0);
  });

  // Matt, 2026-10-31: Leek Duck's page may list an event's tasks past its end.
  describe("an event's end", () => {
    const END = Date.UTC(2026, 10, 1, 15);
    const event =
      '<div class="task-category event-field-research" data-event-end="2026-11-01T10:00:00-0800">' +
      '<h2>Halloween Tasks</h2><li class="task-item"><span class="task-text"><span>' +
      'Catch 8 Ghost-type Pokémon</span></span></li></div>';
    const withEvent = () =>
      readResearchPage().replace(
        '<section class="research-breakthrough-section',
        `${event}<section class="research-breakthrough-section`,
      );
    const offered = (service: ResearchTaskService) => service.tasks().map((task) => task.text);
    const GHOST = 'Catch 8 Ghost-type Pokémon';

    it('stops offering its tasks at the end, with no read, and keeps the others', async () => {
      const { service, clock } = serviceWith(() => page(withEvent()));
      await service.refresh();
      const all = offered(service);
      expect(all).toContain(GHOST);
      clock.now = END - 1;
      expect(offered(service)).toEqual(all);
      clock.now = END;
      expect(offered(service)).toEqual(all.filter((text) => text !== GHOST));
    });

    it('still knows the task by its key: a report made from a list open at the end, a report standing', async () => {
      const { service, clock } = serviceWith(() => page(withEvent()));
      await service.refresh();
      const task = service.tasks().find((one) => one.text === GHOST);
      expect(task).toBeDefined();
      clock.now = END;
      expect(service.byKey(task?.key ?? '')?.text).toBe(GHOST);
    });

    it('holds after a restart, from the list kept', async () => {
      const { service, store, clock } = serviceWith(() => page(withEvent()));
      await service.refresh();
      clock.now = END;
      const again = serviceWith(() => page(withEvent()), store);
      again.clock.now = END;
      await again.service.load();
      expect(offered(again.service)).not.toContain(GHOST);
      expect(again.service.readAt()).toBeDefined();
    });

    it('logs the ends it read, for the day an end is to be checked', async () => {
      const { service: read, entries } = serviceWith(() => page(withEvent()));
      await read.refresh();
      const told = entries.find((entry) => entry.msg === 'research tasks of an event read');
      expect(told).toMatchObject({ eventEnds: ['2026-11-01T15:00:00.000Z'] });
    });

    it('warns of an end it cannot read', async () => {
      const unreadable = withEvent().replace('2026-11-01T10:00:00-0800', 'soon');
      const { service, said } = serviceWith(() => page(unreadable));
      await service.refresh();
      expect(said('ends of events on the research page could not be read')).toBe(1);
      expect(offered(service)).toContain(GHOST);
    });
  });

  it('warns of a section of the page it cannot read, as it fails silently otherwise', async () => {
    const unread = '<div id="x" class="task-category"><h2>Halloween Tasks</h2></div>';
    const missing = 'sections of the research page could not be read';
    const { service, said } = serviceWith(() =>
      page(
        readResearchPage().replace(
          '<section class="research-breakthrough-section',
          `${unread}<section class="research-breakthrough-section`,
        ),
      ),
    );
    await service.refresh();
    expect(said(missing)).toBe(1);
    const plain = serviceWith(() => page());
    await plain.service.refresh();
    expect(plain.said(missing)).toBe(0);
  });

  it('offers an event’s tasks first in the list of the last run too (plan 8R-8)', async () => {
    const store = new MemoryResearchTasks();
    await store.replace(
      [
        listedTask('Make 2 Excellent Throws'),
        listedTask('Catch 3 Water-type Pokémon', { category: 'Ultra Unlock: Water Festival' }),
      ],
      NOW - HOUR / 2,
    );
    const { service } = serviceWith(() => Promise.reject(new Error('no network')), store);
    await service.load();
    expect(service.tasks().map((task) => task.text)).toEqual([
      'Catch 3 Water-type Pokémon',
      'Make 2 Excellent Throws',
    ]);
  });

  it('starts with the list of the last run, without the network', async () => {
    const store = new MemoryResearchTasks();
    await store.replace([listedTask('Make 2 Excellent Throws')], NOW - HOUR / 2);
    const { service } = serviceWith(() => Promise.reject(new Error('no network')), store);
    await service.load();
    expect(service.tasks().map((task) => task.text)).toEqual(['Make 2 Excellent Throws']);
    expect(service.readAt()).toBe(NOW - HOUR / 2);
  });

  it('has the pictures of the list it takes made square, without waiting for them (plan 8M-9B)', async () => {
    const store = new MemoryResearchTasks();
    await store.replace([listedTask('Make 2 Excellent Throws')], NOW - HOUR / 2);
    const { service, prepared, inBackground } = serviceWith(() => page(), store);
    await service.load();
    expect(prepared).toEqual([taskPictureSources(service.tasks())]);
    await service.refresh();
    expect(prepared).toHaveLength(2);
    expect(prepared[1]).toEqual(taskPictureSources(service.tasks()));
    expect(prepared[1]?.length).toBeGreaterThan(20);
    // Behind the pictures a post or a DM waits for (branch review W5).
    expect(inBackground).toEqual([true, true]);
  });

  it('keeps its list when the page lists fewer than half the tasks, and says so', async () => {
    const store = new MemoryResearchTasks();
    const { service, said } = serviceWith(() => page(), store);
    await service.refresh();
    const one =
      '<div class="task-category"><h2>Catching Tasks</h2><li class="task-item">' +
      '<span class="task-text"><span>Catch a Ditto</span></span></li></div>';
    const shrunk = serviceWith(() => page(one), store);
    await shrunk.service.load();
    expect(await shrunk.service.refresh()).toEqual({ status: 'kept', tasks: 58, read: 1 });
    expect(shrunk.service.tasks()).toHaveLength(58);
    expect(
      shrunk.said('the research page lists fewer than half the tasks it did; the list is kept'),
    ).toBe(1);
    expect(said('research tasks read')).toBe(1);
  });

  const SHRUNK =
    '<div class="task-category"><h2>Catching Tasks</h2><li class="task-item">' +
    '<span class="task-text"><span>Catch a Ditto</span></span></li></div>';
  const OTHER =
    '<div class="task-category"><h2>Catching Tasks</h2><li class="task-item">' +
    '<span class="task-text"><span>Catch a Snorlax</span></span></li></div>';

  it('takes a smaller list when the next read lists the same tasks (review A3)', async () => {
    let html = readResearchPage();
    const { service, clock, said } = serviceWith(() => page(html));
    await service.refresh();
    html = SHRUNK;
    clock.now += HOUR;
    expect(await service.refresh()).toMatchObject({ status: 'kept' });
    // Another small list is no agreement: it waits for one more read.
    html = OTHER;
    clock.now += HOUR;
    expect(await service.refresh()).toMatchObject({ status: 'kept' });
    clock.now += HOUR;
    expect(await service.refresh()).toEqual({ status: 'updated', tasks: 1 });
    expect(service.tasks().map((task) => task.text)).toEqual(['Catch a Snorlax']);
    expect(service.readAt()).toBe(clock.now);
    expect(said('the research task list is out of date')).toBe(0);
  });

  it('takes a smaller list once the list in use is older than staleAfterHours', async () => {
    let html = readResearchPage();
    const { service, clock, said } = serviceWith(() => page(html));
    await service.refresh();
    html = SHRUNK;
    clock.now += 6 * HOUR;
    expect(await service.refresh()).toEqual({ status: 'updated', tasks: 1 });
    expect(service.tasks().map((task) => task.text)).toEqual(['Catch a Ditto']);
    // The list was read just now: it is not out of date.
    expect(said('the research task list is out of date')).toBe(0);
  });

  it('never takes a read of no tasks, however often it comes and however old the list (F5)', async () => {
    let html = readResearchPage();
    const { service, clock } = serviceWith(() => page(html));
    await service.refresh();
    // The page's shape with its tasks gone: two reads agree, and the list in use grows old.
    html = '<div class="task-category"><h2>Catching Tasks</h2></div>';
    clock.now += HOUR;
    expect(await service.refresh()).toMatchObject({ status: 'failed' });
    clock.now += 6 * HOUR;
    expect(await service.refresh()).toMatchObject({ status: 'failed' });
    expect(await service.refresh()).toMatchObject({ status: 'failed' });
    expect(service.tasks()).toHaveLength(58);
  });

  it('keeps its list when the page cannot be read: a refusal, no tasks, too large', async () => {
    let answer: () => ReturnType<FetchPage> = () => page();
    const { service } = serviceWith(() => answer());
    await service.refresh();
    answer = () => page('', { status: 503 });
    expect(await service.refresh()).toMatchObject({
      status: 'failed',
      reason: `${URL} answered 503`,
    });
    answer = () => page('<html>Maintenance</html>');
    expect(await service.refresh()).toMatchObject({ status: 'failed' });
    answer = () => page('x'.repeat(MAX_RESEARCH_PAGE_BYTES + 1));
    expect(await service.refresh()).toMatchObject({
      status: 'failed',
      reason: `${URL}: the page is too-large`,
    });
    expect(service.tasks()).toHaveLength(58);
  });

  it('says once that the list is out of date, until a read succeeds again', async () => {
    let fails = false;
    const { service, clock, said } = serviceWith(() =>
      fails ? Promise.reject(new Error('down')) : page(),
    );
    await service.refresh();
    fails = true;
    clock.now += 5 * HOUR;
    await service.refresh();
    expect(said('the research task list is out of date')).toBe(0);
    clock.now += 2 * HOUR;
    await service.refresh();
    await service.refresh();
    expect(said('the research task list is out of date')).toBe(1);
    fails = false;
    await service.refresh();
    fails = true;
    clock.now += 7 * HOUR;
    await service.refresh();
    expect(said('the research task list is out of date')).toBe(2);
  });

  it('says whether its list is out of date by the rule the log follows (plan 8R-3: the map)', async () => {
    const { service } = serviceWith(() => page());
    // Never read: out of date.
    expect(service.stale(NOW)).toBe(true);
    await service.refresh();
    expect(service.stale(NOW + 6 * HOUR - 1)).toBe(false);
    expect(service.stale(NOW + 6 * HOUR)).toBe(true);
  });

  it('reads at start only when its list is older than the refresh, then every refresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = new MemoryResearchTasks();
    await store.replace([listedTask('Make 2 Excellent Throws')], NOW - HOUR / 4);
    const { service, asked } = serviceWith(() => page(), store);
    await service.load();
    service.start();
    await vi.advanceTimersByTimeAsync(HOUR / 2);
    expect(asked).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(HOUR / 4);
    await service.whenIdle();
    expect(asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(HOUR);
    await service.whenIdle();
    expect(asked).toHaveLength(2);
    service.stop();
  });
});
