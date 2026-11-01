import type { RaidBossRef } from '../party/party.js';
import type { PokemonCatalogue } from '../pogo/catalogue.js';
import type { PokemonEntry } from '../pogo/game-master.js';
import { typedMaxBoss } from '../pogo/max-boss-list.js';
import type { MaxBoss } from '../pogo/max-bosses.js';
import type { MaxTier } from '../pogo/max-tier.js';
import type { BigEvent, MaxEvent } from '../time/max-events.js';
import {
  dayBattleEnd,
  defaultMaxEnd,
  firstBattleOn,
  lastBattleOn,
  type BattleHours,
} from '../time/max-end.js';
import { matchPowerSpot, type SpotMatch, type SpotTitle } from './power-spot-match.js';
import type { MaxForm } from './raid-screen.js';
import {
  CLOCK_SURE,
  nameSimilarity,
  screenshotMoment,
  type MomentContext,
  type ReadScreen,
  type ScreenshotMoment,
} from './screenshot-report.js';

/**
 * What Pine makes of a max battle's screenshot (design `2026-10-22-max-battle-screenshots-design.md`,
 * sections 3 to 5): the form, the boss and its tier, the Power Spot, the moment it was taken and
 * the battle's end, each beside what it was made from, and the doubts. A report of its own beside
 * the raid's (`ScreenshotReport`), whose decision is `decideMax` (`max-decision.ts`). Pure: the
 * boss list, the Pokémon search, the Power Spots and the clock are given.
 */

/**
 * Why a member should look at a max report:
 * - `not-a-max-screen`: the reader found no max battle's boss line;
 * - `no-spot`: no Power Spot is even 80% alike the name read (or none was read); `spot-unclear`:
 *   several may be it; `spot-read-poorly`: its line was read with less than `SPOT_SURE`;
 * - `no-boss`: no Pokémon that battles so was found by the name read;
 * - `boss-unlisted`: a Pokémon the boss list does not have in that kind, its tier from the heads
 *   or the form; `tier-unknown`: a Dynamax boss on no list whose heads were not read;
 * - `heads-boss-conflict`: the listed boss has another tier than the heads say (the list's kept);
 * - `heads-form-conflict`: six heads on a Dynamax screen, or one to five on a Gigantamax one;
 * - `no-time`: no countdown (the end is `/max`'s default); the moment's doubts as a raid's.
 */
export type MaxDoubt =
  | 'not-a-max-screen'
  | 'no-spot'
  | 'spot-unclear'
  | 'spot-read-poorly'
  | 'no-boss'
  | 'boss-unlisted'
  | 'tier-unknown'
  | 'heads-boss-conflict'
  | 'heads-form-conflict'
  | 'no-time'
  | 'time-guessed'
  | 'time-stale'
  | 'time-sources-differ';

export interface MaxReportContext extends MomentContext {
  /** The max bosses in effect (`ctx.maxBosses.bosses()`; Gigantamax listed apart, tier `G`). */
  bosses: readonly MaxBoss[];
  /**
   * The Pokémon a name read fits best (the Pokémon search) among those `among` keeps, or among
   * every Pokémon without it; undefined for none.
   */
  pokemon: (read: string, among?: (entry: PokemonEntry) => boolean) => PokemonEntry | undefined;
  /** Whether the game lets a Pokémon off the list battle so (`typedMaxBoss`). */
  catalogue: Pick<PokemonCatalogue, 'canDynamax' | 'canGigantamax'>;
  /** The server's Power Spots, those of the channel's region marked `local`. */
  spots: readonly SpotTitle[];
  /** `settings.maxBattles`. */
  hours: BattleHours;
  /** The max and big events known, for `/max`'s default end of a screen without a countdown. */
  events: readonly MaxEvent[];
  big: readonly BigEvent[];
}

export interface MaxScreenshotReport {
  /** Null on a screen that is no max battle's. */
  form: MaxForm | null;
  /** The species as read. */
  speciesRead: string | null;
  /** The boss: of the list (`listed`), else the Pokémon found that battles so; null for neither. */
  boss: { ref: RaidBossRef; name: string; listed: boolean } | null;
  heads: number | null;
  tier: MaxTier | null;
  /** The tier came from the boss list, the heads, or the form (Gigantamax has one tier). */
  tierFrom: 'list' | 'heads' | 'form' | null;
  spot: {
    /** The Power Spot's name as read. */
    read: string | null;
    /** Its line was read with at least `SPOT_SURE`: a name Pine does not know is worth a note. */
    readSurely: boolean;
    match: SpotMatch;
  };
  clock: { hour: number; minute: number } | null;
  countdown: number | null;
  takenAt: number;
  timeFrom: ScreenshotMoment['timeFrom'];
  /**
   * The moment is known (review R9): by the file's name, or a clock read surely
   * (`CLOCK_SURE`), and they do not disagree; never guessed.
   */
  sureMoment: boolean;
  /**
   * When the countdown ends, `takenAt` + `countdown` at a whole minute (`wholeMinute`), uncapped;
   * null without a countdown.
   */
  countdownEnd: number | null;
  /**
   * The battle's end: the countdown's capped at the last battle time of the day it was taken (a
   * Dynamax one's at the start of a max event later that day, `dayBattleEnd`), or
   * without a countdown `/max`'s default end (`defaultMaxEnd`); null when that day's battles are
   * over by the moment it was taken.
   */
  end: number | null;
  /** `typed`: the member's `end:` (`withMaxTyped`). */
  endFrom: 'countdown' | 'default' | 'typed' | null;
  /**
   * The countdown ends at a rotation: before the last battle time of the day it was taken (an
   * event's, say 15:00), not the all-day kind that runs to about 05:00 the next day.
   */
  rotationEnd: boolean;
  /** The first and the last battle time of the day it was taken. */
  firstBattle: number;
  lastBattle: number;
  doubts: MaxDoubt[];
}

