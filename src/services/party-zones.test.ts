import { describe, expect, it } from 'vitest';
import { TEST_GUILD_ROW, WEST_CHANNEL } from '../../test/support/gyms.js';
import { textOf } from '../../test/support/messages.js';
import { at, REPORTER, testMeetup } from '../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { PartyStatus } from '../domain/party/status.js';
import { withZones } from '../../test/support/server-values.js';
import { watchEachTest } from '../../test/support/timers.js';
import { zonedAt } from '../../test/support/time.js';
import { describeTimes } from '../render/timed-post.js';
import { raidDurationsAt } from '../domain/time/raid-durations.js';

/** The fakes' server (`FakePartyGateway.guildId`), the guild of row 1. */
const SERVER = '412345678901234567';
/** A second server, the guild of row 2. */
const OTHER = '412345678901234599';
const serverOfRow = (row: number) => (row === 1 ? SERVER : row === 2 ? OTHER : undefined);

watchEachTest();

describe('a party in its server’s zone (plan 19A-2)', () => {
  it('shows a timed party’s times in its own server’s zone', async () => {
    const made = await partyServiceWith([], {
      servers: withZones({ [OTHER]: 'Europe/Berlin' }),
      serverOfRow,
    });
    // At 14:00 in New York, 20:00 in Berlin; the start is 19:00 in New York, 01:00 in Berlin.
    const start = at('2026-10-13T19:00');
    const here = testMeetup({ startTime: start });
    const there = testMeetup({ guildId: 2, startTime: start });
    const moment = String(start / 1000);
    // Today where it is today, with the date where it is tomorrow already.
    expect(describeTimes(made.service.timedView(here))).toContain(`<t:${moment}:t>`);
    expect(describeTimes(made.service.timedView(there))).toContain(`<t:${moment}:F>`);
  });

  it('gives a party whose row has no known server the default zone, and warns once per row (fix round 1, K1)', async () => {
    const made = await partyServiceWith([], {
      servers: withZones({ [OTHER]: 'Europe/Berlin' }),
      serverOfRow,
    });
    const lost = testMeetup({ guildId: 9 });
    expect(made.service.zoneOf(lost)).toBe('America/New_York');
    expect(made.service.zoneOf(lost)).toBe('America/New_York');
    expect(made.service.zoneOf(testMeetup({ guildId: 2 }))).toBe('Europe/Berlin');
    const warned = made.entries.filter((entry) => entry.msg === 'a party’s server is not known');
    expect(warned).toEqual([expect.objectContaining({ level: 40, row: 9 })]);
  });

  it('gives a party the rules of its server’s zone: the weekly Raid Hour on its own clock', async () => {
    const made = await partyServiceWith([], {
      servers: withZones({ [OTHER]: 'Asia/Kolkata' }),
      serverOfRow,
    });
    // Wednesday 18:10 in Kolkata, the weekly Raid Hour there (the fixture feed lists none that
    // week); 08:40 in New York, none.
    const hatch = zonedAt('2026-11-18T18:10', 'Asia/Kolkata');
    const there = made.service.rulesOf(testMeetup({ guildId: 2 }));
    const here = made.service.rulesOf(testMeetup());
    expect(raidDurationsAt('standard', hatch, there).event?.name).toBe('Raid Hour');
    expect(raidDurationsAt('standard', hatch, here).event).toBeUndefined();
  });

  it('gives a party the feed’s Raid Hour at its local time on its own server’s clock', async () => {
    const made = await partyServiceWith([], {
      servers: withZones({ [OTHER]: 'Europe/Berlin' }),
      serverOfRow,
    });
    // The feed's Dialga Raid Hour, Wednesday 2026-10-14 18:00 to 19:00 local: at 18:10 in
    // Berlin (12:10 in New York) it is on there, not here; at 18:10 in New York the other way.
    const there = made.service.rulesOf(testMeetup({ guildId: 2 }));
    const here = made.service.rulesOf(testMeetup());
    const berlin = zonedAt('2026-10-14T18:10', 'Europe/Berlin');
    expect(raidDurationsAt('standard', berlin, there).event?.name).toBe('Dialga Raid Hour');
    expect(raidDurationsAt('standard', berlin, here).event).toBeUndefined();
    const newYork = at('2026-10-14T18:10');
    expect(raidDurationsAt('standard', newYork, here).event?.name).toBe('Dialga Raid Hour');
    expect(raidDurationsAt('standard', newYork, there).event).toBeUndefined();
  });
});

