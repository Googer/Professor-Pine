import type { Kysely } from 'kysely';
import type { DmContacts } from '../../services/dm-sender.js';
import type { DB } from '../types.js';

/**
 * The members Pine has written to before (plan 19B-5; table `DmContact`, migration 060), for the
 * DM queue's cap on new DM channels (`QueuedDmSender`). Every statement goes by the primary key
 * (`userId`): a read of a batch with `in`, an insert that leaves a row there already as it is,
 * and the delete of `/operator forget` (`MemberDataRepository.remove`).
 */
export class DmContactRepository implements DmContacts {
  constructor(private readonly db: Kysely<DB>) {}

  async known(userIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db
      .selectFrom('DmContact')
      .select('userId')
      .where('userId', 'in', [...userIds])
      .execute();
    return new Set(rows.map((row) => row.userId));
  }

  async add(userId: string, at: number): Promise<void> {
    await this.db
      .insertInto('DmContact')
      .ignore()
      .values({ userId, firstAt: String(at) })
      .execute();
  }

  /** Deletes the member's row, on request (plan 8G); whether there was one. */
  async forget(userId: string): Promise<boolean> {
    const done = await this.db
      .deleteFrom('DmContact')
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Number(done.numDeletedRows) > 0;
  }
}
