# Phase 2E-2: Access for Members of Other Regions, and Moving a Raid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member who signs up for a raid whose post they cannot see (through a copy in the remote or EX channel, by reporting a raid for another region, or because their raid moved) is let into that region's forum for as long as they take part there. A raid that was reported at the wrong gym can be moved to a gym of another region: `/location` asks first, the raid gets a new post in that region's forum, and the old post says where it went. This finishes Phase 2.

**Architecture:** `AccessService` listens to the party store (`PartyStore.onChange`), so it does not matter who changed a party: whoever comes to take part in a party of a forum they cannot see gets a permission overwrite of their own on that forum, recorded in the new `PartyAccessGrant` table before it is made, and taken back when they take part in no party of that forum any more. Only recorded overwrites that are still what the bot made are ever removed. A move to another region does not swap the post of a party: the raid becomes a **new party** with a post in the other forum (`PartyService.relocate`), and the old party ends through the end path that already exists (link line, copies, questions, warning, archiving, the hourly sweep), so nothing of that needs a second implementation. The new party is stored and gets its post first; only then the old one ends inside the store, and the new one takes over what the raid was at that moment.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies. One additive migration (`PartyAccessGrant`); the state document of `Party` is unchanged.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: sections 5.2 ("Gym change to a different region"), 5.4 (access for cross-region joiners), 6.1 (the table). This is the second half of plan 2E. Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, the three lists headed "Plan 2E-2".

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (1,968 unit tests at the end, and 131 database tests). Two reviewers then went through that branch, and what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **Access follows from the store, not from the callers.** `PartyStore.onChange(listener)` tells of every added party and every stored change; `AccessService` works out from the two states who came or went. A button on a copy, `/raid` used in another region's channel, a raid that moves, the clock that completes a silent member, the end of a party: all are covered alike, and no caller has to remember it. (This replaces the hand-off "emit `joined`".)
2. **Who is let in.** A member who takes part in an active party (signed up in any status, and not done) whose post is in a forum they cannot see, when nothing says that they in particular should not: no permission overwrite of their own on that forum, and no overwrite that denies the view to a role they hold. They get View Channel, Read Message History and Send Messages in Threads on the forum alone, never on the region's text channel; not the last when a role of theirs may not write there.
3. **When it is taken back.** When the member takes part in no active party of that forum any more: they left, they are done (spec 5.4; going back gives it again), or the party ended or moved. Only an overwrite the bot recorded is removed, and only while it is still exactly what the bot made: an overwrite a moderator changed since (to keep the member out, or to give them more) stays, and the record is dropped.
4. **The record comes first.** A grant is written to `PartyAccessGrant` before the overwrite is made, and the overwrite is removed before the record: what can be left over is a record without an overwrite, never an overwrite nobody remembers. A sweep at start and hourly, with the forums' upkeep (the spec says daily), takes back what nothing calls for and lets a member in again whose record has no overwrite. It never lets anybody in who has no record.
5. **A forum that refuses the bot** (it lacks Manage Permissions there, or the forum has as many overwrites as Discord allows) is left alone for ten minutes and logged once. A member who could not be let in is tried again with their next step in the raid.
6. **A move makes a new party.** The party id changes; the ended row keeps the old post, so the hourly sweep of open posts works unchanged. The ended row says nothing of the move (history shows one ended raid and one that went on). What the raid had is carried over: members, groups, meeting times, times, boss and moves, `saved`, and `createdAt` (a raid without times is judged by when it was reported). Not carried: the post, the link line, the copies, the completion questions and the archive warning, which were messages of the old post; members who were asked whether they are done are present again, and the clock schedules the archiving anew with a warning in the new post.
7. **The order of a move.** The new party is stored (under the lock of the new gym, refused when that gym has such a raid) and gets its post; then the old post is told where the raid went, pinging those who are signed up and allow pings (`User.mentions`), while they can all still see it; then the old party ends inside the store and the new one takes over what the raid was at that moment, with what happened in the new party meanwhile (a second report of the new gym signs its reporter up there). Whatever fails before the old party has ended leaves the raid where it was and takes the new post back. A raid that ended by itself meanwhile (the clock, `/delete`) does not come back elsewhere.
8. **`/location` asks before a move to another region** (two buttons, the question private). A gym of the raid's own region is taken at once, as before. Its list now also offers the gyms just across the border, with the region's name; a gym the raid cannot move to (in no region of this server that has a forum) is not offered and is refused.
9. **A confirmed move to another region is limited to two in ten minutes per member**: unlike any other change of a raid it pings, makes a post and takes everybody into another forum. Anybody in the post may still do it, as for every other change (Matt, 2026-10-11: abuse is rare and the moderators deal with it).
10. **The answer to the member is given before the old post is closed** (`moved` of `relocate`, waited for three seconds at most, like `closing.left` of `end`): the question stands in the old post, and nothing may follow its archiving.
11. **Not in this plan:** DMs to the members of a moved raid (Phase 4); marking on the new party where it came from, which would let a restart tidy up after a hard stop in the middle of a move, and tell a notification listener that an added party is not a new report (follow-ups; it needs a new version of the state document); access for trains and meetups (Phase 3).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). Repositories alone know column names. Only `DiscordPartyGateway` calls discord.js for parties.
- Database changes are additive only; `src/db/types.ts` is generated (`npm run db:codegen`), never edited by hand.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` and the fake interactions.
- A party is never mutated; it changes only through `PartyStore.update`, whose callback is synchronous and decides inside.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`. Text written by members or by a feed is shown through `plain()`.
- Nothing is sent into or edited in a post after it was archived: Discord opens an archived post again for that.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting). Check its exit status, not only the end of its output.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash (Git Bash turns it into a path).

## Review Focus

1. Nobody may get into a forum they should not see, and nobody may stay in for good: a member a moderator keeps out (by an overwrite of their own or of a role), a moderator's change to the bot's own overwrite, a member who signs up and leaves at once, a grant whose removal failed. Tests: Task 4, "leaves a member alone whom somebody keeps out of the forum on purpose", "never takes away what a moderator made of its overwrite: a member who was barred stays barred", "never touches an overwrite it did not make", "ends with no access for a member who signs up and leaves at once", "takes the grant back of a member who leaves while the record is being written", "keeps the record of a grant it could not take back, and tries again with the sweep", "takes back what a raid called for when the raid ends".
2. No overwrite without a record: Task 4, "lets in a member who signs up and cannot see the forum, and records it first", "records nothing when the record cannot be written, and makes no overwrite", "keeps the record when it can neither make an overwrite nor take it back, and the grant goes later", "sweeps what nothing calls for any more and keeps the rest".
3. A move must never lose a raid or leave it twice: Task 5, "leaves the raid as it was when the post cannot be made", "takes the new party back when the old one cannot be ended, and says that the raid stays", "takes the new party back when the old one was closed meanwhile: it does not come back elsewhere", "moves a raid once: a second move at the same time finds it gone", "makes a report of the new gym wait for the move and then join the raid", "after a stop between storing the new party and making its post, the raid is where it was".
4. What members did during a move is kept, and they hear of it where they can see it: Task 5, "keeps what members did in the old post while the new one was being made", "says that the raid moved while those who are in the old forum only for it can still see it", "pings in the old post those who are signed up and allow it, not who moved it or is done"; and nothing lands in the old post after its archiving: "closes the old post with where the raid went, and archives it", "lets the caller answer before the old post is closed, and does not wait for long".
5. `/location` must not move a raid by a slip or at will: Task 7, "asks first, privately, and changes nothing yet", "moves nothing on cancel, and a question is answered once", "is nobody else’s to answer", "allows a member two moves to another region in ten minutes; a cancel does not count".

---

## File Structure

```
src/db/
  migrations/2026_10_11_004_party_access_grants.ts   create: the table
  migrations/index.ts                                modify
  repositories/access-grant-repository.ts            create: AccessGrant, AccessGrantStorage
  types.ts                                           regenerate
src/domain/party/
  relocate.ts           create: relocatedRaid, carriedOver
  party.ts              modify: what `other-region` means now
src/discord/
  party-gateway.ts      modify: memberAccess, admitMember, dismissMember, isOverwriteLimit
  throttle.ts           modify: clear (for tests)
src/render/
  text.ts               modify: withMentions (moved here), LIMITS.pings
  activity.ts           modify: the text of `other-region`
src/services/
  party-store.ts        modify: onChange
  access-service.ts     create: AccessService
  party-scheduler.ts    modify: the sweep in the upkeep, each step by itself
  party-service.ts      modify: relocate, takeBack, createTracked, closePost(..., said), users
  attendance-service.ts modify: withMentions from render/text
  raid-change-service.ts modify: setGym across regions, gymMove
src/commands/raids/
  location.ts           create: /location with its question (moved out of boss.ts)
  boss.ts, raid-input.ts  modify: /location and the local-only option leave
src/commands/index.ts, src/components/index.ts       modify
src/app.ts              modify: the access service, the members' settings for the party service
test/support/
  fake-gateway.ts       modify: who can see a forum
  party-service.ts      modify: MemoryAccessGrants, `access` and `grants` of partyServiceWith
```

---

### Task 1: The table of access grants and its repository

**Files:**
- Create: `src/db/migrations/2026_10_11_004_party_access_grants.ts`, `src/db/repositories/access-grant-repository.db.test.ts`, `src/db/repositories/access-grant-repository.ts`
- Modify: `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`
- Regenerate: `src/db/types.ts`

