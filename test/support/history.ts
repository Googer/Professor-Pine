import {
  RAIDS_ALONG_REACH_MS,
  type HistoryOptIns,
  type HistoryStorage,
  type JoinedBoards,
  type OptedOut,
  type RaidsAlongReader,
  type UnrecordedParty,
} from '../../src/db/repositories/history-repository.js';
import {
  raidTime,
  type RaidAlongRow,
  type RaidsAlongQuery,
} from '../../src/domain/history/train-card.js';
import type {
  HistoryNote,
  HistoryRecord,
  HistoryStep,
} from '../../src/domain/history/party-history.js';
import type { Party } from '../../src/domain/party/party.js';

/**
 * The options of a `PartyRepository` in a test that expects no note of the history to fail: a
 * failure throws (after the party's write), so the test sees it.
 */
export const HISTORY_MUST_NOT_FAIL = {
  historyFailed: (_note: HistoryNote, err: unknown): never => {
    throw err instanceof Error ? err : new Error(String(err));
  },
};

/** The server of the invented parties (row 1), as the fake gateway names it. */
export const HISTORY_SERVER = '412345678901234567';

/** What stands in for an ended party's row once it was recorded (`EndedPartyPost`). */
export interface KeptPost {
  forumChannelId: string;
  guildId: number;
}

/**
 * The party history kept in memory as `HistoryRepository` keeps it (history-recording.db.test.ts
 * pins that down): the steps of active parties, the records of those that ended, who opted in
 * (by server snowflake), and the posts of parties whose rows were deleted. `parties` are the
 * rows of the party storage it sits beside (`MemoryPartyStorage` sets them): a record deletes
 * the rows of its party and of those it went on from, as the repository does. `apply` writes a
 * note all or nothing, as the storage does in its transaction. Set `failing` to make every write
 * throw (reject, through `write`).
 */
export class MemoryHistory implements HistoryStorage, RaidsAlongReader {
  failing: Error | undefined;
  readonly records: HistoryRecord[] = [];
  readonly posts = new Map<string, KeptPost>();
  /** The rows of the parties; empty until a storage sets its own. */
  parties = new Map<string, Party>();
  /** The snowflakes of the servers, by row. */
  readonly servers = new Map<number, string>([[1, HISTORY_SERVER]]);
  private kept: HistoryStep[] = [];
  private readonly opted = new Set<string>();

  /** The steps of the parties that have no record yet, oldest first. */
  get steps(): readonly HistoryStep[] {
    return this.kept;
  }

  /** The member opted in to be named in the history of the server of this row. */
  optIn(guildId: number, memberId: string): void {
    this.opted.add(`${this.servers.get(guildId) ?? String(guildId)}:${memberId}`);
  }

  /** The party and every party it went on from, through those that have ended, itself first. */
  private lineage(partyId: string): string[] {
    const found = [partyId];
    for (let at = 0; at < found.length; at++) {
      for (const step of this.kept) {
        const { subject } = step;
        if (
          step.kind === 'from' &&
          step.partyId === found[at] &&
          !found.includes(subject) &&
          this.parties.get(subject)?.status === 'ended'
        ) {
          found.push(subject);
        }
      }
    }
    return found;
  }

  private forget(partyIds: readonly string[]): void {
    for (const id of partyIds) {
      const row = this.parties.get(id);
      if (row?.forumPostId && row.forumChannelId) {
        this.posts.set(row.forumPostId, {
          forumChannelId: row.forumChannelId,
          guildId: row.guildId,
        });
      }
      this.parties.delete(id);
    }
    this.kept = this.kept.filter((step) => !partyIds.includes(step.partyId));
  }

  /** Answers the record it wrote, as the repository's `write`; none where it wrote none. */
  apply(note: HistoryNote, options: { retry?: boolean } = {}): HistoryRecord | undefined {
    if (this.failing) throw this.failing;
    const { partyId, end } = note;
    const row = this.parties.get(partyId);
    if (end === undefined) {
      if (!options.retry || row?.status === 'active') this.kept = [...this.kept, ...note.steps];
      return undefined;
    }
    if (!row) return undefined;
    const before = this.kept;
    this.kept = [...this.kept, ...note.steps];
    try {
      if (end.kind === 'move') {
        if (this.parties.has(end.to)) {
          this.kept.push({
            partyId: end.to,
            at: row.updatedAt,
            kind: 'from',
            subject: partyId,
            value: null,
          });
        }
        return undefined;
      }
      if (end.kind === 'drop') {
        this.forget([partyId]);
        return undefined;
      }
      const lineage = this.lineage(partyId);
      const own = this.kept
        .filter((step) => lineage.includes(step.partyId))
        .sort((a, b) => a.at - b.at);
      const serverId = this.servers.get(note.guildId);
      if (serverId === undefined) throw new Error(`Party ${partyId} has no server`);
      const optedIn = new Set(end.members(own).filter((id) => this.opted.has(`${serverId}:${id}`)));
      const record: HistoryRecord = { ...end.build(own, optedIn), serverId };
      const fresh = !this.records.some((kept) => kept.partyId === record.partyId);
      if (fresh) this.records.push(record);
      this.forget(lineage);
      return fresh ? record : undefined;
    } catch (err) {
      // All or nothing, as behind the savepoint.
      this.kept = before;
      throw err;
    }
  }

