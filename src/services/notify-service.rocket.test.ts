import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import {
  buttonsOf,
  dmBrief,
  dmReasons,
  dmSentence,
  linksOf,
  textOf,
  thumbnailOf,
} from '../../test/support/messages.js';
import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { feedChoice } from '../../test/support/rocket.js';
import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
import { reportedStop } from '../../test/support/stop-report-cases.js';
import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
import { watchEachTest } from '../../test/support/timers.js';
import { RecordingReach } from '../../test/support/reach.js';
import type { TargetWant } from '../domain/notify/target-wants.js';
import { lineupChoice, type RocketLineupChoice } from '../domain/rocket/lineups.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import type { ReportedStop } from '../domain/stops/report.js';
import { postLink } from '../render/notify-dm.js';
import { DM_PRIORITY } from './dm-sender.js';
import { GruntMessageService } from './grunt-messages.js';
import { MAX_WANT_QUIET_MS, NotifyService, type NotifyServiceOptions } from './notify-service.js';
import { RocketService, rocketSubject } from './rocket-reports.js';
import { StopReportService } from './stop-reports.js';

const background = watchEachTest();
const RITA = { id: REPORTER, name: 'Rita' };

/** Stops in West (40.0–40.1, −80.1–−80.0), one in East, one in both (on their border). */
const west = (n: number): ReportedStop => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
/** The line of `west(n)` in a DM: its name the link to its place (plan 8R-7). */
const westDm = (n: number): string =>
  `- **[Yellow Mural ${String(n)}](<https://www.google.com/maps/search/?api=1&query=` +
  `${String((40_050 + n) / 1_000)}%2C-80.05>)** · Market Street`;

const rocketWant = (who: string): TargetWant => ({ kind: 'rocket', who });

/** The notifier of the party tests, told of Rocket reports through the Rocket service. */
async function rocketWith(notifying: Partial<NotifyServiceOptions> = {}, rehearsal = false) {
  const made = await partyServiceWith([], { notifying });
  const reports = new StopReportService({
    rewardHash: fixtureRewardHash,
    store: new MemoryStopReports(),
    events: { researchEvents: () => [] },
    zone: made.settings.timezone,
    log: made.log,
    now: () => made.clock.now,
  });
  const messages = rehearsal
    ? undefined
    : new GruntMessageService({
        gateway: made.gateway,
        store: new MemoryGruntMessages(),
        reports,
        log: made.log,
        now: () => made.clock.now,
        setTimer: () => () => undefined,
      });
  /** The notifier the Rocket service tells; `restart()` puts in that of a new process (F3). */
  const notifier = { current: made.notify };
  const restart = () => {
    notifier.current = new NotifyService(made.notifyOptions);
  };
  const rocket = new RocketService({
    reports,
    messages,
    regions: made.regions,
    guilds: {
      idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
    },
    notify: {
      rocketReported: (news) => {
        notifier.current.rocketReported(news);
      },
    },
    log: made.log,
  });
  const want = (memberId: string, ...targets: TargetWant[]) =>
    made.targetWants.change(memberId, made.gateway.guildId, { add: targets, remove: [] }, 0);
  const report = async (
    key: string,
    stop: ReportedStop = west(1),
    reporter: { id: string; name: string } = RITA,
  ) => {
    const outcome = await rocket.report({
      serverId: made.gateway.guildId,
      stop,
      subject: rocketSubject(feedChoice(key)),
      reporter,
    });
    await notifier.current.flush();
    return outcome;
  };
  return { ...made, reports, rocket, want, report, notifier, restart };
}

describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () => {
  it('tells who wants the grunt type, linking to its message, at the spawn priority', async () => {
    const made = await rocketWith();
    await made.want(ALICE, rocketWant('grunt:water'));
    await made.want(BOB, rocketWant('grunt:fire'));
    await made.want(REPORTER, rocketWant('grunt:water'));
    const outcome = await made.report('grunt:water');
    if (outcome.kind !== 'reported') throw new Error('not reported');
    expect(made.dms.recipients).toEqual([ALICE]);
    const [message] = made.dms.to(ALICE);
    expect(dmSentence(message)).toBe(
      `A **Water-type grunt** has been reported in <#${WEST_CHANNEL}> by **Rita**.`,
    );
    expect(dmBrief(message)).toEqual([
      '**Catch** one of Mudkip, Tentacool, Krabby, Magikarp, Feebas',
      westDm(1),
      `The report goes away <t:${String(Math.floor(outcome.report.endsAt / 1_000))}:R>.`,
    ]);
    expect(dmReasons(message)).toEqual(['Water-type grunt']);
    // Manage… of Team GO Rocket's dialog, the reason named as before (plan 8R-4).
    expect(buttonsOf(message).filter((button) => button.label === 'Manage…')).toMatchObject([
      { customId: `dm:${made.gateway.guildId}:change:rocket` },
    ]);
    expect(linksOf(message)).toEqual([
      `Go to report ${postLink(made.gateway.guildId, WEST_CHANNEL, outcome.posted[0]?.messageId ?? '')}`,
    ]);
    expect(textOf(message)).toContain('this grunt type again for an hour');
    expect(made.dms.jobs[0]).toEqual(
      expect.objectContaining({ priority: DM_PRIORITY.spawn, expiresAt: outcome.report.endsAt }),
    );
  });

  it('shows the encounter picture for a grunt whose catch is open and a leader’s portrait, made before the DMs go (plan 8R-6)', async () => {
    const prepared: { sources: string[]; sent: number }[] = [];
    const looked = (source: string) =>
      `https://map.example.test/pictures/${String(source.length)}.png`;
    const held: { sent: () => number } = { sent: () => -1 };
    const made = await rocketWith({
      pictures: {
        prepare: (sources) => {
          prepared.push({ sources: [...sources], sent: held.sent() });
          return Promise.resolve();
        },
        url: looked,
      },
    });
    held.sent = () => made.dms.to(ALICE).length;
    await made.want(ALICE, rocketWant('grunt:water'), rocketWant('leader:arlo'));
    await made.report('grunt:water');
    await made.report('leader:arlo', west(2));
    const [grunt, arlo] = made.dms.to(ALICE);
    expect(thumbnailOf(grunt)).toBe(looked(ENCOUNTER_PICTURE));
    expect(thumbnailOf(arlo)).toBe(looked(LEADER_PORTRAITS.arlo));
    expect(prepared).toEqual([
      { sources: [ENCOUNTER_PICTURE], sent: 0 },
      { sources: [LEADER_PORTRAITS.arlo], sent: 1 },
    ]);
  });

  it('tells a member of a grunt type at most once an hour', async () => {
    const made = await rocketWith();
    await made.want(ALICE, rocketWant('grunt:water'));
    await made.report('grunt:water', west(1));
    await made.report('grunt:water', west(2));
    expect(made.dms.to(ALICE)).toHaveLength(1);
    // Another type is another hour.
    await made.want(ALICE, rocketWant('grunt:fire'));
    await made.report('grunt:fire', west(3));
    expect(made.dms.to(ALICE)).toHaveLength(2);
    made.clock.now += MAX_WANT_QUIET_MS;
    await made.report('grunt:water', west(4));
    expect(made.dms.to(ALICE)).toHaveLength(3);
  });

  it('keeps the hour of a grunt type for reports told at once (fix B1)', async () => {
    const made = await rocketWith();
    await made.want(ALICE, rocketWant('grunt:water'));
    // Two reports of the type, the second before the first is worked off.
    const report = (stop: ReportedStop) =>
      made.rocket.report({
        serverId: made.gateway.guildId,
        stop,
        subject: rocketSubject(feedChoice('grunt:water')),
        reporter: RITA,
      });
    await Promise.all([report(west(1)), report(west(2))]);
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  describe('two lineups of a grunt type (plan 8R-4L)', () => {
    const water = feedChoice('grunt:water');
    const [mudkips, magikarps] = water.lineups ?? [];
    if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');

    /** Reports one of the water grunts' lineups, as `/rocket report` would. */
    async function reportLineup(
      made: Awaited<ReturnType<typeof rocketWith>>,
      lineup: RocketLineupChoice,
      stop: ReportedStop,
      reporter = RITA,
    ) {
      const outcome = await made.rocket.report({
        serverId: made.gateway.guildId,
        stop,
        subject: rocketSubject(lineupChoice(water, lineup)),
        reporter,
      });
      await made.notify.flush();
      return outcome;
    }

    it('tells a Shadow Magikarp want of the lineup that gives it and of not sure which, not of the other', async () => {
      const made = await rocketWith();
      await made.wants.set(BOB, made.gateway.guildId, pokemonTarget(129, undefined, true), 'raid');
      await reportLineup(made, mudkips, west(1));
      expect(made.dms.to(BOB)).toEqual([]);
      await reportLineup(made, magikarps, west(2));
      expect(made.dms.to(BOB).map(dmReasons)).toEqual([['Magikarp · Shadow']]);
      expect(dmSentence(made.dms.to(BOB)[0])).toBe(
        `A **Water-type grunt** has been reported in <#${WEST_CHANNEL}> by **Rita**.`,
      );
      made.clock.now += MAX_WANT_QUIET_MS;
      await made.report('grunt:water', west(3));
      expect(made.dms.to(BOB)).toHaveLength(2);
    });

    it('tells a want of the grunt type of every lineup and of not sure which, once an hour', async () => {
      const made = await rocketWith();
      await made.want(ALICE, rocketWant('grunt:water'));
      await reportLineup(made, mudkips, west(1));
      expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Water-type grunt']]);
      await reportLineup(made, magikarps, west(2));
      await made.report('grunt:water', west(3));
      expect(made.dms.to(ALICE)).toHaveLength(1);
      made.clock.now += MAX_WANT_QUIET_MS;
      await reportLineup(made, magikarps, west(4));
      expect(made.dms.to(ALICE)).toHaveLength(2);
    });

    it('keeps the hour of a type for its lineups reported at once, in the type’s line', async () => {
      const made = await rocketWith();
      await made.want(ALICE, rocketWant('grunt:water'));
      const report = (lineup: RocketLineupChoice, stop: ReportedStop) =>
        made.rocket.report({
          serverId: made.gateway.guildId,
          stop,
          subject: rocketSubject(lineupChoice(water, lineup)),
          reporter: RITA,
        });
      await Promise.all([report(mudkips, west(1)), report(magikarps, west(2))]);
      await made.notify.flush();
      expect(made.dms.to(ALICE)).toHaveLength(1);
    });

    it('tells of a grunt refined in place only who was not told of the type (B2)', async () => {
      const made = await rocketWith();
      await made.want(ALICE, rocketWant('grunt:water'));
      await made.wants.set(BOB, made.gateway.guildId, pokemonTarget(129, undefined, true), 'raid');
      await reportLineup(made, mudkips, west(1));
      expect(made.dms.recipients).toEqual([ALICE]);
      // Misty sees the other lineup there: the report is refined, and Bob's Magikarp is told.
      const refined = await reportLineup(made, magikarps, west(1), {
        id: '200000000000000099',
        name: 'Misty',
      });
      expect(refined).toMatchObject({
        kind: 'reported',
        report: { subjectKey: 'grunt:water:male' },
      });
      expect(made.dms.to(ALICE)).toHaveLength(1);
      expect(made.dms.to(BOB).map(dmReasons)).toEqual([['Magikarp · Shadow']]);
      expect(linksOf(made.dms.to(BOB)[0])).toEqual([
        `Go to report ${postLink(
          made.gateway.guildId,
          WEST_CHANNEL,
          refined.kind === 'reported' ? (refined.posted[0]?.messageId ?? '') : '',
        )}`,
      ]);
    });

    it('counts what each version reached for that version (plan 8H-3)', async () => {
      const reach = new RecordingReach();
      const made = await rocketWith({ reach });
      await made.want(ALICE, rocketWant('grunt:water'));
      await made.wants.set(BOB, made.gateway.guildId, pokemonTarget(129, undefined, true), 'raid');
      const grunt = await reportLineup(made, mudkips, west(1));
      const refined = await reportLineup(made, magikarps, west(1), {
        id: '200000000000000099',
        name: 'Misty',
      });
      if (grunt.kind !== 'reported' || refined.kind !== 'reported') throw new Error('not reported');
      expect(refined.report.id).toBe(grunt.report.id);
      expect(reach.runs.map(({ of, members }) => ({ of, members }))).toEqual([
        { of: { report: grunt.report.id, madeAt: grunt.report.madeAt }, members: 1 },
        { of: { report: grunt.report.id, madeAt: refined.report.madeAt }, members: 1 },
      ]);
      expect(refined.report.madeAt).not.toBe(grunt.report.madeAt);
    });
  });

  it('never tells the reporter of not sure which of a refine of their own grunt, nor of the type within the hour (R3)', async () => {
    const made = await rocketWith();
    const water = feedChoice('grunt:water');
    const magikarps = water.lineups?.[1];
    if (!magikarps) throw new Error('the water grunt has two lineups');
    const misty = { id: '200000000000000099', name: 'Misty' };
    await made.want(REPORTER, rocketWant('grunt:water'));
    await made.report('grunt:water', west(1));
    // A restart forgets the hour her own report gave her: only `alsoActors` keeps her untold.
    made.restart();
    made.clock.now += 60_000;
    const refined = await made.rocket.report({
      serverId: made.gateway.guildId,
      stop: west(1),
      subject: rocketSubject(lineupChoice(water, magikarps)),
      reporter: misty,
    });
    await made.notifier.current.flush();
    expect(refined).toMatchObject({ kind: 'reported', report: { reporter: misty } });
    expect(made.dms.to(REPORTER)).toEqual([]);
    // The refine she is an actor of gave her the hour of the type anew: another water grunt is no
    // news to her.
    await made.report('grunt:water', west(2), misty);
    expect(made.dms.to(REPORTER)).toEqual([]);
  });

  it('tells a Shadow want also where no TargetWant is kept (fix B8)', async () => {
    const made = await rocketWith({ targetWants: undefined });
    await made.wants.set(ALICE, made.gateway.guildId, pokemonTarget(258, undefined, true), 'raid');
    await made.report('grunt:water');
    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Mudkip · Shadow']]);
  });

  it('tells who wants a shadow of a catch: the species, or the very form', async () => {
    const made = await rocketWith();
    const grimer = feedChoice('leader:arlo').catches[0];
    await made.wants.set(ALICE, made.gateway.guildId, pokemonTarget(258, undefined, true), 'raid');
    await made.wants.set(
      BOB,
      made.gateway.guildId,
      pokemonTarget(88, grimer?.key ?? '', true),
      'raid',
    );
    // A raid want of the species, not its shadow, is no Rocket want.
    await made.wants.set(CAROL, made.gateway.guildId, pokemonTarget(258), 'both');
    await made.report('grunt:water');
    await made.report('leader:arlo', west(2));
    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Mudkip · Shadow']]);
    expect(made.dms.to(BOB)).toHaveLength(1);
    expect(made.dms.recipients).not.toContain(CAROL);
  });

  it('tells of a hideout by its leader or any leader, linking to the post, once a day', async () => {
    const asked: string[] = [];
    const made = await rocketWith({
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
    await made.want(ALICE, rocketWant('leader:arlo'));
    await made.want(BOB, rocketWant('leader:any'));
    await made.want(CAROL, rocketWant('giovanni'));
    await made.report('leader:arlo');
    expect(made.dms.recipients.sort()).toEqual([ALICE, BOB].sort());
    const [message] = made.dms.to(ALICE);
    expect(dmSentence(message)).toBe(
      `**Arlo** has been reported in <#${WEST_CHANNEL}> by **Rita**.`,
    );
    expect(dmBrief(message).at(-1)).toBe('Until midnight.');
    expect(asked).toEqual([`${WEST_CHANNEL} leader:arlo`]);
    expect(linksOf(message)).toEqual([
      `Go to post ${postLink(made.gateway.guildId, '300000000000000099', '300000000000000077')}`,
    ]);
    expect(made.dms.jobs[0]?.priority).toBe(DM_PRIORITY.normal);
    // The same hideout again, or reported anew after being taken back: nobody told twice.
    await made.report('leader:arlo', west(1), { id: BOB, name: 'Bob' });
    const standing = await made.reports.rocketAt(made.gateway.guildId, west(1).key);
    await made.reports.takeBack(made.gateway.guildId, [standing?.id ?? 0], BOB, 'member');
    await made.report('leader:arlo');
    expect(made.dms.to(ALICE)).toHaveLength(1);
    // Arlo at another stop is news.
    await made.report('leader:arlo', west(2));
    expect(made.dms.to(ALICE)).toHaveLength(2);
  });

  it('tells only who can view the region channel, with no link in rehearsal mode', async () => {
    const made = await rocketWith({}, true);
    await made.want(ALICE, rocketWant('grunt:water'));
    await made.want(BOB, rocketWant('grunt:water'));
    made.gateway.shutOut(EAST_CHANNEL, BOB);
    await made.report('grunt:water', east);
    expect(made.dms.recipients).toEqual([ALICE]);
    expect(linksOf(made.dms.to(ALICE)[0])).toEqual([]);
  });

  it('tells nobody where notifications are off', async () => {
    const made = await rocketWith();
    made.settings.features.notifications = false;
    await made.want(ALICE, rocketWant('grunt:water'));
    await made.report('grunt:water');
    expect(made.dms.recipients).toEqual([]);
    made.settings.features.notifications = true;
    await background.settle();
  });
});
