import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakePartyGateway,
  missingPermissions,
  networkAway,
} from '../../test/support/fake-gateway.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, testRegions, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
import { MemoryStopPosts } from '../../test/support/research-store.js';
import { pageTask, researchTasksFixture } from '../../test/support/research.js';
import { feedChoice } from '../../test/support/rocket.js';
import { reportedStop } from '../../test/support/stop-report-cases.js';
import { MemoryStopLines } from '../../test/support/stop-lines.js';
import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
import { TestServers, withZones } from '../../test/support/server-values.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { ResearchTask } from '../domain/research/task.js';
import type { TaskVersion } from '../domain/research/versions.js';
import { rocketSubject } from './rocket-reports.js';
import { StopLineService } from './stop-lines.js';
import { StopPostService, type PostLink } from './stop-posts.js';
import { StopReportService } from './stop-reports.js';
import { zonedAt } from '../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (local: string): number => zonedAt(local, ZONE);
const ASH = { id: '200000000000000061', name: 'Ash' };
const west = (n: number) => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
/** West's and East's board posts, as the posts of the stops link them. */
const BOARDS: Record<string, string> = {
  [WEST_CHANNEL]: '500000000000000001',
  [EAST_CHANNEL]: '500000000000000002',
};
const link = (channelId: string, key: string): string =>
  `https://discord.com/channels/${FAKE_GUILD_ID}/${BOARDS[channelId] ?? ''}/${String(key.length)}`;

/** The lines over fakes; every server in the test settings' zone unless `servers` say otherwise. */
function linesWith(servers = new TestServers(), left: ReadonlySet<string> = new Set()) {
  const clock = { now: at('2026-11-21T10:00') };
  const { log, entries } = createTestLogger();
  const gateway = new FakePartyGateway();
  const storage = new MemoryStopLines();
  const reports = new StopReportService({
    rewardHash: fixtureRewardHash,
    store: new MemoryStopReports(),
    events: { researchEvents: () => [] },
    zoneOf: (serverId) => servers.zoneOf(serverId),
    log,
    now: () => clock.now,
  });
  /** The board of a region has the post of the stops; East none while `noBoard` says so. */
  const noBoard = new Set<string>();
  const asked: string[] = [];
  /** What `messageOf` and the sends wait for while set (a moment held across midnight). */
  const gates: { messageOf?: Promise<void>; send?: Promise<void>; onSend?: () => void } = {};
  /** Who hears of a channel's board drawn in full (plan 8R-9F, M2): `drawn` tells them. */
  const drawnListeners: ((channelId: string) => void)[] = [];
  const posts = {
    messageOf: async (channelId: string, key: string): Promise<PostLink | undefined> => {
      asked.push(`${channelId} ${key}`);
      await gates.messageOf;
      const board = BOARDS[channelId];
      return board === undefined || noBoard.has(channelId)
        ? undefined
        : { channelId: board, messageId: String(key.length) };
    },
    onDrawn: (listener: (channelId: string) => void) => {
      drawnListeners.push(listener);
    },
  };
  const drawn = (channelId: string) => {
    for (const listener of drawnListeners) listener(channelId);
  };
  /** The regions, West's board recorded where `boarded` names it (a board of its own, M2). */
  const boarded = new Set<string>();
  const regions = () =>
    testRegions().map((region) =>
      boarded.has(region.channelId)
        ? { ...region, summaryMessageId: BOARDS[region.channelId] ?? null }
        : region,
    );
  const held = {
    sendMessage: async (...args: Parameters<FakePartyGateway['sendMessage']>) => {
      gates.onSend?.();
      await gates.send;
      return gateway.sendMessage(...args);
    },
    deleteMessage: (...args: Parameters<FakePartyGateway['deleteMessage']>) =>
      gateway.deleteMessage(...args),
  };
  const make = () =>
    new StopLineService({
      storage,
      reports,
      posts,
      regions: { all: regions },
      guilds: { idFor: (id) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined) },
      gateway: held,
      servers,
      left: { isLeft: (serverId) => left.has(serverId) },
      log,
      now: () => clock.now,
    });
  const lines = make();
  const report = (task: ResearchTask, stops = [west(1)], version?: TaskVersion) =>
    reports.reportResearch({
      serverId: FAKE_GUILD_ID,
      stops,
      subject: {
        subjectKey: version?.value ?? task.key,
        research: {
          text: task.text,
          category: task.category,
          rewards: version?.rewards ?? task.rewards,
          typed: false,
        },
      },
      reporter: ASH,
    });
  const rocket = (key: string, stop = west(1)) =>
    reports.reportRocket({
      serverId: FAKE_GUILD_ID,
      stop,
      subject: rocketSubject(feedChoice(key)),
      reporter: ASH,
    });
  const said = (channelId = WEST_CHANNEL) =>
    gateway.messagesIn(channelId).map(({ message }) => message.content ?? '');
  return {
    clock,
    gateway,
    storage,
    reports,
    lines,
    make,
    report,
    rocket,
    said,
    noBoard,
    asked,
    gates,
    entries,
    drawn,
    boarded,
  };
}

