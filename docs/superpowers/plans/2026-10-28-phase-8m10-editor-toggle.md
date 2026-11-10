# Phase 8M-10: The Region Editor on the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the last plan of the web polish: the region editor as an "Edit regions" toggle of the map for region staff on a desktop, in the map's look, with Fix in view, "No overlaps or gaps." and corners that regions share moved together.

- **Task 1:** the map's hint (`MemberStanding.manageGuild`, one `mayEditRegions` for `/api/me` and `regionStaffAnswer`) and the editor data route's refusals in words.
- **Task 2:** `/s/<g>/regions/edit` answers staff with 303 to `/s/<g>/map?edit=regions`; the map page names the editor's files and hosts; `editor.css` an add-on sheet.
- **Task 3:** the editor opened and closed through a mount (`window.pineRegionEditor`), its own Leaflet map in place of the live one, requests with a time limit, `RequestError` keeping the server's words.
- **Task 4:** the toggle: "Edit regions" in the account menu (from 1024 px), `EditorToggle`, `loadOnce` per file, the pollers paused (`MapActivity`, `active()`), refused while a form holds, the view handed both ways, `?edit=regions`, the narrow-screen line.
- **Task 5:** the editor in the map's Discord look, light and dark; swatches instead of color words; "No overlaps or gaps.".
- **Task 6:** Fix… and Fix all slivers… in a box beside the sliver.
- **Task 7:** a corner two or three regions share moves in all of them (`src/domain/regions/shared-corners.ts`), "Move shared corners together".
- **Task 8:** docs (`web.md`, `testing.md`) and the staging checklist `2026-10-28-phase-8m10-staging.md`; the header one row at 1024 px.

**Tech stack:** TypeScript 6.0, Node 24, Leaflet, Leaflet-Geoman (free), esbuild, Fastify and Vitest. No new dependency, no migration, no setting, no command change (no deploy needed); the CSP is unchanged.

**Spec:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Admins"), Matt's editor notes in the follow-ups (the UI pass), and the brief `.superpowers/sdd/2026-10-28-phase-8m10-editor-toggle/design.md` (git-ignored) with its builder check's rulings C1–C14 (C4, C6, C7, C12 for Matt), its review findings and `progress.md`.

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8m10` (tip `cdc1c1f9`), one commit per task, on web-polish 256a77a0. Each commit typechecks and passes its tests; on the tip the full check, the build and the database suite pass.

**Reviews:**

- **The brief:** an Opus builder check (the hint without asking Discord per load; the editor's own IIFE loaded lazily under the CSP; its own map in place rather than Geoman on the live map; shared corners with Geoman's events; forms, pollers, addresses), ruled C1–C14 by the controller while Matt slept.
- **The prototype:** an Opus review: ready after fixes (1 Important: a throw after the editor showed left the page stuck; 7 Minor); fix round 1 folded in.
- **Fix round 1:** a scoped re-review (4 Minor: focus on a refusal, a hung request keeping Back off, the map's failure line lost, a test that did not prove waiting; one tidy-up); fix round 2 folded in, read by the controller.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck (root and `src/web/client`) and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- A member who is not region staff never gets the editor's data, whatever the hint says; the data route decides fresh at every turn-on.
- Turning the editor on and off leaves the live map as it was: layers, pollers, the view, the list, forms; staged edits survive.
- A failure anywhere in opening (files, data, the editor's own start) leaves the live map usable and the toggle ready to try again.
- Dragging a shared corner is one undo step and never moves another server's outline.
- The header stays one row from 1024 px, light and dark.

---

### Task 1: 8M-10 task 1: the map's hint of the region editor, and its refusals in words

Prototype commit: `c941e6386ca7b6029ce85cd3bcf0bd26f78c342b`

/api/me answers mayEditRegions: whether the member, as the directory keeps
them, may edit the server's regions by the rule regionStaffAnswer decides
with (mayEditRegions: a bot management role or the owner, and Manage
Server, which MemberStanding now carries). A hint only: false while Discord
fails, and the editor's data route asks Discord fresh and decides.

The data route's 403 and its 503 for a server without a row answer the
page's own words, which the map says as it turns the editor off.

**Files:**

```
 src/discord/member-directory.ts |  8 +++++++-
 src/discord/web-members.test.ts | 19 ++++++++++++++-----
 src/web/editor-routes.ts        | 17 +++++++++++------
 src/web/editor.test.ts          |  6 +++++-
 src/web/guild-routes.ts         |  8 ++++++++
 src/web/login.test.ts           | 32 ++++++++++++++++++++++++++++++++
 src/web/region-staff.test.ts    | 13 ++++++++++++-
 src/web/region-staff.ts         | 29 ++++++++++++++++++++---------
 8 files changed, 109 insertions(+), 23 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/discord/web-members.test.ts src/web/editor.test.ts src/web/login.test.ts src/web/region-staff.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c941e6386ca7b6029ce85cd3bcf0bd26f78c342b -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 1: the map's hint of the region editor, and its refusals in words`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/discord/member-directory.ts b/src/discord/member-directory.ts
