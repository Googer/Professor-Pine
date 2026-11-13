import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { eggReading } from '../../test/support/screenshots.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { MaxDoubt } from '../domain/ocr/max-report.js';
import {
  storedReport,
  type StoredMaxReport,
  type StoredReport,
} from '../domain/ocr/screenshot-record.js';
import {
  hasIssue,
  ScreenshotStore,
  type NewScreenshot,
  type ScreenshotStoreOptions,
} from './screenshot-store.js';

const DAY = 24 * 3_600_000;
const MB = 1024 * 1024;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SENDER = '700000000000000001';
const OTHER = '700000000000000002';

const report = (doubts: StoredReport['doubts'] = []): StoredReport =>
  storedReport({
    gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
    stage: 'egg',
    heads: 5,
    tier: { level: 'T5', shadow: false },
    tierFrom: 'heads',
    cp: null,
    bossName: null,
    boss: null,
    bossFrom: null,
    eliteBadge: false,
    purple: 0,
    clock: { hour: 13, minute: 39 },
    countdown: 1800,
    takenAt: 0,
    timeFrom: 'clock',
    time: { hatch: 1_800_000 },
    doubts,
  });

/** What the max report of a clear Dynamax Machop (2★) at an invented Power Spot keeps. */
const maxReport = (doubts: MaxDoubt[] = []): StoredMaxReport => ({
  form: 'dynamax',
  speciesRead: 'MACHOP',
  boss: { ref: { key: 'machop' }, name: 'Machop', listed: true },
  heads: 2,
  tier: 'D2',
  tierFrom: 'list',
  spot: {
    read: 'MAPLE BENCH EAST',
    readSurely: true,
    match: { kind: 'clear', spot: { id: 'w2', title: 'Maple Bench East', local: true } },
  },
  clock: { hour: 13, minute: 39 },
  countdown: 1800,
  takenAt: 0,
  timeFrom: 'clock',
  sureMoment: true,
  countdownEnd: 1_800_000,
  end: 1_800_000,
  endFrom: 'countdown',
  rotationEnd: true,
  firstBattle: 0,
  lastBattle: 2 * 3_600_000,
  doubts,
});

function screenshot(
  decision: NewScreenshot['decision'] = { kind: 'report' },
  more: Partial<NewScreenshot> = {},
): NewScreenshot {
  return {
    guildId: '412345678901234567',
    use: 'raid',
    senderId: SENDER,
    uploadedAt: 1_000_000,
    fileTakenAt: null,
    timeFrom: 'clock',
    reading: eggReading('Heinz Plant', 5, { hour: 13, minute: 39 }),
    report: report(),
    typed: null,
    decision,
    bosses: [],
    ...more,
  };
}

function storeWith(shown: Set<string> = new Set(), more: Partial<ScreenshotStoreOptions> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pine-shots-'));
  const clock = { now: 1_000_000 };
  const { log, entries } = createTestLogger();
  const store = new ScreenshotStore({
    dir,
    reviewDays: 30,
    keepMegabytes: 2048,
    reviewPerDay: 200,
    shown: () => shown,
    gymName: (id) => (id === 7 ? 'Heinz Plant' : id === 9 ? 'Old Plant Church' : undefined),
    log,
    now: () => clock.now,
    ...more,
  });
  const files = (folder: string) => {
    try {
      return readdirSync(path.join(dir, folder)).sort();
    } catch {
      return [];
    }
  };
  const json = (folder: string, id: string) =>
    JSON.parse(readFileSync(path.join(dir, folder, `${id}.json`), 'utf8')) as Record<
      string,
      unknown
    >;
  return { dir, clock, store, files, json, entries };
}

async function kept(store: ScreenshotStore, shot: NewScreenshot, bytes = PNG, image = true) {
  const id = await store.keep(bytes, shot, image);
  if (!id) throw new Error('not kept');
  return id;
}

