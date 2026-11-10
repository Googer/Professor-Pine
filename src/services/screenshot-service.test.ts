import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../test/support/max-reporting.js';
import { at, TEST_SPOT } from '../../test/support/parties.js';
import { readOne, screenshotsWith } from '../../test/support/screenshot-service.js';
import { statSync } from 'node:fs';
import path from 'node:path';
import { eggReading, maxReading, readingOf, splitOutcome } from '../../test/support/screenshots.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { catalogueFixture } from '../../test/support/game-data.js';
import { raidBossCp } from '../domain/pogo/cp.js';
import { bossStamina } from '../domain/pogo/raid-tier.js';
import { MAX_SCREENSHOT_BYTES } from './ocr-service.js';
import {
  isImageAttachment,
  screenshotsOf,
  unreadWords,
  type ScreenshotWhere,
} from './screenshot-service.js';
import { zonedAt } from '../../test/support/time.js';

const ZONE = 'America/New_York';
const UPLOADED = zonedAt('2026-10-14T13:40:00', ZONE);
const MEMBER = '700000000000000001';

function where(more: Partial<ScreenshotWhere> = {}): ScreenshotWhere {
  return {
    guildId: FAKE_GUILD_ID,
    guildRow: 1,
    channelId: WEST_CHANNEL,
    uploadedAt: UPLOADED,
    use: 'raid',
    senderId: MEMBER,
    ...more,
  };
}

