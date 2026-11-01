import type { Kysely } from 'kysely';
import type { DB } from '../types.js';

/**
 * A permission overwrite the bot put on a region's forum for one member (spec 5.4): the member
 * signed up for a party there and could not see the forum.
 */
export interface AccessGrant {
  /** The forum the overwrite is on. */
  forumChannelId: string;
  /** Snowflake of the member it lets in. */
  memberId: string;
  /** Row id of the server (`Guild.id`), not its snowflake. */
  guildId: number;
  /** Epoch milliseconds. */
  createdAt: number;
}

/** What the access service needs of the table; lets tests keep the grants in memory. */
export interface AccessGrantStorage {
  /** Every grant, oldest first. */
  list(): Promise<AccessGrant[]>;
  /** Records a grant. One that is recorded already stays as it is. */
  add(grant: AccessGrant): Promise<void>;
  /** Forgets a grant; one that is not recorded is fine. */
  remove(forumChannelId: string, memberId: string): Promise<void>;
}

/** The `PartyAccessGrant` table. */
export class AccessGrantRepository implements AccessGrantStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async list(): Promise<AccessGrant[]> {
    const rows = await this.db
      .selectFrom('PartyAccessGrant')
      .select(['forumChannelId', 'memberId', 'guildId', 'createdAt'])
      .orderBy('createdAt')
      .orderBy('forumChannelId')
      .orderBy('memberId')
      .execute();
    return rows.map((row) => ({ ...row, createdAt: Number(row.createdAt) }));
  }

  async add(grant: AccessGrant): Promise<void> {
    await this.db
      .insertInto('PartyAccessGrant')
      .values({
        forumChannelId: grant.forumChannelId,
        memberId: grant.memberId,
        guildId: grant.guildId,
        createdAt: String(grant.createdAt),
      })
      // Recorded already: the row stays exactly as it is.
      .onDuplicateKeyUpdate({ memberId: grant.memberId })
      .execute();
  }

  async remove(forumChannelId: string, memberId: string): Promise<void> {
    await this.db
      .deleteFrom('PartyAccessGrant')
      .where('forumChannelId', '=', forumChannelId)
      .where('memberId', '=', memberId)
      .execute();
  }
}
