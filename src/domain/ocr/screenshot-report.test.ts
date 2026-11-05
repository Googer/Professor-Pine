import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
import { raidBossCp } from '../pogo/cp.js';
import { bossStamina } from '../pogo/raid-tier.js';
import type { ScreenText } from './raid-screen.js';
import {
  bossNameSimilarity,
  clockTime,
  gymOfText,
  nameSimilarity,
  screenshotReport,
  type GymHitLike,
  type ReportContext,
} from './screenshot-report.js';
import { raidTierObservation } from './list-tier-doubt.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (text: string) => zonedAt(text, ZONE);
const BOSSES = raidBossesFixture().bosses();
const CATALOGUE = catalogueFixture();
const boss = (key: string) => {
  const found = BOSSES.find((b) => b.key === key);
  if (!found) throw new Error(key);
  return found;
};

const NO_TEXT: ScreenText = {
  clock: null,
  countdown: null,
  gym: null,
  eliteBadge: false,
  cp: null,
  bossName: null,
  countdownBox: null,
  countdownPlace: null,
  cpBox: null,
};

const NAMES: Record<number, string> = {
  7: 'Heinz Plant',
  8: "St. Paul's Church",
  9: 'Old Plant Church',
  10: 'Temple Sinai',
  11: 'Temple Sinai Garden',
};
const hit = (id: number, allWords = true, corrected = false): GymHitLike => ({
  gym: { id, name: NAMES[id] ?? `Gym ${id}` },
  place: 'local',
  allWords,
  corrected,
});

/**
 * A gym search that knows "Heinz Plant" (gym 7), "Heinz Plantt" only as a misspelling of it, two
 * gyms called "… Church" (8 and 9), and "Plant" anything as a guess of gym 9.
 */
function search(text: string): GymHitLike[] {
  if (text === 'Heinz Plant') return [hit(7)];
  if (text === 'Heinz Plantt') return [hit(7, true, true)];
  if (text === 'Church') return [hit(8), hit(9)];
  if (text === "St. Paul's Church") return [hit(8)];
  if (text === 'Temple Sinai') return [hit(11), hit(10)];
  if (text.includes('Plant')) return [hit(9, false)];
  return [];
}

function context(overrides: Partial<ReportContext> = {}): ReportContext {
  return {
    bosses: BOSSES,
    pokemon: CATALOGUE.all,
    searchGym: search,
    uploadedAt: at('2026-10-14T13:40:00'),
    zone: ZONE,
    standardIncubate: 60,
    standardHatched: 45,
    maxHatched: 180,
    guessOffsetSeconds: 45,
    ...overrides,
  };
}

const read = (text: Partial<ScreenText>, heads: number | null, purple = 0) => ({
  text: { ...NO_TEXT, ...text },
  heads: heads === null ? null : { count: heads, score: 0.7, scale: 1, outside: 0.2 },
  purple,
});

/** A hatched raid's text: the countdown at the right, the clock two minutes before the upload. */
const hatched = (more: Partial<ScreenText> = {}): Partial<ScreenText> => ({
  gym: 'Heinz Plant',
  clock: { hour: 1, minute: 38 },
  countdown: 31 * 60 + 2,
  countdownPlace: 'right',
  ...more,
});

/** An egg's text: the countdown centred, the clock a minute before the upload. */
const egg = (more: Partial<ScreenText> = {}): Partial<ScreenText> => ({
  gym: 'Heinz Plant',
  clock: { hour: 13, minute: 39 },
  countdown: 20 * 60,
  countdownPlace: 'centre',
  ...more,
});