**Interfaces:**
- Consumes: The migrator and the migrations list (`src/db/migrations/index.ts`), `Guild` rows (`GuildRepository`), `startMigratedDatabase`.
- Produces: The table `PartyAccessGrant` (`forumChannelId`, `memberId`, `guildId`, `createdAt`; primary key forum and member; the server's row deleted takes its grants along); `AccessGrant`, `AccessGrantStorage { list(); add(grant); remove(forumChannelId, memberId) }` and `AccessGrantRepository` in `src/db/repositories/access-grant-repository.ts`.

The only task of this plan that needs Docker: the tests are database tests, and `src/db/types.ts` is regenerated, not edited. `add` leaves a grant that is recorded already exactly as it is; `remove` does not mind one that is not there.

- [ ] **Step 1: Write the failing tests**

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -23,7 +23,7 @@ async function migrate(database: TestDatabase): Promise<void> {
 }
 
 /** The tables the new bot adds to a database it takes over. */
-const ADDED_TABLES = ['RaidBoss', 'RaidBossOverride', 'Party'];
+const ADDED_TABLES = ['RaidBoss', 'RaidBossOverride', 'Party', 'PartyAccessGrant'];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = ['Region.forumChannelId', 'Region.summaryMessageId'];
 /** The indexes it adds to tables of the legacy bot, as `Table.index`. */
@@ -98,6 +98,7 @@ describe('runMigrations', () => {
       '2026_10_10_001_raid_bosses',
       '2026_10_11_002_parties',
       '2026_10_11_003_raid_boss_image',
+      '2026_10_11_004_party_access_grants',
     ]);
     expect(await describeSchema(database, ADDED_TABLES, ADDED_COLUMNS, ADDED_INDEXES)).toEqual(
       before,
```

Create `src/db/repositories/access-grant-repository.db.test.ts`:

```ts
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
    await new GuildRepository(db).remove('412345678901234567');
    expect(await grants.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: The implementation**

Create `src/db/migrations/2026_10_11_004_party_access_grants.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Access for members of other regions (spec section 5.4).
 *
 * `PartyAccessGrant` holds one row per permission overwrite the bot put on a region's forum to
 * let a member in who signed up for a raid there and could not see the forum. The row is how the
 * bot knows which overwrites are its own: it takes back only those. A member has at most one
 * grant per forum. `guildId` is the row of the server (`Guild.id`), so the grants of a server the
 * bot left go with it; snowflakes are `varchar(30)` as in `Party`.
 *
 * Safe to run again after a failure half-way: the table is created only when it is missing.
 */
export const partyAccessGrants: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists PartyAccessGrant (
        forumChannelId varchar(30) not null,
        memberId varchar(30) not null,
        guildId int unsigned not null,
        createdAt bigint not null,
        primary key (forumChannelId, memberId),
        constraint partyaccessgrant_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
  },
  async down() {
    // Additive only: the table stays.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -3,6 +3,7 @@ import { baseline } from './2026_10_09_000_baseline.js';
 import { raidBosses } from './2026_10_10_001_raid_bosses.js';
 import { parties } from './2026_10_11_002_parties.js';
 import { raidBossImage } from './2026_10_11_003_raid_boss_image.js';
+import { partyAccessGrants } from './2026_10_11_004_party_access_grants.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -13,4 +14,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_10_001_raid_bosses': raidBosses,
   '2026_10_11_002_parties': parties,
   '2026_10_11_003_raid_boss_image': raidBossImage,
+  '2026_10_11_004_party_access_grants': partyAccessGrants,
 };
```

Create `src/db/repositories/access-grant-repository.ts`:

```ts
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
```

Then run `npm run db:codegen` (Docker must be running). Expected: `git diff src/db/types.ts` shows exactly this, and nothing else; never edit that file by hand:

```diff
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -120,6 +120,13 @@ export interface Party {
   updatedAt: string;
 }
 
+export interface PartyAccessGrant {
+  createdAt: string;
+  forumChannelId: string;
+  guildId: number;
+  memberId: string;
+}
+
 export interface Pokemon {
   elite: Generated<number | null>;
   exclusive: Generated<number | null>;
@@ -219,6 +226,7 @@ export interface DB {
   GymMeta: GymMeta;
   GymNotification: GymNotification;
   Party: Party;
+  PartyAccessGrant: PartyAccessGrant;
   Pokemon: Pokemon;
   PokemonNotification: PokemonNotification;
   RaidBoss: RaidBoss;
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/access-grant-repository.db.test.ts` (Docker; allow ten minutes)
Expected: PASS.

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/db/migrations/2026_10_11_004_party_access_grants.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/access-grant-repository.db.test.ts src/db/repositories/access-grant-repository.ts
npm run check
git add src/db/migrations/2026_10_11_004_party_access_grants.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/access-grant-repository.db.test.ts src/db/repositories/access-grant-repository.ts src/db/types.ts
git commit -m "The table of access grants and its repository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,891 unit tests.

---

### Task 2: The party store tells listeners about every stored change

**Files:**
- Modify: `src/services/party-store.test.ts`, `src/services/party-store.ts`

**Interfaces:**
- Consumes: `PartyStore` (`add`, `update`), its tests and `partyStoreWith`.
- Produces: `PartyListener = (before: Party | undefined, after: Party) => void` and `PartyStore.onChange(listener)`: called for every added party (`before` undefined) and every stored change, right after memory was replaced; an ended party comes with the status `ended`.

A listener decides and returns; it must not be `async`. What it throws is logged and changes nothing, and the other listeners are still told. Nothing is announced for a change that was refused, changed nothing or could not be written, nor for the parties read by `load`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/services/party-store.test.ts`:

```diff
--- a/src/services/party-store.test.ts
+++ b/src/services/party-store.test.ts
@@ -7,6 +7,7 @@ import {
   MINUTE,
   PARTY_NOW,
   partyStoreWith,
+  REPORTER,
   testRaid,
   testRaidRules,
 } from '../../test/support/parties.js';
@@ -303,6 +304,60 @@ describe('PartyStore', () => {
     await expect(store.whenIdle()).resolves.toBeUndefined();
   });
 
+  describe('onChange', () => {
+    it('tells a listener of an added party and of every stored change, after memory has it', async () => {
+      const { store } = await partyStoreWith([testRaid({ id: ID(1) })]);
+      const seen: string[] = [];
+      store.onChange((before, after) => {
+        const members = (party: Party | undefined): string =>
+          party ? `${party.status}[${Object.keys(party.attendees).join(',')}]` : 'none';
+        // What the listener reads from the store is what it is told.
+        const stored = store.get(after.id);
+        seen.push(`${after.id.at(-1) ?? ''}: ${members(before)} -> ${members(after)}`);
+        expect(stored).toBe(after.status === 'active' ? after : undefined);
+      });
+      await store.update(ID(1), join(ALICE));
+      await store.add(testRaid({ id: ID(2), gymId: 2 }));
+      await store.update(ID(1), (party) => ({ party: endParty(party) }));
+      expect(seen).toEqual([
+        `1: active[${REPORTER}] -> active[${REPORTER},${ALICE}]`,
+        `2: none -> active[${REPORTER}]`,
+        `1: active[${REPORTER},${ALICE}] -> ended[${REPORTER},${ALICE}]`,
+      ]);
+    });
+
+    it('says nothing for a change that was refused, changed nothing or could not be written', async () => {
+      const { store, storage } = await partyStoreWith([testRaid({ id: ID(1) })]);
+      const seen: Party[] = [];
+      store.onChange((_before, after) => seen.push(after));
+      await store.update(ID(1), (party) => leaveParty(party, BOB));
+      await store.update(ID(1), (party) => ({ party }));
+      await store.update(ID(9), join(ALICE));
+      storage.failing = new Error('the database is away');
+      await expect(store.update(ID(1), join(ALICE))).rejects.toThrow('away');
+      await expect(store.add(testRaid({ id: ID(2), gymId: 2 }))).rejects.toThrow('away');
+      expect(seen).toEqual([]);
+    });
+
+    it('logs what a listener throws and goes on: the change is stored and the others are told', async () => {
+      const { store, entries } = await partyStoreWith([testRaid({ id: ID(1) })]);
+      const told: string[] = [];
+      store.onChange(() => {
+        throw new Error('the listener broke');
+      });
+      store.onChange((_before, after) => told.push(after.id));
+      const result = await store.update(ID(1), join(ALICE));
+      expect(result?.written).toBe(true);
+      expect(Object.keys(store.get(ID(1))?.attendees ?? {})).toEqual([REPORTER, ALICE]);
+      expect(told).toEqual([ID(1)]);
+      expect(entries.at(-1)).toMatchObject({
+        level: 50,
+        msg: 'a listener of the parties failed',
+        party: ID(1),
+      });
+    });
+  });
+
   describe('addRaidUnlessTaken', () => {
     it('stores one raid when two reports of a gym come at the same moment', async () => {
       const { store, storage } = await partyStoreWith();
```

Run: `npx vitest run --project unit src/services/party-store.test.ts`
Expected: FAIL (`onChange` does not exist).

- [ ] **Step 2: The implementation**

Apply to `src/services/party-store.ts`:

```diff
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -29,6 +29,12 @@ export interface PartyStoreOptions {
   now?: () => number;
 }
 
+/**
+ * Told about every stored change: the party as it was (undefined for one that was just added)
+ * and as it is stored now, which for a party that ended has the status `ended`.
+ */
+export type PartyListener = (before: Party | undefined, after: Party) => void;
+
 /**
  * The active parties in memory, with the database behind them. Every change goes through
  * `update`, which runs one change at a time per party, writes the row first and only then
@@ -38,6 +44,7 @@ export class PartyStore implements PartyProvider {
   private readonly parties = new Map<string, Party>();
   private readonly locks = new KeyedLock<string>();
   private readonly gymLocks = new KeyedLock<number>();
+  private readonly listeners: PartyListener[] = [];
   private readonly now: () => number;
   private loaded = false;
 
@@ -78,6 +85,28 @@ export class PartyStore implements PartyProvider {
     return this.parties;
   }
 
+  /**
+   * Has `listener` told about every party that is added and every change that is stored, right
+   * after the party in memory was replaced and before the caller of `add` or `update` goes on:
+   * for whatever follows from a change no matter who made it (see `AccessService`). A listener
+   * decides and returns (it must not be `async`: nobody would see it fail); what takes time it
+   * does on the side. What it throws is logged and changes nothing. Not announced: the parties
+   * read by `load`, and a party that leaves memory because its row is gone from the database.
+   */
+  onChange(listener: PartyListener): void {
+    this.listeners.push(listener);
+  }
+
+  private announce(before: Party | undefined, after: Party): void {
+    for (const listener of this.listeners) {
+      try {
+        listener(before, after);
+      } catch (err) {
+        this.options.log.error({ err, party: after.id }, 'a listener of the parties failed');
+      }
+    }
+  }
+
   get(id: string): Party | undefined {
     return this.all.get(id);
   }
@@ -109,6 +138,7 @@ export class PartyStore implements PartyProvider {
     return this.locks.run(party.id, async () => {
       await this.options.storage.insert(party);
       if (party.status === 'active') parties.set(party.id, party);
+      this.announce(undefined, party);
       return party;
     });
   }
@@ -152,6 +182,7 @@ export class PartyStore implements PartyProvider {
       }
       if (stamped.status === 'active') parties.set(id, stamped);
       else parties.delete(id);
+      this.announce(current, stamped);
       return { ...result, party: stamped, written: true };
     });
   }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/party-store.test.ts`
Expected: PASS (`src/services/party-store.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/services/party-store.test.ts src/services/party-store.ts
npm run check
git add src/services/party-store.test.ts src/services/party-store.ts
git commit -m "The party store tells listeners about every stored change" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,894 unit tests.

---

### Task 3: The gateway lets a member into a forum and takes that back

**Files:**
- Create: `test/support/fake-gateway.test.ts`
- Modify: `src/discord/party-gateway.ts`, `test/support/fake-gateway.ts`

**Interfaces:**
- Consumes: `PartyGateway`, `DiscordPartyGateway` (`forum`, `done`), `FakePartyGateway` (`attempt`, `begin`, `forums`, `gone`, `failing`, `calls`).
- Produces: `MemberAccess = 'visible' | 'hidden' | 'barred'`; `PartyGateway.memberAccess(forumId, memberId): Promise<MemberAccess | undefined>` (undefined: the forum is gone or the member is not in the server), `admitMember(forumId, memberId): Promise<boolean>` (false: the forum is gone), `dismissMember(forumId, memberId): Promise<boolean>` (false: the member's overwrite is no longer what `admitMember` made, and was left alone); `isOverwriteLimit(err)`. The fake: `shutOut(forumId, ...memberIds)`, `canSee(forumId, memberId)`, `outsiders`, `admitted`, `barred`, `leftServer`; `memberAccess` is not listed in `calls`.

The discord.js implementation has no unit test, like the rest of that class (the staging run is its test). `barred` also means: an overwrite denies the view to a role the member holds. `admitMember` leaves out Send Messages in Threads when a role of the member may not write in the forum. `dismissMember` deletes only an overwrite that still allows nothing but what `admitMember` gave and denies nothing. The codes for an unknown member, user or overwrite are caught where they can occur, not added to what every call treats as gone.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1,5 +1,6 @@
 import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
 import type {
+  MemberAccess,
   NewPost,
   OutgoingMessage,
   PartyGateway,
@@ -45,6 +46,12 @@ type Method = keyof PartyGateway;
  * anything that is edited or sent in it. A message that was deleted, or whose id is in `gone`,
  * cannot be edited.
  *
+ * Everybody can see every forum unless `shutOut` says otherwise; `admitted` holds the permission
+ * overwrites `admitMember` made, `barred` those with which somebody keeps a member out (by an
+ * overwrite of the member's own, or of a role of theirs): `dismissMember` leaves such a member
+ * alone and answers false. `memberAccess` only looks (in discord.js it reads the cache), so it
+ * is not listed in `calls`.
+ *
  * Its answers come on `setImmediate`, so a test that needs a fixed time must fake only `Date`
  * (`vi.useFakeTimers({ toFake: ['Date'] })`), never all timers.
  */
@@ -79,6 +86,17 @@ export class FakePartyGateway implements PartyGateway {
   readonly calls: string[] = [];
   readonly channelNames = new Map<string, string>();
   readonly emojis = new Map<string, string>();
+  /** By forum: the members whose roles do not let them see it. */
+  readonly outsiders = new Map<string, Set<string>>();
+  /** By forum: the members `admitMember` let in with an overwrite of their own. */
+  readonly admitted = new Map<string, Set<string>>();
+  /**
+   * By forum: the members somebody keeps out on purpose. A moderator who turns the bot's own
+   * overwrite into a bar is: remove from `admitted`, add here.
+   */
+  readonly barred = new Map<string, Set<string>>();
+  /** Members who are no longer in the server. */
+  readonly leftServer = new Set<string>();
   /** The server of every channel (the fakes' `FAKE_GUILD_ID`). */
   guildId = '412345678901234567';
   private next = 1;
@@ -87,8 +105,8 @@ export class FakePartyGateway implements PartyGateway {
     return `90000000000000${String(this.next++).padStart(4, '0')}`;
   }
 
-  private begin(method: Method, id: string): void {
-    this.calls.push(`${method} ${id}`);
+  private begin(method: Method, id: string, listed: boolean): void {
+    if (listed) this.calls.push(`${method} ${id}`);
     const failure = this.failing.get(method);
     if (failure) throw failure;
   }
@@ -101,6 +119,22 @@ export class FakePartyGateway implements PartyGateway {
     return tags;
   }
 
+  /** These members cannot see the forum by their roles. */
+  shutOut(forumId: string, ...memberIds: string[]): void {
+    const outside = this.outsiders.get(forumId) ?? new Set<string>();
+    for (const id of memberIds) outside.add(id);
+    this.outsiders.set(forumId, outside);
+  }
+
+  /** Whether the member can see the forum now: by their roles, or because they were let in. */
+  canSee(forumId: string, memberId: string): boolean {
+    if (this.barred.get(forumId)?.has(memberId)) return false;
+    return (
+      !this.outsiders.get(forumId)?.has(memberId) ||
+      (this.admitted.get(forumId)?.has(memberId) ?? false)
+    );
+  }
+
   /** The posts of a forum, oldest first. */
   postsIn(forumId: string): FakePost[] {
     return [...this.posts.values()].filter((post) => post.forumId === forumId);
@@ -339,6 +373,41 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
+  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> {
+    return this.attempt(
+      'memberAccess',
+      forumId,
+      () => {
+        if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
+        if (this.leftServer.has(memberId)) return undefined;
+        if (this.canSee(forumId, memberId)) return 'visible';
+        return this.barred.get(forumId)?.has(memberId) ? 'barred' : 'hidden';
+      },
+      false,
+    );
+  }
+
+  admitMember(forumId: string, memberId: string) {
+    return this.attempt('admitMember', `${forumId} ${memberId}`, () => {
+      if (!this.forums.has(forumId) || this.gone.has(forumId)) return false;
+      // Like Discord, the new overwrite takes the place of the one the member had.
+      this.barred.get(forumId)?.delete(memberId);
+      const inside = this.admitted.get(forumId) ?? new Set<string>();
+      inside.add(memberId);
+      this.admitted.set(forumId, inside);
+      return true;
+    });
+  }
+
+  dismissMember(forumId: string, memberId: string) {
+    return this.attempt('dismissMember', `${forumId} ${memberId}`, () => {
+      // Not what `admitMember` made: it is left as it is.
+      if (this.barred.get(forumId)?.has(memberId)) return false;
+      this.admitted.get(forumId)?.delete(memberId);
+      return true;
+    });
+  }
+
   channelName(channelId: string): string | undefined {
     return this.channelNames.get(channelId);
   }
@@ -356,11 +425,11 @@ export class FakePartyGateway implements PartyGateway {
   }
 
   /** Like a real call, the answer never comes in the same turn of the event loop. */
-  private attempt<T>(method: Method, id: string, work: () => T): Promise<T> {
+  private attempt<T>(method: Method, id: string, work: () => T, listed = true): Promise<T> {
     return new Promise((resolve, reject) => {
       setImmediate(() => {
         try {
-          this.begin(method, id);
+          this.begin(method, id, listed);
           resolve(work());
         } catch (err) {
           reject(err instanceof Error ? err : new Error(String(err)));
```

- [ ] **Step 2: Write the failing tests**

Create `test/support/fake-gateway.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from './fake-gateway.js';
import { EAST_FORUM, WEST_FORUM } from './gyms.js';
import { ALICE, BOB } from './parties.js';

describe('FakePartyGateway: who can see a forum', () => {
  function gateway(): FakePartyGateway {
    const fake = new FakePartyGateway();
    fake.addForum(WEST_FORUM);
    fake.addForum(EAST_FORUM);
    return fake;
  }

  it('lets everybody see a forum unless they are shut out of it', async () => {
    const fake = gateway();
    fake.shutOut(EAST_FORUM, ALICE);
    expect(await fake.memberAccess(WEST_FORUM, ALICE)).toBe('visible');
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('hidden');
    expect(await fake.memberAccess(EAST_FORUM, BOB)).toBe('visible');
    // Looking is not a call to Discord.
    expect(fake.calls).toEqual([]);
  });

  it('admits a member with an overwrite of their own and dismisses them again', async () => {
    const fake = gateway();
    fake.shutOut(EAST_FORUM, ALICE);
    expect(await fake.admitMember(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('visible');
    expect(fake.canSee(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.dismissMember(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.dismissMember(EAST_FORUM, ALICE)).toBe(true);
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('hidden');
    expect(fake.calls).toEqual([
      `admitMember ${EAST_FORUM} ${ALICE}`,
      `dismissMember ${EAST_FORUM} ${ALICE}`,
      `dismissMember ${EAST_FORUM} ${ALICE}`,
    ]);
  });

  it('knows a member who is kept out on purpose, a forum that is gone and a member who left', async () => {
    const fake = gateway();
    fake.barred.set(EAST_FORUM, new Set([ALICE]));
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('barred');
    fake.leftServer.add(BOB);
    expect(await fake.memberAccess(EAST_FORUM, BOB)).toBeUndefined();
    fake.gone.add(WEST_FORUM);
    expect(await fake.memberAccess(WEST_FORUM, ALICE)).toBeUndefined();
    expect(await fake.admitMember(WEST_FORUM, ALICE)).toBe(false);
    expect(await fake.dismissMember(WEST_FORUM, ALICE)).toBe(true);
  });

  it('does not dismiss a member whose overwrite somebody turned into a bar', async () => {
    const fake = gateway();
    fake.shutOut(EAST_FORUM, ALICE);
    await fake.admitMember(EAST_FORUM, ALICE);
    fake.admitted.get(EAST_FORUM)?.delete(ALICE);
    fake.barred.set(EAST_FORUM, new Set([ALICE]));
    expect(await fake.dismissMember(EAST_FORUM, ALICE)).toBe(false);
    expect(await fake.memberAccess(EAST_FORUM, ALICE)).toBe('barred');
  });

  it('fails as told, also when only looking', async () => {
    const fake = gateway();
    fake.failing.set('memberAccess', new Error('no access'));
    fake.failing.set('admitMember', new Error('no permission'));
    await expect(fake.memberAccess(WEST_FORUM, ALICE)).rejects.toThrow('no access');
    await expect(fake.admitMember(WEST_FORUM, ALICE)).rejects.toThrow('no permission');
    expect(fake.canSee(WEST_FORUM, ALICE)).toBe(true);
  });
});
```

Run: `npx vitest run --project unit test/support/fake-gateway.test.ts`
Expected: FAIL (the fake has no `shutOut`, `memberAccess`, `admitMember` or `dismissMember`).

- [ ] **Step 3: The implementation**

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -2,6 +2,7 @@ import {
   ChannelFlags,
   ChannelType,
   DiscordAPIError,
+  OverwriteType,
   PermissionFlagsBits,
   RESTJSONErrorCodes,
   RateLimitError,
@@ -12,6 +13,7 @@ import {
   type Client,
   type ForumChannel,
   type AnyThreadChannel,
+  type GuildMember,
 } from 'discord.js';
 
 /** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
@@ -23,6 +25,14 @@ export interface OutgoingMessage {
   mention?: { users?: string[]; roles?: string[] };
 }
 
+/**
+ * How a member stands to a forum. `visible`: they can see it. `hidden`: they cannot, and nothing
+ * says that they in particular should not. `barred`: they cannot, and somebody set that on
+ * purpose: the forum has a permission overwrite for this very member, or one that denies the
+ * view to a role they hold (other than everybody's).
+ */
+export type MemberAccess = 'visible' | 'hidden' | 'barred';
+
 /** Tag ids of a forum by tag name. */
 export type TagIds = Readonly<Record<string, string>>;
 
@@ -105,6 +115,25 @@ export interface PartyGateway {
   editMessage(channelId: string, messageId: string, message: OutgoingMessage): Promise<boolean>;
   /** Deletes a message; one that is already gone is fine. */
   deleteMessage(channelId: string, messageId: string): Promise<void>;
+  /**
+   * Whether a member of the server can see a forum (and with it the posts in it), by their
+   * roles and the forum's permission overwrites. Undefined when the forum is gone or the member
+   * is not in its server.
+   */
+  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined>;
+  /**
+   * Lets a member into a forum with a permission overwrite of their own: see the forum, read
+   * what was written, write in its posts (not that, when a role of theirs may not write there).
+   * It takes the place of an overwrite the member had. False when the forum is gone. Needs
+   * Manage Permissions in the forum, and the bot can only give what it has there itself.
+   */
+  admitMember(forumId: string, memberId: string): Promise<boolean>;
+  /**
+   * Removes the permission overwrite `admitMember` made for a member. True when it is gone (also
+   * when it, or the forum, was gone already). False when the member's overwrite is no longer
+   * what `admitMember` made: somebody changed it since, and it is left as it is.
+   */
+  dismissMember(forumId: string, memberId: string): Promise<boolean>;
   /** The name of a channel the bot can see, from the cache. */
   channelName(channelId: string): string | undefined;
   /**
@@ -133,6 +162,22 @@ const GONE: ReadonlySet<number | string> = new Set([
   RESTJSONErrorCodes.UnknownGuild,
 ]);
 
+/** What a member who is let into a forum may do there (spec 5.4). */
+const ADMITTED = {
+  ViewChannel: true,
+  ReadMessageHistory: true,
+  SendMessagesInThreads: true,
+} as const;
+/** The same as permission bits: an overwrite that allows nothing else and denies nothing is the bot's own. */
+const ADMITTED_BITS =
+  PermissionFlagsBits.ViewChannel |
+  PermissionFlagsBits.ReadMessageHistory |
+  PermissionFlagsBits.SendMessagesInThreads;
+
+function hasCode(err: unknown, ...codes: RESTJSONErrorCodes[]): boolean {
+  return err instanceof DiscordAPIError && codes.some((code) => err.code === code);
+}
+
 /** Whether Discord says the thing asked about no longer exists. */
 export function isGone(err: unknown): boolean {
   return err instanceof DiscordAPIError && GONE.has(err.code);
@@ -147,6 +192,11 @@ export function isMissingPermission(err: unknown): boolean {
   );
 }
 
+/** Whether Discord refused because the channel has as many permission overwrites as it can have. */
+export function isOverwriteLimit(err: unknown): boolean {
+  return hasCode(err, RESTJSONErrorCodes.MaximumNumberOfChannelPermissionOverwritesReached);
+}
+
 /** Whether Discord refused the message for what it holds (Invalid Form Body). */
 export function isRefusedBody(err: unknown): boolean {
   return (
@@ -404,6 +454,103 @@ export class DiscordPartyGateway implements PartyGateway {
     await this.done(() => channel.messages.delete(messageId));
   }
 
+  async memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> {
+    const forum = await this.forum(forumId);
+    if (!forum) return undefined;
+    // The interaction that brought the member here has put them into the cache with the roles
+    // they have now; anybody else is asked for (that needs no privileged intent). Without the
+    // GuildMembers intent the roles of somebody who did not just act are those of their last
+    // interaction: at worst a grant that was not needed, which ends with the party.
+    let member: GuildMember;
+    try {
+      member = await forum.guild.members.fetch(memberId);
+    } catch (err) {
+      if (hasCode(err, RESTJSONErrorCodes.UnknownMember, RESTJSONErrorCodes.UnknownUser)) {
+        return undefined;
+      }
+      throw err;
+    }
+    if (forum.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)) return 'visible';
+    if (forum.permissionOverwrites.cache.has(memberId)) return 'barred';
+    return DiscordPartyGateway.roleDenies(forum, member, PermissionFlagsBits.ViewChannel, false)
+      ? 'barred'
+      : 'hidden';
+  }
+
+  /**
+   * Whether the forum has an overwrite that denies a permission to a role the member holds;
+   * `everybody` says whether the role everybody has counts.
+   */
+  private static roleDenies(
+    forum: ForumChannel,
+    member: GuildMember,
+    permission: bigint,
+    everybody: boolean,
+  ): boolean {
+    return forum.permissionOverwrites.cache.some(
+      (overwrite) =>
+        overwrite.type === OverwriteType.Role &&
+        (everybody || overwrite.id !== forum.guild.id) &&
+        member.roles.cache.has(overwrite.id) &&
+        overwrite.deny.has(permission),
+    );
+  }
+
+  async admitMember(forumId: string, memberId: string): Promise<boolean> {
+    const forum = await this.forum(forumId);
+    if (!forum) return false;
+    // Somebody whose role may not write in this forum (a muted member, a forum for reading
+    // only) is let in to read: a member's own overwrite would beat what the role says.
+    const member = forum.guild.members.cache.get(memberId);
+    const muted =
+      member !== undefined &&
+      DiscordPartyGateway.roleDenies(
+        forum,
+        member,
+        PermissionFlagsBits.SendMessagesInThreads,
+        true,
+      );
+    const { SendMessagesInThreads: _write, ...readOnly } = ADMITTED;
+    return this.done(() =>
+      // The type is given, so discord.js does not look for the member in its cache.
+      forum.permissionOverwrites.create(memberId, muted ? readOnly : ADMITTED, {
+        type: OverwriteType.Member,
+        reason: 'Signed up for a raid in this forum',
+      }),
+    );
+  }
+
+  async dismissMember(forumId: string, memberId: string): Promise<boolean> {
+    const forum = await this.forum(forumId);
+    if (!forum) return true;
+    // Only what `admitMember` made: an overwrite a moderator changed since (to keep the member
+    // out, or to give them more) is theirs. The cache follows the channel with the Guilds intent.
+    const own = forum.permissionOverwrites.cache.get(memberId);
+    if (
+      own &&
+      (own.type !== OverwriteType.Member ||
+        own.deny.bitfield !== 0n ||
+        !own.allow.has(PermissionFlagsBits.ViewChannel) ||
+        (own.allow.bitfield & ~ADMITTED_BITS) !== 0n)
+    ) {
+      return false;
+    }
+    try {
+      await forum.permissionOverwrites.delete(
+        memberId,
+        'No longer signed up for a raid in this forum',
+      );
+    } catch (err) {
+      const gone = hasCode(
+        err,
+        RESTJSONErrorCodes.UnknownChannel,
+        RESTJSONErrorCodes.UnknownPermissionOverwrite,
+      );
+      if (!gone) throw err;
+    }
+    return true;
+  }
+
   channelName(channelId: string): string | undefined {
     const channel = this.client.channels.cache.get(channelId);
     return channel && 'name' in channel && typeof channel.name === 'string'
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit test/support/fake-gateway.test.ts`
Expected: PASS (`src/discord/party-gateway.ts` and the fake gateway).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/discord/party-gateway.ts test/support/fake-gateway.test.ts test/support/fake-gateway.ts
npm run check
git add src/discord/party-gateway.ts test/support/fake-gateway.test.ts test/support/fake-gateway.ts
git commit -m "The gateway lets a member into a forum and takes that back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,899 unit tests.

---

### Task 4: AccessService: let in who cannot see the forum of their raid, and out again

**Files:**
- Create: `src/services/access-service.test.ts`, `src/services/access-service.ts`
- Modify: `src/app.ts`, `src/services/party-scheduler.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3; `KeyedLock`, `attendeeOf`, `PartyStatus`, `isMissingPermission`; `PartyScheduler` (its `upkeep`); `src/app.ts`; test support `partyServiceWith`, `reportedRaid`, `restarted`, `Outliving`.
- Produces: `AccessService` (`src/services/access-service.ts`): `load()`, `has(forumId, memberId)`, `size`, `sweep(): Promise<number>`, `flush()`; it subscribes to the store in its constructor. `PartySchedulerOptions.access?: { sweep() }`, swept in the upkeep (each step of the upkeep now fails by itself). Test support: `MemoryAccessGrants`, `Outliving.grants`, and `access` and `grants` in what `partyServiceWith` returns. `src/app.ts`: the service is made, loaded after the parties, swept by the clock and flushed at shutdown.

What happens for one member and forum happens one after the other (a lock per pair); nothing is awaited by whoever changed the party. A member is settled when they come to take part or stop, and again with every step they take while they take part (so a failure is tried again). The record is written before the overwrite is made, and the overwrite removed before the record. In the test support every party service now has an access service over the same store and gateway; on the fake gateway everybody sees every forum unless `shutOut` says otherwise, so existing tests are not touched by it.

- [ ] **Step 1: Test support**

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -1,10 +1,15 @@
 import { loadSettings } from '../../src/config/settings.js';
+import type {
+  AccessGrant,
+  AccessGrantStorage,
+} from '../../src/db/repositories/access-grant-repository.js';
 import type { PartyStorage } from '../../src/db/repositories/party-repository.js';
 import type { Region } from '../../src/db/repositories/region-repository.js';
 import {
   DEFAULT_USER_SETTINGS,
   type UserSettings,
 } from '../../src/db/repositories/user-repository.js';
+import { AccessService } from '../../src/services/access-service.js';
 import { PartyLines } from '../../src/services/party-lines.js';
 import { PartyScheduler } from '../../src/services/party-scheduler.js';
 import { AttendanceService } from '../../src/services/attendance-service.js';
@@ -64,6 +69,46 @@ export class TestRegions {
   };
 }
 
+/**
+ * The grants of access to forums, kept in memory as `AccessGrantRepository` keeps them. Set
+ * `failing` to make every call reject.
+ */
+export class MemoryAccessGrants implements AccessGrantStorage {
+  failing: Error | undefined;
+  readonly rows: AccessGrant[] = [];
+
+  private attempt<T>(work: () => T): Promise<T> {
+    return new Promise((resolve, reject) => {
+      setImmediate(() => {
+        if (this.failing) reject(this.failing);
+        else resolve(work());
+      });
+    });
+  }
+
+  list(): Promise<AccessGrant[]> {
+    return this.attempt(() => [...this.rows]);
+  }
+
+  add(grant: AccessGrant): Promise<void> {
+    return this.attempt(() => {
+      const recorded = this.rows.some(
+        (row) => row.forumChannelId === grant.forumChannelId && row.memberId === grant.memberId,
+      );
+      if (!recorded) this.rows.push(grant);
+    });
+  }
+
+  remove(forumChannelId: string, memberId: string): Promise<void> {
+    return this.attempt(() => {
+      const index = this.rows.findIndex(
+        (row) => row.forumChannelId === forumChannelId && row.memberId === memberId,
+      );
+      if (index >= 0) this.rows.splice(index, 1);
+    });
+  }
+}
+
 /**
  * A fake gateway whose server has the two channels for copies of raids, under the names of the
  * test settings (`REMOTE_CHANNEL`, `EX_CHANNEL`). Without them, as in most tests, a raid has no
@@ -80,6 +125,8 @@ export function gatewayWithMirrorChannels(): FakePartyGateway {
 /** What a restart of the bot leaves as it was: the database, Discord, and the time. */
 export interface Outliving {
   storage: MemoryPartyStorage;
+  /** The recorded grants of access to forums. */
+  grants: AccessGrantStorage;
   gateway: FakePartyGateway;
   regions: TestRegions;
   clock: { now: number };
@@ -105,6 +152,8 @@ export function restarted(made: Outliving, overrides: Partial<PartyServiceOption
  * `attendance` is the attendance service over the same store and gateway; its lines go out only
  * by its own `flush()`. `userSettings` holds what differs from the defaults, by member.
  * `scheduler` is the clock over all of it: it never runs by itself, a test calls `tick()`.
+ * `access` lets members into forums they cannot see (on the fake gateway everybody sees every
+ * forum unless `gateway.shutOut` says otherwise); it works on the side, `access.flush()` waits.
  *
  * `kept` is what outlives a restart (see `restarted`).
  */
@@ -121,6 +170,9 @@ export async function partyServiceWith(
   const store = new PartyStore({ storage: database ?? storage, log, now });
   await store.load();
   const gateway = kept?.gateway ?? new FakePartyGateway();
+  const grants = kept?.grants ?? new MemoryAccessGrants();
+  const access = new AccessService({ store, gateway, storage: grants, log, now });
+  await access.load();
   const tags = kept?.tags ?? {
     [WEST_FORUM]: gateway.addForum(WEST_FORUM, FORUM_TAGS, 'west-raids'),
     [EAST_FORUM]: gateway.addForum(EAST_FORUM, FORUM_TAGS, 'east-raids'),
@@ -186,6 +238,7 @@ export async function partyServiceWith(
     store,
     posts: service,
     attendance,
+    access,
     lines,
     gateway,
     raidBosses,
@@ -196,6 +249,8 @@ export async function partyServiceWith(
   return {
     service,
     attendance,
+    access,
+    grants,
     raids,
     scheduler,
     lines,
```

- [ ] **Step 2: Write the failing tests**

Create `src/services/access-service.test.ts`:

```ts
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { EAST_CHANNEL, EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import { MemoryAccessGrants, reportedRaid, restarted } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const yveltal = { boss: { key: 'yveltal' } } as const;

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** Lets everything that is under way finish: the access, the lines, the posts. */
async function settled(made: Made): Promise<void> {
  await made.attendance.flush();
  await made.access.flush();
  await made.service.flush();
}

/** The calls that changed who may see a forum, in order. */
const accessCalls = (made: Made): string[] =>
  made.gateway.calls.filter((call) => /^(admit|dismiss)Member /.test(call));

/** A second raid in West, at the fountain (gym 2), reported by `REPORTER`; gives its id. */
async function secondRaid(made: Made): Promise<string> {
  const gym = gymsFixture().get(2);
  if (!gym) throw new Error('no gym 2');
  const outcome = await made.service.reportRaid({
    gym,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.NotInterested,
    tier: { level: 'T3', shadow: false },
    boss: null,
  });
  if (outcome.kind !== 'created') throw new Error(outcome.kind);
  return outcome.party.id;
}

function missingPermissions(): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError({ code, message: 'Missing Permissions' }, code, 403, 'PUT', '/x', {});
}

describe('AccessService: who is let into a forum', () => {
  it('lets in a member who signs up and cannot see the forum, and records it first', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(await made.grants.list()).toEqual([
      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: made.clock.now },
    ]);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
    // Whatever else they do in the raid changes nothing about it.
    await made.attendance.changeNumber(made.party.id, alice, 1);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await settled(made);
    expect(accessCalls(made)).toHaveLength(1);
  });

  it('does nothing for a member who can see the forum', async () => {
    const made = await reportedRaid(yveltal);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
    expect(await made.grants.list()).toEqual([]);
  });

  it('lets in whoever reports a raid for a forum they cannot see', async () => {
    const made = await reportedRaid();
    made.gateway.shutOut(EAST_FORUM, BOB);
    const gym = gymsFixture().get(8);
    if (!gym) throw new Error('no gym 8');
    const outcome = await made.service.reportRaid({
      gym,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T5', shadow: false },
      boss: null,
      regionChannelId: EAST_CHANNEL,
    });
    expect(outcome.kind).toBe('created');
    await settled(made);
    expect(made.gateway.canSee(EAST_FORUM, BOB)).toBe(true);
    expect(made.access.has(EAST_FORUM, BOB)).toBe(true);
    // The reporter of the first raid sees West, and nobody was let into it.
    expect(made.access.size).toBe(1);
  });

  it('takes the access back when the member leaves', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(accessCalls(made)).toEqual([
      `admitMember ${WEST_FORUM} ${ALICE}`,
      `dismissMember ${WEST_FORUM} ${ALICE}`,
    ]);
    expect(await made.grants.list()).toEqual([]);
    expect(made.access.size).toBe(0);
  });

  it('takes it back when the member has completed the raid, and gives it again when they are back', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.attendance.done(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(accessCalls(made).map((call) => call.split(' ')[0])).toEqual([
      'admitMember',
      'dismissMember',
      'admitMember',
    ]);
  });

  it('keeps the access while the member is in another raid of the same forum', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const other = await secondRaid(made);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(other, alice, PartyStatus.Interested);
    await settled(made);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    await made.attendance.leave(other, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(accessCalls(made)).toHaveLength(2);
  });

  it('takes back what a raid called for when the raid ends', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    const other = await secondRaid(made);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.signUp(other, bob, PartyStatus.Coming);
    await settled(made);
    expect(made.access.size).toBe(2);
    await made.service.end(made.party.id);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    // Bob is still in the other raid of this forum.
    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(true);
    expect((await made.grants.list()).map((grant) => grant.memberId)).toEqual([BOB]);
  });

  it('ends with no access for a member who signs up and leaves at once', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await Promise.all([
      made.attendance.signUp(made.party.id, alice, PartyStatus.Coming),
      made.attendance.leave(made.party.id, alice),
    ]);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
  });
});

describe('AccessService: what it leaves alone and what can fail', () => {
  it('leaves a member alone whom somebody keeps out of the forum on purpose', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
    expect(made.gateway.barred.get(WEST_FORUM)?.has(ALICE)).toBe(true);
    expect(made.entries.some((entry) => /kept out of a forum/.test(String(entry.msg)))).toBe(true);
  });

  it('never touches an overwrite it did not make', async () => {
    const made = await reportedRaid(yveltal);
    // A moderator let Alice in by hand: she can see the forum, so nothing is recorded.
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.admitted.set(WEST_FORUM, new Set([ALICE]));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    await made.access.sweep();
    expect(accessCalls(made)).toEqual([]);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
  });

  it('leaves a forum alone for ten minutes that refused it, and says why once', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB, CAROL);
    made.gateway.failing.set('admitMember', missingPermissions());
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(await made.grants.list()).toEqual([]);
    expect(made.access.size).toBe(0);
    const warnings = made.entries.filter((entry) => /Manage Permissions/.test(String(entry.msg)));
    expect(warnings).toHaveLength(1);

    made.gateway.failing.delete('admitMember');
    made.clock.now += 10 * MINUTE;
    await made.attendance.signUp(made.party.id, { id: CAROL }, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, CAROL)).toBe(true);
  });

  it('takes back an overwrite that may or may not have been made', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.failing.set('admitMember', new Error('socket hang up'));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([
      `admitMember ${WEST_FORUM} ${ALICE}`,
      `dismissMember ${WEST_FORUM} ${ALICE}`,
    ]);
    expect(await made.grants.list()).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'could not let a member into a forum')).toBe(
      true,
    );
  });

  it('keeps the record when it can neither make an overwrite nor take it back, and the grant goes later', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.failing.set('admitMember', new Error('socket hang up'));
    made.gateway.failing.set('dismissMember', new Error('socket hang up'));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    // Whether Discord has the overwrite is not known: the record stays, so it can be taken back.
    expect(await made.grants.list()).toHaveLength(1);
    const logged = made.entries.map((entry) => entry.msg);
    expect(logged).toContain('could not let a member into a forum');
    expect(logged).toContain('could not settle the access of a member to a forum');
    made.gateway.failing.clear();
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(await made.grants.list()).toEqual([]);
  });

  it('never takes away what a moderator made of its overwrite: a member who was barred stays barred', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    // A moderator turns the overwrite into one that keeps Alice out.
    made.gateway.admitted.get(WEST_FORUM)?.delete(ALICE);
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.barred.get(WEST_FORUM)?.has(ALICE)).toBe(true);
    // The record is dropped all the same: the overwrite is no longer the bot's.
    expect(await made.grants.list()).toEqual([]);
    expect(
      made.entries.some((entry) => /somebody changed the access I gave/.test(String(entry.msg))),
    ).toBe(true);
    // And signing up again does not let her in.
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(accessCalls(made).filter((call) => call.startsWith('admitMember'))).toHaveLength(1);
  });

  it("tries again with the member's next step when Discord could not be asked", async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.failing.set('memberAccess', new Error('503'));
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    made.gateway.failing.delete('memberAccess');
    await made.attendance.changeNumber(made.party.id, alice, 1);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
  });

  it('forgets the record again when the forum is gone by the time the member is let in', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const admit = made.gateway.admitMember.bind(made.gateway);
    vi.spyOn(made.gateway, 'admitMember').mockImplementation((forumId, memberId) => {
      made.gateway.gone.add(forumId);
      return admit(forumId, memberId);
    });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(await made.grants.list()).toEqual([]);
    expect(made.access.size).toBe(0);
  });

  it('keeps the record when the row cannot be removed, and the sweep finishes the job', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    const storage = made.grants as MemoryAccessGrants;
    storage.failing = new Error('the database is away');
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
    storage.failing = undefined;
    expect(await made.access.sweep()).toBe(1);
    expect(await made.grants.list()).toEqual([]);
  });

  it('takes the grant back of a member who leaves while the record is being written', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const storage = made.grants as MemoryAccessGrants;
    const add = storage.add.bind(storage);
    let leaving: Promise<unknown> | undefined;
    vi.spyOn(storage, 'add').mockImplementation(async (grant) => {
      // The member leaves while the record is on its way: nothing is recorded in memory yet.
      leaving = made.attendance.leave(made.party.id, alice);
      await leaving;
      return add(grant);
    });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.access.flush();
    await leaving;
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
    expect(accessCalls(made).map((call) => call.split(' ')[0])).toEqual([
      'admitMember',
      'dismissMember',
    ]);
  });

  it('rests for ten minutes when the forum has as many overwrites as Discord allows', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    const code = RESTJSONErrorCodes.MaximumNumberOfChannelPermissionOverwritesReached;
    made.gateway.failing.set(
      'admitMember',
      new DiscordAPIError({ code, message: 'Maximum reached' }, code, 400, 'PUT', '/x', {}),
    );
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
    expect(
      made.entries.filter((entry) => /as many permission overwrites/.test(String(entry.msg))),
    ).toHaveLength(1);
  });

  it('keeps the record of a grant it could not take back, and tries again with the sweep', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    made.gateway.failing.set('dismissMember', new Error('Discord is away'));
    await made.attendance.leave(made.party.id, alice);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect(await made.grants.list()).toHaveLength(1);

    made.gateway.failing.delete('dismissMember');
    expect(await made.access.sweep()).toBe(1);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await made.grants.list()).toEqual([]);
  });

  it('records nothing when the record cannot be written, and makes no overwrite', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    (made.grants as MemoryAccessGrants).failing = new Error('the database is away');
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
    expect(made.access.size).toBe(0);
  });

  it('does nothing for a member who is no longer in the server', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.leftServer.add(ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(accessCalls(made)).toEqual([]);
  });
});

describe('AccessService: over a restart, and the sweep', () => {
  it('knows its grants after a restart and takes them back when the member leaves', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    const again = await restarted(made);
    expect(again.access.has(WEST_FORUM, ALICE)).toBe(true);
    await again.attendance.leave(made.party.id, alice);
    await again.attendance.flush();
    await again.access.flush();
    expect(again.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(await again.grants.list()).toEqual([]);
  });

  it('sweeps what nothing calls for any more and keeps the rest', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    // Left behind by a stop of the process: a grant for somebody who is in no raid here, and
    // one for a forum that is gone.
    await made.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    await made.grants.add({
      forumChannelId: '100000000000000099',
      memberId: BOB,
      guildId: 1,
      createdAt: 2,
    });
    made.gateway.admitted.get(WEST_FORUM)?.add(BOB);
    const again = await restarted(made);
    expect(again.access.size).toBe(3);
    expect(await again.access.sweep()).toBe(2);
    expect(again.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
    expect(again.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    expect((await again.grants.list()).map((grant) => grant.memberId)).toEqual([ALICE]);
    expect(await again.access.sweep()).toBe(0);
  });

  it('lets a member in again whose record has no overwrite, with the sweep', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await settled(made);
    // A stop between the record and the overwrite, or an overwrite deleted by hand.
    made.gateway.admitted.get(WEST_FORUM)?.delete(ALICE);
    const again = await restarted(made);
    expect(await again.access.sweep()).toBe(0);
    expect(again.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    // Bob's was fine and is not made again.
    expect(accessCalls(made).filter((call) => call.endsWith(BOB))).toHaveLength(1);
    // The sweep lets nobody in who has no record.
    made.gateway.shutOut(WEST_FORUM, REPORTER);
    await again.access.sweep();
    expect(again.gateway.canSee(WEST_FORUM, REPORTER)).toBe(false);
  });

  it('does its part of the upkeep also when the look through the forums fails', async () => {
    const made = await reportedRaid(yveltal);
    await made.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    const again = await restarted(made);
    vi.spyOn(again.service, 'sweepPosts').mockRejectedValue(new Error('no forums today'));
    await again.scheduler.start();
    await again.scheduler.whenIdle();
    await again.scheduler.stop();
    expect(await again.grants.list()).toEqual([]);
  });

  it('is swept by the clock with the forums, at start and hourly', async () => {
    const made = await reportedRaid(yveltal);
    await made.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    const again = await restarted(made);
    await again.scheduler.start();
    await again.scheduler.whenIdle();
    expect(await again.grants.list()).toEqual([]);

    await again.grants.add({ forumChannelId: WEST_FORUM, memberId: BOB, guildId: 1, createdAt: 1 });
    const third = await restarted(again);
    third.clock.now += 59 * MINUTE;
    await third.scheduler.tick();
    await third.scheduler.whenIdle();
    expect(await third.grants.list()).toHaveLength(1);
    third.clock.now += MINUTE;
    await third.scheduler.tick();
    await third.scheduler.whenIdle();
    expect(await third.grants.list()).toEqual([]);
    await again.scheduler.stop();
  });
});
```

Run: `npx vitest run --project unit src/services/access-service.test.ts`
Expected: FAIL (`access-service.ts` does not exist; the test support has no `access`).

- [ ] **Step 3: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -6,6 +6,7 @@ import { loadConfig } from './config/index.js';
 import { dbConfigFrom } from './db/db-config.js';
 import { createDb } from './db/kysely.js';
 import { runMigrations } from './db/migrator.js';
+import { AccessGrantRepository } from './db/repositories/access-grant-repository.js';
 import { GuildRepository } from './db/repositories/guild-repository.js';
 import { GymRepository } from './db/repositories/gym-repository.js';
 import { PartyRepository } from './db/repositories/party-repository.js';
@@ -22,6 +23,7 @@ import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
 import { createLogger, type Logger } from './log.js';
+import { AccessService } from './services/access-service.js';
 import { AttendanceService } from './services/attendance-service.js';
 import { GameDataService } from './services/game-data-service.js';
 import { GymDirectory } from './services/gym-directory.js';
@@ -97,6 +99,13 @@ export async function startApp(
   const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const partyGateway = new DiscordPartyGateway();
+  // Listens to the store: whoever signs up for a party in a forum they cannot see is let in.
+  const access = new AccessService({
+    store: parties,
+    gateway: partyGateway,
+    storage: new AccessGrantRepository(db),
+    log,
+  });
   const guilds = new GuildRepository(db);
   const partyService = new PartyService({
     store: parties,
@@ -141,6 +150,7 @@ export async function startApp(
     store: parties,
     posts: partyService,
     attendance,
+    access,
     lines,
     gateway: partyGateway,
     raidBosses,
@@ -161,6 +171,7 @@ export async function startApp(
     await gyms.load();
     await regions.load();
     await parties.load();
+    await access.load();
     // What a stop between storing a raid and creating its post left behind: only the store is
     // needed, and reports can arrive as soon as the bot has logged in.
     await partyService.endPartiesWithoutPost();
@@ -284,6 +295,7 @@ export async function startApp(
       { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
+      { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
```

Create `src/services/access-service.ts`:

```ts
import type {
  AccessGrant,
  AccessGrantStorage,
} from '../db/repositories/access-grant-repository.js';
import {
  isMissingPermission,
  isOverwriteLimit,
  type PartyGateway,
} from '../discord/party-gateway.js';
import { attendeeOf, type Party } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Logger } from '../log.js';
import { KeyedLock } from './keyed-lock.js';
import type { PartyListener } from './party-store.js';

/** A forum that refused the bot for lack of a permission is left alone for this long. */
const REFUSED_FOR_MS = 10 * 60_000;

export interface AccessServiceOptions {
  /** The active parties, and the word about every change of one. */
  store: { active(): Party[]; onChange(listener: PartyListener): void };
  gateway: Pick<PartyGateway, 'memberAccess' | 'admitMember' | 'dismissMember'>;
  storage: AccessGrantStorage;
  log: Logger;
  now?: () => number;
}

/** Whether the member is signed up for the party and has not completed it. */
function takesPart(party: Party, memberId: string): boolean {
  const attendee = attendeeOf(party, memberId);
  return attendee !== undefined && attendee.status !== PartyStatus.Complete;
}

function takingPart(party: Party): string[] {
  return Object.keys(party.attendees).filter((memberId) => takesPart(party, memberId));
}

/**
 * Access for members of other regions (spec 5.4). A member can sign up for a raid whose post
 * they cannot see: through a copy of it in the server's channel for remote raids or for EX gyms,
 * by reporting a raid at a gym of another region, or because the raid they are in moved there.
 * Such a member is let into the forum of that region, with a permission overwrite of their own,
 * for as long as they take part in a party there: until they leave or have completed it and are
 * in no other party of that forum, or the party ends.
 *
 * It listens to the party store, so it does not matter who changed a party. Every overwrite it
 * makes is recorded (`PartyAccessGrant`) before it is made, and only recorded ones are ever
 * taken back, and only while they are still what it made: an overwrite a moderator set or
 * changed for a member is none of its business, and a member somebody keeps out on purpose (by
 * an overwrite of their own, or of a role of theirs) stays out. To keep a member out of a forum
 * for good, moderators set such an overwrite; taking the region's role away is not enough. What happens for one member and forum happens one
 * after the other. Nothing here is awaited by whoever changed the party; `flush` waits for it.
 *
 * The overwrite is on the forum alone, never on the region's text channel.
 */
export class AccessService {
  private readonly now: () => number;
  private readonly grants = new Map<string, AccessGrant>();
  private readonly locks = new KeyedLock<string>();
  /** How many settlements are running or waiting, by member and forum. */
  private readonly waiting = new Map<string, number>();
  /** By forum: until when it is left alone after it refused the bot. */
  private readonly refused = new Map<string, number>();

  constructor(private readonly options: AccessServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    options.store.onChange((before, after) => {
      this.partyChanged(before, after);
    });
  }

  private static key(forumId: string, memberId: string): string {
    return `${forumId}:${memberId}`;
  }

  /** Reads the recorded grants. Once, at start, before parties can change. */
  async load(): Promise<void> {
    for (const grant of await this.options.storage.list()) {
      this.grants.set(AccessService.key(grant.forumChannelId, grant.memberId), grant);
    }
    this.options.log.info({ grants: this.grants.size }, 'access grants loaded');
  }

  /** Whether the member was let into the forum by this service. */
  has(forumId: string, memberId: string): boolean {
    return this.grants.has(AccessService.key(forumId, memberId));
  }

  /** How many members are let into forums by this service now. */
  get size(): number {
    return this.grants.size;
  }

  /** Whether the member takes part in an active party whose post is in this forum. */
  private wanted(forumId: string, memberId: string): boolean {
    return this.options.store
      .active()
      .some((party) => party.forumChannelId === forumId && takesPart(party, memberId));
  }

  /** What a stored change means for who should be let into which forum. */
  private partyChanged(before: Party | undefined, after: Party): void {
    const now = after.status === 'active' ? after : undefined;
    const forumBefore = before?.forumChannelId ?? null;
    const forumNow = now?.forumChannelId ?? null;
    if (forumBefore !== forumNow) {
      // The post was made, the party ended, or it is somewhere else now: everybody in it.
      if (before && forumBefore !== null) {
        for (const id of takingPart(before)) this.settle(forumBefore, id, before.guildId);
      }
      if (now && forumNow !== null) {
        for (const id of takingPart(now)) this.settle(forumNow, id, now.guildId);
      }
      return;
    }
    if (!before || !now || forumNow === null || before.attendees === now.attendees) return;
    const members = new Set([...Object.keys(before.attendees), ...Object.keys(now.attendees)]);
    for (const id of members) {
      // Whoever comes or goes; and whoever does anything while they take part, so that a
      // member who could not be let in when they signed up is tried again with their next step.
      const acted = takesPart(now, id) && before.attendees[id] !== now.attendees[id];
      if (acted || takesPart(before, id) !== takesPart(now, id)) {
        this.settle(forumNow, id, now.guildId);
      }
    }
  }

  /**
   * Brings one member's access to one forum in line with the parties, on the side: let in when
   * they take part in a party there and cannot see it, the grant taken back when they no longer
   * take part in any. `verify` also looks whether a member who was let in really can see the
   * forum, and lets them in again when not (for the sweep). Never throws; what fails is logged.
   */
  private settle(forumId: string, memberId: string, guildId: number, verify = false): void {
    const key = AccessService.key(forumId, memberId);
    // Most changes end here: somebody who was never let in is no longer in a party.
    if (!this.grants.has(key) && !this.waiting.has(key) && !this.wanted(forumId, memberId)) return;
    this.waiting.set(key, (this.waiting.get(key) ?? 0) + 1);
    void this.locks
      .run(key, () => this.settleNow(forumId, memberId, guildId, verify))
      .catch((err: unknown) => {
        this.options.log.warn(
          { err, forum: forumId, member: memberId },
          'could not settle the access of a member to a forum',
        );
      })
      .finally(() => {
        const left = (this.waiting.get(key) ?? 1) - 1;
        if (left > 0) this.waiting.set(key, left);
        else this.waiting.delete(key);
      });
  }

  private async settleNow(
    forumId: string,
    memberId: string,
    guildId: number,
    verify: boolean,
  ): Promise<void> {
    const { gateway, storage, log } = this.options;
    const key = AccessService.key(forumId, memberId);
    const wanted = this.wanted(forumId, memberId);
    const recorded = this.grants.has(key);
    if (!wanted) {
      if (!recorded) return;
      // The overwrite first: a record that is left over is tried again, an overwrite that is
      // left over without a record never.
      const gone = await gateway.dismissMember(forumId, memberId);
      await storage.remove(forumId, memberId);
      this.grants.delete(key);
      log.info(
        { forum: forumId, member: memberId },
        gone
          ? 'took back the access of a member to a forum'
          : 'somebody changed the access I gave a member to a forum; left as it is',
      );
      return;
    }
    if (recorded && !verify) return;
    if ((this.refused.get(forumId) ?? 0) > this.now()) return;
    const access = await gateway.memberAccess(forumId, memberId);
    if (access === 'barred' && !recorded) {
      log.info(
        { forum: forumId, member: memberId },
        'a member who is kept out of a forum signed up for a party there; left as it is',
      );
    }
    // They may have left again while Discord was asked.
    if (access !== 'hidden' || !this.wanted(forumId, memberId)) return;
    if (!recorded) {
      const grant: AccessGrant = {
        forumChannelId: forumId,
        memberId,
        guildId,
        createdAt: this.now(),
      };
      // The record first: an overwrite nobody remembers would stay for good.
      await storage.add(grant);
      this.grants.set(key, grant);
    }
    try {
      if (await gateway.admitMember(forumId, memberId)) {
        log.info({ forum: forumId, member: memberId }, 'let a member into a forum');
        return;
      }
    } catch (err) {
      if (!isMissingPermission(err) && !isOverwriteLimit(err)) {
        log.warn({ err, forum: forumId, member: memberId }, 'could not let a member into a forum');
        // Whether the overwrite was made is not known: it is taken back, and should that fail
        // too, the record stays and the overwrite goes with it later.
        await gateway.dismissMember(forumId, memberId);
        await this.forget(forumId, memberId);
        return;
      }
      this.refused.set(forumId, this.now() + REFUSED_FOR_MS);
      log.warn(
        { err, forum: forumId, member: memberId },
        isOverwriteLimit(err)
          ? 'cannot let members of other regions into a forum: it has as many permission overwrites as Discord allows'
          : 'cannot let members of other regions into a forum: I need Manage Permissions there, ' +
              'and may only give what I have there myself (View Channel, Read Message History, ' +
              'Send Messages in Threads)',
      );
    }
    // Refused, or the forum is gone: nothing was made.
    await this.forget(forumId, memberId);
  }

  private async forget(forumId: string, memberId: string): Promise<void> {
    await this.options.storage.remove(forumId, memberId);
    this.grants.delete(AccessService.key(forumId, memberId));
  }

  /**
   * Looks through every recorded grant: one that nothing calls for any more is taken back (what
   * a failure or a stop of the process left behind, and the grants of a forum that no party is
   * in), and a member who should be in a forum and cannot see it (a record without its
   * overwrite) is let in again. It never lets anybody in who has no record. At start and hourly
   * (spec 5.4 asks for daily). Gives how many grants are gone. Never rejects.
   */
  async sweep(): Promise<number> {
    const before = new Set(this.grants.keys());
    for (const grant of [...this.grants.values()]) {
      this.settle(grant.forumChannelId, grant.memberId, grant.guildId, true);
    }
    await this.flush();
    return [...before].filter((key) => !this.grants.has(key)).length;
  }

  /** Waits for everything that is under way. For shutdown and for tests. */
  async flush(): Promise<void> {
    await this.locks.whenIdle();
  }
}
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -20,6 +20,8 @@ export interface PartySchedulerOptions {
   store: PartyStore;
   posts: Pick<PartyService, 'changed' | 'end' | 'rules' | 'view' | 'sweepPosts' | 'checkSummaries'>;
   attendance: Pick<AttendanceService, 'ask' | 'removeQuestions'>;
+  /** The access of members of other regions, whose leftovers are swept with the forums. */
+  access?: { sweep(): Promise<unknown> };
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
@@ -184,13 +186,25 @@ export class PartyScheduler {
     }
   }
 
-  /** Archives open posts of ended parties and looks after the summaries: at start and hourly. */
+  /**
+   * Archives open posts of ended parties, looks after the summaries and takes back the access
+   * to forums that nothing calls for any more: at start and hourly.
+   */
   private upkeep(): void {
-    const { posts, log } = this.options;
+    const { posts, access, log } = this.options;
     this.lastUpkeep = this.now();
+    // Each by itself: one that fails does not keep the others from running.
+    const step = async (work: () => Promise<unknown>): Promise<void> => {
+      try {
+        await work();
+      } catch (err) {
+        log.error({ err }, 'the upkeep of the forums failed');
+      }
+    };
     this.upkeeping ??= (async () => {
-      await posts.sweepPosts();
-      await posts.checkSummaries();
+      await step(() => posts.sweepPosts());
+      await step(() => posts.checkSummaries());
+      if (access) await step(() => access.sweep());
     })()
       .catch((err: unknown) => {
         log.error({ err }, 'the upkeep of the forums failed');
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/services/access-service.test.ts`
Expected: PASS (`src/services/access-service.ts`, the wiring and the test support).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app.ts src/services/access-service.test.ts src/services/access-service.ts src/services/party-scheduler.ts test/support/party-service.ts
npm run check
git add src/app.ts src/services/access-service.test.ts src/services/access-service.ts src/services/party-scheduler.ts test/support/party-service.ts
git commit -m "Members who sign up for a raid in a forum they cannot see are let in, and out again" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,926 unit tests.

---

### Task 5: A raid moves to another region: a new party with a post there

**Files:**
- Create: `src/domain/party/relocate.test.ts`, `src/domain/party/relocate.ts`, `src/services/party-service.relocate.test.ts`
- Modify: `src/app.ts`, `src/render/text.ts`, `src/services/attendance-service.ts`, `src/services/party-service.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: `PartyService` (`createPostFor`, `report`, `closePost`, `abandon`, `ended`, `deleteLinkLine`, `answerBeforeClosing`, `posts`, `mirrors`, `flush`), `PartyStore.addRaidUnlessTaken` and `update`, `releaseAsked`, `noteMember`, `endParty`, `KeyedLock`; `withMentions` of the attendance service; `UserSettings`.
- Produces: `relocatedRaid(source, place)`, `carriedOver(target, source, start)` and `NewPlace` in `src/domain/party/relocate.ts`; `RelocateOutcome` (`gone`, `taken` with `other`, `no-forum`, `moved` with `party` and `from`) and `PartyService.relocate(partyId, gym, region, by?, moved?)`; `PartyServiceOptions.users?` (who lets the bot ping them); `withMentions(text, members)` and `LIMITS.pings` in `src/render/text.ts` (moved from the attendance service); `PartyService.flush` waits for a move under way.

Read decision 7 for the order, and keep it. `createTracked` is the part of `report` that remembers a post being made, so that a report of the new gym waits for the move and then signs its reporter up for the moved raid. `takeBack` undoes the new party of a move that did not happen (link line, copies, the post, the row). `closePost` takes `said`: the last words were said in the post already. The old party's access grants go with its end, by the listener of Task 4: that is why the word is said before.

- [ ] **Step 1: Test support**

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -193,6 +193,7 @@ export async function partyServiceWith(
     raidBosses: raidBossesFixture(),
     gameData: { catalogue: catalogueFixture() },
     raidEvents: raidEventsFixture(),
+    users,
     settings,
     log,
     // The fakes' server is the guild of row 1, which the invented regions belong to.
```

- [ ] **Step 2: Write the failing tests**

Create `src/domain/party/relocate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  PARTY_NOW,
  REPORTER,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import { setMeetingTime } from './attendance.js';
import type { RaidParty } from './party.js';
import { setHatchTime, setSaved } from './raid.js';
import { carriedOver, relocatedRaid } from './relocate.js';
import { PartyStatus } from './status.js';

const NEW_ID = '00000000-0000-4000-8000-0000000000aa';
const PLACE = { id: NEW_ID, guildId: 1, regionId: 2, gymId: 8 };

/** A raid in full swing: a post, a link line, copies, a question, a warning, two groups. */
function busyRaid(): RaidParty {
  const hatched = setHatchTime(
    testRaid({ boss: { key: 'yveltal' } }),
    at('2026-10-13T13:50'),
    testRaidRules(),
    PARTY_NOW,
  );
  const withMembers = withAttendees(hatched, {
    [ALICE]: { status: PartyStatus.Complete, name: 'Alice', team: 'mystic' },
    [BOB]: {
      status: PartyStatus.CompletePending,
      pendingUntil: PARTY_NOW + 60_000,
      askedBy: ALICE,
      number: 3,
      remote: true,
    },
    [CAROL]: { status: PartyStatus.Present, group: 'B' },
  });
  return {
    ...withMembers,
    groups: [{ id: 'A', label: 'early' }, { id: 'B' }],
    defaultGroupId: 'B',
    forumChannelId: '100000000000000011',
    forumPostId: '300000000000000001',
    regionLinkMessageId: '300000000000000002',
    mirrorMessages: [
      { channelId: '100000000000000021', messageId: '300000000000000003', kind: 'remote' },
    ],
    prompts: {
      completion: [{ id: '300000000000000004', members: [BOB] }],
      warning: '300000000000000005',
    },
    deletionTime: PARTY_NOW + 600_000,
    updatedAt: PARTY_NOW + 5,
  };
}

describe('relocatedRaid', () => {
  it('is the same raid in the new place, with nothing on Discord yet', () => {
    const source = busyRaid();
    const moved = relocatedRaid(source, PLACE);
    expect(moved).toMatchObject({
      id: NEW_ID,
      type: 'raid',
      status: 'active',
      guildId: 1,
      regionId: 2,
      gymId: 8,
      forumChannelId: null,
      forumPostId: null,
      regionLinkMessageId: null,
      mirrorMessages: [],
      prompts: { completion: [], warning: null },
      deletionTime: null,
      createdById: REPORTER,
      createdAt: source.createdAt,
      hatchTime: source.hatchTime,
      endTime: source.endTime,
      lastPossibleTime: source.lastPossibleTime,
      groups: source.groups,
      defaultGroupId: 'B',
    });
    expect(moved.raid).toEqual(source.raid);
    // The source is not touched.
    expect(source.forumPostId).toBe('300000000000000001');
  });

  it('keeps the members as they are, but nobody stays asked: the question was in the old post', () => {
    const moved = relocatedRaid(busyRaid(), PLACE);
    expect(Object.keys(moved.attendees)).toEqual([REPORTER, ALICE, BOB, CAROL]);
    expect(moved.attendees[ALICE]).toMatchObject({ status: PartyStatus.Complete, name: 'Alice' });
    expect(moved.attendees[BOB]).toEqual({
      status: PartyStatus.Present,
      number: 3,
      remote: true,
      group: 'A',
    });
    expect(moved.attendees[CAROL]).toMatchObject({ status: PartyStatus.Present, group: 'B' });
  });

  it('keeps a kept raid kept and a meeting time', () => {
    const source = busyRaid();
    const met = setMeetingTime(source, CAROL, at('2026-10-13T14:10'));
    if (!met.ok) throw new Error(met.reason);
    const moved = relocatedRaid(setSaved(met.party, true), PLACE);
    expect(moved.saved).toBe(true);
    expect(moved.groups.find((group) => group.id === 'B')?.startTime).toBe(at('2026-10-13T14:10'));
  });
});

describe('carriedOver', () => {
  it('gives the new party what the raid was when the old one ended, and keeps its own place and messages', () => {
    const source = busyRaid();
    const target: RaidParty = {
      ...relocatedRaid(source, PLACE),
      forumChannelId: '100000000000000012',
      forumPostId: '300000000000000011',
      regionLinkMessageId: '300000000000000012',
      mirrorMessages: [
        { channelId: '100000000000000021', messageId: '300000000000000013', kind: 'remote' },
      ],
      updatedAt: PARTY_NOW + 9,
    };
    // Meanwhile, in the old post: Carol left, the hatch time was corrected.
    const { [CAROL]: _carol, ...others } = source.attendees;
    const later = setHatchTime(
      { ...source, attendees: others },
      at('2026-10-13T13:55'),
      testRaidRules(),
      PARTY_NOW,
    );
    const carried = carriedOver(target, later, relocatedRaid(source, PLACE));
    expect(carried).toMatchObject({
      id: NEW_ID,
      regionId: 2,
      gymId: 8,
      status: 'active',
      forumChannelId: '100000000000000012',
      forumPostId: '300000000000000011',
      regionLinkMessageId: '300000000000000012',
      mirrorMessages: target.mirrorMessages,
      prompts: { completion: [], warning: null },
      hatchTime: at('2026-10-13T13:55'),
      updatedAt: PARTY_NOW + 9,
      createdAt: source.createdAt,
    });
    expect(Object.keys(carried.attendees)).toEqual([REPORTER, ALICE, BOB]);
    expect(carried.attendees[BOB]?.status).toBe(PartyStatus.Present);
  });

  it('keeps what a member did in the new party meanwhile', () => {
    const source = busyRaid();
    const start = relocatedRaid(source, PLACE);
    const dave = '200000000000000009';
    // In the new party: Dave signed up (in a group the raid does not have), Alice is back,
    // and the reporter left.
    const joined = withAttendees(start, {
      [dave]: { status: PartyStatus.Coming, group: 'C' },
      [ALICE]: { status: PartyStatus.Present, name: 'Alice', team: 'mystic' },
    });
    const { [REPORTER]: _reporter, ...stayed } = joined.attendees;
    const target = { ...joined, attendees: stayed };
    // In the old one, meanwhile: Carol left.
    const { [CAROL]: _carol, ...others } = source.attendees;
    const carried = carriedOver(target, { ...source, attendees: others }, start);
    expect(Object.keys(carried.attendees)).toEqual([ALICE, BOB, dave]);
    expect(carried.attendees[ALICE]?.status).toBe(PartyStatus.Present);
    expect(carried.attendees[dave]).toMatchObject({ status: PartyStatus.Coming, group: 'B' });
  });
});
```

Create `src/services/party-service.relocate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  REMOTE_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import {
  gatewayWithMirrorChannels,
  reportedRaid,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import type { RaidParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const yveltal = { boss: { key: 'yveltal' } } as const;

type Made = Awaited<ReturnType<typeof reportedRaid>>;

/** The café (gym 8), which lies in East. */
function cafe(): Gym {
  const gym = gymsFixture().get(8);
  if (!gym) throw new Error('no gym 8');
  return gym;
}

function east(made: Made): Region {
  const region = made.regions.byId(2);
  if (!region) throw new Error('no region East');
  return region;
}

async function settled(made: Made): Promise<void> {
  await made.attendance.flush();
  await made.service.flush();
  await made.access.flush();
}

/** Moves the raid to the café and gives the party it became. */
async function moved(made: Made, by?: Member): Promise<RaidParty> {
  const outcome = await made.service.relocate(made.party.id, cafe(), east(made), by);
  if (outcome.kind !== 'moved') throw new Error(`not moved: ${outcome.kind}`);
  await settled(made);
  return outcome.party;
}

const texts = (made: Made, channelId: string): string[] =>
  made.gateway.messagesIn(channelId).map((message) => message.message.content ?? '');

describe('PartyService.relocate', () => {
  it('makes the raid a new party with a post in the other forum, as it was', async () => {
    const made = await reportedRaid({ ...yveltal, time: { end: at('2026-10-13T14:40') } });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 2 });
    await settled(made);
    const before = made.current();

    const party = await moved(made);

    expect(party.id).not.toBe(before.id);
    expect(made.store.active().map((active) => active.id)).toEqual([party.id]);
    const stored = made.store.get(party.id);
    expect(stored).toMatchObject({
      regionId: 2,
      gymId: 8,
      forumChannelId: EAST_FORUM,
      createdById: REPORTER,
      createdAt: before.createdAt,
      hatchTime: before.hatchTime,
      endTime: before.endTime,
      attendees: before.attendees,
    });
    expect(stored?.raid).toEqual(before.raid);
    const post = made.gateway.posts.get(party.forumPostId ?? '');
    expect(post).toMatchObject({ forumId: EAST_FORUM, archived: false });
    expect(post?.title).toBe('Yveltal · Café Élan Fresco');
    const tags = made.tags[EAST_FORUM];
    expect([...(post?.tagIds ?? [])].sort()).toEqual([tags.Hatched, tags.T5].sort());
    expect(post?.message.embeds?.[0]?.fields?.map((field) => field.value).join('\n')).toContain(
      `<@${ALICE}>`,
    );
    expect(post?.message.components?.length).toBeGreaterThan(0);
  });

  it('closes the old post with where the raid went, and archives it', async () => {
    const made = await reportedRaid(yveltal);
    const party = await moved(made);

    expect(made.storage.rows.get(made.party.id)).toMatchObject({
      status: 'ended',
      forumPostId: made.postId,
    });
    const old = made.gateway.posts.get(made.postId);
    expect(old).toMatchObject({ forumId: WEST_FORUM, archived: true, locked: true, reopened: 0 });
    expect(old?.message.components).toEqual([]);
    const words = `This raid has moved to **Café Élan Fresco** in <#${EAST_CHANNEL}>: <#${party.forumPostId ?? ''}>`;
    // The reporter is signed up (interested) and allows pings.
    expect(made.said().at(-1)).toBe(`${words}\n<@${REPORTER}>`);
    expect(old?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(words);
    const tags = made.tags[WEST_FORUM];
    expect([...(old?.tagIds ?? [])].sort()).toEqual([tags.Ended, tags.T5].sort());
    const calls = made.gateway.calls.filter((call) => call.endsWith(` ${made.postId}`));
    expect(calls.at(-1)).toBe(`archivePost ${made.postId}`);
    // The hourly look finds nothing left to do for it.
    expect(await made.service.sweepPosts()).toBe(0);
  });

  it('moves the link line to the channel of the other region', async () => {
    const made = await reportedRaid(yveltal);
    expect(texts(made, WEST_CHANNEL)).toHaveLength(1);
    const party = await moved(made);
    expect(texts(made, WEST_CHANNEL)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([
      `New raid: **Yveltal · Café Élan Fresco** → <#${party.forumPostId ?? ''}>`,
    ]);
    expect(made.store.get(party.id)?.regionLinkMessageId).toBe(
      made.gateway.messagesIn(EAST_CHANNEL)[0]?.id,
    );
  });

  it('takes the copies with it: the old ones go, the new one names the new region', async () => {
    const made = await reportedRaid(
      yveltal,
      { sharedDelayMs: 0 },
      {
        gateway: gatewayWithMirrorChannels(),
      },
    );
    await made.service.showStatus(made.party.id);
    await settled(made);
    const [copy] = made.gateway.messagesIn(REMOTE_CHANNEL);
    expect(copy?.message.content).toContain(`<#${WEST_CHANNEL}>`);

    const party = await moved(made);

    const copies = made.gateway.messagesIn(REMOTE_CHANNEL);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).not.toBe(copy?.id);
    expect(copies[0]?.message.content).toContain(`<#${EAST_CHANNEL}>`);
    expect(copies[0]?.message.content).toContain(`<#${party.forumPostId ?? ''}>`);
    // The copy `/status` put into the old post is gone as well; only the last words are left.
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(1);
    expect(made.store.get(party.id)?.mirrorMessages.map((mirror) => mirror.kind)).toEqual([
      'remote',
    ]);
  });

  it('takes the question and the warning away with the old post; who was asked is here again', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    await made.attendance.signUp(id, alice, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, alice);
    await settled(made);
    expect(made.current().prompts.completion).toHaveLength(1);
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.CompletePending);
    const question = made.current().prompts.completion[0]?.id;
    expect(made.gateway.messagesIn(made.postId).map((message) => message.id)).toContain(question);

    const party = await moved(made);

    expect(made.gateway.messagesIn(made.postId).map((message) => message.id)).not.toContain(
      question,
    );
    expect(made.said().at(-1)).toMatch(/^This raid has moved/);
    const now = made.store.get(party.id);
    expect(now?.prompts).toEqual({ completion: [], warning: null });
    expect(now?.attendees[BOB]?.status).toBe(PartyStatus.Present);
    expect(now?.attendees[ALICE]?.status).toBe(PartyStatus.Complete);
  });

  it('pings in the old post those who are signed up and allow it, not who moved it or is done', async () => {
    const made = await reportedRaid(yveltal);
    const id = made.party.id;
    made.userSettings.set(BOB, { mentions: false });
    await made.attendance.signUp(id, alice, PartyStatus.Coming);
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Present);
    await made.attendance.done(id, carol);
    await settled(made);

    await moved(made, alice);

    const last = made.gateway.messagesIn(made.postId).at(-1);
    expect(last?.message.mention).toEqual({ users: [REPORTER] });
    expect(last?.message.content).toMatch(new RegExp(`\\n<@${REPORTER}>$`));
    // The sentence in the post's own message has no mentions.
    const old = made.gateway.posts.get(made.postId);
    expect(old?.message.embeds?.[0]?.description?.split('\n')[1]).toMatch(/<#\d+>$/);
  });

  it('lets the caller answer before the old post is closed, and does not wait for long', async () => {
    const made = await reportedRaid(yveltal);
    const seen: string[] = [];
    const outcome = await made.service.relocate(
      made.party.id,
      cafe(),
      east(made),
      undefined,
      (party) => {
        const old = made.gateway.posts.get(made.postId);
        seen.push(`${party.gymId ?? 0} ${String(old?.archived)} ${made.said().length}`);
        return Promise.reject(new Error('the answer failed'));
      },
    );
    expect(outcome.kind).toBe('moved');
    // The raid was in its new place; the old post had the word that it moved and was still open.
    expect(seen).toEqual(['8 false 1']);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
    expect(
      made.entries.some((entry) => entry.msg === 'could not answer before closing a party'),
    ).toBe(true);

    // An answer that never comes does not keep the old post open.
    const again = await reportedRaid(yveltal, {
      setTimer: (run) => {
        setImmediate(run);
        return () => undefined;
      },
    });
    const hanging = await again.service.relocate(
      again.party.id,
      cafe(),
      east(again),
      undefined,
      () => new Promise(() => undefined),
    );
    expect(hanging.kind).toBe('moved');
    expect(again.gateway.posts.get(again.postId)?.archived).toBe(true);
  });

  it('notes the name of the member who moved it, when they are signed up', async () => {
    const made = await reportedRaid(yveltal);
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
    const party = await moved(made, { id: ALICE, name: 'Alice', team: 'valor' });
    expect(made.store.get(party.id)?.attendees[ALICE]).toMatchObject({
      name: 'Alice',
      team: 'valor',
    });
  });

  it('brings both summaries up to date', async () => {
    const made = await reportedRaid(yveltal);
    await made.service.checkSummaries();
    await settled(made);
    const summary = (regionId: number): string =>
      made.gateway.posts.get(made.regions.byId(regionId)?.summaryMessageId ?? '')?.message
        .content ?? '';
    expect(summary(1)).toContain(made.postId);
    const party = await moved(made);
    expect(summary(1)).not.toContain(made.postId);
    expect(summary(2)).toContain(party.forumPostId ?? 'none');
  });

  it('lets those into the other forum who cannot see it, and takes back what the old one called for', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    made.gateway.shutOut(EAST_FORUM, BOB, CAROL);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, carol, PartyStatus.Present);
    await made.attendance.done(made.party.id, carol);
    await settled(made);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);

    await moved(made);

    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.gateway.canSee(EAST_FORUM, BOB)).toBe(true);
    // Carol is done with the raid: nothing calls for her to see it.
    expect(made.gateway.canSee(EAST_FORUM, CAROL)).toBe(false);
    expect((await made.grants.list()).map((grant) => grant.memberId)).toEqual([BOB]);
  });
});

describe('PartyService.relocate: when it cannot be done', () => {
  it('leaves the raid where it is when the gym has such a raid already', async () => {
    const made = await reportedRaid(yveltal);
    const other = await made.service.reportRaid({
      gym: cafe(),
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T3', shadow: false },
      boss: null,
      regionChannelId: EAST_CHANNEL,
    });
    if (other.kind !== 'created') throw new Error(other.kind);
    await settled(made);
    const calls = made.gateway.calls.length;
    const writes = made.storage.writes.length;

    const outcome = await made.service.relocate(made.party.id, cafe(), east(made));

    expect(outcome).toMatchObject({ kind: 'taken', other: { id: other.party.id } });
    expect(made.gateway.calls).toHaveLength(calls);
    expect(made.storage.writes).toHaveLength(writes);
    expect(made.current().gymId).toBe(1);
  });

  it('answers gone for a raid that is not active, and no-forum for a region without one', async () => {
    const made = await reportedRaid(yveltal);
    const noForum = { ...east(made), forumChannelId: null };
    expect(await made.service.relocate(made.party.id, cafe(), noForum)).toEqual({
      kind: 'no-forum',
    });
    await made.service.end(made.party.id);
    expect(await made.service.relocate(made.party.id, cafe(), east(made))).toEqual({
      kind: 'gone',
    });
    expect(made.store.active()).toEqual([]);
  });

  it('leaves the raid as it was when the forum is gone, and the gym free', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.gone.add(EAST_FORUM);
    expect(await made.service.relocate(made.party.id, cafe(), east(made))).toEqual({
      kind: 'no-forum',
    });
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: false });
    expect(texts(made, WEST_CHANNEL)).toHaveLength(1);
    expect(made.store.raidAt(8, 'standard', made.clock.now)).toBeUndefined();
  });

  it('leaves the raid as it was when the post cannot be made', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    await expect(made.service.relocate(made.party.id, cafe(), east(made))).rejects.toThrow(
      'Discord is away',
    );
    made.gateway.failing.delete('createPost');
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(made.said()).toEqual([]);
    // And it can be moved after all.
    await moved(made);
    expect(made.gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });

  it('takes the new party back when the old one cannot be ended, and says that the raid stays', async () => {
    const made = await reportedRaid(yveltal);
    const save = made.storage.save.bind(made.storage);
    vi.spyOn(made.storage, 'save').mockImplementation((party) =>
      party.id === made.party.id && party.status === 'ended'
        ? Promise.reject(new Error('the database is away'))
        : save(party),
    );
    await expect(made.service.relocate(made.party.id, cafe(), east(made))).rejects.toThrow(
      'the database is away',
    );
    await settled(made);
    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
    // The post that was a moment old is deleted, not left archived in the other forum.
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: false });
    expect(made.said().map((text) => text.split('\n')[0]?.replace(/<#\d+>$/, '<#post>'))).toEqual([
      `This raid has moved to **Café Élan Fresco** in <#${EAST_CHANNEL}>: <#post>`,
      'The move did not work: this raid stays here.',
    ]);
  });

  it('reports the failure itself when nothing can be stored any more', async () => {
    const made = await reportedRaid(yveltal);
    const save = made.storage.save.bind(made.storage);
    let posted = false;
    // The database goes away once the new party has its post.
    vi.spyOn(made.storage, 'save').mockImplementation((party) => {
      if (posted) return Promise.reject(new Error('the database is away'));
      if (party.forumChannelId === EAST_FORUM && party.regionLinkMessageId !== null) posted = true;
      return save(party);
    });
    await expect(made.service.relocate(made.party.id, cafe(), east(made))).rejects.toThrow(
      'the database is away',
    );
    // Nothing of the new party is left on Discord, although it could not be ended in the table.
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([]);
    expect(made.store.get(made.party.id)).toBeDefined();
  });
});

describe('PartyService.relocate: what happens meanwhile', () => {
  /** Holds the creation of the new post until `release` is called. */
  function holdPost(made: Made): { release: () => void; reached: Promise<void> } {
    let release: () => void = () => undefined;
    let arrive: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const original = made.gateway.createPost.bind(made.gateway);
    vi.spyOn(made.gateway, 'createPost').mockImplementation(async (forumId, post) => {
      arrive();
      await held;
      return original(forumId, post);
    });
    return { release, reached };
  }

  it('keeps what members did in the old post while the new one was being made', async () => {
    const made = await reportedRaid(yveltal);
    const { release, reached } = holdPost(made);
    const moving = made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 3 });
    await made.raids.setEndTime(made.party.id, bob, at('2026-10-13T14:30'));
    release();
    const outcome = await moving;
    if (outcome.kind !== 'moved') throw new Error(outcome.kind);
    await settled(made);
    const party = made.store.get(outcome.party.id);
    expect(party?.attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming, number: 3 });
    expect(party?.endTime).toBe(at('2026-10-13T14:30'));
    expect(outcome.party.attendees[ALICE]).toBeDefined();
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(post?.message.embeds?.[0]?.fields?.map((field) => field.value).join('\n')).toContain(
      `<@${ALICE}>`,
    );
  });

  it('moves a raid once: a second move at the same time finds it gone', async () => {
    const made = await reportedRaid(yveltal);
    const gym9 = gymsFixture().get(9);
    if (!gym9) throw new Error('no gym 9');
    const [first, second] = await Promise.all([
      made.service.relocate(made.party.id, cafe(), east(made)),
      made.service.relocate(made.party.id, gym9, east(made)),
    ]);
    await settled(made);
    expect(first.kind).toBe('moved');
    expect(second).toEqual({ kind: 'gone' });
    expect(made.store.active()).toHaveLength(1);
    expect(made.gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });

  it('takes the new party back when the old one was closed meanwhile: it does not come back elsewhere', async () => {
    const made = await reportedRaid(yveltal);
    const { release, reached } = holdPost(made);
    const moving = made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    await made.service.end(made.party.id, undefined, { lastWords: 'Closed.' });
    release();
    const outcome = await moving;
    await settled(made);
    expect(outcome).toEqual({ kind: 'gone' });
    expect(made.store.active()).toEqual([]);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(texts(made, EAST_CHANNEL)).toEqual([]);
    // The old post was closed by whoever ended it, once, and nothing was said into it after.
    expect(made.said()).toEqual(['Closed.']);
    expect(made.gateway.posts.get(made.postId)?.reopened).toBe(0);
    expect(made.store.raidAt(8, 'standard', made.clock.now)).toBeUndefined();
  });

  it('says that the raid moved while those who are in the old forum only for it can still see it', async () => {
    const made = await reportedRaid(yveltal);
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await settled(made);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    const send = made.gateway.sendMessage.bind(made.gateway);
    const seen: boolean[] = [];
    vi.spyOn(made.gateway, 'sendMessage').mockImplementation((channelId, message) => {
      if (channelId === made.postId && message.mention?.users?.includes(ALICE)) {
        seen.push(made.gateway.canSee(WEST_FORUM, ALICE));
      }
      return send(channelId, message);
    });
    await moved(made);
    // Alice was pinged once, and could see the post she was pinged in.
    expect(seen).toEqual([true]);
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
  });

  it('closes the old post with the word in it also when the word could not be said first', async () => {
    const made = await reportedRaid(yveltal);
    const send = made.gateway.sendMessage.bind(made.gateway);
    let failed = false;
    vi.spyOn(made.gateway, 'sendMessage').mockImplementation((channelId, message) => {
      if (channelId === made.postId && !failed) {
        failed = true;
        return Promise.reject(new Error('Discord is away'));
      }
      return send(channelId, message);
    });
    const party = await moved(made);
    expect(made.store.get(party.id)).toBeDefined();
    // Said by the close instead, once, without pings.
    expect(made.said()).toHaveLength(1);
    expect(made.gateway.messagesIn(made.postId)[0]?.message.mention).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('makes a report of the new gym wait for the move and then join the raid', async () => {
    const made = await reportedRaid(yveltal);
    const { release, reached } = holdPost(made);
    const moving = made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    const reporting = made.service.reportRaid({
      gym: cafe(),
      reporterId: CAROL,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T5', shadow: false },
      boss: null,
      regionChannelId: EAST_CHANNEL,
    });
    release();
    const [outcome, report] = await Promise.all([moving, reporting]);
    await settled(made);
    if (outcome.kind !== 'moved') throw new Error(outcome.kind);
    expect(report).toMatchObject({ kind: 'exists', joined: true, party: { id: outcome.party.id } });
    expect(made.store.get(outcome.party.id)?.attendees[CAROL]).toBeDefined();
    expect(made.gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });
});

describe('PartyService.relocate: the clock and a restart', () => {
  it('gives a raid that was about to be archived a new warning in its new post', async () => {
    const made = await reportedRaid({ ...yveltal, time: { end: at('2026-10-13T14:10') } });
    const tick = async (time: number): Promise<void> => {
      made.clock.now = time;
      await made.scheduler.tick();
      await made.scheduler.whenIdle();
      await settled(made);
    };
    await tick(at('2026-10-13T14:10') + 6 * MINUTE);
    expect(made.current().deletionTime).not.toBeNull();
    expect(made.said().some((text) => /I will archive this post/.test(text))).toBe(true);

    const party = await moved(made);
    expect(made.store.get(party.id)?.deletionTime).toBeNull();
    // The old post keeps only its last words.
    expect(made.said()).toHaveLength(1);

    await tick(made.clock.now + MINUTE);
    const stored = made.store.get(party.id);
    expect(stored?.deletionTime).not.toBeNull();
    expect(
      texts(made, party.forumPostId ?? '').some((text) => /I will archive this post/.test(text)),
    ).toBe(true);
  });

  it('after a stop between storing the new party and making its post, the raid is where it was', async () => {
    const made = await reportedRaid(yveltal);
    // The process stops while the post is being made: it never comes back.
    const reached = new Promise<void>((arrive) => {
      vi.spyOn(made.gateway, 'createPost').mockImplementation(() => {
        arrive();
        return new Promise(() => undefined);
      });
    });
    void made.service.relocate(made.party.id, cafe(), east(made));
    await reached;
    expect([...made.storage.rows.values()].filter((row) => row.status === 'active')).toHaveLength(
      2,
    );

    const again = await restarted(made);
    expect(await again.service.endPartiesWithoutPost()).toBe(1);
    expect(again.store.active().map((party) => party.id)).toEqual([made.party.id]);
    expect(again.store.get(made.party.id)?.gymId).toBe(1);
  });
});
```

Run: `npx vitest run --project unit src/domain/party/relocate.test.ts src/services/party-service.relocate.test.ts`
Expected: FAIL (`relocate.ts` and `PartyService.relocate` do not exist).

- [ ] **Step 3: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -107,6 +107,7 @@ export async function startApp(
     log,
   });
   const guilds = new GuildRepository(db);
+  const users = new UserRepository(db);
   const partyService = new PartyService({
     store: parties,
     gateway: partyGateway,
@@ -117,10 +118,10 @@ export async function startApp(
     raidBosses,
     gameData,
     raidEvents,
+    users,
     settings: config.settings,
     log,
   });
-  const users = new UserRepository(db);
   const lines = new PartyLines({
     gateway: partyGateway,
     active: (postId) => parties.byPost(postId) !== undefined,
```

Create `src/domain/party/relocate.ts`:

```ts
import { releaseAsked } from './attendance.js';
import { attendeeOf, membersWhere, NO_PROMPTS, type Attendee, type RaidParty } from './party.js';
import { PartyStatus } from './status.js';

/** Where a raid moves to: the new party's id, and its server, region and gym. */
export interface NewPlace {
  /** A fresh UUID. */
  id: string;
  guildId: number;
  regionId: number;
  gymId: number;
}

/**
 * A raid as the new party it becomes when it moves to a gym of another region (spec 5.2): the
 * same raid with the same members, groups, times and boss, under a new id and in the new place.
 * Its post is in another forum, so it starts without anything on Discord: no post, no link
 * line, no copies, no questions and no archive warning (those were messages of the old post).
 * Members who were asked whether they have completed the raid are present again, as the
 * question went with the old post; a scheduled archiving is called off, and the clock schedules
 * it anew, with a warning in the new post. `createdAt` stays: a raid without times is judged by
 * when it was reported.
 */
export function relocatedRaid(source: RaidParty, place: NewPlace): RaidParty {
  const asked = membersWhere(source, (attendee) => attendee.status === PartyStatus.CompletePending);
  return {
    ...releaseAsked(source, asked).party,
    id: place.id,
    guildId: place.guildId,
    regionId: place.regionId,
    gymId: place.gymId,
    status: 'active',
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    prompts: NO_PROMPTS,
    deletionTime: null,
  };
}

function sameRecord(a: Attendee | undefined, b: Attendee | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Attendee>;
  return [...keys].every((key) => a[key] === b[key]);
}

/**
 * `target`, the party a raid moved into, with everything the raid was when the old party ended
 * (`source`): the move takes a moment, and what members did in the old post meanwhile must not
 * be lost. The place and what `target` has on Discord by now stay its own.
 *
 * `start` is the new party as it was made. A member whose record in `target` differs from the
 * one in `start` acted on the new party during that moment (somebody who reported the same raid
 * at the new gym is signed up there), and keeps that record; such a member's group is the newest
 * one when the raid has none of that letter. A member who left the new party stays out. Anything
 * else done to the new party in that moment (a time, the boss, a group, a meeting time) is
 * replaced by what the old one had.
 */
export function carriedOver(target: RaidParty, source: RaidParty, start: RaidParty): RaidParty {
  const carried = relocatedRaid(source, {
    id: target.id,
    guildId: target.guildId,
    regionId: target.regionId ?? source.regionId ?? 0,
    gymId: target.gymId ?? source.gymId ?? 0,
  });
  const attendees: Record<string, Attendee> = { ...carried.attendees };
  for (const memberId of Object.keys(start.attendees)) {
    // In the new party from the start and no longer: they left it there.
    if (!attendeeOf(target, memberId)) delete attendees[memberId];
  }
  for (const [memberId, attendee] of Object.entries(target.attendees)) {
    if (sameRecord(attendee, attendeeOf(start, memberId))) continue;
    const known = carried.groups.some((group) => group.id === attendee.group);
    attendees[memberId] = known ? attendee : { ...attendee, group: carried.defaultGroupId };
  }
  return {
    ...carried,
    attendees,
    regionId: target.regionId,
    gymId: target.gymId,
    forumChannelId: target.forumChannelId,
    forumPostId: target.forumPostId,
    regionLinkMessageId: target.regionLinkMessageId,
    mirrorMessages: target.mirrorMessages,
    prompts: target.prompts,
    updatedAt: target.updatedAt,
  };
}
```

Apply to `src/render/text.ts`:

```diff
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -12,8 +12,30 @@ export const LIMITS = {
   /** Title, description and all field names and values of one embed together. */
   embedTotal: 6000,
   content: 2000,
+  /** Members one message may ping. */
+  pings: 100,
 } as const;
 
+/**
+ * A message of this text that pings these members: their mentions follow the text on a line of
+ * their own, as many as fit into one message and as one message may ping. The text itself
+ * always goes.
+ */
+export function withMentions(
+  text: string,
+  members: readonly string[],
+): { content: string; mention: { users: string[] } } {
+  let content = text;
+  const users: string[] = [];
+  for (const id of members.slice(0, LIMITS.pings)) {
+    const mention = `${users.length === 0 ? '\n' : ' '}<@${id}>`;
+    if (content.length + mention.length > LIMITS.content) break;
+    content += mention;
+    users.push(id);
+  }
+  return { content, mention: { users } };
+}
+
 /**
  * Text that members or a feed wrote, made safe to show: Markdown is escaped, and a mention or
  * channel link typed as text stays text (`@everyone` would not ping, since the client sends no
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -39,7 +39,7 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { Logger } from '../log.js';
 import { standingLine } from '../render/activity.js';
 import { completionQuestion, groupWords } from '../render/party-controls.js';
-import { LIMITS, plain, timestamp } from '../render/text.js';
+import { LIMITS, plain, timestamp, withMentions } from '../render/text.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -48,9 +48,6 @@ export interface Member extends MemberInfo {
   id: string;
 }
 
-/** Discord lets one message name this many users to ping. */
-const MAX_PINGS = 100;
-
 /** Said in the post when a question is taken back; the question itself is deleted. */
 export const WITHDRAWN_LINE = 'So the others who were asked whether they are done are here again.';
 
@@ -86,25 +83,6 @@ export interface AttendanceServiceOptions {
   now?: () => number;
 }
 
-/**
- * A message of this text that pings these members: their mentions follow the text on a line of
- * their own, as many as fit into one message. The text itself always goes.
- */
-function withMentions(
-  text: string,
-  members: readonly string[],
-): { content: string; mention: { users: string[] } } {
-  let content = text;
-  const users: string[] = [];
-  for (const id of members) {
-    const mention = `${users.length === 0 ? '\n' : ' '}<@${id}>`;
-    if (content.length + mention.length > LIMITS.content) break;
-    content += mention;
-    users.push(id);
-  }
-  return { content, mention: { users } };
-}
-
 function stillAsked(party: Party, members: readonly string[]): boolean {
   return members.some((id) => attendeeOf(party, id)?.status === PartyStatus.CompletePending);
 }
@@ -436,7 +414,7 @@ export class AttendanceService {
         const found = settings[index];
         return found !== undefined && found.mentions && allows(found);
       })
-      .slice(0, MAX_PINGS);
+      .slice(0, LIMITS.pings);
   }
 
   /** Deletes messages of a post, each by itself; gives the ids that are gone now. */
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -1,6 +1,7 @@
 import type { Settings } from '../config/settings.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
+import type { UserSettings } from '../db/repositories/user-repository.js';
 import {
   isMissingPermission,
   isRefusedBody,
@@ -10,7 +11,7 @@ import {
   type TagIds,
 } from '../discord/party-gateway.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
-import type { RaidBossRef, RaidParty } from '../domain/party/party.js';
+import { membersWhere, type RaidBossRef, type RaidParty } from '../domain/party/party.js';
 import {
   certainMoves,
   createRaid,
@@ -18,7 +19,8 @@ import {
   setHatchTime,
   setSaved,
 } from '../domain/party/raid.js';
-import type { PartyStatus } from '../domain/party/status.js';
+import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
+import { PartyStatus } from '../domain/party/status.js';
 import { endParty } from '../domain/party/tick.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
@@ -34,9 +36,10 @@ import {
   type RenderedPost,
 } from '../render/raid-post.js';
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
-import { plain } from '../render/text.js';
+import { plain, withMentions } from '../render/text.js';
 import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
+import { KeyedLock } from './keyed-lock.js';
 import { PartyMirrors } from './party-mirrors.js';
 import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
@@ -87,6 +90,17 @@ export type ReportOutcome =
   /** The gym's region has no forum yet (`/admin setup-forums`). */
   | { kind: 'no-forum'; region: Region };
 
+/** What came of moving a raid to a gym of another region. */
+export type RelocateOutcome =
+  /** There is no such active raid. */
+  | { kind: 'gone' }
+  /** The gym already has such a raid, `other`. */
+  | { kind: 'taken'; other: RaidParty }
+  /** The region has no forum (any more): the raid stays where it is. */
+  | { kind: 'no-forum' }
+  /** `party` is the raid in its new place, `from` the party it was, which has ended. */
+  | { kind: 'moved'; party: RaidParty; from: RaidParty };
+
 /** What the party service needs of the region table. */
 export interface SummaryStore {
   setForum(id: number, forumChannelId: string | null): Promise<'set' | 'no-region' | 'forum-taken'>;
@@ -120,6 +134,8 @@ export interface PartyServiceOptions {
   raidBosses: RaidBossProvider;
   gameData: GameDataProvider;
   raidEvents: RaidEventProvider;
+  /** The members' settings: who lets the bot ping them. Without it nobody is pinged. */
+  users?: { get(snowflake: string): Promise<UserSettings> };
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -153,6 +169,8 @@ export class PartyService {
   private readonly summaryTimers = new Map<number, { cancel: () => void; due: number }>();
   /** Raids whose post is being created: a second report of the gym waits for the outcome. */
   private readonly creating = new Map<string, Promise<void>>();
+  /** A raid moves to another region once at a time. */
+  private readonly moves = new KeyedLock<string>();
   /** The latest `ensureSummary` of each region: calls for one region run one after the other. */
   private readonly summaryChains = new Map<number, Promise<unknown>>();
   /** The latest `setupForums` of each server, and how many are running or waiting. */
@@ -405,6 +423,15 @@ export class PartyService {
     }
 
     // The row exists; from here on a failure must not leave an active raid without a post.
+    return this.createTracked(raid, region, rendered);
+  }
+
+  /** `createPostFor`, remembered while it runs: a report of the same gym waits for it. */
+  private async createTracked(
+    raid: RaidParty,
+    region: Region,
+    rendered: RenderedPost,
+  ): Promise<ReportOutcome> {
     const creation = this.createPostFor(raid, region, rendered);
     this.creating.set(
       raid.id,
@@ -420,6 +447,172 @@ export class PartyService {
     }
   }
 
+  /**
+   * Moves a raid to a gym of another region (spec 5.2). Its post cannot move to another forum,
+   * so the raid becomes a new party with a post of its own there, and the old party ends: its
+   * post says where the raid went, pinging those who are signed up and allow it, and is archived
+   * like any ended party's, its link line and copies deleted. The new party is the raid as it was
+   * at the moment the old one ended, so what members did while the new post was being made is
+   * kept; `by` is the member who moved it.
+   *
+   * The new party is stored first and gets its post before the old one ends: when the gym has
+   * such a raid already (`taken`), the region has no forum (`no-forum`) or the post cannot be
+   * made (it throws), the raid stays as and where it was. The word that it moved is said in the
+   * old post while that party is still active: whoever is in that forum only for this raid
+   * loses sight of it the moment the party ends, and would not get the ping. When the old party
+   * has ended by itself meanwhile (the clock, `/delete`), the new one is taken back (`gone`): a
+   * raid that somebody closed does not come back elsewhere. One raid moves once at a time; a
+   * second move finds it `gone`.
+   *
+   * A stop of the process after the new post exists and before the old party has ended leaves
+   * the raid twice (both run out by the clock); `flush` waits for a move that is under way.
+   *
+   * `moved` is called with the raid in its new place before anything is done to the old post:
+   * an answer to an interaction in that post must be given there, not after the archiving. Like
+   * `closing.left` of `end` it is waited for three seconds at most, and what it throws is
+   * logged.
+   */
+  relocate(
+    partyId: string,
+    gym: Gym,
+    region: Region,
+    by?: { id: string } & MemberInfo,
+    moved?: (party: RaidParty) => Promise<unknown>,
+  ): Promise<RelocateOutcome> {
+    return this.moves.run(partyId, () => this.relocateNow(partyId, gym, region, by, moved));
+  }
+
+  private async relocateNow(
+    partyId: string,
+    gym: Gym,
+    region: Region,
+    by?: { id: string } & MemberInfo,
+    moved?: (party: RaidParty) => Promise<unknown>,
+  ): Promise<RelocateOutcome> {
+    const { store, gateway, log } = this.options;
+    const old = store.get(partyId);
+    if (!old) return { kind: 'gone' };
+    const forumId = region.forumChannelId;
+    if (forumId === null || region.guildId === null) return { kind: 'no-forum' };
+    const raid = relocatedRaid(old, {
+      id: crypto.randomUUID(),
+      guildId: region.guildId,
+      regionId: region.id,
+      gymId: gym.id,
+    });
+    const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
+    const stored = await store.addRaidUnlessTaken(raid, this.now());
+    if (!stored.added) return { kind: 'taken', other: stored.existing };
+    // A failure in here ends the new party again and leaves the old one alone.
+    const created = await this.createTracked(raid, region, rendered);
+    if (created.kind !== 'created') return { kind: 'no-forum' };
+    const postId = created.party.forumPostId;
+
+    // The word goes into the old post now, while everybody who is in the raid can still see it.
+    const before = store.get(partyId);
+    const oldPost = before?.forumPostId ?? null;
+    if (!before || oldPost === null) {
+      await this.takeBack(raid.id);
+      return { kind: 'gone' };
+    }
+    const words =
+      `This raid has moved to **${plain(gym.nickname || gym.name)}** in ` +
+      `<#${region.channelId}>${postId === null ? '.' : `: <#${postId}>`}`;
+    let said = false;
+    try {
+      const others = membersWhere(
+        before,
+        (attendee, id) => id !== by?.id && attendee.status !== PartyStatus.Complete,
+      );
+      const message = withMentions(words, await this.pingable(others));
+      // A message into the post of a party that has ended would open an archived post again.
+      if (store.get(partyId)) said = (await gateway.sendMessage(oldPost, message)) !== undefined;
+    } catch (err) {
+      log.warn({ err, party: partyId }, 'could not say in its post that a raid moves');
+    }
+
+    // The old party ends inside the store: what it is at that moment is what moves.
+    const seen: { last?: RaidParty } = {};
+    let ended;
+    try {
+      ended = await store.update(partyId, (party) => {
+        seen.last = party;
+        return { party: endParty(party) };
+      });
+    } catch (err) {
+      // Both would stay active, one raid in two places: the new one goes again.
+      await this.takeBack(raid.id);
+      if (said) await this.sayItStays(partyId, oldPost);
+      throw err;
+    }
+    const source = seen.last;
+    if (!ended?.written || !source) {
+      // It ended by itself in this very moment: what somebody closed does not come back.
+      await this.takeBack(raid.id);
+      return { kind: 'gone' };
+    }
+    let party = created.party;
+    try {
+      const carried = await store.update(raid.id, (current) => {
+        const now = carriedOver(current, source, raid);
+        return { party: by ? noteMember(now, by.id, by) : now };
+      });
+      party = carried?.party ?? party;
+    } catch (err) {
+      log.warn({ err, party: raid.id }, 'could not carry over what changed while a raid moved');
+    }
+    this.ended(ended.party);
+    if (moved) {
+      const there = party;
+      await this.answerBeforeClosing(raid.id, () => moved(there));
+    }
+    await this.closePost(ended.party, words, said);
+    this.changed(raid.id);
+    return { kind: 'moved', party, from: ended.party };
+  }
+
+  /**
+   * Undoes the new party of a move that did not happen after all: it ends, and its link line,
+   * its copies and its post, which is a moment old, are deleted. Never rejects. A party that
+   * cannot be ended stays active without its post; the next render ends it for that.
+   */
+  private async takeBack(partyId: string): Promise<void> {
+    const { store, gateway, log } = this.options;
+    const ended = await this.abandon(partyId, 'could not end the new party of a move that failed');
+    const party = ended ?? store.get(partyId);
+    if (!party) return;
+    if (ended) this.ended(ended);
+    try {
+      await this.deleteLinkLine(party);
+      await this.posts.idle(partyId);
+      await this.mirrors.idle(partyId);
+      await this.mirrors.remove(party);
+      if (party.forumPostId !== null) await gateway.deletePost(party.forumPostId);
+    } catch (err) {
+      log.warn({ err, party: partyId }, 'could not tidy up after a move that failed');
+    }
+  }
+
+  /** Corrects the word that a raid moved, in the post of the party that stays after all. */
+  private async sayItStays(partyId: string, postId: string): Promise<void> {
+    try {
+      if (!this.options.store.get(partyId)) return;
+      await this.options.gateway.sendMessage(postId, {
+        content: 'The move did not work: this raid stays here.',
+      });
+    } catch (err) {
+      this.options.log.warn({ err, party: partyId }, 'could not say that a raid stays');
+    }
+  }
+
+  /** Those of these members who let the bot ping them. Nobody without the members' settings. */
+  private async pingable(ids: readonly string[]): Promise<string[]> {
+    const { users } = this.options;
+    if (!users) return [];
+    const settings = await Promise.all(ids.map((id) => users.get(id).catch(() => undefined)));
+    return ids.filter((_id, index) => settings[index]?.mentions === true);
+  }
+
   /** Makes the post of a stored raid and records it; undoes the raid when that cannot be done. */
   private async createPostFor(
     raid: RaidParty,
@@ -751,8 +944,12 @@ export class PartyService {
     }
   }
 
-  /** What `end` does on Discord for a party that has left the store. Never rejects. */
-  private async closePost(party: RaidParty, lastWords?: string): Promise<void> {
+  /**
+   * What `end` does on Discord for a party that has left the store. `lastWords` are said in the
+   * post, unless they were `said` there already, and stand in the post's own message in the
+   * place of the times. Never rejects.
+   */
+  private async closePost(party: RaidParty, lastWords?: string, said = false): Promise<void> {
     const { gateway, log } = this.options;
     const postId = party.forumPostId;
     const attempt = async (what: string, work: () => Promise<unknown>): Promise<void> => {
@@ -779,7 +976,7 @@ export class PartyService {
         gateway.deleteMessage(postId, messageId),
       );
     }
-    if (lastWords !== undefined) {
+    if (lastWords !== undefined && !said) {
       await attempt('say why a party ended', () =>
         gateway.sendMessage(postId, { content: lastWords }),
       );
@@ -863,6 +1060,8 @@ export class PartyService {
    * calls `changed` (the scheduler) before it.
    */
   async flush(): Promise<void> {
+    // A raid on its way to another region arrives first.
+    await this.moves.whenIdle();
     do {
       await this.posts.flush();
       await this.summaries.flush();
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/domain/party/relocate.test.ts src/services/party-service.relocate.test.ts`
Expected: PASS (`src/domain/party/relocate.ts`, `src/render/text.ts`, `src/services/party-service.ts`, `src/services/attendance-service.ts`, `src/app.ts` and the test support).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app.ts src/domain/party/relocate.test.ts src/domain/party/relocate.ts src/render/text.ts src/services/attendance-service.ts src/services/party-service.relocate.test.ts src/services/party-service.ts test/support/party-service.ts
npm run check
git add src/app.ts src/domain/party/relocate.test.ts src/domain/party/relocate.ts src/render/text.ts src/services/attendance-service.ts src/services/party-service.relocate.test.ts src/services/party-service.ts test/support/party-service.ts
git commit -m "A raid moves to another region as a new party with a post there; the old post says where it went" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,955 unit tests.

---

### Task 6: Changing a raid's gym to one of another region moves the raid there

**Files:**
- Modify: `src/commands/raids/boss.test.ts`, `src/domain/party/party.ts`, `src/render/activity.ts`, `src/services/raid-change-service.test.ts`, `src/services/raid-change-service.ts`

**Interfaces:**
- Consumes: Task 5 (`PartyService.relocate`, `RelocateOutcome`); `RaidChangeService.setGym` and `apply`, `RegionProvider.byChannel`, `problemText`.
- Produces: `GymMove` (`local`, `region` with the region, `nowhere`) and `RaidChangeService.gymMove(party, gym)`; `setGym(partyId, member, gymId, moved?)`: a gym of another region of the same server goes through `relocate`, with a line in the new post that says who moved the raid from where; `RaidChangeOutcome` `ok` gets `from` (the party it was) for such a move. `other-region` now means: the gym lies in no region of the raid's server that has a forum.

Only regions of the raid's own server count, also when the raid's own region is gone; the gym the raid is at is always `local` (and answers "unchanged", never "taken" by itself). `RaidChangeServiceOptions.posts` gains `relocate` and `regions` gains `byChannel`; the party service and the region directory already have them.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/raids/boss.test.ts`:

```diff
--- a/src/commands/raids/boss.test.ts
+++ b/src/commands/raids/boss.test.ts
@@ -173,10 +173,10 @@ describe('/location', () => {
     );
   });
 
-  it('refuses a gym of another region, and a gym that has such a raid, with its post', async () => {
+  it('refuses a gym that lies in no region, and a gym that has such a raid, with its post', async () => {
     const made = await setup();
-    expect(await made.answer('location', { gym: 'g:8' })).toMatch(
-      /^That gym is in another region, and a raid cannot move between regions yet\./,
+    expect(await made.answer('location', { gym: 'g:10' })).toMatch(
+      /^That gym is not in a region of this server that has a raid forum/,
     );
     const gym = gymsFixture().get(2);
     if (!gym) throw new Error('no gym');
```

Apply to `src/services/raid-change-service.test.ts`:

```diff
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
+import { EAST_FORUM, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
@@ -356,17 +357,127 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     });
   });
 
-  it('refuses a gym of another region, and one that lies in none', async () => {
+  it('refuses a gym that lies in no region, or in none of this server with a forum', async () => {
     const made = await reportedRaid();
-    for (const gymId of [8, 10]) {
-      expect(await made.raids.setGym(made.party.id, alice, gymId)).toEqual({
-        kind: 'refused',
-        reason: 'other-region',
-      });
-    }
+    const east = made.regions.byId(2);
+    if (!east) throw new Error('no region East');
+    expect(await made.raids.setGym(made.party.id, alice, 10)).toEqual({
+      kind: 'refused',
+      reason: 'other-region',
+    });
+    east.guildId = 2;
+    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({
+      kind: 'refused',
+      reason: 'other-region',
+    });
+    east.guildId = 1;
+    east.forumChannelId = null;
+    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({
+      kind: 'refused',
+      reason: 'other-region',
+    });
+    expect(made.current().gymId).toBe(1);
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('moves the raid to a gym of another region: a new party, and a line in its new post', async () => {
+    const made = await reportedRaid();
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    const outcome = await made.raids.setGym(made.party.id, { ...alice, team: 'valor' }, 8);
+    if (outcome.kind !== 'ok') throw new Error(outcome.kind);
+    await made.attendance.flush();
+    await made.service.flush();
+    expect(outcome).toMatchObject({ changed: true, from: { id: made.party.id, status: 'ended' } });
+    expect(outcome.party).toMatchObject({ gymId: 8, regionId: 2, forumChannelId: EAST_FORUM });
+    expect(outcome.party.id).not.toBe(made.party.id);
+    expect(outcome.party.attendees[ALICE]).toMatchObject({ name: 'Alice', team: 'valor' });
+    expect(made.store.active().map((party) => party.id)).toEqual([outcome.party.id]);
+    const newPost = outcome.party.forumPostId ?? '';
+    expect(made.gateway.messagesIn(newPost).map((message) => message.message.content)).toEqual([
+      `<@${ALICE}> moved this raid here from **The Stacks** in <#${WEST_CHANNEL}>.`,
+    ]);
+    // The old post has its last words, and nothing of the line.
+    expect(made.said().join('\n')).not.toContain('moved this raid here');
+    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
+  });
+
+  it('says where a move would take the raid: its own region, another one of the server, or nowhere', async () => {
+    const made = await reportedRaid();
+    const gym = (id: number) => {
+      const found = gymsFixture().get(id);
+      if (!found) throw new Error(`no gym ${String(id)}`);
+      return found;
+    };
+    const party = made.current();
+    expect(made.raids.gymMove(party, gym(1))).toEqual({ kind: 'local' });
+    expect(made.raids.gymMove(party, gym(2))).toEqual({ kind: 'local' });
+    expect(made.raids.gymMove(party, gym(8))).toMatchObject({ kind: 'region', region: { id: 2 } });
+    expect(made.raids.gymMove(party, gym(10))).toEqual({ kind: 'nowhere' });
+    const east = made.regions.byId(2);
+    if (!east) throw new Error('no region East');
+    east.forumChannelId = null;
+    expect(made.raids.gymMove(party, gym(8))).toEqual({ kind: 'nowhere' });
+  });
+
+  it('copes with a raid whose own region is gone: its gym is still its gym, other servers do not count', async () => {
+    const made = await reportedRaid();
+    const west = made.regions.rows.findIndex((region) => region.id === 1);
+    made.regions.rows.splice(west, 1);
+    // The gym the raid is at: nothing to do, and not "taken" by the raid itself.
+    expect(await made.raids.setGym(made.party.id, alice, 1)).toMatchObject({
+      kind: 'ok',
+      changed: false,
+    });
+    expect(made.store.active()).toHaveLength(1);
+    // A region of another server that has the gym does not take the raid.
+    const east = made.regions.byId(2);
+    if (!east) throw new Error('no region East');
+    east.guildId = 2;
+    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({
+      kind: 'refused',
+      reason: 'other-region',
+    });
+    east.guildId = 1;
+    expect(await made.raids.setGym(made.party.id, alice, 8)).toMatchObject({
+      kind: 'ok',
+      changed: true,
+      party: { regionId: 2 },
+    });
+  });
+
+  it('hands the answer for a move to another region on, and calls it for no other change', async () => {
+    const made = await reportedRaid();
+    const answered: number[] = [];
+    const answer = (party: { gymId: number | null }): Promise<void> => {
+      answered.push(party.gymId ?? 0);
+      return Promise.resolve();
+    };
+    await made.raids.setGym(made.party.id, alice, 2, answer);
+    await made.raids.setGym(made.party.id, alice, 10, answer);
+    expect(answered).toEqual([]);
+    await made.raids.setGym(made.party.id, alice, 8, answer);
+    expect(answered).toEqual([8]);
+  });
+
+  it('refuses the move to another region when that gym has such a raid, naming it', async () => {
+    const made = await reportedRaid();
+    const other = await secondRaid(made, 8);
+    const outcome = await made.raids.setGym(made.party.id, alice, 8);
+    expect(outcome).toMatchObject({
+      kind: 'refused',
+      reason: 'gym-taken',
+      other: { id: other.id },
+    });
     expect(made.current().gymId).toBe(1);
   });
 
+  it('answers gone for a move of a raid that has ended', async () => {
+    const made = await reportedRaid();
+    await made.service.end(made.party.id);
+    expect(await made.raids.setGym(made.party.id, alice, 8)).toEqual({ kind: 'gone' });
+    expect(await made.raids.setGym(made.party.id, alice, 2)).toEqual({ kind: 'gone' });
+  });
+
   it('refuses a gym that has such a raid already, naming it', async () => {
     const made = await reportedRaid();
     const other = await secondRaid(made, 2);
```

Run: `npx vitest run --project unit src/commands/raids/boss.test.ts src/services/raid-change-service.test.ts`
Expected: FAIL (`gymMove` does not exist; a gym of another region is still refused).

- [ ] **Step 2: The implementation**

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -209,7 +209,7 @@ export type PartyProblem =
   | 'already-done'
   /** Another raid of this kind already holds the gym. */
   | 'gym-taken'
-  /** The gym lies in another region than the raid. */
+  /** The gym lies in no region of the raid's server that has a forum for its post. */
   | 'other-region'
   /** The boss of the raid does not have that move. */
   | 'not-a-move';
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -89,8 +89,8 @@ export function problemText(reason: PartyProblem, limits: { maxNumber: number })
       return 'The boss of this raid does not have that move.';
     case 'other-region':
       return (
-        'That gym is in another region, and a raid cannot move between regions yet. ' +
-        'Report the raid there with `/raid` and let this one run out.'
+        'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
+        'move there.'
       );
   }
 }
```

Apply to `src/services/raid-change-service.ts`:

```diff
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -1,5 +1,6 @@
 import type { Settings } from '../config/settings.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
+import type { Region } from '../db/repositories/region-repository.js';
 import { noteMember, releaseAsked } from '../domain/party/attendance.js';
 import {
   refused,
@@ -31,6 +32,7 @@ import { plain, timestamp } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import type { GameDataProvider } from './game-data-service.js';
 import type { PartyLines } from './party-lines.js';
+import type { RelocateOutcome } from './party-service.js';
 import type { PartyStore } from './party-store.js';
 import type { RegionProvider } from './region-directory.js';
 
@@ -39,28 +41,51 @@ const HOUR = 3_600_000;
 /**
  * What came of a change to a raid. `gone`: there is no such active raid. `refused`: the raid
  * stays as it was; for `gym-taken`, `other` is the raid that holds the gym. `ok`: the raid as it
- * is stored now; `changed` is false when it already was so.
+ * is stored now; `changed` is false when it already was so. `from` is set when the raid moved to
+ * another region: the party it was, which has ended; `party` is then a new party with a post of
+ * its own.
  */
 export type RaidChangeOutcome =
   | { kind: 'gone' }
   | { kind: 'refused'; reason: PartyProblem; other?: RaidParty }
-  | { kind: 'ok'; party: RaidParty; changed: boolean };
+  | { kind: 'ok'; party: RaidParty; changed: boolean; from?: RaidParty };
 
 export interface RaidChangeServiceOptions {
   store: PartyStore;
-  /** Told after every stored change; also knows the durations in effect. */
-  posts: { changed(partyId: string): void; rules(): RaidDurationRules };
+  /**
+   * Told after every stored change; also knows the durations in effect and how a raid moves to
+   * another region.
+   */
+  posts: {
+    changed(partyId: string): void;
+    rules(): RaidDurationRules;
+    relocate(
+      partyId: string,
+      gym: Gym,
+      region: Region,
+      by?: Member,
+      moved?: (party: RaidParty) => Promise<unknown>,
+    ): Promise<RelocateOutcome>;
+  };
   lines: Pick<PartyLines, 'say'>;
   /** Takes away the completion questions nobody has to answer any more. */
   questions?: { removeQuestions(partyId: string): Promise<void> };
   gyms: { get(id: number): Gym | undefined; regionsOf(gymId: number): string[] };
-  regions: Pick<RegionProvider, 'byId'>;
+  regions: Pick<RegionProvider, 'byId' | 'byChannel'>;
   gameData: GameDataProvider;
   settings: Settings;
   log: Logger;
   now?: () => number;
 }
 
+/**
+ * Where a move to a gym takes a raid. `local`: the gym lies in the raid's own region (or is the
+ * gym the raid is at), and the raid stays the party it is. `region`: it lies in that other
+ * region of the same server, whose forum gets the raid. `nowhere`: it lies in no region of the
+ * raid's server that has a forum, and the raid cannot move there.
+ */
+export type GymMove = { kind: 'local' } | { kind: 'region'; region: Region } | { kind: 'nowhere' };
+
 /** The party as it was when setting a time or a length changed none of its times. */
 function unlessSame(before: RaidParty, after: RaidParty): RaidParty {
   return before.hatchTime === after.hatchTime &&
@@ -234,22 +259,86 @@ export class RaidChangeService {
   }
 
   /**
-   * Moves the raid to another gym of its region. A gym of another region is refused
-   * (`other-region`): its post would have to move to another forum.
+   * Moves the raid to another gym. To a gym of its own region it stays the party it is. A gym
+   * of another region of the same server makes it a new party with a post in that region's forum
+   * (`PartyService.relocate`; `from` in the outcome), and the new post says who moved it from
+   * where. A gym that lies in no region of this server that has a forum is refused
+   * (`other-region`).
+   *
+   * `moved` is for the answer to an interaction in the raid's post when the raid moves to
+   * another region: it is called with the raid in its new place before the old post is closed
+   * (see `PartyService.relocate`), and not at all otherwise.
    */
-  setGym(partyId: string, member: Member, gymId: number): Promise<RaidChangeOutcome> {
-    const { gyms, regions } = this.options;
+  async setGym(
+    partyId: string,
+    member: Member,
+    gymId: number,
+    moved?: (party: RaidParty) => Promise<unknown>,
+  ): Promise<RaidChangeOutcome> {
+    const { gyms, regions, store, posts, lines } = this.options;
     const gym = gyms.get(gymId);
     if (!gym) throw new Error(`There is no gym ${gymId}`);
+    const before = store.get(partyId);
+    if (!before) return { kind: 'gone' };
+    const move = this.gymMove(before, gym);
+    if (move.kind === 'local') return this.setGymInRegion(partyId, member, gym);
+    if (move.kind === 'nowhere') return { kind: 'refused', reason: 'other-region' };
+    const outcome = await posts.relocate(partyId, gym, move.region, member, moved);
+    switch (outcome.kind) {
+      case 'gone':
+        return { kind: 'gone' };
+      case 'taken':
+        return { kind: 'refused', reason: 'gym-taken', other: outcome.other };
+      case 'no-forum':
+        return { kind: 'refused', reason: 'other-region' };
+      case 'moved': {
+        const { party, from } = outcome;
+        const old = from.gymId === null ? undefined : gyms.get(from.gymId);
+        const oldRegion = from.regionId === null ? undefined : regions.byId(from.regionId);
+        if (party.forumPostId !== null) {
+          lines.say(
+            party.forumPostId,
+            `<@${member.id}> moved this raid here` +
+              (old ? ` from **${plain(old.nickname || old.name)}**` : '') +
+              (oldRegion ? ` in <#${oldRegion.channelId}>` : '') +
+              '.',
+          );
+        }
+        return { kind: 'ok', party, changed: true, from };
+      }
+    }
+  }
+
+  /**
+   * Where a move to this gym would take the raid (see `GymMove`): what `setGym` goes by, and
+   * what a command asks to know whether to ask first. Only regions of the raid's own server
+   * count, also when the raid's own region is gone.
+   */
+  gymMove(party: RaidParty, gym: Gym): GymMove {
+    const { gyms, regions } = this.options;
+    if (party.gymId === gym.id) return { kind: 'local' };
+    const lying = gyms
+      .regionsOf(gym.id)
+      .map((channelId) => regions.byChannel(channelId))
+      .filter((region): region is Region => region?.guildId === party.guildId);
+    if (lying.some((region) => region.id === party.regionId)) return { kind: 'local' };
+    const region = lying.find((candidate) => candidate.forumChannelId !== null);
+    return region ? { kind: 'region', region } : { kind: 'nowhere' };
+  }
+
+  /** The move to a gym of the raid's own region. */
+  private setGymInRegion(partyId: string, member: Member, gym: Gym): Promise<RaidChangeOutcome> {
+    const { gyms, regions } = this.options;
+    const gymId = gym.id;
     return this.apply(
       partyId,
       member,
       (party) => {
+        if (party.gymId === gymId) return { ok: true, party };
         const region = party.regionId === null ? undefined : regions.byId(party.regionId);
         if (!region || !gyms.regionsOf(gymId).includes(region.channelId)) {
           return refused('other-region');
         }
-        if (party.gymId === gymId) return { ok: true, party };
         return { ok: true, party: setGym(party, gymId, region.id).party };
       },
       () => `<@${member.id}> moved this raid to **${plain(gym.nickname || gym.name)}**.`,
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/raids/boss.test.ts src/services/raid-change-service.test.ts`
Expected: PASS (`src/services/raid-change-service.ts`, `src/render/activity.ts`, `src/domain/party/party.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/raids/boss.test.ts src/domain/party/party.ts src/render/activity.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts
npm run check
git add src/commands/raids/boss.test.ts src/domain/party/party.ts src/render/activity.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts
git commit -m "Changing a raid's gym to one of another region moves the raid there" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,961 unit tests.

---

### Task 7: The location command asks before it moves a raid to another region

**Files:**
- Create: `src/commands/raids/location.test.ts`, `src/commands/raids/location.ts`
- Modify: `src/commands/index.ts`, `src/commands/raids/boss.test.ts`, `src/commands/raids/boss.ts`, `src/commands/raids/raid-input.ts`, `src/components/index.ts`, `src/discord/throttle.ts`

**Interfaces:**
- Consumes: Task 6 (`gymMove`, `setGym(..., moved)`); `PendingRequests`, `encodeCustomId`, `Throttles` and `waitText`, `partyOf`, `regionChannelOf`, `requireParty`, `answerRaidChange`, `changingMember`, `CHANGE_THROTTLE`, `gymChoices`, `reportedGym`, `problemText`, `PARTY_OVER`.
- Produces: `src/commands/raids/location.ts`: the command `location` (moved out of `boss.ts`), `locationControls` (custom-id kind `location`, the buttons `yes` and `no`), `MOVE_THROTTLE` (two in ten minutes) and `moves` (the uses counted, for tests to clear); `Throttles.clear()`. `gymChoices` and `reportedGym` lose their `options` (the local-only gyms).

The command still answers at once and is not deferred; only the button that moves is (`deferUpdate`), because the new post takes a moment. Its answer is an edit of the question, given through `moved` before the old post is closed. A cancel does not count towards the limit; the limit is counted when the member says yes. The tests of `/location` move from `boss.test.ts` to `location.test.ts`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/raids/boss.test.ts`:

```diff
--- a/src/commands/raids/boss.test.ts
+++ b/src/commands/raids/boss.test.ts
@@ -7,18 +7,16 @@ import {
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../../test/support/gyms.js';
-import { ALICE, BOB } from '../../../test/support/parties.js';
+import { ALICE } from '../../../test/support/parties.js';
 import { reportedRaid } from '../../../test/support/party-service.js';
-import { gymsFixture } from '../../../test/support/providers.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import type { CommandModule } from '../../discord/command.js';
 import { InteractionRouter } from '../../discord/router.js';
-import { PartyStatus } from '../../domain/party/status.js';
 import type { RaidReport } from '../../services/party-service.js';
 import { commands } from '../index.js';
-import { boss, location, moveset } from './boss.js';
+import { boss, moveset } from './boss.js';
 
-const all: CommandModule[] = [boss, moveset, location];
+const all: CommandModule[] = [boss, moveset];
 
 async function setup(report: Partial<RaidReport> = {}) {
   const made = await reportedRaid(report);
@@ -160,67 +158,6 @@ describe('/moveset', () => {
   });
 });
 
-describe('/location', () => {
-  it('moves the raid to another gym of the region', async () => {
-    const made = await setup();
-    expect(await made.answer('location', { gym: 'g:2' })).toBe(
-      'This raid is now at Old Stone Fountain.',
-    );
-    expect(made.current().gymId).toBe(2);
-    expect(await made.lines()).toEqual([`<@${ALICE}> moved this raid to **Old Stone Fountain**.`]);
-    expect(await made.answer('location', { gym: 'fountain' })).toBe(
-      'This raid is at Old Stone Fountain already.',
-    );
-  });
-
-  it('refuses a gym that lies in no region, and a gym that has such a raid, with its post', async () => {
-    const made = await setup();
-    expect(await made.answer('location', { gym: 'g:10' })).toMatch(
-      /^That gym is not in a region of this server that has a raid forum/,
-    );
-    const gym = gymsFixture().get(2);
-    if (!gym) throw new Error('no gym');
-    const other = await made.service.reportRaid({
-      gym,
-      reporterId: BOB,
-      anonymous: false,
-      autoStatus: PartyStatus.Interested,
-      tier: { level: 'T5', shadow: false },
-      boss: null,
-    });
-    if (other.kind !== 'created') throw new Error(other.kind);
-    expect(await made.answer('location', { gym: 'g:2' })).toBe(
-      `That gym already has a raid like this one. Its post is <#${other.party.forumPostId ?? ''}>.`,
-    );
-    expect(made.current().gymId).toBe(1);
-  });
-
-  it('asks for a pick when the text fits several gyms or none', async () => {
-    const made = await setup();
-    expect(await made.answer('location', { gym: 'starbucks maple' })).toMatch(
-      /^(This raid is now at Starbucks\.|Several gyms fit "starbucks maple")/,
-    );
-    expect(await made.answer('location', { gym: 'qqqqqq' })).toBe(
-      'I found no gym for "qqqqqq". Type part of its name and pick it from the list.',
-    );
-  });
-
-  it('offers and reads only gyms of the region the raid is in', async () => {
-    const made = await setup();
-    // The lighthouse is just across the border: `/raid` would offer it, this does not.
-    expect(await made.offered('location', 'gym', 'lighthouse')).toEqual([]);
-    expect(await made.answer('location', { gym: 'lighthouse' })).toBe(
-      'I found no gym for "lighthouse". Type part of its name and pick it from the list.',
-    );
-  });
-
-  it('offers the gyms of the region while typing', async () => {
-    const made = await setup();
-    const choices = await made.offered('location', 'gym', 'fount');
-    expect(choices?.[0]).toEqual({ name: 'Old Stone Fountain', value: 'g:2' });
-  });
-});
-
 describe('the command list', () => {
   it('has every command of this plan once, each with help', () => {
     const names = commands.map((command) => command.data.name);
```

Create `src/commands/raids/location.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, EAST_FORUM, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, PARTY_NOW } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { components } from '../../components/index.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import type { RaidReport } from '../../services/party-service.js';
import { location, locationControls, moves } from './location.js';

beforeEach(() => {
  moves.clear();
});

async function setup(report: Partial<RaidReport> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [location], [locationControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  const run = (options: Record<string, string> = {}, extra = {}) =>
    handle(
      fakeChatInput({
        commandName: 'location',
        ...where,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  const answer = async (options?: Record<string, string>) =>
    sent((await run(options)).reply).content;
  /** A click on the n-th button of the question a use of the command got. */
  const click = (asked: FakeInteraction, index: number, extra = {}) => {
    const row = sent(asked.reply).components?.[0] as {
      toJSON(): { components: { custom_id: string }[] };
    };
    const customId = row.toJSON().components[index]?.custom_id ?? '';
    return handle(
      fakeButton({ customId, ...where, userId: ALICE, displayName: 'Alice', ...extra }),
    );
  };
  /** The choices offered while typing the gym. */
  const offered = async (focused: string) => {
    const interaction = await handle(
      fakeAutocomplete({
        commandName: 'location',
        ...where,
        focusedName: 'gym',
        focused,
        guildChannelNames: { [EAST_CHANNEL]: 'east' },
      }),
    );
    return interaction.respond.mock.calls[0]?.[0];
  };
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, click, offered, lines };
}

async function raidAt(made: Awaited<ReturnType<typeof setup>>, gymId: number) {
  const gym = gymsFixture().get(gymId);
  if (!gym) throw new Error('no gym');
  const other = await made.service.reportRaid({
    gym,
    reporterId: BOB,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T5', shadow: false },
    boss: null,
  });
  if (other.kind !== 'created') throw new Error(other.kind);
  return other.party;
}

describe('/location', () => {
  it('moves the raid to another gym of the region', async () => {
    const made = await setup();
    expect(await made.answer({ gym: 'g:2' })).toBe('This raid is now at Old Stone Fountain.');
    expect(made.current().gymId).toBe(2);
    expect(await made.lines()).toEqual([`<@${ALICE}> moved this raid to **Old Stone Fountain**.`]);
    expect(await made.answer({ gym: 'fountain' })).toBe(
      'This raid is at Old Stone Fountain already.',
    );
  });

  it('refuses a gym that lies in no region, and a gym that has such a raid, with its post', async () => {
    const made = await setup();
    expect(await made.answer({ gym: 'g:10' })).toMatch(
      /^That gym is not in a region of this server that has a raid forum/,
    );
    const other = await raidAt(made, 2);
    expect(await made.answer({ gym: 'g:2' })).toBe(
      `That gym already has a raid like this one. Its post is <#${other.forumPostId ?? ''}>.`,
    );
    expect(made.current().gymId).toBe(1);
  });

  it('asks for a pick when the text fits several gyms or none', async () => {
    const made = await setup();
    expect(await made.answer({ gym: 'starbucks maple' })).toBe('This raid is now at Starbucks.');
    expect(made.current().gymId).toBe(5);
    expect(await made.answer({ gym: 'qqqqqq' })).toBe(
      'I found no gym for "qqqqqq". Type part of its name and pick it from the list.',
    );
  });

  it('offers the gyms of the region while typing, and those just across the border with their region', async () => {
    const made = await setup();
    expect((await made.offered('fount'))?.[0]).toEqual({
      name: 'Old Stone Fountain',
      value: 'g:2',
    });
    expect(await made.offered('lighthouse')).toEqual([
      { name: 'Harbor Lighthouse Mural · east', value: 'g:7' },
    ]);
    // A gym the raid cannot move to is not offered: East has no forum any more.
    const east = made.regions.byId(2);
    if (!east) throw new Error('no region East');
    east.forumChannelId = null;
    expect(await made.offered('lighthouse')).toEqual([]);
  });
});

describe('/location to a gym of another region', () => {
  it('asks first, privately, and changes nothing yet', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'lighthouse' });
    expect(sent(asked.reply)).toMatchObject({
      content:
        `Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>, not in this region. Moving the raid ` +
        'there gives it a new post in the raid forum of that region, with everybody who is ' +
        'signed up, and closes this one. Move it?',
      flags: MessageFlags.Ephemeral,
    });
    const row = sent(asked.reply).components?.[0] as {
      toJSON(): { components: { label: string }[] };
    };
    expect(row.toJSON().components.map((button) => button.label)).toEqual([
      'Move it there',
      'Cancel',
    ]);
    expect(made.current().gymId).toBe(1);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
  });

  it('moves the raid on yes and answers with the new post before the old one is closed', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    const yes = await made.click(asked, 0);
    await made.attendance.flush();
    await made.service.flush();
    const [party] = made.store.active();
    expect(party).toMatchObject({ gymId: 7, regionId: 2 });
    expect(party?.id).not.toBe(made.party.id);
    expect(yes.deferUpdate).toHaveBeenCalledTimes(1);
    expect(yes.editReply).toHaveBeenCalledTimes(1);
    expect(sent(yes.editReply)).toEqual({
      content: `This raid is now at Harbor Lighthouse Mural. Its new post is <#${party?.forumPostId ?? ''}>.`,
      components: [],
    });
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
    expect(
      made.gateway.messagesIn(party?.forumPostId ?? '').map((message) => message.message.content),
    ).toEqual([`<@${ALICE}> moved this raid here from **The Stacks** in <#100000000000000001>.`]);
  });

  it('moves nothing on cancel, and a question is answered once', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    const no = await made.click(asked, 1);
    expect(sent(no.update)).toEqual({ content: 'Nothing was moved.', components: [] });
    const late = await made.click(asked, 0);
    expect(sent(late.update)).toEqual({
      content: 'That choice has expired. Use `/location` again.',
      components: [],
    });
    expect(made.current().gymId).toBe(1);
  });

  it('is nobody else’s to answer', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    const other = await made.click(asked, 0, { userId: BOB });
    expect(sent(other.reply)).toMatchObject({
      content: 'That is somebody else’s question.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().gymId).toBe(1);
    // The member who asked can still answer.
    await made.click(asked, 0);
    expect(made.store.active()[0]?.gymId).toBe(7);
  });

  it('says why nothing moved when that gym got such a raid meanwhile, or the raid has ended', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    const other = await raidAt(made, 7);
    const taken = await made.click(asked, 0);
    expect(sent(taken.editReply)).toEqual({
      content:
        'Nothing was moved. That gym already has a raid like this one. ' +
        `Its post is <#${other.forumPostId ?? ''}>.`,
      components: [],
    });
    expect(made.current().gymId).toBe(1);

    const again = await made.run({ gym: 'g:8' });
    await made.service.end(made.party.id);
    const over = await made.click(again, 0);
    expect(sent(over.editReply).content).toBe('This raid is over.');
  });

  it('takes the buttons away and reports the failure when the move fails', async () => {
    const made = await setup();
    const asked = await made.run({ gym: 'g:7' });
    made.gateway.failing.set('createPost', new Error('Discord is away'));
    const failed = await made.click(asked, 0);
    expect(sent(failed.editReply)).toEqual({ content: 'Nothing was moved.', components: [] });
    expect(failed.followUp).toHaveBeenCalledTimes(1);
    expect(made.current().gymId).toBe(1);
  });

  it('allows a member two moves to another region in ten minutes; a cancel does not count', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
    try {
      const made = await setup();
      const bob = { userId: BOB, displayName: 'Bob' };
      const moveTo = async (gym: string, index = 0) => {
        const [party] = made.store.active();
        const where = {
          channelId: party?.forumPostId ?? '',
          thread: { parentId: party?.forumChannelId ?? '' },
        };
        const asked = await made.run({ gym }, { ...bob, ...where });
        return made.click(asked, index, { ...bob, ...where });
      };
      await moveTo('g:7', 1);
      await moveTo('g:7');
      expect(made.store.active()[0]?.gymId).toBe(7);
      await moveTo('g:1');
      expect(made.store.active()[0]?.gymId).toBe(1);
      const third = await moveTo('g:8');
      expect(sent(third.update)).toEqual({
        content:
          'Nothing was moved. You have moved raids to another region a moment ago; ' +
          'try again in 10 minutes.',
        components: [],
      });
      expect(made.store.active()[0]?.gymId).toBe(1);
      // Somebody else may, and so may Bob once the ten minutes are over.
      vi.setSystemTime(PARTY_NOW + 10 * 60_000);
      await moveTo('g:8');
      expect(made.store.active()[0]?.gymId).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is listed with the controls the router reads', () => {
    expect(components).toContain(locationControls);
  });
});
```

Run: `npx vitest run --project unit src/commands/raids/boss.test.ts src/commands/raids/location.test.ts`
Expected: FAIL (`location.ts` does not exist).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -6,7 +6,8 @@ import { deleteRaid } from './parties/delete.js';
 import { cancelMeet, meet } from './parties/meet.js';
 import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
-import { boss, location, moveset } from './raids/boss.js';
+import { boss, moveset } from './raids/boss.js';
+import { location } from './raids/location.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
 import { help } from './util/help.js';
```

Apply to `src/commands/raids/boss.ts`:

```diff
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -2,14 +2,14 @@ import { SlashCommandBuilder, type AutocompleteInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, regionChannelOf, requireParty } from '../../discord/guards.js';
+import { partyOf, requireParty } from '../../discord/guards.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { matchNamed } from '../../domain/search/word-match.js';
 import { problemText } from '../../render/activity.js';
 import { plain, truncate } from '../../render/text.js';
 import { commandParty } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
-import { bossChoices, gymChoices, MAX_CHOICES, reportedBoss, reportedGym } from './raid-input.js';
+import { bossChoices, MAX_CHOICES, reportedBoss } from './raid-input.js';
 
 export const boss: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -161,69 +161,3 @@ export const moveset: SimpleCommand = {
     await interaction.respond(choices);
   },
 };
-
-/**
- * `/location`: moves the raid to another gym. The legacy command was `!gym`; the name `/gym`
- * belongs to the gym administration (`/gym create`, …), and one command cannot be both.
- */
-export const location: SimpleCommand = {
-  data: new SlashCommandBuilder()
-    .setName('location')
-    .setDescription('Move this raid to another gym, when it was reported at the wrong one')
-    .addStringOption((option) =>
-      option
-        .setName('gym')
-        .setDescription('The gym: type part of its name and pick from the list')
-        .setRequired(true)
-        .setMaxLength(100)
-        .setAutocomplete(true),
-    ),
-  help: {
-    category: 'raid-crud',
-    details:
-      'The gym must be in the same region, and must not have such a raid already. ' +
-      IN_A_RAID_POST,
-    examples: ['/location gym:Big Fountain'],
-  },
-  guards: [requireParty],
-  throttle: CHANGE_THROTTLE,
-  async execute(interaction, ctx) {
-    const party = commandParty(interaction, ctx);
-    const typed = interaction.options.getString('gym', true);
-    const answer = reportedGym(ctx, regionChannelOf(interaction, ctx), typed, { localOnly: true });
-    if (answer.kind === 'none') {
-      throw new UserError(
-        `I found no gym for "${plain(truncate(typed, 80))}". Type part of its name and pick it from the list.`,
-      );
-    }
-    if (answer.kind === 'several') {
-      const names = answer.gyms.slice(0, 3).map((gym) => plain(gym.name));
-      throw new UserError(
-        `Several gyms fit "${plain(truncate(typed, 80))}" (${names.join(', ')}…). Pick one from the list.`,
-      );
-    }
-    const { gym } = answer;
-    const name = plain(gym.nickname || gym.name);
-    const outcome = await ctx.raids.setGym(party.id, changingMember(interaction), gym.id);
-    await answerRaidChange(
-      interaction,
-      ctx,
-      outcome,
-      () => `This raid is now at ${name}.`,
-      `This raid is at ${name} already.`,
-    );
-  },
-  async autocomplete(interaction, ctx) {
-    const regionName = (channelId: string): string | undefined =>
-      interaction.guild?.channels.cache.get(channelId)?.name;
-    await interaction.respond(
-      gymChoices(
-        ctx,
-        regionChannelOf(interaction, ctx),
-        interaction.options.getFocused(),
-        regionName,
-        { localOnly: true },
-      ),
-    );
-  },
-};
```

Create `src/commands/raids/location.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, regionChannelOf, requireParty } from '../../discord/guards.js';
import { Throttles, waitText, type Throttle } from '../../discord/throttle.js';
import { problemText } from '../../render/activity.js';
import { plain, truncate } from '../../render/text.js';
import { PendingRequests } from '../../services/pending-requests.js';
import { commandParty, PARTY_OVER } from '../parties/reply.js';
import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
import { gymChoices, reportedGym } from './raid-input.js';

/** The custom-id kind of the question `/location` asks before a move to another region. */
const KIND = 'location';
const EXPIRED = 'That choice has expired. Use `/location` again.';
const NOT_MOVED = 'Nothing was moved.';

/** A move to another region that waits for the member's yes. */
interface PendingMove {
  partyId: string;
  gymId: number;
}

const pending = new PendingRequests<PendingMove>();

/**
 * How often one member may move raids to another region. Far fewer than other changes: such a
 * move pings everybody who is signed up, makes a post, and takes everybody into another forum.
 */
export const MOVE_THROTTLE: Throttle = { uses: 2, perSeconds: 600 };
/** The moves each member made of late (in memory, like every throttle). */
export const moves = new Throttles();

/**
 * `/location`: moves the raid to another gym. The legacy command was `!gym`; the name `/gym`
 * belongs to the gym administration (`/gym create`, …), and one command cannot be both.
 *
 * A gym of the raid's own region is taken at once. A gym of another region means a new post in
 * that region's forum and the end of this one (spec 5.2), so the member is asked first.
 */
export const location: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('location')
    .setDescription('Move this raid to another gym, when it was reported at the wrong one')
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('The gym: type part of its name and pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'raid-crud',
    details:
      'The gym must not have such a raid already. For a gym of another region I ask first: the ' +
      'raid then gets a new post in the raid forum of that region, with everybody who is ' +
      `signed up, and this post is closed with a link to it. ${IN_A_RAID_POST}`,
    examples: ['/location gym:Big Fountain'],
  },
  guards: [requireParty],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const typed = interaction.options.getString('gym', true);
    const answer = reportedGym(ctx, regionChannelOf(interaction, ctx), typed);
    if (answer.kind === 'none') {
      throw new UserError(
        `I found no gym for "${plain(truncate(typed, 80))}". Type part of its name and pick it from the list.`,
      );
    }
    if (answer.kind === 'several') {
      const names = answer.gyms.slice(0, 3).map((gym) => plain(gym.name));
      throw new UserError(
        `Several gyms fit "${plain(truncate(typed, 80))}" (${names.join(', ')}…). Pick one from the list.`,
      );
    }
    const { gym } = answer;
    const name = plain(gym.nickname || gym.name);
    // Where the raid would go; the service decides again when it moves, and refuses what cannot be.
    const move = ctx.raids.gymMove(party, gym);
    if (move.kind !== 'region') {
      const outcome = await ctx.raids.setGym(party.id, changingMember(interaction), gym.id);
      await answerRaidChange(
        interaction,
        ctx,
        outcome,
        () => `This raid is now at ${name}.`,
        `This raid is at ${name} already.`,
      );
      return;
    }
    const token = pending.put(interaction.user.id, { partyId: party.id, gymId: gym.id });
    const button = (action: string, label: string, style: ButtonStyle) =>
      new ButtonBuilder()
        .setCustomId(encodeCustomId({ kind: KIND, id: token, action }))
        .setLabel(label)
        .setStyle(style);
    await interaction.reply({
      content:
        `${name} is in <#${move.region.channelId}>, not in this region. Moving the raid there gives ` +
        'it a new post in the raid forum of that region, with everybody who is signed up, and ' +
        'closes this one. Move it?',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('yes', 'Move it there', ButtonStyle.Primary),
          button('no', 'Cancel', ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
  async autocomplete(interaction, ctx) {
    const regionName = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    const choices = gymChoices(
      ctx,
      regionChannelOf(interaction, ctx),
      interaction.options.getFocused(),
      regionName,
    );
    // Not the gyms the raid cannot move to (in no region of this server that has a forum).
    const party = partyOf(interaction, ctx);
    const reachable = (value: string): boolean => {
      const gym = ctx.gyms.get(Number(value.slice(2)));
      return !party || (gym !== undefined && ctx.raids.gymMove(party, gym).kind !== 'nowhere');
    };
    await interaction.respond(choices.filter((choice) => reachable(choice.value)));
  },
};

/** The two buttons under the question of `/location`. */
export const locationControls: ComponentHandler = {
  kind: KIND,
  throttle: CHANGE_THROTTLE,

  async button(interaction, id, ctx) {
    const taken = pending.take(id.id, interaction.user.id);
    if (taken === 'not-yours') throw new UserError('That is somebody else’s question.');
    if (taken === 'expired') {
      await interaction.update({ content: EXPIRED, components: [] });
      return;
    }
    if (id.action !== 'yes') {
      await interaction.update({ content: NOT_MOVED, components: [] });
      return;
    }
    const { partyId, gymId } = taken.value;
    const gym = ctx.gyms.get(gymId);
    if (!gym) {
      await interaction.update({ content: 'That gym no longer exists.', components: [] });
      return;
    }
    const name = plain(gym.nickname || gym.name);
    const wait = moves.use(KIND, interaction.user.id, MOVE_THROTTLE, Date.now());
    if (wait !== undefined) {
      await interaction.update({
        content:
          `${NOT_MOVED} You have moved raids to another region a moment ago; ` +
          `try again in ${waitText(wait)}.`,
        components: [],
      });
      return;
    }
    // The new post takes a moment to make.
    await interaction.deferUpdate();
    let answered = false;
    const say = async (content: string): Promise<void> => {
      answered = true;
      await interaction.editReply({ content, components: [] });
    };
    let outcome;
    try {
      // The answer is given before this post is closed: the question stands in it.
      outcome = await ctx.raids.setGym(partyId, changingMember(interaction), gymId, (party) =>
        say(
          `This raid is now at ${name}.` +
            (party.forumPostId === null ? '' : ` Its new post is <#${party.forumPostId}>.`),
        ),
      );
    } catch (err) {
      try {
        await say(NOT_MOVED);
      } catch {
        // The message may be gone or the token expired; the error below is what matters.
      }
      throw err;
    }
    if (answered) return;
    if (outcome.kind === 'gone') {
      await say(PARTY_OVER);
    } else if (outcome.kind === 'refused') {
      const post = outcome.other?.forumPostId;
      await say(
        `${NOT_MOVED} ${problemText(outcome.reason, ctx.attendance.limits())}` +
          (post ? ` Its post is <#${post}>.` : ''),
      );
    } else {
      // The gym lies in the raid's own region by now (somebody moved the raid meanwhile).
      await say(
        outcome.changed ? `This raid is now at ${name}.` : `This raid is at ${name} already.`,
      );
    }
  },
};
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -335,11 +335,6 @@ function gymLabel(gym: Gym, region: string | undefined): string {
   return truncate(parts.join(' · '), CHOICE_NAME);
 }
 
-export interface GymInputOptions {
-  /** Only gyms of the region itself: for a raid that cannot leave its region (`/location`). */
-  localOnly?: boolean;
-}
-
 /**
  * The choices for the `gym` option: the gyms matching what was typed, the region's own first.
  * `regionName` gives the name of a region channel, to say where a gym of another region lies.
@@ -349,12 +344,10 @@ export function gymChoices(
   regionChannelId: string | undefined,
   typed: string,
   regionName: (channelId: string) => string | undefined,
-  options: GymInputOptions = {},
 ): Choice[] {
   if (typed.trim() === '') return [];
   return ctx.gyms
     .search(regionChannelId ?? null, typed, { limit: MAX_CHOICES })
-    .filter((hit) => !options.localOnly || hit.place === 'local')
     .map(({ gym, place }) => {
       const elsewhere = place === 'local' ? undefined : ctx.gyms.regionsOf(gym.id)[0];
       const region = elsewhere === undefined ? undefined : regionName(elsewhere);
@@ -377,7 +370,6 @@ export function reportedGym(
   ctx: AppContext,
   regionChannelId: string | undefined,
   value: string,
-  options: GymInputOptions = {},
 ): GymAnswer {
   const text = value.trim();
   const picked = /^g:(\d{1,10})$/.exec(text);
@@ -385,9 +377,7 @@ export function reportedGym(
     const gym = ctx.gyms.get(Number(picked[1]));
     return gym ? { kind: 'gym', gym } : { kind: 'none' };
   }
-  const hits = ctx.gyms
-    .search(regionChannelId ?? null, text, { limit: 5 })
-    .filter((hit) => !options.localOnly || hit.place === 'local');
+  const hits = ctx.gyms.search(regionChannelId ?? null, text, { limit: 5 });
   if (hits.length === 0) return { kind: 'none' };
   const clear = hits.filter((hit) => hit.allWords && !hit.corrected);
   const [only] = clear;
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,6 +1,11 @@
+import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { partyButtons } from './party.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
-export const components: readonly ComponentHandler[] = [raidControls, partyButtons];
+export const components: readonly ComponentHandler[] = [
+  raidControls,
+  locationControls,
+  partyButtons,
+];
```

Apply to `src/discord/throttle.ts`:

```diff
--- a/src/discord/throttle.ts
+++ b/src/discord/throttle.ts
@@ -33,6 +33,11 @@ export class Throttles {
     return Math.ceil((window.closes - now) / 1000);
   }
 
+  /** Forgets every use; for tests. */
+  clear(): void {
+    this.windows.clear();
+  }
+
   /** How many members' windows are held; for tests. */
   get size(): number {
     return this.windows.size;
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/raids/boss.test.ts src/commands/raids/location.test.ts`
Expected: PASS (`src/commands/raids/location.ts` and the lists of commands and controls).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/index.ts src/commands/raids/boss.test.ts src/commands/raids/boss.ts src/commands/raids/location.test.ts src/commands/raids/location.ts src/commands/raids/raid-input.ts src/components/index.ts src/discord/throttle.ts
npm run check
git add src/commands/index.ts src/commands/raids/boss.test.ts src/commands/raids/boss.ts src/commands/raids/location.test.ts src/commands/raids/location.ts src/commands/raids/raid-input.ts src/components/index.ts src/discord/throttle.ts
git commit -m "The location command asks before it moves a raid to another region" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,968 unit tests.

---

### Task 8: Access and a move over a restart, in MySQL

**Files:**
- Modify: `src/services/party-lifecycle.db.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 7; `party-lifecycle.db.test.ts` and its setup, `AccessGrantRepository`.
- Produces: A second lifecycle test with the real tables: a member is let in, the raid moves to another region, the bot restarts, the member leaves, the raid runs out.

A database test only: it needs Docker and is not part of `npm run check`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/services/party-lifecycle.db.test.ts`:

```diff
--- a/src/services/party-lifecycle.db.test.ts
+++ b/src/services/party-lifecycle.db.test.ts
@@ -2,13 +2,14 @@ import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../test/support/migrated-db.js';
 import { ALICE, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
-import { REMOTE_CHANNEL } from '../../test/support/gyms.js';
+import { EAST_FORUM, REMOTE_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import {
   gatewayWithMirrorChannels,
   partyServiceWith,
   restarted,
 } from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
+import { AccessGrantRepository } from '../db/repositories/access-grant-repository.js';
 import { PartyRepository } from '../db/repositories/party-repository.js';
 import type { DB } from '../db/types.js';
 import { attendeeOf } from '../domain/party/party.js';
@@ -35,13 +36,19 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
       db,
     );
-    await sql`insert into Gym (id, name) values (1, 'Library'), (2, 'Fountain')`.execute(db);
+    await sql`insert into Region (id, guildId, channelId) values (2, 1, 1234567890123456789)`.execute(
+      db,
+    );
+    await sql`insert into Gym (id, name) values (1, 'Library'), (2, 'Fountain'), (8, 'Cafe')`.execute(
+      db,
+    );
   });
   afterAll(async () => {
     await stop();
   });
   beforeEach(async () => {
     await db.deleteFrom('Party').execute();
+    await db.deleteFrom('PartyAccessGrant').execute();
   });
 
   it('hatches, asks, catches up after the restart, warns and archives', async () => {
@@ -144,4 +151,86 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     const third = await restarted(second);
     expect(third.store.active()).toEqual([]);
   });
+
+  it('lets a member of another region in, moves the raid to another region, and tidies up after a restart', async () => {
+    const repository = new PartyRepository(db);
+    const grants = new AccessGrantRepository(db);
+    const first = await partyServiceWith([], {}, { database: repository, grants });
+    first.gateway.shutOut(WEST_FORUM, ALICE);
+    first.gateway.shutOut(EAST_FORUM, ALICE, BOB);
+    const gym = gymsFixture().get(1);
+    const cafe = gymsFixture().get(8);
+    if (!gym || !cafe) throw new Error('no gym');
+    const outcome = await first.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+      time: { hatch: HATCH },
+    });
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    const oldId = outcome.party.id;
+    const oldPost = outcome.party.forumPostId ?? '';
+    await first.attendance.signUp(oldId, alice, PartyStatus.Coming);
+    await first.attendance.signUp(oldId, bob, PartyStatus.Coming, { number: 2 });
+    await first.attendance.flush();
+    await first.access.flush();
+    expect(await grants.list()).toEqual([
+      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: first.clock.now },
+    ]);
+
+    // The raid was reported at the wrong gym: it is at the café, in East.
+    const moved = await first.raids.setGym(oldId, bob, 8);
+    if (moved.kind !== 'ok') throw new Error(moved.kind);
+    await first.attendance.flush();
+    await first.service.flush();
+    await first.access.flush();
+    const id = moved.party.id;
+    const postId = moved.party.forumPostId ?? '';
+    expect(id).not.toBe(oldId);
+    expect(await repository.findById(oldId)).toMatchObject({
+      ok: true,
+      party: { status: 'ended', forumPostId: oldPost, gymId: 1, regionId: 1 },
+    });
+    expect(first.gateway.posts.get(oldPost)).toMatchObject({ archived: true, locked: true });
+    // Both cannot see East by themselves; nothing calls for Alice to see West any more.
+    expect((await grants.list()).map((grant) => [grant.forumChannelId, grant.memberId])).toEqual([
+      [EAST_FORUM, ALICE],
+      [EAST_FORUM, BOB],
+    ]);
+    expect(first.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
+
+    const second = await restarted(first);
+    const loaded = second.store.get(id);
+    expect(loaded).toEqual(first.store.get(id));
+    expect(loaded).toMatchObject({
+      gymId: 8,
+      regionId: 2,
+      forumChannelId: EAST_FORUM,
+      forumPostId: postId,
+      hatchTime: HATCH,
+      createdAt: outcome.party.createdAt,
+    });
+    expect(Object.keys(loaded?.attendees ?? {})).toEqual([REPORTER, ALICE, BOB]);
+    expect(attendeeOf(loaded ?? moved.party, BOB)).toMatchObject({ number: 2, name: 'Bob 🎉' });
+    expect(second.access.size).toBe(2);
+
+    // Bob leaves after the restart; the raid runs out and the rest is taken back with it.
+    await second.attendance.leave(id, bob);
+    await second.attendance.flush();
+    await second.access.flush();
+    expect((await grants.list()).map((grant) => grant.memberId)).toEqual([ALICE]);
+    second.clock.now = HATCH + 45 * MINUTE + 6 * MINUTE;
+    await second.scheduler.start();
+    second.clock.now += 11 * MINUTE;
+    await second.scheduler.tick();
+    await second.scheduler.stop();
+    await second.access.flush();
+    expect(second.store.active()).toEqual([]);
+    expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
+    expect(await grants.list()).toEqual([]);
+    expect(second.gateway.canSee(EAST_FORUM, ALICE)).toBe(false);
+  });
 });
```

- [ ] **Step 2: The implementation**

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project db src/services/party-lifecycle.db.test.ts` (Docker; allow ten minutes)
Expected: PASS.

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/services/party-lifecycle.db.test.ts
npm run check
git add src/services/party-lifecycle.db.test.ts
git commit -m "Access and a move to another region over a restart, in MySQL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,968 unit tests.

---

## As built

Executed on 2026-10-11: commits `8fb67f6`, `bd1a0fc`, `116e98b`, `aa2b91e`, `4ed40f8`, `4986ce5`, `8ab3d79`, `d4290d0`, each equal to the reviewed prototype. The whole-branch review found nothing critical or important; its minor findings were fixed in `76af052`, which this document does not show: only a move that happened counts towards the limit of two in ten minutes (`Throttles.wait`); a new party that could not be ended after a failed move is ended by the render that is asked for; the new post's warning and its archiving time stay together in `carriedOver`; a closed post no longer says that it is kept open; two tests corrected. 1,970 unit tests and 131 database tests at the end. After the plan, on Matt's answers (2026-10-11), two of its decisions were changed: decision 3 (a member who is done keeps the access until the raid ends) and decision 9 (a move has no limit of its own; `MOVE_THROTTLE` is gone). What is left open is in "From Phase 2E-2" of `phase-0-follow-ups.md`.

## After the last task

The controller, not an implementer, does these:

1. `npm run test:db` once, complete (the new table, the repository, the lifecycle test with access and a move).
2. Whole-branch review (Opus, high effort) of the eight commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line (Phase 2 is built; staging is what is left), and conventions for `PartyStore.onChange`, `AccessService` (the record first, only its own overwrites, the sweep), `PartyGateway.memberAccess` / `admitMember` / `dismissMember`, `PartyService.relocate` (a move is a new party; the order; `moved`), `RaidChangeService.gymMove` and `setGym(..., moved)`, `/location` and its question, `withMentions` in `render/text.ts`, the test support (`gateway.shutOut`, `canSee`, `barred`, `MemoryAccessGrants`, `access`, `grants`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: delete the three "Plan 2E-2" lists; add a "From Phase 2E-2" section. The spec (5.2, 5.4 and 6.1 "as built"), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of plans 2D-1, 2D-2, 2E-1 and 2E-2 has touched Discord. Each step needs Matt's go-ahead. Do the checklists at the end of the 2D-1, 2D-2 and 2E-1 plans first. This one needs: a second region on the test server with its own channel and forum (`/admin setup-forums`), in a category that a role gates; gyms in both regions in the local database; the bot with **Manage Permissions** in both forums (and View Channel, Read Message History and Send Messages in Threads there itself: it can only give what it has); a second account that has the role of one region only, and a third without either.

Access:

- [ ] The migration runs at start: the table `PartyAccessGrant` exists, the log says `access grants loaded`.
- [ ] With the second account (which cannot see region B's forum), press Join on the copy of a region B raid in `remote-raids`: within a second or two the account sees the forum and the post, can write in the post, and still cannot see region B's text channel. The table has one row; the log says `let a member into a forum`.
- [ ] The forum's permissions in Discord show one overwrite for that member. Note down: is the forum still shown as synced with its category; does a later change of the category's permissions reach the forum while the overwrite exists, and after it is gone?
- [ ] Leave the raid with that account: the forum disappears for it, the row and the overwrite are gone. Done instead of Leave: the account stays in (changed after the plan: a guest keeps the forum until the raid ends).
- [ ] In two raids of region B at once, leave one: still in. Leave the other: out.
- [ ] Let a raid end by the clock with the account signed up: out when the post is archived.
- [ ] Report a raid from region A's channel at a region B gym with the second account (confirming the question): the account is let into region B's forum.
- [ ] A moderator edits the bot's overwrite for the member to deny View Channel; the member leaves the raid (through the copy): the bar stays, the log says somebody changed it, the row is gone. Signing up again does not let them in.
- [ ] A role the member holds is denied View Channel on the forum: signing up does not let them in (`kept out of a forum` in the log).
- [ ] Take Manage Permissions from the bot in the forum: one warning in the log, no further attempt for ten minutes, the member is simply not let in. Give it back: the member's next step in the raid lets them in.
- [ ] Stop the bot (Ctrl+C in the terminal that runs it) between a sign-up and the grant, or delete an overwrite by hand, and start it again: the sweep at start puts it right.
- [ ] What the fakes cannot show, to note down: whether the member's roles are right without a fetch right after a role change (remove the role, click the copy at once); what Discord answers to deleting an overwrite that does not exist and to an overwrite for a member who has left the server; how long twenty grants in a row take (the rate limit of `PUT /channels/:id/permissions/:id`) and whether edits of posts in that forum wait meanwhile; the audit log entries.

Moving a raid:

- [ ] `npm run deploy-commands -- --guild <test server id>` (the description and the list of `/location` changed).
- [ ] `/location` in a raid's post, typing the name of a gym just across the border: the list offers it with the other region's name. Pick it: a private question with two buttons; nothing has changed yet. Cancel: "Nothing was moved."
- [ ] Again, and "Move it there": the private answer names the new post; the old post says "This raid has moved to … in #region: #post", pings the others who are signed up, shows the sentence in its own message, loses its buttons, gets the `Ended` tag and is archived and locked; the link line leaves region A's channel and one appears in region B's; the copy in `remote-raids` is replaced by one that names region B; both summaries are right.
- [ ] The new post has everybody who was signed up, the groups, a meeting time and the raid's times, and the line "… moved this raid here from … in #region". Its buttons work.
- [ ] A member of region A who was signed up and cannot see region B's forum: they got the ping in the old post, the link in it opens the new post (how long until it does?), and they can use the new post.
- [ ] A member who was in region A's forum only by a grant: they got the ping in the old post before they lost sight of it. Note down what they see afterwards.
- [ ] Move a raid to a gym that has such a raid: refused with a link to that raid's post; nothing changed.
- [ ] Several confirmed moves in a row by the same account all work (changed after the plan: a move has no limit of its own; the eleventh change of a raid within a minute is refused like any other).
- [ ] Two accounts confirm a move of the same raid at the same moment: one moves it, the other is told the raid is over (the old post shows where it went).
- [ ] What the fakes cannot show, to note down: whether the private answer (an edit of the question after `deferUpdate`) arrives right before the archiving and stays readable after it; what a click on the question's buttons does in an archived and locked post; whether `<#region>` and `<#post>` in the embed's description render as links; that nothing reopens the old post afterwards; a move to a forum the bot may not post in (what the member sees).

When all four checklists are through, Phase 2 is done: a raid from `/raid` to the archived post, surviving a restart in the middle (the "done when" of the phase).
