import {
  bestRank,
  NO_REGION_RANK,
  RANK_DAYS,
  regionRanks,
  type RankedRegion,
} from '../domain/geo/google-line.js';

export interface GoogleRanksOptions {
  /** The regions (`RegionDirectory`): their rows and channels. */
  regions: { all(): readonly (RankedRegion & { channelId: string })[] };
  /** The channels of a server's regions one of its gyms lies in (`GymDirectory.regionsIn`). */
  gymRegions(guildId: number, gymId: number): readonly string[];
  /** The channels of a server's regions its copy of a Wayspot lies in (`WayspotDirectory.regionsIn`). */
  wayspotRegions(guildId: number, wayspotId: string): readonly string[];
  /**
   * The servers the bot is in, by their snowflakes, asked at each reading (the `Guild` rows,
   * `GuildRepository.snowflakes`: the first reading comes before the login, when the client knows
   * no server yet). The raids are read of these servers only (plan 8Z-2, audit X3).
   */
  servers(): Promise<readonly string[]>;
  /** The party history: the raids of each region since a moment (`HistoryRepository`). */
  activity: {
    raidsByRegion(
      since: number,
      serverIds: readonly string[],
    ): Promise<ReadonlyMap<number, number>>;
  };
  /** Default `Date.now`. */
  now?: () => number;
}

/**
 * The rank of each place in the line that waits for Google (plan 8W-6): its best region's, by
 * the region's raids over the last `RANK_DAYS` days as a part of its server's busiest region
 * (`regionRanks`). The raids are read at `refresh` (at start and once a day: the line ranks by
 * them, not per question); until the first reading, and while there is no history, every region
 * ranks the same. A place waits once per server that has it (plan 19B-3), ranked by that
 * server's regions: a gym in none of them ranks last there; a Wayspot in none has no rank there
 * and does not wait for Google for that server.
 */
export class GoogleRanks {
  /** The raids of each region at the last reading; before the first, none (all alike). */
  private raids: ReadonlyMap<number, number> = new Map();
  /** The ranks worked out of them for one list of the regions (a load gives a new list). */
  private ranked: { regions: readonly RankedRegion[]; ranks: Map<number, number> } | undefined;

  constructor(private readonly options: GoogleRanksOptions) {}

  /**
   * Reads the raids anew, of the servers the bot is in. Rejects when they or the servers cannot
   * be read; the ranks are then as they were.
   */
  async refresh(): Promise<void> {
    const now = (this.options.now ?? Date.now)();
    const servers = await this.options.servers();
    this.raids = await this.options.activity.raidsByRegion(now - RANK_DAYS * 86_400_000, servers);
    this.ranked = undefined;
  }

  /**
   * The ranks of the regions as they are now: worked out again when the regions were loaded
   * anew (a region added or saved ranks at once, by the raids last read), not per question.
   */
  private ranksOf(regions: readonly RankedRegion[]): Map<number, number> {
    if (this.ranked?.regions !== regions) {
      this.ranked = { regions, ranks: regionRanks(regions, this.raids) };
    }
    return this.ranked.ranks;
  }

  private rankOf(channels: readonly string[]): number {
    const regions = this.options.regions.all();
    const ranks = this.ranksOf(regions);
    const ids = channels.flatMap((channelId) => {
      const region = regions.find((one) => one.channelId === channelId);
      return region ? [region.id] : [];
    });
    return bestRank(ids, ranks);
  }

  /** The rank of a server's gym; `NO_REGION_RANK` for one in none of the server's regions. */
  ofGym(guildId: number, gymId: number): number {
    return this.rankOf(this.options.gymRegions(guildId, gymId));
  }

  /** The rank of a server's PokéStop or Power Spot; undefined for one in none of its regions. */
  ofWayspot(guildId: number, wayspotId: string): number | undefined {
    const rank = this.rankOf(this.options.wayspotRegions(guildId, wayspotId));
    return rank === NO_REGION_RANK ? undefined : rank;
  }
}
