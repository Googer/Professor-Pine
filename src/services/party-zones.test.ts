import { describe, expect, it } from 'vitest';
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
