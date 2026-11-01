import { distance } from 'fastest-levenshtein';
import { bossAtTier } from '../pogo/boss-at-tier.js';
import { raidBossCp } from '../pogo/cp.js';
import type { PokemonEntry } from '../pogo/game-master.js';
import type { RaidBoss } from '../pogo/raid-bosses.js';
import {
  bossStamina,
  raidTier,
  SHADOW_RAID_LEVELS,
  type RaidLevel,
  type RaidTier,
} from '../pogo/raid-tier.js';
import { addDays, zoned } from '../time/zoned.js';
import type { ScreenText } from './raid-screen.js';
import { SHADOW_SHARE } from './shadow.js';
import type { HeadCount } from './tier-heads.js';

/**
 * What Pine makes of a screenshot that was read: the gym, egg or hatched, the tier, the boss and
 * the time, each beside what it was made from, so that a member can be shown both and say which
 * is wrong, and the doubts that a member should confirm before a raid is made of it. Pure: the
 * gym search, the boss list and the clock are given.
 */

/** What the report needs of a reading (`ScreenReading` of the reading process). */
export interface ReadScreen {
  text: ScreenText;
  heads: HeadCount | null;
  purple: number;
}

/** What the report needs of a hit of the gym search (`GymHit`). */
export interface GymHitLike {
  gym: { id: number; name: string };
  place: 'local' | 'neighbouring' | 'anywhere';
  allWords: boolean;
  corrected: boolean;
}

export interface ReportContext {
  /** The raid bosses in effect (`ctx.raidBosses.bosses()`). */
  bosses: readonly RaidBoss[];
  /**
   * Every Pokémon of the game data (`catalogue.all`): a boss the list does not have yet is looked
   * for among them by its CP at the heads' tier (`unlistedBossOf`).
   */
  pokemon: readonly PokemonEntry[];
  /** The gym search where the screenshot was posted, by names only, this server's gyms only. */
  searchGym: (text: string) => readonly GymHitLike[];
  /** When the screenshot reached Discord: the message's own time. */
  uploadedAt: number;
  /** `settings.timezone`: the zone of the phone's clock. */
  zone: string;
  /** Minutes an egg of a standard raid incubates and the raid lasts (settings). */
  standardIncubate: number;
  standardHatched: number;
  /** The longest a hatched raid lasts, in minutes (`settings.maxRaidHatchedDuration`). */
  maxHatched: number;
  /** Seconds before the upload a screenshot without a usable clock is taken to be from. */
  guessOffsetSeconds: number;
  /**
   * When the screenshot was taken by the name of its file (`takenAtFromFileName`): an Android
   * phone names it by the moment, to the second. It is the time unless a clock was read that it
   * contradicts by more than two minutes, or it is ahead of the upload; older than the clock's
   * window, the screenshot is doubted as stale (posted again later).
   */
  fileTakenAt?: number;
}

/**
 * Why a member should look at a report before a raid is made of it:
 * - `not-a-raid-screen`: no countdown, or neither heads nor a boss named by its CP;
 * - `no-gym`, `gym-unclear`: no gym found, or not one clear hit of the name read;
 * - `no-time`: no countdown; `time-guessed`: from the upload, no usable clock;
 * - `time-stale`: the clock is more than a quarter of an hour before the upload, or the name of
 *   the file says it was taken longer ago than the clock could;
 * - `time-sources-differ`: the name of the file and the clock read say other times (the clock
 *   won when it was read surely, the file otherwise);
 * - `time-past`: the hatch or end lies before the upload;
 * - `countdown-long`: longer than an egg incubates or a raid lasts;
 * - `stage-unknown`: neither egg nor hatched could be told;
 * - `tier-unknown`; `heads-unverified`: 6 or 7 heads, a count no sample has shown yet;
 * - `heads-only`: a hatched raid's tier from its heads alone (the boss may hide a head);
 * - `heads-uncertain`: a place just outside the row of heads looks like a head too (a head at
 *   the end of the row may have been missed);
 * - `heads-boss-conflict`: the boss named by the CP has another tier than the heads say;
 * - `boss-unknown`: hatched, and no boss decided; `boss-from-name`: by the name alone;
 * - `boss-unlisted`: a Pokémon the boss list does not have, by its CP at the heads' tier and its
 *   name, as `/raid` takes it with that tier typed before it (`UnlistedRaidBoss`);
 * - `boss-name-differs`: the boss the CP names is not what the name under it says;
 * - `elite`: an elite raid, which is rare (Matt: it loses every conflict);
 * - `shadow-unlisted`: the purple says shadow (or not) and no current boss of that tier is;
 * - `shadow-differs`: the boss named by the CP or the name is a shadow and the purple says not,
 *   or the other way round (a shadow and a plain boss of one tier have one CP).
 */
