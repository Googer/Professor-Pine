import { describe, expect, it, vi } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import {
  dmBrief,
  dmReasons,
  dmSentence,
  linksOf,
  thumbnailOf,
} from '../../test/support/messages.js';
import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { pageTask, researchTasksOfPage } from '../../test/support/research.js';
import { reportedStop } from '../../test/support/stop-report-cases.js';
import { MemoryStopReports } from '../../test/support/stop-reports.js';
import { INTO_THE_WILD } from '../../test/support/research-store-cases.js';
import type { ResearchEvent } from '../domain/time/research-events.js';
import { watchEachTest } from '../../test/support/timers.js';
import { boxTarget, type TargetWant } from '../domain/notify/target-wants.js';
import type { ResearchTask } from '../domain/research/task.js';
import { rewardHash, taskVersions } from '../domain/research/versions.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import type { ReportedStop } from '../domain/stops/report.js';
import { postLink } from '../render/notify-dm.js';
import type { NotifyServiceOptions } from './notify-service.js';
import { DM_PRIORITY, QueuedDmSender } from './dm-sender.js';
import { StopReportService, type ResearchSubject } from './stop-reports.js';
import { zonedAt } from '../../test/support/time.js';
import { RecordingReach } from '../../test/support/reach.js';
import { MemoryHistory } from '../../test/support/history.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ReachRecords } from './reach.js';
import { FakeDmGateway, FakeLoopDelay, pullUntilIdle } from '../../test/support/dms.js';

const background = watchEachTest();
const at = (local: string): number => zonedAt(local, 'America/New_York');

const DRAGON = pageTask('Catch a Dragon-type Pokémon');
const RESEARCH_DRATINI = boxTarget('research-pokemon', 147);
const RITA = { id: REPORTER, name: 'Rita' };

/** Stops in West (40.0–40.1, −80.1–−80.0) and one in East. */
const west = (n: number): ReportedStop => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
/** The name of `west(n)` in a DM: the link to its place (plans 8R-7, 8R-8). */
const westLink = (n: number): string =>
  `**[Yellow Mural ${String(n)}](<https://www.google.com/maps/search/?api=1&query=` +
  `${String((40_050 + n) / 1_000)}%2C-80.05>)**`;
/** The name of `east` in a DM. */
const eastLink = `**[${east.name}](<https://www.google.com/maps/search/?api=1&query=40.05%2C-79.95>)**`;
/** The line of `west(n)` in a DM: its name the link to its place (plan 8R-7). */
const westDm = (n: number): string => `- ${westLink(n)} · Market Street`;

/** A task of the page that gives this reward. */
function taskGiving(fits: (reward: ResearchTask['rewards'][number]) => boolean): ResearchTask {
  const found = researchTasksOfPage().find((task) => task.rewards.some(fits));
  if (!found) throw new Error('the page has no such task');
  return found;
}

/** The notifier of the party tests, told of the research reports of a report service. */
async function researchWith(
  notifying: Partial<NotifyServiceOptions> = {},
  events: ResearchEvent[] = [],
  store = new MemoryStopReports(),
) {
  // The reports the notifier reads again (R6): made after it, over the party tests' clock.
  const held: { reports?: StopReportService } = {};
  const made = await partyServiceWith([], {
    notifying: {
      stopReports: {
        kept: (serverId, id) => held.reports?.kept(serverId, id) ?? Promise.resolve(undefined),
      },
      ...notifying,
    },
  });
  const reports = new StopReportService({
    store,
    events: { researchEvents: () => events },
    zone: made.settings.timezone,
    log: made.log,
    now: () => made.clock.now,
    rewardHash: (reward) => rewardHash(reward, catalogueFixture()),
  });
  held.reports = reports;
  reports.listen({
    reported: (news) => made.notify.researchReported(news),
    // A report taken back is told to who was told of it (Matt, 2026-11-07), as `app.ts` wires it.
    takenBack: (serverId, removed, by) => made.notify.stopReportsTakenBack(serverId, removed, by),
  });
  const reportVersion = async (
    subject: ResearchSubject,
    stops: ReportedStop[],
    reporter: { id: string; name: string } = RITA,
    replacing?: number[],
  ) => {
    const outcome = await reports.reportResearch({
      serverId: made.gateway.guildId,
      stops,
      subject,
      reporter,
      ...(replacing === undefined ? {} : { replacing }),
    });
    await made.notify.flush();
    return outcome;
  };
  const want = (memberId: string, ...targets: TargetWant[]) =>
    made.targetWants.change(memberId, made.gateway.guildId, { add: targets, remove: [] }, 0);
  const report = async (
    task: ResearchTask,
    stops: ReportedStop[],
    reporter: { id: string; name: string } = RITA,
  ) => {
    const outcome = await reports.reportResearch({
      serverId: made.gateway.guildId,
      stops,
      subject: {
        subjectKey: task.key,
        research: { text: task.text, category: task.category, rewards: task.rewards, typed: false },
      },
      reporter,
    });
    await made.notify.flush();
    return outcome;
  };
  return { ...made, reports, want, report, reportVersion };
}

