import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import {
  MAX_FEED_READ_AT,
  pokebattlerFeed,
  readPokebattlerFeed,
} from '../../../test/support/max-bosses.js';
import { pokemonFixture } from '../../../test/support/providers.js';
import type { PokemonEntry } from '../pogo/game-master.js';
import { maxBossesAt, parseMaxBossFeed, type MaxBoss } from '../pogo/max-bosses.js';
import { decideMax, withMaxTyped, withSpot } from './max-decision.js';
import { maxTierObservation } from './list-tier-doubt.js';
import { maxScreenshotReport, type MaxReportContext } from './max-report.js';
import type { SpotTitle } from './power-spot-match.js';
import type { MaxText, ScreenText } from './raid-screen.js';
import { zonedAt } from '../../../test/support/time.js';

const ZONE = 'America/New_York';
const at = (text: string) => zonedAt(text, ZONE);
const catalogue = catalogueFixture();
const pokemon = pokemonFixture();
/** The recorded feed’s max bosses (a Dynamax 2★ Machop). */
const FEED = parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
  now: MAX_FEED_READ_AT,
  zone: ZONE,
}).bosses.map((boss) => ({ ...boss, firstSeen: MAX_FEED_READ_AT }));
/** The recorded max bosses, with a Gigantamax Machamp as staff would add. */
const BOSSES: MaxBoss[] = maxBossesAt(
  FEED,
  [
    {
      id: 1,
      action: 'add',
      pokemonId: 'MACHAMP',
      form: null,
      tier: 'G',
      shiny: false,
      expiresAt: null,
      createdBy: '123456789012345678',
      createdAt: MAX_FEED_READ_AT,
    },
  ],
  catalogue,
  MAX_FEED_READ_AT,
);
/** The Pokémon a name read names outright, among those `among` keeps. */
const named = (read: string, among?: (entry: PokemonEntry) => boolean) => {
  const entry = pokemon.exact(read);
  return entry && (!among || among(entry)) ? entry : undefined;
};
/** Invented Power Spots. */
const SPOTS: SpotTitle[] = [
  { id: 'w1', title: "Juniper's Swing Corner", local: true },
  { id: 'w2', title: 'Maple Bench East', local: true },
  { id: 'w3', title: 'Maple Bench West', local: true },
  { id: 'e1', title: 'Copperleaf Mural', local: false },
];

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

function maxText(overrides: Partial<MaxText> = {}): MaxText {
  return {
    form: 'dynamax',
    species: 'Machop',
    powerSpot: "JUNIPER'SSWING CORNER",
    spotConfidence: 0.97,
    box: { x0: 135, y0: 1500, x1: 950, y1: 1600 },
    ...overrides,
  };
}

/** A max screen read: its countdown in seconds (null for none), heads, clock. */
function screen(
  options: {
    max?: Partial<MaxText> | null;
    countdown?: number | null;
    heads?: number | null;
    clock?: ScreenText['clock'];
  } = {},
) {
  const heads = options.heads === undefined ? 2 : options.heads;
  return {
    text: {
      ...NO_TEXT,
      clock: options.clock ?? null,
      countdown: options.countdown === undefined ? 30 * 60 : options.countdown,
      max: options.max === null ? null : maxText(options.max ?? {}),
    },
    heads: heads === null ? null : { count: heads, score: 0.7, scale: 1, outside: 0.2 },
    purple: 0,
  };
}

/** Uploaded at `uploaded`, taken at `taken` by the name of its file (unless null). */
function context(
  uploaded: string,
  taken: string | null = uploaded,
  overrides: Partial<MaxReportContext> = {},
): MaxReportContext {
  return {
    bosses: BOSSES,
    pokemon: named,
    catalogue,
    spots: SPOTS,
    uploadedAt: at(uploaded),
    zone: ZONE,
    guessOffsetSeconds: 45,
    ...(taken === null ? {} : { fileTakenAt: at(taken) }),
    hours: { firstBattle: '06:00', lastBattle: '21:00' },
    events: [],
    big: [],
    ...overrides,
  };
}

const THURSDAY = '2026-10-22T14:00:00';

