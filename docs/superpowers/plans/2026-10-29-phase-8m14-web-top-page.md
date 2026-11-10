# Phase 8M-14: The Web's Top Page: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** somebody who opens Pine's bare address reaches the real map: logged out, always one page offering "Log in with Discord"; logged in, their servers' maps (exactly one: straight to it) and the servers they could join by an invite the admin set; no server named to anybody logged out.

- **Task 1:** which servers have a map (`serversWithMap` in `WebDeps`, `mapServers` and `joinedServers`), `localPath` taking `/`, and the pure decision `topAnswer`.
- **Task 2:** the route `GET /` and its pages (`top-routes.ts`, `top-page.ts`, `shortDocument`): no-store before a limit of 30 a minute per address, membership lookups in parallel with 5 seconds each, the logged-out mark.
- **Task 3:** Log out on the page (`/assets/top.js`, unhashed, through the map's `logOut`), the look in `pages.css`, `web.md`.

**Tech stack:**
- TypeScript 6.0, Node 26, Fastify, esbuild, Vitest.
- No new dependency, no migration, no setting, no command change (no deploy).

**Spec:** `docs/superpowers/specs/2026-10-29-web-top-page-design.md` (approved by Matt 2026-10-29; amended after the prototype's review: `serversWithMap` returns a promise and starts from the outlined regions' rows by `guilds.snowflakeOf`; membership lookups wait at most 5 seconds). With it: the brief `.superpowers/sdd/2026-10-29-web-top-page/brief-proto.md` (git-ignored).

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8m14` (tip `5d41d58a`), one commit per task, on `web-top-page` e0bb9ea2.
- Each commit typechecks (root and `src/web/client`) and passes its tests.
- On the final tip the full check, the build and the database suite passed.

**Reviews:**
- **The prototype:** an Opus review found 2 Important (a server not yet delivered by Discord, without a name, made the logged-in page fail; Log out's second look at `/` followed redirects and could say "done" while still logged in) and 5 Minor (no time limit on the lookups; the account line split by flex; long names overflowing; a query per server without a row on every load; tests missing for the join list's escaping, HEAD on the redirect and a logged-out load asking nobody).
- **The controller's ruling (finding 6):** start from the outlined regions' rows, mapped by the cached `guilds.snowflakeOf`, intersected with the available joined servers; the design amended.
- **Fix round 1:** folded in; a scoped re-review found every finding addressed and nothing new.
- **Calls the prototype made, for Matt to object to:** "No map here yet" before the login check (no Log out there); headings "Your servers" and "Servers you could join"; "Logged in as <name>" with a gray Log out; the failed-login line first; the partial-failure line under their servers; a server whose lookup failed never offered to join; the failure line only where the Discord login is configured.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck (root and client) and its own test files.
- The full check, the build and the database suite run once, on the tip.
- Work in `../Professor-Pine-toppage` on `web-top-page`; never commit in the main checkout.

## Review Focus

- A logged-out visitor learns no server's name or count, and asks Discord nothing.
- No redirect leaves `/s/<snowflake>/map` or `/auth/login?next=/`; `localPath` takes `/` exactly and nothing like it.
- Every answer of `/` (200, 302, 429, HEAD) is `no-store`.
- A server or visitor name with HTML or direction marks is shown as text, in `<bdi>`.
- Log out never says it worked while the session stands.

---

### Task 1: 8M-14 task 1: which servers have a map, and the answer of the top page

Prototype commit: `7a6f3c7cf1426e761f8f0344efdf3f8de799d97d`

serversWithMap in WebDeps (mapServers: the servers the bot is in and can read, with a region
that has an outline, from the outlined regions' rows by guilds.snowflakeOf, a region counted
whatever its channel), wired in the app through joinedServers; localPath takes / exactly;
topAnswer decides the answer of / from the servers with a map, the login, the membership
lookups, the invites and ?login=failed.

**Files:**

```
 docs/architecture/testing.md |   2 +-
 src/app.ts                   |   7 +++
 src/web/local-path.test.ts   |  10 +++-
 src/web/local-path.ts        |   8 ++-
 src/web/map-servers.test.ts  | 111 ++++++++++++++++++++++++++++++++++
 src/web/map-servers.ts       |  65 ++++++++++++++++++++
 src/web/server.ts            |   6 ++
 src/web/top-answer.test.ts   | 203 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/top-answer.ts        |  75 +++++++++++++++++++++++
 test/support/web.ts          |  11 ++++
 10 files changed, 492 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/local-path.test.ts src/web/map-servers.test.ts src/web/top-answer.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7a6f3c7cf1426e761f8f0344efdf3f8de799d97d -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-14 task 1: which servers have a map, and the answer of the top page`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index a9af530a..8d74a899 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -82,7 +82,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## The web server
 
-- Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
+- Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), no server with a map for the top page (`serversWithMap`: a list of `{ id, name }`, or a function of the test's; plan 8M-14), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
 - The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too, which the map page names since plan 8M-10 (the editor's address is a redirect to the map with it on, `editor-page.test.ts`). The map's hint of the editor (`/api/me`'s `mayEditRegions`, plan 8M-10) is judged on the web server's `members`: `FakeMemberDirectory.standing(userId, { roleNames, administrator, manageGuild })`. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Plan 8M-8A: it gives the party service's `layoutOf` and `postTitle` (a party's post on the map), and `places` (no place has a picture unless the test passes a fake of `PlacePictures` as `places`); the application emoji's pictures are `webServerWith`'s `emoji` (none by default). A party's post through the route is tested per kind in `party-post-view.test.ts` (a reported raid, hatched or from a screenshot, a max battle, a train with its route and a split, a meetup at a pin), a layout's roles with `roleLines` and `withoutRoles` (`test/support/post-roles.ts`, which each renderer's test uses to see Discord's message unchanged), the page's drawing of a post in `src/web/client/post-draw.test.ts` (trees of nodes), the parser `postText` by its property over random texts (`post-text.test.ts`, a seeded generator of its own). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
 - The post's controls as forms (plan 8M-8B): Group…, Meet…, +1, −1 and the completion question go over `partyWebWith(made, …)` (its `attendance` the service's; `closing` says where the bot may delete posts by the fake gateway: `gateway.noManaging`, and names a forum by `gateway.channelNames`, which a test sets); staff's Delete… and Report… also need `postWebWith(ctx, { staffRoles })` (`test/support/web.ts`: the context's `partyService` and `reports`, of `createTestContext` or of `reportedMeetup`'s `service` and `reports` for the moderators' channel `MOD_CHANNEL`), passed as `posts`; without it every use throws. Meet…'s tests fake `Date` to `PARTY_NOW` (the attendance service reads the clock). Route tests: `party-regroup.test.ts`, `party-meet.test.ts`, `party-close.test.ts`, `party-report.test.ts`; the forms' pure parts `src/web/client/post-forms.test.ts`; `post-forms-ui.ts` is wiring, tried at staging and in the preview.
diff --git a/src/app.ts b/src/app.ts
index 28c04291..0fc3a61c 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -162,6 +162,7 @@ import { DiscordOAuth } from './web/discord-oauth.js';
 import { SaveCheckWorker } from './web/save-check.js';
 import { EditorCache } from './web/editor-cache.js';
 import { GeoCache } from './web/geo-cache.js';
+import { joinedServers, mapServers } from './web/map-servers.js';
 import { readAssets } from './web/page.js';
 import { WayspotToolFiles } from './services/wayspot-tool.js';
 import { ScriptAccessService } from './services/script-access-service.js';
@@ -1299,6 +1300,12 @@ export async function startApp(
       googleKey: config.env.GOOGLE_MAPS_BROWSER_KEY,
       distanceUnits: config.settings.distanceUnits,
       servers: { has: (guildId) => client.guilds.cache.has(guildId) },
+      // The top page's servers (plan 8M-14): those the bot is in with a region that has an outline.
+      serversWithMap: mapServers({
+        joined: () => joinedServers(client.guilds.cache.values()),
+        guilds,
+        regions,
+      }),
       members,
       sessions: webSessions,
       // "Log in with Discord" only with the client secret; the links of /maps work without it.
diff --git a/src/web/local-path.test.ts b/src/web/local-path.test.ts
index 97210ef8..dff479ab 100644
--- a/src/web/local-path.test.ts
+++ b/src/web/local-path.test.ts
@@ -2,8 +2,9 @@ import { describe, expect, it } from 'vitest';
 import { localPath } from './local-path.js';
 
 describe('localPath', () => {
-  it("takes a path of a server's pages, and the tool's page exactly", () => {
+  it("takes a path of a server's pages, the tool's page and the top page exactly", () => {
     for (const path of [
+      '/',
       '/s/412345678901234567/map',
       '/s/412345678901234567/regions/edit',
       '/s/412345678901234567/',
@@ -17,7 +18,12 @@ describe('localPath', () => {
     for (const path of [
       undefined,
       '',
-      '/',
+      '//',
+      '//x',
+      '/\\x',
+      '/?x',
+      '/#x',
+      ' /',
       'https://evil.example.test/s/412345678901234567/map',
       '//evil.example.test/s/412345678901234567/map',
       '/\\evil.example.test',
diff --git a/src/web/local-path.ts b/src/web/local-path.ts
index 3371952a..524844de 100644
--- a/src/web/local-path.ts
+++ b/src/web/local-path.ts
@@ -6,14 +6,16 @@ const SERVER_PAGE = /^\/s\/\d{15,20}(?:\/(?!\.\.?(?:\/|$))[A-Za-z0-9._~-]+)*\/?$
 const MAX_LENGTH = 200;
 /** The page of the Wayspot export tool (plan 8W-P), not of a server: taken only exactly. */
 const TOOL_PAGE = '/userscript';
+/** The top page (plan 8M-14): its servers or the login; taken only exactly. */
+const TOP_PAGE = '/';
 
 /**
- * The path a login may return to (`next`), or undefined: only a page of a server here, or the
- * tool's page `/userscript` exactly, never an address that a browser would take to another site
+ * The path a login may return to (`next`), or undefined: only a page of a server here, the
+ * tool's page `/userscript` or the top page `/` exactly, never an address that a browser would take to another site
  * (`//host`, `/\host`, a scheme) or anything with a query, an escape or a line break in it. An
  * open redirect is a finding.
  */
 export function localPath(path: unknown): string | undefined {
   if (typeof path !== 'string' || path.length > MAX_LENGTH) return undefined;
-  return path === TOOL_PAGE || SERVER_PAGE.test(path) ? path : undefined;
+  return path === TOP_PAGE || path === TOOL_PAGE || SERVER_PAGE.test(path) ? path : undefined;
 }
diff --git a/src/web/map-servers.test.ts b/src/web/map-servers.test.ts
new file mode 100644
index 00000000..2afa4268
--- /dev/null
+++ b/src/web/map-servers.test.ts
@@ -0,0 +1,111 @@
+import { describe, expect, it } from 'vitest';
+import { joinedServers, mapServers, type MapServerSources } from './map-servers.js';
+
+const OUTLINE = [
+  { lat: 40, lon: -80 },
+  { lat: 40.01, lon: -80 },
+  { lat: 40.01, lon: -79.99 },
+  { lat: 40, lon: -80 },
+];
+
+/** A region of a server's row, with an outline or without. */
+const region = (guildId: number | null, outlined: boolean, channelId = '600000000000000001') => ({
+  guildId,
+  channelId,
+  bounds: outlined ? OUTLINE : null,
+});
+
+/**
+ * Servers the bot is in, the rows of servers (snowflake to row id), and the regions of the rows;
+ * `asked` records each row whose snowflake was asked for.
+ */
+function sources(
+  joined: { id: string; name: string }[],
+  rows: Record<string, number>,
+  regions: ReturnType<typeof region>[],
+) {
+  const asked: number[] = [];
+  const made: MapServerSources = {
+    joined: () => joined,
+    guilds: {
+      snowflakeOf(id) {
+        asked.push(id);
+        return Promise.resolve(Object.entries(rows).find(([, row]) => row === id)?.[0]);
+      },
+    },
+    regions: { all: () => regions },
+  };
+  return { made, asked };
+}
+
+describe('mapServers', () => {
+  it('gives the servers the bot is in that have a region with an outline', async () => {
+    const { made } = sources(
+      [
+        { id: '410000000000000001', name: 'Pinewood' },
+        { id: '410000000000000002', name: 'Oakvale' },
+        { id: '410000000000000003', name: 'No row yet' },
+        { id: '410000000000000004', name: 'No regions' },
+      ],
+      {
+        '410000000000000001': 1,
+        '410000000000000002': 2,
+        '410000000000000004': 4,
+        '419999999999999999': 3,
+      },
+      [
+        region(1, true),
+        region(1, false),
+        // Only a region without an outline: an empty map is no place to send anybody.
+        region(2, false),
+        // The server of row 3 is one the bot is not in: never named.
+        region(3, true),
+        region(null, true),
+      ],
+    );
+    expect(await mapServers(made)()).toEqual([{ id: '410000000000000001', name: 'Pinewood' }]);
+  });
+
+  it('asks only for the rows of regions with an outline, once each, whatever the servers joined', async () => {
+    const joined = Array.from({ length: 50 }, (_, i) => ({
+      id: `4200000000000000${String(i).padStart(2, '0')}`,
+      name: `Server ${i}`,
+    }));
+    const { made, asked } = sources(joined, { '420000000000000007': 7 }, [
+      region(7, true),
+      region(7, true, '600000000000000002'),
+      region(8, false),
+    ]);
+    expect(await mapServers(made)()).toEqual([{ id: '420000000000000007', name: 'Server 7' }]);
+    expect(asked).toEqual([7]);
+  });
+
+  it('counts a region whose channel is gone, as the map draws it', async () => {
+    // No channels are asked at all: a region's outline is enough.
+    const { made } = sources(
+      [{ id: '410000000000000001', name: 'Pinewood' }],
+      { '410000000000000001': 1 },
+      [region(1, true, '699999999999999999')],
+    );
+    expect(await mapServers(made)()).toEqual([{ id: '410000000000000001', name: 'Pinewood' }]);
+  });
+
+  it('gives none while the bot is in no server', async () => {
+    const { made } = sources([], { '410000000000000001': 1 }, [region(1, true)]);
+    expect(await mapServers(made)()).toEqual([]);
+  });
+});
+
+describe('joinedServers', () => {
+  it('keeps the servers Discord has made available, with their names', () => {
+    expect(
+      joinedServers([
+        { id: '410000000000000001', available: true, name: 'Pinewood' },
+        // An outage: Discord sends the server without its name until it is available again.
+        { id: '410000000000000002', available: false, name: undefined },
+        { id: '410000000000000003', available: false, name: 'Oakvale' },
+        { id: '410000000000000004', available: true, name: undefined },
+      ]),
+    ).toEqual([{ id: '410000000000000001', name: 'Pinewood' }]);
+  });
+});
diff --git a/src/web/map-servers.ts b/src/web/map-servers.ts
new file mode 100644
index 00000000..82a6dddc
--- /dev/null
+++ b/src/web/map-servers.ts
@@ -0,0 +1,65 @@
+import type { Region } from '../db/repositories/region-repository.js';
+
+/** A server with a map, as the top page names it: its snowflake and its name as the bot sees it. */
+export interface MapServer {
+  id: string;
+  name: string;
+}
+
+/** What the servers with a map are found from. */
+export interface MapServerSources {
+  /** The servers the bot is in and Discord has made available (`joinedServers`), with names. */
+  joined(): readonly MapServer[];
+  /**
+   * The snowflake of a server's row (`Guild.id`), by which its regions say whose they are
+   * (`GuildRepository.snowflakeOf`, kept in the process's memory once seen).
+   */
+  guilds: { snowflakeOf(id: number): Promise<string | undefined> };
+  /** The regions as loaded. */
+  regions: { all(): readonly Pick<Region, 'guildId' | 'bounds'>[] };
+}
+
+/** A server in the client's cache, as `joinedServers` reads it. */
+export interface CachedServer {
+  id: string;
+  available: boolean;
+  name: string | null | undefined;
+}
+
+/**
+ * The servers the bot is in that Discord has made available, with their names: during an outage
+ * Discord sends a server unavailable, without its name, until it comes back.
+ */
+export function joinedServers(guilds: Iterable<CachedServer>): MapServer[] {
+  const servers: MapServer[] = [];
+  for (const guild of guilds) {
+    if (guild.available && typeof guild.name === 'string') {
+      servers.push({ id: guild.id, name: guild.name });
+    }
+  }
+  return servers;
+}
+
+/**
+ * The servers with a map (plan 8M-14, the top page): the servers the bot is in that have at
+ * least one region with an outline, which `/s/<guild>/api/geo` would draw (`geoView`); a region
+ * counts whatever its channel, as the map draws one whose channel is gone. It starts from the
+ * regions with an outline: their rows are turned into snowflakes (`guilds.snowflakeOf`, once per
+ * row), which are then kept to the servers joined; a server joined without a row or without
+ * such a region costs nothing. The view itself is never built for this.
+ */
+export function mapServers(sources: MapServerSources): () => Promise<MapServer[]> {
+  return async () => {
+    const rows = new Set<number>();
+    for (const region of sources.regions.all()) {
+      if (region.bounds !== null && region.guildId !== null) rows.add(region.guildId);
+    }
+    const snowflakes = new Set(
+      await Promise.all([...rows].map((row) => sources.guilds.snowflakeOf(row))),
+    );
+    return sources
+      .joined()
+      .filter((server) => snowflakes.has(server.id))
+      .map(({ id, name }) => ({ id, name }));
+  };
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index b45c3b1f..525b8202 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -20,6 +20,7 @@ import type { GeoCache } from './geo-cache.js';
 import { guildRoutes } from './guild-routes.js';
 import { securityHeaders, shownTiles } from './headers.js';
 import type { LoginLinks } from './login-links.js';
+import type { MapServer } from './map-servers.js';
 import type { MaxWebDeps } from './max-routes.js';
 import type { MeetupWebDeps } from './meetup-routes.js';
 import { HASHED_NAME, type WebAssets } from './page.js';
@@ -47,6 +48,11 @@ export interface WebDeps {
   distanceUnits: DistanceUnits;
   /** The servers the bot is in (the client's cache): any other is not found. */
   servers: { has(guildId: string): boolean };
+  /**
+   * The servers with a map (plan 8M-14, the top page): those the bot is in with a region that
+   * has an outline, with their names (`mapServers`). Never shown to anybody logged out.
+   */
+  serversWithMap(): Promise<MapServer[]>;
   /** Whether somebody is a member of a server: asked per request, never kept in a session. */
   members: Pick<MemberDirectory, 'find'>;
   sessions: Sessions;
diff --git a/src/web/top-answer.test.ts b/src/web/top-answer.test.ts
new file mode 100644
index 00000000..1066d4e1
--- /dev/null
+++ b/src/web/top-answer.test.ts
@@ -0,0 +1,203 @@
+import { describe, expect, it } from 'vitest';
+import { topAnswer, type Membership, type TopFacts } from './top-answer.js';
+
+const PINEWOOD = { id: '410000000000000001', name: 'Pinewood' };
+const OAKVALE = { id: '410000000000000002', name: 'Oakvale' };
+const ELMHURST = { id: '410000000000000003', name: 'Elmhurst' };
+const OAK_INVITE = 'https://discord.gg/oakvale';
+const ELM_INVITE = 'https://discord.com/invite/elmhurst';
+
+/** The facts of a request: two servers with a map, logged out, Discord's login on. */
+function facts(change: Partial<TopFacts> = {}): TopFacts {
+  return {
+    servers: [PINEWOOD, OAKVALE],
+    visitor: undefined,
+    discordLogin: true,
+    memberships: new Map(),
+    invites: undefined,
+    loginFailed: false,
+    ...change,
+  };
+}
+
+/** Logged in as Ash, with these answers of the member directory. */
+const ash = (memberships: Record<string, Membership>, change: Partial<TopFacts> = {}) =>
+  facts({ visitor: { name: 'Ash' }, memberships: new Map(Object.entries(memberships)), ...change });
+
+describe('topAnswer', () => {
+  it('says there is no map here yet while no server has one, logged in or not (rule 2)', () => {
+    expect(topAnswer(facts({ servers: [] }))).toEqual({ kind: 'no-map' });
+    expect(topAnswer(ash({}, { servers: [] }))).toEqual({ kind: 'no-map' });
+    expect(topAnswer(facts({ servers: [], loginFailed: true }))).toEqual({ kind: 'no-map' });
+  });
+
+  it('offers the login to a visitor not logged in, whatever the number of servers (rules 3, 5)', () => {
+    const one = topAnswer(facts({ servers: [PINEWOOD] }));
+    const several = topAnswer(facts({ servers: [PINEWOOD, OAKVALE, ELMHURST] }));
+    expect(one).toEqual({ kind: 'login', discord: true, failed: false });
+    // A visitor logged out cannot tell one server from several, nor see any invite.
+    expect(several).toEqual(one);
+    expect(topAnswer(facts({ invites: { [OAKVALE.id]: OAK_INVITE } }))).toEqual(one);
+  });
+
+  it('says only /maps without the client secret, and that a login failed after one did (rule 3)', () => {
+    expect(topAnswer(facts({ discordLogin: false }))).toEqual({
+      kind: 'login',
+      discord: false,
+      failed: false,
+    });
+    expect(topAnswer(facts({ loginFailed: true }))).toEqual({
+      kind: 'login',
+      discord: true,
+      failed: true,
+    });
+  });
+
+  it('leads straight to the map of the one server of theirs, with none to join and every answer in (rule 4)', () => {
+    expect(topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not' }))).toEqual({
+      kind: 'redirect',
+      to: `/s/${PINEWOOD.id}/map`,
+    });
+    // Logged in by a link of /maps, without the client secret: the same.
+    expect(
+      topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not' }, { discordLogin: false })),
+    ).toEqual({ kind: 'redirect', to: `/s/${PINEWOOD.id}/map` });
+  });
+
+  it('never redirects to anything but a page of a server here', () => {
+    const odd = { id: '//evil.example.test', name: 'Odd' };
+    expect(topAnswer(ash({ [odd.id]: 'member' }, { servers: [odd] }))).toMatchObject({
+      kind: 'servers',
+      yours: [odd],
+    });
+  });
+
+  it('lists the servers of theirs by name when there are several, without a redirect (rule 4)', () => {
+    const lower = { id: '410000000000000004', name: 'oakvale annex' };
+    const accented = { id: '410000000000000005', name: 'Ébène' };
+    const answer = topAnswer(
+      ash(
+        {
+          [PINEWOOD.id]: 'member',
+          [OAKVALE.id]: 'member',
+          [lower.id]: 'member',
+          [accented.id]: 'member',
+        },
+        { servers: [PINEWOOD, OAKVALE, lower, accented] },
+      ),
+    );
+    expect(answer).toEqual({
+      kind: 'servers',
+      visitor: 'Ash',
+      yours: [accented, OAKVALE, lower, PINEWOOD],
+      toJoin: [],
+      notIn: false,
+      partial: false,
+    });
+  });
+
+  it('lists the one server of theirs when a server could be joined, with the invite under it (rule 4)', () => {
+    expect(
+      topAnswer(
+        ash(
+          { [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not', [ELMHURST.id]: 'not' },
+          {
+            servers: [PINEWOOD, OAKVALE, ELMHURST],
+            invites: { [OAKVALE.id]: OAK_INVITE, [ELMHURST.id]: ELM_INVITE },
+          },
+        ),
+      ),
+    ).toEqual({
+      kind: 'servers',
+      visitor: 'Ash',
+      yours: [PINEWOOD],
+      toJoin: [
+        { ...ELMHURST, invite: ELM_INVITE },
+        { ...OAKVALE, invite: OAK_INVITE },
+      ],
+      notIn: false,
+      partial: false,
+    });
+  });
+
+  it('says they are in no server here, with the servers they could join (rule 4)', () => {
+    expect(
+      topAnswer(
+        ash(
+          { [PINEWOOD.id]: 'not', [OAKVALE.id]: 'not' },
+          { invites: { [OAKVALE.id]: OAK_INVITE } },
+        ),
+      ),
+    ).toEqual({
+      kind: 'servers',
+      visitor: 'Ash',
+      yours: [],
+      toJoin: [{ ...OAKVALE, invite: OAK_INVITE }],
+      notIn: true,
+      partial: false,
+    });
+  });
+
+  it('names no server they are not in that has no invite (rule 5)', () => {
+    const answer = topAnswer(
+      ash(
+        { [PINEWOOD.id]: 'not', [OAKVALE.id]: 'not' },
+        // An invite of a server without a map, or of one the bot is not in, is not offered.
+        { invites: { [ELMHURST.id]: ELM_INVITE } },
+      ),
+    );
+    expect(answer).toEqual({
+      kind: 'servers',
+      visitor: 'Ash',
+      yours: [],
+      toJoin: [],
+      notIn: true,
+      partial: false,
+    });
+  });
+
+  it('never redirects while a lookup failed, and lists what was found (rule 4)', () => {
+    expect(topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'unknown' }))).toEqual({
+      kind: 'servers',
+      visitor: 'Ash',
+      yours: [PINEWOOD],
+      toJoin: [],
+      notIn: false,
+      partial: true,
+    });
+    // Nothing found and not every answer in: not "you are in no server".
+    expect(
+      topAnswer(
+        ash(
+          { [PINEWOOD.id]: 'unknown', [OAKVALE.id]: 'not' },
+          { invites: { [OAKVALE.id]: OAK_INVITE } },
+        ),
+      ),
+    ).toEqual({
+      kind: 'servers',
+      visitor: 'Ash',
+      yours: [],
+      // A server Discord could not say of is never offered to join: they may be in it.
+      toJoin: [{ ...OAKVALE, invite: OAK_INVITE }],
+      notIn: false,
+      partial: true,
+    });
+  });
+
+  it('counts a server it has no answer for as a failed lookup', () => {
+    expect(topAnswer(ash({ [PINEWOOD.id]: 'member' }))).toMatchObject({
+      kind: 'servers',
+      yours: [PINEWOOD],
+      partial: true,
+    });
+  });
+
+  it('shows the failed login only to a visitor who is not logged in', () => {
+    expect(
+      topAnswer(ash({ [PINEWOOD.id]: 'member', [OAKVALE.id]: 'not' }, { loginFailed: true })),
+    ).toEqual({
+      kind: 'redirect',
+      to: `/s/${PINEWOOD.id}/map`,
+    });
+  });
+});
diff --git a/src/web/top-answer.ts b/src/web/top-answer.ts
new file mode 100644
index 00000000..44fc597b
--- /dev/null
+++ b/src/web/top-answer.ts
@@ -0,0 +1,75 @@
+import { localPath } from './local-path.js';
+import type { MapServer } from './map-servers.js';
+
+/** What the member directory said of the visitor in a server: in it, not, or nothing (it failed). */
+export type Membership = 'member' | 'not' | 'unknown';
+
+/** What the answer of `/` is decided from. */
+export interface TopFacts {
+  /** The servers with a map (`WebDeps.serversWithMap`). */
+  servers: readonly MapServer[];
+  /** Who is logged in, or undefined. */
+  visitor: { name: string } | undefined;
+  /** Whether "Log in with Discord" is offered here (`DISCORD_CLIENT_SECRET`). */
+  discordLogin: boolean;
+  /** The directory's answer per server with a map; a server without one counts as `unknown`. */
+  memberships: ReadonlyMap<string, Membership>;
+  /** `settings.web.invites`. */
+  invites: Readonly<Record<string, string>> | undefined;
+  /** Whether the address carries `?login=failed`. */
+  loginFailed: boolean;
+}
+
+/** A server the visitor could join, with its admin's invite. */
+export type JoinableServer = MapServer & { invite: string };
+
+export type TopAnswer =
+  | { kind: 'no-map' }
+  | { kind: 'login'; discord: boolean; failed: boolean }
+  | { kind: 'redirect'; to: string }
+  | {
+      kind: 'servers';
+      visitor: string;
+      yours: MapServer[];
+      toJoin: JoinableServer[];
+      notIn: boolean;
+      partial: boolean;
+    };
+
+/** Servers by name, as a reader expects whatever the letters' case or accents. */
+const byName = (a: MapServer, b: MapServer): number =>
+  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
+
+/**
+ * The answer of `/` (plan 8M-14, the design's "Behavior"): with no server with a map, "no map
+ * here yet"; logged out, the login page whatever the number of servers, so that nobody logged
+ * out learns any server's name or their count; logged in, the servers they are a member of and
+ * those they could join by an invite of the settings. One server of theirs, none to join and
+ * every lookup answered leads straight to its map. Pure: the lookups are the caller's.
+ */
+export function topAnswer(facts: TopFacts): TopAnswer {
+  if (facts.servers.length === 0) return { kind: 'no-map' };
+  if (facts.visitor === undefined) {
+    return { kind: 'login', discord: facts.discordLogin, failed: facts.loginFailed };
+  }
+  const said = (server: MapServer): Membership => facts.memberships.get(server.id) ?? 'unknown';
+  const invites = facts.invites ?? {};
+  const yours = facts.servers.filter((server) => said(server) === 'member').sort(byName);
+  const toJoin = facts.servers
+    .filter((server) => said(server) === 'not' && Object.hasOwn(invites, server.id))
+    .map((server) => ({ ...server, invite: invites[server.id] ?? '' }))
+    .filter((server) => server.invite !== '')
+    .sort(byName);
+  const partial = facts.servers.some((server) => said(server) === 'unknown');
+  // Only ever to a page of a server here (`localPath`): an open redirect is a finding.
+  const to = yours.length === 1 ? localPath(`/s/${yours[0]?.id ?? ''}/map`) : undefined;
+  if (to !== undefined && toJoin.length === 0 && !partial) return { kind: 'redirect', to };
+  return {
+    kind: 'servers',
+    visitor: facts.visitor.name,
+    yours,
+    toJoin,
+    notIn: yours.length === 0 && !partial,
+    partial,
+  };
+}
diff --git a/test/support/web.ts b/test/support/web.ts
index d2e85a86..f71b9526 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -15,6 +15,7 @@ import { EditorCache, type EditorSources } from '../../src/web/editor-cache.js';
 import { GeoCache, type GeoSources } from '../../src/web/geo-cache.js';
 import type { RegionStaffSource, StaffAnswer } from '../../src/web/region-staff.js';
 import { LoginLinks } from '../../src/web/login-links.js';
+import type { MapServer } from '../../src/web/map-servers.js';
 import type { WebAssets } from '../../src/web/page.js';
 import type { ActingAnswer, ActingMembers, PartyWebDeps } from '../../src/web/party-routes.js';
 import type { RaidWebContext, RaidWebDeps } from '../../src/web/raid-routes.js';
@@ -583,6 +584,8 @@ export interface WebTestOptions {
   /** Changes of `TEST_WEB`. */
   web?: Partial<WebSettings>;
   servers?: WebDeps['servers'];
+  /** The servers with a map, which the top page names (plan 8M-14); none by default. */
+  serversWithMap?: MapServer[] | WebDeps['serversWithMap'];
   /** The members of servers; nobody is a member of anything by default. */
   members?: Pick<MemberDirectory, 'find'>;
   /** Discord's side of a login (a `FakeOAuth` by default); undefined: no client secret. */
@@ -762,6 +765,13 @@ export interface TestWeb {
   posting(userId: string, name: string): Promise<Record<string, string>>;
 }
 
+/** The servers with a map of a test: a list given as it is, a function as it is, else none. */
+function serversWithMapOf(given: WebTestOptions['serversWithMap']): WebDeps['serversWithMap'] {
+  if (typeof given === 'function') return given;
+  const servers = given ?? [];
+  return () => Promise.resolve(servers.map((server) => ({ ...server })));
+}
+
 /**
  * The web server over fakes: the bot is in the server of the fake interactions alone, unless
  * `servers` says otherwise; sessions in memory, on a clock of the test's. Close `app` after the
@@ -786,6 +796,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     googleKey: options.googleKey,
     distanceUnits: options.distanceUnits ?? 'imperial',
     servers: options.servers ?? { has: (guildId) => guildId === FAKE_GUILD_ID },
+    serversWithMap: serversWithMapOf(options.serversWithMap),
     members: options.members ?? new FakeMemberDirectory(),
     sessions: sessionService,
     oauth: gateway && { appId: TEST_APP_ID, gateway },
````

### Task 2: 8M-14 task 2: the top page's route and its pages

Prototype commit: `f725d4588139b5314b0b5a7270d40c9cab57e96e`

GET / (and HEAD) by topAnswer: the login page (the /maps sentence alone without the client
secret, the failed login after ?login=failed), "no map here yet", the logged-in list of their
servers by name in <bdi> and the servers they could join with "Join on Discord", the line when
they are in none, the line when Discord did not answer for every server (also after 5 seconds),
the visitor's name and Log out. Membership asked of the member directory itself, every server
at once; Cache-Control no-store before a limit of its own, 30 a minute per address.
shortDocument in answers.ts for pages in the short pages' look; the logged-out pages carry
the mark <meta name="pine-top" content="logged-out">.

**Files:**

```
 src/web/answers.ts         |  15 ++-
 src/web/login.test.ts      |  26 ++++++
 src/web/server.test.ts     |   6 +-
 src/web/server.ts          |  10 +-
 src/web/top-answer.test.ts |   6 ++
 src/web/top-answer.ts      |   4 +-
 src/web/top-page.test.ts   | 328 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/top-page.ts        | 102 ++++++++++++++++++++
 src/web/top-routes.ts      |  87 +++++++++++++++++
 9 files changed, 572 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/login.test.ts src/web/server.test.ts src/web/top-answer.test.ts src/web/top-page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f725d4588139b5314b0b5a7270d40c9cab57e96e -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-14 task 2: the top page's route and its pages`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/answers.ts b/src/web/answers.ts
index e7b846c0..ea654656 100644
--- a/src/web/answers.ts
+++ b/src/web/answers.ts
@@ -43,18 +43,27 @@ export const COLOR_SCHEME_META = '<meta name="color-scheme" content="light dark"
  */
 export const SHORT_PAGE_STYLE = '/assets/page.css';
 
-/** A short page of one sentence, and what follows it (HTML of ours). */
-function page(sentence: string, more = ''): string {
+/**
+ * A short page in the short pages' look: `main`, HTML of ours (anything of a member's or of
+ * Discord's escaped by the caller), and what the head adds (a script of Pine's, the top page's).
+ */
+export function shortDocument(main: string, head = ''): string {
   return (
     '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
     '<meta name="viewport" content="width=device-width, initial-scale=1">' +
     COLOR_SCHEME_META +
     `<link rel="stylesheet" href="${SHORT_PAGE_STYLE}">` +
+    head +
     '<title>Professor Pine</title></head>' +
-    `<body class="short"><main><p>${escapeHtml(sentence)}</p>${more}</main></body></html>`
+    `<body class="short"><main>${main}</main></body></html>`
   );
 }
 
+/** A short page of one sentence, and what follows it (HTML of ours). */
+function page(sentence: string, more = ''): string {
+  return shortDocument(`<p>${escapeHtml(sentence)}</p>${more}`);
+}
+
 /** A short page of one sentence: what a failure or an empty address shows. */
 export function shortPage(sentence: string): string {
   return page(sentence);
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
index 93877356..bf3c149a 100644
--- a/src/web/login.test.ts
+++ b/src/web/login.test.ts
@@ -170,6 +170,32 @@ describe('logging in with Discord', () => {
     expect(JSON.stringify(web.entries)).not.toMatch(/bad-code|good-code/);
   });
 
+  it('returns to the top page from a login started there, saying when it failed (plan 8M-14)', async () => {
+    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
+    web = webServerWith({ oauth });
+    for (const query of ['code=bad-code', 'error=access_denied']) {
+      const { state, cookie } = await started(web, '/');
+      const answer = await web.app.inject({
+        url: `/auth/callback?${query}&state=${state}`,
+        headers: { cookie },
+      });
+      expect(answer.headers.location, query).toBe('/?login=failed');
+    }
+    // A state that does not match its cookie (or no cookie at all) returns to the top page too.
+    const { cookie } = await started(web, '/');
+    const forged = await web.app.inject({
+      url: '/auth/callback?code=good-code&state=AAAAAAAAAAAAAAAAAAAAAA',
+      headers: { cookie },
+    });
+    expect(forged.headers.location).toBe('/?login=failed');
+    const { state, cookie: kept } = await started(web, '/');
+    const done = await web.app.inject({
+      url: `/auth/callback?code=good-code&state=${state}`,
+      headers: { cookie: kept },
+    });
+    expect(done.headers.location).toBe('/');
+  });
+
   it('never sends the member anywhere but a page of a server here', async () => {
     const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
     web = webServerWith({ oauth });
diff --git a/src/web/server.test.ts b/src/web/server.test.ts
index 9212fde4..e9680727 100644
--- a/src/web/server.test.ts
+++ b/src/web/server.test.ts
@@ -148,11 +148,13 @@ describe('the web server', () => {
     expect(asked).toEqual([key, 'cd'.repeat(16)]);
   });
 
-  it('says nothing about itself at its root', async () => {
-    web = webServerWith();
+  it('names no server at its root to a visitor not logged in (the top page: top-page.test.ts)', async () => {
+    web = webServerWith({ serversWithMap: [{ id: FAKE_GUILD_ID, name: 'Pinewood' }] });
     const answer = await web.app.inject({ url: '/' });
     expect(answer.statusCode).toBe(200);
     expect(answer.headers['content-type']).toMatch(/^text\/html/);
     expect(answer.body).toContain('/maps');
+    expect(answer.body).not.toContain('Pinewood');
+    expect(answer.body).not.toContain(FAKE_GUILD_ID);
   });
 });
diff --git a/src/web/server.ts b/src/web/server.ts
index 525b8202..f8be253e 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -11,7 +11,7 @@ import type { Logger } from '../log.js';
 import { EGG_FOLDER, EGG_PATH } from '../services/egg-pictures.js';
 import { EMOJI_PATH, type EmojiPictures } from '../services/post-pictures.js';
 import { PICTURE_PATH, type StopPictures } from '../services/stop-pictures.js';
-import { sendFailure, shortPage } from './answers.js';
+import { sendFailure } from './answers.js';
 import { authRoutes } from './auth-routes.js';
 import { isNearbyPeer } from './client-address.js';
 import type { OAuthGateway } from './discord-oauth.js';
@@ -32,6 +32,7 @@ import type { StopWebDeps } from './stop-routes.js';
 import type { PostWebDeps } from './post-control-routes.js';
 import type { TrainWebDeps } from './train-routes.js';
 import { toolFileRoutes, toolPageRoutes, type ToolWebDeps } from './tool-routes.js';
+import { topRoutes } from './top-routes.js';
 import type { DistanceUnits } from '../render/distance-words.js';
 
 /** `settings.web` once it is set. */
@@ -152,11 +153,8 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
   });
   app.setNotFoundHandler((request, reply) => sendFailure(request, reply, 404));
 
-  app.get('/', (_request, reply) =>
-    reply
-      .type('text/html; charset=utf-8')
-      .send(shortPage("Professor Pine's map is at an address of each server: use /maps there.")),
-  );
+  // The top page (plan 8M-14): the login, or the servers of whoever is logged in.
+  topRoutes(app, deps);
   // The bundle: no index, no listing; a hashed name is kept for good, anything else asked again.
   void app.register(fastifyStatic, {
     root: deps.assets.dir,
diff --git a/src/web/top-answer.test.ts b/src/web/top-answer.test.ts
index 1066d4e1..9f1c8bfb 100644
--- a/src/web/top-answer.test.ts
+++ b/src/web/top-answer.test.ts
@@ -51,6 +51,12 @@ describe('topAnswer', () => {
       discord: true,
       failed: true,
     });
+    // Without the client secret there was no login with Discord to fail.
+    expect(topAnswer(facts({ discordLogin: false, loginFailed: true }))).toEqual({
+      kind: 'login',
+      discord: false,
+      failed: false,
+    });
   });
 
   it('leads straight to the map of the one server of theirs, with none to join and every answer in (rule 4)', () => {
diff --git a/src/web/top-answer.ts b/src/web/top-answer.ts
index 44fc597b..8d05b52d 100644
--- a/src/web/top-answer.ts
+++ b/src/web/top-answer.ts
@@ -50,7 +50,9 @@ const byName = (a: MapServer, b: MapServer): number =>
 export function topAnswer(facts: TopFacts): TopAnswer {
   if (facts.servers.length === 0) return { kind: 'no-map' };
   if (facts.visitor === undefined) {
-    return { kind: 'login', discord: facts.discordLogin, failed: facts.loginFailed };
+    // Without the client secret no login with Discord was tried, so none failed.
+    const failed = facts.discordLogin && facts.loginFailed;
+    return { kind: 'login', discord: facts.discordLogin, failed };
   }
   const said = (server: MapServer): Membership => facts.memberships.get(server.id) ?? 'unknown';
   const invites = facts.invites ?? {};
diff --git a/src/web/top-page.test.ts b/src/web/top-page.test.ts
new file mode 100644
index 00000000..c4341bc8
--- /dev/null
+++ b/src/web/top-page.test.ts
@@ -0,0 +1,328 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import type { MemberDirectory } from '../discord/member-directory.js';
+import { Tally } from '../../test/support/tally.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { webServerWith, type TestWeb } from '../../test/support/web.js';
+import { TOP_LOOKUP_MS, TOP_PER_MINUTE } from './top-routes.js';
+
+const ASH = '700000000000000001';
+const PINEWOOD = { id: '410000000000000001', name: 'Pinewood' };
+const OAKVALE = { id: '410000000000000002', name: 'Oakvale' };
+const ELMHURST = { id: '410000000000000003', name: 'Elmhurst' };
+const OAK_INVITE = 'https://discord.gg/oakvale';
+
+const LOGIN_SENTENCE =
+  "Professor Pine's maps are kept per Discord server. Log in with Discord to see the maps of your servers.";
+
+/** HTML of ours as it is sent: the escapes of `escapeHtml`. */
+const html = (text: string): string => text.replace(/'/g, '&#39;');
+
+describe('the top page', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('says that there is no map here yet while no server has one', async () => {
+    web = webServerWith();
+    const answer = await web.app.inject({ url: '/' });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('no-store');
+    expect(answer.body).toContain('Professor Pine has no map here yet.');
+  });
+
+  it('offers the login to a visitor not logged in, naming no server', async () => {
+    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE] });
+    const answer = await web.app.inject({ url: '/' });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toMatch(/^text\/html/);
+    expect(answer.headers['cache-control']).toBe('no-store');
+    expect(answer.body).toContain(html(LOGIN_SENTENCE));
+    expect(answer.body).toContain(
+      '<a class="top-login" href="/auth/login?next=/">Log in with Discord</a>',
+    );
+    expect(answer.body).toContain('Or use /maps in your server on Discord.');
+    expect(answer.body).not.toContain('failed');
+    expect(answer.body).not.toMatch(/Pinewood|Oakvale|410000000000000/);
+    // Nothing to log out of: the page runs no script.
+    expect(answer.body).not.toContain('<script');
+  });
+
+  it('is the same page for one server as for several', async () => {
+    web = webServerWith({ serversWithMap: [PINEWOOD] });
+    const one = (await web.app.inject({ url: '/' })).body;
+    await web.app.close();
+    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE, ELMHURST] });
+    expect((await web.app.inject({ url: '/' })).body).toBe(one);
+  });
+
+  it('says that a login with Discord failed, back from Discord', async () => {
+    web = webServerWith({ serversWithMap: [PINEWOOD] });
+    const answer = await web.app.inject({ url: '/?login=failed' });
+    expect(answer.body).toContain('Logging in with Discord failed; try again.');
+    expect(answer.body).toContain('Log in with Discord</a>');
+  });
+
+  it('only points to /maps without the client secret', async () => {
+    web = webServerWith({ serversWithMap: [PINEWOOD], oauth: undefined });
+    for (const url of ['/', '/?login=failed']) {
+      const answer = await web.app.inject({ url });
+      expect(answer.body, url).toContain('Use /maps in your server on Discord to open its map.');
+      expect(answer.body, url).not.toContain('/auth/login');
+      expect(answer.body, url).not.toContain('maps are kept');
+      expect(answer.body, url).not.toContain('failed');
+    }
+  });
+
+  it('leads straight to the map of the one server of theirs, not kept', async () => {
+    web = webServerWith({
+      serversWithMap: [PINEWOOD, OAKVALE],
+      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id),
+    });
+    const answer = await web.app.inject({
+      url: '/',
+      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
+    });
+    expect(answer.statusCode).toBe(302);
+    expect(answer.headers.location).toBe(`/s/${PINEWOOD.id}/map`);
+    expect(answer.headers['cache-control']).toBe('no-store');
+  });
+
+  it('asks the member directory itself: a member without the map role still counts', async () => {
+    web = webServerWith({
+      web: { memberRole: 'Trainer' },
+      serversWithMap: [PINEWOOD],
+      members: new FakeMemberDirectory()
+        .add(ASH, 'Ash', PINEWOOD.id)
+        .standing(ASH, { roleNames: [], administrator: false }, PINEWOOD.id),
+    });
+    const answer = await web.app.inject({
+      url: '/',
+      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
+    });
+    expect(answer.headers.location).toBe(`/s/${PINEWOOD.id}/map`);
+  });
+
+  it('lists the servers of theirs and those they could join, names the visitor and offers Log out', async () => {
+    web = webServerWith({
+      web: { invites: { [OAKVALE.id]: OAK_INVITE, [ELMHURST.id]: 'https://discord.gg/elm' } },
+      serversWithMap: [PINEWOOD, OAKVALE, ELMHURST, { id: '410000000000000004', name: 'acorn' }],
+      members: new FakeMemberDirectory()
+        .add(ASH, 'Ash', PINEWOOD.id)
+        .add(ASH, 'Ash', ELMHURST.id)
+        .add(ASH, 'Ash', '410000000000000004'),
+    });
+    const posting = await web.posting(ASH, 'Ash');
+    const answer = await web.app.inject({ url: '/', headers: { cookie: posting.cookie } });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('no-store');
+    const { body } = answer;
+    const link = (server: { id: string; name: string }) =>
+      `<a href="/s/${server.id}/map"><bdi>${server.name}</bdi></a>`;
+    const acorn = body.indexOf(link({ id: '410000000000000004', name: 'acorn' }));
+    const elmhurst = body.indexOf(link(ELMHURST));
+    const pinewood = body.indexOf(link(PINEWOOD));
+    expect(acorn).toBeGreaterThan(-1);
+    expect(elmhurst).toBeGreaterThan(acorn);
+    expect(pinewood).toBeGreaterThan(elmhurst);
+    expect(body).toContain('Servers you could join');
+    expect(body).toContain(
+      `<bdi>Oakvale</bdi> <a class="top-join" href="${OAK_INVITE}" target="_blank" rel="noopener">Join on Discord</a>`,
+    );
+    // An invite of a server they are in is not offered.
+    expect(body).not.toContain('https://discord.gg/elm');
+    expect(body).toContain(
+      '<p class="top-account"><span>Logged in as <bdi>Ash</bdi></span><button',
+    );
+    expect(body).toContain(
+      `<button type="button" class="top-logout" data-csrf="${posting['x-pine-csrf']}">Log out</button>`,
+    );
+    expect(body).toContain('<script src="/assets/top.js" defer></script>');
+    expect(body).not.toContain('You are not in');
+    expect(body).not.toContain('did not answer');
+  });
+
+  it('says they are in no server here, with the servers they could join', async () => {
+    web = webServerWith({
+      web: { invites: { [OAKVALE.id]: OAK_INVITE } },
+      serversWithMap: [PINEWOOD, OAKVALE],
+    });
+    const answer = await web.app.inject({
+      url: '/',
+      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
+    });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.body).toContain('You are not in a Discord server that uses this Professor Pine.');
+    expect(answer.body).toContain('Join on Discord');
+    // A server without an invite stays unnamed.
+    expect(answer.body).not.toContain('Pinewood');
+    expect(answer.body).toContain('Log out</button>');
+  });
+
+  it('says that Discord did not answer for every server, listing those found, never redirecting', async () => {
+    const directory = new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id);
+    const members: Pick<MemberDirectory, 'find'> = {
+      find: (guildId, userId) =>
+        guildId === OAKVALE.id
+          ? Promise.reject(new Error('Discord is away'))
+          : directory.find(guildId, userId),
+    };
+    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE], members });
+    const answer = await web.app.inject({
+      url: '/',
+      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
+    });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.body).toContain(`<bdi>Pinewood</bdi>`);
+    expect(answer.body).toContain('Discord did not answer for every server; reload to try again.');
+    expect(answer.body).not.toContain('Oakvale');
+    expect(web.entries).toContainEqual(
+      expect.objectContaining({ guild: OAKVALE.id, user: ASH, level: 40 }),
+    );
+  });
+
+  it('asks Discord of every server at once', async () => {
+    let asking = 0;
+    let most = 0;
+    const directory = new FakeMemberDirectory()
+      .add(ASH, 'Ash', PINEWOOD.id)
+      .add(ASH, 'Ash', OAKVALE.id);
+    const members: Pick<MemberDirectory, 'find'> = {
+      async find(guildId, userId) {
+        asking += 1;
+        most = Math.max(most, asking);
+        await Promise.resolve();
+        asking -= 1;
+        return directory.find(guildId, userId);
+      },
+    };
+    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE, ELMHURST], members });
+    await web.app.inject({ url: '/', headers: { cookie: await web.loggedIn(ASH, 'Ash') } });
+    expect(most).toBe(3);
+  });
+
+  it("escapes a server's and the visitor's names, and keeps their direction to themselves", async () => {
+    const hostile = { id: PINEWOOD.id, name: '<img src=x onerror=alert(1)>\u202Eevil"&' };
+    const hostileToJoin = { id: ELMHURST.id, name: '<svg onload=alert(2)>\u202Ejoin"&' };
+    web = webServerWith({
+      web: { invites: { [ELMHURST.id]: 'https://discord.gg/elm' } },
+      serversWithMap: [hostile, OAKVALE, hostileToJoin],
+      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id).add(ASH, 'Ash', OAKVALE.id),
+    });
+    const answer = await web.app.inject({
+      url: '/',
+      headers: { cookie: await web.loggedIn(ASH, '<b>Ash</b>\u202E') },
+    });
+    expect(answer.body).toContain(
+      '<bdi>&lt;img src=x onerror=alert(1)&gt;\u202Eevil&quot;&amp;</bdi>',
+    );
+    // A server they could join, in "Servers you could join".
+    expect(answer.body).toContain(
+      '<li><bdi>&lt;svg onload=alert(2)&gt;\u202Ejoin&quot;&amp;</bdi> <a class="top-join"',
+    );
+    expect(answer.body).toContain(
+      '<span>Logged in as <bdi>&lt;b&gt;Ash&lt;/b&gt;\u202E</bdi></span>',
+    );
+    expect(answer.body).not.toContain('<img');
+    expect(answer.body).not.toContain('<svg');
+    expect(answer.body).not.toContain('<b>');
+  });
+
+  it('asks the member directory nothing for a visitor not logged in', async () => {
+    const members = new FakeMemberDirectory();
+    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE, ELMHURST], members });
+    expect((await web.app.inject({ url: '/' })).statusCode).toBe(200);
+    expect((await web.app.inject({ method: 'HEAD', url: '/' })).statusCode).toBe(200);
+    expect(members.asked).toEqual([]);
+  });
+
+  it(`counts a server Discord has not answered for in ${TOP_LOOKUP_MS / 1000} seconds as not known`, async () => {
+    const directory = new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id);
+    const asked = new Tally('the questions of the member directory');
+    const members: Pick<MemberDirectory, 'find'> = {
+      find(guildId, userId) {
+        asked.add();
+        // Oakvale's question never settles.
+        return guildId === OAKVALE.id
+          ? new Promise<never>(() => undefined)
+          : directory.find(guildId, userId);
+      },
+    };
+    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE], members });
+    const cookie = await web.loggedIn(ASH, 'Ash');
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const answering = web.app.inject({ url: '/', headers: { cookie } });
+      await asked.reached(2);
+      await vi.advanceTimersByTimeAsync(TOP_LOOKUP_MS);
+      const answer = await answering;
+      expect(answer.statusCode).toBe(200);
+      expect(answer.body).toContain('<bdi>Pinewood</bdi>');
+      expect(answer.body).toContain(
+        'Discord did not answer for every server; reload to try again.',
+      );
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  it('marks its pages for a visitor logged out for its script, and no other', async () => {
+    const MARK = '<meta name="pine-top" content="logged-out">';
+    web = webServerWith({ serversWithMap: [PINEWOOD, OAKVALE] });
+    expect((await web.app.inject({ url: '/' })).body).toContain(MARK);
+    expect((await web.app.inject({ url: '/?login=failed' })).body).toContain(MARK);
+    const loggedIn = await web.app.inject({
+      url: '/',
+      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
+    });
+    expect(loggedIn.body).toContain('top-account');
+    expect(loggedIn.body).not.toContain(MARK);
+    await web.app.close();
+    web = webServerWith({ serversWithMap: [PINEWOOD], oauth: undefined });
+    expect((await web.app.inject({ url: '/' })).body).toContain(MARK);
+    await web.app.close();
+    web = webServerWith();
+    expect((await web.app.inject({ url: '/' })).body).not.toContain(MARK);
+  });
+
+  it(`refuses more than ${TOP_PER_MINUTE} a minute from one address, the refusal not kept either`, async () => {
+    web = webServerWith({ serversWithMap: [PINEWOOD] });
+    for (let i = 0; i < TOP_PER_MINUTE; i += 1) {
+      expect((await web.app.inject({ url: '/', remoteAddress: '203.0.113.7' })).statusCode).toBe(
+        200,
+      );
+    }
+    const refused = await web.app.inject({ url: '/', remoteAddress: '203.0.113.7' });
+    expect(refused.statusCode).toBe(429);
+    expect(refused.headers['cache-control']).toBe('no-store');
+    expect(refused.headers['retry-after']).toBeDefined();
+    // Another address is not held back.
+    expect((await web.app.inject({ url: '/', remoteAddress: '203.0.113.8' })).statusCode).toBe(200);
+  });
+
+  it('answers HEAD as GET, without a body', async () => {
+    web = webServerWith({ serversWithMap: [PINEWOOD] });
+    const answer = await web.app.inject({ method: 'HEAD', url: '/' });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('no-store');
+    expect(answer.headers['content-type']).toMatch(/^text\/html/);
+    expect(answer.body).toBe('');
+  });
+
+  it('answers HEAD on the way to a map as GET: the redirect, not kept, without a body', async () => {
+    web = webServerWith({
+      serversWithMap: [PINEWOOD],
+      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id),
+    });
+    const answer = await web.app.inject({
+      method: 'HEAD',
+      url: '/',
+      headers: { cookie: await web.loggedIn(ASH, 'Ash') },
+    });
+    expect(answer.statusCode).toBe(302);
+    expect(answer.headers.location).toBe(`/s/${PINEWOOD.id}/map`);
+    expect(answer.headers['cache-control']).toBe('no-store');
+    expect(answer.body).toBe('');
+  });
+});
diff --git a/src/web/top-page.ts b/src/web/top-page.ts
new file mode 100644
index 00000000..345b7f72
--- /dev/null
+++ b/src/web/top-page.ts
@@ -0,0 +1,102 @@
+import { escapeHtml, shortDocument, shortPage } from './answers.js';
+import type { MapServer } from './map-servers.js';
+import type { JoinableServer, TopAnswer } from './top-answer.js';
+
+/**
+ * The top page's script (plan 8M-14): Log out, built under a name of its own without a hash
+ * (`scripts/web/build.ts`), as the short pages' stylesheet is, since the page is answered where
+ * the bundle's manifest is not at hand. Without a build the button does nothing.
+ */
+export const TOP_SCRIPT = '/assets/top.js';
+
+/** Where "Log in with Discord" leads: Discord's login, back to the top page. */
+export const TOP_LOGIN = '/auth/login?next=/';
+
+export const NO_MAP = 'Professor Pine has no map here yet.';
+export const LOGIN_SENTENCE =
+  "Professor Pine's maps are kept per Discord server. Log in with Discord to see the maps of your servers.";
+export const LOGIN_FAILED = 'Logging in with Discord failed; try again.';
+export const OR_MAPS = 'Or use /maps in your server on Discord.';
+export const ONLY_MAPS = 'Use /maps in your server on Discord to open its map.';
+export const NOT_IN = 'You are not in a Discord server that uses this Professor Pine.';
+export const PARTIAL = 'Discord did not answer for every server; reload to try again.';
+export const YOUR_SERVERS = 'Your servers';
+export const TO_JOIN = 'Servers you could join';
+export const JOIN = 'Join on Discord';
+
+/**
+ * The mark of a page for a visitor logged out (the login, or /maps alone): how the page's script,
+ * asking `/` anew for a token, knows that the session is over (`top-logout.ts`, `LOGGED_OUT`).
+ */
+export const LOGGED_OUT_MARK = '<meta name="pine-top" content="logged-out">';
+
+/** A paragraph of plain words. */
+const line = (words: string, className?: string): string =>
+  `${className === undefined ? '<p>' : `<p class="${className}">`}${escapeHtml(words)}</p>`;
+
+/** A name of Discord's as it is shown: escaped, and isolated so that it cannot turn the line. */
+const named = (name: string): string => `<bdi>${escapeHtml(name)}</bdi>`;
+
+/** The page of a visitor not logged in: the login, or `/maps` alone without the client secret. */
+function loginPage(discord: boolean, failed: boolean): string {
+  if (!discord) return shortDocument(line(ONLY_MAPS), LOGGED_OUT_MARK);
+  return shortDocument(
+    (failed ? line(LOGIN_FAILED, 'top-failed') : '') +
+      line(LOGIN_SENTENCE) +
+      `<p><a class="top-login" href="${escapeHtml(TOP_LOGIN)}">Log in with Discord</a></p>` +
+      line(OR_MAPS),
+    LOGGED_OUT_MARK,
+  );
+}
+
+/** A server of theirs: its name, a link to its map. */
+const yourItem = (server: MapServer): string =>
+  `<li><a href="/s/${escapeHtml(server.id)}/map">${named(server.name)}</a></li>`;
+
+/** A server they could join: its name, and its invite in a new tab that cannot reach back. */
+const joinItem = (server: JoinableServer): string =>
+  `<li>${named(server.name)} <a class="top-join" href="${escapeHtml(server.invite)}" ` +
+  `target="_blank" rel="noopener">${JOIN}</a></li>`;
+
+/** The page of a visitor logged in: who they are with Log out, their servers, those to join. */
+function serversPage(answer: Extract<TopAnswer, { kind: 'servers' }>, csrf: string): string {
+  const account =
+    `<p class="top-account"><span>Logged in as ${named(answer.visitor)}</span>` +
+    `<button type="button" class="top-logout" data-csrf="${escapeHtml(csrf)}">Log out</button></p>` +
+    '<p class="top-notice" id="notice" role="status" hidden></p>';
+  const yours =
+    answer.yours.length === 0
+      ? ''
+      : `<h2>${YOUR_SERVERS}</h2><ul class="top-servers">${answer.yours.map(yourItem).join('')}</ul>`;
+  const toJoin =
+    answer.toJoin.length === 0
+      ? ''
+      : `<h2>${TO_JOIN}</h2><ul class="top-servers">${answer.toJoin.map(joinItem).join('')}</ul>`;
+  return shortDocument(
+    account +
+      (answer.notIn ? line(NOT_IN) : '') +
+      yours +
+      (answer.partial ? line(PARTIAL, 'top-partial') : '') +
+      toJoin,
+    `<script src="${TOP_SCRIPT}" defer></script>`,
+  );
+}
+
+/**
+ * The HTML of the top page's answer (plan 8M-14), but a redirect's: the short pages' look, every
+ * name escaped and in `<bdi>`, the Log out of a logged-in page carrying the session's CSRF token
+ * for `TOP_SCRIPT`.
+ */
+export function topPage(
+  answer: Exclude<TopAnswer, { kind: 'redirect' }>,
+  csrf: string | undefined,
+): string {
+  switch (answer.kind) {
+    case 'no-map':
+      return shortPage(NO_MAP);
+    case 'login':
+      return loginPage(answer.discord, answer.failed);
+    case 'servers':
+      return serversPage(answer, csrf ?? '');
+  }
+}
diff --git a/src/web/top-routes.ts b/src/web/top-routes.ts
new file mode 100644
index 00000000..df444c9c
--- /dev/null
+++ b/src/web/top-routes.ts
@@ -0,0 +1,87 @@
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
+import type { MapServer } from './map-servers.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+import { topAnswer, type Membership } from './top-answer.js';
+import { topPage } from './top-page.js';
+
+/** The requests for `/` one address may make in a minute (plan 8M-14). */
+export const TOP_PER_MINUTE = 30;
+/** How long the page waits for Discord's answer per server before it counts as unknown. */
+export const TOP_LOOKUP_MS = 5_000;
+
+/** A question that has not settled within `ms` rejects, its timer cleared once it settles. */
+function within<T>(question: Promise<T>, ms: number): Promise<T> {
+  let timer: ReturnType<typeof setTimeout> | undefined;
+  const late = new Promise<never>((_resolve, reject) => {
+    timer = setTimeout(() => {
+      reject(new Error(`no answer within ${ms} ms`));
+    }, ms);
+  });
+  return Promise.race([question, late]).finally(() => {
+    clearTimeout(timer);
+  });
+}
+
+/**
+ * The top page `/` (plan 8M-14; and HEAD), answered by `topAnswer`: never kept by a browser or a
+ * proxy (`no-store`, set before the limit so that a 429 carries it too), at most
+ * `TOP_PER_MINUTE` a minute from one address, every answer counted (a logged-in load asks the
+ * member directory once per server). Membership is asked of the member directory itself, not of
+ * the map's (`mapMembers`): a member without the map's role still counts, and the map's header
+ * tells them what they lack. Every server is asked at once; a failed question, or one Discord
+ * has not answered within `TOP_LOOKUP_MS`, is logged and counted as unknown.
+ */
+export function topRoutes(app: FastifyInstance, deps: WebDeps): void {
+  const { sessions, members, log } = deps;
+  const limited = limitedPerAddress(new RateLimiter({ uses: TOP_PER_MINUTE, perMs: 60_000 }), {
+    now: deps.now,
+  });
+  const notKept = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
+    void reply.header('cache-control', 'no-store');
+  };
+
+  /** What the member directory says of somebody in each server, asked of all at once. */
+  async function memberships(
+    servers: readonly MapServer[],
+    userId: string,
+  ): Promise<Map<string, Membership>> {
+    const answers = await Promise.allSettled(
+      servers.map((server) => within(members.find(server.id, userId), TOP_LOOKUP_MS)),
+    );
+    return new Map(
+      servers.map((server, i): [string, Membership] => {
+        const answer = answers[i];
+        if (answer?.status === 'fulfilled') {
+          return [server.id, answer.value === undefined ? 'not' : 'member'];
+        }
+        log.warn(
+          { err: answer?.reason, guild: server.id, user: userId },
+          'could not ask whether somebody on the top page is a member',
+        );
+        return [server.id, 'unknown'];
+      }),
+    );
+  }
+
+  app.get(
+    '/',
+    { onRequest: [notKept, limited] },
+    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply) => {
+      const servers = await deps.serversWithMap();
+      const session = servers.length === 0 ? undefined : await sessions.of(request, reply);
+      const answer = topAnswer({
+        servers,
+        visitor: session && { name: session.userName },
+        discordLogin: deps.oauth !== undefined,
+        memberships: session ? await memberships(servers, session.userId) : new Map(),
+        invites: deps.settings.invites,
+        loginFailed: request.query.login === 'failed',
+      });
+      if (answer.kind === 'redirect') return reply.redirect(answer.to, 302);
+      return reply
+        .type('text/html; charset=utf-8')
+        .send(topPage(answer, session && sessions.csrfToken(session)));
+    },
+  );
+}
````