describe('screenshotReport', () => {
  it('reports a hatched raid: the boss by its CP, the end by the clock and countdown', () => {
    const report = screenshotReport(
      read(hatched({ cp: 45899, bossName: 'Yveltal' }), 5),
      context(),
    );
    expect(report).toMatchObject({
      gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
      stage: 'hatched',
      heads: 5,
      tier: { level: 'T5', shadow: false },
      tierFrom: 'boss',
      bossFrom: 'cp',
      takenAt: at('2026-10-14T13:38:00'),
      timeFrom: 'clock',
      time: { end: at('2026-10-14T14:09:02') },
      doubts: [],
    });
    expect(report.boss?.key).toBe('yveltal');
  });

  it('tells bosses of one CP apart by the name, and leaves the boss open when it cannot', () => {
    const twin = { ...boss('yveltal'), key: 'xerneas', name: 'Xerneas' };
    const bosses = [...BOSSES, twin];
    const report = (bossName: string | null) =>
      screenshotReport(read(hatched({ cp: 45899, bossName }), 5), context({ bosses }));
    expect(report('Yvelta1')).toMatchObject({ bossFrom: 'cp-and-name' });
    expect(report('Yvelta1').boss?.key).toBe('yveltal');
    expect(report(null)).toMatchObject({
      boss: null,
      bossFrom: null,
      tier: { level: 'T5', shadow: false },
      tierFrom: 'heads',
      doubts: ['heads-only', 'boss-unknown'],
    });
  });

  it('takes the boss by its name alone only when it is nearly exactly one boss’s', () => {
    const byName = (bossName: string, bosses = BOSSES) =>
      screenshotReport(read(hatched({ cp: 45000, bossName }), 5), context({ bosses }));
    expect(byName('Yveltal').boss?.key).toBe('yveltal');
    expect(byName('Yveltal').doubts).toContain('boss-from-name');
    expect(byName('Yveltai').boss).toBeNull();
    expect(byName('Ditta').boss).toBeNull();
    // The screen shows the species' name, not the form's.
    expect(byName('Landorus').boss?.key).toBe('landorus_incarnate');
    expect(byName('Landorus').tier).toEqual({ level: 'T5', shadow: true });
    // Two look-alikes: the one named exactly, and neither for a misreading.
    const latios = { ...boss('yveltal'), key: 'latios', name: 'Latios' };
    const latias = { ...boss('yveltal'), key: 'latias', name: 'Latias' };
    expect(byName('Latios', [...BOSSES, latios, latias]).boss?.key).toBe('latios');
    expect(byName('Latics', [...BOSSES, latios, latias]).boss).toBeNull();
  });

  it('takes the boss of a CP with one digit hidden when the name read agrees', () => {
    const report = (cp: number, bossName: string | null) =>
      screenshotReport(read(hatched({ cp, bossName }), 5), context());
    // 45899 with its last digit hidden by the boss, and the name half hidden too.
    expect(report(45893, 'Yvelta1').boss?.key).toBe('yveltal');
    expect(report(45893, 'Yvelta1').bossFrom).toBe('cp-and-name');
    expect(report(45893, 'Yvelta1').doubts).not.toContain('not-a-raid-screen');
    // Without a name, with another's, or two digits off: no boss.
    expect(report(45893, null).boss).toBeNull();
    expect(report(45893, 'Landoru5').boss).toBeNull();
    expect(report(45833, 'Yvelta1').boss).toBeNull();
  });

  // Plan 7P-H (Matt, 2026-11-05): a mega raid in a split whose heads were not read, its boss on
  // no list, was refused as no raid screen though "Mega Sableye" stood under its CP.
  describe('a mega or primal boss off the list, its tier from its name when the heads fail', () => {
    const offList = BOSSES.filter(
      (one) => one.tier.level !== 'Mega' && one.tier.level !== 'MegaLegendary',
    );
    const MEGA = { level: 'Mega', shadow: false } as const;
    const LEGENDARY = { level: 'MegaLegendary', shadow: false } as const;
    const cpOf = (key: string, tier: typeof MEGA | typeof LEGENDARY) => {
      const entry = CATALOGUE.byKey(key);
      if (!entry) throw new Error(key);
      return raidBossCp(entry.stats, bossStamina(tier));
    };
    const report = (cp: number, bossName: string, heads: number | null = null, bosses = offList) =>
      screenshotReport(read(hatched({ cp, bossName }), heads), context({ bosses }));

    it('takes a mega’s tier by its name, a legendary’s or a primal’s as Mega Legendary', () => {
      const sableye = report(cpOf('sableye_mega', MEGA), 'Mega Sableye');
      expect(sableye).toMatchObject({
        tier: MEGA,
        tierFrom: 'name',
        boss: { key: 'sableye_mega', tier: MEGA },
        bossFrom: 'cp-and-name',
      });
      expect(sableye.doubts).toEqual(['tier-from-name', 'boss-unlisted']);
      // Mega Latios and Latias are no ordinary megas: legendary, so Mega Legendary.
      expect(report(cpOf('latios_mega', LEGENDARY), 'Mega Latios')).toMatchObject({
        tier: LEGENDARY,
        tierFrom: 'name',
        boss: { key: 'latios_mega' },
      });
      expect(report(cpOf('kyogre_primal', LEGENDARY), 'Primal Kyogre')).toMatchObject({
        tier: LEGENDARY,
        tierFrom: 'name',
        boss: { key: 'kyogre_primal' },
      });
    });

    it('takes no tier the CP does not confirm, nor a plain name, and the heads first', () => {
      // The CP of a Mega Legendary raid is no Mega Sableye's: no tier, no raid screen.
      const wrong = report(cpOf('sableye_mega', LEGENDARY), 'Mega Sableye');
      expect(wrong).toMatchObject({ tier: null, boss: null });
      expect(wrong.doubts).toContain('not-a-raid-screen');
      expect(report(cpOf('sableye_mega', MEGA), 'Sableye').tier).toBeNull();
      // Heads read: their tier, as before.
      const heads = report(cpOf('sableye_mega', MEGA), 'Mega Sableye', 4);
      expect(heads).toMatchObject({ tier: MEGA, tierFrom: 'heads' });
      expect(heads.doubts).not.toContain('tier-from-name');
    });

    it('leaves a listed mega to its CP: a misread one gets no tier by its name', () => {
      const cp = cpOf('sableye_mega', MEGA);
      const listed = { ...boss('yveltal'), key: 'sableye_mega', name: 'Mega Sableye', tier: MEGA };
      const entry = CATALOGUE.byKey('sableye_mega');
      if (!entry) throw new Error('sableye_mega');
      const bosses = [...offList, { ...listed, entry }];
      expect(report(cp, 'Mega Sableye', null, bosses)).toMatchObject({ tierFrom: 'boss' });
      const misread = report(Number(`9${String(cp).slice(1)}`), 'Mega Sableye', null, bosses);
      expect(misread.tier).toBeNull();
    });
  });

  // Matt, 2026-10-25: the reader decides a boss as `/raid` does. `/raid t5 azelf` takes Azelf
  // although the feed does not list it yet; a screenshot of it was a "T5 raid" without a boss.
  describe('a Pokémon the boss list does not have, as `/raid` takes it with a tier', () => {
    const T5 = { level: 'T5', shadow: false } as const;
    const azelf = CATALOGUE.byKey('azelf');
    if (!azelf) throw new Error('azelf');
    const cp = raidBossCp(azelf.stats, bossStamina(T5));
    const report = (shown: number, bossName: string | null, heads = 5, bosses = BOSSES) =>
      screenshotReport(read(hatched({ cp: shown, bossName }), heads), context({ bosses }));

    it('takes it by its CP at the heads’ tier and its name, and says it is on no list', () => {
      expect(BOSSES.some((one) => one.entry?.key === 'azelf')).toBe(false);
      const read = report(cp, 'Azelf');
      expect(read).toMatchObject({
        boss: { key: 'azelf', name: 'Azelf', tier: T5 },
        bossFrom: 'cp-and-name',
        tier: T5,
      });
      expect(read.doubts).toEqual(['boss-unlisted']);
      // A digit the boss hides, as for a listed boss.
      const hidden = Number(String(cp).slice(0, -1) + String((cp + 3) % 10));
      expect(report(hidden, 'Azelf').boss?.key).toBe('azelf');
    });

    it('takes nothing on the CP alone, on another name, or at another tier', () => {
      expect(report(cp, null).boss).toBeNull();
      expect(report(cp, 'Mesprit').boss).toBeNull();
      expect(report(cp, 'Azelf', 3).boss).toBeNull();
      expect(report(cp, 'Azelf').doubts).not.toContain('boss-unknown');
    });

    it('trusts the list over the heads, as `/raid t5 azelf` refuses a T3 Azelf', () => {
      const t3 = { ...boss('yveltal'), key: 'azelf', name: 'Azelf', entry: azelf };
      t3.tier = { level: 'T3', shadow: false };
      const read = report(cp, 'Azelf', 5, [...BOSSES, t3]);
      expect(read.boss).toBeNull();
      expect(read.doubts).toContain('boss-unknown');
    });

    // Plan 8X-J, review B1: the CP and name at the heads' tier fit a boss the list has at another.
    it('makes an observation of a boss listed at another tier of its kind than the heads say', () => {
      const t3 = { ...boss('yveltal'), key: 'azelf', name: 'Azelf', entry: azelf };
      t3.tier = { level: 'T3', shadow: false };
      const bosses = [...BOSSES, t3];
      const read = report(cp, 'Azelf', 5, bosses);
      expect(raidTierObservation(read, { bosses, pokemon: CATALOGUE.all })).toEqual({
        family: 'raid',
        bossKey: 'azelf',
        listTier: { level: 'T3', shadow: false },
        headsTier: T5,
      });
      // Listed at its tier, unlisted, or shadow apart from plain: none.
      const unlisted = report(cp, 'Azelf');
      expect(
        raidTierObservation(unlisted, { bosses: BOSSES, pokemon: CATALOGUE.all }),
      ).toBeUndefined();
      const listedHere = report(45899, 'Yveltal');
      expect(
        raidTierObservation(listedHere, { bosses: BOSSES, pokemon: CATALOGUE.all }),
      ).toBeUndefined();
      const shadow = { ...t3, tier: { level: 'T3', shadow: true } as const };
      const otherKind = report(cp, 'Azelf', 5, [...BOSSES, shadow]);
      expect(
        raidTierObservation(otherKind, { bosses: [...BOSSES, shadow], pokemon: CATALOGUE.all }),
      ).toBeUndefined();
    });

    it('makes none for an Elite boss, nor for six or seven heads', () => {
      const elite = { ...boss('yveltal'), key: 'azelf', name: 'Azelf', entry: azelf };
      elite.tier = { level: 'Elite', shadow: false };
      const bosses = [...BOSSES, elite];
      expect(
        raidTierObservation(report(cp, 'Azelf', 5, bosses), { bosses, pokemon: CATALOGUE.all }),
      ).toBeUndefined();
      const t3 = { ...elite, tier: { level: 'T3', shadow: false } as const };
      const six = report(cp, 'Azelf', 6, [...BOSSES, t3]);
      expect(
        raidTierObservation(six, { bosses: [...BOSSES, t3], pokemon: CATALOGUE.all }),
      ).toBeUndefined();
    });
  });

  it('makes no raid of a max battle’s screen, whatever its heads', () => {
    const max = {
      form: 'dynamax' as const,
      species: 'Sneasel',
      powerSpot: 'HOLLOWAY BROTHERS, PRINTERS',
      spotConfidence: 0.95,
      box: { x0: 135, y0: 1500, x1: 950, y1: 1600 },
    };
    for (const heads of [1, 3, 5]) {
      const report = screenshotReport(
        read({ ...hatched({ gym: null, countdown: 9 * 3600 + 24 * 60 }), max }, heads),
        context(),
      );
      expect(report).toMatchObject({ stage: null, boss: null, tier: null, time: null });
      expect(report.doubts).toContain('not-a-raid-screen');
    }
  });

  it('takes a shadow boss with its shadow tier from the CP', () => {
    const report = screenshotReport(
      read(hatched({ cp: 47444, bossName: 'Landorus' }), 5, 0.08),
      context(),
    );
    expect(report.tier).toEqual({ level: 'T5', shadow: true });
    expect(report.boss?.key).toBe('landorus_incarnate');
    expect(report.doubts).toEqual([]);
  });

  it('doubts a boss from the CP or the name whose shadow the purple does not agree with', () => {
    const byCp = screenshotReport(
      read(hatched({ cp: 47444, bossName: 'Landorus' }), 5, 0),
      context(),
    );
    expect(byCp.boss?.key).toBe('landorus_incarnate');
    expect(byCp.doubts).toEqual(['shadow-differs']);
    const byName = screenshotReport(
      read(hatched({ cp: 45000, bossName: 'Landorus' }), 5, 0),
      context(),
    );
    expect(byName.doubts).toEqual(['shadow-differs', 'boss-from-name']);
    // A plain boss with a purple screen, too.
    const plain = screenshotReport(
      read(hatched({ cp: 45899, bossName: 'Yveltal' }), 5, 0.08),
      context(),
    );
    expect(plain.doubts).toEqual(['shadow-differs']);
  });

  it('lets the purple decide between a shadow and a plain boss of one species', () => {
    const shadow = boss('landorus_incarnate');
    const plain = { ...shadow, tier: { level: 'T5' as const, shadow: false } };
    const both = (purple: number) =>
      screenshotReport(
        read(hatched({ cp: 47444, bossName: 'Landorus' }), 5, purple),
        context({ bosses: [...BOSSES, plain] }),
      );
    expect(both(0.08)).toMatchObject({ boss: shadow, bossFrom: 'cp', doubts: [] });
    expect(both(0)).toMatchObject({ boss: plain, bossFrom: 'cp', doubts: [] });
  });

  it('lets the purple decide between a shadow and a plain boss of one species by the name alone', () => {
    const shadow = boss('landorus_incarnate');
    const plain = { ...shadow, tier: { level: 'T5' as const, shadow: false } };
    // A CP that fits no boss: the name decides, and both are called Landorus.
    const both = (purple: number) =>
      screenshotReport(
        read(hatched({ cp: 45000, bossName: 'Landorus' }), 5, purple),
        context({ bosses: [...BOSSES, plain] }),
      );
    expect(both(0.08)).toMatchObject({ boss: shadow, bossFrom: 'name' });
    expect(both(0.08).doubts).toEqual(['boss-from-name']);
    expect(both(0)).toMatchObject({ boss: plain, bossFrom: 'name' });
  });

  it('doubts a boss whose name under its CP says another, and a row of heads that may be cut', () => {
    const named = screenshotReport(read(hatched({ cp: 45899, bossName: 'Pikachu' }), 5), context());
    expect(named.boss?.key).toBe('yveltal');
    expect(named.doubts).toEqual(['boss-name-differs']);
    // A name partly hidden by the boss is no doubt.
    const hidden = screenshotReport(read(hatched({ cp: 45899, bossName: 'Yvelt' }), 5), context());
    expect(hidden.doubts).toEqual([]);
    const cut = { ...read(egg(), 3), heads: { count: 3, score: 0.7, scale: 1, outside: 0.6 } };
    expect(screenshotReport(cut, context()).doubts).toEqual(['heads-uncertain']);
  });

  it('doubts a boss whose tier is not the tier of the heads', () => {
    const report = screenshotReport(read(hatched({ cp: 45899 }), 3), context());
    expect(report.boss?.key).toBe('yveltal');
    expect(report.doubts).toEqual(['heads-boss-conflict']);
  });

  it('reports a hatched raid whose CP was not read by its countdown at the right', () => {
    const report = screenshotReport(read(hatched(), 5), context());
    expect(report).toMatchObject({
      stage: 'hatched',
      tier: { level: 'T5' },
      time: { end: at('2026-10-14T14:09:02') },
    });
    expect(report.doubts).toEqual(['heads-only', 'boss-unknown']);
  });

  it('reports an egg: the tier by its heads, shadow by its purple, the hatch time', () => {
    const report = (heads: number | null, purple = 0, more: Partial<ScreenText> = {}) =>
      screenshotReport(read(egg(more), heads, purple), context());
    expect(report(3)).toMatchObject({
      stage: 'egg',
      tier: { level: 'T3', shadow: false },
      tierFrom: 'heads',
      time: { hatch: at('2026-10-14T13:59:00') },
      doubts: [],
    });
    expect(report(5, 0.08).tier).toEqual({ level: 'T5', shadow: true });
    expect(report(4, 0.08).tier).toEqual({ level: 'Mega', shadow: false });
    expect(report(6)).toMatchObject({
      tier: { level: 'MegaLegendary' },
      doubts: ['heads-unverified'],
    });
    expect(report(7).tier).toEqual({ level: 'SuperMega', shadow: false });
    expect(report(2)).toMatchObject({ tier: null, doubts: ['tier-unknown'] });
    expect(report(null)).toMatchObject({ heads: null, tier: null });
    expect(report(null).doubts).toEqual(['tier-unknown', 'not-a-raid-screen']);
  });

  it('makes a long egg of five heads elite only at an elite raid gym, and doubts both', () => {
    const long = (eliteBadge: boolean) =>
      screenshotReport(read(egg({ countdown: 3 * 3600, eliteBadge }), 5), context());
    expect(long(true)).toMatchObject({ tier: { level: 'Elite' }, doubts: ['elite'] });
    expect(long(false)).toMatchObject({ tier: { level: 'T5' }, doubts: ['countdown-long'] });
  });

  it('doubts the purple when no current boss of that tier is a shadow, or none is not', () => {
    const plainOnly = BOSSES.filter((b) => !(b.tier.level === 'T5' && b.tier.shadow));
    expect(screenshotReport(read(egg(), 5, 0.08), context({ bosses: plainOnly })).doubts).toEqual([
      'shadow-unlisted',
    ]);
  });

  it('refuses to call a screen without a countdown a raid screen (a Pokémon’s own page)', () => {
    const page = screenshotReport(
      read({ gym: 'CP3277', cp: 3277, bossName: 'Pikachu' }, null),
      context(),
    );
    expect(page.doubts).toContain('not-a-raid-screen');
    expect(page.doubts).toContain('no-time');
    expect(page.time).toBeNull();
  });

  it('cannot tell egg from hatched by a countdown that is neither centred nor at the right', () => {
    const report = screenshotReport(read(egg({ countdownPlace: null }), 3), context());
    expect(report).toMatchObject({ stage: null, time: null });
    expect(report.doubts).toContain('stage-unknown');
  });

  it('guesses the time from the upload when the clock is missing or does not fit', () => {
    for (const clock of [null, { hour: 4, minute: 10 }]) {
      expect(screenshotReport(read(egg({ clock, countdown: 600 }), 1), context())).toMatchObject({
        takenAt: at('2026-10-14T13:39:15'),
        timeFrom: 'upload',
        time: { hatch: at('2026-10-14T13:49:15') },
        doubts: ['time-guessed'],
      });
    }
  });

  it('takes the time from the name of the file when it fits the upload, before the clock', () => {
    // Taken at 13:37:30 by the file's name; the clock says 13:39, a minute before the upload.
    const report = screenshotReport(
      read(egg({ countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-14T13:37:30') }),
    );
    expect(report).toMatchObject({
      takenAt: at('2026-10-14T13:37:30'),
      timeFrom: 'file',
      time: { hatch: at('2026-10-14T13:47:30') },
      doubts: [],
    });
    // Without a clock, the name is no guess either.
    const noClock = screenshotReport(
      read(egg({ clock: null, countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-14T13:37:30') }),
    );
    expect(noClock.takenAt).toBe(at('2026-10-14T13:37:30'));
    expect(noClock.doubts).toEqual([]);
  });

  it('takes the time of a file older than the window, doubted as stale, and ignores one ahead', () => {
    // Taken a day earlier at the same clock time: posted again. Its time is the file's, and
    // the egg has hatched by now.
    const reposted = screenshotReport(
      read(egg({ countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-13T13:39:00') }),
    );
    expect(reposted.takenAt).toBe(at('2026-10-13T13:39:00'));
    expect(reposted.doubts).toEqual(['time-stale', 'time-past']);
    // Without a clock, too: stale, not guessed.
    const noClock = screenshotReport(
      read(egg({ clock: null, countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-13T13:39:00') }),
    );
    expect(noClock.takenAt).toBe(at('2026-10-13T13:39:00'));
    expect(noClock.doubts).toEqual(['time-stale', 'time-past']);
    // A phone whose clock is far ahead names its files by it: the name is not used.
    const ahead = screenshotReport(
      read(egg({ countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-14T13:45:00') }),
    );
    expect(ahead.takenAt).toBe(at('2026-10-14T13:39:00'));
    expect(ahead.doubts).toEqual([]);
  });

  it('lets a sure clock win over a file name it disagrees with by more than two minutes, and doubts both', () => {
    // The clock says 13:39, the file 13:30: the file was renamed or the phone's clock set apart.
    const sure = screenshotReport(
      read(egg({ clock: { hour: 13, minute: 39, confidence: 0.9 }, countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-14T13:30:00') }),
    );
    expect(sure.takenAt).toBe(at('2026-10-14T13:39:00'));
    expect(sure.timeFrom).toBe('clock');
    expect(sure.doubts).toEqual(['time-sources-differ']);
    // A clock read with little confidence loses to the file's name.
    const unsure = screenshotReport(
      read(egg({ clock: { hour: 13, minute: 39, confidence: 0.4 }, countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-14T13:30:00') }),
    );
    expect(unsure.takenAt).toBe(at('2026-10-14T13:30:00'));
    expect(unsure.timeFrom).toBe('file');
    expect(unsure.doubts).toEqual(['time-sources-differ']);
    // Within two minutes of the clock, the file's second-exact time stands, undoubted.
    const close = screenshotReport(
      read(egg({ countdown: 600 }), 1),
      context({ fileTakenAt: at('2026-10-14T13:38:12') }),
    );
    expect(close.takenAt).toBe(at('2026-10-14T13:38:12'));
    expect(close.doubts).toEqual([]);
  });

  it('doubts a clock a while before the upload, a time already past, a countdown too long', () => {
    const stale = screenshotReport(read(egg({ clock: { hour: 1, minute: 20 } }), 1), context());
    expect(stale.doubts).toEqual(['time-stale']);
    const past = screenshotReport(
      read(egg({ clock: { hour: 1, minute: 20 }, countdown: 60 }), 1),
      context(),
    );
    expect(past.doubts).toEqual(['time-stale', 'time-past']);
    const long = screenshotReport(read(hatched({ countdown: 4 * 3600 }), 1), context());
    expect(long.doubts).toContain('countdown-long');
  });

  it('says when no gym was found or the gym was not clear', () => {
    expect(screenshotReport(read(egg({ gym: 'Nowhere' }), 1), context()).doubts).toEqual([
      'no-gym',
    ]);
    expect(screenshotReport(read(egg({ gym: 'Old Plant' }), 1), context()).doubts).toEqual([
      'gym-unclear',
    ]);
  });
});

describe('clockTime', () => {
  const upload = at('2026-10-14T13:40:00');
  const ages = 105 * 60_000;

  it('reads an hour of 1 to 12 as either half of the day, whichever is just before the upload', () => {
    expect(clockTime({ hour: 1, minute: 38 }, upload, ZONE, ages)).toBe(at('2026-10-14T13:38:00'));
    expect(clockTime({ hour: 12, minute: 30 }, upload, ZONE, ages)).toBe(at('2026-10-14T12:30:00'));
    expect(clockTime({ hour: 13, minute: 41 }, upload, ZONE, ages)).toBe(at('2026-10-14T13:41:00'));
  });

  it('reads a clock of the evening before an upload after midnight', () => {
    const night = at('2026-10-15T00:10:00');
    expect(clockTime({ hour: 11, minute: 58 }, night, ZONE, ages)).toBe(at('2026-10-14T23:58:00'));
    expect(clockTime({ hour: 0, minute: 5 }, night, ZONE, ages)).toBe(at('2026-10-15T00:05:00'));
  });

  it('refuses a clock ahead of the upload by more than two minutes, or older than allowed', () => {
    expect(clockTime({ hour: 13, minute: 43 }, upload, ZONE, ages)).toBeUndefined();
    expect(clockTime({ hour: 11, minute: 50 }, upload, ZONE, ages)).toBeUndefined();
  });

  it('reads 1:50 on the night the clocks fall back as the first 1:50, before an upload at 1:10 after it', () => {
    // 2026-11-01: 1:50 EDT is 05:50 UTC; 1:10 EST, after the change, is 06:10 UTC.
    const upload = Date.UTC(2026, 10, 1, 6, 10);
    expect(clockTime({ hour: 1, minute: 50 }, upload, ZONE, ages)).toBe(
      Date.UTC(2026, 10, 1, 5, 50),
    );
  });

  it('does not read a time the clocks skip on the night they spring forward', () => {
    // 2026-03-08: 2:30 does not exist; the upload is at 3:05 EDT.
    const upload = at('2026-03-08T03:05:00');
    expect(clockTime({ hour: 2, minute: 30 }, upload, ZONE, ages)).toBeUndefined();
  });
});

describe('gymOfText', () => {
  // Matt, 2026-10-24: "Pittsburgh Campsite -" fits several gyms; the name's second line, read
  // with the caption of the gym's picture, says which.
  it('narrows a name by the words of the line under it that look like a name', () => {
    const campsites = (text: string): GymHitLike[] => {
      const all = [
        { id: 21, name: 'Pittsburgh Campsite - Incoming' },
        { id: 24, name: 'Pittsburgh Campsite - Outgoing' },
        { id: 25, name: 'Pittsburgh Campsite - Lookout' },
      ];
      const words = text
        .toLowerCase()
        .split(/s+/)
        .filter((word) => word !== '-');
      return all
        .filter((gym) => words.every((word) => gym.name.toLowerCase().includes(word)))
        .map((gym) => ({ gym, place: 'local' as const, allWords: true, corrected: false }));
    };
    expect(
      gymOfText('PeRENY Pittsburgh Campsite -', campsites, 'AMBASSADOR PROGRAM C 0 murit Outgoing'),
    ).toMatchObject({ gymId: 24, clear: true });
    // Without a line under it the name stays unclear, as before.
    expect(gymOfText('PeRENY Pittsburgh Campsite -', campsites)).toMatchObject({ clear: false });
  });

  it('drops picture text before the name', () => {
    expect(gymOfText('HEINZ Heinz Plant', search)).toEqual({
      read: 'HEINZ Heinz Plant',
      searched: 'Heinz Plant',
      gymId: 7,
      place: 'local',
      clear: true,
    });
  });

  it('takes a misspelt name, but not as clear', () => {
    expect(gymOfText('Heinz Plantt', search)).toMatchObject({ gymId: 7, clear: false });
  });

  it('never lets one common word decide, nor a part of less than half the words read', () => {
    expect(gymOfText("St. Paul's Church", search)).toMatchObject({ gymId: 8, clear: true });
    expect(gymOfText("St. Pau1's Church", search)).toMatchObject({ clear: false });
  });

  it('takes the one gym called exactly what was read of several, but not as clear', () => {
    expect(gymOfText('Temple Sinai', search)).toMatchObject({ gymId: 10, clear: false });
  });

  it('never lets one common word be clear, even when one gym has it', () => {
    const one = (text: string) => (text === 'Church' ? [hit(8)] : []);
    expect(gymOfText('Old Grey Church', one)).toMatchObject({ gymId: 8, clear: false });
  });

  it('takes the top hit of the whole text when nothing is clear, and says so', () => {
    expect(gymOfText('Old Plant', search)).toMatchObject({
      searched: 'Old Plant',
      gymId: 9,
      clear: false,
    });
    expect(gymOfText('Nothing here', search)).toMatchObject({ gymId: null, searched: null });
    expect(gymOfText(null, search)).toMatchObject({ read: null, gymId: null });
  });
});

describe('names', () => {
  it('compares letters only, without case', () => {
    expect(nameSimilarity('YVELTAL', 'Yveltal')).toBe(1);
    expect(nameSimilarity('Ditya', 'Dialga')).toBeCloseTo(0.5, 5);
    expect(nameSimilarity('', 'Dialga')).toBe(0);
  });

  it('compares a boss by its name, without its form, and without mega or a region', () => {
    expect(bossNameSimilarity('Landorus', { name: 'Landorus (Incarnate Forme)' })).toBe(1);
    expect(bossNameSimilarity('Blastoise', { name: 'Mega Blastoise' })).toBe(1);
    expect(bossNameSimilarity('Mega Blastoise', { name: 'Mega Blastoise' })).toBe(1);
    expect(bossNameSimilarity('Charizard', { name: 'Mega Charizard X' })).toBe(1);
    expect(bossNameSimilarity('Raichu', { name: 'Alolan Raichu' })).toBe(1);
  });
});