export type ReportDoubt =
  | 'not-a-raid-screen'
  | 'no-gym'
  | 'gym-unclear'
  | 'no-time'
  | 'time-guessed'
  | 'time-stale'
  | 'time-sources-differ'
  | 'time-past'
  | 'countdown-long'
  | 'stage-unknown'
  | 'tier-unknown'
  | 'heads-unverified'
  | 'heads-only'
  | 'heads-uncertain'
  | 'heads-boss-conflict'
  | 'boss-unknown'
  | 'boss-from-name'
  | 'boss-unlisted'
  | 'boss-name-differs'
  | 'elite'
  | 'shadow-unlisted'
  | 'shadow-differs';

/**
 * A Pokémon the boss list does not have, as the boss of a raid of `tier` (`bossAtTier`'s
 * `unlisted`): what `/raid t5 azelf` reports while the feed has not listed Azelf yet.
 */
export interface UnlistedRaidBoss {
  listed: false;
  /** The catalogue key, as a listed boss's that the game master knows. */
  key: string;
  name: string;
  tier: RaidTier;
  entry: PokemonEntry;
}

/** The boss of a report: of the list, or a Pokémon it does not have (`UnlistedRaidBoss`). */
export type ReportBoss = RaidBoss | UnlistedRaidBoss;

export const isUnlisted = (boss: ReportBoss): boss is UnlistedRaidBoss => 'listed' in boss;

export interface ScreenshotReport {
  gym: {
    /** The gym's name as read. */
    read: string | null;
    /** The part of it whose search decided. */
    searched: string | null;
    gymId: number | null;
    place: GymHitLike['place'] | null;
    /** One gym had every word of a long enough part, without a misspelling. */
    clear: boolean;
  };
  /** Egg (a CP-less screen with its countdown centred), hatched (a CP, or the countdown at the right). */
  stage: 'egg' | 'hatched' | null;
  heads: number | null;
  tier: RaidTier | null;
  /** The tier came from the boss that the CP named, or from the heads. */
  tierFrom: 'boss' | 'heads' | null;
  cp: number | null;
  bossName: string | null;
  boss: ReportBoss | null;
  bossFrom: 'cp' | 'cp-and-name' | 'name' | null;
  eliteBadge: boolean;
  purple: number;
  clock: { hour: number; minute: number } | null;
  countdown: number | null;
  /** When the screenshot was taken: by its file's name, its clock, or guessed from the upload. */
  takenAt: number;
  /** What `takenAt` was taken from. */
  timeFrom: 'file' | 'clock' | 'upload';
  /** When the egg hatches, or the hatched raid ends; null without a countdown and a stage. */
  time: { hatch: number } | { end: number } | null;
  doubts: ReportDoubt[];
}