describe('maxScreenshotReport', () => {
  it('reads a listed boss at a clear spot, its end the countdown from a moment it is sure of', () => {
    const report = maxScreenshotReport(screen(), context(THURSDAY));
    expect(report).toMatchObject({
      form: 'dynamax',
      boss: { ref: { key: 'machop' }, name: 'Machop', listed: true },
      tier: 'D2',
      tierFrom: 'list',
      spot: { read: "JUNIPER'SSWING CORNER", readSurely: true, match: { kind: 'clear' } },
      timeFrom: 'file',
      sureMoment: true,
      end: at('2026-10-22T14:30:00'),
      endFrom: 'countdown',
      rotationEnd: true,
      doubts: [],
    });
  });

  it('keeps the list’s tier when the heads disagree, and says so', () => {
    const report = maxScreenshotReport(screen({ heads: 3 }), context(THURSDAY));
    expect(report.tier).toBe('D2');
    expect(report.doubts).toContain('heads-boss-conflict');
  });

  it('takes the tier of a boss on no list from the heads, or from the form for Gigantamax', () => {
    const dynamax = maxScreenshotReport(
      screen({ max: { species: 'Kingler' }, heads: 3 }),
      context(THURSDAY),
    );
    expect(dynamax).toMatchObject({
      boss: { ref: { key: 'kingler' }, listed: false },
      tier: 'D3',
      tierFrom: 'heads',
    });
    expect(dynamax.doubts).toContain('boss-unlisted');
    // The form decides when the heads were not read, and must agree when they were.
    const giant = maxScreenshotReport(
      screen({ max: { form: 'gigantamax', species: 'Kingler' }, heads: null }),
      context(THURSDAY),
    );
    expect(giant).toMatchObject({ tier: 'G', tierFrom: 'form' });
    const noHeads = maxScreenshotReport(
      screen({ max: { species: 'Kingler' }, heads: null }),
      context(THURSDAY),
    );
    expect(noHeads).toMatchObject({ tier: null, boss: { ref: { key: 'kingler' } } });
    expect(noHeads.doubts).toContain('tier-unknown');
    const sixHeads = maxScreenshotReport(
      screen({ max: { species: 'Kingler' }, heads: 6 }),
      context(THURSDAY),
    );
    expect(sixHeads.tier).toBeNull();
    expect(sixHeads.doubts).toContain('heads-form-conflict');
  });

  // Matt, 2026-10-24 (the Lake Trio day): Pokebattler listed Azelf at 5★ before the game master
  // listed it among the Dynamax bosses, and the screen read "Azelf" found no boss.
  it('finds a listed boss the game master does not have as a max boss yet', () => {
    const withAzelf = maxBossesAt(
      FEED,
      [
        {
          id: 2,
          action: 'add',
          pokemonId: 'AZELF',
          form: null,
          tier: 'D5',
          shiny: false,
          expiresAt: null,
          createdBy: '123456789012345678',
          createdAt: MAX_FEED_READ_AT,
        },
      ],
      catalogue,
      MAX_FEED_READ_AT,
    );
    const azelf = pokemon.exact('Azelf');
    expect(azelf && catalogue.canDynamax(azelf)).toBe(false);
    const report = maxScreenshotReport(
      screen({ max: { species: 'Azelf' }, heads: 5 }),
      context(THURSDAY, THURSDAY, { bosses: withAzelf }),
    );
    expect(report).toMatchObject({
      boss: { ref: { key: 'azelf' }, listed: true },
      tier: 'D5',
      tierFrom: 'list',
    });
    // Off the list it is still no boss: the game does not let it battle so.
    const unlisted = maxScreenshotReport(
      screen({ max: { species: 'Azelf' }, heads: 5 }),
      context(THURSDAY, THURSDAY, {
        bosses: withAzelf.filter((boss) => boss.entry?.key !== 'azelf'),
      }),
    );
    expect(unlisted.boss).toBeNull();
  });

  it('makes an observation of a listed Dynamax boss whose heads say another tier (plan 8X-J)', () => {
    const conflict = maxScreenshotReport(screen({ heads: 3 }), context(THURSDAY));
    expect(maxTierObservation(conflict, BOSSES, catalogue)).toEqual({
      family: 'max',
      bossKey: 'machop',
      listTier: 'D2',
      headsTier: 'D3',
    });
    const agrees = maxScreenshotReport(screen(), context(THURSDAY));
    expect(maxTierObservation(agrees, BOSSES, catalogue)).toBeUndefined();
    const giant = maxScreenshotReport(
      screen({ max: { form: 'gigantamax', species: 'Machamp' }, heads: 6 }),
      context(THURSDAY),
    );
    expect(maxTierObservation(giant, BOSSES, catalogue)).toBeUndefined();
    const unlisted = maxScreenshotReport(
      screen({ max: { species: 'Rattata' }, heads: 3 }),
      context(THURSDAY),
    );
    expect(maxTierObservation(unlisted, BOSSES, catalogue)).toBeUndefined();
  });

  it('takes Eternamax as a Gigantamax battle in all but its name', () => {
    const report = maxScreenshotReport(
      screen({ max: { form: 'eternamax', species: 'Machamp' }, heads: 6 }),
      context(THURSDAY),
    );
    expect(report).toMatchObject({
      form: 'eternamax',
      boss: { ref: { key: 'machamp' }, listed: true },
      tier: 'G',
      tierFrom: 'list',
    });
    expect(report.doubts).not.toContain('heads-boss-conflict');
  });

  describe('a boss the list has by its form, and Eternamax (review A1)', () => {
    /** The feed's ids for Gigantamax Toxtricity and Eternatus, with a Dynamax 4★ Toxtricity. */
    const FORMS: MaxBoss[] = maxBossesAt(
      parseMaxBossFeed(
        pokebattlerFeed({
          RAID_LEVEL_6_MAX: [
            { pokemonId: 'TOXTRICITY_AMPED_GIGANTAMAX' },
            { pokemonId: 'ETERNATUS' },
            { pokemonId: 'ETERNATUS_ETERNAMAX_FORM' },
          ],
          RAID_LEVEL_4_MAX: [{ pokemonId: 'TOXTRICITY' }],
        }),
        catalogue,
        { now: MAX_FEED_READ_AT, zone: ZONE },
      ).bosses.map((boss) => ({ ...boss, firstSeen: MAX_FEED_READ_AT })),
      [],
      catalogue,
      MAX_FEED_READ_AT,
    );
    const read = (max: Partial<MaxText>, heads: number | null) =>
      maxScreenshotReport(screen({ max, heads }), context(THURSDAY, THURSDAY, { bosses: FORMS }));

    it('takes the listed form of the species read, of the screen’s kind', () => {
      const giant = read({ form: 'gigantamax', species: 'Toxtricity' }, 6);
      expect(giant).toMatchObject({
        boss: { ref: { key: 'toxtricity_amped' }, listed: true },
        tier: 'G',
        tierFrom: 'list',
      });
      expect(giant.doubts).toEqual([]);
      expect(read({ form: 'dynamax', species: 'Toxtricity' }, 4)).toMatchObject({
        boss: { ref: { key: 'toxtricity' }, listed: true },
        tier: 'D4',
      });
    });

    it('finds Eternatus, which the game data lists for no max battle, as its Eternamax form', () => {
      for (const heads of [6, null]) {
        const eternamax = read({ form: 'eternamax', species: 'Eternatus' }, heads);
        expect(eternamax).toMatchObject({
          boss: { ref: { key: 'eternatus_eternamax' }, listed: true },
          tier: 'G',
          tierFrom: 'list',
        });
        expect(eternamax.doubts).not.toContain('no-boss');
      }
    });
  });

  it('caps a countdown that runs into the small hours at the day’s last battle', () => {
    // Taken at 20:30 with a countdown to 04:59: the all-day kind.
    const report = maxScreenshotReport(
      screen({ countdown: 8 * 3600 + 29 * 60 }),
      context('2026-10-22T20:30:30', '2026-10-22T20:30:00'),
    );
    expect(report).toMatchObject({
      end: at('2026-10-22T21:00:00'),
      countdownEnd: at('2026-10-23T04:59:00'),
      rotationEnd: false,
    });
    // An event's countdown to 15:00 is kept: it ends at a rotation.
    const event = maxScreenshotReport(screen({ countdown: 40 * 60 }), context('2026-10-22T14:20'));
    expect(event).toMatchObject({ end: at('2026-10-22T15:00'), rotationEnd: true });
  });

  it('ends an all-day Dynamax countdown at the start of a max event later that day, as /max does', () => {
    // Matt, 2026-10-24: on a Max Battle Day the day's spots show their countdown to about 05:00
    // in the morning too, but the event's bosses replace them at its start (Q-B).
    const day = {
      kind: 'max-battle' as const,
      name: 'Dynamax Uxie, Mesprit and Azelf Max Battle Day',
      start: at('2026-10-24T14:00'),
      end: at('2026-10-24T17:00'),
      short: true,
      hoursAssumed: false,
      featured: undefined,
      id: 'max-battle-day-2026-10-24',
    };
    const morning = maxScreenshotReport(
      screen({ countdown: 19 * 3600 + 59 * 60 }),
      context('2026-10-24T09:00:30', '2026-10-24T09:00:00', { events: [day] }),
    );
    expect(morning).toMatchObject({
      end: at('2026-10-24T14:00'),
      countdownEnd: at('2026-10-25T04:59'),
      rotationEnd: false,
    });
    // An event battle up early shows a countdown to its rotation, which is kept (Matt, 2026-10-24).
    const early = maxScreenshotReport(
      screen({ countdown: 40 * 60, max: { species: 'Machop' } }),
      context('2026-10-24T13:50', '2026-10-24T13:50', { events: [day] }),
    );
    expect(early).toMatchObject({ end: at('2026-10-24T14:30'), rotationEnd: true });
    // During the event its own countdown is kept; after it, the day's last battle again.
    const during = maxScreenshotReport(
      screen({ countdown: 20 * 60 }),
      context('2026-10-24T14:40', '2026-10-24T14:40', { events: [day] }),
    );
    expect(during).toMatchObject({ end: at('2026-10-24T15:00'), rotationEnd: true });
    const after = maxScreenshotReport(
      screen({ countdown: 11 * 3600 + 59 * 60 }),
      context('2026-10-24T17:00', '2026-10-24T17:00', { events: [day] }),
    );
    expect(after).toMatchObject({ end: at('2026-10-24T21:00') });
    // A Gigantamax battle is not a day's Dynamax battle: its countdown is capped as before.
    const giant = maxScreenshotReport(
      screen({ countdown: 19 * 3600 + 59 * 60, max: { form: 'gigantamax', species: 'Machamp' } }),
      context('2026-10-24T09:00:30', '2026-10-24T09:00:00', { events: [day] }),
    );
    expect(giant).toMatchObject({ end: at('2026-10-24T21:00') });
  });

  // Review S-4: a clock says the minute only, so its moment is up to 59 seconds early.
  it('ends a countdown at a whole minute: the next after a clock’s, the nearest after a file’s', () => {
    // Taken at 14:30:50 by a clock that says 14:30, with 29:10 to go: the 15:00 rotation.
    const byClock = maxScreenshotReport(
      screen({ clock: { hour: 2, minute: 30, confidence: 0.95 }, countdown: 29 * 60 + 10 }),
      context('2026-10-22T14:31:30', null),
    );
    expect(byClock).toMatchObject({
      timeFrom: 'clock',
      end: at('2026-10-22T15:00'),
      countdownEnd: at('2026-10-22T15:00'),
    });
    // A file's moment to the second: 14:30:40 and 29:19 to go end a second before 15:00.
    const byFile = maxScreenshotReport(
      screen({ countdown: 29 * 60 + 19 }),
      context('2026-10-22T14:31:30', '2026-10-22T14:30:40'),
    );
    expect(byFile).toMatchObject({ timeFrom: 'file', end: at('2026-10-22T15:00') });
    // 28:40 to go end at 14:59:20: the nearest whole minute is 14:59.
    const early = maxScreenshotReport(
      screen({ countdown: 28 * 60 + 40 }),
      context('2026-10-22T14:31:30', '2026-10-22T14:30:40'),
    );
    expect(early.end).toBe(at('2026-10-22T14:59'));
  });

  it('takes the default end of /max when the screen shows no countdown', () => {
    const report = maxScreenshotReport(screen({ countdown: null }), context(THURSDAY));
    expect(report).toMatchObject({
      end: at('2026-10-22T21:00'),
      endFrom: 'default',
      rotationEnd: false,
    });
    expect(report.doubts).toContain('no-time');
  });

  it('is sure of the moment by a file name or a clock read surely, never a guess', () => {
    const sure = (clock: ScreenText['clock'], taken: string | null) =>
      maxScreenshotReport(screen({ clock }), context(THURSDAY, taken)).sureMoment;
    expect(sure(null, THURSDAY)).toBe(true);
    expect(sure({ hour: 1, minute: 59, confidence: 0.9 }, null)).toBe(true);
    expect(sure({ hour: 1, minute: 59, confidence: 0.5 }, null)).toBe(false);
    expect(sure(null, null)).toBe(false);
    // The file and a clock read surely disagree: the clock is used, but not sure.
    expect(sure({ hour: 1, minute: 50, confidence: 0.9 }, THURSDAY)).toBe(false);
  });

  it('says whether the Power Spot’s name was read surely', () => {
    const poorly = maxScreenshotReport(screen({ max: { spotConfidence: 0.7 } }), context(THURSDAY));
    expect(poorly.spot.readSurely).toBe(false);
    expect(poorly.doubts).toContain('spot-read-poorly');
  });
});

