import type { Kysely } from 'kysely';
import {
  isCostumedTarget,
  parseTargetWantToken,
  targetWantToken,
  withCostume,
  type TargetWant,
} from '../../domain/notify/target-wants.js';
import type { DB } from '../types.js';
import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';
import { RowIds } from './row-ids.js';

/** A member's targets of `TargetWant` in a server. */
export interface TargetWantList {
  /** Each once, in the order they were made. */
  wants: TargetWant[];
  /** Rows this version cannot read (a later version's tokens); left alone. */
  unreadable: number;
}

/** The members a read by token found, each with the targets of theirs it found. */
export interface MemberTargetWants {
  memberId: string;
  wants: TargetWant[];
}

/**
 * The wants of `TargetWant` (plan 8R-1; design 9.1): per member and server, each target a token
 * (`targetWantToken`). A member and a server are named by their snowflakes; the rows hang on
 * the member's `User` and the server's `Guild` row, as the wants of `PokemonNotification` do,
 * and change under `withMemberLocked`. Its twin in memory is `MemoryTargetWants`
 * (`test/support/target-wants.ts`); both run `targetWantCases`.
 */
export interface TargetWantStorage {
  list(memberId: string, guildId: string): Promise<TargetWantList>;
  /** Those of these targets the member wants in the server (the dialog's read: one key read). */
  of(memberId: string, guildId: string, targets: readonly TargetWant[]): Promise<TargetWant[]>;
  /**
   * Adds and removes targets of a member in a server, in one transaction (what is there already
   * is not added twice, what is not there is no error). `at` is when, for a row that is made.
   * Gives how many of those to remove were there (decided under the lock: plan 8R-4, B8).
   */
  change(
    memberId: string,
    guildId: string,
    change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
    at: number,
  ): Promise<number>;
  /** Removes one target; false when the member had none. */
  remove(memberId: string, guildId: string, want: TargetWant): Promise<boolean>;
  /** Removes every row of the member in the server, unreadable ones too; gives how many went. */
  removeAll(memberId: string, guildId: string): Promise<number>;
  /** How many rows the member has in the server, unreadable ones too. */
  count(memberId: string, guildId: string): Promise<number>;
  /**
   * The read by event: the members who want, in this server, one of these targets, each with
   * those of theirs (no targets ask nothing). Over the index `(guildId, target)`.
   */
  wanting(guildId: string, targets: readonly TargetWant[]): Promise<MemberTargetWants[]>;
}

