import { describe, expect, it, vi } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../test/support/gyms.js';
import { heldCall, type HeldCall } from '../../test/support/held-call.js';
import { textOf } from '../../test/support/messages.js';
import { feedChoice } from '../../test/support/rocket.js';
import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
import { REPORT_NOW, reportedStop } from '../../test/support/stop-report-cases.js';
import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { lineupChoice } from '../domain/rocket/lineups.js';
import { rocketDay } from '../domain/rocket/reports.js';
import type { RocketReport } from '../domain/stops/report.js';
import { GruntMessageService } from './grunt-messages.js';
import { RocketService, rocketSubject, type RocketNews } from './rocket-reports.js';
import { StopReportService } from './stop-reports.js';

const ASH = { id: '200000000000000061', name: 'Ash' };
const MISTY = { id: '200000000000000062', name: 'Misty' };
/** A stop in West, one in East, and one in neither. */
const WEST = reportedStop(1, { lat: 40.051, lon: -80.05 });
const EAST = reportedStop(2, { lat: 40.05, lon: -79.95 });

function rocketWith(options: { rehearsal?: boolean; overlap?: boolean } = {}) {
  const clock = { now: REPORT_NOW };
  const { log } = createTestLogger();
  const gateway = new FakePartyGateway();
  const store = new MemoryStopReports();
  const reports = new StopReportService({
    rewardHash: fixtureRewardHash,
    store,
    events: { researchEvents: () => [] },
    zone: 'America/New_York',
    log,
    now: () => clock.now,
  });
  /** Channels where a send fails with this error. */
  const failSend = new Map<string, Error>();
  /** Run before a send fails (what happens meanwhile, fix S1); `guildsFail` makes the lookup throw. */
  const hooks: {
    beforeFail?: () => Promise<unknown>;
    /** Run once while a send that succeeds is on its way (fix F3). */
    duringSend?: () => Promise<unknown>;
    guildsFail?: Error;
    /** The next lookup of the server's row, held until the test releases it (L-1). */
    holdGuilds?: HeldCall;
    /** Called as the service asks for a grunt's messages to be refined (review R1). */
    refining?: () => void;
  } = {};
  /** The next send in a channel, held until the test releases it (review R1). */
  const heldSends = new Map<string, HeldCall>();
  const holdSend = (channelId: string): HeldCall => {
    const held = heldCall(`the send in channel ${channelId}`);
    heldSends.set(channelId, held);
    return held;
  };
  const gruntStore = new MemoryGruntMessages();
  const service = options.rehearsal
    ? undefined
    : new GruntMessageService({
        gateway: {
          sendMessage: async (channelId, message) => {
            const held = heldSends.get(channelId);
            if (held) {
              heldSends.delete(channelId);
              held.arrive();
              await held.released;
            }
            const err = failSend.get(channelId);
            if (!err) {
              const during = hooks.duringSend;
              delete hooks.duringSend;
              const sent = gateway.sendMessage(channelId, message);
              await during?.();
              return sent;
            }
            await hooks.beforeFail?.();
            throw err;
          },
          editMessage: (channelId, messageId, message) =>
            gateway.editMessage(channelId, messageId, message),
          deleteMessage: (channelId, messageId) => gateway.deleteMessage(channelId, messageId),
          mayPost: (channelId) => gateway.mayPost(channelId),
        },
        store: gruntStore,
        reports,
        log,
        now: () => clock.now,
        setTimer: () => () => undefined,
      });
  const messages = service && {
    post: service.post.bind(service),
    messagesOf: service.messagesOf.bind(service),
    flush: service.flush.bind(service),
    refine: (report: RocketReport) => {
      hooks.refining?.();
      return service.refine(report);
    },
  };
  const told: RocketNews[] = [];
  const rocket = new RocketService({
    reports,
    messages,
    // With `overlap`, East holds West's stops too (two region channels for one stop).
    regions: {
      all: () =>
        testRegions().map((region) =>
          options.overlap && region.channelId === EAST_CHANNEL
            ? { ...region, bounds: testRegions()[0]?.bounds ?? null }
            : region,
        ),
    },
    guilds: {
      idFor: async (id) => {
        const held = hooks.holdGuilds;
        if (held) {
          delete hooks.holdGuilds;
          held.arrive();
          await held.released;
        }
        if (hooks.guildsFail) throw hooks.guildsFail;
        return id === FAKE_GUILD_ID ? 1 : undefined;
      },
    },
    notify: { rocketReported: (news) => told.push(news) },
    log,
  });
  const report = (key: string, stop = WEST, more: { by?: typeof ASH; replacing?: number } = {}) =>
    rocket.report({
      serverId: FAKE_GUILD_ID,
      stop,
      subject: rocketSubject(feedChoice(key)),
      reporter: more.by ?? ASH,
      ...(more.replacing === undefined ? {} : { replacing: more.replacing }),
    });
  /** Misty (unless said) reports the water grunt's Magikarp lineup at West, a refine of its type. */
  const refine = (by = MISTY) => {
    const water = feedChoice('grunt:water');
    const magikarps = water.lineups?.[1];
    if (!magikarps) throw new Error('the water grunt has two lineups');
    return rocket.report({
      serverId: FAKE_GUILD_ID,
      stop: WEST,
      subject: rocketSubject(lineupChoice(water, magikarps)),
      reporter: by,
    });
  };
  return {
    clock,
    gateway,
    reports,
    store,
    messages,
    gruntStore,
    rocket,
    told,
    report,
    refine,
    failSend,
    hooks,
    holdSend,
  };
}