/** The tier of each count of heads: the game shows the tier's number. */
const TIER_OF_HEADS: Readonly<Record<number, RaidLevel>> = {
  1: 'T1',
  3: 'T3',
  4: 'Mega',
  5: 'T5',
  6: 'MegaLegendary',
  7: 'SuperMega',
};
/** Counts the samples have shown; others are taken from the game's tier numbers. */
const SEEN_HEADS = new Set([1, 3, 4, 5]);
/** The phone's clock may be ahead of the upload by this much (clocks differ). */
const CLOCK_AHEAD_MS = 2 * 60_000;
/** A clock older than this before the upload is used, but doubted. */
const STALE_MS = 15 * 60_000;
/** Of bosses with one CP, a name decides when it is this much more similar than the next. */
const NAME_MARGIN = 0.2;
/** A boss by its name alone: at least this similar, and this much more than the next. */
const NAME_ALONE = 0.9;
const NAME_ALONE_MARGIN = 0.15;
/**
 * A place just outside a row of heads that matches this well is a head the row may have missed:
 * beside the rows of the research's samples the best was 0.49, a head itself matches 0.67 and
 * more.
 */
const HEAD_OUTSIDE = 0.55;
/** A name read under the CP that is less like the boss the CP names than this is doubted. */
const NAME_DIFFERS = 0.4;
/** Words a raid screen leaves out of a boss's name: it shows the species alone. */
const NAME_PREFIXES = /^(?:mega|primal|shadow|alolan|galarian|hisuian|paldean)\s+/i;

/** 0 to 1: how alike two names are (Levenshtein over letters, case ignored). */
export function nameSimilarity(a: string, b: string): number {
  const x = a.toLowerCase().replace(/[^a-z]/g, '');
  const y = b.toLowerCase().replace(/[^a-z]/g, '');
  if (x.length === 0 || y.length === 0) return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}

/**
 * How alike a name read on the screen is to a boss: its name as the catalogue has it, without
 * the form in brackets ("Landorus (Incarnate Forme)"), and without the words a raid screen may
 * leave out ("Mega Blastoise", "Mega Charizard X"); the best of them.
 */
export function bossNameSimilarity(read: string, boss: Pick<RaidBoss, 'name'>): number {
  const bare = boss.name.replace(/\s*\(.*\)\s*$/, '');
  const species = bare.replace(NAME_PREFIXES, '').replace(/\s+[XY]$/, '');
  return Math.max(...[boss.name, bare, species].map((name) => nameSimilarity(read, name)));
}

/** Two names alike but for case, spaces and punctuation. */
function sameName(a: string, b: string): boolean {
  const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return plain(a) === plain(b);
}

/**
 * The gym of the text read: the whole text first; then without one or two leading words (text
 * on the gym's picture runs into the name), then without trailing words (a name the screen
 * cut). The first try that is clear wins: exactly one hit has every word without a misspelling
 * (as `clearGymHit`), and the try has at least two words and half the words read, so that one
 * common word ("Church") cannot decide. Else the first try whose top hit has every word, else the
 * whole text's top hit (of several gyms with every word, the one called exactly that): a
 * screenshot report takes it without asking (Matt, 2026-10-11), and says it was not clear.
 * When none is clear, the words of `below` (`ScreenText.gymBelow`) that look like a name's are
 * added and tried the same way (Matt, 2026-10-24: "Pittsburgh Campsite -" and "Outgoing").
 */
export function gymOfText(
  text: string | null,
  search: ReportContext['searchGym'],
  below?: string | null,
): ScreenshotReport['gym'] {
  const none = { read: text, searched: null, gymId: null, place: null, clear: false };
  if (!text) return none;
  const words = text.split(/\s+/).filter(Boolean);
  const tries = gymTries(words, search);
  const more = (below ?? '').split(/\s+/).filter((word) => NAME_LIKE.test(word));
  const clear =
    tries.find((t) => t.clear) ??
    (more.length > 0 ? gymTries([...words, ...more], search).find((t) => t.clear) : undefined);
  if (clear?.clear) {
    return {
      read: text,
      searched: clear.searched,
      gymId: clear.clear.gym.id,
      place: clear.clear.place,
      clear: true,
    };
  }
  const chosen = tries.find((t) => t.top?.allWords) ?? tries[0];
  if (!chosen?.top) return none;
  return {
    read: text,
    searched: chosen.searched,
    gymId: chosen.top.gym.id,
    place: chosen.top.place,
    clear: false,
  };
}