index 871122a847b3eb65a019868d9ad7b99fd23368ed..9f420b6299e7ecafe123dda5806fe0e6b20be017 100644
--- a/src/discord/member-directory.ts
+++ b/src/discord/member-directory.ts
@@ -36,13 +36,19 @@ export interface ServerMember {
 export interface MemberStanding {
   roleNames: readonly string[];
   administrator: boolean;
+  /**
+   * Manage Server (also as an administrator), for the map's hint of the region editor
+   * (`mayEditRegions`, plan 8M-10); not said: none.
+   */
+  manageGuild?: boolean;
 }
 
-/** The roles and the administrator permission of a member as discord.js gives them. */
+/** The roles, the administrator permission and Manage Server of a member as discord.js gives them. */
 export function memberStanding(member: GuildMember): MemberStanding {
   return {
     roleNames: member.roles.cache.map((role) => role.name),
     administrator: member.permissions.has(PermissionFlagsBits.Administrator),
+    manageGuild: member.permissions.has(PermissionFlagsBits.ManageGuild),
   };
 }
 
diff --git a/src/discord/web-members.test.ts b/src/discord/web-members.test.ts
index f26edb29efa62732ccc4baa540fe9bcfb52806a6..5ef6bcd5afa8bfe34ccbde73eaa70ef6a842bd5a 100644
--- a/src/discord/web-members.test.ts
+++ b/src/discord/web-members.test.ts
@@ -36,12 +36,13 @@ function setup(fetched: () => unknown) {
 
 /**
  * A member as Discord gives them: timed out (`isCommunicationDisabled`), not through the
- * membership screening yet (`pending`), an administrator, as `state` says; none by default.
+ * membership screening yet (`pending`), an administrator (who has every permission, as
+ * discord.js's `has` answers by default), with Manage Server, as `state` says; none by default.
  */
 const member = (
   displayName: string,
   roles: string[],
-  state: { timedOut?: boolean; pending?: boolean | null; admin?: boolean } = {},
+  state: { timedOut?: boolean; pending?: boolean | null; admin?: boolean; manage?: boolean } = {},
 ) => ({
   id: USER,
   displayName,
@@ -50,7 +51,8 @@ const member = (
   isCommunicationDisabled: () => state.timedOut ?? false,
   permissions: {
     has: (permission: bigint) =>
-      (state.admin ?? false) && permission === PermissionFlagsBits.Administrator,
+      (state.admin ?? false) ||
+      ((state.manage ?? false) && permission === PermissionFlagsBits.ManageGuild),
   },
 });
 
@@ -60,11 +62,18 @@ describe('the member who presses a button on the live map, asked of Discord', ()
     expect(await members.acting(SERVER, USER)).toEqual({
       kind: 'member',
       member: { id: USER, name: 'Alice', team: 'mystic' },
-      standing: { roleNames: ['Trainer', 'Mystic'], administrator: false },
+      standing: { roleNames: ['Trainer', 'Mystic'], administrator: false, manageGuild: false },
     });
     expect(asked).toEqual([{ user: USER, force: true }]);
   });
 
+  it('says whether they may manage the server, for the map’s hint of the editor (plan 8M-10)', async () => {
+    const { members } = setup(() => member('Alice', ['Moderator'], { manage: true }));
+    expect(await members.acting(SERVER, USER)).toMatchObject({
+      standing: { roleNames: ['Moderator'], administrator: false, manageGuild: true },
+    });
+  });
+
   it('is nobody when not in the server, or in a server the bot is not in', async () => {
     const { members } = setup(() => apiError(RESTJSONErrorCodes.UnknownMember, 404));
     expect(await members.acting(SERVER, USER)).toEqual({ kind: 'not-member' });
@@ -88,7 +97,7 @@ describe('the member who presses a button on the live map, asked of Discord', ()
     expect(await members.acting(SERVER, USER)).toEqual({
       kind: 'member',
       member: { id: USER, name: 'Alice', team: 'valor' },
-      standing: { roleNames: ['Valor'], administrator: true },
+      standing: { roleNames: ['Valor'], administrator: true, manageGuild: true },
     });
   });
 
diff --git a/src/web/editor-routes.ts b/src/web/editor-routes.ts
index 7eea71ead9b05f1e8af44cb6d225bd9d26725bbf..fe12df318405bf20be762cd57682af86bb680529 100644
--- a/src/web/editor-routes.ts
+++ b/src/web/editor-routes.ts
@@ -72,6 +72,12 @@ const UNREACHABLE =
 /** What the page and the data answer while Discord cannot say whether somebody is staff. */
 const UNCONFIRMED = 'Discord cannot be reached just now, so I cannot tell whether you are staff.';
 
+/** What the page and the data answer somebody who is not staff of the server (or no member). */
+const STAFF_ONLY = 'Only staff of this server may edit its regions.';
+
+/** What the page and the data answer while the server has no row yet. */
+const UNKNOWN_SERVER = 'I do not know this server yet. Try again in a moment.';
+
 /**
  * How long after Discord last said somebody is staff of a server they are still shown the
  * editor, read-only, while Discord cannot be asked.
@@ -186,12 +192,10 @@ export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
           );
       }
       if (viewer.kind === 'not-member' || viewer.kind === 'not-staff') {
-        return reply.code(403).send(shortPage('Only staff of this server may edit its regions.'));
+        return reply.code(403).send(shortPage(STAFF_ONLY));
       }
       if (viewer.kind === 'unknown-server') {
-        return reply
-          .code(503)
-          .send(shortPage('I do not know this server yet. Try again in a moment.'));
+        return reply.code(503).send(shortPage(UNKNOWN_SERVER));
       }
       if (viewer.kind === 'unconfirmed') return reply.code(503).send(shortPage(UNCONFIRMED));
       const { manifest } = deps.assets;
@@ -223,14 +227,15 @@ export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
     async (request: GuildRequest, reply) => {
       void reply.header('cache-control', 'private, no-cache');
       const viewer = await editorViewer(request, reply, deps, seen);
+      // A refusal in the page's words (plan 8M-10, C2): the map says them as it turns the editor off.
       switch (viewer.kind) {
         case 'logged-out':
           return sendFailure(request, reply, 401);
         case 'not-member':
         case 'not-staff':
-          return sendFailure(request, reply, 403);
+          return reply.code(403).send({ error: STAFF_ONLY });
         case 'unknown-server':
-          return sendFailure(request, reply, 503);
+          return reply.code(503).send({ error: UNKNOWN_SERVER });
         case 'unconfirmed':
           return reply.code(503).send({ error: UNCONFIRMED });
         case 'unreachable':
diff --git a/src/web/editor.test.ts b/src/web/editor.test.ts
index dab90798a9f1f71754416a9c4d81d96d4b89a1bd..4ac8b19ce157ac162cd152c1238e3e51e354645d 100644
--- a/src/web/editor.test.ts
+++ b/src/web/editor.test.ts
@@ -45,7 +45,8 @@ describe("the region editor's data", () => {
     const member = await web.loggedIn(MEMBER, 'Misty');
     const refused = await web.app.inject({ url: DATA, headers: { cookie: member } });
     expect(refused.statusCode).toBe(403);
-    expect(refused.json()).toEqual({ error: 'Not allowed.' });
+    // The page's words, which the map says as it turns the editor off (plan 8M-10, C2).
+    expect(refused.json()).toEqual({ error: 'Only staff of this server may edit its regions.' });
     staff.answer(MEMBER, { kind: 'not-staff' });
     expect((await web.app.inject({ url: DATA, headers: { cookie: member } })).statusCode).toBe(403);
     const cookie = await web.loggedIn(STAFF, 'Brock');
@@ -178,5 +179,8 @@ describe("the region editor's data", () => {
     const cookie = await web.loggedIn(STAFF, 'Brock');
     const answer = await web.app.inject({ url: DATA, headers: { cookie } });
     expect(answer.statusCode).toBe(503);
+    expect(answer.json()).toEqual({
+      error: 'I do not know this server yet. Try again in a moment.',
+    });
   });
 });
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 5b2452761bee247092eeafc177e5a234c1bcf29d..6677ddb284f272d0c33eaa8316ae679c55675269 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -13,6 +13,7 @@ import { postControlRoutes } from './post-control-routes.js';
 import { PartyViewers } from './party-viewers.js';
 import { raidRoutes } from './raid-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import { mayEditRegions } from './region-staff.js';
 import { spawnRoutes } from './spawn-routes.js';
 import { stopRoutes } from './stop-routes.js';
 import type { WebDeps } from './server.js';
@@ -83,10 +84,16 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
       let member = false;
       let missingRole: string | undefined;
       let readOnly = false;
+      let mayEdit = false;
       try {
         const found = await deps.members.find(request.params.guild, session.userId);
         member = found !== undefined && countsOnTheMap(found.standing, memberRole);
         if (found !== undefined && !member) missingRole = memberRole;
+        // Whether to offer "Edit regions" (plan 8M-10): a hint by the member as the directory
+        // keeps them, never asked of Discord for it; the editor's data asks fresh and decides.
+        mayEdit =
+          found?.standing !== undefined &&
+          mayEditRegions(found.standing, session.userId, deps.parties.ownerId);
       } catch (err) {
         deps.log.warn(
           { err, guild: request.params.guild, user: session.userId },
@@ -100,6 +107,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
         member,
         csrf: sessions.csrfToken(session),
         readOnly,
+        mayEditRegions: mayEdit,
         ...(missingRole === undefined ? {} : { missingRole }),
       };
     },
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
index be3b66869ec4f0aa36f962b0b3bbceb781d1fc00..29cfb199b810693a3e48375268464c80a0bae414 100644
--- a/src/web/login.test.ts
+++ b/src/web/login.test.ts
@@ -7,6 +7,7 @@ import {
   cookieOf,
   FakeOAuth,
   setCookies,
+  TEST_OWNER_ID,
   webServerWith,
   type TestWeb,
 } from '../../test/support/web.js';
@@ -454,6 +455,7 @@ describe('who is asking', () => {
       name: 'Ash',
       member: true,
       readOnly: false,
+      mayEditRegions: false,
       csrf: expect.any(String) as string,
     });
     const there = await web.app.inject({
@@ -487,6 +489,36 @@ describe('who is asking', () => {
     expect(await ask()).toMatchObject({ member: true });
   });
 
+  it('may edit regions, as a hint, by what the directory says of the member (plan 8M-10)', async () => {
+    const members = new FakeMemberDirectory().add(ASH, 'Ash');
+    // The map's member role does not concern staff: the hint is judged on the member as found.
+    const map = webServerWith({ members, web: { memberRole: 'Verified' } });
+    web = map;
+    const cookie = await map.loggedIn(ASH, 'Ash');
+    const ask = async () => (await map.app.inject({ url: ME, headers: { cookie } })).json<object>();
+    expect(await ask()).toMatchObject({ mayEditRegions: false });
+    members.standing(ASH, { roleNames: ['Moderator'], administrator: false, manageGuild: false });
+    expect(await ask()).toMatchObject({ mayEditRegions: false });
+    members.standing(ASH, { roleNames: ['Moderator'], administrator: false, manageGuild: true });
+    expect(await ask()).toMatchObject({ member: false, mayEditRegions: true });
+    members.standing(ASH, { roleNames: ['Trainer'], administrator: true, manageGuild: true });
+    expect(await ask()).toMatchObject({ mayEditRegions: false });
+    // The bot's owner, as `/region`'s guard admits them.
+    const owner = await map.loggedIn(TEST_OWNER_ID, 'Owner');
+    members.add(TEST_OWNER_ID, 'Owner').standing(TEST_OWNER_ID, {
+      roleNames: [],
+      administrator: false,
+      manageGuild: true,
+    });
+    const asOwner = await map.app.inject({ url: ME, headers: { cookie: owner } });
+    expect(asOwner.json()).toMatchObject({ mayEditRegions: true });
+    // Nobody in the server, and Discord away: no hint.
+    members.remove(ASH);
+    expect(await ask()).toMatchObject({ mayEditRegions: false });
+    members.failing = new Error('Discord is away');
+    expect(await ask()).toMatchObject({ readOnly: true, mayEditRegions: false });
+  });
+
   it('names no role to somebody who is not in the server', async () => {
     const members = new FakeMemberDirectory();
     const map = webServerWith({ members, web: { memberRole: 'Verified' } });
diff --git a/src/web/region-staff.test.ts b/src/web/region-staff.test.ts
index 8bda6bfe66a751a0684896dac66f10de9d6e8dbb..bc2338dc6ec59432f674d126a1e6a8ad93afd8c9 100644
--- a/src/web/region-staff.test.ts
+++ b/src/web/region-staff.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { regionStaffAnswer, type StaffFacts } from './region-staff.js';
+import { mayEditRegions, regionStaffAnswer, type StaffFacts } from './region-staff.js';
 
 const OWNER = '700000000000000099';
 const USER = '700000000000000001';
@@ -40,6 +40,17 @@ describe('staff of a server on the web pages', () => {
     expect(regionStaffAnswer(undefined, USER, OWNER, SERVER, 1)).toEqual({ kind: 'not-member' });
   });
 
+  it('may edit regions by the one rule the answer and the map’s hint share (plan 8M-10)', () => {
+    expect(mayEditRegions({ roleNames: ['Moderator'], manageGuild: true }, USER, OWNER)).toBe(true);
+    expect(mayEditRegions({ roleNames: [], manageGuild: true }, OWNER, OWNER)).toBe(true);
+    expect(mayEditRegions({ roleNames: ['Raider'], manageGuild: true }, USER, OWNER)).toBe(false);
+    expect(mayEditRegions({ roleNames: ['Moderator'], manageGuild: false }, USER, OWNER)).toBe(
+      false,
+    );
+    // What the directory does not say (an older answer) is no Manage Server.
+    expect(mayEditRegions({ roleNames: ['Moderator'] }, USER, OWNER)).toBe(false);
+  });
+
   it('wait for the server to be known', () => {
     expect(regionStaffAnswer(facts(), USER, OWNER, SERVER, undefined)).toEqual({
       kind: 'unknown-server',
diff --git a/src/web/region-staff.ts b/src/web/region-staff.ts
index 808b60e2a20f4e29d79818c081737e0e146bd284..e3ed85ea952ca58744c467b2861a4813a0048200 100644
--- a/src/web/region-staff.ts
+++ b/src/web/region-staff.ts
@@ -34,12 +34,25 @@ export interface RegionStaffSource {
 }
 
 /**
- * The decision, from what Discord says of the member. The same check as the guard of `/region`
- * (`requireBotManagement`: an admin, a moderator or a bot developer by role, or the bot's
- * owner: `isBotManagement`), and the permission Discord asks of whoever is offered `/region`
- * by default (Manage Server, its `default_member_permissions`): on the web nobody but the bot
- * checks, so it checks both. Whether they may create channels is their own Manage Channels on
- * the server, as `regionStaff` reads it for the command.
+ * Whether a member may edit a server's regions by their roles and permissions: the same check as
+ * the guard of `/region` (`requireBotManagement`: an admin, a moderator or a bot developer by
+ * role, or the bot's owner: `isBotManagement`), and the permission Discord asks of whoever is
+ * offered `/region` by default (Manage Server, its `default_member_permissions`): on the web
+ * nobody but the bot checks, so it checks both. One rule for the decision (`regionStaffAnswer`,
+ * on the member fetched fresh) and the map's hint (`/api/me`'s `mayEditRegions`, plan 8M-10, on
+ * the member as the directory keeps them); a Manage Server the facts do not say is none.
+ */
+export function mayEditRegions(
+  facts: { roleNames: readonly string[]; manageGuild?: boolean },
+  userId: string,
+  ownerId: string,
+): boolean {
+  return facts.manageGuild === true && isBotManagement(facts.roleNames, userId, ownerId);
+}
+
+/**
+ * The decision, from what Discord says of the member (`mayEditRegions`). Whether they may create
+ * channels is their own Manage Channels on the server, as `regionStaff` reads it for the command.
  */
 export function regionStaffAnswer(
   member: StaffFacts | undefined,
@@ -49,9 +62,7 @@ export function regionStaffAnswer(
   guildRow: number | undefined,
 ): StaffAnswer {
   if (!member) return { kind: 'not-member' };
-  if (!member.manageGuild || !isBotManagement(member.roleNames, userId, ownerId)) {
-    return { kind: 'not-staff' };
-  }
+  if (!mayEditRegions(member, userId, ownerId)) return { kind: 'not-staff' };
   if (guildRow === undefined) return { kind: 'unknown-server' };
   return {
     kind: 'staff',
````

### Task 2: 8M-10 task 2: the editor's address leads to the map, which names its files

Prototype commit: `7fafcfde16c64678bd91a7be3ae90ae55dd78e0c`

/s/<guild>/regions/edit keeps its staff check and its 401, 403 and 503
pages; for staff (and while Discord is away, staff seen lately) it answers
303 to /s/<guild>/map?edit=regions, built from the constants of
src/domain/web/editor-address.ts, which the page reads too.

The map page names the editor's script, style and worker in data-
attributes (loaded when the editor is first turned on) and carries its
hidden hosts: the tool row led by "Back to the map" beside the layers,
the editor's own map and its panel beside the map and the side pane. The
editor's own page is gone; editor.css no longer imports map.css (an add-on
loaded beside it). The editor page's bundle test is now a redirect test,
and the test of its units and of a missing build are left to the map's.

**Files:**

```
 scripts/web/build.ts             |  5 +++--
 src/domain/web/editor-address.ts | 13 +++++++++++++
 src/web/client/editor.css        |  1 -
 src/web/editor-page.test.ts      | 58 ++++++++++++++++++----------------------------------------
 src/web/editor-routes.ts         | 30 +++++++-----------------------
 src/web/page-theme.test.ts       | 10 ++++++++--
 src/web/page.test.ts             | 25 ++++++++++++++++++++-----
 src/web/page.ts                  | 43 +++++++++++++++++++------------------------
 8 files changed, 88 insertions(+), 97 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/editor-page.test.ts src/web/page-theme.test.ts src/web/page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7fafcfde16c64678bd91a7be3ae90ae55dd78e0c -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 2: the editor's address leads to the map, which names its files`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/scripts/web/build.ts b/scripts/web/build.ts
index e8949ec1a38e91ab127706ef1579e197af4820eb..fa76eacd2946b154f01ce77c22ef5e705038caea 100644
--- a/scripts/web/build.ts
+++ b/scripts/web/build.ts
@@ -5,8 +5,9 @@ import { build } from 'esbuild';
 /**
  * Builds the web pages (`src/web/client/`) into `dist/web/`: the map (`assets/map-<hash>.js`
  * with Leaflet, `assets/map-<hash>.css` with Leaflet's style) and the region editor (plan 8M-2:
- * `assets/editor-<hash>.js` with Leaflet and Geoman, `assets/editor-<hash>.css` with both
- * styles, and the script of its worker, `assets/editor-worker-<hash>.js`) and the page of the
+ * `assets/editor-<hash>.js` with Leaflet and Geoman, `assets/editor-<hash>.css` with Geoman's
+ * style, an add-on of the map's beside which the map loads it when the editor is first turned on
+ * (plan 8M-10), and the script of its worker, `assets/editor-worker-<hash>.js`) and the page of the
  * Wayspot export tool (plan 8W-P: `assets/userscript-<hash>.js` and `.css`), each an IIFE for
  * ES2022, minified, with Leaflet's pictures, every file named by a hash of its content so that
  * the server can let browsers keep them for good; `dist/web/assets.json` names each page's
diff --git a/src/domain/web/editor-address.ts b/src/domain/web/editor-address.ts
new file mode 100644
index 0000000000000000000000000000000000000000..55fd3b59acdf9258dca334a753b525169f355ecf
--- /dev/null
+++ b/src/domain/web/editor-address.ts
@@ -0,0 +1,13 @@
+/**
+ * Where the region editor is (plan 8M-10): on the map, turned on by `?edit=regions` in the map's
+ * address. The server leads `/s/<guild>/regions/edit` there; the page reads and keeps the query.
+ * No imports: the page's bundle takes it without the server's code.
+ */
+
+/** The query's name and value that have the editor on. */
+export const EDIT_QUERY_NAME = 'edit';
+export const EDIT_QUERY_VALUE = 'regions';
+
+/** The map's address of a server with the region editor on. */
+export const editingMapPath = (guild: string): string =>
+  `/s/${guild}/map?${EDIT_QUERY_NAME}=${EDIT_QUERY_VALUE}`;
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index b2af562237e31a4aa21a1ad770dc867258a67d67..d7bcecfd8de8a13feecd94070272aa27dced5f23 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -1,4 +1,3 @@
-@import './map.css';
 @import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
 
 #tools {
diff --git a/src/web/editor-page.test.ts b/src/web/editor-page.test.ts
index aa681650a9bdc2d55627d6cc183ca45ed65420b6..7738a4eb7f28a4e3cfc6313c77ae502442da231a 100644
--- a/src/web/editor-page.test.ts
+++ b/src/web/editor-page.test.ts
@@ -8,6 +8,8 @@ import {
 } from '../../test/support/web.js';
 
 const EDITOR = `/s/${FAKE_GUILD_ID}/regions/edit`;
+/** The map with the editor on (plan 8M-10), where the editor's address leads staff. */
+const ON_THE_MAP = `/s/${FAKE_GUILD_ID}/map?edit=regions`;
 const STAFF = '700000000000000001';
 
 /** The attributes of the page's `<body>`. */
@@ -28,59 +30,43 @@ describe('the region editor page', () => {
     web = undefined;
   });
 
-  it("loads the editor's bundle for staff, its worker named, nothing inline", async () => {
+  it('leads staff to the map with the editor on (plan 8M-10)', async () => {
     web = webServerWith({ assets: builtAssets(), staff: new FakeRegionStaff().asStaff(STAFF) });
     const cookie = await web.loggedIn(STAFF, 'Brock');
     const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
-    expect(page.statusCode).toBe(200);
-    expect(page.headers['content-type']).toMatch(/^text\/html/);
+    expect(page.statusCode).toBe(303);
+    expect(page.headers.location).toBe(ON_THE_MAP);
     expect(page.headers['cache-control']).toBe('no-cache');
-    expect(page.body).toContain('<script src="/assets/editor-QRSTUVWX.js" defer></script>');
-    expect(page.body).toContain('<link rel="stylesheet" href="/assets/editor-YZABCDEF.css">');
-    // It follows the device's light or dark (plan 8M-7).
-    expect(page.body).toContain('<meta name="color-scheme" content="light dark">');
-    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
-    expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
-    expect(bodyData(page.body)).toEqual({
-      'data-guild': FAKE_GUILD_ID,
-      'data-tiles': 'osm',
-      'data-login': 'discord',
-      'data-distance-units': 'imperial',
+    // The map there loads the editor's files when it is turned on.
+    const map = await web.app.inject({ url: ON_THE_MAP, headers: { cookie } });
+    expect(map.statusCode).toBe(200);
+    expect(bodyData(map.body)).toMatchObject({
+      'data-editor-script': '/assets/editor-QRSTUVWX.js',
+      'data-editor-style': '/assets/editor-YZABCDEF.css',
       'data-worker': '/assets/editor-worker-GHIJKLMN.js',
     });
   });
 
-  it('tells the page the units of distances the settings name (review fix 8)', async () => {
-    web = webServerWith({
-      assets: builtAssets(),
-      staff: new FakeRegionStaff().asStaff(STAFF),
-      distanceUnits: 'metric',
-    });
-    const cookie = await web.loggedIn(STAFF, 'Brock');
-    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
-    expect(bodyData(page.body)['data-distance-units']).toBe('metric');
-  });
-
-  it('is the editor while Discord cannot say who asks only for staff it saw lately', async () => {
+  it('leads there while Discord cannot say who asks only staff it saw lately', async () => {
     const OTHER = '700000000000000002';
     const staff = new FakeRegionStaff().asStaff(STAFF).asStaff(OTHER);
     const made = webServerWith({ assets: builtAssets(), staff });
     web = made;
     const cookie = await made.loggedIn(STAFF, 'Brock');
     const other = await made.loggedIn(OTHER, 'Misty');
-    expect((await made.app.inject({ url: EDITOR, headers: { cookie } })).statusCode).toBe(200);
+    expect((await made.app.inject({ url: EDITOR, headers: { cookie } })).statusCode).toBe(303);
     staff.failing = new Error('Discord is away');
     // Seen as staff a moment ago: the editor, read-only by its data.
     const page = await made.app.inject({ url: EDITOR, headers: { cookie } });
-    expect(page.statusCode).toBe(200);
-    expect(page.body).toContain('editor-QRSTUVWX.js');
+    expect(page.statusCode).toBe(303);
+    expect(page.headers.location).toBe(ON_THE_MAP);
     // Never seen as staff: nothing of the editor.
     const unknown = await made.app.inject({ url: EDITOR, headers: { cookie: other } });
     expect(unknown.statusCode).toBe(503);
     expect(unknown.body).toContain(
       'Discord cannot be reached just now, so I cannot tell whether you are staff.',
     );
-    expect(unknown.body).not.toContain('editor-QRSTUVWX.js');
+    expect(unknown.headers.location).toBeUndefined();
     // Half an hour after the last time Discord said so, no longer.
     made.clock.now += 30 * 60_000;
     expect((await made.app.inject({ url: EDITOR, headers: { cookie } })).statusCode).toBe(503);
@@ -95,7 +81,7 @@ describe('the region editor page', () => {
     const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
     expect(page.statusCode).toBe(403);
     expect(page.body).toContain('Only staff of this server may edit its regions.');
-    expect(page.body).not.toContain('editor-QRSTUVWX.js');
+    expect(page.headers.location).toBeUndefined();
   });
 
   it('offers a login to somebody logged out, and says why the last one did not happen', async () => {
@@ -118,14 +104,6 @@ describe('the region editor page', () => {
     expect(links.body).toContain('Use /region edit in Discord to log in.');
   });
 
-  it('says so when the bundle was not built', async () => {
-    web = webServerWith({ staff: new FakeRegionStaff().asStaff(STAFF) });
-    const cookie = await web.loggedIn(STAFF, 'Brock');
-    const page = await web.app.inject({ url: EDITOR, headers: { cookie } });
-    expect(page.statusCode).toBe(503);
-    expect(page.body).toContain('npm run web:build');
-  });
-
   it('is opened at most 20 times a minute from one address: each asks Discord', async () => {
     const staff = new FakeRegionStaff().asStaff(STAFF);
     const made = webServerWith({ assets: builtAssets(), staff });
@@ -133,7 +111,7 @@ describe('the region editor page', () => {
     const cookie = await made.loggedIn(STAFF, 'Brock');
     const open = () =>
       made.app.inject({ url: EDITOR, headers: { cookie }, remoteAddress: '203.0.113.7' });
-    for (let i = 0; i < 20; i += 1) expect((await open()).statusCode).toBe(200);
+    for (let i = 0; i < 20; i += 1) expect((await open()).statusCode).toBe(303);
     const refused = await open();
     expect(refused.statusCode).toBe(429);
     expect(refused.headers['retry-after']).toBe('60');
diff --git a/src/web/editor-routes.ts b/src/web/editor-routes.ts
index fe12df318405bf20be762cd57682af86bb680529..6877f3afc8306e1cf8d59a8f8a2ed2ddf4f6bf44 100644
--- a/src/web/editor-routes.ts
+++ b/src/web/editor-routes.ts
@@ -16,8 +16,7 @@ import {
 } from './editor-save.js';
 import { etagMatches } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
-import { shownTiles } from './headers.js';
-import { editorPage } from './page.js';
+import { editingMapPath } from '../domain/web/editor-address.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { RegionStaffSource, StaffAnswer } from './region-staff.js';
 import type { WebDeps } from './server.js';
@@ -158,8 +157,9 @@ export async function editorViewer(
  * past `SAVES_PER_ADDRESS_MINUTE` of an address or `REGION_CHECK_THROTTLE` of a member.
  */
 export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
-  // The page (spec 4): the static template for the server's staff (and while Discord cannot
-  // say: the data then says read-only); a page saying how to log in, or that it is for staff.
+  // The page (spec 4): for the server's staff (and while Discord cannot say: the data then says
+  // read-only) a redirect to the map with the editor on (plan 8M-10); a page saying how to log
+  // in, or that it is for staff.
   // It never sends anybody to Discord by itself: a login that failed would come back to it.
   // Every load asks Discord who is staff: at most `EDIT_DATA_PER_MINUTE` from one address.
   const seen = new StaffSeen(deps.now);
@@ -198,25 +198,9 @@ export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
         return reply.code(503).send(shortPage(UNKNOWN_SERVER));
       }
       if (viewer.kind === 'unconfirmed') return reply.code(503).send(shortPage(UNCONFIRMED));
-      const { manifest } = deps.assets;
-      if (!manifest) {
-        return reply
-          .code(503)
-          .send(shortPage('The region editor has not been built yet: run npm run web:build.'));
-      }
-      const tiles = shownTiles(deps.settings.tiles, deps.googleKey);
-      return reply.send(
-        editorPage(
-          {
-            guildId: guild,
-            tiles,
-            googleKey: tiles === 'google' ? deps.googleKey : undefined,
-            login: deps.oauth ? 'discord' : 'links',
-            distanceUnits: deps.distanceUnits,
-          },
-          manifest,
-        ),
-      );
+      // Staff (and while Discord cannot say, staff seen lately): the map with the editor on
+      // (plan 8M-10), an address of our constants, never of the request but the guild checked.
+      return reply.code(303).header('location', editingMapPath(guild)).send();
     },
   );
 
diff --git a/src/web/page-theme.test.ts b/src/web/page-theme.test.ts
index 4a344abde04909e2c666b673f1482d349bb38661..1391d89c7fc843017f1f2f70168c844a5e1f58bb 100644
--- a/src/web/page-theme.test.ts
+++ b/src/web/page-theme.test.ts
@@ -169,9 +169,8 @@ describe("the pages' look", () => {
       expect(selector, property).toBe(':root');
       expect(property).toMatch(/^--[a-z0-9-]+$/u);
     }
-    // Both pages load it: the editor's stylesheet takes the map's.
+    // The map loads it, and the editor's stylesheet is loaded beside the map's (plan 8M-10).
     expect(read('map.css')).toMatch(/@import '\.\/theme\.css';/u);
-    expect(read('editor.css')).toMatch(/@import '\.\/map\.css';/u);
   });
 
   it('names the same values in its light set and its dark set (plan 8M-7)', () => {
@@ -197,6 +196,13 @@ describe("the pages' look", () => {
     }
   });
 
+  it("takes the editor's sheet as an add-on of the map's, loaded beside it (plan 8M-10)", () => {
+    // Its rules use the map's theme; importing it (or Leaflet's) again would load them twice.
+    const editor = withoutComments(read('editor.css'));
+    expect(editor).not.toMatch(/@import '\.\/(?:map|theme)\.css';/u);
+    expect(editor).not.toMatch(/@import 'leaflet\//u);
+  });
+
   it('defines every property the pages use or draw with', () => {
     const defined = new Set(declarations(read('theme.css')).map(([, property]) => property));
     const used = new Set([
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index d8264ea1d24ade656e1c3bbcb65b8e7a7a837b27..bfba5422bbb84db3595fd577d7b7a55062b0209d 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -75,14 +75,27 @@ describe('the map page', () => {
       'data-tiles': 'osm',
       'data-login': 'discord',
       'data-distance-units': 'imperial',
+      // The region editor's files (plan 8M-10), loaded only when it is first turned on.
+      'data-editor-script': '/assets/editor-QRSTUVWX.js',
+      'data-editor-style': '/assets/editor-YZABCDEF.css',
+      'data-worker': '/assets/editor-worker-GHIJKLMN.js',
     });
-    // The row of the layers (plan 8M-7), which the script fills.
-    expect(page.body).toContain('<nav id="layers" aria-label="Layers"></nav>');
+    // The row of the layers (plan 8M-7), which the script fills; beside it the editor's tools,
+    // hidden until the editor is on (plan 8M-10), led by the way back to the map.
+    expect(page.body).toContain(
+      '<nav id="layers" aria-label="Layers"></nav>' +
+        '<div id="editor-bar" class="editor-only" hidden>' +
+        '<button id="editor-back" type="button">Back to the map</button>' +
+        '<span id="editor-tools"></span></div>',
+    );
     // The side pane of what is on (plan 8M-7; the meetups' panel of 8M-3 before), hidden until
-    // the script draws it, and the phone's button that swaps the map for it.
+    // the script draws it, and the phone's button that swaps the map for it; the editor's map
+    // and panel in their places, hidden until it is on (plan 8M-10).
     expect(page.body).toContain(
       '<div id="content"><main id="map" aria-label="Map"></main>' +
-        '<aside id="parties" aria-label="What is on" hidden></aside></div>',
+        '<aside id="parties" aria-label="What is on" hidden></aside>' +
+        '<div id="editor-map" class="editor-only" aria-label="Map of the regions" hidden></div>' +
+        '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
     );
     // Its words say what it shows next ("List", "Map"), so it is no toggle: a screen reader
     // would read "Map, pressed" (review fix 9).
@@ -124,7 +137,8 @@ describe('the map page', () => {
     web = webServerWith({ assets: builtAssets(), web: { tiles: 'google' } });
     const without = await web.app.inject({ url: MAP });
     // Without the key: Stadia Maps' tiles alone (plan 8M-7), as with the default.
-    expect(bodyData(without.body)).toEqual({
+    expect(bodyData(without.body)).not.toHaveProperty('data-google-key');
+    expect(bodyData(without.body)).toMatchObject({
       'data-guild': FAKE_GUILD_ID,
       'data-tiles': 'stadia',
       'data-login': 'discord',
@@ -190,6 +204,7 @@ describe("every page's look (plan 8M-7)", () => {
   it('follows the device on the map, the editor, the short pages and the login pages', async () => {
     web = webServerWith({ assets: builtAssets() });
     followsTheScheme((await web.app.inject({ url: MAP })).body, 'map-IJKLMNOP.css', MAP);
+    // The region editor is on the map since plan 8M-10; its address's refusals are short pages.
     for (const url of [
       '/',
       `/s/${FAKE_GUILD_ID}/regions/edit`,
diff --git a/src/web/page.ts b/src/web/page.ts
index aa19a3f011fc948f31b6ee6b7a0057910485fe26..5348a41d6ba46c30f979218364269c2cbbfcf170 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -119,14 +119,28 @@ function head(title: string, assets: PageAssets): string[] {
  * (`#parties`: the list of what is on, plan 8M-7, with the phone's "List" button) for everybody, and
  * the line that the parties are read-only (`#read-only`), apart from the moment's news
  * (`#notice`) so that neither takes the other's place.
+ *
+ * The region editor is on the map (plan 8M-10): its script, style and worker are named in
+ * `data-editor-script`, `data-editor-style` and `data-worker` (files of Pine's: the CSP's
+ * `'self'` lets them in), loaded only when it is first turned on, and its places are hidden hosts
+ * (`.editor-only`): its tools beside the layers' row, led by "Back to the map", its own map and
+ * its panel in the places of the map and the side pane.
  */
 export function mapPage(data: MapPageData, assets: AssetManifest): string {
+  const editor = [
+    `data-editor-script="/assets/${escapeHtml(assets.editor.script)}"`,
+    `data-editor-style="/assets/${escapeHtml(assets.editor.style)}"`,
+    `data-worker="/assets/${escapeHtml(assets.editor.worker)}"`,
+  ];
   return [
     ...head('Professor Pine: map', assets.map),
-    `<body ${bodyAttributes(data)}>`,
+    `<body ${bodyAttributes(data, editor)}>`,
     // Narrower than 768 pixels the title is "Pine" (`map.css`, fix round 1).
     '<header id="header"><span class="title"><span class="title-first">Professor </span>Pine</span>',
-    '<nav id="layers" aria-label="Layers"></nav>',
+    '<nav id="layers" aria-label="Layers"></nav>' +
+      '<div id="editor-bar" class="editor-only" hidden>' +
+      '<button id="editor-back" type="button">Back to the map</button>' +
+      '<span id="editor-tools"></span></div>',
     '<button id="list-button" class="list-button" type="button">List</button>',
     '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
     // The Report button (plan 8M-9A), shown by the script to a member who may report; on a phone
@@ -136,30 +150,11 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     '<span id="account"></span></header>',
     '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
     '<div id="content"><main id="map" aria-label="Map"></main>' +
-      '<aside id="parties" aria-label="What is on" hidden></aside></div>',
+      '<aside id="parties" aria-label="What is on" hidden></aside>' +
+      '<div id="editor-map" class="editor-only" aria-label="Map of the regions" hidden></div>' +
+      '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
     '<noscript><p>The map needs JavaScript.</p></noscript>',
     '</body>',
     '</html>',
   ].join('\n');
 }
-
-/**
- * The region editor (spec 4, plan 8M-2): a static template like the map's, which also names the
- * script of its worker (`data-worker`, a file of Pine's: the CSP's `script-src 'self'` lets it
- * run). The script builds the tools, the panel and the map.
- */
-export function editorPage(data: MapPageData, assets: AssetManifest): string {
-  return [
-    ...head('Professor Pine: regions', assets.editor),
-    `<body ${bodyAttributes(data, [`data-worker="/assets/${escapeHtml(assets.editor.worker)}"`])}>`,
-    '<header id="header"><span class="title">Professor Pine: regions</span>',
-    '<span id="tools"></span>',
-    '<span id="account"></span></header>',
-    '<p id="notice" hidden></p>',
-    '<div id="editor"><main id="map" aria-label="Map"></main>',
-    '<aside id="panel" aria-label="Regions"></aside></div>',
-    '<noscript><p>The region editor needs JavaScript.</p></noscript>',
-    '</body>',
-    '</html>',
-  ].join('\n');
-}
````

### Task 3: 8M-10 task 3: the region editor opened and closed through a mount

Prototype commit: `7a55cbb36fee0869e3e608a24d8c3468a85d5a55`

The editor's script no longer builds a page: it registers one typed mount,
window.pineRegionEditor (types in editor-mount.ts), which the map opens
with its hosts, the member and the live map's view. Every opening asks for
the data anew (the staff check, fresh); the first builds the editor's own
Leaflet map in its host at that view, a later one moves it there and takes
the new data (the places drawn anew only when they changed; Geoman's tools
shown or taken away by read-only). Closing drops a drawing under way and
gives back where its map was. The staged edits stay in the browser.

getJson throws a RequestError that keeps the server's { error } words
(request-error.ts, tested), which the opening answers when it is refused.

**Files:**

```
 src/web/client/common.ts             |   7 ++-
 src/web/client/editor-mount.ts       |  74 ++++++++++++++++++++++++++++
 src/web/client/editor.css            |  67 ++++++++++++++------------
 src/web/client/editor.ts             | 411 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------------------------------------
 src/web/client/request-error.test.ts |  63 ++++++++++++++++++++++++
 src/web/client/request-error.ts      |  46 ++++++++++++++++++
 6 files changed, 512 insertions(+), 156 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/request-error.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7a55cbb36fee0869e3e608a24d8c3468a85d5a55 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 3: the region editor opened and closed through a mount`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index 11150ad108f612dfec2320abc64bce650cc461cf..8722061e6d614e61320fcfca2334368b7e61c650 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -15,6 +15,7 @@ import {
 } from './layers.js';
 import { LOGOUT_FAILED, logOut } from './logout.js';
 import { headerLines, type Me, type WebPage } from './notice.js';
+import { requestError } from './request-error.js';
 import { darkScheme, onThemeChange } from './theme.js';
 
 /**
@@ -32,9 +33,13 @@ export function byId(id: string): HTMLElement {
   return found;
 }
 
+/**
+ * JSON of the page's server (or another's, by `init`). A failure throws a `RequestError` that
+ * keeps the server's words of a refusal (plan 8M-10); a broken connection throws as `fetch` does.
+ */
 export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
   const response = await fetch(url, { credentials: 'same-origin', ...init });
-  if (!response.ok) throw new Error(`${response.status}`);
+  if (!response.ok) throw requestError(response.status, await response.text().catch(() => ''));
   return (await response.json()) as T;
 }
 
diff --git a/src/web/client/editor-mount.ts b/src/web/client/editor-mount.ts
new file mode 100644
index 0000000000000000000000000000000000000000..158c3237e326f9dbcf6e4f746fa56eeac7554005
--- /dev/null
+++ b/src/web/client/editor-mount.ts
@@ -0,0 +1,74 @@
+import type { DistanceUnits } from './distance.js';
+import type { TileSetting } from './layers.js';
+import type { Me } from './notice.js';
+
+/**
+ * How the map page and the region editor's bundle meet (plan 8M-10, C3): the editor's script,
+ * loaded when the editor is first turned on, registers one mount on `window.pineRegionEditor`;
+ * the map opens and closes the editor through it. Types and the words both sides say alone: the
+ * map's bundle takes nothing of the editor's code (Leaflet and Geoman stay in the editor's bundle).
+ */
+
+/** Said when the editor is turned on while a form of the map holds (C8). */
+export const CLOSE_FORM_FIRST = 'Close the form first.';
+/** Said when the editor's files could not be loaded, or the editor could not be started. */
+export const EDITOR_FAILED = 'The region editor could not be loaded. Try again in a moment.';
+
+/**
+ * Where the editor draws on the map page: its own map, its tool row, its side panel; and the
+ * row's "Back to the map", which it turns off while a preview or a save is being sent.
+ */
+export interface EditorHosts {
+  map: HTMLElement;
+  tools: HTMLElement;
+  panel: HTMLElement;
+  back: HTMLButtonElement;
+}
+
+/** A view of a map: its center and zoom. */
+export interface MapView {
+  lat: number;
+  lon: number;
+  zoom: number;
+}
+
+/** What the editor is opened with. */
+export interface EditorOpening {
+  hosts: EditorHosts;
+  guild: string;
+  me: Me;
+  /** The script of the editor's worker (`data-worker`). */
+  worker: string;
+  units: DistanceUnits;
+  tiles: TileSetting;
+  googleKey: string | undefined;
+  /** Where its map opens: the live map's view (C4). */
+  view: MapView;
+  /**
+   * Shows the editor's hosts, once its data came (before its map is drawn in them); false when
+   * the page cannot show them now (a form of the map opened meanwhile, C8): the editor then
+   * draws nothing and answers `{ ok: false, words: CLOSE_FORM_FIRST }`.
+   */
+  show(): boolean;
+}
+
+/** Whether the editor opened, or the words of why not (the data route's refusal, C2). */
+export type EditorOpened = { ok: true } | { ok: false; words: string };
+
+/** The editor's side of the meeting. */
+export interface EditorMount {
+  /**
+   * Turns the editor on: its data asked anew (the staff check, fresh, at every opening), then its
+   * hosts shown and drawn; the staged edits kept by the browser as they are. Never rejects.
+   */
+  open(opening: EditorOpening): Promise<EditorOpened>;
+  /** Turns it off (its hosts are hidden by the map): where its map was. */
+  close(): MapView | undefined;
+}
+
+declare global {
+  interface Window {
+    /** Set by the editor's script as it runs (`editor.ts`). */
+    pineRegionEditor?: EditorMount;
+  }
+}
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index d7bcecfd8de8a13feecd94070272aa27dced5f23..45da466a6e76862c14b01a01f30df5078f1b35de 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -1,13 +1,18 @@
 @import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
 
-#tools {
+/*
+ * The region editor on the map (plans 8M-2, 8M-10): an add-on of `map.css`, loaded beside it
+ * when the editor is first turned on, so it imports neither the map's sheet nor the theme again.
+ */
+
+#editor-tools {
   display: flex;
   flex-wrap: wrap;
   gap: 6px;
 }
 
-#tools button,
-#panel button {
+#editor-tools button,
+#editor-panel button {
   color: var(--secondary-text);
   background: var(--tool-bg);
   border: 0;
@@ -18,23 +23,23 @@
   cursor: pointer;
 }
 
-#tools button:hover,
-#panel button:hover {
+#editor-tools button:hover,
+#editor-panel button:hover {
   background: var(--secondary-hover);
 }
 
-#tools button:disabled {
+#editor-tools button:disabled {
   opacity: 0.5;
   cursor: default;
 }
 
-#editor {
+/* Its own map in the live map's place (plan 8M-10), its panel in the side pane's. */
+#editor-map {
   flex: 1;
-  display: flex;
-  min-height: 0;
+  min-height: 300px;
 }
 
-#panel {
+#editor-panel {
   width: var(--editor-panel-width);
   max-width: 45vw;
   overflow-y: auto;
@@ -44,27 +49,27 @@
   font-size: 14px;
 }
 
-#panel h2 {
+#editor-panel h2 {
   font-size: 15px;
   margin: 12px 0 4px;
 }
 
-#panel h3 {
+#editor-panel h3 {
   font-size: 14px;
   margin: 8px 0 2px;
 }
 
-#panel ul {
+#editor-panel ul {
   margin: 0;
   padding-left: 18px;
 }
 
-#panel li {
+#editor-panel li {
   margin: 2px 0;
 }
 
-#panel select,
-#panel input {
+#editor-panel select,
+#editor-panel input {
   display: block;
   width: 100%;
   margin: 4px 0;
@@ -77,61 +82,61 @@
   box-sizing: border-box;
 }
 
-#panel .actions button,
-#panel .dialog button,
-#panel .conflict button {
+#editor-panel .actions button,
+#editor-panel .dialog button,
+#editor-panel .conflict button {
   margin: 4px 6px 0 0;
   font: inherit;
 }
 
-#panel .reasons li,
-#panel .warning {
+#editor-panel .reasons li,
+#editor-panel .warning {
   color: var(--warning);
 }
 
-#panel .region-list li,
-#panel .piece-list li {
+#editor-panel .region-list li,
+#editor-panel .piece-list li {
   cursor: pointer;
 }
 
-#panel .region-list li.chosen {
+#editor-panel .region-list li.chosen {
   font-weight: 600;
 }
 
-#panel .piece-list li.fresh {
+#editor-panel .piece-list li.fresh {
   color: var(--fresh-piece);
   font-weight: 600;
 }
 
-#panel .dialog {
+#editor-panel .dialog {
   border: 1px solid var(--field-border);
   border-radius: var(--radius);
   padding: 4px 10px 10px;
   background: var(--dialog-bg);
 }
 
-#panel .conflict {
+#editor-panel .conflict {
   margin: 6px 0;
 }
 
-#panel .piece-list button {
+#editor-panel .piece-list button {
   font: inherit;
   font-size: 12px;
   padding: 0 6px;
 }
 
-#panel .piece-list .cannot-fix {
+#editor-panel .piece-list .cannot-fix {
   color: var(--cannot-fix);
   font-size: 12px;
 }
 
-#panel .fix-option {
+#editor-panel .fix-option {
   margin: 4px 0;
   padding: 2px 6px;
   border-left: 3px solid transparent;
 }
 
-#panel .fix-option.chosen {
+#editor-panel .fix-option.chosen {
   border-left-color: var(--fix-line);
   background: var(--fix-chosen-bg);
 }
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index a856e72bfd1a46e2fee8ca587857951daabe20ec..2153e4712b185ac1bfe36b4c5d0fe0fe396dcc6b 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -27,7 +27,7 @@ import { MAX_NEW_CATEGORY, MAX_NEW_CHANNEL_NAME } from '../../domain/regions/sav
 import { splitOutline, type Split } from '../../domain/regions/split.js';
 import { normalisedOutline, roundSix } from '../../domain/regions/version.js';
 import type { EditorData, Point, Worded } from '../../domain/web/editor-data.js';
-import { addTiles, byId, getJson, say, showAccount, tileSetting, whoIsAsking } from './common.js';
+import { addTiles, getJson, say as sayOnPage, whoIsAsking } from './common.js';
 import type {
   CoverageAnswer,
   CoverageRegion,
@@ -69,13 +69,17 @@ import {
   type PlaceCounts,
   type ReadAnswer,
 } from './editor-view.js';
-import { loginNotice, loginNoticeFor, type Me } from './notice.js';
+import { CLOSE_FORM_FIRST, EDITOR_FAILED, type EditorHosts, type MapView } from './editor-mount.js';
+import type { Me } from './notice.js';
 import { regionLabel, renderNode } from './popup.js';
+import { failureWords, timed } from './request-error.js';
 import { browserStorage, readStaged, writeStaged } from './staged-storage.js';
 import { onThemeChange, theme, type Theme } from './theme.js';
 
 /**
- * The region editor (spec 4, plan 8M-2), bundled by `scripts/web/build.ts` beside the map:
+ * The region editor (spec 4, plans 8M-2 and 8M-10), bundled by `scripts/web/build.ts` beside the
+ * map, whose page loads it when the editor is first turned on and opens it through the mount it
+ * registers (`editor-mount.ts`), in its hosts (its own map, the tool row, the side panel):
  * Leaflet (on a canvas, for thousands of places) with Geoman's tools to draw, reshape and move
  * regions, snapping to the corners and edges of every outline; the server's regions labelled
  * with their channels and gym counts, other servers' in grey; the gyms, stops, power spots and
@@ -88,6 +92,17 @@ import { onThemeChange, theme, type Theme } from './theme.js';
 /** The colours the editor draws, from the page's theme. */
 const colours = (): Theme['colours'] => theme().colours;
 
+/** Whether the editor's hosts are shown: hidden, it says nothing over the live map (F2). */
+let shownNow = false;
+
+/** Says a line on the page while the editor is shown. */
+function say(text: string): void {
+  if (shownNow) sayOnPage(text);
+}
+
+/** "Back to the map"'s title while a preview or a save is being sent (review 1, F2). */
+const BACK_WAITS = 'Wait for the answer of the preview or the save.';
+
 /** How long the editor waits after an edit before the overlaps and gaps are worked out again. */
 const CHECK_DELAY_MS = 400;
 /** How many overlaps and gaps the panel lists; the map shades them all. */
@@ -193,6 +208,8 @@ class Editor {
   private checkFailed = false;
   private seq = 0;
   private timer: number | undefined;
+  /** How many previews and saves are being sent (`whileSending`). */
+  private sending = 0;
   /** What became of the staged edits in the browser the last time (`writeStaged`). */
   private stored: 'kept' | 'full' | 'none' = 'kept';
   /** The body the last preview was of: Save sends it, and only it. */
@@ -241,6 +258,14 @@ class Editor {
   private readonly theirs = L.layerGroup();
   private readonly shaded = L.layerGroup();
   private readonly regionLayers = new Map<string, L.Polygon>();
+  /** The layers of the places and of other servers' outlines (the stops off at first). */
+  private readonly places = {
+    gyms: L.layerGroup(),
+    stops: L.layerGroup(),
+    powerspots: L.layerGroup(),
+    wayfarerGyms: L.layerGroup(),
+    others: L.layerGroup(),
+  };
   private gymDots: L.CircleMarker[] = [];
   private wayspotDots: L.CircleMarker[] = [];
   private outsideBefore = { gyms: new Set<number>(), wayspots: new Set<number>() };
@@ -257,6 +282,8 @@ class Editor {
     private readonly worker: Worker,
     /** The units distances are said in (`data-distance-units`; review fix 8). */
     private readonly units: DistanceUnits,
+    /** Where it draws on the map page (plan 8M-10). */
+    private readonly hosts: EditorHosts,
   ) {
     this.key = storageKey(data.guild.id, data.userId);
     this.loaded = loadedRegions(data);
@@ -281,26 +308,110 @@ class Editor {
     });
   }
 
+  /** Opened the first time: everything drawn at the map's view (the live map's, plan 8M-10). */
   start(): void {
-    const { map, data } = this;
+    const { map } = this;
+    this.places.gyms.addTo(map);
+    this.places.powerspots.addTo(map);
+    this.places.wayfarerGyms.addTo(map);
+    this.places.others.addTo(map);
+    this.regions.addTo(map);
+    this.removed.addTo(map);
+    this.theirs.addTo(map);
+    this.shaded.addTo(map);
+    this.fixPreview.addTo(map);
+    // The names are constants of ours: Leaflet sets them as HTML.
+    L.control
+      .layers(
+        undefined,
+        {
+          Gyms: this.places.gyms,
+          'Stops (many: off at first)': this.places.stops,
+          'Power Spots': this.places.powerspots,
+          'Wayfarer gyms Pine did not take': this.places.wayfarerGyms,
+          "Other servers' regions": this.places.others,
+          'Overlaps and gaps': this.shaded,
+        },
+        { position: 'topright', collapsed: true },
+      )
+      .addTo(map);
+    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, exitModeOnEscape: true });
+    map.on('pm:create', (event: { shape: string; layer: L.Layer }) => {
+      this.created(event.shape, event.layer);
+    });
+    this.drawPlaces();
+    this.tools();
+    this.toolbar();
+    this.drawRegions();
+    this.recolour();
+    this.noRegionsYet();
+    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.placeList() });
+    this.check();
+    this.panel();
     // The device changed between light and dark (plan 8M-7): the regions drawn anew in the new
-    // set (the places keep their colors in both: `theme.css`).
+    // set (the places keep their colors in both: `theme.css`). Listened for last (review 2, R5):
+    // a first build that failed before this leaves no listener behind.
     onThemeChange(() => {
       this.redraw();
     });
-    const others = L.layerGroup(
-      data.others.map((other) =>
-        // Not editable, but snapped to: shared borders meet.
-        L.polygon(other.outline, {
-          color: colours().others,
-          weight: 1,
-          dashArray: '4 4',
-          fillOpacity: 0.03,
-          pmIgnore: true,
-          snapIgnore: false,
-        }),
-      ),
-    );
+  }
+
+  /**
+   * Opened again (plan 8M-10): the data as the server has it now (asked fresh at every opening),
+   * the staged edits as the browser keeps them, rebased on nothing (a conflict is a conflict).
+   */
+  reopened(data: EditorData, me: Me): void {
+    this.me = me;
+    const placesChanged = placesKey(data) !== placesKey(this.data);
+    this.took(data, false);
+    if (placesChanged) this.drawPlaces();
+    this.tools();
+    this.recolour();
+    this.noRegionsYet();
+  }
+
+  /**
+   * Turned off (plan 8M-10; the map hides its hosts): a drawing under way is dropped, the staged
+   * edits stay. Where its map was.
+   */
+  hidden(): MapView {
+    this.splitting = undefined;
+    if (!this.data.readOnly) this.map.pm.disableDraw();
+    // Work in flight is not taken once hidden (review 1, F2): a fix shown or asked for is
+    // dropped, the worker's late answers are of an older request, no check waits to be asked.
+    window.clearTimeout(this.timer);
+    this.seq += 1;
+    this.fixAsk += 1;
+    this.closeFix();
+    const center = this.map.getCenter();
+    return { lat: center.lat, lon: center.lng, zoom: this.map.getZoom() };
+  }
+
+  private noRegionsYet(): void {
+    if (!this.regions.getBounds().isValid()) {
+      say('This server has no regions yet: draw the first one.');
+    }
+  }
+
+  /**
+   * The places and other servers' outlines of the data, drawn anew into their layers (kept, so
+   * that the layer switch keeps them): a place in no region is colored anew (`recolour`).
+   */
+  private drawPlaces(): void {
+    const { data } = this;
+    const { gyms, stops, powerspots, wayfarerGyms, others } = this.places;
+    for (const group of [gyms, stops, powerspots, wayfarerGyms, others]) group.clearLayers();
+    for (const other of data.others) {
+      // Not editable, but snapped to: shared borders meet.
+      L.polygon(other.outline, {
+        color: colours().others,
+        weight: 1,
+        dashArray: '4 4',
+        fillOpacity: 0.03,
+        pmIgnore: true,
+        snapIgnore: false,
+      }).addTo(others);
+    }
     const dot = (lat: number, lon: number, colour: string, radius: number): L.CircleMarker =>
       L.circleMarker([lat, lon], {
         radius,
@@ -312,9 +423,9 @@ class Editor {
       });
     // Tooltips are made when shown: tens of thousands of places.
     this.gymDots = data.gyms.map(([, lat, lon, name]) =>
-      dot(lat, lon, colours().editorGym, 5).bindTooltip(() =>
-        renderNode({ tag: 'span', text: name }, document),
-      ),
+      dot(lat, lon, colours().editorGym, 5)
+        .bindTooltip(() => renderNode({ tag: 'span', text: name }, document))
+        .addTo(gyms),
     );
     this.wayspotDots = data.wayspots.map(([kind, lat, lon, title]) =>
       dot(
@@ -326,50 +437,44 @@ class Editor {
             ? colours().powerSpot
             : colours().wayfarerGym,
         kind === 'stop' ? 3 : 4,
-      ).bindTooltip(() => renderNode({ tag: 'span', text: title }, document)),
-    );
-    const ofKind = (kind: string): L.LayerGroup =>
-      L.layerGroup(this.wayspotDots.filter((_dot, i) => data.wayspots[i]?.[0] === kind));
-    const gyms = L.layerGroup(this.gymDots).addTo(map);
-    const stops = ofKind('stop');
-    const powerspots = ofKind('powerspot').addTo(map);
-    const wayfarerGyms = ofKind('gym').addTo(map);
-    others.addTo(map);
-    this.regions.addTo(map);
-    this.removed.addTo(map);
-    this.theirs.addTo(map);
-    this.shaded.addTo(map);
-    this.fixPreview.addTo(map);
-    // The names are constants of ours: Leaflet sets them as HTML.
-    L.control
-      .layers(
-        undefined,
-        {
-          Gyms: gyms,
-          'Stops (many: off at first)': stops,
-          'Power Spots': powerspots,
-          'Wayfarer gyms Pine did not take': wayfarerGyms,
-          "Other servers' regions": others,
-          'Overlaps and gaps': this.shaded,
-        },
-        { position: 'topright', collapsed: true },
       )
-      .addTo(map);
-    if (!data.readOnly) this.tools();
-    this.toolbar();
-    this.drawRegions();
-    this.recolour();
-    const bounds = this.regions.getBounds();
-    if (bounds.isValid()) map.fitBounds(bounds);
-    else say('This server has no regions yet: draw the first one.');
-    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.places() });
-    this.check();
-    this.panel();
+        .bindTooltip(() => renderNode({ tag: 'span', text: title }, document))
+        .addTo(kind === 'stop' ? stops : kind === 'powerspot' ? powerspots : wayfarerGyms),
+    );
+    this.coloured = false;
   }
 
-  /** Geoman's tools: draw a polygon or a rectangle, reshape, move; snapping on. */
+  /** A shape drawn with Geoman's tools: a new region, or the line of a split. */
+  private created(shape: string, layer: L.Layer): void {
+    layer.remove();
+    if (shape === 'Line' && this.splitting !== undefined) {
+      this.split(this.splitting, (layer as L.Polyline).getLatLngs() as L.LatLng[]);
+      return;
+    }
+    if (shape !== 'Polygon' && shape !== 'Rectangle') return;
+    const key = newKey(this.state.next);
+    this.edit({
+      kind: 'add',
+      key,
+      outline: ringOf(layer as L.Polygon),
+      channel: null,
+      description: null,
+    });
+    this.selected = key;
+    this.redraw();
+  }
+
+  /**
+   * Geoman's tools: draw a polygon or a rectangle, reshape, move; snapping on. None while the
+   * editor is read-only (Discord away), shown again when it is not at a later opening.
+   */
   private tools(): void {
     const { map } = this;
+    if (this.data.readOnly) {
+      if (map.pm.controlsVisible()) map.pm.removeControls();
+      return;
+    }
+    if (map.pm.controlsVisible()) return;
     map.pm.addControls({
       position: 'topleft',
       drawMarker: false,
@@ -385,31 +490,11 @@ class Editor {
       removalMode: false,
       rotateMode: false,
     });
-    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, exitModeOnEscape: true });
-    map.on('pm:create', (event: { shape: string; layer: L.Layer }) => {
-      const { shape, layer } = event;
-      layer.remove();
-      if (shape === 'Line' && this.splitting !== undefined) {
-        this.split(this.splitting, (layer as L.Polyline).getLatLngs() as L.LatLng[]);
-        return;
-      }
-      if (shape !== 'Polygon' && shape !== 'Rectangle') return;
-      const key = newKey(this.state.next);
-      this.edit({
-        kind: 'add',
-        key,
-        outline: ringOf(layer as L.Polygon),
-        channel: null,
-        description: null,
-      });
-      this.selected = key;
-      this.redraw();
-    });
   }
 
   /** The header's tools: undo, redo, a KML file in and out, Save. */
   private toolbar(): void {
-    const tools = byId('tools');
+    const tools = this.hosts.tools;
     tools.replaceChildren();
     const readOnly = this.data.readOnly;
     const file = element('input');
@@ -437,7 +522,7 @@ class Editor {
       button('Load KML', () => file.click(), readOnly),
       file,
       button('Export KML', () => this.exportKml()),
-      button('Save…', () => void this.preview(), !ready.ready),
+      button('Save…', () => void this.whileSending(() => this.preview()), !ready.ready),
     );
   }
 
@@ -678,7 +763,7 @@ class Editor {
     return version;
   }
 
-  private places(): [PlaceKind, number, number][] {
+  private placeList(): [PlaceKind, number, number][] {
     return [
       ...this.data.gyms.map(([, lat, lon]): [PlaceKind, number, number] => ['gym', lat, lon]),
       ...this.data.wayspots.map(([kind, lat, lon]): [PlaceKind, number, number] => [
@@ -760,7 +845,7 @@ class Editor {
 
   /** The side panel: the dialog of a save, conflicts, the selected region, the lists. */
   private panel(): void {
-    const panel = byId('panel');
+    const panel = this.hosts.panel;
     panel.replaceChildren();
     if (this.dialog) panel.append(this.dialog);
     this.fixSection(panel);
@@ -1372,19 +1457,23 @@ class Editor {
 
   /**
    * POSTs a body (`saveBody`) with the CSRF token; asks for a new token once when it was
-   * refused. What came back, read (`readSaveAnswer`); `unknown` also when nothing came back.
+   * refused. What came back, read (`readSaveAnswer`); `unknown` also when nothing came back, or
+   * not within the time limit (`timed`, review 2, R2).
    */
   private async send(what: 'preview' | 'save', body: string): Promise<ReadAnswer> {
     const post = async (): Promise<Response> =>
-      fetch(`/s/${this.data.guild.id}/api/regions/${what}`, {
-        method: 'POST',
-        credentials: 'same-origin',
-        headers: {
-          'content-type': 'application/json',
-          'x-pine-csrf': this.me.loggedIn ? this.me.csrf : '',
-        },
-        body,
-      });
+      fetch(
+        `/s/${this.data.guild.id}/api/regions/${what}`,
+        timed({
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: {
+            'content-type': 'application/json',
+            'x-pine-csrf': this.me.loggedIn ? this.me.csrf : '',
+          },
+          body,
+        }),
+      );
     try {
       let response = await post();
       if (response.status === 403) {
@@ -1398,6 +1487,26 @@ class Editor {
     }
   }
 
+  /**
+   * A preview or a save, "Back to the map" off until it is through (review 1, F2): its answer,
+   * the reload after it and a preview again land in the editor, never over the live map.
+   */
+  private async whileSending(work: () => Promise<void>): Promise<void> {
+    const { back } = this.hosts;
+    this.sending += 1;
+    back.disabled = true;
+    back.title = BACK_WAITS;
+    try {
+      await work();
+    } finally {
+      this.sending -= 1;
+      if (this.sending === 0) {
+        back.disabled = false;
+        back.removeAttribute('title');
+      }
+    }
+  }
+
   /** Save, step one: what the server would do (spec 4.5), of the body Save then sends. */
   private async preview(): Promise<void> {
     this.showDialog('Asking what would be saved…');
@@ -1454,7 +1563,11 @@ class Editor {
       case 'preview':
         dialog.append(element('h2', 'What saving would do'));
         showWorded(dialog, answer.worded);
-        if (answer.changes) dialog.append(button('Save these changes', () => void this.save()));
+        if (answer.changes) {
+          dialog.append(
+            button('Save these changes', () => void this.whileSending(() => this.save())),
+          );
+        }
         dialog.append(button('Cancel', () => this.closeDialog()));
         break;
       case 'saved': {
@@ -1535,43 +1648,93 @@ class Editor {
    * they are: their versions tell which regions changed meanwhile.
    */
   private async reload(saved: boolean): Promise<void> {
+    // Within the time limit (R2): a reload that stalls fails as one that could not be made.
+    const data = await getJson<EditorData>(
+      `/s/${this.data.guild.id}/api/regions/edit`,
+      timed({ cache: 'no-cache' }),
+    );
+    this.took(data, saved);
+  }
+
+  /**
+   * The editor's data as loaded anew: the regions as the server has them, the staged edits
+   * applied to them (after a save rebased: `rebaseAfterSave`), the worker told, everything shown.
+   */
+  private took(data: EditorData, saved: boolean): void {
     const drafts = this.applied.drafts;
-    const data = await getJson<EditorData>(`/s/${this.data.guild.id}/api/regions/edit`, {
-      cache: 'no-cache',
-    });
     this.data = data;
     this.loaded = loadedRegions(data);
     this.picker = undefined;
     if (saved) this.state = rebaseAfterSave(drafts, this.loaded, this.state);
-    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.places() });
+    this.post({ kind: 'loaded', regions: this.loadedCoverage(), places: this.placeList() });
     this.changed();
     this.redraw();
   }
 }
 
-async function start(): Promise<void> {
-  const dataset = document.body.dataset;
-  const guild = dataset.guild ?? '';
-  const map = L.map(byId('map'), { center: [40.44, -79.99], zoom: 11, preferCanvas: true });
-  addTiles(map, tileSetting(dataset.tiles), dataset.googleKey);
-  // `?login=` taken out of the address at once, said only to somebody logged out (review fix 5).
-  const notice = loginNotice(location.search);
-  if (notice) {
-    history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
-  }
-  const me = await showAccount(guild, dataset.login === 'discord' ? 'discord' : 'links', 'editor');
-  const noticeText = loginNoticeFor(notice, me);
-  if (noticeText !== undefined) say(noticeText);
-  let data: EditorData;
-  try {
-    data = await getJson<EditorData>(`/s/${guild}/api/regions/edit`);
-  } catch {
-    say('The regions could not be loaded. Reload the page in a moment.');
-    return;
-  }
-  if (data.readOnly) say('Discord cannot be reached just now, so the editor is read-only.');
-  const units = dataset.distanceUnits === 'metric' ? 'metric' : 'imperial';
-  new Editor(map, data, me, new Worker(dataset.worker ?? ''), units).start();
-}
+/** The places and other servers' outlines of the data, to tell whether they changed. */
+const placesKey = (data: EditorData): string =>
+  JSON.stringify([data.gyms, data.wayspots, data.others]);
+
+/** What the page says when the editor's data cannot be loaded and the server said no words. */
+const LOAD_FAILED = 'The regions could not be loaded. Try again in a moment.';
+
+/** The editor once opened: its own map (kept while hidden, C4) and the editor on it. */
+let opened: { map: L.Map; editor: Editor } | undefined;
 
-void start();
+/**
+ * The editor's side of the map page (plan 8M-10, `editor-mount.ts`): registered as this script
+ * runs. Every opening asks for the data anew (the staff check, fresh); the first builds the map
+ * in its host at the live map's view, a later one moves it there and takes the data. It never
+ * rejects (review 1, F1): a failure once shown answers `EDITOR_FAILED` (the map closes it), and a
+ * first build that failed is taken down, so that the next opening builds anew.
+ */
+window.pineRegionEditor = {
+  async open(opening) {
+    let data: EditorData;
+    try {
+      // Within the time limit (R2): an opening never waits for good.
+      data = await getJson<EditorData>(
+        `/s/${opening.guild}/api/regions/edit`,
+        timed({ cache: 'no-cache' }),
+      );
+    } catch (err) {
+      return { ok: false, words: failureWords(err, LOAD_FAILED) };
+    }
+    // A form of the map opened while the data came (F4): nothing is shown over it.
+    if (!opening.show()) return { ok: false, words: CLOSE_FORM_FIRST };
+    shownNow = true;
+    const { view } = opening;
+    let built: { map: L.Map; worker?: Worker } | undefined;
+    try {
+      if (opened) {
+        opened.map.invalidateSize();
+        opened.map.setView([view.lat, view.lon], view.zoom, { animate: false });
+        opened.editor.reopened(data, opening.me);
+      } else {
+        const map = L.map(opening.hosts.map, {
+          center: [view.lat, view.lon],
+          zoom: view.zoom,
+          preferCanvas: true,
+        });
+        built = { map };
+        addTiles(map, opening.tiles, opening.googleKey);
+        const worker = new Worker(opening.worker);
+        built.worker = worker;
+        const editor = new Editor(map, data, opening.me, worker, opening.units, opening.hosts);
+        editor.start();
+        opened = { map, editor };
+      }
+    } catch {
+      built?.worker?.terminate();
+      built?.map.remove();
+      return { ok: false, words: EDITOR_FAILED };
+    }
+    if (data.readOnly) say('Discord cannot be reached just now, so the editor is read-only.');
+    return { ok: true };
+  },
+  close: () => {
+    shownNow = false;
+    return opened?.editor.hidden();
+  },
+};
diff --git a/src/web/client/request-error.test.ts b/src/web/client/request-error.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..31f16af92c95f5c150c80dc0fd64128b43814f1f
--- /dev/null
+++ b/src/web/client/request-error.test.ts
@@ -0,0 +1,63 @@
+import { describe, expect, it, onTestFinished, vi } from 'vitest';
+import { failureWords, REQUEST_TIMEOUT_MS, requestError, timed } from './request-error.js';
+
+describe('a request the server refused (plan 8M-10, C2)', () => {
+  it("keeps the server's words of a refusal, with its status", () => {
+    const refused = requestError(
+      403,
+      '{"error":"Only staff of this server may edit its regions."}',
+    );
+    expect(refused).toBeInstanceOf(Error);
+    expect(refused.status).toBe(403);
+    expect(refused.words).toBe('Only staff of this server may edit its regions.');
+    // As before: the status as the message.
+    expect(refused.message).toBe('403');
+  });
+
+  it('has no words where the answer says none it can read', () => {
+    for (const body of ['', 'Not found.', '{"error":42}', '[]', 'null', '{"error":"  "}']) {
+      expect(requestError(502, body).words, body).toBeUndefined();
+    }
+  });
+
+  it("says the server's words, or the page's own when it said none or nothing came back", () => {
+    const fallback = 'The regions could not be loaded. Try again in a moment.';
+    expect(failureWords(requestError(503, '{"error":"Not available just now."}'), fallback)).toBe(
+      'Not available just now.',
+    );
+    expect(failureWords(requestError(500, ''), fallback)).toBe(fallback);
+    expect(failureWords(new TypeError('Failed to fetch'), fallback)).toBe(fallback);
+  });
+});
+
+describe("a request of the region editor's (review 2, R2)", () => {
+  /** A server that never answers: the request fails when its signal aborts, as `fetch` does. */
+  function stalled(init: RequestInit): Promise<Response> {
+    return new Promise((_resolve, reject) => {
+      init.signal?.addEventListener('abort', () => {
+        reject(init.signal?.reason as Error);
+      });
+    });
+  }
+
+  it('fails as no answer once a minute has gone by without one', async () => {
+    // The time limit, faked (as `fakeTimeoutSignals` of `test/support/timers.ts`, which the
+    // page's own typecheck cannot read): it ends when the test says.
+    const limit = new AbortController();
+    const made = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(limit.signal);
+    onTestFinished(() => {
+      made.mockRestore();
+    });
+    const init = timed({ method: 'POST', body: '{}', cache: 'no-cache' });
+    expect(init).toMatchObject({ method: 'POST', body: '{}', cache: 'no-cache' });
+    const asked = stalled(init);
+    expect(made.mock.calls).toEqual([[REQUEST_TIMEOUT_MS]]);
+    expect(REQUEST_TIMEOUT_MS).toBe(60_000);
+    limit.abort(new DOMException('The operation timed out.', 'TimeoutError'));
+    const failed = await asked.catch((err: unknown) => err);
+    // The page's own words, as for an answer that never came.
+    expect(failureWords(failed, 'The preview could not be asked for.')).toBe(
+      'The preview could not be asked for.',
+    );
+  });
+});
diff --git a/src/web/client/request-error.ts b/src/web/client/request-error.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a15641781fc65576708aeac62a29c5e59562efc4
--- /dev/null
+++ b/src/web/client/request-error.ts
@@ -0,0 +1,46 @@
+/**
+ * A request of the pages that the server answered with a failure (plan 8M-10, C2): its status, and
+ * the server's own words where it said them (`{ error }`, `sendFailure` and the routes' refusals),
+ * so that the page can say them. Its message is the status, as `getJson` threw before.
+ */
+export class RequestError extends Error {
+  constructor(
+    readonly status: number,
+    /** The server's words, or undefined where the answer said none. */
+    readonly words: string | undefined,
+  ) {
+    super(`${status}`);
+    this.name = 'RequestError';
+  }
+}
+
+/** The failure of an answer of this status and body (read as text). */
+export function requestError(status: number, body: string): RequestError {
+  let words: string | undefined;
+  try {
+    const read = JSON.parse(body) as unknown;
+    if (typeof read === 'object' && read !== null && 'error' in read) {
+      const { error } = read;
+      if (typeof error === 'string' && error.trim() !== '') words = error;
+    }
+  } catch {
+    // No JSON: no words.
+  }
+  return new RequestError(status, words);
+}
+
+/** How long a request of the region editor waits for its answer (review 2, R2). */
+export const REQUEST_TIMEOUT_MS = 60_000;
+
+/**
+ * A request's options with the editor's time limit: an answer that stalls fails as one that never
+ * came (no words of the server's), so that "Back to the map" is not kept off until a reload.
+ */
+export function timed(init: RequestInit): RequestInit {
+  return { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
+}
+
+/** What the page says of a request that failed: the server's words, or its own. */
+export function failureWords(err: unknown, fallback: string): string {
+  return err instanceof RequestError && err.words !== undefined ? err.words : fallback;
+}
````

### Task 4: 8M-10 task 4: "Edit regions" turns the editor on over the map

Prototype commit: `868ec575cc58ebcd8b5f9a9ac2676e5c41998f59`

The account menu holds "Edit regions" for a member /api/me says may edit
the server's regions, from 1024 pixels (narrower: not offered, and
?edit=regions shows the live map with "Edit regions on a wider screen
(1024 pixels or more)."). Turned on (EditorToggle, editor-toggle.ts):
refused while a form of the map holds ("Close the form first."); the
editor's script and stylesheet added once and waited for (loadOnce); its
data asked fresh, a refusal turning it back off in the server's words; then
the live map's parts (map, list pane, layer row, Report, List, Find) make
way for the editor's own map, panel and tool row led by "Back to the map",
and the address keeps ?edit=regions. Off: the live map at the editor's view
within its own limits, the parties drawn as they were.

Nothing is polled while the editor is on: MapActivity (parties.ts) says
whether the live map is in use (visible and the editor off) and tells the
pollers of the parties and of the reports at stops, whose Poller now asks
active() and is told activeChanged().

**Files:**

```
 src/web/client/common.ts                         |  21 ++++++--
 src/web/client/editor-toggle.test.ts             | 381 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor-toggle.ts                  | 241 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor.css                        |  18 +++++++
 src/web/client/main.ts                           | 176 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/web/client/map.css                           |  27 +++++++++++
 src/web/client/notice.ts                         |   5 ++
 src/web/client/parties.test.ts                   |  50 +++++++++++++++++--
 src/web/client/parties.ts                        |  51 +++++++++++++++++---
 src/web/client/party-layer-draw.isolated.test.ts |  24 +++++++++
 src/web/client/party-layer.ts                    |  25 ++++++++--
 src/web/client/stop-report-layer.ts              |  12 +++--
 12 files changed, 996 insertions(+), 35 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/editor-toggle.test.ts src/web/client/parties.test.ts src/web/client/party-layer-draw.isolated.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 868ec575cc58ebcd8b5f9a9ac2676e5c41998f59 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 4: "Edit regions" turns the editor on over the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index 8722061e6d614e61320fcfca2334368b7e61c650..fd485c75672486825719bb21c2820b590e3ce862 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -217,11 +217,16 @@ export async function whoIsAsking(guild: string): Promise<Me> {
   }
 }
 
-/** The header's account: the login, or the member's name with Log out, and what they may not. */
+/**
+ * The header's account: the login, or the member's name with Log out, and what they may not.
+ * `items`: what its menu holds before Log out for the member (the map's "Edit regions", plan
+ * 8M-10); a press of one closes the menu.
+ */
 export async function showAccount(
   guild: string,
   login: 'discord' | 'links',
   page: WebPage,
+  items: (me: Me) => HTMLElement[] = () => [],
 ): Promise<Me> {
   const account = byId('account');
   const me = await whoIsAsking(guild);
@@ -275,10 +280,16 @@ export async function showAccount(
     menu.className = 'account-menu';
     const summary = document.createElement('summary');
     summary.append(name);
-    const items = document.createElement('div');
-    items.className = 'menu';
-    items.append(logout);
-    menu.append(summary, items);
+    const held = document.createElement('div');
+    held.className = 'menu';
+    for (const item of items(me)) {
+      item.addEventListener('click', () => {
+        menu.open = false;
+      });
+      held.append(item);
+    }
+    held.append(logout);
+    menu.append(summary, held);
     document.addEventListener('keydown', (event) => {
       if (event.key === 'Escape') menu.open = false;
     });
diff --git a/src/web/client/editor-toggle.test.ts b/src/web/client/editor-toggle.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a149f8242531aefcba9685d2ed4b168290672550
--- /dev/null
+++ b/src/web/client/editor-toggle.test.ts
@@ -0,0 +1,381 @@
+import { describe, expect, it } from 'vitest';
+import {
+  CLOSE_FORM_FIRST,
+  EDITOR_FAILED,
+  type EditorMount,
+  type EditorOpened,
+  type EditorOpening,
+  type MapView,
+} from './editor-mount.js';
+import {
+  addressWith,
+  editorByAddress,
+  EditorToggle,
+  editingAsked,
+  editingOffered,
+  loadOnce,
+  NARROW_WORDS,
+  type FilesDocument,
+} from './editor-toggle.js';
+import type { Me } from './notice.js';
+
+const ME: Me = { loggedIn: true, name: 'Brock', csrf: 't', member: true, readOnly: false };
+const VIEW: MapView = { lat: 40.44, lon: -79.95, zoom: 14 };
+
+describe("the region editor's address (plan 8M-10, C5)", () => {
+  it('is asked for by ?edit=regions alone', () => {
+    expect(editingAsked('?edit=regions')).toBe(true);
+    expect(editingAsked('?region=3&edit=regions')).toBe(true);
+    expect(editingAsked('')).toBe(false);
+    expect(editingAsked('?edit=raids')).toBe(false);
+    expect(editingAsked('?edits=regions')).toBe(false);
+  });
+
+  it('is kept in the address while the editor is on, and dropped when it is off', () => {
+    expect(addressWith('/s/1/map', '', '', true)).toBe('/s/1/map?edit=regions');
+    expect(addressWith('/s/1/map', '?edit=regions', '', true)).toBe('/s/1/map?edit=regions');
+    expect(addressWith('/s/1/map', '?edit=regions', '#x', false)).toBe('/s/1/map#x');
+    expect(addressWith('/s/1/map', '?a=1&edit=regions', '', false)).toBe('/s/1/map?a=1');
+  });
+});
+
+describe('who is offered "Edit regions" (C1, C6)', () => {
+  it('is staff by the hint, on a wide screen', () => {
+    expect(editingOffered({ ...ME, mayEditRegions: true }, true)).toBe(true);
+    expect(editingOffered({ ...ME, mayEditRegions: true }, false)).toBe(false);
+    expect(editingOffered({ ...ME, mayEditRegions: false }, true)).toBe(false);
+    expect(editingOffered(ME, true)).toBe(false);
+    expect(editingOffered({ loggedIn: false }, true)).toBe(false);
+  });
+});
+
+/** A page of a script and a stylesheet loading, as the test lets them. */
+function filesPage() {
+  const appended: FakeFile[] = [];
+  class FakeFile {
+    src = '';
+    href = '';
+    rel = '';
+    removed = false;
+    private readonly listeners = new Map<string, Array<() => void>>();
+    constructor(readonly tag: string) {}
+    addEventListener(type: string, listener: () => void): void {
+      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+    }
+    remove(): void {
+      this.removed = true;
+    }
+    fire(type: 'load' | 'error'): void {
+      for (const listener of this.listeners.get(type) ?? []) listener();
+    }
+  }
+  const doc = {
+    createElement: (tag: string) => new FakeFile(tag),
+    head: {
+      append: (file: FakeFile) => {
+        appended.push(file);
+      },
+    },
+  };
+  return { doc: doc as unknown as FilesDocument, appended };
+}
+
+const FILES = { script: '/assets/e.js', style: '/assets/e.css' };
+const MOUNT: EditorMount = {
+  open: () => Promise.resolve({ ok: true }),
+  close: () => undefined,
+};
+
+describe("the editor's files (C3)", () => {
+  it('are added once, and give the mount once both came', async () => {
+    const { doc, appended } = filesPage();
+    const load = loadOnce(doc, FILES, () => MOUNT);
+    const first = load();
+    const second = load();
+    expect(appended.map((file) => [file.tag, file.src || file.href])).toEqual([
+      ['link', '/assets/e.css'],
+      ['script', '/assets/e.js'],
+    ]);
+    expect(appended[0]?.rel).toBe('stylesheet');
+    appended[1]?.fire('load');
+    appended[0]?.fire('load');
+    expect(await first).toBe(MOUNT);
+    expect(await second).toBe(MOUNT);
+    expect(await load()).toBe(MOUNT);
+    expect(appended).toHaveLength(2);
+  });
+
+  it('wait for the stylesheet before the editor shows: its failure fails a loaded script', async () => {
+    const { doc, appended } = filesPage();
+    const load = loadOnce(doc, FILES, () => MOUNT);
+    const loading = load();
+    appended[1]?.fire('load');
+    appended[0]?.fire('error');
+    await expect(loading).rejects.toThrow();
+  });
+
+  it('take the one that failed away, and add only it again at the next press', async () => {
+    const { doc, appended } = filesPage();
+    const load = loadOnce(doc, FILES, () => MOUNT);
+    const failed = load();
+    appended[1]?.fire('load');
+    appended[0]?.fire('error');
+    await expect(failed).rejects.toThrow();
+    expect(appended.map((file) => [file.tag, file.removed])).toEqual([
+      ['link', true],
+      ['script', false],
+    ]);
+    const again = load();
+    // The script ran once: only the stylesheet is added again.
+    expect(appended.map((file) => file.tag)).toEqual(['link', 'script', 'link']);
+    appended[2]?.fire('load');
+    expect(await again).toBe(MOUNT);
+  });
+
+  it('add the script again when it loaded but did not register', async () => {
+    const { doc, appended } = filesPage();
+    const registry: { mount?: EditorMount } = {};
+    const load = loadOnce(doc, FILES, () => registry.mount);
+    const failed = load();
+    appended[0]?.fire('load');
+    appended[1]?.fire('load');
+    await expect(failed).rejects.toThrow();
+    expect(appended[1]?.removed).toBe(true);
+    const again = load();
+    expect(appended.map((file) => file.tag)).toEqual(['link', 'script', 'script']);
+    registry.mount = MOUNT;
+    appended[2]?.fire('load');
+    expect(await again).toBe(MOUNT);
+  });
+});
+
+/** A promise and what settles it, for the test to settle. */
+function settled<T>(): { promise: Promise<T>; resolve(value: T): void } {
+  let resolve: (value: T) => void = () => undefined;
+  const promise = new Promise<T>((done) => {
+    resolve = done;
+  });
+  return { promise, resolve };
+}
+
+/**
+ * A toggle over a mount of the test's: its openings (`opened` settles at each), and the page's
+ * side as calls. By default the mount answers when the test says (`answer`); `open` replaces it.
+ */
+function toggleWith(
+  options: {
+    held?: () => boolean;
+    noMount?: boolean;
+    open?: (opening: EditorOpening) => Promise<EditorOpened>;
+  } = {},
+) {
+  const calls: string[] = [];
+  const openings: EditorOpening[] = [];
+  const came: Array<ReturnType<typeof settled<EditorOpening>>> = [];
+  const coming = (index: number) => (came[index] ??= settled<EditorOpening>());
+  let answer: (opened: EditorOpened) => void = () => undefined;
+  const mount: EditorMount = {
+    open(opening) {
+      coming(openings.length).resolve(opening);
+      openings.push(opening);
+      if (options.open) return options.open(opening);
+      return new Promise((resolve) => {
+        answer = resolve;
+      });
+    },
+    close() {
+      calls.push('close');
+      return { lat: 40.5, lon: -80, zoom: 9 };
+    },
+  };
+  const toggle = new EditorToggle({
+    held: () => options.held?.() ?? false,
+    mount: () =>
+      options.noMount === true ? Promise.reject(new Error('no file')) : Promise.resolve(mount),
+    opening: () => ({
+      hosts: {} as EditorOpening['hosts'],
+      guild: '1',
+      me: ME,
+      worker: '/assets/w.js',
+      units: 'imperial',
+      tiles: 'osm',
+      googleKey: undefined,
+      view: VIEW,
+    }),
+    // The focus moved, or left where the member is (review 2, R1).
+    shown: (on, focus) => {
+      calls.push(`${on ? 'shown' : 'live'}${focus ? '' : ' (focus left)'}`);
+    },
+    handBack: (view) => {
+      calls.push(`back ${view?.zoom ?? 'none'}`);
+    },
+    say: (text) => {
+      calls.push(`say ${text}`);
+    },
+  });
+  return {
+    toggle,
+    calls,
+    openings,
+    /** The `index`th opening of the editor, once the toggle opened it. */
+    opened: (index = 0) => coming(index).promise,
+    answer: (opened: EditorOpened) => {
+      answer(opened);
+    },
+  };
+}
+
+describe('turning the editor on and off (C4, C8)', () => {
+  it('opens the editor at the live map’s view, shown once its data came', async () => {
+    const made = toggleWith();
+    const on = made.toggle.turnOn();
+    const opening = await made.opened();
+    expect(opening.view).toEqual(VIEW);
+    expect(made.calls).toEqual([]);
+    expect(opening.show()).toBe(true);
+    made.answer({ ok: true });
+    await on;
+    expect(made.calls).toEqual(['shown']);
+    expect(made.toggle.on).toBe(true);
+    // A second press meanwhile opens nothing more.
+    await made.toggle.turnOn();
+    expect(made.openings).toHaveLength(1);
+  });
+
+  it('turns off by the server’s words when the data was refused', async () => {
+    const made = toggleWith();
+    const on = made.toggle.turnOn();
+    await made.opened();
+    made.answer({ ok: false, words: 'Only staff of this server may edit its regions.' });
+    await on;
+    // Nothing was shown: the focus stays where the member is (review 2, R1).
+    expect(made.calls).toEqual([
+      'live (focus left)',
+      'say Only staff of this server may edit its regions.',
+    ]);
+    expect(made.toggle.on).toBe(false);
+  });
+
+  it('is refused while a form holds, and says so', async () => {
+    const made = toggleWith({ held: () => true });
+    await made.toggle.turnOn();
+    expect(made.openings).toEqual([]);
+    expect(made.calls).toEqual([`say ${CLOSE_FORM_FIRST}`]);
+  });
+
+  it('is not shown over a form opened while it loaded, and says so', async () => {
+    let held = false;
+    const made = toggleWith({ held: () => held });
+    const on = made.toggle.turnOn();
+    const opening = await made.opened();
+    held = true;
+    expect(opening.show()).toBe(false);
+    made.answer({ ok: false, words: CLOSE_FORM_FIRST });
+    await on;
+    expect(made.calls).toEqual(['live (focus left)', `say ${CLOSE_FORM_FIRST}`]);
+    expect(made.toggle.on).toBe(false);
+  });
+
+  it('says so when its files could not be loaded', async () => {
+    const made = toggleWith({ noMount: true });
+    await made.toggle.turnOn();
+    expect(made.calls).toEqual(['live (focus left)', `say ${EDITOR_FAILED}`]);
+    expect(made.toggle.on).toBe(false);
+  });
+
+  it('closes the editor it showed when the opening then failed, and can be turned on again', async () => {
+    let fail = true;
+    const made = toggleWith({
+      open: (opening) => {
+        opening.show();
+        return fail ? Promise.reject(new Error('no map')) : Promise.resolve({ ok: true });
+      },
+    });
+    await made.toggle.turnOn();
+    expect(made.calls).toEqual(['shown', 'close', 'live', `say ${EDITOR_FAILED}`]);
+    expect(made.toggle.on).toBe(false);
+    fail = false;
+    await made.toggle.turnOn();
+    expect(made.toggle.on).toBe(true);
+  });
+
+  it('closes the editor it showed when the editor said it could not open', async () => {
+    const made = toggleWith({
+      open: (opening) => {
+        opening.show();
+        return Promise.resolve({ ok: false, words: EDITOR_FAILED });
+      },
+    });
+    await made.toggle.turnOn();
+    expect(made.calls).toEqual(['shown', 'close', 'live', `say ${EDITOR_FAILED}`]);
+  });
+
+  it('turned off, shows the live map and hands it the editor’s view', async () => {
+    const made = toggleWith();
+    const on = made.toggle.turnOn();
+    (await made.opened()).show();
+    made.answer({ ok: true });
+    await on;
+    made.toggle.turnOff();
+    expect(made.calls).toEqual(['shown', 'close', 'live', 'back 9']);
+    expect(made.toggle.on).toBe(false);
+    made.toggle.turnOff();
+    expect(made.calls).toHaveLength(4);
+  });
+});
+
+describe('the editor asked for by the address (C5)', () => {
+  /** The page's side of `editorByAddress`, as calls. */
+  function addressPage(wide: boolean) {
+    const calls: string[] = [];
+    return {
+      calls,
+      page: {
+        wide: () => wide,
+        turnOn: () => {
+          calls.push('on');
+        },
+        leave: () => {
+          calls.push('leave');
+        },
+        say: (text: string) => {
+          calls.push(`say ${text}`);
+        },
+      },
+    };
+  }
+
+  it('turns the editor on once the map is loaded', async () => {
+    const { calls, page } = addressPage(true);
+    await editorByAddress(true, [Promise.resolve()], page);
+    expect(calls).toEqual(['on']);
+  });
+
+  it('waits for what it is given before it turns the editor on', async () => {
+    const { calls, page } = addressPage(true);
+    const map = settled<undefined>();
+    const done = editorByAddress(true, [map.promise], page);
+    expect(calls).toEqual([]);
+    map.resolve(undefined);
+    await done;
+    expect(calls).toEqual(['on']);
+  });
+
+  it('turns the editor on also when the live map could not be loaded', async () => {
+    const { calls, page } = addressPage(true);
+    await editorByAddress(true, [Promise.reject(new Error('no geo')), Promise.resolve()], page);
+    expect(calls).toEqual(['on']);
+  });
+
+  it('on a narrow screen leaves the address and says why', async () => {
+    const { calls, page } = addressPage(false);
+    await editorByAddress(true, [Promise.reject(new Error('no geo'))], page);
+    expect(calls).toEqual(['leave', `say ${NARROW_WORDS}`]);
+  });
+
+  it('does nothing when the address does not ask', async () => {
+    const { calls, page } = addressPage(true);
+    await editorByAddress(false, [Promise.resolve()], page);
+    expect(calls).toEqual([]);
+  });
+});
diff --git a/src/web/client/editor-toggle.ts b/src/web/client/editor-toggle.ts
new file mode 100644
index 0000000000000000000000000000000000000000..96e2320017ca45f377e65785dea17c74fcf1dea0
--- /dev/null
+++ b/src/web/client/editor-toggle.ts
@@ -0,0 +1,241 @@
+import { EDIT_QUERY_NAME, EDIT_QUERY_VALUE } from '../../domain/web/editor-address.js';
+import {
+  CLOSE_FORM_FIRST,
+  EDITOR_FAILED,
+  type EditorMount,
+  type EditorOpened,
+  type EditorOpening,
+  type MapView,
+} from './editor-mount.js';
+import type { Me } from './notice.js';
+
+/**
+ * The region editor as a toggle of the map (plan 8M-10): whether the address asks for it, who is
+ * offered "Edit regions", its files loaded once, and turning it on and off. Pure but for the
+ * page's parts it is handed; `main.ts` wires it.
+ */
+
+/** Said when the editor is asked for on a screen narrower than the header's row (C6). */
+export const NARROW_WORDS = 'Edit regions on a wider screen (1024 pixels or more).';
+/** The narrowest screen the editor is offered on: where the header's row of layers shows. */
+export const EDITOR_MIN_WIDTH = '(min-width: 1024px)';
+
+/** Whether the address asks for the editor (`?edit=regions`, C5). */
+export function editingAsked(search: string): boolean {
+  return new URLSearchParams(search).getAll(EDIT_QUERY_NAME).includes(EDIT_QUERY_VALUE);
+}
+
+/** The address with `?edit=regions` while the editor is on, without it when it is off. */
+export function addressWith(pathname: string, search: string, hash: string, on: boolean): string {
+  const query = new URLSearchParams(search);
+  query.delete(EDIT_QUERY_NAME);
+  if (on) query.set(EDIT_QUERY_NAME, EDIT_QUERY_VALUE);
+  const rest = query.toString();
+  return `${pathname}${rest === '' ? '' : `?${rest}`}${hash}`;
+}
+
+/**
+ * Whether "Edit regions" is offered: to a member `/api/me` says may edit the server's regions (a
+ * hint, C1: the editor's data asks Discord and decides), on a screen of the header's row (C6).
+ */
+export function editingOffered(me: Me, wide: boolean): boolean {
+  return wide && me.loggedIn && me.mayEditRegions === true;
+}
+
+/**
+ * `/s/<guild>/regions/edit` led to the map (C5): once what it `waits` for settled, whether it
+ * loaded or not (review 1, F8: the editor does not need the live map's layers), the editor turned
+ * on, whatever the hint says (its data decides), on a screen of the header's row; narrower, the
+ * address left and why said (C6).
+ */
+export async function editorByAddress(
+  asked: boolean,
+  waits: readonly Promise<unknown>[],
+  page: {
+    wide(): boolean;
+    turnOn(): void;
+    /** Drops `?edit=regions` from the address. */
+    leave(): void;
+    say(text: string): void;
+  },
+): Promise<void> {
+  await Promise.allSettled(waits);
+  if (!asked) return;
+  if (page.wide()) page.turnOn();
+  else {
+    page.leave();
+    page.say(NARROW_WORDS);
+  }
+}
+
+/** What the loader needs of the document. */
+export interface FilesDocument {
+  createElement(tag: 'link'): HTMLLinkElement;
+  createElement(tag: 'script'): HTMLScriptElement;
+  head: { append(node: Node): void };
+}
+
+/**
+ * One file added to the head once: loaded when its `load` came and `ready` says so; when it
+ * failed (or loaded but is not ready) it is taken away again, and the next call adds it anew.
+ */
+function fileOnce(
+  doc: FilesDocument,
+  make: () => HTMLLinkElement | HTMLScriptElement,
+  ready: () => boolean,
+): () => Promise<void> {
+  let loading: Promise<void> | undefined;
+  return () => {
+    if (loading) return loading;
+    const file = make();
+    const loaded = new Promise<void>((resolve, reject) => {
+      file.addEventListener('load', () => {
+        if (ready()) resolve();
+        else reject(new Error('the region editor did not register'));
+      });
+      file.addEventListener('error', () => {
+        reject(new Error("could not load the region editor's files"));
+      });
+    });
+    doc.head.append(file);
+    loading = loaded.catch((err: unknown) => {
+      file.remove();
+      loading = undefined;
+      throw err;
+    });
+    return loading;
+  };
+}
+
+/**
+ * Loads the editor's stylesheet and script once (C3): both added to the head at the first call,
+ * done when both loaded and the script registered its mount (`registered`), whose mount it
+ * gives (the stylesheet waited for, so that nothing is drawn unstyled); a later call is the same
+ * load. Each file is kept or tried again on its own (review 1, F6): one that failed, or a script
+ * that loaded but did not register, is taken away and added anew at the next call; a file that
+ * loaded is never added twice (the script would run again).
+ */
+export function loadOnce<T>(
+  doc: FilesDocument,
+  files: { script: string; style: string },
+  registered: () => T | undefined,
+): () => Promise<T> {
+  const style = fileOnce(
+    doc,
+    () => {
+      const link = doc.createElement('link');
+      link.rel = 'stylesheet';
+      link.href = files.style;
+      return link;
+    },
+    () => true,
+  );
+  const script = fileOnce(
+    doc,
+    () => {
+      const tag = doc.createElement('script');
+      tag.src = files.script;
+      return tag;
+    },
+    () => registered() !== undefined,
+  );
+  return async () => {
+    await Promise.all([style(), script()]);
+    const mount = registered();
+    if (mount === undefined) throw new Error('the region editor did not register');
+    return mount;
+  };
+}
+
+/** What the toggle needs of the page. */
+export interface ToggleDeps {
+  /** Whether a form of the map holds (`FormHold`, route mode, Meet…, a report's step 2). */
+  held(): boolean;
+  /** The editor's mount, its files loaded first (once). */
+  mount(): Promise<EditorMount>;
+  /** What the editor is opened with now (the live map's view among it). */
+  opening(): Omit<EditorOpening, 'show'>;
+  /**
+   * The page with the editor on (its hosts, the address, the pollers paused) or off (the live
+   * map's parts back as they were); either may be asked again for the state it is in. `focus`:
+   * whether the focus moves to where the member goes on ("Back to the map", or the account's
+   * menu); never on a refusal before the editor was shown (review 2, R1), which leaves it where
+   * the member is (a form being typed in, Find).
+   */
+  shown(on: boolean, focus: boolean): void;
+  /** The live map takes the editor's view (clamped by its own limits). */
+  handBack(view: MapView | undefined): void;
+  say(text: string): void;
+}
+
+/**
+ * The editor on or off (C4, C8): on, refused while a form holds, at the press and again when it
+ * would be shown; its files loaded, its data asked fresh, the page shown with it only once the
+ * data came; a refusal of the data said in the server's words, a failure as `EDITOR_FAILED`, the
+ * page left as the live map (the editor closed when it was shown). Off, the editor closed and the
+ * live map shown, at the editor's view.
+ */
+export class EditorToggle {
+  private state: 'off' | 'opening' | 'on' = 'off';
+  private mount: EditorMount | undefined;
+
+  constructor(private readonly deps: ToggleDeps) {}
+
+  get on(): boolean {
+    return this.state === 'on';
+  }
+
+  async turnOn(): Promise<void> {
+    const { deps } = this;
+    if (this.state !== 'off') return;
+    if (deps.held()) {
+      deps.say(CLOSE_FORM_FIRST);
+      return;
+    }
+    this.state = 'opening';
+    // Whether the editor's hosts were shown, and whether a form opened while it loaded (F4).
+    let shown = false;
+    let heldMeanwhile = false;
+    let opened: EditorOpened;
+    try {
+      const mount = await deps.mount();
+      this.mount = mount;
+      opened = await mount.open({
+        ...deps.opening(),
+        show: () => {
+          if (deps.held()) {
+            heldMeanwhile = true;
+            return false;
+          }
+          shown = true;
+          deps.shown(true, true);
+          return true;
+        },
+      });
+    } catch {
+      // Its files, the page's parts or the editor failed (review 1, F1): never left half on.
+      opened = { ok: false, words: EDITOR_FAILED };
+    }
+    if (opened.ok) {
+      this.state = 'on';
+      return;
+    }
+    if (shown) this.mount?.close();
+    this.refused(heldMeanwhile ? CLOSE_FORM_FIRST : opened.words, shown);
+  }
+
+  turnOff(): void {
+    if (this.state !== 'on') return;
+    const view = this.mount?.close();
+    this.state = 'off';
+    this.deps.shown(false, true);
+    this.deps.handBack(view);
+  }
+
+  /** Off with `words` said; the focus moved only when the editor had been shown (R1). */
+  private refused(words: string, wasShown: boolean): void {
+    this.state = 'off';
+    this.deps.shown(false, wasShown);
+    this.deps.say(words);
+  }
+}
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index 45da466a6e76862c14b01a01f30df5078f1b35de..91df9ac17185b5bb420eaa088ee9882b17f7674c 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -5,12 +5,30 @@
  * when the editor is first turned on, so it imports neither the map's sheet nor the theme again.
  */
 
+/* The tool row in the place of the layers' row, led by "Back to the map" (plan 8M-10, C7). */
+#editor-bar,
 #editor-tools {
   display: flex;
   flex-wrap: wrap;
+  align-items: center;
   gap: 6px;
 }
 
+#editor-back {
+  color: var(--on-color);
+  background: var(--primary);
+  border: 0;
+  border-radius: var(--radius);
+  padding: 4px 10px;
+  font: inherit;
+  font-weight: 500;
+  cursor: pointer;
+}
+
+#editor-back:hover {
+  background: var(--primary-hover);
+}
+
 #editor-tools button,
 #editor-panel button {
   color: var(--secondary-text);
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index d9b4aaeb79b120c25e8194573c3b43c10c945bf4..a48798d11baa7e8ea0115b3cc97f53cea031035d 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -1,11 +1,22 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import { addTiles, byId, getJson, say, showAccount, tileSetting } from './common.js';
+import {
+  addressWith,
+  editorByAddress,
+  EditorToggle,
+  editingAsked,
+  editingOffered,
+  EDITOR_MIN_WIDTH,
+  loadOnce,
+  NARROW_WORDS,
+} from './editor-toggle.js';
 import { showGymDots, type GymDots } from './gyms-ui.js';
 import { LayerRegistry, MAP_LAYERS, regionLabelsShown } from './layer-registry.js';
 import { showLayerControls } from './layers-ui.js';
 import { loggedOutPane } from './list-ui.js';
-import { loginNotice, loginNoticeFor } from './notice.js';
+import { loginNotice, loginNoticeFor, type Me } from './notice.js';
+import { MapActivity } from './parties.js';
 import { showParties } from './party-layer.js';
 import { quietLine, showPlaces, type PlacesHooks } from './places-ui.js';
 import { regionLabel, renderNode, type MapGym } from './popup.js';
@@ -154,6 +165,114 @@ async function showGeo(
   };
 }
 
+/** Said when the live map's data could not be loaded. */
+const MAP_FAILED = 'The map could not be loaded. Try again in a moment.';
+
+/** Whether the live map's data failed to load (review 2, R3): its line is not lost. */
+interface MapLoad {
+  failed: boolean;
+}
+
+/**
+ * A line of the editor's toggle over the live map (a refusal, a screen too narrow), with the
+ * live map's failure to load after it while that holds (review 2, R3): one line replaces the
+ * other on the page.
+ */
+function sayOverMap(text: string, load: MapLoad): void {
+  say(load.failed ? `${text} ${MAP_FAILED}` : text);
+}
+
+/**
+ * The region editor as a toggle of the map (plan 8M-10): "Edit regions" in the account's menu
+ * for a member `/api/me` says may edit them, on a screen of the header's row; on, the live map's
+ * parts make way for the editor's (its own map, tools and panel, loaded the first time), nothing
+ * is polled, and the address says `?edit=regions`; "Back to the map" turns it off at its view.
+ * Whether a form holds is the parties' to say, once they are drawn.
+ */
+function editorToggle(
+  map: L.Map,
+  guild: string,
+  activity: MapActivity,
+  account: { me: Me; held: () => boolean },
+  load: MapLoad,
+): EditorToggle {
+  const data = document.body.dataset;
+  const back = byId('editor-back') as HTMLButtonElement;
+  const toggle = new EditorToggle({
+    held: () => account.held(),
+    mount: loadOnce(
+      document,
+      { script: data.editorScript ?? '', style: data.editorStyle ?? '' },
+      () => window.pineRegionEditor,
+    ),
+    opening: () => {
+      const center = map.getCenter();
+      return {
+        hosts: {
+          map: byId('editor-map'),
+          tools: byId('editor-tools'),
+          panel: byId('editor-panel'),
+          back,
+        },
+        guild,
+        me: account.me,
+        worker: data.worker ?? '',
+        units: data.distanceUnits === 'metric' ? 'metric' : 'imperial',
+        tiles: tileSetting(data.tiles),
+        googleKey: data.googleKey,
+        view: { lat: center.lat, lon: center.lng, zoom: map.getZoom() },
+      };
+    },
+    shown: (on, focus) => {
+      // A line of one side is not left over the other (review 1, F3); back on the live map, its
+      // failure to load is said again (review 2, R3).
+      const notice = byId('notice');
+      notice.textContent = '';
+      notice.hidden = true;
+      if (!on && load.failed) say(MAP_FAILED);
+      document.body.classList.toggle('editing-regions', on);
+      for (const id of ['editor-bar', 'editor-map', 'editor-panel']) byId(id).hidden = !on;
+      history.replaceState(
+        null,
+        '',
+        addressWith(location.pathname, location.search, location.hash, on),
+      );
+      activity.setEditing(on);
+      if (!on) map.invalidateSize();
+      // The focus where the member goes on (F7): "Back to the map", or the account's menu; left
+      // where it is on a refusal before the editor was shown (review 2, R1).
+      if (!focus) return;
+      if (on) back.focus();
+      else document.querySelector<HTMLElement>('#account summary')?.focus();
+    },
+    // Leaflet's `setView` keeps the view within the live map's own limits (its least zoom and
+    // its bounds).
+    handBack: (view) => {
+      if (view) map.setView([view.lat, view.lon], view.zoom, { animate: false });
+    },
+    say: (text) => {
+      sayOverMap(text, load);
+    },
+  });
+  back.addEventListener('click', () => {
+    toggle.turnOff();
+  });
+  return toggle;
+}
+
+/** The account menu's "Edit regions" (plan 8M-10, C7): shown on a screen of the header's row. */
+function editItem(toggle: EditorToggle, load: MapLoad): HTMLElement {
+  const item = document.createElement('button');
+  item.type = 'button';
+  item.className = 'edit-regions';
+  item.textContent = 'Edit regions';
+  item.addEventListener('click', () => {
+    if (window.matchMedia(EDITOR_MIN_WIDTH).matches) void toggle.turnOn();
+    else sayOverMap(NARROW_WORDS, load);
+  });
+  return item;
+}
+
 function start(): void {
   const data = document.body.dataset;
   const guild = data.guild ?? '';
@@ -165,12 +284,25 @@ function start(): void {
   if (notice) {
     history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
   }
+  // Whether the live map is in use (plan 8M-10): visible, and the region editor off.
+  const activity = new MapActivity(() => document.visibilityState === 'visible');
+  document.addEventListener('visibilitychange', () => {
+    activity.changed();
+  });
+  const asker: { me: Me; held: () => boolean } = { me: { loggedIn: false }, held: () => false };
+  const load: MapLoad = { failed: false };
+  const toggle = editorToggle(map, guild, activity, asker, load);
   // The layers (plan 8M-7): the member's choice kept per browser.
   const registry = new LayerRegistry(browserStorage());
   for (const layer of MAP_LAYERS) registry.register(layer);
   const controls = showLayerControls(registry, byId('layers'));
   const quiet = quietLine(map);
-  const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map');
+  const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map', (me) =>
+    editingOffered(me, window.matchMedia(EDITOR_MIN_WIDTH).matches) ? [editItem(toggle, load)] : [],
+  ).then((me) => {
+    asker.me = me;
+    return me;
+  });
   void account.then((me) => {
     const text = loginNoticeFor(notice, me);
     if (text !== undefined) say(text);
@@ -210,8 +342,8 @@ function start(): void {
       searchButton.focus();
     }
   });
-  showGeo(map, guild, you, registry)
-    .then(async ({ gyms, names, regions, dots }) => {
+  const loading = showGeo(map, guild, you, registry).then(
+    async ({ gyms, names, regions, dots }) => {
       // The parties of the server for a member who is logged in (plan 8M-3); while Discord
       // cannot be reached the server says whether it still knows them as a member. A member
       // may report raids at gyms (plan 8M-4) and spawns at any point (plan 8M-4S), not while
@@ -308,7 +440,11 @@ function start(): void {
         routeMode: (on) => {
           routeFocus.set(on);
         },
+        // Nothing polled while the region editor is on (plan 8M-10).
+        activity,
       });
+      // "Edit regions" is refused while a form of the map holds (plan 8M-10, C8).
+      asker.held = () => raids.editing();
       gymExtras.editing = () => raids.editing();
       gymExtras.of = (gym) => raids.gymControls(gym);
       gymExtras.clicked = (gym) => raids.gymClicked(gym);
@@ -331,12 +467,32 @@ function start(): void {
         raids.gymTapped(gym, own);
       };
       dots.refresh();
-    })
-    .catch(() => {
-      // Leaflet draws nothing until the map has a view.
-      if (!map.getZoom()) map.setView([40.44, -79.99], 11);
-      say('The map could not be loaded. Try again in a moment.');
-    });
+    },
+  );
+  const loaded = loading.catch(() => {
+    // Leaflet draws nothing until the map has a view.
+    if (!map.getZoom()) map.setView([40.44, -79.99], 11);
+    load.failed = true;
+    say(MAP_FAILED);
+  });
+  // `/s/<guild>/regions/edit` led here (plan 8M-10, C5): once the map is drawn or could not be
+  // (review 1, F8: the editor opens at its view either way), and the member is known.
+  void editorByAddress(editingAsked(location.search), [loaded, account], {
+    wide: () => window.matchMedia(EDITOR_MIN_WIDTH).matches,
+    turnOn: () => {
+      void toggle.turnOn();
+    },
+    leave: () => {
+      history.replaceState(
+        null,
+        '',
+        addressWith(location.pathname, location.search, location.hash, false),
+      );
+    },
+    say: (text) => {
+      sayOverMap(text, load);
+    },
+  });
 }
 
 start();
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 3c5507e21de550f16829fb8e33b235d0a81227e3..43e7211386b6bbfa3a90d9163f12413f9e5b2b79 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -151,6 +151,33 @@ a {
   border-radius: var(--card-radius);
   background: var(--card-bg);
   box-shadow: 0 8px 24px var(--shadow);
+  /* "Edit regions" above Log out (plan 8M-10). */
+  display: flex;
+  flex-direction: column;
+  align-items: stretch;
+  gap: 6px;
+}
+
+/* "Edit regions" only where the header's row shows (plan 8M-10, C6). */
+@media (max-width: 1023px) {
+  .account-menu .edit-regions {
+    display: none;
+  }
+}
+
+/*
+ * The region editor on (plan 8M-10): the live map's parts make way for the editor's own (its
+ * map, tool row and panel, styled by `editor.css`), which are `hidden` while it is off.
+ */
+body.editing-regions #map,
+body.editing-regions #parties,
+body.editing-regions #layers,
+body.editing-regions #list-button,
+body.editing-regions #search-button,
+body.editing-regions #report-button,
+body.editing-regions #filter,
+body.editing-regions .edit-regions {
+  display: none !important;
 }
 
 /* Narrower than 768 pixels the title is "Pine" (fix round 1). */
diff --git a/src/web/client/notice.ts b/src/web/client/notice.ts
index 9066b0d314bc88a6470dafcf9448f9df581fa5cc..41bb43453e495d31a3dcadca73bc6dabd4c73a3f 100644
--- a/src/web/client/notice.ts
+++ b/src/web/client/notice.ts
@@ -12,6 +12,11 @@ export type Me =
        * role's name, which they need to join and report on the map.
        */
       missingRole?: string;
+      /**
+       * Whether "Edit regions" is offered (plan 8M-10): a hint by what Pine knows of the member;
+       * the editor's data asks Discord and decides.
+       */
+      mayEditRegions?: boolean;
     };
 
 /** What `?login=` may say; a `Map`, so that no name of `Object.prototype` is one of them. */
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 279732a2776264bf27f7337c9c7c29efba3e2f69..0667b1b0228563bc070cebeb071a9a415f6887ff 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -17,6 +17,7 @@ import {
   meetupPopup,
   partiesAtKey,
   raidsDrawn,
+  MapActivity,
   Poller,
   PRESS_FAILED,
   pressLabel,
@@ -741,7 +742,7 @@ function pollerWith(answer: () => 'go' | 'stop' = () => 'go') {
       loads += 1;
       return Promise.resolve(answer());
     },
-    visible: () => visible,
+    active: () => visible,
     setTimer: (run, ms) => {
       const timer = { run, ms, cancelled: false };
       timers.push(timer);
@@ -783,10 +784,10 @@ describe('Poller', () => {
     const made = pollerWith();
     await made.poller.start();
     made.setVisible(false);
-    made.poller.visibilityChanged();
+    made.poller.activeChanged();
     expect(made.pending()).toEqual([]);
     made.setVisible(true);
-    made.poller.visibilityChanged();
+    made.poller.activeChanged();
     await made.poller.idle();
     expect(made.loads()).toBe(2);
     expect(made.pending()).toHaveLength(1);
@@ -804,8 +805,49 @@ describe('Poller', () => {
     const made = pollerWith(() => 'stop');
     await made.poller.start();
     expect(made.pending()).toEqual([]);
-    made.poller.visibilityChanged();
+    made.poller.activeChanged();
     await made.poller.idle();
     expect(made.loads()).toBe(1);
   });
 });
+
+describe('MapActivity (plan 8M-10, C9)', () => {
+  it('is active while the page is visible and the region editor is off', () => {
+    let visible = true;
+    const activity = new MapActivity(() => visible);
+    const told: boolean[] = [];
+    activity.onChange(() => told.push(activity.active()));
+    expect(activity.active()).toBe(true);
+    activity.setEditing(true);
+    expect(told).toEqual([false]);
+    // Shown again while the editor is on: still nothing to ask for.
+    activity.changed();
+    expect(told).toEqual([false, false]);
+    activity.setEditing(true);
+    expect(told).toHaveLength(2);
+    visible = false;
+    activity.setEditing(false);
+    expect(told).toEqual([false, false, false]);
+    visible = true;
+    activity.changed();
+    expect(told).toEqual([false, false, false, true]);
+  });
+
+  it('pauses a poller while the editor is on, and asks at once when it is off', async () => {
+    let editing = false;
+    const made = pollerWith();
+    await made.poller.start();
+    const activity = new MapActivity(() => !editing);
+    activity.onChange(() => {
+      made.setVisible(activity.active());
+      made.poller.activeChanged();
+    });
+    editing = true;
+    activity.changed();
+    expect(made.pending()).toEqual([]);
+    editing = false;
+    activity.changed();
+    await made.poller.idle();
+    expect(made.loads()).toBe(2);
+  });
+});
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index bd8fecadd6afb9336054e225a822b49480149a69..45dbb52716c4c84f09b6c3cb6aacb77e54609807 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -577,20 +577,55 @@ export async function pressParty(csrf: string, steps: PressSteps): Promise<Press
   }
 }
 
+/**
+ * Whether the live map is in use (plan 8M-10, C9): the page visible and the region editor off.
+ * Its listeners (the pollers of the parties and of the reports at stops) are told at each change:
+ * the page hidden or shown (`changed`), the editor turned on or off (`setEditing`).
+ */
+export class MapActivity {
+  private editing = false;
+  private readonly listeners: Array<() => void> = [];
+
+  constructor(private readonly visible: () => boolean) {}
+
+  active(): boolean {
+    return !this.editing && this.visible();
+  }
+
+  /** The region editor turned on or off: told only when it changed. */
+  setEditing(on: boolean): void {
+    if (on === this.editing) return;
+    this.editing = on;
+    this.changed();
+  }
+
+  /** Something it depends on changed (the page hidden or shown): every listener told. */
+  changed(): void {
+    for (const listener of this.listeners) listener();
+  }
+
+  onChange(listener: () => void): void {
+    this.listeners.push(listener);
+  }
+}
+
 /** What the poller needs of the page. */
 export interface PollerDeps {
   /** Asks for the list and shows it; `stop` when there is no point in asking again. */
   load(): Promise<'go' | 'stop'>;
   everyMs: number;
-  /** Whether the page is visible (`document.visibilityState`). */
-  visible(): boolean;
+  /**
+   * Whether to ask: the page visible and the region editor off (`MapActivity`, plan 8M-10, C9).
+   */
+  active(): boolean;
   /** Starts a timer; gives what cancels it. */
   setTimer(run: () => void, ms: number): () => void;
 }
 
 /**
- * Asks for the party list (spec 3.4): at once, then every `everyMs` while the page is visible;
- * nothing while it is hidden, and at once when it is shown again; at once after a press, the
+ * Asks for the party list (spec 3.4): at once, then every `everyMs` while the page is visible
+ * (and the region editor off: `active`); nothing while it is hidden, and at once when it is shown
+ * again; at once after a press, the
  * next one `everyMs` after that. One question at a time: one asked for meanwhile follows it.
  * A `stop` ends it for good.
  */
@@ -619,9 +654,9 @@ export class Poller {
     return this.idle();
   }
 
-  /** The page was hidden or shown. */
-  visibilityChanged(): void {
-    if (!this.deps.visible()) {
+  /** The page was hidden or shown, or the region editor turned on or off. */
+  activeChanged(): void {
+    if (!this.deps.active()) {
       this.cancel?.();
       this.cancel = undefined;
       return;
@@ -650,7 +685,7 @@ export class Poller {
   }
 
   private schedule(): void {
-    if (this.stopped || !this.deps.visible() || this.cancel) return;
+    if (this.stopped || !this.deps.active() || this.cancel) return;
     this.cancel = this.deps.setTimer(() => {
       this.cancel = undefined;
       void this.now();
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 0034be11dac9926e952f512916b98cb000f9e1a1..d1a36287baf3d09c629015714fcffdfd84dca96e 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -11,6 +11,7 @@ import type { ResearchOptionsView, StopReportsView } from '../../domain/web/stop
 import { LayerRegistry, LAYERS_KEY, MAP_LAYERS } from './layer-registry.js';
 import type { MapSpot, MaxUiDeps } from './max-ui.js';
 import { showParties } from './party-layer.js';
+import { MapActivity } from './parties.js';
 import type { MapGym } from './popup.js';
 import type { RaidUiDeps } from './raid-ui.js';
 import type { RocketUiDeps } from './rocket-ui.js';
@@ -638,6 +639,8 @@ async function started(options: {
   sendsForever?: boolean;
   /** The map's zoom (16, where the PokéStops are drawn from, without it). */
   zoom?: number;
+  /** Whether the live map is in use (plan 8M-10); the page's visibility alone without it. */
+  activity?: MapActivity;
 }) {
   page.byId = new Map();
   page.active = null;
@@ -816,6 +819,7 @@ async function started(options: {
       onStops: (listener) => {
         stopListeners.push(listener);
       },
+      ...(options.activity === undefined ? {} : { activity: options.activity }),
     },
   );
   // The first list, asked for as the layer starts, drawn.
@@ -1139,6 +1143,26 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
     expect([...raids.reportStops()]).toEqual(['stop-5']);
   });
 
+  // Plan 8M-10, C9: nothing polled while the region editor is on.
+  it('asks for neither list while the region editor is on, and for both when it is off', async () => {
+    const activity = new MapActivity(() => page.visibility === 'visible');
+    const { asked } = await started({ raids: true, stops: STOPS, activity });
+    const lists = () =>
+      asked.filter((url) => url.endsWith('/api/parties') || url.endsWith('/api/stop-reports'));
+    expect(lists()).toHaveLength(2);
+    activity.setEditing(true);
+    // The page shown again while the editor is on asks for nothing.
+    page.visibility = 'visible';
+    for (const listener of page.listeners.get('visibilitychange') ?? []) listener({});
+    activity.changed();
+    expect(lists()).toHaveLength(2);
+    activity.setEditing(false);
+    expect(lists().slice(2).sort()).toEqual([
+      '/s/100000000000000001/api/parties',
+      '/s/100000000000000001/api/stop-reports',
+    ]);
+  });
+
   // Branch review W1: a layer toggled draws the reports, the parties' list known or not.
   it('draws the reports anew as their layer is toggled while the parties cannot be had', async () => {
     const { raids, registry } = await started({ raids: true, stops: STOPS, partiesDown: true });
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 51f410b2c7975478f19302608f58048b94e273f3..d71fa77995fa4011c2979c3d28225e9351554978 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -14,6 +14,7 @@ import {
   meetupPopup,
   partiesAtKey,
   raidsDrawn,
+  MapActivity,
   Poller,
   pressParty,
   raidPopup,
@@ -248,6 +249,12 @@ export interface PartyFrame {
   onStops?: (listener: (stops: readonly MapSpot[] | 'failed' | 'zoom') => void) => void;
   /** A PokéStop's own popup opened at it, whatever the layers draw (step 3 at a stop, B9). */
   openStop?: (stop: MapSpot) => HTMLElement | undefined;
+  /**
+   * Whether the live map is in use (plan 8M-10, C9): the pollers of the parties and of the
+   * reports at stops ask nothing while the region editor is on. Without it, the page's
+   * visibility alone.
+   */
+  activity?: MapActivity;
 }
 
 export interface MapRaids {
@@ -358,6 +365,15 @@ export function raidIcon(element: HTMLElement, circle: number, max = false): L.D
   });
 }
 
+/** Whether the map is in use by the page's visibility alone (no region editor on the page). */
+function visibleActivity(): MapActivity {
+  const activity = new MapActivity(() => document.visibilityState === 'visible');
+  document.addEventListener('visibilitychange', () => {
+    activity.changed();
+  });
+  return activity;
+}
+
 /**
  * `mayReport`: a member who may report raids and spawns by what `/api/me` said at the load (not
  * while the map is read-only), who gets "Report raid" and "Report spawn here" also in the popups
@@ -376,6 +392,8 @@ export function showParties(
   frame: PartyFrame,
 ): MapRaids {
   const { registry, afterDraw } = frame;
+  // Whether the lists are asked for (plan 8M-10): the page's own, else the page's visibility.
+  const activity = frame.activity ?? visibleActivity();
   // One group per layer of the registry (plan 8M-7): on the map while the layer is on.
   const groups = { raids: L.layerGroup(), trains: L.layerGroup(), meetups: L.layerGroup() };
   for (const [id, group] of Object.entries(groups)) {
@@ -402,6 +420,7 @@ export function showParties(
     map,
     guild,
     registry,
+    activity,
     // Not waiting for the parties' list (review F11): until it comes, drawn with none.
     redraw: () => {
       redrawParties();
@@ -1961,7 +1980,7 @@ export function showParties(
 
   const poller = new Poller({
     everyMs: EVERY_MS,
-    visible: () => document.visibilityState === 'visible',
+    active: () => activity.active(),
     setTimer: (run, ms) => {
       const timer = window.setTimeout(run, ms);
       return () => {
@@ -1987,8 +2006,8 @@ export function showParties(
       return 'go';
     },
   });
-  document.addEventListener('visibilitychange', () => {
-    poller.visibilityChanged();
+  activity.onChange(() => {
+    poller.activeChanged();
   });
   // The device changed between light and dark (plan 8M-7): the parties drawn anew in the new
   // colors (not under a form being filled in: once it closes, as for a new list).
diff --git a/src/web/client/stop-report-layer.ts b/src/web/client/stop-report-layer.ts
index 9cb4ecaf678db95e0a2f529fdd40560071d2b357..a802f47450d3c53e5ef64a0fab6298086412fedb 100644
--- a/src/web/client/stop-report-layer.ts
+++ b/src/web/client/stop-report-layer.ts
@@ -1,7 +1,7 @@
 import * as L from 'leaflet';
 import type { StopReportsView } from '../../domain/web/stop-report-data.js';
 import type { LayerRegistry } from './layer-registry.js';
-import { Poller } from './parties.js';
+import { Poller, type MapActivity } from './parties.js';
 import { renderNode, type PageNode } from './popup.js';
 import { tapBox, type MarkerSize } from './raid-marker.js';
 import { drawShapes } from './report-ui.js';
@@ -37,6 +37,8 @@ export interface StopReportLayerDeps {
   map: L.Map;
   guild: string;
   registry: LayerRegistry;
+  /** Whether the live map is in use: nothing is asked for while the region editor is on (8M-10). */
+  activity: MapActivity;
   /** Draws the parties anew, through their hold (not under a form being filled in). */
   redraw(): void;
 }
@@ -64,7 +66,7 @@ export interface StopDraw {
 }
 
 export function stopReportLayer(deps: StopReportLayerDeps) {
-  const { map, guild, registry } = deps;
+  const { map, guild, registry, activity } = deps;
   const group = L.layerGroup().addTo(map);
   let view: StopReportsView | undefined;
   let shown = '';
@@ -74,7 +76,7 @@ export function stopReportLayer(deps: StopReportLayerDeps) {
 
   const poller = new Poller({
     everyMs: EVERY_MS,
-    visible: () => document.visibilityState === 'visible',
+    active: () => activity.active(),
     setTimer: (run, ms) => {
       const handle = window.setTimeout(run, ms);
       return () => {
@@ -100,8 +102,8 @@ export function stopReportLayer(deps: StopReportLayerDeps) {
       return 'go';
     },
   });
-  document.addEventListener('visibilitychange', () => {
-    poller.visibilityChanged();
+  activity.onChange(() => {
+    poller.activeChanged();
   });
 
   /** The parties drawn anew at the next end of a report (B14), once. */
````

### Task 5: 8M-10 task 5: the editor in the map's look, swatches, "No overlaps or gaps."

Prototype commit: `7cca246105caf30bc062c36ccdf8eb7c7e73f329`

The editor's tool row, panel and dialogs take the map's Discord look from
theme.css, light and dark: gray buttons, blurple for the step a dialog
leads to (Save..., Apply, Save these changes), red for "Remove and delete
its forum", the selected region and the dialogs as cards with a side bar,
the lists as rows, quiet upper-case headings, Geoman's icons light in dark.
The theme loses --tool-bg, which nothing uses now.

No sentence of the editor names a color: "cannot be saved", "In no region"
and "theirs is drawn dashed" stand beside a swatch of what is drawn
(Swatched, outsideLine, theirsLine of editor-view.ts). With no overlap and
no gap the panel says "No overlaps or gaps.", only after a check that went
through, never while one is worked out or after one failed
(coverageSummary).

**Files:**

```
 src/web/client/editor-view.test.ts |  52 ++++++++++++++++++++++++++++++++++++------
 src/web/client/editor-view.ts      |  86 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------
 src/web/client/editor.css          | 197 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------------------------
 src/web/client/editor.ts           |  90 ++++++++++++++++++++++++++++++++++++++++++++++++++++--------------------
 src/web/client/theme.css           |   2 --
 5 files changed, 339 insertions(+), 88 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/editor-view.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7cca246105caf30bc062c36ccdf8eb7c7e73f329 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 5: the editor in the map's look, swatches, "No overlaps or gaps."`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index bc5b9a36cebe53d836916a57c2ed25ed4e1eff1d..52dd858bf1103b93866f94aaaa44a6aa80306f67 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -36,6 +36,10 @@ import {
   splitPartner,
   storageKey,
   stretchTitle,
+  coverageSummary,
+  outsideLine,
+  theirsLine,
+  NO_PIECES,
   type ListedPiece,
 } from './editor-view.js';
 
@@ -196,14 +200,15 @@ describe('the region editor page', () => {
       checking: true,
     });
     expect(notReady.ready).toBe(false);
+    // No color named (plan 8M-10, C10): the swatch beside a sentence shows what is drawn.
     expect(notReady.reasons).toEqual([
-      'Discord cannot be reached just now, so the editor is read-only.',
-      'Nothing is changed.',
-      '1 outline cannot be saved (shown in red).',
-      '1 new region has no channel yet.',
-      '2 regions were changed by somebody else: take theirs or keep yours.',
-      'Your changes make 1 new overlap and 2 new gaps.',
-      'The overlaps and gaps are being worked out.',
+      { text: 'Discord cannot be reached just now, so the editor is read-only.' },
+      { text: 'Nothing is changed.' },
+      { text: '1 outline cannot be saved.', swatch: 'broken' },
+      { text: '1 new region has no channel yet.' },
+      { text: '2 regions were changed by somebody else: take theirs or keep yours.' },
+      { text: 'Your changes make 1 new overlap and 2 new gaps.' },
+      { text: 'The overlaps and gaps are being worked out.' },
     ]);
     // A page that cannot work them out (its worker failed) waits for nothing: the server checks.
     expect(
@@ -580,4 +585,37 @@ describe('the region editor page', () => {
       '412345678901234567-regions.kml',
     );
   });
+
+  // Plan 8M-10, C10: what the panel says beside what is drawn names no color; its swatch shows it.
+  it('says the places in no region and theirs of a region beside their swatch', () => {
+    expect(outsideLine(0, 0)).toBeUndefined();
+    expect(outsideLine(2, 1)).toEqual({
+      text: 'In no region: 2 gyms, 1 Wayspot.',
+      swatch: 'outside',
+    });
+    expect(theirsLine('oakland')).toEqual({
+      text: '#oakland: theirs is drawn dashed.',
+      swatch: 'theirs',
+    });
+  });
+
+  // Plan 8M-10, C11 (Matt's note c): a clean set of regions reads as clean.
+  it('says "No overlaps or gaps." only after a check that went through and found none', () => {
+    const through = { pieces: 0, overlaps: 0, checking: false, checkFailed: false, checked: true };
+    expect(coverageSummary(through)).toEqual({ kind: 'none', text: NO_PIECES });
+    expect(NO_PIECES).toBe('No overlaps or gaps.');
+    // Being worked out, never worked out, or the check or its worker failed: nothing said.
+    expect(coverageSummary({ ...through, checking: true })).toEqual({ kind: 'nothing' });
+    expect(coverageSummary({ ...through, checked: false })).toEqual({ kind: 'nothing' });
+    expect(coverageSummary({ ...through, checkFailed: true })).toEqual({ kind: 'nothing' });
+    // Some found: their heading (the list as the last check found it, also while checking).
+    expect(coverageSummary({ ...through, pieces: 3, overlaps: 1 })).toEqual({
+      kind: 'list',
+      text: 'Overlaps (1) and gaps (2)',
+    });
+    expect(coverageSummary({ ...through, pieces: 3, overlaps: 1, checking: true })).toEqual({
+      kind: 'list',
+      text: 'Overlaps (1) and gaps (2)',
+    });
+  });
 });
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 09089f81df2d05e49077d861b13ac874f18b4545..3c23bdb08f9871f808f039265041384fd85d2170 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -306,23 +306,41 @@ export interface ReadinessInput {
   checkFailed?: boolean;
 }
 
+/**
+ * What the editor draws that a sentence of its panel refers to (plan 8M-10, C10): a sentence
+ * names no color, and a small swatch of what is drawn (`swatch-<name>` of `editor.css`, colored
+ * by `theme.css`) stands beside it.
+ */
+export type Swatch = 'broken' | 'outside' | 'theirs';
+
+/** A sentence of the panel, with the swatch of what it refers to on the map. */
+export interface Swatched {
+  text: string;
+  swatch?: Swatch;
+}
+
 /** Whether Save is offered, and every reason it is not. */
-export function saveReadiness(input: ReadinessInput): { ready: boolean; reasons: string[] } {
-  const reasons: string[] = [];
-  if (input.readOnly)
-    reasons.push('Discord cannot be reached just now, so the editor is read-only.');
-  if (!input.changes) reasons.push('Nothing is changed.');
+export function saveReadiness(input: ReadinessInput): { ready: boolean; reasons: Swatched[] } {
+  const reasons: Swatched[] = [];
+  const say = (text: string): void => {
+    reasons.push({ text });
+  };
+  if (input.readOnly) say('Discord cannot be reached just now, so the editor is read-only.');
+  if (!input.changes) say('Nothing is changed.');
   if (input.problems.size > 0) {
-    reasons.push(`${count(input.problems.size, 'outline')} cannot be saved (shown in red).`);
+    reasons.push({
+      text: `${count(input.problems.size, 'outline')} cannot be saved.`,
+      swatch: 'broken',
+    });
   }
   if (input.missingChannel.length > 0) {
-    reasons.push(
+    say(
       `${count(input.missingChannel.length, 'new region')} ` +
         `${input.missingChannel.length === 1 ? 'has' : 'have'} no channel yet.`,
     );
   }
   if (input.conflicts > 0) {
-    reasons.push(
+    say(
       `${count(input.conflicts, 'region')} ${input.conflicts === 1 ? 'was' : 'were'} changed by ` +
         'somebody else: take theirs or keep yours.',
     );
@@ -333,14 +351,62 @@ export function saveReadiness(input: ReadinessInput): { ready: boolean; reasons:
       ...(overlaps > 0 ? [count(overlaps, 'new overlap')] : []),
       ...(gaps > 0 ? [count(gaps, 'new gap')] : []),
     ];
-    reasons.push(`Your changes make ${made.join(' and ')}.`);
+    say(`Your changes make ${made.join(' and ')}.`);
   }
   if (input.checking && input.checkFailed !== true) {
-    reasons.push('The overlaps and gaps are being worked out.');
+    say('The overlaps and gaps are being worked out.');
   }
   return { ready: reasons.length === 0, reasons };
 }
 
+/** The places in no region, beside their swatch; nothing when every place is in one. */
+export function outsideLine(gyms: number, wayspots: number): Swatched | undefined {
+  if (gyms + wayspots === 0) return undefined;
+  return {
+    text: `In no region: ${count(gyms, 'gym')}, ${count(wayspots, 'Wayspot')}.`,
+    swatch: 'outside',
+  };
+}
+
+/** A region somebody else changed: theirs is drawn beside the staged one, dashed. */
+export function theirsLine(name: string): Swatched {
+  return { text: `#${name}: theirs is drawn dashed.`, swatch: 'theirs' };
+}
+
+/** What the panel says when a check went through and found no overlap and no gap (note c). */
+export const NO_PIECES = 'No overlaps or gaps.';
+
+/** What the panel's section of overlaps and gaps shows now. */
+export interface CoverageState {
+  /** How many pieces the last check that went through found, and how many are overlaps. */
+  pieces: number;
+  overlaps: number;
+  /** Whether the overlaps and gaps of the last edit are being worked out. */
+  checking: boolean;
+  /** Whether the last check (or the worker) failed. */
+  checkFailed: boolean;
+  /** Whether any check went through since the editor opened. */
+  checked: boolean;
+}
+
+/**
+ * The section's heading over the list of what the last check found (shown also while the next is
+ * worked out), or "No overlaps or gaps." only after a check that went through and found none, not
+ * while the next is worked out (C11); nothing when no check went through or the last failed.
+ */
+export function coverageSummary(
+  state: CoverageState,
+): { kind: 'list' | 'none'; text: string } | { kind: 'nothing' } {
+  if (state.pieces > 0) {
+    return {
+      kind: 'list',
+      text: `Overlaps (${state.overlaps}) and gaps (${state.pieces - state.overlaps})`,
+    };
+  }
+  if (state.checking || state.checkFailed || !state.checked) return { kind: 'nothing' };
+  return { kind: 'none', text: NO_PIECES };
+}
+
 /** What lies in an overlap or a gap, by kind. */
 export interface PlaceKinds {
   gym: number;
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index 91df9ac17185b5bb420eaa088ee9882b17f7674c..683393021312899b10df144808981d987c4a47af 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -3,6 +3,8 @@
 /*
  * The region editor on the map (plans 8M-2, 8M-10): an add-on of `map.css`, loaded beside it
  * when the editor is first turned on, so it imports neither the map's sheet nor the theme again.
+ * Discord's look as the map has it: gray buttons, blurple for the step a dialog leads to, red for
+ * what deletes, cards with a side bar for its dialogs; every color a value of `theme.css`.
  */
 
 /* The tool row in the place of the layers' row, led by "Back to the map" (plan 8M-10, C7). */
@@ -14,45 +16,58 @@
   gap: 6px;
 }
 
-#editor-back {
-  color: var(--on-color);
-  background: var(--primary);
+#editor-bar button,
+#editor-panel button {
+  color: var(--secondary-text);
+  background: var(--secondary);
   border: 0;
   border-radius: var(--radius);
-  padding: 4px 10px;
+  padding: 5px 12px;
   font: inherit;
   font-weight: 500;
   cursor: pointer;
 }
 
-#editor-back:hover {
+#editor-bar button:hover,
+#editor-panel button:hover {
+  background: var(--secondary-hover);
+}
+
+#editor-bar button.primary,
+#editor-panel button.primary {
+  color: var(--on-color);
+  background: var(--primary);
+}
+
+#editor-bar button.primary:hover,
+#editor-panel button.primary:hover {
   background: var(--primary-hover);
 }
 
-#editor-tools button,
-#editor-panel button {
-  color: var(--secondary-text);
-  background: var(--tool-bg);
-  border: 0;
-  border-radius: var(--radius);
-  padding: 4px 10px;
-  font: inherit;
-  font-weight: 500;
-  cursor: pointer;
+#editor-panel button.danger {
+  color: var(--on-color);
+  background: var(--danger);
 }
 
-#editor-tools button:hover,
-#editor-panel button:hover {
-  background: var(--secondary-hover);
+#editor-panel button.danger:hover {
+  background: var(--danger-hover);
 }
 
-#editor-tools button:disabled {
+#editor-bar button:disabled,
+#editor-panel button:disabled {
   opacity: 0.5;
   cursor: default;
 }
 
+#editor-bar button:focus-visible,
+#editor-panel button:focus-visible {
+  outline: 2px solid var(--focus);
+  outline-offset: 1px;
+}
+
 /* Its own map in the live map's place (plan 8M-10), its panel in the side pane's. */
 #editor-map {
+  position: relative;
   flex: 1;
   min-height: 300px;
 }
@@ -61,20 +76,29 @@
   width: var(--editor-panel-width);
   max-width: 45vw;
   overflow-y: auto;
-  padding: 8px 12px;
+  padding: 8px 12px 16px;
   border-left: 1px solid var(--line);
   background: var(--panel-bg);
   font-size: 14px;
 }
 
+/* Section headings as Discord's: small, upper case, quiet. */
 #editor-panel h2 {
-  font-size: 15px;
-  margin: 12px 0 4px;
+  margin: 16px 0 6px;
+  color: var(--muted);
+  font-size: 12px;
+  font-weight: 700;
+  letter-spacing: 0.02em;
+  text-transform: uppercase;
 }
 
 #editor-panel h3 {
+  margin: 10px 0 4px;
   font-size: 14px;
-  margin: 8px 0 2px;
+}
+
+#editor-panel p {
+  margin: 6px 0;
 }
 
 #editor-panel ul {
@@ -90,8 +114,8 @@
 #editor-panel input {
   display: block;
   width: 100%;
-  margin: 4px 0;
-  padding: 4px 8px;
+  margin: 6px 0;
+  padding: 6px 8px;
   border: 1px solid var(--field-border);
   border-radius: var(--radius);
   background: var(--field-bg);
@@ -100,24 +124,59 @@
   box-sizing: border-box;
 }
 
-#editor-panel .actions button,
-#editor-panel .dialog button,
+#editor-panel .actions,
+#editor-panel .choices {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 6px;
+  margin-top: 8px;
+}
+
 #editor-panel .conflict button {
   margin: 4px 6px 0 0;
-  font: inherit;
 }
 
-#editor-panel .reasons li,
+/* Why Save is off: a quiet list above everything else. */
+#editor-panel .reasons {
+  margin: 4px 0 8px;
+  padding: 8px 10px 8px 26px;
+  border-radius: var(--radius);
+  background: var(--card-bg);
+  color: var(--warning);
+}
+
 #editor-panel .warning {
   color: var(--warning);
 }
 
+/* "No overlaps or gaps." (plan 8M-10, C11). */
+#editor-panel .clean {
+  color: var(--going);
+  font-weight: 600;
+}
+
+/* The regions and the overlaps and gaps as rows, the one picked marked. */
+#editor-panel .region-list,
+#editor-panel .piece-list {
+  padding: 0;
+  list-style: none;
+}
+
 #editor-panel .region-list li,
 #editor-panel .piece-list li {
+  margin: 1px 0;
+  padding: 4px 8px;
+  border-radius: var(--radius);
   cursor: pointer;
 }
 
