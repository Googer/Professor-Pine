import type { PokemonCatalogue } from './catalogue.js';
import { bossIdsOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';
import { isMaxTier, MAX_TIERS, type MaxTier } from './max-tier.js';
import { titleCase } from './names.js';
import type { FeedBoss, ParsedFeed } from './raid-boss-feed.js';
import {
  familyBosses,
  overrideProblemOf,
  type Boss,
  type BossFamilyOps,
  type BossOverride,
  type NewBossOverride,
} from './raid-bosses.js';
import { isMoment, zoned } from '../time/zoned.js';

/** A max boss as Pokebattler's feed lists it. */
export type MaxFeedBoss = FeedBoss<MaxTier>;
/** A boss of the max boss list in effect (plan 8X-2). */
export type MaxBoss = Boss<MaxTier>;
export type MaxBossOverride = BossOverride<MaxTier>;
export type NewMaxBossOverride = NewBossOverride<MaxTier>;

/**
 * The max bosses' tiers and rows. A row's ids are those of a catalogue entry (the parser maps
 * Pokebattler's ids to them), so a row is resolved by its ids alone; one the catalogue does not
 * know stays unresolved, listed by its name.
 */
export const MAX_OPS: BossFamilyOps<MaxTier> = {
  sameTier: (a, b) => a === b,
  rank: (tier) => MAX_TIERS.indexOf(tier),
  slot: (tier) => tier,
  resolve: (catalogue, boss) => catalogue.byGameMasterId(boss.pokemonId, boss.form),
  // A Dynamax boss has one tier of stars at a time; its Gigantamax battle is another boss (8X-J).
  oneTierAmong: (tier) => (tier === 'G' ? undefined : 'dynamax'),
};

/**
 * Pokebattler's tiers of max battles (`GET /raids`, design section 2, decision 1): the Dynamax
 * stars and Gigantamax. Their `_FUTURE` and `_LEGACY` twins are not read; neither are the raid
 * tiers (Pokebattler is no source of raid bosses).
 */
export const MAX_FEED_TIERS: Readonly<Record<string, MaxTier>> = {
  RAID_LEVEL_1_MAX: 'D1',
  RAID_LEVEL_2_MAX: 'D2',
  RAID_LEVEL_3_MAX: 'D3',
  RAID_LEVEL_4_MAX: 'D4',
  RAID_LEVEL_5_MAX: 'D5',
  RAID_LEVEL_6_MAX: 'G',
};

/** A max tier of the feed Pine does not read yet (`RAID_LEVEL_7_MAX`): reported when it has bosses. */
const OTHER_MAX_TIER = /^RAID_LEVEL_[A-Z0-9_]+_MAX$/;
const GIGANTAMAX_SUFFIX = '_GIGANTAMAX';
/** Pokebattler's ids: game-master words, and a hyphen for a few (`JANGMO-O`). */
const POKEBATTLER_ID = /^[A-Z][A-Z0-9_-]{0,63}$/;
const MAX_BOSSES_PER_TIER = 200;
const MAX_UNKNOWN = 10;

const indexes = new WeakMap<PokemonCatalogue, Map<string, PokemonEntry>>();

/** The catalogue's entries by their Pokebattler id, megas left out; built once per catalogue. */
function pokebattlerIndex(catalogue: PokemonCatalogue): Map<string, PokemonEntry> {
  let index = indexes.get(catalogue);
  if (!index) {
    index = new Map();
    for (const entry of catalogue.all) {
      if (entry.kind === 'mega' || index.has(entry.pokebattlerId)) continue;
      index.set(entry.pokebattlerId, entry);
    }
    indexes.set(catalogue, index);
  }
  return index;
}

/**
 * The Pokémon of a Pokebattler id of the max tiers (design section 10, the Pokebattler mapping):
 * the entry of that Pokebattler id (`ARCANINE_HISUIAN_FORM`, `TOXTRICITY_AMPED_FORM`); else the
 * entry the id names as a catalogue key or alias, which makes a bare species id the species, or
 * the default form of a species known by one (`GIRATINA` is Altered Forme, as the raid feed's
 * names are read). A Gigantamax id drops `_GIGANTAMAX` and is looked up the same way
 * (`TOXTRICITY_AMPED_GIGANTAMAX` is Amped Toxtricity); it is never an entry of its own. A mega is
 * no max boss. `entry` is undefined for an id the catalogue does not know.
 */
export function maxBossOf(
  id: string,
  catalogue: PokemonCatalogue,
): { entry: PokemonEntry | undefined; gigantamax: boolean } {
  const gigantamax = id.endsWith(GIGANTAMAX_SUFFIX);
  const base = gigantamax ? id.slice(0, -GIGANTAMAX_SUFFIX.length) : id;
  const found =
    pokebattlerIndex(catalogue).get(base) ??
    catalogue.byKey(base) ??
    (base.endsWith('_FORM') ? catalogue.byKey(base.slice(0, -'_FORM'.length)) : undefined);
  const entry = found && found.kind !== 'mega' && found.tempEvolution === null ? found : undefined;
  return { entry, gigantamax };
}

function formatError(message: string): Error {
  return new Error(`The max boss feed is not in the expected format: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * When an upcoming boss is a boss from: the start of the day of its `startDate` in `zone`, when
 * that is after `now`. Pokebattler gives one instant for an event the game holds at a local hour
 * everywhere (the lake trio's Max Battle Day of 14:00 to 17:00 on 2026-10-24 is
 * `2026-10-24T21:00Z`, 17:00 in New York), so its day is what can be relied on. West of UTC
 * that day holds the event; east of it (Tokyo: 06:00 on the 25th) the day comes after the
 * event, so a boss a featured max event names is offered from that event's start as well
 * (`comingMaxBosses`, `maxBossChoices`). An upcoming boss no event names, in a zone whose day
 * of the instant is later than the game's, is offered a day late: the rest of the cases.
 */
function startOf(raid: Record<string, unknown>, now: number, zone: string): number | undefined {
  const start = upcomingStart(raid, now);
  if (start === undefined) return undefined;
  const day = zoned(start, zone).startOfDay().epochMilliseconds;
  return day > now ? day : undefined;
}

/**
 * The moment Pokebattler gives an upcoming boss's start, while it is after `now` (plan 19A-2,
 * `FeedBoss.startsFrom`): kept so that each server's zone has the start of its own day of it. A
 * start that is no moment `zoned` takes (`isMoment`: not finite, beyond its range) is none: the
 * boss is a boss from now.
 */
function upcomingStart(raid: Record<string, unknown>, now: number): number | undefined {
  const start = raid['startDate'];
  if (raid['upcoming'] !== true || typeof start !== 'number' || !isMoment(start)) {
    return undefined;
  }
  return start > now ? start : undefined;
}

/**
 * The stored max feed's rows in `zone` (plan 19A-2): an upcoming boss whose start Pokebattler gave
 * (`startsFrom`) is a boss from the start of that moment's day in `zone` (`firstSeen`), as `startOf`
 * has it in the instance's default zone; every other row as it is. The one path for every
 * server's max boss list (`maxBossesAt`, `comingMaxBosses`, `withoutEndedUpcoming` read it).
 */
export function maxRowsIn<R extends { startsFrom?: number; firstSeen: number }>(
  feed: readonly R[],
  zone: string,
): R[] {
  return feed.map((row) =>
    row.startsFrom === undefined
      ? row
      : { ...row, firstSeen: zoned(row.startsFrom, zone).startOfDay().epochMilliseconds },
  );
}

/**
 * Reads Pokebattler's raid list (`GET https://fight.pokebattler.com/raids`) for the max bosses:
 * the tiers of `MAX_FEED_TIERS`, every boss of them, verified or not (Matt, 2026-10-20: the
 * autocomplete filters as members type). Each boss gets the ids and name of its catalogue entry
 * (`maxBossOf`); an id the catalogue does not know is a boss by a name made of the id, its ids
 * made of it too, and is reported in `unknownIds`. An upcoming boss whose start is ahead gets
 * `startsAt` (`startOf`). A boss listed twice in a tier is kept once, shiny if either says so.
 *
 * Throws when the document does not have the feed's shape or lists no max boss, so a broken feed
 * never replaces a good list. Pokebattler's `dynamaxPokemon` is not read: the game master says
 * what can be typed (`PokemonCatalogue.canDynamax`).
 */
export function parseMaxBossFeed(
  raw: unknown,
  catalogue: PokemonCatalogue,
  options: { now: number; zone: string },
): ParsedFeed<MaxTier> {
  if (!isRecord(raw)) throw formatError('the document is not an object');
  const tiers = raw['tiers'];
  if (!Array.isArray(tiers)) throw formatError('it has no list of tiers');

  const bosses: MaxFeedBoss[] = [];
  const unknownLevels: string[] = [];
  const unknownIds: string[] = [];
  const seen = new Map<string, MaxFeedBoss>();
  let skipped = 0;
  for (const value of tiers as unknown[]) {
    if (!isRecord(value) || typeof value['tier'] !== 'string') continue;
    const name = value['tier'];
    const raids = Array.isArray(value['raids']) ? (value['raids'] as unknown[]) : [];
    const tier = Object.hasOwn(MAX_FEED_TIERS, name) ? MAX_FEED_TIERS[name] : undefined;
    if (tier === undefined) {
      if (OTHER_MAX_TIER.test(name) && raids.length > 0) {
        skipped += raids.length;
        if (unknownLevels.length < MAX_UNKNOWN && !unknownLevels.includes(name)) {
          unknownLevels.push(name.slice(0, 40));
        }
      }
      continue;
    }
    if (raids.length > MAX_BOSSES_PER_TIER) {
      throw formatError(`more than ${String(MAX_BOSSES_PER_TIER)} bosses in one tier`);
    }
    for (const raid of raids) {
      const id = isRecord(raid) ? (raid['pokemonId'] ?? raid['pokemon']) : undefined;
      if (!isRecord(raid) || typeof id !== 'string' || !POKEBATTLER_ID.test(id)) {
        skipped += 1;
        continue;
      }
      const { entry, gigantamax } = maxBossOf(id, catalogue);
      const ids = entry
        ? bossIdsOf(entry)
        : {
            pokemonId: (gigantamax ? id.slice(0, -GIGANTAMAX_SUFFIX.length) : id).replace(
              /-/g,
              '_',
            ),
            form: null,
          };
      if (!entry && unknownIds.length < MAX_UNKNOWN && !unknownIds.includes(id)) {
        unknownIds.push(id);
      }
      const shiny = raid['shiny'] === true;
      const identity = `${ids.pokemonId}|${ids.form ?? ''}|${tier}`;
      const earlier = seen.get(identity);
      if (earlier) {
        earlier.shiny ||= shiny;
        continue;
      }
      const startsAt = startOf(raid, options.now, options.zone);
      const startsFrom = upcomingStart(raid, options.now);
      const boss: MaxFeedBoss = {
        pokemonId: ids.pokemonId,
        form: ids.form,
        tier,
        shiny,
        name: entry?.name ?? titleCase(ids.pokemonId),
        ...(startsAt === undefined ? {} : { startsAt }),
        ...(startsFrom === undefined ? {} : { startsFrom }),
      };
      seen.set(identity, boss);
      bosses.push(boss);
    }
  }
  if (bosses.length === 0) throw new Error('The max boss feed lists no max bosses');
  return { bosses, unknownLevels, skipped, unknownIds };
}

/**
 * The max boss list in effect at `now`: the stored feed's bosses whose start has come
 * (`firstSeen`, which holds an upcoming boss's start), with the moderators' max overrides
 * applied as raid overrides are (`familyBosses`), by tier from D1 to G, then name. An add at a
 * Dynamax tier moves its boss there over the whole feed, begun and upcoming (plan 8X-J).
 */
export function maxBossesAt(
  feed: readonly (MaxFeedBoss & { firstSeen: number })[],
  overrides: readonly MaxBossOverride[],
  catalogue: PokemonCatalogue,
  now: number,
): MaxBoss[] {
  return familyBosses(MAX_OPS, feed, overrides, catalogue, now, {
    rows: (boss) => boss.firstSeen <= now,
  });
}

/**
 * The stored feed's bosses whose start has not come at `now` (upcoming ones), with the max
 * overrides that hide one or set its shiny flag applied (an added boss is in `maxBossesAt`
 * already), and without the rows an add moves away (plan 8X-J: the same `familyBosses` as
 * `maxBossesAt`, over the whole feed). `maxBossChoices` offers one that a max event on now
 * features (a zone east of UTC sees the lake trio's Max Battle Day before the day of Pokebattler's start begins there).
 */
export function comingMaxBosses(
  feed: readonly (MaxFeedBoss & { firstSeen: number })[],
  overrides: readonly MaxBossOverride[],
  catalogue: PokemonCatalogue,
  now: number,
): MaxBoss[] {
  return familyBosses(MAX_OPS, feed, overrides, catalogue, now, {
    rows: (boss) => boss.firstSeen > now,
    added: false,
  });
}

/**
 * What is wrong with a max override a moderator asked for; undefined when it can be stored. As
 * for a raid override (`overrideProblem`), and: every override names a max tier (one without is
 * a raid override: a shiny one for every tier covers the raid tiers only), and there is no
 * `autoset` (a max battle has no egg).
 */
export function maxOverrideProblem(override: NewMaxBossOverride, now: number): string | undefined {
  return overrideProblemOf(override, now, ({ action, tier }) => {
    if (tier === null || !isMaxTier(tier)) return 'A max battle tier is needed.';
    if (action === 'autoset') {
      return 'A max battle has no egg, so there is nothing to hatch as: `autoset` is for raid tiers.';
    }
    return undefined;
  });
}