/** The `TargetWant` table. */
export class TargetWantRepository implements TargetWantStorage {
  /** `ids` is the process's memory of `User` and `Guild` rows it has seen (`RowIds`). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly ids: RowIds = RowIds.none,
  ) {}

  private locked<T>(
    memberId: string,
    guildId: string,
    create: boolean,
    work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
  ): Promise<T> {
    return withMemberLocked(this.db, memberId, guildId, create, work, this.ids);
  }

  private async tokens(
    db: Kysely<DB>,
    member: MemberInGuild,
  ): Promise<{ target: string; costumed: number }[]> {
    return db
      .selectFrom('TargetWant')
      .select(['target', 'costumed'])
      .where('guildId', '=', member.guildId)
      .where('userId', '=', member.userId)
      .orderBy('id')
      .execute();
  }

  async list(memberId: string, guildId: string): Promise<TargetWantList> {
    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
    if (!member) return { wants: [], unreadable: 0 };
    const wants: TargetWant[] = [];
    let unreadable = 0;
    for (const row of await this.tokens(this.db, member)) {
      const want = targetWantOfRow(row);
      if (want) wants.push(want);
      else unreadable += 1;
    }
    return { wants, unreadable };
  }

  async of(
    memberId: string,
    guildId: string,
    targets: readonly TargetWant[],
  ): Promise<TargetWant[]> {
    if (targets.length === 0) return [];
    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
    if (!member) return [];
    const rows = await this.db
      .selectFrom('TargetWant')
      .select(['target', 'costumed'])
      .where('guildId', '=', member.guildId)
      .where('userId', '=', member.userId)
      .where('target', 'in', targets.map(targetWantToken))
      .orderBy('id')
      .execute();
    return rows.flatMap((row) => targetWantOfRow(row) ?? []);
  }

  async change(
    memberId: string,
    guildId: string,
    change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
    at: number,
  ): Promise<number> {
    if (change.add.length === 0 && change.remove.length === 0) return 0;
    return this.locked(memberId, guildId, change.add.length > 0, async (trx, member) => {
      if (!member) return 0;
      return changeTargetWants(trx, member, change, at);
    });
  }

  async remove(memberId: string, guildId: string, want: TargetWant): Promise<boolean> {
    return this.locked(memberId, guildId, false, async (trx, member) => {
      if (!member) return false;
      const gone = await trx
        .deleteFrom('TargetWant')
        .where('guildId', '=', member.guildId)
        .where('userId', '=', member.userId)
        .where('target', '=', targetWantToken(want))
        .executeTakeFirst();
      return Number(gone.numDeletedRows) > 0;
    });
  }

  async removeAll(memberId: string, guildId: string): Promise<number> {
    return this.locked(memberId, guildId, false, async (trx, member) => {
      if (!member) return 0;
      const gone = await trx
        .deleteFrom('TargetWant')
        .where('guildId', '=', member.guildId)
        .where('userId', '=', member.userId)
        .executeTakeFirst();
      return Number(gone.numDeletedRows);
    });
  }

  async count(memberId: string, guildId: string): Promise<number> {
    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
    if (!member) return 0;
    return (await this.tokens(this.db, member)).length;
  }

  async wanting(guildId: string, targets: readonly TargetWant[]): Promise<MemberTargetWants[]> {
    const asked = [...new Set(targets.map(targetWantToken))];
    if (asked.length === 0) return [];
    const rows = await this.db
      .selectFrom('TargetWant as w')
      .innerJoin('Guild as g', 'g.id', 'w.guildId')
      .innerJoin('User as u', 'u.id', 'w.userId')
      .select(['u.userSnowflake as memberId', 'w.target', 'w.costumed'])
      .where('g.snowflake', '=', guildId)
      .where('w.target', 'in', asked)
      .orderBy('w.id')
      .execute();
    const byMember = new Map<string, TargetWant[]>();
    for (const row of rows) {
      const want = targetWantOfRow(row);
      if (row.memberId === null || !want) continue;
      const known = byMember.get(row.memberId);
      if (known) known.push(want);
      else byMember.set(row.memberId, [want]);
    }
    return [...byMember].map(([memberId, wants]) => ({ memberId, wants }));
  }
}

/** A row as the target it holds, costumed as its column says; undefined for one unreadable. */
function targetWantOfRow(row: { target: string; costumed: number }): TargetWant | undefined {
  const want = parseTargetWantToken(row.target);
  return want && withCostume(want, row.costumed !== 0);
}

/**
 * Adds and removes a member's targets in a transaction that holds their row locked
 * (`withMemberLocked`): for the dialog of `/want`, which writes these with the member's
 * `PokemonNotification` rows in one transaction. A target there already is not made again, but
 * takes the `costumed` of its add (plan 8R-4). Gives how many of those to remove were there.
 */
export async function changeTargetWants(
  trx: Kysely<DB>,
  member: MemberInGuild,
  change: { add: readonly TargetWant[]; remove: readonly TargetWant[] },
  at: number,
): Promise<number> {
  const removed = change.remove.map(targetWantToken);
  let gone = 0;
  if (removed.length > 0) {
    const deleted = await trx
      .deleteFrom('TargetWant')
      .where('guildId', '=', member.guildId)
      .where('userId', '=', member.userId)
      .where('target', 'in', removed)
      .executeTakeFirst();
    gone = Number(deleted.numDeletedRows);
  }
  const added = [...new Set(change.add.map(targetWantToken))];
  if (added.length === 0) return gone;
  const costumedTokens = new Set(change.add.filter(isCostumedTarget).map(targetWantToken));
  // A target there already keeps its row and `createdAt` and takes the costume of its add (the
  // unique key), without a read first: one statement per costume, so mostly one. Not `insert
  // ignore`, which would make a missing parent row (MySQL's 1452, which `withMemberLocked`
  // answers by trying again) a warning; not `values(costumed)`, which MySQL 8 deprecates.
  const costumeOf = (token: string): number => (costumedTokens.has(token) ? 1 : 0);
  // In the order of the adds, so that the rows are made in it.
  for (const costumed of new Set(added.map(costumeOf))) {
    const tokens = added.filter((token) => costumeOf(token) === costumed);
    await trx
      .insertInto('TargetWant')
      .values(
        tokens.map((target) => ({
          guildId: member.guildId,
          userId: member.userId,
          target,
          createdAt: String(at),
          costumed,
        })),
      )
      .onDuplicateKeyUpdate({ costumed })
      .execute();
  }
  return gone;
}
