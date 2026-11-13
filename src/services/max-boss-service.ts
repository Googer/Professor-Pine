import type { MaxBossStore, StoredBoss } from '../db/repositories/raid-boss-repository.js';
import {
  comingMaxBosses,
  MAX_OPS,
  maxBossesAt,
  maxOverrideProblem,
  maxRowsIn,
  parseMaxBossFeed,
  type MaxBoss,
} from '../domain/pogo/max-bosses.js';
import {
  maxBossChoices,
  withoutEndedUpcoming,
  type MaxBossChoice,
} from '../domain/pogo/max-boss-list.js';
import type { MaxTier } from '../domain/pogo/max-tier.js';
import { familyOverrideKeys } from '../domain/pogo/raid-bosses.js';
import { bigEventAt, featuredAt } from '../domain/time/max-events.js';
import type { GameDataProvider } from './game-data-service.js';
import type { PokemonFinder } from './pokemon-search-service.js';
import type { MaxEventProvider } from './raid-event-service.js';
import {
  BossFeedService,
  type BossAdmin,
  type BossFeedFamily,
  type BossFeedOptions,
} from './boss-feed-service.js';

/** Pokebattler's raid list is about 700 KB (2026-10-20); a document far past that is not it. */
const MAX_FEED_CHARS = 5_000_000;

export interface MaxBossOptions extends BossFeedOptions<MaxTier> {
  /** Address of Pokebattler's raid list (`settings.maxBattles.url`). */
  url: string;
  store: MaxBossStore;
  /**
   * The instance's default zone (`instanceZone`), in which the stored list's upcoming bosses'
   * days are read; a server's list places them in its own (`bosses(zone)`, `maxRowsIn`).
   */
  zone: string;
}

/**
 * What handlers need of the max bosses (plan 8X-2; `/max`, plan 8X-3), in a server's zone (plan
 * 19A-2: an upcoming boss from the start of its day there, `maxRowsIn`).
 */
export interface MaxBossProvider {
  /**
   * The max bosses in effect now: the feed's list whose start has come, with the moderators'
   * max overrides applied, from D1 to G, then by name.
   */
  bosses(zone: string): readonly Readonly<MaxBoss>[];
  /**
   * The feed's upcoming bosses, whose start has not come, with the overrides that hide one or set
   * its shiny flag: offered only while a max event that names them is on (`maxBossChoices`).
   */
  coming(zone: string): MaxBoss[];
  /** The bosses (key and tier) that the hide overrides in force take off the list. */
  hidden(): { key: string; tier: MaxTier }[];
  /**
   * The feed as stored, with when each boss was first a boss (`firstSeen`): an upcoming boss is
   * left out of `/max`'s list once its event is over (`withoutEndedUpcoming`, plan 8X-3).
   */
  feedBosses(zone: string): readonly StoredBoss<MaxTier>[];
}

/** What staff need of the max boss list beyond what handlers read (`/operator boss`). */
export type MaxBossAdmin = BossAdmin<MaxTier>;

/**
 * The max bosses `/max` offers at `now`, in their order (`maxBossChoices`): the featured bosses of
 * the max events of the events feed first (`featuredAt`: a Max Battle Day's during its hours, the
 * week's Max Monday's), each event's names read through the Pokémon search, then 5 stars down to
 * 1 and Gigantamax; an upcoming boss a featured event names from that event's start, and during
 * a featured event's hours a Gigantamax boss it names that the feed does not list; an upcoming
 * boss whose event is over is left out (`withoutEndedUpcoming`). During a big event's hours
 * (`bigEventAt`: Wild Area, GO Tour, GO Fest; Matt, 2026-10-21, Q-A) the Gigantamax bosses come
 * first, ahead of the featured Dynamax ones, each part in its order. `zone` is the server's
 * (plan 19A-2): its lists and its week.
 */
export function currentMaxBossChoices(
  deps: {
    maxBosses: MaxBossProvider;
    maxEvents: Pick<MaxEventProvider, 'maxEvents' | 'bigEvents'>;
    pokemon: Pick<PokemonFinder, 'exact'>;
    gameData: GameDataProvider;
    zone: string;
  },
  now: number,
): MaxBossChoice[] {
  const events = deps.maxEvents.maxEvents(deps.zone);
  const exact = (text: string) => deps.pokemon.exact(text);
  const choices = maxBossChoices(
    withoutEndedUpcoming(
      deps.maxBosses.bosses(deps.zone),
      deps.maxBosses.feedBosses(deps.zone),
      events,
      exact,
      now,
      deps.zone,
    ),
    featuredAt(events, now, deps.zone),
    exact,
    {
      coming: deps.maxBosses.coming(deps.zone),
      time: now,
      catalogue: deps.gameData.catalogue,
      hidden: deps.maxBosses.hidden(),
    },
  );
  if (!bigEventAt(deps.maxEvents.bigEvents(deps.zone), now)) return choices;
  const gigantamax = (choice: MaxBossChoice): boolean => choice.boss.tier === 'G';
  return [...choices.filter(gigantamax), ...choices.filter((choice) => !gigantamax(choice))];
}

/**
 * Keeps the max boss list (plan 8X-2): Pokebattler's feed read on its own timer
 * (`settings.maxBattles.refreshMinutes`) and stored in the boss tables beside the raid bosses
 * (`MaxBossRepository`), with the moderators' max overrides, by the same machinery as the raid
 * bosses (`BossFeedService`: the stored list at start, the first read when it is older than the
 * refresh, retries, the warning of a list out of date, overrides one at a time). Its changes are
 * not announced (`RaidBossAnnouncer` listens to the raid bosses only).
 */
export class MaxBossService extends BossFeedService<MaxTier> implements MaxBossProvider {
  private readonly gameData: GameDataProvider;

  constructor(options: MaxBossOptions) {
    const family: BossFeedFamily<MaxTier> = {
      noun: 'max boss',
      maxFeedChars: MAX_FEED_CHARS,
      ops: MAX_OPS,
      parse: (json, catalogue, now) =>
        parseMaxBossFeed(json, catalogue, { now, zone: options.zone }),
      effective: maxBossesAt,
      overrideProblem: maxOverrideProblem,
      inZone: maxRowsIn,
    };
    super(options, family);
    this.gameData = options.gameData;
  }

  hidden(): { key: string; tier: MaxTier }[] {
    const keyOf = familyOverrideKeys(MAX_OPS, this.feedBosses(), this.gameData.catalogue);
    return this.overrides().flatMap((one) =>
      one.action === 'hide' && one.tier !== null ? [{ key: keyOf(one).key, tier: one.tier }] : [],
    );
  }

  coming(zone?: string): MaxBoss[] {
    return comingMaxBosses(
      this.feedBosses(zone),
      this.overrides(),
      this.gameData.catalogue,
      this.now(),
    );
  }
}