describe('RocketService', () => {
  it('posts in the other region channel when one fails, and tells of it (fix A1)', async () => {
    const made = rocketWith({ overlap: true });
    made.failSend.set(EAST_CHANNEL, new Error('500 Internal Server Error'));
    const outcome = await made.report('grunt:water');
    expect(outcome).toMatchObject({
      kind: 'reported',
      channels: [WEST_CHANNEL, EAST_CHANNEL],
    });
    if (outcome.kind !== 'reported') return;
    expect(outcome.posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL]);
    // Only the channel it was posted in (fix R3).
    expect(made.told.map((news) => news.channels)).toEqual([
      [{ channelId: WEST_CHANNEL, messageId: outcome.posted[0]?.messageId }],
    ]);
    expect(await made.messages?.messagesOf(outcome.report.id)).toEqual(outcome.posted);
  });

  it('puts back the hideout an unposted grunt replaced, under a new id (fix R2)', async () => {
    const made = rocketWith();
    const changed: string[][] = [];
    made.reports.listen({ changed: (_server, stops) => changed.push(stops.map((s) => s.key)) });
    const arlo = await made.report('leader:arlo');
    if (arlo.kind !== 'reported') throw new Error('not reported');
    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
    const outcome = await made.report('grunt:water', WEST, { replacing: arlo.report.id });
    expect(outcome).toMatchObject({ kind: 'unposted', restored: { subjectKey: 'leader:arlo' } });
    if (outcome.kind !== 'unposted') return;
    expect(outcome.lost).toBeUndefined();
    const standing = await made.reports.standing(FAKE_GUILD_ID);
    expect(standing).toEqual([outcome.restored]);
    expect(standing[0]).toMatchObject({
      reporter: arlo.report.reporter,
      periodKey: arlo.report.periodKey,
      endsAt: arlo.report.endsAt,
      rocket: arlo.report.rocket,
    });
    expect(standing[0]?.id).not.toBe(arlo.report.id);
    // The post is drawn with Arlo again.
    expect(changed.at(-1)).toEqual([WEST.key]);
  });

  describe('putting a hideout back (fixes S1, S4)', () => {
    async function arloThenUnposted(
      made: ReturnType<typeof rocketWith>,
      meanwhile?: () => Promise<unknown>,
    ) {
      const arlo = await made.report('leader:arlo', WEST, { by: MISTY });
      if (arlo.kind !== 'reported') throw new Error('not reported');
      made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
      if (meanwhile) made.hooks.beforeFail = meanwhile;
      const outcome = await made.report('grunt:water', WEST, { replacing: arlo.report.id });
      made.failSend.clear();
      delete made.hooks.beforeFail;
      return { arlo: arlo.report, outcome };
    }

    it('tells nobody of the hideout put back', async () => {
      const made = rocketWith();
      await arloThenUnposted(made);
      expect(made.told.map((news) => news.report.subjectKey)).toEqual(['leader:arlo']);
    });

    it('leaves no moment without a report: one made then meets Arlo', async () => {
      const made = rocketWith();
      // A grunt reported as the unposted one is taken off: it finds Arlo back already.
      let during: ReturnType<typeof made.report> | undefined;
      made.reports.listen({
        ended: (reports) => {
          if (reports.some((one) => one.subjectKey === 'grunt:water')) {
            during ??= made.report('grunt:fire', WEST);
          }
        },
      });
      await arloThenUnposted(made);
      expect(await during).toMatchObject({
        kind: 'asks',
        standing: { subjectKey: 'leader:arlo' },
      });
    });

    it('puts nothing back where another report came meanwhile: Cliff stands, overtaken (fix F3)', async () => {
      const made = rocketWith();
      const { outcome } = await arloThenUnposted(made, () => made.report('leader:cliff', WEST));
      // Cliff replaced the grunt while it was posted: the grunt was overtaken, not unposted.
      expect(outcome).toEqual({ kind: 'overtaken', channels: [WEST_CHANNEL] });
      expect((await made.reports.standing(FAKE_GUILD_ID)).map((one) => one.subjectKey)).toEqual([
        'leader:cliff',
      ]);
    });

    it('puts nothing back once the hideout’s day has ended', async () => {
      const made = rocketWith();
      const { arlo, outcome } = await arloThenUnposted(made, () => {
        made.clock.now = rocketDay(REPORT_NOW, 'America/New_York').end + 60_000;
        return Promise.resolve();
      });
      expect(outcome).toMatchObject({ kind: 'unposted' });
      if (outcome.kind !== 'unposted') return;
      expect(outcome.restored).toBeUndefined();
      expect(
        (await made.reports.standing(FAKE_GUILD_ID)).filter(
          (one) => one.subjectKey === arlo.subjectKey,
        ),
      ).toEqual([]);
    });

    it('stores nothing when finding the channels throws, and passes the error on (L-1)', async () => {
      const made = rocketWith();
      const arlo = await made.report('leader:arlo', WEST, { by: MISTY });
      if (arlo.kind !== 'reported') throw new Error('not reported');
      made.hooks.guildsFail = new Error('the database is away');
      await expect(made.report('grunt:water', WEST, { replacing: arlo.report.id })).rejects.toThrow(
        'the database is away',
      );
      delete made.hooks.guildsFail;
      // Arlo was never replaced: the very report stands.
      expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([arlo.report]);
    });
  });

  it('names the grunt an unposted grunt replaced, which cannot come back (fix R2)', async () => {
    const made = rocketWith();
    const fire = await made.report('grunt:fire');
    if (fire.kind !== 'reported') throw new Error('not reported');
    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
    const outcome = await made.report('grunt:water', WEST, { by: MISTY });
    expect(outcome).toMatchObject({ kind: 'unposted', lost: { id: fire.report.id } });
    expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
  });

  it('takes a grunt back that could be posted nowhere, and tells nobody (fix A5)', async () => {
    const made = rocketWith();
    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
    expect(await made.report('grunt:water')).toEqual({
      kind: 'unposted',
      channels: [WEST_CHANNEL],
    });
    expect(made.told).toEqual([]);
    expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
    // So it does not stand in the way: the same grunt again is a report.
    made.failSend.clear();
    expect(await made.report('grunt:water')).toMatchObject({ kind: 'reported' });
  });

  it('tells nobody of a grunt replaced while its message was being posted (fix F3)', async () => {
    const made = rocketWith();
    let fire: ReturnType<typeof made.report> | undefined;
    made.hooks.duringSend = () => {
      fire = made.report('grunt:fire', WEST, { by: MISTY });
      return fire;
    };
    const outcome = await made.report('grunt:water');
    await made.messages?.flush();
    expect(outcome).toMatchObject({ kind: 'overtaken', channels: [WEST_CHANNEL] });
    expect((await fire)?.kind).toBe('reported');
    // Only the Fire-type grunt is told of and stands; the Water-type grunt's message is gone.
    expect(made.told.map((news) => news.report.subjectKey)).toEqual(['grunt:fire']);
    expect((await made.reports.standing(FAKE_GUILD_ID)).map((one) => one.subjectKey)).toEqual([
      'grunt:fire',
    ]);
    expect(made.gateway.messagesIn(WEST_CHANNEL).map((one) => textOf(one.message))).toEqual([
      expect.stringContaining('### Fire-type grunt'),
    ]);
  });

  it('records a grunt posted nowhere, and one overtaken, as unposted: nobody saw it (plan 8H-2)', async () => {
    const made = rocketWith();
    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
    await made.report('grunt:water');
    made.failSend.clear();
    made.hooks.duringSend = () => made.report('grunt:fire', WEST, { by: MISTY });
    expect(await made.report('grunt:water')).toMatchObject({ kind: 'overtaken' });
    expect(made.store.records.map(({ subjectKey, ending }) => [subjectKey, ending])).toEqual([
      ['grunt:water', 'unposted'],
      ['grunt:water', 'unposted'],
    ]);
  });

  it('says a grunt replaced while its only send failed was overtaken, not unposted (fix F3)', async () => {
    const made = rocketWith();
    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
    made.hooks.beforeFail = () => {
      made.failSend.clear();
      return made.report('leader:cliff', WEST, { by: MISTY });
    };
    expect(await made.report('grunt:water')).toEqual({
      kind: 'overtaken',
      channels: [WEST_CHANNEL],
    });
    expect((await made.reports.standing(FAKE_GUILD_ID)).map((one) => one.subjectKey)).toEqual([
      'leader:cliff',
    ]);
  });

  it('posts a grunt in the region channels of its stop, then tells who wants it', async () => {
    const made = rocketWith();
    const outcome = await made.report('grunt:water');
    expect(outcome).toMatchObject({ kind: 'reported', channels: [WEST_CHANNEL] });
    if (outcome.kind !== 'reported') return;
    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(outcome.posted).toEqual([{ channelId: WEST_CHANNEL, messageId: message?.id }]);
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
    expect(made.told).toEqual([
      {
        serverId: FAKE_GUILD_ID,
        report: outcome.report,
        channels: [{ channelId: WEST_CHANNEL, messageId: message?.id }],
      },
    ]);
    expect(outcome.report.rocket).toEqual({
      name: 'Water-type grunt',
      catches: feedChoice('grunt:water').catches,
    });
  });

  it('answers the same grunt again with its messages, and posts and tells nothing', async () => {
    const made = rocketWith();
    const first = await made.report('grunt:water');
    const again = await made.report('grunt:water', WEST, { by: MISTY });
    expect(again).toMatchObject({ kind: 'already' });
    if (first.kind !== 'reported' || again.kind !== 'already') return;
    expect(again.posted).toEqual(first.posted);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
    expect(made.told).toHaveLength(1);
  });

  it('refines a grunt by a lineup of its type in place: its messages edited, told again (plan 8R-4L)', async () => {
    const made = rocketWith({ overlap: true });
    const first = await made.report('grunt:water');
    if (first.kind !== 'reported') throw new Error(first.kind);
    const water = feedChoice('grunt:water');
    const [, magikarps] = water.lineups ?? [];
    if (!magikarps) throw new Error('the water grunt has two lineups');
    const refined = await made.rocket.report({
      serverId: FAKE_GUILD_ID,
      stop: WEST,
      subject: rocketSubject(lineupChoice(water, magikarps)),
      reporter: MISTY,
    });
    expect(refined).toMatchObject({
      kind: 'reported',
      report: { id: first.report.id, subjectKey: 'grunt:water:male', reporter: MISTY },
      replaced: first.report,
      channels: first.channels,
      posted: first.posted,
    });
    await made.messages?.flush();
    // The same messages, edited; none deleted or sent anew.
    expect(made.gateway.deleted).toEqual([]);
    for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
      const [message, ...more] = made.gateway.messagesIn(channel);
      expect(more).toEqual([]);
      expect(message?.edits).toBe(1);
      expect(textOf(message?.message)).toContain('**Catch** one of Magikarp, Feebas');
    }
    // Told as a new report, with its messages (the hour per type keeps a second DM away).
    expect(made.told).toHaveLength(2);
    expect(made.told[1]).toEqual({
      serverId: FAKE_GUILD_ID,
      report: refined.kind === 'reported' ? refined.report : undefined,
      channels: first.posted,
      alsoActors: [ASH.id],
    });
  });

  it('tells once, of the refined grunt, when it is refined while its messages are posted (R1, R2)', async () => {
    const made = rocketWith({ overlap: true });
    const east = made.holdSend(EAST_CHANNEL);
    const first = made.report('grunt:water');
    await east.reached;
    const queued = new Promise<void>((resolve) => {
      made.hooks.refining = resolve;
    });
    made.clock.now += 60_000;
    const refining = made.refine();
    await queued;
    east.release();
    const [answered, refined] = await Promise.all([first, refining]);
    await made.messages?.flush();
    if (refined.kind !== 'reported') throw new Error(refined.kind);
    expect(refined.report.subjectKey).toBe('grunt:water:male');
    // The first reporter is answered with the report as it stands now.
    expect(answered).toMatchObject({ kind: 'reported', report: refined.report });
    // Both messages edited and retimed.
    for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
      const [message, ...more] = made.gateway.messagesIn(channel);
      expect(more).toEqual([]);
      expect(message?.edits).toBe(1);
      expect(textOf(message?.message)).toContain('**Catch** one of Magikarp, Feebas');
    }
    expect(made.gruntStore.rows.map((row) => row.deleteAt)).toEqual([
      refined.report.endsAt,
      refined.report.endsAt,
    ]);
    // One DM round, of the refined report, with both messages.
    expect(made.told).toEqual([
      {
        serverId: FAKE_GUILD_ID,
        report: refined.report,
        channels: refined.posted,
        alsoActors: [ASH.id],
      },
    ]);
    expect(refined.posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL, EAST_CHANNEL]);
  });

  it('finds the stop’s channels before it stores, so a refine cannot queue before the post (L-1)', async () => {
    const made = rocketWith();
    // Ash's report waits for its region channels; Misty's lineup comes meanwhile.
    const lookup = (made.hooks.holdGuilds = heldCall('the server lookup of Ash’s report'));
    const first = made.report('grunt:water');
    await lookup.reached;
    made.clock.now += 60_000;
    const refined = await made.refine();
    lookup.release();
    const answered = await first;
    await made.messages?.flush();
    // Nothing was stored while the lookup waited: Misty's lineup is a report, Ash's the same grunt.
    expect(refined).toMatchObject({ kind: 'reported', report: { subjectKey: 'grunt:water:male' } });
    expect(answered.kind).toBe('already');
    const standing = await made.reports.standing(FAKE_GUILD_ID);
    expect(standing.map((one) => one.subjectKey)).toEqual(['grunt:water:male']);
    const [message, ...more] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(more).toEqual([]);
    expect(await made.messages?.messagesOf(standing[0]?.id ?? 0)).toEqual([
      { channelId: WEST_CHANNEL, messageId: message?.id },
    ]);
  });

  it('shows, keeps and tells one version where a refine of an older clock lands after the report (F1)', async () => {
    const made = rocketWith();
    const first = await made.report('grunt:water');
    if (first.kind !== 'reported') throw new Error(first.kind);
    // Misty's refine read a clock half a minute behind Ash's report, and is written after it.
    made.clock.now = REPORT_NOW - 30_000;
    const refined = await made.refine();
    if (refined.kind !== 'reported') throw new Error(refined.kind);
    await made.messages?.flush();
    // The version written is a millisecond newer than Ash's, its half hour kept.
    expect(refined.report).toMatchObject({
      id: first.report.id,
      madeAt: first.report.madeAt + 1,
      endsAt: first.report.madeAt + 1 + 30 * 60_000,
      reporter: MISTY,
    });
    // The stored row, the message and the DM are all of it.
    expect(await made.reports.kept(FAKE_GUILD_ID, first.report.id)).toEqual(refined.report);
    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(message?.edits).toBe(1);
    expect(textOf(message?.message)).toContain('**Catch** one of Magikarp, Feebas');
    expect(made.gruntStore.rows.map((row) => row.deleteAt)).toEqual([refined.report.endsAt]);
    expect(made.told.map((news) => news.report)).toEqual([first.report, refined.report]);
  });

  describe('a grunt posted nowhere while it was refined (F9, K1)', () => {
    /** Misty refines Ash's grunt while its only send is on its way, and the send fails. */
    async function refinedWhileUnposted(made: ReturnType<typeof rocketWith>, replacing?: number) {
      made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
      let refining: ReturnType<typeof made.refine> | undefined;
      const queued = new Promise<void>((resolve) => {
        made.hooks.refining = resolve;
      });
      made.hooks.beforeFail = () => {
        made.clock.now += 60_000;
        refining = made.refine();
        return queued;
      };
      const outcome = await made.report(
        'grunt:water',
        WEST,
        replacing === undefined ? {} : { replacing },
      );
      return { outcome, refined: await refining };
    }

    it('answers the posting member unposted, and the refine takes it back (F9, K1)', async () => {
      const made = rocketWith();
      const { outcome, refined } = await refinedWhileUnposted(made);
      // Not overtaken: nothing newer stands, and the use is given back.
      expect(outcome).toEqual({ kind: 'unposted', channels: [WEST_CHANNEL] });
      // The refine finds no message of it either: it is taken back, Ash's grunt named as lost.
      expect(refined).toMatchObject({ kind: 'unposted', lost: { subjectKey: 'grunt:water' } });
      expect(made.told).toEqual([]);
      expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
    });

    it('records the version nobody saw as unposted, not as refined (8H2-1)', async () => {
      const made = rocketWith();
      await refinedWhileUnposted(made);
      expect(
        made.store.records.map(({ subjectKey, reportMadeAt, ending }) => [
          subjectKey,
          reportMadeAt,
          ending,
        ]),
      ).toEqual([
        ['grunt:water', REPORT_NOW, 'unposted'],
        ['grunt:water:male', expect.any(Number), 'unposted'],
      ]);
    });

    it('puts back the hideout it had replaced: Arlo comes back (K1)', async () => {
      const made = rocketWith();
      const arlo = await made.report('leader:arlo', WEST, { by: MISTY });
      if (arlo.kind !== 'reported') throw new Error(arlo.kind);
      const { outcome, refined } = await refinedWhileUnposted(made, arlo.report.id);
      expect(outcome).toMatchObject({
        kind: 'unposted',
        channels: [WEST_CHANNEL],
        restored: { subjectKey: 'leader:arlo', madeAt: arlo.report.madeAt },
      });
      // The refine finds its version gone, and takes nothing back.
      expect(refined?.kind).toBe('overtaken');
      const standing = await made.reports.standing(FAKE_GUILD_ID);
      expect(standing.map((one) => one.subjectKey)).toEqual(['leader:arlo']);
      if (outcome.kind === 'unposted') expect(standing).toEqual([outcome.restored]);
      expect(made.told.map((news) => news.report.subjectKey)).toEqual(['leader:arlo']);
    });
  });

  it('takes a refined grunt back whose messages are all gone, naming what is lost (R5)', async () => {
    const made = rocketWith();
    const first = await made.report('grunt:water');
    if (first.kind !== 'reported') throw new Error(first.kind);
    for (const { messageId } of first.posted) made.gateway.gone.add(messageId);
    expect(await made.refine()).toEqual({
      kind: 'unposted',
      channels: [WEST_CHANNEL],
      lost: first.report,
    });
    expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
    expect(made.told).toHaveLength(1);
  });

  it('keeps a refined grunt whose messages could not be read, and tells its region channels (F2, L-5)', async () => {
    const made = rocketWith();
    const first = await made.report('grunt:water');
    if (first.kind !== 'reported') throw new Error(first.kind);
    made.gruntStore.failing.set('ofReport', new Error('the database is away'));
    const refined = await made.refine();
    made.gruntStore.failing.delete('ofReport');
    // Not known to be gone: no undo, the refined report stands.
    expect(refined).toMatchObject({
      kind: 'reported',
      report: { id: first.report.id, subjectKey: 'grunt:water:male' },
      channels: [WEST_CHANNEL],
      posted: [],
    });
    expect(await made.reports.standing(FAKE_GUILD_ID)).toMatchObject([
      { id: first.report.id, subjectKey: 'grunt:water:male' },
    ]);
    // Told as rehearsal mode tells: the stop's region channels, no message ids, so that Shadow
    // wanters of the new lineup still hear.
    expect(made.told.map((news) => [news.report.subjectKey, news.channels])).toEqual([
      ['grunt:water', [{ channelId: WEST_CHANNEL, messageId: first.posted[0]?.messageId }]],
      ['grunt:water:male', [{ channelId: WEST_CHANNEL, messageId: undefined }]],
    ]);
    // The message keeps its old end.
    expect(made.gruntStore.rows.map((row) => row.deleteAt)).toEqual([first.report.endsAt]);
  });

  it('reads a refined grunt’s messages once more, and tells with them (L-5)', async () => {
    const made = rocketWith();
    const first = await made.report('grunt:water');
    if (first.kind !== 'reported') throw new Error(first.kind);
    vi.spyOn(made.gruntStore, 'ofReport').mockRejectedValueOnce(new Error('the database is away'));
    const refined = await made.refine();
    if (refined.kind !== 'reported') throw new Error(refined.kind);
    expect(refined.posted).toEqual(first.posted);
    expect(made.told.map((news) => [news.report.subjectKey, news.channels])).toEqual([
      ['grunt:water', [{ channelId: WEST_CHANNEL, messageId: first.posted[0]?.messageId }]],
      ['grunt:water:male', [{ channelId: WEST_CHANNEL, messageId: first.posted[0]?.messageId }]],
    ]);
  });

  it('refines in rehearsal mode, telling with the region channels (R5)', async () => {
    const made = rocketWith({ rehearsal: true });
    const first = await made.report('grunt:water');
    if (first.kind !== 'reported') throw new Error(first.kind);
    const refined = await made.refine();
    expect(refined).toMatchObject({
      kind: 'reported',
      report: { id: first.report.id, subjectKey: 'grunt:water:male' },
      posted: [],
      channels: [WEST_CHANNEL],
    });
    expect(made.told.map((news) => [news.report.subjectKey, news.channels])).toEqual([
      ['grunt:water', [{ channelId: WEST_CHANNEL, messageId: undefined }]],
      ['grunt:water:male', [{ channelId: WEST_CHANNEL, messageId: undefined }]],
    ]);
  });

  it('deletes the message of the grunt another one replaces', async () => {
    const made = rocketWith();
    const first = await made.report('grunt:water');
    await made.report('grunt:fire', WEST, { by: MISTY });
    await made.messages?.flush();
    if (first.kind !== 'reported') return;
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(
      first.posted.map((one) => one.messageId),
    );
  });

  it('posts no message for a hideout, and tells of it once a day', async () => {
    const made = rocketWith();
    const arlo = await made.report('leader:arlo', EAST);
    expect(arlo).toMatchObject({ kind: 'reported', posted: [], channels: [EAST_CHANNEL] });
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
    expect(made.told.map((news) => news.channels)).toEqual([
      [{ channelId: EAST_CHANNEL, messageId: undefined }],
    ]);
    await made.report('leader:arlo', EAST, { by: MISTY });
    expect(made.told).toHaveLength(1);
  });

  it('asks before a grunt replaces a hideout, and posts nothing then', async () => {
    const made = rocketWith();
    const arlo = await made.report('leader:arlo');
    const asked = await made.report('grunt:water');
    expect(asked).toMatchObject({ kind: 'asks', standing: { subjectKey: 'leader:arlo' } });
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    if (arlo.kind !== 'reported') return;
    expect(await made.report('grunt:water', WEST, { replacing: arlo.report.id })).toMatchObject({
      kind: 'reported',
      replaced: { subjectKey: 'leader:arlo' },
    });
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
  });

  it('posts nothing in rehearsal mode, yet keeps the report and tells of it', async () => {
    const made = rocketWith({ rehearsal: true });
    const outcome = await made.report('grunt:water');
    expect(outcome).toMatchObject({ kind: 'reported', posted: [], channels: [WEST_CHANNEL] });
    expect(made.gateway.messages).toEqual([]);
    expect(made.told.map((news) => news.channels)).toEqual([
      [{ channelId: WEST_CHANNEL, messageId: undefined }],
    ]);
    expect(await made.reports.standing(FAKE_GUILD_ID)).toHaveLength(1);
  });
});
