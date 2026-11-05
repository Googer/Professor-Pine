import type { ActivityReader } from '../db/repositories/activity-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { PartyGateway, V2Message } from '../discord/party-gateway.js';
import type { BoardPeriod } from '../domain/history/board-periods.js';
import {
  boardMonths,
  keptOut,
  regionBoard,
  type RegionBoard,
} from '../domain/history/region-board.js';

export interface RegionBoardsOptions {
  /** The sums of the activity heatmap's buckets (`ActivityRepository`). */
  reader: Pick<ActivityReader, 'regionSums'>;
  /** The regions now (`RegionDirectory`): a server's are those of its row. */
  regions: { all(): readonly Region[] };
  /** The row of a server (`Guild.id`), by which its regions say whose they are. */
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  /**
   * Who a forum keeps out (`memberAccess`), a region's channel by name, whether a region may be
   * shared into a channel (`shareKeeps`), and the shared board's post (`mayShare`,
   * `sendMessage`).
   */
  gateway: Pick<
    PartyGateway,
    'memberAccess' | 'channelName' | 'shareKeeps' | 'mayShare' | 'sendMessage'
  >;
  /** `settings.timezone`: the months of a period. */
  zone: string;
}

/** A board as shown: its period, the board, and the server's regions now by id. */
export interface ShownBoard {
  period: BoardPeriod;
  board: RegionBoard;
  regions: ReadonlyMap<number, Region>;
}

/**
 * The region board (plan 8H-5, design Part C), for `/stats regions` and the web's history page
 * alike: a server's sums of a period (`ActivityReader.regionSums`) made into the board by the
 * domain (`regionBoard`), the regions some viewer may not see left out as the caller says
 * (`board`), or as Discord says a member is kept out (`forMember`).
 */
export class RegionBoards {
  constructor(private readonly options: RegionBoardsOptions) {}

  /**
   * The board of a server for a period at `now`, leaving out the regions `keepOut` names of the
   * server's regions now (read beside the sums).
   */
  async board(
    serverId: string,
    period: BoardPeriod,
    now: number,
    keepOut: (regions: readonly Region[]) => Promise<ReadonlySet<number>>,
  ): Promise<ShownBoard> {
    const { reader, regions, guilds, zone } = this.options;
    const [sums, row] = await Promise.all([
      reader.regionSums(serverId, boardMonths(period, now, zone)),
      guilds.idFor(serverId),
    ]);
    const own = row === undefined ? [] : regions.all().filter((region) => region.guildId === row);
    const leftOut = await keepOut(own);
    return {
      period,
      board: regionBoard(
        sums,
        own.map((region) => region.id),
        leftOut,
      ),
      regions: new Map(own.map((region) => [region.id, region])),
    };
  }

  /**
   * The board as a member may see it: without the regions whose forum they do not see
   * (`memberAccess` `barred` or `hidden`, `keptOut`: Matt's ruling R-B, the heatmap's rule too;
   * a region without a forum, or whose forum is gone, keeps nobody out). Rejects while Discord
   * cannot say.
   */
  forMember(
    serverId: string,
    period: BoardPeriod,
    memberId: string,
    now: number,
  ): Promise<ShownBoard> {
    return this.board(serverId, period, now, async (regions) => {
      const barred = await Promise.all(
        regions.map(async (region) =>
          region.forumChannelId !== null &&
          keptOut(await this.options.gateway.memberAccess(region.forumChannelId, memberId))
            ? [region.id]
            : [],
        ),
      );
      return new Set(barred.flat());
    });
  }

  /**
   * The regions of `regions` a board shared into a channel leaves out (Matt, 2026-11-05, R-A):
   * those whose forum (or text channel, where they have none) somebody who can view that channel
   * cannot view (`PartyGateway.shareKeeps`), whatever its sharer sees, so that a region's counts
   * reach nobody its forum keeps them from. Undefined where nothing can be said of the channel
   * (not in the cache, R3).
   */
  async notShared(
    regions: readonly Region[],
    shareChannelId: string,
  ): Promise<Set<number> | undefined> {
    const channelOf = (region: Region) => region.forumChannelId ?? region.channelId;
    const kept = await this.options.gateway.shareKeeps(shareChannelId, regions.map(channelOf));
    if (kept === undefined) return undefined;
    return new Set(
      regions.filter((region) => !kept.has(channelOf(region))).map((region) => region.id),
    );
  }

  /**
   * The board as it may be shared into a channel: without the regions `notShared` names;
   * undefined where nothing can be said of the channel (R3), so that nothing is shared there.
   */
  async forShare(
    serverId: string,
    period: BoardPeriod,
    shareChannelId: string,
    now: number,
  ): Promise<ShownBoard | undefined> {
    let unknown = false;
    const shown = await this.board(serverId, period, now, async (regions) => {
      const left = await this.notShared(regions, shareChannelId);
      if (left === undefined) unknown = true;
      return left ?? new Set(regions.map((region) => region.id));
    });
    return unknown ? undefined : shown;
  }

  /** Whether the bot may post a shared board in a channel (from the cache: `mayShare`). */
  mayShare(channelId: string): boolean {
    return this.options.gateway.mayShare(channelId);
  }

  /**
   * Posts a shared board in a channel; its id, or undefined where the channel is gone (or, in
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
