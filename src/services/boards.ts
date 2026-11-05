import type { BoardReader } from '../db/repositories/board-repository.js';
import type { PartyGateway, V2Message } from '../discord/party-gateway.js';
import {
  BOARD_SIZE,
  isPeopleBoard,
  type BoardName,
  type PeopleBoard,
  type ThingBoard,
} from '../domain/history/board-words.js';
import {
  peopleStandings,
  mostReportedTasks,
  mostSent,
  mostWanted,
  periodStart,
  reportsThatCount,
  rides,
  type ThingRow,
} from '../domain/history/boards.js';
import type { TallyPeriod } from '../domain/history/tally-periods.js';
import type { MemberNames } from './member-names.js';

/** As many members a board asks names of at most, its viewer aside (B4: about fifty). */
export const BOARD_NAME_ASKS = 50;
/** As many names as one ask takes: the ten shown and a few who may have left. */
const NAME_BATCH = BOARD_SIZE + 5;

export interface BoardsOptions {
  reader: BoardReader;
  /** The names of the members shown (`MemberNames`). */
  names: Pick<MemberNames, 'names'>;
  /** The catalogue's names: a species by its number, a boss by its key. */
  catalogue: {
    species(dex: number): { name: string } | undefined;
    byKey(key: string): { name: string } | undefined;
  };
  /** The task list's words of a task by its key, where it still has it. */
  tasks: { byKey(key: string): { text: string } | undefined };
  /** Whether the bot may post a shared board in a channel, and the post (`PartyGateway`). */
  gateway: Pick<PartyGateway, 'mayShare' | 'sendMessage'>;
  /** `settings.timezone`: a period's months. */
  zone: string;
}

/** A member's line of a board: their rank among those shown, their name and their counts. */
export interface PersonRow {
  rank: number;
  memberId: string;
  name: string;
  count: number;
  confirmations: number;
}

/**
 * Where the viewer stands, under a board they are not shown on: their rank on it (on the board),
 * or the rank they would have (`off`: their switch is off), and their counts.
 */
export interface ViewerPlace {
  rank: number;
  on: boolean;
  count: number;
  confirmations: number;
}

export type ShownBoard =
  | {
      kind: 'people';
      board: PeopleBoard;
      period: TallyPeriod;
      rows: PersonRow[];
      /** Undefined where nobody asked, or the viewer is shown, or has nothing on it. */
      viewer?: ViewerPlace;
    }
  | {
      kind: 'things';
      board: ThingBoard;
      period: TallyPeriod;
      rows: (ThingRow & { rank: number })[];
      /** The day of the want counts (the most wanted); undefined elsewhere, or none yet. */
      day?: string;
    };

/**
 * The boards (plan 8H-6, design Part D), for `/stats boards` and the web's history page alike:
 * the reader's rows ranked by the domain (`src/domain/history/boards.ts`), the members named by
 * `MemberNames` (one without a name is left out and the ranks close up), only members on the
 * boards ranked (both switches on when the board is read), only what was not anonymous.
 */
export class Boards {
  constructor(private readonly options: BoardsOptions) {}