/** A word of a line under a gym's name that may be the name's: a capitalized word, or a number. */
const NAME_LIKE = /^(?:[A-Z][a-z]+|\d{2,})$/;

/**
 * The tries of `gymOfText` for these words: the whole text, then without one or two leading
 * words, then without trailing words; each with its top hit and its one clear hit, if any.
 */
function gymTries(words: readonly string[], search: ReportContext['searchGym']) {
  const variants = [words];
  for (let i = 1; i < Math.min(3, words.length); i++) variants.push(words.slice(i));
  for (let i = 1; i < Math.floor(words.length / 2); i++) variants.push(words.slice(0, -i));
  return variants.map((part) => {
    const hits = search(part.join(' '));
    const sure = hits.filter((hit) => hit.allWords && !hit.corrected);
    // Of several sure hits, the one gym whose whole name it is ("Temple Sinai" beside "Temple
    // Sinai Garden") is taken, but not as clear: the rest of a longer name may be cut off.
    const named = sure.filter((hit) => sameName(hit.gym.name, part.join(' ')));
    const longEnough = part.length >= Math.min(2, words.length) && part.length * 2 >= words.length;
    return {
      searched: part.join(' '),
      top: named.length === 1 && sure.length > 1 ? named[0] : hits[0],
      clear: longEnough && sure.length === 1 ? sure[0] : undefined,
    };
  });
}

/**
 * When the screenshot was taken by its clock: the clock read as either half of the day when it
 * could be a 12-hour clock, on the day of the upload or the day before, the latest such time
 * that is not after the upload (allowing for clocks a little ahead) and not older than
 * `maxAgeMs`. Undefined when none fits: the clock is then not used.
 */
export function clockTime(
  clock: { hour: number; minute: number },
  uploadedAt: number,
  zone: string,
  maxAgeMs: number,
): number | undefined {
  const hours =
    clock.hour >= 1 && clock.hour <= 12 ? [clock.hour % 12, (clock.hour % 12) + 12] : [clock.hour];
  const upload = zoned(uploadedAt, zone);
  let best: number | undefined;
  for (const day of [upload, addDays(upload, -1)]) {
    for (const hour of hours) {
      const at = day.with({ hour, minute: clock.minute, second: 0, millisecond: 0 });
      // A time the clocks skip (spring forward) does not exist on that day.
      if (at.hour !== hour) continue;
      // A time the clocks repeat (fall back) is two moments an hour apart: both are tried.
      const earlier = zoned(at.epochMilliseconds - 3_600_000, zone);
      const moments = [at.epochMilliseconds];
      if (earlier.hour === hour && earlier.minute === clock.minute)
        moments.push(earlier.epochMilliseconds);
      for (const ms of moments) {
        if (ms > uploadedAt + CLOCK_AHEAD_MS || ms < uploadedAt - maxAgeMs) continue;
        if (best === undefined || ms > best) best = ms;
      }
    }
  }
  return best;
}

/** Two CPs of as many digits that differ in exactly one of them. */
function oneDigitOff(a: number, b: number): boolean {
  const x = String(a);
  const y = String(b);
  return x.length === y.length && [...x].filter((digit, i) => digit !== y[i]).length === 1;
}

/** Two bosses of one Pokémon: one entry, or one name for a boss the game master does not know. */
function sameSpecies(a: RaidBoss, b: RaidBoss): boolean {
  return a.entry && b.entry ? a.entry.key === b.entry.key : a.name === b.name;
}

interface BossChoice {
  boss: RaidBoss | null;
  from: ScreenshotReport['bossFrom'];
}

/**
 * The boss of a hatched raid: by its CP, narrowed by the heads, the purple and the name; else by
 * name.
 */
