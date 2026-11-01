import type { PokemonCatalogue } from './catalogue.js';
import { bossIdsOf } from './feed-lookup.js';
import type { PokemonEntry } from './game-master.js';
import type { RaidBossRef } from '../party/party.js';
import type { MaxEvent } from '../time/max-events.js';
import { addDays, zoned } from '../time/zoned.js';
import type { MaxBoss } from './max-bosses.js';
import { maxBossChoiceName, MAX_TIERS, type MaxTier } from './max-tier.js';

/** A max boss as `/max` offers it (plan 8X-3 builds the command). */
export interface MaxBossChoice {
  boss: MaxBoss;
  /** The choice's words: `Machamp · Dynamax 2★`, `Gigantamax Machamp` (`maxBossChoiceName`). */
  name: string;
  /** Listed first as the boss of an event that is featured now (`featuredAt`). */
  featured: boolean;
}

/** The order of the list after the featured bosses: 5 stars down to 1, Gigantamax last. */
const LIST_ORDER: readonly MaxTier[] = ['D5', 'D4', 'D3', 'D2', 'D1', 'G'];

/**
 * The boss of the list a max battle's boss is (`shownMaxBoss`, the party history's shiny): the
 * list's boss of the battle's tier that is the catalogue's entry of its reference, or for a boss
 * the game master does not know, the one of the name it was reported by; undefined if none is.
 */
export function listedMaxBoss(
  ref: RaidBossRef,
  tier: MaxTier,
  catalogue: PokemonCatalogue,
  bosses: readonly MaxBoss[],
): { entry: PokemonEntry | undefined; listed: MaxBoss | undefined } {
  const entry = 'key' in ref ? catalogue.byKey(ref.key) : undefined;
  const listed = bosses.find(
    (boss) =>
      boss.tier === tier &&
      (entry ? boss.entry?.key === entry.key : 'name' in ref && boss.name === ref.name),
  );
  return { entry, listed };
}

const choice = (boss: MaxBoss, featured: boolean): MaxBossChoice => ({
  boss,
  name: maxBossChoiceName(boss.name, boss.tier),
  featured,
});

/**
 * The current max bosses as `/max`'s boss choice will offer them (design section 3.2): first the
 * bosses of the events featured now (`featured`, in its order: a Max Battle Day's, then the
 * week's Max Monday's), each name of the event read through the Pokémon search (`exact`) and
 * found on the list in the event's kind (Dynamax or Gigantamax), higher tiers first; then every
 * other boss from 5 stars down to 1 and Gigantamax last, by name within a tier (`bosses` is the
 * list in effect, by tier and name). A boss is offered once; the Dynamax and the Gigantamax
 * battle of one Pokémon are two choices. With `extras`:
 * - an upcoming boss (`coming`, `comingMaxBosses`) that a featured event names is featured too,
 *   from the event's start (east of UTC its stored start comes after the event);
 * - during a featured event's own hours (`time`), a Gigantamax boss it names that the game master
 *   lets battle as Gigantamax (`catalogue`) and the feed does not list is offered as featured
 *   with the tier G (`source` `event`; the coordinator's call, Q-A, pending Matt), unless staff
 *   hid it at G (`hidden`: the keys and tiers that hide overrides in force take off). Not a
 *   Dynamax boss off the list: its stars are unknown.
 * Otherwise a featured name the search does not find, or whose boss is not on the list, features
 * nothing (it can still be typed: `typedMaxBoss`).
 */
export function maxBossChoices(
  bosses: readonly MaxBoss[],
  featured: readonly { event: MaxEvent }[],
  exact: (text: string) => PokemonEntry | undefined,
  extras: {
    coming?: readonly MaxBoss[];
    time?: number;
    catalogue?: Pick<PokemonCatalogue, 'canGigantamax'>;
    hidden?: readonly { key: string; tier: MaxTier }[];
  } = {},
): MaxBossChoice[] {
  const sorted = (list: readonly MaxBoss[]): MaxBoss[] =>
    [...list].sort((a, b) => LIST_ORDER.indexOf(a.tier) - LIST_ORDER.indexOf(b.tier));
  const byOrder = sorted(bosses);
  const coming = sorted(extras.coming ?? []);
  const first: MaxBoss[] = [];
  const add = (boss: MaxBoss): void => {
    if (!first.some((one) => one.key === boss.key && one.tier === boss.tier)) first.push(boss);
  };
  for (const { event } of featured) {
    if (!event.featured) continue;
    const { gigantamax, names } = event.featured;
    const during =
      extras.time !== undefined && event.start <= extras.time && extras.time < event.end;
    for (const name of names) {
      const entry = exact(name);
      if (!entry) continue;
      const ofKind = (boss: MaxBoss): boolean =>
        boss.entry?.key === entry.key && (boss.tier === 'G') === gigantamax;
      for (const boss of [...byOrder, ...coming]) if (ofKind(boss)) add(boss);
      const offList = ![...byOrder, ...coming].some(ofKind);
      const hidden = (extras.hidden ?? []).some((one) => one.key === entry.key && one.tier === 'G');
      if (gigantamax && during && offList && !hidden && extras.catalogue?.canGigantamax(entry)) {
        add({
          key: entry.key,
          ...bossIdsOf(entry),
          tier: 'G',
          shiny: false,
          name: entry.name,
          entry,
          source: 'event',
          autoset: false,
        });
      }
    }
  }
  const inFirst = (boss: MaxBoss): boolean =>
    first.some((one) => one.key === boss.key && one.tier === boss.tier);
  return [
    ...first.map((boss) => choice(boss, true)),
    ...byOrder.filter((boss) => !inFirst(boss)).map((boss) => choice(boss, false)),
  ];
}

