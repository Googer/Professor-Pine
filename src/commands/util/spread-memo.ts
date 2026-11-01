import { BoundedMap } from '../../bounded-map.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import {
  rankedSpreads,
  type RankOptions,
  type Spread,
  type SpreadRanking,
} from '../../domain/pvp/rank.js';

/** How many rankings are kept per catalogue (each is 4,096 combinations at most). */
const KEPT_RANKINGS = 200;

/**
 * The rankings `/rank` made, kept so that asking about other IVs of the same Pokémon in the same
 * league costs no new ranking (thousands of CP computations, twice with the level 51 column, nine
 * times over for the line of Eevee). Kept per catalogue (the multipliers and the stats come from
 * it; a new download of the game data starts afresh) under the Pokémon, the league's CP, the
 * floor and the level cap, at most `max` of them, the oldest out. The rankings are shared: no
 * caller changes one.
 */
export class SpreadMemo {
  private readonly kept = new WeakMap<object, BoundedMap<string, readonly Spread[]>>();

  constructor(
    private readonly max: number = KEPT_RANKINGS,
    private readonly rank: typeof rankedSpreads = rankedSpreads,
  ) {}

  /** The ranking of `entry` of `catalogue`, for `cappedRanks`. */
  ranking(catalogue: object, entry: Pick<PokemonEntry, 'key' | 'stats'>): SpreadRanking {
    const memo = this.kept.getOrInsertComputed(catalogue, () => new BoundedMap(this.max));
    return (options: RankOptions, multipliers: readonly number[]) => {
      const key = [entry.key, options.leagueCp ?? 'none', options.floor, options.levelCap].join(
        '|',
      );
      const found = memo.get(key);
      if (found) return found;
      const spreads = this.rank(entry.stats, multipliers, options);
      memo.set(key, spreads);
      return spreads;
    };
  }
}