describe('ScreenshotStore', () => {
  it('keeps a screenshot with its record for a day, the sender by their id', async () => {
    const { store, files, json } = storeWith();
    const id = await kept(store, screenshot());
    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(files('held')).toEqual([`${id}.json`, `${id}.png`]);
    expect(files('review')).toEqual([]);
    expect(json('held', id)).toMatchObject({
      id,
      use: 'raid',
      senderId: SENDER,
      keepUntil: 1_000_000 + DAY,
      pickedGymId: null,
      feedback: [],
    });
    const found = await store.get(id);
    if (!found || found === 'gone') throw new Error('not found');
    expect(found.record.report.gym.gymId).toBe(7);
    expect(readFileSync(found.path ?? '')).toEqual(Buffer.from(PNG));
  });

  it('keeps a record alone when asked, and says gone for a file that vanished', async () => {
    const { store, files, dir } = storeWith();
    const alone = await kept(
      store,
      screenshot({ kind: 'refuse', reason: 'not-a-raid-screen' }),
      PNG,
      false,
    );
    expect(files('held')).toEqual([`${alone}.json`]);
    expect(files('review')).toEqual([`${alone}.json`]);
    expect(await store.get(alone)).toMatchObject({ path: undefined, record: { file: null } });
    const id = await kept(store, screenshot());
    const { rmSync } = await import('node:fs');
    rmSync(path.join(dir, 'held', `${id}.png`));
    expect(await store.get(id)).toBe('gone');
  });

  it('keeps nothing that is no picture, and answers nothing for an id it does not have', async () => {
    const { store, files } = storeWith();
    expect(await store.keep(new TextEncoder().encode('text'), screenshot())).toBeUndefined();
    expect(files('held')).toEqual([]);
    expect(await store.get('../../etc/xx')).toBeUndefined();
    expect(await store.get('AAAAAAAAAAAA')).toBeUndefined();
  });

  it('copies one it asked about or refused to review at once, at most so many a server a day', async () => {
    const { store, files, json, clock } = storeWith(new Set(), { reviewPerDay: 2 });
    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
    expect(files('review')).toEqual([`${asked}.json`, `${asked}.png`]);
    expect(json('review', asked).keepUntil).toBe(1_000_000 + 30 * DAY);
    await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
    const third = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
    expect(files('review')).toHaveLength(4);
    expect(files('review')).not.toContain(`${third}.json`);
    clock.now += DAY;
    const next = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
    expect(files('review')).toContain(`${next}.json`);
  });

  it('copies one reported with a doubt of the reader to review, within the places of the day', async () => {
    const { store, files } = storeWith(new Set(), { reviewPerDay: 1 });
    const doubted = await kept(
      store,
      screenshot({ kind: 'report' }, { report: report(['time-guessed']) }),
    );
    expect(files('review')).toEqual([`${doubted}.json`, `${doubted}.png`]);
    // Still under the server's review places of the day.
    const more = await kept(
      store,
      screenshot({ kind: 'report' }, { report: report(['time-guessed']) }),
    );
    expect(files('review')).not.toContain(`${more}.json`);
  });

  it('judges a max screenshot by its own doubts, not by the raid report of it', async () => {
    const { store, files } = storeWith();
    // The raid report of a max screen always says it is no raid's.
    const raidOf = report(['not-a-raid-screen']);
    const clean = screenshot({ kind: 'report' }, { report: raidOf, max: maxReport() });
    expect(hasIssue({ ...clean, feedback: [] })).toBe(false);
    await kept(store, clean);
    expect(files('review')).toEqual([]);
    const doubted = screenshot(
      { kind: 'report' },
      { report: raidOf, max: maxReport(['spot-read-poorly']) },
    );
    expect(hasIssue({ ...doubted, feedback: [] })).toBe(true);
    const id = await kept(store, doubted);
    expect(files('review')).toEqual([`${id}.json`, `${id}.png`]);
  });

  it('makes no answer key of "All right" on a max screenshot, and keeps the Power Spot picked', async () => {
    const { store, json } = storeWith();
    const id = await kept(
      store,
      screenshot(
        { kind: 'ask', doubts: ['spot-unclear'] },
        { report: report(['not-a-raid-screen']), max: maxReport(['spot-unclear']) },
      ),
    );
    await store.pickedSpot(id, 'w2');
    await store.feedback(id, SENDER, { verdict: 'right' });
    const record = json('review', id);
    expect(record).toMatchObject({ pickedSpotId: 'w2', pickedGymId: null });
    expect(record.label).toBeUndefined();
  });

  it('copies no screenshot reported unasked and without a doubt to review', async () => {
    const { store, files } = storeWith();
    await kept(store, screenshot({ kind: 'report' }));
    expect(files('review')).toEqual([]);
  });

  it('records one feedback per member by id, copies it to review, and makes "All right" the key', async () => {
    const { store, files, json } = storeWith();
    const id = await kept(store, screenshot());
    expect(await store.feedback(id, SENDER, { verdict: 'right' })).toBe('ok');
    expect(files('review')).toEqual([`${id}.json`, `${id}.png`]);
    expect(json('review', id)).toMatchObject({
      feedback: [{ verdict: 'right', by: 'reporter', memberId: SENDER }],
      label: { source: 'member', gym: 'Heinz Plant', egg: true, tier: 5, shadow: false },
    });
    // The reporter changes their mind; somebody else agrees with what was read at first.
    await store.feedback(id, SENDER, { verdict: 'wrong', elements: ['gym'], correction: 'X' });
    await store.feedback(id, OTHER, { verdict: 'right' });
    const record = json('review', id);
    expect(record.feedback).toMatchObject([
      { verdict: 'wrong', by: 'reporter', elements: ['gym'], correction: 'X' },
      { verdict: 'right', by: 'other', memberId: OTHER },
    ]);
    // Disputed: listed, never scored.
    expect(record.label).toBeUndefined();
    expect(await store.feedback('AAAAAAAAAAAA', SENDER, { verdict: 'right' })).toBe('gone');
  });

  it('keys the gym its member picked when asked', async () => {
    const { store, json } = storeWith();
    const id = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
    await store.picked(id, 9);
    await store.feedback(id, SENDER, { verdict: 'right' });
    expect(json('review', id)).toMatchObject({
      pickedGymId: 9,
      label: { gym: 'Old Plant Church' },
    });
  });

  it.each(['EPERM', 'EBUSY', 'EACCES'])(
    'keeps the gym picked when Windows refuses the rename of its record once with %s',
    async (code) => {
      // A virus scanner or the search index holds a file just written, for a moment.
      let refuse = false;
      const { store, json, entries } = storeWith(new Set(), {
        renamePauseMs: 0,
        rename: async (from, to) => {
          if (refuse) {
            refuse = false;
            throw Object.assign(new Error(`${code}: rename`), { code });
          }
          await rename(from, to);
        },
      });
      const id = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
      refuse = true;
      await store.picked(id, 9);
      expect(refuse).toBe(false);
      expect(json('held', id)).toMatchObject({ pickedGymId: 9 });
      expect(json('review', id)).toMatchObject({ pickedGymId: 9 });
      expect(entries.filter((entry) => entry.msg === 'could not change a kept screenshot')).toEqual(
        [],
      );
    },
  );

  it('leaves out of the key what the member typed', async () => {
    const { store, json } = storeWith();
    const id = await kept(
      store,
      screenshot(
        { kind: 'report' },
        {
          typed: {
            gymId: 7,
            boss: { tier: { level: 'T5', shadow: false }, key: null, hatched: false },
          },
        },
      ),
    );
    await store.feedback(id, SENDER, { verdict: 'right' });
    expect(json('held', id).label).toBeUndefined();
  });

  it('writes the review copy of feedback given at the same time with all of it', async () => {
    const { store, json } = storeWith();
    const id = await kept(store, screenshot());
    await Promise.all([
      store.feedback(id, SENDER, { verdict: 'right' }),
      store.feedback(id, OTHER, { verdict: 'wrong', elements: ['tier'], correction: '' }),
      store.picked(id, 7),
    ]);
    expect(json('review', id)).toMatchObject({ pickedGymId: 7 });
    expect((json('review', id).feedback as unknown[]).length).toBe(2);
  });

  it('sweeps what is due: a day for one in held, a day after its raid for one a raid shows', async () => {
    const shown = new Set<string>();
    const { store, clock, files, json } = storeWith(shown);
    const plain = await kept(store, screenshot());
    const ofRaid = await kept(store, screenshot());
    void plain;
    shown.add(ofRaid);
    await store.inUse(ofRaid);
    clock.now += DAY + 1;
    await store.sweep();
    expect(files('held')).toEqual([`${ofRaid}.json`, `${ofRaid}.png`]);
    // The raid ended: a day from the sweep that sees it.
    shown.delete(ofRaid);
    await store.sweep();
    expect(json('held', ofRaid).keepUntil).toBe(clock.now + DAY);
    // A raid made from it again meanwhile keeps it, whatever its record says.
    clock.now += DAY + 1;
    shown.add(ofRaid);
    await store.sweep();
    expect(files('held')).toEqual([`${ofRaid}.json`, `${ofRaid}.png`]);
    shown.delete(ofRaid);
  });

  it('sweeps review after reviewDays, and a stray file or an unreadable record after a day', async () => {
    const { store, clock, files, dir } = storeWith();
    const id = await kept(store, screenshot({ kind: 'refuse', reason: 'no-gym' }));
    for (const name of ['strayfile.png', 'AAAAAAAAAAAA.json', 'AAAAAAAAAAAA.png']) {
      const stray = path.join(dir, 'held', name);
      writeFileSync(stray, name.endsWith('.json') ? '{ not json' : 'x');
      utimesSync(stray, new Date(0), new Date(0));
    }
    clock.now += 2 * DAY;
    await store.sweep();
    expect(files('held')).toEqual([]);
    expect(files('review')).toEqual([`${id}.json`, `${id}.png`]);
    clock.now += 30 * DAY;
    await store.sweep();
    expect(files('review')).toEqual([]);
  });

  it('makes room within its budget by the oldest screenshots without an issue', async () => {
    const shown = new Set<string>();
    const { store, files, clock } = storeWith(shown, { keepMegabytes: 10 });
    const big = new Uint8Array(3 * MB);
    big.set(PNG);
    const first = await kept(store, screenshot(), big);
    // "All right" is no issue: it goes like any other plain screenshot.
    await store.feedback(first, OTHER, { verdict: 'right' });
    clock.now += 1;
    // Held and in review, but linked: its bytes count once.
    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), big);
    clock.now += 1;
    const doubted = await kept(
      store,
      screenshot({ kind: 'report' }, { report: report(['time-guessed']) }),
      big,
    );
    // Full: the plain one goes for a new plain one.
    clock.now += 1;
    const second = await kept(store, screenshot(), big);
    expect(files('held')).not.toContain(`${first}.png`);
    expect(files('held')).toContain(`${asked}.png`);
    expect(files('held')).toContain(`${doubted}.png`);
    // Only screenshots with an issue (and the one a raid shows) could make room: not kept.
    shown.add(second);
    expect(await store.keep(big, screenshot())).toBeUndefined();
    expect(files('held')).toContain(`${second}.png`);
  });

  it('counts a screenshot held and in review once, and lets the oldest review copies go next', async () => {
    const { store, files, clock } = storeWith(new Set(), { keepMegabytes: 4 });
    const big = new Uint8Array(3 * MB);
    big.set(PNG);
    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), big);
    expect(files('review')).toContain(`${asked}.png`);
    // 3 MB of 4: half a megabyte more fits, which a double count would refuse.
    const small = new Uint8Array(MB / 2);
    small.set(PNG);
    await store.sweep();
    expect(
      await store.keep(small, screenshot({ kind: 'ask', doubts: ['gym-unclear'] })),
    ).toBeDefined();
    // Two days on the held ones are gone; the review copies stay, and the oldest makes room.
    clock.now += 2 * 24 * 3_600_000;
    await store.sweep();
    expect(files('held')).toEqual([]);
    const next = await store.keep(big, screenshot());
    expect(next).toBeDefined();
    expect(files('review')).not.toContain(`${asked}.png`);
  });

  it('lets no review copy go that frees nothing: one linked to its held screenshot', async () => {
    const { store, files } = storeWith(new Set(), { keepMegabytes: 4 });
    const big = new Uint8Array(3 * MB);
    big.set(PNG);
    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), big);
    expect(await store.keep(big, screenshot())).toBeUndefined();
    expect(files('review')).toContain(`${asked}.png`);
    expect(files('review')).toContain(`${asked}.json`);
  });

  it('keeps a record alone only when the record itself fits', async () => {
    // How large a record is: one held and its review copy fit beside the screenshot, a third not.
    const probe = storeWith();
    const probed = await kept(probe.store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
    const json = statSync(path.join(probe.dir, 'held', `${probed}.json`)).size;
    const { store, files } = storeWith(new Set(), { keepMegabytes: 4 });
    const big = new Uint8Array(4 * MB - Math.round(2.5 * json));
    big.set(PNG);
    await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), big);
    const before = files('held');
    const alone = await store.keep(
      PNG,
      screenshot({ kind: 'refuse', reason: 'not-a-raid-screen' }),
      false,
    );
    expect(alone).toBeUndefined();
    expect(files('held')).toEqual(before);
  });

  it('copies a review screenshot where it cannot link one, and counts its bytes twice', async () => {
    const noLinks = () =>
      Promise.reject(Object.assign(new Error('cross-device link'), { code: 'EXDEV' }));
    const { store, files, dir } = storeWith(new Set(), { keepMegabytes: 4, link: noLinks });
    const shot = new Uint8Array(1.5 * MB);
    shot.set(PNG);
    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), shot);
    // A copy of its own: another file than the held one.
    const held = statSync(path.join(dir, 'held', `${asked}.png`));
    const copy = statSync(path.join(dir, 'review', `${asked}.png`));
    expect(copy.size).toBe(held.size);
    expect(copy.ino === held.ino && copy.dev === held.dev).toBe(false);
    // 3 MB of 4 are taken: 1.5 MB more fits only once the review copy has made room.
    expect(await store.keep(shot, screenshot())).toBeDefined();
    expect(files('review')).not.toContain(`${asked}.png`);
    expect(files('held')).toContain(`${asked}.png`);
  });

  it('keeps another pane of a picture as a link of its file, costing its bytes once (plan 7P)', async () => {
    const { store, dir } = storeWith(new Set(), { keepMegabytes: 4 });
    const shot = new Uint8Array(1.5 * MB);
    shot.set(PNG);
    const top = await kept(store, screenshot());
    const bottom = await store.keep(shot, screenshot(), true, top);
    if (!bottom) throw new Error('not kept');
    const [a, b] = [top, bottom].map((id) => statSync(path.join(dir, 'held', `${id}.png`)));
    expect(a?.ino === b?.ino && a?.dev === b?.dev).toBe(true);
    expect(b?.nlink).toBe(2);
    // 1.5 MB counted once: two more fit in 4 MB.
    expect(await store.keep(shot, screenshot())).toBeDefined();
    expect(await store.keep(shot, screenshot())).toBeDefined();
  });

  it('copies another pane’s file where it cannot link it', async () => {
    const noLinks = () => Promise.reject(new Error('no links here'));
    const { store, dir } = storeWith(new Set(), { link: noLinks });
    const top = await kept(store, screenshot());
    const bottom = await store.keep(PNG, screenshot(), true, top);
    const [a, b] = [top, bottom].map((id) => statSync(path.join(dir, 'held', `${id ?? ''}.png`)));
    expect(a?.ino === b?.ino).toBe(false);
    expect(b?.size).toBe(PNG.byteLength);
  });

  it('answers rather than throws when it cannot write, and says so in the log', async () => {
    const { store, dir, entries } = storeWith();
    // A file where the folder should be: nothing can be written under it.
    writeFileSync(path.join(dir, 'held'), 'in the way');
    expect(await store.keep(PNG, screenshot())).toBeUndefined();
    expect(entries.some((entry) => entry.msg === 'could not keep a screenshot')).toBe(true);
    expect(await store.feedback('AAAAAAAAAAAA', SENDER, { verdict: 'right' })).toBe('gone');
    await store.sweep();
  });

  describe('forgetting a member (plan 8G, `/operator forget`)', () => {
    const refused: NewScreenshot['decision'] = { kind: 'refuse', reason: 'not-a-raid-screen' };

    it('removes the screenshots a member sent from both folders, and their feedback on others’', async () => {
      // One of the member's is shown by a raid that is going on: it goes all the same.
      const shown = new Set<string>();
      const { store, files, json } = storeWith(shown);
      const plain = await kept(store, screenshot());
      shown.add(plain);
      await store.inUse(plain);
      const reviewed = await kept(store, screenshot(refused));
      const theirs = await kept(store, screenshot({ kind: 'report' }, { senderId: OTHER }));
      const theirsToo = await kept(store, screenshot(refused, { senderId: OTHER }));
      // Each said something about a screenshot of the other's.
      await store.feedback(theirs, SENDER, {
        verdict: 'wrong',
        elements: ['gym'],
        correction: 'It is the church.',
      });
      await store.feedback(theirs, OTHER, { verdict: 'right' });
      await store.feedback(plain, OTHER, { verdict: 'right' });
      expect(files('review')).toHaveLength(8);

      expect(await store.heldOf(SENDER)).toEqual({ sent: 2, feedback: 1 });
      expect(await store.heldOf(OTHER)).toEqual({ sent: 2, feedback: 1 });

      expect(await store.forget(SENDER)).toEqual({ removed: 2, feedback: 1, failed: 0 });

      // Only the other member's are left, in both folders, with their pictures.
      const left = [theirs, theirsToo].flatMap((id) => [`${id}.json`, `${id}.png`]).sort();
      expect(files('held')).toEqual(left);
      expect(files('review')).toEqual(left);
      expect(await store.get(plain)).toBeUndefined();
      expect(await store.get(reviewed)).toBeUndefined();
      // What the member said about the other's screenshot is gone, id and words; the rest stays.
      for (const folder of ['held', 'review']) {
        const record = json(folder, theirs);
        expect(record.senderId).toBe(OTHER);
        expect(record.feedback).toMatchObject([
          { verdict: 'right', by: 'reporter', memberId: OTHER },
        ]);
        expect(JSON.stringify(record)).not.toContain(SENDER);
        expect(JSON.stringify(record)).not.toContain('church');
      }
      expect(JSON.stringify(json('held', theirsToo))).not.toContain(SENDER);
      expect(await store.heldOf(SENDER)).toEqual({ sent: 0, feedback: 0 });
      // The other member's feedback on a screenshot that went with its sender is gone with it.
      expect(await store.heldOf(OTHER)).toEqual({ sent: 2, feedback: 0 });
      // Run again, there is nothing.
      expect(await store.forget(SENDER)).toEqual({ removed: 0, feedback: 0, failed: 0 });
    });

    it('counts and removes a picture the member posted that another member had read', async () => {
      const THIRD = '700000000000000003';
      const { store, files } = storeWith();
      // The member posted it, another pressed "Read screenshot" (plan 7M): it is the poster's.
      const posted = await kept(store, screenshot(refused, { senderId: OTHER, posterId: SENDER }));
      // Neither sent nor posted by the member: untouched.
      const neither = await kept(store, screenshot(refused, { senderId: OTHER, posterId: THIRD }));

      expect(await store.heldOf(SENDER)).toEqual({ sent: 1, feedback: 0 });
      expect(await store.forget(SENDER)).toEqual({ removed: 1, feedback: 0, failed: 0 });

      const left = [`${neither}.json`, `${neither}.png`].sort();
      expect(files('held')).toEqual(left);
      expect(files('review')).toEqual(left);
      expect(await store.get(posted)).toBeUndefined();
      expect(await store.heldOf(OTHER)).toEqual({ sent: 1, feedback: 0 });
      expect(await store.heldOf(SENDER)).toEqual({ sent: 0, feedback: 0 });
    });

    it('frees the bytes of what it removes', async () => {
      const big = new Uint8Array(MB);
      big.set(PNG);
      // Room for two such pictures: after the member's went, two more fit without one going.
      const { store, files } = storeWith(new Set(), { keepMegabytes: 2.5 });
      const refusedShot = screenshot(refused);
      await kept(store, refusedShot, big);
      await kept(store, refusedShot, big);
      await store.forget(SENDER);
      expect(files('held')).toEqual([]);
      const others = screenshot(refused, { senderId: OTHER });
      const first = await kept(store, others, big);
      const second = await kept(store, others, big);
      expect(files('held')).toEqual(
        [first, second].flatMap((id) => [`${id}.json`, `${id}.png`]).sort(),
      );
    });

    it('answers rather than throws where nothing is kept, or a record cannot be removed', async () => {
      const { store, dir, entries } = storeWith();
      expect(await store.heldOf(SENDER)).toEqual({ sent: 0, feedback: 0 });
      expect(await store.forget(SENDER)).toEqual({ removed: 0, feedback: 0, failed: 0 });
      const id = await kept(store, screenshot());
      // A folder in the place of the picture: it cannot be removed as a file.
      const { mkdirSync, rmSync } = await import('node:fs');
      rmSync(path.join(dir, 'held', `${id}.png`));
      mkdirSync(path.join(dir, 'held', `${id}.png`));
      writeFileSync(path.join(dir, 'held', `${id}.png`, 'inside'), 'x');
      expect(await store.forget(SENDER)).toEqual({ removed: 0, feedback: 0, failed: 1 });
      expect(
        entries.some((entry) => entry.msg === 'could not remove a member’s kept screenshot'),
      ).toBe(true);
    });
  });
});