/**
 * When a max event stops featuring its bosses (as `featuredAt` reads it): a Max Battle Day or
 * Weekend at its end, a Max Monday when the next one starts or a week of the zone's clock after it.
 */
function featuredUntil(event: MaxEvent, events: readonly MaxEvent[], zone: string): number {
  if (event.kind !== 'max-monday') return event.end;
  const next = events.find((other) => other.kind === 'max-monday' && other.start > event.start);
  const week = addDays(zoned(event.start, zone), 7).epochMilliseconds;
  return Math.min(next?.start ?? Infinity, week);
}

/**
 * The list without the upcoming bosses whose event is over (plan 8X-3, change 4): Pokebattler
 * gives no end in any max tier, so a boss it listed ahead of an event may stay listed after it.
 * A boss is left out once an event that names it (in its kind: Dynamax or Gigantamax, each name
 * read through the Pokémon search, `exact`) stopped featuring it (`featuredUntil`) by `now`, no
 * event names it that features it now or later, and it came with that event: the feed first had
 * it (`firstSeen`, which holds an upcoming boss's start) from the start of that event's day on.
 * A boss of the pool from before the event (a Max Monday's Sneasel seen for weeks) stays.
 */
export function withoutEndedUpcoming(
  bosses: readonly MaxBoss[],
  feed: readonly { pokemonId: string; form: string | null; tier: MaxTier; firstSeen: number }[],
  events: readonly MaxEvent[],
  exact: (text: string) => PokemonEntry | undefined,
  now: number,
  zone: string,
): MaxBoss[] {
  const naming = (boss: MaxBoss): MaxEvent[] =>
    events.filter(
      (event) =>
        event.featured !== undefined &&
        event.featured.gigantamax === (boss.tier === 'G') &&
        event.featured.names.some((name) => {
          const entry = exact(name);
          return entry !== undefined && entry.key === boss.entry?.key;
        }),
    );
  return bosses.filter((boss) => {
    if (!boss.entry) return true;
    const named = naming(boss);
    if (named.some((event) => featuredUntil(event, events, zone) > now)) return true;
    const row = feed.find(
      (one) => one.pokemonId === boss.pokemonId && one.form === boss.form && one.tier === boss.tier,
    );
    if (!row) return true;
    const cameWith = named.some(
      (event) => row.firstSeen >= zoned(event.start, zone).startOfDay().epochMilliseconds,
    );
    return !cameWith;
  });
}

/**
 * What a Pokémon typed as a max boss can be (design sections 2 and 3.2): the list's bosses of
 * it (`listed`, whose tier is known), and the other tiers the game master lets it battle in
 * (`others`: D1 to D5 where it can be a Dynamax boss, G where it can be a Gigantamax one), which
 * `/max` asks for when it is typed off the list. Both empty: it is no max boss.
 */
export function typedMaxBoss(
  entry: PokemonEntry,
  bosses: readonly MaxBoss[],
  catalogue: Pick<PokemonCatalogue, 'canDynamax' | 'canGigantamax'>,
): { listed: MaxBoss[]; others: MaxTier[] } {
  const listed = bosses.filter((boss) => boss.entry?.key === entry.key);
  const allowed = MAX_TIERS.filter((tier) =>
    tier === 'G' ? catalogue.canGigantamax(entry) : catalogue.canDynamax(entry),
  );
  return {
    listed,
    others: allowed.filter((tier) => !listed.some((boss) => boss.tier === tier)),
  };
}
