# Phase 8S-4: Full Categories in the Region Import, and the Small Fixes from the 8S-3 Staging: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the must-fix found while staging the web map plans (`/region import` into a full category) and what the staging of 8S-3 left (2026-10-18). Matt asked for all of it on 2026-10-18 ("Go with all, up to but not including the cutover rehearsal"). No new feature. In detail:

- `/region import` and the region editor's save never plan more than Discord allows: a new channel whose category has no room for it and its forum goes into an overflow category `<name> 2` (`3` …), which copies the full category's permissions and sits right after it; a region without a forum in a full category keeps its outline and is told why it has no forum; the server's 500 channels are counted; what Discord still refuses is said plainly, naming the category.
- A held meetup approved but not made: the moderators' post names the reason (Matt's ruling, 2026-10-18), kept with the decision (migration 023).
- The web map: a train at a gym is a ring around it, so the gym's marker below stays reachable.
- `/location`'s use goes back when its Move it there was refused for lack of a post; the map's raid Change… gives its use back on an unexpected failure.
- The 8S-3 staging checklist set right; a staging checklist for 8S-4.

**Architecture:**

- **The import's plan** (`src/domain/regions/region-import.ts`, pure): room per category (`MAX_CATEGORY_CHANNELS`, forums count) and per server (`MAX_SERVER_CHANNELS`), forums of existing channels first; overflow categories by number, existing (without case, with room) or new, `like` naming the full category they continue; `ImportPlan.overflow` for the preview; new left-out reasons `category-full`, `server-full`, `copy-refused`; `forumBlocked` on an existing region whose forum has no room. `crowded` is gone.
- **Creating channels** (`RegionAdminService.createChannel`, `DiscordPartyGateway.createCategory` / `createChannel`): the planned category by id; an overflow category created with the base's permission overwrites and moved after it; Discord's refusals mapped by `channelLimitOf` (`CHANNEL_PARENT_MAX_CHANNELS`, the server's code) into `category-full` / `server-full`.
- **Meetup safety:** `ApprovalOutcome` carries an `ApprovalFailure` (a closed set of kinds); `MeetupRequest.failure` (JSON, nullable, migration 023) keeps it; `outcomeOf` words it in the post.
- **The map's page:** the rings (meetups and trains) on `RING_PANE` with one shared SVG renderer, unfilled, so a click inside reaches the marker below.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely on MySQL 8.4, Leaflet 1.9.4, Vitest. No new dependency, **migration 023** (`2026_10_18_023_meetup_request_failure`, additive, idempotent), no command change (no deploy), party state stays at version 11.

**Spec:** the brief `.superpowers/sdd/2026-10-18-phase-8s4-small-fixes/design.md` (git-ignored), from the follow-ups "From the staging run of the web map plans" (the must-fix), "From Phase 8S-3" and "From the staging run of 8S-3".

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8s4`, tip `c49d1ee1`), one commit per task, on typescript-migration 8ab3b9d5. Each commit typechecks (both tsconfigs); on the tip the full check (7,946 tests), the build and the database suite (488) are clean.

**Reviews:** an Opus reviewer went through the prototype (S4-1..S4-7: two Important), then the first fix round (F1-1..F1-3, Minor), then the second (nothing new: ready); every finding is folded into the commits below.

## Decisions in this plan

These were made while prototyping and reviewing, for Matt to look at:

1. **Overflow, not refusal:** a new channel whose category is full goes into `<name> 2` (then `3` …): an existing category of that name with room, else a new one that later areas share. It copies the full category's permission overwrites from its first moment and is placed right after it; if Discord refuses the copy, those areas are left out (`copy-refused`) and the answer names both categories and what the bot needs.
2. **A forum never goes into another category than its channel's** (it would take that category's permissions): a new region on an existing channel in a full category is left out (`category-full`); an existing region keeps its outline and "keeps no forum" until channels are moved out and `/admin setup-forums` runs.
3. **The server's 500 channels** are counted too, so Import is never offered for what Discord would refuse.
4. **The failed approval's reason** is stored as a kind (`bad-name`, `bad-description`, `no-region`, `no-forum`, `no-post`, `error`, or `posts-refused` with the forum and what is missing), worded when the post is drawn; older rows keep today's line. The moderator's private answer and the maker's DM keep their wording.
5. **The train's ring:** radius 8.5, weight 3, between the gym's dot and a meetup's ring; a train not yet at a stop is a pale dashed ring. The click target is the 3 px stroke (a trade-off noted in `web.md`; the route line and the side panel open the train too).
6. **`/location`:** when Move it there is refused because no post could be made, the press and the `/location` use both go back; once the move answered, a later failure is logged and nothing goes back.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8s4`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **The room counting:** never more than 50 in a category (forums count) or 500 in the server; an existing region never loses its outline update for want of room.
2. **Permissions:** an overflow category is never open where the category it continues is closed.
3. **Migration 023:** additive, idempotent; the repository and its memory twin agree.
4. **Give-backs:** never for a use whose effect landed.

### Task 1: Plan 8S-4 T1: Region import: full categories make room in an overflow category

Prototype commit: `485f4e045e6c2bf96ec12001fda28d634beca395`

The plan counts the room of every category (50, forums included) and of
the server (500): the forums of channels that exist take their room
first, and one whose category is full leaves its area out
(category-full); a new channel whose category has no room for it and
its forum goes into "<name> 2" (then 3 ...), one that exists with room
or a new one. What would take the server beyond its channels is left
out (server-full). The preview says in one line why channels go into
the overflow category, and why areas are left out; the crowded warning
is gone, since nothing is planned beyond what Discord allows.

**Files:**

```
 src/commands/regions/import.more.test.ts      |  94 +++++++++++-
 src/commands/regions/import.ts                | 106 +++++++++++++-
 src/domain/regions/region-import.more.test.ts |  15 +-
 src/domain/regions/region-import.test.ts      | 175 ++++++++++++++++++++++
 src/domain/regions/region-import.ts           | 365 ++++++++++++++++++++++++++++++++++------------
 5 files changed, 646 insertions(+), 109 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/regions/import.more.test.ts src/domain/regions/region-import.more.test.ts src/domain/regions/region-import.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 485f4e045e6c2bf96ec12001fda28d634beca395 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-4 T1: Region import: full categories make room in an overflow category`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/regions/import.more.test.ts b/src/commands/regions/import.more.test.ts
index f2ef4e34..62f4cf38 100644
--- a/src/commands/regions/import.more.test.ts
+++ b/src/commands/regions/import.more.test.ts
@@ -8,7 +8,7 @@ import {
 } from '../../../test/support/fake-interactions.js';
 import { answerOf, buttonId, buttonsOf } from '../../../test/support/gym-commands.js';
 import { expectV2Sendable } from '../../../test/support/post-limits.js';
-import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
+import { UNBOUNDED_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { testRaid } from '../../../test/support/parties.js';
 import {
   REGION_STAFF,
@@ -131,15 +131,97 @@ describe('/region import: the preview, as review B asked', () => {
     expect(regionSaid(answer)).not.toContain('Regions that are not in this file');
   });
 
-  it('warns of a category that would hold more than Discord allows', async () => {
+  it('says which new channels go into the next category, and why, when theirs has no room', async () => {
     const made = await regionCommandsWith();
     made.gateway.addChannel('k9', 'Full', { kind: 'category' });
-    for (let i = 0; i < 49; i++)
+    for (let i = 0; i < 47; i++)
       made.gateway.addChannel(`full${i}`, `full-${i}`, { categoryId: 'k9' });
-    const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
+    const { answer } = await importing(made, [
+      area('One More', far(1), 'Full'),
+      area('Two More', far(2), 'Full'),
+      area('Three More', far(3), 'Full'),
+    ]);
+    expect(regionSaid(answer).split('\n').slice(3)).toEqual([
+      'I would **create 1 category**: `Full 2`.',
+      'I would **create 3 forums**, one for each region that has none.',
+      'The category `Full` has room for 3 more channels (Discord allows 50 in a category, and ' +
+        'forums count), and a new region takes two, its channel and its forum: so 2 new ' +
+        'channels go into `Full 2`, a new category with the permissions of `Full`, right after it.',
+    ]);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      '- One More → **new channel** `#one-more` in the category `Full` · 0 gyms · gets a forum',
+      '- Two More → **new channel** `#two-more` in the new category `Full 2` · 0 gyms · gets a forum',
+      '- Three More → **new channel** `#three-more` in the new category `Full 2` · 0 gyms · gets a forum',
+    ]);
+    expect(buttonsOf(answer)[0]?.[0]).toBe('Import and create 3 channels, 1 category, 3 forums');
+  });
+
+  it('imports a region whose full category has no room for its forum, and says it keeps none', async () => {
+    const made = await regionCommandsWith();
+    // Town holds West, East and the region without an outline, and the forums of West and East.
+    const inTown = (made.gateway.serverChannels(made.gateway.guildId) ?? []).filter(
+      (channel) => channel.categoryId === TOWN_CATEGORY,
+    ).length;
+    for (let i = inTown; i < 50; i++)
+      made.gateway.addChannel(`town${i}`, `town-${i}`, { categoryId: TOWN_CATEGORY });
+    const { answer } = await importing(made, [area('Unbounded', far(1))]);
+    expect(listed(answer, 'Would be imported')).toEqual([
+      `- Unbounded → <#${UNBOUNDED_CHANNEL}> · new outline · 0 gyms · **keeps no forum**: its ` +
+        'category `Town` is full',
+    ]);
+    expect(regionSaid(answer)).toContain(
+      '1 region keeps no forum for now (under "Would be imported"): its category is full, and ' +
+        'Discord allows 50 channels in a category, forums included. Move some channels out of ' +
+        'it, then run `/admin setup-forums`.',
+    );
+    expect(regionSaid(answer)).not.toContain('create 1 forum');
+    expect(buttonsOf(answer)[0]?.[0]).toBe('Import');
+  });
+
+  it('says that the one place left goes to the forum of a region that has none', async () => {
+    const made = await regionCommandsWith();
+    const inTown = (made.gateway.serverChannels(made.gateway.guildId) ?? []).filter(
+      (channel) => channel.categoryId === TOWN_CATEGORY,
+    ).length;
+    for (let i = inTown; i < 49; i++)
+      made.gateway.addChannel(`town${i}`, `town-${i}`, { categoryId: TOWN_CATEGORY });
+    const { answer } = await importing(made, [
+      area('Unbounded', far(1)),
+      area('River Side', far(2), 'Town'),
+    ]);
     expect(regionSaid(answer)).toContain(
-      'The category `Full` would hold 51 channels and forums, and Discord allows 50: what is ' +
-        'more is refused. Put some of these areas into another category.',
+      'The category `Town` has room for 1 more channel (Discord allows 50 in a category, and ' +
+        'forums count), and the forum of a region that has none takes it: so 1 new channel ' +
+        'goes into `Town 2`, a new category with the permissions of `Town`, right after it.',
+    );
+  });
+
+  it('says plainly what a full category or server leaves out', async () => {
+    const made = await regionCommandsWith();
+    // South's channel in a category filled to the last place: its forum has none.
+    made.gateway.addChannel('k8', 'Packed', { kind: 'category' });
+    made.gateway.addChannel(SOUTH_CHANNEL, 'south', { categoryId: 'k8' });
+    for (let i = 0; i < 49; i++)
+      made.gateway.addChannel(`packed${i}`, `packed-${i}`, { categoryId: 'k8' });
+    const { answer } = await importing(made, [area('South', SOUTH_RING)]);
+    expect(listed(answer, 'Left out')).toEqual([
+      `- South: \`#south\` would get its forum beside it, and its category \`Packed\` is full`,
+    ]);
+    expect(regionSaid(answer)).toContain(
+      '1 area needs a forum in a full category (under "Left out"): Discord allows 50 channels ' +
+        'in a category, and forums count. Move some channels out of that category, or move ' +
+        'the region’s channel into one with room, and import again.',
+    );
+    expect(buttonsOf(answer)).toEqual([]);
+
+    for (let i = 0; i < 500; i++) made.gateway.addChannel(`many${i}`, `many-${i}`);
+    const crowded = await importing(made, [area('River Side', far(1))]);
+    expect(listed(crowded.answer, 'Left out')).toEqual([
+      '- River Side: the server has no room for what it needs',
+    ]);
+    expect(regionSaid(crowded.answer)).toContain(
+      'The server has no room for 1 area (under "Left out"): Discord allows 500 channels in a ' +
+        'server, and forums and categories count. Delete channels nobody uses, and import again.',
     );
   });
 
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
index fa5a2dff..b0d97592 100644
--- a/src/commands/regions/import.ts
+++ b/src/commands/regions/import.ts
@@ -22,6 +22,7 @@ import type { Worded } from '../../domain/web/editor-data.js';
 import {
   MAX_CATEGORY_CHANNELS,
   MAX_NEW_CHANNELS,
+  MAX_SERVER_CHANNELS,
   type LeftOut,
   type LeftOutReason,
   type PlannedImport,
@@ -139,10 +140,20 @@ function leftOutText(left: LeftOut): string {
     'other-channel': 'it stands for another channel',
     waits: `${channel} waits for the next import`,
     'not-allowed': `there is no channel ${channel}, and you may not create one`,
+    'category-full':
+      `${channel} would get its forum beside it, and its category ` +
+      `${derived(left.category ?? '')} is full`,
+    'server-full': 'the server has no room for what it needs',
   };
   return reasons[left.reason];
 }
 
+/** Names as a list in a sentence: "a", "a and b", "a, b, and c". */
+function andList(items: readonly string[]): string {
+  if (items.length <= 2) return items.join(' and ');
+  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1) ?? ''}`;
+}
+
 /** A name from a file as an answer shows it: as text, cut, never empty. */
 function shown(name: string): string {
   return name === '' ? '(no name)' : plain(truncate(name, NAME_SHOWN));
@@ -182,7 +193,13 @@ function plannedLine(planned: PlannedImport): string {
       ? []
       : planned.adoptForum
         ? [`takes back its forum <#${planned.adoptForum.id}>`]
-        : ['gets a forum']),
+        : planned.forumBlocked
+          ? [
+              'category' in planned.forumBlocked
+                ? `**keeps no forum**: its category ${derived(planned.forumBlocked.category)} is full`
+                : '**keeps no forum**: the server is full',
+            ]
+          : ['gets a forum']),
     ...(planned.nearMiss === undefined
       ? []
       : [`**did you mean ${derived(`#${planned.nearMiss}`)}?**`]),
@@ -329,11 +346,86 @@ export function previewWords(
       `I would **create ${count(preview.newForums, 'forum')}**, one for each region that has none.`,
     );
   }
-  for (const crowded of preview.crowded) {
+  for (const overflow of preview.overflow) {
+    const moved = count(overflow.channels, 'new channel');
+    // The overflow categories this import makes: they copy the permissions of the one they
+    // continue, and stand right after it.
+    const made = overflow.into.filter((name) =>
+      imports.some((one) => {
+        const category = 'create' in one.channel ? one.channel.create.category : null;
+        return category !== null && 'create' in category && category.create === name;
+      }),
+    );
+    const copied = `with the permissions of ${derived(overflow.category)}, right after it`;
+    const copies =
+      made.length === 0
+        ? ''
+        : overflow.into.length === 1
+          ? `, a new category ${copied}`
+          : ` (${andList(made.map((name) => derived(name)))} new, ${copied})`;
+    const goes =
+      `${moved} ${overflow.channels === 1 ? 'goes' : 'go'} into ` +
+      `${andList(overflow.into.map((name) => derived(name)))}${copies}`;
+    const forums =
+      overflow.forums === 0
+        ? ''
+        : overflow.forums === overflow.room
+          ? overflow.room === 1
+            ? ', and the forum of a region that has none takes it'
+            : ', and the forums of regions that have none take all of them'
+          : `, ${overflow.forums} of them for the ` +
+            `${overflow.forums === 1 ? 'forum of a region' : 'forums of regions'} that ` +
+            `${overflow.forums === 1 ? 'has' : 'have'} none`;
+    const takes =
+      overflow.room > overflow.forums
+        ? ', and a new region takes two, its channel and its forum'
+        : '';
+    lines.push(
+      overflow.room === 0
+        ? `The category ${derived(overflow.category)} is full (Discord allows ` +
+            `${MAX_CATEGORY_CHANNELS} channels in a category, and forums count), so ${goes}.`
+        : `The category ${derived(overflow.category)} has room for ` +
+            `${count(overflow.room, 'more channel')} (Discord allows ${MAX_CATEGORY_CHANNELS} ` +
+            `in a category, and forums count)${forums}${takes}: so ${goes}.`,
+    );
+  }
+  const blocked = imports.filter((one) => one.forumBlocked !== undefined);
+  const byCategory = blocked.filter(
+    (one) => one.forumBlocked !== undefined && 'category' in one.forumBlocked,
+  ).length;
+  if (byCategory > 0) {
+    lines.push(
+      `${byCategory === 1 ? '1 region keeps' : `${byCategory} regions keep`} no forum for now ` +
+        `(under "Would be imported"): ${byCategory === 1 ? 'its category is' : 'their categories are'} ` +
+        `full, and Discord allows ${MAX_CATEGORY_CHANNELS} channels in a category, forums ` +
+        `included. Move some channels out of ${byCategory === 1 ? 'it' : 'them'}, then run ` +
+        '`/admin setup-forums`.',
+    );
+  }
+  if (blocked.length > byCategory) {
+    const n = blocked.length - byCategory;
+    lines.push(
+      `${n === 1 ? '1 region keeps' : `${n} regions keep`} no forum for now (under "Would be ` +
+        `imported"): the server has as many channels as Discord allows (${MAX_SERVER_CHANNELS}). ` +
+        'Delete channels nobody uses, then run `/admin setup-forums`.',
+    );
+  }
+  const again = from === 'file' ? 'import again' : 'save again';
+  const categoryFull = leftOut.filter((left) => left.reason === 'category-full').length;
+  if (categoryFull > 0) {
+    lines.push(
+      `${categoryFull === 1 ? '1 area needs' : `${categoryFull} areas need`} a forum in a full ` +
+        `category (under "Left out"): Discord allows ${MAX_CATEGORY_CHANNELS} channels in a ` +
+        'category, and forums count. Move some channels out of that category, or move the ' +
+        `region’s channel into one with room, and ${again}.`,
+    );
+  }
+  const serverFull = leftOut.filter((left) => left.reason === 'server-full').length;
+  if (serverFull > 0) {
     lines.push(
-      `The category ${derived(crowded.name)} would hold ${crowded.channels} channels and ` +
-        `forums, and Discord allows ${MAX_CATEGORY_CHANNELS}: what is more is refused. Put ` +
-        'some of these areas into another category.',
+      `The server has no room for ${count(serverFull, 'area')} (under "Left out"): Discord ` +
+        `allows ${MAX_SERVER_CHANNELS} channels in a server, and forums and categories count. ` +
+        `Delete channels nobody uses, and ${again}.`,
     );
   }
   if (preview.stranded > 0) {
@@ -660,7 +752,9 @@ export const importRegions: SubcommandPart = {
       'import would do before anything is changed: which channels get a new outline, which ' +
       'become regions, how many gyms lie in each, and what is left out and why. For a name ' +
       'that no channel has I create the channel (if you may manage channels), in the ' +
-      'category the shape’s description names (or one named after the shape); the preview ' +
+      'category the shape’s description names (or one named after the shape), or, when that ' +
+      `category is full (Discord allows ${MAX_CATEGORY_CHANNELS} channels in one, and forums ` +
+      'count), in the next of its name ("North 2"); the preview ' +
       'lists every channel and category it would create, and the button says how many. One ' +
       `import creates at most ${MAX_NEW_CHANNELS} channels: import the same file again for ` +
       'the rest. Every region that has no forum gets one (or takes back the forum it had, ' +
diff --git a/src/domain/regions/region-import.more.test.ts b/src/domain/regions/region-import.more.test.ts
index 98b6075e..81ab3bfe 100644
--- a/src/domain/regions/region-import.more.test.ts
+++ b/src/domain/regions/region-import.more.test.ts
@@ -112,7 +112,7 @@ describe('planImport: what staff should look at twice', () => {
     expect(made.newForums).toBe(2);
   });
 
-  it('warns of a category that would hold more channels than Discord allows', () => {
+  it('never plans a category beyond what Discord allows: the rest goes into its overflow', () => {
     const channels: ServerChannel[] = [
       { id: 'k1', name: 'Full', kind: 'category', categoryId: null },
       ...Array.from({ length: 47 }, (_unused, i) => text(`c${i}`, `old-${i}`, 'k1')),
@@ -123,9 +123,16 @@ describe('planImport: what staff should look at twice', () => {
       area('Three', square(43, -81, 43.1, -80.9), { description: 'Roomy' }),
     ];
     const made = plan({ areas, channels });
-    // 47 there, 2 new channels and their 2 forums.
-    expect(made.crowded).toEqual([{ name: 'Full', channels: 51 }]);
-    expect(plan({ areas: areas.slice(1), channels }).crowded).toEqual([]);
+    // 47 there: room for one new channel and its forum, not for two.
+    expect(made.imports.map((one) => one.channel)).toEqual([
+      { create: { category: { id: 'k1', name: 'Full' } } },
+      { create: { category: { create: 'Full 2', like: 'k1' } } },
+      { create: { category: { create: 'Roomy' } } },
+    ]);
+    expect(made.overflow).toEqual([
+      { category: 'Full', room: 3, forums: 0, channels: 1, into: ['Full 2'] },
+    ]);
+    expect(plan({ areas: areas.slice(1), channels }).overflow).toEqual([]);
   });
 
   it('plans an import of large outlines over many gyms in well under a second', () => {
diff --git a/src/domain/regions/region-import.test.ts b/src/domain/regions/region-import.test.ts
index e4a156ea..8d1d587b 100644
--- a/src/domain/regions/region-import.test.ts
+++ b/src/domain/regions/region-import.test.ts
@@ -357,3 +357,178 @@ describe('planImport', () => {
     expect(made.raidsOutside).toBe(1);
   });
 });
+
+describe('planImport: full categories', () => {
+  const forum = (id: string, name: string, categoryId: string | null): ServerChannel => ({
+    id,
+    name,
+    kind: 'forum',
+    categoryId,
+  });
+  /** A category holding `count` channels and forums, half of each (regions with their forums). */
+  const filled = (id: string, name: string, count: number): ServerChannel[] => [
+    category(id, name),
+    ...Array.from({ length: count }, (_unused, i) =>
+      i % 2 === 0 ? text(`${id}-t${i}`, `${id}-old-${i}`, id) : forum(`${id}-f${i}`, `f-${i}`, id),
+    ),
+  ];
+  const away = (i: number) => square(41 + i * 0.01, -81, 41.005 + i * 0.01, -80.9);
+  const areasIn = (description: string, count: number, from = 0): KmlArea[] =>
+    Array.from({ length: count }, (_unused, i) =>
+      area(`Place ${i + from}`, away(i + from), { description }),
+    );
+
+  it('puts new channels into an overflow category when theirs is full, as staging met it', () => {
+    // 25 regions and their 25 forums fill the category; the file's last 3 areas are new.
+    const made = plan({
+      areas: areasIn('Pittsburgh staging', 3),
+      channels: filled('k1', 'Pittsburgh staging', 50),
+    });
+    expect(made.leftOut).toEqual([]);
+    expect(made.imports.map((planned) => planned.channel)).toEqual([
+      { create: { category: { create: 'Pittsburgh staging 2', like: 'k1' } } },
+      { create: { category: { create: 'Pittsburgh staging 2', like: 'k1' } } },
+      { create: { category: { create: 'Pittsburgh staging 2', like: 'k1' } } },
+    ]);
+    expect(made.newCategories).toEqual(['Pittsburgh staging 2']);
+    expect(made.overflow).toEqual([
+      {
+        category: 'Pittsburgh staging',
+        room: 0,
+        forums: 0,
+        channels: 3,
+        into: ['Pittsburgh staging 2'],
+      },
+    ]);
+  });
+
+  it('fills a category to the last pair of places, and puts the rest into the overflow', () => {
+    const made = plan({ areas: areasIn('town', 3), channels: filled('k1', 'Town', 45) });
+    // 5 places: two new regions with their forums; the third would need 2 of the 1 left.
+    expect(made.imports.map((planned) => planned.channel)).toEqual([
+      { create: { category: { id: 'k1', name: 'Town' } } },
+      { create: { category: { id: 'k1', name: 'Town' } } },
+      { create: { category: { create: 'Town 2', like: 'k1' } } },
+    ]);
+    expect(made.overflow).toEqual([
+      { category: 'Town', room: 5, forums: 0, channels: 1, into: ['Town 2'] },
+    ]);
+  });
+
+  it('takes an overflow category that exists and has room, by name without case', () => {
+    const made = plan({
+      areas: areasIn('Town', 2),
+      channels: [...filled('k1', 'Town', 50), ...filled('k2', 'town 2', 40)],
+    });
+    expect(made.imports.map((planned) => planned.channel)).toEqual([
+      { create: { category: { id: 'k2', name: 'town 2' } } },
+      { create: { category: { id: 'k2', name: 'town 2' } } },
+    ]);
+    expect(made.newCategories).toEqual([]);
+    expect(made.overflow).toEqual([
+      { category: 'Town', room: 0, forums: 0, channels: 2, into: ['town 2'] },
+    ]);
+  });
+
+  it('goes on to the next number when the overflow category is full too', () => {
+    const made = plan({
+      areas: areasIn('Town', 3),
+      channels: [...filled('k1', 'Town', 50), ...filled('k2', 'Town 2', 48)],
+    });
+    expect(made.imports.map((planned) => planned.channel)).toEqual([
+      { create: { category: { id: 'k2', name: 'Town 2' } } },
+      { create: { category: { create: 'Town 3', like: 'k1' } } },
+      { create: { category: { create: 'Town 3', like: 'k1' } } },
+    ]);
+    expect(made.newCategories).toEqual(['Town 3']);
+    expect(made.overflow).toEqual([
+      { category: 'Town', room: 0, forums: 0, channels: 3, into: ['Town 2', 'Town 3'] },
+    ]);
+  });
+
+  it('keeps the name of an overflow category within what Discord takes', () => {
+    const long = 'L'.repeat(100);
+    const made = plan({ areas: areasIn(long, 1), channels: filled('k1', long, 50) });
+    expect(made.newCategories).toEqual([`${'L'.repeat(98)} 2`]);
+  });
+
+  it('leaves out a new region on a channel whose full category has no room for its forum', () => {
+    const channels = [...filled('k1', 'Town', 49), text('c1', 'west-end', 'k1')];
+    const made = plan({ areas: [area('West End')], channels });
+    expect(made.imports).toEqual([]);
+    expect(made.leftOut).toEqual([
+      { name: 'West End', channelName: 'west-end', reason: 'category-full', category: 'Town' },
+    ]);
+    expect(made.newForums).toBe(0);
+  });
+
+  it('gives a region that is one already its new outline, its forum blocked by the full category', () => {
+    const channels = [...filled('k1', 'Town', 49), text('c1', 'west-end', 'k1')];
+    const made = plan({
+      areas: [area('West End')],
+      channels,
+      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: null }],
+    });
+    expect(made.leftOut).toEqual([]);
+    expect(made.imports).toMatchObject([
+      { name: 'West End', regionId: 1, hasForum: false, forumBlocked: { category: 'Town' } },
+    ]);
+    expect(made.newForums).toBe(0);
+    // One that has its forum, or takes back the one it had, needs no room.
+    const withForum = plan({
+      areas: [area('West End')],
+      channels: [...channels.slice(0, -2), forum('f9', 'west-end-raids', 'k1'), channels[50]!],
+      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: null }],
+      orphanForums: ['f9'],
+      forumSuffix: '-raids',
+    });
+    expect(withForum.leftOut).toEqual([]);
+    expect(withForum.imports[0]?.adoptForum).toEqual({ id: 'f9', name: 'west-end-raids' });
+  });
+
+  it('keeps the room of an existing channel’s forum before a new channel takes it', () => {
+    const made = plan({
+      areas: [area('New One', away(1), { description: 'Town' }), area('West End')],
+      channels: [...filled('k1', 'Town', 47), text('c1', 'west-end', 'k1')],
+      regions: [{ id: 1, guildId: 1, channelId: 'c1', forumChannelId: null, bounds: null }],
+    });
+    // 2 places left: West End's forum takes 1, so New One goes into Town 2.
+    expect(made.leftOut).toEqual([]);
+    expect(made.imports.map((planned) => [planned.name, planned.channel])).toEqual([
+      ['New One', { create: { category: { create: 'Town 2', like: 'k1' } } }],
+      ['West End', { id: 'c1' }],
+    ]);
+    expect(made.newForums).toBe(2);
+    // The room the category had, and how much of it the forums of its regions take.
+    expect(made.overflow).toEqual([
+      { category: 'Town', room: 2, forums: 1, channels: 1, into: ['Town 2'] },
+    ]);
+  });
+
+  it('makes no copy of a category that did not exist: a new one has nothing to copy', () => {
+    const made = plan({ areas: areasIn('Fresh', 26) });
+    // 25 channels at most in one import: one new category, no overflow, no copy.
+    expect(made.newCategories).toEqual(['Fresh']);
+    expect(made.imports[0]?.channel).toEqual({ create: { category: { create: 'Fresh' } } });
+  });
+
+  it('leaves out what would take the server beyond its 500 channels', () => {
+    const many = Array.from({ length: 497 }, (_unused, i) => text(`m${i}`, `many-${i}`));
+    const made = plan({
+      areas: [area('New One', away(1)), area('New Two', away(2), { description: 'many-0' })],
+      channels: [...many, category('k1', 'Lots')],
+    });
+    // New One needs its channel, its forum and its category (3 of the 2 left); so does New Two.
+    expect(made.imports).toEqual([]);
+    expect(made.leftOut.map((left) => [left.name, left.reason])).toEqual([
+      ['New One', 'server-full'],
+      ['New Two', 'server-full'],
+    ]);
+    const roomy = plan({
+      areas: [area('New One', away(1), { description: 'Lots' })],
+      channels: [...many, category('k1', 'Lots')],
+    });
+    // In a category that exists: its channel and its forum, the last two places.
+    expect(roomy.leftOut).toEqual([]);
+  });
+});
diff --git a/src/domain/regions/region-import.ts b/src/domain/regions/region-import.ts
index 0d64e338..758e9c42 100644
--- a/src/domain/regions/region-import.ts
+++ b/src/domain/regions/region-import.ts
@@ -55,6 +55,8 @@ export const MAX_NEW_CHANNELS = 25;
 
 /** How many channels (forums included) Discord lets a category hold. */
 export const MAX_CATEGORY_CHANNELS = 50;
+/** How many channels (forums and categories included, threads not) Discord lets a server hold. */
+export const MAX_SERVER_CHANNELS = 500;
 /** How far the name of a new channel may be from another name to be asked about. */
 const NEAR_MISS = 2;
 
@@ -115,8 +117,13 @@ export interface ImportInput {
   removing?: readonly number[];
 }
 
-/** The category of a channel that is to be created: one that exists, or one to create. */
-export type PlannedCategory = { id: string; name: string } | { create: string } | null;
+/**
+ * The category of a channel that is to be created: one that exists, or one to create. A new
+ * overflow category (`<name> 2` …) names the category it continues (`like`, by id): it is made
+ * with that category's permissions, right after it (plan 8S-4).
+ */
+export type PlannedCategory =
+  { id: string; name: string } | { create: string; like?: string } | null;
 
 /** Where an area goes: a channel that exists, or one to create. */
 export type PlannedChannel = { id: string } | { create: { category: PlannedCategory } };
@@ -154,6 +161,12 @@ export interface PlannedImport {
    * file would make a second channel; this is what it may have meant.
    */
   nearMiss?: string;
+  /**
+   * For a region that is one already and has no forum: why it keeps none for now (plan 8S-4),
+   * its channel's category full (`category`, its name) or the server (`server`). Its outline
+   * is written all the same; the forum is tried again (`/admin setup-forums`) once there is room.
+   */
+  forumBlocked?: { category: string } | { server: true };
 }
 
 /**
@@ -164,7 +177,10 @@ export interface PlannedImport {
  * name and the bot may not create one; `other-channel`: the import is for one channel, and this
  * area stands for another; `waits`: its channel would be created, but this import creates
  * `MAX_NEW_CHANNELS` already; `not-allowed`: no channel has the name, and the staff member may
- * not create channels (`staffMayCreate`).
+ * not create channels (`staffMayCreate`); `category-full`: its channel exists, is no region yet
+ * and would get a forum, which goes where the channel is, and the channel's category
+ * (`LeftOut.category`) has no room for it; `server-full`: what it needs created (its channel, its
+ * forum, its category) would take the server beyond `MAX_SERVER_CHANNELS`.
  */
 export type LeftOutReason =
   | 'no-name'
@@ -175,12 +191,30 @@ export type LeftOutReason =
   | 'cannot-create'
   | 'other-channel'
   | 'waits'
-  | 'not-allowed';
+  | 'not-allowed'
+  | 'category-full'
+  | 'server-full';
 
 export interface LeftOut {
   name: string;
   channelName: string;
   reason: LeftOutReason;
+  /** With `category-full`: the name of the full category. */
+  category?: string;
+}
+
+/**
+ * A category that had no room for all the new channels the file names it for, so that some of
+ * them go into its overflow categories (`<name> 2`, `<name> 3` …): its name, how many places
+ * (channels and forums) it had left for them, how many new channels go elsewhere, and where.
+ */
+export interface Overflow {
+  category: string;
+  /** The places it had before this import, `forums` of them taken by its regions' new forums. */
+  room: number;
+  forums: number;
+  channels: number;
+  into: string[];
 }
 
 export interface ImportPlan {
@@ -200,11 +234,10 @@ export interface ImportPlan {
    */
   newForums: number;
   /**
-   * The categories that would hold more channels than Discord allows
-   * (`MAX_CATEGORY_CHANNELS`, forums included), with how many: what they have, the channels
-   * that would be created in them, and the forums of the regions whose channel is in them.
+   * The categories some new channels do not go into for lack of room (`MAX_CATEGORY_CHANNELS`,
+   * forums included), and where they go instead.
    */
-  crowded: { name: string; channels: number }[];
+  overflow: Overflow[];
   /**
    * With a `target`: none of several areas stands for the channel, or several do. Nothing
    * is imported then.
@@ -221,11 +254,27 @@ function sameRing(a: readonly LatLon[] | null, b: readonly LatLon[]): boolean {
   );
 }
 
-/** An area with the channel it goes to, before the counts. */
+/**
+ * An area with the channel it goes to, before the counts. A channel to create has its category
+ * decided once the room of the categories is known (`wanted`: the name its area gives).
+ */
 interface Placed {
   area: KmlArea;
   channelName: string;
   channel: PlannedChannel;
+  wanted?: string | null;
+}
+
+/**
+ * The name of the `n`th category of a name (`n` from 2): `<name> n`, the name cut to keep it
+ * within what Discord takes.
+ */
+function overflowName(name: string, n: number): string {
+  const suffix = ` ${n}`;
+  return `${[...name]
+    .slice(0, MAX_CHANNEL_NAME - suffix.length)
+    .join('')
+    .trimEnd()}${suffix}`;
 }
 
 /**
@@ -242,6 +291,17 @@ interface Placed {
  * not create channels; of more than `MAX_NEW_CHANNELS` the later ones wait. With `target` the
  * file is for that one channel: its only area, or the
  * one area whose name stands for the channel; nothing is created.
+ *
+ * Every region written that has no forum gets one, where its channel is, and Discord allows
+ * `MAX_CATEGORY_CHANNELS` channels and forums in a category and `MAX_SERVER_CHANNELS` in a
+ * server. The forums of channels that exist take their room first: one whose category is full
+ * would make a new region without a forum, so it leaves its area out (`category-full`; a forum in
+ * another category would not have the channel's permissions); a region that is one already gets
+ * its outline, its forum `forumBlocked` until there is room. A new channel whose category has no
+ * room for it and its forum goes into the overflow category `<name> 2` (then `<name> 3` …): one
+ * of that name that exists and has room, or a new one (`like` the category it continues), which
+ * the areas after it share (`ImportPlan.overflow`). What would take the server beyond its
+ * channels is left out (`server-full`), or, for a region already, blocks its forum.
  */
 export function planImport(input: ImportInput): ImportPlan {
   const { areas, channels, regions, guildId, gyms, raids, target } = input;
@@ -272,14 +332,11 @@ export function planImport(input: ImportInput): ImportPlan {
       const key = channelKey(channel.name);
       byKey.set(key, [...(byKey.get(key) ?? []), channel]);
     }
-    const categories = channels.filter((channel) => channel.kind === 'category');
     const areasOf = new Map<string, number>();
     for (const area of areas) {
       const key = channelNameFor(area.name);
       areasOf.set(key, (areasOf.get(key) ?? 0) + 1);
     }
-    /** The categories that would be created, by key: areas of one category share it. */
-    const planned = new Map<string, string>();
     let creating = 0;
     for (const area of areas) {
       const channelName = channelNameFor(area.name);
@@ -311,19 +368,12 @@ export function planImport(input: ImportInput): ImportPlan {
         leave('waits');
       } else {
         creating++;
-        const wanted = categoryNameFor(area);
-        let category: PlannedCategory = null;
-        if (wanted !== null) {
-          const key = categoryKey(wanted);
-          const existing = categories.find((candidate) => categoryKey(candidate.name) === key);
-          if (existing) {
-            category = { id: existing.id, name: existing.name };
-          } else {
-            if (!planned.has(key)) planned.set(key, wanted);
-            category = { create: planned.get(key) ?? wanted };
-          }
-        }
-        placed.push({ area, channelName, channel: { create: { category } } });
+        placed.push({
+          area,
+          channelName,
+          channel: { create: { category: null } },
+          wanted: categoryNameFor(area),
+        });
       }
     }
   }
@@ -331,7 +381,7 @@ export function planImport(input: ImportInput): ImportPlan {
   // The regions of this server as they are, and which of them get another outline.
   const own = regions.filter((region) => region.guildId === guildId);
   const imports: PlannedImport[] = [];
-  const accepted: { placed: Placed; region: PlannedRegion | undefined }[] = [];
+  let accepted: { placed: Placed; region: PlannedRegion | undefined }[] = [];
   for (const one of placed) {
     const channelId = 'id' in one.channel ? one.channel.id : undefined;
     const region =
@@ -342,6 +392,195 @@ export function planImport(input: ImportInput): ImportPlan {
     }
     accepted.push({ placed: one, region });
   }
+
+  // The forums that are there, by id: a region whose forum was deleted by hand has none.
+  const forums = new Map(
+    channels.filter((channel) => channel.kind === 'forum').map((forum) => [forum.id, forum]),
+  );
+  const orphans = (input.orphanForums ?? []).flatMap((id) => {
+    const forum = forums.get(id);
+    return forum ? [forum] : [];
+  });
+  /** The one forum of a removed region in this category that a channel would take back. */
+  const adoptIn = (
+    categoryId: string | null,
+    channelName: string,
+  ): { id: string; name: string } | undefined => {
+    const wanted = channelKey(`${channelName}${input.forumSuffix ?? ''}`);
+    const fitting = orphans.filter(
+      (forum) => forum.categoryId === categoryId && channelKey(forum.name) === wanted,
+    );
+    const [only] = fitting;
+    return fitting.length === 1 && only ? { id: only.id, name: only.name } : undefined;
+  };
+  const byId = new Map(channels.map((channel) => [channel.id, channel]));
+  /** The one forum of a removed region that the channel of `one` would take back. */
+  const forumToAdopt = (one: Placed): { id: string; name: string } | undefined => {
+    if ('id' in one.channel) {
+      return adoptIn(byId.get(one.channel.id)?.categoryId ?? null, one.channelName);
+    }
+    const { category } = one.channel.create;
+    // A category this import creates holds no forum yet.
+    if (category !== null && 'create' in category) return undefined;
+    return adoptIn(category?.id ?? null, one.channelName);
+  };
+  const hasForumNow = (region: PlannedRegion | undefined): boolean =>
+    region?.forumChannelId != null && forums.has(region.forumChannelId);
+
+  // The room of every category and of the server, as the channels created and the forums made
+  // take it.
+  const inCategory = new Map<string, number>();
+  for (const channel of channels) {
+    if (channel.kind !== 'category' && channel.categoryId !== null) {
+      inCategory.set(channel.categoryId, (inCategory.get(channel.categoryId) ?? 0) + 1);
+    }
+  }
+  const roomIn = (categoryId: string): number =>
+    MAX_CATEGORY_CHANNELS - (inCategory.get(categoryId) ?? 0);
+  const take = (categoryId: string, places: number): void => {
+    inCategory.set(categoryId, (inCategory.get(categoryId) ?? 0) + places);
+  };
+  let inServer = channels.length;
+  const dropped = new Set<Placed>();
+  const drop = (one: Placed, reason: LeftOutReason, category?: string): void => {
+    dropped.add(one);
+    leftOut.push({
+      name: one.area.name,
+      channelName: one.channelName,
+      reason,
+      ...(category === undefined ? {} : { category }),
+    });
+  };
+
+  // First the forums of channels that exist: they cannot go anywhere else. A region that is one
+  // already is written without it (its forum blocked); a new one is left out.
+  const blocked = new Map<Placed, NonNullable<PlannedImport['forumBlocked']>>();
+  /** How many places the forums of channels that exist take in each category. */
+  const forumsIn = new Map<string, number>();
+  const roomAtStart = new Map([...inCategory.keys()].map((id) => [id, roomIn(id)]));
+  for (const { placed: one, region } of accepted) {
+    if (!('id' in one.channel) || hasForumNow(region) || forumToAdopt(one)) continue;
+    const categoryId = byId.get(one.channel.id)?.categoryId ?? null;
+    if (categoryId !== null && roomIn(categoryId) < 1) {
+      const category = byId.get(categoryId)?.name ?? '';
+      if (region) blocked.set(one, { category });
+      else drop(one, 'category-full', category);
+    } else if (inServer + 1 > MAX_SERVER_CHANNELS) {
+      if (region) blocked.set(one, { server: true });
+      else drop(one, 'server-full');
+    } else {
+      if (categoryId !== null) {
+        take(categoryId, 1);
+        forumsIn.set(categoryId, (forumsIn.get(categoryId) ?? 0) + 1);
+      }
+      inServer += 1;
+    }
+  }
+
+  // Then the channels to create, in the order of the file, each with its forum.
+  const categories = channels.filter((channel) => channel.kind === 'category');
+  /** The categories that would be created, by key: areas of one category share it. */
+  const newCategory = new Map<string, { name: string; holds: number; like?: string }>();
+  const overflows = new Map<string, Overflow>();
+  /**
+   * How much room the categories of a name had before this import, and how much of it the
+   * forums of their regions take: what overflow says.
+   */
+  const roomBefore = new Map<string, { room: number; forums: number }>();
+  for (const { placed: one } of accepted) {
+    const { wanted } = one;
+    if (wanted === undefined) continue;
+    if (wanted === null) {
+      const places = forumToAdopt(one) ? 1 : 2;
+      if (inServer + places > MAX_SERVER_CHANNELS) drop(one, 'server-full');
+      else inServer += places;
+      continue;
+    }
+    const baseKey = categoryKey(wanted);
+    const base =
+      categories.find((candidate) => categoryKey(candidate.name) === baseKey)?.name ??
+      newCategory.get(baseKey)?.name ??
+      wanted;
+    const baseCategories = categories.filter(
+      (candidate) => categoryKey(candidate.name) === baseKey,
+    );
+    if (!roomBefore.has(baseKey)) {
+      roomBefore.set(
+        baseKey,
+        baseCategories.length > 0
+          ? {
+              room: baseCategories.reduce(
+                (sum, candidate) => sum + (roomAtStart.get(candidate.id) ?? MAX_CATEGORY_CHANNELS),
+                0,
+              ),
+              forums: baseCategories.reduce(
+                (sum, candidate) => sum + (forumsIn.get(candidate.id) ?? 0),
+                0,
+              ),
+            }
+          : { room: MAX_CATEGORY_CHANNELS - (newCategory.get(baseKey)?.holds ?? 0), forums: 0 },
+      );
+    }
+    let chosen: { category: PlannedCategory; name: string } | 'server-full' | undefined;
+    for (let n = 1; chosen === undefined; n++) {
+      const name = n === 1 ? base : overflowName(base, n);
+      const key = categoryKey(name);
+      const named = categories.filter((candidate) => categoryKey(candidate.name) === key);
+      for (const candidate of named) {
+        const places = adoptIn(candidate.id, one.channelName) ? 1 : 2;
+        if (roomIn(candidate.id) < places) continue;
+        if (inServer + places > MAX_SERVER_CHANNELS) {
+          chosen = 'server-full';
+        } else {
+          take(candidate.id, places);
+          inServer += places;
+          chosen = { category: { id: candidate.id, name: candidate.name }, name: candidate.name };
+        }
+        break;
+      }
+      if (chosen !== undefined || named.length > 0) continue;
+      const planned = newCategory.get(key);
+      if (planned && MAX_CATEGORY_CHANNELS - planned.holds < 2) continue;
+      // A new category holds no forum to take back: the channel and its forum, and the
+      // category itself when it is the first channel in it.
+      const places = planned ? 2 : 3;
+      if (inServer + places > MAX_SERVER_CHANNELS) {
+        chosen = 'server-full';
+      } else {
+        inServer += places;
+        // An overflow of a category that exists continues it: its permissions, its place.
+        const like = n > 1 ? baseCategories[0]?.id : undefined;
+        const made = planned ?? { name, holds: 0, ...(like === undefined ? {} : { like }) };
+        made.holds += 2;
+        newCategory.set(key, made);
+        chosen = {
+          category: {
+            create: made.name,
+            ...(made.like === undefined ? {} : { like: made.like }),
+          },
+          name: made.name,
+        };
+      }
+    }
+    if (chosen === 'server-full') {
+      drop(one, 'server-full');
+      continue;
+    }
+    one.channel = { create: { category: chosen.category } };
+    if (categoryKey(chosen.name) !== baseKey) {
+      const noted = overflows.get(baseKey) ?? {
+        category: base,
+        room: roomBefore.get(baseKey)?.room ?? 0,
+        forums: roomBefore.get(baseKey)?.forums ?? 0,
+        channels: 0,
+        into: [],
+      };
+      noted.channels += 1;
+      if (!noted.into.includes(chosen.name)) noted.into.push(chosen.name);
+      overflows.set(baseKey, noted);
+    }
+  }
+  accepted = accepted.filter(({ placed: one }) => !dropped.has(one));
   // Every outline is tested through its box first: outlines may have thousands of corners.
   const tests = new Map<readonly LatLon[], (point: LatLon) => boolean>();
   const contains = (outline: readonly LatLon[], point: LatLon): boolean => {
@@ -385,39 +624,12 @@ export function planImport(input: ImportInput): ImportPlan {
     return best?.name;
   };
 
-  // The forums that are there, by id: a region whose forum was deleted by hand has none.
-  const forums = new Map(
-    channels.filter((channel) => channel.kind === 'forum').map((forum) => [forum.id, forum]),
-  );
-  const orphans = (input.orphanForums ?? []).flatMap((id) => {
-    const forum = forums.get(id);
-    return forum ? [forum] : [];
-  });
-  /** The one forum of a removed region that the channel of `one` would take back. */
-  const forumToAdopt = (one: Placed): { id: string; name: string } | undefined => {
-    let categoryId: string | null;
-    if ('id' in one.channel) {
-      const { id } = one.channel;
-      categoryId = channels.find((channel) => channel.id === id)?.categoryId ?? null;
-    } else {
-      const { category } = one.channel.create;
-      // A category this import creates holds no forum yet.
-      if (category !== null && 'create' in category) return undefined;
-      categoryId = category?.id ?? null;
-    }
-    const wanted = channelKey(`${one.channelName}${input.forumSuffix ?? ''}`);
-    const fitting = orphans.filter(
-      (forum) => forum.categoryId === categoryId && channelKey(forum.name) === wanted,
-    );
-    const [only] = fitting;
-    return fitting.length === 1 && only ? { id: only.id, name: only.name } : undefined;
-  };
-
   for (const { placed: one, region } of accepted) {
     const before = region?.bounds ? within(region.bounds) : undefined;
     const nearMiss = 'create' in one.channel ? nearMissOf(one.channelName) : undefined;
-    const hasForum = region?.forumChannelId != null && forums.has(region.forumChannelId);
+    const hasForum = hasForumNow(region);
     const adoptForum = hasForum ? undefined : forumToAdopt(one);
+    const forumBlocked = blocked.get(one);
     imports.push({
       name: one.area.name,
       channelName: one.channelName,
@@ -432,6 +644,7 @@ export function planImport(input: ImportInput): ImportPlan {
       holes: one.area.holes,
       unchanged: sameRing(region?.bounds ?? null, one.area.outline),
       ...(nearMiss === undefined ? {} : { nearMiss }),
+      ...(forumBlocked === undefined ? {} : { forumBlocked }),
     });
   }
 
@@ -455,42 +668,6 @@ export function planImport(input: ImportInput): ImportPlan {
     ),
   ];
 
-  // How full each category would be: what it holds, the channels created in it, and a forum
-  // for every region written without one (a forum goes where the region's channel is).
-  const fill = new Map<string, { name: string; channels: number }>();
-  const add = (key: string, name: string, more: number): void => {
-    const now = fill.get(key) ?? { name, channels: 0 };
-    now.channels += more;
-    fill.set(key, now);
-  };
-  for (const channel of channels) {
-    if (channel.kind === 'category') add(channel.id, channel.name, 0);
-  }
-  for (const channel of channels) {
-    if (channel.kind !== 'category' && channel.categoryId !== null) {
-      add(channel.categoryId, fill.get(channel.categoryId)?.name ?? '', 1);
-    }
-  }
-  for (const planned of imports) {
-    const forum = planned.hasForum || planned.adoptForum ? 0 : 1;
-    if ('create' in planned.channel) {
-      const { category } = planned.channel.create;
-      if (category === null) continue;
-      if ('create' in category) {
-        add(`new:${categoryKey(category.create)}`, category.create, 1 + forum);
-      } else {
-        add(category.id, category.name, 1 + forum);
-      }
-    } else {
-      const { id } = planned.channel;
-      const categoryId = channels.find((channel) => channel.id === id)?.categoryId ?? null;
-      if (categoryId !== null && forum > 0) add(categoryId, fill.get(categoryId)?.name ?? '', 1);
-    }
-  }
-  const crowded = [...fill.values()].filter(
-    (category) => category.channels > MAX_CATEGORY_CHANNELS,
-  );
-
   return {
     imports,
     leftOut,
@@ -498,8 +675,10 @@ export function planImport(input: ImportInput): ImportPlan {
     newCategories,
     stranded: gyms.filter((gym) => inServerNow(gym) && !keptAfter(gym)).length,
     raidsOutside,
-    newForums: imports.filter((planned) => !planned.hasForum && !planned.adoptForum).length,
-    crowded,
+    newForums: imports.filter(
+      (planned) => !planned.hasForum && !planned.adoptForum && !planned.forumBlocked,
+    ).length,
+    overflow: [...overflows.values()],
     ...(problem === undefined ? {} : { problem }),
   };
 }
````

### Task 2: Plan 8S-4 T2: Region import: a full category or server said plainly when Discord refuses

Prototype commit: `4b8b77f935c1a32b5ad20bdddd5da9179908adf6`

When Discord still refuses a channel after the preview (a race, the
server's 500), the outcome names the full category or says the server is
full, with what to do, in place of "the server or the category is full":
CreatedChannel's `limit` is `category-full` or `server-full`
(`channelLimitOf`), and NotImported carries the category's name. A forum
refused for the same reason says so (`setupForums`), naming its
channel's category. A channel is created in the very category the plan
named (of several of one name, the one with room). The region editor's
save watches the categories its preview puts new channels into, the
overflow category too, so one made meanwhile makes the save stale.

**Files:**

```
 src/commands/regions/import.more.test.ts | 176 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/regions/import.ts           |  19 +++++-
 src/discord/party-gateway.test.ts        |  44 +++++++++++++
 src/discord/party-gateway.ts             |  87 ++++++++++++++++++++-----
 src/services/party-service.ts            |  34 +++++++++-
 src/services/region-admin-service.ts     | 103 +++++++++++++++++++++++-------
 src/web/editor-save.test.ts              |  96 ++++++++++++++++++++++++++++
 src/web/editor-save.ts                   |  34 ++++++++--
 test/support/fake-gateway.test.ts        |  36 ++++++++++-
 test/support/fake-gateway.ts             |  69 ++++++++++++++++++--
 10 files changed, 643 insertions(+), 55 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/regions/import.more.test.ts src/discord/party-gateway.test.ts src/web/editor-save.test.ts test/support/fake-gateway.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4b8b77f935c1a32b5ad20bdddd5da9179908adf6 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-4 T2: Region import: a full category or server said plainly when Discord refuses`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/regions/import.more.test.ts b/src/commands/regions/import.more.test.ts
index 62f4cf38..6cd494fc 100644
--- a/src/commands/regions/import.more.test.ts
+++ b/src/commands/regions/import.more.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
+import { OverwriteType } from 'discord.js';
 import {
   fakeButton,
   asV2,
@@ -501,6 +502,181 @@ describe('/region import: a big import', () => {
   });
 });
 
+describe('/region import: full categories, pressed', () => {
+  /** The category of a channel the fake server has. */
+  const categoryOf = (made: Made, channelId: string) =>
+    made.gateway.serverChannels(made.gateway.guildId)?.find((one) => one.id === channelId)
+      ?.categoryId;
+  const nameOf = (made: Made, channelId: string | null | undefined) =>
+    made.gateway.serverChannels(made.gateway.guildId)?.find((one) => one.id === channelId)?.name;
+  /** The id of the channel or category of this name the fake server has. */ const channelNamed = (
+    made: Made,
+    name: string,
+  ): string =>
+    made.gateway.serverChannels(made.gateway.guildId)?.find((one) => one.name === name)?.id ?? '';
+
+  it('imports the rest of a file into the next category once the first is full', async () => {
+    const made = await regionCommandsWith();
+    const areas = Array.from({ length: MAX_NEW_CHANNELS + 3 }, (_unused, i) =>
+      area(`Place ${String.fromCharCode(97 + (i % 26))}${i}`, far(i), 'Pittsburgh staging'),
+    );
+    const first = await importing(made, areas);
+    await made.press(importButton(first.answer));
+    await made.settle();
+    // The category keeps its members out: the one that continues it must too.
+    const base = channelNamed(made, 'Pittsburgh staging');
+    const keptOut = [
+      { id: made.gateway.guildId, type: OverwriteType.Role, allow: '0', deny: '1024' },
+    ];
+    made.gateway.categoryOverwrites.set(base, keptOut);
+    // 25 channels and their 25 forums fill the category: the next import goes on in another.
+    const second = await importing(made, areas);
+    expect(regionSaid(second.answer)).toContain(
+      'The category `Pittsburgh staging` is full (Discord allows 50 channels in a category, ' +
+        'and forums count), so 3 new channels go into `Pittsburgh staging 2`, a new category ' +
+        'with the permissions of `Pittsburgh staging`, right after it.',
+    );
+    const done = answerOf(await made.press(importButton(second.answer)));
+    await made.settle();
+    expect(regionSaid(done).split('\n').slice(0, 3)).toEqual([
+      'Imported 28 regions, and created 3 channels for them.',
+      'Every line is in the attached file.',
+      'Created 1 category: `Pittsburgh staging 2`.',
+    ]);
+    const created = made.gateway.createdChannels.slice(-3);
+    expect(created.map((id) => nameOf(made, categoryOf(made, id)))).toEqual([
+      'Pittsburgh staging 2',
+      'Pittsburgh staging 2',
+      'Pittsburgh staging 2',
+    ]);
+    expect(listed(done, 'Imported').slice(0, 3)).toEqual(
+      created.map((id) => `- <#${id}> · new region · channel created · 0 gyms · forum created`),
+    );
+    // Made with the permissions of the category it continues, and placed right after it.
+    const overflow = channelNamed(made, 'Pittsburgh staging 2');
+    expect(made.gateway.categoryOverwrites.get(overflow)).toEqual(keptOut);
+    expect(made.gateway.placedAfter.get(overflow)).toBe(base);
+  });
+
+  it('says so when the new category cannot be given the permissions of the one it continues', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
+    for (let i = 0; i < 50; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
+    made.gateway.refuseCopies = true;
+    const { answer } = await importing(made, [
+      area('One More', far(1), 'Full'),
+      area('Two More', far(2), 'Full'),
+    ]);
+    const done = answerOf(await made.press(importButton(answer)));
+    const refused = (name: string, channel: string) =>
+      `- ${name}: \`#${channel}\` could not be created: I may not make the new category ` +
+      '`Full 2` with the permissions of `Full` (that takes Manage Channels and Manage Roles, ' +
+      'and every permission those overwrites give). Give them to me, or make `Full 2` ' +
+      'yourself with those permissions, and try again.';
+    // The second is not asked of Discord again: the same refusal stands for it.
+    expect(listed(done, 'Not imported')).toEqual([
+      refused('One More', 'one-more'),
+      refused('Two More', 'two-more'),
+    ]);
+    expect(made.gateway.calls.filter((call) => call.startsWith('createCategory'))).toHaveLength(1);
+    expect(made.gateway.createdChannels).toEqual([]);
+  });
+
+  it('says that it may not create channels, not that it could not copy, without Manage Channels', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
+    for (let i = 0; i < 50; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
+    const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
+    made.gateway.noCreating.add(made.gateway.guildId);
+    const done = answerOf(await made.press(importButton(answer)));
+    expect(listed(done, 'Not imported')).toEqual([
+      '- One More: I may not create `#one-more` (I lack Manage Channels).',
+    ]);
+  });
+
+  it('makes no overflow category without the permissions of one that was deleted meanwhile', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
+    for (let i = 0; i < 50; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
+    const { answer } = await importing(made, [area('One More', far(1), 'Full')]);
+    made.gateway.gone.add('k9');
+    const done = answerOf(await made.press(importButton(answer)));
+    expect(listed(done, 'Not imported')).toEqual([
+      '- One More: `#one-more` could not be created: the category that the new category ' +
+        '`Full 2` was to continue, with its permissions, is gone. Import again.',
+    ]);
+    expect(made.gateway.createdChannels).toEqual([]);
+  });
+
+  it('writes the outline of a region whose forum has no room, and says why it has none', async () => {
+    const made = await regionCommandsWith();
+    const inTown = (made.gateway.serverChannels(made.gateway.guildId) ?? []).filter(
+      (channel) => channel.categoryId === TOWN_CATEGORY,
+    ).length;
+    for (let i = inTown; i < 50; i++)
+      made.gateway.addChannel(`town${i}`, `town-${i}`, { categoryId: TOWN_CATEGORY });
+    const { answer } = await importing(made, [area('Unbounded', far(1))]);
+    const done = answerOf(await made.press(importButton(answer)));
+    await made.settle();
+    expect(listed(done, 'Imported')).toEqual([
+      `- <#${UNBOUNDED_CHANNEL}> · new outline · 0 gyms · **no forum**: the category \`Town\` ` +
+        'is full (Discord allows 50 channels in a category, and forums count): move some ' +
+        'channels out of it',
+    ]);
+    expect(made.regions.byChannel(UNBOUNDED_CHANNEL)?.bounds).toEqual(far(1));
+  });
+
+  it('creates the channel in the very category the preview named, of several of one name', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.addChannel('k1', 'Twin', { kind: 'category' });
+    for (let i = 0; i < 50; i++) made.gateway.addChannel(`a${i}`, `a-${i}`, { categoryId: 'k1' });
+    made.gateway.addChannel('k2', 'twin', { kind: 'category' });
+    const { answer } = await importing(made, [area('River Side', far(1), 'Twin')]);
+    expect(listed(answer, 'Would be imported')[0]).toContain('in the category `twin`');
+    const done = answerOf(await made.press(importButton(answer)));
+    expect(regionSaid(done)).toContain('Imported 1 region, and created 1 channel for them.');
+    expect(categoryOf(made, made.gateway.createdChannels.at(-1) ?? '')).toBe('k2');
+  });
+
+  it('says which category was full when Discord refused a channel after the preview', async () => {
+    const made = await regionCommandsWith();
+    made.gateway.addChannel('k9', 'Full', { kind: 'category' });
+    for (let i = 0; i < 46; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
+    const { answer } = await importing(made, [
+      area('One More', far(1), 'Full'),
+      area('Two More', far(2), 'Full'),
+    ]);
+    // Somebody fills the category meanwhile, to the last place but one.
+    for (let i = 46; i < 49; i++) made.gateway.addChannel(`f${i}`, `f-${i}`, { categoryId: 'k9' });
+    const done = answerOf(await made.press(importButton(answer)));
+    await made.settle();
+    expect(listed(done, 'Not imported')).toEqual([
+      '- Two More: `#two-more` could not be created: the category `Full` is full (Discord ' +
+        'allows 50 channels in a category, and forums count). Move some channels out of it, ' +
+        'and try again.',
+    ]);
+    // The first got its channel, the last place: its forum found none.
+    expect(listed(done, 'Imported')).toEqual([
+      expect.stringContaining(
+        '**no forum**: the category `Full` is full (Discord allows 50 channels in a category, ' +
+          'and forums count)',
+      ) as string,
+    ]);
+  });
+
+  it('says that the server is full when Discord refuses for its 500 channels', async () => {
+    const made = await regionCommandsWith();
+    const { answer } = await importing(made, [area('River Side', far(1), 'Town')]);
+    for (let i = 0; i < 500; i++) made.gateway.addChannel(`many${i}`, `many-${i}`);
+    const done = answerOf(await made.press(importButton(answer)));
+    expect(listed(done, 'Not imported')).toEqual([
+      '- River Side: `#river-side` could not be created: the server has as many channels as ' +
+        'Discord allows (500, forums and categories count). Delete channels nobody uses, and ' +
+        'try again.',
+    ]);
+  });
+});
+
 describe('/region import: the forum of a removed region', () => {
   it('says that a region imported again takes back the forum it kept, and does so', async () => {
     const made = await regionCommandsWith([
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
index b0d97592..811fcfbf 100644
--- a/src/commands/regions/import.ts
+++ b/src/commands/regions/import.ts
@@ -603,7 +603,24 @@ function failureText(failed: NotImported): string {
     foreign: `${channel} cannot be a region of this server`,
     'name-taken': `channels called ${channel} have appeared that are not one text channel`,
     'no-permission': `I may not create ${channel} (I lack Manage Channels)`,
-    limit: `${channel} could not be created: the server or the category is full`,
+    'category-full':
+      `${channel} could not be created: the category ${derived(failed.category ?? '')} is ` +
+      `full (Discord allows ${MAX_CATEGORY_CHANNELS} channels in a category, and forums ` +
+      'count). Move some channels out of it, and try again',
+    'server-full':
+      `${channel} could not be created: the server has as many channels as Discord allows ` +
+      `(${MAX_SERVER_CHANNELS}, forums and categories count). Delete channels nobody uses, and ` +
+      'try again',
+    'copy-refused':
+      `${channel} could not be created: I may not make the new category ` +
+      `${derived(failed.category ?? '')} with the permissions of ${derived(failed.copyOf ?? '')} ` +
+      '(that takes Manage Channels and Manage Roles, and every permission those overwrites ' +
+      `give). Give them to me, or make ${derived(failed.category ?? '')} yourself with those ` +
+      'permissions, and try again',
+    'base-gone':
+      `${channel} could not be created: the category that the new category ` +
+      `${derived(failed.category ?? '')} was to continue, with its permissions, is gone. Import ` +
+      'again',
     'bad-name': `Discord does not take ${channel} as a channel name`,
     'no-server': `${channel} could not be created: its category is gone`,
     failed: `${channel} could not be created (the log says why)`,
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index f93c8944..8ac5efd8 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -19,6 +19,7 @@ import { createTestLogger } from '../../test/support/test-logger.js';
 import { channelPermissions } from '../ops/permissions.js';
 import {
   categoryOnlyPermissions,
+  channelLimitOf,
   conversionBody,
   DiscordPartyGateway,
   editAs,
@@ -114,6 +115,49 @@ describe('isRefusedBody', () => {
   });
 });
 
+describe('channelLimitOf', () => {
+  const refusedFor = (field: string, code: string, message: string) =>
+    new DiscordAPIError(
+      {
+        code: RESTJSONErrorCodes.InvalidFormBodyOrContentType,
+        message: 'Invalid Form Body',
+        errors: { [field]: { _errors: [{ code, message }] } } as DiscordErrorFields,
+      },
+      RESTJSONErrorCodes.InvalidFormBodyOrContentType,
+      400,
+      'POST',
+      '/guilds/1/channels',
+      {},
+    );
+
+  it('tells a full category from a full server', () => {
+    expect(
+      channelLimitOf(
+        refusedFor(
+          'parent_id',
+          'CHANNEL_PARENT_MAX_CHANNELS',
+          'Maximum number of channels in category reached (50)',
+        ),
+      ),
+    ).toBe('category');
+    expect(
+      channelLimitOf(apiError(RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached, 400)),
+    ).toBe('server');
+  });
+
+  it('is nothing for any other refusal', () => {
+    expect(
+      channelLimitOf(refusedFor('name', 'BASE_TYPE_BAD_LENGTH', 'Must be 1-100 in length.')),
+    ).toBeUndefined();
+    // Another refusal of the parent (a category that is no category) is no full category.
+    expect(
+      channelLimitOf(refusedFor('parent_id', 'CHANNEL_PARENT_INVALID_TYPE', 'Not a category')),
+    ).toBeUndefined();
+    expect(channelLimitOf(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBeUndefined();
+    expect(channelLimitOf(new Error('parent_id'))).toBeUndefined();
+  });
+});
+
 describe('refusedPart', () => {
   /** Invalid Form Body as Discord answers it: the fields it refused, by their paths. */
   const refusal = (errors?: object, message = 'Invalid Form Body') =>
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 130b51f6..bac32dd2 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -278,9 +278,16 @@ export interface PartyGateway {
   /**
    * Creates a category in a server (`/region import`, for the channel of a new region). A
    * refusal for a reason staff can do something about is an answer; anything else is thrown.
-   * `reason` is what the server's audit log says of it (who asked for it).
+   * `reason` is what the server's audit log says of it (who asked for it). `like` names the
+   * category it continues (an overflow category, plan 8S-4): it is made with that category's
+   * permission overwrites and placed right after it (a refusal to set them is `no-permission`).
    */
-  createCategory(guildId: string, name: string, reason?: string): Promise<CreatedChannel>;
+  createCategory(
+    guildId: string,
+    name: string,
+    reason?: string,
+    like?: string,
+  ): Promise<CreatedChannel>;
   /**
    * Creates an ordinary text channel in a server, in this category (which gives it its
    * permissions) or in none. Answers and throws as `createCategory`.
@@ -479,13 +486,19 @@ export function hiddenForumOverwrites(
 /**
  * What came of creating a channel: the channel as Discord made it (it may write the name
  * differently), or why not. `no-permission`: the bot lacks Manage Channels (in the server, or
- * in the category); `limit`: the server has as many channels as Discord allows (500), or the
- * category has (50); `bad-name`: Discord does not take the name; `no-server`: the bot is not
- * in that server, or the category is gone.
+ * in the category); `server-full`: the server has as many channels as Discord allows (500);
+ * `category-full`: the category has (50, forums included); `bad-name`: Discord does not take
+ * the name; `no-server`: the bot is not in that server, or the category is gone; `base-gone`:
+ * the category a new one was to continue (`createCategory`'s `like`) is gone, so it is not made
+ * (made without that one's permissions it would be open to whoever the server lets in).
  */
 export type CreatedChannel =
   | { ok: true; id: string; name: string }
-  | { ok: false; reason: 'no-permission' | 'limit' | 'bad-name' | 'no-server' };
+  | {
+      ok: false;
+      reason:
+        'no-permission' | 'server-full' | 'category-full' | 'bad-name' | 'no-server' | 'base-gone';
+    };
 
 /** What the bot needs in a channel to put a copy of a party's message there. */
 const CAN_POST = [
@@ -558,6 +571,19 @@ export function isOverwriteLimit(err: unknown): boolean {
   return hasCode(err, RESTJSONErrorCodes.MaximumNumberOfChannelPermissionOverwritesReached);
 }
 
+/**
+ * Whether Discord refused a new channel (a forum too) for want of room: `server` when the server
+ * has as many channels as Discord allows (500), `category` when its category has (50, forums
+ * included; Invalid Form Body naming the parent, `CHANNEL_PARENT_MAX_CHANNELS`).
+ */
+export function channelLimitOf(err: unknown): 'server' | 'category' | undefined {
+  if (hasCode(err, RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached)) return 'server';
+  if (isRefusedBody(err) && err instanceof DiscordAPIError) {
+    if (/CHANNEL_PARENT_MAX_CHANNELS/u.test(err.message)) return 'category';
+  }
+  return undefined;
+}
+
 /** Whether Discord refused the message for what it holds (Invalid Form Body). */
 export function isRefusedBody(err: unknown): boolean {
   return (
@@ -1479,8 +1505,13 @@ export class DiscordPartyGateway implements PartyGateway {
     return me?.permissions.has(PermissionFlagsBits.ManageChannels) ?? false;
   }
 
-  createCategory(guildId: string, name: string, reason?: string): Promise<CreatedChannel> {
-    return this.createChannel(guildId, name, ChannelType.GuildCategory, null, reason);
+  createCategory(
+    guildId: string,
+    name: string,
+    reason?: string,
+    like?: string,
+  ): Promise<CreatedChannel> {
+    return this.createChannel(guildId, name, ChannelType.GuildCategory, null, reason, like);
   }
 
   createTextChannel(
@@ -1498,6 +1529,7 @@ export class DiscordPartyGateway implements PartyGateway {
     type: ChannelType.GuildCategory | ChannelType.GuildText,
     parent: string | null,
     reason = 'For a region',
+    like?: string,
   ): Promise<CreatedChannel> {
     const guild = this.client.guilds.cache.get(guildId);
     if (!guild) return { ok: false, reason: 'no-server' };
@@ -1506,20 +1538,41 @@ export class DiscordPartyGateway implements PartyGateway {
     if (parent !== null && guild.channels.cache.get(parent)?.type !== ChannelType.GuildCategory) {
       return { ok: false, reason: 'no-server' };
     }
+    // A category that continues another (`like`) has its permissions from its first moment on,
+    // never open in between; one gone meanwhile has none to give.
+    const base = like === undefined ? undefined : guild.channels.cache.get(like);
+    const continues = base?.type === ChannelType.GuildCategory ? base : undefined;
+    if (like !== undefined && !continues) return { ok: false, reason: 'base-gone' };
     try {
-      const made = await guild.channels.create({ name, type, parent, reason });
+      const made = await guild.channels.create({
+        name,
+        type,
+        parent,
+        reason,
+        ...(continues
+          ? {
+              permissionOverwrites: continues.permissionOverwrites.cache.map((one) => ({
+                id: one.id,
+                type: one.type,
+                allow: one.allow.bitfield,
+                deny: one.deny.bitfield,
+              })),
+            }
+          : {}),
+      });
+      // Right after the one it continues: a position given at creation shifts nothing, so it is
+      // moved once made, and where it stands is no reason to fail.
+      if (continues && 'setPosition' in made) {
+        await made.setPosition(continues.position + 1).catch(() => undefined);
+      }
       return { ok: true, id: made.id, name: made.name };
     } catch (err) {
       if (isMissingPermission(err)) return { ok: false, reason: 'no-permission' };
-      if (hasCode(err, RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached)) {
-        return { ok: false, reason: 'limit' };
-      }
+      // A full category is refused as a bad form, with the parent named as what is wrong.
+      const full = channelLimitOf(err);
+      if (full) return { ok: false, reason: full === 'server' ? 'server-full' : 'category-full' };
       if (isGone(err)) return { ok: false, reason: 'no-server' };
-      if (isRefusedBody(err)) {
-        // A full category is refused as a bad form, with the parent named as what is wrong.
-        const full = err instanceof DiscordAPIError && /MAX_CHANNELS|parent_id/iu.test(err.message);
-        return { ok: false, reason: full ? 'limit' : 'bad-name' };
-      }
+      if (isRefusedBody(err)) return { ok: false, reason: 'bad-name' };
       throw err;
     }
   }
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 22f42c40..30251b28 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -4,6 +4,7 @@ import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import {
+  channelLimitOf,
   isMissingPermission,
   isRefusedBody,
   isRefusedStarter,
@@ -2685,6 +2686,7 @@ export class PartyService {
           { err: err instanceof HiddenForumRefused ? err.cause : err, region: before.id },
           'could not set up the forum of a region',
         );
+        const full = channelLimitOf(err);
         results.push({
           region: regions.byId(before.id) ?? before,
           forum: 'failed',
@@ -2693,9 +2695,11 @@ export class PartyService {
               ? HIDDEN_FORUM_REFUSED
               : err instanceof PostsRefusedError
                 ? summaryRefusedWords(err)
-                : isMissingPermission(err)
-                  ? 'I need the Manage Channels and Manage Threads permissions here.'
-                  : 'Something went wrong (see the log).',
+                : full !== undefined
+                  ? this.noRoomWords(guildId, before, full)
+                  : isMissingPermission(err)
+                    ? 'I need the Manage Channels and Manage Threads permissions here.'
+                    : 'Something went wrong (see the log).',
           tagsAdded: 0,
           summary: false,
         });
@@ -2704,6 +2708,30 @@ export class PartyService {
     return results;
   }
 
+  /**
+   * Why a region's forum could not be made for want of room, as a sentence: its channel's
+   * category (named, from the cache) or the server has as many channels as Discord allows.
+   */
+  private noRoomWords(guildId: string, region: Region, full: 'server' | 'category'): string {
+    if (full === 'server') {
+      return (
+        'The server has as many channels as Discord allows (500, forums and categories count): ' +
+        'delete channels nobody uses.'
+      );
+    }
+    const channels = this.options.gateway.serverChannels(guildId) ?? [];
+    const categoryId = channels.find((channel) => channel.id === region.channelId)?.categoryId;
+    const name = channels.find((channel) => channel.id === categoryId)?.name;
+    const category =
+      name === undefined
+        ? 'The category of its channel'
+        : `The category \`${name.replace(/`/gu, '')}\``;
+    return (
+      `${category} is full (Discord allows 50 channels in a category, and forums count): move ` +
+      'some channels out of it.'
+    );
+  }
+
   /**
    * Rehearsal mode: hides a forum from all but staff and the allowlist
    * (`PartyGateway.hideForum`); a failure is logged and said as refused.
diff --git a/src/services/region-admin-service.ts b/src/services/region-admin-service.ts
index 52fab169..52908512 100644
--- a/src/services/region-admin-service.ts
+++ b/src/services/region-admin-service.ts
@@ -72,22 +72,28 @@ export interface ImportedRegion {
  * Why an area that was to be imported was not, in the end. `channel-gone`: its channel was
  * deleted since the preview, or is no text channel any more; `foreign`: it is another server's
  * region now; `name-taken`: its channel was to be created, and channels of that name exist now
- * that are not one text channel; `no-permission`, `limit`, `bad-name`, `no-server`: Discord
- * refused to create its channel or its category (`CreatedChannel`); `failed`: that failed for
- * another reason (logged); `not-written`: the outlines could not be written (nothing was);
- * `not-allowed`: its channel was to be created, and the staff member may not create channels.
+ * that are not one text channel; `no-permission`, `server-full`, `category-full`, `bad-name`,
+ * `no-server`: Discord refused to create its channel or its category (`CreatedChannel`);
+ * `failed`: that failed for another reason (logged); `not-written`: the outlines could not be
+ * written (nothing was); `not-allowed`: its channel was to be created, and the staff member may
+ * not create channels; `copy-refused`: its category was a new one continuing another (an
+ * overflow category, plan 8S-4), and Discord refused to make it with that one's permissions;
+ * `base-gone`: the category it was to continue is gone, so it was not made.
  */
 export type ImportFailure =
   | 'channel-gone'
   | 'foreign'
   | 'name-taken'
   | 'no-permission'
-  | 'limit'
+  | 'server-full'
+  | 'category-full'
   | 'bad-name'
   | 'no-server'
   | 'failed'
   | 'not-written'
-  | 'not-allowed';
+  | 'not-allowed'
+  | 'copy-refused'
+  | 'base-gone';
 
 export interface NotImported {
   name: string;
@@ -95,6 +101,13 @@ export interface NotImported {
   reason: ImportFailure;
   /** The channel this import created for it, which exists although it is no region. */
   createdChannelId?: string;
+  /**
+   * With `category-full`: the name of the category that was full; with `copy-refused`: the name
+   * of the category that could not be made.
+   */
+  category?: string;
+  /** With `copy-refused`: the name of the category whose permissions it was to have. */
+  copyOf?: string;
 }
 
 export interface ImportOutcome {
@@ -254,6 +267,12 @@ const END_ROUNDS = 3;
 
 const categoryKey = (name: string): string => name.normalize('NFC').toLowerCase();
 
+/** Why a channel (or its category) could not be created, with the names its words need. */
+type CategoryRefused = { ok: false; reason: ImportFailure } & Pick<
+  NotImported,
+  'category' | 'copyOf'
+>;
+
 /** An area that is ready to be written: its channel exists. */
 interface Ready {
   planned: PlannedImport;
@@ -502,16 +521,24 @@ export class RegionAdminService {
     const ready: Ready[] = [];
     const notImported: NotImported[] = [];
     const categoriesCreated: string[] = [];
-    /** The categories made in this run, by name without case: the cache may not have them yet. */
-    const madeCategories = new Map<string, string>();
+    /**
+     * The categories made in this run, by name without case (the cache may not have them yet),
+     * or why one could not be made: the areas after it are left out alike, without asking again.
+     */
+    const madeCategories = new Map<string, string | CategoryRefused>();
     const taken = new Set<string>();
     for (const one of planned) {
-      const leave = (reason: ImportFailure, createdChannelId?: string): void => {
+      const leave = (
+        reason: ImportFailure,
+        createdChannelId?: string,
+        more: Pick<NotImported, 'category' | 'copyOf'> = {},
+      ): void => {
         notImported.push({
           name: one.name,
           channelName: one.channelName,
           reason,
           ...(createdChannelId === undefined ? {} : { createdChannelId }),
+          ...more,
         });
       };
       const channels = this.channelsOf(staff);
@@ -551,7 +578,8 @@ export class RegionAdminService {
             `${via} by ${staff.staffId}`,
           );
           if (!made.ok) {
-            leave(made.reason);
+            const { ok: _ok, reason, ...more } = made;
+            leave(reason, undefined, more);
             continue;
           }
           channelId = made.id;
@@ -626,39 +654,70 @@ export class RegionAdminService {
   }
 
   /**
-   * Creates the text channel of a new region, in its category, which is created first when
-   * the server has none of that name (looked for again, and among those this run made).
-   * `auditReason` is what the server's audit log says of them: what asked, and who.
+   * Creates the text channel of a new region, in its category: the very one the plan named,
+   * while it is still there (of several of one name, the one with room), else one of its name,
+   * which is created first when the server has none (looked for again, and among those this run
+   * made). `auditReason` is what the server's audit log says of them: what asked, and who. A
+   * full category is named with the failure.
    */
   private async createChannel(
     staff: RegionStaff,
     name: string,
     category: PlannedCategory,
     channels: readonly ServerChannel[],
-    madeCategories: Map<string, string>,
+    madeCategories: Map<string, string | CategoryRefused>,
     categoriesCreated: string[],
     auditReason: string,
-  ): Promise<{ ok: true; id: string } | { ok: false; reason: ImportFailure }> {
+  ): Promise<{ ok: true; id: string } | CategoryRefused> {
     const { gateway, log } = this.options;
     try {
       let categoryId: string | null = null;
+      let categoryName: string | undefined;
       if (category !== null) {
         const wanted = 'create' in category ? category.create : category.name;
         const key = categoryKey(wanted);
-        const existing = channels.find(
-          (channel) => channel.kind === 'category' && categoryKey(channel.name) === key,
-        );
-        categoryId = existing?.id ?? madeCategories.get(key) ?? null;
+        const planned =
+          'id' in category
+            ? channels.find((channel) => channel.id === category.id && channel.kind === 'category')
+            : undefined;
+        const existing =
+          planned ??
+          channels.find(
+            (channel) => channel.kind === 'category' && categoryKey(channel.name) === key,
+          );
+        const before = existing ? undefined : madeCategories.get(key);
+        if (typeof before === 'object') return before;
+        categoryId = existing?.id ?? before ?? null;
+        categoryName = existing?.name ?? wanted;
         if (categoryId === null) {
-          const made = await gateway.createCategory(staff.server, wanted, auditReason);
-          if (!made.ok) return made;
+          // An overflow category continues another: its permissions, right after it.
+          const like = 'create' in category ? category.like : undefined;
+          const made = await gateway.createCategory(staff.server, wanted, auditReason, like);
+          if (!made.ok) {
+            const base = like === undefined ? undefined : channels.find((one) => one.id === like);
+            // Refused its overwrites: only where the bot may create channels at all.
+            const refused: CategoryRefused =
+              made.reason === 'base-gone'
+                ? { ok: false, reason: 'base-gone', category: wanted }
+                : made.reason === 'no-permission' &&
+                    base !== undefined &&
+                    gateway.mayCreateChannels(staff.server)
+                  ? { ok: false, reason: 'copy-refused', category: wanted, copyOf: base.name }
+                  : made;
+            madeCategories.set(key, refused);
+            return refused;
+          }
           madeCategories.set(key, made.id);
           categoriesCreated.push(made.name);
           categoryId = made.id;
+          categoryName = made.name;
         }
       }
       const made = await gateway.createTextChannel(staff.server, name, categoryId, auditReason);
-      return made.ok ? { ok: true, id: made.id } : made;
+      if (made.ok) return { ok: true, id: made.id };
+      return made.reason === 'category-full' && categoryName !== undefined
+        ? { ...made, category: categoryName }
+        : made;
     } catch (err) {
       log.error({ err, staff: staff.staffId }, 'could not create the channel of a region');
       return { ok: false, reason: 'failed' };
diff --git a/src/web/editor-save.test.ts b/src/web/editor-save.test.ts
index 97f638e3..252ba6b7 100644
--- a/src/web/editor-save.test.ts
+++ b/src/web/editor-save.test.ts
@@ -758,6 +758,102 @@ describe('preview and save of the region editor', () => {
     expect(editing.regions.rows).toHaveLength(3);
   });
 
+  /** Gives the fake server the category Suburbs, full: 50 channels. */
+  function fillSuburbs(editing: Awaited<ReturnType<typeof made>>['editing']): void {
+    editing.gateway.addChannel('800000000000000020', 'Suburbs', { kind: 'category' });
+    for (let i = 0; i < 50; i++) {
+      editing.gateway.addChannel(`8000000000000001${String(i).padStart(2, '0')}`, `s-${i}`, {
+        categoryId: '800000000000000020',
+      });
+    }
+  }
+  const northHills = request({
+    additions: [
+      {
+        channel: { name: 'North Hills' },
+        description: 'Suburbs',
+        outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+      },
+    ],
+  });
+
+  it('previews a new channel of a full category in the next one, and says why', async () => {
+    const { post, editing } = await made();
+    fillSuburbs(editing);
+    const answer = await post(PREVIEW, northHills);
+    expect(answer.json).toMatchObject({
+      kind: 'preview',
+      worded: {
+        lines: [
+          'Saving would give 1 new region. Nothing is changed yet.',
+          'I would create 1 channel: #north-hills. Check the names: a typo in a name makes a ' +
+            'channel of that name.',
+          'I would create 1 category: Suburbs 2.',
+          'I would create 1 forum, one for each region that has none.',
+          'The category Suburbs is full (Discord allows 50 channels in a category, and forums ' +
+            'count), so 1 new channel goes into Suburbs 2, a new category with the permissions of ' +
+            'Suburbs, right after it.',
+        ],
+      },
+    });
+    const saved = await post(SAVE, northHills);
+    expect(saved.json).toMatchObject({
+      kind: 'saved',
+      worded: { lines: expect.arrayContaining(['Created 1 category: Suburbs 2.']) as string[] },
+    });
+  });
+
+  it('refuses a save when the overflow category it would make was made while it waited', async () => {
+    const { post, editing } = await made();
+    fillSuburbs(editing);
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 1);
+    const saving = post(SAVE, northHills);
+    await reached;
+    editing.gateway.addChannel('800000000000000021', 'suburbs 2', { kind: 'category' });
+    release();
+    await held;
+    const answer = await saving;
+    expect(answer.status).toBe(409);
+    expect(answer.json).toMatchObject({ kind: 'stale' });
+    expect(editing.regions.rows).toHaveLength(3);
+  });
+
+  it('refuses a save when the category its new channel goes into filled while it waited', async () => {
+    const { post, editing } = await made();
+    editing.gateway.addChannel('800000000000000020', 'Suburbs', { kind: 'category' });
+    for (let i = 0; i < 48; i++) {
+      editing.gateway.addChannel(`8000000000000001${String(i).padStart(2, '0')}`, `s-${i}`, {
+        categoryId: '800000000000000020',
+      });
+    }
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 1);
+    const saving = post(SAVE, northHills);
+    await reached;
+    // Another bot's channel in Suburbs: no room for the new channel and its forum any more.
+    editing.gateway.addChannel('800000000000000199', 'ticket-0042', {
+      categoryId: '800000000000000020',
+    });
+    release();
+    await held;
+    const answer = await saving;
+    expect(answer.status).toBe(409);
+    expect(answer.json).toMatchObject({ kind: 'stale' });
+  });
+
   it('saves on when only channels the save does not use came or went while it waited', async () => {
     const { post, editing } = await made();
     let release: () => void = () => undefined;
diff --git a/src/web/editor-save.ts b/src/web/editor-save.ts
index 6e0f5ec5..35ccdd60 100644
--- a/src/web/editor-save.ts
+++ b/src/web/editor-save.ts
@@ -285,7 +285,9 @@ function watchedBy(plan: SavePlan, request: SaveRequest): Watched {
  * of the regions of `regionsStamp`, those `watched` names, and every channel or category whose
  * name stands for a name the plan goes to or a category it names. A channel made, renamed or
  * deleted there meanwhile (one of the name a new region would make) changes it; the server's
- * other channels (a ticket or voice bot's, which come and go all day) do not.
+ * other channels (a ticket or voice bot's, which come and go all day) do not, unless they fill or
+ * empty a category the save puts channels into: a category is stamped with how many channels it
+ * holds (plan 8S-4).
  */
 function channelsStamp(
   guildId: number,
@@ -298,6 +300,12 @@ function channelsStamp(
     ids.add(region.channelId);
     if (region.forumChannelId !== null) ids.add(region.forumChannelId);
   }
+  const children = new Map<string, number>();
+  for (const channel of channels) {
+    if (channel.categoryId !== null) {
+      children.set(channel.categoryId, (children.get(channel.categoryId) ?? 0) + 1);
+    }
+  }
   return JSON.stringify(
     channels
       .filter(
@@ -307,7 +315,13 @@ function channelsStamp(
           (channel.kind === 'category' && watched.categories.has(categoryKey(channel.name))),
       )
       .sort(byId)
-      .map(({ id, name, kind, categoryId }) => [id, name, kind, categoryId]),
+      // A category with how many channels it holds: one that filled meanwhile has no room
+      // for what the save planned in it any more (plan 8S-4).
+      .map(({ id, name, kind, categoryId }) =>
+        kind === 'category'
+          ? [id, name, kind, categoryId, children.get(id) ?? 0]
+          : [id, name, kind, categoryId],
+      ),
   );
 }
 
@@ -390,8 +404,7 @@ async function prepare(
   const regionsNow = regionsStamp(staff.guildId, all, channels);
   const regions = new Map(all.map((region) => [region.id, region]));
   const plan = planSave(request, { guildId: staff.guildId, regions: all, channels });
-  const watched = watchedBy(plan, request);
-  const stamp = regionsNow + channelsStamp(staff.guildId, all, channels, watched);
+  const asked = watchedBy(plan, request);
   const names = new SaveNames(regions, channels, request);
   if (plan.conflicts.length > 0) {
     return { answer: conflictAnswer(all, staff, channels, plan.conflicts) };
@@ -417,6 +430,19 @@ async function prepare(
     orphans,
     plan.removals.map((removal) => removal.regionId),
   );
+  // The categories the import puts new channels into: a full one's overflow too.
+  const watched: Watched = {
+    ...asked,
+    categories: new Set([
+      ...asked.categories,
+      ...preview.imports.flatMap((one) => {
+        const category = 'create' in one.channel ? one.channel.create.category : null;
+        if (category === null) return [];
+        return [categoryKey('create' in category ? category.create : category.name)];
+      }),
+    ]),
+  };
+  const stamp = regionsNow + channelsStamp(staff.guildId, all, channels, watched);
   // What the import will write is checked: the areas it leaves out are not written.
   const leftOut = new Set(preview.leftOut.map((left) => left.name));
   const key = checkKey(staff, request, `${regionsNow}${JSON.stringify([...leftOut].sort())}`);
diff --git a/test/support/fake-gateway.test.ts b/test/support/fake-gateway.test.ts
index 8b04046e..10d6d712 100644
--- a/test/support/fake-gateway.test.ts
+++ b/test/support/fake-gateway.test.ts
@@ -1,6 +1,7 @@
 import { ButtonStyle, ComponentType } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
+  channelLimitOf,
   isRefusedBody,
   refusedPart,
   type OutgoingMessage,
@@ -235,6 +236,26 @@ describe('FakePartyGateway: the channels of a server', () => {
     expect(fake.calls).toEqual(['createCategory North Hills', 'createTextChannel West End']);
   });
 
+  it('makes a category that continues another with its overwrites, after it, and none when it is gone', async () => {
+    const fake = new FakePartyGateway();
+    fake.addChannel('k1', 'Town', { kind: 'category' });
+    const overwrites = [{ id: fake.guildId, type: 0, allow: '0', deny: '1024' }];
+    fake.categoryOverwrites.set('k1', overwrites);
+    const made = await fake.createCategory(fake.guildId, 'Town 2', undefined, 'k1');
+    if (!made.ok) throw new Error('not made');
+    expect(fake.categoryOverwrites.get(made.id)).toEqual(overwrites);
+    expect(fake.placedAfter.get(made.id)).toBe('k1');
+    fake.gone.add('k1');
+    expect(await fake.createCategory(fake.guildId, 'Town 3', undefined, 'k1')).toEqual({
+      ok: false,
+      reason: 'base-gone',
+    });
+    expect(await fake.createCategory(fake.guildId, 'Town 4', undefined, 'no-such')).toEqual({
+      ok: false,
+      reason: 'base-gone',
+    });
+  });
+
   it('refuses as Discord does: no permission, a bad name, a full category, a full server', async () => {
     const fake = new FakePartyGateway();
     expect(fake.mayCreateChannels(fake.guildId)).toBe(true);
@@ -266,14 +287,25 @@ describe('FakePartyGateway: the channels of a server', () => {
     for (let i = 0; i < 50; i++) fake.addChannel(`in${i}`, `in-${i}`, { categoryId: 'k1' });
     expect(await fake.createTextChannel(fake.guildId, 'one-more', 'k1')).toEqual({
       ok: false,
-      reason: 'limit',
+      reason: 'category-full',
     });
+    // A forum beside a channel of a full category is refused as Discord refuses it.
+    fake.addChannel('c1', 'inside', { categoryId: 'k1' });
+    const refused: unknown = await fake
+      .createForum('c1', 'inside-raids', [])
+      .catch((err: unknown) => err);
+    expect(channelLimitOf(refused)).toBe('category');
     expect((await fake.createTextChannel(fake.guildId, 'one-more', null)).ok).toBe(true);
     for (let i = 0; i < 500; i++) fake.addChannel(`many${i}`, `many-${i}`);
     expect(await fake.createTextChannel(fake.guildId, 'too-many', null)).toEqual({
       ok: false,
-      reason: 'limit',
+      reason: 'server-full',
     });
+    fake.addChannel('c2', 'outside');
+    const tooMany: unknown = await fake
+      .createForum('c2', 'outside-raids', [])
+      .catch((err: unknown) => err);
+    expect(channelLimitOf(tooMany)).toBe('server');
   });
 
   it('says what kind of channel an id is, from what it knows', () => {
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index a39f7e6f..864573e2 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -35,6 +35,19 @@ export function missingPermissions(method: string): DiscordAPIError {
   return new DiscordAPIError({ code, message: 'Missing Permissions' }, code, 403, method, '/x', {});
 }
 
+/** Discord's refusal of a new channel in a server that has 500. */
+export function serverFull(): DiscordAPIError {
+  const code = RESTJSONErrorCodes.MaximumNumberOfGuildChannelsReached;
+  return new DiscordAPIError(
+    { code, message: 'Maximum number of guild channels reached (500)' },
+    code,
+    400,
+    'POST',
+    '/guilds/1/channels',
+    {},
+  );
+}
+
 export interface FakePost {
   id: string;
   forumId: string;
@@ -400,6 +413,16 @@ export class FakePartyGateway implements PartyGateway {
   readonly noCreating = new Set<string>();
   /** The ids of the channels and categories that were created, in order. */
   readonly createdChannels: string[] = [];
+  /**
+   * A category made to continue another (`createCategory` with `like`): the one it was placed
+   * right after, by its id. It takes that one's overwrites (`categoryOverwrites`) too.
+   */
+  readonly placedAfter = new Map<string, string>();
+  /**
+   * Refuses a category that continues another (`like`) as Discord refuses a bot that may not set
+   * its overwrites: `no-permission`.
+   */
+  refuseCopies = false;
   /** What the server's audit log says of a channel created or deleted, by its id. */
   readonly auditReasons = new Map<string, string>();
   /** The edits of each post's message, by post (`postEdits`). */
@@ -491,6 +514,21 @@ export class FakePartyGateway implements PartyGateway {
       const categoryId = this.channels.get(regionChannelId)?.categoryId ?? null;
       const there = this.botIn(categoryId);
       if ((there & PermissionFlagsBits.ManageChannels) === 0n) throw missingPermissions('POST');
+      // As Discord: 50 channels in a category (forums included), 500 in a server.
+      const listed = this.serverChannels(this.guildId) ?? [];
+      if (categoryId && listed.filter((one) => one.categoryId === categoryId).length >= 50) {
+        throw refusedBody('parent_id', {
+          parent_id: {
+            _errors: [
+              {
+                code: 'CHANNEL_PARENT_MAX_CHANNELS',
+                message: 'Maximum number of channels in category reached (50)',
+              },
+            ],
+          },
+        });
+      }
+      if (listed.length >= 500) throw serverFull();
       const forumId = this.id();
       // Refused before anything is made, as Discord refuses the creation as a whole; its
       // overwrites may give only what the bot has in the server.
@@ -1415,10 +1453,29 @@ export class FakePartyGateway implements PartyGateway {
     return !this.noCreating.has(guildId);
   }
 
-  createCategory(guildId: string, name: string, reason?: string): Promise<CreatedChannel> {
-    return this.attempt('createCategory', name, () =>
-      this.createChannel(guildId, name, 'category', null, reason),
-    );
+  createCategory(
+    guildId: string,
+    name: string,
+    reason?: string,
+    like?: string,
+  ): Promise<CreatedChannel> {
+    return this.attempt('createCategory', name, () => {
+      const base = like === undefined || this.gone.has(like) ? undefined : this.channels.get(like);
+      const continues = base?.kind === 'category' ? like : undefined;
+      if (like !== undefined && continues === undefined) {
+        return { ok: false, reason: 'base-gone' } as const;
+      }
+      if (continues !== undefined && this.refuseCopies) {
+        return { ok: false, reason: 'no-permission' } as const;
+      }
+      const made = this.createChannel(guildId, name, 'category', null, reason);
+      if (made.ok && continues !== undefined) {
+        this.placedAfter.set(made.id, continues);
+        const overwrites = this.categoryOverwrites.get(continues);
+        if (overwrites) this.categoryOverwrites.set(made.id, [...overwrites]);
+      }
+      return made;
+    });
   }
 
   createTextChannel(
@@ -1448,9 +1505,9 @@ export class FakePartyGateway implements PartyGateway {
       const category = existing.find((channel) => channel.id === categoryId);
       if (category?.kind !== 'category') return { ok: false, reason: 'no-server' };
       const inside = existing.filter((channel) => channel.categoryId === categoryId).length;
-      if (inside >= 50) return { ok: false, reason: 'limit' };
+      if (inside >= 50) return { ok: false, reason: 'category-full' };
     }
-    if (existing.length >= 500) return { ok: false, reason: 'limit' };
+    if (existing.length >= 500) return { ok: false, reason: 'server-full' };
     const id = this.id();
     // Discord writes the name of a text channel its own way.
     const written = kind === 'text' ? name.toLowerCase().replace(/\s+/gu, '-') : name;
````

### Task 3: Plan 8S-4 T3: Meetup safety: a failed approval's post names the reason

Prototype commit: `cad1aac59af79c564973b355c3bcfaa8337e1191`

Matt's ruling of 2026-10-18: when an approved meetup cannot be made,
the request's post in the moderators' channel says why, for the other
moderators ("... could not be made: I am not allowed to make posts in
<#forum> (the server's staff must give me Manage Posts there). Its
maker was told."). The reason is kept with the decision as a short kind
(ApprovalFailure: bad-name, bad-description, no-region, no-forum,
no-post, error, or posts-refused with the forum and what the bot lacks
there) in the new nullable JSON column MeetupRequest.failure (migration
023), so a post drawn anew from the row says it too; the maker's DM
and the moderator's answer read the same kind. Rows from before, and a
kept reason that does not read, keep today's line.

**Files:**

```
 src/db/migrations/2026_10_18_023_meetup_request_failure.ts | 29 ++++++++++++++++
 src/db/migrations/index.ts                                 |  2 ++
 src/db/migrator.db.test.ts                                 |  1 +
 src/db/repositories/meetup-safety-repository.db.test.ts    | 13 +++++++
 src/db/repositories/meetup-safety-repository.ts            | 22 ++++++++++--
 src/db/types.ts                                            |  1 +
 src/domain/meetups/records.ts                              | 50 ++++++++++++++++++++++++---
 src/render/activity.ts                                     | 12 ++++---
 src/render/meetup-safety.test.ts                           | 40 ++++++++++++++++++++++
 src/render/meetup-safety.ts                                | 34 ++++++++++++++++---
 src/services/meetup-safety.test.ts                         | 21 ++++++++++--
 src/services/meetup-safety.ts                              | 62 +++++++++++++++-------------------
 test/support/meetup-safety-cases.ts                        | 26 +++++++++++---
 test/support/meetup-safety.ts                              |  5 ++-
 14 files changed, 262 insertions(+), 56 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/meetup-safety.test.ts src/services/meetup-safety.test.ts`); all pass.
  The database tests of this task (src/db/migrator.db.test.ts, src/db/repositories/meetup-safety-repository.db.test.ts) run with the database suite after the last task.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cad1aac59af79c564973b355c3bcfaa8337e1191 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-4 T3: Meetup safety: a failed approval's post names the reason`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/db/migrations/2026_10_18_023_meetup_request_failure.ts b/src/db/migrations/2026_10_18_023_meetup_request_failure.ts
new file mode 100644
index 00000000..22bb4a4a
--- /dev/null
+++ b/src/db/migrations/2026_10_18_023_meetup_request_failure.ts
@@ -0,0 +1,29 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Why an approved meetup could not be made (plan 8S-4): `MeetupRequest.failure` keeps it with a
+ * `failed` request, as a short JSON document of its kind (`ApprovalFailure`: `{"kind":
+ * "no-forum"}`, or `{"kind":"posts-refused","forumId":"…","missing":["Manage Posts"]}`), so that
+ * the moderators' post, drawn anew from the row, names it for the other moderators. Null for
+ * every other request and for every row from before, whose post says what it always said.
+ *
+ * 023: after 8S-2's `022_moderation_reports`.
+ *
+ * Safe to run again after a failure half-way: the column is added only when it is missing.
+ */
+export const meetupRequestFailure: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const existing = await sql<{ n: number }>`
+      select count(*) as n from information_schema.columns
+      where table_schema = database() and table_name = 'MeetupRequest'
+        and column_name = 'failure'`.execute(db);
+    if (Number(existing.rows[0]?.n ?? 0) === 0) {
+      await sql`alter table MeetupRequest add column failure json default null`.execute(db);
+    }
+  },
+  async down() {
+    // Additive only: the column stays.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index cb77f3dd..fc584782 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -21,6 +21,7 @@ import { meetupSafety } from './2026_10_17_019_meetup_safety.js';
 import { trainSplit } from './2026_10_17_020_train_split.js';
 import { meetupRequestSource } from './2026_10_17_021_meetup_request_source.js';
 import { moderationReports } from './2026_10_17_022_moderation_reports.js';
+import { meetupRequestFailure } from './2026_10_18_023_meetup_request_failure.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -49,4 +50,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_17_020_train_split': trainSplit,
   '2026_10_17_021_meetup_request_source': meetupRequestSource,
   '2026_10_17_022_moderation_reports': moderationReports,
+  '2026_10_18_023_meetup_request_failure': meetupRequestFailure,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 2c713701..903a4dc1 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -172,6 +172,7 @@ describe('runMigrations', () => {
       '2026_10_17_020_train_split',
       '2026_10_17_021_meetup_request_source',
       '2026_10_17_022_moderation_reports',
+      '2026_10_18_023_meetup_request_failure',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/meetup-safety-repository.db.test.ts b/src/db/repositories/meetup-safety-repository.db.test.ts
index f1505756..31f55b19 100644
--- a/src/db/repositories/meetup-safety-repository.db.test.ts
+++ b/src/db/repositories/meetup-safety-repository.db.test.ts
@@ -62,6 +62,19 @@ describe('MeetupSafetyRepository', () => {
     });
   });
 
+  it('reads a request whose kept failure it does not know as one without a reason', async () => {
+    await fresh();
+    const store = new MeetupSafetyRepository(db);
+    await store.addRequest(newRequest(1));
+    await store.decideRequest(requestId(1), 'approved', 'approve', MOD);
+    await store.settleApproval(requestId(1), { failed: { kind: 'no-forum' } });
+    await db
+      .updateTable('MeetupRequest')
+      .set({ failure: JSON.stringify({ kind: 'castle' }) })
+      .execute();
+    expect(await store.request(requestId(1))).toMatchObject({ status: 'failed', failure: null });
+  });
+
   it('marks a due request whose place is no place failed, and says so once', async () => {
     await fresh();
     const { log, entries } = createTestLogger();
diff --git a/src/db/repositories/meetup-safety-repository.ts b/src/db/repositories/meetup-safety-repository.ts
index 81adb8fe..748bd39d 100644
--- a/src/db/repositories/meetup-safety-repository.ts
+++ b/src/db/repositories/meetup-safety-repository.ts
@@ -1,5 +1,5 @@
 import type { Kysely, Selectable } from 'kysely';
-import { REQUEST_DECISIONS } from '../../domain/meetups/records.js';
+import { approvalFailureOf, REQUEST_DECISIONS } from '../../domain/meetups/records.js';
 import type {
   ApprovalOutcome,
   AppealStatus,
@@ -43,6 +43,16 @@ const STATUSES: readonly RequestStatus[] = [
 ];
 const APPEAL_STATUSES: readonly AppealStatus[] = ['open', 'lifted', 'kept', 'expired'];
 
+/** The kept reason of a failed request (`MeetupRequest.failure`), or null. */
+function failureOf(stored: unknown): MeetupRequestRecord['failure'] {
+  if (typeof stored !== 'string') return approvalFailureOf(stored);
+  try {
+    return approvalFailureOf(JSON.parse(stored));
+  } catch {
+    return null;
+  }
+}
+
 const epoch = (value: string | null): number | null => (value === null ? null : Number(value));
 
 /**
@@ -567,7 +577,13 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
   async settleApproval(id: string, outcome: ApprovalOutcome): Promise<boolean> {
     const [result] = await this.db
       .updateTable('MeetupRequest')
-      .set(typeof outcome === 'string' ? { status: outcome } : { partyId: outcome.partyId })
+      .set(
+        typeof outcome === 'string'
+          ? { status: outcome }
+          : 'failed' in outcome
+            ? { status: 'failed', failure: JSON.stringify(outcome.failed) }
+            : { partyId: outcome.partyId },
+      )
       .where('id', '=', id)
       .where('status', '=', 'approved')
       .where('partyId', 'is', null)
@@ -781,6 +797,8 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
       partyId: row.partyId,
       // Anything but the one source known is `/meetup`'s.
       source: row.source === 'map' ? 'map' : null,
+      // A reason that does not read is none: the post says what it said before reasons.
+      failure: row.status === 'failed' ? failureOf(row.failure) : null,
     };
   }
 }
diff --git a/src/db/types.ts b/src/db/types.ts
index 9c70133b..d89bd4b9 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -218,6 +218,7 @@ export interface MeetupRequest {
   decision: string | null;
   description: string;
   expiresAt: string;
+  failure: Json | null;
   id: string;
   makerId: string;
   makerName: string | null;
diff --git a/src/domain/meetups/records.ts b/src/domain/meetups/records.ts
index ad33a002..ab7e019a 100644
--- a/src/domain/meetups/records.ts
+++ b/src/domain/meetups/records.ts
@@ -60,6 +60,48 @@ export interface MeetupRequestRecord {
    * for `/meetup`.
    */
   source: RequestSource | null;
+  /**
+   * Of a `failed` request: why its meetup could not be made (plan 8S-4), which its post names
+   * for the other moderators; null for every other request, and for one that failed before the
+   * reason was kept (or whose reason does not read).
+   */
+  failure: ApprovalFailure | null;
+}
+
+/**
+ * Why an approved meetup could not be made, kept as a kind the post turns into words: its name
+ * or information could not be a meetup's (`bad-name`, `bad-description`), its region or the
+ * region's forum is gone (`no-region`, `no-forum`), its post could not be made (`no-post`), or
+ * the bot may not make posts in the forum (`posts-refused`: which forum, and what it lacks
+ * there by the names its settings show, none when Discord refused all the same); `error`:
+ * anything else (a throw, the bot stopped before the meetup was made).
+ */
+export type ApprovalFailure =
+  | { kind: 'bad-name' | 'bad-description' | 'no-region' | 'no-forum' | 'no-post' | 'error' }
+  | { kind: 'posts-refused'; forumId: string; missing: readonly string[] };
+
+const PLAIN_FAILURES: readonly Exclude<ApprovalFailure, { forumId: string }>['kind'][] = [
+  'bad-name',
+  'bad-description',
+  'no-region',
+  'no-forum',
+  'no-post',
+  'error',
+];
+
+/** A failure as it was kept (parsed JSON), or null when it is none or does not read. */
+export function approvalFailureOf(value: unknown): ApprovalFailure | null {
+  if (typeof value !== 'object' || value === null || !('kind' in value)) return null;
+  const { kind } = value;
+  if (kind === 'posts-refused') {
+    const forumId = 'forumId' in value ? value.forumId : undefined;
+    const missing = 'missing' in value ? value.missing : undefined;
+    if (typeof forumId !== 'string' || !Array.isArray(missing)) return null;
+    if (!missing.every((one): one is string => typeof one === 'string')) return null;
+    return { kind, forumId, missing };
+  }
+  const plain = PLAIN_FAILURES.find((one) => one === kind);
+  return plain === undefined ? null : { kind: plain };
 }
 
 /** Where a meetup was asked for other than by `/meetup`: the live map. */
@@ -68,14 +110,14 @@ export type RequestSource = 'map';
 /** A request as it is first stored: pending, with its post, without a decision. */
 export type NewMeetupRequest = Omit<
   MeetupRequestRecord,
-  'status' | 'decision' | 'decidedBy' | 'decidedByName' | 'decidedAt' | 'partyId'
+  'status' | 'decision' | 'decidedBy' | 'decidedByName' | 'decidedAt' | 'partyId' | 'failure'
 >;
 
 /**
- * What came of an approval: the meetup made (`partyId`), none (`failed`), or none because its
- * maker was blocked meanwhile (`withdrawn`).
+ * What came of an approval: the meetup made (`partyId`), none (`failed`, with why), or none
+ * because its maker was blocked meanwhile (`withdrawn`).
  */
-export type ApprovalOutcome = { partyId: string } | 'failed' | 'withdrawn';
+export type ApprovalOutcome = { partyId: string } | { failed: ApprovalFailure } | 'withdrawn';
 
 /** Who decided something, and when. */
 export interface Decider {
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 526e7629..195e4495 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -280,17 +280,21 @@ export function postsRefusedMoveWords(
 
 /**
  * Why an approved meetup could not be made where the bot may not make posts in its forum (plan
- * 8S-3), as the moderator and the maker are told it after "but": what it lacks there.
+ * 8S-3), as the moderator and the maker are told it after "but": what it lacks there. `forum`
+ * is how the forum is named: "its forum", or its mention in the moderators' post (plan 8S-4).
  */
-export function postsRefusedFailure(refused: PostsRefused): string {
+export function postsRefusedFailure(
+  refused: Pick<PostsRefused, 'missing'>,
+  forum = 'its forum',
+): string {
   if (refused.missing.length === 0) {
     return (
-      "Discord does not let me make posts in its forum (the server's staff must check that I " +
+      `Discord does not let me make posts in ${forum} (the server's staff must check that I ` +
       `have ${andList(POST_PERMISSIONS)} there)`
     );
   }
   return (
-    "I am not allowed to make posts in its forum (the server's staff must give me " +
+    `I am not allowed to make posts in ${forum} (the server's staff must give me ` +
     `${andList(refused.missing)} there)`
   );
 }
diff --git a/src/render/meetup-safety.test.ts b/src/render/meetup-safety.test.ts
index b65f5cf8..768ecc93 100644
--- a/src/render/meetup-safety.test.ts
+++ b/src/render/meetup-safety.test.ts
@@ -34,6 +34,7 @@ function pending(overrides: Partial<MeetupRequestRecord> = {}): MeetupRequestRec
     decidedByName: null,
     decidedAt: null,
     partyId: null,
+    failure: null,
     ...overrides,
   };
 }
@@ -122,6 +123,45 @@ describe('requestMessage', () => {
     expect(text).not.toContain('__Alice__');
   });
 
+  it('names why an approved meetup could not be made, as kept with the request', () => {
+    const failed = (failure: MeetupRequestRecord['failure']) =>
+      textOf(
+        requestMessage(
+          pending({
+            status: 'failed',
+            decision: 'approve',
+            decidedBy: '200000000000000009',
+            decidedByName: 'Mod',
+            decidedAt: SAFETY_NOW,
+            failure,
+          }),
+        ),
+      );
+    const by = `by **Mod** (<@200000000000000009>) <t:${String(SAFETY_NOW / 1000)}:R>`;
+    expect(
+      failed({ kind: 'posts-refused', forumId: '300000000000000001', missing: ['Manage Posts'] }),
+    ).toContain(
+      `**Approved** ${by}, but the meetup could not be made: I am not allowed to make posts ` +
+        "in <#300000000000000001> (the server's staff must give me Manage Posts there). Its " +
+        'maker was told.',
+    );
+    expect(failed({ kind: 'posts-refused', forumId: '300000000000000001', missing: [] })).toContain(
+      ', but the meetup could not be made: Discord does not let me make posts in ' +
+        "<#300000000000000001> (the server's staff must check that I have View Channel, Create " +
+        'Posts, Send Messages in Posts and Manage Posts there). Its maker was told.',
+    );
+    expect(failed({ kind: 'no-forum' })).toContain(
+      ', but the meetup could not be made: its region has no forum. Its maker was told.',
+    );
+    expect(failed({ kind: 'error' })).toContain(
+      ', but the meetup could not be made: something went wrong. Its maker was told.',
+    );
+    // A request failed before the reason was kept says what it always said.
+    expect(failed(null)).toContain(
+      `**Approved** ${by}, but the meetup could not be made. Its maker was told.`,
+    );
+  });
+
   it('fits the longest name, title and information with every character escaped', () => {
     const message = requestMessage(
       pending({
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
index 846a03c8..b4cc6cb7 100644
--- a/src/render/meetup-safety.ts
+++ b/src/render/meetup-safety.ts
@@ -8,12 +8,14 @@ import { encodeCustomId } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import type { Place } from '../domain/geo/place.js';
 import type {
+  ApprovalFailure,
   MeetupAppeal,
   MeetupBlock,
   MeetupRequestRecord,
   RequestDecision,
 } from '../domain/meetups/records.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
+import { postsRefusedFailure } from './activity.js';
 import { nearLine } from './spawn.js';
 import { memberText, plain, plainLines, plainNoLinks, timestamp, truncate } from './text.js';
 import {
@@ -99,6 +101,25 @@ function decidedWhen(request: MeetupRequestRecord): string {
   return request.decidedAt === null ? '' : ` ${timestamp(request.decidedAt, 'R')}`;
 }
 
+const FAILURES: Readonly<Record<Exclude<ApprovalFailure['kind'], 'posts-refused'>, string>> = {
+  'bad-name': 'its name is no name',
+  'bad-description': 'its information is too long',
+  'no-region': 'its region is gone',
+  'no-forum': 'its region has no forum',
+  'no-post': 'its post could not be made',
+  error: 'something went wrong',
+};
+
+/**
+ * Why an approved meetup could not be made, as words after "but …: " (plan 8S-4): for the
+ * moderator who pressed and the maker the forum is "its forum"; the moderators' post names it
+ * (`named`).
+ */
+export function approvalFailureWords(failure: ApprovalFailure, named = false): string {
+  if (failure.kind !== 'posts-refused') return FAILURES[failure.kind];
+  return postsRefusedFailure(failure, named ? `<#${failure.forumId}>` : undefined);
+}
+
 /** What came of a request that is no longer pending, as the post's last line, and its edge. */
 function outcomeOf(
   request: MeetupRequestRecord,
@@ -118,7 +139,11 @@ function outcomeOf(
     case 'failed':
       return {
         accent: REFUSED_ACCENT,
-        line: `**Approved** ${by}, but the meetup could not be made. Its maker was told.`,
+        line:
+          request.failure === null
+            ? `**Approved** ${by}, but the meetup could not be made. Its maker was told.`
+            : `**Approved** ${by}, but the meetup could not be made: ` +
+              `${approvalFailureWords(request.failure, true)}. Its maker was told.`,
       };
     case 'refused':
       return {
@@ -301,12 +326,12 @@ export const APPEAL_WAIT_DAYS = 7;
 /**
  * The direct message that tells a request's maker what came of it (the design: approved with a
  * link to the post, refused, expired; never why). `postUrl` is the address of the meetup's post
- * (`postLink`), `failure` why an approved meetup could not be made. The name goes through
+ * (`postLink`); a failed request says why (`MeetupRequestRecord.failure`). The name goes through
  * `plainNoLinks`, as all text of members in DMs.
  */
 export function requestOutcomeDm(
   request: MeetupRequestRecord,
-  more: { postUrl?: string; failure?: string } = {},
+  more: { postUrl?: string } = {},
 ): V2Message {
   const name = `**${plainNoLinks(request.name)}**`;
   switch (request.status) {
@@ -321,7 +346,8 @@ export function requestOutcomeDm(
     case 'failed':
       return textMessage(REFUSED_ACCENT, [
         `A moderator approved your meetup ${name}, but I could not make it: ` +
-          `${more.failure ?? 'something went wrong'}. Use \`/meetup\` again later.`,
+          `${approvalFailureWords(request.failure ?? { kind: 'error' })}. Use \`/meetup\` again ` +
+          'later.',
       ]);
     case 'expired':
       return textMessage(EXPIRED_ACCENT, [
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index 86ae8b60..8752e8d4 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -390,8 +390,11 @@ describe('MeetupSafety.decide', () => {
     expect(made.storage.requests.get(request.id)).toMatchObject({
       status: 'failed',
       partyId: null,
+      failure: { kind: 'no-forum' },
     });
-    expect(textOf(made.postOf(request)?.message)).toContain('but the meetup could not be made');
+    expect(textOf(made.postOf(request)?.message)).toContain(
+      'but the meetup could not be made: its region has no forum. Its maker was told.',
+    );
     expect(textOf(made.dms.to(ALICE)[0])).toBe(
       'A moderator approved your meetup **Book swap**, but I could not make it: its region has ' +
         'no forum. Use `/meetup` again later.',
@@ -409,6 +412,17 @@ describe('MeetupSafety.decide', () => {
         "I am not allowed to make posts in its forum (the server's staff must give me Create " +
         'Posts and Manage Posts there)',
     });
+    // The other moderators read it in the post, which is drawn from what is kept.
+    expect(made.storage.requests.get(request.id)?.failure).toEqual({
+      kind: 'posts-refused',
+      forumId: WEST_FORUM,
+      missing: ['Create Posts', 'Manage Posts'],
+    });
+    expect(textOf(made.postOf(request)?.message)).toContain(
+      `but the meetup could not be made: I am not allowed to make posts in <#${WEST_FORUM}> ` +
+        "(the server's staff must give me Create Posts and Manage Posts there). Its maker was " +
+        'told.',
+    );
     made.gateway.refusePosts.set(WEST_FORUM, []);
     const second = await made.held();
     expect(await made.safety.decide(second.id, 'approve', MODERATOR_MEMBER, SERVER)).toMatchObject({
@@ -528,8 +542,11 @@ describe('MeetupSafety.expire', () => {
     expect(made.storage.requests.get(request.id)).toMatchObject({
       status: 'failed',
       partyId: null,
+      failure: { kind: 'error' },
     });
-    expect(textOf(made.postOf(request)?.message)).toContain('but the meetup could not be made');
+    expect(textOf(made.postOf(request)?.message)).toContain(
+      'but the meetup could not be made: something went wrong. Its maker was told.',
+    );
     expect(buttonLabels(made.postOf(request)?.message)).toEqual([]);
     expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
       'A moderator approved your meetup **Book swap**, but I could not make it: something went ' +
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index 108b0b24..c65da8b2 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -3,6 +3,7 @@ import type { Settings } from '../config/settings.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import type { KnownPlace, Place } from '../domain/geo/place.js';
 import type {
+  ApprovalFailure,
   Decider,
   MeetupAppeal,
   MeetupBlock,
@@ -33,6 +34,7 @@ import type { Logger } from '../log.js';
 import {
   APPEAL_WAIT_DAYS,
   appealMessage,
+  approvalFailureWords,
   blockableLater,
   appealOutcomeDm,
   blockedDm,
@@ -40,7 +42,6 @@ import {
   requestMessage,
   requestOutcomeDm,
 } from '../render/meetup-safety.js';
-import { postsRefusedFailure } from '../render/activity.js';
 import { postLink } from '../render/notify-dm.js';
 import { ASK_OPEN_DAYS, askMessage, askOutcomeDm } from '../render/place-asks.js';
 import { DM_PRIORITY, type DmSender } from './dm-sender.js';
@@ -372,6 +373,7 @@ export class MeetupSafety {
       decidedAt: null,
       partyId: null,
       source: ask.source ?? null,
+      failure: null,
     };
     let messageId: string | undefined;
     try {
@@ -517,9 +519,10 @@ export class MeetupSafety {
       if (closed === 'closed') return this.withdraw(decided);
       unclosed = closed === 'close-failed';
     }
+    const failure: ApprovalFailure = made.failure ?? { kind: 'error' };
     try {
       if (made.partyId === undefined) {
-        await storage.settleApproval(decided.id, 'failed');
+        await storage.settleApproval(decided.id, { failed: failure });
       } else {
         const party = { partyId: made.partyId };
         // The meetup is there: a write that fails once is tried again before the sweep would
@@ -537,15 +540,15 @@ export class MeetupSafety {
     }
     const settled: MeetupRequestRecord =
       made.partyId === undefined
-        ? { ...decided, status: 'failed' }
+        ? { ...decided, status: 'failed', failure }
         : { ...decided, partyId: made.partyId };
     if (unclosed) await this.show(settled, made.postId);
-    else await this.tell(settled, made);
+    else await this.tell(settled, made.postId);
     return {
       kind: 'done',
       request: settled,
       ...(made.postId === undefined ? {} : { postId: made.postId }),
-      ...(made.failure === undefined ? {} : { failure: made.failure }),
+      ...(made.partyId === undefined ? { failure: approvalFailureWords(failure) } : {}),
     };
   }
 
@@ -1367,8 +1370,9 @@ export class MeetupSafety {
       (one) => one.timed.name === request.name && one.timed.startTime === request.startTime,
     );
     if (party === undefined) {
-      if (await storage.settleApproval(request.id, 'failed')) {
-        await this.tell({ ...request, status: 'failed' }, { failure: FAILURE });
+      const failure: ApprovalFailure = { kind: 'error' };
+      if (await storage.settleApproval(request.id, { failed: failure })) {
+        await this.tell({ ...request, status: 'failed', failure });
       }
       return;
     }
@@ -1418,7 +1422,7 @@ export class MeetupSafety {
   /** Makes the meetup of an approved request, as its maker asked for it. */
   private async makeApproved(
     request: MeetupRequestRecord,
-  ): Promise<{ partyId?: string; postId?: string; failure?: string }> {
+  ): Promise<{ partyId?: string; postId?: string; failure?: ApprovalFailure }> {
     const { parties, log } = this.options;
     try {
       const outcome = await parties.createMeetup({
@@ -1440,32 +1444,34 @@ export class MeetupSafety {
       return {
         failure:
           outcome.kind === 'no-post' && outcome.refused !== undefined
-            ? postsRefusedFailure(outcome.refused)
-            : FAILURES[outcome.kind],
+            ? {
+                kind: 'posts-refused',
+                forumId: outcome.refused.forumId,
+                missing: [...outcome.refused.missing],
+              }
+            : { kind: outcome.kind },
       };
     } catch (err) {
       log.error({ err, request: request.id }, 'could not make an approved meetup');
-      return { failure: FAILURE };
+      return { failure: { kind: 'error' } };
     }
   }
 
   /**
-   * Shows what came of a request in its post (without buttons) and tells its maker by DM. What
-   * fails on Discord is logged: the decision stands.
+   * Shows what came of a request in its post (without buttons) and tells its maker by DM (a
+   * failed one says why, `MeetupRequestRecord.failure`). What fails on Discord is logged: the
+   * decision stands.
    */
-  private async tell(
-    request: MeetupRequestRecord,
-    made: { postId?: string; failure?: string } = {},
-  ): Promise<void> {
+  private async tell(request: MeetupRequestRecord, postId?: string): Promise<void> {
     const { dms } = this.options;
     const now = this.now();
-    await this.show(request, made.postId);
+    await this.show(request, postId);
     dms.send({
       userId: request.makerId,
-      message: requestOutcomeDm(request, {
-        ...(made.postId === undefined ? {} : { postUrl: postLink(request.serverId, made.postId) }),
-        ...(made.failure === undefined ? {} : { failure: made.failure }),
-      }),
+      message: requestOutcomeDm(
+        request,
+        postId === undefined ? {} : { postUrl: postLink(request.serverId, postId) },
+      ),
       priority: DM_PRIORITY.normal,
       eventAt: now,
       expiresAt: Math.max(request.startTime, now + DM_HOURS * 3_600_000),
@@ -1499,9 +1505,6 @@ export class MeetupSafety {
 /** How long the DM of an outcome may wait at least: past the meetup's start it says nothing. */
 const DM_HOURS = 1;
 
-/** Why an approval failed that nothing else explains: a throw, or the bot stopping meanwhile. */
-const FAILURE = 'something went wrong';
-
 /**
  * How old an approval without its meetup must be before the sweep fails it: making a meetup
  * takes seconds, so one this old was left by a stop in between.
@@ -1566,15 +1569,6 @@ export type AppealDecision =
   | { kind: 'decided-before'; appeal: MeetupAppeal }
   | { kind: 'done'; appeal: MeetupAppeal };
 
-/** Why an approved meetup could not be made, as the moderator and the maker are told. */
-const FAILURES: Record<Exclude<MeetupOutcome['kind'], 'created'>, string> = {
-  'bad-name': 'its name is no name',
-  'bad-description': 'its information is too long',
-  'no-region': 'its region is gone',
-  'no-forum': 'its region has no forum',
-  'no-post': 'its post could not be made',
-};
-
 /** What came of a moderator's press on a request's post. */
 export type DecideOutcome =
   /** There is no such request in the presser's server. */
diff --git a/test/support/meetup-safety-cases.ts b/test/support/meetup-safety-cases.ts
index d47cc4cc..d5829d82 100644
--- a/test/support/meetup-safety-cases.ts
+++ b/test/support/meetup-safety-cases.ts
@@ -316,6 +316,7 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
       decidedByName: null,
       decidedAt: null,
       partyId: null,
+      failure: null,
     });
     await store.addRequest(newRequest(2, { makerTeam: null, makerName: null, source: 'map' }));
     expect(await store.request(requestId(2))).toMatchObject({
@@ -352,8 +353,23 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
     });
     await store.addRequest(newRequest(2));
     await store.decideRequest(requestId(2), 'approved', 'approve-once', MOD);
-    expect(await store.settleApproval(requestId(2), 'failed')).toBe(true);
-    expect(await store.request(requestId(2))).toMatchObject({ status: 'failed', partyId: null });
+    const refused = {
+      kind: 'posts-refused',
+      forumId: '300000000000000001',
+      missing: ['Manage Posts'],
+    } as const;
+    expect(await store.settleApproval(requestId(2), { failed: refused })).toBe(true);
+    expect(await store.request(requestId(2))).toMatchObject({
+      status: 'failed',
+      partyId: null,
+      failure: { kind: 'posts-refused', forumId: '300000000000000001', missing: ['Manage Posts'] },
+    });
+    // Kept as the kind alone where nothing more is to be said.
+    await store.addRequest(newRequest(3));
+    await store.decideRequest(requestId(3), 'approved', 'approve', MOD);
+    await store.settleApproval(requestId(3), { failed: { kind: 'no-forum' } });
+    expect((await store.request(requestId(3)))?.failure).toEqual({ kind: 'no-forum' });
+    expect((await store.request(requestId(1)))?.failure).toBeNull();
     expect(await store.decideRequest(requestId(9), 'refused', 'refuse', MOD)).toBe(false);
   });
 
@@ -556,15 +572,15 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
       expect.objectContaining({ id: requestId(3) }),
     ]);
     expect(await store.settleApproval(requestId(1), 'withdrawn')).toBe(true);
-    expect(await store.settleApproval(requestId(1), 'failed')).toBe(false);
+    expect(await store.settleApproval(requestId(1), { failed: { kind: 'error' } })).toBe(false);
     expect(await store.request(requestId(1))).toMatchObject({
       status: 'withdrawn',
       decision: 'approve-once',
     });
     expect(await store.settleApproval(requestId(2), { partyId: PARTY })).toBe(true);
-    expect(await store.settleApproval(requestId(2), 'failed')).toBe(false);
+    expect(await store.settleApproval(requestId(2), { failed: { kind: 'error' } })).toBe(false);
     expect(await store.request(requestId(2))).toMatchObject({ status: 'approved', partyId: PARTY });
-    expect(await store.settleApproval(requestId(5), 'failed')).toBe(false);
+    expect(await store.settleApproval(requestId(5), { failed: { kind: 'error' } })).toBe(false);
     expect((await store.strandedApprovals(MOD.at + 4)).map((one) => one.id)).toEqual([
       requestId(3),
       requestId(4),
diff --git a/test/support/meetup-safety.ts b/test/support/meetup-safety.ts
index eb5925b0..e35ad705 100644
--- a/test/support/meetup-safety.ts
+++ b/test/support/meetup-safety.ts
@@ -376,6 +376,7 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
       decidedByName: null,
       decidedAt: null,
       partyId: null,
+      failure: null,
     });
   }
 
@@ -413,7 +414,9 @@ export class MemoryMeetupSafety implements MeetupSafetyStore {
       id,
       typeof outcome === 'string'
         ? { ...found, status: outcome }
-        : { ...found, partyId: outcome.partyId },
+        : 'failed' in outcome
+          ? { ...found, status: 'failed', failure: structuredClone(outcome.failed) }
+          : { ...found, partyId: outcome.partyId },
     );
     return true;
   }
````

### Task 4: Plan 8S-4 T4: Web map: a train at a gym is a ring around it, not a dot over it

Prototype commit: `17b3586aa0dd555de7f2426e3ba1171cf2fdc505`

A train's filled dot at its stop lay over the gym's marker, so the gym's
popup and its raids could not be reached while the train was there
(staging of 8S-3, Schenley Fountain). The train is now drawn as an
unfilled ring around the gym (trainMarker), on the pane the meetups'
rings use (renamed RING_PANE): a click inside reaches the gym's dot or
its raids' marker, a click on the line opens the train. Its size lies
between a gym's dot and a meetup's ring, so the three at one gym hide
none of each other. A train not at a stop yet is a dashed, pale ring at
its first gym (that place is a gym too, so a dot there hid it the same
way).

**Files:**

```
 src/web/client/main.ts                      |  5 ++--
 src/web/client/party-layer.isolated.test.ts | 68 +++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/client/party-layer.ts               | 66 +++++++++++++++++++++++++++++++++++++----------
 3 files changed, 120 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/party-layer.isolated.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 17b3586aa0dd555de7f2426e3ba1171cf2fdc505 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-4 T4: Web map: a train at a gym is a ring around it, not a dot over it`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 227cd15c..dbb2e8db 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -4,7 +4,7 @@ import { addTiles, byId, getJson, say, showAccount } from './common.js';
 import { gymFilter } from './filter.js';
 import { tileLayers } from './layers.js';
 import { loginNotice } from './notice.js';
-import { gymClicks, showParties } from './party-layer.js';
+import { GYM_DOT, gymClicks, showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 import { heldContent } from './raid-forms.js';
 import { theme } from './theme.js';
@@ -61,8 +61,7 @@ async function showGeo(
   const dots = view.gyms.map((gym: MapGym) => ({
     gym,
     dot: L.circleMarker([gym.lat, gym.lon], {
-      radius: 6,
-      weight: 2,
+      ...GYM_DOT,
       color: theme().colours.gym,
       fillOpacity: 0.8,
     }).bindPopup(
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index 4a5697c7..cbe67dd3 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -1,10 +1,23 @@
+import type * as L from 'leaflet';
 import { afterEach, describe, expect, it, vi } from 'vitest';
-import { gymClicks, showParties } from './party-layer.js';
+import {
+  GYM_DOT,
+  MEETUP_RING,
+  RING_PANE,
+  gymClicks,
+  showParties,
+  trainMarker,
+} from './party-layer.js';
 
 // Leaflet reads the browser's `window` as it loads: what `gymClicks` uses of it is how an event
 // is stopped, recorded here; what `showParties` uses of it as it starts is a layer group added to
-// the map. Isolated: a mocked module needs a module graph of its own.
+// the map; the circles drawn are recorded with their options. Isolated: a mocked module needs a
+// module graph of its own.
 const stopped = vi.hoisted(() => [] as unknown[]);
+const renderers = vi.hoisted(() => [] as Record<string, unknown>[]);
+const circles = vi.hoisted(
+  () => [] as { at: [number, number]; options: Record<string, unknown> }[],
+);
 vi.mock('leaflet', () => ({
   DomEvent: {
     stop: (event: unknown) => {
@@ -15,8 +28,53 @@ vi.mock('leaflet', () => ({
     const group = { addTo: () => group, clearLayers: () => group };
     return group;
   },
+  circleMarker: (at: [number, number], options: Record<string, unknown>) => {
+    circles.push({ at, options });
+    return { at, options };
+  },
+  svg: (options: Record<string, unknown>) => {
+    renderers.push(options);
+    return { svg: options };
+  },
 }));
 
+describe("a train's place on the map (trainMarker)", () => {
+  /** How far from its centre a circle's stroke reaches, inside and out. */
+  const edges = (circle: { radius: number; weight: number }) => ({
+    inner: circle.radius - circle.weight / 2,
+    outer: circle.radius + circle.weight / 2,
+  });
+
+  it("rings the gym a train is at, on the rings' pane, leaving the gym's dot to click", () => {
+    circles.length = 0;
+    const rings = { svg: { pane: RING_PANE } } as unknown as L.Renderer;
+    trainMarker({ lat: 40.44, lon: -79.95 }, true, true, '#ff7a00', rings);
+    const [ring] = circles;
+    // Drawn as SVG on its pane whatever the map prefers: a canvas would take the clicks inside
+    // an unfilled ring as the ring's.
+    expect(ring?.options.renderer).toBe(rings);
+    expect(ring?.at).toEqual([40.44, -79.95]);
+    // Unfilled: a click inside the ring reaches the gym's marker below; its line opens the
+    // train's popup, above the markers (a raid's picture) on the pane of the rings.
+    expect(ring?.options).toMatchObject({ fill: false, pane: RING_PANE, interactive: true });
+    const train = edges(ring?.options as { radius: number; weight: number });
+    // Neither the gym's dot nor a meetup's ring at the same gym lies under the train's line.
+    expect(edges(GYM_DOT).outer).toBeLessThanOrEqual(train.inner);
+    expect(train.outer).toBeLessThanOrEqual(edges(MEETUP_RING).inner);
+  });
+
+  it('rings the first gym of a train not at a stop yet, dashed and pale', () => {
+    circles.length = 0;
+    trainMarker({ lat: 40.44, lon: -79.95 }, false, false, '#ff7a00', {} as unknown as L.Renderer);
+    expect(circles[0]?.options).toMatchObject({
+      fill: false,
+      pane: RING_PANE,
+      interactive: false,
+      dashArray: expect.any(String) as string,
+    });
+  });
+});
+
 /** A gym's layer: its handlers by event, and how often its popup was opened. */
 function gymLayer() {
   const handlers = new Map<string, ((event: unknown) => void)[]>();
@@ -180,6 +238,12 @@ describe("the map's popups (showParties)", () => {
     return { fire };
   };
 
+  it('draws the rings of meetups and trains with one SVG renderer on their pane', () => {
+    renderers.length = 0;
+    started();
+    expect(renderers).toEqual([{ pane: RING_PANE }]);
+  });
+
   it("keeps a click from the map's container once the popup opened, though its button was taken out of the page", () => {
     const { fire } = started();
     // The map's container, the popup's element in it, and a button the click takes out of the
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 90710400..20b774cd 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -50,9 +50,47 @@ import { theme } from './theme.js';
 const EVERY_MS = 20_000;
 const COUNTDOWN_MS = 15_000;
 const ICON_SIZE = 36;
-/** The pane of the meetups' rings: above Leaflet's markers (600), below its tooltips (650). */
-const MEETUP_PANE = 'meetups';
-const MEETUP_PANE_Z = 625;
+/**
+ * The pane of the rings of meetups and trains: above Leaflet's markers (600), below its tooltips
+ * (650).
+ */
+export const RING_PANE = 'rings';
+const RING_PANE_Z = 625;
+/** A gym's dot on the map (`main.ts`). */
+export const GYM_DOT = { radius: 6, weight: 2 } as const;
+/** The ring of a meetup at its place. */
+export const MEETUP_RING = { radius: 12, weight: 4 } as const;
+/**
+ * The ring of a train at its gym (plan 8S-4): between the gym's dot and a meetup's ring, so that
+ * the three at one gym hide none of each other.
+ */
+const TRAIN_RING = { radius: 8.5, weight: 3 } as const;
+
+/**
+ * Where a train is on the map (plan 8S-4): a ring around the gym of its stop, unfilled, so that a
+ * click inside it reaches the gym's dot or the marker of its raids, and its line opens the train's
+ * popup; on the pane of the rings, above the markers. A train not at a stop yet is a dashed, pale
+ * ring at its first gym; drawn in `colour` (the theme's train colour). `interactive` is false while
+ * the trains let clicks through (route mode, a meetup's place picked); `renderer` is the rings'
+ * SVG renderer on their pane (a canvas would take the clicks inside the ring).
+ */
+export function trainMarker(
+  where: { lat: number; lon: number },
+  atStop: boolean,
+  interactive: boolean,
+  colour: string,
+  renderer: L.Renderer,
+): L.CircleMarker {
+  return L.circleMarker([where.lat, where.lon], {
+    ...TRAIN_RING,
+    renderer,
+    color: colour,
+    fill: false,
+    interactive,
+    pane: RING_PANE,
+    ...(atStop ? {} : { opacity: 0.6, dashArray: '3 3' }),
+  });
+}
 
 /** Makes the elements of a node; a click on a button in them presses it. */
 type Draw = (node: PageNode) => HTMLElement;
@@ -153,7 +191,10 @@ export function showParties(
 ): MapRaids {
   const layer = L.layerGroup().addTo(map);
   // Leaflet sets the pane's place by its style from the script (no style element).
-  map.createPane(MEETUP_PANE).style.zIndex = String(MEETUP_PANE_Z);
+  map.createPane(RING_PANE).style.zIndex = String(RING_PANE_Z);
+  // The rings are SVG whatever the map prefers: a canvas takes a click inside an unfilled circle
+  // as the circle's, and the gym's marker inside would get none.
+  const rings = L.svg({ pane: RING_PANE });
   const panel = byId('parties');
   /** The trains' box at the top of the side panel: "New train", or the form or editor open. */
   const tools = document.createElement('div');
@@ -317,12 +358,12 @@ export function showParties(
       const gym = place.gymId === null ? undefined : gyms.get(place.gymId);
       withPopup(
         L.circleMarker(gym ? [gym.lat, gym.lon] : [place.lat, place.lon], {
-          radius: 12,
+          ...MEETUP_RING,
+          renderer: rings,
           color: theme().colours.meetup,
-          weight: 4,
           fill: false,
           interactive,
-          pane: MEETUP_PANE,
+          pane: RING_PANE,
         }),
         `meetup:${meetup.id}`,
         () => meetupPopup(meetup, context(), meetupActions(meetup)),
@@ -347,16 +388,13 @@ export function showParties(
           popup,
         ).addTo(layer);
       }
+      // A ring around the gym of its stop (or its first gym before it starts): the gym's own
+      // marker inside it stays a marker to click (plan 8S-4).
       const at = train.stop === null ? undefined : gyms.get(train.route[train.stop] ?? -1);
-      const where = at ? L.latLng(at.lat, at.lon) : places[0];
+      const where = at ?? train.route.map((id) => gyms.get(id)).find((gym) => gym !== undefined);
       if (where) {
         withPopup(
-          L.circleMarker(where, {
-            radius: 9,
-            color: theme().colours.train,
-            fillOpacity: at ? 1 : 0.3,
-            interactive,
-          }),
+          trainMarker(where, at !== undefined, interactive, theme().colours.train, rings),
           `train:${train.id}`,
           popup,
         ).addTo(layer);
````

### Task 5: Plan 8S-4 T5: Give-backs: the use of /location behind a refused move, and the map's raid changes

Prototype commit: `bd06d88e48c3db5fc1f6375368647738b9e29a19`

Two loose ends of 8S-3. A "Move it there" press refused because no post
could be made in the other region's forum gave back the press but not
the use of /location that asked, which did nothing either: the question
now carries that use (`carriesOn`, with when the router counted it), so
it goes back with the press. A cancelled or done move still counts.

The map's raid Change... cannot move a raid into another forum (it sets
the hatch or end time, the boss or the moves; only /location moves a
raid), so no post can be refused there. But a change whose work failed
unexpectedly kept its use counted, where /hatch and the map's other
actions give theirs back: it is given back now, in its command's window.

**Files:**

```
 src/commands/raids/location.test.ts | 28 ++++++++++++++++++++++++++++
 src/commands/raids/location.ts      | 34 +++++++++++++++++++++++++++++++---
 src/web/raid-change.test.ts         | 17 ++++++++++++++++-
 src/web/raid-routes.ts              | 12 ++++++++++++
 4 files changed, 87 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/raids/location.test.ts src/web/raid-change.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bd06d88e48c3db5fc1f6375368647738b9e29a19 -- src test scripts userscript` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-4 T5: Give-backs: the use of /location behind a refused move, and the map's raid changes`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/raids/location.test.ts b/src/commands/raids/location.test.ts
index 3339b1a5..70afa38a 100644
--- a/src/commands/raids/location.test.ts
+++ b/src/commands/raids/location.test.ts
@@ -301,6 +301,34 @@ describe('/location to a gym of another region', () => {
     const late = await made.click(first, 0);
     expect(sent(late.update).content).toBe('That choice has expired. Use `/location` again.');
     expect(made.current().gymId).toBe(1);
+    // Nor did the uses of `/location` that asked count (plan 8S-4): it may be used again.
+    const more = await made.run({ gym: 'g:7' });
+    expect(sent(more.reply).content).toContain('Move it?');
+  });
+
+  it('keeps the answer and counts the use of a move that landed before a later step failed', async () => {
+    const made = await setup();
+    // The raid moved and the member was told, then closing the old post failed.
+    vi.spyOn(made.raids, 'setGym').mockImplementation(async (_id, _member, _gym, moved) => {
+      await moved?.({ ...made.current(), forumPostId: '900000000000009999' });
+      throw new Error('Discord is away');
+    });
+    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
+      const yes = await made.click(await made.run({ gym: 'g:7' }), 0);
+      expect(sent(yes.editReply).content).toContain('This raid is now at');
+      expect(yes.followUp).not.toHaveBeenCalled();
+    }
+    const more = await made.run({ gym: 'g:7' });
+    expect(sent(more.reply).content).toContain('You can use /location again');
+  });
+
+  it('counts the use of /location whose move was cancelled or done', async () => {
+    const made = await setup();
+    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
+      await made.click(await made.run({ gym: 'g:7' }), 1);
+    }
+    const more = await made.run({ gym: 'g:7' });
+    expect(sent(more.reply).content).not.toContain('Move it?');
   });
 
   it('takes the buttons away and reports the failure when the move fails', async () => {
diff --git a/src/commands/raids/location.ts b/src/commands/raids/location.ts
index 66223c5e..10d8f56f 100644
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -7,6 +7,7 @@ import {
 } from 'discord.js';
 import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
+import { whenCounted } from '../../discord/router.js';
 import { UserError } from '../../discord/errors.js';
 import { raidOf, regionChannelOf, requireRaid } from '../../discord/guards.js';
 import { blocksNewRaid, raidKindOf } from '../../domain/party/raid.js';
@@ -20,6 +21,8 @@ import { gymChoices, reportedGym } from './raid-input.js';
 
 /** The custom-id kind of the question `/location` asks before a move to another region. */
 const KIND = 'location';
+/** The name of the command, as the router counts its uses. */
+const LOCATION = 'location';
 const EXPIRED = 'That choice has expired. Use `/location` again.';
 const NOT_MOVED = 'Nothing was moved.';
 
@@ -27,6 +30,11 @@ const NOT_MOVED = 'Nothing was moved.';
 interface PendingMove {
   partyId: string;
   gymId: number;
+  /**
+   * When the router counted the use of `/location` that asked (`whenCounted`): a move refused for
+   * none of the member's doing gives it back to that window (`carriesOn`, plan 8S-4).
+   */
+  countedAt: number;
 }
 
 const pending = new PendingRequests<PendingMove>();
@@ -41,7 +49,7 @@ const pending = new PendingRequests<PendingMove>();
  */
 export const location: SimpleCommand = {
   data: new SlashCommandBuilder()
-    .setName('location')
+    .setName(LOCATION)
     .setDescription('Move this raid to another gym, when it was reported at the wrong one')
     .addStringOption((option) =>
       option
@@ -104,7 +112,11 @@ export const location: SimpleCommand = {
           (post ? ` Its post is <#${post}>.` : ''),
       );
     }
-    const token = pending.put(interaction.user.id, { partyId: party.id, gymId: gym.id });
+    const token = pending.put(interaction.user.id, {
+      partyId: party.id,
+      gymId: gym.id,
+      countedAt: whenCounted(interaction) ?? Date.now(),
+    });
     const button = (action: string, label: string, style: ButtonStyle) =>
       new ButtonBuilder()
         .setCustomId(encodeCustomId({ kind: KIND, id: token, action }))
@@ -143,10 +155,20 @@ export const location: SimpleCommand = {
   },
 };
 
-/** The two buttons under the question of `/location`. */
+/**
+ * The two buttons under the question of `/location`. A press counts in its own window; one whose
+ * move is refused for none of the member's doing (no post in the other forum) gives back both
+ * the press and the use of `/location` that asked (`carriesOn`: that use did nothing either).
+ */
 export const locationControls: ComponentHandler = {
   kind: KIND,
   throttle: CHANGE_THROTTLE,
+  carriesOn: (interaction, id) => {
+    const asked = pending.peek(id.id, interaction.user.id);
+    return typeof asked === 'object'
+      ? { ...CHANGE_THROTTLE, as: LOCATION, countedAt: asked.value.countedAt }
+      : undefined;
+  },
 
   async button(interaction, id, ctx) {
     const taken = pending.take(id.id, interaction.user.id);
@@ -183,6 +205,12 @@ export const locationControls: ComponentHandler = {
         ),
       );
     } catch (err) {
+      // The raid moved, and the member was told so, before a later step failed (closing the
+      // old post): the move stands and its use stays counted, so the failure is only logged.
+      if (answered) {
+        ctx.log.error({ err, party: partyId }, 'a raid moved, but a step after it failed');
+        return;
+      }
       try {
         await say(NOT_MOVED);
       } catch {
diff --git a/src/web/raid-change.test.ts b/src/web/raid-change.test.ts
index b329b325..c0d4039d 100644
--- a/src/web/raid-change.test.ts
+++ b/src/web/raid-change.test.ts
@@ -1,4 +1,4 @@
-import { afterEach, describe, expect, it } from 'vitest';
+import { afterEach, describe, expect, it, vi } from 'vitest';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -207,6 +207,21 @@ describe('changing a raid on the map', () => {
     );
   });
 
+  it('gives the use back when the change fails for no fault of the member, as /hatch does', async () => {
+    const throttles = new Throttles();
+    const map = await changing({}, { throttles });
+    web = map.web;
+    const setHatchTime = vi
+      .spyOn(map.ctx.raids, 'setHatchTime')
+      .mockRejectedValue(new Error('the database is away'));
+    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
+      expect((await map.post('hatch', { time: '30' })).status).toBe(500);
+    }
+    setHatchTime.mockRestore();
+    // None of them counted: the next is not throttled.
+    expect((await map.post('hatch', { time: '30' })).status).toBe(200);
+  });
+
   it('refuses a member kept out of the forum, an unknown change and a malformed body, without counting them', async () => {
     const map = await changing();
     web = map.web;
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 96735522..57bc987c 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -505,6 +505,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
         CHANGE_THROTTLE,
       );
       if (throttled) return throttled;
+      const countedAt = deps.now();
       const { member } = acting;
       // The map links no post: a refusal for a gym another raid holds names none.
       const noPost = () => undefined;
@@ -531,6 +532,17 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
             break;
         }
       } catch (err) {
+        // None of the member's doing (the store failed): the use goes back, as the router gives
+        // back the command's (plan 8S-4). A refusal is the member's and stays counted.
+        if (!(err instanceof UserError) || err.givesBack) {
+          givenBackOnTheMap(
+            deps,
+            CHANGE_COMMANDS[input.change],
+            userId,
+            CHANGE_THROTTLE,
+            countedAt,
+          );
+        }
         if (!(err instanceof UserError)) throw err;
         const refused: RaidAnswer = { ok: false, text: words(err.message) };
         return reply.code(422).send(refused);
````

### Task 6: Plan 8S-4 T6: Docs of 8S-4: full categories, the failed approval's reason, the train's ring; staging checklists

Prototype commit: `c49d1ee1576efa0b8cc12a9225486563003d101a`

The area files say what 8S-4 changed: the import's room in categories
and the server and its overflow categories (gyms-and-regions.md, the
editor's stamp in web.md), the failure kept with a request and
migration 023 (meetup-safety.md), the trains' rings on the map
(web.md), /location's carried use and the map's raid changes given back
(discord-framework.md), the fake gateway's full categories
(testing.md). The 8S-3 staging checklist is set right (distinct names
in steps 1 to 3, step 11's post with its reason, step 12's summary
deleted while the bot runs, step 17's Done), and the 8S-4 staging
checklist is drafted.

**Files:**

```
 docs/architecture/discord-framework.md                 |  2 +-
 docs/architecture/gyms-and-regions.md                  |  4 ++--
 docs/architecture/meetup-safety.md                     |  4 ++--
 docs/architecture/testing.md                           |  2 +-
 docs/architecture/web.md                               |  6 +++---
 docs/superpowers/plans/2026-10-18-phase-8s3-staging.md |  8 +++++---
 docs/superpowers/plans/2026-10-18-phase-8s4-staging.md | 26 ++++++++++++++++++++++++++
 7 files changed, 40 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c49d1ee1576efa0b8cc12a9225486563003d101a -- src test scripts userscript docs/architecture/discord-framework.md docs/architecture/gyms-and-regions.md docs/architecture/meetup-safety.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-18-phase-8s3-staging.md docs/superpowers/plans/2026-10-18-phase-8s4-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-4 T6: Docs of 8S-4: full categories, the failed approval's reason, the train's ring; staging checklists`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 3e65dd8d..87eae647 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -18,7 +18,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 - Plan 8S-3: between the guards and the throttle the router asks `checks`, the window a form's submit counts in, of a command (`CommandHandler.checks`, a `ControlThrottle`: `as` its command, else the command's own), a message command and a control (`ComponentHandler.checks(interaction, id)`, the limit `throttle` gives the form, counted where the form is): while that window is full the use is refused (the window's words: "You can use /report again in …", "That was a lot of clicks…"), and either way nothing is counted (`Throttles.wait`), so nobody types into a form only to be refused. `/report` and Report to moderators check `/report`'s window (`REPORT_WINDOW`), Ask the moderators and Appeal their form's (`APPEAL_THROTTLE`). A handler's own check before its form is a quick read (whether the member reported it already: `moderation.md`); when it fails the form opens as before, and the submit's checks stay (two forms open at once, a restart between).
-- Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
+- Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; `/location`'s question, whose Move it there refused for no post in the other forum gives back the press and the use that asked, plan 8S-4: `CHANGE_THROTTLE` as `location`; a move that landed and was answered before a later step failed is logged and keeps both counted; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids, and since 8S-4 the changes of a raid, in the window of their command). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
 
 ## Controls and how a press answers
 
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 9a145370..48eaaa32 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -33,7 +33,7 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 
 ## Regions
 
-- Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
+- Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import; each in the very category the plan named, by its id while it is there), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; what Discord still refuses for want of room (a race, the server's 500) is said plainly: `CreatedChannel`'s `category-full` (with the category's name, `NotImported.category`) or `server-full` (`channelLimitOf`, `src/discord/party-gateway.ts`: the server's code, or Invalid Form Body with `CHANNEL_PARENT_MAX_CHANNELS`, no other refusal of the parent), and a forum refused so says which category is full (`setupForums`' reason); nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
 - The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, and the server's regions, the regions of its channels and the channels the save depends on compared with those the save was planned against, `regionsStamp` and `channelsStamp` of `src/web/editor-save.ts`, another server's regions and the server's other channels left out (plan 8M-6); then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use; `'editor'` words a new channel's name as typed in the panel, "a typo in a name", where a file's preview says "a typo in the file") and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`: the escapes of `plain` undone by `unplain` outside the code spans of derived names, so a typed backslash shows once). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits), `fix.ts` and `fix-all.ts` (Fix and "Fix all slivers", plan 8M-2F, with `lines.ts`: lines measured flat in metres); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
-- KML is read by pure code: `src/domain/geo/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, crowded categories). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
+- KML is read by pure code: `src/domain/geo/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, the room of categories and of the server: plan 8S-4. Discord allows `MAX_CATEGORY_CHANNELS` (50, forums included) in a category and `MAX_SERVER_CHANNELS` (500) in a server, and every region written without a forum gets one beside its channel. The forums of channels that exist take their room first; where the category is full, a channel that is no region yet leaves its area out (`category-full`, the category named: a forum in another category would not have the channel's permissions, so staff move channels out and import again), and a region that is one already gets its outline, its forum `forumBlocked` (the preview says "keeps no forum", `newForums` leaves it out, and the forum step's refusal names the full category). A new channel whose category has no room for it and its forum goes into the overflow category `<name> 2` (then `3` …, the name cut to `MAX_CHANNEL_NAME`): one of that name, without case, that has room, else a new one the areas after it share, which continues the full one (`PlannedCategory` `{ create, like }`: `createCategory` makes it with that category's permission overwrites and moves it right after it; Discord refusing the overwrites is `copy-refused`, said with both names, where the bot may create channels at all (else `no-permission`), and a continued category deleted meanwhile is `base-gone`: none is made without its permissions; one such refusal stands for every later area of that category in the run, unasked); `ImportPlan.overflow` says which category had how much room before the import, how much of it its regions' new forums take, and where how many went, and the preview says it in one line. What would take the server beyond its channels (a new category counted too) is left out, `server-full`. Nothing is planned beyond what Discord allows, so there is no warning of a crowded category any more). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
 - `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the question and outcome of `/region remove` are `regionQuestion`s; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
diff --git a/docs/architecture/meetup-safety.md b/docs/architecture/meetup-safety.md
index ca144886..6b240cd6 100644
--- a/docs/architecture/meetup-safety.md
+++ b/docs/architecture/meetup-safety.md
@@ -20,7 +20,7 @@ A meetup at a place that might be private is held for a moderator before anythin
 
 - `MeetupSafety.submit` sends the moderators' post into the channel `findChannel(regionChannelId, moderation)` finds, then stores the request with it (a UUID, `MeetupRequestRecord`, `src/domain/meetups/records.ts`; a request is never kept without its post); whatever fails (no channel, Discord refuses, the record: the post is then taken back) leaves nothing behind (`not-sent`: the member is told to try later, the reason is logged). A name or information a meetup cannot have is `bad-name` / `bad-description`. Once the request is kept, the maker's block is read again: a block that came after the check, whose sweep of the maker's pending requests ran before this one was kept, withdraws it at once (`withdrawn`, its post says so, no DM; `blocked`, the member gets the blocked answer); a block that cannot be read leaves the request to the moderators (an approval reads it again). A request expires at `requestExpiry(createdAt, startTime)`: 48 hours, or an hour before the start when that is sooner; one that would leave the moderators less than an hour is not made (`too-soon`). In rehearsal mode meetup safety gets a gateway of its own (`rehearsalModeratorsGateway`, `src/app.ts`) that lets its posts (requests and appeals) into a text channel of the moderators' channel's name, so the staff who rehearse see them (Matt, 2026-10-17); the rest of the bot goes through the rehearsal gateway, which lets nothing into that channel: the exception belongs to meetup safety's sends, not to the channel.
 - The post (`requestMessage`, `src/render/meetup-safety.ts`): `### Meetup waiting for approval`, the name, the start, who asked (`memberText`), "on the map" for a request of the live map (`MeetupRequestRecord.source`, `map` or null; `RequestAsk.source`; migration 021, plan 8M-5M), in which region channel, **Where** (`nearLine`: kind, title and address cut to 100 and 200 characters, Map; a pin as `pinLine`; the Wayspot's picture beside it), **Information** (`plainLines`, never cut), when it expires, and the buttons: Approve, Approve once, Refuse, Refuse from now on, Block member (a pin: Approve once, Refuse, Block member). Custom ids `msafety:<request id>:<decision>`.
-- The buttons (`meetupSafetyControls`, `src/components/meetup-safety.ts`) are for staff (`requireManagement`; others are refused privately and uncounted) with a throttle of their own (`SAFETY_THROTTLE`). The handler defers privately and asks `MeetupSafety.decide`, which reads the request from the database (a post from before a restart works): one conditional update `pending` → decided (`decideRequest`; Block member `blockMaker`), so the first press wins and a later one is told who decided what. Approve and Approve once read the maker's block again (one that came meanwhile wins: the request becomes `withdrawn`, its post says so, no meetup, no DM), then make the meetup as its maker asked (`createMeetup`, the maker's name and team as they were when they asked; a failure marks the request `failed` and says why to the moderator and the maker), and `closeIfBlocked` after it (`closed`: the request is `withdrawn` as above; `close-failed`: the meetup is up, so the approval is settled with it and its post shows it, the place ruled as for any approval, the failure logged, and the maker, blocked, gets no DM of the approval); Approve allows the place for good only once the meetup is made (`settleApproval`, then `rule`), Refuse from now on refuses it. A meetup made whose record fails is written once more (`settleApproval` retried). Every step after the decision is caught and logged (also the first look for a block, which `closeIfBlocked` repeats), so the post is always edited to the outcome without buttons and the maker always told by DM through `DmSender` (`requestOutcomeDm`: approved with Go to post, not approved, expired; never why).
+- The buttons (`meetupSafetyControls`, `src/components/meetup-safety.ts`) are for staff (`requireManagement`; others are refused privately and uncounted) with a throttle of their own (`SAFETY_THROTTLE`). The handler defers privately and asks `MeetupSafety.decide`, which reads the request from the database (a post from before a restart works): one conditional update `pending` → decided (`decideRequest`; Block member `blockMaker`), so the first press wins and a later one is told who decided what. Approve and Approve once read the maker's block again (one that came meanwhile wins: the request becomes `withdrawn`, its post says so, no meetup, no DM), then make the meetup as its maker asked (`createMeetup`, the maker's name and team as they were when they asked; a failure marks the request `failed` and says why to the moderator and the maker, and in the post for the other moderators: plan 8S-4, Matt's ruling of 2026-10-18; the reason is kept with the decision as a kind, `MeetupRequestRecord.failure` (`ApprovalFailure`: `bad-name`, `bad-description`, `no-region`, `no-forum`, `no-post`, `error`, or `posts-refused` with the forum and what the bot lacks there), worded by `approvalFailureWords` (`src/render/meetup-safety.ts`; the post names the forum, the moderator's answer and the DM say "its forum"), so a post drawn anew from the row says it too; a row from before, or a kept reason that does not read, keeps the line without it), and `closeIfBlocked` after it (`closed`: the request is `withdrawn` as above; `close-failed`: the meetup is up, so the approval is settled with it and its post shows it, the place ruled as for any approval, the failure logged, and the maker, blocked, gets no DM of the approval); Approve allows the place for good only once the meetup is made (`settleApproval`, then `rule`), Refuse from now on refuses it. A meetup made whose record fails is written once more (`settleApproval` retried). Every step after the decision is caught and logged (also the first look for a block, which `closeIfBlocked` repeats), so the post is always edited to the outcome without buttons and the maker always told by DM through `DmSender` (`requestOutcomeDm`: approved with Go to post, not approved, expired; never why).
 - Expiry runs with every tick of the party clock, in the background and one at a time (`PartySchedulerOptions.requests`, `MeetupSafety.expire`), also while the safety is off (requests made before it was turned off end): pending requests past `expiresAt` become `expired`, their posts edited, their makers told (a due row that cannot be read becomes `failed`, logged once); approvals left without their recorded meetup for five minutes (`strandedApprovals`) are settled with the meetup when one is active (the maker's, in the server, with the request's name and start: the bot stopped or the database failed after it was made; no DM; closed and `withdrawn` when the maker was blocked since), else become `failed`, posts edited, makers told; open appeals that are stale are closed (below). A press on a request whose time is up expires it instead of deciding it ("This request has expired: nobody decided in time.").
 
 ## Blocks and appeals
@@ -37,5 +37,5 @@ A meetup at a place that might be private is held for a moderator before anythin
 
 ## Storage
 
-- Migration 019 (`MeetupRequest`, `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`): servers and members by snowflake without a foreign key, times in epoch milliseconds, a request's place as JSON read through `placeDocument` (`party-state.ts`; a row that does not read is logged and left alone, a due one failed), its post (`channelId`, `messageId`) never null. `isDuplicateEntry(err, key)` (`src/db/errors.ts`) tells the open-appeal key's duplicate from others. `MeetupSafetyRepository` and its twin `MemoryMeetupSafety` (`test/support/meetup-safety.ts`; its maps `rulingRows`, `blockRows`, `requests`, `appeals`, `asks`) run the same cases (`meetupSafetyCases`). Migration 022 (plan 8S-2) adds `MeetupPlaceAsk` and, on `MeetupPlaceRuling`, `ruledByName`, `place`, `sourceKind`, `sourceId`, `sourceChannelId`, `sourceMessageId` and `keptAt` (null for a ruling of 019), besides the reports' tables (`moderation.md`); the store lists a server's rulings, pending requests, open asks, blocks and open appeals for `/places`.
+- Migration 019 (`MeetupRequest`, `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`): servers and members by snowflake without a foreign key, times in epoch milliseconds, a request's place as JSON read through `placeDocument` (`party-state.ts`; a row that does not read is logged and left alone, a due one failed), its post (`channelId`, `messageId`) never null. `isDuplicateEntry(err, key)` (`src/db/errors.ts`) tells the open-appeal key's duplicate from others. `MeetupSafetyRepository` and its twin `MemoryMeetupSafety` (`test/support/meetup-safety.ts`; its maps `rulingRows`, `blockRows`, `requests`, `appeals`, `asks`) run the same cases (`meetupSafetyCases`). Migration 023 (plan 8S-4) adds `MeetupRequest.failure`, nullable JSON (`{"kind":"no-forum"}`, `{"kind":"posts-refused","forumId":"…","missing":["Manage Posts"]}`), written by `settleApproval(id, { failed })` and read through `approvalFailureOf` (`src/domain/meetups/records.ts`), null for every request but a failed one. Migration 022 (plan 8S-2) adds `MeetupPlaceAsk` and, on `MeetupPlaceRuling`, `ruledByName`, `place`, `sourceKind`, `sourceId`, `sourceChannelId`, `sourceMessageId` and `keptAt` (null for a ruling of 019), besides the reports' tables (`moderation.md`); the store lists a server's rulings, pending requests, open asks, blocks and open appeals for `/places`.
 - Tests of the service and the controls build it with `meetupSafetyWith(options)` (`test/support/meetup-safety-service.ts`): the services of `partyServiceWith`, the moderators' channel `MODERATION` as `MOD_CHANNEL` on the fake gateway (`moderation: null` for the safety off, `channel: false` for a server without it), `held(ask?)` for a request of Alice's at the Little Free Library a day ahead, `postOf(request)`. `createTestContext`'s own `meetupSafety` is off (the test settings name no moderators' channel).
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index abb01d74..15c0b9ed 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -30,7 +30,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Parties
 
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
-- Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); a post and a message keep the names of their files (`attachments`: those sent, replaced by an edit whose message names its files, none too, kept by one that does not, and a thumbnail `attachment://` must name one of them), and `refuseFiles` refuses any send or edit that uploads a file with Missing Permissions (50013), as Discord answers a bot without Attach Files, counting each refusal in `filesRefused` (plan 8D-F), `rejectThumbnails` and `rejectCustomEmoji` refuse a thumbnail or a button's custom emoji with Invalid Form Body naming the field as Discord does (`….accessory.media.url`; `….emoji.id[COMPONENT_INVALID_EMOJI]`, which `refusedPart` reads), and `deletedEmojiIds` refuses only the custom emoji of those ids, as for an emoji deleted from the application (plan 8D-H); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`.
+- Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, and one in a category of 50 channels or a server of 500 as Discord refuses it (Invalid Form Body naming `parent_id`, `CHANNEL_PARENT_MAX_CHANNELS`; `serverFull()`, 30013), as `createTextChannel` answers `category-full` and `server-full` (plan 8S-4), a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); a post and a message keep the names of their files (`attachments`: those sent, replaced by an edit whose message names its files, none too, kept by one that does not, and a thumbnail `attachment://` must name one of them), and `refuseFiles` refuses any send or edit that uploads a file with Missing Permissions (50013), as Discord answers a bot without Attach Files, counting each refusal in `filesRefused` (plan 8D-F), `rejectThumbnails` and `rejectCustomEmoji` refuse a thumbnail or a button's custom emoji with Invalid Form Body naming the field as Discord does (`….accessory.media.url`; `….emoji.id[COMPONENT_INVALID_EMOJI]`, which `refusedPart` reads), and `deletedEmojiIds` refuses only the custom emoji of those ids, as for an emoji deleted from the application (plan 8D-H); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`.
 - Meetups in tests: `testMeetup()` (which takes `place`), `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`; a meetup with a place passes `place`, and a directory of kept Wayspots as the override `wayspots`, `wayspotsWith`). A meetup's post shows its place as it is now from `MeetupPostView.gym` and `.wayspot`; a test of the renderer passes them to see a place as it is now, and leaves them out for the snapshot. The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 
 ## Meetup safety
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 7d0ea9b2..f0ff604b 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -44,7 +44,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (with one group Interested, Join, Here; with several a Join for each group, Interested, Here; Done for a raid that has hatched; Leave for a member signed up; none while read-only); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join` (body `{ group }` for "Join B"), `here`, `leave`, `done`; any other action 404, a body other than an optional group letter with `join` 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
-- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked, meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
 ## Raids on the map (plan 8M-4)
 
@@ -81,7 +81,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power spots and other Wayspots are never offered; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
 - **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end, the map, which crosses forums, asks more, as for raids); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
 - **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeTime`, `src/domain/web/clock.ts`: "in 5 h", "1 h 30 min ago", "now"), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
-- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on a pane of its own, `meetups`, above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
+- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on the pane of the rings (`RING_PANE`, `rings`, which the trains' rings share), above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
 - **Not in it:** a meetup's place cannot change after it is made (no route for it); a member cannot withdraw a pending request; Report on a meetup (8S-2); meetups on Campfire; the PokéStops are drawn only in "pick a place" mode, not from a zoom level up (a question per pan for every member, for little: left for staging to say whether it is wanted); an end given when the meetup is made (`/meetup` takes none, and a request kept for the moderators has no end: it is set with the editor once the meetup is posted).
 
 ## The region editor (plans 8M-2, 8M-2F)
@@ -90,7 +90,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **The page** `/s/<guild>/regions/edit` (`editorPage`): the template with `data-worker` (the worker's script). Logged out: 401, a page with "Log in with Discord" (when offered, to `/auth/login?next=…`) and "/region edit", saying why the last login did not happen (`?login=failed|expired`); it never sends anybody to Discord by itself, so a failed login cannot loop. Not staff or no member: 403 "Only staff of this server may edit its regions." Discord unreachable: the page, read-only by its data, only for a member Discord said is staff of the server within the last 30 minutes (`StaffSeen`, `src/web/editor-routes.ts`: a `BoundedMap` of `<guild>:<user>` set by every fresh `staff` answer, dropped by any other answer but `unreachable`); anybody else gets 503 "Discord cannot be reached just now, so I cannot tell whether you are staff." (a page; the data as `{ error }`), so that an outage never shows a server's editor data to somebody who is not staff. 20 a minute per address (each load asks Discord).
 - **The data** `GET /s/<guild>/api/regions/edit` (`EditorCache` over `editorView`, `src/domain/web/editor-view.ts`; types in `editor-data.ts`, without imports): the server's regions (id, channel id and name, category, description, outline, `version`), other servers' regions whose boxes meet the box of the server's outlines grown by 2 km (outlines only), the gyms in its regions and those in no region of any server inside that box (`[id, lat, lon, name]`), the kept Wayspots inside it (`[kind, lat, lon, title]`, no addresses or pictures), the text channels that are no region of any server; places at six decimals. The static part is kept per server until the generations of gyms, regions and Wayspots or the server's channels change; who asks (`userId`, `readOnly`, `mayManageChannels`, and the channels, none while read-only) is put in front per request; the ETag covers both; `private, no-cache`; 20 a minute per address (each asks Discord). 401, 403, 503 as the page (read-only while Discord is unreachable only for staff seen lately, as the page).
 - **Versions:** `regionVersion` (`src/domain/regions/version.ts`): base64url of SHA-256 (written out in pure code, so the page has it too) over the outline at six decimals and the region's description, cut to 16. A changed or removed region is sent with the version its first staged edit saw. Wherever an outline enters a draft (drawn, split, of a file: `record`) and wherever the server takes one (`planSave`), it is `normalisedOutline` (six decimals, a corner the rounding repeats dropped), so page and server see the same corners.
-- **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 while unreachable: "Discord cannot be reached just now, so nothing can be saved. Try again in a moment." to staff it confirmed within 30 minutes, `StaffSeen`, and to anybody else the page's "… so I cannot tell whether you are staff.", which promises no save, plan 8M-6), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file, names and categories up to 1,000 characters: anything beyond is malformed, 400; a new channel's name over 100 characters or its category over 200 is refused by `planSave` with a line naming the region, 422, and the page's fields have those `maxlength`s, a KML description being cut to 200 by `kmlEdit`). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`) in what the import will write (`outlinesWritten`: the areas the preview of `RegionAdminService` leaves out are not written, so a removal whose replacement is left out is checked as a removal alone), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time, at most three waiting beyond it, any more 503 "Busy checking other saves: try again in a minute."; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; polyclip throwing in the thread (its answer `{ ok: false }`) is logged and does not block; a thread that does not start, fails otherwise or ends without an answer is 503 "I cannot check the outlines just now: try again in a minute."), its verdict kept five minutes by a hash of the request, the server's regions (`regionsStamp`) and the areas the import leaves out, never its channels (plan 8M-6: a channel coming or going leaves the outlines as they are), so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", a new channel's name said as typed in the panel, not read from a file: "is it a typo?", "a typo in a name makes a channel of that name", plan 8M-6; and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one of the save changed meanwhile, 409 `conflicts`; then compares what the save was planned and checked against with this server's regions now (`regionsStamp` and `channelsStamp`, plan 8M-6: the versions of its regions, which of its channels is which region, also a row of no server on one of them, and, by id, name, kind and category, only the channels the save depends on: the channels and forums of those regions, the channels it takes by id, and every channel or category whose `channelKey` is a name its areas go to or whose `categoryKey` is a category a new channel of theirs names; another server's regions and the server's other channels, such as a ticket or voice bot's that come and go all day, are no part of it), and does nothing when anything differs (another save adding the same channel, two saves that together make a new overlap, a channel or category of a name the save would make or use made or renamed on Discord meanwhile), 409 `stale` "The regions changed meanwhile: preview again.", on which the page loads the regions and previews again; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: the bot's mentions as `#name`, no markdown, and outside the code spans of names the bot made (a backtick after an even number of backslashes; one after an odd number was typed) the escapes of `plain` undone by `unplain`: `north_hills`, not `north\_hills`, one backslash for a typed one, `1. Uptown`, a typed backtick as typed; the mentions are named before `unplain`, so a typed `<#…>` stays text; plan 8M-6); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
+- **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 while unreachable: "Discord cannot be reached just now, so nothing can be saved. Try again in a moment." to staff it confirmed within 30 minutes, `StaffSeen`, and to anybody else the page's "… so I cannot tell whether you are staff.", which promises no save, plan 8M-6), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file, names and categories up to 1,000 characters: anything beyond is malformed, 400; a new channel's name over 100 characters or its category over 200 is refused by `planSave` with a line naming the region, 422, and the page's fields have those `maxlength`s, a KML description being cut to 200 by `kmlEdit`). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`) in what the import will write (`outlinesWritten`: the areas the preview of `RegionAdminService` leaves out are not written, so a removal whose replacement is left out is checked as a removal alone), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time, at most three waiting beyond it, any more 503 "Busy checking other saves: try again in a minute."; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; polyclip throwing in the thread (its answer `{ ok: false }`) is logged and does not block; a thread that does not start, fails otherwise or ends without an answer is 503 "I cannot check the outlines just now: try again in a minute."), its verdict kept five minutes by a hash of the request, the server's regions (`regionsStamp`) and the areas the import leaves out, never its channels (plan 8M-6: a channel coming or going leaves the outlines as they are), so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", a new channel's name said as typed in the panel, not read from a file: "is it a typo?", "a typo in a name makes a channel of that name", plan 8M-6; and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one of the save changed meanwhile, 409 `conflicts`; then compares what the save was planned and checked against with this server's regions now (`regionsStamp` and `channelsStamp`, plan 8M-6: the versions of its regions, which of its channels is which region, also a row of no server on one of them, and, by id, name, kind and category, only the channels the save depends on: the channels and forums of those regions, the channels it takes by id, and every channel or category whose `channelKey` is a name its areas go to or whose `categoryKey` is a category a new channel of theirs names or that its preview puts one into (a full category's overflow, `<name> 2`, plan 8S-4), a category with how many channels it holds (one filled meanwhile has no room for what was planned); another server's regions and the server's other channels, such as a ticket or voice bot's that come and go all day, are no part of it), and does nothing when anything differs (another save adding the same channel, two saves that together make a new overlap, a channel or category of a name the save would make or use made or renamed on Discord meanwhile), 409 `stale` "The regions changed meanwhile: preview again.", on which the page loads the regions and previews again; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: the bot's mentions as `#name`, no markdown, and outside the code spans of names the bot made (a backtick after an even number of backslashes; one after an odd number was typed) the escapes of `plain` undone by `unplain`: `north_hills`, not `north\_hills`, one backslash for a typed one, `1. Uptown`, a typed backtick as typed; the mentions are named before `unplain`, so a typed `<#…>` stays text; plan 8M-6); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
 - **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name stages no channel (`pickerChange`): the channel the region had staged (a name typed before, or one of the list) is taken off with one edit (plan 8M-6: what Save sends is never a name the panel no longer shows), and nothing is recorded when it had none. What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, power spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
 - **Overlaps and gaps** (`src/domain/regions/coverage.ts`, polyclip-ts): pairwise intersections of outlines whose boxes meet (cached per pair of outlines by identity), gaps the holes of the union less what lies in them (`newProblems` cuts the gaps over the outlines whose boxes chain to what changed, `chainedTo`, so a region that closes a ring of regions is seen to close its hole); areas on the sphere (Lambert cylindrical equal-area); a piece thinner than 0.5 m on average (twice its area over its perimeter) is the six-decimal rounding and left out. A piece is new unless 90 % of its area lies inside one piece of its kind of the loaded outlines (so a shrunk overlap, or one split between two regions, is not new).
 - **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
diff --git a/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md b/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
index 0abff828..b1835b2f 100644
--- a/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
+++ b/docs/superpowers/plans/2026-10-18-phase-8s3-staging.md
@@ -4,6 +4,8 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 ## Checks before the form
 
+Give the meetups and other parties of steps 1 to 3 clearly distinct names (Book swap, Park cleanup, Trivia night, Bench painting …), not "Meetup · … one" and "… two": the reports' posts and answers are told apart by them (8S-3 staging).
+
 1. As Tester, `/report` in a meetup's post and send it. `/report` there again: "You already reported this." at once, no form. The Apps menu "Report to moderators" on the meetup's post and on its line in the region channel: the same, no form.
 2. As Tester, report a message of Googer's with the Apps menu, then use it on that message again: "You already reported this.", no form. As Googer on the same message: the form opens.
 3. As Tester, five reports within the hour (forms sent), then `/report` on a sixth party and the Apps menu on a sixth message: "You can use /report again in …" before any form. Opening forms and closing them unsent counts nothing (open six, send none, then a seventh still opens).
@@ -20,8 +22,8 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 8. Give the permission back: two `/meetup`s in a row work, the third is throttled (the refused ones did not count).
 9. With the permission denied again: `/raid` there answers the same sentence once, in its own answer (in place of the gym menu when the gym was picked from it; with a screenshot, beside its Screenshot feedback button; no second answer below); that it is uncounted is not seen by hand (`/raid`'s limit is too wide), `raid.test.ts` shows it; `/train` too (two more `/train`s work once it is back); on the web map a raid, a meetup and a train there say it (the forum by its name), uncounted. A screenshot of a raid at a gym of that region, posted with a mention: the same sentence.
 10. With the permission denied in East's forum: `/location` moving a raid from West to a gym in East: "Nothing was moved. I am not allowed to make posts in #…, the other region's forum: I lack the permission Manage Posts there. The server's staff must give it to me. The raid stays here."
-11. A meetup held for the moderators in that forum, approved by Googer: the request's post and Tester's DM say "I am not allowed to make posts in its forum (the server's staff must give me Manage Posts there)". Put the permission back.
-12. With Manage Threads denied in a region's forum and its summary post deleted: `/admin setup-forums` posts the list of active raids there again, and its line says "posted the list of active raids (I could not pin it: give me Manage Posts there)" (the bot's log warns that it could not pin it). Put it back. With Send Messages ("Create Posts") denied to the bot instead and the summary post deleted again: `/admin setup-forums` closes the forum to posts by members by allowing Send Messages to the bot there, which undoes the denial, so its line says "posted and pinned the list of active raids" and the forum's permissions show Send Messages allowed to the bot. (The refusal "I am not allowed to post the list of active raids in #…: I lack the permission Create Posts there. Give it to me and run this again." comes only where the bot may not change the forum's permissions; `setup-forums.test.ts` shows it.)
+11. A meetup held for the moderators in that forum, approved by Googer: Googer's private answer and Tester's DM say "I am not allowed to make posts in its forum (the server's staff must give me Manage Posts there)"; since 8S-4 the request's post names the reason too, the forum by its mention: "**Approved** by … but the meetup could not be made: I am not allowed to make posts in #… (the server's staff must give me Manage Posts there). Its maker was told." Put the permission back.
+12. With Manage Threads denied in a region's forum, delete its summary post while the bot runs and run `/admin setup-forums` at once (the bot remakes a missing summary post when it starts, the startup sweep: a post deleted while it is stopped is back before setup-forums can say its line): `/admin setup-forums` posts the list of active raids there again, and its line says "posted the list of active raids (I could not pin it: give me Manage Posts there)" (the bot's log warns that it could not pin it). Put it back. With Send Messages ("Create Posts") denied to the bot instead, delete the summary post again while the bot runs and at once: `/admin setup-forums` closes the forum to posts by members by allowing Send Messages to the bot there, which undoes the denial, so its line says "posted and pinned the list of active raids" and the forum's permissions show Send Messages allowed to the bot. (The refusal "I am not allowed to post the list of active raids in #…: I lack the permission Create Posts there. Give it to me and run this again." comes only where the bot may not change the forum's permissions; `setup-forums.test.ts` shows it.)
 
 ## cutover-check and the guides
 
@@ -34,7 +36,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 Needs the web pages on (`settings.web`, the stage tunnel) and the page reloaded after the build (`npm run build` builds the map's page too). Tester signed up for a train with a route of three stops or more.
 
 16. Tester opens a train's popup (its dot, then its route line) and presses "Move…": the Move train panel takes the place of the actions and the popup stays open (before: it closed within a second). Next: the train moves, the panel is drawn anew under "The train is at stop …" and stays; Done: the popup is drawn again with the train's actions. 8M-5's steps 13 to 15 run as written. Googer, staff, the same.
-17. In a gym's popup (one without raids, and one whose marker shows raids), "Report spawn here", then Cancel: the popup stays open with its buttons back ("Report raid", "Report spawn here", "Meetup here"), and "Report raid", then Cancel, the same; a raid's "Change…", then Cancel, the same. 8M-4S's step 7 passes. Closing the popup (×, or a click on the map) with a form open still closes it, and the other forms open again (the hold let go).
+17. In a gym's popup (one without raids, and one whose marker shows raids), "Report spawn here", then Cancel: the popup stays open with its buttons back ("Report raid", "Report spawn here", "Meetup here"), and "Report raid", then Cancel, the same; a raid's "Change…", then Done (it has Done, not Cancel), the same. 8M-4S's step 7 passes. Closing the popup (×, or a click on the map) with a form open still closes it, and the other forms open again (the hold let go).
 18. A click on the map outside a popup still closes it; a click inside a popup on its text (not a button) leaves it open, as before.
 19. The bot's log has one info line per map report, refusals too: a raid at a gym of no region of the server (a request sent by hand) "a raid was reported on the map" with `outcome: "no-gym"`; with Tester kept out of West's forum `barred`; the twenty-first report of a quarter of an hour `throttled`; an unknown boss sent by hand `refused`; the same for a spawn ("a spawn was reported on the map": a point outside the regions `not-here`, `barred`, `throttled`) and a meetup ("a meetup was made on the map": `no-region`, `barred`, a start that is no time `refused`, `blocked`, `throttled`). No line holds a typed text, a name or a point.
 20. `/maps` and, as Googer, `/region edit`: the small print under the button reads "The button logs you in as well. It works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (`/region edit again` for the editor), as one small-print paragraph.
diff --git a/docs/superpowers/plans/2026-10-18-phase-8s4-staging.md b/docs/superpowers/plans/2026-10-18-phase-8s4-staging.md
new file mode 100644
index 00000000..92035187
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-18-phase-8s4-staging.md
@@ -0,0 +1,26 @@
+# Phase 8S-4 staging checklist: full categories in `/region import`, and the 8S-3 staging's small fixes (draft)
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Accounts: Googer (owner, staff) and Tester (a member). The moderators' channel `meetup-review` is set (`channels.moderation`). **Migration 023** (`MeetupRequest.failure`) runs on the dev database first (Matt: `set SETTINGS_PATH=var/stage/settings.json&& npm run migrate`, or the bot's start runs it); no new command, so no deploy. The map's page is rebuilt (`npm run build`) and reloaded for step 9. The test server has the categories "Pittsburgh staging" (50 channels: 25 regions and their forums, full) and "Pittsburgh staging 2" (3 regions, 6 channels). The conventions are `docs/architecture/gyms-and-regions.md`, `meetup-safety.md`, `web.md` and `discord-framework.md`.
+
+## `/region import` and full categories
+
+1. A KML of three new areas (outside the regions, named for instance "Overflow North", "Overflow East", "Overflow South") whose description is "Pittsburgh staging" (`var/stage/kml/`). `/region import` with it, as Googer: the preview says "The category `Pittsburgh staging` is full (Discord allows 50 channels in a category, and forums count), so 3 new channels go into `Pittsburgh staging 2`."; each line "**new channel** `#overflow-…` in the category `Pittsburgh staging 2` · … · gets a forum"; no category is created (`Pittsburgh staging 2` has room); the button reads "Import and create 3 channels, 3 forums". Nothing is said of a crowded category any more. (A new overflow category, `<name> 3`, is not staged here: the line then adds ", a new category with the permissions of `…`, right after it", and the category is made with the overwrites of the one it continues and placed after it; `import.more.test.ts`.)
+2. Import: "Imported 3 regions, and created 3 channels for them.", no **Not imported**; the three channels and their forums stand in "Pittsburgh staging 2" (12 channels there now). Remove the three regions afterwards with `/region remove … forum: delete` and delete their channels by hand (Googer), so that the test server is as it was.
+3. A forum for a channel that exists, in a full category (Matt's go-ahead: it deletes a test region's forum). `/region remove` one region of "Pittsburgh staging" with its forum deleted (49 channels left), then create a text channel `full-test` in that category by hand (50 again). `/region import` of a file with that region's area alone: **Left out** "- …: `#…` would get its forum beside it, and its category `Pittsburgh staging` is full", and the sentence "1 area needs a forum in a full category (under "Left out"): Discord allows 50 channels in a category, and forums count. Move some channels out of that category, or move the region's channel into one with room, and import again."; no Import button. Delete `full-test` and import again: the region comes back with a new forum ("forum created"). Then, with the region there but its forum deleted by hand and `full-test` back in the category: the import gives it its outline all the same, the preview says "**keeps no forum**: its category `Pittsburgh staging` is full" and "1 region keeps no forum for now …", and the outcome "**no forum**: the category `Pittsburgh staging` is full …: move some channels out of it". Delete `full-test` and run `/admin setup-forums`: the forum is made.
+4. (Optional, the same region) `/region remove` it with its forum kept, then import its area again: the preview says it "takes back its forum <#…>", and Import does so though the category is full (a forum taken back needs no room).
+5. The region editor (`/region edit`): add an area named "Overflow West" with the category "Pittsburgh staging"; Preview says the same line as step 1 in plain text ("The category Pittsburgh staging is full (Discord allows 50 channels in a category, and forums count), so 1 new channel goes into Pittsburgh staging 2."); Save creates it there ("Created …" none, the channel in "Pittsburgh staging 2"). Remove it again with the editor (forum deleted) and delete its channel.
+6. A refusal after the preview is said plainly (`import.more.test.ts`; on Discord only by racing a preview: optional). The old answer "could not be created: the server or the category is full" is gone: a channel refused for a full category names it ("the category `…` is full (Discord allows 50 channels in a category, and forums count). Move some channels out of it, and try again."), one refused for the server's 500 says so.
+
+## The failed approval's post names the reason
+
+7. Deny the bot Manage Threads ("Manage Posts") in a region's forum. As Tester, `/meetup` there at a place that waits for a moderator (a pin, or a Wayspot with a front-yard name); Googer approves it. Googer's private answer and Tester's DM say "… but I could not make it: I am not allowed to make posts in its forum (the server's staff must give me Manage Posts there)…"; the request's post in `#meetup-review` reads "**Approved** by **Googer** … but the meetup could not be made: I am not allowed to make posts in #… (the server's staff must give me Manage Posts there). Its maker was told.", the forum named. The request's row keeps `failure` = `{"kind":"posts-refused","forumId":"…","missing":["Manage Posts"]}` (`var/stage/q.mjs`). Put the permission back.
+8. A request that failed before 8S-4 (any `failed` row of the dev database, if one exists) keeps the post it has; nothing redraws it with a reason it never had.
+
+## The web map: a train's ring
+
+9. A train at a stop at a gym (Schenley Fountain, as the 8S-3 staging met it): the map draws an orange ring around the gym's dot, no filled dot over it. A click inside the ring opens the gym's popup (its raids, "Report raid", "Report spawn here", "Meetup here"); a click on the ring's line opens the train's popup. A meetup at the same gym: its ring lies outside the train's, both visible, each opening its own popup on its line. A gym with a raid's picture under the train: the picture's middle opens the raids' popup. A train with a route that has not started (no current stop): a dashed, pale ring at its first gym, the gym clickable inside it. In route mode, and while a meetup's place is picked, the ring lets clicks through to the gym (as the trains' lines do).
+
+## The give-backs
+
+10. With Manage Threads denied in East's forum: as Tester, `/location` in a raid of West to a gym of East, "Move it there" (refused: "Nothing was moved. I am not allowed to make posts in #…"), ten times within a minute; an eleventh `/location` still asks (before 8S-4: "You can use /location again in …", since the refused moves' uses counted). Cancelling the question counts as before (`location.test.ts`). Put the permission back.
+11. The map's raid Change… moves no raid (hatch, end, boss, moves), so it never meets a forum the bot may not post in; a change whose work fails unexpectedly gives its use back (`raid-change.test.ts`; not to be staged by hand).
````