+#editor-panel .region-list li:hover,
+#editor-panel .piece-list li:hover {
+  background: var(--line);
+}
+
 #editor-panel .region-list li.chosen {
+  background: var(--chip-on-bg);
   font-weight: 600;
 }
 
@@ -126,21 +185,10 @@
   font-weight: 600;
 }
 
-#editor-panel .dialog {
-  border: 1px solid var(--field-border);
-  border-radius: var(--radius);
-  padding: 4px 10px 10px;
-  background: var(--dialog-bg);
-}
-
-#editor-panel .conflict {
-  margin: 6px 0;
-}
-
 #editor-panel .piece-list button {
-  font: inherit;
+  margin-left: 4px;
+  padding: 1px 8px;
   font-size: 12px;
-  padding: 0 6px;
 }
 
 #editor-panel .piece-list .cannot-fix {
@@ -148,10 +196,64 @@
   font-size: 12px;
 }
 
+/* The selected region and the dialogs (Save…) as cards with a side bar, as Discord's. */
+#editor-panel .selected,
+#editor-panel .dialog {
+  margin: 8px 0;
+  padding: 4px 12px 12px;
+  border-left: var(--card-bar) solid var(--accent);
+  border-radius: var(--card-radius);
+  background: var(--card-bg);
+  box-shadow: 0 1px 3px var(--shadow);
+}
+
+#editor-panel .selected h2,
+#editor-panel .dialog h2 {
+  color: var(--text);
+  font-size: 15px;
+  letter-spacing: 0;
+  text-transform: none;
+}
+
+#editor-panel .dialog > button {
+  margin: 8px 6px 0 0;
+}
+
+/*
+ * A swatch of what a sentence refers to on the map (plan 8M-10, C10): the sentence names no
+ * color. An outline that cannot be saved, a place in no region (a dot), theirs (dashed).
+ */
+.swatch {
+  display: inline-block;
+  width: 10px;
+  height: 10px;
+  margin-right: 6px;
+  border-radius: 2px;
+  vertical-align: -1px;
+  box-sizing: border-box;
+}
+
+.swatch-broken {
+  background: var(--broken);
+}
+
+.swatch-outside {
+  border-radius: 50%;
+  background: var(--outside);
+}
+
+.swatch-theirs {
+  width: 14px;
+  border: 2px dashed var(--theirs);
+  background: transparent;
+}
+
+/* A fix's choices; the one shown on the map marked by the line it draws. */
 #editor-panel .fix-option {
