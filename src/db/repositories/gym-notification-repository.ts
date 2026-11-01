import type { Kysely } from 'kysely';
import type { DB } from '../types.js';
import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';
import { RowIds } from './row-ids.js';

/** A member's gym targets (the gyms of /target) in a server as the rows say them. */
export interface GymTargetList {
  /** The ids of the gyms, each once, in the order of the rows. Some may no longer exist. */
  gymIds: number[];
  /** Rows whose `gym` is no gym id; they are left alone. */
  unreadable: number;
}

/**
 * What the commands need of the gym targets (`ctx.gymTargets`); lets tests keep them in memory. A
 * member and a server are named by their snowflakes. A target is per member and server.
 */
export interface GymTargetStorage {
  /** The gyms the member targets in a server, and how many of their rows there cannot be read. */
  list(memberId: string, guildId: string): Promise<GymTargetList>;
  /** Makes a gym a target; `exists` when it is one already. */
  add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'>;
  /** Removes a target; false when the gym was none. */
  remove(memberId: string, guildId: string, gymId: number): Promise<boolean>;
  /**
   * Removes every row the member has in a server, also those that cannot be read (the member
   * asked for all of them); gives how many rows went.
   */
  removeAll(memberId: string, guildId: string): Promise<number>;
  /**
   * How many targets the member has in a server: each gym once, and the rows that cannot be
   * read, which `removeAll` would remove with them.
   */
  count(memberId: string, guildId: string): Promise<number>;
  /**
   * The read by event: the snowflakes of the members who target this gym in this server, each
   * once, in the order of their rows.
   */
  targeting(guildId: string, gymId: number): Promise<string[]>;
}

/**
 * What gym administration needs of the targets: those of one gym over all members and servers.
 * A gym id is compared as text, spelled as both bots write it (see `targeting`).
 */
export interface GymTargetUpkeep {
  /** How many members have this gym as a target. */
  membersTargeting(gymId: number): Promise<number>;
  /** Removes every target of this gym, in every server; gives how many rows went. */
  removeGym(gymId: number): Promise<number>;
}

/** A row of `GymNotification` as far as targets need it. */
export interface GymTargetRow {
  id: number;
  /** The `gym` column: a gym id as text, as the legacy bot wrote it. */
  gym: string | null;
}

/** The gym id a stored text holds; undefined for anything that is none. */
export function targetGymId(text: string | null): number | undefined {
  const trimmed = (text ?? '').trim();
  if (!/^\d{1,10}$/.test(trimmed)) return undefined;
  const id = Number(trimmed);
  return id > 0 ? id : undefined;
}

/** The targets a member's rows mean: several rows for one gym (legacy data) are one target. */
export function readGymTargets(rows: readonly GymTargetRow[]): GymTargetList {
  const gymIds: number[] = [];
  let unreadable = 0;
  for (const row of rows) {
    const id = targetGymId(row.gym);
    if (id === undefined) unreadable += 1;
    else if (!gymIds.includes(id)) gymIds.push(id);
  }
  return { gymIds, unreadable };
}

/** The members of rows that are a target for this gym, each once, in the order of the rows. */
export function membersOfGymTarget(
  rows: ReadonlyArray<{ memberId: string | null; gym: string | null }>,
  gymId: number,
): string[] {
  const members = new Set<string>();
  for (const row of rows) {
    if (row.memberId !== null && targetGymId(row.gym) === gymId) members.add(row.memberId);
  }
  return [...members];
}

/** The rows that make a gym a target, oldest first. */
export function rowsOfGymTarget(rows: readonly GymTargetRow[], gymId: number): number[] {
  return rows
    .filter((row) => targetGymId(row.gym) === gymId)
    .map((row) => row.id)
    .sort((a, b) => a - b);
}

/**
 * The legacy table `GymNotification`: `userId` and `guildId` are row ids of `User` and `Guild`,
 * `gym` holds a gym id as text. The table has no unique key: a change is made with the member's
 * `User` row locked (`withMemberLocked`), several rows for one gym are read as one target, and
 * the next `add` of that gym leaves one. Whether a gym still exists, and where it lies, is not
 * known here: the commands ask `ctx.gyms`.
 */