describe('ScreenshotService', () => {
  it('reads a screenshot, reports on it in the region, decides and keeps it', async () => {
    const { screenshots, screenshot, files } = screenshotsWith();
    const source = screenshot(
      'egg.png',
      eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600),
    );
    const outcome = await readOne(screenshots, source, where());
    expect(outcome).toMatchObject({
      kind: 'read',
      report: { gym: { gymId: 2, clear: true }, stage: 'egg', tier: { level: 'T5' } },
      decision: {
        kind: 'report',
        raid: { gymId: 2, hatched: false, timeUncertain: false },
      },
    });
    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
    expect(files('held')).toEqual([`${outcome.id}.json`, `${outcome.id}.png`]);
    expect(files('review')).toEqual([]);
    expect(await screenshots.get(outcome.id)).toMatchObject({ record: { use: 'raid' } });
  });

  it('takes the time from an Android file name', async () => {
    const { screenshots, screenshot } = screenshotsWith();
    const source = screenshot(
      'Screenshot_20261014-133700.png',
      eggReading('Old Stone Fountain', 5, null, 600),
    );
    const outcome = await readOne(screenshots, source, where());
    expect(outcome).toMatchObject({
      report: { takenAt: zonedAt('2026-10-14T13:37:00', ZONE) },
      decision: { raid: { timeUncertain: false } },
    });
  });

  it('puts in what the member typed, and keeps for review what it asks or refuses', async () => {
    const { screenshots, screenshot, files } = screenshotsWith();
    // Two gyms called Starbucks, outside a region channel (all of the server's gyms).
    const unclear = screenshot('a.png', eggReading('Starbucks', 1, { hour: 13, minute: 39 }));
    const asked = await readOne(screenshots, unclear, where({ channelId: null }));
    expect(asked).toMatchObject({ decision: { kind: 'ask' } });
    if (asked.kind !== 'read' || !asked.id) throw new Error('not kept');
    expect(files('review')).toContain(`${asked.id}.json`);
    const typed = await readOne(
      screenshots,
      unclear,
      where({ channelId: null, typed: { gymId: 5 } }),
    );
    expect(typed).toMatchObject({ decision: { kind: 'report', raid: { gymId: 5 } } });
  });

  it('keeps the reader’s own report apart from what the member typed, with where its time came from', async () => {
    const { screenshots, screenshot } = screenshotsWith();
    const unclear = screenshot(
      'Screenshot_20261014-133800.png',
      eggReading('Starbucks', 1, { hour: 13, minute: 39 }),
    );
    const outcome = await readOne(
      screenshots,
      unclear,
      where({ channelId: null, typed: { gymId: 5 } }),
    );
    if (outcome.kind !== 'read' || outcome.screen !== 'raid' || !outcome.id) {
      throw new Error('not kept');
    }
    expect(outcome.report.gym).toMatchObject({ gymId: 5, clear: true });
    const kept = await screenshots.get(outcome.id);
    expect(kept).toMatchObject({
      record: {
        report: { gym: { clear: false }, doubts: ['gym-unclear'] },
        typed: { gymId: 5 },
        decision: { kind: 'report' },
        uploadedAt: UPLOADED,
        fileTakenAt: zonedAt('2026-10-14T13:38:00', ZONE),
        timeFrom: 'file',
      },
    });
    if (!kept || kept === 'gone') throw new Error('not kept');
    expect(kept.record.bosses.length).toBeGreaterThan(0);
  });

  it('keeps of the status bar only a clock and short lines, never a notification', async () => {
    const { screenshots, screenshot } = screenshotsWith();
    const reading = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600);
    reading.status = [
      { text: '13:39 5G', confidence: 0.9, box: { x0: 0, y0: 0, x1: 50, y1: 20 } },
      {
        text: 'Alice: are you coming to the raid?',
        confidence: 0.9,
        box: { x0: 60, y0: 0, x1: 500, y1: 20 },
      },
      {
        text: 'Bob: meet at 12:30 by the park',
        confidence: 0.9,
        box: { x0: 60, y0: 0, x1: 500, y1: 20 },
      },
      { text: '76%', confidence: 0.9, box: { x0: 900, y0: 0, x1: 1000, y1: 20 } },
    ];
    const outcome = await readOne(screenshots, screenshot('egg.png', reading), where());
    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
    const kept = await screenshots.get(outcome.id);
    if (!kept || kept === 'gone') throw new Error('not kept');
    expect(kept.record.reading.status.map((line) => line.text)).toEqual(['13:39 5G', '76%']);
  });

  it('keeps of a picture that is no raid screen its record alone, without the text read', async () => {
    const { screenshots, screenshot, files } = screenshotsWith();
    const reading = readingOf({ gym: 'A private note' });
    reading.status = [{ text: '13:39', confidence: 0.9, box: { x0: 0, y0: 0, x1: 50, y1: 20 } }];
    const outcome = await readOne(screenshots, screenshot('cat.png', reading), where());
    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
    expect(files('held')).toEqual([`${outcome.id}.json`]);
    const kept = await screenshots.get(outcome.id);
    if (!kept || kept === 'gone') throw new Error('not kept');
    expect(kept.record.reading.lines).toEqual([
      { text: '', confidence: 0.95, box: { x0: 100, y0: 150, x1: 900, y1: 220 } },
    ]);
    expect(kept.record.reading.status.map((line) => line.text)).toEqual(['']);
    expect(JSON.stringify(kept.record)).not.toContain('A private note');
  });

  it('gives a screenshot up as busy when its turn comes too late', async () => {
    const { screenshots, screenshot, reader } = screenshotsWith();
    reader.lateAfter = 1_000;
    const source = screenshot('q.png', eggReading('Old Stone Fountain', 1, null));
    expect(await readOne(screenshots, source, where({ startBy: 999 }))).toEqual({ kind: 'busy' });
    expect(await readOne(screenshots, source, where({ startBy: 1_001 }))).toMatchObject({
      kind: 'read',
    });
  });

  it('keeps nothing of a passive read it refused: that is a member’s ordinary picture', async () => {
    const { screenshots, screenshot, files } = screenshotsWith();
    const cat = screenshot('cat.jpg', readingOf({ gym: 'Old Stone Fountain' }));
    const outcome = await readOne(screenshots, cat, where({ use: 'passive' }));
    expect(outcome).toMatchObject({
      kind: 'read',
      id: undefined,
      decision: { kind: 'refuse', reason: 'not-a-raid-screen' },
    });
    expect(files('held')).toEqual([]);
  });

  it('answers what kept it from reading: too large, the download, the reader', async () => {
    const { screenshots, screenshot, attachments } = screenshotsWith();
    const large = { ...screenshot('big.png', { kind: 'busy' }), size: MAX_SCREENSHOT_BYTES + 1 };
    expect(await readOne(screenshots, large, where())).toEqual({ kind: 'too-large' });
    expect(attachments.asked).toEqual([]);
    expect(await readOne(screenshots, screenshot('busy.png', { kind: 'busy' }), where())).toEqual({
      kind: 'busy',
    });
    attachments.failing = true;
    expect(await readOne(screenshots, screenshot('x.png', { kind: 'busy' }), where())).toEqual({
      kind: 'download-failed',
    });
    expect(unreadWords({ kind: 'busy' })).toMatch(/Too many screenshots are waiting/);
  });

  it('answers busy without downloading when the reader’s queue is full', async () => {
    const { screenshots, screenshot, reader, attachments } = screenshotsWith();
    reader.isFull = true;
    const source = screenshot('q.png', eggReading('Old Stone Fountain', 1, null));
    expect(await readOne(screenshots, source, where())).toEqual({ kind: 'busy' });
    expect(attachments.asked).toEqual([]);
  });

  it('downloads a screenshot ahead and reads it later without downloading again (plan 8R-9F, B2)', async () => {
    const { screenshots, screenshot, attachments, reader } = screenshotsWith();
    const source = screenshot('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
    const fetched = await screenshots.fetch(source);
    if (fetched.kind !== 'fetched') throw new Error(fetched.kind);
    expect(attachments.asked).toHaveLength(1);
    expect(reader.reads).toBe(0);
    attachments.failing = true;
    expect(await readOne(screenshots, fetched.screenshot, where())).toMatchObject({
      kind: 'read',
      report: { gym: { gymId: 2 } },
    });
    expect(attachments.asked).toHaveLength(1);
    // What keeps it from being had: too large, the download.
    expect(await screenshots.fetch(screenshot('x.png', { kind: 'busy' }))).toEqual({
      kind: 'download-failed',
    });
    expect(await screenshots.fetch({ ...source, size: MAX_SCREENSHOT_BYTES + 1 })).toEqual({
      kind: 'too-large',
    });
  });

  it('tells who waits how many are ahead', async () => {
    const { screenshots, screenshot, reader } = screenshotsWith();
    reader.ahead = 2;
    const ahead: number[] = [];
    await readOne(
      screenshots,
      screenshot('q.png', eggReading('Old Stone Fountain', 1, null)),
      where({ onQueued: (n) => ahead.push(n) }),
    );
    expect(ahead).toEqual([2]);
  });

  describe('a screenshot read a while after its upload (plan 7M: a message’s Apps menu)', () => {
    const LATER = UPLOADED + 30 * 60_000;
    /** No clock on it: its moment is guessed from the upload. Ten minutes to go. */
    const egg = () => eggReading('Old Stone Fountain', 5, null, 600);

    it('dates it by its upload and decides at the time it is read: an egg hatched since', async () => {
      const { screenshots, screenshot } = screenshotsWith();
      const atOnce = await readOne(screenshots, screenshot('a.png', egg()), where());
      if (atOnce.kind !== 'read' || atOnce.screen !== 'raid') throw new Error('not read');
      expect(atOnce.decision).toMatchObject({ kind: 'report', raid: { hatched: false } });
      const hatch = atOnce.report.takenAt + 600_000;
      expect(atOnce.report.time).toEqual({ hatch });
      const later = await readOne(
        screenshots,
        screenshot('b.png', egg()),
        where({ readAt: LATER }),
      );
      if (later.kind !== 'read' || later.screen !== 'raid') throw new Error('not read');
      // The same moment and hatch, by the upload: twenty minutes before it was read.
      expect(later.report.time).toEqual({ hatch });
      expect(later.report.doubts).toContain('time-past');
      // Reported hatched, to the end its hatch gives (a T5 lasts 45 minutes in the test settings).
      expect(later.decision).toMatchObject({
        kind: 'report',
        raid: { hatched: true, time: { end: hatch + 45 * 60_000 } },
      });
      // The record keeps when it was uploaded: the message's time.
      if (!later.id) throw new Error('not kept');
      expect(await screenshots.get(later.id)).toMatchObject({ record: { uploadedAt: UPLOADED } });
    });

    it('refuses a raid that is over by the time it is read, with a gym chosen then too', async () => {
      const { screenshots, screenshot } = screenshotsWith();
      const over = await readOne(
        screenshots,
        screenshot('a.png', egg()),
        where({ readAt: UPLOADED + 2 * 3600_000 }),
      );
      if (over.kind !== 'read' || over.screen !== 'raid') throw new Error('not read');
      expect(over.decision).toEqual({ kind: 'refuse', reason: 'raid-over' });
      // The decision made again with a gym is made at that time as well.
      expect(over.withGym(6)).toEqual({ kind: 'refuse', reason: 'raid-over' });
    });
  });
});