  unrecorded(): Promise<UnrecordedParty[]> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        if (this.failing) {
          reject(this.failing);
          return;
        }
        const recorded = new Set(this.records.map((record) => record.partyId));
        resolve(
          [...this.parties.values()]
            .filter((party) => party.status === 'ended' && !recorded.has(party.id))
            .sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id))
            .map((party) => ({
              partyId: party.id,
              movedTo:
                this.kept.find((step) => step.kind === 'from' && step.subject === party.id)
                  ?.partyId ?? null,
            })),
        );
      });
    });
  }

  /** As the repository reads them (plan 8H-7A); a record's id is its place in `records`, from 1. */
  raidsAlong(serverId: string, query: RaidsAlongQuery): Promise<RaidAlongRow[]> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        if (this.failing) {
          reject(this.failing);
          return;
        }
        const { gymIds, wayspotIds, from, to } = query;
        resolve(
          this.records.flatMap((record, index): RaidAlongRow[] =>
            record.serverId === serverId &&
            record.source === 'live' &&
            (record.kind === 'raid' || record.kind === 'max') &&
            record.createdAt >= from - RAIDS_ALONG_REACH_MS &&
            record.createdAt <= to + RAIDS_ALONG_REACH_MS &&
            raidTime(record).start <= to &&
            raidTime(record).end >= from &&
            ((record.gymId !== null && gymIds.includes(record.gymId)) ||
              (record.wayspotId !== null && wayspotIds.includes(record.wayspotId)))
              ? [
                  {
                    id: index + 1,
                    source: record.source,
                    kind: record.kind,
                    ending: record.ending,
                    tier: record.tier,
                    shadow: record.shadow,
                    gymId: record.gymId,
                    wayspotId: record.wayspotId,
                    createdAt: record.createdAt,
                    hatchTime: record.hatchTime,
                    endTime: record.endTime,
                    endedAt: record.endedAt,
                  },
                ]
              : [],
          ),
        );
      });
    });
  }

  addReach(partyId: string, subject: string, members: number, at: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        if (this.failing) {
          reject(this.failing);
          return;
        }
        // While the party's row is there, as the repository's insert from it.
        if (!this.parties.has(partyId)) {
          resolve(false);
          return;
        }
        this.kept = [...this.kept, { partyId, at, kind: 'reach', subject, value: members }];
        resolve(true);
      });
    });
  }

  write(note: HistoryNote, options: { retry?: boolean } = {}): Promise<HistoryRecord | undefined> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        try {
          resolve(this.apply(note, options));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }
}

/**
 * Who is named in the party history, kept in memory as `HistoryRepository` keeps it, whose
 * behaviour history-repository.db.test.ts pins down. A server is named by its snowflake. `named`
 * says in how many parties of a server the history already names a member (what opting out
 * takes them out of). Set `failing` to make every call reject.
 */
export class MemoryHistoryOptIns implements HistoryOptIns {
  failing: Error | undefined;
  readonly rows: { memberId: string; guildId: string; createdAt: number }[] = [];
  private readonly naming = new Map<string, number>();
  /** Who is on the boards (`<server>:<member>`, plan 8H-6). */
  private readonly boards = new Set<string>();

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private index(memberId: string, guildId: string): number {
    return this.rows.findIndex((row) => row.memberId === memberId && row.guildId === guildId);
  }

  /** The history of this server names the member in this many parties. */
  named(memberId: string, guildId: string, parties: number): void {
    this.naming.set(`${guildId}:${memberId}`, parties);
  }

  /** In how many parties of this server the history names the member. */
  namedIn(memberId: string, guildId: string): number {
    return this.naming.get(`${guildId}:${memberId}`) ?? 0;
  }

  isOptedIn(memberId: string, guildId: string): Promise<boolean> {
    return this.attempt(() => this.index(memberId, guildId) >= 0);
  }

  optIn(memberId: string, guildId: string, now: number): Promise<boolean> {
    return this.attempt(() => {
      if (this.index(memberId, guildId) >= 0) return false;
      this.rows.push({ memberId, guildId, createdAt: now });
      return true;
    });
  }

  optOut(memberId: string, guildId: string): Promise<OptedOut> {
    return this.attempt(() => {
      const at = this.index(memberId, guildId);
      if (at >= 0) this.rows.splice(at, 1);
      const forgotten = this.namedIn(memberId, guildId);
      this.naming.delete(`${guildId}:${memberId}`);
      const leftBoards = this.boards.delete(`${guildId}:${memberId}`);
      return { changed: at >= 0, forgotten, leftBoards };
    });
  }

  isOnBoards(memberId: string, guildId: string): Promise<boolean> {
    return this.attempt(
      () => this.boards.has(`${guildId}:${memberId}`) && this.index(memberId, guildId) >= 0,
    );
  }

  joinBoards(memberId: string, guildId: string, now: number): Promise<JoinedBoards> {
    return this.attempt(() => {
      const historyOn = this.index(memberId, guildId) < 0;
      if (historyOn) this.rows.push({ memberId, guildId, createdAt: now });
      const key = `${guildId}:${memberId}`;
      const joined = !this.boards.has(key);
      this.boards.add(key);
      return { joined, historyOn };
    });
  }

  leaveBoards(memberId: string, guildId: string): Promise<boolean> {
    return this.attempt(() => this.boards.delete(`${guildId}:${memberId}`));
  }

  /** The members on the boards of a server (both rows there), for the boards' readers. */
  onBoards(guildId: string): Set<string> {
    return new Set(
      this.rows
        .filter((row) => row.guildId === guildId && this.boards.has(`${guildId}:${row.memberId}`))
        .map((row) => row.memberId),
    );
  }
}