describe('the region summaries in their server’s zone (plan 19A-2)', () => {
  const BERLIN = 'Europe/Berlin';
  const berlin = (local: string) => zonedAt(local, BERLIN);

  /** A party service whose server is in Berlin, with its timers kept, and West's summary made. */
  async function inBerlin() {
    const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
    const servers = withZones({ [SERVER]: BERLIN });
    const made = await partyServiceWith([], {
      servers,
      serverOfRow,
      setTimer: (run, ms) => {
        const timer = { run, ms, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });
    const west = made.regions.rows[0]!;
    await made.service.ensureSummary(west);
    // 19:00 tomorrow in Berlin, 13:00 in New York.
    const outcome = await made.service.createMeetup({
      name: 'Community Day picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
      startTime: berlin('2026-10-14T19:00'),
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await made.service.flush();
    const board = made.gateway.posts.get(west.summaryMessageId ?? '')!;
    return { ...made, servers, timers, board };
  }

  it('draws a server’s summaries anew at its own midnight, not at another zone’s', async () => {
    const made = await inBerlin();
    const { service, timers, clock, board } = made;
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 coming up/);
    service.watchMidnight();
    // One timer per zone in use: Berlin's, and New York's, the instance's default.
    const berlinMidnight = timers.find(
      (one) => one.ms === berlin('2026-10-14T00:00') - clock.now + 1_000,
    );
    const newYorkMidnight = timers.find(
      (one) => one.ms === at('2026-10-14T00:00') - clock.now + 1_000,
    );
    expect(berlinMidnight).toBeDefined();
    expect(newYorkMidnight).toBeDefined();
    // Berlin's midnight is 18:00 in New York: the meetup is today there.
    clock.now = berlin('2026-10-14T00:00:01');
    berlinMidnight?.run();
    await service.flush();
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 meetup/);
    // New York's midnight asks nothing of a server in Berlin.
    clock.now = at('2026-10-14T00:00:01');
    const calls = made.gateway.calls.length;
    newYorkMidnight?.run();
    await service.flush();
    expect(made.gateway.calls.slice(calls)).toEqual([]);
  });

  it('waits for the midnight of a server that joins in a zone of its own (fix round 1, N5)', async () => {
    const made = await inBerlin();
    const { service, servers, timers, clock } = made;
    // Only the server in New York is there: Berlin is no zone in use.
    servers.present = ['412345678901234500'];
    servers.onZonesInUseChange(() => {
      service.zonesChanged();
    });
    service.watchMidnight();
    const berlinMidnight = berlin('2026-10-14T00:00') - clock.now + 1_000;
    expect(timers.some((one) => one.ms === berlinMidnight && !one.cancelled)).toBe(false);
    // The server in Berlin joins.
    servers.presenceChanged(['412345678901234500', SERVER]);
    expect(timers.some((one) => one.ms === berlinMidnight && !one.cancelled)).toBe(true);
  });

  it('draws a server’s summaries at the midnight of its own spelling of a zone (fix round 2, P1)', async () => {
    const made = await inBerlin();
    const { service, servers, timers, clock, board } = made;
    // Another server in Chicago; this one's staff change Berlin for another name of that zone.
    withZones({ [OTHER]: 'America/Chicago' }, servers);
    servers.present = [OTHER, SERVER];
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'US/Central' }), {
      id: REPORTER,
    });
    service.watchMidnight();
    // The meetup at 19:00 tomorrow in Berlin is 12:00 tomorrow in Chicago.
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 coming up/);
    const midnight = zonedAt('2026-10-14T00:00', 'America/Chicago');
    const due = timers.filter((one) => !one.cancelled && one.ms === midnight - clock.now + 1_000);
    clock.now = midnight + 1_000;
    for (const timer of due) timer.run();
    await service.flush();
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 meetup/);
  });

  it('draws a server’s summaries and posts anew when its zone changes', async () => {
    const made = await inBerlin();
    const { service, servers, board, gateway, clock } = made;
    service.watchMidnight();
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 coming up/);
    const party = made.store.active()[0]!;
    const post = gateway.posts.get(party.forumPostId ?? '')!;
    const shown = textOf(post.message);
    // 21:00 in Berlin is 00:30 the next day in Kolkata: the meetup at 19:00 tomorrow in Berlin
    // is 22:30 today in Kolkata.
    clock.now = berlin('2026-10-13T21:00');
    const timersBefore = made.timers.length;
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Kolkata' }), {
      id: REPORTER,
    });
    service.zoneChanged(SERVER);
    await service.flush();
    // Its post and the summary say it on the new clock: today, without a date (fix round 1, N7).
    const moment = String(berlin('2026-10-14T19:00') / 1000);
    expect(shown).toContain(`<t:${moment}:F>`);
    expect(textOf(post.message)).not.toBe(shown);
    expect(textOf(post.message)).toContain(`<t:${moment}:t>`);
    expect(textOf(board.message)).toMatch(/^### Today and coming up\n1 meetup/);
    // Kolkata's midnight is waited for now, Berlin's no more.
    const kolkataMidnight = made.timers
      .slice(timersBefore)
      .find((one) => one.ms === zonedAt('2026-10-15T00:00', 'Asia/Kolkata') - clock.now + 1_000);
    expect(kolkataMidnight).toBeDefined();
    expect(
      made.timers.find(
        (one) => one.ms === berlin('2026-10-14T00:00') - at('2026-10-13T14:00') + 1_000,
      )?.cancelled,
    ).toBe(true);
  });

  it('queues every active post of the server once, a post already waiting no twice (fix round 1, N7)', async () => {
    const made = await inBerlin();
    const { service, servers, gateway } = made;
    const second = await service.createMeetup({
      name: 'Raid night',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
      startTime: berlin('2026-10-14T20:00'),
    });
    if (second.kind !== 'created') throw new Error(second.kind);
    await service.flush();
    expect(made.store.active()).toHaveLength(2);
    // 21:00 in Berlin, 00:30 the next day in Kolkata: both meetups are today there.
    made.clock.now = berlin('2026-10-13T21:00');
    const before = gateway.calls.length;
    await servers.set(SERVER, (values) => ({ ...values, timezone: 'Asia/Kolkata' }), {
      id: REPORTER,
    });
    // Told twice before the queue drains: each post is queued once.
    service.zoneChanged(SERVER);
    service.zoneChanged(SERVER);
    await service.flush();
    const edits = gateway.calls.slice(before).filter((call) => call.startsWith('editPost '));
    expect(edits).toHaveLength(2);
    expect(new Set(edits).size).toBe(2);
  });
});