describe('decideMax', () => {
  /** Decided at its upload, as every caller but "Read screenshot" decides. */
  const atUpload = (uploaded: string) => ({ now: at(uploaded), uploadedAt: at(uploaded) });
  const decided = (
    shot: ReturnType<typeof screen>,
    uploaded: string,
    taken: string | null = uploaded,
  ) => decideMax(maxScreenshotReport(shot, context(uploaded, taken)), atUpload(uploaded));

  it('reports a clear battle with what it knows', () => {
    expect(decided(screen(), THURSDAY)).toEqual({
      kind: 'report',
      battle: {
        spotId: 'w1',
        boss: { key: 'machop' },
        tier: 'D2',
        end: at('2026-10-22T14:30'),
        takenAt: at(THURSDAY),
        sureMoment: true,
        rotationEnd: true,
        capped: false,
        timeUncertain: false,
      },
      doubts: [],
    });
    const guessed = decided(screen(), THURSDAY, null);
    expect(guessed).toMatchObject({ kind: 'report', battle: { timeUncertain: true } });
  });

  it('takes a dated file as the moment however old it is: stale, but no guess (A5)', () => {
    // Taken at 12:00 by its name, posted at 14:00, its countdown to 15:00.
    const old = maxScreenshotReport(
      screen({ countdown: 3 * 3600 }),
      context('2026-10-22T14:00', '2026-10-22T12:00'),
    );
    expect(old.doubts).toContain('time-stale');
    expect(decideMax(old, atUpload('2026-10-22T14:00'))).toMatchObject({
      kind: 'report',
      battle: { sureMoment: true, timeUncertain: false, end: at('2026-10-22T15:00') },
    });
  });

  it('refuses a screen that is no max battle’s', () => {
    expect(decided(screen({ max: null }), THURSDAY)).toEqual({
      kind: 'refuse',
      reason: 'not-a-max-screen',
    });
  });

  it('refuses a screenshot taken at or after the last battle, not one a minute before', () => {
    expect(decided(screen(), '2026-10-22T21:00:00')).toEqual({
      kind: 'refuse',
      reason: 'over-for-today',
    });
    expect(decided(screen(), '2026-10-22T21:05:30', '2026-10-22T21:05:00')).toMatchObject({
      reason: 'over-for-today',
    });
    expect(decided(screen(), '2026-10-22T20:59:00')).toMatchObject({
      kind: 'report',
      battle: { end: at('2026-10-22T21:00') },
    });
  });

  it('refuses a capped end that passed before the upload with the over-for-today words (M2)', () => {
    // Taken at 20:50, posted at 21:05, its countdown to 04:59.
    expect(
      decided(screen({ countdown: 8 * 3600 + 9 * 60 }), '2026-10-22T21:05', '2026-10-22T20:50'),
    ).toEqual({ kind: 'refuse', reason: 'over-for-today' });
  });

  it('says an end capped at the last battle as capped, for the check before reporting (R11)', () => {
    // Taken at 20:00, its countdown to 04:59: capped at 21:00.
    expect(decided(screen({ countdown: 8 * 3600 + 59 * 60 }), '2026-10-22T20:00')).toMatchObject({
      kind: 'report',
      battle: { end: at('2026-10-22T21:00'), capped: true },
    });
    // Without a countdown the default end of the day's last battle is no less the day's end; one
    // that passed before the upload is over for today.
    expect(
      decided(screen({ countdown: null }), '2026-10-22T20:00', '2026-10-22T20:00'),
    ).toMatchObject({ kind: 'report', battle: { capped: true } });
    const late = maxScreenshotReport(
      screen({ countdown: null }),
      context('2026-10-22T21:05', '2026-10-22T20:50'),
    );
    expect(decideMax(late, atUpload('2026-10-22T21:05'))).toEqual({
      kind: 'refuse',
      reason: 'over-for-today',
    });
  });

  it('refuses a battle its countdown says is over', () => {
    expect(decided(screen({ countdown: 10 * 60 }), '2026-10-22T14:15', '2026-10-22T14:00')).toEqual(
      { kind: 'refuse', reason: 'battle-over' },
    );
  });

  it('refuses a countdown that ends before the first battle or at it, not one that ends after', () => {
    for (const minutes of [29, 30]) {
      expect(decided(screen({ countdown: minutes * 60 }), '2026-10-22T05:30')).toEqual({
        kind: 'refuse',
        reason: 'before-first',
      });
    }
    expect(decided(screen({ countdown: 31 * 60 }), '2026-10-22T05:30')).toMatchObject({
      kind: 'report',
      battle: { end: at('2026-10-22T06:01') },
    });
  });

  it('refuses a spot it does not know, saying whether the name was read surely', () => {
    expect(decided(screen({ max: { powerSpot: 'HARBOR SIGNAL TOWER' } }), THURSDAY)).toEqual({
      kind: 'refuse',
      reason: 'no-spot',
      read: 'HARBOR SIGNAL TOWER',
      readSurely: true,
    });
    expect(
      decided(screen({ max: { powerSpot: 'HARBOR SIGNAL TOWER', spotConfidence: 0.6 } }), THURSDAY),
    ).toMatchObject({ reason: 'no-spot', readSurely: false });
  });

  it('refuses a boss it cannot tell', () => {
    expect(decided(screen({ max: { species: 'Qwxyz' } }), THURSDAY)).toEqual({
      kind: 'refuse',
      reason: 'no-boss',
    });
  });

  it('asks which spot when it is not clear, then decides again with the one chosen', () => {
    const report = maxScreenshotReport(
      screen({ max: { powerSpot: 'MAPLE BENCH' } }),
      context(THURSDAY),
    );
    const asked = decideMax(report, atUpload(THURSDAY));
    expect(asked).toMatchObject({ kind: 'ask', about: 'spot' });
    expect(asked.kind === 'ask' && asked.about === 'spot' && asked.spots.map((s) => s.id)).toEqual([
      'w2',
      'w3',
    ]);
    const chosen = decideMax(withSpot(report, SPOTS[2] as SpotTitle), atUpload(THURSDAY));
    expect(chosen).toMatchObject({ kind: 'report', battle: { spotId: 'w3' } });
  });

  // Plan 7M, review F4: a max screen without a countdown gets `/max`'s default end, counted
  // from the read: one decided a while after its upload is refused instead.
  describe('a screen without a countdown, decided a while after its upload', () => {
    const MINUTE = 60_000;
    const untimed = () => maxScreenshotReport(screen({ countdown: null }), context(THURSDAY));
    const decidedAfter = (report: ReturnType<typeof untimed>, minutes: number) =>
      decideMax(report, { now: at(THURSDAY) + minutes * MINUTE, uploadedAt: at(THURSDAY) });

    it('is refused eleven minutes after its upload', () => {
      expect(decidedAfter(untimed(), 11)).toEqual({ kind: 'refuse', reason: 'untimed-old' });
    });

    it('is reported as before at its upload and nine minutes after', () => {
      const atUpload = decidedAfter(untimed(), 0);
      expect(atUpload).toMatchObject({ kind: 'report', battle: { end: at('2026-10-22T21:00') } });
      expect(decidedAfter(untimed(), 9)).toEqual(atUpload);
    });

    it('is reported with an end typed beside it, or with a countdown, however late', () => {
      const typed = withMaxTyped(untimed(), { end: at('2026-10-22T15:00') });
      expect(decidedAfter(typed, 11)).toMatchObject({ kind: 'report' });
      const timed = maxScreenshotReport(screen(), context(THURSDAY));
      expect(decidedAfter(timed, 11)).toMatchObject({ kind: 'report' });
    });
  });

  it('asks the tier when only the tier is missing', () => {
    expect(decided(screen({ max: { species: 'Kingler' }, heads: null }), THURSDAY)).toMatchObject({
      kind: 'ask',
      about: 'tier',
    });
  });
});
