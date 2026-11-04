import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakePartyGateway,
  missingPermissions,
  networkAway,
} from '../../test/support/fake-gateway.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  testRegions,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { textOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import {
  pageTask,
  researchTasksFixture,
  researchTasksOfPage,
} from '../../test/support/research.js';
import { INTO_THE_WILD, PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
import { MemoryStopPosts } from '../../test/support/research-store.js';
import { feedChoice } from '../../test/support/rocket.js';
import { reportedStop } from '../../test/support/stop-report-cases.js';
import { rocketSubject } from './rocket-reports.js';
import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { taskKeyOf, type ResearchTask } from '../domain/research/task.js';
import type { TaskVersion } from '../domain/research/versions.js';
import type { ResearchEvent } from '../domain/time/research-events.js';
import type { PictureMaker } from './stop-pictures.js';
import { StopPostService } from './stop-posts.js';
import { MAX_POST_MESSAGES } from '../render/stop-post.js';
import { StopReportService } from './stop-reports.js';
import { zonedAt } from '../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const ASH = { id: '200000000000000061', name: 'Ash' };

/** Stops in West (`reportedStop` lies at 40.44: moved into West here) and one in East. */
const west = (n: number) => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
/** The line of `west(n)` in the post, reported by Ash: its name the link to its place (8R-7). */
const westLine = (n: number): string =>
  `- **[Yellow Mural ${String(n)}](<https://www.google.com/maps/search/?api=1&query=` +
  `${String((40_050 + n) / 1_000)}%2C-80.05>)** · Market Street · **Ash**`;

async function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
  const clock = { now: at('2026-11-21T10:00') };
  const { log, entries } = createTestLogger();
  const gateway = new FakePartyGateway();
  // The regions' boards (plan 8R-9): the summary posts of their forums, "Today’s Stops" below.
  gateway.addForum(WEST_FORUM);
  gateway.addForum(EAST_FORUM);
  const board = async (forumId: string): Promise<string> =>
    (await gateway.createPost(forumId, {
      title: 'Today and coming up',
      message: { content: 'The summary' },
      tagIds: [],
    })) ?? '';
  const westBoard = await board(WEST_FORUM);
  const eastBoard = await board(EAST_FORUM);
  const regions = testRegions().map((region) => ({
    ...region,
    summaryMessageId:
      region.channelId === WEST_CHANNEL
        ? westBoard
        : region.channelId === EAST_CHANNEL
          ? eastBoard
          : null,
  }));
  const storage = new MemoryStopPosts();
  // The reports; saved here directly, a report no listener hears of.
  const reportStore = new MemoryStopReports();
  // The research events, as `RaidEventService` gives them and tells of their changes.
  let events = initial;
  const listeners: (() => void)[] = [];
  const provider = {
    researchEvents: () => events,
    onResearchChange: (listener: () => void) => {
      listeners.push(listener);
    },
  };
  const setEvents = (changed: ResearchEvent[]) => {
    events = changed;
    for (const listener of listeners) listener();
  };
  const reports = new StopReportService({
    rewardHash: fixtureRewardHash,
    store: reportStore,
    events: provider,
    zone: ZONE,
    log,
    now: () => clock.now,
  });
  /** The channels whose post the summary was told changed (plan 8X-G), in order. */
  const changes: string[] = [];
  const make = () =>
    new StopPostService({
      storage,
      reports,
      events: provider,
      regions: { all: () => regions },
      guilds: {
        idFor: (id) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined),
        snowflakeOf: (row) => Promise.resolve(row === 1 ? FAKE_GUILD_ID : undefined),
      },
      gateway,
      zone: ZONE,
      log,
      now: () => clock.now,
      delayMs: 0,
      changed: (channelId) => changes.push(channelId),
      ...(pictures ? { pictures } : {}),
    });
  const posts = make();
  const report = (task: ResearchTask, stops = [west(1)]) =>
    reports.reportResearch({
      serverId: FAKE_GUILD_ID,
      stops,
      subject: {
        subjectKey: task.key,
        research: { text: task.text, category: task.category, rewards: task.rewards, typed: false },
      },
      reporter: ASH,
    });
  const reportVersion = (task: ResearchTask, version: TaskVersion, stops = [west(1)]) =>
    reports.reportResearch({
      serverId: FAKE_GUILD_ID,
      stops,
      subject: {
        subjectKey: version.value,
        research: {
          text: task.text,
          category: task.category,
          rewards: version.rewards,
          typed: false,
        },
      },
      reporter: ASH,
    });
  const said = (channelId = westBoard) =>
    gateway
      .messagesIn(channelId)
      .map(({ message }) => (message.v2 ? textOf(message) : (message.content ?? '')));
  return {
    clock,
    gateway,
    west: westBoard,
    east: eastBoard,
    regions,
    board,
    storage,
    reportStore,
    reports,
    posts,
    make,
    report,
    reportVersion,
    said,
    entries,
    setEvents,
    changes,
  };
}