/** A Power Spot's line read with at least this confidence was read surely (design 3: about 0.9). */
export const SPOT_SURE = 0.9;

/**
 * How far before the upload a clock is looked for, and beyond which a file's time is doubted as
 * stale: as a standard raid's egg and battle (60 and 45 minutes) with a margin, an hour and a half.
 */
export const MAX_SCREENSHOT_AGE_MS = 90 * 60_000;

/** A boss of the list that is not known to the catalogue is named so alike at least. */
const LISTED_NAME_ALIKE = 0.9;

/** Gigantamax and Eternamax battles are tier `G`; Dynamax battles have stars. */
const isGiant = (form: MaxForm): boolean => form !== 'dynamax';

/** A boss of the list in its Eternamax form (`ETERNATUS_ETERNAMAX`). */
const isEternamax = (boss: MaxBoss): boolean => boss.entry?.form?.endsWith('_ETERNAMAX') === true;

/**
 * The listed boss of a screen among those of its kind and species (`ofKind`, review A1): the read
 * name says the species only, so the list's form of it is taken. Each step keeps those that pass
 * it, unless none does: the Eternamax form on an Eternamax screen and on no other, then the tier
 * the heads say, then the very entry read; the first of what is left.
 */
function listedBoss(
  ofKind: readonly MaxBoss[],
  form: MaxForm,
  headsTier: MaxTier | undefined,
  entry: PokemonEntry | undefined,
): MaxBoss | undefined {
  let left = ofKind;
  const narrow = (keep: (boss: MaxBoss) => boolean): void => {
    const kept = left.filter(keep);
    if (kept.length > 0) left = kept;
  };
  narrow((boss) => isEternamax(boss) === (form === 'eternamax'));
  if (headsTier) narrow((boss) => boss.tier === headsTier);
  if (entry) narrow((boss) => boss.entry?.key === entry.key);
  return left[0];
}

const MINUTE = 60_000;

/**
 * A countdown's end at a whole minute, as battles end (review S-4): the next one when the moment
 * came from a clock, which says the minute only, so that the moment is up to 59 seconds early (a
 * clock's 14:30 and 29:10 to go end at 15:00); else the nearest (a file's moment is to the second).
 */
function wholeMinute(time: number, byClock: boolean): number {
  return (byClock ? Math.ceil(time / MINUTE) : Math.round(time / MINUTE)) * MINUTE;
}

/** The tier the heads say for the form; undefined for a count the form cannot have. */
function tierOfHeads(heads: number, form: MaxForm): MaxTier | undefined {
  if (isGiant(form)) return heads === 6 ? 'G' : undefined;
  return heads >= 1 && heads <= 5 ? (`D${String(heads)}` as MaxTier) : undefined;
}

