import type {
  BoardRange,
  BoardReader,
  WantDay,
} from '../../src/db/repositories/board-repository.js';
import {
  CLOSED_ENDING,
  COUNTING_ENDINGS,
  type BoardCredit,
  type ReportCredit,
  type ReportScore,
  type RideCredit,
  type SplitLink,
} from '../../src/domain/history/boards.js';
import type { MemberParty, MemberReport } from '../../src/domain/history/member-stats.js';
import type { HistoryRecord, HistoryStatus } from '../../src/domain/history/party-history.js';
import { Boards } from '../../src/services/boards.js';
import { MemberNames } from '../../src/services/member-names.js';
import { MemberStatsService } from '../../src/services/member-stats.js';
import type { KeptReport } from './board-cases.js';
import { catalogueFixture } from './game-data.js';
import { MemoryHistoryOptIns } from './history.js';
import { FakeMemberDirectory } from './members.js';
import { regionTalliesWith } from './region-tallies.js';
import { researchTasksFixture } from './research.js';

/** A report to the moderators about a party, as decided. */
interface Moderated {
  partyId: string;
  status: string;
}

/** A block of a member from making meetups in a server. */
interface Block {
  serverId: string;
  memberId: string;
  blockedAt: number;
  liftedAt: number | null;
}

const counts = (ending: string): boolean => COUNTING_ENDINGS.some((one) => one === ending);

/**
 * The boards' reads kept in memory as `BoardRepository` reads them (`boardReaderCases` runs on
 * both): the party records (`records`), the records of reports at stops (`reports`), who is on
 * the boards (`optIns`, a `MemoryHistoryOptIns`, which `/settings` in a test may share), the want
 * counts (`wantDays`), the moderators' decisions about parties (`moderated`) and blocks
 * (`blocks`). `reads` counts every read; `failing` makes each reject.
 */
export class MemoryBoards implements BoardReader {
  failing: Error | undefined;
  reads = 0;
  readonly records: HistoryRecord[] = [];
  readonly reports: KeptReport[] = [];
  readonly wantDays: { serverId: string; day: string; target: string; count: number }[] = [];
  readonly moderated: Moderated[] = [];
  readonly blocks: Block[] = [];

  constructor(readonly optIns = new MemoryHistoryOptIns()) {}

