import { TEST_GUILD_ROW } from '../../../test/support/gyms.js';
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withOtherServer } from '../../../test/support/gym-admin.js';
import { answerOf, gymCommandsWith, said } from '../../../test/support/gym-commands.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';

/** Noon in California on October 11: 21 days of the month are left. */
const NOW = new Date('2026-10-11T12:00:00-07:00').getTime();
const stamp = (ms: number, style: string) => `<t:${Math.floor(ms / 1000)}:${style}>`;

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
    // Gyms 1 and 2 lie in West (this server), Lakeview (10) in no region.
    await made.lookups.add(
      [
        { gymId: 1, address: false, rank: 1 },
        { gymId: north.id, address: false, rank: 1 },
        { gymId: 2, address: true, rank: 0.5 },
        { gymId: 10, address: true, rank: -1 },
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
    await made.wayspotLookups.add(
      [
        { wayspotId: stop.id, kind: 'stop', rank: 1 },
        { wayspotId: away.id, kind: 'stop', rank: 1 },
        { wayspotId: spot.id, kind: 'powerspot', rank: 1 },
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
        '2 gyms and 2 PokéStops or Power Spots of this server wait for Google.',
        'This month 3 of 4,500 places searches are used; the line stops when 500 are left, for ' +
          'gyms added or moved by hand and `/gym refresh`. 1 of 9,000 addresses is used; ' +
          'Power Spots’ addresses on the map stop when 500 are left, for gyms. The ' +
          `month starts again ${stamp(new Date('2026-11-01T00:00:00-07:00').getTime(), 'f')}, ` +
          'when Google’s free amounts reset.',
        '1 of 500 lookups by hand is used this month.',
        '0 of 500 maps of `/find-region` are used this month.',
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
      '1 of 500 lookups by hand is used this month.\n' +
        '2 of 500 maps of `/find-region` are used this month.',
    );
    await made.googleUse.use('2026-09-30', 'map');
    expect(said(answerOf(await made.use('google')))).toContain('2 of 500 maps');
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
