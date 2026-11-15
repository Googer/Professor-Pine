import { BoundedMap } from '../bounded-map.js';
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
  type Standing,
  type ThingRow,
} from '../domain/history/boards.js';
import type { TallyPeriod } from '../domain/history/tally-periods.js';
import type { MemberNames } from './member-names.js';

/** As many members a board asks names of at most, its viewer aside (B4: about fifty). */
export const BOARD_NAME_ASKS = 50;
/** A board that could not be shown for want of its members' names (W5). */
export class NamesUnavailable extends Error {
  constructor(cause: unknown) {
    super('Could not name the members of a board', { cause });
    this.name = 'NamesUnavailable';
  }
}

/** How long a board's read of a server and period is used for (W2). */
export const BOARD_READ_FRESH_MS = 60_000;
/** As many reads as are kept at once; the oldest goes first. */
const BOARD_READS_KEPT = 500;

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
  /** A server's zone (`ServerSettings.zoneOf`, plan 19A-2): a period's months there. */
  zoneOf: (serverId: string) => string;
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
 * A board of people as shown (W1: from the one answer of names of the call): its first ten
 * members on the boards with a name, ranked as they stand, and where the viewer stands where the
 * board does not show them (B2: one more than the named members above them among the first
 * `BOARD_NAME_ASKS`, and those beyond, counted as they are).
 */
function peopleBoard(
  placed: { board: PeopleBoard; standings: Standing[]; ranked: Standing[] },
  period: TallyPeriod,
  names: ReadonlyMap<string, string>,
  onBoards: ReadonlySet<string>,
  viewer: { id: string } | undefined,
): ShownBoard {
  const { board, standings, ranked } = placed;
  const rows: PersonRow[] = [];
  for (const one of ranked.slice(0, BOARD_NAME_ASKS)) {
    if (rows.length >= BOARD_SIZE) break;
    const name = names.get(one.memberId);
    if (name === undefined) continue;
    rows.push({
      rank: rows.length + 1,
      memberId: one.memberId,
      name,
      count: one.count,
      confirmations: one.confirmations,
    });
  }
  const shown: ShownBoard = { kind: 'people', board, period, rows };
  if (viewer === undefined || rows.some((row) => row.memberId === viewer.id)) return shown;
  const own = standings.find((one) => one.memberId === viewer.id);
  if (own === undefined) return shown;
  const ownIndex = standings.indexOf(own);
  const above = ranked.filter((one) => standings.indexOf(one) < ownIndex);
  const askedAbove = above.slice(0, BOARD_NAME_ASKS);
  const aboveNamed =
    askedAbove.filter((one) => names.has(one.memberId)).length + (above.length - askedAbove.length);
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
 * The boards (plan 8H-6, design Part D), for `/stats boards` and the web's history page alike:
 * the reader's rows ranked by the domain (`src/domain/history/boards.ts`), the members named by
 * `MemberNames` (one without a name is left out and the ranks close up), only members on the
 * boards ranked (both switches on when the board is read), only what was not anonymous.
 */
export class Boards {
  /** What each (server, board, period) read, kept `BOARD_READ_FRESH_MS` (W2). */
  private readonly kept = new BoundedMap<string, { until: number; read: Promise<unknown> }>(
    BOARD_READS_KEPT,
  );

  constructor(private readonly options: BoardsOptions) {}

  /**
   * A board of a server for a period at `now`. `viewer`: the member asking, whose own place is
   * said where the board does not show them, and their name in the server where the caller has
   * it (an interaction's; asked of Discord otherwise, as everybody's).
   */
  async board(
    serverId: string,
    board: BoardName,
    period: TallyPeriod,
    now: number,
    viewer?: { id: string; name?: string },
  ): Promise<ShownBoard> {
    const [shown] = await this.boards(serverId, [board], period, now, viewer);
    if (shown === undefined) throw new Error(`No board ${board}`);
    return shown;
  }

  /**
   * Boards of a server for a period at `now`, in the order asked (the history page asks for all
   * of them). Who is on the boards is read once for them all (W2); each board's records are read
   * at most once a `BOARD_READ_FRESH_MS` per server and period; the names of the members they
   * may show are asked of Discord once for them all (W1): the first `BOARD_NAME_ASKS` on each
   * board, of which each board shows its first ten with a name and the viewer's place counts
   * those above them.
   */
  async boards(
    serverId: string,
    asked: readonly BoardName[],
    period: TallyPeriod,
    now: number,
    viewer?: { id: string; name?: string },
  ): Promise<ShownBoard[]> {
    const since = periodStart(period, now, this.options.zoneOf(serverId));
    const people = asked.filter(isPeopleBoard);
    const onBoards =
      people.length === 0 ? new Set<string>() : await this.options.reader.onBoards(serverId);
    const placed = await Promise.all(
      people.map(async (board) => {
        const credits = await this.read(`${serverId}:${board}:${period}`, now, () =>
          this.credits(serverId, board, since),
        );
        return { board, ...peopleStandings(credits, onBoards) };
      }),
    );
    const ids = [
      ...new Set(
        placed.flatMap((one) => one.ranked.slice(0, BOARD_NAME_ASKS).map((s) => s.memberId)),
      ),
    ];
    const given = new Map(viewer?.name === undefined ? [] : [[viewer.id, viewer.name] as const]);
    let names: Map<string, string>;
    try {
      names =
        ids.length === 0
          ? new Map<string, string>()
          : await this.options.names.names(serverId, ids, given);
    } catch (err) {
      // Discord could not say, or the names had their share of its minute (W1): the board
      // cannot be shown, and the caller says so (W5).
      throw new NamesUnavailable(err);
    }
    const shownPeople = new Map(
      placed.map((one) => [one.board, peopleBoard(one, period, names, onBoards, viewer)]),
    );
    return Promise.all(
      asked.map((board) =>
        isPeopleBoard(board)
          ? Promise.resolve(shownPeople.get(board) as ShownBoard)
          : this.read(`${serverId}:${board}:${period}`, now, () =>
              this.things(serverId, board, period, now),
            ),
      ),
    );
  }

  /**
   * A read kept `BOARD_READ_FRESH_MS` from `now` under its key, one on its way shared; a read
   * that failed is not kept.
   */
  private read<T>(key: string, now: number, work: () => Promise<T>): Promise<T> {
    const kept = this.kept.get(key);
    if (kept !== undefined && kept.until > now) return kept.read as Promise<T>;
    const read = work();
    this.kept.set(key, { until: now + BOARD_READ_FRESH_MS, read });
    read.catch(() => {
      if (this.kept.get(key)?.read === read) this.kept.delete(key);
    });
    return read;
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
    const since = periodStart(period, now, this.options.zoneOf(serverId));
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