  private answer<T>(work: () => T): Promise<T> {
    this.reads += 1;
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private live(serverId: string, kinds: readonly string[], since: number | null) {
    return this.records.filter(
      (record) =>
        record.serverId === serverId &&
        record.source === 'live' &&
        kinds.includes(record.kind) &&
        (since === null || record.createdAt >= since),
    );
  }

  private static another(
    record: HistoryRecord,
    memberId: string,
    furthest: readonly HistoryStatus[],
  ): boolean {
    return record.attendees.some(
      (one) => furthest.includes(one.furthest) && one.memberId !== memberId,
    );
  }

  private static credit(record: HistoryRecord, memberId: string): BoardCredit {
    return { memberId, at: record.createdAt, anonymous: record.anonymous };
  }

  raidCredits(serverId: string, range: BoardRange): Promise<BoardCredit[]> {
    return this.answer(() =>
      this.live(serverId, ['raid', 'max'], range.since).flatMap((record) => {
        const maker = record.createdById;
        if (maker === null || (range.memberId !== undefined && maker !== range.memberId)) {
          return [];
        }
        if (record.ending === CLOSED_ENDING || !MemoryBoards.another(record, maker, ['done'])) {
          return [];
        }
        return [MemoryBoards.credit(record, maker)];
      }),
    );
  }

  trainCredits(serverId: string, range: BoardRange): Promise<RideCredit[]> {
    return this.answer(() =>
      this.live(serverId, ['train'], range.since).flatMap((record) =>
        record.attendees.flatMap((one) => {
          const id = one.memberId;
          if (id === null || (range.memberId !== undefined && id !== range.memberId)) return [];
          if ((one.conducted ?? 0) < 1) return [];
          if (!MemoryBoards.another(record, id, ['here', 'done'])) return [];
          return [{ ...MemoryBoards.credit(record, id), partyId: record.partyId ?? '' }];
        }),
      ),
    );
  }

  splitLinks(serverId: string): Promise<SplitLink[]> {
    return this.answer(() =>
      this.records.flatMap((record) =>
        record.serverId === serverId &&
        record.kind === 'train' &&
        record.partyId !== null &&
        record.splitFromId !== null
          ? [{ partyId: record.partyId, splitFromId: record.splitFromId }]
          : [],
      ),
    );
  }

  meetupCredits(serverId: string, range: BoardRange): Promise<BoardCredit[]> {
    return this.answer(() =>
      this.live(serverId, ['meetup'], range.since).flatMap((record) => {
        const maker = record.createdById;
        if (maker === null || (range.memberId !== undefined && maker !== range.memberId)) {
          return [];
        }
        if (!MemoryBoards.another(record, maker, ['here', 'done'])) return [];
        if (record.closedBy !== null) return [];
        const closed = this.moderated.some(
          (one) =>
            one.partyId === record.partyId && ['closed', 'refused', 'blocked'].includes(one.status),
        );
        const end = record.endedAt ?? record.createdAt;
        const blocked = this.blocks.some(
          (block) =>
            block.serverId === serverId &&
            block.memberId === maker &&
            block.blockedAt <= end &&
            (block.liftedAt === null || block.liftedAt > end),
        );
        return closed || blocked ? [] : [MemoryBoards.credit(record, maker)];
      }),
    );
  }

  reportCredits(serverId: string, range: BoardRange): Promise<ReportCredit[]> {
    return this.answer(() =>
      this.reports.flatMap((report) => {
        const id = report.reporterId;
        if (report.serverId !== serverId || id === null || !counts(report.ending)) return [];
        if (range.since !== null && report.endedAt < range.since) return [];
        if (range.memberId !== undefined && id !== range.memberId) return [];
        return [{ memberId: id, at: report.endedAt, confirmations: report.confirmations }];
      }),
    );
  }

  reportScores(serverId: string, memberIds?: readonly string[]): Promise<ReportScore[]> {
    return this.answer(() => {
      const scores = new Map<string, ReportScore>();
      for (const report of this.reports) {
        const id = report.reporterId;
        if (report.serverId !== serverId || id === null) continue;
        if (memberIds !== undefined && !memberIds.includes(id)) continue;
        const was = scores.get(id) ?? {
          memberId: id,
          confirmations: 0,
          contradicted: 0,
          counted: 0,
        };
        scores.set(id, {
          memberId: id,
          confirmations: was.confirmations + (report.ending === 'staff' ? 0 : report.confirmations),
          contradicted: was.contradicted + (report.ending === 'contradicted' ? 1 : 0),
          counted: was.counted + (counts(report.ending) ? 1 : 0),
        });
      }
      return [...scores.values()];
    });
  }

  onBoards(serverId: string): Promise<Set<string>> {
    return this.answer(() => this.optIns.onBoards(serverId));
  }

  latestWants(serverId: string): Promise<WantDay | undefined> {
    return this.answer(() => {
      const own = this.wantDays.filter((row) => row.serverId === serverId);
      const day = own
        .map((row) => row.day)
        .sort()
        .at(-1);
      if (day === undefined) return undefined;
      return {
        day,
        counts: own
          .filter((row) => row.day === day && row.target.startsWith('species:'))
          .map((row) => ({ target: row.target, count: row.count })),
      };
    });
  }

  bossSends(serverId: string, since: number | null): Promise<{ bossKey: string; sent: number }[]> {
    return this.answer(() => {
      const sums = new Map<string, number>();
      for (const record of this.live(serverId, ['raid', 'max'], since)) {
        const { boss } = record;
        if (boss === null || !('key' in boss)) continue;
        sums.set(boss.key, (sums.get(boss.key) ?? 0) + record.reached);
      }
      return [...sums].map(([bossKey, sent]) => ({ bossKey, sent }));
    });
  }

  taskReports(
    serverId: string,
    since: number | null,
  ): Promise<{ subjectKey: string; text: string | null; reports: number }[]> {
    return this.answer(() => {
      const subjects = new Map<string, { text: string | null; reports: number }>();
      for (const report of this.reports) {
        if (report.serverId !== serverId || report.kind !== 'research') continue;
        if (!counts(report.ending) || report.subjectKey.startsWith('typed:')) continue;
        if (since !== null && report.endedAt < since) continue;
        const was = subjects.get(report.subjectKey);
        subjects.set(report.subjectKey, {
          text: was?.text ?? report.text,
          reports: (was?.reports ?? 0) + 1,
        });
      }
      return [...subjects].map(([subjectKey, row]) => ({ subjectKey, ...row }));
    });
  }

  memberParties(serverId: string, memberId: string): Promise<MemberParty[]> {
    return this.answer(() =>
      this.records.flatMap((record) => {
        if (record.serverId !== serverId) return [];
        const own = record.attendees.find((one) => one.memberId === memberId);
        const made = record.createdById === memberId;
        if (!made && own === undefined) return [];
        const { boss } = record;
        return [
          {
            partyId: record.partyId ?? record.legacyKey ?? '',
            splitFromId: record.splitFromId,
            kind: record.kind,
            at: record.createdAt,
            regionId: record.regionId,
            bossKey: boss !== null && 'key' in boss ? boss.key : null,
            anonymous: record.anonymous,
            made,
            furthest: own?.furthest ?? null,
            reached: record.reached,
          },
        ];
      }),
    );
  }

  memberReports(serverId: string, memberId: string): Promise<MemberReport[]> {
    return this.answer(() =>
      this.reports
        .filter((report) => report.serverId === serverId && report.reporterId === memberId)
        .map((report) => ({ at: report.endedAt, reach: report.reach })),
    );
  }
}

/**
 * The boards (plan 8H-6) over memory, as the bot wires them: `reader` (`MemoryBoards`, empty)
 * over `optIns` (a `MemoryHistoryOptIns`, which `/settings leaderboard` writes), the names of
 * `members` (a `FakeMemberDirectory`: nobody until `add`) through `names`, the fixtures'
 * catalogue and task list, and the region tally's fake gateway (`regionTalliesWith`), which a
 * Share posts through. Pass `context` to `createTestContext`.
 */
export function boardsWith(zone = 'America/New_York') {
  const made = regionTalliesWith(zone);
  const optIns = new MemoryHistoryOptIns();
  const reader = new MemoryBoards(optIns);
  const members = new FakeMemberDirectory();
  const names = new MemberNames({ members });
  const boards = new Boards({
    reader,
    names,
    catalogue: catalogueFixture(),
    tasks: researchTasksFixture(),
    gateway: made.gateway,
    zone,
  });
  const memberStats = new MemberStatsService({ reader, optIns, zone });
  return {
    ...made,
    reader,
    optIns,
    members,
    names,
    boards,
    memberStats,
    context: {
      boards,
      memberStats,
      historyOptIns: optIns,
      members,
      memberNames: names,
      regionTallies: made.tallies,
    },
  };
}

/** The world of `boardReaderCases` over a `MemoryBoards`. */
export function memoryBoardWorld(boards = new MemoryBoards()) {
  return {
    reader: boards,
    party: (record: HistoryRecord) => {
      boards.records.push(record);
      return Promise.resolve();
    },
    report: (report: KeptReport) => {
      boards.reports.push(report);
      return Promise.resolve();
    },
    onBoard: async (memberId: string, serverId = BOARD_SERVER_OF_CASES) => {
      await boards.optIns.joinBoards(memberId, serverId, 1);
    },
    optedIn: async (memberId: string, serverId = BOARD_SERVER_OF_CASES) => {
      await boards.optIns.optIn(memberId, serverId, 1);
    },
    wants: (day: string, target: string, count: number, serverId = BOARD_SERVER_OF_CASES) => {
      boards.wantDays.push({ serverId, day, target, count });
      return Promise.resolve();
    },
    moderated: (partyId: string, status: string) => {
      boards.moderated.push({ partyId, status });
      return Promise.resolve();
    },
    blocked: (memberId: string, at: number, lifted?: number) => {
      boards.blocks.push({
        serverId: BOARD_SERVER_OF_CASES,
        memberId,
        blockedAt: at,
        liftedAt: lifted ?? null,
      });
      return Promise.resolve();
    },
  };
}

/** The server of `boardReaderCases` (`BOARD_SERVER`), here so as not to import the cases' file. */
const BOARD_SERVER_OF_CASES = '412345678901234567';