function bossOf(
  cp: number | null,
  name: string | null,
  headsLevel: RaidLevel | undefined,
  shadow: boolean,
  bosses: readonly RaidBoss[],
): BossChoice {
  const similar = (boss: RaidBoss) => (name ? bossNameSimilarity(name, boss) : 0);
  const ranked = (list: readonly RaidBoss[]) => [...list].sort((a, b) => similar(b) - similar(a));
  if (cp !== null) {
    let fits = bosses.filter(
      (boss) => boss.entry && raidBossCp(boss.entry.stats, bossStamina(boss.tier)) === cp,
    );
    if (fits.length > 1 && headsLevel) {
      const ofHeads = fits.filter((boss) => boss.tier.level === headsLevel);
      if (ofHeads.length > 0) fits = ofHeads;
    }
    // A shadow and a plain boss of one tier have one CP: the purple tells them apart.
    if (fits.length > 1) {
      const ofPurple = fits.filter((boss) => boss.tier.shadow === shadow);
      if (ofPurple.length > 0) fits = ofPurple;
    }
    if (fits.length === 1 && fits[0]) return { boss: fits[0], from: 'cp' };
    if (fits.length > 1) {
      const [first, second] = ranked(fits);
      if (first && second && similar(first) - similar(second) >= NAME_MARGIN) {
        return { boss: first, from: 'cp-and-name' };
      }
      return { boss: null, from: null };
    }
  }
  // The CP fits no listed boss (a digit misread, or a boss the feed does not list yet): a name
  // decides only when it is nearly exactly one boss's of the heads' tier and no other's.
  if (!name || !headsLevel) return { boss: null, from: null };
  let ofLevel = bosses.filter((boss) => boss.tier.level === headsLevel);
  // A digit the boss hides is misread (49803 for 49808): the one boss of the heads' tier whose
  // CP differs in one digit, when the name read is most like its and clearly not another's.
  if (cp !== null) {
    const near = ofLevel.filter(
      (boss) => boss.entry && oneDigitOff(cp, raidBossCp(boss.entry.stats, bossStamina(boss.tier))),
    );
    const [first, second] = ranked(ofLevel);
    if (
      first &&
      near.length === 1 &&
      first === near[0] &&
      (!second || similar(first) - similar(second) >= NAME_MARGIN)
    ) {
      return { boss: first, from: 'cp-and-name' };
    }
  }
  // A shadow and a plain boss of one species have one name: the purple tells them apart, as
  // it does for one CP.
  const [best] = ranked(ofLevel);
  if (best) {
    const twins = ofLevel.filter(
      (boss) => sameSpecies(boss, best) && similar(boss) === similar(best),
    );
    const ofPurple = twins.filter((boss) => boss.tier.shadow === shadow);
    if (twins.length > 1 && ofPurple.length > 0) {
      ofLevel = ofLevel.filter((boss) => !twins.includes(boss) || ofPurple.includes(boss));
    }
  }
  const [first, second] = ranked(ofLevel);
  if (
    first &&
    similar(first) >= NAME_ALONE &&
    (!second || similar(first) - similar(second) >= NAME_ALONE_MARGIN)
  ) {
    return { boss: first, from: 'name' };
  }
  return { boss: null, from: null };
}

/**
 * The boss of a hatched raid that no listed boss fits (Matt, 2026-10-25: the reader decides as
 * `/raid` does, which takes `t5 azelf` while the feed has not listed Azelf yet): the Pokémon whose
 * raid CP at the heads' tier is the CP read or one digit off it (a digit the boss hides), and
 * whose name is nearly exactly the name read (`NAME_ALONE`) and clearly no other's of those CPs
 * (`NAME_ALONE_MARGIN`); of several forms alike in both, the species itself. Then it is what
 * `bossAtTier` makes of it at that tier: the Pokémon off the list (`unlisted`), or the boss of the
 * list in that tier; nothing where `/raid` would refuse it (listed in another level or as the
 * other shadow kind, the plain Pokémon in a mega raid).
 */