/**
 * A gate the sweep opens (review W1): `messageOf` or a send waits until the sweep has forgotten a
 * line, as if midnight's sweep ran while the line was on its way.
 */
function openedBySweep(made: ReturnType<typeof linesWith>): Promise<void> {
  const { storage } = made;
  const forget = storage.forget.bind(storage);
  return new Promise<void>((open) => {
    storage.forget = async (line) => {
      await forget(line);
      storage.forget = forget;
      open();
    };
  });
}

describe('StopLineService (plan 8R-9, B9)', () => {
  let made: ReturnType<typeof linesWith> | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await made?.lines.close();
    made = undefined;
  });

  it('says each new task of the day once in the region’s channel, linking its place in the board', async () => {
    made = linesWith();
    const task = pageTask('Make 3 Excellent Throws in a row');
    const [gible] = researchTasksFixture().versions(task);
    if (!gible) throw new Error('no version');
    await made.report(task, [west(1)], gible);
    await made.lines.flush();
    expect(made.said()).toEqual([
      `Research: **Make 3 Excellent Throws in a row** (${gible.label}) → ${link(WEST_CHANNEL, task.key)}`,
    ]);
    // The same task again, another version, more stops: nothing more.
    await made.report(task, [west(2), west(3)]);
    await made.report(task, [west(4)], gible);
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
    // Another task: a line of its own; East heard of neither.
    await made.report(pageTask('Catch 7 Pokémon'), [west(5)]);
    await made.lines.flush();
    expect(made.said()[1]).toBe(
      `Research: **Catch 7 Pokémon** (one of Magikarp, Stufful, Wimpod) → ${link(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key)}`,
    );
    expect(made.said(EAST_CHANNEL)).toEqual([]);
    expect([...made.storage.rows.values()].map((row) => row.messageId)).toEqual(
      made.gateway.messagesIn(WEST_CHANNEL).map((one) => one.id),
    );
  });

  it('says a leader or Giovanni, not a decoy or a grunt', async () => {
    made = linesWith();
    await made.rocket('grunt:water', west(1));
    await made.rocket('decoy', west(2));
    await made.rocket('leader:arlo', west(3));
    await made.rocket('leader:arlo', west(4));
    await made.rocket('giovanni', west(5));
    await made.lines.flush();
    expect(made.said()).toEqual([
      `Team GO Rocket: **Arlo** at **Yellow Mural 3** → ${link(WEST_CHANNEL, 'leader:arlo')}`,
      `Team GO Rocket: **Giovanni** at **Yellow Mural 5** → ${link(WEST_CHANNEL, 'giovanni')}`,
    ]);
  });

  it('says nothing where the region has no board, and says it once the board is there', async () => {
    made = linesWith();
    made.noBoard.add(EAST_CHANNEL);
    await made.report(pageTask('Catch 7 Pokémon'), [east]);
    await made.lines.flush();
    expect(made.said(EAST_CHANNEL)).toEqual([]);
    made.noBoard.delete(EAST_CHANNEL);
    await made.report(pageTask('Catch 7 Pokémon'), [reportedStop(91, { lat: 40.06, lon: -79.95 })]);
    await made.lines.flush();
    expect(made.said(EAST_CHANNEL)).toHaveLength(1);
  });

  it('keeps the line of a report that finds its board gone, and sends it once the board is drawn again (plan 8R-9F, M2)', async () => {
    made = linesWith();
    made.boarded.add(WEST_CHANNEL);
    // A moderator deleted the board: its draw failed, so nothing holds the task yet.
    made.noBoard.add(WEST_CHANNEL);
    const task = pageTask('Catch 7 Pokémon');
    await made.report(task, [west(1)]);
    await made.lines.flush();
    expect(made.said()).toEqual([]);
    // The claim stands: a second report meanwhile says nothing either.
    await made.report(task, [west(2)]);
    await made.lines.flush();
    expect(made.said()).toEqual([]);
    expect(made.storage.rows.size).toBe(1);
    // The board is made anew and the stops drawn in it: the line is sent, linking it.
    made.noBoard.delete(WEST_CHANNEL);
    made.drawn(WEST_CHANNEL);
    await made.lines.flush();
    expect(made.said()).toEqual([
      `Research: **Catch 7 Pokémon** (one of Magikarp, Stufful, Wimpod) → ${link(WEST_CHANNEL, task.key)}`,
    ]);
    // Drawn again: nothing more.
    made.drawn(WEST_CHANNEL);
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
  });

  it('tries a waiting line once after the draw, then lets it go for a later report (M2, B9)', async () => {
    made = linesWith();
    made.boarded.add(WEST_CHANNEL);
    made.noBoard.add(WEST_CHANNEL);
    const task = pageTask('Catch 7 Pokémon');
    await made.report(task, [west(1)]);
    await made.lines.flush();
    // Drawn, yet the board's message is still not found: the claim goes.
    made.drawn(WEST_CHANNEL);
    await made.lines.flush();
    expect(made.storage.rows.size).toBe(0);
    made.noBoard.delete(WEST_CHANNEL);
    await made.report(task, [west(2)]);
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
  });

  it('forgets a waiting line at the day’s end, and lets go at once where the region has no board (M2)', async () => {
    made = linesWith();
    made.boarded.add(WEST_CHANNEL);
    made.noBoard.add(WEST_CHANNEL);
    await made.report(pageTask('Catch 7 Pokémon'), [west(1)]);
    await made.lines.flush();
    made.clock.now = at('2026-11-22T00:00:01');
    await made.lines.sweep();
    expect(made.storage.rows.size).toBe(0);
    made.noBoard.delete(WEST_CHANNEL);
    made.drawn(WEST_CHANNEL);
    await made.lines.flush();
    expect(made.said()).toEqual([]);
    // East has no board recorded: its claim is let go at once (B9).
    made.noBoard.add(EAST_CHANNEL);
    await made.report(pageTask('Catch 7 Pokémon'), [east]);
    await made.lines.flush();
    expect(made.storage.rows.size).toBe(0);
  });

  it('lets the waiting claims go at shutdown, so a report after the restart says its line (review F4)', async () => {
    made = linesWith();
    made.boarded.add(WEST_CHANNEL);
    made.noBoard.add(WEST_CHANNEL);
    const task = pageTask('Catch 7 Pokémon');
    await made.report(task, [west(1)]);
    await made.lines.flush();
    expect(made.storage.rows.size).toBe(1);
    await made.lines.close();
    expect(made.storage.rows.size).toBe(0);
    // A draw told after the close sends nothing.
    made.noBoard.delete(WEST_CHANNEL);
    made.drawn(WEST_CHANNEL);
    await made.lines.flush();
    expect(made.said()).toEqual([]);
    made.lines = made.make();
    await made.report(task, [west(2)]);
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
  });

  it('says a line once when two reports come at once, and not again after a restart', async () => {
    made = linesWith();
    const task = pageTask('Catch 7 Pokémon');
    await Promise.all([made.report(task, [west(1)]), made.report(task, [west(2)])]);
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
    await made.lines.close();
    made.lines = made.make();
    await made.lines.start();
    await made.report(task, [west(3)]);
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
  });

  it('deletes the day’s lines at midnight, and at start those of days before', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = linesWith();
    await made.lines.start();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.lines.flush();
    const [line] = made.gateway.messagesIn(WEST_CHANNEL);
    made.clock.now = at('2026-11-22T00:00:01');
    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
    await made.lines.flush();
    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: line?.id }]);
    expect(made.storage.rows.size).toBe(0);
    // A new day: the task is new again.
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
    // A restart after the next midnight deletes yesterday's line at start.
    await made.lines.close();
    made.clock.now = at('2026-11-23T08:00');
    made.lines = made.make();
    await made.lines.start();
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('keeps each server’s lines under its own day and deletes them at its own midnight (plan 19A-2)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const berlin = (local: string) => zonedAt(local, 'Europe/Berlin');
    // The fakes' server in Berlin; another in New York, the test settings' zone.
    const other = '412345678901234599';
    made = linesWith(withZones({ [FAKE_GUILD_ID]: 'Europe/Berlin' }));
    // 19:00 in New York is 01:00 the next day in Berlin.
    made.clock.now = at('2026-11-21T19:00');
    await made.lines.start();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.lines.flush();
    const [line] = made.gateway.messagesIn(WEST_CHANNEL);
    expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-22']);
    await made.storage.claim({
      serverId: other,
      regionChannelId: '600000000000000001',
      day: '2026-11-21',
      key: 'research:catch',
      createdAt: made.clock.now,
    });
    // New York's midnight: the other server's day ended, not Berlin's.
    made.clock.now = at('2026-11-22T00:00:01');
    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T19:00'));
    await made.lines.flush();
    expect([...made.storage.rows.values()].map((row) => row.serverId)).toEqual([FAKE_GUILD_ID]);
    expect(made.gateway.deleted).toEqual([]);
    // A line of New York's 22nd, which Berlin's midnight leaves alone (fix round 2, N7 b).
    await made.storage.claim({
      serverId: other,
      regionChannelId: '600000000000000001',
      day: '2026-11-22',
      key: 'research:catch',
      createdAt: made.clock.now,
    });
    // Berlin's midnight, 18:00 in New York: its line goes.
    made.clock.now = berlin('2026-11-23T00:00:01');
    await vi.advanceTimersByTimeAsync(berlin('2026-11-23T00:00:02') - at('2026-11-22T00:00:02'));
    await made.lines.flush();
    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: line?.id }]);
    expect([...made.storage.rows.values()].map((row) => [row.serverId, row.day])).toEqual([
      [other, '2026-11-22'],
    ]);
  });

  it('sends no line claimed before midnight whose day ended on its way (review W1)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = linesWith();
    made.clock.now = at('2026-11-21T23:59:59');
    await made.lines.start();
    // The board's message is found only after midnight's sweep forgot the claim.
    made.gates.messageOf = openedBySweep(made);
    await made.report(pageTask('Catch 7 Pokémon'));
    made.clock.now = at('2026-11-22T00:00:01');
    await vi.advanceTimersByTimeAsync(2_000);
    await made.lines.flush();
    expect(made.said()).toEqual([]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('keeps a line sent after the sweep forgot its claim, so that a sweep deletes it (review W1)', async () => {
    made = linesWith();
    made.clock.now = at('2026-11-21T23:59:59');
    const sending = new Promise<void>((reached) => {
      if (made) made.gates.onSend = reached;
    });
    made.gates.send = openedBySweep(made);
    await made.report(pageTask('Catch 7 Pokémon'));
    await sending;
    // Midnight's sweep runs while the line is being sent.
    made.clock.now = at('2026-11-22T00:00:01');
    await made.lines.sweep();
    await made.lines.flush();
    expect(made.said()).toHaveLength(1);
    expect(made.storage.rows.size).toBe(1);
    await made.lines.sweep();
    expect(made.said()).toEqual([]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('forgets a line whose delete Discord refuses for good, said once (review R1)', async () => {
    made = linesWith();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.report(pageTask('Catch a Dragon-type Pokémon'), [west(2)]);
    await made.lines.flush();
    made.gateway.failing.set('deleteMessage', missingPermissions('DELETE'));
    made.clock.now = at('2026-11-22T08:00');
    await made.lines.sweep();
    expect(made.storage.rows.size).toBe(0);
    expect(
      made.entries.filter((entry) => entry.msg === 'the bot may not delete the line of a report'),
    ).toHaveLength(1);
    made.gateway.failing.clear();
  });

  it('keeps a line whose delete fails at midnight, and deletes it at the next sweep (review P1)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = linesWith();
    await made.lines.start();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.lines.flush();
    const [line] = made.gateway.messagesIn(WEST_CHANNEL);
    made.gateway.failing.set('deleteMessage', networkAway());
    made.clock.now = at('2026-11-22T00:00:01');
    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
    await made.lines.flush();
    expect(made.storage.rows.size).toBe(1);
    // The network is back: the catch-up's sweep deletes it.
    made.gateway.failing.clear();
    await made.lines.sweep();
    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: line?.id }]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('keeps the lines of a server Pine left, and deletes them once it is back (plan 19C-1)', async () => {
    const left = new Set<string>();
    made = linesWith(undefined, left);
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.lines.flush();
    const [line] = made.gateway.messagesIn(WEST_CHANNEL);
    left.add(FAKE_GUILD_ID);
    made.clock.now = at('2026-11-22T00:00:01');
    await made.lines.sweep();
    expect(made.gateway.deleted).toEqual([]);
    expect(made.storage.rows.size).toBe(1);
    left.clear();
    await made.lines.sweep();
    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: line?.id }]);
    expect(made.storage.rows.size).toBe(0);
  });

  it('deletes a line whose delete failed at the next report’s line (review W2)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    made = linesWith();
    await made.lines.start();
    await made.report(pageTask('Catch 7 Pokémon'));
    await made.lines.flush();
    const [line] = made.gateway.messagesIn(WEST_CHANNEL);
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    made.clock.now = at('2026-11-22T00:00:01');
    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
    await made.lines.flush();
    expect(made.storage.rows.size).toBe(1);
    // Deletes work again; no catch-up came: the next report's line sweeps first.
    made.gateway.failing.clear();
    made.clock.now = at('2026-11-22T09:00');
    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
    await made.lines.flush();
    expect(made.gateway.deleted).toEqual([{ channelId: WEST_CHANNEL, messageId: line?.id }]);
    expect([...made.storage.rows.values()].map((row) => row.day)).toEqual(['2026-11-22']);
  });
});

