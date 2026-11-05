import type { ActivityReader } from '../db/repositories/activity-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
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
  /** Who a forum keeps out (`memberAccess`), and a region's channel by name. */
  gateway: Pick<PartyGateway, 'memberAccess' | 'channelName'>;
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

  /** A region on Discord: its channel as a mention, or its number where the bot sees no channel. */
  regionText(region: Region): string {
    return this.options.gateway.channelName(region.channelId) === undefined
      ? `Region ${region.id}`
      : `<#${region.channelId}>`;
  }
}