export class GymNotificationRepository implements GymTargetStorage, GymTargetUpkeep {
  /** `ids` is the process's memory of `User` and `Guild` rows it has seen (`RowIds`). */
  constructor(
    private readonly db: Kysely<DB>,
    private readonly ids: RowIds = RowIds.none,
  ) {}

  /** `withMemberLocked` over this repository's database and its memory of rows. */
  private locked<T>(
    memberId: string,
    guildId: string,
    create: boolean,
    work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
  ): Promise<T> {
    return withMemberLocked(this.db, memberId, guildId, create, work, this.ids);
  }

  /** The member's rows of a server; a plain read (see `PokemonNotificationRepository.rows`). */
  private rows(db: Kysely<DB>, member: MemberInGuild): Promise<GymTargetRow[]> {
    return db
      .selectFrom('GymNotification')
      .select(['id', 'gym'])
      .where('userId', '=', member.userId)
      .where('guildId', '=', member.guildId)
      .orderBy('id')
      .execute();
  }

  async list(memberId: string, guildId: string): Promise<GymTargetList> {
    const member = await findMemberInGuild(this.db, memberId, guildId, this.ids);
    if (!member) return { gymIds: [], unreadable: 0 };
    return readGymTargets(await this.rows(this.db, member));
  }

  async count(memberId: string, guildId: string): Promise<number> {
    const { gymIds, unreadable } = await this.list(memberId, guildId);
    return gymIds.length + unreadable;
  }

  /**
   * One query over the index `(gym, guildId)`. The column is text and is compared with the id
   * as text, as the legacy bot and this one write it: against a number MySQL would compare
   * every row as a double and use no index. A row that spells the id another way (padded)
   * is a target in the member's own list all the same, and is not found here.
   */
  async targeting(guildId: string, gymId: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('GymNotification as n')
      .innerJoin('Guild as g', 'g.id', 'n.guildId')
      .innerJoin('User as u', 'u.id', 'n.userId')
      .select(['u.userSnowflake as memberId', 'n.gym'])
      .where('g.snowflake', '=', guildId)
      .where('n.gym', '=', String(gymId))
      .orderBy('n.id')
      .execute();
    return membersOfGymTarget(rows, gymId);
  }

  async add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'> {
    return this.locked(memberId, guildId, true, async (trx, member) => {
      if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
      // The oldest row of the gym stays; legacy duplicates of it go.
      const [kept, ...duplicates] = rowsOfGymTarget(await this.rows(trx, member), gymId);
      if (duplicates.length > 0) {
        await trx.deleteFrom('GymNotification').where('id', 'in', duplicates).execute();
      }
      if (kept !== undefined) return 'exists';
      await trx
        .insertInto('GymNotification')
        .values({ gym: String(gymId), userId: member.userId, guildId: member.guildId })
        .execute();
      return 'added';
    });
  }

  async remove(memberId: string, guildId: string, gymId: number): Promise<boolean> {
    return this.locked(memberId, guildId, false, async (trx, member) => {
      if (!member) return false;
      const ids = rowsOfGymTarget(await this.rows(trx, member), gymId);
      if (ids.length === 0) return false;
      await trx.deleteFrom('GymNotification').where('id', 'in', ids).execute();
      return true;
    });
  }

  async removeAll(memberId: string, guildId: string): Promise<number> {
    return this.locked(memberId, guildId, false, async (trx, member) => {
      if (!member) return 0;
      const result = await trx
        .deleteFrom('GymNotification')
        .where('userId', '=', member.userId)
        .where('guildId', '=', member.guildId)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }

  async membersTargeting(gymId: number): Promise<number> {
    const row = await this.db
      .selectFrom('GymNotification')
      .select((eb) => eb.fn.count<string>('userId').distinct().as('members'))
      .where('gym', '=', String(gymId))
      .executeTakeFirst();
    return Number(row?.members ?? 0);
  }

  /** One statement: nothing about a member is decided here, so no member's row is locked. */
  async removeGym(gymId: number): Promise<number> {
    const result = await this.db
      .deleteFrom('GymNotification')
      .where('gym', '=', String(gymId))
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