function unlistedBossOf(
  cp: number | null,
  name: string | null,
  tier: RaidTier,
  context: Pick<ReportContext, 'bosses' | 'pokemon'>,
): ReportBoss | undefined {
  const entry = pokemonByCpAndName(cp, name, tier, context);
  if (!entry) return undefined;
  const found = bossAtTier(entry, tier, context.bosses);
  if (found.kind === 'listed') return found.boss;
  if (found.kind !== 'unlisted') return undefined;
  return { listed: false, key: entry.key, name: entry.name, tier, entry };
}

/**
 * The Pokémon whose raid CP at `tier` is the CP read or one digit off it, and whose name is
 * nearly exactly the name read and clearly no other's of those CPs (`unlistedBossOf`); of several
 * forms alike in both, the species itself; undefined for none. Also what a raid screenshot that
 * disagrees with the list is observed by (`raidTierObservation`, plan 8X-J): one path.
 */
export function pokemonByCpAndName(
  cp: number | null,
  name: string | null,
  tier: RaidTier,
  context: Pick<ReportContext, 'bosses' | 'pokemon'>,
): PokemonEntry | undefined {
  if (cp === null || !name) return undefined;
  const stamina = bossStamina(tier);
  // A mega raid's boss is a mega form: the plain Pokémon is not even looked at.
  const taken = (entry: PokemonEntry) =>
    bossAtTier(entry, tier, context.bosses).kind !== 'not-a-mega';
  const fits = context.pokemon.filter((entry) => {
    const its = raidBossCp(entry.stats, stamina);
    return (its === cp || oneDigitOff(cp, its)) && taken(entry);
  });
  const similar = (entry: PokemonEntry) => bossNameSimilarity(name, entry);
  const ranked = [...fits].sort((a, b) => similar(b) - similar(a));
  const [best] = ranked;
  if (!best || similar(best) < NAME_ALONE) return undefined;
  const others = ranked.filter((entry) => entry.dex !== best.dex);
  const [next] = others;
  if (next && similar(best) - similar(next) < NAME_ALONE_MARGIN) return undefined;
  const alike = ranked.filter(
    (entry) => entry.dex === best.dex && similar(entry) === similar(best),
  );
  return alike.length === 1 ? best : alike.find((one) => one.kind === 'species');
}

/**
 * A clock read with at least this confidence (of its status-bar line) wins over a file name it
 * disagrees with. On the 28 samples every clock was read right, its line at 0.74 to 0.98 (the
 * icons beside the clock lower the line's confidence): below the lowest, with a margin.
 */
export const CLOCK_SURE = 0.6;

/**
 * The time of the file's name, and whether it disagrees with the clock read: undefined when it
 * is ahead of the upload by more than a phone's clock may be. When a clock was read and the
 * file's time of day is more than two minutes from it (either half for a 12-hour clock), the
 * clock wins if it was read surely (`CLOCK_SURE`), and the file otherwise.
 */
function fileTime(
  context: MomentContext,
  clock: ScreenText['clock'],
): { at: number | undefined; differs: boolean } {
  const { fileTakenAt } = context;
  if (fileTakenAt === undefined || fileTakenAt > context.uploadedAt + CLOCK_AHEAD_MS) {
    return { at: undefined, differs: false };
  }
  if (!clock) return { at: fileTakenAt, differs: false };
  const local = zoned(fileTakenAt, context.zone);
  const minutes = local.hour * 60 + local.minute + local.second / 60;
  const hours =
    clock.hour >= 1 && clock.hour <= 12 ? [clock.hour % 12, (clock.hour % 12) + 12] : [clock.hour];
  const agrees = hours.some((hour) => {
    const apart = Math.abs(minutes - (hour * 60 + clock.minute)) % 1440;
    return Math.min(apart, 1440 - apart) <= CLOCK_AHEAD_MS / 60_000;
  });
  if (agrees) return { at: fileTakenAt, differs: false };
  const sure = (clock.confidence ?? 0) >= CLOCK_SURE;
  return { at: sure ? undefined : fileTakenAt, differs: true };
}

