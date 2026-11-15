import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { AccessGrantRepository } from './access-grant-repository.js';
import { GuildRepository } from './guild-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const WEST_FORUM = '100000000000000011';
const EAST_FORUM = '100000000000000012';
const NOW = 1_800_000_000_000;

describe('AccessGrantRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let grants: AccessGrantRepository;
  let guildId: number;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    grants = new AccessGrantRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
    guildId = await new GuildRepository(db).ensure('412345678901234567');
  });

  it('records grants and lists them oldest first, snowflakes as strings', async () => {
    expect(await grants.list()).toEqual([]);
    await grants.add({ forumChannelId: EAST_FORUM, memberId: BOB, guildId, createdAt: NOW + 2 });
    await grants.add({ forumChannelId: WEST_FORUM, memberId: ALICE, guildId, createdAt: NOW });
    await grants.add({ forumChannelId: EAST_FORUM, memberId: ALICE, guildId, createdAt: NOW + 1 });
    expect(await grants.list()).toEqual([
      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId, createdAt: NOW },
      { forumChannelId: EAST_FORUM, memberId: ALICE, guildId, createdAt: NOW + 1 },
      { forumChannelId: EAST_FORUM, memberId: BOB, guildId, createdAt: NOW + 2 },
    ]);
  });

  it('keeps a grant that is recorded again as it was', async () => {
    await grants.add({ forumChannelId: WEST_FORUM, memberId: ALICE, guildId, createdAt: NOW });
    await grants.add({ forumChannelId: WEST_FORUM, memberId: ALICE, guildId, createdAt: NOW + 9 });
    expect(await grants.list()).toEqual([
      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId, createdAt: NOW },
    ]);
  });

  it('removes one grant and does not mind one that is not there', async () => {
    await grants.add({ forumChannelId: WEST_FORUM, memberId: ALICE, guildId, createdAt: NOW });
    await grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId, createdAt: NOW + 1 });
    await grants.remove(WEST_FORUM, ALICE);
    await grants.remove(WEST_FORUM, ALICE);
    await grants.remove(EAST_FORUM, BOB);
    expect((await grants.list()).map((grant) => grant.memberId)).toEqual([BOB]);
  });

  it('loses the grants of a server whose row is removed', async () => {
    await grants.add({ forumChannelId: WEST_FORUM, memberId: ALICE, guildId, createdAt: NOW });
    await db.deleteFrom('Guild').where('snowflake', '=', '412345678901234567').execute();
    expect(await grants.list()).toEqual([]);
  });
});