describe('NotifyService: field research is reported (plan 8R-1, design 7)', () => {
  it('tells who wants a reward of the task, once, naming every stop of the report', async () => {
    const made = await researchWith();
    await made.want(ALICE, RESEARCH_DRATINI);
    // A raid want of Dratini, or another reward, is no research want.
    await made.want(BOB, boxTarget('research-pokemon', 1));
    await made.wants.set(CAROL, made.gateway.guildId, { kind: 'pokemon', dex: 147 }, 'both');
    // The reporter knows.
    await made.want(REPORTER, RESEARCH_DRATINI);
    await made.report(DRAGON, [west(1), west(2)]);
    expect(made.dms.recipients).toEqual([ALICE]);
    const [message] = made.dms.to(ALICE);
    expect(dmSentence(message)).toBe(
      `Field research has been reported in <#${WEST_CHANNEL}> by **Rita**: ` +
        '**Catch a Dragon-type Pokémon**.',
    );
    expect(dmBrief(message)).toEqual([
      '**Rewards** one of Dratini, Bagon, Axew +4',
      westDm(1),
      westDm(2),
      'Until midnight.',
    ]);
    expect(dmReasons(message)).toEqual(['Dratini · Research']);
    // In rehearsal mode (no posts) the DM has no link.
    expect(linksOf(message)).toEqual([]);
    expect(made.dms.jobs[0]).toEqual(
      expect.objectContaining({
        priority: DM_PRIORITY.normal,
        expiresAt: expect.any(Number) as number,
      }),
    );
  });

  it('links to the message of the post that holds the task', async () => {
    const asked: string[] = [];
    const made = await researchWith({
      researchPosts: {
        messageOf: (channelId, subjectKey) => {
          asked.push(`${channelId} ${subjectKey}`);
          // The board post (plan 8R-9, B1) and the message in it.
          return Promise.resolve({
            channelId: '300000000000000099',
            messageId: '300000000000000077',
          });
        },
      },
    });
    await made.want(ALICE, RESEARCH_DRATINI);
    await made.report(DRAGON, [west(1)]);
    expect(asked).toEqual([`${WEST_CHANNEL} ${DRAGON.key}`]);
    expect(linksOf(made.dms.to(ALICE)[0])).toEqual([
      `Go to post ${postLink(made.gateway.guildId, '300000000000000099', '300000000000000077')}`,
    ]);
  });

  it('names only the new stops when the task is reported at more, never a stop twice', async () => {
    const made = await researchWith();
    await made.want(ALICE, RESEARCH_DRATINI);
    const first = await made.report(DRAGON, [west(1)]);
    await made.report(DRAGON, [west(2), west(1)], { id: BOB, name: 'Bob' });
    expect(made.dms.to(ALICE).map((message) => dmBrief(message).slice(1, -1))).toEqual([
      [westDm(1)],
      [westDm(2)],
    ]);
    // Taken back, which is told (Matt, 2026-11-07), and reported again in the period: news again
    // for who was told it was taken back (review F1).
    const id = first.saved[0]?.report.id ?? 0;
    await made.reports.takeBack(made.gateway.guildId, [id], REPORTER, 'member');
    await made.notify.flush();
    await made.report(DRAGON, [west(1)]);
    expect(made.dms.to(ALICE).map(dmSentence).slice(2)).toEqual([
      expect.stringContaining('was taken back by its reporter'),
      expect.stringContaining('Field research has been reported'),
    ]);
    expect(dmBrief(made.dms.to(ALICE)[3]).slice(1, -1)).toEqual([westDm(1)]);
  });

  it('tells only who can view the region channel, one DM per region', async () => {
    const made = await researchWith();
    await made.want(ALICE, RESEARCH_DRATINI);
    await made.want(BOB, RESEARCH_DRATINI);
    made.gateway.shutOut(EAST_CHANNEL, BOB);
    await made.report(DRAGON, [west(1), east]);
    expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
      expect.stringContaining(`<#${WEST_CHANNEL}>`),
      expect.stringContaining(`<#${EAST_CHANNEL}>`),
    ]);
    expect(made.dms.to(BOB).map(dmSentence)).toEqual([
      expect.stringContaining(`<#${WEST_CHANNEL}>`),
    ]);
  });

  it('counts the members the news reached for its first report, each once over its regions (plan 8H-3)', async () => {
    const reach = new RecordingReach();
    const made = await researchWith({ reach });
    await made.want(ALICE, RESEARCH_DRATINI);
    await made.want(BOB, RESEARCH_DRATINI);
    made.gateway.shutOut(EAST_CHANNEL, BOB);
    const outcome = await made.report(DRAGON, [west(1), east]);
    // Three DMs: Alice's of each region, Bob's of West; two members.
    expect(made.dms.jobs).toHaveLength(3);
    const first = outcome.saved[0]?.report;
    expect(reach.runs).toEqual([
      {
        of: { report: first?.id, madeAt: first?.madeAt },
        members: 2,
        at: made.clock.now,
      },
    ]);
    // The same task again tells nobody, and counts nothing.
    await made.report(DRAGON, [west(1)]);
    expect(reach.runs).toHaveLength(1);
  });

  it('counts the members of each region for the first report, also a stop of another region (plan 8H-3)', async () => {
    const reach = new RecordingReach();
    const made = await researchWith({ reach });
    await made.want(ALICE, RESEARCH_DRATINI);
    await made.want(BOB, RESEARCH_DRATINI);
    made.gateway.shutOut(EAST_CHANNEL, ALICE);
    made.gateway.shutOut(WEST_CHANNEL, BOB);
    const outcome = await made.report(DRAGON, [west(1), east]);
    expect(made.dms.recipients.sort()).toEqual([ALICE, BOB].sort());
    const first = outcome.saved[0]?.report;
    const of = { report: first?.id, madeAt: first?.madeAt };
    expect(reach.runs).toEqual([
      { of, members: 1, at: made.clock.now },
      { of, members: 1, at: made.clock.now },
    ]);
  });

  it('keeps both regions’ members in the record of the first report (plan 8H-3)', async () => {
    const store = new MemoryStopReports();
    const { log } = createTestLogger();
    const reach = new ReachRecords({ history: new MemoryHistory(), stopReports: store, log });
    const made = await researchWith({ reach }, [], store);
    await made.want(ALICE, RESEARCH_DRATINI);
    await made.want(BOB, RESEARCH_DRATINI);
    made.gateway.shutOut(EAST_CHANNEL, ALICE);
    made.gateway.shutOut(WEST_CHANNEL, BOB);
    const outcome = await made.report(DRAGON, [west(1), east]);
    await made.notify.flush();
    const [first, second] = outcome.saved.map((saved) => saved.report);
    await store.removeEnded(Number.MAX_SAFE_INTEGER);
    const records = await store.historyOf(made.gateway.guildId);
    expect(records.map(({ reportId, reach: count }) => ({ reportId, count }))).toEqual([
      { reportId: first?.id, count: 2 },
      { reportId: second?.id, count: 0 },
    ]);
  });

  it('tells who wants an item or Mega Energy the task gives', async () => {
    const made = await researchWith();
    const candy = taskGiving((reward) => reward.kind === 'item' && reward.item === 'rare-candy');
    const energy = taskGiving((reward) => reward.kind === 'energy');
    const energyDex = energy.rewards.find((reward) => reward.kind === 'energy')?.dex ?? 0;
    await made.want(ALICE, { kind: 'research-item', item: 'rare-candy' });
    await made.want(BOB, { kind: 'research-energy', dex: energyDex });
    await made.report(candy, [west(1)]);
    await made.report(energy, [west(2)]);
    // Named as a Pokémon's reason is, "Gible · Research" (plan 8R-6, the staging's finding 1).
    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Rare Candy · Research']]);
    expect(made.dms.to(BOB).map(dmReasons)).toEqual([
      [expect.stringMatching(/^\S.* Mega Energy · Research$/)],
    ]);
  });

  it('says until when a multi-day event’s day and its last day hold (B7)', async () => {
    const made = await researchWith({}, [INTO_THE_WILD]);
    await made.want(ALICE, RESEARCH_DRATINI);
    made.clock.now = at('2026-11-10T12:00');
    await made.report(DRAGON, [west(1)]);
    made.clock.now = at('2026-11-13T12:00');
    await made.report(DRAGON, [west(1)]);
    expect(made.dms.to(ALICE).map((message) => dmBrief(message).at(-1))).toEqual([
      'Until midnight.',
      `Until <t:${String(INTO_THE_WILD.end / 1_000)}:t>.`,
    ]);
  });

  describe('the versions of a task (plan 8R-5)', () => {
    const THROWS = pageTask('Make 3 Excellent Throws in a row');
    const versions = taskVersions(THROWS, catalogueFixture());
    const version = (label: string) => {
      const found = versions.find((one) => one.label === label);
      if (!found) throw new Error(`no version ${label}`);
      return {
        subjectKey: found.value,
        research: {
          text: THROWS.text,
          category: THROWS.category,
          rewards: found.rewards,
          typed: false,
        },
      };
    };
    const ONE_OF = version('one of Larvitar, Beldum, Gible');
    const GIBLE = version('Gible');
    const BELDUM = version('Beldum');
    const WANT_GIBLE = boxTarget('research-pokemon', 443);
    const BOB_ = { id: BOB, name: 'Bob' };
    const CAROL_ = { id: CAROL, name: 'Carol' };
    const confirmed = (stops: string) => `Confirmed: the reward at ${stops} is **Gible**.`;

    it('names the member’s reward first in a "one of" DM (R12)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1)]);
      expect(dmBrief(made.dms.to(ALICE)[0])[0]).toBe('**Rewards** one of Gible, Larvitar, Beldum');
    });

    it('confirms a narrowing to whoever was told of its "one of" there, and its reporter (R5)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.want(REPORTER, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1)]);
      // Carol wants Gible from now on: she was not told of the "one of".
      await made.want(CAROL, WANT_GIBLE);
      await made.reportVersion(GIBLE, [west(1)], BOB_);
      expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
        expect.stringContaining('Field research has been reported'),
        confirmed(westLink(1)),
      ]);
      // Rita reported the "one of": she knows of the task there, and is told which it is.
      expect(made.dms.to(REPORTER).map(dmSentence)).toEqual([confirmed(westLink(1))]);
      expect(made.dms.to(CAROL).map(dmSentence)).toEqual([
        expect.stringContaining('Field research has been reported'),
      ]);
      expect(dmBrief(made.dms.to(CAROL)[0])[0]).toBe('**Rewards** Gible');
    });

    it('shows the encounter picture on a "one of" DM and the Pokémon on its confirmation, made before they go (plan 8R-6)', async () => {
      const prepared: { sources: string[]; sent: number }[] = [];
      const looked = (source: string) =>
        `https://map.example.test/pictures/${String(source.length)}.png`;
      const held: { sent: () => number } = { sent: () => -1 };
      const made = await researchWith({
        pictures: {
          prepare: (sources) => {
            prepared.push({ sources: [...sources], sent: held.sent() });
            return Promise.resolve();
          },
          url: looked,
        },
      });
      held.sent = () => made.dms.to(ALICE).length;
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1)]);
      await made.reportVersion(GIBLE, [west(1)], BOB_);
      const [oneOf, confirmation] = made.dms.to(ALICE);
      const gible = GIBLE.research.rewards[0]?.image ?? '';
      expect(thumbnailOf(oneOf)).toBe(looked(ENCOUNTER_PICTURE));
      expect(dmSentence(confirmation)).toBe(confirmed(westLink(1)));
      expect(thumbnailOf(confirmation)).toBe(looked(gible));
      expect(prepared).toEqual([
        { sources: [ENCOUNTER_PICTURE], sent: 0 },
        { sources: [gible], sent: 1 },
      ]);
    });

    it('shows no picture on a DM whose picture is gone at its source (plan 8R-6)', async () => {
      const made = await researchWith({
        pictures: { prepare: () => Promise.resolve(), url: () => undefined },
      });
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1)]);
      const [oneOf] = made.dms.to(ALICE);
      expect(dmSentence(oneOf)).toContain('Field research has been reported');
      expect(thumbnailOf(oneOf)).toBeUndefined();
    });

    it('confirms Gible after Beldum to whoever was told of the "one of" there (R5)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1)]);
      // A narrowing to a reward Alice does not want tells her nothing.
      await made.reportVersion(BELDUM, [west(1)], BOB_);
      expect(made.dms.to(ALICE)).toHaveLength(1);
      // Carol corrects it (she ticked Bob's report): Alice was told of the "one of" there.
      const there = await made.reports.at(made.gateway.guildId, west(1).key);
      await made.reportVersion(GIBLE, [west(1)], CAROL_, [there?.id ?? 0]);
      expect(made.dms.to(ALICE).map(dmSentence).at(-1)).toBe(confirmed(westLink(1)));
    });

    it('confirms several stops in one DM, and names every stop untold where one is new (R4)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1), west(2), west(3)]);
      await made.reportVersion(GIBLE, [west(1), west(2)], BOB_);
      expect(made.dms.to(ALICE).map(dmSentence).at(-1)).toBe(
        confirmed(`${westLink(1)} and ${westLink(2)}`),
      );
      await made.reportVersion(GIBLE, [west(3), west(4)], BOB_);
      const last = made.dms.to(ALICE).at(-1);
      expect(dmSentence(last)).toContain('Field research has been reported');
      expect(dmBrief(last).slice(1, -1)).toEqual([westDm(3), westDm(4)]);
      expect(made.dms.to(ALICE)).toHaveLength(3);
    });

    it('leaves a stop narrowed before its turn out of the "one of" DM (R6)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      // The "one of" waits to be told while Bob narrows it.
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wanting = made.targetWants.wanting.bind(made.targetWants);
      vi.spyOn(made.targetWants, 'wanting').mockImplementationOnce(async (...args) => {
        await gate;
        return wanting(...args);
      });
      await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(1), west(2)],
        subject: ONE_OF,
        reporter: RITA,
      });
      await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(1)],
        subject: GIBLE,
        reporter: BOB_,
      });
      release();
      await made.notify.flush();
      const [oneOf, gible] = made.dms.to(ALICE);
      expect(dmBrief(oneOf).slice(1, -1)).toEqual([westDm(2)]);
      // Not told of the "one of" at Yellow Mural 1: the usual DM.
      expect(dmSentence(gible)).toContain('Field research has been reported');
      expect(dmBrief(gible).slice(0, -1)).toEqual(['**Rewards** Gible', westDm(1)]);
    });

    it('counts the reach of news whose first report was replaced before its turn for the first still standing (review 8H3-4)', async () => {
      const reach = new RecordingReach();
      const made = await researchWith({ reach });
      await made.want(ALICE, WANT_GIBLE);
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wanting = made.targetWants.wanting.bind(made.targetWants);
      vi.spyOn(made.targetWants, 'wanting').mockImplementationOnce(async (...args) => {
        await gate;
        return wanting(...args);
      });
      const oneOf = await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(1), west(2)],
        subject: ONE_OF,
        reporter: RITA,
      });
      // Bob narrows Yellow Mural 1 while the "one of" waits: its first report is replaced.
      const gible = await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(1)],
        subject: GIBLE,
        reporter: BOB_,
      });
      release();
      await made.notify.flush();
      const standing = oneOf.saved[1]?.report;
      const narrowed = gible.saved[0]?.report;
      expect(reach.runs).toEqual([
        { of: { report: standing?.id, madeAt: standing?.madeAt }, members: 1, at: made.clock.now },
        { of: { report: narrowed?.id, madeAt: narrowed?.madeAt }, members: 1, at: made.clock.now },
      ]);
    });

    it('leaves a stop taken back before its turn out of the "one of" DM (R6)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const wanting = made.targetWants.wanting.bind(made.targetWants);
      vi.spyOn(made.targetWants, 'wanting').mockImplementationOnce(async (...args) => {
        await gate;
        return wanting(...args);
      });
      const oneOf = await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(1), west(2)],
        subject: ONE_OF,
        reporter: RITA,
      });
      const first = oneOf.saved[0]?.report.id ?? 0;
      await made.reports.takeBack(made.gateway.guildId, [first], REPORTER, 'member');
      release();
      await made.notify.flush();
      expect(made.dms.to(ALICE).map((message) => dmBrief(message).slice(1, -1))).toEqual([
        [westDm(2)],
      ]);
    });

    it('tells the reports of a task in the order they were made, whatever the look-ups take (review R6)', async () => {
      // The server's row of the first report is slow to come.
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const made = await researchWith({
        guilds: {
          snowflakeOf: () => Promise.resolve(undefined),
          idFor: async () => {
            calls += 1;
            if (calls === 1) await gate;
            return 1;
          },
        },
      });
      await made.want(ALICE, WANT_GIBLE);
      await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(1), west(2)],
        subject: ONE_OF,
        reporter: RITA,
      });
      await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(3)],
        subject: GIBLE,
        reporter: BOB_,
      });
      release();
      await made.notify.flush();
      expect(made.dms.to(ALICE).map((message) => dmBrief(message)[0])).toEqual([
        '**Rewards** one of Gible, Larvitar, Beldum',
        '**Rewards** Gible',
      ]);
    });

    it('confirms in every region where each stop was told of its "one of" (review R3)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1), east]);
      await made.reportVersion(GIBLE, [west(1), east], BOB_);
      expect(made.dms.to(ALICE).map(dmSentence).slice(2)).toEqual([
        confirmed(westLink(1)),
        confirmed(eastLink),
      ]);
    });

    it('confirms in a region the member views, though a stop is new in one they are kept out of (review F4)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [east]);
      made.gateway.shutOut(WEST_CHANNEL, ALICE);
      await made.reportVersion(GIBLE, [west(1), east], BOB_);
      expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
        confirmed(eastLink),
      ]);
    });

    it('confirms where the member’s only untold stop lies in the second region (review P1)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [east]);
      // Alice is told of Gible at Yellow Mural 1, and replaces it by Beldum there herself: she is
      // told of nothing (a member told that a report was replaced would hear of Gible again, F1).
      await made.reportVersion(GIBLE, [west(1)], BOB_);
      const gible = await made.reports.at(made.gateway.guildId, west(1).key);
      await made.reportVersion(BELDUM, [west(1)], { id: ALICE, name: 'Alice' }, [gible?.id ?? 0]);
      // Carol, new to both stops, is read first, for West: Alice has nothing new there.
      await made.want(CAROL, WANT_GIBLE);
      const beldum = await made.reports.at(made.gateway.guildId, west(1).key);
      await made.reportVersion(GIBLE, [west(1), east], BOB_, [beldum?.id ?? 0]);
      expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
        expect.stringContaining(`reported in <#${WEST_CHANNEL}>`),
        confirmed(eastLink),
      ]);
      expect(made.dms.to(CAROL).map(dmSentence)).toEqual([
        expect.stringContaining(`reported in <#${WEST_CHANNEL}>`),
        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
      ]);
    });

    it('dates a DM by its report, however late its turn comes (review F6)', async () => {
      // The server's row is slow to come: the turn comes five minutes after the report.
      let release = (): void => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const made = await researchWith({
        guilds: {
          snowflakeOf: () => Promise.resolve(undefined),
          idFor: async () => {
            await gate;
            return 1;
          },
        },
      });
      await made.want(ALICE, WANT_GIBLE);
      const reportedAt = made.clock.now;
      await made.reports.reportResearch({
        serverId: made.gateway.guildId,
        stops: [west(1)],
        subject: GIBLE,
        reporter: RITA,
      });
      made.clock.now = reportedAt + 5 * 60_000;
      release();
      await made.notify.flush();
      expect(made.dms.jobs.map((job) => job.eventAt)).toEqual([reportedAt]);
    });

    it('sends the usual DM in every region where a stop is new to the member (review R3)', async () => {
      const made = await researchWith();
      await made.want(ALICE, WANT_GIBLE);
      await made.reportVersion(ONE_OF, [west(1)]);
      await made.reportVersion(GIBLE, [west(1), east], BOB_);
      const [, inWest, inEast] = made.dms.to(ALICE);
      expect([inWest, inEast].map(dmSentence)).toEqual([
        expect.stringContaining(`reported in <#${WEST_CHANNEL}>`),
        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
      ]);
      expect(dmBrief(inWest).slice(0, -1)).toEqual(['**Rewards** Gible', westDm(1)]);
    });

    describe('a report taken back or replaced early (Matt, 2026-11-07)', () => {
      const THROWS_TEXT = '**Make 3 Excellent Throws in a row**';

      it('tells who was told of it that its reporter took it back, its stops in one DM without buttons', async () => {
        const made = await researchWith();
        await made.want(ALICE, WANT_GIBLE);
        await made.want(BOB, boxTarget('research-pokemon', 1));
        const outcome = await made.reportVersion(GIBLE, [west(1), west(2)]);
        await made.reports.takeBack(
          made.gateway.guildId,
          outcome.saved.map(({ report }) => report.id),
          REPORTER,
          'member',
        );
        await made.notify.flush();
        expect(made.dms.recipients).toEqual([ALICE]);
        const [, second] = made.dms.to(ALICE);
        expect(second).toEqual({
          content:
            `The field research ${THROWS_TEXT} · Gible at ${westLink(1)} and ${westLink(2)} ` +
            'was taken back by its reporter.',
        });
        expect(made.dms.jobs[1]).toEqual(
          expect.objectContaining({
            priority: DM_PRIORITY.normal,
            expiresAt: outcome.saved[0]?.report.endsAt,
          }),
        );
      });

      it('says it was replaced by a report that contradicts it, naming what stands there now', async () => {
        const made = await researchWith();
        await made.want(ALICE, WANT_GIBLE);
        const gible = await made.reportVersion(GIBLE, [west(1)]);
        await made.reportVersion(BELDUM, [west(1)], BOB_, [gible.saved[0]?.report.id ?? 0]);
        expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
          expect.stringContaining('Field research has been reported'),
          `The field research ${THROWS_TEXT} · Gible at ${westLink(1)} was replaced: ` +
            `${THROWS_TEXT} · Beldum is reported there now.`,
        ]);
      });

      it('says nothing of a "one of" narrowed, and tells who was told of it when the narrowing is taken back', async () => {
        const made = await researchWith();
        await made.want(ALICE, WANT_GIBLE);
        await made.want(CAROL, boxTarget('research-pokemon', 246));
        await made.reportVersion(ONE_OF, [west(1)]);
        const beldum = await made.reportVersion(BELDUM, [west(1)], BOB_);
        expect(made.dms.to(ALICE)).toHaveLength(1);
        expect(made.dms.to(CAROL)).toHaveLength(1);
        await made.reports.takeBack(
          made.gateway.guildId,
          [beldum.saved[0]?.report.id ?? 0],
          BOB,
          'member',
        );
        await made.notify.flush();
        // Named as they were told of it (review F3): the "one of", not the narrowing.
        for (const member of [ALICE, CAROL]) {
          expect(made.dms.to(member).map(dmSentence).at(-1)).toBe(
            `The field research ${THROWS_TEXT} · one of Larvitar, Beldum, Gible at ${westLink(1)} ` +
              'was taken back by its reporter.',
          );
          expect(made.dms.to(member)).toHaveLength(2);
        }
        // The "one of" reported there again is news to them once more (review F1).
        await made.reportVersion(ONE_OF, [west(1)]);
        for (const member of [ALICE, CAROL]) {
          expect(made.dms.to(member).map(dmSentence).at(-1)).toContain(
            'Field research has been reported',
          );
        }
      });

      it('tells nobody where who wants it cannot be read (review F7)', async () => {
        const made = await researchWith();
        await made.want(ALICE, WANT_GIBLE);
        const outcome = await made.reportVersion(GIBLE, [west(1)]);
        vi.spyOn(made.targetWants, 'wanting').mockRejectedValue(new Error('the pool is gone'));
        await made.reports.takeBack(
          made.gateway.guildId,
          outcome.saved.map(({ report }) => report.id),
          REPORTER,
          'member',
        );
        await made.notify.flush();
        expect(made.dms.to(ALICE)).toHaveLength(1);
      });

      it('sends a replaced report’s second DM through the queue after the first (review F7)', async () => {
        const gateway = new FakeDmGateway();
        const held: { now: () => number } = { now: () => 0 };
        const queued = new QueuedDmSender({
          gateway,
          log: createTestLogger().log,
          now: () => held.now(),
          loopDelay: new FakeLoopDelay(),
          startTimer: () => () => undefined,
        });
        const made = await researchWith({ dms: queued });
        held.now = () => made.clock.now;
        await made.want(ALICE, WANT_GIBLE);
        const gible = await made.reportVersion(GIBLE, [west(1)]);
        await made.reportVersion(BELDUM, [west(1)], BOB_, [gible.saved[0]?.report.id ?? 0]);
        await pullUntilIdle(queued);
        expect(
          gateway.sent
            .filter(({ userId }) => userId === ALICE)
            .map(({ message }) => dmSentence(message)),
        ).toEqual([
          expect.stringContaining('Field research has been reported'),
          `The field research ${THROWS_TEXT} · Gible at ${westLink(1)} was replaced: ` +
            `${THROWS_TEXT} · Beldum is reported there now.`,
        ]);
      });

      it('forgets who was told of a report once it has ended (review F6)', async () => {
        const made = await researchWith();
        await made.want(ALICE, WANT_GIBLE);
        await made.reportVersion(GIBLE, [west(1)]);
        expect(made.notify.reportsRemembered).toBe(1);
        // The next day: the report of yesterday has ended.
        made.clock.now += 24 * 60 * 60_000;
        await made.reportVersion(GIBLE, [west(2)]);
        expect(made.notify.reportsRemembered).toBe(1);
      });
    });
  });

  it('tells nobody where notifications are off', async () => {
    const made = await researchWith();
    made.settings.features.notifications = false;
    await made.want(ALICE, RESEARCH_DRATINI);
    await made.report(DRAGON, [west(1)]);
    expect(made.dms.recipients).toEqual([]);
    made.settings.features.notifications = true;
    await background.settle();
  });
});