/** What the moment of a screenshot is told from (`ReportContext`'s fields of the same names). */
export type MomentContext = Pick<
  ReportContext,
  'uploadedAt' | 'zone' | 'guessOffsetSeconds' | 'fileTakenAt'
>;

/** The doubts about the moment of a screenshot (`ReportDoubt`). */
export type MomentDoubt = 'time-guessed' | 'time-stale' | 'time-sources-differ';

/** When a screenshot was taken, what that was taken from, and the doubts about it. */
export interface ScreenshotMoment {
  takenAt: number;
  timeFrom: 'file' | 'clock' | 'upload';
  doubts: MomentDoubt[];
}

/**
 * When a screenshot was taken (a raid's and a max battle's alike): the file's name, to the second
 * and dated, when it agrees with the clock read (within a phone's two minutes, by the time of
 * day) or there is no clock: within `maxAgeMs` it is the time; older, it is still the time,
 * doubted as stale (a screenshot posted again later). A name ahead of the upload by more than a
 * phone's clock may be, or one the clock contradicts, is not used. Else the clock (`clockTime`,
 * within `maxAgeMs`), else guessed from the upload.
 */
export function screenshotMoment(
  clock: ScreenText['clock'],
  context: MomentContext,
  maxAgeMs: number,
): ScreenshotMoment {
  const doubts: MomentDoubt[] = [];
  const byClock = clock ? clockTime(clock, context.uploadedAt, context.zone, maxAgeMs) : undefined;
  const file = fileTime(context, clock);
  if (file.differs) doubts.push('time-sources-differ');
  const fileTakenAt = file.at;
  const fileAge = fileTakenAt === undefined ? undefined : context.uploadedAt - fileTakenAt;
  const takenAt = fileTakenAt ?? byClock ?? context.uploadedAt - context.guessOffsetSeconds * 1000;
  if (fileAge !== undefined) {
    if (fileAge > maxAgeMs) doubts.push('time-stale');
  } else {
    if (byClock === undefined) doubts.push('time-guessed');
    else if (context.uploadedAt - byClock > STALE_MS) doubts.push('time-stale');
  }
  return {
    takenAt,
    timeFrom: fileTakenAt !== undefined ? 'file' : byClock !== undefined ? 'clock' : 'upload',
    doubts,
  };
}