describe('PartyScheduler in each server’s zone (plan 19A-2)', () => {
  /** How many calls the clock made to Discord between two ticks across `zone`'s midnight. */
  async function shownAtMidnight(zone: string | undefined): Promise<number> {
    const made = await reportedRaid(
      { time: { hatch: at('2026-10-13T18:40') } },
      zone === undefined ? {} : { servers: withZones({ [SERVER]: zone }) },
      { clock: { now: at('2026-10-13T17:50') } },
    );
    const tick = async (time: number) => {
      made.clock.now = time;
      await made.scheduler.tick();
      await made.scheduler.whenIdle();
      await made.service.flush();
    };
    // The first tick after a start shows every post once.
    await tick(at('2026-10-13T17:55'));
    const before = made.gateway.calls.length;
    // 18:01 in New York is 00:01 in Berlin: a new day there, not here.
    await tick(at('2026-10-13T18:01'));
    return made.gateway.calls.length - before;
  }

  it('shows a post anew at its own server’s midnight, not at another zone’s', async () => {
    expect(await shownAtMidnight('Europe/Berlin')).toBeGreaterThan(0);
    expect(await shownAtMidnight(undefined)).toBe(0);
  });

  it('in one tick, shows anew only the post of the server whose day turned (fix round 1, K4)', async () => {
    const made = await reportedRaid(
      { time: { hatch: at('2026-10-13T18:40') } },
      { servers: withZones({ [OTHER]: 'Europe/Berlin' }), serverOfRow },
      { clock: { now: at('2026-10-13T17:50') } },
    );
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('the invented gyms have no gym 2');
    const second = await made.service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      time: { hatch: at('2026-10-13T18:40') },
    });
    if (second.kind !== 'created') throw new Error('the second raid was not created');
    await made.service.flush();
    // The second raid is the Berlin server's (row 2).
    await made.store.update(second.party.id, (party) => ({ party: { ...party, guildId: 2 } }));
    const berlinPost = second.party.forumPostId;
    const tick = async (time: number) => {
      made.clock.now = time;
      await made.scheduler.tick();
      await made.scheduler.whenIdle();
      await made.service.flush();
    };
    await tick(at('2026-10-13T17:55'));
    const before = made.gateway.calls.length;
    // 18:01 in New York is 00:01 in Berlin: a new day there, not here.
    await tick(at('2026-10-13T18:01'));
    const edited = new Set(
      made.gateway.calls.slice(before).map((call) => call.slice(call.indexOf(' ') + 1)),
    );
    expect(edited.has(berlinPost ?? '')).toBe(true);
    expect(edited.has(made.postId)).toBe(false);
  });
});
