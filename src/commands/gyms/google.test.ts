import { OTHER_GUILD_ROW, TEST_GUILD_ROW } from '../../../test/support/gyms.js';
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withOtherServer } from '../../../test/support/gym-admin.js';
import { answerOf, gymCommandsWith, said } from '../../../test/support/gym-commands.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import { questionsOf, serverShare } from './google.js';

/** Noon in California on October 11: 21 days of the month are left. */
const NOW = new Date('2026-10-11T12:00:00-07:00').getTime();
const stamp = (ms: number, style: string) => `<t:${Math.floor(ms / 1000)}:${style}>`;

describe('serverShare (plan 19B-3)', () => {
  it('counts how far into the line by the places asked: a gym or Wayspot of two servers once', () => {
    const gym = (guildId: number, gymId: number) => ({
      guildId,
      gymId,
      address: false,
      rank: 0,
      queuedAt: 1,
    });
    const spot = (guildId: number, wayspotId: string) => ({
      guildId,
      wayspotId,
      kind: 'stop' as const,
      rank: 0,
      queuedAt: 1,
    });
    // Gym 7 of both servers first, then the other server's 8, then this server's 9.
    const share = serverShare(
      {
        gyms: [gym(OTHER_GUILD_ROW, 7), gym(TEST_GUILD_ROW, 7), gym(OTHER_GUILD_ROW, 8), gym(1, 9)],
        wayspots: [spot(OTHER_GUILD_ROW, 'a.16'), spot(TEST_GUILD_ROW, 'a.16')],
      },
      TEST_GUILD_ROW,
    );
    expect(share).toEqual({ gyms: 2, wayspots: 1, gymsTo: 3, wayspotsTo: 1 });
    expect(questionsOf({ gyms: [gym(2, 7), gym(1, 7), gym(2, 8)], wayspots: [] }).gyms).toBe(2);
  });
});

