# Phase 8M-8A: A Party's Popup Is Its Post: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the first of the three 8M-8 plans of the web polish (8M-8A the post drawn on the map; 8M-8B the post's controls as web forms; 8M-8C Split…, Manage… beyond the conductor and kind, the drag-to-reorder route editor): a party's popup on the map, and on a phone its card, is drawn from the very layout its Discord post was last shown with.

- **Task 1, roles:** each text of a post's layout says what it is (head, where, trainers, note); Discord's messages unchanged.
- **Task 2, text as nodes:** `postText` reads the posts' markdown into typed nodes, undoing `plain()`'s escapes; links only where allowed; no member id reaches the page.
- **Task 3, the post as data:** `PartyService.layoutOf`; `postView`; a `postKey` per party in `/api/parties` and `GET /s/<guild>/api/parties/<id>/post?k=`; every button mapped to what it does on the map; who may move a train said by the server (`moveRefusal`).
- **Task 4, pictures:** the application's emoji and the places' Wayfarer pictures served by Pine through the image cache (no open proxy, no new CSP host).
- **Task 5, the popup:** the page draws the post; today's map abilities kept behind its buttons; times in the reader's zone; posts fetched ahead without the popup jumping; no "Report raid" at a gym that shows a raid.
- **Task 6, the phone card:** a card docked at the bottom, summary then the whole post; forms in it held; the list's focus (8M-7's N1).
- **Task 7, docs and the staging checklist.**

**Tech stack:** TypeScript 6.0, Node 24, Leaflet, esbuild, Fastify and Vitest. No new dependency, no migration, no setting, no command change (no deploy needed).

**Spec:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` (approved by Matt 2026-10-25) and the brief `.superpowers/sdd/2026-10-26-phase-8m8a-post-popups/design.md` (git-ignored) with its builder check's rulings, `fix-list.md`, `fix-list-2.md` and `progress.md`.

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8m8a` (tip `a9142aea`), one commit per task, on typescript-migration 771dfad5 (8M-7, 8R-9 and 8W-6 merged). Each commit typechecks and passes its tests; on the tip the full check passes (10,041 tests), the build passes and the database suite passes (611 tests).

**Reviews:**

- **The brief:** an Opus builder check found four wrong premises (no party version, no nameless viewer class, no tagged blocks, the real markdown subset) and the controls' table missing; all ruled by the controller.
- **The prototype:** an Opus review (high): ready after fixes, 3 Important (a form in the phone card froze the page, "Report raid" at a gym showing its raid, the popup jumping when its post arrived), 14 Minor; fix round 1 folded in.
- **The fix round:** a scoped Opus re-review: 1 Important (the page worked out who may move a train: now the server says it), 8 Minor; fix round 2 folded in with the rebase onto typescript-migration.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `parties-and-posts.md`, `trains.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck (root and `src/web/client`) and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- A member's own text in a post (a train's name, a meetup's information, a member's name) never becomes formatting, a link, a mention or an id on the page (task 2's property test).
- A member barred from a forum gets neither its post nor its pictures nor another post's name through a cached key (task 3, 4).
- Every control of every kind of post does on the map what it did before, or says where to do it, and nothing is doubled (task 3, 5).
- A phone: a form in the card, then the card closed by every way; two cards in a row (task 6).
- A restart: until a post is shown again the popup is the old summary; after the emoji are read the posts come (task 3).

---

## Tasks

### Task 1: 8M-8A task 1: roles on a post's blocks

Prototype commit: `772d2c34826412e260c154960a2c9ab37887c9ed`

Each text of a post's layout says what it is about (BlockRole: head,
where, trainers, note), set by the four renderers: the heading block,
Where (a train's stops ahead too), each group's text and the meeting
hint, and the small print of who reported or made it. The live map's
phone card picks the heading and the main buttons out by it. Discord's
message never shows a role: postMessage ignores it, tested per kind
against the same layout without roles. A meetup's information has none.

**Files:**

```
 src/render/max-post.test.ts    | 17 ++++++++++++++++-
 src/render/max-post.ts         |  6 ++++--
 src/render/meetup-post.test.ts | 16 ++++++++++++++++
 src/render/meetup-post.ts      |  6 ++++--
 src/render/party-post.ts       | 26 +++++++++++++++++++++++---
 src/render/raid-post.test.ts   | 18 ++++++++++++++++++
 src/render/raid-post.ts        |  6 ++++--
 src/render/train-post.test.ts  | 16 ++++++++++++++++
 src/render/train-post.ts       |  6 ++++--
 test/support/post-roles.ts     | 25 +++++++++++++++++++++++++
 10 files changed, 130 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/max-post.test.ts src/render/meetup-post.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 772d2c34826412e260c154960a2c9ab37887c9ed -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8A task 1: roles on a post's blocks`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/render/max-post.test.ts b/src/render/max-post.test.ts
index 38dfa86a6b13c86c176a15043198926dcfe2a73d..d9c745128cd113b91341b90b743ced4054cc7d9b 100644
--- a/src/render/max-post.test.ts
+++ b/src/render/max-post.test.ts
@@ -32,7 +32,8 @@ import {
   UNCERTAIN_MAX_TIME,
   type MaxPostView,
 } from './max-post.js';
-import { ENDED_COLOUR, KEPT_OPEN } from './party-post.js';
+import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
+import { ENDED_COLOUR, KEPT_OPEN, postMessage } from './party-post.js';
 import { renderRegionLink } from './summary.js';
 
 const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
@@ -263,3 +264,17 @@ describe('renderMaxPost: groups, controls and the rest', () => {
     expectSendable(post(endParty(party), { now: END }));
   });
 });
+
+describe('the roles of a max battle post’s blocks (plan 8M-8A)', () => {
+  it('marks its heading, Where, trainers and small print, which its message does not show', () => {
+    const party = withAttendees(testMax(), { [ALICE]: { name: 'Alice' } });
+    const rendered = post(party);
+    expect(roleLines(rendered.layout)).toEqual([
+      ['head', '### Dynamax Machamp (2★)'],
+      ['where', '**Where**'],
+      ['trainers', '1/4 coming · 1 interested'],
+      ['note', expect.stringMatching(/^-# Reported by /u)],
+    ]);
+    expect(postMessage(rendered.layout)).toEqual(postMessage(withoutRoles(rendered.layout)));
+  });
+});
diff --git a/src/render/max-post.ts b/src/render/max-post.ts
index 060b6e346548979a8bc83759bc2020a8888f2ded..920e3acf73bebcab3bbe4c91cadc08734eb6ffe8 100644
--- a/src/render/max-post.ts
+++ b/src/render/max-post.ts
@@ -15,6 +15,7 @@ import { bottomControls } from './party-controls.js';
 import {
   ENDED_COLOUR,
   fittedLayout,
+  inRole,
   KEPT_OPEN,
   renderedPost,
   tidyTitle,
@@ -249,9 +250,9 @@ function maxLayout(view: MaxPostView): PostLayout {
     accent: colour(view),
     ...(boss.image === undefined ? {} : { picture: boss.image }),
     blocks: [
-      { type: 'section', content: header, accessory: 'picture' },
+      { type: 'section', content: header, accessory: 'picture', role: 'head' },
       { type: 'separator' },
-      maxWhere(view, fit),
+      inRole('where', maxWhere(view, fit)),
       { type: 'separator' },
       // The hint names Meet…, which a max battle has while it is on.
       ...trainerBlocks(view, { complete: true, lobby: true, meetHint: !shownOver(view) }, fit),
@@ -262,6 +263,7 @@ function maxLayout(view: MaxPostView): PostLayout {
         : [
             {
               type: 'text' as const,
+              role: 'note' as const,
               content: `-# Reported by ${memberByName(memberOf(party, party.createdById))}`,
             },
           ]),
diff --git a/src/render/meetup-post.test.ts b/src/render/meetup-post.test.ts
index 46c804c2cde692ddd684bfc243731873b9b6d216..295fd3ef2a210a7b10367e255bacf1ff66153242 100644
--- a/src/render/meetup-post.test.ts
+++ b/src/render/meetup-post.test.ts
@@ -14,6 +14,7 @@ import {
   thumbnailsOf,
 } from '../../test/support/messages.js';
 import { keptRow } from '../../test/support/wayspot-cases.js';
+import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
 import {
   ALICE,
   at,
@@ -424,6 +425,21 @@ describe('the Where of a meetup post', () => {
   const whereOf = (party: MeetupParty, extra: Partial<MeetupPostView> = {}) =>
     block(renderMeetupPost(view(party, extra)), '**Where**');
 
+  it('marks its heading, Where, trainers and small print by role (plan 8M-8A)', () => {
+    const party = withAttendees(described('Bring trade lists.', placed(pin(null, null))), {
+      [ALICE]: { name: 'Alice' },
+    });
+    const post = renderMeetupPost(view(party));
+    // What the meetup is for has no role: the map's card leaves it to the whole post.
+    expect(roleLines(post.layout)).toEqual([
+      ['head', expect.stringMatching(/^### Meetup: /u)],
+      ['where', '**Where**'],
+      ['trainers', '2 trainers'],
+      ['note', expect.stringMatching(/^-# Created by /u)],
+    ]);
+    expect(postMessage(post.layout)).toEqual(postMessage(withoutRoles(post.layout)));
+  });
+
   it('says where a meetup near a PokéStop is, with its picture beside', () => {
     const post = renderMeetupPost(view(described('Bring trade lists.', placed(STOP))));
     // After the heading block, before what the meetup is for.
diff --git a/src/render/meetup-post.ts b/src/render/meetup-post.ts
index a2da783051c1541bd5af4a985b1486834a266a18..f24cfae9b6ab00b3c0a569d125450ee61bdbd500 100644
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -5,6 +5,7 @@ import {
   cutText,
   ENDED_COLOUR,
   fittedLayout,
+  inRole,
   KEPT_OPEN,
   renderedPost,
   tidyTitle,
@@ -202,9 +203,9 @@ function meetupLayout(view: MeetupPostView): PostLayout {
   return fittedLayout((fit) => ({
     accent: colour(view),
     blocks: [
-      { type: 'text', content: header },
+      { type: 'text', content: header, role: 'head' },
       { type: 'separator' },
-      ...meetupWhere(view, fit),
+      ...meetupWhere(view, fit).map((block) => inRole('where', block)),
       { type: 'separator' },
       ...(about === ''
         ? []
@@ -215,6 +216,7 @@ function meetupLayout(view: MeetupPostView): PostLayout {
       { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
       {
         type: 'text',
+        role: 'note',
         content: `-# Created by ${memberByName(memberOf(party, party.createdById))}`,
       },
     ],
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index afe2b28f7c97ecbfbe2adb88b7939552ef1106f5..40e10cf3ef2d9776401d58dd9487d57cb6647b8b 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -259,6 +259,7 @@ export type PostBlock =
   | {
       type: 'text';
       content: string;
+      role?: BlockRole;
     }
   | { type: 'separator' }
   | {
@@ -266,9 +267,25 @@ export type PostBlock =
       content: string;
       accessory: 'picture' | PostButton | PostThumbnail;
       details?: string;
+      role?: BlockRole;
     }
   | { type: 'controls'; rows: PostButton[][] };
 
+/**
+ * What a text of a post is about (plan 8M-8A), for the live map's phone card, which shows the
+ * heading block (what the party is, its times, its boss) and the main buttons and leaves the rest
+ * to the whole post: `head`, `where` (its place, and a train's stops ahead), `trainers` (who
+ * comes, a group's text each, and the meeting-time hint), `note` (the small print of who
+ * reported or made it). Set by the renderers; Discord's message never shows it (`postMessage`
+ * ignores it). A text without one (a meetup's information) is only in the whole post.
+ */
+export type BlockRole = 'head' | 'where' | 'trainers' | 'note';
+
+/** A text of a post marked with its role; any other block as it is. */
+export function inRole(role: BlockRole, block: PostBlock): PostBlock {
+  return block.type === 'text' || block.type === 'section' ? { ...block, role } : block;
+}
+
 /** A post as its renderer lays it out: the colour of its edge, its picture and its parts. */
 export interface PostLayout {
   accent: number;
@@ -789,12 +806,13 @@ export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit:
         ? [noMeetingTime(meet)]
         : []),
     ];
-    return [{ type: 'text', content: content.join('\n') }];
+    return [{ type: 'text', content: content.join('\n'), role: 'trainers' }];
   }
   const blocks: PostBlock[] = party.groups.map((group) => {
     const lines = statusLines(view, GROUP_STATUSES, fit, group.id);
     return {
       type: 'text',
+      role: 'trainers',
       content: [
         ...heading(group),
         ...lobbyNote(view, group, options),
@@ -804,14 +822,16 @@ export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit:
   });
   if (options.complete) {
     const done = statusLines(view, ['complete'], fit);
-    if (done.length > 0) blocks.push({ type: 'text', content: done.join('\n') });
+    if (done.length > 0) {
+      blocks.push({ type: 'text', content: done.join('\n'), role: 'trainers' });
+    }
   }
   // Only of a group somebody is in: nobody else could set one for it.
   const timeless = party.groups
     .filter((group) => group.startTime === undefined && headCount(party, group.id) > 0)
     .map((group) => group.id);
   if (options.meetHint && timeless.length > 0) {
-    blocks.push({ type: 'text', content: groupMeetingHint(timeless, meet) });
+    blocks.push({ type: 'text', content: groupMeetingHint(timeless, meet), role: 'trainers' });
   }
   return blocks;
 }
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index ee2b223770c5f2dda0170ab9766d8c497be1e705..27f97991bcaf3c430dc824beb8e9c7f0de30baf1 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -30,6 +30,7 @@ import {
   withAttendees,
 } from '../../test/support/parties.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
+import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
 import { renderMirror } from './mirrors.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import type { Attendee, RaidParty } from '../domain/party/party.js';
@@ -1275,3 +1276,20 @@ describe('the hint of a raid without a meeting time (8D-F, F4; Meet… by its ic
     }
   });
 });
+
+describe('the roles of a raid post’s blocks (plan 8M-8A)', () => {
+  it('marks its heading, Where, trainers and small print, which its message does not show', () => {
+    const party = withAttendees(yveltal, {
+      [ALICE]: { name: 'Alice' },
+      [BOB]: { name: 'Bob', status: PartyStatus.Interested },
+    });
+    const post = renderRaidPost(view(party));
+    expect(roleLines(post.layout)).toEqual([
+      ['head', '### Level 5 raid (egg)'],
+      ['where', WHERE],
+      ['trainers', '3 trainers'],
+      ['note', expect.stringMatching(/^-# Reported by /u)],
+    ]);
+    expect(postMessage(post.layout)).toEqual(postMessage(withoutRoles(post.layout)));
+  });
+});
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index cbacf462653af7629773b872340d0a04570218ca..63466d9622a26a2d157ecc8d35a37c9b4a836350 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -26,6 +26,7 @@ import {
   cutText,
   ENDED_COLOUR,
   fittedLayout,
+  inRole,
   KEPT_OPEN,
   renderedPost,
   tidyTitle,
@@ -629,9 +630,9 @@ function raidLayout(view: RaidPostView): PostLayout {
     ...(picture === undefined ? {} : { picture }),
     ...(pictureFile === undefined ? {} : { pictureFile }),
     blocks: [
-      { type: 'section', content: header, accessory: 'picture' },
+      { type: 'section', content: header, accessory: 'picture', role: 'head' },
       { type: 'separator' },
-      gymWhere(WHERE_HEADING, gym, fit),
+      inRole('where', gymWhere(WHERE_HEADING, gym, fit)),
       { type: 'separator' },
       // The hint names Meet…, which a raid has only once it has times.
       ...trainerBlocks(
@@ -646,6 +647,7 @@ function raidLayout(view: RaidPostView): PostLayout {
         : [
             {
               type: 'text' as const,
+              role: 'note' as const,
               content: `-# Reported by ${memberByName(memberOf(party, party.createdById))}`,
             },
           ]),
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index 43d70cce3f76b093e839067da93b7c03b6d3c9b8..b0d3aeaa04d4e45af2715b73a80de9405dce5c4f 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -31,6 +31,7 @@ import {
   stops,
 } from '../../test/support/parties.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
+import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
 import { decodeCustomId } from '../discord/custom-id.js';
 import {
   endParty,
@@ -958,3 +959,18 @@ describe('movementText', () => {
     );
   });
 });
+
+describe('the roles of a train post’s blocks (plan 8M-8A)', () => {
+  it('marks its heading, Where with what lies ahead, trainers and small print', () => {
+    const party = withAttendees(onRoute([1, 2, 3, 4, 5], 1), { [ALICE]: { name: 'Alice' } });
+    const post = renderTrainPost(view(party));
+    expect(roleLines(post.layout)).toEqual([
+      ['head', expect.stringMatching(/^### Raid Train: /u)],
+      ['where', '**Where · stop 2 of 5**'],
+      ['where', expect.stringMatching(/^-# Next: 3\. /u)],
+      ['trainers', '2 trainers'],
+      ['note', expect.stringMatching(/^-# Created by /u)],
+    ]);
+    expect(postMessage(post.layout)).toEqual(postMessage(withoutRoles(post.layout)));
+  });
+});
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index 31eecb43e21b09f2cc1f78bbd94f5ec32d96cb01..be7d4eb939a2d7cdba4132711ff5f074e1cd7ec2 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -19,6 +19,7 @@ import {
   cutText,
   ENDED_COLOUR,
   fittedLayout,
+  inRole,
   KEPT_OPEN,
   renderedPost,
   tidyTitle,
@@ -209,7 +210,7 @@ function trainWhere(view: TrainPostView, fit: Fit): PostBlock[] {
       : at === undefined
         ? { type: 'text', content: `${WHERE_HEADING}\nRoute complete` }
         : stopWhere(`**Where · stop ${stop + 1} of ${route.length}**`, view.stop(at), fit);
-  return [where, ...aheadLine(view, fit)];
+  return [where, ...aheadLine(view, fit)].map((block) => inRole('where', block));
 }
 
 /** The room the small print of a train's splits may take. */
@@ -288,7 +289,7 @@ function trainLayout(view: TrainPostView): PostLayout {
     accent: colour(view),
     ...(boss?.image === undefined ? {} : { picture: boss.image }),
     blocks: [
-      { type: 'section', content: header(fit), accessory: 'picture' },
+      { type: 'section', content: header(fit), accessory: 'picture', role: 'head' },
       { type: 'separator' },
       ...trainWhere(view, fit),
       { type: 'separator' },
@@ -316,6 +317,7 @@ function trainLayout(view: TrainPostView): PostLayout {
         : [
             {
               type: 'text' as const,
+              role: 'note' as const,
               content: `-# Created by ${memberByName(memberOf(party, party.createdById))}`,
             },
           ]),
diff --git a/test/support/post-roles.ts b/test/support/post-roles.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fd87bc46e27426af09572d1dcb66ae59c12c9cde
--- /dev/null
+++ b/test/support/post-roles.ts
@@ -0,0 +1,25 @@
+import type { PostBlock, PostLayout } from '../../src/render/party-post.js';
+
+/**
+ * The blocks of a post's layout that have a role (plan 8M-8A: what the map's phone card picks
+ * out), each as its role and the first line of its text, in order.
+ */
+export function roleLines(layout: PostLayout): Array<[string, string]> {
+  return layout.blocks.flatMap((block) =>
+    (block.type === 'text' || block.type === 'section') && block.role !== undefined
+      ? [[block.role, block.content.split('\n')[0] ?? ''] as [string, string]]
+      : [],
+  );
+}
+
+/** The layout as it would be without any role: what Discord's message must not tell apart. */
+export function withoutRoles(layout: PostLayout): PostLayout {
+  return {
+    ...layout,
+    blocks: layout.blocks.map((block): PostBlock => {
+      if (block.type !== 'text' && block.type !== 'section') return block;
+      const { role: _role, ...rest } = block;
+      return rest;
+    }),
+  };
+}
````

### Task 2: 8M-8A task 2: a post's text read into nodes

Prototype commit: `e807726ba828e9d87b9025cfd1b042ea1c63a767`

postText (src/render/post-text.ts, pure) reads the markdown the posts
use into lines of nodes for the live map: headings, small print, bold,
italics, strike, inline code, masked links with and without angle
brackets, bare links, posts linked as <#id>, members as <@id>, custom
emoji, timestamps. A link only where the caller allows its address,
else its text; a member without a name is "unknown member", never an
id; a custom emoji with Pine's picture where Pine serves one, else its
name. What plain and plainNoLinks did is undone: escapes, also in link
text, and their zero-width spaces, so an address a name broke stays
text. The node types are in party-data.ts (no imports, for the page).
No new dependency.

Tested on the posts' own texts (the uncertain time's note, a Where's
Map, a split train's link, the meeting hint) and by a property: the
text of plain(s), plainLines(s) and plainNoLinks(s) reads as s.

**Files:**

```
 src/domain/web/party-data.ts |  29 ++++++++++++++
 src/render/post-text.test.ts | 313 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/post-text.ts      | 347 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 689 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/post-text.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e807726ba828e9d87b9025cfd1b042ea1c63a767 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8A task 2: a post's text read into nodes`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 6e38896f4d16ded580b0a526065230aa6fa43ae9..c3f97e28f3ccefa141870fe2674d17748492d940 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -342,6 +342,35 @@ export interface PartiesView {
   meetups: MapMeetup[];
 }
 
+/**
+ * How a time of a post is shown (Discord's timestamp styles): `t` a clock time, `T` with seconds,
+ * `d` a short date, `D` a long one, `f` the date and clock time, `F` with the weekday, `R` how long
+ * until or since. The page shows each in the reader's own zone and language, as Discord does.
+ */
+export type PostTimeStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';
+
+/**
+ * A piece of a post's text as the page draws it (plan 8M-8A): Discord's markdown read on the
+ * server (`postText`, `src/render/post-text.ts`) into nodes, never HTML. `text` is as a reader sees
+ * it (the escapes of what members wrote undone); `link` only to an address the server allows
+ * (Google Maps, a post of this server on Discord, Pine's own pages), which the page checks again;
+ * `emoji` with Pine's address of its picture where Pine serves one (`src`), else its name to show;
+ * `time` in epoch milliseconds.
+ */
+export type PostNode =
+  | { kind: 'text'; text: string }
+  | { kind: 'strong' | 'em' | 'strike' | 'underline'; children: PostNode[] }
+  | { kind: 'code'; text: string }
+  | { kind: 'link'; href: string; children: PostNode[] }
+  | { kind: 'emoji'; name: string; src?: string }
+  | { kind: 'time'; at: number; style: PostTimeStyle };
+
+/** A line of a post's text: a heading (`###`), small print (`-#`) or a plain line. */
+export interface PostLine {
+  style: 'heading' | 'small' | 'plain';
+  nodes: PostNode[];
+}
+
 /**
  * What a press answers (`POST /s/<guild>/api/parties/<id>/<action>`): the words alone; the page
  * asks for the list again after a press.
diff --git a/src/render/post-text.test.ts b/src/render/post-text.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..41d47cb0afcf2ac26fcc9e383d7b71f29b0043a6
--- /dev/null
+++ b/src/render/post-text.test.ts
@@ -0,0 +1,313 @@
+import { describe, expect, it } from 'vitest';
+import type { PostLine, PostNode } from '../domain/web/party-data.js';
+import { noMeetingTime } from './party-post.js';
+import { postText, type PostTextOptions } from './post-text.js';
+import { linkTextOf, mapMarkdown, UNCERTAIN_TIME } from './raid-post.js';
+import { memberName, plain, plainLines, plainNoLinks, timestamp } from './text.js';
+
+const GUILD = '412345678901234567';
+const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';
+
+/** Google Maps and this server's posts may be links; Pine serves the emoji of id 1111…. */
+const options: PostTextOptions = {
+  emoji: (id) => (id === '111111111111111111' ? `/emoji/${id}.png` : undefined),
+  channel: (id) => ({
+    href: `https://discord.com/channels/${GUILD}/${id}`,
+    name: id === '555555555555555555' ? 'Train · Library run' : 'another post',
+  }),
+  linkable: (url) =>
+    url.startsWith('https://www.google.com/maps/') ||
+    url.startsWith(`https://discord.com/channels/${GUILD}/`),
+};
+
+const read = (text: string): PostLine[] => postText(text, options);
+
+/** The text a reader sees of nodes: what each shows, emoji by name, times by their moment. */
+function shown(nodes: readonly PostNode[]): string {
+  return nodes
+    .map((node) => {
+      switch (node.kind) {
+        case 'text':
+        case 'code':
+          return node.text;
+        case 'emoji':
+          return `:${node.name}:`;
+        case 'time':
+          return `[${node.at}]`;
+        default:
+          return shown(node.children);
+      }
+    })
+    .join('');
+}
+
+const text = (value: string): PostNode => ({ kind: 'text', text: value });
+
+describe('postText: the lines', () => {
+  it('reads a heading, small print and plain lines, an empty line kept', () => {
+    expect(read('### Level 5 raid (egg)\nHatches soon.\n\n-# Reported by **Ash**')).toEqual([
+      { style: 'heading', nodes: [text('Level 5 raid (egg)')] },
+      { style: 'plain', nodes: [text('Hatches soon.')] },
+      { style: 'plain', nodes: [] },
+      {
+        style: 'small',
+        nodes: [text('Reported by '), { kind: 'strong', children: [text('Ash')] }],
+      },
+    ]);
+  });
+
+  it('takes an escaped heading or small print as text, as Discord does', () => {
+    expect(read(plain('### not a heading'))).toEqual([
+      { style: 'plain', nodes: [text('### not a heading')] },
+    ]);
+    expect(read(plain('-# not small'))).toEqual([
+      { style: 'plain', nodes: [text('-# not small')] },
+    ]);
+  });
+});
+
+describe('postText: inside a line', () => {
+  it('reads bold, italics, strike and code, nested', () => {
+    expect(read('**Where · stop 2 of 7** and *soon* ~~1\\. Library~~ `/hatch`')).toEqual([
+      {
+        style: 'plain',
+        nodes: [
+          { kind: 'strong', children: [text('Where · stop 2 of 7')] },
+          text(' and '),
+          { kind: 'em', children: [text('soon')] },
+          text(' '),
+          { kind: 'strike', children: [text('1. Library')] },
+          text(' '),
+          { kind: 'code', text: '/hatch' },
+        ],
+      },
+    ]);
+    expect(read('**2\\. *The Stacks*** (the train is here)')[0]?.nodes).toEqual([
+      {
+        kind: 'strong',
+        children: [text('2. '), { kind: 'em', children: [text('The Stacks')] }],
+      },
+      text(' (the train is here)'),
+    ]);
+  });
+
+  it('leaves a marker that opens nothing as text', () => {
+    expect(read('a * b ** c ~~')[0]?.nodes).toEqual([text('a * b ** c ~~')]);
+  });
+
+  it('reads the uncertain time’s note, with its command in code', () => {
+    const [line] = read(UNCERTAIN_TIME);
+    expect(line?.nodes).toContainEqual({ kind: 'code', text: '/hatch' });
+    expect(shown(line?.nodes ?? [])).toBe(UNCERTAIN_TIME.replaceAll('`', ''));
+  });
+
+  it('reads the Map of a Where as a link, its address in angle brackets or not', () => {
+    expect(read(`**Library** · ${mapMarkdown({ lat: 40.05, lon: -80.05 })}`)[0]?.nodes).toEqual([
+      { kind: 'strong', children: [text('Library')] },
+      text(' · '),
+      { kind: 'link', href: MAPS, children: [text('Map')] },
+    ]);
+    expect(read(`[Map](${MAPS})`)[0]?.nodes).toEqual([
+      { kind: 'link', href: MAPS, children: [text('Map')] },
+    ]);
+  });
+
+  it('reads a link’s text with its escapes undone', () => {
+    expect(read(`[${linkTextOf('Fire [Co] Inc.')}](<${MAPS}>)`)[0]?.nodes).toEqual([
+      { kind: 'link', href: MAPS, children: [text('Fire [Co] Inc.')] },
+    ]);
+  });
+
+  it('shows a link to an address the page may not link as its text', () => {
+    expect(read('[Click](<https://evil.example/x>) and [Map](http://maps.google.com)')).toEqual([
+      { style: 'plain', nodes: [text('Click and Map')] },
+    ]);
+  });
+
+  it('links a bare address the page may link, and leaves another as text', () => {
+    expect(read(`See ${MAPS}. Or https://evil.example/x`)[0]?.nodes).toEqual([
+      text('See '),
+      { kind: 'link', href: MAPS, children: [text(MAPS)] },
+      text('. Or https://evil.example/x'),
+    ]);
+    expect(read(`<${MAPS}>`)[0]?.nodes).toEqual([
+      { kind: 'link', href: MAPS, children: [text(MAPS)] },
+    ]);
+  });
+
+  it('never links an address a member’s name broke (plainNoLinks)', () => {
+    const name = plainNoLinks(`Ash ${MAPS}`);
+    expect(read(name)[0]?.nodes).toEqual([text(`Ash ${MAPS}`)]);
+  });
+
+  it('reads custom emoji: Pine’s picture where it serves one, else the name', () => {
+    expect(
+      read('<:pinejoin:111111111111111111> Coming (2) <a:spin:222222222222222222> 🤔')[0]?.nodes,
+    ).toEqual([
+      { kind: 'emoji', name: 'pinejoin', src: '/emoji/111111111111111111.png' },
+      text(' Coming (2) '),
+      { kind: 'emoji', name: 'spin' },
+      text(' 🤔'),
+    ]);
+  });
+
+  it('reads a timestamp as its moment and style, Discord’s f without one', () => {
+    const at = 1_760_000_000_000;
+    expect(read(`Hatches ${timestamp(at, 'R')}, at ${timestamp(at)}. <t:1760000000>`)).toEqual([
+      {
+        style: 'plain',
+        nodes: [
+          text('Hatches '),
+          { kind: 'time', at, style: 'R' },
+          text(', at '),
+          { kind: 'time', at, style: 't' },
+          text('. '),
+          { kind: 'time', at, style: 'f' },
+        ],
+      },
+    ]);
+  });
+
+  it('shows a timestamp no date can be as it is written (review 8A-14)', () => {
+    expect(read('at <t:99999999999999999:t> and <t:9000000000000:R>')).toEqual([
+      { style: 'plain', nodes: [text('at <t:99999999999999999:t> and <t:9000000000000:R>')] },
+    ]);
+  });
+
+  it('reads __text__ as underlined, as Discord does (review 8A-14)', () => {
+    expect(read('a __b__ c')[0]?.nodes).toEqual([
+      text('a '),
+      { kind: 'underline', children: [text('b')] },
+      text(' c'),
+    ]);
+  });
+
+  it('names a member without a name as unknown, never by the id', () => {
+    const nodes = read(`Coming (2): Ash, ${memberName({ id: '333333333333333333' })}`)[0]?.nodes;
+    expect(nodes).toEqual([text('Coming (2): Ash, unknown member')]);
+  });
+
+  it('links another post by the name the reader may see', () => {
+    expect(read('-# Split off from <#555555555555555555>')[0]).toEqual({
+      style: 'small',
+      nodes: [
+        text('Split off from '),
+        {
+          kind: 'link',
+          href: `https://discord.com/channels/${GUILD}/555555555555555555`,
+          children: [text('Train · Library run')],
+        },
+      ],
+    });
+    expect(shown(read('went its own way: <#666666666666666666>')[0]?.nodes ?? [])).toBe(
+      'went its own way: another post',
+    );
+  });
+
+  it('reads the meeting hint with Meet…’s icon', () => {
+    expect(read(noMeetingTime('⏰'))).toEqual([
+      { style: 'small', nodes: [text('No meeting time yet: ⏰ sets one.')] },
+    ]);
+  });
+});
+
+/** Small random texts with every character the markdown reads, from a seed (no library). */
+function texts(seed: number, count: number): string[] {
+  const pieces = [
+    'a',
+    'Z',
+    '7',
+    ' ',
+    '  ',
+    '*',
+    '**',
+    '_',
+    '~~',
+    '`',
+    '\\',
+    '|',
+    '>',
+    '#',
+    '-',
+    '.',
+    '[',
+    ']',
+    '(',
+    ')',
+    '<',
+    '@',
+    ':',
+    '/',
+    'everyone',
+    'here',
+    'https://x.test/a',
+    `${MAPS}`,
+    '<:pinejoin:111111111111111111>',
+    '<t:1760000000:R>',
+    '<@333333333333333333>',
+    '<#555555555555555555>',
+    '### ',
+    '-# ',
+    '1. ',
+    'é',
+    '🎉',
+    '__',
+    'www.',
+    'ab/',
+    '\u200b',
+    '.\u200b',
+  ];
+  let state = seed;
+  const next = (): number => {
+    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
+    return state;
+  };
+  return Array.from({ length: count }, () => {
+    const length = 1 + (next() % 12);
+    return Array.from({ length }, () => pieces[next() % pieces.length]).join('');
+  });
+}
+
+/**
+ * A text a member typed with a zero-width space where `plain` or `plainNoLinks` would put one
+ * (after `<`, the `@` of a mass mention, the `:` or `.` of an address): which is theirs cannot be
+ * told (as `unplain` says), so the property leaves such texts out.
+ */
+const ambiguous = (typed: string): boolean =>
+  /<\u200b|@\u200b(?:everyone|here)|:\u200b[\\/]|\.\u200b[a-z0-9-]{2,}\/|www\.\u200b/iu.test(
+    typed,
+  ) ||
+  // discord.js escapes a run of four asterisks as `*\*\**`, which Discord itself reads as
+  // italics: a limit of `plain`, not of the reader (Discord shows the same).
+  /\*{4}/u.test(typed);
+
+describe('postText: what members wrote reads as they wrote it', () => {
+  it('leaves out few texts as ambiguous', () => {
+    const all = texts(8, 3_000);
+    expect(all.filter(ambiguous).length).toBeLessThan(all.length / 10);
+  });
+
+  it('gives back the text of plain(s), its white space as plain leaves it', () => {
+    for (const typed of texts(8, 3_000).filter((one) => !ambiguous(one))) {
+      const lines = read(plain(typed));
+      expect(lines, JSON.stringify(typed)).toHaveLength(1);
+      expect(lines[0]?.style).toBe('plain');
+      expect(shown(lines[0]?.nodes ?? []), JSON.stringify(typed)).toBe(
+        typed.replace(/\s+/gu, ' ').trim(),
+      );
+    }
+  });
+
+  it('gives back the lines of plainLines(s) and the text of plainNoLinks(s)', () => {
+    for (const typed of texts(21, 1_000).filter((one) => !ambiguous(one))) {
+      const two = `${typed}\n${typed}`;
+      const lines = read(plainLines(two));
+      const tidy = typed.replace(/\s+/gu, ' ').trim();
+      expect(
+        lines.map((line) => shown(line.nodes)),
+        JSON.stringify(two),
+      ).toEqual(tidy === '' ? [''] : [tidy, tidy]);
+      expect(shown(read(plainNoLinks(typed))[0]?.nodes ?? []), JSON.stringify(typed)).toBe(tidy);
+    }
+  });
+});
diff --git a/src/render/post-text.ts b/src/render/post-text.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8a21738ce30f82dd65ddf7a662b0022b1a2a2acd
--- /dev/null
+++ b/src/render/post-text.ts
@@ -0,0 +1,347 @@
+import type { PostLine, PostNode, PostTimeStyle } from '../domain/web/party-data.js';
+
+/** What reading a post's text needs to know of where it is shown (plan 8M-8A). */
+export interface PostTextOptions {
+  /** Pine's address of a custom emoji's picture, undefined where Pine serves none. */
+  emoji(id: string, name: string): string | undefined;
+  /** A post linked as `<#id>` (a split train's other post): its address and its name to show. */
+  channel(id: string): { href: string; name: string };
+  /** Whether an address may be a link on the page. */
+  linkable(url: string): boolean;
+}
+
+/** What a member without a name is called (`memberName` falls back to their mention). */
+export const UNKNOWN_MEMBER = 'unknown member';
+
+/** A character a backslash escapes, as Discord (CommonMark) takes it: ASCII punctuation. */
+const ESCAPABLE = /[!-/:-@[-`{-~]/u;
+
+/**
+ * The markers of emphasis, longest first: `**` is bold, not two `*`; `__` underlines, as on
+ * Discord.
+ */
+const MARKERS = ['**', '__', '~~', '*', '_'] as const;
+type Marker = (typeof MARKERS)[number];
+const MARKED: Readonly<Record<Marker, 'strong' | 'underline' | 'strike' | 'em'>> = {
+  '**': 'strong',
+  __: 'underline',
+  '~~': 'strike',
+  '*': 'em',
+  _: 'em',
+};
+
+/**
+ * What Discord reads in angle brackets, as `text.ts`'s `ANGLED`: a member, a role, a channel or
+ * post, a custom emoji, a time, a command, an address.
+ */
+const ANGLED =
+  /^<(?:(@!?)(\d+)|@&\d+|#(\d+)|(a?):(\w+):(\d+)|t:(-?\d+)(?::([tTdDfFR]))?|\/([\w -]+):\d+|(https?:\/\/[^\s<>]+))>/u;
+
+/**
+ * A bare address, up to white space, angle brackets, a backslash (an escape `plain` wrote after
+ * it) or a backtick; where it ends is decided by `bareEnd`.
+ */
+const BARE = /^https?:\/\/[^\s<>\\`\u200b]+/u;
+
+/** How deep emphasis nests before a marker is taken as text: more than any post needs. */
+const MAX_DEPTH = 4;
+
+/**
+ * The text of a post (one of its text displays) as lines of nodes, as Discord shows it (plan
+ * 8M-8A): headings (`#` to `###`), small print (`-#`), bold, italics, strike, inline code, masked
+ * links (with and without angle brackets) and bare ones, posts linked as `<#id>`, members as
+ * `<@id>`, custom emoji, timestamps; plain emoji are text. A link only where `linkable` allows
+ * its address (else its text); a member never by id (`UNKNOWN_MEMBER`: a post names a member by
+ * name, and by mention only one the bot has no name for). What `plain` and `plainNoLinks` did to
+ * members' text is undone: its escapes, and the zero-width spaces after `<`, after the `@` of a
+ * mass mention, and after the `:` and `.` that would make an address a link (the address stays
+ * text). Anything else is shown as its text. Pure.
+ */
+export function postText(text: string, options: PostTextOptions): PostLine[] {
+  return text.split('\n').map((line) => {
+    const heading = /^#{1,3} (.*)$/u.exec(line);
+    if (heading) return { style: 'heading', nodes: inline(heading[1] ?? '', options, 0) };
+    const small = /^-# (.*)$/u.exec(line);
+    if (small) return { style: 'small', nodes: inline(small[1] ?? '', options, 0) };
+    return { style: 'plain', nodes: inline(line, options, 0) };
+  });
+}
+
+/**
+ * A zero-width space where `plain` or `plainNoLinks` put one, and nowhere else: after a `<` that
+ * something follows, after the `@` of a mass mention, after the `:` of a scheme before a slash or
+ * backslash, after `www.`, after the dot before a host's last part that a path follows (one a
+ * member typed there cannot be told from theirs, as `unplain` says).
+ */
+const ADDED_SPACE =
+  /(?<=<)\u200b(?=\S|$)|(?<=@)\u200b(?=everyone|here)|(?<=:)\u200b(?=[\\/])|(?<=\bwww\.)\u200b|(?<=\.)\u200b(?=[a-z0-9-]{2,}\/)/giu;
+
+/** Text as a reader sees it: the zero-width spaces `plain` and `plainNoLinks` added taken out. */
+function readable(text: string): string {
+  return text.replace(ADDED_SPACE, '');
+}
+
+/**
+ * Whether the character at `at` is a zero-width space `plain` or `plainNoLinks` added, after
+ * `before` (the text before it, which went into another node).
+ */
+function addedSpace(text: string, at: number, before: string): boolean {
+  if (text[at] !== '\u200b') return false;
+  const around = `${before}${text.slice(at, at + 40)}`;
+  ADDED_SPACE.lastIndex = 0;
+  for (let found = ADDED_SPACE.exec(around); found; found = ADDED_SPACE.exec(around)) {
+    if (found.index === before.length) return true;
+    if (found.index > before.length) return false;
+  }
+  return false;
+}
+
+/** Adds text to nodes, joined to the text before it. */
+function addText(nodes: PostNode[], value: string): void {
+  if (value === '') return;
+  const last = nodes.at(-1);
+  if (last?.kind === 'text') last.text += value;
+  else nodes.push({ kind: 'text', text: value });
+}
+
+/** Adds nodes, a text joined to the text before it. */
+function addAll(nodes: PostNode[], more: readonly PostNode[]): void {
+  for (const node of more) {
+    if (node.kind === 'text') addText(nodes, node.text);
+    else nodes.push(node);
+  }
+}
+
+/** A masked link `[text](<url>)` or `[text](url)` starting at `at`: its parts and its end. */
+function maskedLink(
+  text: string,
+  at: number,
+): { label: string; url: string; end: number } | undefined {
+  let close = at + 1;
+  while (close < text.length && text[close] !== ']' && text[close] !== '[') {
+    close += text[close] === '\\' ? 2 : 1;
+  }
+  if (text[close] !== ']' || text[close + 1] !== '(') return undefined;
+  const address = /^\((?:<([^\s<>]+)>|([^\s()<>]+))\)/u.exec(text.slice(close + 1));
+  if (!address) return undefined;
+  return {
+    label: text.slice(at + 1, close),
+    url: address[1] ?? address[2] ?? '',
+    end: close + 1 + address[0].length,
+  };
+}
+
+/** Where a bare address ends: before trailing punctuation, and a `)` it does not open. */
+function bareEnd(url: string): string {
+  let kept = url;
+  for (;;) {
+    const before = kept;
+    kept = kept.replace(/[.,:;!?'"]+$/u, '');
+    const opens = (kept.match(/\(/gu) ?? []).length;
+    const closes = (kept.match(/\)/gu) ?? []).length;
+    if (kept.endsWith(')') && closes > opens) kept = kept.slice(0, -1);
+    if (kept === before) return kept;
+  }
+}
+
+/** A construct that cannot hold emphasis (a code span, angle brackets, a masked link): its end. */
+function constructEnd(text: string, at: number): number | undefined {
+  const character = text[at];
+  if (character === '`') {
+    const close = text.indexOf('`', at + 1);
+    return close > at + 1 ? close + 1 : undefined;
+  }
+  if (character === '<') {
+    const angled = ANGLED.exec(text.slice(at));
+    return angled ? at + angled[0].length : undefined;
+  }
+  if (character === '[') return maskedLink(text, at)?.end;
+  return undefined;
+}
+
+const WORD = /\w/u;
+
+/**
+ * Where a marker is none in what `plain` made: an underscore inside a word (Discord's own rule),
+ * and the markers discord.js leaves unescaped, as its lookbehinds say (`escapeItalic`,
+ * `escapeUnderline`: after an address in the same run, after the start of an emoji; `plain` puts a
+ * zero-width space after the `<`).
+ */
+function markerTaken(text: string, at: number, marker: Marker): boolean {
+  const before = text.slice(0, at);
+  const address = /(?<!<\u200b?)https?:\/\/\S*$/u.test(before);
+  switch (marker) {
+    case '*':
+      return address || /<\u200b?[^\s:]+:\/[^\s>]*$/u.test(before);
+    case '_':
+      return (
+        WORD.test(before.at(-1) ?? '') ||
+        address ||
+        /<\u200b?a?:./u.test(before) ||
+        /<\u200b?[^\s:]:\/[^\s>]*$/u.test(before)
+      );
+    case '__':
+      return address || /<\u200b?a?:./u.test(before);
+    default:
+      return false;
+  }
+}
+
+/**
+ * The marker that opens emphasis at `at`, one followed by something other than white space; two
+ * underscores underline, also inside a word, as on Discord. A marker discord.js leaves unescaped
+ * (after an address in the same run, after an emoji's start: `escapeItalic`, `escapeUnderline`)
+ * is text, so that what a member wrote reads as written.
+ */
+function openerAt(text: string, at: number): Marker | undefined {
+  const marker = MARKERS.find((one) => text.startsWith(one, at));
+  if (marker === undefined) return undefined;
+  if (markerTaken(text, at, marker)) return undefined;
+  const next = text[at + marker.length];
+  return next === undefined || /\s/u.test(next) ? undefined : marker;
+}
+
+/**
+ * Where the emphasis `marker` opened before `from` closes: the next `marker` after something other
+ * than white space, past escapes, constructs and emphasis nested inside it; undefined for none.
+ */
+function closing(text: string, from: number, marker: Marker, depth: number): number | undefined {
+  for (let at = from; at < text.length;) {
+    if (text[at] === '\\') {
+      at += 2;
+      continue;
+    }
+    const end = constructEnd(text, at);
+    if (end !== undefined) {
+      at = end;
+      continue;
+    }
+    const before = text[at - 1];
+    const after = text[at + marker.length] ?? '';
+    if (
+      text.startsWith(marker, at) &&
+      at > from &&
+      before !== undefined &&
+      !/\s/u.test(before) &&
+      !(marker === '_' && WORD.test(after))
+    ) {
+      return at;
+    }
+    const nested = depth < MAX_DEPTH ? openerAt(text, at) : undefined;
+    if (nested !== undefined && nested !== marker) {
+      const inner = closing(text, at + nested.length, nested, depth + 1);
+      if (inner !== undefined) {
+        at = inner + nested.length;
+        continue;
+      }
+    }
+    at += 1;
+  }
+  return undefined;
+}
+
+/** What angle brackets Discord reads stand for, as nodes. */
+function angledNodes(match: RegExpExecArray, options: PostTextOptions): PostNode[] {
+  const [whole, member, , channel, animated, emojiName, emojiId, seconds, style, command, url] =
+    match;
+  if (member !== undefined) return [{ kind: 'text', text: UNKNOWN_MEMBER }];
+  if (channel !== undefined) {
+    const post = options.channel(channel);
+    return [{ kind: 'link', href: post.href, children: [{ kind: 'text', text: post.name }] }];
+  }
+  if (emojiName !== undefined && emojiId !== undefined && animated !== undefined) {
+    const src = options.emoji(emojiId, emojiName);
+    return [{ kind: 'emoji', name: emojiName, ...(src === undefined ? {} : { src }) }];
+  }
+  if (seconds !== undefined) {
+    const at = Number(seconds) * 1000;
+    // A moment no date can be (Discord shows it as written): `Date` holds ±8.64e15 ms.
+    if (!Number.isSafeInteger(at) || Math.abs(at) > 8.64e15) return [{ kind: 'text', text: whole }];
+    const shown = (style ?? 'f') as PostTimeStyle;
+    return [{ kind: 'time', at, style: shown }];
+  }
+  if (command !== undefined) return [{ kind: 'text', text: `/${command}` }];
+  if (url !== undefined) {
+    const text: PostNode = { kind: 'text', text: url };
+    return options.linkable(url) ? [{ kind: 'link', href: url, children: [text] }] : [text];
+  }
+  // A role's mention: no post names one; shown as it is.
+  return [{ kind: 'text', text: whole }];
+}
+
+/** The nodes of a line, or of what emphasis or a link holds. */
+function inline(text: string, options: PostTextOptions, depth: number): PostNode[] {
+  const nodes: PostNode[] = [];
+  let pending = '';
+  const flush = (): void => {
+    addText(nodes, readable(pending));
+    pending = '';
+  };
+  for (let at = 0; at < text.length;) {
+    const character = text[at] ?? '';
+    const next = text[at + 1];
+    if (character === '\\' && next !== undefined && ESCAPABLE.test(next)) {
+      pending += next;
+      at += 2;
+      continue;
+    }
+    if (character === '`') {
+      const close = text.indexOf('`', at + 1);
+      if (close > at + 1) {
+        flush();
+        nodes.push({ kind: 'code', text: text.slice(at + 1, close) });
+        at = close + 1;
+        continue;
+      }
+    }
+    if (character === '<') {
+      const angled = ANGLED.exec(text.slice(at));
+      if (angled) {
+        flush();
+        addAll(nodes, angledNodes(angled, options));
+        at += angled[0].length;
+        continue;
+      }
+    }
+    if (character === '[') {
+      const link = maskedLink(text, at);
+      if (link) {
+        flush();
+        const children = inline(link.label, options, depth + 1);
+        if (options.linkable(link.url)) nodes.push({ kind: 'link', href: link.url, children });
+        else addAll(nodes, children);
+        at = link.end;
+        continue;
+      }
+    }
+    if (character === 'h') {
+      const bare = BARE.exec(text.slice(at));
+      const url = bare ? bareEnd(bare[0]) : '';
+      if (url.length > 'https://'.length) {
+        flush();
+        const shown: PostNode = { kind: 'text', text: url };
+        if (options.linkable(url)) nodes.push({ kind: 'link', href: url, children: [shown] });
+        else addText(nodes, url);
+        at += url.length;
+        // A zero-width space `plain` put after the address's last character (`@everyone`).
+        if (addedSpace(text, at, url)) at += 1;
+        continue;
+      }
+    }
+    const marker = depth < MAX_DEPTH ? openerAt(text, at) : undefined;
+    if (marker !== undefined) {
+      const close = closing(text, at + marker.length, marker, depth);
+      if (close !== undefined) {
+        flush();
+        const children = inline(text.slice(at + marker.length, close), options, depth + 1);
+        nodes.push({ kind: MARKED[marker], children });
+        at = close + marker.length;
+        continue;
+      }
+    }
+    pending += character;
+    at += 1;
+  }
+  flush();
+  return nodes;
+}
````

### Task 3: 8M-8A task 3: a party's post as data for the map

Prototype commit: `4fb32b8af9dc9d33a004fc82658aa530b4f4677b`

PartyService keeps the layout each post was last shown with (layoutOf):
set when a post is made and whenever an edit went through or would
send nothing new, left as it was when an edit fails, forgotten with the
post. The map shows exactly what the post shows; nothing is rendered a
second time for the web.

postView (src/render/post-view.ts, pure) draws that layout for the
page: the accent by the name of its theme.css value (accentName, every
renderer's color named), each text read by postText with its role, a
section's details under it, the post's picture beside its heading only
from the allowed hosts, a place's picture only by Pine's address (until
task 4 none: the text the post shows without it), and every button
mapped through its custom id to what it does on the map: a press
(the statuses, Leave, Remote), a panel (Group..., Set time..., Move...,
Manage..., Route), Discord (-1, +1, Meet..., Split...), the screenshot
note in the place of Screenshot feedback, or nothing. No custom id
reaches the page; icon-only buttons are named by STATUS_WORDS and the
other buttons' words.

/api/parties gives each party its postKey (16 hex of the layout's
SHA-256, kept per layout); GET /s/<guild>/api/parties/<id>/post?k=
answers the post view for members as the list does (401, 403, 503),
404 for a party the list would not show (mapParty) or without a post
shown yet, a day in the browser when asked by its key. Names as the
post names them; a member without a name is "unknown member"; a split
train's other post by its title where the member may see that party,
else "another post". Links only to Google Maps, this server on Discord
and Pine's pages (linkableOnTheMap). 120 a minute per address.

**Files:**

```
 src/app.ts                                |   3 ++
 src/domain/web/party-data.ts              |  93 +++++++++++++++++++++++++++++++++++++++++-
 src/domain/web/party-view.test.ts         |  17 ++++++++
 src/domain/web/party-view.ts              |  31 ++++++++++++--
 src/render/party-post.ts                  |   2 +-
 src/render/post-view.test.ts              | 291 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/post-view.ts                   | 229 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/raid-post.ts                   |   2 +-
 src/services/application-emoji.test.ts    |  16 +++++++-
 src/services/application-emoji.ts         |  14 +++++--
 src/services/party-service.layout.test.ts |  73 +++++++++++++++++++++++++++++++++
 src/services/party-service.ts             |  34 ++++++++++++++++
 src/web/client/meetup-forms.test.ts       |   1 +
 src/web/client/parties.test.ts            |   4 ++
 src/web/client/raid-forms.test.ts         |   1 +
 src/web/client/raid-marker.test.ts        |   1 +
 src/web/client/train-forms.test.ts        |   2 +
 src/web/client/train-ui.isolated.test.ts  |   2 +
 src/web/client/what-is-on.test.ts         |   4 ++
 src/web/party-post-view.test.ts           | 332 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-routes.ts                   | 133 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/web.ts                       |   4 ++
 22 files changed, 1277 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/render/post-view.test.ts src/services/application-emoji.test.ts src/services/party-service.layout.test.ts src/web/client/meetup-forms.test.ts src/web/client/parties.test.ts src/web/client/raid-forms.test.ts src/web/client/raid-marker.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/client/what-is-on.test.ts src/web/party-post-view.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4fb32b8af9dc9d33a004fc82658aa530b4f4677b -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8A task 3: a party's post as data for the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index da239b0f4ecda4176ef09671a5cc319476737dec..d5ca333ce6d38189c6b5782df45ebeeae13c6d4b 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1264,6 +1264,9 @@ export async function startApp(
         look: (raid) => raidLook(partyService.view(raid)),
         // How a max battle's post shows it (plan 8X-5): its boss, picture and spot as they are now.
         maxLook: (party) => maxLook(partyService.maxView(party)),
+        // The layout each post was last shown with, the popup's (plan 8M-8A), and posts' titles.
+        layoutOf: (partyId) => partyService.layoutOf(partyId),
+        titleOf: (party) => partyService.postTitle(party),
         // A power spot of a train's route (plan 8X-4), as the kept Wayspots have it now.
         spotOf: (id) => {
           const kept = wayspots.byId(id);
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index c3f97e28f3ccefa141870fe2674d17748492d940..8fb194f89d3132d7ea2c614c10c7f4a1a734e107 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -2,7 +2,8 @@
  * What `GET /s/<guild>/api/parties` answers (`partyView`), and what a press of a button
  * answers, as the page reads them (spec 3.2, 3.3). Types and the list of actions alone, with no
  * import: the page's bundle (`src/web/client/`) takes them without the server's
- * code. Nobody is named here: no member's name or id, no reporter, no maker; attendees are counts.
+ * code. The list names nobody (attendees are counts); a party's post (`PostView`, plan 8M-8A)
+ * names members exactly as the post on Discord does, never by id.
  */
 
 /** The buttons of a post a member may press on the map (spec 3.3): the statuses, Leave, Done. */
@@ -132,6 +133,8 @@ export interface MapRaid {
    */
   mayChange: boolean;
   attendance: MapAttendance;
+  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
+  postKey: string | null;
 }
 
 /** What kind of battles a train goes to, as `TrainKind` spells it (plan 8X-4). */
@@ -178,6 +181,8 @@ export interface MapTrain {
   stop: number | null;
   link: string;
   attendance: MapAttendance;
+  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
+  postKey: string | null;
   /**
    * What the member may do to its route on the map (plan 8M-5), as the commands decide it; all
    * false while read-only. `arrange`: add, remove and move stops (signed up, the maker, staff);
@@ -194,8 +199,19 @@ export interface MapTrain {
   panel: MapTrainPanel | null;
   /** Who leads the train, as the member sees it (nobody is named), and what they may do of it. */
   conductor: MapConductor;
+  /**
+   * Why the member may not move it on the map (plan 8M-8A, review N1; `moveRefusalOf`), null where
+   * they may: the page words it under the post's Move… and Manage….
+   */
+  moveRefusal: MapMoveRefusal | null;
 }
 
+/**
+ * Why a member may not move a train (`MapTrain.moveRefusal`): with a conductor not theirs, not
+ * signed up without one, no route yet, the map read-only.
+ */
+export type MapMoveRefusal = 'not-conductor' | 'not-attending' | 'no-route' | 'read-only';
+
 /** A power spot of a train's route on the map (`MapTrain.spots`): its key, name and place. */
 export interface MapTrainSpot {
   key: string;
@@ -257,6 +273,8 @@ export interface MapMeetup {
   endTime: number | null;
   link: string;
   attendance: MapAttendance;
+  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
+  postKey: string | null;
   /**
    * Where it is (plan 8M-5M): the place it was made at, as it was named (a snapshot); null for a
    * meetup made before places (8D).
@@ -321,6 +339,8 @@ export interface MapMax {
   place: MapRaidPlace;
   /** Its attendance; Done is always offered (a max battle is on from the start). */
   attendance: MapAttendance;
+  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
+  postKey: string | null;
 }
 
 /** A party of any kind, as the map shows it. */
@@ -371,6 +391,77 @@ export interface PostLine {
   nodes: PostNode[];
 }
 
+/**
+ * The color of a post's edge (plan 8M-8A), by the name of its value in `theme.css`
+ * (`--accent-<name>`, light and dark): a raid's egg, hatched and ended, a max battle, a meetup or
+ * train, and `other` for a color no renderer gives today.
+ */
+export type PostAccent = 'egg' | 'hatched' | 'ended' | 'max' | 'timed' | 'other';
+
+/** The panels of the map a post's button opens (`PostControl`). */
+export type PostPanel = 'group' | 'time' | 'moves' | 'manage' | 'route';
+
+/**
+ * What a button of a post does on the map (plan 8M-8A), decided on the server from its custom id
+ * (no custom id reaches the page): a press the map makes as the post's button does (`MAP_ACTIONS`,
+ * or `MAP_REMOTE`), one of the map's panels, "Do this on Discord" (a dialog the map has no form
+ * for yet: −1, +1, Meet…, Split…), the note that the raid was reported from a screenshot (in the
+ * place of Screenshot feedback, whose feedback stays on Discord), or nothing.
+ */
+export type PostControl =
+  | { kind: 'press'; action: MapAction | typeof MAP_REMOTE }
+  | { kind: 'panel'; panel: PostPanel }
+  | { kind: 'discord' }
+  | { kind: 'screenshot' }
+  | { kind: 'none' };
+
+/** A button of a post as the page draws it: Discord's look, and what it does on the map. */
+export interface PostButtonView {
+  /** Its words; none for a button that shows only its icon. */
+  label?: string;
+  /** Its icon: Pine's picture of a custom emoji (`src`), else a plain emoji (`name`). */
+  emoji?: { name: string; src?: string };
+  /** Discord's button styles, as `theme.css` names them. */
+  style: 'primary' | 'secondary' | 'success' | 'danger';
+  /** Off for everybody, as the post has it (Group… while nobody is signed up). */
+  disabled: boolean;
+  /**
+   * What a reader and a screen reader call it: its label, or for an icon the words the post's
+   * lines use (`STATUS_WORDS`: Interested, Coming, Here, Done) and the others' (Leave, −1, +1,
+   * Remote, Meet…).
+   */
+  name: string;
+  does: PostControl;
+}
+
+/** What stands beside a part of a post: the post's picture or a place's, or a button. */
+export type PostBeside =
+  { kind: 'picture'; src: string } | { kind: 'button'; button: PostButtonView };
+
+/** A part of a post as the page draws it (`PostView.blocks`). */
+export type PostViewBlock =
+  | {
+      type: 'text';
+      /** What it is about (`BlockRole`): the phone card shows the `head` with the main buttons. */
+      role?: 'head' | 'where' | 'trainers' | 'note';
+      lines: PostLine[];
+      beside?: PostBeside;
+    }
+  | { type: 'separator' }
+  | { type: 'controls'; rows: PostButtonView[][] };
+
+/**
+ * A party's post as the page draws it (plan 8M-8A, `GET /s/<guild>/api/parties/<id>/post`): made
+ * on the server from the layout its post was last shown with (`PartyService.layoutOf`), the text
+ * read into nodes (`postText`), the buttons mapped to what they do on the map. `key` is the
+ * layout's (`MapParty.postKey`).
+ */
+export interface PostView {
+  key: string;
+  accent: PostAccent;
+  blocks: PostViewBlock[];
+}
+
 /**
  * What a press answers (`POST /s/<guild>/api/parties/<id>/<action>`): the words alone; the page
  * asks for the list again after a press.
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index a5bcef1d13a760fe9f2098aaec30f6349f499ca7..43ec4960466aaf4eb2f84d4505a16cd494b2abc1 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -27,6 +27,7 @@ import {
   mayChangeRaid,
   partyView,
   conductorOf,
+  moveRefusalOf,
   trainPanelOf,
   trainRights,
   type PartyViewInput,
@@ -98,6 +99,7 @@ describe('partyView', () => {
         link: `https://discord.com/channels/${GUILD}/700000000000000001`,
         place: null,
         mayChange: false,
+        postKey: null,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           going: 0,
@@ -239,6 +241,7 @@ describe('partyView', () => {
         endTime: at('2026-10-13T21:00'),
         link: `https://discord.com/channels/${GUILD}/700000000000000009`,
         place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
+        postKey: null,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           going: 0,
@@ -361,6 +364,7 @@ describe('partyView', () => {
         spots: [],
         stop: 1,
         link: `https://discord.com/channels/${GUILD}/700000000000000002`,
+        postKey: null,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           going: 0,
@@ -372,6 +376,7 @@ describe('partyView', () => {
         may: { arrange: false, clear: false, load: false, kind: false },
         panel: null,
         conductor: { who: null, mayTake: false, mayDrop: false },
+        moveRefusal: 'not-attending',
       },
     ]);
     expect(view.meetups).toEqual([
@@ -382,6 +387,7 @@ describe('partyView', () => {
         startTime: at('2026-10-13T16:00'),
         endTime: at('2026-10-13T18:00'),
         link: `https://discord.com/channels/${GUILD}/700000000000000003`,
+        postKey: null,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           going: 0,
@@ -644,6 +650,17 @@ describe('trainPanelOf and conductorOf', () => {
     ).not.toBeNull();
   });
 
+  it('says why the member may not move the train, as the commands decide it (review N1)', () => {
+    expect(moveRefusalOf(stoppedAt(0), input([]))).toBeNull();
+    expect(moveRefusalOf(stoppedAt(0), input([], { memberId: BOB }))).toBe('not-attending');
+    expect(moveRefusalOf(stoppedAt(0, { conductorId: REPORTER }), input([]))).toBe('not-conductor');
+    // The conductor of a train with no route yet may move it once it has one.
+    expect(moveRefusalOf(stoppedAt(0, { route: [], conductorId: ALICE }), input([]))).toBe(
+      'no-route',
+    );
+    expect(moveRefusalOf(stoppedAt(0), input([], { readOnly: true }))).toBe('read-only');
+  });
+
   it('says whose the conductor role is without naming them, and who may take or drop it', () => {
     expect(conductorOf(stoppedAt(0), input([]))).toEqual({
       who: null,
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index e5976d98a6a9a187e83c7f526343ae7900ef5243..8cff75d37e03c101d3df70c1f75c07f684ecb4a0 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -46,6 +46,7 @@ import type {
   MapRaidPlace,
   MapStatus,
   MapConductor,
+  MapMoveRefusal,
   MapTrain,
   MapTrainPanel,
   MapTrainRights,
@@ -58,9 +59,10 @@ export type * from './party-data.js';
 /**
  * What a logged-in member sees of a server's parties on the live map (spec 3.2,
  * `GET /s/<guild>/api/parties`). Pure: the caller gives the active parties, the forums the member
- * is barred from, and how each raid looks in its post. Nobody is named: no reporter or maker,
- * no attendee's name or id, whatever anybody's privacy; attendees are counts, as the post counts
- * them. The post, one tap away, shows names to whoever may see them.
+ * is barred from, and how each raid looks in its post. The list names nobody (attendees are
+ * counts, as the post counts them); each party's post, asked for by its `postKey` (plan 8M-8A:
+ * `GET /s/<guild>/api/parties/<id>/post`), names attendees, the reporter and the maker exactly as
+ * the post does, to the same members.
  */
 
 /**
@@ -131,6 +133,11 @@ export interface PartyViewInput {
   spotOf?: (id: string) => { name: string; lat: number; lon: number } | undefined;
   /** The origins the page may load pictures from (`pictureOrigins`). */
   pictureOrigins: readonly string[];
+  /**
+   * The key of a party's post as last shown (plan 8M-8A, `postKey` of its `PartyService.layoutOf`),
+   * undefined while it has none. Left out: none has one.
+   */
+  postKey?: (party: Party) => string | undefined;
 }
 
 /** The address of a post on Discord, as the direct messages give it (`postLink`). */
@@ -263,6 +270,7 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
       : null,
     mayChange: !input.readOnly && mayChangeRaid(party, input.memberId, input.staff),
     attendance: attendanceOf(party, input, stage === 'hatched'),
+    postKey: input.postKey?.(party) ?? null,
   };
 }
 
@@ -288,6 +296,7 @@ function maxOf(party: MaxParty, link: string, input: PartyViewInput): MapMax | n
     link,
     place: { ...look.place, lat: round(look.place.lat), lon: round(look.place.lon) },
     attendance: attendanceOf(party, input, true),
+    postKey: input.postKey?.(party) ?? null,
   };
 }
 
@@ -333,6 +342,19 @@ function reverseFirst(party: TrainParty): string {
   return first === undefined ? '' : stopHandle(first);
 }
 
+/**
+ * Why the member may not move the train on the map (review N1), as the commands decide it
+ * (`mayNotMove`: `not-conductor`, `not-attending`), or that it has no route yet (`no-route`) or
+ * the map is read-only (`read-only`); null where they may. The page words it under the post's
+ * Move… and Manage…, never working it out itself.
+ */
+export function moveRefusalOf(party: TrainParty, input: PartyViewInput): MapMoveRefusal | null {
+  if (input.readOnly) return 'read-only';
+  const refused = mayNotMove(party, input.memberId, input.staff);
+  if (refused !== undefined) return refused;
+  return party.train.route.length === 0 ? 'no-route' : null;
+}
+
 /** The conductor of a train as the member sees it, and what they may do of it. */
 export function conductorOf(party: TrainParty, input: PartyViewInput): MapConductor {
   const { conductorId } = party.train;
@@ -364,9 +386,11 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     stop: stop < route.length ? stop : null,
     link,
     attendance: attendanceOf(party, input, false),
+    postKey: input.postKey?.(party) ?? null,
     may: trainRights(party, input),
     panel: trainPanelOf(party, input),
     conductor: conductorOf(party, input),
+    moveRefusal: moveRefusalOf(party, input),
   };
 }
 
@@ -408,6 +432,7 @@ function meetupOf(party: MeetupParty, link: string, input: PartyViewInput): MapM
     endTime: party.endTime,
     link,
     attendance: attendanceOf(party, input, false),
+    postKey: input.postKey?.(party) ?? null,
     place: meetupPlaceOf(party.meetup.place),
     info: party.meetup.description,
     panel: meetupPanelOf(party, input),
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 40e10cf3ef2d9776401d58dd9487d57cb6647b8b..d94078c913c9fa1268e5980c8473cba1a69cb77a 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -618,7 +618,7 @@ export function fittedLayout(
 const GROUP_STATUSES: readonly ShownStatus[] = ['interested', 'coming', 'present'];
 
 /** A status as the post's lines name it: the words of the buttons (plan 8X-1B, the mockup). */
-const STATUS_WORDS: Readonly<Record<ShownStatus, string>> = {
+export const STATUS_WORDS: Readonly<Record<ShownStatus, string>> = {
   interested: 'Interested',
   coming: 'Coming',
   present: 'Here',
diff --git a/src/render/post-view.test.ts b/src/render/post-view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ae69cc017b1c85dfc9a1d7f4119ce9c0f8e7945c
--- /dev/null
+++ b/src/render/post-view.test.ts
@@ -0,0 +1,291 @@
+import { ButtonStyle } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  testMeetup,
+  testRaid,
+  testTrain,
+  withAttendees,
+  ALICE,
+} from '../../test/support/parties.js';
+import type { PostButtonView, PostView, PostViewBlock } from '../domain/web/party-data.js';
+import { MAX_COLOUR } from './max-post.js';
+import {
+  bottomControls,
+  manageTrainButton,
+  moveTrainButton,
+  partyButton,
+  splitGroupButton,
+  wholeRouteButton,
+} from './party-controls.js';
+import { ENDED_COLOUR, type PostLayout } from './party-post.js';
+import { accentName, postKey, postView, type PostViewOptions } from './post-view.js';
+import { STAGE_COLOURS } from './raid-post.js';
+import { TIMED_COLOUR } from './timed-post.js';
+
+const GUILD = '412345678901234567';
+const SERVED = '111111111111111111';
+
+const options: PostViewOptions = {
+  emoji: (id) => (id === SERVED ? `/emoji/${id}.png` : undefined),
+  channel: (id) => ({ href: `https://discord.com/channels/${GUILD}/${id}`, name: 'another post' }),
+  linkable: (url) => url.startsWith('https://www.google.com/maps/'),
+  picture: (url) => (url.startsWith('https://cdn.example.test/') ? url : undefined),
+  thumbnail: (url) =>
+    url === 'https://lh3.googleusercontent.com/kept=s400' ? '/s/x/pictures/gym/1' : undefined,
+};
+
+const view = (layout: PostLayout): PostView => postView(layout, options);
+
+/** The buttons of a view's rows of controls, row by row. */
+function rows(shown: PostView): PostButtonView[][] {
+  return shown.blocks.flatMap((block) => (block.type === 'controls' ? block.rows : []));
+}
+
+/** A text block's lines as plain words, for reading a test. */
+function words(block: PostViewBlock | undefined): string[] {
+  if (block?.type !== 'text') return [];
+  return block.lines.map((line) =>
+    line.nodes.map((node) => ('text' in node ? node.text : `<${node.kind}>`)).join(''),
+  );
+}
+
+describe('postView: the controls', () => {
+  it('maps a raid’s buttons to presses, panels and Discord, never sending a custom id', () => {
+    const raid = withAttendees(testRaid(), { [ALICE]: {} });
+    const icons = {
+      controlIcon: (name: string) => (name === 'pinejoin' ? `<:pinejoin:${SERVED}>` : undefined),
+    };
+    const shown = view({
+      accent: STAGE_COLOURS.egg,
+      blocks: [{ type: 'controls', rows: bottomControls(raid, { emoji: icons }) }],
+    });
+    expect(rows(shown)).toEqual([
+      [
+        {
+          name: 'Interested',
+          emoji: { name: '🤔' },
+          style: 'secondary',
+          disabled: false,
+          does: { kind: 'press', action: 'interested' },
+        },
+        {
+          name: 'Coming',
+          emoji: { name: 'pinejoin', src: `/emoji/${SERVED}.png` },
+          style: 'primary',
+          disabled: false,
+          does: { kind: 'press', action: 'join' },
+        },
+        {
+          name: 'Here',
+          emoji: { name: '✅' },
+          style: 'success',
+          disabled: false,
+          does: { kind: 'press', action: 'here' },
+        },
+        {
+          name: 'Done',
+          emoji: { name: '🎉' },
+          style: 'secondary',
+          disabled: false,
+          does: { kind: 'press', action: 'done' },
+        },
+        {
+          name: 'Leave',
+          emoji: { name: '👋' },
+          style: 'danger',
+          disabled: false,
+          does: { kind: 'press', action: 'leave' },
+        },
+      ],
+      [
+        {
+          name: '−1',
+          emoji: { name: '⬇️' },
+          style: 'secondary',
+          disabled: false,
+          does: { kind: 'discord' },
+        },
+        {
+          name: '+1',
+          emoji: { name: '⬆️' },
+          style: 'secondary',
+          disabled: false,
+          does: { kind: 'discord' },
+        },
+        {
+          name: 'Remote',
+          emoji: { name: '📡' },
+          style: 'secondary',
+          disabled: false,
+          does: { kind: 'press', action: 'remote' },
+        },
+      ],
+      [
+        {
+          name: 'Group…',
+          label: 'Group…',
+          emoji: { name: '👥' },
+          style: 'secondary',
+          disabled: false,
+          does: { kind: 'panel', panel: 'group' },
+        },
+        {
+          name: 'Set time…',
+          label: 'Set time…',
+          emoji: { name: '⏰' },
+          style: 'primary',
+          disabled: false,
+          does: { kind: 'panel', panel: 'time' },
+        },
+      ],
+    ]);
+    expect(JSON.stringify(shown)).not.toContain(`party:${raid.id}`);
+  });
+
+  it('shows a custom emoji Pine serves no picture of as the button’s plain one', () => {
+    const icons = {
+      controlIcon: (name: string) =>
+        name === 'pinehere' ? '<:pinehere:222222222222222222>' : undefined,
+    };
+    const [statuses] = rows(
+      view({
+        accent: TIMED_COLOUR,
+        blocks: [{ type: 'controls', rows: bottomControls(testMeetup(), { emoji: icons }) }],
+      }),
+    );
+    expect(statuses?.find((button) => button.name === 'Here')?.emoji).toEqual({ name: '✅' });
+  });
+
+  it('opens the map’s moves, manage and route panels from a train’s, Split… on Discord', () => {
+    const train = testTrain();
+    const third = rows(
+      view({
+        accent: TIMED_COLOUR,
+        blocks: [
+          {
+            type: 'controls',
+            rows: [
+              [
+                moveTrainButton(train),
+                manageTrainButton(train),
+                splitGroupButton(train),
+                wholeRouteButton(train),
+              ],
+            ],
+          },
+        ],
+      }),
+    )[0];
+    expect(third?.map((button) => [button.label, button.does])).toEqual([
+      ['Move…', { kind: 'panel', panel: 'moves' }],
+      ['Manage…', { kind: 'panel', panel: 'manage' }],
+      ['Split…', { kind: 'discord' }],
+      ['Route', { kind: 'panel', panel: 'route' }],
+    ]);
+  });
+
+  it('says a raid was reported from a screenshot in the place of Screenshot feedback', () => {
+    const raid = {
+      ...testRaid(),
+      raid: { ...testRaid().raid, screenshot: { id: 'abcdefghijkl', timeUncertain: false } },
+    };
+    const third = rows(
+      view({
+        accent: STAGE_COLOURS.egg,
+        blocks: [{ type: 'controls', rows: bottomControls(raid, { emoji: {} }) }],
+      }),
+    ).at(-1);
+    expect(third?.at(-1)?.does).toEqual({ kind: 'screenshot' });
+  });
+
+  it('keeps a button off that the post has off, and does nothing for one it does not know', () => {
+    const party = { ...testRaid(), attendees: {} };
+    const strange = { button: partyButton(party.id, 'kind', 'Kind', ButtonStyle.Secondary) };
+    const [row] = rows(
+      view({
+        accent: STAGE_COLOURS.egg,
+        blocks: [
+          {
+            type: 'controls',
+            rows: [[...(bottomControls(party, { emoji: {} })[2] ?? []), strange]],
+          },
+        ],
+      }),
+    );
+    expect(row?.[0]).toMatchObject({ label: 'Group…', disabled: true });
+    expect(row?.at(-1)?.does).toEqual({ kind: 'none' });
+  });
+});
+
+describe('postView: the parts', () => {
+  it('puts the post’s picture beside its heading, only one the page may load', () => {
+    const layout = (picture: string): PostLayout => ({
+      accent: STAGE_COLOURS.hatched,
+      picture,
+      blocks: [
+        { type: 'section', content: '### Level 5 raid', accessory: 'picture', role: 'head' },
+      ],
+    });
+    expect(view(layout('https://cdn.example.test/yveltal.png')).blocks[0]).toMatchObject({
+      type: 'text',
+      role: 'head',
+      beside: { kind: 'picture', src: 'https://cdn.example.test/yveltal.png' },
+    });
+    expect(view(layout('attachment://egg-5.png')).blocks[0]).not.toHaveProperty('beside');
+  });
+
+  it('puts a place’s picture beside Where by Pine’s address, else its text without it', () => {
+    const where = (thumbnail: string): PostLayout => ({
+      accent: STAGE_COLOURS.hatched,
+      blocks: [
+        {
+          type: 'section',
+          content: '**Where**\n**Library** · (no address available)',
+          accessory: { thumbnail, withoutPicture: '**Where**\n**Library**' },
+          role: 'where',
+        },
+      ],
+    });
+    const kept = view(where('https://lh3.googleusercontent.com/kept=s400')).blocks[0];
+    expect(kept).toMatchObject({ beside: { kind: 'picture', src: '/s/x/pictures/gym/1' } });
+    expect(words(kept)).toEqual(['<strong>', '<strong> · (no address available)']);
+    const other = view(where('https://lh3.googleusercontent.com/other=s400')).blocks[0];
+    expect(other).not.toHaveProperty('beside');
+    expect(words(other)).toEqual(['<strong>', '<strong>']);
+  });
+
+  it('reads a section’s details under it, and leaves out empty texts and stray lines', () => {
+    const shown = view({
+      accent: STAGE_COLOURS.egg,
+      blocks: [
+        { type: 'separator' },
+        { type: 'text', content: '' },
+        { type: 'section', content: 'Coming (1)', accessory: 'picture', details: 'Alice' },
+        { type: 'separator' },
+        { type: 'separator' },
+        { type: 'text', content: '-# Reported by **Ash**', role: 'note' },
+        { type: 'separator' },
+      ],
+    });
+    expect(shown.blocks.map((block) => block.type)).toEqual(['text', 'separator', 'text']);
+    expect(words(shown.blocks[0])).toEqual(['Coming (1)', 'Alice']);
+    expect(shown.blocks[2]).toMatchObject({ role: 'note', lines: [{ style: 'small' }] });
+  });
+});
+
+describe('postView: the accent', () => {
+  it('names every color a post’s edge has after a value of theme.css', () => {
+    const colors = [...Object.values(STAGE_COLOURS), ENDED_COLOUR, MAX_COLOUR, TIMED_COLOUR];
+    expect(colors.map(accentName)).toEqual(['egg', 'hatched', 'ended', 'ended', 'max', 'timed']);
+    expect(accentName(0x123456)).toBe('other');
+  });
+});
+
+describe('postKey', () => {
+  it('is the same for the same layout and another for another', () => {
+    const one: PostLayout = { accent: TIMED_COLOUR, blocks: [{ type: 'text', content: 'a' }] };
+    expect(postKey(one)).toBe(postKey({ ...one, blocks: [{ type: 'text', content: 'a' }] }));
+    expect(postKey(one)).not.toBe(postKey({ ...one, blocks: [{ type: 'text', content: 'b' }] }));
+    expect(postKey(one)).toMatch(/^[0-9a-f]{16}$/u);
+  });
+});
diff --git a/src/render/post-view.ts b/src/render/post-view.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d45bef6707b02bd2b8fd884b8a93f087f24a2adb
--- /dev/null
+++ b/src/render/post-view.ts
@@ -0,0 +1,229 @@
+import { createHash } from 'node:crypto';
+import { ButtonStyle, type APIButtonComponent } from 'discord.js';
+import { decodeCustomId } from '../discord/custom-id.js';
+import type {
+  PostAccent,
+  PostBeside,
+  PostButtonView,
+  PostControl,
+  PostView,
+  PostViewBlock,
+} from '../domain/web/party-data.js';
+import { MAX_COLOUR } from './max-post.js';
+import { PARTY_KIND, type PartyAction } from './party-controls.js';
+import { ENDED_COLOUR, STATUS_WORDS, type PostButton, type PostLayout } from './party-post.js';
+import { postText, type PostTextOptions } from './post-text.js';
+import { STAGE_COLOURS } from './raid-post.js';
+import { TIMED_COLOUR } from './timed-post.js';
+
+/** What making a post's view needs of where it is shown, beside what reading its text needs. */
+export interface PostViewOptions extends PostTextOptions {
+  /** The post's own picture (a boss, an egg) as the page may load it, undefined to leave it out. */
+  picture(url: string): string | undefined;
+  /** Pine's address of a place's picture (a gym's from Wayfarer) beside a part, else undefined. */
+  thumbnail(url: string): string | undefined;
+}
+
+/** The colors of the posts' edges by the names of their values in `theme.css`. */
+const ACCENTS: ReadonlyMap<number, PostAccent> = new Map([
+  [STAGE_COLOURS.egg, 'egg'],
+  [STAGE_COLOURS.hatched, 'hatched'],
+  [ENDED_COLOUR, 'ended'],
+  [MAX_COLOUR, 'max'],
+  [TIMED_COLOUR, 'timed'],
+]);
+
+/** A post's color by the name of its value in `theme.css` (`--accent-<name>`). */
+export function accentName(accent: number): PostAccent {
+  return ACCENTS.get(accent) ?? 'other';
+}
+
+/** What layouts were keyed already: a layout is kept as the post was last shown, unchanged. */
+const keys = new WeakMap<PostLayout, string>();
+
+/**
+ * The key of a layout (`MapParty.postKey`): 16 hex digits of the SHA-256 of its JSON, the same
+ * for the same post and another once anything of it changed, so that a page asks for a post only
+ * when it changed and may keep it by its key.
+ */
+export function postKey(layout: PostLayout): string {
+  let key = keys.get(layout);
+  if (key === undefined) {
+    key = createHash('sha256').update(JSON.stringify(layout)).digest('hex').slice(0, 16);
+    keys.set(layout, key);
+  }
+  return key;
+}
+
+/**
+ * The posts a layout links as `<#id>` (a split train's other one): the route asks whether the
+ * member may see their parties before it names them.
+ */
+export function linkedPosts(layout: PostLayout): string[] {
+  const texts = layout.blocks.flatMap((block) =>
+    block.type === 'text'
+      ? [block.content]
+      : block.type === 'section'
+        ? [block.content, block.details ?? '']
+        : [],
+  );
+  return [
+    ...new Set(texts.flatMap((text) => [...text.matchAll(/<#(\d+)>/gu)].map((m) => m[1] ?? ''))),
+  ];
+}
+
+/** What each of a party's buttons does on the map, by the action of its custom id. */
+const CONTROLS: Partial<Readonly<Record<PartyAction, PostControl>>> = {
+  maybe: { kind: 'press', action: 'interested' },
+  join: { kind: 'press', action: 'join' },
+  here: { kind: 'press', action: 'here' },
+  done: { kind: 'press', action: 'done' },
+  leave: { kind: 'press', action: 'leave' },
+  remote: { kind: 'press', action: 'remote' },
+  regroup: { kind: 'panel', panel: 'group' },
+  time: { kind: 'panel', panel: 'time' },
+  move: { kind: 'panel', panel: 'moves' },
+  manage: { kind: 'panel', panel: 'manage' },
+  route: { kind: 'panel', panel: 'route' },
+  less: { kind: 'discord' },
+  more: { kind: 'discord' },
+  meet: { kind: 'discord' },
+  split: { kind: 'discord' },
+  shot: { kind: 'screenshot' },
+};
+
+/** What an icon-only button is called: the words of the post's lines for a status. */
+const ICON_WORDS: Partial<Readonly<Record<PartyAction, string>>> = {
+  maybe: STATUS_WORDS.interested,
+  join: STATUS_WORDS.coming,
+  here: STATUS_WORDS.present,
+  done: STATUS_WORDS.complete,
+  leave: 'Leave',
+  less: '−1',
+  more: '+1',
+  remote: 'Remote',
+  meet: 'Meet…',
+};
+
+const STYLES: Readonly<Partial<Record<ButtonStyle, PostButtonView['style']>>> = {
+  [ButtonStyle.Primary]: 'primary',
+  [ButtonStyle.Secondary]: 'secondary',
+  [ButtonStyle.Success]: 'success',
+  [ButtonStyle.Danger]: 'danger',
+};
+
+/** What a button does on the map: by its custom id, never sent to the page. */
+function controlOf(button: APIButtonComponent): { control: PostControl; action?: PartyAction } {
+  if (!('custom_id' in button)) return { control: { kind: 'none' } };
+  const id = decodeCustomId(button.custom_id);
+  if (id?.kind !== PARTY_KIND) return { control: { kind: 'none' } };
+  const action = id.action as PartyAction;
+  return { control: CONTROLS[action] ?? { kind: 'none' }, action };
+}
+
+/**
+ * A button as the page draws it: its label, its icon (Pine's picture of a custom emoji, else its
+ * plain emoji `PostButton.plain`, as the post shows it where Discord refuses the custom one), its
+ * style, off where the post has it off, its name, and what it does on the map.
+ */
+function buttonView(post: PostButton, options: PostViewOptions): PostButtonView {
+  const { button } = post;
+  const { control, action } = controlOf(button);
+  const label = 'label' in button ? button.label : undefined;
+  const emoji = 'emoji' in button ? button.emoji : undefined;
+  const src = emoji?.id === undefined ? undefined : options.emoji(emoji.id, emoji.name ?? '');
+  const icon =
+    emoji === undefined
+      ? undefined
+      : src !== undefined
+        ? { name: emoji.name ?? '', src }
+        : emoji.id === undefined
+          ? { name: emoji.name ?? '' }
+          : { name: post.plain ?? emoji.name ?? '' };
+  const name = label ?? (action === undefined ? undefined : ICON_WORDS[action]) ?? icon?.name ?? '';
+  return {
+    ...(label === undefined ? {} : { label }),
+    ...(icon === undefined ? {} : { emoji: icon }),
+    style: STYLES[button.style] ?? 'secondary',
+    disabled: button.disabled === true,
+    name,
+    does: control,
+  };
+}
+
+/** A thin line is never first, last or doubled, whatever was left out around it. */
+function withoutStrayLines(blocks: PostViewBlock[]): PostViewBlock[] {
+  const kept: PostViewBlock[] = [];
+  for (const block of blocks) {
+    if (block.type === 'separator' && (kept.length === 0 || kept.at(-1)?.type === 'separator')) {
+      continue;
+    }
+    kept.push(block);
+  }
+  while (kept.at(-1)?.type === 'separator') kept.pop();
+  return kept;
+}
+
+/**
+ * A post's view for the live map (plan 8M-8A): the layout its message was made of, as the page
+ * draws it. Its color by the name of its value in `theme.css`; each text read into nodes
+ * (`postText`), a section's details under it; beside a text the post's picture (where the page may
+ * load it, `picture`), a place's (by Pine's address, `thumbnail`; without one the text the post
+ * shows without its picture, `withoutPicture`) or a button; the rows of buttons, each mapped to
+ * what it does on the map (`CONTROLS`). Empty texts and stray lines are left out, as the message
+ * leaves them. What a post says is decided by its renderer alone: this only draws it anew. Pure.
+ */
+export function postView(layout: PostLayout, options: PostViewOptions): PostView {
+  const blocks: PostViewBlock[] = [];
+  for (const block of layout.blocks) {
+    switch (block.type) {
+      case 'separator':
+        blocks.push({ type: 'separator' });
+        break;
+      case 'controls': {
+        const rows = block.rows
+          .map((row) => row.map((button) => buttonView(button, options)))
+          .filter((row) => row.length > 0);
+        if (rows.length > 0) blocks.push({ type: 'controls', rows });
+        break;
+      }
+      case 'text':
+        if (block.content === '') break;
+        blocks.push({
+          type: 'text',
+          ...(block.role === undefined ? {} : { role: block.role }),
+          lines: postText(block.content, options),
+        });
+        break;
+      case 'section': {
+        const { accessory, role } = block;
+        let content = block.content;
+        let beside: PostBeside | undefined;
+        if (accessory === 'picture') {
+          const src = layout.picture === undefined ? undefined : options.picture(layout.picture);
+          if (src !== undefined) beside = { kind: 'picture', src };
+        } else if ('thumbnail' in accessory) {
+          const src = options.thumbnail(accessory.thumbnail);
+          if (src !== undefined) beside = { kind: 'picture', src };
+          else if (accessory.withoutPicture === null) break;
+          else if (accessory.withoutPicture !== undefined) content = accessory.withoutPicture;
+        } else {
+          beside = { kind: 'button', button: buttonView(accessory, options) };
+        }
+        const whole = block.details === undefined ? content : `${content}\n${block.details}`;
+        blocks.push({
+          type: 'text',
+          ...(role === undefined ? {} : { role }),
+          lines: postText(whole, options),
+          ...(beside === undefined ? {} : { beside }),
+        });
+        break;
+      }
+    }
+  }
+  return {
+    key: postKey(layout),
+    accent: accentName(layout.accent),
+    blocks: withoutStrayLines(blocks),
+  };
+}
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 63466d9622a26a2d157ecc8d35a37c9b4a836350..0994565facfdb093b6525186dfdcfc873ad2f017 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -44,7 +44,7 @@ import { LIMITS, memberByName, plain, plainLines, timestamp, titleCase, truncate
 
 const HOUR = 3_600_000;
 
-const STAGE_COLOURS: Readonly<Record<RaidStage, number>> = {
+export const STAGE_COLOURS: Readonly<Record<RaidStage, number>> = {
   egg: 0xf1c40f,
   hatched: 0x2ecc71,
   ended: ENDED_COLOUR,
diff --git a/src/services/application-emoji.test.ts b/src/services/application-emoji.test.ts
index e80d0f7f6e4004423d823405cd36fcf7ea8f8914..b3c9b4247345080d41486ae90696ef9b82ae448f 100644
--- a/src/services/application-emoji.test.ts
+++ b/src/services/application-emoji.test.ts
@@ -93,15 +93,27 @@ describe('ApplicationEmoji', () => {
     expect(told).toBe(3);
   });
 
-  it('tells nobody when the first read finds nothing', async () => {
+  it('tells its listener after the first good read, also one that finds nothing or follows a failed one (review 8A-4)', async () => {
     const { log } = createTestLogger();
-    const emoji = new ApplicationEmoji({ list: () => Promise.resolve(new Map()) }, log);
+    let fail = true;
+    const emoji = new ApplicationEmoji(
+      {
+        list: () => (fail ? Promise.reject(new Error('away')) : Promise.resolve(new Map())),
+      },
+      log,
+    );
     let told = 0;
     emoji.onChange(() => {
       told++;
     });
     await emoji.refresh();
     expect(told).toBe(0);
+    fail = false;
+    await emoji.refresh();
+    expect(told).toBe(1);
+    // Nothing changed since: nobody is told again.
+    await emoji.refresh();
+    expect(told).toBe(1);
   });
 
   it('shares a read that is under way', async () => {
diff --git a/src/services/application-emoji.ts b/src/services/application-emoji.ts
index 4eb09858ff22e129904db12ac49492b0ce0bbbc9..147e1a8cd79cef544dc2168ac0547b1db2045325 100644
--- a/src/services/application-emoji.ts
+++ b/src/services/application-emoji.ts
@@ -20,13 +20,15 @@ export const REFUSED_REREAD_GAP_MS = 60_000;
  * may use in every server), kept in memory: read after the connection and again with the hourly
  * upkeep, and at once when Discord refuses one on a button (`refused`). A read that fails is
  * logged and the last good list stays; before the first good read there is none, and the posts
- * fall back to the server's emoji or to words. When a read finds other emoji than were known (the
- * first read, an upload, one deleted), the listener is told, so that the posts can be shown anew
- * with them.
+ * fall back to the server's emoji or to words. The first good read, whatever it found, and any
+ * read that finds other emoji than were known (an upload, one deleted) tell the listener, so that
+ * the posts are shown anew with them.
  */
 export class ApplicationEmoji {
   private known: ReadonlyMap<string, string> = new Map();
   private reading: Promise<void> | undefined;
+  /** Whether a read went through yet. */
+  private readOnce = false;
   private listener: (() => void) | undefined;
   /** When a refusal last had the list read anew. */
   private rereadAt: number | undefined;
@@ -61,7 +63,11 @@ export class ApplicationEmoji {
     this.reading ??= this.source
       .list()
       .then((found) => {
-        const changed = !sameEmoji(this.known, found);
+        // The first good read always tells (plan 8M-8A, review 8A-4): the posts are shown anew
+        // after a start also when the application has no emoji or the first read failed, so that
+        // the live map has the layout of every post (`PartyService.layoutOf`).
+        const changed = !this.readOnce || !sameEmoji(this.known, found);
+        this.readOnce = true;
         this.known = found;
         // So that a read can be seen to have run (plan 8X-H: after an outage).
         this.log.debug({ emoji: found.size }, 'read the emoji of the application');
diff --git a/src/services/party-service.layout.test.ts b/src/services/party-service.layout.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1c8b03473edb3bd1f768d18f2025841df8cf7927
--- /dev/null
+++ b/src/services/party-service.layout.test.ts
@@ -0,0 +1,73 @@
+import { describe, expect, it, vi } from 'vitest';
+import { networkAway } from '../../test/support/fake-gateway.js';
+import { textOf } from '../../test/support/messages.js';
+import { BOB, CAROL } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { postMessage } from '../render/party-post.js';
+
+describe('PartyService.layoutOf: the layout a post was last shown with (plan 8M-8A)', () => {
+  it('is what the post shows, from its making and after each edit', async () => {
+    const made = await reportedRaid();
+    const shown = () => made.gateway.posts.get(made.postId)?.message;
+    const message = () => {
+      const layout = made.service.layoutOf(made.party.id);
+      if (layout === undefined) throw new Error('no layout kept');
+      return postMessage(layout);
+    };
+    expect(message()).toEqual(shown());
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    await made.service.flush();
+    expect(textOf(shown())).toContain('Bob');
+    expect(message()).toEqual(shown());
+  });
+
+  it('stays what the post shows when an edit fails', async () => {
+    const made = await reportedRaid();
+    const before = made.service.layoutOf(made.party.id);
+    made.gateway.failing.set('editPost', networkAway());
+    await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
+    await made.service.flush();
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).not.toContain('Carol');
+    expect(made.service.layoutOf(made.party.id)).toBe(before);
+  });
+
+  it('keeps nothing of an edit that finishes after its party ended (review 8A-7, N8)', async () => {
+    const made = await reportedRaid();
+    const edit = made.gateway.editPost.bind(made.gateway);
+    let release: () => void = () => undefined;
+    let asked: () => void = () => undefined;
+    const editAsked = new Promise<void>((resolve) => {
+      asked = resolve;
+    });
+    let first = true;
+    vi.spyOn(made.gateway, 'editPost').mockImplementation(async (...args) => {
+      // Only the first edit (Bob's line) is held; the closing's go through.
+      if (first) {
+        first = false;
+        asked();
+        await new Promise<void>((resolve) => {
+          release = resolve;
+        });
+      }
+      return edit(...args);
+    });
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    const flushed = made.service.flush();
+    await editAsked;
+    // The party ends while its edit is on its way: its post is forgotten.
+    const ending = made.service.end(made.party.id);
+    release();
+    await Promise.all([ending, flushed]);
+    // What the service keeps by post: nothing of the post of a party that is over.
+    const kept = (made.service as unknown as { shownLayouts: Map<string, unknown> }).shownLayouts;
+    expect(kept.has(made.postId)).toBe(false);
+  });
+
+  it('is none once the party has ended, nor for a party it does not know', async () => {
+    const made = await reportedRaid();
+    await made.service.end(made.party.id);
+    expect(made.service.layoutOf(made.party.id)).toBeUndefined();
+    expect(made.service.layoutOf('no such party')).toBeUndefined();
+  });
+});
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index c59bb626a2b4c55991e5c9b88dd46cd7864b457c..709e6f613a88c61c6c29bf8761b824f6f7d382d5 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -97,6 +97,7 @@ import {
   tidyTitle,
   type PartyBrief,
   type PostEmoji,
+  type PostLayout,
   type PostVariant,
   type RenderedPost,
 } from '../render/party-post.js';
@@ -689,6 +690,13 @@ export class PartyService {
    * the post was last known to exist. An edit that would send the same is not made.
    */
   private readonly sent = new Map<string, { key: string; checkedAt: number }>();
+  /**
+   * The layout each post was last shown with (plan 8M-8A), by post: what the live map draws as the
+   * party's popup (`layoutOf`), so that the map shows exactly what the post shows. Set when a post
+   * is made and each time an edit went through (or would send nothing new); an edit that fails
+   * leaves the one before; forgotten with the post.
+   */
+  private readonly shownLayouts = new Map<string, PostLayout>();
   /**
    * How a post is made, once one was: with its message as its first message (`direct`), or with
    * a line of text that is then edited into the message (`edited`), where Discord refuses a
@@ -832,6 +840,17 @@ export class PartyService {
     return this.rendered(party).brief;
   }
 
+  /**
+   * The layout an active party's post was last shown with (plan 8M-8A): what the live map draws
+   * as its popup, never rendered a second time for the web. Undefined for a party without a post,
+   * one whose post the service has not shown since it started (the start shows every post anew,
+   * paced, once the application's emoji are read: `emojiChanged`), and once it ended.
+   */
+  layoutOf(partyId: string): PostLayout | undefined {
+    const postId = this.options.store.get(partyId)?.forumPostId;
+    return postId === null || postId === undefined ? undefined : this.shownLayouts.get(postId);
+  }
+
   /**
    * Whether the bot may delete the post of an active party (`PartyGateway.mayDeletePost`): a
    * moderator's choice to delete it (plan 8S-2) is refused before the party ends where it may
@@ -2007,6 +2026,7 @@ export class PartyService {
       key: PartyService.sentKey(rendered, tagIds),
       checkedAt: this.now(),
     });
+    this.keepLayout(fresh.id, post, rendered.layout);
 
     // Ended meanwhile (its region removed, `/delete`): its end did not see a link line, so none
     // is sent, and one sent while it ended is taken back, or it would stay for good.
@@ -2227,9 +2247,19 @@ export class PartyService {
     return ended;
   }
 
+  /**
+   * Keeps the layout a post shows now, only while it is still its party's post (review 8A-7): an
+   * edit that ends after the party ended, or after it moved to another post, keeps nothing.
+   */
+  private keepLayout(partyId: string, postId: string, layout: PostLayout): void {
+    if (this.options.store.get(partyId)?.forumPostId === postId)
+      this.shownLayouts.set(postId, layout);
+  }
+
   /** Forgets what is kept for a post: its rename budget, a title waiting for it, what it showed. */
   private forgetPost(postId: string): void {
     this.sent.delete(postId);
+    this.shownLayouts.delete(postId);
     this.renames.delete(postId);
     this.renameTimers.get(postId)?.cancel();
     this.renameTimers.delete(postId);
@@ -3075,6 +3105,8 @@ export class PartyService {
     const key = PartyService.sentKey(rendered, wanted ?? []);
     const last = this.sent.get(postId);
     if (wanted && last?.key === key) {
+      // The same message as last sent: the post shows this layout.
+      this.keepLayout(partyId, postId, rendered.layout);
       // Nothing to send; the post is still looked at now and then, so that a deleted one is noticed.
       if (this.now() - last.checkedAt < CHECK_EVERY_MS) return;
       if (await gateway.postInfo(postId)) {
@@ -3104,6 +3136,8 @@ export class PartyService {
       await this.postGone(party, postId);
       return;
     }
+    // The message went through (in one of its forms): the post shows this layout now.
+    this.keepLayout(partyId, postId, rendered.layout);
     // What is not done leaves nothing remembered, so that the next render tries it again.
     let complete = wanted !== undefined;
     // Tags first: a rename that is refused or fails does not hold them back.
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
index 5462f3a794ea6774c627696f662cae611a9a5ce5..84542f4041e54182e9f8ce8646f1a90e3e58a4be 100644
--- a/src/web/client/meetup-forms.test.ts
+++ b/src/web/client/meetup-forms.test.ts
@@ -71,6 +71,7 @@ const GYM: MapGym = {
 
 const MEETUP: MapMeetup = {
   kind: 'meetup',
+  postKey: null,
   id: 'm1',
   name: 'Picnic',
   startTime: NOW + 4 * HOUR,
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 03fb4e8e9364b0135bee2ee5901191ac3af71b69..d4f582c6d409d5275399a8b24d87fe40eaa7cf54 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -39,6 +39,7 @@ const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
 
 const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   kind: 'raid',
+  postKey: null,
   id: 'r1',
   gymId: 1,
   picture: null,
@@ -441,6 +442,7 @@ describe('trainPopup and meetupItem', () => {
   it('show where the train is on its route, and when a meetup is', () => {
     const train: MapTrain = {
       kind: 'train',
+      postKey: null,
       trainKind: 'raid',
       trainKindWords: 'Raid Train',
       id: 't1',
@@ -454,6 +456,7 @@ describe('trainPopup and meetupItem', () => {
       may: { arrange: false, clear: false, load: false, kind: false },
       panel: null,
       conductor: { who: null, mayTake: false, mayDrop: false },
+      moveRefusal: 'not-attending',
     };
     // What the member may do of the train on the map comes before the post.
     const extra = { tag: 'button', text: 'Edit route' };
@@ -504,6 +507,7 @@ describe('trainPopup and meetupItem', () => {
     expect(texts(trainPopup({ ...train, route: [], stop: null }, context))[3]).toBe('No route yet');
     const meetup: MapMeetup = {
       kind: 'meetup',
+      postKey: null,
       id: 'm1',
       name: 'Community Day picnic',
       startTime: NOW + 24 * 60 * MINUTE,
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index 4d6a0682480205bd52c67c307dfdbde5ac541c37..c4db3ab8ab7ebf84cc27ab452b0ecca345ed0ba5 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -62,6 +62,7 @@ const REGIONS = new Map([
 
 const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   kind: 'raid',
+  postKey: null,
   id: 'r1',
   gymId: 4,
   picture: null,
diff --git a/src/web/client/raid-marker.test.ts b/src/web/client/raid-marker.test.ts
index a3590bc3e5e380fd0e48191e2dd82ecc23b57613..68cb9a8ed9907b87d041e64bffe3d026056a6c8e 100644
--- a/src/web/client/raid-marker.test.ts
+++ b/src/web/client/raid-marker.test.ts
@@ -31,6 +31,7 @@ const attendance = (groups: MapAttendance['groups'], going = 0): MapAttendance =
 
 const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   kind: 'raid',
+  postKey: null,
   id: 'r1',
   gymId: 1,
   picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm150.icon.png',
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index a2162f919f42e6d26a1a09de9a5dc8d2d7442a2d..10ba4d820789580805bbbd203dc6c74d739c30a0 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -46,6 +46,7 @@ const gym = (id: number) => GYMS.get(id);
 
 const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   kind: 'train',
+  postKey: null,
   trainKind: 'raid',
   trainKindWords: 'Raid Train',
   id: 't1',
@@ -74,6 +75,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     atEnd: 'finish',
   },
   conductor: { who: null, mayTake: true, mayDrop: false },
+  moveRefusal: null,
   ...more,
 });
 
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 0b5783697f9c1c48515aeb734570ef61ccfc32e1..802c25b0148860e9f950019218d28cc67f7b3245 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -240,6 +240,7 @@ const GYMS = new Map([
 
 const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   kind: 'train',
+  postKey: null,
   trainKind: 'raid',
   trainKindWords: 'Raid Train',
   id: 't1',
@@ -268,6 +269,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     atEnd: 'finish',
   },
   conductor: { who: null, mayTake: true, mayDrop: false },
+  moveRefusal: null,
   ...more,
 });
 
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 7e49f56878ed39433c157563c203d6fdba36aaea..b7afe5fdea24e2d52310e8421c0fe947f8f31a1e 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -57,6 +57,7 @@ const CENTER = { lat: 40.44, lon: -79.95 };
 
 const raid = (id: string, gymId: number | null, more: Partial<MapRaid> = {}): MapRaid => ({
   kind: 'raid',
+  postKey: null,
   id,
   gymId,
   picture: null,
@@ -76,6 +77,7 @@ const raid = (id: string, gymId: number | null, more: Partial<MapRaid> = {}): Ma
 
 const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
   kind: 'train',
+  postKey: null,
   id,
   name: 'Oakland loop',
   trainKind: 'raid',
@@ -89,11 +91,13 @@ const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
   may: { arrange: false, clear: false, load: false, kind: false },
   panel: null,
   conductor: { who: null, mayTake: false, mayDrop: false },
+  moveRefusal: null,
   ...more,
 });
 
 const meetup = (id: string, more: Partial<MapMeetup> = {}): MapMeetup => ({
   kind: 'meetup',
+  postKey: null,
   id,
   name: 'Community Day picnic',
   startTime: NOW + 26 * 60 * MINUTE,
diff --git a/src/web/party-post-view.test.ts b/src/web/party-post-view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..58659cc600381b2efd62a077ba25194b3349e4f5
--- /dev/null
+++ b/src/web/party-post-view.test.ts
@@ -0,0 +1,332 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW, REPORTER, at } from '../../test/support/parties.js';
+import {
+  createdMeetup,
+  createdTrain,
+  reportedMax,
+  reportedRaid,
+} from '../../test/support/party-service.js';
+import { partyWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
+import type {
+  PartiesView,
+  PostButtonView,
+  PostLine,
+  PostNode,
+  PostView,
+  PostViewBlock,
+} from '../domain/web/party-data.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { linkableOnTheMap, type PartyWebDeps } from './party-routes.js';
+
+const PARTIES = `/s/${FAKE_GUILD_ID}/api/parties`;
+const postOf = (id: string, key: string | null | undefined) =>
+  `${PARTIES}/${encodeURIComponent(id)}/post?k=${key ?? ''}`;
+
+type Made = Parameters<typeof partyWebWith>[0];
+
+/** A web server over a test's parties, Alice a member of the server, on the parties' clock. */
+function onTheMap(made: Made, overrides: Partial<PartyWebDeps> = {}): TestWeb {
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice');
+  const web = webServerWith({ members, parties: { ...partyWebWith(made), ...overrides } });
+  web.clock.now = PARTY_NOW;
+  return web;
+}
+
+/** The words a reader sees of nodes, emoji by name, times by their moment. */
+function shown(nodes: readonly PostNode[]): string {
+  return nodes
+    .map((node) => {
+      switch (node.kind) {
+        case 'text':
+        case 'code':
+          return node.text;
+        case 'emoji':
+          return `:${node.name}:`;
+        case 'time':
+          return `[${node.style}]`;
+        default:
+          return shown(node.children);
+      }
+    })
+    .join('');
+}
+
+/** A text block's lines as words. */
+const lines = (block: PostViewBlock | undefined): string[] =>
+  block?.type === 'text' ? block.lines.map((line: PostLine) => shown(line.nodes)) : [];
+
+/** The text blocks of a role. */
+const ofRole = (view: PostView, role: string) =>
+  view.blocks.filter((block) => block.type === 'text' && block.role === role);
+
+/** Every button of a view, row by row. */
+const buttons = (view: PostView): PostButtonView[] =>
+  view.blocks.flatMap((block) => (block.type === 'controls' ? block.rows.flat() : []));
+
+/** Every link node of a view. */
+function links(view: PostView): Array<{ href: string; text: string }> {
+  const found: Array<{ href: string; text: string }> = [];
+  const visit = (nodes: readonly PostNode[]) => {
+    for (const node of nodes) {
+      if (node.kind === 'link') found.push({ href: node.href, text: shown(node.children) });
+      if ('children' in node) visit(node.children);
+    }
+  };
+  for (const block of view.blocks) {
+    if (block.type === 'text') for (const line of block.lines) visit(line.nodes);
+  }
+  return found;
+}
+
+/** The key of a party in Alice's list, then its post as she gets it. */
+async function postFor(
+  web: TestWeb,
+  kind: keyof Omit<PartiesView, 'zone' | 'readOnly'>,
+  id: string,
+) {
+  const cookie = await web.loggedIn(ALICE, 'Alice');
+  const list = (await web.app.inject({ url: PARTIES, headers: { cookie } })).json<PartiesView>();
+  const party = (list[kind] as Array<{ id: string; postKey: string | null }>).find(
+    (one) => one.id === id,
+  );
+  const answer = await web.app.inject({ url: postOf(id, party?.postKey), headers: { cookie } });
+  return { key: party?.postKey, answer, view: answer.json<PostView>(), cookie };
+}
+
+describe('linkableOnTheMap', () => {
+  const PUBLIC = 'https://map.example.test';
+  it('links Google Maps, this server on Discord and Pine’s pages, by https alone', () => {
+    const linkable = (url: string) => linkableOnTheMap(url, FAKE_GUILD_ID, PUBLIC);
+    expect(linkable('https://www.google.com/maps/search/?api=1&query=1%2C2')).toBe(true);
+    expect(linkable(`https://discord.com/channels/${FAKE_GUILD_ID}/123`)).toBe(true);
+    expect(linkable(`${PUBLIC}/s/${FAKE_GUILD_ID}/map`)).toBe(true);
+    expect(linkable('http://www.google.com/maps/x')).toBe(false);
+    expect(linkable('https://www.google.com/search?q=x')).toBe(false);
+    expect(linkable('https://discord.com/channels/999999999999999999/123')).toBe(false);
+    expect(linkable('https://user@www.google.com/maps/x')).toBe(false);
+    expect(linkable('https://www.google.com:8443/maps/x')).toBe(false);
+    expect(linkable('javascript:alert(1)')).toBe(false);
+    expect(linkable('https://evil.example/maps')).toBe(false);
+    expect(linkableOnTheMap('http://localhost:8787/s/1/map', '1', 'http://localhost:8787')).toBe(
+      true,
+    );
+  });
+});
+
+describe('a party’s post on the map (plan 8M-8A)', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('is the raid’s post as Discord shows it, names and all, kept by its key', async () => {
+    const made = await reportedRaid({ reporter: { name: 'Rhea' } });
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    await made.service.flush();
+    web = onTheMap(made);
+    const { key, answer, view } = await postFor(web, 'raids', made.party.id);
+    expect(key).toMatch(/^[0-9a-f]{16}$/u);
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('private, max-age=86400');
+    expect(view.key).toBe(key);
+    expect(view.accent).toBe('egg');
+    expect(lines(ofRole(view, 'head')[0])[0]).toBe('Level 5 raid (egg)');
+    const head = ofRole(view, 'head')[0];
+    expect(head?.type === 'text' && head.lines[0]?.style).toBe('heading');
+    expect(lines(ofRole(view, 'where')[0])[0]).toBe('Where');
+    expect(lines(ofRole(view, 'trainers')[0]).join('\n')).toContain('Bob');
+    expect(lines(ofRole(view, 'note')[0])).toEqual(['Reported by Rhea']);
+    expect(links(view).map((link) => link.text)).toEqual(['Map']);
+    expect(links(view)[0]?.href).toMatch(/^https:\/\/www\.google\.com\/maps\//u);
+    expect(buttons(view).map((button) => button.does.kind)).toContain('press');
+    // Nothing of Discord's controls or members' ids reaches the page.
+    expect(answer.body).not.toContain(`party:${made.party.id}`);
+    expect(answer.body).not.toContain(BOB);
+  });
+
+  it('shows an egg its post carries as a file by Pine’s own egg picture (review 8A-15)', async () => {
+    const made = await reportedRaid();
+    web = onTheMap(made);
+    const { view } = await postFor(web, 'raids', made.party.id);
+    expect(ofRole(view, 'head')[0]).toMatchObject({
+      beside: { kind: 'picture', src: expect.stringMatching(/^\/eggs\/[\w-]+\.png$/u) as unknown },
+    });
+  });
+
+  it('answers the post as it is now, not kept, when the key is another', async () => {
+    const made = await reportedRaid();
+    web = onTheMap(made);
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const answer = await web.app.inject({ url: postOf(made.party.id, 'old'), headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    expect(answer.json<PostView>().key).toMatch(/^[0-9a-f]{16}$/u);
+  });
+
+  it('is for members only, and of a party they may see on the map', async () => {
+    const made = await reportedRaid();
+    web = onTheMap(made);
+    const url = postOf(made.party.id, 'x');
+    expect((await web.app.inject({ url })).statusCode).toBe(401);
+    const stranger = await web.loggedIn(BOB, 'Bob');
+    expect((await web.app.inject({ url, headers: { cookie: stranger } })).statusCode).toBe(403);
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const unknown = await web.app.inject({
+      url: postOf('no-such-party', 'x'),
+      headers: { cookie },
+    });
+    expect(unknown.statusCode).toBe(404);
+    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await web.app.inject({ url, headers: { cookie } })).statusCode).toBe(404);
+  });
+
+  it('is none for a party whose post was not shown since the start', async () => {
+    const made = await reportedRaid();
+    web = onTheMap(made, { layoutOf: () => undefined });
+    const { key, answer } = await postFor(web, 'raids', made.party.id);
+    expect(key).toBeNull();
+    expect(answer.statusCode).toBe(404);
+  });
+
+  it('shows a hatched raid from a screenshot with its guessed times and the screenshot’s note', async () => {
+    const made = await reportedRaid({
+      boss: { key: 'yveltal' },
+      time: { end: at('2026-10-13T14:40') },
+      screenshot: { id: 'abcdefghijkl', timeUncertain: true },
+    });
+    web = onTheMap(made);
+    const { view } = await postFor(web, 'raids', made.party.id);
+    expect(view.accent).toBe('hatched');
+    const head = ofRole(view, 'head')[0];
+    expect(lines(head)[0]).toMatch(/^Level 5 raid against Yveltal/u);
+    expect(head?.type === 'text' && head.lines.flatMap((line) => line.nodes)).toContainEqual({
+      kind: 'code',
+      text: '/hatch',
+    });
+    expect(buttons(view).map((button) => button.does)).toContainEqual({ kind: 'screenshot' });
+  });
+
+  it('shows a max battle’s post', async () => {
+    const made = await reportedMax();
+    web = onTheMap(made);
+    const { view } = await postFor(web, 'maxes', made.party.id);
+    expect(view.accent).toBe('max');
+    expect(lines(ofRole(view, 'head')[0])[0]).toBe('Dynamax Machamp (2★)');
+    expect(lines(ofRole(view, 'where')[0])[1]).toMatch(/\(Power Spot\)/u);
+  });
+
+  it('shows a train with its route ahead, and the post it was split off from by name', async () => {
+    const made = await createdTrain({ route: [1, 2, 3, 4, 5] });
+    const other = await made.service.createTrain({
+      name: 'Evening run',
+      creatorId: REPORTER,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (other.kind !== 'created') throw new Error(other.kind);
+    await made.store.update(made.party.id, (party) =>
+      party.type === 'train'
+        ? {
+            party: {
+              ...party,
+              train: {
+                ...party.train,
+                splitFrom: { partyId: other.party.id, postId: other.party.forumPostId ?? '' },
+              },
+            },
+          }
+        : {},
+    );
+    made.service.changed(made.party.id);
+    await made.service.flush();
+    web = onTheMap(made);
+    const { view } = await postFor(web, 'trains', made.party.id);
+    expect(view.accent).toBe('timed');
+    const where = ofRole(view, 'where').map((block) => lines(block)[0]);
+    expect(where).toEqual(['Where · stop 1 of 5', expect.stringMatching(/^Next: 2\. /u)]);
+    expect(links(view)).toContainEqual({
+      href: `https://discord.com/channels/${FAKE_GUILD_ID}/${other.party.forumPostId ?? ''}`,
+      text: 'Train · Evening run',
+    });
+    expect(buttons(view).find((button) => button.label === 'Move…')?.does).toEqual({
+      kind: 'panel',
+      panel: 'moves',
+    });
+  });
+
+  it('names another post in a forum the member is kept out of as another post, kept 5 minutes (review 8A-5)', async () => {
+    const made = await createdTrain();
+    const other = await made.service.createTrain({
+      name: 'East run',
+      creatorId: REPORTER,
+      regionChannelId: EAST_CHANNEL,
+    });
+    if (other.kind !== 'created') throw new Error(other.kind);
+    const otherPost = other.party.forumPostId ?? '';
+    await made.store.update(made.party.id, (party) =>
+      party.type === 'train'
+        ? {
+            party: {
+              ...party,
+              train: { ...party.train, splitFrom: { partyId: other.party.id, postId: otherPost } },
+            },
+          }
+        : {},
+    );
+    made.service.changed(made.party.id);
+    await made.service.flush();
+    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+    web = onTheMap(made);
+    const { view, answer } = await postFor(web, 'trains', made.party.id);
+    expect(links(view)).toContainEqual({
+      href: `https://discord.com/channels/${FAKE_GUILD_ID}/${otherPost}`,
+      text: 'another post',
+    });
+    expect(answer.headers['cache-control']).toBe('private, max-age=300');
+  });
+
+  it('names a post the member may not see as another post', async () => {
+    const made = await createdTrain();
+    await made.store.update(made.party.id, (party) =>
+      party.type === 'train'
+        ? {
+            party: {
+              ...party,
+              train: {
+                ...party.train,
+                splitFrom: {
+                  partyId: '00000000-0000-4000-8000-000000000000',
+                  postId: '987654321098765432',
+                },
+              },
+            },
+          }
+        : {},
+    );
+    made.service.changed(made.party.id);
+    await made.service.flush();
+    web = onTheMap(made);
+    const { view } = await postFor(web, 'trains', made.party.id);
+    expect(links(view)).toContainEqual({
+      href: `https://discord.com/channels/${FAKE_GUILD_ID}/987654321098765432`,
+      text: 'another post',
+    });
+  });
+
+  it('shows a meetup at a pin', async () => {
+    const made = await createdMeetup({
+      place: { kind: 'pin', lat: 40.05, lon: -80.05, near: null, linkName: 'Blue Tent' },
+    });
+    web = onTheMap(made);
+    const { view } = await postFor(web, 'meetups', made.party.id);
+    expect(view.accent).toBe('timed');
+    expect(lines(ofRole(view, 'where')[0])).toEqual([
+      'Where',
+      expect.stringContaining('Blue Tent'),
+    ]);
+    expect(links(view).map((link) => link.text)).toContain('Map');
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index b2b05c458fa8ebad5b085af0edeb195fbbd46e92..0dd6eb23aed5b22dc8654b5dae382690ce3e9fa6 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -26,12 +26,18 @@ import {
   type PressAnswer,
 } from '../domain/web/party-data.js';
 import {
+  mapParty,
   partyView,
   type MaxLook,
   type PartyViewInput,
   type RaidLook,
 } from '../domain/web/party-view.js';
+import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
+import { allowedPicture } from '../domain/web/picture.js';
+import { EGG_PATH } from '../services/egg-pictures.js';
 import { isRaidAction, PARTY_KIND } from '../render/party-controls.js';
+import type { PostLayout } from '../render/party-post.js';
+import { linkedPosts, postKey, postView, type PostViewOptions } from '../render/post-view.js';
 import { unplain } from '../render/text.js';
 import type {
   AttendanceOutcome,
@@ -86,6 +92,13 @@ export interface PartyWebDeps {
    * left out: none is known.
    */
   spotOf?: (id: string) => { name: string; lat: number; lon: number } | undefined;
+  /**
+   * The layout a party's post was last shown with (plan 8M-8A, `PartyService.layoutOf`), which the
+   * map draws as its popup; undefined while it has none.
+   */
+  layoutOf(partyId: string): PostLayout | undefined;
+  /** The title of a party's post (`PartyService.postTitle`): a split train names the other by it. */
+  titleOf(party: Party): string;
   /** How a member stands to a forum (`PartyGateway.memberAccess`). */
   forums: { memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> };
   /** `settings.timezone`: the posts' times, which the page shows. */
@@ -128,6 +141,47 @@ export interface ActingMembers {
 /** The presses one address may send in a minute, whoever sends them. */
 export const PRESSES_PER_ADDRESS_MINUTE = 60;
 
+/**
+ * The posts one address may ask for in a minute (plan 8M-8A): a page asks for a party's post when
+ * its popup opens and its key changed, and keeps each by its key.
+ */
+export const POSTS_PER_MINUTE = 120;
+
+/**
+ * An egg's picture a post carries as a file (`attachment://<name>.png`: posts made before the web
+ * server listened, or on an address Discord cannot reach) as the web server's own `/eggs/`, which
+ * serves every egg the posts name (review 8A-15); undefined for any other address.
+ */
+export function eggServed(url: string): string | undefined {
+  const name = /^attachment:\/\/([\w-]+\.png)$/u.exec(url)?.[1];
+  return name !== undefined && EGG_PICTURE_NAMES.includes(name.slice(0, -4))
+    ? `${EGG_PATH}${name}`
+    : undefined;
+}
+
+/** How a post links another post the member may not see on the map (a split train's). */
+export const OTHER_POST = 'another post';
+
+/**
+ * Whether a post's address may be a link on the map (plan 8M-8A): Google Maps (a Where's Map),
+ * a post or message of this server on Discord, and Pine's own pages; https only (Pine's own
+ * address as `publicUrl` has it), no user or password. Anything else is shown as its text.
+ */
+export function linkableOnTheMap(url: string, guildId: string, publicUrl: string): boolean {
+  let parsed: URL;
+  try {
+    parsed = new URL(url);
+  } catch {
+    return false;
+  }
+  if (parsed.username !== '' || parsed.password !== '') return false;
+  if (parsed.origin === new URL(publicUrl).origin) return true;
+  if (parsed.protocol !== 'https:' || parsed.port !== '') return false;
+  if (parsed.hostname === 'www.google.com') return /^\/maps(?:\/|$)/u.test(parsed.pathname);
+  if (parsed.hostname === 'discord.com') return parsed.pathname.startsWith(`/channels/${guildId}/`);
+  return false;
+}
+
 /**
  * The body of a press: the group a newcomer chose in the popup (plan 8X-1B), only with `join`,
  * `interested` and `here`. Anything else is malformed.
@@ -172,6 +226,12 @@ function isMapAction(value: string): value is MapAction {
   return (MAP_ACTIONS as readonly string[]).includes(value);
 }
 
+/** A post's address: `/api/parties/<party id>/post?k=<its key>`. */
+type PostRequest = FastifyRequest<{
+  Params: { guild: string; party: string };
+  Querystring: { k?: string };
+}>;
+
 /** A press's address: `/api/parties/<party id>/<action>`. */
 type PressRequest = FastifyRequest<{
   Params: { guild: string; party: string; action: string };
@@ -213,6 +273,34 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
     ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
     pictureOrigins: deps.pictureOrigins,
+    postKey: (party) => {
+      const layout = parties.layoutOf(party.id);
+      return layout === undefined ? undefined : postKey(layout);
+    },
+  });
+
+  /**
+   * How a post is drawn for a member (plan 8M-8A, `postView`): its picture only from the hosts the
+   * page may load, links only to the addresses `linkableOnTheMap` allows, another post named by
+   * its title where the member may see that party on the map, else `OTHER_POST`.
+   */
+  const viewOptions = (
+    guildId: string,
+    own: { parties: readonly Party[] },
+    input: PartyViewInput,
+  ): PostViewOptions => ({
+    emoji: () => undefined,
+    thumbnail: () => undefined,
+    picture: (url) => eggServed(url) ?? allowedPicture(url, deps.pictureOrigins),
+    linkable: (url) => linkableOnTheMap(url, guildId, deps.settings.publicUrl),
+    channel: (postId) => {
+      const other = own.parties.find((party) => party.forumPostId === postId);
+      const seen = other !== undefined && mapParty(other, input) !== null;
+      return {
+        href: `https://discord.com/channels/${guildId}/${postId}`,
+        name: seen ? parties.titleOf(other) : OTHER_POST,
+      };
+    },
   });
 
   /** The active parties of a server; none for a server without its row yet. */
@@ -249,6 +337,51 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     },
   );
 
+  // A party's post (plan 8M-8A): for members only, as the list (`PartyViewers`: 401, 403, 503),
+  // asked whether they are a member before anything of the party is read; then the party as the
+  // list shows it (`mapParty`: of this server, active, not over by the clock, its forum not one
+  // they are kept out of), else 404 as for a party that is not there; then the layout its post
+  // was last shown with (404 while it has none), drawn for the page. Kept by the browser for a day
+  // when asked by its key (`?k=`), which changes with anything of the post; asked anew otherwise.
+  const postLimiter = new RateLimiter({ uses: POSTS_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/parties/:party/post',
+    { onRequest: limitedPerAddress(postLimiter, { now: deps.now }) },
+    async (request: PostRequest, reply) => {
+      const session = await sessions.of(request, reply);
+      if (!session) {
+        void reply.header('cache-control', 'private, no-cache');
+        return sendFailure(request, reply, 401);
+      }
+      const { guild, party: partyId } = request.params;
+      const own = await ownParties(guild);
+      const party = parties.store.get(partyId);
+      const ours = party?.guildId === own.row ? party : undefined;
+      const kept = ours === undefined ? undefined : parties.layoutOf(ours.id);
+      // The forums of the party and of the posts its layout links (a split train's other one,
+      // named only where the member may see it: review 8A-5), asked of Discord together.
+      const linked = kept === undefined ? [] : linkedPosts(kept);
+      const forums = [
+        ours,
+        ...own.parties.filter((one) => linked.includes(one.forumPostId ?? '')),
+      ].flatMap((one) => (one?.forumChannelId ? [one.forumChannelId] : []));
+      const viewer = await viewers.viewer(guild, session.userId, forums);
+      void reply.header('cache-control', 'private, no-cache');
+      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
+      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
+      const input = inputFor(guild, own, session.userId, viewer);
+      const shown = ours !== undefined && mapParty(ours, input) !== null;
+      const layout = shown ? kept : undefined;
+      if (layout === undefined) return sendFailure(request, reply, 404);
+      const view = postView(layout, viewOptions(guild, own, input));
+      // A post that names another is kept 5 minutes: whether the member may see that one changes.
+      if (request.query.k === view.key) {
+        void reply.header('cache-control', `private, max-age=${linked.length > 0 ? 300 : 86400}`);
+      }
+      return reply.type('application/json; charset=utf-8').send(JSON.stringify(view));
+    },
+  );
+
   // A press of a party's button (spec 3.3): before the body is read (`onRequest`), at most
   // `PRESSES_PER_ADDRESS_MINUTE` from one address, the guard of every POST (Origin, session,
   // CSRF token) and an action the post has. Then, so that nobody but a member learns which party
diff --git a/test/support/web.ts b/test/support/web.ts
index 791d6da87037cab6118fd913c9f7f896f910b174..75f386ca4d64000c5ba638cacbd08400fe125cff 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -227,6 +227,8 @@ const NO_PARTIES: PartyWebDeps = {
   guilds: { idFor: () => Promise.resolve(undefined) },
   store: { active: () => [], get: () => undefined },
   look: () => ({}),
+  layoutOf: () => undefined,
+  titleOf: () => '',
   forums: { memberAccess: () => Promise.resolve(undefined) },
   zone: 'America/New_York',
   attendance: {
@@ -270,6 +272,8 @@ export function partyWebWith(
     store: made.store,
     look: (raid) => raidLook(made.service.view(raid)),
     maxLook: (party) => maxLook(made.service.maxView(party)),
+    layoutOf: (partyId) => made.service.layoutOf(partyId),
+    titleOf: (party) => made.service.postTitle(party),
     forums: made.gateway,
     zone: made.settings.timezone,
     attendance: made.attendance,
````

### Task 4: 8M-8A task 4: the post's pictures served by Pine

Prototype commit: `72f56b8a638f486444956268b09d9e3d05db071e`

The posts name their icons by Discord's CDN and the places' pictures by
Google's, neither of which the page's CSP lets in. Pine serves both,
each fetched once into the image cache (src/services/post-pictures.ts):

- EmojiPictures: /emoji/<id>.png, public and kept for good, only for an
  emoji of the application (ApplicationEmoji.hasId, by its last read);
  a post's button or line names it by that address, any other custom
  emoji is its plain one or its name.
- PlacePictures: a gym's or Wayspot's Wayfarer picture by its gym or
  Wayspot (/s/<guild>/pictures/gym/<id>, .../wayspot/<Wayfarer id>),
  never by its address: no open proxy, no Google host in the CSP. For
  members, only while a post of the server that they see on the map
  shows it (404 otherwise, nothing fetched), a day in the browser,
  240 a minute per address.

Served only as PNG, JPEG, GIF or WebP by its first bytes. No host is
added to the CSP.

**Files:**

```
 src/app.ts                             |  12 ++++++++++
 src/render/party-post.ts               |  14 +++++++++++
 src/services/application-emoji.test.ts |  19 +++++++++++++++
 src/services/application-emoji.ts      |  13 +++++++++++
 src/services/post-pictures.test.ts     | 147 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/post-pictures.ts          | 197 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/party-post-view.test.ts        | 139 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/web/party-routes.ts                |  62 +++++++++++++++++++++++++++++++++++++++++++++---
 src/web/server.ts                      |  25 ++++++++++++++++++++
 test/support/web.ts                    |  21 ++++++++++++++++-
 10 files changed, 642 insertions(+), 7 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/application-emoji.test.ts src/services/post-pictures.test.ts src/web/party-post-view.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 72f56b8a638f486444956268b09d9e3d05db071e -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8A task 4: the post's pictures served by Pine`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index d5ca333ce6d38189c6b5782df45ebeeae13c6d4b..b5a4f1045c66c88827127033a7208554d9b421c0 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -99,6 +99,7 @@ import { GoogleRanks } from './services/google-ranks.js';
 import { WayspotLookupRepository } from './db/repositories/wayspot-lookup-repository.js';
 import { WayspotPlaces } from './services/wayspot-places.js';
 import { ImageCache } from './services/image-cache.js';
+import { EmojiPictures, PlacePictures } from './services/post-pictures.js';
 import { NotifyService } from './services/notify-service.js';
 import { OcrAssets } from './services/ocr-assets.js';
 import { OcrService } from './services/ocr-service.js';
@@ -1208,6 +1209,13 @@ export async function startApp(
   if (webAssets && !webAssets.manifest) {
     log.warn('the map page is not built (npm run web:build): its address answers that it is not');
   }
+  // The pictures the map's posts show by Pine's address (plan 8M-8A): the application's emoji
+  // and the places' pictures from Wayfarer, each fetched once into the image cache.
+  const webPictureCache = new ImageCache({
+    dir: IMAGE_CACHE,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
   const web =
     webSettings &&
     webSessions &&
@@ -1267,6 +1275,8 @@ export async function startApp(
         // The layout each post was last shown with, the popup's (plan 8M-8A), and posts' titles.
         layoutOf: (partyId) => partyService.layoutOf(partyId),
         titleOf: (party) => partyService.postTitle(party),
+        // A place's picture beside Where (plan 8M-8A), by its gym or Wayspot, from the image cache.
+        places: new PlacePictures({ gyms, wayspots, cache: webPictureCache }),
         // A power spot of a train's route (plan 8X-4), as the kept Wayspots have it now.
         spotOf: (id) => {
           const kept = wayspots.byId(id);
@@ -1312,6 +1322,8 @@ export async function startApp(
         zone: config.settings.timezone,
       },
       pictures: stopPictures,
+      // The application's emoji for the map's posts (plan 8M-8A), fetched once from Discord's CDN.
+      emoji: new EmojiPictures({ emoji: appEmoji, cache: webPictureCache }),
       now: () => Date.now(),
       log,
     });
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index d94078c913c9fa1268e5980c8473cba1a69cb77a..0f3fa62fef68c83f4eeea791c578e2e51ca4bb49 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -313,6 +313,20 @@ export function layoutPicture(layout: PostLayout): string | undefined {
   return undefined;
 }
 
+/**
+ * The pictures of its own beside a post's parts (a gym's or Wayspot's from Wayfarer): what the
+ * live map may serve of a post (plan 8M-8A, the places' pictures).
+ */
+export function layoutThumbnails(layout: PostLayout): string[] {
+  return layout.blocks.flatMap((block) =>
+    block.type === 'section' &&
+    typeof block.accessory === 'object' &&
+    'thumbnail' in block.accessory
+      ? [block.accessory.thumbnail]
+      : [],
+  );
+}
+
 /**
  * How a post is made a message: with or without its pictures (`picture: false`, for when
  * Discord refuses one: the post's and the gym's go together), with or without its controls
diff --git a/src/services/application-emoji.test.ts b/src/services/application-emoji.test.ts
index b3c9b4247345080d41486ae90696ef9b82ae448f..0fe7a599dd77d7b7987649f540c6529570882de8 100644
--- a/src/services/application-emoji.test.ts
+++ b/src/services/application-emoji.test.ts
@@ -15,6 +15,25 @@ describe('ApplicationEmoji', () => {
     expect(emoji.get('ice')).toBeUndefined();
   });
 
+  it('knows which ids are its emoji, animated too, as the last read found them (plan 8M-8A)', async () => {
+    const { log } = createTestLogger();
+    let list = new Map([
+      ['rock', '<:rock:111111111111111111>'],
+      ['spin', '<a:spin:222222222222222222>'],
+    ]);
+    const emoji = new ApplicationEmoji({ list: () => Promise.resolve(list) }, log);
+    expect(emoji.hasId('111111111111111111')).toBe(false);
+    await emoji.refresh();
+    expect(emoji.hasId('111111111111111111')).toBe(true);
+    expect(emoji.hasId('222222222222222222')).toBe(true);
+    expect(emoji.hasId('333333333333333333')).toBe(false);
+    expect(emoji.hasId('rock')).toBe(false);
+    list = new Map([['ice', '<:ice:333333333333333333>']]);
+    await emoji.refresh();
+    expect(emoji.hasId('111111111111111111')).toBe(false);
+    expect(emoji.hasId('333333333333333333')).toBe(true);
+  });
+
   it('says at debug how many emoji a read found (plan 8X-H)', async () => {
     const { log, entries } = createTestLogger();
     const emoji = new ApplicationEmoji(
diff --git a/src/services/application-emoji.ts b/src/services/application-emoji.ts
index 147e1a8cd79cef544dc2168ac0547b1db2045325..6aff83b97a25c4b3a152af21018daeec87901d79 100644
--- a/src/services/application-emoji.ts
+++ b/src/services/application-emoji.ts
@@ -26,6 +26,8 @@ export const REFUSED_REREAD_GAP_MS = 60_000;
  */
 export class ApplicationEmoji {
   private known: ReadonlyMap<string, string> = new Map();
+  /** The ids of `known` (plan 8M-8A: the only emoji pictures Pine's web server serves). */
+  private ids: ReadonlySet<string> = new Set();
   private reading: Promise<void> | undefined;
   /** Whether a read went through yet. */
   private readOnce = false;
@@ -69,6 +71,9 @@ export class ApplicationEmoji {
         const changed = !this.readOnce || !sameEmoji(this.known, found);
         this.readOnce = true;
         this.known = found;
+        this.ids = new Set(
+          [...found.values()].flatMap((text) => /^<a?:\w+:(\d+)>$/u.exec(text)?.slice(1) ?? []),
+        );
         // So that a read can be seen to have run (plan 8X-H: after an outage).
         this.log.debug({ emoji: found.size }, 'read the emoji of the application');
         if (changed) this.listener?.();
@@ -85,6 +90,14 @@ export class ApplicationEmoji {
     return this.reading;
   }
 
+  /**
+   * Whether an emoji of this id is the application's, by the last good read (plan 8M-8A): the web
+   * server serves the pictures of these alone (`EmojiPictures`).
+   */
+  hasId(id: string): boolean {
+    return this.ids.has(id);
+  }
+
   /** The emoji of that name as message text, or undefined when the application has none. */
   get(name: string): string | undefined {
     return this.known.get(name);
diff --git a/src/services/post-pictures.test.ts b/src/services/post-pictures.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..310c3453ec1225051ba9d17058b5fa9e9ace7d40
--- /dev/null
+++ b/src/services/post-pictures.test.ts
@@ -0,0 +1,147 @@
+import { mkdtemp } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { ImageCache, type FetchImage } from './image-cache.js';
+import { EmojiPictures, PlacePictures, pictureType } from './post-pictures.js';
+
+const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
+const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
+const SERVED = '111111111111111111';
+const WAYSPOT = '0123456789abcdef0123456789abcdef.16';
+
+/** An image cache in a folder of its own over a fetch that answers these bytes, and its calls. */
+async function cacheOf(bytes: Uint8Array, type: string) {
+  const asked: string[] = [];
+  const fetch: FetchImage = (url) => {
+    asked.push(url);
+    return Promise.resolve({
+      ok: true,
+      status: 200,
+      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
+      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
+    });
+  };
+  const dir = await mkdtemp(path.join(tmpdir(), 'pine-post-pictures-'));
+  return { cache: new ImageCache({ dir, fetch, log: createTestLogger().log }), asked };
+}
+
+describe('pictureType', () => {
+  it('knows a PNG, a JPEG, a GIF and a WebP by their first bytes, and nothing else', () => {
+    expect(pictureType(Buffer.from(PNG))).toBe('image/png');
+    expect(pictureType(Buffer.from(JPEG))).toBe('image/jpeg');
+    expect(pictureType(Buffer.from('GIF89a…'))).toBe('image/gif');
+    expect(pictureType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
+    expect(pictureType(Buffer.from('<svg onload=…>'))).toBeUndefined();
+  });
+});
+
+describe('EmojiPictures (plan 8M-8A)', () => {
+  it('serves the application’s emoji alone, each fetched from Discord’s CDN once', async () => {
+    const { cache, asked } = await cacheOf(PNG, 'image/png');
+    const pictures = new EmojiPictures({ emoji: { hasId: (id) => id === SERVED }, cache });
+    expect(pictures.address(SERVED)).toBe(`/emoji/${SERVED}.png`);
+    expect(pictures.address('222222222222222222')).toBeUndefined();
+    expect(await pictures.read('222222222222222222')).toBeUndefined();
+    expect(asked).toEqual([]);
+    const first = await pictures.read(SERVED);
+    expect(first).toEqual({ bytes: Buffer.from(PNG), type: 'image/png' });
+    expect(await pictures.read(SERVED)).toEqual(first);
+    expect(asked).toEqual([`https://cdn.discordapp.com/emojis/${SERVED}.png?size=96`]);
+  });
+
+  it('serves nothing that is not a picture', async () => {
+    const { cache } = await cacheOf(new TextEncoder().encode('<html>'), 'image/png');
+    const pictures = new EmojiPictures({ emoji: { hasId: () => true }, cache });
+    expect(await pictures.read(SERVED)).toBeUndefined();
+  });
+});
+
+describe('a picture that could not be had (review 8A-6)', () => {
+  /** A cache whose every download fails, counting what it was asked for. */
+  const failing = () => {
+    const asked: string[] = [];
+    const cache = {
+      get: (request: { url: string }) => {
+        asked.push(request.url);
+        return Promise.resolve(undefined);
+      },
+    };
+    return { cache, asked };
+  };
+
+  it('is not asked for again for a minute, the emoji’s or a place’s', async () => {
+    const clock = { now: 1_000_000 };
+    const emojiCache = failing();
+    const emoji = new EmojiPictures({
+      emoji: { hasId: () => true },
+      cache: emojiCache.cache,
+      now: () => clock.now,
+    });
+    const placeCache = failing();
+    const places = new PlacePictures({
+      gyms: {
+        generation: 1,
+        all: () => [],
+        get: () => ({ imageUrl: 'https://lh3.googleusercontent.com/g' }),
+      },
+      cache: placeCache.cache,
+      now: () => clock.now,
+    });
+    expect(await emoji.read(SERVED)).toBeUndefined();
+    expect(await places.read('gym', '1')).toBeUndefined();
+    clock.now += 59_000;
+    expect(await emoji.read(SERVED)).toBeUndefined();
+    expect(await places.read('gym', '1')).toBeUndefined();
+    expect(emojiCache.asked).toHaveLength(1);
+    expect(placeCache.asked).toHaveLength(1);
+    clock.now += 2_000;
+    await emoji.read(SERVED);
+    await places.read('gym', '1');
+    expect(emojiCache.asked).toHaveLength(2);
+    expect(placeCache.asked).toHaveLength(2);
+  });
+});
+
+describe('PlacePictures (plan 8M-8A)', () => {
+  const gyms = {
+    generation: 1,
+    all: () => [
+      { id: 12, imageUrl: 'http://lh3.googleusercontent.com/gym12=s1600' },
+      { id: 13, imageUrl: null },
+    ],
+    get: (id: number) =>
+      id === 12 ? { imageUrl: 'http://lh3.googleusercontent.com/gym12=s1600' } : undefined,
+  };
+  const wayspots = {
+    contentGeneration: 1,
+    all: () => [{ id: WAYSPOT, image: 'https://lh3.googleusercontent.com/stop' }],
+    byId: (id: string) =>
+      id === WAYSPOT ? { image: 'https://lh3.googleusercontent.com/stop' } : undefined,
+  };
+
+  it('names a picture a post shows by its gym or Wayspot, never by its address', async () => {
+    const { cache } = await cacheOf(JPEG, 'image/jpeg');
+    const places = new PlacePictures({ gyms, wayspots, cache });
+    expect(places.keyOf('https://lh3.googleusercontent.com/gym12=s400')).toBe('gym/12');
+    expect(places.keyOf('https://lh3.googleusercontent.com/stop=s400')).toBe(`wayspot/${WAYSPOT}`);
+    expect(places.keyOf('https://lh3.googleusercontent.com/other=s400')).toBeUndefined();
+    expect(places.urlOf('gym', '12')).toBe('https://lh3.googleusercontent.com/gym12=s400');
+    expect(places.urlOf('gym', '13')).toBeUndefined();
+    expect(places.urlOf('wayspot', WAYSPOT)).toBe('https://lh3.googleusercontent.com/stop=s400');
+    expect(places.urlOf('wayspot', 'nope')).toBeUndefined();
+  });
+
+  it('fetches a place’s picture once through the image cache', async () => {
+    const { cache, asked } = await cacheOf(JPEG, 'image/jpeg');
+    const places = new PlacePictures({ gyms, wayspots, cache });
+    expect(await places.read('wayspot', WAYSPOT)).toEqual({
+      bytes: Buffer.from(JPEG),
+      type: 'image/jpeg',
+    });
+    expect(await places.read('wayspot', WAYSPOT)).toBeDefined();
+    expect(await places.read('gym', '13')).toBeUndefined();
+    expect(asked).toEqual(['https://lh3.googleusercontent.com/stop=s400']);
+  });
+});
diff --git a/src/services/post-pictures.ts b/src/services/post-pictures.ts
new file mode 100644
index 0000000000000000000000000000000000000000..08b55639674b4a6bf8a9f1aecec7a49e4739ef82
--- /dev/null
+++ b/src/services/post-pictures.ts
@@ -0,0 +1,197 @@
+import { readFile } from 'node:fs/promises';
+import { wayspotPicture } from '../domain/wayspots/picture.js';
+import { BoundedMap } from '../bounded-map.js';
+import type { ImageRequest } from './image-cache.js';
+
+/** A picture as the web server answers it: its bytes and their type. */
+export interface PictureBytes {
+  bytes: Buffer;
+  type: string;
+}
+
+/** Where the pictures come from and are kept (`ImageCache`, `var/images`). */
+export interface PictureCache {
+  get(request: ImageRequest): Promise<string | undefined>;
+}
+
+/**
+ * The type of a picture by its first bytes: PNG, JPEG, GIF or WebP, undefined for anything else,
+ * which is never served as a picture (an answer that is no picture, whatever its header said).
+ */
+export function pictureType(bytes: Buffer): string | undefined {
+  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
+    return 'image/png';
+  }
+  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
+  const head = bytes.subarray(0, 12).toString('latin1');
+  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
+  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
+  return undefined;
+}
+
+/** A file of the cache as a picture, undefined when it cannot be read or is none. */
+async function pictureOf(
+  file: string | undefined,
+  read: (file: string) => Promise<Buffer>,
+): Promise<PictureBytes | undefined> {
+  if (file === undefined) return undefined;
+  let bytes: Buffer;
+  try {
+    bytes = await read(file);
+  } catch {
+    return undefined;
+  }
+  const type = pictureType(bytes);
+  return type === undefined ? undefined : { bytes, type };
+}
+
+/** How long a picture that could not be had is not asked for again (review 8A-6). */
+export const FAILED_PICTURE_MS = 60_000;
+
+/**
+ * The cache's file of a picture, a download that failed remembered for `FAILED_PICTURE_MS` by its
+ * key (in a `BoundedMap`), so that a page asking again and again does not download again and again.
+ */
+class Downloads {
+  private readonly failed = new BoundedMap<string, number>(1_000);
+
+  constructor(
+    private readonly cache: PictureCache,
+    private readonly now: () => number,
+  ) {}
+
+  async file(key: string, request: ImageRequest): Promise<string | undefined> {
+    const at = this.failed.get(key);
+    if (at !== undefined && this.now() - at < FAILED_PICTURE_MS) return undefined;
+    const file = await this.cache.get(request);
+    if (file === undefined) this.failed.set(key, this.now());
+    else this.failed.delete(key);
+    return file;
+  }
+}
+
+/** Where the web server serves the application's emoji (plan 8M-8A): `/emoji/<id>.png`. */
+export const EMOJI_PATH = '/emoji/';
+
+/**
+ * The pictures of the application's emoji for the live map (plan 8M-8A): the posts name their
+ * icons by Discord's CDN, which the page's CSP does not let in (and which would learn of every
+ * member's browser), so Pine serves them: only the application's own (`hasId`), each fetched once
+ * from the CDN into the image cache and served from there. Any other emoji the page shows by its
+ * name.
+ */
+export class EmojiPictures {
+  private readonly downloads: Downloads;
+
+  constructor(
+    private readonly options: {
+      emoji: { hasId(id: string): boolean };
+      cache: PictureCache;
+      read?: (file: string) => Promise<Buffer>;
+      now?: () => number;
+    },
+  ) {
+    this.downloads = new Downloads(options.cache, options.now ?? Date.now);
+  }
+
+  /** Pine's address of an emoji's picture, undefined for one that is not the application's. */
+  address(id: string): string | undefined {
+    return this.options.emoji.hasId(id) ? `${EMOJI_PATH}${id}.png` : undefined;
+  }
+
+  /** An emoji's picture, undefined for one that is not the application's or cannot be had. */
+  async read(id: string): Promise<PictureBytes | undefined> {
+    if (!/^\d{17,20}$/u.test(id) || !this.options.emoji.hasId(id)) return undefined;
+    const file = await this.downloads.file(id, {
+      folder: 'emoji',
+      id,
+      // An emoji's picture never changes under its id.
+      variant: '96',
+      url: `https://cdn.discordapp.com/emojis/${id}.png?size=96`,
+    });
+    return pictureOf(file, this.options.read ?? readFile);
+  }
+}
+
+/** What kind of place a place's picture is of: a gym by its number, a Wayspot by Wayfarer's id. */
+export type PlaceKind = 'gym' | 'wayspot';
+
+/** The gyms and the kept Wayspots, by what their pictures are. */
+export interface PlaceSources {
+  gyms: {
+    readonly generation: number;
+    all(): readonly { id: number; imageUrl?: string | null | undefined }[];
+    get(id: number): { imageUrl?: string | null | undefined } | undefined;
+  };
+  wayspots?: {
+    readonly contentGeneration: number;
+    all(): readonly { id: string; image: string | null }[];
+    byId(id: string): { image: string | null } | undefined;
+  };
+}
+
+/**
+ * The pictures of places beside a post's Where (plan 8M-8A: a gym's or Wayspot's from Wayfarer),
+ * for the live map: Google's host stays out of the page's CSP, and Pine is no open proxy, so a
+ * picture is named by its gym or Wayspot (`keyOf`: `gym/12`, `wayspot/<Wayfarer id>`), never by
+ * its address, and fetched once through the image cache. The address a post shows is the gym's
+ * or Wayspot's as `wayspotPicture` makes it; the index of them is made anew when the gyms or the
+ * kept Wayspots change.
+ */
+export class PlacePictures {
+  private index: { stamp: string; keys: Map<string, string> } | undefined;
+  private readonly downloads: Downloads;
+
+  constructor(
+    private readonly options: PlaceSources & {
+      cache: PictureCache;
+      read?: (file: string) => Promise<Buffer>;
+      now?: () => number;
+    },
+  ) {
+    this.downloads = new Downloads(options.cache, options.now ?? Date.now);
+  }
+
+  /** The key of a picture a post shows, undefined for one of no gym or Wayspot Pine keeps. */
+  keyOf(url: string): string | undefined {
+    const { gyms, wayspots } = this.options;
+    const stamp = `${String(gyms.generation)}:${String(wayspots?.contentGeneration ?? 0)}`;
+    if (this.index?.stamp !== stamp) {
+      const keys = new Map<string, string>();
+      for (const gym of gyms.all()) {
+        const shown = wayspotPicture(gym.imageUrl);
+        if (shown !== undefined) keys.set(shown, `gym/${String(gym.id)}`);
+      }
+      for (const wayspot of wayspots?.all() ?? []) {
+        const shown = wayspotPicture(wayspot.image);
+        if (shown !== undefined && !keys.has(shown)) keys.set(shown, `wayspot/${wayspot.id}`);
+      }
+      this.index = { stamp, keys };
+    }
+    return this.index.keys.get(url);
+  }
+
+  /** The address a post shows of a place's picture (`wayspotPicture`), undefined for none. */
+  urlOf(kind: PlaceKind, id: string): string | undefined {
+    if (kind === 'gym') {
+      return /^\d{1,10}$/u.test(id)
+        ? wayspotPicture(this.options.gyms.get(Number(id))?.imageUrl)
+        : undefined;
+    }
+    return wayspotPicture(this.options.wayspots?.byId(id)?.image);
+  }
+
+  /** A place's picture, undefined where it has none or it cannot be had. */
+  async read(kind: PlaceKind, id: string): Promise<PictureBytes | undefined> {
+    const url = this.urlOf(kind, id);
+    if (url === undefined) return undefined;
+    const file = await this.downloads.file(`${kind}/${id}`, {
+      folder: 'places',
+      // The image cache takes letters, digits, hyphens and underscores: a Wayfarer id has a dot.
+      id: `${kind}-${id.replace(/[^A-Za-z0-9_-]/gu, '_')}`,
+      variant: url,
+      url,
+    });
+    return pictureOf(file, this.options.read ?? readFile);
+  }
+}
diff --git a/src/web/party-post-view.test.ts b/src/web/party-post-view.test.ts
index 58659cc600381b2efd62a077ba25194b3349e4f5..022d90ca31bde21bcd21f2bd073eaf190503334e 100644
--- a/src/web/party-post-view.test.ts
+++ b/src/web/party-post-view.test.ts
@@ -9,7 +9,14 @@ import {
   reportedMax,
   reportedRaid,
 } from '../../test/support/party-service.js';
-import { partyWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import {
+  partyWebWith,
+  webServerWith,
+  type TestWeb,
+  type WebTestOptions,
+} from '../../test/support/web.js';
+import type { GymProvider } from '../services/gym-directory.js';
 import type {
   PartiesView,
   PostButtonView,
@@ -20,6 +27,7 @@ import type {
 } from '../domain/web/party-data.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { linkableOnTheMap, type PartyWebDeps } from './party-routes.js';
+import { BARRED_FRESH_MS } from './party-viewers.js';
 
 const PARTIES = `/s/${FAKE_GUILD_ID}/api/parties`;
 const postOf = (id: string, key: string | null | undefined) =>
@@ -28,9 +36,17 @@ const postOf = (id: string, key: string | null | undefined) =>
 type Made = Parameters<typeof partyWebWith>[0];
 
 /** A web server over a test's parties, Alice a member of the server, on the parties' clock. */
-function onTheMap(made: Made, overrides: Partial<PartyWebDeps> = {}): TestWeb {
+function onTheMap(
+  made: Made,
+  overrides: Partial<PartyWebDeps> = {},
+  options: WebTestOptions = {},
+): TestWeb {
   const members = new FakeMemberDirectory().add(ALICE, 'Alice');
-  const web = webServerWith({ members, parties: { ...partyWebWith(made), ...overrides } });
+  const web = webServerWith({
+    members,
+    parties: { ...partyWebWith(made), ...overrides },
+    ...options,
+  });
   web.clock.now = PARTY_NOW;
   return web;
 }
@@ -330,3 +346,120 @@ describe('a party’s post on the map (plan 8M-8A)', () => {
     expect(links(view).map((link) => link.text)).toContain('Map');
   });
 });
+
+const SERVED = '111111111111111111';
+const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
+const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
+const LIBRARY_PICTURE = 'https://lh3.googleusercontent.com/library';
+
+describe('the pictures of a post on the map (plan 8M-8A)', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('serves the application emoji by id, kept for good, and nothing else', async () => {
+    const made = await reportedRaid();
+    web = onTheMap(
+      made,
+      {},
+      {
+        emoji: {
+          address: (id) => (id === SERVED ? `/emoji/${id}.png` : undefined),
+          read: (id) =>
+            Promise.resolve(id === SERVED ? { bytes: PNG, type: 'image/png' } : undefined),
+        },
+      },
+    );
+    const answer = await web.app.inject({ url: `/emoji/${SERVED}.png` });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toBe('image/png');
+    expect(answer.headers['cache-control']).toBe('public, max-age=31536000, immutable');
+    expect(answer.rawPayload).toEqual(PNG);
+    expect((await web.app.inject({ url: '/emoji/222222222222222222.png' })).statusCode).toBe(404);
+    expect((await web.app.inject({ url: `/emoji/${SERVED}.gif` })).statusCode).toBe(404);
+    expect((await web.app.inject({ url: '/emoji/..%2Fsecret.png' })).statusCode).toBe(404);
+  });
+
+  it('names the application emoji of a post’s buttons and lines by Pine’s address', async () => {
+    const made = await reportedRaid(
+      {},
+      { appEmoji: { get: (name) => (name === 'pinejoin' ? `<:pinejoin:${SERVED}>` : undefined) } },
+    );
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    await made.service.flush();
+    web = onTheMap(
+      made,
+      {},
+      {
+        emoji: {
+          address: (id) => (id === SERVED ? `/emoji/${id}.png` : undefined),
+          read: () => Promise.resolve(undefined),
+        },
+      },
+    );
+    const { view } = await postFor(web, 'raids', made.party.id);
+    expect(buttons(view).find((button) => button.name === 'Coming')?.emoji).toEqual({
+      name: 'pinejoin',
+      src: `/emoji/${SERVED}.png`,
+    });
+    const trainers = ofRole(view, 'trainers')[0];
+    expect(
+      trainers?.type === 'text' && trainers.lines.flatMap((line) => line.nodes),
+    ).toContainEqual({
+      kind: 'emoji',
+      name: 'pinejoin',
+      src: `/emoji/${SERVED}.png`,
+    });
+  });
+
+  it('puts the gym’s picture beside Where by Pine’s address, for members who see the post', async () => {
+    const base = gymsFixture();
+    const gyms = Object.assign(Object.create(base) as GymProvider, {
+      get: (id: number) => {
+        const gym = base.get(id);
+        return gym && id === 1 ? { ...gym, imageUrl: LIBRARY_PICTURE } : gym;
+      },
+    });
+    const made = await reportedRaid({}, { gyms });
+    const asked: string[] = [];
+    web = onTheMap(made, {
+      places: {
+        keyOf: (url) => (url === `${LIBRARY_PICTURE}=s400` ? 'gym/1' : undefined),
+        read: (kind, id) => {
+          asked.push(`${kind}/${id}`);
+          return Promise.resolve(
+            kind === 'gym' && id === '1' ? { bytes: JPEG, type: 'image/jpeg' } : undefined,
+          );
+        },
+        urlOf: (kind, id) => (kind === 'gym' && id === '1' ? `${LIBRARY_PICTURE}=s400` : undefined),
+      },
+    });
+    const { view, cookie } = await postFor(web, 'raids', made.party.id);
+    const picture = `/s/${FAKE_GUILD_ID}/pictures/gym/1`;
+    expect(ofRole(view, 'where')[0]).toMatchObject({ beside: { kind: 'picture', src: picture } });
+    expect((await web.app.inject({ url: picture })).statusCode).toBe(401);
+    const stranger = await web.loggedIn(BOB, 'Bob');
+    expect((await web.app.inject({ url: picture, headers: { cookie: stranger } })).statusCode).toBe(
+      403,
+    );
+    const answer = await web.app.inject({ url: picture, headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toBe('image/jpeg');
+    expect(answer.headers['cache-control']).toBe('private, max-age=86400');
+    expect(answer.rawPayload).toEqual(JPEG);
+    // A gym no post the member sees shows: nothing is fetched for it.
+    const other = await web.app.inject({
+      url: `/s/${FAKE_GUILD_ID}/pictures/gym/2`,
+      headers: { cookie },
+    });
+    expect(other.statusCode).toBe(404);
+    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    // What Discord said of the forum is used for a minute (`BARRED_FRESH_MS`).
+    web.clock.now += BARRED_FRESH_MS;
+    const barred = await web.app.inject({ url: picture, headers: { cookie } });
+    expect(barred.statusCode).toBe(404);
+    expect(asked).toEqual(['gym/1']);
+  });
+});
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 0dd6eb23aed5b22dc8654b5dae382690ce3e9fa6..c4ec5c2a7b6b83d70e132e52af12fe593562e1c6 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -36,7 +36,8 @@ import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
 import { allowedPicture } from '../domain/web/picture.js';
 import { EGG_PATH } from '../services/egg-pictures.js';
 import { isRaidAction, PARTY_KIND } from '../render/party-controls.js';
-import type { PostLayout } from '../render/party-post.js';
+import { layoutThumbnails, type PostLayout } from '../render/party-post.js';
+import type { PlacePictures } from '../services/post-pictures.js';
 import { linkedPosts, postKey, postView, type PostViewOptions } from '../render/post-view.js';
 import { unplain } from '../render/text.js';
 import type {
@@ -99,6 +100,11 @@ export interface PartyWebDeps {
   layoutOf(partyId: string): PostLayout | undefined;
   /** The title of a party's post (`PartyService.postTitle`): a split train names the other by it. */
   titleOf(party: Party): string;
+  /**
+   * The pictures of places beside a post's Where (plan 8M-8A, `PlacePictures`), named by their gym
+   * or Wayspot and served from the image cache.
+   */
+  places: Pick<PlacePictures, 'keyOf' | 'urlOf' | 'read'>;
   /** How a member stands to a forum (`PartyGateway.memberAccess`). */
   forums: { memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> };
   /** `settings.timezone`: the posts' times, which the page shows. */
@@ -147,6 +153,12 @@ export const PRESSES_PER_ADDRESS_MINUTE = 60;
  */
 export const POSTS_PER_MINUTE = 120;
 
+/**
+ * The places' pictures one address may ask for in a minute (plan 8M-8A): a popup shows one, the
+ * browser keeps each for a day.
+ */
+export const PLACE_PICTURES_PER_MINUTE = 240;
+
 /**
  * An egg's picture a post carries as a file (`attachment://<name>.png`: posts made before the web
  * server listened, or on an address Discord cannot reach) as the web server's own `/eggs/`, which
@@ -232,6 +244,9 @@ type PostRequest = FastifyRequest<{
   Querystring: { k?: string };
 }>;
 
+/** A place's picture's address: `/pictures/gym/<id>` or `/pictures/wayspot/<Wayfarer id>`. */
+type PlaceRequest = FastifyRequest<{ Params: { guild: string; kind: string; id: string } }>;
+
 /** A press's address: `/api/parties/<party id>/<action>`. */
 type PressRequest = FastifyRequest<{
   Params: { guild: string; party: string; action: string };
@@ -289,8 +304,11 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     own: { parties: readonly Party[] },
     input: PartyViewInput,
   ): PostViewOptions => ({
-    emoji: () => undefined,
-    thumbnail: () => undefined,
+    emoji: (id) => deps.emoji.address(id),
+    thumbnail: (url) => {
+      const key = parties.places.keyOf(url);
+      return key === undefined ? undefined : `/s/${guildId}/pictures/${key}`;
+    },
     picture: (url) => eggServed(url) ?? allowedPicture(url, deps.pictureOrigins),
     linkable: (url) => linkableOnTheMap(url, guildId, deps.settings.publicUrl),
     channel: (postId) => {
@@ -382,6 +400,44 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     },
   );
 
+  // A place's picture beside a post's Where (plan 8M-8A): for members (401, 403, 503 as the
+  // list), by its gym or Wayspot (`PlacePictures`), only while a post of this server that the
+  // member sees on the map shows it (else 404, nothing fetched): no open proxy, and nothing of a
+  // party the member may not see. A day in the browser.
+  const placeLimiter = new RateLimiter({ uses: PLACE_PICTURES_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/pictures/:kind/:id',
+    { onRequest: limitedPerAddress(placeLimiter, { now: deps.now }) },
+    async (request: PlaceRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const { guild, kind, id } = request.params;
+      const own = await ownParties(guild);
+      const forums = own.parties.flatMap((party) =>
+        party.forumChannelId === null ? [] : [party.forumChannelId],
+      );
+      const viewer = await viewers.viewer(guild, session.userId, forums);
+      if (viewer.kind === 'not-member') return sendFailure(request, reply, 403);
+      if (viewer.kind === 'unconfirmed') return reply.code(503).send({ error: UNCONFIRMED });
+      if (kind !== 'gym' && kind !== 'wayspot') return sendFailure(request, reply, 404);
+      const input = inputFor(guild, own, session.userId, viewer);
+      const url = parties.places.urlOf(kind, id);
+      const shown =
+        url !== undefined &&
+        own.parties.some((party) => {
+          const layout = mapParty(party, input) === null ? undefined : parties.layoutOf(party.id);
+          return layout !== undefined && layoutThumbnails(layout).includes(url);
+        });
+      const picture = shown ? await parties.places.read(kind, id) : undefined;
+      if (picture === undefined) return sendFailure(request, reply, 404);
+      return reply
+        .header('cache-control', 'private, max-age=86400')
+        .type(picture.type)
+        .send(picture.bytes);
+    },
+  );
+
   // A press of a party's button (spec 3.3): before the body is read (`onRequest`), at most
   // `PRESSES_PER_ADDRESS_MINUTE` from one address, the guard of every POST (Origin, session,
   // CSRF token) and an action the post has. Then, so that nobody but a member learns which party
diff --git a/src/web/server.ts b/src/web/server.ts
index 82e92f57aa306a2fae6c5fb4cb13d1a733cd9100..a76fb779b410b31d9c66f682a3db93dde4ce8a41 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -8,6 +8,7 @@ import type { MemberDirectory } from '../discord/member-directory.js';
 import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
 import type { Logger } from '../log.js';
 import { EGG_FOLDER, EGG_PATH } from '../services/egg-pictures.js';
+import { EMOJI_PATH, type EmojiPictures } from '../services/post-pictures.js';
 import { PICTURE_PATH, type StopPictures } from '../services/stop-pictures.js';
 import { sendFailure, shortPage } from './answers.js';
 import { authRoutes } from './auth-routes.js';
@@ -78,6 +79,11 @@ export interface WebDeps {
    * the address of a hideout's picture on the map, as the post of the stops names it.
    */
   pictures: Pick<StopPictures, 'read' | 'url'>;
+  /**
+   * The pictures of the application's emoji (plan 8M-8A, `EmojiPictures`): `/emoji/<id>.png`,
+   * and the address a post's icon has on the map.
+   */
+  emoji: Pick<EmojiPictures, 'address' | 'read'>;
   now: () => number;
   log: Logger;
 }
@@ -160,6 +166,7 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
   });
   eggRoutes(app);
   pictureRoutes(app, deps.pictures);
+  emojiRoutes(app, deps.emoji);
   toolFileRoutes(app, deps);
   toolPageRoutes(app, deps);
   void app.register((instance, _options, done) => {
@@ -199,6 +206,24 @@ function eggRoutes(app: FastifyInstance): void {
   });
 }
 
+/**
+ * The pictures of the application's emoji (plan 8M-8A): public, as Discord's CDN has them, `GET
+ * /emoji/<id>.png` for an emoji of the application alone (`EmojiPictures`; anything else 404),
+ * fetched once and kept for good (an emoji's picture never changes under its id). No rate limit:
+ * the application has some dozens, each fetched once.
+ */
+function emojiRoutes(app: FastifyInstance, emoji: WebDeps['emoji']): void {
+  app.get<{ Params: { file: string } }>(`${EMOJI_PATH}:file`, async (request, reply) => {
+    const id = /^(\d{17,20})\.png$/u.exec(request.params.file)?.[1];
+    const picture = id === undefined ? undefined : await emoji.read(id);
+    if (picture === undefined) return sendFailure(request, reply, 404);
+    return reply
+      .type(picture.type)
+      .header('cache-control', 'public, max-age=31536000, immutable')
+      .send(picture.bytes);
+  });
+}
+
 /**
  * The square pictures of the reports at stops (plan 8R-6): public, `GET /pictures/<key>.png` for
  * the pictures `StopPictures` made and nothing else, kept as long as the eggs (their address
diff --git a/test/support/web.ts b/test/support/web.ts
index 75f386ca4d64000c5ba638cacbd08400fe125cff..93c5ae61afb56a0a2cd256bdc86c02e1c321b156 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -222,6 +222,13 @@ export class FakeActingMembers implements ActingMembers {
 const noAttendance = (): Promise<never> =>
   Promise.reject(new Error('no parties in this test: give partyWebWith'));
 
+/** No place has a picture the map serves (plan 8M-8A): a test that needs one passes `places`. */
+const NO_PLACES: PartyWebDeps['places'] = {
+  keyOf: () => undefined,
+  urlOf: () => undefined,
+  read: () => Promise.resolve(undefined),
+};
+
 /** No parties: the live map of a server without any. */
 const NO_PARTIES: PartyWebDeps = {
   guilds: { idFor: () => Promise.resolve(undefined) },
@@ -229,6 +236,7 @@ const NO_PARTIES: PartyWebDeps = {
   look: () => ({}),
   layoutOf: () => undefined,
   titleOf: () => '',
+  places: NO_PLACES,
   forums: { memberAccess: () => Promise.resolve(undefined) },
   zone: 'America/New_York',
   attendance: {
@@ -263,7 +271,11 @@ export function partyWebWith(
     Awaited<ReturnType<typeof partyServiceWith>>,
     'gateway' | 'store' | 'service' | 'settings' | 'attendance'
   >,
-  options: { acting?: ActingMembers; throttles?: Throttles } = {},
+  options: {
+    acting?: ActingMembers;
+    throttles?: Throttles;
+    places?: PartyWebDeps['places'];
+  } = {},
 ): PartyWebDeps {
   return {
     guilds: {
@@ -274,6 +286,7 @@ export function partyWebWith(
     maxLook: (party) => maxLook(made.service.maxView(party)),
     layoutOf: (partyId) => made.service.layoutOf(partyId),
     titleOf: (party) => made.service.postTitle(party),
+    places: options.places ?? NO_PLACES,
     forums: made.gateway,
     zone: made.settings.timezone,
     attendance: made.attendance,
@@ -539,6 +552,8 @@ export interface WebTestOptions {
    * as it is.
    */
   pictures?: Partial<WebDeps['pictures']>;
+  /** The application emoji's pictures (plan 8M-8A): none by default. */
+  emoji?: WebDeps['emoji'];
 }
 
 /**
@@ -718,6 +733,10 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
       url: (source) => source,
       ...options.pictures,
     },
+    emoji: options.emoji ?? {
+      address: () => undefined,
+      read: () => Promise.resolve(undefined),
+    },
     now: () => clock.now,
     log,
   });
````

### Task 5: 8M-8A task 5: a party's popup is its post

Prototype commit: `edc41a158c72df2f416b929179ca1584ad71d41f`

The page draws a party's popup from its post (src/web/client/post-draw.ts,
pure; trees of nodes set as text, never HTML from data): the edge in the
post's color (--accent-<name> of theme.css, light and dark, a rule of
map.css each), headings, small print, bold, italics, strike, inline
code, links only to an address the page allows (checked again), the
application's emoji as Pine's pictures and any other by its name, the
post's and the place's picture beside their parts, and the buttons in
Discord's styles, icons alone with their names for screen readers.
A press is the map's press, off while the member may not press it now
(the list's own actions and Remote); Set time... opens the change form,
Move... the moves panel, Group... the menu of groups for a newcomer,
Manage... the conductor's part, Route the stop list; what the map has
no form for yet (-1, +1, Meet..., Split..., Group... for a member
signed up) shows "Do this on Discord" with the post's link; Screenshot
feedback becomes "Reported from a screenshot · feedback on Discord".
Under the post the member's own part (who they are in it, the group
menu, Change..., Edit route, Edit...) and the map's line (distance from
where the member is, Directions, Open on Discord).

Posts are asked for by their keys as their popups are drawn and kept
(PostViews); until one comes, or for a party without a post shown yet,
the popup is the map's own summary as before. A gym of several raids
lists their heading lines, each opening its post with a way back.
Times in a post are in the reader's own zone and language (postTime),
relative ones kept current; the list's and the markers' times are in
the reader's zone too (the forms keep the server's, which reads them).
A popup is at most 380 pixels wide and scrolls beyond the map's height.

**Files:**

```
 src/domain/web/party-data.ts        |   3 +-
 src/web/client/list-ui.test.ts      |   9 +++
 src/web/client/list-ui.ts           |  19 ++++-
 src/web/client/map.css              | 178 ++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/meetup-forms.test.ts |  18 +++++
 src/web/client/meetup-forms.ts      |  29 ++++++--
 src/web/client/meetup-ui.ts         |   8 ++-
 src/web/client/parties.ts           |  10 +--
 src/web/client/party-layer.ts       | 305 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/web/client/post-draw.test.ts    | 561 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/post-draw.ts         | 603 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/post-time.test.ts    |  41 +++++++++++
 src/web/client/post-time.ts         |  86 +++++++++++++++++++++++
 src/web/client/post-views.test.ts   | 100 ++++++++++++++++++++++++++
 src/web/client/post-views.ts        |  89 +++++++++++++++++++++++
 src/web/client/raid-forms.test.ts   |  16 +++++
 src/web/client/raid-forms.ts        |  27 ++++++-
 src/web/client/raid-marker.ts       |   2 +-
 src/web/client/raid-ui.ts           |   5 +-
 src/web/client/theme.css            |  19 +++++
 src/web/client/train-forms.test.ts  |  10 +++
 src/web/client/train-forms.ts       |   3 +
 src/web/client/train-ui.ts          |  10 ++-
 src/web/post-accents.test.ts        |  26 +++++++
 24 files changed, 2129 insertions(+), 48 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/list-ui.test.ts src/web/client/meetup-forms.test.ts src/web/client/post-draw.test.ts src/web/client/post-time.test.ts src/web/client/post-views.test.ts src/web/client/raid-forms.test.ts src/web/client/train-forms.test.ts src/web/post-accents.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff edc41a158c72df2f416b929179ca1584ad71d41f -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8A task 5: a party's popup is its post`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 8fb194f89d3132d7ea2c614c10c7f4a1a734e107..c21c9b53fcea2755769fb44f00ae8d6c36f1b5a5 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -396,7 +396,8 @@ export interface PostLine {
  * (`--accent-<name>`, light and dark): a raid's egg, hatched and ended, a max battle, a meetup or
  * train, and `other` for a color no renderer gives today.
  */
-export type PostAccent = 'egg' | 'hatched' | 'ended' | 'max' | 'timed' | 'other';
+export const POST_ACCENTS = ['egg', 'hatched', 'ended', 'max', 'timed', 'other'] as const;
+export type PostAccent = (typeof POST_ACCENTS)[number];
 
 /** The panels of the map a post's button opens (`PostControl`). */
 export type PostPanel = 'group' | 'time' | 'moves' | 'manage' | 'route';
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index 8933934cbf124c9f90b3b16e00baceeafe9f28e9..7e2850824e2b75cbc1c9d62a60761bbe0f2c1aa6 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -215,6 +215,15 @@ describe('a line of the list shown with its popup (fix round 2)', () => {
     list.show([LINE]);
     expect(pick()?.value).toBe('');
   });
+
+  it('draws an open line anew when its post came, and nothing for a line that is shut (8A-9)', () => {
+    const { section, list, party } = listed();
+    party.coming = 7;
+    list.redrawLine('some other line');
+    expect(section.words()).toContain('Coming 2');
+    list.redrawLine(LINE.key);
+    expect(section.words()).toContain('Coming 7');
+  });
 });
 
 describe('the focus in the list drawn anew (review fix 2)', () => {
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 7f7d1e96ceff837f14089979e525132c5a2e9c9d..501a890613bcddcc567eca73b7ab219c9c0085d2 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -72,6 +72,23 @@ export class WhatIsOn {
     this.render(true);
   }
 
+  /** The line whose popup is drawn anew in the drawing under way (`redrawLine`). */
+  private fresh: string | undefined;
+
+  /**
+   * A line's party has its post now (review 8A-9): a line shown with its popup draws the popup
+   * anew, with the post, as for a new list; nothing for a line that is shut.
+   */
+  redrawLine(key: string): void {
+    if (!this.expanded.has(key)) return;
+    this.fresh = key;
+    try {
+      this.render();
+    } finally {
+      this.fresh = undefined;
+    }
+  }
+
   /**
    * Draws the list. `anew`: from a new list of parties (`show`); without it (a move of the map, a
    * fix of your location, a change of layers: `ListRefresh`), a line's popup stays as it is.
@@ -182,7 +199,7 @@ export class WhatIsOn {
     });
     if (this.expanded.has(line.key)) {
       const kept = this.kept.get(line.key);
-      if (kept?.firstElementChild && !this.anew) {
+      if (kept?.firstElementChild && !this.anew && this.fresh !== line.key) {
         kept.className = item.className;
         kept.replaceChild(button, kept.firstElementChild);
         return kept;
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 49ad4f51ed6d57ede8bcace4abf28b58c4258aff..442d5fc2268ca8499ee0be14a0453cf0aefbc0e8 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1279,3 +1279,181 @@ path.highlighted {
   margin: 2px 0;
   white-space: pre-line;
 }
+
+/*
+ * A party's post drawn as Discord draws it (plan 8M-8A): the container's edge in the post's
+ * color (`PostAccent`), headings, small print, inline code, emoji the size of the text, the
+ * picture beside the heading and Where, the buttons in Discord's styles (icons alone as on
+ * Discord), then the member's part and the map's line.
+ */
+.leaflet-popup-content-wrapper:has(.post.accent-egg),
+.line-detail:has(.post.accent-egg) {
+  border-left-color: var(--accent-egg);
+}
+
+.leaflet-popup-content-wrapper:has(.post.accent-hatched),
+.line-detail:has(.post.accent-hatched) {
+  border-left-color: var(--accent-hatched);
+}
+
+.leaflet-popup-content-wrapper:has(.post.accent-ended),
+.line-detail:has(.post.accent-ended) {
+  border-left-color: var(--accent-ended);
+}
+
+.leaflet-popup-content-wrapper:has(.post.accent-max),
+.line-detail:has(.post.accent-max) {
+  border-left-color: var(--accent-max);
+}
+
+.leaflet-popup-content-wrapper:has(.post.accent-timed),
+.line-detail:has(.post.accent-timed) {
+  border-left-color: var(--accent-timed);
+}
+
+.leaflet-popup-content-wrapper:has(.post.accent-other),
+.line-detail:has(.post.accent-other) {
+  border-left-color: var(--accent-other);
+}
+
+.post {
+  line-height: 1.375;
+}
+
+.post .post-text {
+  overflow-wrap: anywhere;
+}
+
+.post .post-text::after {
+  content: '';
+  display: block;
+  clear: both;
+}
+
+.post .beside {
+  float: right;
+  width: 80px;
+  height: 80px;
+  margin: 0 0 4px 8px;
+  border-radius: var(--radius);
+  object-fit: contain;
+}
+
+.post .post-heading {
+  margin: 0 0 2px;
+  font-size: 18px;
+  font-weight: 700;
+  line-height: 1.3;
+}
+
+.post .small {
+  font-size: 12px;
+  color: var(--muted);
+}
+
+.post .line:empty {
+  height: 0.6em;
+}
+
+.post .post-line {
+  margin: 8px 0;
+  border: 0;
+  border-top: 1px solid var(--line);
+}
+
+.post code {
+  padding: 0 3px;
+  border-radius: 3px;
+  background: var(--code-bg);
+  font-size: 0.85em;
+}
+
+.post a,
+.post-popup .map-line a,
+.post .screenshot-note {
+  color: var(--link);
+}
+
+.post img.emoji {
+  width: 1.375em;
+  height: 1.375em;
+  vertical-align: -0.3em;
+  object-fit: contain;
+}
+
+.post .post-controls {
+  display: flex;
+  flex-direction: column;
+  gap: 6px;
+  margin-top: 4px;
+}
+
+.post .post-row {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 6px;
+  align-items: center;
+}
+
+.post .press {
+  display: inline-flex;
+  gap: 4px;
+  align-items: center;
+  min-height: 32px;
+}
+
+.post .press.icon {
+  justify-content: center;
+  min-width: 48px;
+  padding: 4px 10px;
+}
+
+.post .press img.emoji {
+  width: 20px;
+  height: 20px;
+  vertical-align: middle;
+}
+
+.post .icon-text {
+  font-size: 18px;
+  line-height: 1;
+}
+
+.post .on-discord {
+  margin-top: 6px;
+}
+
+.post-popup .mine-part {
+  display: flex;
+  flex-direction: column;
+  gap: 6px;
+  align-items: flex-start;
+  margin-top: 8px;
+  padding-top: 8px;
+  border-top: 1px solid var(--line);
+}
+
+.post-popup .mine-part .mine {
+  margin: 0;
+}
+
+.post-popup .map-line {
+  margin-top: 8px;
+  color: var(--muted);
+  font-size: 13px;
+}
+
+.post-popup .map-line .directions,
+.post-popup .map-line .post-link {
+  display: inline;
+  margin: 0;
+}
+
+.post-popup .press.back {
+  margin-top: 8px;
+}
+
+.post-popup section.route ol {
+  margin: 4px 0;
+  padding-left: 20px;
+}
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
index 84542f4041e54182e9f8ce8646f1a90e3e58a4be..030bbb8dbe24d33dc6b2035649fb3c5af8a1827b 100644
--- a/src/web/client/meetup-forms.test.ts
+++ b/src/web/client/meetup-forms.test.ts
@@ -152,6 +152,18 @@ describe('the places a meetup may be picked at on the map', () => {
   });
 });
 
+describe('the zone the new meetup form reads its start in (review N4)', () => {
+  it('is named for a reader in another zone', () => {
+    const zones = { zone: 'America/New_York', reader: 'Asia/Kolkata' };
+    expect(texts(newMeetupForm(REGIONS, gymPick(GYM), {}, false, false, zones))).toContain(
+      "Clock times are read in the server's zone (Eastern).",
+    );
+    expect(texts(newMeetupForm(REGIONS, gymPick(GYM)))).not.toContain(
+      "Clock times are read in the server's zone (Eastern).",
+    );
+  });
+});
+
 describe('the form of a new meetup', () => {
   it('asks the name, the region (the place’s by default), the place, the start and the information', () => {
     const form = newMeetupForm(REGIONS, gymPick(GYM));
@@ -251,6 +263,12 @@ describe('the editor of a meetup', () => {
     expect(meetupActions({ ...MEETUP, panel: null })).toEqual([]);
   });
 
+  it('names the server’s zone after its times for a reader in another (8A-11)', () => {
+    const editor = meetupEditor(MEETUP, ZONE, NOW, {}, 'America/Los_Angeles');
+    expect(texts(editor)).toContain('Starts now: 6:00 PM (Eastern)');
+    expect(texts(meetupEditor(MEETUP, ZONE, NOW, {}, ZONE))).toContain('Starts now: 6:00 PM');
+  });
+
   it('shows its name and information to change, its times as they are, each with a Set', () => {
     const editor = meetupEditor(MEETUP, ZONE, NOW);
     expect(texts(editor)).toEqual([
diff --git a/src/web/client/meetup-forms.ts b/src/web/client/meetup-forms.ts
index 1025580ff41bf16b413e7d23805ae7882dc1e970..384180fc6e6495de62dc38cd571c3d26c0e3141f 100644
--- a/src/web/client/meetup-forms.ts
+++ b/src/web/client/meetup-forms.ts
@@ -1,5 +1,6 @@
 import type { LatLon } from '@pine/wayspot-core/lat-lon';
 import { clockTime } from '../../domain/web/clock.js';
+import { zoneNote } from './post-time.js';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import {
   MEETUP_CHANGES,
@@ -10,6 +11,7 @@ import {
 import type { MapMeetup } from '../../domain/web/party-data.js';
 import { pressParty, type PressSteps, type Pressed } from './parties.js';
 import type { MapGym, PageNode } from './popup.js';
+import { zoneHintNodes, type FormZones } from './raid-forms.js';
 import { regionsAt, spawnPoint, type PointRegion } from './spawn-forms.js';
 
 /**
@@ -167,6 +169,7 @@ export function newMeetupForm(
   filled: Partial<NewMeetupValues> = {},
   picking = false,
   regionChosen = false,
+  zones?: FormZones,
 ): PageNode {
   const chosen = regionChosen && filled.region !== undefined && filled.region !== '';
   const ofPlace = place?.regionIds[0];
@@ -225,6 +228,7 @@ export function newMeetupForm(
         'Starts',
         textInput('start', START_LENGTH, '6:30pm or 10-18 11am (month-day)', filled.start),
       ),
+      ...(zones === undefined ? [] : zoneHintNodes(zones.zone, zones.reader)),
       labelled('Information', infoArea(filled.info)),
       {
         tag: 'div',
@@ -367,12 +371,24 @@ export function editorAfter(
   return { meetup, filled: { ...rest, [change]: { text: sent.text, drawn } } };
 }
 
-/** A time as the editor says it now: `Now: 6:00 PM`, or that there is none. */
-function nowLine(words: string, at: number | null, zone: string, now: number): PageNode {
+/**
+ * A time as the editor says it now: `Now: 6:00 PM`, or that there is none; in the server's zone,
+ * which reads what is typed, named where the reader is in another (`zoneNote`, review 8A-11).
+ */
+function nowLine(
+  words: string,
+  at: number | null,
+  zone: string,
+  now: number,
+  reader: string,
+): PageNode {
   return {
     tag: 'div',
     className: 'hint',
-    text: at === null ? `${words}: none` : `${words}: ${clockTime(at, zone, now)}`,
+    text:
+      at === null
+        ? `${words}: none`
+        : `${words}: ${clockTime(at, zone, now)}${zoneNote(zone, reader)}`,
   };
 }
 
@@ -388,12 +404,13 @@ export function meetupEditor(
   zone: string,
   now: number,
   filled: MeetupEditorFilled = {},
+  reader: string = zone,
 ): PageNode {
   const set = (change: MeetupChange): PageNode => button('Set', { 'data-change': change });
   const shown = (change: MeetupChange): string => filled[change]?.text ?? shownOf(meetup, change);
   const start: PageNode[] = meetup.panel?.start
     ? [
-        nowLine('Starts now', meetup.startTime, zone, now),
+        nowLine('Starts now', meetup.startTime, zone, now, reader),
         labelled(
           'Starts',
           textInput('start', TIME_LENGTH, '6:15pm, 10-17 6:15pm or in 30', shown('start')),
@@ -401,7 +418,7 @@ export function meetupEditor(
         ),
       ]
     : [
-        nowLine('Starts', meetup.startTime, zone, now),
+        nowLine('Starts', meetup.startTime, zone, now, reader),
         { tag: 'p', className: 'hint', text: 'Sign up for it to change when it starts.' },
       ];
   return {
@@ -414,7 +431,7 @@ export function meetupEditor(
       labelled('Name', textInput('name', NAME_LENGTH, 'Its name', shown('name')), set('name')),
       labelled('Information', infoArea(shown('info')), set('info')),
       ...start,
-      nowLine('Ends now', meetup.endTime, zone, now),
+      nowLine('Ends now', meetup.endTime, zone, now, reader),
       labelled(
         'Ends',
         textInput('end', TIME_LENGTH, '8pm, in 90, or none', shown('end')),
diff --git a/src/web/client/meetup-ui.ts b/src/web/client/meetup-ui.ts
index 1293ab75b153318c74b63ce2e782d430fbb51b06..9edaf5510dfa506cd5f60bfd42087fe03303178e 100644
--- a/src/web/client/meetup-ui.ts
+++ b/src/web/client/meetup-ui.ts
@@ -26,6 +26,7 @@ import {
   type PickedPlace,
 } from './meetup-forms.js';
 import type { Me } from './notice.js';
+import { readerZone } from './post-time.js';
 import { renderNode, type MapGym } from './popup.js';
 import type { FormClaim, FormHold } from './raid-forms.js';
 import { fieldsOf, sayUnder } from './raid-ui.js';
@@ -209,7 +210,10 @@ export function meetupUi(deps: MeetupUiDeps) {
     const filled: Partial<NewMeetupValues> =
       before instanceof HTMLElement && before.dataset.form === 'meetup' ? fieldsOf(before) : {};
     const form = renderNode(
-      newMeetupForm(regionList(), making.place, filled, picking.picking, making.regionChosen),
+      newMeetupForm(regionList(), making.place, filled, picking.picking, making.regionChosen, {
+        zone: deps.zone(),
+        reader: readerZone(),
+      }),
       document,
     );
     form.addEventListener('click', (event) => {
@@ -306,7 +310,7 @@ export function meetupUi(deps: MeetupUiDeps) {
   const drawEditing = (): void => {
     if (!editing) return;
     const editor = renderNode(
-      meetupEditor(editing.meetup, deps.zone(), Date.now(), editing.filled),
+      meetupEditor(editing.meetup, deps.zone(), Date.now(), editing.filled, readerZone()),
       document,
     );
     editor.addEventListener('click', (event) => {
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 49fe3453e31214ab846ff0c70da23e3e26e321b2..dd34088d4b3cc2c67d7caf6123b546cd88a8cbd1 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -14,12 +14,12 @@ import { addressLine, directionsLink, type MapGym, type PageNode } from './popup
 /**
  * The parties on the live map (plan 8M-3, spec 3.2 to 3.4), the parts the page shows and does
  * that need no Leaflet: popups of raids and trains and the meetups' items as trees of nodes
- * (`renderNode` sets every text as text), countdowns, times in the posts' zone, a press of a
+ * (`renderNode` sets every text as text), countdowns, times in the reader's zone (plan 8M-8A), a press of a
  * button with its CSRF token, and the poller that asks for the list every 20 seconds while
  * the page is visible.
  */
 
-/** What a popup needs besides its party: the time, the posts' zone, the gyms. */
+/** What a popup needs besides its party: the time, the zone times are shown in (the reader's, plan 8M-8A), the gyms. */
 export interface ShowContext {
   now: number;
   zone: string;
@@ -39,7 +39,7 @@ export function countdown(until: number, now: number): string {
   return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
 }
 
-/** `2:30 PM` in the posts' zone (the server words its answers' times the same way). */
+/** `2:30 PM` in the zone given: the reader's on the map (plan 8M-8A), the posts' in the server's words. */
 export { clockTime };
 
 const PRESS_LABELS: Readonly<Record<MapPress['action'], string>> = {
@@ -72,7 +72,7 @@ const PRESS_STYLES: Readonly<Record<MapPress['action'], string>> = {
   leave: 'danger',
 };
 
-const STATUS_WORDS: Readonly<Record<MapStatus, string>> = {
+export const STATUS_WORDS: Readonly<Record<MapStatus, string>> = {
   interested: 'Interested',
   coming: 'Coming',
   present: 'Here',
@@ -153,7 +153,7 @@ function attendanceNodes(partyId: string, attendance: MapAttendance): PageNode[]
  * Interested, Join and Here send what it shows (`data-group-pick`: the page reads it at the
  * press), none for "any group with room".
  */
-function groupPick(attendance: MapAttendance): PageNode[] {
+export function groupPick(attendance: MapAttendance): PageNode[] {
   const { pick } = attendance;
   if (pick === undefined || pick.length === 0) return [];
   return [
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 426d9852f9453eee119d0df43214d0754126ac92..ae565672e19e1144c3422c2c65aef2b295a12ad0 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -20,9 +20,9 @@ import {
   type ShowContext,
 } from './parties.js';
 import { renderNode, type MapGym, type PageNode } from './popup.js';
-import { FormHold, keepClicksInPopup, OpenPopup, reportBox, reportOffered } from './raid-forms.js';
+import { FormHold, keepClicksInPopup, OpenPopup, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
-import { spawnBox, spawnPoint } from './spawn-forms.js';
+import { spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
 import {
   drawnTrains,
@@ -50,6 +50,26 @@ import { WhatIsOn } from './list-ui.js';
 import { STREET_ZOOM, type LatLon, type ViewStorage } from './view.js';
 import { ListRefresh, listLines, paneShows } from './what-is-on.js';
 import { placeListNode, sharedPlace, startWords, type PlacedThing } from './shared-place.js';
+import type {
+  MapMeetup,
+  MapParty,
+  MapRaid,
+  MapTrain,
+  PostView,
+} from '../../domain/web/party-data.js';
+import {
+  ALL_RAIDS_HERE,
+  gymWithRaidBoxes,
+  postPopup,
+  raidChoices,
+  type PanelsOpen,
+  type PlacedContext,
+} from './post-draw.js';
+import { postTime, readerZone } from './post-time.js';
+import { prefetchOrder, PostViews } from './post-views.js';
+import { stopName } from './train-forms.js';
+import { stopPlace } from './parties.js';
+import type { Place } from './distance.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -66,6 +86,11 @@ import { placeListNode, sharedPlace, startWords, type PlacedThing } from './shar
 
 const EVERY_MS = 20_000;
 const COUNTDOWN_MS = 15_000;
+/**
+ * The posts a list asks for ahead (review 8A-3): those in view first, at most these, well within
+ * the post route's 120 a minute (`POSTS_PER_MINUTE`) at a list every 20 seconds.
+ */
+export const PREFETCH_POSTS = 20;
 /**
  * The pane of the rings of meetups and trains: above Leaflet's markers (600), below its tooltips
  * (650).
@@ -332,20 +357,160 @@ export function showParties(
 
   const context = (): ShowContext => ({
     now: Date.now(),
-    zone: view?.zone ?? 'UTC',
+    zone: readerZone(),
     gym: (id) => (id === null ? undefined : gyms.get(id)),
   });
 
+  /**
+   * The parties' posts the page has (plan 8M-8A): asked for by their keys as their popups are
+   * drawn; one that comes draws the popup that shows its party anew (not under a form).
+   */
+  const postViews = new PostViews({
+    load: async (id, key) => {
+      const answer = await fetch(
+        `/s/${guild}/api/parties/${encodeURIComponent(id)}/post?k=${encodeURIComponent(key)}`,
+        { credentials: 'same-origin' },
+      );
+      return answer.ok ? ((await answer.json()) as PostView) : undefined;
+    },
+    loaded: (id) => {
+      if (hold.editing) return;
+      const raid = view?.raids.find((one) => one.id === id);
+      const showsIt = (key: string | undefined): boolean =>
+        key === `train:${id}` ||
+        key === `route:${id}` ||
+        key === `meetup:${id}` ||
+        (raid !== undefined && key === `gym:${String(raid.gymId)}`);
+      const shown = showing.popup;
+      if (showsIt(showing.key) && shown) {
+        // Drawn anew where it stands: the map does not pan for the post (review 8A-3).
+        const { autoPan } = shown.options;
+        shown.options.autoPan = false;
+        shown.update();
+        shown.options.autoPan = autoPan;
+      }
+      // A line of the list shown with its popup draws it anew (review 8A-9).
+      for (const kind of ['raid', 'train', 'meetup']) whatIsOn.redrawLine(`${kind}:${id}`);
+    },
+  });
+
+  /** Where a party is on the map, for its popup's line (distance, Directions). */
+  const placeOf = (party: MapParty): Place | undefined => {
+    switch (party.kind) {
+      case 'raid':
+        return (
+          (party.gymId === null ? undefined : gyms.get(party.gymId)) ?? party.place ?? undefined
+        );
+      case 'max':
+        return party.place;
+      case 'train':
+        return party.stop === null ? undefined : stopPlace(party, party.route[party.stop], gyms);
+      case 'meetup': {
+        const { place } = party;
+        if (!place) return undefined;
+        return (place.gymId === null ? undefined : gyms.get(place.gymId)) ?? place;
+      }
+    }
+  };
+
+  /** What a post's popup needs of the map for this party. */
+  const placedFor = (party: MapParty): PlacedContext => ({
+    now: Date.now(),
+    origin: location.origin,
+    guild,
+    ...(panelsOpen.has(party.id) ? { opened: panelsOpen.get(party.id) } : {}),
+    stopName: (key) =>
+      stopName(gyms.get(Number(key)), key, party.kind === 'train' ? party.spots : []),
+    place: placeOf(party),
+    located: frame.located(),
+    units: frame.units,
+  });
+
+  /**
+   * A party's popup (plan 8M-8A): its post as Discord shows it, with the member's part and the
+   * map's line, once the page has the post; until then (or for a party whose post was not shown
+   * yet) the map's own summary as before (`fallback`).
+   */
+  const partyPopup = (
+    party: MapRaid | MapTrain | MapMeetup,
+    fallback: () => PageNode,
+    extras: readonly PageNode[] = [],
+  ): PageNode => {
+    const shown = postViews.of(party);
+    return shown ? postPopup(shown, party, placedFor(party), extras) : fallback();
+  };
+
+  /**
+   * The parties a popup's key shows (`gym:<id>`, `train:<id>`, `route:<id>`, `meetup:<id>`), whose
+   * posts are asked for ahead when the pointer comes over it or presses it (review 8A-3).
+   */
+  const partiesOf = (key: string): MapParty[] => {
+    const [kind, id] = key.split(':');
+    if (kind === 'gym') return view?.raids.filter((raid) => String(raid.gymId) === id) ?? [];
+    if (kind === 'train' || kind === 'route')
+      return view?.trains.filter((one) => one.id === id) ?? [];
+    if (kind === 'meetup') return view?.meetups.filter((one) => one.id === id) ?? [];
+    return [];
+  };
+  const prefetchKey = (key: string): void => {
+    const shown = partiesOf(key);
+    postViews.prefetch(shown, shown.length);
+  };
+
+  /** Which raid's post a gym of several raids shows, by gym; none: the list of them. */
+  const chosenRaid = new Map<number, string>();
+  /** Whether the next list drawn is the page's first (review N6). */
+  let firstList = true;
+  /** What is open under each party's post, by party (review 8A-10), kept across redraws. */
+  const panelsOpen = new Map<string, PanelsOpen>();
+
+  /**
+   * A gym's raids' popup: the one raid's post, or with several the list of their heading lines,
+   * each opening its post with a way back to the list (ruling 14); then `extras`.
+   */
+  const gymPopup = (
+    gymId: number,
+    raids: readonly MapRaid[],
+    extras: readonly PageNode[],
+  ): PageNode => {
+    const several = raids.length > 1;
+    const chosen = several ? raids.find((raid) => raid.id === chosenRaid.get(gymId)) : raids[0];
+    if (!chosen) {
+      const now = Date.now();
+      return raidChoices(
+        gyms.get(gymId)?.name ?? 'Unknown gym',
+        raids.map((raid) => ({
+          id: raid.id,
+          picture: raid.picture,
+          heading: raid.heading,
+          time: raidBadge(raid, now, readerZone()),
+        })),
+        extras,
+      );
+    }
+    return partyPopup(
+      chosen,
+      () =>
+        gymRaidsPopup(gymId, [chosen], context(), [
+          ...(several ? [ALL_RAIDS_HERE] : []),
+          ...extras,
+        ]),
+      [...(several ? [ALL_RAIDS_HERE] : []), ...extras],
+    );
+  };
+
   const press = async (button: HTMLButtonElement): Promise<void> => {
     const { party, action } = button.dataset;
     if (party === undefined || action === undefined) return;
     // The group a newcomer chose in the popup (plan 8X-1B), with Interested, Join and Here;
-    // empty for any group with room. A button of its own group (drawn before) names it.
-    const picked =
-      button.parentElement?.querySelector<HTMLSelectElement>('select[data-group-pick]');
+    // empty for any group with room. A button of its own group (drawn before) names it. In a
+    // post (plan 8M-8A) the menu is in the member's part under its buttons: the whole popup is
+    // the scope, and its buttons are off while the press is on its way.
+    const scope = button.closest('.post-popup') ?? button.parentElement;
+    const picked = scope?.querySelector<HTMLSelectElement>('select[data-group-pick]');
     const asks = action === 'interested' || action === 'join' || action === 'here';
     const group = button.dataset.group ?? (asks && picked?.value ? picked.value : undefined);
-    const buttons = button.parentElement?.querySelectorAll('button') ?? [];
+    const buttons = [...(scope?.querySelectorAll('button') ?? [])].filter((each) => !each.disabled);
     for (const each of buttons) each.disabled = true;
     const pressed = await pressParty(csrf, {
       post: async (token) => {
@@ -371,6 +536,17 @@ export function showParties(
 
   const draw: Draw = (node) => {
     const element = renderNode(node, document);
+    // A place's or post's picture that does not load is left out, not drawn broken (review
+    // 8A-15). (`error` does not bubble: caught on the way down.)
+    element.addEventListener(
+      'error',
+      (event) => {
+        if (event.target instanceof HTMLImageElement && event.target.classList.contains('beside')) {
+          event.target.hidden = true;
+        }
+      },
+      true,
+    );
     element.addEventListener('click', (event) => {
       // A button, or what is drawn in it (the list of things at one place: a picture, words).
       const target = event.target instanceof Element ? event.target.closest('button') : null;
@@ -402,18 +578,73 @@ export function showParties(
         if (train) trainForms.actionClicked(target, train);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
-      }
+      } else postButton(target);
     });
     return element;
   };
 
+  /**
+   * The map's side of a post's buttons (plan 8M-8A): one the map has no form for yet shows the
+   * post's link under the buttons ("Do this on Discord →"); Group… for a newcomer goes to the
+   * menu of groups; Manage… and Route show their part under the post; a raid's line in the list
+   * of a gym's raids opens its post in the popup, and "All raids here" goes back to the list.
+   */
+  const postButton = (target: HTMLButtonElement): void => {
+    const popup = target.closest<HTMLElement>('.party-popup');
+    const partyId = target.closest<HTMLElement>('.post-popup')?.querySelector<HTMLElement>('.post')
+      ?.dataset.post;
+    // What is open under the post is kept by party across redraws (review 8A-10).
+    const open = (change: PanelsOpen): void => {
+      if (partyId !== undefined) panelsOpen.set(partyId, { ...panelsOpen.get(partyId), ...change });
+    };
+    const { onDiscord, focusPick, toggle, showRaid } = target.dataset;
+    if (onDiscord !== undefined) {
+      const line = target.closest('.post')?.querySelector<HTMLElement>('.on-discord');
+      if (line) {
+        line.hidden = false;
+        // Why not (reviews 8A-12, N1) in the place of the link, or the link to the post; the
+        // button pressed is kept, worded again at each draw (review N3).
+        const words = target.dataset.why ?? '';
+        const why = line.querySelector<HTMLElement>('.why');
+        const link = line.querySelector<HTMLElement>('.to-post');
+        if (why) why.textContent = words;
+        if (link) link.hidden = words !== '';
+        (words === '' ? link : why)?.focus();
+      }
+      open({ discord: onDiscord });
+    } else if (focusPick !== undefined) {
+      popup?.querySelector<HTMLSelectElement>('select[data-group-pick]')?.focus();
+    } else if (toggle === 'manage' || toggle === 'route') {
+      const part = popup?.querySelector<HTMLElement>(`section.${toggle}`);
+      if (part) {
+        part.hidden = !part.hidden;
+        open({ [toggle]: !part.hidden });
+      }
+    } else if (showRaid !== undefined) {
+      const gymKey = showing.key;
+      const gymId = gymKey?.startsWith('gym:') ? Number(gymKey.slice(4)) : undefined;
+      if (gymId === undefined) return;
+      if (showRaid === '') chosenRaid.delete(gymId);
+      else chosenRaid.set(gymId, showRaid);
+      showing.popup?.update();
+    }
+  };
+
   /**
    * Binds a popup to a layer under a key that names it across redraws (`gym:<id>`,
    * `train:<id>`, `route:<id>`), remembering it while it is open; its content is held while a
-   * form is open in it.
+   * form is open in it. A post (plan 8M-8A) is as wide as Discord's on a phone at most, and no
+   * taller than the map leaves room for: it scrolls beyond (Leaflet's `maxHeight`).
    */
   const withPopup = <T extends L.Layer>(target: T, key: string, popup: () => PageNode): T => {
-    target.bindPopup(hold.content(() => draw(popup())));
+    target.bindPopup(
+      hold.content(() => draw(popup())),
+      {
+        minWidth: 280,
+        maxWidth: 380,
+        maxHeight: Math.max(260, map.getSize().y - 140),
+      },
+    );
     target.on('popupopen', () => {
       showing.openedAs(key);
     });
@@ -421,6 +652,11 @@ export function showParties(
       showing.closedAs(key);
     });
     popups.set(key, target);
+    // Its posts asked for ahead as the pointer comes over it or presses it (review 8A-3). No
+    // `contextmenu`: a layer that listens for it takes it from the map (the spawn form).
+    target.on('mouseover mousedown', () => {
+      prefetchKey(key);
+    });
     return target;
   };
 
@@ -493,7 +729,7 @@ export function showParties(
       const center = map.getCenter();
       return frame.located() ?? { lat: center.lat, lon: center.lng };
     },
-    zone: () => view?.zone ?? 'UTC',
+    zone: () => readerZone(),
     open: (line) => {
       const layer = line.marker === null ? undefined : popups.get(line.marker);
       if (!layer || !line.point || !registry.isOn(line.kind)) return false;
@@ -508,6 +744,8 @@ export function showParties(
     },
     highlight: (line, on) => {
       elementOf(line.marker)?.classList.toggle('highlighted', on);
+      // Its post asked for ahead, so that it opens drawn (review 8A-3).
+      if (on && line.marker !== null) prefetchKey(line.marker);
     },
     detail: (line) => {
       // As the side panel showed it before (plan 8M-3 to 8M-6): its popup, with its actions.
@@ -515,13 +753,14 @@ export function showParties(
       let node: PageNode | undefined;
       if (line.kind === 'raids') {
         const raid = view?.raids.find((one) => one.id === line.id);
-        if (raid) node = raidPopup(raid, ctx);
+        if (raid) node = partyPopup(raid, () => raidPopup(raid, ctx));
       } else if (line.kind === 'trains') {
         const train = view?.trains.find((one) => one.id === line.id);
-        if (train) node = trainPopup(train, ctx, trainActions(train));
+        if (train) node = partyPopup(train, () => trainPopup(train, ctx, trainActions(train)));
       } else if (line.kind === 'meetups') {
         const meetup = view?.meetups.find((one) => one.id === line.id);
-        if (meetup) node = meetupPopup(meetup, ctx, meetupActions(meetup));
+        if (meetup)
+          node = partyPopup(meetup, () => meetupPopup(meetup, ctx, meetupActions(meetup)));
       }
       if (!node) return undefined;
       const element = draw(node);
@@ -582,15 +821,14 @@ export function showParties(
       // One lead raid draws the marker, every fact of it (fix round 1).
       const lead = leadRaid(raids);
       if (!gym || !lead) continue;
-      const extras = reportOffered(mayReport, next)
-        ? [reportBox(gymId), spawnBox(gymId), meetupHereBox(gymId)]
-        : [];
+      // No "Report raid" where the gym shows its raid (review 8A-2): the popup offers the raid.
+      const extras = reportOffered(mayReport, next) ? gymWithRaidBoxes(gymId) : [];
       const key = `gym:${gymId}`;
       const marker: L.Marker = raidsMarker(
         gym,
-        raidIcon(renderNode(raidMarkerNode(lead, now, next.zone, size), document), circle),
+        raidIcon(renderNode(raidMarkerNode(lead, now, readerZone(), size), document), circle),
         lead.heading,
-        (made) => withPopup(made, key, () => gymRaidsPopup(gymId, raids, context(), extras)),
+        (made) => withPopup(made, key, () => gymPopup(gymId, raids, extras)),
         () => gymClicked(gym),
         () => {
           openAt(key, marker);
@@ -604,7 +842,7 @@ export function showParties(
         lon: gym.lon,
         picture: lead.picture,
         name: lead.heading + (raids.length > 1 ? ` (and ${raids.length - 1} more)` : ''),
-        time: raidBadge(lead, now, next.zone),
+        time: raidBadge(lead, now, readerZone()),
       });
     }
     // The train being routed is left to route mode, which draws its stops as they are edited.
@@ -632,7 +870,7 @@ export function showParties(
           pane: RING_PANE,
         }),
         key,
-        () => meetupPopup(meetup, context(), meetupActions(meetup)),
+        () => partyPopup(meetup, () => meetupPopup(meetup, context(), meetupActions(meetup))),
       ).addTo(groups.meetups);
       sharedClicks(ring, key);
       placed.push({
@@ -643,13 +881,14 @@ export function showParties(
         lon: at.lon,
         picture: null,
         name: meetup.name,
-        time: startWords(meetup.startTime, now, next.zone),
+        time: startWords(meetup.startTime, now, readerZone()),
       });
     }
     for (const train of drawn.trains) {
       // Through its gyms and the power spots its data gives (plan 8X-4).
       const { line, ring } = trainPlaces(train, gyms);
-      const popup = () => trainPopup(train, context(), trainActions(train));
+      const popup = () =>
+        partyPopup(train, () => trainPopup(train, context(), trainActions(train)));
       if (line.length > 1) {
         withPopup(
           L.polyline(
@@ -696,7 +935,7 @@ export function showParties(
           lon: ring.at.lon,
           picture: null,
           name: train.name,
-          time: startWords(train.startTime, now, next.zone),
+          time: startWords(train.startTime, now, readerZone()),
         });
       }
     }
@@ -711,6 +950,17 @@ export function showParties(
     // The list of what is on (plan 8M-7): every party the layers on show, across the server;
     // trains and raids the map cannot draw, and meetups without a place, keep their line.
     whatIsOn.show(listLines(next, gyms));
+    // The posts of the parties in view, then (after the page's first list, review N6) the rest,
+    // asked for ahead, at most `PREFETCH_POSTS` a list (review 8A-3), so that a popup that opens
+    // has its post.
+    const bounds = map.getBounds();
+    const all: MapParty[] = [...next.raids, ...next.trains, ...next.meetups];
+    const inView = (party: MapParty): boolean => {
+      const at = placeOf(party);
+      return at !== undefined && bounds.contains([at.lat, at.lon]);
+    };
+    postViews.prefetch(prefetchOrder(all, inView, firstList), PREFETCH_POSTS);
+    firstList = false;
     panel.hidden = false;
     map.invalidateSize();
     const line = readOnlyLine(next.readOnly);
@@ -810,6 +1060,7 @@ export function showParties(
       },
     },
     regions,
+    zone: () => view?.zone ?? 'UTC',
     gyms,
     hold,
     tools,
@@ -995,9 +1246,13 @@ export function showParties(
     for (const element of document.querySelectorAll<HTMLElement>('[data-until]')) {
       element.textContent = countdown(Number(element.dataset.until), now);
     }
+    // A post's relative times (plan 8M-8A), as Discord keeps them current.
+    for (const element of document.querySelectorAll<HTMLElement>('time[data-relative]')) {
+      element.textContent = postTime(Number(element.dataset.at), 'R', now);
+    }
     // The raids' badges and their last minutes (plan 8M-7), between two lists, by the rules they
     // were drawn by (`markerNow`).
-    const zone = view?.zone ?? 'UTC';
+    const zone = readerZone();
     for (const marker of document.querySelectorAll<HTMLElement>('.raid-marker[data-stage]')) {
       const shown = markerNow(marker.dataset, now, zone);
       const badge = marker.querySelector('.badge');
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0ad1a6e0494d3c763ac42866f68e4c704d3a8bac
--- /dev/null
+++ b/src/web/client/post-draw.test.ts
@@ -0,0 +1,561 @@
+import { describe, expect, it } from 'vitest';
+import type {
+  MapAttendance,
+  MapRaid,
+  MapTrain,
+  PostButtonView,
+  PostView,
+} from '../../domain/web/party-data.js';
+import type { PageNode } from './popup.js';
+import {
+  gymWithRaidBoxes,
+  mapLine,
+  postCard,
+  postPopup,
+  raidChoices,
+  safeHref,
+  type PostDrawContext,
+} from './post-draw.js';
+
+/** Tuesday 13 October 2026, 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const MINUTE = 60_000;
+const GUILD = '412345678901234567';
+const LINK = `https://discord.com/channels/${GUILD}/700000000000000001`;
+const ORIGIN = 'https://map.example.test';
+const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';
+
+const context: PostDrawContext = {
+  now: NOW,
+  origin: ORIGIN,
+  guild: GUILD,
+  time: { locale: 'en-US', timeZone: 'America/Los_Angeles' },
+  stopName: (key) => `Gym ${key}`,
+};
+
+const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
+  groups: [{ id: 'A', interested: 0, coming: 1, present: 0 }],
+  going: 1,
+  mine: null,
+  actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+  remote: { offered: true, on: false },
+  ...more,
+});
+
+const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
+  kind: 'raid',
+  postKey: 'k',
+  id: 'r1',
+  gymId: 1,
+  picture: null,
+  tier: 'Level 5 raid',
+  tierGroup: '5',
+  heading: 'Level 5 raid (egg)',
+  boss: null,
+  stage: 'egg',
+  hatchTime: NOW + 30 * MINUTE,
+  endTime: NOW + 75 * MINUTE,
+  link: LINK,
+  place: null,
+  mayChange: false,
+  attendance: attendance(),
+  ...more,
+});
+
+const button = (more: Partial<PostButtonView> & Pick<PostButtonView, 'does'>): PostButtonView => ({
+  style: 'secondary',
+  disabled: false,
+  name: 'Button',
+  ...more,
+});
+
+/** A raid's post as the server sends it: heading, times, Where with its Map, a line of controls. */
+const VIEW: PostView = {
+  key: 'k',
+  accent: 'egg',
+  blocks: [
+    {
+      type: 'text',
+      role: 'head',
+      lines: [
+        { style: 'heading', nodes: [{ kind: 'text', text: 'Level 5 raid (egg)' }] },
+        {
+          style: 'plain',
+          nodes: [
+            { kind: 'text', text: 'Hatches ' },
+            { kind: 'time', at: NOW + 30 * MINUTE, style: 'R' },
+            { kind: 'text', text: ', at ' },
+            { kind: 'time', at: NOW + 30 * MINUTE, style: 't' },
+          ],
+        },
+      ],
+      beside: { kind: 'picture', src: '/eggs/egg-5.png?v=1' },
+    },
+    { type: 'separator' },
+    {
+      type: 'text',
+      role: 'where',
+      lines: [
+        {
+          style: 'plain',
+          nodes: [{ kind: 'strong', children: [{ kind: 'text', text: 'Where' }] }],
+        },
+        {
+          style: 'plain',
+          nodes: [
+            { kind: 'strong', children: [{ kind: 'text', text: 'Library' }] },
+            { kind: 'text', text: ' · ' },
+            { kind: 'link', href: MAPS, children: [{ kind: 'text', text: 'Map' }] },
+          ],
+        },
+      ],
+    },
+    {
+      type: 'text',
+      role: 'trainers',
+      lines: [
+        {
+          style: 'plain',
+          nodes: [
+            { kind: 'emoji', name: 'pinejoin', src: '/emoji/111111111111111111.png' },
+            { kind: 'text', text: ' Coming (1): Ash ' },
+            { kind: 'emoji', name: 'mystic' },
+          ],
+        },
+        { style: 'small', nodes: [{ kind: 'text', text: 'No meeting time yet.' }] },
+      ],
+    },
+    {
+      type: 'controls',
+      rows: [
+        [
+          button({
+            name: 'Coming',
+            style: 'primary',
+            emoji: { name: 'pinejoin', src: '/emoji/1.png' },
+            does: { kind: 'press', action: 'join' },
+          }),
+          button({
+            name: 'Leave',
+            style: 'danger',
+            emoji: { name: '👋' },
+            does: { kind: 'press', action: 'leave' },
+          }),
+          button({
+            name: 'Remote',
+            emoji: { name: '📡' },
+            does: { kind: 'press', action: 'remote' },
+          }),
+        ],
+        [
+          button({ name: '+1', emoji: { name: '⬆️' }, does: { kind: 'discord' } }),
+          button({ name: 'Set time…', label: 'Set time…', does: { kind: 'panel', panel: 'time' } }),
+          button({ name: 'Group…', label: 'Group…', does: { kind: 'panel', panel: 'group' } }),
+          button({
+            name: 'Screenshot feedback',
+            label: 'Screenshot feedback',
+            does: { kind: 'screenshot' },
+          }),
+        ],
+      ],
+    },
+  ],
+};
+
+/** Every node of a tree, depth first. */
+function all(node: PageNode): PageNode[] {
+  return [node, ...(node.children ?? []).flatMap(all)];
+}
+
+/** What a reader sees of a tree: its texts and its pictures' words, in order. */
+function seen(node: PageNode): string {
+  if (node.tag === 'img') return node.attributes?.alt ?? '';
+  return (node.text ?? '') + (node.children ?? []).map(seen).join('');
+}
+
+const byClass = (node: PageNode, name: string) =>
+  all(node).filter((one) => (one.className ?? '').split(' ').includes(name));
+const buttonsOf = (node: PageNode) => all(node).filter((one) => one.tag === 'button');
+
+describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
+  it('draws its edge, heading, lines and picture, nothing from data as HTML', () => {
+    const card = postCard(VIEW, raid(), context);
+    expect(card.className).toBe('post accent-egg');
+    const head = byClass(card, 'role-head')[0];
+    expect(head && all(head).find((one) => one.tag === 'h3')?.children?.[0]?.text).toBe(
+      'Level 5 raid (egg)',
+    );
+    expect(head && seen(head)).toBe('Level 5 raid (egg)Hatches in 30 minutes, at 11:30 AM');
+    expect(
+      all(card).find((one) => one.tag === 'img' && one.className === 'beside')?.attributes,
+    ).toMatchObject({ src: '/eggs/egg-5.png?v=1' });
+    const times = all(card).filter((one) => one.tag === 'time');
+    expect(times.map((one) => one.attributes)).toEqual([
+      {
+        datetime: new Date(NOW + 30 * MINUTE).toISOString(),
+        'data-at': String(NOW + 30 * MINUTE),
+        'data-relative': '',
+      },
+      { datetime: new Date(NOW + 30 * MINUTE).toISOString(), 'data-at': String(NOW + 30 * MINUTE) },
+    ]);
+    expect(byClass(card, 'small').map(seen)).toEqual(['No meeting time yet.']);
+    expect(all(card).some((one) => one.tag === 'hr')).toBe(true);
+  });
+
+  it('links only an address it may, in a tab of its own', () => {
+    const card = postCard(VIEW, raid(), context);
+    expect(all(card).find((one) => one.tag === 'a' && one.text === undefined)?.attributes).toEqual({
+      href: MAPS,
+      target: '_blank',
+      rel: 'noopener noreferrer',
+    });
+    expect(safeHref('javascript:alert(1)', ORIGIN, GUILD)).toBeUndefined();
+    expect(safeHref('https://evil.example/x', ORIGIN, GUILD)).toBeUndefined();
+    expect(safeHref(`${ORIGIN}/s/${GUILD}/map`, ORIGIN, GUILD)).toBe(`${ORIGIN}/s/${GUILD}/map`);
+    expect(safeHref(LINK, ORIGIN, GUILD)).toBe(LINK);
+  });
+
+  it('draws an emoji Pine serves as its picture, any other by its name', () => {
+    const trainers = byClass(postCard(VIEW, raid(), context), 'role-trainers')[0];
+    const pictures = trainers ? all(trainers).filter((one) => one.tag === 'img') : [];
+    expect(pictures.map((one) => one.attributes)).toEqual([
+      {
+        src: '/emoji/111111111111111111.png',
+        alt: ':pinejoin:',
+        title: 'pinejoin',
+        draggable: 'false',
+      },
+    ]);
+    expect(trainers && seen(trainers)).toBe(
+      ':pinejoin: Coming (1): Ash :mystic:No meeting time yet.',
+    );
+  });
+
+  it('presses what the member may press, as the post’s buttons, named for a screen reader', () => {
+    const buttons = buttonsOf(postCard(VIEW, raid(), context));
+    const coming = buttons.find((one) => one.attributes?.['aria-label'] === 'Coming');
+    expect(coming?.className).toBe('press primary icon');
+    expect(coming?.attributes).toMatchObject({
+      'data-party': 'r1',
+      'data-action': 'join',
+      title: 'Coming',
+    });
+    expect(coming?.attributes).not.toHaveProperty('disabled');
+    // Leave: not signed up, as the map's own list of what applies says.
+    expect(
+      buttons.find((one) => one.attributes?.['aria-label'] === 'Leave')?.attributes,
+    ).toHaveProperty('disabled');
+    expect(
+      buttons.find((one) => one.attributes?.['aria-label'] === 'Remote')?.attributes,
+    ).toMatchObject({ 'data-action': 'remote' });
+  });
+
+  it('opens the map’s panel where it has one, else says to do it on Discord', () => {
+    const plain = buttonsOf(postCard(VIEW, raid(), context));
+    expect(plain.find((one) => one.text === 'Set time…')?.attributes).toHaveProperty(
+      'data-on-discord',
+    );
+    expect(plain.find((one) => one.text === 'Group…')?.attributes).toHaveProperty(
+      'data-on-discord',
+    );
+    expect(plain.find((one) => one.attributes?.['aria-label'] === '+1')?.attributes).toHaveProperty(
+      'data-on-discord',
+    );
+    const mayChange = raid({
+      mayChange: true,
+      attendance: attendance({
+        pick: [
+          { group: 'A', label: 'Group A' },
+          { group: 'B', label: 'Group B' },
+        ],
+      }),
+    });
+    const shown = buttonsOf(postCard(VIEW, mayChange, context));
+    expect(shown.find((one) => one.text === 'Set time…')?.attributes).toMatchObject({
+      'data-change-raid': 'r1',
+    });
+    expect(shown.find((one) => one.text === 'Group…')?.attributes).toMatchObject({
+      'data-focus-pick': '',
+    });
+    const discord = byClass(postCard(VIEW, raid(), context), 'on-discord')[0];
+    expect(discord?.attributes).toMatchObject({ hidden: '' });
+    expect(discord && all(discord).find((one) => one.tag === 'a')?.attributes?.href).toBe(LINK);
+    expect(discord && seen(discord)).toBe('Do this on Discord →');
+  });
+
+  it('says the raid was reported from a screenshot, its feedback on Discord', () => {
+    const note = byClass(postCard(VIEW, raid(), context), 'screenshot-note')[0];
+    expect(note && seen(note)).toBe('Reported from a screenshot · feedback on Discord →');
+    expect(note?.attributes?.href).toBe(LINK);
+  });
+
+  it('turns nothing on while the map is read-only', () => {
+    const readOnly = raid({
+      attendance: attendance({ actions: [], remote: { offered: false, on: false } }),
+    });
+    const presses = buttonsOf(postCard(VIEW, readOnly, context)).filter(
+      (one) => one.attributes?.['data-action'],
+    );
+    expect(presses.every((one) => one.attributes?.disabled === '')).toBe(true);
+  });
+});
+
+describe('postPopup: the post, the member’s own part and the map’s line', () => {
+  it('adds who the member is in it, the group to pick, and how to get there', () => {
+    const member = raid({
+      mayChange: true,
+      attendance: attendance({
+        mine: { status: 'coming', group: 'B' },
+        groups: [
+          { id: 'A', interested: 0, coming: 1, present: 0 },
+          { id: 'B', interested: 0, coming: 1, present: 0 },
+        ],
+        remote: { offered: true, on: true },
+      }),
+    });
+    const popup = postPopup(VIEW, member, {
+      ...context,
+      place: { lat: 40.05, lon: -80.05 },
+      located: { lat: 40.06, lon: -80.05 },
+      units: 'imperial',
+    });
+    expect(byClass(popup, 'mine').map(seen)).toEqual(['You: Coming, group B · remote']);
+    expect(buttonsOf(popup).find((one) => one.text === 'Change…')?.attributes).toMatchObject({
+      'data-change-raid': 'r1',
+    });
+    const line = byClass(popup, 'map-line')[0];
+    expect(line && seen(line)).toBe('0.7 mi · Directions · Open on Discord');
+  });
+
+  it('keeps a train’s conductor and route on the map, the route shown by Route', () => {
+    const train: MapTrain = {
+      kind: 'train',
+      postKey: 'k',
+      id: 't1',
+      name: 'Loop',
+      trainKind: 'raid',
+      trainKindWords: 'Raid Train',
+      startTime: null,
+      route: ['1', '2', '3', '4'],
+      spots: [],
+      stop: 1,
+      link: LINK,
+      attendance: attendance({ mine: { status: 'coming', group: 'A' } }),
+      may: { arrange: true, clear: false, load: false, kind: true },
+      panel: { place: '2', moves: [{ move: 'next', target: '3' }], reverse: null, atEnd: 'finish' },
+      conductor: { who: null, mayTake: true, mayDrop: false },
+      moveRefusal: null,
+    };
+    const view: PostView = {
+      key: 'k',
+      accent: 'timed',
+      blocks: [
+        {
+          type: 'controls',
+          rows: [
+            [
+              button({ name: 'Move…', label: 'Move…', does: { kind: 'panel', panel: 'moves' } }),
+              button({
+                name: 'Manage…',
+                label: 'Manage…',
+                does: { kind: 'panel', panel: 'manage' },
+              }),
+              button({ name: 'Route', label: 'Route', does: { kind: 'panel', panel: 'route' } }),
+              button({ name: 'Split…', label: 'Split…', does: { kind: 'discord' } }),
+            ],
+          ],
+        },
+      ],
+    };
+    const popup = postPopup(view, train, {
+      ...context,
+      place: undefined,
+      located: undefined,
+      units: 'imperial',
+    });
+    const buttons = buttonsOf(popup);
+    expect(buttons.find((one) => one.text === 'Move…')?.attributes).toMatchObject({
+      'data-move-train': 't1',
+    });
+    expect(buttons.find((one) => one.text === 'Manage…')?.attributes).toMatchObject({
+      'data-toggle': 'manage',
+    });
+    expect(buttons.find((one) => one.text === 'Route')?.attributes).toMatchObject({
+      'data-toggle': 'route',
+    });
+    const manage = byClass(popup, 'manage')[0];
+    expect(manage?.attributes).toMatchObject({ hidden: '' });
+    expect(manage && buttonsOf(manage).map((one) => one.text)).toEqual(['Be the conductor']);
+    expect(manage && seen(manage)).toContain('What the train is mainly for: on Discord →');
+    const route = byClass(popup, 'route')[0];
+    expect(
+      route &&
+        all(route)
+          .filter((one) => one.tag === 'li')
+          .map(seen),
+    ).toEqual(['Gym 1', 'Gym 2 (the train is here)', 'Gym 3', 'Gym 4']);
+    expect(buttons.find((one) => one.text === 'Edit route')?.attributes).toMatchObject({
+      'data-route-train': 't1',
+    });
+  });
+});
+
+describe('the review’s fixes (8M-8A fix round 1)', () => {
+  const train = (more: Partial<MapTrain> = {}): MapTrain => ({
+    kind: 'train',
+    postKey: 'k',
+    id: 't1',
+    name: 'Loop',
+    trainKind: 'raid',
+    trainKindWords: 'Raid Train',
+    startTime: null,
+    route: ['1', '2'],
+    spots: [],
+    stop: 0,
+    link: LINK,
+    attendance: attendance(),
+    may: { arrange: false, clear: false, load: false, kind: false },
+    panel: null,
+    conductor: { who: 'other', mayTake: false, mayDrop: false },
+    moveRefusal: 'not-conductor',
+    ...more,
+  });
+  const trainView: PostView = {
+    key: 'k',
+    accent: 'timed',
+    blocks: [
+      {
+        type: 'controls',
+        rows: [
+          [
+            button({ name: 'Move…', label: 'Move…', does: { kind: 'panel', panel: 'moves' } }),
+            button({ name: 'Manage…', label: 'Manage…', does: { kind: 'panel', panel: 'manage' } }),
+          ],
+        ],
+      },
+    ],
+  };
+
+  it('draws __underline__ as underlined (8A-14)', () => {
+    const view: PostView = {
+      key: 'k',
+      accent: 'egg',
+      blocks: [
+        {
+          type: 'text',
+          lines: [
+            {
+              style: 'plain',
+              nodes: [{ kind: 'underline', children: [{ kind: 'text', text: 'here' }] }],
+            },
+          ],
+        },
+      ],
+    };
+    expect(all(postCard(view, raid(), context)).some((one) => one.tag === 'u')).toBe(true);
+  });
+
+  /** What a button says when pressed: which button, and its words. */
+  const pressed = (party: MapTrain, label: string) =>
+    buttonsOf(postCard(trainView, party, context)).find((one) => one.text === label)?.attributes;
+
+  it('words why the member may not use Move… and Manage…, as the server says it (8A-12, N1)', () => {
+    expect(pressed(train(), 'Move…')).toMatchObject({
+      'data-on-discord': 'moves',
+      'data-why': 'Only the conductor or staff can move the train.',
+    });
+    expect(pressed(train(), 'Manage…')).toMatchObject({
+      'data-on-discord': 'manage',
+      'data-why': 'Only the conductor or staff can manage the train.',
+    });
+    const unled = train({
+      conductor: { who: null, mayTake: false, mayDrop: false },
+      moveRefusal: 'not-attending',
+    });
+    expect(pressed(unled, 'Move…')?.['data-why']).toBe('Sign up for the train to move it.');
+    // The conductor of a train with no route yet: not a matter of who they are.
+    const routeless = train({
+      route: [],
+      stop: null,
+      conductor: { who: 'you', mayTake: false, mayDrop: true },
+      moveRefusal: 'no-route',
+    });
+    expect(pressed(routeless, 'Move…')?.['data-why']).toBe(
+      'The train has no route yet: add a stop first.',
+    );
+    const readOnly = train({ moveRefusal: 'read-only' });
+    expect(pressed(readOnly, 'Move…')?.['data-why']).toBe(
+      'Discord cannot be reached just now, so nothing can be changed.',
+    );
+  });
+
+  it('keeps Manage…, Route and the line to Discord open across a redraw, worded anew (8A-10, N3)', () => {
+    const popupOf = (party: MapTrain) =>
+      postPopup(trainView, party, {
+        ...context,
+        place: undefined,
+        located: undefined,
+        units: 'imperial',
+        opened: { manage: true, route: true, discord: 'moves' },
+      });
+    const popup = popupOf(
+      train({
+        may: { arrange: true, clear: false, load: false, kind: true },
+        moveRefusal: 'not-attending',
+      }),
+    );
+    expect(byClass(popup, 'manage')[0]?.attributes).not.toHaveProperty('hidden');
+    expect(byClass(popup, 'route')[0]?.attributes).not.toHaveProperty('hidden');
+    const discord = byClass(popup, 'on-discord')[0];
+    expect(discord?.attributes).not.toHaveProperty('hidden');
+    expect(discord && seen(discord)).toContain('Sign up for the train to move it.');
+    // The train changed meanwhile (a conductor now): the line says what holds now.
+    const now = byClass(popupOf(train()), 'on-discord')[0];
+    expect(now && seen(now)).toContain('Only the conductor or staff can move the train.');
+  });
+
+  it('links only this server’s posts on Discord and Google Maps itself (8A-13)', () => {
+    expect(
+      safeHref('https://discord.com/channels/999999999999999999/1', ORIGIN, GUILD),
+    ).toBeUndefined();
+    expect(safeHref('https://www.google.com/mapsx/evil', ORIGIN, GUILD)).toBeUndefined();
+    expect(safeHref(MAPS, ORIGIN, GUILD)).toBe(MAPS);
+  });
+
+  it('offers no Report raid at a gym that shows its raid, only a spawn and a meetup (8A-2)', () => {
+    const boxes = gymWithRaidBoxes(4);
+    expect(
+      boxes
+        .flatMap((box) => all(box))
+        .filter((one) => one.tag === 'button')
+        .map((one) => one.text),
+    ).toEqual(['Report spawn here', 'Meetup here']);
+  });
+});
+
+describe('mapLine', () => {
+  it('says the distance only from where the member is', () => {
+    const line = mapLine({ lat: 40.05, lon: -80.05 }, LINK, undefined, 'metric');
+    expect(seen(line)).toBe('Directions · Open on Discord');
+    expect(all(line).find((one) => one.text === 'Directions')?.attributes?.href).toBe(
+      'https://www.google.com/maps/dir/?api=1&destination=40.05,-80.05',
+    );
+    expect(seen(mapLine(undefined, LINK, undefined, 'metric'))).toBe('Open on Discord');
+  });
+});
+
+describe('raidChoices', () => {
+  it('lists each raid at a gym by its heading, each opening its own post', () => {
+    const list = raidChoices('Library', [
+      { id: 'r1', picture: '/eggs/egg-5.png', heading: 'Level 5 raid (egg)', time: 'hatches 2:40' },
+      { id: 'r2', picture: 'javascript:x', heading: 'Elite raid (egg)', time: 'egg' },
+    ]);
+    expect(seen(list)).toBe('LibraryLevel 5 raid (egg)hatches 2:40Elite raid (egg)egg');
+    expect(buttonsOf(list).map((one) => one.attributes?.['data-show-raid'])).toEqual(['r1', 'r2']);
+    expect(
+      all(list)
+        .filter((one) => one.tag === 'img')
+        .map((one) => one.attributes?.src),
+    ).toEqual(['/eggs/egg-5.png']);
+  });
+});
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8e56c0050d6cdbc6cd149964c61bd338fdb225fd
--- /dev/null
+++ b/src/web/client/post-draw.ts
@@ -0,0 +1,603 @@
+import type {
+  MapParty,
+  PostButtonView,
+  PostLine,
+  PostNode,
+  PostView,
+  PostViewBlock,
+} from '../../domain/web/party-data.js';
+import { distanceWords, metersBetween, type DistanceUnits, type Place } from './distance.js';
+import { meetupActions, meetupHereBox } from './meetup-forms.js';
+import { groupPick, STATUS_WORDS } from './parties.js';
+import { directionsLink, type PageNode } from './popup.js';
+import { postTime, type TimeShown } from './post-time.js';
+import { spawnBox } from './spawn-forms.js';
+
+/**
+ * A party's post drawn on the live map (plan 8M-8A): the post view the server made of the layout
+ * its post was last shown with, drawn as Discord draws a components-v2 container (its edge in the
+ * post's color, headings, small print, the buttons in Discord's styles), as trees of nodes set
+ * as text (`renderNode`): never HTML from data. Under it the map's own: the member's part (who
+ * they are in it, the group to pick, what the map lets them do beyond the post's buttons) and the
+ * map's line (distance, Directions, Open on Discord). Pure.
+ */
+
+/** What drawing a post needs besides the post and its party. */
+export interface PostDrawContext {
+  now: number;
+  /** Pine's own origin (`location.origin`): a link to its pages stays a link. */
+  origin: string;
+  /** The server's snowflake: a link on Discord only to its own posts. */
+  guild: string;
+  /** Where times are shown; the page leaves it to the reader's language and zone. */
+  time?: TimeShown;
+  /** A stop of a train's route by its key, as the map names it (`stopName`). */
+  stopName(key: string): string;
+  /**
+   * What the member opened under this party's post, kept across redraws (review 8A-10): Manage…'s
+   * and Route's parts, and the line to Discord.
+   */
+  opened?: PanelsOpen;
+}
+
+/** What is open under a party's post (`PostDrawContext.opened`). */
+export interface PanelsOpen {
+  manage?: boolean;
+  route?: boolean;
+  /**
+   * The line to Discord, by the button pressed (`moves`, `manage`, or `''` for another), worded
+   * again at each draw (`whyNot`, review N3).
+   */
+  discord?: string;
+}
+
+/** The map's part of a popup: where the party is and where the member is. */
+export interface PlacedContext extends PostDrawContext {
+  /** Where the party is (a gym, a stop, a spot, a meetup's place); undefined where unknown. */
+  place: Place | undefined;
+  /** Where the member is, once the browser said. */
+  located: Place | undefined;
+  units: DistanceUnits;
+}
+
+const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;
+
+/**
+ * An address the page may link, checked again after the server and as strictly
+ * (`linkableOnTheMap`, review 8A-13): Google Maps, this server's posts on Discord, Pine's own
+ * pages (its origin as the page has it), by https without a user, password or port; undefined
+ * for anything else.
+ */
+export function safeHref(href: string, origin: string, guild: string): string | undefined {
+  let url: URL;
+  try {
+    url = new URL(href);
+  } catch {
+    return undefined;
+  }
+  if (url.username !== '' || url.password !== '') return undefined;
+  if (url.origin === origin) return url.href;
+  if (url.protocol !== 'https:' || url.port !== '') return undefined;
+  if (url.hostname === 'www.google.com' && /^\/maps(?:\/|$)/u.test(url.pathname)) return url.href;
+  if (url.hostname === 'discord.com' && url.pathname.startsWith(`/channels/${guild}/`)) {
+    return url.href;
+  }
+  return undefined;
+}
+
+/** A picture's address the page may show: Pine's own (a path) or one by https; else undefined. */
+export function safeSrc(src: string): string | undefined {
+  if (src.startsWith('/') && !src.startsWith('//')) return src;
+  return src.startsWith('https://') ? src : undefined;
+}
+
+/** The nodes of a line of a post. */
+function textNodes(nodes: readonly PostNode[], context: PostDrawContext): PageNode[] {
+  return nodes.map((node): PageNode => {
+    switch (node.kind) {
+      case 'text':
+        return { tag: 'span', text: node.text };
+      case 'strong':
+        return { tag: 'strong', children: textNodes(node.children, context) };
+      case 'em':
+        return { tag: 'em', children: textNodes(node.children, context) };
+      case 'underline':
+        return { tag: 'u', children: textNodes(node.children, context) };
+      case 'strike':
+        return { tag: 's', children: textNodes(node.children, context) };
+      case 'code':
+        return { tag: 'code', text: node.text };
+      case 'link': {
+        const href = safeHref(node.href, context.origin, context.guild);
+        const children = textNodes(node.children, context);
+        return href === undefined
+          ? { tag: 'span', children }
+          : { tag: 'a', attributes: { href, ...NEW_TAB }, children };
+      }
+      case 'emoji': {
+        const src = node.src === undefined ? undefined : safeSrc(node.src);
+        return src === undefined
+          ? { tag: 'span', text: `:${node.name}:` }
+          : {
+              tag: 'img',
+              className: 'emoji',
+              attributes: { src, alt: `:${node.name}:`, title: node.name, draggable: 'false' },
+            };
+      }
+      case 'time':
+        return {
+          tag: 'time',
+          text: postTime(node.at, node.style, context.now, context.time),
+          attributes: {
+            datetime: new Date(node.at).toISOString(),
+            'data-at': String(node.at),
+            ...(node.style === 'R' ? { 'data-relative': '' } : {}),
+          },
+        };
+    }
+  });
+}
+
+const LINE_CLASSES: Readonly<Record<PostLine['style'], [string, string]>> = {
+  heading: ['h3', 'post-heading'],
+  small: ['div', 'small'],
+  plain: ['div', 'line'],
+};
+
+function lineNode(line: PostLine, context: PostDrawContext): PageNode {
+  const [tag, className] = LINE_CLASSES[line.style];
+  return { tag, className, children: textNodes(line.nodes, context) };
+}
+
+/** Whether a member may press this press now, as the map's list of what applies says. */
+function pressable(party: MapParty, action: string): boolean {
+  const { attendance } = party;
+  return action === 'remote'
+    ? attendance.remote.offered
+    : attendance.actions.some((press) => press.action === action);
+}
+
+/** What a panel of the map is on this party for this member: its attributes, else Discord. */
+function panelAttributes(
+  party: MapParty,
+  panel: 'group' | 'time' | 'moves' | 'manage' | 'route',
+): Record<string, string> | undefined {
+  switch (panel) {
+    case 'group':
+      return party.attendance.pick !== undefined && party.attendance.pick.length > 0
+        ? { 'data-focus-pick': '' }
+        : undefined;
+    case 'time':
+      return party.kind === 'raid' && party.mayChange
+        ? { 'data-change-raid': party.id }
+        : undefined;
+    case 'moves':
+      return party.kind === 'train' && party.panel !== null
+        ? { 'data-move-train': party.id }
+        : undefined;
+    case 'manage':
+      return party.kind === 'train' && manageable(party) ? { 'data-toggle': 'manage' } : undefined;
+    case 'route':
+      return party.kind === 'train' ? { 'data-toggle': 'route' } : undefined;
+  }
+}
+
+/** Whether a train's Manage… has anything on the map for the member: its conductor, its kind. */
+function manageable(train: Extract<MapParty, { kind: 'train' }>): boolean {
+  const { conductor } = train;
+  return conductor.who === 'you' || conductor.mayTake || conductor.mayDrop || train.may.kind;
+}
+
+/**
+ * What the line under the buttons says where the map has no panel of a button for the member
+ * (reviews 8A-12, N1): for a train's Move… and Manage…, why they may not, as the server decided it
+ * (`MapTrain.moveRefusal`: the commands' `mayNotMove`, no route, read-only), only worded here;
+ * else nothing, and the line sends the member to the post ("Do this on Discord"). `button` is
+ * which button was pressed (`moves`, `manage`, or another's `''`), worded anew at each draw from
+ * the party as it is then (review N3).
+ */
+export function whyNot(party: MapParty, button: string): string {
+  if (party.kind !== 'train' || (button !== 'moves' && button !== 'manage')) return '';
+  const doing = button === 'moves' ? 'move' : 'manage';
+  switch (party.moveRefusal) {
+    case 'not-conductor':
+      return `Only the conductor or staff can ${doing} the train.`;
+    case 'not-attending':
+      return `Sign up for the train to ${doing} it.`;
+    case 'no-route':
+      // Manage… (the kind) needs no route: Discord's dialog has it.
+      return button === 'moves' ? 'The train has no route yet: add a stop first.' : '';
+    case 'read-only':
+      return 'Discord cannot be reached just now, so nothing can be changed.';
+    case null:
+      return '';
+  }
+}
+
+const ON_DISCORD = { 'data-on-discord': '', 'data-why': '' };
+
+/**
+ * A button of a post as Discord draws it (its style, its icon, its label), named for a reader and
+ * a screen reader (`aria-label`, `title`), and what it does on the map: a press (off while the
+ * member may not press it now), one of the map's panels, "Do this on Discord" (`data-on-discord`,
+ * which shows the post's link), or the screenshot's note in its place.
+ */
+function controlNode(button: PostButtonView, party: MapParty, context: PostDrawContext): PageNode {
+  const { does } = button;
+  if (does.kind === 'screenshot') {
+    const href = safeHref(party.link, context.origin, context.guild);
+    return {
+      tag: 'a',
+      className: 'screenshot-note',
+      text: 'Reported from a screenshot · feedback on Discord →',
+      attributes: href === undefined ? {} : { href, ...NEW_TAB },
+    };
+  }
+  let doing: Record<string, string> = ON_DISCORD;
+  let on = !button.disabled;
+  if (does.kind === 'press') {
+    doing = { 'data-party': party.id, 'data-action': does.action };
+    on &&= pressable(party, does.action);
+  } else if (does.kind === 'panel') {
+    doing = panelAttributes(party, does.panel) ?? {
+      'data-on-discord': does.panel,
+      'data-why': whyNot(party, does.panel),
+    };
+  } else if (does.kind === 'none') {
+    doing = {};
+    on = false;
+  }
+  const src = button.emoji?.src === undefined ? undefined : safeSrc(button.emoji.src);
+  const icon: PageNode[] =
+    button.emoji === undefined
+      ? []
+      : src === undefined
+        ? [{ tag: 'span', className: 'icon-text', text: button.emoji.name }]
+        : [{ tag: 'img', className: 'emoji', attributes: { src, alt: '', draggable: 'false' } }];
+  const label = button.label;
+  return {
+    tag: 'button',
+    className: `press ${button.style}${label === undefined ? ' icon' : ''}`,
+    ...(icon.length === 0 && label !== undefined
+      ? { text: label }
+      : { children: [...icon, ...(label === undefined ? [] : [{ tag: 'span', text: label }])] }),
+    attributes: {
+      type: 'button',
+      title: button.name,
+      'aria-label': button.name,
+      ...doing,
+      ...(on ? {} : { disabled: '' }),
+    },
+  };
+}
+
+function blockNode(block: PostViewBlock, party: MapParty, context: PostDrawContext): PageNode {
+  switch (block.type) {
+    case 'separator':
+      return { tag: 'hr', className: 'post-line' };
+    case 'controls':
+      return {
+        tag: 'div',
+        className: 'post-controls',
+        children: block.rows.map((row) => ({
+          tag: 'div',
+          className: 'post-row',
+          children: row.map((button) => controlNode(button, party, context)),
+        })),
+      };
+    case 'text': {
+      const src = block.beside?.kind === 'picture' ? safeSrc(block.beside.src) : undefined;
+      return {
+        tag: 'div',
+        className: block.role === undefined ? 'post-text' : `post-text role-${block.role}`,
+        children: [
+          ...(src === undefined
+            ? []
+            : [{ tag: 'img', className: 'beside', attributes: { src, alt: '' } }]),
+          ...block.lines.map((line) => lineNode(line, context)),
+        ],
+      };
+    }
+  }
+}
+
+/**
+ * The post as Discord draws it: its edge (`accent-<name>`, a value of `theme.css`), its parts in
+ * order, and under its buttons the line "Do this on Discord →" (the post's link), hidden until a
+ * button the map has no form for is pressed.
+ */
+export function postCard(view: PostView, party: MapParty, context: PostDrawContext): PageNode {
+  const href = safeHref(party.link, context.origin, context.guild);
+  // Open across redraws (review 8A-10), by the button pressed, worded anew from the party as it
+  // is now (review N3); why not, where the server said (reviews 8A-12, N1), in the place of the
+  // link.
+  const pressed = context.opened?.discord;
+  const why = pressed === undefined ? undefined : whyNot(party, pressed);
+  return {
+    tag: 'div',
+    className: `post accent-${view.accent}`,
+    attributes: { 'data-post': party.id },
+    children: [
+      ...view.blocks.map((block) => blockNode(block, party, context)),
+      {
+        tag: 'div',
+        className: 'on-discord',
+        attributes: why === undefined ? { hidden: '' } : {},
+        children: [
+          { tag: 'span', className: 'why', text: why ?? '' },
+          ...(href === undefined
+            ? []
+            : [
+                {
+                  tag: 'a',
+                  className: 'to-post',
+                  text: 'Do this on Discord →',
+                  attributes: { href, ...NEW_TAB, ...(why ? { hidden: '' } : {}) },
+                },
+              ]),
+        ],
+      },
+    ],
+  };
+}
+
+const button = (text: string, attributes: Record<string, string>): PageNode => ({
+  tag: 'button',
+  className: 'press',
+  text,
+  attributes: { type: 'button', ...attributes },
+});
+
+/** A train's part for the member: Edit route, and what Manage… and Route show on the map. */
+function trainPart(
+  train: Extract<MapParty, { kind: 'train' }>,
+  context: PostDrawContext,
+): PageNode[] {
+  const { conductor } = train;
+  const who =
+    conductor.who === 'you'
+      ? 'You are its conductor.'
+      : conductor.who === 'other'
+        ? 'It has a conductor.'
+        : 'It has no conductor.';
+  const manage: PageNode = {
+    tag: 'section',
+    className: 'manage',
+    attributes: context.opened?.manage ? {} : { hidden: '' },
+    children: [
+      { tag: 'div', className: 'conductor', text: who },
+      {
+        tag: 'div',
+        className: 'train-actions',
+        children: [
+          ...(conductor.mayTake
+            ? [button('Be the conductor', { 'data-conductor': 'take', 'data-train': train.id })]
+            : []),
+          ...(conductor.mayDrop
+            ? [
+                button(
+                  conductor.who === 'you' ? 'Stop being the conductor' : 'Take the conductor off',
+                  { 'data-conductor': 'give-up', 'data-train': train.id },
+                ),
+              ]
+            : []),
+        ],
+      },
+      ...(train.may.kind
+        ? [onDiscord('What the train is mainly for: on Discord →', train, context)]
+        : []),
+    ],
+  };
+  const route: PageNode = {
+    tag: 'section',
+    className: 'route',
+    attributes: context.opened?.route ? {} : { hidden: '' },
+    children: [
+      {
+        tag: 'ol',
+        children: train.route.map((key, index) => ({
+          tag: 'li',
+          text: `${context.stopName(key)}${index === train.stop ? ' (the train is here)' : ''}`,
+        })),
+      },
+    ],
+  };
+  return [
+    ...(train.may.arrange
+      ? [
+          {
+            tag: 'div',
+            className: 'train-actions',
+            children: [button('Edit route', { 'data-route-train': train.id })],
+          },
+        ]
+      : []),
+    manage,
+    route,
+  ];
+}
+
+/** A line that sends the member to the post on Discord. */
+function onDiscord(text: string, party: MapParty, context: PostDrawContext): PageNode {
+  const href = safeHref(party.link, context.origin, context.guild);
+  return {
+    tag: 'div',
+    className: 'to-discord',
+    children: [
+      href === undefined
+        ? { tag: 'span', text }
+        : { tag: 'a', text, attributes: { href, ...NEW_TAB } },
+    ],
+  };
+}
+
+/**
+ * The member's own part under the post (the map's, as before plan 8M-8A, in the post's look):
+ * who they are in it (`You: Coming, group B · remote`), the group a newcomer picks (Interested,
+ * Join and Here send it), and what the map lets them do beyond the post's buttons: a raid's
+ * Change… (its boss and moves are slash commands on Discord), a train's Edit route and what its
+ * Manage… and Route show, a meetup's Edit….
+ */
+function minePart(party: MapParty, context: PostDrawContext): PageNode[] {
+  const { mine, groups, remote } = party.attendance;
+  const several = groups.length > 1;
+  const you =
+    mine === null
+      ? []
+      : [
+          {
+            tag: 'div',
+            className: 'mine',
+            text: `You: ${STATUS_WORDS[mine.status]}${several && mine.status !== 'complete' ? `, group ${mine.group}` : ''}${remote.on ? ' · remote' : ''}`,
+          },
+        ];
+  const own: PageNode[] =
+    party.kind === 'raid'
+      ? party.mayChange
+        ? [
+            button('Change…', {
+              'data-change-raid': party.id,
+              title: 'Change its boss, moves or times',
+            }),
+          ]
+        : []
+      : party.kind === 'train'
+        ? trainPart(party, context)
+        : party.kind === 'meetup'
+          ? meetupActions(party)
+          : [];
+  const pick = groupPick(party.attendance);
+  const parts = [...you, ...pick, ...own];
+  return parts.length === 0 ? [] : [{ tag: 'div', className: 'mine-part', children: parts }];
+}
+
+/**
+ * The map's line under a post: how far it is (from where the member is, once the browser said;
+ * `distanceWords` in the server's units), Directions (Google Maps, a route to the place), and
+ * Open on Discord (the post).
+ */
+export function mapLine(
+  place: Place | undefined,
+  link: string,
+  located: Place | undefined,
+  units: DistanceUnits,
+): PageNode {
+  const parts: PageNode[] = [
+    ...(place !== undefined && located !== undefined
+      ? [
+          {
+            tag: 'span',
+            className: 'distance',
+            text: distanceWords(metersBetween(located, place), units),
+          },
+        ]
+      : []),
+    ...(place === undefined ? [] : [directionsLink(place)]),
+    ...(link.startsWith('https://discord.com/channels/')
+      ? [
+          {
+            tag: 'a',
+            className: 'post-link',
+            text: 'Open on Discord',
+            attributes: { href: link, ...NEW_TAB },
+          },
+        ]
+      : []),
+  ];
+  return {
+    tag: 'div',
+    className: 'map-line',
+    children: parts.flatMap((part, index) =>
+      index === 0 ? [part] : [{ tag: 'span', className: 'sep', text: ' · ' }, part],
+    ),
+  };
+}
+
+/** A raid among several at one gym, as the list of them names it. */
+export interface RaidChoice {
+  id: string;
+  picture: string | null;
+  heading: string;
+  time: string;
+}
+
+/**
+ * The popup of a gym with several raids (plan 8M-8A, ruling 14): the gym's name, then each raid's
+ * heading line (its picture, its post's heading words, its time), each opening that raid's post
+ * in the popup (`data-show-raid`), never the posts stacked; then `extras`.
+ */
+export function raidChoices(
+  gymName: string,
+  raids: readonly RaidChoice[],
+  extras: readonly PageNode[] = [],
+): PageNode {
+  return {
+    tag: 'div',
+    className: 'party-popup raid-choices',
+    children: [
+      {
+        tag: 'div',
+        className: 'place-list',
+        children: [
+          { tag: 'strong', className: 'name', text: gymName },
+          {
+            tag: 'div',
+            className: 'choices',
+            children: raids.map((raid): PageNode => {
+              const src = raid.picture === null ? undefined : safeSrc(raid.picture);
+              return {
+                tag: 'button',
+                className: 'place-choice',
+                attributes: { type: 'button', 'data-show-raid': raid.id },
+                children: [
+                  src === undefined
+                    ? { tag: 'span', className: 'picture none' }
+                    : { tag: 'img', className: 'picture', attributes: { src, alt: '' } },
+                  { tag: 'span', className: 'what', text: raid.heading },
+                  { tag: 'span', className: 'when', text: raid.time },
+                ],
+              };
+            }),
+          },
+        ],
+      },
+      ...extras,
+    ],
+  };
+}
+
+/**
+ * What a gym that shows its raid offers under it (review 8A-2): "Report spawn here" and "Meetup
+ * here", no "Report raid" (the popup offers the raid; reporting one where one stands opens it
+ * anyway: `reportClosesForm`).
+ */
+export function gymWithRaidBoxes(gymId: number): PageNode[] {
+  return [spawnBox(gymId), meetupHereBox(gymId)];
+}
+
+/** Back from a raid's post to the list of the raids at its gym. */
+export const ALL_RAIDS_HERE: PageNode = {
+  tag: 'button',
+  className: 'press back',
+  text: '← All raids here',
+  attributes: { type: 'button', 'data-show-raid': '' },
+};
+
+/** A party's popup on the map: its post, the member's own part, the map's line, then `extras`. */
+export function postPopup(
+  view: PostView,
+  party: MapParty,
+  context: PlacedContext,
+  extras: readonly PageNode[] = [],
+): PageNode {
+  return {
+    tag: 'div',
+    className: `party-popup post-popup ${party.kind}`,
+    children: [
+      postCard(view, party, context),
+      ...minePart(party, context),
+      mapLine(context.place, party.link, context.located, context.units),
+      ...extras,
+    ],
+  };
+}
diff --git a/src/web/client/post-time.test.ts b/src/web/client/post-time.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a4481984da4c3f9e197b2ca21a901f70d99922c3
--- /dev/null
+++ b/src/web/client/post-time.test.ts
@@ -0,0 +1,41 @@
+import { describe, expect, it } from 'vitest';
+import { postTime, zoneNote } from './post-time.js';
+
+/** Tuesday 13 October 2026, 14:30 in New York. */
+const AT = Date.UTC(2026, 9, 13, 18, 30);
+const MINUTE = 60_000;
+const NEW_YORK = { locale: 'en-US', timeZone: 'America/New_York' };
+
+describe('postTime: a post’s time as Discord shows it, in the reader’s zone (plan 8M-8A)', () => {
+  it('writes each of Discord’s styles', () => {
+    const shown = (style: Parameters<typeof postTime>[1]) => postTime(AT, style, AT, NEW_YORK);
+    expect(shown('t')).toBe('2:30 PM');
+    expect(shown('T')).toBe('2:30:00 PM');
+    expect(shown('d')).toBe('10/13/2026');
+    expect(shown('D')).toBe('October 13, 2026');
+    expect(shown('f')).toBe('October 13, 2026 at 2:30 PM');
+    expect(shown('F')).toBe('Tuesday, October 13, 2026 at 2:30 PM');
+  });
+
+  it('writes the time in the reader’s own zone, not the server’s', () => {
+    expect(postTime(AT, 't', AT, { locale: 'en-US', timeZone: 'America/Los_Angeles' })).toBe(
+      '11:30 AM',
+    );
+    expect(postTime(AT, 't', AT, { locale: 'en-GB', timeZone: 'Europe/London' })).toBe('19:30');
+  });
+
+  it('names the server’s zone in a form only where the reader is elsewhere (8A-11)', () => {
+    expect(zoneNote('America/New_York', 'America/New_York')).toBe('');
+    expect(zoneNote('America/New_York', 'America/Los_Angeles')).toBe(' (Eastern)');
+    expect(zoneNote('Europe/London', 'America/New_York')).toBe(' (United Kingdom)');
+  });
+
+  it('writes how long until or since, from now', () => {
+    const relative = (now: number) => postTime(AT, 'R', now, NEW_YORK);
+    expect(relative(AT - 25 * MINUTE)).toBe('in 25 minutes');
+    expect(relative(AT - 90 * MINUTE)).toBe('in 2 hours');
+    expect(relative(AT + 3 * MINUTE)).toBe('3 minutes ago');
+    expect(relative(AT - 20_000)).toBe('in 20 seconds');
+    expect(relative(AT - 3 * 24 * 60 * MINUTE)).toBe('in 3 days');
+  });
+});
diff --git a/src/web/client/post-time.ts b/src/web/client/post-time.ts
new file mode 100644
index 0000000000000000000000000000000000000000..46ca2afc2f6820c039ae13df318aa292808f28ad
--- /dev/null
+++ b/src/web/client/post-time.ts
@@ -0,0 +1,86 @@
+import type { PostTimeStyle } from '../../domain/web/party-data.js';
+
+/**
+ * Where a time is shown: the reader's own language and zone unless a test fixes them (the page
+ * leaves both out, as Discord shows a timestamp in each reader's own).
+ */
+export interface TimeShown {
+  locale?: string | undefined;
+  timeZone?: string | undefined;
+}
+
+const plainSpaces = (text: string): string => text.replace(/\p{Zs}/gu, ' ');
+
+/** Discord's styles as the browser's own formats. */
+const STYLES: Readonly<Record<Exclude<PostTimeStyle, 'R'>, Intl.DateTimeFormatOptions>> = {
+  t: { hour: 'numeric', minute: '2-digit' },
+  T: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
+  d: { year: 'numeric', month: '2-digit', day: '2-digit' },
+  D: { dateStyle: 'long' },
+  f: { dateStyle: 'long', timeStyle: 'short' },
+  F: { dateStyle: 'full', timeStyle: 'short' },
+};
+
+/** How long until or since, in the largest unit that is at least one, as Discord words it. */
+function relative(at: number, now: number, shown: TimeShown): string {
+  const seconds = Math.round((at - now) / 1000);
+  const words = new Intl.RelativeTimeFormat(shown.locale, { numeric: 'always' });
+  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
+    ['day', 86_400],
+    ['hour', 3_600],
+    ['minute', 60],
+  ];
+  for (const [unit, size] of steps) {
+    if (Math.abs(seconds) >= size) return words.format(Math.round(seconds / size), unit);
+  }
+  return words.format(seconds, 'second');
+}
+
+/** The reader's own zone: the page shows every time in it, as Discord does (plan 8M-8A). */
+export function readerZone(): string {
+  return Intl.DateTimeFormat().resolvedOptions().timeZone;
+}
+
+/**
+ * What a form says after a time it shows in the server's zone (review 8A-11: a form's times are
+ * read in it), where the reader is in another: ` (Eastern)`, the zone's generic name without
+ * "Time"; nothing where they are the same.
+ */
+export function zoneNote(zone: string, reader: string = readerZone()): string {
+  if (zone === reader) return '';
+  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
+    .formatToParts(0)
+    .find((part) => part.type === 'timeZoneName')?.value;
+  return name === undefined ? ` (${zone})` : ` (${name.replace(/ Time$/u, '')})`;
+}
+
+/**
+ * The hint of a form that takes a typed clock time (review N4: the raid report and change forms,
+ * a new train's, a new meetup's), which the server reads in its zone: named where the reader is in
+ * another, `Clock times are read in the server's zone (Eastern).`; undefined where they are the
+ * same.
+ */
+export function zoneHint(zone: string, reader: string = readerZone()): string | undefined {
+  const note = zoneNote(zone, reader);
+  return note === '' ? undefined : `Clock times are read in the server's zone${note}.`;
+}
+
+/**
+ * A post's time (`<t:…:style>`, a `time` node) as Discord shows it to a reader (plan 8M-8A): in
+ * the reader's own language and zone, `R` as how long until or since `now` (the page keeps it
+ * current). The map's other times say the server's zone (`clockTime`); a post's say the reader's,
+ * as on Discord.
+ */
+export function postTime(
+  at: number,
+  style: PostTimeStyle,
+  now: number,
+  shown: TimeShown = {},
+): string {
+  if (style === 'R') return relative(at, now, shown);
+  return plainSpaces(
+    new Intl.DateTimeFormat(shown.locale, { ...STYLES[style], timeZone: shown.timeZone }).format(
+      at,
+    ),
+  );
+}
diff --git a/src/web/client/post-views.test.ts b/src/web/client/post-views.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c0587311b16b789f192d55314d9fcd1416b138a1
--- /dev/null
+++ b/src/web/client/post-views.test.ts
@@ -0,0 +1,100 @@
+import { describe, expect, it } from 'vitest';
+import type { PostView } from '../../domain/web/party-data.js';
+import { prefetchOrder, PostViews } from './post-views.js';
+
+const view = (key: string): PostView => ({ key, accent: 'egg', blocks: [] });
+
+/** Posts the test answers by hand: each asked load waits until the test resolves it. */
+function handLoads() {
+  const asked: Array<{ id: string; key: string; answer: (view: PostView | undefined) => void }> =
+    [];
+  const loaded: string[] = [];
+  const views = new PostViews({
+    load: (id, key) =>
+      new Promise((resolve) => {
+        asked.push({ id, key, answer: resolve });
+      }),
+    loaded: (id) => {
+      loaded.push(id);
+    },
+  });
+  return { views, asked, loaded };
+}
+
+describe('PostViews: the posts the page has, by their keys (plan 8M-8A)', () => {
+  it('asks for a post once, and has it once it came', async () => {
+    const { views, asked, loaded } = handLoads();
+    const party = { id: 'r1', postKey: 'a' };
+    expect(views.of(party)).toBeUndefined();
+    expect(views.of(party)).toBeUndefined();
+    expect(asked.map((one) => [one.id, one.key])).toEqual([['r1', 'a']]);
+    asked[0]?.answer(view('a'));
+    await views.idle();
+    expect(loaded).toEqual(['r1']);
+    expect(views.of(party)).toEqual(view('a'));
+    expect(asked).toHaveLength(1);
+  });
+
+  it('shows the post it has while it asks for the post of a new key', async () => {
+    const { views, asked } = handLoads();
+    views.of({ id: 'r1', postKey: 'a' });
+    asked[0]?.answer(view('a'));
+    await views.idle();
+    expect(views.of({ id: 'r1', postKey: 'b' })).toEqual(view('a'));
+    expect(asked.map((one) => one.key)).toEqual(['a', 'b']);
+    asked[1]?.answer(view('b'));
+    await views.idle();
+    expect(views.of({ id: 'r1', postKey: 'b' })).toEqual(view('b'));
+  });
+
+  it('asks nothing for a party without a post, and asks again after a failed load', async () => {
+    const { views, asked, loaded } = handLoads();
+    expect(views.of({ id: 'r1', postKey: null })).toBeUndefined();
+    expect(asked).toEqual([]);
+    views.of({ id: 'r2', postKey: 'a' });
+    asked[0]?.answer(undefined);
+    await views.idle();
+    expect(loaded).toEqual([]);
+    views.of({ id: 'r2', postKey: 'a' });
+    expect(asked).toHaveLength(2);
+  });
+
+  it('fetches ahead at most the parties it is given up to its bound, those it has not got (8A-3)', async () => {
+    const { views, asked } = handLoads();
+    views.of({ id: 'r0', postKey: 'k0' });
+    asked[0]?.answer(view('k0'));
+    await views.idle();
+    const parties = Array.from({ length: 30 }, (_, n) => ({ id: `r${n}`, postKey: `k${n}` }));
+    views.prefetch(parties, 20);
+    // Of the first 20: r0 it has, r1 to r19 asked; nothing beyond the bound, nothing twice.
+    expect(asked.slice(1).map((one) => one.id)).toEqual(
+      Array.from({ length: 19 }, (_, n) => `r${n + 1}`),
+    );
+    views.prefetch(parties, 20);
+    expect(asked).toHaveLength(20);
+    views.prefetch([{ id: 'x', postKey: null }], 20);
+    expect(asked).toHaveLength(20);
+  });
+
+  it('asks ahead on a page’s first list for the parties in view alone, later for the rest too (N6)', () => {
+    const parties = ['a', 'b', 'c', 'd'].map((id) => ({ id, postKey: 'k' }));
+    const inView = (party: { id: string }) => party.id === 'b' || party.id === 'd';
+    expect(prefetchOrder(parties, inView, true).map((one) => one.id)).toEqual(['b', 'd']);
+    expect(prefetchOrder(parties, inView, false).map((one) => one.id)).toEqual([
+      'b',
+      'd',
+      'a',
+      'c',
+    ]);
+  });
+
+  it('keeps a post that came only while its key is the one asked for last', async () => {
+    const { views, asked } = handLoads();
+    views.of({ id: 'r1', postKey: 'a' });
+    views.of({ id: 'r1', postKey: 'b' });
+    asked[1]?.answer(view('b'));
+    asked[0]?.answer(view('a'));
+    await views.idle();
+    expect(views.of({ id: 'r1', postKey: 'b' })).toEqual(view('b'));
+  });
+});
diff --git a/src/web/client/post-views.ts b/src/web/client/post-views.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e832f2fa6cbe4f0d592c1586d7a6e3f8d8bc895b
--- /dev/null
+++ b/src/web/client/post-views.ts
@@ -0,0 +1,89 @@
+import type { PostView } from '../../domain/web/party-data.js';
+
+/**
+ * The parties whose posts a list asks for ahead (`PostViews.prefetch`), in order: those in view
+ * first; on a page's first list those alone (review N6: a household's tabs opening at once share
+ * the post route's limit per address), later lists the rest after them.
+ */
+export function prefetchOrder<P>(
+  parties: readonly P[],
+  inView: (party: P) => boolean,
+  first: boolean,
+): P[] {
+  const shown = parties.filter(inView);
+  return first ? shown : [...shown, ...parties.filter((party) => !inView(party))];
+}
+
+/** What the posts need of the page: a post asked for by its key, and who is told it came. */
+export interface PostViewsDeps {
+  /** `GET /s/<guild>/api/parties/<id>/post?k=<key>`; undefined when it could not be had. */
+  load(id: string, key: string): Promise<PostView | undefined>;
+  /** A party's post came: a popup that shows the party draws it anew. */
+  loaded(id: string): void;
+}
+
+/**
+ * The parties' posts the page has (plan 8M-8A), by party and key (`MapParty.postKey`): a post is
+ * asked for when a popup or card draws its party and the page has not got its key yet, once per
+ * key at a time; while it is on its way the post the page had of the party is drawn (it differs
+ * only by what changed), or none (the map's own summary). The browser keeps each by its key
+ * (`?k=`). A post that comes for a key that is not the last asked of its party is dropped, and
+ * so is one that comes with another key than asked (it changed meanwhile: the list's next poll
+ * brings its new key; keeping it would ask and draw again and again).
+ */
+export class PostViews {
+  private readonly kept = new Map<string, PostView>();
+  /** The key last asked for of each party. */
+  private readonly wanted = new Map<string, string>();
+  private readonly asking = new Set<Promise<void>>();
+
+  constructor(private readonly deps: PostViewsDeps) {}
+
+  /** The post of a party as the page has it, its key's asked for when it has it not. */
+  of(party: { id: string; postKey: string | null }): PostView | undefined {
+    const { id, postKey } = party;
+    if (postKey === null) return undefined;
+    const kept = this.kept.get(id);
+    if (kept?.key === postKey) return kept;
+    if (this.wanted.get(id) !== postKey) this.ask(id, postKey);
+    return kept;
+  }
+
+  /**
+   * Asks ahead for the posts of these parties (review 8A-3: a popup that opens has its post, and
+   * does not jump when it comes): of the first `limit` in the order given (the page gives those
+   * in view first), those whose key the page has not got and is not asking for, so that a list
+   * asks for at most `limit` posts whatever its length, well within the post route's rate limit.
+   */
+  prefetch(parties: readonly { id: string; postKey: string | null }[], limit: number): void {
+    for (const { id, postKey } of parties.slice(0, limit)) {
+      if (postKey === null || this.kept.get(id)?.key === postKey) continue;
+      if (this.wanted.get(id) === postKey) continue;
+      this.ask(id, postKey);
+    }
+  }
+
+  /** Resolves once no post is on its way (for tests). */
+  async idle(): Promise<void> {
+    while (this.asking.size > 0) await Promise.all(this.asking);
+  }
+
+  private ask(id: string, key: string): void {
+    this.wanted.set(id, key);
+    const asked = this.deps
+      .load(id, key)
+      .catch(() => undefined)
+      .then((view) => {
+        if (this.wanted.get(id) !== key) return;
+        // A failed load is asked again the next time the party is drawn.
+        this.wanted.delete(id);
+        if (view?.key !== key) return;
+        this.kept.set(id, view);
+        this.deps.loaded(id);
+      })
+      .finally(() => {
+        this.asking.delete(asked);
+      });
+    this.asking.add(asked);
+  }
+}
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index c4db3ab8ab7ebf84cc27ab452b0ecca345ed0ba5..fd18ab452652208d77f578dc6feec17cfd85195c 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -98,6 +98,22 @@ const optionsOf = (select: PageNode | undefined) =>
     .filter((one) => one.tag === 'option')
     .map((one) => [one.attributes?.value, one.text]);
 
+describe('the zone the raid forms read typed times in (review N4)', () => {
+  const HINT = "Clock times are read in the server's zone (Eastern).";
+  it('is named for a reader in another zone, in the report and the change forms', () => {
+    expect(
+      JSON.stringify(reportForm(gym([1]), OPTIONS, REGIONS, {}, 'America/Los_Angeles')),
+    ).toContain(HINT);
+    expect(JSON.stringify(changeForm(raid(), OPTIONS, MOVES, 'America/Los_Angeles'))).toContain(
+      HINT,
+    );
+    expect(
+      JSON.stringify(reportForm(gym([1]), OPTIONS, REGIONS, {}, 'America/New_York')),
+    ).not.toContain(HINT);
+    expect(JSON.stringify(changeForm(raid(), OPTIONS, MOVES))).not.toContain(HINT);
+  });
+});
+
 describe('the form of a report (reportForm)', () => {
   it("offers the bosses by tier in /raid's order, then the eggs, nothing picked yet", () => {
     const form = reportForm(gym([1]), OPTIONS, REGIONS);
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
index c46804ea01301203385c8cd726819cb921d940ff..79df1d46179553f03fda6c20c206a834e6b67c51 100644
--- a/src/web/client/raid-forms.ts
+++ b/src/web/client/raid-forms.ts
@@ -5,6 +5,7 @@ import type {
 } from '../../domain/web/raid-options-data.js';
 import { pressParty, type PressSteps, type Pressed } from './parties.js';
 import type { MapGym, PageNode } from './popup.js';
+import { zoneHint } from './post-time.js';
 
 /**
  * Reporting and changing raids on the live map (plan 8M-4, spec 3.6), the parts that need no
@@ -92,9 +93,10 @@ export function reportButton(gymId: number): PageNode {
 }
 
 /**
- * "Report raid" in the box a click opens the form in (`report-box`): in a gym's own popup, and
- * after the raids in the popup of a gym that shows them (an elite raid can be beside a standard
- * one).
+ * "Report raid" in the box a click opens the form in (`report-box`): in a gym's own popup only;
+ * a gym that shows a raid offers the raid instead (plan 8M-8A, review N5: `gymWithRaidBoxes`;
+ * whether an elite raid may be reported beside a standard one there is a question for Matt in
+ * the follow-ups).
  */
 export function reportBox(gymId: number): PageNode {
   return { tag: 'div', className: 'report-box', children: [reportButton(gymId)] };
@@ -124,6 +126,21 @@ export interface ReportValues {
   region: string;
 }
 
+/**
+ * The hint of a form's typed times (`zoneHint`, review N4) as nodes: none where the reader's zone
+ * is the server's. Shared by the forms of raids, trains and meetups.
+ */
+/** The server's zone, which reads a form's typed times, and the reader's own. */
+export interface FormZones {
+  zone: string;
+  reader: string;
+}
+
+export function zoneHintNodes(zone: string, reader: string): PageNode[] {
+  const hint = zoneHint(zone, reader);
+  return hint === undefined ? [] : [{ tag: 'p', className: 'hint', text: hint }];
+}
+
 /**
  * The form of a report at a gym: the boss or egg, the time ("Hatches in" or "Ends in", minutes
  * or a clock time), and the region where the gym lies in several of the server's.
@@ -133,6 +150,7 @@ export function reportForm(
   options: RaidOptionsView,
   regionNames: ReadonlyMap<number, string>,
   filled: Partial<ReportValues> = {},
+  reader: string = options.zone,
 ): PageNode {
   const regions = gym.regionIds.flatMap((id) => {
     const name = regionNames.get(id);
@@ -146,6 +164,7 @@ export function reportForm(
       { tag: 'strong', className: 'name', text: gym.name },
       labelled('Raid', 'form-row', bossSelect(options, filled.boss)),
       labelled(timeLabel(filled.boss ?? ''), 'form-row time-row', timeInput('time', filled.time)),
+      ...zoneHintNodes(options.zone, reader),
       ...(regions.length > 1
         ? [
             labelled('Region', 'form-row', {
@@ -226,6 +245,7 @@ export function changeForm(
   raid: { id: string },
   options: RaidOptionsView,
   moves: RaidMovesView | undefined,
+  reader: string = options.zone,
 ): PageNode {
   return {
     tag: 'div',
@@ -234,6 +254,7 @@ export function changeForm(
     children: [
       labelled('Hatches in', 'form-row', timeInput('hatch', undefined), setButton('hatch')),
       labelled('Ends in', 'form-row', timeInput('end', undefined), setButton('end')),
+      ...zoneHintNodes(options.zone, reader),
       labelled('Boss', 'form-row', bossSelect(options, undefined), setButton('boss')),
       ...(moves
         ? [
diff --git a/src/web/client/raid-marker.ts b/src/web/client/raid-marker.ts
index 29b6e446d63c97ffb7c447975575bd6a33668dc9..01be7340e4be35b532f01711d36704ae011e2388 100644
--- a/src/web/client/raid-marker.ts
+++ b/src/web/client/raid-marker.ts
@@ -91,7 +91,7 @@ export function isDimmed(
   return hatched(raid, now) && raid.endTime !== null && endsSoon(raid.endTime, now);
 }
 
-/** `2:40` in the posts' zone, the hour and minute alone (a badge has no room for more). */
+/** `2:40` in the reader's zone (plan 8M-8A), the hour and minute alone (a badge has no room for more). */
 function shortClock(at: number, zone: string): string {
   const parts = new Intl.DateTimeFormat('en-US', {
     timeZone: zone,
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index a0497894c58888bcfd8e54f82f484be186254f7a..fec47712b4c08cbfb48c546e7628e7f721428d6d 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -6,6 +6,7 @@ import type {
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type MapGym } from './popup.js';
+import { readerZone } from './post-time.js';
 import {
   changeBody,
   changeForm,
@@ -149,7 +150,7 @@ export function raidUi(deps: RaidUiDeps) {
       return;
     }
     if (!hold.ready(claim, box.isConnected)) return;
-    const form = renderNode(reportForm(gym, lists, deps.regionNames), document);
+    const form = renderNode(reportForm(gym, lists, deps.regionNames, {}, readerZone()), document);
     const boss = form.querySelector<HTMLSelectElement>('select[name="boss"]');
     const label = form.querySelector<HTMLElement>('.time-row span');
     boss?.addEventListener('change', () => {
@@ -211,7 +212,7 @@ export function raidUi(deps: RaidUiDeps) {
     const known = await moves(raidId);
     if (!hold.ready(claim, section.isConnected)) return;
     const before = [...section.childNodes];
-    const form = renderNode(changeForm({ id: raidId }, lists, known), document);
+    const form = renderNode(changeForm({ id: raidId }, lists, known, readerZone()), document);
     const close = () => {
       section.replaceChildren(...before);
       hold.release(claim);
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index ee7cc8d3bbd05d900bfe18d1202f7c3f6946e4b5..6588379d2126d13db7bbc5885014bdcca556d15e 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -70,6 +70,18 @@
   --cluster-edge: rgba(79, 84, 92, 0.35);
   /* The side bar of a card, by what it is. */
   --accent: #5865f2;
+  /*
+   * The edge of a party's post on the map (plan 8M-8A), by `PostAccent`: the colors the posts have
+   * on Discord, the same in light and dark as there.
+   */
+  --accent-egg: #f1c40f;
+  --accent-hatched: #2ecc71;
+  --accent-ended: #e74c3c;
+  --accent-max: #d81b60;
+  --accent-timed: #3498db;
+  --accent-other: #5865f2;
+  /* Inline code in a post (`/hatch`). */
+  --code-bg: #e3e5e8;
 
   /* What the map draws (`theme.ts`); the raid's ring and route mode's numbers share them. */
   --gym: #2d7a3a;
@@ -178,6 +190,13 @@
     --cluster: rgba(128, 132, 142, 0.9);
     --cluster-edge: rgba(128, 132, 142, 0.35);
     --accent: #5865f2;
+    --accent-egg: #f1c40f;
+    --accent-hatched: #2ecc71;
+    --accent-ended: #e74c3c;
+    --accent-max: #d81b60;
+    --accent-timed: #3498db;
+    --accent-other: #5865f2;
+    --code-bg: #1e1f22;
 
     --gym: #3ba55c;
     --region: #8891f2;
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 10ba4d820789580805bbbd203dc6c74d739c30a0..d9de4c51256dcd42316e339bd2df15d42bf1b6f6 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -98,6 +98,16 @@ const texts = (node: PageNode) =>
     .filter((one) => one.text !== undefined && one.tag !== 'button' && one.tag !== 'option')
     .map((one) => one.text);
 
+describe('the zone the start form reads a typed time in (review N4)', () => {
+  it('is named for a reader in another zone', () => {
+    const zones = { zone: 'America/New_York', reader: 'Asia/Kolkata' };
+    expect(JSON.stringify(startForm([{ id: 1, name: 'west' }], {}, zones))).toContain(
+      "Clock times are read in the server's zone (Eastern).",
+    );
+    expect(JSON.stringify(startForm([{ id: 1, name: 'west' }]))).not.toContain('Clock times');
+  });
+});
+
 describe('starting a train (startForm, startBody)', () => {
   it("asks for the name, the region (any of the server's), the start and the mode, as /train and /meet take them", () => {
     const form = startForm([
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index a400550a87951cd47e15c7278339f7d58727f519..0351f3451b4f925dcb01552fcb4bbd635f362e13 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -16,6 +16,7 @@ import {
   type StopPlace,
 } from './parties.js';
 import type { MapGym, PageNode } from './popup.js';
+import { zoneHintNodes, type FormZones } from './raid-forms.js';
 
 /**
  * Trains on the live map (plan 8M-5, spec 3.7), the parts that need no Leaflet: the start form,
@@ -117,6 +118,7 @@ export interface StartValues {
 export function startForm(
   regions: ReadonlyArray<{ id: number; name: string }>,
   filled: Partial<StartValues> = {},
+  zones?: FormZones,
 ): PageNode {
   return {
     tag: 'div',
@@ -156,6 +158,7 @@ export function startForm(
           ...(filled.time === undefined ? {} : { value: filled.time }),
         },
       }),
+      ...(zones === undefined ? [] : zoneHintNodes(zones.zone, zones.reader)),
       labelled('At the end', atEndSelect((filled.atEnd as MapAtEnd | undefined) ?? 'finish')),
       {
         tag: 'div',
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index 63e89001aa98a14b2f58af1301ed9f7107cdf46d..d5c0da6ada4ef203a9e83b3f7753543185cd51fd 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -12,6 +12,7 @@ import {
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type MapGym } from './popup.js';
+import { readerZone } from './post-time.js';
 import type { FormClaim, FormHold } from './raid-forms.js';
 import { fieldsOf, sayUnder } from './raid-ui.js';
 import {
@@ -48,6 +49,8 @@ export interface TrainUiDeps {
   csrf: { get(): string; set(token: string): void };
   /** The server's regions with their names, as `/api/geo` gives them. */
   regions: GeoView['regions'];
+  /** The server's zone, which reads a typed start (review N4); left out: not named. */
+  zone?: () => string;
   /** The gyms by id, as `/api/geo` gives them: the stops' names. */
   gyms: ReadonlyMap<number, MapGym>;
   /** The form that is open, shared with the raid and spawn forms. */
@@ -325,7 +328,10 @@ export function trainUi(deps: TrainUiDeps) {
     }
     starting = claim;
     const regions = deps.regions.map((region) => ({ id: region.id, name: region.name }));
-    const form = renderNode(startForm(regions), document);
+    const form = renderNode(
+      startForm(regions, {}, deps.zone ? { zone: deps.zone(), reader: readerZone() } : undefined),
+      document,
+    );
     const close = () => {
       if (starting === claim) starting = undefined;
       toolsIdle();
@@ -458,7 +464,7 @@ export function trainUi(deps: TrainUiDeps) {
     actionClicked(button: HTMLButtonElement, train: MapTrain): void {
       if (button.dataset.routeTrain !== undefined) startRoute(train);
       else if (button.dataset.moveTrain !== undefined) {
-        const box = button.closest<HTMLElement>('.train-actions');
+        const box = button.closest<HTMLElement>('.train-actions, .post-controls');
         if (box) openMove(box, train);
       } else if (button.dataset.conductor !== undefined) void pressConductor(button, train);
     },
diff --git a/src/web/post-accents.test.ts b/src/web/post-accents.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e75a2b9d744cac1b1c7918055849611a5b8c9465
--- /dev/null
+++ b/src/web/post-accents.test.ts
@@ -0,0 +1,26 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { POST_ACCENTS } from '../domain/web/party-data.js';
+
+/**
+ * The edge of a party's post on the map (plan 8M-8A): every accent the server names
+ * (`accentName`) is a value of `theme.css` in its light and dark sets, drawn by a rule of
+ * `map.css`. Here, beside `raid-marker-tiers.test.ts`, outside the client's type check.
+ */
+describe("a post's edge on the map", () => {
+  it('has a value of theme.css in both sets and a rule of map.css for every accent', () => {
+    const client = path.resolve(import.meta.dirname, 'client');
+    const theme = readFileSync(path.join(client, 'theme.css'), 'utf8');
+    const map = readFileSync(path.join(client, 'map.css'), 'utf8');
+    for (const accent of POST_ACCENTS) {
+      expect(theme.split(`--accent-${accent}:`).length - 1, accent).toBe(2);
+      expect(map, accent).toMatch(
+        new RegExp(
+          String.raw`\.post\.accent-${accent}\)[^{]*\{[^}]*var\(--accent-${accent}\)`,
+          'u',
+        ),
+      );
+    }
+  });
+});
````

### Task 6: 8M-8A task 6: the phone card, and the list's focus

Prototype commit: `d550e7ebc9218b3c6b1a55f3831ba0265c2e30b0`

Narrower than 768 pixels a party opens as a card docked at the bottom
(src/web/client/phone-card.ts) in the place of its popup, with the
popup's own content: first its summary (the post's heading block with
its picture, times and boss, its first row of buttons, who the member
is in it and the map's line; map.css picks them out by the blocks'
roles), the whole post once its handle is tapped or the card swiped up;
swiped down it goes back to the summary, then closes, as a tap on the
map, its close button or Escape close it. The list's line opens the
same card. The card is drawn anew with each list and when its post
comes, never under a form (forms in it are held as in the list's
lines), and closes once its party is gone. Its edge on top is the
post's color.

8M-7 follow-up N1: when the focused line of the list drops out, the
focus goes to the sort, not to the page's body.

**Files:**

```
 src/web/client/list-ui.test.ts    |   8 ++++++
 src/web/client/list-ui.ts         |   6 +++--
 src/web/client/map.css            | 100 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.ts     |  60 ++++++++++++++++++++++++++++++++++++---------
 src/web/client/phone-card.test.ts | 213 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/phone-card.ts      | 190 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/raid-forms.ts      |  34 ++++++++++++++++++++++----
 src/web/client/raid-ui.ts         |   8 +++---
 src/web/client/spawn-ui.ts        |   4 +--
 src/web/client/train-ui.ts        |   4 +--
 10 files changed, 599 insertions(+), 28 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/list-ui.test.ts src/web/client/phone-card.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d550e7ebc9218b3c6b1a55f3831ba0265c2e30b0 -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8A task 6: the phone card, and the list's focus`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index 7e2850824e2b75cbc1c9d62a60761bbe0f2c1aa6..e6375a55d30bbe1d67d2734364566e48699bfeb8 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -275,6 +275,14 @@ describe('the focus in the list drawn anew (review fix 2)', () => {
     expect(focused.element?.isConnected).toBe(true);
   });
 
+  it('goes to the sort when the line it was on drops out (8M-7 follow-up N1)', () => {
+    const { section, list } = listed();
+    section.all('button')[2]?.focus();
+    list.show(lines.slice(0, 2));
+    expect(focused.element?.tagName).toBe('select');
+    expect(focused.element?.attributes.has('data-sort')).toBe(true);
+  });
+
   it('stays on the sort while it is changed', () => {
     const { section, list } = listed();
     const [sort] = section.all('select');
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 501a890613bcddcc567eca73b7ab219c9c0085d2..1eb416745292877c9979d009c39d6326585c69a1 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -143,9 +143,11 @@ export class WhatIsOn {
     const inside = focused instanceof HTMLElement && deps.section.contains(focused);
     deps.section.replaceChildren(...body);
     if (inside && document.activeElement !== focused) {
-      // A popup drawn anew: the control of the same kind in it (its tag and `data-` attributes).
+      // A popup drawn anew: the control of the same kind in it (its tag and `data-` attributes);
+      // where its line dropped out (its party ended), the sort (8M-7 follow-up N1), never the
+      // page's body.
       const twin = focused.isConnected ? focused : sameControl(deps.section, focused);
-      twin?.focus();
+      (twin ?? deps.section.querySelector<HTMLElement>('select[data-sort]'))?.focus();
     }
     for (const key of [...this.kept.keys()]) {
       if (!this.expanded.has(key)) this.kept.delete(key);
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 442d5fc2268ca8499ee0be14a0453cf0aefbc0e8..041ea0a5575e37c8293155ed474081c93a9460cc 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1457,3 +1457,103 @@ path.highlighted {
   margin: 4px 0;
   padding-left: 20px;
 }
+
+/*
+ * The phone card of a party (plan 8M-8A, `phone-card.ts`): docked at the bottom, its edge on top
+ * in the post's color; its summary shows the post's heading block, its first row of buttons and
+ * the map's line (by the blocks' roles), the whole post once tapped or swiped up.
+ */
+.party-card {
+  position: fixed;
+  right: 0;
+  bottom: 0;
+  left: 0;
+  z-index: 1100;
+  display: flex;
+  flex-direction: column;
+  max-height: 85vh;
+  border-top: var(--card-bar) solid var(--accent);
+  border-radius: 12px 12px 0 0;
+  background: var(--card-bg);
+  color: var(--text);
+  box-shadow: 0 -4px 16px var(--shadow);
+}
+
+.party-card[hidden] {
+  display: none;
+}
+
+.party-card:has(.post.accent-egg) {
+  border-top-color: var(--accent-egg);
+}
+
+.party-card:has(.post.accent-hatched) {
+  border-top-color: var(--accent-hatched);
+}
+
+.party-card:has(.post.accent-ended) {
+  border-top-color: var(--accent-ended);
+}
+
+.party-card:has(.post.accent-max) {
+  border-top-color: var(--accent-max);
+}
+
+.party-card:has(.post.accent-timed) {
+  border-top-color: var(--accent-timed);
+}
+
+.party-card:has(.post.accent-other) {
+  border-top-color: var(--accent-other);
+}
+
+.party-card .card-top {
+  display: flex;
+  align-items: center;
+  padding: 4px 8px 0;
+  touch-action: none;
+}
+
+.party-card .card-handle {
+  flex: 1;
+  padding: 10px 0 6px;
+  border: 0;
+  background: none;
+  color: var(--muted);
+  font: inherit;
+  font-size: 12px;
+  cursor: pointer;
+}
+
+.party-card .card-handle::before {
+  content: '';
+  display: block;
+  width: 40px;
+  height: 4px;
+  margin: 0 auto 4px;
+  border-radius: 2px;
+  background: var(--line);
+}
+
+.party-card .card-close {
+  padding: 4px 10px;
+  border: 0;
+  background: none;
+  color: var(--muted);
+  font-size: 22px;
+  cursor: pointer;
+}
+
+.party-card .card-body {
+  overflow-y: auto;
+  padding: 0 16px 16px;
+}
+
+.party-card.summary .post > .post-text:not(.role-head),
+.party-card.summary .post > .post-line,
+.party-card.summary .post .post-row:not(:first-child),
+.party-card.summary .post .on-discord,
+.party-card.summary .post-popup > :not(.post, .map-line, .mine-part, .back),
+.party-card.summary .mine-part > :not(.mine, .group-pick) {
+  display: none;
+}
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index ae565672e19e1144c3422c2c65aef2b295a12ad0..02db56de078223427e0f434fcd2655d95eba4d98 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -67,6 +67,7 @@ import {
 } from './post-draw.js';
 import { postTime, readerZone } from './post-time.js';
 import { prefetchOrder, PostViews } from './post-views.js';
+import { cardWanted, PhoneCard } from './phone-card.js';
 import { stopName } from './train-forms.js';
 import { stopPlace } from './parties.js';
 import type { Place } from './distance.js';
@@ -391,6 +392,8 @@ export function showParties(
       }
       // A line of the list shown with its popup draws it anew (review 8A-9).
       for (const kind of ['raid', 'train', 'meetup']) whatIsOn.redrawLine(`${kind}:${id}`);
+      const onCard = card.key;
+      if (onCard !== undefined && showsIt(onCard)) card.refresh(contents.get(onCard));
     },
   });
 
@@ -621,12 +624,15 @@ export function showParties(
         open({ [toggle]: !part.hidden });
       }
     } else if (showRaid !== undefined) {
-      const gymKey = showing.key;
+      // The gym of the popup, or of the phone card, that shows the list.
+      const onCard = card.key;
+      const gymKey = onCard ?? showing.key;
       const gymId = gymKey?.startsWith('gym:') ? Number(gymKey.slice(4)) : undefined;
-      if (gymId === undefined) return;
+      if (gymKey === undefined || gymId === undefined) return;
       if (showRaid === '') chosenRaid.delete(gymId);
       else chosenRaid.set(gymId, showRaid);
-      showing.popup?.update();
+      if (onCard !== undefined) card.refresh(contents.get(onCard));
+      else showing.popup?.update();
     }
   };
 
@@ -634,18 +640,32 @@ export function showParties(
    * Binds a popup to a layer under a key that names it across redraws (`gym:<id>`,
    * `train:<id>`, `route:<id>`), remembering it while it is open; its content is held while a
    * form is open in it. A post (plan 8M-8A) is as wide as Discord's on a phone at most, and no
-   * taller than the map leaves room for: it scrolls beyond (Leaflet's `maxHeight`).
+   * taller than the map leaves room for: it scrolls beyond (Leaflet's `maxHeight`). On a phone
+   * the party opens as the card docked at the bottom instead (`PhoneCard`), with the same
+   * content: the popup Leaflet opens is closed at once, before anything is painted.
    */
   const withPopup = <T extends L.Layer>(target: T, key: string, popup: () => PageNode): T => {
-    target.bindPopup(
-      hold.content(() => draw(popup())),
-      {
-        minWidth: 280,
-        maxWidth: 380,
-        maxHeight: Math.max(260, map.getSize().y - 140),
-      },
-    );
+    const content = () => draw(popup());
+    contents.set(key, content);
+    target.bindPopup(hold.content(content), {
+      minWidth: 280,
+      maxWidth: 380,
+      maxHeight: Math.max(260, map.getSize().y - 140),
+      autoPan: !cardWanted(),
+    });
     target.on('popupopen', () => {
+      if (cardWanted()) {
+        const at = target.getPopup()?.getLatLng();
+        target.closePopup();
+        card.open(key, () => contents.get(key)?.() ?? content());
+        // What was tapped stays in sight above the card (review 8A-8).
+        if (at) {
+          const point = map.latLngToContainerPoint(at);
+          const clear = map.getSize().y - card.height - 24;
+          if (point.y > clear) map.panBy([0, point.y - clear]);
+        }
+        return;
+      }
       showing.openedAs(key);
     });
     target.on('popupclose', () => {
@@ -659,6 +679,19 @@ export function showParties(
     });
     return target;
   };
+  /** What each popup shows, by its key: the phone card draws the same. */
+  const contents = new Map<string, () => HTMLElement>();
+  /** The phone card (plan 8M-8A): a party narrower than the desktop opens as it. */
+  // Its closing takes a form drawn in it (review 8A-1), and only its closing (review N2).
+  const card = new PhoneCard(document, {
+    onClose: () => {
+      hold.cardClosed();
+    },
+  });
+  // A tap on the map closes it, as a popup closes.
+  map.on('click', () => {
+    card.close();
+  });
 
   /**
    * The things drawn at a place in the last draw, by the layer that shows them (plan 8M-7): a tap
@@ -802,6 +835,7 @@ export function showParties(
     const reopen = showing.key;
     for (const group of Object.values(groups)) group.clearLayers();
     popups.clear();
+    contents.clear();
     placed = [];
     const now = Date.now();
     const { atGyms } = raidsAtGyms(next.raids, (id) => gyms.has(id));
@@ -972,6 +1006,8 @@ export function showParties(
     // The gyms follow: route mode or a place picked shows every gym (plan 8M-7).
     afterDraw();
     if (reopen !== undefined) popups.get(reopen)?.openPopup();
+    // The phone card shows the party as it is now (none once it is gone).
+    if (card.key !== undefined) card.refresh(contents.get(card.key));
   };
 
   // Leaflet tells the map first, then the layer (`OpenPopup`).
diff --git a/src/web/client/phone-card.test.ts b/src/web/client/phone-card.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b240e39d9c0da3de5d227094a8c8f8891f39bd13
--- /dev/null
+++ b/src/web/client/phone-card.test.ts
@@ -0,0 +1,213 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { afterSwipe, afterTap, handleWords, PhoneCard, SWIPE_PIXELS } from './phone-card.js';
+import { FormHold, formPlace } from './raid-forms.js';
+
+describe('the phone card of a party (plan 8M-8A)', () => {
+  it('shows the whole post when swiped up, the summary again when swiped down, then closes', () => {
+    expect(afterSwipe('summary', -SWIPE_PIXELS)).toBe('whole');
+    expect(afterSwipe('whole', -200)).toBe('whole');
+    expect(afterSwipe('whole', SWIPE_PIXELS)).toBe('summary');
+    expect(afterSwipe('summary', 120)).toBe('closed');
+  });
+
+  it('takes a short move for a tap, not a swipe', () => {
+    expect(afterSwipe('summary', -(SWIPE_PIXELS - 1))).toBe('summary');
+    expect(afterSwipe('whole', SWIPE_PIXELS - 1)).toBe('whole');
+  });
+
+  it('switches between the summary and the whole post with a tap on its handle, saying which', () => {
+    expect(afterTap('summary')).toBe('whole');
+    expect(afterTap('whole')).toBe('summary');
+    expect(handleWords('summary')).toBe('Show the whole post');
+    expect(handleWords('whole')).toBe('Show less');
+  });
+});
+
+/** Just enough of the DOM for the card: elements in a tree, classes, listeners, the focus. */
+class FakeElement {
+  className = '';
+  textContent = '';
+  type = '';
+  hidden = false;
+  parent: FakeElement | undefined;
+  readonly children: FakeElement[] = [];
+  readonly attributes = new Map<string, string>();
+  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
+  readonly classList = {
+    toggle: (name: string, on: boolean) => {
+      const names = new Set(this.className.split(' ').filter((one) => one !== ''));
+      if (on) names.add(name);
+      else names.delete(name);
+      this.className = [...names].join(' ');
+    },
+    contains: (name: string) => this.className.split(' ').includes(name),
+  };
+
+  constructor(
+    readonly tagName: string,
+    private readonly doc: FakeDocument,
+  ) {}
+
+  append(...nodes: FakeElement[]): void {
+    for (const node of nodes) {
+      node.parent = this;
+      this.children.push(node);
+    }
+  }
+
+  replaceChildren(...nodes: FakeElement[]): void {
+    for (const child of this.children.splice(0)) child.parent = undefined;
+    this.append(...nodes);
+  }
+
+  setAttribute(name: string, value: string): void {
+    this.attributes.set(name, value);
+  }
+
+  addEventListener(type: string, listener: (event: unknown) => void): void {
+    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+  }
+
+  fire(type: string, event: object = {}): void {
+    for (const listener of this.listeners.get(type) ?? []) listener(event);
+  }
+
+  focus(): void {
+    this.doc.activeElement = this;
+  }
+
+  contains(other: FakeElement | null): boolean {
+    for (let node: FakeElement | undefined = other ?? undefined; node; node = node.parent) {
+      if (node === this) return true;
+    }
+    return false;
+  }
+
+  closest(selector: string): FakeElement | null {
+    const names = selector.split(',').map((one) => one.trim().replace(/^\./u, ''));
+    if (names.some((name) => this.classList.contains(name))) return this;
+    return this.parent?.closest(selector) ?? null;
+  }
+
+  /** The element under it with this class. */
+  find(name: string): FakeElement | undefined {
+    for (const child of this.children) {
+      if (child.classList.contains(name)) return child;
+      const deeper = child.find(name);
+      if (deeper) return deeper;
+    }
+    return undefined;
+  }
+}
+
+class FakeDocument {
+  activeElement: FakeElement | null = null;
+  readonly body = new FakeElement('body', this);
+  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
+  createElement(tag: string): FakeElement {
+    return new FakeElement(tag, this);
+  }
+  addEventListener(type: string, listener: (event: unknown) => void): void {
+    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+  }
+  key(key: string): void {
+    for (const listener of this.listeners.get('keydown') ?? []) listener({ key });
+  }
+}
+
+describe('the phone card on the page (review 8A-1, 8A-8)', () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  /** A card over the fake document, a party's content with a field in it, a button elsewhere. */
+  const opened = () => {
+    const doc = new FakeDocument();
+    vi.stubGlobal('HTMLElement', FakeElement);
+    const closed: number[] = [];
+    const card = new PhoneCard(doc as unknown as Document, {
+      onClose: () => {
+        closed.push(1);
+      },
+    });
+    const outside = doc.createElement('button');
+    doc.body.append(outside);
+    outside.focus();
+    const content = doc.createElement('div');
+    content.className = 'party-popup';
+    const field = doc.createElement('input');
+    content.append(field);
+    card.open('gym:1', () => content as unknown as HTMLElement);
+    const element = doc.body.children.find((one) => one.classList.contains('party-card'));
+    if (!element) throw new Error('no card');
+    const part = (name: string) => {
+      const found = element.find(name);
+      if (!found) throw new Error(`no ${name}`);
+      return found;
+    };
+    return { doc, card, element, part, outside, field, closed };
+  };
+
+  /** A hold over nothing, as the page's. */
+  const holding = () =>
+    new FormHold<string>({
+      draw: () => undefined,
+      popup: () => undefined,
+      later: (run) => {
+        run();
+      },
+      controls: () => undefined,
+    });
+
+  it('lets go of a form held in it when it closes, and only then (8A-1, N2)', () => {
+    const { card, field, closed } = opened();
+    const hold = holding();
+    expect(formPlace(field as unknown as HTMLElement)).toBe('card');
+    expect(hold.take(formPlace(field as unknown as HTMLElement))).toBeDefined();
+    expect(hold.editing).toBe(true);
+    // A Leaflet popup closing elsewhere (the place list, a gym's own) takes nothing of the card.
+    hold.popupClosed();
+    expect(hold.editing).toBe(true);
+    // The page's hook: the card's closing lets the card's form go (`hold.cardClosed`).
+    card.close();
+    expect(closed).toEqual([1]);
+    hold.cardClosed();
+    expect(hold.editing).toBe(false);
+  });
+
+  it('closes the first party, its form with it, when a second opens in its place (two in a row)', () => {
+    const { doc, card, closed } = opened();
+    const second = doc.createElement('div');
+    card.open('train:t1', () => second as unknown as HTMLElement);
+    expect(closed).toEqual([1]);
+    expect(card.key).toBe('train:t1');
+    // The same party drawn anew (a new list) closes nothing.
+    card.open('train:t1', () => second as unknown as HTMLElement);
+    expect(closed).toEqual([1]);
+  });
+
+  it('takes no tap after a swipe, moves the focus in and gives it back (8A-8)', () => {
+    const { doc, element, part, outside } = opened();
+    const handle = part('card-handle');
+    expect(doc.activeElement).toBe(handle);
+    const top = part('card-top');
+    top.fire('pointerdown', { clientY: 400 });
+    top.fire('pointerup', { clientY: 300 });
+    // The click the browser fires after the swipe's pointerup is no tap.
+    handle.fire('click');
+    expect(element.classList.contains('whole')).toBe(true);
+    part('card-close').fire('click');
+    expect(element.hidden).toBe(true);
+    expect(doc.activeElement).toBe(outside);
+  });
+
+  it('closes on Escape only when the focus is in it or nowhere (8A-8)', () => {
+    const { doc, element, outside } = opened();
+    outside.focus();
+    doc.key('Escape');
+    expect(element.hidden).toBe(false);
+    doc.activeElement = null;
+    doc.key('Escape');
+    expect(element.hidden).toBe(true);
+  });
+});
diff --git a/src/web/client/phone-card.ts b/src/web/client/phone-card.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8a5b48cd67e4e5b7ce6062cec7bb4ae115cac9fb
--- /dev/null
+++ b/src/web/client/phone-card.ts
@@ -0,0 +1,190 @@
+/**
+ * The phone card of a party (plan 8M-8A, design "A party's popup is its post"): narrower than
+ * 768 pixels a party opens as a card docked at the bottom of the screen in the place of its
+ * popup, first its summary (its post's heading block with its picture and times, the post's first
+ * row of buttons, the map's line: `map.css` shows only those, by the blocks' roles), the whole
+ * post once tapped or swiped up; swiped down it goes back to the summary, then closes, as does a
+ * tap on the map or Escape. The content is the popup's own (`withPopup`), drawn anew with each
+ * list, but not under a form.
+ */
+
+/** Where the card is. */
+export type CardState = 'closed' | 'summary' | 'whole';
+
+/** How far a finger moves up or down before it is a swipe and not a tap. */
+export const SWIPE_PIXELS = 40;
+
+/** Where a swipe of `dy` pixels (up is negative) takes the card. */
+export function afterSwipe(state: CardState, dy: number): CardState {
+  if (dy <= -SWIPE_PIXELS) return state === 'closed' ? 'closed' : 'whole';
+  if (dy >= SWIPE_PIXELS) return state === 'whole' ? 'summary' : 'closed';
+  return state;
+}
+
+/** Where a tap on the card's handle takes it. */
+export function afterTap(state: CardState): CardState {
+  return state === 'summary' ? 'whole' : state === 'whole' ? 'summary' : 'closed';
+}
+
+/** What the card's handle says it does. */
+export function handleWords(state: CardState): string {
+  return state === 'whole' ? 'Show less' : 'Show the whole post';
+}
+
+/** Whether a party opens as the card: a screen narrower than the desktop's (`map.css`). */
+export function cardWanted(): boolean {
+  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
+}
+
+/** The card's elements, made at its first opening. */
+interface CardParts {
+  element: HTMLElement;
+  handle: HTMLButtonElement;
+  body: HTMLElement;
+}
+
+/** What the page wants to hear of the card. */
+export interface PhoneCardHooks {
+  /**
+   * The card closed (review 8A-1): a form drawn in it went with it, as with a popup's closing
+   * (`FormHold.popupClosed`).
+   */
+  onClose?: () => void;
+}
+
+/**
+ * The card on the page: one element under `<body>`, made when a party first opens as it, its
+ * handle and close button at the top, then the party's content. `open` shows a party's summary
+ * and moves the focus to its handle; `refresh` draws the content anew (a new list); `close` hides
+ * it and gives the focus back where it was (review 8A-8). A swipe is never also a tap; Escape
+ * closes it only while the focus is in it or nowhere.
+ */
+export class PhoneCard {
+  private state: CardState = 'closed';
+  private shown: { key: string; content: () => HTMLElement } | undefined;
+  private parts: CardParts | undefined;
+  private swipeFrom: number | undefined;
+  /** A swipe just ended: the click the browser fires after it is no tap. */
+  private swiped = false;
+  /** What had the focus before the card took it. */
+  private focusBefore: HTMLElement | undefined;
+
+  constructor(
+    private readonly document: Document,
+    private readonly hooks: PhoneCardHooks = {},
+  ) {}
+
+  /** The key of the party the card shows (`gym:<id>`, `train:<id>` …); undefined while closed. */
+  get key(): string | undefined {
+    return this.state === 'closed' ? undefined : this.shown?.key;
+  }
+
+  /** How tall the card is, in pixels (the map pans what was tapped above it). */
+  get height(): number {
+    return this.parts?.element.getBoundingClientRect?.().height ?? 0;
+  }
+
+  /** Shows a party's summary. */
+  open(key: string, content: () => HTMLElement): void {
+    const { element, handle, body } = this.made();
+    const active = this.document.activeElement;
+    if (this.state === 'closed' && active instanceof HTMLElement && !element.contains(active)) {
+      this.focusBefore = active;
+    }
+    // Another party in its place: the first is closed for the page, a form in it with it.
+    if (this.state !== 'closed' && this.shown?.key !== key) this.hooks.onClose?.();
+    this.shown = { key, content };
+    body.replaceChildren(content());
+    this.go('summary');
+    handle.focus();
+  }
+
+  /** Draws the content anew (a new list), keeping the card where it is. */
+  refresh(content: (() => HTMLElement) | undefined): void {
+    if (this.shown === undefined || this.state === 'closed') return;
+    if (content === undefined) {
+      this.close();
+      return;
+    }
+    this.shown = { key: this.shown.key, content };
+    this.made().body.replaceChildren(content());
+  }
+
+  close(): void {
+    if (this.state !== 'closed') this.go('closed');
+  }
+
+  private go(state: CardState): void {
+    const { element, handle, body } = this.made();
+    const was = this.state;
+    this.state = state;
+    element.hidden = state === 'closed';
+    element.classList.toggle('summary', state === 'summary');
+    element.classList.toggle('whole', state === 'whole');
+    handle.textContent = handleWords(state);
+    handle.setAttribute('aria-expanded', String(state === 'whole'));
+    if (state === 'closed' && was !== 'closed') {
+      body.replaceChildren();
+      this.shown = undefined;
+      this.hooks.onClose?.();
+      this.focusBefore?.focus();
+      this.focusBefore = undefined;
+    }
+  }
+
+  /** The card's elements, made and put under `<body>` the first time. */
+  private made(): CardParts {
+    if (this.parts) return this.parts;
+    const { document } = this;
+    const element = document.createElement('div');
+    element.className = 'party-card';
+    element.hidden = true;
+    element.setAttribute('role', 'dialog');
+    element.setAttribute('aria-label', 'Party');
+    const top = document.createElement('div');
+    top.className = 'card-top';
+    const handle = document.createElement('button');
+    handle.type = 'button';
+    handle.className = 'card-handle';
+    const close = document.createElement('button');
+    close.type = 'button';
+    close.className = 'card-close';
+    close.setAttribute('aria-label', 'Close');
+    close.textContent = '×';
+    top.append(handle, close);
+    const body = document.createElement('div');
+    body.className = 'card-body';
+    element.append(top, body);
+    document.body.append(element);
+    handle.addEventListener('click', () => {
+      if (this.swiped) {
+        this.swiped = false;
+        return;
+      }
+      this.go(afterTap(this.state));
+    });
+    close.addEventListener('click', () => {
+      this.close();
+    });
+    top.addEventListener('pointerdown', (event) => {
+      this.swipeFrom = event.clientY;
+      this.swiped = false;
+    });
+    top.addEventListener('pointerup', (event) => {
+      if (this.swipeFrom === undefined) return;
+      const dy = event.clientY - this.swipeFrom;
+      this.swipeFrom = undefined;
+      if (Math.abs(dy) < SWIPE_PIXELS) return;
+      this.swiped = true;
+      this.go(afterSwipe(this.state, dy));
+    });
+    document.addEventListener('keydown', (event) => {
+      if (event.key !== 'Escape' || this.state === 'closed') return;
+      const active = document.activeElement;
+      const nowhere = active === null || active === document.body;
+      if (nowhere || element.contains(active)) this.close();
+    });
+    this.parts = { element, handle, body };
+    return this.parts;
+  }
+}
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
index 79df1d46179553f03fda6c20c206a834e6b67c51..cb64f5fdbc7b2a1791d645d1bb80725847c1e623 100644
--- a/src/web/client/raid-forms.ts
+++ b/src/web/client/raid-forms.ts
@@ -437,6 +437,8 @@ export interface FormHoldDeps<V> {
  */
 export interface FormClaim {
   readonly inPopup: boolean;
+  /** In the phone card (review N2): only the card's closing lets it go (`cardClosed`). */
+  readonly inCard?: boolean;
   readonly aside?: boolean;
   /**
    * Whether the form is still in the page (fix round 1): a form outside a popup (a change form in a
@@ -445,15 +447,25 @@ export interface FormClaim {
   readonly alive?: () => boolean;
 }
 
+/**
+ * Where a form is (reviews 8A-1, N2), as `FormHold.take` claims it: in the phone card (`'card'`,
+ * whose closing alone takes the form with it, `FormHold.cardClosed`), in a Leaflet popup (`true`,
+ * `FormHold.popupClosed`), or elsewhere (`false`: the side pane, a line of the list).
+ */
+export function formPlace(place: Pick<HTMLElement, 'closest'>): boolean | 'card' {
+  if (place.closest('.party-card') !== null) return 'card';
+  return place.closest('.leaflet-popup') !== null;
+}
+
 /**
  * The raid form that is open, one at a time: a click on "Report raid" or "Change…" takes the
  * hold (`take`) before the form's lists are asked for, and the controls that open the other
  * forms are off until it lets go. While it holds, a popup's content is held (`content`) and a
  * new list waits (`shown`), drawn once the form closes (`release`, by the form that holds it
  * only: a late answer of a form gone with its popup closes nothing of the form open now) or its
- * popup does (`popupClosed`). A popup closes inside Leaflet's own handling (also when another one
- * opens): the list is drawn after it, never inside, where a redraw would open the closing popup
- * again beside the new one.
+ * popup does (`popupClosed`), or the phone card it is in (`cardClosed`). A popup closes inside
+ * Leaflet's own handling (also when another one opens): the list is drawn after it, never inside,
+ * where a redraw would open the closing popup again beside the new one.
  */
 export class FormHold<V> {
   private holder: FormClaim | undefined;
@@ -495,10 +507,11 @@ export class FormHold<V> {
    * A form is being opened: its claim, or none while another form holds. `aside`: a form of the
    * trains' box (`FormClaim.aside`).
    */
-  take(inPopup: boolean, aside = false, alive?: () => boolean): FormClaim | undefined {
+  take(place: boolean | 'card', aside = false, alive?: () => boolean): FormClaim | undefined {
     if (this.holder) return undefined;
     const claim: FormClaim = {
-      inPopup,
+      inPopup: place === true,
+      ...(place === 'card' ? { inCard: true } : {}),
       ...(aside ? { aside } : {}),
       ...(alive ? { alive } : {}),
     };
@@ -548,6 +561,17 @@ export class FormHold<V> {
    */
   popupClosed(): void {
     if (!this.holder?.inPopup) return;
+    this.letGo();
+  }
+
+  /** The phone card closed (review N2): a form in it is gone with it, as `popupClosed` has it. */
+  cardClosed(): void {
+    if (!this.holder?.inCard) return;
+    this.letGo();
+  }
+
+  /** The form held is gone with its popup or card. */
+  private letGo(): void {
     this.holder = undefined;
     this.deps.controls(true);
     this.deps.changed?.();
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index fec47712b4c08cbfb48c546e7628e7f721428d6d..f8383afe269acc2a9cf0e3b3260dbd03806f8fcb 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -11,6 +11,7 @@ import {
   changeBody,
   changeForm,
   type FormHold,
+  formPlace,
   reportBody,
   reportBox,
   reportClosesForm,
@@ -60,9 +61,6 @@ export function formControls(root: ParentNode, on: boolean): void {
   }
 }
 
-/** Whether a form's place is in a popup (whose closing takes the form with it). */
-const inPopup = (place: HTMLElement): boolean => place.closest('.leaflet-popup') !== null;
-
 /** What the page says when the pick lists cannot be loaded. */
 const NO_OPTIONS = 'The pick lists could not be loaded. Try again in a moment.';
 
@@ -139,7 +137,7 @@ export function raidUi(deps: RaidUiDeps) {
    */
   const openReport = async (box: HTMLElement, gym: MapGym, restore: () => void) => {
     const { hold } = deps;
-    const claim = hold.take(inPopup(box));
+    const claim = hold.take(formPlace(box));
     if (!claim) return;
     let lists: RaidOptionsView;
     try {
@@ -198,7 +196,7 @@ export function raidUi(deps: RaidUiDeps) {
   const openChange = async (section: HTMLElement, raidId: string) => {
     const { hold } = deps;
     // Outside a popup (a line of the list), its claim goes with its form (fix round 1).
-    const popup = inPopup(section);
+    const popup = formPlace(section);
     const claim = hold.take(popup, false, popup ? undefined : () => section.isConnected);
     if (!claim) return;
     let lists: RaidOptionsView;
diff --git a/src/web/client/spawn-ui.ts b/src/web/client/spawn-ui.ts
index d973f0fbf08dde2516271543976039be4f31f311..ca93c0c9926fa71971dfaa882e3b715e7c5b6a45 100644
--- a/src/web/client/spawn-ui.ts
+++ b/src/web/client/spawn-ui.ts
@@ -4,7 +4,7 @@ import type { WildOptionsView } from '../../domain/web/spawn-data.js';
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type MapGym } from './popup.js';
-import type { FormClaim, FormHold } from './raid-forms.js';
+import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
 import { fieldsOf, sayUnder } from './raid-ui.js';
 import {
   pressedWhere,
@@ -156,7 +156,7 @@ export function spawnUi(deps: SpawnUiDeps) {
   const spawnClicked = (button: HTMLButtonElement, gym: MapGym): void => {
     const box = button.parentElement;
     if (!box) return;
-    const claim = hold.take(box.closest('.leaflet-popup') !== null);
+    const claim = hold.take(formPlace(box));
     if (!claim) return;
     const point = spawnPoint(gym.lat, gym.lon);
     void openForm(box, point, regionsAt(point, deps.regions), claim, () => {
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index d5c0da6ada4ef203a9e83b3f7753543185cd51fd..f3a3a07a4f13c98bb58d33508505a6f32e25943a 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -13,7 +13,7 @@ import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type MapGym } from './popup.js';
 import { readerZone } from './post-time.js';
-import type { FormClaim, FormHold } from './raid-forms.js';
+import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
 import { fieldsOf, sayUnder } from './raid-ui.js';
 import {
   conductorBody,
@@ -376,7 +376,7 @@ export function trainUi(deps: TrainUiDeps) {
    * drawn once the panel or its popup closes.
    */
   const openMove = (box: HTMLElement, train: MapTrain): void => {
-    const claim = hold.take(box.closest('.leaflet-popup') !== null);
+    const claim = hold.take(formPlace(box));
     if (!claim) return;
     const before = [...box.childNodes];
     let shown = train;
````

### Task 7: 8M-8A task 7: the docs and the staging checklist

Prototype commit: `a9142aea2b5ae522384f9166a70566b7438d56da`

web.md: a section "A party's popup is its post" (the layout kept by the
party service, the key and the post's address, the view, the text as
nodes and the links it may make, names as the post names them, the
table of what each of the post's buttons does on the map, the drawing,
times in the reader's zone, the phone card, the pictures), the new
addresses and rate limits, and "nobody is named" struck: the list names
nobody, the post names as Discord does. parties-and-posts.md: the roles
of a layout's texts and layoutOf. testing.md: the helpers and tests of
the posts on the map. The staging checklist
docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md.

**Files:**

```
 docs/architecture/parties-and-posts.md                  |  2 ++
 docs/architecture/testing.md                            |  2 +-
 docs/architecture/web.md                                | 46 ++++++++++++++++++++++++++++++++++++++--------
 docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md | 64 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/superpowers/plans/phase-0-follow-ups.md            |  4 ++++
 5 files changed, 109 insertions(+), 9 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff a9142aea2b5ae522384f9166a70566b7438d56da -- src test scripts data docs/architecture docs/guides docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8A task 7: the docs and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index a61c395fc3db20c4fbfed94d3710c47fe4746605..490703753456925c35e7aa48b56834453aa66419 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -60,6 +60,8 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit (some 86 snowflakes after a short text, 100 at most). `inMessages(text, members)` (plan 8X-1) pings them all: the text with as many as fit, then messages of mentions alone, each within 2,000 characters and 100 pings. `pingInMessages(deps, partyId, postId, text, members)` (`src/services/party-change.ts`) sends them one after the other, asking the store before each whether the party is still active with that post (a moved raid has another), and stops otherwise or when Discord says the post is gone (`complete`, `pinged`, and `stopped`: `gone`, or `moved` for a party still active with another post); `/shout` (`AttendanceService.shout`) goes through it, answering `gone` with how many it `pinged` before ("This raid is over. I pinged 86 trainers before it ended."), or `moved` ("This raid moved to another post: I pinged 86 trainers before it moved. Shout again there.", without the count when nobody was pinged yet, and then the use of `/shout` goes back: `givesBack`); `/shout group:True` pings only the others of the shouter's own group (not Complete, those who allow shout pings; the text says `to everybody in group B:`), refused in a party of one group (`one-group`: "This raid has one group: `/shout` without `group` pings everybody."), `nobody` with the group when nobody else is in it. Since plan 8X-4 (a Gigantamax train holds a hundred) a group's meeting time, a new group's notice (its sentence and hint first), a timed party's start, a train's movement, the notice of a raid that moved and a train's split notice go through `pingInMessages` as well (its `sent` says how many messages went; the move notice is said once the first went); only the archive warning and the completion question still ping one message's worth (their ids are kept to delete them; a follow-up).
 
+- The live map draws the same layout as the party's popup (plan 8M-8A, `web.md`, "A party's popup is its post"): `postView` (`src/render/post-view.ts`) and `postText` (`post-text.ts`) read it for the page, never a second description of what a post says. A text of a layout says what it is about (`BlockRole` of `party-post.ts`, `inRole`: `head` the heading block, `where` its place and a train's stops ahead, `trainers` each group's text and the meeting hint, `note` the small print of who reported or made it; a meetup's information has none), set by the four renderers for the map's phone card; `postMessage` ignores it, so Discord's message is the same with or without (each renderer's test holds it). `PartyService.layoutOf(partyId)` gives the layout the post was last shown with (set when the post is made and whenever an edit went through or would send nothing new, kept when an edit fails, forgotten with the post in `forgetPost`); `layoutThumbnails(layout)` the places' pictures it shows.
+
 ## Discord: the gateway and the party service
 
 - Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 362ff25d1d316032636e34e8940731862cedfcf5..b015813167f894d1a67c82225a5663752796f6af 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -81,7 +81,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
 - The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
-- The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
+- The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Plan 8M-8A: it gives the party service's `layoutOf` and `postTitle` (a party's post on the map), and `places` (no place has a picture unless the test passes a fake of `PlacePictures` as `places`); the application emoji's pictures are `webServerWith`'s `emoji` (none by default). A party's post through the route is tested per kind in `party-post-view.test.ts` (a reported raid, hatched or from a screenshot, a max battle, a train with its route and a split, a meetup at a pin), a layout's roles with `roleLines` and `withoutRoles` (`test/support/post-roles.ts`, which each renderer's test uses to see Discord's message unchanged), the page's drawing of a post in `src/web/client/post-draw.test.ts` (trees of nodes), the parser `postText` by its property over random texts (`post-text.test.ts`, a seeded generator of its own). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`; `/raid`'s own refusal of a forum the member is kept out of in `raid.test.ts`, with `gateway.barred` and a router's `Throttles` to see it uncounted, plan 8M-6; a screenshot's in `mention.test.ts`, whose `setup({ alsoInEast })` puts gyms in East as well).
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a Power Spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 7ffe0ce684fc4c332b7f29ca33a480e196c6db21..1f6f48cffce5093af519bd923c4fca77a8305b2c 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -6,7 +6,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (plan 8M-7: `stadia`, the default, Stadia Maps' Alidade Smooth with OpenStreetMap's to fall back to; `osm`, OpenStreetMap's alone; or `google`, Google's beside Stadia's; no key for Stadia: it checks the page's domain, `localhost` passes; `docs/web-setup.md`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows Stadia's, `shownTiles`, `src/web/headers.ts`). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, the application emoji's pictures `emoji` (plan 8M-8A), a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
@@ -30,7 +30,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, and whose one script, inline (`CONTINUE_SCRIPT`, `src/web/continue-script.ts`, let in by its hash: no file of its own, which was a third request to `/auth/` for every login), presses the button as the page is shown (Matt, 2026-10-25: no second tap): it submits with `requestSubmit`, or `submit` where a browser lacks it (Safari before 16), then disables the button and puts "Logging you in as <name>…" in place of the sentence, the name read as text from the form's `data-name` (escaped on the page; never HTML built of it), so that a tap while the POST is on its way cannot abort it after the link was spent and land on `?login=expired` (8M-7 review fix 1; `login.test.ts` runs the page's script against a small document of its form, button and sentence). A link preview or a prefetch runs no script, so it cannot spend the link; without script the button stays. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped). Pressed by the script, somebody else's link logs you in as them without a pause; the map's header names whose account it is (Matt's ruling, 2026-10-25). An unknown, used or expired link, or one of another server, leads (303) at once to the page its address names with `?login=expired`. `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, with `?region=<id>` for a link of `/maps` used in a region's channel, plan 8M-7, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The page's plain address is given only as code, after "To share the map, give its address:", which Discord does not make a link: tapped above the button, it opened the page logged out (Matt, 2026-10-25); the button is the one link in the answer. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
 
@@ -57,10 +57,40 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; since plan 8M-8A the menu is in the member's part under the post, Group… goes to it for a newcomer, and Group… for a member signed up and Meet… say "Do this on Discord" until plan 8M-8B); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. The list names nobody (attendees are counts); each party carries `postKey`, the key of its post as last shown (plan 8M-8A, below, "A party's popup is its post"), whose view names attendees, the reporter and the maker exactly as the post does, to the same members (Matt's ruling, 2026-10-25: the map is an extension of Discord, never a contradiction of it). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote); any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
-- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the reader's own zone (`clockTime` over `readerZone()`, plan 8M-8A; the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+
+## A party's popup is its post (plan 8M-8A)
+
+Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's popup is its post", "After the builder check"); the brief's controller's rulings in `.superpowers/sdd/2026-10-26-phase-8m8a-post-popups/design.md`. 8M-8B (the post's controls as web forms) and 8M-8C (trains on the map) follow.
+
+- **One layout, two drawings.** The post's `PostLayout` is drawn by `postMessage` for Discord and by `postView` for the map; nothing of what a post says is decided twice. `PartyService.layoutOf(partyId)` gives the layout the post was last shown with (set when the post is made and whenever an edit went through or would send nothing new; an edit that fails leaves the one before; forgotten with the post): the map shows exactly what the post shows and nothing is rendered a second time for the web. An edit that ends after its party ended or moved to another post keeps nothing (`keepLayout`). After a restart a post has none until the start shows it anew (every post, paced, after the first good read of the application's emoji, whatever it found: `ApplicationEmoji` tells its listener on that read, review 8A-4): its popup is the map's own summary meanwhile (`postKey` null). The texts of a layout carry a role (`BlockRole`: `head`, `where`, `trainers`, `note`, set by the renderers; Discord's message ignores it; a meetup's information has none), which the phone card uses.
+- **The key and the address.** `/api/parties` gives each party its `postKey` (`postKey` of `src/render/post-view.ts`: 16 hex digits of the layout's SHA-256, kept per layout object). `GET /s/<guild>/api/parties/<party id>/post?k=<key>` answers the `PostView`: for members as the list (401, 403, 503 by `PartyViewers`, asked of the party's forum and of the forums of the posts its layout links, `linkedPosts`, review 8A-5), 404 for a party the list would not show (`mapParty`: of another server, ended, over by the clock, in a forum the member is kept out of) and for one without a layout; `private, max-age=86400` when `k` is the layout's key (the answer is the same for that key; 300 seconds for a post that names another, whose name depends on the member's access), `private, no-cache` otherwise (the post as it is now, with its key). 120 a minute per address (`POSTS_PER_MINUTE`). The page asks for a post by its key when it draws the party and keeps it (`PostViews`, `src/web/client/post-views.ts`: one question per key at a time, the post it had drawn meanwhile, a post that comes with another key than asked dropped, the next poll bringing the new key), and asks ahead (review 8A-3, `prefetch`): with each list the posts of the first `PREFETCH_POSTS` (20) parties, those in view first, that it has not got (on a page's first list those in view alone, `prefetchOrder`, review N6: tabs opening at once behind one address share the route's limit); and a party's as the pointer comes over or presses its marker or its line in the list. A post that comes for the popup open draws it anew where it stands (`autoPan` off for that update: no jump), and a line of the list shown with its popup anew (`redrawLine`, review 8A-9).
+- **The view** (`postView`, pure, `src/render/post-view.ts`; its types `PostView`, `PostViewBlock`, `PostButtonView`, `PostControl`, `PostNode`, `PostLine` in `party-data.ts`, without imports): the accent by the name of its value in `theme.css` (`accentName`: `egg`, `hatched`, `ended`, `max`, `timed`, else `other`; `POST_ACCENTS`; `post-accents.test.ts` holds `theme.css` and `map.css` to each), each text read into lines of nodes by `postText`, a section's details under it, the post's picture beside its heading only from `pictureOrigins` (an egg the post carries as a file, `attachment://<name>.png`, as the web server's `/eggs/<name>.png`: `eggServed`, review 8A-15), a place's picture by Pine's address (`PlacePictures`, below; without one the text the post shows without its picture, `withoutPicture`), empty texts and stray lines left out as the message leaves them. No custom id reaches the page.
+- **Discord's text as nodes** (`postText`, pure, `src/render/post-text.ts`): headings `#` to `###`, small print `-#`, bold, italics (an underscore only between non-word characters), underline (`__`, review 8A-14), a marker discord.js leaves unescaped being text (after an address in the same run or an emoji's start, as its `escapeItalic` and `escapeUnderline` say, `markerTaken`), strike, inline code, masked links with and without angle brackets, bare links (to white space, `<`, `>`, a backslash or a backtick, trailing punctuation and an unopened `)` left out), `<#id>` as a link to that post on Discord named by its title where the member may see that party on the map, else "another post" (`OTHER_POST`), `<@id>` as "unknown member" (`UNKNOWN_MEMBER`: posts name members by name, by mention only one the bot has no name for; no id reaches the page), custom emoji (`src` where Pine serves the picture, else the name), timestamps (epoch milliseconds and style, `f` without one; one no date can be is shown as written), `</cmd:id>` as `/cmd`; plain emoji are text; anything else is its text. What `plain` and `plainNoLinks` did is undone (their escapes, also in link text, and their zero-width spaces exactly where they put them, `ADDED_SPACE`: after a `<`, after the `@` of a mass mention, after a scheme's `:` before a slash, after `www.`, after the dot before a host's last part that a path follows), so an address a name broke stays text: tested by a property, the text of `plain(s)`, `plainLines(s)` and `plainNoLinks(s)` reads as `s` (left out: a typed zero-width space in one of those places, which cannot be told from theirs, and four asterisks in a row, which discord.js escapes as `*\*\**` and Discord itself reads as italics). Links only where `linkableOnTheMap` allows (`party-routes.ts`): Google Maps (`https://www.google.com/maps…`), `https://discord.com/channels/<this server>/…` and Pine's own origin; https, no user, password or port; anything else is shown as its text. No new dependency.
+- **Names** (Matt's ruling, 2026-10-25): the post's view names attendees, the reporter and the maker exactly as the post does, to the members who get the list; one viewer class (a visitor never gets a party: 401 or 403, as the list). The list itself names nobody.
+- **The controls** (`postView` maps each button through its custom id, `CONTROLS`; the page decides from the list what applies to the member, `post-draw.ts`):
+
+  | The post's button | `PostControl` | On the map |
+  |---|---|---|
+  | Interested, Join, Here, Done, Leave | `press` `interested`, `join`, `here`, `done`, `leave` | the map's press (`POST …/parties/<id>/<action>`); off while the list's `attendance.actions` lacks it (Done on an egg, Leave for somebody not signed up, everything while read-only); icon-only with `aria-label` and `title` from `STATUS_WORDS` (Interested, Coming, Here, Done) and Leave |
+  | Remote | `press` `remote` | the map's Remote press (`MAP_REMOTE`), off unless `attendance.remote.offered` |
+  | Group… | `panel` `group` | for a newcomer to several groups the menu "Which group?" in the member's part (Interested, Join and Here send it); else "Do this on Discord" (8M-8B) |
+  | Set time… | `panel` `time` | the raid's change form (8M-4) where `mayChange`; else "Do this on Discord" (8M-8B: Discord's rule) |
+  | Move… | `panel` `moves` | the moves panel (8M-5) in place of the post's buttons where `MapTrain.panel`; else why not, as the server decides it and sends it with the train (`MapTrain.moveRefusal`, `moveRefusalOf`: the commands' `mayNotMove`, `not-conductor` or `not-attending`, and `no-route`, `read-only`; review N1), the page only wording it (`whyNot`): "Only the conductor or staff can move the train.", "Sign up for the train to move it.", "The train has no route yet: add a stop first.", "Discord cannot be reached just now, so nothing can be changed." |
+  | Manage… | `panel` `manage` | shows the conductor's part (Be the conductor, Stop being or Take off) and "What the train is mainly for: on Discord" where the member is the conductor, may take or drop the role, or set the kind; else who may, as for Move… (8M-8C) |
+  | Route | `panel` `route` | shows the stop list, the train's stop marked |
+  | −1, +1, Meet…, Split… | `discord` | "Do this on Discord →" under the buttons, the post's link (8M-8B, 8M-8C) |
+  | Screenshot feedback | `screenshot` | "Reported from a screenshot · feedback on Discord →" in its place, the post's link (Matt's ruling: feedback stays on Discord) |
+  | anything else | `none` | off |
+
+  The raid's boss and moves (slash commands on Discord, no post button) stay the map's "Change…" in the member's part, as do a train's "Edit route" and a meetup's "Edit…".
+- **Drawing** (`post-draw.ts`, pure: `postCard`, `postPopup`, `mapLine`, `raidChoices`; trees of nodes set as text by `renderNode`, never HTML from data; `safeHref`, as strict as `linkableOnTheMap` (this server's channels, `/maps` itself, review 8A-13), and `safeSrc` check every address again; a picture beside a part that does not load is hidden, review 8A-15): the post's edge (`.post.accent-<name>`), headings, small print, `strong`, `em`, `u`, `s`, `code`, links in a tab of their own, the application's emoji as pictures the size of the text, times as `<time>` in the reader's own zone and language (`postTime`, `post-time.ts`: Discord's styles, `R` kept current every 15 s), the buttons in Discord's styles (`press primary|secondary|success|danger`, `icon` for icons alone). Under the post the member's own part (who they are in it, "You: Coming, group B · remote"; the group menu; Change…, Edit route, Edit…; Manage…'s and Route's sections, hidden until pressed; what is open under a post, the line to Discord too, kept by party across redraws, `PanelsOpen`, review 8A-10; the line by the button pressed, worded again at each draw from the party as it is then, review N3) and the map's line (distance from where the member is by `distanceWords`, once the browser said; Directions; Open on Discord). A popup is 280 to 380 pixels wide and scrolls beyond the map's height (`maxHeight`). A gym of several raids lists their heading lines with their times, each opening its post in the popup with "← All raids here" (ruling 14); a gym that shows its raid offers "Report spawn here" and "Meetup here" under it, never "Report raid" (`gymWithRaidBoxes`, review 8A-2); a party whose post the page has not got yet shows the map's own summary as before.
+- **Times in the reader's zone** (ruling 7): the posts, the list, the markers' badges and the popups' summaries give times in the reader's own zone, as Discord does (`readerZone`, `post-time.ts`); what the server words (answers through `pageWords`) and the forms that send typed times keep `settings.timezone`, and where the reader is in another the forms name it (review 8A-11, N4): the meetup editor after its times ("Starts now: 7:30 PM (Eastern)", `zoneNote`), and the raid report and change forms, a new train's and a new meetup's in a hint under their typed times ("Clock times are read in the server's zone (Eastern).", `zoneHint`, `zoneHintNodes`; a zone without a short generic name in its own words, "(India Standard)").
+- **The phone card** (`phone-card.ts`): narrower than 768 pixels a party opens as a card docked at the bottom in the place of its popup (the popup Leaflet opens is closed at once; `autoPan` off), with the popup's own content: its summary (the `head` block, the first row of buttons, the member's line and the map's line, by the roles, `map.css`), the whole post once the handle is tapped or the card swiped up (40 pixels, `SWIPE_PIXELS`); down again the summary, then closed, as a tap on the map, × or Escape (only while the focus is in it or nowhere); the click after a swipe is no tap; the focus goes to its handle and back where it was when it closes; what was tapped is panned above it; "← All raids here" stays in its summary (review 8A-8). The list's line opens the same card. Drawn anew with each list and when its post comes, never under a form; a form in it claims the hold as the card's (`formPlace` says `'card'`; review N2), which no Leaflet popup's closing touches, and the card's closing lets it go (`PhoneCard`'s `onClose`, `hold.cardClosed`, review 8A-1), also when another party opens in the card's place; closed once its party is gone.
+- **Pictures** (`src/services/post-pictures.ts`, through the image cache `var/images`; nothing added to the CSP, no Google host): `/emoji/<id>.png` (`emojiRoutes`, `server.ts`; `EmojiPictures`) serves an emoji of the application alone (`ApplicationEmoji.hasId`, by its last read), fetched once from Discord's CDN (`?size=96`), public and kept for good (`public, max-age=31536000, immutable`), no rate limit (the application has some dozens); any other id 404, and the page shows its plain emoji or name. `/s/<guild>/pictures/gym/<id>` and `…/wayspot/<Wayfarer id>` (`PlacePictures`): a place's Wayfarer picture by its gym or Wayspot, never by its address (no open proxy; `keyOf` finds the key of an address a post shows in an index of the gyms' and kept Wayspots' pictures as `wayspotPicture` makes them, built anew when their generations change), for members (401, 403, 503 as the list), only while a post of the server that the member sees on the map shows it (404 otherwise, nothing fetched), `private, max-age=86400`, 240 a minute per address (`PLACE_PICTURES_PER_MINUTE`). Both are served only as PNG, JPEG, GIF or WebP by their first bytes (`pictureType`), and a download that failed is not tried again for a minute (`FAILED_PICTURE_MS`, review 8A-6).
 
 ## Raids on the map (plan 8M-4)
 
@@ -68,7 +98,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The pick lists** `GET /s/<guild>/api/raid-options` (members, as `/api/parties`; 30 a minute per address): `raidOptions` (`src/web/raid-options.ts`, pure; types in `src/domain/web/raid-options-data.ts`, which imports no server code): the current bosses in the boss list's order, each with the value its choice of `/raid` has (`bossChoiceValue`: `b:yveltal:T5:0`; `/raid`'s own list uses it too, and `reportedBoss` reads it back), then an egg of every tier (`eggChoiceValue`, `e:T5:0`), tiers in the posts' words (`raidWords`), the posts' zone; nothing of gyms (no elite raid gym mark). An ETag of its JSON, `private, no-cache`, 304. A raid's moves `GET /s/<guild>/api/raids/<id>/moves` (members; the same limiter as the pick lists; an active raid of the server, 409 otherwise; its forum by `memberAccess` as a change asks it, `barred` 403, Discord unreachable 503; 422 without a boss whose moves are known): `bossMoves`, the moves of the boss the post shows, by id and name, as `/moveset` lists them.
 - **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum (`reportBarred`, `src/commands/raids/report.ts`, the check `/raid` makes too, plan 8M-6): `barred` from any of them 403 `{ error: REPORT_BARRED }`, "You cannot report a raid at this gym: you are kept out of the forum its raid would be in.", Discord unreachable 503 (a known limit, as for `/raid`: the check runs before `reportRaidAs`, outside `PartyStore.update`, so a raid another member reports at a gym of two regions moments earlier may appear in a forum that bars this member between the check and the report, which then joins it); only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is, one line per report once who reports is known, a refusal too (plan 8S-3): `{ user, guild, gym, outcome }`, "a raid was reported on the map", the outcome the report's kind (`created`, `exists`, `no-post` …) or what refused it (`no-gym`, `several-regions`, `barred`, `unreachable`, `throttled`, `refused` for `/raid`'s readers), never the text.
 - **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403); whether the member may change it (`mayChangeRaid`: signed up for it, as `mayArrange` has it, or staff by the commands' `isManagement`, an admin or a moderator by role or the bot's owner, `isMapStaff` of the member fetched fresh; 403 "Only members signed up for this raid, and moderators, can change it here." otherwise); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. The commands themselves let anybody in the post change a raid; the map, which crosses forums (spec 2.5), asks a sign-up or staff (spec 3.6). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
-- **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, and after the raids in the popup of a gym that shows raids, `gymRaidsPopup`'s `extras`, since an elite raid can be beside a standard one), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go; once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise. A click in a popup stays in it (`keepClicksInPopup`, `raid-forms.ts`, on the map's `popupopen`, a listener on the popup's element that stops the click): Leaflet 1.9 leaves a click in a popup alone only by walking up from the click's target to the popup when the click reaches the map (`Map._isClickDisabled`), and a control that takes its own button out of the page as it is clicked (Manage… drawing the Manage train panel in its place; Cancel of the report, change and spawn forms putting the popup's buttons back) left nothing to walk up from, so Leaflet took the click for the map's and closed the popup (staging of the web map plans, 2026-10-18; tested with a model of Leaflet's rule in `train-ui.isolated.test.ts`). Cancel therefore puts the popup's buttons back and lets the hold go, the popup open; a popup closed with a form in it lets its form go (`popupClosed`).
+- **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, only: since plan 8M-8A a gym that shows a raid offers the raid, with "Report spawn here" and "Meetup here" under it (`gymWithRaidBoxes`, review N5); whether an elite raid may be reported beside a standard one there is a question for Matt in the follow-ups), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go; once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise. A click in a popup stays in it (`keepClicksInPopup`, `raid-forms.ts`, on the map's `popupopen`, a listener on the popup's element that stops the click): Leaflet 1.9 leaves a click in a popup alone only by walking up from the click's target to the popup when the click reaches the map (`Map._isClickDisabled`), and a control that takes its own button out of the page as it is clicked (Manage… drawing the Manage train panel in its place; Cancel of the report, change and spawn forms putting the popup's buttons back) left nothing to walk up from, so Leaflet took the click for the map's and closed the popup (staging of the web map plans, 2026-10-18; tested with a model of Leaflet's rule in `train-ui.isolated.test.ts`). Cancel therefore puts the popup's buttons back and lets the hold go, the popup open; a popup closed with a form in it lets its form go (`popupClosed`).
 - **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains are 8M-5 (below), meetups 8M-5M; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
 
 ## Spawns on the map (plan 8M-4S)
@@ -91,7 +121,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 ## Meetups on the map (plan 8M-5M)
 
 - **One code path per command** (spec 3.5, 3.7): what `/meetup`'s form does with `MeetupSafety.make`'s outcome is `makeMeetupAs` (`src/commands/meetups/meetup.ts`: the check of the place, the meetup or the moderators' request, each outcome in `/meetup`'s words, the post and a region's channel named by the caller's `ReportNames`); what `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, `TimedAnswer`: `ok`, `refused` with the reason, `gone`) and `describeAs` (`src/commands/meetups/info.ts`). The commands reply with them (`replyTimed`) or throw them; the map answers them. The web server is given what those commands read and call (`MeetupWebDeps.ctx`, `MeetupWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). Nobody is named.
+- **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). The list names nobody; its post does, as on Discord.
 - **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a Power Spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a Power Spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info, one line per request once who makes it is known, a refusal too (plan 8S-3): `{ user, guild, region, outcome }` (the region once it is one of the server's; `makeMeetupAs`'s kind, or what refused it: `no-region`, `no-forum`, `barred`, `unreachable`, `blocked`, `refused` for `/meetup`'s guards and form, `throttled`), "a meetup was made on the map", never a text or the place.
 - **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 021 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
 - **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power Spots are never offered here (they are `/api/powerspots`'s, plan 8X-5, for max battles), nor other Wayspots; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
@@ -147,7 +177,7 @@ The tool that makes the Wayspot export is private (`wayfarer.md`); the owner's i
 
 ## Restyling the page
 
-- Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, so that each page follows the device's light or dark (no switch on the page). The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, gray `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it and `editor.css` imports `map.css`; `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again when the device changes between light and dark (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')`, `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws gray): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
+- Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, so that each page follows the device's light or dark (no switch on the page). The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, gray `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`, and a party's post its post's own, `--accent-<name>` (plan 8M-8A, `PostAccent`), the same in light and dark as on Discord; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it and `editor.css` imports `map.css`; `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again when the device changes between light and dark (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')`, `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws gray): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
 - To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new color is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` checks that the light and dark sets name the same values and that every page's stylesheet imports `theme.css`, and refuses a color written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a color function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colors (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a color function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named color (a sentence may name a color: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the gray of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
 
 ## Adding a route
diff --git a/docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md b/docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..40bc95bb7fbfacf0e226cbc4ce4e00ca18d5950c
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md
@@ -0,0 +1,64 @@
+# Phase 8M-8A staging checklist: a party's popup is its post
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.
+
+- **Accounts:** Googer (owner, staff) and Tester (a member).
+- **Brief:** `.superpowers/sdd/2026-10-26-phase-8m8a-post-popups/design.md`.
+- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's popup is its post", "After the builder check").
+- **Conventions:** `docs/architecture/web.md` ("A party's popup is its post").
+- **Devices:** a desktop browser (light and dark), an Android phone and an iPhone if at hand, each through Discord's in-app browser and the phone's own browser.
+- **Compare with Discord:** for each kind, the post open on Discord beside the popup: the same lines, names, buttons and colors, in the same order.
+
+## Before
+
+1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs. The application's emoji are uploaded (`npm run emoji:upload` was run before; nothing new here).
+2. **Parties to see:** Googer reports a hatched raid with its boss at a gym with a Wayfarer picture and an egg at another; Tester joins the hatched one with a +1 and Remote. A raid from a screenshot whose time is a guess (an old screenshot through `/raid screenshot:`). A max battle at a Power Spot. A train with five stops at its second, and a group split off it (`Split…` on Discord) so that one post links the other. A meetup at a dropped pin. Two raids at one gym (a standard and an elite one).
+3. **After a restart:** the bot shows every post anew, paced, after the first good read of the application's emoji, whatever it found (also with no emoji uploaded); for the first seconds a popup is the map's own summary (no post yet), then the post. Where that first read failed (Discord away at the start), the posts are shown anew only at the next good read, the hourly upkeep: until then the popups are the map's summaries.
+
+## The post on the map (desktop)
+
+4. **A hatched raid.** Click its marker: the popup is the post: its heading, its times in your own zone ("Ends in 12 minutes, at 2:40 PM"), its weaknesses with the type icons, catch CP with the weather icons, the moves, Where with the gym's picture beside it and the Map link, the trainers by team with the team icons ("Coming (3): Ash +1, Misty"), the remote mark, the meeting hint, the buttons in Discord's colors with their icons, "Reported by Googer". The edge is the raid's green. Compare with the post on Discord.
+5. **Names.** Tester's name and Googer's are as the post shows them; a member the bot has no name for reads "unknown member"; nobody's id is anywhere (view the page's source of the post's answer in the browser's network tab).
+6. **An egg.** Yellow edge, "Hatches in …", "Hatches as …" when the boss is known, the egg's picture beside the heading.
+7. **The screenshot's raid.** The note that the times are a guess with `/hatch` and `/end` in code, and "Reported from a screenshot · feedback on Discord →" in the place of Screenshot feedback; it opens the post on Discord.
+8. **A max battle (the JSON only).** Max battles are drawn on the map in 8M-9: open `/s/<guild>/api/parties/<id>/post?k=<its postKey from /api/parties>` in the browser and check the JSON: accent `max`, the heading `Dynamax …`, Types and Weaknesses, the Power Spot under Where with its picture's Pine address.
+9. **The train.** Its blue edge, "Where · stop 2 of 5", the small print of the next stops, "Split off from" or "went its own way" linking the other train's post by its title; the third row Group… · Move… · Manage… · Split… · Route.
+10. **The meetup.** At its pin, "Meeting Information" as written, "Created by …".
+11. **Two raids at one gym.** The popup lists both raids by their headings and times; a choice shows its post with "← All raids here"; back lists them again. Under a gym that shows a raid there is "Report spawn here" and "Meetup here", no "Report raid".
+11a. **No jump.** Reload, then open a raid's popup at once: it opens with its post drawn (asked ahead), and does not move or pan when anything of it comes later; hover a line of the list, then click it: the same.
+12. **Light and dark.** Switch the device: the post follows, its edge keeps the post's color.
+13. **Times tick.** Leave a popup open two minutes: "Ends in 12 minutes" counts down.
+
+## The buttons
+
+14. **Statuses.** As Tester, press Interested, Join (the blurple runner), Here (green) and Leave (red) in the post: each does what the post's button does on Discord, the post on Discord changes, the popup follows within seconds. Done is off on an egg, Leave off for somebody not signed up.
+15. **Remote.** Toggles, "You: Coming · remote" under the post, as on Discord.
+16. **A newcomer in several groups.** With two groups, as a member not signed up: the "Which group?" menu is in the member's part; Join puts them in the group chosen; Group… goes to that menu.
+17. **Set time….** On a raid without times, as Tester signed up (or staff): the change form opens in the popup; as anybody else: "Do this on Discord →" under the buttons, linking the post.
+18. **On Discord.** −1, +1, Meet… and Split… show "Do this on Discord →" with the post's link; nothing is sent.
+19. **Move… and Manage….** As the train's conductor: Move… opens the moves panel in place of the buttons, Done brings them back; Manage… shows the conductor's buttons ("Be the conductor") and the kind's line on Discord; Route shows the stop list, the train's stop marked. Opened, they stay open when the list comes again (wait 20 s). As Tester, with Googer the conductor: Move… says "Only the conductor or staff can move the train."; wait for the next list with the line open after Googer gives up the role: it says "Sign up for the train to move it." (or nothing, signed up). As the conductor of a train whose route was cleared (`/route clear`) while the post still shows Move…: "The train has no route yet: add a stop first."
+19a. **Times in another zone.** With the computer set to another time zone (Pacific, or India), the raid report and change forms, the New train and New meetup forms say "Clock times are read in the server's zone (Eastern)." under their times, and the meetup editor "Starts now: 6:00 PM (Eastern)"; the posts show times in the computer's zone.
+20. **Change… and Edit….** A raid's Change… (boss, moves, times) and a meetup's Edit… still work from the member's part.
+
+## Pictures
+
+21. **Emoji.** The status, type, weather and team icons are pictures (`/emoji/<id>.png` in the network tab, not Discord's CDN), a day's cache aside; an emoji the application lacks shows its plain one or `:name:`.
+22. **Places.** The gym's and Power Spot's Wayfarer pictures come from `/s/<guild>/pictures/…`, never from Google; the page's CSP refuses nothing (the browser's console is clean).
+22a. **Barred.** Bar Tester from West's forum (an overwrite on the forum): Tester's `/api/parties` leaves West's parties out, and the post's address and the gym picture's address of one of them (copied from Googer's network tab) answer 404 for Tester. A split train whose other train is in a forum Tester is barred from names it "another post".
+
+## The map's line
+
+23. **Distance.** With your location shown ("Show where I am"), the line under the post says how far ("0.4 mi"), then Directions (Google Maps' route) and Open on Discord (the post, in the app).
+
+## The phone card
+
+24. **A party on a phone (360–414 px).** Tap a raid: a card docks at the bottom with the post's heading, picture, times and boss, the first row of buttons, "You: …" and the line; nothing else.
+25. **The whole post.** Tap "Show the whole post" or swipe the card up: the whole post, scrolling inside the card; swipe down: the summary again; swipe down once more, tap the map, or ×: it closes.
+26. **From the list.** List → a line: the map comes back at the party with the same card.
+27. **Buttons in the card.** Join and Leave work from the summary; Set time… opens its form in the card. Close the card with the form open (×, a tap on the map): then open another raid and press Report spawn here or Set time…: it opens (nothing stays held), and the map's lists come again.
+27a. **The card's manners.** A swipe up does not also toggle back; the marker tapped is above the card, not under it; with a keyboard (an iPad's), Escape in a field outside the card leaves the card open.
+28. **Light and dark** on the phone, Discord's in-app browser and the phone's own.
+
+## The list
+
+29. **Focus.** With a keyboard, focus a line of the list, then end its party on Discord (`/delete`): after the next poll the focus is on the list's sort, not lost.
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index c4866e8d8d0a0d8699095594c910629a6035c5d6..2fcd57fa64ce23f3c3fbdb09046aa68164376acd 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -2482,3 +2482,7 @@ Plan `docs/superpowers/plans/2026-10-26-phase-8r9-region-board.md` (Matt's go-ah
 - **Staging:** `2026-10-25-phase-8w6-staging.md`, not yet run (deploy the commands first for `/gym google`). The dev instance keeps a small budget for good (`googleLookupsPerMonth` 100, `googleLookupsReserve` 50, `googleGeocodesPerMonth` 50: staging step 29), since Google counts its free amounts per billing account.
 - **Before the cutover:** run `./pine import-history` before the bot's first start (runbook N4) so the first import's gyms go busiest region first.
 - **Minor, left:** a flaky timing test, `src/domain/pvp/rank.test.ts` ("… in well under half a second"), took 655 ms once under a full check (passes alone); `resume()` schedules without `hurry()` (start only, harmless); the second start catch leaves `gameData.startAutoRefresh()`'s timer running (older than 8W-6).
+
+## From Phase 8M-8A (a party's popup is its post; prototype, 2026-10-26)
+
+- **Question for Matt (review N5):** the design says a gym that shows a raid offers the raid, not "Report raid", so the map no longer offers "Report raid" under a gym's raids. Before 8M-8A it did, since an elite raid can be beside a standard one at the same gym. Should the map offer a way to report the second raid there (and how), or is `/raid` on Discord enough for that rare case?
````

## After the last task

- [ ] `npm run check > var/8m8a-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff a9142aea2b5ae522384f9166a70566b7438d56da HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