describe('ScreenshotService: a max battle’s screen (plan 8X-S)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const maxWhere = (more: Partial<ScreenshotWhere> = {}) =>
    where({ uploadedAt: MAX_THURSDAY, use: 'mention', ...more });
  /** A second Power Spot whose name begins as the test spot's. */
  const POND = keptRow(2, {
    id: 'c0ffee00c0ffee00c0ffee00c0ffee01.16',
    kind: 'powerspot',
    title: 'Gazebo of the Pond',
    lat: TEST_SPOT.lat + 0.0001,
    lon: TEST_SPOT.lon,
  });

  it('reads a max screen the max way, and keeps it with its max report and the max bosses', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
    const outcome = await readOne(screenshots, screenshot('max.png', maxReading()), maxWhere());
    expect(outcome).toMatchObject({
      kind: 'read',
      screen: 'max',
      report: {
        form: 'dynamax',
        boss: { ref: { key: 'machop' }, listed: true },
        tier: 'D2',
        spot: { readSurely: true, match: { kind: 'clear', spot: { id: TEST_SPOT.id } } },
      },
      decision: {
        kind: 'report',
        battle: {
          spotId: TEST_SPOT.id,
          boss: { key: 'machop' },
          tier: 'D2',
          end: at('2026-10-22T14:28'),
          sureMoment: true,
          capped: false,
        },
      },
    });
    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
    // Its picture and text kept; no doubt of its own, so no review copy.
    expect(files('held')).toEqual([`${outcome.id}.json`, `${outcome.id}.png`]);
    expect(files('review')).toEqual([]);
    const kept = await screenshots.get(outcome.id);
    if (!kept || kept === 'gone') throw new Error('not kept');
    expect(kept.record).toMatchObject({
      use: 'mention',
      decision: { kind: 'report' },
      max: { spot: { read: 'GAZEBO OF THE PARK' }, doubts: [] },
      report: { doubts: expect.arrayContaining(['not-a-raid-screen']) as unknown },
    });
    expect(kept.record.maxBosses).toContainEqual({ key: 'machop', name: 'Machop', tier: 'D2' });
  });

  describe('what a screenshot says against the boss lists (plan 8X-J)', () => {
    const watching = () => {
      const seen: unknown[] = [];
      return { seen, watch: { observe: (...args: unknown[]) => void seen.push(args) } };
    };

    it('tells the watch of a listed Dynamax boss whose heads say another tier, read passively too', async () => {
      const made = await maxReportingWith();
      const { seen, watch } = watching();
      const { screenshots, screenshot } = screenshotsWith(made.ctx, undefined, watch);
      await readOne(
        screenshots,
        screenshot('max.png', maxReading(undefined, {}, {}, 3)),
        maxWhere(),
      );
      // Refused (a Power Spot it does not know), read passively: it still counts.
      await readOne(
        screenshots,
        screenshot('max2.png', maxReading('NOWHERE AT ALL', {}, {}, 3)),
        maxWhere({ use: 'passive' }),
      );
      expect(seen).toEqual([
        [
          {
            serverId: FAKE_GUILD_ID,
            channelId: WEST_CHANNEL,
            memberId: MEMBER,
            place: TEST_SPOT.id,
            at: MAX_THURSDAY,
          },
          { family: 'max', bossKey: 'machop', listTier: 'D2', headsTier: 'D3' },
        ],
        [
          {
            serverId: FAKE_GUILD_ID,
            channelId: WEST_CHANNEL,
            memberId: MEMBER,
            place: 'NOWHERE AT ALL',
            at: MAX_THURSDAY,
          },
          { family: 'max', bossKey: 'machop', listTier: 'D2', headsTier: 'D3' },
        ],
      ]);
      // Heads that agree with the list say nothing.
      await readOne(screenshots, screenshot('max3.png', maxReading()), maxWhere());
      expect(seen).toHaveLength(2);
    });

    // Review J10: a screenshot posted again days later is not a sighting of today.
    it('tells the watch nothing of a screenshot whose known moment is older than a day', async () => {
      const made = await maxReportingWith();
      const { seen, watch } = watching();
      const { screenshots, screenshot } = screenshotsWith(made.ctx, undefined, watch);
      await readOne(
        screenshots,
        screenshot('Screenshot_20261020-135800.png', maxReading(undefined, {}, {}, 3)),
        maxWhere(),
      );
      expect(seen).toEqual([]);
    });

    it('tells the watch of a raid whose CP and name at the heads’ tier fit a boss listed at another', async () => {
      const { seen, watch } = watching();
      const { screenshots, screenshot } = screenshotsWith(undefined, undefined, watch);
      const starmie = catalogueFixture().byKey('starmie');
      if (!starmie) throw new Error('starmie');
      const T1 = { level: 'T1', shadow: false } as const;
      const reading = readingOf(
        {
          gym: 'Old Stone Fountain',
          clock: { hour: 13, minute: 38 },
          countdown: 30 * 60,
          countdownPlace: 'right',
          cp: raidBossCp(starmie.stats, bossStamina(T1)),
          bossName: 'Starmie',
        },
        { heads: 1 },
      );
      await readOne(screenshots, screenshot('raid.png', reading), where());
      expect(seen).toEqual([
        [
          {
            serverId: FAKE_GUILD_ID,
            channelId: WEST_CHANNEL,
            memberId: MEMBER,
            place: 'g2',
            at: UPLOADED,
          },
          {
            family: 'raid',
            bossKey: 'starmie',
            listTier: { level: 'T3', shadow: false },
            headsTier: T1,
          },
        ],
      ]);
    });
  });

  it('asks which Power Spot a name cut short may be, and decides again with the one chosen', async () => {
    const made = await maxReportingWith(undefined, [POND]);
    const { screenshots, screenshot } = screenshotsWith(made.ctx);
    const outcome = await readOne(
      screenshots,
      screenshot('max.png', maxReading('GAZEBO OF THE P')),
      maxWhere(),
    );
    if (outcome.kind !== 'read' || outcome.screen !== 'max') throw new Error('not a max read');
    expect(outcome.decision).toMatchObject({ kind: 'ask', about: 'spot' });
    expect(outcome.withSpot(POND.id)).toMatchObject({
      kind: 'report',
      battle: { spotId: POND.id },
    });
    // A spot it does not know of the server: as nothing chosen.
    expect(outcome.withSpot('not-a-spot')).toMatchObject({ kind: 'ask', about: 'spot' });
  });

  it('knows the Power Spots of the whole server, those of another region not as local', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot } = screenshotsWith(made.ctx);
    const outcome = await readOne(
      screenshots,
      screenshot('max.png', maxReading()),
      maxWhere({ channelId: EAST_CHANNEL }),
    );
    expect(outcome).toMatchObject({
      screen: 'max',
      report: { spot: { match: { kind: 'clear', spot: { id: TEST_SPOT.id, local: false } } } },
    });
  });

  it('finds the boss only among the Pokémon that can Dynamax or Gigantamax', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot } = screenshotsWith(made.ctx);
    const outcome = await readOne(
      screenshots,
      screenshot('max.png', maxReading(undefined, { species: 'MEWTWO' })),
      maxWhere(),
    );
    expect(outcome).toMatchObject({
      screen: 'max',
      report: { boss: null },
      decision: { kind: 'refuse', reason: 'no-boss' },
    });
  });

  it('keeps nothing of a passive read of a max screen it refused', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
    const outcome = await readOne(
      screenshots,
      screenshot('max.png', maxReading('NOWHERE IN PARTICULAR')),
      maxWhere({ use: 'passive' }),
    );
    expect(outcome).toMatchObject({
      screen: 'max',
      id: undefined,
      decision: { kind: 'refuse', reason: 'no-spot' },
    });
    expect(files('held')).toEqual([]);
  });

  it('decides a max screen at the time it is read, when that is after its upload (plan 7M)', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot } = screenshotsWith(made.ctx);
    // The clock at 13:58 and half an hour to go: the battle ends at 14:28.
    const atOnce = await readOne(screenshots, screenshot('a.png', maxReading()), maxWhere());
    expect(atOnce).toMatchObject({ decision: { kind: 'report' } });
    const later = await readOne(
      screenshots,
      screenshot('b.png', maxReading()),
      maxWhere({ readAt: at('2026-10-22T14:30') }),
    );
    if (later.kind !== 'read' || later.screen !== 'max') throw new Error('not read');
    expect(later.decision).toEqual({ kind: 'refuse', reason: 'battle-over' });
    // A Power Spot chosen then is decided at that time too.
    expect(later.withSpot(TEST_SPOT.id)).toEqual({ kind: 'refuse', reason: 'battle-over' });
  });
});