describe('StopLineService over the posts of the stops (review P9)', () => {
  let posts: StopPostService | undefined;
  let lines: StopLineService | undefined;
  afterEach(async () => {
    await lines?.close();
    await posts?.close();
    posts = undefined;
    lines = undefined;
  });

  it('links each line to the board’s message that holds it: a task, one under a window, a leader', async () => {
    const clock = { now: at('2026-11-21T10:00') };
    const { log } = createTestLogger();
    const gateway = new FakePartyGateway();
    gateway.addForum(WEST_FORUM);
    const board =
      (await gateway.createPost(WEST_FORUM, {
        title: 'Today and coming up',
        message: { content: 'The summary' },
        tagIds: [],
      })) ?? '';
    const regions = testRegions().map((region) =>
      region.channelId === WEST_CHANNEL ? { ...region, summaryMessageId: board } : region,
    );
    const events = { researchEvents: () => [PAWNIARD_DAY] };
    const reports = new StopReportService({
      rewardHash: fixtureRewardHash,
      store: new MemoryStopReports(),
      events,
      zoneOf: () => ZONE,
      log,
      now: () => clock.now,
    });
    const guilds = {
      idFor: (id: string) => Promise.resolve(id === FAKE_GUILD_ID ? 1 : undefined),
      snowflakeOf: (row: number) => Promise.resolve(row === 1 ? FAKE_GUILD_ID : undefined),
    };
    posts = new StopPostService({
      storage: new MemoryStopPosts(),
      reports,
      events,
      regions: { all: () => regions },
      guilds,
      gateway,
      servers: new TestServers(),
      log,
      now: () => clock.now,
      delayMs: 0,
    });
    lines = new StopLineService({
      storage: new MemoryStopLines(),
      reports,
      posts,
      regions: { all: () => regions },
      guilds,
      gateway,
      servers: new TestServers(),
      log,
      now: () => clock.now,
    });
    const report = (task: ResearchTask, stop: ReturnType<typeof west>) =>
      reports.reportResearch({
        serverId: FAKE_GUILD_ID,
        stops: [stop],
        subject: {
          subjectKey: task.key,
          research: {
            text: task.text,
            category: task.category,
            rewards: task.rewards,
            typed: false,
          },
        },
        reporter: ASH,
      });
    const said = () => gateway.messagesIn(WEST_CHANNEL).map(({ message }) => message.content ?? '');
    const boardLink = () => {
      const [first] = gateway.messagesIn(board);
      return `https://discord.com/channels/${FAKE_GUILD_ID}/${board}/${first?.id ?? ''}`;
    };
    // A task of the day.
    await report(pageTask('Catch 7 Pokémon'), west(1));
    await lines.flush();
    expect(said()).toEqual([expect.stringMatching(/^Research: \*\*Catch 7 Pokémon\*\*/)]);
    expect(said()[0]).toContain(`→ ${boardLink()}`);
    // Under Pawniard Community Day's window: the day's task waits below it, and is still held by
    // a message of the board; a task of the window gets its line too.
    clock.now = at('2026-11-21T15:00');
    await report(pageTask('Catch a Dragon-type Pokémon'), west(2));
    await lines.flush();
    expect(said()[1]).toMatch(/^Research: \*\*Catch a Dragon-type Pokémon\*\*/);
    expect(said()[1]).toContain(`→ ${boardLink()}`);
    expect((await posts.messageOf(WEST_CHANNEL, pageTask('Catch 7 Pokémon').key))?.channelId).toBe(
      board,
    );
    // A leader.
    await reports.reportRocket({
      serverId: FAKE_GUILD_ID,
      stop: west(3),
      subject: rocketSubject(feedChoice('leader:arlo')),
      reporter: ASH,
    });
    await lines.flush();
    expect(said()[2]).toBe(`Team GO Rocket: **Arlo** at **Yellow Mural 3** → ${boardLink()}`);
  });
});