  /**
   * A board of a server for a period at `now`. `viewer`: the member asking and their name, whose
   * own place is said where the board does not show them.
   */
  async board(
    serverId: string,
    board: BoardName,
    period: TallyPeriod,
    now: number,
    viewer?: { id: string; name: string },
  ): Promise<ShownBoard> {
    if (!isPeopleBoard(board)) return this.things(serverId, board, period, now);
    const since = periodStart(period, now, this.options.zone);
    const [credits, onBoards] = await Promise.all([
      this.credits(serverId, board, since),
      this.options.reader.onBoards(serverId),
    ]);
    // Everybody's place, and of them the members on the boards, ranked (A6).
    const { standings, ranked: boarded } = peopleStandings(credits, onBoards);
    const given = new Map(viewer === undefined ? [] : [[viewer.id, viewer.name]]);
    const rows: PersonRow[] = [];
    // Named a batch at a time until ten have a name, fifty asked at most (B4).
    const asked = boarded.slice(0, BOARD_NAME_ASKS);
    for (let start = 0; start < asked.length && rows.length < BOARD_SIZE; start += NAME_BATCH) {
      const batch = asked.slice(start, start + NAME_BATCH);
      const names = await this.options.names.names(
        serverId,
        batch.map((one) => one.memberId),
        given,
      );
      for (const one of batch) {
        const name = names.get(one.memberId);
        if (name === undefined || rows.length >= BOARD_SIZE) continue;
        rows.push({
          rank: rows.length + 1,
          memberId: one.memberId,
          name,
          count: one.count,
          confirmations: one.confirmations,
        });
      }
    }
    const shown: ShownBoard = { kind: 'people', board, period, rows };
    if (viewer === undefined || rows.some((row) => row.memberId === viewer.id)) return shown;
    const own = standings.find((one) => one.memberId === viewer.id);
    if (own === undefined) return shown;
    // Their rank among the members on the board as the board ranks them (B2): those above them
    // who have a name, then they themself (where their switch is off, the rank they would have).
    // Above the fiftieth asked (B4) nobody is asked a name: they count as they are.
    const ownIndex = standings.indexOf(own);
    const above = boarded.filter((one) => standings.indexOf(one) < ownIndex);
    const askedAbove = above.slice(0, BOARD_NAME_ASKS);
    const named = await this.options.names.names(
      serverId,
      askedAbove.map((one) => one.memberId),
      given,
    );
    const aboveNamed =
      askedAbove.filter((one) => named.has(one.memberId)).length +
      (above.length - askedAbove.length);
    return {
      ...shown,
      viewer: {
        rank: aboveNamed + 1,
        on: onBoards.has(viewer.id),
        count: own.count,
        confirmations: own.confirmations,
      },
    };
  }

  /**
   * The credits of a board of people (`peopleStandings` ranks them): a train ride once per
   * member (`rides`), of the trains not anonymous.
   */
  private async credits(
    serverId: string,
    board: PeopleBoard,
    since: number | null,
  ): Promise<
    readonly { memberId: string; at: number; anonymous?: boolean; confirmations?: number }[]
  > {
    const { reader } = this.options;
    const range = { since };
    switch (board) {
      case 'raids':
        return reader.raidCredits(serverId, range);
      case 'trains': {
        const [credits, links] = await Promise.all([
          reader.trainCredits(serverId, range),
          reader.splitLinks(serverId),
        ]);
        return rides(
          credits.filter((one) => !one.anonymous),
          links,
        );
      }
      case 'meetups':
        return reader.meetupCredits(serverId, range);
      case 'reports': {
        const credits = await reader.reportCredits(serverId, range);
        const scores = await reader.reportScores(serverId, [
          ...new Set(credits.map((one) => one.memberId)),
        ]);
        return reportsThatCount(credits, scores);
      }
    }
  }

  private async things(
    serverId: string,
    board: ThingBoard,
    period: TallyPeriod,
    now: number,
  ): Promise<ShownBoard> {
    const { reader, catalogue, tasks } = this.options;
    const since = periodStart(period, now, this.options.zone);
    const ranked = (rows: ThingRow[]) => rows.map((row, index) => ({ ...row, rank: index + 1 }));
    switch (board) {
      case 'wanted': {
        const day = await reader.latestWants(serverId);
        const rows = mostWanted(day?.counts ?? [], (dex) => catalogue.species(dex)?.name);
        return {
          kind: 'things',
          board,
          period,
          rows: ranked(rows),
          ...(day === undefined ? {} : { day: day.day }),
        };
      }
      case 'sent': {
        const rows = mostSent(
          await reader.bossSends(serverId, since),
          (key) => catalogue.byKey(key)?.name,
        );
        return { kind: 'things', board, period, rows: ranked(rows) };
      }
      case 'tasks': {
        const rows = mostReportedTasks(
          await reader.taskReports(serverId, since),
          (key) => tasks.byKey(key)?.text,
        );
        return { kind: 'things', board, period, rows: ranked(rows) };
      }
    }
  }

  /** Whether the bot may post a shared board in a channel (from the cache: `mayShare`). */
  mayShare(channelId: string): boolean {
    return this.options.gateway.mayShare(channelId);
  }

  /** Posts a shared board; its id, or undefined where the channel is gone. */
  post(channelId: string, message: V2Message): Promise<string | undefined> {
    return this.options.gateway.sendMessage(channelId, message);
  }
}