describe('ScreenshotService, split screens (plan 7P)', () => {
  const splitWhere = (more: Partial<ScreenshotWhere> = {}) =>
    where({ uploadedAt: MAX_THURSDAY, use: 'mention', ...more });
  const egg = () => eggReading('Old Stone Fountain', 5, { hour: 13, minute: 58 }, 600);

  it('reads, decides and keeps each pane as a screenshot of its own, its file a link of one', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot, files, dir } = screenshotsWith(made.ctx);
    const outcome = await screenshots.readPanes(
      screenshot('split.png', splitOutcome([maxReading(), egg()])),
      splitWhere(),
    );
    if (outcome.kind !== 'panes') throw new Error(outcome.kind);
    expect(outcome.held).toBe(0);
    const [max, raid] = outcome.panes;
    expect(max).toMatchObject({ screen: 'max', pane: { index: 1, of: 2 } });
    expect(raid).toMatchObject({ screen: 'raid', pane: { index: 2, of: 2 } });
    if (!max?.id || !raid?.id) throw new Error('not kept');
    expect(files('held')).toEqual(
      [`${max.id}.json`, `${max.id}.png`, `${raid.id}.json`, `${raid.id}.png`].sort(),
    );
    // One file's bytes for both panes: the second is a hard link of the first.
    const first = statSync(path.join(dir, 'held', `${max.id}.png`));
    expect(first.nlink).toBe(2);
    expect(statSync(path.join(dir, 'held', `${raid.id}.png`)).ino).toBe(first.ino);
    const kept = await screenshots.get(raid.id);
    if (!kept || kept === 'gone') throw new Error('not kept');
    expect(kept.record.pane).toMatchObject({ index: 2, of: 2 });
  });

  it('answers one screen for a split’s one pane, and two-screens for two to a caller of one', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot } = screenshotsWith(made.ctx);
    const withMap = screenshot('map.png', splitOutcome(['none', maxReading()]));
    expect(await readOne(screenshots, withMap, splitWhere())).toMatchObject({
      kind: 'read',
      screen: 'max',
      pane: { index: 2, of: 2 },
    });
    const two = screenshot('two.png', splitOutcome([maxReading(), egg()]));
    expect(await readOne(screenshots, two, splitWhere())).toEqual({ kind: 'two-screens' });
  });

  it('refuses two screens it could not tell apart, kept for review but read passively', async () => {
    const { screenshots, screenshot, files } = screenshotsWith();
    const mixed = screenshot('mixed.png', { kind: 'read', reading: egg(), twoScreens: true });
    expect(await screenshots.readPanes(mixed, splitWhere())).toEqual({ kind: 'two-screens' });
    const [record] = files('review').filter((name) => name.endsWith('.json'));
    const kept = await screenshots.get(record?.slice(0, -5) ?? '');
    expect(kept).toMatchObject({ record: { decision: { kind: 'refuse', reason: 'two-screens' } } });
    const before = files('held').length;
    expect(await screenshots.readPanes(mixed, splitWhere({ use: 'passive' }))).toEqual({
      kind: 'two-screens',
    });
    expect(files('held')).toHaveLength(before);
    expect(unreadWords({ kind: 'two-screens' })).toBe(
      'This looks like two screens in one picture, and I could not tell them apart. Send each screen on its own.',
    );
  });

  it('keeps what was typed beside two screens it could not tell apart', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
    const mixed = screenshot('mixed.png', { kind: 'read', reading: egg(), twoScreens: true });
    await screenshots.readPanes(mixed, splitWhere({ use: 'raid', typed: { gymId: 5 } }));
    const maxMixed = screenshot('max-mixed.png', {
      kind: 'read',
      reading: maxReading(),
      twoScreens: true,
    });
    await screenshots.readPanes(
      maxMixed,
      splitWhere({ use: 'max', maxTyped: () => ({ typed: { end: MAX_THURSDAY + 3_600_000 } }) }),
    );
    const records = await Promise.all(
      files('held')
        .filter((name) => name.endsWith('.json'))
        .map((name) => screenshots.get(name.slice(0, -5))),
    );
    const kept = records.flatMap((one) => (one && one !== 'gone' ? [one.record] : []));
    expect(kept.find((record) => record.use === 'raid')?.typed).toEqual({ gymId: 5 });
    expect(kept.find((record) => record.use === 'max')?.maxTyped).toMatchObject({
      end: MAX_THURSDAY + 3_600_000,
    });
  });

  // Review S5: the file's time is kept as for any other screenshot.
  it('keeps the file’s time of two screens it could not tell apart', async () => {
    const { screenshots, screenshot, files } = screenshotsWith();
    const mixed = screenshot('Screenshot_20261022-135800.png', {
      kind: 'read',
      reading: egg(),
      twoScreens: true,
    });
    expect(await screenshots.readPanes(mixed, splitWhere())).toEqual({ kind: 'two-screens' });
    const [record] = files('review').filter((name) => name.endsWith('.json'));
    const kept = await screenshots.get(record?.slice(0, -5) ?? '');
    expect(kept).toMatchObject({
      record: {
        fileTakenAt: zonedAt('2026-10-22T13:58:00', ZONE),
        decision: { kind: 'refuse', reason: 'two-screens' },
      },
    });
  });

  it('keeps two panes of its caller’s one kind as refused, never as reported', async () => {
    const { screenshots, screenshot } = screenshotsWith();
    const outcome = await screenshots.readPanes(
      screenshot('two.png', splitOutcome([egg(), eggReading('Maple Leaf Mosaic', 3, null, 900)])),
      splitWhere({ use: 'raid', screen: 'raid' }),
    );
    if (outcome.kind !== 'panes') throw new Error(outcome.kind);
    for (const pane of outcome.panes) {
      const kept = await screenshots.get(pane.id ?? '');
      expect(kept).toMatchObject({ record: { decision: { kind: 'refuse', reason: 'several' } } });
    }
  });

  it('keeps no pane of the kind its caller does not report', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot } = screenshotsWith(made.ctx);
    const outcome = await screenshots.readPanes(
      screenshot('split.png', splitOutcome([maxReading(), egg()])),
      splitWhere({ use: 'raid', screen: 'raid' }),
    );
    if (outcome.kind !== 'panes') throw new Error(outcome.kind);
    expect(outcome.panes.map((pane) => [pane.screen, pane.id === undefined])).toEqual([
      ['max', true],
      ['raid', false],
    ]);
  });

  it('reads a second pane only when it may, and counts the one it may not', async () => {
    const made = await maxReportingWith();
    const { screenshots, screenshot, files } = screenshotsWith(made.ctx);
    const outcome = await screenshots.readPanes(
      screenshot('split.png', splitOutcome([maxReading(), egg()])),
      splitWhere({ anotherPane: () => false }),
    );
    expect(outcome).toMatchObject({ kind: 'panes', held: 1, panes: [{ screen: 'max' }] });
    expect(files('held')).toHaveLength(2);
  });
});

describe('screenshotsOf', () => {
  it('takes pictures by their content type or, without one, their name; ten at most', () => {
    const file = (name: string, contentType: string | null) => ({
      url: `https://cdn.discordapp.com/${name}`,
      name,
      contentType,
      size: 1,
    });
    expect(isImageAttachment(file('a.txt', 'image/png'))).toBe(true);
    expect(isImageAttachment(file('a.png', 'text/plain'))).toBe(false);
    expect(isImageAttachment(file('a.JPEG', null))).toBe(true);
    expect(isImageAttachment(file('a.gif', null))).toBe(false);
    const all = ['a.txt', ...Array.from({ length: 11 }, (_, i) => `${i}.png`)].map((n) =>
      file(n, null),
    );
    expect(screenshotsOf(all).map((f) => f.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `${i}.png`),
    );
  });
});
