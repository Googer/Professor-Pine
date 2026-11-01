# Phase 8M-8B: The Post's Controls as Web Forms: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the second of the three 8M-8 plans of the web polish: the controls of a party's post that 8M-8A left as "Do this on Discord →" work on the map, over the same code paths as their Discord dialogs and buttons (8M-8C keeps Split…, Manage… beyond the conductor and kind, and the route editor; starting a new group stays on Discord).

- **Task 1:** who may change a raid on the map is Discord's rule (`mayChange` = not read-only; the sign-up-or-staff 403 goes); the post view's key folds in its version and the controls table.
- **Task 2:** +1, −1 and the completion question.
- **Task 3:** Group… (choose or move between existing groups; "Start a new group on Discord →" where only a new group is left).
- **Task 4:** Meet… (the dialog's pick list of meeting times).
- **Task 5:** staff's Delete… (archive or delete, `closePartyAs` shared with `/delete`).
- **Task 6:** Report… to the moderators (for members who may see the forum).
- **Task 7:** docs, the controls table and the staging checklist.

**Tech stack:** TypeScript 6.0, Node 24, Leaflet, esbuild, Fastify and Vitest. No new dependency, no migration, no setting, no command change (no deploy needed).

**Spec:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` (approved by Matt 2026-10-25) and the brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (git-ignored) with its builder check's rulings, `fix-list.md` and `progress.md`. **Provisional rulings for Matt to confirm** (follow-ups): who may change a raid on the map (anyone the map shows it to and not barred), meetups unchanged (maker or staff), Report… only for members who may see the forum.

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8m8b` (tip `994cca9c`), one commit per task, on typescript-migration 9789e90d. Each commit typechecks and passes its tests; on the tip the full check passes (10,111 tests), the build passes and the database suite passes (611 tests).

**Reviews:**

- **The brief:** an Opus builder check (delete and report are not post buttons, max battles are not drawn before 8M-9, Meet… is a pick list, no "Discord rule" function exists, a view version for the browser cache), all ruled by the controller.
- **The prototype:** an Opus review (high): ready after fixes (1 Important: Group… with nothing to choose; 6 Minor); fix round 1 folded in.
- **The fix round:** a scoped Opus re-review (4 Minor: the focus after the redraw, two tests, the closed party, an unread attribute); fix round 2 folded in.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `parties-and-posts.md`, `discord-framework.md`, `moderation.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck (root and `src/web/client`) and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- Discord's dialogs and buttons behave exactly as before after their logic moved to shared functions (their tests unchanged).
- Every new route: members only, barred forums refused, CSRF, the Discord control's throttle counted once and given back where the router gives it back.
- A stale choice (a group changed, a meeting time gone) refused in Discord's words.
- A staff member who lost the role is refused by the fresh fetch.
- A browser that cached a post before the deploy gets the new controls (the key changes with the table).

---

## Tasks

### Task 1: 8M-8B task 1: who may change a raid on the map, and the post view's version

Prototype commit: `2b427674456e49f2ed5459782d3e8c9986515412`

Matt's ruling (X5): Discord lets anybody in a raid's post set its hatch,
end and boss, so the map lets anybody it shows the raid to (a member not
barred from its forum) do the same. mayChangeRaid goes, MapRaid.mayChange
is !readOnly, and the change route's 403 NOT_YOURS goes; /moveset falls
under the same rule.

X6: every postKey is layoutKey of POST_VIEW_VERSION, the table CONTROLS
itself (review W-3) and the layout's JSON, so that no browser keeps a
view an older one drew under its key: a change of what a button does on
the map changes every key by itself, and the version is raised only with
a change of how postView draws.

**Files:**

```
 src/domain/web/party-data.ts      |  5 +++--
 src/domain/web/party-view.test.ts | 16 +++++++---------
 src/domain/web/party-view.ts      | 17 ++++++-----------
 src/render/post-view.test.ts      | 27 ++++++++++++++++++++++++++-
 src/render/post-view.ts           | 38 ++++++++++++++++++++++++++++++++------
 src/web/raid-change.test.ts       | 24 ++++++++++--------------
 src/web/raid-routes.ts            | 14 +++++---------
 7 files changed, 89 insertions(+), 52 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/render/post-view.test.ts src/web/raid-change.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2b427674456e49f2ed5459782d3e8c9986515412 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8B task 1: who may change a raid on the map, and the post view's version`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index c21c9b53fcea2755769fb44f00ae8d6c36f1b5a5..3ce2484760753ee47874598f50a193f22caa6354 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -128,8 +128,9 @@ export interface MapRaid {
    */
   place: MapRaidPlace | null;
   /**
-   * Whether the member may change its times, boss and moves on the map (signed up, or staff;
-   * plan 8M-4); never while read-only.
+   * Whether the member may change its times, boss and moves on the map: as on Discord, where
+   * anybody in the post may (plan 8M-8B, Matt's ruling; anybody the map shows the raid to);
+   * never while read-only.
    */
   mayChange: boolean;
   attendance: MapAttendance;
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 43ec4960466aaf4eb2f84d4505a16cd494b2abc1..521c385e619063f9d10361f29202abf153c1ea27 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -24,7 +24,6 @@ import { setHatchTime } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
 import {
   mapParty,
-  mayChangeRaid,
   partyView,
   conductorOf,
   moveRefusalOf,
@@ -98,7 +97,8 @@ describe('partyView', () => {
         endTime: egg.endTime,
         link: `https://discord.com/channels/${GUILD}/700000000000000001`,
         place: null,
-        mayChange: false,
+        // Anybody the map shows the raid to (plan 8M-8B).
+        mayChange: true,
         postKey: null,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
@@ -212,15 +212,13 @@ describe('partyView', () => {
     expect(view.raids[0]?.attendance.actions).toEqual([]);
   });
 
-  it('lets a member signed up for a raid, and staff, change it on the map; nobody while read-only', () => {
+  // Plan 8M-8B (Matt's ruling, X5): Discord lets anybody in the post set the hatch, the end and
+  // the boss; on the map that is anybody it shows the raid to (not barred from its forum).
+  it('lets any member the map shows a raid to change it, signed up or not; nobody while read-only', () => {
     const signedUp = withAttendees(egg, { [ALICE]: { status: PartyStatus.Interested } });
     expect(partyView(input([signedUp])).raids[0]?.mayChange).toBe(true);
-    expect(partyView(input([egg])).raids[0]?.mayChange).toBe(false);
-    expect(partyView(input([egg], { staff: true })).raids[0]?.mayChange).toBe(true);
-    expect(partyView(input([signedUp], { readOnly: true })).raids[0]?.mayChange).toBe(false);
-    expect(mayChangeRaid(signedUp, ALICE, false)).toBe(true);
-    expect(mayChangeRaid(egg, ALICE, false)).toBe(false);
-    expect(mayChangeRaid(egg, ALICE, true)).toBe(true);
+    expect(partyView(input([egg])).raids[0]?.mayChange).toBe(true);
+    expect(partyView(input([egg], { readOnly: true })).raids[0]?.mayChange).toBe(false);
   });
 
   // Plan 8X-5 (design 7): a max battle is drawn at its spot, as a raid at its gym.
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 8cff75d37e03c101d3df70c1f75c07f684ecb4a0..b9a0afff287c8996264419bfea815435e4b0771d 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -226,19 +226,12 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
   };
 }
 
-/**
- * Whether a member may change a raid on the map (spec 3.6: its times, boss and moves): one signed
- * up for it (`mayArrange`), or staff.
- */
-export function mayChangeRaid(party: RaidParty, memberId: string, staff: boolean): boolean {
-  return staff || mayArrange(party, memberId);
-}
-
 /**
  * Whether a member may change a meetup on the map (spec 3.7, "its maker and staff"; plan 8M-5M):
  * the member who made it, or staff (an admin, a moderator, the bot's owner). The commands let
- * anybody in the post change its name, information and end; the map, which crosses forums, asks
- * more, as for raids. A start also needs what `/meet` asks, a sign-up (`mayArrange`).
+ * anybody in the post change its name, information and end; the map asks more (a meetup's text
+ * is safety-relevant since plan 8S-1; plan 8M-8B leaves it so, Matt to confirm). A start also
+ * needs what `/meet` asks, a sign-up (`mayArrange`).
  */
 export function mayEditMeetup(
   party: Pick<MeetupParty, 'createdById'>,
@@ -268,7 +261,9 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
     place: look.place
       ? { ...look.place, lat: round(look.place.lat), lon: round(look.place.lon) }
       : null,
-    mayChange: !input.readOnly && mayChangeRaid(party, input.memberId, input.staff),
+    // Discord's rule (Matt, plan 8M-8B): anybody in the post may set the hatch, the end and the
+    // boss; on the map, anybody it shows the raid to, which leaves out who is barred from its forum.
+    mayChange: !input.readOnly,
     attendance: attendanceOf(party, input, stage === 'hatched'),
     postKey: input.postKey?.(party) ?? null,
   };
diff --git a/src/render/post-view.test.ts b/src/render/post-view.test.ts
index ae69cc017b1c85dfc9a1d7f4119ce9c0f8e7945c..cfc4e45feee336377acab18ce351c8d245742bfc 100644
--- a/src/render/post-view.test.ts
+++ b/src/render/post-view.test.ts
@@ -18,7 +18,15 @@ import {
   wholeRouteButton,
 } from './party-controls.js';
 import { ENDED_COLOUR, type PostLayout } from './party-post.js';
-import { accentName, postKey, postView, type PostViewOptions } from './post-view.js';
+import {
+  accentName,
+  CONTROLS,
+  layoutKey,
+  POST_VIEW_VERSION,
+  postKey,
+  postView,
+  type PostViewOptions,
+} from './post-view.js';
 import { STAGE_COLOURS } from './raid-post.js';
 import { TIMED_COLOUR } from './timed-post.js';
 
@@ -288,4 +296,21 @@ describe('postKey', () => {
     expect(postKey(one)).not.toBe(postKey({ ...one, blocks: [{ type: 'text', content: 'b' }] }));
     expect(postKey(one)).toMatch(/^[0-9a-f]{16}$/u);
   });
+
+  // Plan 8M-8B (X6): the browser keeps a post's view by its key for a day, so a view drawn anew
+  // (a button that does another thing on the map) must come under another key.
+  it('changes with the version of the view, so that no page keeps a view an older one drew', () => {
+    const one: PostLayout = { accent: TIMED_COLOUR, blocks: [{ type: 'text', content: 'a' }] };
+    expect(postKey(one)).toBe(layoutKey(one, POST_VIEW_VERSION, CONTROLS));
+    expect(layoutKey(one, POST_VIEW_VERSION + 1, CONTROLS)).not.toBe(postKey(one));
+    expect(layoutKey(one, POST_VIEW_VERSION + 1, CONTROLS)).toMatch(/^[0-9a-f]{16}$/u);
+  });
+
+  // Review W-3: what each button does on the map is part of the key by itself, so that a change
+  // of the table never needs a version raised by hand.
+  it('changes with what a button does on the map', () => {
+    const one: PostLayout = { accent: TIMED_COLOUR, blocks: [{ type: 'text', content: 'a' }] };
+    const changed = { ...CONTROLS, maybe: { kind: 'none' as const } };
+    expect(layoutKey(one, POST_VIEW_VERSION, changed)).not.toBe(postKey(one));
+  });
 });
diff --git a/src/render/post-view.ts b/src/render/post-view.ts
index d45bef6707b02bd2b8fd884b8a93f087f24a2adb..8c160c646232d62bbeabe19a48666bc97fed574d 100644
--- a/src/render/post-view.ts
+++ b/src/render/post-view.ts
@@ -38,18 +38,41 @@ export function accentName(accent: number): PostAccent {
   return ACCENTS.get(accent) ?? 'other';
 }
 
+/**
+ * The version of the post's view's own logic (plan 8M-8B, X6): raised with any change of how
+ * `postView` draws the same layout, so that every post's key changes with it and no browser keeps
+ * a view an older one drew (the route lets it keep a view by its key for a day). What each button
+ * does on the map (`CONTROLS`) is in every key by itself (review W-3): no version for it.
+ */
+export const POST_VIEW_VERSION = 1;
+
 /** What layouts were keyed already: a layout is kept as the post was last shown, unchanged. */
 const keys = new WeakMap<PostLayout, string>();
 
 /**
- * The key of a layout (`MapParty.postKey`): 16 hex digits of the SHA-256 of its JSON, the same
- * for the same post and another once anything of it changed, so that a page asks for a post only
- * when it changed and may keep it by its key.
+ * 16 hex digits of the SHA-256 of a view's version, what its buttons do on the map (`controls`,
+ * `CONTROLS`) and its layout's JSON.
+ */
+export function layoutKey(
+  layout: PostLayout,
+  version: number,
+  controls: Partial<Readonly<Record<PartyAction, PostControl>>>,
+): string {
+  return createHash('sha256')
+    .update(`${String(version)}\n${JSON.stringify(controls)}\n${JSON.stringify(layout)}`)
+    .digest('hex')
+    .slice(0, 16);
+}
+
+/**
+ * The key of a layout (`MapParty.postKey`): `layoutKey` at the view's version and its `CONTROLS`,
+ * the same for the same post and another once anything of it changed (or the view did), so that
+ * a page asks for a post only when it changed and may keep it by its key.
  */
 export function postKey(layout: PostLayout): string {
   let key = keys.get(layout);
   if (key === undefined) {
-    key = createHash('sha256').update(JSON.stringify(layout)).digest('hex').slice(0, 16);
+    key = layoutKey(layout, POST_VIEW_VERSION, CONTROLS);
     keys.set(layout, key);
   }
   return key;
@@ -72,8 +95,11 @@ export function linkedPosts(layout: PostLayout): string[] {
   ];
 }
 
-/** What each of a party's buttons does on the map, by the action of its custom id. */
-const CONTROLS: Partial<Readonly<Record<PartyAction, PostControl>>> = {
+/**
+ * What each of a party's buttons does on the map, by the action of its custom id; in every post's
+ * key (`postKey`), so a change here gives every post another key.
+ */
+export const CONTROLS: Partial<Readonly<Record<PartyAction, PostControl>>> = {
   maybe: { kind: 'press', action: 'interested' },
   join: { kind: 'press', action: 'join' },
   here: { kind: 'press', action: 'here' },
diff --git a/src/web/raid-change.test.ts b/src/web/raid-change.test.ts
index c0d4039df102e54d80ea19e3e4978581020beda8..d9120ab1dc1199774c1fa1d3d7b8384cae01c9df 100644
--- a/src/web/raid-change.test.ts
+++ b/src/web/raid-change.test.ts
@@ -150,19 +150,15 @@ describe('changing a raid on the map', () => {
     expect(map.made.current().hatchTime).toBeNull();
   });
 
-  it('lets staff change a raid they are not signed up for, and refuses any other member who is not, without counting it', async () => {
-    const throttles = new Throttles();
-    const map = await changing({}, { signedUp: false, throttles });
+  // Plan 8M-8B (Matt's ruling, X5): Discord lets anybody in the post change a raid; on the map,
+  // anybody it shows the raid to. Who is kept out of its forum is refused before (below).
+  it('lets a member who is not signed up change a raid, as anybody in its post may on Discord', async () => {
+    const map = await changing({}, { signedUp: false });
     web = map.web;
-    const refused = await map.post('hatch', { time: '30' });
-    expect(refused.status).toBe(403);
-    expect(refused.json.error).toBe(
-      'Only members signed up for this raid, and moderators, can change it here.',
-    );
-    expect(throttles.size).toBe(0);
-    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
-    expect((await map.post('hatch', { time: '30' }, owner)).status).toBe(200);
-    map.acting.add(BOB, 'Bob').standing(BOB, { roleNames: ['Moderator'], administrator: false });
+    const answer = await map.post('hatch', { time: '30' });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({ ok: true, raid: { mayChange: true } });
+    expect(map.made.current().hatchTime).toBe(HATCH);
     const bob = await map.web.posting(BOB, 'Bob');
     expect((await map.post('end', { time: '3:20pm' }, bob)).status).toBe(200);
   });
@@ -307,7 +303,7 @@ describe('changing a raid on the map', () => {
     expect((await moves()).statusCode).toBe(200);
   });
 
-  it('tells the page who may change a raid: the member signed up, and staff', async () => {
+  it('tells the page that every member it shows the raid to may change it', async () => {
     const map = await changing();
     web = map.web;
     const list = async (userId: string, name: string) => {
@@ -319,7 +315,7 @@ describe('changing a raid on the map', () => {
       return answer.json<PartiesView>().raids[0]?.mayChange;
     };
     expect(await list(ALICE, 'Alice')).toBe(true);
-    expect(await list(BOB, 'Bob')).toBe(false);
+    expect(await list(BOB, 'Bob')).toBe(true);
     expect(await list(TEST_OWNER_ID, 'Owner')).toBe(true);
   });
 
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 96dcfecaad4de7df52889ba5f47d18b63acb2c1c..da4b6f2648f10da3ffe6d9c90b511ede3946c3ab 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -29,7 +29,7 @@ import { UserError } from '../discord/errors.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import { isRaid, type RaidParty } from '../domain/party/party.js';
 import type { MapRaid } from '../domain/web/party-data.js';
-import { mapParty, mayChangeRaid } from '../domain/web/party-view.js';
+import { mapParty } from '../domain/web/party-view.js';
 import {
   RAID_CHANGES,
   type RaidAnswer,
@@ -160,10 +160,6 @@ const CHANGE_STATUS: Readonly<Record<RaidChangeAnswer['kind'], number>> = {
   gone: 409,
 };
 
-/** What a change answers a member who may not change the raid. */
-export const NOT_YOURS =
-  'Only members signed up for this raid, and moderators, can change it here.';
-
 /** What the moves of a raid answer while it has no boss whose moves are known. */
 const NO_MOVES = 'This raid has no boss whose moves I know yet.';
 
@@ -463,9 +459,8 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // per-address limit, the guard of every POST and a change the map knows (404 otherwise). Then
   // the body (400), who changes it (`actingOnTheMap`), the raid as the store has it (an active raid
   // of this server; anything else 409 "This raid is over.", as the post's buttons answer), how
-  // the member stands to its forum (barred 403), whether they may change it (signed up, or
-  // staff: `mayChangeRaid`; 403 otherwise), and only then the command's own throttle in its
-  // window; then the command's code path (`changeRaidTime`, `changeRaidBoss`, `changeRaidMoves`)
+  // the member stands to its forum (barred 403; anybody else may change it, as anybody in its
+  // post may on Discord: plan 8M-8B), and only then the command's own throttle in its window; then the command's code path (`changeRaidTime`, `changeRaidBoss`, `changeRaidMoves`)
   // and its words as text.
   const knownChange = async (request: ChangeRequest, reply: FastifyReply) => {
     if (!isRaidChange(request.params.change)) return sendFailure(request, reply, 404);
@@ -497,8 +492,9 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       } catch (err) {
         return unreachable(reply, err, guild, userId, doing);
       }
+      // Anybody the map shows the raid to may change it, as anybody in its post may on Discord
+      // (plan 8M-8B, Matt's ruling): a member barred from its forum was refused above.
       const staff = isMapStaff(acting.standing, userId, parties.ownerId);
-      if (!mayChangeRaid(party, userId, staff)) return reply.code(403).send({ error: NOT_YOURS });
       const throttled = throttledOnTheMap(
         deps,
         reply,
````

### Task 2: 8M-8B task 2: +1, -1 and the completion question on the map

Prototype commit: `936d54bd350dd5eba3fbd7ab4dae4a1b385a4298`

The post's +1 and -1 are presses of the map (MAP_COUNTS, beside
MAP_REMOTE): POST .../parties/<id>/more and .../less, no body, in the
window of the post's controls, answered in the button's words (moreWords).
MapAttendance.count says they may be pressed (never while read-only).

The completion question is on the map: MapAttendance.asked { until, word }
for the member it asked (CompletePending, its pendingUntil; the party
named by partyWord, never worked out by the page), drawn in the member's
part as "Have you completed this raid?" with "Yes, done" and "Not yet"; a
press POST .../answer with { yes }. The phone card's summary keeps it.
The question's words are the import-free render/completion-words.ts,
which the question's message on Discord uses too (review W-4).

pressStatus now carries +1, -1 and the answer, so the post's buttons and
the map's presses share one switch (components/party.ts calls it for
them; its tests pass unchanged). CONTROLS changed: every post's key
changes by itself (no version raised).

**Files:**

```
 src/commands/parties/reply.ts            | 19 +++++++++++++++----
 src/components/party.ts                  | 25 ++++---------------------
 src/domain/web/party-data.ts             | 32 +++++++++++++++++++++++++++++---
 src/domain/web/party-view.test.ts        | 25 +++++++++++++++++++++++++
 src/domain/web/party-view.ts             |  6 ++++++
 src/render/completion-words.ts           | 17 +++++++++++++++++
 src/render/party-controls.ts             | 10 +++++-----
 src/render/post-view.test.ts             |  6 +++---
 src/render/post-view.ts                  |  4 ++--
 src/web/client/map.css                   | 23 ++++++++++++++++++++++-
 src/web/client/meetup-forms.test.ts      |  1 +
 src/web/client/parties.test.ts           |  1 +
 src/web/client/party-layer.ts            |  9 ++++++++-
 src/web/client/post-draw.test.ts         | 61 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/post-draw.ts              | 52 ++++++++++++++++++++++++++++++++++++++++++++++++----
 src/web/client/raid-forms.test.ts        |  1 +
 src/web/client/raid-marker.test.ts       |  1 +
 src/web/client/train-forms.test.ts       |  1 +
 src/web/client/train-ui.isolated.test.ts |  1 +
 src/web/client/what-is-on.test.ts        |  1 +
 src/web/party-press.test.ts              | 58 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/party-routes.ts                  | 69 ++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 test/support/web.ts                      |  2 ++
 23 files changed, 363 insertions(+), 62 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/render/post-view.test.ts src/web/client/meetup-forms.test.ts src/web/client/parties.test.ts src/web/client/post-draw.test.ts src/web/client/raid-forms.test.ts src/web/client/raid-marker.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/client/what-is-on.test.ts src/web/party-press.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 936d54bd350dd5eba3fbd7ab4dae4a1b385a4298 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8B task 2: +1, -1 and the completion question on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/reply.ts b/src/commands/parties/reply.ts
index 88b98767a4f25722dc3dc8a7543672faad13d260..21304b853c397b8c8ae398f20251b9cc885da533 100644
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -269,9 +269,10 @@ export function outcomeWords<Extra>(
  * up meanwhile keeps their group).
  */
 export type StatusPress =
-  | { action: 'maybe' | 'join' | 'here' | 'done' | 'leave' }
+  | { action: 'maybe' | 'join' | 'here' | 'done' | 'leave' | 'more' | 'less' }
   | { action: 'group'; group: GroupId }
-  | { action: 'chosen'; status: 'maybe' | 'join' | 'here'; group: GroupId };
+  | { action: 'chosen'; status: 'maybe' | 'join' | 'here'; group: GroupId }
+  | { action: 'answer'; yes: boolean };
 
 /** What a press is answered with: the outcome, and how its answer is worded. */
 export type PressAnswerer<R> = <Extra>(
@@ -282,16 +283,26 @@ export type PressAnswerer<R> = <Extra>(
 /**
  * Carries out a press of an attendance button through the attendance service, exactly as the
  * post's button does, and has `answer` tell the member (the button: `answerClick`; the live map:
- * its JSON). The one code path of the post's buttons and the map's.
+ * its JSON). The one code path of the post's buttons and the map's: the statuses, +1 and −1
+ * (`moreWords`) and the completion question's "Yes, done" and "Not yet" (plan 8M-8B).
  */
 export async function pressStatus<R>(
-  attendance: Pick<AttendanceService, 'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave'>,
+  attendance: Pick<
+    AttendanceService,
+    'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave' | 'changeNumber' | 'answer'
+  >,
   partyId: string,
   member: Member,
   press: StatusPress,
   answer: PressAnswerer<R>,
 ): Promise<R> {
   switch (press.action) {
+    case 'more':
+      return answer(await attendance.changeNumber(partyId, member, 1), moreWords);
+    case 'less':
+      return answer(await attendance.changeNumber(partyId, member, -1));
+    case 'answer':
+      return answer(await attendance.answer(partyId, member, press.yes));
     case 'maybe':
       return answer(await attendance.signUp(partyId, member, PartyStatus.Interested));
     case 'join':
diff --git a/src/components/party.ts b/src/components/party.ts
index df230890caa67aa6df95587ea255b760ffe2beab..be6f33c20500097a28fc5fdcac3220d7791c23eb 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -2,7 +2,6 @@ import {
   ACTION_THROTTLE,
   actingMember,
   answerClick,
-  moreWords,
   partyOver,
   pressStatus,
   remoteWords,
@@ -79,22 +78,10 @@ export const partyButtons: ComponentHandler = {
       }
       case 'done':
       case 'leave':
-        return pressStatus(attendance, partyId, member, { action: id.action }, click);
       case 'less':
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.changeNumber(partyId, member, -1),
-        );
       case 'more':
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.changeNumber(partyId, member, 1),
-          moreWords,
-        );
+        // +1 and −1 go the map's way too (plan 8M-8B).
+        return pressStatus(attendance, partyId, member, { action: id.action }, click);
       case 'remote':
         return answerClick(
           interaction,
@@ -175,12 +162,8 @@ export const partyButtons: ComponentHandler = {
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
-        return answerClick(
-          interaction,
-          ctx,
-          partyId,
-          await attendance.answer(partyId, member, answer === 'yes'),
-        );
+        const yes = answer === 'yes';
+        return pressStatus(attendance, partyId, member, { action: 'answer', yes }, click);
       }
     }
   },
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 3ce2484760753ee47874598f50a193f22caa6354..a052ddbe7a33f3208c6f94345d59aa81374dd198 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -17,6 +17,20 @@ export type MapAction = (typeof MAP_ACTIONS)[number];
  */
 export const MAP_REMOTE = 'remote';
 
+/**
+ * The post's +1 and −1 pressed on the map (plan 8M-8B): `POST /s/<guild>/api/parties/<id>/more`
+ * and `…/less`, no body, as the post's buttons change the member's head count (a newcomer's +1
+ * signs them up as interested). Offered while anything may be pressed (`MapAttendance.count`).
+ */
+export const MAP_COUNTS = ['more', 'less'] as const;
+export type MapCount = (typeof MAP_COUNTS)[number];
+
+/**
+ * An answer to the completion question on the map (plan 8M-8B): `POST …/answer` with `{ yes }`,
+ * as the question's "Yes, done" and "Not yet" (`MapAttendance.asked`).
+ */
+export const MAP_ANSWER = 'answer';
+
 /**
  * A press of a button: with a group, the one a newcomer chose in the popup (`MapAttendance.pick`;
  * before plan 8X-1B, `join` with a group was "Join B").
@@ -66,6 +80,18 @@ export interface MapAttendance {
    * pressed apart from `actions` (`MAP_REMOTE`).
    */
   remote: MapRemote;
+  /**
+   * Whether +1 and −1 may be pressed (plan 8M-8B, `MAP_COUNTS`): as the post has them, for every
+   * member; never while read-only.
+   */
+  count: boolean;
+  /**
+   * The completion question to this member (plan 8M-8B): somebody of their group was done and
+   * asked whether they are too; `until` is when no answer counts as done (`pendingUntil`), `word`
+   * the party in the question's words (`partyWord`: `raid`, `max battle`). Absent where they were
+   * not asked, and while read-only.
+   */
+  asked?: { until: number; word: string };
 }
 
 /** The Remote switch of a party on the map (`MapAttendance.remote`). */
@@ -406,12 +432,12 @@ export type PostPanel = 'group' | 'time' | 'moves' | 'manage' | 'route';
 /**
  * What a button of a post does on the map (plan 8M-8A), decided on the server from its custom id
  * (no custom id reaches the page): a press the map makes as the post's button does (`MAP_ACTIONS`,
- * or `MAP_REMOTE`), one of the map's panels, "Do this on Discord" (a dialog the map has no form
- * for yet: −1, +1, Meet…, Split…), the note that the raid was reported from a screenshot (in the
+ * `MAP_REMOTE`, or since plan 8M-8B `MAP_COUNTS`), one of the map's panels, "Do this on Discord"
+ * (a dialog the map has no form for: Split…), the note that the raid was reported from a screenshot (in the
  * place of Screenshot feedback, whose feedback stays on Discord), or nothing.
  */
 export type PostControl =
-  | { kind: 'press'; action: MapAction | typeof MAP_REMOTE }
+  | { kind: 'press'; action: MapAction | typeof MAP_REMOTE | MapCount }
   | { kind: 'panel'; panel: PostPanel }
   | { kind: 'discord' }
   | { kind: 'screenshot' }
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 521c385e619063f9d10361f29202abf153c1ea27..fba2a75c27c33e8c177ba0e6ff2d7b5306f56785 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -106,6 +106,7 @@ describe('partyView', () => {
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
           remote: { offered: true, on: false },
+          count: true,
         },
       },
     ]);
@@ -210,6 +211,27 @@ describe('partyView', () => {
     const view = partyView(input([egg], { readOnly: true }));
     expect(view.readOnly).toBe(true);
     expect(view.raids[0]?.attendance.actions).toEqual([]);
+    expect(view.raids[0]?.attendance.count).toBe(false);
+  });
+
+  // Plan 8M-8B: +1 and −1 for everybody, as the post has them; the completion question to the
+  // member it asked, until when it waits for the answer (`pendingUntil`).
+  it('offers +1 and −1, and asks the member the completion question asked them', () => {
+    const until = at('2026-10-13T14:45');
+    const asked = withAttendees(egg, {
+      [ALICE]: { status: PartyStatus.CompletePending, pendingUntil: until },
+      [BOB]: { status: PartyStatus.Present },
+    });
+    const view = partyView(input([asked]));
+    expect(view.raids[0]?.attendance.count).toBe(true);
+    // The party in the question's words, as the domain names it (`partyWord`; review W-4).
+    expect(view.raids[0]?.attendance.asked).toEqual({ until, word: 'raid' });
+    expect(partyView({ ...input([asked]), memberId: BOB }).raids[0]?.attendance).not.toHaveProperty(
+      'asked',
+    );
+    expect(partyView(input([asked], { readOnly: true })).raids[0]?.attendance).not.toHaveProperty(
+      'asked',
+    );
   });
 
   // Plan 8M-8B (Matt's ruling, X5): Discord lets anybody in the post set the hatch, the end and
@@ -251,6 +273,7 @@ describe('partyView', () => {
             { action: 'done' },
           ],
           remote: { offered: true, on: false },
+          count: true,
         },
       },
     ]);
@@ -369,6 +392,7 @@ describe('partyView', () => {
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
           remote: { offered: true, on: false },
+          count: true,
         },
         // The member is not signed up: nothing of the route, nor its kind, is theirs to change.
         may: { arrange: false, clear: false, load: false, kind: false },
@@ -392,6 +416,7 @@ describe('partyView', () => {
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
           remote: { offered: true, on: false },
+          count: true,
         },
         // Made before 8D: no place; no information; not the member's to change.
         place: null,
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index b9a0afff287c8996264419bfea815435e4b0771d..cfcf003995b0210b65d2ed191880e3316b74cd6c 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -16,6 +16,7 @@ import {
   type RaidParty,
   type TrainParty,
   goingCount,
+  partyWord,
 } from '../party/party.js';
 import { raidStage } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
@@ -216,6 +217,9 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
       ];
   const pick = groupPick(party, input);
   const remote = { offered: !input.readOnly && remoteAllowed(party), on: own?.remote ?? false };
+  // The completion question to this member (plan 8M-8B), until no answer counts as done.
+  const until =
+    !input.readOnly && own?.status === PartyStatus.CompletePending ? own.pendingUntil : undefined;
   return {
     groups,
     going: goingCount(party),
@@ -223,6 +227,8 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
     actions,
     ...(pick === undefined ? {} : { pick }),
     remote,
+    count: !input.readOnly,
+    ...(until === undefined ? {} : { asked: { until, word: partyWord(party) } }),
   };
 }
 
diff --git a/src/render/completion-words.ts b/src/render/completion-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6ed0416937efc989755645ac64a04037d02bbf86
--- /dev/null
+++ b/src/render/completion-words.ts
@@ -0,0 +1,17 @@
+/*
+ * The words of the completion question (whether a member who was here is done too), on Discord
+ * and on the map (plan 8M-8B, review W-4), without an import, so that the map's page takes them
+ * whole: one wording for both.
+ */
+
+/** The question, after the members it names on Discord: `have you completed this raid?`. */
+export function completionAsk(word: string): string {
+  return `have you completed this ${word}?`;
+}
+
+/** What no answer means, after when it is no longer waited for. */
+export const TAKEN_AS_DONE = 'I will take it that you have.';
+
+/** The two answers. */
+export const YES_DONE = 'Yes, done';
+export const NOT_YET = 'Not yet';
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 74f2fdd48ff4b91a260cae1cae8bd987dd310525..1c477f8b792d589055d7e7614b6a2edb0c5c6aed 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -18,6 +18,7 @@ import {
   remoteAllowed,
   type Party,
 } from '../domain/party/party.js';
+import { completionAsk, NOT_YET, TAKEN_AS_DONE, YES_DONE } from './completion-words.js';
 import type { PostButton, PostEmoji } from './party-post.js';
 import { fitItems, plain } from './text.js';
 
@@ -421,15 +422,14 @@ export function completionQuestion(
     QUESTION_NAMES,
   );
   return {
-    content:
-      `${names}: have you completed this ${word}? ` +
-      `Without an answer within ${minutes} I will take it that you have.`,
+    // The map's words too (`completion-words.ts`, plan 8M-8B).
+    content: `${names}: ${completionAsk(word)} Without an answer within ${minutes} ${TAKEN_AS_DONE}`,
     components: [
       {
         type: ComponentType.ActionRow,
         components: [
-          partyButton(partyId, 'answer', 'Yes, done', ButtonStyle.Success, ['yes']),
-          partyButton(partyId, 'answer', 'Not yet', ButtonStyle.Secondary, ['no']),
+          partyButton(partyId, 'answer', YES_DONE, ButtonStyle.Success, ['yes']),
+          partyButton(partyId, 'answer', NOT_YET, ButtonStyle.Secondary, ['no']),
         ],
       },
     ],
diff --git a/src/render/post-view.test.ts b/src/render/post-view.test.ts
index cfc4e45feee336377acab18ce351c8d245742bfc..962d871cb78bbf3d04b9debce6c833d8cf3c1fac 100644
--- a/src/render/post-view.test.ts
+++ b/src/render/post-view.test.ts
@@ -58,7 +58,7 @@ function words(block: PostViewBlock | undefined): string[] {
 }
 
 describe('postView: the controls', () => {
-  it('maps a raid’s buttons to presses, panels and Discord, never sending a custom id', () => {
+  it('maps a raid’s buttons to presses (+1 and −1 among them, plan 8M-8B) and panels, never sending a custom id', () => {
     const raid = withAttendees(testRaid(), { [ALICE]: {} });
     const icons = {
       controlIcon: (name: string) => (name === 'pinejoin' ? `<:pinejoin:${SERVED}>` : undefined),
@@ -111,14 +111,14 @@ describe('postView: the controls', () => {
           emoji: { name: '⬇️' },
           style: 'secondary',
           disabled: false,
-          does: { kind: 'discord' },
+          does: { kind: 'press', action: 'less' },
         },
         {
           name: '+1',
           emoji: { name: '⬆️' },
           style: 'secondary',
           disabled: false,
-          does: { kind: 'discord' },
+          does: { kind: 'press', action: 'more' },
         },
         {
           name: 'Remote',
diff --git a/src/render/post-view.ts b/src/render/post-view.ts
index 8c160c646232d62bbeabe19a48666bc97fed574d..7f81f03f92e33cb6ab2b61b489c394e2952a9cb6 100644
--- a/src/render/post-view.ts
+++ b/src/render/post-view.ts
@@ -111,8 +111,8 @@ export const CONTROLS: Partial<Readonly<Record<PartyAction, PostControl>>> = {
   move: { kind: 'panel', panel: 'moves' },
   manage: { kind: 'panel', panel: 'manage' },
   route: { kind: 'panel', panel: 'route' },
-  less: { kind: 'discord' },
-  more: { kind: 'discord' },
+  less: { kind: 'press', action: 'less' },
+  more: { kind: 'press', action: 'more' },
   meet: { kind: 'discord' },
   split: { kind: 'discord' },
   shot: { kind: 'screenshot' },
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 33f5233bdde2706ff64aa0b220231678fdf7e7b5..25012ded015c6a94dffd43d8d53ad796861acc4f 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1443,6 +1443,27 @@ path.highlighted {
   margin: 0;
 }
 
+/* The completion question to the member it asked (plan 8M-8B), with its two answers. */
+.post-popup .completion {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+}
+
+.post-popup .completion .question {
+  font-weight: 600;
+}
+
+.post-popup .completion .small {
+  font-size: 12px;
+  color: var(--muted);
+}
+
+.post-popup .completion .post-row {
+  display: flex;
+  gap: 6px;
+}
+
 .post-popup .map-line {
   margin-top: 8px;
   color: var(--muted);
@@ -1560,6 +1581,6 @@ path.highlighted {
 .party-card.summary .post .post-row:not(:first-child),
 .party-card.summary .post .on-discord,
 .party-card.summary .post-popup > :not(.post, .map-line, .mine-part, .back),
-.party-card.summary .mine-part > :not(.mine, .group-pick) {
+.party-card.summary .mine-part > :not(.mine, .group-pick, .completion) {
   display: none;
 }
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
index 030bbb8dbe24d33dc6b2035649fb3c5af8a1827b..77506976f6f164357cf8fce22d9307145e767f9f 100644
--- a/src/web/client/meetup-forms.test.ts
+++ b/src/web/client/meetup-forms.test.ts
@@ -83,6 +83,7 @@ const MEETUP: MapMeetup = {
     mine: null,
     actions: [],
     remote: { offered: false, on: false },
+    count: false,
   },
   place: { kind: 'gym', words: 'At The Stacks', lat: 40.05, lon: -80.05, gymId: 1 },
   info: 'Bring snacks.',
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index d4f582c6d409d5275399a8b24d87fe40eaa7cf54..1044589419bcbcdfc4d2a0ac4f47d50abbb46a70 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -34,6 +34,7 @@ const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
   mine: null,
   actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
   remote: { offered: true, on: false },
+  count: true,
   ...more,
 });
 
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 33675c132b96cebcd1be63fa47f6c181bee273c6..73e28cd4d84b0a3413d6b1546b0b96b32b582976 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -540,6 +540,13 @@ export function showParties(
     const picked = scope?.querySelector<HTMLSelectElement>('select[data-group-pick]');
     const asks = action === 'interested' || action === 'join' || action === 'here';
     const group = button.dataset.group ?? (asks && picked?.value ? picked.value : undefined);
+    // An answer to the completion question (plan 8M-8B): "Yes, done" or "Not yet".
+    const sent =
+      action === 'answer'
+        ? { yes: button.dataset.yes === 'true' }
+        : group === undefined
+          ? {}
+          : { group };
     const buttons = [...(scope?.querySelectorAll('button') ?? [])].filter((each) => !each.disabled);
     for (const each of buttons) each.disabled = true;
     const pressed = await pressParty(csrf, {
@@ -550,7 +557,7 @@ export function showParties(
             method: 'POST',
             credentials: 'same-origin',
             headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
-            body: JSON.stringify(group === undefined ? {} : { group }),
+            body: JSON.stringify(sent),
           },
         );
         const body = (await answer.json().catch(() => undefined)) as unknown;
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index c320df5b64b86f4b78b9c396d0ff2bdb86cb56ea..bb27a364042e48a11e7f68afced4f86698b5bb4f 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -39,6 +39,7 @@ const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
   mine: null,
   actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
   remote: { offered: true, on: false },
+  count: true,
   ...more,
 });
 
@@ -308,6 +309,43 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
     expect(discord && seen(discord)).toBe('Do this on Discord →');
   });
 
+  // Plan 8M-8B: +1 and −1 are presses of the map, off while it is read-only (`count`).
+  it('presses +1 and −1 as the map’s presses, off while nothing may be pressed', () => {
+    const view: PostView = {
+      key: 'k',
+      accent: 'egg',
+      blocks: [
+        {
+          type: 'controls',
+          rows: [
+            [
+              button({
+                name: '−1',
+                emoji: { name: '⬇️' },
+                does: { kind: 'press', action: 'less' },
+              }),
+              button({
+                name: '+1',
+                emoji: { name: '⬆️' },
+                does: { kind: 'press', action: 'more' },
+              }),
+            ],
+          ],
+        },
+      ],
+    };
+    const on = buttonsOf(postCard(view, raid(), context));
+    expect(on.map((one) => one.attributes)).toEqual([
+      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'less', 'aria-label': '−1' }),
+      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'more', 'aria-label': '+1' }),
+    ]);
+    expect(on.some((one) => one.attributes?.disabled !== undefined)).toBe(false);
+    const off = buttonsOf(
+      postCard(view, raid({ attendance: attendance({ count: false }) }), context),
+    );
+    expect(off.every((one) => one.attributes?.disabled === '')).toBe(true);
+  });
+
   it('says the raid was reported from a screenshot, its feedback on Discord', () => {
     const note = byClass(postCard(VIEW, raid(), context), 'screenshot-note')[0];
     expect(note && seen(note)).toBe('Reported from a screenshot · feedback on Discord →');
@@ -352,6 +390,29 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
     expect(line && seen(line)).toBe('0.7 mi · Directions · Open on Discord');
   });
 
+  // Plan 8M-8B: the completion question, to the member it asked only, with its two answers.
+  it('asks the member the completion question asked them, with "Yes, done" and "Not yet"', () => {
+    const placed = { ...context, place: undefined, located: undefined, units: 'imperial' as const };
+    const asked = raid({
+      stage: 'hatched',
+      attendance: attendance({
+        mine: { status: 'present', group: 'A' },
+        // The party's word as the server sent it (review W-4), never worked out by the page.
+        asked: { until: NOW + 10 * MINUTE, word: 'max battle' },
+      }),
+    });
+    const question = byClass(postPopup(VIEW, asked, placed), 'completion')[0];
+    expect(question && seen(question)).toBe(
+      'Have you completed this max battle?Without an answer by 11:10 AM I will take it that you have.' +
+        'Yes, doneNot yet',
+    );
+    expect(question && buttonsOf(question).map((one) => one.attributes)).toEqual([
+      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'answer', 'data-yes': 'true' }),
+      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'answer', 'data-yes': 'false' }),
+    ]);
+    expect(byClass(postPopup(VIEW, raid(), placed), 'completion')).toEqual([]);
+  });
+
   it('keeps a train’s conductor and route on the map, the route shown by Route', () => {
     const train: MapTrain = {
       kind: 'train',
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index a8f7ac1574d43498856fa57c9c117ee9b5c67b0e..969f28cc6c33175166e8364f72bd2d1ce67d2b39 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -6,6 +6,7 @@ import type {
   PostView,
   PostViewBlock,
 } from '../../domain/web/party-data.js';
+import { completionAsk, NOT_YET, TAKEN_AS_DONE, YES_DONE } from '../../render/completion-words.js';
 import { distanceWords, metersBetween, type DistanceUnits, type Place } from './distance.js';
 import { meetupActions, meetupHereBox } from './meetup-forms.js';
 import { groupPick, STATUS_WORDS } from './parties.js';
@@ -152,9 +153,10 @@ function lineNode(line: PostLine, context: PostDrawContext): PageNode {
 /** Whether a member may press this press now, as the map's list of what applies says. */
 function pressable(party: MapParty, action: string): boolean {
   const { attendance } = party;
-  return action === 'remote'
-    ? attendance.remote.offered
-    : attendance.actions.some((press) => press.action === action);
+  if (action === 'remote') return attendance.remote.offered;
+  // +1 and −1 (plan 8M-8B): for everybody, as the post has them; never while read-only.
+  if (action === 'more' || action === 'less') return attendance.count;
+  return attendance.actions.some((press) => press.action === action);
 }
 
 /** What a panel of the map is on this party for this member: its attributes, else Discord. */
@@ -475,10 +477,52 @@ function minePart(party: MapParty, context: PostDrawContext): PageNode[] {
           ? meetupActions(party)
           : [];
   const pick = groupPick(party.attendance);
-  const parts = [...you, ...pick, ...own];
+  const parts = [...completionPart(party, context), ...you, ...pick, ...own];
   return parts.length === 0 ? [] : [{ tag: 'div', className: 'mine-part', children: parts }];
 }
 
+/**
+ * The completion question to the member it asked (plan 8M-8B), as the post's message asks it with
+ * its two answers ("Yes, done", "Not yet": a press `answer` with `data-yes`), and when no answer
+ * counts as done, in the reader's own zone.
+ */
+function completionPart(party: MapParty, context: PostDrawContext): PageNode[] {
+  const { asked } = party.attendance;
+  if (asked === undefined) return [];
+  // The question as Discord words it (`completionAsk`), the party named as the server sent it.
+  const ask = completionAsk(asked.word);
+  const answer = (text: string, yes: boolean, style: string): PageNode => ({
+    tag: 'button',
+    className: `press ${style}`,
+    text,
+    attributes: {
+      type: 'button',
+      'data-party': party.id,
+      'data-action': 'answer',
+      'data-yes': String(yes),
+    },
+  });
+  return [
+    {
+      tag: 'div',
+      className: 'completion',
+      children: [
+        { tag: 'div', className: 'question', text: ask.charAt(0).toUpperCase() + ask.slice(1) },
+        {
+          tag: 'div',
+          className: 'small',
+          text: `Without an answer by ${postTime(asked.until, 't', context.now, context.time)} ${TAKEN_AS_DONE}`,
+        },
+        {
+          tag: 'div',
+          className: 'post-row',
+          children: [answer(YES_DONE, true, 'success'), answer(NOT_YET, false, 'secondary')],
+        },
+      ],
+    },
+  ];
+}
+
 /**
  * The map's line under a post: how far it is (from where the member is, once the browser said;
  * `distanceWords` in the server's units), Directions (Google Maps, a route to the place), and
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index fd18ab452652208d77f578dc6feec17cfd85195c..4298f56927a395d434dca5a16a460c8421e1be45 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -82,6 +82,7 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
     mine: null,
     actions: [],
     remote: { offered: false, on: false },
+    count: false,
   },
   ...more,
 });
diff --git a/src/web/client/raid-marker.test.ts b/src/web/client/raid-marker.test.ts
index 68cb9a8ed9907b87d041e64bffe3d026056a6c8e..f2ec9aadd3835de6a8f385d728f7267727c9e65b 100644
--- a/src/web/client/raid-marker.test.ts
+++ b/src/web/client/raid-marker.test.ts
@@ -27,6 +27,7 @@ const attendance = (groups: MapAttendance['groups'], going = 0): MapAttendance =
   mine: null,
   actions: [],
   remote: { offered: false, on: false },
+  count: false,
 });
 
 const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index d9de4c51256dcd42316e339bd2df15d42bf1b6f6..7ae76567275dfa4942fe21dc8a5cfb9ed890c867 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -62,6 +62,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     mine: null,
     actions: [],
     remote: { offered: false, on: false },
+    count: false,
   },
   may: { arrange: true, clear: false, load: true, kind: false },
   panel: {
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 802c25b0148860e9f950019218d28cc67f7b3245..23e7f212e4cf3fa6160c05f39743e6110dc50854 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -256,6 +256,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     mine: null,
     actions: [],
     remote: { offered: false, on: false },
+    count: false,
   },
   may: { arrange: true, clear: false, load: true, kind: false },
   panel: {
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index b7afe5fdea24e2d52310e8421c0fe947f8f31a1e..f797a34a7b56fd7ef591cb50a9ea03f9356bf40d 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -33,6 +33,7 @@ const attendance = (coming: number, present = 0): MapAttendance => ({
   mine: null,
   actions: [],
   remote: { offered: false, on: false },
+  count: false,
 });
 
 const gym = (id: number, name: string, lat: number, lon: number): MapGym => ({
diff --git a/src/web/party-press.test.ts b/src/web/party-press.test.ts
index 13a9c1ba648c99f22c8a843c293032063c5e3639..019b5e82d5514c9e32c720b65222b6c01ad4d641 100644
--- a/src/web/party-press.test.ts
+++ b/src/web/party-press.test.ts
@@ -169,6 +169,61 @@ describe('pressing the buttons of a party on the map', () => {
     );
   });
 
+  // Plan 8M-8B: +1 and −1, as the post's buttons (`moreWords`), in the window of its controls.
+  it("takes +1 and −1 as the post's buttons: a newcomer signed up, the count, the most one may bring", async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const id = map.made.party.id;
+    expect((await map.post(press(id, 'less'))).json).toEqual({
+      ok: false,
+      text: 'You are not signed up for this raid.',
+    });
+    expect((await map.post(press(id, 'more'))).json).toEqual({
+      ok: true,
+      text: 'You are interested.',
+    });
+    expect((await map.post(press(id, 'more'))).json.text).toBe('You are interested with 1 more.');
+    expect((await map.post(press(id, 'less'))).json.text).toBe('You are interested.');
+    expect(map.made.current().attendees[ALICE]).toMatchObject({ number: 1, name: 'Alice' });
+    expect((await map.post(press(id, 'more'), { group: 'A' })).status).toBe(400);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'more' }),
+    );
+  });
+
+  it('counts +1 against the limit of the buttons of the post', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const map = await onTheMap(await reportedRaid(), throttles);
+    web = map.web;
+    expect((await map.post(press(map.made.party.id, 'more'))).status).toBe(429);
+    expect(map.made.current().attendees[ALICE]).toBeUndefined();
+  });
+
+  // Plan 8M-8B: the completion question, answered on the map as its buttons answer it.
+  it('answers the completion question as "Yes, done" and "Not yet" do', async () => {
+    const map = await onTheMap(await reportedRaid({ boss: { key: 'yveltal' } }));
+    web = map.web;
+    const id = map.made.party.id;
+    const bob = { id: BOB, name: 'Bob' };
+    await map.post(press(id, 'here'));
+    await map.made.attendance.signUp(id, bob, PartyStatus.Present);
+    await map.made.attendance.done(id, bob);
+    await map.made.attendance.flush();
+    expect(map.made.current().attendees[ALICE]?.status).toBe(PartyStatus.CompletePending);
+    expect((await map.post(press(id, 'answer'))).status).toBe(400);
+    expect((await map.post(press(id, 'answer'), { yes: false })).json).toEqual({
+      ok: true,
+      text: 'You are here.',
+    });
+    expect(map.made.current().attendees[ALICE]?.status).toBe(PartyStatus.Present);
+    expect((await map.post(press(id, 'answer'), { yes: true })).json).toMatchObject({
+      text: 'You were not asked, or you have answered already.',
+    });
+  });
+
   it("refuses Remote on an elite raid in the post's words, and a Remote with a group", async () => {
     const map = await onTheMap(await reportedRaid({ tier: { level: 'Elite', shadow: false } }));
     web = map.web;
@@ -492,7 +547,8 @@ describe('pressing the buttons of a party on the map', () => {
     const map = await onTheMap(await reportedRaid());
     web = map.web;
     const id = map.made.party.id;
-    expect((await map.post(press(id, 'more'))).status).toBe(404);
+    // +1 is one since plan 8M-8B; Split… is not.
+    expect((await map.post(press(id, 'split'))).status).toBe(404);
     expect((await map.post(press(id, 'join'), { group: 'Z' })).status).toBe(400);
     expect((await map.post(press(id, 'join'), { group: 'A', more: 1 })).status).toBe(400);
     map.acting.remove(ALICE);
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 91cd979d9cb0a1d20d2e4d73a7610568b5612690..6dd48e130bf395aa5c9045479525257106a23f04 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -21,8 +21,11 @@ import {
 } from '../domain/party/party.js';
 import {
   MAP_ACTIONS,
+  MAP_ANSWER,
+  MAP_COUNTS,
   MAP_REMOTE,
   type MapAction,
+  type MapCount,
   type PressAnswer,
 } from '../domain/web/party-data.js';
 import {
@@ -112,7 +115,16 @@ export interface PartyWebDeps {
   /** What a press does: what the post's buttons call (`pressStatus`). */
   attendance: Pick<
     AttendanceService,
-    'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave' | 'setRemote' | 'limits' | 'lobbyOf'
+    | 'signUp'
+    | 'joinInto'
+    | 'joinChosen'
+    | 'done'
+    | 'leave'
+    | 'setRemote'
+    | 'changeNumber'
+    | 'answer'
+    | 'limits'
+    | 'lobbyOf'
   >;
   /** Who presses, fetched fresh from Discord as a button carries them (`DiscordWebMembers`). */
   acting: ActingMembers;
@@ -238,6 +250,38 @@ function isMapAction(value: string): value is MapAction {
   return (MAP_ACTIONS as readonly string[]).includes(value);
 }
 
+function isMapCount(value: string): value is MapCount {
+  return (MAP_COUNTS as readonly string[]).includes(value);
+}
+
+/** Every press the map takes: the statuses, Remote, +1 and −1, an answer to the question. */
+function isPress(value: string): boolean {
+  return isMapAction(value) || isMapCount(value) || value === MAP_REMOTE || value === MAP_ANSWER;
+}
+
+/** The body of an answer to the completion question (plan 8M-8B): "Yes, done" or "Not yet". */
+const answerBodySchema = z.object({ yes: z.boolean() }).strict();
+
+/**
+ * The post's button a press of the map is, by its action and body (`StatusPress`); undefined for
+ * Remote (`MAP_REMOTE`, toggled apart), and `malformed` for a body the action does not take: a
+ * group only with Interested, Join and Here, `{ yes }` only and always with an answer.
+ */
+function pressOf(action: string, body: unknown): StatusPress | undefined | 'malformed' {
+  if (action === MAP_ANSWER) {
+    const answer = answerBodySchema.safeParse(body ?? {});
+    return answer.success ? { action: 'answer', yes: answer.data.yes } : 'malformed';
+  }
+  const parsed = pressBodySchema.safeParse(body ?? {});
+  if (!parsed.success) return 'malformed';
+  const { group } = parsed.data;
+  const takesGroup = action === 'join' || action === 'interested' || action === 'here';
+  if (group !== undefined && (!takesGroup || !isGroupId(group))) return 'malformed';
+  if (isMapAction(action)) return statusPress(action, group);
+  if (isMapCount(action)) return { action };
+  return action === MAP_REMOTE ? undefined : 'malformed';
+}
+
 /** A post's address: `/api/parties/<party id>/post?k=<its key>`. */
 type PostRequest = FastifyRequest<{
   Params: { guild: string; party: string };
@@ -452,12 +496,12 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
   // `mapMembers`), the member as Discord has them now (also by that role), the party in the store
   // and of this server, how they stand to its forum, and only then
   // the member's `ACTION_THROTTLE` in the window of the post's controls; then the press as the
-  // post's button makes it (`pressStatus`; the Remote switch, `MAP_REMOTE`, as the post's Remote
-  // button toggles it, plan 8X-5).
+  // post's button makes it (`pressStatus`, also +1, −1 and the completion question's answers since
+  // plan 8M-8B; the Remote switch, `MAP_REMOTE`, as the post's Remote button toggles it, plan
+  // 8X-5).
   const addressLimiter = new RateLimiter({ uses: PRESSES_PER_ADDRESS_MINUTE, perMs: 60_000 });
   const knownAction = async (request: PressRequest, reply: FastifyReply) => {
-    const { action } = request.params;
-    if (!isMapAction(action) && action !== MAP_REMOTE) return sendFailure(request, reply, 404);
+    if (!isPress(request.params.action)) return sendFailure(request, reply, 404);
   };
   scope.post(
     '/api/parties/:party/:action',
@@ -473,18 +517,9 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
       const session = await sessions.of(request, reply);
       if (!session) return sendFailure(request, reply, 403);
       const { guild, party: partyId, action } = request.params;
-      const body = pressBodySchema.safeParse(request.body ?? {});
-      const remote = action === MAP_REMOTE;
-      if ((!remote && !isMapAction(action)) || !body.success) {
-        return sendFailure(request, reply, 400);
-      }
-      const { group } = body.data;
-      const takesGroup = action === 'join' || action === 'interested' || action === 'here';
-      if (group !== undefined && (!takesGroup || !isGroupId(group))) {
-        return sendFailure(request, reply, 400);
-      }
-      // The Remote switch (plan 8X-5), or a button of `MAP_ACTIONS` as the post's `StatusPress`.
-      const press = isMapAction(action) ? statusPress(action, group) : undefined;
+      // The Remote switch (plan 8X-5, undefined), or a button of the post as its `StatusPress`.
+      const press = pressOf(action, request.body);
+      if (press === 'malformed') return sendFailure(request, reply, 400);
       const raidAction = press !== undefined && isRaidAction(press.action);
       const { userId } = session;
       const doing = 'pressed a button of a party';
diff --git a/test/support/web.ts b/test/support/web.ts
index 93c5ae61afb56a0a2cd256bdc86c02e1c321b156..f295157af7d46c02fe17920ecdd15587b7e184f4 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -246,6 +246,8 @@ const NO_PARTIES: PartyWebDeps = {
     done: noAttendance,
     leave: noAttendance,
     setRemote: noAttendance,
+    changeNumber: noAttendance,
+    answer: noAttendance,
     limits: () => {
       throw new Error('no parties in this test: give partyWebWith');
     },
````

### Task 3: 8M-8B task 3: Group... on the map

Prototype commit: `8cd579195ec6077211bb83e89b2e352cb59e4189`

Group... of a post is a form of the map for a member: choose or move
between the groups there are, as the post's dialog (8X-1B, 8X-G); a new
group stays on Discord ("Start a new group on Discord ->").

Moved out of the Discord handler (group-dialogs.ts) into render's
group-dialogs.ts, which the press and the map both call: groupMenu (the
refusals before the dialog opens, or its ways), groupMenuText (its title,
text and the choice's label, also over the map's ways), nothingToChange
and NOTHING_TO_CHANGE (re-exported where they were), groupSize; and in
the handler's file movedWords, the Submit's words of a move. The group's
line is groupLine of the import-free render/group-words.ts, so that the
dialog (server zone) and the page (reader's zone) word it alike.

The list carries Group...'s choices (MapAttendance.regroup, from
regroupOnTheMap through PartyViewInput.regroup): each group by letter and
stamp, label, size, and a battle's meeting time as epoch milliseconds; or
the refusal, which the post's line says in place of its link; or
{ onlyNewGroup } where a new group is the only way (review W-1: nothing
to submit, Group... shows "Start a new group on Discord ->" with the
post's link); none while read-only (X10: the button is off). Every button
that sends to Discord carries the words of its link (data-link), which
the page reads (review N-4). A move is POST .../parties/<id>/regroup
{ group, stamp, signedUp } (postControlRoutes, a new file): the checks of
every write, one use in the window of the post's controls, then
joinStamped and movedWords; a stale stamp and a member who left meanwhile
are refused in the dialog's words. Its own per-address limiter.

The page: post-forms.ts (the form in Discord's dialog look, its body,
sendPostForm, formStep, focusBack) and post-forms-ui.ts (opened in the
place of the post in a popup, a line of the list or the phone card, held
by FormHold, Cancel or Escape put the post back and the focus on the
button that opened it, review W-5; after a form went through, on that
control found again in the post drawn anew, sameControl of list-ui.ts,
review N-1). A refused move closes the form and asks for the list, its
choices being stale (review W-2).

**Files:**

```
 src/commands/parties/group-dialogs.ts         |  71 ++++++++++++++------------------
 src/domain/web/party-data.ts                  |  41 +++++++++++++++++++
 src/domain/web/party-view.test.ts             |  12 ++++++
 src/domain/web/party-view.ts                  |  10 +++++
 src/render/group-dialogs.ts                   | 173 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------------
 src/render/group-words.ts                     |  15 +++++++
 src/web/client/list-ui.ts                     |   8 +++-
 src/web/client/map.css                        |  91 +++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.ts                 |  37 +++++++++++++++++
 src/web/client/post-draw.test.ts              |  79 ++++++++++++++++++++++++++++++++++--
 src/web/client/post-draw.ts                   |  70 ++++++++++++++++++++++++++------
 src/web/client/post-forms-ui.isolated.test.ts | 327 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/post-forms-ui.ts               | 151 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/post-forms.test.ts             | 177 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/post-forms.ts                  | 214 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/raid-ui.ts                     |   3 +-
 src/web/guild-routes.ts                       |   4 ++
 src/web/party-regroup.test.ts                 | 215 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts                       |  14 +++++++
 src/web/post-control-routes.ts                | 155 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/web.ts                           |   1 +
 21 files changed, 1777 insertions(+), 91 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/post-draw.test.ts src/web/client/post-forms-ui.isolated.test.ts src/web/client/post-forms.test.ts src/web/party-regroup.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8cd579195ec6077211bb83e89b2e352cb59e4189 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8B task 3: Group... on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/group-dialogs.ts b/src/commands/parties/group-dialogs.ts
index ad8681743cee10eea288c8d70d30668950ef3a64..170e6f17452d93adc43916be700e25444ee7fce8 100644
--- a/src/commands/parties/group-dialogs.ts
+++ b/src/commands/parties/group-dialogs.ts
@@ -3,27 +3,27 @@ import type { AppContext } from '../../app-context.js';
 import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import { newGroupChangesNothing, type GroupChoice } from '../../domain/party/attendance.js';
+import type { AttendanceLimits, GroupChoice } from '../../domain/party/attendance.js';
 import {
-  attendeeOf,
   groupOf,
   hasGroups,
-  partyWord,
+  attendeeOf,
   type GroupId,
   type Party,
 } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
-import { problemText, standingReply } from '../../render/activity.js';
+import { standingReply } from '../../render/activity.js';
 import type { AttendanceOutcome } from '../../services/attendance-service.js';
 import {
   ANY_GROUP,
   chosenGroup,
   GROUP_INPUT,
+  groupMenu,
   groupMenuDialog,
-  groupWays,
   isJoinAction,
   LABEL_INPUT,
   NEW_GROUP,
+  nothingToChange,
   SIGNED_UP_MARK,
   whichGroupDialog,
   type GroupDialogView,
@@ -85,20 +85,7 @@ export async function openWhichGroup(
   await interaction.showModal(whichGroupDialog(viewFor(ctx, party, interaction.user.id), action));
 }
 
-/** What Group… says to the one member of a party's one group (decision 8). */
-export const NOTHING_TO_CHANGE = 'You are the only one here: a new group would change nothing.';
-
-/**
- * What Group… and `/group new` say to a member alone in a plain group of their own
- * (`newGroupChangesNothing`): `NOTHING_TO_CHANGE` in a party of one group, else that they are
- * alone in their group already.
- */
-function nothingToChange(party: Party, memberId: string): string {
-  const own = attendeeOf(party, memberId)?.group;
-  return party.groups.length === 1 || own === undefined
-    ? NOTHING_TO_CHANGE
-    : `You are alone in group ${own} already: a new group would change nothing.`;
-}
+export { NOTHING_TO_CHANGE } from '../../render/group-dialogs.js';
 
 /**
  * What a new group's refusal `nothing-to-change` (decided inside the store, `createGroup`) is
@@ -130,9 +117,9 @@ function viewFor(ctx: AppContext, party: Party, memberId: string): GroupDialogVi
 /**
  * "Group…" of a post (decision 3): its dialog (`groupMenuDialog`) of the ways left to this
  * member (`groupWays`: no new group for a member alone in a plain group of their own); refused
- * privately before it opens (8S-3's rule) for a party that ended, one without groups, a member
- * who has completed the raid, and where no way is left (the one member of a party's one group:
- * `NOTHING_TO_CHANGE`).
+ * privately before it opens (8S-3's rule) for a party that ended, and as `groupMenu` decides it
+ * (shared with the map, plan 8M-8B): one without groups, a member who has completed the raid,
+ * and where no way is left (the one member of a party's one group: `NOTHING_TO_CHANGE`).
  */
 export async function openGroupMenu(
   interaction: ButtonInteraction,
@@ -141,22 +128,27 @@ export async function openGroupMenu(
 ): Promise<void> {
   const party = ctx.parties.get(partyId);
   if (!party) throw new UserError(partyOver(party));
-  const limits = ctx.attendance.limits();
-  const word = partyWord(party);
   const memberId = interaction.user.id;
-  if (!hasGroups(party)) throw new UserError(problemText('no-groups', limits, word));
-  if (attendeeOf(party, memberId)?.status === PartyStatus.Complete) {
-    throw new UserError(problemText('already-done', limits, word));
-  }
-  const ways = groupWays(party, memberId);
-  if (ways.length === 0) {
-    throw new UserError(
-      newGroupChangesNothing(party, memberId)
-        ? nothingToChange(party, memberId)
-        : problemText('too-many-groups', limits, word),
-    );
-  }
-  await interaction.showModal(groupMenuDialog(viewFor(ctx, party, memberId), ways));
+  const menu = groupMenu(party, memberId, ctx.attendance.limits());
+  if ('refused' in menu) throw new UserError(menu.refused);
+  await interaction.showModal(groupMenuDialog(viewFor(ctx, party, memberId), menu.ways));
+}
+
+/**
+ * What a move of Group… is told (`joinStamped`'s outcome), by the Submit of its dialog and the
+ * map's form alike (plan 8M-8B): `Group B has changed since: press Group… again.` for a group
+ * that went or was opened again under its letter, else the outcome's words (`party` as it was
+ * found before the move: a refusal and "it is over" name its kind).
+ */
+export function movedWords(
+  limits: AttendanceLimits,
+  party: Pick<Party, 'type'> | undefined,
+  group: GroupId,
+  outcome: AttendanceOutcome,
+): { ok: boolean; text: string } {
+  return outcome.kind === 'refused' && outcome.reason === 'group-changed'
+    ? { ok: false, text: `Group ${group} has changed since: press ${GROUP_LABEL} again.` }
+    : outcomeWords(limits, party, outcome);
 }
 
 /** The way a Submit of Group…'s dialog asks for: from its custom id, else its choice. */
@@ -213,10 +205,7 @@ export async function submitGroupMenu(
     const outcome = await ctx.attendance.joinStamped(partyId, member, way.group, way.stamp, {
       signedUp,
     });
-    text =
-      outcome.kind === 'refused' && outcome.reason === 'group-changed'
-        ? `Group ${way.group} has changed since: press ${GROUP_LABEL} again.`
-        : outcomeWords(limits, party, outcome).text;
+    text = movedWords(limits, party, way.group, outcome).text;
   }
   await interaction.editReply({ content: text });
 }
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index a052ddbe7a33f3208c6f94345d59aa81374dd198..c36727eb7b80ba06d4b5db2cf19e8348672cc0ea 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -92,6 +92,47 @@ export interface MapAttendance {
    * not asked, and while read-only.
    */
   asked?: { until: number; word: string };
+  /**
+   * Group… on the map (plan 8M-8B): the choices of the post's dialog as the server worded them,
+   * or why it would not open. Absent for a party without groups, and while read-only (X10).
+   */
+  regroup?: MapRegroup;
+}
+
+/**
+ * Group… for a member on the map (plan 8M-8B), as the post's dialog of `groupWays` has it: why it
+ * would not open (`refused`, in its words), or its title (`Change group`, `Join a group`), its text
+ * (which group the member is in; what Submit does where one way is left), the label of its choice
+ * (`Move to`, `Join`), whether it was drawn for a member signed up (sent back with a move, so that
+ * one who left meanwhile is refused), the groups to move to or join (a new group is not among
+ * them: it needs a word with the others, on Discord), and whether a new group is a way there
+ * (`newGroup`: the page links the post).
+ */
+export type MapRegroup =
+  | { refused: string }
+  /** A new group is the only way left (review W-1): nothing to submit on the map, the post's link. */
+  | { onlyNewGroup: true }
+  | {
+      title: string;
+      text: string;
+      label: string;
+      signedUp: boolean;
+      choices: MapGroupWay[];
+      newGroup: boolean;
+    };
+
+/**
+ * A group Group… offers (`MapRegroup`): its letter and stamp (what a move sends back, refused once
+ * the group went or was opened again), its label (`Group B: by the bridge`), how many are in it as
+ * the dialog says it (`2 trainers`, `Nobody yet`, `2/4 coming`), and for a raid or a max battle its
+ * meeting time (epoch milliseconds, shown in the reader's zone), null while it has none.
+ */
+export interface MapGroupWay {
+  group: string;
+  stamp: string;
+  label: string;
+  size: string;
+  meeting?: number | null;
 }
 
 /** The Remote switch of a party on the map (`MapAttendance.remote`). */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index fba2a75c27c33e8c177ba0e6ff2d7b5306f56785..7dd10187d2508ec934956abd2c451e15bfe77f63 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -214,6 +214,18 @@ describe('partyView', () => {
     expect(view.raids[0]?.attendance.count).toBe(false);
   });
 
+  // Plan 8M-8B (X10): Group…'s choices as the caller words them, none while read-only.
+  it('gives Group…’s choices of a party with groups, none while the map is read-only', () => {
+    const regroup = () => ({ refused: 'You are done with this raid.' });
+    expect(partyView(input([egg], { regroup })).raids[0]?.attendance.regroup).toEqual({
+      refused: 'You are done with this raid.',
+    });
+    expect(
+      partyView(input([egg], { regroup, readOnly: true })).raids[0]?.attendance,
+    ).not.toHaveProperty('regroup');
+    expect(partyView(input([egg])).raids[0]?.attendance).not.toHaveProperty('regroup');
+  });
+
   // Plan 8M-8B: +1 and −1 for everybody, as the post has them; the completion question to the
   // member it asked, until when it waits for the answer (`pendingUntil`).
   it('offers +1 and −1, and asks the member the completion question asked them', () => {
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index cfcf003995b0210b65d2ed191880e3316b74cd6c..328c77b4c3ea0c86d3a6891ae952bdfda4b9a3c1 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -51,6 +51,7 @@ import type {
   MapTrain,
   MapTrainPanel,
   MapTrainRights,
+  MapRegroup,
   PartiesView,
 } from './party-data.js';
 import { TRAIN_KIND_WORDS } from './party-data.js';
@@ -134,6 +135,12 @@ export interface PartyViewInput {
   spotOf?: (id: string) => { name: string; lat: number; lon: number } | undefined;
   /** The origins the page may load pictures from (`pictureOrigins`). */
   pictureOrigins: readonly string[];
+  /**
+   * Group… for the member (plan 8M-8B): the choices of the post's dialog as its code words them,
+   * or its refusal; undefined for a party without groups. Left out: none. Not asked while
+   * read-only.
+   */
+  regroup?: (party: Party) => MapRegroup | undefined;
   /**
    * The key of a party's post as last shown (plan 8M-8A, `postKey` of its `PartyService.layoutOf`),
    * undefined while it has none. Left out: none has one.
@@ -220,6 +227,8 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
   // The completion question to this member (plan 8M-8B), until no answer counts as done.
   const until =
     !input.readOnly && own?.status === PartyStatus.CompletePending ? own.pendingUntil : undefined;
+  // Group… (plan 8M-8B), none while read-only (X10).
+  const regroup = input.readOnly ? undefined : input.regroup?.(party);
   return {
     groups,
     going: goingCount(party),
@@ -229,6 +238,7 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
     remote,
     count: !input.readOnly,
     ...(until === undefined ? {} : { asked: { until, word: partyWord(party) } }),
+    ...(regroup === undefined ? {} : { regroup }),
   };
 }
 
diff --git a/src/render/group-dialogs.ts b/src/render/group-dialogs.ts
index 1fd14264b1c195240a0713bcdec9e5eefc6412f4..1917e34c8274168c91c6d82dd124bbbf69096b00 100644
--- a/src/render/group-dialogs.ts
+++ b/src/render/group-dialogs.ts
@@ -10,6 +10,7 @@ import {
 import {
   attendeeOf,
   groupOf,
+  hasGroups,
   inLetterOrder,
   groupStamp,
   headCount,
@@ -21,9 +22,13 @@ import {
   type Party,
   type PartyGroup,
 } from '../domain/party/party.js';
+import type { AttendanceLimits } from '../domain/party/attendance.js';
 import { PartyStatus } from '../domain/party/status.js';
+import type { MapRegroup } from '../domain/web/party-data.js';
+import { problemText } from './activity.js';
+import { groupLine } from './group-words.js';
 import { groupWords, PARTY_KIND } from './party-controls.js';
-import { clockText, count, truncate } from './text.js';
+import { clockText, count, truncate, unplain } from './text.js';
 
 /*
  * The dialogs about groups of a post (plan 8X-1B; design
@@ -89,24 +94,32 @@ function lobbyWords(party: Party, group: GroupId, size: number): string {
 }
 
 /**
- * A short line of a group, for its choice: how many are in it (its lobby where groups have a
- * size), or `Nobody yet`, and a raid's meeting time or that it has none yet.
+ * How many are in a group, as its choice says it: its lobby where groups have a size
+ * (`2/4 coming`), else `2 trainers`, or `Nobody yet`.
  */
-export function groupDescription(view: GroupDialogView, group: PartyGroup): string {
-  const { party, lobbySize, zone } = view;
+export function groupSize(
+  view: Pick<GroupDialogView, 'party' | 'lobbySize'>,
+  group: PartyGroup,
+): string {
+  const { party, lobbySize } = view;
   const someone = Object.values(party.attendees).some((attendee) => attendee.group === group.id);
-  const size =
-    lobbySize !== undefined
-      ? lobbyWords(party, group.id, lobbySize)
-      : someone
-        ? count(headCount(party, group.id), 'trainer')
-        : 'Nobody yet';
+  return lobbySize !== undefined
+    ? lobbyWords(party, group.id, lobbySize)
+    : someone
+      ? count(headCount(party, group.id), 'trainer')
+      : 'Nobody yet';
+}
+
+/**
+ * A short line of a group, for its choice: how many are in it (`groupSize`), and a raid's meeting
+ * time or that it has none yet (`groupLine`, the map's wording too).
+ */
+export function groupDescription(view: GroupDialogView, group: PartyGroup): string {
+  const { party, zone } = view;
+  const size = groupSize(view, group);
   if (!isBattle(party)) return size;
-  const meeting =
-    group.startTime === undefined
-      ? 'no meeting time yet'
-      : `meeting at ${clockText(group.startTime, zone)}`;
-  return truncate(`${size} · ${meeting}`, 100);
+  const meeting = group.startTime === undefined ? null : clockText(group.startTime, zone);
+  return truncate(groupLine(size, meeting), 100);
 }
 
 /**
@@ -239,6 +252,112 @@ function onlyWay(way: GroupWay, signedUp: boolean): string {
     : `Submit signs you up as coming in group ${way.group.id}.`;
 }
 
+/**
+ * The words of Group…'s dialog for these ways (decisions 3 and 8), the dialog's and the map's
+ * (plan 8M-8B, over the ways it offers): the title, `Change group` for a member signed up (who
+ * `signedUp`), else `Join a group`; the text, which group the member is in, or how a newcomer
+ * joins, and what Submit does where one way is left (`only`); the choice's label.
+ */
+export function groupMenuText(
+  view: Pick<GroupDialogView, 'party' | 'memberId'>,
+  ways: readonly GroupWay[],
+): { title: string; text: string; label: string; signedUp: boolean; only?: GroupWay } {
+  const { party, memberId } = view;
+  const own = attendeeOf(party, memberId)?.group;
+  const ownGroup = own === undefined ? undefined : groupOf(party, own);
+  const intro = ownGroup
+    ? `You're in ${groupWords(ownGroup)}.`
+    : 'You join as coming, in the group you pick.';
+  const only = ways.length === 1 ? ways[0] : undefined;
+  return {
+    title: ownGroup ? 'Change group' : 'Join a group',
+    text:
+      only === undefined
+        ? intro
+        : ownGroup
+          ? `${intro} ${onlyWay(only, true)}`
+          : onlyWay(only, false),
+    label: ownGroup ? 'Move to' : 'Join',
+    signedUp: ownGroup !== undefined,
+    ...(only === undefined ? {} : { only }),
+  };
+}
+
+/** What Group… says to the one member of a party's one group (decision 8). */
+export const NOTHING_TO_CHANGE = 'You are the only one here: a new group would change nothing.';
+
+/**
+ * What Group… and `/group new` say to a member alone in a plain group of their own
+ * (`newGroupChangesNothing`): `NOTHING_TO_CHANGE` in a party of one group, else that they are
+ * alone in their group already.
+ */
+export function nothingToChange(party: Party, memberId: string): string {
+  const own = attendeeOf(party, memberId)?.group;
+  return party.groups.length === 1 || own === undefined
+    ? NOTHING_TO_CHANGE
+    : `You are alone in group ${own} already: a new group would change nothing.`;
+}
+
+/**
+ * Group… for a member as the party is now (plan 8M-8B: moved out of the press's handler, so that
+ * the post's dialog and the map decide it alike): why it does not open (a party without groups,
+ * a member who completed the raid, no way left: `nothingToChange`, or too many groups), else the
+ * ways it offers (`groupWays`).
+ */
+export function groupMenu(
+  party: Party,
+  memberId: string,
+  limits: AttendanceLimits,
+): { refused: string } | { ways: GroupWay[] } {
+  const word = partyWord(party);
+  if (!hasGroups(party)) return { refused: problemText('no-groups', limits, word) };
+  if (attendeeOf(party, memberId)?.status === PartyStatus.Complete) {
+    return { refused: problemText('already-done', limits, word) };
+  }
+  const ways = groupWays(party, memberId);
+  if (ways.length > 0) return { ways };
+  return {
+    refused: newGroupChangesNothing(party, memberId)
+      ? nothingToChange(party, memberId)
+      : problemText('too-many-groups', limits, word),
+  };
+}
+
+/**
+ * Group… on the map (plan 8M-8B): what `groupMenu` decides, the moves only (a new group needs a
+ * word with the others: "Start a new group on Discord"), worded as the dialog words them over
+ * those ways (`groupMenuText`; its text as plain text), each group by its letter and stamp, label,
+ * size and, for a raid or a max battle, its meeting time as a moment (shown in the reader's zone);
+ * undefined for a party without groups (it has no Group…).
+ */
+export function regroupOnTheMap(
+  view: GroupDialogView,
+  limits: AttendanceLimits,
+): MapRegroup | undefined {
+  const { party } = view;
+  if (!hasGroups(party)) return undefined;
+  const menu = groupMenu(party, view.memberId, limits);
+  if ('refused' in menu) return { refused: unplain(menu.refused) };
+  const moves = menu.ways.flatMap((way) => (way.kind === 'move' ? [way] : []));
+  // Only a new group left (review W-1): nothing to submit here; the page links the post.
+  if (moves.length === 0) return { onlyNewGroup: true };
+  const { title, text, label, signedUp } = groupMenuText(view, moves);
+  return {
+    title,
+    text: unplain(text),
+    label,
+    signedUp,
+    choices: moves.map(({ group }) => ({
+      group: group.id,
+      stamp: groupStamp(party, group),
+      label: groupLabel(group),
+      size: groupSize(view, group),
+      ...(isBattle(party) ? { meeting: group.startTime ?? null } : {}),
+    })),
+    newGroup: menu.ways.some((way) => way.kind === 'new'),
+  };
+}
+
 /**
  * Group…'s dialog (decision 3; decision 8 for a single way): titled `Change group` (`Join a
  * group` for a member who is not signed up, whom it signs up as coming), saying which group the
@@ -253,14 +372,9 @@ export function groupMenuDialog(
   view: GroupDialogView,
   ways: readonly GroupWay[],
 ): APIModalInteractionResponseCallbackData {
-  const { party, memberId } = view;
-  const own = attendeeOf(party, memberId)?.group;
-  const ownGroup = own === undefined ? undefined : groupOf(party, own);
-  const intro = ownGroup
-    ? `You're in ${groupWords(ownGroup)}.`
-    : 'You join as coming, in the group you pick.';
+  const { party } = view;
+  const { title, text, label, signedUp, only } = groupMenuText(view, ways);
   const [first] = ways;
-  const only = ways.length === 1 ? first : undefined;
   const options: DialogOption[] = ways.map((way) =>
     way.kind === 'new'
       ? {
@@ -280,23 +394,18 @@ export function groupMenuDialog(
       id: party.id,
       action: GROUP_MENU_FORM,
       args: [
-        ...(ownGroup ? [SIGNED_UP_MARK] : []),
+        ...(signedUp ? [SIGNED_UP_MARK] : []),
         ...(only === undefined ? [] : wayValue(party, only).split(':')),
         openToken(view.now),
       ],
     }),
-    title: ownGroup ? 'Change group' : 'Join a group',
-    text:
-      only === undefined
-        ? intro
-        : ownGroup
-          ? `${intro} ${onlyWay(only, true)}`
-          : onlyWay(only, false),
+    title,
+    text,
     ...(only === undefined && first !== undefined
       ? {
           choice: {
             id: GROUP_INPUT,
-            label: ownGroup ? 'Move to' : 'Join',
+            label,
             options,
             picked: wayValue(party, first),
           },
diff --git a/src/render/group-words.ts b/src/render/group-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cc8a47d977624e2d3837783130ff62fe705e0889
--- /dev/null
+++ b/src/render/group-words.ts
@@ -0,0 +1,15 @@
+/*
+ * The words of a group's line in the dialogs about groups (plan 8X-1B) and in Group… on the map
+ * (plan 8M-8B), without an import, so that the map's page takes it whole: one wording for both.
+ */
+
+/**
+ * A group's short line: how many are in it (`2 trainers`, `Nobody yet`, `2/4 coming`), then for a
+ * raid or a max battle its meeting time as a clock time (`meeting at 7:30 PM`), or that it has
+ * none yet (null); `undefined` for a party without meeting times. The clock time is the caller's:
+ * the server's zone on Discord, the reader's on the map.
+ */
+export function groupLine(size: string, meeting: string | null | undefined): string {
+  if (meeting === undefined) return size;
+  return meeting === null ? `${size} · no meeting time yet` : `${size} · meeting at ${meeting}`;
+}
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 1eb416745292877c9979d009c39d6326585c69a1..26d2d7c2880fe65cb2b15bbec90769f67265f127 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -228,9 +228,13 @@ export class WhatIsOn {
 /**
  * The control in `root` of the same tag and `data-` attributes as `control`, if any; none for a
  * control without a `data-` attribute, which nothing tells from the others of its tag (review fix
- * 2: the focus went to the first line).
+ * 2: the focus went to the first line). The forms of a post's controls find their control again
+ * by it after the post is drawn anew (plan 8M-8B, review N-1).
  */
-function sameControl(root: HTMLElement, control: HTMLElement): HTMLElement | null {
+export function sameControl(
+  root: Pick<ParentNode, 'querySelector'>,
+  control: HTMLElement,
+): HTMLElement | null {
   const names = control.getAttributeNames().filter((name) => name.startsWith('data-'));
   if (names.length === 0) return null;
   const data = names
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 25012ded015c6a94dffd43d8d53ad796861acc4f..68abd15d10890b31bbede4ad4cf5c26cf5836b89 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1443,6 +1443,97 @@ path.highlighted {
   margin: 0;
 }
 
+/*
+ * The post's controls as forms of the map (plan 8M-8B): in the place of the post, in the look of
+ * Discord's dialogs (its background, a title, the choices as cards, Submit and Cancel at the end).
+ */
+.post-form {
+  display: flex;
+  flex-direction: column;
+  gap: 8px;
+  min-width: 220px;
+  padding: 12px;
+  border: 1px solid var(--field-border);
+  border-radius: var(--card-radius);
+  background: var(--dialog-bg);
+  color: var(--text);
+}
+
+.post-form .form-title {
+  margin: 0;
+  font-size: 16px;
+  font-weight: 700;
+}
+
+.post-form .form-text {
+  margin: 0;
+  white-space: pre-line;
+}
+
+.post-form .form-choice {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  margin: 0;
+  padding: 0;
+  border: 0;
+}
+
+.post-form .form-choice legend,
+.post-form .form-label {
+  margin-bottom: 4px;
+  color: var(--text-soft);
+  font-size: 12px;
+  font-weight: 700;
+}
+
+.post-form .choice {
+  display: flex;
+  gap: 8px;
+  align-items: flex-start;
+  padding: 6px 8px;
+  border-radius: var(--radius);
+  background: var(--card-bg);
+  cursor: pointer;
+}
+
+.post-form .choice input {
+  margin-top: 3px;
+}
+
+.post-form .choice-words {
+  display: flex;
+  flex-direction: column;
+}
+
+.post-form .choice-line {
+  color: var(--muted);
+  font-size: 12px;
+}
+
+.post-form select,
+.post-form textarea {
+  width: 100%;
+  max-width: 100%;
+  box-sizing: border-box;
+}
+
+.post-form .to-discord {
+  color: var(--link);
+  font-size: 13px;
+}
+
+.post-form .form-buttons {
+  display: flex;
+  gap: 6px;
+  justify-content: flex-end;
+}
+
+.post-form .form-answer {
+  margin: 0;
+  color: var(--form-answer);
+}
+
 /* The completion question to the member it asked (plan 8M-8B), with its two answers. */
 .post-popup .completion {
   display: flex;
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 73e28cd4d84b0a3413d6b1546b0b96b32b582976..236f6e0bec268e74838104036d9de6d385edc3ae 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -22,6 +22,7 @@ import {
 import { renderNode, type MapGym, type PageNode } from './popup.js';
 import { FormHold, keepClicksInPopup, OpenPopup, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
+import { postFormsUi } from './post-forms-ui.js';
 import { spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
 import {
@@ -529,6 +530,35 @@ export function showParties(
     );
   };
 
+  /** A party of the list by its id, of any kind. */
+  const partyById = (id: string): MapParty | undefined =>
+    [
+      ...(view?.raids ?? []),
+      ...(view?.maxes ?? []),
+      ...(view?.trains ?? []),
+      ...(view?.meetups ?? []),
+    ].find((party) => party.id === id);
+
+  /**
+   * The post's controls that open a dialog on Discord, as the map's forms (plan 8M-8B): in the
+   * place of the post, held like the other forms; after one went through, the list at once.
+   */
+  const postForms = postFormsUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    hold,
+    origin: () => location.origin,
+    times: () => ({ now: Date.now() }),
+    done: async () => {
+      await poller.now();
+    },
+  });
+
   const press = async (button: HTMLButtonElement): Promise<void> => {
     const { party, action } = button.dataset;
     if (party === undefined || action === undefined) return;
@@ -613,6 +643,10 @@ export function showParties(
         const id = target.dataset.routeTrain ?? target.dataset.moveTrain ?? target.dataset.train;
         const train = view?.trains.find((each) => each.id === id);
         if (train) trainForms.actionClicked(target, train);
+      } else if (target.dataset.regroup !== undefined) {
+        // Group… (plan 8M-8B): its form in the place of the post.
+        const party = partyById(target.dataset.regroup);
+        if (party) postForms.regroupClicked(target, party);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       } else postButton(target);
@@ -646,6 +680,9 @@ export function showParties(
         const link = line.querySelector<HTMLElement>('.to-post');
         if (why) why.textContent = words;
         if (link) link.hidden = words !== '';
+        // The link's words for this button, as the post's drawing gave them (reviews W-1, N-4).
+        const { link: linkWords } = target.dataset;
+        if (link && linkWords !== undefined) link.textContent = linkWords;
         (words === '' ? link : why)?.focus();
       }
       open({ discord: onDiscord });
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index bb27a364042e48a11e7f68afced4f86698b5bb4f..f416a845d611b85423226d54b85d9f16b0e6b9d4 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -281,9 +281,10 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
     expect(plain.find((one) => one.text === 'Set time…')?.attributes).toHaveProperty(
       'data-on-discord',
     );
-    expect(plain.find((one) => one.text === 'Group…')?.attributes).toHaveProperty(
-      'data-on-discord',
-    );
+    // Group… without its choices in the list (read-only, plan 8M-8B X10) is off, not on Discord.
+    expect(plain.find((one) => one.text === 'Group…')?.attributes).toMatchObject({
+      disabled: '',
+    });
     expect(plain.find((one) => one.attributes?.['aria-label'] === '+1')?.attributes).toHaveProperty(
       'data-on-discord',
     );
@@ -309,6 +310,78 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
     expect(discord && seen(discord)).toBe('Do this on Discord →');
   });
 
+  // Plan 8M-8B: Group… opens the map's form from the choices the list carries, or says why not.
+  it('opens Group… as the map’s form where the list carries its choices, else says why not', () => {
+    const choices = raid({
+      attendance: attendance({
+        mine: { status: 'coming', group: 'A' },
+        regroup: {
+          title: 'Change group',
+          text: "You're in group A.",
+          label: 'Move to',
+          signedUp: true,
+          choices: [{ group: 'B', stamp: 'b', label: 'Group B', size: '1 trainer' }],
+          newGroup: false,
+        },
+      }),
+    });
+    const group = (party: MapRaid) =>
+      buttonsOf(postCard(VIEW, party, context)).find((one) => one.text === 'Group…');
+    expect(group(choices)?.attributes).toMatchObject({ 'data-regroup': 'r1' });
+    expect(group(choices)?.attributes).not.toHaveProperty('disabled');
+    const refused = raid({
+      attendance: attendance({
+        regroup: { refused: 'You are done with this raid. Use Join or Here if you are back.' },
+      }),
+    });
+    expect(group(refused)?.attributes).toMatchObject({
+      'data-on-discord': 'group',
+      'data-why': 'You are done with this raid. Use Join or Here if you are back.',
+    });
+    // Pressed (kept across redraws), the line says why in the place of the post's link.
+    const line = byClass(
+      postCard(VIEW, refused, { ...context, opened: { discord: 'group' } }),
+      'on-discord',
+    )[0];
+    expect(line && seen(line)).toBe(
+      'You are done with this raid. Use Join or Here if you are back.Do this on Discord →',
+    );
+    expect(line && all(line).find((one) => one.tag === 'a')?.attributes).toHaveProperty('hidden');
+  });
+
+  // Review N-4: the page reads the link's words off the button pressed, never works them out again.
+  it('gives every button that sends to Discord the words of the link it shows', () => {
+    const buttons = buttonsOf(postCard(VIEW, raid(), context));
+    const onDiscord = buttons.filter((one) => one.attributes?.['data-on-discord'] !== undefined);
+    expect(onDiscord.length).toBeGreaterThan(0);
+    expect(onDiscord.map((one) => one.attributes?.['data-link'])).toEqual(
+      onDiscord.map(() => 'Do this on Discord →'),
+    );
+  });
+
+  // Review W-1: a new group the only way, Group… links the post: "Start a new group on Discord →".
+  it('sends Group… to the post where a new group is the only way', () => {
+    const only = raid({
+      attendance: attendance({
+        mine: { status: 'coming', group: 'A' },
+        regroup: { onlyNewGroup: true },
+      }),
+    });
+    const group = buttonsOf(postCard(VIEW, only, context)).find((one) => one.text === 'Group…');
+    expect(group?.attributes).toMatchObject({
+      'data-on-discord': 'group',
+      'data-why': '',
+      'data-link': 'Start a new group on Discord →',
+    });
+    const line = byClass(
+      postCard(VIEW, only, { ...context, opened: { discord: 'group' } }),
+      'on-discord',
+    )[0];
+    const link = line && all(line).find((one) => one.tag === 'a');
+    expect(link?.text).toBe('Start a new group on Discord →');
+    expect(link?.attributes).not.toHaveProperty('hidden');
+  });
+
   // Plan 8M-8B: +1 and −1 are presses of the map, off while it is read-only (`count`).
   it('presses +1 and −1 as the map’s presses, off while nothing may be pressed', () => {
     const view: PostView = {
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index 969f28cc6c33175166e8364f72bd2d1ce67d2b39..b0b2e9eb46b35258a6961747acf502a261bb9e49 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -159,16 +159,37 @@ function pressable(party: MapParty, action: string): boolean {
   return attendance.actions.some((press) => press.action === action);
 }
 
-/** What a panel of the map is on this party for this member: its attributes, else Discord. */
+/**
+ * What a panel of the map is on this party for this member: its attributes, `off` where it does
+ * nothing now, else Discord.
+ */
 function panelAttributes(
   party: MapParty,
   panel: 'group' | 'time' | 'moves' | 'manage' | 'route',
-): Record<string, string> | undefined {
+): Record<string, string> | 'off' | undefined {
   switch (panel) {
-    case 'group':
-      return party.attendance.pick !== undefined && party.attendance.pick.length > 0
-        ? { 'data-focus-pick': '' }
-        : undefined;
+    case 'group': {
+      const { pick, regroup } = party.attendance;
+      // A newcomer to several groups picks in the member's part (plan 8X-1B); else Group…'s form
+      // (plan 8M-8B), or why it would not open, as the server decided it; nothing while read-only.
+      if (pick !== undefined && pick.length > 0) return { 'data-focus-pick': '' };
+      if (regroup === undefined) return 'off';
+      if ('onlyNewGroup' in regroup) {
+        // A new group the only way (review W-1): nothing to submit here, the post's link.
+        return {
+          'data-on-discord': 'group',
+          'data-why': '',
+          'data-link': discordLink(party, 'group'),
+        };
+      }
+      return 'refused' in regroup
+        ? {
+            'data-on-discord': 'group',
+            'data-why': regroup.refused,
+            'data-link': discordLink(party, 'group'),
+          }
+        : { 'data-regroup': party.id };
+    }
     case 'time':
       return party.kind === 'raid' && party.mayChange
         ? { 'data-change-raid': party.id }
@@ -190,6 +211,18 @@ function manageable(train: Extract<MapParty, { kind: 'train' }>): boolean {
   return conductor.who === 'you' || conductor.mayTake || conductor.mayDrop || train.may.kind;
 }
 
+/**
+ * The words of the line's link to the post for the button pressed: "Start a new group on
+ * Discord →" for Group… where a new group is the only way (review W-1), else "Do this on
+ * Discord →".
+ */
+export function discordLink(party: MapParty, button: string): string {
+  const { regroup } = party.attendance;
+  return button === 'group' && regroup !== undefined && 'onlyNewGroup' in regroup
+    ? 'Start a new group on Discord →'
+    : 'Do this on Discord →';
+}
+
 /**
  * What the line under the buttons says where the map has no panel of a button for the member
  * (reviews 8A-12, N1): for a train's Move… and Manage…, why they may not, as the server decided it
@@ -199,6 +232,11 @@ function manageable(train: Extract<MapParty, { kind: 'train' }>): boolean {
  * the party as it is then (review N3).
  */
 export function whyNot(party: MapParty, button: string): string {
+  // Group…'s refusal before it opens (plan 8M-8B), as the post's dialog says it.
+  if (button === 'group') {
+    const { regroup } = party.attendance;
+    return regroup !== undefined && 'refused' in regroup ? regroup.refused : '';
+  }
   if (party.kind !== 'train' || (button !== 'moves' && button !== 'manage')) return '';
   const doing = button === 'moves' ? 'move' : 'manage';
   switch (party.moveRefusal) {
@@ -235,16 +273,24 @@ function controlNode(button: PostButtonView, party: MapParty, context: PostDrawC
       attributes: href === undefined ? {} : { href, ...NEW_TAB },
     };
   }
-  let doing: Record<string, string> = ON_DISCORD;
+  // The words of the link the line shows (`data-link`, review N-4), which the page reads.
+  let doing: Record<string, string> = { ...ON_DISCORD, 'data-link': discordLink(party, '') };
   let on = !button.disabled;
   if (does.kind === 'press') {
     doing = { 'data-party': party.id, 'data-action': does.action };
     on &&= pressable(party, does.action);
   } else if (does.kind === 'panel') {
-    doing = panelAttributes(party, does.panel) ?? {
-      'data-on-discord': does.panel,
-      'data-why': whyNot(party, does.panel),
-    };
+    const attributes = panelAttributes(party, does.panel);
+    if (attributes === 'off') {
+      doing = {};
+      on = false;
+    } else {
+      doing = attributes ?? {
+        'data-on-discord': does.panel,
+        'data-why': whyNot(party, does.panel),
+        'data-link': discordLink(party, does.panel),
+      };
+    }
   } else if (does.kind === 'none') {
     doing = {};
     on = false;
@@ -341,7 +387,7 @@ export function postCard(view: PostView, party: MapParty, context: PostDrawConte
                 {
                   tag: 'a',
                   className: 'to-post',
-                  text: 'Do this on Discord →',
+                  text: discordLink(party, pressed ?? ''),
                   attributes: { href, ...NEW_TAB, ...(why ? { hidden: '' } : {}) },
                 },
               ]),
diff --git a/src/web/client/post-forms-ui.isolated.test.ts b/src/web/client/post-forms-ui.isolated.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1b4db8dea35a03581d5843f3917eb8409fa32de7
--- /dev/null
+++ b/src/web/client/post-forms-ui.isolated.test.ts
@@ -0,0 +1,327 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import type { MapRaid } from '../../domain/web/party-data.js';
+import { postFormsUi } from './post-forms-ui.js';
+import { FormHold } from './raid-forms.js';
+
+// The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
+// loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
+vi.mock('leaflet', () => ({}));
+
+type Listener = (event: { target: FakeElement; stopPropagation(): void; key?: string }) => void;
+
+/** What has had the focus, in order, and who waits for an element to get it. */
+let focused: FakeElement[] = [];
+let focusWaiters: { element: FakeElement; resolve: () => void }[] = [];
+
+/**
+ * When `element` gets the focus (a wait that never comes in fails as the test's timeout, as the
+ * page's own tests wait: no sleeps).
+ */
+function focusOn(element: FakeElement): Promise<void> {
+  if (focused.includes(element)) return Promise.resolve();
+  return new Promise((resolve) => focusWaiters.push({ element, resolve }));
+}
+
+/**
+ * Just enough of an element for the forms of the post's controls (`post-forms-ui.ts`): attributes
+ * and `dataset`, the tree, fields, the focus, bubbling events, and the selectors it asks (tags,
+ * classes, attributes with or without a value, `:checked`, lists, a descendant).
+ */
+class FakeElement {
+  className = '';
+  hidden = false;
+  disabled = false;
+  readonly dataset: Record<string, string> = {};
+  readonly attributes = new Map<string, string>();
+  childNodes: FakeElement[] = [];
+  parent: FakeElement | undefined;
+  page = false;
+  private text: string | null = '';
+  private readonly listeners = new Map<string, Listener[]>();
+
+  constructor(readonly tag: string) {}
+
+  get tagName(): string {
+    return this.tag.toUpperCase();
+  }
+
+  get textContent(): string | null {
+    return this.childNodes.length > 0
+      ? this.childNodes.map((child) => child.textContent ?? '').join('')
+      : this.text;
+  }
+
+  set textContent(text: string | null) {
+    this.childNodes = [];
+    this.text = text;
+  }
+
+  get name(): string {
+    return this.attributes.get('name') ?? '';
+  }
+
+  get value(): string {
+    return this.attributes.get('value') ?? '';
+  }
+
+  get checked(): boolean {
+    return this.attributes.has('checked');
+  }
+
+  setAttribute(name: string, value: string): void {
+    this.attributes.set(name, value);
+    if (name.startsWith('data-')) {
+      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
+      this.dataset[key] = value;
+    }
+    if (name === 'hidden') this.hidden = true;
+    if (name === 'disabled') this.disabled = true;
+  }
+
+  getAttribute(name: string): string | null {
+    return this.attributes.get(name) ?? null;
+  }
+
+  getAttributeNames(): string[] {
+    return [...this.attributes.keys()];
+  }
+
+  append(...children: FakeElement[]): void {
+    for (const child of children) {
+      child.parent?.childNodes.splice(child.parent.childNodes.indexOf(child), 1);
+      child.parent = this;
+      this.childNodes.push(child);
+    }
+  }
+
+  replaceChildren(...children: FakeElement[]): void {
+    for (const child of this.childNodes) child.parent = undefined;
+    this.childNodes = [];
+    this.append(...children);
+  }
+
+  get isConnected(): boolean {
+    return upward(this).some((at) => at.page);
+  }
+
+  focus(): void {
+    focused.push(this);
+    for (const waiter of focusWaiters.filter((one) => one.element === this)) waiter.resolve();
+    focusWaiters = focusWaiters.filter((one) => one.element !== this);
+  }
+
+  addEventListener(type: string, listener: Listener): void {
+    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+  }
+
+  /** An event at this element, bubbling up the tree until a listener stops it. */
+  dispatch(type: string): void {
+    let stopped = false;
+    const event = {
+      target: this,
+      stopPropagation: () => {
+        stopped = true;
+      },
+    };
+    for (const at of upward(this)) {
+      for (const listener of at.listeners.get(type) ?? []) listener(event);
+      if (stopped) return;
+    }
+  }
+
+  closest(selector: string): FakeElement | null {
+    return upward(this).find((at) => matches(at, selector)) ?? null;
+  }
+
+  querySelectorAll(selector: string): FakeElement[] {
+    const below = (element: FakeElement): FakeElement[] =>
+      element.childNodes.flatMap((child) => [child, ...below(child)]);
+    return below(this).filter((element) => matches(element, selector));
+  }
+
+  querySelector(selector: string): FakeElement | null {
+    return this.querySelectorAll(selector)[0] ?? null;
+  }
+}
+
+class FakeButton extends FakeElement {}
+
+function upward(from: FakeElement): FakeElement[] {
+  const line: FakeElement[] = [];
+  for (let at: FakeElement | undefined = from; at; at = at.parent) line.push(at);
+  return line;
+}
+
+/** One compound selector: `button.press[data-regroup="r1"]`, `input[type="radio"]:checked`. */
+function matchesOne(element: FakeElement, compound: string): boolean {
+  const checked = compound.endsWith(':checked');
+  const rest = compound.replace(/:checked$/, '');
+  const tag = /^[a-z]+/.exec(rest)?.[0];
+  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((found) => found[1] ?? '');
+  const attributes = [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((found) => ({
+    name: found[1] ?? '',
+    value: found[2],
+  }));
+  const own = element.className.split(' ');
+  return (
+    (tag === undefined || element.tag === tag) &&
+    classes.every((name) => own.includes(name)) &&
+    attributes.every(
+      ({ name, value }) =>
+        element.attributes.has(name) &&
+        (value === undefined || element.attributes.get(name) === value),
+    ) &&
+    (!checked || element.checked)
+  );
+}
+
+function matches(element: FakeElement, selector: string): boolean {
+  return selector.split(',').some((one) => {
+    const parts = one.trim().split(/\s+/);
+    const last = parts.pop() ?? '';
+    if (!matchesOne(element, last)) return false;
+    let at = element.parent;
+    for (const part of parts.reverse()) {
+      while (at && !matchesOne(at, part)) at = at.parent;
+      if (!at) return false;
+      at = at.parent;
+    }
+    return true;
+  });
+}
+
+const make = (tag: string): FakeElement =>
+  tag === 'button' ? new FakeButton(tag) : new FakeElement(tag);
+
+const NOW = Date.UTC(2026, 9, 13, 18);
+
+/** A raid whose Group… moves the member from group A to group B (the one way left). */
+const raid: MapRaid = {
+  kind: 'raid',
+  postKey: 'k',
+  id: 'r1',
+  gymId: 1,
+  picture: null,
+  tier: 'Level 5 raid',
+  tierGroup: '5',
+  heading: 'Level 5 raid',
+  boss: null,
+  stage: 'hatched',
+  hatchTime: NOW - 600_000,
+  endTime: NOW + 600_000,
+  link: 'https://discord.com/channels/1/2',
+  place: null,
+  mayChange: true,
+  attendance: {
+    groups: [{ id: 'A', interested: 0, coming: 1, present: 0 }],
+    going: 1,
+    mine: { status: 'coming', group: 'A' },
+    actions: [],
+    remote: { offered: false, on: false },
+    count: true,
+    regroup: {
+      title: 'Change group',
+      text: "You're in group A. Submit moves you to group B.",
+      label: 'Move to',
+      signedUp: true,
+      choices: [{ group: 'B', stamp: 'b1', label: 'Group B', size: '1 trainer' }],
+      newGroup: false,
+    },
+  },
+};
+
+/** The post's Group… as the page draws it. */
+function groupButton(): FakeElement {
+  const button = make('button');
+  button.className = 'press secondary';
+  button.setAttribute('type', 'button');
+  button.setAttribute('data-regroup', 'r1');
+  return button;
+}
+
+/**
+ * The page over a fake document: a post (`.post-popup`) with its Group…, the form's answer from
+ * `fetch`, and `done` drawing the post anew, as the list does after a form went through (its
+ * buttons new elements).
+ */
+function page() {
+  focused = [];
+  focusWaiters = [];
+  const body = make('body');
+  body.page = true;
+  const notice = make('div');
+  const post = make('div');
+  post.className = 'party-popup post-popup raid';
+  const button = groupButton();
+  post.append(button);
+  body.append(post, notice);
+  const document = {
+    createElement: make,
+    getElementById: (id: string) => (id === 'notice' ? notice : null),
+    querySelector: (selector: string) => body.querySelector(selector),
+  };
+  vi.stubGlobal('document', document);
+  vi.stubGlobal('HTMLElement', FakeElement);
+  vi.stubGlobal('HTMLButtonElement', FakeButton);
+  vi.stubGlobal('CSS', { escape: (text: string) => text });
+  vi.stubGlobal('fetch', () =>
+    Promise.resolve({
+      ok: true,
+      status: 200,
+      json: () => Promise.resolve({ ok: true, text: 'You are coming, in group B.' }),
+    }),
+  );
+  const hold = new FormHold<unknown>({
+    draw: () => undefined,
+    popup: () => undefined,
+    later: (run) => {
+      run();
+    },
+    controls: () => undefined,
+  });
+  let redrawn: FakeElement | undefined;
+  let drawn: () => void = () => undefined;
+  const done = new Promise<void>((resolve) => {
+    drawn = resolve;
+  });
+  const ui = postFormsUi({
+    guild: '100000000000000001',
+    csrf: { get: () => 'token', set: () => undefined },
+    hold,
+    origin: () => 'https://map.example.test',
+    times: () => ({ now: NOW }),
+    done: () => {
+      // The list drawn anew: the post's controls are new elements.
+      redrawn = groupButton();
+      post.replaceChildren(redrawn);
+      drawn();
+      return Promise.resolve();
+    },
+  });
+  return { ui, button, post, done, redrawn: () => redrawn };
+}
+
+describe('the forms of the post’s controls in the page (plan 8M-8B)', () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  // Review N-1: a form that went through draws the post anew; the focus goes to its control
+  // there, not to the page.
+  it('gives the focus to the control that opened the form, found again in the post drawn anew', async () => {
+    const { ui, button, post, done, redrawn } = page();
+    ui.regroupClicked(button as unknown as HTMLButtonElement, raid);
+    // The form is drawn once its (here, ready) choices are in.
+    await Promise.resolve();
+    await Promise.resolve();
+    const submit = post.querySelector('button[data-submit]');
+    expect(submit).not.toBeNull();
+    submit?.dispatch('click');
+    await done;
+    const again = redrawn();
+    if (!again) throw new Error('the post was not drawn anew');
+    await focusOn(again);
+    expect(focused.at(-1)).toBe(again);
+    expect(again.isConnected).toBe(true);
+  });
+});
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..990ebf0664166d0c95f2e4b62f17e35c10d916f5
--- /dev/null
+++ b/src/web/client/post-forms-ui.ts
@@ -0,0 +1,151 @@
+import type { MapParty } from '../../domain/web/party-data.js';
+import { getJson } from './common.js';
+import type { Me } from './notice.js';
+import { renderNode, type PageNode } from './popup.js';
+import {
+  focusBack,
+  formStep,
+  regroupBody,
+  regroupForm,
+  sendPostForm,
+  type FormTimes,
+  type PostFormBody,
+} from './post-forms.js';
+import { sameControl } from './list-ui.js';
+import { formPlace, type FormHold } from './raid-forms.js';
+import { fieldsOf, sayUnder } from './raid-ui.js';
+
+/**
+ * The post's controls that open a dialog on Discord, as forms of the live map in the page (plan
+ * 8M-8B): each form opens in the place of the party's post (in its popup, its line of the list or
+ * the phone card: `formPlace`), held like the other forms (`FormHold`: one at a time, the list
+ * not drawn anew under it), closed by Cancel or Escape, which put the post back. A form that went
+ * through, or whose party has ended, closes and the list is asked for again; a refusal is said
+ * under the form and in the notice, and the form stays.
+ */
+export interface PostFormsDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release' | 'fit'>;
+  /** Where the page is now: Pine's origin, the reader's times. */
+  origin(): string;
+  times(): FormTimes;
+  /** After a form went through, or its party ended: the list again, which shows it as it is. */
+  done(): Promise<void>;
+}
+
+export function postFormsUi(deps: PostFormsDeps) {
+  const { guild, hold } = deps;
+
+  /**
+   * Opens `form` in the place of the post of the button pressed: only while no other form is open.
+   * `bodyOf` makes what Submit sends from the form's fields (or what is missing), to `control`.
+   */
+  const open = (
+    button: HTMLButtonElement,
+    form: PageNode,
+    control: string,
+    partyId: string,
+    bodyOf: (fields: Record<string, string>) => PostFormBody,
+    /** A refusal closes the form and the list is asked for again (`formStep`, review W-2). */
+    refusalCloses = false,
+  ): void => {
+    const section = button.closest<HTMLElement>('.post-popup');
+    if (!section) return;
+    const place = formPlace(section);
+    // Outside a popup or the card (a line of the list), its claim goes with its form.
+    const claim = hold.take(place, false, place === false ? () => section.isConnected : undefined);
+    if (!claim) return;
+    const before = [...section.childNodes];
+    const element = renderNode(form, document);
+    const close = () => {
+      section.replaceChildren(...before);
+      hold.release(claim);
+      // The focus back where it was (review W-5), the button being in the page again.
+      focusBack(button);
+    };
+    const submit = async (target: HTMLButtonElement) => {
+      const fields = fieldsOf(element);
+      // A radio choice is the one checked (`fieldsOf` reads every input by its name), else none.
+      const radios = [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
+      for (const radio of radios) fields[radio.name] = '';
+      for (const radio of radios) if (radio.checked) fields[radio.name] = radio.value;
+      const body = bodyOf(fields);
+      if ('text' in body) {
+        sayUnder(element, body.text);
+        return;
+      }
+      const buttons = [...element.querySelectorAll('button')];
+      for (const each of buttons) each.disabled = true;
+      const sent = await sendPostForm(deps.csrf.get(), {
+        post: async (token) => {
+          const reply = await fetch(
+            `/s/${guild}/api/parties/${encodeURIComponent(partyId)}/${control}`,
+            {
+              method: 'POST',
+              credentials: 'same-origin',
+              headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+              body: JSON.stringify(body.body),
+            },
+          );
+          return {
+            status: reply.status,
+            body: (await reply.json().catch(() => undefined)) as unknown,
+          };
+        },
+        me: () => getJson<Me>(`/s/${guild}/api/me`),
+      });
+      deps.csrf.set(sent.csrf);
+      for (const each of buttons) each.disabled = false;
+      sayUnder(element, sent.text);
+      // A refusal keeps the form, unless its choices may be stale (review W-2: Group…'s came with
+      // the list, which is asked for again).
+      if (formStep(sent, { refusalCloses }) === 'stay') {
+        target.focus();
+        return;
+      }
+      // Done, or over: the post back (the list draws it as it is now), unless the form went.
+      if (hold.holds(claim)) close();
+      await deps.done();
+      // The list drew the post anew: the focus on its control there (review N-1), as the list
+      // finds a focused control again (`sameControl`).
+      if (!button.isConnected) sameControl(document, button)?.focus();
+    };
+    element.addEventListener('click', (event) => {
+      const target = event.target;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) close();
+      else if (target.dataset.submit !== undefined) void submit(target);
+    });
+    element.addEventListener('keydown', (event) => {
+      if (event.key !== 'Escape') return;
+      event.stopPropagation();
+      close();
+    });
+    section.replaceChildren(element);
+    hold.fit();
+    (
+      element.querySelector<HTMLElement>('input[type="radio"]:checked') ??
+      element.querySelector<HTMLElement>('button[data-submit]')
+    )?.focus();
+  };
+
+  return {
+    /** Group…: its form, from the choices the list carries (`MapAttendance.regroup`). */
+    regroupClicked(button: HTMLButtonElement, party: MapParty): void {
+      const { regroup } = party.attendance;
+      if (regroup === undefined || !('choices' in regroup)) return;
+      open(
+        button,
+        regroupForm(party, regroup, deps.times(), deps.origin(), guild),
+        'regroup',
+        party.id,
+        (fields) => regroupBody(regroup, fields.way),
+        true,
+      );
+    },
+  };
+}
+
+export type PostFormsUi = ReturnType<typeof postFormsUi>;
diff --git a/src/web/client/post-forms.test.ts b/src/web/client/post-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7d074980e48e9f8ed6bb1497309ee4715840d5ae
--- /dev/null
+++ b/src/web/client/post-forms.test.ts
@@ -0,0 +1,177 @@
+import { describe, expect, it } from 'vitest';
+import type { MapAttendance, MapRaid, MapRegroup } from '../../domain/web/party-data.js';
+import type { PageNode } from './popup.js';
+import {
+  focusBack,
+  formStep,
+  regroupBody,
+  regroupForm,
+  sendPostForm,
+  type FormTimes,
+} from './post-forms.js';
+
+/** Tuesday 13 October 2026, 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const MINUTE = 60_000;
+const GUILD = '412345678901234567';
+const LINK = `https://discord.com/channels/${GUILD}/700000000000000001`;
+const ORIGIN = 'https://map.example.test';
+const times: FormTimes = { now: NOW, time: { locale: 'en-US', timeZone: 'America/Los_Angeles' } };
+
+const attendance: MapAttendance = {
+  groups: [{ id: 'A', interested: 0, coming: 1, present: 0 }],
+  going: 1,
+  mine: { status: 'coming', group: 'A' },
+  actions: [],
+  remote: { offered: true, on: false },
+  count: true,
+};
+
+const raid: MapRaid = {
+  kind: 'raid',
+  postKey: 'k',
+  id: 'r1',
+  gymId: 1,
+  picture: null,
+  tier: 'Level 5 raid',
+  tierGroup: '5',
+  heading: 'Level 5 raid',
+  boss: null,
+  stage: 'hatched',
+  hatchTime: NOW - 10 * MINUTE,
+  endTime: NOW + 35 * MINUTE,
+  link: LINK,
+  place: null,
+  mayChange: true,
+  attendance,
+};
+
+type Choices = Extract<MapRegroup, { choices: unknown }>;
+
+const regroup = (more: Partial<Choices> = {}): Choices => ({
+  title: 'Change group',
+  text: "You're in group A.",
+  label: 'Move to',
+  signedUp: true,
+  choices: [
+    { group: 'B', stamp: 'b1', label: 'Group B: by the bridge', size: '2 trainers', meeting: null },
+    { group: 'C', stamp: 'c1', label: 'Group C', size: '1 trainer', meeting: NOW + 20 * MINUTE },
+  ],
+  newGroup: true,
+  ...more,
+});
+
+/** Every node of a tree, depth first. */
+function all(node: PageNode): PageNode[] {
+  return [node, ...(node.children ?? []).flatMap(all)];
+}
+
+/** What a reader sees of a tree: its texts, in order. */
+function seen(node: PageNode): string {
+  return (node.text ?? '') + (node.children ?? []).map(seen).join('');
+}
+
+describe('Group… on the map (plan 8M-8B)', () => {
+  it('draws the dialog’s words, the groups as a radio choice with their lines, the first picked', () => {
+    const form = regroupForm(raid, regroup(), times, ORIGIN, GUILD);
+    expect(form.className).toBe('post-form');
+    expect(form.attributes).toMatchObject({ 'data-form': 'regroup', 'data-party': 'r1' });
+    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Change group');
+    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe("You're in group A.");
+    const radios = all(form).filter((one) => one.attributes?.type === 'radio');
+    expect(radios.map((one) => one.attributes)).toEqual([
+      { type: 'radio', name: 'way', value: 'B:b1', checked: '' },
+      { type: 'radio', name: 'way', value: 'C:c1' },
+    ]);
+    // Meeting times in the reader's own zone (Los Angeles here), as the post shows them.
+    expect(
+      all(form)
+        .filter((one) => one.className === 'choice')
+        .map(seen),
+    ).toEqual([
+      'Group B: by the bridge2 trainers · no meeting time yet',
+      'Group C1 trainer · meeting at 11:20 AM',
+    ]);
+    expect(all(form).find((one) => one.tag === 'legend')?.text).toBe('Move to');
+    const link = all(form).find((one) => one.className === 'to-discord');
+    expect(link?.text).toBe('Start a new group on Discord →');
+    expect(link?.attributes?.href).toBe(LINK);
+    expect(
+      all(form)
+        .filter((one) => one.tag === 'button')
+        .map((one) => one.text),
+    ).toEqual(['Submit', 'Cancel']);
+  });
+
+  it('asks nothing where one way is left: the text says what Submit does', () => {
+    const one = regroup({
+      text: "You're in group A. Submit moves you to group B.",
+      choices: [{ group: 'B', stamp: 'b1', label: 'Group B', size: '2 trainers' }],
+      newGroup: false,
+    });
+    const form = regroupForm(raid, one, times, ORIGIN, GUILD);
+    expect(all(form).some((node) => node.attributes?.type === 'radio')).toBe(false);
+    expect(all(form).find((node) => node.attributes?.type === 'hidden')?.attributes?.value).toBe(
+      'B:b1',
+    );
+    expect(all(form).some((node) => node.className === 'to-discord')).toBe(false);
+  });
+
+  it('sends the group picked by its letter and stamp, and whether it was drawn for a member signed up', () => {
+    expect(regroupBody(regroup(), 'C:c1')).toEqual({
+      body: { group: 'C', stamp: 'c1', signedUp: true },
+    });
+    expect(regroupBody(regroup({ signedUp: false }), 'B:b1')).toEqual({
+      body: { group: 'B', stamp: 'b1', signedUp: false },
+    });
+    expect(regroupBody(regroup(), undefined)).toEqual({ text: 'Pick a group first.' });
+    expect(regroupBody(regroup(), 'D:d1')).toEqual({ text: 'Pick a group first.' });
+  });
+});
+
+describe('what a form does after its answer (reviews W-2, W-5)', () => {
+  it('stays on a refusal, unless its choices may be stale; closes when done or over', () => {
+    expect(formStep({ ok: false, gone: false }, {})).toBe('stay');
+    // Group…'s choices came with the list: a refusal closes it and the list is asked for again.
+    expect(formStep({ ok: false, gone: false }, { refusalCloses: true })).toBe('close');
+    expect(formStep({ ok: true, gone: false }, {})).toBe('close');
+    expect(formStep({ ok: false, gone: true }, {})).toBe('close');
+  });
+
+  it('gives the focus back to the button that opened it, while it is in the page', () => {
+    const focused: string[] = [];
+    focusBack({ isConnected: true, focus: () => focused.push('in') });
+    focusBack({ isConnected: false, focus: () => focused.push('out') });
+    expect(focused).toEqual(['in']);
+  });
+});
+
+describe('sendPostForm', () => {
+  it('says the words, renews a stale token once, and tells a refusal and an ended party apart', async () => {
+    const asked: string[] = [];
+    const sent = await sendPostForm('old', {
+      post: (token) => {
+        asked.push(token);
+        return Promise.resolve(
+          token === 'old'
+            ? { status: 403, body: { error: 'Not allowed.' } }
+            : { status: 200, body: { ok: true, text: 'You are coming, in group B.' } },
+        );
+      },
+      me: () =>
+        Promise.resolve({ loggedIn: true, name: 'A', member: true, csrf: 'new', readOnly: false }),
+    });
+    expect(asked).toEqual(['old', 'new']);
+    expect(sent).toEqual({
+      text: 'You are coming, in group B.',
+      csrf: 'new',
+      ok: true,
+      gone: false,
+    });
+    const gone = await sendPostForm('t', {
+      post: () => Promise.resolve({ status: 409, body: { ok: false, text: 'This has ended.' } }),
+      me: () => Promise.reject(new Error('not asked')),
+    });
+    expect(gone).toMatchObject({ ok: false, gone: true, text: 'This has ended.' });
+  });
+});
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..eed710a516de07f4540a394476465267962a7ffc
--- /dev/null
+++ b/src/web/client/post-forms.ts
@@ -0,0 +1,214 @@
+import type { MapParty, MapRegroup } from '../../domain/web/party-data.js';
+import { groupLine } from '../../render/group-words.js';
+import { pressParty, type PressSteps, type Pressed } from './parties.js';
+import type { PageNode } from './popup.js';
+import { safeHref } from './post-draw.js';
+import { postTime, type TimeShown } from './post-time.js';
+
+/**
+ * The post's controls that open a dialog on Discord, as forms of the live map (plan 8M-8B), the
+ * parts that need no DOM: each form as a tree of nodes in Discord's dialog look (its title, its
+ * text, its choice, Submit and Cancel), drawn in the place of the post (`formPlace`: a popup, a
+ * line of the list, the phone card), its body, and sending it with the page's CSRF token as a
+ * press is sent. What the dialog says and decides is the server's, sent with the list (Group…'s
+ * choices) or asked when the form opens; the page only words times in the reader's own zone.
+ */
+
+/** Where a form's times are shown: the reader's own zone and language, as a post's are. */
+export interface FormTimes {
+  now: number;
+  time?: TimeShown;
+}
+
+const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;
+
+/** The line a form says its answer on, hidden until there is one. */
+const answerLine: PageNode = {
+  tag: 'p',
+  className: 'form-answer',
+  attributes: { hidden: '', role: 'status' },
+};
+
+/** Submit and Cancel, as Discord's dialogs have them. */
+function dialogButtons(submit: string): PageNode {
+  return {
+    tag: 'div',
+    className: 'form-buttons',
+    children: [
+      {
+        tag: 'button',
+        className: 'press primary',
+        text: 'Submit',
+        attributes: { type: 'button', 'data-submit': submit },
+      },
+      {
+        tag: 'button',
+        className: 'press secondary',
+        text: 'Cancel',
+        attributes: { type: 'button', 'data-cancel': '' },
+      },
+    ],
+  };
+}
+
+/**
+ * A radio choice as Discord's dialog draws it: its label over the choices, each with its words
+ * and a line under them; the first picked to start with, as the dialog marks it.
+ */
+function radioChoice(
+  name: string,
+  label: string,
+  choices: ReadonlyArray<{ value: string; label: string; line?: string }>,
+  picked: string | undefined,
+): PageNode {
+  return {
+    tag: 'fieldset',
+    className: 'form-choice',
+    children: [
+      { tag: 'legend', text: label },
+      ...choices.map((choice): PageNode => ({
+        tag: 'label',
+        className: 'choice',
+        children: [
+          {
+            tag: 'input',
+            attributes: {
+              type: 'radio',
+              name,
+              value: choice.value,
+              ...(choice.value === picked ? { checked: '' } : {}),
+            },
+          },
+          {
+            tag: 'span',
+            className: 'choice-words',
+            children: [
+              { tag: 'span', className: 'choice-label', text: choice.label },
+              ...(choice.line === undefined
+                ? []
+                : [{ tag: 'span', className: 'choice-line', text: choice.line }]),
+            ],
+          },
+        ],
+      })),
+    ],
+  };
+}
+
+/** A form in Discord's dialog look: its title, its parts, Submit and Cancel, its answer. */
+function dialogForm(form: string, partyId: string, title: string, parts: PageNode[]): PageNode {
+  return {
+    tag: 'div',
+    className: 'post-form',
+    attributes: { 'data-form': form, 'data-party': partyId, role: 'group', 'aria-label': title },
+    children: [
+      { tag: 'h4', className: 'form-title', text: title },
+      ...parts,
+      dialogButtons(form),
+      answerLine,
+    ],
+  };
+}
+
+/** A group's choice by its letter and stamp, as Group…'s move sends it back. */
+const wayValue = (way: { group: string; stamp: string }): string => `${way.group}:${way.stamp}`;
+
+/**
+ * Group…'s form (plan 8M-8B), as the post's dialog: its title and text as the server worded them,
+ * the groups to move to or join as a radio choice (the first picked; none to choose where one way
+ * is left: the text says what Submit does), each with how many are in it and its meeting time in
+ * the reader's zone; where a new group is a way, the post's link (it needs a word with the others).
+ */
+export function regroupForm(
+  party: MapParty,
+  regroup: Extract<MapRegroup, { choices: unknown }>,
+  times: FormTimes,
+  origin: string,
+  guild: string,
+): PageNode {
+  const clock = (at: number): string => postTime(at, 't', times.now, times.time);
+  const choices = regroup.choices.map((way) => ({
+    value: wayValue(way),
+    label: way.label,
+    line: groupLine(
+      way.size,
+      way.meeting === undefined ? undefined : way.meeting === null ? null : clock(way.meeting),
+    ),
+  }));
+  const [first] = choices;
+  const href = safeHref(party.link, origin, guild);
+  return dialogForm('regroup', party.id, regroup.title, [
+    { tag: 'p', className: 'form-text', text: regroup.text },
+    ...(choices.length > 1
+      ? [radioChoice('way', regroup.label, choices, first?.value)]
+      : first === undefined
+        ? []
+        : [{ tag: 'input', attributes: { type: 'hidden', name: 'way', value: first.value } }]),
+    ...(regroup.newGroup && href !== undefined
+      ? [
+          {
+            tag: 'a',
+            className: 'to-discord',
+            text: 'Start a new group on Discord →',
+            attributes: { href, ...NEW_TAB },
+          },
+        ]
+      : []),
+  ]);
+}
+
+/** A body to send, or what the member must do first (the page's own words). */
+export type PostFormBody = { body: Record<string, unknown> } | { text: string };
+
+/** The body of Group…'s move: the group picked by its letter and stamp. */
+export function regroupBody(
+  regroup: Extract<MapRegroup, { choices: unknown }>,
+  picked: string | undefined,
+): PostFormBody {
+  const way = regroup.choices.find((one) => wayValue(one) === picked);
+  if (way === undefined) return { text: 'Pick a group first.' };
+  return { body: { group: way.group, stamp: way.stamp, signedUp: regroup.signedUp } };
+}
+
+/**
+ * What a form does after its answer: it stays on a refusal (the member tries again), unless its
+ * choices may be stale (`refusalCloses`, review W-2: Group…'s came with the list, which is asked
+ * for again); it closes once done or once its party is over.
+ */
+export function formStep(
+  sent: Pick<PostFormSent, 'ok' | 'gone'>,
+  form: { refusalCloses?: boolean },
+): 'stay' | 'close' {
+  if (sent.ok || sent.gone) return 'close';
+  return form.refusalCloses === true ? 'close' : 'stay';
+}
+
+/** The focus back on the button that opened a form, once the form closed (review W-5). */
+export function focusBack(button: { isConnected: boolean; focus(): void }): void {
+  if (button.isConnected) button.focus();
+}
+
+/** What came of a form: the words, the token now, whether it was done, and whether it is over. */
+export interface PostFormSent extends Pressed {
+  ok: boolean;
+  /** The party has ended (409 without anything else to say): the form closes. */
+  gone: boolean;
+}
+
+/**
+ * Sends a form with the page's CSRF token as a press is sent (`pressParty`: a 403 of a stale
+ * token is tried once more with a new one), and reads whether it was done.
+ */
+export async function sendPostForm(csrf: string, steps: PressSteps): Promise<PostFormSent> {
+  let last: { status: number; body: unknown } | undefined;
+  const pressed = await pressParty(csrf, {
+    post: async (token) => {
+      last = await steps.post(token);
+      return last;
+    },
+    me: () => steps.me(),
+  });
+  const body = last?.body;
+  const ok = typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true;
+  return { ...pressed, ok, gone: last?.status === 409 };
+}
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 95a62c3fbb1b5a203ecad7fc6bfd83f6c080bba8..01380529ac46cc0e56e439fe03b4d4dfc59301f3 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -56,7 +56,8 @@ export function formControls(root: ParentNode, on: boolean): void {
   for (const button of root.querySelectorAll<HTMLButtonElement>(
     'button[data-report], button[data-change-raid], button[data-spawn], button[data-show-raid], ' +
       'button[data-new-train], button[data-route-train], button[data-move-train], ' +
-      'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup]',
+      'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
+      'button[data-regroup]',
   )) {
     button.disabled = !on;
   }
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 91931c49774f2c1a57c3b0cf7cc05e582996edfb..5b2452761bee247092eeafc177e5a234c1bcf29d 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -9,6 +9,7 @@ import { meetupRoutes } from './meetup-routes.js';
 import { shownTiles } from './headers.js';
 import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
+import { postControlRoutes } from './post-control-routes.js';
 import { PartyViewers } from './party-viewers.js';
 import { raidRoutes } from './raid-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
@@ -136,6 +137,9 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // the map's member role, when the settings name one).
   partyRoutes(scope, map, viewers);
 
+  // The post's controls that open a dialog on Discord, as forms of the map (plan 8M-8B).
+  postControlRoutes(scope, map);
+
   // Reporting and changing raids on the live map (plan 8M-4): for the same members.
   raidRoutes(scope, map);
 
diff --git a/src/web/party-regroup.test.ts b/src/web/party-regroup.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..318b6933433294f42323a35d37602649436ec92d
--- /dev/null
+++ b/src/web/party-regroup.test.ts
@@ -0,0 +1,215 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { ACTION_THROTTLE } from '../commands/parties/reply.js';
+import { controlThrottleKey } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { groupStamp } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { PartiesView, PressAnswer } from '../domain/web/party-data.js';
+import { PARTY_KIND } from '../render/party-controls.js';
+
+const MINUTE = 60_000;
+const HATCH = PARTY_NOW + 30 * MINUTE;
+
+/**
+ * A raid with times (it hatches in half an hour) of two groups on the map: the reporter in A, Bob
+ * alone in B (he opened it), Alice coming in A unless `signedUp` is false. Alice and Bob are
+ * members of the server, fetched fresh by name; the web server's clock is the parties' own.
+ */
+async function grouped(
+  options: { signedUp?: boolean; throttles?: Throttles; oneGroup?: boolean } = {},
+) {
+  const made = await reportedRaid({ time: { hatch: HATCH } });
+  const id = made.party.id;
+  if (options.oneGroup !== true) await made.attendance.newGroup(id, { id: BOB, name: 'Bob' });
+  if (options.signedUp !== false) {
+    await made.attendance.signUp(id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming, {
+      group: 'A',
+    });
+  }
+  const throttles = options.throttles ?? new Throttles();
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const web = webServerWith({ members, parties: partyWebWith(made, { acting, throttles }) });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const stampOf = (group: 'A' | 'B'): string => {
+    const found = made.current().groups.find((one) => one.id === group);
+    if (!found) throw new Error(`no group ${group}`);
+    return groupStamp(made.current(), found);
+  };
+  const regroup = async (body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: `/s/${FAKE_GUILD_ID}/api/parties/${id}/regroup`,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
+  };
+  const listed = async (userId = ALICE, name = 'Alice') => {
+    const cookie = await web.loggedIn(userId, name);
+    const answer = await web.app.inject({
+      url: `/s/${FAKE_GUILD_ID}/api/parties`,
+      headers: { cookie },
+    });
+    return answer.json<PartiesView>().raids[0]?.attendance;
+  };
+  return { made, id, web, acting, headers, stampOf, regroup, listed, throttles };
+}
+
+describe('Group… on the map (plan 8M-8B)', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("gives a member signed up Group…'s choices with the list: the other groups by letter and stamp, their size, the meeting time as a moment", async () => {
+    const map = await grouped();
+    web = map.web;
+    await map.made.attendance.setMeetingTime(map.id, { id: BOB, name: 'Bob' }, HATCH);
+    // A new group is a way on Discord, not on the map ("Start a new group on Discord"): the move
+    // to B is the one way here, said as the dialog says a single way.
+    expect((await map.listed())?.regroup).toEqual({
+      title: 'Change group',
+      text: "You're in group A. Submit moves you to group B.",
+      label: 'Move to',
+      signedUp: true,
+      choices: [
+        {
+          group: 'B',
+          stamp: map.stampOf('B'),
+          label: 'Group B',
+          size: '1 trainer',
+          meeting: HATCH,
+        },
+      ],
+      newGroup: true,
+    });
+    // Bob, in B: group A, which has no meeting time.
+    expect((await map.listed(BOB, 'Bob'))?.regroup).toMatchObject({
+      choices: [{ group: 'A', size: '2 trainers', meeting: null }],
+    });
+  });
+
+  it('offers no new group where Discord offers none: a member alone in a plain group of their own', async () => {
+    const map = await grouped();
+    web = map.web;
+    expect((await map.listed(BOB, 'Bob'))?.regroup).toMatchObject({
+      text: "You're in group B. Submit moves you to group A.",
+      newGroup: false,
+    });
+  });
+
+  // Review W-1: where a new group is the only way, the map has nothing to submit: Group… sends the
+  // member to the post on Discord.
+  it('sends Group… to Discord where a new group is the only way left', async () => {
+    const map = await grouped({ oneGroup: true });
+    web = map.web;
+    expect((await map.listed())?.regroup).toEqual({ onlyNewGroup: true });
+  });
+
+  it('refuses at the list what Group… refuses at the press: a member who has completed the raid', async () => {
+    const map = await grouped();
+    web = map.web;
+    await map.made.store.update(map.id, (party) => ({
+      party: {
+        ...party,
+        attendees: {
+          ...party.attendees,
+          [ALICE]: { number: 1, status: PartyStatus.Complete, group: 'A', remote: false },
+        },
+      },
+    }));
+    expect((await map.listed())?.regroup).toEqual({
+      refused: 'You are done with this raid. Use Join or Here if you are back.',
+    });
+  });
+
+  it("moves the member to the group picked as Group…'s Submit does: by its stamp, in the post's words", async () => {
+    const map = await grouped();
+    web = map.web;
+    const answer = await map.regroup({ group: 'B', stamp: map.stampOf('B'), signedUp: true });
+    expect(answer).toEqual({
+      status: 200,
+      json: { ok: true, text: 'You are coming, in group B.' },
+    });
+    expect(map.made.current().attendees[ALICE]).toMatchObject({ group: 'B', name: 'Alice' });
+  });
+
+  it('refuses a group that changed since the form was drawn, and a member who left meanwhile, in their words', async () => {
+    const map = await grouped();
+    web = map.web;
+    const stale = await map.regroup({ group: 'B', stamp: 'x0', signedUp: true });
+    expect(stale).toEqual({
+      status: 422,
+      json: { ok: false, text: 'Group B has changed since: press Group… again.' },
+    });
+    const stamp = map.stampOf('B');
+    await map.made.attendance.leave(map.id, { id: ALICE });
+    const left = await map.regroup({ group: 'B', stamp, signedUp: true });
+    expect(left.json).toEqual({
+      ok: false,
+      text: 'You are no longer signed up: press Group… again.',
+    });
+    expect(map.made.current().attendees[ALICE]).toBeUndefined();
+  });
+
+  it('signs a newcomer up as coming in the group picked, as "Join a group" does', async () => {
+    const map = await grouped({ signedUp: false });
+    web = map.web;
+    expect((await map.listed())?.regroup).toMatchObject({
+      title: 'Join a group',
+      text: 'You join as coming, in the group you pick.',
+      signedUp: false,
+      label: 'Join',
+      choices: [{ group: 'A' }, { group: 'B' }],
+      newGroup: true,
+    });
+    const answer = await map.regroup({ group: 'A', stamp: map.stampOf('A'), signedUp: false });
+    expect(answer.json).toEqual({ ok: true, text: 'You are coming, in group A.' });
+    expect(map.made.current().attendees[ALICE]).toMatchObject({
+      group: 'A',
+      status: PartyStatus.Coming,
+    });
+  });
+
+  it("counts one use in the window of the post's controls, none for a member refused before it", async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < ACTION_THROTTLE.uses - 1; n++) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const map = await grouped({ throttles });
+    web = map.web;
+    const body = { group: 'B', stamp: map.stampOf('B'), signedUp: true };
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.regroup(body)).status).toBe(403);
+    map.made.gateway.barred.delete(WEST_FORUM);
+    expect((await map.regroup({ group: 'B' })).status).toBe(400);
+    expect((await map.regroup(body)).status).toBe(200);
+    expect((await map.regroup(body)).status).toBe(429);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'regroup' }),
+    );
+  });
+
+  it('answers a party that has ended as Group…: "This has ended."', async () => {
+    const map = await grouped();
+    web = map.web;
+    const stamp = map.stampOf('B');
+    await map.made.service.end(map.id);
+    const answer = await map.regroup({ group: 'B', stamp, signedUp: true });
+    expect(answer).toEqual({ status: 409, json: { ok: false, text: 'This has ended.' } });
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 6dd48e130bf395aa5c9045479525257106a23f04..f85be9b73a725a1ee60f9ec81bfb8d5feedaa214 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -42,6 +42,7 @@ import { isRaidAction, PARTY_KIND } from '../render/party-controls.js';
 import { layoutThumbnails, type PostLayout } from '../render/party-post.js';
 import type { PlacePictures } from '../services/post-pictures.js';
 import { linkedPosts, postKey, postView, type PostViewOptions } from '../render/post-view.js';
+import { regroupOnTheMap } from '../render/group-dialogs.js';
 import { unplain } from '../render/text.js';
 import type {
   AttendanceOutcome,
@@ -123,6 +124,7 @@ export interface PartyWebDeps {
     | 'setRemote'
     | 'changeNumber'
     | 'answer'
+    | 'joinStamped'
     | 'limits'
     | 'lobbyOf'
   >;
@@ -332,6 +334,18 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
     ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
     pictureOrigins: deps.pictureOrigins,
+    // Group… as the post's dialog decides and words it (plan 8M-8B).
+    regroup: (party) =>
+      regroupOnTheMap(
+        {
+          party,
+          memberId,
+          lobbySize: parties.attendance.lobbyOf(party),
+          zone: parties.zone,
+          now: deps.now(),
+        },
+        parties.attendance.limits(),
+      ),
     postKey: (party) => {
       const layout = parties.layoutOf(party.id);
       return layout === undefined ? undefined : postKey(layout);
diff --git a/src/web/post-control-routes.ts b/src/web/post-control-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ac17d72483fa75e0b49e58e7f4b5ab94f24dd01d
--- /dev/null
+++ b/src/web/post-control-routes.ts
@@ -0,0 +1,155 @@
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
+import { z } from 'zod';
+import { movedWords } from '../commands/parties/group-dialogs.js';
+import { ACTION_THROTTLE, partyOver } from '../commands/parties/reply.js';
+import type { MemberStanding } from '../discord/member-directory.js';
+import { isGroupId, type Party } from '../domain/party/party.js';
+import type { PressAnswer } from '../domain/web/party-data.js';
+import { PARTY_KIND } from '../render/party-controls.js';
+import { unplain } from '../render/text.js';
+import type { AttendanceOutcome, Member } from '../services/attendance-service.js';
+import {
+  actingOnTheMap,
+  countedOnTheMap,
+  throttledOnTheMap,
+  unreachableOnTheMap,
+} from './acting.js';
+import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+
+/*
+ * The post's controls that open a dialog on Discord, as forms of the live map (plan 8M-8B):
+ * Group… (`POST …/parties/<id>/regroup`). Each over the code path of its dialog's Submit, with
+ * the checks of every write of `web.md` in their order: the per-address limit and `postGuard`
+ * before the body is read; the session and the body; who writes (`actingOnTheMap`); the party as
+ * the store has it (an active party of this server, else 409 in the button's words); how they
+ * stand to its forum (barred 403, unreachable 503); only then the window its dialog counts in.
+ */
+
+/** Group…'s moves one address may send in a minute, whoever sends them. */
+export const GROUP_WRITES_PER_ADDRESS_MINUTE = 30;
+
+/** The status of each outcome of the attendance service, as a press answers it. */
+const OUTCOME_STATUS: Readonly<Record<AttendanceOutcome['kind'], number>> = {
+  ok: 200,
+  refused: 422,
+  gone: 409,
+};
+
+/**
+ * The body of Group…'s move: the group by its letter and stamp as the list gave it, and whether
+ * the form was drawn for a member signed up (`MapRegroup.signedUp`: one who left since is
+ * refused, not signed up again).
+ */
+const regroupBodySchema = z
+  .object({
+    group: z.string().regex(/^[A-E]$/u),
+    stamp: z.string().min(1).max(40),
+    signedUp: z.boolean(),
+  })
+  .strict();
+
+/** A control's address: `/api/parties/<party id>/<control>`. */
+type ControlRequest = FastifyRequest<{ Params: { guild: string; party: string } }>;
+
+/** Who writes, as Discord has them now, and the party they write to, as the store has it. */
+type Target =
+  { member: Member; standing: MemberStanding; party: Party; row: number } | { sent: FastifyReply };
+
+export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { parties, sessions } = deps;
+
+  /**
+   * Who writes and to which party, by the checks of every write (spec 2.5): a member who may act
+   * (`actingOnTheMap`), an active party of this server in the store (else 409 "This has ended.":
+   * an ended party is not there, nor read from anywhere), a forum they are not kept out of
+   * (barred 403; Discord unreachable 503). Nothing of it counts against a throttle.
+   */
+  const target = async (
+    request: ControlRequest,
+    reply: FastifyReply,
+    userId: string,
+    doing: string,
+  ): Promise<Target> => {
+    const { guild, party: partyId } = request.params;
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting;
+    const row = await parties.guilds.idFor(guild);
+    const party = parties.store.get(partyId);
+    if (row === undefined || party?.guildId !== row || party.status !== 'active') {
+      const gone: PressAnswer = { ok: false, text: partyOver() };
+      return { sent: reply.code(409).send(gone) };
+    }
+    try {
+      const access =
+        party.forumChannelId === null
+          ? undefined
+          : await parties.forums.memberAccess(party.forumChannelId, userId);
+      if (access === 'barred') return { sent: sendFailure(request, reply, 403) };
+    } catch (err) {
+      return { sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing) };
+    }
+    return { ...acting, party, row };
+  };
+
+  /** Logged as a press of the post is: who, where, which party, what; never a text. */
+  const noted = (request: ControlRequest, userId: string, action: string, outcome: string) => {
+    deps.log.info(
+      { user: userId, guild: request.params.guild, party: request.params.party, action, outcome },
+      'a party was pressed on the map',
+    );
+  };
+
+  // Group… (plan 8M-8B): a move to the group picked, by its letter and stamp, as the dialog's
+  // Submit moves (`joinStamped`, `movedWords`): one use in the window of the post's controls
+  // (`ACTION_THROTTLE`), counted at the move only (the map's form opens from the list, which
+  // carries its choices). A new group stays on Discord.
+  const groupLimiter = new RateLimiter({ uses: GROUP_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  scope.post(
+    '/api/parties/:party/regroup',
+    {
+      onRequest: [
+        limitedPerAddress(groupLimiter, { now: deps.now }),
+        postGuard(sessions, deps.settings.publicUrl),
+      ],
+    },
+    async (request: ControlRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = regroupBodySchema.safeParse(request.body ?? {});
+      if (!body.success || !isGroupId(body.data.group)) return sendFailure(request, reply, 400);
+      const { group, stamp, signedUp } = body.data;
+      const { userId } = session;
+      const found = await target(request, reply, userId, 'moved to another group');
+      if ('sent' in found) return found.sent;
+      const counted = { control: PARTY_KIND };
+      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
+      if (throttled) return throttled;
+      const { kind, said } = await countedOnTheMap(
+        deps,
+        counted,
+        userId,
+        ACTION_THROTTLE,
+        async () => {
+          const outcome = await parties.attendance.joinStamped(
+            found.party.id,
+            found.member,
+            group,
+            stamp,
+            { signedUp },
+          );
+          return {
+            kind: outcome.kind,
+            said: movedWords(parties.attendance.limits(), found.party, group, outcome),
+          };
+        },
+      );
+      noted(request, userId, 'regroup', kind);
+      const answer: PressAnswer = { ok: said.ok, text: unplain(said.text) };
+      return reply.code(OUTCOME_STATUS[kind]).send(answer);
+    },
+  );
+}
diff --git a/test/support/web.ts b/test/support/web.ts
index f295157af7d46c02fe17920ecdd15587b7e184f4..2042e4501488e07ff6adfb6459598f0399bfc0d0 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -248,6 +248,7 @@ const NO_PARTIES: PartyWebDeps = {
     setRemote: noAttendance,
     changeNumber: noAttendance,
     answer: noAttendance,
+    joinStamped: noAttendance,
     limits: () => {
       throw new Error('no parties in this test: give partyWebWith');
     },
````

### Task 4: 8M-8B task 4: Meet... on the map

Prototype commit: `731b3b095648ceb428e50f1da6dc268827e9bb1b`

Meet... of a raid's and a max battle's post is a form of the map (X4): a
pick list of meetTimes plus "No meeting time", sent as epoch times with
the group's letter and stamp to setMeetingTime, the times named in the
reader's zone (no zone hint: nothing is typed).

Moved out of the Discord handler (meet-dialog.ts): meetRefusalOf (was
refusalOf, now taking the limits rather than the context) and
meetSubmitRefusal (was meetRefusal, now taking how Meet... is named: its
icon on Discord, "Meet..." in words on the map). meetChoices (render's
meet-dialog.ts) gives what the dialog offers and starts with, which the
dialog and meetOnTheMap share; the times' words are the import-free
render/meet-words.ts (meetTimeLabel, the title, text and labels).

GET .../parties/<id>/meet: members, the party and its forum, refused
while /meet's window is full (counting nothing, as the post's checks) and
as the press is (meetRefusalOf, 422 in its words); else MapMeet. POST
.../meet { group, stamp, time | null }: the checks of every write, one
use in /meet's window (MEET_WINDOW: one budget with /meet and the dialog),
meetRefusalOf again, setMeetingTime with the group drawn, /meet's words
through pageWords. One per-address limiter for both. Every kind is
served (max battles' drawing waits for 8M-9).

The post's Meet... maps to the panel 'meet' (CONTROLS changed: every
post's key changes by itself); the page asks the server when it opens,
says a refusal under the post's buttons, and draws the menu in Discord's
dialog look.

**Files:**

```
 src/commands/parties/meet-dialog.ts |  38 +++++++++++++++++++++--------------
 src/domain/web/party-data.ts        |  21 ++++++++++++++++++-
 src/render/meet-dialog.ts           |  71 +++++++++++++++++++++++++++++++++++++++++++++++++++-------------
 src/render/meet-words.ts            |  32 +++++++++++++++++++++++++++++
 src/render/post-view.test.ts        |  12 +++++++++++
 src/render/post-view.ts             |   2 +-
 src/web/client/party-layer.ts       |   4 ++++
 src/web/client/post-draw.test.ts    |  31 ++++++++++++++++++++++++++++
 src/web/client/post-draw.ts         |   6 +++++-
 src/web/client/post-forms-ui.ts     | 108 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------------------
 src/web/client/post-forms.test.ts   |  50 ++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/post-forms.ts        |  55 +++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/raid-ui.ts           |   2 +-
 src/web/party-meet.test.ts          | 173 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts             |   1 +
 src/web/post-control-routes.ts      | 153 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 test/support/web.ts                 |   1 +
 17 files changed, 700 insertions(+), 60 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/post-view.test.ts src/web/client/post-draw.test.ts src/web/client/post-forms.test.ts src/web/party-meet.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 731b3b095648ceb428e50f1da6dc268827e9bb1b -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8B task 4: Meet... on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/meet-dialog.ts b/src/commands/parties/meet-dialog.ts
index 602059e44a194c521eeabb8021651696b1cf7ce6..908f1809f263ade23623cd9a232286597776e3de 100644
--- a/src/commands/parties/meet-dialog.ts
+++ b/src/commands/parties/meet-dialog.ts
@@ -5,6 +5,7 @@ import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { requireGuild } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
+import type { AttendanceLimits } from '../../domain/party/attendance.js';
 import { meetTimes } from '../../domain/party/meet-times.js';
 import { maxEnded } from '../../domain/party/max.js';
 import {
@@ -51,10 +52,11 @@ export const NO_TIME_LEFT_MAX = 'There is no time left to meet before this max b
 /**
  * Why this member may not set a meeting time of this party now (the rules of `/meet`), or the
  * raid: a party that ended (as a raid's), one that is no raid, a member not signed up, a raid
- * without times or that is over, one with no time to meet left.
+ * without times or that is over, one with no time to meet left. Meet…'s press and Submit on
+ * Discord and its form on the map (plan 8M-8B) decide by it.
  */
-function refusalOf(
-  ctx: AppContext,
+export function meetRefusalOf(
+  limits: AttendanceLimits,
   party: Party | undefined,
   memberId: string,
   now: number,
@@ -64,7 +66,7 @@ function refusalOf(
   // A raid's, and a max battle's (plan 8X-3; design Q10): every battle has Meet….
   if (!isBattle(party)) return STALE_COMPONENT;
   if (!attendeeOf(party, memberId)) {
-    return problemText('not-attending', ctx.attendance.limits(), partyWord(party));
+    return problemText('not-attending', limits, partyWord(party));
   }
   if (!isRaid(party)) {
     if (maxEnded(party, now)) return partyOver(party);
@@ -86,7 +88,12 @@ export async function openMeet(
   partyId: string,
 ): Promise<void> {
   const now = Date.now();
-  const party = refusalOf(ctx, ctx.parties.get(partyId), interaction.user.id, now);
+  const party = meetRefusalOf(
+    ctx.attendance.limits(),
+    ctx.parties.get(partyId),
+    interaction.user.id,
+    now,
+  );
   if (typeof party === 'string') throw new UserError(party);
   const groupId = attendeeOf(party, interaction.user.id)?.group ?? party.defaultGroupId;
   await interaction.showModal(
@@ -104,14 +111,14 @@ function chosenTime(interaction: ModalSubmitInteraction): number | null | undefi
 }
 
 /**
- * What a Submit of Meet…'s dialog is told for a refusal decided inside the store; Meet… is named
- * by its icon (`meetIcon`: the application's, else the plain one), as the post's hints name it.
+ * What a Submit of Meet…'s dialog, or the map's form (plan 8M-8B), is told for a refusal decided
+ * inside the store; `meet` names Meet… as the member sees it (on Discord by its icon, `meetIcon`,
+ * as the post's hints name it; on the map in words).
  */
-function meetRefusal(ctx: AppContext, reason: string): string | undefined {
+export function meetSubmitRefusal(reason: string, meet: string): string | undefined {
   if (reason === 'group-changed') return 'Your group changed meanwhile: try again.';
   if (reason !== 'meeting-time-gone') return undefined;
-  const icon = meetIcon({ controlIcon: (name) => ctx.emoji.find(name, null) });
-  return `That time is no longer offered: press ${icon} again.`;
+  return `That time is no longer offered: press ${meet} again.`;
 }
 
 /**
@@ -134,18 +141,19 @@ async function submitMeet(
   await deferSubmit(interaction);
   const now = Date.now();
   const member = actingMember(interaction);
-  const party = refusalOf(ctx, ctx.parties.get(partyId), member.id, now);
+  const limits = ctx.attendance.limits();
+  const party = meetRefusalOf(limits, ctx.parties.get(partyId), member.id, now);
   const say = (content: string) => interaction.editReply({ content });
   if (typeof party === 'string') return void (await say(party));
   const outcome = await ctx.attendance.setMeetingTime(partyId, member, time, {
     group: groupId,
     stamp,
   });
-  const refusal = outcome.kind === 'refused' ? meetRefusal(ctx, outcome.reason) : undefined;
+  // Meet… by its icon (the application's, else the plain one), as the post's hints name it.
+  const icon = meetIcon({ controlIcon: (name) => ctx.emoji.find(name, null) });
+  const refusal = outcome.kind === 'refused' ? meetSubmitRefusal(outcome.reason, icon) : undefined;
   await say(
-    refusal ??
-      outcomeWords(ctx.attendance.limits(), party, outcome, (ok) => meetingWords(ok, member.id))
-        .text,
+    refusal ?? outcomeWords(limits, party, outcome, (ok) => meetingWords(ok, member.id)).text,
   );
 }
 
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index c36727eb7b80ba06d4b5db2cf19e8348672cc0ea..541ec3a8026ce915ad8e76a18a911476aacc6d7f 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -121,6 +121,25 @@ export type MapRegroup =
       newGroup: boolean;
     };
 
+/**
+ * Meet… on the map (plan 8M-8B, `GET …/parties/<id>/meet`), as the post's dialog offers it now:
+ * its title, text and the choice's label; the member's group by its letter and stamp (sent back,
+ * so that a move meanwhile is refused); the times as moments in time order, the in-game RSVP ones
+ * (`rsvp`) and the hatch among them, which the page names in the reader's zone; the group's
+ * meeting time now (`set`: "No meeting time" is offered while it has one), and the time chosen to
+ * start with.
+ */
+export interface MapMeet {
+  title: string;
+  text: string;
+  label: string;
+  group: string;
+  stamp: string;
+  times: Array<{ at: number; rsvp: boolean; hatch?: true }>;
+  set: number | null;
+  picked: number | null;
+}
+
 /**
  * A group Group… offers (`MapRegroup`): its letter and stamp (what a move sends back, refused once
  * the group went or was opened again), its label (`Group B: by the bridge`), how many are in it as
@@ -468,7 +487,7 @@ export const POST_ACCENTS = ['egg', 'hatched', 'ended', 'max', 'timed', 'other']
 export type PostAccent = (typeof POST_ACCENTS)[number];
 
 /** The panels of the map a post's button opens (`PostControl`). */
-export type PostPanel = 'group' | 'time' | 'moves' | 'manage' | 'route';
+export type PostPanel = 'group' | 'time' | 'meet' | 'moves' | 'manage' | 'route';
 
 /**
  * What a button of a post does on the map (plan 8M-8A), decided on the server from its custom id
diff --git a/src/render/meet-dialog.ts b/src/render/meet-dialog.ts
index 79c401e8c85f6d9c1a1bd6068488278d5313784c..c86ee80e3ed7d44b74f95e64f395653012cf38c8 100644
--- a/src/render/meet-dialog.ts
+++ b/src/render/meet-dialog.ts
@@ -3,6 +3,15 @@ import { encodeCustomId } from '../discord/custom-id.js';
 import { dialog, openToken, type DialogOption } from '../discord/dialog.js';
 import { meetTimes, type MeetTime } from '../domain/party/meet-times.js';
 import { groupOf, groupStamp, type BattleParty, type GroupId } from '../domain/party/party.js';
+import type { MapMeet } from '../domain/web/party-data.js';
+import {
+  MEET_LABEL,
+  MEET_TEXT,
+  MEET_TIME_NOW,
+  meetTimeLabel,
+  meetTitle,
+  NO_MEETING_TIME,
+} from './meet-words.js';
 import { clockText } from './text.js';
 
 /*
@@ -38,9 +47,47 @@ export interface MeetDialogView {
 
 /** A time as its choice names it: `At hatch (7:22 PM) · in-game RSVP`, `7:37 PM · in-game RSVP`. */
 function timeLabel(time: MeetTime, zone: string): string {
-  const clock = clockText(time.at, zone);
-  if (time.hatch) return `At hatch (${clock}) · in-game RSVP`;
-  return time.rsvp ? `${clock} · in-game RSVP` : clock;
+  return meetTimeLabel(time, clockText(time.at, zone));
+}
+
+/**
+ * What Meet… offers the member's group now (shared with the map, plan 8M-8B): the group by its
+ * letter and stamp, its meeting time (`set`), the times of `meetTimes` in time order (the group's
+ * own among them), and the one chosen to start with: the group's time, else the next in-game RSVP
+ * time (the hatch on an egg: the most common meeting time), else the first.
+ */
+export function meetChoices(view: MeetDialogView): {
+  group: GroupId;
+  stamp: string;
+  set: number | undefined;
+  times: MeetTime[];
+  start: MeetTime | undefined;
+} {
+  const { party, groupId, now } = view;
+  const group = groupOf(party, groupId);
+  const set = group?.startTime;
+  const times = meetTimes(party, now, set);
+  const start =
+    times.find((time) => time.at === set) ?? times.find((time) => time.rsvp) ?? times[0];
+  return { group: groupId, stamp: group ? groupStamp(party, group) : '0', set, times, start };
+}
+
+/**
+ * Meet… on the map (plan 8M-8B): what `meetChoices` offers, with the dialog's words; the times as
+ * moments, which the page names in the reader's zone (`meetTimeLabel`).
+ */
+export function meetOnTheMap(view: MeetDialogView): MapMeet {
+  const { group, stamp, set, times, start } = meetChoices(view);
+  return {
+    title: meetTitle(group, view.party.groups.length),
+    text: MEET_TEXT,
+    label: MEET_LABEL,
+    group,
+    stamp,
+    times: times.map(({ at, rsvp, hatch }) => ({ at, rsvp, ...(hatch ? { hatch } : {}) })),
+    set: set ?? null,
+    picked: start?.at ?? null,
+  };
 }
 
 /**
@@ -55,31 +102,27 @@ function timeLabel(time: MeetTime, zone: string): string {
  */
 export function meetDialog(view: MeetDialogView): APIModalInteractionResponseCallbackData {
   const { party, groupId, zone, now } = view;
-  const group = groupOf(party, groupId);
-  const set = group?.startTime;
-  const times = meetTimes(party, now, set);
+  const { stamp, set, times, start } = meetChoices(view);
   const options: DialogOption[] = [
     ...times.map((time) => ({
       value: String(time.at),
       label: timeLabel(time, zone),
-      ...(time.at === set ? { description: "Your group's meeting time now" } : {}),
+      ...(time.at === set ? { description: MEET_TIME_NOW } : {}),
     })),
-    ...(set === undefined ? [] : [{ value: NO_MEETING, label: 'No meeting time' }]),
+    ...(set === undefined ? [] : [{ value: NO_MEETING, label: NO_MEETING_TIME }]),
   ];
-  const start =
-    times.find((time) => time.at === set) ?? times.find((time) => time.rsvp) ?? times[0];
   return dialog({
     customId: encodeCustomId({
       kind: MEET_KIND,
       id: party.id,
       action: MEET_FORM,
-      args: [groupId, group ? groupStamp(party, group) : '0', openToken(now)],
+      args: [groupId, stamp, openToken(now)],
     }),
-    title: party.groups.length > 1 ? `Meeting time for group ${groupId}` : 'Meeting time',
-    text: 'For your group: everybody in it is told.',
+    title: meetTitle(groupId, party.groups.length),
+    text: MEET_TEXT,
     choice: {
       id: MEET_INPUT,
-      label: 'When does your group meet?',
+      label: MEET_LABEL,
       menu: true,
       options,
       ...(start === undefined ? {} : { picked: String(start.at) }),
diff --git a/src/render/meet-words.ts b/src/render/meet-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8f67a7292788023428fb3ca710e07df65f06c2ae
--- /dev/null
+++ b/src/render/meet-words.ts
@@ -0,0 +1,32 @@
+/*
+ * The words of Meet…'s times (plan 8X-1B, decisions 5 and 8) on Discord and on the map (plan
+ * 8M-8B), without an import, so that the map's page takes it whole: one wording for both, the
+ * clock time the caller's (the server's zone in the dialog, the reader's on the map).
+ */
+
+/** A time Meet… offers, as its choice names it: an in-game RSVP time, the hatch among them. */
+export interface MeetTimeWords {
+  rsvp: boolean;
+  hatch?: true;
+}
+
+/** `At hatch (7:22 PM) · in-game RSVP`, `7:37 PM · in-game RSVP`, `7:40 PM`. */
+export function meetTimeLabel(time: MeetTimeWords, clock: string): string {
+  if (time.hatch) return `At hatch (${clock}) · in-game RSVP`;
+  return time.rsvp ? `${clock} · in-game RSVP` : clock;
+}
+
+/** The line under the group's own meeting time among the choices. */
+export const MEET_TIME_NOW = "Your group's meeting time now";
+
+/** The choice that removes the group's meeting time, while it has one. */
+export const NO_MEETING_TIME = 'No meeting time';
+
+/** Meet…'s title: `Meeting time for group B`, `Meeting time` with one group. */
+export function meetTitle(groupId: string, groups: number): string {
+  return groups > 1 ? `Meeting time for group ${groupId}` : 'Meeting time';
+}
+
+/** What Meet… says above its choice, and the choice's label. */
+export const MEET_TEXT = 'For your group: everybody in it is told.';
+export const MEET_LABEL = 'When does your group meet?';
diff --git a/src/render/post-view.test.ts b/src/render/post-view.test.ts
index 962d871cb78bbf3d04b9debce6c833d8cf3c1fac..a6434ed01865c96ad8d8988bbaddbeaa0e20f903 100644
--- a/src/render/post-view.test.ts
+++ b/src/render/post-view.test.ts
@@ -150,6 +150,18 @@ describe('postView: the controls', () => {
     expect(JSON.stringify(shown)).not.toContain(`party:${raid.id}`);
   });
 
+  // Plan 8M-8B: Meet… is the map's form.
+  it('opens the map’s Meet… from the post’s Meet…', () => {
+    const raid = { ...testRaid(), hatchTime: 1, endTime: 2 };
+    const [, counts] = rows(
+      view({
+        accent: STAGE_COLOURS.egg,
+        blocks: [{ type: 'controls', rows: bottomControls(raid, { emoji: {} }) }],
+      }),
+    );
+    expect(counts?.[0]).toMatchObject({ name: 'Meet…', does: { kind: 'panel', panel: 'meet' } });
+  });
+
   it('shows a custom emoji Pine serves no picture of as the button’s plain one', () => {
     const icons = {
       controlIcon: (name: string) =>
diff --git a/src/render/post-view.ts b/src/render/post-view.ts
index 7f81f03f92e33cb6ab2b61b489c394e2952a9cb6..28773753f1c0e04927d09813addb40511a39e616 100644
--- a/src/render/post-view.ts
+++ b/src/render/post-view.ts
@@ -113,7 +113,7 @@ export const CONTROLS: Partial<Readonly<Record<PartyAction, PostControl>>> = {
   route: { kind: 'panel', panel: 'route' },
   less: { kind: 'press', action: 'less' },
   more: { kind: 'press', action: 'more' },
-  meet: { kind: 'discord' },
+  meet: { kind: 'panel', panel: 'meet' },
   split: { kind: 'discord' },
   shot: { kind: 'screenshot' },
 };
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 236f6e0bec268e74838104036d9de6d385edc3ae..02daa233bb497fa767662cba1be09f049bd61c5f 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -647,6 +647,10 @@ export function showParties(
         // Group… (plan 8M-8B): its form in the place of the post.
         const party = partyById(target.dataset.regroup);
         if (party) postForms.regroupClicked(target, party);
+      } else if (target.dataset.meet !== undefined) {
+        // Meet… (plan 8M-8B): its form, from what the server offers now.
+        const party = partyById(target.dataset.meet);
+        if (party) postForms.meetClicked(target, party);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       } else postButton(target);
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index f416a845d611b85423226d54b85d9f16b0e6b9d4..59a1b292eb2a09bb79e0659b67ed3de6bf8afadb 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -382,6 +382,37 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
     expect(link?.attributes).not.toHaveProperty('hidden');
   });
 
+  // Plan 8M-8B: Meet… opens the map's form (which asks the server what it offers), off while
+  // nothing may be pressed.
+  it('opens Meet… as the map’s form, off while the map is read-only', () => {
+    const view: PostView = {
+      key: 'k',
+      accent: 'hatched',
+      blocks: [
+        {
+          type: 'controls',
+          rows: [
+            [
+              button({
+                name: 'Meet…',
+                emoji: { name: '⏰' },
+                does: { kind: 'panel', panel: 'meet' },
+              }),
+            ],
+          ],
+        },
+      ],
+    };
+    const [on] = buttonsOf(postCard(view, raid(), context));
+    expect(on?.attributes).toMatchObject({ 'data-meet': 'r1', 'aria-label': 'Meet…' });
+    expect(on?.attributes).not.toHaveProperty('disabled');
+    const [off] = buttonsOf(
+      postCard(view, raid({ attendance: attendance({ count: false }) }), context),
+    );
+    expect(off?.attributes).toMatchObject({ disabled: '' });
+    expect(off?.attributes).not.toHaveProperty('data-meet');
+  });
+
   // Plan 8M-8B: +1 and −1 are presses of the map, off while it is read-only (`count`).
   it('presses +1 and −1 as the map’s presses, off while nothing may be pressed', () => {
     const view: PostView = {
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index b0b2e9eb46b35258a6961747acf502a261bb9e49..934036843cb2da1c2abde8965d4767a084c16e8c 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -165,9 +165,13 @@ function pressable(party: MapParty, action: string): boolean {
  */
 function panelAttributes(
   party: MapParty,
-  panel: 'group' | 'time' | 'moves' | 'manage' | 'route',
+  panel: 'group' | 'time' | 'meet' | 'moves' | 'manage' | 'route',
 ): Record<string, string> | 'off' | undefined {
   switch (panel) {
+    case 'meet':
+      // Meet…'s form (plan 8M-8B), which asks the server what it offers and refuses as the press
+      // does; nothing while read-only (`count`, as everything that may be pressed).
+      return party.attendance.count ? { 'data-meet': party.id } : 'off';
     case 'group': {
       const { pick, regroup } = party.attendance;
       // A newcomer to several groups picks in the member's part (plan 8X-1B); else Group…'s form
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index 990ebf0664166d0c95f2e4b62f17e35c10d916f5..d90b1a748e6bc4e7a34244ba239e8487df221a10 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -1,10 +1,12 @@
-import type { MapParty } from '../../domain/web/party-data.js';
-import { getJson } from './common.js';
+import type { MapMeet, MapParty } from '../../domain/web/party-data.js';
+import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
 import {
   focusBack,
   formStep,
+  meetBody,
+  meetForm,
   regroupBody,
   regroupForm,
   sendPostForm,
@@ -27,7 +29,7 @@ export interface PostFormsDeps {
   guild: string;
   /** The page's CSRF token, which a stale one's renewal changes. */
   csrf: { get(): string; set(token: string): void };
-  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release' | 'fit'>;
+  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'ready' | 'release' | 'fit'>;
   /** Where the page is now: Pine's origin, the reader's times. */
   origin(): string;
   times(): FormTimes;
@@ -39,24 +41,48 @@ export function postFormsUi(deps: PostFormsDeps) {
   const { guild, hold } = deps;
 
   /**
-   * Opens `form` in the place of the post of the button pressed: only while no other form is open.
-   * `bodyOf` makes what Submit sends from the form's fields (or what is missing), to `control`.
+   * Says why a form does not open under the post's buttons (the line that also names Discord),
+   * in the place of the post's link, and in the notice.
    */
-  const open = (
+  const refusedUnder = (section: HTMLElement, text: string): void => {
+    const line = section.querySelector<HTMLElement>('.post .on-discord');
+    if (line) {
+      line.hidden = false;
+      const why = line.querySelector<HTMLElement>('.why');
+      if (why) why.textContent = text;
+      const link = line.querySelector<HTMLElement>('.to-post');
+      if (link) link.hidden = true;
+    }
+    say(text);
+  };
+
+  /**
+   * Opens a form in the place of the post of the button pressed, only while no other form is
+   * open: the hold is taken at once, then `load` says what to draw (a form that asks the server
+   * first waits for it) or why it does not open; drawn only while its claim holds and its place is
+   * still in the page. `bodyOf` makes what Submit sends from the form's fields (or what is
+   * missing), to `control`.
+   */
+  const open = async (
     button: HTMLButtonElement,
-    form: PageNode,
     control: string,
     partyId: string,
-    bodyOf: (fields: Record<string, string>) => PostFormBody,
-    /** A refusal closes the form and the list is asked for again (`formStep`, review W-2). */
-    refusalCloses = false,
-  ): void => {
+    load: () => Promise<Opened | { refused: string }>,
+  ): Promise<void> => {
     const section = button.closest<HTMLElement>('.post-popup');
     if (!section) return;
     const place = formPlace(section);
     // Outside a popup or the card (a line of the list), its claim goes with its form.
     const claim = hold.take(place, false, place === false ? () => section.isConnected : undefined);
     if (!claim) return;
+    const loaded = await load();
+    if ('refused' in loaded) {
+      hold.release(claim);
+      refusedUnder(section, loaded.refused);
+      return;
+    }
+    if (!hold.ready(claim, section.isConnected)) return;
+    const { form, bodyOf } = loaded;
     const before = [...section.childNodes];
     const element = renderNode(form, document);
     const close = () => {
@@ -101,7 +127,7 @@ export function postFormsUi(deps: PostFormsDeps) {
       sayUnder(element, sent.text);
       // A refusal keeps the form, unless its choices may be stale (review W-2: Group…'s came with
       // the list, which is asked for again).
-      if (formStep(sent, { refusalCloses }) === 'stay') {
+      if (formStep(sent, { refusalCloses: loaded.refusalCloses === true }) === 'stay') {
         target.focus();
         return;
       }
@@ -126,26 +152,68 @@ export function postFormsUi(deps: PostFormsDeps) {
     section.replaceChildren(element);
     hold.fit();
     (
-      element.querySelector<HTMLElement>('input[type="radio"]:checked') ??
+      element.querySelector<HTMLElement>('input[type="radio"]:checked, select, textarea') ??
       element.querySelector<HTMLElement>('button[data-submit]')
     )?.focus();
   };
 
+  /**
+   * What a form asks the server before it opens (`GET …/parties/<id>/<control>`): the answer, or
+   * why it does not open (its refusal, the window full, a party over), as the page says it.
+   */
+  const asked = async <T>(partyId: string, control: string): Promise<T | { refused: string }> => {
+    try {
+      const reply = await fetch(
+        `/s/${guild}/api/parties/${encodeURIComponent(partyId)}/${control}`,
+        { credentials: 'same-origin' },
+      );
+      const body = (await reply.json().catch(() => undefined)) as unknown;
+      if (reply.ok) return body as T;
+      const { error, text } = (body ?? {}) as { error?: unknown; text?: unknown };
+      const said = typeof error === 'string' ? error : typeof text === 'string' ? text : undefined;
+      return { refused: said ?? NOT_OPENED };
+    } catch {
+      return { refused: NOT_OPENED };
+    }
+  };
+
   return {
     /** Group…: its form, from the choices the list carries (`MapAttendance.regroup`). */
     regroupClicked(button: HTMLButtonElement, party: MapParty): void {
       const { regroup } = party.attendance;
       if (regroup === undefined || !('choices' in regroup)) return;
-      open(
-        button,
-        regroupForm(party, regroup, deps.times(), deps.origin(), guild),
-        'regroup',
-        party.id,
-        (fields) => regroupBody(regroup, fields.way),
-        true,
+      void open(button, 'regroup', party.id, () =>
+        Promise.resolve({
+          form: regroupForm(party, regroup, deps.times(), deps.origin(), guild),
+          bodyOf: (fields) => regroupBody(regroup, fields.way),
+          refusalCloses: true as const,
+        }),
       );
     },
+
+    /** Meet…: its form, from what the server offers now (`GET …/meet`), or why not. */
+    meetClicked(button: HTMLButtonElement, party: MapParty): void {
+      void open(button, 'meet', party.id, async () => {
+        const meet = await asked<MapMeet>(party.id, 'meet');
+        if ('refused' in meet) return meet;
+        return {
+          form: meetForm(party, meet, deps.times()),
+          bodyOf: (fields) => meetBody(meet, fields.time),
+        };
+      });
+    },
   };
 }
 
+/** A form ready to draw, and what its Submit sends. */
+interface Opened {
+  form: PageNode;
+  bodyOf: (fields: Record<string, string>) => PostFormBody;
+  /** A refusal closes the form and the list is asked for again (`formStep`, review W-2). */
+  refusalCloses?: true;
+}
+
+/** What the page says when a form could not ask the server what it offers. */
+const NOT_OPENED = 'That did not get through; try again.';
+
 export type PostFormsUi = ReturnType<typeof postFormsUi>;
diff --git a/src/web/client/post-forms.test.ts b/src/web/client/post-forms.test.ts
index 7d074980e48e9f8ed6bb1497309ee4715840d5ae..0c927c9fd2d60b037703b57ed7ff26b6cd003cf0 100644
--- a/src/web/client/post-forms.test.ts
+++ b/src/web/client/post-forms.test.ts
@@ -1,9 +1,11 @@
 import { describe, expect, it } from 'vitest';
-import type { MapAttendance, MapRaid, MapRegroup } from '../../domain/web/party-data.js';
+import type { MapAttendance, MapMeet, MapRaid, MapRegroup } from '../../domain/web/party-data.js';
 import type { PageNode } from './popup.js';
 import {
   focusBack,
   formStep,
+  meetBody,
+  meetForm,
   regroupBody,
   regroupForm,
   sendPostForm,
@@ -129,6 +131,52 @@ describe('Group… on the map (plan 8M-8B)', () => {
   });
 });
 
+describe('Meet… on the map (plan 8M-8B)', () => {
+  const meet = (more: Partial<MapMeet> = {}): MapMeet => ({
+    title: 'Meeting time for group B',
+    text: 'For your group: everybody in it is told.',
+    label: 'When does your group meet?',
+    group: 'B',
+    stamp: 'b1',
+    times: [
+      { at: NOW + 10 * MINUTE, rsvp: true, hatch: true },
+      { at: NOW + 15 * MINUTE, rsvp: false },
+      { at: NOW + 25 * MINUTE, rsvp: true },
+    ],
+    set: NOW + 15 * MINUTE,
+    picked: NOW + 15 * MINUTE,
+    ...more,
+  });
+
+  it('offers the times as the dialog’s menu in the reader’s zone, the group’s own said, "No meeting time" last', () => {
+    const form = meetForm(raid, meet(), times);
+    expect(form.attributes).toMatchObject({ 'data-form': 'meet', 'data-party': 'r1' });
+    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Meeting time for group B');
+    const options = all(form).filter((one) => one.tag === 'option');
+    expect(options.map((one) => [one.attributes?.value, one.text])).toEqual([
+      [String(NOW + 10 * MINUTE), 'At hatch (11:10 AM) · in-game RSVP'],
+      [String(NOW + 15 * MINUTE), "11:15 AM · Your group's meeting time now"],
+      [String(NOW + 25 * MINUTE), '11:25 AM · in-game RSVP'],
+      ['none', 'No meeting time'],
+    ]);
+    expect(options[1]?.attributes).toHaveProperty('selected');
+    expect(all(form).find((one) => one.className === 'form-label')?.text).toBe(
+      'When does your group meet?',
+    );
+    // No "No meeting time" for a group without one.
+    const unset = meetForm(raid, meet({ set: null, picked: NOW + 10 * MINUTE }), times);
+    expect(all(unset).filter((one) => one.tag === 'option')).toHaveLength(3);
+  });
+
+  it('sends the group drawn and the time chosen, null for "No meeting time"', () => {
+    expect(meetBody(meet(), String(NOW + 25 * MINUTE))).toEqual({
+      body: { group: 'B', stamp: 'b1', time: NOW + 25 * MINUTE },
+    });
+    expect(meetBody(meet(), 'none')).toEqual({ body: { group: 'B', stamp: 'b1', time: null } });
+    expect(meetBody(meet(), '')).toEqual({ text: 'Pick a time first.' });
+  });
+});
+
 describe('what a form does after its answer (reviews W-2, W-5)', () => {
   it('stays on a refusal, unless its choices may be stale; closes when done or over', () => {
     expect(formStep({ ok: false, gone: false }, {})).toBe('stay');
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
index eed710a516de07f4540a394476465267962a7ffc..e79edb41dd15570a02755c6bdf6513ad98e57ac2 100644
--- a/src/web/client/post-forms.ts
+++ b/src/web/client/post-forms.ts
@@ -1,5 +1,6 @@
-import type { MapParty, MapRegroup } from '../../domain/web/party-data.js';
+import type { MapMeet, MapParty, MapRegroup } from '../../domain/web/party-data.js';
 import { groupLine } from '../../render/group-words.js';
+import { MEET_TIME_NOW, meetTimeLabel, NO_MEETING_TIME } from '../../render/meet-words.js';
 import { pressParty, type PressSteps, type Pressed } from './parties.js';
 import type { PageNode } from './popup.js';
 import { safeHref } from './post-draw.js';
@@ -157,6 +158,58 @@ export function regroupForm(
   ]);
 }
 
+/** The value of "No meeting time" in Meet…'s menu. */
+const NO_MEETING = 'none';
+
+/**
+ * Meet…'s form (plan 8M-8B, X4), as the post's dialog: its title and text, the menu "When does
+ * your group meet?" of the times the server offers now, named in the reader's own zone with the
+ * dialog's words (`meetTimeLabel`; the group's own time said so), "No meeting time" last while the
+ * group has one, the time the server chose to start with picked. Nothing is typed: no zone hint.
+ */
+export function meetForm(party: MapParty, meet: MapMeet, times: FormTimes): PageNode {
+  const clock = (at: number): string => postTime(at, 't', times.now, times.time);
+  const option = (value: string, text: string, picked: boolean): PageNode => ({
+    tag: 'option',
+    text,
+    attributes: { value, ...(picked ? { selected: '' } : {}) },
+  });
+  return dialogForm('meet', party.id, meet.title, [
+    { tag: 'p', className: 'form-text', text: meet.text },
+    {
+      tag: 'label',
+      className: 'form-field',
+      children: [
+        { tag: 'span', className: 'form-label', text: meet.label },
+        {
+          tag: 'select',
+          attributes: { name: 'time' },
+          children: [
+            ...meet.times.map((time) =>
+              option(
+                String(time.at),
+                time.at === meet.set
+                  ? `${meetTimeLabel(time, clock(time.at))} · ${MEET_TIME_NOW}`
+                  : meetTimeLabel(time, clock(time.at)),
+                time.at === meet.picked,
+              ),
+            ),
+            ...(meet.set === null ? [] : [option(NO_MEETING, NO_MEETING_TIME, false)]),
+          ],
+        },
+      ],
+    },
+  ]);
+}
+
+/** The body of Meet…'s Submit: the group drawn, by its letter and stamp, and the time chosen. */
+export function meetBody(meet: MapMeet, picked: string | undefined): PostFormBody {
+  const base = { group: meet.group, stamp: meet.stamp };
+  if (picked === NO_MEETING) return { body: { ...base, time: null } };
+  const time = meet.times.find((one) => String(one.at) === picked);
+  return time === undefined ? { text: 'Pick a time first.' } : { body: { ...base, time: time.at } };
+}
+
 /** A body to send, or what the member must do first (the page's own words). */
 export type PostFormBody = { body: Record<string, unknown> } | { text: string };
 
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 01380529ac46cc0e56e439fe03b4d4dfc59301f3..aeba7168462ea260ae2df6068d0f3e8d5b332c42 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -57,7 +57,7 @@ export function formControls(root: ParentNode, on: boolean): void {
     'button[data-report], button[data-change-raid], button[data-spawn], button[data-show-raid], ' +
       'button[data-new-train], button[data-route-train], button[data-move-train], ' +
       'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
-      'button[data-regroup]',
+      'button[data-regroup], button[data-meet]',
   )) {
     button.disabled = !on;
   }
diff --git a/src/web/party-meet.test.ts b/src/web/party-meet.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0e96aec6ab4ad82a9871f92ee83ec04c2bebd267
--- /dev/null
+++ b/src/web/party-meet.test.ts
@@ -0,0 +1,173 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
+import { reportedMax, reportedRaid } from '../../test/support/party-service.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { MEET_THROTTLE } from '../commands/parties/meet.js';
+import { variedThrottleKey } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { MapMeet, PressAnswer } from '../domain/web/party-data.js';
+
+const HATCH = PARTY_NOW + 30 * MINUTE;
+const MEET_KEY = variedThrottleKey('meet', MEET_THROTTLE);
+
+beforeEach(() => {
+  // The attendance service reads the clock (as Meet…'s Submit does on Discord).
+  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+/**
+ * An egg hatching in half an hour (or `made`), Alice coming, on the map: Alice and Bob members of
+ * the server; the web server's clock the parties' own.
+ */
+async function meeting(
+  made?: Awaited<ReturnType<typeof reportedRaid>> | Awaited<ReturnType<typeof reportedMax>>,
+  throttles = new Throttles(),
+) {
+  const party = made ?? (await reportedRaid({ time: { hatch: HATCH } }));
+  const id = party.party.id;
+  await party.attendance.signUp(id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const web = webServerWith({ members, parties: partyWebWith(party, { acting, throttles }) });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const url = `/s/${FAKE_GUILD_ID}/api/parties/${id}/meet`;
+  const open = async (userId = ALICE, name = 'Alice') => {
+    const answer = await web.app.inject({
+      url,
+      headers: { cookie: await web.loggedIn(userId, name) },
+    });
+    return { status: answer.statusCode, json: answer.json<MapMeet & { error?: string }>() };
+  };
+  const set = async (body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
+  };
+  return { made: party, id, web, open, set, throttles };
+}
+
+describe('Meet… on the map (plan 8M-8B)', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("offers the times of the post's Meet… for the member's group, with the dialog's words", async () => {
+    const map = await meeting();
+    web = map.web;
+    const { status, json } = await map.open();
+    expect(status).toBe(200);
+    expect(json).toMatchObject({
+      title: 'Meeting time',
+      text: 'For your group: everybody in it is told.',
+      label: 'When does your group meet?',
+      group: 'A',
+      set: null,
+      // The hatch, the most common meeting time, chosen to start with.
+      picked: HATCH,
+    });
+    expect(json.stamp).toMatch(/\S/u);
+    // Nothing before the hatch: a meeting time lies between the hatch and the end.
+    expect(json.times[0]).toEqual({ at: HATCH, rsvp: true, hatch: true });
+    expect(json.times).toContainEqual({ at: HATCH + 5 * MINUTE, rsvp: false });
+    expect(json.times).toContainEqual({ at: HATCH + 15 * MINUTE, rsvp: true });
+  });
+
+  it('refuses at the opening what Meet… refuses at the press, in its words', async () => {
+    const map = await meeting();
+    web = map.web;
+    const bob = await map.open(BOB, 'Bob');
+    expect(bob).toEqual({ status: 422, json: { error: 'You are not signed up for this raid.' } });
+    const noTimes = await meeting(await reportedRaid());
+    web = noTimes.web;
+    await map.web.app.close();
+    expect((await noTimes.open()).json).toEqual({
+      error: 'This raid has no times yet: "Set time…" gives them.',
+    });
+  });
+
+  it("refuses to open while /meet's window is full, counting nothing", async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < MEET_THROTTLE.uses; n++) {
+      throttles.use(MEET_KEY, ALICE, MEET_THROTTLE, PARTY_NOW);
+    }
+    const map = await meeting(undefined, throttles);
+    web = map.web;
+    const refused = await map.open();
+    expect(refused).toEqual({
+      status: 429,
+      json: { error: 'You can use /meet again in 1 minute.' },
+    });
+  });
+
+  it("sets the group's meeting time as Meet…'s Submit does, in /meet's words, once in its window", async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < MEET_THROTTLE.uses - 1; n++) {
+      throttles.use(MEET_KEY, ALICE, MEET_THROTTLE, PARTY_NOW);
+    }
+    const map = await meeting(undefined, throttles);
+    web = map.web;
+    const { json: offered } = await map.open();
+    const answer = await map.set({ group: offered.group, stamp: offered.stamp, time: HATCH });
+    expect(answer).toEqual({
+      status: 200,
+      // The reporter is in the group too.
+      json: {
+        ok: true,
+        text: 'The meeting time of your group is 2:30 PM (in 30 min). I have told the others.',
+      },
+    });
+    expect(map.made.store.get(map.id)?.groups[0]?.startTime).toBe(HATCH);
+    expect((await map.set({ group: 'A', stamp: offered.stamp, time: null })).status).toBe(429);
+  });
+
+  it('refuses a group that changed meanwhile and a time no longer offered, as the dialog says it', async () => {
+    const map = await meeting();
+    web = map.web;
+    const { json: offered } = await map.open();
+    expect((await map.set({ group: 'A', stamp: 'x0', time: HATCH })).json).toEqual({
+      ok: false,
+      text: 'Your group changed meanwhile: try again.',
+    });
+    expect(
+      (await map.set({ group: 'A', stamp: offered.stamp, time: HATCH + MINUTE })).json,
+    ).toEqual({ ok: false, text: 'That time is no longer offered: press Meet… again.' });
+    expect((await map.set({ group: 'A', stamp: offered.stamp })).status).toBe(400);
+  });
+
+  it('refuses a member kept out of the forum, before anything is counted or read', async () => {
+    const map = await meeting();
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.open()).status).toBe(403);
+    expect((await map.set({ group: 'A', stamp: 's', time: HATCH })).status).toBe(403);
+    expect(map.throttles.size).toBe(0);
+  });
+
+  it('serves a max battle too: the five-minute times up to its end', async () => {
+    const map = await meeting(await reportedMax());
+    web = map.web;
+    const { status, json } = await map.open();
+    expect(status).toBe(200);
+    expect(json.times[0]).toEqual({ at: PARTY_NOW + 5 * MINUTE, rsvp: false });
+    expect(json.times.every((time) => !time.rsvp)).toBe(true);
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index f85be9b73a725a1ee60f9ec81bfb8d5feedaa214..f45a6f3d12b59f75ab88bede6d27b0b92662c83d 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -125,6 +125,7 @@ export interface PartyWebDeps {
     | 'changeNumber'
     | 'answer'
     | 'joinStamped'
+    | 'setMeetingTime'
     | 'limits'
     | 'lobbyOf'
   >;
diff --git a/src/web/post-control-routes.ts b/src/web/post-control-routes.ts
index ac17d72483fa75e0b49e58e7f4b5ab94f24dd01d..cefb413855cf636d0de61a28c066ae479bdfacbf 100644
--- a/src/web/post-control-routes.ts
+++ b/src/web/post-control-routes.ts
@@ -1,21 +1,26 @@
 import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { z } from 'zod';
 import { movedWords } from '../commands/parties/group-dialogs.js';
-import { ACTION_THROTTLE, partyOver } from '../commands/parties/reply.js';
+import { MEET_THROTTLE, meetingWords } from '../commands/parties/meet.js';
+import { meetRefusalOf, meetSubmitRefusal } from '../commands/parties/meet-dialog.js';
+import { ACTION_THROTTLE, outcomeWords, partyOver } from '../commands/parties/reply.js';
 import type { MemberStanding } from '../discord/member-directory.js';
-import { isGroupId, type Party } from '../domain/party/party.js';
-import type { PressAnswer } from '../domain/web/party-data.js';
+import { attendeeOf, isGroupId, type Party } from '../domain/party/party.js';
+import type { MapMeet, PressAnswer } from '../domain/web/party-data.js';
+import { meetOnTheMap } from '../render/meet-dialog.js';
 import { PARTY_KIND } from '../render/party-controls.js';
 import { unplain } from '../render/text.js';
 import type { AttendanceOutcome, Member } from '../services/attendance-service.js';
 import {
   actingOnTheMap,
   countedOnTheMap,
+  memberOrFailure,
   throttledOnTheMap,
   unreachableOnTheMap,
 } from './acting.js';
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
+import { pageWords } from './page-words.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -51,6 +56,24 @@ const regroupBodySchema = z
   })
   .strict();
 
+/** Meet…'s openings and Submits one address may send in a minute, whoever sends them. */
+export const MEET_PER_ADDRESS_MINUTE = 30;
+
+/** How the map names Meet… in its refusals (the post names it by its icon). */
+const MEET_ON_THE_MAP = 'Meet…';
+
+/**
+ * The body of Meet…'s Submit: the group the form was drawn for, by its letter and stamp, and the
+ * time chosen (epoch milliseconds, one the form offered), null for "No meeting time".
+ */
+const meetBodySchema = z
+  .object({
+    group: z.string().regex(/^[A-E]$/u),
+    stamp: z.string().min(1).max(40),
+    time: z.number().int().nonnegative().nullable(),
+  })
+  .strict();
+
 /** A control's address: `/api/parties/<party id>/<control>`. */
 type ControlRequest = FastifyRequest<{ Params: { guild: string; party: string } }>;
 
@@ -73,9 +96,25 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
     userId: string,
     doing: string,
   ): Promise<Target> => {
-    const { guild, party: partyId } = request.params;
+    const { guild } = request.params;
     const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
     if ('sent' in acting) return acting;
+    const found = await partyFor(request, reply, userId, doing);
+    return 'sent' in found ? found : { ...acting, ...found };
+  };
+
+  /**
+   * The party a control names, as the store has it, for a member it may concern: an active party
+   * of this server (else 409 "This has ended."), in a forum they are not kept out of (barred 403;
+   * Discord unreachable 503).
+   */
+  const partyFor = async (
+    request: ControlRequest,
+    reply: FastifyReply,
+    userId: string,
+    doing: string,
+  ): Promise<{ party: Party; row: number } | { sent: FastifyReply }> => {
+    const { guild, party: partyId } = request.params;
     const row = await parties.guilds.idFor(guild);
     const party = parties.store.get(partyId);
     if (row === undefined || party?.guildId !== row || party.status !== 'active') {
@@ -91,9 +130,31 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
     } catch (err) {
       return { sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing) };
     }
-    return { ...acting, party, row };
+    return { party, row };
   };
 
+  /**
+   * Who opens a form and of which party, for a form that asks the server what it offers (Meet…,
+   * the report): a member by the directory (`memberOrFailure`: 401, 403, 503), then `partyFor`.
+   */
+  const reader = async (
+    request: ControlRequest,
+    reply: FastifyReply,
+    doing: string,
+  ): Promise<{ userId: string; party: Party; row: number } | { sent: FastifyReply }> => {
+    void reply.header('cache-control', 'private, no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return { sent: sendFailure(request, reply, 401) };
+    const { userId } = session;
+    const refused = await memberOrFailure(deps, request, reply, request.params.guild, userId);
+    if (refused) return { sent: refused };
+    const found = await partyFor(request, reply, userId, doing);
+    return 'sent' in found ? found : { userId, ...found };
+  };
+
+  /** The words of a command as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, parties.zone, deps.now());
+
   /** Logged as a press of the post is: who, where, which party, what; never a text. */
   const noted = (request: ControlRequest, userId: string, action: string, outcome: string) => {
     deps.log.info(
@@ -152,4 +213,86 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return reply.code(OUTCOME_STATUS[kind]).send(answer);
     },
   );
+
+  // Meet… (plan 8M-8B, X4), a raid's and a max battle's: the form asks what the dialog offers
+  // now (`GET`: `meetOnTheMap`), refused as the press is (`meetRefusalOf`) and while `/meet`'s
+  // window is full (counting nothing, as the post's `checks`); its Submit (`POST`) counts once in
+  // that window (`MEET_WINDOW`: one budget with `/meet` and the dialog), decides again, and sets
+  // the time as the dialog's Submit does (`setMeetingTime` with the group drawn), in `/meet`'s
+  // words, Meet… named in words (`meetSubmitRefusal`). One per-address limit for both.
+  const meetLimiter = new RateLimiter({ uses: MEET_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const meetWindow = { command: 'meet', varies: true } as const;
+  scope.get(
+    '/api/parties/:party/meet',
+    { onRequest: limitedPerAddress(meetLimiter, { now: deps.now }) },
+    async (request: ControlRequest, reply) => {
+      const found = await reader(request, reply, 'opened Meet…');
+      if ('sent' in found) return found.sent;
+      const { userId, party } = found;
+      const full = throttledOnTheMap(deps, reply, meetWindow, userId, MEET_THROTTLE, {
+        count: false,
+      });
+      if (full) return full;
+      const now = deps.now();
+      const battle = meetRefusalOf(parties.attendance.limits(), party, userId, now);
+      if (typeof battle === 'string') return reply.code(422).send({ error: words(battle) });
+      const groupId = attendeeOf(battle, userId)?.group ?? battle.defaultGroupId;
+      const view: MapMeet = meetOnTheMap({ party: battle, groupId, zone: parties.zone, now });
+      return view;
+    },
+  );
+  scope.post(
+    '/api/parties/:party/meet',
+    {
+      onRequest: [
+        limitedPerAddress(meetLimiter, { now: deps.now }),
+        postGuard(sessions, deps.settings.publicUrl),
+      ],
+    },
+    async (request: ControlRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = meetBodySchema.safeParse(request.body ?? {});
+      if (!body.success || !isGroupId(body.data.group)) return sendFailure(request, reply, 400);
+      const { group, stamp, time } = body.data;
+      const { userId } = session;
+      const found = await target(request, reply, userId, 'set a meeting time');
+      if ('sent' in found) return found.sent;
+      const throttled = throttledOnTheMap(deps, reply, meetWindow, userId, MEET_THROTTLE);
+      if (throttled) return throttled;
+      const { kind, said } = await countedOnTheMap(
+        deps,
+        meetWindow,
+        userId,
+        MEET_THROTTLE,
+        async () => {
+          const limits = parties.attendance.limits();
+          const now = parties.store.get(found.party.id);
+          const battle = meetRefusalOf(limits, now, userId, deps.now());
+          if (typeof battle === 'string') {
+            return { kind: 'refused' as const, said: { ok: false, text: battle } };
+          }
+          const outcome = await parties.attendance.setMeetingTime(battle.id, found.member, time, {
+            group,
+            stamp,
+          });
+          const refusal =
+            outcome.kind === 'refused'
+              ? meetSubmitRefusal(outcome.reason, MEET_ON_THE_MAP)
+              : undefined;
+          return {
+            kind: outcome.kind,
+            said:
+              refusal === undefined
+                ? outcomeWords(limits, battle, outcome, (ok) => meetingWords(ok, userId))
+                : { ok: false, text: refusal },
+          };
+        },
+      );
+      noted(request, userId, 'meet', kind);
+      const answer: PressAnswer = { ok: said.ok, text: words(said.text) };
+      return reply.code(OUTCOME_STATUS[kind]).send(answer);
+    },
+  );
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index 2042e4501488e07ff6adfb6459598f0399bfc0d0..d49b52e79d809e55376ca674320667641c70013a 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -249,6 +249,7 @@ const NO_PARTIES: PartyWebDeps = {
     changeNumber: noAttendance,
     answer: noAttendance,
     joinStamped: noAttendance,
+    setMeetingTime: noAttendance,
     limits: () => {
       throw new Error('no parties in this test: give partyWebWith');
     },
````

### Task 5: 8M-8B task 5: staff's Delete... on the map

Prototype commit: `c71ae9333f0ae263cc73d5d6640afd8990d59409`

The post has no button for /delete, so Delete... is a map control in the
map's own line beside "Open on Discord" (X1), for staff alone: the list
says staff (PartiesView.staff) and per party close { mayDelete, forum,
word } (PartyService.mayDeletePost, the forum named "#name", the party
named by partyWord), so that the form offers "archive only" where
/delete's dialog would.

Moved out of the Submit of /delete's dialog (delete.ts): closePartyAs,
the whole closing after the dialog (the refusal of a deletion the bot may
not make, endAs with the moderator in the post's last words and the
answer before the archiving, the post of a party over a moment before
deleted all the same, closedByStaff), returning a CloseOutcome kind;
closeWords gives each kind's words and tone for the dialog (its accents)
and the map; mayNotDeleteIn names the forum as the caller does (a
mention on Discord, "#name" on the map). The dialog's words are the
import-free render/removal-words.ts (closeTitle, closeQuestion,
REMOVAL_LABEL, REMOVAL_CHOICES, archiveOnlyText), which /delete's dialog
and the page share (review W-4).

POST .../parties/<id>/close { removal }: the checks of every write, staff
by the member fetched fresh (403 in requireManagement's words, STAFF_ONLY
of guards.ts, uncounted), CLOSE_THROTTLE in the window of the controls
pclose, then closePartyAs. Its own per-address limiter. WebDeps.posts
carries the context it calls (postWebWith in tests), PartyWebDeps.closing
what the list asks. After a close the page closes the popup or card that
shows the party (showsParty, review W-6, the one rule the drawing of a
post that came uses too; the party the form holds, not looked up again
in a list a poll may have changed, review N-3) and asks for the list.

**Files:**

```
 src/app.ts                                    |   7 +++++++
 src/commands/parties/delete.ts                | 166 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------------------------------
 src/discord/guards.ts                         |   8 ++++++-
 src/domain/web/party-data.ts                  |  26 +++++++++++++++++++++++
 src/domain/web/party-view.ts                  |  17 +++++++++++++++
 src/render/moderation.ts                      |  21 +++++--------------
 src/render/removal-words.ts                   |  43 +++++++++++++++++++++++++++++++++++++
 src/web/client/map.css                        |  16 ++++++++++++++
 src/web/client/party-layer.ts                 |  19 ++++++++++++-----
 src/web/client/post-draw.test.ts              |  12 +++++++++++
 src/web/client/post-draw.ts                   |  25 +++++++++++++++++++---
 src/web/client/post-forms-ui.isolated.test.ts |  20 +++++++++++++++++-
 src/web/client/post-forms-ui.ts               |  37 +++++++++++++++++++++++++++-----
 src/web/client/post-forms.test.ts             |  61 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/post-forms.ts                  |  68 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/raid-ui.ts                     |   2 +-
 src/web/client/what-is-on.test.ts             |   1 +
 src/web/party-close.test.ts                   | 169 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts                       |  20 ++++++++++++++++++
 src/web/post-control-routes.ts                |  82 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/server.ts                             |   3 +++
 test/support/web.ts                           |  32 ++++++++++++++++++++++++++++
 22 files changed, 779 insertions(+), 76 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/post-draw.test.ts src/web/client/post-forms-ui.isolated.test.ts src/web/client/post-forms.test.ts src/web/client/what-is-on.test.ts src/web/party-close.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c71ae9333f0ae263cc73d5d6640afd8990d59409 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8B task 5: staff's Delete... on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index b5a4f1045c66c88827127033a7208554d9b421c0..78237b3a246623bb222bd9e554012d4cc7210d98 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1290,7 +1290,14 @@ export async function startApp(
         acting: new DiscordWebMembers(client),
         throttles,
         ownerId: config.env.OWNER_ID,
+        // Staff's Delete… (plan 8M-8B): whether the bot may delete a post, a forum's name.
+        closing: {
+          mayDeletePost: (partyId) => partyService.mayDeletePost(partyId),
+          channelName: (channelId) => partyGateway.channelName(channelId),
+        },
       },
+      // Staff's Delete… on the map (plan 8M-8B): what /delete's dialog calls.
+      posts: { ctx },
       // Reporting and changing raids on the map: what the raid commands read and call.
       raids: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       spawns: {
diff --git a/src/commands/parties/delete.ts b/src/commands/parties/delete.ts
index 547ae7b343f74de4dfee11c3da2b0ea0b674434b..7da33f4aca554e5f68e7e02344a8bc3bfcf1f6bd 100644
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -25,8 +25,10 @@ import {
   REFUSED_ACCENT,
 } from '../../render/meetup-safety.js';
 import { removalDialog, removalOf } from '../../render/moderation.js';
+import { closeQuestion, closeTitle } from '../../render/removal-words.js';
 import { memberText } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
+import type { Member } from '../../services/attendance-service.js';
 import { actingMember, commandParty, partyOver } from './reply.js';
 
 /**
@@ -86,13 +88,109 @@ export function pendingDeletion(party: Pick<Party, 'type'>): string {
 
 /** What a moderator is told who chose to delete a post the bot may not delete. */
 export function mayNotDelete(forumId: string | null): string {
-  const where = forumId === null ? 'its forum' : `<#${forumId}>`;
+  return mayNotDeleteIn(forumId === null ? 'its forum' : `<#${forumId}>`);
+}
+
+/**
+ * `mayNotDelete` with the forum named by the caller (plan 8M-8B): a mention on Discord, `#name` on
+ * the map, which shows no mention.
+ */
+export function mayNotDeleteIn(where: string): string {
   return (
     `I can't delete posts in ${where} (Manage Threads is missing there). Archive it, or ` +
     'delete it yourself.'
   );
 }
 
+/**
+ * What came of staff's closing of a party (`closePartyAs`): refused before anything changed for a
+ * deletion the bot may not make (`may-not-delete`); over a moment before (`over`), its post
+ * deleted all the same where Delete post was chosen (`deleted-over`); closed as chosen
+ * (`closed`), or archived where Discord refused the deletion (`refused-deletion`) or did not answer
+ * (`deletion-pending`: deleted with the hourly upkeep).
+ */
+export type CloseOutcome =
+  | { kind: 'may-not-delete' }
+  | { kind: 'over' }
+  | { kind: 'deleted-over' }
+  | { kind: 'closed'; removal: PostRemoval }
+  | { kind: 'refused-deletion' }
+  | { kind: 'deletion-pending' };
+
+/** What closing a party reads and calls: exactly what `/delete`'s dialog uses. */
+export type ClosingContext = Pick<AppContext, 'partyService' | 'reports'>;
+
+/**
+ * Staff's closing of a party (plan 8M-8B: moved out of the Submit of `/delete`'s dialog, so that
+ * the dialog and the map's Delete… go one way): a deletion the bot may not make (by now) is
+ * refused before anything ends; else the party ends as `/delete` ended it (`PartyService.endAs`
+ * with who closed it as the post's last words, its post archived or deleted, `removal`), `left`
+ * told before the post is archived or deleted (the dialog answers there: nothing may follow the
+ * archiving); a party over a moment before has its post deleted all the same where Delete post
+ * was chosen; its reports to the moderators read closed by this moderator, the post as it really
+ * went (`closedByStaff`).
+ */
+export async function closePartyAs(
+  ctx: ClosingContext,
+  party: Party,
+  moderator: Member,
+  removal: PostRemoval,
+  left?: () => Promise<unknown>,
+): Promise<CloseOutcome> {
+  if (removal === 'delete' && !ctx.partyService.mayDeletePost(party.id)) {
+    return { kind: 'may-not-delete' };
+  }
+  const closed = await ctx.partyService.endAs(party.id, undefined, {
+    lastWords: `This ${partyWord(party)} was closed by ${memberText(moderator)}.`,
+    removal,
+    ...(left === undefined ? {} : { left }),
+  });
+  if (closed === false) {
+    // Over a moment before: Delete post deletes the post all the same.
+    const postId = party.forumPostId;
+    const deleted =
+      removal === 'delete' && postId !== null
+        ? await ctx.partyService.deletePostOf(postId)
+        : undefined;
+    return { kind: deleted === 'deleted' ? 'deleted-over' : 'over' };
+  }
+  // Its reports to the moderators read closed by this moderator, the post as it really went
+  // (or will go: a deletion the network failed is redone, review r1 C1).
+  const refused = removal === 'delete' && closed === 'archived';
+  await ctx.reports.closedByStaff(party.id, refused ? 'denied' : removal, moderator);
+  if (refused) return { kind: 'refused-deletion' };
+  return closed === 'deleting' ? { kind: 'deletion-pending' } : { kind: 'closed', removal };
+}
+
+/**
+ * The words of a closing's outcome (`closePartyAs`) and their tone (the accent of the dialog's
+ * answer), for the dialog and the map alike; `where` names the forum for `may-not-delete` (a
+ * mention on Discord, `#name` on the map).
+ */
+export function closeWords(
+  outcome: CloseOutcome,
+  party: Pick<Party, 'type'>,
+  where: string,
+): { tone: 'approved' | 'refused' | 'pending' | 'expired'; text: string } {
+  switch (outcome.kind) {
+    case 'may-not-delete':
+      return { tone: 'refused', text: mayNotDeleteIn(where) };
+    case 'over':
+      return { tone: 'expired', text: partyOver(party) };
+    case 'deleted-over':
+      return {
+        tone: 'approved',
+        text: `This ${partyWord(party)} was over already; I deleted its post.`,
+      };
+    case 'closed':
+      return { tone: 'approved', text: closedWords(party, outcome.removal) };
+    case 'refused-deletion':
+      return { tone: 'refused', text: refusedDeletion(party) };
+    case 'deletion-pending':
+      return { tone: 'pending', text: pendingDeletion(party) };
+  }
+}
+
 /** The action of the dialog of `/delete`: `pclose:<party id>:close[:archive]`. */
 const CLOSE_FORM = 'close';
 
@@ -149,8 +247,9 @@ export function closeDialog(
   return removalDialog({
     customId: id,
     opened: Date.now(),
-    title: `Close this ${word}`,
-    question: `Close this ${word}?`,
+    // The map's words too (`removal-words.ts`, plan 8M-8B).
+    title: closeTitle(word),
+    question: closeQuestion(word),
     mayDelete: ctx.partyService.mayDeletePost(party.id),
     forum: forumInDialog(interaction, party.forumChannelId),
   });
@@ -183,48 +282,29 @@ export const closeControls: ComponentHandler = {
     if ((await ctx.guilds.idFor(guildIdOf(interaction))) !== party.guildId) {
       throw new UserError(STALE_COMPONENT);
     }
-    if (removal === 'delete' && !ctx.partyService.mayDeletePost(party.id)) {
-      await interaction.editReply(say(REFUSED_ACCENT, mayNotDelete(party.forumChannelId)));
-      return;
-    }
-    const word = partyWord(party);
-    const moderator = actingMember(interaction);
-    const closed = await ctx.partyService.endAs(party.id, undefined, {
-      lastWords: `This ${word} was closed by ${memberText(moderator)}.`,
-      removal,
+    // The way the map's Delete… goes too (plan 8M-8B).
+    const outcome = await closePartyAs(ctx, party, actingMember(interaction), removal, () =>
       // The answer goes out before the post is archived or deleted: nothing may follow that.
-      left: () => interaction.editReply(say(APPROVED_ACCENT, closedWords(party, removal))),
-    });
-    if (closed === false) {
-      // Over a moment before: Delete post deletes the post all the same.
-      const postId = party.forumPostId;
-      const deleted =
-        removal === 'delete' && postId !== null
-          ? await ctx.partyService.deletePostOf(postId)
-          : undefined;
-      // The answer may have lived in the post just deleted: it goes with it.
-      await interaction
-        .editReply(
-          deleted === 'deleted'
-            ? say(APPROVED_ACCENT, `This ${word} was over already; I deleted its post.`)
-            : say(EXPIRED_ACCENT, partyOver(party)),
-        )
-        .catch(() => undefined);
+      interaction.editReply(say(APPROVED_ACCENT, closedWords(party, removal))),
+    );
+    // Answered already, before the post was archived or deleted.
+    if (outcome.kind === 'closed') return;
+    const where = party.forumChannelId === null ? 'its forum' : `<#${party.forumChannelId}>`;
+    const { tone, text } = closeWords(outcome, party, where);
+    if (outcome.kind === 'may-not-delete') {
+      await interaction.editReply(say(TONES[tone], text));
       return;
     }
-    // Its reports to the moderators read closed by this moderator, the post as it really went
-    // (or will go: a deletion the network failed is redone, review r1 C1).
-    const refused = removal === 'delete' && closed === 'archived';
-    await ctx.reports.closedByStaff(party.id, refused ? 'denied' : removal, moderator);
-    // An answer in a private message of its own, which opens no archived post again.
-    if (refused) {
-      await interaction
-        .editReply(say(REFUSED_ACCENT, refusedDeletion(party)))
-        .catch(() => undefined);
-    } else if (closed === 'deleting') {
-      await interaction
-        .editReply(say(PENDING_ACCENT, pendingDeletion(party)))
-        .catch(() => undefined);
-    }
+    // An answer in a private message of its own, which opens no archived post again; one that
+    // lived in a post just deleted goes with it.
+    await interaction.editReply(say(TONES[tone], text)).catch(() => undefined);
   },
 };
+
+/** The accent of each tone of a closing's answer (`closeWords`). */
+const TONES = {
+  approved: APPROVED_ACCENT,
+  refused: REFUSED_ACCENT,
+  pending: PENDING_ACCENT,
+  expired: EXPIRED_ACCENT,
+} as const;
diff --git a/src/discord/guards.ts b/src/discord/guards.ts
index ba9bff5f78a7535f43c4188a1710e307844ee629..e183e4aff1d61d74725c0c608e1c3fb97b5c8d81 100644
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -123,10 +123,16 @@ export const requireGuild: Guard = (interaction) => {
   assertGuild(interaction);
 };
 
+/**
+ * What `requireManagement` tells somebody who is not staff; the live map's Delete… says it too
+ * (plan 8M-8B).
+ */
+export const STAFF_ONLY = 'Only admins and moderators can do that.';
+
 export const requireManagement: Guard = (interaction, ctx) => {
   assertGuild(interaction);
   if (!isStaff(interaction, ctx)) {
-    throw new UserError('Only admins and moderators can do that.');
+    throw new UserError(STAFF_ONLY);
   }
 };
 
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 541ec3a8026ce915ad8e76a18a911476aacc6d7f..3861a8d047d053ae40207bf52fee5bbb167f16c0 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -222,6 +222,8 @@ export interface MapRaid {
   attendance: MapAttendance;
   /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
   postKey: string | null;
+  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
+  close?: MapClose;
 }
 
 /** What kind of battles a train goes to, as `TrainKind` spells it (plan 8X-4). */
@@ -291,6 +293,8 @@ export interface MapTrain {
    * they may: the page words it under the post's Move… and Manage….
    */
   moveRefusal: MapMoveRefusal | null;
+  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
+  close?: MapClose;
 }
 
 /**
@@ -375,6 +379,8 @@ export interface MapMeetup {
    * for a member signed up, as `/meet` has it.
    */
   panel: { start: boolean } | null;
+  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
+  close?: MapClose;
 }
 
 /**
@@ -428,17 +434,37 @@ export interface MapMax {
   attendance: MapAttendance;
   /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
   postKey: string | null;
+  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
+  close?: MapClose;
 }
 
 /** A party of any kind, as the map shows it. */
 export type MapParty = MapRaid | MapMax | MapTrain | MapMeetup;
 
+/**
+ * Staff's Delete… of a party on the map (plan 8M-8B, X1), as `/delete`'s dialog asks: whether the
+ * bot may delete its post (`PartyService.mayDeletePost`; where it may not, the form offers
+ * "archive only" and says why, naming the forum: `forum`, `#west-raids`). Only for staff, never
+ * while read-only.
+ */
+export interface MapClose {
+  mayDelete: boolean;
+  forum: string;
+  /** The party in the dialog's words (`partyWord`: `raid`, `max battle`; review W-4). */
+  word: string;
+}
+
 /** The active parties of a server a member may see, in the order they were made. */
 export interface PartiesView {
   /** The zone the posts give times in (`settings.timezone`). */
   zone: string;
   /** Discord cannot be reached: nothing can be pressed (spec 2.5). */
   readOnly: boolean;
+  /**
+   * Who asks is staff of the server (an admin, a moderator, the bot's owner; plan 8M-8B): the map's
+   * line offers them Delete… (each party's `close`).
+   */
+  staff: boolean;
   raids: MapRaid[];
   /**
    * The max battles (plan 8X-5), in the order they were made: a list of their own, so that a page
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 328c77b4c3ea0c86d3a6891ae952bdfda4b9a3c1..d37f19c14653d3edd160c7e244bfe6dd29f8da43 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -51,6 +51,7 @@ import type {
   MapTrain,
   MapTrainPanel,
   MapTrainRights,
+  MapClose,
   MapRegroup,
   PartiesView,
 } from './party-data.js';
@@ -141,6 +142,11 @@ export interface PartyViewInput {
    * read-only.
    */
   regroup?: (party: Party) => MapRegroup | undefined;
+  /**
+   * Staff's Delete… of a party (plan 8M-8B): whether the bot may delete its post and its forum's
+   * name, asked only for staff and never while read-only. Left out: none.
+   */
+  closing?: (party: Party) => Omit<MapClose, 'word'>;
   /**
    * The key of a party's post as last shown (plan 8M-8A, `postKey` of its `PartyService.layoutOf`),
    * undefined while it has none. Left out: none has one.
@@ -148,6 +154,12 @@ export interface PartyViewInput {
   postKey?: (party: Party) => string | undefined;
 }
 
+/** Staff's Delete… of a party (plan 8M-8B): for staff alone, never while read-only. */
+function closeOf(party: Party, input: PartyViewInput): { close?: MapClose } {
+  if (!input.staff || input.readOnly || input.closing === undefined) return {};
+  return { close: { ...input.closing(party), word: partyWord(party) } };
+}
+
 /** The address of a post on Discord, as the direct messages give it (`postLink`). */
 function postLink(guildId: string, postId: string): string {
   return `https://discord.com/channels/${guildId}/${postId}`;
@@ -282,6 +294,7 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
     mayChange: !input.readOnly,
     attendance: attendanceOf(party, input, stage === 'hatched'),
     postKey: input.postKey?.(party) ?? null,
+    ...closeOf(party, input),
   };
 }
 
@@ -308,6 +321,7 @@ function maxOf(party: MaxParty, link: string, input: PartyViewInput): MapMax | n
     place: { ...look.place, lat: round(look.place.lat), lon: round(look.place.lon) },
     attendance: attendanceOf(party, input, true),
     postKey: input.postKey?.(party) ?? null,
+    ...closeOf(party, input),
   };
 }
 
@@ -402,6 +416,7 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     panel: trainPanelOf(party, input),
     conductor: conductorOf(party, input),
     moveRefusal: moveRefusalOf(party, input),
+    ...closeOf(party, input),
   };
 }
 
@@ -447,6 +462,7 @@ function meetupOf(party: MeetupParty, link: string, input: PartyViewInput): MapM
     place: meetupPlaceOf(party.meetup.place),
     info: party.meetup.description,
     panel: meetupPanelOf(party, input),
+    ...closeOf(party, input),
   };
 }
 
@@ -474,6 +490,7 @@ export function partyView(input: PartyViewInput): PartiesView {
   const view: PartiesView = {
     zone: input.zone,
     readOnly: input.readOnly,
+    staff: input.staff,
     raids: [],
     maxes: [],
     trains: [],
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index f0e0ad0a04749a2ceb27973c6aab2d6f45f3e6f0..0ca29f95d8ab6ebb6a069641a938a73973846292 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -39,6 +39,7 @@ import {
   truncate,
 } from './text.js';
 import { actionRow, container, linkButton, textDisplay } from './v2.js';
+import { archiveOnlyText, REMOVAL_CHOICES, REMOVAL_LABEL } from './removal-words.js';
 
 /**
  * The custom-id kind of the buttons of a report's post (plan 8S-2): `mreport:<report id>:<action>`
@@ -329,11 +330,7 @@ export function removalDialog(asked: RemovalDialog): APIModalInteractionResponse
     return dialog({
       customId: asked.customId(['archive', token]),
       title: asked.title,
-      text:
-        `${asked.question}\n\nIts post will be archived (kept readable and locked): I can't ` +
-        `delete posts in ${asked.forum} (Manage Threads is missing there), so deleting it is ` +
-        'not offered. Delete it yourself if nobody should keep reading it.\n\n' +
-        'Submit archives its post.',
+      text: archiveOnlyText(asked.question, asked.forum),
     });
   }
   return dialog({
@@ -342,17 +339,9 @@ export function removalDialog(asked: RemovalDialog): APIModalInteractionResponse
     text: asked.question,
     choice: {
       id: REMOVAL_INPUT,
-      label: 'The post',
-      options: [
-        { value: 'archive', label: 'Archive post', description: 'Keeps it readable and locked.' },
-        {
-          value: 'delete',
-          label: 'Delete post',
-          description:
-            'Removes it with everything written in it: for what nobody should keep reading, ' +
-            'like a home address.',
-        },
-      ],
+      label: REMOVAL_LABEL,
+      // The words staff's Delete… on the map shows too (plan 8M-8B).
+      options: REMOVAL_CHOICES.map((choice) => ({ ...choice })),
     },
   });
 }
diff --git a/src/render/removal-words.ts b/src/render/removal-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9e049ce9fa937524d039fa70a3b946db24102ede
--- /dev/null
+++ b/src/render/removal-words.ts
@@ -0,0 +1,43 @@
+/*
+ * The words of the question before a party is ended by a moderator (plan 8Q, `removalDialog`):
+ * archive its post or delete it, on Discord and in staff's Delete… on the map (plan 8M-8B),
+ * without an import, so that the map's page takes them whole: one wording for both.
+ */
+
+/** The title of staff's closing of a party (`/delete`'s dialog): `Close this raid`. */
+export function closeTitle(word: string): string {
+  return `Close this ${word}`;
+}
+
+/** Its question: `Close this raid?`. */
+export function closeQuestion(word: string): string {
+  return `Close this ${word}?`;
+}
+
+/** The label of the choice between the ways. */
+export const REMOVAL_LABEL = 'The post';
+
+/** The ways, the harsher last: never picked to start with. */
+export const REMOVAL_CHOICES = [
+  { value: 'archive', label: 'Archive post', description: 'Keeps it readable and locked.' },
+  {
+    value: 'delete',
+    label: 'Delete post',
+    description:
+      'Removes it with everything written in it: for what nobody should keep reading, like a ' +
+      'home address.',
+  },
+] as const;
+
+/**
+ * What the question says where the bot may not delete the post (`forum`, the post's forum as the
+ * caller names it): it will be archived, why deleting it is not offered, and what Submit does.
+ */
+export function archiveOnlyText(question: string, forum: string): string {
+  return (
+    `${question}\n\nIts post will be archived (kept readable and locked): I can't ` +
+    `delete posts in ${forum} (Manage Threads is missing there), so deleting it is ` +
+    'not offered. Delete it yourself if nobody should keep reading it.\n\n' +
+    'Submit archives its post.'
+  );
+}
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 68abd15d10890b31bbede4ad4cf5c26cf5836b89..2a58bf081187ab24e251b096e18a2bb506e34159 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1567,6 +1567,22 @@ path.highlighted {
   margin: 0;
 }
 
+/* The map's own controls in its line (plan 8M-8B: Delete…, Report…), drawn as its links are. */
+.post-popup .map-line .link-button {
+  padding: 0;
+  border: 0;
+  background: none;
+  color: var(--link);
+  font: inherit;
+  text-decoration: underline;
+  cursor: pointer;
+}
+
+.post-popup .map-line .link-button:disabled {
+  color: var(--muted);
+  cursor: default;
+}
+
 .post-popup .press.back {
   margin-top: 8px;
 }
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 02daa233bb497fa767662cba1be09f049bd61c5f..6111527ef68e727719e0665a89327ff447f531d4 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -23,6 +23,7 @@ import { renderNode, type MapGym, type PageNode } from './popup.js';
 import { FormHold, keepClicksInPopup, OpenPopup, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
 import { postFormsUi } from './post-forms-ui.js';
+import { showsParty } from './post-forms.js';
 import { spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
 import {
@@ -404,12 +405,10 @@ export function showParties(
     },
     loaded: (id) => {
       if (hold.editing) return;
-      const raid = view?.raids.find((one) => one.id === id);
+      // Which popup or card shows the party: the one rule (`showsParty`, review N-3).
+      const party = partyById(id);
       const showsIt = (key: string | undefined): boolean =>
-        key === `train:${id}` ||
-        key === `route:${id}` ||
-        key === `meetup:${id}` ||
-        (raid !== undefined && key === `gym:${String(raid.gymId)}`);
+        party !== undefined && key !== undefined && showsParty(key, party);
       const shown = showing.popup;
       if (showsIt(showing.key) && shown) {
         // Drawn anew where it stands: the map does not pan for the post (review 8A-3).
@@ -557,6 +556,12 @@ export function showParties(
     done: async () => {
       await poller.now();
     },
+    // Only the popup or card that shows the party closed (review W-6).
+    // The party the form holds (review N-3), not looked up in a list a poll may have changed.
+    closeParty: (party) => {
+      if (showing.key !== undefined && showsParty(showing.key, party)) map.closePopup();
+      if (card.key !== undefined && showsParty(card.key, party)) card.close();
+    },
   });
 
   const press = async (button: HTMLButtonElement): Promise<void> => {
@@ -651,6 +656,10 @@ export function showParties(
         // Meet… (plan 8M-8B): its form, from what the server offers now.
         const party = partyById(target.dataset.meet);
         if (party) postForms.meetClicked(target, party);
+      } else if (target.dataset.closeParty !== undefined) {
+        // Staff's Delete… (plan 8M-8B): `/delete`'s question in the place of the post.
+        const party = partyById(target.dataset.closeParty);
+        if (party) postForms.closeClicked(target, party);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       } else postButton(target);
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 59a1b292eb2a09bb79e0659b67ed3de6bf8afadb..c66f85664f2425dc14e7c1a6320300a78fc4d998 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -494,6 +494,18 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
     expect(line && seen(line)).toBe('0.7 mi · Directions · Open on Discord');
   });
 
+  // Plan 8M-8B (X1): staff's Delete… in the map's own line, beside Open on Discord.
+  it('offers staff Delete… in the map’s line, nobody else', () => {
+    const placed = { ...context, place: undefined, located: undefined, units: 'imperial' as const };
+    const close = { mayDelete: true, forum: '#west', word: 'raid' };
+    const staff = postPopup(VIEW, raid({ close }), placed);
+    const line = byClass(staff, 'map-line')[0];
+    expect(line && seen(line)).toBe('Open on Discord · Delete…');
+    expect(line && buttonsOf(line)[0]?.attributes).toMatchObject({ 'data-close-party': 'r1' });
+    const member = byClass(postPopup(VIEW, raid(), placed), 'map-line')[0];
+    expect(member && buttonsOf(member)).toEqual([]);
+  });
+
   // Plan 8M-8B: the completion question, to the member it asked only, with its two answers.
   it('asks the member the completion question asked them, with "Yes, done" and "Not yet"', () => {
     const placed = { ...context, place: undefined, located: undefined, units: 'imperial' as const };
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index 934036843cb2da1c2abde8965d4767a084c16e8c..ba9bf9ce2218bf8d1878e59f6c3356b802dd4145 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -573,16 +573,34 @@ function completionPart(party: MapParty, context: PostDrawContext): PageNode[] {
   ];
 }
 
+/**
+ * The map's own controls of a party beside Open on Discord (plan 8M-8B, X1, X2: the post has no
+ * button for them): staff's Delete…, where the list offers it (`close`).
+ */
+export function mapControls(party: MapParty): PageNode[] {
+  return party.close === undefined
+    ? []
+    : [
+        {
+          tag: 'button',
+          className: 'link-button',
+          text: 'Delete…',
+          attributes: { type: 'button', 'data-close-party': party.id },
+        },
+      ];
+}
+
 /**
  * The map's line under a post: how far it is (from where the member is, once the browser said;
- * `distanceWords` in the server's units), Directions (Google Maps, a route to the place), and
- * Open on Discord (the post).
+ * `distanceWords` in the server's units), Directions (Google Maps, a route to the place),
+ * Open on Discord (the post), and the map's own controls (`controls`, `mapControls`).
  */
 export function mapLine(
   place: Place | undefined,
   link: string,
   located: Place | undefined,
   units: DistanceUnits,
+  controls: readonly PageNode[] = [],
 ): PageNode {
   const parts: PageNode[] = [
     ...(place !== undefined && located !== undefined
@@ -605,6 +623,7 @@ export function mapLine(
           },
         ]
       : []),
+    ...controls,
   ];
   return {
     tag: 'div',
@@ -698,7 +717,7 @@ export function postPopup(
     children: [
       postCard(view, party, context),
       ...minePart(party, context),
-      mapLine(context.place, party.link, context.located, context.units),
+      mapLine(context.place, party.link, context.located, context.units, mapControls(party)),
       ...extras,
     ],
   };
diff --git a/src/web/client/post-forms-ui.isolated.test.ts b/src/web/client/post-forms-ui.isolated.test.ts
index 1b4db8dea35a03581d5843f3917eb8409fa32de7..1d2580f7bea50d1ccc1a29cb682a51365a4d1e96 100644
--- a/src/web/client/post-forms-ui.isolated.test.ts
+++ b/src/web/client/post-forms-ui.isolated.test.ts
@@ -280,6 +280,8 @@ function page() {
     controls: () => undefined,
   });
   let redrawn: FakeElement | undefined;
+  /** The parties whose popup or card a form had closed. */
+  const closed: unknown[] = [];
   let drawn: () => void = () => undefined;
   const done = new Promise<void>((resolve) => {
     drawn = resolve;
@@ -297,8 +299,11 @@ function page() {
       drawn();
       return Promise.resolve();
     },
+    closeParty: (party) => {
+      closed.push(party);
+    },
   });
-  return { ui, button, post, done, redrawn: () => redrawn };
+  return { ui, button, post, done, redrawn: () => redrawn, closed };
 }
 
 describe('the forms of the post’s controls in the page (plan 8M-8B)', () => {
@@ -324,4 +329,17 @@ describe('the forms of the post’s controls in the page (plan 8M-8B)', () => {
     expect(focused.at(-1)).toBe(again);
     expect(again.isConnected).toBe(true);
   });
+
+  // Review N-3: the popup or card of the party closed is that of the party the form was opened
+  // for, which a poll may have taken out of the list before the answer came.
+  it('closes the popup or card of the party Delete… was opened for, by the party it holds', async () => {
+    const { ui, button, post, done, closed } = page();
+    const staffs = { ...raid, close: { mayDelete: false, forum: '#west-raids', word: 'raid' } };
+    ui.closeClicked(button as unknown as HTMLButtonElement, staffs);
+    await Promise.resolve();
+    await Promise.resolve();
+    post.querySelector('button[data-submit]')?.dispatch('click');
+    await done;
+    expect(closed).toEqual([staffs]);
+  });
 });
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index d90b1a748e6bc4e7a34244ba239e8487df221a10..cf9f15c5932521f5555e00273b1ece0f520fef5b 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -3,6 +3,8 @@ import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
 import {
+  closeBody,
+  closeForm,
   focusBack,
   formStep,
   meetBody,
@@ -35,6 +37,11 @@ export interface PostFormsDeps {
   times(): FormTimes;
   /** After a form went through, or its party ended: the list again, which shows it as it is. */
   done(): Promise<void>;
+  /**
+   * A party closed (Delete…) or found over: its popup or phone card closes; the party as the form
+   * was opened for it (review N-3: a poll may have taken it out of the list meanwhile).
+   */
+  closeParty(party: MapParty): void;
 }
 
 export function postFormsUi(deps: PostFormsDeps) {
@@ -66,8 +73,9 @@ export function postFormsUi(deps: PostFormsDeps) {
   const open = async (
     button: HTMLButtonElement,
     control: string,
-    partyId: string,
+    party: MapParty,
     load: () => Promise<Opened | { refused: string }>,
+    ends = false,
   ): Promise<void> => {
     const section = button.closest<HTMLElement>('.post-popup');
     if (!section) return;
@@ -107,7 +115,7 @@ export function postFormsUi(deps: PostFormsDeps) {
       const sent = await sendPostForm(deps.csrf.get(), {
         post: async (token) => {
           const reply = await fetch(
-            `/s/${guild}/api/parties/${encodeURIComponent(partyId)}/${control}`,
+            `/s/${guild}/api/parties/${encodeURIComponent(party.id)}/${control}`,
             {
               method: 'POST',
               credentials: 'same-origin',
@@ -131,8 +139,10 @@ export function postFormsUi(deps: PostFormsDeps) {
         target.focus();
         return;
       }
-      // Done, or over: the post back (the list draws it as it is now), unless the form went.
+      // Done, or over: the post back (the list draws it as it is now), unless the form went; a
+      // party closed (or over) closes its popup or card (`ends`).
       if (hold.holds(claim)) close();
+      if (ends || sent.gone) deps.closeParty(party);
       await deps.done();
       // The list drew the post anew: the focus on its control there (review N-1), as the list
       // finds a focused control again (`sameControl`).
@@ -182,7 +192,7 @@ export function postFormsUi(deps: PostFormsDeps) {
     regroupClicked(button: HTMLButtonElement, party: MapParty): void {
       const { regroup } = party.attendance;
       if (regroup === undefined || !('choices' in regroup)) return;
-      void open(button, 'regroup', party.id, () =>
+      void open(button, 'regroup', party, () =>
         Promise.resolve({
           form: regroupForm(party, regroup, deps.times(), deps.origin(), guild),
           bodyOf: (fields) => regroupBody(regroup, fields.way),
@@ -191,9 +201,26 @@ export function postFormsUi(deps: PostFormsDeps) {
       );
     },
 
+    /** Staff's Delete…: `/delete`'s question, from what the list says (`close`). */
+    closeClicked(button: HTMLButtonElement, party: MapParty): void {
+      const { close } = party;
+      if (close === undefined) return;
+      void open(
+        button,
+        'close',
+        party,
+        () =>
+          Promise.resolve({
+            form: closeForm(party, close),
+            bodyOf: (fields) => closeBody(fields.removal),
+          }),
+        true,
+      );
+    },
+
     /** Meet…: its form, from what the server offers now (`GET …/meet`), or why not. */
     meetClicked(button: HTMLButtonElement, party: MapParty): void {
-      void open(button, 'meet', party.id, async () => {
+      void open(button, 'meet', party, async () => {
         const meet = await asked<MapMeet>(party.id, 'meet');
         if ('refused' in meet) return meet;
         return {
diff --git a/src/web/client/post-forms.test.ts b/src/web/client/post-forms.test.ts
index 0c927c9fd2d60b037703b57ed7ff26b6cd003cf0..a9badad63bd3118138d6a1c800be090dbf93ae2c 100644
--- a/src/web/client/post-forms.test.ts
+++ b/src/web/client/post-forms.test.ts
@@ -2,6 +2,8 @@ import { describe, expect, it } from 'vitest';
 import type { MapAttendance, MapMeet, MapRaid, MapRegroup } from '../../domain/web/party-data.js';
 import type { PageNode } from './popup.js';
 import {
+  closeBody,
+  closeForm,
   focusBack,
   formStep,
   meetBody,
@@ -9,6 +11,7 @@ import {
   regroupBody,
   regroupForm,
   sendPostForm,
+  showsParty,
   type FormTimes,
 } from './post-forms.js';
 
@@ -177,6 +180,51 @@ describe('Meet… on the map (plan 8M-8B)', () => {
   });
 });
 
+describe("staff's Delete… on the map (plan 8M-8B)", () => {
+  it("asks /delete's question: archive or delete, nothing picked", () => {
+    // The party's word as the server sent it (review W-4), never worked out by the page.
+    const form = closeForm(raid, { mayDelete: true, forum: '#west-raids', word: 'max battle' });
+    expect(form.attributes).toMatchObject({ 'data-form': 'close', 'data-party': 'r1' });
+    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Close this max battle');
+    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(
+      'Close this max battle?',
+    );
+    expect(all(form).find((one) => one.tag === 'legend')?.text).toBe('The post');
+    const radios = all(form).filter((one) => one.attributes?.type === 'radio');
+    expect(radios.map((one) => one.attributes)).toEqual([
+      { type: 'radio', name: 'removal', value: 'archive' },
+      { type: 'radio', name: 'removal', value: 'delete' },
+    ]);
+    expect(
+      all(form)
+        .filter((one) => one.className === 'choice')
+        .map(seen),
+    ).toEqual([
+      'Archive postKeeps it readable and locked.',
+      'Delete postRemoves it with everything written in it: for what nobody should keep reading, like a home address.',
+    ]);
+  });
+
+  it('says the post will be archived, and why, where the bot may not delete it', () => {
+    const form = closeForm(raid, { mayDelete: false, forum: '#west-raids', word: 'raid' });
+    expect(all(form).some((one) => one.attributes?.type === 'radio')).toBe(false);
+    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(
+      "Close this raid?\n\nIts post will be archived (kept readable and locked): I can't delete " +
+        'posts in #west-raids (Manage Threads is missing there), so deleting it is not offered. ' +
+        'Delete it yourself if nobody should keep reading it.\n\nSubmit archives its post.',
+    );
+    expect(all(form).find((one) => one.attributes?.type === 'hidden')?.attributes?.value).toBe(
+      'archive',
+    );
+  });
+
+  it('sends the way picked, and asks for one first', () => {
+    expect(closeBody('delete')).toEqual({ body: { removal: 'delete' } });
+    expect(closeBody('archive')).toEqual({ body: { removal: 'archive' } });
+    expect(closeBody('')).toEqual({ text: 'Pick Archive post or Delete post first.' });
+  });
+});
+
 describe('what a form does after its answer (reviews W-2, W-5)', () => {
   it('stays on a refusal, unless its choices may be stale; closes when done or over', () => {
     expect(formStep({ ok: false, gone: false }, {})).toBe('stay');
@@ -194,6 +242,19 @@ describe('what a form does after its answer (reviews W-2, W-5)', () => {
   });
 });
 
+describe('which popup or card shows a party (review W-6)', () => {
+  it('knows a raid by its gym, a train by its ring and line, a meetup by its own key', () => {
+    expect(showsParty('gym:1', raid)).toBe(true);
+    expect(showsParty('gym:2', raid)).toBe(false);
+    expect(showsParty('train:r1', raid)).toBe(false);
+    const train = { kind: 'train', id: 't1' } as const;
+    expect(showsParty('train:t1', train)).toBe(true);
+    expect(showsParty('route:t1', train)).toBe(true);
+    expect(showsParty('meetup:t1', train)).toBe(false);
+    expect(showsParty('meetup:m1', { kind: 'meetup', id: 'm1' })).toBe(true);
+  });
+});
+
 describe('sendPostForm', () => {
   it('says the words, renews a stale token once, and tells a refusal and an ended party apart', async () => {
     const asked: string[] = [];
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
index e79edb41dd15570a02755c6bdf6513ad98e57ac2..e1991a8ed3596c125b7ed93c5fd326947c793c06 100644
--- a/src/web/client/post-forms.ts
+++ b/src/web/client/post-forms.ts
@@ -1,6 +1,13 @@
-import type { MapMeet, MapParty, MapRegroup } from '../../domain/web/party-data.js';
+import type { MapClose, MapMeet, MapParty, MapRegroup } from '../../domain/web/party-data.js';
 import { groupLine } from '../../render/group-words.js';
 import { MEET_TIME_NOW, meetTimeLabel, NO_MEETING_TIME } from '../../render/meet-words.js';
+import {
+  archiveOnlyText,
+  closeQuestion,
+  closeTitle,
+  REMOVAL_CHOICES,
+  REMOVAL_LABEL,
+} from '../../render/removal-words.js';
 import { pressParty, type PressSteps, type Pressed } from './parties.js';
 import type { PageNode } from './popup.js';
 import { safeHref } from './post-draw.js';
@@ -210,6 +217,43 @@ export function meetBody(meet: MapMeet, picked: string | undefined): PostFormBod
   return time === undefined ? { text: 'Pick a time first.' } : { body: { ...base, time: time.at } };
 }
 
+/**
+ * Staff's Delete… (plan 8M-8B, X1), as `/delete`'s dialog: `Close this raid`, its question, and
+ * the choice "The post" with nothing picked, Archive post or Delete post (`REMOVAL_CHOICES`);
+ * where the bot may not delete the post, no choice: the text says it will be archived and why,
+ * the forum named (`archiveOnlyText`).
+ */
+export function closeForm(party: MapParty, close: MapClose): PageNode {
+  // `/delete`'s words, the party named as the server sent it (review W-4).
+  const question = closeQuestion(close.word);
+  return dialogForm('close', party.id, closeTitle(close.word), [
+    {
+      tag: 'p',
+      className: 'form-text',
+      text: close.mayDelete ? question : archiveOnlyText(question, close.forum),
+    },
+    close.mayDelete
+      ? radioChoice(
+          'removal',
+          REMOVAL_LABEL,
+          REMOVAL_CHOICES.map(({ value, label, description }) => ({
+            value,
+            label,
+            line: description,
+          })),
+          undefined,
+        )
+      : { tag: 'input', attributes: { type: 'hidden', name: 'removal', value: 'archive' } },
+  ]);
+}
+
+/** The body of Delete…: the way picked (none picked: the page asks for one). */
+export function closeBody(picked: string | undefined): PostFormBody {
+  return picked === 'archive' || picked === 'delete'
+    ? { body: { removal: picked } }
+    : { text: 'Pick Archive post or Delete post first.' };
+}
+
 /** A body to send, or what the member must do first (the page's own words). */
 export type PostFormBody = { body: Record<string, unknown> } | { text: string };
 
@@ -236,6 +280,28 @@ export function formStep(
   return form.refusalCloses === true ? 'close' : 'stay';
 }
 
+/**
+ * Whether the popup or card under `key` shows the party (review W-6): a raid's is its gym's
+ * (`gym:<id>`), a train's its ring's or its line's (`train:<id>`, `route:<id>`), a meetup's its
+ * own (`meetup:<id>`).
+ */
+export function showsParty(
+  key: string,
+  party: Pick<MapParty, 'kind' | 'id'> & { gymId?: number | null },
+): boolean {
+  switch (party.kind) {
+    case 'raid':
+      return party.gymId != null && key === `gym:${String(party.gymId)}`;
+    case 'train':
+      return key === `train:${party.id}` || key === `route:${party.id}`;
+    case 'meetup':
+      return key === `meetup:${party.id}`;
+    case 'max':
+      // Not drawn on the map before plan 8M-9.
+      return false;
+  }
+}
+
 /** The focus back on the button that opened a form, once the form closed (review W-5). */
 export function focusBack(button: { isConnected: boolean; focus(): void }): void {
   if (button.isConnected) button.focus();
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index aeba7168462ea260ae2df6068d0f3e8d5b332c42..64cf3389dda1c4ba4ef878e87e267f5d5894cf3a 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -57,7 +57,7 @@ export function formControls(root: ParentNode, on: boolean): void {
     'button[data-report], button[data-change-raid], button[data-spawn], button[data-show-raid], ' +
       'button[data-new-train], button[data-route-train], button[data-move-train], ' +
       'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
-      'button[data-regroup], button[data-meet]',
+      'button[data-regroup], button[data-meet], button[data-close-party]',
   )) {
     button.disabled = !on;
   }
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index f797a34a7b56fd7ef591cb50a9ea03f9356bf40d..ab46cb8ddd3adc002dab342fca083e095f66a914 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -114,6 +114,7 @@ const meetup = (id: string, more: Partial<MapMeetup> = {}): MapMeetup => ({
 const view = (more: Partial<PartiesView> = {}): PartiesView => ({
   zone: ZONE,
   readOnly: false,
+  staff: false,
   raids: [],
   maxes: [],
   trains: [],
diff --git a/src/web/party-close.test.ts b/src/web/party-close.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4d08445347371aa4785b136f6d98831334afc9d1
--- /dev/null
+++ b/src/web/party-close.test.ts
@@ -0,0 +1,169 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  postWebWith,
+  TEST_OWNER_ID,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { CLOSE_KIND, CLOSE_THROTTLE } from '../commands/parties/delete.js';
+import { controlThrottleKey } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import type { PartiesView, PressAnswer } from '../domain/web/party-data.js';
+
+/**
+ * A hatched raid on the map, with staff's Delete…: the bot's owner and Bob, a moderator by role,
+ * are staff; Alice a member who is not.
+ */
+async function closing(throttles = new Throttles()) {
+  const made = await reportedRaid({ boss: { key: 'yveltal' } });
+  // The forum's name as the bot sees the channel.
+  made.gateway.channelNames.set(WEST_FORUM, 'west-raids');
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    parties: made.store,
+    regions: made.regions,
+  });
+  const moderator = { roleNames: ['Moderator'], administrator: false };
+  const members = new FakeMemberDirectory()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(TEST_OWNER_ID, 'Owner')
+    .standing(BOB, moderator);
+  const acting = new FakeActingMembers()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(TEST_OWNER_ID, 'Owner')
+    .standing(BOB, moderator);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    posts: postWebWith(ctx),
+  });
+  web.clock.now = PARTY_NOW;
+  const id = made.party.id;
+  const close = async (body: unknown, userId = BOB, name = 'Bob') => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: `/s/${FAKE_GUILD_ID}/api/parties/${id}/close`,
+      headers: { ...(await web.posting(userId, name)), 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
+  };
+  const listed = async (userId: string, name: string) => {
+    const answer = await web.app.inject({
+      url: `/s/${FAKE_GUILD_ID}/api/parties`,
+      headers: { cookie: await web.loggedIn(userId, name) },
+    });
+    return answer.json<PartiesView>();
+  };
+  return { made, id, web, close, listed, throttles };
+}
+
+describe("staff's Delete… on the map (plan 8M-8B)", () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('offers Delete… to staff alone, saying whether the bot may delete the post, its forum named', async () => {
+    const map = await closing();
+    web = map.web;
+    const staff = await map.listed(BOB, 'Bob');
+    expect(staff.staff).toBe(true);
+    // The party in the dialog's words as the domain names it (review W-4).
+    expect(staff.raids[0]?.close).toEqual({ mayDelete: true, forum: '#west-raids', word: 'raid' });
+    map.made.gateway.noManaging.add(WEST_FORUM);
+    expect((await map.listed(TEST_OWNER_ID, 'Owner')).raids[0]?.close).toEqual({
+      mayDelete: false,
+      forum: '#west-raids',
+      word: 'raid',
+    });
+    const member = await map.listed(ALICE, 'Alice');
+    expect(member.staff).toBe(false);
+    expect(member.raids[0]).not.toHaveProperty('close');
+  });
+
+  it("closes the raid as /delete's dialog does: the post's last words name the moderator, the answer /delete's", async () => {
+    const map = await closing();
+    web = map.web;
+    const answer = await map.close({ removal: 'archive' });
+    expect(answer).toEqual({
+      status: 200,
+      json: {
+        ok: true,
+        text: 'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
+      },
+    });
+    expect(map.made.store.get(map.id)).toBeUndefined();
+    expect(map.made.said().join('\n')).toContain(`This raid was closed by **Bob** (<@${BOB}>).`);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({ msg: 'a party was pressed on the map', action: 'close' }),
+    );
+  });
+
+  it("deletes the post where chosen, and refuses Delete where the bot may not delete there, in /delete's words", async () => {
+    const map = await closing();
+    web = map.web;
+    map.made.gateway.noManaging.add(WEST_FORUM);
+    const refused = await map.close({ removal: 'delete' });
+    expect(refused).toEqual({
+      status: 422,
+      json: {
+        ok: false,
+        text: "I can't delete posts in #west-raids (Manage Threads is missing there). Archive it, or delete it yourself.",
+      },
+    });
+    expect(map.made.store.get(map.id)).toBeDefined();
+    map.made.gateway.noManaging.delete(WEST_FORUM);
+    const deleted = await map.close({ removal: 'delete' });
+    expect(deleted.json).toEqual({
+      ok: true,
+      text: 'This raid is closed: its gym is free for a new report, and I am deleting its post.',
+    });
+  });
+
+  it('refuses a member who is not staff, before anything is counted', async () => {
+    const map = await closing();
+    web = map.web;
+    const refused = await map.close({ removal: 'archive' }, ALICE, 'Alice');
+    expect(refused).toEqual({
+      status: 403,
+      json: { error: 'Only admins and moderators can do that.' },
+    });
+    expect(map.throttles.size).toBe(0);
+    expect(map.made.store.get(map.id)).toBeDefined();
+    expect((await map.close({ removal: 'everything' })).status).toBe(400);
+  });
+
+  it("counts in the window of /delete's dialog", async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < CLOSE_THROTTLE.uses; n++) {
+      throttles.use(controlThrottleKey(CLOSE_KIND), BOB, CLOSE_THROTTLE, PARTY_NOW);
+    }
+    const map = await closing(throttles);
+    web = map.web;
+    expect((await map.close({ removal: 'archive' })).status).toBe(429);
+    expect(map.made.store.get(map.id)).toBeDefined();
+  });
+
+  it('answers a party that has ended: "This has ended."', async () => {
+    const map = await closing();
+    web = map.web;
+    await map.made.service.end(map.id);
+    expect(await map.close({ removal: 'archive' })).toEqual({
+      status: 409,
+      json: { ok: false, text: 'This has ended.' },
+    });
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index f45a6f3d12b59f75ab88bede6d27b0b92662c83d..53c6f12e85288467d8baac83c95a51976b9a43f5 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -138,6 +138,21 @@ export interface PartyWebDeps {
   throttles: Throttles;
   /** `OWNER_ID`: the bot's owner is staff in every server, as the commands' guards have it. */
   ownerId: string;
+  /**
+   * What staff's Delete… shows (plan 8M-8B): whether the bot may delete a party's post
+   * (`PartyService.mayDeletePost`, as `/delete`'s dialog asks it), and a channel's name as the bot
+   * sees it (the forum, named where it may not).
+   */
+  closing: {
+    mayDeletePost(partyId: string): boolean;
+    channelName(channelId: string): string | undefined;
+  };
+}
+
+/** A forum as the map names it in staff's Delete…: `#west-raids`, `its forum` where unknown. */
+export function forumOnTheMap(deps: PartyWebDeps, forumId: string | null): string {
+  const name = forumId === null ? undefined : deps.closing.channelName(forumId);
+  return name === undefined ? 'its forum' : `#${name}`;
 }
 
 /**
@@ -335,6 +350,11 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
     ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
     pictureOrigins: deps.pictureOrigins,
+    // Staff's Delete… as `/delete`'s dialog asks it (plan 8M-8B).
+    closing: (party) => ({
+      mayDelete: parties.closing.mayDeletePost(party.id),
+      forum: forumOnTheMap(parties, party.forumChannelId),
+    }),
     // Group… as the post's dialog decides and words it (plan 8M-8B).
     regroup: (party) =>
       regroupOnTheMap(
diff --git a/src/web/post-control-routes.ts b/src/web/post-control-routes.ts
index cefb413855cf636d0de61a28c066ae479bdfacbf..4afb1e438e1f15cbf10444cb313074bbdde9d5a8 100644
--- a/src/web/post-control-routes.ts
+++ b/src/web/post-control-routes.ts
@@ -1,9 +1,18 @@
 import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { z } from 'zod';
+import type { AppContext } from '../app-context.js';
+import {
+  CLOSE_KIND,
+  CLOSE_THROTTLE,
+  closePartyAs,
+  closeWords,
+  type CloseOutcome,
+} from '../commands/parties/delete.js';
 import { movedWords } from '../commands/parties/group-dialogs.js';
 import { MEET_THROTTLE, meetingWords } from '../commands/parties/meet.js';
 import { meetRefusalOf, meetSubmitRefusal } from '../commands/parties/meet-dialog.js';
 import { ACTION_THROTTLE, outcomeWords, partyOver } from '../commands/parties/reply.js';
+import { STAFF_ONLY } from '../discord/guards.js';
 import type { MemberStanding } from '../discord/member-directory.js';
 import { attendeeOf, isGroupId, type Party } from '../domain/party/party.js';
 import type { MapMeet, PressAnswer } from '../domain/web/party-data.js';
@@ -14,6 +23,7 @@ import type { AttendanceOutcome, Member } from '../services/attendance-service.j
 import {
   actingOnTheMap,
   countedOnTheMap,
+  isMapStaff,
   memberOrFailure,
   throttledOnTheMap,
   unreachableOnTheMap,
@@ -21,6 +31,7 @@ import {
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { pageWords } from './page-words.js';
+import { forumOnTheMap } from './party-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -33,6 +44,17 @@ import type { WebDeps } from './server.js';
  * stand to its forum (barred 403, unreachable 503); only then the window its dialog counts in.
  */
 
+/**
+ * What staff's Delete… reads and calls on the map (plan 8M-8B): exactly what `/delete`'s dialog
+ * uses (`closePartyAs`).
+ */
+export type PostWebContext = Pick<AppContext, 'partyService' | 'reports'>;
+
+/** What the forms of the post's controls need beyond the parties' own (`PartyWebDeps`). */
+export interface PostWebDeps {
+  ctx: PostWebContext;
+}
+
 /** Group…'s moves one address may send in a minute, whoever sends them. */
 export const GROUP_WRITES_PER_ADDRESS_MINUTE = 30;
 
@@ -74,6 +96,12 @@ const meetBodySchema = z
   })
   .strict();
 
+/** Staff's closings one address may send in a minute, whoever sends them (a clean-up is many). */
+export const CLOSE_PER_ADDRESS_MINUTE = 30;
+
+/** The body of Delete…: archive the post or delete it, as `/delete`'s dialog asks. */
+const closeBodySchema = z.object({ removal: z.enum(['archive', 'delete']) }).strict();
+
 /** A control's address: `/api/parties/<party id>/<control>`. */
 type ControlRequest = FastifyRequest<{ Params: { guild: string; party: string } }>;
 
@@ -295,4 +323,58 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return reply.code(OUTCOME_STATUS[kind]).send(answer);
     },
   );
+
+  // Staff's Delete… (plan 8M-8B, X1): `/delete`'s dialog on the map, for staff alone (as its
+  // `requireManagement`, of the member fetched fresh: 403 in its words, uncounted), in the window
+  // of its Submit (`CLOSE_THROTTLE` of the controls `pclose`), then `closePartyAs`, the dialog's
+  // own way, and its words (`closeWords`, the forum named `#name`).
+  const closeLimiter = new RateLimiter({ uses: CLOSE_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  scope.post(
+    '/api/parties/:party/close',
+    {
+      onRequest: [
+        limitedPerAddress(closeLimiter, { now: deps.now }),
+        postGuard(sessions, deps.settings.publicUrl),
+      ],
+    },
+    async (request: ControlRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = closeBodySchema.safeParse(request.body ?? {});
+      if (!body.success) return sendFailure(request, reply, 400);
+      const { removal } = body.data;
+      const { userId } = session;
+      const found = await target(request, reply, userId, 'closed a party');
+      if ('sent' in found) return found.sent;
+      if (!isMapStaff(found.standing, userId, parties.ownerId)) {
+        return reply.code(403).send({ error: STAFF_ONLY });
+      }
+      const counted = { control: CLOSE_KIND };
+      const throttled = throttledOnTheMap(deps, reply, counted, userId, CLOSE_THROTTLE);
+      if (throttled) return throttled;
+      const outcome = await countedOnTheMap(deps, counted, userId, CLOSE_THROTTLE, () =>
+        closePartyAs(deps.posts.ctx, found.party, found.member, removal),
+      );
+      noted(request, userId, 'close', outcome.kind);
+      const { text } = closeWords(
+        outcome,
+        found.party,
+        forumOnTheMap(parties, found.party.forumChannelId),
+      );
+      const ok = outcome.kind !== 'may-not-delete' && outcome.kind !== 'over';
+      const answer: PressAnswer = { ok, text: unplain(text) };
+      return reply.code(CLOSE_STATUS[outcome.kind]).send(answer);
+    },
+  );
 }
+
+/** The status of each outcome of a closing. */
+const CLOSE_STATUS: Readonly<Record<CloseOutcome['kind'], number>> = {
+  closed: 200,
+  'refused-deletion': 200,
+  'deletion-pending': 200,
+  'deleted-over': 200,
+  over: 409,
+  'may-not-delete': 422,
+};
diff --git a/src/web/server.ts b/src/web/server.ts
index a76fb779b410b31d9c66f682a3db93dde4ce8a41..ec0bf2aad69dd6a24ff4d580ef28025668fd46fb 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -27,6 +27,7 @@ import type { RaidWebDeps } from './raid-routes.js';
 import type { Sessions } from './sessions.js';
 import type { SpawnWebDeps } from './spawn-routes.js';
 import type { StopWebDeps } from './stop-routes.js';
+import type { PostWebDeps } from './post-control-routes.js';
 import type { TrainWebDeps } from './train-routes.js';
 import { toolFileRoutes, toolPageRoutes, type ToolWebDeps } from './tool-routes.js';
 import type { DistanceUnits } from '../render/distance-words.js';
@@ -72,6 +73,8 @@ export interface WebDeps {
   maxes: MaxWebDeps;
   /** Reports at stops on the live map: today's reports, the pick lists, reports (plan 8R-3). */
   stops: StopWebDeps;
+  /** Staff's Delete… and reports to the moderators on the live map (plan 8M-8B). */
+  posts: PostWebDeps;
   /** The Wayspot export tool and who may have it (plan 8W-P): `/userscript`. */
   tool: ToolWebDeps;
   /**
diff --git a/test/support/web.ts b/test/support/web.ts
index d49b52e79d809e55376ca674320667641c70013a..8c9ea0dfe4addd7836806a79b70d60709aa3676a 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -22,6 +22,7 @@ import type { SpawnWebContext, SpawnWebDeps } from '../../src/web/spawn-routes.j
 import type { TrainWebContext, TrainWebDeps } from '../../src/web/train-routes.js';
 import type { MeetupWebContext, MeetupWebDeps } from '../../src/web/meetup-routes.js';
 import type { MaxWebContext, MaxWebDeps } from '../../src/web/max-routes.js';
+import type { PostWebContext, PostWebDeps } from '../../src/web/post-control-routes.js';
 import type { StopWebContext, StopWebDeps } from '../../src/web/stop-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
@@ -260,6 +261,7 @@ const NO_PARTIES: PartyWebDeps = {
   acting: new FakeActingMembers(),
   throttles: new Throttles(),
   ownerId: TEST_OWNER_ID,
+  closing: { mayDeletePost: () => false, channelName: () => undefined },
 };
 
 /**
@@ -297,9 +299,36 @@ export function partyWebWith(
     acting: options.acting ?? new FakeActingMembers(),
     throttles: options.throttles ?? new Throttles(),
     ownerId: TEST_OWNER_ID,
+    // Staff's Delete… (plan 8M-8B): the fake gateway says where the bot may delete posts.
+    closing: {
+      mayDeletePost: (partyId) => made.service.mayDeletePost(partyId),
+      channelName: (channelId) => made.gateway.channelName(channelId),
+    },
   };
 }
 
+/**
+ * Staff's Delete… on the map over a test's context (`createTestContext` with the party service of
+ * `partyServiceWith` or `reportedRaid`, and its `reports`), as the bot wires it (plan 8M-8B).
+ * Pass as `posts`.
+ */
+export function postWebWith(
+  ctx: PostWebContext,
+  options: Partial<Omit<PostWebDeps, 'ctx'>> = {},
+): PostWebDeps {
+  return { ctx, ...options };
+}
+
+/** Nothing is closed on the map: a test that does passes `postWebWith`. */
+const NO_POSTS: PostWebDeps = {
+  ctx: new Proxy({} as PostWebContext, {
+    get(_target, property) {
+      if (typeof property === 'symbol' || property === 'then') return undefined;
+      throw new Error('no closing in this test: give postWebWith');
+    },
+  }),
+};
+
 /**
  * Reporting and changing raids on the map over a test's context (`createTestContext`, with the
  * party services of `partyServiceWith` for a report or a change), as the bot wires it. Pass as
@@ -549,6 +578,8 @@ export interface WebTestOptions {
   maxes?: MaxWebDeps;
   /** Reports at stops on the map (`stopWebWith`); none by default. */
   stops?: StopWebDeps;
+  /** Staff's Delete… and reports to the moderators on the map (`postWebWith`); none by default. */
+  posts?: PostWebDeps;
   /** The Wayspot export tool and who may have it (`toolWebWith`); no tool file by default. */
   tool?: ToolWebDeps;
   /**
@@ -731,6 +762,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     meetups: options.meetups ?? NO_MEETUPS,
     maxes: options.maxes ?? NO_MAXES,
     stops: options.stops ?? NO_STOPS,
+    posts: options.posts ?? NO_POSTS,
     tool: options.tool ?? NO_TOOL,
     pictures: {
       read: () => Promise.resolve(undefined),
````

### Task 6: 8M-8B task 6: Report... to the moderators on the map

Prototype commit: `1f5297ca264c74475a9c9346e2b0f38907d0c7d3`

Report... is a map control in the map's own line beside "Open on
Discord" (X2), for a member who sees the party's forum on Discord while
the map is not read-only (review W-7, Matt to confirm with C1: a report
without the moderators' channel writes a public line into the post):
PartyViewers says the forums a member cannot see by their roles as
hidden, the list's mayReport leaves them out, and both routes refuse a
hidden member (403). The form of /report (and of the Apps menu on a
party's post) over its code path. Reports have no blocks.

GET .../parties/<id>/report asks what /report asks before its form,
uncounted: its window (REPORT_WINDOW, "You can use /report again in
...") and whether the member's reason is on the open report already
(refuseReportedBefore, shared as it is; its context narrowed to the
reports), then answers the form's words (MapReport, reportFormWords,
which the Discord form is drawn from too). POST .../report { reason }:
the checks of every write, a reason of white space alone refused
uncounted (NO_REASON, the forms' guard), one use in /report's window,
then reportParty and reportAnswer as the form's Submit; a report the
moderators could not be told of gives the use back, as the router does.
Without the moderators' channel the reason goes into the post pinging
the staff roles, which managementRoleIdsOf gives keyed by the server
(managementRoleIds of an interaction calls it; PostWebDeps.staffRoles,
wired from the client's cache). Its own per-address limiter.

**Files:**

```
 src/app.ts                        |  13 ++++++++--
 src/commands/parties/report.ts    |  34 ++++++++++++++++++++------
 src/discord/guards.ts             |  11 ++++++++-
 src/domain/web/party-data.ts      |  32 +++++++++++++++++++++++++
 src/domain/web/party-view.test.ts |  16 +++++++++++++
 src/domain/web/party-view.ts      |  22 +++++++++++++++++
 src/web/client/map.css            |   6 +++++
 src/web/client/party-layer.ts     |   4 ++++
 src/web/client/post-draw.test.ts  |  21 +++++++++++------
 src/web/client/post-draw.ts       |  24 ++++++++++---------
 src/web/client/post-forms-ui.ts   |  16 ++++++++++++-
 src/web/client/post-forms.test.ts |  29 +++++++++++++++++++++++
 src/web/client/post-forms.ts      |  38 ++++++++++++++++++++++++++++-
 src/web/client/raid-ui.ts         |   3 ++-
 src/web/party-report.test.ts      | 206 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts           |   9 ++++++-
 src/web/party-viewers.test.ts     |   7 ++++++
 src/web/party-viewers.ts          |  32 ++++++++++++++++++-------
 src/web/post-control-routes.ts    | 136 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 test/support/web.ts               |  15 +++++++-----
 20 files changed, 618 insertions(+), 56 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/post-draw.test.ts src/web/client/post-forms.test.ts src/web/party-report.test.ts src/web/party-viewers.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1f5297ca264c74475a9c9346e2b0f38907d0c7d3 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8B task 6: Report... to the moderators on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 78237b3a246623bb222bd9e554012d4cc7210d98..c960a6b0c220c29db83379361f45ddec92923be3 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -46,6 +46,7 @@ import { enabledCommands, enabledMessageCommands } from './discord/command.js';
 import { DiscordDmGateway } from './discord/dm-gateway.js';
 import { attachGatewayHandlers, GatewayWatch } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
+import { managementRoleIdsOf } from './discord/guards.js';
 import { DiscordRegionStaff } from './discord/web-staff.js';
 import { DiscordWebMembers } from './discord/web-members.js';
 import { Throttles } from './discord/throttle.js';
@@ -1296,8 +1297,16 @@ export async function startApp(
           channelName: (channelId) => partyGateway.channelName(channelId),
         },
       },
-      // Staff's Delete… on the map (plan 8M-8B): what /delete's dialog calls.
-      posts: { ctx },
+      // Staff's Delete… and reports to the moderators on the map (plan 8M-8B): what /delete's
+      // dialog and /report's form call, and the staff roles a report pings without the
+      // moderators' channel, as /report pings them.
+      posts: {
+        ctx,
+        staffRoles: (guildId) => {
+          const guild = client.guilds.cache.get(guildId);
+          return guild ? managementRoleIdsOf(guild) : [];
+        },
+      },
       // Reporting and changing raids on the map: what the raid commands read and call.
       raids: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       spawns: {
diff --git a/src/commands/parties/report.ts b/src/commands/parties/report.ts
index ff18bb033eadf40f6aa96ec11442f329ff06e164..a82af92392aefc9b51e03e8194a6c8bbf9788242 100644
--- a/src/commands/parties/report.ts
+++ b/src/commands/parties/report.ts
@@ -39,14 +39,34 @@ export const REPORT_ALREADY = 'You already reported this.';
 /** Said of a message reported where the server has no moderators' channel (the design's words). */
 export const NO_MODERATORS = "This server has no moderators' channel.";
 const REPORT_NOT_SENT = 'I could not send your report to the moderators. Try again later.';
-const NO_REASON = 'Say what is wrong, so that the moderators know what to look at.';
+/** What a reason of white space alone is told (by the forms' guard, and on the map). */
+export const NO_REASON = 'Say what is wrong, so that the moderators know what to look at.';
+
+/**
+ * The words of the form that asks why, for a party (`what`: `raid`, `train`, `meetup`, `max
+ * battle`) or a message: the form's on Discord, and the map's (plan 8M-8B, `MapReport`).
+ */
+export function reportFormWords(what: string): {
+  title: string;
+  label: string;
+  placeholder: string;
+  maxLength: number;
+} {
+  return {
+    // A title has at most 45 characters: "Report this meetup to the moderators" has 36.
+    title: `Report this ${what} to the moderators`,
+    label: 'What is wrong?',
+    placeholder: 'Only the moderators read this.',
+    maxLength: MAX_REPORT_REASON,
+  };
+}
 
 /** The form that asks why, for a party (`what`: `raid`, `train`, `meetup`) or a message. */
 function reasonForm(customId: string, what: string): APIModalInteractionResponseCallbackData {
+  const words = reportFormWords(what);
   return {
     custom_id: customId,
-    // A title has at most 45 characters: "Report this meetup to the moderators" has 36.
-    title: `Report this ${what} to the moderators`,
+    title: words.title,
     components: [
       {
         type: ComponentType.ActionRow,
@@ -54,11 +74,11 @@ function reasonForm(customId: string, what: string): APIModalInteractionResponse
           {
             type: ComponentType.TextInput,
             custom_id: REPORT_REASON_INPUT,
-            label: 'What is wrong?',
+            label: words.label,
             style: TextInputStyle.Paragraph,
             required: true,
-            max_length: MAX_REPORT_REASON,
-            placeholder: 'Only the moderators read this.',
+            max_length: words.maxLength,
+            placeholder: words.placeholder,
           },
         ],
       },
@@ -186,7 +206,7 @@ export const report: SimpleCommand = {
  * submit says it).
  */
 export async function refuseReportedBefore(
-  ctx: AppContext,
+  ctx: Pick<AppContext, 'reports'>,
   subject: Parameters<AppContext['reports']['reportedBefore']>[0],
   reporterId: string,
 ): Promise<void> {
diff --git a/src/discord/guards.ts b/src/discord/guards.ts
index e183e4aff1d61d74725c0c608e1c3fb97b5c8d81..f3f428aa6d4e5c11c1e5bb8daf35c11a2dace6dc 100644
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -1,3 +1,4 @@
+import type { Guild } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import type { Settings } from '../config/index.js';
 import {
@@ -84,7 +85,15 @@ export function isStaff(interaction: LocatedInteraction, ctx: AppContext): boole
 /** The ids of the server's roles that make a member an admin or a moderator, to ping them. */
 export function managementRoleIds(interaction: LocatedInteraction): string[] {
   if (!interaction.inCachedGuild()) return [];
-  return interaction.guild.roles.cache
+  return managementRoleIdsOf(interaction.guild);
+}
+
+/**
+ * `managementRoleIds` of a server as the client has it, keyed by the server rather than an
+ * interaction (plan 8M-8B: the map's report pings them as `/report` does).
+ */
+export function managementRoleIdsOf(guild: Pick<Guild, 'roles'>): string[] {
+  return guild.roles.cache
     .filter((role) => MANAGEMENT_ROLES.has(role.name.toLowerCase()))
     .map((role) => role.id);
 }
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 3861a8d047d053ae40207bf52fee5bbb167f16c0..cdacab454b384709c65c88b9f9291f2afbd6f1c1 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -140,6 +140,18 @@ export interface MapMeet {
   picked: number | null;
 }
 
+/**
+ * The report of a party to the moderators on the map (plan 8M-8B, X2;
+ * `GET …/parties/<id>/report`), opened as `/report`'s form opens, in its words: its title, the
+ * label of its one field, the field's placeholder, and how long a reason may be.
+ */
+export interface MapReport {
+  title: string;
+  label: string;
+  placeholder: string;
+  maxLength: number;
+}
+
 /**
  * A group Group… offers (`MapRegroup`): its letter and stamp (what a move sends back, refused once
  * the group went or was opened again), its label (`Group B: by the bridge`), how many are in it as
@@ -224,6 +236,11 @@ export interface MapRaid {
   postKey: string | null;
   /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
   close?: MapClose;
+  /**
+   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
+   * Discord, never while read-only; absent otherwise.
+   */
+  mayReport?: true;
 }
 
 /** What kind of battles a train goes to, as `TrainKind` spells it (plan 8X-4). */
@@ -295,6 +312,11 @@ export interface MapTrain {
   moveRefusal: MapMoveRefusal | null;
   /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
   close?: MapClose;
+  /**
+   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
+   * Discord, never while read-only; absent otherwise.
+   */
+  mayReport?: true;
 }
 
 /**
@@ -381,6 +403,11 @@ export interface MapMeetup {
   panel: { start: boolean } | null;
   /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
   close?: MapClose;
+  /**
+   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
+   * Discord, never while read-only; absent otherwise.
+   */
+  mayReport?: true;
 }
 
 /**
@@ -436,6 +463,11 @@ export interface MapMax {
   postKey: string | null;
   /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
   close?: MapClose;
+  /**
+   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
+   * Discord, never while read-only; absent otherwise.
+   */
+  mayReport?: true;
 }
 
 /** A party of any kind, as the map shows it. */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 7dd10187d2508ec934956abd2c451e15bfe77f63..c66868c18dc85dde8f085e2b56da8e14e868bd57 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -108,6 +108,8 @@ describe('partyView', () => {
           remote: { offered: true, on: false },
           count: true,
         },
+        // Report… for a member who sees the forum on Discord (review W-7).
+        mayReport: true,
       },
     ]);
     expect(view.trains).toEqual([]);
@@ -215,6 +217,16 @@ describe('partyView', () => {
   });
 
   // Plan 8M-8B (X10): Group…'s choices as the caller words them, none while read-only.
+  // Review W-7, N-2: Report… for a member who sees the party's forum on Discord, not while
+  // read-only, and not from a forum they cannot see by their roles (`hidden`).
+  it('offers Report… where the member sees the forum, not while read-only nor from a hidden forum', () => {
+    expect(partyView(input([egg])).raids[0]?.mayReport).toBe(true);
+    expect(partyView(input([egg], { readOnly: true })).raids[0]).not.toHaveProperty('mayReport');
+    const hidden = partyView(input([egg], { hidden: new Set([WEST_FORUM]) })).raids[0];
+    expect(hidden?.id).toBe(egg.id);
+    expect(hidden).not.toHaveProperty('mayReport');
+  });
+
   it('gives Group…’s choices of a party with groups, none while the map is read-only', () => {
     const regroup = () => ({ refused: 'You are done with this raid.' });
     expect(partyView(input([egg], { regroup })).raids[0]?.attendance.regroup).toEqual({
@@ -287,6 +299,8 @@ describe('partyView', () => {
           remote: { offered: true, on: false },
           count: true,
         },
+        // Report… for a member who sees the forum on Discord (review W-7).
+        mayReport: true,
       },
     ]);
     expect([...view.trains, ...view.meetups]).toEqual([]);
@@ -406,6 +420,7 @@ describe('partyView', () => {
           remote: { offered: true, on: false },
           count: true,
         },
+        mayReport: true,
         // The member is not signed up: nothing of the route, nor its kind, is theirs to change.
         may: { arrange: false, clear: false, load: false, kind: false },
         panel: null,
@@ -430,6 +445,7 @@ describe('partyView', () => {
           remote: { offered: true, on: false },
           count: true,
         },
+        mayReport: true,
         // Made before 8D: no place; no information; not the member's to change.
         place: null,
         info: null,
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index d37f19c14653d3edd160c7e244bfe6dd29f8da43..5e81f7159128787c7c542d40111fc850f192ac7c 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -106,6 +106,11 @@ export interface PartyViewInput {
   memberId: string;
   /** The forums somebody keeps the member out of (`memberAccess` said `barred`). */
   barred: ReadonlySet<string>;
+  /**
+   * The forums the member cannot see on Discord by their roles, though nobody keeps them out
+   * (plan 8M-8B, review W-7): their parties are shown, without Report…. Left out: none.
+   */
+  hidden?: ReadonlySet<string>;
   now: number;
   /** `settings.timezone`, in which the page shows times. */
   zone: string;
@@ -160,6 +165,19 @@ function closeOf(party: Party, input: PartyViewInput): { close?: MapClose } {
   return { close: { ...input.closing(party), word: partyWord(party) } };
 }
 
+/**
+ * Report… of a party (plan 8M-8B, review W-7): for a member who sees its forum on Discord (not one
+ * of `hidden`; a report without the moderators' channel writes into the post), never while
+ * read-only.
+ */
+function reportOf(party: Party, input: PartyViewInput): { mayReport?: true } {
+  if (input.readOnly) return {};
+  const { forumChannelId } = party;
+  return forumChannelId !== null && input.hidden?.has(forumChannelId) === true
+    ? {}
+    : { mayReport: true };
+}
+
 /** The address of a post on Discord, as the direct messages give it (`postLink`). */
 function postLink(guildId: string, postId: string): string {
   return `https://discord.com/channels/${guildId}/${postId}`;
@@ -295,6 +313,7 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
     attendance: attendanceOf(party, input, stage === 'hatched'),
     postKey: input.postKey?.(party) ?? null,
     ...closeOf(party, input),
+    ...reportOf(party, input),
   };
 }
 
@@ -322,6 +341,7 @@ function maxOf(party: MaxParty, link: string, input: PartyViewInput): MapMax | n
     attendance: attendanceOf(party, input, true),
     postKey: input.postKey?.(party) ?? null,
     ...closeOf(party, input),
+    ...reportOf(party, input),
   };
 }
 
@@ -417,6 +437,7 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     conductor: conductorOf(party, input),
     moveRefusal: moveRefusalOf(party, input),
     ...closeOf(party, input),
+    ...reportOf(party, input),
   };
 }
 
@@ -463,6 +484,7 @@ function meetupOf(party: MeetupParty, link: string, input: PartyViewInput): MapM
     info: party.meetup.description,
     panel: meetupPanelOf(party, input),
     ...closeOf(party, input),
+    ...reportOf(party, input),
   };
 }
 
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 2a58bf081187ab24e251b096e18a2bb506e34159..7fe7663d18209e923bc417672e6fc0d2836c47dc 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1511,11 +1511,17 @@ path.highlighted {
   font-size: 12px;
 }
 
+.post-form .form-field {
+  display: flex;
+  flex-direction: column;
+}
+
 .post-form select,
 .post-form textarea {
   width: 100%;
   max-width: 100%;
   box-sizing: border-box;
+  font: inherit;
 }
 
 .post-form .to-discord {
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 6111527ef68e727719e0665a89327ff447f531d4..e8343b70d58d49716acb1e79e47d923b66f863bd 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -660,6 +660,10 @@ export function showParties(
         // Staff's Delete… (plan 8M-8B): `/delete`'s question in the place of the post.
         const party = partyById(target.dataset.closeParty);
         if (party) postForms.closeClicked(target, party);
+      } else if (target.dataset.reportParty !== undefined) {
+        // Report… (plan 8M-8B): `/report`'s form in the place of the post.
+        const party = partyById(target.dataset.reportParty);
+        if (party) postForms.reportClicked(target, party);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       } else postButton(target);
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index c66f85664f2425dc14e7c1a6320300a78fc4d998..c2c21132dfd405bff0b5be01982dcd0eea5ed834 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -471,6 +471,7 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
   it('adds who the member is in it, the group to pick, and how to get there', () => {
     const member = raid({
       mayChange: true,
+      mayReport: true,
       attendance: attendance({
         mine: { status: 'coming', group: 'B' },
         groups: [
@@ -491,19 +492,25 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
       'data-change-raid': 'r1',
     });
     const line = byClass(popup, 'map-line')[0];
-    expect(line && seen(line)).toBe('0.7 mi · Directions · Open on Discord');
+    expect(line && seen(line)).toBe('0.7 mi · Directions · Open on Discord · Report…');
   });
 
   // Plan 8M-8B (X1): staff's Delete… in the map's own line, beside Open on Discord.
-  it('offers staff Delete… in the map’s line, nobody else', () => {
+  it('offers members Report… and staff Delete… in the map’s line, nothing while read-only', () => {
     const placed = { ...context, place: undefined, located: undefined, units: 'imperial' as const };
     const close = { mayDelete: true, forum: '#west', word: 'raid' };
-    const staff = postPopup(VIEW, raid({ close }), placed);
+    const staff = postPopup(VIEW, raid({ close, mayReport: true }), placed);
     const line = byClass(staff, 'map-line')[0];
-    expect(line && seen(line)).toBe('Open on Discord · Delete…');
-    expect(line && buttonsOf(line)[0]?.attributes).toMatchObject({ 'data-close-party': 'r1' });
-    const member = byClass(postPopup(VIEW, raid(), placed), 'map-line')[0];
-    expect(member && buttonsOf(member)).toEqual([]);
+    expect(line && seen(line)).toBe('Open on Discord · Report… · Delete…');
+    expect(line && buttonsOf(line).map((one) => one.attributes)).toEqual([
+      expect.objectContaining({ 'data-report-party': 'r1' }),
+      expect.objectContaining({ 'data-close-party': 'r1' }),
+    ]);
+    const member = byClass(postPopup(VIEW, raid({ mayReport: true }), placed), 'map-line')[0];
+    expect(member && buttonsOf(member).map((one) => one.text)).toEqual(['Report…']);
+    // Not offered (read-only, or a forum the member does not see on Discord: review W-7).
+    const away = byClass(postPopup(VIEW, raid(), placed), 'map-line')[0];
+    expect(away && buttonsOf(away)).toEqual([]);
   });
 
   // Plan 8M-8B: the completion question, to the member it asked only, with its two answers.
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index ba9bf9ce2218bf8d1878e59f6c3356b802dd4145..274edf64482925d72ba8db33206444aaba3d71ff 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -575,19 +575,21 @@ function completionPart(party: MapParty, context: PostDrawContext): PageNode[] {
 
 /**
  * The map's own controls of a party beside Open on Discord (plan 8M-8B, X1, X2: the post has no
- * button for them): staff's Delete…, where the list offers it (`close`).
+ * button for them): Report… for every member (nothing while read-only), and staff's Delete…,
+ * where the list offers it (`close`).
  */
 export function mapControls(party: MapParty): PageNode[] {
-  return party.close === undefined
-    ? []
-    : [
-        {
-          tag: 'button',
-          className: 'link-button',
-          text: 'Delete…',
-          attributes: { type: 'button', 'data-close-party': party.id },
-        },
-      ];
+  const control = (text: string, data: string): PageNode => ({
+    tag: 'button',
+    className: 'link-button',
+    text,
+    attributes: { type: 'button', [data]: party.id },
+  });
+  return [
+    // For a member who sees the party's forum on Discord (review W-7; never while read-only).
+    ...(party.mayReport === true ? [control('Report…', 'data-report-party')] : []),
+    ...(party.close === undefined ? [] : [control('Delete…', 'data-close-party')]),
+  ];
 }
 
 /**
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index cf9f15c5932521f5555e00273b1ece0f520fef5b..1c1f134cccef1141b451effa3f8cf2c2436bbb47 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -1,4 +1,4 @@
-import type { MapMeet, MapParty } from '../../domain/web/party-data.js';
+import type { MapMeet, MapParty, MapReport } from '../../domain/web/party-data.js';
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
@@ -11,6 +11,8 @@ import {
   meetForm,
   regroupBody,
   regroupForm,
+  reportBody,
+  reportForm,
   sendPostForm,
   type FormTimes,
   type PostFormBody,
@@ -218,6 +220,18 @@ export function postFormsUi(deps: PostFormsDeps) {
       );
     },
 
+    /** Report…: `/report`'s form, once the server said it may open (`GET …/report`), or why not. */
+    reportClicked(button: HTMLButtonElement, party: MapParty): void {
+      void open(button, 'report', party, async () => {
+        const report = await asked<MapReport>(party.id, 'report');
+        if ('refused' in report) return report;
+        return {
+          form: reportForm(party, report),
+          bodyOf: (fields) => reportBody(fields.reason),
+        };
+      });
+    },
+
     /** Meet…: its form, from what the server offers now (`GET …/meet`), or why not. */
     meetClicked(button: HTMLButtonElement, party: MapParty): void {
       void open(button, 'meet', party, async () => {
diff --git a/src/web/client/post-forms.test.ts b/src/web/client/post-forms.test.ts
index a9badad63bd3118138d6a1c800be090dbf93ae2c..ace0d0ed3f8d99358fdec3fa16f40eb0b0522d94 100644
--- a/src/web/client/post-forms.test.ts
+++ b/src/web/client/post-forms.test.ts
@@ -10,6 +10,8 @@ import {
   meetForm,
   regroupBody,
   regroupForm,
+  reportBody,
+  reportForm,
   sendPostForm,
   showsParty,
   type FormTimes,
@@ -225,6 +227,33 @@ describe("staff's Delete… on the map (plan 8M-8B)", () => {
   });
 });
 
+describe('Report… on the map (plan 8M-8B)', () => {
+  it("asks what is wrong in /report's words, as long as its form takes", () => {
+    const form = reportForm(raid, {
+      title: 'Report this raid to the moderators',
+      label: 'What is wrong?',
+      placeholder: 'Only the moderators read this.',
+      maxLength: 1000,
+    });
+    expect(form.attributes).toMatchObject({ 'data-form': 'report', 'data-party': 'r1' });
+    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe(
+      'Report this raid to the moderators',
+    );
+    expect(all(form).find((one) => one.className === 'form-label')?.text).toBe('What is wrong?');
+    expect(all(form).find((one) => one.tag === 'textarea')?.attributes).toEqual({
+      name: 'reason',
+      maxlength: '1000',
+      placeholder: 'Only the moderators read this.',
+      rows: '4',
+    });
+  });
+
+  it('sends the reason as typed: the server reads it as the form does', () => {
+    expect(reportBody(' A front yard. ')).toEqual({ body: { reason: ' A front yard. ' } });
+    expect(reportBody(undefined)).toEqual({ body: { reason: '' } });
+  });
+});
+
 describe('what a form does after its answer (reviews W-2, W-5)', () => {
   it('stays on a refusal, unless its choices may be stale; closes when done or over', () => {
     expect(formStep({ ok: false, gone: false }, {})).toBe('stay');
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
index e1991a8ed3596c125b7ed93c5fd326947c793c06..1b71634d0d069ea44a8dcf99b77fe410d81cf77d 100644
--- a/src/web/client/post-forms.ts
+++ b/src/web/client/post-forms.ts
@@ -1,4 +1,10 @@
-import type { MapClose, MapMeet, MapParty, MapRegroup } from '../../domain/web/party-data.js';
+import type {
+  MapClose,
+  MapMeet,
+  MapParty,
+  MapRegroup,
+  MapReport,
+} from '../../domain/web/party-data.js';
 import { groupLine } from '../../render/group-words.js';
 import { MEET_TIME_NOW, meetTimeLabel, NO_MEETING_TIME } from '../../render/meet-words.js';
 import {
@@ -254,6 +260,36 @@ export function closeBody(picked: string | undefined): PostFormBody {
     : { text: 'Pick Archive post or Delete post first.' };
 }
 
+/**
+ * Report… (plan 8M-8B, X2), as `/report`'s form: its title and its one field, "What is wrong?",
+ * as long as the form takes, in the words the server sent when it opened.
+ */
+export function reportForm(party: MapParty, report: MapReport): PageNode {
+  return dialogForm('report', party.id, report.title, [
+    {
+      tag: 'label',
+      className: 'form-field',
+      children: [
+        { tag: 'span', className: 'form-label', text: report.label },
+        {
+          tag: 'textarea',
+          attributes: {
+            name: 'reason',
+            maxlength: String(report.maxLength),
+            placeholder: report.placeholder,
+            rows: '4',
+          },
+        },
+      ],
+    },
+  ]);
+}
+
+/** The body of a report: the reason as typed (the server refuses white space alone, uncounted). */
+export function reportBody(reason: string | undefined): PostFormBody {
+  return { body: { reason: reason ?? '' } };
+}
+
 /** A body to send, or what the member must do first (the page's own words). */
 export type PostFormBody = { body: Record<string, unknown> } | { text: string };
 
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 64cf3389dda1c4ba4ef878e87e267f5d5894cf3a..44bc238e0a29ea2a318c437fb014355d45c78398 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -57,7 +57,8 @@ export function formControls(root: ParentNode, on: boolean): void {
     'button[data-report], button[data-change-raid], button[data-spawn], button[data-show-raid], ' +
       'button[data-new-train], button[data-route-train], button[data-move-train], ' +
       'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
-      'button[data-regroup], button[data-meet], button[data-close-party]',
+      'button[data-regroup], button[data-meet], button[data-close-party], ' +
+      'button[data-report-party]',
   )) {
     button.disabled = !on;
   }
diff --git a/src/web/party-report.test.ts b/src/web/party-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..849c5b7127b8ab192975499555f068e59683852b
--- /dev/null
+++ b/src/web/party-report.test.ts
@@ -0,0 +1,206 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { reportedMeetup } from '../../test/support/reports-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  postWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { REPORT_COMMAND, REPORT_THROTTLE } from '../commands/parties/report.js';
+import { Throttles } from '../discord/throttle.js';
+import type { MapReport, PartiesView, PressAnswer } from '../domain/web/party-data.js';
+import { BARRED_FRESH_MS } from './party-viewers.js';
+import type { PostWebContext } from './post-control-routes.js';
+
+const STAFF_ROLE = '300000000000000009';
+
+/**
+ * A party on the map that members report to the moderators: Alice's meetup at the Little Free
+ * Library, with the moderators' channel (`reportedMeetup`), or `made` with its own context; Alice
+ * and Bob members of the server, the web server's clock the parties' own.
+ */
+function reporting(
+  made: Awaited<ReturnType<typeof reportedMeetup>> | Awaited<ReturnType<typeof reportedRaid>>,
+  ctx: PostWebContext,
+  throttles = new Throttles(),
+) {
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    posts: postWebWith(ctx, { staffRoles: () => [STAFF_ROLE] }),
+  });
+  web.clock.now = PARTY_NOW;
+  const url = `/s/${FAKE_GUILD_ID}/api/parties/${made.party.id}/report`;
+  const open = async (userId = BOB, name = 'Bob') => {
+    const answer = await web.app.inject({
+      url,
+      headers: { cookie: await web.loggedIn(userId, name) },
+    });
+    return { status: answer.statusCode, json: answer.json<MapReport & { error?: string }>() };
+  };
+  const send = async (body: unknown, userId = BOB, name = 'Bob') => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url,
+      headers: { ...(await web.posting(userId, name)), 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
+  };
+  return { web, open, send, throttles };
+}
+
+/** A meetup reported to the moderators' channel. */
+async function meetup(throttles?: Throttles) {
+  const made = await reportedMeetup();
+  const ctx = { partyService: made.service, reports: made.reports };
+  return { made, ...reporting(made, ctx, throttles) };
+}
+
+describe('reporting a party to the moderators on the map (plan 8M-8B)', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("opens the report's form with /report's words", async () => {
+    const map = await meetup();
+    web = map.web;
+    expect(await map.open()).toEqual({
+      status: 200,
+      json: {
+        title: 'Report this meetup to the moderators',
+        label: 'What is wrong?',
+        placeholder: 'Only the moderators read this.',
+        maxLength: 1000,
+      },
+    });
+  });
+
+  it("sends the reason to the moderators' channel as /report does, and refuses a second one", async () => {
+    const map = await meetup();
+    web = map.web;
+    const sent = await map.send({ reason: 'It is somebody’s front yard.' });
+    expect(sent).toEqual({ status: 200, json: { ok: true, text: 'Sent to the moderators.' } });
+    await map.made.reports.flush();
+    const post = map.made.gateway.messagesIn(MOD_CHANNEL).at(-1)?.message;
+    expect(JSON.stringify(post)).toContain('somebody’s front yard');
+    expect(JSON.stringify(post)).toContain('Bob');
+    // Asked before the form opens, as /report asks it (`refuseReportedBefore`).
+    expect(await map.open()).toEqual({
+      status: 422,
+      json: { error: 'You already reported this.' },
+    });
+    // An answer, as the form's Submit says it (not a refusal).
+    expect((await map.send({ reason: 'Again.' })).json).toEqual({
+      ok: true,
+      text: 'You already reported this.',
+    });
+  });
+
+  it("puts the reason into the post where there is no moderators' channel, pinging the staff roles", async () => {
+    const made = await reportedRaid();
+    const { ctx } = createTestContext({
+      partyService: made.service,
+      attendance: made.attendance,
+      parties: made.store,
+      regions: made.regions,
+    });
+    const map = reporting(made, ctx);
+    web = map.web;
+    const sent = await map.send({ reason: 'A duplicate of the other raid here.' });
+    expect(sent.json).toEqual({
+      ok: true,
+      text: 'I have put your report into the post, for the moderators.',
+    });
+    await made.service.flush();
+    expect(made.said().join('\n')).toContain(`<@&${STAFF_ROLE}>`);
+  });
+
+  it("refuses a reason of white space alone in /report's words, counting nothing", async () => {
+    const map = await meetup();
+    web = map.web;
+    expect(await map.send({ reason: '   ' })).toEqual({
+      status: 422,
+      json: { ok: false, text: 'Say what is wrong, so that the moderators know what to look at.' },
+    });
+    expect(map.throttles.size).toBe(0);
+    expect((await map.send({ reason: 'x'.repeat(1001) })).status).toBe(400);
+  });
+
+  it("counts in /report's window, and refuses to open the form while it is full", async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < REPORT_THROTTLE.uses; n++) {
+      throttles.use(REPORT_COMMAND, BOB, REPORT_THROTTLE, PARTY_NOW);
+    }
+    const map = await meetup(throttles);
+    web = map.web;
+    const full = { error: 'You can use /report again in 60 minutes.' };
+    expect(await map.open()).toEqual({ status: 429, json: full });
+    expect(await map.send({ reason: 'Somebody’s yard.' })).toEqual({ status: 429, json: full });
+  });
+
+  // Review W-7 (Matt to confirm with C1): a report writes into the post where there is no
+  // moderators' channel, so only a member who sees the forum on Discord may report from the map.
+  it("offers Report… only to a member who sees the party's forum on Discord, and refuses anybody else", async () => {
+    const map = await meetup();
+    web = map.web;
+    const listed = async (userId: string, name: string) => {
+      const answer = await map.web.app.inject({
+        url: `/s/${FAKE_GUILD_ID}/api/parties`,
+        headers: { cookie: await map.web.loggedIn(userId, name) },
+      });
+      return answer.json<PartiesView>().meetups[0];
+    };
+    expect((await listed(BOB, 'Bob'))?.mayReport).toBe(true);
+    map.made.gateway.shutOut(WEST_FORUM, BOB);
+    // What Discord said of the forum is used for a minute.
+    map.web.clock.now += BARRED_FRESH_MS;
+    // Shown (the map crosses region roles), but not his to report.
+    const hidden = await listed(BOB, 'Bob');
+    expect(hidden?.id).toBe(map.made.party.id);
+    expect(hidden).not.toHaveProperty('mayReport');
+    expect((await map.open()).status).toBe(403);
+    expect((await map.send({ reason: 'Somebody’s yard.' })).status).toBe(403);
+    expect(map.throttles.size).toBe(0);
+  });
+
+  it('gives the use back when the moderators could not be told, as the router does', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < REPORT_THROTTLE.uses - 1; n++) {
+      throttles.use(REPORT_COMMAND, BOB, REPORT_THROTTLE, PARTY_NOW);
+    }
+    const map = await meetup(throttles);
+    web = map.web;
+    map.made.gateway.failing.set('sendMessage', new Error('Discord is away'));
+    expect(await map.send({ reason: 'Somebody’s yard.' })).toEqual({
+      status: 422,
+      json: { ok: false, text: 'I could not send your report to the moderators. Try again later.' },
+    });
+    map.made.gateway.failing.delete('sendMessage');
+    expect((await map.send({ reason: 'Somebody’s yard.' })).json).toEqual({
+      ok: true,
+      text: 'Sent to the moderators.',
+    });
+  });
+
+  it('refuses a member kept out of the forum, before anything is read or counted', async () => {
+    const map = await meetup();
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([BOB]));
+    expect((await map.open()).status).toBe(403);
+    expect((await map.send({ reason: 'Somebody’s yard.' })).status).toBe(403);
+    expect(map.throttles.size).toBe(0);
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 53c6f12e85288467d8baac83c95a51976b9a43f5..7602bb1887c2163fb4b1c2b049ca8bac7296267d 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -333,13 +333,20 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     guildId: string,
     own: { row: number; parties: readonly Party[] },
     memberId: string,
-    viewer: { readOnly: boolean; barred: Set<string>; standing: MemberStanding | undefined },
+    viewer: {
+      readOnly: boolean;
+      barred: Set<string>;
+      hidden?: Set<string>;
+      standing: MemberStanding | undefined;
+    },
   ): PartyViewInput => ({
     guildId,
     guildRow: own.row,
     parties: own.parties,
     memberId,
     barred: viewer.barred,
+    // Report… only from a forum the member sees on Discord (review W-7).
+    ...(viewer.hidden === undefined ? {} : { hidden: viewer.hidden }),
     now: deps.now(),
     zone: parties.zone,
     readOnly: viewer.readOnly,
diff --git a/src/web/party-viewers.test.ts b/src/web/party-viewers.test.ts
index 10c6391f87c2a1df9a3f43a4b72d32b854a5e426..82ca40e671e54712286459963da0aee97e154ea7 100644
--- a/src/web/party-viewers.test.ts
+++ b/src/web/party-viewers.test.ts
@@ -36,15 +36,19 @@ describe('PartyViewers', () => {
     const { gateway, viewers } = viewersWith();
     gateway.shutOut(EAST_FORUM, ALICE);
     gateway.barred.set(WEST_FORUM, new Set([BOB]));
+    // A forum she cannot see by her roles is shown (the map crosses region roles), and said
+    // `hidden` (review W-7: no report to the moderators from it).
     expect(await viewers.viewer(FAKE_GUILD_ID, ALICE, FORUMS)).toEqual({
       kind: 'member',
       readOnly: false,
       barred: new Set(),
+      hidden: new Set([EAST_FORUM]),
     });
     expect(await viewers.viewer(FAKE_GUILD_ID, BOB, FORUMS)).toEqual({
       kind: 'member',
       readOnly: false,
       barred: new Set([WEST_FORUM]),
+      hidden: new Set(),
     });
   });
 
@@ -80,6 +84,7 @@ describe('PartyViewers', () => {
       kind: 'member',
       readOnly: true,
       barred: new Set([EAST_FORUM]),
+      hidden: new Set(),
     });
     expect(entries.some((entry) => entry.msg?.toString().includes('member'))).toBe(true);
     // Nobody else learns anything; nor does she once it is long ago.
@@ -95,6 +100,7 @@ describe('PartyViewers', () => {
       kind: 'member',
       readOnly: true,
       barred: new Set(FORUMS),
+      hidden: new Set(),
     });
   });
 
@@ -115,6 +121,7 @@ describe('PartyViewers', () => {
       kind: 'member',
       readOnly: true,
       barred: new Set(three),
+      hidden: new Set(),
     });
     expect(asked).toEqual([`${WEST_FORUM}:${ALICE}`]);
     expect(warnings()).toBe(1);
diff --git a/src/web/party-viewers.ts b/src/web/party-viewers.ts
index be5aec7d0ad1f30bf1d31f736b2b5c91950a9f67..2f1e98474a902caa39ceeb48db68eb1ebccffb00 100644
--- a/src/web/party-viewers.ts
+++ b/src/web/party-viewers.ts
@@ -28,6 +28,11 @@ export type PartyViewer =
       kind: 'member';
       readOnly: boolean;
       barred: Set<string>;
+      /**
+       * The forums they cannot see on Discord by their roles, though nobody keeps them out
+       * (`hidden`; plan 8M-8B, review W-7): their parties are shown, but not theirs to report.
+       */
+      hidden: Set<string>;
       standing: MemberStanding | undefined;
     };
 
@@ -61,7 +66,10 @@ export class PartyViewers {
   /** `<guild>:<user>`: when Discord last said they are a member. */
   private readonly seen = new BoundedMap<string, number>(KEPT);
   /** `<forum>:<user>`: what Discord said last, and when. */
-  private readonly forums = new BoundedMap<string, { barred: boolean; at: number }>(KEPT);
+  private readonly forums = new BoundedMap<
+    string,
+    { barred: boolean; hidden: boolean; at: number }
+  >(KEPT);
 
   constructor(private readonly options: PartyViewersOptions) {}
 
@@ -107,13 +115,15 @@ export class PartyViewers {
     if (member.kind !== 'member') return member;
     let { readOnly } = member;
     const barred = new Set<string>();
+    const hidden = new Set<string>();
     for (const forumId of new Set(forumIds)) {
       // Once Discord failed in this request it is not asked again in it (one warning).
       const answer = await this.barredFrom(forumId, userId, readOnly);
       if (answer.unreachable) readOnly = true;
       if (answer.barred) barred.add(forumId);
+      else if (answer.hidden) hidden.add(forumId);
     }
-    return { kind: 'member', readOnly, barred, standing: member.standing };
+    return { kind: 'member', readOnly, barred, hidden, standing: member.standing };
   }
 
   /**
@@ -125,24 +135,28 @@ export class PartyViewers {
     forumId: string,
     userId: string,
     unreachable: boolean,
-  ): Promise<{ barred: boolean; unreachable: boolean }> {
+  ): Promise<{ barred: boolean; hidden: boolean; unreachable: boolean }> {
     const { forums, log, now } = this.options;
     const key = `${forumId}:${userId}`;
     const kept = this.forums.get(key);
     if (kept && now() - kept.at < BARRED_FRESH_MS)
-      return { barred: kept.barred, unreachable: false };
+      return { barred: kept.barred, hidden: kept.hidden, unreachable: false };
     const lately = kept !== undefined && now() - kept.at < MEMBER_SEEN_MS;
-    if (unreachable) return { barred: lately ? kept.barred : true, unreachable: true };
+    // Not asked: what Discord said lately, or barred (hidden, to be safe).
+    const guessed = { barred: lately ? kept.barred : true, hidden: lately && kept.hidden };
+    if (unreachable) return { ...guessed, unreachable: true };
     try {
-      const barred = (await forums.memberAccess(forumId, userId)) === 'barred';
-      this.forums.set(key, { barred, at: now() });
-      return { barred, unreachable: false };
+      const access = await forums.memberAccess(forumId, userId);
+      const barred = access === 'barred';
+      const hidden = access === 'hidden';
+      this.forums.set(key, { barred, hidden, at: now() });
+      return { barred, hidden, unreachable: false };
     } catch (err) {
       log.warn(
         { err, forum: forumId, user: userId },
         'could not ask whether a member on the web pages is kept out of a forum',
       );
-      return { barred: lately ? kept.barred : true, unreachable: true };
+      return { ...guessed, unreachable: true };
     }
   }
 }
diff --git a/src/web/post-control-routes.ts b/src/web/post-control-routes.ts
index 4afb1e438e1f15cbf10444cb313074bbdde9d5a8..e83038efe30dc708ab873b2a5bd70e03cc426769 100644
--- a/src/web/post-control-routes.ts
+++ b/src/web/post-control-routes.ts
@@ -9,13 +9,24 @@ import {
   type CloseOutcome,
 } from '../commands/parties/delete.js';
 import { movedWords } from '../commands/parties/group-dialogs.js';
+import {
+  NO_REASON,
+  refuseReportedBefore,
+  REPORT_COMMAND,
+  REPORT_THROTTLE,
+  reportAnswer,
+  reportFormWords,
+} from '../commands/parties/report.js';
+import { UserError } from '../discord/errors.js';
+import { MAX_REPORT_REASON } from '../domain/moderation/reports.js';
 import { MEET_THROTTLE, meetingWords } from '../commands/parties/meet.js';
 import { meetRefusalOf, meetSubmitRefusal } from '../commands/parties/meet-dialog.js';
 import { ACTION_THROTTLE, outcomeWords, partyOver } from '../commands/parties/reply.js';
 import { STAFF_ONLY } from '../discord/guards.js';
 import type { MemberStanding } from '../discord/member-directory.js';
-import { attendeeOf, isGroupId, type Party } from '../domain/party/party.js';
-import type { MapMeet, PressAnswer } from '../domain/web/party-data.js';
+import type { MemberAccess } from '../discord/party-gateway.js';
+import { attendeeOf, isGroupId, partyWord, type Party } from '../domain/party/party.js';
+import type { MapMeet, MapReport, PressAnswer } from '../domain/web/party-data.js';
 import { meetOnTheMap } from '../render/meet-dialog.js';
 import { PARTY_KIND } from '../render/party-controls.js';
 import { unplain } from '../render/text.js';
@@ -45,14 +56,19 @@ import type { WebDeps } from './server.js';
  */
 
 /**
- * What staff's Delete… reads and calls on the map (plan 8M-8B): exactly what `/delete`'s dialog
- * uses (`closePartyAs`).
+ * What staff's Delete… and the report to the moderators read and call on the map (plan 8M-8B):
+ * exactly what `/delete`'s dialog (`closePartyAs`) and `/report`'s form use.
  */
 export type PostWebContext = Pick<AppContext, 'partyService' | 'reports'>;
 
 /** What the forms of the post's controls need beyond the parties' own (`PartyWebDeps`). */
 export interface PostWebDeps {
   ctx: PostWebContext;
+  /**
+   * The ids of a server's staff roles (`managementRoleIdsOf`), which a report pings where the
+   * server has no moderators' channel, as `/report` pings them.
+   */
+  staffRoles(guildId: string): string[];
 }
 
 /** Group…'s moves one address may send in a minute, whoever sends them. */
@@ -99,6 +115,12 @@ const meetBodySchema = z
 /** Staff's closings one address may send in a minute, whoever sends them (a clean-up is many). */
 export const CLOSE_PER_ADDRESS_MINUTE = 30;
 
+/** Reports one address may open and send in a minute, whoever sends them. */
+export const REPORT_PER_ADDRESS_MINUTE = 30;
+
+/** The body of a report: the reason, as `/report`'s form takes it (white space is refused). */
+const reportBodySchema = z.object({ reason: z.string().max(MAX_REPORT_REASON) }).strict();
+
 /** The body of Delete…: archive the post or delete it, as `/delete`'s dialog asks. */
 const closeBodySchema = z.object({ removal: z.enum(['archive', 'delete']) }).strict();
 
@@ -107,7 +129,14 @@ type ControlRequest = FastifyRequest<{ Params: { guild: string; party: string }
 
 /** Who writes, as Discord has them now, and the party they write to, as the store has it. */
 type Target =
-  { member: Member; standing: MemberStanding; party: Party; row: number } | { sent: FastifyReply };
+  | { member: Member; standing: MemberStanding; party: Party; row: number; access: Access }
+  | { sent: FastifyReply };
+
+/**
+ * How the member stands to the party's forum (`memberAccess`; none for a party without one):
+ * `hidden` is shown on the map, but not theirs to report (review W-7).
+ */
+type Access = MemberAccess | undefined;
 
 export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
   const { parties, sessions } = deps;
@@ -141,7 +170,7 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
     reply: FastifyReply,
     userId: string,
     doing: string,
-  ): Promise<{ party: Party; row: number } | { sent: FastifyReply }> => {
+  ): Promise<{ party: Party; row: number; access: Access } | { sent: FastifyReply }> => {
     const { guild, party: partyId } = request.params;
     const row = await parties.guilds.idFor(guild);
     const party = parties.store.get(partyId);
@@ -149,8 +178,9 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const gone: PressAnswer = { ok: false, text: partyOver() };
       return { sent: reply.code(409).send(gone) };
     }
+    let access: Access;
     try {
-      const access =
+      access =
         party.forumChannelId === null
           ? undefined
           : await parties.forums.memberAccess(party.forumChannelId, userId);
@@ -158,7 +188,7 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
     } catch (err) {
       return { sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing) };
     }
-    return { party, row };
+    return { party, row, access };
   };
 
   /**
@@ -169,7 +199,9 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
     request: ControlRequest,
     reply: FastifyReply,
     doing: string,
-  ): Promise<{ userId: string; party: Party; row: number } | { sent: FastifyReply }> => {
+  ): Promise<
+    { userId: string; party: Party; row: number; access: Access } | { sent: FastifyReply }
+  > => {
     void reply.header('cache-control', 'private, no-store');
     const session = await sessions.of(request, reply);
     if (!session) return { sent: sendFailure(request, reply, 401) };
@@ -367,6 +399,92 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return reply.code(CLOSE_STATUS[outcome.kind]).send(answer);
     },
   );
+
+  // Report… (plan 8M-8B, X2): `/report`'s form on the map, for every member. Its opening (`GET`)
+  // asks what `/report` asks before its form (uncounted: its window, `REPORT_WINDOW`, and whether
+  // the member's reason is on the open report already, `refuseReportedBefore`) and answers its
+  // words (`reportFormWords`); its Submit (`POST`) refuses a reason of white space alone uncounted
+  // (the forms' guard), counts once in `/report`'s window, and reports as the form's Submit does
+  // (`reportParty`, `reportAnswer`): without the moderators' channel into the post, pinging the
+  // server's staff roles (`PostWebDeps.staffRoles`). A report the moderators could not be told of
+  // gives the use back. One per-address limit for both.
+  const reportLimiter = new RateLimiter({ uses: REPORT_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const reportWindow = { command: REPORT_COMMAND } as const;
+  scope.get(
+    '/api/parties/:party/report',
+    { onRequest: limitedPerAddress(reportLimiter, { now: deps.now }) },
+    async (request: ControlRequest, reply) => {
+      const found = await reader(request, reply, 'opened a report');
+      if ('sent' in found) return found.sent;
+      // Only from a forum the member sees on Discord (review W-7).
+      if (found.access === 'hidden') return sendFailure(request, reply, 403);
+      const { userId, party } = found;
+      const full = throttledOnTheMap(deps, reply, reportWindow, userId, REPORT_THROTTLE, {
+        count: false,
+      });
+      if (full) return full;
+      try {
+        await refuseReportedBefore(deps.posts.ctx, { kind: 'party', partyId: party.id }, userId);
+      } catch (err) {
+        if (!(err instanceof UserError)) throw err;
+        return reply.code(422).send({ error: err.message });
+      }
+      const view: MapReport = reportFormWords(partyWord(party));
+      return view;
+    },
+  );
+  scope.post(
+    '/api/parties/:party/report',
+    {
+      onRequest: [
+        limitedPerAddress(reportLimiter, { now: deps.now }),
+        postGuard(sessions, deps.settings.publicUrl),
+      ],
+    },
+    async (request: ControlRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = reportBodySchema.safeParse(request.body ?? {});
+      if (!body.success) return sendFailure(request, reply, 400);
+      const { reason } = body.data;
+      const { userId } = session;
+      const { guild } = request.params;
+      const found = await target(request, reply, userId, 'reported a party');
+      if ('sent' in found) return found.sent;
+      if (found.access === 'hidden') return sendFailure(request, reply, 403);
+      if (reason.trim() === '') {
+        const refused: PressAnswer = { ok: false, text: NO_REASON };
+        return reply.code(422).send(refused);
+      }
+      const throttled = throttledOnTheMap(deps, reply, reportWindow, userId, REPORT_THROTTLE);
+      if (throttled) return throttled;
+      const word = partyWord(found.party);
+      let text: string;
+      try {
+        text = await countedOnTheMap(deps, reportWindow, userId, REPORT_THROTTLE, async () =>
+          reportAnswer(
+            await deps.posts.ctx.reports.reportParty({
+              serverId: guild,
+              partyId: found.party.id,
+              reporter: { id: userId, name: found.member.name },
+              reason,
+              roleIds: deps.posts.staffRoles(guild),
+            }),
+            word,
+          ),
+        );
+      } catch (err) {
+        if (!(err instanceof UserError)) throw err;
+        noted(request, userId, 'report', 'refused');
+        const refused: PressAnswer = { ok: false, text: unplain(err.message) };
+        return reply.code(err.message === partyOver() ? 409 : 422).send(refused);
+      }
+      noted(request, userId, 'report', 'sent');
+      const answer: PressAnswer = { ok: true, text: unplain(text) };
+      return answer;
+    },
+  );
 }
 
 /** The status of each outcome of a closing. */
diff --git a/test/support/web.ts b/test/support/web.ts
index 8c9ea0dfe4addd7836806a79b70d60709aa3676a..ae861a6b7fa8207d57b9120d5061c84b7783b16d 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -308,25 +308,28 @@ export function partyWebWith(
 }
 
 /**
- * Staff's Delete… on the map over a test's context (`createTestContext` with the party service of
- * `partyServiceWith` or `reportedRaid`, and its `reports`), as the bot wires it (plan 8M-8B).
- * Pass as `posts`.
+ * Staff's Delete… and the report to the moderators on the map over a test's context
+ * (`createTestContext` with the party service of `partyServiceWith` or `reportedRaid`, and its
+ * `reports`; or `reportsWith`'s service and reports), as the bot wires it (plan 8M-8B). Pass as
+ * `posts`. `staffRoles` gives the server's staff roles a report pings where there is no
+ * moderators' channel (none by default).
  */
 export function postWebWith(
   ctx: PostWebContext,
   options: Partial<Omit<PostWebDeps, 'ctx'>> = {},
 ): PostWebDeps {
-  return { ctx, ...options };
+  return { ctx, staffRoles: () => [], ...options };
 }
 
-/** Nothing is closed on the map: a test that does passes `postWebWith`. */
+/** Nothing is closed or reported on the map: a test that does passes `postWebWith`. */
 const NO_POSTS: PostWebDeps = {
   ctx: new Proxy({} as PostWebContext, {
     get(_target, property) {
       if (typeof property === 'symbol' || property === 'then') return undefined;
-      throw new Error('no closing in this test: give postWebWith');
+      throw new Error('no closing or reports in this test: give postWebWith');
     },
   }),
+  staffRoles: () => [],
 };
 
 /**
````

### Task 7: 8M-8B task 7: docs, the controls table and the staging checklist

Prototype commit: `994cca9c6501f2aa4eeb91e339cafed1ba7cbc94`

web.md: the list's new fields (count, asked, regroup, staff, close; a
raid's mayChange by Discord's rule; mayReport and the hidden forums,
onlyNewGroup), the presses +1, -1 and answer, the
controls table (only Split..., Manage... beyond the conductor and the
kind's line, the route editor and a new group left to Discord; the
map's line's Report... and Delete...; the completion question; the
view's version), a section "The post's controls as forms" (the routes,
their checks and windows, what moved out of the Discord handlers, the
page), the addresses and rate limits; the raid change's 403 and "the
map ... asks a sign-up or staff" go (X5, C1 provisional), the meetups'
maker-or-staff rule kept and marked provisional (C2), the train kind
menu named 8M-8C's (X9). parties-and-posts.md, moderation.md and
testing.md say what the map shares with the dialogs and how it is
tested. The staging checklist 2026-10-26-phase-8m8b-staging.md, with the
review's steps: the one-group case of Group..., a stale move, a popup
opened during a close, a moderator who lost the role, a hidden member,
a report not sent.

**Files:**

```
 docs/architecture/moderation.md                         |  4 ++--
 docs/architecture/parties-and-posts.md                  |  4 ++--
 docs/architecture/testing.md                            |  1 +
 docs/architecture/web.md                                | 38 ++++++++++++++++++++++++++------------
 docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md | 70 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 5 files changed, 101 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 994cca9c6501f2aa4eeb91e339cafed1ba7cbc94 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8B task 7: docs, the controls table and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/moderation.md b/docs/architecture/moderation.md
index 6479a68f2a93e142f83fedfed84c663579d1d77e..ffe07a2163b43c38660d83b55cdab23f4f32b671 100644
--- a/docs/architecture/moderation.md
+++ b/docs/architecture/moderation.md
@@ -4,7 +4,7 @@ Members report a party or a single message to the moderators privately, the mode
 
 ## Reporting
 
-- `/report` (every member, staff and the party's maker too; in a party's post, `requireParty`) opens a form for the reason (`partyReportForm`, "What is wrong?", required, at most `MAX_REPORT_REASON` 1,000; `report:<party id>:party`). "Report to moderators" is a message command (`reportMessageCommand`, `src/commands/parties/report-message.ts`; `discord-framework.md`): on a party's post, a copy of it (`mirrorMessages`) or its link line in the region's channel (`partyOfMessage`) it opens the same form; on any other message of the bot it answers `NOTHING_TO_REPORT` ("Nothing to report there."); on anybody else's message (a member's chat in a party's post too) it keeps what Discord sent of the message (of a forward, which has no text or files of its own, those of its first `messageSnapshots`, marked `forwarded`: "**What it said** (forwarded)") under a token for half an hour (`PendingRequests`) and opens `report:<token>:message`. The forms' handler is `reportControls` (`src/commands/parties/report.ts`): a reason of white space alone is refused by a guard, uncounted; every submit counts in `/report`'s window (`REPORT_THROTTLE`, five an hour, `as: 'report'`, `REPORT_WINDOW` in `report-limit.ts`, which both files read as they load), whichever way the form was opened. Before a form opens (plan 8S-3, staging of 8S-2: the reason typed was lost) `/report` and the Apps menu refuse what the submit would: that window full (`checks`, counting nothing: `discord-framework.md`), and a member whose reason is on the open report of the party or message already (`ModerationReports.reportedBefore` over `ReportStore.openReport(key)`, a quick read raced against `checkTimeoutMs`, a second by default, so that the form still opens within Discord's three seconds: false without the moderators' channel, for a report stranded without its post, and when the read fails or is slower, logged; `REPORT_ALREADY`); the submit's checks stay. A form of the member's old `/delete` (`party:<id>:delete`), open across the deploy, is taken as a report.
+- `/report` (every member, staff and the party's maker too; in a party's post, `requireParty`) opens a form for the reason (`partyReportForm`, "What is wrong?", required, at most `MAX_REPORT_REASON` 1,000; `report:<party id>:party`). "Report to moderators" is a message command (`reportMessageCommand`, `src/commands/parties/report-message.ts`; `discord-framework.md`): on a party's post, a copy of it (`mirrorMessages`) or its link line in the region's channel (`partyOfMessage`) it opens the same form; on any other message of the bot it answers `NOTHING_TO_REPORT` ("Nothing to report there."); on anybody else's message (a member's chat in a party's post too) it keeps what Discord sent of the message (of a forward, which has no text or files of its own, those of its first `messageSnapshots`, marked `forwarded`: "**What it said** (forwarded)") under a token for half an hour (`PendingRequests`) and opens `report:<token>:message`. The forms' handler is `reportControls` (`src/commands/parties/report.ts`): a reason of white space alone is refused by a guard, uncounted; every submit counts in `/report`'s window (`REPORT_THROTTLE`, five an hour, `as: 'report'`, `REPORT_WINDOW` in `report-limit.ts`, which both files read as they load), whichever way the form was opened. Before a form opens (plan 8S-3, staging of 8S-2: the reason typed was lost) `/report` and the Apps menu refuse what the submit would: that window full (`checks`, counting nothing: `discord-framework.md`), and a member whose reason is on the open report of the party or message already (`ModerationReports.reportedBefore` over `ReportStore.openReport(key)`, a quick read raced against `checkTimeoutMs`, a second by default, so that the form still opens within Discord's three seconds: false without the moderators' channel, for a report stranded without its post, and when the read fails or is slower, logged; `REPORT_ALREADY`); the submit's checks stay. A form of the member's old `/delete` (`party:<id>:delete`), open across the deploy, is taken as a report. The live map reports a party the same way (plan 8M-8B, Report… in the map's line, `web.md`): its opening asks what `/report` asks before its form, uncounted, and answers the form's words (`reportFormWords`); its Submit counts in `/report`'s window and calls `reportParty` and `reportAnswer`, pinging the staff roles of `managementRoleIdsOf(guild)` without the moderators' channel (`managementRoleIds(interaction)` calls it).
 - `ModerationReports` (`src/services/moderation-reports.ts`, `ctx.reports`) keeps reports in `ReportStore` (`ReportRepository`, migration 022; twin `MemoryReports`, both run `reportCases`). `reportParty` / `reportMessage`: one open report per party and per message (`reportTargetKey`, the unique `openKey`): a reason opens it, or joins the open one (`added`; its post edited, never sent again), unless the member has one there (`already`: "You already reported this."). A reason joins a report only while it is open: the repository finds the open report by its key and locks it by its id (a lock on the key's index too would deadlock with a decision, which changes the key), then inserts the reason (a second one of the same member is `already`); a report decided meanwhile is followed by a new one. A report opened is posted first, then recorded (`setReportPost`), then drawn anew when anything changed while the post was on its way (a reason more; its party ended, looked at once more); a post that fails takes the report back (`not-sent`). The post is always drawn from the report as it is kept: `show(reportId)` reads it just before each edit, one edit at a time per report (a promise tail in a `BoundedMap`), so that an older edit never lands after a newer one. A report left without its post for five minutes (the bot stopped in between) is opened anew by the next reason; the reasons of a report that is gone (stranded, its post failed, or forgotten by the sweep) are carried over to the next report of its subject (`orphans`, in memory: a restart loses them, which is accepted), so that nobody told "Sent" loses their reason while the bot runs. The sweep (`ModerationReports.sweep`, with the appeals' sweep of `PartySchedulerOptions.requests`, so also at start) forgets reports never posted for five minutes and ends the open reports of parties that are over (the bot stopped before the listener saw the end). The subject is checked against its schema before it is kept (`reportSubject`). The reporter is told "Sent to the moderators." and nothing more; nothing is said in the party's post and nobody is pinged. What the post shows of the party is a snapshot (`PartySubject`: the post's title, the brief's lines but its line of where, `PartyBrief.whereLine`, since the post's own **Where** says it with the official name; the region, the place, a gym's official name, the maker, a meetup's information), renewed with every reason and at a decision; of a message a copy (`MessageSubject`: author, channel, time, its text cut to `MESSAGE_COPY_ROOM`, its attachments' names, the party whose post it is in; in a party's post the head names the post once, by the title it had: "Written by **Tester** in the post of **Train · Whole Group (B)**", without the post's mention, plan 8S-3), the first report's, kept when the message is gone and when it is edited (a later report that finds its text or attachments changed marks it `edited`, `messageSeenAgain`, and the post says `EDITED_SINCE`), and shown cut after escaping (1,500 characters of text, a name 100 and all names 600). A member's message form keeps one message per member (a newer form expires the older), so that one member cannot push the others out of the store.
 - Without `settings.channels.moderation` a party's report goes into its post as a member's `/delete` did (`PartyService.requestDeletion`: the public line, the staff roles pinged by the first that is sent, the reason cut to 500 so that the message with its pings stays within 2,000), and a message cannot be reported (`NO_MODERATORS`).
 
@@ -23,7 +23,7 @@ Members report a party or a single message to the moderators privately, the mode
 
 ## /delete
 
-- `/delete` is for staff (`default_member_permissions` Manage Messages, `requireManagement`, help category `admin`): it asks in a dialog whether to archive the post or delete it (plan 8Q, `removalDialog`, titled `Close this raid` / train / meetup; `pclose:<party id>:close:~<token>`, or `pclose:<party id>:close:archive:~<token>` without the choice where the bot may not delete the post (the per-open token of `removalDialog`, as for a report's dialogs, left out by `removalOf`), the forum named as in a report's dialog; the command declares no `defer`), and its Submit (`closeControls`, acknowledged privately; a deletion the bot may no longer make is refused there with today's words) ends the party as before, the post saying who closed it (`PartyService.end` with `removal`: `delete` deletes the post with everything in it in the place of its last showing and the archiving; a deletion Discord refuses archives it). The command has no throttle; its dialog's Submit has `CLOSE_THROTTLE` (twenty a minute) and takes no party of another server; the buttons of the question before plan 8Q (`pclose:<party id>:archive|delete`) get the router's stale answer. A deletion Discord refuses is said to the moderator as for a report; one the network failed is recorded as `delete` and said with `pendingDeletion` ("This raid is closed: its gym is free for a new report, and its post is archived for now: Discord did not answer …", a max battle's spot, a train's or meetup's "is closed, and its post is archived for now: …"; review r1 C1). `/help` tells a member who asks for `/delete` to use `/report` (`TOLD_INSTEAD`, without saying that the command exists).
+- `/delete` is for staff (`default_member_permissions` Manage Messages, `requireManagement`, help category `admin`): it asks in a dialog whether to archive the post or delete it (plan 8Q, `removalDialog`, titled `Close this raid` / train / meetup; `pclose:<party id>:close:~<token>`, or `pclose:<party id>:close:archive:~<token>` without the choice where the bot may not delete the post (the per-open token of `removalDialog`, as for a report's dialogs, left out by `removalOf`), the forum named as in a report's dialog; the command declares no `defer`), and its Submit (`closeControls`, acknowledged privately; a deletion the bot may no longer make is refused there with today's words; since plan 8M-8B its whole work after the dialog is `closePartyAs`, which staff's Delete… on the live map calls too, its outcome worded by `closeWords`, the dialog's words in the import-free `src/render/removal-words.ts`: `web.md`) ends the party as before, the post saying who closed it (`PartyService.end` with `removal`: `delete` deletes the post with everything in it in the place of its last showing and the archiving; a deletion Discord refuses archives it). The command has no throttle; its dialog's Submit has `CLOSE_THROTTLE` (twenty a minute) and takes no party of another server; the buttons of the question before plan 8Q (`pclose:<party id>:archive|delete`) get the router's stale answer. A deletion Discord refuses is said to the moderator as for a report; one the network failed is recorded as `delete` and said with `pendingDeletion` ("This raid is closed: its gym is free for a new report, and its post is archived for now: Discord did not answer …", a max battle's spot, a train's or meetup's "is closed, and its post is archived for now: …"; review r1 C1). `/help` tells a member who asks for `/delete` to use `/report` (`TOLD_INSTEAD`, without saying that the command exists).
 
 ## /places
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 490703753456925c35e7aa48b56834453aa66419..86906116d2323afef1ea4179582621439631537e 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -54,7 +54,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
 - The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 32 with Move…, Manage… and Split… (plan 8X-G; 31 with Manage train… and Split group…; before 8X-1B, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody should consider moving to another group.", Matt, plan 8X-F) under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time… (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move…, Manage…, Split… and Route, words only, Group…'s emoji left out on a train: `trains.md`, plan 8X-G). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game’s Select Time icon cropped from a raid screen), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
-- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group in letter order (plan 8X-G, `inLetterOrder`; newest first before), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked; since plan 8X-G the groups in letter order, and marked to start with where they have no size the default group, where Join, +1 and Remote put a newcomer, review r0 A2: an iPhone starts there, Android with group A). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) in letter order (plan 8X-G), then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>[:~<token>]` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
+- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group in letter order (plan 8X-G, `inLetterOrder`; newest first before), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked; since plan 8X-G the groups in letter order, and marked to start with where they have no size the default group, where Join, +1 and Remote put a newcomer, review r0 A2: an iPhone starts there, Android with group A). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) in letter order (plan 8X-G), then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>[:~<token>]` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`). The live map's forms go the dialogs' ways (plan 8M-8B, `web.md`, "The post's controls as forms"): what Group…'s press refuses and offers is `groupMenu` (`src/render/group-dialogs.ts`, with `groupMenuText` and `nothingToChange`), a move's words `movedWords`; Meet…'s refusals `meetRefusalOf` and `meetSubmitRefusal` (`meet-dialog.ts`, Meet… named by the caller: its icon here, words on the map), what it offers `meetChoices`; the words of a group's line and of Meet…'s times are the import-free `group-words.ts` and `meet-words.ts`, so that the page words them alike in the reader's zone.
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A sentence that ends with a place's name (a gym, a Power Spot, a stop, a route's stop by its link) ends through `endSentence(text)` (`src/render/text.ts`, plan 8X-F): no period is added where what a reader sees already ends in one (`.`, `!`, `?`; through closing bold, a masked link's address and `plain`'s escapes), so "at **Fire Company Inc.**" never reads "Inc..". A battle at a pin is "at an unlisted power spot" in running text (the DMs' `MaxDmView.pin`, the meeting DM); the label `Unlisted power spot` stays where it is a name (the post, `/where`, the moderators' notice, the map).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
@@ -75,7 +75,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 ## Attendance, lines and the completion question
 
-- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup` (with a label, Group…), `labelGroup`; `joinChosen` and `joinStamped` (the Submits of the dialogs about groups), `lobbyOf` (a party's lobby size). Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, and the letter Join, "Join B", of a post drawn before plan 8X-1B, which still joins its letter, `joinInto`, or is refused as no such group once the letter is gone) are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`). The live map presses Remote too (plan 8X-5): `setRemote(…, 'toggle')` answered in `remoteWords`, as the post's Remote button.
+- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup` (with a label, Group…), `labelGroup`; `joinChosen` and `joinStamped` (the Submits of the dialogs about groups), `lobbyOf` (a party's lobby size). Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, and the letter Join, "Join B", of a post drawn before plan 8X-1B, which still joins its letter, `joinInto`, or is refused as no such group once the letter is gone) are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`; since plan 8M-8B also +1 and −1, answered in `moreWords`, and the completion question's "Yes, done" and "Not yet"); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`). The live map presses Remote too (plan 8X-5): `setRemote(…, 'toggle')` answered in `remoteWords`, as the post's Remote button.
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
 - The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 15 (plan 8X-S: a max battle's `bossSince`, since when it has its boss, and its `screenshot`, as a raid's; plan 8X-4, version 14: a train's `kind`, and its `route` and `finishedFrom` as stops, `StopRef`; plan 8X-3, version 13: the part `max`, a max battle's tier, boss and spot; plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; version 12 (plan 8X-1B): a group's `opened`, also kept with a `splitOff` entry; exactly the parts that fit the type must be present); versions 1 to 14 are still read (none of them before 13 a max battle; a max battle of 13 or 14 has had its boss since it was made, the row's `createdAt`, and has no screenshot; a train of them before 14 a raid train whose route and `finishedFrom` are gyms; a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another, their groups before 12 opened with the party).
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index b015813167f894d1a67c82225a5663752796f6af..b723d84a08542adcf0edc00b80b15399a1b6f8b5 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -82,6 +82,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
 - The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Plan 8M-8A: it gives the party service's `layoutOf` and `postTitle` (a party's post on the map), and `places` (no place has a picture unless the test passes a fake of `PlacePictures` as `places`); the application emoji's pictures are `webServerWith`'s `emoji` (none by default). A party's post through the route is tested per kind in `party-post-view.test.ts` (a reported raid, hatched or from a screenshot, a max battle, a train with its route and a split, a meetup at a pin), a layout's roles with `roleLines` and `withoutRoles` (`test/support/post-roles.ts`, which each renderer's test uses to see Discord's message unchanged), the page's drawing of a post in `src/web/client/post-draw.test.ts` (trees of nodes), the parser `postText` by its property over random texts (`post-text.test.ts`, a seeded generator of its own). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
+- The post's controls as forms (plan 8M-8B): Group…, Meet…, +1, −1 and the completion question go over `partyWebWith(made, …)` (its `attendance` the service's; `closing` says where the bot may delete posts by the fake gateway: `gateway.noManaging`, and names a forum by `gateway.channelNames`, which a test sets); staff's Delete… and Report… also need `postWebWith(ctx, { staffRoles })` (`test/support/web.ts`: the context's `partyService` and `reports`, of `createTestContext` or of `reportedMeetup`'s `service` and `reports` for the moderators' channel `MOD_CHANNEL`), passed as `posts`; without it every use throws. Meet…'s tests fake `Date` to `PARTY_NOW` (the attendance service reads the clock). Route tests: `party-regroup.test.ts`, `party-meet.test.ts`, `party-close.test.ts`, `party-report.test.ts`; the forms' pure parts `src/web/client/post-forms.test.ts`; `post-forms-ui.ts` is wiring, tried at staging and in the preview.
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`; `/raid`'s own refusal of a forum the member is kept out of in `raid.test.ts`, with `gateway.barred` and a router's `Throttles` to see it uncounted, plan 8M-6; a screenshot's in `mention.test.ts`, whose `setup({ alsoInEast })` puts gyms in East as well).
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a Power Spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 8ed469992d855b6378fdae915af98e3c1b125084..7cec4bedb4aee25be96c32603f51f4f8aeb87c96 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the post's controls as forms, `POST /s/<guild>/api/parties/<party id>/regroup`, `GET` and `POST …/meet`, `POST …/close` and `GET` and `POST …/report` (plan 8M-8B; `postControlRoutes`, `src/web/post-control-routes.ts`: static segments, which Fastify's router takes before the presses' `:action`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
@@ -30,7 +30,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, and whose one script, inline (`CONTINUE_SCRIPT`, `src/web/continue-script.ts`, let in by its hash: no file of its own, which was a third request to `/auth/` for every login), presses the button as the page is shown (Matt, 2026-10-25: no second tap): it submits with `requestSubmit`, or `submit` where a browser lacks it (Safari before 16), then disables the button and puts "Logging you in as <name>…" in place of the sentence, the name read as text from the form's `data-name` (escaped on the page; never HTML built of it), so that a tap while the POST is on its way cannot abort it after the link was spent and land on `?login=expired` (8M-7 review fix 1; `login.test.ts` runs the page's script against a small document of its form, button and sentence). A link preview or a prefetch runs no script, so it cannot spend the link; without script the button stays. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped). Pressed by the script, somebody else's link logs you in as them without a pause; the map's header names whose account it is (Matt's ruling, 2026-10-25). An unknown, used or expired link, or one of another server, leads (303) at once to the page its address names with `?login=expired`. `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, with `?region=<id>` for a link of `/maps` used in a region's channel, plan 8M-7, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The page's plain address is given only as code, after "To share the map, give its address:", which Discord does not make a link: tapped above the button, it opened the page logged out (Matt, 2026-10-25); the button is the one link in the answer. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`; +1, −1 and the completion question's answers among them since plan 8M-8B), Group…'s moves 30 a minute (`GROUP_WRITES_PER_ADDRESS_MINUTE`, plan 8M-8B), Meet…'s openings and Submits 30 a minute together (`MEET_PER_ADDRESS_MINUTE`), staff's closings 30 a minute (`CLOSE_PER_ADDRESS_MINUTE`), the reports' openings and Submits 30 a minute together (`REPORT_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), and so +1, −1, an answer to the completion question and a move of Group… (plan 8M-8B: one use at the move; the form opens from the list, uncounted), Meet…'s Submit in `/meet`'s window (`MEET_WINDOW`, its opening refused while it is full, uncounted, as the post's `checks`), staff's Delete… in that of `/delete`'s dialog (`CLOSE_THROTTLE` of the controls `pclose`), a report in `/report`'s (`REPORT_WINDOW`, its opening refused while it is full, uncounted), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
 
@@ -57,8 +57,8 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; since plan 8M-8A the menu is in the member's part under the post, Group… goes to it for a newcomer, and Group… for a member signed up and Meet… say "Do this on Discord" until plan 8M-8B); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. The list names nobody (attendees are counts); each party carries `postKey`, the key of its post as last shown (plan 8M-8A, below, "A party's popup is its post"), whose view names attendees, the reporter and the maker exactly as the post does, to the same members (Matt's ruling, 2026-10-25: the map is an extension of Discord, never a contradiction of it). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
-- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote); any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; since plan 8M-8A the menu is in the member's part under the post, and Group… goes to it for a newcomer to several groups; since plan 8M-8B Group… is the map's form for anybody else, below, "The post's controls as forms"); since plan 8M-8B also `count` (+1 and −1 may be pressed: never while read-only), `asked` (`{ until, word }`, the completion question to the member it asked: `CompletePending` and its `pendingUntil`, the party named by `partyWord`; not while read-only) and `regroup` (Group…'s choices, its refusal, or `{ onlyNewGroup }` where a new group is the only way, review W-1; `regroupOnTheMap`; absent for a party without groups and while read-only); every party's `mayReport` (Report…, for a member who sees its forum on Discord: `PartyViewers` says the forums they cannot see by their roles as `hidden`, review W-7; never while read-only); for a raid also `mayChange`, whether the member may change it on the map: Discord's rule (Matt, plan 8M-8B, X5: anybody in the post may set the hatch, the end and the boss), so anybody the map shows the raid to, which leaves out who is barred from its forum: `!readOnly` (plan 8M-4's `mayChangeRaid`, signed up or staff, is gone). For staff (`PartyViewInput.staff` from the directory's `standing` by `isMapStaff`) the view says `staff` and each party's `close` (`{ mayDelete, forum, word }`, staff's Delete…, the party named by `partyWord`: `PartyService.mayDeletePost` through `PartyWebDeps.closing`, the forum named `#name`, `forumOnTheMap`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. The list names nobody (attendees are counts); each party carries `postKey`, the key of its post as last shown (plan 8M-8A, below, "A party's popup is its post"), whose view names attendees, the reporter and the maker exactly as the post does, to the same members (Matt's ruling, 2026-10-25: the map is an extension of Discord, never a contradiction of it). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote), `more` and `less` (plan 8M-8B, `MAP_COUNTS`, no body: the post's +1 and −1, `changeNumber`, a newcomer's +1 signing them up as interested, answered in `moreWords`) and `answer` (plan 8M-8B, `MAP_ANSWER`, body `{ yes }`, required: the completion question's "Yes, done" and "Not yet", `AttendanceService.answer`); any other action 404, a body other than an optional group letter with those three, or other than `{ yes }` with `answer`, 400 (`pressOf`, strict). Since plan 8M-8B `pressStatus` carries +1, −1 and the answer too, so the post's buttons call it for them as the map does. Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
 - **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the reader's own zone (`clockTime` over `readerZone()`, plan 8M-8A; the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
@@ -77,27 +77,41 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's
   |---|---|---|
   | Interested, Join, Here, Done, Leave | `press` `interested`, `join`, `here`, `done`, `leave` | the map's press (`POST …/parties/<id>/<action>`); off while the list's `attendance.actions` lacks it (Done on an egg, Leave for somebody not signed up, everything while read-only); icon-only with `aria-label` and `title` from `STATUS_WORDS` (Interested, Coming, Here, Done) and Leave |
   | Remote | `press` `remote` | the map's Remote press (`MAP_REMOTE`), off unless `attendance.remote.offered` |
-  | Group… | `panel` `group` | for a newcomer to several groups the menu "Which group?" in the member's part (Interested, Join and Here send it); else "Do this on Discord" (8M-8B) |
-  | Set time… | `panel` `time` | the raid's change form (8M-4) where `mayChange`; else "Do this on Discord" (8M-8B: Discord's rule) |
+  | Group… | `panel` `group` | for a newcomer to several groups the menu "Which group?" in the member's part (Interested, Join and Here send it); else Group…'s form (plan 8M-8B) from the list's `regroup`, or its refusal in the line under the buttons; off while read-only (X10). Starting a new group stays on Discord ("Start a new group on Discord →" in the form, Matt's ruling; where it is the only way, review W-1, Group… itself shows that line with the post's link and no form) |
+  | Set time… | `panel` `time` | the raid's change form (8M-4) where `mayChange` (since 8M-8B anybody the map shows the raid to); else "Do this on Discord" |
+  | Meet… | `panel` `meet` | Meet…'s form (plan 8M-8B), which asks the server what it offers (`GET …/meet`) and says its refusal in the line under the buttons; off while read-only |
   | Move… | `panel` `moves` | the moves panel (8M-5) in place of the post's buttons where `MapTrain.panel`; else why not, as the server decides it and sends it with the train (`MapTrain.moveRefusal`, `moveRefusalOf`: the commands' `mayNotMove`, `not-conductor` or `not-attending`, and `no-route`, `read-only`; review N1), the page only wording it (`whyNot`): "Only the conductor or staff can move the train.", "Sign up for the train to move it.", "The train has no route yet: add a stop first.", "Discord cannot be reached just now, so nothing can be changed." |
-  | Manage… | `panel` `manage` | shows the conductor's part (Be the conductor, Stop being or Take off) and "What the train is mainly for: on Discord" where the member is the conductor, may take or drop the role, or set the kind; else who may, as for Move… (8M-8C) |
+  | Manage… | `panel` `manage` | shows the conductor's part (Be the conductor, Stop being or Take off) and "What the train is mainly for: on Discord" where the member is the conductor, may take or drop the role, or set the kind (the kind menu and the rest of Manage… are plan 8M-8C's, X9); else who may, as for Move… |
   | Route | `panel` `route` | shows the stop list, the train's stop marked |
-  | −1, +1, Meet…, Split… | `discord` | "Do this on Discord →" under the buttons, the post's link (8M-8B, 8M-8C) |
+  | −1, +1 | `press` `less`, `more` | the map's press (plan 8M-8B, `MAP_COUNTS`), off unless `attendance.count` (never while read-only) |
+  | Split… | `discord` | "Do this on Discord →" under the buttons, the post's link (8M-8C) |
   | Screenshot feedback | `screenshot` | "Reported from a screenshot · feedback on Discord →" in its place, the post's link (Matt's ruling: feedback stays on Discord) |
   | anything else | `none` | off |
 
-  The raid's boss and moves (slash commands on Discord, no post button) stay the map's "Change…" in the member's part, as do a train's "Edit route" and a meetup's "Edit…".
+  The raid's boss and moves (slash commands on Discord, no post button) stay the map's "Change…" in the member's part, as do a train's "Edit route" and a meetup's "Edit…". After plan 8M-8B what the map leaves to Discord is Split…, Manage… beyond the conductor and the kind's line, and the route editor (plan 8M-8C), and starting a new group (Matt's ruling: it needs a word with the others). What a post has no button for, the map's line has (plan 8M-8B): Report… for a member who sees the party's forum on Discord (`mayReport`: not for a forum they cannot see by their roles, review W-7, since a report without the moderators' channel writes into the post; not while read-only) and staff's Delete… (`mapControls`, beside Open on Discord). The completion question (its own message on Discord) is in the member's part, to the member it asked (`asked`): "Have you completed this raid?", when no answer counts as done in the reader's zone, "Yes, done" and "Not yet" (a press `answer`). **The view's version** (`POST_VIEW_VERSION`, `src/render/post-view.ts`, X6): folded into every `postKey` (`layoutKey` of the version, the table `CONTROLS` itself and the layout's JSON, review W-3), so that no browser keeps a view an older one drew under its key: a change of `CONTROLS` changes every key by itself, and the version is raised only with a change of how `postView` draws (1 since plan 8M-8B).
 - **Drawing** (`post-draw.ts`, pure: `postCard`, `postPopup`, `mapLine`, `raidChoices`; trees of nodes set as text by `renderNode`, never HTML from data; `safeHref`, as strict as `linkableOnTheMap` (this server's channels, `/maps` itself, review 8A-13), and `safeSrc` check every address again; a picture beside a part that does not load is hidden, review 8A-15): the post's edge (`.post.accent-<name>`), headings, small print, `strong`, `em`, `u`, `s`, `code`, links in a tab of their own, the application's emoji as pictures the size of the text, times as `<time>` in the reader's own zone and language (`postTime`, `post-time.ts`: Discord's styles, `R` kept current every 15 s), the buttons in Discord's styles (`press primary|secondary|success|danger`, `icon` for icons alone; a section's button beside its text as the controls are, `beside-control`, review W-4). Under the post the member's own part (who they are in it, "You: Coming, group B · remote"; the group menu; Change…, Edit route, Edit…; Manage…'s and Route's sections, hidden until pressed; what is open under a post, the line to Discord too, kept by party across redraws, `PanelsOpen`, review 8A-10; the line by the button pressed, worded again at each draw from the party as it is then, review N3) and the map's line (distance from where the member is by `distanceWords`, once the browser said; Directions; Open on Discord). A popup is 280 to 380 pixels wide and scrolls beyond the map's height (`maxHeight`). A gym of several raids lists their heading lines with their times, each opening its post in the popup with "← All raids here" (ruling 14); a gym that shows its raid offers "Report spawn here" and "Meetup here" under it, never "Report raid" (`gymWithRaidBoxes`, review 8A-2); a party whose post the page has not got yet shows the map's own summary as before.
 - **Times in the reader's zone** (ruling 7): the posts, the list, the markers' badges and the popups' summaries give times in the reader's own zone, as Discord does (`readerZone`, `post-time.ts`); what the server words (answers through `pageWords`) and the forms that send typed times keep `settings.timezone`, and where the reader is in another the forms name it (review 8A-11, N4): the meetup editor after its times ("Starts now: 7:30 PM (Eastern)", `zoneNote`), and the raid report and change forms, a new train's and a new meetup's in a hint under their typed times ("Clock times are read in the server's zone (Eastern).", `zoneHint`, `zoneHintNodes`; a zone without a short generic name in its own words, "(India Standard)").
 - **The phone card** (`phone-card.ts`): narrower than 768 pixels a party opens as a card docked at the bottom in the place of its popup (the popup Leaflet opens is closed at once; `autoPan` off), with the popup's own content: its summary (the `head` block, the first row of buttons, the member's line and the map's line, by the roles, `map.css`), the whole post once the handle is tapped or the card swiped up (40 pixels, `SWIPE_PIXELS`); down again the summary, then closed, as a tap on the map, × or Escape (only while the focus is in it or nowhere); the click after a swipe is no tap; the focus goes to its handle and back where it was when it closes; what was tapped is panned above it; "← All raids here" stays in its summary (review 8A-8). A dialog named by the heading of what it shows (the post's, else the name of the map's summary, else "Party"; review W-6). The list's line opens the same card. Drawn anew with each list and when its post comes, never under a form; a form in it claims the hold as the card's (`formPlace` says `'card'`; review N2), which no Leaflet popup's closing touches, and the card's closing lets it go (`PhoneCard`'s `onClose`, `hold.cardClosed`, review 8A-1), also when another party opens in the card's place; closed once its party is gone.
 - **Pictures** (`src/services/post-pictures.ts`, through the image cache `var/images`; nothing added to the CSP, no Google host): `/emoji/<id>.png` (`emojiRoutes`, `server.ts`; `EmojiPictures`) serves an emoji of the application alone (`ApplicationEmoji.hasId`, by its last read), fetched once from Discord's CDN (`?size=96`), public and kept for good (`public, max-age=31536000, immutable`), no rate limit (the application has some dozens); any other id 404, and the page shows its plain emoji or name. `/s/<guild>/pictures/gym/<id>` and `…/wayspot/<Wayfarer id>` (`PlacePictures`): a place's Wayfarer picture by its gym or Wayspot, kept in a folder of its own (`var/images/place-pictures`, until its address changes; StaticMaps' `places` is pruned daily by `prunePlaces`, review W-1), never by its address (no open proxy; `keyOf` finds the gym or kept Wayspot whose picture, as `wayspotPicture` makes it, is the address a post shows, on a miss, and keeps it in a `BoundedMap` of `KNOWN_ADDRESSES`, checked against the place's address at each use: no index over every place made anew when one gym changes, review W-2), for members (401, 403, 503 as the list), only while a post of the server that the member sees on the map shows it (404 otherwise, nothing fetched), `private, max-age=86400`, 240 a minute per address (`PLACE_PICTURES_PER_MINUTE`). Both are served only as PNG, JPEG, GIF or WebP by their first bytes (`pictureType`), and a download that failed is not tried again for a minute (`FAILED_PICTURE_MS`, review 8A-6).
 
+## The post's controls as forms (plan 8M-8B)
+
+Brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its "After the builder check" rulings X1 to X10). Every control of a post that opens a dialog on Discord, and the two the post has no button for, is a form of the map over the dialog's code path, with the checks of every write ("Adding a route"). Max battles are served by every route (Meet…, Done, the answer, Delete…, Report…); their drawing on the page is plan 8M-9's (X3).
+
+- **The routes** (`postControlRoutes`, `src/web/post-control-routes.ts`): the checks in their order: the per-address limit (one limiter per family) and `postGuard` before a POST's body is read; the session and the body (zod, strict); who writes (`actingOnTheMap`); the party as the store has it (`partyFor`: an active party of this server, else 409 "This has ended."); its forum (`barred` 403, unreachable 503); only then the window its dialog counts in. A form that asks the server before it opens (`GET`, `reader`: `memberOrFailure`, then `partyFor`) counts nothing. Logged as a press: "a party was pressed on the map" with `action` `regroup`, `meet`, `close` or `report`, never a text. Answers are `PressAnswer` (`{ ok, text }`, 200 / 422 / 409), a refusal before the work `{ error }`.
+- **Group…** (`POST …/regroup`, `{ group, stamp, signedUp }`): the list carries its choices (`MapAttendance.regroup`, `regroupOnTheMap` of `src/render/group-dialogs.ts` over `groupMenu`, the press's refusals and ways moved out of the Discord handler, and `groupMenuText`, the dialog's title, text and label over the map's ways): the groups to move to or join by letter and stamp, label, size (`groupSize`) and a battle's meeting time as a moment; a new group is not among them ("Start a new group on Discord →" where Discord would offer it, `newGroup`); `{ onlyNewGroup }` where a new group is the only way (review W-1: nothing to submit, Group… shows the post's link; the link's words are `discordLink`'s, carried on every button that sends to Discord as `data-link`, which the page reads, review N-4); or the refusal (`{ refused }`, said under the post's buttons). A refusal of the move closes the form and the list is asked for again (review W-2: its choices came with the list and may be stale; `formStep`). The move: one use in the window of the post's controls, `joinStamped` with `signedUp` (a member who left meanwhile: "You are no longer signed up: press Group… again."), `movedWords` (shared with the dialog's Submit: "Group B has changed since: press Group… again."). The group's line is `groupLine` of the import-free `src/render/group-words.ts`, the dialog's in the server's zone, the page's in the reader's.
+- **Meet…** (`GET` and `POST …/meet`, X4): the opening refused while `/meet`'s window is full (uncounted) and as the press is (`meetRefusalOf`, moved out of `meet-dialog.ts`'s handler, 422 in its words), else `MapMeet` (`meetOnTheMap` over `meetChoices`, which the dialog draws from too: the group by letter and stamp, the times of `meetTimes` as moments, the group's own, the one chosen to start with). The Submit `{ group, stamp, time | null }`: one use in `/meet`'s window, `meetRefusalOf` again, `setMeetingTime` with the group drawn, `/meet`'s words through `pageWords`; a refusal inside the store in the dialog's words with Meet… named in words (`meetSubmitRefusal(reason, 'Meet…')`; on Discord by its icon). The page names the times in the reader's zone with `meetTimeLabel` of the import-free `src/render/meet-words.ts`; nothing is typed, so no zone hint.
+- **Staff's Delete…** (`POST …/close`, `{ removal }`, X1): staff by the member fetched fresh (`isMapStaff`; 403 in `requireManagement`'s words, `STAFF_ONLY` of `guards.ts`, uncounted), `CLOSE_THROTTLE` in the window of the controls `pclose`, then `closePartyAs` (`src/commands/parties/delete.ts`: the Submit of `/delete`'s dialog moved out into a function both call, its outcome a kind, `closeWords` its words; the forum named `#name` by `mayNotDeleteIn`). The form's words are the import-free `src/render/removal-words.ts` (`closeTitle`, `closeQuestion`, the choices, `archiveOnlyText`), which `/delete`'s dialog uses too, the party named by the list's `close.word`; "archive only" where `close.mayDelete` is false. After a close the page closes the popup or card that shows the party (`showsParty`, the one rule of which popup or card shows a party, also for drawing a post that came, review N-3; the party the form holds, review W-6: not another one opened meanwhile) and asks for the list.
+- **Report…** (`GET` and `POST …/report`, X2): for a member who sees the party's forum on Discord alone (review W-7, Matt to confirm with C1: a report without the moderators' channel writes a public line into the post; `hidden` 403 on both, as the list leaves `mayReport` out); the opening asks what `/report` asks before its form, uncounted (its window; `refuseReportedBefore`), and answers the form's words (`MapReport`, `reportFormWords`); the Submit `{ reason }` refuses white space alone uncounted (`NO_REASON`), counts once in `/report`'s window, then `reportParty` and `reportAnswer` (a report the moderators could not be told of gives the use back); without the moderators' channel the reason goes into the post, pinging the server's staff roles (`PostWebDeps.staffRoles`, `managementRoleIdsOf` of the client's server).
+- **+1, −1 and the completion question** are presses of `partyRoutes` (above). The question's words are the import-free `src/render/completion-words.ts`, which the question's message on Discord uses too.
+- **The page** (`src/web/client/post-forms.ts`, pure: each form as a tree of nodes in Discord's dialog look, `.post-form` on `--dialog-bg`, its title, text, choice, Submit and Cancel; the bodies; `sendPostForm` over `pressParty`; the DOM side `post-forms-ui.ts`): a form opens in the place of the post of the button pressed (in its popup, its line of the list or the phone card: `formPlace`), held by `FormHold` (taken at the press, before a `GET`; drawn only while its claim holds and its place is in the page); Cancel or Escape put the post back and the focus on the button that opened the form (`focusBack`, review W-5), and after a form went through, the post drawn anew, on that control found again there (`sameControl` of `list-ui.ts`, review N-1); a refusal is said under the form and in the notice, and the form stays (but Group…'s, review W-2); a success or a party over puts the post back (Delete… closes the popup or card) and asks for the list. `formControls` turns `data-regroup`, `data-meet`, `data-close-party` and `data-report-party` off while another form holds.
+
 ## Raids on the map (plan 8M-4)
 
 - **One code path per command** (spec 3.5): what `/raid` does beyond its gym question is `reportRaidAs` and `reportWords` (`src/commands/raids/report.ts`: the report as the member, anonymous by their `raidPrivacy`, signed up by their `autoStatus` under their name and team; the command's words for each `ReportOutcome`, a post and a region channel named by the caller's `ReportNames`: mentions on Discord, on the map no post and a channel as `#name`); what `/hatch`, `/end`, `/boss` and `/moveset` do is `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` (`src/commands/raids/raid-changes.ts`: the command's reader, `RaidChangeService` as the member, the answer `raidChangeAnswer`, `ok` / `refused` / `gone`; a reader's refusal is thrown as a `UserError`). The commands reply with these or throw them; the map answers them. The readers (`reportedBoss`, `reportedTime`, `typedPartyTime`) take only what they read (`RaidReading`), so the web server is given exactly what the commands read and call (`RaidWebDeps.ctx`, `RaidWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
 - **The pick lists** `GET /s/<guild>/api/raid-options` (members, as `/api/parties`; 30 a minute per address): `raidOptions` (`src/web/raid-options.ts`, pure; types in `src/domain/web/raid-options-data.ts`, which imports no server code): the current bosses in the boss list's order, each with the value its choice of `/raid` has (`bossChoiceValue`: `b:yveltal:T5:0`; `/raid`'s own list uses it too, and `reportedBoss` reads it back), then an egg of every tier (`eggChoiceValue`, `e:T5:0`), tiers in the posts' words (`raidWords`), the posts' zone; nothing of gyms (no elite raid gym mark). An ETag of its JSON, `private, no-cache`, 304. A raid's moves `GET /s/<guild>/api/raids/<id>/moves` (members; the same limiter as the pick lists; an active raid of the server, 409 otherwise; its forum by `memberAccess` as a change asks it, `barred` 403, Discord unreachable 503; 422 without a boss whose moves are known): `bossMoves`, the moves of the boss the post shows, by id and name, as `/moveset` lists them.
 - **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum (`reportBarred`, `src/commands/raids/report.ts`, the check `/raid` makes too, plan 8M-6): `barred` from any of them 403 `{ error: REPORT_BARRED }`, "You cannot report a raid at this gym: you are kept out of the forum its raid would be in.", Discord unreachable 503 (a known limit, as for `/raid`: the check runs before `reportRaidAs`, outside `PartyStore.update`, so a raid another member reports at a gym of two regions moments earlier may appear in a forum that bars this member between the check and the report, which then joins it); only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is, one line per report once who reports is known, a refusal too (plan 8S-3): `{ user, guild, gym, outcome }`, "a raid was reported on the map", the outcome the report's kind (`created`, `exists`, `no-post` …) or what refused it (`no-gym`, `several-regions`, `barred`, `unreachable`, `throttled`, `refused` for `/raid`'s readers), never the text.
-- **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403); whether the member may change it (`mayChangeRaid`: signed up for it, as `mayArrange` has it, or staff by the commands' `isManagement`, an admin or a moderator by role or the bot's owner, `isMapStaff` of the member fetched fresh; 403 "Only members signed up for this raid, and moderators, can change it here." otherwise); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. The commands themselves let anybody in the post change a raid; the map, which crosses forums (spec 2.5), asks a sign-up or staff (spec 3.6). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
+- **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403; anybody else may change it, as anybody in its post may on Discord: Matt's ruling, plan 8M-8B, X5, which took out 8M-4's `mayChangeRaid` and its 403); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. `/moveset` falls under the same rule. Provisional (C1, Matt to confirm): "in the post" on the map is anybody the map shows the raid to and who is not barred, as Join already crosses region roles (spec 2.5). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
 - **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, only: since plan 8M-8A a gym that shows a raid offers the raid, with "Report spawn here" and "Meetup here" under it (`gymWithRaidBoxes`, review N5); whether an elite raid may be reported beside a standard one there is a question for Matt in the follow-ups), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go, and so are a gym's raid choices, which draw the popup or phone card anew (`chooseRaid` does nothing while a form is open, review W-3); once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise. A click in a popup stays in it (`keepClicksInPopup`, `raid-forms.ts`, on the map's `popupopen`, a listener on the popup's element that stops the click): Leaflet 1.9 leaves a click in a popup alone only by walking up from the click's target to the popup when the click reaches the map (`Map._isClickDisabled`), and a control that takes its own button out of the page as it is clicked (Manage… drawing the Manage train panel in its place; Cancel of the report, change and spawn forms putting the popup's buttons back) left nothing to walk up from, so Leaflet took the click for the map's and closed the popup (staging of the web map plans, 2026-10-18; tested with a model of Leaflet's rule in `train-ui.isolated.test.ts`). Cancel therefore puts the popup's buttons back and lets the hold go, the popup open; a popup closed with a form in it lets its form go (`popupClosed`).
 - **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains are 8M-5 (below), meetups 8M-5M; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
 
@@ -111,7 +125,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's
 ## Trains on the map (plan 8M-5)
 
 - **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The panel of the post keeps its own answer (it draws itself anew); the map calls the same service methods with the same `from`, `target` and `first`, and words Reverse and the mode with `reverseRouteAs` and `setAtEndAs`. The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opened it before plan 8X-G (the post has Move… and Manage… since, `trains.md`; the map's panel waits for the UX pass), none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); Power Spots as a layer, Add to route from a spot (the add body takes a spot's key already) and the kind menu are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opened it before plan 8X-G (the post has Move… and Manage… since, `trains.md`; the map's panel waits for the UX pass), none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); Power Spots as a layer and Add to route from a spot (the add body takes a spot's key already) are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"), and the kind menu is plan 8M-8C's with the rest of Manage… (X9: until then "What the train is mainly for: on Discord"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
 - **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd?, kind? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`; the kind as its `kind`, plan 8X-5, a raid train without one). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the editor or the panel again without the controls); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
 - **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`), `finish` (`{ from }`), `reverse` (`{ from, first }`), `at-end` (`{ from, atEnd }`), and `kind` (`{ kind }`, plan 8X-5: the panel's kind menu, as the post's menu, nothing of where the train is; who may is `mayNotMove`, also without a route; `setKindAs`, "This train is a Gigantamax Train now.", `trainKindSentence`; not one of `PANEL_PRESSES`, the panel's buttons, but `KIND_PRESS`): the Manage train panel, each press carrying where the panel was drawn and where it leads, as the post's controls carry them; the same checks in the same order, who may being `mayNotMove` (the mode: `mayNotArrange`, as `setAtEnd` decides), and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as a press of the panel counts; then `moveTrainAs` (the command's words, where the train is now, "I am telling the others."), `reverseRouteAs` ("The route is reversed. " and where the train is), `setAtEndAs` (`atEndSentence`). The movement message in the post pings as for any move. Logged "a train was moved on the map" (a kind set: "a train's kind was set on the map", `{ user, guild, party, kind, outcome }`). **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
@@ -125,7 +139,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's
 - **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a Power Spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a Power Spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info, one line per request once who makes it is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once it is one of the server's; `makeMeetupAs`'s kind, or what refused it: `no-region`, `no-forum`, `barred`, `unreachable`, `blocked`, `refused` for `/meetup`'s guards and form, `throttled`), "a meetup was made on the map", never a text or the place.
 - **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 021 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
 - **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power Spots are never offered here (they are `/api/powerspots`'s, plan 8X-5, for max battles), nor other Wayspots; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
-- **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end, the map, which crosses forums, asks more, as for raids); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
+- **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end; the map asks more, a meetup's text being safety-relevant since plan 8S-1: plan 8M-8B left it so where Matt's ruling of Discord's rule named raids, provisional, C2, Matt to confirm); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
 - **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeTime`, `src/domain/web/clock.ts`: "in 5 h", "1 h 30 min ago", "now"), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
 - **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on the pane of the rings (`RING_PANE`, `rings`, which the trains' rings share), above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power Spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
 - **Not in it:** a meetup's place cannot change after it is made (no route for it); a member cannot withdraw a pending request; Report on a meetup (8S-2); meetups on Campfire; the PokéStops are drawn only in "pick a place" mode, not from a zoom level up (a question per pan for every member, for little: left for staging to say whether it is wanted); an end given when the meetup is made (`/meetup` takes none, and a request kept for the moderators has no end: it is set with the editor once the meetup is posted).
diff --git a/docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md b/docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..735f500dd66803128d9763a0abdbfe8d62d9d724
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md
@@ -0,0 +1,70 @@
+# Phase 8M-8B staging checklist: the post's controls as forms of the map
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.
+
+- **Accounts:** Googer (owner, staff), Tester (a member), and a third account for the completion question and the groups where one is at hand.
+- **Brief:** `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its last section, "After the builder check", X1 to X10).
+- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's popup is its post", "After the builder check").
+- **Conventions:** `docs/architecture/web.md` ("A party's popup is its post", "The post's controls as forms").
+- **Devices:** a desktop browser (light and dark), an Android phone and an iPhone if at hand, Discord's in-app browser and the phone's own.
+- **Compare with Discord:** every form beside its dialog on Discord: the same title, words, choices and answers.
+
+## Before
+
+1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs.
+2. **Parties:** Googer reports a raid with times (an egg hatching in 20 minutes) and a hatched raid; Tester joins the hatched one; a second group on it (Googer: Group… → a new group on Discord, label "by the fountain"). A train and a meetup at a pin. No moderators' channel at first (`settings.channels.moderation` unset), then with it (step 22).
+3. **The view's version:** a page opened before the deploy keeps its posts by their old keys; after the deploy every post is asked for anew once (the view's version and the table `CONTROLS` are in every key: the network tab shows `post?k=` with new keys).
+
+## Who may change a raid (X5)
+
+4. **Anybody the map shows the raid to.** As Tester, not signed up for the egg: "Change…" is in the member's part and Set time… opens the change form; set the hatch, the boss and the moves: each goes through, in the commands' words, and the post on Discord says Tester did it. As Tester barred from West's forum (an overwrite): the raid is not on the map, and a change sent by hand (the browser's console, the change's address) answers 403.
+5. **Read-only.** With Discord away for the bot (block its network a moment, or the preview's `ME=readonly`): no Change…, Set time… off.
+
+## +1, −1 and the completion question
+
+6. **+1 and −1.** As Tester on the hatched raid, press +1 twice and −1 once in the popup: the post's line on Discord says "Tester +1", the answers are the buttons' ("You are coming with 1 more."); +1 at the most one may bring says so. As somebody not signed up, −1 says "You are not signed up for this raid."; +1 signs them up as interested.
+7. **Their limit.** 30 presses a minute between Discord and the map: the 31st, on either, says "That was a lot of clicks…".
+8. **The completion question.** Googer and Tester Here on the hatched raid; Googer presses Done (Discord or the map). Tester's popup shows "Have you completed this raid?" with "Without an answer by 2:52 PM I will take it that you have." (in Tester's own zone) and Yes, done / Not yet; on the phone the card's summary shows it too. Not yet: Tester is Here again, and the question message on Discord goes; Yes, done: Tester is done. Googer's popup never shows the question.
+
+## Group…
+
+9. **Change group.** As Tester (in A) on the raid of two groups: Group… opens "Change group" in the popup, in Discord's dialog look: "You're in group A.", the other group with "1 trainer · meeting at …" (in the reader's zone) and "Start a new group on Discord →" (the post's link). Submit: "You are coming, in group B.", the post on Discord moves Tester; the popup comes back with the post as it is now.
+10. **One way.** Where only one group is left to move to, no choice: "… Submit moves you to group B.".
+11. **Stale.** Open the form, then on Discord let the other group go (its member leaves) or move Tester there; Submit: "Group B has changed since: press Group… again." (or "You are no longer signed up: press Group… again." after Tester left on Discord).
+12. **Refused before it opens.** As a member who completed the raid: Group… says "You are done with this raid. Use Join or Here if you are back." under the buttons, in the place of the post's link. Read-only: Group… is off.
+13. **A newcomer.** Several groups: Group… goes to the "Which group?" menu (as in 8M-8A). One group, Tester not signed up and others signed up: "Join a group" with group A; Submit signs Tester up as coming.
+13a. **Only a new group.** One group, Tester signed up in it with others: Group… opens no form; the line under the buttons says "Start a new group on Discord →" with the post's link (review W-1).
+13b. **A stale move.** With "Change group" open, let the group picked go on Discord, then Submit: the refusal is said, the form closes and the popup shows Group… as it is now (review W-2); the focus is back on Group… (review W-5).
+
+## Meet…
+
+14. **The times.** As Tester on the raid with times: Meet… (the ⏰ icon) opens "Meeting time for group B" (or "Meeting time") with "When does your group meet?": the in-game RSVP times and the five-minute times of the next hour, in the reader's zone, the hatch first on an egg, chosen to start with; the group's own time said ("· Your group's meeting time now") and "No meeting time" last once it has one. Compare with Discord's dialog: the same times.
+15. **Set and remove.** Pick a time: "The meeting time of group B is 2:30 PM (in 30 min). I have told the others."; the others are pinged in the post, as on Discord. "No meeting time": "The meeting time of group B is canceled.".
+16. **Its window.** Three a minute between `/meet`, Meet… on Discord and the map: the fourth opening says "You can use /meet again in …" and opens nothing.
+17. **Refused.** Not signed up: "You are not signed up for this raid." under the buttons; a raid without times: "This raid has no times yet: "Set time…" gives them.". Open the form, wait until its time is past (or move to another group on Discord), Submit: "That time is no longer offered: press Meet… again." / "Your group changed meanwhile: try again.".
+
+## Staff's Delete… (X1)
+
+18. **Who sees it.** Googer: "Delete…" in the map's line beside Open on Discord, on every party; Tester: none.
+19. **Archive.** Googer: Delete… on the train: "Close this train" with "The post": Archive post / Delete post, nothing picked; Submit without a pick says "Pick Archive post or Delete post first."; Archive post: "This train is closed: I am archiving and locking its post."; the popup or card closes, the train leaves the map, its post on Discord says "This train was closed by **Googer** (@Googer)." and is archived.
+20. **Delete.** On the meetup: Delete post: "This meetup is closed: I am deleting its post."; the post is gone on Discord.
+21. **Archive only.** Take Manage Threads from the bot in West's forum: the form says the post will be archived and why, naming "#west-raids", and Submit archives; a form opened before the permission went says "I can't delete posts in #west-raids (Manage Threads is missing there). Archive it, or delete it yourself." for Delete post. A report of the party that was open reads "Closed by Googer".
+
+21a. **Only its own popup closes.** Googer submits Delete… on one party, and opens another party's popup before the answer comes: the other popup stays open (review W-6).
+21b. **A moderator who lost the role.** Take the Moderator role from Bob while his map still shows Delete… (wait less than a minute, the directory's): his Submit is refused 403 "Only admins and moderators can do that." by the fresh fetch, and nothing is closed.
+
+## Report… (X2)
+
+21c. **Hidden, not barred.** Tester without the role that lets him see West's forum (nobody keeps him out): West's raid is on his map, he changes its hatch (allowed, C1), and his map's line has no Report… (review W-7; Matt to confirm with C1).
+21d. **Not sent.** With the moderators' channel set and the bot refused there for a moment (take its Send Messages): Report… says "I could not send your report to the moderators. Try again later."; the use is given back (five more reports still go through within the hour).
+
+22. **Into the post.** Without the moderators' channel, as Tester: Report… opens "Report this raid to the moderators", "What is wrong?" (1,000 characters); a reason of spaces: "Say what is wrong, so that the moderators know what to look at."; a reason: "I have put your report into the post, for the moderators.", the staff roles pinged in the post as `/report` pings them.
+23. **To the moderators.** With `settings.channels.moderation` set: "Sent to the moderators."; the report's post in the moderators' channel names Tester and the reason; opening Report… again: "You already reported this." under the buttons, the form not opened. A report on Discord (`/report`) of the same party by Tester is refused the same way.
+24. **Its window.** Five an hour between `/report`, the Apps menu and the map: the sixth opening says "You can use /report again in …".
+
+## The forms on the page
+
+25. **Held.** With a form open in a popup, the other controls that open a form are off (Report raid, Change…, New train, Group…, Meet…, Delete…, Report…); Cancel, Escape and closing the popup each let it go.
+26. **In the list and the card.** Open a party from the list (a line shown with its post): each form opens under its line; on a phone (360–414 px) each opens in the card, and closing the card lets it go.
+27. **Light and dark** on the desktop and the phone: the forms are on Discord's dialog background, readable in both.
+28. **Max battles.** Not drawn on the page yet (8M-9): `GET /s/<guild>/api/parties/<a max battle's id>/meet` answers its five-minute times (the browser), and the completion question of a max battle's Done reaches the map's `asked` in `/api/parties`'s JSON.
````

## After the last task

- [ ] `npm run check > var/8m8b-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 994cca9c6501f2aa4eeb91e339cafed1ba7cbc94 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