-  margin: 4px 0;
-  padding: 2px 6px;
+  margin: 6px 0;
+  padding: 4px 8px;
   border-left: 3px solid transparent;
+  border-radius: var(--radius);
 }
 
 #editor-panel .fix-option.chosen {
@@ -167,3 +269,10 @@
   box-sizing: border-box;
   cursor: move;
 }
+
+/* Geoman's tool icons are dark drawings: turned light in dark, as the controls they sit on. */
+@media (prefers-color-scheme: dark) {
+  .leaflet-pm-toolbar .control-icon {
+    filter: invert(1);
+  }
+}
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index 2153e4712b185ac1bfe36b4c5d0fe0fe396dcc6b..54780c66f883eec98e9a65ed8da3f14fcafaff53 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -43,6 +43,10 @@ import {
   channelChoices,
   choiceWords,
   count,
+  coverageSummary,
+  outsideLine,
+  theirsLine,
+  type Swatched,
   draftLabel,
   exportFileName,
   FIX_FAILED_WORDS,
@@ -142,14 +146,38 @@ function element<K extends keyof HTMLElementTagNameMap>(
   return made;
 }
 
-function button(text: string, onClick: () => void, disabled = false): HTMLButtonElement {
-  const made = element('button', text);
+/**
+ * A button in Discord's look (plan 8M-10): gray by default, blurple for the step it leads to
+ * (`primary`: Save…, Apply, Save these changes), red for what deletes (`danger`).
+ */
+function button(
+  text: string,
+  onClick: () => void,
+  disabled = false,
+  kind: 'primary' | 'danger' | undefined = undefined,
+): HTMLButtonElement {
+  const made = element('button', text, kind);
   made.type = 'button';
   made.disabled = disabled;
   made.addEventListener('click', onClick);
   return made;
 }
 
+/**
+ * A sentence with the swatch of what it refers to on the map before it (plan 8M-10, C10): the
+ * sentence names no color; the swatch, colored by `theme.css`, is no word for a screen reader.
+ */
+function swatched(tag: 'p' | 'li' | 'span', line: Swatched, className?: string): HTMLElement {
+  const made = element(tag, undefined, className);
+  if (line.swatch !== undefined) {
+    const swatch = element('span', undefined, `swatch swatch-${line.swatch}`);
+    swatch.setAttribute('aria-hidden', 'true');
+    made.append(swatch);
+  }
+  made.append(line.text);
+  return made;
+}
+
 /** A polygon's outer ring as places, closed, as the staged edits keep it (`normalisedOutline`). */
 function ringOf(layer: L.Polygon): LatLon[] {
   const rings = layer.getLatLngs() as L.LatLng[][];
@@ -206,6 +234,8 @@ class Editor {
   private pieces: ShownPiece[] = [];
   private checking = false;
   private checkFailed = false;
+  /** Whether a check of the overlaps and gaps went through since the editor opened. */
+  private checkedOnce = false;
   private seq = 0;
   private timer: number | undefined;
   /** How many previews and saves are being sent (`whileSending`). */
@@ -522,7 +552,7 @@ class Editor {
       button('Load KML', () => file.click(), readOnly),
       file,
       button('Export KML', () => this.exportKml()),
-      button('Save…', () => void this.whileSending(() => this.preview()), !ready.ready),
+      button('Save…', () => void this.whileSending(() => this.preview()), !ready.ready, 'primary'),
     );
   }
 
@@ -806,6 +836,7 @@ class Editor {
     if (answer.seq !== this.seq) return;
     this.checking = false;
     this.checkFailed = answer.failed;
+    if (!answer.failed) this.checkedOnce = true;
     this.pieces = answer.pieces;
     this.shaded.clearLayers();
     for (const piece of this.pieces) {
@@ -820,7 +851,7 @@ class Editor {
     this.checked();
   }
 
-  private readiness(): { ready: boolean; reasons: string[] } {
+  private readiness(): { ready: boolean; reasons: Swatched[] } {
     const { request, missingChannel } = saveRequest(this.loaded, this.applied.drafts);
     const changes = request.changes.length + request.additions.length + request.removals.length > 0;
     return saveReadiness({
@@ -856,17 +887,8 @@ class Editor {
     this.regionList(panel);
     panel.append(pieces);
     this.checked();
-    const outsideGyms = this.counts.outsideGyms.length;
-    const outsideWayspots = this.counts.outsideWayspots.length;
-    if (outsideGyms + outsideWayspots > 0) {
-      panel.append(
-        element(
-          'p',
-          `In no region (orange): ${count(outsideGyms, 'gym')}, ${count(outsideWayspots, 'Wayspot')}.`,
-          'warning',
-        ),
-      );
-    }
+    const outside = outsideLine(this.counts.outsideGyms.length, this.counts.outsideWayspots.length);
+    if (outside) panel.append(swatched('p', outside, 'warning'));
   }
 
   /**
@@ -880,7 +902,7 @@ class Editor {
     const ready = this.readiness();
     if (!ready.ready && !this.dialog) {
       const list = element('ul', undefined, 'reasons');
-      for (const reason of ready.reasons) list.append(element('li', reason));
+      for (const reason of ready.reasons) list.append(swatched('li', reason));
       reasons.append(list);
     }
     warning.replaceChildren();
@@ -899,7 +921,7 @@ class Editor {
       if (!region) continue;
       const row = element('div', undefined, 'conflict');
       row.append(
-        element('span', `#${region.name}: theirs is dashed blue.`),
+        swatched('span', theirsLine(region.name)),
         button('Take theirs', () => {
           this.edit({ kind: 'take-theirs', key: `r${id}`, version: region.version });
           this.redraw();
@@ -986,7 +1008,14 @@ class Editor {
         } else {
           actions.append(button('Remove, keep its forum', () => this.remove(key, 'keep')));
           if (this.data.mayManageChannels) {
-            actions.append(button('Remove and delete its forum', () => this.remove(key, 'delete')));
+            actions.append(
+              button(
+                'Remove and delete its forum',
+                () => this.remove(key, 'delete'),
+                false,
+                'danger',
+              ),
+            );
           }
         }
       }
@@ -1092,12 +1121,18 @@ class Editor {
   }
 
   private pieceList(panel: HTMLElement): void {
-    if (this.pieces.length === 0) return;
+    const summary = coverageSummary({
+      pieces: this.pieces.length,
+      overlaps: this.pieces.filter((piece) => piece.kind === 'overlap').length,
+      checking: this.checking,
+      checkFailed: this.checkFailed,
+      checked: this.checkedOnce,
+    });
+    // A clean set of regions reads as clean (plan 8M-10, C11).
+    if (summary.kind === 'none') panel.append(element('p', summary.text, 'clean'));
+    if (summary.kind !== 'list') return;
     const sorted = [...this.pieces].sort(pieceOrder(this.worstFirst));
-    const overlaps = this.pieces.filter((piece) => piece.kind === 'overlap').length;
-    panel.append(
-      element('h2', `Overlaps (${overlaps}) and gaps (${this.pieces.length - overlaps})`),
-    );
+    panel.append(element('h2', summary.text));
     const list = element('ul', undefined, 'piece-list');
     for (const piece of sorted.slice(0, LISTED_PIECES)) {
       const item = element(
@@ -1323,7 +1358,7 @@ class Editor {
     }
     const picked = answer.options.find((option) => option.choice === fixing.picked);
     section.append(
-      button('Apply', () => this.applyFix(), !picked?.ok || fixing.waiting > 0),
+      button('Apply', () => this.applyFix(), !picked?.ok || fixing.waiting > 0, 'primary'),
       button('Cancel', () => this.closeFix()),
     );
     panel.append(section);
@@ -1565,7 +1600,12 @@ class Editor {
         showWorded(dialog, answer.worded);
         if (answer.changes) {
           dialog.append(
-            button('Save these changes', () => void this.whileSending(() => this.save())),
+            button(
+              'Save these changes',
+              () => void this.whileSending(() => this.save()),
+              false,
+              'primary',
+            ),
           );
         }
         dialog.append(button('Cancel', () => this.closeDialog()));
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index e5889fbc5fab06a3c53a69fcb010b2247d67f37a..baae45e3607bafc89ad2a783da2b98f40a5a97df 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -110,7 +110,6 @@
   --you-edge: #ffffff;
 
   /* The region editor's panel. */
-  --tool-bg: #e3e5e8;
   --warning: #8a5a00;
   --fresh-piece: #b00020;
   --dialog-bg: #f2f3f5;
@@ -227,7 +226,6 @@
     --you: #4c8bf5;
     --you-edge: #ffffff;
 
-    --tool-bg: #4e5058;
     --warning: #f0b232;
     --fresh-piece: #fa777c;
     --dialog-bg: #2b2d31;
````

### Task 6: 8M-10 task 6: Fix and Fix all slivers in a box beside the sliver

Prototype commit: `1671d9fc7801b354ab8bb2a5a6652aaac1c19068`

Fix... and Fix all slivers... no longer draw their dialog at the top of the
side panel, out of sight when the list is scrolled (Matt's note d): they
show in a box pinned over the editor map's top right corner, under the layer
switch (a Leaflet control, taking its own clicks and scrolls), as a card of
the theme (--fix-box-width), its choices scrolling inside it and its
buttons (Apply, Cancel; Leave it, Stop here) at its foot, always in sight.
The map is fitted to the stretch in the part the box leaves free
(fixBoxPadding), once the box shows the choices.

**Files:**

```
 src/web/client/editor-view.test.ts |  20 ++++++++++++++++++++
 src/web/client/editor-view.ts      |  24 ++++++++++++++++++++++++
 src/web/client/editor.css          |  80 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--------
 src/web/client/editor.ts           | 106 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------------------------
 src/web/client/theme.css           |   4 +++-
 5 files changed, 197 insertions(+), 37 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/editor-view.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1671d9fc7801b354ab8bb2a5a6652aaac1c19068 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 6: Fix and Fix all slivers in a box beside the sliver`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index 52dd858bf1103b93866f94aaaa44a6aa80306f67..86244172f5cbc10a1c70ff45f4f3f8d7bb96008a 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -37,6 +37,7 @@ import {
   storageKey,
   stretchTitle,
   coverageSummary,
+  fixBoxPadding,
   outsideLine,
   theirsLine,
   NO_PIECES,
@@ -599,6 +600,25 @@ describe('the region editor page', () => {
     });
   });
 
+  // Plan 8M-10, C12 (Matt's note d): the stretch is shown beside the Fix box, never under it.
+  it('fits a stretch into the part of the map the Fix box leaves free', () => {
+    // A box of 340 pixels at the top right of a map of 1,000: the stretch in the 600 left of it.
+    expect(fixBoxPadding({ width: 340, height: 500 }, { x: 1000, y: 750 })).toEqual({
+      topLeft: [40, 40],
+      bottomRight: [396, 40],
+    });
+    // No box drawn yet: the old margins.
+    expect(fixBoxPadding({ width: 0, height: 0 }, { x: 1000, y: 750 })).toEqual({
+      topLeft: [40, 40],
+      bottomRight: [40, 40],
+    });
+    // A narrow map keeps a third of its width for the stretch, the box over the rest.
+    expect(fixBoxPadding({ width: 340, height: 500 }, { x: 450, y: 750 })).toEqual({
+      topLeft: [40, 40],
+      bottomRight: [260, 40],
+    });
+  });
+
   // Plan 8M-10, C11 (Matt's note c): a clean set of regions reads as clean.
   it('says "No overlaps or gaps." only after a check that went through and found none', () => {
     const through = { pieces: 0, overlaps: 0, checking: false, checkFailed: false, checked: true };
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 3c23bdb08f9871f808f039265041384fd85d2170..86865ffb16611e6860e37454fe9b58e6165a9831 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -596,6 +596,30 @@ export function fixWaiting(
   }
 }
 
+/** The margin round a stretch the map is fitted to, in pixels. */
+const FIT_MARGIN = 40;
+/** The room between the Fix box and the stretch, beside the control's own margin. */
+const BOX_GAP = 16;
+
+/**
+ * The padding the map is fitted to a stretch with (plan 8M-10, C12): Fix… and Fix all slivers…
+ * show in a box pinned over the map's top right corner, so the stretch is fitted into the part
+ * of the map left of it; a narrow map keeps at least a third of its width for the stretch.
+ */
+export function fixBoxPadding(
+  box: { width: number; height: number },
+  map: { x: number; y: number },
+): { topLeft: [number, number]; bottomRight: [number, number] } {
+  const right =
+    box.width > 0
+      ? Math.round(Math.min(box.width + BOX_GAP + FIT_MARGIN, map.x - FIT_MARGIN - map.x / 3))
+      : FIT_MARGIN;
+  return {
+    topLeft: [FIT_MARGIN, FIT_MARGIN],
+    bottomRight: [Math.max(FIT_MARGIN, right), FIT_MARGIN],
+  };
+}
+
 /**
  * Whether the page offers Fix and "Fix all slivers…": not to a member who may only look, nor
  * once the overlaps and gaps could not be worked out (a check failed, or the worker stopped
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index 683393021312899b10df144808981d987c4a47af..0c9f8360f5b793cf3f6713cf80e2341598231081 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -17,7 +17,8 @@
 }
 
 #editor-bar button,
-#editor-panel button {
+#editor-panel button,
+.fix-box button {
   color: var(--secondary-text);
   background: var(--secondary);
   border: 0;
@@ -29,18 +30,21 @@
 }
 
 #editor-bar button:hover,
-#editor-panel button:hover {
+#editor-panel button:hover,
+.fix-box button:hover {
   background: var(--secondary-hover);
 }
 
 #editor-bar button.primary,
-#editor-panel button.primary {
+#editor-panel button.primary,
+.fix-box button.primary {
   color: var(--on-color);
   background: var(--primary);
 }
 
 #editor-bar button.primary:hover,
-#editor-panel button.primary:hover {
+#editor-panel button.primary:hover,
+.fix-box button.primary:hover {
   background: var(--primary-hover);
 }
 
@@ -54,13 +58,15 @@
 }
 
 #editor-bar button:disabled,
-#editor-panel button:disabled {
+#editor-panel button:disabled,
+.fix-box button:disabled {
   opacity: 0.5;
   cursor: default;
 }
 
 #editor-bar button:focus-visible,
-#editor-panel button:focus-visible {
+#editor-panel button:focus-visible,
+.fix-box button:focus-visible {
   outline: 2px solid var(--focus);
   outline-offset: 1px;
 }
@@ -248,15 +254,73 @@
   background: transparent;
 }
 
+/*
+ * Fix… and Fix all slivers… in a box pinned over the map's top right corner (plan 8M-10, C12):
+ * a card as the dialogs are; its choices scroll inside it, its buttons stay at its foot.
+ */
+.fix-box {
+  display: flex;
+  flex-direction: column;
+  width: var(--fix-box-width);
+  max-width: calc(100vw - 120px);
+  max-height: calc(100vh - 200px);
+  border-left: var(--card-bar) solid var(--accent);
+  border-radius: var(--card-radius);
+  background: var(--card-bg);
+  color: var(--text);
+  box-shadow: 0 8px 24px var(--shadow);
+  font-size: 14px;
+  cursor: auto;
+}
+
+.fix-dialog {
+  display: flex;
+  flex-direction: column;
+  min-height: 0;
+}
+
+.fix-dialog h2 {
+  margin: 0;
+  padding: 10px 12px 4px;
+  font-size: 15px;
+}
+
+.fix-body {
+  min-height: 0;
+  overflow-y: auto;
+  padding: 0 12px;
+}
+
+.fix-body p {
+  margin: 6px 0;
+}
+
+.fix-body ul {
+  margin: 0;
+  padding-left: 18px;
+}
+
+.fix-box .warning {
+  color: var(--warning);
+}
+
+.fix-actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 6px;
+  padding: 10px 12px;
+  border-top: 1px solid var(--line);
+}
+
 /* A fix's choices; the one shown on the map marked by the line it draws. */
-#editor-panel .fix-option {
+.fix-box .fix-option {
   margin: 6px 0;
   padding: 4px 8px;
   border-left: 3px solid transparent;
   border-radius: var(--radius);
 }
 
-#editor-panel .fix-option.chosen {
+.fix-box .fix-option.chosen {
   border-left-color: var(--fix-line);
   background: var(--fix-chosen-bg);
 }
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index 54780c66f883eec98e9a65ed8da3f14fcafaff53..5091f43f7e33c207ffea78dd55945861d85ea7d4 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -51,6 +51,7 @@ import {
   exportFileName,
   FIX_FAILED_WORDS,
   fixAllWords,
+  fixBoxPadding,
   fixesOffered,
   fixPick,
   fixWaiting,
@@ -275,6 +276,8 @@ class Editor {
   private fixAsk = 0;
   /** What a fix would make, dashed, and the corner where three regions meet. */
   private readonly fixPreview = L.layerGroup();
+  /** The Fix box over the map's top right corner (plan 8M-10, C12), hidden while no fix is open. */
+  private readonly fixHost = element('div', undefined, 'fix-box');
   private corner: L.Marker | undefined;
   /** The parts of the panel an answer of the worker changes (`checked`), as last drawn. */
   private readonly checkedParts = {
@@ -365,6 +368,13 @@ class Editor {
         { position: 'topright', collapsed: true },
       )
       .addTo(map);
+    // The Fix box, under the layer switch: a press or a scroll in it never reaches the map.
+    this.fixHost.hidden = true;
+    L.DomEvent.disableClickPropagation(this.fixHost);
+    L.DomEvent.disableScrollPropagation(this.fixHost);
+    const fixBox = new L.Control({ position: 'topright' });
+    fixBox.onAdd = () => this.fixHost;
+    fixBox.addTo(map);
     map.pm.setGlobalOptions({ snappable: true, snapDistance: 15, exitModeOnEscape: true });
     map.on('pm:create', (event: { shape: string; layer: L.Layer }) => {
       this.created(event.shape, event.layer);
@@ -879,7 +889,7 @@ class Editor {
     const panel = this.hosts.panel;
     panel.replaceChildren();
     if (this.dialog) panel.append(this.dialog);
-    this.fixSection(panel);
+    this.fixBox();
     const { reasons, warning, pieces } = this.checkedParts;
     panel.append(reasons, warning);
     this.conflictSection(panel);
@@ -1195,13 +1205,39 @@ class Editor {
     const first = fixing.answer === undefined;
     fixing.answer = answer;
     fixing.picked = fixPick(answer.options, fixing.picked, fixing.corner !== undefined);
-    if (first) this.fitStretch(answer.stretch);
     this.drawFix();
     this.panel();
+    // Fitted once the box shows its choices: the stretch beside it (C12).
+    if (first) this.fitStretch(answer.stretch);
   }
 
+  /** The map fitted to a stretch in the part the Fix box leaves free (plan 8M-10, C12). */
   private fitStretch(stretch: ShownStretch): void {
-    this.map.fitBounds(L.latLngBounds(stretch.box), { padding: [40, 40], maxZoom: 18 });
+    // Hidden, its map is not moved (review 1, F2).
+    if (!shownNow) return;
+    const size = this.map.getSize();
+    const padding = fixBoxPadding(
+      { width: this.fixHost.offsetWidth, height: this.fixHost.offsetHeight },
+      { x: size.x, y: size.y },
+    );
+    this.map.fitBounds(L.latLngBounds(stretch.box), {
+      paddingTopLeft: padding.topLeft,
+      paddingBottomRight: padding.bottomRight,
+      maxZoom: 18,
+    });
+  }
+
+  /**
+   * Fix… and Fix all slivers… in a box pinned over the map's top right corner (plan 8M-10, C12;
+   * Matt's note d: at the top of a scrolled panel they were out of sight): its choices scroll
+   * inside it, its buttons (Apply, Cancel, …) always in sight at its foot. Hidden while no fix
+   * is open.
+   */
+  private fixBox(): void {
+    const host = this.fixHost;
+    host.replaceChildren();
+    this.fixSection(host);
+    host.hidden = host.childElementCount === 0;
   }
 
   /**
@@ -1275,57 +1311,71 @@ class Editor {
     this.toolbar();
   }
 
-  /** The section of the panel of a fix or of Fix all. */
-  private fixSection(panel: HTMLElement): void {
+  /**
+   * The dialog of a fix or of Fix all, in the Fix box (C12): its title, what it says and its
+   * choices in a part that scrolls, its buttons at its foot, always in sight.
+   */
+  private fixSection(host: HTMLElement): void {
     const name = (key: string): string => this.name(key);
+    const dialog = (title: string | undefined, body: Node[], actions: HTMLElement[]): void => {
+      const section = element('section', undefined, 'fix-dialog');
+      if (title !== undefined) section.append(element('h2', title));
+      const scrolled = element('div', undefined, 'fix-body');
+      scrolled.append(...body);
+      const foot = element('div', undefined, 'fix-actions');
+      foot.append(...actions);
+      section.append(scrolled, foot);
+      host.append(section);
+    };
     if (this.fixingAll !== undefined) {
-      const section = element('section', undefined, 'dialog');
-      section.append(element('h2', 'Fix all slivers'));
       const step = this.fixingAll;
       if (step === 'working' || step.question === null) {
-        section.append(element('p', 'Fixing the slivers with nothing in them…'));
-        section.append(button('Cancel', () => this.closeFix()));
-        panel.append(section);
+        dialog(
+          'Fix all slivers',
+          [element('p', 'Fixing the slivers with nothing in them…')],
+          [button('Cancel', () => this.closeFix())],
+        );
         return;
       }
       const { stretch, options } = step.question;
-      section.append(
+      const body: Node[] = [
         element('p', `${count(step.fixed, 'stretch', 'stretches')} fixed so far.`),
         element(
           'p',
           `${stretchTitle(stretch.sides, name)}: ${count(stretch.places.length, 'place')} would change region. Which line do the regions take?`,
         ),
-      );
+      ];
       for (const option of options) {
+        const row = element('div', undefined, 'fix-option');
         const take = button(
           `Take ${choiceWords(option.choice, stretch.sides, name)}`,
           () => this.answerFixAll(option.choice),
           !option.ok,
         );
         take.addEventListener('mouseenter', () => this.previewOutlines(option.outlines));
-        section.append(take, this.landings(option, name));
+        row.append(take, this.landings(option, name));
+        body.push(row);
       }
-      section.append(
+      dialog('Fix all slivers', body, [
         button('Leave it', () => this.answerFixAll('skip')),
         button('Stop here', () => this.answerFixAll('stop')),
         button('Cancel', () => this.closeFix()),
-      );
-      panel.append(section);
+      ]);
       return;
     }
     const fixing = this.fixing;
     if (!fixing) return;
-    const section = element('section', undefined, 'dialog');
     const answer = fixing.answer;
     const stretch = answer?.stretch;
     if (!answer || !stretch) {
-      section.append(element('p', 'Working out the fixes…'));
-      section.append(button('Cancel', () => this.closeFix()));
-      panel.append(section);
+      dialog(
+        undefined,
+        [element('p', 'Working out the fixes…')],
+        [button('Cancel', () => this.closeFix())],
+      );
       return;
     }
-    section.append(element('h2', stretchTitle(stretch.sides, name)));
-    section.append(element('p', 'The shared line is one of these (dashed on the map):'));
+    const body: Node[] = [element('p', 'The shared line is one of these (dashed on the map):')];
     for (const option of answer.options) {
       const row = element(
         'div',
@@ -1344,10 +1394,10 @@ class Editor {
         ),
         this.landings(option, name),
       );
-      section.append(row);
+      body.push(row);
     }
     if (stretch.corner && fixing.picked === 'midline') {
-      section.append(
+      body.push(
         element(
           'p',
           fixing.waiting > 0
@@ -1357,11 +1407,10 @@ class Editor {
       );
     }
     const picked = answer.options.find((option) => option.choice === fixing.picked);
-    section.append(
+    dialog(stretchTitle(stretch.sides, name), body, [
       button('Apply', () => this.applyFix(), !picked?.ok || fixing.waiting > 0, 'primary'),
       button('Cancel', () => this.closeFix()),
-    );
-    panel.append(section);
+    ]);
   }
 
   /** Where each place ends up under a choice, or why it cannot be made. */
@@ -1429,11 +1478,12 @@ class Editor {
     }
     if (answer.question) {
       this.fixingAll = answer;
-      this.fitStretch(answer.question.stretch);
       const first = fixPick(answer.question.options, undefined, false);
       const shown = answer.question.options.find((option) => option.choice === first);
       this.previewOutlines(shown?.outlines ?? []);
       this.panel();
+      // Fitted once the box shows the question: the stretch beside it (C12).
+      this.fitStretch(answer.question.stretch);
       return;
     }
     this.dropFixes();
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index baae45e3607bafc89ad2a783da2b98f40a5a97df..0b93ea59899737f4a93423ba966fcbf824bdad92 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -19,9 +19,10 @@
   --raid-full: 44px;
   --raid-middle: 30px;
   --raid-small: 20px;
-  /* The map's side pane (the list, forms) and the region editor's panel. */
+  /* The map's side pane (the list, forms), the region editor's panel and its Fix box (8M-10). */
   --panel-width: 340px;
   --editor-panel-width: 360px;
+  --fix-box-width: 340px;
 
   /* Discord's surfaces, light. */
   --page-bg: #ffffff;
@@ -153,6 +154,7 @@
     --raid-small: 20px;
     --panel-width: 340px;
     --editor-panel-width: 360px;
+    --fix-box-width: 340px;
 
     /* Discord's surfaces, dark. */
     --page-bg: #313338;
````

### Task 7: 8M-10 task 7: a corner regions share moves in all of them

Prototype commit: `4aa885465ddd3ec4b30b0330914499de00abc607`

Dragging a corner that two or three of the server's regions have in common
(the same point at six decimals, among the regions not staged for removal)
moves it in all of them, staged as one batch of outline edits: one step of
undo (src/domain/regions/shared-corners.ts: cornerSharers, movedCorner,
sharedCornerEdit). A corner on another region's side (a T-junction) is
shared by nobody; other servers' outlines never move, so a corner shared
with one comes apart.

On Geoman's side (spiked in the preview: the batch staged, both outlines
moved, one Undo takes both back, the switch off drags one region's corner
apart): at pm:markerdragstart the sharers are found and set snapIgnore (the
marker would snap to their moving corner), at pm:markerdrag their outlines
are drawn with the corner, at pm:markerdragend the drop is kept for the
pm:edit that stages the batch, and every region is drawn anew on the next
turn, after Geoman is through with the drag. Snapping is as before.

The tool row's switch "Move shared corners together" is on by default and
remembered per browser (readMoveTogether, writeMoveTogether: localStorage,
never throwing).

**Files:**

```
 src/domain/regions/shared-corners.test.ts | 114 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/shared-corners.ts      |  77 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor.css                 |  16 ++++++++++++++++
 src/web/client/editor.ts                  | 113 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/staged-storage.test.ts     |  32 +++++++++++++++++++++++++++++++-
 src/web/client/staged-storage.ts          |  22 ++++++++++++++++++++++
 6 files changed, 372 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/shared-corners.test.ts src/web/client/staged-storage.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4aa885465ddd3ec4b30b0330914499de00abc607 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 7: a corner regions share moves in all of them`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/regions/shared-corners.test.ts b/src/domain/regions/shared-corners.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..17caaa86c38fe6d79bd84634866da48ef9a188e5
--- /dev/null
+++ b/src/domain/regions/shared-corners.test.ts
@@ -0,0 +1,114 @@
+import type { LatLon } from '@pine/wayspot-core/lat-lon';
+import { describe, expect, it } from 'vitest';
+import type { Draft } from './edits.js';
+import { cornerSharers, movedCorner, sharedCornerEdit } from './shared-corners.js';
+
+const p = (lat: number, lon: number): LatLon => ({ lat, lon });
+function square(south: number, west: number, north: number, east: number): LatLon[] {
+  return [p(south, west), p(north, west), p(north, east), p(south, east), p(south, west)];
+}
+const draft = (key: string, outline: LatLon[] | null, more: Partial<Draft> = {}): Draft => ({
+  key,
+  regionId: Number(key.slice(1)),
+  channel: null,
+  description: null,
+  outline,
+  removed: null,
+  base: null,
+  ...more,
+});
+
+// West and East share their border at lon -80.0, from 40.0 to 40.1: two corners shared. North sits
+// on top of both, its south corners on their north edges (a T-junction at -80.02, a corner shared
+// with West and East at -80.0 only where it has one there).
+const WEST = draft('r1', square(40.0, -80.05, 40.1, -80.0));
+const EAST = draft('r2', square(40.0, -80.0, 40.1, -79.95));
+const NORTH = draft('r3', [
+  p(40.1, -80.02),
+  p(40.2, -80.02),
+  p(40.2, -79.97),
+  p(40.1, -79.97),
+  p(40.1, -80.02),
+]);
+const CORNER = p(40.1, -80.0);
+
+describe('shared corners (plan 8M-10, C13)', () => {
+  it('are the same point at six decimals in other regions of the server', () => {
+    expect(cornerSharers([WEST, EAST, NORTH], 'r1', CORNER)).toEqual(['r2']);
+    expect(cornerSharers([WEST, EAST, NORTH], 'r1', p(40.1000004, -80.0000004))).toEqual(['r2']);
+    expect(cornerSharers([WEST, EAST, NORTH], 'r1', p(40.000001, -80.0))).toEqual([]);
+    // A corner of one region on the edge of another (a T-junction) is no shared corner.
+    expect(cornerSharers([WEST, EAST, NORTH], 'r3', p(40.1, -80.02))).toEqual([]);
+  });
+
+  it('leave out regions staged for removal and those without an outline', () => {
+    const removed = { ...EAST, removed: 'keep' as const };
+    expect(cornerSharers([WEST, removed, NORTH], 'r1', CORNER)).toEqual([]);
+    expect(cornerSharers([WEST, draft('n0', null)], 'r1', CORNER)).toEqual([]);
+  });
+
+  it('move every corner of an outline at the point, its closing corner too, tidied', () => {
+    expect(movedCorner(EAST.outline ?? [], p(40.0, -80.0), p(40.0, -80.001))).toEqual(
+      square(40.0, -80.001, 40.1, -79.95).map((corner, i) => (i === 1 ? p(40.1, -80.0) : corner)),
+    );
+    // Onto its neighbour: the corner the move repeats is dropped, as the editor keeps outlines.
+    expect(movedCorner(EAST.outline ?? [], CORNER, p(40.1, -79.95))).toEqual([
+      p(40.0, -80.0),
+      p(40.1, -79.95),
+      p(40.0, -79.95),
+      p(40.0, -80.0),
+    ]);
+  });
+
+  it('stage a drag of a shared corner as one batch: one step of undo', () => {
+    const to = p(40.11, -80.001);
+    const dragged = movedCorner(WEST.outline ?? [], CORNER, to);
+    const bases = (keys: readonly string[]) =>
+      Object.fromEntries(keys.map((key) => [key, `v${key}`]));
+    expect(
+      sharedCornerEdit([WEST, EAST, NORTH], { key: 'r1', outline: dragged }, CORNER, to, bases),
+    ).toEqual({
+      kind: 'batch',
+      edits: [
+        { kind: 'outline', key: 'r1', outline: dragged, bases: { r1: 'vr1' } },
+        {
+          kind: 'outline',
+          key: 'r2',
+          outline: movedCorner(EAST.outline ?? [], CORNER, to),
+          bases: { r2: 'vr2' },
+        },
+      ],
+    });
+  });
+
+  it('stage a corner nobody shares, or one dragged apart, as the region’s own outline edit', () => {
+    const bases = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, 'v']));
+    const to = p(40.21, -80.02);
+    const dragged = movedCorner(NORTH.outline ?? [], p(40.2, -80.02), to);
+    const own = { kind: 'outline', key: 'r3', outline: dragged, bases: { r3: 'v' } };
+    expect(
+      sharedCornerEdit(
+        [WEST, EAST, NORTH],
+        { key: 'r3', outline: dragged },
+        p(40.2, -80.02),
+        to,
+        bases,
+      ),
+    ).toEqual(own);
+    // Dragged where it was: nothing moves the others.
+    expect(
+      sharedCornerEdit(
+        [WEST, EAST],
+        { key: 'r1', outline: WEST.outline ?? [] },
+        CORNER,
+        CORNER,
+        bases,
+      ),
+    ).toEqual({
+      kind: 'outline',
+      key: 'r1',
+      outline: WEST.outline,
+      bases: { r1: 'v' },
+    });
+  });
+});
diff --git a/src/domain/regions/shared-corners.ts b/src/domain/regions/shared-corners.ts
new file mode 100644
index 0000000000000000000000000000000000000000..00467b2c8571b60406d9a007b48cb630ea4a7f33
--- /dev/null
+++ b/src/domain/regions/shared-corners.ts
@@ -0,0 +1,77 @@
+import type { LatLon } from '@pine/wayspot-core/lat-lon';
+import type { Bases, Draft, Edit } from './edits.js';
+import { normalisedOutline, roundSix } from './version.js';
+
+/**
+ * Corners regions share (plan 8M-10, C13; Matt's note of 2026-10-18): dragging a corner that two
+ * or three of the server's regions have in common moves it in all of them, as one staged step,
+ * so that a border between neighbours is edited once. A corner is shared where the outlines have
+ * the very same point at six decimals (as the editor keeps them, `normalisedOutline`; the outlines
+ * after Fix and Fix all share their corners exactly). A corner of one region that lies on the side
+ * of another, not at a corner of it (a T-junction), is no shared corner: the other has nothing to
+ * move there. Only the server's own regions, not staged for removal, move together; other servers'
+ * outlines are never edited, so a corner shared with one of them comes apart.
+ */
+
+const samePoint = (a: LatLon, b: LatLon): boolean =>
+  roundSix(a.lat) === roundSix(b.lat) && roundSix(a.lon) === roundSix(b.lon);
+
+/** The regions other than `key` that have a corner at `at` (six decimals), in the drafts' order. */
+export function cornerSharers(drafts: readonly Draft[], key: string, at: LatLon): string[] {
+  return drafts
+    .filter(
+      (draft) =>
+        draft.key !== key &&
+        draft.removed === null &&
+        draft.outline !== null &&
+        draft.outline.some((corner) => samePoint(corner, at)),
+    )
+    .map((draft) => draft.key);
+}
+
+/**
+ * An outline with every corner at `from` moved to `to` (its closing corner too), at six decimals
+ * and tidied as the editor keeps outlines (`normalisedOutline`: a corner the move repeats is
+ * dropped).
+ */
+export function movedCorner(outline: readonly LatLon[], from: LatLon, to: LatLon): LatLon[] {
+  return normalisedOutline(
+    outline.map((corner) => (samePoint(corner, from) ? { lat: to.lat, lon: to.lon } : corner)),
+  );
+}
+
+/**
+ * The staged edit of a corner dragged from `from` to `to` with "Move shared corners together" on:
+ * the dragged region's outline as it was drawn, and every region that had a corner at `from`
+ * with that corner moved too, as one `batch` (one step of undo); without such a region, or with
+ * the corner where it was, the dragged region's own `outline` edit.
+ */
+export function sharedCornerEdit(
+  drafts: readonly Draft[],
+  dragged: { key: string; outline: LatLon[] },
+  from: LatLon,
+  to: LatLon,
+  bases: (keys: readonly string[]) => Bases,
+): Edit {
+  const own: Edit = {
+    kind: 'outline',
+    key: dragged.key,
+    outline: dragged.outline,
+    bases: bases([dragged.key]),
+  };
+  if (samePoint(from, to)) return own;
+  const sharers = cornerSharers(drafts, dragged.key, from);
+  if (sharers.length === 0) return own;
+  return {
+    kind: 'batch',
+    edits: [
+      own,
+      ...sharers.flatMap((key): Edit[] => {
+        const outline = drafts.find((draft) => draft.key === key)?.outline;
+        return outline
+          ? [{ kind: 'outline', key, outline: movedCorner(outline, from, to), bases: bases([key]) }]
+          : [];
+      }),
+    ],
+  };
+}
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index 0c9f8360f5b793cf3f6713cf80e2341598231081..a573b94f7d0c5e1559c232b30d901d01745f35e8 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -71,6 +71,22 @@
   outline-offset: 1px;
 }
 
+/* "Move shared corners together" (plan 8M-10, C13): a switch of the tool row. */
+#editor-tools .tool-switch {
+  display: inline-flex;
+  align-items: center;
+  gap: 6px;
+  margin-left: 4px;
+  color: var(--text-soft);
+  white-space: nowrap;
+  cursor: pointer;
+}
+
+#editor-tools .tool-switch input {
+  margin: 0;
+  accent-color: var(--primary);
+}
+
 /* Its own map in the live map's place (plan 8M-10), its panel in the side pane's. */
 #editor-map {
   position: relative;
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index 5091f43f7e33c207ffea78dd55945861d85ea7d4..2ada7dc9ae98175e0cabaf9149484160c2b4bef4 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -24,6 +24,11 @@ import {
 import type { FixChoice } from '../../domain/regions/fix.js';
 import type { DistanceUnits } from './distance.js';
 import { MAX_NEW_CATEGORY, MAX_NEW_CHANNEL_NAME } from '../../domain/regions/save-plan.js';
+import {
+  cornerSharers,
+  movedCorner,
+  sharedCornerEdit,
+} from '../../domain/regions/shared-corners.js';
 import { splitOutline, type Split } from '../../domain/regions/split.js';
 import { normalisedOutline, roundSix } from '../../domain/regions/version.js';
 import type { EditorData, Point, Worded } from '../../domain/web/editor-data.js';
@@ -78,7 +83,13 @@ import { CLOSE_FORM_FIRST, EDITOR_FAILED, type EditorHosts, type MapView } from
 import type { Me } from './notice.js';
 import { regionLabel, renderNode } from './popup.js';
 import { failureWords, timed } from './request-error.js';
-import { browserStorage, readStaged, writeStaged } from './staged-storage.js';
+import {
+  browserStorage,
+  readMoveTogether,
+  readStaged,
+  writeMoveTogether,
+  writeStaged,
+} from './staged-storage.js';
 import { onThemeChange, theme, type Theme } from './theme.js';
 
 /**
@@ -270,6 +281,13 @@ class Editor {
         waiting: number;
       }
     | undefined;
+  /**
+   * A shared corner being dragged (plan 8M-10, C13): the region dragged, where the corner was,
+   * the regions that share it, and where it was let go.
+   */
+  private cornerDrag: { key: string; from: LatLon; sharers: string[]; to?: LatLon } | undefined;
+  /** "Move shared corners together": on unless the browser keeps it off (`readMoveTogether`). */
+  private moveTogether: boolean;
   /** Fix all: waiting for the worker, or its question. */
   private fixingAll: 'working' | Extract<CoverageAnswer, { kind: 'fix-all' }> | undefined;
   /** The number of the page's last request of Fix all: only the answer to it is taken. */
@@ -319,6 +337,7 @@ class Editor {
     private readonly hosts: EditorHosts,
   ) {
     this.key = storageKey(data.guild.id, data.userId);
+    this.moveTogether = readMoveTogether(this.storage);
     this.loaded = loadedRegions(data);
     this.state = readStaged(this.storage, this.key);
     this.worstFirst = this.state.edits.length === 0 && this.state.undone.length === 0;
@@ -564,6 +583,24 @@ class Editor {
       button('Export KML', () => this.exportKml()),
       button('Save…', () => void this.whileSending(() => this.preview()), !ready.ready, 'primary'),
     );
+    if (!readOnly) tools.append(this.moveTogetherSwitch());
+  }
+
+  /**
+   * "Move shared corners together" (plan 8M-10, C13): on, a corner several regions share moves in
+   * all of them; off, a region's corner is dragged apart. Remembered per browser.
+   */
+  private moveTogetherSwitch(): HTMLElement {
+    const label = element('label', undefined, 'tool-switch');
+    const box = element('input');
+    box.type = 'checkbox';
+    box.checked = this.moveTogether;
+    box.addEventListener('change', () => {
+      this.moveTogether = box.checked;
+      writeMoveTogether(this.storage, box.checked);
+    });
+    label.append(box, 'Move shared corners together');
+    return label;
   }
 
   /** The versions of the loaded regions these keys stand for, as an edit carries them. */
@@ -674,6 +711,16 @@ class Editor {
       const reshaped = (): void => this.reshaped(draft.key, layer);
       layer.on('pm:edit', reshaped);
       layer.on('pm:dragend', reshaped);
+      // A corner dragged: where others share it, they follow (plan 8M-10, C13).
+      layer.on('pm:markerdragstart', (event: { markerEvent: L.LeafletEvent }) => {
+        this.cornerDragStarted(draft.key, event.markerEvent.target as L.Marker);
+      });
+      layer.on('pm:markerdrag', (event: { markerEvent: L.LeafletEvent }) => {
+        this.cornerDragged(event.markerEvent.target as L.Marker);
+      });
+      layer.on('pm:markerdragend', (event: { markerEvent: L.LeafletEvent }) => {
+        this.cornerDropped(event.markerEvent.target as L.Marker);
+      });
       layer.addTo(this.regions);
       this.regionLayers.set(draft.key, layer);
     });
@@ -713,10 +760,74 @@ class Editor {
   /** A region reshaped or moved with Geoman's tools: its outline, staged. */
   private reshaped(key: string, layer: L.Polygon): void {
     const outline = ringOf(layer);
+    const drag = this.cornerDrag;
+    this.cornerDrag = undefined;
+    // A shared corner dragged with "Move shared corners together" on: one batch, every region
+    // that had the corner moved with it (one step of undo), drawn anew once Geoman is through.
+    if (drag?.key === key && drag.to !== undefined && drag.sharers.length > 0) {
+      const made = sharedCornerEdit(
+        this.applied.drafts,
+        { key, outline },
+        drag.from,
+        drag.to,
+        (keys) => this.bases(keys),
+      );
+      if (made.kind === 'batch') {
+        this.edit(made);
+        return;
+      }
+    }
     if (sameRing(this.draft(key)?.outline ?? null, outline)) return;
     this.edit({ kind: 'outline', key, outline, bases: this.bases([key]) });
   }
 
+  /**
+   * A corner's drag began (Geoman's vertex marker): with "Move shared corners together" on, the
+   * regions that have the same corner (`cornerSharers`) are its sharers, and no longer snapped to
+   * while it is dragged (their corner moves with it: the marker would snap to itself).
+   */
+  private cornerDragStarted(key: string, marker: L.Marker): void {
+    this.cornerDrag = undefined;
+    if (!this.moveTogether) return;
+    const at = marker.getLatLng();
+    const from = { lat: roundSix(at.lat), lon: roundSix(at.lng) };
+    const sharers = cornerSharers(this.applied.drafts, key, from);
+    if (sharers.length === 0) return;
+    for (const sharer of sharers) {
+      const layer = this.regionLayers.get(sharer);
+      if (layer) layer.options.snapIgnore = true;
+    }
+    this.cornerDrag = { key, from, sharers };
+  }
+
+  /** The corner dragged on: the sharers' outlines drawn with it where it is now. */
+  private cornerDragged(marker: L.Marker): void {
+    const drag = this.cornerDrag;
+    if (!drag) return;
+    const at = marker.getLatLng();
+    const to = { lat: roundSix(at.lat), lon: roundSix(at.lng) };
+    for (const sharer of drag.sharers) {
+      const outline = this.draft(sharer)?.outline;
+      const layer = this.regionLayers.get(sharer);
+      if (outline && layer) layer.setLatLngs(latLngs(movedCorner(outline, drag.from, to)));
+    }
+  }
+
+  /**
+   * The corner let go: where it ends up, for the edit `pm:edit` stages next (`reshaped`); every
+   * region drawn anew on the next turn, after Geoman is through with the drag (its markers of the
+   * sharers are where they were, and a drag Geoman takes back stages nothing).
+   */
+  private cornerDropped(marker: L.Marker): void {
+    const drag = this.cornerDrag;
+    if (!drag) return;
+    const at = marker.getLatLng();
+    drag.to = { lat: roundSix(at.lat), lon: roundSix(at.lng) };
+    window.setTimeout(() => {
+      this.redraw();
+    }, 0);
+  }
+
   /** The places in no region in the warning colour; after the first time, only those that changed. */
   private recolour(): void {
     const gyms = new Set(this.counts.outsideGyms);
diff --git a/src/web/client/staged-storage.test.ts b/src/web/client/staged-storage.test.ts
index af4d51fc829c9b1ce92704cd1dbb11d632fffdf4..ea383b826b32db0f36d4f2fac945ea1aa5f6a28d 100644
--- a/src/web/client/staged-storage.test.ts
+++ b/src/web/client/staged-storage.test.ts
@@ -1,6 +1,13 @@
 import { describe, expect, it } from 'vitest';
 import { emptyEdits, newKey, record } from '../../domain/regions/edits.js';
-import { browserStorage, readStaged, writeStaged, type KeyValueStorage } from './staged-storage.js';
+import {
+  browserStorage,
+  readMoveTogether,
+  readStaged,
+  writeMoveTogether,
+  writeStaged,
+  type KeyValueStorage,
+} from './staged-storage.js';
 
 class MemoryStorage implements KeyValueStorage {
   readonly items = new Map<string, string>();
@@ -80,3 +87,26 @@ describe('staged edits in the browser', () => {
     ).toBeUndefined();
   });
 });
+
+describe('"Move shared corners together" (plan 8M-10, C13)', () => {
+  it('is on until the browser keeps it off, and is remembered per browser', () => {
+    const storage = new MemoryStorage();
+    expect(readMoveTogether(storage)).toBe(true);
+    writeMoveTogether(storage, false);
+    expect(readMoveTogether(storage)).toBe(false);
+    writeMoveTogether(storage, true);
+    expect(readMoveTogether(storage)).toBe(true);
+    // What the browser keeps under its name but is no choice of ours: on.
+    storage.items.set('pine-region-move-together', 'maybe');
+    expect(readMoveTogether(storage)).toBe(true);
+  });
+
+  it('is on, and never throws, where the browser keeps nothing', () => {
+    const storage = new MemoryStorage();
+    storage.failing = true;
+    expect(readMoveTogether(storage)).toBe(true);
+    expect(() => writeMoveTogether(storage, false)).not.toThrow();
+    expect(readMoveTogether(undefined)).toBe(true);
+    expect(() => writeMoveTogether(undefined, false)).not.toThrow();
+  });
+});
diff --git a/src/web/client/staged-storage.ts b/src/web/client/staged-storage.ts
index 8dd0460c9ebf2263b944014a098bad475b55c365..42928e158c1f2c87c53594995c9ce4518b7503d8 100644
--- a/src/web/client/staged-storage.ts
+++ b/src/web/client/staged-storage.ts
@@ -64,3 +64,25 @@ export function writeStaged(
     return isFull(err) ? 'full' : 'none';
   }
 }
+
+/** Where the browser keeps "Move shared corners together" (plan 8M-10, C13), one for all servers. */
+const MOVE_TOGETHER_KEY = 'pine-region-move-together';
+
+/** Whether a shared corner moves in every region that has it: on unless the browser keeps it off. */
+export function readMoveTogether(storage: KeyValueStorage | undefined): boolean {
+  try {
+    return storage?.getItem(MOVE_TOGETHER_KEY) !== 'off';
+  } catch {
+    return true;
+  }
+}
+
+/** Keeps the choice in the browser, where it keeps anything; never throws. */
+export function writeMoveTogether(storage: KeyValueStorage | undefined, on: boolean): void {
+  try {
+    if (on) storage?.removeItem(MOVE_TOGETHER_KEY);
+    else storage?.setItem(MOVE_TOGETHER_KEY, 'off');
+  } catch {
+    // Kept for this visit only.
+  }
+}
````

### Task 8: 8M-10 task 8: docs, staging checklist, the header one row at 1024

Prototype commit: `cdc1c1f983456af177494cd48ac5b717637862a8`

web.md: a section "The region editor on the map (plan 8M-10)" (who is
offered it, the toggle, nothing polled, loading, its own map in place, the
addresses and narrow screens, the look, "No overlaps or gaps.", Fix in view,
shared corners, the tests), and the addresses, /api/me, the login link, the
bundle, the map page's attributes, the data route's words and the CSP (not
changed: the editor's files are Pine's own) brought up to date. testing.md:
the editor's address as a redirect, the hint's Manage Server on
FakeMemberDirectory, Poller's active() and MapActivity, the draw test's
activity. The staging checklist 2026-10-28-phase-8m10-staging.md (step 0:
npm run web:build).

Measured in the preview: at 1024 pixels the editor's header wrapped to two
and three rows; below 1280 the title is "Pine" while the editor is on and
the switch's words smaller, the buttons' padding a little narrower: one row
from 1024.

**Files:**

```
 docs/architecture/testing.md                            |  6 +++---
 docs/architecture/web.md                                | 36 ++++++++++++++++++++++++++----------
 docs/superpowers/plans/2026-10-28-phase-8m10-staging.md | 48 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor.css                               | 20 +++++++++++++++++++-
 4 files changed, 96 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cdc1c1f983456af177494cd48ac5b717637862a8 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m10-staging.md scripts` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-10 task 8: docs, staging checklist, the header one row at 1024`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 8fcd125051e82bc673d5949506db054e31af68a8..42d465a246f795a52e3b160ab9a816642c5677bd 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -81,7 +81,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## The web server
 
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
-- The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
+- The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too, which the map page names since plan 8M-10 (the editor's address is a redirect to the map with it on, `editor-page.test.ts`). The map's hint of the editor (`/api/me`'s `mayEditRegions`, plan 8M-10) is judged on the web server's `members`: `FakeMemberDirectory.standing(userId, { roleNames, administrator, manageGuild })`. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Plan 8M-8A: it gives the party service's `layoutOf` and `postTitle` (a party's post on the map), and `places` (no place has a picture unless the test passes a fake of `PlacePictures` as `places`); the application emoji's pictures are `webServerWith`'s `emoji` (none by default). A party's post through the route is tested per kind in `party-post-view.test.ts` (a reported raid, hatched or from a screenshot, a max battle, a train with its route and a split, a meetup at a pin), a layout's roles with `roleLines` and `withoutRoles` (`test/support/post-roles.ts`, which each renderer's test uses to see Discord's message unchanged), the page's drawing of a post in `src/web/client/post-draw.test.ts` (trees of nodes), the parser `postText` by its property over random texts (`post-text.test.ts`, a seeded generator of its own). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
 - The post's controls as forms (plan 8M-8B): Group…, Meet…, +1, −1 and the completion question go over `partyWebWith(made, …)` (its `attendance` the service's; `closing` says where the bot may delete posts by the fake gateway: `gateway.noManaging`, and names a forum by `gateway.channelNames`, which a test sets); staff's Delete… and Report… also need `postWebWith(ctx, { staffRoles })` (`test/support/web.ts`: the context's `partyService` and `reports`, of `createTestContext` or of `reportedMeetup`'s `service` and `reports` for the moderators' channel `MOD_CHANNEL`), passed as `posts`; without it every use throws. Meet…'s tests fake `Date` to `PARTY_NOW` (the attendance service reads the clock). Route tests: `party-regroup.test.ts`, `party-meet.test.ts`, `party-close.test.ts`, `party-report.test.ts`; the forms' pure parts `src/web/client/post-forms.test.ts`; `post-forms-ui.ts` is wiring, tried at staging and in the preview.
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`; `/raid`'s own refusal of a forum the member is kept out of in `raid.test.ts`, with `gateway.barred` and a router's `Throttles` to see it uncounted, plan 8M-6; a screenshot's in `mention.test.ts`, whose `setup({ alsoInEast })` puts gyms in East as well).
@@ -89,9 +89,9 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a Power Spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
 - Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept Power Spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
-- Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
+- Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`; its `started` takes an `activity` (`MapActivity`, plan 8M-10) to turn the region editor on and off under both pollers. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node.
-- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand; the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand (whether it asks is its `active()`, the page's `MapActivity` since plan 8M-10: visible and the region editor off); the region editor's toggle over a fake document and a fake mount (`editor-toggle.test.ts`, plan 8M-10); the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 59b381f7cd3c6fc383a79554c38d9e4e2f8cebf2..448a48dcd5d9b1d76bc46b64e6126325736f6ba1 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -16,27 +16,27 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the post's controls as forms, `POST /s/<guild>/api/parties/<party id>/regroup`, `GET` and `POST …/meet`, `POST …/close` and `GET` and `POST …/report` (plan 8M-8B; `postControlRoutes`, `src/web/post-control-routes.ts`: static segments, which Fastify's router takes before the presses' `:action`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>`, `POST …/conductor/<change>`, and `GET` and `POST …/manage` and `…/split` (plan 8M-8C, static segments) (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the post's controls as forms, `POST /s/<guild>/api/parties/<party id>/regroup`, `GET` and `POST …/meet`, `POST …/close` and `GET` and `POST …/report` (plan 8M-8B; `postControlRoutes`, `src/web/post-control-routes.ts`: static segments, which Fastify's router takes before the presses' `:action`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>`, `POST …/conductor/<change>`, and `GET` and `POST …/manage` and `…/split` (plan 8M-8C, static segments) (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit` (since plan 8M-10 a 303 for staff to the map with the editor on, `/s/<guild>/map?edit=regions`), `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
 
 - A session (`Sessions`, `src/web/sessions.ts`) is 32 random bytes in the cookie `__Host-pine_session` (`sessionCookieName`, `sessions.cookieName`; `sessionCookie`: HttpOnly, Secure, SameSite=Lax, path `/`, no Domain, 30 days). The `__Host-` prefix keeps a sibling host of the domain from setting or shadowing it (cookie tossing); a cookie of the plain name is not read then. Where `publicUrl` is plain http (this machine only) the browser keeps no Secure cookie: the name is plain `pine_session`, without Secure. The session is stored as the hex SHA-256 of the cookie in `WebSession` (migration 015; `WebSessionRepository`, its twin `MemoryWebSessions`; what a stored session is, `WebSession`, `WebSessionStore` and `SESSION_MS`, is in `src/web/session-model.ts`, which imports no Fastify, so that the repository does not depend on the web server). It says who the member is (`userId`, the name for the header), never what they may do. `sessions.of(request, reply)` reads the cookie once per request; a session last used an hour ago or more is renewed (row and cookie: 30 days from now). A login (`sessions.start(request, reply, user)`) first deletes the row of the session the request's cookie stands for, if any: a browser has one session, and the old cookie leaves no row behind. Logging out deletes the row and the cookie; the hourly upkeep (`PartyScheduler`, `webSessions`) deletes expired rows.
-- What a member may do is asked per request, from fresh data (spec 2.5): `/api/me` asks `members.find(guild, user)` (kept a minute by the directory; a member who does not count on the map by `settings.web.memberRole` is none) and answers `{ loggedIn, name, member, csrf, readOnly }`, and `missingRole` (the name `settings.web.memberRole` gives, plan 8M-6) for a member of the server who does not count on the map for lack of that role (`countsOnTheMap`, judged on the directory's answer by the route itself), never for somebody not in the server: a member sees the server's roles on Discord, so naming it tells nothing a stranger could learn here; when Discord cannot say, `member: false, readOnly: true`, and the page says it is read-only. The header names the missing role on the map only (`headerLines(me, login, page)`, `src/web/client/notice.ts`): the region editor is for staff, whom the map's role does not concern. One login serves every server; membership is asked per server.
+- What a member may do is asked per request, from fresh data (spec 2.5): `/api/me` asks `members.find(guild, user)` (kept a minute by the directory; a member who does not count on the map by `settings.web.memberRole` is none) and answers `{ loggedIn, name, member, csrf, readOnly, mayEditRegions }`, and `missingRole` (the name `settings.web.memberRole` gives, plan 8M-6) for a member of the server who does not count on the map for lack of that role (`countsOnTheMap`, judged on the directory's answer by the route itself), never for somebody not in the server: a member sees the server's roles on Discord, so naming it tells nothing a stranger could learn here; when Discord cannot say, `member: false, readOnly: true`, and the page says it is read-only. The header names the missing role on the map only (`headerLines(me, login, page)`, `src/web/client/notice.ts`): the region editor is for staff, whom the map's role does not concern. One login serves every server; membership is asked per server.
 - Every POST runs `postGuard(sessions, publicUrl)` (`src/web/csrf.ts`) as its `preHandler`, or in `onRequest` where the route has a body (the region editor's, a party's press), so that a refused request is never parsed: `Origin` must equal `publicUrl` and `X-Pine-CSRF` must be the session's token (`csrfToken`: an HMAC-SHA256 of the session id under a key made at start, compared in constant time); anything else is 403. The one exception is the POST of a login link's page, which has no session yet: it checks `Origin` alone. GETs (and HEADs) change nothing.
 
 ## Logging in
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
-- With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, and whose one script, inline (`CONTINUE_SCRIPT`, `src/web/continue-script.ts`, let in by its hash: no file of its own, which was a third request to `/auth/` for every login), presses the button as the page is shown (Matt, 2026-10-25: no second tap): it submits with `requestSubmit`, or `submit` where a browser lacks it (Safari before 16), then disables the button and puts "Logging you in as <name>…" in place of the sentence, the name read as text from the form's `data-name` (escaped on the page; never HTML built of it), so that a tap while the POST is on its way cannot abort it after the link was spent and land on `?login=expired` (8M-7 review fix 1; `login.test.ts` runs the page's script against a small document of its form, button and sentence). A link preview or a prefetch runs no script, so it cannot spend the link; without script the button stays. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped). Pressed by the script, somebody else's link logs you in as them without a pause; the map's header names whose account it is (Matt's ruling, 2026-10-25). An unknown, used or expired link, or one of another server, leads (303) at once to the page its address names with `?login=expired`. `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, with `?region=<id>` for a link of `/maps` used in a region's channel, plan 8M-7, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The page's plain address is given only as code, after "To share the map, give its address:", which Discord does not make a link: tapped above the button, it opened the page logged out (Matt, 2026-10-25); the button is the one link in the answer. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
+- With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, and whose one script, inline (`CONTINUE_SCRIPT`, `src/web/continue-script.ts`, let in by its hash: no file of its own, which was a third request to `/auth/` for every login), presses the button as the page is shown (Matt, 2026-10-25: no second tap): it submits with `requestSubmit`, or `submit` where a browser lacks it (Safari before 16), then disables the button and puts "Logging you in as <name>…" in place of the sentence, the name read as text from the form's `data-name` (escaped on the page; never HTML built of it), so that a tap while the POST is on its way cannot abort it after the link was spent and land on `?login=expired` (8M-7 review fix 1; `login.test.ts` runs the page's script against a small document of its form, button and sentence). A link preview or a prefetch runs no script, so it cannot spend the link; without script the button stays. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped). Pressed by the script, somebody else's link logs you in as them without a pause; the map's header names whose account it is (Matt's ruling, 2026-10-25). An unknown, used or expired link, or one of another server, leads (303) at once to the page its address names with `?login=expired`. `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, with `?region=<id>` for a link of `/maps` used in a region's channel, plan 8M-7, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by, which leads staff on to the map with the editor on, plan 8M-10); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The page's plain address is given only as code, after "To share the map, give its address:", which Discord does not make a link: tapped above the button, it opened the page logged out (Matt, 2026-10-25); the button is the one link in the answer. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
 - Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`; +1, −1 and the completion question's answers among them since plan 8M-8B), Group…'s moves 30 a minute (`GROUP_WRITES_PER_ADDRESS_MINUTE`, plan 8M-8B), Meet…'s openings and Submits 30 a minute together (`MEET_PER_ADDRESS_MINUTE`), staff's closings 30 a minute (`CLOSE_PER_ADDRESS_MINUTE`), the reports' openings and Submits 30 a minute together (`REPORT_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop; Move…'s, Manage…'s and Split…'s Submits among them since plan 8M-8C), the openings of a train's Manage… and Split… 30 a minute together (`TRAIN_FORMS_PER_ADDRESS_MINUTE`, plan 8M-8C), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`; a stop dragged and dropped is one, plan 8M-8C), the Submits of a train's Move…, Manage… and Split… in the window of the post's controls (plan 8M-8C, as their dialogs count; their openings uncounted, refused while the window is full), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), and so +1, −1, an answer to the completion question and a move of Group… (plan 8M-8B: one use at the move; the form opens from the list, uncounted), Meet…'s Submit in `/meet`'s window (`MEET_WINDOW`, its opening refused while it is full, uncounted, as the post's `checks`), staff's Delete… in that of `/delete`'s dialog (`CLOSE_THROTTLE` of the controls `pclose`), a report in `/report`'s (`REPORT_WINDOW`, its opening refused while it is full, uncounted), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
 
 - `GET /s/<guild>/api/geo` is public: `geoView` (`src/domain/web/geo-view.ts`, pure; its types in `geo-data.ts`, which has no imports so the page can take them) gives the server's regions with an outline (named by their channels as the bot sees them, by their number where it sees none) and the gyms that lie in them (regions, address line, description, notice; places to six decimals; no elite raid gym mark, which Matt took out of everything members see, 2026-10-17: `isEliteGym` and the data stay). Gyms in no region of any server are left out. `GeoCache` (`src/web/geo-cache.ts`) keeps each server's JSON with a strong ETag (the SHA-256 of the JSON, cut) and builds it anew when `GymDirectory.generation` or `RegionDirectory.generation` changed (every load, gym re-read or forget) or a region's channel was renamed; an `If-None-Match` that names it is answered 304 (`etagMatches`: a list of tags compared weakly, `W/` ignored, or `*`), `Cache-Control: no-cache`.
-- The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`). Without a built bundle it answers 503 saying `npm run web:build`.
-- The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
+- The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`; since plan 8M-10 the region editor's `data-editor-script`, `data-editor-style` and `data-worker`, and its hidden hosts, below). Without a built bundle it answers 503 saying `npm run web:build`.
+- The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with its own Leaflet and Geoman, `editor-<hash>.css` with Geoman's CSS, an add-on of the map's stylesheet, and its worker `editor-worker-<hash>.js`; since plan 8M-10 loaded by the map's page when the editor is first turned on); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
 - The page: Leaflet; the tiles of `data-tiles` (`addTiles`, `src/web/client/common.ts`, over `tileLayers`, `src/web/client/layers.ts`, plan 8M-7): Stadia's Alidade Smooth in light and Alidade Smooth Dark in dark (`https://tiles.stadiamaps.com/tiles/alidade_smooth{_dark}/{z}/{x}/{y}{r}.png`, credited "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors" with links, `STADIA_ATTRIBUTION`), drawn anew in the other style when the device changes between light and dark; once Stadia refuses its tiles (three failed in a row with none loaded between, or the first two of the visit: a 401 on a domain it does not know, a 429 past the month's credits; the page cannot tell which, and a tile that loads starts the run again) OpenStreetMap's for the rest of the visit, once (`StadiaFallback`), drawn to zoom 20 with its own pictures enlarged past 19 (`maxNativeZoom`); the credit is the page's own, of the base shown alone (`BaseAttribution`: OpenStreetMap's replaces Stadia's at the switch, none while a Google layer is chosen); OpenStreetMap's alone for `osm`; OpenStreetMap's in dark are darkened by the class `tiles-darkened` on the map's container (a filter of `map.css` on the tile pane: invert, hue turned half round, a little less brightness, contrast and saturation; only while OpenStreetMap's base is shown, never on Google's); with Google's tiles a layer switch (the base first, then roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names below zoom 15 only, where they help to find a region (`regionLabelsShown`, `LABELS_BELOW`, fix round 1; from zoom 12 on before); gyms as dots, all in one color; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is taken out of the address at once and said once `/api/me` answers, only to somebody logged out (`loginNoticeFor`, 8M-7 review fix 5: Back after a link login, or an old link opened while logged in, lands on `?login=expired` with the member's name in the header), on the map and in the region editor alike.
 
 ## The map's frame (plan 8M-7)
@@ -207,14 +207,30 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m9b-stop-reports-map/design.md` (rulin
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
-- **The page** `/s/<guild>/regions/edit` (`editorPage`): the template with `data-worker` (the worker's script). Logged out: 401, a page with "Log in with Discord" (when offered, to `/auth/login?next=…`) and "/region edit", saying why the last login did not happen (`?login=failed|expired`); it never sends anybody to Discord by itself, so a failed login cannot loop. Not staff or no member: 403 "Only staff of this server may edit its regions." Discord unreachable: the page, read-only by its data, only for a member Discord said is staff of the server within the last 30 minutes (`StaffSeen`, `src/web/editor-routes.ts`: a `BoundedMap` of `<guild>:<user>` set by every fresh `staff` answer, dropped by any other answer but `unreachable`); anybody else gets 503 "Discord cannot be reached just now, so I cannot tell whether you are staff." (a page; the data as `{ error }`), so that an outage never shows a server's editor data to somebody who is not staff. 20 a minute per address (each load asks Discord).
-- **The data** `GET /s/<guild>/api/regions/edit` (`EditorCache` over `editorView`, `src/domain/web/editor-view.ts`; types in `editor-data.ts`, without imports): the server's regions (id, channel id and name, category, description, outline, `version`), other servers' regions whose boxes meet the box of the server's outlines grown by 2 km (outlines only), the gyms in its regions and those in no region of any server inside that box (`[id, lat, lon, name]`), the kept Wayspots inside it (`[kind, lat, lon, title]`, no addresses or pictures), the text channels that are no region of any server; places at six decimals. The static part is kept per server until the generations of gyms, regions and Wayspots or the server's channels change; who asks (`userId`, `readOnly`, `mayManageChannels`, and the channels, none while read-only) is put in front per request; the ETag covers both; `private, no-cache`; 20 a minute per address (each asks Discord). 401, 403, 503 as the page (read-only while Discord is unreachable only for staff seen lately, as the page).
+- **The address** `/s/<guild>/regions/edit` (its own page `editorPage` until plan 8M-10; the editor is on the map since, below): for staff a 303 to `/s/<guild>/map?edit=regions` (`editingMapPath`, `src/domain/web/editor-address.ts`, constants of ours). Logged out: 401, a page with "Log in with Discord" (when offered, to `/auth/login?next=…`) and "/region edit", saying why the last login did not happen (`?login=failed|expired`); it never sends anybody to Discord by itself, so a failed login cannot loop. Not staff or no member: 403 "Only staff of this server may edit its regions." Discord unreachable: the redirect (the editor read-only by its data) only for a member Discord said is staff of the server within the last 30 minutes (`StaffSeen`, `src/web/editor-routes.ts`: a `BoundedMap` of `<guild>:<user>` set by every fresh `staff` answer, dropped by any other answer but `unreachable`); anybody else gets 503 "Discord cannot be reached just now, so I cannot tell whether you are staff." (a page; the data as `{ error }`), so that an outage never shows a server's editor data to somebody who is not staff. 20 a minute per address (each load asks Discord).
+- **The data** `GET /s/<guild>/api/regions/edit` (`EditorCache` over `editorView`, `src/domain/web/editor-view.ts`; types in `editor-data.ts`, without imports): the server's regions (id, channel id and name, category, description, outline, `version`), other servers' regions whose boxes meet the box of the server's outlines grown by 2 km (outlines only), the gyms in its regions and those in no region of any server inside that box (`[id, lat, lon, name]`), the kept Wayspots inside it (`[kind, lat, lon, title]`, no addresses or pictures), the text channels that are no region of any server; places at six decimals. The static part is kept per server until the generations of gyms, regions and Wayspots or the server's channels change; who asks (`userId`, `readOnly`, `mayManageChannels`, and the channels, none while read-only) is put in front per request; the ETag covers both; `private, no-cache`; 20 a minute per address (each asks Discord). 401, 403, 503 as the page (read-only while Discord is unreachable only for staff seen lately, as the page), each with its page's words as `{ error }` (plan 8M-10, C2: 403 "Only staff of this server may edit its regions.", 503 "I do not know this server yet. Try again in a moment." or "Discord cannot be reached just now, so I cannot tell whether you are staff."; 401 "Log in first."), which the map says as it turns the editor back off.
 - **Versions:** `regionVersion` (`src/domain/regions/version.ts`): base64url of SHA-256 (written out in pure code, so the page has it too) over the outline at six decimals and the region's description, cut to 16. A changed or removed region is sent with the version its first staged edit saw. Wherever an outline enters a draft (drawn, split, of a file: `record`) and wherever the server takes one (`planSave`), it is `normalisedOutline` (six decimals, a corner the rounding repeats dropped), so page and server see the same corners.
 - **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 while unreachable: "Discord cannot be reached just now, so nothing can be saved. Try again in a moment." to staff it confirmed within 30 minutes, `StaffSeen`, and to anybody else the page's "… so I cannot tell whether you are staff.", which promises no save, plan 8M-6), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file, names and categories up to 1,000 characters: anything beyond is malformed, 400; a new channel's name over 100 characters or its category over 200 is refused by `planSave` with a line naming the region, 422, and the page's fields have those `maxlength`s, a KML description being cut to 200 by `kmlEdit`). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`) in what the import will write (`outlinesWritten`: the areas the preview of `RegionAdminService` leaves out are not written, so a removal whose replacement is left out is checked as a removal alone), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time, at most three waiting beyond it, any more 503 "Busy checking other saves: try again in a minute."; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; polyclip throwing in the thread (its answer `{ ok: false }`) is logged and does not block; a thread that does not start, fails otherwise or ends without an answer is 503 "I cannot check the outlines just now: try again in a minute."), its verdict kept five minutes by a hash of the request, the server's regions (`regionsStamp`) and the areas the import leaves out, never its channels (plan 8M-6: a channel coming or going leaves the outlines as they are), so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", a new channel's name said as typed in the panel, not read from a file: "is it a typo?", "a typo in a name makes a channel of that name", plan 8M-6; and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one of the save changed meanwhile, 409 `conflicts`; then compares what the save was planned and checked against with this server's regions now (`regionsStamp` and `channelsStamp`, plan 8M-6: the versions of its regions, which of its channels is which region, also a row of no server on one of them, and, by id, name, kind and category, only the channels the save depends on: the channels and forums of those regions, the channels it takes by id, and every channel or category whose `channelKey` is a name its areas go to or whose `categoryKey` is a category a new channel of theirs names or that its preview puts one into (a full category's overflow, `<name> 2`, plan 8S-4), a category with how many channels it holds (one filled meanwhile has no room for what was planned); another server's regions and the server's other channels, such as a ticket or voice bot's that come and go all day, are no part of it), and does nothing when anything differs (another save adding the same channel, two saves that together make a new overlap, a channel or category of a name the save would make or use made or renamed on Discord meanwhile), 409 `stale` "The regions changed meanwhile: preview again.", on which the page loads the regions and previews again; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: the bot's mentions as `#name`, no markdown, and outside the code spans of names the bot made (a backtick after an even number of backslashes; one after an odd number was typed) the escapes of `plain` undone by `unplain`: `north_hills`, not `north\_hills`, one backslash for a typed one, `1. Uptown`, a typed backtick as typed; the mentions are named before `unplain`, so a typed `<#…>` stays text; plan 8M-6); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
-- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name stages no channel (`pickerChange`): the channel the region had staged (a name typed before, or one of the list) is taken off with one edit (plan 8M-6: what Save sends is never a name the panel no longer shows), and nothing is recorded when it had none. What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, Power Spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
+- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name stages no channel (`pickerChange`): the channel the region had staged (a name typed before, or one of the list) is taken off with one edit (plan 8M-6: what Save sends is never a name the panel no longer shows), and nothing is recorded when it had none. What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region, outlines that cannot be saved, why Save is off: `editor-view.ts` (since plan 8M-10 no sentence names a color: a swatch of what is drawn, `Swatched`, stands beside it). Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, Power Spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed (`--theirs`) with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
 - **Overlaps and gaps** (`src/domain/regions/coverage.ts`, polyclip-ts): pairwise intersections of outlines whose boxes meet (cached per pair of outlines by identity), gaps the holes of the union less what lies in them (`newProblems` cuts the gaps over the outlines whose boxes chain to what changed, `chainedTo`, so a region that closes a ring of regions is seen to close its hole); areas on the sphere (Lambert cylindrical equal-area); a piece thinner than 0.5 m on average (twice its area over its perimeter) is the six-decimal rounding and left out. A piece is new unless 90 % of its area lies inside one piece of its kind of the loaded outlines (so a shrunk overlap, or one split between two regions, is not new).
 - **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, Power Spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
-- **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
+- **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser. Unchanged by plan 8M-10 too: the map's script adds the editor's script and stylesheet as elements whose addresses are Pine's own `/assets/…` files (`script-src 'self'`, `style-src 'self'`), nothing inline.
+
+## The region editor on the map (plan 8M-10)
+
+Design: `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Admins"); the brief's rulings C1 to C14 (`.superpowers/sdd/2026-10-28-phase-8m10-editor-toggle/design.md`). The editor's rules (versions, edits, coverage, Fix, the save) are those of the section above, unchanged; this is where it lives and how it looks.
+
+- **Who is offered it (C1):** `/api/me` answers `mayEditRegions`, a hint by the member as the directory keeps them (`MemberStanding.manageGuild`, from the member it fetched anyway; `memberStanding`), judged by `mayEditRegions(facts, userId, ownerId)` of `src/web/region-staff.ts`, the one rule `regionStaffAnswer` decides with (a bot management role or the owner, and Manage Server); false while Discord fails, and not concerned by the map's member role. A hint only: the editor's data route asks Discord fresh at every turn-on and decides. Going in by the address opens the editor whatever the hint says (read-only staff during an outage, `StaffSeen`).
+- **The toggle (C6, C7, C8; `editor-toggle.ts`, wired in `main.ts`):** "Edit regions" is an item of the account menu (`showAccount`'s `items`), for a member with the hint, from 1024 pixels (`EDITOR_MIN_WIDTH`, where the header's row of layers shows; narrower the item is neither built nor shown). Turned on (`EditorToggle.turnOn`): refused while a form of the map holds (`FormHold`: route mode, Meet…, a report's step 2, any form), at the press and again when the editor would be shown (a form opened while it loaded: `EditorOpening.show` answers false and nothing shows): "Close the form first."; the editor's script and stylesheet added once and both waited for (`loadOnce`: the stylesheet before anything shows; each file kept or tried again on its own, so that a failed one is added anew at the next press and a loaded script never runs twice, and a script that loaded without registering its mount is added anew: "The region editor could not be loaded. Try again in a moment.", `EDITOR_FAILED`); its data asked (`api/regions/edit`, `cache: no-cache`), a refusal turning it back off with the server's `{ error }` words (`RequestError`, `failureWords`, `src/web/client/request-error.ts`: `getJson` keeps them); then the page shown with it. Anything that fails after (the editor's map, its worker, its start) answers `EDITOR_FAILED`: the mount never rejects, a first build that failed is taken down, and the toggle closes an editor it showed and is off again, ready for the next press. Each toggle empties and hides `#notice` before the other side speaks (a line of the live map is not left over the editor, nor the editor's over the map), and puts the focus on "Back to the map", or back on the account menu's button when off. While it is on, `body.editing-regions` (`map.css`) hides the live map, the list pane, the layers' row, Report, List, Find and the item; the editor's hosts (`#editor-bar` with "Back to the map" and `#editor-tools`, `#editor-map`, `#editor-panel`, hidden by `hidden` while off) show; the address keeps `?edit=regions` (`addressWith`, `replaceState`). "Back to the map" (`turnOff`): the editor closed, the live map shown at the editor's view (Leaflet's `setView` keeps it within the live map's least zoom and bounds), `invalidateSize`; the live layers come back as they were (they were never changed, only hidden), and the staged edits stay in the browser.
+- **Nothing polled (C9):** `MapActivity` (`parties.ts`) says whether the live map is in use: the page visible and the editor off. The pollers of the parties and of the reports at stops ask `Poller`'s `active()` (formerly `visible()`) and are told `activeChanged()` at each change (`PartyFrame.activity`, `StopReportLayerDeps.activity`); off, both ask at once. The places in view are asked only as the live map moves, which it does not while hidden. A page opened by the address starts its pollers once before the editor turns on (it waits for the live map's view and `/api/me`).
+- **Loading (C3):** the editor stays its own IIFE (`editor.ts`, no chunk), named on the map page in `data-editor-script`, `data-editor-style` and `data-worker`; it registers one typed mount, `window.pineRegionEditor` (`EditorMount`, `src/web/client/editor-mount.ts`, types and the two sentences both sides say only), which the map opens with its hosts, the member (`Me`), the units, the tiles and the live map's view, and closes. It bundles its own Leaflet (which sets `window.L` to itself as it loads) and Geoman (which patches that one); the map's code reads its Leaflet only through its imports, never `window.L`.
+- **Its own map in place (C4):** the editor keeps its Leaflet map in `#editor-map`, built at the first opening at the live map's center and zoom, without limits, and kept while hidden. Every opening asks for the data anew (the staff check, fresh) and takes it (`Editor.reopened`: the regions as the server has them, the staged edits applied, the places drawn anew only when they changed, Geoman's tools taken away while read-only and given back); closing (`hidden`) drops a drawing under way and a fix shown or asked for, makes the worker's late answers stale (`seq` and `fixAsk` moved on, the check's timer cleared) and gives back the view; hidden, the editor says nothing and moves no map. "Back to the map" is off while a preview or a save is being sent (`whileSending`; its title says why), so that their answers, the reload and a preview again land in the editor.
+- **Addresses (C5, C6):** `/s/<guild>/regions/edit` keeps its staff check and its 401, 403 and 503 pages; staff are led (303) to `/s/<guild>/map?edit=regions`, also from a login link of `/region edit` (its POST lands on the address). The map then turns the editor on once the live map is drawn, or could not be (`editorByAddress`), and `/api/me` answered, whatever the hint (the data decides). Narrower than 1024 pixels (a phone opening the address) it shows the live map with "Edit regions on a wider screen (1024 pixels or more)." and drops the query: never a dead end. Today's editor never had a layout for phones; the spec leaves a phone layout out.
+- **The look (C10):** the tool row in the place of the layers' row, led by "Back to the map", then Undo, Redo, Fix all slivers…, Load KML, Export KML, Save… (blurple) and the switch "Move shared corners together"; below 1280 pixels the title is "Pine" and the switch's words smaller, so that the header is one row from 1024 (measured in the preview). The panel as the map's side pane: quiet upper-case headings, the regions and the overlaps and gaps as rows, the selected region and Save's dialog as cards with a side bar, gray buttons, blurple for the step a dialog leads to (Save…, Apply, Save these changes), red for "Remove and delete its forum"; Geoman's icons turned light in dark. No sentence names a color: "1 outline cannot be saved.", "In no region: …", "#name: theirs is drawn dashed." stand beside a swatch of what is drawn (`Swatched`, `outsideLine`, `theirsLine`; `.swatch-broken`, `-outside`, `-theirs` in `editor.css`, colored by `theme.css`).
+- **"No overlaps or gaps." (C11, Matt's note c):** said where the list would be only after a check that went through and found none (`coverageSummary`), never while the next check is worked out, before the first, or after a check or the worker failed.
+- **Fix in view (C12, Matt's note d):** Fix… and Fix all slivers… show in a box pinned over the editor map's top right corner, under the layer switch (a Leaflet control taking its own clicks and scrolls; `--fix-box-width`), as a card: its choices scroll inside it, its buttons (Apply, Cancel; Leave it, Stop here, Cancel) stay at its foot. The map is fitted to the stretch in the part the box leaves free (`fixBoxPadding`: a narrow map keeps a third of its width for the stretch), once the box shows the choices.
+- **Shared corners (C13, Matt's note a):** with "Move shared corners together" on (the default; remembered per browser, `readMoveTogether` / `writeMoveTogether`, `localStorage` `pine-region-move-together`, never throwing), dragging a corner that other regions of the server have at the same point at six decimals (`cornerSharers`, `src/domain/regions/shared-corners.ts`; regions staged for removal left out; a corner on another region's side, a T-junction, is shared by nobody) moves it in all of them, staged as one `batch` of `outline` edits, one step of undo (`sharedCornerEdit`, `movedCorner`); off, or with no sharer, the region's own outline edit as before. Other servers' outlines never move, so a corner shared with one comes apart (it was only snapped to). Geoman's side: at `pm:markerdragstart` the sharers are found and set `snapIgnore` (the marker would snap to their corner moving with it), at `pm:markerdrag` their outlines are drawn with the corner, at `pm:markerdragend` the drop is kept for the `pm:edit` that stages the batch, and every region is drawn anew on the next turn, after Geoman is through with the drag. Snapping is as before. Tried in the preview (a spike: the batch staged with both outlines, one Undo taking both back, the switch off dragging one region's corner apart).
+- **Tests:** `/api/me`'s hint in `login.test.ts` ("who is asking"), the rule in `region-staff.test.ts`, the standing's Manage Server in `src/discord/web-members.test.ts`, the data's words in `editor.test.ts`, the redirect in `editor-page.test.ts`, the map page's attributes and hosts in `page.test.ts`, `editor.css` as an add-on in `page-theme.test.ts`; on the page's side `editor-toggle.test.ts` (the address and `editorByAddress`, who is offered it, `loadOnce` over a fake document, `EditorToggle` over a fake mount whose openings the test awaits), `request-error.test.ts`, `MapActivity` and the renamed `Poller` in `parties.test.ts`, both pollers paused in `party-layer-draw.isolated.test.ts` (its `started` takes `activity`), the swatches, "No overlaps or gaps." and `fixBoxPadding` in `editor-view.test.ts`, the switch's memory in `staged-storage.test.ts`, the shared corners in `src/domain/regions/shared-corners.test.ts`. Leaflet, Geoman and the drag are tried in the preview and at staging (`docs/superpowers/plans/2026-10-28-phase-8m10-staging.md`).
 
 ## The Wayspot export tool (plan 8W-P)
 
@@ -230,7 +246,7 @@ The tool that makes the Wayspot export is private (`wayfarer.md`); the owner's i
 
 ## Restyling the page
 
-- Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, so that each page follows the device's light or dark (no switch on the page). The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, gray `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`, and a party's post its post's own, `--accent-<name>` (plan 8M-8A, `PostAccent`), the same in light and dark as on Discord; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it and `editor.css` imports `map.css`; `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again when the device changes between light and dark (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')`, `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws gray): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
+- Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, so that each page follows the device's light or dark (no switch on the page). The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, gray `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`, and a party's post its post's own, `--accent-<name>` (plan 8M-8A, `PostAccent`), the same in light and dark as on Discord; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it, and `editor.css` is an add-on loaded beside `map.css` when the editor is first turned on (plan 8M-10: it imports neither again); `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again when the device changes between light and dark (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')`, `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws gray): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
 - To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new color is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` checks that the light and dark sets name the same values and that every page's stylesheet imports `theme.css`, and refuses a color written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a color function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colors (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a color function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named color (a sentence may name a color: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the gray of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
 
 ## Adding a route
diff --git a/docs/superpowers/plans/2026-10-28-phase-8m10-staging.md b/docs/superpowers/plans/2026-10-28-phase-8m10-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..3527bdf9ae361172047d345c3899c8f9f2057327
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-28-phase-8m10-staging.md
@@ -0,0 +1,48 @@
+# Phase 8M-10 staging checklist: the region editor on the map
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the steps that need his hand on the editor.
+
+- **Accounts:** Googer (owner, staff: Manage Server and a moderator role), Tester (a member, no staff role).
+- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m10-editor-toggle/design.md` (goals 1 to 8, rulings C1 to C14).
+- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Admins"; "Follows the device's light or dark").
+- **Conventions:** `docs/architecture/web.md` ("The region editor on the map (plan 8M-10)", "The region editor (plans 8M-2, 8M-2F)").
+- **Devices:** a desktop browser, light and dark, at 1280 and 1024 pixels and narrowed to 1023 and 800; a phone for step 4.
+- **Do not save** on the test server unless Matt says so: every step but 15 stages edits and takes them back (Undo, or the browser's storage cleared). Step 15 saves one small change and saves it back.
+
+## Before
+
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: it reads `dist/web/assets.json` once at startup. No migration, no setting, no command change: no deploy.
+1. **The test server's regions.** The dev database's regions of the test server (`var/stage/TEST-SERVER-STATE.md`). Note one corner two regions share (the outlines after a Fix all share theirs exactly) and one overlap or gap Fix… is offered for, or make one by moving a corner apart in step 12 first.
+
+## Who is offered it (goal 1, C1, C6, C7)
+
+2. **Staff.** As Googer on the map from 1024 pixels: the account menu (the name's button) holds "Edit regions" above Log out. In devtools' network, `/api/me` answers `mayEditRegions: true`, and loading the map asks Discord nothing more than before (the directory's look-up).
+3. **Not staff.** As Tester: no "Edit regions"; `/api/me` says `mayEditRegions: false`. Open `/s/<guild>/map?edit=regions` by hand: the live map, and "Only staff of this server may edit its regions." under the header; `/api/regions/edit` answered 403 with those words, and nothing of the editor shown. The editor's files (`editor-….js` and `.css`) are loaded before that 403 (the data decides, after them): expected, they hold no data of the server.
+4. **Narrow.** As Googer narrowed to 1023: no "Edit regions" in the menu. At 800 and on a phone, `/region edit`'s button (or `/s/<guild>/regions/edit`): the live map with "Edit regions on a wider screen (1024 pixels or more).", the address without `?edit=regions`; nothing else breaks (the list, Layers).
+
+## Turning it on and off (goals 2 and 3, C4, C5, C8, C9)
+
+5. **On.** At 1280, the live map zoomed into one region, "Edit regions": the live map, the list pane, the layers' row, Report, Find and the item make way for the editor: its own map at the same place and zoom, its panel on the right, the tool row "Back to the map", Undo, Redo, Fix all slivers…, Load KML, Export KML, Save…, "Move shared corners together" (ticked). The address ends `?edit=regions`. Zoom out past the live map's least zoom and pan beyond its margin: no limit. In devtools' network: `editor-….js` and `.css` loaded once, then `/api/regions/edit`; while the editor is on no `/api/parties` nor `/api/stop-reports` for a minute (twice the 20 s), also after hiding and showing the tab.
+6. **Off.** "Back to the map": the live map at the editor's view (zoomed back within its own limits and margin if the editor went beyond them), the layers as they were (a layer turned off before stays off), the list, Report; `/api/parties` and `/api/stop-reports` asked at once, then every 20 s; the address without `?edit=regions`. Turn it on again: no second load of the editor's files, `/api/regions/edit` asked again (the staff check, fresh), the edits staged before still staged (Undo offered).
+7. **A form holds.** Open a raid's Meet… (or route mode of a train, or the Report button's step 2), then "Edit regions": "Close the form first.", the editor stays off. Close the form: it turns on.
+8. **The address.** `/region edit` in Discord as Googer, its button: the login link lands on `/s/<guild>/regions/edit`, which leads to `/s/<guild>/map?edit=regions` with the editor on. Logged out, `/s/<guild>/regions/edit` is the login page as before (401); as Tester, 403 "Only staff of this server may edit its regions."
+9. **Discord away (optional).** With the bot's network to Discord cut for a moment after step 5: turning the editor on as Googer shows it read-only ("Discord cannot be reached just now, so the editor is read-only.", no Geoman tools, Save off); Tester's `?edit=regions` gets "Discord cannot be reached just now, so I cannot tell whether you are staff."
+
+## The look (goal 4, C10, C11)
+
+10. **Light and dark.** At 1280 and 1024, light and dark (switch the device): the header one row (the title "Pine" below 1280), the tool row's buttons gray with Save… blurple, the panel's headings, rows, the selected region's card with "Remove and delete its forum" red, Save…'s preview as a card; Geoman's tools readable in dark. No sentence names a color: "1 outline cannot be saved." (with a red square beside it, after drawing a region that crosses itself), "In no region: …" with an orange dot; "#name: theirs is drawn dashed." with a dashed swatch only when a region was saved by somebody else meanwhile (during step 15, in a second tab with a change of the same region staged).
+11. **"No overlaps or gaps."** With every overlap and gap fixed (stage a Fix all slivers… if any are left): "No overlaps or gaps." in green where the list was; while the next check runs after an edit (the panel says "The overlaps and gaps are being worked out."), it is not said.
+
+## Fix in view and shared corners (goals 5 and 7, C12, C13)
+
+12. **Shared corners.** In edit mode (Geoman's edit tool), drag the noted shared corner: both regions' outlines follow it as it moves, both staged; one Undo takes both back. Untick "Move shared corners together" and drag it again: only the dragged region's corner moves (a gap or overlap appears in the list). Reload: the switch is still unticked; tick it. A corner on another region's side (a T-junction) moves alone. A corner shared with another server's outline (dashed gray) comes apart from it.
+13. **Fix….** Scroll the panel to the bottom, then Fix… of an overlap or gap: the box at the map's top right corner, its choices inside it, Apply and Cancel at its foot in sight without scrolling; the map fitted to the sliver left of the box. Take each choice: dashed on the map, Apply staged as one change ("Fixed, as one change: Undo takes it back."); Undo.
+14. **Fix all slivers….** The box with its question, Leave it, Stop here and Cancel at its foot; the map at each stretch beside the box; Cancel.
+
+## Save (optional, Matt's go-ahead)
+
+15. **One save.** Move one shared corner a few meters, Save…: the preview names both regions; Save these changes: saved, the editor reloaded with the new outlines. While the preview and the save are being sent, "Back to the map" is off, its title "Wait for the answer of the preview or the save." (devtools' network throttling makes the moment long enough to see). Then move it back and save again. Nothing else is saved.
+
+## After
+
+16. **Back to how it was.** Clear the editor's staged edits (Undo to the start, or the browser's storage `pine-region-edits:<guild>:<user>`), the switch ticked, the map's layers as before the run.
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index a573b94f7d0c5e1559c232b30d901d01745f35e8..de17c9f4265707dbd3e99187cbda1c1eb68d63b3 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -23,7 +23,7 @@
   background: var(--secondary);
   border: 0;
   border-radius: var(--radius);
-  padding: 5px 12px;
+  padding: 5px 10px;
   font: inherit;
   font-weight: 500;
   cursor: pointer;
@@ -71,6 +71,24 @@
   outline-offset: 1px;
 }
 
+/*
+ * The header one row from 1024 pixels while the editor is on (measured in the preview at 1024
+ * and 1280): the title is "Pine" below 1280, as on a phone, for the tool row's room.
+ */
+@media (max-width: 1279px) {
+  body.editing-regions #header .title-first {
+    display: none;
+  }
+
+  /* The switch's words in two short lines. */
+  #editor-tools .tool-switch {
+    max-width: 130px;
+    font-size: 13px;
+    line-height: 1.15;
+    white-space: normal;
+  }
+}
+
 /* "Move shared corners together" (plan 8M-10, C13): a switch of the tool row. */
 #editor-tools .tool-switch {
   display: inline-flex;
````

## After the last task

- [ ] `npm run check > var/8m10-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff cdc1c1f983456af177494cd48ac5b717637862a8 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
