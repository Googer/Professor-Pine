import type { ActivityReader } from '../db/repositories/activity-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { PartyGateway, V2Message } from '../discord/party-gateway.js';
import type { TallyPeriod } from '../domain/history/tally-periods.js';
import {
  tallyMonths,
  keptOut,
  regionTally,
  regionGate,
  type RegionTally,
} from '../domain/history/region-tally.js';

export interface RegionTalliesOptions {
  /** The sums of the activity heatmap's buckets (`ActivityRepository`). */
  reader: Pick<ActivityReader, 'regionSums'>;
  /** The regions now (`RegionDirectory`): a server's are those of its row. */
  regions: { all(): readonly Region[] };
  /** The row of a server (`Guild.id`), by which its regions say whose they are. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /**
   * Who a forum keeps out (`memberAccess`), a region's channel by name, whether a region may be
   * shared into a channel (`shareKeeps`), and the shared tally's post (`mayShare`,
   * `sendMessage`).
   */
  gateway: Pick<
    PartyGateway,
    'memberAccess' | 'channelName' | 'shareKeeps' | 'mayShare' | 'sendMessage'
  >;
  /** `settings.timezone`: the months of a period. */
  zone: string;
}

/** A tally as shown: its period, the tally, and the server's regions now by id. */
export interface ShownTally {
  period: TallyPeriod;
  tally: RegionTally;
  regions: ReadonlyMap<number, Region>;
}

/**
 * The region tally (plan 8H-5, design Part C), for `/stats regions` and the web's history page
 * alike: a server's sums of a period (`ActivityReader.regionSums`) made into the tally by the
 * domain (`regionTally`), the regions some viewer may not see left out as the caller says
 * (`tally`), or as Discord says a member is kept out (`forMember`).
 */
export class RegionTallies {
  constructor(private readonly options: RegionTalliesOptions) {}

  /**
   * The tally of a server for a period at `now`, leaving out the regions `keepOut` names of the
   * server's regions now (read beside the sums).
   */
  async tally(
    serverId: string,
    period: TallyPeriod,
    now: number,
    keepOut: (regions: readonly Region[]) => Promise<ReadonlySet<number>>,
  ): Promise<ShownTally> {
    const { reader, regions, guilds, zone } = this.options;
    const [sums, row] = await Promise.all([
      reader.regionSums(serverId, tallyMonths(period, now, zone)),
      guilds.idFor(serverId),
    ]);
    const own = row === undefined ? [] : regions.all().filter((region) => region.guildId === row);
    const leftOut = await keepOut(own);
    return {
      period,
      tally: regionTally(
        sums,
        own.map((region) => region.id),
        leftOut,
      ),
      regions: new Map(own.map((region) => [region.id, region])),
    };
  }

  /**
   * The tally as a member may see it: without the regions whose forum (or text channel, where
   * they have none: `regionGate`, 8H5-2) that keeps them out (`memberAccess` `barred`, `keptOut`,
   * the party layer's and the heatmap's rule; one only their roles hide is shown; a channel that
   * is gone keeps nobody out). Rejects while Discord cannot say.
   */
  forMember(
    serverId: string,
    period: TallyPeriod,
    memberId: string,
    now: number,
  ): Promise<ShownTally> {
    return this.tally(serverId, period, now, async (regions) => {
      const barred = await Promise.all(
        regions.map(async (region) =>
          keptOut(await this.options.gateway.memberAccess(regionGate(region), memberId))
            ? [region.id]
            : [],
        ),
      );
      return new Set(barred.flat());
    });
  }

  /**
   * The regions of `regions` a tally shared into a channel leaves out (Matt, 2026-11-05, R-A):
   * those whose forum (or text channel, where they have none) somebody who can view that channel
   * cannot view (`PartyGateway.shareKeeps`), whatever its sharer sees, so that a region's counts
   * reach nobody its forum keeps them from. Undefined where nothing can be said of the channel
   * (not in the cache, R3).
   */
  async notShared(
    regions: readonly Region[],
    shareChannelId: string,
  ): Promise<Set<number> | undefined> {
    const kept = await this.options.gateway.shareKeeps(shareChannelId, regions.map(regionGate));
    if (kept === undefined) return undefined;
    return new Set(
      regions.filter((region) => !kept.has(regionGate(region))).map((region) => region.id),
    );
  }

  /**
   * The tally as it may be shared into a channel: without the regions `notShared` names;
   * undefined where nothing can be said of the channel (R3), so that nothing is shared there.
   */
  async forShare(
    serverId: string,
    period: TallyPeriod,
    shareChannelId: string,
    now: number,
  ): Promise<ShownTally | undefined> {
    let unknown = false;
    const shown = await this.tally(serverId, period, now, async (regions) => {
      const left = await this.notShared(regions, shareChannelId);
      if (left === undefined) unknown = true;
      return left ?? new Set(regions.map((region) => region.id));
    });
    return unknown ? undefined : shown;
  }

  /** Whether the bot may post a shared tally in a channel (from the cache: `mayShare`). */
  mayShare(channelId: string): boolean {
    return this.options.gateway.mayShare(channelId);
  }

  /**
   * Posts a shared tally in a channel; its id, or undefined where the channel is gone (or, in
   * rehearsal mode, outside the posts of parties). Rejects as Discord refuses it.
   */
  post(channelId: string, message: V2Message): Promise<string | undefined> {
    return this.options.gateway.sendMessage(channelId, message);
  }

  /** A region on Discord: its channel as a mention, or its number where the bot sees no channel. */
  regionText(region: Region): string {
    return this.options.gateway.channelName(region.channelId) === undefined
      ? `Region ${region.id}`
      : `<#${region.channelId}>`;
  }
}