export function maxScreenshotReport(
  reading: ReadScreen,
  context: MaxReportContext,
): MaxScreenshotReport {
  const { text } = reading;
  const max = text.max ?? null;
  const doubts = new Set<MaxDoubt>();
  if (!max) doubts.add('not-a-max-screen');
  const heads = reading.heads && reading.heads.count > 0 ? reading.heads.count : null;
  const form = max?.form ?? null;

  // The boss, as `/max` decides it (`typedMaxBoss`; Matt, 2026-10-25): the list's of the form's
  // kind first, else a Pokémon the game lets battle so at the tier the screen shows.
  let boss: MaxScreenshotReport['boss'] = null;
  let tier: MaxTier | null = null;
  let tierFrom: MaxScreenshotReport['tierFrom'] = null;
  if (max && form) {
    const giant = isGiant(form);
    const headsTier = heads === null ? undefined : tierOfHeads(heads, form);
    if (heads !== null && !headsTier) doubts.add('heads-form-conflict');
    const typedOf = (one: PokemonEntry) => typedMaxBoss(one, context.bosses, context.catalogue);
    // The name read is looked for among the max bosses `/max` takes: on the list (also before
    // the game master has it as one: Azelf at 5★, Matt 2026-10-24) or let battle so by the game,
    // and a species the list has in any form (the screen shows the species alone). On an
    // Eternamax screen among every Pokémon: the game data lists Eternatus for no max battle
    // (`BREAD_SPECIAL_MODE`, review A1).
    const maxBoss = (one: PokemonEntry): boolean => {
      const typed = typedOf(one);
      return (
        typed.listed.length > 0 ||
        typed.others.length > 0 ||
        context.bosses.some((listed) => listed.entry?.dex === one.dex)
      );
    };
    const entry =
      form === 'eternamax' ? context.pokemon(max.species) : context.pokemon(max.species, maxBoss);
    // Of the species read, whichever form the list has (a Gigantamax Toxtricity listed as Amped).
    const ofKind = context.bosses.filter(
      (one) =>
        (one.tier === 'G') === giant &&
        (entry
          ? one.entry?.dex === entry.dex
          : !one.entry && nameSimilarity(one.name, max.species) >= LISTED_NAME_ALIKE),
    );
    const listed = listedBoss(ofKind, form, headsTier, entry);
    if (listed) {
      boss = {
        ref: listed.entry ? { key: listed.entry.key } : { name: listed.name },
        name: listed.name,
        listed: true,
      };
      tier = listed.tier;
      tierFrom = 'list';
      if (heads !== null && headsTier !== listed.tier) doubts.add('heads-boss-conflict');
    } else {
      // Off the list: only in a tier of the screen's kind that `/max` takes it in (`others`).
      const others = entry ? typedOf(entry).others.filter((one) => (one === 'G') === giant) : [];
      if (entry && others.length > 0) {
        boss = { ref: { key: entry.key }, name: entry.name, listed: false };
        doubts.add('boss-unlisted');
        if (giant) {
          tier = 'G';
          tierFrom = 'form';
        } else if (headsTier && others.includes(headsTier)) {
          tier = headsTier;
          tierFrom = 'heads';
        } else doubts.add('tier-unknown');
      } else doubts.add('no-boss');
    }
  }

  // The Power Spot.
  const spotRead = max?.powerSpot ?? null;
  const readSurely = (max?.spotConfidence ?? 0) >= SPOT_SURE;
  const match = matchPowerSpot(spotRead, context.spots);
  if (max) {
    if (match.kind === 'unknown') doubts.add('no-spot');
    if (match.kind === 'candidates') doubts.add('spot-unclear');
    if (spotRead !== null && !readSurely) doubts.add('spot-read-poorly');
  }

  // The moment, as a raid's, and the end.
  const moment = screenshotMoment(text.clock, context, MAX_SCREENSHOT_AGE_MS);
  for (const doubt of moment.doubts) doubts.add(doubt);
  const sureMoment =
    (moment.timeFrom === 'file' ||
      (moment.timeFrom === 'clock' && (text.clock?.confidence ?? 0) >= CLOCK_SURE)) &&
    !moment.doubts.includes('time-sources-differ');
  const { takenAt } = moment;
  const firstBattle = firstBattleOn(takenAt, context.hours, context.zone);
  const lastBattle = lastBattleOn(takenAt, context.hours, context.zone);
  let countdownEnd: number | null = null;
  let end: number | null = null;
  let endFrom: MaxScreenshotReport['endFrom'] = null;
  if (text.countdown !== null) {
    countdownEnd = wholeMinute(takenAt + text.countdown * 1000, moment.timeFrom === 'clock');
    // A Dynamax battle of the day, its countdown the all-day kind to about 05:00, ends where a max
    // event later that day begins (Q-B, as `/max`'s default: Matt, 2026-10-24); a countdown to a
    // rotation (an event's battle up early) is the game's own end and kept.
    const allDay = countdownEnd >= lastBattle;
    const cut =
      allDay && !(form !== null && isGiant(form))
        ? dayBattleEnd(context.events, takenAt, lastBattle)
        : lastBattle;
    end = Math.min(countdownEnd, cut);
    endFrom = 'countdown';
  } else {
    doubts.add('no-time');
    const byDefault = defaultMaxEnd({
      tier: tier ?? (form && isGiant(form) ? 'G' : 'D1'),
      at: takenAt,
      events: context.events,
      big: context.big,
      hours: context.hours,
      zone: context.zone,
    });
    if (byDefault.kind === 'end') {
      end = byDefault.end;
      endFrom = 'default';
    }
  }

  return {
    form,
    speciesRead: max?.species ?? null,
    boss,
    heads,
    tier,
    tierFrom,
    spot: { read: spotRead, readSurely, match },
    clock: text.clock ? { hour: text.clock.hour, minute: text.clock.minute } : null,
    countdown: text.countdown,
    takenAt,
    timeFrom: moment.timeFrom,
    sureMoment,
    countdownEnd,
    end,
    endFrom,
    rotationEnd: countdownEnd !== null && countdownEnd < lastBattle,
    firstBattle,
    lastBattle,
    doubts: [...doubts],
  };
}