### Task 3: 8M-14 task 3: the top page's Log out and its look

Prototype commit: `5d41d58add12084abcce97d3f1d8d44827cfe8da`

/assets/top.js, built without a hash as page.css is (the build fails without it): Log out
with the token of the button's data-csrf through the map's logOut; a stale token replaced
once by the one of / asked anew without following a redirect (logged out only on a 200 with
the logged-out mark), then / loaded again. The top page's classes in pages.css, light and
dark from theme.css, long names wrapped; no style attribute, no inline script, the CSP
unchanged. web.md describes the page.

**Files:**

```
 docs/architecture/web.md          |  10 +++---
 scripts/web/build.ts              |  22 ++++++++++---
 src/web/client/pages.css          | 102 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/top-logout.test.ts |  85 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/top-logout.ts      |  61 +++++++++++++++++++++++++++++++++++
 src/web/client/top.ts             |  42 ++++++++++++++++++++++++
 src/web/top-page.test.ts          |  66 +++++++++++++++++++++++++++++++++++++
 7 files changed, 377 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/top-logout.test.ts src/web/top-page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 5d41d58add12084abcce97d3f1d8d44827cfe8da -- src test scripts docs/architecture` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-14 task 3: the top page's Log out and its look`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index cb9980de..3e0a74ec 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -6,7 +6,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (plan 8M-7: `stadia`, the default, Stadia Maps' Alidade Smooth with OpenStreetMap's to fall back to; `osm`, OpenStreetMap's alone; or `google`, Google's beside Stadia's; no key for Stadia: it checks the page's domain, `localhost` passes; `docs/web-setup.md`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"), `invites` (plan 8M-11B: a server's id to the invite its admin chose, `https://discord.gg/<code>` or `https://discord.com/invite/<code>`, a vanity code too, letters, digits and hyphens and nothing after it, `INVITE_ADDRESS`; a blank one is none, absent none for any server; see "The fix pass: trains and clusters"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows Stadia's, `shownTiles`, `src/web/headers.ts`). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, the application emoji's pictures `emoji` (plan 8M-8A), a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in and those with a map (`serversWithMap`, plan 8M-14), the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, the application emoji's pictures `emoji` (plan 8M-8A), a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,9 +16,9 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the post's controls as forms, `POST /s/<guild>/api/parties/<party id>/regroup`, `GET` and `POST …/meet`, `POST …/close` and `GET` and `POST …/report` (plan 8M-8B; `postControlRoutes`, `src/web/post-control-routes.ts`: static segments, which Fastify's router takes before the presses' `:action`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>`, `POST …/conductor/<change>`, and `GET` and `POST …/manage` and `…/split` (plan 8M-8C, static segments) (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); Find's places by name, `/s/<guild>/api/find-places` (`findRoutes`, `src/web/find-routes.ts`, plan 8M-12); the region editor's `/s/<guild>/regions/edit` (since plan 8M-10 a 303 for staff to the map with the editor on, `/s/<guild>/map?edit=regions`), `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` (and HEAD) is the top page (plan 8M-14, design `docs/superpowers/specs/2026-10-29-web-top-page-design.md`; `topRoutes`, `src/web/top-routes.ts`), answered by one pure function, `topAnswer` (`src/web/top-answer.ts`), from the servers with a map, the session, whether "Log in with Discord" is offered, the membership lookups, `settings.web.invites` and `?login=failed`; its HTML is `topPage` (`src/web/top-page.ts`) over `shortDocument` (`answers.ts`), the short pages' look. The servers with a map are `WebDeps.serversWithMap()` (`mapServers`, `src/web/map-servers.ts`): the servers the bot is in and Discord has made available (the client's cache, `joinedServers`: a server sent unavailable in an outage has no name and is left out) with a region that has an outline, a region counted whatever its channel (as `geoView` draws it). It starts from the regions with an outline: their rows are turned into snowflakes by `guilds.snowflakeOf` (once per row, kept in the process's memory once seen), then kept to the servers joined, so a load costs no query for a server without a row or without such a region (the review's ruling, amending the design's `idFor` per server); the geo view is never built for it. In order: no server with a map, "Professor Pine has no map here yet." for everybody, before the login is looked at, so it is shown logged in too and has no Log out; not logged in, one page whatever the number of servers (a visitor logged out cannot tell one from several, and no server is named to them): "Professor Pine's maps are kept per Discord server. Log in with Discord to see the maps of your servers.", the button "Log in with Discord" to `/auth/login?next=/` and "Or use /maps in your server on Discord.", after a failed or declined login (`/?login=failed`) first "Logging in with Discord failed; try again."; without `DISCORD_CLIENT_SECRET` only "Use /maps in your server on Discord to open its map." (and no failure line). Logged in (by Discord or by a link of `/maps`): membership asked of every server at once of the member directory itself (`deps.members.find`, not the map's `mapMembers`: a member without `settings.web.memberRole` counts here, and the map's header tells them what they lack), a question that failed, or that Discord has not answered within 5 seconds (`TOP_LOOKUP_MS`, a `setTimeout` raced against it), logged at warn and counted unknown. Exactly one server of theirs, none to join and every question answered: 302 to `/s/<id>/map` (only through `localPath`). Otherwise the page: "Logged in as <name>" with Log out, "Your servers" (each a link to its map, by name in `<bdi>`, escaped, sorted with `localeCompare` at base sensitivity), "You are not in a Discord server that uses this Professor Pine." when none is theirs and every question was answered, "Discord did not answer for every server; reload to try again." when one was not (no redirect then), and "Servers you could join": each server with a map they are not in whose admin gave an invite, with "Join on Discord" to it in a new tab (`rel="noopener"`, as the map's invite); a server Discord could not say of is never offered to join, a server without an invite stays unnamed, and the count of servers is never said. The account line is "Logged in as <name>" in a `<span>` of its own, then Log out, a button whose `data-csrf` is the session's token, pressed by `/assets/top.js` (`src/web/client/top.ts` over `topLogout`, `top-logout.ts`, which reuses the map's `logOut`: a stale token is replaced once by the one of `/` asked anew without following a redirect (`redirect: 'manual'`), `csrfInTop`; that answer counts as logged out only when it is a 200 carrying `LOGGED_OUT_MARK`, `<meta name="pine-top" content="logged-out">`, which only the two pages for a visitor logged out carry, and no account; a redirect, a 429, a failure or the page of no map is a failed Log out), which then loads `/` again; built under a name without a hash as `page.css` is (`scripts/web/build.ts`, the build fails without it), the CSP unchanged (no inline script or style); without a build the button does nothing, as the page is plain without `page.css`. The page's classes (`top-login`, `top-join`, `top-account`, `top-logout`, `top-servers`, `top-notice`, `top-failed`, `top-partial`) are in `pages.css`, light and dark from `theme.css`; a long name of a server or of the visitor is broken anywhere (`overflow-wrap: anywhere`) rather than widening the page. Every answer of `/` is `Cache-Control: no-store`, set before its limiter so that a 302 and a 429 carry it alike; 30 a minute per address (`TOP_PER_MINUTE`), every answer counted. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the post's controls as forms, `POST /s/<guild>/api/parties/<party id>/regroup`, `GET` and `POST …/meet`, `POST …/close` and `GET` and `POST …/report` (plan 8M-8B; `postControlRoutes`, `src/web/post-control-routes.ts`: static segments, which Fastify's router takes before the presses' `:action`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>`, `POST …/conductor/<change>`, and `GET` and `POST …/manage` and `…/split` (plan 8M-8C, static segments) (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); Find's places by name, `/s/<guild>/api/find-places` (`findRoutes`, `src/web/find-routes.ts`, plan 8M-12); the region editor's `/s/<guild>/regions/edit` (since plan 8M-10 a 303 for staff to the map with the editor on, `/s/<guild>/map?edit=regions`), `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
-- Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
+- Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/` exactly (plan 8M-14: the top page's login returns there; not `//x`, `/\x` or `/?x`); a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
 
@@ -28,9 +28,9 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Logging in
 
-- With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
+- With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept. The top page's "Log in with Discord" starts it with `next=/` (plan 8M-14), so a failed or declined login lands on `/?login=failed`, which says so; a state that does not match, or a cookie that is gone, returns to `/` as well (the callback's fallback).
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, and whose one script, inline (`CONTINUE_SCRIPT`, `src/web/continue-script.ts`, let in by its hash: no file of its own, which was a third request to `/auth/` for every login), presses the button as the page is shown (Matt, 2026-10-25: no second tap): it submits with `requestSubmit`, or `submit` where a browser lacks it (Safari before 16), then disables the button and puts "Logging you in as <name>…" in place of the sentence, the name read as text from the form's `data-name` (escaped on the page; never HTML built of it), so that a tap while the POST is on its way cannot abort it after the link was spent and land on `?login=expired` (8M-7 review fix 1; `login.test.ts` runs the page's script against a small document of its form, button and sentence). A link preview or a prefetch runs no script, so it cannot spend the link; without script the button stays. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped). Pressed by the script, somebody else's link logs you in as them without a pause; the map's header names whose account it is (Matt's ruling, 2026-10-25). An unknown, used or expired link, or one of another server, leads (303) at once to the page its address names with `?login=expired`. `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, with `?region=<id>` for a link of `/maps` used in a region's channel, plan 8M-7, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by, which leads staff on to the map with the editor on, plan 8M-10); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The page's plain address is given only as code, after "To share the map, give its address:", which Discord does not make a link: tapped above the button, it opened the page logged out (Matt, 2026-10-25); the button is the one link in the answer. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`; +1, −1 and the completion question's answers among them since plan 8M-8B), Group…'s moves 30 a minute (`GROUP_WRITES_PER_ADDRESS_MINUTE`, plan 8M-8B), Meet…'s openings and Submits 30 a minute together (`MEET_PER_ADDRESS_MINUTE`), staff's closings 30 a minute (`CLOSE_PER_ADDRESS_MINUTE`), the reports' openings and Submits 30 a minute together (`REPORT_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop; Move…'s, Manage…'s and Split…'s Submits among them since plan 8M-8C), the openings of a train's Manage… and Split… 30 a minute together (`TRAIN_FORMS_PER_ADDRESS_MINUTE`, plan 8M-8C), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/find-places` 120 a minute (`FIND_PER_MINUTE`, plan 8M-12: its own, so that typing never empties Find's places); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`; a stop dragged and dropped is one, plan 8M-8C), the Submits of a train's Move…, Manage… and Split… in the window of the post's controls (plan 8M-8C, as their dialogs count; their openings uncounted, refused while the window is full), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), and so +1, −1, an answer to the completion question and a move of Group… (plan 8M-8B: one use at the move; the form opens from the list, uncounted), Meet…'s Submit in `/meet`'s window (`MEET_WINDOW`, its opening refused while it is full, uncounted, as the post's `checks`), staff's Delete… in that of `/delete`'s dialog (`CLOSE_THROTTLE` of the controls `pclose`), a report in `/report`'s (`REPORT_WINDOW`, its opening refused while it is full, uncounted), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/` 30 a minute (`TOP_PER_MINUTE`, plan 8M-14: a logged-in load asks the member directory once per server), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`; +1, −1 and the completion question's answers among them since plan 8M-8B), Group…'s moves 30 a minute (`GROUP_WRITES_PER_ADDRESS_MINUTE`, plan 8M-8B), Meet…'s openings and Submits 30 a minute together (`MEET_PER_ADDRESS_MINUTE`), staff's closings 30 a minute (`CLOSE_PER_ADDRESS_MINUTE`), the reports' openings and Submits 30 a minute together (`REPORT_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop; Move…'s, Manage…'s and Split…'s Submits among them since plan 8M-8C), the openings of a train's Manage… and Split… 30 a minute together (`TRAIN_FORMS_PER_ADDRESS_MINUTE`, plan 8M-8C), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/find-places` 120 a minute (`FIND_PER_MINUTE`, plan 8M-12: its own, so that typing never empties Find's places); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`; a stop dragged and dropped is one, plan 8M-8C), the Submits of a train's Move…, Manage… and Split… in the window of the post's controls (plan 8M-8C, as their dialogs count; their openings uncounted, refused while the window is full), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), and so +1, −1, an answer to the completion question and a move of Group… (plan 8M-8B: one use at the move; the form opens from the list, uncounted), Meet…'s Submit in `/meet`'s window (`MEET_WINDOW`, its opening refused while it is full, uncounted, as the post's `checks`), staff's Delete… in that of `/delete`'s dialog (`CLOSE_THROTTLE` of the controls `pclose`), a report in `/report`'s (`REPORT_WINDOW`, its opening refused while it is full, uncounted), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
 
diff --git a/scripts/web/build.ts b/scripts/web/build.ts
index e1e1c4c0..fb272f5f 100644
--- a/scripts/web/build.ts
+++ b/scripts/web/build.ts
@@ -12,8 +12,9 @@ import { checkForcedDark, withForcedDark } from './forced-dark.js';
  * Wayspot export tool (plan 8W-P: `assets/userscript-<hash>.js` and `.css`), each an IIFE for
  * ES2022, minified, with Leaflet's pictures, every file named by a hash of its content so that
  * the server can let browsers keep them for good; `dist/web/assets.json` names each page's
- * script and style and the worker. The short pages' stylesheet (plan 8M-7) is `assets/page.css`,
- * a name without a hash, which the server names without the manifest. The folder is emptied first, so no old file stays; the rest
+ * script and style and the worker. The short pages' stylesheet (plan 8M-7) is `assets/page.css`
+ * and the top page's script (plan 8M-14) `assets/top.js`, names without a hash, which the server
+ * names without the manifest. The folder is emptied first, so no old file stays; the rest
  * of `dist/web/` is the compiled server code of `src/web/` and is left alone.
  *
  * Plan 8M-13 (S10): the map's head script `assets/theme-<hash>.js` (`theme-head.ts`, the theme
@@ -83,12 +84,20 @@ const result = await build({
   plugins: [forcedDark],
 });
 
-// The short pages' stylesheet (plan 8M-7: `pages.css` with `theme.css`), under a name of its own
-// without a hash: those pages are answered where the manifest is not at hand (`answers.ts`).
+// The short pages' stylesheet (plan 8M-7: `pages.css` with `theme.css`) and the top page's
+// script (plan 8M-14: `top.ts`, its Log out), under names of their own without a hash: those
+// pages are answered where the manifest is not at hand (`answers.ts`, `top-page.ts`).
 const pages = await build({
-  entryPoints: [{ in: path.join(client, 'pages.css'), out: 'page' }],
+  entryPoints: [
+    { in: path.join(client, 'pages.css'), out: 'page' },
+    { in: path.join(client, 'top.ts'), out: 'top' },
+  ],
+  tsconfig: path.join(client, 'tsconfig.json'),
   outdir: assets,
   entryNames: '[name]',
+  format: 'iife',
+  platform: 'browser',
+  target: 'es2022',
   bundle: true,
   minify: true,
   charset: 'utf8',
@@ -106,6 +115,9 @@ const named = (pattern: RegExp): string => {
   if (found === undefined) throw new Error(`the build made no ${pattern}: ${outputs.join(', ')}`);
   return found;
 };
+// The unhashed files the server names by themselves: their absence is a failed build.
+named(/^page\.css$/);
+named(/^top\.js$/);
 const files = {
   map: {
     script: named(/^map-[A-Z0-9]{8}\.js$/),
diff --git a/src/web/client/pages.css b/src/web/client/pages.css
index 6aa9799d..7b6a8ced 100644
--- a/src/web/client/pages.css
+++ b/src/web/client/pages.css
@@ -1,7 +1,8 @@
 @import './theme.css';
 
 /*
- * The short pages Pine answers (plan 8M-7): a failure, `/`, a login link's page with its button
+ * The short pages Pine answers (plan 8M-7): a failure, `/` (since plan 8M-14 its login or its
+ * servers, below), a login link's page with its button
  * (and its one inline script, `continue-script.ts`), the login a page needs (`answers.ts`). Built as `assets/page.css`, a name
  * without a hash, since they are answered where the bundle's manifest is not at hand.
  */
@@ -53,3 +54,102 @@ body.short button {
 body.short button:hover {
   background: var(--primary-hover);
 }
+
+/*
+ * The top page (plan 8M-14, `top-page.ts`): "Log in with Discord" as the primary button, the
+ * visitor's name (a line of its own that may wrap, `<span>`) with Log out as the map's header
+ * has them (a gray button), the servers as a list of links, each server to join with its invite
+ * as a primary button; a long name is broken anywhere rather than widening the page.
+ */
+body.short a.top-login,
+body.short a.top-join {
+  display: inline-block;
+  padding: 8px 16px;
+  border-radius: var(--radius);
+  background: var(--primary);
+  color: var(--on-color);
+  font-weight: 500;
+  text-decoration: none;
+}
+
+body.short a.top-join {
+  padding: 4px 12px;
+}
+
+body.short a.top-login:hover,
+body.short a.top-join:hover {
+  background: var(--primary-hover);
+}
+
+body.short .top-account {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  justify-content: space-between;
+  gap: 8px;
+  color: var(--muted);
+}
+
+body.short .top-account span {
+  min-width: 0;
+}
+
+body.short .top-account bdi {
+  color: var(--text);
+  font-weight: 500;
+  overflow-wrap: anywhere;
+}
+
+body.short button.top-logout {
+  padding: 6px 12px;
+  background: var(--secondary);
+  color: var(--secondary-text);
+}
+
+body.short button.top-logout:hover {
+  background: var(--secondary-hover);
+}
+
+body.short .top-notice,
+body.short .top-failed,
+body.short .top-partial {
+  padding: 8px 12px;
+  border-radius: var(--radius);
+  background: var(--notice-bg);
+  border: 1px solid var(--notice-border);
+}
+
+body.short h2 {
+  margin: 16px 0 8px;
+  font-size: 1em;
+  font-weight: 600;
+}
+
+body.short ul.top-servers {
+  list-style: none;
+  margin: 0 0 12px;
+  padding: 0;
+}
+
+body.short ul.top-servers li {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  justify-content: space-between;
+  gap: 8px;
+  padding: 8px 0;
+  border-top: 1px solid var(--line);
+  overflow-wrap: anywhere;
+}
+
+body.short ul.top-servers li:first-child {
+  border-top: 0;
+}
+
+body.short ul.top-servers li > a:only-child {
+  font-weight: 500;
+}
+
+body.short [hidden] {
+  display: none;
+}
diff --git a/src/web/client/top-logout.test.ts b/src/web/client/top-logout.test.ts
new file mode 100644
index 00000000..304a4572
--- /dev/null
+++ b/src/web/client/top-logout.test.ts
@@ -0,0 +1,85 @@
+import { describe, expect, it } from 'vitest';
+import {
+  csrfInTop,
+  LOGGED_OUT_MARK,
+  topLogout,
+  type TopLogoutSteps,
+  type TopPageAnswer,
+} from './top-logout.js';
+
+/** The top page's side of logging out: the statuses the POSTs get, and the answers of `/`. */
+function steps(statuses: number[], pages: Array<TopPageAnswer | Error> = []) {
+  const posted: string[] = [];
+  let asked = 0;
+  const made: TopLogoutSteps = {
+    post(csrf) {
+      posted.push(csrf);
+      const next = statuses.shift();
+      return next === undefined ? Promise.reject(new Error('nothing more')) : Promise.resolve(next);
+    },
+    page() {
+      asked += 1;
+      const next = pages.shift() ?? new Error('nothing more');
+      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
+    },
+  };
+  return { made, posted, asked: () => asked };
+}
+
+const LOGGED_IN = (csrf: string): TopPageAnswer => ({
+  status: 200,
+  html: `<p class="top-account"><span>Logged in as <bdi>Ash</bdi></span><button type="button" class="top-logout" data-csrf="${csrf}">Log out</button></p>`,
+});
+const LOGGED_OUT: TopPageAnswer = {
+  status: 200,
+  html: `<head>${LOGGED_OUT_MARK}</head><p><a class="top-login" href="/auth/login?next=/">Log in with Discord</a></p>`,
+};
+
+describe('topLogout', () => {
+  it('logs out with the token of the page', async () => {
+    const { made, posted, asked } = steps([204]);
+    expect(await topLogout('old', made)).toBe('done');
+    expect(posted).toEqual(['old']);
+    expect(asked()).toBe(0);
+  });
+
+  it('takes a new token from the top page once when the one it has is stale', async () => {
+    const { made, posted } = steps([403, 204], [LOGGED_IN('new-token_1')]);
+    expect(await topLogout('old', made)).toBe('done');
+    expect(posted).toEqual(['old', 'new-token_1']);
+  });
+
+  it('is done when the top page shows the login: nobody logged in any more', async () => {
+    const { made, posted } = steps([403], [LOGGED_OUT]);
+    expect(await topLogout('old', made)).toBe('done');
+    expect(posted).toEqual(['old']);
+  });
+
+  it('fails when the top page says neither (a redirect, a refusal, a failure, no map), or cannot be asked', async () => {
+    for (const page of [
+      // A redirect to a map (`redirect: 'manual'`: an opaque answer, status 0).
+      { status: 0, html: '' },
+      { status: 302, html: '' },
+      { status: 429, html: `<p>Too many requests. Try again in a minute.</p>${LOGGED_OUT_MARK}` },
+      { status: 500, html: '<p>Something went wrong.</p>' },
+      { status: 200, html: '<p>Professor Pine has no map here yet.</p>' },
+      // The mark beside an account is no logged-out page.
+      { status: 200, html: `${LOGGED_OUT_MARK}<p class="top-account">` },
+      new Error('offline'),
+    ]) {
+      const { made, posted } = steps([403], [page]);
+      expect(await topLogout('old', made), JSON.stringify(page)).toBe('failed');
+      expect(posted).toEqual(['old']);
+    }
+    expect(await topLogout('old', steps([403, 403], [LOGGED_IN('new')]).made)).toBe('failed');
+    expect(await topLogout('old', steps([500]).made)).toBe('failed');
+  });
+});
+
+describe('csrfInTop', () => {
+  it("reads the token of the top page's Log out, and nothing else", () => {
+    expect(csrfInTop(LOGGED_IN('abc-DEF_123').html)).toBe('abc-DEF_123');
+    expect(csrfInTop(LOGGED_OUT.html)).toBeUndefined();
+    expect(csrfInTop('<p data-csrf="x">a server named data-csrf</p>')).toBeUndefined();
+  });
+});
diff --git a/src/web/client/top-logout.ts b/src/web/client/top-logout.ts
new file mode 100644
index 00000000..831d1a6d
--- /dev/null
+++ b/src/web/client/top-logout.ts
@@ -0,0 +1,61 @@
+import { logOut } from './logout.js';
+import type { Me } from './notice.js';
+
+/** What `/` answered: its status (0 for a redirect not followed) and its HTML. */
+export interface TopPageAnswer {
+  status: number;
+  html: string;
+}
+
+/** What logging out of the top page needs: the POST with a CSRF token, and the page anew. */
+export interface TopLogoutSteps {
+  /** POSTs `/auth/logout` with this token; the status of the answer. */
+  post(csrf: string): Promise<number>;
+  /** Asks `/` again, following no redirect. */
+  page(): Promise<TopPageAnswer>;
+}
+
+/**
+ * The mark of the top page for a visitor logged out (the login, or /maps alone), as the server
+ * writes it (`top-page.ts`, `LOGGED_OUT_MARK`; `top-page.test.ts` holds the two together).
+ */
+export const LOGGED_OUT_MARK = '<meta name="pine-top" content="logged-out">';
+
+/** The token on the top page's Log out (`top-page.ts`): base64url, as `csrfToken` makes it. */
+const LOGOUT_TOKEN = /<button type="button" class="top-logout" data-csrf="([A-Za-z0-9_-]+)">/u;
+
+/** The CSRF token of the top page's Log out, or undefined where the page has none (logged out). */
+export function csrfInTop(html: string): string | undefined {
+  return LOGOUT_TOKEN.exec(html)?.[1];
+}
+
+/**
+ * Who the top page says is asking: logged in with its token, logged out only by its mark on a
+ * page with no account; anything else (a redirect, a refusal, a failure, the page of no map)
+ * says neither, and throws.
+ */
+function whoTopSays(answer: TopPageAnswer): Me {
+  if (answer.status === 200) {
+    const token = csrfInTop(answer.html);
+    if (token !== undefined) {
+      return { loggedIn: true, name: '', csrf: token, member: false, readOnly: false };
+    }
+    if (answer.html.includes(LOGGED_OUT_MARK) && !answer.html.includes('top-account')) {
+      return { loggedIn: false };
+    }
+  }
+  throw new Error(`the top page said neither (${answer.status})`);
+}
+
+/**
+ * Logs out of the top page (plan 8M-14) as the map does (`logOut`): with the page's token, and
+ * when that is stale (the bot restarted and made a new key since the page loaded) once more with
+ * the token of the top page asked anew, which has no `/api/me` of its own. Logged out only when
+ * that page is the one for a visitor logged out (`LOGGED_OUT_MARK`); anything else fails.
+ */
+export function topLogout(csrf: string, steps: TopLogoutSteps): Promise<'done' | 'failed'> {
+  return logOut(csrf, {
+    post: (token) => steps.post(token),
+    me: async () => whoTopSays(await steps.page()),
+  });
+}
diff --git a/src/web/client/top.ts b/src/web/client/top.ts
new file mode 100644
index 00000000..930c7bf5
--- /dev/null
+++ b/src/web/client/top.ts
@@ -0,0 +1,42 @@
+import { LOGOUT_FAILED } from './logout.js';
+import { topLogout } from './top-logout.js';
+
+/**
+ * The script of the top page (plan 8M-14, `/assets/top.js`): its Log out POSTs `/auth/logout`
+ * with the token of the button's `data-csrf` (`X-Pine-CSRF`), then loads `/` anew, which shows
+ * the login; a failure is said in `#notice`, as text.
+ */
+
+const button = document.querySelector<HTMLButtonElement>('button.top-logout');
+const notice = document.querySelector<HTMLElement>('#notice');
+
+button?.addEventListener('click', () => {
+  button.disabled = true;
+  void topLogout(button.dataset.csrf ?? '', {
+    post: (token) =>
+      fetch('/auth/logout', {
+        method: 'POST',
+        credentials: 'same-origin',
+        headers: { 'x-pine-csrf': token },
+      }).then((answer) => answer.status),
+    // A redirect is not followed (an opaque answer, status 0): it says neither, and fails.
+    page: async () => {
+      const answer = await fetch('/', {
+        credentials: 'same-origin',
+        cache: 'no-store',
+        redirect: 'manual',
+      });
+      return { status: answer.status, html: answer.status === 200 ? await answer.text() : '' };
+    },
+  }).then((result) => {
+    if (result === 'done') {
+      location.assign('/');
+      return;
+    }
+    button.disabled = false;
+    if (notice) {
+      notice.textContent = LOGOUT_FAILED;
+      notice.hidden = false;
+    }
+  });
+});
diff --git a/src/web/top-page.test.ts b/src/web/top-page.test.ts
index c4341bc8..f886275f 100644
--- a/src/web/top-page.test.ts
+++ b/src/web/top-page.test.ts
@@ -2,7 +2,10 @@ import { afterEach, describe, expect, it, vi } from 'vitest';
 import type { MemberDirectory } from '../discord/member-directory.js';
 import { Tally } from '../../test/support/tally.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
+import { blockAt, clientSheet } from '../../test/support/stylesheets.js';
 import { webServerWith, type TestWeb } from '../../test/support/web.js';
+import { csrfInTop, LOGGED_OUT_MARK as CLIENT_LOGGED_OUT_MARK } from './client/top-logout.js';
+import { LOGGED_OUT_MARK } from './top-page.js';
 import { TOP_LOOKUP_MS, TOP_PER_MINUTE } from './top-routes.js';
 
 const ASH = '700000000000000001';
@@ -325,4 +328,67 @@ describe('the top page', () => {
     expect(answer.headers['cache-control']).toBe('no-store');
     expect(answer.body).toBe('');
   });
+
+  it("gives its script the session's token on Log out, as the script reads it", async () => {
+    web = webServerWith({
+      serversWithMap: [PINEWOOD, OAKVALE],
+      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id).add(ASH, 'Ash', OAKVALE.id),
+    });
+    const posting = await web.posting(ASH, 'Ash');
+    const answer = await web.app.inject({ url: '/', headers: { cookie: posting.cookie } });
+    expect(csrfInTop(answer.body)).toBe(posting['x-pine-csrf']);
+  });
+
+  it('marks its pages for a visitor logged out as its script looks for them', async () => {
+    expect(LOGGED_OUT_MARK).toBe(CLIENT_LOGGED_OUT_MARK);
+    web = webServerWith({ serversWithMap: [PINEWOOD] });
+    expect((await web.app.inject({ url: '/' })).body).toContain(CLIENT_LOGGED_OUT_MARK);
+  });
+
+  it("draws every class of its pages in the short pages' stylesheet, no style in the markup", async () => {
+    web = webServerWith({
+      web: { invites: { [OAKVALE.id]: OAK_INVITE } },
+      serversWithMap: [PINEWOOD, OAKVALE, ELMHURST],
+      members: new FakeMemberDirectory().add(ASH, 'Ash', PINEWOOD.id).add(ASH, 'Ash', ELMHURST.id),
+    });
+    const loggedOut = (await web.app.inject({ url: '/?login=failed' })).body;
+    const loggedIn = (
+      await web.app.inject({ url: '/', headers: { cookie: await web.loggedIn(ASH, 'Ash') } })
+    ).body;
+    const sheet = clientSheet('pages.css');
+    const classes = new Set(
+      [loggedOut, loggedIn].flatMap((body) =>
+        [...body.matchAll(/class="([^"]+)"/gu)].flatMap((match) => (match[1] ?? '').split(' ')),
+      ),
+    );
+    expect([...classes].sort()).toEqual([
+      'short',
+      'top-account',
+      'top-failed',
+      'top-join',
+      'top-login',
+      'top-logout',
+      'top-notice',
+      'top-servers',
+    ]);
+    for (const name of classes) {
+      expect(sheet, name).toMatch(new RegExp(`\\.${name}\\b[^{]*\\{`, 'u'));
+    }
+    for (const body of [loggedOut, loggedIn]) {
+      expect(body).not.toMatch(/\sstyle=/u);
+      expect(body).not.toMatch(/<script>/u);
+    }
+  });
+
+  it('breaks a long name of a server or of the visitor rather than widening the page', () => {
+    const sheet = clientSheet('pages.css');
+    for (const selector of [
+      /body\.short ul\.top-servers li\s*\{/u,
+      /body\.short \.top-account bdi\s*\{/u,
+    ]) {
+      expect(blockAt(sheet, selector), String(selector)).toMatch(/overflow-wrap:\s*anywhere;/u);
+    }
+    // The name's line may shrink beside Log out (the flex row's item), so that it can wrap.
+    expect(blockAt(sheet, /body\.short \.top-account span\s*\{/u)).toMatch(/min-width:\s*0;/u);
+  });
 });
````

## After the last task

- [ ] `npm run check > var/toppage-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 5d41d58add12084abcce97d3f1d8d44827cfe8da HEAD -- src test scripts` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: the staging checklist `docs/superpowers/plans/2026-10-29-phase-8m14-staging.md`, follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