describe('StopPostService', () => {
  let made: Awaited<ReturnType<typeof postsWith>> | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await made?.posts.close();
    made = undefined;
  });

  it('tells that the list of reports changed after a draw, whose links the map shows', async () => {
    made = await postsWith();
    const told: string[] = [];
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    made.reports.listen({
      listChanged: (serverId) => {
        // By then the message is known: the map's next ask links it.
        expect(
          made?.posts.linkOf(WEST_CHANNEL, taskKeyOf('Catch a Dragon-type Pokémon')),
        ).toBeDefined();
        told.push(serverId);
      },
    });
    await made.posts.flush();
    expect(told).toEqual([FAKE_GUILD_ID]);
  });

  it('posts in the region’s board at the first report of the day, silently, and edits it after (plan 8R-9)', async () => {
    made = await postsWith();
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)).toEqual([]);
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    expect(made.said()[0]).toContain('## Today’s Stops');
    expect(made.said()[0]).toContain('Saturday, November 21');
    expect(made.said()[0]).toContain(
      `**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew +4\n${westLine(1)}`,
    );
    // No follower of the board is pinged by it (B13); nothing in the text channel, no pin.
    expect(first?.silent).toBe(true);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(made.gateway.pinnedIn(made.west)).toEqual([]);
    // East has no report: no post.
    expect(made.gateway.messagesIn(made.east)).toEqual([]);

    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(1);
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
    expect([...made.storage.rows.values()]).toEqual([
      expect.objectContaining({
        channelId: WEST_CHANNEL,
        day: '2026-11-21',
        serverId: FAKE_GUILD_ID,
        threadId: made.west,
        messageIds: [first?.id],
      }),
    ]);
  });

  it('puts every version of a task in its one block, linked by each (plan 8R-5, R9)', async () => {
    made = await postsWith();
    const throws = pageTask('Make 3 Excellent Throws in a row');
    const versions = researchTasksFixture().versions(throws);
    const version = (label: string) => {
      const found = versions.find((one) => one.label === label);
      if (!found) throw new Error(`no version ${label}`);
      return found;
    };
    await made.reportVersion(throws, version('Gible'), [west(1)]);
    await made.reportVersion(throws, version('one of Larvitar, Beldum, Gible'), [west(2), west(3)]);
    await made.reportVersion(throws, version('Beldum'), [west(4)]);
    await made.report(pageTask('Catch 7 Pokémon'), [west(5), west(6), west(7)]);
    await made.posts.flush();
    const stop = westLine;
    // The task of most stops first; its rewards' stops, then those of "one of".
    expect(made.said()[0]).toContain(
      [
        '**Make 3 Excellent Throws in a row**',
        'Gible',
        stop(1),
        'Beldum',
        stop(4),
        'one of Larvitar, Beldum, Gible',
        stop(2),
        stop(3),
      ].join('\n'),
    );
    expect(made.said()[0]).toContain(
      `**Catch 7 Pokémon** · one of Magikarp, Stufful, Wimpod\n${stop(5)}`,
    );
    expect(made.said()[0]?.indexOf('Make 3 Excellent')).toBeLessThan(
      made.said()[0]?.indexOf('Catch 7') ?? 0,
    );
    // Every version and the task's key alone link the block's message, in the board post (B1);
    // the tasks are counted.
    const [first] = made.gateway.messagesIn(made.west);
    for (const key of [throws.key, version('Gible').value, version('Beldum').value]) {
      expect(await made.posts.messageOf(WEST_CHANNEL, key)).toEqual({
        channelId: made.west,
        messageId: first?.id,
      });
    }
    expect(made.posts.summaryOf(WEST_CHANNEL)?.tasks).toBe(2);
  });

  /** A task of an event's own heading (plan 8R-8), made of a task of the page. */
  const eventTask = (text: string): ResearchTask => ({
    ...pageTask('Catch 7 Pokémon'),
    key: taskKeyOf(text),
    text,
    category: 'Ultra Unlock: Water Festival',
  });

  it('puts an event’s tasks first, then the rest, each by most stops (plan 8R-8)', async () => {
    made = await postsWith();
    const typedText = 'Win 3 raids in the rain';
    // A typed task (no category of the page) is not an event's, reported before them all.
    await made.reports.reportResearch({
      serverId: FAKE_GUILD_ID,
      stops: [west(20)],
      subject: {
        subjectKey: `typed:${taskKeyOf(typedText)}`,
        research: { text: typedText, category: null, rewards: [], typed: true },
      },
      reporter: ASH,
    });
    await made.report(pageTask('Catch 7 Pokémon'), [west(1), west(2), west(3), west(4), west(5)]);
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(6), west(7)]);
    await made.report(eventTask('Make 3 Splash Throws'), [west(8)]);
    await made.report(eventTask('Catch 3 Water-type Pokémon'), [west(9), west(10)]);
    await made.posts.flush();
    const text = made.said()[0] ?? '';
    const order = [
      'Catch 3 Water-type Pokémon',
      'Make 3 Splash Throws',
      'Catch 7 Pokémon',
      'Catch a Dragon-type Pokémon',
      typedText,
    ].map((task) => text.indexOf(`**${task}**`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('cuts the ordinary tasks of a busy day before an event’s (plan 8R-8)', async () => {
    made = await postsWith();
    const tasks = researchTasksOfPage();
    const spread = (k: number) =>
      reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
    // Every task of the page at fifteen stops of its own (plan 8R-9F: ten messages to fill),
    // reported five at a time.
    for (const [n, task] of tasks.entries()) {
      for (let at = 0; at < 15; at += 5) {
        await made.report(
          task,
          Array.from({ length: 5 }, (_, i) => spread(n * 15 + at + i)),
        );
      }
    }
    // The event's task at one stop, reported last.
    await made.report(eventTask('Make 3 Splash Throws'), [spread(tasks.length * 15)]);
    await made.posts.flush();
    const said = made.said();
    expect(said).toHaveLength(MAX_POST_MESSAGES);
    expect(said.at(-1)).toMatch(/…and \d+ more tasks$/);
    expect(said[0]).toContain('**Make 3 Splash Throws**');
    expect(said[0]?.indexOf('**Make 3 Splash Throws**')).toBeLessThan(
      said[0]?.indexOf(`**${tasks[0]?.text ?? ''}**`) ?? 0,
    );
  });

  it('groups a report of before plan 8R-5 under the version it is (review R2)', async () => {
    made = await postsWith();
    const excellent = pageTask('Make 2 Excellent Throws');
    const great = pageTask('Make 3 Great Throws in a row');
    const versionOf = (task: ResearchTask, label: string) => {
      const found = researchTasksFixture()
        .versions(task)
        .find((one) => one.label === label);
      if (!found) throw new Error(`no version ${label}`);
      return found;
    };
    // A task of one reward: its key alone (before) and its reward's version are one.
    await made.report(excellent, [west(1)]);
    await made.reportVersion(excellent, versionOf(excellent, 'Dratini'), [west(2)]);
    // "One of" before (every reward, items too) and now: one group, in the newer words.
    await made.report(great, [west(3)]);
    await made.reportVersion(great, versionOf(great, 'one of Lileep, Anorith'), [west(4)]);
    await made.reportVersion(great, versionOf(great, 'Lileep'), [west(5)]);
    await made.posts.flush();
    const stop = westLine;
    const [text] = made.said();
    expect(text).toContain(`**Make 2 Excellent Throws** · Dratini\n${stop(1)}\n${stop(2)}`);
    expect(text).toContain(
      [
        '**Make 3 Great Throws in a row**',
        'Lileep',
        stop(5),
        'one of Lileep, Anorith',
        stop(3),
        stop(4),
      ].join('\n'),
    );
  });

  it('tells the summary what its post holds and when it changes, and when it goes (plan 8X-G)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = await postsWith();
    await made.posts.start();
    expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    // Arlo at two stops is one hideout, as the post counts its blocks (review r0 C2).
    for (const stop of [west(3), west(4)]) {
      await made.reports.reportRocket({
        serverId: FAKE_GUILD_ID,
        stop,
        subject: rocketSubject(feedChoice('leader:arlo')),
        reporter: ASH,
      });
    }
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    expect(made.said()[0]).toMatch(/\*\*Arlo\*\*[^\n]*\n- \*\*[^\n]+\n- \*\*/);
    expect(made.posts.summaryOf(WEST_CHANNEL)).toEqual({
      serverId: FAKE_GUILD_ID,
      threadId: made.west,
      messageId: first?.id,
      tasks: 2,
      hideouts: 1,
    });
    expect(made.changes).toContain(WEST_CHANNEL);
    expect(made.changes).not.toContain(EAST_CHANNEL);
    expect(made.posts.summaryOf(EAST_CHANNEL)).toBeUndefined();
    // At midnight the post goes, and the summary is told.
    made.changes.length = 0;
    made.clock.now = at('2026-11-22T00:00:01');
    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)).toEqual([]);
    expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
    expect(made.changes).toContain(WEST_CHANNEL);
  });

  it('shows the hideouts of the day after the research; a grunt makes no post (8R-2)', async () => {
    made = await postsWith();
    const rocket = (key: string, stop = west(1)) =>
      made!.reports.reportRocket({
        serverId: FAKE_GUILD_ID,
        stop,
        subject: rocketSubject(feedChoice(key)),
        reporter: ASH,
      });
    await rocket('grunt:water');
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)).toEqual([]);
    // A hideout makes the day's post where none is.
    const arlo = await rocket('leader:arlo', west(2));
    await made.posts.flush();
    expect(made.said()[0]).toContain(
      `### Team GO Rocket hideouts\n**Arlo** · catch Alolan Grimer\n${westLine(2)}`,
    );
    expect(made.said()[0]).not.toContain('Water-type grunt');
    const [post] = made.gateway.messagesIn(made.west);
    expect(await made.posts.messageOf(WEST_CHANNEL, 'leader:arlo')).toEqual({
      channelId: made.west,
      messageId: post?.id,
    });
    // Under an event's window the hideouts stand: they belong to the day.
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    made.setEvents([PAWNIARD_DAY]);
    made.clock.now = at('2026-11-21T15:00');
    await made.posts.flush();
    expect(made.said()[0]).toContain('**Arlo** · catch Alolan Grimer');
    // A grunt in its place takes it out.
    if (arlo.kind !== 'reported') throw new Error('not reported');
    await made.reports.reportRocket({
      serverId: FAKE_GUILD_ID,
      stop: west(2),
      subject: rocketSubject(feedChoice('grunt:fire')),
      reporter: ASH,
      replacing: arlo.report.id,
    });
    await made.posts.flush();
    expect(made.said()[0]).not.toContain('Arlo');
  });

  it('shows a stop in the post of each region it lies in, and only there', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [east]);
    await made.posts.flush();
    expect(made.said(made.west)).toEqual([]);
    expect(made.said(made.east)[0]).toContain('Yellow Mural 90');
  });

  it('draws only the posts of the regions a report’s stops lie in (F2)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(1), east]);
    await made.posts.flush();
    const [westPost] = made.gateway.messagesIn(made.west);
    const [eastPost] = made.gateway.messagesIn(made.east);
    // A report in East, and one taken back there: West's post is left alone.
    const { saved } = await made.report(pageTask('Catch 7 Pokémon'), [east]);
    await made.posts.flush();
    await made.reports.takeBack(FAKE_GUILD_ID, [saved[0]!.report.id], ASH.id, 'member');
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(0);
    expect(made.gateway.calls.filter((call) => call.includes(westPost?.id ?? '-'))).toEqual([]);
    expect(made.gateway.messagesIn(made.east)[0]?.id).toBe(eastPost?.id);
    expect(made.gateway.messagesIn(made.east)[0]?.edits).toBe(2);
  });

  it('removes the reactions on its message in the board when it edits it (plan 8R-9G)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    made.gateway.react(first?.id ?? '', 2);
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(first?.edits).toBe(1);
    expect(made.gateway.reactionsCleared).toEqual([first?.id]);
    // Where the bot may not remove them, they stay, and the edit is drawn all the same.
    made.gateway.react(first?.id ?? '');
    made.gateway.noManaging.add(WEST_FORUM);
    await made.report(pageTask('Catch 7 Pokémon'), [west(3)]);
    await made.posts.flush();
    expect(first?.edits).toBe(2);
    expect(made.said()[0]).toContain('Yellow Mural 3');
    expect(made.gateway.reactions.get(first?.id ?? '')).toBe(1);
  });

  it('makes no edit where a redraw would show the same (F2)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    // An event that ended days ago changes nothing of today's post, though every post is drawn.
    made.setEvents([INTO_THE_WILD]);
    await made.posts.flush();
    // The same task again at the same stop: its report is replaced, the post reads the same.
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(0);
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(1);
  });

  it('keeps its message when an edit fails, and draws it at the next change (F3)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    made.gateway.failing.set('editMessage', new Error('503 Service Unavailable'));
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.deleted).toEqual([]);
    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
    expect(
      made.entries.filter((entry) => entry.msg === 'could not draw the post of the stops'),
    ).toHaveLength(1);
    made.gateway.failing.delete('editMessage');
    await made.report(pageTask('Catch 7 Pokémon'), [west(3)]);
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
    expect(made.said()[0]).toContain('Yellow Mural 3');
  });

  it('draws on a catch-up a post whose edit failed while the network was away (plan 8X-H)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    made.gateway.failing.set('editMessage', new Error('getaddrinfo ENOTFOUND discord.com'));
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    made.gateway.failing.delete('editMessage');
    expect(made.said()[0]).not.toContain('Yellow Mural 2');
    await made.posts.catchUp();
    expect(made.said()[0]).toContain('Yellow Mural 2');
    // A post that is current is not edited again.
    const edits = made.gateway.messagesIn(made.west)[0]?.edits;
    await made.posts.catchUp();
    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(edits);
  });

  it('sends a message anew whose edit Discord refuses after a restart, its kind not known (F3)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    // While the bot was down it lost Embed Links: the v2 message cannot be made plain.
    made.gateway.noEmbeds.add(made.west);
    made.posts = made.make();
    await made.posts.start();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
    const ids = made.gateway.messagesIn(made.west).map((one) => one.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe(first?.id);
    expect(made.gateway.messagesIn(made.west)[0]?.message.v2).not.toBe(true);
  });

  it('keeps its message when an edit fails after a restart for another reason (G1)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    made.gateway.failing.set('editMessage', new Error('503 Service Unavailable'));
    made.posts = made.make();
    await expect(made.posts.start()).rejects.toThrow('503 Service Unavailable');
    made.gateway.failing.delete('editMessage');
    expect(made.gateway.deleted).toEqual([]);
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
  });

  it('sends the post anew as plain text once the bot may no longer embed (F3)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    made.gateway.noEmbeds.add(made.west);
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
    const [plain] = made.gateway.messagesIn(made.west).filter((one) => one.id !== first?.id);
    expect(plain?.message.v2).not.toBe(true);
    expect(made.said().at(-1)).toContain('**Catch 7 Pokémon**');
  });

  it('spills into further messages, ten at most (plan 8R-9F), then counts what is left', async () => {
    made = await postsWith();
    const tasks = researchTasksOfPage();
    // At fifteen stops of their own each, the page's tasks do not fit ten messages even without
    // pictures (plan 8R-6: no task is cut for pictures).
    const spread = (k: number) =>
      reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
    // Every task of the page at fifteen stops of its own (plan 8R-9F: ten messages to fill),
    // reported five at a time.
    for (const [n, task] of tasks.entries()) {
      for (let at = 0; at < 15; at += 5) {
        await made.report(
          task,
          Array.from({ length: 5 }, (_, i) => spread(n * 15 + at + i)),
        );
      }
    }
    await made.posts.flush();
    const messages = made.gateway.messagesIn(made.west);
    expect(messages).toHaveLength(MAX_POST_MESSAGES);
    for (const { message } of messages) {
      if (!message.v2) throw new Error('the post is components v2 here');
      expectV2Sendable(message);
    }
    expect(made.said().at(-1)).toMatch(/…and \d+ more tasks$/);
    expect(made.said()[1]).toMatch(/^-# Today’s Stops, continued \(2\)/);
    // A DM of a task links to the message that holds it; none for a task only counted.
    const shownIn = (n: number) =>
      tasks.find((task) => made?.said()[n]?.includes(`**${task.text}**`) === true);
    const unshown = tasks.find(
      (task) => made?.said().every((text) => !text.includes(`**${task.text}**`)) === true,
    );
    expect(await made.posts.messageOf(WEST_CHANNEL, shownIn(0)?.key ?? '')).toEqual({
      channelId: made.west,
      messageId: messages[0]?.id,
    });
    expect(
      await made.posts.messageOf(WEST_CHANNEL, shownIn(MAX_POST_MESSAGES - 1)?.key ?? ''),
    ).toEqual({
      channelId: made.west,
      messageId: messages.at(-1)?.id,
    });
    expect(await made.posts.messageOf(EAST_CHANNEL, shownIn(0)?.key ?? '')).toBeUndefined();
    expect(unshown).toBeDefined();
    // A task only counted: the post's first message, as `linkOf` (P9).
    expect(await made.posts.messageOf(WEST_CHANNEL, unshown?.key ?? '')).toEqual({
      channelId: made.west,
      messageId: messages[0]?.id,
    });
  });

  it('answers for one channel while another channel’s redraw is still on its way (R2)', async () => {
    made = await postsWith();
    const task = pageTask('Catch a Dragon-type Pokémon');
    await made.report(task, [west(1), east]);
    await made.posts.flush();
    // East's redraw hangs at its edit until released.
    let release = (): void => undefined;
    let eastHangs = false;
    const edit = made.gateway.editMessage.bind(made.gateway);
    const eastBoard = made.east;
    made.gateway.editMessage = (channelId, messageId, message, options) => {
      if (channelId !== eastBoard) return edit(channelId, messageId, message, options);
      eastHangs = true;
      return new Promise((resolve) => {
        release = () => {
          resolve(edit(channelId, messageId, message, options));
        };
      });
    };
    // East's reports changed unheard (a redraw that would show the same makes no edit), and an
    // event of days ago draws every post anew: East's is edited.
    const [shown] = await made.reports.standing(FAKE_GUILD_ID);
    if (!shown) throw new Error('no report');
    await made.reportStore.save({ ...shown, stop: reportedStop(91, { lat: 40.06, lon: -79.95 }) });
    made.setEvents([INTO_THE_WILD]);
    // Answered while East's redraw still waits (a hang here is the fault).
    const link = await made.posts.messageOf(WEST_CHANNEL, task.key);
    expect(link?.messageId).toBe(made.gateway.messagesIn(made.west)[0]?.id);
    expect(eastHangs).toBe(true);
    release();
    await made.posts.flush();
  });

  it('answers which message holds a task once the change that waits is drawn', async () => {
    made = await postsWith();
    const task = pageTask('Catch a Dragon-type Pokémon');
    await made.report(task);
    // Not flushed: `messageOf` draws what waits for the channel first.
    const link = await made.posts.messageOf(WEST_CHANNEL, task.key);
    expect(link?.messageId).toBe(made.gateway.messagesIn(made.west)[0]?.id);
    expect(link?.messageId).toBeDefined();
  });

  it('says which message holds a task as last drawn, drawing nothing itself (plan 8R-3)', async () => {
    made = await postsWith();
    const task = pageTask('Catch a Dragon-type Pokémon');
    await made.report(task);
    // Not drawn yet, and asking draws nothing: the map asks on every poll.
    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toBeUndefined();
    expect(made.gateway.messagesIn(made.west)).toEqual([]);
    await made.posts.flush();
    const [post] = made.gateway.messagesIn(made.west);
    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toEqual({
      channelId: made.west,
      messageId: post?.id,
    });
    // A task the post does not hold (one counted only): its first message.
    expect(made.posts.linkOf(WEST_CHANNEL, 'nothing')).toEqual({
      channelId: made.west,
      messageId: post?.id,
    });
    expect(made.posts.linkOf(EAST_CHANNEL, task.key)).toBeUndefined();
    // Past midnight, before the timer draws the posts anew: yesterday's post is no link.
    made.clock.now = at('2026-11-22T00:00:01');
    expect(made.posts.linkOf(WEST_CHANNEL, task.key)).toBeUndefined();
    expect(made.posts.linkOf(WEST_CHANNEL, 'nothing')).toBeUndefined();
  });

  it('is plain text where the bot may not post embeds', async () => {
    made = await postsWith();
    made.gateway.noEmbeds.add(made.west);
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [message] = made.gateway.messagesIn(made.west);
    expect(message?.message.v2).not.toBe(true);
    expect(made.said()[0]).toContain('**Catch a Dragon-type Pokémon**');
  });

  it('is plain text where the bot may not embed in the board’s forum (B6)', async () => {
    made = await postsWith();
    made.gateway.noEmbeds.add(WEST_FORUM);
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [message] = made.gateway.messagesIn(made.west);
    expect(message?.message.v2).not.toBe(true);
  });

  it('writes in the open board without Manage Posts, and not in one a moderator locked (plan 8R-9F, B5)', async () => {
    made = await postsWith();
    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)).toHaveLength(1);
    made.gateway.posts.get(made.west)!.locked = true;
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.said()[0]).not.toContain('Catch 7 Pokémon');
    expect(
      made.entries.filter((entry) => entry.msg === 'the bot may not write in the board post'),
    ).toHaveLength(1);
  });

  it('writes nothing where the bot may not write in the board, said once (B6)', async () => {
    made = await postsWith();
    made.gateway.refusePosts.set(WEST_FORUM, ['Send Messages in Posts']);
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)).toEqual([]);
    expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
    expect(await made.posts.messageOf(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key)).toBe(
      undefined,
    );
    expect(
      made.entries.filter((entry) => entry.msg === 'the bot may not write in the board post'),
    ).toHaveLength(1);
    // Allowed again: the post is drawn at the next change.
    made.gateway.refusePosts.delete(WEST_FORUM);
    await made.report(pageTask('Catch 7 Pokémon'), [west(3)]);
    await made.posts.flush();
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
  });

  it('draws nothing while the region has no board, said once, and draws it when it comes (B10)', async () => {
    made = await postsWith();
    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
    westRegion.summaryMessageId = null;
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.messages).toEqual([]);
    expect(
      made.entries.filter((entry) => entry.msg === 'the region has no board post'),
    ).toHaveLength(1);
    // The board is there again: a turn-over (here the catch-up) draws the region told as
    // undrawn (P6), without a report or a word from the party service.
    westRegion.summaryMessageId = made.west;
    await made.posts.catchUp();
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
  });

  it('draws the region’s post when the party service makes its board (B2)', async () => {
    made = await postsWith();
    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
    westRegion.summaryMessageId = null;
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    westRegion.summaryMessageId = made.west;
    made.posts.boardChanged(WEST_CHANNEL);
    await made.posts.flush();
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
  });

  it('tells the summary when the board is gone, so that it is made anew (P2)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    // The board was deleted by hand: the edit finds no message, the send no thread.
    made.gateway.gone.add(made.west);
    made.changes.length = 0;
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.changes).toContain(WEST_CHANNEL);
  });

  it('tells who listens of a post drawn in full, never of one whose send failed (plan 8R-9F, M2)', async () => {
    made = await postsWith();
    const drawn: string[] = [];
    made.posts.onDrawn((channelId) => drawn.push(channelId));
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    expect(drawn).toEqual([WEST_CHANNEL]);
    // The board deleted by hand: the send finds no thread, and nothing is told.
    made.gateway.gone.add(made.west);
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(drawn).toEqual([WEST_CHANNEL]);
    // The board made anew: drawn in full there, told.
    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
    westRegion.summaryMessageId = await made.board(WEST_FORUM);
    made.posts.boardChanged(WEST_CHANNEL);
    await made.posts.flush();
    expect(drawn).toEqual([WEST_CHANNEL, WEST_CHANNEL]);
  });

  it('sends every message anew into a board that replaced the one it was drawn in (B2)', async () => {
    made = await postsWith();
    const tasks = researchTasksOfPage();
    for (let n = 0; n < 30; n++) await made.report(tasks[n]!, [west(n)]);
    await made.posts.flush();
    const old = made.gateway.messagesIn(made.west).map((one) => one.id);
    expect(old.length).toBeGreaterThan(1);
    // The summary post was replaced (deleted with its thread, a new one made).
    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
    const replaced = await made.board(WEST_FORUM);
    westRegion.summaryMessageId = replaced;
    made.posts.boardChanged(WEST_CHANNEL);
    await made.posts.flush();
    expect(made.gateway.messagesIn(replaced)).toHaveLength(old.length);
    expect(made.said(replaced)[0]).toContain('## Today’s Stops');
    // The old board's messages went (P5): a post taken over must not keep a second copy.
    expect(made.gateway.messagesIn(made.west)).toEqual([]);
    expect([...made.storage.rows.values()]).toEqual([
      expect.objectContaining({
        threadId: replaced,
        messageIds: made.gateway.messagesIn(replaced).map((one) => one.id),
      }),
    ]);
    expect((await made.posts.messageOf(WEST_CHANNEL, tasks[0]!.key))?.channelId).toBe(replaced);
  });

  it('never opens an archived old board to clear it (review R2)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    // The old board was archived (a post taken over left it), and another one recorded.
    await made.gateway.archivePost(made.west);
    const westRegion = made.regions.find((region) => region.channelId === WEST_CHANNEL)!;
    const replaced = await made.board(WEST_FORUM);
    westRegion.summaryMessageId = replaced;
    made.posts.boardChanged(WEST_CHANNEL);
    await made.posts.flush();
    expect(made.gateway.posts.get(made.west)).toMatchObject({ archived: true, reopened: 0 });
    expect(made.said(replaced)[0]).toContain('**Catch 7 Pokémon**');
    expect([...made.storage.rows.values()]).toEqual([
      expect.objectContaining({ threadId: replaced }),
    ]);
  });

  it('sends a message anew with every message after it, so the order stays (B5)', async () => {
    made = await postsWith();
    const tasks = researchTasksOfPage();
    const spread = (k: number) =>
      reportedStop(k, { lat: 40.01 + (k % 80) / 1_000, lon: -80.09 + Math.floor(k / 80) / 1_000 });
    // Every task of the page at fifteen stops of its own (plan 8R-9F: ten messages to fill),
    // reported five at a time.
    for (const [n, task] of tasks.entries()) {
      for (let at = 0; at < 15; at += 5) {
        await made.report(
          task,
          Array.from({ length: 5 }, (_, i) => spread(n * 15 + at + i)),
        );
      }
    }
    await made.posts.flush();
    const [first, second, ...after] = made.gateway.messagesIn(made.west).map((one) => one.id);
    expect(after).toHaveLength(MAX_POST_MESSAGES - 2);
    await made.posts.close();
    // The second message was deleted by hand while the bot was down.
    made.gateway.gone.add(second ?? '');
    const sentBefore = made.gateway.messages.length;
    made.posts = made.make();
    await made.posts.start();
    const now = made.gateway.messagesIn(made.west).filter((one) => !made?.gateway.gone.has(one.id));
    expect(now.map((one) => one.id)[0]).toBe(first);
    expect(now).toHaveLength(MAX_POST_MESSAGES);
    // Every message after it deleted, and the nine sent anew in order below the first, by the
    // fake's send log (B10: up to nine deletes and nine sends).
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(expect.arrayContaining(after));
    const resent = made.gateway.messages.slice(sentBefore);
    expect(resent.map((one) => one.id)).toEqual(now.slice(1).map((one) => one.id));
    expect(resent.map((one) => textOf(one.message).split('\n')[0])).toEqual(
      Array.from(
        { length: MAX_POST_MESSAGES - 1 },
        (_, i) => `-# Today’s Stops, continued (${String(i + 2)})`,
      ),
    );
  });

  it('moves a pinned post of the text channel into the board at start, older days’ too (B11)', async () => {
    made = await postsWith();
    await made.posts.close();
    // What the bot before plan 8R-9 left: today's post pinned in the text channel, and
    // yesterday's, whose delete failed.
    const today = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Old post' })) ?? '';
    const yesterday = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Older' })) ?? '';
    made.gateway.pin(WEST_CHANNEL, today);
    made.gateway.pin(WEST_CHANNEL, yesterday);
    for (const [day, id] of [
      ['2026-11-20', yesterday],
      ['2026-11-21', today],
    ] as const) {
      await made.storage.save({
        channelId: WEST_CHANNEL,
        day,
        serverId: FAKE_GUILD_ID,
        threadId: null,
        messageIds: [id],
        leftover: [],
        updatedAt: at(`${day}T09:00`),
      });
    }
    await made.report(pageTask('Catch 7 Pokémon'));
    made.posts = made.make();
    await made.posts.start();
    expect(made.gateway.deleted.map((one) => one.messageId).sort()).toEqual(
      [today, yesterday].sort(),
    );
    expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual([]);
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
    expect([...made.storage.rows.values()]).toEqual([
      expect.objectContaining({ day: '2026-11-21', threadId: made.west }),
    ]);
  });

  it('keeps an old post whose delete fails, and deletes it at the next catch-up (P1)', async () => {
    made = await postsWith();
    await made.posts.close();
    const old = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Old post' })) ?? '';
    await made.storage.save({
      channelId: WEST_CHANNEL,
      day: '2026-11-21',
      serverId: FAKE_GUILD_ID,
      threadId: null,
      messageIds: [old],
      leftover: [],
      updatedAt: at('2026-11-21T09:00'),
    });
    await made.report(pageTask('Catch 7 Pokémon'));
    made.gateway.failing.set('deleteMessage', networkAway());
    made.posts = made.make();
    await made.posts.start();
    // Today's post is drawn in the board all the same; the old message stays kept with it.
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
    expect([...made.storage.rows.values()]).toEqual([
      expect.objectContaining({ threadId: made.west, leftover: [old] }),
    ]);
    made.gateway.failing.clear();
    await made.posts.catchUp();
    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(old);
    expect([...made.storage.rows.values()]).toEqual([
      expect.objectContaining({ threadId: made.west, leftover: [] }),
    ]);
  });

  it('keeps yesterday’s row when its delete fails at midnight, and deletes it at start (P1)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    made.clock.now = at('2026-11-22T08:00');
    made.gateway.failing.set('deleteMessage', networkAway());
    made.posts = made.make();
    await made.posts.start();
    expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-21']);
    made.gateway.failing.clear();
    await made.posts.close();
    made.posts = made.make();
    await made.posts.start();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('deletes yesterday’s post whose midnight delete failed at the channel’s next draw (review W2)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    // Midnight's turn-over cannot delete it; today's post is drawn while deletes still fail.
    made.clock.now = at('2026-11-22T08:00');
    made.gateway.failing.set('deleteMessage', networkAway());
    await made.posts.catchUp();
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.deleted).toEqual([]);
    // Deletes work again: the next draw of the channel deletes it, before any turn-over.
    made.gateway.failing.clear();
    await made.report(pageTask('Catch 7 Pokémon'), [west(3)]);
    await made.posts.flush();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
    expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-22']);
  });

  it('under an intra-day event, shows its tasks, then the day’s research and when it comes back', async () => {
    made = await postsWith([PAWNIARD_DAY]);
    await made.report(pageTask('Catch 7 Pokémon'), [west(1), west(2)]);
    made.clock.now = at('2026-11-21T15:00');
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(3)]);
    await made.posts.flush();
    const shown = made.said()[0] ?? '';
    expect(shown).toContain('**Pawniard Community Day**: its tasks until <t:');
    // The day's research stays, below the window's, under its heading (plan 8R-6).
    const heading = `### Back at <t:${String(PAWNIARD_DAY.end / 1_000)}:t>, after Pawniard Community Day`;
    expect(shown.indexOf('Catch a Dragon-type Pokémon')).toBeGreaterThan(0);
    expect(shown.indexOf(heading)).toBeGreaterThan(shown.indexOf('Catch a Dragon-type Pokémon'));
    expect(shown.indexOf('Catch 7 Pokémon')).toBeGreaterThan(shown.indexOf(heading));
    expect(shown).not.toContain('comes back');
  });

  it('tells the summary of the day’s research waiting under a window, and when it comes back', async () => {
    made = await postsWith([PAWNIARD_DAY]);
    await made.report(pageTask('Catch 7 Pokémon'), [west(1), west(2)]);
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(3)]);
    // Drawn under the window: only the day's research, waiting; the summary links it all the same.
    made.clock.now = at('2026-11-21T15:00');
    await made.posts.flush();
    expect(made.said()[0]).toContain('### Back at');
    expect(made.posts.summaryOf(WEST_CHANNEL)).toMatchObject({
      tasks: 0,
      hideouts: 0,
      waiting: { tasks: 2, at: PAWNIARD_DAY.end },
    });
    // A task waiting below the window is held by its message too: its line links it (plan 8R-9).
    const [message] = made.gateway.messagesIn(made.west);
    expect(await made.posts.messageOf(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key)).toEqual({
      channelId: made.west,
      messageId: message?.id,
    });
  });

  it('has the post’s pictures made before it is drawn, and names each as the pictures give it (plan 8R-6)', async () => {
    const prepared: { sources: string[]; sentBefore: number }[] = [];
    const looked = (source: string) =>
      `https://map.example.test/pictures/${String(source.length)}.png`;
    made = await postsWith([], {
      prepare: (sources) => {
        prepared.push({
          sources: [...sources],
          sentBefore: made?.gateway.messagesIn(made.west).length ?? -1,
        });
        return Promise.resolve();
      },
      url: looked,
    });
    const task = pageTask('Make 3 Great Throws in a row');
    const [lileep] = researchTasksFixture().versions(task);
    if (!lileep) throw new Error('a version');
    await made.reportVersion(task, lileep);
    await made.posts.flush();
    const source = lileep.rewards[0]?.image ?? '';
    expect(prepared).toEqual([{ sources: [source], sentBefore: 0 }]);
    const [post] = made.gateway.messagesIn(made.west);
    expect(JSON.stringify(post?.message)).toContain(looked(source));
    expect(JSON.stringify(post?.message)).not.toContain(source);
  });

  it('says a multi-day event’s tasks hold until midnight, and its last day’s until its hour (B7)', async () => {
    made = await postsWith([INTO_THE_WILD]);
    made.clock.now = at('2026-11-10T12:00');
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    expect(made.said()[0]).toContain('**Into the Wild**: its tasks until midnight.');
    made.clock.now = at('2026-11-13T12:00');
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.said()[0]).toContain(
      `**Into the Wild**: its tasks until <t:${String(INTO_THE_WILD.end / 1_000)}:t>.`,
    );
  });

  it('deletes the post once its day has ended, and at start one a restart left', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    // A restart after midnight: the post of yesterday goes, from the board.
    made.clock.now = at('2026-11-22T08:00');
    made.posts = made.make();
    await made.posts.start();
    expect(made.gateway.deleted).toEqual([{ channelId: made.west, messageId: first?.id }]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('forgets a post whose delete Discord refuses for good, said once (review R1)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    await made.posts.close();
    // An old message pinned in the text channel too, which the bot may not delete either.
    const old = (await made.gateway.sendMessage(WEST_CHANNEL, { content: 'Old post' })) ?? '';
    const [row] = [...made.storage.rows.values()];
    if (!row) throw new Error('no row');
    await made.storage.save({ ...row, leftover: [old] });
    made.gateway.failing.set('deleteMessage', missingPermissions('DELETE'));
    made.clock.now = at('2026-11-22T08:00');
    made.posts = made.make();
    await made.posts.start();
    await made.posts.catchUp();
    expect(made.storage.rows.size).toBe(0);
    expect(
      made.entries.filter(
        (entry) => entry.msg === 'the bot may not delete a message of the post of the stops',
      ),
    ).toHaveLength(1);
    made.gateway.failing.clear();
  });

  it('deletes the post at midnight by its timer, computed in the zone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = await postsWith();
    await made.posts.start();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00') - made.clock.now - 1_000);
    expect(made.gateway.deleted).toEqual([]);
    made.clock.now = at('2026-11-22T00:00:01');
    await vi.advanceTimersByTimeAsync(2_000);
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west)).toEqual([]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('draws today’s post at start where yesterday’s stood (A2)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [yesterday] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    // After midnight, a report stands while no post service listened (a restart).
    made.clock.now = at('2026-11-22T08:00');
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    made.posts = made.make();
    await made.posts.start();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([yesterday?.id]);
    expect(made.said()).toEqual([expect.stringContaining('**Catch 7 Pokémon**')]);
    expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-22']);
  });

  it('draws the posts anew when the research events change, and keeps its timer (A5)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = await postsWith();
    await made.posts.start();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    expect(made.said()[0]).not.toContain('Pawniard');
    // The feed now has an event on today, from 09:00: the post shows it at once.
    made.setEvents([{ ...PAWNIARD_DAY, start: at('2026-11-21T09:00') }]);
    await made.posts.flush();
    expect(made.said()[0]).toContain('**Pawniard Community Day**: its tasks until');
    expect(made.said()[0]).toContain('### Back at');
    // Its end is the next change: the timer follows the events.
    made.clock.now = PAWNIARD_DAY.end + 1_000;
    await vi.advanceTimersByTimeAsync(PAWNIARD_DAY.end - at('2026-11-21T10:00') + 2_000);
    await made.posts.flush();
    expect(made.said()[0]).not.toContain('Pawniard');
  });

  it('warns, not errs, when the network fails the turn-over at a period change (review F5)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = await postsWith();
    await made.posts.start();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.posts.flush();
    made.setEvents([{ ...PAWNIARD_DAY, start: at('2026-11-21T09:00') }]);
    await made.posts.flush();
    // The event ends while the network is away: the post cannot be drawn without it.
    made.gateway.failing.set('editMessage', networkAway());
    made.clock.now = PAWNIARD_DAY.end + 1_000;
    await vi.advanceTimersByTimeAsync(PAWNIARD_DAY.end - at('2026-11-21T10:00') + 2_000);
    await made.posts.flush();
    made.gateway.failing.clear();
    const turnOver = made.entries.filter(
      (entry) => entry.msg === 'could not turn the posts of the stops over',
    );
    expect(turnOver.map((entry) => entry.level)).toEqual([40]);
  });

  it('keeps its timer when its start cannot read the kept posts (A5)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = await postsWith();
    made.storage.failing.set('all', new Error('database is down'));
    await expect(made.posts.start()).rejects.toThrow('database is down');
    expect(vi.getTimerCount()).toBe(1);
    made.storage.failing.clear();
  });

  it('keeps each message of the post as soon as it is sent (A9)', async () => {
    made = await postsWith();
    const kept: string[][] = [];
    const send = made.gateway.sendMessage.bind(made.gateway);
    const { storage } = made;
    made.gateway.sendMessage = (channelId, message, options) => {
      kept.push([...storage.rows.values()].flatMap((row) => row.messageIds));
      return send(channelId, message, options);
    };
    for (let n = 0; n < 30; n++) await made.report(researchTasksOfPage()[n]!, [west(n)]);
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    // The second message is sent with the first one kept already.
    expect(kept.slice(0, 2)).toEqual([[], [first?.id]]);
  });

  it('draws the kept post, not a second one, at a report after a failed start (F6)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    made.posts = made.make();
    made.storage.failing.set('all', new Error('database is down'));
    await expect(made.posts.start()).rejects.toThrow('database is down');
    made.storage.failing.clear();
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.posts.flush();
    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([first?.id]);
    expect(made.said()[0]).toContain('**Catch 7 Pokémon**');
  });

  it('draws the kept post, not a second one, at a report while the start reads (F6)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [first] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    // The start's read of the kept posts is slow: what it read (one message) comes after the
    // reports have been drawn, the post spilling into a second message meanwhile.
    const all = made.storage.all.bind(made.storage);
    let release = (): void => undefined;
    let reads = 0;
    made.storage.all = async () => {
      reads += 1;
      const read = await all();
      if (reads > 1) return read;
      return new Promise((resolve) => {
        release = () => {
          resolve(read);
        };
      });
    };
    made.posts = made.make();
    const started = made.posts.start();
    for (const [n, task] of researchTasksOfPage().slice(0, 30).entries()) {
      await made.report(task, [west(n + 2)]);
    }
    await made.posts.messageOf(WEST_CHANNEL, '');
    const drawn = made.gateway.messagesIn(made.west).map((one) => one.id);
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn[0]).toBe(first?.id);
    release();
    await started;
    await made.posts.flush();
    // The stale read did not take the place of what was drawn: no message sent again.
    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual(drawn);
    expect([...made.storage.rows.values()].map((row) => row.messageIds)).toEqual([drawn]);
    expect(made.gateway.deleted).toEqual([]);
  });

  it('deletes at start an older post of a channel beside a newer one (G3)', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    const [today] = made.gateway.messagesIn(made.west);
    await made.posts.close();
    // A post of the day before whose row a failed delete left, beside today's.
    const older = (await made.gateway.sendMessage(made.west, { content: 'Older post' })) ?? '';
    await made.storage.save({
      channelId: WEST_CHANNEL,
      day: '2026-11-20',
      serverId: FAKE_GUILD_ID,
      threadId: made.west,
      messageIds: [older],
      leftover: [],
      updatedAt: at('2026-11-20T12:00'),
    });
    made.posts = made.make();
    await made.posts.start();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([older]);
    expect(made.gateway.messagesIn(made.west).map((one) => one.id)).toEqual([today?.id]);
    expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-21']);
  });

  it('draws today’s post anew at start', async () => {
    made = await postsWith();
    await made.report(pageTask('Catch a Dragon-type Pokémon'));
    await made.posts.flush();
    await made.posts.close();
    made.posts = made.make();
    await made.posts.start();
    expect(made.gateway.messagesIn(made.west)).toHaveLength(1);
    expect(made.gateway.messagesIn(made.west)[0]?.edits).toBe(1);
  });
});
