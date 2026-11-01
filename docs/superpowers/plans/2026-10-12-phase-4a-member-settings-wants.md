# Phase 4A: Member Settings, Wants, Targets, Friend Codes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a member sets for themself, with no message sent to anybody else: `/settings`, the wants (`/want`, `/unwant`, `/wants`, `/unwant-all`), the gym targets (`/target`, `/untarget`, `/targets`, `/untarget-all`), `/friend-code` and `/nickname`. A want can be for a species, for one form of it, or for its shadow raids only.

**Architecture:** Phase 4 (notifications and members) is three plans: 4A (this one), 4B (delivery: `DmSender`, `NotifyService`, the "Stop these" button, `/wild`, Unown) and 4C (self-assigned roles). 4A adds two repositories over the legacy tables `PokemonNotification` and `GymNotification` (each with an in-memory twin for command tests, both deciding through the same pure functions in `src/domain/pogo/wants.ts`), a batch read of member settings that the party services now use, a port for looking one member of a server up without a member list (`MemberDirectory`), and the commands. Nothing here sends a DM or a ping.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies. One additive migration (two columns on `PokemonNotification`).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: 3.2 (no bot-channel restriction for private answers), 4.2 (the rows `auto, privacy`, `want …`, `mentions …`, `register-friend-code …`), 6.4, 6.6 ("No magic numbers"). The design brief with the rulings is the git-ignored `.superpowers/sdd/phase-4a-design.md`; what the legacy bot did is in `.superpowers/sdd/phase-4-legacy-notes.txt`.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (2,996 unit tests at the end; the database suite, 189 tests, green on the tip). Two reviewers went through that branch, a third through the fixes and the seventh task, a fourth through the last fixes (verdict: ready to plan from); what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the plan.

## Decisions made in this plan

1. **Where the commands work.** Every answer is private. None is tied to a bot channel. Wants, targets and `/nickname find` need a server; `/settings`, `/friend-code` and `/nickname` are also offered in the bot's DM. The eight want and target commands exist only where `settings.features.notifications` is on; `/settings boss-set` and `new-train` say so when it is off.
2. **A want is per member and server** (the legacy bot kept one row per member and number and moved it between servers). **There is no limit** on the number of wants or targets (Matt, 2026-10-12); the lists are cut with a count, and the autocomplete of `/unwant` and `/untarget` shows the 25 best matches.
3. **What a want can be** (Matt, 2026-10-12): a species (every form, megas included, also forms the game adds later), one form of it (a catalogue key in the new column `PokemonNotification.form`), the shadow raids of either (the new column `shadow`; always raids only), a raid tier (always raids), or perfect or zero IV spawns (always spawns). A mega is raids only too. Existing rows have neither column set and mean exactly what they meant. Shadow is offered for any Pokémon; the autocomplete puts the current shadow bosses first.
4. **Legacy rows.** Types in any letter case are read; a row the codec cannot read is skipped, counted in the list and never deleted on its own (`/unwant-all` removes it, because the member asked). Duplicate rows for one want are read as one want with the union of their scopes, and setting that want leaves one row. A row is rewritten only when its meaning changes. The 2019 `(-6, both)` rows stay perfect-IV wants.
5. **Typed text never guesses.** Sent without picking from the list, a text acts only when it is a tier or IV word in full (`t5`, `tier 5`, `mega`, `hundo`, `100`, …), exactly a species' name (every form), or exactly one form's own name; `shadow` before either makes it the shadow want. Anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
6. **Labels.** A species with several entries is "X (every form)"; its plain entry "X (base form)"; a shadow want "Shadow X"; in `/unwant`'s choices the scope follows " · ".
7. **Targets.** `/target` without a gym, in a raid's post or a train's, takes that raid's gym or the train's current stop. There is no confirmation question (the spec had one because the legacy search acted on its top hit): a picked choice or a clear hit acts, an unclear text offers a menu. A gym belongs to a server by the row of its region (`gymInGuild`), never by the channel cache; `/raid`, `/location` and a train's route use the same rule now.
8. **Friend codes and in-game names.** A friend code is twelve digits, stored as `dddd dddd dddd`. An in-game name is 3 to 32 letters and digits, stored as typed; the search ignores case and accents. Both can be removed (new). `/friend-code show` and `/nickname find` answer only about members of the server they are used in; `find` names every such member with that name (the legacy bot took the first).
9. **Members without a member list.** `ctx.members.find(guildId, userId)` asks Discord for one member and keeps the answer, also "not a member", for a minute. `DiscordPartyGateway.memberAccess` fetches through the same function.
10. **Settings in batches.** The party services read the settings of everybody they may ping in one query (`settingsOf`); when that read fails nobody is pinged and the failure is logged.
11. **The sentences promise DMs** ("You will get a DM when …") although delivery comes with plan 4B: nothing ships in between.
12. **Not in this plan** (to the follow-ups file): the DMs themselves and what a want fires for (`pokemonWantFits` is written and tested here, with no caller yet); Unown; `/admin member-settings`; a review of the command names (`/nickname` may be read as the server nickname).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). Repositories are the only code that knows column names; a write in several steps goes through `inTransaction`.
- Database changes are additive only: Task 7 has the plan's one migration. `src/db/types.ts` is generated: Task 7's diff of it is what `npm run db:codegen` produces after that migration; apply the diff, and where Docker is available check it with `npm run db:codegen -- --verify`.
- **Tests never use the network and never contact Discord.** Discord in tests is the fake interactions, `FakePartyGateway` and `FakeMemberDirectory`. Database tests never use production rows.
- Text a member wrote is shown through `plain()`; a member is named by `memberText` / `memberName`, never by a bare mention in text that does not ping. Custom ids are built and parsed only through `src/discord/custom-id.ts`.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Each task names the commit of the prototype it transcribes (branch `proto/phase-4a` of this repository). `git diff <that commit> -- src test` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting). Check its exit status, not only the end of its output.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. A typed text must never store a want the member did not mean: Task 3 and Task 7, the sweep in `wants.test.ts` over every prefix of every name of the catalogue, and the tests of nicknames of species known by a named default form (`tina`, `lando`).
2. Legacy rows must keep their meaning and survive: Tasks 3 and 7, `notification-target.test.ts` and `pokemon-notification-repository.db.test.ts` (types in any case, the `-6` rows, duplicates, unreadable rows, stray values in the new columns, rows with NULL owner or server).
3. Several members, or one member twice, at the same moment must leave one row per want and fail nobody, also in a server that has no `Guild` row yet: Tasks 3 and 5, the simultaneous tests in both repository db test files.
4. Nobody answers another member's question and nothing of another server is shown: Tasks 4 to 6, the tests of the Remove all / Keep buttons and the gym menu pressed by somebody else, of a gym of another server, of a friend code or in-game name of somebody who is not in the server.
5. No answer may exceed Discord's limits whatever a member has stored: Tasks 2, 4 and 5, the tests with 120 and more wants and targets, with all five groups of `/wants` full, and with 255-character legacy values in `/settings show`.

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
test/support/users.ts  (create, task 1)
src/commands/settings/settings.test.ts  (create, task 2)
src/commands/settings/settings.ts  (create, task 2)
src/db/repositories/member-rows.ts  (create, task 3)
src/db/repositories/pokemon-notification-repository.db.test.ts  (create, task 3)
src/db/repositories/pokemon-notification-repository.ts  (create, task 3)
src/domain/pogo/wants.test.ts  (create, task 3)
src/domain/pogo/wants.ts  (create, task 3)
test/support/wants.test.ts  (create, task 3)
test/support/wants.ts  (create, task 3)
src/commands/notifications/remove-all.ts  (create, task 4)
src/commands/notifications/want-input.ts  (create, task 4)
src/commands/notifications/wants.test.ts  (create, task 4)
src/commands/notifications/wants.ts  (create, task 4)
src/commands/notifications/targets.test.ts  (create, task 5)
src/commands/notifications/targets.ts  (create, task 5)
src/db/repositories/gym-notification-repository.db.test.ts  (create, task 5)
src/db/repositories/gym-notification-repository.test.ts  (create, task 5)
src/db/repositories/gym-notification-repository.ts  (create, task 5)
test/support/targets.ts  (create, task 5)
src/commands/friends/friends.test.ts  (create, task 6)
src/commands/friends/friends.ts  (create, task 6)
src/discord/member-directory.ts  (create, task 6)
test/support/members.ts  (create, task 6)
src/db/migrations/2026_10_12_005_pokemon_notification_form.ts  (create, task 7)
```

---

### Task 1: Member settings are read in batches

**Files:**
- Create: `test/support/users.ts`
- Modify: `src/app-context.ts`, `src/commands/meetups/meetup.test.ts`, `src/commands/parties/shout.test.ts`, `src/commands/raids/raid.test.ts`, `src/commands/trains/train.test.ts`, `src/db/repositories/user-repository.db.test.ts`, `src/db/repositories/user-repository.ts`, `src/services/attendance-service.test.ts`, `src/services/attendance-service.ts`, `src/services/party-change.ts`, `src/services/party-scheduler.ts`, `src/services/party-service.ts`, `src/services/timed-party-service.test.ts`, `src/services/timed-party-service.ts`, `src/services/train-service.test.ts`, `src/services/train-service.ts`, `test/support/party-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: `UserRepository` (`get`, `update`), `DEFAULT_USER_SETTINGS`, `ctx.users`, the party services that read each attendee's settings before a ping (`AttendanceService`, `TimedPartyService`, `TrainService`, `PartyService`), `partyServiceWith()` and `createTestContext()`.
- Produces: `UserRepository.getMany(snowflakes): Promise<Map<string, UserSettings>>` (one query per 500, defaults for a member without a row, no query for an empty list); the interfaces `UserSettingsReader` (`get`, `getMany`) and `UserSettingsStore` (with `update`); `settingsOf(users, ids, log)` in `src/services/party-change.ts` (an unreadable batch is logged and pings nobody); `ctx.users` as a `UserSettingsStore`; `MemoryUsers` in `test/support/users.ts` (with `reads`, the number of calls).

Behaviour is unchanged except for a failed read: one failed batch now pings nobody, where one failed single read used to leave out that member only. The scheduler's archive warning still uses `get` (one member). `user-repository.db.test.ts` changes.

Reference commit of the prototype for this task: `bd79284`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/meetups/meetup.test.ts`:

```diff
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -15,8 +15,8 @@ import {
 import { ALICE, BOB, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
+import { MemoryUsers } from '../../../test/support/users.js';
 import type { AppContext } from '../../app-context.js';
-import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { commands } from '../index.js';
@@ -157,15 +157,10 @@ describe('/meetup', () => {
   });
 
   it('names who made it, whatever they chose for the raids they report', async () => {
-    const users = {
-      get: (snowflake: string) =>
-        Promise.resolve({
-          snowflake,
-          ...DEFAULT_USER_SETTINGS,
-          autoStatus: PartyStatus.Present,
-          raidPrivacy: RaidPrivacy.Anonymous,
-        }),
-    };
+    const users = new MemoryUsers(undefined, {
+      autoStatus: PartyStatus.Present,
+      raidPrivacy: RaidPrivacy.Anonymous,
+    });
     const made = await setup({ users });
     await made.run('Picnic');
     const [party] = made.meetups();
```

Apply to `src/commands/parties/shout.test.ts`:

```diff
--- a/src/commands/parties/shout.test.ts
+++ b/src/commands/parties/shout.test.ts
@@ -162,10 +162,10 @@ describe('/shout', () => {
     const made = await setup();
     await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
     await made.attendance.flush();
-    const read = made.users.get.bind(made.users);
-    made.users.get = async (snowflake) => {
+    const read = made.users.getMany.bind(made.users);
+    made.users.getMany = async (snowflakes) => {
       await made.service.end(made.party.id);
-      return read(snowflake);
+      return read(snowflakes);
     };
     const used = await made.run('too late');
     expect(used.followUp).toHaveBeenCalledWith({
```

Apply to `src/commands/raids/raid.test.ts`:

```diff
--- a/src/commands/raids/raid.test.ts
+++ b/src/commands/raids/raid.test.ts
@@ -18,7 +18,7 @@ import { gymsFixture } from '../../../test/support/providers.js';
 import { at, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
-import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
+import { MemoryUsers } from '../../../test/support/users.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { FORUM_TAGS } from '../../render/party-post.js';
@@ -116,15 +116,10 @@ describe('/raid', () => {
   });
 
   it('uses the member’s settings: automatic status and anonymous reports', async () => {
-    const users = {
-      get: (snowflake: string) =>
-        Promise.resolve({
-          snowflake,
-          ...DEFAULT_USER_SETTINGS,
-          autoStatus: PartyStatus.Coming,
-          raidPrivacy: RaidPrivacy.Anonymous,
-        }),
-    };
+    const users = new MemoryUsers(undefined, {
+      autoStatus: PartyStatus.Coming,
+      raidPrivacy: RaidPrivacy.Anonymous,
+    });
     const { run, store } = await setup({ users });
     const interaction = await run({ boss: 'e:T5:0', gym: 'g:1' });
     expect(store.active()[0]).toMatchObject({
```

Apply to `src/commands/trains/train.test.ts`:

```diff
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -15,8 +15,8 @@ import {
 import { ALICE, BOB, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
+import { MemoryUsers } from '../../../test/support/users.js';
 import type { AppContext } from '../../app-context.js';
-import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { partyControls } from '../../render/party-controls.js';
@@ -151,15 +151,10 @@ describe('/train', () => {
   });
 
   it('names who made it, whatever they chose for the raids they report', async () => {
-    const users = {
-      get: (snowflake: string) =>
-        Promise.resolve({
-          snowflake,
-          ...DEFAULT_USER_SETTINGS,
-          autoStatus: PartyStatus.Present,
-          raidPrivacy: RaidPrivacy.Anonymous,
-        }),
-    };
+    const users = new MemoryUsers(undefined, {
+      autoStatus: PartyStatus.Present,
+      raidPrivacy: RaidPrivacy.Anonymous,
+    });
     const made = await setup({ users });
     await made.run('Round');
     const [party] = made.trains();
```

Apply to `src/db/repositories/user-repository.db.test.ts`:

```diff
--- a/src/db/repositories/user-repository.db.test.ts
+++ b/src/db/repositories/user-repository.db.test.ts
@@ -7,6 +7,7 @@ import { DEFAULT_USER_SETTINGS, UserRepository } from './user-repository.js';
 
 const ALICE = '312345678901234567';
 const BOB = '312345678901234568';
+const CAROL = '312345678901234569';
 
 describe('UserRepository', () => {
   let stop: () => Promise<void>;
@@ -107,6 +108,44 @@ describe('UserRepository', () => {
     expect(alice.autoStatus).toBe(PartyStatus.Interested);
   });
 
+  it('reads the settings of several members at once, with the defaults for those without a row', async () => {
+    await users.update(ALICE, { mentions: false, friendCode: '1111 2222 3333' });
+    await users.update(BOB, { mentionsShouts: false });
+    const found = await users.getMany([BOB, CAROL, ALICE, BOB]);
+    expect([...found.keys()].sort()).toEqual([ALICE, BOB, CAROL]);
+    expect(found.get(ALICE)).toEqual(await users.get(ALICE));
+    expect(found.get(BOB)).toEqual({
+      snowflake: BOB,
+      ...DEFAULT_USER_SETTINGS,
+      mentionsShouts: false,
+    });
+    expect(found.get(CAROL)).toEqual({ snowflake: CAROL, ...DEFAULT_USER_SETTINGS });
+    // Reading creates no row.
+    expect(await users.idFor(CAROL)).toBeUndefined();
+  });
+
+  it('asks the database nothing for an empty list', async () => {
+    const closed = new UserRepository({
+      selectFrom: () => {
+        throw new Error('no query was expected');
+      },
+    } as unknown as Kysely<DB>);
+    expect(await closed.getMany([])).toEqual(new Map());
+  });
+
+  it('reads more members than one query names', async () => {
+    const many = Array.from({ length: 1_203 }, (_unused, index) =>
+      String(500000000000000000n + BigInt(index)),
+    );
+    await users.update(many[0] ?? '', { mentions: false });
+    await users.update(many[1_202] ?? '', { mentionsGroups: false });
+    const found = await users.getMany(many);
+    expect(found.size).toBe(1_203);
+    expect(found.get(many[0] ?? '')?.mentions).toBe(false);
+    expect(found.get(many[1_202] ?? '')?.mentionsGroups).toBe(false);
+    expect(found.get(many[600] ?? '')).toEqual({ snowflake: many[600], ...DEFAULT_USER_SETTINGS });
+  });
+
   it('finds a member by game nickname, ignoring case', async () => {
     await users.update(ALICE, { nickname: 'AliceGo' });
     expect(await users.snowflakeForNickname('alicego')).toBe(ALICE);
```

Apply to `src/services/attendance-service.test.ts`:

```diff
--- a/src/services/attendance-service.test.ts
+++ b/src/services/attendance-service.test.ts
@@ -384,13 +384,27 @@ describe('AttendanceService: completing a raid', () => {
     expect(made.gateway.deleted).toHaveLength(1);
   });
 
+  it('reads the settings of those it asks in one read', async () => {
+    const made = await reportedRaid(yveltal, {});
+    const id = made.party.id;
+    await made.attendance.signUp(id, alice, PartyStatus.Present);
+    await made.attendance.signUp(id, bob, PartyStatus.Present);
+    await made.attendance.signUp(id, { id: CAROL }, PartyStatus.Present);
+    await made.attendance.flush();
+    const before = { ...made.users.reads };
+    await made.attendance.done(id, alice);
+    await made.attendance.flush();
+    expect(made.users.reads).toEqual({ get: before.get, getMany: before.getMany + 1 });
+    expect(made.users.asked.at(-1)?.sort()).toEqual([BOB, CAROL].sort());
+  });
+
   it('asks without pinging anybody when the settings cannot be read', async () => {
     const made = await reportedRaid(yveltal, {});
     const id = made.party.id;
     await made.attendance.signUp(id, alice, PartyStatus.Present);
     await made.attendance.signUp(id, bob, PartyStatus.Present);
     await made.attendance.flush();
-    made.users.get = () => Promise.reject(new Error('the database is away'));
+    made.users.getMany = () => Promise.reject(new Error('the database is away'));
     await made.attendance.done(id, alice);
     await made.attendance.flush();
     const question = made.gateway
@@ -398,6 +412,10 @@ describe('AttendanceService: completing a raid', () => {
       .find((message) => message.message.components?.length);
     expect(question?.message.content).toContain(`<@${BOB}>: have you completed`);
     expect(question?.message.mention).toEqual({ users: [] });
+    // The failure is not swallowed silently.
+    expect(made.entries).toContainEqual(
+      expect.objectContaining({ level: 40, msg: 'could not read the settings of members' }),
+    );
   });
 });
 
@@ -504,15 +522,15 @@ describe('AttendanceService: groups', () => {
     const id = made.party.id;
     await made.attendance.signUp(id, bob, PartyStatus.Coming);
     await made.attendance.flush();
-    const original = made.users.get.bind(made.users);
+    const original = made.users.getMany.bind(made.users);
     // The settings of the members arrive only once the party has ended.
     let release = () => {};
     const gate = new Promise<void>((resolve) => {
       release = resolve;
     });
-    made.users.get = async (snowflake) => {
+    made.users.getMany = async (snowflakes) => {
       await gate;
-      return original(snowflake);
+      return original(snowflakes);
     };
     const sends = () => made.gateway.calls.filter((call) => call.startsWith('sendMessage')).length;
     await made.attendance.newGroup(id, alice);
```

Apply to `src/services/timed-party-service.test.ts`:

```diff
--- a/src/services/timed-party-service.test.ts
+++ b/src/services/timed-party-service.test.ts
@@ -134,6 +134,15 @@ describe('TimedPartyService.setStartTime', () => {
     });
   });
 
+  it('reads the settings of everybody it may ping in one read', async () => {
+    const made = await withMembers();
+    const before = { ...made.users.reads };
+    await made.timed.setStartTime(made.party.id, bob, START);
+    await settled(made);
+    expect(made.users.reads).toEqual({ get: before.get, getMany: before.getMany + 1 });
+    expect(made.users.asked.at(-1)).toEqual([REPORTER, ALICE]);
+  });
+
   it('notes the name and team of the member who set it', async () => {
     const made = await createdMeetup();
     await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
@@ -143,15 +152,15 @@ describe('TimedPartyService.setStartTime', () => {
 
   it('says nothing in the post of a meetup that ended while the settings were read', async () => {
     const made = await withMembers();
-    const slow = { ...made.users };
+    const slow = made.users.getMany.bind(made.users);
     let release: () => void = () => undefined;
     const gate = new Promise<void>((resolve) => (release = resolve));
     let reading: () => void = () => undefined;
     const reached = new Promise<void>((resolve) => (reading = resolve));
-    made.users.get = async (snowflake) => {
+    made.users.getMany = async (snowflakes) => {
       reading();
       await gate;
-      return slow.get(snowflake);
+      return slow(snowflakes);
     };
     const outcome = await made.timed.setStartTime(made.party.id, alice, START);
     expect(outcome.kind).toBe('ok');
```

Apply to `src/services/train-service.test.ts`:

```diff
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -171,6 +171,15 @@ describe('TrainService.move', () => {
     ]);
   });
 
+  it('reads the settings of everybody it may ping in one read', async () => {
+    const made = await boarded();
+    const before = { ...made.users.reads };
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await settled(made);
+    expect(made.users.reads).toEqual({ get: before.get, getMany: before.getMany + 1 });
+    expect(made.users.asked.at(-1)?.sort()).toEqual([REPORTER, BOB].sort());
+  });
+
   it('does not ping who switched all mentions off, nor the member who moved the train', async () => {
     const made = await boarded();
     made.userSettings.set(REPORTER, { mentions: false });
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -5,10 +5,7 @@ import type {
 } from '../../src/db/repositories/access-grant-repository.js';
 import type { PartyStorage } from '../../src/db/repositories/party-repository.js';
 import type { Region } from '../../src/db/repositories/region-repository.js';
-import {
-  DEFAULT_USER_SETTINGS,
-  type UserSettings,
-} from '../../src/db/repositories/user-repository.js';
+import type { UserSettings } from '../../src/db/repositories/user-repository.js';
 import { AccessService } from '../../src/services/access-service.js';
 import { PartyLines } from '../../src/services/party-lines.js';
 import { PartyScheduler } from '../../src/services/party-scheduler.js';
@@ -45,6 +42,7 @@ import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { MemorySavedRoutes } from './saved-routes.js';
 import { createTestLogger } from './test-logger.js';
+import { MemoryUsers } from './users.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { PartyStore } from '../../src/services/party-store.js';
 import { RaidChangeService } from '../../src/services/raid-change-service.js';
@@ -204,10 +202,7 @@ export async function partyServiceWith(
   const regions = kept?.regions ?? new TestRegions();
   const settings = loadSettings(TEST_SETTINGS_PATH);
   const userSettings = kept?.userSettings ?? new Map<string, Partial<UserSettings>>();
-  const users = {
-    get: (snowflake: string): Promise<UserSettings> =>
-      Promise.resolve({ snowflake, ...DEFAULT_USER_SETTINGS, ...userSettings.get(snowflake) }),
-  };
+  const users = new MemoryUsers(userSettings);
   const service = new PartyService({
     store,
     gateway,
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -2,7 +2,6 @@ import type { Kysely } from 'kysely';
 import type { AppContext } from '../../src/app-context.js';
 import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
-import { DEFAULT_USER_SETTINGS } from '../../src/db/repositories/user-repository.js';
 import { ClickAnswers } from '../../src/discord/click-answers.js';
 import type { DB } from '../../src/db/types.js';
 import type { AttendanceService } from '../../src/services/attendance-service.js';
@@ -18,6 +17,7 @@ import { raidEventsFixture } from './raid-events.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { TEST_ENV } from './test-env.js';
+import { MemoryUsers } from './users.js';
 
 export { TEST_SETTINGS_PATH };
 
@@ -50,7 +50,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     regions: regionsFixture(),
     parties: noParties(),
     // Every member has the default settings.
-    users: { get: (snowflake) => Promise.resolve({ snowflake, ...DEFAULT_USER_SETTINGS }) },
+    users: new MemoryUsers(),
     partyService: unavailable<PartyService>(
       'partyService',
       'pass { partyService, parties, regions } from partyServiceWith()',
```

Create `test/support/users.ts`:

```ts
import {
  DEFAULT_USER_SETTINGS,
  type UserSettings,
  type UserSettingsPatch,
  type UserSettingsStore,
} from '../../src/db/repositories/user-repository.js';

/**
 * Members' settings kept in memory as `UserRepository` keeps them: a member who never changed a
 * setting has the defaults. `settings` holds what differs from them, by member; a test may fill
 * it directly, and `everybody` (the second argument) is what all members have set. `reads`
 * counts the calls of each method (a batch read is one call, however many members it names),
 * and `asked` holds the members of each batch read.
 */
export class MemoryUsers implements UserSettingsStore {
  readonly reads = { get: 0, getMany: 0 };
  readonly asked: string[][] = [];

  /** `everybody` is what every member has set, whoever they are. */
  constructor(
    readonly settings = new Map<string, Partial<UserSettings>>(),
    private readonly everybody: Partial<UserSettings> = {},
  ) {}

  private of(snowflake: string): UserSettings {
    return {
      snowflake,
      ...DEFAULT_USER_SETTINGS,
      ...this.everybody,
      ...this.settings.get(snowflake),
    };
  }

  get(snowflake: string): Promise<UserSettings> {
    this.reads.get += 1;
    return Promise.resolve(this.of(snowflake));
  }

  getMany(snowflakes: readonly string[]): Promise<Map<string, UserSettings>> {
    this.reads.getMany += 1;
    this.asked.push([...snowflakes]);
    return Promise.resolve(new Map(snowflakes.map((snowflake) => [snowflake, this.of(snowflake)])));
  }

  update(snowflake: string, patch: UserSettingsPatch): Promise<void> {
    this.settings.set(snowflake, { ...this.settings.get(snowflake), ...patch });
    return Promise.resolve();
  }
}
```

Run: `npx vitest run --project unit src/commands/meetups/meetup.test.ts src/commands/parties/shout.test.ts src/commands/raids/raid.test.ts src/commands/trains/train.test.ts src/services/attendance-service.test.ts src/services/timed-party-service.test.ts src/services/train-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -1,6 +1,6 @@
 import type { Kysely } from 'kysely';
 import type { Config } from './config/index.js';
-import type { UserSettings } from './db/repositories/user-repository.js';
+import type { UserSettingsStore } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
 import type { ClickAnswers } from './discord/click-answers.js';
 import type { CommandModule } from './discord/command.js';
@@ -50,8 +50,8 @@ export interface AppContext {
   readonly trains: TrainService;
   /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
   readonly clickAnswers: ClickAnswers;
-  /** A member's settings (the defaults for a member who never changed one). */
-  readonly users: { get(snowflake: string): Promise<UserSettings> };
+  /** Members' settings (the defaults for a member who never changed one), and changing them. */
+  readonly users: UserSettingsStore;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/db/repositories/user-repository.ts`:

```diff
--- a/src/db/repositories/user-repository.ts
+++ b/src/db/repositories/user-repository.ts
@@ -1,4 +1,4 @@
-import type { Kysely, Updateable } from 'kysely';
+import type { Kysely, Selectable, Updateable } from 'kysely';
 import {
   PartyStatus,
   RaidPrivacy,
@@ -68,8 +68,45 @@ function toColumns(patch: UserSettingsPatch): Updateable<DB['User']> {
   return columns;
 }
 
+/** Reading members' settings: what the party services need to know whom they may ping. */
+export interface UserSettingsReader {
+  /** The member's settings; the defaults when they never changed one. */
+  get(snowflake: string): Promise<UserSettings>;
+  /**
+   * The settings of several members in one read, by snowflake: every member asked for is in
+   * the answer, with the defaults when they never changed a setting. An empty list asks nothing.
+   */
+  getMany(snowflakes: readonly string[]): Promise<Map<string, UserSettings>>;
+}
+
+/** Members' settings as handlers use them (`ctx.users`). */
+export interface UserSettingsStore extends UserSettingsReader {
+  /** Changes the given fields of a member's settings. */
+  update(snowflake: string, patch: UserSettingsPatch): Promise<void>;
+}
+
+/** As many members as one query of `getMany` names. */
+const READ_CHUNK = 500;
+
+function toSettings(snowflake: string, row: Selectable<DB['User']>): UserSettings {
+  return {
+    snowflake,
+    mentions: row.mentions === 1,
+    mentionsGroups: row.groups === 1,
+    mentionsShouts: row.shouts === 1,
+    mentionsTrainStops: row.trainMovement === 1,
+    bossSetNotification: row.raidBoss === 1,
+    newTrainNotification: row.newTrain === 1,
+    autoStatus: toPartyStatus(row.status),
+    raidPrivacy: toRaidPrivacy(row.raidPrivacy),
+    nickname: row.nickname,
+    friendCode: row.friendcode,
+    pokebattlerId: row.pokebattlerId,
+  };
+}
+
 /** The User table: one row per member who has changed a setting. */
-export class UserRepository {
+export class UserRepository implements UserSettingsStore {
   constructor(private readonly db: Kysely<DB>) {}
 
   /** The member's settings; the defaults when they have no row. Never creates a row. */
@@ -79,21 +116,32 @@ export class UserRepository {
       .selectAll()
       .where('userSnowflake', '=', snowflake)
       .executeTakeFirst();
-    if (!row) return { snowflake, ...DEFAULT_USER_SETTINGS };
-    return {
-      snowflake,
-      mentions: row.mentions === 1,
-      mentionsGroups: row.groups === 1,
-      mentionsShouts: row.shouts === 1,
-      mentionsTrainStops: row.trainMovement === 1,
-      bossSetNotification: row.raidBoss === 1,
-      newTrainNotification: row.newTrain === 1,
-      autoStatus: toPartyStatus(row.status),
-      raidPrivacy: toRaidPrivacy(row.raidPrivacy),
-      nickname: row.nickname,
-      friendCode: row.friendcode,
-      pokebattlerId: row.pokebattlerId,
-    };
+    return row ? toSettings(snowflake, row) : { snowflake, ...DEFAULT_USER_SETTINGS };
+  }
+
+  /**
+   * The settings of several members, by snowflake; the defaults for a member without a row.
+   * One query for up to `READ_CHUNK` members, none for an empty list. Never creates a row.
+   */
+  async getMany(snowflakes: readonly string[]): Promise<Map<string, UserSettings>> {
+    const asked = [...new Set(snowflakes)];
+    const found = new Map<string, UserSettings>(
+      asked.map((snowflake) => [snowflake, { snowflake, ...DEFAULT_USER_SETTINGS }]),
+    );
+    for (let start = 0; start < asked.length; start += READ_CHUNK) {
+      const rows = await this.db
+        .selectFrom('User')
+        .selectAll()
+        .where('userSnowflake', 'in', asked.slice(start, start + READ_CHUNK))
+        .execute();
+      for (const row of rows) {
+        // Only what was asked for is answered, under the snowflake as it was asked.
+        if (row.userSnowflake !== null && found.has(row.userSnowflake)) {
+          found.set(row.userSnowflake, toSettings(row.userSnowflake, row));
+        }
+      }
+    }
+    return found;
   }
 
   /** The row id other tables reference (PokemonNotification.userId and so on). */
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -1,5 +1,5 @@
 import type { Settings } from '../config/settings.js';
-import type { UserSettings } from '../db/repositories/user-repository.js';
+import type { UserSettings, UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import {
   answerCompletion,
@@ -40,7 +40,7 @@ import type { Logger } from '../log.js';
 import { standingLine } from '../render/activity.js';
 import { completionQuestion, groupWords } from '../render/party-controls.js';
 import { LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
-import { anyParty, storedChange } from './party-change.js';
+import { anyParty, settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -81,7 +81,7 @@ export interface AttendanceServiceOptions {
   posts: { changed(partyId: string): void };
   /** Where the public lines go. */
   lines: PartyLines;
-  users: { get(snowflake: string): Promise<UserSettings> };
+  users: UserSettingsReader;
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -423,12 +423,10 @@ export class AttendanceService {
     ids: readonly string[],
     allows: (settings: UserSettings) => boolean,
   ): Promise<string[]> {
-    const settings = await Promise.all(
-      ids.map((id) => this.options.users.get(id).catch(() => undefined)),
-    );
+    const settings = await settingsOf(this.options.users, ids, this.options.log);
     return ids
-      .filter((_id, index) => {
-        const found = settings[index];
+      .filter((id) => {
+        const found = settings.get(id);
         return found !== undefined && found.mentions && allows(found);
       })
       .slice(0, LIMITS.pings);
```

Apply to `src/services/party-change.ts`:

```diff
--- a/src/services/party-change.ts
+++ b/src/services/party-change.ts
@@ -1,6 +1,26 @@
+import type { UserSettings, UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { Party, Refusal } from '../domain/party/party.js';
+import type { Logger } from '../log.js';
 import type { PartyStore } from './party-store.js';
 
+/**
+ * The settings of these members, read at once, for a service that wants to know whom it may
+ * ping. When they cannot be read the answer is empty, so that nobody is pinged, and the failure
+ * is logged: the message itself still goes out.
+ */
+export async function settingsOf(
+  users: UserSettingsReader,
+  snowflakes: readonly string[],
+  log: Logger,
+): Promise<Map<string, UserSettings>> {
+  try {
+    return await users.getMany(snowflakes);
+  } catch (err) {
+    log.warn({ err, members: snowflakes.length }, 'could not read the settings of members');
+    return new Map();
+  }
+}
+
 /**
  * What came of one change of a party that was decided inside the store. `gone`: there is no
  * such active party of the kind the change is for. `refused`: the party stays as it was;
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -1,5 +1,5 @@
 import type { Settings } from '../config/settings.js';
-import type { UserSettings } from '../db/repositories/user-repository.js';
+import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import { isRaid, type Party } from '../domain/party/party.js';
 import {
@@ -34,7 +34,7 @@ export interface PartySchedulerOptions {
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
   /** The members' settings: whether who leads a train or meetup lets the bot ping them. */
-  users?: { get(snowflake: string): Promise<UserSettings> };
+  users?: UserSettingsReader;
   settings: Settings;
   log: Logger;
   now?: () => number;
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -1,7 +1,7 @@
 import type { Settings } from '../config/settings.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
-import type { UserSettings } from '../db/repositories/user-repository.js';
+import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import {
   isMissingPermission,
   isRefusedBody,
@@ -54,6 +54,7 @@ import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { KeyedLock } from './keyed-lock.js';
 import { PartyMirrors } from './party-mirrors.js';
+import { settingsOf } from './party-change.js';
 import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
@@ -178,7 +179,7 @@ export interface PartyServiceOptions {
   gameData: GameDataProvider;
   raidEvents: RaidEventProvider;
   /** The members' settings: who lets the bot ping them. Without it nobody is pinged. */
-  users?: { get(snowflake: string): Promise<UserSettings> };
+  users?: UserSettingsReader;
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -756,8 +757,8 @@ export class PartyService {
   private async pingable(ids: readonly string[]): Promise<string[]> {
     const { users } = this.options;
     if (!users) return [];
-    const settings = await Promise.all(ids.map((id) => users.get(id).catch(() => undefined)));
-    return ids.filter((_id, index) => settings[index]?.mentions === true);
+    const settings = await settingsOf(users, ids, this.options.log);
+    return ids.filter((id) => settings.get(id)?.mentions === true);
   }
 
   /**
```

Apply to `src/services/timed-party-service.ts`:

```diff
--- a/src/services/timed-party-service.ts
+++ b/src/services/timed-party-service.ts
@@ -1,4 +1,4 @@
-import type { UserSettings } from '../db/repositories/user-repository.js';
+import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import { noteMember } from '../domain/party/attendance.js';
 import {
@@ -19,7 +19,7 @@ import type { Logger } from '../log.js';
 import { clockOrDay, LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import { Gathered } from './gathered.js';
-import { storedChange } from './party-change.js';
+import { settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -41,7 +41,7 @@ export interface TimedPartyServiceOptions {
   /** Where the lines go that ping nobody. */
   lines: Pick<PartyLines, 'say'>;
   /** The members' settings: who lets the bot ping them. */
-  users: { get(snowflake: string): Promise<UserSettings> };
+  users: UserSettingsReader;
   log: Logger;
   /** IANA zone in which "today" is judged when a time is named (`settings.timezone`). */
   zone: string;
@@ -196,11 +196,11 @@ export class TimedPartyService {
       party,
       (attendee, id) => id !== by.id && attendee.status !== PartyStatus.Complete,
     );
-    const settings = await Promise.all(others.map((id) => users.get(id).catch(() => undefined)));
+    const settings = await settingsOf(users, others, this.options.log);
     // The setting of a raid's meeting times: it is the same kind of news.
     const pingable = others
-      .filter((_id, index) => {
-        const found = settings[index];
+      .filter((id) => {
+        const found = settings.get(id);
         return found !== undefined && found.mentions && found.mentionsGroups;
       })
       .slice(0, LIMITS.pings);
```

Apply to `src/services/train-service.ts`:

```diff
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -1,5 +1,5 @@
 import type { SavedRoute, SavedRouteStorage } from '../db/repositories/saved-route-repository.js';
-import type { UserSettings } from '../db/repositories/user-repository.js';
+import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import { noteMember } from '../domain/party/attendance.js';
 import {
@@ -34,7 +34,7 @@ import { count, LIMITS, memberText, plain, withMentions } from '../render/text.j
 import { movementText, type Movement } from '../render/train-panel.js';
 import type { Member } from './attendance-service.js';
 import { Gathered } from './gathered.js';
-import { storedChange } from './party-change.js';
+import { settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 import type { RegionProvider } from './region-directory.js';
@@ -57,7 +57,7 @@ export interface TrainServiceOptions {
   /** Where the lines go that ping nobody. */
   lines: Pick<PartyLines, 'say'>;
   /** The members' settings: who lets the bot ping them when the train moves. */
-  users: { get(snowflake: string): Promise<UserSettings> };
+  users: UserSettingsReader;
   /** The gyms, to name the stops, and the region channels each lies in. */
   gyms: { get(id: number): PostGym | undefined; regionsOf(gymId: number): string[] };
   /** The regions, to tell the gyms of the server of a train from those of another. */
@@ -521,10 +521,10 @@ export class TrainService {
     const movement = this.movement(party, pending);
     if (!movement) return;
     const others = membersWhere(party, (_attendee, id) => id !== pending.by.id);
-    const settings = await Promise.all(others.map((id) => users.get(id).catch(() => undefined)));
+    const settings = await settingsOf(users, others, this.options.log);
     const pingable = others
-      .filter((_id, index) => {
-        const found = settings[index];
+      .filter((id) => {
+        const found = settings.get(id);
         return found !== undefined && found.mentions && found.mentionsTrainStops;
       })
       .slice(0, LIMITS.pings);
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/meetups/meetup.test.ts src/commands/parties/shout.test.ts src/commands/raids/raid.test.ts src/commands/trains/train.test.ts src/services/attendance-service.test.ts src/services/timed-party-service.test.ts src/services/train-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/user-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/user-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff bd79284 -- src test   # must print nothing
npx prettier --check src/app-context.ts src/commands/meetups/meetup.test.ts src/commands/parties/shout.test.ts src/commands/raids/raid.test.ts src/commands/trains/train.test.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/services/attendance-service.test.ts src/services/attendance-service.ts src/services/party-change.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts src/services/train-service.test.ts src/services/train-service.ts test/support/party-service.ts test/support/test-context.ts test/support/users.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/commands/meetups/meetup.test.ts src/commands/parties/shout.test.ts src/commands/raids/raid.test.ts src/commands/trains/train.test.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/services/attendance-service.test.ts src/services/attendance-service.ts src/services/party-change.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts src/services/train-service.test.ts src/services/train-service.ts test/support/party-service.ts test/support/test-context.ts test/support/users.ts
git commit -m "Member settings are read in batches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,645 unit tests.

---

### Task 2: The settings command

**Files:**
- Create: `src/commands/settings/settings.test.ts`, `src/commands/settings/settings.ts`
- Modify: `src/commands/index.ts`

**Interfaces:**
- Consumes: Task 1's `ctx.users`; `commandGroup`; `PartyStatus`, `RaidPrivacy` and how `/raid` reads `autoStatus` and `raidPrivacy`; `truncate`, `plain`.
- Produces: `/settings` with the parts `show`, `mentions`, `mentions-groups`, `mentions-shouts`, `mentions-train-stops`, `boss-set`, `new-train`, `auto-status`, `privacy` (`src/commands/settings/settings.ts`), offered in servers and in the bot's DM, each part throttled 30 per 60 seconds; `settingsLines(settings)` for the list.

`boss-set` and `new-train` add a sentence where `settings.features.notifications` is off. Legacy values of the friend code and the in-game name are cut to 60 characters before they are shown.

Reference commit of the prototype for this task: `d4a8b7e`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/settings/settings.test.ts`:

```ts
import { InteractionContextType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { ALICE } from '../../../test/support/parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { declaredSubcommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
import { settings, settingsLines } from './settings.js';

function setup() {
  const users = new MemoryUsers();
  const { ctx } = createTestContext({ users });
  const router = new InteractionRouter(ctx, [settings], []);
  const run = async (
    subcommand: string,
    options: Record<string, string | boolean> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName: 'settings',
      subcommand,
      userId: ALICE,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered. */
  const answer = async (subcommand: string, options: Record<string, string | boolean> = {}) =>
    sent((await run(subcommand, options)).editReply).content;
  return { users, run, answer };
}

describe('/settings', () => {
  it('is offered in servers and in a DM with the bot, with every subcommand of the spec', () => {
    const json = settings.data.toJSON();
    expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
    expect(declaredSubcommands(json.options)).toEqual([
      'show',
      'mentions',
      'mentions-groups',
      'mentions-shouts',
      'mentions-train-stops',
      'boss-set',
      'new-train',
      'auto-status',
      'privacy',
    ]);
    expect(settings.help.category).toBe('notifications');
    for (const handler of settings.subcommands.values()) {
      expect(handler.help?.details).toBeTruthy();
      expect(handler.help?.examples?.length).toBeGreaterThan(0);
    }
  });

  it('answers the member alone', async () => {
    const made = setup();
    const used = await made.run('mentions', { enabled: false });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });

  it.each([
    ['mentions', 'mentions'],
    ['mentions-groups', 'mentionsGroups'],
    ['mentions-shouts', 'mentionsShouts'],
    ['mentions-train-stops', 'mentionsTrainStops'],
    ['boss-set', 'bossSetNotification'],
    ['new-train', 'newTrainNotification'],
  ] as const)('%s writes the setting the party code reads', async (subcommand, field) => {
    const made = setup();
    const off = await made.answer(subcommand, { enabled: false });
    expect((await made.users.get(ALICE))[field]).toBe(false);
    expect(off).toMatch(/no longer/);
    const on = await made.answer(subcommand, { enabled: true });
    expect((await made.users.get(ALICE))[field]).toBe(true);
    expect(on).toMatch(/^You will /);
    expect(on).not.toMatch(/no longer/);
    // Setting what is set already answers the same sentence.
    expect(await made.answer(subcommand, { enabled: true })).toBe(on);
  });

  it('says what each switch means now', async () => {
    const made = setup();
    expect(await made.answer('mentions-shouts', { enabled: true })).toBe(
      'You will be pinged by `/shout` where you are signed up.',
    );
    expect(await made.answer('mentions-shouts', { enabled: false })).toBe(
      'You will no longer be pinged by `/shout`.',
    );
    expect(await made.answer('boss-set', { enabled: true })).toBe(
      'You will get a DM when an egg you are signed up for gets its boss.',
    );
  });

  it('says that the master switch keeps a kind of ping quiet', async () => {
    const made = setup();
    await made.run('mentions', { enabled: false });
    for (const subcommand of ['mentions-groups', 'mentions-shouts', 'mentions-train-stops']) {
      const on = await made.answer(subcommand, { enabled: true });
      expect(on).toContain('All pings are switched off for you, though');
      expect(on).toContain('`/settings mentions enabled:True`');
      // Switching it off needs no such warning.
      expect(await made.answer(subcommand, { enabled: false })).not.toContain('though');
    }
    // A direct message is no ping in a post.
    expect(await made.answer('boss-set', { enabled: true })).not.toContain('though');
    expect(await made.answer('new-train', { enabled: true })).not.toContain('though');
    await made.run('mentions', { enabled: true });
    expect(await made.answer('mentions-shouts', { enabled: true })).not.toContain('though');
  });

  it('allows thirty changes a minute', async () => {
    const made = setup();
    for (let use = 0; use < 30; use++) await made.run('mentions', { enabled: use % 2 === 0 });
    const next = await made.run('mentions', { enabled: true });
    expect(sent(next.reply).content).toMatch(/^You can use \/settings mentions again in /);
    // Looking is not limited.
    expect(await made.answer('show')).toContain('**Your settings**');
  });

  it('sets the status of whoever reports a raid', async () => {
    const made = setup();
    expect(await made.answer('auto-status', { status: 'coming' })).toBe(
      'When you report a raid, you are signed up for it as coming.',
    );
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Coming);
    await made.run('auto-status', { status: 'here' });
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Present);
    await made.run('auto-status', { status: 'interested' });
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.Interested);
    expect(await made.answer('auto-status', { status: 'none' })).toBe(
      'When you report a raid, you are not signed up for it.',
    );
    expect((await made.users.get(ALICE)).autoStatus).toBe(PartyStatus.NotInterested);
  });

  it('sets whether a raid report names its reporter', async () => {
    const made = setup();
    expect(await made.answer('privacy', { visibility: 'anonymous' })).toBe(
      'The post of a raid you report does not say who reported it.',
    );
    expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Anonymous);
    expect(await made.answer('privacy', { visibility: 'visible' })).toBe(
      'The post of a raid you report names you as its reporter.',
    );
    expect((await made.users.get(ALICE)).raidPrivacy).toBe(RaidPrivacy.Visible);
  });

  it('offers the statuses and visibilities as choices', () => {
    const options = settings.data.toJSON().options ?? [];
    const choicesOf = (name: string) => {
      const sub = options.find((option) => option.name === name);
      const [option] = sub && 'options' in sub ? (sub.options ?? []) : [];
      return option && 'choices' in option ? option.choices?.map((choice) => choice.name) : [];
    };
    expect(choicesOf('auto-status')).toEqual(['Interested', 'Coming', 'Here', 'None']);
    expect(choicesOf('privacy')).toEqual(['Visible', 'Anonymous']);
  });

  it('works in a DM with the bot', async () => {
    const made = setup();
    const used = await made.run('mentions', { enabled: false }, { isDm: true });
    expect(sent(used.editReply).content).toMatch(/no longer/);
    expect((await made.users.get(ALICE)).mentions).toBe(false);
  });
});

describe('/settings show', () => {
  it('lists everything with the subcommand that changes it', async () => {
    const made = setup();
    expect(await made.answer('show')).toBe(
      [
        '**Your settings**',
        '- Pings in posts: **on** · `/settings mentions`',
        '- Pings for groups and times: **on** · `/settings mentions-groups`',
        '- Pings for shouts: **on** · `/settings mentions-shouts`',
        '- Pings when a train moves: **on** · `/settings mentions-train-stops`',
        '- DM when an egg gets its boss: **off** · `/settings boss-set`',
        '- DM for a new train: **off** · `/settings new-train`',
        '- Status when you report a raid: **Interested** · `/settings auto-status`',
        '- Raid reports: **Visible** · `/settings privacy`',
      ].join('\n'),
    );
  });

  it('shows what was changed, and what the master switch keeps quiet', async () => {
    const made = setup();
    await made.run('mentions', { enabled: false });
    await made.run('mentions-shouts', { enabled: false });
    await made.run('auto-status', { status: 'none' });
    await made.run('privacy', { visibility: 'anonymous' });
    const shown = await made.answer('show');
    expect(shown).toContain('- Pings in posts: **off** · `/settings mentions`');
    expect(shown).toContain(
      '- Pings for groups and times: **on** (quiet while all pings are off) · `/settings mentions-groups`',
    );
    expect(shown).toContain('- Pings for shouts: **off** · `/settings mentions-shouts`');
    expect(shown).toContain('- Status when you report a raid: **None**');
    expect(shown).toContain('- Raid reports: **Anonymous**');
  });

  it('shows the friend code and the in-game name when they are set, as plain text', () => {
    const lines = settingsLines({
      snowflake: ALICE,
      ...DEFAULT_USER_SETTINGS,
      friendCode: '1234 5678 9012',
      nickname: '**Bold_one**',
    });
    expect(lines).toContain('Friend code: **1234 5678 9012** · `/friend-code register`');
    expect(lines).toContain('In-game name: **\\*\\*Bold\\_one\\*\\*** · `/nickname register`');
    const none = settingsLines({ snowflake: ALICE, ...DEFAULT_USER_SETTINGS, nickname: ' ' });
    expect(none.join('\n')).not.toMatch(/Friend code|In-game name/);
  });

  it('cuts a long legacy value, so the overview fits a message whatever is stored', () => {
    const long = '*_~`|>'.repeat(43).slice(0, 255);
    const lines = settingsLines({
      snowflake: ALICE,
      ...DEFAULT_USER_SETTINGS,
      mentions: false,
      friendCode: long,
      nickname: long,
    });
    const shown = ['**Your settings**', ...lines.map((line) => `- ${line}`)].join('\n');
    // With the two lines of the lists, which are short, far below Discord's 2,000.
    expect(shown.length).toBeLessThan(1_500);
    expect(lines.filter((line) => line.includes('…'))).toHaveLength(2);
  });

  it('calls a stored status that signs nobody up None', () => {
    const lines = settingsLines({
      snowflake: ALICE,
      ...DEFAULT_USER_SETTINGS,
      autoStatus: PartyStatus.Complete,
    });
    expect(lines).toContain('Status when you report a raid: **None** · `/settings auto-status`');
  });
});
```

Run: `npx vitest run --project unit src/commands/settings/settings.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -13,6 +13,7 @@ import { boss, moveset } from './raids/boss.js';
 import { location } from './raids/location.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
+import { settings } from './settings/settings.js';
 import { conductor } from './trains/conductor.js';
 import { finish, next, previous, skip } from './trains/move.js';
 import { route } from './trains/route.js';
@@ -54,5 +55,6 @@ export const commands: readonly CommandModule[] = [
   previous,
   skip,
   finish,
+  settings,
   admin,
 ];
```

Create `src/commands/settings/settings.ts`:

```ts
import {
  InteractionContextType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { UserSettings } from '../../db/repositories/user-repository.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import type { Throttle } from '../../discord/throttle.js';
import { plain, truncate } from '../../render/text.js';

/** The settings that are switched on or off, as `UserSettings` names them. */
type Flag =
  | 'mentions'
  | 'mentionsGroups'
  | 'mentionsShouts'
  | 'mentionsTrainStops'
  | 'bossSetNotification'
  | 'newTrainNotification';

interface FlagSetting {
  /** The subcommand: `/settings <name> enabled:<True|False>`. */
  name: string;
  flag: Flag;
  description: string;
  /** What `/settings show` calls it. */
  label: string;
  /** What the member is told it means now. */
  on: string;
  off: string;
  details: string;
  /** Whether `mentions`, the switch for all pings, also has to be on for this to do anything. */
  underMentions: boolean;
  /** Whether it is about a direct message, which a bot with notifications switched off never sends. */
  dm: boolean;
}

const FLAGS: readonly FlagSetting[] = [
  {
    name: 'mentions',
    flag: 'mentions',
    description: 'Whether I may ping you in the posts of raids, trains and meetups at all',
    label: 'Pings in posts',
    on: 'You will be pinged in the posts of raids, trains and meetups you are signed up for.',
    off:
      'You will no longer be pinged in the posts of raids, trains and meetups, whatever your ' +
      'other mention settings say.',
    details:
      'The switch for every ping in a post: shouts, new groups and meeting times, the moves of ' +
      'a train, the question whether you have completed a raid. While it is off none of them ' +
      'pings you; the messages are still written in the post.',
    underMentions: false,
    dm: false,
  },
  {
    name: 'mentions-groups',
    flag: 'mentionsGroups',
    description: 'Whether I ping you about new groups and meeting times',
    label: 'Pings for groups and times',
    on: 'You will be pinged about new groups and meeting or start times where you are signed up.',
    off: 'You will no longer be pinged when a group is made or a meeting or start time is set.',
    details:
      'Pings in the post of a raid, train or meetup you are signed up for when somebody makes ' +
      'a new group or sets, moves or cancels a time to meet.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'mentions-shouts',
    flag: 'mentionsShouts',
    description: 'Whether /shout pings you',
    label: 'Pings for shouts',
    on: 'You will be pinged by `/shout` where you are signed up.',
    off: 'You will no longer be pinged by `/shout`.',
    details: 'Pings by `/shout` in the post of a raid, train or meetup you are signed up for.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'mentions-train-stops',
    flag: 'mentionsTrainStops',
    description: 'Whether I ping you when a train you are on moves',
    label: 'Pings when a train moves',
    on: 'You will be pinged when a train you are signed up for moves on.',
    off: 'You will no longer be pinged when a train moves on.',
    details: 'Pings in the post of a train you are signed up for when it moves to another stop.',
    underMentions: true,
    dm: false,
  },
  {
    name: 'boss-set',
    flag: 'bossSetNotification',
    description: 'Whether I send you a DM when an egg you signed up for gets its boss',
    label: 'DM when an egg gets its boss',
    on: 'You will get a DM when an egg you are signed up for gets its boss.',
    off: 'You will no longer get a DM when an egg you are signed up for gets its boss.',
    details: 'A direct message when the boss of an egg you are signed up for becomes known.',
    underMentions: false,
    dm: true,
  },
  {
    name: 'new-train',
    flag: 'newTrainNotification',
    description: 'Whether I send you a DM when a train is announced',
    label: 'DM for a new train',
    on: 'You will get a DM when a train is announced in a region you can see.',
    off: 'You will no longer get a DM when a train is announced.',
    details: 'A direct message when somebody announces a raid train in a region you can see.',
    underMentions: false,
    dm: true,
  },
];

/** How often one member may change a setting: each use writes to the database. */
const SETTINGS_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };

/** As much of a text a member registered as the overview shows: a legacy value may be long. */
const SHOWN_VALUE = 60;

/** What is added when a direct message is switched on where this bot sends none. */
const NOTIFICATIONS_OFF =
  ' Notifications are switched off on this bot, though, so no such DM is sent for now.';

/** What is added when a kind of ping is on while all pings are off. */
const MENTIONS_OFF =
  ' All pings are switched off for you, though: nothing pings you until ' +
  '`/settings mentions enabled:True`.';

const AUTO_STATUS = [
  {
    value: 'interested',
    name: 'Interested',
    status: PartyStatus.Interested,
    says: 'When you report a raid, you are signed up for it as interested.',
  },
  {
    value: 'coming',
    name: 'Coming',
    status: PartyStatus.Coming,
    says: 'When you report a raid, you are signed up for it as coming.',
  },
  {
    value: 'here',
    name: 'Here',
    status: PartyStatus.Present,
    says: 'When you report a raid, you are signed up for it as here.',
  },
  {
    value: 'none',
    name: 'None',
    status: PartyStatus.NotInterested,
    says: 'When you report a raid, you are not signed up for it.',
  },
] as const;

const PRIVACY = [
  {
    value: 'visible',
    name: 'Visible',
    privacy: RaidPrivacy.Visible,
    says: 'The post of a raid you report names you as its reporter.',
  },
  {
    value: 'anonymous',
    name: 'Anonymous',
    privacy: RaidPrivacy.Anonymous,
    says: 'The post of a raid you report does not say who reported it.',
  },
] as const;

/** The auto status as the choices name it; whatever signs nobody up is `None`. */
function autoStatusName(status: PartyStatus): string {
  return AUTO_STATUS.find((choice) => choice.status === status)?.name ?? 'None';
}

/** Everything a member has set, each line with the command that changes it. */
export function settingsLines(settings: UserSettings): string[] {
  const onOff = (value: boolean): string => (value ? 'on' : 'off');
  const lines = FLAGS.map((setting) => {
    const quiet = setting.underMentions && settings[setting.flag] && !settings.mentions;
    return (
      `${setting.label}: **${onOff(settings[setting.flag])}**` +
      `${quiet ? ' (quiet while all pings are off)' : ''} · \`/settings ${setting.name}\``
    );
  });
  lines.push(
    `Status when you report a raid: **${autoStatusName(settings.autoStatus)}** · \`/settings auto-status\``,
    `Raid reports: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}** · \`/settings privacy\``,
  );
  // What a member registered is their own text: shown plain, and only when there is any.
  const friendCode = settings.friendCode?.trim() ?? '';
  if (friendCode !== '') {
    lines.push(
      `Friend code: **${plain(truncate(friendCode, SHOWN_VALUE))}** · \`/friend-code register\``,
    );
  }
  const nickname = settings.nickname?.trim() ?? '';
  if (nickname !== '') {
    lines.push(
      `In-game name: **${plain(truncate(nickname, SHOWN_VALUE))}** · \`/nickname register\``,
    );
  }
  return lines;
}

const show: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('Show everything you have set, and the command that changes each'),
  help: {
    details:
      'Lists your settings for pings and direct messages, the status you get when you report ' +
      'a raid, whether your reports name you, and your friend code and in-game name when ' +
      'you registered them.',
    examples: ['/settings show'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const settings = await ctx.users.get(interaction.user.id);
    const lines = settingsLines(settings);
    await interaction.editReply({
      content: `**Your settings**\n${lines.map((line) => `- ${line}`).join('\n')}`,
    });
  },
};

function flagPart(setting: FlagSetting): SubcommandPart {
  return {
    data: new SlashCommandSubcommandBuilder()
      .setName(setting.name)
      .setDescription(setting.description)
      .addBooleanOption((option) =>
        option.setName('enabled').setDescription('True switches it on').setRequired(true),
      ),
    help: {
      details: setting.underMentions
        ? `${setting.details} It only pings while \`/settings mentions\` is on as well.`
        : setting.details,
      examples: [
        `/settings ${setting.name} enabled:True`,
        `/settings ${setting.name} enabled:False`,
      ],
    },
    defer: 'ephemeral',
    throttle: SETTINGS_THROTTLE,
    async execute(interaction, ctx) {
      const enabled = interaction.options.getBoolean('enabled', true);
      const memberId = interaction.user.id;
      await ctx.users.update(memberId, { [setting.flag]: enabled });
      let content = enabled ? setting.on : setting.off;
      // Read after the write: the master switch as it is now.
      if (enabled && setting.underMentions && !(await ctx.users.get(memberId)).mentions) {
        content += MENTIONS_OFF;
      }
      if (enabled && setting.dm && !ctx.config.settings.features.notifications) {
        content += NOTIFICATIONS_OFF;
      }
      await interaction.editReply({ content });
    },
  };
}

const autoStatus: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('auto-status')
    .setDescription('The status you get in a raid you report yourself')
    .addStringOption((option) =>
      option
        .setName('status')
        .setDescription('How you are signed up for a raid you report')
        .setRequired(true)
        .addChoices(AUTO_STATUS.map(({ name, value }) => ({ name, value }))),
    ),
  help: {
    details:
      'Whoever reports a raid with `/raid` is signed up for it at once. This sets as what: ' +
      'interested, coming, here, or (None) not at all.',
    examples: ['/settings auto-status status:Coming', '/settings auto-status status:None'],
  },
  defer: 'ephemeral',
  throttle: SETTINGS_THROTTLE,
  async execute(interaction, ctx) {
    const value = interaction.options.getString('status', true);
    // Discord only sends one of the choices; anything else is the first of them.
    const choice = AUTO_STATUS.find((status) => status.value === value) ?? AUTO_STATUS[0];
    await ctx.users.update(interaction.user.id, { autoStatus: choice.status });
    await interaction.editReply({ content: choice.says });
  },
};

const privacy: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('privacy')
    .setDescription('Whether the post of a raid you report names you')
    .addStringOption((option) =>
      option
        .setName('visibility')
        .setDescription('Visible names you as the reporter; Anonymous does not')
        .setRequired(true)
        .addChoices(PRIVACY.map(({ name, value }) => ({ name, value }))),
    ),
  help: {
    details:
      'The post of a raid says who reported it, unless you choose Anonymous. It is about ' +
      'raids you report from then on; a train or a meetup always names who made it.',
    examples: ['/settings privacy visibility:Anonymous', '/settings privacy visibility:Visible'],
  },
  defer: 'ephemeral',
  throttle: SETTINGS_THROTTLE,
  async execute(interaction, ctx) {
    const value = interaction.options.getString('visibility', true);
    const choice = PRIVACY.find((entry) => entry.value === value) ?? PRIVACY[0];
    await ctx.users.update(interaction.user.id, { raidPrivacy: choice.privacy });
    await interaction.editReply({ content: choice.says });
  },
};

/**
 * `/settings` (spec 4.2): what a member sets for themself. Every answer is for the member
 * alone, it works in any channel and in a DM with the bot, and nothing is sent to anybody else.
 * The party code reads these settings where it pings or signs somebody up.
 */
export const settings = commandGroup({
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Your own settings: pings, direct messages, raid reports')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'notifications',
    details:
      'What Professor Pine does for you in particular: whether it pings you in posts, which ' +
      'direct messages it sends you, and how you appear in a raid you report. ' +
      '`/settings show` lists it all. Nobody else sees your answers.',
    examples: ['/settings show', '/settings mentions enabled:False'],
  },
  parts: [show, ...FLAGS.map(flagPart), autoStatus, privacy],
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/settings/settings.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff d4a8b7e -- src test   # must print nothing
npx prettier --check src/commands/index.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/index.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts
git commit -m "The settings command: pings, direct messages, auto status, privacy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,665 unit tests.

---

### Task 3: Wants: the scope in effect, tokens, typed targets, and their repository

**Files:**
- Create: `src/db/repositories/member-rows.ts`, `src/db/repositories/pokemon-notification-repository.db.test.ts`, `src/db/repositories/pokemon-notification-repository.ts`, `src/domain/pogo/wants.test.ts`, `src/domain/pogo/wants.ts`, `test/support/wants.test.ts`, `test/support/wants.ts`
- Modify: `src/domain/pogo/notification-target.ts`

**Interfaces:**
- Consumes: The codec of `src/domain/pogo/notification-target.ts` (`decodeNotification`, `encodeNotification`, `parseNotificationScope`); `matchNamed`; the catalogue and `CURATED_NICKNAMES`; `inTransaction`; `GuildRepository`, `UserRepository.ensure`; `SavedRouteRepository` as the model of a repository with a member lock.
- Produces: In the codec: `readNotification` (target and scope in effect), `notificationTiers`, `isNotificationTier`, `sameNotificationTarget`, `widerScope`. `src/domain/pogo/wants.ts`: the token codec (`wantToken`, `parseWantToken`), `wantWord` (a tier or IV word in full) and `wantWordGuesses`, `readWantText`, `readWants`, `planSetWant`, `rowsOfWant`. `src/db/repositories/member-rows.ts`: `withMemberLocked`, `findMemberInGuild`. `PokemonNotificationRepository` behind the interface `WantStorage` (`list`, `set`, `remove`, `removeAll`, `count`); `MemoryWants` in `test/support/wants.ts`.

`wants.test.ts` holds the sweep over every prefix of every name of the catalogue. The repository's db test and the twin's unit test run one script against both. Nothing uses the repository yet.

Reference commit of the prototype for this task: `25c8cce`.

- [ ] **Step 1: Write the failing tests**

Create `src/db/repositories/pokemon-notification-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemoryWants } from '../../../test/support/wants.js';
import type { NotificationTarget } from '../../domain/pogo/notification-target.js';
import type { RaidLevel } from '../../domain/pogo/raid-tier.js';
import type { DB } from '../types.js';
import {
  PokemonNotificationRepository,
  type WantStorage,
} from './pokemon-notification-repository.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

const species = (dex: number): NotificationTarget => ({ kind: 'pokemon', dex });
const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };

describe('PokemonNotificationRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let wants: PokemonNotificationRepository;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    wants = new PokemonNotificationRepository(db);
    users = new UserRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('PokemonNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  /** A row as the legacy bot may have left it. */
  const legacyRow = async (member: string, guildId: number, pokemon: number | null, type: string) =>
    db
      .insertInto('PokemonNotification')
      .values({ userId: await users.ensure(member), guildId, pokemon, type })
      .execute();
  const stored = () =>
    db
      .selectFrom('PokemonNotification')
      .select(['pokemon', 'type', 'userId', 'guildId'])
      .orderBy('id')
      .execute();

  it('has nothing for a member without a row, and creates none by reading', async () => {
    expect(await wants.list(ALICE, HOME)).toEqual({ wants: [], unreadable: 0 });
    expect(await wants.count(ALICE, HOME)).toBe(0);
    expect(await wants.remove(ALICE, HOME, species(150))).toBe(false);
    expect(await wants.removeAll(ALICE, HOME)).toBe(0);
    expect(await users.idFor(ALICE)).toBeUndefined();
    // Nor for a server the bot has no row for.
    expect(await wants.list(ALICE, '499999999999999999')).toEqual({ wants: [], unreadable: 0 });
  });

  it('sets a want as the codec writes it, and gives the member their row', async () => {
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toEqual({
      kind: 'added',
      want: { target: species(150), scope: 'both' },
    });
    expect(await wants.set(ALICE, HOME, tier('T5', true), 'both')).toEqual({
      kind: 'added',
      want: { target: tier('T5', true), scope: 'raid' },
    });
    expect(await wants.set(ALICE, HOME, PERFECT, 'raid')).toEqual({
      kind: 'added',
      want: { target: PERFECT, scope: 'spawn' },
    });
    const userId = await users.idFor(ALICE);
    expect(userId).toBeDefined();
    expect(await stored()).toEqual([
      { pokemon: 150, type: 'both', userId, guildId: 1 },
      { pokemon: -35, type: 'raid', userId, guildId: 1 },
      { pokemon: -6, type: 'spawn', userId, guildId: 1 },
    ]);
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: tier('T5', true), scope: 'raid' },
        { target: PERFECT, scope: 'spawn' },
      ],
      unreadable: 0,
    });
    expect(await wants.count(ALICE, HOME)).toBe(3);
  });

  it('keeps the settings of a member who has a row already', async () => {
    await users.update(ALICE, { mentions: false });
    const id = await users.idFor(ALICE);
    await wants.set(ALICE, HOME, species(150), 'raid');
    expect(await users.idFor(ALICE)).toBe(id);
    expect((await users.get(ALICE)).mentions).toBe(false);
  });

  it('changes the scope of a want that exists, in one row', async () => {
    await wants.set(ALICE, HOME, species(150), 'raid');
    expect(await wants.set(ALICE, HOME, species(150), 'spawn')).toEqual({
      kind: 'changed',
      want: { target: species(150), scope: 'spawn' },
      before: 'raid',
    });
    expect(await wants.set(ALICE, HOME, species(150), 'spawn')).toEqual({
      kind: 'unchanged',
      want: { target: species(150), scope: 'spawn' },
    });
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([[150, 'spawn']]);
  });

  it('keeps wants apart by member and by server', async () => {
    await wants.set(ALICE, HOME, species(150), 'raid');
    await wants.set(ALICE, AWAY, species(150), 'spawn');
    await wants.set(BOB, HOME, species(151), 'both');
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: species(150), scope: 'raid' },
    ]);
    expect((await wants.list(ALICE, AWAY)).wants).toEqual([
      { target: species(150), scope: 'spawn' },
    ]);
    expect((await wants.list(BOB, HOME)).wants).toEqual([{ target: species(151), scope: 'both' }]);
    expect(await wants.remove(BOB, HOME, species(150))).toBe(false);
    expect(await wants.remove(ALICE, AWAY, species(150))).toBe(true);
    expect((await wants.list(ALICE, HOME)).wants).toHaveLength(1);
    expect(await stored()).toHaveLength(2);
  });

  it('reads legacy rows: any letter case, the wants of 2019, and what it cannot read', async () => {
    await legacyRow(ALICE, 1, 150, 'Both');
    await legacyRow(ALICE, 1, -5, 'Raid');
    await legacyRow(ALICE, 1, -6, 'both');
    await legacyRow(ALICE, 1, -8, 'both');
    await legacyRow(ALICE, 1, -7, 'spawn');
    await legacyRow(ALICE, 1, null, 'both');
    await legacyRow(ALICE, 1, 25, 'sometimes');
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: tier('T5'), scope: 'raid' },
        { target: PERFECT, scope: 'spawn' },
        { target: { kind: 'iv', iv: 'zero' }, scope: 'spawn' },
      ],
      unreadable: 3,
    });
    expect(await wants.count(ALICE, HOME)).toBe(7);
    // Setting what a legacy row already says writes nothing.
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toMatchObject({ kind: 'unchanged' });
    expect(await wants.set(ALICE, HOME, PERFECT, 'spawn')).toMatchObject({ kind: 'unchanged' });
    expect((await stored()).map((row) => row.type)).toEqual([
      'Both',
      'Raid',
      'both',
      'both',
      'spawn',
      'both',
      'sometimes',
    ]);
  });

  it('makes one row of several legacy rows for one target when that target is set', async () => {
    await legacyRow(ALICE, 1, 150, 'raid');
    await legacyRow(ALICE, 1, 151, 'raid');
    await legacyRow(ALICE, 1, 150, 'spawn');
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: species(150), scope: 'both' },
      { target: species(151), scope: 'raid' },
    ]);
    expect(await wants.set(ALICE, HOME, species(150), 'spawn')).toEqual({
      kind: 'changed',
      want: { target: species(150), scope: 'spawn' },
      before: 'both',
    });
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([
      [150, 'spawn'],
      [151, 'raid'],
    ]);
  });

  it('removes every row of a target and leaves the rest', async () => {
    await legacyRow(ALICE, 1, 150, 'raid');
    await legacyRow(ALICE, 1, 150, 'Spawn');
    await legacyRow(ALICE, 1, 150, 'sometimes');
    await legacyRow(ALICE, 1, -6, 'both');
    await legacyRow(ALICE, 1, -6, 'raid');
    expect(await wants.remove(ALICE, HOME, species(150))).toBe(true);
    expect(await wants.remove(ALICE, HOME, species(150))).toBe(false);
    // The mega legendary tier and the perfect-IV want share a number and are two wants.
    expect(await wants.remove(ALICE, HOME, tier('MegaLegendary'))).toBe(true);
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([
      [150, 'sometimes'],
      [-6, 'both'],
    ]);
  });

  it('removes all rows of a member in one server, also those it cannot read', async () => {
    await legacyRow(ALICE, 1, 150, 'raid');
    await legacyRow(ALICE, 1, -7, 'spawn');
    await legacyRow(ALICE, 1, null, 'both');
    await legacyRow(ALICE, 2, 151, 'raid');
    await legacyRow(BOB, 1, 150, 'raid');
    // Rows that hang on no member or no server belong to nobody: they stay.
    const alice = await users.ensure(ALICE);
    await db
      .insertInto('PokemonNotification')
      .values([
        { userId: null, guildId: 1, pokemon: 150, type: 'both' },
        { userId: alice, guildId: null, pokemon: 150, type: 'both' },
      ])
      .execute();
    expect(await wants.count(ALICE, HOME)).toBe(3);
    expect(await wants.removeAll(ALICE, HOME)).toBe(3);
    expect(await wants.removeAll(ALICE, HOME)).toBe(0);
    expect((await stored()).map((row) => [row.pokemon, row.guildId])).toEqual([
      [151, 2],
      [150, 1],
      [150, 1],
      [150, null],
    ]);
  });

  it('has no limit on the wants of a member', async () => {
    for (let dex = 1; dex <= 130; dex++) await wants.set(ALICE, HOME, species(dex), 'both');
    expect(await wants.count(ALICE, HOME)).toBe(130);
  });

  it('gives a server its row when it has none', async () => {
    const other = '499999999999999999';
    await wants.set(ALICE, other, species(150), 'raid');
    expect((await wants.list(ALICE, other)).wants).toHaveLength(1);
    const guild = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', other)
      .executeTakeFirst();
    expect(guild).toBeDefined();
  });

  it('makes one row when the same want is set many times at once', async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => wants.set(ALICE, HOME, species(150), 'both')),
    );
    expect(await stored()).toHaveLength(1);
    // Also for a member who had no row before: the first changes wait for each other.
    await Promise.all(Array.from({ length: 8 }, () => wants.set(BOB, HOME, species(150), 'raid')));
    expect(await wants.count(BOB, HOME)).toBe(1);
    expect(await stored()).toHaveLength(2);
  });

  it('lets different members set wants at the same time', async () => {
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234600n + BigInt(index)),
    );
    const outcomes = await Promise.all(
      members.map((member) => wants.set(member, HOME, species(150), 'both')),
    );
    expect(outcomes.every((outcome) => outcome.kind === 'added')).toBe(true);
    expect(await stored()).toHaveLength(12);
  });

  it('lets different members set their first wants at once in a server that has no row yet', async () => {
    const other = '499999999999999998';
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234700n + BigInt(index)),
    );
    const outcomes = await Promise.all(
      members.map((member) => wants.set(member, other, species(150), 'both')),
    );
    expect(outcomes.every((outcome) => outcome.kind === 'added')).toBe(true);
    const guilds = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', other)
      .execute();
    expect(guilds).toHaveLength(1);
    expect((await stored()).every((row) => row.guildId === guilds[0]?.id)).toBe(true);
    expect(await stored()).toHaveLength(12);
  });

  it('adds the mega legendary tier beside a perfect-IV row of 2019 with the same number', async () => {
    await legacyRow(ALICE, 1, -6, 'both');
    expect(await wants.set(ALICE, HOME, tier('MegaLegendary'), 'raid')).toEqual({
      kind: 'added',
      want: { target: tier('MegaLegendary'), scope: 'raid' },
    });
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([
      [-6, 'both'],
      [-6, 'raid'],
    ]);
    expect((await wants.list(ALICE, HOME)).wants).toEqual([
      { target: PERFECT, scope: 'spawn' },
      { target: tier('MegaLegendary'), scope: 'raid' },
    ]);
    // Each is set again without touching the other.
    expect(await wants.set(ALICE, HOME, PERFECT, 'spawn')).toMatchObject({ kind: 'unchanged' });
    expect(await wants.remove(ALICE, HOME, PERFECT)).toBe(true);
    expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([[-6, 'raid']]);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryWants();
    // What the legacy bot may have left: a duplicate, and a row that cannot be read.
    await legacyRow(ALICE, 1, 150, 'Raid');
    await legacyRow(ALICE, 1, 150, 'spawn');
    await legacyRow(ALICE, 1, -7, 'spawn');
    memory.add(ALICE, HOME, 150, 'Raid');
    memory.add(ALICE, HOME, 150, 'spawn');
    memory.add(ALICE, HOME, -7, 'spawn');
    const script = async (storage: WantStorage) => [
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, HOME),
      await storage.set(ALICE, HOME, species(150), 'both'),
      await storage.set(ALICE, HOME, species(150), 'raid'),
      await storage.set(ALICE, HOME, tier('T5'), 'both'),
      await storage.set(ALICE, HOME, PERFECT, 'raid'),
      await storage.set(ALICE, AWAY, species(1), 'spawn'),
      await storage.set(BOB, HOME, species(2), 'both'),
      await storage.list(ALICE, HOME),
      await storage.remove(ALICE, HOME, species(2)),
      await storage.remove(ALICE, HOME, tier('T5')),
      await storage.count(ALICE, HOME),
      await storage.removeAll(ALICE, HOME),
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, AWAY),
      await storage.removeAll(BOB, HOME),
    ];
    expect(await script(wants)).toEqual(await script(memory));
  });
});
```

Create `src/domain/pogo/wants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { pokemonFixture } from '../../../test/support/providers.js';
import {
  encodeNotification,
  isNotificationTier,
  notificationTiers,
  readNotification,
  sameNotificationTarget,
  type NotificationTarget,
} from './notification-target.js';
import { CURATED_NICKNAMES } from './nicknames.js';
import { raidTierLabel, type RaidLevel } from './raid-tier.js';
import {
  parseWantToken,
  planSetWant,
  readWantText,
  readWants,
  rowsOfWant,
  wantToken,
  speciesNameOf,
  wantSpeciesFinder,
  wantWord,
  wantWordGuesses,
} from './wants.js';

const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
  kind: 'tier',
  tier: { level, shadow },
});
const species = (dex: number): NotificationTarget => ({ kind: 'pokemon', dex });
const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
const ZERO: NotificationTarget = { kind: 'iv', iv: 'zero' };

describe('readNotification: the scope in effect', () => {
  it('gives a species the scope of its row, whatever the letter case', () => {
    expect(readNotification({ pokemon: 150, type: 'Raid' })).toEqual({
      target: species(150),
      scope: 'raid',
    });
    expect(readNotification({ pokemon: 150, type: 'BOTH' })?.scope).toBe('both');
    expect(readNotification({ pokemon: 150, type: ' spawn ' })?.scope).toBe('spawn');
  });

  it('gives a tier the scope raid and an IV target the scope spawn, whatever is stored', () => {
    expect(readNotification({ pokemon: -5, type: 'both' })).toEqual({
      target: tier('T5'),
      scope: 'raid',
    });
    // The legacy rows of 2019: a perfect-IV want typed `both`.
    expect(readNotification({ pokemon: -6, type: 'both' })).toEqual({
      target: PERFECT,
      scope: 'spawn',
    });
    expect(readNotification({ pokemon: -8, type: 'raid' })).toEqual({
      target: ZERO,
      scope: 'spawn',
    });
    expect(readNotification({ pokemon: -6, type: 'raid' })).toEqual({
      target: tier('MegaLegendary'),
      scope: 'raid',
    });
  });

  it('is undefined for what the codec cannot read', () => {
    expect(readNotification({ pokemon: -5, type: 'spawn' })).toBeUndefined();
    expect(readNotification({ pokemon: 150, type: 'sometimes' })).toBeUndefined();
    expect(readNotification({ pokemon: 0, type: 'both' })).toBeUndefined();
    expect(readNotification({ pokemon: -99, type: 'raid' })).toBeUndefined();
  });

  it('reads back what the codec writes, with the scope it stored', () => {
    for (const target of [species(1), tier('T5', true), tier('EX'), PERFECT, ZERO]) {
      for (const scope of ['raid', 'spawn', 'both'] as const) {
        const stored = encodeNotification(target, scope);
        expect(readNotification(stored)).toEqual({ target, scope: stored.type });
      }
    }
  });
});

describe('notificationTiers', () => {
  it('lists the tiers with a code: ordinary first, then elite, EX, the shadow tiers', () => {
    expect(notificationTiers().map(raidTierLabel)).toEqual([
      'T1',
      'T3',
      'T5',
      'Mega',
      'Mega Legendary',
      'Super Mega',
      'Elite',
      'EX',
      'Shadow T1',
      'Shadow T3',
      'Shadow T5',
    ]);
    for (const listed of notificationTiers()) {
      expect(isNotificationTier(listed)).toBe(true);
      expect(() => encodeNotification({ kind: 'tier', tier: listed }, 'raid')).not.toThrow();
    }
    expect(isNotificationTier({ level: 'Mega', shadow: true })).toBe(false);
  });
});

describe('sameNotificationTarget', () => {
  it('tells targets apart by what they are for', () => {
    expect(sameNotificationTarget(species(150), species(150))).toBe(true);
    expect(sameNotificationTarget(species(150), species(151))).toBe(false);
    expect(sameNotificationTarget(tier('T5'), tier('T5'))).toBe(true);
    expect(sameNotificationTarget(tier('T5'), tier('T5', true))).toBe(false);
    expect(sameNotificationTarget(PERFECT, ZERO)).toBe(false);
    expect(sameNotificationTarget(PERFECT, tier('MegaLegendary'))).toBe(false);
    expect(sameNotificationTarget(PERFECT, PERFECT)).toBe(true);
  });
});

describe('want tokens', () => {
  it('names every target and is read back', () => {
    const all = [
      species(150),
      species(1025),
      PERFECT,
      ZERO,
      ...notificationTiers().map((listed): NotificationTarget => ({ kind: 'tier', tier: listed })),
    ];
    for (const target of all) expect(parseWantToken(wantToken(target))).toEqual(target);
    expect(wantToken(species(150))).toBe('pokemon:150');
    expect(wantToken(tier('T5'))).toBe('tier:T5');
    expect(wantToken(tier('T5', true))).toBe('tier:T5:shadow');
    expect(wantToken(tier('MegaLegendary'))).toBe('tier:MegaLegendary');
    expect(wantToken(PERFECT)).toBe('iv:perfect');
    expect(wantToken(ZERO)).toBe('iv:zero');
  });

  it('is unique per target', () => {
    const tokens = notificationTiers().map((listed) => wantToken({ kind: 'tier', tier: listed }));
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it.each([
    '',
    'pokemon',
    'pokemon:',
    'pokemon:0',
    'pokemon:-5',
    'pokemon:1.5',
    'pokemon:150:shadow',
    'pokemon:1234567',
    'Pokemon:150',
    'tier:T2',
    'tier:t5',
    'tier:Mega:shadow',
    'tier:T5:Shadow',
    'tier:T5:shadow:x',
    'iv:hundo',
    'iv:perfect:x',
    'mewtwo',
    'e:T5:0',
    'g:12',
  ])('reads %j as no token', (text) => {
    expect(parseWantToken(text)).toBeUndefined();
  });
});

describe('wantWord', () => {
  it.each([
    ['tier 5', tier('T5')],
    ['Tier5', tier('T5')],
    ['t5', tier('T5')],
    ['T 5', tier('T5')],
    ['5', tier('T5')],
    ['level 5', tier('T5')],
    ['5 star', tier('T5')],
    ['5-stars', tier('T5')],
    ['legendary', tier('T5')],
    ['t5 raids', tier('T5')],
    ['tier 5 eggs', tier('T5')],
    ['1', tier('T1')],
    ['tier 3', tier('T3')],
    ['mega', tier('Mega')],
    ['Mega raids', tier('Mega')],
    ['4', tier('Mega')],
    ['mega legendary', tier('MegaLegendary')],
    ['megalegendary', tier('MegaLegendary')],
    ['6', tier('MegaLegendary')],
    ['super mega', tier('SuperMega')],
    ['7', tier('SuperMega')],
    ['elite', tier('Elite')],
    ['ex', tier('EX')],
    ['EX raid', tier('EX')],
    ['exclusive', tier('EX')],
    ['shadow 5', tier('T5', true)],
    ['shadow t5', tier('T5', true)],
    ['Shadow Tier 1', tier('T1', true)],
    ['shadow level 3', tier('T3', true)],
    ['shadow legendary', tier('T5', true)],
    ['perfect', PERFECT],
    ['Perfect IV', PERFECT],
    ['hundo', PERFECT],
    ['100', PERFECT],
    ['100%', PERFECT],
    ['perfect spawns', PERFECT],
    ['zero', ZERO],
    ['none', ZERO],
    ['useless', ZERO],
    ['0', ZERO],
    ['0%', ZERO],
    ['zero iv', ZERO],
  ] as const)('reads %j', (text, target) => {
    expect(wantWord(text)).toEqual(target);
  });

  it.each([
    '',
    'raids',
    'shadow',
    'tier',
    'level',
    '2',
    '8',
    't2',
    'tier 9',
    '55',
    '1000',
    'shadow mega',
    'shadow ex',
    'mewtwo',
    'mega charizard',
    'mega mewtwo y',
    'meganium',
    'zeraora',
    'zorua',
    'persian',
    'elekid',
    'exeggutor',
    'houndour',
    'unown',
    'nosepass',
    'tier 5 mewtwo',
    'pe',
    'no',
    // The beginning or a misspelling of a word is not the word (it may begin a Pokemon's name).
    'perf',
    'perfact',
    'exclusiv',
    'exc',
    'zer',
    'zekro',
    'hun',
    'houndo',
    'mega s',
    'mega l',
    'mega legend',
    'level 50',
    '1000 iv',
  ])('reads %j as no tier or IV word', (text) => {
    expect(wantWord(text)).toBeUndefined();
  });
});

describe('wantWordGuesses', () => {
  it('offers the word a text names in full, alone', () => {
    expect(wantWordGuesses('t5')).toEqual([tier('T5')]);
    expect(wantWordGuesses('hundo')).toEqual([PERFECT]);
  });

  it('offers what a beginning or a misspelling may mean, three at most', () => {
    expect(wantWordGuesses('perf')).toEqual([PERFECT]);
    expect(wantWordGuesses('perfact')).toEqual([PERFECT]);
    expect(wantWordGuesses('exclusiv')).toEqual([tier('EX')]);
    expect(wantWordGuesses('mega l')).toContainEqual(tier('MegaLegendary'));
    expect(wantWordGuesses('shadow').length).toBe(3);
    expect(wantWordGuesses('mewtwo')).toEqual([]);
    expect(wantWordGuesses('')).toEqual([]);
  });
});

describe('wantWord against every Pokemon', () => {
  it('reads no beginning of any name, key or curated nickname as a tier or IV word', () => {
    const catalogue = catalogueFixture();
    const texts = new Set<string>();
    for (const entry of catalogue.all) {
      const names = [
        entry.name,
        entry.key.replace(/_/g, ' '),
        ...(CURATED_NICKNAMES[entry.key] ?? []),
      ];
      for (const name of names) {
        const lower = name.toLowerCase();
        for (let end = 1; end <= lower.length; end++) texts.add(lower.slice(0, end));
      }
    }
    expect(texts.size).toBeGreaterThan(10_000);
    // Only what is a tier's own word in full, which members type for the tier: `mega` begins
    // Meganium and every Mega's name, `ex` begins Exeggcute. A longer beginning is the Pokemon.
    const read = [...texts]
      .filter((text) => wantWord(text) !== undefined)
      .map((text) => text.trim());
    expect([...new Set(read)].sort()).toEqual(['ex', 'mega']);
  });
});

describe('readWantText', () => {
  const catalogue = catalogueFixture();
  const pokemon = pokemonFixture({ catalogue });
  const finder = wantSpeciesFinder(catalogue, pokemon);

  it('takes a token as what it names', () => {
    expect(readWantText('pokemon:150', finder)).toEqual({ kind: 'target', target: species(150) });
    expect(readWantText(' tier:T5:shadow ', finder)).toEqual({
      kind: 'target',
      target: tier('T5', true),
    });
    expect(readWantText('iv:zero', finder)).toEqual({ kind: 'target', target: ZERO });
  });

  it('says that the Pokémon of a token is gone when the game data does not have it', () => {
    expect(readWantText('pokemon:99999', finder)).toEqual({ kind: 'gone' });
  });

  it('reads a tier or IV word before any Pokémon', () => {
    expect(readWantText('t5', finder)).toEqual({ kind: 'target', target: tier('T5') });
    expect(readWantText('hundo', finder)).toEqual({ kind: 'target', target: PERFECT });
    expect(readWantText('none', finder)).toEqual({ kind: 'target', target: ZERO });
  });

  it('takes the species of the Pokémon a text names outright, whatever the form', () => {
    expect(readWantText('Mewtwo', finder)).toEqual({ kind: 'target', target: species(150) });
    expect(readWantText('mega charizard y', finder)).toEqual({
      kind: 'target',
      target: species(6),
    });
    expect(readWantText('alolan rattata', finder)).toEqual({
      kind: 'target',
      target: species(19),
    });
    expect(readWantText('giratina', finder)).toEqual({ kind: 'target', target: species(487) });
  });

  it('finds a species by its name when several of its entries answer to it', () => {
    // The search itself knows no one entry called Unown.
    expect(pokemon.exact('unown')).toBeUndefined();
    expect(readWantText('Unown', finder)).toEqual({ kind: 'target', target: species(201) });
    expect(readWantText('nidoran', finder).kind).toBe('unknown');
  });

  it('never acts on a near miss: it suggests species, each once, five at most', () => {
    const answer = readWantText('mewtw', finder);
    expect(answer.kind).toBe('unknown');
    if (answer.kind !== 'unknown') return;
    expect(answer.suggestions).toContain(150);
    expect(answer.suggestions.length).toBeLessThanOrEqual(5);
    expect(new Set(answer.suggestions).size).toBe(answer.suggestions.length);
    const forms = readWantText('charizar', finder);
    expect(forms).toEqual({ kind: 'unknown', words: [], suggestions: [6] });
  });

  it('acts on neither one letter nor nothing, and suggests nothing for them', () => {
    expect(readWantText('a', finder)).toEqual({ kind: 'unknown', words: [], suggestions: [] });
    expect(readWantText('  ', finder)).toEqual({ kind: 'unknown', words: [], suggestions: [] });
    expect(readWantText('!?', finder)).toEqual({ kind: 'unknown', words: [], suggestions: [] });
  });

  it('offers the tier or IV word a text begins or misspells, and does not act on it', () => {
    expect(readWantText('perf', finder)).toMatchObject({ kind: 'unknown', words: [PERFECT] });
    const zer = readWantText('zer', finder);
    expect(zer).toMatchObject({ kind: 'unknown', words: [ZERO] });
    if (zer.kind === 'unknown') expect(zer.suggestions.length).toBeGreaterThan(0);
  });

  it('reads a want of the member’s own list whatever the game data knows', () => {
    const own = { own: true };
    expect(readWantText('pokemon:99999', finder, own)).toEqual({
      kind: 'target',
      target: species(99999),
    });
    expect(readWantText('Pokémon #99999', finder, own)).toEqual({
      kind: 'target',
      target: species(99999),
    });
    expect(readWantText('Mewtwo (raids and spawns)', finder, own)).toEqual({
      kind: 'target',
      target: species(150),
    });
    expect(readWantText('pikachu (Raids)', finder, own)).toEqual({
      kind: 'target',
      target: species(25),
    });
    expect(readWantText('T5 raids', finder, own)).toEqual({ kind: 'target', target: tier('T5') });
    // Not for a new want: the label of another list means nothing there.
    expect(readWantText('Mewtwo (raids)', finder).kind).toBe('unknown');
    expect(readWantText('Pokémon #99999', finder).kind).toBe('unknown');
  });

  it('does not take a Pokédex number for a Pokémon', () => {
    const answer = readWantText('25', finder);
    expect(answer.kind).toBe('unknown');
  });

  it('suggests nothing for a text no Pokémon is near', () => {
    expect(readWantText('qqqqzzzz', finder)).toEqual({
      kind: 'unknown',
      words: [],
      suggestions: [],
    });
  });
});

describe('speciesNameOf', () => {
  const catalogue = catalogueFixture();

  it('names a species, not the form it is known by', () => {
    expect(speciesNameOf(catalogue, 150)).toBe('Mewtwo');
    expect(speciesNameOf(catalogue, 487)).toBe('Giratina');
    expect(speciesNameOf(catalogue, 720)).toBe('Hoopa');
    expect(speciesNameOf(catalogue, 201)).toBe('Unown');
    expect(speciesNameOf(catalogue, 99999)).toBeUndefined();
  });
});

describe('readWants', () => {
  it('reads each target once, in the order of the rows, and counts what it cannot read', () => {
    expect(
      readWants([
        { pokemon: 150, type: 'Both' },
        { pokemon: -5, type: 'raid' },
        { pokemon: -5, type: 'spawn' },
        { pokemon: -6, type: 'both' },
        { pokemon: 0, type: 'both' },
        { pokemon: 3, type: 'never' },
        { pokemon: -8, type: 'spawn' },
      ]),
    ).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: tier('T5'), scope: 'raid' },
        { target: PERFECT, scope: 'spawn' },
        { target: ZERO, scope: 'spawn' },
      ],
      unreadable: 3,
    });
  });

  it('reads several rows for one species as one want in every scope they have', () => {
    expect(
      readWants([
        { pokemon: 150, type: 'raid' },
        { pokemon: 150, type: 'spawn' },
        { pokemon: 151, type: 'raid' },
        { pokemon: 151, type: 'Raid' },
      ]).wants,
    ).toEqual([
      { target: species(150), scope: 'both' },
      { target: species(151), scope: 'raid' },
    ]);
  });

  it('keeps the two meanings of -6 apart', () => {
    expect(
      readWants([
        { pokemon: -6, type: 'raid' },
        { pokemon: -6, type: 'spawn' },
      ]).wants,
    ).toEqual([
      { target: tier('MegaLegendary'), scope: 'raid' },
      { target: PERFECT, scope: 'spawn' },
    ]);
  });
});

describe('planSetWant', () => {
  it('adds a row for a target that has none', () => {
    expect(planSetWant([{ id: 1, pokemon: 151, type: 'both' }], species(150), 'raid')).toEqual({
      outcome: { kind: 'added', want: { target: species(150), scope: 'raid' } },
      insert: { pokemon: 150, type: 'raid' },
      update: undefined,
      remove: [],
    });
  });

  it('stores a tier as raid and an IV target as spawn, whatever was asked', () => {
    expect(planSetWant([], tier('T5'), 'both')).toMatchObject({
      outcome: { kind: 'added', want: { scope: 'raid' } },
      insert: { pokemon: -5, type: 'raid' },
    });
    expect(planSetWant([], PERFECT, 'raid')).toMatchObject({
      outcome: { kind: 'added', want: { scope: 'spawn' } },
      insert: { pokemon: -6, type: 'spawn' },
    });
  });

  it('changes the scope of the row a target has', () => {
    expect(planSetWant([{ id: 7, pokemon: 150, type: 'Raid' }], species(150), 'both')).toEqual({
      outcome: { kind: 'changed', want: { target: species(150), scope: 'both' }, before: 'raid' },
      insert: undefined,
      update: { id: 7, values: { pokemon: 150, type: 'both' } },
      remove: [],
    });
  });

  it('writes nothing for a row that says the same in other letters', () => {
    expect(planSetWant([{ id: 7, pokemon: 150, type: 'BOTH' }], species(150), 'both')).toEqual({
      outcome: { kind: 'unchanged', want: { target: species(150), scope: 'both' } },
      insert: undefined,
      update: undefined,
      remove: [],
    });
    // The perfect-IV want of 2019, typed `both`.
    expect(planSetWant([{ id: 8, pokemon: -6, type: 'both' }], PERFECT, 'both')).toMatchObject({
      outcome: { kind: 'unchanged' },
      insert: undefined,
      update: undefined,
      remove: [],
    });
  });

  it('keeps the oldest of several rows for one target and removes the others', () => {
    const rows = [
      { id: 9, pokemon: 150, type: 'spawn' },
      { id: 4, pokemon: 150, type: 'raid' },
      { id: 5, pokemon: 151, type: 'raid' },
    ];
    // Together they were a want for both already.
    expect(planSetWant(rows, species(150), 'both')).toEqual({
      outcome: { kind: 'unchanged', want: { target: species(150), scope: 'both' } },
      insert: undefined,
      update: { id: 4, values: { pokemon: 150, type: 'both' } },
      remove: [9],
    });
    expect(planSetWant(rows, species(150), 'raid')).toEqual({
      outcome: { kind: 'changed', want: { target: species(150), scope: 'raid' }, before: 'both' },
      insert: undefined,
      update: undefined,
      remove: [9],
    });
  });

  it('adds the mega legendary tier beside a perfect-IV want with the same number', () => {
    const rows = [{ id: 1, pokemon: -6, type: 'both' }];
    expect(planSetWant(rows, tier('MegaLegendary'), 'raid')).toMatchObject({
      outcome: { kind: 'added' },
      insert: { pokemon: -6, type: 'raid' },
      remove: [],
    });
  });

  it('leaves rows it cannot read alone', () => {
    const rows = [{ id: 1, pokemon: -5, type: 'spawn' }];
    expect(planSetWant(rows, tier('T5'), 'raid')).toMatchObject({
      outcome: { kind: 'added' },
      insert: { pokemon: -5, type: 'raid' },
      update: undefined,
      remove: [],
    });
  });
});

describe('rowsOfWant', () => {
  it('finds every row of a target, and no row that cannot be read', () => {
    const rows = [
      { id: 1, pokemon: 150, type: 'raid' },
      { id: 2, pokemon: 150, type: 'Spawn' },
      { id: 3, pokemon: 150, type: 'whenever' },
      { id: 4, pokemon: -6, type: 'both' },
      { id: 5, pokemon: -6, type: 'raid' },
    ];
    expect(rowsOfWant(rows, species(150))).toEqual([1, 2]);
    expect(rowsOfWant(rows, PERFECT)).toEqual([4]);
    expect(rowsOfWant(rows, tier('MegaLegendary'))).toEqual([5]);
    expect(rowsOfWant(rows, ZERO)).toEqual([]);
  });
});
```

Create `test/support/wants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { NotificationTarget } from '../../src/domain/pogo/notification-target.js';
import { MemoryWants } from './wants.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const species = (dex: number): NotificationTarget => ({ kind: 'pokemon', dex });
const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };

describe('MemoryWants', () => {
  it('keeps wants per member and server, as the repository does', async () => {
    const wants = new MemoryWants();
    expect(await wants.set(ALICE, HOME, species(150), 'raid')).toMatchObject({ kind: 'added' });
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toMatchObject({
      kind: 'changed',
      before: 'raid',
    });
    expect(await wants.set(ALICE, HOME, T5, 'both')).toEqual({
      kind: 'added',
      want: { target: T5, scope: 'raid' },
    });
    await wants.set(ALICE, AWAY, species(1), 'spawn');
    await wants.set(BOB, HOME, species(2), 'spawn');
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: T5, scope: 'raid' },
      ],
      unreadable: 0,
    });
    expect(await wants.remove(ALICE, HOME, species(1))).toBe(false);
    expect(await wants.remove(ALICE, HOME, T5)).toBe(true);
    expect(await wants.count(ALICE, HOME)).toBe(1);
    expect(await wants.count(BOB, HOME)).toBe(1);
  });

  it('holds legacy rows, counts what cannot be read and removes all of a server', async () => {
    const wants = new MemoryWants();
    wants.add(ALICE, HOME, 150, 'Raid');
    wants.add(ALICE, HOME, 150, 'spawn');
    wants.add(ALICE, HOME, -7, 'spawn');
    wants.add(ALICE, AWAY, 151, 'both');
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [{ target: species(150), scope: 'both' }],
      unreadable: 1,
    });
    expect(await wants.count(ALICE, HOME)).toBe(2);
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toMatchObject({ kind: 'unchanged' });
    expect(wants.rows.filter((row) => row.guildId === HOME)).toHaveLength(2);
    expect(await wants.removeAll(ALICE, HOME)).toBe(2);
    expect(wants.rows).toHaveLength(1);
  });

  it('rejects every call while it is failing', async () => {
    const wants = new MemoryWants();
    wants.failing = new Error('the database is away');
    await expect(wants.list(ALICE, HOME)).rejects.toThrow('the database is away');
    await expect(wants.set(ALICE, HOME, T5, 'raid')).rejects.toThrow('the database is away');
  });
});
```

Create `test/support/wants.ts`:

```ts
import type { WantStorage } from '../../src/db/repositories/pokemon-notification-repository.js';
import type {
  NotificationScope,
  NotificationTarget,
} from '../../src/domain/pogo/notification-target.js';
import {
  planSetWant,
  readWants,
  rowsOfWant,
  type SetWantOutcome,
  type WantList,
  type WantRow,
} from '../../src/domain/pogo/wants.js';

interface Row extends WantRow {
  memberId: string;
  guildId: string;
}

/**
 * The wants kept in memory as `PokemonNotificationRepository` keeps them, whose behaviour
 * pokemon-notification-repository.db.test.ts pins down: rows per member and server, read and
 * changed through the same functions of `wants.ts`. `add` puts a row as the legacy bot may have
 * left it. Set `failing` to make every call reject.
 */
export class MemoryWants implements WantStorage {
  failing: Error | undefined;
  readonly rows: Row[] = [];
  private nextId = 1;

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private of(memberId: string, guildId: string): Row[] {
    return this.rows.filter((row) => row.memberId === memberId && row.guildId === guildId);
  }

  private drop(ids: readonly number[]): void {
    for (const id of ids) {
      const index = this.rows.findIndex((row) => row.id === id);
      if (index >= 0) this.rows.splice(index, 1);
    }
  }

  /** A row as it may stand in the table, for a test: any number, any type. */
  add(memberId: string, guildId: string, pokemon: number, type: string): number {
    const id = this.nextId++;
    this.rows.push({ id, memberId, guildId, pokemon, type });
    return id;
  }

  list(memberId: string, guildId: string): Promise<WantList> {
    return this.attempt(() => readWants(this.of(memberId, guildId)));
  }

  count(memberId: string, guildId: string): Promise<number> {
    return this.attempt(() => {
      const { wants, unreadable } = readWants(this.of(memberId, guildId));
      return wants.length + unreadable;
    });
  }

  set(
    memberId: string,
    guildId: string,
    target: NotificationTarget,
    scope: NotificationScope,
  ): Promise<SetWantOutcome> {
    return this.attempt(() => {
      const plan = planSetWant(this.of(memberId, guildId), target, scope);
      if (plan.insert) this.add(memberId, guildId, plan.insert.pokemon, plan.insert.type);
      if (plan.update) {
        const { id, values } = plan.update;
        const row = this.rows.find((found) => found.id === id);
        if (row) Object.assign(row, values);
      }
      this.drop(plan.remove);
      return plan.outcome;
    });
  }

  remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean> {
    return this.attempt(() => {
      const ids = rowsOfWant(this.of(memberId, guildId), target);
      this.drop(ids);
      return ids.length > 0;
    });
  }

  removeAll(memberId: string, guildId: string): Promise<number> {
    return this.attempt(() => {
      const ids = this.of(memberId, guildId).map((row) => row.id);
      this.drop(ids);
      return ids.length;
    });
  }
}
```

Run: `npx vitest run --project unit src/domain/pogo/wants.test.ts test/support/wants.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Create `src/db/repositories/member-rows.ts`:

```ts
import type { Kysely } from 'kysely';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** The rows of `User` and `Guild` that a member's rows in a server hang on. */
export interface MemberInGuild {
  userId: number;
  guildId: number;
}

/**
 * The row ids of a member and a server, without creating either and without a lock: for reading
 * what a member has in a server. Undefined when one of the two has no row, and the member has
 * nothing there then.
 */
export async function findMemberInGuild(
  db: Kysely<DB>,
  memberId: string,
  guildId: string,
): Promise<MemberInGuild | undefined> {
  const user = await db
    .selectFrom('User')
    .select('id')
    .where('userSnowflake', '=', memberId)
    .executeTakeFirst();
  if (!user) return undefined;
  const guild = await db
    .selectFrom('Guild')
    .select('id')
    .where('snowflake', '=', guildId)
    .executeTakeFirst();
  return guild && { userId: user.id, guildId: guild.id };
}

/**
 * Runs `work` in a transaction that holds the member's row of `User` locked, so that two
 * changes of one member's wants, targets or the like run one after the other: neither "one row
 * per target" nor a count can then be passed by both. The tables themselves have no unique key
 * to lean on.
 *
 * With `create` the member's row and the server's are made when missing, and `work` always
 * runs; without it `work` gets undefined when either is missing (there is nothing to change),
 * and no transaction is opened for that.
 *
 * Both rows are looked for before the transaction, without a lock. The server's row is also
 * made there when it is missing (as `GuildRepository.ensure` makes it): made inside, a plain
 * read after the insert would look at the transaction's older view and miss the row when
 * another member's first change made it a moment earlier. The member's row is made inside, by
 * an insert only when it was missing, as `SavedRouteRepository.save` does and for its reasons:
 * an insert that finds the row uses up an id all the same, a plain read inside the transaction
 * would fix what it sees before it holds the lock, and a locking read of a row that is not
 * there makes two first changes wait for each other.
 *
 * These reads before the transaction assume that `db` is not itself a caller's transaction:
 * the repositories that use this are built over the pool. Inside a caller's transaction the
 * work would still be correct, but the first read would fix that transaction's view before the
 * member's lock is held.
 */
export async function withMemberLocked<T>(
  db: Kysely<DB>,
  memberId: string,
  guildId: string,
  create: boolean,
  work: (trx: Kysely<DB>, member: MemberInGuild | undefined) => Promise<T>,
): Promise<T> {
  const known = await db
    .selectFrom('User')
    .select('id')
    .where('userSnowflake', '=', memberId)
    .executeTakeFirst();
  // Nothing to change for a member without a row: no lock is needed to say so.
  if (!known && !create) return work(db, undefined);
  const guildRow = () =>
    db.selectFrom('Guild').select('id').where('snowflake', '=', guildId).executeTakeFirst();
  let guild = await guildRow();
  if (!guild) {
    if (!create) return work(db, undefined);
    // The bot records a server when it joins it; this is for a row that went missing. Two
    // members may come here at once: the unique key makes one row of it.
    await db
      .insertInto('Guild')
      .values({ snowflake: guildId })
      .onDuplicateKeyUpdate({ snowflake: guildId })
      .execute();
    guild = await guildRow();
    if (!guild) throw new Error(`Guild row for ${guildId} vanished after insert`);
  }
  const guildRowId = guild.id;
  return inTransaction(db, async (trx) => {
    if (!known) {
      await trx
        .insertInto('User')
        .values({ userSnowflake: memberId })
        .onDuplicateKeyUpdate({ userSnowflake: memberId })
        .execute();
    }
    const user = await trx
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', memberId)
      .forUpdate()
      .executeTakeFirst();
    if (!user) {
      // Deleted since it was seen: nothing to change, or nothing to hang a new row on.
      if (!create) return work(trx, undefined);
      throw new Error(
        known
          ? `User row for ${memberId} was deleted while their rows were being changed`
          : `User row for ${memberId} vanished after insert`,
      );
    }
    // From here on plain reads see everything that was written before the lock was got: the
    // first of them fixes what the transaction sees.
    return work(trx, { userId: user.id, guildId: guildRowId });
  });
}
```

Create `src/db/repositories/pokemon-notification-repository.ts`:

```ts
import type { Kysely } from 'kysely';
import type {
  NotificationScope,
  NotificationTarget,
} from '../../domain/pogo/notification-target.js';
import {
  planSetWant,
  readWants,
  rowsOfWant,
  type SetWantOutcome,
  type WantList,
  type WantRow,
} from '../../domain/pogo/wants.js';
import type { DB } from '../types.js';
import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';

/**
 * What the commands need of the wants (`ctx.wants`); lets tests keep them in memory. A member
 * and a server are named by their snowflakes. A want is per member and server.
 */
export interface WantStorage {
  /** The member's wants in a server, and how many of their rows there cannot be read. */
  list(memberId: string, guildId: string): Promise<WantList>;
  /**
   * Sets a want: a new one, or the scope of the one the member has for this target. The scope
   * is corrected as the codec does (a tier is `raid`, an IV target `spawn`); the outcome says
   * what is stored.
   */
  set(
    memberId: string,
    guildId: string,
    target: NotificationTarget,
    scope: NotificationScope,
  ): Promise<SetWantOutcome>;
  /** Removes the want for a target; false when the member had none. */
  remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean>;
  /**
   * Removes every row the member has in a server, also those that cannot be read (the member
   * asked for all of them); gives how many rows went.
   */
  removeAll(memberId: string, guildId: string): Promise<number>;
  /**
   * How many wants the member has in a server: each target once, and the rows that cannot be
   * read, which `removeAll` would remove with them.
   */
  count(memberId: string, guildId: string): Promise<number>;
}

/**
 * The legacy table `PokemonNotification`: `userId` and `guildId` are row ids of `User` and
 * `Guild`, `pokemon` and `type` are read and written only through the codec of
 * `notification-target.ts` (here through `wants.ts`, which is built on it). The table has no
 * unique key, and the legacy bot kept one row per member and number across all servers, moving
 * it to the server a want was last typed in; here a want belongs to a member and a server.
 * Several rows for one target can exist in legacy data: they are read as one want, and the next
 * `set` of that target leaves one row.
 */
export class PokemonNotificationRepository implements WantStorage {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * The member's rows of a server. A plain read, also inside `withMemberLocked`: there it is the
   * transaction's first, so it sees everything written before the member's lock was got, and a
   * locking read of rows that are not there would lock the gap other members insert into.
   */
  private async rows(db: Kysely<DB>, member: MemberInGuild): Promise<WantRow[]> {
    const rows = await db
      .selectFrom('PokemonNotification')
      .select(['id', 'pokemon', 'type'])
      .where('userId', '=', member.userId)
      .where('guildId', '=', member.guildId)
      .orderBy('id')
      .execute();
    // A row without a number means nothing: 0 is what the codec reads as unreadable.
    return rows.map((row) => ({ id: row.id, pokemon: row.pokemon ?? 0, type: row.type }));
  }

  async list(memberId: string, guildId: string): Promise<WantList> {
    const member = await findMemberInGuild(this.db, memberId, guildId);
    if (!member) return { wants: [], unreadable: 0 };
    return readWants(await this.rows(this.db, member));
  }

  async count(memberId: string, guildId: string): Promise<number> {
    const { wants, unreadable } = await this.list(memberId, guildId);
    return wants.length + unreadable;
  }

  async set(
    memberId: string,
    guildId: string,
    target: NotificationTarget,
    scope: NotificationScope,
  ): Promise<SetWantOutcome> {
    return withMemberLocked(this.db, memberId, guildId, true, async (trx, member) => {
      if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
      const plan = planSetWant(await this.rows(trx, member), target, scope);
      if (plan.insert) {
        await trx
          .insertInto('PokemonNotification')
          .values({ ...plan.insert, userId: member.userId, guildId: member.guildId })
          .execute();
      }
      if (plan.update) {
        await trx
          .updateTable('PokemonNotification')
          .set(plan.update.values)
          .where('id', '=', plan.update.id)
          .execute();
      }
      if (plan.remove.length > 0) {
        await trx.deleteFrom('PokemonNotification').where('id', 'in', plan.remove).execute();
      }
      return plan.outcome;
    });
  }

  async remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean> {
    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
      if (!member) return false;
      const ids = rowsOfWant(await this.rows(trx, member), target);
      if (ids.length === 0) return false;
      await trx.deleteFrom('PokemonNotification').where('id', 'in', ids).execute();
      return true;
    });
  }

  async removeAll(memberId: string, guildId: string): Promise<number> {
    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
      if (!member) return 0;
      const result = await trx
        .deleteFrom('PokemonNotification')
        .where('userId', '=', member.userId)
        .where('guildId', '=', member.guildId)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }
}
```

Apply to `src/domain/pogo/notification-target.ts`:

```diff
--- a/src/domain/pogo/notification-target.ts
+++ b/src/domain/pogo/notification-target.ts
@@ -122,3 +122,55 @@ export function decodeNotification(stored: StoredNotification): NotificationTarg
   const tier = code ? raidTier(code[1], code[2]) : undefined;
   return tier ? { kind: 'tier', tier } : undefined;
 }
+
+/** A want as a member has it: what it is for, and where it applies. */
+export interface Want {
+  target: NotificationTarget;
+  /**
+   * The scope in effect, which is not always the stored one: a tier is always `raid` and an IV
+   * target always `spawn` (a legacy `(-6, both)` row is a perfect-IV want for spawns); a species
+   * has the scope its row holds.
+   */
+  scope: NotificationScope;
+}
+
+/**
+ * A stored row as the want it means, with the scope in effect; undefined for a row this bot
+ * cannot read (see `decodeNotification`): skip such a row, never delete it or fail on it.
+ */
+export function readNotification(stored: StoredNotification): Want | undefined {
+  const target = decodeNotification(stored);
+  if (!target) return undefined;
+  if (target.kind === 'tier') return { target, scope: 'raid' };
+  if (target.kind === 'iv') return { target, scope: 'spawn' };
+  // `decodeNotification` has read the type already, so it is one of the three.
+  return { target, scope: parseNotificationScope(stored.type) ?? 'both' };
+}
+
+/**
+ * The tiers a want can be for (those the codec has a code for), in the order a list offers
+ * them: the ordinary ones, then elite and EX, then the shadow tiers.
+ */
+export function notificationTiers(): RaidTier[] {
+  return TIER_CODES.flatMap(([, level, shadow]) => {
+    const tier = raidTier(level, shadow);
+    return tier ? [tier] : [];
+  });
+}
+
+/** Whether a tier can be wanted: whether the codec has a code for it. */
+export function isNotificationTier(tier: RaidTier): boolean {
+  return TIER_CODES.some(([, level, shadow]) => level === tier.level && shadow === tier.shadow);
+}
+
+/** Whether two targets are the same thing to be notified about. */
+export function sameNotificationTarget(a: NotificationTarget, b: NotificationTarget): boolean {
+  if (a.kind === 'pokemon') return b.kind === 'pokemon' && a.dex === b.dex;
+  if (a.kind === 'iv') return b.kind === 'iv' && a.iv === b.iv;
+  return b.kind === 'tier' && a.tier.level === b.tier.level && a.tier.shadow === b.tier.shadow;
+}
+
+/** The scope that covers both of two scopes: `raid` and `spawn` together are `both`. */
+export function widerScope(a: NotificationScope, b: NotificationScope): NotificationScope {
+  return a === b ? a : 'both';
+}
```

Create `src/domain/pogo/wants.ts`:

```ts
import { matchNamed, type Named } from '../search/word-match.js';
import type { PokemonCatalogue } from './catalogue.js';
import { feedLookupOf } from './feed-lookup.js';
import { searchTokens } from '../search/text.js';
import {
  encodeNotification,
  isNotificationTier,
  notificationTiers,
  readNotification,
  sameNotificationTarget,
  widerScope,
  type EncodedNotification,
  type NotificationScope,
  type NotificationTarget,
  type StoredNotification,
  type Want,
} from './notification-target.js';
import {
  isRaidLevel,
  raidTier,
  raidTierLabel,
  type RaidLevel,
  type RaidTier,
} from './raid-tier.js';

/**
 * What a choice of a list of wants carries as its value, and what a control may carry: a text
 * that says exactly which target was picked, whatever the list called it. `pokemon:<dex>`,
 * `tier:<level>` and `tier:<level>:shadow` (the level as `RaidLevel` spells it), `iv:perfect`,
 * `iv:zero`.
 */
export function wantToken(target: NotificationTarget): string {
  if (target.kind === 'pokemon') return `pokemon:${String(target.dex)}`;
  if (target.kind === 'iv') return `iv:${target.iv}`;
  return `tier:${target.tier.level}${target.tier.shadow ? ':shadow' : ''}`;
}

/**
 * The target a token names; undefined for any other text, also for a tier that cannot be wanted
 * and for a number that is no Pokédex number. Whether the species exists is not asked here.
 */
export function parseWantToken(text: string): NotificationTarget | undefined {
  const [kind, value, flag, ...more] = text.trim().split(':');
  if (value === undefined || more.length > 0) return undefined;
  if (kind === 'pokemon' && flag === undefined) {
    if (!/^[1-9]\d{0,5}$/.test(value)) return undefined;
    return { kind: 'pokemon', dex: Number(value) };
  }
  if (kind === 'iv' && flag === undefined) {
    return value === 'perfect' || value === 'zero' ? { kind: 'iv', iv: value } : undefined;
  }
  if (kind === 'tier' && (flag === undefined || flag === 'shadow') && isRaidLevel(value)) {
    const tier = raidTier(value, flag === 'shadow');
    return tier && isNotificationTier(tier) ? { kind: 'tier', tier } : undefined;
  }
  return undefined;
}

/** `T5 raids`, `Shadow T5 raids`, `Mega Legendary raids`. */
export function tierWantLabel(tier: RaidTier): string {
  return `${raidTierLabel(tier)} raids`;
}

/** `Perfect IV spawns`, `Zero IV spawns`. */
export function ivWantLabel(iv: 'perfect' | 'zero'): string {
  return iv === 'perfect' ? 'Perfect IV spawns' : 'Zero IV spawns';
}

/** The number a level has in the game, as members type it. */
const LEVEL_NUMBERS: Partial<Record<RaidLevel, string>> = {
  T1: '1',
  T3: '3',
  T5: '5',
  Mega: '4',
  MegaLegendary: '6',
  SuperMega: '7',
};

/** Words for a level beside its number. `ex` and `exclusive` are the legacy bot's. */
const LEVEL_WORDS: Readonly<Record<RaidLevel, readonly string[]>> = {
  T1: [],
  T3: [],
  T5: ['legendary'],
  Mega: ['mega'],
  MegaLegendary: ['mega legendary', 'legendary mega'],
  SuperMega: ['super mega'],
  Elite: ['elite'],
  EX: ['ex', 'exclusive'],
};

/** Every way a tier is typed: `5`, `t5`, `tier 5`, `level 5`, `5 star`, `shadow 5`, `mega`. */
function tierNames(tier: RaidTier): string[] {
  const number = LEVEL_NUMBERS[tier.level];
  const plain = [
    ...(number === undefined
      ? []
      : [number, `t${number}`, `tier ${number}`, `level ${number}`, `${number} star`]),
    ...LEVEL_WORDS[tier.level],
    raidTierLabel({ level: tier.level, shadow: false }),
  ];
  return tier.shadow ? plain.map((name) => `shadow ${name}`) : plain;
}

/** `hundo` is the legacy word for perfect; `none` and `useless` its words for zero. */
const IV_NAMES: Readonly<Record<'perfect' | 'zero', readonly string[]>> = {
  perfect: ['perfect', 'perfect iv', 'perfect ivs', 'hundo', '100', '100 iv', '100 percent'],
  zero: ['zero', 'zero iv', 'zero ivs', 'none', 'useless', 'nundo', '0', '0 iv', '0 percent'],
};

function wordCandidates(): Named<NotificationTarget>[] {
  return [
    ...notificationTiers().map((tier): Named<NotificationTarget> => ({
      value: { kind: 'tier', tier },
      names: tierNames(tier),
    })),
    ...(['perfect', 'zero'] as const).map((iv): Named<NotificationTarget> => ({
      value: { kind: 'iv', iv },
      names: IV_NAMES[iv],
    })),
  ];
}

/** Words that say nothing about which tier or IV target is meant. */
const FILLER = new Set(['raid', 'raids', 'egg', 'eggs', 'spawn', 'spawns', 'boss', 'bosses']);

/**
 * The tier or IV target a typed text names as a word: `tier 5`, `t5`, `5`, `level 5`, `5 star`,
 * `legendary`, `mega`, `mega legendary`, `super mega`, `elite`, `ex`, `exclusive`, `shadow 5`,
 * `perfect`, `hundo`, `100`, `zero`, `none`, `useless`, `0`, with or without `raids`, `eggs` or
 * `spawns` after it. Only a text that is one of these names in full is that target: the
 * beginning of a name or a misspelling of one is never acted on, because it is as likely the
 * beginning of a Pokémon's name (`zer`, `hun`, `exc`, `mega s`). Such a text is only offered
 * (`wantWordGuesses`). Undefined for anything else.
 */
export function wantWord(text: string): NotificationTarget | undefined {
  const words = wordsOf(text);
  if (words.length === 0) return undefined;
  const typed = words.join('');
  const exact = wordCandidates().filter((candidate) =>
    candidate.names.some((name) => searchTokens(name).join('') === typed),
  );
  const [only] = exact;
  return only && exact.length === 1 ? only.value : undefined;
}

/** As many tier and IV targets as a refusal or a list offers for a text that names none. */
const WORD_GUESSES = 3;

/**
 * The tier and IV targets a text may have meant, best first: the one it names in full, or
 * those whose name it begins or nearly spells (the strict matcher: three letters at least).
 * For offering, in a list of choices or a "did you mean"; never for acting on.
 */
export function wantWordGuesses(text: string): NotificationTarget[] {
  const exact = wantWord(text);
  if (exact) return [exact];
  const words = wordsOf(text);
  if (words.length === 0) return [];
  return matchNamed(wordCandidates(), words.join(' ')).slice(0, WORD_GUESSES);
}

/** The words of a typed tier or IV target, spelled one way, without the words that say nothing. */
function wordsOf(text: string): string[] {
  // `tier5` is `tier 5`, `100%` is `100 percent`.
  const spelled = text
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/\b(tier|level|t)\s*(\d)\b/g, (_all, word: string, digit: string) =>
      word === 't' ? `t${digit}` : `${word} ${digit}`,
    )
    .replace(/\b(\d)[\s-]*stars?\b/g, '$1 star');
  return searchTokens(spelled).filter((word) => !FILLER.has(word));
}

/** What `readWantText` needs to know of the Pokémon. Build one with `wantSpeciesFinder`. */
export interface WantSpeciesFinder {
  /** The one Pokémon a text names outright (`ctx.pokemon.exact`). */
  exact(text: string): { dex: number } | undefined;
  /** The species a text is the name of, when it is the name of exactly one. */
  species(text: string): { dex: number } | undefined;
  /** Pokémon a text may mean, best first, near misses included (`ctx.pokemon.search`). */
  search(text: string, options: { limit: number }): ReadonlyArray<{ dex: number }>;
  /** Whether the game data has a species with this Pokédex number. */
  known(dex: number): boolean;
}

/**
 * The name of the species with a Pokédex number, as a want is called: `Giratina`, not the form
 * the species is known by (`Giratina (Altered Forme)`). Undefined for a number the game data
 * does not have.
 */
export function speciesNameOf(catalogue: PokemonCatalogue, dex: number): string | undefined {
  const species = catalogue.species(dex);
  return species && (feedLookupOf(catalogue).speciesName(species.pokemonId) ?? species.name);
}

const speciesNames = new WeakMap<PokemonCatalogue, Map<string, number | null>>();

/** The species by their names, folded; null for a name that two species share. */
function speciesByName(catalogue: PokemonCatalogue): Map<string, number | null> {
  let names = speciesNames.get(catalogue);
  if (!names) {
    names = new Map();
    for (const entry of catalogue.all) {
      if (entry.kind !== 'species') continue;
      const name = searchTokens(speciesNameOf(catalogue, entry.dex) ?? '').join(' ');
      if (name === '') continue;
      const known = names.get(name);
      names.set(name, known === undefined || known === entry.dex ? entry.dex : null);
    }
    speciesNames.set(catalogue, names);
  }
  return names;
}

/**
 * A finder over a catalogue and the Pokémon search (`ctx.pokemon`). The search knows a text
 * only when it names one entry; a species whose name several of its entries answer to (Unown
 * and its letters) is found by its name here, because a want is for the species anyway.
 */
export function wantSpeciesFinder(
  catalogue: PokemonCatalogue,
  pokemon: Pick<WantSpeciesFinder, 'exact' | 'search'>,
): WantSpeciesFinder {
  return {
    exact: (text) => pokemon.exact(text),
    search: (text, options) => pokemon.search(text, options),
    species: (text) => {
      const dex = speciesByName(catalogue).get(searchTokens(text).join(' '));
      return dex === undefined || dex === null ? undefined : { dex };
    },
    known: (dex) => catalogue.species(dex) !== undefined,
  };
}

/** As many Pokémon as a refusal suggests. */
export const WANT_SUGGESTIONS = 5;

export type TypedWant =
  | { kind: 'target'; target: NotificationTarget }
  /** A token for a Pokémon the game data does not have (any more). */
  | { kind: 'gone' }
  /**
   * Nothing the text names outright: the tier and IV targets it may have meant (`words`) and
   * the Pokédex numbers of the Pokémon it may have meant (`suggestions`).
   */
  | { kind: 'unknown'; words: NotificationTarget[]; suggestions: number[] };

/** A scope in brackets at the end of a text, as a list of a member's own wants labels them. */
const SCOPE_IN_BRACKETS = /\s*\((?:raids and spawns|raids|spawns)\)\s*$/i;
/** How a species the game data does not have is called in such a list: `Pokémon #1234`. */
const NUMBERED = /^pok[eé]mon\s*#\s*([1-9]\d{0,5})$/i;

/**
 * What the `target` option of `/want` and `/unwant` names: a choice of the list (a token), or
 * typed text. Typed text is a tier or IV word first (`wantWord`: in full), then the one Pokémon
 * it names outright, or the species it is the name of; a want is for the species, so any form's
 * name gives its species. Anything less is `unknown`, with the targets the text may have meant:
 * the first hit of a search is never acted on.
 *
 * With `own` the text is about a want the member has (`/unwant`): a species the game data does
 * not have is taken all the same (its row can be read, so it can be removed), and a label of
 * the member's own list typed back in full is read, `Pikachu (raids)` and `Pokémon #1234`.
 */
export function readWantText(
  value: string,
  finder: WantSpeciesFinder,
  options: { own?: boolean } = {},
): TypedWant {
  const own = options.own === true;
  const typed = value.trim();
  const token = parseWantToken(typed);
  if (token) {
    return token.kind === 'pokemon' && !own && !finder.known(token.dex)
      ? { kind: 'gone' }
      : { kind: 'target', target: token };
  }
  const text = own ? typed.replace(SCOPE_IN_BRACKETS, '') : typed;
  const numbered = own ? NUMBERED.exec(text) : null;
  if (numbered) return { kind: 'target', target: { kind: 'pokemon', dex: Number(numbered[1]) } };
  const word = wantWord(text);
  if (word) return { kind: 'target', target: word };
  // One letter names an Unown form: too little to act on.
  const letters = searchTokens(text).join('');
  const entry = letters.length > 1 ? (finder.exact(text) ?? finder.species(text)) : undefined;
  if (entry) return { kind: 'target', target: { kind: 'pokemon', dex: entry.dex } };
  const suggestions: number[] = [];
  if (letters.length > 1) {
    for (const found of finder.search(text, { limit: WANT_SUGGESTIONS * 4 })) {
      if (!suggestions.includes(found.dex)) suggestions.push(found.dex);
      if (suggestions.length === WANT_SUGGESTIONS) break;
    }
  }
  return { kind: 'unknown', words: wantWordGuesses(text), suggestions };
}

/** A row of `PokemonNotification` as far as wants need it. */
export interface WantRow extends StoredNotification {
  id: number;
}

/** A member's wants in a server as the rows say them. */
export interface WantList {
  /** Each target once, in the order of the rows. */
  wants: Want[];
  /** Rows this version cannot read (see `decodeNotification`); they are left alone. */
  unreadable: number;
}

/**
 * The wants a member's rows mean. Legacy data can hold several rows for one target: they are
 * one want, in every scope any of them has (each row would notify by itself).
 */
export function readWants(rows: readonly StoredNotification[]): WantList {
  const wants: Want[] = [];
  let unreadable = 0;
  for (const row of rows) {
    const want = readNotification(row);
    if (!want) {
      unreadable += 1;
      continue;
    }
    const known = wants.find((other) => sameNotificationTarget(other.target, want.target));
    if (known) known.scope = widerScope(known.scope, want.scope);
    else wants.push(want);
  }
  return { wants, unreadable };
}

/** What came of setting a want. */
export type SetWantOutcome =
  /** There was none for this target. */
  | { kind: 'added'; want: Want }
  /** There was one, in another scope. */
  | { kind: 'changed'; want: Want; before: NotificationScope }
  /** There was one in this very scope. */
  | { kind: 'unchanged'; want: Want };

/** What setting a want does to a member's rows of one server. */
export interface SetWantPlan {
  outcome: SetWantOutcome;
  /** The values of a new row, when the target has none. */
  insert: EncodedNotification | undefined;
  /** The row that is kept for the target and the values it gets, when they differ from its own. */
  update: { id: number; values: EncodedNotification } | undefined;
  /** Further rows for the same target (legacy duplicates), which go. */
  remove: number[];
}

/**
 * Decides what setting a want does, from the member's rows of the server: a target without a
 * row gets one; a target with rows keeps its oldest, which gets the scope asked for, and loses
 * the others. A row is written only when what it means changes: a legacy row that says the same
 * in other letters (`Both`, or `both` for a perfect-IV want) stays as it is.
 */
export function planSetWant(
  rows: readonly WantRow[],
  target: NotificationTarget,
  scope: NotificationScope,
): SetWantPlan {
  const values = encodeNotification(target, scope);
  const want: Want = { target, scope: values.type };
  const same = rows
    .filter((row) => {
      const read = readNotification(row);
      return read !== undefined && sameNotificationTarget(read.target, target);
    })
    .sort((a, b) => a.id - b.id);
  const [kept, ...others] = same;
  if (!kept) {
    return { outcome: { kind: 'added', want }, insert: values, update: undefined, remove: [] };
  }
  const [had] = readWants(same).wants;
  const before = had?.scope ?? want.scope;
  const keptScope = readNotification(kept)?.scope;
  return {
    outcome:
      before === want.scope ? { kind: 'unchanged', want } : { kind: 'changed', want, before },
    insert: undefined,
    update: keptScope === want.scope ? undefined : { id: kept.id, values },
    remove: others.map((row) => row.id),
  };
}

/** The rows that are a want for this target: what removing the want deletes. */
export function rowsOfWant(rows: readonly WantRow[], target: NotificationTarget): number[] {
  return rows
    .filter((row) => {
      const read = readNotification(row);
      return read !== undefined && sameNotificationTarget(read.target, target);
    })
    .map((row) => row.id);
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/pogo/wants.test.ts test/support/wants.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/pokemon-notification-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/pokemon-notification-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 25c8cce -- src test   # must print nothing
npx prettier --check src/db/repositories/member-rows.ts src/db/repositories/pokemon-notification-repository.db.test.ts src/db/repositories/pokemon-notification-repository.ts src/domain/pogo/notification-target.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts test/support/wants.test.ts test/support/wants.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/db/repositories/member-rows.ts src/db/repositories/pokemon-notification-repository.db.test.ts src/db/repositories/pokemon-notification-repository.ts src/domain/pogo/notification-target.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts test/support/wants.test.ts test/support/wants.ts
git commit -m "Wants: the scope in effect, tokens, typed targets, and their repository" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,804 unit tests.

---

### Task 4: The want, unwant, wants and unwant-all commands

**Files:**
- Create: `src/commands/notifications/remove-all.ts`, `src/commands/notifications/want-input.ts`, `src/commands/notifications/wants.test.ts`, `src/commands/notifications/wants.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/index.ts`, `src/commands/settings/settings.test.ts`, `src/commands/settings/settings.ts`, `src/components/index.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Task 3's `WantStorage`, tokens and `readWantText`; `ctx.raidBosses`, `ctx.pokemon`; `PendingRequests`; `encodeCustomId`; `fitItems`; `requireGuild`.
- Produces: `ctx.wants`; `/want target [type]`, `/unwant target`, `/wants`, `/unwant-all` (`src/commands/notifications/wants.ts`, enabled by `settings.features.notifications`); `want-input.ts` (`wantChoices`, `ownWantChoices`, `typedWant`, `wantSpeciesFinder`); `remove-all.ts` (the question with Remove all / Keep, shared with the targets; custom-id kind `wants`); `NOTIFICATION_THROTTLE`; the count of wants in `/settings show`.

The commands are listed in `src/commands/index.ts` and the control in `src/components/index.ts`; `createTestContext` gets an empty `MemoryWants`.

Reference commit of the prototype for this task: `c28b34f`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/notifications/wants.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { ALICE, BOB } from '../../../test/support/parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryWants } from '../../../test/support/wants.js';
import { InteractionRouter } from '../../discord/router.js';
import { notificationTiers, type Want } from '../../domain/pogo/notification-target.js';
import { LIMITS } from '../../render/text.js';
import { unwant, unwantAll, want, wantControls, wants, wantsEmbed } from './wants.js';

const OTHER_GUILD = '499999999999999999';

function setup() {
  const store = new MemoryWants();
  const { ctx } = createTestContext({ wants: store });
  const router = new InteractionRouter(ctx, [want, unwant, wants, unwantAll], [wantControls]);
  const run = async (
    commandName: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({ commandName, userId: ALICE, options, ...extra });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered: the deferred answer, or a refusal. */
  const answer = async (commandName: string, options: Record<string, string> = {}) => {
    const used = await run(commandName, options);
    const mock = used.editReply.mock.calls.length > 0 ? used.editReply : used.followUp;
    return sent(mock).content;
  };
  const choices = async (commandName: string, focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName,
      userId: ALICE,
      focusedName: 'target',
      focused,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction.respond.mock.calls[0]?.[0] ?? [];
  };
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const rows = (member = ALICE, guild = FAKE_GUILD_ID) =>
    store.rows
      .filter((row) => row.memberId === member && row.guildId === guild)
      .map((row) => [row.pokemon, row.type]);
  return { ctx, store, router, run, answer, choices, handle, rows };
}

/** The custom id of the n-th button of a reply. */
function customId(interaction: FakeInteraction, index = 0): string {
  const row = sent(interaction.editReply).components?.[0] as {
    toJSON(): { components: { custom_id: string; label: string }[] };
  };
  return row.toJSON().components[index]?.custom_id ?? '';
}

describe('the notification commands', () => {
  it('exist only where notifications are switched on, with help in the notifications category', () => {
    const { ctx } = createTestContext();
    const off = {
      ...ctx.config,
      settings: {
        ...ctx.config.settings,
        features: { ...ctx.config.settings.features, notifications: false },
      },
    };
    for (const command of [want, unwant, wants, unwantAll]) {
      expect(command.enabled?.(ctx.config)).toBe(true);
      expect(command.enabled?.(off)).toBe(false);
      expect(command.help.category).toBe('notifications');
      expect(command.help.details).toBeTruthy();
      expect(command.help.examples?.length).toBeGreaterThan(0);
    }
    expect(want.help.details).toContain('every form');
  });

  it('work in a server only, and answer the member alone', async () => {
    const made = setup();
    const dm = await made.run('want', { target: 'pokemon:150' }, { isDm: true });
    expect(dm.reply).toHaveBeenCalledWith({
      content: 'This only works in a server.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.store.rows).toEqual([]);
    const used = await made.run('want', { target: 'pokemon:150' });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });
});

describe('/want', () => {
  it('wants a Pokémon for raids and spawns unless a type is picked, and says what it stored', async () => {
    const made = setup();
    expect(await made.answer('want', { target: 'pokemon:150' })).toBe(
      'You will get a DM when a Mewtwo raid or a wild Mewtwo is reported in a region you can ' +
        'see. Every form of Mewtwo counts. `/unwant` takes it off again.',
    );
    expect(await made.answer('want', { target: 'pokemon:147', type: 'spawn' })).toBe(
      'You will get a DM when a wild Dratini is reported in a region you can see. Every form ' +
        'of Dratini counts. `/unwant` takes it off again.',
    );
    expect(await made.answer('want', { target: 'pokemon:487', type: 'raid' })).toBe(
      'You will get a DM when a Giratina raid is reported in a region you can see. Every form ' +
        'of Giratina counts. `/unwant` takes it off again.',
    );
    expect(made.rows()).toEqual([
      [150, 'both'],
      [147, 'spawn'],
      [487, 'raid'],
    ]);
  });

  it('gives a name that begins with a vowel its article', async () => {
    const made = setup();
    expect(await made.answer('want', { target: 'pokemon:144' })).toBe(
      'You will get a DM when an Articuno raid or a wild Articuno is reported in a region you ' +
        'can see. Every form of Articuno counts. `/unwant` takes it off again.',
    );
    expect(await made.answer('want', { target: 'pokemon:23', type: 'raid' })).toMatch(
      /^You will get a DM when an Ekans raid is reported/,
    );
  });

  it('stores a tier for raids and an IV target for spawns, whatever was picked', async () => {
    const made = setup();
    expect(await made.answer('want', { target: 'tier:T5' })).toBe(
      'You will get a DM when a T5 raid or egg is reported in a region you can see. ' +
        '`/unwant` takes it off again.',
    );
    expect(await made.answer('want', { target: 'tier:Elite', type: 'spawn' })).toBe(
      'You will get a DM when an Elite raid or egg is reported in a region you can see. ' +
        'A raid tier is about raids only, so that is what I stored. `/unwant` takes it off again.',
    );
    expect(await made.answer('want', { target: 'iv:perfect', type: 'both' })).toBe(
      'You will get a DM when a wild Pokémon with perfect IVs is reported in a region you can ' +
        'see. An IV target is about spawns only, so that is what I stored. ' +
        '`/unwant` takes it off again.',
    );
    expect(await made.answer('want', { target: 'tier:T1:shadow', type: 'raid' })).toBe(
      'You will get a DM when a Shadow T1 raid or egg is reported in a region you can see. ' +
        '`/unwant` takes it off again.',
    );
    expect(made.rows()).toEqual([
      [-5, 'raid'],
      [-20, 'raid'],
      [-6, 'spawn'],
      [-31, 'raid'],
    ]);
  });

  it('changes the type of what is wanted already, and says when nothing changed', async () => {
    const made = setup();
    await made.run('want', { target: 'pokemon:150', type: 'raid' });
    expect(await made.answer('want', { target: 'pokemon:150', type: 'spawn' })).toBe(
      'You will get a DM when a wild Mewtwo is reported in a region you can see. Every form ' +
        'of Mewtwo counts. Until now it was for raids. `/unwant` takes it off again.',
    );
    expect(await made.answer('want', { target: 'pokemon:150', type: 'spawn' })).toBe(
      'Mewtwo is on your list already, for spawns. `/unwant` takes it off.',
    );
    await made.run('want', { target: 'tier:T5' });
    expect(await made.answer('want', { target: 'tier:T5', type: 'both' })).toBe(
      'T5 raids is on your list already. A raid tier is about raids only, so that is what I ' +
        'stored. `/unwant` takes it off.',
    );
    expect(made.rows()).toEqual([
      [150, 'spawn'],
      [-5, 'raid'],
    ]);
  });

  it('keeps a want per server and per member', async () => {
    const made = setup();
    await made.run('want', { target: 'pokemon:150' });
    await made.run('want', { target: 'pokemon:150', type: 'raid' }, { guildId: OTHER_GUILD });
    await made.run('want', { target: 'pokemon:151' }, { userId: BOB });
    expect(made.rows()).toEqual([[150, 'both']]);
    expect(made.rows(ALICE, OTHER_GUILD)).toEqual([[150, 'raid']]);
    expect(made.rows(BOB)).toEqual([[151, 'both']]);
  });

  it('reads typed text: a tier or IV word, then the Pokémon it names outright', async () => {
    const made = setup();
    await made.run('want', { target: 'T5' });
    await made.run('want', { target: 'shadow 5' });
    await made.run('want', { target: 'hundo' });
    await made.run('want', { target: 'Mewtwo' });
    await made.run('want', { target: 'mega charizard y' });
    await made.run('want', { target: 'unown' });
    expect(made.rows()).toEqual([
      [-5, 'raid'],
      [-35, 'raid'],
      [-6, 'spawn'],
      [150, 'both'],
      [6, 'both'],
      [201, 'both'],
    ]);
  });

  it('refuses text that names nothing outright, suggests what it may be, and stores nothing', async () => {
    const made = setup();
    const refused = await made.run('want', { target: 'mewtw' });
    const said = sent(refused.followUp).content ?? '';
    expect(said).toMatch(
      /^I do not know a Pokémon, raid tier or IV target called "mewtw"\. Did you mean /,
    );
    expect(said).toContain('Mewtwo');
    expect(said).toMatch(/Pick one from the list that appears while you type\.$/);
    expect(refused.followUp).toHaveBeenCalledWith({ content: said, flags: MessageFlags.Ephemeral });
    // The beginning of a tier or IV word is offered, never acted on.
    const zer = await made.run('want', { target: 'zer' });
    expect(sent(zer.followUp).content).toMatch(
      /^I do not know a Pokémon, raid tier or IV target called "zer"\. Did you mean Zero IV spawns, /,
    );
    const nothing = await made.run('want', { target: 'qqqqzzzz **x**' });
    expect(sent(nothing.followUp).content).toBe(
      'I do not know a Pokémon, raid tier or IV target called "qqqqzzzz \\*\\*x\\*\\*". ' +
        'Pick one from the list that appears while you type.',
    );
    const gone = await made.run('want', { target: 'pokemon:99999' });
    expect(sent(gone.followUp).content).toBe(
      'I do not know that Pokémon any more. Pick again from the list.',
    );
    expect(made.store.rows).toEqual([]);
  });

  it('has no limit on the number of wants', async () => {
    const made = setup();
    for (let dex = 1; dex <= 120; dex++) {
      made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
    }
    expect(await made.answer('want', { target: 'pokemon:150' })).toMatch(/^You will get a DM/);
    expect(made.rows()).toHaveLength(121);
  });

  it('allows thirty changes a minute', async () => {
    const made = setup();
    for (let use = 0; use < 30; use++) await made.run('want', { target: 'pokemon:150' });
    const next = await made.run('want', { target: 'pokemon:151' });
    expect(sent(next.reply).content).toMatch(/^You can use \/want again in /);
    expect(made.rows()).toEqual([[150, 'both']]);
  });
});

describe('/want: the list of choices', () => {
  it('offers the tiers and the IV targets while nothing is typed', async () => {
    const made = setup();
    expect(await made.choices('want', '')).toEqual([
      { name: 'T1 raids', value: 'tier:T1' },
      { name: 'T3 raids', value: 'tier:T3' },
      { name: 'T5 raids', value: 'tier:T5' },
      { name: 'Mega raids', value: 'tier:Mega' },
      { name: 'Mega Legendary raids', value: 'tier:MegaLegendary' },
      { name: 'Super Mega raids', value: 'tier:SuperMega' },
      { name: 'Elite raids', value: 'tier:Elite' },
      { name: 'EX raids', value: 'tier:EX' },
      { name: 'Shadow T1 raids', value: 'tier:T1:shadow' },
      { name: 'Shadow T3 raids', value: 'tier:T3:shadow' },
      { name: 'Shadow T5 raids', value: 'tier:T5:shadow' },
      { name: 'Perfect IV spawns', value: 'iv:perfect' },
      { name: 'Zero IV spawns', value: 'iv:zero' },
    ]);
  });

  it('puts the current raid bosses that fit first, as species', async () => {
    const made = setup();
    // Shadow Landorus (Incarnate) is a boss of the fixture: its species is offered, once.
    const landorus = await made.choices('want', 'land');
    expect(landorus[0]).toEqual({ name: 'Landorus', value: 'pokemon:645' });
    expect(landorus.filter((choice) => choice.value === 'pokemon:645')).toHaveLength(1);
    // Mega Blastoise is a boss: the want is for Blastoise.
    expect((await made.choices('want', 'blast'))[0]).toEqual({
      name: 'Blastoise',
      value: 'pokemon:9',
    });
  });

  it('offers the tier or IV target a text names, and any Pokémon that fits', async () => {
    const made = setup();
    expect((await made.choices('want', 't5'))[0]).toEqual({ name: 'T5 raids', value: 'tier:T5' });
    const shadow = await made.choices('want', 'shadow');
    expect(shadow.map((choice) => choice.value)).toEqual(
      expect.arrayContaining(['tier:T1:shadow', 'tier:T3:shadow', 'tier:T5:shadow']),
    );
    expect(await made.choices('want', 'perf')).toContainEqual({
      name: 'Perfect IV spawns',
      value: 'iv:perfect',
    });
    // No boss right now, found all the same.
    expect(await made.choices('want', 'mewtw')).toContainEqual({
      name: 'Mewtwo',
      value: 'pokemon:150',
    });
  });

  it('puts the tier or IV target a text names or begins before everything else', async () => {
    const made = setup();
    // `mega` is the Mega tier, and Mega Blastoise is a boss: the tier comes first.
    expect((await made.choices('want', 'mega'))[0]).toEqual({
      name: 'Mega raids',
      value: 'tier:Mega',
    });
    expect((await made.choices('want', 'zer'))[0]).toEqual({
      name: 'Zero IV spawns',
      value: 'iv:zero',
    });
    expect(
      (await made.choices('want', 'shadow')).slice(0, 3).map((choice) => choice.value),
    ).toEqual(['tier:T1:shadow', 'tier:T3:shadow', 'tier:T5:shadow']);
    // A text with many Pokémon keeps the tier it names.
    const five = await made.choices('want', '5');
    expect(five[0]).toEqual({ name: 'T5 raids', value: 'tier:T5' });
    expect(five.length).toBeLessThanOrEqual(25);
  });

  it('offers each species once and 25 choices at most', async () => {
    const made = setup();
    const found = await made.choices('want', 'char');
    const values = found.map((choice) => choice.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain('pokemon:6');
    expect((await made.choices('want', 'a')).length).toBeLessThanOrEqual(25);
    expect((await made.choices('want', 'ma')).length).toBeLessThanOrEqual(25);
  });

  it('gives values that the command reads back', async () => {
    const made = setup();
    for (const choice of await made.choices('want', 'gira')) {
      await made.run('want', { target: String(choice.value) });
    }
    expect(made.rows()).toContainEqual([487, 'both']);
  });
});

describe('/unwant', () => {
  it('takes a want off the list, and says when there was none', async () => {
    const made = setup();
    await made.run('want', { target: 'pokemon:150' });
    await made.run('want', { target: 'tier:T5' });
    expect(await made.answer('unwant', { target: 'pokemon:150' })).toBe('Mewtwo is off your list.');
    expect(await made.answer('unwant', { target: 'pokemon:150' })).toBe(
      'Mewtwo is not on your list. `/wants` shows what is.',
    );
    expect(await made.answer('unwant', { target: 't5' })).toBe('T5 raids is off your list.');
    expect(made.rows()).toEqual([]);
  });

  it('removes a want for a species the game data does not have, by its choice or its label', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 99999, 'both');
    made.store.add(ALICE, FAKE_GUILD_ID, 99998, 'raid');
    expect(await made.choices('unwant', '')).toEqual([
      { name: 'Pokémon #99998 (raids)', value: 'pokemon:99998' },
      { name: 'Pokémon #99999 (raids and spawns)', value: 'pokemon:99999' },
    ]);
    expect(await made.answer('unwant', { target: 'pokemon:99999' })).toBe(
      'Pokémon #99999 is off your list.',
    );
    expect(await made.answer('unwant', { target: 'Pokémon #99998 (raids)' })).toBe(
      'Pokémon #99998 is off your list.',
    );
    expect(made.rows()).toEqual([]);
    // `/want` still refuses such a token.
    const gone = await made.run('want', { target: 'pokemon:99999' });
    expect(sent(gone.followUp).content).toBe(
      'I do not know that Pokémon any more. Pick again from the list.',
    );
  });

  it('reads a label of its own list typed in full', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'raid');
    expect(await made.answer('unwant', { target: 'Pikachu (raids)' })).toBe(
      'Pikachu is off your list.',
    );
  });

  it('answers the list with nothing when the wants cannot be read', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.store.failing = new Error('the database is away');
    expect(await made.choices('unwant', 'mew')).toEqual([]);
  });

  it('leaves the wants of other servers and other members alone', async () => {
    const made = setup();
    made.store.add(ALICE, OTHER_GUILD, 150, 'both');
    made.store.add(BOB, FAKE_GUILD_ID, 150, 'both');
    expect(await made.answer('unwant', { target: 'mewtwo' })).toBe(
      'Mewtwo is not on your list. `/wants` shows what is.',
    );
    expect(made.store.rows).toHaveLength(2);
  });

  it('refuses text that names nothing outright', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    const refused = await made.run('unwant', { target: 'mewtw' });
    expect(sent(refused.followUp).content).toMatch(
      /^I do not know a Pokémon, raid tier or IV target/,
    );
    expect(made.store.rows).toHaveLength(1);
  });

  it('lists the member’s own wants of this server with their scope, by name', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'Both');
    made.store.add(ALICE, FAKE_GUILD_ID, 147, 'spawn');
    made.store.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
    made.store.add(ALICE, FAKE_GUILD_ID, -6, 'both');
    made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
    made.store.add(ALICE, OTHER_GUILD, 1, 'both');
    made.store.add(BOB, FAKE_GUILD_ID, 2, 'both');
    expect(await made.choices('unwant', '')).toEqual([
      { name: 'Dratini (spawns)', value: 'pokemon:147' },
      { name: 'Mewtwo (raids and spawns)', value: 'pokemon:150' },
      { name: 'Perfect IV spawns', value: 'iv:perfect' },
      { name: 'T5 raids', value: 'tier:T5' },
    ]);
    expect(await made.choices('unwant', 'mew')).toEqual([
      { name: 'Mewtwo (raids and spawns)', value: 'pokemon:150' },
    ]);
    // A word for a tier finds it, also when the label spells it otherwise.
    expect(await made.choices('unwant', 'tier 5')).toEqual([
      { name: 'T5 raids', value: 'tier:T5' },
    ]);
    // What begins with the text comes before what only holds it.
    expect((await made.choices('unwant', 's')).map((choice) => choice.name)).toEqual([
      'Dratini (spawns)',
      'Mewtwo (raids and spawns)',
      'Perfect IV spawns',
      'T5 raids',
    ]);
    expect(await made.choices('unwant', '', { isDm: true })).toEqual([]);
  });

  it('shows 25 of a long list, and the best matches of what was typed', async () => {
    const made = setup();
    for (let dex = 1; dex <= 160; dex++) made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
    expect(await made.choices('unwant', '')).toHaveLength(25);
    expect((await made.choices('unwant', 'mewtwo'))[0]).toEqual({
      name: 'Mewtwo (raids and spawns)',
      value: 'pokemon:150',
    });
  });
});

describe('/wants', () => {
  const fieldsOf = (interaction: FakeInteraction) =>
    sent(interaction.editReply).embeds?.[0]?.toJSON().fields ?? [];

  it('points to /want when the list is empty', async () => {
    const made = setup();
    expect(await made.answer('wants')).toBe(
      'Your list for this server is empty. `/want` puts a Pokémon or a raid tier on it, ' +
        'and I send you a DM when one is reported.',
    );
  });

  it('groups the list by what is wanted, each group by name', async () => {
    const made = setup();
    for (const [pokemon, type] of [
      [150, 'both'],
      [3, 'Both'],
      [147, 'raid'],
      [487, 'spawn'],
      [-35, 'raid'],
      [-5, 'raid'],
      [-1, 'raid'],
      [-8, 'spawn'],
      [-6, 'both'],
    ] as const) {
      made.store.add(ALICE, FAKE_GUILD_ID, pokemon, type);
    }
    made.store.add(ALICE, OTHER_GUILD, 1, 'both');
    const used = await made.run('wants');
    const embed = sent(used.editReply).embeds?.[0]?.toJSON();
    expect(embed?.title).toBe('Your notifications in this server');
    expect(embed?.description).toBe('`/want` adds to the list, `/unwant` takes off it.');
    expect(fieldsOf(used)).toEqual([
      { name: 'Raids and spawns (2)', value: 'Mewtwo, Venusaur' },
      { name: 'Raids (1)', value: 'Dratini' },
      { name: 'Spawns (1)', value: 'Giratina' },
      { name: 'Raid tiers (3)', value: 'T1, T5, Shadow T5' },
      { name: 'Spawn IVs (2)', value: 'Perfect, Zero' },
    ]);
  });

  it('says how many rows this version cannot read, and names an unknown species by its number', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 99999, 'both');
    made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'sometimes');
    const used = await made.run('wants');
    expect(fieldsOf(used)).toEqual([{ name: 'Raids and spawns (1)', value: 'Pokémon #99999' }]);
    expect(sent(used.editReply).embeds?.[0]?.toJSON().description).toBe(
      '`/want` adds to the list, `/unwant` takes off it.\n' +
        '…and 2 entries this version cannot read; `/unwant-all` removes those too.',
    );
  });

  it('shows the list also when all of it is unreadable', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
    const used = await made.run('wants');
    expect(fieldsOf(used)).toEqual([]);
    expect(sent(used.editReply).embeds?.[0]?.toJSON().description).toContain(
      '…and 1 entry this version cannot read',
    );
  });

  it('stays within 6,000 characters with all five groups full', () => {
    const { ctx } = createTestContext();
    const dexes = ctx.gameData.catalogue.all
      .filter((entry) => entry.kind === 'species')
      .map((entry) => entry.dex);
    const scopes = ['both', 'raid', 'spawn'] as const;
    const embed = wantsEmbed(ctx, {
      wants: [
        ...dexes.map((dex, index): Want => ({
          target: { kind: 'pokemon', dex },
          scope: scopes[index % 3] ?? 'both',
        })),
        ...notificationTiers().map((tier): Want => ({
          target: { kind: 'tier', tier },
          scope: 'raid',
        })),
        { target: { kind: 'iv', iv: 'perfect' }, scope: 'spawn' },
        { target: { kind: 'iv', iv: 'zero' }, scope: 'spawn' },
      ],
      unreadable: 12_345,
    }).toJSON();
    const fields = embed.fields ?? [];
    expect(fields.map((field) => field.name.replace(/ \(\d+\)$/, ''))).toEqual([
      'Raids and spawns',
      'Raids',
      'Spawns',
      'Raid tiers',
      'Spawn IVs',
    ]);
    const total =
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
    expect(total).toBeGreaterThan(3_000);
    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
    expect(embed.description?.length).toBeLessThanOrEqual(LIMITS.embedDescription);
  });

  it('stays within the limits of an embed whatever the number of rows', () => {
    const { ctx } = createTestContext();
    const dexes = ctx.gameData.catalogue.all
      .filter((entry) => entry.kind === 'species')
      .map((entry) => entry.dex);
    const scopes = ['both', 'raid', 'spawn'] as const;
    const embed = wantsEmbed(ctx, {
      wants: dexes.map((dex, index) => ({
        target: { kind: 'pokemon', dex },
        scope: scopes[index % 3] ?? 'both',
      })),
      unreadable: 4,
    }).toJSON();
    const fields = embed.fields ?? [];
    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field.value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
      expect(field.value).toMatch(/…and \d+ more$/);
    }
    const total =
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
    expect(dexes.length).toBeGreaterThan(900);
  });
});

describe('/unwant-all', () => {
  const filled = () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    made.store.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
    made.store.add(ALICE, FAKE_GUILD_ID, -7, 'spawn');
    made.store.add(ALICE, OTHER_GUILD, 151, 'both');
    made.store.add(BOB, FAKE_GUILD_ID, 150, 'both');
    return made;
  };
  const press = (made: ReturnType<typeof setup>, id: string, userId = ALICE) =>
    made.handle(fakeButton({ customId: id, userId }));

  it('says so when there is nothing to remove', async () => {
    const made = setup();
    const used = await made.run('unwant-all');
    expect(used.editReply).toHaveBeenCalledWith({
      content: 'Your list for this server is empty: there is nothing to remove.',
    });
  });

  it('asks first, with two buttons, and removes nothing yet', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    expect(sent(asked.editReply).content).toBe(
      'Remove all 3 entries of your list for this server? You will get no DMs for Pokémon or ' +
        'raid tiers here any more.',
    );
    const row = sent(asked.editReply).components?.[0] as {
      toJSON(): { components: { custom_id: string; label: string }[] };
    };
    expect(row.toJSON().components.map((button) => button.label)).toEqual([
      'Remove all 3',
      'Keep them',
    ]);
    expect(customId(asked, 0)).toMatch(/^wants:[0-9a-f]{16}:all$/);
    expect(customId(asked, 1)).toMatch(/^wants:[0-9a-f]{16}:keep$/);
    expect(made.store.rows).toHaveLength(5);
  });

  it('removes every row of the member in this server on Remove all, also unreadable ones', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    const pressed = await press(made, customId(asked, 0));
    expect(pressed.deferUpdate).toHaveBeenCalled();
    expect(pressed.editReply).toHaveBeenCalledWith({
      content: 'Removed 3 entries: your list for this server is empty.',
      components: [],
    });
    expect(made.rows()).toEqual([]);
    expect(made.rows(ALICE, OTHER_GUILD)).toEqual([[151, 'both']]);
    expect(made.rows(BOB)).toEqual([[150, 'both']]);
  });

  it('removes nothing on Keep', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    const pressed = await press(made, customId(asked, 1));
    expect(pressed.update).toHaveBeenCalledWith({
      content: 'Nothing was removed.',
      components: [],
    });
    expect(made.rows()).toHaveLength(3);
  });

  it('lets only the asker answer, once', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    const other = await press(made, customId(asked, 0), BOB);
    expect(other.reply).toHaveBeenCalledWith({
      content: 'That is somebody else’s question.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.store.rows).toHaveLength(5);
    await press(made, customId(asked, 0));
    const again = await press(made, customId(asked, 0));
    expect(again.update).toHaveBeenCalledWith({
      content: 'That question has expired. Use `/unwant-all` again.',
      components: [],
    });
  });

  it('says that nothing was removed when the database fails', async () => {
    const made = filled();
    const asked = await made.run('unwant-all');
    made.store.failing = new Error('the database is away');
    const pressed = await press(made, customId(asked, 0));
    expect(pressed.editReply).toHaveBeenCalledWith({
      content: 'Nothing was removed.',
      components: [],
    });
    made.store.failing = undefined;
    expect(made.rows()).toHaveLength(3);
  });

  it('words one entry as one', async () => {
    const made = setup();
    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both');
    const asked = await made.run('unwant-all');
    expect(sent(asked.editReply).content).toMatch(/^Remove the one entry of your list/);
    const row = sent(asked.editReply).components?.[0] as {
      toJSON(): { components: { label: string }[] };
    };
    expect(row.toJSON().components.map((button) => button.label)).toEqual([
      'Remove it',
      'Keep them',
    ]);
    const pressed = await press(made, customId(asked, 0));
    expect(sent(pressed.editReply).content).toBe(
      'Removed 1 entry: your list for this server is empty.',
    );
  });
});
```

Apply to `src/commands/settings/settings.test.ts`:

```diff
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -1,18 +1,21 @@
 import { InteractionContextType, MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
+import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
 import { ALICE } from '../../../test/support/parties.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
+import { MemoryWants } from '../../../test/support/wants.js';
 import { declaredSubcommands } from '../../discord/command.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
 import { settings, settingsLines } from './settings.js';
 
-function setup() {
+function setup(features: { notifications?: boolean } = {}) {
   const users = new MemoryUsers();
-  const { ctx } = createTestContext({ users });
+  const wants = new MemoryWants();
+  const { ctx } = createTestContext({ users, wants });
+  ctx.config.settings.features = { ...ctx.config.settings.features, ...features };
   const router = new InteractionRouter(ctx, [settings], []);
   const run = async (
     subcommand: string,
@@ -32,7 +35,7 @@ function setup() {
   /** What the member was answered. */
   const answer = async (subcommand: string, options: Record<string, string | boolean> = {}) =>
     sent((await run(subcommand, options)).editReply).content;
-  return { users, run, answer };
+  return { users, wants, run, answer };
 }
 
 describe('/settings', () => {
@@ -113,6 +116,19 @@ describe('/settings', () => {
     expect(await made.answer('mentions-shouts', { enabled: true })).not.toContain('though');
   });
 
+  it('says that no DM is sent where notifications are switched off on this bot', async () => {
+    const made = setup({ notifications: false });
+    const off =
+      ' Notifications are switched off on this bot, though, so no such DM is sent for now.';
+    expect(await made.answer('boss-set', { enabled: true })).toBe(
+      `You will get a DM when an egg you are signed up for gets its boss.${off}`,
+    );
+    expect(await made.answer('new-train', { enabled: true })).toContain(off);
+    expect(await made.answer('boss-set', { enabled: false })).not.toContain('though');
+    // A ping in a post is no notification of that kind.
+    expect(await made.answer('mentions-shouts', { enabled: true })).not.toContain('though');
+  });
+
   it('allows thirty changes a minute', async () => {
     const made = setup();
     for (let use = 0; use < 30; use++) await made.run('mentions', { enabled: use % 2 === 0 });
@@ -183,10 +199,28 @@ describe('/settings show', () => {
         '- DM for a new train: **off** · `/settings new-train`',
         '- Status when you report a raid: **Interested** · `/settings auto-status`',
         '- Raid reports: **Visible** · `/settings privacy`',
+        '- Pokémon and raid tiers on your list in this server: **0** · `/wants`',
       ].join('\n'),
     );
   });
 
+  it('counts what is on the lists of this server, and nothing in a DM', async () => {
+    const made = setup();
+    made.wants.add(ALICE, FAKE_GUILD_ID, 150, 'both');
+    made.wants.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
+    made.wants.add(ALICE, '499999999999999999', 151, 'both');
+    expect(await made.answer('show')).toContain(
+      '- Pokémon and raid tiers on your list in this server: **2** · `/wants`',
+    );
+    const dm = await made.run('show', {}, { isDm: true });
+    expect(sent(dm.editReply).content).not.toContain('on your list');
+  });
+
+  it('leaves the lists out where notifications are switched off', async () => {
+    const made = setup({ notifications: false });
+    expect(await made.answer('show')).not.toContain('on your list');
+  });
+
   it('shows what was changed, and what the master switch keeps quiet', async () => {
     const made = setup();
     await made.run('mentions', { enabled: false });
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -18,6 +18,7 @@ import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { TEST_ENV } from './test-env.js';
 import { MemoryUsers } from './users.js';
+import { MemoryWants } from './wants.js';
 
 export { TEST_SETTINGS_PATH };
 
@@ -51,6 +52,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     parties: noParties(),
     // Every member has the default settings.
     users: new MemoryUsers(),
+    // Nobody wants anything; a test passes its own `MemoryWants` to fill and read it.
+    wants: new MemoryWants(),
     partyService: unavailable<PartyService>(
       'partyService',
       'pass { partyService, parties, regions } from partyServiceWith()',
```

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/settings/settings.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -1,5 +1,6 @@
 import type { Kysely } from 'kysely';
 import type { Config } from './config/index.js';
+import type { WantStorage } from './db/repositories/pokemon-notification-repository.js';
 import type { UserSettingsStore } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
 import type { ClickAnswers } from './discord/click-answers.js';
@@ -52,6 +53,8 @@ export interface AppContext {
   readonly clickAnswers: ClickAnswers;
   /** Members' settings (the defaults for a member who never changed one), and changing them. */
   readonly users: UserSettingsStore;
+  /** What members want to be notified about: Pokémon, raid tiers, IV targets, per server. */
+  readonly wants: WantStorage;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,6 +10,7 @@ import { AccessGrantRepository } from './db/repositories/access-grant-repository
 import { GuildRepository } from './db/repositories/guild-repository.js';
 import { GymRepository } from './db/repositories/gym-repository.js';
 import { PartyRepository } from './db/repositories/party-repository.js';
+import { PokemonNotificationRepository } from './db/repositories/pokemon-notification-repository.js';
 import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
@@ -230,6 +231,7 @@ export async function startApp(
     trains,
     clickAnswers,
     users,
+    wants: new PokemonNotificationRepository(db),
     pokemon,
     maps,
     features: requested,
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -7,6 +7,7 @@ import { group } from './parties/group.js';
 import { deleteParty } from './parties/delete.js';
 import { cancelMeet, meet } from './parties/meet.js';
 import { name } from './parties/name.js';
+import { unwant, unwantAll, want, wants } from './notifications/wants.js';
 import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
 import { boss, moveset } from './raids/boss.js';
@@ -56,5 +57,9 @@ export const commands: readonly CommandModule[] = [
   skip,
   finish,
   settings,
+  want,
+  unwant,
+  wants,
+  unwantAll,
   admin,
 ];
```

Create `src/commands/notifications/remove-all.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { PendingRequests } from '../../services/pending-requests.js';

/** What a "remove all of them?" question is about. */
export interface RemoveAllOptions {
  /** The custom-id kind of the two buttons; it belongs to this question alone. */
  kind: string;
  /** The command that asks, as a member types it: `/unwant-all`. */
  command: string;
  /** How many there are to remove for a member in a server. */
  count(ctx: AppContext, memberId: string, guildId: string): Promise<number>;
  /** Removes them all and gives how many went. */
  removeAll(ctx: AppContext, memberId: string, guildId: string): Promise<number>;
  /** What the member is told when there is nothing to remove. */
  none: string;
  /** The question, for `n` of them. */
  question(n: number): string;
  /** The label of the button that removes them: `Remove all 3`, and `Remove it` for one. */
  button(n: number): string;
  /** What the member is told once `n` are gone. */
  removed(n: number): string;
}

/**
 * A command that removes everything a member has of one kind in a server, after asking: two
 * buttons, Remove all N and Keep. The question is kept in a `PendingRequests` store as `/raid`
 * keeps its own (the token is the id of the custom id): only the member who asked can answer,
 * once, within ten minutes. Gives the command's `execute` (the interaction is deferred) and the
 * handler of the buttons.
 */
export function removeAllQuestion(options: RemoveAllOptions): {
  ask(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
  controls: ComponentHandler;
} {
  const pending = new PendingRequests<{ guildId: string }>();
  const expired = `That question has expired. Use \`${options.command}\` again.`;
  return {
    async ask(interaction, ctx) {
      const { guildId } = interaction;
      if (guildId === null) throw new UserError('This only works in a server.');
      const n = await options.count(ctx, interaction.user.id, guildId);
      if (n === 0) {
        await interaction.editReply({ content: options.none });
        return;
      }
      const token = pending.put(interaction.user.id, { guildId });
      const button = (action: string, label: string, style: ButtonStyle) =>
        new ButtonBuilder()
          .setCustomId(encodeCustomId({ kind: options.kind, id: token, action }))
          .setLabel(label)
          .setStyle(style);
      await interaction.editReply({
        content: options.question(n),
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            button('all', options.button(n), ButtonStyle.Danger),
            button('keep', 'Keep them', ButtonStyle.Secondary),
          ),
        ],
      });
    },
    controls: {
      kind: options.kind,
      async button(interaction, id, ctx) {
        const taken = pending.take(id.id, interaction.user.id);
        if (taken === 'not-yours') throw new UserError('That is somebody else’s question.');
        if (taken === 'expired') {
          await interaction.update({ content: expired, components: [] });
          return;
        }
        if (id.action !== 'all') {
          await interaction.update({ content: 'Nothing was removed.', components: [] });
          return;
        }
        // The database first, the answer after: the buttons go only once it is known what came
        // of it. A failure leaves the question answered (its token is used up) and is reported
        // by the router.
        await interaction.deferUpdate();
        let content: string;
        try {
          const n = await options.removeAll(ctx, interaction.user.id, taken.value.guildId);
          content = n === 0 ? options.none : options.removed(n);
        } catch (err) {
          try {
            await interaction.editReply({ content: 'Nothing was removed.', components: [] });
          } catch {
            // The message may be gone or the token expired; the error below is what matters.
          }
          throw err;
        }
        await interaction.editReply({ content, components: [] });
      },
    },
  };
}
```

Create `src/commands/notifications/want-input.ts`:

```ts
import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import {
  notificationTiers,
  sameNotificationTarget,
  type NotificationScope,
  type NotificationTarget,
  type Want,
} from '../../domain/pogo/notification-target.js';
import {
  ivWantLabel,
  readWantText,
  speciesNameOf,
  tierWantLabel,
  wantSpeciesFinder,
  wantToken,
  wantWord,
  wantWordGuesses,
} from '../../domain/pogo/wants.js';
import { plain, truncate } from '../../render/text.js';

/** Discord shows at most this many choices, each with a name of at most 100 characters. */
export const MAX_CHOICES = 25;
const CHOICE_NAME = 100;

export interface Choice {
  name: string;
  value: string;
}

/** How a scope reads after "for": `raids and spawns`, `raids`, `spawns`. */
export const SCOPE_WORDS: Readonly<Record<NotificationScope, string>> = {
  both: 'raids and spawns',
  raid: 'raids',
  spawn: 'spawns',
};

/**
 * What a target is called in a list and in a sentence: the species (`Giratina`: a want is for
 * every form), `T5 raids`, `Perfect IV spawns`. A species the game data does not have (any
 * more) is called by its number. The name comes from the game data, so it is not made plain
 * here; `plain()` it where it stands in a message.
 */
export function wantLabel(ctx: AppContext, target: NotificationTarget): string {
  if (target.kind === 'tier') return tierWantLabel(target.tier);
  if (target.kind === 'iv') return ivWantLabel(target.iv);
  return speciesNameOf(ctx.gameData.catalogue, target.dex) ?? `Pokémon #${String(target.dex)}`;
}

/** The tiers and the IV targets, in the order a list offers them. */
function fixedTargets(): NotificationTarget[] {
  return [
    ...notificationTiers().map((tier): NotificationTarget => ({ kind: 'tier', tier })),
    { kind: 'iv', iv: 'perfect' },
    { kind: 'iv', iv: 'zero' },
  ];
}

/** Whether every typed word stands somewhere in a name. */
function fits(name: string, words: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return words.every((word) => lower.includes(word));
}

/**
 * The choices for the `target` option of `/want`. With nothing typed: the tiers, then the IV
 * targets. With text: the tier or IV target it names or begins first, then the current raid
 * bosses that fit it (as species, each once), then the tiers and IV targets whose label fits,
 * then any Pokémon the search finds, each species once. A choice's value is the target's token.
 */
export function wantChoices(ctx: AppContext, typed: string): Choice[] {
  const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const targets: NotificationTarget[] = [];
  const add = (target: NotificationTarget): void => {
    if (!targets.some((known) => sameNotificationTarget(known, target))) targets.push(target);
  };
  if (words.length === 0) {
    fixedTargets().forEach(add);
  } else {
    // First of all the tier or IV target the text names, or may be the beginning of: it must
    // not fall off the end of the list behind the Pokémon.
    wantWordGuesses(typed).forEach(add);
    for (const boss of ctx.raidBosses.bosses()) {
      // A boss the game master does not know has no Pokédex number: its tier can be wanted.
      if (!boss.entry) continue;
      const target: NotificationTarget = { kind: 'pokemon', dex: boss.entry.dex };
      if (fits(boss.name, words) || fits(wantLabel(ctx, target), words)) add(target);
    }
    for (const target of fixedTargets()) if (fits(wantLabel(ctx, target), words)) add(target);
    for (const entry of ctx.pokemon.search(typed, { limit: MAX_CHOICES * 4 })) {
      if (targets.length >= MAX_CHOICES) break;
      add({ kind: 'pokemon', dex: entry.dex });
    }
  }
  return targets.slice(0, MAX_CHOICES).map((target) => ({
    name: truncate(wantLabel(ctx, target), CHOICE_NAME),
    value: wantToken(target),
  }));
}

/** A want as a list names it with its scope: `Mewtwo (raids and spawns)`, `T5 raids`. */
export function wantWithScope(ctx: AppContext, want: Want): string {
  const label = wantLabel(ctx, want.target);
  return want.target.kind === 'pokemon' ? `${label} (${SCOPE_WORDS[want.scope]})` : label;
}

/**
 * The choices for the `target` option of `/unwant`: the member's own wants, with their scope,
 * narrowed to what was typed; those that begin with it first, then by name.
 */
export function ownWantChoices(ctx: AppContext, wants: readonly Want[], typed: string): Choice[] {
  const text = typed.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const word = wantWord(typed);
  return wants
    .map((want) => ({ want, name: wantWithScope(ctx, want) }))
    .filter(
      ({ want, name }) =>
        fits(name, words) || (word !== undefined && sameNotificationTarget(word, want.target)),
    )
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(text)) -
          Number(!b.name.toLowerCase().startsWith(text)) || a.name.localeCompare(b.name, 'en'),
    )
    .slice(0, MAX_CHOICES)
    .map(({ want, name }) => ({
      name: truncate(name, CHOICE_NAME),
      value: wantToken(want.target),
    }));
}

/** "A, B or C". */
function orList(names: readonly string[]): string {
  const rest = [...names];
  const last = rest.pop() ?? '';
  return rest.length === 0 ? last : `${rest.join(', ')} or ${last}`;
}

/**
 * The target the `target` option names: a choice of the list, or typed text (see
 * `readWantText`). Throws a `UserError` that says what would work; a text that names nothing
 * outright is never guessed at: what it may have meant is only suggested. `own` is for a want
 * the member has (`/unwant`): see `readWantText`.
 */
export function typedWant(ctx: AppContext, value: string, own = false): NotificationTarget {
  const finder = wantSpeciesFinder(ctx.gameData.catalogue, ctx.pokemon);
  const read = readWantText(value, finder, { own });
  if (read.kind === 'target') return read.target;
  if (read.kind === 'gone') {
    throw new UserError('I do not know that Pokémon any more. Pick again from the list.');
  }
  const shown = plain(truncate(value.trim(), 80));
  const names = [
    ...read.words,
    ...read.suggestions.map((dex): NotificationTarget => ({ kind: 'pokemon', dex })),
  ].map((target) => plain(wantLabel(ctx, target)));
  throw new UserError(
    `I do not know a Pokémon, raid tier or IV target called "${shown}". ` +
      (names.length === 0 ? '' : `Did you mean ${orList(names)}? `) +
      'Pick one from the list that appears while you type.',
  );
}
```

Create `src/commands/notifications/wants.ts`:

```ts
import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Config } from '../../config/index.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requireGuild } from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import {
  notificationTiers,
  type NotificationScope,
  type NotificationTarget,
  type Want,
} from '../../domain/pogo/notification-target.js';
import { raidTierLabel, sameRaidTier } from '../../domain/pogo/raid-tier.js';
import type { SetWantOutcome, WantList } from '../../domain/pogo/wants.js';
import { count, fitItems, LIMITS, plain } from '../../render/text.js';
import { removeAllQuestion } from './remove-all.js';
import { ownWantChoices, SCOPE_WORDS, typedWant, wantChoices, wantLabel } from './want-input.js';

/** Whether this installation notifies members at all (`settings.features.notifications`). */
export const notificationsEnabled = (config: Config): boolean =>
  config.settings.features.notifications;

/** How often one member may change what they are notified about: each use writes to the database. */
export const NOTIFICATION_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };

const SCOPE_CHOICES: ReadonlyArray<{ name: string; value: NotificationScope }> = [
  { name: 'Raids and spawns', value: 'both' },
  { name: 'Raids', value: 'raid' },
  { name: 'Spawns', value: 'spawn' },
];

/** The server a command was used in; the guard `requireGuild` has checked that there is one. */
function guildOf(interaction: ChatInputCommandInteraction): string {
  if (interaction.guildId === null) throw new UserError('This only works in a server.');
  return interaction.guildId;
}

/** A name with its article: `a T5`, `an Elite`, `an Articuno`. */
function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** What a want does, as the member is told: when a direct message comes. */
function promise(ctx: AppContext, want: Want): string {
  const { target, scope } = want;
  const where = 'in a region you can see';
  if (target.kind === 'tier') {
    const label = raidTierLabel(target.tier);
    return `You will get a DM when ${withArticle(label)} raid or egg is reported ${where}.`;
  }
  if (target.kind === 'iv') {
    const ivs = target.iv === 'perfect' ? 'perfect' : 'zero';
    return `You will get a DM when a wild Pokémon with ${ivs} IVs is reported ${where}.`;
  }
  const name = plain(wantLabel(ctx, target));
  const what = {
    both: `${withArticle(name)} raid or a wild ${name} is`,
    raid: `${withArticle(name)} raid is`,
    spawn: `a wild ${name} is`,
  }[scope];
  return `You will get a DM when ${what} reported ${where}. Every form of ${name} counts.`;
}

/** What is added when the member picked a type that the target cannot have. */
function corrected(target: NotificationTarget, asked: NotificationScope | null): string {
  if (target.kind === 'tier' && asked !== null && asked !== 'raid') {
    return ' A raid tier is about raids only, so that is what I stored.';
  }
  if (target.kind === 'iv' && asked !== null && asked !== 'spawn') {
    return ' An IV target is about spawns only, so that is what I stored.';
  }
  return '';
}

function wantAnswer(
  ctx: AppContext,
  outcome: SetWantOutcome,
  asked: NotificationScope | null,
): string {
  const { want } = outcome;
  const name = plain(wantLabel(ctx, want.target));
  const note = corrected(want.target, asked);
  if (outcome.kind === 'unchanged') {
    const scope = want.target.kind === 'pokemon' ? `, for ${SCOPE_WORDS[want.scope]}` : '';
    return `${name} is on your list already${scope}.${note} \`/unwant\` takes it off.`;
  }
  const before =
    outcome.kind === 'changed' ? ` Until now it was for ${SCOPE_WORDS[outcome.before]}.` : '';
  return `${promise(ctx, want)}${before}${note} \`/unwant\` takes it off again.`;
}

/**
 * `/want` (spec 4.2): a Pokémon, a raid tier or an IV target to be told about by direct
 * message. A want belongs to the member and the server it was made in.
 */
export const want: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('want')
    .setDescription('Get a DM when a Pokémon or a raid tier is reported')
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription('A Pokémon, a raid tier, or perfect or zero IVs: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('For a Pokémon: raids, spawns or both (both when left out)')
        .addChoices(SCOPE_CHOICES.map(({ name, value }) => ({ name, value }))),
    ),
  help: {
    category: 'notifications',
    details:
      'Puts a Pokémon, a raid tier or an IV target on your list for this server: you get a ' +
      'direct message when one is reported in a region you can see. A Pokémon is wanted as a ' +
      'species, so every form of it counts (a mega, a regional form, a shadow raid). `type` ' +
      'says whether you want its raids, its spawns or both; a raid tier is always about raids, ' +
      'eggs included, and perfect or zero IVs always about spawns. Wanting something again ' +
      'changes its type. Pick from the list that appears while you type, or type a name or a ' +
      'tier such as `t5`, `mega`, `shadow 5`, `elite`, `perfect` or `zero`.',
    examples: ['/want target:Mewtwo', '/want target:Larvitar type:Spawns', '/want target:t5'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const target = typedWant(ctx, interaction.options.getString('target', true));
    const picked = interaction.options.getString('type');
    const asked = SCOPE_CHOICES.find((choice) => choice.value === picked)?.value ?? null;
    const outcome = await ctx.wants.set(
      interaction.user.id,
      guildOf(interaction),
      target,
      asked ?? 'both',
    );
    await interaction.editReply({ content: wantAnswer(ctx, outcome, asked) });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(wantChoices(ctx, interaction.options.getFocused()));
  },
};

/** `/unwant` (spec 4.2): takes one thing off the member's list in this server. */
export const unwant: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('unwant')
    .setDescription('Stop the DMs for a Pokémon or a raid tier')
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription('What to take off your list: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'notifications',
    details:
      'Takes a Pokémon, a raid tier or an IV target off your list for this server. The list ' +
      'that appears while you type shows what is on it; you can also type the name or the ' +
      'tier as for `/want`.',
    examples: ['/unwant target:Mewtwo', '/unwant target:t5'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const target = typedWant(ctx, interaction.options.getString('target', true), true);
    const removed = await ctx.wants.remove(interaction.user.id, guildOf(interaction), target);
    const name = plain(wantLabel(ctx, target));
    await interaction.editReply({
      content: removed
        ? `${name} is off your list.`
        : `${name} is not on your list. \`/wants\` shows what is.`,
    });
  },

  async autocomplete(interaction, ctx) {
    if (interaction.guildId === null) {
      await interaction.respond([]);
      return;
    }
    const { wants } = await ctx.wants.list(interaction.user.id, interaction.guildId);
    await interaction.respond(ownWantChoices(ctx, wants, interaction.options.getFocused()));
  },
};

const byName = (a: string, b: string): number => a.localeCompare(b, 'en');

/**
 * The member's list as an embed: the Pokémon by what they are wanted for, then the raid tiers
 * and the IV targets. A group that does not fit its field is cut with a count, so the embed
 * stays within Discord's limits whatever the number of rows; the description says how many rows
 * this version cannot read.
 */
export function wantsEmbed(ctx: AppContext, list: WantList): EmbedBuilder {
  const species = (scope: NotificationScope): string[] =>
    list.wants
      .filter((entry) => entry.target.kind === 'pokemon' && entry.scope === scope)
      .map((entry) => plain(wantLabel(ctx, entry.target)))
      .sort(byName);
  // The tiers in the order of the tiers: T1 before T5, the shadow tiers last.
  const tiers = notificationTiers()
    .filter((tier) =>
      list.wants.some(
        (entry) => entry.target.kind === 'tier' && sameRaidTier(entry.target.tier, tier),
      ),
    )
    .map(raidTierLabel);
  const ivs = (['perfect', 'zero'] as const)
    .filter((iv) =>
      list.wants.some((entry) => entry.target.kind === 'iv' && entry.target.iv === iv),
    )
    .map((iv) => (iv === 'perfect' ? 'Perfect' : 'Zero'));
  const groups: Array<[string, string[]]> = [
    ['Raids and spawns', species('both')],
    ['Raids', species('raid')],
    ['Spawns', species('spawn')],
    ['Raid tiers', tiers],
    ['Spawn IVs', ivs],
  ];
  const embed = new EmbedBuilder().setTitle('Your notifications in this server').addFields(
    groups
      .filter(([, names]) => names.length > 0)
      .map(([name, names]) => ({
        name: `${name} (${String(names.length)})`,
        value: fitItems(names, LIMITS.fieldValue),
      })),
  );
  const notes = ['`/want` adds to the list, `/unwant` takes off it.'];
  if (list.unreadable > 0) {
    notes.push(
      `…and ${count(list.unreadable, 'entry', 'entries')} this version cannot read; ` +
        '`/unwant-all` removes those too.',
    );
  }
  return embed.setDescription(notes.join('\n'));
}

/** `/wants` (spec 4.2): the member's list in this server, for the member alone. */
export const wants: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('wants')
    .setDescription('Show the Pokémon and raid tiers you get DMs for'),
  help: {
    category: 'notifications',
    details:
      'Shows your list for this server: the Pokémon by whether you want their raids, their ' +
      'spawns or both, the raid tiers and the IV targets.',
    examples: ['/wants'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const list = await ctx.wants.list(interaction.user.id, guildOf(interaction));
    if (list.wants.length === 0 && list.unreadable === 0) {
      await interaction.editReply({
        content:
          'Your list for this server is empty. `/want` puts a Pokémon or a raid tier on it, ' +
          'and I send you a DM when one is reported.',
      });
      return;
    }
    await interaction.editReply({ embeds: [wantsEmbed(ctx, list)] });
  },
};

const allWants = removeAllQuestion({
  kind: 'wants',
  command: '/unwant-all',
  count: (ctx, memberId, guildId) => ctx.wants.count(memberId, guildId),
  removeAll: (ctx, memberId, guildId) => ctx.wants.removeAll(memberId, guildId),
  none: 'Your list for this server is empty: there is nothing to remove.',
  question: (n) =>
    `Remove ${n === 1 ? 'the one entry' : `all ${String(n)} entries`} of your list for this ` +
    'server? You will get no DMs for Pokémon or raid tiers here any more.',
  button: (n) => (n === 1 ? 'Remove it' : `Remove all ${String(n)}`),
  removed: (n) => `Removed ${count(n, 'entry', 'entries')}: your list for this server is empty.`,
});

/** `/unwant-all` (spec 4.2): empties the member's list in this server, after asking. */
export const unwantAll: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('unwant-all')
    .setDescription('Take everything off your list of Pokémon and raid tiers'),
  help: {
    category: 'notifications',
    details:
      'Empties your list for this server, after asking you once. Your lists in other servers ' +
      'stay as they are.',
    examples: ['/unwant-all'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: NOTIFICATION_THROTTLE,
  execute: (interaction, ctx) => allWants.ask(interaction, ctx),
};

/** The two buttons of `/unwant-all`. */
export const wantControls = allWants.controls;
```

Apply to `src/commands/settings/settings.ts`:

```diff
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -2,7 +2,9 @@ import {
   InteractionContextType,
   SlashCommandBuilder,
   SlashCommandSubcommandBuilder,
+  type ChatInputCommandInteraction,
 } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
 import type { UserSettings } from '../../db/repositories/user-repository.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
@@ -203,6 +205,20 @@ export function settingsLines(settings: UserSettings): string[] {
   return lines;
 }
 
+/**
+ * What the member has on their lists in the server the command was used in, where this
+ * installation notifies at all: nothing in a DM, where there is no server to count for.
+ */
+async function listLines(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Promise<string[]> {
+  const { guildId } = interaction;
+  if (guildId === null || !ctx.config.settings.features.notifications) return [];
+  const wanted = await ctx.wants.count(interaction.user.id, guildId);
+  return [`Pokémon and raid tiers on your list in this server: **${String(wanted)}** · \`/wants\``];
+}
+
 const show: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('show')
@@ -211,13 +227,14 @@ const show: SubcommandPart = {
     details:
       'Lists your settings for pings and direct messages, the status you get when you report ' +
       'a raid, whether your reports name you, and your friend code and in-game name when ' +
-      'you registered them.',
+      'you registered them. In a server it also says how many Pokémon and raid tiers are on ' +
+      'your list there.',
     examples: ['/settings show'],
   },
   defer: 'ephemeral',
   async execute(interaction, ctx) {
     const settings = await ctx.users.get(interaction.user.id);
-    const lines = settingsLines(settings);
+    const lines = [...settingsLines(settings), ...(await listLines(interaction, ctx))];
     await interaction.editReply({
       content: `**Your settings**\n${lines.map((line) => `- ${line}`).join('\n')}`,
     });
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,4 +1,5 @@
 import { infoControls } from '../commands/meetups/info.js';
+import { wantControls } from '../commands/notifications/wants.js';
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import type { ComponentHandler } from '../discord/command.js';
@@ -9,5 +10,6 @@ export const components: readonly ComponentHandler[] = [
   raidControls,
   locationControls,
   infoControls,
+  wantControls,
   partyButtons,
 ];
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/settings/settings.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff c28b34f -- src test   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/commands/index.ts src/commands/notifications/remove-all.ts src/commands/notifications/want-input.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/components/index.ts test/support/test-context.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/commands/index.ts src/commands/notifications/remove-all.ts src/commands/notifications/want-input.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/components/index.ts test/support/test-context.ts
git commit -m "The want, unwant, wants and unwant-all commands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,845 unit tests.

---

### Task 5: Gym targets: their repository and the target commands

**Files:**
- Create: `src/commands/notifications/targets.test.ts`, `src/commands/notifications/targets.ts`, `src/db/repositories/gym-notification-repository.db.test.ts`, `src/db/repositories/gym-notification-repository.test.ts`, `src/db/repositories/gym-notification-repository.ts`, `test/support/targets.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/index.ts`, `src/commands/notifications/wants.ts`, `src/commands/raids/raid-input.test.ts`, `src/commands/raids/raid-input.ts`, `src/commands/settings/settings.test.ts`, `src/commands/settings/settings.ts`, `src/components/index.ts`, `src/services/region-directory.ts`, `src/services/train-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Task 3's `withMemberLocked`; Task 4's `remove-all.ts`; `reportedGym`, `gymChoices` and the private `gymHits` of `src/commands/raids/raid-input.ts`; `partyOf`, `currentStop`; `ctx.gyms`, `ctx.regions`; `TrainService.reaches`.
- Produces: `GymNotificationRepository` behind `TargetStorage` (`list`, `add`, `remove`, `removeAll`, `count`); `MemoryTargets` in `test/support/targets.ts`; `ctx.targets`; `gymInGuild` in `src/services/region-directory.ts` (a gym belongs to a server by the row of its region), used by `/target`, `sameServer` and `TrainService.reaches`; an optional `accepts(gym)` filter on `reportedGym` / `gymChoices`; `/target [gym]`, `/untarget [gym]`, `/targets`, `/untarget-all` (`src/commands/notifications/targets.ts`; custom-id kinds `targets` and `target`); the count of gyms in `/settings show`.

Without `accepts`, `reportedGym` and `gymChoices` behave exactly as before: the existing tests of `raid-input.test.ts` are not changed, only added to.

Reference commit of the prototype for this task: `2d6d828`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/notifications/targets.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB } from '../../../test/support/parties.js';
import { createdMeetup, createdTrain, reportedRaid } from '../../../test/support/party-service.js';
import { MemoryTargets } from '../../../test/support/targets.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { LIMITS } from '../../render/text.js';
import {
  ownTargetChoices,
  target,
  targetControls,
  targetRemovalControls,
  targets,
  targetsEmbed,
  untarget,
  untargetAll,
} from './targets.js';

const OTHER_GUILD = '499999999999999999';
/** The channels of the fakes' server: the regions West and East. */
const SERVER = { [WEST_CHANNEL]: 'west', [EAST_CHANNEL]: 'east', '600000000000000001': 'general' };
const MAPS = (lat: number, lon: number) =>
  `[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=${String(lat)}%2C${String(lon)}>)`;

function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
  const store = new MemoryTargets();
  const { ctx } = createTestContext({ targets: store, ...overrides });
  const router = new InteractionRouter(
    ctx,
    [target, untarget, targets, untargetAll],
    [targetControls, targetRemovalControls],
  );
  const run = async (
    commandName: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName,
      userId: ALICE,
      guildChannelNames: SERVER,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered: the deferred answer, or a refusal. */
  const answer = async (
    commandName: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const used = await run(commandName, options, extra);
    const mock = used.editReply.mock.calls.length > 0 ? used.editReply : used.followUp;
    return sent(mock).content;
  };
  const choices = async (commandName: string, focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName,
      userId: ALICE,
      guildChannelNames: SERVER,
      focusedName: 'gym',
      focused,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction.respond.mock.calls[0]?.[0] ?? [];
  };
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const gymsOf = (member = ALICE, guild = FAKE_GUILD_ID) =>
    store.rows
      .filter((row) => row.memberId === member && row.guildId === guild)
      .map((row) => row.gym);
  return { ctx, store, router, run, answer, choices, handle, gymsOf };
}

/** The controls of the first row of a reply. */
function controls(interaction: FakeInteraction) {
  const row = sent(interaction.editReply).components?.[0] as {
    toJSON(): {
      components: {
        custom_id: string;
        label?: string;
        options?: { label: string; value: string }[];
      }[];
    };
  };
  return row.toJSON().components;
}

describe('the target commands', () => {
  it('exist only where notifications are switched on, with help in the notifications category', () => {
    const { ctx } = createTestContext();
    const off = {
      ...ctx.config,
      settings: {
        ...ctx.config.settings,
        features: { ...ctx.config.settings.features, notifications: false },
      },
    };
    for (const command of [target, untarget, targets, untargetAll]) {
      expect(command.enabled?.(ctx.config)).toBe(true);
      expect(command.enabled?.(off)).toBe(false);
      expect(command.help.category).toBe('notifications');
      expect(command.help.details).toBeTruthy();
      expect(command.help.examples?.length).toBeGreaterThan(0);
    }
  });

  it('work in a server only, and answer the member alone', async () => {
    const made = setup();
    const dm = await made.run('target', { gym: 'g:1' }, { isDm: true });
    expect(dm.reply).toHaveBeenCalledWith({
      content: 'This only works in a server.',
      flags: MessageFlags.Ephemeral,
    });
    const used = await made.run('target', { gym: 'g:1' });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });
});

describe('/target', () => {
  it('makes a picked gym a target without asking, with its maps link and how to undo it', async () => {
    const made = setup();
    expect(await made.answer('target', { gym: 'g:1' })).toBe(
      '**The Stacks** (Pinewood Public Library) is one of your gyms now: you will get a DM ' +
        `when a raid is reported there. ${MAPS(40.05, -80.05)}\n\`/untarget\` takes it off again.`,
    );
    expect(await made.answer('target', { gym: 'g:1' })).toBe(
      `**The Stacks** (Pinewood Public Library) is one of your gyms already. ${MAPS(40.05, -80.05)}`,
    );
    expect(made.gymsOf()).toEqual(['1']);
  });

  it('acts on text that one gym has every word of, from any channel of the server', async () => {
    const made = setup();
    // The channel is no region: all gyms of the server are searched.
    expect(await made.answer('target', { gym: 'stone fountain' })).toMatch(
      /^\*\*Old Stone Fountain\*\* is one of your gyms now/,
    );
    // From West, a gym deep in East.
    await made.run('target', { gym: 'fresco' }, { channelId: WEST_CHANNEL });
    expect(made.gymsOf()).toEqual(['2', '8']);
  });

  it('offers a menu when the text is unclear, and makes the chosen gym a target', async () => {
    const made = setup();
    const asked = await made.run('target', { gym: 'starbucks' });
    expect(sent(asked.editReply).content).toBe(
      'Several gyms fit "starbucks". Which one do you mean?',
    );
    const [menu] = controls(asked);
    expect(menu?.custom_id).toMatch(/^target:[0-9a-f]{16}:gym$/);
    expect(menu?.options?.map((option) => option.value).sort()).toEqual(['5', '9']);
    expect(made.store.rows).toEqual([]);
    const chosen = await made.handle(
      fakeSelect({
        customId: menu?.custom_id ?? '',
        userId: ALICE,
        values: ['9'],
        guildChannelNames: SERVER,
      }),
    );
    expect(chosen.deferUpdate).toHaveBeenCalled();
    expect(sent(chosen.editReply).content).toMatch(/^\*\*Starbucks\*\* is one of your gyms now/);
    expect(sent(chosen.editReply).components).toEqual([]);
    expect(made.gymsOf()).toEqual(['9']);
    // The menu is answered once.
    const again = await made.handle(
      fakeSelect({ customId: menu?.custom_id ?? '', userId: ALICE, values: ['5'] }),
    );
    expect(again.update).toHaveBeenCalledWith({
      content: 'That choice has expired. Use the command again.',
      components: [],
    });
  });

  it('offers a misspelt gym instead of acting on it', async () => {
    const made = setup();
    const asked = await made.run('target', { gym: 'fountian' }, { channelId: WEST_CHANNEL });
    expect(sent(asked.editReply).content).toBe('Did you mean this gym?');
    expect(made.store.rows).toEqual([]);
  });

  it('lets only the asker use the menu, and takes no gym that was not offered', async () => {
    const made = setup();
    const asked = await made.run('target', { gym: 'starbucks' });
    const id = controls(asked)[0]?.custom_id ?? '';
    const other = await made.handle(fakeSelect({ customId: id, userId: BOB, values: ['9'] }));
    expect(other.reply).toHaveBeenCalledWith({
      content: 'That is somebody else’s choice.',
      flags: MessageFlags.Ephemeral,
    });
    const odd = await made.handle(
      fakeSelect({ customId: id, userId: ALICE, values: ['1'], guildChannelNames: SERVER }),
    );
    // The menu is used up, so its own message says so and loses the menu.
    expect(odd.update).toHaveBeenCalledWith({
      content: 'That gym no longer exists. Use the command again.',
      components: [],
    });
    expect(made.store.rows).toEqual([]);
  });

  it('takes only a gym that lies in a region of this server', async () => {
    const made = setup();
    // Gym 10 lies in no region.
    expect(await made.answer('target', { gym: 'g:10' })).toBe(
      'I found no gym of this server for "g:10". Type part of its name and pick it from the list.',
    );
    expect(await made.answer('target', { gym: 'trailhead' })).toMatch(
      /^I found no gym of this server for "trailhead"/,
    );
    // A server that the regions' rows do not name has none of these gyms.
    expect(await made.answer('target', { gym: 'g:1' }, { guildId: OTHER_GUILD })).toMatch(
      /^I found no gym of this server/,
    );
    expect(await made.answer('target', { gym: 'zzzzzz' })).toMatch(
      /^I found no gym of this server/,
    );
    expect(made.store.rows).toEqual([]);
  });

  it('goes by the rows of the regions, not by the channels the bot has in its cache', async () => {
    const made = setup();
    // The text channel of West is gone from the server; its row, and so its gyms, remain.
    expect(
      await made.answer('target', { gym: 'g:1' }, { guildChannelNames: { '1': 'general' } }),
    ).toMatch(/^\*\*The Stacks\*\* \(Pinewood Public Library\) is one of your gyms now/);
    expect(await made.choices('target', 'libr', { guildChannelNames: {}, channelId: '1' })).toEqual(
      [{ name: 'Pinewood Public Library · The Stacks', value: 'g:1' }],
    );
    const listed = await made.run('targets', {}, { guildChannelNames: {} });
    expect(sent(listed.editReply).embeds?.[0]?.toJSON().description).toContain(
      `<#${WEST_CHANNEL}> (1)\nThe Stacks`,
    );
  });

  it('means the gym of the raid in whose post it is used', async () => {
    const raid = await reportedRaid();
    const made = setup({ parties: raid.store, regions: raid.regions });
    const inPost = { channelId: raid.postId, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('target', {}, inPost)).toMatch(
      /^\*\*The Stacks\*\* \(Pinewood Public Library\) is one of your gyms now/,
    );
    expect(made.gymsOf()).toEqual(['1']);
    expect(await made.answer('untarget', {}, inPost)).toBe(
      '**The Stacks** (Pinewood Public Library) is no longer one of your gyms.',
    );
    expect(made.gymsOf()).toEqual([]);
  });

  it('means the stop a train is at, and says so when it is at none', async () => {
    const train = await createdTrain({ route: [4, 1] });
    const made = setup({ parties: train.store, regions: train.regions });
    const inPost = { channelId: train.postId, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('target', {}, inPost)).toMatch(
      /^\*\*Veterans Memorial Bridge\*\* is one of your gyms now/,
    );
    const empty = await createdTrain();
    const other = setup({ parties: empty.store, regions: empty.regions });
    expect(
      await other.answer(
        'target',
        {},
        { channelId: empty.postId, thread: { parentId: WEST_FORUM } },
      ),
    ).toBe('This train is at no gym right now. Say which gym with the `gym` option.');
  });

  it('says how to name a gym outside a post, and in the post of a meetup', async () => {
    const made = setup();
    const said =
      'Say which gym: type part of its name in `gym` and pick it from the list. In the post of a ' +
      'raid or a train you can leave it out, for the gym of that raid or the stop the train is at.';
    expect(await made.answer('target')).toBe(said);
    expect(await made.answer('untarget')).toBe(said);
    const meetup = await createdMeetup();
    const inMeetup = setup({ parties: meetup.store, regions: meetup.regions });
    expect(
      await inMeetup.answer(
        'target',
        {},
        { channelId: meetup.postId, thread: { parentId: WEST_FORUM } },
      ),
    ).toBe('This meetup is at no gym right now. Say which gym with the `gym` option.');
  });

  it('keeps targets per server and per member, without a limit', async () => {
    const made = setup();
    for (let gym = 100; gym < 230; gym++) made.store.addRow(ALICE, FAKE_GUILD_ID, String(gym));
    made.store.addRow(ALICE, OTHER_GUILD, '2');
    await made.run('target', { gym: 'g:1' });
    await made.run('target', { gym: 'g:3' }, { userId: BOB });
    expect(made.gymsOf()).toHaveLength(131);
    expect(made.gymsOf(ALICE, OTHER_GUILD)).toEqual(['2']);
    expect(made.gymsOf(BOB)).toEqual(['3']);
  });

  it('lists the gyms of this server that fit, the region’s own first', async () => {
    const made = setup();
    expect(await made.choices('target', 'libr', { channelId: WEST_CHANNEL })).toEqual([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
    const anywhere = await made.choices('target', 'starbucks');
    expect(anywhere.map((choice) => choice.value).sort()).toEqual(['g:5', 'g:9']);
    // Nothing typed: the region's own gyms; outside a region, nothing to go by.
    expect((await made.choices('target', '', { channelId: WEST_CHANNEL })).length).toBeGreaterThan(
      5,
    );
    expect(await made.choices('target', '')).toEqual([]);
    // Gym 10 is in no region of the server.
    expect(await made.choices('target', 'trailhead')).toEqual([]);
  });
});

describe('/untarget', () => {
  it('removes a picked gym, and says when it was none of the member’s', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '2');
    made.store.addRow(BOB, FAKE_GUILD_ID, '3');
    expect(await made.answer('untarget', { gym: 'g:2' })).toBe(
      '**Old Stone Fountain** is no longer one of your gyms.',
    );
    expect(await made.answer('untarget', { gym: 'g:3' })).toBe(
      "**St. Mary's Church** is not one of your gyms. `/targets` shows them.",
    );
    expect(made.store.rows.map((row) => row.gym)).toEqual(['3']);
  });

  it('removes a target whose gym no longer exists', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '999');
    expect(await made.answer('untarget', { gym: 'g:999' })).toBe(
      'That gym is no longer one of your gyms.',
    );
    expect(made.store.rows).toEqual([]);
  });

  it('reads typed text against the member’s own gyms only', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '9');
    made.store.addRow(ALICE, FAKE_GUILD_ID, '2');
    // Two gyms are called Starbucks; only one is the member's.
    expect(await made.answer('untarget', { gym: 'starbucks' })).toBe(
      '**Starbucks** is no longer one of your gyms.',
    );
    expect(made.gymsOf()).toEqual(['2']);
    expect(await made.answer('untarget', { gym: 'library' })).toBe(
      'None of your gyms fits "library". `/targets` shows them.',
    );
  });

  it('offers a menu when the text fits several of the member’s gyms, and removes the chosen one', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '5');
    made.store.addRow(ALICE, FAKE_GUILD_ID, '9');
    const asked = await made.run('untarget', { gym: 'starbucks' });
    const [menu] = controls(asked);
    expect(menu?.options?.map((option) => option.value).sort()).toEqual(['5', '9']);
    const chosen = await made.handle(
      fakeSelect({ customId: menu?.custom_id ?? '', userId: ALICE, values: ['5'] }),
    );
    expect(sent(chosen.editReply).content).toBe('**Starbucks** is no longer one of your gyms.');
    expect(made.gymsOf()).toEqual(['9']);
  });

  it('lists the member’s own gyms of this server, by name, narrowed to what was typed', async () => {
    const made = setup();
    for (const gym of ['9', '1', '2', '999', 'nowhere'])
      made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    made.store.addRow(ALICE, OTHER_GUILD, '3');
    made.store.addRow(BOB, FAKE_GUILD_ID, '4');
    expect(await made.choices('untarget', '')).toEqual([
      { name: 'Old Stone Fountain', value: 'g:2' },
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
      { name: 'Starbucks', value: 'g:9' },
    ]);
    expect(await made.choices('untarget', 'stacks')).toEqual([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
    // What begins with the text comes before what only holds it.
    expect((await made.choices('untarget', 'st')).map((choice) => choice.value)).toEqual([
      'g:9',
      'g:2',
      'g:1',
    ]);
    expect(await made.choices('untarget', '', { isDm: true })).toEqual([]);
  });

  it('answers the list with nothing when the targets cannot be read', async () => {
    const made = setup();
    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
    made.store.failing = new Error('the database is away');
    expect(await made.choices('untarget', 'lib')).toEqual([]);
  });

  it('shows 25 of a long list', () => {
    const { ctx } = createTestContext();
    const gym = ctx.gyms.get(1);
    if (!gym) throw new Error('no gym 1');
    const many = Array.from({ length: 60 }, (_unused, index) => ({
      ...gym,
      id: index + 1,
      name: `Gym ${String(index + 1).padStart(2, '0')}`,
      nickname: null,
    }));
    expect(ownTargetChoices(many, '')).toHaveLength(25);
    expect(ownTargetChoices(many, 'gym 4').map((choice) => choice.name)).toEqual([
      'Gym 40',
      'Gym 41',
      'Gym 42',
      'Gym 43',
      'Gym 44',
      'Gym 45',
      'Gym 46',
      'Gym 47',
      'Gym 48',
      'Gym 49',
      // Then those that hold the words elsewhere.
      'Gym 04',
      'Gym 14',
      'Gym 24',
      'Gym 34',
      'Gym 54',
    ]);
  });
});

describe('/targets', () => {
  it('points to /target when the member has none', async () => {
    const made = setup();
    expect(await made.answer('targets')).toBe(
      'You have no gyms in this server. `/target` makes a gym one of yours, and I send you a ' +
        'DM when a raid is reported there.',
    );
  });

  it('lists the gyms by region, the regions and the gyms by name', async () => {
    const made = setup();
    for (const gym of ['2', '8', '1', '7', '3']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    made.store.addRow(ALICE, OTHER_GUILD, '4');
    const used = await made.run('targets');
    const embed = sent(used.editReply).embeds?.[0]?.toJSON();
    expect(embed?.title).toBe('Your gyms in this server');
    expect(embed?.description).toBe(
      [
        `<#${EAST_CHANNEL}> (2)\nCafé Élan Fresco, Harbor Lighthouse Mural`,
        `<#${WEST_CHANNEL}> (3)\nOld Stone Fountain, St. Mary's Church, The Stacks`,
        '`/target` adds a gym, `/untarget` takes one off.',
      ].join('\n\n'),
    );
  });

  it('puts a gym outside the regions of this server under Elsewhere, and counts what it cannot read', async () => {
    const made = setup();
    for (const gym of ['1', '10', '999', 'nowhere', null]) {
      made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    }
    const used = await made.run('targets');
    expect(sent(used.editReply).embeds?.[0]?.toJSON().description).toBe(
      [
        `<#${WEST_CHANNEL}> (1)\nThe Stacks`,
        'Elsewhere (1)\nLakeview Trailhead',
        '`/target` adds a gym, `/untarget` takes one off.',
        '…and 3 entries this version cannot read (a gym that no longer exists, say); ' +
          '`/untarget-all` removes those too.',
      ].join('\n\n'),
    );
  });

  it('stays within the limits of an embed whatever the number of rows', () => {
    const { ctx } = createTestContext();
    const base = ctx.gyms.get(1);
    if (!base) throw new Error('no gym 1');
    const regions = Array.from({ length: 40 }, (_unused, index) =>
      String(900000000000000000n + BigInt(index)),
    );
    const gyms = new Map(
      Array.from({ length: 2_000 }, (_unused, index) => [
        index + 1,
        {
          ...base,
          id: index + 1,
          nickname: null,
          name: `A gym with quite a long name ${String(index)}`,
        },
      ]),
    );
    const [west] = ctx.regions.all();
    if (!west) throw new Error('no region');
    const wide = {
      ...ctx,
      gyms: {
        ...ctx.gyms,
        get: (id: number) => gyms.get(id),
        regionsOf: (id: number) => [regions[id % regions.length] ?? ''],
      },
      regions: {
        ...ctx.regions,
        byChannel: (channelId: string) => ({ ...west, channelId, guildId: 1 }),
      },
    };
    const embed = targetsEmbed(
      wide,
      { gymIds: [...gyms.keys()], unreadable: 2 },
      { guildRow: 1, nameOf: (id) => `region-${id.slice(-2)}` },
    ).toJSON();
    const description = embed.description ?? '';
    expect(description.length).toBeLessThanOrEqual(LIMITS.embedDescription);
    expect(description).toContain('(50)\n');
    expect(description).toMatch(/…and \d+ more/);
    // Forty regions do not fit: the cut says that regions were left out, and how many.
    expect(description).toMatch(/\n\n…and \d+ more regions\n\n/);
    expect(description).toContain('…and 2 entries this version cannot read');
    const few = targetsEmbed(
      wide,
      { gymIds: [...gyms.keys()].slice(0, 40), unreadable: 0 },
      { guildRow: 1, nameOf: (id) => id },
    ).toJSON();
    expect((few.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
    // A server the regions do not belong to has all of them elsewhere.
    const foreign = targetsEmbed(
      wide,
      { gymIds: [1, 2], unreadable: 0 },
      { guildRow: 2, nameOf: () => undefined },
    ).toJSON();
    expect(foreign.description).toMatch(/^Elsewhere \(2\)\n/);
  });

  it('cuts a long gym name in the list', () => {
    const { ctx } = createTestContext();
    const base = ctx.gyms.get(1);
    if (!base) throw new Error('no gym 1');
    const long = { ...base, nickname: null, name: 'Mural '.repeat(40).trim() };
    const embed = targetsEmbed(
      { ...ctx, gyms: { ...ctx.gyms, get: () => long, regionsOf: () => [WEST_CHANNEL] } },
      { gymIds: [1], unreadable: 0 },
      { guildRow: 1, nameOf: () => 'west' },
    ).toJSON();
    const [, name = ''] = (embed.description ?? '').split('\n');
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith('…')).toBe(true);
  });
});

describe('/untarget-all', () => {
  it('asks first and removes every row of the member in this server on Remove all', async () => {
    const made = setup();
    for (const gym of ['1', '2', 'nowhere']) made.store.addRow(ALICE, FAKE_GUILD_ID, gym);
    made.store.addRow(ALICE, OTHER_GUILD, '3');
    made.store.addRow(BOB, FAKE_GUILD_ID, '1');
    const asked = await made.run('untarget-all');
    expect(sent(asked.editReply).content).toBe(
      'Remove all 3 of your gyms in this server? You will get no DMs for raids at particular ' +
        'gyms here any more.',
    );
    const buttons = controls(asked);
    expect(buttons.map((button) => button.label)).toEqual(['Remove all 3', 'Keep them']);
    expect(buttons[0]?.custom_id).toMatch(/^targets:[0-9a-f]{16}:all$/);
    expect(made.store.rows).toHaveLength(5);
    const other = await made.handle(
      fakeButton({ customId: buttons[0]?.custom_id ?? '', userId: BOB }),
    );
    expect(sent(other.reply).content).toBe('That is somebody else’s question.');
    const pressed = await made.handle(
      fakeButton({ customId: buttons[0]?.custom_id ?? '', userId: ALICE }),
    );
    expect(pressed.editReply).toHaveBeenCalledWith({
      content: 'Removed 3 gyms: you have no gyms in this server any more.',
      components: [],
    });
    expect(made.gymsOf()).toEqual([]);
    expect(made.store.rows).toHaveLength(2);
  });

  it('removes nothing on Keep, and says so when there is nothing to remove', async () => {
    const made = setup();
    expect(await made.answer('untarget-all')).toBe(
      'You have no gyms in this server: there is nothing to remove.',
    );
    made.store.addRow(ALICE, FAKE_GUILD_ID, '1');
    const asked = await made.run('untarget-all');
    expect(sent(asked.editReply).content).toMatch(/^Remove your one gym in this server\?/);
    expect(controls(asked).map((button) => button.label)).toEqual(['Remove it', 'Keep them']);
    const kept = await made.handle(
      fakeButton({ customId: controls(asked)[1]?.custom_id ?? '', userId: ALICE }),
    );
    expect(kept.update).toHaveBeenCalledWith({ content: 'Nothing was removed.', components: [] });
    expect(made.gymsOf()).toEqual(['1']);
  });
});
```

Apply to `src/commands/raids/raid-input.test.ts`:

```diff
--- a/src/commands/raids/raid-input.test.ts
+++ b/src/commands/raids/raid-input.test.ts
@@ -187,6 +187,39 @@ describe('gymChoices and reportedGym', () => {
   });
 });
 
+describe('gymChoices and reportedGym among the gyms a caller accepts', () => {
+  const regionName = (channelId: string) => (channelId === EAST_CHANNEL ? 'east' : 'west');
+  const mine = new Set([2, 8, 9]);
+  const accepts = (gym: { id: number }) => mine.has(gym.id);
+
+  it('never answers with a gym that is not accepted, picked or typed', () => {
+    expect(reportedGym(ctx, WEST_CHANNEL, 'g:1', accepts)).toEqual({ kind: 'none' });
+    expect(reportedGym(ctx, WEST_CHANNEL, 'g:2', accepts)).toMatchObject({ gym: { id: 2 } });
+    expect(reportedGym(ctx, WEST_CHANNEL, 'library', accepts)).toEqual({ kind: 'none' });
+    expect(reportedGym(ctx, undefined, 'library', accepts)).toEqual({ kind: 'none' });
+  });
+
+  it('acts on a text that one accepted gym has every word of, though others have them too', () => {
+    // West has its own Starbucks (gym 5), which is not accepted: the one in East is meant.
+    expect(reportedGym(ctx, WEST_CHANNEL, 'starbucks', accepts)).toMatchObject({
+      kind: 'gym',
+      gym: { id: 9 },
+    });
+    expect(reportedGym(ctx, undefined, 'starbucks', accepts)).toMatchObject({ gym: { id: 9 } });
+    expect(reportedGym(ctx, WEST_CHANNEL, 'fresco', accepts)).toMatchObject({ gym: { id: 8 } });
+  });
+
+  it('offers only accepted gyms', () => {
+    expect(gymChoices(ctx, WEST_CHANNEL, '', regionName, accepts)).toEqual([
+      { name: 'Old Stone Fountain', value: 'g:2' },
+    ]);
+    expect(gymChoices(ctx, undefined, 'starbucks', regionName, accepts)).toEqual([
+      { name: 'Starbucks · east', value: 'g:9' },
+    ]);
+    expect(gymChoices(ctx, WEST_CHANNEL, 'library', regionName, accepts)).toEqual([]);
+  });
+});
+
 describe('reportedTime', () => {
   const egg: ReportedBoss = { tier: T5, boss: null, label: 'T5 egg' };
   const boss: ReportedBoss = { tier: T5, boss: { key: 'yveltal' }, label: 'Yveltal (T5)' };
```

Apply to `src/commands/settings/settings.test.ts`:

```diff
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -2,6 +2,7 @@ import { InteractionContextType, MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
 import { ALICE } from '../../../test/support/parties.js';
+import { MemoryTargets } from '../../../test/support/targets.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
 import { MemoryWants } from '../../../test/support/wants.js';
@@ -14,7 +15,8 @@ import { settings, settingsLines } from './settings.js';
 function setup(features: { notifications?: boolean } = {}) {
   const users = new MemoryUsers();
   const wants = new MemoryWants();
-  const { ctx } = createTestContext({ users, wants });
+  const targets = new MemoryTargets();
+  const { ctx } = createTestContext({ users, wants, targets });
   ctx.config.settings.features = { ...ctx.config.settings.features, ...features };
   const router = new InteractionRouter(ctx, [settings], []);
   const run = async (
@@ -35,7 +37,7 @@ function setup(features: { notifications?: boolean } = {}) {
   /** What the member was answered. */
   const answer = async (subcommand: string, options: Record<string, string | boolean> = {}) =>
     sent((await run(subcommand, options)).editReply).content;
-  return { users, wants, run, answer };
+  return { users, wants, targets, run, answer };
 }
 
 describe('/settings', () => {
@@ -200,6 +202,7 @@ describe('/settings show', () => {
         '- Status when you report a raid: **Interested** · `/settings auto-status`',
         '- Raid reports: **Visible** · `/settings privacy`',
         '- Pokémon and raid tiers on your list in this server: **0** · `/wants`',
+        '- Your gyms in this server: **0** · `/targets`',
       ].join('\n'),
     );
   });
@@ -209,16 +212,19 @@ describe('/settings show', () => {
     made.wants.add(ALICE, FAKE_GUILD_ID, 150, 'both');
     made.wants.add(ALICE, FAKE_GUILD_ID, -5, 'raid');
     made.wants.add(ALICE, '499999999999999999', 151, 'both');
-    expect(await made.answer('show')).toContain(
+    made.targets.addRow(ALICE, FAKE_GUILD_ID, '4');
+    const shown = await made.answer('show');
+    expect(shown).toContain(
       '- Pokémon and raid tiers on your list in this server: **2** · `/wants`',
     );
+    expect(shown).toContain('- Your gyms in this server: **1** · `/targets`');
     const dm = await made.run('show', {}, { isDm: true });
-    expect(sent(dm.editReply).content).not.toContain('on your list');
+    expect(sent(dm.editReply).content).not.toMatch(/on your list|Your gyms/);
   });
 
   it('leaves the lists out where notifications are switched off', async () => {
     const made = setup({ notifications: false });
-    expect(await made.answer('show')).not.toContain('on your list');
+    expect(await made.answer('show')).not.toMatch(/on your list|Your gyms/);
   });
 
   it('shows what was changed, and what the master switch keeps quiet', async () => {
```

Create `src/db/repositories/gym-notification-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import { MemoryTargets } from '../../../test/support/targets.js';
import type { DB } from '../types.js';
import { GymNotificationRepository, type TargetStorage } from './gym-notification-repository.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

describe('GymNotificationRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let targets: GymNotificationRepository;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    targets = new GymNotificationRepository(db);
    users = new UserRepository(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('User').execute();
    await db.deleteFrom('Guild').execute();
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
  });

  /** A row as the legacy bot may have left it. */
  const legacyRow = async (member: string, guildId: number, gym: string | null) =>
    db
      .insertInto('GymNotification')
      .values({ userId: await users.ensure(member), guildId, gym })
      .execute();
  const stored = () =>
    db.selectFrom('GymNotification').select(['gym', 'userId', 'guildId']).orderBy('id').execute();

  it('has nothing for a member without a row, and creates none by reading', async () => {
    expect(await targets.list(ALICE, HOME)).toEqual({ gymIds: [], unreadable: 0 });
    expect(await targets.count(ALICE, HOME)).toBe(0);
    expect(await targets.remove(ALICE, HOME, 4)).toBe(false);
    expect(await targets.removeAll(ALICE, HOME)).toBe(0);
    expect(await users.idFor(ALICE)).toBeUndefined();
  });

  it('adds a target as the legacy bot wrote it, once, and gives the member their row', async () => {
    expect(await targets.add(ALICE, HOME, 4)).toBe('added');
    expect(await targets.add(ALICE, HOME, 4)).toBe('exists');
    expect(await targets.add(ALICE, HOME, 12)).toBe('added');
    const userId = await users.idFor(ALICE);
    expect(userId).toBeDefined();
    expect(await stored()).toEqual([
      { gym: '4', userId, guildId: 1 },
      { gym: '12', userId, guildId: 1 },
    ]);
    expect(await targets.list(ALICE, HOME)).toEqual({ gymIds: [4, 12], unreadable: 0 });
    expect(await targets.count(ALICE, HOME)).toBe(2);
  });

  it('keeps the settings of a member who has a row already', async () => {
    await users.update(ALICE, { mentions: false });
    const id = await users.idFor(ALICE);
    await targets.add(ALICE, HOME, 4);
    expect(await users.idFor(ALICE)).toBe(id);
    expect((await users.get(ALICE)).mentions).toBe(false);
  });

  it('keeps targets apart by member and by server', async () => {
    await targets.add(ALICE, HOME, 4);
    await targets.add(ALICE, AWAY, 5);
    await targets.add(BOB, HOME, 6);
    expect((await targets.list(ALICE, HOME)).gymIds).toEqual([4]);
    expect((await targets.list(ALICE, AWAY)).gymIds).toEqual([5]);
    expect((await targets.list(BOB, HOME)).gymIds).toEqual([6]);
    expect(await targets.remove(BOB, HOME, 4)).toBe(false);
    expect(await targets.remove(ALICE, HOME, 4)).toBe(true);
    expect(await targets.remove(ALICE, HOME, 4)).toBe(false);
    expect(await stored()).toHaveLength(2);
  });

  it('reads legacy rows: one target for several rows of a gym, and what is no gym id counted', async () => {
    await legacyRow(ALICE, 1, '4');
    await legacyRow(ALICE, 1, '7');
    await legacyRow(ALICE, 1, '4');
    await legacyRow(ALICE, 1, null);
    await legacyRow(ALICE, 1, 'the library');
    expect(await targets.list(ALICE, HOME)).toEqual({ gymIds: [4, 7], unreadable: 2 });
    expect(await targets.count(ALICE, HOME)).toBe(4);
    // Adding what is there leaves one row of it; the rows that cannot be read stay.
    expect(await targets.add(ALICE, HOME, 4)).toBe('exists');
    expect((await stored()).map((row) => row.gym)).toEqual(['4', '7', null, 'the library']);
    // Removing takes every row of the gym.
    await legacyRow(ALICE, 1, '7');
    expect(await targets.remove(ALICE, HOME, 7)).toBe(true);
    expect((await stored()).map((row) => row.gym)).toEqual(['4', null, 'the library']);
  });

  it('removes all rows of a member in one server, also those it cannot read', async () => {
    await legacyRow(ALICE, 1, '4');
    await legacyRow(ALICE, 1, 'nowhere');
    await legacyRow(ALICE, 2, '5');
    await legacyRow(BOB, 1, '4');
    expect(await targets.removeAll(ALICE, HOME)).toBe(2);
    expect(await targets.removeAll(ALICE, HOME)).toBe(0);
    expect((await stored()).map((row) => [row.gym, row.guildId])).toEqual([
      ['5', 2],
      ['4', 1],
    ]);
  });

  it('has no limit on the targets of a member', async () => {
    for (let gym = 1; gym <= 130; gym++) await targets.add(ALICE, HOME, gym);
    expect(await targets.count(ALICE, HOME)).toBe(130);
  });

  it('makes one row when the same target is added many times at once', async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => targets.add(ALICE, HOME, 4)),
    );
    expect(outcomes.filter((outcome) => outcome === 'added')).toHaveLength(1);
    expect(await stored()).toHaveLength(1);
  });

  it('lets different members add targets at the same time', async () => {
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234600n + BigInt(index)),
    );
    const outcomes = await Promise.all(members.map((member) => targets.add(member, HOME, 4)));
    expect(outcomes.every((outcome) => outcome === 'added')).toBe(true);
    expect(await stored()).toHaveLength(12);
  });

  it('lets different members add their first targets at once in a server that has no row yet', async () => {
    const other = '499999999999999998';
    const members = Array.from({ length: 12 }, (_unused, index) =>
      String(312345678901234700n + BigInt(index)),
    );
    const outcomes = await Promise.all(members.map((member) => targets.add(member, other, 4)));
    expect(outcomes.every((outcome) => outcome === 'added')).toBe(true);
    const guilds = await db
      .selectFrom('Guild')
      .select('id')
      .where('snowflake', '=', other)
      .execute();
    expect(guilds).toHaveLength(1);
    expect(await stored()).toHaveLength(12);
  });

  it('behaves as its twin in memory does', async () => {
    const memory = new MemoryTargets();
    // What the legacy bot may have left: a duplicate, and a row that is no gym id.
    for (const gym of ['7', '7', 'the library']) {
      await legacyRow(ALICE, 1, gym);
      memory.addRow(ALICE, HOME, gym);
    }
    const script = async (storage: TargetStorage) => [
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, HOME),
      await storage.add(ALICE, HOME, 7),
      await storage.list(ALICE, HOME),
      await storage.add(ALICE, HOME, 4),
      await storage.add(ALICE, HOME, 4),
      await storage.add(ALICE, AWAY, 9),
      await storage.add(BOB, HOME, 5),
      await storage.list(ALICE, HOME),
      await storage.count(ALICE, AWAY),
      await storage.remove(ALICE, HOME, 5),
      await storage.remove(ALICE, HOME, 4),
      await storage.removeAll(BOB, HOME),
      await storage.list(BOB, HOME),
      await storage.count(ALICE, HOME),
    ];
    expect(await script(targets)).toEqual(await script(memory));
  });
});
```

Create `src/db/repositories/gym-notification-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readTargets, rowsOfTarget, targetGymId } from './gym-notification-repository.js';

describe('targetGymId, readTargets, rowsOfTarget', () => {
  it('reads a gym id from the stored text, and nothing else', () => {
    expect(targetGymId('12')).toBe(12);
    expect(targetGymId(' 12 ')).toBe(12);
    for (const text of [null, '', '0', '-3', '1.5', 'abc', '12a', '12345678901']) {
      expect(targetGymId(text)).toBeUndefined();
    }
  });

  it('reads each gym once and counts what is no gym id', () => {
    const rows = [
      { id: 3, gym: '7' },
      { id: 1, gym: '4' },
      { id: 5, gym: '7' },
      { id: 6, gym: null },
      { id: 8, gym: 'library' },
    ];
    expect(readTargets(rows)).toEqual({ gymIds: [7, 4], unreadable: 2 });
    expect(rowsOfTarget(rows, 7)).toEqual([3, 5]);
    expect(rowsOfTarget(rows, 9)).toEqual([]);
  });
});
```

Create `test/support/targets.ts`:

```ts
import {
  readTargets,
  rowsOfTarget,
  type TargetList,
  type TargetRow,
  type TargetStorage,
} from '../../src/db/repositories/gym-notification-repository.js';

interface Row extends TargetRow {
  memberId: string;
  guildId: string;
}

/**
 * The targets kept in memory as `GymNotificationRepository` keeps them, whose behaviour
 * gym-notification-repository.db.test.ts pins down: rows per member and server, read through
 * the same functions. `addRow` puts a row as the legacy bot may have left it. Set `failing` to
 * make every call reject.
 */
export class MemoryTargets implements TargetStorage {
  failing: Error | undefined;
  readonly rows: Row[] = [];
  private nextId = 1;

  private attempt<T>(work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  private of(memberId: string, guildId: string): Row[] {
    return this.rows.filter((row) => row.memberId === memberId && row.guildId === guildId);
  }

  private drop(ids: readonly number[]): void {
    for (const id of ids) {
      const index = this.rows.findIndex((row) => row.id === id);
      if (index >= 0) this.rows.splice(index, 1);
    }
  }

  /** A row as it may stand in the table, for a test: any text as its gym. */
  addRow(memberId: string, guildId: string, gym: string | null): number {
    const id = this.nextId++;
    this.rows.push({ id, memberId, guildId, gym });
    return id;
  }

  list(memberId: string, guildId: string): Promise<TargetList> {
    return this.attempt(() => readTargets(this.of(memberId, guildId)));
  }

  count(memberId: string, guildId: string): Promise<number> {
    return this.attempt(() => {
      const { gymIds, unreadable } = readTargets(this.of(memberId, guildId));
      return gymIds.length + unreadable;
    });
  }

  add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'> {
    return this.attempt(() => {
      const [kept, ...duplicates] = rowsOfTarget(this.of(memberId, guildId), gymId);
      this.drop(duplicates);
      if (kept !== undefined) return 'exists';
      this.addRow(memberId, guildId, String(gymId));
      return 'added';
    });
  }

  remove(memberId: string, guildId: string, gymId: number): Promise<boolean> {
    return this.attempt(() => {
      const ids = rowsOfTarget(this.of(memberId, guildId), gymId);
      this.drop(ids);
      return ids.length > 0;
    });
  }

  removeAll(memberId: string, guildId: string): Promise<number> {
    return this.attempt(() => {
      const ids = this.of(memberId, guildId).map((row) => row.id);
      this.drop(ids);
      return ids.length;
    });
  }
}
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -9,6 +9,7 @@ import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import type { TimedPartyService } from '../../src/services/timed-party-service.js';
 import type { TrainService } from '../../src/services/train-service.js';
+import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { catalogueFixture } from './game-data.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
@@ -16,6 +17,7 @@ import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
+import { MemoryTargets } from './targets.js';
 import { TEST_ENV } from './test-env.js';
 import { MemoryUsers } from './users.js';
 import { MemoryWants } from './wants.js';
@@ -49,11 +51,14 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
     regions: regionsFixture(),
+    // The invented regions belong to the guild of row 1, the server of the fake interactions.
+    guilds: { idFor: (snowflake) => Promise.resolve(snowflake === FAKE_GUILD_ID ? 1 : undefined) },
     parties: noParties(),
     // Every member has the default settings.
     users: new MemoryUsers(),
-    // Nobody wants anything; a test passes its own `MemoryWants` to fill and read it.
+    // Nobody wants or targets anything; a test passes its own stores to fill and read them.
     wants: new MemoryWants(),
+    targets: new MemoryTargets(),
     partyService: unavailable<PartyService>(
       'partyService',
       'pass { partyService, parties, regions } from partyServiceWith()',
```

Run: `npx vitest run --project unit src/commands/notifications/targets.test.ts src/commands/raids/raid-input.test.ts src/commands/settings/settings.test.ts src/db/repositories/gym-notification-repository.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -1,5 +1,6 @@
 import type { Kysely } from 'kysely';
 import type { Config } from './config/index.js';
+import type { TargetStorage } from './db/repositories/gym-notification-repository.js';
 import type { WantStorage } from './db/repositories/pokemon-notification-repository.js';
 import type { UserSettingsStore } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
@@ -37,6 +38,8 @@ export interface AppContext {
   readonly gyms: GymProvider;
   /** The regions: by id, by text channel and by forum. */
   readonly regions: RegionProvider;
+  /** The row of a server (`Guild.id`), by which regions and parties say whose they are. */
+  readonly guilds: { idFor(snowflake: string): Promise<number | undefined> };
   /** The raids, trains and meetups that have not ended. */
   readonly parties: PartyProvider;
   /** Parties on Discord: reporting a raid, making a train or meetup, keeping posts and summaries up to date. */
@@ -55,6 +58,8 @@ export interface AppContext {
   readonly users: UserSettingsStore;
   /** What members want to be notified about: Pokémon, raid tiers, IV targets, per server. */
   readonly wants: WantStorage;
+  /** The gyms members want to be notified about, per server. */
+  readonly targets: TargetStorage;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -8,6 +8,7 @@ import { createDb } from './db/kysely.js';
 import { runMigrations } from './db/migrator.js';
 import { AccessGrantRepository } from './db/repositories/access-grant-repository.js';
 import { GuildRepository } from './db/repositories/guild-repository.js';
+import { GymNotificationRepository } from './db/repositories/gym-notification-repository.js';
 import { GymRepository } from './db/repositories/gym-repository.js';
 import { PartyRepository } from './db/repositories/party-repository.js';
 import { PokemonNotificationRepository } from './db/repositories/pokemon-notification-repository.js';
@@ -223,6 +224,7 @@ export async function startApp(
     raidEvents,
     gyms,
     regions,
+    guilds,
     parties,
     partyService,
     attendance,
@@ -232,6 +234,7 @@ export async function startApp(
     clickAnswers,
     users,
     wants: new PokemonNotificationRepository(db),
+    targets: new GymNotificationRepository(db),
     pokemon,
     maps,
     features: requested,
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -7,6 +7,7 @@ import { group } from './parties/group.js';
 import { deleteParty } from './parties/delete.js';
 import { cancelMeet, meet } from './parties/meet.js';
 import { name } from './parties/name.js';
+import { target, targets, untarget, untargetAll } from './notifications/targets.js';
 import { unwant, unwantAll, want, wants } from './notifications/wants.js';
 import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
@@ -61,5 +62,9 @@ export const commands: readonly CommandModule[] = [
   unwant,
   wants,
   unwantAll,
+  target,
+  untarget,
+  targets,
+  untargetAll,
   admin,
 ];
```

Create `src/commands/notifications/targets.ts`:

```ts
import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { TargetList } from '../../db/repositories/gym-notification-repository.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { ComponentHandler, LocatedInteraction, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { isRaid, isTrain, partyWord } from '../../domain/party/party.js';
import { currentStop } from '../../domain/party/train.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import { count, fitItems, LIMITS, plain, truncate } from '../../render/text.js';
import { PendingRequests } from '../../services/pending-requests.js';
import { gymInGuild } from '../../services/region-directory.js';
import { gymChoices, MAX_CHOICES, reportedGym, type Choice } from '../raids/raid-input.js';
import { removeAllQuestion } from './remove-all.js';
import { NOTIFICATION_THROTTLE, notificationsEnabled } from './wants.js';

/** The custom-id kind of the gym menu of `/target` and `/untarget`. */
const MENU_KIND = 'target';
const EXPIRED = 'That choice has expired. Use the command again.';

/** A menu that waits for the member to choose one of the gyms their text fits. */
interface PendingChoice {
  /** What choosing does: make the gym a target, or stop it being one. */
  mode: 'add' | 'remove';
  gymIds: number[];
}

const pending = new PendingRequests<PendingChoice>();

type Answerable = ChatInputCommandInteraction | StringSelectMenuInteraction;

/** The server a command was used in; the guard `requireGuild` has checked that there is one. */
function guildOf(interaction: LocatedInteraction): string {
  if (interaction.guildId === null) throw new UserError('This only works in a server.');
  return interaction.guildId;
}

/**
 * The row of the server an interaction came from (`Guild.id`), by which its regions are known;
 * undefined outside a server and for a server the bot has no row for (it then has no regions).
 */
async function serverOf(
  interaction: LocatedInteraction,
  ctx: AppContext,
): Promise<number | undefined> {
  return interaction.guildId === null ? undefined : ctx.guilds.idFor(interaction.guildId);
}

/** Whether a gym lies in a region of a server (`gymInGuild`); no gym does in no server. */
function inServer(ctx: AppContext, guildRow: number | undefined): (gym: Gym) => boolean {
  return (gym) => guildRow !== undefined && gymInGuild(ctx.gyms, ctx.regions, gym.id, guildRow);
}

/** A gym as a sentence names it: `**The Stacks** (Pinewood Public Library)`. */
function gymText(gym: Gym): string {
  // A nickname that was cleared to an empty text names nothing, so it is tested for truth.
  return gym.nickname
    ? `**${plain(gym.nickname)}** (${plain(gym.name)})`
    : `**${plain(gym.name)}**`;
}

const mapsLink = (gym: Gym): string => `[Open in Google Maps](<${gymMapsUrl(gym)}>)`;

const SAY_WHICH =
  'Say which gym: type part of its name in `gym` and pick it from the list. In the post of a ' +
  'raid or a train you can leave it out, for the gym of that raid or the stop the train is at.';

/**
 * The gym a command without the `gym` option means: that of the raid whose post it was used in,
 * or the stop the train of that post is at. Throws a `UserError` that says how to name a gym
 * anywhere else, and in the post of a party that is at no gym.
 */
function gymOfPost(interaction: ChatInputCommandInteraction, ctx: AppContext): Gym {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(SAY_WHICH);
  let gymId: number | null | undefined;
  if (isRaid(party)) gymId = party.gymId;
  else if (isTrain(party)) gymId = currentStop(party);
  const gym = gymId === null || gymId === undefined ? undefined : ctx.gyms.get(gymId);
  if (!gym) {
    throw new UserError(
      `This ${partyWord(party)} is at no gym right now. Say which gym with the \`gym\` option.`,
    );
  }
  return gym;
}

async function addTarget(interaction: Answerable, ctx: AppContext, gym: Gym): Promise<void> {
  const outcome = await ctx.targets.add(interaction.user.id, guildOf(interaction), gym.id);
  const content =
    outcome === 'added'
      ? `${gymText(gym)} is one of your gyms now: you will get a DM when a raid is reported ` +
        `there. ${mapsLink(gym)}\n\`/untarget\` takes it off again.`
      : `${gymText(gym)} is one of your gyms already. ${mapsLink(gym)}`;
  await interaction.editReply({ content, components: [] });
}

async function removeTarget(
  interaction: Answerable,
  ctx: AppContext,
  gymId: number,
): Promise<void> {
  const removed = await ctx.targets.remove(interaction.user.id, guildOf(interaction), gymId);
  const gym = ctx.gyms.get(gymId);
  const name = gym ? gymText(gym) : 'That gym';
  await interaction.editReply({
    content: removed
      ? `${name} is no longer one of your gyms.`
      : `${name} is not one of your gyms. \`/targets\` shows them.`,
    components: [],
  });
}

/** Asks which of several gyms is meant; the answer goes to `targetControls`. */
async function askWhich(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  mode: PendingChoice['mode'],
  gyms: readonly Gym[],
  typed: string,
): Promise<void> {
  const token = pending.put(interaction.user.id, { mode, gymIds: gyms.map((gym) => gym.id) });
  const here = regionChannelOf(interaction, ctx);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(encodeCustomId({ kind: MENU_KIND, id: token, action: 'gym' }))
    .setPlaceholder('Choose the gym')
    .addOptions(
      gyms.map((gym) => {
        const regions = ctx.gyms.regionsOf(gym.id);
        const [elsewhere] = regions;
        const region =
          here !== undefined && elsewhere !== undefined && !regions.includes(here)
            ? interaction.guild?.channels.cache.get(elsewhere)?.name
            : undefined;
        const parts = [gym.nickname, region, gym.description].filter(
          (part): part is string => part !== null && part !== undefined && part.trim() !== '',
        );
        return {
          label: truncate(gym.name, 100),
          value: String(gym.id),
          ...(parts.length === 0 ? {} : { description: truncate(parts.join(' · '), 100) }),
        };
      }),
    );
  await interaction.editReply({
    content:
      gyms.length === 1
        ? 'Did you mean this gym?'
        : `Several gyms fit "${plain(truncate(typed, 80))}". Which one do you mean?`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}

const GYM_OPTION = 'The gym: type part of its name and pick from the list';

/**
 * `/target` (spec 4.2): a gym to be told about by direct message whenever a raid is reported
 * there. Without the option, in the post of a raid or train, the gym of that party. No
 * question before it is stored: the member picked the gym from the list or the menu.
 */
export const target: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('target')
    .setDescription('Get a DM when a raid is reported at a gym')
    .addStringOption((option) =>
      option.setName('gym').setDescription(GYM_OPTION).setMaxLength(100).setAutocomplete(true),
    ),
  help: {
    category: 'notifications',
    details:
      'Makes a gym one of your gyms in this server: you get a direct message when a raid is ' +
      'reported there. Pick the gym from the list that appears while you type; any gym of ' +
      'this server can be picked from any channel. In the post of a raid or a train you can ' +
      'leave `gym` out, for the gym of that raid or the stop the train is at.',
    examples: ['/target gym:Big Fountain', '/target'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const typed = interaction.options.getString('gym');
    if (typed === null || typed.trim() === '') {
      await addTarget(interaction, ctx, gymOfPost(interaction, ctx));
      return;
    }
    const answer = reportedGym(
      ctx,
      regionChannelOf(interaction, ctx),
      typed,
      inServer(ctx, await serverOf(interaction, ctx)),
    );
    if (answer.kind === 'none') {
      throw new UserError(
        `I found no gym of this server for "${plain(truncate(typed, 80))}". Type part of its ` +
          'name and pick it from the list.',
      );
    }
    if (answer.kind === 'gym') await addTarget(interaction, ctx, answer.gym);
    else await askWhich(interaction, ctx, 'add', answer.gyms, typed);
  },

  async autocomplete(interaction, ctx) {
    const regionName = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    await interaction.respond(
      gymChoices(
        ctx,
        regionChannelOf(interaction, ctx),
        interaction.options.getFocused(),
        regionName,
        inServer(ctx, await serverOf(interaction, ctx)),
      ),
    );
  },
};

/** The gyms among these ids that still exist. */
function knownGyms(ctx: AppContext, gymIds: readonly number[]): Gym[] {
  return gymIds.flatMap((id) => {
    const gym = ctx.gyms.get(id);
    return gym ? [gym] : [];
  });
}

/**
 * The choices for the `gym` option of `/untarget`: the member's own gyms, narrowed to what was
 * typed; those whose name begins with it first, then by name.
 */
export function ownTargetChoices(gyms: readonly Gym[], typed: string): Choice[] {
  const text = typed.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  return gyms
    .map((gym) => ({
      gym,
      name: [gym.name, ...(gym.nickname ? [gym.nickname] : [])].join(' · '),
    }))
    .filter(({ name }) => words.every((word) => name.toLowerCase().includes(word)))
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(text)) -
          Number(!b.name.toLowerCase().startsWith(text)) || a.name.localeCompare(b.name, 'en'),
    )
    .slice(0, MAX_CHOICES)
    .map(({ gym, name }) => ({ name: truncate(name, 100), value: `g:${String(gym.id)}` }));
}

/** `/untarget` (spec 4.2): a gym stops being one of the member's gyms in this server. */
export const untarget: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('untarget')
    .setDescription('Stop the DMs for raids at a gym')
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('One of your gyms: pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'notifications',
    details:
      'Takes a gym off your gyms in this server. The list that appears while you type shows ' +
      'your gyms. In the post of a raid or a train you can leave `gym` out, for the gym of ' +
      'that raid or the stop the train is at.',
    examples: ['/untarget gym:Big Fountain', '/untarget'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: NOTIFICATION_THROTTLE,

  async execute(interaction, ctx) {
    const typed = interaction.options.getString('gym');
    if (typed === null || typed.trim() === '') {
      await removeTarget(interaction, ctx, gymOfPost(interaction, ctx).id);
      return;
    }
    // A choice of the list is taken by its id, also for a gym that no longer exists.
    const picked = /^g:(\d{1,10})$/.exec(typed.trim());
    if (picked) {
      await removeTarget(interaction, ctx, Number(picked[1]));
      return;
    }
    const own = new Set((await ctx.targets.list(interaction.user.id, guildOf(interaction))).gymIds);
    const answer = reportedGym(ctx, regionChannelOf(interaction, ctx), typed, (gym) =>
      own.has(gym.id),
    );
    if (answer.kind === 'none') {
      throw new UserError(
        `None of your gyms fits "${plain(truncate(typed, 80))}". \`/targets\` shows them.`,
      );
    }
    if (answer.kind === 'gym') await removeTarget(interaction, ctx, answer.gym.id);
    else await askWhich(interaction, ctx, 'remove', answer.gyms, typed);
  },

  async autocomplete(interaction, ctx) {
    if (interaction.guildId === null) {
      await interaction.respond([]);
      return;
    }
    const { gymIds } = await ctx.targets.list(interaction.user.id, interaction.guildId);
    await interaction.respond(
      ownTargetChoices(knownGyms(ctx, gymIds), interaction.options.getFocused()),
    );
  },
};

/** The gym menu of `/target` and `/untarget`. */
export const targetControls: ComponentHandler = {
  kind: MENU_KIND,

  async select(interaction, id, ctx) {
    if (id.action !== 'gym' || !interaction.isStringSelectMenu()) throw new UserError(EXPIRED);
    const taken = pending.take(id.id, interaction.user.id);
    if (taken === 'not-yours') throw new UserError('That is somebody else’s choice.');
    if (taken === 'expired') {
      await interaction.update({ content: EXPIRED, components: [] });
      return;
    }
    const { mode, gymIds } = taken.value;
    const gymId = Number(interaction.values[0]);
    const gym = gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
    if (!gym) {
      // The menu is used up: it goes, and its own message says why.
      await interaction.update({
        content: 'That gym no longer exists. Use the command again.',
        components: [],
      });
      return;
    }
    await interaction.deferUpdate();
    try {
      if (mode === 'add') await addTarget(interaction, ctx, gym);
      else await removeTarget(interaction, ctx, gym.id);
    } catch (err) {
      try {
        await interaction.editReply({ content: 'Nothing was changed.', components: [] });
      } catch {
        // The message may be gone or the token expired; the error below is what matters.
      }
      throw err;
    }
  },
};

const byName = (a: string, b: string): number => a.localeCompare(b, 'en');

/** Room for the regions of the list in the embed's description, below the notes. */
const LIST_ROOM = LIMITS.embedDescription - 400;
/** As much of a gym's name as the list shows. */
const LISTED_NAME = 60;

/** As many of the regions' blocks as fit into `limit`; when some do not, how many were left out. */
function fitRegions(blocks: readonly string[], limit: number): string {
  const all = blocks.join('\n\n');
  if (all.length <= limit) return all;
  for (let kept = blocks.length - 1; kept >= 0; kept--) {
    const left = `…and ${count(blocks.length - kept, 'more region')}`;
    const text = [...blocks.slice(0, kept), left].join('\n\n');
    if (text.length <= limit) return text;
  }
  return '';
}

/**
 * The member's gyms as an embed: by region of this server (the region's channel as a link,
 * the regions by name), the gyms of each by name; gyms that lie in no region of this server
 * any more under "Elsewhere". A region's gyms that do not fit are cut with a count, and so are
 * the regions, so the embed stays within Discord's limits whatever the number of rows; rows that
 * are no gym id or name no gym are counted.
 */
export function targetsEmbed(
  ctx: AppContext,
  list: TargetList,
  server: {
    /** The row of this server (`Guild.id`): its regions are those whose row names it. */
    guildRow: number | undefined;
    /** The name of a channel, for the order of the regions. */
    nameOf(channelId: string): string | undefined;
  },
): EmbedBuilder {
  const gyms = knownGyms(ctx, list.gymIds);
  const unreadable = list.unreadable + (list.gymIds.length - gyms.length);
  const byRegion = new Map<string, string[]>();
  const elsewhere: string[] = [];
  for (const gym of gyms) {
    const name = plain(truncate(gym.nickname || gym.name, LISTED_NAME));
    // A gym on the border of two regions is listed under the first of them by name.
    const [region] = ctx.gyms
      .regionsOf(gym.id)
      .filter(
        (channelId) =>
          server.guildRow !== undefined &&
          ctx.regions.byChannel(channelId)?.guildId === server.guildRow,
      )
      .sort((a, b) => byName(server.nameOf(a) ?? a, server.nameOf(b) ?? b));
    if (region === undefined) elsewhere.push(name);
    else byRegion.set(region, [...(byRegion.get(region) ?? []), name]);
  }
  const regions = [...byRegion.keys()].sort((a, b) =>
    byName(server.nameOf(a) ?? a, server.nameOf(b) ?? b),
  );
  const blocks = regions.length + (elsewhere.length > 0 ? 1 : 0);
  const room = Math.max(
    100,
    Math.min(LIMITS.fieldValue, Math.floor(LIST_ROOM / (blocks || 1)) - 60),
  );
  const block = (heading: string, names: string[]): string =>
    `${heading} (${String(names.length)})\n${fitItems(names.sort(byName), room)}`;
  const listed = [
    ...regions.map((region) => block(`<#${region}>`, byRegion.get(region) ?? [])),
    ...(elsewhere.length > 0 ? [block('Elsewhere', elsewhere)] : []),
  ];
  const notes = ['`/target` adds a gym, `/untarget` takes one off.'];
  if (unreadable > 0) {
    notes.push(
      `…and ${count(unreadable, 'entry', 'entries')} this version cannot read (a gym that no ` +
        'longer exists, say); `/untarget-all` removes those too.',
    );
  }
  const parts = listed.length === 0 ? notes : [fitRegions(listed, LIST_ROOM), ...notes];
  return new EmbedBuilder().setTitle('Your gyms in this server').setDescription(parts.join('\n\n'));
}

/** `/targets` (spec 4.2): the member's gyms in this server, for the member alone. */
export const targets: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('targets')
    .setDescription('Show the gyms you get DMs for'),
  help: {
    category: 'notifications',
    details: 'Shows your gyms in this server, by region.',
    examples: ['/targets'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const list = await ctx.targets.list(interaction.user.id, guildOf(interaction));
    if (list.gymIds.length === 0 && list.unreadable === 0) {
      await interaction.editReply({
        content:
          'You have no gyms in this server. `/target` makes a gym one of yours, and I send ' +
          'you a DM when a raid is reported there.',
      });
      return;
    }
    const guildRow = await serverOf(interaction, ctx);
    // The cache is asked for names only: which regions are this server's is said by their rows.
    const nameOf = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    await interaction.editReply({ embeds: [targetsEmbed(ctx, list, { guildRow, nameOf })] });
  },
};

const allTargets = removeAllQuestion({
  kind: 'targets',
  command: '/untarget-all',
  count: (ctx, memberId, guildId) => ctx.targets.count(memberId, guildId),
  removeAll: (ctx, memberId, guildId) => ctx.targets.removeAll(memberId, guildId),
  none: 'You have no gyms in this server: there is nothing to remove.',
  question: (n) =>
    `Remove ${n === 1 ? 'your one gym' : `all ${String(n)} of your gyms`} in this server? ` +
    'You will get no DMs for raids at particular gyms here any more.',
  button: (n) => (n === 1 ? 'Remove it' : `Remove all ${String(n)}`),
  removed: (n) => `Removed ${count(n, 'gym')}: you have no gyms in this server any more.`,
});

/** `/untarget-all` (spec 4.2): removes all the member's gyms in this server, after asking. */
export const untargetAll: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('untarget-all')
    .setDescription('Stop the DMs for raids at all your gyms'),
  help: {
    category: 'notifications',
    details:
      'Removes all your gyms in this server, after asking you once. Your gyms in other ' +
      'servers and your list of Pokémon (`/wants`) stay as they are.',
    examples: ['/untarget-all'],
  },
  enabled: notificationsEnabled,
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: NOTIFICATION_THROTTLE,
  execute: (interaction, ctx) => allTargets.ask(interaction, ctx),
};

/** The two buttons of `/untarget-all`. */
export const targetRemovalControls = allTargets.controls;
```

Apply to `src/commands/notifications/wants.ts`:

```diff
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -298,7 +298,7 @@ export const unwantAll: SimpleCommand = {
     category: 'notifications',
     details:
       'Empties your list for this server, after asking you once. Your lists in other servers ' +
-      'stay as they are.',
+      'and your gyms (`/targets`) stay as they are.',
     examples: ['/unwant-all'],
   },
   enabled: notificationsEnabled,
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -21,6 +21,7 @@ import { resolvePartyTime } from '../../domain/time/party-time.js';
 import { longestRaidDurations, raidDurationRules } from '../../domain/time/raid-durations.js';
 import { UserError } from '../../discord/errors.js';
 import { isFarOff, plain, timestamp, truncate } from '../../render/text.js';
+import { gymInGuild } from '../../services/region-directory.js';
 
 const MINUTE = 60_000;
 /** Discord shows at most this many choices, each with a name of at most 100 characters. */
@@ -460,23 +461,35 @@ export function trainBoss(ctx: AppContext, value: string, noTier: string): Train
  * as `ctx.gyms.search` orders them. When none of them has every word, the search goes on to the
  * other regions of the same server (Matt, 2026-10-11), and what it finds there with every word
  * comes before the guesses from here. Without a region channel all gyms are searched.
+ *
+ * With `accepts`, only the gyms it accepts count (the gyms of one server, a member's targets):
+ * the others are left out before anything is decided, and the step to other regions looks at
+ * every gym that is accepted, wherever it lies.
  */
 function gymHits(
   ctx: AppContext,
   regionChannelId: string | undefined,
   text: string,
   limit: number,
+  accepts?: (gym: Gym) => boolean,
 ): GymHit<Gym>[] {
-  const near = ctx.gyms.search(regionChannelId ?? null, text, { limit });
+  // With `accepts` every hit is asked for and then narrowed: a limit would be used up by the
+  // gyms that do not count.
+  const near = accepts
+    ? ctx.gyms
+        .search(regionChannelId ?? null, text)
+        .filter((hit) => accepts(hit.gym))
+        .slice(0, limit)
+    : ctx.gyms.search(regionChannelId ?? null, text, { limit });
   const region = regionChannelId === undefined ? undefined : ctx.regions.byChannel(regionChannelId);
   if (!region || near.some((hit) => hit.allWords)) return near;
+  const { guildId } = region;
   const sameServer = (gym: Gym): boolean =>
-    ctx.gyms
-      .regionsOf(gym.id)
-      .some((channelId) => ctx.regions.byChannel(channelId)?.guildId === region.guildId);
+    guildId !== null && gymInGuild(ctx.gyms, ctx.regions, gym.id, guildId);
+  const elsewhere = accepts ?? sameServer;
   const far = ctx.gyms
-    .search(null, text, { limit: limit * 4 })
-    .filter((hit) => hit.allWords && sameServer(hit.gym));
+    .search(null, text, accepts ? {} : { limit: limit * 4 })
+    .filter((hit) => hit.allWords && elsewhere(hit.gym));
   return [...far, ...near].slice(0, limit);
 }
 
@@ -498,23 +511,26 @@ export function between(first: number, last: number, now: number): string {
  * The choices for the `gym` option: the gyms matching what was typed, the region's own first;
  * while nothing is typed, the region's own gyms by name.
  * `regionName` gives the name of a region channel, to say where a gym of another region lies.
+ * `accepts` narrows the list to the gyms it accepts.
  */
 export function gymChoices(
   ctx: AppContext,
   regionChannelId: string | undefined,
   typed: string,
   regionName: (channelId: string) => string | undefined,
+  accepts?: (gym: Gym) => boolean,
 ): Choice[] {
   if (typed.trim() === '') {
     // Nothing typed yet: the region's own gyms by name, as many as a list holds.
     if (regionChannelId === undefined) return [];
     return ctx.gyms
       .inRegion(regionChannelId)
+      .filter((gym) => accepts?.(gym) ?? true)
       .sort((a, b) => a.name.localeCompare(b.name, 'en'))
       .slice(0, MAX_CHOICES)
       .map((gym) => ({ name: gymLabel(gym, undefined), value: `g:${String(gym.id)}` }));
   }
-  return gymHits(ctx, regionChannelId, typed, MAX_CHOICES).map(({ gym, place }) => {
+  return gymHits(ctx, regionChannelId, typed, MAX_CHOICES, accepts).map(({ gym, place }) => {
     const elsewhere = place === 'local' ? undefined : ctx.gyms.regionsOf(gym.id)[0];
     const region = elsewhere === undefined ? undefined : regionName(elsewhere);
     return { name: gymLabel(gym, region), value: `g:${String(gym.id)}` };
@@ -531,19 +547,21 @@ export type GymAnswer =
 /**
  * The gym the `gym` option names: a choice of the list, or typed text. Typed text is acted on
  * only when exactly one gym has every word as typed; otherwise the best few are offered.
+ * With `accepts`, a gym it does not accept is never the answer, picked or typed.
  */
 export function reportedGym(
   ctx: AppContext,
   regionChannelId: string | undefined,
   value: string,
+  accepts?: (gym: Gym) => boolean,
 ): GymAnswer {
   const text = value.trim();
   const picked = /^g:(\d{1,10})$/.exec(text);
   if (picked) {
     const gym = ctx.gyms.get(Number(picked[1]));
-    return gym ? { kind: 'gym', gym } : { kind: 'none' };
+    return gym && (accepts?.(gym) ?? true) ? { kind: 'gym', gym } : { kind: 'none' };
   }
-  const hits = gymHits(ctx, regionChannelId, text, 5);
+  const hits = gymHits(ctx, regionChannelId, text, 5, accepts);
   if (hits.length === 0) return { kind: 'none' };
   const clear = hits.filter((hit) => hit.allWords && !hit.corrected);
   const [only] = clear;
```

Apply to `src/commands/settings/settings.ts`:

```diff
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -215,8 +215,14 @@ async function listLines(
 ): Promise<string[]> {
   const { guildId } = interaction;
   if (guildId === null || !ctx.config.settings.features.notifications) return [];
-  const wanted = await ctx.wants.count(interaction.user.id, guildId);
-  return [`Pokémon and raid tiers on your list in this server: **${String(wanted)}** · \`/wants\``];
+  const [wanted, targeted] = await Promise.all([
+    ctx.wants.count(interaction.user.id, guildId),
+    ctx.targets.count(interaction.user.id, guildId),
+  ]);
+  return [
+    `Pokémon and raid tiers on your list in this server: **${String(wanted)}** · \`/wants\``,
+    `Your gyms in this server: **${String(targeted)}** · \`/targets\``,
+  ];
 }
 
 const show: SubcommandPart = {
@@ -227,8 +233,8 @@ const show: SubcommandPart = {
     details:
       'Lists your settings for pings and direct messages, the status you get when you report ' +
       'a raid, whether your reports name you, and your friend code and in-game name when ' +
-      'you registered them. In a server it also says how many Pokémon and raid tiers are on ' +
-      'your list there.',
+      'you registered them. In a server it also says how many Pokémon, raid tiers and ' +
+      'gyms you are notified about there.',
     examples: ['/settings show'],
   },
   defer: 'ephemeral',
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,4 +1,5 @@
 import { infoControls } from '../commands/meetups/info.js';
+import { targetControls, targetRemovalControls } from '../commands/notifications/targets.js';
 import { wantControls } from '../commands/notifications/wants.js';
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
@@ -11,5 +12,7 @@ export const components: readonly ComponentHandler[] = [
   locationControls,
   infoControls,
   wantControls,
+  targetControls,
+  targetRemovalControls,
   partyButtons,
 ];
```

Create `src/db/repositories/gym-notification-repository.ts`:

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../types.js';
import { findMemberInGuild, withMemberLocked, type MemberInGuild } from './member-rows.js';

/** A member's targets in a server as the rows say them. */
export interface TargetList {
  /** The ids of the gyms, each once, in the order of the rows. Some may no longer exist. */
  gymIds: number[];
  /** Rows whose `gym` is no gym id; they are left alone. */
  unreadable: number;
}

/**
 * What the commands need of the targets (`ctx.targets`); lets tests keep them in memory. A
 * member and a server are named by their snowflakes. A target is per member and server.
 */
export interface TargetStorage {
  /** The gyms the member targets in a server, and how many of their rows there cannot be read. */
  list(memberId: string, guildId: string): Promise<TargetList>;
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
}

/** A row of `GymNotification` as far as targets need it. */
export interface TargetRow {
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
export function readTargets(rows: readonly TargetRow[]): TargetList {
  const gymIds: number[] = [];
  let unreadable = 0;
  for (const row of rows) {
    const id = targetGymId(row.gym);
    if (id === undefined) unreadable += 1;
    else if (!gymIds.includes(id)) gymIds.push(id);
  }
  return { gymIds, unreadable };
}

/** The rows that make a gym a target, oldest first. */
export function rowsOfTarget(rows: readonly TargetRow[], gymId: number): number[] {
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
export class GymNotificationRepository implements TargetStorage {
  constructor(private readonly db: Kysely<DB>) {}

  /** The member's rows of a server; a plain read (see `PokemonNotificationRepository.rows`). */
  private rows(db: Kysely<DB>, member: MemberInGuild): Promise<TargetRow[]> {
    return db
      .selectFrom('GymNotification')
      .select(['id', 'gym'])
      .where('userId', '=', member.userId)
      .where('guildId', '=', member.guildId)
      .orderBy('id')
      .execute();
  }

  async list(memberId: string, guildId: string): Promise<TargetList> {
    const member = await findMemberInGuild(this.db, memberId, guildId);
    if (!member) return { gymIds: [], unreadable: 0 };
    return readTargets(await this.rows(this.db, member));
  }

  async count(memberId: string, guildId: string): Promise<number> {
    const { gymIds, unreadable } = await this.list(memberId, guildId);
    return gymIds.length + unreadable;
  }

  async add(memberId: string, guildId: string, gymId: number): Promise<'added' | 'exists'> {
    return withMemberLocked(this.db, memberId, guildId, true, async (trx, member) => {
      if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
      // The oldest row of the gym stays; legacy duplicates of it go.
      const [kept, ...duplicates] = rowsOfTarget(await this.rows(trx, member), gymId);
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
    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
      if (!member) return false;
      const ids = rowsOfTarget(await this.rows(trx, member), gymId);
      if (ids.length === 0) return false;
      await trx.deleteFrom('GymNotification').where('id', 'in', ids).execute();
      return true;
    });
  }

  async removeAll(memberId: string, guildId: string): Promise<number> {
    return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
      if (!member) return 0;
      const result = await trx
        .deleteFrom('GymNotification')
        .where('userId', '=', member.userId)
        .where('guildId', '=', member.guildId)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    });
  }
}
```

Apply to `src/services/region-directory.ts`:

```diff
--- a/src/services/region-directory.ts
+++ b/src/services/region-directory.ts
@@ -6,6 +6,23 @@ export interface RegionListing {
   listAll(): Promise<Region[]>;
 }
 
+/**
+ * Whether a gym lies in a region of a server: the one rule for "a gym of this server". The
+ * server is named by its row (`Guild.id`), and a region belongs to the server its own row
+ * says (`Region.guildId`), whether or not its text channel still exists or is in any cache; a
+ * region without a `guildId` belongs to no server.
+ */
+export function gymInGuild(
+  gyms: { regionsOf(gymId: number): string[] },
+  regions: Pick<RegionProvider, 'byChannel'>,
+  gymId: number,
+  guildId: number,
+): boolean {
+  return gyms
+    .regionsOf(gymId)
+    .some((channelId) => regions.byChannel(channelId)?.guildId === guildId);
+}
+
 /** What handlers need: the regions, from memory. */
 export interface RegionProvider {
   /** By row id. */
```

Apply to `src/services/train-service.ts`:

```diff
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -37,7 +37,7 @@ import { Gathered } from './gathered.js';
 import { settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
-import type { RegionProvider } from './region-directory.js';
+import { gymInGuild, type RegionProvider } from './region-directory.js';
 
 /**
  * What came of a change to a train. `gone`: there is no such active train (a raid or a meetup
@@ -164,9 +164,7 @@ export class TrainService {
    */
   reaches(party: TrainParty, gymId: number): boolean {
     const { gyms, regions } = this.options;
-    return gyms
-      .regionsOf(gymId)
-      .some((channelId) => regions.byChannel(channelId)?.guildId === party.guildId);
+    return gymInGuild(gyms, regions, gymId, party.guildId);
   }
 
   /**
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notifications/targets.test.ts src/commands/raids/raid-input.test.ts src/commands/settings/settings.test.ts src/db/repositories/gym-notification-repository.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/gym-notification-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/gym-notification-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 2d6d828 -- src test   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/commands/index.ts src/commands/notifications/targets.test.ts src/commands/notifications/targets.ts src/commands/notifications/wants.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/components/index.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-notification-repository.test.ts src/db/repositories/gym-notification-repository.ts src/services/region-directory.ts src/services/train-service.ts test/support/targets.ts test/support/test-context.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/commands/index.ts src/commands/notifications/targets.test.ts src/commands/notifications/targets.ts src/commands/notifications/wants.ts src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts src/commands/settings/settings.test.ts src/commands/settings/settings.ts src/components/index.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-notification-repository.test.ts src/db/repositories/gym-notification-repository.ts src/services/region-directory.ts src/services/train-service.ts test/support/targets.ts test/support/test-context.ts
git commit -m "Gym targets: their repository and the target commands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,878 unit tests.

---

### Task 6: Friend codes, in-game names, and looking a member of the server up

**Files:**
- Create: `src/commands/friends/friends.test.ts`, `src/commands/friends/friends.ts`, `src/discord/member-directory.ts`, `test/support/members.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/index.ts`, `src/db/repositories/user-repository.db.test.ts`, `src/db/repositories/user-repository.ts`, `src/discord/party-gateway.ts`, `test/support/fake-interactions.ts`, `test/support/test-context.ts`, `test/support/users.ts`

**Interfaces:**
- Consumes: Task 1's `ctx.users`; `DiscordPartyGateway.memberAccess`; `memberText`; the fake interactions.
- Produces: `src/discord/member-directory.ts`: `MemberDirectory` (`find(guildId, userId): Promise<{ id, name } | undefined>`), `DiscordMemberDirectory` (asks Discord afresh, keeps an answer for 60 seconds, 1,000 entries), `fetchGuildMember(guild, id, fresh?)`, which `memberAccess` now uses; `ctx.members`; `FakeMemberDirectory` in `test/support/members.ts` (with `failing`); `UserRepository.withNickname(name)` (every member with that in-game name) in place of `snowflakeForNickname`; `/friend-code register|show|remove` and `/nickname register|find|remove` (`src/commands/friends/friends.ts`).

`DiscordMemberDirectory` has no unit test, like the rest of what calls discord.js directly. `user-repository.db.test.ts` changes.

Reference commit of the prototype for this task: `f74154e`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/friends/friends.test.ts`:

```ts
import { InteractionContextType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../../test/support/members.js';
import { ALICE, BOB, CAROL } from '../../../test/support/parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { declaredSubcommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { friendCode, friendCodeOf, inGameNameOf, nickname } from './friends.js';

const OTHER_GUILD = '499999999999999999';
const DAVE = '200000000000000099';

function setup() {
  const users = new MemoryUsers();
  const members = new FakeMemberDirectory().add(BOB, 'Bob').add(CAROL, 'Carol');
  const { ctx, entries } = createTestContext({ users, members });
  const router = new InteractionRouter(ctx, [friendCode, nickname], []);
  const run = async (
    commandName: string,
    subcommand: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName,
      subcommand,
      userId: ALICE,
      displayName: 'Alice',
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered: the deferred answer, or a refusal. */
  const answer = async (
    commandName: string,
    subcommand: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const used = await run(commandName, subcommand, options, extra);
    for (const mock of [used.editReply, used.followUp, used.reply]) {
      if (mock.mock.calls.length > 0) return sent(mock).content;
    }
    throw new Error('nothing was answered');
  };
  /** `/friend-code show member:<somebody>`. */
  const show = (user: { id: string; bot?: boolean }, extra: object = {}) =>
    answer('friend-code', 'show', {}, { resolved: { member: { bot: false, ...user } }, ...extra });
  return { ctx, entries, users, members, run, answer, show };
}

describe('friendCodeOf', () => {
  it('keeps the twelve digits of what was typed, in groups of four', () => {
    expect(friendCodeOf('123456789012')).toBe('1234 5678 9012');
    expect(friendCodeOf(' 1234-5678-9012 ')).toBe('1234 5678 9012');
    expect(friendCodeOf('code: 1234 5678 9012!')).toBe('1234 5678 9012');
  });

  it('is undefined for more or fewer digits', () => {
    for (const text of ['', '1234 5678 901', '1234 5678 9012 3', 'my code']) {
      expect(friendCodeOf(text)).toBeUndefined();
    }
  });
});

describe('inGameNameOf', () => {
  it('takes letters and digits, 3 to 32 of them, as typed', () => {
    expect(inGameNameOf('  PineTrainer42 ')).toBe('PineTrainer42');
    expect(inGameNameOf('abc')).toBe('abc');
    expect(inGameNameOf('Flabébé7')).toBe('Flabébé7');
    expect(inGameNameOf('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it.each(['', 'ab', 'a'.repeat(33), 'Pine Trainer', 'pine_trainer', 'pine-42', '<@123>', '**x**'])(
    'refuses %j',
    (text) => {
      expect(inGameNameOf(text)).toBeUndefined();
    },
  );
});

describe('/friend-code and /nickname', () => {
  it('are offered in servers and in a DM with the bot, filed under friends, with help', () => {
    for (const command of [friendCode, nickname]) {
      const json = command.data.toJSON();
      expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
      expect(command.help.category).toBe('friends');
      expect(command.enabled).toBeUndefined();
      for (const handler of command.subcommands.values()) {
        expect(handler.help?.details).toBeTruthy();
        expect(handler.help?.examples?.length).toBeGreaterThan(0);
      }
    }
    expect(declaredSubcommands(friendCode.data.toJSON().options)).toEqual([
      'register',
      'show',
      'remove',
    ]);
    expect(declaredSubcommands(nickname.data.toJSON().options)).toEqual([
      'register',
      'find',
      'remove',
    ]);
    // The match of an in-game name is explained where members read about it.
    expect(nickname.subcommands.get('find')?.help?.details).toMatch(/capital letters and accents/);
  });

  it('answer the member alone', async () => {
    const made = setup();
    const used = await made.run('friend-code', 'register', { code: '123456789012' });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });
});

describe('/friend-code register and remove', () => {
  it('stores the code as the legacy bot did, and shows it', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'register', { code: '1234-5678-9012' })).toBe(
      'Your friend code is registered:\n`1234 5678 9012`\n' +
        'Anybody in a server you share with me can ask for it with `/friend-code show`; ' +
        '`/friend-code remove` takes it back.',
    );
    expect((await made.users.get(ALICE)).friendCode).toBe('1234 5678 9012');
    // A new one takes its place.
    await made.run('friend-code', 'register', { code: '999988887777' });
    expect((await made.users.get(ALICE)).friendCode).toBe('9999 8888 7777');
  });

  it('refuses what has not twelve digits, and stores nothing', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'register', { code: '1234 5678' })).toBe(
      'A friend code has 12 digits; what you typed has 8.',
    );
    expect(await made.answer('friend-code', 'register', { code: 'none' })).toBe(
      'A friend code has 12 digits; what you typed has 0.',
    );
    expect((await made.users.get(ALICE)).friendCode).toBeNull();
  });

  it('removes the code, and says when there was none', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'remove')).toBe('You have no friend code registered.');
    await made.run('friend-code', 'register', { code: '123456789012' });
    expect(await made.answer('friend-code', 'remove')).toBe('Your friend code is removed.');
    expect((await made.users.get(ALICE)).friendCode).toBeNull();
  });

  it('works in a DM with the bot', async () => {
    const made = setup();
    await made.run('friend-code', 'register', { code: '123456789012' }, { isDm: true });
    expect((await made.users.get(ALICE)).friendCode).toBe('1234 5678 9012');
    expect(await made.answer('friend-code', 'show', {}, { isDm: true })).toBe(
      'Your friend code:\n`1234 5678 9012`',
    );
  });
});

describe('/friend-code show', () => {
  it('shows the member their own code, or how to register one', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'show')).toBe(
      'You have not registered a friend code. `/friend-code register` does that.',
    );
    await made.users.update(ALICE, { friendCode: '1234 5678 9012' });
    expect(await made.answer('friend-code', 'show')).toBe('Your friend code:\n`1234 5678 9012`');
    // Naming themself is the same, and asks Discord nothing.
    expect(await made.show({ id: ALICE })).toBe('Your friend code:\n`1234 5678 9012`');
    expect(made.members.asked).toEqual([]);
  });

  it('shows the code of a member of this server, named with the mention', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '1111 2222 3333' });
    expect(await made.show({ id: BOB })).toBe(
      `The friend code of **Bob** (<@${BOB}>):\n\`1111 2222 3333\``,
    );
    expect(await made.show({ id: CAROL })).toBe(
      `**Carol** (<@${CAROL}>) has not registered a friend code.`,
    );
    expect(made.members.asked).toEqual([`${FAKE_GUILD_ID}:${BOB}`, `${FAKE_GUILD_ID}:${CAROL}`]);
  });

  it('answers with a sentence for a bot and for somebody who is not in this server', async () => {
    const made = setup();
    await made.users.update(DAVE, { friendCode: '1111 2222 3333' });
    expect(await made.show({ id: '200000000000000050', bot: true })).toBe(
      'That is a bot: it has no friend code.',
    );
    // Dave registered a code but is no member here: it is not handed out.
    expect(await made.show({ id: DAVE })).toBe('They are not in this server.');
    // Bob is a member of the fakes' server, not of this other one.
    await made.users.update(BOB, { friendCode: '4444 5555 6666' });
    expect(await made.show({ id: BOB }, { guildId: OTHER_GUILD })).toBe(
      'They are not in this server.',
    );
    expect(await made.show({ id: BOB }, { isDm: true })).toBe(
      'Somebody else’s friend code can only be asked for in a server.',
    );
  });

  it('takes the member Discord sent with the option, and asks nothing more', async () => {
    const made = setup();
    await made.users.update(DAVE, { friendCode: '1111 2222 3333' });
    // Dave is not in the directory, but Discord says he is a member here and what he is called.
    const sentWith = {
      resolved: { member: { id: DAVE, bot: false } },
      resolvedMembers: { member: { displayName: 'Dave' } },
    };
    expect(await made.answer('friend-code', 'show', {}, sentWith)).toBe(
      `The friend code of **Dave** (<@${DAVE}>):\n\`1111 2222 3333\``,
    );
    // Without a member in the option the user is not in this server: nothing is asked either.
    await made.users.update(BOB, { friendCode: '4444 5555 6666' });
    const stranger = {
      resolved: { member: { id: BOB, bot: false } },
      resolvedMembers: { member: null },
    };
    expect(await made.answer('friend-code', 'show', {}, stranger)).toBe(
      'They are not in this server.',
    );
    expect(made.members.asked).toEqual([]);
  });

  it('answers that they are not here when Discord cannot be asked, and logs why', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '1111 2222 3333' });
    made.members.failing = new Error('Invalid Form Body');
    expect(await made.show({ id: BOB })).toBe('They are not in this server.');
    expect(made.entries).toContainEqual(
      expect.objectContaining({ level: 40, msg: 'could not look a member up', user: BOB }),
    );
  });

  it('cuts a long legacy value', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '*_~|>'.repeat(51) });
    const shown = (await made.show({ id: BOB })) ?? '';
    expect(shown.length).toBeLessThan(250);
    expect(shown.endsWith('…')).toBe(true);
  });

  it('allows ten look-ups a minute', async () => {
    const made = setup();
    for (let use = 0; use < 10; use++) await made.show({ id: BOB });
    expect(await made.show({ id: BOB })).toMatch(/^You can use \/friend-code show again in /);
  });

  it('shows a legacy value that is no friend code as plain text', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '**ask me** `x`' });
    expect(await made.show({ id: BOB })).toBe(
      `The friend code of **Bob** (<@${BOB}>):\n\\*\\*ask me\\*\\* \\\`x\\\``,
    );
  });
});

describe('/nickname register and remove', () => {
  it('stores the name as typed, tidied', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'register', { name: '  PineTrainer42 ' })).toBe(
      'Your in-game name is registered: **PineTrainer42**. Members of a server you share ' +
        'with me can find you by it with `/nickname find`; `/nickname remove` takes it back.',
    );
    expect((await made.users.get(ALICE)).nickname).toBe('PineTrainer42');
  });

  it('refuses what cannot be a name in the game, and stores nothing', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'register', { name: 'Pine **Trainer**' })).toBe(
      '"Pine \\*\\*Trainer\\*\\*" cannot be an in-game name: it is 3 to 32 letters and digits, ' +
        'without spaces or other signs.',
    );
    expect(await made.answer('nickname', 'register', { name: 'ab' })).toMatch(
      /cannot be an in-game name/,
    );
    expect((await made.users.get(ALICE)).nickname).toBeNull();
  });

  it('removes the name, and says when there was none', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'remove')).toBe('You have no in-game name registered.');
    await made.run('nickname', 'register', { name: 'PineTrainer42' });
    expect(await made.answer('nickname', 'remove')).toBe('Your in-game name is removed.');
    expect((await made.users.get(ALICE)).nickname).toBeNull();
  });

  it('works in a DM with the bot', async () => {
    const made = setup();
    await made.run('nickname', 'register', { name: 'PineTrainer42' }, { isDm: true });
    expect((await made.users.get(ALICE)).nickname).toBe('PineTrainer42');
  });
});

describe('/nickname find', () => {
  it('names the member of this server who registered the name, whatever the case and accents', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'PinéTrainer' });
    expect(await made.answer('nickname', 'find', { name: ' pinetrainer ' })).toBe(
      `**pinetrainer** is **Bob** (<@${BOB}>).`,
    );
  });

  it('names all members who registered one name, and only those who are in this server', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'pinetrainer' });
    await made.users.update(DAVE, { nickname: 'PineTrainer' });
    await made.users.update(CAROL, { nickname: 'PINETRAINER' });
    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
      `2 members of this server registered the in-game name **PineTrainer**: ` +
        `**Bob** (<@${BOB}>), **Carol** (<@${CAROL}>).`,
    );
    // Dave is in no server the directory knows.
    expect(made.members.asked).toContain(`${FAKE_GUILD_ID}:${DAVE}`);
  });

  it('says so when nobody in this server has the name', async () => {
    const made = setup();
    await made.users.update(DAVE, { nickname: 'PineTrainer' });
    await made.users.update(BOB, { nickname: 'PineTrainer2' });
    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
      'Nobody in this server has registered the in-game name **PineTrainer**.',
    );
    expect(await made.answer('nickname', 'find', { name: '**nobody**' })).toBe(
      'Nobody in this server has registered the in-game name **\\*\\*nobody\\*\\***.',
    );
    expect(await made.answer('nickname', 'find', { name: '   ' })).toBe(
      'Say which in-game name to look for.',
    );
  });

  it('goes on past holders who are elsewhere, five at a time, until the list ends', async () => {
    const made = setup();
    // Thirty members of other servers registered the name before the two of this one.
    for (let index = 0; index < 30; index++) {
      await made.users.update(String(300000000000000000n + BigInt(index)), {
        nickname: 'PineTrainer',
      });
    }
    await made.users.update(BOB, { nickname: 'PineTrainer' });
    await made.users.update(CAROL, { nickname: 'pinetrainer' });
    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
      `2 members of this server registered the in-game name **PineTrainer**: ` +
        `**Bob** (<@${BOB}>), **Carol** (<@${CAROL}>).`,
    );
    expect(made.members.asked).toHaveLength(32);
  });

  it('stops asking once twenty members of this server are found', async () => {
    const made = setup();
    for (let index = 0; index < 60; index++) {
      const id = String(300000000000000000n + BigInt(index));
      await made.users.update(id, { nickname: 'PineTrainer' });
      made.members.add(id, `Trainer ${String(index)}`);
    }
    const said = (await made.answer('nickname', 'find', { name: 'PineTrainer' })) ?? '';
    expect(said).toMatch(/^20 members of this server registered the in-game name/);
    expect(said.length).toBeLessThanOrEqual(2_000);
    expect(made.members.asked).toHaveLength(20);
  });

  it('counts a holder Discord cannot be asked about as not here, and logs it', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'PineTrainer' });
    made.members.failing = new Error('Invalid Form Body');
    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
      'Nobody in this server has registered the in-game name **PineTrainer**.',
    );
    expect(made.entries).toContainEqual(
      expect.objectContaining({ level: 40, msg: 'could not look a member up', user: BOB }),
    );
  });

  it('allows ten searches a minute, and thirty changes', async () => {
    const made = setup();
    for (let use = 0; use < 10; use++) await made.run('nickname', 'find', { name: 'x' });
    expect(await made.answer('nickname', 'find', { name: 'x' })).toMatch(
      /^You can use \/nickname find again in /,
    );
    for (let use = 0; use < 30; use++) {
      await made.run('nickname', 'register', { name: 'PineTrainer' });
    }
    expect(await made.answer('nickname', 'register', { name: 'PineTrainer' })).toMatch(
      /^You can use \/nickname register again in /,
    );
    for (let use = 0; use < 30; use++) {
      await made.run('friend-code', 'register', { code: '123456789012' });
    }
    expect(await made.answer('friend-code', 'register', { code: '123456789012' })).toMatch(
      /^You can use \/friend-code register again in /,
    );
  });

  it('finds a legacy name that could not be registered today', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'pine trainer' });
    expect(await made.answer('nickname', 'find', { name: 'Pine Trainer' })).toBe(
      `**Pine Trainer** is **Bob** (<@${BOB}>).`,
    );
  });

  it('works in a server only', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'find', { name: 'x' }, { isDm: true })).toBe(
      'This only works in a server.',
    );
  });
});
```

Apply to `src/db/repositories/user-repository.db.test.ts`:

```diff
--- a/src/db/repositories/user-repository.db.test.ts
+++ b/src/db/repositories/user-repository.db.test.ts
@@ -148,7 +148,17 @@ describe('UserRepository', () => {
 
   it('finds a member by game nickname, ignoring case', async () => {
     await users.update(ALICE, { nickname: 'AliceGo' });
-    expect(await users.snowflakeForNickname('alicego')).toBe(ALICE);
-    expect(await users.snowflakeForNickname('nobody')).toBeUndefined();
+    expect(await users.withNickname('alicego')).toEqual([ALICE]);
+    expect(await users.withNickname('nobody')).toEqual([]);
+  });
+
+  it('finds everybody who registered one in-game name, without regard to case and accents', async () => {
+    await users.update(BOB, { nickname: 'pinétrainer' });
+    await users.update(ALICE, { nickname: 'PineTrainer' });
+    await users.update(CAROL, { nickname: 'PineTrainer2' });
+    expect(await users.withNickname('PINETRAINER')).toEqual([BOB, ALICE]);
+    // The whole name, not a part of it, and no padding.
+    expect(await users.withNickname('PineTrain')).toEqual([]);
+    expect(await users.withNickname('PineTrainer ')).toEqual([]);
   });
 });
```

Apply to `test/support/fake-interactions.ts`:

```diff
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -45,6 +45,12 @@ export interface FakeOptions {
   options?: Record<string, OptionValue>;
   /** Resolved options by name, for getUser, getMember, getRole, getChannel and getAttachment. */
   resolved?: Record<string, unknown>;
+  /**
+   * What `getMember` answers, by option name, when that differs from `resolved`: Discord sends
+   * the member with a user option only when that user is in the server, so a user who is not
+   * has an entry in `resolved` and `null` here.
+   */
+  resolvedMembers?: Record<string, unknown>;
   /** Autocomplete: what was typed so far, and in which option. */
   focused?: string;
   focusedName?: string;
@@ -192,7 +198,10 @@ function base(kind: Kind, o: FakeOptions) {
       getNumber: (name: string, required?: boolean) => value<number>(name, 'number', required),
       getBoolean: (name: string, required?: boolean) => value<boolean>(name, 'boolean', required),
       getUser: resolved,
-      getMember: resolved,
+      getMember: (name: string, required?: boolean) =>
+        o.resolvedMembers && name in o.resolvedMembers
+          ? (o.resolvedMembers[name] ?? null)
+          : resolved(name, required),
       getRole: resolved,
       getChannel: resolved,
       getAttachment: resolved,
```

Create `test/support/members.ts`:

```ts
import type { MemberDirectory, ServerMember } from '../../src/discord/member-directory.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';

/**
 * The members of servers, for tests: nobody is a member of anything until `add` says so.
 * `asked` records every look-up as `<guild>:<user>`. Set `failing` to make every look-up reject,
 * as Discord being away would.
 */
export class FakeMemberDirectory implements MemberDirectory {
  failing: Error | undefined;
  readonly asked: string[] = [];
  private readonly members = new Map<string, ServerMember>();

  /** Makes somebody a member of a server (default: the server of the fake interactions). */
  add(userId: string, name: string, guildId = FAKE_GUILD_ID): this {
    this.members.set(`${guildId}:${userId}`, { id: userId, name });
    return this;
  }

  /** Somebody leaves a server. */
  remove(userId: string, guildId = FAKE_GUILD_ID): void {
    this.members.delete(`${guildId}:${userId}`);
  }

  find(guildId: string, userId: string): Promise<ServerMember | undefined> {
    this.asked.push(`${guildId}:${userId}`);
    if (this.failing) return Promise.reject(this.failing);
    const member = this.members.get(`${guildId}:${userId}`);
    return Promise.resolve(member && { ...member });
  }
}
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -11,6 +11,7 @@ import type { TimedPartyService } from '../../src/services/timed-party-service.j
 import type { TrainService } from '../../src/services/train-service.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { catalogueFixture } from './game-data.js';
+import { FakeMemberDirectory } from './members.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
@@ -59,6 +60,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     // Nobody wants or targets anything; a test passes its own stores to fill and read them.
     wants: new MemoryWants(),
     targets: new MemoryTargets(),
+    // Nobody is a member of any server; a test passes its own directory with members.
+    members: new FakeMemberDirectory(),
     partyService: unavailable<PartyService>(
       'partyService',
       'pass { partyService, parties, regions } from partyServiceWith()',
```

Apply to `test/support/users.ts`:

```diff
--- a/test/support/users.ts
+++ b/test/support/users.ts
@@ -46,4 +46,14 @@ export class MemoryUsers implements UserSettingsStore {
     this.settings.set(snowflake, { ...this.settings.get(snowflake), ...patch });
     return Promise.resolve();
   }
+
+  /** As the column's collation compares: the whole name, without regard to case and accents. */
+  withNickname(nickname: string): Promise<string[]> {
+    const same = (stored: string | null | undefined): boolean =>
+      typeof stored === 'string' &&
+      stored.localeCompare(nickname, 'en', { sensitivity: 'base' }) === 0;
+    return Promise.resolve(
+      [...this.settings].filter(([, set]) => same(set.nickname)).map(([snowflake]) => snowflake),
+    );
+  }
 }
```

Run: `npx vitest run --project unit src/commands/friends/friends.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -7,6 +7,7 @@ import type { DB } from './db/types.js';
 import type { ClickAnswers } from './discord/click-answers.js';
 import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
+import type { MemberDirectory } from './discord/member-directory.js';
 import type { Logger } from './log.js';
 import type { AttendanceService } from './services/attendance-service.js';
 import type { GameDataProvider } from './services/game-data-service.js';
@@ -60,6 +61,8 @@ export interface AppContext {
   readonly wants: WantStorage;
   /** The gyms members want to be notified about, per server. */
   readonly targets: TargetStorage;
+  /** Members of a server other than the one who is acting, looked up one at a time. */
+  readonly members: MemberDirectory;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -22,6 +22,7 @@ import { ClickAnswers } from './discord/click-answers.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { enabledCommands } from './discord/command.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
+import { DiscordMemberDirectory } from './discord/member-directory.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
@@ -104,6 +105,7 @@ export async function startApp(
   const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const partyGateway = new DiscordPartyGateway();
+  const members = new DiscordMemberDirectory();
   // Listens to the store: whoever signs up for a party in a forum they cannot see is let in.
   const access = new AccessService({
     store: parties,
@@ -235,6 +237,7 @@ export async function startApp(
     users,
     wants: new PokemonNotificationRepository(db),
     targets: new GymNotificationRepository(db),
+    members,
     pokemon,
     maps,
     features: requested,
@@ -252,6 +255,7 @@ export async function startApp(
     create: createClient,
     configure(client) {
       partyGateway.use(client);
+      members.use(client);
       client.once(Events.ClientReady, (ready) => {
         log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
         void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
```

Create `src/commands/friends/friends.ts`:

```ts
import {
  InteractionContextType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { requireGuild } from '../../discord/guards.js';
import type { ServerMember } from '../../discord/member-directory.js';
import type { Throttle } from '../../discord/throttle.js';
import { count, fitItems, LIMITS, memberText, plain, truncate } from '../../render/text.js';

const FRIEND_CODE_DIGITS = 12;

/**
 * A friend code as it is stored and shown, `1234 5678 9012` (as the legacy bot stored it): the
 * twelve digits of what was typed, whatever stood between them. Undefined when the text does
 * not hold exactly twelve digits.
 */
export function friendCodeOf(text: string): string | undefined {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== FRIEND_CODE_DIGITS) return undefined;
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
}

/**
 * A stored friend code as a message shows it: on a line of its own as code, which is easy to
 * copy. A legacy value that is no friend code is shown as plain text.
 */
function shownCode(stored: string): string {
  const code = friendCodeOf(stored);
  // The column holds up to 255 characters of whatever the legacy bot was given.
  return code === undefined ? plain(truncate(stored.trim(), SHOWN_VALUE)) : `\`${code}\``;
}

/** As much of a legacy value that is no friend code as a message shows. */
const SHOWN_VALUE = 60;

/** How often one member may change what they registered: each use writes to the database. */
const WRITE_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };
/** How often one member may look somebody up: each use may ask Discord for members. */
const LOOKUP_THROTTLE: Throttle = { uses: 10, perSeconds: 60 };

/**
 * A member of this server by their id, or undefined: also when Discord could not be asked or
 * refused the id (a stored id that is no snowflake is refused as an invalid form body). Such a
 * failure is logged and counts as "not a member" for that one id; it does not fail the command.
 */
async function memberOfServer(
  ctx: AppContext,
  guildId: string,
  userId: string,
): Promise<ServerMember | undefined> {
  try {
    return await ctx.members.find(guildId, userId);
  } catch (err) {
    ctx.log.warn({ err, guild: guildId, user: userId }, 'could not look a member up');
    return undefined;
  }
}

/** In-game names are letters and digits; the game allows 4 to 15, this is lenient on length. */
const IN_GAME_NAME = /^[\p{L}\p{N}]{3,32}$/u;

/**
 * An in-game name as it is stored: as typed, without the white space around it. Undefined for
 * what cannot be a name in Pokémon GO.
 */
export function inGameNameOf(text: string): string | undefined {
  const name = text.normalize('NFC').trim();
  return IN_GAME_NAME.test(name) ? name : undefined;
}

/** As many members of a server with one in-game name as are named. */
const MAX_NAMESAKES = 20;
/** As many holders of a name as Discord is asked about at once. */
const LOOKUPS_AT_ONCE = 5;

const registerCode: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('register')
    .setDescription('Register your Pokémon GO friend code, or replace it')
    .addStringOption((option) =>
      option
        .setName('code')
        .setDescription('Your 12-digit friend code, with or without spaces')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    details:
      'Stores your friend code so that others can ask for it with `/friend-code show`. Type ' +
      'the twelve digits any way you like: spaces and dashes are ignored.',
    examples: ['/friend-code register code:1234 5678 9012'],
  },
  defer: 'ephemeral',
  throttle: WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const typed = interaction.options.getString('code', true);
    const code = friendCodeOf(typed);
    if (code === undefined) {
      const digits = typed.replace(/\D/g, '').length;
      throw new UserError(
        `A friend code has ${String(FRIEND_CODE_DIGITS)} digits; what you typed has ${String(digits)}.`,
      );
    }
    await ctx.users.update(interaction.user.id, { friendCode: code });
    await interaction.editReply({
      content:
        `Your friend code is registered:\n\`${code}\`\n` +
        'Anybody in a server you share with me can ask for it with `/friend-code show`; ' +
        '`/friend-code remove` takes it back.',
    });
  },
};

const showCode: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('Show a member’s friend code, or your own')
    .addUserOption((option) =>
      option.setName('member').setDescription('Whose friend code; yours when left out'),
    ),
  help: {
    details:
      'Shows you the friend code a member of this server registered, on a line of its own so ' +
      'that it is easy to copy. Without a member it shows your own.',
    examples: ['/friend-code show member:@Ash', '/friend-code show'],
  },
  defer: 'ephemeral',
  throttle: LOOKUP_THROTTLE,
  async execute(interaction, ctx) {
    const user = interaction.options.getUser('member');
    if (user === null || user.id === interaction.user.id) {
      const own = (await ctx.users.get(interaction.user.id)).friendCode;
      await interaction.editReply({
        content:
          own === null || own.trim() === ''
            ? 'You have not registered a friend code. `/friend-code register` does that.'
            : `Your friend code:\n${shownCode(own)}`,
      });
      return;
    }
    if (user.bot) throw new UserError('That is a bot: it has no friend code.');
    const { guildId } = interaction;
    if (guildId === null) {
      throw new UserError('Somebody else’s friend code can only be asked for in a server.');
    }
    // Only of somebody who is in this server: a code is not handed to whoever knows an id.
    // Discord sends the member with the option exactly when the user is in this server; the
    // directory is asked only when that came without a name.
    const sent = interaction.options.getMember('member');
    if (sent === null) throw new UserError('They are not in this server.');
    const member =
      'displayName' in sent && typeof sent.displayName === 'string'
        ? { id: user.id, name: sent.displayName }
        : await memberOfServer(ctx, guildId, user.id);
    if (!member) throw new UserError('They are not in this server.');
    const code = (await ctx.users.get(user.id)).friendCode;
    await interaction.editReply({
      content:
        code === null || code.trim() === ''
          ? `${memberText(member)} has not registered a friend code.`
          : `The friend code of ${memberText(member)}:\n${shownCode(code)}`,
    });
  },
};

const removeCode: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove your friend code'),
  help: {
    details: 'Forgets the friend code you registered: nobody can ask for it any more.',
    examples: ['/friend-code remove'],
  },
  defer: 'ephemeral',
  throttle: WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const had = (await ctx.users.get(interaction.user.id)).friendCode;
    if (had === null) {
      await interaction.editReply({ content: 'You have no friend code registered.' });
      return;
    }
    await ctx.users.update(interaction.user.id, { friendCode: null });
    await interaction.editReply({ content: 'Your friend code is removed.' });
  },
};

/**
 * `/friend-code` (spec 4.2): a member's Pokémon GO friend code, registered by themself and shown
 * to whoever asks in a server both are in. Every answer is for the asker alone. Registering and
 * removing also work in a DM with the bot.
 */
export const friendCode = commandGroup({
  data: new SlashCommandBuilder()
    .setName('friend-code')
    .setDescription('Pokémon GO friend codes: register yours, look up a member’s')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'friends',
    details:
      'Register your Pokémon GO friend code once, and members of the servers you are in can ' +
      'look it up instead of asking you. Only you see the answers of these commands.',
    examples: ['/friend-code register code:1234 5678 9012', '/friend-code show member:@Ash'],
  },
  parts: [registerCode, showCode, removeCode],
});

const registerName: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('register')
    .setDescription('Register your Pokémon GO name, or replace it')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Your name in the game')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    details:
      'Stores your in-game name as you type it, so that others can find out who you are on ' +
      'Discord with `/nickname find`. An in-game name is letters and digits only.',
    examples: ['/nickname register name:PineTrainer42'],
  },
  defer: 'ephemeral',
  throttle: WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const typed = interaction.options.getString('name', true);
    const name = inGameNameOf(typed);
    if (name === undefined) {
      throw new UserError(
        `"${plain(truncate(typed.trim(), 40))}" cannot be an in-game name: it is 3 to 32 letters ` +
          'and digits, without spaces or other signs.',
      );
    }
    await ctx.users.update(interaction.user.id, { nickname: name });
    await interaction.editReply({
      content:
        `Your in-game name is registered: **${plain(name)}**. Members of a server you share ` +
        'with me can find you by it with `/nickname find`; `/nickname remove` takes it back.',
    });
  },
};

const removeName: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove your in-game name'),
  help: {
    details: 'Forgets the in-game name you registered: nobody finds you by it any more.',
    examples: ['/nickname remove'],
  },
  defer: 'ephemeral',
  throttle: WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const had = (await ctx.users.get(interaction.user.id)).nickname;
    if (had === null) {
      await interaction.editReply({ content: 'You have no in-game name registered.' });
      return;
    }
    await ctx.users.update(interaction.user.id, { nickname: null });
    await interaction.editReply({ content: 'Your in-game name is removed.' });
  },
};

const findName: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('find')
    .setDescription('Find out which member of this server has an in-game name')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The in-game name, in full')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    details:
      'Tells you who in this server registered an in-game name. The name must be given in ' +
      'full, but capital letters and accents do not matter: `pinetrainer42` finds ' +
      '`PineTrainer42`. Several members can have registered the same name; all are shown.',
    examples: ['/nickname find name:PineTrainer42'],
  },
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: LOOKUP_THROTTLE,
  async execute(interaction, ctx) {
    const { guildId } = interaction;
    if (guildId === null) throw new UserError('This only works in a server.');
    const typed = interaction.options.getString('name', true).normalize('NFC').trim();
    if (typed === '') throw new UserError('Say which in-game name to look for.');
    const shown = `**${plain(truncate(typed, 40))}**`;
    // Legacy rows hold any text, so the name is looked for as typed, not only when it could
    // be registered today.
    const registered = await ctx.users.withNickname(typed);
    // Each is asked for at Discord, a few at a time: only who is in this server is named. It
    // goes on until enough of them are found or the list ends, however many others (members
    // of other servers) registered the name.
    const members: ServerMember[] = [];
    for (
      let start = 0;
      start < registered.length && members.length < MAX_NAMESAKES;
      start += LOOKUPS_AT_ONCE
    ) {
      const asked = registered.slice(start, start + LOOKUPS_AT_ONCE);
      const found = await Promise.all(asked.map((id) => memberOfServer(ctx, guildId, id)));
      members.push(...found.flatMap((member) => (member ? [member] : [])));
    }
    members.splice(MAX_NAMESAKES);
    if (members.length === 0) {
      await interaction.editReply({
        content: `Nobody in this server has registered the in-game name ${shown}.`,
      });
      return;
    }
    const [only] = members;
    const content =
      only && members.length === 1
        ? `${shown} is ${memberText(only)}.`
        : `${count(members.length, 'member')} of this server registered the in-game name ${shown}: ` +
          `${fitItems(members.map(memberText), LIMITS.content - 200)}.`;
    await interaction.editReply({ content });
  },
};

/**
 * `/nickname` (spec 4.2): a member's in-game name in Pokémon GO (the `User.nickname` column),
 * registered by themself, and the look-up from an in-game name to the member of this server.
 * Every answer is for the asker alone. Registering and removing also work in a DM with the bot.
 */
export const nickname = commandGroup({
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Pokémon GO names: register yours, find a member by theirs')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'friends',
    details:
      'Register the in-game name you have in Pokémon GO, and members of this server can find ' +
      'out who a trainer they met in a raid is on Discord. Names are compared without regard ' +
      'to capital letters and accents. Only you see the answers of these commands.',
    examples: ['/nickname register name:PineTrainer42', '/nickname find name:PineTrainer42'],
  },
  parts: [registerName, findName, removeName],
});
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -1,5 +1,6 @@
 import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
+import { friendCode, nickname } from './friends/friends.js';
 import { info } from './meetups/info.js';
 import { meetup } from './meetups/meetup.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
@@ -66,5 +67,7 @@ export const commands: readonly CommandModule[] = [
   untarget,
   targets,
   untargetAll,
+  friendCode,
+  nickname,
   admin,
 ];
```

Apply to `src/db/repositories/user-repository.ts`:

```diff
--- a/src/db/repositories/user-repository.ts
+++ b/src/db/repositories/user-repository.ts
@@ -83,6 +83,11 @@ export interface UserSettingsReader {
 export interface UserSettingsStore extends UserSettingsReader {
   /** Changes the given fields of a member's settings. */
   update(snowflake: string, patch: UserSettingsPatch): Promise<void>;
+  /**
+   * The snowflakes of everybody who registered this in-game name, compared without regard to
+   * letter case and accents; whether they are in a given server is not known here.
+   */
+  withNickname(nickname: string): Promise<string[]>;
 }
 
 /** As many members as one query of `getMany` names. */
@@ -182,14 +187,17 @@ export class UserRepository implements UserSettingsStore {
       .execute();
   }
 
-  /** Who registered this in-game name. The column's collation makes the match case-insensitive. */
-  async snowflakeForNickname(nickname: string): Promise<string | undefined> {
-    const row = await this.db
+  /**
+   * Everybody who registered this in-game name, oldest row first: the name is not unique. The
+   * column's collation makes the match exact but for letter case and accents.
+   */
+  async withNickname(nickname: string): Promise<string[]> {
+    const rows = await this.db
       .selectFrom('User')
       .select('userSnowflake')
       .where('nickname', '=', nickname)
       .orderBy('id')
-      .executeTakeFirst();
-    return row?.userSnowflake ?? undefined;
+      .execute();
+    return rows.flatMap((row) => (row.userSnowflake === null ? [] : [row.userSnowflake]));
   }
 }
```

Create `src/discord/member-directory.ts`:

```ts
import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Client,
  type Guild,
  type GuildMember,
} from 'discord.js';

/** A member of a server, as far as the bot needs them outside an interaction of their own. */
export interface ServerMember {
  id: string;
  /** Their display name in that server. */
  name: string;
}

/**
 * Members of a server, looked up one at a time. The bot keeps no member list (that needs the
 * privileged GuildMembers intent, spec 3.1): somebody who is not the member of the interaction
 * at hand is asked for by id. Plan 4B adds here whether a member can see a channel.
 */
export interface MemberDirectory {
  /**
   * The member of a server with this user id; undefined for somebody who is not in that server
   * (or no longer), and for a server the bot is not in. Throws for any other failure.
   */
  find(guildId: string, userId: string): Promise<ServerMember | undefined>;
}

/**
 * Asks Discord for one member of a server; undefined for somebody who is not in it. This is the
 * one place members are fetched (the party gateway asks through it too). Without `fresh` the
 * answer may come from discord.js's cache, where a member stays as their last interaction left
 * them: roles they got or lost since are not seen, and neither is their leaving. With `fresh`
 * Discord is always asked (REST; allowed without the GuildMembers intent).
 */
export async function fetchGuildMember(
  guild: Guild,
  userId: string,
  fresh = false,
): Promise<GuildMember | undefined> {
  try {
    return await guild.members.fetch({ user: userId, force: fresh });
  } catch (err) {
    if (
      err instanceof DiscordAPIError &&
      (err.code === RESTJSONErrorCodes.UnknownMember || err.code === RESTJSONErrorCodes.UnknownUser)
    ) {
      return undefined;
    }
    throw err;
  }
}

/** How long an answer of `DiscordMemberDirectory` is good for: a "short-lived cache" (spec 3.1). */
const CACHE_MS = 60_000;
/** As many answers as are remembered at once; the oldest goes first. */
const CACHE_SIZE = 1_000;

/**
 * The directory over a discord.js client: thin, and without unit tests like the party gateway
 * (the staging run is its test). The client is handed over once it exists; anything asked
 * before that fails. Every look-up asks Discord afresh, so that somebody who left is not found
 * in the cache of an earlier interaction; the answer, also "not a member", is then kept for a
 * minute, which bounds what a burst of look-ups costs, and two look-ups of one member at the
 * same time are one request.
 */
export class DiscordMemberDirectory implements MemberDirectory {
  private current: Client | undefined;
  private readonly known = new Map<string, { member: ServerMember | undefined; until: number }>();
  /** The look-ups that are on their way: a second one for the same member waits for the first. */
  private readonly asking = new Map<string, Promise<ServerMember | undefined>>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  find(guildId: string, userId: string): Promise<ServerMember | undefined> {
    if (!this.current) return Promise.reject(new Error('Discord is not connected yet'));
    const key = `${guildId}:${userId}`;
    const cached = this.known.get(key);
    if (cached && cached.until > this.now()) return Promise.resolve(cached.member);
    const waiting = this.asking.get(key);
    if (waiting) return waiting;
    // A server that is not in the cache (the bot is not in it, or it is unavailable for the
    // moment) has no members to find, and nothing is remembered about it.
    const guild = this.current.guilds.cache.get(guildId);
    if (!guild) return Promise.resolve(undefined);
    const asked = this.ask(guild, key, userId).finally(() => this.asking.delete(key));
    this.asking.set(key, asked);
    return asked;
  }

  private async ask(guild: Guild, key: string, userId: string): Promise<ServerMember | undefined> {
    const found = await fetchGuildMember(guild, userId, true);
    const member = found && { id: found.id, name: found.displayName };
    this.known.delete(key);
    while (this.known.size >= CACHE_SIZE) {
      // Oldest first: a Map keeps the order in which entries were added.
      const oldest = this.known.keys().next();
      if (oldest.done) break;
      this.known.delete(oldest.value);
    }
    this.known.set(key, { member, until: this.now() + CACHE_MS });
    return member;
  }
}
```

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -15,6 +15,7 @@ import {
   type AnyThreadChannel,
   type GuildMember,
 } from 'discord.js';
+import { fetchGuildMember } from './member-directory.js';
 
 /** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
 export interface OutgoingMessage {
@@ -472,15 +473,8 @@ export class DiscordPartyGateway implements PartyGateway {
     // moves) are those of their last interaction: a role they got or lost since is not seen,
     // so a grant may be made that was not needed, or one for somebody a new role keeps out;
     // either ends with the party.
-    let member: GuildMember;
-    try {
-      member = await forum.guild.members.fetch(memberId);
-    } catch (err) {
-      if (hasCode(err, RESTJSONErrorCodes.UnknownMember, RESTJSONErrorCodes.UnknownUser)) {
-        return undefined;
-      }
-      throw err;
-    }
+    const member = await fetchGuildMember(forum.guild, memberId);
+    if (!member) return undefined;
     if (forum.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)) return 'visible';
     // An entry of their own that sets nothing (what Discord's "reset to default" leaves behind)
     // keeps nobody out: it is as if it were not there, and `admitMember` replaces it.
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/friends/friends.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/user-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/user-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff f74154e -- src test   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/commands/friends/friends.test.ts src/commands/friends/friends.ts src/commands/index.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/discord/member-directory.ts src/discord/party-gateway.ts test/support/fake-interactions.ts test/support/members.ts test/support/test-context.ts test/support/users.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/commands/friends/friends.test.ts src/commands/friends/friends.ts src/commands/index.ts src/db/repositories/user-repository.db.test.ts src/db/repositories/user-repository.ts src/discord/member-directory.ts src/discord/party-gateway.ts test/support/fake-interactions.ts test/support/members.ts test/support/test-context.ts test/support/users.ts
git commit -m "Friend codes, in-game names, and looking a member of the server up" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,916 unit tests.

---

### Task 7: A want for one form of a Pokémon, or for its shadow raids

**Files:**
- Create: `src/db/migrations/2026_10_12_005_pokemon_notification_form.ts`
- Modify: `src/app.ts`, `src/commands/notifications/want-input.ts`, `src/commands/notifications/wants.test.ts`, `src/commands/notifications/wants.ts`, `src/commands/settings/settings.test.ts`, `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`, `src/db/repositories/pokemon-notification-repository.db.test.ts`, `src/db/repositories/pokemon-notification-repository.ts`, `src/db/types.ts`, `src/domain/pogo/notification-target.test.ts`, `src/domain/pogo/notification-target.ts`, `src/domain/pogo/wants.test.ts`, `src/domain/pogo/wants.ts`, `test/support/wants.test.ts`, `test/support/wants.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4 (the codec, `wants.ts`, the repository and its twin, the commands); `catalogue.byKey`, `byDex`; `feedLookupOf(catalogue).speciesName`; the migrations of `src/db/migrations/`.
- Produces: The migration `2026_10_12_005_pokemon_notification_form` (`PokemonNotification.form` VARCHAR(100) NULL, `shadow` TINYINT(1) NOT NULL DEFAULT 0) and the regenerated `src/db/types.ts`; `PokemonTarget` (`{ kind: 'pokemon', dex, form?, shadow? }`), `pokemonTarget()`, `isFormKey`; tokens `pokemon:<dex>[:<form>][:shadow]`; `FormReader` / `formReader(() => catalogue)` (two keys of one entry are one want); `entryWant`, `typedEntryWant`, `hasForms`, `pokemonWantName`, `pokemonWantFits(catalogue, target, entry, shadowRaid)` (for plan 4B; no caller yet); `PokemonNotificationRepository(db, forms)`; the labels "X (every form)", "X (base form)", "Shadow X" and the scope after " · "; megas and shadow wants as raids only.

`src/db/types.ts` is generated: apply the diff as written (it is what `npm run db:codegen` gives after the migration) and, where Docker is available, check it with `npm run db:codegen -- --verify`. `migrator.db.test.ts` and `pokemon-notification-repository.db.test.ts` change.

Reference commit of the prototype for this task: `edd7e7d`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/notifications/wants.test.ts`:

```diff
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -12,7 +12,11 @@ import { ALICE, BOB } from '../../../test/support/parties.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryWants } from '../../../test/support/wants.js';
 import { InteractionRouter } from '../../discord/router.js';
-import { notificationTiers, type Want } from '../../domain/pogo/notification-target.js';
+import {
+  notificationTiers,
+  pokemonTarget,
+  type Want,
+} from '../../domain/pogo/notification-target.js';
 import { LIMITS } from '../../render/text.js';
 import { unwant, unwantAll, want, wantControls, wants, wantsEmbed } from './wants.js';
 
@@ -56,7 +60,12 @@ function setup() {
     store.rows
       .filter((row) => row.memberId === member && row.guildId === guild)
       .map((row) => [row.pokemon, row.type]);
-  return { ctx, store, router, run, answer, choices, handle, rows };
+  /** The rows with the form and the shadow flag: `[pokemon, type, form, shadow]`. */
+  const formRows = (member = ALICE, guild = FAKE_GUILD_ID) =>
+    store.rows
+      .filter((row) => row.memberId === member && row.guildId === guild)
+      .map((row) => [row.pokemon, row.type, row.form, row.shadow]);
+  return { ctx, store, router, run, answer, choices, handle, rows, formRows };
 }
 
 /** The custom id of the n-th button of a reply. */
@@ -108,8 +117,9 @@ describe('/want', () => {
         'see. Every form of Mewtwo counts. `/unwant` takes it off again.',
     );
     expect(await made.answer('want', { target: 'pokemon:147', type: 'spawn' })).toBe(
-      'You will get a DM when a wild Dratini is reported in a region you can see. Every form ' +
-        'of Dratini counts. `/unwant` takes it off again.',
+      // All there is of Dratini is Dratini: no forms to speak of.
+      'You will get a DM when a wild Dratini is reported in a region you can see. ' +
+        '`/unwant` takes it off again.',
     );
     expect(await made.answer('want', { target: 'pokemon:487', type: 'raid' })).toBe(
       'You will get a DM when a Giratina raid is reported in a region you can see. Every form ' +
@@ -168,7 +178,7 @@ describe('/want', () => {
         'of Mewtwo counts. Until now it was for raids. `/unwant` takes it off again.',
     );
     expect(await made.answer('want', { target: 'pokemon:150', type: 'spawn' })).toBe(
-      'Mewtwo is on your list already, for spawns. `/unwant` takes it off.',
+      'Mewtwo (every form) is on your list already, for spawns. `/unwant` takes it off.',
     );
     await made.run('want', { target: 'tier:T5' });
     expect(await made.answer('want', { target: 'tier:T5', type: 'both' })).toBe(
@@ -199,13 +209,16 @@ describe('/want', () => {
     await made.run('want', { target: 'Mewtwo' });
     await made.run('want', { target: 'mega charizard y' });
     await made.run('want', { target: 'unown' });
-    expect(made.rows()).toEqual([
-      [-5, 'raid'],
-      [-35, 'raid'],
-      [-6, 'spawn'],
-      [150, 'both'],
-      [6, 'both'],
-      [201, 'both'],
+    await made.run('want', { target: 'shadow landorus' });
+    expect(made.formRows()).toEqual([
+      [-5, 'raid', null, false],
+      [-35, 'raid', null, false],
+      [-6, 'spawn', null, false],
+      // The name of a species is every form of it; the name of a form is that form.
+      [150, 'both', null, false],
+      [6, 'raid', 'charizard_mega_y', false],
+      [201, 'both', null, false],
+      [645, 'raid', null, true],
     ]);
   });
 
@@ -236,6 +249,183 @@ describe('/want', () => {
     expect(made.store.rows).toEqual([]);
   });
 
+  it('wants one form of a Pokémon, and says that only that form counts', async () => {
+    const made = setup();
+    expect(await made.answer('want', { target: 'pokemon:487:giratina_origin' })).toBe(
+      'You will get a DM when a Giratina (Origin Forme) raid or a wild Giratina (Origin Forme) ' +
+        'is reported in a region you can see. Only that form counts. ' +
+        '`/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'Alolan Rattata', type: 'spawn' })).toBe(
+      'You will get a DM when a wild Alolan Rattata is reported in a region you can see. ' +
+        'Only that form counts. `/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'mega charizard y', type: 'raid' })).toBe(
+      'You will get a DM when a Mega Charizard Y raid is reported in a region you can see. ' +
+        'Only that form counts. `/unwant` takes it off again.',
+    );
+    // Wanted again, the form's own scope changes.
+    expect(await made.answer('want', { target: 'giratina origin', type: 'raid' })).toBe(
+      'You will get a DM when a Giratina (Origin Forme) raid is reported in a region you can ' +
+        'see. Only that form counts. Until now it was for raids and spawns. ' +
+        '`/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'giratina origin', type: 'raid' })).toBe(
+      'Giratina (Origin Forme) is on your list already, for raids. `/unwant` takes it off.',
+    );
+    expect(made.formRows()).toEqual([
+      [487, 'raid', 'giratina_origin', false],
+      [19, 'spawn', 'rattata_alola', false],
+      [6, 'raid', 'charizard_mega_y', false],
+    ]);
+  });
+
+  it('wants the shadow raids of a Pokémon, always for raids', async () => {
+    const made = setup();
+    expect(await made.answer('want', { target: 'pokemon:645::shadow' })).toBe(
+      'You will get a DM when a Shadow Landorus raid is reported in a region you can see. ' +
+        'Every form of Landorus counts. `/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'shadow giratina origin', type: 'both' })).toBe(
+      'You will get a DM when a Shadow Giratina (Origin Forme) raid is reported in a region ' +
+        'you can see. Only that form counts. Shadow raids are raids, so that is ' +
+        'what I stored. `/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'Shadow Landorus', type: 'spawn' })).toBe(
+      'Shadow Landorus is on your list already. Shadow raids are raids, so that is what I ' +
+        'stored. `/unwant` takes it off.',
+    );
+    expect(made.formRows()).toEqual([
+      [645, 'raid', null, true],
+      [487, 'raid', 'giratina_origin', true],
+    ]);
+  });
+
+  it('wants a mega for raids only, whatever was picked', async () => {
+    const made = setup();
+    expect(await made.answer('want', { target: 'mega charizard y' })).toBe(
+      'You will get a DM when a Mega Charizard Y raid is reported in a region you can see. ' +
+        'Only that form counts. `/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'pokemon:9:blastoise_mega', type: 'both' })).toBe(
+      'You will get a DM when a Mega Blastoise raid is reported in a region you can see. ' +
+        'Only that form counts. Mega Pokémon are met in raids only, so that is what I stored. ' +
+        '`/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'mega charizard y', type: 'spawn' })).toBe(
+      'Mega Charizard Y is on your list already. Mega Pokémon are met in raids only, so that ' +
+        'is what I stored. `/unwant` takes it off.',
+    );
+    expect(made.formRows()).toEqual([
+      [6, 'raid', 'charizard_mega_y', false],
+      [9, 'raid', 'blastoise_mega', false],
+    ]);
+    // A row that says otherwise is read as raids, shown without a scope, and left as it is.
+    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'both', { form: 'mewtwo_mega_x' });
+    expect(await made.answer('want', { target: 'mega mewtwo x', type: 'raid' })).toBe(
+      'Mega Mewtwo X is on your list already. `/unwant` takes it off.',
+    );
+    expect((await made.choices('unwant', 'mega')).map((choice) => choice.name)).toEqual([
+      'Mega Blastoise',
+      'Mega Charizard Y',
+      'Mega Mewtwo X',
+    ]);
+    expect(made.formRows()[2]).toEqual([150, 'both', 'mewtwo_mega_x', false]);
+  });
+
+  it('wants the base form of a species alone under that name', async () => {
+    const made = setup();
+    expect(await made.answer('want', { target: 'pokemon:6:charizard', type: 'raid' })).toBe(
+      'You will get a DM when a Charizard (base form) raid is reported in a region you can ' +
+        'see. Only that form counts. `/unwant` takes it off again.',
+    );
+    expect(await made.answer('want', { target: 'Charizard base form', type: 'raid' })).toBe(
+      'Charizard (base form) is on your list already, for raids. `/unwant` takes it off.',
+    );
+    // The token of the one entry of a species is the species.
+    await made.run('want', { target: 'pokemon:147:dratini' });
+    expect(made.formRows()).toEqual([
+      [6, 'raid', 'charizard', false],
+      [147, 'both', null, false],
+    ]);
+  });
+
+  it('reads a name with raids, eggs or spawns after it, which say nothing of the type', async () => {
+    const made = setup();
+    await made.run('want', { target: 'lugia raids' });
+    await made.run('want', { target: 'shadow lugia raids' });
+    await made.run('want', { target: 'dratini spawns', type: 'raid' });
+    expect(made.formRows()).toEqual([
+      [249, 'both', null, false],
+      [249, 'raid', null, true],
+      [147, 'raid', null, false],
+    ]);
+  });
+
+  it('suggests shadow raids for a misspelt name after shadow', async () => {
+    const made = setup();
+    const refused = await made.run('want', { target: 'shadow mewtw' });
+    expect(sent(refused.followUp).content).toBe(
+      'I do not know a Pokémon, raid tier or IV target called "shadow mewtw". ' +
+        'Did you mean Shadow Mewtwo? Pick one from the list that appears while you type.',
+    );
+    expect(made.store.rows).toEqual([]);
+  });
+
+  it('reads a row whose form is an older key of an entry as that entry, and gives it its key', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina' });
+    expect(await made.choices('unwant', '')).toEqual([
+      { name: 'Giratina (Altered Forme) · raids', value: 'pokemon:487:giratina_altered' },
+    ]);
+    expect(await made.answer('want', { target: 'giratina altered', type: 'raid' })).toBe(
+      'Giratina (Altered Forme) is on your list already, for raids. `/unwant` takes it off.',
+    );
+    expect(made.formRows()).toEqual([[487, 'raid', 'giratina_altered', false]]);
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'spawn', { form: 'giratina' });
+    expect(await made.answer('unwant', { target: 'pokemon:487:giratina_altered' })).toBe(
+      'Giratina (Altered Forme) is off your list.',
+    );
+    expect(made.formRows()).toEqual([]);
+    // Named by the older key itself, it is the same want.
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina' });
+    expect(await made.answer('unwant', { target: 'pokemon:487:giratina' })).toBe(
+      'Giratina (Altered Forme) is off your list.',
+    );
+    expect(made.formRows()).toEqual([]);
+  });
+
+  it('keeps the species, one form and the shadow raids of a Pokémon side by side', async () => {
+    const made = setup();
+    await made.run('want', { target: 'Giratina', type: 'spawn' });
+    await made.run('want', { target: 'Giratina Origin', type: 'raid' });
+    await made.run('want', { target: 'shadow giratina' });
+    await made.run('want', { target: 'Giratina', type: 'both' });
+    expect(made.formRows()).toEqual([
+      [487, 'both', null, false],
+      [487, 'raid', 'giratina_origin', false],
+      [487, 'raid', null, true],
+    ]);
+  });
+
+  it('stores the key of the entry for an alias, and refuses a form the game data does not have', async () => {
+    const made = setup();
+    await made.run('want', { target: 'pokemon:487:giratina' });
+    expect(made.formRows()).toEqual([[487, 'both', 'giratina_altered', false]]);
+    for (const target of ['pokemon:487:giratina_sky', 'pokemon:6:giratina_origin']) {
+      const gone = await made.run('want', { target });
+      expect(sent(gone.followUp).content).toBe(
+        'I do not know that Pokémon any more. Pick again from the list.',
+      );
+    }
+    // Nothing is guessed behind `shadow` either.
+    const refused = await made.run('want', { target: 'shadow landoru' });
+    expect(sent(refused.followUp).content).toMatch(
+      /^I do not know a Pokémon, raid tier or IV target called "shadow landoru"\./,
+    );
+    expect(made.formRows()).toHaveLength(1);
+  });
+
   it('has no limit on the number of wants', async () => {
     const made = setup();
     for (let dex = 1; dex <= 120; dex++) {
@@ -274,16 +464,102 @@ describe('/want: the list of choices', () => {
     ]);
   });
 
-  it('puts the current raid bosses that fit first, as species', async () => {
+  it('puts the current raid bosses that fit first: a shadow boss, a form, each with its species', async () => {
     const made = setup();
-    // Shadow Landorus (Incarnate) is a boss of the fixture: its species is offered, once.
+    // Shadow Landorus (Incarnate) is a boss of the fixture: the shadow raids of its species,
+    // then the species; its forms come after, with what else the search finds.
     const landorus = await made.choices('want', 'land');
-    expect(landorus[0]).toEqual({ name: 'Landorus', value: 'pokemon:645' });
-    expect(landorus.filter((choice) => choice.value === 'pokemon:645')).toHaveLength(1);
-    // Mega Blastoise is a boss: the want is for Blastoise.
-    expect((await made.choices('want', 'blast'))[0]).toEqual({
-      name: 'Blastoise',
-      value: 'pokemon:9',
+    expect(landorus.slice(0, 2)).toEqual([
+      { name: 'Shadow Landorus', value: 'pokemon:645::shadow' },
+      { name: 'Landorus (every form)', value: 'pokemon:645' },
+    ]);
+    expect(landorus).toContainEqual({
+      name: 'Landorus (Therian Forme)',
+      value: 'pokemon:645:landorus_therian',
+    });
+    expect(new Set(landorus.map((choice) => choice.value)).size).toBe(landorus.length);
+    // Mega Blastoise is a boss, one of several entries of Blastoise: that form, then the species.
+    expect(await made.choices('want', 'blast')).toEqual([
+      { name: 'Mega Blastoise', value: 'pokemon:9:blastoise_mega' },
+      { name: 'Blastoise (every form)', value: 'pokemon:9' },
+      { name: 'Blastoise (base form)', value: 'pokemon:9:blastoise' },
+    ]);
+    // Yveltal is a boss and all there is of its species: once, plainly.
+    expect(await made.choices('want', 'yvel')).toEqual([{ name: 'Yveltal', value: 'pokemon:717' }]);
+    // Shadow Gastly is a boss: its shadow raids, then the species, which has no other entry.
+    expect((await made.choices('want', 'gastl')).slice(0, 2)).toEqual([
+      { name: 'Shadow Gastly', value: 'pokemon:92::shadow' },
+      { name: 'Gastly', value: 'pokemon:92' },
+    ]);
+  });
+
+  it('offers a species with several entries as every form, then each entry by its name', async () => {
+    const made = setup();
+    expect(await made.choices('want', 'mewtw')).toEqual([
+      { name: 'Mewtwo (every form)', value: 'pokemon:150' },
+      { name: 'Mewtwo (base form)', value: 'pokemon:150:mewtwo' },
+      { name: 'Armored Mewtwo', value: 'pokemon:150:mewtwo_a' },
+      { name: 'Mega Mewtwo X', value: 'pokemon:150:mewtwo_mega_x' },
+      { name: 'Mega Mewtwo Y', value: 'pokemon:150:mewtwo_mega_y' },
+    ]);
+    const giratina = (await made.choices('want', 'giratin')).map((choice) => choice.name);
+    expect(giratina).toEqual([
+      'Giratina (every form)',
+      'Giratina (Altered Forme)',
+      'Giratina (Origin Forme)',
+    ]);
+    // A species that is one entry is offered once, plainly.
+    const dratini = await made.choices('want', 'dratin');
+    expect(dratini[0]).toEqual({ name: 'Dratini', value: 'pokemon:147' });
+    expect(dratini.filter((choice) => String(choice.value).startsWith('pokemon:147'))).toHaveLength(
+      1,
+    );
+  });
+
+  it('puts what the text names in full before everything else', async () => {
+    const made = setup();
+    expect((await made.choices('want', 'giratina origin')).slice(0, 2)).toEqual([
+      { name: 'Giratina (Origin Forme)', value: 'pokemon:487:giratina_origin' },
+      { name: 'Giratina (every form)', value: 'pokemon:487' },
+    ]);
+    expect((await made.choices('want', 'shadow giratina origin'))[0]).toEqual({
+      name: 'Shadow Giratina (Origin Forme)',
+      value: 'pokemon:487:giratina_origin:shadow',
+    });
+    expect((await made.choices('want', 'Mewtwo'))[0]).toEqual({
+      name: 'Mewtwo (every form)',
+      value: 'pokemon:150',
+    });
+  });
+
+  it('offers shadow raids after the word shadow: the shadow bosses, then what the rest finds', async () => {
+    const made = setup();
+    // The word alone: the shadow tiers, then the shadow raids of each shadow boss.
+    const shadow = (await made.choices('want', 'shadow')).map((choice) => choice.name);
+    expect(shadow.slice(0, 5)).toEqual([
+      'Shadow T1 raids',
+      'Shadow T3 raids',
+      'Shadow T5 raids',
+      'Shadow Gastly',
+      'Shadow Gible',
+    ]);
+    // Eight shadow bosses in the fixture, each once and none with its species beside it.
+    expect(shadow.slice(3, 11).every((name) => /^Shadow (?!T\d)/.test(name))).toBe(true);
+    expect(shadow.slice(3, 11)).toContain('Shadow Landorus');
+    expect(shadow).not.toContain('Landorus (every form)');
+    expect(shadow).not.toContain('Gastly');
+    // With the beginning of a name: the shadow raids of the species it finds, no boss needed.
+    expect(await made.choices('want', 'shadow mewtw')).toEqual([
+      { name: 'Shadow Mewtwo', value: 'pokemon:150::shadow' },
+    ]);
+    expect((await made.choices('want', 'shadow land'))[0]).toEqual({
+      name: 'Shadow Landorus',
+      value: 'pokemon:645::shadow',
+    });
+    // A shadow tier stays a tier.
+    expect((await made.choices('want', 'shadow 5'))[0]).toEqual({
+      name: 'Shadow T5 raids',
+      value: 'tier:T5:shadow',
     });
   });
 
@@ -300,7 +576,7 @@ describe('/want: the list of choices', () => {
     });
     // No boss right now, found all the same.
     expect(await made.choices('want', 'mewtw')).toContainEqual({
-      name: 'Mewtwo',
+      name: 'Mewtwo (every form)',
       value: 'pokemon:150',
     });
   });
@@ -337,10 +613,22 @@ describe('/want: the list of choices', () => {
 
   it('gives values that the command reads back', async () => {
     const made = setup();
-    for (const choice of await made.choices('want', 'gira')) {
+    const offered = await made.choices('want', 'gira');
+    for (const choice of offered) await made.run('want', { target: String(choice.value) });
+    expect(made.formRows()).toEqual([
+      [203, 'both', null, false],
+      [487, 'both', null, false],
+      [487, 'both', 'giratina_altered', false],
+      [487, 'both', 'giratina_origin', false],
+    ]);
+    // Each is on the list under the name it was offered by.
+    expect((await made.choices('unwant', '')).map((choice) => choice.value).sort()).toEqual(
+      offered.map((choice) => choice.value).sort(),
+    );
+    for (const choice of await made.choices('want', 'shadow land')) {
       await made.run('want', { target: String(choice.value) });
     }
-    expect(made.rows()).toContainEqual([487, 'both']);
+    expect(made.formRows()).toContainEqual([645, 'raid', null, true]);
   });
 });
 
@@ -349,9 +637,11 @@ describe('/unwant', () => {
     const made = setup();
     await made.run('want', { target: 'pokemon:150' });
     await made.run('want', { target: 'tier:T5' });
-    expect(await made.answer('unwant', { target: 'pokemon:150' })).toBe('Mewtwo is off your list.');
     expect(await made.answer('unwant', { target: 'pokemon:150' })).toBe(
-      'Mewtwo is not on your list. `/wants` shows what is.',
+      'Mewtwo (every form) is off your list.',
+    );
+    expect(await made.answer('unwant', { target: 'pokemon:150' })).toBe(
+      'Mewtwo (every form) is not on your list. `/wants` shows what is.',
     );
     expect(await made.answer('unwant', { target: 't5' })).toBe('T5 raids is off your list.');
     expect(made.rows()).toEqual([]);
@@ -362,13 +652,13 @@ describe('/unwant', () => {
     made.store.add(ALICE, FAKE_GUILD_ID, 99999, 'both');
     made.store.add(ALICE, FAKE_GUILD_ID, 99998, 'raid');
     expect(await made.choices('unwant', '')).toEqual([
-      { name: 'Pokémon #99998 (raids)', value: 'pokemon:99998' },
-      { name: 'Pokémon #99999 (raids and spawns)', value: 'pokemon:99999' },
+      { name: 'Pokémon #99998 · raids', value: 'pokemon:99998' },
+      { name: 'Pokémon #99999 · raids and spawns', value: 'pokemon:99999' },
     ]);
     expect(await made.answer('unwant', { target: 'pokemon:99999' })).toBe(
       'Pokémon #99999 is off your list.',
     );
-    expect(await made.answer('unwant', { target: 'Pokémon #99998 (raids)' })).toBe(
+    expect(await made.answer('unwant', { target: 'Pokémon #99998 · raids' })).toBe(
       'Pokémon #99998 is off your list.',
     );
     expect(made.rows()).toEqual([]);
@@ -382,9 +672,98 @@ describe('/unwant', () => {
   it('reads a label of its own list typed in full', async () => {
     const made = setup();
     made.store.add(ALICE, FAKE_GUILD_ID, 25, 'raid');
+    expect(await made.answer('unwant', { target: 'Pikachu · raids' })).toBe(
+      'Pikachu is off your list.',
+    );
+  });
+
+  it('lists a form by its name and shadow raids as Shadow, and takes each off by itself', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'spawn');
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina_origin' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { shadow: true });
+    made.store.add(ALICE, FAKE_GUILD_ID, 645, 'raid', { form: 'landorus_therian', shadow: true });
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { form: 'giratina_sky' });
+    expect(await made.choices('unwant', '')).toEqual([
+      { name: 'Giratina (every form) · spawns', value: 'pokemon:487' },
+      { name: 'Giratina (giratina_sky) · raids and spawns', value: 'pokemon:487:giratina_sky' },
+      { name: 'Giratina (Origin Forme) · raids', value: 'pokemon:487:giratina_origin' },
+      { name: 'Shadow Giratina', value: 'pokemon:487::shadow' },
+      {
+        name: 'Shadow Landorus (Therian Forme)',
+        value: 'pokemon:645:landorus_therian:shadow',
+      },
+    ]);
+    expect((await made.choices('unwant', 'shadow')).map((choice) => choice.name)).toEqual([
+      'Shadow Giratina',
+      'Shadow Landorus (Therian Forme)',
+    ]);
+    expect(await made.answer('unwant', { target: 'pokemon:487:giratina_origin' })).toBe(
+      'Giratina (Origin Forme) is off your list.',
+    );
+    expect(await made.answer('unwant', { target: 'pokemon:487:giratina_origin' })).toBe(
+      'Giratina (Origin Forme) is not on your list. `/wants` shows what is.',
+    );
+    // Typed text is read as for `/want`.
+    expect(await made.answer('unwant', { target: 'shadow giratina' })).toBe(
+      'Shadow Giratina is off your list.',
+    );
+    expect(await made.answer('unwant', { target: 'shadow landorus therian' })).toBe(
+      'Shadow Landorus (Therian Forme) is off your list.',
+    );
+    // A form the game data does not have: by its choice, as `/want` would refuse it.
+    expect(await made.answer('unwant', { target: 'pokemon:487:giratina_sky' })).toBe(
+      'Giratina (giratina\\_sky) is off your list.',
+    );
+    expect(made.formRows()).toEqual([[487, 'spawn', null, false]]);
+    expect(await made.answer('unwant', { target: 'giratina' })).toBe(
+      'Giratina (every form) is off your list.',
+    );
+    expect(made.formRows()).toEqual([]);
+  });
+
+  it('reads a name of its own list typed in full, also where typed text alone would mean another', async () => {
+    const made = setup();
+    // The one entry called as its species is: the list calls it the base form.
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid', { form: 'charizard' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { form: 'giratina_sky' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 150, 'spawn');
+    made.store.add(ALICE, FAKE_GUILD_ID, 25, 'raid');
+    expect((await made.choices('unwant', 'chari')).map((choice) => choice.name)).toEqual([
+      'Charizard (base form) · raids',
+    ]);
+    // The scope in brackets is read as well as after the dot.
     expect(await made.answer('unwant', { target: 'Pikachu (raids)' })).toBe(
       'Pikachu is off your list.',
     );
+    expect(
+      await made.answer('unwant', { target: 'Giratina (giratina_sky) · raids and spawns' }),
+    ).toBe('Giratina (giratina\\_sky) is off your list.');
+    // The same for the scope in brackets, which nothing but the member's own list can read.
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina_sky' });
+    expect(await made.answer('unwant', { target: 'Giratina (giratina_sky) (raids)' })).toBe(
+      'Giratina (giratina\\_sky) is off your list.',
+    );
+    expect(await made.answer('unwant', { target: 'mewtwo (every form) · spawns' })).toBe(
+      'Mewtwo (every form) is off your list.',
+    );
+    // The bare name is the species, which is not on the list.
+    expect(await made.answer('unwant', { target: 'charizard' })).toBe(
+      'Charizard (every form) is not on your list. `/wants` shows what is.',
+    );
+    expect(await made.answer('unwant', { target: 'charizard base form' })).toBe(
+      'Charizard (base form) is off your list.',
+    );
+    expect(made.formRows()).toEqual([]);
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'raid', { form: 'charizard' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'spawn');
+    expect(await made.answer('unwant', { target: 'Charizard' })).toBe(
+      'Charizard (every form) is off your list.',
+    );
+    expect(await made.answer('unwant', { target: 'Charizard (base form) · raids' })).toBe(
+      'Charizard (base form) is off your list.',
+    );
+    expect(made.formRows()).toEqual([]);
   });
 
   it('answers the list with nothing when the wants cannot be read', async () => {
@@ -399,7 +778,7 @@ describe('/unwant', () => {
     made.store.add(ALICE, OTHER_GUILD, 150, 'both');
     made.store.add(BOB, FAKE_GUILD_ID, 150, 'both');
     expect(await made.answer('unwant', { target: 'mewtwo' })).toBe(
-      'Mewtwo is not on your list. `/wants` shows what is.',
+      'Mewtwo (every form) is not on your list. `/wants` shows what is.',
     );
     expect(made.store.rows).toHaveLength(2);
   });
@@ -424,13 +803,13 @@ describe('/unwant', () => {
     made.store.add(ALICE, OTHER_GUILD, 1, 'both');
     made.store.add(BOB, FAKE_GUILD_ID, 2, 'both');
     expect(await made.choices('unwant', '')).toEqual([
-      { name: 'Dratini (spawns)', value: 'pokemon:147' },
-      { name: 'Mewtwo (raids and spawns)', value: 'pokemon:150' },
+      { name: 'Dratini · spawns', value: 'pokemon:147' },
+      { name: 'Mewtwo (every form) · raids and spawns', value: 'pokemon:150' },
       { name: 'Perfect IV spawns', value: 'iv:perfect' },
       { name: 'T5 raids', value: 'tier:T5' },
     ]);
     expect(await made.choices('unwant', 'mew')).toEqual([
-      { name: 'Mewtwo (raids and spawns)', value: 'pokemon:150' },
+      { name: 'Mewtwo (every form) · raids and spawns', value: 'pokemon:150' },
     ]);
     // A word for a tier finds it, also when the label spells it otherwise.
     expect(await made.choices('unwant', 'tier 5')).toEqual([
@@ -438,8 +817,8 @@ describe('/unwant', () => {
     ]);
     // What begins with the text comes before what only holds it.
     expect((await made.choices('unwant', 's')).map((choice) => choice.name)).toEqual([
-      'Dratini (spawns)',
-      'Mewtwo (raids and spawns)',
+      'Dratini · spawns',
+      'Mewtwo (every form) · raids and spawns',
       'Perfect IV spawns',
       'T5 raids',
     ]);
@@ -451,7 +830,7 @@ describe('/unwant', () => {
     for (let dex = 1; dex <= 160; dex++) made.store.add(ALICE, FAKE_GUILD_ID, dex, 'both');
     expect(await made.choices('unwant', '')).toHaveLength(25);
     expect((await made.choices('unwant', 'mewtwo'))[0]).toEqual({
-      name: 'Mewtwo (raids and spawns)',
+      name: 'Mewtwo (every form) · raids and spawns',
       value: 'pokemon:150',
     });
   });
@@ -490,14 +869,46 @@ describe('/wants', () => {
     expect(embed?.title).toBe('Your notifications in this server');
     expect(embed?.description).toBe('`/want` adds to the list, `/unwant` takes off it.');
     expect(fieldsOf(used)).toEqual([
-      { name: 'Raids and spawns (2)', value: 'Mewtwo, Venusaur' },
+      { name: 'Raids and spawns (2)', value: 'Mewtwo (every form), Venusaur (every form)' },
       { name: 'Raids (1)', value: 'Dratini' },
-      { name: 'Spawns (1)', value: 'Giratina' },
+      { name: 'Spawns (1)', value: 'Giratina (every form)' },
       { name: 'Raid tiers (3)', value: 'T1, T5, Shadow T5' },
       { name: 'Spawn IVs (2)', value: 'Perfect, Zero' },
     ]);
   });
 
+  it('lists a form by its name, and shadow raids as Shadow among the raids', async () => {
+    const made = setup();
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid');
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina_origin' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { shadow: true });
+    made.store.add(ALICE, FAKE_GUILD_ID, 645, 'spawn', { form: 'landorus_therian', shadow: true });
+    made.store.add(ALICE, FAKE_GUILD_ID, 19, 'spawn', { form: 'rattata_alola' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'both', { form: 'charizard_mega_y' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'both', { form: 'charizard' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 6, 'both');
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { form: 'giratina_sky' });
+    made.store.add(ALICE, FAKE_GUILD_ID, 487, 'both', { form: 'Origin Forme' });
+    const used = await made.run('wants');
+    expect(fieldsOf(used)).toEqual([
+      {
+        name: 'Raids and spawns (3)',
+        value: 'Charizard (base form), Charizard (every form), Giratina (giratina\\_sky)',
+      },
+      {
+        // A mega is about raids whatever its row says.
+        name: 'Raids (5)',
+        value:
+          'Giratina (every form), Giratina (Origin Forme), Mega Charizard Y, Shadow Giratina, ' +
+          'Shadow Landorus (Therian Forme)',
+      },
+      { name: 'Spawns (1)', value: 'Alolan Rattata' },
+    ]);
+    expect(sent(used.editReply).embeds?.[0]?.toJSON().description).toContain(
+      '…and 1 entry this version cannot read',
+    );
+  });
+
   it('says how many rows this version cannot read, and names an unknown species by its number', async () => {
     const made = setup();
     made.store.add(ALICE, FAKE_GUILD_ID, 99999, 'both');
@@ -533,6 +944,15 @@ describe('/wants', () => {
           target: { kind: 'pokemon', dex },
           scope: scopes[index % 3] ?? 'both',
         })),
+        // Every entry as a form of its own, and the shadow raids of every species.
+        ...ctx.gameData.catalogue.all.map((entry, index): Want => ({
+          target: pokemonTarget(entry.dex, entry.key),
+          scope: scopes[index % 3] ?? 'both',
+        })),
+        ...dexes.map((dex): Want => ({
+          target: pokemonTarget(dex, undefined, true),
+          scope: 'raid',
+        })),
         ...notificationTiers().map((tier): Want => ({
           target: { kind: 'tier', tier },
           scope: 'raid',
```

Apply to `src/commands/settings/settings.test.ts`:

```diff
--- a/src/commands/settings/settings.test.ts
+++ b/src/commands/settings/settings.test.ts
@@ -222,6 +222,17 @@ describe('/settings show', () => {
     expect(sent(dm.editReply).content).not.toMatch(/on your list|Your gyms/);
   });
 
+  it('counts a species, one form of it and its shadow raids as an entry each', async () => {
+    const made = setup();
+    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'both');
+    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { form: 'giratina_origin' });
+    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'spawn', { form: 'giratina_origin' });
+    made.wants.add(ALICE, FAKE_GUILD_ID, 487, 'raid', { shadow: true });
+    expect(await made.answer('show')).toContain(
+      '- Pokémon and raid tiers on your list in this server: **3** · `/wants`',
+    );
+  });
+
   it('leaves the lists out where notifications are switched off', async () => {
     const made = setup({ notifications: false });
     expect(await made.answer('show')).not.toMatch(/on your list|Your gyms/);
```

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -25,7 +25,12 @@ async function migrate(database: TestDatabase): Promise<void> {
 /** The tables the new bot adds to a database it takes over. */
 const ADDED_TABLES = ['RaidBoss', 'RaidBossOverride', 'Party', 'PartyAccessGrant'];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
-const ADDED_COLUMNS = ['Region.forumChannelId', 'Region.summaryMessageId'];
+const ADDED_COLUMNS = [
+  'Region.forumChannelId',
+  'Region.summaryMessageId',
+  'PokemonNotification.form',
+  'PokemonNotification.shadow',
+];
 /** The indexes it adds to tables of the legacy bot, as `Table.index`. */
 const ADDED_INDEXES = ['Region.region_forumchannelid_unique'];
 
@@ -99,6 +104,7 @@ describe('runMigrations', () => {
       '2026_10_11_002_parties',
       '2026_10_11_003_raid_boss_image',
       '2026_10_11_004_party_access_grants',
+      '2026_10_12_005_pokemon_notification_form',
     ]);
     expect(await describeSchema(database, ADDED_TABLES, ADDED_COLUMNS, ADDED_INDEXES)).toEqual(
       before,
```

Apply to `src/db/repositories/pokemon-notification-repository.db.test.ts`:

```diff
--- a/src/db/repositories/pokemon-notification-repository.db.test.ts
+++ b/src/db/repositories/pokemon-notification-repository.db.test.ts
@@ -1,8 +1,8 @@
 import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
-import { MemoryWants } from '../../../test/support/wants.js';
-import type { NotificationTarget } from '../../domain/pogo/notification-target.js';
+import { fixtureForms, MemoryWants } from '../../../test/support/wants.js';
+import { pokemonTarget, type NotificationTarget } from '../../domain/pogo/notification-target.js';
 import type { RaidLevel } from '../../domain/pogo/raid-tier.js';
 import type { DB } from '../types.js';
 import {
@@ -22,6 +22,8 @@ const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
   tier: { level, shadow },
 });
 const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
+const ORIGIN = pokemonTarget(487, 'giratina_origin');
+const SHADOW_GIRATINA = pokemonTarget(487, undefined, true);
 
 describe('PokemonNotificationRepository', () => {
   let stop: () => Promise<void>;
@@ -31,7 +33,7 @@ describe('PokemonNotificationRepository', () => {
 
   beforeAll(async () => {
     ({ db, stop } = await startMigratedDatabase());
-    wants = new PokemonNotificationRepository(db);
+    wants = new PokemonNotificationRepository(db, fixtureForms());
     users = new UserRepository(db);
   });
   afterAll(async () => {
@@ -56,6 +58,25 @@ describe('PokemonNotificationRepository', () => {
       .select(['pokemon', 'type', 'userId', 'guildId'])
       .orderBy('id')
       .execute();
+  /** A row with the two newer columns as somebody may have left them. */
+  const formRow = async (
+    member: string,
+    guildId: number,
+    values: { pokemon: number; type: string; form?: string | null; shadow?: number },
+  ) =>
+    db
+      .insertInto('PokemonNotification')
+      .values({ userId: await users.ensure(member), guildId, ...values })
+      .execute();
+  /** Every row as `[pokemon, type, form, shadow]`. */
+  const storedForms = async () =>
+    (
+      await db
+        .selectFrom('PokemonNotification')
+        .select(['pokemon', 'type', 'form', 'shadow'])
+        .orderBy('id')
+        .execute()
+    ).map((row) => [row.pokemon, row.type, row.form, row.shadow]);
 
   it('has nothing for a member without a row, and creates none by reading', async () => {
     expect(await wants.list(ALICE, HOME)).toEqual({ wants: [], unreadable: 0 });
@@ -308,6 +329,195 @@ describe('PokemonNotificationRepository', () => {
     expect((await stored()).map((row) => [row.pokemon, row.type])).toEqual([[-6, 'raid']]);
   });
 
+  it('leaves a row from before the two columns as it was, and reads it as the species', async () => {
+    await legacyRow(ALICE, 1, 487, 'raid');
+    expect(await storedForms()).toEqual([[487, 'raid', null, 0]]);
+    expect((await wants.list(ALICE, HOME)).wants).toEqual([
+      { target: species(487), scope: 'raid' },
+    ]);
+  });
+
+  it('keeps a want for a species, for one form of it and for its shadow raids side by side', async () => {
+    expect(await wants.set(ALICE, HOME, species(487), 'both')).toMatchObject({ kind: 'added' });
+    expect(await wants.set(ALICE, HOME, ORIGIN, 'raid')).toEqual({
+      kind: 'added',
+      want: { target: ORIGIN, scope: 'raid' },
+    });
+    // Shadow raids are raids, whatever was asked for.
+    expect(await wants.set(ALICE, HOME, SHADOW_GIRATINA, 'both')).toEqual({
+      kind: 'added',
+      want: { target: SHADOW_GIRATINA, scope: 'raid' },
+    });
+    expect(
+      await wants.set(ALICE, HOME, pokemonTarget(487, 'giratina_origin', true), 'spawn'),
+    ).toMatchObject({ kind: 'added' });
+    expect(await storedForms()).toEqual([
+      [487, 'both', null, 0],
+      [487, 'raid', 'giratina_origin', 0],
+      [487, 'raid', null, 1],
+      [487, 'raid', 'giratina_origin', 1],
+    ]);
+    expect(await wants.list(ALICE, HOME)).toEqual({
+      wants: [
+        { target: species(487), scope: 'both' },
+        { target: ORIGIN, scope: 'raid' },
+        { target: SHADOW_GIRATINA, scope: 'raid' },
+        { target: pokemonTarget(487, 'giratina_origin', true), scope: 'raid' },
+      ],
+      unreadable: 0,
+    });
+    expect(await wants.count(ALICE, HOME)).toBe(4);
+    // Each is changed and removed by itself.
+    expect(await wants.set(ALICE, HOME, ORIGIN, 'spawn')).toEqual({
+      kind: 'changed',
+      want: { target: ORIGIN, scope: 'spawn' },
+      before: 'raid',
+    });
+    expect(await wants.set(ALICE, HOME, SHADOW_GIRATINA, 'spawn')).toMatchObject({
+      kind: 'unchanged',
+    });
+    expect(await wants.remove(ALICE, HOME, species(487))).toBe(true);
+    expect(await wants.remove(ALICE, HOME, species(487))).toBe(false);
+    expect(await storedForms()).toEqual([
+      [487, 'spawn', 'giratina_origin', 0],
+      [487, 'raid', null, 1],
+      [487, 'raid', 'giratina_origin', 1],
+    ]);
+    expect(await wants.remove(ALICE, HOME, SHADOW_GIRATINA)).toBe(true);
+    expect(await wants.remove(ALICE, HOME, ORIGIN)).toBe(true);
+    expect(await storedForms()).toEqual([[487, 'raid', 'giratina_origin', 1]]);
+  });
+
+  it('writes no form and no flag for a tier or an IV target, and reads such a row by its number alone', async () => {
+    await wants.set(ALICE, HOME, tier('T5', true), 'raid');
+    await wants.set(ALICE, HOME, PERFECT, 'spawn');
+    expect(await storedForms()).toEqual([
+      [-35, 'raid', null, 0],
+      [-6, 'spawn', null, 0],
+    ]);
+    // Stray values in the two columns of a tier or IV row mean nothing.
+    await formRow(BOB, 1, { pokemon: -5, type: 'raid', form: 'giratina_origin', shadow: 1 });
+    await formRow(BOB, 1, { pokemon: -8, type: 'spawn', form: 'not a key', shadow: 1 });
+    expect(await wants.list(BOB, HOME)).toEqual({
+      wants: [
+        { target: tier('T5'), scope: 'raid' },
+        { target: { kind: 'iv', iv: 'zero' }, scope: 'spawn' },
+      ],
+      unreadable: 0,
+    });
+    expect(await wants.set(BOB, HOME, tier('T5'), 'raid')).toMatchObject({ kind: 'unchanged' });
+    expect(await wants.remove(BOB, HOME, tier('T5'))).toBe(true);
+    expect((await wants.list(BOB, HOME)).wants).toHaveLength(1);
+  });
+
+  it('makes one row of several rows for one form, and leaves the other wants of the species', async () => {
+    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina_origin' });
+    await formRow(ALICE, 1, { pokemon: 487, type: 'spawn' });
+    await formRow(ALICE, 1, { pokemon: 487, type: 'Spawn', form: 'Giratina_Origin' });
+    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: 'giratina_origin', shadow: 1 });
+    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: 1 });
+    expect((await wants.list(ALICE, HOME)).wants).toEqual([
+      { target: ORIGIN, scope: 'both' },
+      { target: species(487), scope: 'spawn' },
+      { target: pokemonTarget(487, 'giratina_origin', true), scope: 'raid' },
+    ]);
+    expect(await wants.count(ALICE, HOME)).toBe(3);
+    expect(await wants.set(ALICE, HOME, ORIGIN, 'raid')).toEqual({
+      kind: 'changed',
+      want: { target: ORIGIN, scope: 'raid' },
+      before: 'both',
+    });
+    expect(await storedForms()).toEqual([
+      [487, 'raid', 'giratina_origin', 0],
+      [487, 'spawn', null, 0],
+      [487, 'both', 'giratina_origin', 1],
+      [487, 'raid', 'giratina_origin', 1],
+    ]);
+    // The shadow want says raid in both its rows already: the oldest stays, as it is.
+    expect(
+      await wants.set(ALICE, HOME, pokemonTarget(487, 'giratina_origin', true), 'raid'),
+    ).toMatchObject({ kind: 'unchanged' });
+    expect(await storedForms()).toEqual([
+      [487, 'raid', 'giratina_origin', 0],
+      [487, 'spawn', null, 0],
+      [487, 'both', 'giratina_origin', 1],
+    ]);
+  });
+
+  it('reads a form the game data may not know, removes it when asked, and counts what is no key', async () => {
+    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: 'giratina_sky' });
+    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: 'Origin Forme' });
+    await formRow(ALICE, 1, { pokemon: 487, type: 'both', form: '' });
+    expect(await wants.list(ALICE, HOME)).toEqual({
+      wants: [
+        { target: pokemonTarget(487, 'giratina_sky'), scope: 'both' },
+        // An empty form is none.
+        { target: species(487), scope: 'both' },
+      ],
+      unreadable: 1,
+    });
+    expect(await wants.remove(ALICE, HOME, pokemonTarget(487, 'giratina_sky'))).toBe(true);
+    // The row that cannot be read stays until the member removes everything.
+    expect(await storedForms()).toEqual([
+      [487, 'both', 'Origin Forme', 0],
+      [487, 'both', '', 0],
+    ]);
+    expect(await wants.removeAll(ALICE, HOME)).toBe(2);
+  });
+
+  it('makes one row when the same form is wanted many times at once', async () => {
+    const outcomes = await Promise.all(
+      Array.from({ length: 12 }, () => wants.set(ALICE, HOME, ORIGIN, 'raid')),
+    );
+    expect(outcomes.filter((outcome) => outcome.kind === 'added')).toHaveLength(1);
+    expect(await storedForms()).toEqual([[487, 'raid', 'giratina_origin', 0]]);
+  });
+
+  it('reads two keys of one entry as one want, and writes the key of today when it is set', async () => {
+    const altered = pokemonTarget(487, 'giratina_altered');
+    // `giratina` is an alias of the entry `giratina_altered` in the game data of the tests.
+    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
+    await formRow(ALICE, 1, { pokemon: 487, type: 'spawn', form: 'giratina_altered' });
+    expect(await wants.list(ALICE, HOME)).toEqual({
+      wants: [{ target: altered, scope: 'both' }],
+      unreadable: 0,
+    });
+    expect(await wants.count(ALICE, HOME)).toBe(1);
+    expect(await wants.set(ALICE, HOME, altered, 'both')).toMatchObject({ kind: 'unchanged' });
+    expect(await storedForms()).toEqual([[487, 'both', 'giratina_altered', 0]]);
+    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
+    expect(await wants.remove(ALICE, HOME, altered)).toBe(true);
+    expect(await storedForms()).toEqual([]);
+    // Named by the older key, it is the same want: one row, found and removed.
+    const older = pokemonTarget(487, 'giratina');
+    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
+    expect(await wants.set(ALICE, HOME, older, 'spawn')).toMatchObject({
+      kind: 'changed',
+      want: { target: altered, scope: 'spawn' },
+    });
+    expect(await storedForms()).toEqual([[487, 'spawn', 'giratina_altered', 0]]);
+    await formRow(ALICE, 1, { pokemon: 487, type: 'raid', form: 'giratina' });
+    expect(await wants.remove(ALICE, HOME, older)).toBe(true);
+    expect(await storedForms()).toEqual([]);
+  });
+
+  it('keeps a mega for raids only: stored so, and read so whatever a row says', async () => {
+    const megaY = pokemonTarget(6, 'charizard_mega_y');
+    expect(await wants.set(ALICE, HOME, megaY, 'both')).toEqual({
+      kind: 'added',
+      want: { target: megaY, scope: 'raid' },
+    });
+    expect(await storedForms()).toEqual([[6, 'raid', 'charizard_mega_y', 0]]);
+    await formRow(BOB, 1, { pokemon: 6, type: 'both', form: 'charizard_mega_y' });
+    expect((await wants.list(BOB, HOME)).wants).toEqual([{ target: megaY, scope: 'raid' }]);
+    // It says raids already: the row is not rewritten.
+    expect(await wants.set(BOB, HOME, megaY, 'spawn')).toMatchObject({ kind: 'unchanged' });
+    expect(await storedForms()).toEqual([
+      [6, 'raid', 'charizard_mega_y', 0],
+      [6, 'both', 'charizard_mega_y', 0],
+    ]);
+  });
+
   it('behaves as its twin in memory does', async () => {
     const memory = new MemoryWants();
     // What the legacy bot may have left: a duplicate, and a row that cannot be read.
@@ -317,6 +527,20 @@ describe('PokemonNotificationRepository', () => {
     memory.add(ALICE, HOME, 150, 'Raid');
     memory.add(ALICE, HOME, 150, 'spawn');
     memory.add(ALICE, HOME, -7, 'spawn');
+    // And rows with a form or for shadow raids: a duplicate, a key no game data has, no key.
+    for (const [type, form, shadow] of [
+      ['raid', 'giratina_origin', false],
+      ['Spawn', 'Giratina_Origin', false],
+      ['both', 'giratina_sky', false],
+      ['both', 'Origin Forme', false],
+      ['both', null, true],
+      // An older key of an entry (an alias), beside the key of today.
+      ['raid', 'giratina', false],
+      ['spawn', 'giratina_altered', false],
+    ] as const) {
+      await formRow(ALICE, 1, { pokemon: 487, type, form, shadow: shadow ? 1 : 0 });
+      memory.add(ALICE, HOME, 487, type, { form, shadow });
+    }
     const script = async (storage: WantStorage) => [
       await storage.list(ALICE, HOME),
       await storage.count(ALICE, HOME),
@@ -326,13 +550,25 @@ describe('PokemonNotificationRepository', () => {
       await storage.set(ALICE, HOME, PERFECT, 'raid'),
       await storage.set(ALICE, AWAY, species(1), 'spawn'),
       await storage.set(BOB, HOME, species(2), 'both'),
+      await storage.set(ALICE, HOME, ORIGIN, 'raid'),
+      await storage.set(ALICE, HOME, species(487), 'spawn'),
+      await storage.set(ALICE, HOME, SHADOW_GIRATINA, 'both'),
+      await storage.set(ALICE, HOME, pokemonTarget(487, 'giratina_origin', true), 'spawn'),
+      await storage.set(BOB, HOME, ORIGIN, 'both'),
+      await storage.set(BOB, HOME, pokemonTarget(6, 'charizard_mega_y'), 'both'),
+      await storage.set(ALICE, HOME, pokemonTarget(487, 'giratina_altered'), 'both'),
       await storage.list(ALICE, HOME),
       await storage.remove(ALICE, HOME, species(2)),
       await storage.remove(ALICE, HOME, tier('T5')),
+      await storage.remove(ALICE, HOME, pokemonTarget(487, 'giratina_sky')),
+      await storage.remove(ALICE, HOME, SHADOW_GIRATINA),
+      await storage.remove(ALICE, HOME, SHADOW_GIRATINA),
+      await storage.list(ALICE, HOME),
       await storage.count(ALICE, HOME),
       await storage.removeAll(ALICE, HOME),
       await storage.list(ALICE, HOME),
       await storage.count(ALICE, AWAY),
+      await storage.list(BOB, HOME),
       await storage.removeAll(BOB, HOME),
     ];
     expect(await script(wants)).toEqual(await script(memory));
```

Apply to `src/domain/pogo/notification-target.test.ts`:

```diff
--- a/src/domain/pogo/notification-target.test.ts
+++ b/src/domain/pogo/notification-target.test.ts
@@ -3,12 +3,17 @@ import {
   decodeNotification,
   encodeNotification,
   parseNotificationScope,
+  pokemonTarget,
+  readNotification,
+  sameNotificationTarget,
   type NotificationScope,
   type NotificationTarget,
 } from './notification-target.js';
 import { RAID_LEVELS, SHADOW_RAID_LEVELS, type RaidLevel } from './raid-tier.js';
 
 const SCOPES: readonly NotificationScope[] = ['raid', 'spawn', 'both'];
+/** What a row holds in the two newer columns when it is for no form and not for shadow raids. */
+const NONE = { form: null, shadow: false };
 
 const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
   kind: 'tier',
@@ -77,7 +82,11 @@ describe('notification codec: legacy rows', () => {
   it('reads -7 as the super mega tier (tier 7 in the game), for a raid row only', () => {
     expect(decodeNotification({ pokemon: -7, type: 'raid' })).toEqual(tier('SuperMega'));
     expect(decodeNotification({ pokemon: -7, type: 'Both' })).toEqual(tier('SuperMega'));
-    expect(encodeNotification(tier('SuperMega'), 'both')).toEqual({ pokemon: -7, type: 'raid' });
+    expect(encodeNotification(tier('SuperMega'), 'both')).toEqual({
+      pokemon: -7,
+      type: 'raid',
+      ...NONE,
+    });
   });
 
   it('returns undefined for values it does not know', () => {
@@ -94,6 +103,7 @@ describe('notification codec: writing', () => {
     expect(encodeNotification({ kind: 'pokemon', dex: 150 }, 'raid')).toEqual({
       pokemon: 150,
       type: 'raid',
+      ...NONE,
     });
     expect(() => encodeNotification({ kind: 'pokemon', dex: 0 }, 'both')).toThrow(RangeError);
     expect(() => encodeNotification({ kind: 'pokemon', dex: -6 }, 'both')).toThrow(RangeError);
@@ -111,14 +121,17 @@ describe('notification codec: writing', () => {
     expect(encodeNotification({ kind: 'iv', iv: 'perfect' }, 'both')).toEqual({
       pokemon: -6,
       type: 'spawn',
+      ...NONE,
     });
     expect(encodeNotification({ kind: 'iv', iv: 'zero' }, 'raid')).toEqual({
       pokemon: -8,
       type: 'spawn',
+      ...NONE,
     });
     expect(encodeNotification(tier('MegaLegendary'), 'spawn')).toEqual({
       pokemon: -6,
       type: 'raid',
+      ...NONE,
     });
   });
 
@@ -189,3 +202,158 @@ describe('parseNotificationScope', () => {
     expect(parseNotificationScope('')).toBeUndefined();
   });
 });
+
+describe('notification codec: one form, and shadow raids', () => {
+  const species = (dex: number) => pokemonTarget(dex);
+
+  it('spells a Pokémon target one way: no form for none, no shadow for false', () => {
+    expect(pokemonTarget(150)).toStrictEqual({ kind: 'pokemon', dex: 150 });
+    expect(pokemonTarget(150, null, false)).toStrictEqual({ kind: 'pokemon', dex: 150 });
+    expect(pokemonTarget(487, 'giratina_origin')).toStrictEqual({
+      kind: 'pokemon',
+      dex: 487,
+      form: 'giratina_origin',
+    });
+    expect(pokemonTarget(645, undefined, true)).toStrictEqual({
+      kind: 'pokemon',
+      dex: 645,
+      shadow: true,
+    });
+  });
+
+  it('reads a row from before the columns, and one that has them empty, as the species', () => {
+    expect(decodeNotification({ pokemon: 150, type: 'both' })).toStrictEqual(species(150));
+    expect(decodeNotification({ pokemon: 150, type: 'both', ...NONE })).toStrictEqual(species(150));
+    expect(decodeNotification({ pokemon: 150, type: 'both', form: '  ' })).toStrictEqual(
+      species(150),
+    );
+  });
+
+  it('reads a form as the key it holds, in lower case, and the shadow flag', () => {
+    expect(decodeNotification({ pokemon: 487, type: 'raid', form: 'giratina_origin' })).toEqual(
+      pokemonTarget(487, 'giratina_origin'),
+    );
+    expect(
+      decodeNotification({ pokemon: 487, type: 'raid', form: ' Giratina_Origin ', shadow: false }),
+    ).toStrictEqual(pokemonTarget(487, 'giratina_origin'));
+    expect(decodeNotification({ pokemon: 645, type: 'raid', form: null, shadow: true })).toEqual(
+      pokemonTarget(645, undefined, true),
+    );
+    expect(
+      decodeNotification({ pokemon: 645, type: 'raid', form: 'landorus_therian', shadow: true }),
+    ).toEqual(pokemonTarget(645, 'landorus_therian', true));
+    // A key the game data has never had is a key all the same: the row is a want.
+    expect(decodeNotification({ pokemon: 487, type: 'both', form: 'giratina_sky' })).toEqual(
+      pokemonTarget(487, 'giratina_sky'),
+    );
+  });
+
+  it.each(['Origin Forme', 'giratina-origin', 'a:b', 'é', 'a'.repeat(65)])(
+    'does not read a row whose form %j cannot be a catalogue key',
+    (form) => {
+      expect(decodeNotification({ pokemon: 487, type: 'both', form })).toBeUndefined();
+    },
+  );
+
+  it('reads a tier or IV row by its number alone, whatever the two columns hold', () => {
+    const stray = { form: 'giratina_origin', shadow: true };
+    expect(decodeNotification({ pokemon: -5, type: 'raid', ...stray })).toStrictEqual(tier('T5'));
+    expect(decodeNotification({ pokemon: -8, type: 'spawn', ...stray })).toStrictEqual({
+      kind: 'iv',
+      iv: 'zero',
+    });
+    expect(decodeNotification({ pokemon: -6, type: 'both', form: 'not a key' })).toStrictEqual({
+      kind: 'iv',
+      iv: 'perfect',
+    });
+    expect(readNotification({ pokemon: -5, type: 'raid', ...stray })?.scope).toBe('raid');
+  });
+
+  it('writes the form and the flag for a Pokémon, and neither for a tier or an IV target', () => {
+    expect(encodeNotification(pokemonTarget(487, 'giratina_origin'), 'spawn')).toEqual({
+      pokemon: 487,
+      type: 'spawn',
+      form: 'giratina_origin',
+      shadow: false,
+    });
+    expect(encodeNotification(species(487), 'both')).toEqual({
+      pokemon: 487,
+      type: 'both',
+      ...NONE,
+    });
+    expect(encodeNotification(tier('T5', true), 'raid')).toMatchObject(NONE);
+    expect(encodeNotification({ kind: 'iv', iv: 'zero' }, 'spawn')).toMatchObject(NONE);
+    expect(() => encodeNotification(pokemonTarget(487, 'Origin Forme'), 'both')).toThrow(
+      RangeError,
+    );
+  });
+
+  it('stores a want for shadow raids as raid, whatever scope was asked for', () => {
+    for (const scope of SCOPES) {
+      expect(encodeNotification(pokemonTarget(645, undefined, true), scope)).toEqual({
+        pokemon: 645,
+        type: 'raid',
+        form: null,
+        shadow: true,
+      });
+      expect(encodeNotification(pokemonTarget(645, 'landorus_therian', true), scope)).toEqual({
+        pokemon: 645,
+        type: 'raid',
+        form: 'landorus_therian',
+        shadow: true,
+      });
+    }
+  });
+
+  it('gives a want for shadow raids the scope raid, whatever its row says', () => {
+    for (const type of ['raid', 'spawn', 'both', 'Both']) {
+      expect(readNotification({ pokemon: 645, type, form: null, shadow: true })).toEqual({
+        target: pokemonTarget(645, undefined, true),
+        scope: 'raid',
+      });
+    }
+    expect(readNotification({ pokemon: 487, type: 'spawn', form: 'giratina_origin' })).toEqual({
+      target: pokemonTarget(487, 'giratina_origin'),
+      scope: 'spawn',
+    });
+  });
+
+  it('round-trips a species, a form and the shadow raids of either, for each scope', () => {
+    const targets = [
+      species(487),
+      pokemonTarget(487, 'giratina_origin'),
+      pokemonTarget(487, undefined, true),
+      pokemonTarget(487, 'giratina_origin', true),
+    ];
+    for (const scope of SCOPES) {
+      const seen = new Set<string>();
+      for (const target of targets) {
+        const stored = encodeNotification(target, scope);
+        expect(decodeNotification(stored)).toStrictEqual(target);
+        seen.add(`${String(stored.form)}|${String(stored.shadow)}`);
+      }
+      expect(seen.size).toBe(targets.length);
+    }
+  });
+
+  it('keeps a species, its forms and the shadow raids of each apart', () => {
+    const all = [
+      species(487),
+      pokemonTarget(487, 'giratina_origin'),
+      pokemonTarget(487, 'giratina_altered'),
+      pokemonTarget(487, undefined, true),
+      pokemonTarget(487, 'giratina_origin', true),
+      species(488),
+    ];
+    for (const a of all) {
+      for (const b of all) expect(sameNotificationTarget(a, b)).toBe(a === b);
+    }
+    expect(
+      sameNotificationTarget(pokemonTarget(487, 'giratina_origin'), {
+        kind: 'pokemon',
+        dex: 487,
+        form: 'giratina_origin',
+      }),
+    ).toBe(true);
+  });
+});
```

Apply to `src/domain/pogo/wants.test.ts`:

```diff
--- a/src/domain/pogo/wants.test.ts
+++ b/src/domain/pogo/wants.test.ts
@@ -5,18 +5,28 @@ import {
   encodeNotification,
   isNotificationTier,
   notificationTiers,
+  pokemonTarget,
   readNotification,
   sameNotificationTarget,
   type NotificationTarget,
 } from './notification-target.js';
 import { CURATED_NICKNAMES } from './nicknames.js';
 import { raidTierLabel, type RaidLevel } from './raid-tier.js';
+import { PokemonSearch, mergeNicknames } from './pokemon-search.js';
 import {
+  entryWant,
+  formAsStored,
+  formReader,
   parseWantToken,
   planSetWant,
+  pokemonWantFits,
+  pokemonWantName,
+  raidsOnly,
+  readWant,
   readWantText,
   readWants,
   rowsOfWant,
+  typedEntryWant,
   wantToken,
   speciesNameOf,
   wantSpeciesFinder,
@@ -29,6 +39,12 @@ const tier = (level: RaidLevel, shadow = false): NotificationTarget => ({
   tier: { level, shadow },
 });
 const species = (dex: number): NotificationTarget => ({ kind: 'pokemon', dex });
+/** One form of a species, by the key of its entry. */
+const form = (dex: number, key: string) => pokemonTarget(dex, key);
+/** The shadow raids of a species, or of one form of it. */
+const shadowOf = (dex: number, key?: string) => pokemonTarget(dex, key, true);
+/** What a row holds in the two newer columns when it is for no form and not for shadow raids. */
+const NONE = { form: null, shadow: false };
 const PERFECT: NotificationTarget = { kind: 'iv', iv: 'perfect' };
 const ZERO: NotificationTarget = { kind: 'iv', iv: 'zero' };
 
@@ -137,6 +153,43 @@ describe('want tokens', () => {
     expect(new Set(tokens).size).toBe(tokens.length);
   });
 
+  it('names one form, and the shadow raids of a species or of a form', () => {
+    expect(wantToken(form(487, 'giratina_origin'))).toBe('pokemon:487:giratina_origin');
+    expect(wantToken(shadowOf(645))).toBe('pokemon:645::shadow');
+    expect(wantToken(shadowOf(645, 'landorus_therian'))).toBe(
+      'pokemon:645:landorus_therian:shadow',
+    );
+    expect(parseWantToken('pokemon:487:giratina_origin')).toStrictEqual(
+      form(487, 'giratina_origin'),
+    );
+    expect(parseWantToken(' pokemon:645::shadow ')).toStrictEqual(shadowOf(645));
+    expect(parseWantToken('pokemon:645:landorus_therian:shadow')).toStrictEqual(
+      shadowOf(645, 'landorus_therian'),
+    );
+    // A form called `shadow` would be a form, not the flag: the flag has a place of its own.
+    expect(parseWantToken('pokemon:150:shadow')).toStrictEqual(form(150, 'shadow'));
+  });
+
+  it('gives every entry of the game data a token that fits a choice and is read back', () => {
+    const catalogue = catalogueFixture();
+    const tokens = new Set<string>();
+    for (const entry of catalogue.all) {
+      for (const target of [
+        species(entry.dex),
+        form(entry.dex, entry.key),
+        shadowOf(entry.dex),
+        shadowOf(entry.dex, entry.key),
+      ]) {
+        const token = wantToken(target);
+        expect(token.length).toBeLessThanOrEqual(100);
+        expect(parseWantToken(token)).toStrictEqual(target);
+        tokens.add(token);
+      }
+    }
+    const dexes = new Set(catalogue.all.map((entry) => entry.dex)).size;
+    expect(tokens.size).toBe(2 * dexes + 2 * catalogue.all.length);
+  });
+
   it.each([
     '',
     'pokemon',
@@ -144,8 +197,19 @@ describe('want tokens', () => {
     'pokemon:0',
     'pokemon:-5',
     'pokemon:1.5',
-    'pokemon:150:shadow',
+    'pokemon:150:',
+    'pokemon:150::',
+    'pokemon:150::Shadow',
+    'pokemon:150::shadow:x',
+    'pokemon:150:Mewtwo_A',
+    'pokemon:150:mewtwo a',
+    'pokemon:150:mewtwo_a:raid',
+    'pokemon:150:mewtwo_a:shadow:x',
+    `pokemon:150:${'a'.repeat(65)}`,
     'pokemon:1234567',
+    'pokemon:1234567:mewtwo_a',
+    'tier:T5::shadow',
+    'iv:perfect::shadow',
     'Pokemon:150',
     'tier:T2',
     'tier:t5',
@@ -324,17 +388,81 @@ describe('readWantText', () => {
     expect(readWantText('none', finder)).toEqual({ kind: 'target', target: ZERO });
   });
 
-  it('takes the species of the Pokémon a text names outright, whatever the form', () => {
-    expect(readWantText('Mewtwo', finder)).toEqual({ kind: 'target', target: species(150) });
-    expect(readWantText('mega charizard y', finder)).toEqual({
-      kind: 'target',
-      target: species(6),
-    });
-    expect(readWantText('alolan rattata', finder)).toEqual({
-      kind: 'target',
-      target: species(19),
+  const read = (text: string, own = false) => {
+    const answer = readWantText(text, finder, { own });
+    return answer.kind === 'target' ? answer.target : answer.kind;
+  };
+
+  it('takes the name of a species as the want for every form of it', () => {
+    expect(read('Mewtwo')).toStrictEqual(species(150));
+    expect(read('charizard')).toStrictEqual(species(6));
+    expect(read('dratini')).toStrictEqual(species(147));
+    // The search knows Giratina by the form it is known by; its name is the species all the same.
+    expect(pokemon.exact('giratina')?.key).toBe('giratina_altered');
+    expect(read('giratina')).toStrictEqual(species(487));
+    expect(read('Giratina (every form)')).toStrictEqual(species(487));
+    expect(read('hoopa')).toStrictEqual(species(720));
+  });
+
+  it('takes the name of one form or mega as the want for that form', () => {
+    expect(read('mega charizard y')).toStrictEqual(form(6, 'charizard_mega_y'));
+    expect(read('alolan rattata')).toStrictEqual(form(19, 'rattata_alola'));
+    expect(read('Giratina Origin')).toStrictEqual(form(487, 'giratina_origin'));
+    expect(read('Giratina (Origin Forme)')).toStrictEqual(form(487, 'giratina_origin'));
+    expect(read('giratina altered')).toStrictEqual(form(487, 'giratina_altered'));
+    expect(read('armored mewtwo')).toStrictEqual(form(150, 'mewtwo_a'));
+    expect(read('hoopa unbound')).toStrictEqual(form(720, 'hoopa_unbound'));
+    // `(every form)` after the name of a form names nothing.
+    expect(read('Giratina Origin (every form)')).toBe('unknown');
+  });
+
+  it('takes a nickname of an entry that is called as its species as the species', () => {
+    const [nickname] = Object.entries(CURATED_NICKNAMES).flatMap(([key, names]) => {
+      const entry = catalogue.byKey(key);
+      const called =
+        entry?.kind === 'species' &&
+        catalogue.byDex(entry.dex).length > 1 &&
+        entry.name === speciesNameOf(catalogue, entry.dex);
+      return called ? names.filter((name) => pokemon.exact(name)?.key === key) : [];
     });
-    expect(readWantText('giratina', finder)).toEqual({ kind: 'target', target: species(487) });
+    expect(nickname).toBeDefined();
+    const entry = pokemon.exact(nickname ?? '');
+    expect(read(nickname ?? '')).toStrictEqual(species(entry?.dex ?? 0));
+  });
+
+  it('takes `shadow` before a name as the want for its shadow raids', () => {
+    expect(read('shadow landorus')).toStrictEqual(shadowOf(645));
+    expect(read('Shadow Dratini')).toStrictEqual(shadowOf(147));
+    expect(read('shadow giratina origin')).toStrictEqual(shadowOf(487, 'giratina_origin'));
+    expect(read('Shadow Landorus (Therian Forme)')).toStrictEqual(
+      shadowOf(645, 'landorus_therian'),
+    );
+    // With a tier it stays the shadow tier, and alone it is nothing.
+    expect(read('shadow 5')).toStrictEqual(tier('T5', true));
+    expect(read('shadow legendary')).toStrictEqual(tier('T5', true));
+    expect(read('shadow')).toBe('unknown');
+    // Nothing is guessed behind the word either.
+    expect(read('shadow landoru')).toBe('unknown');
+    expect(read('shadow a')).toBe('unknown');
+    expect(read('landorus shadow')).toBe('unknown');
+  });
+
+  it('takes a token for a form as the game data knows it, and says when it does not', () => {
+    expect(read('pokemon:487:giratina_origin')).toStrictEqual(form(487, 'giratina_origin'));
+    expect(read('pokemon:645::shadow')).toStrictEqual(shadowOf(645));
+    expect(read('pokemon:645:landorus_therian:shadow')).toStrictEqual(
+      shadowOf(645, 'landorus_therian'),
+    );
+    // An alias is stored as the key of the entry it stands for.
+    expect(catalogue.byKey('giratina')?.key).toBe('giratina_altered');
+    expect(read('pokemon:487:giratina')).toStrictEqual(form(487, 'giratina_altered'));
+    // A form the game data does not have, or has for another species.
+    expect(read('pokemon:487:giratina_sky')).toBe('gone');
+    expect(read('pokemon:6:giratina_origin')).toBe('gone');
+    expect(read('pokemon:99999::shadow')).toBe('gone');
+    // A want the member has is taken as it stands.
+    expect(read('pokemon:487:giratina_sky', true)).toStrictEqual(form(487, 'giratina_sky'));
+    expect(read('pokemon:99999::shadow', true)).toStrictEqual(shadowOf(99999));
   });
 
   it('finds a species by its name when several of its entries answer to it', () => {
@@ -388,7 +516,6 @@ describe('readWantText', () => {
     });
     expect(readWantText('T5 raids', finder, own)).toEqual({ kind: 'target', target: tier('T5') });
     // Not for a new want: the label of another list means nothing there.
-    expect(readWantText('Mewtwo (raids)', finder).kind).toBe('unknown');
     expect(readWantText('Pokémon #99999', finder).kind).toBe('unknown');
   });
 
@@ -472,7 +599,7 @@ describe('planSetWant', () => {
   it('adds a row for a target that has none', () => {
     expect(planSetWant([{ id: 1, pokemon: 151, type: 'both' }], species(150), 'raid')).toEqual({
       outcome: { kind: 'added', want: { target: species(150), scope: 'raid' } },
-      insert: { pokemon: 150, type: 'raid' },
+      insert: { pokemon: 150, type: 'raid', ...NONE },
       update: undefined,
       remove: [],
     });
@@ -493,7 +620,7 @@ describe('planSetWant', () => {
     expect(planSetWant([{ id: 7, pokemon: 150, type: 'Raid' }], species(150), 'both')).toEqual({
       outcome: { kind: 'changed', want: { target: species(150), scope: 'both' }, before: 'raid' },
       insert: undefined,
-      update: { id: 7, values: { pokemon: 150, type: 'both' } },
+      update: { id: 7, values: { pokemon: 150, type: 'both', ...NONE } },
       remove: [],
     });
   });
@@ -524,7 +651,7 @@ describe('planSetWant', () => {
     expect(planSetWant(rows, species(150), 'both')).toEqual({
       outcome: { kind: 'unchanged', want: { target: species(150), scope: 'both' } },
       insert: undefined,
-      update: { id: 4, values: { pokemon: 150, type: 'both' } },
+      update: { id: 4, values: { pokemon: 150, type: 'both', ...NONE } },
       remove: [9],
     });
     expect(planSetWant(rows, species(150), 'raid')).toEqual({
@@ -570,3 +697,534 @@ describe('rowsOfWant', () => {
     expect(rowsOfWant(rows, ZERO)).toEqual([]);
   });
 });
+
+describe('entryWant, typedEntryWant', () => {
+  const catalogue = catalogueFixture();
+  const entry = (key: string) => {
+    const found = catalogue.byKey(key);
+    if (!found) throw new Error(`no ${key} in the fixture`);
+    return found;
+  };
+
+  it('gives an entry picked from a list its own form, unless it is all there is of its species', () => {
+    expect(entryWant(catalogue, entry('giratina_origin'))).toStrictEqual(
+      form(487, 'giratina_origin'),
+    );
+    expect(entryWant(catalogue, entry('charizard'))).toStrictEqual(form(6, 'charizard'));
+    expect(entryWant(catalogue, entry('charizard_mega_y'))).toStrictEqual(
+      form(6, 'charizard_mega_y'),
+    );
+    expect(entryWant(catalogue, entry('dratini'))).toStrictEqual(species(147));
+  });
+
+  it('gives an entry named in text its form, unless it is called as its species is', () => {
+    expect(typedEntryWant(catalogue, entry('rattata_alola'), 'alolan rattata')).toStrictEqual(
+      form(19, 'rattata_alola'),
+    );
+    // Not the species' own entry: a nickname of it is the form too.
+    expect(typedEntryWant(catalogue, entry('rattata_alola'), 'purple rat')).toStrictEqual(
+      form(19, 'rattata_alola'),
+    );
+    expect(typedEntryWant(catalogue, entry('charizard'), 'charizard')).toStrictEqual(species(6));
+    expect(typedEntryWant(catalogue, entry('charizard'), 'zard')).toStrictEqual(species(6));
+    expect(typedEntryWant(catalogue, entry('dratini'), 'dratini')).toStrictEqual(species(147));
+  });
+
+  it('takes the species entry that is a named form for that form only by its own name or key', () => {
+    const altered = entry('giratina_altered');
+    for (const text of [
+      'Giratina (Altered Forme)',
+      'giratina altered',
+      'altered giratina',
+      'giratina_altered',
+      'altered',
+      'Altered Forme',
+    ]) {
+      expect(typedEntryWant(catalogue, altered, text), text).toStrictEqual(
+        form(487, 'giratina_altered'),
+      );
+    }
+    // Anything else that led to it is a nickname of the species.
+    for (const text of ['tina', 'giratina', 'forme', 'ghost dragon', 'giratina tina']) {
+      expect(typedEntryWant(catalogue, altered, text), text).toStrictEqual(species(487));
+    }
+    expect(typedEntryWant(catalogue, entry('hoopa_confined'), 'hoopa confined')).toStrictEqual(
+      form(720, 'hoopa_confined'),
+    );
+    expect(typedEntryWant(catalogue, entry('hoopa_confined'), 'hoops')).toStrictEqual(species(720));
+  });
+});
+
+describe('readWantText with a nickname of a species known by a named form', () => {
+  const catalogue = catalogueFixture();
+  // Moderators' nicknames, as `PokemonRepository.nicknames()` gives them.
+  const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, {
+    giratina_altered: ['tina'],
+    landorus_incarnate: ['lando'],
+  });
+  const search = new PokemonSearch(catalogue, nicknames);
+  const finder = wantSpeciesFinder(catalogue, search);
+  const read = (text: string) => {
+    const answer = readWantText(text, finder);
+    return answer.kind === 'target' ? answer.target : answer.kind;
+  };
+
+  it('reads the nickname as the species, plain and after shadow', () => {
+    expect(search.exact('tina')?.key).toBe('giratina_altered');
+    expect(read('tina')).toStrictEqual(species(487));
+    expect(read('Tina raids')).toStrictEqual(species(487));
+    expect(read('shadow tina')).toStrictEqual(shadowOf(487));
+    expect(read('lando')).toStrictEqual(species(645));
+    expect(read('shadow lando')).toStrictEqual(shadowOf(645));
+  });
+
+  it('still reads the name of the default form as that form', () => {
+    expect(read('giratina altered')).toStrictEqual(form(487, 'giratina_altered'));
+    expect(read('shadow landorus incarnate')).toStrictEqual(shadowOf(645, 'landorus_incarnate'));
+  });
+});
+
+describe('readWantText: filler words, the base form, and what follows shadow', () => {
+  const catalogue = catalogueFixture();
+  const finder = wantSpeciesFinder(catalogue, pokemonFixture({ catalogue }));
+  const read = (text: string, own = false) => {
+    const answer = readWantText(text, finder, { own });
+    return answer.kind === 'target' ? answer.target : answer;
+  };
+
+  it('reads a Pokémon whatever of raids, eggs or spawns follows its name', () => {
+    expect(read('lugia raids')).toStrictEqual(species(249));
+    expect(read('Lugia raid')).toStrictEqual(species(249));
+    expect(read('shadow lugia raids')).toStrictEqual(shadowOf(249));
+    expect(read('dratini spawns')).toStrictEqual(species(147));
+    expect(read('giratina origin raid eggs')).toStrictEqual(form(487, 'giratina_origin'));
+    expect(read('t5 raids')).toStrictEqual(tier('T5'));
+    // The word alone, or with nothing it could follow, names nothing.
+    expect(read('raids')).toMatchObject({ kind: 'unknown' });
+    expect(read('lugi raids')).toMatchObject({ kind: 'unknown', suggestions: [249] });
+  });
+
+  it('reads the base form of a species by those words', () => {
+    expect(read('charizard base form')).toStrictEqual(form(6, 'charizard'));
+    expect(read('Charizard (base form)')).toStrictEqual(form(6, 'charizard'));
+    expect(read('shadow rattata base form')).toStrictEqual(shadowOf(19, 'rattata'));
+    expect(read('Charizard (base form) · raids', true)).toStrictEqual(form(6, 'charizard'));
+    // A species whose own entry is a named form, or that is one entry, has no such form.
+    expect(read('giratina base form')).toMatchObject({ kind: 'unknown' });
+    expect(read('dratini base form')).toMatchObject({ kind: 'unknown' });
+  });
+
+  it('reads a label of the member’s own list with the scope after a dot or in brackets', () => {
+    expect(read('Mewtwo (every form) · raids and spawns', true)).toStrictEqual(species(150));
+    expect(read('Mewtwo (every form) (raids)', true)).toStrictEqual(species(150));
+    expect(read('Giratina (Origin Forme) · spawns', true)).toStrictEqual(
+      form(487, 'giratina_origin'),
+    );
+    // A scope typed for a new want is read past as well: it says nothing of the type.
+    for (const text of [
+      'Mewtwo · raids',
+      'Mewtwo · raids and spawns',
+      'Mewtwo (every form) · raids',
+      'Mewtwo (raids)',
+      'mewtwo (Raids and Spawns)',
+    ]) {
+      expect(read(text), text).toStrictEqual(species(150));
+    }
+    expect(read('Giratina (Origin Forme) · spawns')).toStrictEqual(form(487, 'giratina_origin'));
+  });
+
+  it('suggests the shadow raids of what a misspelt name after shadow may be', () => {
+    expect(read('shadow mewtw')).toEqual({
+      kind: 'unknown',
+      words: [],
+      suggestions: [150],
+      shadow: true,
+    });
+    // Nothing near the rest: what the whole text is near, as ever.
+    const nothing = read('shadow qqqqzzzz');
+    expect(nothing).toEqual({ kind: 'unknown', words: [], suggestions: [] });
+    expect(read('mewtw')).toMatchObject({ kind: 'unknown', suggestions: [150] });
+    expect(read('mewtw')).not.toHaveProperty('shadow');
+  });
+
+  it('takes a token for the one entry of a species as the species', () => {
+    expect(read('pokemon:147:dratini')).toStrictEqual(species(147));
+    expect(read('pokemon:147:dratini:shadow')).toStrictEqual(shadowOf(147));
+    expect(read('pokemon:6:charizard')).toStrictEqual(form(6, 'charizard'));
+    // A want the member has is taken as it stands.
+    expect(read('pokemon:147:dratini', true)).toStrictEqual(form(147, 'dratini'));
+  });
+});
+
+describe('readWantText: a name that ends in a filler word', () => {
+  const catalogue = catalogueFixture();
+  const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, { togepi: ['bad egg'] });
+  const finder = wantSpeciesFinder(catalogue, new PokemonSearch(catalogue, nicknames));
+  const read = (text: string) => {
+    const answer = readWantText(text, finder);
+    return answer.kind === 'target' ? answer.target : answer.kind;
+  };
+
+  it('reads the whole text as a name before it takes the word off', () => {
+    expect(read('bad egg')).toStrictEqual(species(175));
+    expect(read('bad egg raids')).toStrictEqual(species(175));
+    expect(read('shadow bad egg')).toStrictEqual(shadowOf(175));
+    expect(read('bad')).toBe('unknown');
+  });
+});
+
+describe('a want named by an older key of its entry', () => {
+  const catalogue = catalogueFixture();
+  const reader = formReader(() => catalogue);
+  const older = form(487, 'giratina');
+  const altered = form(487, 'giratina_altered');
+  const rows = [{ id: 1, pokemon: 487, type: 'raid', form: 'giratina' }];
+
+  it('finds the rows of the entry, whichever key they hold', () => {
+    expect(rowsOfWant(rows, older, reader)).toEqual([1]);
+    expect(
+      rowsOfWant([{ id: 2, pokemon: 487, type: 'raid', form: 'giratina_altered' }], older, reader),
+    ).toEqual([2]);
+  });
+
+  it('is set as the want of the entry: no second row, and the key of today', () => {
+    expect(planSetWant(rows, older, 'spawn', reader)).toEqual({
+      outcome: { kind: 'changed', want: { target: altered, scope: 'spawn' }, before: 'raid' },
+      insert: undefined,
+      update: {
+        id: 1,
+        values: { pokemon: 487, type: 'spawn', form: 'giratina_altered', shadow: false },
+      },
+      remove: [],
+    });
+    expect(planSetWant([], older, 'raid', reader).insert).toEqual({
+      pokemon: 487,
+      type: 'raid',
+      form: 'giratina_altered',
+      shadow: false,
+    });
+  });
+});
+
+describe('forms as the game data reads them', () => {
+  const catalogue = catalogueFixture();
+  const reader = formReader(() => catalogue);
+
+  it('reads a stored key as the key of the entry it stands for, and says what is a mega', () => {
+    expect(reader(487, 'giratina_origin')).toEqual({ key: 'giratina_origin', mega: false });
+    // An alias: the bare id of a species known by its default form.
+    expect(reader(487, 'giratina')).toEqual({ key: 'giratina_altered', mega: false });
+    expect(reader(6, 'charizard_mega_y')).toEqual({ key: 'charizard_mega_y', mega: true });
+    // What the game data does not have, or has for another species, is read as it stands.
+    expect(reader(487, 'giratina_sky')).toEqual({ key: 'giratina_sky', mega: false });
+    expect(reader(487, 'charizard_mega_y')).toEqual({ key: 'charizard_mega_y', mega: false });
+    expect(formAsStored(487, 'giratina')).toEqual({ key: 'giratina', mega: false });
+  });
+
+  it('says what can only be about raids: a tier, shadow raids and a mega', () => {
+    expect(raidsOnly(tier('T5'), reader)).toBe(true);
+    expect(raidsOnly(shadowOf(645), reader)).toBe(true);
+    expect(raidsOnly(form(6, 'charizard_mega_y'), reader)).toBe(true);
+    expect(raidsOnly(form(6, 'charizard'), reader)).toBe(false);
+    expect(raidsOnly(species(6), reader)).toBe(false);
+    expect(raidsOnly(PERFECT, reader)).toBe(false);
+  });
+
+  it('reads a row for a mega as raids whatever its type says', () => {
+    for (const type of ['both', 'spawn', 'raid', 'Both']) {
+      expect(readWant({ pokemon: 6, type, form: 'charizard_mega_y' }, reader)).toEqual({
+        target: form(6, 'charizard_mega_y'),
+        scope: 'raid',
+      });
+    }
+    expect(readWant({ pokemon: 6, type: 'both', form: 'charizard' }, reader)?.scope).toBe('both');
+    expect(readWant({ pokemon: -5, type: 'spawn' }, reader)).toBeUndefined();
+  });
+
+  it('reads two rows whose forms are two keys of one entry as one want', () => {
+    const rows = [
+      { id: 1, pokemon: 487, type: 'raid', form: 'giratina', shadow: false },
+      { id: 2, pokemon: 487, type: 'spawn', form: 'giratina_altered', shadow: false },
+      { id: 3, pokemon: 487, type: 'raid', form: null, shadow: false },
+    ];
+    expect(readWants(rows, reader).wants).toEqual([
+      { target: form(487, 'giratina_altered'), scope: 'both' },
+      { target: species(487), scope: 'raid' },
+    ]);
+    expect(rowsOfWant(rows, form(487, 'giratina_altered'), reader)).toEqual([1, 2]);
+    // Without the game data they are two.
+    expect(readWants(rows).wants).toHaveLength(3);
+  });
+
+  it('writes the key of today when a want is set whose row holds an older key', () => {
+    const altered = form(487, 'giratina_altered');
+    const values = { pokemon: 487, type: 'raid', form: 'giratina_altered', shadow: false };
+    // The same scope: unchanged for the member, and the row gets its key all the same.
+    expect(
+      planSetWant(
+        [{ id: 1, pokemon: 487, type: 'raid', form: 'giratina' }],
+        altered,
+        'raid',
+        reader,
+      ),
+    ).toEqual({
+      outcome: { kind: 'unchanged', want: { target: altered, scope: 'raid' } },
+      insert: undefined,
+      update: { id: 1, values },
+      remove: [],
+    });
+    // Both keys: the oldest row stays, under the key of today.
+    const rows = [
+      { id: 1, pokemon: 487, type: 'raid', form: 'giratina' },
+      { id: 2, pokemon: 487, type: 'raid', form: 'giratina_altered' },
+    ];
+    expect(planSetWant(rows, altered, 'raid', reader)).toMatchObject({
+      outcome: { kind: 'unchanged' },
+      update: { id: 1, values },
+      remove: [2],
+    });
+    // A row that holds the key already, in other letters, is left alone.
+    expect(
+      planSetWant(
+        [{ id: 1, pokemon: 487, type: 'Raid', form: 'Giratina_Altered' }],
+        altered,
+        'raid',
+        reader,
+      ).update,
+    ).toBeUndefined();
+  });
+
+  it('stores a mega as raid whatever is asked, and leaves a row that says otherwise', () => {
+    const megaY = form(6, 'charizard_mega_y');
+    for (const scope of ['both', 'spawn', 'raid'] as const) {
+      expect(planSetWant([], megaY, scope, reader)).toEqual({
+        outcome: { kind: 'added', want: { target: megaY, scope: 'raid' } },
+        insert: { pokemon: 6, type: 'raid', form: 'charizard_mega_y', shadow: false },
+        update: undefined,
+        remove: [],
+      });
+    }
+    // An older row typed `both` means raids already: nothing to write.
+    const rows = [{ id: 3, pokemon: 6, type: 'both', form: 'charizard_mega_y' }];
+    expect(planSetWant(rows, megaY, 'spawn', reader)).toEqual({
+      outcome: { kind: 'unchanged', want: { target: megaY, scope: 'raid' } },
+      insert: undefined,
+      update: undefined,
+      remove: [],
+    });
+  });
+});
+
+describe('pokemonWantName', () => {
+  const catalogue = catalogueFixture();
+  const name = (target: ReturnType<typeof pokemonTarget>) => pokemonWantName(catalogue, target);
+  const listed = (target: ReturnType<typeof pokemonTarget>) =>
+    pokemonWantName(catalogue, target, { everyForm: true });
+
+  it('calls a species by its name, and in a list says when that is every form', () => {
+    expect(name(pokemonTarget(487))).toBe('Giratina');
+    expect(listed(pokemonTarget(487))).toBe('Giratina (every form)');
+    expect(listed(pokemonTarget(6))).toBe('Charizard (every form)');
+    // All there is of Dratini is Dratini.
+    expect(listed(pokemonTarget(147))).toBe('Dratini');
+    expect(listed(pokemonTarget(99999))).toBe('Pokémon #99999');
+  });
+
+  it('calls a form by the name of its entry', () => {
+    expect(name(form(487, 'giratina_origin'))).toBe('Giratina (Origin Forme)');
+    expect(listed(form(487, 'giratina_origin'))).toBe('Giratina (Origin Forme)');
+    expect(listed(form(6, 'charizard_mega_y'))).toBe('Mega Charizard Y');
+    expect(listed(form(19, 'rattata_alola'))).toBe('Alolan Rattata');
+    // The entry that is called as its species is: never to be taken for the species.
+    expect(listed(form(6, 'charizard'))).toBe('Charizard (base form)');
+    expect(name(form(6, 'charizard'))).toBe('Charizard (base form)');
+    expect(listed(form(19, 'rattata'))).toBe('Rattata (base form)');
+    expect(listed(shadowOf(19, 'rattata'))).toBe('Shadow Rattata (base form)');
+    // The species entry that is a named form keeps its name; an alias is named as its entry.
+    expect(listed(form(487, 'giratina_altered'))).toBe('Giratina (Altered Forme)');
+    expect(listed(form(487, 'giratina'))).toBe('Giratina (Altered Forme)');
+    // All there is of a species is no base form of anything.
+    expect(listed(form(147, 'dratini'))).toBe('Dratini');
+  });
+
+  it('calls a form the game data does not have by its species and the key', () => {
+    expect(listed(form(487, 'giratina_sky'))).toBe('Giratina (giratina_sky)');
+    // A key of another species is no form of this one.
+    expect(listed(form(487, 'charizard_mega_y'))).toBe('Giratina (charizard_mega_y)');
+    expect(listed(form(99999, 'missingno_glitch'))).toBe('Pokémon #99999 (missingno_glitch)');
+  });
+
+  it('puts Shadow before the shadow raids of a species or a form', () => {
+    expect(name(shadowOf(645))).toBe('Shadow Landorus');
+    expect(listed(shadowOf(645))).toBe('Shadow Landorus');
+    expect(listed(shadowOf(645, 'landorus_therian'))).toBe('Shadow Landorus (Therian Forme)');
+    expect(listed(shadowOf(147))).toBe('Shadow Dratini');
+  });
+});
+
+describe('pokemonWantFits', () => {
+  const catalogue = catalogueFixture();
+  const entry = (key: string) => catalogue.byKey(key);
+
+  it('fits a want for a species to every entry with its Pokédex number', () => {
+    for (const key of ['giratina_altered', 'giratina_origin']) {
+      expect(pokemonWantFits(catalogue, pokemonTarget(487), entry(key), false)).toBe(true);
+      expect(pokemonWantFits(catalogue, pokemonTarget(487), entry(key), true)).toBe(true);
+    }
+    expect(pokemonWantFits(catalogue, pokemonTarget(6), entry('charizard_mega_y'), false)).toBe(
+      true,
+    );
+    expect(pokemonWantFits(catalogue, pokemonTarget(487), entry('charizard'), false)).toBe(false);
+  });
+
+  it('fits a want for a form only to the entry with that key', () => {
+    const origin = form(487, 'giratina_origin');
+    expect(pokemonWantFits(catalogue, origin, entry('giratina_origin'), false)).toBe(true);
+    expect(pokemonWantFits(catalogue, origin, entry('giratina_origin'), true)).toBe(true);
+    expect(pokemonWantFits(catalogue, origin, entry('giratina_altered'), false)).toBe(false);
+    expect(pokemonWantFits(catalogue, form(6, 'charizard'), entry('charizard_mega_x'), false)).toBe(
+      false,
+    );
+    // A stored key that is an alias today fits the entry it stands for, and no other.
+    expect(
+      pokemonWantFits(catalogue, form(487, 'giratina'), entry('giratina_altered'), false),
+    ).toBe(true);
+    expect(pokemonWantFits(catalogue, form(487, 'giratina'), entry('giratina_origin'), false)).toBe(
+      false,
+    );
+    // A key of another species is no form of this one.
+    expect(pokemonWantFits(catalogue, form(6, 'giratina_origin'), entry('charizard'), false)).toBe(
+      false,
+    );
+    // A form the game data has lost fits nothing.
+    expect(
+      pokemonWantFits(catalogue, form(487, 'giratina_sky'), entry('giratina_origin'), false),
+    ).toBe(false);
+  });
+
+  it('fits a want for shadow raids only to a shadow raid', () => {
+    expect(pokemonWantFits(catalogue, shadowOf(645), entry('landorus_incarnate'), true)).toBe(true);
+    expect(pokemonWantFits(catalogue, shadowOf(645), entry('landorus_therian'), true)).toBe(true);
+    expect(pokemonWantFits(catalogue, shadowOf(645), entry('landorus_incarnate'), false)).toBe(
+      false,
+    );
+    expect(
+      pokemonWantFits(
+        catalogue,
+        shadowOf(645, 'landorus_therian'),
+        entry('landorus_therian'),
+        true,
+      ),
+    ).toBe(true);
+    expect(
+      pokemonWantFits(
+        catalogue,
+        shadowOf(645, 'landorus_therian'),
+        entry('landorus_incarnate'),
+        true,
+      ),
+    ).toBe(false);
+  });
+
+  it('fits no want to a boss the game data does not know', () => {
+    expect(pokemonWantFits(catalogue, pokemonTarget(487), undefined, false)).toBe(false);
+    expect(pokemonWantFits(catalogue, shadowOf(487), undefined, true)).toBe(false);
+  });
+});
+
+describe('wants for one form and for shadow raids, as rows', () => {
+  const origin = form(487, 'giratina_origin');
+
+  it('reads a species, one form of it and its shadow raids as wants side by side', () => {
+    const rows = [
+      { pokemon: 487, type: 'both', form: null, shadow: false },
+      { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
+      { pokemon: 487, type: 'both', form: null, shadow: true },
+      { pokemon: 487, type: 'spawn', form: 'giratina_sky', shadow: false },
+      { pokemon: 487, type: 'raid', form: 'Origin Forme', shadow: false },
+    ];
+    expect(readWants(rows)).toEqual({
+      wants: [
+        { target: species(487), scope: 'both' },
+        { target: origin, scope: 'raid' },
+        { target: shadowOf(487), scope: 'raid' },
+        // A form the game data may not have: a want all the same.
+        { target: form(487, 'giratina_sky'), scope: 'spawn' },
+      ],
+      unreadable: 1,
+    });
+  });
+
+  it('reads several rows as one want only when species, form and flag are the same', () => {
+    const rows = [
+      { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
+      { pokemon: 487, type: 'spawn', form: 'GIRATINA_ORIGIN', shadow: false },
+      { pokemon: 487, type: 'spawn', form: null, shadow: false },
+      { pokemon: 487, type: 'spawn', form: 'giratina_origin', shadow: true },
+    ];
+    expect(readWants(rows).wants).toEqual([
+      { target: origin, scope: 'both' },
+      { target: species(487), scope: 'spawn' },
+      { target: shadowOf(487, 'giratina_origin'), scope: 'raid' },
+    ]);
+  });
+
+  it('adds a row for a form beside the row of its species, with the form in it', () => {
+    const rows = [{ id: 1, pokemon: 487, type: 'both', ...NONE }];
+    expect(planSetWant(rows, origin, 'raid')).toEqual({
+      outcome: { kind: 'added', want: { target: origin, scope: 'raid' } },
+      insert: { pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
+      update: undefined,
+      remove: [],
+    });
+    expect(planSetWant(rows, shadowOf(487), 'both')).toEqual({
+      outcome: { kind: 'added', want: { target: shadowOf(487), scope: 'raid' } },
+      insert: { pokemon: 487, type: 'raid', form: null, shadow: true },
+      update: undefined,
+      remove: [],
+    });
+  });
+
+  it('changes and tidies only the rows of the very target that is set', () => {
+    const rows = [
+      { id: 1, pokemon: 487, type: 'both', ...NONE },
+      { id: 2, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
+      { id: 3, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
+      { id: 4, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: true },
+    ];
+    expect(planSetWant(rows, origin, 'spawn')).toEqual({
+      outcome: { kind: 'changed', want: { target: origin, scope: 'spawn' }, before: 'raid' },
+      insert: undefined,
+      update: {
+        id: 2,
+        values: { pokemon: 487, type: 'spawn', form: 'giratina_origin', shadow: false },
+      },
+      remove: [3],
+    });
+    // Shadow raids are raids whatever is asked: nothing to change.
+    expect(planSetWant(rows, shadowOf(487, 'giratina_origin'), 'spawn')).toEqual({
+      outcome: {
+        kind: 'unchanged',
+        want: { target: shadowOf(487, 'giratina_origin'), scope: 'raid' },
+      },
+      insert: undefined,
+      update: undefined,
+      remove: [],
+    });
+  });
+
+  it('finds the rows of one target and no others of its species', () => {
+    const rows = [
+      { id: 1, pokemon: 487, type: 'both', ...NONE },
+      { id: 2, pokemon: 487, type: 'raid', form: 'giratina_origin', shadow: false },
+      { id: 3, pokemon: 487, type: 'raid', form: null, shadow: true },
+      { id: 4, pokemon: 487, type: 'raid', form: 'giratina_sky', shadow: false },
+      { id: 5, pokemon: 487, type: 'spawn', form: ' Giratina_Origin', shadow: false },
+    ];
+    expect(rowsOfWant(rows, species(487))).toEqual([1]);
+    expect(rowsOfWant(rows, origin)).toEqual([2, 5]);
+    expect(rowsOfWant(rows, shadowOf(487))).toEqual([3]);
+    expect(rowsOfWant(rows, form(487, 'giratina_sky'))).toEqual([4]);
+    expect(rowsOfWant(rows, shadowOf(487, 'giratina_origin'))).toEqual([]);
+  });
+});
```

Apply to `test/support/wants.test.ts`:

```diff
--- a/test/support/wants.test.ts
+++ b/test/support/wants.test.ts
@@ -1,5 +1,8 @@
 import { describe, expect, it } from 'vitest';
-import type { NotificationTarget } from '../../src/domain/pogo/notification-target.js';
+import {
+  pokemonTarget,
+  type NotificationTarget,
+} from '../../src/domain/pogo/notification-target.js';
 import { MemoryWants } from './wants.js';
 
 const ALICE = '312345678901234567';
@@ -53,6 +56,40 @@ describe('MemoryWants', () => {
     expect(wants.rows).toHaveLength(1);
   });
 
+  it('keeps a species, one form of it and its shadow raids as wants of their own', async () => {
+    const wants = new MemoryWants();
+    const origin = pokemonTarget(487, 'giratina_origin');
+    const shadow = pokemonTarget(487, undefined, true);
+    wants.add(ALICE, HOME, 487, 'spawn', { form: 'Giratina_Origin' });
+    wants.add(ALICE, HOME, 487, 'both', { form: 'Origin Forme' });
+    expect(await wants.set(ALICE, HOME, species(487), 'both')).toMatchObject({ kind: 'added' });
+    expect(await wants.set(ALICE, HOME, origin, 'raid')).toMatchObject({
+      kind: 'changed',
+      before: 'spawn',
+    });
+    expect(await wants.set(ALICE, HOME, shadow, 'both')).toEqual({
+      kind: 'added',
+      want: { target: shadow, scope: 'raid' },
+    });
+    expect(await wants.list(ALICE, HOME)).toEqual({
+      wants: [
+        { target: origin, scope: 'raid' },
+        { target: species(487), scope: 'both' },
+        { target: shadow, scope: 'raid' },
+      ],
+      unreadable: 1,
+    });
+    expect(wants.rows.map((row) => [row.pokemon, row.type, row.form, row.shadow])).toEqual([
+      [487, 'raid', 'giratina_origin', false],
+      [487, 'both', 'Origin Forme', false],
+      [487, 'both', null, false],
+      [487, 'raid', null, true],
+    ]);
+    expect(await wants.remove(ALICE, HOME, species(487))).toBe(true);
+    expect(await wants.remove(ALICE, HOME, shadow)).toBe(true);
+    expect(await wants.count(ALICE, HOME)).toBe(2);
+  });
+
   it('rejects every call while it is failing', async () => {
     const wants = new MemoryWants();
     wants.failing = new Error('the database is away');
```

Apply to `test/support/wants.ts`:

```diff
--- a/test/support/wants.ts
+++ b/test/support/wants.ts
@@ -1,3 +1,5 @@
+import type { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
+import { catalogueFixture } from './game-data.js';
 import type { WantStorage } from '../../src/db/repositories/pokemon-notification-repository.js';
 import type {
   NotificationScope,
@@ -7,11 +9,19 @@ import {
   planSetWant,
   readWants,
   rowsOfWant,
+  formReader,
+  type FormReader,
   type SetWantOutcome,
   type WantList,
   type WantRow,
 } from '../../src/domain/pogo/wants.js';
 
+/** The reader of forms over the game-data fixture, which is read once, at the first form. */
+export function fixtureForms(): FormReader {
+  let catalogue: PokemonCatalogue | undefined;
+  return formReader(() => (catalogue ??= catalogueFixture()));
+}
+
 interface Row extends WantRow {
   memberId: string;
   guildId: string;
@@ -20,14 +30,18 @@ interface Row extends WantRow {
 /**
  * The wants kept in memory as `PokemonNotificationRepository` keeps them, whose behaviour
  * pokemon-notification-repository.db.test.ts pins down: rows per member and server, read and
- * changed through the same functions of `wants.ts`. `add` puts a row as the legacy bot may have
- * left it. Set `failing` to make every call reject.
+ * changed through the same functions of `wants.ts`. `add` puts a row as it may stand in the
+ * table: one the legacy bot left, or one with a form or for shadow raids. Set `failing` to make
+ * every call reject.
  */
 export class MemoryWants implements WantStorage {
   failing: Error | undefined;
   readonly rows: Row[] = [];
   private nextId = 1;
 
+  /** `forms` is what the game data makes of a stored form: by default that of the fixture. */
+  constructor(private readonly forms: FormReader = fixtureForms()) {}
+
   private attempt<T>(work: () => T): Promise<T> {
     return new Promise((resolve, reject) => {
       // Like a real query, the answer never comes in the same turn of the event loop.
@@ -49,20 +63,30 @@ export class MemoryWants implements WantStorage {
     }
   }
 
-  /** A row as it may stand in the table, for a test: any number, any type. */
-  add(memberId: string, guildId: string, pokemon: number, type: string): number {
+  /**
+   * A row as it may stand in the table, for a test: any number, any type, and with `more` any
+   * form and the shadow flag (a row has no form and is not for shadow raids otherwise).
+   */
+  add(
+    memberId: string,
+    guildId: string,
+    pokemon: number,
+    type: string,
+    more: { form?: string | null; shadow?: boolean } = {},
+  ): number {
     const id = this.nextId++;
-    this.rows.push({ id, memberId, guildId, pokemon, type });
+    const { form = null, shadow = false } = more;
+    this.rows.push({ id, memberId, guildId, pokemon, type, form, shadow });
     return id;
   }
 
   list(memberId: string, guildId: string): Promise<WantList> {
-    return this.attempt(() => readWants(this.of(memberId, guildId)));
+    return this.attempt(() => readWants(this.of(memberId, guildId), this.forms));
   }
 
   count(memberId: string, guildId: string): Promise<number> {
     return this.attempt(() => {
-      const { wants, unreadable } = readWants(this.of(memberId, guildId));
+      const { wants, unreadable } = readWants(this.of(memberId, guildId), this.forms);
       return wants.length + unreadable;
     });
   }
@@ -74,8 +98,11 @@ export class MemoryWants implements WantStorage {
     scope: NotificationScope,
   ): Promise<SetWantOutcome> {
     return this.attempt(() => {
-      const plan = planSetWant(this.of(memberId, guildId), target, scope);
-      if (plan.insert) this.add(memberId, guildId, plan.insert.pokemon, plan.insert.type);
+      const plan = planSetWant(this.of(memberId, guildId), target, scope, this.forms);
+      if (plan.insert) {
+        const { pokemon, type, form, shadow } = plan.insert;
+        this.add(memberId, guildId, pokemon, type, { form, shadow });
+      }
       if (plan.update) {
         const { id, values } = plan.update;
         const row = this.rows.find((found) => found.id === id);
@@ -88,7 +115,7 @@ export class MemoryWants implements WantStorage {
 
   remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean> {
     return this.attempt(() => {
-      const ids = rowsOfWant(this.of(memberId, guildId), target);
+      const ids = rowsOfWant(this.of(memberId, guildId), target, this.forms);
       this.drop(ids);
       return ids.length > 0;
     });
```

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/settings/settings.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/wants.test.ts test/support/wants.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -26,6 +26,7 @@ import { DiscordMemberDirectory } from './discord/member-directory.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
+import { formReader } from './domain/pogo/wants.js';
 import { createLogger, type Logger } from './log.js';
 import { AccessService } from './services/access-service.js';
 import { AttendanceService } from './services/attendance-service.js';
@@ -235,7 +236,10 @@ export async function startApp(
     trains,
     clickAnswers,
     users,
-    wants: new PokemonNotificationRepository(db),
+    wants: new PokemonNotificationRepository(
+      db,
+      formReader(() => gameData.catalogue),
+    ),
     targets: new GymNotificationRepository(db),
     members,
     pokemon,
```

Apply to `src/commands/notifications/want-input.ts`:

```diff
--- a/src/commands/notifications/want-input.ts
+++ b/src/commands/notifications/want-input.ts
@@ -2,15 +2,21 @@ import type { AppContext } from '../../app-context.js';
 import { UserError } from '../../discord/errors.js';
 import {
   notificationTiers,
+  pokemonTarget,
   sameNotificationTarget,
   type NotificationScope,
   type NotificationTarget,
   type Want,
 } from '../../domain/pogo/notification-target.js';
 import {
+  entryWant,
+  formReader,
+  hasForms,
   ivWantLabel,
+  parseWantToken,
+  pokemonWantName,
+  raidsOnly,
   readWantText,
-  speciesNameOf,
   tierWantLabel,
   wantSpeciesFinder,
   wantToken,
@@ -36,15 +42,28 @@ export const SCOPE_WORDS: Readonly<Record<NotificationScope, string>> = {
 };
 
 /**
- * What a target is called in a list and in a sentence: the species (`Giratina`: a want is for
- * every form), `T5 raids`, `Perfect IV spawns`. A species the game data does not have (any
- * more) is called by its number. The name comes from the game data, so it is not made plain
- * here; `plain()` it where it stands in a message.
+ * What a target is called in a list: `T5 raids`, `Perfect IV spawns`; a species by its name,
+ * with `(every form)` when it has several, so that it cannot be taken for one of the forms that
+ * may stand beside it (`Giratina (every form)`, `Dratini`); one form by the name of its entry
+ * (`Giratina (Origin Forme)`, `Mega Charizard Y`); shadow raids as `Shadow Landorus`. What the
+ * game data does not have (any more) is called by its number or its key (`pokemonWantName`).
+ * The name comes from the game data, so it is not made plain here; `plain()` it where it
+ * stands in a message.
  */
 export function wantLabel(ctx: AppContext, target: NotificationTarget): string {
   if (target.kind === 'tier') return tierWantLabel(target.tier);
   if (target.kind === 'iv') return ivWantLabel(target.iv);
-  return speciesNameOf(ctx.gameData.catalogue, target.dex) ?? `Pokémon #${String(target.dex)}`;
+  return pokemonWantName(ctx.gameData.catalogue, target, { everyForm: true });
+}
+
+/**
+ * What a target is called in a sentence about a raid or a spawn of it: as in a list, but a
+ * species by its bare name (`a Giratina raid`).
+ */
+export function wantName(ctx: AppContext, target: NotificationTarget): string {
+  return target.kind === 'pokemon'
+    ? pokemonWantName(ctx.gameData.catalogue, target)
+    : wantLabel(ctx, target);
 }
 
 /** The tiers and the IV targets, in the order a list offers them. */
@@ -62,13 +81,27 @@ function fits(name: string, words: readonly string[]): boolean {
   return words.every((word) => lower.includes(word));
 }
 
+/** `shadow` before a name, in what is being typed: the rest of it. */
+const SHADOW_OF = /^shadow\s+(\S.*)$/i;
+
 /**
  * The choices for the `target` option of `/want`. With nothing typed: the tiers, then the IV
- * targets. With text: the tier or IV target it names or begins first, then the current raid
- * bosses that fit it (as species, each once), then the tiers and IV targets whose label fits,
- * then any Pokémon the search finds, each species once. A choice's value is the target's token.
+ * targets. With text:
+ *
+ * 1. what the text would be read as if it were sent as it stands (`readWantText`), and the
+ *    tier or IV target it names or begins: they must not fall off the end behind the Pokémon;
+ * 2. the current raid bosses that fit it: a shadow boss as the shadow raids of its species
+ *    (`Shadow Landorus`), a boss that is one of several forms as that form, each with its
+ *    species after it; a boss that is all there is of its species once, plainly;
+ * 3. the tiers and IV targets whose label fits;
+ * 4. after `shadow`, the shadow raids of the species the rest of the text finds;
+ * 5. any Pokémon the search finds: a species that has several entries as `X (every form)`,
+ *    followed by its entries that were found, each by its name; any other species once.
+ *
+ * Nothing twice, 25 at most. A choice's value is the target's token.
  */
 export function wantChoices(ctx: AppContext, typed: string): Choice[] {
+  const { catalogue } = ctx.gameData;
   const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
   const targets: NotificationTarget[] = [];
   const add = (target: NotificationTarget): void => {
@@ -77,19 +110,35 @@ export function wantChoices(ctx: AppContext, typed: string): Choice[] {
   if (words.length === 0) {
     fixedTargets().forEach(add);
   } else {
-    // First of all the tier or IV target the text names, or may be the beginning of: it must
-    // not fall off the end of the list behind the Pokémon.
+    const read = readWantText(typed, wantSpeciesFinder(catalogue, ctx.pokemon));
+    if (read.kind === 'target') add(read.target);
     wantWordGuesses(typed).forEach(add);
     for (const boss of ctx.raidBosses.bosses()) {
       // A boss the game master does not know has no Pokédex number: its tier can be wanted.
       if (!boss.entry) continue;
-      const target: NotificationTarget = { kind: 'pokemon', dex: boss.entry.dex };
-      if (fits(boss.name, words) || fits(wantLabel(ctx, target), words)) add(target);
+      const species = pokemonTarget(boss.entry.dex);
+      const offered = boss.tier.shadow
+        ? [pokemonTarget(boss.entry.dex, undefined, true), species]
+        : hasForms(catalogue, boss.entry.dex)
+          ? [entryWant(catalogue, boss.entry), species]
+          : [species];
+      // By the boss's name all of it is offered; otherwise what the text itself fits (`shadow`
+      // finds the shadow raids of every shadow boss, not their species besides).
+      const named = fits(boss.name, words);
+      for (const target of offered) if (named || fits(wantLabel(ctx, target), words)) add(target);
     }
     for (const target of fixedTargets()) if (fits(wantLabel(ctx, target), words)) add(target);
+    const rest = SHADOW_OF.exec(typed.trim())?.[1];
+    if (rest !== undefined) {
+      for (const entry of ctx.pokemon.search(rest, { limit: MAX_CHOICES })) {
+        if (targets.length >= MAX_CHOICES) break;
+        add(pokemonTarget(entry.dex, undefined, true));
+      }
+    }
     for (const entry of ctx.pokemon.search(typed, { limit: MAX_CHOICES * 4 })) {
       if (targets.length >= MAX_CHOICES) break;
-      add({ kind: 'pokemon', dex: entry.dex });
+      add(pokemonTarget(entry.dex));
+      add(entryWant(catalogue, entry));
     }
   }
   return targets.slice(0, MAX_CHOICES).map((target) => ({
@@ -98,10 +147,55 @@ export function wantChoices(ctx: AppContext, typed: string): Choice[] {
   }));
 }
 
-/** A want as a list names it with its scope: `Mewtwo (raids and spawns)`, `T5 raids`. */
+/**
+ * Whether a target has a scope to speak of: a Pokémon that can be met in raids and in the wild.
+ * A tier, an IV target, the shadow raids of a Pokémon and a mega have the one scope only.
+ */
+export function hasScope(ctx: AppContext, target: NotificationTarget): boolean {
+  return (
+    target.kind === 'pokemon' &&
+    !raidsOnly(
+      target,
+      formReader(() => ctx.gameData.catalogue),
+    )
+  );
+}
+
+/**
+ * A want as a list names it with its scope: `Dratini · raids and spawns`, `Giratina (Origin
+ * Forme) · raids`. Where there is only one scope (`hasScope`) none is said: `T5 raids`, `Shadow
+ * Landorus`, `Mega Charizard Y`.
+ */
 export function wantWithScope(ctx: AppContext, want: Want): string {
   const label = wantLabel(ctx, want.target);
-  return want.target.kind === 'pokemon' ? `${label} (${SCOPE_WORDS[want.scope]})` : label;
+  return hasScope(ctx, want.target) ? `${label} · ${SCOPE_WORDS[want.scope]}` : label;
+}
+
+/** A text as it is compared with a label: letter case and the width of gaps do not count. */
+const folded = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');
+
+/**
+ * The want of the member's own list that a typed text is a name of, in full: its label, with
+ * or without the scope (after ` · ` or in brackets), or its name in a sentence. Undefined when
+ * the text is no such name or the name of several, and for a token: `typedWant` reads those.
+ */
+export function ownWantNamed(
+  ctx: AppContext,
+  wants: readonly Want[],
+  typed: string,
+): NotificationTarget | undefined {
+  if (parseWantToken(typed)) return undefined;
+  const text = folded(typed);
+  const named = wants.filter((want) =>
+    [
+      wantWithScope(ctx, want),
+      `${wantLabel(ctx, want.target)} (${SCOPE_WORDS[want.scope]})`,
+      wantLabel(ctx, want.target),
+      wantName(ctx, want.target),
+    ].some((name) => folded(name) === text),
+  );
+  const [only] = named;
+  return only && named.length === 1 ? only.target : undefined;
 }
 
 /**
@@ -151,10 +245,14 @@ export function typedWant(ctx: AppContext, value: string, own = false): Notifica
     throw new UserError('I do not know that Pokémon any more. Pick again from the list.');
   }
   const shown = plain(truncate(value.trim(), 80));
+  // A suggested Pokémon is a species, by its bare name: the list shows its forms. After
+  // `shadow` it is the shadow raids of that species (`Shadow Mewtwo`).
   const names = [
     ...read.words,
-    ...read.suggestions.map((dex): NotificationTarget => ({ kind: 'pokemon', dex })),
-  ].map((target) => plain(wantLabel(ctx, target)));
+    ...read.suggestions.map((dex): NotificationTarget =>
+      pokemonTarget(dex, undefined, read.shadow === true),
+    ),
+  ].map((target) => plain(wantName(ctx, target)));
   throw new UserError(
     `I do not know a Pokémon, raid tier or IV target called "${shown}". ` +
       (names.length === 0 ? '' : `Did you mean ${orList(names)}? `) +
```

Apply to `src/commands/notifications/wants.ts`:

```diff
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -12,10 +12,24 @@ import {
   type Want,
 } from '../../domain/pogo/notification-target.js';
 import { raidTierLabel, sameRaidTier } from '../../domain/pogo/raid-tier.js';
-import type { SetWantOutcome, WantList } from '../../domain/pogo/wants.js';
+import {
+  hasForms,
+  parseWantToken,
+  type SetWantOutcome,
+  type WantList,
+} from '../../domain/pogo/wants.js';
 import { count, fitItems, LIMITS, plain } from '../../render/text.js';
 import { removeAllQuestion } from './remove-all.js';
-import { ownWantChoices, SCOPE_WORDS, typedWant, wantChoices, wantLabel } from './want-input.js';
+import {
+  hasScope,
+  ownWantChoices,
+  ownWantNamed,
+  SCOPE_WORDS,
+  typedWant,
+  wantChoices,
+  wantLabel,
+  wantName,
+} from './want-input.js';
 
 /** Whether this installation notifies members at all (`settings.features.notifications`). */
 export const notificationsEnabled = (config: Config): boolean =>
@@ -53,20 +67,38 @@ function promise(ctx: AppContext, want: Want): string {
     const ivs = target.iv === 'perfect' ? 'perfect' : 'zero';
     return `You will get a DM when a wild Pokémon with ${ivs} IVs is reported ${where}.`;
   }
-  const name = plain(wantLabel(ctx, target));
+  const name = plain(wantName(ctx, target));
   const what = {
     both: `${withArticle(name)} raid or a wild ${name} is`,
     raid: `${withArticle(name)} raid is`,
     spawn: `a wild ${name} is`,
   }[scope];
-  return `You will get a DM when ${what} reported ${where}. Every form of ${name} counts.`;
+  // The species as it is called without `Shadow`: what "every form" is said of. A species
+  // that is one entry has no forms to speak of.
+  const species = plain(wantName(ctx, { kind: 'pokemon', dex: target.dex }));
+  let forms = ' Only that form counts.';
+  if (target.form === undefined) {
+    forms = hasForms(ctx.gameData.catalogue, target.dex) ? ` Every form of ${species} counts.` : '';
+  }
+  return `You will get a DM when ${what} reported ${where}.${forms}`;
 }
 
 /** What is added when the member picked a type that the target cannot have. */
-function corrected(target: NotificationTarget, asked: NotificationScope | null): string {
+function corrected(
+  ctx: AppContext,
+  target: NotificationTarget,
+  asked: NotificationScope | null,
+): string {
   if (target.kind === 'tier' && asked !== null && asked !== 'raid') {
     return ' A raid tier is about raids only, so that is what I stored.';
   }
+  if (target.kind === 'pokemon' && asked !== null && asked !== 'raid') {
+    if (target.shadow) return ' Shadow raids are raids, so that is what I stored.';
+    // What is left without a scope of its own is a mega.
+    if (!hasScope(ctx, target)) {
+      return ' Mega Pokémon are met in raids only, so that is what I stored.';
+    }
+  }
   if (target.kind === 'iv' && asked !== null && asked !== 'spawn') {
     return ' An IV target is about spawns only, so that is what I stored.';
   }
@@ -80,9 +112,9 @@ function wantAnswer(
 ): string {
   const { want } = outcome;
   const name = plain(wantLabel(ctx, want.target));
-  const note = corrected(want.target, asked);
+  const note = corrected(ctx, want.target, asked);
   if (outcome.kind === 'unchanged') {
-    const scope = want.target.kind === 'pokemon' ? `, for ${SCOPE_WORDS[want.scope]}` : '';
+    const scope = hasScope(ctx, want.target) ? `, for ${SCOPE_WORDS[want.scope]}` : '';
     return `${name} is on your list already${scope}.${note} \`/unwant\` takes it off.`;
   }
   const before =
@@ -116,13 +148,23 @@ export const want: SimpleCommand = {
     category: 'notifications',
     details:
       'Puts a Pokémon, a raid tier or an IV target on your list for this server: you get a ' +
-      'direct message when one is reported in a region you can see. A Pokémon is wanted as a ' +
-      'species, so every form of it counts (a mega, a regional form, a shadow raid). `type` ' +
-      'says whether you want its raids, its spawns or both; a raid tier is always about raids, ' +
-      'eggs included, and perfect or zero IVs always about spawns. Wanting something again ' +
-      'changes its type. Pick from the list that appears while you type, or type a name or a ' +
-      'tier such as `t5`, `mega`, `shadow 5`, `elite`, `perfect` or `zero`.',
-    examples: ['/want target:Mewtwo', '/want target:Larvitar type:Spawns', '/want target:t5'],
+      'direct message when one is reported in a region you can see. A Pokémon named by its ' +
+      'species is wanted in every form (a mega, a regional form, forms the game adds later), ' +
+      'in ordinary and shadow raids alike. To want one form only, pick it from the list or ' +
+      'type its name (`Giratina Origin`, `Mega Charizard Y`, `Alolan Rattata`); `shadow` ' +
+      'before a name is for its shadow raids only (`shadow Landorus`). You can have several ' +
+      'of these side by side. `type` says whether you want raids, spawns or both; a raid ' +
+      'tier, shadow raids and a mega are always about raids (a tier with its eggs), and ' +
+      'perfect or zero IVs always about spawns. Wanting something again changes its type. ' +
+      'Pick from the list that appears while you type, or type a name or a tier such as ' +
+      '`t5`, `mega`, `shadow 5`, `elite`, `perfect` or `zero`.',
+    examples: [
+      '/want target:Mewtwo',
+      '/want target:Larvitar type:Spawns',
+      '/want target:Giratina Origin type:Raids',
+      '/want target:shadow Landorus',
+      '/want target:t5',
+    ],
   },
   enabled: notificationsEnabled,
   guards: [requireGuild],
@@ -165,7 +207,8 @@ export const unwant: SimpleCommand = {
     details:
       'Takes a Pokémon, a raid tier or an IV target off your list for this server. The list ' +
       'that appears while you type shows what is on it; you can also type the name or the ' +
-      'tier as for `/want`.',
+      'tier as for `/want`. A species, one of its forms and its shadow raids are separate ' +
+      'entries: each is taken off by itself.',
     examples: ['/unwant target:Mewtwo', '/unwant target:t5'],
   },
   enabled: notificationsEnabled,
@@ -174,8 +217,15 @@ export const unwant: SimpleCommand = {
   throttle: NOTIFICATION_THROTTLE,
 
   async execute(interaction, ctx) {
-    const target = typedWant(ctx, interaction.options.getString('target', true), true);
-    const removed = await ctx.wants.remove(interaction.user.id, guildOf(interaction), target);
+    const typed = interaction.options.getString('target', true);
+    const guildId = guildOf(interaction);
+    // A name of the member's own list first, typed in full: `Charizard` may be the one form of
+    // that name there, which typed text otherwise reads as the species.
+    const own = parseWantToken(typed)
+      ? undefined
+      : ownWantNamed(ctx, (await ctx.wants.list(interaction.user.id, guildId)).wants, typed);
+    const target = own ?? typedWant(ctx, typed, true);
+    const removed = await ctx.wants.remove(interaction.user.id, guildId, target);
     const name = plain(wantLabel(ctx, target));
     await interaction.editReply({
       content: removed
@@ -197,8 +247,9 @@ export const unwant: SimpleCommand = {
 const byName = (a: string, b: string): number => a.localeCompare(b, 'en');
 
 /**
- * The member's list as an embed: the Pokémon by what they are wanted for, then the raid tiers
- * and the IV targets. A group that does not fit its field is cut with a count, so the embed
+ * The member's list as an embed: the Pokémon by what they are wanted for (a species, one form
+ * of it, and among "Raids" its shadow raids as `Shadow X`), then the raid tiers and the IV
+ * targets. A group that does not fit its field is cut with a count, so the embed
  * stays within Discord's limits whatever the number of rows; the description says how many rows
  * this version cannot read.
  */
```

Create `src/db/migrations/2026_10_12_005_pokemon_notification_form.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A want for one form of a Pokémon, and a want for its shadow raids only (plan 4A).
 *
 * `PokemonNotification.form` holds the catalogue key of the one form that is wanted
 * (`giratina_origin`); NULL, as in every row from before, means every form of the species.
 * `PokemonNotification.shadow` = 1 means shadow raids only; 0, the default, means ordinary and
 * shadow raids alike. Existing rows keep their meaning and nothing is converted. Both columns
 * are read and written only through the codec of `src/domain/pogo/notification-target.ts`.
 *
 * The legacy bot names its columns when it reads and writes this table, so it does not see
 * the two: until cutover it treats a row that has them set as a want for the whole species.
 *
 * Safe to run again after a failure half-way: a column is added only when it is missing.
 */
export const pokemonNotificationForm: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const missing = async (column: string): Promise<boolean> => {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'PokemonNotification'
          and column_name = ${column}`.execute(db);
      return Number(existing.rows[0]?.n ?? 0) === 0;
    };
    if (await missing('form')) {
      await sql`alter table PokemonNotification add column form
        varchar(100) character set utf8mb4 collate utf8mb4_0900_ai_ci default null`.execute(db);
    }
    if (await missing('shadow')) {
      await sql`alter table PokemonNotification add column shadow
        tinyint(1) not null default 0`.execute(db);
    }
  },
  async down() {
    // Additive only: the columns stay.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -4,6 +4,7 @@ import { raidBosses } from './2026_10_10_001_raid_bosses.js';
 import { parties } from './2026_10_11_002_parties.js';
 import { raidBossImage } from './2026_10_11_003_raid_boss_image.js';
 import { partyAccessGrants } from './2026_10_11_004_party_access_grants.js';
+import { pokemonNotificationForm } from './2026_10_12_005_pokemon_notification_form.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -15,4 +16,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_11_002_parties': parties,
   '2026_10_11_003_raid_boss_image': raidBossImage,
   '2026_10_11_004_party_access_grants': partyAccessGrants,
+  '2026_10_12_005_pokemon_notification_form': pokemonNotificationForm,
 };
```

Apply to `src/db/repositories/pokemon-notification-repository.ts`:

```diff
--- a/src/db/repositories/pokemon-notification-repository.ts
+++ b/src/db/repositories/pokemon-notification-repository.ts
@@ -1,5 +1,6 @@
 import type { Kysely } from 'kysely';
 import type {
+  EncodedNotification,
   NotificationScope,
   NotificationTarget,
 } from '../../domain/pogo/notification-target.js';
@@ -7,6 +8,7 @@ import {
   planSetWant,
   readWants,
   rowsOfWant,
+  type FormReader,
   type SetWantOutcome,
   type WantList,
   type WantRow,
@@ -48,15 +50,23 @@ export interface WantStorage {
 
 /**
  * The legacy table `PokemonNotification`: `userId` and `guildId` are row ids of `User` and
- * `Guild`, `pokemon` and `type` are read and written only through the codec of
- * `notification-target.ts` (here through `wants.ts`, which is built on it). The table has no
- * unique key, and the legacy bot kept one row per member and number across all servers, moving
- * it to the server a want was last typed in; here a want belongs to a member and a server.
- * Several rows for one target can exist in legacy data: they are read as one want, and the next
- * `set` of that target leaves one row.
+ * `Guild`; `pokemon` and `type`, and the columns `form` and `shadow` this bot added, are read
+ * and written only through the codec of `notification-target.ts` (here through `wants.ts`,
+ * which is built on it). The table has no unique key, and the legacy bot kept one row per
+ * member and number across all servers, moving it to the server a want was last typed in; here
+ * a want belongs to a member and a server, and is one per target: a species, one form of it
+ * and the shadow raids of either are wants of their own. Several rows for one target can exist
+ * in legacy data: they are read as one want, and the next `set` of that target leaves one row.
+ *
+ * `forms` says what the game data makes of a stored form (`formReader`): the key of the entry
+ * it stands for today, so that two keys of one entry are one want, and whether it is a mega,
+ * whose want is about raids whatever its row says.
  */
 export class PokemonNotificationRepository implements WantStorage {
-  constructor(private readonly db: Kysely<DB>) {}
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly forms: FormReader,
+  ) {}
 
   /**
    * The member's rows of a server. A plain read, also inside `withMemberLocked`: there it is the
@@ -66,19 +76,30 @@ export class PokemonNotificationRepository implements WantStorage {
   private async rows(db: Kysely<DB>, member: MemberInGuild): Promise<WantRow[]> {
     const rows = await db
       .selectFrom('PokemonNotification')
-      .select(['id', 'pokemon', 'type'])
+      .select(['id', 'pokemon', 'type', 'form', 'shadow'])
       .where('userId', '=', member.userId)
       .where('guildId', '=', member.guildId)
       .orderBy('id')
       .execute();
     // A row without a number means nothing: 0 is what the codec reads as unreadable.
-    return rows.map((row) => ({ id: row.id, pokemon: row.pokemon ?? 0, type: row.type }));
+    return rows.map((row) => ({
+      id: row.id,
+      pokemon: row.pokemon ?? 0,
+      type: row.type,
+      form: row.form,
+      shadow: row.shadow !== 0,
+    }));
+  }
+
+  /** The values of a row as the columns hold them. */
+  private columns(values: EncodedNotification) {
+    return { ...values, shadow: values.shadow ? 1 : 0 };
   }
 
   async list(memberId: string, guildId: string): Promise<WantList> {
     const member = await findMemberInGuild(this.db, memberId, guildId);
     if (!member) return { wants: [], unreadable: 0 };
-    return readWants(await this.rows(this.db, member));
+    return readWants(await this.rows(this.db, member), this.forms);
   }
 
   async count(memberId: string, guildId: string): Promise<number> {
@@ -94,17 +115,21 @@ export class PokemonNotificationRepository implements WantStorage {
   ): Promise<SetWantOutcome> {
     return withMemberLocked(this.db, memberId, guildId, true, async (trx, member) => {
       if (!member) throw new Error(`No rows for member ${memberId} in server ${guildId}`);
-      const plan = planSetWant(await this.rows(trx, member), target, scope);
+      const plan = planSetWant(await this.rows(trx, member), target, scope, this.forms);
       if (plan.insert) {
         await trx
           .insertInto('PokemonNotification')
-          .values({ ...plan.insert, userId: member.userId, guildId: member.guildId })
+          .values({
+            ...this.columns(plan.insert),
+            userId: member.userId,
+            guildId: member.guildId,
+          })
           .execute();
       }
       if (plan.update) {
         await trx
           .updateTable('PokemonNotification')
-          .set(plan.update.values)
+          .set(this.columns(plan.update.values))
           .where('id', '=', plan.update.id)
           .execute();
       }
@@ -118,7 +143,7 @@ export class PokemonNotificationRepository implements WantStorage {
   async remove(memberId: string, guildId: string, target: NotificationTarget): Promise<boolean> {
     return withMemberLocked(this.db, memberId, guildId, false, async (trx, member) => {
       if (!member) return false;
-      const ids = rowsOfWant(await this.rows(trx, member), target);
+      const ids = rowsOfWant(await this.rows(trx, member), target, this.forms);
       if (ids.length === 0) return false;
       await trx.deleteFrom('PokemonNotification').where('id', 'in', ids).execute();
       return true;
```

Apply to `src/db/types.ts`:

```diff
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -139,9 +139,11 @@ export interface Pokemon {
 }
 
 export interface PokemonNotification {
+  form: string | null;
   guildId: number | null;
   id: Generated<number>;
   pokemon: number | null;
+  shadow: Generated<number>;
   type: Generated<string>;
   userId: number | null;
 }
```

Apply to `src/domain/pogo/notification-target.ts`:

```diff
--- a/src/domain/pogo/notification-target.ts
+++ b/src/domain/pogo/notification-target.ts
@@ -2,13 +2,50 @@ import { raidTier, type RaidLevel, type RaidTier } from './raid-tier.js';
 
 /** What a member asked to be notified about. */
 export type NotificationTarget =
-  /** Every form of a species, in raids or as a spawn. */
-  | { kind: 'pokemon'; dex: number }
+  /** A Pokémon, in raids or as a spawn: a whole species, or one form of it. */
+  | PokemonTarget
   /** Any raid of a tier, including eggs. */
   | { kind: 'tier'; tier: RaidTier }
   /** Reports of a wild Pokémon with perfect or zero IVs. */
   | { kind: 'iv'; iv: 'perfect' | 'zero' };
 
+/**
+ * A Pokémon as a member wants it. Without `form` the want is for every form of the species,
+ * megas included, also forms the game adds later. `form` is the catalogue key of the one entry
+ * that is wanted (`giratina_origin`, `rattata_alola`, `charizard_mega_y`): what `catalogue.byKey`
+ * returned, with the `dex` of that entry. `shadow` is only ever `true`: the want is then for
+ * shadow raids alone (of the species, or of that one form), and its scope is always `raid`; a
+ * want without it is for shadow and ordinary raids alike. Both are left out when they say
+ * nothing, so that two targets for the same thing are equal: build one with `pokemonTarget`.
+ */
+export interface PokemonTarget {
+  kind: 'pokemon';
+  dex: number;
+  form?: string;
+  shadow?: true;
+}
+
+/** A Pokémon target spelled the one way: no `form` for none, no `shadow` for false. */
+export function pokemonTarget(dex: number, form?: string | null, shadow = false): PokemonTarget {
+  return {
+    kind: 'pokemon',
+    dex,
+    ...(form === undefined || form === null ? {} : { form }),
+    ...(shadow ? { shadow: true as const } : {}),
+  };
+}
+
+/**
+ * What a form's key looks like: the letters of a catalogue key. A stored form that does not is
+ * no key of any game data, old or new, and its row is not read.
+ */
+const FORM_KEY = /^[a-z0-9_]{1,64}$/;
+
+/** Whether a text can be the key of a form, as a want stores it. */
+export function isFormKey(text: string): boolean {
+  return FORM_KEY.test(text);
+}
+
 /** The values `PokemonNotification.type` may hold, in lower case. */
 export type NotificationScope = 'raid' | 'spawn' | 'both';
 
@@ -18,12 +55,21 @@ export interface StoredNotification {
   pokemon: number;
   /** The `PokemonNotification.type` column, in any letter case. */
   type: string;
+  /** The `PokemonNotification.form` column; a row from before the column existed has none. */
+  form?: string | null;
+  /** The `PokemonNotification.shadow` column. */
+  shadow?: boolean;
 }
 
-/** A row as this bot writes it: the type is always lower case. */
+/**
+ * A row as this bot writes it: the type is always lower case, and the form and the shadow flag
+ * are always said (null and false for a row that has none).
+ */
 export interface EncodedNotification {
   pokemon: number;
   type: NotificationScope;
+  form: string | null;
+  shadow: boolean;
 }
 
 /** The scope a stored type means, ignoring letter case and padding; undefined if it is none. */
@@ -60,6 +106,24 @@ export function parseNotificationScope(value: string): NotificationScope | undef
  * -33, -35), which never match in the legacy bot's raid or spawn lookups. A row holding one does
  * break the legacy `!wants` listing for that member, so a rollback must first remove the rows
  * with `pokemon < -8` and the rows with `pokemon = -7` typed `raid`.
+ *
+ * The columns `form` and `shadow` (plan 4A, task 7) narrow a row with a Pokédex number: `form`
+ * holds the catalogue key of the one form that is wanted (NULL: every form of the species),
+ * and `shadow` = 1 means shadow raids only. The legacy bot knows neither column: until cutover
+ * it treats such a row as a want for the whole species, in ordinary and shadow raids alike, so
+ * a member with a want for one form is told about the others by the legacy bot too. After a
+ * rollback the same holds for good, unless the rows with a `form` or with `shadow` = 1 are
+ * removed first. While both bots run, the legacy commands also change such rows: `!want
+ * <pokemon>` finds the member's FIRST row with that number, whatever its form or shadow flag,
+ * and changes its type and its server (so a form want or a shadow want can be retyped, or moved
+ * to another server, by a want for the species typed there); `!unwant <pokemon>` deletes every
+ * row of that number in the server, the species, its forms and its shadow raids alike. On a
+ * tier or IV row the two columns mean nothing: they are written NULL and 0, and a row that has
+ * them set all the same is read by its number alone.
+ *
+ * A want for a mega is about raids only (a mega is never met in the wild); that is known from
+ * the game data, not from the row, so it is `readWant` in `wants.ts` that reads such a row as
+ * `raid` whatever its type says.
  */
 const TIER_CODES: ReadonlyArray<readonly [number, RaidLevel, boolean]> = [
   [-1, 'T1', false],
@@ -80,7 +144,8 @@ const ZERO_CODE = -8;
 /**
  * The row values for a target. The scope is corrected where the encoding depends on it: IV
  * targets are always `spawn` and a tier is always `raid`, because a tier has no spawn meaning
- * and `(-6, both)` would read as a perfect-IV want. A species keeps the scope asked for.
+ * and `(-6, both)` would read as a perfect-IV want. A Pokémon keeps the scope asked for, unless
+ * the want is for its shadow raids: that is always `raid`, like a tier.
  */
 export function encodeNotification(
   target: NotificationTarget,
@@ -90,10 +155,21 @@ export function encodeNotification(
     if (!Number.isInteger(target.dex) || target.dex < 1) {
       throw new RangeError(`Not a Pokédex number: ${target.dex}`);
     }
-    return { pokemon: target.dex, type: scope };
+    if (target.form !== undefined && !isFormKey(target.form)) {
+      throw new RangeError(`Not the key of a form: ${target.form}`);
+    }
+    const shadow = target.shadow === true;
+    return {
+      pokemon: target.dex,
+      type: shadow ? 'raid' : scope,
+      form: target.form ?? null,
+      shadow,
+    };
   }
+  const plain = { form: null, shadow: false };
   if (target.kind === 'iv') {
-    return { pokemon: target.iv === 'perfect' ? PERFECT_CODE : ZERO_CODE, type: 'spawn' };
+    const pokemon = target.iv === 'perfect' ? PERFECT_CODE : ZERO_CODE;
+    return { pokemon, type: 'spawn', ...plain };
   }
   const code = TIER_CODES.find(
     ([, level, shadow]) => level === target.tier.level && shadow === target.tier.shadow,
@@ -103,18 +179,25 @@ export function encodeNotification(
       `No notification code for ${target.tier.shadow ? 'shadow ' : ''}${target.tier.level}`,
     );
   }
-  return { pokemon: code[0], type: 'raid' };
+  return { pokemon: code[0], type: 'raid', ...plain };
 }
 
 /**
  * The target a stored row means; undefined for a value this bot does not know (an unknown type
- * or code). Callers must skip an undefined result, never delete the row or fail on it.
+ * or code, a form that cannot be a catalogue key). Callers must skip an undefined result, never
+ * delete the row or fail on it. A form is read in lower case, as the catalogue spells its keys;
+ * whether the game data still has it is not asked here: a row whose form it has lost is a want
+ * all the same, which its member can see and remove.
  */
 export function decodeNotification(stored: StoredNotification): NotificationTarget | undefined {
   const { pokemon } = stored;
   const scope = parseNotificationScope(stored.type);
   if (!scope || !Number.isInteger(pokemon) || pokemon === 0) return undefined;
-  if (pokemon > 0) return { kind: 'pokemon', dex: pokemon };
+  if (pokemon > 0) {
+    const form = stored.form?.trim().toLowerCase() ?? '';
+    if (form !== '' && !isFormKey(form)) return undefined;
+    return pokemonTarget(pokemon, form === '' ? undefined : form, stored.shadow === true);
+  }
   if (pokemon === ZERO_CODE) return { kind: 'iv', iv: 'zero' };
   if (pokemon === PERFECT_CODE && scope !== 'raid') return { kind: 'iv', iv: 'perfect' };
   if (scope === 'spawn') return undefined;
@@ -128,8 +211,8 @@ export interface Want {
   target: NotificationTarget;
   /**
    * The scope in effect, which is not always the stored one: a tier is always `raid` and an IV
-   * target always `spawn` (a legacy `(-6, both)` row is a perfect-IV want for spawns); a species
-   * has the scope its row holds.
+   * target always `spawn` (a legacy `(-6, both)` row is a perfect-IV want for spawns); a Pokémon
+   * has the scope its row holds, unless the want is for its shadow raids, which is `raid`.
    */
   scope: NotificationScope;
 }
@@ -143,6 +226,7 @@ export function readNotification(stored: StoredNotification): Want | undefined {
   if (!target) return undefined;
   if (target.kind === 'tier') return { target, scope: 'raid' };
   if (target.kind === 'iv') return { target, scope: 'spawn' };
+  if (target.shadow) return { target, scope: 'raid' };
   // `decodeNotification` has read the type already, so it is one of the three.
   return { target, scope: parseNotificationScope(stored.type) ?? 'both' };
 }
@@ -163,9 +247,19 @@ export function isNotificationTier(tier: RaidTier): boolean {
   return TIER_CODES.some(([, level, shadow]) => level === tier.level && shadow === tier.shadow);
 }
 
-/** Whether two targets are the same thing to be notified about. */
+/**
+ * Whether two targets are the same thing to be notified about. A species, one of its forms and
+ * the shadow raids of either are different things: a member may want each beside the others.
+ */
 export function sameNotificationTarget(a: NotificationTarget, b: NotificationTarget): boolean {
-  if (a.kind === 'pokemon') return b.kind === 'pokemon' && a.dex === b.dex;
+  if (a.kind === 'pokemon') {
+    return (
+      b.kind === 'pokemon' &&
+      a.dex === b.dex &&
+      a.form === b.form &&
+      (a.shadow === true) === (b.shadow === true)
+    );
+  }
   if (a.kind === 'iv') return b.kind === 'iv' && a.iv === b.iv;
   return b.kind === 'tier' && a.tier.level === b.tier.level && a.tier.shadow === b.tier.shadow;
 }
```

Apply to `src/domain/pogo/wants.ts`:

```diff
--- a/src/domain/pogo/wants.ts
+++ b/src/domain/pogo/wants.ts
@@ -4,14 +4,17 @@ import { feedLookupOf } from './feed-lookup.js';
 import { searchTokens } from '../search/text.js';
 import {
   encodeNotification,
+  isFormKey,
   isNotificationTier,
   notificationTiers,
+  pokemonTarget,
   readNotification,
   sameNotificationTarget,
   widerScope,
   type EncodedNotification,
   type NotificationScope,
   type NotificationTarget,
+  type PokemonTarget,
   type StoredNotification,
   type Want,
 } from './notification-target.js';
@@ -25,27 +28,41 @@ import {
 
 /**
  * What a choice of a list of wants carries as its value, and what a control may carry: a text
- * that says exactly which target was picked, whatever the list called it. `pokemon:<dex>`,
+ * that says exactly which target was picked, whatever the list called it. `pokemon:<dex>` for a
+ * species, `pokemon:<dex>:<form>` for one form of it (the form's catalogue key), and
+ * `pokemon:<dex>::shadow` and `pokemon:<dex>:<form>:shadow` for the shadow raids of either;
  * `tier:<level>` and `tier:<level>:shadow` (the level as `RaidLevel` spells it), `iv:perfect`,
- * `iv:zero`.
+ * `iv:zero`. At most 100 characters, as a choice's value may be. The shadow flag has a place
+ * of its own, after the form: `pokemon:<dex>:shadow` is a form whose key is `shadow`, which no
+ * game data has (`/want` answers that it does not know that Pokémon).
  */
 export function wantToken(target: NotificationTarget): string {
-  if (target.kind === 'pokemon') return `pokemon:${String(target.dex)}`;
+  if (target.kind === 'pokemon') {
+    const species = `pokemon:${String(target.dex)}`;
+    if (target.shadow) return `${species}:${target.form ?? ''}:shadow`;
+    return target.form === undefined ? species : `${species}:${target.form}`;
+  }
   if (target.kind === 'iv') return `iv:${target.iv}`;
   return `tier:${target.tier.level}${target.tier.shadow ? ':shadow' : ''}`;
 }
 
 /**
- * The target a token names; undefined for any other text, also for a tier that cannot be wanted
- * and for a number that is no Pokédex number. Whether the species exists is not asked here.
+ * The target a token names; undefined for any other text, also for a tier that cannot be wanted,
+ * for a number that is no Pokédex number and for a form that cannot be a catalogue key. Whether
+ * the species or the form exists is not asked here.
  */
 export function parseWantToken(text: string): NotificationTarget | undefined {
-  const [kind, value, flag, ...more] = text.trim().split(':');
+  const [kind, value, flag, last, ...more] = text.trim().split(':');
   if (value === undefined || more.length > 0) return undefined;
-  if (kind === 'pokemon' && flag === undefined) {
+  if (kind === 'pokemon') {
     if (!/^[1-9]\d{0,5}$/.test(value)) return undefined;
-    return { kind: 'pokemon', dex: Number(value) };
+    if (flag === undefined) return pokemonTarget(Number(value));
+    // Three parts name a form; four name the shadow raids, of the species when the form is empty.
+    if (last !== undefined && last !== 'shadow') return undefined;
+    if (flag === '' ? last === undefined : !isFormKey(flag)) return undefined;
+    return pokemonTarget(Number(value), flag === '' ? undefined : flag, last === 'shadow');
   }
+  if (last !== undefined) return undefined;
   if (kind === 'iv' && flag === undefined) {
     return value === 'perfect' || value === 'zero' ? { kind: 'iv', iv: value } : undefined;
   }
@@ -174,14 +191,192 @@ function wordsOf(text: string): string[] {
 
 /** What `readWantText` needs to know of the Pokémon. Build one with `wantSpeciesFinder`. */
 export interface WantSpeciesFinder {
-  /** The one Pokémon a text names outright (`ctx.pokemon.exact`). */
-  exact(text: string): { dex: number } | undefined;
+  /**
+   * The want that a text means which names one Pokémon outright (`ctx.pokemon.exact`): that
+   * form of its species (`typedEntryWant`).
+   */
+  exact(text: string): PokemonTarget | undefined;
   /** The species a text is the name of, when it is the name of exactly one. */
   species(text: string): { dex: number } | undefined;
   /** Pokémon a text may mean, best first, near misses included (`ctx.pokemon.search`). */
   search(text: string, options: { limit: number }): ReadonlyArray<{ dex: number }>;
-  /** Whether the game data has a species with this Pokédex number. */
-  known(dex: number): boolean;
+  /**
+   * A target as the game data knows it: the species must exist, and a form must be an entry
+   * of that species, under its own key or an alias of it. The target is then what the list
+   * offers for that entry (`entryWant`): the key of the entry, and simply the species when the
+   * entry is all there is of it. Undefined for what the game data does not have.
+   */
+  known(target: PokemonTarget): PokemonTarget | undefined;
+  /**
+   * The want for the base form of a species alone: the entry that is called as the species is,
+   * where the species has other entries beside it (Charizard beside its megas). Undefined for
+   * a species without such an entry.
+   */
+  base(dex: number): PokemonTarget | undefined;
+}
+
+/** An entry of the catalogue as far as a want needs it. */
+interface Entry {
+  dex: number;
+  key: string;
+  name: string;
+  kind: 'species' | 'regional' | 'form' | 'mega';
+}
+
+/**
+ * What the game data says of a form that a row holds: the key of the entry the stored key
+ * stands for today (a key can become an alias: `giratina` is `giratina_altered`), and whether
+ * that entry is a mega. A key the game data does not have is read as it stands, and is no mega.
+ */
+export interface FormReading {
+  key: string;
+  mega: boolean;
+}
+
+/** Reads the stored form of a row with this Pokédex number (`FormReading`). */
+export type FormReader = (dex: number, form: string) => FormReading;
+
+/** A reader that knows no game data: every form as it is stored. For what needs none. */
+export const formAsStored: FormReader = (_dex, form) => ({ key: form, mega: false });
+
+/**
+ * The reader over the game data in use; `catalogue` is asked at every reading, because the
+ * game data is replaced while the bot runs. A key that is an entry of another species is not
+ * a form of this one, and is read as it stands.
+ */
+export function formReader(catalogue: () => PokemonCatalogue): FormReader {
+  return (dex, form) => {
+    const entry = catalogue().byKey(form);
+    return entry?.dex === dex
+      ? { key: entry.key, mega: entry.kind === 'mega' }
+      : { key: form, mega: false };
+  };
+}
+
+/**
+ * Whether a want can only be about raids: the shadow raids of a Pokémon, and a mega, which is
+ * never met in the wild. Its scope is `raid` whatever was picked or is stored, like a tier's.
+ */
+export function raidsOnly(target: NotificationTarget, reader: FormReader): boolean {
+  if (target.kind !== 'pokemon') return target.kind === 'tier';
+  return (
+    target.shadow === true || (target.form !== undefined && reader(target.dex, target.form).mega)
+  );
+}
+
+/** The base form among the entries of a species: see `WantSpeciesFinder.base`. */
+function baseEntry(catalogue: PokemonCatalogue, dex: number): Entry | undefined {
+  const species = catalogue.species(dex);
+  return species && hasForms(catalogue, dex) && species.name === speciesNameOf(catalogue, dex)
+    ? species
+    : undefined;
+}
+
+/** Whether a species has more than one entry in the game data: forms, regional forms, megas. */
+export function hasForms(catalogue: PokemonCatalogue, dex: number): boolean {
+  return catalogue.byDex(dex).length > 1;
+}
+
+/**
+ * The want an entry of the catalogue stands for where a member picks it from a list: that one
+ * form, or simply the species when the entry is all there is of it.
+ */
+export function entryWant(
+  catalogue: PokemonCatalogue,
+  entry: Pick<Entry, 'dex' | 'key'>,
+  shadow = false,
+): PokemonTarget {
+  return hasForms(catalogue, entry.dex)
+    ? pokemonTarget(entry.dex, entry.key, shadow)
+    : pokemonTarget(entry.dex, undefined, shadow);
+}
+
+/** Words of a form's name that say nothing about which form it is. */
+const FORM_FILLER = new Set(['forme', 'form', 'mode']);
+
+/**
+ * Whether a text is an entry's own name or key, or part of it: every word of the text is a word
+ * of the name or of the key, and at least one of them is not a word of the species' name
+ * (`Giratina Altered`, `giratina_altered`, `altered`; not `tina`, a nickname).
+ */
+function namesEntry(catalogue: PokemonCatalogue, entry: Entry, text: string): boolean {
+  const own = new Set([...searchTokens(entry.name), ...searchTokens(entry.key.replace(/_/g, ' '))]);
+  const species = new Set(searchTokens(speciesNameOf(catalogue, entry.dex) ?? ''));
+  const words = searchTokens(text);
+  return (
+    words.every((word) => own.has(word)) &&
+    words.some((word) => !species.has(word) && !FORM_FILLER.has(word))
+  );
+}
+
+/**
+ * The want an entry stands for where a member typed `text`, which names it outright: that one
+ * form (`Mega Charizard Y`, `Alolan Rattata`, `Giratina Origin`). The species' own entry is the
+ * exception, because a nickname of the species leads to it: a text that is not that entry's
+ * own name or key (`tina` for Giratina, whose entry is the Altered Forme) means the species,
+ * and so does any text for an entry that is called as its species is (`Charizard`, beside its
+ * megas): that entry alone is picked from the list, or typed as `Charizard base form`.
+ */
+export function typedEntryWant(
+  catalogue: PokemonCatalogue,
+  entry: Entry,
+  text: string,
+): PokemonTarget {
+  const species =
+    entry.kind === 'species' &&
+    (entry.name === speciesNameOf(catalogue, entry.dex) || !namesEntry(catalogue, entry, text));
+  return species ? pokemonTarget(entry.dex) : entryWant(catalogue, entry);
+}
+
+/**
+ * What a Pokémon target is called. A species is called by its name, with `(every form)` after
+ * it where `everyForm` is asked for and the species has several entries (in a list, where its
+ * forms may stand beside it); a form by the name of its entry (`Giratina (Origin Forme)`,
+ * `Mega Charizard Y`), and the entry that is called as its species is by `Charizard (base
+ * form)`, so that it is never taken for the species; a form the game data does not have (any
+ * more) by its species with the key (`Giratina (giratina_sky)`); a species it does not have by
+ * its number. Shadow raids have `Shadow` before the name, and no `(every form)`. The names come
+ * from the game data and are not made plain here.
+ */
+export function pokemonWantName(
+  catalogue: PokemonCatalogue,
+  target: PokemonTarget,
+  options: { everyForm?: boolean } = {},
+): string {
+  const species = speciesNameOf(catalogue, target.dex) ?? `Pokémon #${String(target.dex)}`;
+  let name: string;
+  if (target.form === undefined) {
+    const several = options.everyForm === true && !target.shadow && hasForms(catalogue, target.dex);
+    name = several ? `${species} (every form)` : species;
+  } else {
+    const entry = catalogue.byKey(target.form);
+    if (entry?.dex !== target.dex) name = `${species} (${target.form})`;
+    else if (entry.key === baseEntry(catalogue, target.dex)?.key) name = `${species} (base form)`;
+    else name = entry.name;
+  }
+  return target.shadow ? `Shadow ${name}` : name;
+}
+
+/**
+ * Whether a Pokémon want is for what was reported: a want for a species fits every entry with
+ * its Pokédex number, a want for a form only the entry its key stands for (as the catalogue
+ * resolves it: a stored key that has become an alias fits the entry it is an alias of), and a
+ * want for shadow raids only a shadow raid (`shadowRaid`; a spawn is none). A boss or a spawn
+ * without an entry of the catalogue fits no Pokémon want. The scope (raids, spawns) is the
+ * caller's to ask.
+ */
+export function pokemonWantFits(
+  catalogue: Pick<PokemonCatalogue, 'byKey'>,
+  target: PokemonTarget,
+  entry: { dex: number; key: string } | undefined,
+  shadowRaid: boolean,
+): boolean {
+  if (!entry || entry.dex !== target.dex) return false;
+  if (target.form !== undefined) {
+    const wanted = catalogue.byKey(target.form);
+    if (wanted?.dex !== target.dex || wanted.key !== entry.key) return false;
+  }
+  return target.shadow !== true || shadowRaid;
 }
 
 /**
@@ -215,21 +410,38 @@ function speciesByName(catalogue: PokemonCatalogue): Map<string, number | null>
 
 /**
  * A finder over a catalogue and the Pokémon search (`ctx.pokemon`). The search knows a text
- * only when it names one entry; a species whose name several of its entries answer to (Unown
- * and its letters) is found by its name here, because a want is for the species anyway.
+ * only when it names one entry; a species is found by its name here, also one whose name
+ * several of its entries answer to (Unown and its letters), and one that the search knows by
+ * the form it is known by (Giratina).
  */
 export function wantSpeciesFinder(
   catalogue: PokemonCatalogue,
-  pokemon: Pick<WantSpeciesFinder, 'exact' | 'search'>,
+  pokemon: {
+    exact(text: string): Entry | undefined;
+    search(text: string, options: { limit: number }): ReadonlyArray<{ dex: number }>;
+  },
 ): WantSpeciesFinder {
   return {
-    exact: (text) => pokemon.exact(text),
+    exact: (text) => {
+      const entry = pokemon.exact(text);
+      return entry && typedEntryWant(catalogue, entry, text);
+    },
     search: (text, options) => pokemon.search(text, options),
     species: (text) => {
       const dex = speciesByName(catalogue).get(searchTokens(text).join(' '));
       return dex === undefined || dex === null ? undefined : { dex };
     },
-    known: (dex) => catalogue.species(dex) !== undefined,
+    known: (target) => {
+      if (target.form === undefined) return catalogue.species(target.dex) ? target : undefined;
+      const entry = catalogue.byKey(target.form);
+      return entry?.dex === target.dex
+        ? entryWant(catalogue, entry, target.shadow === true)
+        : undefined;
+    },
+    base: (dex) => {
+      const entry = baseEntry(catalogue, dex);
+      return entry && pokemonTarget(dex, entry.key);
+    },
   };
 }
 
@@ -238,29 +450,83 @@ export const WANT_SUGGESTIONS = 5;
 
 export type TypedWant =
   | { kind: 'target'; target: NotificationTarget }
-  /** A token for a Pokémon the game data does not have (any more). */
+  /** A token for a Pokémon or a form the game data does not have (any more). */
   | { kind: 'gone' }
   /**
    * Nothing the text names outright: the tier and IV targets it may have meant (`words`) and
-   * the Pokédex numbers of the Pokémon it may have meant (`suggestions`).
+   * the Pokédex numbers of the Pokémon it may have meant (`suggestions`); with `shadow`, the
+   * text began with that word and the suggestions are for what followed it, so their shadow
+   * raids are what it may have meant.
    */
-  | { kind: 'unknown'; words: NotificationTarget[]; suggestions: number[] };
+  | { kind: 'unknown'; words: NotificationTarget[]; suggestions: number[]; shadow?: true };
 
-/** A scope in brackets at the end of a text, as a list of a member's own wants labels them. */
-const SCOPE_IN_BRACKETS = /\s*\((?:raids and spawns|raids|spawns)\)\s*$/i;
+/**
+ * A scope at the end of a text, as a list of a member's own wants labels them: after ` · `, or
+ * in brackets.
+ */
+const SCOPE_AT_END =
+  /\s*(?:\((?:raids and spawns|raids|spawns)\)|·\s*(?:raids and spawns|raids|spawns))\s*$/i;
 /** How a species the game data does not have is called in such a list: `Pokémon #1234`. */
 const NUMBERED = /^pok[eé]mon\s*#\s*([1-9]\d{0,5})$/i;
+/** What a list adds to a species that has several forms. */
+const EVERY_FORM = /\s*\(every form\)\s*$/i;
+/** How the entry that is called as its species is, is told from the species: `(base form)`. */
+const BASE_FORM = /\s*(?:\(base form\)|\bbase form)\s*$/i;
+/** `shadow` before a name: the shadow raids of what the rest names. */
+const SHADOW_OF = /^shadow\s+(\S.*)$/i;
+/** A word after a name that says nothing about which Pokémon is meant, and nothing of the scope. */
+const FILLER_AT_END = /\s+(?:raids?|eggs?|spawns?)\s*$/i;
+
+/**
+ * A typed name as it stands, then without the filler words after it, one fewer each time:
+ * `lugia raid eggs`, `lugia raid`, `lugia`. The last is the name without any of them.
+ */
+function withoutFiller(text: string): string[] {
+  const names = [text.trim()];
+  for (let name = names[0] ?? ''; FILLER_AT_END.test(name);) {
+    name = name.replace(FILLER_AT_END, '');
+    names.push(name);
+  }
+  return names;
+}
+
+/**
+ * The Pokémon a typed text names in full: a species by its name (the want is for every form),
+ * its base form alone by `<species> base form`, or the one form or mega that the text names
+ * outright; with `shadow` before any of them, its shadow raids. One letter names an Unown
+ * form: too little to act on.
+ */
+function namedPokemon(text: string, finder: WantSpeciesFinder): PokemonTarget | undefined {
+  const plainly = (typed: string): PokemonTarget | undefined => {
+    const name = typed.replace(EVERY_FORM, '');
+    if (searchTokens(name).join('').length <= 1) return undefined;
+    const species = finder.species(name);
+    if (species) return pokemonTarget(species.dex);
+    // `(every form)` after the name of a form names nothing.
+    if (name !== typed) return undefined;
+    const based = BASE_FORM.test(typed) ? finder.species(typed.replace(BASE_FORM, '')) : undefined;
+    return based ? finder.base(based.dex) : finder.exact(typed);
+  };
+  const rest = SHADOW_OF.exec(text.trim())?.[1];
+  const shadowOf = rest === undefined ? undefined : plainly(rest);
+  if (shadowOf) return pokemonTarget(shadowOf.dex, shadowOf.form, true);
+  return plainly(text.trim());
+}
 
 /**
  * What the `target` option of `/want` and `/unwant` names: a choice of the list (a token), or
- * typed text. Typed text is a tier or IV word first (`wantWord`: in full), then the one Pokémon
- * it names outright, or the species it is the name of; a want is for the species, so any form's
- * name gives its species. Anything less is `unknown`, with the targets the text may have meant:
- * the first hit of a search is never acted on.
+ * typed text. Typed text is a tier or IV word first (`wantWord`: in full; `shadow 5` is the
+ * shadow tier), then a Pokémon it names in full (`namedPokemon`): the name of a species is the
+ * want for every form of it, the name of one form or mega is the want for that form, and
+ * `shadow` before either is the want for its shadow raids. `raids`, `eggs` or `spawns` after
+ * the name say nothing, and neither does a scope as a list writes it (`lugia raids` and
+ * `Lugia · raids` are Lugia; the scope is the `type` option's). Anything less is `unknown`, with the targets the text may have meant: the first hit of a search is
+ * never acted on.
  *
- * With `own` the text is about a want the member has (`/unwant`): a species the game data does
- * not have is taken all the same (its row can be read, so it can be removed), and a label of
- * the member's own list typed back in full is read, `Pikachu (raids)` and `Pokémon #1234`.
+ * A token is taken as the game data knows it (`WantSpeciesFinder.known`): a form under the key
+ * of its entry. With `own` the text is about a want the member has (`/unwant`): a species or a
+ * form the game data does not have is taken all the same (its row can be read, so it can be
+ * removed), and so is the number a list calls it by, `Pokémon #1234`.
  */
 export function readWantText(
   value: string,
@@ -271,27 +537,40 @@ export function readWantText(
   const typed = value.trim();
   const token = parseWantToken(typed);
   if (token) {
-    return token.kind === 'pokemon' && !own && !finder.known(token.dex)
-      ? { kind: 'gone' }
-      : { kind: 'target', target: token };
+    if (token.kind !== 'pokemon' || own) return { kind: 'target', target: token };
+    const known = finder.known(token);
+    return known ? { kind: 'target', target: known } : { kind: 'gone' };
   }
-  const text = own ? typed.replace(SCOPE_IN_BRACKETS, '') : typed;
+  // A scope after the name, as the lists write it, is read past: the type is an option's.
+  const text = typed.replace(SCOPE_AT_END, '');
   const numbered = own ? NUMBERED.exec(text) : null;
-  if (numbered) return { kind: 'target', target: { kind: 'pokemon', dex: Number(numbered[1]) } };
+  if (numbered) return { kind: 'target', target: pokemonTarget(Number(numbered[1])) };
   const word = wantWord(text);
   if (word) return { kind: 'target', target: word };
-  // One letter names an Unown form: too little to act on.
-  const letters = searchTokens(text).join('');
-  const entry = letters.length > 1 ? (finder.exact(text) ?? finder.species(text)) : undefined;
-  if (entry) return { kind: 'target', target: { kind: 'pokemon', dex: entry.dex } };
-  const suggestions: number[] = [];
-  if (letters.length > 1) {
-    for (const found of finder.search(text, { limit: WANT_SUGGESTIONS * 4 })) {
-      if (!suggestions.includes(found.dex)) suggestions.push(found.dex);
-      if (suggestions.length === WANT_SUGGESTIONS) break;
-    }
+  // The text as it stands first, then with one filler word fewer each time: a name may end
+  // in such a word itself (a nickname `bad egg`, also in `bad egg raids`).
+  const names = withoutFiller(text);
+  for (const candidate of names) {
+    const named = namedPokemon(candidate, finder);
+    if (named) return { kind: 'target', target: named };
   }
-  return { kind: 'unknown', words: wantWordGuesses(text), suggestions };
+  const name = names.at(-1) ?? text;
+  const suggested = (looked: string): number[] => {
+    const dexes: number[] = [];
+    if (searchTokens(looked).join('').length <= 1) return dexes;
+    for (const found of finder.search(looked, { limit: WANT_SUGGESTIONS * 4 })) {
+      if (!dexes.includes(found.dex)) dexes.push(found.dex);
+      if (dexes.length === WANT_SUGGESTIONS) break;
+    }
+    return dexes;
+  };
+  // After `shadow`, what the rest may have meant: the search knows no Pokémon by that word.
+  const rest = SHADOW_OF.exec(name)?.[1];
+  const ofRest = rest === undefined ? [] : suggested(rest);
+  const words = wantWordGuesses(text);
+  return ofRest.length > 0
+    ? { kind: 'unknown', words, suggestions: ofRest, shadow: true }
+    : { kind: 'unknown', words, suggestions: suggested(name) };
 }
 
 /** A row of `PokemonNotification` as far as wants need it. */
@@ -307,15 +586,40 @@ export interface WantList {
   unreadable: number;
 }
 
+/**
+ * A row as the want it means with the game data at hand: as the codec reads it
+ * (`readNotification`), with a form under the key of the entry it stands for today, and with
+ * the scope `raid` for what can only be about raids (`raidsOnly`: a mega, whatever its row
+ * says). Undefined for a row that cannot be read.
+ */
+export function readWant(row: StoredNotification, reader: FormReader): Want | undefined {
+  const want = readNotification(row);
+  if (want?.target.kind !== 'pokemon' || want.target.form === undefined) return want;
+  const { dex, form, shadow } = want.target;
+  const target = pokemonTarget(dex, reader(dex, form).key, shadow === true);
+  return { target, scope: raidsOnly(target, reader) ? 'raid' : want.scope };
+}
+
+/** A target with its form under the key of the entry it stands for today (`reader`). */
+function underTodaysKey(target: NotificationTarget, reader: FormReader): NotificationTarget {
+  if (target.kind !== 'pokemon' || target.form === undefined) return target;
+  const { dex, form, shadow } = target;
+  return pokemonTarget(dex, reader(dex, form).key, shadow === true);
+}
+
 /**
  * The wants a member's rows mean. Legacy data can hold several rows for one target: they are
- * one want, in every scope any of them has (each row would notify by itself).
+ * one want, in every scope any of them has (each row would notify by itself). So are rows
+ * whose forms are two keys of one entry (`reader`; without one every form is read as stored).
  */
-export function readWants(rows: readonly StoredNotification[]): WantList {
+export function readWants(
+  rows: readonly StoredNotification[],
+  reader: FormReader = formAsStored,
+): WantList {
   const wants: Want[] = [];
   let unreadable = 0;
   for (const row of rows) {
-    const want = readNotification(row);
+    const want = readWant(row, reader);
     if (!want) {
       unreadable += 1;
       continue;
@@ -351,18 +655,25 @@ export interface SetWantPlan {
  * Decides what setting a want does, from the member's rows of the server: a target without a
  * row gets one; a target with rows keeps its oldest, which gets the scope asked for, and loses
  * the others. A row is written only when what it means changes: a legacy row that says the same
- * in other letters (`Both`, or `both` for a perfect-IV want) stays as it is.
+ * in other letters (`Both`, or `both` for a perfect-IV want, or a mega typed `both`) stays as
+ * it is. A row whose form is an older key of the entry is written with the key of today.
+ *
+ * A `target` whose form is an older key of an entry (a want the member has, named as its row
+ * holds it) is the want of that entry; a want that can only be about raids (`raidsOnly`) is
+ * stored as `raid` whatever scope is asked for.
  */
 export function planSetWant(
   rows: readonly WantRow[],
-  target: NotificationTarget,
+  asked: NotificationTarget,
   scope: NotificationScope,
+  reader: FormReader = formAsStored,
 ): SetWantPlan {
-  const values = encodeNotification(target, scope);
+  const target = underTodaysKey(asked, reader);
+  const values = encodeNotification(target, raidsOnly(target, reader) ? 'raid' : scope);
   const want: Want = { target, scope: values.type };
   const same = rows
     .filter((row) => {
-      const read = readNotification(row);
+      const read = readWant(row, reader);
       return read !== undefined && sameNotificationTarget(read.target, target);
     })
     .sort((a, b) => a.id - b.id);
@@ -370,24 +681,35 @@ export function planSetWant(
   if (!kept) {
     return { outcome: { kind: 'added', want }, insert: values, update: undefined, remove: [] };
   }
-  const [had] = readWants(same).wants;
+  const [had] = readWants(same, reader).wants;
   const before = had?.scope ?? want.scope;
-  const keptScope = readNotification(kept)?.scope;
+  const keptScope = readWant(kept, reader)?.scope;
+  // What the row itself says of the form, before the game data is asked: an older key is replaced.
+  const keptAs = readNotification(kept)?.target;
+  const sameKey = keptAs !== undefined && sameNotificationTarget(keptAs, target);
   return {
     outcome:
       before === want.scope ? { kind: 'unchanged', want } : { kind: 'changed', want, before },
     insert: undefined,
-    update: keptScope === want.scope ? undefined : { id: kept.id, values },
+    update: keptScope === want.scope && sameKey ? undefined : { id: kept.id, values },
     remove: others.map((row) => row.id),
   };
 }
 
-/** The rows that are a want for this target: what removing the want deletes. */
-export function rowsOfWant(rows: readonly WantRow[], target: NotificationTarget): number[] {
+/**
+ * The rows that are a want for this target: what removing the want deletes. A target named by
+ * an older key of its entry has the rows of that entry, whichever key they hold.
+ */
+export function rowsOfWant(
+  rows: readonly WantRow[],
+  target: NotificationTarget,
+  reader: FormReader = formAsStored,
+): number[] {
+  const wanted = underTodaysKey(target, reader);
   return rows
     .filter((row) => {
-      const read = readNotification(row);
-      return read !== undefined && sameNotificationTarget(read.target, target);
+      const read = readWant(row, reader);
+      return read !== undefined && sameNotificationTarget(read.target, wanted);
     })
     .map((row) => row.id);
 }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/notifications/wants.test.ts src/commands/settings/settings.test.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/wants.test.ts test/support/wants.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/migrator.db.test.ts`, `src/db/repositories/pokemon-notification-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/pokemon-notification-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff edd7e7d -- src test   # must print nothing
npx prettier --check src/app.ts src/commands/notifications/want-input.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/commands/settings/settings.test.ts src/db/migrations/2026_10_12_005_pokemon_notification_form.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/pokemon-notification-repository.db.test.ts src/db/repositories/pokemon-notification-repository.ts src/db/types.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts test/support/wants.test.ts test/support/wants.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app.ts src/commands/notifications/want-input.ts src/commands/notifications/wants.test.ts src/commands/notifications/wants.ts src/commands/settings/settings.test.ts src/db/migrations/2026_10_12_005_pokemon_notification_form.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/pokemon-notification-repository.db.test.ts src/db/repositories/pokemon-notification-repository.ts src/db/types.ts src/domain/pogo/notification-target.test.ts src/domain/pogo/notification-target.ts src/domain/pogo/wants.test.ts src/domain/pogo/wants.ts test/support/wants.test.ts test/support/wants.ts
git commit -m "A want for one form of a Pokémon, or for its shadow raids" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,996 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-4a HEAD -- src test` prints nothing; `npm run db:codegen -- --verify`; `npm run test:db` once, complete; `npm run build`.
2. Whole-branch review (Opus, high effort) of the seven commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `ctx.users` (`getMany`, `settingsOf`), wants (`ctx.wants`, the codec with `form` and `shadow`, `wants.ts`, tokens, "typed text never guesses", the labels), targets (`ctx.targets`, `gymInGuild`), `ctx.members`, `withMemberLocked`, the test twins (`MemoryUsers`, `MemoryWants`, `MemoryTargets`, `FakeMemberDirectory`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 4A" section (what 4B and 4C must pick up, what is left open, the rollback note for the two new columns). The spec ("as built" for 4.2 and 6.6), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. `npm run deploy-commands` comes first (eleven new commands: `/settings`, `/want`, `/unwant`, `/wants`, `/unwant-all`, `/target`, `/untarget`, `/targets`, `/untarget-all`, `/friend-code`, `/nickname`), and the local database gets the new migration when the bot starts. No DM is sent by anything here: the sentences that promise one are kept by plan 4B.

Settings:

- [ ] `/settings show` in a server and in the bot's DM (the DM needs a global registration, as `/help` did): every line names the subcommand that changes it; in a server the counts of wants and gyms are there.
- [ ] Each of `mentions`, `mentions-groups`, `mentions-shouts`, `mentions-train-stops` switched off and on again: the sentence fits, and with `mentions` off a specific one says that the master switch keeps it quiet. With the second account: `/shout` in a raid pings or does not ping accordingly.
- [ ] `/settings auto-status Coming`, then `/raid`: the reporter is Coming. `None`: not signed up. `/settings privacy Anonymous`, then `/raid`: the post names no reporter.

Wants:

- [ ] `/want` with nothing typed: the tiers, then perfect and zero IV. Typing `gira`: "Giratina (every form)" and its forms; typing the name of a current boss: the boss first; typing `shadow`: the current shadow bosses first.
- [ ] Pick a species, a form, a shadow want, a mega, a tier, perfect IV; each answer says what was stored, and a shadow want, a mega and a tier say raids whatever `type` was picked.
- [ ] Typed and sent without picking: `t5`, `hundo`, `giratina`, `giratina origin`, `shadow mewtwo` act; `zer`, `25`, `mewtw`, `shadow mewtw` are refused with suggestions.
- [ ] `/wants`: the groups, sorted, with "(every form)", "(base form)" and "Shadow X" where they belong. `/unwant` lists the member's own wants as "… · raids"; picking one removes exactly that one.
- [ ] `/unwant-all`: the question names the number; "Keep" keeps; "Remove all" removes; the second account pressing the first one's button is not possible (the question is private) and a second press says it is settled.
- [ ] With `features.notifications` off in the settings and the commands deployed again: the eight commands are gone, `/settings boss-set` says notifications are switched off.

Targets:

- [ ] `/target` in a raid's post without a gym: that raid's gym. In a train's post: its current stop. In a region channel without a gym: the sentence that asks which.
- [ ] `/target gym:` with autocomplete, with a clear typed name, and with an unclear one (the menu); the answer has the maps link. `/targets` groups by region; `/untarget` lists the member's own; `/untarget-all` asks first.

Friend codes and in-game names:

- [ ] `/friend-code register` with spaces and dashes in the code, with eleven digits (refused); `/friend-code show` for oneself, for the second account (with and without a code), for the bot; `/friend-code remove`.
- [ ] `/nickname register`, `/nickname find` in another letter case (found, named with the display name), a name nobody has, `/nickname remove`.
- [ ] To note down: how long `/friend-code show` and `/nickname find` take (each asks Discord about a member), and how the choices of `/want` read on a phone.