export function screenshotReport(reading: ReadScreen, context: ReportContext): ScreenshotReport {
  const { text } = reading;
  const doubts = new Set<ReportDoubt>();
  // A max battle's screen is no raid's: its heads are counted, nothing more is made of it here.
  const maxScreen = Boolean(text.max);
  const stage = maxScreen
    ? null
    : text.cp !== null || text.countdownPlace === 'right'
      ? 'hatched'
      : text.countdownPlace === 'centre'
        ? 'egg'
        : null;
  const heads = reading.heads && reading.heads.count > 0 ? reading.heads.count : null;
  let headsLevel = heads === null || maxScreen ? undefined : TIER_OF_HEADS[heads];
  if (heads !== null && headsLevel && !SEEN_HEADS.has(heads)) doubts.add('heads-unverified');
  // An egg of five heads at an elite raid gym (its badge) that hatches later than a standard
  // egg can is an elite raid's.
  const longEgg = stage === 'egg' && (text.countdown ?? 0) > context.standardIncubate * 60;
  if (headsLevel === 'T5' && longEgg && text.eliteBadge) headsLevel = 'Elite';

  const purpleShadow = reading.purple > SHADOW_SHARE;
  const listed =
    stage === 'hatched'
      ? bossOf(text.cp, text.bossName, headsLevel, purpleShadow, context.bosses)
      : { boss: null, from: null };
  let boss: ReportBoss | null = listed.boss;
  let bossFrom = listed.from;
  let tier: RaidTier | null = null;
  let tierFrom: ScreenshotReport['tierFrom'] = null;
  if (boss) {
    tier = boss.tier;
    tierFrom = 'boss';
    if (headsLevel && headsLevel !== boss.tier.level) doubts.add('heads-boss-conflict');
    if (SHADOW_RAID_LEVELS.includes(boss.tier.level) && boss.tier.shadow !== purpleShadow) {
      doubts.add('shadow-differs');
    }
  } else if (headsLevel) {
    let shadow = false;
    if (SHADOW_RAID_LEVELS.includes(headsLevel)) {
      shadow = purpleShadow;
      const listed = context.bosses.some(
        (b) => b.tier.level === headsLevel && b.tier.shadow === shadow,
      );
      if (!listed) doubts.add('shadow-unlisted');
    }
    tier = raidTier(headsLevel, shadow) ?? null;
    tierFrom = 'heads';
    // No listed boss fits: a Pokémon off the list at the heads' tier, as `/raid` takes it. Its CP
    // at that tier says the heads are right.
    const unlisted =
      stage === 'hatched' && tier
        ? unlistedBossOf(text.cp, text.bossName, tier, context)
        : undefined;
    if (unlisted) {
      boss = unlisted;
      bossFrom = 'cp-and-name';
      if (isUnlisted(unlisted)) doubts.add('boss-unlisted');
    } else if (stage === 'hatched') doubts.add('heads-only');
  }
  if (!tier) doubts.add('tier-unknown');
  if (tier?.level === 'Elite') doubts.add('elite');
  if (stage === 'hatched' && !boss) doubts.add('boss-unknown');
  if (bossFrom === 'name') doubts.add('boss-from-name');
  if (
    boss &&
    bossFrom === 'cp' &&
    text.bossName &&
    bossNameSimilarity(text.bossName, boss) < NAME_DIFFERS
  ) {
    doubts.add('boss-name-differs');
  }
  if (heads !== null && (reading.heads?.outside ?? -1) >= HEAD_OUTSIDE)
    doubts.add('heads-uncertain');
  if (stage === null) doubts.add('stage-unknown');

  const maxAgeMs = (context.standardIncubate + context.standardHatched) * 60_000;
  const {
    takenAt,
    timeFrom,
    doubts: momentDoubts,
  } = screenshotMoment(text.clock, context, maxAgeMs);
  for (const doubt of momentDoubts) doubts.add(doubt);
  let time: ScreenshotReport['time'] = null;
  if (text.countdown === null) {
    doubts.add('no-time');
  } else if (stage !== null) {
    const at = takenAt + text.countdown * 1000;
    time = stage === 'egg' ? { hatch: at } : { end: at };
    if (at < context.uploadedAt) doubts.add('time-past');
    const longest =
      stage === 'hatched'
        ? context.maxHatched * 60
        : tier?.level === 'Elite'
          ? Infinity
          : context.standardIncubate * 60;
    if (text.countdown > longest) doubts.add('countdown-long');
  }

  const gym = gymOfText(text.gym, context.searchGym, text.gymBelow);
  if (gym.gymId === null) doubts.add('no-gym');
  else if (!gym.clear) doubts.add('gym-unclear');

  const raidScreen =
    !maxScreen &&
    text.countdown !== null &&
    (heads !== null || bossFrom === 'cp' || bossFrom === 'cp-and-name');
  if (!raidScreen) doubts.add('not-a-raid-screen');

  return {
    gym,
    stage,
    heads,
    tier,
    tierFrom,
    cp: text.cp,
    bossName: text.bossName,
    boss,
    bossFrom,
    eliteBadge: text.eliteBadge,
    purple: reading.purple,
    clock: text.clock,
    countdown: text.countdown,
    takenAt,
    timeFrom,
    time,
    doubts: [...doubts],
  };
}
