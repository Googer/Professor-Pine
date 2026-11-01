# Phase 4C: Self-Assigned Roles (`/iam`, `/iamnot`, `/admin self-roles`): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member gives themself the roles a server offers (regions, teams and the like), by name or through menus, one menu per group of roles; staff say which roles those are and how they are grouped.

**Architecture:** Phase 4 (notifications and members) is three plans: 4A and 4B (done) and 4C (this one, the last). A self-assignable role is a row of the legacy table `Role` with its aliases in `Alias`; new and additive are the id of the Discord role on the row and a table of groups. What may be given is decided by pure rules in `src/domain/roles/` from the facts of a role (`roleProblem`), checked when a role is added to the list and again every time it is given. Discord is behind a small port (`RoleGateway`: the server's roles, `giveRole`, `takeRole`): the bot writes one role at a time and never a member's role list, so it cannot touch a role that is not on the list. `SelfRoleService` (`ctx.selfRoles`) plans a change, carries it out step by step and reports what was really done.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies. One additive migration (two columns on `Role`, the table `RoleGroup`).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: 4.2 (the rows `iam` and `asar` and their neighbours), 3.2. Where the spec and this plan differ the plan is newer. The design brief is the git-ignored `.superpowers/sdd/phase-4c-design.md`; the rulings on the reviews are `review-rulings.md` and its successors in `.superpowers/sdd/2026-10-13-phase-4c-self-roles/`; what the legacy bot did is section 4 of `.superpowers/sdd/phase-4-legacy-notes.txt`.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with the typecheck and the tests of each task clean and the full check, build and database suite clean on the tip (3,572 unit tests; the database suite, 227 tests). Two reviewers went through that branch, a third through the first fixes, and the second fixes carry out what the third found; what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the plan.

## Decisions made in this plan

1. **Where it exists.** Only where `settings.features.roles` is on: `/iam`, `/iamnot` and the `self-roles` part of `/admin` are neither registered nor routed otherwise (`SubcommandPart.enabled`). Every answer is private; no bot channel is needed; servers only.
2. **No privileged intent.** A member's roles are read from the interaction, the server's roles from the cache the `Guilds` intent keeps current. The auto-assigned role of the spec is not built (Matt, 2026-10-12).
3. **The row and its Discord role.** A row made by the new bot has the role's id from the start (staff pick the role with Discord's role picker). A legacy row is linked the first time it is resolved, by name without case, when exactly one role of the server that no other row stands for has that name; several are `ambiguous` and nothing is guessed. From then on the id counts, and the row's `roleName` follows a renamed role (so the legacy bot keeps finding it) unless that name is taken or too long. A row whose role is gone is offered to nobody.
4. **Groups** (Matt, 2026-10-12): a role belongs to at most one group; a group has a name, a position and whether only one of its roles may be held ("pick one": teams; regions are not). Roles without a group are "Other". Existing roles start without a group.
5. **What may never be self-assigned:** `@everyone`, a managed role, a role at or above the bot's highest, and a role that adds a permission of moderation or administration to what `@everyone` has (`MODERATION_PERMISSIONS`). Checked at `add` and at every giving; taking a role back is still allowed when it has become one of these.
6. **Staff cannot offer what they could not give by hand:** `/admin self-roles add` needs the server's owner, or Manage Roles and a role below the staff member's own highest.
7. **One role per request** (the reviews overruled the brief's one request per change; Matt agreed, 2026-10-13): a list written from what an interaction showed would undo whatever anybody else changed meanwhile, a role taken from a moderator or a mute given. A change is carried out give first, then take, and stops at the first step Discord refuses; the member is told exactly what was given, taken, refused and not tried.
8. **`/iam role`** gives one role (autocomplete over names and aliases; typed text must be a name or alias in full). In a pick-one group the other role of the group goes in the same change. **`/iamnot role`** offers only what the member holds.
9. **`/iam` without a role** (Matt): menus, one per group in the groups' order, "Other" last; a group of more than 25 roles is split into ranges named by their beginnings; five menus on a message, or four and Previous / Next. A multi-select has the member's roles preselected; a pick-one menu has "None". A menu changes only what it showed: ticked roles the member lacks are given, roles it showed ticked that are now unticked are taken. Nothing about an open menu is kept in memory.
10. **`/admin self-roles`**: `add role [description] [aliases] [group]`, `remove role`, `list`, `group name [pick-one] [position] [new-name]`, `ungroup name`. Removing a row never touches the Discord role or anybody's roles.
11. **Teams** are not special-cased: the bot still reads a member's team from a role named `instinct`, `mystic` or `valor`, and a pick-one group is how a server keeps a member to one.
12. **Not in this plan** (to the follow-ups file): a reminder to staff when a region is added or deleted (Phase 5); a member on two teams and a default count (shelved by Matt); the review of command names.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). Repositories are the only code that knows column names; a write in several steps goes through `inTransaction`.
- Database changes are additive only: Task 1 has the plan's one migration. `src/db/types.ts` is generated: its diff here is what `npm run db:codegen` produces after that migration; apply it as written.
- **Tests never use the network and never contact Discord.** Discord in tests is the fake interactions and `FakeRoleGateway`. Database tests never use production rows.
- Text staff or members wrote is shown through `plain()`; a role is named by its name in bold, never by a mention. Custom ids are built and parsed only through `src/discord/custom-id.ts`.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Each task names the commit of the prototype it transcribes (branch `proto/phase-4c` of this repository). `git diff <that commit> -- src test scripts data/settings.json` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Inside the plan a task needs the typecheck and its own tests green (and whatever else its change could have broken); the full `npm run check` must be green after the last task (lint, format check, typecheck, all unit tests). `npx prettier --write <files you touched>` before every commit.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. A member must never get a role that is not on the list, or one that has become dangerous: Tasks 1 and 2, `self-roles.test.ts` (the property test of `planChange`), `role-permissions.test.ts` ("sorts every permission discord.js knows into moderation or harmless, and none into both"), `self-role-service.test.ts` ("gives no role that became dangerous after it was added, and none of a row that is gone"; the tests of a role that gains a permission and of a row removed while the first request is on its way).
2. The bot must never undo what somebody else did to a member's roles: Task 2, the tests "does not give back a role an admin took away between the interaction and the request", "does not strip a role that was given between the interaction and the request" and "runs a queued request with its old picture without undoing what happened meanwhile".
3. A change that Discord refuses half-way is reported truthfully: Tasks 2, 4 and 5, the `partial` outcomes in `self-role-service.test.ts`, `iam.test.ts` and `menus.test.ts`.
4. A menu changes only what it showed, whatever happened since it was shown: Task 5, `src/commands/roles/menus.test.ts` ("touches only the roles of the menu that was changed", "skips and names a ticked role that is no longer on the list", "gives none of two roles of a group that became pick-one since the menu was shown", "reads \"None\" only from a menu that offered it", "asks the service for no take when another role of a pick-one menu is picked").
5. No message exceeds Discord's limits whatever the number and names of roles: Tasks 3 and 5, the tests of `fitMessages`, `roleMenus` and `renderRoleMenus` (130 roles, numbered names, emoji, 30 menus).

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
src/db/migrations/2026_10_13_008_self_role_groups.ts  (create, task 1)
src/db/repositories/self-role-repository.db.test.ts  (create, task 1)
src/db/repositories/self-role-repository.ts  (create, task 1)
src/discord/role-permissions.test.ts  (create, task 1)
src/discord/role-permissions.ts  (create, task 1)
src/domain/roles/self-role-edits.test.ts  (create, task 1)
src/domain/roles/self-role-edits.ts  (create, task 1)
src/domain/roles/self-roles.test.ts  (create, task 1)
src/domain/roles/self-roles.ts  (create, task 1)
test/support/self-roles.ts  (create, task 1)
src/discord/role-gateway.ts  (create, task 2)
src/services/self-role-service.test.ts  (create, task 2)
src/services/self-role-service.ts  (create, task 2)
test/support/roles.ts  (create, task 2)
src/commands/admin/self-roles.test.ts  (create, task 3)
src/commands/admin/self-roles.ts  (create, task 3)
src/commands/roles/shared.ts  (create, task 3)
src/commands/roles/words.ts  (create, task 3)
src/commands/roles/iam.test.ts  (create, task 4)
src/commands/roles/iam.ts  (create, task 4)
src/commands/roles/menus.test.ts  (create, task 5)
src/commands/roles/menus.ts  (create, task 5)
src/domain/roles/menus.test.ts  (create, task 5)
src/domain/roles/menus.ts  (create, task 5)
src/render/role-menus.test.ts  (create, task 5)
src/render/role-menus.ts  (create, task 5)
```

---

### Task 1: Self-assigned roles: the Discord role of a row, groups, and the rules

**Files:**
- Create: `src/db/migrations/2026_10_13_008_self_role_groups.ts`, `src/db/repositories/self-role-repository.db.test.ts`, `src/db/repositories/self-role-repository.ts`, `src/discord/role-permissions.test.ts`, `src/discord/role-permissions.ts`, `src/domain/roles/self-role-edits.test.ts`, `src/domain/roles/self-role-edits.ts`, `src/domain/roles/self-roles.test.ts`, `src/domain/roles/self-roles.ts`, `test/support/self-roles.ts`
- Modify: `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`, `src/db/types.ts`

**Interfaces:**
- Consumes: The legacy tables `Role` and `Alias`; the migrations of `src/db/migrations/` (the newest is `2026_10_12_007`); `inTransaction`; `GuildRepository`; `PermissionFlagsBits` of discord.js.
- Produces: The migration `2026_10_13_008_self_role_groups` (`Role.roleSnowflake`, `Role.groupId`, the table `RoleGroup`) and the regenerated `src/db/types.ts`; `src/discord/role-permissions.ts` (`MODERATION_PERMISSIONS`, `addedModeration(role, everyone)`); `src/domain/roles/self-roles.ts` (pure): `roleProblem`, `offerProblem`, `buildRoster` (the rows of a server resolved against its roles, with what must be written back), `findEntry`, `suggestEntries`, `planChange` (what a request gives and takes), `sameName`, `byRoleName`; `src/domain/roles/self-role-edits.ts`: `parseAliases`, `planSaveRole`, `planSaveGroup`; `SelfRoleRepository` behind `SelfRoleStorage` (`list`, `remember`, `saveRole`, `removeRole`, `saveGroup`, `removeGroup`); `MemorySelfRoles` in `test/support/self-roles.ts`.

`src/db/types.ts` is generated: apply its diff as written. `migrator.db.test.ts` changes (the new foreign key on a legacy table is listed in `ADDED_FOREIGN_KEYS`; a half-way test for the migration) and `self-role-repository.db.test.ts` is new. Nothing uses any of it yet.

Reference commit of the prototype for this task: `40304aa`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -30,6 +30,7 @@ const ADDED_TABLES = [
   'PartyAccessGrant',
   'NewTrainNotification',
   'UnownWantGift',
+  'RoleGroup',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -37,9 +38,17 @@ const ADDED_COLUMNS = [
   'Region.summaryMessageId',
   'PokemonNotification.form',
   'PokemonNotification.shadow',
+  'Role.roleSnowflake',
+  'Role.groupId',
 ];
 /** The indexes it adds to tables of the legacy bot, as `Table.index`. */
-const ADDED_INDEXES = ['Region.region_forumchannelid_unique'];
+const ADDED_INDEXES = [
+  'Region.region_forumchannelid_unique',
+  'Role.role_guildid_rolesnowflake_unique',
+  'Role.role_groupid_foreign',
+];
+/** The foreign keys it adds to tables of the legacy bot, as `Table.constraint`. */
+const ADDED_FOREIGN_KEYS = ['Role.role_groupid_foreign'];
 
 /**
  * Everything about the Pine tables that a new install must reproduce exactly. `except` leaves
@@ -50,6 +59,7 @@ async function describeSchema(
   except: readonly string[] = [],
   exceptColumns: readonly string[] = [],
   exceptIndexes: readonly string[] = [],
+  exceptForeignKeys: readonly string[] = [],
 ) {
   const kept = <Row extends { t: string }>(rows: Row[]): Row[] =>
     rows.filter((row) => !except.includes(row.t));
@@ -61,7 +71,9 @@ async function describeSchema(
     indexes: kept(described.indexes).filter(
       (row) => !exceptIndexes.includes(`${row.t}.${String(row.i)}`),
     ),
-    foreignKeys: kept(described.foreignKeys),
+    foreignKeys: kept(described.foreignKeys).filter(
+      (row) => !exceptForeignKeys.includes(`${row.t}.${String(row.name)}`),
+    ),
   };
 }
 
@@ -114,10 +126,17 @@ describe('runMigrations', () => {
       '2026_10_12_005_pokemon_notification_form',
       '2026_10_12_006_new_train_notifications',
       '2026_10_12_007_unown_want_gifts',
+      '2026_10_13_008_self_role_groups',
     ]);
-    expect(await describeSchema(database, ADDED_TABLES, ADDED_COLUMNS, ADDED_INDEXES)).toEqual(
-      before,
-    );
+    expect(
+      await describeSchema(
+        database,
+        ADDED_TABLES,
+        ADDED_COLUMNS,
+        ADDED_INDEXES,
+        ADDED_FOREIGN_KEYS,
+      ),
+    ).toEqual(before);
     const columns = await database.query<{
       name: string;
       type: string;
@@ -174,6 +193,22 @@ describe('runMigrations', () => {
     expect(await describeSchema(database)).toEqual(complete);
   });
 
+  it('finishes the migration of the self-assigned roles if it failed half-way', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await migrate(database);
+    const complete = await describeSchema(database);
+    // What a failure after the first added column leaves behind: the table of groups and the
+    // role's id, but no group of a role, no unique key and no link to the groups.
+    await database.query('alter table Role drop foreign key role_groupid_foreign');
+    await database.query('alter table Role drop column groupId');
+    await database.query('alter table Role drop index role_guildid_rolesnowflake_unique');
+    await database.query(
+      "delete from kysely_migration where name >= '2026_10_13_008_self_role_groups'",
+    );
+    await expect(migrate(database)).resolves.toBeUndefined();
+    expect(await describeSchema(database)).toEqual(complete);
+  });
+
   it('lets the legacy bot delete a gym, a region or a guild that a party refers to', async () => {
     database = await startDatabase({ legacySchema: true });
     await migrate(database);
```

Create `src/db/repositories/self-role-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemorySelfRoles } from '../../../test/support/self-roles.js';
import type { DB } from '../types.js';
import { GuildRepository } from './guild-repository.js';
import {
  isDuplicateEntry,
  SelfRoleRepository,
  type SelfRoleStorage,
} from './self-role-repository.js';

const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const NEW_SERVER = '412345678901234569';
const NORTH = '510000000000000001';
const SOUTH = '510000000000000002';
const WEST = '510000000000000003';

describe('SelfRoleRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let roles: SelfRoleRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    roles = new SelfRoleRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  /** A row as the legacy bot wrote it: its columns only, the alias in lower case. */
  async function legacyRow(name: string, description: string | null, aliases: string[] = []) {
    const inserted = await sql`
      insert into Role (roleName, roleDescription, guildId) values (${name}, ${description}, 1)
    `.execute(db);
    const id = Number(inserted.insertId);
    for (const alias of aliases) {
      await sql`insert into Alias (aliasName, roleId) values (${alias}, ${id})`.execute(db);
    }
    return id;
  }

  const storedRoles = () =>
    db
      .selectFrom('Role')
      .select(['roleName', 'roleDescription', 'roleSnowflake', 'groupId', 'guildId'])
      .orderBy('id')
      .execute();

  it('reads what the legacy bot wrote: no id of a Discord role, no group', async () => {
    const id = await legacyRow('North', 'The north side', ['n', 'north side']);
    await legacyRow('Bare', '');
    expect(await roles.list(HOME)).toEqual({
      rows: [
        {
          id,
          name: 'North',
          description: 'The north side',
          roleId: null,
          groupId: null,
          aliases: ['n', 'north side'],
        },
        { id: id + 1, name: 'Bare', description: null, roleId: null, groupId: null, aliases: [] },
      ],
      groups: [],
    });
    expect(await roles.list(AWAY)).toEqual({ rows: [], groups: [] });
    expect(await roles.list('499999999999999999')).toEqual({ rows: [], groups: [] });
  });

  it('adds a role with its id, description, aliases and group, in columns the legacy bot reads', async () => {
    const group = await roles.saveGroup(HOME, { name: 'Regions' });
    if (group.kind === 'refused') throw new Error('refused');
    const saved = await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'North' },
      description: 'The north side',
      aliases: ['n', 'north side'],
      groupId: group.group.id,
    });
    expect(saved).toMatchObject({ kind: 'added', row: { name: 'North', roleId: NORTH } });
    expect(await storedRoles()).toEqual([
      {
        roleName: 'North',
        roleDescription: 'The north side',
        roleSnowflake: NORTH,
        groupId: group.group.id,
        guildId: 1,
      },
    ]);
    const aliases = await db.selectFrom('Alias').select('aliasName').orderBy('id').execute();
    expect(aliases.map((alias) => alias.aliasName)).toEqual(['n', 'north side']);
  });

  it('changes a row it finds by the id, and keeps the rows of aliases that stay', async () => {
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, aliases: ['n', 'up'] });
    const before = await db.selectFrom('Alias').select(['id', 'aliasName']).orderBy('id').execute();
    const saved = await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'Northside' },
      description: 'Renamed',
      aliases: ['top', 'n'],
    });
    expect(saved).toMatchObject({
      kind: 'changed',
      row: { name: 'Northside', description: 'Renamed', aliases: ['top', 'n'] },
    });
    const after = await db.selectFrom('Alias').select(['id', 'aliasName']).orderBy('id').execute();
    expect(after.map((alias) => alias.aliasName)).toEqual(['n', 'top']);
    expect(after[0]?.id).toBe(before[0]?.id);
    expect((await roles.list(HOME)).rows).toHaveLength(1);

    // What is not said stays.
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'Northside' } });
    expect((await roles.list(HOME)).rows[0]).toMatchObject({
      description: 'Renamed',
      aliases: ['n', 'top'],
    });
  });

  it('takes over a legacy row of the same name instead of making a second one', async () => {
    const id = await legacyRow('north', 'Old words', ['n']);
    const saved = await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' } });
    expect(saved).toMatchObject({ kind: 'changed', row: { id, roleId: NORTH, aliases: ['n'] } });
    expect(await storedRoles()).toEqual([
      {
        roleName: 'North',
        roleDescription: 'Old words',
        roleSnowflake: NORTH,
        groupId: null,
        guildId: 1,
      },
    ]);
  });

  it('refuses names and aliases that another row of the server has, and only of that server', async () => {
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, aliases: ['n'] });
    expect(await roles.saveRole(HOME, { role: { id: SOUTH, name: 'north' } })).toEqual({
      kind: 'refused',
      reason: 'name-taken',
      other: 'North',
    });
    expect(await roles.saveRole(HOME, { role: { id: SOUTH, name: 'N' } })).toEqual({
      kind: 'refused',
      reason: 'name-is-alias',
      other: 'North',
    });
    expect(
      await roles.saveRole(HOME, { role: { id: SOUTH, name: 'South' }, aliases: ['n'] }),
    ).toEqual({ kind: 'refused', reason: 'alias-taken', alias: 'n', other: 'North' });
    expect((await roles.list(HOME)).rows).toHaveLength(1);
    expect(
      await roles.saveRole(AWAY, { role: { id: SOUTH, name: 'North' }, aliases: ['n'] }),
    ).toMatchObject({ kind: 'added' });
  });

  it('recognises the duplicate key the database answers with, and nothing else as one', async () => {
    await legacyRow('North', null);
    const duplicate = await legacyRow('north', null).catch((error: unknown) => error);
    expect(isDuplicateEntry(duplicate)).toBe(true);
    // Another refusal of the database: a role of a server that does not exist.
    const other = await sql`insert into Role (roleName, guildId) values ('East', 99)`
      .execute(db)
      .catch((error: unknown) => error);
    expect(other).toBeInstanceOf(Error);
    expect(isDuplicateEntry(other)).toBe(false);
    expect(isDuplicateEntry(undefined)).toBe(false);
  });

  it('makes whoever adds a role without its lock wait, so that the check sees every row', async () => {
    // The legacy bot adds a role and has not committed yet. Its insert holds the server's
    // `Guild` row through the foreign key, so the save waits for it instead of checking the
    // names without that row: it finds the row and takes it over, as for any legacy row.
    const legacy = await db.startTransaction().execute();
    let committed = false;
    try {
      await sql`insert into Role (roleName, guildId) values ('North', 1)`.execute(legacy);
      const saving = roles
        .saveRole(HOME, { role: { id: NORTH, name: 'North' } })
        .then((saved) => ({ saved, afterCommit: committed }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      committed = true;
      await legacy.commit().execute();
      const { saved, afterCommit } = await saving;
      expect(afterCommit).toBe(true);
      expect(saved.kind).toBe('changed');
    } finally {
      if (!legacy.isCommitted) await legacy.rollback().execute();
    }
    expect((await storedRoles()).map((row) => [row.roleName, row.roleSnowflake])).toEqual([
      ['North', NORTH],
    ]);
  });

  it('makes one row when the same role is added many times at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        roles.saveRole(NEW_SERVER, { role: { id: NORTH, name: 'North' }, aliases: ['n'] }),
      ),
    );
    expect(results.filter((result) => result.kind === 'added')).toHaveLength(1);
    expect(results.filter((result) => result.kind === 'changed')).toHaveLength(7);
    const { rows } = await roles.list(NEW_SERVER);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.aliases).toEqual(['n']);
  });

  it('remembers the id of a legacy row once, and a new name unless it is taken', async () => {
    const north = await legacyRow('North', null);
    const south = await legacyRow('South', null);
    // It answers how many rows it changed.
    expect(
      await roles.remember(HOME, {
        links: [
          { rowId: north, roleId: NORTH },
          { rowId: south, roleId: SOUTH },
        ],
        renames: [],
      }),
    ).toBe(2);
    const second = {
      // Neither a second id for a row nor one role for two rows.
      links: [
        { rowId: north, roleId: WEST },
        { rowId: south, roleId: NORTH },
      ],
      renames: [
        { rowId: north, name: 'south' },
        { rowId: south, name: 'Southside' },
      ],
    };
    expect(await roles.remember(HOME, second)).toBe(1);
    // A name the row has already is not a write.
    expect(
      await roles.remember(HOME, { links: [], renames: [{ rowId: south, name: 'Southside' }] }),
    ).toBe(0);
    // Rows of another server are not touched by a write that names them.
    expect(
      await roles.remember(AWAY, { links: [], renames: [{ rowId: north, name: 'Hijacked' }] }),
    ).toBe(0);
    expect((await storedRoles()).map((row) => [row.roleName, row.roleSnowflake])).toEqual([
      ['North', NORTH],
      ['Southside', SOUTH],
    ]);
  });

  it('refuses a link to a role that another row of the server got meanwhile', async () => {
    const legacy = await legacyRow('Old', null);
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' } });
    await roles.remember(HOME, { links: [{ rowId: legacy, roleId: NORTH }], renames: [] });
    expect((await storedRoles()).map((row) => row.roleSnowflake)).toEqual([null, NORTH]);
  });

  it('removes a row with its aliases, of its own server only', async () => {
    const saved = await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'North' },
      aliases: ['n'],
    });
    if (saved.kind === 'refused') throw new Error('refused');
    expect(await roles.removeRole(AWAY, saved.row.id)).toBeUndefined();
    expect(await roles.removeRole('499999999999999999', saved.row.id)).toBeUndefined();
    expect(await roles.removeRole(HOME, saved.row.id)).toMatchObject({ name: 'North' });
    expect(await roles.removeRole(HOME, saved.row.id)).toBeUndefined();
    expect(await storedRoles()).toEqual([]);
    expect(await db.selectFrom('Alias').select('id').execute()).toEqual([]);
  });

  it('keeps the groups of a server in places 1 to their number', async () => {
    const names = async () => (await roles.list(HOME)).groups.map((g) => [g.name, g.position]);
    await roles.saveGroup(HOME, { name: 'Regions' });
    await roles.saveGroup(HOME, { name: 'Teams', pickOne: true });
    expect(await roles.saveGroup(HOME, { name: 'Hobbies', position: 1 })).toMatchObject({
      kind: 'added',
      group: { name: 'Hobbies', position: 1, pickOne: false },
    });
    expect(await names()).toEqual([
      ['Hobbies', 1],
      ['Regions', 2],
      ['Teams', 3],
    ]);
    expect(
      await roles.saveGroup(HOME, { name: 'hobbies', newName: 'Play', position: 3 }),
    ).toMatchObject({ kind: 'changed', group: { name: 'Play', position: 3 } });
    expect(await names()).toEqual([
      ['Regions', 1],
      ['Teams', 2],
      ['Play', 3],
    ]);
    expect(await roles.saveGroup(HOME, { name: 'Other' })).toEqual({
      kind: 'refused',
      reason: 'reserved-name',
    });
    expect((await roles.list(HOME)).groups[1]).toMatchObject({ name: 'Teams', pickOne: true });
    // Another server has its own groups, also of the same name.
    expect(await roles.saveGroup(AWAY, { name: 'Regions' })).toMatchObject({
      kind: 'added',
      group: { position: 1 },
    });
  });

  it('removes a group, whose roles are without one from then on', async () => {
    const regions = await roles.saveGroup(HOME, { name: 'Regions' });
    const teams = await roles.saveGroup(HOME, { name: 'Teams' });
    if (regions.kind === 'refused' || teams.kind === 'refused') throw new Error('refused');
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, groupId: regions.group.id });
    await roles.saveRole(HOME, { role: { id: SOUTH, name: 'South' }, groupId: regions.group.id });
    await roles.saveRole(HOME, { role: { id: WEST, name: 'Valor' }, groupId: teams.group.id });
    expect(await roles.removeGroup(AWAY, regions.group.id)).toBeUndefined();
    expect(await roles.removeGroup(HOME, regions.group.id)).toEqual({
      group: regions.group,
      roles: 2,
    });
    expect(await roles.removeGroup(HOME, regions.group.id)).toBeUndefined();
    const { rows, groups } = await roles.list(HOME);
    expect(rows.map((row) => row.groupId)).toEqual([null, null, teams.group.id]);
    expect(groups).toEqual([{ ...teams.group, position: 1 }]);
  });

  it('refuses a group of another server for a role', async () => {
    const away = await roles.saveGroup(AWAY, { name: 'Regions' });
    if (away.kind === 'refused') throw new Error('refused');
    expect(
      await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, groupId: away.group.id }),
    ).toEqual({ kind: 'refused', reason: 'no-group' });
  });

  it('loses its rows and groups with the server', async () => {
    const group = await roles.saveGroup(HOME, { name: 'Regions' });
    if (group.kind === 'refused') throw new Error('refused');
    await roles.saveRole(HOME, {
      role: { id: NORTH, name: 'North' },
      aliases: ['n'],
      groupId: group.group.id,
    });
    await new GuildRepository(db).remove(HOME);
    expect(await storedRoles()).toEqual([]);
    expect(await db.selectFrom('RoleGroup').select('id').execute()).toEqual([]);
    expect(await db.selectFrom('Alias').select('id').execute()).toEqual([]);
  });

  it('lets the legacy bot keep working on the same rows', async () => {
    await roles.saveRole(HOME, { role: { id: NORTH, name: 'North' }, aliases: ['n'] });
    // As the legacy bot finds a role: by name, without case, in its server.
    const found = await sql<{ id: number }>`
      select Role.id from Role inner join Guild on Guild.id = Role.guildId
      where roleName = 'NORTH' and Guild.snowflake = ${HOME}`.execute(db);
    expect(found.rows).toHaveLength(1);
    // And as it adds one of its own, naming only its columns.
    await legacyRow('South', 'by the legacy bot', ['s']);
    expect((await roles.list(HOME)).rows.map((row) => [row.name, row.roleId])).toEqual([
      ['North', NORTH],
      ['South', null],
    ]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemorySelfRoles();
    const script = async (storage: SelfRoleStorage) => {
      const steps: unknown[] = [];
      const group = async (input: Parameters<SelfRoleStorage['saveGroup']>[1]) => {
        const saved = await storage.saveGroup(HOME, input);
        steps.push(saved.kind === 'refused' ? saved : [saved.kind, saved.group.name]);
        return saved.kind === 'refused' ? -1 : saved.group.id;
      };
      const role = async (input: Parameters<SelfRoleStorage['saveRole']>[1]) => {
        const saved = await storage.saveRole(HOME, input);
        steps.push(
          saved.kind === 'refused'
            ? saved
            : [saved.kind, { ...saved.row, id: 0, groupId: saved.row.groupId !== null }],
        );
        return saved.kind === 'refused' ? -1 : saved.row.id;
      };
      /** Ids differ between the two; everything else must not. */
      const state = async () => {
        const { rows, groups } = await storage.list(HOME);
        const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name ?? null;
        steps.push({
          rows: rows.map(({ id: _id, groupId, ...row }) => ({ ...row, group: groupName(groupId) })),
          groups: groups.map(({ id: _id, ...g }) => g),
        });
      };
      const regions = await group({ name: 'Regions' });
      const teams = await group({ name: 'Teams', pickOne: true, position: 1 });
      await group({ name: 'none' });
      await group({ name: 'regions', newName: 'teams' });
      const north = await role({
        role: { id: NORTH, name: 'North' },
        description: 'Up',
        aliases: ['n'],
        groupId: regions,
      });
      await role({ role: { id: SOUTH, name: 'South' }, aliases: ['n'] });
      await role({ role: { id: SOUTH, name: 'South' }, aliases: ['s'], groupId: teams });
      await role({ role: { id: NORTH, name: 'Northside' }, aliases: [], description: null });
      await role({ role: { id: WEST, name: 'West' }, groupId: 999_999 });
      await state();
      await storage.remember(HOME, {
        links: [{ rowId: north, roleId: WEST }],
        renames: [
          { rowId: north, name: 'south' },
          { rowId: north, name: 'Upper' },
        ],
      });
      steps.push(await storage.removeGroup(HOME, 999_999));
      const removed = await storage.removeGroup(HOME, teams);
      steps.push(removed && { name: removed.group.name, roles: removed.roles });
      await state();
      const gone = await storage.removeRole(HOME, north);
      steps.push(gone && { ...gone, id: 0, groupId: 0 });
      steps.push(await storage.removeRole(HOME, north));
      await state();
      return steps;
    };
    expect(await script(roles)).toEqual(await script(memory));
  });
});
```

Create `src/discord/role-permissions.test.ts`:

```ts
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  addedModeration,
  MODERATION_PERMISSIONS,
  moderationPermissions,
} from './role-permissions.js';

describe('moderationPermissions', () => {
  it('finds nothing in what an ordinary member may do', () => {
    const ordinary =
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.SendMessagesInThreads |
      PermissionFlagsBits.CreatePublicThreads |
      PermissionFlagsBits.EmbedLinks |
      PermissionFlagsBits.AttachFiles |
      PermissionFlagsBits.AddReactions |
      PermissionFlagsBits.UseExternalEmojis |
      PermissionFlagsBits.ReadMessageHistory |
      PermissionFlagsBits.UseApplicationCommands |
      PermissionFlagsBits.Connect |
      PermissionFlagsBits.Speak |
      PermissionFlagsBits.ChangeNickname |
      PermissionFlagsBits.CreateInstantInvite;
    expect(moderationPermissions(ordinary)).toEqual([]);
    expect(moderationPermissions(0n)).toEqual([]);
  });

  it('names each permission of moderation a role grants', () => {
    expect(
      moderationPermissions(
        PermissionFlagsBits.SendMessages |
          PermissionFlagsBits.ModerateMembers |
          PermissionFlagsBits.KickMembers,
      ),
    ).toEqual(['Kick Members', 'Timeout Members']);
    expect(moderationPermissions(PermissionFlagsBits.Administrator)).toEqual(['Administrator']);
  });

  it.each([
    'Administrator',
    'ManageGuild',
    'ManageRoles',
    'ManageChannels',
    'ManageThreads',
    'ManageMessages',
    'ManageNicknames',
    'ManageWebhooks',
    'ManageGuildExpressions',
    'ManageEvents',
    'KickMembers',
    'BanMembers',
    'ModerateMembers',
    'MentionEveryone',
    'ViewAuditLog',
    'MuteMembers',
    'DeafenMembers',
    'MoveMembers',
    'PrioritySpeaker',
    'ViewGuildInsights',
    'ViewCreatorMonetizationAnalytics',
    'PinMessages',
    'BypassSlowmode',
  ] as const)('counts %s as moderation', (flag) => {
    expect(moderationPermissions(PermissionFlagsBits[flag])).toHaveLength(1);
  });

  it('has every permission with a single bit, each once', () => {
    const flags = MODERATION_PERMISSIONS.map(([flag]) => flag);
    expect(new Set(flags).size).toBe(flags.length);
    for (const flag of flags) expect(flag & (flag - 1n)).toBe(0n);
    // Everything a server could grant at once contains them all.
    expect(moderationPermissions(PermissionsBitField.All)).toHaveLength(flags.length);
  });

  /**
   * What a self-assigned role may grant. Whoever adds a name here has decided that anybody may
   * give themself a role with that permission.
   */
  const HARMLESS = [
    'CreateInstantInvite',
    'AddReactions',
    'Stream',
    'ViewChannel',
    'SendMessages',
    'SendTTSMessages',
    'EmbedLinks',
    'AttachFiles',
    'ReadMessageHistory',
    'UseExternalEmojis',
    'Connect',
    'Speak',
    'UseVAD',
    'ChangeNickname',
    'UseApplicationCommands',
    'RequestToSpeak',
    'CreatePublicThreads',
    'CreatePrivateThreads',
    'UseExternalStickers',
    'SendMessagesInThreads',
    'UseEmbeddedActivities',
    'UseSoundboard',
    'CreateGuildExpressions',
    'CreateEvents',
    'UseExternalSounds',
    'SendVoiceMessages',
    'SetVoiceChannelStatus',
    'SendPolls',
    'UseExternalApps',
  ] as const satisfies readonly (keyof typeof PermissionFlagsBits)[];

  it('sorts every permission discord.js knows into moderation or harmless, and none into both', () => {
    const harmless = new Set<bigint>(HARMLESS.map((name) => PermissionFlagsBits[name]));
    const moderation = new Set(MODERATION_PERMISSIONS.map(([flag]) => flag));
    const unsorted = Object.entries(PermissionFlagsBits)
      .filter(([, flag]) => !harmless.has(flag) && !moderation.has(flag))
      .map(([name]) => name);
    // A name here is a permission a newer discord.js brought: decide which list it belongs in.
    expect(unsorted).toEqual([]);
    expect([...harmless].filter((flag) => moderation.has(flag))).toEqual([]);
    for (const name of HARMLESS)
      expect(moderationPermissions(PermissionFlagsBits[name])).toEqual([]);
  });
});

describe('addedModeration', () => {
  const { MentionEveryone, KickMembers, SendMessages, Administrator } = PermissionFlagsBits;

  it('is what a role grants of moderation beyond what every member has', () => {
    const everyone = SendMessages | MentionEveryone;
    // A role as Discord makes it: with the permissions of @everyone.
    expect(addedModeration(everyone, everyone)).toEqual([]);
    expect(addedModeration(everyone | KickMembers, everyone)).toEqual(['Kick Members']);
    expect(addedModeration(MentionEveryone, SendMessages)).toEqual([
      'Mention @everyone, @here and All Roles',
    ]);
    expect(addedModeration(0n, everyone)).toEqual([]);
    expect(addedModeration(Administrator, 0n)).toEqual(['Administrator']);
  });
});
```

Create `src/domain/roles/self-role-edits.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isNoGroupWord, parseAliases, planSaveGroup, planSaveRole } from './self-role-edits.js';
import { MAX_GROUPS, type SelfRoleGroup, type SelfRoleRow } from './self-roles.js';

function row(id: number, name: string, more: Partial<SelfRoleRow> = {}): SelfRoleRow {
  return { id, name, description: null, roleId: null, groupId: null, aliases: [], ...more };
}

const group = (id: number, name: string, position: number, pickOne = false): SelfRoleGroup => ({
  id,
  name,
  position,
  pickOne,
});

describe('parseAliases', () => {
  it('reads a comma-separated list: lower case, each once, no empty ones', () => {
    expect(parseAliases(' N,  North  Side ,n,, NORTH side')).toEqual({
      ok: true,
      aliases: ['n', 'north side'],
    });
    expect(parseAliases('  ')).toEqual({ ok: true, aliases: [] });
  });

  it('refuses an alias longer than the column and more aliases than a role may have', () => {
    const long = 'a'.repeat(51);
    expect(parseAliases(`ok, ${long}`)).toEqual({
      ok: false,
      reason: 'alias-too-long',
      alias: long,
    });
    const many = Array.from({ length: 11 }, (_unused, n) => `alias${String(n)}`).join(',');
    expect(parseAliases(many)).toEqual({ ok: false, reason: 'too-many-aliases', count: 11 });
  });
});

describe('planSaveRole', () => {
  const rows = [
    row(1, 'North', { roleId: '101', description: 'The north', aliases: ['n'], groupId: 1 }),
    row(2, 'South', { roleId: '102', aliases: ['s', 'downtown'] }),
    row(3, 'Legacy'),
  ];
  const groups = [group(1, 'Regions', 1)];

  it('makes a new row with what was said, and nothing else', () => {
    expect(planSaveRole(rows, groups, { role: { id: '103', name: 'West' } })).toEqual({
      ok: true,
      rowId: undefined,
      values: { roleId: '103', name: 'West', description: null, aliases: [], groupId: null },
    });
    expect(
      planSaveRole(rows, groups, {
        role: { id: '103', name: 'West' },
        description: '  The   west side ',
        aliases: ['w', 'west'],
        groupId: 1,
      }),
    ).toEqual({
      ok: true,
      rowId: undefined,
      // An alias that is the role's own name says nothing.
      values: {
        roleId: '103',
        name: 'West',
        description: 'The west side',
        aliases: ['w'],
        groupId: 1,
      },
    });
  });

  it('changes only the parts that were said of a row that exists', () => {
    expect(planSaveRole(rows, groups, { role: { id: '101', name: 'North' } })).toEqual({
      ok: true,
      rowId: 1,
      values: {
        roleId: '101',
        name: 'North',
        description: 'The north',
        aliases: ['n'],
        groupId: 1,
      },
    });
    expect(
      planSaveRole(rows, groups, {
        role: { id: '101', name: 'Northside' },
        description: null,
        aliases: [],
        groupId: null,
      }),
    ).toEqual({
      ok: true,
      rowId: 1,
      values: { roleId: '101', name: 'Northside', description: null, aliases: [], groupId: null },
    });
  });

  it('takes over a legacy row of the same name, which gets the id', () => {
    const plan = planSaveRole(rows, groups, { role: { id: '300', name: 'legacy' } });
    expect(plan).toMatchObject({ ok: true, rowId: 3, values: { roleId: '300', name: 'legacy' } });
  });

  it('refuses a name another row has, as its name or as an alias', () => {
    expect(planSaveRole(rows, groups, { role: { id: '104', name: 'south' } })).toEqual({
      ok: false,
      reason: 'name-taken',
      other: 'South',
    });
    expect(planSaveRole(rows, groups, { role: { id: '104', name: 'Downtown' } })).toEqual({
      ok: false,
      reason: 'name-is-alias',
      other: 'South',
    });
    // A row that has the id keeps its own name.
    expect(planSaveRole(rows, groups, { role: { id: '102', name: 'SOUTH' } })).toMatchObject({
      ok: true,
      rowId: 2,
    });
  });

  it('refuses an alias that is the name or an alias of another row, not its own', () => {
    const save = (aliases: string[]) =>
      planSaveRole(rows, groups, { role: { id: '101', name: 'North' }, aliases });
    expect(save(['up', 'south'])).toEqual({
      ok: false,
      reason: 'alias-taken',
      alias: 'south',
      other: 'South',
    });
    expect(save(['S'])).toEqual({ ok: false, reason: 'alias-taken', alias: 'S', other: 'South' });
    expect(save(['n', 'up'])).toMatchObject({ ok: true, values: { aliases: ['n', 'up'] } });
  });

  it('refuses a name or a description that does not fit the columns, and an unknown group', () => {
    expect(planSaveRole(rows, groups, { role: { id: '9', name: 'x'.repeat(51) } })).toEqual({
      ok: false,
      reason: 'name-too-long',
    });
    expect(
      planSaveRole(rows, groups, { role: { id: '9', name: 'New' }, description: 'd'.repeat(151) }),
    ).toEqual({ ok: false, reason: 'description-too-long' });
    expect(planSaveRole(rows, groups, { role: { id: '9', name: 'New' }, groupId: 7 })).toEqual({
      ok: false,
      reason: 'no-group',
    });
  });
});

describe('planSaveGroup', () => {
  const groups = [group(1, 'Regions', 1), group(2, 'Teams', 2, true), group(3, 'Hobbies', 3)];

  it('puts a new group at the end, or where it was asked to be', () => {
    expect(planSaveGroup(groups, { name: ' Play  styles ' })).toEqual({
      ok: true,
      id: undefined,
      name: 'Play styles',
      pickOne: false,
      order: [1, 2, 3, null],
    });
    expect(planSaveGroup(groups, { name: 'First', pickOne: true, position: 1 })).toMatchObject({
      pickOne: true,
      order: [null, 1, 2, 3],
    });
    expect(planSaveGroup(groups, { name: 'Far', position: 99 })).toMatchObject({
      order: [1, 2, 3, null],
    });
    expect(planSaveGroup([], { name: 'Only', position: 0 })).toMatchObject({ order: [null] });
  });

  it('changes a group that exists, found without case, and leaves alone what was not said', () => {
    expect(planSaveGroup(groups, { name: 'teams' })).toEqual({
      ok: true,
      id: 2,
      name: 'Teams',
      pickOne: true,
      order: [1, 2, 3],
    });
    expect(planSaveGroup(groups, { name: 'Teams', pickOne: false, position: 3 })).toEqual({
      ok: true,
      id: 2,
      name: 'Teams',
      pickOne: false,
      order: [1, 3, 2],
    });
    expect(planSaveGroup(groups, { name: 'hobbies', position: 1 })).toMatchObject({
      order: [3, 1, 2],
    });
  });

  it('renames a group, unless the name is taken', () => {
    expect(planSaveGroup(groups, { name: 'teams', newName: 'Team' })).toMatchObject({
      ok: true,
      id: 2,
      name: 'Team',
    });
    // Its own name in another spelling is a rename, not a clash.
    expect(planSaveGroup(groups, { name: 'teams', newName: 'TEAMS' })).toMatchObject({
      ok: true,
      name: 'TEAMS',
    });
    expect(planSaveGroup(groups, { name: 'teams', newName: 'regions' })).toEqual({
      ok: false,
      reason: 'name-taken',
    });
    expect(planSaveGroup(groups, { name: 'Nothing', newName: 'Something' })).toEqual({
      ok: false,
      reason: 'no-group',
    });
  });

  it('refuses names that say nothing, are too long or mean "no group"', () => {
    expect(planSaveGroup(groups, { name: '  ' })).toEqual({ ok: false, reason: 'name-empty' });
    expect(planSaveGroup(groups, { name: 'x'.repeat(51) })).toEqual({
      ok: false,
      reason: 'name-too-long',
    });
    for (const name of ['Other', 'none']) {
      expect(planSaveGroup(groups, { name })).toEqual({ ok: false, reason: 'reserved-name' });
      expect(planSaveGroup(groups, { name: 'Teams', newName: name })).toEqual({
        ok: false,
        reason: 'reserved-name',
      });
    }
    expect(isNoGroupWord(' OTHER ')).toBe(true);
    expect(isNoGroupWord('others')).toBe(false);
  });

  it('refuses more groups than a server may have, but still changes one of them', () => {
    const full = Array.from({ length: MAX_GROUPS }, (_unused, n) =>
      group(n + 1, `Group ${String(n + 1)}`, n + 1),
    );
    expect(planSaveGroup(full, { name: 'One more' })).toEqual({ ok: false, reason: 'too-many' });
    expect(planSaveGroup(full, { name: 'Group 3', pickOne: true })).toMatchObject({ ok: true });
  });
});
```

Create `src/domain/roles/self-roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildRoster,
  byRoleName,
  findEntry,
  offerProblem,
  orderedGroups,
  planChange,
  roleProblem,
  sameName,
  suggestEntries,
  type BotStanding,
  type PlannedChange,
  type Roster,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
} from './self-roles.js';

const BOT: BotStanding = { mayManageRoles: true, highestPosition: 50 };
const OWNER = '1000';

const changesAnything = (plan: PlannedChange): boolean =>
  plan.add.length > 0 || plan.remove.length > 0;

function role(id: string, name: string, more: Partial<ServerRole> = {}): ServerRole {
  return { id, name, position: 5, everyone: false, managed: false, moderation: [], ...more };
}

function row(id: number, name: string, more: Partial<SelfRoleRow> = {}): SelfRoleRow {
  return { id, name, description: null, roleId: null, groupId: null, aliases: [], ...more };
}

const REGIONS: SelfRoleGroup = { id: 1, name: 'Regions', position: 1, pickOne: false };
const TEAMS: SelfRoleGroup = { id: 2, name: 'Teams', position: 2, pickOne: true };

describe('sameName', () => {
  it('takes case, accents and the spaces around a name as nothing', () => {
    expect(sameName('North Side', 'north side')).toBe(true);
    expect(sameName(' Café ', 'cafe')).toBe(true);
    expect(sameName('North', 'Northside')).toBe(false);
    expect(sameName('North Side', 'NorthSide')).toBe(false);
  });
});

describe('roleProblem', () => {
  it('lets a harmless role below the bot be handed out', () => {
    expect(roleProblem(role('1', 'North'), BOT)).toBeUndefined();
  });

  it('never hands out @everyone, a managed role or a role of moderation', () => {
    expect(roleProblem(role('1', '@everyone', { everyone: true, position: 0 }), BOT)).toBe(
      'everyone',
    );
    expect(roleProblem(role('1', 'Server Booster', { managed: true }), BOT)).toBe('managed');
    expect(roleProblem(role('1', 'Helper', { moderation: ['Kick Members'] }), BOT)).toBe(
      'moderation',
    );
  });

  it('refuses a role at or above the highest role of the bot', () => {
    expect(roleProblem(role('1', 'High', { position: 50 }), BOT)).toBe('above-bot');
    expect(roleProblem(role('1', 'Higher', { position: 51 }), BOT)).toBe('above-bot');
    expect(roleProblem(role('1', 'Just below', { position: 49 }), BOT)).toBeUndefined();
  });

  it('hands out nothing without Manage Roles, and names what lies in the role first', () => {
    const powerless = { ...BOT, mayManageRoles: false };
    expect(roleProblem(role('1', 'North'), powerless)).toBe('no-manage-roles');
    expect(roleProblem(role('1', 'Mod', { moderation: ['Ban Members'] }), powerless)).toBe(
      'moderation',
    );
  });
});

describe('offerProblem', () => {
  const roles = [
    role('1', '@everyone', { everyone: true, position: 0 }),
    role('10', 'North'),
    role('20', 'Helper', { position: 20 }),
    role('30', 'Moderator', { position: 30 }),
  ];
  const server = { roles, bot: BOT, ownerId: OWNER };
  const north = roles[1] ?? role('10', 'North');
  const helper = roles[2] ?? role('20', 'Helper');

  it('lets the owner of the server offer any role, with or without roles of their own', () => {
    expect(
      offerProblem(helper, server, { id: OWNER, held: [], mayManageRoles: false }),
    ).toBeUndefined();
  });

  it('asks anybody else for Manage Roles first', () => {
    expect(offerProblem(north, server, { id: '7', held: ['30'], mayManageRoles: false })).toBe(
      'no-manage-roles',
    );
  });

  it('asks for a role of their own above the one they offer', () => {
    const staff = (...held: string[]) => ({ id: '7', held, mayManageRoles: true });
    expect(offerProblem(north, server, staff('30'))).toBeUndefined();
    expect(offerProblem(north, server, staff('1', '20', '10'))).toBeUndefined();
    // Level is not above; a role the server does not have counts for nothing; nor does @everyone.
    expect(offerProblem(helper, server, staff('20'))).toBe('not-below');
    expect(offerProblem(helper, server, staff('10', '999'))).toBe('not-below');
    expect(offerProblem(north, server, staff('1'))).toBe('not-below');
    expect(offerProblem(north, server, staff())).toBe('not-below');
  });
});

describe('buildRoster', () => {
  const server = (...roles: ServerRole[]) => ({ roles, bot: BOT, ownerId: OWNER });

  it('takes a row with an id for the role of that id, whatever it is called', () => {
    const { roster, writes } = buildRoster(
      [row(1, 'North', { roleId: '10', groupId: 1 })],
      [REGIONS],
      server(role('10', 'Northside'), role('11', 'North')),
    );
    expect(roster.entries).toHaveLength(1);
    expect(roster.entries[0]).toMatchObject({
      name: 'Northside',
      role: { id: '10' },
      group: REGIONS,
      problem: undefined,
    });
    // The legacy bot finds a role by `roleName`, so the row follows the new name.
    expect(writes).toEqual({ links: [], renames: [{ rowId: 1, name: 'Northside' }] });
  });

  it('does not let a row follow a name another row has, or one too long for the column', () => {
    const long = 'x'.repeat(51);
    const { roster, writes } = buildRoster(
      [
        row(1, 'North', { roleId: '10' }),
        row(2, 'South', { roleId: '11' }),
        row(3, 'West', { roleId: '12' }),
      ],
      [],
      server(role('10', 'SOUTH'), role('11', 'South'), role('12', long)),
    );
    expect(writes.renames).toEqual([]);
    expect(roster.entries.map((entry) => entry.name)).toEqual(['SOUTH', 'South', long]);
  });

  it('lets two rows swap names with their roles only as far as the names stay unique', () => {
    const { writes } = buildRoster(
      [row(1, 'North', { roleId: '10' }), row(2, 'South', { roleId: '11' })],
      [],
      server(role('10', 'South'), role('11', 'East')),
    );
    // Row 1 cannot be South while row 2 still is; row 2 becomes East, and the next look frees South.
    expect(writes.renames).toEqual([{ rowId: 2, name: 'East' }]);
  });

  it('says that the role of a row with an id is gone, and never looks for it by name', () => {
    const { roster, writes } = buildRoster(
      [row(1, 'North', { roleId: '10' })],
      [],
      server(role('99', 'North')),
    );
    expect(roster.entries[0]).toMatchObject({ role: undefined, name: 'North', problem: 'gone' });
    expect(writes).toEqual({ links: [], renames: [] });
  });

  it('finds a legacy row by its name, without case, and remembers the id', () => {
    const { roster, writes } = buildRoster(
      [row(1, 'north side')],
      [],
      server(role('10', 'North Side')),
    );
    expect(roster.entries[0]).toMatchObject({ name: 'North Side', role: { id: '10' } });
    expect(writes).toEqual({
      links: [{ rowId: 1, roleId: '10' }],
      renames: [{ rowId: 1, name: 'North Side' }],
    });
  });

  it('guesses nothing for a legacy row: no role, several roles, or a role another row has', () => {
    const { roster, writes } = buildRoster(
      [
        row(1, 'Gone'),
        row(2, 'Twice'),
        row(3, 'Renamed', { roleId: '30' }),
        row(4, 'Taken'),
        row(5, ''),
        row(6, '@everyone'),
      ],
      [],
      server(
        role('20', 'Twice'),
        role('21', 'twice'),
        role('30', 'Taken'),
        role('40', '', { position: 1 }),
        role('1', '@everyone', { everyone: true, position: 0 }),
      ),
    );
    const problems = Object.fromEntries(
      roster.entries.map((entry) => [entry.row.id, entry.problem]),
    );
    expect(problems).toEqual({
      1: 'gone',
      2: 'ambiguous',
      3: undefined,
      4: 'duplicate',
      5: 'gone',
      6: 'gone',
    });
    expect(roster.entries.filter((entry) => entry.role).map((entry) => entry.row.id)).toEqual([3]);
    expect(writes.links).toEqual([]);
    // Row 3 cannot take the name of row 4.
    expect(writes.renames).toEqual([]);
  });

  it('leaves the roles that rows with an id stand for out of what a legacy row may mean', () => {
    const { roster, writes } = buildRoster(
      [
        row(1, 'Old name', { roleId: '10' }),
        row(2, 'north'),
        row(3, 'Team', { roleId: '20' }),
        row(4, 'team'),
        row(5, 'South', { roleId: '30' }),
        row(6, 'south'),
      ],
      [],
      server(
        // Two roles are called North: one has its row, so the legacy row means the other.
        role('10', 'North'),
        role('11', 'NORTH'),
        // Three are called Team: one has its row, and nothing says which of the others is meant.
        role('20', 'Team'),
        role('21', 'team'),
        role('22', 'TEAM'),
        // The only South has its row.
        role('30', 'South'),
      ),
    );
    const found = Object.fromEntries(
      roster.entries.map((entry) => [entry.row.id, entry.problem ?? entry.role?.id]),
    );
    expect(found).toEqual({ 1: '10', 2: '11', 3: '20', 4: 'ambiguous', 5: '30', 6: 'duplicate' });
    expect(writes.links).toEqual([{ rowId: 2, roleId: '11' }]);
  });

  it('marks what may not be handed out, sorts by name and orders the groups', () => {
    const { roster } = buildRoster(
      [
        row(1, 'Valor', { roleId: '1', groupId: 2 }),
        row(2, 'Mod', { roleId: '2' }),
        row(3, 'alpha', { roleId: '3', groupId: 9 }),
      ],
      [TEAMS, REGIONS],
      server(
        role('1', 'Valor'),
        role('2', 'Mod', { moderation: ['Manage Messages'] }),
        role('3', 'alpha'),
      ),
    );
    expect(roster.groups).toEqual([REGIONS, TEAMS]);
    expect(roster.entries.map((entry) => [entry.name, entry.problem, entry.group?.name])).toEqual([
      ['alpha', undefined, undefined],
      ['Mod', 'moderation', undefined],
      ['Valor', undefined, 'Teams'],
    ]);
  });
});

describe('byRoleName', () => {
  it('orders without case, numbers by their value, and the same name by the id of the row', () => {
    const named = ['Region 10', 'region 2', 'Region 1', 'Zone', 'alpha'].map((name, index) => ({
      name,
      id: index,
    }));
    expect([...named].sort(byRoleName).map((entry) => entry.name)).toEqual([
      'alpha',
      'Region 1',
      'region 2',
      'Region 10',
      'Zone',
    ]);
    const twins = [
      { name: 'Twin', row: { id: 9 } },
      { name: 'twin', row: { id: 3 } },
      { name: 'Twin', row: { id: 4 } },
    ];
    for (const order of [twins, [...twins].reverse(), [twins[1], twins[2], twins[0]]]) {
      expect(
        (order as typeof twins)
          .sort(byRoleName)
          .map((entry) => `${entry.name} ${String(entry.row.id)}`),
      ).toEqual(['Twin 4', 'Twin 9', 'twin 3']);
    }
    expect(byRoleName(twins[0] ?? { name: '' }, twins[0] ?? { name: '' })).toBe(0);
  });
});

describe('orderedGroups', () => {
  it('orders by place, then by name', () => {
    const groups = [
      { id: 1, name: 'b', position: 2, pickOne: false },
      { id: 2, name: 'a', position: 2, pickOne: false },
      { id: 3, name: 'z', position: 1, pickOne: false },
    ];
    expect(orderedGroups(groups).map((group) => group.name)).toEqual(['z', 'a', 'b']);
  });
});

/** A server with regions (any number), teams (one) and a role without a group. */
function sample(change: (roles: ServerRole[]) => ServerRole[] = (roles) => roles, bot = BOT) {
  const rows = [
    row(1, 'North', { roleId: '101', groupId: 1, aliases: ['n', 'north side'] }),
    row(2, 'South', { roleId: '102', groupId: 1 }),
    row(3, 'Instinct', { roleId: '201', groupId: 2 }),
    row(4, 'Mystic', { roleId: '202', groupId: 2 }),
    row(5, 'Valor', { roleId: '203', groupId: 2 }),
    row(6, 'Trader', { roleId: '301' }),
    row(7, 'Lost', { roleId: '999' }),
  ];
  const roles = change([
    role('101', 'North'),
    role('102', 'South'),
    role('201', 'Instinct'),
    role('202', 'Mystic'),
    role('203', 'Valor'),
    role('301', 'Trader'),
    role('900', 'Moderator', { moderation: ['Ban Members'], position: 40 }),
    role('901', 'Admin', { moderation: ['Administrator'], position: 60 }),
  ]);
  return buildRoster(rows, [REGIONS, TEAMS], { roles, bot, ownerId: OWNER }).roster;
}

const names = (entries: readonly { name: string }[]) => entries.map((entry) => entry.name);

describe('findEntry and suggestEntries', () => {
  const roster = sample();

  it('finds a role by its name or an alias, without case', () => {
    expect(findEntry(roster.entries, 'north')?.row.id).toBe(1);
    expect(findEntry(roster.entries, ' N ')?.row.id).toBe(1);
    expect(findEntry(roster.entries, 'NORTH SIDE')?.row.id).toBe(1);
  });

  it('prefers a name to an alias', () => {
    const { roster: both } = buildRoster(
      [row(1, 'North', { roleId: '1', aliases: ['south'] }), row(2, 'South', { roleId: '2' })],
      [],
      { roles: [role('1', 'North'), role('2', 'South')], bot: BOT, ownerId: OWNER },
    );
    expect(findEntry(both.entries, 'south')?.row.id).toBe(2);
  });

  it('prefers an entry that leads to a role, for a name and for an alias', () => {
    const { roster: twins } = buildRoster(
      [
        row(1, 'North', { roleId: '99' }),
        row(2, 'north', { roleId: '1' }),
        row(3, 'Lost', { roleId: '98', aliases: ['s'] }),
        row(4, 'South', { roleId: '2', aliases: ['s'] }),
      ],
      [],
      { roles: [role('1', 'north'), role('2', 'South')], bot: BOT, ownerId: OWNER },
    );
    expect(findEntry(twins.entries, 'North')?.row.id).toBe(2);
    expect(findEntry(twins.entries, 'S')?.row.id).toBe(4);
    // One that leads to none is still found when it is the only one.
    expect(findEntry(twins.entries, 'lost')?.row.id).toBe(3);
  });

  it('finds nothing for a part of a name, and suggests what was probably meant', () => {
    expect(findEntry(roster.entries, 'nor')).toBeUndefined();
    expect(findEntry(roster.entries, '')).toBeUndefined();
    expect(names(suggestEntries(roster.entries, 'nor'))).toEqual(['North']);
    expect(names(suggestEntries(roster.entries, 'mistic'))).toEqual(['Mystic']);
    expect(suggestEntries(roster.entries, 'zzz')).toEqual([]);
  });
});

describe('planChange', () => {
  it('gives roles the member lacks and takes away roles they have', () => {
    const plan = planChange(sample(), new Set(['102']), { give: ['101', '301'], take: ['102'] });
    expect(names(plan.add)).toEqual(['North', 'Trader']);
    expect(names(plan.remove)).toEqual(['South']);
    expect(plan.displaced).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(changesAnything(plan)).toBe(true);
  });

  it('says what was held already and what was not held, and changes nothing for those', () => {
    const plan = planChange(sample(), new Set(['101']), { give: ['101'], take: ['102'] });
    expect(names(plan.already)).toEqual(['North']);
    expect(names(plan.lacking)).toEqual(['South']);
    expect(changesAnything(plan)).toBe(false);
  });

  it('takes the other roles of a pick-one group away with the one that is given', () => {
    const plan = planChange(sample(), new Set(['203', '201', '101']), { give: ['202'], take: [] });
    expect(names(plan.add)).toEqual(['Mystic']);
    expect(names(plan.remove)).toEqual(['Instinct', 'Valor']);
    expect(names(plan.displaced)).toEqual(['Instinct', 'Valor']);
  });

  it('does not take a displaced role away twice when that was asked for as well', () => {
    const plan = planChange(sample(), new Set(['203']), { give: ['202'], take: ['203'] });
    expect(names(plan.remove)).toEqual(['Valor']);
  });

  it('gives none of several roles of a pick-one group that were asked for at once', () => {
    const plan = planChange(sample(), new Set(['203']), { give: ['201', '202', '101'], take: [] });
    expect(names(plan.add)).toEqual(['North']);
    expect(plan.remove).toEqual([]);
    expect(plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['Instinct', 'pick-one'],
      ['Mystic', 'pick-one'],
    ]);
  });

  it('keeps the one that is held when it is asked for together with another of its group', () => {
    const plan = planChange(sample(), new Set(['203']), { give: ['203', '202'], take: [] });
    expect(names(plan.already)).toEqual(['Valor']);
    expect(plan.add).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.skipped.map((skip) => skip.reason)).toEqual(['pick-one']);
  });

  it('gives a role with a problem to nobody', () => {
    const dangerous = sample((roles) =>
      roles.map((r) => (r.id === '101' ? { ...r, moderation: ['Manage Roles'] } : r)),
    );
    const plan = planChange(dangerous, new Set(), { give: ['101'], take: [] });
    expect(plan.add).toEqual([]);
    expect(plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['North', 'moderation'],
    ]);
  });

  it('still takes away a role that was given a moderation permission since', () => {
    const dangerous = sample((roles) =>
      roles.map((r) => (r.id === '101' ? { ...r, moderation: ['Manage Roles'] } : r)),
    );
    const plan = planChange(dangerous, new Set(['101']), { give: [], take: ['101'] });
    expect(names(plan.remove)).toEqual(['North']);
  });

  it('takes away nothing the bot cannot change', () => {
    const above = sample((roles) =>
      roles.map((r) => (r.id === '101' ? { ...r, position: 70 } : r)),
    );
    const plan = planChange(above, new Set(['101']), { give: [], take: ['101'] });
    expect(plan.remove).toEqual([]);
    expect(plan.skipped.map((skip) => skip.reason)).toEqual(['above-bot']);

    const powerless = sample(undefined, { ...BOT, mayManageRoles: false });
    const none = planChange(powerless, new Set(['101']), { give: ['102'], take: ['101'] });
    expect(changesAnything(none)).toBe(false);
    expect(none.skipped.map((skip) => skip.reason)).toEqual(['no-manage-roles', 'no-manage-roles']);
  });

  it('does not give a role of a pick-one group while another of it cannot be taken away', () => {
    const stuck = sample((roles) =>
      roles.map((r) => (r.id === '203' ? { ...r, position: 70 } : r)),
    );
    const plan = planChange(stuck, new Set(['203']), { give: ['202'], take: [] });
    expect(changesAnything(plan)).toBe(false);
    expect(plan.skipped.map((skip) => [skip.entry?.name, skip.reason, skip.blocker?.name])).toEqual(
      [['Mystic', 'stuck', 'Valor']],
    );
    expect(plan.skipped[0]?.blocker?.problem).toBe('above-bot');
  });

  it('never touches a role no row leads to, whatever is asked for', () => {
    const roster = sample();
    // A moderator role, an admin role, the role of a row whose role is gone, and nonsense.
    const foreign = ['900', '901', '999', 'everything'];
    const plan = planChange(roster, new Set(['900', '901']), { give: foreign, take: foreign });
    expect(changesAnything(plan)).toBe(false);
    expect(plan.skipped.map((skip) => skip.reason)).toEqual(foreign.map(() => 'not-offered'));
  });
});

describe('planChange, for any request at all', () => {
  it('plans only roles a row of the server leads to', () => {
    const roster: Roster = sample();
    const offered = roster.entries.flatMap((entry) => (entry.role ? [entry.role.id] : []));
    const staff = ['900', '901', '555555', '999'];
    const everything = [...offered, ...staff, 'nonsense'];
    // Many subsets of a small universe as what is held, given and taken (deterministic).
    let seed = 7;
    const pick = (): string[] =>
      everything.filter(() => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed % 3 === 0;
      });
    let planned = 0;
    for (let round = 0; round < 500; round++) {
      const held = [...new Set([...pick(), ...staff.filter((_id, index) => (round >> index) & 1)])];
      const plan = planChange(roster, new Set(held), { give: pick(), take: pick() });
      // What is planned is all that is ever named to Discord, one role at a time.
      for (const entry of [...plan.add, ...plan.remove]) {
        planned += 1;
        expect(offered, `round ${String(round)}`).toContain(entry.role?.id);
      }
      for (const entry of plan.add) expect(held).not.toContain(entry.role?.id);
      for (const entry of plan.remove) expect(held).toContain(entry.role?.id);
    }
    expect(planned).toBeGreaterThan(500);
  });
});
```

Create `test/support/self-roles.ts`:

```ts
import type {
  GroupSaved,
  RoleSaved,
  SelfRoleRows,
  SelfRoleStorage,
} from '../../src/db/repositories/self-role-repository.js';
import {
  planSaveGroup,
  planSaveRole,
  type GroupInput,
  type RoleInput,
} from '../../src/domain/roles/self-role-edits.js';
import {
  orderedGroups,
  sameName,
  type RosterWrites,
  type SelfRoleGroup,
  type SelfRoleRow,
} from '../../src/domain/roles/self-roles.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';

interface StoredRow extends SelfRoleRow {
  guildId: string;
  aliases: string[];
}

interface StoredGroup extends SelfRoleGroup {
  guildId: string;
}

/**
 * The self-assigned roles kept in memory as `SelfRoleRepository` keeps them, whose behaviour
 * self-role-repository.db.test.ts pins down: the same decisions (`planSaveRole`,
 * `planSaveGroup`) over rows per server. `legacyRow` puts a row as the legacy bot left it:
 * a name, no id of a Discord role, no group. Set `failing` to make every call reject.
 */
export class MemorySelfRoles implements SelfRoleStorage {
  failing: Error | undefined;
  readonly rows: StoredRow[] = [];
  readonly groups: StoredGroup[] = [];
  private nextRow = 1;
  private nextGroup = 1;

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private of(guildId: string): SelfRoleRows {
    return {
      rows: this.rows
        .filter((row) => row.guildId === guildId)
        .map(({ guildId: _guild, ...row }) => ({ ...row, aliases: [...row.aliases] })),
      groups: orderedGroups(
        this.groups
          .filter((group) => group.guildId === guildId)
          .map(({ guildId: _guild, ...group }) => group),
      ),
    };
  }

  /** A row as the legacy bot made it, for a test. */
  legacyRow(
    name: string,
    more: { description?: string; aliases?: string[]; guildId?: string } = {},
  ): number {
    const id = this.nextRow++;
    this.rows.push({
      id,
      guildId: more.guildId ?? FAKE_GUILD_ID,
      name,
      description: more.description ?? null,
      roleId: null,
      groupId: null,
      aliases: more.aliases ?? [],
    });
    return id;
  }

  list(guildId: string): Promise<SelfRoleRows> {
    return this.attempt(() => this.of(guildId));
  }

  remember(guildId: string, writes: RosterWrites): Promise<number> {
    return this.attempt(() => {
      const mine = this.rows.filter((row) => row.guildId === guildId);
      let written = 0;
      for (const { rowId, roleId } of writes.links) {
        const row = mine.find((other) => other.id === rowId);
        // As the unique key has it: one row per Discord role.
        if (row?.roleId === null && !mine.some((other) => other.roleId === roleId)) {
          row.roleId = roleId;
          written += 1;
        }
      }
      for (const { rowId, name } of writes.renames) {
        const row = mine.find((other) => other.id === rowId);
        if (
          row &&
          row.name !== name &&
          !mine.some((other) => other !== row && sameName(other.name, name))
        ) {
          row.name = name;
          written += 1;
        }
      }
      return written;
    });
  }

  saveRole(guildId: string, input: RoleInput): Promise<RoleSaved> {
    return this.attempt((): RoleSaved => {
      const { rows, groups } = this.of(guildId);
      const plan = planSaveRole(rows, groups, input);
      if (!plan.ok) {
        const { ok: _ok, ...problem } = plan;
        return { kind: 'refused', ...problem };
      }
      const existing = this.rows.find((row) => row.guildId === guildId && row.id === plan.rowId);
      const stored: StoredRow = existing ?? {
        id: this.nextRow++,
        guildId,
        name: '',
        description: null,
        roleId: null,
        groupId: null,
        aliases: [],
      };
      Object.assign(stored, plan.values, { aliases: [...plan.values.aliases] });
      if (!existing) this.rows.push(stored);
      const { guildId: _guild, ...row } = stored;
      return { kind: existing ? 'changed' : 'added', row: { ...row, aliases: [...row.aliases] } };
    });
  }

  removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined> {
    return this.attempt(() => {
      const index = this.rows.findIndex((row) => row.guildId === guildId && row.id === rowId);
      if (index < 0) return undefined;
      const [{ guildId: _guild, ...row } = {} as StoredRow] = this.rows.splice(index, 1);
      return row;
    });
  }

  private place(guildId: string, order: readonly number[]): void {
    for (const group of this.groups) {
      if (group.guildId === guildId) group.position = order.indexOf(group.id) + 1;
    }
  }

  saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    return this.attempt((): GroupSaved => {
      const plan = planSaveGroup(this.of(guildId).groups, input);
      if (!plan.ok) {
        const { ok: _ok, ...problem } = plan;
        return { kind: 'refused', ...problem };
      }
      let stored = this.groups.find((group) => group.guildId === guildId && group.id === plan.id);
      const created = !stored;
      if (!stored) {
        stored = { id: this.nextGroup++, guildId, name: '', position: 0, pickOne: false };
        this.groups.push(stored);
      }
      stored.name = plan.name;
      stored.pickOne = plan.pickOne;
      const id = stored.id;
      this.place(
        guildId,
        plan.order.map((other) => other ?? id),
      );
      const { guildId: _guild, ...group } = stored;
      return { kind: created ? 'added' : 'changed', group };
    });
  }

  removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined> {
    return this.attempt(() => {
      const index = this.groups.findIndex(
        (group) => group.guildId === guildId && group.id === groupId,
      );
      if (index < 0) return undefined;
      const [{ guildId: _guild, ...group } = {} as StoredGroup] = this.groups.splice(index, 1);
      let roles = 0;
      for (const row of this.rows) {
        if (row.guildId === guildId && row.groupId === groupId) {
          row.groupId = null;
          roles += 1;
        }
      }
      this.place(
        guildId,
        this.of(guildId).groups.map((other) => other.id),
      );
      return { group, roles };
    });
  }
}
```

Run: `npx vitest run --project unit src/discord/role-permissions.test.ts src/domain/roles/self-role-edits.test.ts src/domain/roles/self-roles.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Create `src/db/migrations/2026_10_13_008_self_role_groups.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Self-assigned roles: the Discord role a row stands for, and groups of roles (plan 4C).
 *
 * `Role.roleSnowflake` is the id of the Discord role. The legacy bot tied a row to a Discord
 * role by `roleName` only, so a renamed role silently stopped working; a row made by the new
 * bot has the id from the start, and a legacy row gets it the first time the new bot resolves
 * it by name (NULL until then). One Discord role has at most one row in a server (the unique
 * key; any number of rows may be without an id).
 *
 * `RoleGroup` is a group of a server's roles (regions, teams): a name, its place in the order
 * (`position`, 1 first) and whether only one of its roles may be held (`pickOne`).
 * `Role.groupId` puts a role into at most one group; NULL, as for every row from before, is
 * "Other". Removing a group leaves its roles without one.
 *
 * The legacy bot names its columns when it reads and writes `Role`, so it does not see the two
 * new ones and keeps finding a role by `roleName`; `Alias` is unchanged.
 *
 * Safe to run again after a failure half-way: every part is added only when it is missing.
 */
export const selfRoleGroups: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const count = async (query: ReturnType<typeof sql<{ n: number }>>): Promise<number> =>
      Number((await query.execute(db)).rows[0]?.n ?? 0);
    const missingColumn = async (column: string): Promise<boolean> =>
      (await count(sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'Role' and column_name = ${column}`)) ===
      0;

    await sql`
      create table if not exists RoleGroup (
        id int unsigned not null auto_increment,
        guildId int unsigned not null,
        name varchar(50) not null,
        position int not null,
        pickOne tinyint(1) not null default 0,
        primary key (id),
        unique key rolegroup_guildid_name_unique (guildId, name),
        constraint rolegroup_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);

    if (await missingColumn('roleSnowflake')) {
      await sql`alter table Role add column roleSnowflake
        varchar(30) character set utf8mb4 collate utf8mb4_0900_ai_ci default null`.execute(db);
    }
    if (await missingColumn('groupId')) {
      await sql`alter table Role add column groupId int unsigned default null`.execute(db);
    }
    const hasIndex = await count(sql<{ n: number }>`
      select count(*) as n from information_schema.statistics
      where table_schema = database() and table_name = 'Role'
        and index_name = 'role_guildid_rolesnowflake_unique'`);
    if (hasIndex === 0) {
      await sql`alter table Role
        add unique key role_guildid_rolesnowflake_unique (guildId, roleSnowflake)`.execute(db);
    }
    const hasForeignKey = await count(sql<{ n: number }>`
      select count(*) as n from information_schema.referential_constraints
      where constraint_schema = database() and table_name = 'Role'
        and constraint_name = 'role_groupid_foreign'`);
    if (hasForeignKey === 0) {
      await sql`alter table Role
        add constraint role_groupid_foreign foreign key (groupId) references RoleGroup (id)
          on delete set null`.execute(db);
    }
  },
  async down() {
    // Additive only: the table and the columns stay.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -7,6 +7,7 @@ import { partyAccessGrants } from './2026_10_11_004_party_access_grants.js';
 import { pokemonNotificationForm } from './2026_10_12_005_pokemon_notification_form.js';
 import { newTrainNotifications } from './2026_10_12_006_new_train_notifications.js';
 import { unownWantGifts } from './2026_10_12_007_unown_want_gifts.js';
+import { selfRoleGroups } from './2026_10_13_008_self_role_groups.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -21,4 +22,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_12_005_pokemon_notification_form': pokemonNotificationForm,
   '2026_10_12_006_new_train_notifications': newTrainNotifications,
   '2026_10_12_007_unown_want_gifts': unownWantGifts,
+  '2026_10_13_008_self_role_groups': selfRoleGroups,
 };
```

Create `src/db/repositories/self-role-repository.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import {
  planSaveGroup,
  planSaveRole,
  type GroupInput,
  type GroupSaveProblem,
  type RoleInput,
  type RoleSaveProblem,
} from '../../domain/roles/self-role-edits.js';
import {
  orderedGroups,
  type RosterWrites,
  type SelfRoleGroup,
  type SelfRoleRow,
} from '../../domain/roles/self-roles.js';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** The rows and the groups of one server. */
export interface SelfRoleRows {
  rows: SelfRoleRow[];
  groups: SelfRoleGroup[];
}

export type RoleSaved =
  { kind: 'added' | 'changed'; row: SelfRoleRow } | ({ kind: 'refused' } & RoleSaveProblem);

export type GroupSaved =
  { kind: 'added' | 'changed'; group: SelfRoleGroup } | ({ kind: 'refused' } & GroupSaveProblem);

/**
 * What the self-assigned roles need of the database; lets tests keep them in memory
 * (`MemorySelfRoles`). A server is named by its snowflake, a row and a group by their ids.
 */
export interface SelfRoleStorage {
  /** The rows of a server with their aliases, and its groups; nothing for a server without a row. */
  list(guildId: string): Promise<SelfRoleRows>;
  /**
   * Writes what resolving the rows found (`buildRoster`): the ids of legacy rows, and new names.
   * A write that no longer fits (the row has an id by now, the name is taken) is left out.
   * Answers how many rows it changed.
   */
  remember(guildId: string, writes: RosterWrites): Promise<number>;
  /** Adds a role or changes the row it has, as `planSaveRole` decides inside the server's lock. */
  saveRole(guildId: string, input: RoleInput): Promise<RoleSaved>;
  /** Deletes a row and its aliases; the row as it was, or undefined when the server has none such. */
  removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined>;
  /** Makes a group or changes one, as `planSaveGroup` decides inside the server's lock. */
  saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved>;
  /**
   * Deletes a group; its roles are without a group from then on. The group as it was and how
   * many roles it had, or undefined when the server has none such.
   */
  removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined>;
}

/** MySQL's duplicate-key error (ER_DUP_ENTRY, errno 1062). */
export function isDuplicateEntry(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1062;
}

/**
 * The legacy tables `Role` and `Alias` with what plan 4C added: `Role.roleSnowflake` (the
 * Discord role's id), `Role.groupId` and the table `RoleGroup`. The legacy bot keeps reading
 * and writing `roleName`, `roleDescription` and the aliases on the same database, so those keep
 * their meaning: `roleName` is the Discord role's name, an alias is in lower case.
 * `AutoAssignRole` is neither read nor written (its rows go with the row or alias they point at).
 *
 * Everything that changes a server's rows runs with the server's `Guild` row locked, so that
 * two members of staff cannot both pass the checks for names and aliases, which the tables
 * themselves enforce only in part (`roleName` and the role's id are unique per server; aliases
 * are not).
 */
export class SelfRoleRepository implements SelfRoleStorage {
  constructor(private readonly db: Kysely<DB>) {}

  private async guildRow(db: Kysely<DB>, guildId: string): Promise<number | undefined> {
    const row = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', guildId)
      .executeTakeFirst();
    return row?.id;
  }

  /**
   * Runs `work` in a transaction that holds the server's `Guild` row locked. With `create` the
   * row is made when it is missing (before the transaction, as `withMemberLocked` does and for
   * its reasons); without it `work` is not run for a server without a row, which has nothing to
   * change. The first read inside `work` comes after the lock, so it sees everything that was
   * written before the lock was got.
   */
  private async locked<T>(
    guildId: string,
    create: boolean,
    work: (trx: Kysely<DB>, guildRow: number) => Promise<T>,
  ): Promise<T | undefined> {
    if ((await this.guildRow(this.db, guildId)) === undefined) {
      if (!create) return undefined;
      // The bot records a server when it joins it; this is for a row that went missing.
      await this.db
        .insertInto('Guild')
        .values({ snowflake: guildId })
        .onDuplicateKeyUpdate({ snowflake: guildId })
        .execute();
    }
    return inTransaction(this.db, async (trx) => {
      const guild = await trx
        .selectFrom('Guild')
        .select('id')
        .where('snowflake', '=', guildId)
        .forUpdate()
        .executeTakeFirst();
      if (!guild) {
        if (!create) return undefined;
        throw new Error(`Guild row for ${guildId} vanished while its roles were being changed`);
      }
      return work(trx, guild.id);
    });
  }

  private async read(db: Kysely<DB>, guildRow: number): Promise<SelfRoleRows> {
    const roles = await db
      .selectFrom('Role')
      .select(['id', 'roleName', 'roleDescription', 'roleSnowflake', 'groupId'])
      .where('guildId', '=', guildRow)
      .orderBy('id')
      .execute();
    const aliases =
      roles.length === 0
        ? []
        : await db
            .selectFrom('Alias')
            .select(['roleId', 'aliasName'])
            .where(
              'roleId',
              'in',
              roles.map((role) => role.id),
            )
            .orderBy('id')
            .execute();
    const groups = await db
      .selectFrom('RoleGroup')
      .select(['id', 'name', 'position', 'pickOne'])
      .where('guildId', '=', guildRow)
      .orderBy('position')
      .orderBy('id')
      .execute();
    return {
      rows: roles.map((role) => ({
        id: role.id,
        name: role.roleName ?? '',
        description:
          role.roleDescription === null || role.roleDescription.trim() === ''
            ? null
            : role.roleDescription,
        roleId: role.roleSnowflake,
        groupId: role.groupId,
        aliases: aliases.flatMap((alias) =>
          alias.roleId === role.id && alias.aliasName !== null && alias.aliasName.trim() !== ''
            ? [alias.aliasName]
            : [],
        ),
      })),
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        position: group.position,
        pickOne: group.pickOne !== 0,
      })),
    };
  }

  async list(guildId: string): Promise<SelfRoleRows> {
    const guildRow = await this.guildRow(this.db, guildId);
    return guildRow === undefined ? { rows: [], groups: [] } : this.read(this.db, guildRow);
  }

  async remember(guildId: string, writes: RosterWrites): Promise<number> {
    const guildRow = await this.guildRow(this.db, guildId);
    if (guildRow === undefined) return 0;
    // Statement by statement, without the lock: each is right or changes nothing, and the unique
    // keys refuse what another writer made wrong meanwhile.
    let written = 0;
    const unlessDuplicate = async (write: Promise<{ numUpdatedRows: bigint }>): Promise<void> => {
      try {
        written += Number((await write).numUpdatedRows);
      } catch (error) {
        if (!isDuplicateEntry(error)) throw error;
      }
    };
    for (const { rowId, roleId } of writes.links) {
      await unlessDuplicate(
        this.db
          .updateTable('Role')
          .set({ roleSnowflake: roleId })
          .where('id', '=', rowId)
          .where('guildId', '=', guildRow)
          .where('roleSnowflake', 'is', null)
          .executeTakeFirstOrThrow(),
      );
    }
    for (const { rowId, name } of writes.renames) {
      await unlessDuplicate(
        this.db
          .updateTable('Role')
          .set({ roleName: name })
          .where('id', '=', rowId)
          .where('guildId', '=', guildRow)
          // Only a row that is spelled otherwise is found: one that has the name already is
          // not counted as written (the driver counts the rows found, not the rows changed).
          .where(sql<boolean>`not (cast(roleName as binary) <=> cast(${name} as binary))`)
          .executeTakeFirstOrThrow(),
      );
    }
    return written;
  }

  async saveRole(guildId: string, input: RoleInput): Promise<RoleSaved> {
    try {
      const saved = await this.locked(guildId, true, async (trx, guildRow): Promise<RoleSaved> => {
        const { rows, groups } = await this.read(trx, guildRow);
        const plan = planSaveRole(rows, groups, input);
        if (!plan.ok) {
          const { ok: _ok, ...problem } = plan;
          return { kind: 'refused', ...problem };
        }
        const { values } = plan;
        const columns = {
          roleName: values.name,
          roleDescription: values.description,
          roleSnowflake: values.roleId,
          groupId: values.groupId,
        };
        let rowId = plan.rowId;
        if (rowId === undefined) {
          const inserted = await trx
            .insertInto('Role')
            .values({ ...columns, guildId: guildRow })
            .executeTakeFirstOrThrow();
          rowId = Number(inserted.insertId);
        } else {
          await trx.updateTable('Role').set(columns).where('id', '=', rowId).execute();
        }
        // An alias that stays keeps its row (the legacy bot's auto-assigned role may point at it).
        const before = rows.find((row) => row.id === rowId)?.aliases ?? [];
        const dropped = before.filter((alias) => !values.aliases.includes(alias));
        const fresh = values.aliases.filter((alias) => !before.includes(alias));
        if (dropped.length > 0) {
          await trx
            .deleteFrom('Alias')
            .where('roleId', '=', rowId)
            .where('aliasName', 'in', dropped)
            .execute();
        }
        if (fresh.length > 0) {
          const roleId = rowId;
          await trx
            .insertInto('Alias')
            .values(fresh.map((aliasName) => ({ aliasName, roleId })))
            .execute();
        }
        return {
          kind: plan.rowId === undefined ? 'added' : 'changed',
          row: {
            id: rowId,
            name: values.name,
            description: values.description,
            roleId: values.roleId,
            groupId: values.groupId,
            aliases: values.aliases,
          },
        };
      });
      if (!saved) throw new Error(`No Guild row for ${guildId}`);
      return saved;
    } catch (error) {
      // The database refuses a name the check let through, because its collation knows more
      // equal letters than `sameName`: the name is taken all the same. (Nobody gets between
      // the check and the insert: whoever adds a role of this server, the legacy bot too, holds
      // a lock on the server's `Guild` row through the foreign key and so waits for this one.
      // That is also why no test reaches this branch; the db test pins the lock, and that a
      // duplicate key is recognised.)
      if (isDuplicateEntry(error)) {
        return { kind: 'refused', reason: 'name-taken', other: input.role.name };
      }
      throw error;
    }
  }

  async removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined> {
    return this.locked(guildId, false, async (trx, guildRow) => {
      const row = (await this.read(trx, guildRow)).rows.find((other) => other.id === rowId);
      if (!row) return undefined;
      // The aliases go with it (ON DELETE CASCADE).
      await trx.deleteFrom('Role').where('id', '=', rowId).execute();
      return row;
    });
  }

  /** Gives the groups the places 1, 2, … in this order. */
  private async place(trx: Kysely<DB>, order: readonly number[]): Promise<void> {
    for (const [index, id] of order.entries()) {
      await trx
        .updateTable('RoleGroup')
        .set({ position: index + 1 })
        .where('id', '=', id)
        .execute();
    }
  }

  async saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    try {
      return await this.savedGroup(guildId, input);
    } catch (error) {
      // As for a role's name: the database takes two names for one where the check did not.
      if (isDuplicateEntry(error)) return { kind: 'refused', reason: 'name-taken' };
      throw error;
    }
  }

  private async savedGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    const saved = await this.locked(guildId, true, async (trx, guildRow): Promise<GroupSaved> => {
      const { groups } = await this.read(trx, guildRow);
      const plan = planSaveGroup(groups, input);
      if (!plan.ok) {
        const { ok: _ok, ...problem } = plan;
        return { kind: 'refused', ...problem };
      }
      let id = plan.id;
      const pickOne = plan.pickOne ? 1 : 0;
      if (id === undefined) {
        const inserted = await trx
          .insertInto('RoleGroup')
          .values({ guildId: guildRow, name: plan.name, pickOne, position: plan.order.length })
          .executeTakeFirstOrThrow();
        id = Number(inserted.insertId);
      } else {
        await trx
          .updateTable('RoleGroup')
          .set({ name: plan.name, pickOne })
          .where('id', '=', id)
          .execute();
      }
      const made = id;
      const order = plan.order.map((other) => other ?? made);
      await this.place(trx, order);
      return {
        kind: plan.id === undefined ? 'added' : 'changed',
        group: { id, name: plan.name, pickOne: plan.pickOne, position: order.indexOf(id) + 1 },
      };
    });
    if (!saved) throw new Error(`No Guild row for ${guildId}`);
    return saved;
  }

  async removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined> {
    return this.locked(guildId, false, async (trx, guildRow) => {
      const { rows, groups } = await this.read(trx, guildRow);
      const group = groups.find((other) => other.id === groupId);
      if (!group) return undefined;
      // Its roles lose it (ON DELETE SET NULL).
      await trx.deleteFrom('RoleGroup').where('id', '=', groupId).execute();
      await this.place(
        trx,
        orderedGroups(groups)
          .filter((other) => other !== group)
          .map((other) => other.id),
      );
      return { group, roles: rows.filter((row) => row.groupId === groupId).length };
    });
  }
}
```

Apply to `src/db/types.ts`:

```diff
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -192,10 +192,20 @@ export interface Region {
 }
 
 export interface Role {
+  groupId: number | null;
   guildId: number | null;
   id: Generated<number>;
   roleDescription: string | null;
   roleName: string | null;
+  roleSnowflake: string | null;
+}
+
+export interface RoleGroup {
+  guildId: number;
+  id: Generated<number>;
+  name: string;
+  pickOne: Generated<number>;
+  position: number;
 }
 
 export interface SavedRoutes {
@@ -248,6 +258,7 @@ export interface DB {
   RaidBossOverride: RaidBossOverride;
   Region: Region;
   Role: Role;
+  RoleGroup: RoleGroup;
   SavedRoutes: SavedRoutes;
   UnownWantGift: UnownWantGift;
   User: User;
```

Create `src/discord/role-permissions.ts`:

```ts
import { PermissionFlagsBits } from 'discord.js';

/**
 * The permissions of moderation and administration, with the names Discord's settings show.
 * A role that grants any of them is never handed out by `/iam`, and is refused when staff try
 * to make it self-assignable: whoever may give themself such a role has made themself staff.
 * This is the whole list; a permission that is not here counts as harmless (seeing and writing
 * in channels, reactions, voice, threads of one's own, and the like). The test beside this file
 * sorts every permission of the installed discord.js into one of the two, and fails when
 * discord.js brings one that is in neither.
 *
 * Pin Messages and Bypass Slowmode were parts of Manage Messages and Manage Channels until
 * Discord made them permissions of their own, so they are here with those. The two insights
 * show what members do not see of a server; Priority Speaker talks over the others in a voice
 * channel.
 */
export const MODERATION_PERMISSIONS: ReadonlyArray<readonly [flag: bigint, name: string]> = [
  [PermissionFlagsBits.Administrator, 'Administrator'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageThreads, 'Manage Threads'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.PinMessages, 'Pin Messages'],
  [PermissionFlagsBits.BypassSlowmode, 'Bypass Slowmode'],
  [PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
  [PermissionFlagsBits.ManageGuildExpressions, 'Manage Expressions'],
  [PermissionFlagsBits.ManageEvents, 'Manage Events'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.ModerateMembers, 'Timeout Members'],
  [PermissionFlagsBits.MentionEveryone, 'Mention @everyone, @here and All Roles'],
  [PermissionFlagsBits.ViewAuditLog, 'View Audit Log'],
  [PermissionFlagsBits.MuteMembers, 'Mute Members'],
  [PermissionFlagsBits.DeafenMembers, 'Deafen Members'],
  [PermissionFlagsBits.MoveMembers, 'Move Members'],
  [PermissionFlagsBits.PrioritySpeaker, 'Priority Speaker'],
  [PermissionFlagsBits.ViewGuildInsights, 'View Server Insights'],
  [PermissionFlagsBits.ViewCreatorMonetizationAnalytics, 'View Creator Monetization Analytics'],
];

/** The moderation permissions a role's permissions contain, by name; empty for a harmless role. */
export function moderationPermissions(permissions: bigint): string[] {
  return MODERATION_PERMISSIONS.filter(([flag]) => (permissions & flag) !== 0n).map(
    ([, name]) => name,
  );
}

/**
 * The moderation permissions a role adds to what every member has anyway, by name. Discord
 * makes a new role with the permissions of `@everyone`, which by default include Mention
 * Everyone: such a role gives nobody anything, and what `@everyone` grants is the server's own
 * decision. Both bit fields are read at the moment of asking.
 */
export function addedModeration(role: bigint, everyone: bigint): string[] {
  return moderationPermissions(role & ~everyone);
}
```

Create `src/domain/roles/self-role-edits.ts`:

```ts
import {
  ALIAS_LENGTH,
  DESCRIPTION_LENGTH,
  GROUP_NAME_LENGTH,
  MAX_ALIASES,
  MAX_GROUPS,
  orderedGroups,
  ROLE_NAME_LENGTH,
  sameName,
  type SelfRoleGroup,
  type SelfRoleRow,
} from './self-roles.js';

/**
 * What staff change about the self-assigned roles of a server, as pure decisions over the rows
 * that exist: the repository and its twin in memory both run these inside their lock, so that
 * names and aliases stay unique whoever writes at the same time.
 */

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The words that mean "no group" where a group is named; no group may be called so. */
export const NO_GROUP_WORDS = ['other', 'none'] as const;

export function isNoGroupWord(text: string): boolean {
  return NO_GROUP_WORDS.some((word) => sameName(word, text));
}

export type AliasProblem =
  { reason: 'alias-too-long'; alias: string } | { reason: 'too-many-aliases'; count: number };

/**
 * The aliases a comma-separated text names: in lower case (as the legacy bot stored and compared
 * them), each once, without empty ones.
 */
export function parseAliases(
  text: string,
): { ok: true; aliases: string[] } | ({ ok: false } & AliasProblem) {
  const aliases: string[] = [];
  for (const part of text.split(',')) {
    const alias = tidy(part).toLowerCase();
    if (alias === '' || aliases.some((other) => sameName(other, alias))) continue;
    if (alias.length > ALIAS_LENGTH) return { ok: false, reason: 'alias-too-long', alias };
    aliases.push(alias);
  }
  if (aliases.length > MAX_ALIASES) {
    return { ok: false, reason: 'too-many-aliases', count: aliases.length };
  }
  return { ok: true, aliases };
}

/** What staff say about a role they add or change. `undefined` leaves a part as it is. */
export interface RoleInput {
  /** The Discord role, as the server has it now. */
  role: { id: string; name: string };
  /** `null` clears it. */
  description?: string | null | undefined;
  /** Replaces the aliases the row has (not merged, as in the legacy bot); empty clears them. */
  aliases?: readonly string[] | undefined;
  /** `null` takes the role out of its group. */
  groupId?: number | null | undefined;
}

/** What a row is to hold. */
export interface RoleValues {
  roleId: string;
  name: string;
  description: string | null;
  aliases: string[];
  groupId: number | null;
}

export type RoleSaveProblem =
  | { reason: 'name-too-long' }
  | { reason: 'description-too-long' }
  /** Another row is called so. */
  | { reason: 'name-taken'; other: string }
  /** The role's name is an alias of another row. */
  | { reason: 'name-is-alias'; other: string }
  /** An alias is the name or an alias of another row. */
  | { reason: 'alias-taken'; alias: string; other: string }
  | { reason: 'no-group' };

export type RoleSavePlan =
  | {
      ok: true;
      /** The row that is changed; undefined for a new one. */
      rowId: number | undefined;
      values: RoleValues;
    }
  | ({ ok: false } & RoleSaveProblem);

/**
 * What adding a role, or changing one that is there, writes. The row that is there is the one
 * with the role's id, or else a legacy row without an id that has the role's name (staff
 * picking the role says which of several roles of that name was meant). A role's name and its
 * aliases may not be the name or an alias of another row of the server; an alias that is the
 * role's own name is dropped.
 */
export function planSaveRole(
  rows: readonly SelfRoleRow[],
  groups: readonly SelfRoleGroup[],
  input: RoleInput,
): RoleSavePlan {
  const { role } = input;
  if (role.name.length > ROLE_NAME_LENGTH) return { ok: false, reason: 'name-too-long' };
  const existing =
    rows.find((row) => row.roleId === role.id) ??
    rows.find((row) => row.roleId === null && sameName(row.name, role.name));
  const others = rows.filter((row) => row !== existing);

  const named = others.find((row) => sameName(row.name, role.name));
  if (named) return { ok: false, reason: 'name-taken', other: named.name };
  const aliased = others.find((row) => row.aliases.some((alias) => sameName(alias, role.name)));
  if (aliased) return { ok: false, reason: 'name-is-alias', other: aliased.name };

  const aliases =
    input.aliases === undefined
      ? [...(existing?.aliases ?? [])]
      : input.aliases.filter((alias) => !sameName(alias, role.name));
  if (input.aliases !== undefined) {
    for (const alias of aliases) {
      const other = others.find(
        (row) => sameName(row.name, alias) || row.aliases.some((theirs) => sameName(theirs, alias)),
      );
      if (other) return { ok: false, reason: 'alias-taken', alias, other: other.name };
    }
  }

  let description = existing?.description ?? null;
  if (input.description !== undefined) {
    const text = input.description === null ? '' : tidy(input.description);
    if (text.length > DESCRIPTION_LENGTH) return { ok: false, reason: 'description-too-long' };
    description = text === '' ? null : text;
  }

  const groupId = input.groupId === undefined ? (existing?.groupId ?? null) : input.groupId;
  if (input.groupId !== undefined && groupId !== null && !groups.some((g) => g.id === groupId)) {
    return { ok: false, reason: 'no-group' };
  }
  return {
    ok: true,
    rowId: existing?.id,
    values: { roleId: role.id, name: role.name, description, aliases, groupId },
  };
}

/** What staff say about a group they make or change. `undefined` leaves a part as it is. */
export interface GroupInput {
  /** The group's name: one that exists is changed, any other is made. */
  name: string;
  /** A new name for a group that exists. */
  newName?: string | undefined;
  pickOne?: boolean | undefined;
  /** Its place in the order, 1 first; beyond the last place is the last place. */
  position?: number | undefined;
}

export type GroupSaveProblem =
  | { reason: 'name-empty' }
  | { reason: 'name-too-long' }
  | { reason: 'reserved-name' }
  | { reason: 'name-taken' }
  /** A new name for a group that does not exist. */
  | { reason: 'no-group' }
  | { reason: 'too-many' };

export type GroupSavePlan =
  | {
      ok: true;
      /** The group that is changed; undefined for a new one. */
      id: number | undefined;
      name: string;
      pickOne: boolean;
      /** Every group of the server in the new order, by id; `null` is the new one. */
      order: (number | null)[];
    }
  | ({ ok: false } & GroupSaveProblem);

function groupNameProblem(name: string): GroupSaveProblem | undefined {
  if (name === '') return { reason: 'name-empty' };
  if (name.length > GROUP_NAME_LENGTH) return { reason: 'name-too-long' };
  if (isNoGroupWord(name)) return { reason: 'reserved-name' };
  return undefined;
}

/**
 * What making a group, or changing one, writes. A new group goes to the end unless a place is
 * named; naming a place moves the group there and the others close up, so the places of a
 * server's groups are always 1 to their number.
 */
export function planSaveGroup(groups: readonly SelfRoleGroup[], input: GroupInput): GroupSavePlan {
  const name = tidy(input.name);
  const problem = groupNameProblem(name);
  if (problem) return { ok: false, ...problem };
  const ordered = orderedGroups(groups);
  const existing = ordered.find((group) => sameName(group.name, name));

  let finalName = existing?.name ?? name;
  if (input.newName !== undefined) {
    if (!existing) return { ok: false, reason: 'no-group' };
    finalName = tidy(input.newName);
    const renamed = groupNameProblem(finalName);
    if (renamed) return { ok: false, ...renamed };
    if (ordered.some((group) => group !== existing && sameName(group.name, finalName))) {
      return { ok: false, reason: 'name-taken' };
    }
  }
  if (!existing && ordered.length >= MAX_GROUPS) return { ok: false, reason: 'too-many' };

  const order: (number | null)[] = ordered
    .filter((group) => group !== existing)
    .map((group) => group.id);
  const current = existing ? ordered.indexOf(existing) : order.length;
  const wanted =
    input.position === undefined
      ? current
      : Math.min(Math.max(Math.trunc(input.position), 1), order.length + 1) - 1;
  order.splice(wanted, 0, existing?.id ?? null);
  return {
    ok: true,
    id: existing?.id,
    name: finalName,
    pickOne: input.pickOne ?? existing?.pickOne ?? false,
    order,
  };
}
```

Create `src/domain/roles/self-roles.ts`:

```ts
import { matchNamed } from '../search/word-match.js';

/**
 * Self-assigned roles (plan 4C): the roles a server lets its members give themselves, as rows
 * of the legacy table `Role` with their aliases, sorted into groups. Everything here is pure:
 * what a row means against the roles the server has at this moment, whether a role may be
 * handed out, and what a member's request changes.
 */

/** A role of a Discord server, as far as handing it out asks about it. */
export interface ServerRole {
  id: string;
  name: string;
  /** Its place in the server's order of roles; a higher number stands above. */
  position: number;
  /** The role every member has (`@everyone`). */
  everyone: boolean;
  /** Managed by an integration: a bot's own role, the booster role, a linked role. */
  managed: boolean;
  /**
   * The permissions of moderation and administration it grants beyond what every member has
   * anyway (`@everyone`), by the names Discord shows; empty for a harmless role. Which
   * permissions those are is `MODERATION_PERMISSIONS` (`src/discord/role-permissions.ts`).
   */
  moderation: readonly string[];
}

/** What the bot itself can do with roles in a server. */
export interface BotStanding {
  /** Whether it has the permission Manage Roles. */
  mayManageRoles: boolean;
  /** The position of its highest role: it can only hand out roles below that. */
  highestPosition: number;
}

/** The roles of a server and the bot's standing among them, at one moment. */
export interface ServerRoles {
  roles: readonly ServerRole[];
  bot: BotStanding;
  /** The user who owns the server, whom its order of roles does not bind. */
  ownerId: string;
}

/** A member of staff who offers a role, as far as the server's order of roles asks. */
export interface StaffStanding {
  id: string;
  /** The ids of the roles they hold. */
  held: readonly string[];
  /** Whether they have the permission Manage Roles (an administrator has). */
  mayManageRoles: boolean;
}

/**
 * Why a member of staff may not offer a role: they lack Manage Roles (`no-manage-roles`), or
 * the role is not below their own highest role (`not-below`).
 */
export type OfferProblem = 'no-manage-roles' | 'not-below';

/** A row of `Role` with its aliases. */
export interface SelfRoleRow {
  id: number;
  /** `roleName`: the Discord role's name as the row last knew it (the legacy bot finds it by this). */
  name: string;
  description: string | null;
  /** The Discord role's id; null for a row of the legacy bot that was not resolved yet. */
  roleId: string | null;
  /** The group it is sorted into; null is "Other". */
  groupId: number | null;
  /** In lower case, as the legacy bot stored them. */
  aliases: readonly string[];
}

/** A group of a server's roles: regions, teams. */
export interface SelfRoleGroup {
  id: number;
  name: string;
  /** Its place in the order, 1 first. */
  position: number;
  /** Only one of its roles may be held (teams). */
  pickOne: boolean;
}

/**
 * Why a row cannot be handed out at present:
 * - `gone`: its Discord role no longer exists (or, for a legacy row, no role has its name);
 * - `ambiguous`: a legacy row whose name several roles of the server have;
 * - `duplicate`: a legacy row whose name leads to a role another row already stands for;
 * - `everyone`, `managed`, `moderation`: the role is one that is never handed out;
 * - `above-bot`: the role stands at or above the bot's highest role;
 * - `no-manage-roles`: the bot lacks Manage Roles and can hand out nothing.
 */
export type RoleProblem =
  | 'gone'
  | 'ambiguous'
  | 'duplicate'
  | 'everyone'
  | 'managed'
  | 'moderation'
  | 'above-bot'
  | 'no-manage-roles';

/** The problems that lie in the role itself: such a role is refused when staff add it. */
export type IntrinsicProblem = 'everyone' | 'managed' | 'moderation' | 'above-bot';

const collator = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * Whether two names are the same name: case and accents do not count, as in the database
 * (collation `utf8mb4_0900_ai_ci`, which the unique key on `roleName` uses) and as the legacy
 * bot looked roles up.
 */
export function sameName(a: string, b: string): boolean {
  return collator.compare(a.trim(), b.trim()) === 0;
}

/** What `byRoleName` sorts: a group, a row, or a roster entry (which has its row). */
interface Named {
  name: string;
  id?: number;
  row?: { id: number };
}

/**
 * Names in the order lists and menus show them: without case and accents, a number inside a
 * name by its value ("Region 2" before "Region 10"), then by the exact spelling, and two of
 * exactly one name by the id of their row, so that the order is the same every time.
 */
export function byRoleName(a: Named, b: Named): number {
  return (
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.row?.id ?? a.id ?? 0) - (b.row?.id ?? b.id ?? 0)
  );
}

/**
 * Why a role of the server may not be handed out; undefined when it may. This is the security
 * rule of self-assignment: it is asked when staff add a role and again every time a role is
 * given, because a role that was harmless when it was added can be given a permission later.
 * What lies in the role itself comes before what lies in the bot.
 */
export function roleProblem(
  role: ServerRole,
  bot: BotStanding,
): IntrinsicProblem | 'no-manage-roles' | undefined {
  if (role.everyone) return 'everyone';
  if (role.managed) return 'managed';
  if (role.moderation.length > 0) return 'moderation';
  // At the same position Discord decides by the roles' ids; that is refused too.
  if (role.position >= bot.highestPosition) return 'above-bot';
  if (!bot.mayManageRoles) return 'no-manage-roles';
  return undefined;
}

/**
 * Why a member of staff may not make a role self-assignable; undefined when they may. Whoever
 * offers a role hands it to everybody who asks, themself included: so only the server's owner,
 * or somebody who could give that role by hand (Manage Roles, and the role below their own
 * highest), may offer it. Otherwise the list would be a way around the server's order of roles.
 */
export function offerProblem(
  role: ServerRole,
  server: ServerRoles,
  staff: StaffStanding,
): OfferProblem | undefined {
  if (staff.id === server.ownerId) return undefined;
  if (!staff.mayManageRoles) return 'no-manage-roles';
  const highest = Math.max(
    0,
    ...server.roles
      .filter((other) => !other.everyone && staff.held.includes(other.id))
      .map((other) => other.position),
  );
  return role.position >= highest ? 'not-below' : undefined;
}

/** A row with the Discord role it stands for at this moment. */
export interface RosterEntry {
  row: SelfRoleRow;
  /**
   * The Discord role; undefined for a row that leads to none (`gone`, `ambiguous`,
   * `duplicate`). Only a role that stands here can ever be given or taken away.
   */
  role: ServerRole | undefined;
  /** The role's name as Discord has it now; the row's own for a row without a role. */
  name: string;
  group: SelfRoleGroup | undefined;
  problem: RoleProblem | undefined;
}

/** Everything a server offers, resolved against its roles. */
export interface Roster {
  /** In their order. */
  groups: readonly SelfRoleGroup[];
  /** Every row, by name; those with a `problem` are offered to nobody. */
  entries: readonly RosterEntry[];
  bot: BotStanding;
}

/** What resolving found that the rows should remember. */
export interface RosterWrites {
  /** Legacy rows that were found by name: they get the role's id, which counts from then on. */
  links: { rowId: number; roleId: string }[];
  /** Rows whose Discord role was renamed: `roleName` follows, so the legacy bot keeps finding it. */
  renames: { rowId: number; name: string }[];
}

/** The longest `roleName` the table holds. A Discord role's name may be twice as long. */
export const ROLE_NAME_LENGTH = 50;
export const DESCRIPTION_LENGTH = 150;
export const ALIAS_LENGTH = 50;
export const MAX_ALIASES = 10;
export const GROUP_NAME_LENGTH = 50;
export const MAX_GROUPS = 25;

/** Groups in their order: by position, then by name. */
export function orderedGroups(groups: readonly SelfRoleGroup[]): SelfRoleGroup[] {
  return [...groups].sort((a, b) => a.position - b.position || byRoleName(a, b) || a.id - b.id);
}

/**
 * Resolves a server's rows against the roles it has now.
 *
 * A row with an id stands for the role with that id, whatever either is called; when the role
 * was renamed the row's name is to follow, unless another row has that name already or the name
 * is longer than the column. A row without an id (made by the legacy bot) is looked up by its
 * name among the server's roles. A role that a row with an id stands for is out of the question
 * for it: of the others of that name exactly one is linked and several are `ambiguous` (nothing
 * is guessed about which was meant); no role of that name at all is `gone`, and `duplicate` is
 * for a name that only roles have which other rows stand for already.
 */
export function buildRoster(
  rows: readonly SelfRoleRow[],
  groups: readonly SelfRoleGroup[],
  server: ServerRoles,
): { roster: Roster; writes: RosterWrites } {
  const byId = new Map(server.roles.map((role) => [role.id, role]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  /** The roles rows with an id stand for. */
  const taken = new Set(rows.flatMap((row) => (row.roleId === null ? [] : [row.roleId])));
  /** The roles legacy rows were linked to on the way. */
  const linked = new Set<string>();
  const writes: RosterWrites = { links: [], renames: [] };
  /** The names rows will have once the renames are written, to keep them unique. */
  const names = new Map(rows.map((row) => [row.id, row.name]));
  const nameTaken = (name: string, except: number): boolean =>
    [...names].some(([id, other]) => id !== except && sameName(other, name));

  const entries = rows.map((row): RosterEntry => {
    const group = row.groupId === null ? undefined : groupById.get(row.groupId);
    const without = (problem: RoleProblem): RosterEntry => ({
      row,
      role: undefined,
      name: row.name,
      group,
      problem,
    });
    let role: ServerRole | undefined;
    if (row.roleId !== null) {
      role = byId.get(row.roleId);
      if (!role) return without('gone');
    } else {
      const named = server.roles.filter(
        (other) => !other.everyone && sameName(other.name, row.name),
      );
      if (named.length === 0 || row.name.trim() === '') return without('gone');
      const free = named.filter((other) => !taken.has(other.id));
      const [only] = free;
      if (only === undefined) return without('duplicate');
      if (free.length > 1) return without('ambiguous');
      if (linked.has(only.id)) return without('duplicate');
      linked.add(only.id);
      writes.links.push({ rowId: row.id, roleId: only.id });
      role = only;
    }
    if (
      role.name !== row.name &&
      role.name.length <= ROLE_NAME_LENGTH &&
      !nameTaken(role.name, row.id)
    ) {
      names.set(row.id, role.name);
      writes.renames.push({ rowId: row.id, name: role.name });
    }
    return { row, role, name: role.name, group, problem: roleProblem(role, server.bot) };
  });
  return {
    roster: {
      groups: orderedGroups(groups),
      entries: entries.sort(byRoleName),
      bot: server.bot,
    },
    writes,
  };
}

/**
 * The entry a text names outright: a role's name first, then an alias; of several, one that
 * leads to a role before one that does not. Case and accents do not count.
 *
 * Names come before aliases on purpose, which has a price: a role renamed on Discord to what is
 * another row's alias shadows that alias (staff are refused such a name when they add a role,
 * but nothing stops a rename on Discord). The alias's own role is still found by its name.
 */
export function findEntry(entries: readonly RosterEntry[], text: string): RosterEntry | undefined {
  const typed = text.trim();
  if (typed === '') return undefined;
  const first = (matches: readonly RosterEntry[]): RosterEntry | undefined =>
    matches.find((entry) => entry.role !== undefined) ?? matches[0];
  return (
    first(entries.filter((entry) => sameName(entry.name, typed))) ??
    first(entries.filter((entry) => entry.row.aliases.some((alias) => sameName(alias, typed))))
  );
}

/** The entries a text that names none of them outright may have meant, best first. */
export function suggestEntries(
  entries: readonly RosterEntry[],
  text: string,
  limit = 5,
): RosterEntry[] {
  return matchNamed(
    entries.map((entry) => ({ value: entry, names: [entry.name, ...entry.row.aliases] })),
    text,
  ).slice(0, limit);
}

/** Whether a role can be taken away: it leads to a role, and the bot can change it. */
export function takeable(entry: RosterEntry): boolean {
  // A role that was given a moderation permission since may no longer be handed out, but a
  // member who has it may still give it back.
  return (
    entry.role !== undefined && (entry.problem === undefined || entry.problem === 'moderation')
  );
}

/** What a member asks for: roles to get and roles to lose, by the ids of the Discord roles. */
export interface ChangeRequest {
  give: readonly string[];
  take: readonly string[];
}

/**
 * Why something that was asked for was not done: a `RoleProblem` of the role, `not-offered`
 * (no row of the server leads to that role any more), `pick-one` (several roles of a group of
 * which only one may be held were asked for at once) or `stuck` (a role of a pick-one group
 * while the member holds another of it that the bot cannot take away).
 */
export type SkipReason = RoleProblem | 'not-offered' | 'pick-one' | 'stuck';

export interface Skipped {
  roleId: string;
  /** Undefined for `not-offered`. */
  entry: RosterEntry | undefined;
  reason: SkipReason;
  /** For `stuck`: the role of the group the member holds that the bot cannot take away. */
  blocker?: RosterEntry;
}

/** What comes of a request. */
export interface PlannedChange {
  add: RosterEntry[];
  /** Everything that is taken away, `displaced` included. */
  remove: RosterEntry[];
  /** Taken away without being asked for: the other roles of a pick-one group a role was given of. */
  displaced: RosterEntry[];
  /** Asked for and held already. */
  already: RosterEntry[];
  /** Asked to be taken away and not held. */
  lacking: RosterEntry[];
  skipped: Skipped[];
}

/**
 * What a request changes for a member who holds the roles `held`.
 *
 * A role is given only when the roster has an entry for it without a problem, and taken away
 * only when the roster has an entry for it that the bot can change: an id that no row of the
 * server leads to never gets into `add` or `remove`, whatever was asked. A role of a group of
 * which only one may be held takes the member's other roles of that group away with it.
 */
export function planChange(
  roster: Roster,
  held: ReadonlySet<string>,
  request: ChangeRequest,
): PlannedChange {
  const byRole = new Map(
    roster.entries.flatMap((entry) => (entry.role ? [[entry.role.id, entry] as const] : [])),
  );
  const plan: PlannedChange = {
    add: [],
    remove: [],
    displaced: [],
    already: [],
    lacking: [],
    skipped: [],
  };
  const give = [...new Set(request.give)];
  const take = [...new Set(request.take)].filter((id) => !give.includes(id));

  /** How many roles of each pick-one group were asked for at once. */
  const asked = new Map<number, number>();
  for (const id of give) {
    const group = byRole.get(id)?.group;
    if (group?.pickOne) asked.set(group.id, (asked.get(group.id) ?? 0) + 1);
  }

  for (const id of give) {
    const entry = byRole.get(id);
    if (!entry) {
      plan.skipped.push({ roleId: id, entry: undefined, reason: 'not-offered' });
    } else if (held.has(id)) {
      plan.already.push(entry);
    } else if (entry.problem !== undefined) {
      plan.skipped.push({ roleId: id, entry, reason: entry.problem });
    } else if (entry.group?.pickOne && (asked.get(entry.group.id) ?? 0) > 1) {
      plan.skipped.push({ roleId: id, entry, reason: 'pick-one' });
    } else if (entry.group?.pickOne) {
      const groupId = entry.group.id;
      const others = roster.entries.filter(
        (other) =>
          other !== entry &&
          other.group?.id === groupId &&
          other.role !== undefined &&
          held.has(other.role.id),
      );
      const blocker = others.find((other) => !takeable(other));
      if (blocker === undefined) {
        plan.add.push(entry);
        plan.displaced.push(...others);
        plan.remove.push(...others);
      } else {
        plan.skipped.push({ roleId: id, entry, reason: 'stuck', blocker });
      }
    } else {
      plan.add.push(entry);
    }
  }

  for (const id of take) {
    const entry = byRole.get(id);
    if (!entry) {
      plan.skipped.push({ roleId: id, entry: undefined, reason: 'not-offered' });
    } else if (!held.has(id)) {
      plan.lacking.push(entry);
    } else if (plan.remove.includes(entry)) {
      // Displaced already.
    } else if (!takeable(entry)) {
      plan.skipped.push({ roleId: id, entry, reason: entry.problem ?? 'gone' });
    } else {
      plan.remove.push(entry);
    }
  }
  return plan;
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/discord/role-permissions.test.ts src/domain/roles/self-role-edits.test.ts src/domain/roles/self-roles.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/migrator.db.test.ts`, `src/db/repositories/self-role-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/self-role-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 40304aa -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/db/migrations/2026_10_13_008_self_role_groups.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/self-role-repository.db.test.ts src/db/repositories/self-role-repository.ts src/db/types.ts src/discord/role-permissions.test.ts src/discord/role-permissions.ts src/domain/roles/self-role-edits.test.ts src/domain/roles/self-role-edits.ts src/domain/roles/self-roles.test.ts src/domain/roles/self-roles.ts test/support/self-roles.ts
npm run typecheck; npx eslint src/db/migrations/2026_10_13_008_self_role_groups.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/self-role-repository.db.test.ts src/db/repositories/self-role-repository.ts src/db/types.ts src/discord/role-permissions.test.ts src/discord/role-permissions.ts src/domain/roles/self-role-edits.test.ts src/domain/roles/self-role-edits.ts src/domain/roles/self-roles.test.ts src/domain/roles/self-roles.ts test/support/self-roles.ts   # both clean; the full check runs after the last task
git add src/db/migrations/2026_10_13_008_self_role_groups.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/self-role-repository.db.test.ts src/db/repositories/self-role-repository.ts src/db/types.ts src/discord/role-permissions.test.ts src/discord/role-permissions.ts src/domain/roles/self-role-edits.test.ts src/domain/roles/self-role-edits.ts src/domain/roles/self-roles.test.ts src/domain/roles/self-roles.ts test/support/self-roles.ts
git commit -F <a file with the message below>
```

The commit message:

```
Self-assigned roles: the Discord role of a row, groups, and the rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 2: Self-assigned roles on Discord: the gateway, its fake, and the service

**Files:**
- Create: `src/discord/role-gateway.ts`, `src/services/self-role-service.test.ts`, `src/services/self-role-service.ts`, `test/support/roles.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `test/support/fake-interactions.test.ts`, `test/support/fake-interactions.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Task 1; `KeyedLock`; `BoundedMap`; `createTestContext`; the fake interactions; the shutdown steps of `src/app.ts`.
- Produces: `src/discord/role-gateway.ts`: `RoleGateway` (`server(guildId): ServerRoles | undefined`, `giveRole`, `takeRole`, each answering `'ok' | 'no-permission' | 'no-role' | 'no-member' | 'two-factor'`), `DiscordRoleGateway` (no unit test); `src/services/self-role-service.ts`: `SelfRoleService` (`ctx.selfRoles`): `roster`, `stored`, `heldNow(guildId, member)`, `change(guildId, member, request): Promise<RoleChangeOutcome>` (one member's changes one after the other; give first, then take; `done`, `nothing`, `refused`, `partial`), `addRole(guildId, input, staff)`, `removeRole`, `saveGroup`, `removeGroup`, `idle()`; `RoleMember` (`id`, `roleIds`, `seenAt`); `test/support/roles.ts`: `FakeRoleGateway` (as strict as Discord about hierarchy, Manage Roles and managed roles; `calls`), `selfRolesWith()`, `ROLE`, `interactionOf()`; the fake interactions' `roleIds`, `createdTimestamp` and `memberPermissions`.

Reference commit of the prototype for this task: `ce24b66`.

- [ ] **Step 1: Write the failing tests**

Create `src/services/self-role-service.test.ts`:

```ts
import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { ROLE, selfRolesWith } from '../../test/support/roles.js';

const HOME = FAKE_GUILD_ID;
const ELSEWHERE = '499999999999999999';

/** Alice as an interaction of hers shows her at this moment. */
function alice(made: ReturnType<typeof selfRolesWith>) {
  return made.server.seen(ALICE);
}

describe('SelfRoleService.roster', () => {
  it('is undefined for a server whose roles the bot does not know', async () => {
    const made = selfRolesWith();
    expect(await made.selfRoles.roster(ELSEWHERE)).toBeUndefined();
    expect(
      await made.selfRoles.change(
        ELSEWHERE,
        { id: ALICE, held: [], seenAt: 0 },
        { give: [], take: [] },
      ),
    ).toEqual({
      kind: 'unavailable',
    });
  });

  it('resolves the rows against the roles the server has now', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.edit(ROLE.north, { name: 'Northside' }).delete(ROLE.east);
    made.server.edit(ROLE.trader, { moderation: ['Manage Messages'] });
    const roster = await made.selfRoles.roster(HOME);
    expect(roster?.groups.map((group) => group.name)).toEqual(['Regions', 'Teams']);
    expect(roster?.entries.map((entry) => [entry.name, entry.group?.name, entry.problem])).toEqual([
      ['East', 'Regions', 'gone'],
      ['Instinct', 'Teams', undefined],
      ['Mystic', 'Teams', undefined],
      ['Northside', 'Regions', undefined],
      ['South', 'Regions', undefined],
      ['Trader', undefined, 'moderation'],
      ['Valor', 'Teams', undefined],
    ]);
    // The row follows its role's new name, for the legacy bot.
    expect(made.storage.rows.find((row) => row.roleId === ROLE.north)?.name).toBe('Northside');
  });

  it('gives a legacy row the id of its role the first time it is resolved, and then goes by it', async () => {
    const made = selfRolesWith();
    const id = made.storage.legacyRow('north', { description: 'from before' });
    expect((await made.selfRoles.roster(HOME))?.entries[0]).toMatchObject({
      name: 'North',
      role: { id: ROLE.north },
      problem: undefined,
    });
    expect(made.storage.rows.find((row) => row.id === id)).toMatchObject({
      roleId: ROLE.north,
      name: 'North',
    });
    made.server.edit(ROLE.north, { name: 'Up North' }).role('540000000000000001', 'North');
    expect((await made.selfRoles.roster(HOME))?.entries[0]).toMatchObject({
      name: 'Up North',
      role: { id: ROLE.north },
    });
  });

  it('still answers when what it found cannot be written', async () => {
    const made = selfRolesWith();
    made.storage.legacyRow('North');
    made.storage.remember = () => Promise.reject(new Error('database away'));
    expect((await made.selfRoles.roster(HOME))?.entries[0]).toMatchObject({
      role: { id: ROLE.north },
    });
    expect(made.entries.some((entry) => entry.msg === 'could not remember resolved roles')).toBe(
      true,
    );
  });

  it('says that the rows were brought up to date only when something was written', async () => {
    const made = selfRolesWith();
    made.storage.legacyRow('North');
    const told = () =>
      made.entries.filter(
        (entry) => entry.msg === 'self-assigned roles brought up to date with the server',
      ).length;
    await made.selfRoles.roster(HOME);
    expect(told()).toBe(1);
    await made.selfRoles.roster(HOME);
    expect(told()).toBe(1);
    // A new name the database will not take is found again with every look and never written.
    made.server.edit(ROLE.north, { name: 'Northside' });
    made.storage.remember = () => Promise.resolve(0);
    await made.selfRoles.roster(HOME);
    await made.selfRoles.roster(HOME);
    expect(told()).toBe(1);
  });
});

describe('SelfRoleService.change', () => {
  it('gives and takes one role at a time, what is given first, and says what the member holds then', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.south, ROLE.valor);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.mystic],
      take: [ROLE.south],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['North', 'Mystic']);
    expect(outcome.taken.map((entry) => entry.name)).toEqual(['Valor', 'South']);
    expect(outcome.held.sort()).toEqual([ROLE.north, ROLE.mystic]);
    expect(made.gateway.said()).toEqual(['give North', 'give Mystic', 'take Valor', 'take South']);
    expect(made.gateway.calls.every((call) => call.memberId === ALICE)).toBe(true);
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic', 'North']);
  });

  it('asks nothing of Discord when nothing changes', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.north);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [ROLE.south],
    });
    expect(outcome).toMatchObject({ kind: 'done', held: [ROLE.north], given: [], taken: [] });
    expect(made.gateway.calls).toEqual([]);
  });

  it('names only self-assigned roles to Discord, whatever is asked for', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.moderator, ROLE.admin, ROLE.booster, ROLE.valor);
    const everything = Object.values(ROLE);
    const offered: string[] = [
      ROLE.north,
      ROLE.south,
      ROLE.east,
      ROLE.instinct,
      ROLE.mystic,
      ROLE.valor,
      ROLE.trader,
    ];
    // Everything the server has is asked for, then everything is asked to be taken away.
    await made.selfRoles.change(HOME, alice(made), { give: everything, take: [] });
    expect(made.server.heldNames(ALICE)).toEqual(
      ['Admin', 'East', 'Moderator', 'North', 'Server Booster', 'South', 'Trader', 'Valor'].sort(),
    );
    await made.selfRoles.change(HOME, alice(made), { give: [], take: everything });
    expect(made.server.heldNames(ALICE)).toEqual(['Admin', 'Moderator', 'Server Booster']);
    expect(made.gateway.calls.length).toBeGreaterThan(0);
    for (const call of made.gateway.calls) expect(offered).toContain(call.roleId);
  });

  it('gives no role that became dangerous after it was added, and none of a row that is gone', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    made.server.edit(ROLE.north, { moderation: ['Ban Members'] });
    made.server.edit(ROLE.south, { position: 50 });
    made.server.delete(ROLE.east);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south, ROLE.east, ROLE.trader],
      take: [],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.skipped.map((skip) => [skip.entry?.name, skip.reason])).toEqual([
      ['North', 'moderation'],
      ['South', 'above-bot'],
      [undefined, 'not-offered'],
    ]);
    expect(made.server.heldNames(ALICE)).toEqual(['Trader']);
  });

  it('does not give back a role an admin took away between the interaction and the request', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.moderator);
    const seen = alice(made);
    // The admin demotes Alice before the bot's request arrives.
    made.server.member(ALICE);
    const outcome = await made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    expect(outcome.kind).toBe('done');
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    expect(made.gateway.said()).toEqual(['give North']);
  });

  it('does not strip a role that was given between the interaction and the request', async () => {
    const made = selfRolesWith();
    const MUTED = '580000000000000001';
    made.server.role(MUTED, 'Muted', { position: 45 });
    await made.offerSample();
    made.server.member(ALICE);
    const seen = alice(made);
    made.server.member(ALICE, MUTED);
    await made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    expect(made.server.heldNames(ALICE)).toEqual(['Muted', 'North']);
  });

  it('does not give back a role of its own recent change that staff took away since', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.trader], take: [] });
    // Staff: Trader gets Kick Members, the row is removed, Alice loses the role by hand.
    made.server.edit(ROLE.trader, { moderation: ['Kick Members'] });
    const { rows } = await made.selfRoles.stored(HOME);
    await made.selfRoles.removeRole(HOME, rows.find((row) => row.name === 'Trader')?.id ?? 0);
    made.server.member(ALICE);
    made.clock.now += 5_000;
    // A fresh interaction, which shows Alice truthfully without Trader.
    const fresh = alice(made);
    expect(made.selfRoles.heldNow(HOME, fresh)).toEqual([]);
    const outcome = await made.selfRoles.change(HOME, fresh, { give: [ROLE.north], take: [] });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.held).toEqual([ROLE.north]);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
  });

  it('lays over an interaction only the changes that finished after it was made', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    const before = alice(made);
    made.clock.now += 1_000;
    await made.selfRoles.change(HOME, before, { give: [ROLE.north], take: [] });
    // An interaction from before the change does not show it; the service knows better.
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([ROLE.north]);
    // One made within the margin for the clocks is still laid over,
    made.clock.now += 1_500;
    expect(made.selfRoles.heldNow(HOME, { ...before, seenAt: made.clock.now })).toEqual([
      ROLE.north,
    ]);
    // and a later one is believed as it is: staff took the role away by hand meanwhile.
    made.server.member(ALICE);
    made.clock.now += 1_000;
    expect(made.selfRoles.heldNow(HOME, alice(made))).toEqual([]);
    // The old interaction is laid over for as long as it can be answered: fifteen minutes.
    made.clock.now += 10_000;
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([ROLE.north]);
    made.clock.now += 15 * 60_000;
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([]);
  });

  it('believes an interaction whose picture differs from the server, at the cost of a wrong "already" or a request too many', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.south);
    // The picture has North, which Alice lacks, and lacks South, which she has.
    const picture = { id: ALICE, held: [ROLE.north], seenAt: made.clock.now };
    const outcome = await made.selfRoles.change(HOME, picture, {
      give: [ROLE.north, ROLE.south],
      take: [ROLE.east],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.already.map((entry) => entry.name)).toEqual(['North']);
    expect(outcome.plan.lacking.map((entry) => entry.name)).toEqual(['East']);
    // Giving what she has changes nothing, and nothing else of hers is touched.
    expect(made.gateway.said()).toEqual(['give South']);
    expect(made.server.heldNames(ALICE)).toEqual(['South']);
  });

  it('runs a queued request with its old picture without undoing what happened meanwhile', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor, ROLE.moderator);
    // All three interactions were made while Alice held Valor and Moderator.
    const seen = alice(made);
    let release: () => void = () => undefined;
    made.gateway.holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = made.selfRoles.change(HOME, seen, { give: [ROLE.mystic], take: [] });
    const second = made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    const third = made.selfRoles.change(HOME, seen, { give: [], take: [ROLE.north] });
    // The first request is on its way and the others wait for it; an admin takes Moderator away.
    await vi.waitFor(() => {
      expect(made.gateway.calls).toHaveLength(1);
    });
    made.server.members.get(ALICE)?.delete(ROLE.moderator);
    made.gateway.holding = undefined;
    release();
    const outcomes = await Promise.all([first, second, third]);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['done', 'done', 'done']);
    // The third knows of the second's change although its interaction does not show it.
    expect(made.gateway.said()).toEqual(['give Mystic', 'take Valor', 'give North', 'take North']);
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic']);
  });

  it('reports a give that worked and a take that failed as exactly that', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor, ROLE.south);
    // Between the look at the roles and the second request Valor is moved above the bot.
    made.gateway.meanwhile = (call) => {
      if (call.action === 'take') made.server.edit(ROLE.valor, { position: 55 });
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.mystic],
      take: [ROLE.south],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['Mystic']);
    expect(outcome.taken).toEqual([]);
    expect(outcome.failed).toMatchObject({
      action: 'take',
      entry: { name: 'Valor' },
      reason: 'no-permission',
    });
    expect(outcome.untried.map((step) => [step.action, step.entry.name])).toEqual([
      ['take', 'South'],
    ]);
    expect(outcome.held.sort()).toEqual([ROLE.south, ROLE.valor, ROLE.mystic].sort());
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic', 'South', 'Valor']);
    // What was done is remembered; what was not is not.
    expect(made.selfRoles.heldNow(HOME, { id: ALICE, held: [], seenAt: 0 })).toEqual([ROLE.mystic]);
    expect(
      made.entries.some((entry) => entry.msg === 'Discord refused a change of self-assigned roles'),
    ).toBe(true);
  });

  it('takes nothing away when the role that was to replace it could not be given', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor);
    const before = alice(made);
    made.gateway.meanwhile = () => made.server.edit(ROLE.mystic, { position: 55 });
    const outcome = await made.selfRoles.change(HOME, before, { give: [ROLE.mystic], take: [] });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome).toMatchObject({
      given: [],
      taken: [],
      failed: { action: 'give', entry: { name: 'Mystic' }, reason: 'no-permission' },
      held: [ROLE.valor],
    });
    expect(outcome.untried.map((step) => [step.action, step.entry.name])).toEqual([
      ['take', 'Valor'],
    ]);
    expect(made.gateway.said()).toEqual(['give Mystic']);
    expect(made.server.heldNames(ALICE)).toEqual(['Valor']);
    expect(made.selfRoles.heldNow(HOME, before)).toEqual([ROLE.valor]);
  });

  it.each(['no-role', 'no-member', 'two-factor'] as const)(
    'hands on the refusal %s of Discord',
    async (reason) => {
      const made = selfRolesWith();
      await made.offerSample();
      made.server.member(ALICE);
      made.gateway.refusing = reason;
      const outcome = await made.selfRoles.change(HOME, alice(made), {
        give: [ROLE.north],
        take: [],
      });
      expect(outcome).toMatchObject({ kind: 'partial', failed: { reason }, given: [] });
    },
  );

  it('rejects when Discord fails otherwise before anything was done, and runs the next request all the same', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    made.gateway.failing = new Error('Discord is away');
    await expect(
      made.selfRoles.change(HOME, alice(made), { give: [ROLE.north], take: [] }),
    ).rejects.toThrow('Discord is away');
    made.gateway.failing = undefined;
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.south], take: [] });
    expect(made.server.heldNames(ALICE)).toEqual(['South']);
  });

  it('reports a failure of another kind after something was done, instead of hiding what was done', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    made.gateway.meanwhile = (call) => {
      if (made.gateway.calls.indexOf(call) === 1) made.gateway.failing = new Error('away');
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south, ROLE.east],
      take: [],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['North']);
    expect(outcome.failed).toMatchObject({
      action: 'give',
      entry: { name: 'South' },
      reason: 'error',
    });
    expect(outcome.untried.map((step) => step.entry.name)).toEqual(['East']);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    expect(
      made.entries.some((entry) => entry.msg === 'a change of self-assigned roles failed half-way'),
    ).toBe(true);
  });

  it('checks every step after the first when it is sent: a role that gained a permission meanwhile is not given', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    // While the first request is on its way, staff give South a permission of moderation.
    made.gateway.meanwhile = (call) => {
      if (made.gateway.calls.indexOf(call) === 0) {
        made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      }
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south, ROLE.east],
      take: [],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.given.map((entry) => entry.name)).toEqual(['North']);
    expect(outcome.failed).toMatchObject({
      action: 'give',
      entry: { name: 'South', problem: 'moderation' },
      reason: 'withdrawn',
      why: 'moderation',
    });
    expect(outcome.untried.map((step) => [step.action, step.entry.name])).toEqual([
      ['give', 'East'],
    ]);
    // Discord was never asked for South.
    expect(made.gateway.said()).toEqual(['give North']);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    expect(outcome.held).toEqual([ROLE.north]);
    expect(
      made.entries.some((entry) => entry.msg === 'a change of self-assigned roles was stopped'),
    ).toBe(true);
  });

  it('does not give a role whose row staff removed while the first request was on its way', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    const { rows } = await made.selfRoles.stored(HOME);
    const south = rows.find((row) => row.name === 'South')?.id ?? 0;
    let removing: Promise<unknown> | undefined;
    made.gateway.meanwhile = (call) => {
      if (made.gateway.calls.indexOf(call) === 0) removing = made.selfRoles.removeRole(HOME, south);
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south],
      take: [],
    });
    await removing;
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.failed).toMatchObject({
      action: 'give',
      entry: { name: 'South' },
      reason: 'withdrawn',
      why: 'not-offered',
    });
    expect(outcome.untried).toEqual([]);
    expect(made.gateway.said()).toEqual(['give North']);
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
  });

  it('does not take a role the bot can no longer change, and still takes one that only gained a permission', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE, ROLE.valor, ROLE.south, ROLE.east);
    made.gateway.meanwhile = (call) => {
      // While Mystic is given, South gains a permission (it may still be given back),
      if (made.gateway.calls.indexOf(call) === 0) {
        made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      }
      // and while South is taken, East is moved above the bot.
      if (made.gateway.calls.indexOf(call) === 2) made.server.edit(ROLE.east, { position: 55 });
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.mystic],
      take: [ROLE.south, ROLE.east],
    });
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.taken.map((entry) => entry.name)).toEqual(['Valor', 'South']);
    expect(outcome.failed).toMatchObject({
      action: 'take',
      entry: { name: 'East' },
      reason: 'withdrawn',
      why: 'above-bot',
    });
    expect(made.gateway.said()).toEqual(['give Mystic', 'take Valor', 'take South']);
    expect(made.server.heldNames(ALICE)).toEqual(['East', 'Mystic']);
  });

  it('stops when it cannot see the roles of the server any more', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    const known = made.gateway.server.bind(made.gateway);
    made.gateway.meanwhile = () => {
      made.gateway.server = () => undefined;
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north, ROLE.south],
      take: [],
    });
    made.gateway.server = known;
    if (outcome.kind !== 'partial') throw new Error(outcome.kind);
    expect(outcome.failed).toMatchObject({
      entry: { name: 'South' },
      reason: 'withdrawn',
      why: 'unavailable',
    });
    expect(made.server.heldNames(ALICE)).toEqual(['North']);
    // What it shows is the last it saw.
    expect(outcome.roster.entries.length).toBeGreaterThan(0);
  });

  it('answers with the roster as it is after the change', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    // While the one request is on its way, South gains a permission and East is renamed.
    made.gateway.meanwhile = () => {
      made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      made.server.edit(ROLE.east, { name: 'Eastside' });
    };
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    const shown = outcome.roster.entries.map((entry) => [entry.name, entry.problem]);
    expect(shown).toContainEqual(['South', 'moderation']);
    expect(shown).toContainEqual(['Eastside', undefined]);
    // A change that asked nothing of Discord shows the roster it was planned with.
    made.gateway.meanwhile = undefined;
    const lists = vi.spyOn(made.storage, 'list');
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.north], take: [] });
    expect(lists).toHaveBeenCalledTimes(1);
  });

  it('remembers its changes for as long as an interaction can be answered: a slow request does not lose them', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE);
    // Three interactions made at the same moment, while Alice held nothing.
    const seen = alice(made);
    await made.selfRoles.change(HOME, seen, { give: [ROLE.valor], take: [] });
    let release: () => void = () => undefined;
    made.gateway.holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    const second = made.selfRoles.change(HOME, seen, { give: [ROLE.north], take: [] });
    const third = made.selfRoles.change(HOME, seen, { give: [ROLE.mystic], take: [] });
    await vi.waitFor(() => {
      expect(made.gateway.calls).toHaveLength(2);
    });
    // Discord makes the bot wait (a rate limit): eleven seconds pass.
    made.clock.now += 11_000;
    made.gateway.holding = undefined;
    release();
    await Promise.all([second, third]);
    // The third still knows of Valor, which its interaction does not show, and takes it away.
    expect(made.gateway.said()).toEqual(['give Valor', 'give North', 'give Mystic', 'take Valor']);
    expect(made.server.heldNames(ALICE)).toEqual(['Mystic', 'North']);
  });

  it('keeps the members and the servers apart', async () => {
    const made = selfRolesWith();
    await made.offerSample();
    made.server.member(ALICE).member(BOB);
    await made.selfRoles.change(HOME, alice(made), { give: [ROLE.north], take: [] });
    expect(made.selfRoles.heldNow(HOME, { id: BOB, held: [], seenAt: 0 })).toEqual([]);
    expect(made.selfRoles.heldNow(ELSEWHERE, { id: ALICE, held: [], seenAt: 0 })).toEqual([]);
    expect(made.server.held(BOB)).toEqual([]);
  });
});

describe('SelfRoleService.addRole', () => {
  it('adds a role of the server and changes it when it is added again', async () => {
    const made = selfRolesWith();
    expect(
      await made.selfRoles.addRole(
        HOME,
        { roleId: ROLE.north, description: 'Up', aliases: ['n'] },
        made.owner(),
      ),
    ).toMatchObject({
      kind: 'added',
      row: { name: 'North', roleId: ROLE.north, description: 'Up', aliases: ['n'] },
      botLacksManageRoles: false,
    });
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.north, aliases: [] }, made.owner()),
    ).toMatchObject({
      kind: 'changed',
      row: { description: 'Up', aliases: [] },
    });
    expect((await made.selfRoles.stored(HOME)).rows).toHaveLength(1);
  });

  it.each([
    [FAKE_GUILD_ID, 'everyone'],
    [ROLE.booster, 'managed'],
    [ROLE.bot, 'managed'],
    [ROLE.moderator, 'moderation'],
    [ROLE.admin, 'moderation'],
  ] as const)('refuses the role %s as %s', async (roleId, problem) => {
    const made = selfRolesWith();
    expect(await made.selfRoles.addRole(HOME, { roleId }, made.owner())).toMatchObject({
      kind: 'unfit',
      problem,
    });
    expect((await made.selfRoles.stored(HOME)).rows).toEqual([]);
  });

  it('refuses a role at or above the highest role of the bot', async () => {
    const made = selfRolesWith();
    made.server.role('540000000000000001', 'Level', { position: 50 });
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000001' }, made.owner()),
    ).toMatchObject({
      kind: 'unfit',
      problem: 'above-bot',
    });
  });

  it('judges a role by what it adds to what every member has anyway', async () => {
    const made = selfRolesWith();
    const { MentionEveryone, KickMembers, SendMessages } = PermissionFlagsBits;
    // Discord makes a role with the permissions of @everyone, which include Mention Everyone.
    made.server.everyone(SendMessages | MentionEveryone);
    made.server.edit(ROLE.north, { permissions: SendMessages | MentionEveryone });
    made.server.edit(ROLE.south, { permissions: SendMessages | MentionEveryone | KickMembers });
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.north }, made.owner())).toMatchObject({
      kind: 'added',
    });
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.south }, made.owner())).toMatchObject({
      kind: 'unfit',
      problem: 'moderation',
      role: { moderation: ['Kick Members'] },
    });
    // The same is asked every time a role is given: once @everyone loses the permission, the
    // role that still has it grants something.
    made.server.everyone(SendMessages);
    made.server.member(ALICE);
    const outcome = await made.selfRoles.change(HOME, alice(made), {
      give: [ROLE.north],
      take: [],
    });
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.plan.skipped.map((skip) => skip.reason)).toEqual(['moderation']);
    expect(made.server.held(ALICE)).toEqual([]);
  });

  it('lets staff offer only a role they could give by hand: Manage Roles, and the role below their own', async () => {
    const made = selfRolesWith();
    made.server.ownerId = BOB;
    made.server.member(ALICE, ROLE.moderator);
    const add = (roleId: string, mayManageRoles: boolean) =>
      made.selfRoles.addRole(HOME, { roleId }, made.server.staff(ALICE, mayManageRoles));
    // Moderator stands at 40: North (5) is below it, a role at 40 or above is not.
    expect(await add(ROLE.north, false)).toMatchObject({
      kind: 'not-yours',
      problem: 'no-manage-roles',
    });
    made.server.role('540000000000000001', 'Level', { position: 40 });
    made.server.role('540000000000000002', 'Higher', { position: 45 });
    expect(await add('540000000000000001', true)).toMatchObject({
      kind: 'not-yours',
      problem: 'not-below',
      role: { name: 'Level' },
    });
    expect(await add('540000000000000002', true)).toMatchObject({ kind: 'not-yours' });
    expect((await made.selfRoles.stored(HOME)).rows).toEqual([]);
    expect(await add(ROLE.north, true)).toMatchObject({ kind: 'added' });
    // Changing what is said about a role is offering it too.
    expect(
      await made.selfRoles.addRole(
        HOME,
        { roleId: ROLE.north, description: 'mine now' },
        made.server.staff(ALICE, false),
      ),
    ).toMatchObject({ kind: 'not-yours' });
    // The owner is bound by nothing but what the bot can give.
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000002' }, made.server.staff(BOB)),
    ).toMatchObject({ kind: 'added' });
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.admin }, made.server.staff(BOB, true)),
    ).toMatchObject({ kind: 'unfit' });
  });

  it('counts staff without any role as below every role', async () => {
    const made = selfRolesWith();
    made.server.ownerId = BOB;
    made.server.member(ALICE);
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.north }, made.server.staff(ALICE, true)),
    ).toMatchObject({ kind: 'not-yours', problem: 'not-below' });
  });

  it('saves a role while the bot lacks Manage Roles, and says so', async () => {
    const made = selfRolesWith();
    made.server.bot.mayManageRoles = false;
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.north }, made.owner())).toMatchObject({
      kind: 'added',
      botLacksManageRoles: true,
    });
    // What lies in the role is still refused.
    expect(await made.selfRoles.addRole(HOME, { roleId: ROLE.admin }, made.owner())).toMatchObject({
      kind: 'unfit',
    });
  });

  it('says when the server has no such role, or is not known', async () => {
    const made = selfRolesWith();
    expect(
      await made.selfRoles.addRole(HOME, { roleId: '540000000000000009' }, made.owner()),
    ).toEqual({
      kind: 'no-role',
    });
    expect(await made.selfRoles.addRole(ELSEWHERE, { roleId: ROLE.north }, made.owner())).toEqual({
      kind: 'unavailable',
    });
  });

  it('hands on what the rows refuse', async () => {
    const made = selfRolesWith();
    await made.selfRoles.addRole(HOME, { roleId: ROLE.north, aliases: ['n'] }, made.owner());
    expect(
      await made.selfRoles.addRole(HOME, { roleId: ROLE.south, aliases: ['n'] }, made.owner()),
    ).toMatchObject({
      kind: 'refused',
      reason: 'alias-taken',
      alias: 'n',
      other: 'North',
    });
  });
});

describe('FakeRoleGateway', () => {
  it('refuses what Discord refuses, one role at a time, and touches nothing else', async () => {
    const { gateway, server } = selfRolesWith();
    server.member(ALICE, ROLE.admin, ROLE.booster);
    const give = (roleId: string) => gateway.giveRole(HOME, ALICE, roleId, 'test');
    const take = (roleId: string) => gateway.takeRole(HOME, ALICE, roleId, 'test');
    expect(await give(ROLE.north)).toBe('ok');
    // Giving again and taking what is not held change nothing, as on Discord.
    expect(await give(ROLE.north)).toBe('ok');
    expect(await take(ROLE.south)).toBe('ok');
    // Above the bot, level with it, managed.
    expect(await take(ROLE.admin)).toBe('no-permission');
    expect(await give(ROLE.bot)).toBe('no-permission');
    expect(await take(ROLE.booster)).toBe('no-permission');
    expect(await give(ROLE.moderator)).toBe('ok');
    expect(await give('540000000000000009')).toBe('no-role');
    expect(await gateway.giveRole(HOME, 'nobody', ROLE.north, 'test')).toBe('no-member');
    server.bot.mayManageRoles = false;
    expect(await give(ROLE.south)).toBe('no-permission');
    expect(await take(ROLE.north)).toBe('no-permission');
    await expect(give(HOME)).rejects.toThrow('@everyone');
    await expect(gateway.giveRole(ELSEWHERE, ALICE, ROLE.north, 'test')).rejects.toThrow(
      'Unknown Guild',
    );
    expect(server.heldNames(ALICE)).toEqual(['Admin', 'Moderator', 'North', 'Server Booster']);
    expect(gateway.calls).toHaveLength(13);
    expect(gateway.said().slice(0, 3)).toEqual(['give North', 'give North', 'take South']);
  });

  it('shows a role with what it adds to @everyone, and the owner of the server', () => {
    const { gateway, server } = selfRolesWith();
    const { KickMembers, MentionEveryone } = PermissionFlagsBits;
    server
      .everyone(MentionEveryone)
      .edit(ROLE.north, { permissions: MentionEveryone | KickMembers });
    const shown = gateway.server(HOME);
    expect(shown?.roles.find((role) => role.id === ROLE.north)?.moderation).toEqual([
      'Kick Members',
    ]);
    expect(shown?.roles.find((role) => role.everyone)).toMatchObject({ id: HOME, moderation: [] });
    expect(shown?.ownerId).toBe(server.ownerId);
    expect(() => server.edit(ROLE.north, { moderation: ['Fly'] })).toThrow('no permission');
  });
});
```

Apply to `test/support/fake-interactions.test.ts`:

```diff
--- a/test/support/fake-interactions.test.ts
+++ b/test/support/fake-interactions.test.ts
@@ -1,4 +1,4 @@
-import { MessageFlags } from 'discord.js';
+import { MessageFlags, PermissionFlagsBits } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
   FAKE_CHANNEL_ID,
@@ -35,6 +35,54 @@ describe('fake interactions', () => {
     expect(modal.fields.getTextInputValue('other')).toBe('');
   });
 
+  it('shows a member with the roles of `roleIds` that the server has, and @everyone', () => {
+    const i = fakeChatInput({
+      guildRoleNames: { '11': 'North', '12': 'South' },
+      roleNames: ['admin'],
+      roleIds: ['12', '99'],
+    });
+    expect(i.member?.roles.cache.map((role) => role.name)).toEqual(['admin', '@everyone', 'South']);
+    expect([...(i.member?.roles.cache.keys() ?? [])]).toEqual(['0', i.guildId, '12']);
+    // Without `roleIds` a member is as before: the roles of `roleNames` only.
+    expect(fakeChatInput({ roleNames: ['admin'] }).member?.roles.cache.size).toBe(1);
+  });
+
+  it('has the time it was made and what the member may do, as a test says them', () => {
+    const made = fakeChatInput({
+      createdTimestamp: 1_800_000_000_000,
+      permissions: PermissionFlagsBits.Administrator,
+    });
+    expect(made.createdTimestamp).toBe(1_800_000_000_000);
+    // As in discord.js, an administrator has every permission, and nothing in a channel
+    // changes that unless a test says so.
+    expect(made.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(true);
+    expect(made.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(true);
+    const plain = fakeChatInput();
+    expect(Math.abs(plain.createdTimestamp - Date.now())).toBeLessThan(60_000);
+    expect(plain.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(false);
+    expect(plain.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(false);
+    expect(fakeChatInput({ isDm: true }).memberPermissions).toBeNull();
+    expect(fakeChatInput({ isDm: true }).member).toBeNull();
+  });
+
+  it('keeps what a member may do on the server apart from what they may do in the channel', () => {
+    // The channel permission "Manage Permissions" is the bit of the server's Manage Roles.
+    const inChannel = fakeChatInput({ memberPermissions: PermissionFlagsBits.ManageRoles });
+    expect(inChannel.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(true);
+    expect(inChannel.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(false);
+    const onServer = fakeChatInput({
+      permissions: PermissionFlagsBits.ManageRoles,
+      memberPermissions: 0n,
+    });
+    expect(onServer.member?.permissions.has(PermissionFlagsBits.ManageRoles)).toBe(true);
+    expect(onServer.memberPermissions?.has(PermissionFlagsBits.ManageRoles)).toBe(false);
+    // As in discord.js, neither can be changed: adding to one makes another.
+    onServer.member?.permissions.add(PermissionFlagsBits.KickMembers);
+    onServer.memberPermissions?.add(PermissionFlagsBits.KickMembers);
+    expect(onServer.member?.permissions.has(PermissionFlagsBits.KickMembers)).toBe(false);
+    expect(onServer.memberPermissions?.has(PermissionFlagsBits.KickMembers)).toBe(false);
+  });
+
   it('gives option values by type, and null for an option that was not given', () => {
     const i = fakeChatInput({
       subcommandGroup: 'boss',
```

Apply to `test/support/fake-interactions.ts`:

```diff
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -1,4 +1,4 @@
-import { Collection, MessageFlags, type APIEmbed } from 'discord.js';
+import { Collection, MessageFlags, PermissionsBitField, type APIEmbed } from 'discord.js';
 import { vi } from 'vitest';
 
 /** What a test may want to read back from a reply, follow-up or edit. */
@@ -39,6 +39,27 @@ export interface FakeOptions {
   isDm?: boolean;
   userId?: string;
   roleNames?: string[];
+  /**
+   * The ids of the roles of the server the member holds, for code that works with role ids
+   * (their names come from `guildRoleNames`). As in discord.js, `member.roles.cache` then also
+   * has the role every member has (`@everyone`, whose id is the server's), and lacks a role
+   * that the server's own cache does not have.
+   */
+  roleIds?: string[];
+  /**
+   * What the member may do on the server, as Discord's bit field: `interaction.member.permissions`
+   * (a `GuildMember`'s: what their roles grant, whatever the channel; nothing unless a test
+   * says so). As in discord.js it cannot be changed, and an administrator has every permission.
+   */
+  permissions?: bigint;
+  /**
+   * What the member may do in the channel of the interaction: `interaction.memberPermissions`
+   * (null in a DM). A channel's overwrites can add to what the server grants or take from it,
+   * so it may differ from `permissions`; without it the channel changes nothing.
+   */
+  memberPermissions?: bigint;
+  /** When the interaction was made: `interaction.createdTimestamp` (now unless a test says so). */
+  createdTimestamp?: number;
   /** The member's name in the server: `interaction.member.displayName`. */
   displayName?: string;
   /** Option values by name, for getString, getInteger, getNumber and getBoolean. */
@@ -182,9 +203,23 @@ function base(kind: Kind, o: FakeOptions) {
   });
   /** Whether the interaction was acknowledged with `deferUpdate`. */
   let updating = false;
+  const memberRoles: [string, { id: string; name: string }][] = (o.roleNames ?? []).map(
+    (name, i) => [String(i), { id: String(i), name }],
+  );
+  if (o.roleIds && guildId !== null) {
+    memberRoles.push([guildId, { id: guildId, name: '@everyone' }]);
+    for (const id of o.roleIds) {
+      const name = o.guildRoleNames?.[id];
+      if (name !== undefined) memberRoles.push([id, { id, name }]);
+    }
+  }
   const interaction = {
     id: '900000000000000001',
     type: TYPE[kind],
+    createdTimestamp: o.createdTimestamp ?? Date.now(),
+    memberPermissions: o.isDm
+      ? null
+      : new PermissionsBitField(o.memberPermissions ?? o.permissions ?? 0n).freeze(),
     commandName: o.commandName,
     customId: o.customId,
     guildId,
@@ -194,10 +229,9 @@ function base(kind: Kind, o: FakeOptions) {
       ? null
       : {
           displayName: o.displayName ?? 'Member',
+          permissions: new PermissionsBitField(o.permissions ?? 0n).freeze(),
           roles: {
-            cache: new Collection(
-              (o.roleNames ?? []).map((name, i) => [String(i), { id: String(i), name }]),
-            ),
+            cache: new Collection(memberRoles),
           },
         },
     guild:
```

Create `test/support/roles.ts`:

```ts
import type { RoleGateway, RoleWriteOutcome } from '../../src/discord/role-gateway.js';
import { addedModeration, MODERATION_PERMISSIONS } from '../../src/discord/role-permissions.js';
import type { ServerRoles, StaffStanding } from '../../src/domain/roles/self-roles.js';
import { SelfRoleService } from '../../src/services/self-role-service.js';
import { FAKE_GUILD_ID, FAKE_USER_ID, type FakeOptions } from './fake-interactions.js';
import { MemorySelfRoles } from './self-roles.js';
import { createTestLogger } from './test-logger.js';

/** A role of the fake server, as Discord keeps it. */
export interface FakeRole {
  id: string;
  name: string;
  position: number;
  managed: boolean;
  /** Everything the role grants, as Discord's bit field. */
  permissions: bigint;
}

/**
 * What a test says about a role: `moderation` names permissions as Discord's settings show
 * them (`MODERATION_PERMISSIONS`) and stands for the role's whole bit field; `permissions`
 * gives the bit field itself.
 */
export type FakeRoleChange = Partial<Omit<FakeRole, 'id'>> & { moderation?: readonly string[] };

function permissionsOf(names: readonly string[]): bigint {
  let bits = 0n;
  for (const name of names) {
    const found = MODERATION_PERMISSIONS.find(([, known]) => known === name);
    if (!found) throw new Error(`"${name}" is no permission of moderation the bot knows`);
    bits |= found[0];
  }
  return bits;
}

function changed(change: FakeRoleChange): Partial<FakeRole> {
  const { moderation, ...rest } = change;
  return moderation === undefined ? rest : { ...rest, permissions: permissionsOf(moderation) };
}

/** One server of the fake gateway: its roles, the bot's standing, and who holds what. */
export class FakeRoleServer {
  readonly roles = new Map<string, FakeRole>();
  /** The roles each member holds, by user id, without `@everyone`. */
  readonly members = new Map<string, Set<string>>();
  bot = { mayManageRoles: true, highestPosition: 50 };
  /** The server's owner: the member of the fake interactions unless a test says otherwise. */
  ownerId: string = FAKE_USER_ID;

  constructor(
    readonly id: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.roles.set(id, { id, name: '@everyone', position: 0, managed: false, permissions: 0n });
  }

  /** What `@everyone` grants: a role is judged by what it adds to this. */
  everyone(permissions: bigint): this {
    return this.edit(this.id, { permissions });
  }

  /** A role of the server: harmless and below the bot unless `more` says otherwise. */
  role(id: string, name: string, more: FakeRoleChange = {}): this {
    this.roles.set(id, {
      id,
      name,
      position: 5,
      managed: false,
      permissions: 0n,
      ...changed(more),
    });
    return this;
  }

  /** Changes a role as staff would in the server's settings. */
  edit(id: string, change: FakeRoleChange): this {
    const role = this.roles.get(id);
    if (!role) throw new Error(`The fake server has no role ${id}`);
    this.roles.set(id, { ...role, ...changed(change) });
    return this;
  }

  /** Deletes a role; whoever held it holds it no more. */
  delete(id: string): this {
    this.roles.delete(id);
    for (const held of this.members.values()) held.delete(id);
    return this;
  }

  /** Makes somebody a member holding these roles. */
  member(userId: string, ...roleIds: string[]): this {
    for (const id of roleIds) {
      if (!this.roles.has(id)) throw new Error(`The fake server has no role ${id}`);
    }
    this.members.set(userId, new Set(roleIds));
    return this;
  }

  /** The ids of the roles a member holds now, sorted. */
  held(userId: string): string[] {
    return [...(this.members.get(userId) ?? [])].sort();
  }

  /** The names of the roles a member holds now, sorted. */
  heldNames(userId: string): string[] {
    return this.held(userId)
      .map((id) => this.roles.get(id)?.name ?? id)
      .sort();
  }

  /** A member as an interaction made at this moment shows them to the service. */
  seen(userId: string = FAKE_USER_ID) {
    return { id: userId, held: this.held(userId), seenAt: this.now() };
  }

  /** A member as staff: with the roles they hold now, and Manage Roles or not. */
  staff(userId: string = FAKE_USER_ID, mayManageRoles = false): StaffStanding {
    return { id: userId, held: this.held(userId), mayManageRoles };
  }

  /**
   * What a fake interaction of this member needs to show them as Discord would at this moment:
   * the server, its roles by name, the ones the member holds, and the time. A test that keeps
   * the result has an interaction that was made then, whatever happens to the member after.
   */
  interactionOf(userId: string = FAKE_USER_ID): FakeOptions {
    return {
      guildId: this.id,
      userId,
      guildRoleNames: Object.fromEntries([...this.roles].map(([id, role]) => [id, role.name])),
      roleIds: this.held(userId),
      createdTimestamp: this.now(),
    };
  }
}

/** One request the fake gateway got. */
export interface FakeRoleCall {
  guildId: string;
  memberId: string;
  action: 'give' | 'take';
  roleId: string;
  reason: string;
}

/**
 * Discord's roles for tests: servers with roles and members, kept in memory. As strict as
 * Discord about giving or taking one role: it is refused (`no-permission`) when the bot lacks
 * Manage Roles or the role is managed or stands at or above the bot's highest role, `no-role`
 * for a role the server does not have, `no-member` for somebody who is no member. Everything
 * else a member holds is left exactly as it is. It throws for a server it does not have and
 * for `@everyone` (which the caller must never send). A role's `moderation` is what its
 * permissions add to those of `@everyone`, as in the real gateway. Like Discord it answers in a
 * later turn of the event loop. `calls` records every request, also a refused one.
 */
export class FakeRoleGateway implements RoleGateway {
  readonly servers = new Map<string, FakeRoleServer>();
  readonly calls: FakeRoleCall[] = [];
  /** The time the servers' interactions are made at; `selfRolesWith` sets its clock. */
  now: () => number = () => Date.now();
  /** Set to make every request reject, as Discord being away would. */
  failing: Error | undefined;
  /** Set to make every request be refused for this reason. */
  refusing: Exclude<RoleWriteOutcome, 'ok'> | undefined;
  /** While set, a request is answered only once this has resolved: for what happens meanwhile. */
  holding: Promise<void> | undefined;
  /**
   * Runs just before a request is answered, with the request: for what somebody else does to
   * the server between the bot's look at it and the arrival of its request.
   */
  meanwhile: ((call: FakeRoleCall) => void) | undefined;

  /** The server with this id, made when it is first asked for. */
  add(guildId: string = FAKE_GUILD_ID): FakeRoleServer {
    let server = this.servers.get(guildId);
    if (!server) {
      server = new FakeRoleServer(guildId, () => this.now());
      this.servers.set(guildId, server);
    }
    return server;
  }

  server(guildId: string): ServerRoles | undefined {
    const server = this.servers.get(guildId);
    if (!server) return undefined;
    const everyone = server.roles.get(guildId)?.permissions ?? 0n;
    return {
      roles: [...server.roles.values()].map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        everyone: role.id === guildId,
        managed: role.managed,
        moderation: addedModeration(role.permissions, everyone),
      })),
      bot: { ...server.bot },
      ownerId: server.ownerId,
    };
  }

  /** The requests so far as short texts: "give North", "take Valor" (the id of a role without a name). */
  said(guildId: string = FAKE_GUILD_ID): string[] {
    const roles = this.servers.get(guildId)?.roles;
    return this.calls
      .filter((call) => call.guildId === guildId)
      .map((call) => `${call.action} ${roles?.get(call.roleId)?.name ?? call.roleId}`);
  }

  giveRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.request({ guildId, memberId, action: 'give', roleId, reason });
  }

  takeRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.request({ guildId, memberId, action: 'take', roleId, reason });
  }

  private request(call: FakeRoleCall): Promise<RoleWriteOutcome> {
    this.calls.push(call);
    const held = this.holding ?? Promise.resolve();
    return new Promise((resolve, reject) => {
      const answer = (): void => {
        try {
          this.meanwhile?.(call);
          if (this.failing) throw this.failing;
          resolve(this.refusing ?? this.apply(call));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      void held.then(() => setImmediate(answer));
    });
  }

  private apply({ guildId, memberId, action, roleId }: FakeRoleCall): RoleWriteOutcome {
    const server = this.servers.get(guildId);
    if (!server) throw new Error(`Unknown Guild ${guildId}`);
    if (roleId === guildId) throw new Error('@everyone is no role to give or take');
    const held = server.members.get(memberId);
    if (!held) return 'no-member';
    const role = server.roles.get(roleId);
    if (!role) return 'no-role';
    if (!server.bot.mayManageRoles || role.managed || role.position >= server.bot.highestPosition) {
      return 'no-permission';
    }
    if (action === 'give') held.add(roleId);
    else held.delete(roleId);
    return 'ok';
  }
}

/** Role ids of the sample server. */
export const ROLE = {
  north: '510000000000000001',
  south: '510000000000000002',
  east: '510000000000000003',
  instinct: '520000000000000001',
  mystic: '520000000000000002',
  valor: '520000000000000003',
  trader: '530000000000000001',
  moderator: '590000000000000001',
  admin: '590000000000000002',
  booster: '590000000000000003',
  bot: '590000000000000004',
} as const;

/**
 * A service over memory and the fake gateway, with a clock a test can move (the service's, and
 * the one the server's interactions are dated by). `server` is the server of the fake
 * interactions, owned by their member: it has region roles (North, South, East), team roles
 * (Instinct, Mystic, Valor), a role without a group (Trader), and what must never be handed
 * out (Moderator and Admin, the booster role, the bot's own role). Nothing is self-assignable
 * until a test says so; `offerSample()` adds the three kinds with their groups, regions first,
 * as the server's owner.
 */
export function selfRolesWith(kept: { storage?: MemorySelfRoles; gateway?: FakeRoleGateway } = {}) {
  const storage = kept.storage ?? new MemorySelfRoles();
  const gateway = kept.gateway ?? new FakeRoleGateway();
  const clock = { now: 1_800_000_000_000 };
  gateway.now = () => clock.now;
  const { log, entries } = createTestLogger();
  const selfRoles = new SelfRoleService({ storage, gateway, log, now: () => clock.now });
  const server = gateway.add(FAKE_GUILD_ID);
  if (!kept.gateway) {
    server
      .role(ROLE.north, 'North')
      .role(ROLE.south, 'South')
      .role(ROLE.east, 'East')
      .role(ROLE.instinct, 'Instinct')
      .role(ROLE.mystic, 'Mystic')
      .role(ROLE.valor, 'Valor')
      .role(ROLE.trader, 'Trader')
      .role(ROLE.moderator, 'Moderator', { position: 40, moderation: ['Kick Members'] })
      .role(ROLE.admin, 'Admin', { position: 60, moderation: ['Administrator'] })
      .role(ROLE.booster, 'Server Booster', { position: 30, managed: true })
      .role(ROLE.bot, 'Professor Pine', { position: 50, managed: true });
  }
  /** The server's owner, who may offer any role. */
  const owner = (): StaffStanding => ({ id: server.ownerId, held: [], mayManageRoles: false });
  /** Regions (any number of them), Teams (pick one) and Trader without a group. */
  const offerSample = async (): Promise<{ regions: number; teams: number }> => {
    const made = async (name: string, pickOne: boolean): Promise<number> => {
      const saved = await storage.saveGroup(FAKE_GUILD_ID, { name, pickOne });
      if (saved.kind === 'refused') throw new Error(`group ${name}: ${saved.reason}`);
      return saved.group.id;
    };
    const regions = await made('Regions', false);
    const teams = await made('Teams', true);
    const offer = async (roleId: string, more: object = {}): Promise<void> => {
      const added = await selfRoles.addRole(FAKE_GUILD_ID, { roleId, ...more }, owner());
      if (added.kind !== 'added') throw new Error(`role ${roleId}: ${added.kind}`);
    };
    await offer(ROLE.north, {
      groupId: regions,
      description: 'North of the river',
      aliases: ['n'],
    });
    await offer(ROLE.south, { groupId: regions });
    await offer(ROLE.east, { groupId: regions });
    await offer(ROLE.instinct, { groupId: teams });
    await offer(ROLE.mystic, { groupId: teams });
    await offer(ROLE.valor, { groupId: teams });
    await offer(ROLE.trader, { description: 'Open to trades' });
    return { regions, teams };
  };
  return { selfRoles, storage, gateway, server, clock, entries, owner, offerSample };
}
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -19,6 +19,7 @@ import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
+import { selfRolesWith } from './roles.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { MemoryGymTargets } from './gym-targets.js';
@@ -66,6 +67,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     newTrains: new MemoryNewTrains(),
     // Nobody is a member of any server; a test passes its own directory with members.
     members: new FakeMemberDirectory(),
+    // No server offers any role; a test passes { selfRoles } from selfRolesWith().
+    selfRoles: selfRolesWith().selfRoles,
     // What is put in line is only recorded; a test passes its own to read it.
     dms: new RecordingDms(),
     partyService: unavailable<PartyService>(
```

Run: `npx vitest run --project unit src/services/self-role-service.test.ts test/support/fake-interactions.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -21,6 +21,7 @@ import type { RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidChangeService } from './services/raid-change-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionProvider } from './services/region-directory.js';
+import type { SelfRoleService } from './services/self-role-service.js';
 import type { SpawnService } from './services/spawn-service.js';
 import type { MapProvider } from './services/static-maps.js';
 import type { TimedPartyService } from './services/timed-party-service.js';
@@ -68,6 +69,8 @@ export interface AppContext {
   readonly newTrains: NewTrainStorage;
   /** Members of a server other than the one who is acting: one by id, or who of many can see a channel. */
   readonly members: MemberDirectory;
+  /** The roles members give themselves: what a server offers, and giving and taking them. */
+  readonly selfRoles: SelfRoleService;
   /** Reports of wild Pokémon: the message in the region's channel and its removal. */
   readonly spawns: SpawnService;
   /** Direct messages: put in line, and sent at a fixed rate. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -17,6 +17,7 @@ import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
 import { SavedRouteRepository } from './db/repositories/saved-route-repository.js';
+import { SelfRoleRepository } from './db/repositories/self-role-repository.js';
 import { UnownGiftRepository } from './db/repositories/unown-gift-repository.js';
 import { UserRepository } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
@@ -26,6 +27,7 @@ import { enabledCommands } from './discord/command.js';
 import { DiscordDmGateway } from './discord/dm-gateway.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
+import { DiscordRoleGateway } from './discord/role-gateway.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
@@ -50,6 +52,7 @@ import { TrainService } from './services/train-service.js';
 import { UnownWantService } from './services/unown-want-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
 import { RegionDirectory } from './services/region-directory.js';
+import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
 import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
@@ -117,6 +120,12 @@ export async function startApp(
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const partyGateway = new DiscordPartyGateway();
   const members = new DiscordMemberDirectory({ log });
+  const roleGateway = new DiscordRoleGateway();
+  const selfRoles = new SelfRoleService({
+    storage: new SelfRoleRepository(db),
+    gateway: roleGateway,
+    log,
+  });
   const dmGateway = new DiscordDmGateway();
   const dms = new QueuedDmSender({ gateway: dmGateway, log });
   // Listens to the store: whoever signs up for a party in a forum they cannot see is let in.
@@ -297,6 +306,7 @@ export async function startApp(
     gymTargets,
     newTrains,
     members,
+    selfRoles,
     spawns,
     dms,
     pokemon,
@@ -317,6 +327,7 @@ export async function startApp(
     configure(client) {
       partyGateway.use(client);
       members.use(client);
+      roleGateway.use(client);
       dmGateway.use(client);
       client.once(Events.ClientReady, (ready) => {
         log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
@@ -411,6 +422,9 @@ export async function startApp(
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
+      // A member's roles are changed one request after the other: a change that has begun is
+      // finished while Discord is connected and the database is open.
+      { name: 'self-assigned roles', timeoutMs: 5_000, run: () => selfRoles.idle() },
       // The spawn reports that wait for their half hour are deleted now: they would stay for good.
       { name: 'spawn reports', timeoutMs: 5_000, run: () => spawns.flush() },
       // Whoever is still being looked up for an event is put in line before the line is drained.
```

Create `src/discord/role-gateway.ts`:

```ts
import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes, type Client } from 'discord.js';
import type { ServerRoles } from '../domain/roles/self-roles.js';
import { addedModeration } from './role-permissions.js';

/**
 * Why Discord would not give or take a role, as far as somebody can mend it and no retry
 * changes it:
 * - `no-permission`: the bot lacks Manage Roles, or the role is managed or not below its own;
 * - `no-role`: the server has no such role (it was deleted a moment ago);
 * - `no-member`: the server has no such member (they left a moment ago);
 * - `two-factor`: the server requires two-factor authentication of its moderators, and the
 *   account that owns the bot's application has none.
 */
export type RoleRefusal = 'no-permission' | 'no-role' | 'no-member' | 'two-factor';

/** What became of giving or taking one role. */
export type RoleWriteOutcome = 'ok' | RoleRefusal;

/**
 * Everything self-assigned roles ask of Discord, so that all above it can be tested without it.
 * A member's roles are only ever changed one role at a time: there is no way to set the whole
 * list, which would put back or strip whatever somebody else changed since the bot last looked.
 */
export interface RoleGateway {
  /**
   * The roles of a server and what the bot can do with roles there, as they are now; undefined
   * for a server the bot does not know (at this moment: its cache may lack one for a while
   * after a reconnect). Nothing is asked of Discord for this.
   */
  server(guildId: string): ServerRoles | undefined;
  /**
   * Gives a member one role; nothing changes for one who has it. `reason` goes into the
   * server's audit log. Throws for any failure `RoleRefusal` does not name.
   */
  giveRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome>;
  /** Takes one role away from a member; nothing changes for one who lacks it. As `giveRole`. */
  takeRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome>;
}

/** Discord's answers that somebody can mend, and that no retry changes. */
const REFUSALS: ReadonlyMap<number | string, RoleRefusal> = new Map<number, RoleRefusal>([
  [RESTJSONErrorCodes.MissingPermissions, 'no-permission'],
  [RESTJSONErrorCodes.MissingAccess, 'no-permission'],
  [RESTJSONErrorCodes.UnknownRole, 'no-role'],
  [RESTJSONErrorCodes.UnknownMember, 'no-member'],
  [RESTJSONErrorCodes.TwoFactorAuthenticationIsRequired, 'two-factor'],
]);

/**
 * The gateway over a discord.js client: thin, and without unit tests like the party gateway
 * (the staging run is its test). The client is handed over once it exists; before that no
 * server is known.
 *
 * The roles of a server come from the cache, which the Guilds intent keeps current (roles
 * made, changed and deleted arrive as events), and so does the bot's own member, which
 * discord.js always keeps. A role's place is its `rawPosition`, the number Discord itself
 * compares; two roles can share one, and a role level with the bot's highest is treated as
 * above it. A role is judged by the permissions it adds to those of `@everyone`
 * (`addedModeration`), read at the moment of asking. A role is given with `PUT` and taken away
 * with `DELETE` of that one role of the member, which Discord allows without the member being
 * cached or fetched.
 */
export class DiscordRoleGateway implements RoleGateway {
  private current: Client | undefined;

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  server(guildId: string): ServerRoles | undefined {
    const guild = this.current?.guilds.cache.get(guildId);
    const me = guild?.members.me;
    if (!guild || !me) return undefined;
    const everyone = guild.roles.everyone.permissions.bitfield;
    return {
      roles: guild.roles.cache.map((role) => ({
        id: role.id,
        name: role.name,
        position: role.rawPosition,
        everyone: role.id === guild.id,
        managed: role.managed,
        moderation: addedModeration(role.permissions.bitfield, everyone),
      })),
      bot: {
        mayManageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
        highestPosition: me.roles.highest.rawPosition,
      },
      ownerId: guild.ownerId,
    };
  }

  private async write(
    action: 'addRole' | 'removeRole',
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    const guild = this.current?.guilds.cache.get(guildId);
    if (!guild) throw new Error(`The server ${guildId} is not known`);
    if (roleId === guild.id) throw new Error('@everyone is no role to give or take');
    try {
      await guild.members[action]({ user: memberId, role: roleId, reason });
      return 'ok';
    } catch (err) {
      const refusal = err instanceof DiscordAPIError ? REFUSALS.get(err.code) : undefined;
      if (refusal) return refusal;
      throw err;
    }
  }

  giveRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.write('addRole', guildId, memberId, roleId, reason);
  }

  takeRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.write('removeRole', guildId, memberId, roleId, reason);
  }
}
```

Create `src/services/self-role-service.ts`:

```ts
import { BoundedMap } from '../bounded-map.js';
import type {
  GroupSaved,
  RoleSaved,
  SelfRoleRows,
  SelfRoleStorage,
} from '../db/repositories/self-role-repository.js';
import type { RoleGateway, RoleRefusal } from '../discord/role-gateway.js';
import type { GroupInput, RoleInput } from '../domain/roles/self-role-edits.js';
import {
  buildRoster,
  offerProblem,
  planChange,
  roleProblem,
  takeable,
  type ChangeRequest,
  type IntrinsicProblem,
  type OfferProblem,
  type PlannedChange,
  type RoleProblem,
  type Roster,
  type RosterEntry,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
  type StaffStanding,
} from '../domain/roles/self-roles.js';
import type { Logger } from '../log.js';
import { KeyedLock } from './keyed-lock.js';

/** The member of an interaction: who they are and the roles that interaction showed them with. */
export interface RoleMember {
  id: string;
  /** The ids of the roles they hold, without the role every member has. */
  held: readonly string[];
  /** When the interaction was made (its `createdTimestamp`): `held` is how Discord saw them then. */
  seenAt: number;
}

/** One request to Discord: a role given, or a role taken away. */
export interface RoleStep {
  action: 'give' | 'take';
  entry: RosterEntry;
}

/**
 * Why a step that was planned was not sent after all: by the time its turn came, the role had
 * a problem (`RoleProblem`), no row of the server led to it any more (`not-offered`), or the
 * bot could not see the server's roles (`unavailable`).
 */
export type Withdrawal = RoleProblem | 'not-offered' | 'unavailable';

/**
 * A step that was not carried out: Discord refused it (`RoleRefusal`), `error` for a failure
 * of another kind after something of the plan had been done already (it is logged), or
 * `withdrawn` for a step Discord was never asked for, because the list or the server had
 * changed since the plan was made (`why`; `entry` is then the role as it stands now, where a
 * row still leads to it).
 */
export type RoleFailure = RoleStep &
  ({ reason: RoleRefusal | 'error' } | { reason: 'withdrawn'; why: Withdrawal });

/** What was really done of a plan. */
interface Carried {
  plan: PlannedChange;
  /** The roles that were given, in the order of the requests. */
  given: RosterEntry[];
  /** The roles that were taken away. */
  taken: RosterEntry[];
  /** What the member holds now, as far as the bot knows: for showing, never for writing. */
  held: string[];
  /**
   * What the server offers, read after the last request of the change (the newest the service
   * saw, should that reading fail): what is shown after a change is the server as it is then.
   */
  roster: Roster;
}

/**
 * What came of a member's request:
 * - `unavailable`: the bot does not know the server's roles at this moment;
 * - `done`: the plan was carried out (it may have been empty);
 * - `partial`: a step failed, or was withdrawn before it was sent. What had been done before it
 *   stays done (`given`, `taken`; both may be empty), `failed` is the step with the reason, and
 *   `untried` what was to follow it, which was not asked of Discord.
 */
export type RoleChangeOutcome =
  | { kind: 'unavailable' }
  | ({ kind: 'done' } & Carried)
  | ({ kind: 'partial'; failed: RoleFailure; untried: RoleStep[] } & Carried);

/** What came of staff adding a role or changing one. */
export type RoleAdded =
  | { kind: 'unavailable' }
  /** The server has no such role (any more). */
  | { kind: 'no-role' }
  /** A role that is never handed out. */
  | { kind: 'unfit'; problem: IntrinsicProblem; role: ServerRole }
  /** A role this member of staff could not give anybody by hand. */
  | { kind: 'not-yours'; problem: OfferProblem; role: ServerRole }
  /** The rows refuse it: a name or an alias is taken, and the like. */
  | (Extract<RoleSaved, { kind: 'refused' }> & { role: ServerRole })
  | {
      kind: 'added' | 'changed';
      row: SelfRoleRow;
      role: ServerRole;
      /** Saved, but the bot cannot hand anything out while it lacks Manage Roles. */
      botLacksManageRoles: boolean;
    };

/** What the audit log of the server says about a change of this bot. */
const AUDIT_REASON = 'Self-assigned roles (/iam)';
/**
 * How long an interaction can be answered (the life of its token): for as long a request made
 * with it can still be waiting its turn or for Discord, so for as long the changes this service
 * made are remembered. Which of them are laid over an interaction is decided by when it was
 * made alone (`heldNow`).
 */
const INTERACTION_TOKEN_MS = 15 * 60_000;
/**
 * By how much the clock of this machine may be behind Discord's (which dates an interaction):
 * a change that finished this little before an interaction was made is still laid over it.
 */
const CLOCK_MARGIN_MS = 2_000;
/** Of as many members recent changes are remembered; the oldest go first. */
const MEMBERS_REMEMBERED = 2_000;

interface RecentChange {
  /** When the change was finished. */
  at: number;
  add: string[];
  remove: string[];
}

/**
 * Whether a planned step may still be sent, by a roster read just now: undefined when it may.
 * A give needs a row that leads to the role and has no problem; a take a row that leads to it
 * and that the bot can change (`takeable`).
 */
function withdrawal(
  roster: Roster,
  step: RoleStep,
  roleId: string,
): { why: Withdrawal; entry?: RosterEntry } | undefined {
  const entry = roster.entries.find((other) => other.role?.id === roleId);
  if (!entry) {
    // Its row may still be there without the role (deleted on Discord): the row says why.
    const row = roster.entries.find((other) => other.row.id === step.entry.row.id);
    return row?.problem !== undefined && row.role === undefined
      ? { why: row.problem, entry: row }
      : { why: 'not-offered' };
  }
  if (step.action === 'give') {
    return entry.problem === undefined ? undefined : { why: entry.problem, entry };
  }
  return takeable(entry) ? undefined : { why: entry.problem ?? 'gone', entry };
}

/**
 * Self-assigned roles (`ctx.selfRoles`): the rows of the database resolved against the roles a
 * server has, and what members and staff do with them. Commands and menus both go through it;
 * neither touches the storage or the gateway.
 *
 * A member's roles are changed one role at a time (`RoleGateway.giveRole`, `takeRole`), first
 * what is given, then what is taken away, and only roles a row of the server leads to: nothing
 * else a member holds is ever named to Discord, so whatever anybody else changed about the
 * member meanwhile stays as it is. The steps are not one transaction: when one fails, the ones
 * before it stay done, the ones after it are not tried, and the outcome says exactly that.
 *
 * The rule of what may be handed out is asked for every step at the moment it is sent, not only
 * when the plan is made: requests take time (Discord may make the bot wait), and a role can gain
 * a permission or leave the list while an earlier step is on its way. So the roster is read
 * again before every step that follows a request, and a step that no longer stands is withdrawn.
 *
 * What a member holds is what their interaction showed. A second interaction can be made before
 * the first one's requests have arrived at Discord, so the changes this service finished for a
 * member after an interaction was made are laid over what it shows (`heldNow`): for planning
 * and for what is shown, never for what is written. They are remembered for as long as an
 * interaction can be answered. A member's requests run one after the other.
 */
export class SelfRoleService {
  private readonly storage: SelfRoleStorage;
  private readonly gateway: RoleGateway;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly lock = new KeyedLock<string>();
  /** Per member of a server; set in the order of the newest change's time. */
  private readonly recent = new BoundedMap<string, RecentChange[]>(MEMBERS_REMEMBERED);

  constructor(options: {
    storage: SelfRoleStorage;
    gateway: RoleGateway;
    log: Logger;
    now?: () => number;
  }) {
    this.storage = options.storage;
    this.gateway = options.gateway;
    this.log = options.log;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * What a server offers, resolved against its roles as they are now; undefined when the bot
   * does not know the server's roles at this moment. What resolving found (the id of a legacy
   * row, a role's new name) is written on the way; a failure of that is logged and changes
   * nothing about the answer.
   */
  async roster(guildId: string): Promise<Roster | undefined> {
    const server = this.gateway.server(guildId);
    if (!server) return undefined;
    const { rows, groups } = await this.storage.list(guildId);
    const { roster, writes } = buildRoster(rows, groups, server);
    if (writes.links.length > 0 || writes.renames.length > 0) {
      try {
        const written = await this.storage.remember(guildId, writes);
        if (written > 0) {
          this.log.info(
            { guild: guildId, linked: writes.links.length, renamed: writes.renames.length },
            'self-assigned roles brought up to date with the server',
          );
        }
      } catch (err) {
        this.log.warn({ err, guild: guildId }, 'could not remember resolved roles');
      }
    }
    return roster;
  }

  /** The rows and groups as stored, whatever the server's roles are: for staff's lists. */
  stored(guildId: string): Promise<SelfRoleRows> {
    return this.storage.list(guildId);
  }

  /**
   * The roles a member holds now, as far as the bot knows: those their interaction showed, with
   * the changes this service finished for them after that interaction was made laid over (in
   * their order). For planning a change and for what a member is shown; nothing is ever written
   * to Discord from it.
   */
  heldNow(guildId: string, member: RoleMember): string[] {
    const held = new Set(member.held);
    for (const change of this.recentOf(`${guildId}:${member.id}`)) {
      if (change.at <= member.seenAt - CLOCK_MARGIN_MS) continue;
      for (const id of change.remove) held.delete(id);
      for (const id of change.add) held.add(id);
    }
    return [...held];
  }

  private recentOf(key: string): RecentChange[] {
    const changes = this.recent.get(key);
    if (!changes) return [];
    const fresh = changes.filter((change) => change.at > this.now() - INTERACTION_TOKEN_MS);
    if (fresh.length === 0) this.recent.delete(key);
    return fresh;
  }

  private remember(key: string, given: readonly RosterEntry[], taken: readonly RosterEntry[]) {
    const ids = (entries: readonly RosterEntry[]): string[] =>
      entries.flatMap((entry) => (entry.role ? [entry.role.id] : []));
    const now = this.now();
    // Every entry ends with its newest change, and the newest change of all is set last.
    this.recent.dropWhile((changes) => (changes.at(-1)?.at ?? 0) <= now - INTERACTION_TOKEN_MS);
    this.recent.set(key, [...this.recentOf(key), { at: now, add: ids(given), remove: ids(taken) }]);
  }

  /**
   * Gives a member roles and takes roles away, as far as `planChange` allows it: one request to
   * Discord per role, what is given first, and none when nothing changes. It stops at the first
   * step that fails (so a role of a pick-one group is not taken away when the one that was to
   * replace it could not be given), and before a step that no longer stands when its turn
   * comes (`withdrawal`). A failure Discord does not explain is thrown when nothing was done
   * yet, and reported like a refusal when something was.
   */
  change(guildId: string, member: RoleMember, request: ChangeRequest): Promise<RoleChangeOutcome> {
    const key = `${guildId}:${member.id}`;
    return this.lock.run(key, async (): Promise<RoleChangeOutcome> => {
      let roster = await this.roster(guildId);
      if (!roster) return { kind: 'unavailable' };
      const held = new Set(this.heldNow(guildId, member));
      const plan = planChange(roster, held, request);
      const steps: RoleStep[] = [
        ...plan.add.map((entry) => ({ action: 'give' as const, entry })),
        ...plan.remove.map((entry) => ({ action: 'take' as const, entry })),
      ];
      const given: RosterEntry[] = [];
      const taken: RosterEntry[] = [];
      let failed: RoleFailure | undefined;
      let tried = 0;
      /** Whether a request went to Discord since `roster` was read: it took time. */
      let aged = false;
      for (const step of steps) {
        tried += 1;
        const roleId = step.entry.role?.id;
        if (roleId === undefined) continue;
        let outcome: RoleRefusal | 'error' | 'ok';
        try {
          if (aged) {
            const fresh = await this.roster(guildId);
            aged = false;
            if (fresh) roster = fresh;
            const stopped = fresh
              ? withdrawal(fresh, step, roleId)
              : { why: 'unavailable' as const };
            if (stopped) {
              failed = {
                action: step.action,
                entry: stopped.entry ?? step.entry,
                reason: 'withdrawn',
                why: stopped.why,
              };
              break;
            }
          }
          aged = true;
          outcome =
            step.action === 'give'
              ? await this.gateway.giveRole(guildId, member.id, roleId, AUDIT_REASON)
              : await this.gateway.takeRole(guildId, member.id, roleId, AUDIT_REASON);
        } catch (err) {
          if (given.length + taken.length === 0) throw err;
          this.log.error(
            { err, guild: guildId, member: member.id, role: step.entry.name, action: step.action },
            'a change of self-assigned roles failed half-way',
          );
          outcome = 'error';
        }
        if (outcome !== 'ok') {
          failed = { ...step, reason: outcome };
          break;
        }
        if (step.action === 'give') {
          given.push(step.entry);
          held.add(roleId);
        } else {
          taken.push(step.entry);
          held.delete(roleId);
        }
      }
      const names = (entries: readonly RosterEntry[]): string[] =>
        entries.map((entry) => entry.name);
      if (given.length + taken.length > 0) {
        this.remember(key, given, taken);
        this.log.info(
          { guild: guildId, member: member.id, added: names(given), removed: names(taken) },
          'self-assigned roles changed',
        );
      }
      if (aged) {
        // What is shown after the change is the server as it is after it.
        try {
          roster = (await this.roster(guildId)) ?? roster;
        } catch (err) {
          this.log.warn({ err, guild: guildId }, 'could not read the roles after a change');
        }
      }
      const carried = { plan, given, taken, held: [...held], roster };
      if (!failed) return { kind: 'done', ...carried };
      const untried = steps.slice(tried);
      this.log.warn(
        {
          guild: guildId,
          member: member.id,
          action: failed.action,
          role: failed.entry.name,
          reason: failed.reason,
          ...(failed.reason === 'withdrawn' ? { why: failed.why } : {}),
          untried: untried.map((step) => `${step.action} ${step.entry.name}`),
        },
        failed.reason === 'withdrawn'
          ? 'a change of self-assigned roles was stopped'
          : 'Discord refused a change of self-assigned roles',
      );
      return { kind: 'partial', failed, untried, ...carried };
    });
  }

  /**
   * Staff make a role of the server self-assignable, or change what is said about one that is.
   * A role that is never handed out is refused here, with the reason; the same is asked again
   * every time a role is given. Nor may staff offer a role they could not give anybody by hand
   * (`offerProblem`): the list must not be a way around the server's order of roles.
   */
  async addRole(
    guildId: string,
    input: Omit<RoleInput, 'role'> & { roleId: string },
    staff: StaffStanding,
  ): Promise<RoleAdded> {
    const server = this.gateway.server(guildId);
    if (!server) return { kind: 'unavailable' };
    const role = server.roles.find((other) => other.id === input.roleId);
    if (!role) return { kind: 'no-role' };
    const problem = roleProblem(role, server.bot);
    if (problem !== undefined && problem !== 'no-manage-roles') {
      return { kind: 'unfit', problem, role };
    }
    const notTheirs = offerProblem(role, server, staff);
    if (notTheirs) return { kind: 'not-yours', problem: notTheirs, role };
    const { roleId: _roleId, ...said } = input;
    const saved = await this.storage.saveRole(guildId, {
      ...said,
      role: { id: role.id, name: role.name },
    });
    if (saved.kind === 'refused') return { ...saved, role };
    this.log.info(
      { guild: guildId, role: role.name, kind: saved.kind, by: staff.id },
      'self-assigned role saved',
    );
    return {
      kind: saved.kind,
      row: saved.row,
      role,
      botLacksManageRoles: problem === 'no-manage-roles',
    };
  }

  /** Staff take a row away; the Discord role and whoever holds it are left alone. */
  async removeRole(guildId: string, rowId: number): Promise<SelfRoleRow | undefined> {
    const removed = await this.storage.removeRole(guildId, rowId);
    if (removed)
      this.log.info({ guild: guildId, role: removed.name }, 'self-assigned role removed');
    return removed;
  }

  saveGroup(guildId: string, input: GroupInput): Promise<GroupSaved> {
    return this.storage.saveGroup(guildId, input);
  }

  removeGroup(
    guildId: string,
    groupId: number,
  ): Promise<{ group: SelfRoleGroup; roles: number } | undefined> {
    return this.storage.removeGroup(guildId, groupId);
  }

  /** Resolves once no member's change is running or waiting; for tests and for shutdown. */
  idle(): Promise<void> {
    return this.lock.whenIdle();
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/self-role-service.test.ts test/support/fake-interactions.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff ce24b66 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/discord/role-gateway.ts src/services/self-role-service.test.ts src/services/self-role-service.ts test/support/fake-interactions.test.ts test/support/fake-interactions.ts test/support/roles.ts test/support/test-context.ts
npm run typecheck; npx eslint src/app-context.ts src/app.ts src/discord/role-gateway.ts src/services/self-role-service.test.ts src/services/self-role-service.ts test/support/fake-interactions.test.ts test/support/fake-interactions.ts test/support/roles.ts test/support/test-context.ts   # both clean; the full check runs after the last task
git add src/app-context.ts src/app.ts src/discord/role-gateway.ts src/services/self-role-service.test.ts src/services/self-role-service.ts test/support/fake-interactions.test.ts test/support/fake-interactions.ts test/support/roles.ts test/support/test-context.ts
git commit -F <a file with the message below>
```

The commit message:

```
Self-assigned roles on Discord: the gateway, its fake, and the service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 3: Staff say which roles are self-assignable: the self-roles part of the admin command

**Files:**
- Create: `src/commands/admin/self-roles.test.ts`, `src/commands/admin/self-roles.ts`, `src/commands/roles/shared.ts`, `src/commands/roles/words.ts`
- Modify: `src/commands/admin/index.ts`, `src/commands/admin/setup-forums.ts`, `src/discord/command-group.test.ts`, `src/discord/command-group.ts`, `src/discord/command.ts`, `src/render/text.test.ts`, `src/render/text.ts`

**Interfaces:**
- Consumes: Task 2; `commandGroup` and the parts list of `src/commands/admin/index.ts`; `enabledCommands()`; `requireBotManagement`; `fitMessages` of `setup-forums.ts`.
- Produces: `SubcommandPart.enabled` and `GroupedCommand.forConfig` (`src/discord/command-group.ts`, `command.ts`): `enabledCommands()` narrows a command with subcommands to the ones its settings offer, for the router, `/help` and the deploy script alike; `fitMessages` in `src/render/text.ts`; `/admin self-roles add|remove|list|group|ungroup` (`src/commands/admin/self-roles.ts`); `src/commands/roles/shared.ts` (`roleMemberOf(interaction)`, the choices) and `words.ts` (the sentences for every problem and outcome).

Reference commit of the prototype for this task: `5099e03`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/admin/self-roles.test.ts`:

```ts
import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  sent,
} from '../../../test/support/fake-interactions.js';
import { ALICE } from '../../../test/support/parties.js';
import { ROLE, selfRolesWith } from '../../../test/support/roles.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { declaredSubcommands, enabledCommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { admin } from './index.js';

type Options = Record<string, string | number | boolean>;

/**
 * The fake server is owned by the member of the fake interactions (`FakeRoleServer.ownerId`),
 * whom the order of roles does not bind: a test of what staff may offer names another owner.
 */
function setup() {
  const made = selfRolesWith();
  const { ctx, entries } = createTestContext({ selfRoles: made.selfRoles });
  const router = new InteractionRouter(ctx, [admin], []);
  const run = async (subcommand: string, options: Options = {}, extra: object = {}) => {
    const { role, ...rest } = options;
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommandGroup: 'self-roles',
      subcommand,
      roleNames: ['Moderator'],
      // A role option arrives resolved; the text options as they were typed.
      options: subcommand === 'add' ? rest : options,
      ...(subcommand === 'add' && typeof role === 'string'
        ? { resolved: { role: { id: role } } }
        : {}),
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** Everything the member of staff was answered, message by message. */
  const answers = async (subcommand: string, options: Options = {}, extra: object = {}) => {
    const used = await run(subcommand, options, extra);
    const all = [used.editReply, used.followUp, used.reply].flatMap((mock) =>
      mock.mock.calls.map((call) => call[0].content ?? ''),
    );
    if (all.length === 0) throw new Error('nothing was answered');
    return all;
  };
  const answer = async (subcommand: string, options: Options = {}, extra: object = {}) =>
    (await answers(subcommand, options, extra)).join('\n');
  const choices = async (subcommand: string, focused: string) => {
    const interaction = fakeAutocomplete({
      commandName: 'admin',
      subcommandGroup: 'self-roles',
      subcommand,
      focused,
    });
    await router.handle(interaction as never);
    return interaction.respond.mock.calls[0]?.[0] ?? [];
  };
  const rows = async () => (await made.selfRoles.stored(FAKE_GUILD_ID)).rows;
  const groups = async () => (await made.selfRoles.stored(FAKE_GUILD_ID)).groups;
  return { ...made, ctx, entries, run, answer, answers, choices, rows, groups };
}

describe('/admin self-roles', () => {
  it('is a group of subcommands of /admin, and is not there when the feature is off', () => {
    const { ctx } = createTestContext();
    const paths = (config: typeof ctx.config) =>
      declaredSubcommands(enabledCommands([admin], config)[0]?.data.toJSON().options);
    expect(paths(ctx.config)).toEqual([
      'setup-forums',
      'save-party',
      'self-roles add',
      'self-roles remove',
      'self-roles list',
      'self-roles group',
      'self-roles ungroup',
    ]);
    const off = {
      ...ctx.config,
      settings: {
        ...ctx.config.settings,
        features: { ...ctx.config.settings.features, roles: false },
      },
    };
    expect(paths(off)).toEqual(['setup-forums', 'save-party']);
  });

  it('is for staff, and answers privately', async () => {
    const { run, rows } = setup();
    const refused = await run('add', { role: ROLE.north }, { roleNames: [] });
    expect(sent(refused.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(await rows()).toEqual([]);
    const allowed = await run('add', { role: ROLE.north });
    expect(sent(allowed.deferReply).flags).toBeDefined();
  });
});

describe('/admin self-roles add', () => {
  it('adds a role with its description, aliases and group', async () => {
    const { answer, rows, groups } = setup();
    await answer('group', { name: 'Regions' });
    expect(
      await answer('add', {
        role: ROLE.north,
        description: 'North of the river',
        aliases: 'N, Northside, n',
        group: 'regions',
      }),
    ).toBe(
      'Members can give themselves **North** with `/iam` now.\n' +
        'Group: Regions\nAliases: n, northside\nDescription: North of the river',
    );
    expect(await rows()).toEqual([
      {
        id: 1,
        name: 'North',
        description: 'North of the river',
        roleId: ROLE.north,
        groupId: (await groups())[0]?.id,
        aliases: ['n', 'northside'],
      },
    ]);
  });

  it('changes only what is said of a role that is there, and "none" clears', async () => {
    const { answer, rows } = setup();
    await answer('group', { name: 'Regions' });
    await answer('add', { role: ROLE.north, description: 'Up', aliases: 'n', group: 'Regions' });
    expect(await answer('add', { role: ROLE.north, aliases: 'top, up north' })).toBe(
      '**North** is changed.\nGroup: Regions\nAliases: top, up north\nDescription: Up',
    );
    expect(
      await answer('add', {
        role: ROLE.north,
        description: 'None',
        aliases: 'none',
        group: 'Other',
      }),
    ).toBe('**North** is changed.\nGroup: Other (no group)\nAliases: none\nDescription: none');
    expect(await rows()).toMatchObject([{ description: null, aliases: [], groupId: null }]);
  });

  it.each([
    [FAKE_GUILD_ID, '**@\u200beveryone** cannot be self-assigned: every member has it already.'],
    [
      ROLE.booster,
      '**Server Booster** cannot be self-assigned: it is managed by an integration (a bot role ' +
        'or the booster role), and Discord lets nobody hand such a role out.',
    ],
    [
      ROLE.moderator,
      '**Moderator** cannot be self-assigned: it grants Kick Members. I never hand out a role ' +
        'that grants a permission of moderation or administration.',
    ],
  ])('refuses the role %s with the reason', async (role, sentence) => {
    const { answer, rows } = setup();
    expect(await answer('add', { role })).toBe(sentence);
    expect(await rows()).toEqual([]);
  });

  it('names every moderation permission of a role it refuses, and what to do about a role above its own', async () => {
    const { answer, server } = setup();
    server.edit(ROLE.north, { moderation: ['Kick Members', 'Ban Members', 'Manage Roles'] });
    expect(await answer('add', { role: ROLE.north })).toContain(
      // In the order of the list of moderation permissions.
      'it grants Manage Roles, Kick Members and Ban Members.',
    );
    server.edit(ROLE.south, { position: 50 });
    expect(await answer('add', { role: ROLE.south })).toBe(
      '**South** cannot be self-assigned: it is not below my highest role, and I can only give ' +
        'roles that are. Move my role above it in the list of roles of this server.',
    );
  });

  it('lets staff add only a role they could give somebody by hand, and says which of the two is missing', async () => {
    const { answer, server, rows } = setup();
    // Somebody else owns the server; the member of staff holds Moderator (at 40).
    server.ownerId = '700000000000000099';
    server.role('540000000000000001', 'Level', { position: 40 });
    const moderator = {
      roleIds: [ROLE.moderator],
      guildRoleNames: { [ROLE.moderator]: 'Moderator' },
    };
    expect(await answer('add', { role: ROLE.north }, moderator)).toBe(
      'You cannot make **North** self-assignable: that takes the Manage Roles permission, ' +
        'which you do not have on this server. Whoever puts a role on the list gives it to ' +
        'everybody who asks.',
    );
    const managing = { ...moderator, permissions: PermissionFlagsBits.ManageRoles };
    expect(await answer('add', { role: '540000000000000001' }, managing)).toBe(
      'You cannot make **Level** self-assignable: it is not below your own highest role, so ' +
        'you could not give it to anybody yourself. Somebody whose role stands above it, or ' +
        'the owner of the server, has to add it.',
    );
    expect(await rows()).toEqual([]);
    expect(await answer('add', { role: ROLE.north }, managing)).toContain(
      'Members can give themselves **North** with `/iam` now.',
    );
    // An administrator has every permission.
    const administrator = { ...moderator, permissions: PermissionFlagsBits.Administrator };
    expect(await answer('add', { role: ROLE.south }, administrator)).toContain('**South**');
    expect(await rows()).toHaveLength(2);
  });

  it('goes by what staff may do on the server, not in the channel of the command', async () => {
    const { answer, server, rows } = setup();
    server.ownerId = '700000000000000099';
    // An overwrite of the channel gives the moderator "Manage Permissions", which is the bit
    // of Manage Roles; on the server they do not have it.
    const inChannel = {
      roleIds: [ROLE.moderator],
      guildRoleNames: { [ROLE.moderator]: 'Moderator' },
      memberPermissions: PermissionFlagsBits.ManageRoles | PermissionFlagsBits.Administrator,
    };
    expect(await answer('add', { role: ROLE.north }, inChannel)).toBe(
      'You cannot make **North** self-assignable: that takes the Manage Roles permission, ' +
        'which you do not have on this server. Whoever puts a role on the list gives it to ' +
        'everybody who asks.',
    );
    expect(await rows()).toEqual([]);
    // And the other way round: Manage Roles on the server, denied in this channel.
    const onServer = {
      ...inChannel,
      permissions: PermissionFlagsBits.ManageRoles,
      memberPermissions: 0n,
    };
    expect(await answer('add', { role: ROLE.north }, onServer)).toContain(
      'Members can give themselves **North** with `/iam` now.',
    );
  });

  it('lets a member of staff who does not own the server change what is said of a role', async () => {
    const { answer, server, rows } = setup();
    server.ownerId = '700000000000000099';
    const moderator = {
      roleIds: [ROLE.moderator],
      guildRoleNames: { [ROLE.moderator]: 'Moderator' },
      permissions: PermissionFlagsBits.ManageRoles,
    };
    await answer('add', { role: ROLE.north, description: 'Up' }, moderator);
    expect(
      await answer('add', { role: ROLE.north, description: 'North of the river' }, moderator),
    ).toBe(
      '**North** is changed.\nGroup: Other (no group)\nAliases: none\nDescription: North of the river',
    );
    expect(await rows()).toMatchObject([{ name: 'North', description: 'North of the river' }]);
    // Without Manage Roles they change nothing about it either.
    const { permissions: _none, ...plain } = moderator;
    expect(await answer('add', { role: ROLE.north, description: 'Mine' }, plain)).toContain(
      'You cannot make **North** self-assignable',
    );
    expect(await rows()).toMatchObject([{ description: 'North of the river' }]);
  });

  it('adds a role while the bot lacks Manage Roles, and says what that means', async () => {
    const { answer, server, rows } = setup();
    server.bot.mayManageRoles = false;
    expect(await answer('add', { role: ROLE.north })).toContain(
      'I lack the Manage Roles permission, so I cannot give any role to anybody until my role ' +
        'has it.',
    );
    expect(await rows()).toHaveLength(1);
  });

  it('refuses an alias or a name that another role has', async () => {
    const { answer, server, rows } = setup();
    await answer('add', { role: ROLE.north, aliases: 'n, up' });
    expect(await answer('add', { role: ROLE.south, aliases: 's, UP' })).toBe(
      'The alias "up" is the name or an alias of **North** already. Nothing was changed.',
    );
    expect(await answer('add', { role: ROLE.south, aliases: 'north' })).toContain(
      'The alias "north" is the name or an alias of **North** already.',
    );
    server.edit(ROLE.east, { name: 'Up' });
    expect(await answer('add', { role: ROLE.east })).toBe(
      '"Up" is an alias of **North**. Change the aliases of that role first.',
    );
    server.role('540000000000000001', 'north');
    expect(await answer('add', { role: '540000000000000001' })).toBe(
      'Another self-assignable role is called **North** already, and members could not tell ' +
        'the two apart. Rename one of the roles.',
    );
    expect(await rows()).toHaveLength(1);
  });

  it('refuses what does not fit: a long name, a long alias, too many aliases, an unknown group', async () => {
    const { answer, server, rows } = setup();
    server.edit(ROLE.north, { name: 'N'.repeat(51) });
    expect(await answer('add', { role: ROLE.north })).toContain(
      'its name is longer than 50 characters',
    );
    expect(await answer('add', { role: ROLE.south, aliases: `ok, ${'a'.repeat(51)}` })).toContain(
      'is longer than 50 characters.',
    );
    const many = Array.from({ length: 11 }, (_unused, n) => `a${String(n)}`).join(',');
    expect(await answer('add', { role: ROLE.south, aliases: many })).toBe(
      'A role can have 10 aliases at most; you gave 11.',
    );
    expect(await answer('add', { role: ROLE.south, group: 'Regions' })).toBe(
      'There is no group "Regions". Pick one from the list, or make it with ' +
        '`/admin self-roles group`.',
    );
    expect(await rows()).toEqual([]);
  });

  it('says so when the role is gone or the roles of the server are not known', async () => {
    const { answer } = setup();
    expect(await answer('add', { role: '540000000000000009' })).toBe(
      'This server no longer has that role.',
    );
    expect(await answer('add', { role: ROLE.north }, { guildId: '499999999999999999' })).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });

  it('takes over the entry the legacy bot made for the role of that name', async () => {
    const { answer, storage, rows } = setup();
    storage.legacyRow('north', { description: 'from before', aliases: ['n'] });
    expect(await answer('add', { role: ROLE.north, group: 'other' })).toBe(
      '**North** is changed.\nGroup: Other (no group)\nAliases: n\nDescription: from before',
    );
    expect(await rows()).toMatchObject([{ name: 'North', roleId: ROLE.north }]);
  });

  it('offers the groups of the server for the group option, and "Other"', async () => {
    const { answer, choices } = setup();
    await answer('group', { name: 'Regions' });
    await answer('group', { name: 'Teams', 'pick-one': true });
    expect(await choices('add', '')).toEqual([
      { name: 'Regions · any number', value: 'Regions' },
      { name: 'Teams · pick one', value: 'Teams' },
      { name: 'Other (no group)', value: 'other' },
    ]);
    expect(await choices('add', 'tea')).toEqual([{ name: 'Teams · pick one', value: 'Teams' }]);
  });
});

describe('/admin self-roles remove', () => {
  it('removes the entry and leaves the role and its holders alone', async () => {
    const { answer, offerSample, server, rows, gateway } = setup();
    await offerSample();
    server.member(ALICE, ROLE.north);
    expect(await answer('remove', { role: 'north' })).toBe(
      '**North** is no longer self-assignable. The role itself is untouched, and whoever ' +
        'holds it keeps it.',
    );
    expect((await rows()).map((row) => row.name)).not.toContain('North');
    expect(server.roles.has(ROLE.north)).toBe(true);
    expect(server.held(ALICE)).toEqual([ROLE.north]);
    expect(gateway.calls).toEqual([]);
  });

  it('offers every entry, also one whose role is gone, and removes what was picked', async () => {
    const { answer, choices, offerSample, server, rows } = setup();
    await offerSample();
    server.delete(ROLE.east).edit(ROLE.south, { name: 'Southside' });
    const offered = await choices('remove', '');
    expect(offered.map((choice) => choice.name)).toEqual([
      'East · its role is gone',
      'Instinct',
      'Mystic',
      'North',
      'Southside',
      'Trader',
      'Valor',
    ]);
    expect(await choices('remove', 'sou')).toMatchObject([{ name: 'Southside' }]);
    const east = offered[0]?.value ?? '';
    expect(east).toMatch(/^row:\d+$/);
    expect(await answer('remove', { role: east })).toContain('**East** is no longer');
    // By the name the role has now, typed without picking.
    expect(await answer('remove', { role: 'southside' })).toContain('**Southside** is no longer');
    expect(await rows()).toHaveLength(5);
  });

  it('says in the list why an entry leads to no role', async () => {
    const { choices, offerSample, server, storage } = setup();
    await offerSample();
    server.role('540000000000000001', 'Twin').role('540000000000000002', 'twin');
    storage.legacyRow('Twin');
    // The only role of this name has its row already.
    storage.legacyRow('trader');
    const offered = (await choices('remove', '')).map((choice) => choice.name);
    expect(offered).toEqual(
      expect.arrayContaining([
        'Trader',
        'trader · another entry has its role',
        'Twin · several roles have its name',
      ]),
    );
    expect(offered).toHaveLength(9);
  });

  it('prefers the stored name of an entry to the name a role has now, and guesses nothing between two', async () => {
    const { answer, offerSample, server, storage, rows } = setup();
    await offerSample();
    // North and South swap their names on Discord: neither row can follow while the other has the name.
    server.edit(ROLE.north, { name: 'South' }).edit(ROLE.south, { name: 'North' });
    expect(await answer('remove', { role: 'north' })).toContain('**North** is no longer');
    expect((await rows()).map((row) => row.roleId)).not.toContain(ROLE.north);
    expect((await rows()).map((row) => row.roleId)).toContain(ROLE.south);
    // Two entries of one stored name: the legacy bot's and the one of the role.
    storage.legacyRow('trader');
    expect(await answer('remove', { role: 'Trader' })).toBe(
      '2 self-assignable roles are called "Trader". Pick the one you mean from the list.',
    );
    expect(await rows()).toHaveLength(7);
  });

  it('says so when no entry is meant', async () => {
    const { answer, offerSample } = setup();
    await offerSample();
    expect(await answer('remove', { role: 'Nor' })).toBe(
      'No self-assignable role is called "Nor". Pick it from the list; ' +
        '`/admin self-roles list` shows them all.',
    );
    expect(await answer('remove', { role: 'row:99999' })).toContain('No self-assignable role');
  });
});

describe('/admin self-roles list', () => {
  it('says how to start when there is nothing', async () => {
    const { answer } = setup();
    expect(await answer('list')).toBe(
      'No role is self-assignable yet. Add one with `/admin self-roles add`, and sort the ' +
        'roles into groups with `/admin self-roles group`.',
    );
  });

  it('lists every entry by group, with aliases and description', async () => {
    const { answer, offerSample } = setup();
    await offerSample();
    await answer('group', { name: 'Hobbies' });
    expect((await answer('list')).split('\n')).toEqual([
      '**7 self-assignable roles** in 3 groups. Members pick them with `/iam`.',
      '',
      '**Regions** · position 1 · any number',
      '- **East**',
      '- **North** [n]: North of the river',
      '- **South**',
      '',
      '**Teams** · position 2 · pick one',
      '- **Instinct**',
      '- **Mystic**',
      '- **Valor**',
      '',
      '**Hobbies** · position 3 · any number',
      '- no roles yet',
      '',
      '**Other** · no group',
      '- **Trader**: Open to trades',
    ]);
  });

  it('marks each entry that cannot be given at present with the reason', async () => {
    const { answer, offerSample, server, storage } = setup();
    await offerSample();
    server
      .delete(ROLE.east)
      .edit(ROLE.north, { moderation: ['Manage Messages', 'Kick Members'] })
      .edit(ROLE.south, { position: 51 })
      .edit(ROLE.trader, { managed: true })
      .role('540000000000000001', 'Twin')
      .role('540000000000000002', 'twin');
    storage.legacyRow('Twin');
    const text = await answer('list');
    expect(text).toContain('- **East**\n  ⚠️ Cannot be given: its Discord role no longer exists.');
    expect(text).toContain(
      '- **North** [n]: North of the river\n  ⚠️ Cannot be given: it grants Manage Messages and Kick Members.',
    );
    expect(text).toContain(
      '- **South**\n  ⚠️ Cannot be given: it is not below my highest role in the list of roles.',
    );
    expect(text).toContain(
      '- **Trader**: Open to trades\n  ⚠️ Cannot be given: it is managed by an integration',
    );
    expect(text).toContain(
      '- **Twin**\n  ⚠️ Cannot be given: several roles of this server have its name',
    );
    expect(text).toContain('- **Valor**\n');

    server.bot.mayManageRoles = false;
    const powerless = await answer('list');
    // Said once above the list, not on the line of every role.
    expect(powerless.split('I lack the Manage Roles permission')).toHaveLength(2);
    expect(powerless.split('\n')[1]).toBe(
      '⚠️ I lack the Manage Roles permission: I cannot give any role to anybody until my role ' +
        'has it.',
    );
    expect(powerless).toContain('- **Valor**\n');
    // What is wrong with one role is still said on its line.
    expect(powerless).toContain('- **East**\n  ⚠️ Cannot be given: its Discord role no longer');
  });

  it('shows text staff wrote as text', async () => {
    const { answer } = setup();
    await answer('group', { name: '**Bold** @everyone' });
    await answer('add', {
      role: ROLE.north,
      description: '[link](https://example.com) <@&1>',
      aliases: '*n*',
      group: '**Bold** @everyone',
    });
    const text = await answer('list');
    expect(text).not.toContain('**Bold**');
    expect(text).not.toContain('@everyone');
    expect(text).not.toContain('](https');
    expect(text).not.toContain('<@&1>');
    expect(text).toContain('[\\*n\\*]');
  });

  it('fits Discord whatever the number of roles', async () => {
    const { answers, server, selfRoles, owner } = setup();
    for (let n = 0; n < 240; n++) {
      const id = `55${String(n).padStart(16, '0')}`;
      server.role(id, `Role number ${String(n).padStart(3, '0')} ${'x'.repeat(30)}`);
      const added = await selfRoles.addRole(
        FAKE_GUILD_ID,
        {
          roleId: id,
          description: 'd'.repeat(150),
          aliases: Array.from(
            { length: 10 },
            (_unused, k) => `${'a'.repeat(40)}${String(n)}x${String(k)}`,
          ),
        },
        owner(),
      );
      expect(added.kind).toBe('added');
    }
    const messages = await answers('list');
    expect(messages.length).toBeGreaterThan(10);
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(2000);
      expect(message.trim()).not.toBe('');
    }
    const all = messages.join('\n');
    expect(all).toContain('**240 self-assignable roles**. Members pick them with `/iam`.');
    expect(all.match(/^- \*\*Role number/gm)).toHaveLength(240);
  });

  it('says so when the roles of the server are not known', async () => {
    const { answer } = setup();
    expect(await answer('list', {}, { guildId: '499999999999999999' })).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });
});

describe('/admin self-roles group and ungroup', () => {
  it('makes groups, in the order they are made unless a position is named', async () => {
    const { answer, groups } = setup();
    expect(await answer('group', { name: 'Regions' })).toBe(
      'Made the group **Regions**: position 1, a member can hold any number of its roles. Put ' +
        'roles into it with the `group` option of `/admin self-roles add`.',
    );
    expect(await answer('group', { name: 'Teams', 'pick-one': true, position: 1 })).toContain(
      'Made the group **Teams**: position 1, a member can hold only one of its roles.',
    );
    expect((await groups()).map((group) => [group.name, group.position, group.pickOne])).toEqual([
      ['Teams', 1, true],
      ['Regions', 2, false],
    ]);
  });

  it('changes a group that exists: its rule, its position, its name', async () => {
    const { answer, groups } = setup();
    await answer('group', { name: 'Regions' });
    await answer('group', { name: 'Teams' });
    expect(await answer('group', { name: 'teams', 'pick-one': true, position: 1 })).toBe(
      'The group **Teams** is now: position 1, a member can hold only one of its roles.',
    );
    expect(await answer('group', { name: 'teams', 'new-name': 'Team' })).toBe(
      'The group **Team** is now: position 1, a member can hold only one of its roles.',
    );
    expect((await groups()).map((group) => group.name)).toEqual(['Team', 'Regions']);
  });

  it('refuses names that cannot be', async () => {
    const { answer, groups } = setup();
    await answer('group', { name: 'Regions' });
    expect(await answer('group', { name: 'Other' })).toBe(
      'A group cannot be called "Other" or "None": those words mean the roles that are in no ' +
        'group.',
    );
    expect(await answer('group', { name: 'Teams', 'new-name': 'Team' })).toBe(
      'There is no group "Teams" to rename. Leave `new-name` out to make it.',
    );
    await answer('group', { name: 'Teams' });
    expect(await answer('group', { name: 'Teams', 'new-name': 'regions' })).toBe(
      'Another group has that name already.',
    );
    expect(await groups()).toHaveLength(2);
  });

  it('removes a group, and its roles are under "Other" from then on', async () => {
    const { answer, offerSample, rows, groups, choices } = setup();
    await offerSample();
    expect(await choices('ungroup', 'r')).toEqual([
      { name: 'Regions · any number', value: 'Regions' },
    ]);
    expect(await answer('ungroup', { name: 'regions' })).toBe(
      'Removed the group **Regions**. Its 3 roles are under "Other" now.',
    );
    expect((await groups()).map((group) => [group.name, group.position])).toEqual([['Teams', 1]]);
    expect((await rows()).filter((row) => row.groupId === null)).toHaveLength(4);
    expect(await answer('ungroup', { name: 'Regions' })).toBe(
      'There is no group "Regions". Pick one from the list.',
    );
    await answer('group', { name: 'Empty' });
    expect(await answer('ungroup', { name: 'Empty' })).toBe(
      'Removed the group **Empty**. It had no roles.',
    );
  });
});
```

Apply to `src/discord/command-group.test.ts`:

```diff
--- a/src/discord/command-group.test.ts
+++ b/src/discord/command-group.test.ts
@@ -4,8 +4,10 @@ import {
   SlashCommandSubcommandBuilder,
 } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
+import { createTestContext } from '../../test/support/test-context.js';
 import { commandGroup, type SubcommandPart } from './command-group.js';
-import { declaredSubcommands, subcommandPath, type Guard } from './command.js';
+import { declaredSubcommands, enabledCommands, subcommandPath, type Guard } from './command.js';
+import { InteractionRouter } from './router.js';
 
 const sub = (name: string) =>
   new SlashCommandSubcommandBuilder().setName(name).setDescription(name);
@@ -77,6 +79,60 @@ describe('commandGroup', () => {
     );
   });
 
+  it('leaves out the subcommands an installation is not set up for', () => {
+    const { ctx } = createTestContext();
+    const on = ctx.config;
+    const off = {
+      ...on,
+      settings: { ...on.settings, features: { ...on.settings.features, roles: false } },
+    };
+    const roles = (config: typeof on) => config.settings.features.roles;
+    const command = commandGroup({
+      data: admin(),
+      help,
+      groups: { 'self-roles': 'Roles', boss: 'Raid bosses' },
+      parts: [
+        part('setup-forums'),
+        part('add', { group: 'self-roles', enabled: roles }),
+        part('list', { group: 'self-roles', enabled: roles }),
+        part('add', { group: 'boss' }),
+        part('export-roles', { enabled: roles }),
+      ],
+    });
+    expect(command.subcommands.get('self-roles add')).not.toHaveProperty('enabled');
+
+    const [whole] = enabledCommands([command], on);
+    expect(whole).toBe(command);
+
+    const [narrowed] = enabledCommands([command], off);
+    expect([...(narrowed?.subcommands?.keys() ?? [])]).toEqual(['setup-forums', 'boss add']);
+    const json = narrowed?.data.toJSON();
+    expect(declaredSubcommands(json?.options)).toEqual(['setup-forums', 'boss add']);
+    expect(json).toMatchObject({ name: 'admin', description: 'Administration' });
+    // A router takes it: what it declares is what it handles.
+    expect(() => new InteractionRouter(ctx, narrowed ? [narrowed] : [], [])).not.toThrow();
+    // The command itself is unchanged.
+    expect(declaredSubcommands(command.data.toJSON().options)).toHaveLength(5);
+  });
+
+  it('has nothing to narrow when no subcommand depends on the configuration', () => {
+    expect(commandGroup({ data: admin(), help, parts: [part('sync')] })).not.toHaveProperty(
+      'forConfig',
+    );
+  });
+
+  it('refuses a configuration that leaves a command without subcommands', () => {
+    const { ctx } = createTestContext();
+    const command = commandGroup({
+      data: admin(),
+      help,
+      parts: [part('sync', { enabled: () => false })],
+    });
+    expect(() => enabledCommands([command], ctx.config)).toThrow(
+      '/admin has no subcommands left in this configuration',
+    );
+  });
+
   it('refuses a definition that Discord or the router could not use', () => {
     expect(() =>
       commandGroup({ data: admin(), help, parts: [part('sync'), part('sync')] }),
```

Apply to `src/render/text.test.ts`:

```diff
--- a/src/render/text.test.ts
+++ b/src/render/text.test.ts
@@ -5,6 +5,7 @@ import {
   clockOrDay,
   count,
   fitItems,
+  fitMessages,
   isFarOff,
   memberName,
   memberText,
@@ -263,3 +264,25 @@ describe('plainLines', () => {
     );
   });
 });
+
+describe('fitMessages', () => {
+  it('joins lines into one message while they fit', () => {
+    expect(fitMessages(['a', '', 'b'])).toEqual(['a\n\nb']);
+    expect(fitMessages([])).toEqual([]);
+  });
+
+  it('starts a new message rather than cut a line, and keeps the order', () => {
+    const lines = Array.from({ length: 50 }, (_unused, n) => `${String(n)} ${'x'.repeat(96)}`);
+    const messages = fitMessages(lines);
+    expect(messages.length).toBeGreaterThan(2);
+    for (const message of messages) expect(message.length).toBeLessThanOrEqual(2000);
+    expect(messages.join('\n').split('\n')).toEqual(lines);
+  });
+
+  it('cuts a single line that is longer than a message, and starts no message with an empty line', () => {
+    const [cut] = fitMessages(['y'.repeat(2500)]);
+    expect(cut).toHaveLength(2000);
+    expect(cut?.endsWith('…')).toBe(true);
+    expect(fitMessages(['', '', 'a'])).toEqual(['a']);
+  });
+});
```

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/discord/command-group.test.ts src/render/text.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/admin/index.ts`:

```diff
--- a/src/commands/admin/index.ts
+++ b/src/commands/admin/index.ts
@@ -2,13 +2,14 @@ import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { saveParty } from './save-party.js';
+import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
 import { setupForums } from './setup-forums.js';
 
 /**
  * The subcommands of `/admin`. Each lives in a file of its own in this folder; a later plan
  * adds one by appending it here (and its group, if it has one, to `groups` below).
  */
-const parts: readonly SubcommandPart[] = [setupForums, saveParty];
+const parts: readonly SubcommandPart[] = [setupForums, saveParty, ...selfRoleParts];
 
 /** `/admin`: for staff. Discord offers it only to members who may manage the server. */
 export const admin = commandGroup({
@@ -18,5 +19,6 @@ export const admin = commandGroup({
     .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
   help: { category: 'admin' },
   guards: [requireBotManagement],
+  groups: { [SELF_ROLES_GROUP]: SELF_ROLES_DESCRIPTION },
   parts,
 });
```

Create `src/commands/admin/self-roles.ts`:

```ts
import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import {
  isNoGroupWord,
  parseAliases,
  type GroupSaveProblem,
  type RoleSaveProblem,
} from '../../domain/roles/self-role-edits.js';
import {
  ALIAS_LENGTH,
  byRoleName,
  DESCRIPTION_LENGTH,
  GROUP_NAME_LENGTH,
  MAX_ALIASES,
  MAX_GROUPS,
  ROLE_NAME_LENGTH,
  sameName,
  type IntrinsicProblem,
  type OfferProblem,
  type RoleProblem,
  type RosterEntry,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
  type StaffStanding,
} from '../../domain/roles/self-roles.js';
import { count, fitMessages, plain, truncate } from '../../render/text.js';
import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { listed, ROLES_UNAVAILABLE, rolesEnabled, roleText, typedText } from '../roles/shared.js';
import { groupRule, whyNot } from '../roles/words.js';

/** The subcommand group of `/admin` all of this lives under. */
export const SELF_ROLES_GROUP = 'self-roles';
export const SELF_ROLES_DESCRIPTION = 'The roles members can give themselves with /iam';

/** The word that clears a description or the aliases, and takes a role out of its group. */
const NONE = 'none';
const isNone = (text: string): boolean => sameName(text, NONE);

/** The value of the choice for "no group" in the `group` option. */
const NO_GROUP_CHOICE = 'other';

/** The value of a row picked from the list of `remove`: also a row whose Discord role is gone. */
const ROW_CHOICE = /^row:(\d{1,10})$/;

/** The choices of a `group` option: the server's groups by what was typed, in their order. */
async function groupChoices(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
  withNoGroup: boolean,
): Promise<Choice[]> {
  if (interaction.guildId === null) return [];
  const typed = interaction.options.getFocused().trim().toLowerCase();
  const { groups } = await ctx.selfRoles.stored(interaction.guildId);
  const choices = groups
    .filter((group) => group.name.toLowerCase().includes(typed))
    .map((group) => ({
      name: truncate(`${group.name} · ${groupRule(group)}`, CHOICE_NAME),
      value: group.name,
    }));
  if (withNoGroup && 'other (no group)'.includes(typed)) {
    choices.push({ name: 'Other (no group)', value: NO_GROUP_CHOICE });
  }
  return choices.slice(0, MAX_CHOICES);
}

/**
 * The group a text names outright; refused with what to do for any other text (`orMake`: where
 * a group that is missing could be made first).
 */
function namedGroup(
  groups: readonly SelfRoleGroup[],
  typed: string,
  orMake: boolean,
): SelfRoleGroup {
  const group = groups.find((other) => sameName(other.name, typed));
  if (!group) {
    throw new UserError(
      `There is no group ${typedText(typed)}. ` +
        (orMake
          ? 'Pick one from the list, or make it with `/admin self-roles group`.'
          : 'Pick one from the list.'),
    );
  }
  return group;
}

/**
 * The member of staff of an interaction, as the server's order of roles asks about them.
 * Manage Roles is read from the server (`GuildMember.permissions`, which counts the owner and
 * an administrator in), never from `interaction.memberPermissions`: those are the permissions
 * in the channel of the command, where an overwrite can grant "Manage Permissions", and that is
 * the very bit of Manage Roles.
 */
function staffStanding(interaction: ChatInputCommandInteraction): StaffStanding {
  if (!interaction.inCachedGuild()) {
    return { id: interaction.user.id, held: [], mayManageRoles: false };
  }
  return {
    id: interaction.user.id,
    held: [...interaction.member.roles.cache.keys()],
    mayManageRoles: interaction.member.permissions.has(PermissionFlagsBits.ManageRoles),
  };
}

/** Why a member of staff may not offer a role: which of the two things is missing. */
function notYours(problem: OfferProblem, role: ServerRole): string {
  const name = roleText(role.name);
  return problem === 'no-manage-roles'
    ? `You cannot make ${name} self-assignable: that takes the Manage Roles permission, which ` +
        'you do not have on this server. Whoever puts a role on the list gives it to everybody ' +
        'who asks.'
    : `You cannot make ${name} self-assignable: it is not below your own highest role, so you ` +
        'could not give it to anybody yourself. Somebody whose role stands above it, or the ' +
        'owner of the server, has to add it.';
}

/** A row as the answers describe it: its group, aliases and description, each on a line. */
function described(row: SelfRoleRow, groups: readonly SelfRoleGroup[]): string {
  const group = groups.find((other) => other.id === row.groupId);
  return [
    `Group: ${group ? plain(group.name) : 'Other (no group)'}`,
    `Aliases: ${row.aliases.length === 0 ? 'none' : row.aliases.map(plain).join(', ')}`,
    `Description: ${row.description === null ? 'none' : plain(row.description)}`,
  ].join('\n');
}

/** Why a role is never handed out, for the member of staff who tried to add it. */
function unfit(problem: IntrinsicProblem, role: ServerRole): string {
  const name = roleText(role.name);
  switch (problem) {
    case 'everyone':
      return `${name} cannot be self-assigned: every member has it already.`;
    case 'managed':
      return (
        `${name} cannot be self-assigned: it is managed by an integration (a bot role or the ` +
        'booster role), and Discord lets nobody hand such a role out.'
      );
    case 'moderation':
      return (
        `${name} cannot be self-assigned: it grants ${listed(role.moderation)}. I never hand ` +
        'out a role that grants a permission of moderation or administration.'
      );
    case 'above-bot':
      return (
        `${name} cannot be self-assigned: it is not below my highest role, and I can only ` +
        'give roles that are. Move my role above it in the list of roles of this server.'
      );
  }
}

function saveRefusal(problem: RoleSaveProblem, role: string): string {
  const name = roleText(role);
  switch (problem.reason) {
    case 'name-too-long':
      return (
        `${name} cannot be self-assigned: its name is longer than ${String(ROLE_NAME_LENGTH)} ` +
        'characters, which is more than I can keep. Shorten the name of the role.'
      );
    case 'description-too-long':
      return `The description may have ${String(DESCRIPTION_LENGTH)} characters at most.`;
    case 'name-taken':
      return (
        `Another self-assignable role is called ${roleText(problem.other)} already, and ` +
        'members could not tell the two apart. Rename one of the roles.'
      );
    case 'name-is-alias':
      return (
        `"${plain(role)}" is an alias of ${roleText(problem.other)}. Change the aliases of ` +
        'that role first.'
      );
    case 'alias-taken':
      return (
        `The alias "${plain(problem.alias)}" is the name or an alias of ` +
        `${roleText(problem.other)} already. Nothing was changed.`
      );
    case 'no-group':
      return 'That group no longer exists. Nothing was changed.';
  }
}

const add: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Let members give themselves a role, or change what is said about one')
    .addRoleOption((option) => option.setName('role').setDescription('The role').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('What the role is for, shown beside its name; "none" removes it')
        .setMaxLength(DESCRIPTION_LENGTH),
    )
    .addStringOption((option) =>
      option
        .setName('aliases')
        .setDescription('Other names for it, separated by commas; "none" removes them')
        .setMaxLength(MAX_ALIASES * (ALIAS_LENGTH + 2)),
    )
    .addStringOption((option) =>
      option
        .setName('group')
        .setDescription('The group it is listed under; "other" takes it out of its group')
        .setMaxLength(GROUP_NAME_LENGTH)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Makes a role of this server one that members can give themselves with `/iam`, or changes ' +
      'the description, the aliases and the group of one that is. An option you leave out stays ' +
      'as it is; aliases you give replace the ones it had. I never hand out a role that grants a ' +
      'permission of moderation or administration, a role an integration manages, or a role that ' +
      'is not below my own. You can add a role only if you could give it to somebody yourself: ' +
      'with the Manage Roles permission and a role of your own above it, or as the owner of the ' +
      'server.',
    examples: [
      '/admin self-roles add role:@North description:North of the river aliases:n, northside group:Regions',
      '/admin self-roles add role:@North aliases:none',
    ],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const roleId = interaction.options.getRole('role', true).id;
    const description = interaction.options.getString('description');
    const typedAliases = interaction.options.getString('aliases');
    const typedGroup = interaction.options.getString('group');

    let aliases: string[] | undefined;
    if (typedAliases !== null) {
      const parsed = parseAliases(isNone(typedAliases) ? '' : typedAliases);
      if (!parsed.ok) {
        throw new UserError(
          parsed.reason === 'alias-too-long'
            ? `The alias ${typedText(parsed.alias)} is longer than ${String(ALIAS_LENGTH)} characters.`
            : `A role can have ${String(MAX_ALIASES)} aliases at most; you gave ${String(parsed.count)}.`,
        );
      }
      aliases = parsed.aliases;
    }
    const { groups } = await ctx.selfRoles.stored(guildId);
    let groupId: number | null | undefined;
    if (typedGroup !== null) {
      groupId = isNoGroupWord(typedGroup) ? null : namedGroup(groups, typedGroup, true).id;
    }

    const outcome = await ctx.selfRoles.addRole(
      guildId,
      {
        roleId,
        ...(description === null ? {} : { description: isNone(description) ? null : description }),
        ...(aliases === undefined ? {} : { aliases }),
        ...(groupId === undefined ? {} : { groupId }),
      },
      staffStanding(interaction),
    );
    if (outcome.kind === 'unavailable') throw new UserError(ROLES_UNAVAILABLE);
    if (outcome.kind === 'no-role') {
      throw new UserError('This server no longer has that role.');
    }
    if (outcome.kind === 'unfit') throw new UserError(unfit(outcome.problem, outcome.role));
    if (outcome.kind === 'not-yours') throw new UserError(notYours(outcome.problem, outcome.role));
    if (outcome.kind === 'refused') throw new UserError(saveRefusal(outcome, outcome.role.name));
    const name = roleText(outcome.role.name);
    const lines = [
      outcome.kind === 'added'
        ? `Members can give themselves ${name} with \`/iam\` now.`
        : `${name} is changed.`,
      described(outcome.row, groups),
    ];
    if (outcome.botLacksManageRoles) {
      lines.push(
        'I lack the Manage Roles permission, so I cannot give any role to anybody until my ' +
          'role has it.',
      );
    }
    await interaction.editReply({ content: lines.join('\n') });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(await groupChoices(interaction, ctx, true));
  },
};

/**
 * Every row of a server for `remove`, by the name its role has now (the row's own for a row
 * that leads to no role, with why it does not). The rows are read once: from the roster, or
 * as they are stored while the bot does not know the server's roles.
 */
async function removable(
  ctx: AppContext,
  guildId: string,
): Promise<{ row: SelfRoleRow; name: string; problem: RoleProblem | undefined }[]> {
  const roster = await ctx.selfRoles.roster(guildId);
  if (roster) {
    return roster.entries.map((entry) => ({
      row: entry.row,
      name: entry.name,
      problem: entry.role === undefined ? entry.problem : undefined,
    }));
  }
  const { rows } = await ctx.selfRoles.stored(guildId);
  return [...rows].sort(byRoleName).map((row) => ({ row, name: row.name, problem: undefined }));
}

/** What the list of `remove` says after the name of a row that leads to no role. */
function withoutRole(problem: RoleProblem | undefined): string {
  switch (problem) {
    case 'gone':
      return ' · its role is gone';
    case 'ambiguous':
      return ' · several roles have its name';
    case 'duplicate':
      return ' · another entry has its role';
    default:
      return '';
  }
}

const remove: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Stop members from giving themselves a role')
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription('The self-assignable role: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Takes a role off the roles members can give themselves, with its aliases. The role itself ' +
      'stays, and so do the members who hold it. The list also has entries whose role no longer ' +
      'exists.',
    examples: ['/admin self-roles remove role:North'],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const typed = interaction.options.getString('role', true);
    const picked = ROW_CHOICE.exec(typed.trim());
    let rowId = picked ? Number(picked[1]) : undefined;
    if (rowId === undefined) {
      // Typed without picking: the name of a row as it is stored first, then as its role is
      // called now. Two rows of one name are not guessed between.
      const named = await removable(ctx, guildId);
      const stored = named.filter(({ row }) => sameName(row.name, typed));
      const meant = stored.length > 0 ? stored : named.filter(({ name }) => sameName(name, typed));
      if (meant.length > 1) {
        throw new UserError(
          `${String(meant.length)} self-assignable roles are called ${typedText(typed)}. Pick ` +
            'the one you mean from the list.',
        );
      }
      rowId = meant[0]?.row.id;
    }
    const removed =
      rowId === undefined ? undefined : await ctx.selfRoles.removeRole(guildId, rowId);
    if (!removed) {
      throw new UserError(
        `No self-assignable role is called ${typedText(typed)}. Pick it from the list; ` +
          '`/admin self-roles list` shows them all.',
      );
    }
    await interaction.editReply({
      content:
        `${roleText(removed.name)} is no longer self-assignable. The role itself is untouched, ` +
        'and whoever holds it keeps it.',
    });
  },

  async autocomplete(interaction, ctx) {
    if (interaction.guildId === null) {
      await interaction.respond([]);
      return;
    }
    const typed = interaction.options.getFocused().trim().toLowerCase();
    const choices = (await removable(ctx, interaction.guildId))
      .map(({ row, name, problem }) => ({ row, name: `${name}${withoutRole(problem)}` }))
      .filter(({ name }) => name.toLowerCase().includes(typed))
      .sort(beginningFirst(typed))
      .slice(0, MAX_CHOICES)
      .map(({ row, name }) => ({
        name: truncate(name === '' ? '(no name)' : name, CHOICE_NAME),
        value: `row:${String(row.id)}`,
      }));
    await interaction.respond(choices);
  },
};

/**
 * One row as a line of the list. That the bot lacks Manage Roles is every role's problem and
 * is said once above the list, not on each line.
 */
function listLine(entry: RosterEntry): string {
  const aliases =
    entry.row.aliases.length === 0 ? '' : ` [${entry.row.aliases.map(plain).join(', ')}]`;
  const description = entry.row.description === null ? '' : `: ${plain(entry.row.description)}`;
  const mark =
    entry.problem === undefined || entry.problem === 'no-manage-roles'
      ? ''
      : `\n  ⚠️ Cannot be given: ${whyNot(entry.problem, entry.role)}.`;
  return `- ${roleText(entry.name)}${aliases}${description}${mark}`;
}

const list: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('Show the self-assignable roles with their groups, aliases and problems'),
  help: {
    details:
      'Every role members can give themselves, by group, with its aliases and description. A ' +
      'role I cannot give at present is marked with the reason: its role is gone, it is not ' +
      'below my own, it grants a permission of moderation, or I lack Manage Roles.',
    examples: ['/admin self-roles list'],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const roster = await ctx.selfRoles.roster(guildIdOf(interaction));
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    const { entries, groups } = roster;
    if (entries.length === 0 && groups.length === 0) {
      await interaction.editReply({
        content:
          'No role is self-assignable yet. Add one with `/admin self-roles add`, and sort the ' +
          'roles into groups with `/admin self-roles group`.',
      });
      return;
    }
    const lines = [
      `**${count(entries.length, 'self-assignable role')}**` +
        (groups.length === 0 ? '' : ` in ${count(groups.length, 'group')}`) +
        '. Members pick them with `/iam`.',
    ];
    if (!roster.bot.mayManageRoles) {
      lines.push(
        '⚠️ I lack the Manage Roles permission: I cannot give any role to anybody until my ' +
          'role has it.',
      );
    }
    const section = (heading: string, members: readonly RosterEntry[]): void => {
      lines.push('', heading);
      if (members.length === 0) lines.push('- no roles yet');
      else lines.push(...[...members].sort(byRoleName).map(listLine));
    };
    for (const group of groups) {
      section(
        `**${plain(group.name)}** · position ${String(group.position)} · ${groupRule(group)}`,
        entries.filter((entry) => entry.group?.id === group.id),
      );
    }
    const others = entries.filter((entry) => entry.group === undefined);
    if (others.length > 0 || groups.length === 0) section('**Other** · no group', others);

    const [first = '', ...rest] = fitMessages(lines);
    await interaction.editReply({ content: first });
    for (const content of rest) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
  },
};

function groupRefusal(problem: GroupSaveProblem, typed: string): string {
  switch (problem.reason) {
    case 'name-empty':
      return 'A group needs a name.';
    case 'name-too-long':
      return `The name of a group may have ${String(GROUP_NAME_LENGTH)} characters at most.`;
    case 'reserved-name':
      return (
        'A group cannot be called "Other" or "None": those words mean the roles that are in ' +
        'no group.'
      );
    case 'name-taken':
      return 'Another group has that name already.';
    case 'no-group':
      return `There is no group ${typedText(typed)} to rename. Leave \`new-name\` out to make it.`;
    case 'too-many':
      return `A server can have ${String(MAX_GROUPS)} groups at most.`;
  }
}

const group: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('group')
    .setDescription('Make a group of self-assignable roles, or change one')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The name of the group: a new one, or one from the list to change it')
        .setRequired(true)
        .setMaxLength(GROUP_NAME_LENGTH)
        .setAutocomplete(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('pick-one')
        .setDescription('True: a member can hold only one of its roles (teams)'),
    )
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Its position among the groups in the menus of /iam, 1 first')
        .setMinValue(1)
        .setMaxValue(MAX_GROUPS),
    )
    .addStringOption((option) =>
      option
        .setName('new-name')
        .setDescription('A new name for a group that exists')
        .setMaxLength(GROUP_NAME_LENGTH),
    ),
  help: {
    details:
      'Roles are offered to members group by group: one menu per group in `/iam`, in the order ' +
      'of the groups, and the roles without a group last under "Other". With `pick-one` a ' +
      'member can hold only one role of the group: taking another gives the first one back. ' +
      'Put a role into a group with `/admin self-roles add`. An option you leave out stays as ' +
      'it is.',
    examples: [
      '/admin self-roles group name:Regions',
      '/admin self-roles group name:Teams pick-one:True position:1',
    ],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const typed = interaction.options.getString('name', true);
    const pickOne = interaction.options.getBoolean('pick-one');
    const position = interaction.options.getInteger('position');
    const newName = interaction.options.getString('new-name');
    const saved = await ctx.selfRoles.saveGroup(guildIdOf(interaction), {
      name: typed,
      ...(pickOne === null ? {} : { pickOne }),
      ...(position === null ? {} : { position }),
      ...(newName === null ? {} : { newName }),
    });
    if (saved.kind === 'refused') throw new UserError(groupRefusal(saved, typed));
    const { group: made } = saved;
    const rule = made.pickOne
      ? 'a member can hold only one of its roles'
      : 'a member can hold any number of its roles';
    const name = `**${plain(made.name)}**`;
    await interaction.editReply({
      content:
        saved.kind === 'added'
          ? `Made the group ${name}: position ${String(made.position)}, ${rule}. Put roles ` +
            'into it with the `group` option of `/admin self-roles add`.'
          : `The group ${name} is now: position ${String(made.position)}, ${rule}.`,
    });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(await groupChoices(interaction, ctx, false));
  },
};

const ungroup: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('ungroup')
    .setDescription('Remove a group; its roles stay self-assignable under "Other"')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The group: pick from the list')
        .setRequired(true)
        .setMaxLength(GROUP_NAME_LENGTH)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Removes a group. Its roles stay self-assignable and are offered under "Other" until ' +
      'they are put into another group.',
    examples: ['/admin self-roles ungroup name:Hobbies'],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const typed = interaction.options.getString('name', true);
    const { groups } = await ctx.selfRoles.stored(guildId);
    const removed = await ctx.selfRoles.removeGroup(guildId, namedGroup(groups, typed, false).id);
    if (!removed) throw new UserError('That group was removed already.');
    const moved =
      removed.roles === 0
        ? 'It had no roles.'
        : removed.roles === 1
          ? 'Its role is under "Other" now.'
          : `Its ${String(removed.roles)} roles are under "Other" now.`;
    await interaction.editReply({
      content: `Removed the group **${plain(removed.group.name)}**. ${moved}`,
    });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(await groupChoices(interaction, ctx, false));
  },
};

/** The parts of `/admin self-roles` (spec 4.2: asar, rsar, lsar, and the groups of plan 4C). */
export const selfRoleParts: readonly SubcommandPart[] = [add, remove, list, group, ungroup];
```

Apply to `src/commands/admin/setup-forums.ts`:

```diff
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -1,11 +1,9 @@
 import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
-import { plain } from '../../render/text.js';
+import { fitMessages, plain } from '../../render/text.js';
 import type { ForumSetup } from '../../services/party-service.js';
 
-const MESSAGE_LIMIT = 2000;
-
 function line(result: ForumSetup): string {
   const { region } = result;
   if (result.forum === 'no-channel') {
@@ -29,23 +27,6 @@ function line(result: ForumSetup): string {
   return `<#${region.channelId}>: ${what.join(', ')}.`;
 }
 
-/** Joins lines into messages of at most 2000 characters, never cutting inside a line. */
-function messagesOf(lines: readonly string[]): string[] {
-  const messages: string[] = [];
-  let current = '';
-  for (const text of lines) {
-    const line = text.length > MESSAGE_LIMIT ? `${text.slice(0, MESSAGE_LIMIT - 1)}…` : text;
-    if (current !== '' && current.length + 1 + line.length > MESSAGE_LIMIT) {
-      messages.push(current);
-      current = line;
-    } else {
-      current = current === '' ? line : `${current}\n${line}`;
-    }
-  }
-  if (current !== '') messages.push(current);
-  return messages;
-}
-
 /** `/admin setup-forums`: every region of this server gets its forum, tags and summary post. */
 export const setupForums: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
@@ -72,7 +53,7 @@ export const setupForums: SubcommandPart = {
       await interaction.editReply({ content: 'This server has no regions yet.' });
       return;
     }
-    const [first = '', ...rest] = messagesOf(results.map(line));
+    const [first = '', ...rest] = fitMessages(results.map(line));
     await interaction.editReply({ content: first });
     for (const content of rest) {
       await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
```

Create `src/commands/roles/shared.ts`:

```ts
import type { Config } from '../../config/index.js';
import { plain, truncate } from '../../render/text.js';

/** Whether this installation has self-assigned roles at all (`settings.features.roles`). */
export const rolesEnabled = (config: Config): boolean => config.settings.features.roles;

/** A role in a sentence: its name in bold, never a mention (nothing here may ping). */
export function roleText(name: string): string {
  const shown = plain(name).replace(/\\+$/, '');
  return `**${shown === '' ? '(no name)' : shown}**`;
}

/** Text somebody typed, quoted in an answer. */
export function typedText(text: string): string {
  return `"${plain(truncate(text.trim(), 80))}"`;
}

/** "A", "A and B", "A, B and C". */
export function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/** What a member or staff is told while the bot does not know the server's roles. */
export const ROLES_UNAVAILABLE =
  'I cannot see the roles of this server at the moment. Try again in a minute.';
```

Create `src/commands/roles/words.ts`:

```ts
import type { RoleProblem, SelfRoleGroup, ServerRole } from '../../domain/roles/self-roles.js';
import { listed } from './shared.js';

/**
 * Why a role cannot be handed out, as the rest of a sentence about it ("**North** cannot be
 * given: …") for staff, who can mend it.
 */
export function whyNot(problem: RoleProblem, role: ServerRole | undefined): string {
  switch (problem) {
    case 'gone':
      return 'its Discord role no longer exists';
    case 'ambiguous':
      return (
        'several roles of this server have its name; say which one is meant by adding it ' +
        'with `/admin self-roles add`'
      );
    case 'duplicate':
      return 'another entry already stands for the role of this name; remove this one';
    case 'everyone':
      return 'it is the role every member has';
    case 'managed':
      return 'it is managed by an integration (a bot role or the booster role)';
    case 'moderation':
      return `it grants ${listed(role?.moderation ?? [])}`;
    case 'above-bot':
      return 'it is not below my highest role in the list of roles';
    case 'no-manage-roles':
      return 'I lack the Manage Roles permission';
  }
}

/** A group's rule, as a list says it. */
export function groupRule(group: Pick<SelfRoleGroup, 'pickOne'>): string {
  return group.pickOne ? 'pick one' : 'any number';
}
```

Apply to `src/discord/command-group.ts`:

```diff
--- a/src/discord/command-group.ts
+++ b/src/discord/command-group.ts
@@ -1,5 +1,7 @@
 import {
+  ApplicationCommandOptionType,
   SlashCommandSubcommandGroupBuilder,
+  type APIApplicationCommandOption,
   type SlashCommandBuilder,
   type SlashCommandSubcommandBuilder,
 } from 'discord.js';
@@ -17,6 +19,11 @@ export interface SubcommandPart extends SubcommandHandler {
   /** The subcommand group it belongs to: `boss` for `/admin boss add`. */
   group?: string;
   data: SlashCommandSubcommandBuilder;
+  /**
+   * For a subcommand that needs something optional (a setting): whether this installation has
+   * it. One that is not enabled is neither registered nor routed (`GroupedCommand.forConfig`).
+   */
+  enabled?: (config: Config) => boolean;
 }
 
 export interface CommandGroupDefinition {
@@ -49,7 +56,7 @@ export function commandGroup(definition: CommandGroupDefinition): GroupedCommand
   );
   const used = new Set<string>();
   const subcommands = new Map<string, SubcommandHandler>();
-  for (const { group = null, data: subcommand, ...handler } of parts) {
+  for (const { group = null, data: subcommand, enabled: _enabled, ...handler } of parts) {
     const path = subcommandPath(group, subcommand.name);
     if (subcommands.has(path)) throw new Error(`Duplicate subcommand /${data.name} ${path}`);
     if (group === null) {
@@ -68,11 +75,57 @@ export function commandGroup(definition: CommandGroupDefinition): GroupedCommand
     data.addSubcommandGroup(builder);
   }
   if (subcommands.size === 0) throw new Error(`/${data.name} has no subcommands`);
-  return {
+  const command: GroupedCommand = {
     data,
     help,
     ...(guards ? { guards } : {}),
     ...(enabled ? { enabled } : {}),
     subcommands,
   };
+  if (!parts.some((part) => part.enabled)) return command;
+  const narrowing: GroupedCommand = {
+    ...command,
+    forConfig: (config) => withoutDisabled(narrowing, parts, config),
+  };
+  return narrowing;
+}
+
+/**
+ * The command as an installation with this configuration offers it: without the subcommands
+ * whose `enabled` says no, in the definition and among the handlers alike, and without a group
+ * that is left empty.
+ */
+function withoutDisabled(
+  command: GroupedCommand,
+  parts: readonly SubcommandPart[],
+  config: Config,
+): GroupedCommand {
+  const dropped = new Set(
+    parts
+      .filter((part) => part.enabled && !part.enabled(config))
+      .map((part) => subcommandPath(part.group ?? null, part.data.name)),
+  );
+  if (dropped.size === 0) return command;
+  const json = command.data.toJSON();
+  const options = (json.options ?? []).flatMap((option): APIApplicationCommandOption[] => {
+    if (option.type === ApplicationCommandOptionType.Subcommand) {
+      return dropped.has(option.name) ? [] : [option];
+    }
+    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
+      const kept = (option.options ?? []).filter(
+        (sub) => !dropped.has(subcommandPath(option.name, sub.name)),
+      );
+      return kept.length === 0 ? [] : [{ ...option, options: kept }];
+    }
+    return [option];
+  });
+  const subcommands = new Map([...command.subcommands].filter(([path]) => !dropped.has(path)));
+  if (subcommands.size === 0) {
+    throw new Error(`/${command.data.name} has no subcommands left in this configuration`);
+  }
+  return {
+    ...command,
+    data: { name: command.data.name, toJSON: () => ({ ...json, options }) },
+    subcommands,
+  };
 }
```

Apply to `src/discord/command.ts`:

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -105,16 +105,26 @@ export interface GroupedCommand extends CommandBase {
   guards?: readonly Guard[];
   /** Handlers by path: `create`, or `boss add` for subcommand `add` of group `boss`. */
   subcommands: ReadonlyMap<string, SubcommandHandler>;
+  /**
+   * For a command some of whose subcommands need something optional: the command as an
+   * installation with this configuration offers it (see `SubcommandPart.enabled`).
+   */
+  forConfig?: (config: Config) => GroupedCommand;
 }
 
 export type CommandModule = SimpleCommand | GroupedCommand;
 
-/** The commands this installation offers. */
+/**
+ * The commands this installation offers, each with the subcommands it offers: what the router,
+ * `/help` and the deploy script all go by.
+ */
 export function enabledCommands(
   commands: readonly CommandModule[],
   config: Config,
 ): CommandModule[] {
-  return commands.filter((command) => command.enabled?.(config) ?? true);
+  return commands
+    .filter((command) => command.enabled?.(config) ?? true)
+    .map((command) => (command.subcommands ? (command.forConfig?.(config) ?? command) : command));
 }
 
 /** The path of a subcommand as the keys of `GroupedCommand.subcommands` spell it. */
```

Apply to `src/render/text.ts`:

```diff
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -210,3 +210,23 @@ export function titleCase(id: string): string {
     .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
     .join(' ');
 }
+
+/**
+ * Lines joined into as few messages as hold them in their order, none longer than Discord
+ * allows and none cut inside a line (a single line that is too long by itself is cut).
+ */
+export function fitMessages(lines: readonly string[]): string[] {
+  const messages: string[] = [];
+  let current = '';
+  for (const text of lines) {
+    const line = text.length > LIMITS.content ? `${text.slice(0, LIMITS.content - 1)}…` : text;
+    if (current !== '' && current.length + 1 + line.length > LIMITS.content) {
+      messages.push(current);
+      current = line;
+    } else {
+      current = current === '' ? line : `${current}\n${line}`;
+    }
+  }
+  if (current !== '') messages.push(current);
+  return messages;
+}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/discord/command-group.test.ts src/render/text.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 5099e03 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/admin/index.ts src/commands/admin/self-roles.test.ts src/commands/admin/self-roles.ts src/commands/admin/setup-forums.ts src/commands/roles/shared.ts src/commands/roles/words.ts src/discord/command-group.test.ts src/discord/command-group.ts src/discord/command.ts src/render/text.test.ts src/render/text.ts
npm run typecheck; npx eslint src/commands/admin/index.ts src/commands/admin/self-roles.test.ts src/commands/admin/self-roles.ts src/commands/admin/setup-forums.ts src/commands/roles/shared.ts src/commands/roles/words.ts src/discord/command-group.test.ts src/discord/command-group.ts src/discord/command.ts src/render/text.test.ts src/render/text.ts   # both clean; the full check runs after the last task
git add src/commands/admin/index.ts src/commands/admin/self-roles.test.ts src/commands/admin/self-roles.ts src/commands/admin/setup-forums.ts src/commands/roles/shared.ts src/commands/roles/words.ts src/discord/command-group.test.ts src/discord/command-group.ts src/discord/command.ts src/render/text.test.ts src/render/text.ts
git commit -F <a file with the message below>
```

The commit message:

```
Staff say which roles are self-assignable: `/admin self-roles`

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 4: A member takes a role by name and gives one back: the iam and iamnot commands

**Files:**
- Create: `src/commands/roles/iam.test.ts`, `src/commands/roles/iam.ts`
- Modify: `src/commands/index.ts`, `src/commands/roles/shared.ts`, `src/commands/roles/words.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3; `src/commands/choices.ts`; `MEMBER_WRITE_THROTTLE`; `src/commands/index.ts`.
- Produces: `/iam [role]` and `/iamnot role` (`src/commands/roles/iam.ts`), enabled by `settings.features.roles`; the autocomplete values `id:<role id>`; the answers for `done`, `nothing`, `refused` and `partial`. `/iam` without a role answers with a sentence until Task 5 gives it the menus.

Reference commit of the prototype for this task: `3fdc01b`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/roles/iam.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  sent,
} from '../../../test/support/fake-interactions.js';
import { ALICE } from '../../../test/support/parties.js';
import { ROLE, selfRolesWith } from '../../../test/support/roles.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { enabledCommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { commands } from '../index.js';
import { iam, iamnot } from './iam.js';

const ELSEWHERE = '499999999999999999';
/** What a member reads when Discord refuses a role for lack of a permission. */
const LET =
  'Discord did not let me. A moderator should check that my role has the Manage Roles ' +
  'permission and stands above the roles I hand out.';

async function setup() {
  const made = selfRolesWith();
  await made.offerSample();
  made.server.member(ALICE);
  const { ctx, entries } = createTestContext({ selfRoles: made.selfRoles });
  const router = new InteractionRouter(ctx, [iam, iamnot], []);
  /** A command of Alice, who is shown with the roles she holds at that moment. */
  const run = async (commandName: string, role: string | undefined, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName,
      ...made.server.interactionOf(ALICE),
      options: role === undefined ? {} : { role },
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const answer = async (commandName: string, role: string | undefined, extra: object = {}) => {
    const used = await run(commandName, role, extra);
    for (const mock of [used.editReply, used.followUp, used.reply]) {
      if (mock.mock.calls.length > 0) return sent(mock).content;
    }
    throw new Error('nothing was answered');
  };
  const choices = async (commandName: string, focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName,
      ...made.server.interactionOf(ALICE),
      focused,
      focusedName: 'role',
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction.respond.mock.calls[0]?.[0] ?? [];
  };
  const held = () => made.server.heldNames(ALICE);
  return { ...made, ctx, entries, run, answer, choices, held };
}

describe('the role commands', () => {
  it('are offered only where the feature is on, in servers, under Roles', () => {
    const { ctx } = createTestContext();
    const names = (config: typeof ctx.config) =>
      enabledCommands(commands, config).map((command) => command.data.name);
    expect(names(ctx.config)).toEqual(expect.arrayContaining(['iam', 'iamnot']));
    const off = {
      ...ctx.config,
      settings: {
        ...ctx.config.settings,
        features: { ...ctx.config.settings.features, roles: false },
      },
    };
    expect(names(off)).not.toContain('iam');
    expect(names(off)).not.toContain('iamnot');
    expect(iam.help.category).toBe('roles');
    expect(iamnot.help.category).toBe('roles');
    expect(iam.data.toJSON().contexts).toBeUndefined();
  });

  it('answer privately, in any channel, and not in a DM', async () => {
    const { run, answer } = await setup();
    const used = await run('iam', 'North', { channelName: 'random-chatter' });
    expect(sent(used.deferReply).flags).toBe(MessageFlags.Ephemeral);
    expect(await answer('iam', 'North', { isDm: true })).toBe('This only works in a server.');
  });
});

describe('/iam role', () => {
  it('gives the role that was picked from the list', async () => {
    const { answer, held, gateway } = await setup();
    expect(await answer('iam', `id:${ROLE.north}`)).toBe('You have **North** now.');
    expect(held()).toEqual(['North']);
    expect(gateway.said()).toEqual(['give North']);
  });

  it('gives the role a typed name or alias names outright, without case', async () => {
    const { answer, held } = await setup();
    expect(await answer('iam', ' south ')).toBe('You have **South** now.');
    expect(await answer('iam', 'N')).toBe('You have **North** now.');
    expect(held()).toEqual(['North', 'South']);
  });

  it('says so when the member has the role already, and asks nothing of Discord', async () => {
    const { answer, server, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    expect(await answer('iam', 'North')).toBe('You have **North** already.');
    expect(gateway.calls).toEqual([]);
  });

  it('takes the other roles of a pick-one group away in the same step, and says so', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor, ROLE.north, ROLE.moderator);
    expect(await answer('iam', 'Mystic')).toBe(
      'You have **Mystic** now. I took **Valor** away: only one role of the group Teams can ' +
        'be held at a time.',
    );
    expect(held()).toEqual(['Moderator', 'Mystic', 'North']);
    expect(gateway.said()).toEqual(['give Mystic', 'take Valor']);
  });

  it('refuses a text that is not a name or an alias in full, with suggestions', async () => {
    const { answer, held } = await setup();
    expect(await answer('iam', 'nor')).toBe(
      'No self-assignable role is called "nor". Did you mean **North**? Pick the role ' +
        'from the list that appears while you type.',
    );
    expect(await answer('iam', 'zzz')).toBe(
      'No self-assignable role is called "zzz". Pick the role from the list that appears while ' +
        'you type.',
    );
    expect(held()).toEqual([]);
  });

  it('never gives a role that is not on the list, by name or by a made-up choice', async () => {
    const { answer, held, gateway } = await setup();
    for (const role of [
      'Moderator',
      'Admin',
      `id:${ROLE.admin}`,
      `id:${ROLE.moderator}`,
      '@everyone',
    ]) {
      expect(await answer('iam', role)).toContain('No self-assignable role is called');
    }
    expect(held()).toEqual([]);
    expect(gateway.calls).toEqual([]);
  });

  it('refuses a role that was given a moderation permission after it was added', async () => {
    const { answer, server, held } = await setup();
    server.edit(ROLE.north, { moderation: ['Manage Messages'] });
    expect(await answer('iam', 'North')).toBe(
      '**North** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list.',
    );
    expect(held()).toEqual([]);
  });

  it('says what a moderator has to mend when the bot cannot give the role', async () => {
    const { answer, server, held, gateway } = await setup();
    server.edit(ROLE.north, { position: 55 });
    expect(await answer('iam', 'North')).toBe(
      'I cannot give or take **North**: it is not below my own role in the list of roles of ' +
        'this server. A moderator has to move my role above it.',
    );
    server.bot.mayManageRoles = false;
    expect(await answer('iam', 'South')).toBe(
      'I cannot change roles on this server: I lack the Manage Roles permission. A moderator ' +
        'has to give it to my role.',
    );
    server.delete(ROLE.east);
    expect(await answer('iam', 'East')).toBe(
      '**East** is not available at the moment: the role behind it is missing on this server. ' +
        'A moderator can mend that with `/admin self-roles`.',
    );
    expect(held()).toEqual([]);
    expect(gateway.calls).toEqual([]);
  });

  it('says a sentence, not an error with a reference, when Discord refuses the change', async () => {
    const { answer, gateway, entries } = await setup();
    gateway.refusing = 'no-permission';
    const text = await answer('iam', 'North');
    expect(text).toBe(`I could not give you **North**: ${LET} Nothing was changed.`);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('says so when the roles of the server are not known', async () => {
    const { answer } = await setup();
    expect(await answer('iam', 'North', { guildId: ELSEWHERE })).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });

  it('works for a role the legacy bot added, and for one that was renamed since', async () => {
    const { answer, server, storage, held } = await setup();
    server.role('540000000000000001', 'Raider');
    storage.legacyRow('raider', { aliases: ['raids'] });
    expect(await answer('iam', 'raids')).toBe('You have **Raider** now.');
    server.edit('540000000000000001', { name: 'Raid Fan' });
    server.edit(ROLE.south, { name: 'Southside' });
    expect(await answer('iam', 'southside')).toBe('You have **Southside** now.');
    expect(await answer('iam', 'raider')).toContain('No self-assignable role is called');
    expect(held()).toEqual(['Raid Fan', 'Southside']);
  });

  it('shows names that members could have written as text', async () => {
    const { answer, server, selfRoles, owner } = await setup();
    server.role('540000000000000001', '**bold** <@&1>');
    await selfRoles.addRole(FAKE_GUILD_ID, { roleId: '540000000000000001' }, owner());
    const text = await answer('iam', '**bold** <@&1>');
    expect(text).toBe('You have **\\*\\*bold\\*\\* <\u200b@&1>** now.');
  });

  it('offers the self-assignable roles by name and alias, with the description beside the name', async () => {
    const { choices, server } = await setup();
    server.edit(ROLE.trader, { moderation: ['Kick Members'] }).delete(ROLE.east);
    expect(await choices('iam', '')).toEqual([
      { name: 'Instinct', value: `id:${ROLE.instinct}` },
      { name: 'Mystic', value: `id:${ROLE.mystic}` },
      { name: 'North · North of the river', value: `id:${ROLE.north}` },
      { name: 'South', value: `id:${ROLE.south}` },
      { name: 'Valor', value: `id:${ROLE.valor}` },
    ]);
    expect(await choices('iam', 'n')).toMatchObject([
      { name: 'North · North of the river' },
      { name: 'Instinct' },
    ]);
    expect(await choices('iam', 'sou')).toMatchObject([{ name: 'South' }]);
    expect(await choices('iam', 'x')).toEqual([]);
    expect(await choices('iam', '', { guildId: ELSEWHERE })).toEqual([]);
  });

  it('offers 25 choices at most, each within 100 characters', async () => {
    const { choices, server, selfRoles, owner } = await setup();
    for (let n = 0; n < 30; n++) {
      const id = `55${String(n).padStart(16, '0')}`;
      server.role(id, `Zone ${String(n).padStart(2, '0')}`);
      await selfRoles.addRole(FAKE_GUILD_ID, { roleId: id, description: 'd'.repeat(150) }, owner());
    }
    const offered = await choices('iam', 'zone');
    expect(offered).toHaveLength(25);
    for (const choice of offered) expect(choice.name.length).toBeLessThanOrEqual(100);
  });
});

describe('/iamnot', () => {
  it('takes a role away', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.north, ROLE.valor, ROLE.admin);
    expect(await answer('iamnot', `id:${ROLE.north}`)).toBe('You no longer have **North**.');
    expect(await answer('iamnot', 'valor')).toBe('You no longer have **Valor**.');
    expect(held()).toEqual(['Admin']);
    expect(gateway.said()).toEqual(['take North', 'take Valor']);
  });

  it('says so when the member does not have the role', async () => {
    const { answer, server, gateway } = await setup();
    expect(await answer('iamnot', 'North')).toBe('You do not have **North**.');
    server.delete(ROLE.east);
    expect(await answer('iamnot', 'East')).toBe('You do not have **East**.');
    expect(gateway.calls).toEqual([]);
  });

  it('never takes away a role that is not on the list', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.moderator, ROLE.booster);
    for (const role of [
      'Moderator',
      `id:${ROLE.moderator}`,
      'Server Booster',
      `id:${ROLE.booster}`,
    ]) {
      expect(await answer('iamnot', role)).toBe(
        `No self-assignable role is called "${role}". Pick one of your roles from the list ` +
          'that appears while you type.',
      );
    }
    expect(held()).toEqual(['Moderator', 'Server Booster']);
    expect(gateway.calls).toEqual([]);
  });

  it('still takes away a role that may no longer be given', async () => {
    const { answer, server, held } = await setup();
    server.member(ALICE, ROLE.north);
    server.edit(ROLE.north, { moderation: ['Manage Messages'] });
    expect(await answer('iamnot', 'North')).toBe('You no longer have **North**.');
    expect(held()).toEqual([]);
  });

  it('says what a moderator has to mend when the bot cannot take the role', async () => {
    const { answer, server, held } = await setup();
    server.member(ALICE, ROLE.north);
    server.edit(ROLE.north, { position: 55 });
    expect(await answer('iamnot', 'North')).toContain('I cannot give or take **North**');
    server.edit(ROLE.north, { position: 5 });
    server.bot.mayManageRoles = false;
    expect(await answer('iamnot', 'North')).toContain('I lack the Manage Roles permission');
    expect(held()).toEqual(['North']);
  });

  it('offers only the self-assignable roles the member holds', async () => {
    const { choices, server } = await setup();
    expect(await choices('iamnot', '')).toEqual([]);
    server.member(ALICE, ROLE.north, ROLE.valor, ROLE.moderator, ROLE.booster);
    expect(await choices('iamnot', '')).toEqual([
      { name: 'North · North of the river', value: `id:${ROLE.north}` },
      { name: 'Valor', value: `id:${ROLE.valor}` },
    ]);
    expect(await choices('iamnot', 'val')).toMatchObject([{ name: 'Valor' }]);
  });

  it('offers a role right after it was given, before Discord shows it on the member', async () => {
    const { answer, choices, server } = await setup();
    // The interaction of the list is as old as the one of the command: Alice held nothing.
    const before = server.interactionOf(ALICE);
    await answer('iam', 'North');
    expect(await choices('iamnot', '', before)).toMatchObject([{ value: `id:${ROLE.north}` }]);
  });
});

describe('the roles a member holds, as the role commands know them', () => {
  it('believe a later interaction over their own change: a role staff took away since is not offered', async () => {
    const { answer, choices, server, clock } = await setup();
    await answer('iam', 'North');
    // Staff take North away by hand; five seconds later Alice asks for the list of her roles.
    server.member(ALICE);
    clock.now += 5_000;
    expect(await choices('iamnot', '')).toEqual([]);
    expect(await answer('iamnot', 'North')).toBe('You do not have **North**.');
  });

  it('do not undo what happened to the member since their interaction was made', async () => {
    const { answer, server, held, gateway } = await setup();
    server.role('580000000000000001', 'Muted', { position: 45 });
    server.member(ALICE, ROLE.moderator);
    // The interaction shows Alice as a moderator; she is demoted and muted before it is handled.
    const stale = server.interactionOf(ALICE);
    server.member(ALICE, '580000000000000001');
    expect(await answer('iam', 'North', stale)).toBe('You have **North** now.');
    expect(held()).toEqual(['Muted', 'North']);
    expect(gateway.said()).toEqual(['give North']);
  });

  it('say "already" for a role an old interaction still shows, and change nothing', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    const stale = server.interactionOf(ALICE);
    server.member(ALICE);
    // Wrong, and harmless: nothing is asked of Discord.
    expect(await answer('iam', 'North', stale)).toBe('You have **North** already.');
    expect(held()).toEqual([]);
    expect(gateway.calls).toEqual([]);
  });
});

describe('a change of roles that Discord stops', () => {
  it('says what was given and what could not be taken away', async () => {
    const { answer, server, held, gateway, entries } = await setup();
    server.member(ALICE, ROLE.valor);
    // Between the bot's look at the roles and its second request Valor is moved above its own.
    gateway.meanwhile = (call) => {
      if (call.action === 'take') server.edit(ROLE.valor, { position: 55 });
    };
    expect(await answer('iam', 'Mystic')).toBe(
      `You have **Mystic** now. I could not take **Valor** away: ${LET}`,
    );
    expect(held()).toEqual(['Mystic', 'Valor']);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('does not ask Discord to take a role that left the bot\u2019s reach while the new one was given', async () => {
    const { answer, server, storage, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    // While Mystic is on its way, Valor is moved above the bot's own role.
    gateway.meanwhile = (call) => {
      if (call.action === 'give') server.edit(ROLE.valor, { position: 55 });
    };
    expect(await answer('iam', 'Mystic')).toBe(
      'You have **Mystic** now. I cannot give or take **Valor**: it is not below my own role ' +
        'in the list of roles of this server. A moderator has to move my role above it.',
    );
    expect(held()).toEqual(['Mystic', 'Valor']);
    expect(gateway.said()).toEqual(['give Mystic']);

    // Or staff take the old role off the list meanwhile.
    server.edit(ROLE.valor, { position: 5 }).member(ALICE, ROLE.mystic);
    gateway.meanwhile = (call) => {
      const row = storage.rows.find((other) => other.name === 'Mystic');
      if (call.action === 'give') void storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
    };
    expect(await answer('iam', 'Valor')).toBe(
      'You have **Valor** now. **Mystic** was not taken away: it is no longer on the list.',
    );
    expect(held()).toEqual(['Mystic', 'Valor']);
  });

  it('takes nothing away when the role itself could not be given', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    gateway.meanwhile = () => server.edit(ROLE.mystic, { position: 55 });
    expect(await answer('iam', 'Mystic')).toBe(
      `I could not give you **Mystic**: ${LET} After that I did not try to take **Valor** ` +
        'away. Nothing was changed.',
    );
    expect(held()).toEqual(['Valor']);
    expect(gateway.said()).toEqual(['give Mystic']);
  });

  it('says so when a role could not be taken away', async () => {
    const { answer, server, held, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    gateway.refusing = 'no-permission';
    expect(await answer('iamnot', 'North')).toBe(
      `I could not take **North** away: ${LET} Nothing was changed.`,
    );
    expect(held()).toEqual(['North']);
  });

  it.each([
    [
      'two-factor',
      "this server requires two-factor authentication for moderation, and the bot's owner has " +
        'none.',
    ],
    ['no-role', 'the role was deleted a moment ago.'],
    ['no-member', 'Discord says you are no longer a member of this server.'],
  ] as const)('gives the refusal %s a sentence of its own', async (reason, sentence) => {
    const { answer, gateway, entries } = await setup();
    gateway.refusing = reason;
    expect(await answer('iam', 'North')).toBe(
      `I could not give you **North**: ${sentence} Nothing was changed.`,
    );
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });
});

describe('what a member is told about a role that cannot be given', () => {
  it('names the role that is in the way of a pick-one group, and why it cannot be taken', async () => {
    const { answer, server, held } = await setup();
    server.member(ALICE, ROLE.valor);
    server.edit(ROLE.valor, { position: 55 });
    expect(await answer('iam', 'Mystic')).toBe(
      '**Mystic** was not given: you hold **Valor** of the group Teams, of which only one can ' +
        'be held, and I cannot take that one away: it is not below my own role. A moderator ' +
        'has to move my role above it.',
    );
    server.edit(ROLE.valor, { position: 5, managed: true });
    expect(await answer('iam', 'Mystic')).toBe(
      '**Mystic** was not given: you hold **Valor** of the group Teams, of which only one can ' +
        'be held, and I cannot take that one away: it is managed by an integration now. A ' +
        'moderator has to take it off the list.',
    );
    expect(held()).toEqual(['Valor']);
  });

  it('says that a role an integration took over can no longer be handed out', async () => {
    const { answer, server } = await setup();
    server.edit(ROLE.north, { managed: true });
    expect(await answer('iam', 'North')).toBe(
      '**North** can no longer be handed out. A moderator has to take it off the list.',
    );
  });
});
```

Run: `npx vitest run --project unit src/commands/roles/iam.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -17,6 +17,7 @@ import { boss, moveset } from './raids/boss.js';
 import { location } from './raids/location.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
+import { iam, iamnot } from './roles/iam.js';
 import { settings } from './settings/settings.js';
 import { conductor } from './trains/conductor.js';
 import { finish, next, previous, skip } from './trains/move.js';
@@ -69,6 +70,8 @@ export const commands: readonly CommandModule[] = [
   targets,
   untargetAll,
   wildCommand,
+  iam,
+  iamnot,
   friendCode,
   nickname,
   admin,
```

Create `src/commands/roles/iam.ts`:

```ts
import { SlashCommandBuilder, type AutocompleteInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import {
  findEntry,
  suggestEntries,
  type Roster,
  type RosterEntry,
} from '../../domain/roles/self-roles.js';
import { plain, truncate } from '../../render/text.js';
import type { RoleChangeOutcome } from '../../services/self-role-service.js';
import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import {
  actingRoleMember,
  roleMember,
  ROLES_UNAVAILABLE,
  rolesEnabled,
  roleText,
  typedText,
} from './shared.js';
import { failureSentences, memberProblem, namesOf } from './words.js';

/**
 * The value of a role picked from the list of the `role` option: the id of the Discord role.
 * Anything else that is sent was typed, and is read as a name or an alias in full.
 */
const ROLE_CHOICE = /^id:(\d{15,20})$/;
const choiceValue = (entry: RosterEntry): string => `id:${entry.role?.id ?? ''}`;

/** The entry a `role` option means: the one picked from the list, or the one the text names outright. */
function meantEntry(roster: Roster, typed: string): RosterEntry | undefined {
  const picked = ROLE_CHOICE.exec(typed.trim());
  if (picked) return roster.entries.find((entry) => entry.role?.id === picked[1]);
  return findEntry(roster.entries, typed);
}

/** The choices for a `role` option: these entries by what was typed, in names and aliases. */
function roleChoices(entries: readonly RosterEntry[], typed: string): Choice[] {
  const text = typed.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      const names = [entry.name, ...entry.row.aliases].join('\n').toLowerCase();
      return words.every((word) => names.includes(word));
    })
    .map((entry) => ({ entry, name: entry.name }))
    .sort(beginningFirst(text))
    .slice(0, MAX_CHOICES)
    .map(({ entry }) => ({
      name: truncate(
        entry.row.description === null ? entry.name : `${entry.name} · ${entry.row.description}`,
        CHOICE_NAME,
      ),
      value: choiceValue(entry),
    }));
}

/** The roster and the member of an autocomplete; undefined where there is nothing to offer. */
async function offered(interaction: AutocompleteInteraction, ctx: AppContext) {
  const member = roleMember(interaction);
  if (!member || interaction.guildId === null) return undefined;
  const roster = await ctx.selfRoles.roster(interaction.guildId);
  if (!roster) return undefined;
  return { roster, held: new Set(ctx.selfRoles.heldNow(interaction.guildId, member)) };
}

/** A change of one role that the bot knows the server's roles for; refused otherwise. */
function carried(outcome: RoleChangeOutcome): Exclude<RoleChangeOutcome, { kind: 'unavailable' }> {
  if (outcome.kind === 'unavailable') throw new UserError(ROLES_UNAVAILABLE);
  return outcome;
}

/**
 * `/iam` (spec 4.2; the legacy `!iam`): a member gives themself one of the roles the server
 * offers. Private, and tied to no channel (spec 3.2).
 */
export const iam: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('iam')
    .setDescription('Give yourself one of the roles this server offers')
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription('The role: type part of its name and pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'roles',
    details:
      'Gives you a role this server lets its members take themselves: your region, your team ' +
      'and the like. Pick it from the list that appears while you type. Of some groups of ' +
      'roles (teams) you can hold only one: taking another one gives the first back. ' +
      '`/iamnot` takes a role away again.',
    examples: ['/iam role:Mystic'],
  },
  enabled: rolesEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: MEMBER_WRITE_THROTTLE,

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    const typed = interaction.options.getString('role');
    if (typed === null || typed.trim() === '') {
      throw new UserError(
        'Say which role: type part of its name in `role` and pick it from the list.',
      );
    }
    const roster = await ctx.selfRoles.roster(guildId);
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    const entry = meantEntry(roster, typed);
    if (!entry) {
      const near = suggestEntries(
        roster.entries.filter((other) => other.problem === undefined),
        typed,
      );
      throw new UserError(
        `No self-assignable role is called ${typedText(typed)}.` +
          (near.length === 0 ? '' : ` Did you mean ${namesOf(near, 'or')}?`) +
          ' Pick the role from the list that appears while you type.',
      );
    }
    const name = roleText(entry.name);
    if (!entry.role) {
      throw new UserError(memberProblem(name, { reason: entry.problem ?? 'gone', entry }));
    }
    const outcome = carried(
      await ctx.selfRoles.change(guildId, member, { give: [entry.role.id], take: [] }),
    );
    const { plan, given, taken } = outcome;
    const [skipped] = plan.skipped;
    if (skipped) throw new UserError(memberProblem(name, skipped));
    // What was really done is said first; what Discord stopped, after it.
    const sentences: string[] = [];
    if (given.length > 0) sentences.push(`You have ${name} now.`);
    else if (outcome.kind === 'done') sentences.push(`You have ${name} already.`);
    if (taken.length > 0) {
      sentences.push(
        `I took ${namesOf(taken)} away: only one role of the group ` +
          `${plain(entry.group?.name ?? '')} can be held at a time.`,
      );
    }
    if (outcome.kind === 'partial') sentences.push(...failureSentences(outcome));
    await interaction.editReply({ content: sentences.join(' ') });
  },

  async autocomplete(interaction, ctx) {
    const found = await offered(interaction, ctx);
    await interaction.respond(
      found
        ? roleChoices(
            found.roster.entries.filter((entry) => entry.problem === undefined),
            interaction.options.getFocused(),
          )
        : [],
    );
  },
};

/** `/iamnot` (spec 4.2; the legacy `!iamnot`): a member gives one of those roles back. */
export const iamnot: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('iamnot')
    .setDescription('Give back a role you gave yourself')
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription('One of your roles: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'roles',
    details:
      'Takes away one of the roles this server lets its members take themselves. The list that ' +
      'appears while you type shows those you have. Roles that are not self-assignable are ' +
      'not on it.',
    examples: ['/iamnot role:North'],
  },
  enabled: rolesEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: MEMBER_WRITE_THROTTLE,

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    const typed = interaction.options.getString('role', true);
    const roster = await ctx.selfRoles.roster(guildId);
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    const entry = meantEntry(roster, typed);
    if (!entry) {
      throw new UserError(
        `No self-assignable role is called ${typedText(typed)}. Pick one of your roles from the ` +
          'list that appears while you type.',
      );
    }
    const name = roleText(entry.name);
    if (!entry.role) {
      // Nobody holds a role that does not exist.
      await interaction.editReply({ content: `You do not have ${name}.` });
      return;
    }
    const outcome = carried(
      await ctx.selfRoles.change(guildId, member, { give: [], take: [entry.role.id] }),
    );
    const [skipped] = outcome.plan.skipped;
    if (skipped) throw new UserError(memberProblem(name, skipped));
    await interaction.editReply({
      content:
        outcome.kind === 'partial'
          ? failureSentences(outcome).join(' ')
          : outcome.taken.length === 0
            ? `You do not have ${name}.`
            : `You no longer have ${name}.`,
    });
  },

  async autocomplete(interaction, ctx) {
    const found = await offered(interaction, ctx);
    await interaction.respond(
      found
        ? roleChoices(
            found.roster.entries.filter(
              (entry) => entry.role !== undefined && found.held.has(entry.role.id),
            ),
            interaction.options.getFocused(),
          )
        : [],
    );
  },
};
```

Apply to `src/commands/roles/shared.ts`:

```diff
--- a/src/commands/roles/shared.ts
+++ b/src/commands/roles/shared.ts
@@ -1,5 +1,8 @@
 import type { Config } from '../../config/index.js';
+import type { LocatedInteraction } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
 import { plain, truncate } from '../../render/text.js';
+import type { RoleMember } from '../../services/self-role-service.js';
 
 /** Whether this installation has self-assigned roles at all (`settings.features.roles`). */
 export const rolesEnabled = (config: Config): boolean => config.settings.features.roles;
@@ -15,12 +18,36 @@ export function typedText(text: string): string {
   return `"${plain(truncate(text.trim(), 80))}"`;
 }
 
-/** "A", "A and B", "A, B and C". */
-export function listed(items: readonly string[]): string {
+/** "A", "A and B", "A, B and C"; with another word for "and": "A, B or C". */
+export function listed(items: readonly string[], and = 'and'): string {
   if (items.length <= 1) return items.join('');
-  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
+  return `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1) ?? ''}`;
 }
 
 /** What a member or staff is told while the bot does not know the server's roles. */
 export const ROLES_UNAVAILABLE =
   'I cannot see the roles of this server at the moment. Try again in a minute.';
+
+/**
+ * The member of an interaction as self-assigned roles need them: who they are and the roles the
+ * interaction shows them with, by id, without the role every member has (whose id is the
+ * server's), and when the interaction was made: that is the moment the roles are of. The bot
+ * keeps no member list, so this is all it knows of a member's roles. Undefined outside a server
+ * the bot is in.
+ */
+export function roleMember(interaction: LocatedInteraction): RoleMember | undefined {
+  if (!interaction.inCachedGuild()) return undefined;
+  const everyone = interaction.guildId;
+  return {
+    id: interaction.user.id,
+    held: [...interaction.member.roles.cache.keys()].filter((id) => id !== everyone),
+    seenAt: interaction.createdTimestamp,
+  };
+}
+
+/** As `roleMember`, for a handler behind `requireGuild`; refused like the guard refuses. */
+export function actingRoleMember(interaction: LocatedInteraction): RoleMember {
+  const member = roleMember(interaction);
+  if (!member) throw new UserError('This only works in a server.');
+  return member;
+}
```

Apply to `src/commands/roles/words.ts`:

```diff
--- a/src/commands/roles/words.ts
+++ b/src/commands/roles/words.ts
@@ -1,5 +1,13 @@
-import type { RoleProblem, SelfRoleGroup, ServerRole } from '../../domain/roles/self-roles.js';
-import { listed } from './shared.js';
+import type {
+  RoleProblem,
+  RosterEntry,
+  SelfRoleGroup,
+  ServerRole,
+  Skipped,
+} from '../../domain/roles/self-roles.js';
+import { plain } from '../../render/text.js';
+import type { RoleChangeOutcome, RoleFailure } from '../../services/self-role-service.js';
+import { listed, ROLES_UNAVAILABLE, roleText } from './shared.js';
 
 /**
  * Why a role cannot be handed out, as the rest of a sentence about it ("**North** cannot be
@@ -29,7 +37,133 @@ export function whyNot(problem: RoleProblem, role: ServerRole | undefined): stri
   }
 }
 
+/** What a member is told when nothing can be handed out because the bot lacks Manage Roles. */
+const NO_MANAGE_ROLES =
+  'I cannot change roles on this server: I lack the Manage Roles permission. A ' +
+  'moderator has to give it to my role.';
+
 /** A group's rule, as a list says it. */
 export function groupRule(group: Pick<SelfRoleGroup, 'pickOne'>): string {
   return group.pickOne ? 'pick one' : 'any number';
 }
+
+/**
+ * Why a member did not get a role, or did not lose one, as a sentence that says what a
+ * moderator has to mend: never an error with a reference. `name` is the role's name as shown
+ * (in bold already); `skip` says why, with the group of a role of which only one can be held
+ * and, for `stuck`, the role that is in the way.
+ */
+export function memberProblem(
+  name: string,
+  skip: Pick<Skipped, 'reason'> & Partial<Pick<Skipped, 'entry' | 'blocker'>>,
+): string {
+  const group = skip.entry?.group;
+  const ofGroup = group ? `the group ${plain(group.name)}` : 'its group';
+  switch (skip.reason) {
+    case 'gone':
+    case 'ambiguous':
+    case 'duplicate':
+      return (
+        `${name} is not available at the moment: the role behind it is missing on this ` +
+        'server. A moderator can mend that with `/admin self-roles`.'
+      );
+    case 'not-offered':
+      return `${name} is no longer a role you can give yourself.`;
+    case 'everyone':
+    case 'managed':
+      return `${name} can no longer be handed out. A moderator has to take it off the list.`;
+    case 'moderation':
+      return (
+        `${name} is not handed out any more: the role was changed since it was put on the ` +
+        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
+        'the role back or take it off the list.'
+      );
+    case 'above-bot':
+      return (
+        `I cannot give or take ${name}: it is not below my own role in the list of roles of ` +
+        'this server. A moderator has to move my role above it.'
+      );
+    case 'no-manage-roles':
+      return NO_MANAGE_ROLES;
+    case 'pick-one':
+      return `${name} was not given: only one role of ${ofGroup} can be held at a time.`;
+    case 'stuck': {
+      const other = skip.blocker ? roleText(skip.blocker.name) : 'another role';
+      const held = `${name} was not given: you hold ${other} of ${ofGroup}, of which only one can be held, and I cannot take that one away`;
+      return skip.blocker?.problem === 'managed' || skip.blocker?.problem === 'everyone'
+        ? `${held}: it is managed by an integration now. A moderator has to take it off the list.`
+        : `${held}: it is not below my own role. A moderator has to move my role above it.`;
+    }
+  }
+}
+
+/** The names of entries in a sentence: "**A**, **B** and **C**". */
+export function namesOf(entries: readonly Pick<RosterEntry, 'name'>[], and = 'and'): string {
+  return listed(
+    entries.map((entry) => roleText(entry.name)),
+    and,
+  );
+}
+
+/** Why Discord did not carry out a step, as the rest of a sentence after a colon. */
+function whyFailed(reason: Exclude<RoleFailure['reason'], 'withdrawn'>): string {
+  switch (reason) {
+    case 'no-permission':
+      return (
+        'Discord did not let me. A moderator should check that my role has the Manage Roles ' +
+        'permission and stands above the roles I hand out.'
+      );
+    case 'no-role':
+      return 'the role was deleted a moment ago.';
+    case 'no-member':
+      return 'Discord says you are no longer a member of this server.';
+    case 'two-factor':
+      return (
+        "this server requires two-factor authentication for moderation, and the bot's owner " +
+        'has none.'
+      );
+    case 'error':
+      return 'something went wrong on the way to Discord. Try again in a moment.';
+  }
+}
+
+/**
+ * A step that was not sent because the list or the server changed while the steps before it
+ * were on their way, as a sentence: a role that has a problem now gets the sentence of that
+ * problem, as if it had been asked for a moment later.
+ */
+function withdrawnSentence(failed: Extract<RoleFailure, { reason: 'withdrawn' }>): string {
+  const name = roleText(failed.entry.name);
+  const not = failed.action === 'give' ? `${name} was not given` : `${name} was not taken away`;
+  if (failed.why === 'not-offered') return `${not}: it is no longer on the list.`;
+  if (failed.why === 'unavailable') return `${not}: ${ROLES_UNAVAILABLE}`;
+  return memberProblem(name, { reason: failed.why, entry: failed.entry });
+}
+
+/**
+ * What a change that stopped half-way did not do, as sentences: the step that failed with the
+ * reason, what was not tried after it, and "Nothing was changed." when nothing was done before
+ * it either. What was done before it the caller says in its own words.
+ */
+export function failureSentences(
+  outcome: Extract<RoleChangeOutcome, { kind: 'partial' }>,
+): string[] {
+  const { failed, untried } = outcome;
+  const name = roleText(failed.entry.name);
+  const sentences = [
+    failed.reason === 'withdrawn'
+      ? withdrawnSentence(failed)
+      : failed.action === 'give'
+        ? `I could not give you ${name}: ${whyFailed(failed.reason)}`
+        : `I could not take ${name} away: ${whyFailed(failed.reason)}`,
+  ];
+  const giving = untried.filter((step) => step.action === 'give').map((step) => step.entry);
+  const taking = untried.filter((step) => step.action === 'take').map((step) => step.entry);
+  const rest = [
+    ...(giving.length > 0 ? [`give you ${namesOf(giving)}`] : []),
+    ...(taking.length > 0 ? [`take ${namesOf(taking)} away`] : []),
+  ];
+  if (rest.length > 0) sentences.push(`After that I did not try to ${rest.join(' or to ')}.`);
+  if (outcome.given.length + outcome.taken.length === 0) sentences.push('Nothing was changed.');
+  return sentences;
+}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/roles/iam.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 3fdc01b -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/index.ts src/commands/roles/iam.test.ts src/commands/roles/iam.ts src/commands/roles/shared.ts src/commands/roles/words.ts
npm run typecheck; npx eslint src/commands/index.ts src/commands/roles/iam.test.ts src/commands/roles/iam.ts src/commands/roles/shared.ts src/commands/roles/words.ts   # both clean; the full check runs after the last task
git add src/commands/index.ts src/commands/roles/iam.test.ts src/commands/roles/iam.ts src/commands/roles/shared.ts src/commands/roles/words.ts
git commit -F <a file with the message below>
```

The commit message:

```
A member takes a role by name and gives one back: `/iam role`, `/iamnot`

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 5: The menus of iam without a role: one per group, pages, the handler

**Files:**
- Create: `src/commands/roles/menus.test.ts`, `src/commands/roles/menus.ts`, `src/domain/roles/menus.test.ts`, `src/domain/roles/menus.ts`, `src/render/role-menus.test.ts`, `src/render/role-menus.ts`
- Modify: `src/commands/roles/iam.ts`, `src/commands/roles/words.ts`, `src/components/index.ts`, `src/discord/custom-id.ts`, `test/support/roles.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4; `encodeCustomId` / `parseCustomId`; `src/components/index.ts`.
- Produces: `src/domain/roles/menus.ts` (pure): `roleMenus(roster, held)` (one menu per group, split into ranges of at most 25, or 24 and "None" for a pick-one group), `menuPages`, `menuRequest(shown, values)`; `src/render/role-menus.ts`: `renderRoleMenus`, `NO_ROLES`, `NONE_AVAILABLE`; the custom-id kind `roles` (`roles:<group row id|other>:pick:<part>:<page>`, `roles:page:prev|next:<page>`), documented in `custom-id.ts`; the component handler `roleControls` (`src/commands/roles/menus.ts`), listed in `src/components/index.ts`; `menusOf`, `buttonsOf` and `assertSendable` in `test/support/roles.ts`.

Reference commit of the prototype for this task: `aa32cd0`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/roles/menus.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeButton,
  fakeChatInput,
  fakeMessage,
  fakeSelect,
  sent,
  type FakeMessage,
  type FakeRow,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import { ALICE } from '../../../test/support/parties.js';
import {
  assertSendable,
  buttonsOf,
  FakeRoleGateway,
  menusOf,
  ROLE,
  selfRolesWith,
} from '../../../test/support/roles.js';
import type { MemorySelfRoles } from '../../../test/support/self-roles.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { components } from '../../components/index.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import { menuRequest, NONE_VALUE } from '../../domain/roles/menus.js';
import { iam, iamnot } from './iam.js';
import { roleControls } from './menus.js';

const ELSEWHERE = '499999999999999999';
/** What a member reads when Discord refuses a role for lack of a permission. */
const LET =
  'Discord did not let me. A moderator should check that my role has the Manage Roles ' +
  'permission and stands above the roles I hand out.';

/** What a shown message is: its text, and its rows as a press on it sees them. */
interface Shown {
  content: string;
  message: FakeMessage;
}

async function setup(kept: { storage?: MemorySelfRoles; gateway?: FakeRoleGateway } = {}) {
  const made = selfRolesWith(kept);
  if (!kept.storage) {
    await made.offerSample();
    made.server.member(ALICE);
  }
  const { ctx, entries } = createTestContext({ selfRoles: made.selfRoles });
  const router = new InteractionRouter(ctx, [iam, iamnot], [roleControls]);
  const shownBy = (payload: SentPayload): Shown => {
    assertSendable(payload);
    return {
      content: payload.content ?? '',
      message: fakeMessage((payload.components ?? []) as FakeRow[]),
    };
  };
  /** `/iam` without a role, by Alice as she is at this moment. */
  const open = async (extra: object = {}): Promise<Shown> => {
    const interaction = fakeChatInput({
      commandName: 'iam',
      ...made.server.interactionOf(ALICE),
      ...extra,
    });
    await router.handle(interaction as never);
    return shownBy(sent(interaction.editReply));
  };
  /** The custom id of the n-th menu of a message. */
  const menuId = (shown: Shown, index: number): string => {
    const menu = menusOf({ components: shown.message.rows })[index];
    if (!menu) throw new Error(`the message has no menu ${String(index)}`);
    return menu.custom_id;
  };
  /**
   * Alice changes the n-th menu of a message to these values. She is shown as she is at this
   * moment unless `extra` says otherwise. Gives the interaction and the message as it is then.
   */
  const pick = async (shown: Shown, index: number, values: string[], extra: object = {}) => {
    const interaction = fakeSelect({
      customId: menuId(shown, index),
      values,
      message: shown.message,
      ...made.server.interactionOf(ALICE),
      ...extra,
    });
    await router.handle(interaction as never);
    const edited = interaction.editReply.mock.calls.at(-1)?.[0];
    return { interaction, after: edited ? shownBy(edited) : undefined };
  };
  const press = async (shown: Shown, label: string, extra: object = {}) => {
    const button = buttonsOf({ components: shown.message.rows }).find((b) => b.label === label);
    if (!button?.custom_id) throw new Error(`the message has no button ${label}`);
    const interaction = fakeButton({
      customId: button.custom_id,
      message: shown.message,
      ...made.server.interactionOf(ALICE),
      ...extra,
    });
    await router.handle(interaction as never);
    const updated = interaction.editReply.mock.calls.at(-1)?.[0];
    return { interaction, after: updated ? shownBy(updated) : undefined };
  };
  const held = () => made.server.heldNames(ALICE);
  /** The last line of a message: what the change did. */
  const note = (shown: Shown | undefined) => shown?.content.split('\n').at(-1);
  const ticked = (shown: Shown | undefined) =>
    menusOf({ components: shown?.message.rows ?? [] }).map((menu) =>
      menu.options.filter((option) => option.default === true).map((option) => option.label),
    );
  return { ...made, ctx, entries, router, open, pick, press, held, note, ticked, menuId };
}

/** What `setup` gives a test. */
type Made = Awaited<ReturnType<typeof setup>>;

/** The roles each menu of a message offers, by their labels, without "None". */
const offered = (shown: Shown | undefined) =>
  menusOf({ components: shown?.message.rows ?? [] }).map((menu) =>
    menu.options.filter((option) => option.value !== NONE_VALUE).map((option) => option.label),
  );

describe('/iam without a role', () => {
  it('shows the menus privately, with the roles the member holds ticked', async () => {
    const { server, router, open, ticked } = await setup();
    server.member(ALICE, ROLE.north, ROLE.valor, ROLE.moderator);
    const interaction = fakeChatInput({ commandName: 'iam', ...server.interactionOf(ALICE) });
    await router.handle(interaction as never);
    expect(sent(interaction.deferReply).flags).toBe(MessageFlags.Ephemeral);
    const shown = await open();
    expect(shown.content.split('\n').slice(1)).toEqual([
      '1. Regions · any number',
      '2. Teams · pick one',
      '3. Other · any number',
    ]);
    expect(ticked(shown)).toEqual([['North'], ['Valor'], []]);
  });

  it('says so where there is nothing to pick', async () => {
    const made = selfRolesWith();
    made.server.member(ALICE);
    const { ctx } = createTestContext({ selfRoles: made.selfRoles });
    const router = new InteractionRouter(ctx, [iam], [roleControls]);
    const interaction = fakeChatInput({ commandName: 'iam', ...made.server.interactionOf(ALICE) });
    await router.handle(interaction as never);
    expect(sent(interaction.editReply)).toEqual({
      content: 'This server has no roles you can give yourself at the moment.',
      components: [],
    });
  });

  it('says what is wrong when roles are offered but none can be given', async () => {
    const { server, open } = await setup();
    server.bot.mayManageRoles = false;
    expect(await open()).toMatchObject({
      content:
        'I cannot change roles on this server: I lack the Manage Roles permission. A moderator ' +
        'has to give it to my role.',
    });
    server.bot.mayManageRoles = true;
    for (const id of [ROLE.north, ROLE.south, ROLE.east, ROLE.trader]) server.delete(id);
    for (const id of [ROLE.instinct, ROLE.mystic, ROLE.valor]) server.edit(id, { position: 55 });
    const shown = await open();
    expect(shown.content).toBe(
      "None of this server's self-assignable roles can be given at the moment. A moderator " +
        'can see why with `/admin self-roles list`.',
    );
    expect(shown.message.rows).toEqual([]);
  });

  it('says so when the roles of the server are not known', async () => {
    const { router } = await setup();
    const interaction = fakeChatInput({ commandName: 'iam', guildId: ELSEWHERE });
    await router.handle(interaction as never);
    expect(sent(interaction.followUp).content).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute.',
    );
  });
});

describe('changing a menu', () => {
  it('gives the roles that were ticked, one after the other, and shows the new state', async () => {
    const { open, pick, held, note, ticked, gateway } = await setup();
    const { interaction, after } = await pick(await open(), 0, [ROLE.north, ROLE.south]);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(note(after)).toBe('Added **North**, **South**.');
    expect(ticked(after)).toEqual([['North', 'South'], ['None'], []]);
    expect(held()).toEqual(['North', 'South']);
    expect(gateway.said()).toEqual(['give North', 'give South']);
  });

  it('takes away the roles of the menu that were unticked', async () => {
    const { server, open, pick, held, note, ticked } = await setup();
    server.member(ALICE, ROLE.north, ROLE.south, ROLE.trader);
    const { after } = await pick(await open(), 0, [ROLE.south, ROLE.east]);
    expect(note(after)).toBe('Added **East**; removed **North**.');
    expect(ticked(after)).toEqual([['East', 'South'], ['None'], ['Trader']]);
    expect(held()).toEqual(['East', 'South', 'Trader']);

    const { after: emptied } = await pick(after ?? (await open()), 0, []);
    expect(note(emptied)).toBe('Removed **East**, **South**.');
    expect(held()).toEqual(['Trader']);
  });

  it('gives the one role of a pick-one menu and takes the other away', async () => {
    const { server, open, pick, held, note, ticked, gateway } = await setup();
    server.member(ALICE, ROLE.valor);
    const { after } = await pick(await open(), 1, [ROLE.mystic]);
    // She unticked Valor herself by choosing Mystic: the rule of the group needs no saying.
    expect(note(after)).toBe('Added **Mystic**; removed **Valor**.');
    expect(ticked(after)).toEqual([[], ['Mystic'], []]);
    expect(held()).toEqual(['Mystic']);
    expect(gateway.said()).toEqual(['give Mystic', 'take Valor']);
  });

  it('takes the role of a pick-one group away with "None"', async () => {
    const { server, open, pick, held, note, ticked } = await setup();
    server.member(ALICE, ROLE.valor, ROLE.north);
    const { after } = await pick(await open(), 1, ['none']);
    expect(note(after)).toBe('Removed **Valor**.');
    expect(ticked(after)).toEqual([['North'], ['None'], []]);
    expect(held()).toEqual(['North']);
  });

  it('says that nothing changed when the menu is closed as it was', async () => {
    const { server, open, pick, note, gateway } = await setup();
    server.member(ALICE, ROLE.north);
    const { after } = await pick(await open(), 0, [ROLE.north]);
    expect(note(after)).toBe('Nothing was changed.');
    expect(gateway.calls).toEqual([]);
  });

  it('touches only the roles of the menu that was changed', async () => {
    const { server, open, pick, held } = await setup();
    const staff = [ROLE.moderator, ROLE.admin, ROLE.booster];
    server.member(ALICE, ...staff, ROLE.north, ROLE.valor, ROLE.trader);
    // Everything in each menu is unticked in turn, then everything is ticked.
    let shown = await open();
    shown = (await pick(shown, 0, [])).after ?? shown;
    expect(held()).toEqual(['Admin', 'Moderator', 'Server Booster', 'Trader', 'Valor']);
    shown = (await pick(shown, 2, [])).after ?? shown;
    expect(held()).toEqual(['Admin', 'Moderator', 'Server Booster', 'Valor']);
    shown = (await pick(shown, 1, ['none'])).after ?? shown;
    expect(held()).toEqual(['Admin', 'Moderator', 'Server Booster']);
    shown = (await pick(shown, 0, [ROLE.north, ROLE.south, ROLE.east])).after ?? shown;
    shown = (await pick(shown, 2, [ROLE.trader])).after ?? shown;
    await pick(shown, 1, [ROLE.instinct]);
    expect(held()).toEqual(
      [
        'Admin',
        'East',
        'Instinct',
        'Moderator',
        'North',
        'Server Booster',
        'South',
        'Trader',
      ].sort(),
    );
  });

  it('never gives or takes a role the menu did not show, whatever values arrive', async () => {
    const { server, open, pick, held, note, gateway } = await setup();
    server.member(ALICE, ROLE.moderator, ROLE.valor);
    const { after } = await pick(await open(), 0, [ROLE.admin, ROLE.moderator, ROLE.mystic, 'x']);
    expect(note(after)).toBe('Nothing was changed.');
    expect(held()).toEqual(['Moderator', 'Valor']);
    expect(gateway.calls).toEqual([]);
  });

  it('skips and names a ticked role that is no longer on the list', async () => {
    const { server, storage, open, pick, held, note, ticked } = await setup();
    server.member(ALICE, ROLE.east);
    const shown = await open();
    // Since the message was shown staff took North and East off the list.
    for (const name of ['North', 'East']) {
      const row = storage.rows.find((other) => other.name === name);
      await storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
    }
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    expect(note(after)).toBe(
      'Added **South**. **North** is no longer a role you can give yourself.',
    );
    // East was unticked, but it is not the bot's to take any more: Alice keeps it.
    expect(held()).toEqual(['East', 'South']);
    expect(ticked(after)).toEqual([['South'], ['None'], []]);
  });

  it('skips a role that may no longer be given, with what a moderator has to mend', async () => {
    const { server, open, pick, held, note } = await setup();
    const shown = await open();
    server.edit(ROLE.north, { moderation: ['Ban Members'] });
    server.edit(ROLE.south, { position: 60 });
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south, ROLE.east]);
    expect(note(after)).toBe(
      'Added **East**. ' +
        '**North** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list. ' +
        'I cannot give or take **South**: it is not below my own role in the list of roles of ' +
        'this server. A moderator has to move my role above it.',
    );
    expect(held()).toEqual(['East']);
  });

  it('gives none of two roles of a group that became pick-one since the menu was shown', async () => {
    const { storage, open, pick, held, note } = await setup();
    const shown = await open();
    await storage.saveGroup(FAKE_GUILD_ID, { name: 'Regions', pickOne: true });
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    expect(note(after)).toBe(
      '**North** was not given: only one role of the group Regions can be held at a time. ' +
        '**South** was not given: only one role of the group Regions can be held at a time. ' +
        'Nothing was changed.',
    );
    expect(held()).toEqual([]);
  });

  it('says once that the bot lacks Manage Roles, and changes nothing', async () => {
    const { server, open, pick, held } = await setup();
    const shown = await open();
    server.bot.mayManageRoles = false;
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south]);
    expect(after?.content).toBe(
      'I cannot change roles on this server: I lack the Manage Roles permission. A moderator ' +
        'has to give it to my role. Nothing was changed.',
    );
    expect(held()).toEqual([]);
  });

  it('says a sentence when Discord refuses the change, and shows the menus as they are', async () => {
    const { gateway, open, pick, held, note, ticked, entries } = await setup();
    gateway.refusing = 'no-permission';
    const { after } = await pick(await open(), 0, [ROLE.north]);
    expect(note(after)).toBe(`I could not give you **North**: ${LET} Nothing was changed.`);
    expect(ticked(after)).toEqual([[], ['None'], []]);
    expect(held()).toEqual([]);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it('does not lose a change to a second menu changed before the first one arrived', async () => {
    const { server, gateway, open, pick, held } = await setup();
    const shown = await open();
    // Both presses were made while Discord still showed Alice without any role.
    const stale = server.interactionOf(ALICE);
    let release: () => void = () => undefined;
    gateway.holding = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = pick(shown, 0, [ROLE.north], stale);
    const second = pick(shown, 1, [ROLE.mystic], stale);
    release();
    await Promise.all([first, second]);
    expect(held()).toEqual(['Mystic', 'North']);
  });

  it('works on a message from before a restart', async () => {
    const before = await setup();
    before.server.member(ALICE, ROLE.north);
    const shown = await before.open();
    // New services and a new router over the same database and the same Discord.
    const after = await setup({ storage: before.storage, gateway: before.gateway });
    const { after: message } = await after.pick(shown, 0, [ROLE.south]);
    expect(after.note(message)).toBe('Added **South**; removed **North**.');
    expect(after.held()).toEqual(['South']);
  });

  it('answers a menu that its message does not have as a control that is no longer active', async () => {
    const { router, server, held } = await setup();
    const interaction = fakeSelect({
      customId: 'roles:other:pick:0:0',
      values: [ROLE.trader],
      messageRows: [],
      ...server.interactionOf(ALICE),
    });
    await router.handle(interaction as never);
    expect(sent(interaction.reply).content).toBe(STALE_COMPONENT);
    expect(held()).toEqual([]);
  });

  it('puts the menus back as they were when the roles of the server are not known', async () => {
    const { server, open, pick, ticked } = await setup();
    server.member(ALICE, ROLE.south);
    const { interaction, after } = await pick(await open(), 0, [ROLE.north], {
      guildId: ELSEWHERE,
    });
    expect(after?.content).toBe(
      'I cannot see the roles of this server at the moment. Try again in a minute. Nothing ' +
        'was changed.',
    );
    // The tick of the press does not stand: the message shows what it showed before.
    expect(ticked(after)).toEqual([['South'], ['None'], []]);
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('puts the menus back as they were when the change fails before anything was done', async () => {
    const { server, gateway, open, pick, held, ticked, entries } = await setup();
    server.member(ALICE, ROLE.south);
    gateway.failing = new Error('Discord is away');
    const { interaction, after } = await pick(await open(), 0, [ROLE.north, ROLE.south]);
    // The tick of the press does not stand: the message shows what it showed before,
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(after?.content).toBe('Nothing was changed.');
    expect(ticked(after)).toEqual([['South'], ['None'], []]);
    expect(held()).toEqual(['South']);
    // and the member is told as for any failure, with the reference of the log line.
    const failure = entries.find((entry) => entry.msg === 'interaction failed');
    expect(failure).toBeDefined();
    expect(sent(interaction.followUp)).toMatchObject({
      content: `Something went wrong (ref \`${String(failure?.ref)}\`).`,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('still reports the failure when the menus cannot be put back either', async () => {
    const { server, gateway, open, router, menuId, entries } = await setup();
    server.member(ALICE, ROLE.south);
    const shown = await open();
    gateway.failing = new Error('Discord is away');
    const interaction = fakeSelect({
      customId: menuId(shown, 0),
      values: [ROLE.north],
      message: shown.message,
      ...server.interactionOf(ALICE),
    });
    interaction.editReply.mockRejectedValueOnce(new Error('no message'));
    await router.handle(interaction as never);
    expect(entries.some((entry) => entry.msg === 'could not put the role menus back')).toBe(true);
    const failure = entries.find((entry) => entry.msg === 'interaction failed');
    expect(String((failure?.err as { message?: string } | undefined)?.message)).toBe(
      'Discord is away',
    );
    expect(sent(interaction.followUp).content).toContain('Something went wrong');
  });

  it('takes away only what the menu showed ticked: a role got elsewhere since stays', async () => {
    const { server, open, pick, held, note, ticked } = await setup();
    // The message is made while Alice holds nothing; then she gets South some other way.
    const old = await open();
    server.member(ALICE, ROLE.south);
    const { after } = await pick(old, 0, [ROLE.north]);
    expect(note(after)).toBe('Added **North**.');
    expect(held()).toEqual(['North', 'South']);
    expect(ticked(after)).toEqual([['North', 'South'], ['None'], []]);
  });

  it('says the rule of a pick-one group for a role the member did not untick in the menu', async () => {
    const { server, open, pick, held, note } = await setup();
    // The message shows no team; Alice then takes Valor with `/iam role`, and picks Mystic in it.
    const old = await open();
    server.member(ALICE, ROLE.valor);
    const { after } = await pick(old, 1, [ROLE.mystic]);
    expect(note(after)).toBe(
      'Added **Mystic**; removed **Valor**. Only one role of the group Teams can be held at a time.',
    );
    expect(held()).toEqual(['Mystic']);
  });

  it('reads "None" only from a menu that offered it', async () => {
    const { server, storage, open, pick, held, note } = await setup();
    const old = await open();
    // Since the message was made Alice got North, and the regions became a pick-one group.
    server.member(ALICE, ROLE.north);
    await storage.saveGroup(FAKE_GUILD_ID, { name: 'Regions', pickOne: true });
    const { after } = await pick(old, 0, ['none']);
    expect(note(after)).toBe('Nothing was changed.');
    expect(held()).toEqual(['North']);
  });

  it.each<[string, (made: Made) => void | Promise<void>, string]>([
    [
      'its row was removed',
      async (made) => {
        const row = made.storage.rows.find((other) => other.name === 'Mystic');
        await made.storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
      },
      '**Mystic** is no longer a role you can give yourself. Nothing was changed.',
    ],
    [
      'it gained a permission',
      (made) => {
        made.server.edit(ROLE.mystic, { moderation: ['Kick Members'] });
      },
      '**Mystic** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list. Nothing was changed.',
    ],
    [
      'it moved above the bot',
      (made) => {
        made.server.edit(ROLE.mystic, { position: 55 });
      },
      'I cannot give or take **Mystic**: it is not below my own role in the list of roles of ' +
        'this server. A moderator has to move my role above it. Nothing was changed.',
    ],
  ])(
    'keeps the old role of a pick-one menu when the picked one cannot be given: %s',
    async (_what, since, sentence) => {
      const made = await setup();
      made.server.member(ALICE, ROLE.valor);
      // The message shows Valor ticked; since then something happened to Mystic.
      const old = await made.open();
      await since(made);
      const { after } = await made.pick(old, 1, [ROLE.mystic]);
      expect(made.note(after)).toBe(sentence);
      expect(made.held()).toEqual(['Valor']);
      expect(made.gateway.calls).toEqual([]);
      expect(made.ticked(after)).toEqual([[], ['Valor'], []]);
    },
  );

  it('asks the service for no take when another role of a pick-one menu is picked', async () => {
    const made = await setup();
    made.server.member(ALICE, ROLE.valor);
    // The menu as an old message shows it: Valor ticked. Since then Mystic got a permission.
    const shown = [
      { value: NONE_VALUE, ticked: false },
      { value: ROLE.instinct, ticked: false },
      { value: ROLE.mystic, ticked: false },
      { value: ROLE.valor, ticked: true },
    ];
    made.server.edit(ROLE.mystic, { moderation: ['Kick Members'] });
    await made.selfRoles.change(
      FAKE_GUILD_ID,
      made.server.seen(ALICE),
      menuRequest(shown, [ROLE.mystic]),
    );
    expect(made.held()).toEqual(['Valor']);
    // The same when the row of the picked role was removed.
    made.server.edit(ROLE.mystic, { moderation: [] });
    const row = made.storage.rows.find((other) => other.name === 'Mystic');
    await made.selfRoles.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
    await made.selfRoles.change(
      FAKE_GUILD_ID,
      made.server.seen(ALICE),
      menuRequest(shown, [ROLE.mystic]),
    );
    expect(made.held()).toEqual(['Valor']);
    expect(made.gateway.calls).toEqual([]);
  });

  it('says what was done and what Discord stopped, and ticks what is so', async () => {
    const { server, gateway, open, pick, held, note, ticked, entries } = await setup();
    const shown = await open();
    // Between the look at the roles and the second request North is moved above the bot.
    gateway.meanwhile = (call) => {
      if (call.roleId === ROLE.north) server.edit(ROLE.north, { position: 55 });
    };
    const { after } = await pick(shown, 0, [ROLE.north, ROLE.south, ROLE.east]);
    // The roles are given in the order of the menu: East, North, South.
    expect(note(after)).toBe(
      `Added **East**. I could not give you **North**: ${LET} After that I did not try to ` +
        'give you **South**.',
    );
    expect(held()).toEqual(['East']);
    expect(gateway.said()).toEqual(['give East', 'give North']);
    // Nothing stands ticked that was not given, and the menus are those of the server as it
    // is after the change: North is no longer offered.
    expect(ticked(after)).toEqual([['East'], ['None'], []]);
    expect(offered(after)[0]).toEqual(['East', 'South']);
    expect(entries.some((entry) => entry.msg === 'interaction failed')).toBe(false);
  });

  it.each<[string, (made: Made) => void, string]>([
    [
      'gained a permission',
      (made) => {
        made.server.edit(ROLE.south, { moderation: ['Kick Members'] });
      },
      '**South** is not handed out any more: the role was changed since it was put on the ' +
        'list, and it now grants more than a self-assigned role may. A moderator has to change ' +
        'the role back or take it off the list.',
    ],
    [
      'was taken off the list',
      (made) => {
        const row = made.storage.rows.find((other) => other.name === 'South');
        void made.storage.removeRole(FAKE_GUILD_ID, row?.id ?? 0);
      },
      '**South** was not given: it is no longer on the list.',
    ],
  ])(
    'stops before a role that %s while an earlier one was given, and says so',
    async (_what, meanwhile, sentence) => {
      const made = await setup();
      const shown = await made.open();
      made.gateway.meanwhile = (call) => {
        if (made.gateway.calls.indexOf(call) === 0) meanwhile(made);
      };
      // The roles are given in the order of the menu: East, then South.
      const { after } = await made.pick(shown, 0, [ROLE.east, ROLE.south]);
      expect(made.note(after)).toBe(`Added **East**. ${sentence}`);
      expect(made.held()).toEqual(['East']);
      expect(made.gateway.said()).toEqual(['give East']);
      // South is no longer offered.
      expect(offered(after)[0]).toEqual(['East', 'North']);
      expect(made.ticked(after)).toEqual([['East'], ['None'], []]);
    },
  );
});

describe('the handler of the role menus', () => {
  it('is listed, has its own guards and the throttle of a member’s writes', () => {
    expect(components).toContain(roleControls);
    expect(roleControls.kind).toBe('roles');
    expect(roleControls.throttle).toBe(MEMBER_WRITE_THROTTLE);
    expect(roleControls.guards).toHaveLength(2);
  });

  it('refuses a press outside a server, and where the feature is off', async () => {
    const made = selfRolesWith();
    const base = createTestContext({ selfRoles: made.selfRoles });
    const config = {
      ...base.ctx.config,
      settings: {
        ...base.ctx.config.settings,
        features: { ...base.ctx.config.settings.features, roles: false },
      },
    };
    const off = new InteractionRouter({ ...base.ctx, config }, [], [roleControls]);
    const press = fakeButton({ customId: 'roles:page:next:0' });
    await off.handle(press as never);
    expect(sent(press.reply).content).toBe(STALE_COMPONENT);

    const on = new InteractionRouter(base.ctx, [], [roleControls]);
    const inDm = fakeButton({ customId: 'roles:page:next:0', isDm: true });
    await on.handle(inDm as never);
    expect(sent(inDm.reply).content).toBe('This only works in a server.');
  });

  it('answers a control it does not know as one that is no longer active', async () => {
    const { router, server } = await setup();
    for (const customId of ['roles:page:first:0', 'roles:12:next:0']) {
      const press = fakeButton({ customId, ...server.interactionOf(ALICE) });
      await router.handle(press as never);
      expect(sent(press.reply).content).toBe(STALE_COMPONENT);
    }
    const select = fakeSelect({
      customId: 'roles:other:choose:0:0',
      values: [],
      ...server.interactionOf(ALICE),
    });
    await router.handle(select as never);
    expect(sent(select.reply).content).toBe(STALE_COMPONENT);
  });
});

/** A server with more menus than a message has rows: seven groups, one of them large. */
async function manyGroups() {
  const made = await setup();
  const ids: string[] = [];
  let next = 0;
  const add = async (group: string, pickOne: boolean, count: number) => {
    const saved = await made.storage.saveGroup(FAKE_GUILD_ID, { name: group, pickOne });
    if (saved.kind === 'refused') throw new Error(saved.reason);
    for (let n = 0; n < count; n++) {
      const id = `58${String(next++).padStart(16, '0')}`;
      made.server.role(id, `${group} ${String(n).padStart(2, '0')}`);
      await made.selfRoles.addRole(
        FAKE_GUILD_ID,
        { roleId: id, groupId: saved.group.id },
        made.owner(),
      );
      ids.push(id);
    }
  };
  await add('Hobbies', false, 2);
  await add('Leagues', true, 30);
  await add('Pings', false, 2);
  await add('Times', false, 2);
  return { ...made, ids };
}

describe('pages of menus', () => {
  it('turns the pages with Previous and Next, and keeps the page after a change', async () => {
    const { open, press, pick, note, held } = await manyGroups();
    // Regions, Teams, Hobbies, Leagues (two parts), Pings, Times, Other: eight menus.
    const first = await open();
    expect(first.content.split('\n').slice(1)).toEqual([
      '1. Regions · any number',
      '2. Teams · pick one',
      '3. Hobbies · any number',
      '4. Leagues: Leagues 00 – Leagues 14 · pick one',
      'Page 1 of 2',
    ]);
    const { interaction: turned, after: second } = await press(first, 'Next');
    // A page is read from the database: the press is acknowledged before that.
    expect(turned.deferUpdate).toHaveBeenCalledTimes(1);
    expect(turned.update).not.toHaveBeenCalled();
    expect(second?.content.split('\n').slice(1)).toEqual([
      '1. Leagues: Leagues 15 – Leagues 29 · pick one',
      '2. Pings · any number',
      '3. Times · any number',
      '4. Other · any number',
      'Page 2 of 2',
    ]);
    if (!second) throw new Error('no second page');
    const { after: changed } = await pick(second, 3, [ROLE.trader]);
    expect(changed?.content.split('\n').slice(-2)).toEqual(['Page 2 of 2', 'Added **Trader**.']);
    expect(held()).toEqual(['Trader']);
    const { after: back } = await press(changed ?? second, 'Previous');
    expect(note(back)).toBe('Page 1 of 2');
  });

  it('keeps a member to one role of a pick-one group that needs two menus', async () => {
    const { open, press, pick, held, note, ids, server } = await manyGroups();
    // The leagues are the roles 2 to 31 of the ones made here: the first on page 1, the last on page 2.
    const early = ids[2] ?? '';
    const late = ids[31] ?? '';
    const first = await open();
    await pick(first, 3, [early]);
    expect(held()).toEqual(['Leagues 00']);
    const { after: second } = await press(first, 'Next');
    if (!second) throw new Error('no second page');
    const { after: picked } = await pick(second, 0, [late]);
    expect(picked?.content.split('\n').at(-1)).toBe(
      'Added **Leagues 29**; removed **Leagues 00**. Only one role of the group Leagues can ' +
        'be held at a time.',
    );
    expect(held()).toEqual(['Leagues 29']);
    // "None" in the part that does not show the role still gives it back.
    const { after: back } = await press(picked ?? second, 'Previous');
    if (!back) throw new Error('no first page');
    const { after: none } = await pick(back, 3, ['none']);
    expect(note(none)).toBe('Removed **Leagues 29**.');
    expect(server.held(ALICE)).toEqual([]);
  });

  it('shows the last page there is when the one of a button is gone', async () => {
    const { storage, open, press } = await manyGroups();
    const first = await open();
    const { after: second } = await press(first, 'Next');
    if (!second) throw new Error('no second page');
    for (const name of ['Leagues', 'Pings', 'Times', 'Hobbies']) {
      const group = storage.groups.find((other) => other.name === name);
      for (const row of storage.rows.filter((other) => other.groupId === group?.id)) {
        await storage.removeRole(FAKE_GUILD_ID, row.id);
      }
    }
    const { after } = await press(second, 'Next');
    expect(after?.content.split('\n').slice(1)).toEqual([
      '1. Regions · any number',
      '2. Teams · pick one',
      '3. Other · any number',
    ]);
  });
});
```

Create `src/domain/roles/menus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  groupRoleIds,
  menuPages,
  menuRequest,
  nearestPage,
  NONE_VALUE,
  roleMenus,
} from './menus.js';
import {
  buildRoster,
  type Roster,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
} from './self-roles.js';

const REGIONS: SelfRoleGroup = { id: 1, name: 'Regions', position: 1, pickOne: false };
const TEAMS: SelfRoleGroup = { id: 2, name: 'Teams', position: 2, pickOne: true };
const HOBBIES: SelfRoleGroup = { id: 3, name: 'Hobbies', position: 3, pickOne: false };

/** A roster of roles by name, each in the group named. */
function rosterOf(
  named: ReadonlyArray<readonly [name: string, groupId: number | null]>,
  groups: readonly SelfRoleGroup[] = [REGIONS, TEAMS, HOBBIES],
  change: (role: ServerRole) => ServerRole = (role) => role,
): Roster {
  const rows: SelfRoleRow[] = named.map(([name, groupId], index) => ({
    id: index + 1,
    name,
    description: null,
    roleId: String(1000 + index),
    groupId,
    aliases: [],
  }));
  const roles = rows.map((row) =>
    change({
      id: row.roleId ?? '',
      name: row.name,
      position: 5,
      everyone: false,
      managed: false,
      moderation: [],
    }),
  );
  return buildRoster(rows, groups, {
    roles,
    bot: { mayManageRoles: true, highestPosition: 50 },
    ownerId: '1',
  }).roster;
}

const titles = (roster: Roster) => roleMenus(roster).map((menu) => menu.title);
const names = (menu: { entries: readonly { name: string }[] }) =>
  menu.entries.map((entry) => entry.name);

describe('roleMenus', () => {
  it('makes a menu per group in the order of the groups, and "Other" last', () => {
    const roster = rosterOf([
      ['Trader', null],
      ['Valor', 2],
      ['South', 1],
      ['Mystic', 2],
      ['North', 1],
    ]);
    const menus = roleMenus(roster);
    expect(menus.map((menu) => [menu.title, menu.pickOne, names(menu)])).toEqual([
      ['Regions', false, ['North', 'South']],
      ['Teams', true, ['Mystic', 'Valor']],
      ['Other', false, ['Trader']],
    ]);
    expect(menus.map((menu) => [menu.group?.id, menu.part])).toEqual([
      [1, 0],
      [2, 0],
      [undefined, 0],
    ]);
  });

  it('leaves out a group without roles, and has no menus for no roles', () => {
    expect(titles(rosterOf([['North', 1]]))).toEqual(['Regions']);
    expect(roleMenus(rosterOf([]))).toEqual([]);
  });

  it('offers only what can be given at present', () => {
    const roster = rosterOf(
      [
        ['North', 1],
        ['South', 1],
        ['Helper', null],
      ],
      undefined,
      (role) =>
        role.name === 'South'
          ? { ...role, position: 60 }
          : role.name === 'Helper'
            ? { ...role, moderation: ['Kick Members'] }
            : role,
    );
    expect(roleMenus(roster).map((menu) => [menu.title, names(menu)])).toEqual([
      ['Regions', ['North']],
    ]);
  });

  it('keeps 25 roles of a group in one menu, and 24 of a pick-one group', () => {
    const many = (count: number, groupId: number) =>
      Array.from(
        { length: count },
        (_unused, n) => [`Role ${String(n).padStart(2, '0')}`, groupId] as const,
      );
    expect(titles(rosterOf(many(25, 1)))).toEqual(['Regions']);
    expect(titles(rosterOf(many(26, 1)))).toHaveLength(2);
    expect(titles(rosterOf(many(24, 2)))).toEqual(['Teams']);
    expect(titles(rosterOf(many(25, 2)))).toHaveLength(2);
  });

  it('splits a larger group into alphabetical ranges of about the same size', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // 60 regions: Aa, Ab, Ac, Ba, … two or three to a letter.
    const regions = Array.from({ length: 60 }, (_unused, n) => {
      const letter = letters[Math.floor(n / 3)] ?? 'Z';
      return [`${letter}${'abc'[n % 3] ?? ''} Town`, 1] as const;
    });
    const menus = roleMenus(rosterOf(regions));
    expect(menus.map((menu) => menu.entries.length)).toEqual([20, 20, 20]);
    expect(menus.map((menu) => menu.title)).toEqual([
      'Regions: A – Gb',
      'Regions: Gc – Na',
      'Regions: Nb – T',
    ]);
    expect(menus.map((menu) => menu.part)).toEqual([0, 1, 2]);
    // Every role is in exactly one menu, in the order of their names.
    expect(menus.flatMap(names)).toEqual(regions.map(([name]) => name).sort());
  });

  it('names a range by single letters where the menus meet between two letters', () => {
    const regions = Array.from({ length: 26 }, (_unused, n) => {
      const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[n] ?? '';
      return [`${letter}town`, 1] as const;
    });
    expect(titles(rosterOf(regions))).toEqual(['Regions: A – M', 'Regions: N – Z']);
  });

  it('numbers the parts where the names only differ behind what a range has room for', () => {
    const same = Array.from(
      { length: 26 },
      (_unused, n) => [`Northern Heights ${String(n).padStart(2, '0')}`, 1] as const,
    );
    expect(titles(rosterOf(same))).toEqual([
      // Every end is cut to the same text, which would tell nothing.
      'Regions: part 1 of 2',
      'Regions: part 2 of 2',
    ]);
  });

  it.each([
    [
      'two digits with a zero in front',
      Array.from({ length: 30 }, (_unused, n) => `Region ${String(n + 1).padStart(2, '0')}`),
      ['Region 01 – Region 15', 'Region 16 – Region 30'],
    ],
    [
      'numbers without zeros in front',
      Array.from({ length: 30 }, (_unused, n) => `Region ${String(n + 1)}`),
      ['Region 1 – Region 15', 'Region 16 – Region 30'],
    ],
    [
      'bare numbers',
      Array.from({ length: 51 }, (_unused, n) => String(n + 1)),
      ['1 – 17', '18 – 34', '35 – 51'],
    ],
    [
      'a letter and three digits',
      Array.from({ length: 130 }, (_unused, n) => `R${String(n).padStart(3, '0')}`),
      ['R000 – R021', 'R022 – R043', 'R044 – R065', 'R066 – R087', 'R088 – R108', 'R109 – R129'],
    ],
  ])('names ranges by whole numbers and in their order: %s', (_what, roles, ranges) => {
    // Given in another order than theirs.
    const mixed = [...roles].reverse().map((name) => [name, 1] as const);
    const menus = roleMenus(rosterOf(mixed));
    expect(menus.map((menu) => menu.title)).toEqual(ranges.map((range) => `Regions: ${range}`));
    expect(menus.flatMap(names)).toEqual(roles);
  });

  it('keeps a number whole where a long name is cut', () => {
    const long = Array.from(
      { length: 26 },
      (_unused, n) => [`Outposts 1${String(n).padStart(2, '0')}7 North`, 1] as const,
    );
    // Twelve letters would end inside the number.
    expect(titles(rosterOf(long))).toEqual([
      'Regions: Outposts 1007 – Outposts 1127',
      'Regions: Outposts 1137 – Outposts 1257',
    ]);
  });

  it('never cuts a beginning inside a flag or another emoji', () => {
    // Twenty-six flags, each of two regional indicators that a reader sees as one sign.
    const indicator = (n: number): string => String.fromCodePoint(0x1f1e6 + n);
    const flags = Array.from(
      { length: 26 },
      (_unused, n) => [`${indicator(n)}${indicator((n * 7) % 26)} Land`, 1] as const,
    );
    const whole = /^Regions: \p{RI}{2} – \p{RI}{2}$/u;
    for (const title of titles(rosterOf(flags))) expect(title).toMatch(whole);
    // A family: three people joined by zero-width joiners, seven code units that are one sign.
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    const families = Array.from(
      { length: 26 },
      (_unused, n) => [`${family}${String.fromCharCode(65 + n)}${family} Clan`, 1] as const,
    );
    expect(titles(rosterOf(families))).toEqual([
      `Regions: ${family}A – ${family}M`,
      `Regions: ${family}N – ${family}Z`,
    ]);
  });

  it('splits the roles without a group the same way', () => {
    const others = Array.from(
      { length: 30 },
      (_unused, n) => [`${String.fromCharCode(65 + (n % 26))}${String(n)}`, null] as const,
    );
    const menus = roleMenus(rosterOf(others));
    expect(menus.map((menu) => menu.title.startsWith('Other: '))).toEqual([true, true]);
    expect(menus.every((menu) => menu.group === undefined && !menu.pickOne)).toBe(true);
  });
});

describe('menuPages', () => {
  const menusOf = (count: number) =>
    roleMenus(
      rosterOf(
        Array.from({ length: count }, (_unused, n) => [`Role ${String(n)}`, n + 1] as const),
        Array.from({ length: count }, (_unused, n) => ({
          id: n + 1,
          name: `Group ${String(n + 1).padStart(2, '0')}`,
          position: n + 1,
          pickOne: false,
        })),
      ),
    );

  it('puts up to five menus on one page', () => {
    expect(menuPages(menusOf(1)).map((page) => page.length)).toEqual([1]);
    expect(menuPages(menusOf(5)).map((page) => page.length)).toEqual([5]);
    expect(menuPages([])).toEqual([[]]);
  });

  it('puts four on a page when there are more, in their order', () => {
    expect(menuPages(menusOf(6)).map((page) => page.length)).toEqual([4, 2]);
    const pages = menuPages(menusOf(13));
    expect(pages.map((page) => page.length)).toEqual([4, 4, 4, 1]);
    expect(pages.flat().map((menu) => menu.title)).toEqual(menusOf(13).map((menu) => menu.title));
  });
});

describe('nearestPage', () => {
  it('keeps a page that exists and takes the nearest for one that does not', () => {
    expect(nearestPage(1, 3)).toBe(1);
    expect(nearestPage(7, 3)).toBe(2);
    expect(nearestPage(-1, 3)).toBe(0);
    expect(nearestPage(Number.NaN, 3)).toBe(0);
    expect(nearestPage(2, 0)).toBe(0);
  });
});

describe('menuRequest', () => {
  /** A menu that showed these values, the ones with a star ticked. */
  const shown = (...values: string[]) =>
    values.map((value) => ({ value: value.replace('*', ''), ticked: value.endsWith('*') }));

  it('gives what is ticked and takes away what the menu showed ticked and is ticked no longer', () => {
    expect(menuRequest(shown('1*', '2', '3*'), ['2'])).toEqual({ give: ['2'], take: ['1', '3'] });
    expect(menuRequest(shown('1*', '2*', '3*'), [])).toEqual({ give: [], take: ['1', '2', '3'] });
    expect(menuRequest(shown('1*', '2'), ['1', '2'])).toEqual({ give: ['1', '2'], take: [] });
  });

  it('never takes away a role the menu showed unticked', () => {
    // The member got 1 and 3 elsewhere after the message was made, and ticks 2 in it.
    expect(menuRequest(shown('1', '2', '3'), ['2'])).toEqual({ give: ['2'], take: [] });
    expect(menuRequest(shown('1', '2', '3'), [])).toEqual({ give: [], take: [] });
  });

  it('asks for nothing the menu did not show', () => {
    expect(menuRequest(shown('1*', '2'), ['2', '999'])).toEqual({ give: ['2'], take: ['1'] });
  });

  it('reads "None" as no role: what the menu showed ticked is taken away', () => {
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), [NONE_VALUE])).toEqual({
      give: [],
      take: ['1'],
    });
    expect(menuRequest(shown(`${NONE_VALUE}*`, '1', '2'), ['2'])).toEqual({
      give: ['2'],
      take: [],
    });
  });

  it('asks for no take from a menu with "None" unless "None" was chosen', () => {
    // Another role of a pick-one menu was picked: the old one goes only if the new one is
    // given, which is for `planChange` to say, not for the menu.
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), ['2'])).toEqual({ give: ['2'], take: [] });
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), ['999'])).toEqual({ give: [], take: [] });
    expect(menuRequest(shown(NONE_VALUE, '1*', '2'), [])).toEqual({ give: [], take: [] });
    // "None" beside a role (which Discord's single choice never sends) is still "None".
    expect(menuRequest(shown(NONE_VALUE, '1*', '2*'), [NONE_VALUE, '2'])).toEqual({
      give: ['2'],
      take: ['1'],
    });
  });
});

describe('groupRoleIds', () => {
  it('lists the roles of one group', () => {
    const roster = rosterOf([
      ['North', 1],
      ['Valor', 2],
      ['Mystic', 2],
    ]);
    expect(groupRoleIds(roster, 2).sort()).toEqual(['1001', '1002']);
    expect(groupRoleIds(roster, 9)).toEqual([]);
  });
});
```

Create `src/render/role-menus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import {
  assertSendable,
  buttonsOf,
  menusOf,
  ROLE,
  selfRolesWith,
} from '../../test/support/roles.js';
import { decodeCustomId } from '../discord/custom-id.js';
import type { Roster } from '../domain/roles/self-roles.js';
import { NO_MANAGE_ROLES, NO_ROLES, NONE_AVAILABLE, renderRoleMenus } from './role-menus.js';

async function sample(): Promise<ReturnType<typeof selfRolesWith> & { roster: Roster }> {
  const made = selfRolesWith();
  await made.offerSample();
  const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
  if (!roster) throw new Error('no roster');
  return { ...made, roster };
}

/** A server with `count` roles in each of these groups (a name, and whether it is pick-one). */
async function large(groups: ReadonlyArray<readonly [string, boolean, number]>) {
  const made = selfRolesWith();
  let next = 0;
  const ids: string[] = [];
  for (const [name, pickOne, count] of groups) {
    const saved = await made.storage.saveGroup(FAKE_GUILD_ID, { name, pickOne });
    if (saved.kind === 'refused') throw new Error(saved.reason);
    for (let n = 0; n < count; n++) {
      const id = `56${String(next++).padStart(16, '0')}`;
      const letter = String.fromCharCode(65 + (n % 26));
      made.server.role(id, `${letter}${name} ${String(n).padStart(3, '0')}`);
      await made.selfRoles.addRole(
        FAKE_GUILD_ID,
        { roleId: id, groupId: saved.group.id },
        made.owner(),
      );
      ids.push(id);
    }
  }
  const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
  if (!roster) throw new Error('no roster');
  return { ...made, roster, ids };
}

const chosen = (menu: { options: { label: string; default?: boolean }[] }) =>
  menu.options.filter((option) => option.default === true).map((option) => option.label);

describe('renderRoleMenus', () => {
  it('shows a menu per group in their order, with names and descriptions', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(roster, new Set(), 0);
    assertSendable(message);
    expect(message.content.split('\n')).toEqual([
      '**Your roles on this server.** Tick and untick them in the menus; a menu takes effect ' +
        'as soon as you close it.',
      '1. Regions · any number',
      '2. Teams · pick one',
      '3. Other · any number',
    ]);
    const [regions, teams, other] = message.components.map((row) => row.components[0]);
    expect(regions).toMatchObject({
      placeholder: 'Regions (any number)',
      min_values: 0,
      max_values: 3,
      options: [
        { label: 'East', value: ROLE.east, default: false },
        { label: 'North', value: ROLE.north, description: 'North of the river', default: false },
        { label: 'South', value: ROLE.south, default: false },
      ],
    });
    expect(teams).toMatchObject({
      placeholder: 'Teams (pick one)',
      min_values: 1,
      max_values: 1,
      options: [
        { label: 'None', value: 'none', description: 'No role of Teams', default: true },
        { label: 'Instinct', value: ROLE.instinct, default: false },
        { label: 'Mystic', value: ROLE.mystic, default: false },
        { label: 'Valor', value: ROLE.valor, default: false },
      ],
    });
    expect(other).toMatchObject({
      placeholder: 'Other (any number)',
      options: [{ label: 'Trader', description: 'Open to trades' }],
    });
    expect(buttonsOf(message)).toEqual([]);
  });

  it('ticks the roles the member holds, and no others', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(
      roster,
      new Set([ROLE.north, ROLE.south, ROLE.mystic, ROLE.moderator]),
      0,
    );
    assertSendable(message);
    expect(menusOf(message).map(chosen)).toEqual([['North', 'South'], ['Mystic'], []]);
  });

  it('shows one role of a pick-one group as chosen for a member who holds several', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(roster, new Set([ROLE.valor, ROLE.instinct]), 0);
    assertSendable(message);
    expect(chosen(menusOf(message)[1] ?? { options: [] })).toEqual(['Instinct']);
  });

  it('carries the group, the part and the page in the custom ids', async () => {
    const { roster } = await sample();
    const ids = menusOf(renderRoleMenus(roster, new Set(), 0)).map((menu) =>
      decodeCustomId(menu.custom_id),
    );
    const [regions, teams] = roster.groups;
    expect(ids).toEqual([
      { kind: 'roles', id: String(regions?.id), action: 'pick', args: ['0', '0'] },
      { kind: 'roles', id: String(teams?.id), action: 'pick', args: ['0', '0'] },
      { kind: 'roles', id: 'other', action: 'pick', args: ['0', '0'] },
    ]);
  });

  it('leaves out what cannot be given, and says so when nothing can', async () => {
    const { roster, server, selfRoles } = await sample();
    expect(renderRoleMenus({ ...roster, entries: [] }, new Set(), 0)).toEqual({
      content: NO_ROLES,
      components: [],
    });
    // Roles are offered, but the bot cannot give any: the member reads what a moderator has to mend.
    server.bot.mayManageRoles = false;
    const powerless = await selfRoles.roster(FAKE_GUILD_ID);
    if (!powerless) throw new Error('no roster');
    expect(renderRoleMenus(powerless, new Set([ROLE.north]), 0)).toEqual({
      content: NO_MANAGE_ROLES,
      components: [],
    });
    // A change that led here and said so already is not followed by the same sentence.
    const said = `${NO_MANAGE_ROLES} Nothing was changed.`;
    expect(renderRoleMenus(powerless, new Set(), 0, said).content).toBe(said);
    // Roles are offered, and each has a problem of its own.
    server.bot.mayManageRoles = true;
    for (const entry of roster.entries) server.edit(entry.role?.id ?? '', { position: 60 });
    const stuck = await selfRoles.roster(FAKE_GUILD_ID);
    if (!stuck) throw new Error('no roster');
    expect(renderRoleMenus(stuck, new Set(), 0, 'Nothing was changed.')).toEqual({
      content: `Nothing was changed.\n${NONE_AVAILABLE}`,
      components: [],
    });
    expect(NONE_AVAILABLE).toBe(
      "None of this server's self-assignable roles can be given at the moment. A moderator " +
        'can see why with `/admin self-roles list`.',
    );
  });

  it('puts what a change did last, and cuts it to what the message has room for', async () => {
    const { roster } = await sample();
    const message = renderRoleMenus(roster, new Set(), 0, 'Added **North**.');
    expect(message.content.split('\n').at(-1)).toBe('Added **North**.');
    const long = renderRoleMenus(roster, new Set(), 0, 'x'.repeat(5000));
    assertSendable(long);
    expect(long.content).toHaveLength(2000);
  });

  it('shows text staff wrote as text in the message; a menu takes any text as it is', async () => {
    const made = selfRolesWith();
    await made.storage.saveGroup(FAKE_GUILD_ID, { name: '**Loud** @everyone' });
    const [group] = (await made.selfRoles.stored(FAKE_GUILD_ID)).groups;
    await made.selfRoles.addRole(
      FAKE_GUILD_ID,
      { roleId: ROLE.north, groupId: group?.id ?? 0 },
      made.owner(),
    );
    const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
    if (!roster) throw new Error('no roster');
    const message = renderRoleMenus(roster, new Set(), 0);
    expect(message.content).not.toContain('**Loud**');
    expect(message.content).not.toContain('@everyone');
    expect(message.components[0]?.components[0]).toMatchObject({
      placeholder: '**Loud** @everyone (any number)',
    });
  });

  it('splits a group of more than 25 roles into menus by ranges, all within Discord’s limits', async () => {
    const { roster, ids } = await large([['Regions', false, 60]]);
    const message = renderRoleMenus(roster, new Set(ids.slice(0, 30)), 0);
    assertSendable(message);
    const menus = menusOf(message);
    expect(menus.map((menu) => menu.options.length)).toEqual([20, 20, 20]);
    expect(message.content.split('\n').slice(1)).toEqual([
      '1. Regions: A – GRegions 032 · any number',
      '2. Regions: GRegions 058 – P · any number',
      '3. Regions: Q – Z · any number',
    ]);
    // Every role is in one menu, and the 30 the member holds are ticked.
    expect(menus.flatMap((menu) => menu.options.map((option) => option.value)).sort()).toEqual(
      [...ids].sort(),
    );
    expect(menus.flatMap(chosen)).toHaveLength(30);
    expect(buttonsOf(message)).toEqual([]);
  });

  it('gives "None" a place in every part of a large pick-one group', async () => {
    const { roster, ids } = await large([['Teams', true, 30]]);
    const held = ids[29] ?? '';
    const message = renderRoleMenus(roster, new Set([held]), 0);
    assertSendable(message);
    const menus = menusOf(message);
    expect(menus.map((menu) => menu.options.length)).toEqual([16, 16]);
    expect(menus.map((menu) => menu.options[0]?.value)).toEqual(['none', 'none']);
    // The role is held in one part: "None" is chosen in neither.
    expect(menus.flatMap(chosen)).toHaveLength(1);
    const nothing = menusOf(renderRoleMenus(roster, new Set(), 0));
    expect(nothing.map(chosen)).toEqual([['None'], ['None']]);
  });

  it('shows five menus without paging, and four to a page with Previous and Next beyond that', async () => {
    const five = await large([
      ['A', false, 2],
      ['B', false, 2],
      ['C', false, 2],
      ['D', false, 2],
      ['E', false, 2],
    ]);
    const all = renderRoleMenus(five.roster, new Set(), 0);
    assertSendable(all);
    expect(menusOf(all)).toHaveLength(5);
    expect(buttonsOf(all)).toEqual([]);

    const nine = await large([
      ['A', false, 30],
      ['B', true, 3],
      ['C', false, 51],
      ['D', false, 2],
      ['E', false, 26],
    ]);
    // 2 + 1 + 3 + 1 + 2 menus.
    const pages = [0, 1, 2].map((page) => renderRoleMenus(nine.roster, new Set(nine.ids), page));
    for (const page of pages) assertSendable(page);
    expect(pages.map((page) => menusOf(page).length)).toEqual([4, 4, 1]);
    expect(pages.map((page) => page.content.split('\n').at(-1))).toEqual([
      'Page 1 of 3',
      'Page 2 of 3',
      'Page 3 of 3',
    ]);
    expect(pages.map((page) => buttonsOf(page).map((b) => [b.label, b.disabled]))).toEqual([
      [
        ['Previous', true],
        ['Next', false],
      ],
      [
        ['Previous', false],
        ['Next', false],
      ],
      [
        ['Previous', false],
        ['Next', true],
      ],
    ]);
    expect(buttonsOf(pages[1] ?? {}).map((b) => decodeCustomId(b.custom_id ?? ''))).toEqual([
      { kind: 'roles', id: 'page', action: 'prev', args: ['1'] },
      { kind: 'roles', id: 'page', action: 'next', args: ['1'] },
    ]);
    // The menus of a page carry that page.
    expect(menusOf(pages[1] ?? {}).map((menu) => decodeCustomId(menu.custom_id)?.args[1])).toEqual([
      '1',
      '1',
      '1',
      '1',
    ]);
    // Every role is on exactly one page.
    const values = pages.flatMap((page) =>
      menusOf(page).flatMap((menu) => menu.options.map((option) => option.value)),
    );
    expect(values.filter((value) => value !== 'none').sort()).toEqual([...nine.ids].sort());
  });

  it('shows the nearest page for one that does not exist', async () => {
    const { roster } = await sample();
    expect(renderRoleMenus(roster, new Set(), 7)).toEqual(renderRoleMenus(roster, new Set(), 0));
    expect(renderRoleMenus(roster, new Set(), Number.NaN)).toEqual(
      renderRoleMenus(roster, new Set(), 0),
    );
  });

  it('stays within Discord’s limits with the longest names and descriptions', async () => {
    const made = selfRolesWith();
    const group = await made.storage.saveGroup(FAKE_GUILD_ID, { name: 'G'.repeat(50) });
    if (group.kind === 'refused') throw new Error(group.reason);
    for (let n = 0; n < 60; n++) {
      const id = `57${String(n).padStart(16, '0')}`;
      made.server.role(id, `${'*'.repeat(47)}${String(n).padStart(3, '0')}`);
      await made.selfRoles.addRole(
        FAKE_GUILD_ID,
        { roleId: id, description: 'd'.repeat(150), groupId: group.group.id },
        made.owner(),
      );
    }
    const roster = await made.selfRoles.roster(FAKE_GUILD_ID);
    if (!roster) throw new Error('no roster');
    assertSendable(renderRoleMenus(roster, new Set(), 0, 'n'.repeat(3000)));
  });
});
```

Apply to `test/support/roles.ts`:

```diff
--- a/test/support/roles.ts
+++ b/test/support/roles.ts
@@ -334,3 +334,99 @@ export function selfRolesWith(kept: { storage?: MemorySelfRoles; gateway?: FakeR
   };
   return { selfRoles, storage, gateway, server, clock, entries, owner, offerSample };
 }
+
+/** A select menu or a button as Discord's API has it, as far as the checks below read it. */
+interface SentControl {
+  type: number;
+  custom_id?: string;
+  label?: string;
+  placeholder?: string;
+  min_values?: number;
+  max_values?: number;
+  disabled?: boolean;
+  options?: { label: string; value: string; description?: string; default?: boolean }[];
+}
+
+/** The select menus of a message with controls, in their order. */
+export function menusOf(message: {
+  components?: readonly unknown[];
+}): Required<Pick<SentControl, 'custom_id' | 'options'>>[] {
+  return (message.components ?? []).flatMap((row) =>
+    (row as { components: SentControl[] }).components.flatMap((control) =>
+      control.type === 3 && control.custom_id !== undefined && control.options !== undefined
+        ? [{ custom_id: control.custom_id, options: control.options }]
+        : [],
+    ),
+  );
+}
+
+/** The buttons of a message with controls, in their order. */
+export function buttonsOf(message: { components?: readonly unknown[] }): SentControl[] {
+  return (message.components ?? []).flatMap((row) =>
+    (row as { components: SentControl[] }).components.filter((control) => control.type === 2),
+  );
+}
+
+/**
+ * Throws unless Discord would take this message: its text and its rows of select menus and
+ * buttons, checked against the limits Discord enforces (five rows, one menu or up to five
+ * buttons in a row, 25 options, the lengths of labels, descriptions, placeholders and custom
+ * ids, no custom id and no option value twice, no more options chosen than may be).
+ */
+export function assertSendable(message: {
+  content?: string;
+  components?: readonly unknown[];
+}): void {
+  const fail = (what: string): never => {
+    throw new Error(`Discord would refuse this message: ${what}`);
+  };
+  const content = message.content ?? '';
+  if (content.length > 2000) fail(`content of ${String(content.length)} characters`);
+  const rows = (message.components ?? []) as { type: number; components: SentControl[] }[];
+  if (content.trim() === '' && rows.length === 0) fail('it is empty');
+  if (rows.length > 5) fail(`${String(rows.length)} rows`);
+  const ids = new Set<string>();
+  for (const row of rows) {
+    if (row.type !== 1) fail(`a top-level component of type ${String(row.type)}`);
+    const menus = row.components.filter((control) => control.type === 3);
+    const buttons = row.components.filter((control) => control.type === 2);
+    if (menus.length + buttons.length !== row.components.length) fail('an unknown control');
+    if (row.components.length === 0) fail('an empty row');
+    if (menus.length > 0 && row.components.length !== 1) fail('a menu sharing its row');
+    if (buttons.length > 5) fail('more than five buttons in a row');
+    for (const control of row.components) {
+      const id = control.custom_id ?? '';
+      if (id.length < 1 || id.length > 100) fail(`the custom id "${id}"`);
+      if (ids.has(id)) fail(`the custom id "${id}" twice`);
+      ids.add(id);
+    }
+    for (const button of buttons) {
+      const label = button.label ?? '';
+      if (label.length < 1 || label.length > 80) fail(`a button labelled "${label}"`);
+    }
+    for (const menu of menus) {
+      const options = menu.options ?? [];
+      if (options.length < 1 || options.length > 25) fail(`${String(options.length)} options`);
+      if ((menu.placeholder ?? '').length > 150) fail('a placeholder of more than 150');
+      const min = menu.min_values ?? 1;
+      const max = menu.max_values ?? 1;
+      if (min < 0 || max < 1 || min > max || max > options.length) {
+        fail(`min ${String(min)}, max ${String(max)} for ${String(options.length)} options`);
+      }
+      const values = new Set<string>();
+      for (const option of options) {
+        if (option.label.length < 1 || option.label.length > 100) {
+          fail(`an option labelled "${option.label}"`);
+        }
+        if (option.value.length < 1 || option.value.length > 100) {
+          fail(`an option with the value "${option.value}"`);
+        }
+        if ((option.description ?? '').length > 100) fail('a description of more than 100');
+        if (values.has(option.value)) fail(`the value "${option.value}" twice`);
+        values.add(option.value);
+      }
+      const chosen = options.filter((option) => option.default === true).length;
+      if (chosen > max) fail(`${String(chosen)} options chosen where ${String(max)} may be`);
+    }
+  }
+}
```

Run: `npx vitest run --project unit src/commands/roles/menus.test.ts src/domain/roles/menus.test.ts src/render/role-menus.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/roles/iam.ts`:

```diff
--- a/src/commands/roles/iam.ts
+++ b/src/commands/roles/iam.ts
@@ -21,6 +21,7 @@ import {
   roleText,
   typedText,
 } from './shared.js';
+import { showRoleMenus } from './menus.js';
 import { failureSentences, memberProblem, namesOf } from './words.js';
 
 /**
@@ -75,27 +76,30 @@ function carried(outcome: RoleChangeOutcome): Exclude<RoleChangeOutcome, { kind:
 
 /**
  * `/iam` (spec 4.2; the legacy `!iam`): a member gives themself one of the roles the server
- * offers. Private, and tied to no channel (spec 3.2).
+ * offers, or without `role` gets the menus of all of them (`menus.ts`). Private, and tied to no
+ * channel (spec 3.2).
  */
 export const iam: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('iam')
-    .setDescription('Give yourself one of the roles this server offers')
+    .setDescription('Pick the roles this server offers its members, or give yourself one')
     .addStringOption((option) =>
       option
         .setName('role')
-        .setDescription('The role: type part of its name and pick from the list')
+        .setDescription('One role: type part of its name and pick from the list')
         .setMaxLength(100)
         .setAutocomplete(true),
     ),
   help: {
     category: 'roles',
     details:
-      'Gives you a role this server lets its members take themselves: your region, your team ' +
-      'and the like. Pick it from the list that appears while you type. Of some groups of ' +
-      'roles (teams) you can hold only one: taking another one gives the first back. ' +
-      '`/iamnot` takes a role away again.',
-    examples: ['/iam role:Mystic'],
+      'The roles this server lets its members take themselves: your region, your team and the ' +
+      'like. Without `role` you get menus, one per group of roles, with your own roles ticked: ' +
+      'tick and untick, and a menu takes effect when you close it. With `role` you get that ' +
+      'one role: pick it from the list that appears while you type. Of some groups of roles ' +
+      '(teams) you can hold only one: taking another one gives the first back. `/iamnot` ' +
+      'takes a role away again.',
+    examples: ['/iam', '/iam role:Mystic'],
   },
   enabled: rolesEnabled,
   guards: [requireGuild],
@@ -107,9 +111,8 @@ export const iam: SimpleCommand = {
     const member = actingRoleMember(interaction);
     const typed = interaction.options.getString('role');
     if (typed === null || typed.trim() === '') {
-      throw new UserError(
-        'Say which role: type part of its name in `role` and pick it from the list.',
-      );
+      await showRoleMenus(interaction, ctx);
+      return;
     }
     const roster = await ctx.selfRoles.roster(guildId);
     if (!roster) throw new UserError(ROLES_UNAVAILABLE);
```

Create `src/commands/roles/menus.ts`:

```ts
import {
  ComponentType,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import {
  groupRoleIds,
  menuRequest,
  NONE_VALUE,
  type ShownChoice,
} from '../../domain/roles/menus.js';
import type { ChangeRequest, RosterEntry } from '../../domain/roles/self-roles.js';
import {
  NEXT_ACTION,
  OTHER_ID,
  PAGE_ID,
  PICK_ACTION,
  PREVIOUS_ACTION,
  renderRoleMenus,
  ROLES_KIND,
} from '../../render/role-menus.js';
import { fitItems, plain } from '../../render/text.js';
import type { RoleChangeOutcome } from '../../services/self-role-service.js';
import { actingRoleMember, ROLES_UNAVAILABLE, rolesEnabled, roleText } from './shared.js';
import { failureSentences, memberProblem } from './words.js';

/** `/iam` without a role: the private message with the menus, the member's roles ticked. */
export async function showRoleMenus(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<void> {
  const guildId = guildIdOf(interaction);
  const member = actingRoleMember(interaction);
  const roster = await ctx.selfRoles.roster(guildId);
  if (!roster) throw new UserError(ROLES_UNAVAILABLE);
  await interaction.editReply(
    renderRoleMenus(roster, new Set(ctx.selfRoles.heldNow(guildId, member)), 0),
  );
}

/** A choice of the menu that was pressed, with the name it showed. */
interface PressedChoice extends ShownChoice {
  label: string;
}

/**
 * The menu that was pressed, as its message shows it: the values it offers, their labels, and
 * which of them it showed ticked.
 */
function pressedMenu(interaction: StringSelectMenuInteraction): PressedChoice[] | undefined {
  for (const row of interaction.message.components) {
    if (row.type !== ComponentType.ActionRow) continue;
    for (const control of row.toJSON().components) {
      if (
        control.type === ComponentType.StringSelect &&
        control.custom_id === interaction.customId
      ) {
        return control.options.map((option) => ({
          value: option.value,
          label: option.label,
          ticked: option.default === true,
        }));
      }
    }
  }
  return undefined;
}

/** How much of a list of names a message has room for. */
const NAMES_ROOM = 500;

/** What a press says when it changed nothing. */
const NOTHING_CHANGED = 'Nothing was changed.';

/**
 * What a change of a menu did, as the message says it: "Added **Mystic**; removed **Valor**."
 * (what was really done), a sentence for each role of the menu that was skipped, and for a
 * change Discord stopped half-way what it did not do. `shown` is the menu as it was pressed,
 * for the name of a role that is no longer on the list and for what the member unticked in it;
 * `request` is what the menu asked for.
 */
function changeNote(
  outcome: Exclude<RoleChangeOutcome, { kind: 'unavailable' }>,
  request: ChangeRequest,
  shown: readonly PressedChoice[],
): string {
  const { plan, given, taken } = outcome;
  const names = (entries: readonly RosterEntry[]): string =>
    fitItems(
      entries.map((entry) => roleText(entry.name)),
      NAMES_ROOM,
    );
  const done = [
    ...(given.length > 0 ? [`added ${names(given)}`] : []),
    ...(taken.length > 0 ? [`removed ${names(taken)}`] : []),
  ].join('; ');
  const sentences = done === '' ? [] : [`${done.charAt(0).toUpperCase()}${done.slice(1)}.`];
  // The rule needs saying only for a role the member did not untick in this menu themself
  // (by picking another one where it stood ticked): one that another part of the group shows,
  // or that they got elsewhere since.
  const unticked = new Set(
    shown.flatMap((choice) =>
      choice.ticked && !request.give.includes(choice.value) ? [choice.value] : [],
    ),
  );
  const [unasked] = taken.filter(
    (entry) =>
      plan.displaced.includes(entry) && entry.role !== undefined && !unticked.has(entry.role.id),
  );
  if (unasked?.group) {
    sentences.push(
      `Only one role of the group ${plain(unasked.group.name)} can be held at a time.`,
    );
  }
  for (const skip of plan.skipped) {
    // A role that left the list and was not ticked needs no word: there is nothing to say
    // about a role the member did not ask for.
    if (skip.reason === 'not-offered' && !request.give.includes(skip.roleId)) continue;
    const label = shown.find((choice) => choice.value === skip.roleId)?.label;
    const name = roleText(skip.entry?.name ?? label ?? 'That role');
    const sentence = memberProblem(name, skip);
    if (!sentences.includes(sentence)) sentences.push(sentence);
  }
  if (outcome.kind === 'partial') sentences.push(...failureSentences(outcome));
  else if (done === '') sentences.push(NOTHING_CHANGED);
  return sentences.join(' ');
}

/** Old messages may still be about when the feature was switched off. */
const requireRoles: Guard = (_interaction, ctx) => {
  if (!rolesEnabled(ctx.config)) throw new UserError(STALE_COMPONENT);
};

/**
 * The controls of `/iam` without a role. Changing a menu applies exactly that menu's
 * difference, read from the menu as the message shows it (`interaction.message`), so nothing
 * about an open message is kept anywhere and it still works after a restart. The message is
 * then made anew from the roster and the member's roles as they are now. Every press is
 * acknowledged first: what follows may ask Discord and the database. A change that did nothing
 * (the roles are not known, or it failed before its first step was done) puts the message back
 * as it was: Discord's client keeps the ticks of a press that was acknowledged, and they must
 * not stand as if they had been applied.
 */
export const roleControls: ComponentHandler = {
  kind: ROLES_KIND,
  guards: [requireGuild, requireRoles],
  throttle: MEMBER_WRITE_THROTTLE,

  async select(interaction, id, ctx) {
    if (id.action !== PICK_ACTION || !interaction.isStringSelectMenu()) {
      throw new UserError(STALE_COMPONENT);
    }
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    const shown = pressedMenu(interaction);
    if (!shown) throw new UserError(STALE_COMPONENT);
    // Changing the roles is requests to Discord, which may take longer than an answer may.
    await interaction.deferUpdate();
    const request = menuRequest(shown, interaction.values);
    /** The message as it was before the press, with what is to be said about the press. */
    const putBack = (content: string) =>
      interaction.editReply({
        content,
        components: interaction.message.components.map((row) => row.toJSON()),
      });
    let outcome: RoleChangeOutcome;
    try {
      // "None" counts only where the menu offered it: it is no role's id, but anything may arrive.
      const none =
        interaction.values.includes(NONE_VALUE) &&
        shown.some((choice) => choice.value === NONE_VALUE);
      if (none && id.id !== OTHER_ID) {
        // "None" gives back every role of the group, also those another part of it shows.
        const roster = await ctx.selfRoles.roster(guildId);
        const group = roster?.groups.find((other) => String(other.id) === id.id);
        if (roster && group?.pickOne) {
          request.take = [...new Set([...request.take, ...groupRoleIds(roster, group.id)])];
        }
      }
      outcome = await ctx.selfRoles.change(guildId, member, request);
    } catch (err) {
      // The service throws only while nothing was done. The router tells the member, with the
      // reference; the message itself is put back first, and a failure of that changes nothing
      // about what is reported.
      await putBack(NOTHING_CHANGED).catch((backErr: unknown) => {
        ctx.log.warn({ err: backErr }, 'could not put the role menus back');
      });
      throw err;
    }
    if (outcome.kind === 'unavailable') {
      await putBack(`${ROLES_UNAVAILABLE} ${NOTHING_CHANGED}`);
      return;
    }
    await interaction.editReply(
      renderRoleMenus(
        outcome.roster,
        new Set(outcome.held),
        Number(id.args[1]),
        changeNote(outcome, request, shown),
      ),
    );
  },

  async button(interaction, id, ctx) {
    const step = id.action === NEXT_ACTION ? 1 : id.action === PREVIOUS_ACTION ? -1 : undefined;
    if (id.id !== PAGE_ID || step === undefined) throw new UserError(STALE_COMPONENT);
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    await interaction.deferUpdate();
    const roster = await ctx.selfRoles.roster(guildId);
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    await interaction.editReply(
      renderRoleMenus(
        roster,
        new Set(ctx.selfRoles.heldNow(guildId, member)),
        Number(id.args[0]) + step,
      ),
    );
  },
};
```

Apply to `src/commands/roles/words.ts`:

```diff
--- a/src/commands/roles/words.ts
+++ b/src/commands/roles/words.ts
@@ -5,6 +5,7 @@ import type {
   ServerRole,
   Skipped,
 } from '../../domain/roles/self-roles.js';
+import { NO_MANAGE_ROLES } from '../../render/role-menus.js';
 import { plain } from '../../render/text.js';
 import type { RoleChangeOutcome, RoleFailure } from '../../services/self-role-service.js';
 import { listed, ROLES_UNAVAILABLE, roleText } from './shared.js';
@@ -37,11 +38,6 @@ export function whyNot(problem: RoleProblem, role: ServerRole | undefined): stri
   }
 }
 
-/** What a member is told when nothing can be handed out because the bot lacks Manage Roles. */
-const NO_MANAGE_ROLES =
-  'I cannot change roles on this server: I lack the Manage Roles permission. A ' +
-  'moderator has to give it to my role.';
-
 /** A group's rule, as a list says it. */
 export function groupRule(group: Pick<SelfRoleGroup, 'pickOne'>): string {
   return group.pickOne ? 'pick one' : 'any number';
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -3,6 +3,7 @@ import { targetControls, targetRemovalControls } from '../commands/notifications
 import { wantControls } from '../commands/notifications/wants.js';
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
+import { roleControls } from '../commands/roles/menus.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { dmControls } from './dm.js';
 import { partyButtons } from './party.js';
@@ -17,4 +18,5 @@ export const components: readonly ComponentHandler[] = [
   targetRemovalControls,
   partyButtons,
   dmControls,
+  roleControls,
 ];
```

Apply to `src/discord/custom-id.ts`:

```diff
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -9,6 +9,13 @@
  * `stopArgs` (`src/domain/notify/reasons.ts`) says: `p:<dex>[:<form>]`, `ps:…`, `t:<level>`,
  * `ts:<level>`, `iv:perfect|zero`, `g:<gym id>`, `boss`, `train`. (The spec's example
  * `dm:stop:pokemon:150` had no id and no server; this replaces it.)
+ *
+ * The controls of `/iam` without a role have the kind `roles` (`src/render/role-menus.ts`). A
+ * menu is `roles:<group>:pick:<part>:<page>`: the id is the row id of the group it shows, or
+ * `other` for the roles without a group; `part` says which part of a group that needs several
+ * menus, `page` the page the message shows, so that it is shown again after the change. The
+ * buttons that turn the pages are `roles:page:prev:<page>` and `roles:page:next:<page>`, with
+ * the page the message shows. Nothing else about such a message is kept anywhere.
  */
 export const MAX_CUSTOM_ID_LENGTH = 100;
 const SEPARATOR = ':';
```

Create `src/domain/roles/menus.ts`:

```ts
import {
  byRoleName,
  type ChangeRequest,
  type Roster,
  type RosterEntry,
  type SelfRoleGroup,
} from './self-roles.js';

/**
 * The menus of `/iam` without a role: one per group, in the groups' order, the roles without a
 * group last under "Other". Pure: which menus there are, what each holds and how they are
 * spread over pages; `src/commands/roles/menus.ts` turns that into Discord's controls.
 */

/** Discord shows at most this many options in one menu. */
export const MENU_OPTIONS = 25;
/** A message has five rows of controls: as many menus fit when no row is needed for paging. */
export const MENUS_WITHOUT_PAGING = 5;
/** Menus on a page when a row is needed for the Previous and Next buttons. */
export const MENUS_PER_PAGE = 4;

/** The value of the choice "None" in the menu of a group of which only one role may be held. */
export const NONE_VALUE = 'none';

/** One menu: a group, or a part of a group that has more roles than a menu holds. */
export interface RoleMenu {
  /** The group; undefined for the roles without one ("Other"). */
  group: SelfRoleGroup | undefined;
  /** Which part of the group this is, from 0; a group that fits one menu has only part 0. */
  part: number;
  /** "Regions", and for a part of a group "Regions: A – Fo". */
  title: string;
  /** Only one of the group's roles may be held: a single choice, with "None" before the roles. */
  pickOne: boolean;
  /** The roles it offers, by name: 25 at most, 24 when "None" needs a place. */
  entries: RosterEntry[];
}

/** The title of the roles without a group. */
export const OTHER_TITLE = 'Other';

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** A text as what a reader sees as its letters: an emoji, a flag or a letter with its accents is one. */
function letters(text: string): string[] {
  return [...segmenter.segment(text)].map((part) => part.segment);
}

const isDigit = (letter: string | undefined): boolean =>
  letter !== undefined && /^\p{Nd}$/u.test(letter);

/**
 * The beginning of a name that is `length` letters long, or longer: a beginning never ends
 * inside a number ("Region 1" would read as the first region where "Region 10" is meant), so
 * one that would is extended to the end of that number.
 */
function beginning(name: readonly string[], length: number): string[] {
  let end = Math.min(length, name.length);
  while (end < name.length && isDigit(name[end - 1]) && isDigit(name[end])) end += 1;
  return name.slice(0, end);
}

/**
 * Whether `name` begins with `start`: letter for letter without case, and a number at the end
 * of `start` must be the whole number ("Region 1" is not the beginning of "Region 15").
 */
function beginsWith(name: readonly string[], start: readonly string[]): boolean {
  if (start.length > name.length) return false;
  if (isDigit(start.at(-1)) && isDigit(name[start.length])) return false;
  return start.every((letter, index) => letter.toLowerCase() === name[index]?.toLowerCase());
}

/** The shortest beginning of `name` that none of the `others` begins with; all of it at most. */
function distinctStart(name: string, others: ReadonlyArray<string | undefined>): string {
  const whole = letters(name.trim());
  const rest = others.flatMap((other) =>
    other === undefined || other === name ? [] : [letters(other.trim())],
  );
  for (let length = 1; length <= whole.length; length++) {
    const start = beginning(whole, length);
    if (!rest.some((other) => beginsWith(other, start))) return start.join('').trimEnd();
    length = start.length;
  }
  return whole.join('');
}

/** About this much of a name stands in a range; a number at the cut is kept whole. */
const RANGE_NAME = 12;
function shortened(text: string): string {
  const whole = letters(text);
  if (whole.length <= RANGE_NAME) return text;
  const kept = beginning(whole, RANGE_NAME);
  return kept.length === whole.length ? text : `${kept.join('')}…`;
}

/**
 * Splits the roles of one group into as many menus as they need, by alphabetical ranges of
 * about the same size, each named by where it begins and ends: one letter where that tells
 * the two ends apart and from the menu beside it, more where two menus meet inside a letter
 * ("A – Fo", "Fr – Z") or a menu begins and ends in one ("Sa – Sp").
 */
function splitGroup(group: SelfRoleGroup | undefined, entries: readonly RosterEntry[]): RoleMenu[] {
  const name = group?.name ?? OTHER_TITLE;
  const pickOne = group?.pickOne ?? false;
  const capacity = pickOne ? MENU_OPTIONS - 1 : MENU_OPTIONS;
  const sorted = [...entries].sort(byRoleName);
  const parts = Math.ceil(sorted.length / capacity);
  if (parts <= 1) return [{ group, part: 0, title: name, pickOne, entries: sorted }];
  const chunks: RosterEntry[][] = [];
  let taken = 0;
  for (let part = 0; part < parts; part++) {
    // The sizes differ by one at most; the earlier parts take what is left over.
    const size = Math.floor(sorted.length / parts) + (part < sorted.length % parts ? 1 : 0);
    chunks.push(sorted.slice(taken, taken + size));
    taken += size;
  }
  const ranges = chunks.map((chunk, part) => {
    const first = chunk[0]?.name ?? '';
    const last = chunk.at(-1)?.name ?? '';
    const before = chunks[part - 1]?.at(-1)?.name;
    const after = chunks[part + 1]?.[0]?.name;
    const from = shortened(distinctStart(first, [before, last]));
    const to = shortened(distinctStart(last, [after, first]));
    return from === to ? from : `${from} – ${to}`;
  });
  // Names that only differ far behind their beginning make ranges that say nothing.
  const telling = new Set(ranges).size === ranges.length;
  return chunks.map((chunk, part) => ({
    group,
    part,
    title: telling
      ? `${name}: ${ranges[part] ?? ''}`
      : `${name}: part ${String(part + 1)} of ${String(parts)}`,
    pickOne,
    entries: chunk,
  }));
}

/**
 * The menus a server's roster makes: only roles that can be given at present, a menu per group
 * that has any (in the groups' order), the roles without a group last.
 */
export function roleMenus(roster: Roster): RoleMenu[] {
  const offered = roster.entries.filter((entry) => entry.problem === undefined && entry.role);
  const menus: RoleMenu[] = [];
  for (const group of roster.groups) {
    const members = offered.filter((entry) => entry.group?.id === group.id);
    if (members.length > 0) menus.push(...splitGroup(group, members));
  }
  const others = offered.filter((entry) => entry.group === undefined);
  if (others.length > 0) menus.push(...splitGroup(undefined, others));
  return menus;
}

/**
 * The menus spread over pages: all on one page while they fit a message's five rows, otherwise
 * four to a page, which leaves a row for the buttons that turn the pages.
 */
export function menuPages(menus: readonly RoleMenu[]): RoleMenu[][] {
  if (menus.length <= MENUS_WITHOUT_PAGING) return [[...menus]];
  const pages: RoleMenu[][] = [];
  for (let start = 0; start < menus.length; start += MENUS_PER_PAGE) {
    pages.push(menus.slice(start, start + MENUS_PER_PAGE));
  }
  return pages;
}

/** The page with this number, from 0, or the nearest there is; 0 for anything that is no number. */
export function nearestPage(page: number, pages: number): number {
  if (!Number.isInteger(page)) return 0;
  return Math.min(Math.max(page, 0), Math.max(pages - 1, 0));
}

/** A choice of a menu as its message showed it: its value, and whether it stood ticked. */
export interface ShownChoice {
  value: string;
  ticked: boolean;
}

/**
 * What changing a menu asks for: exactly that menu's difference. `shown` are the options the
 * menu had when it was pressed, `chosen` the values that are ticked now: the ticked roles are
 * to be given, and the roles the menu showed ticked that are ticked no longer are to be taken
 * away. A role the menu showed unticked is never taken away: the member may have got it
 * elsewhere since the message was made, and did not untick it here. A value the menu did not
 * show is ignored, and "None" names no role. (`planChange` then does nothing for a role the
 * member has already, or does not have.)
 *
 * A menu that showed "None" is a single choice, and picking another role in it unticks the old
 * one whether the member means to lose it or not: such a menu asks for a take only when "None"
 * itself was chosen. A swap is left to `planChange`, which takes the old role of a pick-one
 * group away only when the new one is really given; a picked role that can no longer be given
 * (the message may be old) must not cost the member the role they had.
 */
export function menuRequest(
  shown: readonly ShownChoice[],
  chosen: readonly string[],
): ChangeRequest {
  const offered = shown.filter((choice) => choice.value !== NONE_VALUE);
  const showedNone = offered.length < shown.length;
  const give = offered.filter((choice) => chosen.includes(choice.value));
  const take =
    showedNone && !chosen.includes(NONE_VALUE)
      ? []
      : offered.filter((choice) => choice.ticked && !chosen.includes(choice.value));
  return { give: give.map((choice) => choice.value), take: take.map((choice) => choice.value) };
}

/** The roles of a group that can be held, by id: what "None" in a pick-one group takes away. */
export function groupRoleIds(roster: Roster, groupId: number): string[] {
  return roster.entries.flatMap((entry) =>
    entry.group?.id === groupId && entry.role ? [entry.role.id] : [],
  );
}
```

Create `src/render/role-menus.ts`:

```ts
import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APISelectMenuOption,
} from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import {
  groupRoleIds,
  menuPages,
  nearestPage,
  NONE_VALUE,
  roleMenus,
  type RoleMenu,
} from '../domain/roles/menus.js';
import type { Roster } from '../domain/roles/self-roles.js';
import { LIMITS, plain, truncate } from './text.js';

/**
 * The custom-id kind of the controls of `/iam` without a role (see `custom-id.ts`):
 * `roles:<group>:pick:<part>:<page>` is a menu, `roles:page:prev|next:<page>` a page button.
 */
export const ROLES_KIND = 'roles';
/** The id part of a menu of the roles without a group. */
export const OTHER_ID = 'other';
/** The id part of the buttons that turn the pages. */
export const PAGE_ID = 'page';
export const PICK_ACTION = 'pick';
export const PREVIOUS_ACTION = 'prev';
export const NEXT_ACTION = 'next';

/** Discord's limits for a select menu. */
const OPTION_LABEL = 100;
const OPTION_DESCRIPTION = 100;
const PLACEHOLDER = 150;

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;

/** The private message of `/iam` without a role: its text and its rows of controls. */
export interface RoleMenuMessage {
  content: string;
  components: Row[];
}

const rule = (menu: RoleMenu): string => (menu.pickOne ? 'pick one' : 'any number');

function menuRow(menu: RoleMenu, roster: Roster, held: ReadonlySet<string>, page: number): Row {
  const options: APISelectMenuOption[] = menu.entries.map((entry) => ({
    label: truncate(entry.name, OPTION_LABEL),
    value: entry.role?.id ?? '',
    ...(entry.row.description === null
      ? {}
      : { description: truncate(entry.row.description, OPTION_DESCRIPTION) }),
    default: entry.role !== undefined && held.has(entry.role.id),
  }));
  if (menu.pickOne && menu.group) {
    // A menu of one choice shows one role as chosen, also for a member who holds several.
    let chosen = false;
    for (const option of options) {
      option.default = option.default === true && !chosen;
      chosen ||= option.default;
    }
    const holdsOne = groupRoleIds(roster, menu.group.id).some((id) => held.has(id));
    options.unshift({
      label: 'None',
      value: NONE_VALUE,
      description: truncate(`No role of ${menu.group.name}`, OPTION_DESCRIPTION),
      default: !holdsOne,
    });
  }
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.StringSelect,
        custom_id: encodeCustomId({
          kind: ROLES_KIND,
          id: menu.group ? String(menu.group.id) : OTHER_ID,
          action: PICK_ACTION,
          args: [String(menu.part), String(page)],
        }),
        placeholder: truncate(`${menu.title} (${rule(menu)})`, PLACEHOLDER),
        min_values: menu.pickOne ? 1 : 0,
        max_values: menu.pickOne ? 1 : options.length,
        options,
      },
    ],
  };
}

function pageRow(page: number, pages: number): Row {
  const button = (action: string, label: string, disabled: boolean) => ({
    type: ComponentType.Button as const,
    style: ButtonStyle.Secondary as const,
    label,
    custom_id: encodeCustomId({
      kind: ROLES_KIND,
      id: PAGE_ID,
      action,
      args: [String(page)],
    }),
    disabled,
  });
  return {
    type: ComponentType.ActionRow,
    components: [
      button(PREVIOUS_ACTION, 'Previous', page === 0),
      button(NEXT_ACTION, 'Next', page >= pages - 1),
    ],
  };
}

const HEADING =
  '**Your roles on this server.** Tick and untick them in the menus; a menu takes effect as ' +
  'soon as you close it.';
/** What the message says in a server that offers no role at all. */
export const NO_ROLES = 'This server has no roles you can give yourself at the moment.';
/** What a member is told when nothing can be handed out because the bot lacks Manage Roles. */
export const NO_MANAGE_ROLES =
  'I cannot change roles on this server: I lack the Manage Roles permission. A ' +
  'moderator has to give it to my role.';
/** What the message says where roles are offered, but none of them can be given. */
export const NONE_AVAILABLE =
  "None of this server's self-assignable roles can be given at the moment. A moderator can " +
  'see why with `/admin self-roles list`.';

/** Why there is nothing to pick: what a member can do about each differs. */
function nothingToPick(roster: Roster): string {
  if (roster.entries.length === 0) return NO_ROLES;
  return roster.bot.mayManageRoles ? NONE_AVAILABLE : NO_MANAGE_ROLES;
}

/**
 * The message with the menus: one per group (a part of a group that needs several), the
 * member's own roles ticked, and with more than five menus four to a page and a row of
 * Previous and Next. Nothing depends on anything but the roster and the roles the member holds,
 * so the same message can be made again after every change and after a restart. A menu shows
 * its name only while nothing is ticked in it, so the text lists the menus of the page in
 * their order. `note` is what the change that led here did; it comes last, next to the menus.
 */
export function renderRoleMenus(
  roster: Roster,
  held: ReadonlySet<string>,
  page: number,
  note?: string,
): RoleMenuMessage {
  const menus = roleMenus(roster);
  if (menus.length === 0) {
    const why = nothingToPick(roster);
    // A change that led here may have said the same already.
    const said = note !== undefined && note.includes(why);
    return { content: said ? note : [note, why].filter(Boolean).join('\n'), components: [] };
  }
  const pages = menuPages(menus);
  const shown = nearestPage(page, pages.length);
  const onPage = pages[shown] ?? [];
  const lines = [
    HEADING,
    ...onPage.map((menu, index) => `${String(index + 1)}. ${plain(menu.title)} · ${rule(menu)}`),
    ...(pages.length > 1 ? [`Page ${String(shown + 1)} of ${String(pages.length)}`] : []),
  ];
  const text = lines.join('\n');
  const content =
    note === undefined || note === ''
      ? text
      : `${text}\n${truncate(note, LIMITS.content - text.length - 1)}`;
  return {
    content,
    components: [
      ...onPage.map((menu) => menuRow(menu, roster, held, shown)),
      ...(pages.length > 1 ? [pageRow(shown, pages.length)] : []),
    ],
  };
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/roles/menus.test.ts src/domain/roles/menus.test.ts src/render/role-menus.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff aa32cd0 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/roles/iam.ts src/commands/roles/menus.test.ts src/commands/roles/menus.ts src/commands/roles/words.ts src/components/index.ts src/discord/custom-id.ts src/domain/roles/menus.test.ts src/domain/roles/menus.ts src/render/role-menus.test.ts src/render/role-menus.ts test/support/roles.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/roles/iam.ts src/commands/roles/menus.test.ts src/commands/roles/menus.ts src/commands/roles/words.ts src/components/index.ts src/discord/custom-id.ts src/domain/roles/menus.test.ts src/domain/roles/menus.ts src/render/role-menus.test.ts src/render/role-menus.ts test/support/roles.ts
git commit -F <a file with the message below>
```

The commit message:

```
The menus of `/iam` without a role: one per group, pages, the handler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: `npm run check` green with 3,572 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-4c HEAD -- src test scripts data/settings.json` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other.
2. Whole-branch review (Opus, high effort) of the five commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line (Phase 4 is built), and conventions for `ctx.selfRoles` (`SelfRoleService`: `roster`, `change`, the outcomes), `RoleGateway` (one role per request, never a member's list), the rules of `src/domain/roles/` (`roleProblem`, `buildRoster`, `planChange`), `MODERATION_PERMISSIONS`, `SubcommandPart.enabled`, the custom-id kind `roles`, the test twins (`MemorySelfRoles`, `FakeRoleGateway`, `selfRolesWith`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 4C" section (what staging must verify, what is left open, the note for a database shared with the legacy bot and for a rollback, the items for Phases 5 and 8). The spec ("as built" for the rows of 4.2), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. `settings.features.roles` must be on in `data/settings.json`, and `npm run deploy-commands` comes first (two new commands, `/iam` and `/iamnot`, and the `self-roles` group of `/admin`). The local database gets one migration when the bot starts. The bot's role needs Manage Roles and must stand above the roles it is to hand out. Make a few test roles first: three "regions", three "teams", one with Kick Members, one above the bot's role.

What no test can show (try these first):

- [ ] The bot gives and takes a role for a member who holds roles **above the bot** (Matt's own account) and for a member with a managed role (a booster, or the second account with a bot's role if that can be arranged): no refusal.
- [ ] A role the member already has is given again, and one they lack is taken (two menus pressed quickly; `/iam role` twice): no error, the answer says "already".
- [ ] With a server that requires two-factor authentication for moderation, if the test server can be set so: the sentence about it, not an error with a reference.

Staff (`/admin self-roles`):

- [ ] `add` with Discord's role picker for a region role, with a description, aliases and a group that does not exist yet (refused with a sentence that names `group`); `group name:Regions`, `group name:Teams pick-one:true`; `add` again with the groups. `list` shows the groups in order with aliases and descriptions.
- [ ] `add` is refused, each with its reason, for `@everyone`, the bot's own managed role, the role above the bot, the role with Kick Members. With the second account as a moderator without Manage Roles: refused; with Manage Roles, a role above the moderator's own: refused.
- [ ] Rename a listed role in Discord: `list` and `/iam` show the new name. Delete a listed role in Discord: `list` marks it, `/iam` does not offer it, `remove` removes the row.
- [ ] Take Manage Roles from the bot: `list` says so once at the top; `/iam` says what a moderator has to fix. Give it back.
- [ ] With `features.roles` off and the commands deployed again: `/iam`, `/iamnot` and `/admin self-roles` are gone.

Members:

- [ ] `/iam role:` autocomplete shows names with descriptions and finds an alias; picking gives the role; a second time says the member has it. Typed text that is no name is refused with suggestions.
- [ ] `/iam role:Mystic` while holding Valor (pick-one): Valor goes, and the answer says so. `/iamnot` offers only what the member holds.
- [ ] `/iam` alone: one menu per group in order, "Other" last, the member's roles ticked. Tick two regions and untick one: exactly those change, and the message says what was added and removed. The team menu has "None"; choosing it takes the team role away; choosing another team swaps.
- [ ] Open `/iam`, then get a role by `/iam role:` or by a moderator's hand, then tick another role in the old message: the role got elsewhere stays.
- [ ] With more than 25 roles in one group (make them, or lower the number in a scratch build): the group is split into menus whose ranges read right; with more than five menus: Previous and Next.
- [ ] A role that was given Kick Members after it was listed: `/iam` refuses it with a sentence, `/iamnot` still takes it back.
- [ ] How the menus read on a phone, and whether the list of menus above them is needed there.
- [ ] Take Manage Roles from the bot while a `/iam` message is open and tick a role in it: the answer says nothing was changed. Note whether the client then still shows the tick (the message is edited back to its own menus; whether Discord resets what the member ticked only this shows).

For the legacy bot on the same database (only if a copy of production is used): its `!iam` still finds the roles, also one the new bot renamed.