describe('/gym google', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The line with gyms and Wayspots of this server, of another and of none. */
  async function lineWith(options: { places?: number; geocodes?: number } = {}) {
    const made = await gymCommandsWith();
    const north = await withOtherServer(made);
    // Gyms 1 and 2 lie in West (this server), Lakeview (10) in no region of it; the other
    // server's gym waits for that server (plan 19B-3: a row per server).
    await made.lookups.add(
      [
        { guildId: TEST_GUILD_ROW, gymId: 1, address: false, rank: 1 },
        { guildId: OTHER_GUILD_ROW, gymId: north.id, address: false, rank: 1 },
        { guildId: TEST_GUILD_ROW, gymId: 2, address: true, rank: 0.5 },
        { guildId: TEST_GUILD_ROW, gymId: 10, address: true, rank: -1 },
      ],
      1,
    );
    const stop = keptRow(1, { lat: 40.05, lon: -80.06 });
    const spot = keptRow(2, { lat: 40.06, lon: -80.06, kind: 'powerspot' });
    const away = keptRow(3);
    await made.wayspotStore.saveFromImport(
      TEST_GUILD_ROW,
      { upsert: [stop, spot, away], remove: [] },
      1,
    );
    await made.wayspots.load();
    // The other server's copy of a stop waits for that server.
    await made.wayspotLookups.add(
      [
        { guildId: TEST_GUILD_ROW, wayspotId: stop.id, kind: 'stop', rank: 1 },
        { guildId: OTHER_GUILD_ROW, wayspotId: away.id, kind: 'stop', rank: 1 },
        { guildId: TEST_GUILD_ROW, wayspotId: spot.id, kind: 'powerspot', rank: 1 },
      ],
      1,
    );
    for (let n = 0; n < (options.places ?? 3); n++)
      await made.googleUse.use('2026-10-11', 'places');
    for (let n = 0; n < (options.geocodes ?? 1); n++)
      await made.googleUse.use('2026-10-11', 'geocode');
    await made.googleUse.use('2026-10-11', 'hand');
    return made;
  }

  it("says what of this server waits, the month's budget, when it resets, and when it will be done", async () => {
    const made = await lineWith();
    const used = await made.use('google');
    const answer = answerOf(used);
    expect(said(answer)).toBe(
      [
        '### The line for Google',
        '3 gyms and 2 PokéStops or Power Spots of this server wait for Google.',
        'This month 3 of 4,500 places searches are used; the line stops when 500 are left, for ' +
          'gyms added or moved by hand and `/gym refresh`. 1 of 9,000 addresses is used; ' +
          'Power Spots’ addresses on the map stop when 500 are left, for gyms. The ' +
          `month starts again ${stamp(new Date('2026-11-01T00:00:00-07:00').getTime(), 'f')}, ` +
          'when Google’s free amounts reset.',
        // Plan 19B-5: the month shared by what each server has waiting, the other server too;
        // what neither wants is shared by need too (fix round 3, T2): five to two.
        'This server’s share of this month is 2,857 places searches and 9,000 addresses, by ' +
          'what each server has waiting; the line used 0 and 0 of it.',
        '1 of 500 lookups by hand is used this month, 0 of them by this server, which may ' +
          'always make 20.',
        '0 of 500 maps of `/find-region` are used this month, 0 of them by this server’s ' +
          'members, who may always have 20.',
        'At this pace everything of this server is asked about today, the gyms first.',
        '-# The line and the budget are this instance’s, for its one Google key; the counts ' +
          'are this server’s part of it.',
      ].join('\n'),
    );
    // Private: the reply is deferred as ephemeral, and the answer is a components-v2 message.
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
  });

  it('says when this month is used up and the rest waits for the next months', async () => {
    const made = await lineWith({ places: 4_000 });
    const text = said(answerOf(await made.use('google')));
    expect(text).toContain('This month 4,000 of 4,500 places searches are used;');
    // The day at noon in California (standard time again on November 1): a reader west of it
    // sees the same date.
    expect(text).toContain(
      'At this pace everything of this server is asked about on ' +
        `${stamp(new Date('2026-11-01T12:00:00-08:00').getTime(), 'D')}, the gyms first.`,
    );
  });

  // Plan 8Z-2: the maps of `/find-region` have a count and a monthly cap of their own.
  it('says how many of the month’s maps of /find-region are used', async () => {
    const made = await lineWith();
    await made.googleUse.use('2026-10-10', 'map');
    await made.googleUse.use('2026-10-11', 'map');
    // A map counts for neither the budget nor the lookups by hand.
    const text = said(answerOf(await made.use('google')));
    expect(text).toContain('This month 3 of 4,500 places searches are used;');
    expect(text).toContain(
      '1 of 500 lookups by hand is used this month, 0 of them by this server, which may ' +
        'always make 20.\n' +
        '2 of 500 maps of `/find-region` are used this month, 0 of them by this server’s ' +
        'members, who may always have 20.',
    );
    await made.googleUse.use('2026-09-30', 'map');
    expect(said(answerOf(await made.use('google')))).toContain('2 of 500 maps');
  });

  it('says what this server used of its share, its lookups by hand and maps, and an operator’s raise (plan 19B-5)', async () => {
    const made = await lineWith();
    await made.googleUse.use('2026-10-11', 'places', TEST_GUILD_ROW);
    await made.googleUse.use('2026-10-11', 'hand', TEST_GUILD_ROW);
    await made.googleUse.use('2026-10-11', 'map', TEST_GUILD_ROW);
    await made.googleUse.use('2026-10-11', 'map', OTHER_GUILD_ROW);
    await made.upkeep.raiseShare(TEST_GUILD_ROW, 250);
    const text = said(answerOf(await made.use('google')));
    expect(text).toContain(
      'This server’s share of this month is 3,107 places searches and 9,250 addresses, by ' +
        'what each server has waiting, 250 of each added by an operator; the line used 1 and ' +
        '0 of it.',
    );
    expect(text).toContain(
      '2 of 500 lookups by hand are used this month, 1 of them by this server, which may ' +
        'always make 20.',
    );
    expect(text).toContain(
      '2 of 500 maps of `/find-region` are used this month, 1 of them by this server’s ' +
        'members, who may always have 20.',
    );
  });

  it('says a server that used its share waits for the month to start again (fix round 3, T9)', async () => {
    const made = await lineWith();
    // The other server's gyms want more than half the month: this server has its half.
    await made.lookups.add(
      Array.from({ length: 3_000 }, (_, n) => ({
        guildId: OTHER_GUILD_ROW,
        gymId: 1_000 + n,
        address: false,
        rank: 0,
      })),
      2,
    );
    for (let n = 0; n < 2_000; n++)
      await made.googleUse.use('2026-10-11', 'places', TEST_GUILD_ROW);
    const text = said(answerOf(await made.use('google')));
    expect(text).toContain('the line used 2,000 and 0 of it.');
    // Its gyms on the 1st, its PokéStops at the day's pace after the line's gyms.
    expect(text).toContain(
      'At this pace the gyms of this server are all asked about on ' +
        `${stamp(new Date('2026-11-01T12:00:00-08:00').getTime(), 'D')}, and everything of ` +
        `this server on ${stamp(new Date('2026-11-02T12:00:00-08:00').getTime(), 'D')}.`,
    );
  });

  it('counts this server’s rows at their own rank for the month after its share (fix round 4, R6)', async () => {
    const made = await lineWith();
    // The other server's 5,000 gyms want more than half the month: this server has its half,
    // and used it, so its rows are held at the end of the line until the 1st.
    await made.lookups.add(
      Array.from({ length: 5_000 }, (_, n) => ({
        guildId: OTHER_GUILD_ROW,
        gymId: 1_000 + n,
        address: false,
        rank: 0,
      })),
      2,
    );
    for (let n = 0; n < 2_000; n++)
      await made.googleUse.use('2026-10-11', 'places', TEST_GUILD_ROW);
    const text = said(answerOf(await made.use('google')));
    // On the 1st its gyms are ranked as their regions rank them again, before the other
    // server's that came after them: done that day, not after the other server's 5,000.
    expect(text).toContain(
      'At this pace the gyms of this server are all asked about on ' +
        `${stamp(new Date('2026-11-01T12:00:00-08:00').getTime(), 'D')}, and everything`,
    );
  });

  it('says what a server with nothing waiting used of the month (fix round 4, R6)', async () => {
    const made = await gymCommandsWith();
    for (let n = 0; n < 3; n++) await made.googleUse.use('2026-10-11', 'places', TEST_GUILD_ROW);
    await made.googleUse.use('2026-10-11', 'geocode', TEST_GUILD_ROW);
    const text = said(answerOf(await made.use('google')));
    expect(text).toContain(
      'This server used 3 places searches and 1 address of this month; nothing of it waits ' +
        'now, and it gets a share as soon as something does.',
    );
  });

  it('names both days when the gyms are done before the rest', async () => {
    // Today's share of PokéStops and Power Spots is used: they wait for tomorrow.
    const made = await lineWith({ places: 300 });
    const text = said(answerOf(await made.use('google')));
    expect(text).toContain(
      'At this pace the gyms of this server are all asked about today, and everything of ' +
        `this server on ${stamp(new Date('2026-10-12T12:00:00-07:00').getTime(), 'D')}.`,
    );
  });

  it('says so when nothing of this server waits, or there is no Google key', async () => {
    const made = await gymCommandsWith();
    expect(said(answerOf(await made.use('google')))).toContain(
      'Nothing of this server waits for Google.',
    );
    made.geo.enabled = false;
    expect(said(answerOf(await made.use('google')))).toBe(
      '### The line for Google\nNo Google API key is configured, so nothing is asked of Google.',
    );
  });
});
