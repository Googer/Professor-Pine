# Phase 8D: Posts with a Where Section, Meetups with a Place: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raid, meetup and train posts lay out their place like the `/wild` report's "Where" section. A meetup can be held near a gym, PokéStop, power spot or a pin. A pasted maps link or typed coordinates name a pin wherever a place is named. Members no longer see elite raid gym marks. A train's post shows its next stops with a count, plus a "Whole route" button.

**Architecture:**

- **Post layout:** a post opens with a heading block that says what the party is (for a raid, the boss's lines move into it), with the post's picture beside it. A **Where** section follows (`gymWhere` / `placeSection` in `src/render/raid-post.ts`): `**<gym>** · <address> · [Map](<…>)`, then the gym's notice, with the gym's Wayfarer picture beside it, following 8W-2's rules for pictures and addresses. The bottom row loses its Map button.
- **Trains:** the post shows the current stop under `Where · stop k of n`. A small-print line comes from `routeAhead` (pure, `src/domain/party/train.ts`). Below it is a row with Move train… and "Whole route", a new `party:<id>:route` action that answers privately with `/route show`'s text.
- **Places:** a place a member names is a snapshot (`Place` = `KnownPlace | DroppedPin`, `src/domain/geo/place.ts`).
  - **Pins:** `readPin` (`src/domain/geo/pin-input.ts`) reads coordinates and Google, Apple, OSM and `geo:` addresses. It never follows a short link.
  - **The shared option:** `PlaceFinder.pin` names a pin by the nearest place within 50 m. The `near` option's helpers move to `src/commands/place-option.ts`, shared by `/wild` and `/meetup`.
  - **Meetups:** a meetup's place (`MeetupDetails.place`, state document version 10) is set once by `/meetup near:` and never changes. The post shows the gym or kept Wayspot as it is now while it lies within 25 m of the snapshot (`shownPlace`), and the snapshot otherwise. A gym edit or a load of the kept Wayspots re-renders the meetups concerned.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14 components-v2, Kysely on MySQL 8.4, Vitest. No new dependency and **no migration**. The party state document goes to version 10, and the reader for version 9 stays. `/meetup` gains `near`, and the help of `/wild`, `/route`, `/find-gym` and `/gym elite` changes, so the commands are registered again at staging.

**Spec:** the design brief is `.superpowers/sdd/2026-10-17-phase-8d-post-where/design.md` (git-ignored) with its approved mockup (version 4, https://claude.ai/artifact/JpEZbcPn3N3jGN1ZA7nRJV, copied there as `mockup.html`). Matt decided the following on 2026-10-16 and 2026-10-17:

- **What leaves the post:** no gym name in the post's first line, and no maps link on the place's name; one Map link sits in the Where line.
- **Elite:** no elite raid gym mark for members (the data stays; the Elite raid *tier* is unchanged).
- **Trains:** the next two stops with a count, looking past the end for a loop or turn-back, and "then back here" one stop before a turn. A route of three stops or fewer is listed whole, with no Whole route button.
- **Meetup places:** a meetup is near any POI or a pin, kept as a snapshot. Edits to that gym or Wayspot show in the post, but moves of more than 25 m do not. A gym edit refreshes the posts at once.
- **Pins:** a pin is named by the nearest place within 50 m, else by the place its link names, else "Dropped pin". Maps links are read wherever a place is named.
- **From the meetup safety work (via plan 8S):** a meetup's place is set only when it is made. `/location` is for raids alone. There is no free-text "where": details go in the description (`/info`).

**Every diff in this plan was run before the plan was written** on a throwaway branch (`proto-8d`), one commit per task. Each commit was typechecked with its own tests green. On the tip the full check (7,020 unit tests), the build and the database suite (418) are clean. Three Opus reviewers went through the prototype (tasks 1–2, 3–4, 5–8), and a fourth through the two fix rounds; every finding is folded into the commits below.

## Decisions in this plan

Matt's decisions are listed under Spec above. These were made while prototyping and reviewing, for Matt to look at:

1. **Move train… stays on a finished route**, so Previous and Reverse can take back a mistaken Finish. Mockup card 7b drew it without.
2. **A turn-back train before its turn** reads `Next: 3. C · 4. D, and 3 more to the end, where it turns back`, and `…, where it turns back` when the two stops shown reach the turn. A finished route of three stops or fewer drops its mode words.
3. **What a pin may be:**
   - A Google Maps link's pin (`!3d…!4d…`) wins over the map's centre (`@lat,lon`), and a map centre alone still counts as a pin.
   - A maps link that shows no single point (a search, Street View, `map_action=map`, Apple's `?q=` without coordinates, `geo:0,0?q=…`) is refused with a sentence.
   - Short links (`maps.app.goo.gl`, `goo.gl/maps`, `maps.apple/p`, `osm.org/go`) are refused with advice: open the link and copy the address it shows, or paste the coordinates of a dropped pin.
   - The `near` option takes up to 1,500 characters.
4. **What a pin is named after:** a pin's nearest place comes from the server's gyms and the kept PokéStops and power spots in the server's regions; a Wayspot without a title is never offered or named. A gym's snapshot is named as the gym is shown (`gymName`, nickname first).
5. **Meetup DMs:** the plain-text DM of a meetup's start time ends with `Where: …`, the place as the post shows it now. No DM shows a meetup's brief today, so the brief's Map is seen nowhere yet.
6. **Not done here (follow-ups):** the party history does not record a meetup's place; autocomplete offers no "📍 pin" choice for pasted coordinates; the live map does not show a meetup's place yet (8M-5).
7. **Rollback:** once the bot writes version 10 documents, older code cannot read those meetups. The staging checklist says so.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8d`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`. Stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **The Where section of every kind:**
   - 8W-2's rules for pictures and addresses (`withoutPicture`);
   - `fit.part` for every text that can be long;
   - `plain` / `plainNoLinks` for member and gym text;
   - the worst cases within `MAX_COMPONENTS` and the text budget, with every copy.
2. **`routeAhead`** in every mode and position, agreeing with `nextStop`, `turnAhead` and `destinationOf`.
3. **Whole route:** private, on copies, ended trains, guards and throttle.
4. **Pins:**
   - the link reader over real link shapes (never following a short link);
   - the region check and the 50 m nearest place;
   - no network.
5. **Meetup places:**
   - the snapshot is never rewritten, and `shownPlace`'s 25 m rule holds;
   - the re-render hooks (gym edits, Wayspot loads, nothing after close);
   - state document 10 with its version 9 reader, a schema that refuses what no meetup can hold, and no empty titles or pictures stored.
6. **Elite:** only the elite raid *gym* mark leaves what members see.

### Task 1: Plan 8D T1: Raid posts: a Where section, the boss in the heading block

Prototype commit: `22c76e189cb0805027aa8ca1ce39926efb5babbc`

The post of a raid opens with what the raid is (### Level 5 raid against
Yveltal), its times and the boss's lines, which no longer form a block of
their own; the gym's name leaves the first line (the thread title keeps
it). Where the raid is stands under **Where** in one line, the gym's name
plain bold, its address and one masked Map link, then the gym's notice,
with the gym's Wayfarer picture beside it (gymWhere, placeSection). The
bottom row loses its Map button; a direct message keeps its own. No post
says any more that a gym is an elite raid gym.

A train's current stop uses the same Where for now; its post is laid out
anew in a later commit.

**Files:**

```
 src/commands/parties/delete.test.ts         |   2 +-
 src/render/party-controls.test.ts           |  13 ++--
 src/render/party-controls.ts                |  11 +---
 src/render/raid-post.test.ts                | 244 +++++++++++++++++++++++++++++++++++++++-----------------------------
 src/render/raid-post.ts                     | 166 +++++++++++++++++++++++++++++-----------------
 src/render/train-post.test.ts               |  29 +++++---
 src/render/train-post.ts                    |   5 +-
 src/services/party-scheduler.test.ts        |   2 +-
 src/services/party-service.end.test.ts      |   4 +-
 src/services/party-service.relocate.test.ts |   4 +-
 src/services/party-service.test.ts          |   9 ++-
 test/support/messages.ts                    |   4 +-
 12 files changed, 287 insertions(+), 206 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/parties/delete.test.ts src/render/party-controls.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts src/services/party-scheduler.test.ts src/services/party-service.end.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 22c76e189cb0805027aa8ca1ce39926efb5babbc -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T1: Raid posts: a Where section, the boss in the heading block`, the body above and the trailer, staging exactly
  `src/commands/parties/delete.test.ts src/render/party-controls.test.ts src/render/party-controls.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/train-post.test.ts src/render/train-post.ts src/services/party-scheduler.test.ts src/services/party-service.end.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts test/support/messages.ts`.

````diff
diff --git a/src/commands/parties/delete.test.ts b/src/commands/parties/delete.test.ts
index 43939d7ea25a2a29ad2128a35ba373edb8a48128..b8e49fbd5dcde47d294fde570c04b8b1a9097ecb 100644
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -120,7 +120,7 @@ describe('/delete from staff', () => {
     await made.run(['Moderator']);
     const post = made.gateway.posts.get(made.postId);
     // In the place of the times: a closed raid neither hatches nor ends "in 20 minutes".
-    expect(header(post?.message)[2]).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
+    expect(header(post?.message)[1]).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
     expect(textOf(post?.message)).not.toContain('No time has been set');
     expect(accentOf(post?.message)).toBe(0xe74c3c);
     const tags = made.tags[WEST_FORUM];
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 7bb96e52ddad0a5a84d77294f369137c80c89a63..232ec8be0385497e57f700a4872bc2fa803dba6f 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -204,18 +204,17 @@ describe('bottomControls', () => {
         return `${emoji ?? ''} ${label ?? ''} ${what ?? ''}`;
       }),
     );
-  const MAP = 'https://www.google.com/maps/search/?api=1&query=1%2C2';
-
-  it('puts Leave before the head count, the remote switch and the map under one group', () => {
-    expect(rows(timed, { groups: false, map: MAP })).toEqual([
-      ['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote', `🗺️ Map ${MAP}`],
+  it('puts Leave before the head count and the remote switch under one group, and no map', () => {
+    // The post's one Map is in its Where (Matt, 2026-10-17).
+    expect(rows(timed, { groups: false })).toEqual([
+      ['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote'],
     ]);
   });
 
   it('brings the statuses down to a row of their own when the groups carry Join', () => {
-    expect(rows(timed, { groups: true, map: MAP })).toEqual([
+    expect(rows(timed, { groups: true })).toEqual([
       ['🤔 Interested maybe', '✅ Here here', '🎉 Done done', '👋 Leave leave'],
-      ['⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote', `🗺️ Map ${MAP}`],
+      ['⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote'],
     ]);
   });
 
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index a829f49ca9cddb4f1d5630beee656aace0f6d12d..3b24c07d7138af1ee76ef2372af2f5db294b84c1 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -16,7 +16,6 @@ import {
   type PartyGroup,
 } from '../domain/party/party.js';
 import type { PostButton } from './party-post.js';
-import { linkButton } from './v2.js';
 import { fitItems, plain } from './text.js';
 
 /** The custom-id kind of the controls of a party's post (and of its copies in other channels). */
@@ -136,26 +135,19 @@ export function moveTrainButton(party: Pick<Party, 'id'>): PostButton {
   };
 }
 
-/** A link to a gym's place in Google Maps. */
-function mapButton(url: string): PostButton {
-  return { button: linkButton('Map', '🗺️', url) };
-}
-
 export interface BottomOptions {
   /**
    * The party shows several groups: their sections carry "Join A", "Join B", so the buttons of
    * the other statuses come down here, on a row of their own.
    */
   groups: boolean;
-  /** The address of the gym in Google Maps (a raid's post). */
-  map?: string;
 }
 
 /**
  * The rows at the bottom of a post (spec 4.1). With several groups first Interested, Here and,
  * for a raid, Done (Join is each group's), with Leave; with one group the statuses have their
  * buttons beside them and Leave leads the row of the head count. Then −1, +1, the remote switch
- * (an elite raid has none) and a raid's map; and, on a row of their own, "Set time" for a raid
+ * (an elite raid has none); and, on a row of their own, "Set time" for a raid
  * without times (spec 4.3) and "Screenshot feedback" for one reported from a kept screenshot
  * (spec 7B). Nothing depends on the time, so the controls never need an edit of their own: Done
  * on an egg is refused when it is pressed. A meetup has no Done (Leave is there), nor "Set
@@ -182,7 +174,6 @@ export function bottomControls(party: Party, options: BottomOptions): PostButton
     ...(remoteAllowed(party)
       ? [{ button: partyButton(id, 'remote', 'Remote', ButtonStyle.Secondary, undefined, '📡') }]
       : []),
-    ...(options.map === undefined ? [] : [mapButton(options.map)]),
   ]);
   const extras: PostButton[] = [];
   // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index 5245118bbe8f220ae119a5e1cc56528a2f269368..de699bfd6d62599cb7302af98b2fb90be172c701 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -27,6 +27,7 @@ import {
   withAttendees,
 } from '../../test/support/parties.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import type { Attendee, RaidParty } from '../domain/party/party.js';
 import { setBoss, setHatchTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -34,6 +35,7 @@ import { PokemonIcons } from '../domain/pogo/pokemon-icons.js';
 import {
   ENDED_COLOUR,
   FORUM_TAGS,
+  KEPT_OPEN,
   layoutTextLength,
   LEAD_ROOM,
   MAX_COMPONENTS,
@@ -82,9 +84,11 @@ const HOUR = 60 * MINUTE;
 const GYM_PICTURE = 'https://lh3.googleusercontent.com/library';
 /** That picture as a post shows it: asked for at 400 pixels. */
 const SHOWN_PICTURE = `${GYM_PICTURE}=s400`;
-const LOCATION = '**Location Information**';
+const WHERE = '**Where**';
 /** The address line of the library (gym 1) as a post shows it. */
 const LIBRARY_ADDRESS = '12 Maple Avenue, Pinewood, Pennsylvania 15999';
+/** The library's Map link in the Where line: masked, its address in angle brackets. */
+const LIBRARY_MAP = '[Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)';
 
 /** `count` coming trainers with snowflakes that start with a 3. */
 function trainers(count: number, extra: Partial<Attendee> = {}): Record<string, Partial<Attendee>> {
@@ -248,14 +252,22 @@ function shown(post: RenderedPost) {
   };
 }
 
-/** The lines of the first block of a post: the gym, the raid, its times. */
+/** The lines of the first block of a post: the raid, its times, its boss. */
 function header(post: RenderedPost): string[] {
   return textDisplays(post.message)[0]?.split('\n') ?? [];
 }
 
-/** The text display of a post that starts so (a heading), or undefined. */
+/**
+ * A text display of a post from its line that starts so (a heading, or the boss's lines in the
+ * heading block) to its end, or undefined.
+ */
 function block(post: RenderedPost, start: string): string | undefined {
-  return textDisplays(post.message).find((text) => text.startsWith(start));
+  for (const text of textDisplays(post.message)) {
+    const lines = text.split('\n');
+    const from = lines.findIndex((line) => line.startsWith(start));
+    if (from >= 0) return lines.slice(from).join('\n');
+  }
+  return undefined;
 }
 
 describe('renderRaidPost', () => {
@@ -272,7 +284,6 @@ describe('renderRaidPost', () => {
           "⬇️ −1 party:00000000-0000-4000-8000-000000000001:less",
           "⬆️ +1 party:00000000-0000-4000-8000-000000000001:more",
           "📡 Remote party:00000000-0000-4000-8000-000000000001:remote",
-          "🗺️ Map https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
         ],
         "picture": undefined,
         "tags": [
@@ -280,9 +291,10 @@ describe('renderRaidPost', () => {
           "T5",
         ],
         "texts": [
-          "### [The Stacks](https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05)
-      **Level 5 raid** (egg)
+          "### Level 5 raid (egg)
       Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.",
+          "**Where**
+      **The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)",
           "**Interested (1)**
       <@200000000000000001>",
           "**Coming (0)**",
@@ -323,7 +335,6 @@ describe('renderRaidPost', () => {
           "⬇️ −1 party:00000000-0000-4000-8000-000000000001:less",
           "⬆️ +1 party:00000000-0000-4000-8000-000000000001:more",
           "📡 Remote party:00000000-0000-4000-8000-000000000001:remote",
-          "🗺️ Map https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
         ],
         "picture": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
         "tags": [
@@ -331,12 +342,13 @@ describe('renderRaidPost', () => {
           "T5",
         ],
         "texts": [
-          "### [The Stacks](https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05)
-      **Level 5 raid against Yveltal** ✨
-      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.",
-          "**Weaknesses** Rock, Electric, Ice, Fairy
+          "### Level 5 raid against Yveltal ✨
+      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.
+      **Weaknesses** Rock, Electric, Ice, Fairy
       **Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)
       **Moveset** Snarl / ????",
+          "**Where**
+      **The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)",
           "**Group A: park \\*side\\*** · 5 trainers · meeting at <t:1791917100:t>
       Interested (1): <@200000000000000001>
       Present (4): <@200000000000000002> +2, <@200000000000000009>",
@@ -367,10 +379,7 @@ describe('renderRaidPost', () => {
     const raid = testRaid({ anonymous: true, boss: { name: 'Newmon' } });
     const post = renderRaidPost(view(raid, { now: PARTY_NOW + 50 * MINUTE }));
     expect(post.tags).toEqual(['Ended', 'T5']);
-    expect(header(post).slice(1)).toEqual([
-      '**Level 5 raid against Newmon**',
-      'This raid is over.',
-    ]);
+    expect(header(post)).toEqual(['### Level 5 raid against Newmon', 'This raid is over.']);
     // A boss the game master does not know has no types, CP or moves to show.
     expect(textOf(post.message)).not.toContain('Weaknesses');
     expect(textOf(post.message)).not.toContain('Reported by');
@@ -420,8 +429,8 @@ describe('renderRaidPost', () => {
     const closed = 'This raid was closed by **Mo** (<@9>).';
     const post = renderRaidPost(view(named, { eggPicture: picture, closed }));
     expect(thumbnailOf(post.message)).toBe(picture);
-    expect(header(post)[1]).toBe('**Level 5 raid** (egg)');
-    expect(header(post)[2]).toBe(closed);
+    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
+    expect(header(post)[1]).toBe(closed);
     expect(accentOf(post.message)).toBe(ENDED_COLOUR);
     expect(post.brief.picture).toBe(picture);
     expect(post.brief.lines[0]).toBe('**Level 5 raid** (egg)');
@@ -431,7 +440,7 @@ describe('renderRaidPost', () => {
       view(named, { eggPicture: picture, closed, now: at('2026-10-13T14:40') }),
     );
     expect(thumbnailOf(hatched.message)).not.toBe(picture);
-    expect(header(hatched)[1]).toContain('against Yveltal');
+    expect(header(hatched)[0]).toContain('against Yveltal');
   });
 
   it('says when the times are a guess from a screenshot, until they are set or the raid is over', () => {
@@ -441,7 +450,7 @@ describe('renderRaidPost', () => {
     };
     const lines = (party: RaidParty, now = PARTY_NOW) =>
       header(renderRaidPost(view(party, { now })));
-    expect(lines(guessed)[3]).toBe(UNCERTAIN_TIME);
+    expect(lines(guessed)[2]).toBe(UNCERTAIN_TIME);
     const sure: RaidParty = {
       ...guessed,
       raid: { ...guessed.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false } },
@@ -471,7 +480,7 @@ describe('renderRaidPost', () => {
     const hatchesAs = shownBoss(yveltal, catalogue, bosses);
     const post = renderRaidPost(view(egg, { hatchesAs }));
     // Said once: by the heading of the block under it (Matt, 2026-10-11).
-    expect(header(post)[1]).toBe('**Level 5 raid** (egg)');
+    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
     expect(thumbnailOf(post.message)).toMatch(/pm717/);
     const about = block(post, '**Hatches as Yveltal** ✨');
     expect(about).toContain('**Weaknesses**');
@@ -486,14 +495,14 @@ describe('renderRaidPost', () => {
 
   it('says what an egg hatches as also when nothing more is known of that boss', () => {
     const post = renderRaidPost(view(egg, { hatchesAs: { name: 'New*mon', shiny: false } }));
-    expect(header(post)[1]).toBe('**Level 5 raid** (egg)');
+    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
     expect(block(post, '**Hatches as')).toBe('**Hatches as New\\*mon**');
   });
 
   it('shows an egg whose boss was named as an egg until it hatches', () => {
     const before = renderRaidPost(view(yveltal));
     expect(before.title).toBe('Yveltal · The Stacks');
-    expect(header(before)[1]).toBe('**Level 5 raid** (egg)');
+    expect(header(before)[0]).toBe('### Level 5 raid (egg)');
     // Moves nobody knows are not asked for before there is a boss to look at.
     expect(block(before, '**Hatches as Yveltal**')).not.toContain('Moveset');
     const known = { ...yveltal, raid: { ...yveltal.raid, chargedMove: 'DARK_PULSE' } };
@@ -501,7 +510,7 @@ describe('renderRaidPost', () => {
       '**Moveset** ???? / Dark Pulse',
     );
     const hatched = renderRaidPost(view(yveltal, { now: at('2026-10-13T14:31') }));
-    expect(header(hatched)[1]).toBe('**Level 5 raid against Yveltal** ✨');
+    expect(header(hatched)[0]).toBe('### Level 5 raid against Yveltal ✨');
     expect(block(hatched, '**Weaknesses**')).toContain('**Moveset** ???? / ????');
     expect(hatched.brief.lines[0]).toBe('**Level 5 raid against Yveltal** ✨');
   });
@@ -544,24 +553,31 @@ describe('renderRaidPost', () => {
     ]);
   });
 
-  it('tells about the gym: that it is an elite raid gym, and its notice as plain text', () => {
-    const about = (gym: Partial<PostGym>, party = egg) =>
-      block(
-        renderRaidPost(view(party, { gym: { ...library!, geodata: null, ...gym } })),
-        '**Location Information**',
-      )
-        ?.split('\n')
-        .slice(1)
-        .join('\n');
-    expect(about({})).toBeUndefined();
-    expect(about({ taggedEx: true })).toBe('This is an elite raid gym.');
-    expect(about({ taggedEx: true, confirmedEx: true })).toBe('This is an elite raid gym.');
-    expect(about({ notice: 'Closes at **dusk** @everyone' })).toBe(
-      'Closes at \\*\\*dusk\\*\\* @\u200beveryone',
-    );
-    // Whatever the raid: an elite raid at such a gym says so too.
-    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
-    expect(about({ taggedEx: true }, elite)).toBe('This is an elite raid gym.');
+  it('says where the raid is in one line: the gym, its address and its map, then its notice', () => {
+    const where = (gym: Partial<PostGym>, party = egg) =>
+      block(renderRaidPost(view(party, { gym: { ...library!, ...gym } })), WHERE);
+    // The name plain bold (never a link), the address, the one Map link without a preview.
+    expect(where({})).toBe(`${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`);
+    expect(where({ notice: 'Closes at **dusk** @everyone' })).toBe(
+      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}\n` +
+        'Closes at \\*\\*dusk\\*\\* @\u200beveryone',
+    );
+    // Without an address: the gym and its map.
+    expect(where({ geodata: null })).toBe(`${WHERE}\n**The Stacks** · ${LIBRARY_MAP}`);
+    // The name is made plain (no link: its brackets need no escape).
+    expect(where({ nickname: null, name: 'M*A*S*H [Memorial]' })).toBe(
+      `${WHERE}\n**M\\*A\\*S\\*H [Memorial]** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`,
+    );
+  });
+
+  it('marks no elite raid gym anywhere in the post: members are not told any more', () => {
+    for (const party of [egg, testRaid({ tier: { level: 'Elite', shadow: false } })]) {
+      const post = renderRaidPost(
+        view(party, { gym: { ...library!, taggedEx: true, confirmedEx: true } }),
+      );
+      expect(textOf(post.message)).not.toMatch(/elite raid gym/i);
+      expect(post.brief.lines.join('\n')).not.toMatch(/elite raid gym/i);
+    }
   });
 
   it('keeps the lines of a notice that was written as a paragraph', () => {
@@ -570,89 +586,106 @@ describe('renderRaidPost', () => {
         gym: {
           ...library!,
           geodata: null,
-          taggedEx: true,
           notice: 'Park closes at *dusk*.\r\n\r\n\r\n  Use the east gate.\n# Not a heading',
         },
       }),
     );
-    expect(block(post, '**Location Information**')).toBe(
-      '**Location Information**\nThis is an elite raid gym.\nPark closes at \\*dusk\\*.\n\nUse the east gate.\n\\# Not a heading',
+    expect(block(post, WHERE)).toBe(
+      `${WHERE}\n**The Stacks** · ${LIBRARY_MAP}\nPark closes at \\*dusk\\*.\n\nUse the east gate.\n\\# Not a heading`,
     );
   });
 
-  it('adds no block for a notice that is empty once it is made plain', () => {
+  it('adds no line for a notice that is empty once it is made plain', () => {
     const post = renderRaidPost(view(egg, { gym: { ...library!, notice: '     ' } }));
-    expect(block(post, '**Location Information**')).toBeUndefined();
+    expect(block(post, WHERE)).toBe(
+      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`,
+    );
     for (const text of textDisplays(post.message)) expect(text.trim()).not.toBe('');
   });
 
-  it("shows the gym's Wayfarer picture beside what the post says about the gym", () => {
+  it("shows the gym's Wayfarer picture beside where the raid is", () => {
     const yveltalNow = at('2026-10-13T14:40');
     const shown = (gym: Partial<PostGym>) =>
       renderRaidPost(view(yveltal, { now: yveltalNow, gym: { ...library!, ...gym } }));
     const alone = shown({ imageUrl: GYM_PICTURE });
-    expect(block(alone, LOCATION)).toBe(`${LOCATION}\n${LIBRARY_ADDRESS}`);
-    expect(thumbnailBeside(alone.message, LOCATION)).toBe(SHOWN_PICTURE);
+    expect(thumbnailBeside(alone.message, WHERE)).toBe(SHOWN_PICTURE);
     // The boss keeps its picture beside the heading.
     expect(thumbnailOf(alone.message)).toMatch(/pm717/);
     const noted = shown({ imageUrl: GYM_PICTURE, notice: 'Use the east gate.' });
-    expect(block(noted, LOCATION)).toBe(`${LOCATION}\n${LIBRARY_ADDRESS}\nUse the east gate.`);
-    expect(thumbnailBeside(noted.message, LOCATION)).toBe(SHOWN_PICTURE);
-    // A picture from elsewhere is not shown, and makes no block of its own.
+    expect(block(noted, WHERE)).toBe(
+      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}\nUse the east gate.`,
+    );
+    expect(thumbnailBeside(noted.message, WHERE)).toBe(SHOWN_PICTURE);
+    // A picture from elsewhere is not shown: the section stands without one.
     const elsewhere = shown({ imageUrl: 'https://example.com/x.jpg' });
-    expect(block(elsewhere, '**Location Information**')).toBeUndefined();
+    expect(thumbnailBeside(elsewhere.message, WHERE)).toBeUndefined();
+    expect(block(elsewhere, WHERE)).toBe(
+      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}`,
+    );
     expect(thumbnailsOf(elsewhere.message)).toEqual([thumbnailOf(elsewhere.message)]);
     // One by plain http on Google's host is shown by https, small.
     const plainHttp = shown({ imageUrl: 'http://lh3.googleusercontent.com/x' });
-    expect(thumbnailBeside(plainHttp.message, LOCATION)).toBe(
+    expect(thumbnailBeside(plainHttp.message, WHERE)).toBe(
       'https://lh3.googleusercontent.com/x=s400',
     );
-    // Where Discord refuses the pictures, the post goes without either.
+    // Where Discord refuses the pictures, the post goes without either, and says the same.
     expect(thumbnailsOf(postMessage(noted.layout, { picture: false }))).toEqual([]);
     expect(textDisplays(postMessage(noted.layout, { picture: false }))).toContain(
-      `${LOCATION}\n${LIBRARY_ADDRESS}\nUse the east gate.`,
+      `${WHERE}\n**The Stacks** · ${LIBRARY_ADDRESS} · ${LIBRARY_MAP}\nUse the east gate.`,
     );
     expectSendable(noted);
   });
 
-  it('says the gym’s address under the heading, and that it has none beside a picture', () => {
+  it('says that a gym beside its picture has no address, and only there', () => {
     const yveltalNow = at('2026-10-13T14:40');
     const shown = (gym: Partial<PostGym>) =>
       renderRaidPost(view(yveltal, { now: yveltalNow, gym: { ...library!, ...gym } }));
-    const address = LIBRARY_ADDRESS;
-    // A picture and an address.
-    const pictured = shown({ imageUrl: GYM_PICTURE });
-    expect(block(pictured, LOCATION)).toBe(`${LOCATION}\n${address}`);
-    expect(thumbnailBeside(pictured.message, LOCATION)).toBe(SHOWN_PICTURE);
-    // A picture and no address (a gym deep in a park): the picture never sits by the heading
-    // alone.
+    // A picture and no address (a gym deep in a park): the picture never sits by a name alone.
     const lost = shown({ imageUrl: GYM_PICTURE, geodata: null, notice: 'By the pond.' });
-    expect(block(lost, LOCATION)).toBe(`${LOCATION}\n(no address available)\nBy the pond.`);
-    // Where the picture is left out, so is the line said for it, and a block with nothing else.
-    expect(textDisplays(postMessage(lost.layout, { picture: false }))).toContain(
-      `${LOCATION}\nBy the pond.`,
+    expect(block(lost, WHERE)).toBe(
+      `${WHERE}\n**The Stacks** · (no address available) · ${LIBRARY_MAP}\nBy the pond.`,
     );
-    const bare = shown({ imageUrl: GYM_PICTURE, geodata: null });
-    expect(block(bare, LOCATION)).toBe(`${LOCATION}\n(no address available)`);
-    const withoutIt = postMessage(bare.layout, { picture: false });
-    expect(textDisplays(withoutIt).filter((text) => text.startsWith(LOCATION))).toEqual([]);
-    expect(thumbnailsOf(withoutIt)).toEqual([]);
-    // No picture: the block stands for the notes, as before, with the address when there is one.
-    expect(block(shown({ notice: 'By the pond.' }), LOCATION)).toBe(
-      `${LOCATION}\n${address}\nBy the pond.`,
-    );
-    expect(block(shown({ notice: 'By the pond.', geodata: null }), LOCATION)).toBe(
-      `${LOCATION}\nBy the pond.`,
+    expect(thumbnailBeside(lost.message, WHERE)).toBe(SHOWN_PICTURE);
+    // Where the picture is left out, so is what was said for it.
+    expect(textDisplays(postMessage(lost.layout, { picture: false }))).toContain(
+      `${WHERE}\n**The Stacks** · ${LIBRARY_MAP}\nBy the pond.`,
     );
-    expect(block(shown({}), LOCATION)).toBeUndefined();
     // The address is made plain.
     const marked = JSON.stringify({ addressComponents: { route: '*Main* Street' } });
-    expect(block(shown({ imageUrl: GYM_PICTURE, geodata: marked }), LOCATION)).toBe(
-      `${LOCATION}\n\\*Main\\* Street`,
+    expect(block(shown({ imageUrl: GYM_PICTURE, geodata: marked }), WHERE)).toBe(
+      `${WHERE}\n**The Stacks** · \\*Main\\* Street · ${LIBRARY_MAP}`,
     );
     expectSendable(lost);
   });
 
+  it('opens with what the raid is, its times and its boss, and has no Map button of its own', () => {
+    const hatched = renderRaidPost(
+      view(
+        { ...yveltal, raid: { ...yveltal.raid, fastMove: 'SNARL_FAST' } },
+        { now: at('2026-10-13T14:40') },
+      ),
+    );
+    expect(header(hatched)).toEqual([
+      '### Level 5 raid against Yveltal ✨',
+      'Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.',
+      '**Weaknesses** Rock, Electric, Ice, Fairy',
+      '**Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)',
+      '**Moveset** Snarl / ????',
+    ]);
+    expect(buttonLabels(hatched.message)).not.toContain('Map');
+    // The direct message keeps its map: it has no Where.
+    expect(hatched.brief.map).toBe(gymMapsUrl(library!));
+    const kept = renderRaidPost(view({ ...yveltal, saved: true }));
+    expect(header(kept)).toEqual([
+      '### Level 5 raid (egg)',
+      'Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.',
+      KEPT_OPEN,
+      '**Hatches as Yveltal** ✨',
+      '**Weaknesses** Rock, Electric, Ice, Fairy',
+      '**Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)',
+    ]);
+  });
+
   it('holds the whole message in one place: the layout made a message', () => {
     const post = renderRaidPost(view(egg));
     expect(post.message).toEqual(postMessage(post.layout));
@@ -822,32 +855,30 @@ describe('renderRaidPost', () => {
       '−1',
       '+1',
       'Remote',
-      'Map',
       'Set time',
       'Screenshot feedback',
     ]);
     expect(thumbnailOf(post.message)).toMatch(/pm717/);
-    // So full a post has no room for the gym's picture (two components more): it goes without.
-    expect(thumbnailBeside(post.message, LOCATION)).toBeUndefined();
-    expect(textDisplays(post.message).some((text) => text.startsWith(LOCATION))).toBe(true);
+    // The boss's lines in the heading block and no Map button leave room for the gym's picture
+    // even in so full a post (`postMessage` would leave it out past `MAX_COMPONENTS`).
+    expect(thumbnailBeside(post.message, WHERE)).toBe(SHOWN_PICTURE);
+    expect(textDisplays(post.message).some((text) => text.startsWith(WHERE))).toBe(true);
     // And the fake gateway, as strict as Discord, takes it, and every copy of it.
     expectSendable(post);
-    // A gym without an address: the line said for the picture goes with it.
+    // A gym without an address: beside its picture that is said, and without the picture
+    // (where Discord refuses one) the words go with it.
     const lost = renderRaidPost(
       view(party, { gym: { ...gym, geodata: null }, now: at('2026-10-13T14:40') }),
     );
-    expect(textDisplays(lost.message).find((text) => text.startsWith(LOCATION))).toMatch(
-      new RegExp(`^\\*\\*Location Information\\*\\*\\nThis is an elite raid gym\\.\\nn{100}`),
+    const whereOf = (message: V2Message) =>
+      textDisplays(message).find((text) => text.startsWith(WHERE));
+    expect(whereOf(lost.message)).toMatch(
+      /^\*\*Where\*\*\n\*\*The Stacks\*\* · \(no address available\) · \[Map\]\(<[^>]+>\)\nn{100}/,
     );
-    // And one that has nothing more to say than that has no block.
-    const bare = renderRaidPost(
-      view(party, {
-        gym: { ...gym, geodata: null, taggedEx: false, notice: null },
-        now: at('2026-10-13T14:40'),
-      }),
+    expect(whereOf(postMessage(lost.layout, { picture: false }))).toMatch(
+      /^\*\*Where\*\*\n\*\*The Stacks\*\* · \[Map\]\(<[^>]+>\)\nn{100}/,
     );
-    expect(thumbnailsOf(bare.message)).toEqual([thumbnailOf(bare.message)]);
-    expect(textDisplays(bare.message).some((text) => text.startsWith(LOCATION))).toBe(false);
+    expectSendable(lost);
   });
 
   it('keeps within those limits with the longest texts that need escaping everywhere', () => {
@@ -891,7 +922,7 @@ describe('renderRaidPost', () => {
     expectSendable(post);
     // The address and the notice are cut to their room; the lists are cut down with a count.
     expect(textOf(post.message)).toMatch(
-      /\*\*Location Information\*\*\n[^\n]*…\nThis is an elite raid gym\.\n[^\n]*…/,
+      /\*\*Where\*\*\n\*\*[^\n]+\*\* · [^\n]*… · \[Map\]\(<[^>]+>\)\n[^\n]*…/,
     );
     expect(textOf(post.message)).toMatch(/…and \d+ more/);
   });
@@ -919,7 +950,7 @@ describe('renderRaidPost', () => {
       }),
     );
     // One group leaves room for the gym's picture.
-    expect(thumbnailBeside(post.message, LOCATION)).toBe(SHOWN_PICTURE);
+    expect(thumbnailBeside(post.message, WHERE)).toBe(SHOWN_PICTURE);
     expect(componentCount(post.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
     expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
     expectSendable(post);
@@ -928,15 +959,15 @@ describe('renderRaidPost', () => {
   it('puts the gym name through plain() in the post, but not in the post title', () => {
     const gym: PostGym = { ...library!, nickname: null, name: 'M*A*S*H [Memorial]' };
     const post = renderRaidPost(view(egg, { gym }));
-    expect(header(post)[0]).toBe(`### [M\\*A\\*S\\*H \\[Memorial\\]](${gymMapsUrl(gym)})`);
+    expect(block(post, WHERE)?.split('\n')[1]).toMatch(/^\*\*M\\\*A\\\*S\\\*H \[Memorial\]\*\* · /);
     expect(post.title).toBe('T5 egg · M*A*S*H [Memorial]');
   });
 
   it('calls a gym with an empty nickname by its name', () => {
     const gym: PostGym = { ...library!, nickname: '' };
     expect(raidTitle(view(egg, { gym }))).toBe('T5 egg · Pinewood Public Library');
-    expect(header(renderRaidPost(view(egg, { gym })))[0]).toMatch(
-      /^### \[Pinewood Public Library\]/,
+    expect(block(renderRaidPost(view(egg, { gym })), WHERE)?.split('\n')[1]).toMatch(
+      /^\*\*Pinewood Public Library\*\* · /,
     );
   });
 
@@ -960,7 +991,7 @@ describe('renderRaidPost', () => {
     const dated = `at <t:${hatch / 1000}:f>. Ends at <t:${end / 1000}:f>.`;
     const today = `at <t:${hatch / 1000}:t>. Ends at <t:${end / 1000}:t>.`;
     const times = (now: number, zone = PARTY_ZONE) =>
-      header(renderRaidPost(view(party, { now, zone })))[2];
+      header(renderRaidPost(view(party, { now, zone })))[1];
     expect(times(at('2026-10-13T23:59'))).toContain(dated);
     expect(times(at('2026-10-14T00:00'))).toContain(today);
     expect(times(at('2026-10-14T17:59'))).toContain(today);
@@ -1011,7 +1042,10 @@ describe('renderRaidPost', () => {
 
   it('shows a post without its gym when the gym is gone', () => {
     const post = renderRaidPost(view(egg, { gym: undefined }));
-    expect(header(post)[0]).toBe('### Unknown gym');
+    expect(header(post)[0]).toBe('### Level 5 raid (egg)');
+    // Where names the gym as unknown, without a map or a picture.
+    expect(block(post, WHERE)).toBe(`${WHERE}\n**Unknown gym**`);
+    expect(textOf(post.message)).not.toContain('[Map]');
     expect(buttonLabels(post.message)).not.toContain('Map');
     expect(post.brief).not.toHaveProperty('map');
   });
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 699926bf8a2a6c874274439f3823fc28c965f74b..eb7fc9f416dc77db330d4408cbc42e9619adadc0 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -7,7 +7,7 @@ import {
   type RaidParty,
   type RaidStage,
 } from '../domain/party/party.js';
-import { isEliteGym, raidStage } from '../domain/party/raid.js';
+import { raidStage } from '../domain/party/raid.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { typeWord, WEATHER_ICON, weatherWord } from '../domain/pogo/game-icons.js';
 import {
@@ -285,57 +285,89 @@ export function bossFacts(
 }
 
 /**
- * What a post says about the gym it is at: that it is an elite raid gym, and the notice the
- * moderators gave the gym. Empty when there is nothing.
+ * The notice the moderators gave a gym, made plain; empty when there is none. A notice of nothing
+ * but white space is empty once plain. It is written as a paragraph (`/gym edit`), and its lines
+ * stay lines. Whether the gym is an elite raid gym is not said to members (Matt, 2026-10-17: it
+ * mattered for EX raids, not now; the gym keeps the mark for staff and the `#elite-gym-raids`
+ * copies).
  */
-export function gymNotes(gym: PostGym | undefined): string[] {
-  const notes: string[] = [];
-  if (gym && isEliteGym(gym)) notes.push('This is an elite raid gym.');
-  // A notice of nothing but white space is empty once plain. It is written as a paragraph
-  // (`/gym edit`), and its lines stay lines.
-  const notice = gym?.notice ? plainLines(gym.notice) : '';
-  if (notice !== '') notes.push(notice);
-  return notes;
+function noticeOf(gym: PostGym | undefined): string {
+  return gym?.notice ? plainLines(gym.notice) : '';
 }
 
 /**
- * The room the notes about a gym may take in a post: a notice is at most 500 characters as typed,
+ * The room the notice of a gym may take in a post: a notice is at most 500 characters as typed,
  * and what is left of the text of a post is for the trainers.
  */
-const LOCATION_ROOM = 600;
+export const LOCATION_ROOM = 600;
 
-/** The room the gym's address line may take in a post. */
+/** The room the address line of a place may take in a post. */
 const ADDRESS_ROOM = 200;
 
-/** Said in place of the address of a gym with a picture and no address (often deep in a park). */
+/** Said in place of the address of a place with a picture and no address (often deep in a park). */
 export const NO_ADDRESS = '(no address available)';
 
+/** The heading of the section of a post that says where the party is. */
+export const WHERE_HEADING = '**Where**';
+
+/** A masked link to a place in Google Maps, in angle brackets so that it shows no preview. */
+export function mapMarkdown(place: { lat: number; lon: number }): string {
+  return `[Map](<${gymMapsUrl(place)}>)`;
+}
+
 /**
- * The block of a post about the gym it is at (layout C, Matt, 2026-10-16): under the heading the
- * gym's address line (`addressLine`, made plain), then its notes (`gymNotes`), with the gym's
- * picture from Wayfarer beside them (plan 8W-2; only an address `wayspotPicture` allows). A
- * block with a picture and no address says `NO_ADDRESS`, so the picture never sits beside the
- * heading alone; where the message leaves the picture out, that line goes with it (and the block,
- * when it said nothing else). One without a picture stands for the notes, as before (the address
- * added when there is one). None for a gym with neither a picture nor notes.
+ * What a section that says where a place is is made of: its heading, its one line (`line`, given
+ * the address part as it is shown: an address, `NO_ADDRESS`, or nothing), the lines under it, and
+ * the place's picture beside them. The address is made plain by the caller and cut here to
+ * `ADDRESS_ROOM`; the lines under it go as they are (a caller cuts what can be long through
+ * `fit.part`). With a picture and no address the line says `NO_ADDRESS`, so that the picture
+ * never sits beside a bare name; where the message leaves the picture out, that goes with it
+ * (`PostThumbnail.withoutPicture`). Without a picture the section is a text.
  */
-export function locationBlock(gym: PostGym | undefined, fit: Fit): PostBlock[] {
-  const notes = gymNotes(gym).join('\n');
-  const picture = wayspotPicture(gym?.imageUrl);
-  if (notes === '' && picture === undefined) return [];
-  const address = plain(addressLine(gym?.geodata ?? null));
-  const where = address !== '' ? address : picture !== undefined ? NO_ADDRESS : '';
-  const addressPart =
-    where === '' ? [] : [fit.part((room) => cutText(where, Math.min(room, ADDRESS_ROOM)))];
-  const notesPart =
-    notes === '' ? [] : [fit.part((room) => cutText(notes, Math.min(room, LOCATION_ROOM)))];
-  const heading = '**Location Information**';
-  const content = [heading, ...addressPart, ...notesPart].join('\n');
-  if (picture === undefined) return [{ type: 'text', content }];
-  // Without the picture, the line said for it goes, and the block when nothing else is left.
-  const withoutPicture =
-    address !== '' ? undefined : notesPart.length === 0 ? null : [heading, ...notesPart].join('\n');
-  return [{ type: 'section', content, accessory: { thumbnail: picture, withoutPicture } }];
+export function placeSection(
+  fit: Fit,
+  place: {
+    heading: string;
+    line: (address: string) => string;
+    address: string;
+    picture: string | undefined;
+    under: readonly string[];
+  },
+): PostBlock {
+  const { heading, line, address, picture, under } = place;
+  const shown =
+    address === '' ? '' : fit.part((room) => cutText(address, Math.min(room, ADDRESS_ROOM)));
+  const content = (where: string): string => [heading, line(where), ...under].join('\n');
+  if (picture === undefined) return { type: 'text', content: content(shown) };
+  if (shown !== '') {
+    return { type: 'section', content: content(shown), accessory: { thumbnail: picture } };
+  }
+  return {
+    type: 'section',
+    content: content(NO_ADDRESS),
+    accessory: { thumbnail: picture, withoutPicture: content('') },
+  };
+}
+
+/**
+ * Where a raid or a train's current stop is (Matt, 2026-10-17, like the `/wild` report's Where):
+ * under `heading` one line, `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a
+ * link; the address `addressLine` made plain), then the gym's notice, cut through `fit.part`,
+ * with the gym's picture from Wayfarer beside them (plan 8W-2; only an address `wayspotPicture`
+ * allows). A gym that is gone is named as unknown, without a map or a picture.
+ */
+export function gymWhere(heading: string, gym: PostGym | undefined, fit: Fit): PostBlock {
+  const name = `**${plain(gymName(gym))}**`;
+  if (!gym) return { type: 'text', content: `${heading}\n${name}` };
+  const notice = noticeOf(gym);
+  return placeSection(fit, {
+    heading,
+    line: (address) => [name, ...(address === '' ? [] : [address]), mapMarkdown(gym)].join(' · '),
+    address: plain(addressLine(gym.geodata ?? null)),
+    picture: wayspotPicture(gym.imageUrl),
+    under:
+      notice === '' ? [] : [fit.part((room) => cutText(notice, Math.min(room, LOCATION_ROOM)))],
+  });
 }
 
 /**
@@ -363,14 +395,31 @@ function bosses(view: RaidPostView) {
   return { fought, expected };
 }
 
-/** `Level 5 raid against Yveltal ✨`, `Level 5 raid (egg)`. */
+/**
+ * `**Level 5 raid against Yveltal** ✨`, `**Level 5 raid** (egg)`: the line of a direct
+ * message's brief; the post says it as its heading (`heading`).
+ */
 function headline(view: RaidPostView): string {
+  const { what, after } = headlineParts(view);
+  return `**${what}**${after}`;
+}
+
+/** `### Level 5 raid against Yveltal ✨`, `### Level 5 raid (egg)`: what opens the post. */
+function heading(view: RaidPostView): string {
+  const { what, after } = headlineParts(view);
+  return `### ${what}${after}`;
+}
+
+function headlineParts(view: RaidPostView): { what: string; after: string } {
   const words = raidWords(view.party.raid.tier);
   const { fought } = bosses(view);
   if (fought) {
-    return `**${words} against ${plain(fought.name)}**${fought.shiny ? ` ${view.emoji.shiny}` : ''}`;
+    return {
+      what: `${words} against ${plain(fought.name)}`,
+      after: fought.shiny ? ` ${view.emoji.shiny}` : '',
+    };
   }
-  return `**${words}**${shownAsEgg(view) ? ' (egg)' : ''}`;
+  return { what: words, after: shownAsEgg(view) ? ' (egg)' : '' };
 }
 
 /**
@@ -448,29 +497,32 @@ function hatchesAsLine(view: RaidPostView, boss: ShownBoss): string {
   return `**Hatches as ${plain(boss.name)}**${boss.shiny ? ` ${view.emoji.shiny}` : ''}`;
 }
 
-/** The block about the boss: what it is weak to, its CP and moves, or what an egg hatches as. */
-function bossBlock(view: RaidPostView): PostBlock[] {
+/**
+ * The lines about the boss, under the times: what it is weak to, its CP and moves, headed for an
+ * egg by what it hatches as.
+ */
+function bossLines(view: RaidPostView): string[] {
   const info = bossInfo(view);
   if (!info) return [];
   const heading = info.hatchesAs ? [hatchesAsLine(view, info.hatchesAs)] : [];
-  return [{ type: 'text', content: [...heading, ...info.lines].join('\n') }];
+  return [...heading, ...info.lines];
 }
 
 /**
- * The post of a raid laid out: the gym (a link to its place) with the raid and its times, and
- * the boss's or the egg's picture beside them; the boss; what there is to say about the gym; who
- * comes, with the buttons; the rows of the rest of the controls; who reported it.
+ * The post of a raid laid out (Matt, 2026-10-17): what the raid is, its times and its boss, with
+ * the boss's or the egg's picture beside them; where it is (`gymWhere`, with the gym's picture);
+ * who comes, with the buttons; the rows of the rest of the controls; who reported it. The gym's
+ * name no longer opens the post (the thread's title has it), and the one Map is in Where.
  */
 function raidLayout(view: RaidPostView): PostLayout {
   const { party, gym } = view;
   const stage = stageOf(view);
-  const title = gym ? `### [${linkText(gym)}](${gymMapsUrl(gym)})` : `### ${plain(gymName(gym))}`;
   const header = [
-    title,
-    headline(view),
+    heading(view),
     view.closed ?? describeTimes(view, stage),
     // Not in the last showing of a raid that was closed: that post is archived.
     ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
+    ...bossLines(view),
   ].join('\n');
   const picture = pictureOf(view);
   return fittedLayout((fit) => ({
@@ -479,19 +531,11 @@ function raidLayout(view: RaidPostView): PostLayout {
     blocks: [
       { type: 'section', content: header, accessory: 'picture' },
       { type: 'separator' },
-      ...bossBlock(view),
-      { type: 'separator' },
-      ...locationBlock(gym, fit),
+      gymWhere(WHERE_HEADING, gym, fit),
       { type: 'separator' },
       ...trainerBlocks(view, { complete: true, lobby: true }, fit),
       { type: 'separator' },
-      {
-        type: 'controls',
-        rows: bottomControls(party, {
-          groups: party.groups.length > 1,
-          ...(gym ? { map: gymMapsUrl(gym) } : {}),
-        }),
-      },
+      { type: 'controls', rows: bottomControls(party, { groups: party.groups.length > 1 }) },
       ...(party.anonymous
         ? []
         : [
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index 03273aa4711ea2eedae3d329effab4ef48c79018..b982fa0ef15cd825ac3793529d4824c51c683352 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -78,7 +78,7 @@ const ARCHIVING = { graceMinutes: 5, warningMinutes: 60 };
 const START = at('2026-10-13T16:00');
 const END = at('2026-10-13T18:00');
 const catalogue = catalogueFixture();
-const LOCATION = '**Location Information**';
+const LOCATION = '**Where**';
 /** The address line of gyms 4 and 11 as a post shows it. */
 const RIVER_ROAD = '12 River Road, Pinewood, Pennsylvania 15999';
 
@@ -334,17 +334,23 @@ describe('renderTrainPost', () => {
         : found;
     };
     const about = (train: TrainParty, extra: Partial<TrainPostView> = {}) =>
-      block(renderTrainPost(view(train, extra)), '**Location Information**');
+      block(renderTrainPost(view(train, extra)), LOCATION);
+    // As a raid's: the gym, its address and its map, then its notice; no elite mark.
     expect(about(onRoute([4, 11]), { gym: noted })).toBe(
-      `${LOCATION}\n${RIVER_ROAD}\nThis is an elite raid gym.\nMind the \\*traffic\\*`,
+      `${LOCATION}\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)\n` +
+        'Mind the \\*traffic\\*',
     );
     // At the next stop it is that gym's address and notice.
     expect(about(onRoute([4, 11], 1), { gym: noted })).toBe(
-      `${LOCATION}\n${RIVER_ROAD}\nPark closes at dusk`,
+      `${LOCATION}\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
+        'Park closes at dusk',
     );
     // And nothing where the train is at no gym.
     expect(about(onRoute([4, 11], 2))).toBeUndefined();
-    expect(about(onRoute([1]))).toBeUndefined();
+    // A stop without a notice is named all the same.
+    expect(about(onRoute([1]))).toBe(
+      `${LOCATION}\n**The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<${maps(1)}>)`,
+    );
   });
 
   it("shows the current stop's Wayfarer picture beside what there is to say about it", () => {
@@ -355,17 +361,24 @@ describe('renderTrainPost', () => {
     };
     const post = (train: TrainParty) => renderTrainPost(view(train, { gym: pictured }));
     const first = post(onRoute([4, 11]));
-    expect(block(first, LOCATION)).toBe(`${LOCATION}\n${RIVER_ROAD}`);
+    expect(block(first, LOCATION)).toBe(
+      `${LOCATION}\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
+    );
     expect(thumbnailBeside(first.message, LOCATION)).toBe(`${picture(4)}=s400`);
     // Move train… stays beside where the train is.
     expect(buttonLabels(first.message)[0]).toBe('Move train…');
     const next = post(onRoute([4, 11], 1));
-    expect(block(next, LOCATION)).toBe(`${LOCATION}\n${RIVER_ROAD}\nPark closes at dusk`);
+    expect(block(next, LOCATION)).toBe(
+      `${LOCATION}\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
+        'Park closes at dusk',
+    );
     // A stop without an address says so beside its picture.
     const lost = renderTrainPost(
       view(onRoute([4, 11]), { gym: (id) => pictured(id) && { ...pictured(id)!, geodata: null } }),
     );
-    expect(block(lost, LOCATION)).toBe(`${LOCATION}\n(no address available)`);
+    expect(block(lost, LOCATION)).toBe(
+      `${LOCATION}\n**Veterans Memorial Bridge** · (no address available) · [Map](<${maps(4)}>)`,
+    );
     expect(thumbnailBeside(next.message, LOCATION)).toBe(`${picture(11)}=s400`);
     // A finished route is at no gym: no picture.
     expect(thumbnailsOf(post(onRoute([4, 11], 2)).message)).toEqual([]);
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index a3c352f3b129b96dcd30f5b4eb428b715b464fb9..ba3fbae31819aa6188be94a8c770b1a335e58b79 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -25,7 +25,8 @@ import {
   gymMapsUrl,
   gymName,
   linkText,
-  locationBlock,
+  gymWhere,
+  WHERE_HEADING,
   type PostGym,
   type ShownBoss,
 } from './raid-post.js';
@@ -207,7 +208,7 @@ function trainLayout(view: TrainPostView): PostLayout {
         accessory: moveTrainButton(party),
       },
       ...routeLine(view, fit),
-      ...locationBlock(at === undefined ? undefined : view.gym(at), fit),
+      ...(at === undefined ? [] : [gymWhere(WHERE_HEADING, view.gym(at), fit)]),
       { type: 'separator' },
       // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
       ...(boss?.entry
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 96bcc74467223c10d0a2331cc7d44f8d99654f76..3148672838613d0a3c963e0e5a07b5a473fd6dee 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -477,7 +477,7 @@ describe('PartyScheduler: running', () => {
     await again.service.flush();
 
     expect(asRaid(again.store.get(made.party.id)).raid.stageSeen).toBe('hatched');
-    expect(header(gateway.posts.get(postId)?.message)[1]).toMatch(/^\*\*Level 5 raid against /);
+    expect(header(gateway.posts.get(postId)?.message)[0]).toMatch(/^### Level 5 raid against /);
     expect(gateway.posts.get(postId)?.edits).toBe(1);
     expect(gateway.posts.get(open)?.archived).toBe(true);
     expect(regions.byId(1)?.summaryMessageId).not.toBeNull();
diff --git a/src/services/party-service.end.test.ts b/src/services/party-service.end.test.ts
index 844567ec4fb70668b57c99fe90579a8f017e790a..bd8fc2c0844e04714bf83136393da603d2204ce7 100644
--- a/src/services/party-service.end.test.ts
+++ b/src/services/party-service.end.test.ts
@@ -32,8 +32,8 @@ describe('PartyService.end', () => {
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
     expect(buttonsOf(post?.message)).toEqual([]);
     // The last showing is the post as it was, without its controls.
-    expect(header(post?.message)[0]).toMatch(/^### \[The Stacks\]\(/);
-    expect(header(post?.message)[1]).toBe('**Level 5 raid against Yveltal** ✨');
+    expect(header(post?.message)[0]).toBe('### Level 5 raid against Yveltal ✨');
+    expect(textOf(post?.message)).toContain('**Where**\n**The Stacks** · ');
     expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
     // The archiving is the last thing that happens to the post.
     const calls = gateway.calls.filter((call) => call.endsWith(` ${postId}`));
diff --git a/src/services/party-service.relocate.test.ts b/src/services/party-service.relocate.test.ts
index 7a5c385a0f3627d48ad2fed2b9e4fc6dd308b6d2..aa441d97d25e647b0ac41a96d68bf744d5b4ea31 100644
--- a/src/services/party-service.relocate.test.ts
+++ b/src/services/party-service.relocate.test.ts
@@ -104,7 +104,7 @@ describe('PartyService.relocate', () => {
     // The reporter is signed up (interested) and allows pings.
     expect(made.said().at(-1)).toBe(`${words}\n<@${REPORTER}>`);
     // In the place of the times.
-    expect(header(old?.message)[2]).toBe(words);
+    expect(header(old?.message)[1]).toBe(words);
     const tags = made.tags[WEST_FORUM];
     expect([...(old?.tagIds ?? [])].sort()).toEqual([tags.Ended, tags.T5].sort());
     const calls = made.gateway.calls.filter((call) => call.endsWith(` ${made.postId}`));
@@ -192,7 +192,7 @@ describe('PartyService.relocate', () => {
     expect(last?.message.content).toMatch(new RegExp(`\\n<@${REPORTER}>$`));
     // The sentence in the post's own message has no mentions.
     const old = made.gateway.posts.get(made.postId);
-    expect(header(old?.message)[2]).toMatch(/<#\d+>$/);
+    expect(header(old?.message)[1]).toMatch(/<#\d+>$/);
   });
 
   it('reads the settings of everybody it may ping in one read', async () => {
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index b1cf5867f48a5eb9d96b8b15239089babaef5d5c..269f42174a6efdd21b9f2690569fc5c544d05df1 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -126,7 +126,7 @@ describe('PartyService.reportRaid', () => {
       title: 'T5 egg · The Stacks',
       tagIds: [tags[WEST_FORUM].Egg, tags[WEST_FORUM].T5],
     });
-    expect(header(post?.message)[1]).toBe('**Level 5 raid** (egg)');
+    expect(header(post?.message)[0]).toBe('### Level 5 raid (egg)');
     expect(party).toMatchObject({
       forumChannelId: WEST_FORUM,
       regionId: 1,
@@ -632,10 +632,9 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
     const postId = outcome.party.forumPostId ?? '';
     const shown = () => gateway.posts.get(postId)?.message;
     expect(thumbnailsOf(shown())).toEqual([]);
-    // The gym has no address and no notes: without its picture, the post says nothing of it.
-    expect(textDisplays(shown()).some((text) => text.startsWith('**Location Information**'))).toBe(
-      false,
-    );
+    // The gym has no address: without its picture, its Where does not say so.
+    const where = textDisplays(shown()).find((text) => text.startsWith('**Where**'));
+    expect(where).toMatch(/^\*\*Where\*\*\n\*\*[^\n]+\*\* · \[Map\]\(<[^>]+>\)$/);
     expect(entries.some((entry) => entry.level === 40 && entry.party === outcome.party.id)).toBe(
       true,
     );
diff --git a/test/support/messages.ts b/test/support/messages.ts
index 9ee170ae594174b76661d589455d04de8c4d283a..860d037df32913e11c8f79863621e112a3a39989 100644
--- a/test/support/messages.ts
+++ b/test/support/messages.ts
@@ -166,7 +166,7 @@ export function thumbnailsOf(message: OutgoingMessage | undefined): string[] {
 
 /**
  * The thumbnail beside the section whose text starts with `start` (the gym's picture beside
- * "**Location Information**"); undefined when there is no such section or it has none.
+ * "**Where**"); undefined when there is no such section or it has none.
  */
 export function thumbnailBeside(
   message: OutgoingMessage | undefined,
@@ -206,7 +206,7 @@ export function copiedPost(message: OutgoingMessage | undefined): string[] {
   return [first.slice(first.indexOf('\n') + 1), ...rest];
 }
 
-/** The lines of the first text of a post: its title, what it is, its times. */
+/** The lines of the first text of a post: what it is, its times (a raid: its boss). */
 export function header(message: OutgoingMessage | undefined): string[] {
   return textDisplays(message)[0]?.split('\n') ?? [];
 }
````

### Task 2: Plan 8D T2: Elite raid gyms: no mark in what members see

Prototype commit: `b78745c506cd765b0a3867c3adf5880f8f23a724`

The mark mattered for EX raids, not now (Matt, 2026-10-17). A train's
route lines (the post's and /route show), /find-gym's member view and the
/targets list no longer say that a gym is an elite raid gym; the help of
/route show, /find-gym and /gym elite say so. The gym keeps its flags:
staff's /gym show, /gym elite, the #elite-gym-raids copies and their lead
line, and the Elite forum tag (the raid tier) are unchanged.

**Files:**

```
 src/commands/gyms/elite.ts                 |  5 +++--
 src/commands/notifications/targets.test.ts |  4 ++--
 src/commands/notifications/targets.ts      | 13 +++++--------
 src/commands/trains/route.ts               |  2 +-
 src/commands/util/find-gym.test.ts         |  4 ++--
 src/commands/util/find-gym.ts              |  2 +-
 src/render/gym-view.test.ts                |  2 +-
 src/render/gym-view.ts                     | 13 +++++--------
 src/render/train-post.test.ts              | 14 ++++++--------
 src/render/train-post.ts                   | 18 +++++++-----------
 10 files changed, 33 insertions(+), 44 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/notifications/targets.test.ts src/commands/util/find-gym.test.ts src/render/gym-view.test.ts src/render/train-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff b78745c506cd765b0a3867c3adf5880f8f23a724 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T2: Elite raid gyms: no mark in what members see`, the body above and the trailer, staging exactly
  `src/commands/gyms/elite.ts src/commands/notifications/targets.test.ts src/commands/notifications/targets.ts src/commands/trains/route.ts src/commands/util/find-gym.test.ts src/commands/util/find-gym.ts src/render/gym-view.test.ts src/render/gym-view.ts src/render/train-post.test.ts src/render/train-post.ts`.

````diff
diff --git a/src/commands/gyms/elite.ts b/src/commands/gyms/elite.ts
index 3ca5e3393dddcd28298d92a1e48ffab01515297c..280e357b4a05588b28aece4d2222d4f476597250 100644
--- a/src/commands/gyms/elite.ts
+++ b/src/commands/gyms/elite.ts
@@ -35,8 +35,9 @@ export const eliteGym: SubcommandPart = {
   ),
   help: {
     details:
-      'An elite raid gym is marked in raid posts and on train routes, and a raid there is ' +
-      'also shown in the channel for raids at elite raid gyms, where the server has one.',
+      'Members are not shown the mark (the posts, train routes and `/find-gym` say nothing of ' +
+      'it); a raid at an elite raid gym is also shown in the channel for raids at elite raid ' +
+      'gyms, where the server has one, and staff see the mark in `/gym show`.',
     examples: ['/gym elite gym:Big Fountain eligible:True'],
   },
   defer: 'ephemeral',
diff --git a/src/commands/notifications/targets.test.ts b/src/commands/notifications/targets.test.ts
index c8e99dbfec5a66786b3c2e9b5ef9152c6eb7ef5f..82e2a591348fa762d1f4a29740a22290e975dc3c 100644
--- a/src/commands/notifications/targets.test.ts
+++ b/src/commands/notifications/targets.test.ts
@@ -512,7 +512,7 @@ describe('/targets', () => {
     ]);
   });
 
-  it('puts a gym outside the regions of this server last, marks an elite raid gym, and counts what it cannot read', () => {
+  it('puts a gym outside the regions of this server last, marks no elite raid gym, and counts what it cannot read', () => {
     const made = setup();
     const base = made.ctx.gyms.get(3);
     if (!base) throw new Error('no gym 3');
@@ -533,7 +533,7 @@ describe('/targets', () => {
       '### Gyms you want raids of\n3 gyms\n' +
         '…and 3 entries this version cannot read (a gym that no longer exists, say); ' +
         '`/untarget-all` removes those too.',
-      `${link(made.ctx, 3, "St. Mary's Church")} · <#${WEST_CHANNEL}> · elite raid gym`,
+      `${link(made.ctx, 3, "St. Mary's Church")} · <#${WEST_CHANNEL}>`,
       `${link(made.ctx, 1, 'The Stacks')} · <#${WEST_CHANNEL}>`,
       `${link(made.ctx, 10, 'Lakeview Trailhead')} · in no region of this server`,
       '-# `/target` adds one.',
diff --git a/src/commands/notifications/targets.ts b/src/commands/notifications/targets.ts
index 6766e07fe94ed64140cbf6c94723cbe6bb3cddf6..fba859ab851111210d830b06365520822f8ba54a 100644
--- a/src/commands/notifications/targets.ts
+++ b/src/commands/notifications/targets.ts
@@ -17,7 +17,6 @@ import { isRaid, isTrain, partyWord } from '../../domain/party/party.js';
 import { currentStop } from '../../domain/party/train.js';
 import type { V2Message } from '../../discord/party-gateway.js';
 import { stopArgs } from '../../domain/notify/reasons.js';
-import { isEliteGym } from '../../domain/party/raid.js';
 import { renderMemberList } from '../../render/member-list.js';
 import { gymMapsUrl, gymName } from '../../render/raid-post.js';
 import { stopLink } from '../../render/train-post.js';
@@ -380,7 +379,7 @@ export const targetControls: ComponentHandler = {
 /** The custom-id kind of the controls of `/targets` (`targets` is the question of `/untarget-all`). */
 export const TARGET_LIST_KIND = 'targetlist';
 
-/** What a gym's line shows beside its name: where it lies, and whether it is an elite raid gym. */
+/** What a gym's line shows beside its name: where it lies. */
 interface ListedGym {
   gym: Gym;
   /** The channel of the region of this server it lies in (the first by name), if any. */
@@ -388,15 +387,13 @@ interface ListedGym {
 }
 
 /**
- * A gym's line in the list: its name as a link to its place, the region it lies in, and
- * `· elite raid gym`: `[The Stacks](<maps>) · <#region>`. Only the name is cut, before it is
+ * A gym's line in the list: its name as a link to its place and the region it lies in (not
+ * whether it is an elite raid gym: members are not told any more, Matt, 2026-10-17):
+ * `[The Stacks](<maps>) · <#region>`. Only the name is cut, before it is
  * escaped, when the line would be longer than `room`.
  */
 export function targetLine({ gym, region }: ListedGym, room: number): string {
-  const rest = [
-    ...(region === undefined ? ['in no region of this server'] : [`<#${region}>`]),
-    ...(isEliteGym(gym) ? ['elite raid gym'] : []),
-  ].join(' · ');
+  const rest = region === undefined ? 'in no region of this server' : `<#${region}>`;
   const line = (name: string) => `${stopLink({ ...gym, name, nickname: null })} · ${rest}`;
   const name = gymName(gym);
   let shown = line(name);
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index 47190a8c20a1ef2efc279ef2948b1832f6b54a3d..caa8c8df98d3e4f6eaf0b8da5768ce09d038b878 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -93,7 +93,7 @@ const show: SubcommandPart = {
   help: {
     details:
       'Shows you every stop in order: those the train has left struck through, the one it is ' +
-      'at marked, elite raid gyms marked, each a link to Google Maps, and what the train does ' +
+      'at marked, each a link to Google Maps, and what the train does ' +
       'at the end of a route of two stops or more. The post itself shows the route too, ' +
       'without the links.',
     examples: ['/route show'],
diff --git a/src/commands/util/find-gym.test.ts b/src/commands/util/find-gym.test.ts
index 22c8ce9bbbdec02bb0eb96b6af3df0f5839227a3..0a6b9bc91a5ee9dc85821bebd56852413d081afd 100644
--- a/src/commands/util/find-gym.test.ts
+++ b/src/commands/util/find-gym.test.ts
@@ -88,13 +88,13 @@ describe('/find-gym', () => {
     expect(JSON.stringify(answer)).toContain('Mural of readers beside the front doors');
   });
 
-  it('shows the notice, and an elite raid gym as one', async () => {
+  it('shows the notice, and no elite mark: members are not told any more', async () => {
     const made = setup();
     const gym = made.ctx.gyms.get(11);
     if (!gym) throw new Error('no gym 11');
     Object.assign(gym, { taggedEx: true });
     const view = shown(await made.run('#11'));
-    expect(view.lines).toEqual(['Elite raid gym', `It lies in <#${WEST_CHANNEL}>.`]);
+    expect(view.lines).toEqual([`It lies in <#${WEST_CHANNEL}>.`]);
     expect(view.facts).toEqual({ Notice: 'Park closes at dusk' });
     expect(view.pictures).toEqual([]);
   });
diff --git a/src/commands/util/find-gym.ts b/src/commands/util/find-gym.ts
index 4da117ed75e7fa9467683ad8c3c5c4d61480a942..5c7bfc752ba7486068f915c3344207c77a2c177d 100644
--- a/src/commands/util/find-gym.ts
+++ b/src/commands/util/find-gym.ts
@@ -44,7 +44,7 @@ export const findGym: SimpleCommand = {
     category: 'util',
     details:
       'Shows a gym of this server: its name and nickname with a link to the place, its ' +
-      'description and notice, whether it is an elite raid gym, the regions it lies in, the ' +
+      'description and notice, the regions it lies in, the ' +
       'raids there now and a map. Pick the gym from the list that appears while you type ' +
       '(the gyms of the region you are in come first), or give its number (`#123`). Only you ' +
       'see the answer.',
diff --git a/src/render/gym-view.test.ts b/src/render/gym-view.test.ts
index 49fedde4c386be95caa7d0ed7686f0e5bcbfddd3..e329aec5042a9a41a26110e7fc69500c595af7e4 100644
--- a/src/render/gym-view.test.ts
+++ b/src/render/gym-view.test.ts
@@ -305,9 +305,9 @@ describe('renderMemberGymView', () => {
       raids,
     });
     const texts = textDisplays(message);
+    // An elite raid gym is not marked for members (Matt, 2026-10-17); staff's view says it.
     expect(texts[0]?.split('\n')).toEqual([
       `### [Pinewood Public Library (The Stacks)](<${gymMapsUrl(library())}>)`,
-      'Elite raid gym',
       'It lies in <#100000000000000001>.',
     ]);
     expect(texts).toContain('**Notice**\nClosed');
diff --git a/src/render/gym-view.ts b/src/render/gym-view.ts
index faaf7c27760cca70ec09222b31b78e4472923f78..680c4ca81396b4486c533a8e059b64bd8264f1d3 100644
--- a/src/render/gym-view.ts
+++ b/src/render/gym-view.ts
@@ -292,9 +292,10 @@ export interface MemberGymView {
 
 /**
  * A gym as a member looks it up (`/find-gym`), as a components-v2 message: the name and
- * nickname as a link to the place, "Elite raid gym" under it when it is one, the regions of
- * this server it lies in, the map, the description, the notice, the raids there now, its number
- * in small print and a Map button. Nothing of what only staff need (keywords, what Google gave,
+ * nickname as a link to the place, the regions of this server it lies in (not whether it is an
+ * elite raid gym: members are not told any more, Matt, 2026-10-17; staff's view says it), the
+ * map, the description, the notice, the raids there now, its number in small print and a Map
+ * button. Nothing of what only staff need (keywords, what Google gave,
  * the nearest gym, gym targets, the coordinates). Every text is plain and cut as in
  * `renderGymView`.
  */
@@ -303,11 +304,7 @@ export function renderMemberGymView(view: MemberGymView): V2Message {
   const description = shownLines(gym.description, SHOWN.description);
   const notice = shownLines(gym.notice, SHOWN.memberNotice);
   const map = view.map ?? mapPicture(undefined);
-  const where = [
-    gymHeading(gym),
-    ...(isEliteGym(gym) ? ['Elite raid gym'] : []),
-    regionsSentence(view.regions),
-  ];
+  const where = [gymHeading(gym), regionsSentence(view.regions)];
   return {
     v2: true,
     components: [
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index b982fa0ef15cd825ac3793529d4824c51c683352..e1ba817267a300d01626562c0181f7ac43521021 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -222,7 +222,7 @@ describe('renderTrainPost', () => {
     expect(block(post, '-# Route')).toMatch(/^-# Route, 3 stops, finished: 1\. /);
   });
 
-  it('lists the route in small print: every stop a link, the current one bold, elite raid gyms marked', () => {
+  it('lists the route in small print: every stop a link, the current one bold, no elite mark', () => {
     const exGyms = (id: number): PostGym | undefined => {
       const found = gym(id);
       return found && id === 7 ? { ...found, taggedEx: true } : found;
@@ -233,7 +233,7 @@ describe('renderTrainPost', () => {
         [
           `1. [Veterans Memorial Bridge](${maps(4)})`,
           `**2. [The Stacks](${maps(1)})**`,
-          `3. [Harbor Lighthouse Mural](${maps(7)}) (elite)`,
+          `3. [Harbor Lighthouse Mural](${maps(7)})`,
           `4. [Old Stone Fountain](${maps(2)})`,
         ].join(' · '),
     );
@@ -544,17 +544,15 @@ describe('routeLines', () => {
       `~~1\\. [Veterans Memorial Bridge](${maps(4)})~~`,
     );
     expect(routeLines({ party: testTrain(), gym })).toEqual([]);
-    // In a message (`/route show`) there is room for the full words; the post's field is short.
+    // An elite raid gym is not marked: members are not told any more (Matt, 2026-10-17).
     const elite = (id: number): PostGym | undefined => {
       const found = gym(id);
-      return found && { ...found, confirmedEx: id === 4 };
+      return found && { ...found, confirmedEx: id === 4, taggedEx: id === 4 };
     };
     expect(routeLines({ party: train, gym: elite }, { links: true })[0]).toBe(
-      `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>) · elite raid gym~~`,
-    );
-    expect(routeLines({ party: train, gym: elite })[0]).toBe(
-      '~~1\\. Veterans Memorial Bridge · elite~~',
+      `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
     );
+    expect(routeLines({ party: train, gym: elite })[0]).toBe('~~1\\. Veterans Memorial Bridge~~');
   });
 
   it('makes a name plain, so that it cannot break the link it stands in', () => {
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index ba3fbae31819aa6188be94a8c770b1a335e58b79..48362cf868214be1e937c6abf4f10a7f432605ba 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -1,5 +1,4 @@
 import { memberOf, type TrainParty } from '../domain/party/party.js';
-import { isEliteGym } from '../domain/party/raid.js';
 import { nameOf } from '../domain/party/timed.js';
 import { currentStop, nextStop, routeFinished, turnAhead } from '../domain/party/train.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
@@ -71,9 +70,9 @@ export function stopLink(gym: PostGym | undefined, bare = false): string {
 
 /**
  * The route, one line per stop, numbered from 1: a stop the train has left is struck through,
- * the one it is at stands out and says so, and an elite raid gym is marked ("elite"). With
- * `links`, every stop is a link to its place and the mark is in full words (for a message, as
- * `/route show`; `bare` as for `stopLink`).
+ * the one it is at stands out and says so. An elite raid gym is not marked: members are not
+ * told any more (Matt, 2026-10-17). With `links`, every stop is a link to its place (for a
+ * message, as `/route show`; `bare` as for `stopLink`).
  */
 export function routeLines(
   view: TrainPlaces,
@@ -83,11 +82,8 @@ export function routeLines(
   return route.map((gymId, index) => {
     const gym = view.gym(gymId);
     const name = options.links ? stopLink(gym, options.bare) : plain(gymName(gym));
-    // The post's field holds 1,024 characters for the whole route: one word a stop there.
-    const mark = options.links ? ' · elite raid gym' : ' · elite';
-    const ex = gym && isEliteGym(gym) ? mark : '';
     // The dot is escaped: a numbered list would count anew after a line that is cut out.
-    const text = `${index + 1}\\. ${name}${ex}`;
+    const text = `${index + 1}\\. ${name}`;
     if (index < stop) return `~~${text}~~`;
     return index === stop ? `**${text}** (the train is here)` : text;
   });
@@ -136,8 +132,8 @@ const ROUTE_ROOM = 600;
 const MODE_WORDS = { finish: '', loop: ', loops', 'turn-back': ', turns back at the end' } as const;
 
 /**
- * The route in one line of small print, every stop a link, the current one in bold and an elite
- * raid gym marked: `-# Route, stop 2 of 4: 1. [A](…) · **2. [B](…)** · 3. [C](…) (elite)`, with
+ * The route in one line of small print, every stop a link, the current one in bold:
+ * `-# Route, stop 2 of 4: 1. [A](…) · **2. [B](…)** · 3. [C](…)`, with
  * what the train does at the end when it does not finish there (`Route, stop 4 of 4, loops: …`),
  * on a route of two stops or more (one of a single stop finishes there in every mode). The route
  * is shown as it is stored: after a turn or a Reverse, in its new order. A route that does not
@@ -148,7 +144,7 @@ function routeLine(view: TrainPostView, fit: Fit): PostBlock[] {
   if (route.length === 0) return [];
   const stops = route.map((gymId, index) => {
     const gym = view.gym(gymId);
-    const text = `${index + 1}. ${stopLink(gym, true)}${gym && isEliteGym(gym) ? ' (elite)' : ''}`;
+    const text = `${index + 1}. ${stopLink(gym, true)}`;
     return index === stop ? `**${text}**` : text;
   });
   const mode = route.length < 2 ? '' : MODE_WORDS[view.party.train.atEnd];
````

### Task 3: Plan 8D T3: Train posts: Where the train is, what lies ahead, Whole route

Prototype commit: `1f2974ecf794a23c5336660d4d638283ffd304de`

A train's post says where the train is as a raid says its gym, under
**Where · stop 2 of 7** (the gym, its address and Map, its notice, its
picture beside them); Route complete once finished, how to add a stop
while it has no route. Under it a line of small print says what lies
ahead (routeAhead, pure, in train.ts beside nextStop and turnAhead): a
route of three stops or fewer whole with the current stop in bold and the
mode, otherwise the next two stops and how many more, looking past the end
of a loop or a train that turns back ("then back here" one stop before the
turn). Then a row of Move train... (left out of a region copy, as before)
and, on a route of four stops or more, the new Whole route
(party:<id>:route), which the next commit answers. The boss's lines join
the heading block, and the old route line and the Current gym / Next gym
lines go.

**Files:**

```
 src/commands/trains/move.test.ts         |   6 +-
 src/commands/trains/route.test.ts        |   2 +-
 src/components/party.ts                  |   3 +
 src/domain/party/train.test.ts           | 187 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/train.ts                | 104 +++++++++++++++++++++++++++++
 src/render/party-controls.ts             |  26 +++++++-
 src/render/train-post.test.ts            | 258 ++++++++++++++++++++++++++++++++++++++++++++---------------------------
 src/render/train-post.ts                 | 204 ++++++++++++++++++++++++++++++++++----------------------
 src/services/party-service.train.test.ts |   6 +-
 src/services/train-service.test.ts       |   2 +-
 10 files changed, 612 insertions(+), 186 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/trains/move.test.ts src/commands/trains/route.test.ts src/domain/party/train.test.ts src/render/train-post.test.ts src/services/party-service.train.test.ts src/services/train-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1f2974ecf794a23c5336660d4d638283ffd304de -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T3: Train posts: Where the train is, what lies ahead, Whole route`, the body above and the trailer, staging exactly
  `src/commands/trains/move.test.ts src/commands/trains/route.test.ts src/components/party.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/party-controls.ts src/render/train-post.test.ts src/render/train-post.ts src/services/party-service.train.test.ts src/services/train-service.test.ts`.

````diff
diff --git a/src/commands/trains/move.test.ts b/src/commands/trains/move.test.ts
index cee1598c98b4f7c3e0589f7783edbafa9e00f94a..6cdf8e0c65c6e1f42aaddf34ab0ccbc4d0048e33 100644
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -195,7 +195,7 @@ describe('/next, /previous, /skip and /finish', () => {
       users: [REPORTER, BOB],
     });
     const message = made.gateway.posts.get(made.postId)?.message;
-    expect(textOf(message)).toContain(`**Current gym** · [The Stacks](${maps(1)})`);
+    expect(textOf(message)).toMatch(/\*\*Where · stop \d+ of \d+\*\*\n\*\*The Stacks\*\* · /);
   });
 
   it('each says where the train is afterwards', async () => {
@@ -858,9 +858,9 @@ describe('the Move train panel: what the train does at the end of its route', ()
     for (const message of made.gateway.messagesIn(made.postId)) {
       expect(message.message.mention).toBeUndefined();
     }
-    // The post says it in its route line.
+    // The post says it in what lies ahead.
     expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
-      '-# Route, stop 1 of 4, loops: ',
+      ', and 1 more round the loop',
     );
   });
 
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index 97d2a3f929a2ad2bc1b6ca866900ee57666333a1..da6b3773dae7baf090daeaf87c3156364a765985 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -212,7 +212,7 @@ describe('/route add', () => {
       `**Alice** (<@${ALICE}>) added stop 5 to the route: **Riverside Park Gazebo**.`,
     ]);
     const message = made.gateway.posts.get(made.postId)?.message;
-    expect(textOf(message)).toContain('-# Route, stop 1 of 5: ');
+    expect(textOf(message)).toContain('**Where · stop 1 of 5**');
   });
 
   it('takes a gym of another region without asking, and the post stays where it is', async () => {
diff --git a/src/components/party.ts b/src/components/party.ts
index 6c4415c317b6cfd2177d5a969a0afa396a0d6ba7..ed63db975bdc0cd5784dd1c5d20321c1e59c4d5f 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -134,6 +134,9 @@ export const partyButtons: ComponentHandler = {
       case 'atend':
         // The menu of that panel: never a button.
         throw new UserError(STALE_COMPONENT);
+      case 'route':
+        // "Whole route" of a train's post: answered from the next commit on.
+        throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
diff --git a/src/domain/party/train.test.ts b/src/domain/party/train.test.ts
index 55e70c495c08eb9d2f101c9d6792479450433aea..6e4edfb8dc7b403a21d8ca6b284f56136c9cd1d4 100644
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -46,6 +46,7 @@ import {
   clearConductor,
   clearRoute,
   createTrain,
+  destinationOf,
   currentStop,
   isTrainMove,
   mayNotMove,
@@ -56,6 +57,7 @@ import {
   removeStop,
   replaceRoute,
   reverseRoute,
+  routeAhead,
   routeFinished,
   setAtEnd,
   setConductor,
@@ -267,6 +269,191 @@ describe('where a train is', () => {
   });
 });
 
+describe('routeAhead: what the post says lies ahead', () => {
+  /** A route of seven gyms, 11 to 17, at the stop with this index. */
+  const seven = (stop: number, atEnd: TrainAtEnd = 'finish') =>
+    onRoute([11, 12, 13, 14, 15, 16, 17], stop, { atEnd });
+  const stop = (number: number, turn?: TrainTurn) => ({
+    number,
+    gymId: number + 10,
+    ...(turn === undefined ? {} : { turn }),
+  });
+
+  it('says nothing of a train without a route', () => {
+    expect(routeAhead(testTrain())).toEqual({ kind: 'no-route' });
+  });
+
+  it('gives a route of three stops or fewer whole, with where the train is and its mode', () => {
+    expect(routeAhead(onRoute([4, 1, 7], 1, { atEnd: 'loop' }))).toEqual({
+      kind: 'whole',
+      route: [4, 1, 7],
+      current: 1,
+      atEnd: 'loop',
+    });
+    // Finished: at no stop.
+    expect(routeAhead(onRoute([4, 1, 7], 3))).toEqual({
+      kind: 'whole',
+      route: [4, 1, 7],
+      current: undefined,
+      atEnd: 'finish',
+    });
+    // A route of one stop finishes in every mode.
+    expect(routeAhead(onRoute([4], 0, { atEnd: 'turn-back' }))).toMatchObject({
+      atEnd: 'finish',
+    });
+  });
+
+  it('gives the next two stops of a longer route that finishes, and how many more to the end', () => {
+    expect(routeAhead(seven(0))).toEqual({
+      kind: 'next',
+      stops: [stop(2), stop(3)],
+      rest: { count: 4, toward: 'end' },
+    });
+    expect(routeAhead(seven(1))).toEqual({
+      kind: 'next',
+      stops: [stop(3), stop(4)],
+      rest: { count: 3, toward: 'end' },
+    });
+    // When the two shown reach the last stop, the line says so.
+    expect(routeAhead(seven(4))).toEqual({
+      kind: 'next',
+      stops: [stop(6), stop(7)],
+      then: 'last-stop',
+    });
+    expect(routeAhead(seven(5))).toEqual({
+      kind: 'next',
+      stops: [stop(7)],
+      then: 'last-stop',
+    });
+    expect(routeAhead(seven(6))).toEqual({ kind: 'last-stop' });
+    expect(routeAhead(seven(7))).toEqual({ kind: 'finished' });
+  });
+
+  it('looks past the end of a loop: round again, and how many more round it', () => {
+    expect(routeAhead(seven(1, 'loop'))).toEqual({
+      kind: 'next',
+      stops: [stop(3), stop(4)],
+      rest: { count: 4, toward: 'loop' },
+    });
+    expect(routeAhead(seven(5, 'loop'))).toEqual({
+      kind: 'next',
+      stops: [stop(7), stop(1, 'round')],
+      rest: { count: 4, toward: 'loop' },
+    });
+    expect(routeAhead(seven(6, 'loop'))).toEqual({
+      kind: 'next',
+      stops: [stop(1, 'round'), stop(2)],
+      rest: { count: 4, toward: 'loop' },
+    });
+    // A route finished by Finish is finished whatever the mode.
+    expect(routeAhead(seven(7, 'loop'))).toEqual({ kind: 'finished' });
+  });
+
+  it('looks past the end of a train that turns back, and counts the stops back to the start', () => {
+    // On the way out: how many more before it turns.
+    expect(routeAhead(seven(1, 'turn-back'))).toEqual({
+      kind: 'next',
+      stops: [stop(3), stop(4)],
+      rest: { count: 3, toward: 'turn' },
+    });
+    // The two shown reach the last stop, where it turns.
+    expect(routeAhead(seven(4, 'turn-back'))).toEqual({
+      kind: 'next',
+      stops: [stop(6), stop(7)],
+      then: 'turns-back',
+    });
+    // One stop before the end the second next stop is this one (Matt, 2026-10-17: "then back
+    // here").
+    expect(routeAhead(seven(5, 'turn-back'))).toEqual({
+      kind: 'next',
+      stops: [stop(7)],
+      then: 'back-here',
+      rest: { count: 5, toward: 'start' },
+    });
+    // At the last stop: back along the route, numbered as it is stored now.
+    expect(routeAhead(seven(6, 'turn-back'))).toEqual({
+      kind: 'next',
+      stops: [stop(6, 'back'), stop(5)],
+      rest: { count: 4, toward: 'start' },
+    });
+    expect(routeAhead(seven(7, 'turn-back'))).toEqual({ kind: 'finished' });
+  });
+
+  it('agrees with where Next takes the train, twice, for every length, mode and stop', () => {
+    const routes = [4, 5, 6, 7].flatMap((length) => {
+      const route = Array.from({ length }, (_, index) => 11 + index);
+      // A route after a turn or a Reverse is stored the other way round.
+      return [route, [...route].reverse()];
+    });
+    for (const route of routes) {
+      for (const atEnd of TRAIN_AT_END) {
+        for (let at = 0; at < route.length; at++) {
+          const train = onRoute(route, at, { atEnd });
+          const ahead = routeAhead(train);
+          const where = `${route.join(',')} ${atEnd} at ${at}`;
+          if (ahead.kind !== 'next') {
+            expect([where, ahead.kind, nextStop(train)]).toEqual([where, 'last-stop', undefined]);
+            continue;
+          }
+          const [first, second] = ahead.stops;
+          expect([where, first?.gymId, first?.turn]).toEqual([
+            where,
+            nextStop(train),
+            turnAhead(train),
+          ]);
+          expect(first?.number).toBe((first ? route.indexOf(first.gymId) : -1) + 1);
+          // Where Next leads from there.
+          const step = destinationOf(train, 'next');
+          const there = onRoute([...step.route], step.stop, { atEnd });
+          if (ahead.then === 'back-here') {
+            expect([where, second, nextStop(there)]).toEqual([
+              where,
+              undefined,
+              currentStop(train),
+            ]);
+          } else if (second) {
+            expect([where, second.gymId, second.turn]).toEqual([
+              where,
+              nextStop(there),
+              turnAhead(there),
+            ]);
+          }
+          // How many more is said whenever there are more, and only then.
+          expect(ahead.rest === undefined || ahead.rest.count > 0).toBe(true);
+        }
+      }
+    }
+    // The boundaries of a route of four stops.
+    const four = (at: number, atEnd: TrainAtEnd) =>
+      routeAhead(onRoute([11, 12, 13, 14], at, { atEnd }));
+    expect(four(0, 'finish')).toEqual({
+      kind: 'next',
+      stops: [stop(2), stop(3)],
+      rest: { count: 1, toward: 'end' },
+    });
+    expect(four(1, 'finish')).toEqual({
+      kind: 'next',
+      stops: [stop(3), stop(4)],
+      then: 'last-stop',
+    });
+    expect(four(0, 'turn-back')).toEqual({
+      kind: 'next',
+      stops: [stop(2), stop(3)],
+      rest: { count: 1, toward: 'turn' },
+    });
+    expect(four(1, 'turn-back')).toEqual({
+      kind: 'next',
+      stops: [stop(3), stop(4)],
+      then: 'turns-back',
+    });
+    expect(four(3, 'loop')).toEqual({
+      kind: 'next',
+      stops: [stop(1, 'round'), stop(2)],
+      rest: { count: 1, toward: 'loop' },
+    });
+  });
+});
+
 describe('addStop', () => {
   it('appends a gym, and the first stop is where the train is', () => {
     const first = addStop(testTrain(), REPORTER, 4);
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index fb896eb27deef930e79f81976856f1f7a7fd5222..867fc6aeb1b277cd2e44b6c243aca244f90d515b 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -103,6 +103,110 @@ export function turnAhead(party: TrainParty): TrainTurn | undefined {
   return destinationOf(party, 'next').turn;
 }
 
+/** A route of at most this many stops is shown whole in the post (Matt, 2026-10-17). */
+export const WHOLE_ROUTE_STOPS = 3;
+
+/** A stop the train goes to: its number in the route as it is stored now, its gym, and how the train got past the end to reach it. */
+export interface StopAhead {
+  number: number;
+  gymId: number;
+  turn?: TrainTurn;
+}
+
+/**
+ * What lies ahead of a train, as its post says it under where it is (Matt, 2026-10-17):
+ * `no-route`; a route of `WHOLE_ROUTE_STOPS` or fewer `whole` (the index of the current stop,
+ * undefined once finished, and what the train does at the end as far as it can, `endMode`);
+ * a longer one `finished`, at its `last-stop` (a train that finishes there), or the `next` one or
+ * two stops the train goes to, in the order it travels: past the end of a loop (`round`) or of a
+ * train that turns back (`back`), the numbers those of the route as it is stored now. `then`
+ * says what follows them: the train is `back-here` (a train that turns back, one stop before the
+ * end: the second next stop would be this one), they reach the `last-stop`, or the train
+ * `turns-back` at the second. `rest` counts the stops left after them, `toward` the end of the route,
+ * round the loop, back to the start, or the turn.
+ */
+export type RouteAhead =
+  | { kind: 'no-route' }
+  | {
+      kind: 'whole';
+      route: readonly number[];
+      current: number | undefined;
+      atEnd: TrainAtEnd;
+    }
+  | { kind: 'finished' }
+  | { kind: 'last-stop' }
+  | {
+      kind: 'next';
+      stops: readonly StopAhead[];
+      then?: 'back-here' | 'last-stop' | 'turns-back';
+      /** The stops left after those shown, when there are any, and where they lead. */
+      rest?: { count: number; toward: 'end' | 'loop' | 'start' | 'turn' };
+    };
+
+/** What lies ahead of the train from where it is (`RouteAhead`). */
+export function routeAhead(party: TrainParty): RouteAhead {
+  const { route, stop } = party.train;
+  const length = route.length;
+  if (length === 0) return { kind: 'no-route' };
+  const mode = endMode(party);
+  const finished = stop >= length;
+  if (length <= WHOLE_ROUTE_STOPS) {
+    return { kind: 'whole', route, current: finished ? undefined : stop, atEnd: mode };
+  }
+  if (finished) return { kind: 'finished' };
+  const at = (index: number, turn?: TrainTurn): StopAhead => {
+    const gymId = route[index];
+    if (gymId === undefined) throw new Error(`no stop ${index} on a route of ${length}`);
+    return { number: index + 1, gymId, ...(turn === undefined ? {} : { turn }) };
+  };
+  const last = length - 1;
+  switch (mode) {
+    case 'finish':
+      if (stop === last) return { kind: 'last-stop' };
+      if (stop + 2 >= last) {
+        const stops = stop + 2 === last ? [at(stop + 1), at(stop + 2)] : [at(stop + 1)];
+        return { kind: 'next', stops, then: 'last-stop' };
+      }
+      return {
+        kind: 'next',
+        stops: [at(stop + 1), at(stop + 2)],
+        rest: { count: last - stop - 2, toward: 'end' },
+      };
+    case 'loop': {
+      const ahead = [(stop + 1) % length, (stop + 2) % length];
+      return {
+        kind: 'next',
+        stops: ahead.map((index) => at(index, index === 0 ? 'round' : undefined)),
+        rest: { count: length - 3, toward: 'loop' },
+      };
+    }
+    case 'turn-back':
+      if (stop === last) {
+        return {
+          kind: 'next',
+          stops: [at(last - 1, 'back'), at(last - 2)],
+          rest: { count: last - 2, toward: 'start' },
+        };
+      }
+      if (stop === last - 1) {
+        return {
+          kind: 'next',
+          stops: [at(last)],
+          then: 'back-here',
+          rest: { count: stop, toward: 'start' },
+        };
+      }
+      if (stop === last - 2) {
+        return { kind: 'next', stops: [at(stop + 1), at(last)], then: 'turns-back' };
+      }
+      return {
+        kind: 'next',
+        stops: [at(stop + 1), at(stop + 2)],
+        rest: { count: last - stop - 2, toward: 'turn' },
+      };
+  }
+}
+
 /**
  * What the train does at the end of its route as far as it can: a route of fewer than two stops
  * finishes in every mode, since there is nowhere to go round or back to.
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 3b24c07d7138af1ee76ef2372af2f5db294b84c1..ab71402fa993de162ba458e6f65ca8d29788117b 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -27,8 +27,9 @@ export const PARTY_KIND = 'party';
  * the "Set time" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
  * form of `/delete` for members who are not staff; no button has it. `move` is the button
  * "Move train…" of a train's post, which opens the panel whose buttons are `next`, `previous`,
- * `skip` and `finish` (`train-panel.ts`). `shot` is "Screenshot feedback" of a raid reported
- * from a screenshot, which shows that screenshot privately.
+ * `skip` and `finish` (`train-panel.ts`). `route` is "Whole route" of a train's post, which
+ * shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
+ * screenshot, which shows that screenshot privately.
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -50,6 +51,7 @@ export const PARTY_ACTIONS = [
   'finish',
   'reverse',
   'atend',
+  'route',
   'shot',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
@@ -135,6 +137,26 @@ export function moveTrainButton(party: Pick<Party, 'id'>): PostButton {
   };
 }
 
+/**
+ * The button "Whole route" of a train's post whose route is longer than the post lists: the
+ * route privately, as `/route show` answers it. A copy for another region keeps it.
+ */
+export function wholeRouteButton(party: Pick<Party, 'id'>): PostButton {
+  return {
+    button: partyButton(
+      party.id,
+      'route',
+      WHOLE_ROUTE_LABEL,
+      ButtonStyle.Secondary,
+      undefined,
+      '🗺️',
+    ),
+  };
+}
+
+/** The label of the button of a train's post that shows its whole route. */
+export const WHOLE_ROUTE_LABEL = 'Whole route';
+
 export interface BottomOptions {
   /**
    * The party shows several groups: their sections carry "Join A", "Join B", so the buttons of
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index e1ba817267a300d01626562c0181f7ac43521021..8388c4bec41d606e14356370c2bac4a23b1fe0c0 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -40,6 +40,7 @@ import {
   MAX_ROUTE_STOPS,
   TRAIN_AT_END,
   type Attendee,
+  type TrainAtEnd,
   type TrainDetails,
   type TrainParty,
 } from '../domain/party/party.js';
@@ -53,6 +54,7 @@ import {
   TEXT_BUDGET,
   type RenderedPost,
 } from './party-post.js';
+import { renderMirror } from './mirrors.js';
 import { shownBoss, type PostGym } from './raid-post.js';
 import { LIMITS } from './text.js';
 import {
@@ -78,7 +80,8 @@ const ARCHIVING = { graceMinutes: 5, warningMinutes: 60 };
 const START = at('2026-10-13T16:00');
 const END = at('2026-10-13T18:00');
 const catalogue = catalogueFixture();
-const LOCATION = '**Where**';
+/** The start of the heading of where the train is. */
+const LOCATION = '**Where';
 /** The address line of gyms 4 and 11 as a post shows it. */
 const RIVER_ROAD = '12 River Road, Pinewood, Pennsylvania 15999';
 
@@ -118,9 +121,20 @@ function block(post: RenderedPost, start: string): string | undefined {
   return textDisplays(post.message).find((text) => text.startsWith(start));
 }
 
-/** Where the train is, beside "Move train…": the second text of the post. */
+/** Where the train is: the text of the post under "**Where…**". */
 const where = (party: TrainParty, extra: Partial<TrainPostView> = {}): string | undefined =>
-  textDisplays(renderTrainPost(view(party, extra)).message)[1];
+  textDisplays(renderTrainPost(view(party, extra)).message).find((text) =>
+    text.startsWith('**Where'),
+  );
+
+/** What lies ahead, in small print under where the train is. */
+const ahead = (party: TrainParty, extra: Partial<TrainPostView> = {}): string | undefined =>
+  textDisplays(renderTrainPost(view(party, extra)).message).find((text) =>
+    /^-# (?:Next|Route|This)/.test(text),
+  );
+
+/** A route of seven gyms, 1 to 7. */
+const SEVEN = [1, 2, 3, 4, 5, 6, 7];
 
 const NO_TIME =
   'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
@@ -152,7 +166,7 @@ describe('renderTrainPost', () => {
     expect(thumbnailOf(post.message)).toBeUndefined();
     expect(textDisplays(post.message)).toEqual([
       `### Raid Train: Saturday legendaries\n${NO_TIME}`,
-      'No route yet: `/route add` adds a stop.',
+      '**Where**\nNo route yet: `/route add` adds a stop.',
       `**Interested (1)**\n<@${REPORTER}>`,
       '**Coming (0)**',
       '**Present (0)**',
@@ -201,110 +215,138 @@ describe('renderTrainPost', () => {
     expect(lines(onRoute([4])).some((line) => line.startsWith('Conductor'))).toBe(false);
   });
 
-  it('links the stop the train is at and the one after it, beside "Move train…"', () => {
-    expect(where(onRoute([4, 1, 7]))).toBe(
-      `**Current gym** · [Veterans Memorial Bridge](${maps(4)})\n` +
-        // A gym is called by its nickname when it has one.
-        `**Next gym** · [The Stacks](${maps(1)})`,
+  it('says where the train is as a raid says its gym, with the number of the stop', () => {
+    const post = renderTrainPost(view(onRoute(SEVEN, 3)));
+    expect(where(onRoute(SEVEN, 3))).toBe(
+      `**Where · stop 4 of 7**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
     );
-    expect(where(onRoute([4, 1, 7], 2))).toBe(
-      `**Current gym** · [Harbor Lighthouse Mural](${maps(7)})`,
+    // Under it the next two stops and how many more, then Move train… and Whole route.
+    expect(ahead(onRoute(SEVEN, 3))).toBe(
+      '-# Next: 5. Starbucks · 6. Maple Leaf Mosaic, and 1 more to the end',
     );
-    const post = renderTrainPost(view(onRoute([4, 1, 7])));
-    expect(buttonLabels(post.message)[0]).toBe('Move train…');
+    expect(buttonLabels(post.message).slice(0, 2)).toEqual(['Move train…', 'Whole route']);
+    const { id } = onRoute(SEVEN);
+    expect(customIdsOf(post.message).slice(0, 2)).toEqual([
+      `party:${id}:move`,
+      `party:${id}:route`,
+    ]);
   });
 
-  it('says that the route is finished, and stays blue: only the times end a train', () => {
-    const post = renderTrainPost(view(onRoute([4, 1, 7], 3)));
-    expect(where(onRoute([4, 1, 7], 3))).toBe('**Route complete**');
-    expect(accentOf(post.message)).toBe(0x3498db);
-    expect(post.tags).toEqual(['Train']);
-    expect(block(post, '-# Route')).toMatch(/^-# Route, 3 stops, finished: 1\. /);
+  it('words what lies ahead by the mode and where the train is', () => {
+    const at = (stop: number, atEnd: TrainAtEnd = 'finish') =>
+      ahead(onRoute(SEVEN, stop, { atEnd }));
+    expect(at(0)).toBe(
+      "-# Next: 2. Old Stone Fountain · 3. St. Mary's Church, and 4 more to the end",
+    );
+    expect(at(4)).toBe('-# Next: 6. Maple Leaf Mosaic · 7. Harbor Lighthouse Mural, the last stop');
+    expect(at(5)).toBe('-# Next: 7. Harbor Lighthouse Mural, the last stop');
+    expect(at(6)).toBe('-# This is the last stop.');
+    // A loop looks past the end.
+    expect(at(5, 'loop')).toBe(
+      '-# Next: 7. Harbor Lighthouse Mural · 1. The Stacks (round again), and 4 more round the loop',
+    );
+    expect(at(6, 'loop')).toBe(
+      '-# Next: 1. The Stacks (round again) · 2. Old Stone Fountain, and 4 more round the loop',
+    );
+    // So does a train that turns back.
+    expect(at(0, 'turn-back')).toBe(
+      "-# Next: 2. Old Stone Fountain · 3. St. Mary's Church, and 4 more to the end, where it turns back",
+    );
+    expect(at(4, 'turn-back')).toBe(
+      '-# Next: 6. Maple Leaf Mosaic · 7. Harbor Lighthouse Mural, where it turns back',
+    );
+    expect(at(5, 'turn-back')).toBe(
+      '-# Next: 7. Harbor Lighthouse Mural, then back here, and 5 more back to the start',
+    );
+    expect(at(6, 'turn-back')).toBe(
+      '-# Next: 6. Maple Leaf Mosaic (turning back) · 5. Starbucks, and 4 more back to the start',
+    );
   });
 
-  it('lists the route in small print: every stop a link, the current one bold, no elite mark', () => {
-    const exGyms = (id: number): PostGym | undefined => {
-      const found = gym(id);
-      return found && id === 7 ? { ...found, taggedEx: true } : found;
-    };
-    const post = renderTrainPost(view(onRoute([4, 1, 7, 2], 1), { gym: exGyms }));
-    expect(block(post, '-# Route')).toBe(
-      '-# Route, stop 2 of 4: ' +
-        [
-          `1. [Veterans Memorial Bridge](${maps(4)})`,
-          `**2. [The Stacks](${maps(1)})**`,
-          `3. [Harbor Lighthouse Mural](${maps(7)})`,
-          `4. [Old Stone Fountain](${maps(2)})`,
-        ].join(' · '),
-    );
-    // The brief says where it is, in a word.
-    expect(post.brief.lines[1]).toBe(`At [The Stacks](${maps(1)})`);
-    const finished = renderTrainPost(view(onRoute([4, 1], 2)));
-    expect(finished.brief.lines[1]).toBe('Route finished');
-  });
-
-  it('says at the last stop where a train that loops or turns back goes next, and the mode in the route', () => {
-    const looping = onRoute([4, 1, 7], 2, { atEnd: 'loop' });
-    expect(where(looping)).toBe(
-      `**Current gym** · [Harbor Lighthouse Mural](${maps(7)})\n` +
-        `**Next gym** · [Veterans Memorial Bridge](${maps(4)}) (round again)`,
-    );
-    expect(block(renderTrainPost(view(looping)), '-# Route')).toMatch(
-      /^-# Route, stop 3 of 3, loops: 1\. \[Veterans/,
-    );
-    const turning = onRoute([4, 1, 7], 2, { atEnd: 'turn-back' });
-    expect(where(turning)).toBe(
-      `**Current gym** · [Harbor Lighthouse Mural](${maps(7)})\n` +
-        `**Next gym** · [The Stacks](${maps(1)}) (turning back)`,
-    );
-    expect(block(renderTrainPost(view(turning)), '-# Route')).toMatch(
-      /^-# Route, stop 3 of 3, turns back at the end: 1\. \[Veterans/,
-    );
-    // Elsewhere on the route the next gym is the next stop, whatever the mode.
-    expect(where(onRoute([4, 1, 7], 0, { atEnd: 'loop' }))).toBe(
-      `**Current gym** · [Veterans Memorial Bridge](${maps(4)})\n` +
-        `**Next gym** · [The Stacks](${maps(1)})`,
+  it('lists a route of three stops or fewer whole, with its mode, and has no Whole route', () => {
+    const looping = onRoute([4, 1, 7], 1, { atEnd: 'loop' });
+    expect(ahead(looping)).toBe(
+      '-# Route: 1. Veterans Memorial Bridge · **2. The Stacks** · 3. Harbor Lighthouse Mural, loops',
+    );
+    expect(where(looping)).toMatch(/^\*\*Where · stop 2 of 3\*\*\n\*\*The Stacks\*\* · /);
+    expect(buttonLabels(renderTrainPost(view(looping)).message)).not.toContain('Whole route');
+    expect(ahead(onRoute([4, 1], 0, { atEnd: 'turn-back' }))).toBe(
+      '-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks, turns back at the end',
     );
     // A route of one stop finishes there in every mode: the line says nothing of a mode.
-    expect(block(renderTrainPost(view(onRoute([4], 0, { atEnd: 'loop' }))), '-# Route')).toMatch(
-      /^-# Route, stop 1 of 1: \*\*1\. \[Veterans/,
+    expect(ahead(onRoute([4], 0, { atEnd: 'loop' }))).toBe(
+      '-# Route: **1. Veterans Memorial Bridge**',
     );
-    // A finished route reads as it always did.
-    const finished = renderTrainPost(view(onRoute([4, 1, 7], 3, { atEnd: 'loop' })));
-    expect(block(finished, '-# Route')).toMatch(/^-# Route, 3 stops, finished: 1\. /);
+  });
+
+  it('says that the route is complete, and stays blue: only the times end a train', () => {
+    const short = renderTrainPost(view(onRoute([4, 1, 7], 3)));
+    expect(where(onRoute([4, 1, 7], 3))).toBe('**Where**\nRoute complete');
+    // A short route is still listed, nobody in bold, and without its mode: it is done.
+    for (const atEnd of TRAIN_AT_END) {
+      expect(ahead(onRoute([4, 1, 7], 3, { atEnd }))).toBe(
+        '-# Route: 1. Veterans Memorial Bridge · 2. The Stacks · 3. Harbor Lighthouse Mural',
+      );
+    }
+    // Move train… stays: Previous and Reverse take a Finish back.
+    expect(buttonLabels(short.message)).toContain('Move train…');
+    expect(buttonLabels(short.message)).not.toContain('Whole route');
+    expect(accentOf(short.message)).toBe(0x3498db);
+    expect(short.tags).toEqual(['Train']);
+    expect(thumbnailsOf(short.message)).toEqual([]);
+    // A long one is not: Whole route shows it.
+    const long = renderTrainPost(view(onRoute(SEVEN, 7)));
+    expect(where(onRoute(SEVEN, 7))).toBe('**Where**\nRoute complete');
+    expect(ahead(onRoute(SEVEN, 7))).toBeUndefined();
+    expect(buttonLabels(long.message).slice(0, 2)).toEqual(['Move train…', 'Whole route']);
+  });
+
+  it('says how to add a stop to a train without a route, with Move train… alone', () => {
+    const post = renderTrainPost(view(testTrain()));
+    expect(where(testTrain())).toBe('**Where**\nNo route yet: `/route add` adds a stop.');
+    expect(ahead(testTrain())).toBeUndefined();
+    expect(buttonLabels(post.message)[0]).toBe('Move train…');
+    expect(buttonLabels(post.message)).not.toContain('Whole route');
   });
 
   it('lists a route that turned back or was reversed in its new order, numbered anew', () => {
     const turned = onRoute([7, 1, 4], 1, { atEnd: 'turn-back' });
-    expect(block(renderTrainPost(view(turned)), '-# Route')).toBe(
-      '-# Route, stop 2 of 3, turns back at the end: ' +
-        [
-          `1. [Harbor Lighthouse Mural](${maps(7)})`,
-          `**2. [The Stacks](${maps(1)})**`,
-          `3. [Veterans Memorial Bridge](${maps(4)})`,
-        ].join(' · '),
-    );
-    expect(where(turned)).toBe(
-      `**Current gym** · [The Stacks](${maps(1)})\n` +
-        `**Next gym** · [Veterans Memorial Bridge](${maps(4)})`,
+    expect(ahead(turned)).toBe(
+      '-# Route: 1. Harbor Lighthouse Mural · **2. The Stacks** · 3. Veterans Memorial Bridge, turns back at the end',
     );
   });
 
-  it('names a gym that no longer exists as unknown, without a link', () => {
-    const post = renderTrainPost(view(onRoute([999, 4])));
-    expect(where(onRoute([999, 4]))).toBe(
-      `**Current gym** · Unknown gym\n**Next gym** · [Veterans Memorial Bridge](${maps(4)})`,
+  it('names a gym that no longer exists as unknown, without a map', () => {
+    expect(where(onRoute([999, 4]))).toBe('**Where · stop 1 of 2**\n**Unknown gym**');
+    expect(ahead(onRoute([999, 4]))).toBe(
+      '-# Route: **1. Unknown gym** · 2. Veterans Memorial Bridge',
     );
-    expect(block(post, '-# Route')).toMatch(/^-# Route, stop 1 of 2: \*\*1\. Unknown gym\*\* · /);
+  });
+
+  it('leaves Move train… out of a copy in another region, and keeps Whole route', () => {
+    const post = renderTrainPost(view(onRoute(SEVEN, 1)));
+    const copy = renderMirror('region', post, {
+      postId: '900000000000000001',
+      regionChannelId: undefined,
+    });
+    expect(buttonLabels(copy)).toContain('Whole route');
+    expect(buttonLabels(copy)).not.toContain('Move train…');
+    // A short route's copy has neither.
+    const short = renderMirror('region', renderTrainPost(view(onRoute([4, 1]))), {
+      postId: '900000000000000001',
+      regionChannelId: undefined,
+    });
+    expect(buttonLabels(short).slice(0, 1)).toEqual(['Interested']);
   });
 
   it('shows the boss the train is after as a raid shows it: name, picture, weaknesses, catch CP', () => {
     const train = onRoute([4], 0, { boss: { key: 'yveltal' } });
     const post = renderTrainPost(view(train));
     expect(lines(train)[1]).toBe('**After Yveltal** ✨');
-    const boss = block(post, '**Weaknesses**');
+    // In the heading block, after the times (Matt, 2026-10-17: no block of its own).
+    const boss = lines(train).slice(3).join('\n');
     expect(boss).toMatch(/^\*\*Weaknesses\*\* /);
-    expect(boss).toMatch(/\*\*Catch CP\*\* \d+–\d+ · \d+–\d+/);
+    expect(boss).toMatch(/\n\*\*Catch CP\*\* \d+–\d+ · \d+–\d+/);
     // No moves: a train goes from raid to raid.
     expect(boss).not.toMatch(/Moveset/);
     const listed = raidBossesFixture()
@@ -337,19 +379,19 @@ describe('renderTrainPost', () => {
       block(renderTrainPost(view(train, extra)), LOCATION);
     // As a raid's: the gym, its address and its map, then its notice; no elite mark.
     expect(about(onRoute([4, 11]), { gym: noted })).toBe(
-      `${LOCATION}\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)\n` +
+      `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)\n` +
         'Mind the \\*traffic\\*',
     );
     // At the next stop it is that gym's address and notice.
     expect(about(onRoute([4, 11], 1), { gym: noted })).toBe(
-      `${LOCATION}\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
+      `**Where · stop 2 of 2**\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
         'Park closes at dusk',
     );
-    // And nothing where the train is at no gym.
-    expect(about(onRoute([4, 11], 2))).toBeUndefined();
+    // And no gym where the train is at none.
+    expect(about(onRoute([4, 11], 2))).toBe('**Where**\nRoute complete');
     // A stop without a notice is named all the same.
     expect(about(onRoute([1]))).toBe(
-      `${LOCATION}\n**The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<${maps(1)}>)`,
+      `**Where · stop 1 of 1**\n**The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<${maps(1)}>)`,
     );
   });
 
@@ -362,14 +404,14 @@ describe('renderTrainPost', () => {
     const post = (train: TrainParty) => renderTrainPost(view(train, { gym: pictured }));
     const first = post(onRoute([4, 11]));
     expect(block(first, LOCATION)).toBe(
-      `${LOCATION}\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
+      `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
     );
     expect(thumbnailBeside(first.message, LOCATION)).toBe(`${picture(4)}=s400`);
-    // Move train… stays beside where the train is.
+    // Move train… stays under where the train is.
     expect(buttonLabels(first.message)[0]).toBe('Move train…');
     const next = post(onRoute([4, 11], 1));
     expect(block(next, LOCATION)).toBe(
-      `${LOCATION}\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
+      `**Where · stop 2 of 2**\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
         'Park closes at dusk',
     );
     // A stop without an address says so beside its picture.
@@ -377,7 +419,7 @@ describe('renderTrainPost', () => {
       view(onRoute([4, 11]), { gym: (id) => pictured(id) && { ...pictured(id)!, geodata: null } }),
     );
     expect(block(lost, LOCATION)).toBe(
-      `${LOCATION}\n**Veterans Memorial Bridge** · (no address available) · [Map](<${maps(4)}>)`,
+      `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · (no address available) · [Map](<${maps(4)}>)`,
     );
     expect(thumbnailBeside(next.message, LOCATION)).toBe(`${picture(11)}=s400`);
     // A finished route is at no gym: no picture.
@@ -473,15 +515,35 @@ describe('renderTrainPost', () => {
     expect(componentCount(post.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
     expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
     expectSendable(post);
-    // The route keeps the stops around the one the train is at.
-    const route = block(post, '-# Route') ?? '';
-    expect(route).toMatch(/^-# Route, stop 31 of \d+: …29 earlier stops · 30\. \[/);
-    expect(route).toMatch(/ · \*\*31\. \[.*\)\*\* · /);
-    expect(route).toMatch(/…and \d+ more$/);
+    // Where it is and the next two stops, however long the route.
+    expect(block(post, '**Where')).toMatch(/^\*\*Where · stop 31 of 50\*\*\n\*\*Long gym name /);
+    expect(block(post, '-# Next')).toMatch(
+      /^-# Next: 32\. Long gym name [^·]+ · 33\. Long gym name [^·]+, and 17 more to the end$/,
+    );
+    expect(buttonLabels(post.message).slice(0, 2)).toEqual(['Move train…', 'Whole route']);
   });
 });
 
 describe('the longest train that can be', () => {
+  it('cuts the line of a short route of the longest names alike, keeping the bold', () => {
+    const heavy = (id: number): PostGym => ({
+      name: `${'[*]'.repeat(84)}${id}`,
+      nickname: null,
+      lat: 40,
+      lon: -80,
+      notice: null,
+      taggedEx: false,
+      confirmedEx: false,
+    });
+    const post = renderTrainPost(view(onRoute([1, 2, 3], 1, { atEnd: 'loop' }), { gym: heavy }));
+    expectSendable(post);
+    const line = textDisplays(post.message).find((text) => text.startsWith('-# Route: ')) ?? '';
+    expect(line.length).toBeLessThanOrEqual(600 + 3);
+    expect(line).toMatch(/^-# Route: 1\. \S+… · \*\*2\. \S+…\*\* · 3\. \S+…, loops$/);
+    // No backslash is left to escape what follows it.
+    expect(line).not.toMatch(/(?<!\\)(?:\\\\)*\\(?:…| |$)/);
+  });
+
   it('keeps within what Discord takes when every text needs escaping', () => {
     const heavy = (id: number): PostGym => ({
       name: `${'[*]'.repeat(84)}${id}`,
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index 48362cf868214be1e937c6abf4f10a7f432605ba..3ca92781e000e2cebe544bddc81f1113a6e7aaf6 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -1,8 +1,13 @@
 import { memberOf, type TrainParty } from '../domain/party/party.js';
 import { nameOf } from '../domain/party/timed.js';
-import { currentStop, nextStop, routeFinished, turnAhead } from '../domain/party/train.js';
+import {
+  currentStop,
+  routeAhead,
+  routeFinished,
+  WHOLE_ROUTE_STOPS,
+} from '../domain/party/train.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
-import { bottomControls, moveTrainButton } from './party-controls.js';
+import { bottomControls, moveTrainButton, wholeRouteButton } from './party-controls.js';
 import {
   cutText,
   ENDED_COLOUR,
@@ -29,7 +34,7 @@ import {
   type PostGym,
   type ShownBoss,
 } from './raid-post.js';
-import { count, fitItems, LIMITS, memberByName, memberName, plain, truncate } from './text.js';
+import { LIMITS, memberByName, memberName, plain, truncate } from './text.js';
 import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';
 
 /** A train and the gyms of its route, for everything that shows where it is. */
@@ -98,68 +103,125 @@ function placeLine(view: TrainPostView): string {
   return at === undefined ? 'No route yet' : `At ${stopLink(view.gym(at), true)}`;
 }
 
-/** What "Next gym" adds at the last stop of a train that goes round or turns back. */
+/** What a stop past the end of the route says: round to the first stop, or back along it. */
 const TURN_WORDS = { round: ' (round again)', back: ' (turning back)' } as const;
 
+/** The room what lies ahead of a train may take, in small print under where it is. */
+const AHEAD_ROOM = 600;
+
 /**
- * Where the train is and where it goes next, as the post says it beside "Move train…". At the
- * last stop of a train that loops "Next gym" is the first stop, round again, and of one that
- * turns back the stop before, turning back; of one that finishes there is none.
+ * What the line of a whole route says of a train that does not finish at its last stop, while it
+ * has not finished: a finished route goes nowhere any more.
  */
-function whereText(view: TrainPostView, room: number): string {
-  const { party } = view;
-  if (party.train.route.length === 0) return 'No route yet: `/route add` adds a stop.';
-  if (routeFinished(party)) return '**Route complete**';
-  const [at, next] = [currentStop(party), nextStop(party)];
-  const turn = turnAhead(party);
-  const how = turn === undefined ? '' : TURN_WORDS[turn];
-  const lines = (name: (gym: PostGym | undefined) => string): string =>
-    [
-      ...(at === undefined ? [] : [`**Current gym** · ${name(view.gym(at))}`]),
-      ...(next === undefined ? [] : [`**Next gym** · ${name(view.gym(next))}${how}`]),
-    ].join('\n');
-  const linked = lines((gym) => stopLink(gym, true));
-  if (linked.length <= room) return linked;
-  // Too long for the post: the names alone, cut to share what is left.
-  const share = Math.max(1, Math.floor((room - 40) / 2));
-  return lines((gym) => cutText(plain(gymName(gym)), share));
-}
+const MODE_WORDS = { finish: '', loop: ', loops', 'turn-back': ', turns back at the end' } as const;
 
-/** The room the route of a post may take, in small print under where the train is. */
-const ROUTE_ROOM = 600;
+/** What follows the next stops (`RouteAhead.then`). */
+const THEN_WORDS = {
+  'back-here': ', then back here',
+  'last-stop': ', the last stop',
+  'turns-back': ', where it turns back',
+} as const;
 
-/** What the heading of the route says of a train that does not finish at its last stop. */
-const MODE_WORDS = { finish: '', loop: ', loops', 'turn-back': ', turns back at the end' } as const;
+/** Where the stops left after the next ones lead (`RouteAhead.rest`). */
+const TOWARD_WORDS = {
+  end: 'to the end',
+  loop: 'round the loop',
+  start: 'back to the start',
+  turn: 'to the end, where it turns back',
+} as const;
 
 /**
- * The route in one line of small print, every stop a link, the current one in bold:
- * `-# Route, stop 2 of 4: 1. [A](…) · **2. [B](…)** · 3. [C](…)`, with
- * what the train does at the end when it does not finish there (`Route, stop 4 of 4, loops: …`),
- * on a route of two stops or more (one of a single stop finishes there in every mode). The route
- * is shown as it is stored: after a turn or a Reverse, in its new order. A route that does not
- * fit keeps the stops around the current one and says how many of the earlier ones it left out.
+ * What lies ahead of the train in one line of small print (Matt, 2026-10-17; `routeAhead`): a
+ * route of three stops or fewer whole, the current stop in bold, with what the train does at the
+ * end (`Route: 1. A · **2. B** · 3. C, loops`); on a longer one the next two stops and how many
+ * more (`Next: 3. C · 4. D, and 3 more to the end`), looking past the end of a loop or a train
+ * that turns back; `This is the last stop.` at the last stop of one that finishes. Nothing for a
+ * train without a route or a long route that is finished. The names are plain, without links
+ * (Where has the Map of the current stop, Whole route the rest), each cut alike when the line is
+ * too long (`fit.part`).
  */
-function routeLine(view: TrainPostView, fit: Fit): PostBlock[] {
-  const { route, stop } = view.party.train;
-  if (route.length === 0) return [];
-  const stops = route.map((gymId, index) => {
-    const gym = view.gym(gymId);
-    const text = `${index + 1}. ${stopLink(gym, true)}`;
-    return index === stop ? `**${text}**` : text;
-  });
-  const mode = route.length < 2 ? '' : MODE_WORDS[view.party.train.atEnd];
-  const heading = routeFinished(view.party)
-    ? `Route, ${count(route.length, 'stop')}, finished`
-    : `Route, stop ${stop + 1} of ${route.length}${mode}`;
+function aheadLine(view: TrainPostView, fit: Fit): PostBlock[] {
+  const ahead = routeAhead(view.party);
+  const name = (gymId: number) => plain(gymName(view.gym(gymId)));
+  let names: string[];
+  let line: (shown: readonly string[]) => string;
+  switch (ahead.kind) {
+    case 'no-route':
+    case 'finished':
+      return [];
+    case 'last-stop':
+      return [{ type: 'text', content: '-# This is the last stop.' }];
+    case 'whole': {
+      names = ahead.route.map(name);
+      const { current } = ahead;
+      line = (shown) =>
+        `Route: ${shown
+          .map((text, index) =>
+            index === current ? `**${index + 1}. ${text}**` : `${index + 1}. ${text}`,
+          )
+          .join(' · ')}${current === undefined ? '' : MODE_WORDS[ahead.atEnd]}`;
+      break;
+    }
+    case 'next': {
+      names = ahead.stops.map((stop) => name(stop.gymId));
+      const then = ahead.then === undefined ? '' : THEN_WORDS[ahead.then];
+      const { rest } = ahead;
+      const more =
+        rest === undefined ? '' : `, and ${rest.count} more ${TOWARD_WORDS[rest.toward]}`;
+      line = (shown) =>
+        `Next: ${ahead.stops
+          .map((stop, index) => {
+            const turn = stop.turn === undefined ? '' : TURN_WORDS[stop.turn];
+            return `${stop.number}. ${shown[index] ?? ''}${turn}`;
+          })
+          .join(' · ')}${then}${more}`;
+      break;
+    }
+  }
+  const longest = Math.max(...names.map((text) => text.length));
   const shown = fit.part((room) => {
-    const limit = Math.min(room, ROUTE_ROOM);
-    const whole = stops.join(' · ');
-    if (whole.length <= limit) return whole;
-    const start = Math.max(0, Math.min(stop, stops.length - 1) - 1);
-    const earlier = start > 0 ? `…${count(start, 'earlier stop')} · ` : '';
-    return `${earlier}${fitItems(stops.slice(start), limit - earlier.length, ' · ')}`;
+    const limit = Math.min(room, AHEAD_ROOM);
+    // Every name cut to the same room, as long as they can be.
+    for (let each = longest; each > 1; each--) {
+      const text = line(names.map((text) => cutText(text, each)));
+      if (text.length <= limit) return text;
+    }
+    return line(names.map((text) => cutText(text, 1)));
   });
-  return [{ type: 'text', content: `-# ${heading}: ${shown}` }];
+  return [{ type: 'text', content: `-# ${shown}` }];
+}
+
+/**
+ * Where the train is (Matt, 2026-10-17): `**Where · stop 2 of 7**` and its current stop as a
+ * raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them);
+ * `Route complete` once the route is finished, how to add a stop while it has none; then what
+ * lies ahead (`aheadLine`), and a row of "Move train…" (which a copy in another region leaves
+ * out) and, on a route longer than `WHOLE_ROUTE_STOPS`, "Whole route" (the route privately, as
+ * `/route show`). A row and not an accessory: the section's one accessory is the picture.
+ */
+function trainWhere(view: TrainPostView, fit: Fit): PostBlock[] {
+  const { party } = view;
+  const { route, stop } = party.train;
+  const at = currentStop(party);
+  const where: PostBlock =
+    route.length === 0
+      ? { type: 'text', content: `${WHERE_HEADING}\nNo route yet: \`/route add\` adds a stop.` }
+      : at === undefined
+        ? { type: 'text', content: `${WHERE_HEADING}\nRoute complete` }
+        : gymWhere(`**Where · stop ${stop + 1} of ${route.length}**`, view.gym(at), fit);
+  return [
+    where,
+    ...aheadLine(view, fit),
+    {
+      type: 'controls',
+      rows: [
+        [
+          moveTrainButton(party),
+          ...(route.length > WHOLE_ROUTE_STOPS ? [wholeRouteButton(party)] : []),
+        ],
+      ],
+    },
+  ];
 }
 
 function colour(view: TrainPostView): number {
@@ -175,15 +237,14 @@ function afterLine(view: TrainPostView): string[] {
 }
 
 /**
- * The post of a train laid out: its name, what it is after, its times and its conductor, with
- * the boss's picture beside them; where it is and goes next, with "Move train…" beside it, and
- * the route; what there is to say about the gym it is at; the boss; who comes, with the buttons;
- * the rows of the rest of the controls; who made it, unless they asked not to be named.
+ * The post of a train laid out: its name, what it is after, its times, its conductor and what
+ * the game says of its boss, with the boss's picture beside them; where it is, what lies ahead
+ * and its two buttons (`trainWhere`); who comes, with the buttons; the rows of the rest of the
+ * controls; who made it, unless they asked not to be named.
  */
 function trainLayout(view: TrainPostView): PostLayout {
   const { party, boss } = view;
   const { conductorId } = party.train;
-  const at = currentStop(party);
   const header = [
     `### Raid Train: ${plain(nameOf(party))}`,
     ...afterLine(view),
@@ -191,6 +252,8 @@ function trainLayout(view: TrainPostView): PostLayout {
     ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}`]),
     // Not in the last showing of a train that was closed: that post is archived.
     ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
+    // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
+    ...(boss?.entry ? bossFacts(view.catalogue, boss.entry, false, view.emoji) : []),
   ].join('\n');
   return fittedLayout((fit) => ({
     accent: colour(view),
@@ -198,23 +261,7 @@ function trainLayout(view: TrainPostView): PostLayout {
     blocks: [
       { type: 'section', content: header, accessory: 'picture' },
       { type: 'separator' },
-      {
-        type: 'section',
-        content: fit.part((room) => whereText(view, room)),
-        accessory: moveTrainButton(party),
-      },
-      ...routeLine(view, fit),
-      ...(at === undefined ? [] : [gymWhere(WHERE_HEADING, view.gym(at), fit)]),
-      { type: 'separator' },
-      // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
-      ...(boss?.entry
-        ? [
-            {
-              type: 'text' as const,
-              content: bossFacts(view.catalogue, boss.entry, false, view.emoji).join('\n'),
-            },
-          ]
-        : []),
+      ...trainWhere(view, fit),
       { type: 'separator' },
       ...trainerBlocks(view, { complete: false, lobby: true }, fit),
       { type: 'separator' },
@@ -255,9 +302,8 @@ function trainBrief(view: TrainPostView): PartyBrief {
 /**
  * The forum post of a raid train: title, tags, the components-v2 message (`trainLayout`) and the
  * brief of a direct message. Pure: the same view gives the same post. It has what the post of a
- * meetup has and what a train has: its conductor, where it is and where it goes next, its route,
- * the Pokémon it is after, what there is to say about the gym it is at, and its groups, as in a
- * raid. There is no map: `/where` gives it.
+ * meetup has and what a train has: its conductor, the Pokémon it is after, where it is (its
+ * current stop as a raid's gym, with its Map) and what lies ahead, and its groups, as in a raid.
  */
 export function renderTrainPost(view: TrainPostView): RenderedPost {
   const { party, now } = view;
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index a942d68a1d5696ddb736f09746d6a12c7d252513..6d4e88f45cd8c46456052edcfbff4c6bd0229dcf 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -147,7 +147,7 @@ describe('PartyService: the post of a train', () => {
     expect(made.current()).toMatchObject({ regionId: 1, forumChannelId: WEST_FORUM, gymId: null });
     expect(made.gateway.posts.get(made.postId)?.forumId).toBe(WEST_FORUM);
     expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
-    expect(textOf(shownPost(made))).toContain('**Current gym** · [Café Élan Fresco](');
+    expect(textOf(shownPost(made))).toContain('**Where · stop 2 of 2**\n**Café Élan Fresco** · ');
     // East gets no line that links to a new train: only the copy for the stop there.
     expect(made.gateway.messagesIn(EAST_CHANNEL).map((sent) => leadOf(sent.message))).toEqual([
       'A raid train that stops in this region. ' +
@@ -160,7 +160,9 @@ describe('PartyService: the post of a train', () => {
     await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
     await made.service.flush();
     const texts = textDisplays(shownPost(made));
-    expect(texts.find((text) => text.startsWith('-# Route'))).toMatch(/^-# Route, stop 1 of 2: /);
+    expect(texts.find((text) => text.startsWith('-# Route'))).toBe(
+      '-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks',
+    );
     expect(texts.filter((text) => /^\*\*(Interested|Coming|Present)/.test(text))).toEqual([
       `**Interested (1)**\n<@${REPORTER}>`,
       '**Coming (0)**',
diff --git a/src/services/train-service.test.ts b/src/services/train-service.test.ts
index cdbd8ed9ce5ce0c0809ff539cd215150d468d1e5..3e2633aa5f157353d712171d28f13a7861fa22b6 100644
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -68,7 +68,7 @@ describe('TrainService: the route', () => {
       { content: `**Alice** (<@${ALICE}>) added stop 2 to the route: **The Stacks**.` },
     ]);
     const message = made.gateway.posts.get(made.postId)?.message;
-    expect(textOf(message)).toContain(`**Next gym** · [The Stacks](${maps(1)})`);
+    expect(textOf(message)).toContain('-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks');
   });
 
   it('refuses a gym that is on the route, and a member who is not signed up, and says nothing', async () => {
````

### Task 4: Plan 8D T4: Whole route: the route privately from a train's post

Prototype commit: `567f22c7eac7ddc43e1c470943af34fa0c0b7b66`

The button "Whole route" (party:<id>:route, an action of the party
controls, so their guards and ACTION_THROTTLE cover it) answers privately
with exactly what /route show answers: both go through routeTexts and
showRoute, every stop a link, in as many messages as it takes. It answers
anybody, also on a copy in another region; a train that ended answers
"This train is over.", a route emptied since what /route show says then,
and a party that is no train the stale-control sentence.

**Files:**

```
 src/commands/trains/route.test.ts | 90 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/commands/trains/route.ts      | 80 +++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 src/components/party.ts           | 10 +++++----
 3 files changed, 153 insertions(+), 27 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/trains/route.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 567f22c7eac7ddc43e1c470943af34fa0c0b7b66 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T4: Whole route: the route privately from a train's post`, the body above and the trailer, staging exactly
  `src/commands/trains/route.test.ts src/commands/trains/route.ts src/components/party.ts`.

````diff
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index da6b3773dae7baf090daeaf87c3156364a765985..c5e6cdbb8210f723d10f224a2e030767742684d8 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -1,7 +1,8 @@
-import { MessageFlags } from 'discord.js';
+import { ComponentType, MessageFlags } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
   fakeAutocomplete,
+  fakeButton,
   fakeChatInput,
   sent,
   type FakeInteraction,
@@ -11,7 +12,8 @@ import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/pa
 import { createdMeetup, createdTrain } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MAX_SAVED_ROUTES } from '../../db/repositories/saved-route-repository.js';
-import { InteractionRouter } from '../../discord/router.js';
+import { partyButtons } from '../../components/party.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { MAX_ROUTE_STOPS } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import { currentStop } from '../../domain/party/train.js';
@@ -52,7 +54,7 @@ async function setup(stops: readonly number[] = [4, 1, 7]) {
     parties: made.store,
     regions: made.regions,
   });
-  const router = new InteractionRouter(ctx, [route], []);
+  const router = new InteractionRouter(ctx, [route], [partyButtons]);
   const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
   /** `/route <subcommand>` in the post of the train, by Alice unless `extra` says otherwise. */
   const run = async (subcommand: string, options: Options = {}, extra: object = {}) => {
@@ -107,7 +109,31 @@ async function setup(stops: readonly number[] = [4, 1, 7]) {
     return made.said().join('\n').split('\n').filter(Boolean);
   };
   const routeNow = () => made.current().train.route;
-  return { ...made, partyLines: made.lines, ctx, run, answer, choices, lines, routeNow, inPost };
+  /** A press on "Whole route" of the train's post, by Alice unless `extra` says otherwise. */
+  const wholeRoute = async (extra: object = {}) => {
+    const pressed = fakeButton({
+      customId: `party:${made.party.id}:route`,
+      ...inPost,
+      userId: ALICE,
+      displayName: 'Alice',
+      messageRows: [{ type: ComponentType.Container, components: [] }],
+      ...extra,
+    });
+    await router.handle(pressed as never);
+    return pressed;
+  };
+  return {
+    ...made,
+    partyLines: made.lines,
+    ctx,
+    run,
+    answer,
+    choices,
+    lines,
+    routeNow,
+    inPost,
+    wholeRoute,
+  };
 }
 
 describe('/route show', () => {
@@ -196,6 +222,62 @@ describe('/route show', () => {
   });
 });
 
+describe('the button "Whole route" of a train post', () => {
+  it('answers privately with what /route show answers, and changes nothing', async () => {
+    const made = await setup([4, 1, 7, 2]);
+    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
+    const shown = sent((await made.run('show')).reply);
+    const pressed = await made.wholeRoute();
+    expect(pressed.reply).toHaveBeenCalledWith(shown);
+    expect(shown).toEqual({
+      content: [
+        '**The route of Saturday legendaries**',
+        `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
+        `**2\\. [The Stacks](<${maps(1)}>)** (the train is here)`,
+        `3\\. [Harbor Lighthouse Mural](<${maps(7)}>)`,
+        `4\\. [Old Stone Fountain](<${maps(2)}>)`,
+        'At the end it finishes the route.',
+      ].join('\n'),
+      flags: MessageFlags.Ephemeral,
+    });
+    await made.trains.flush();
+    expect((await made.lines()).filter((line) => /route/i.test(line))).toEqual([]);
+    expect(made.current().train).toMatchObject({ route: [4, 1, 7, 2], stop: 1 });
+  });
+
+  it('answers anybody, signed up or not, also on a copy in another channel', async () => {
+    const made = await setup([4, 1, 7, 2]);
+    const stranger = await made.wholeRoute({ userId: CAROL, channelId: '600000000000000099' });
+    expect(sent(stranger.reply).content).toMatch(/^\*\*The route of Saturday legendaries\*\*\n/);
+    expect(sent(stranger.reply).flags).toBe(MessageFlags.Ephemeral);
+  });
+
+  it('says when the route was emptied since, when the train is over, and refuses another party', async () => {
+    const made = await setup([4, 1, 7, 2]);
+    await made.trains.clearRoute(made.party.id, { id: ALICE }, true);
+    expect(sent((await made.wholeRoute()).reply).content).toBe(
+      'This train has no route yet. Add its stops with `/route add`.',
+    );
+    await made.service.end(made.party.id);
+    expect(sent((await made.wholeRoute()).reply).content).toBe('This train is over.');
+    const meetup = await createdMeetup();
+    const { ctx } = createTestContext({
+      partyService: meetup.service,
+      attendance: meetup.attendance,
+      parties: meetup.store,
+      regions: meetup.regions,
+    });
+    const pressed = fakeButton({
+      customId: `party:${meetup.party.id}:route`,
+      channelId: meetup.postId,
+      userId: REPORTER,
+      messageRows: [{ type: ComponentType.Container, components: [] }],
+    });
+    await new InteractionRouter(ctx, [route], [partyButtons]).handle(pressed as never);
+    expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
+  });
+});
+
 describe('/route add', () => {
   it('adds a gym the member picked or named, and says which stop it is', async () => {
     const made = await setup();
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index caa8c8df98d3e4f6eaf0b8da5768ce09d038b878..a0c7efc7eb1f0ee846b137c6795e21e78323623a 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -3,6 +3,7 @@ import {
   SlashCommandBuilder,
   SlashCommandSubcommandBuilder,
   type AutocompleteInteraction,
+  type ButtonInteraction,
   type ChatInputCommandInteraction,
   type SlashCommandStringOption,
 } from 'discord.js';
@@ -18,7 +19,13 @@ import {
   requireTrain,
   trainOf,
 } from '../../discord/guards.js';
-import { MAX_PARTY_NAME, MAX_ROUTE_STOPS, type TrainParty } from '../../domain/party/party.js';
+import {
+  isTrain,
+  MAX_PARTY_NAME,
+  MAX_ROUTE_STOPS,
+  type TrainParty,
+} from '../../domain/party/party.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
 import { nameOf } from '../../domain/party/timed.js';
 import { currentStop } from '../../domain/party/train.js';
 import { problemText } from '../../render/activity.js';
@@ -94,31 +101,66 @@ const show: SubcommandPart = {
     details:
       'Shows you every stop in order: those the train has left struck through, the one it is ' +
       'at marked, each a link to Google Maps, and what the train does ' +
-      'at the end of a route of two stops or more. The post itself shows the route too, ' +
-      'without the links.',
+      'at the end of a route of two stops or more. The post shows where the train is and the ' +
+      'next stops (a route of three stops or fewer whole); its button "Whole route" shows ' +
+      'you this list too.',
     examples: ['/route show'],
   },
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandTrain(interaction, ctx);
-    if (party.train.route.length === 0) {
-      await privately(interaction, problemText('no-route', ctx.attendance.limits(), 'train'));
-      return;
-    }
-    const heading = `**The route of ${plain(nameOf(party))}**`;
-    const lines = [
-      ...routeLines(trainPlaces(ctx, party), { links: true }),
-      // A route of one stop finishes there in every mode: nothing to say of it.
-      ...(party.train.route.length < 2 ? [] : [atEndSentence(party.train.atEnd)]),
-    ];
-    const [first = heading, ...more] = routeMessages(heading, lines);
-    await privately(interaction, first);
-    for (const content of more) {
-      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
-    }
+    await showRoute(interaction, ctx, commandTrain(interaction, ctx));
   },
 };
 
+/**
+ * The route of a train as `/route show` and the button "Whole route" of its post answer it, the
+ * texts of one or more private messages: every stop a link to its place (the answer has no Map of
+ * its own), what the train does at the end of a route of two stops or more; a sentence for a
+ * train without a route.
+ */
+function routeTexts(ctx: AppContext, party: TrainParty): string[] {
+  if (party.train.route.length === 0) {
+    return [problemText('no-route', ctx.attendance.limits(), 'train')];
+  }
+  const heading = `**The route of ${plain(nameOf(party))}**`;
+  const lines = [
+    ...routeLines(trainPlaces(ctx, party), { links: true }),
+    // A route of one stop finishes there in every mode: nothing to say of it.
+    ...(party.train.route.length < 2 ? [] : [atEndSentence(party.train.atEnd)]),
+  ];
+  return routeMessages(heading, lines);
+}
+
+/** The route of a train, privately, in as many messages as it takes (`routeTexts`). */
+async function showRoute(
+  interaction: ChatInputCommandInteraction | ButtonInteraction,
+  ctx: AppContext,
+  party: TrainParty,
+): Promise<void> {
+  const [first, ...more] = routeTexts(ctx, party);
+  await interaction.reply({ content: first ?? '', flags: MessageFlags.Ephemeral });
+  for (const content of more) {
+    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
+  }
+}
+
+/**
+ * The button "Whole route" of a train's post (Matt, 2026-10-17): the route privately, exactly as
+ * `/route show` answers it, to anybody, also on a copy of the post in another channel (the train
+ * is the one the button names). A train that ended answers as the other controls of a post do;
+ * a party that is no train never had the button.
+ */
+export async function showWholeRoute(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const party = ctx.parties.get(partyId);
+  if (!party) throw new UserError(partyOver({ type: 'train' }));
+  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
+  await showRoute(interaction, ctx, party);
+}
+
 const add: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('add')
diff --git a/src/components/party.ts b/src/components/party.ts
index ed63db975bdc0cd5784dd1c5d20321c1e59c4d5f..c18e483ea8349354b47db744aee2280c5de5ec05 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -19,6 +19,7 @@ import {
   pressTrainPanel,
 } from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
+import { showWholeRoute } from '../commands/trains/route.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
 import { managementRoleIds, notARaid, partyOf, requireGuild } from '../discord/guards.js';
@@ -37,8 +38,9 @@ import {
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
  * question, the "Set time" button of a raid without times with the form it opens, and the
  * button "Move train…" of a train with the panel it opens and its controls, the menu of what the
- * train does at the end of its route among them (`commands/trains/move.ts`). The party
- * is named by the custom id, not by the channel, so the same controls work on a copy of the
+ * train does at the end of its route among them (`commands/trains/move.ts`), and "Whole route"
+ * of a train, which shows the route privately as `/route show` does (`commands/trains/route.ts`).
+ * The party is named by the custom id, not by the channel, so the same controls work on a copy of the
  * message in another channel. Every click is answered privately, a burst of clicks by one
  * member with one answer (`answerClick`); what it changed is said in the post by the attendance
  * service.
@@ -135,8 +137,8 @@ export const partyButtons: ComponentHandler = {
         // The menu of that panel: never a button.
         throw new UserError(STALE_COMPONENT);
       case 'route':
-        // "Whole route" of a train's post: answered from the next commit on.
-        throw new UserError(STALE_COMPONENT);
+        // "Whole route" of a train's post: the route privately, as `/route show` answers it.
+        return showWholeRoute(interaction, ctx, partyId);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
````

### Task 5: Plan 8D T5: Pins: a maps link or coordinates names a place, /wild near: takes one

Prototype commit: `9863e6c433676ca2efa23dbba4c44f2ff694b973`

readPin (src/domain/geo/pin-input.ts, pure, over readLocation) reads a
pin from typed coordinates, geo: addresses (with a phone's label), Google
Maps (the place's pin before the map's centre, /place/<name>/ as the
link's name), Apple Maps (ll, coordinate, q, sll) and OpenStreetMap
(mlat/mlon, #map=). A short link is named as one and never followed.

PlaceFinder.pin makes a pin in the server's regions, named by the nearest
gym, PokeStop or power spot within 50 m. The near option's helpers move to
src/commands/place-option.ts (namedPlace, nearChoices, placeLabel), which
/meetup will share: namedPlace takes a pin and refuses one
outside the regions, numbers that are no place and a short link, each with
a sentence before the throttle counts. A place named is a snapshot
(KnownPlace | DroppedPin, src/domain/geo/place.ts); a spawn report shows a
pin as "📍 Near **X** (PokéStop)", "📍 **<link's name>**" or
"📍 Dropped pin" with its Map, without a picture, in the report, the
sighting and the DM alike. The option takes 1,500 characters for long
links, and the help says it takes a link or coordinates.

**Files:**

```
 src/commands/notifications/wild.test.ts |  76 ++++++++++++++++++++++++++++
 src/commands/notifications/wild.ts      | 149 +++++-------------------------------------------------
 src/commands/place-option.ts            | 197 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/location-input.ts        |   6 +--
 src/domain/geo/pin-input.test.ts        | 135 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/pin-input.ts             | 161 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/geo/place.ts                 |  37 ++++++++++++++
 src/render/place.ts                     |  35 +++++++++++++
 src/render/spawn.ts                     |  43 ++++++----------
 src/services/place-finder.test.ts       |  55 ++++++++++++++++++++
 src/services/place-finder.ts            |  58 ++++++++++++++++++++-
 src/services/spawn-service.test.ts      |   2 +
 src/services/spawn-service.ts           |   6 ++-
 13 files changed, 789 insertions(+), 171 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/notifications/wild.test.ts src/domain/geo/pin-input.test.ts src/services/place-finder.test.ts src/services/spawn-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9863e6c433676ca2efa23dbba4c44f2ff694b973 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T5: Pins: a maps link or coordinates names a place, /wild near: takes one`, the body above and the trailer, staging exactly
  `src/commands/notifications/wild.test.ts src/commands/notifications/wild.ts src/commands/place-option.ts src/domain/geo/location-input.ts src/domain/geo/pin-input.test.ts src/domain/geo/pin-input.ts src/domain/geo/place.ts src/render/place.ts src/render/spawn.ts src/services/place-finder.test.ts src/services/place-finder.ts src/services/spawn-service.test.ts src/services/spawn-service.ts`.

````diff
diff --git a/src/commands/notifications/wild.test.ts b/src/commands/notifications/wild.test.ts
index abc839efda4d87e4ff87eff8fbcf95e0a40c54ef..79adc33d472f5c0097b23f8e9dbcc33d85319781 100644
--- a/src/commands/notifications/wild.test.ts
+++ b/src/commands/notifications/wild.test.ts
@@ -876,6 +876,82 @@ describe('/wild near:', () => {
     ]);
   });
 
+  it('takes a maps link or typed coordinates as a pin, named by the nearest place within 50 m', async () => {
+    const made = await withWayspots();
+    const map = (lat: number, lon: number) =>
+      `[Map](<https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}>)`;
+    // A few metres from the stop Fountain Square, from a Google Maps place page.
+    const link =
+      'https://www.google.com/maps/place/Blue+Tent/@40.0602,-80.0603,17z/data=!3m1!4b1!4m6' +
+      '!3m5!1s0x0:0x0!8m2!3d40.06012!4d-80.06012!16s%2Fg%2F11c1';
+    const near = await made.run({ pokemon: 'dratini', near: link });
+    expect(sent(near.reply).content).toMatch(/^Reported: a wild Dratini near Fountain Square\./);
+    // Far from every place: the name the link gave, else a dropped pin.
+    await made.run({
+      pokemon: 'dratini',
+      near: 'https://www.google.com/maps/place/Blue+Tent/@40.02,-80.02,17z',
+    });
+    const dropped = await made.run({ pokemon: 'dratini', near: '40.02,-80.02' });
+    expect(sent(dropped.reply).content).toMatch(/^Reported: a wild Dratini at your pin\./);
+    const wheres = made.reports().map((report) => textDisplays(report.message)[1]);
+    expect(wheres).toEqual([
+      `**Where**\nby the fountain\n📍 Near **Fountain Square** (PokéStop) · ${map(40.06012, -80.06012)}`,
+      `**Where**\nby the fountain\n📍 **Blue Tent** · ${map(40.02, -80.02)}`,
+      `**Where**\nby the fountain\n📍 Dropped pin · ${map(40.02, -80.02)}`,
+    ]);
+    // A pin has no picture of its own: the Pokémon's alone.
+    for (const report of made.reports()) {
+      expect(thumbnailBeside(report.message, '**Where**')).toBeUndefined();
+    }
+  });
+
+  it('refuses a pin outside the regions, numbers that are no place and a short link', async () => {
+    const made = await withWayspots();
+    const refusal = async (near: string) =>
+      sent((await made.run({ pokemon: 'dratini', near })).reply).content;
+    expect(await refusal('41.5, -81.5')).toBe(
+      'That pin is not in a region of this server. Give a place in the regions here.',
+    );
+    expect(await refusal('95.5, 10.5')).toBe(
+      'Those are no coordinates on earth: give the latitude first, then the longitude ' +
+        '(`40.4406, -79.9959`).',
+    );
+    expect(await refusal('https://maps.app.goo.gl/AbC123xyz')).toBe(
+      'I do not follow short links. Open that one, and paste the address your browser shows ' +
+        'then, or drop a pin in Google Maps and paste the coordinates it shows.',
+    );
+    expect(await refusal('https://www.google.com/maps/search/coffee')).toBe(
+      'That link shows no one place: open the place itself and copy its address, or give its ' +
+        'coordinates.',
+    );
+    expect(made.reports()).toEqual([]);
+  });
+
+  it('names a gym as its post does, by its nickname', async () => {
+    const made = await withWayspots();
+    await made.run({ pokemon: 'dratini', near: 'gym:1' });
+    expect(textDisplays(made.reports()[0]?.message)[1]).toContain('Near **The Stacks** (gym) · ');
+  });
+
+  it('takes a maps link of any usual length, and says so in its help', () => {
+    const near = wildCommand.data.toJSON().options?.find((option) => option.name === 'near') as
+      { max_length?: number } | undefined;
+    expect(near?.max_length).toBeGreaterThanOrEqual(1000);
+    const settings = loadSettings(TEST_SETTINGS_PATH);
+    const help = textDisplays(renderCommandHelp(wildCommand, settings)).join('\n');
+    expect(help).toContain('or paste a link to the place from a maps app, or its coordinates');
+  });
+
+  it('names a pin in the direct messages, without a link but its map', async () => {
+    const made = await withWayspots();
+    await made.want(pokemonTarget(147), BOB);
+    await made.run({ pokemon: 'dratini', near: '40.02, -80.02' });
+    await made.notify.flush();
+    expect(dmBrief(made.dms.to(BOB)[0])?.[1]).toBe(
+      '📍 Dropped pin · [Map](<https://www.google.com/maps/search/?api=1&query=40.02%2C-80.02>)',
+    );
+  });
+
   it('asks to pick again a place gone from the list, or no longer of its kind', async () => {
     const made = await withWayspots();
     for (const near of [`stop:${wayspotId(9)}`, `powerspot:${wayspotId(1)}`, 'gym:999']) {
diff --git a/src/commands/notifications/wild.ts b/src/commands/notifications/wild.ts
index 30bc8224f90f8b3b775698cfed2eb91ee912a143..cf248305c617104ea6e3cca2966493588037f289 100644
--- a/src/commands/notifications/wild.ts
+++ b/src/commands/notifications/wild.ts
@@ -1,14 +1,7 @@
 import { SlashCommandBuilder } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
-import type { Guard, LocatedInteraction, SimpleCommand } from '../../discord/command.js';
-import type { PlaceKind } from '../../domain/search/place-merge.js';
-import {
-  clearOf,
-  placeValue,
-  readPlaceValue,
-  type PlaceChoice,
-} from '../../services/place-finder.js';
-import type { SpawnPlace } from '../../render/spawn.js';
+import type { Guard, SimpleCommand } from '../../discord/command.js';
+import { MAX_PLACE_TEXT, namedPlace, nearChoices, orList, placeWords } from '../place-option.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
@@ -62,13 +55,6 @@ const IV_CHOICES = [
 /** As many Pokémon as a refusal suggests. */
 const SUGGESTIONS = 5;
 
-/** "A, B or C". */
-function orList(names: readonly string[]): string {
-  const rest = [...names];
-  const last = rest.pop() ?? '';
-  return rest.length === 0 ? last : `${rest.join(', ')} or ${last}`;
-}
-
 /** The settings' list read against a catalogue, kept while both are in use. */
 const readExceptions = new WeakMap<PokemonCatalogue, WeakMap<readonly string[], WildExceptions>>();
 /** What was said to be unknown already: each text is logged once in a run. */
@@ -192,120 +178,6 @@ export function wildChoices(ctx: AppContext, typed: string): Choice[] {
     .map((entry) => ({ name: truncate(entry.name, CHOICE_NAME), value: entry.key }));
 }
 
-/** How each kind of place is named in a choice and a sentence. */
-const PLACE_WORDS: Readonly<Record<PlaceKind, string>> = {
-  gym: 'gym',
-  stop: 'PokéStop',
-  powerspot: 'power spot',
-};
-
-/** Said of a choice's value that names a place outside the server's regions. */
-export const NOT_HERE =
-  'That place is not in a region of this server. Pick one from the list that appears while you ' +
-  'type.';
-
-/**
- * Said of a choice's value whose place is gone since it was offered (an import deleted the
- * Wayspot, or it is of another kind now; a gym deleted).
- */
-export const PLACE_GONE = 'That place is gone from the list; pick it again.';
-
-/** Whether the place a choice's value names is still known, as that kind. */
-function stillKnown(ctx: AppContext, kind: PlaceKind, id: string): boolean {
-  if (kind === 'gym') return /^\d+$/u.test(id) && ctx.gyms.get(Number(id)) !== undefined;
-  return ctx.wayspots.byId(id)?.kind === kind;
-}
-
-/**
- * A place as a choice of the `near` option: `Fountain Square (PokéStop) · Market Street`, the
- * title cut (never where it is) so that the whole fits a choice's name.
- */
-export function placeLabel(choice: Pick<PlaceChoice, 'kind' | 'title' | 'where'>): string {
-  const suffix = ` (${PLACE_WORDS[choice.kind]})${choice.where === undefined ? '' : ` · ${choice.where}`}`;
-  const room = CHOICE_NAME - Math.min(suffix.length, CHOICE_NAME - 20);
-  return truncate(`${truncate(choice.title, room)}${suffix}`, CHOICE_NAME);
-}
-
-/** The row of the interaction's server, by which its regions are known. */
-function serverRow(interaction: LocatedInteraction, ctx: AppContext): Promise<number | undefined> {
-  return interaction.inGuild()
-    ? ctx.guilds.idFor(guildIdOf(interaction))
-    : Promise.resolve(undefined);
-}
-
-/**
- * The choices of the `near` option (plan 8W-2): the gyms, PokéStops and power spots of the
- * server's regions that fit what was typed (`PlaceFinder`), the member's region first, each
- * saying where it is; the value is the place's `<kind>:<id>`.
- */
-export async function nearChoices(
-  interaction: LocatedInteraction,
-  ctx: AppContext,
-  typed: string,
-): Promise<Choice[]> {
-  if (typed.trim() === '') return [];
-  const row = await serverRow(interaction, ctx);
-  if (row === undefined) return [];
-  return ctx.placeFinder
-    .find(row, regionChannelOf(interaction, ctx), typed)
-    .slice(0, MAX_CHOICES)
-    .map((choice) => ({ name: placeLabel(choice), value: placeValue(choice) }));
-}
-
-/**
- * The place the `near` option names: a choice (refused when its place is gone or of another kind
- * now, `PLACE_GONE`, or not in a region of the server, `NOT_HERE`), or typed text that means one
- * place beyond doubt (`clearOf` what the one search, `PlaceFinder.find`, gave); otherwise the
- * member is asked to pick, with up to five of what fits. Undefined without the option. The
- * guard resolves it and the command again (a guard hands nothing on), one search each.
- */
-export async function wildPlace(
-  interaction: LocatedInteraction,
-  ctx: AppContext,
-  value: string | null,
-): Promise<PlaceChoice | undefined> {
-  const text = (value ?? '').trim();
-  if (text === '') return undefined;
-  const row = await serverRow(interaction, ctx);
-  const read = readPlaceValue(text);
-  if (read) {
-    if (!stillKnown(ctx, read.kind, read.id)) throw new UserError(PLACE_GONE);
-    const chosen = row === undefined ? undefined : ctx.placeFinder.chosen(row, text);
-    if (!chosen) throw new UserError(NOT_HERE);
-    return chosen;
-  }
-  const regionChannelId = regionChannelOf(interaction, ctx);
-  const found = row === undefined ? [] : ctx.placeFinder.find(row, regionChannelId, text);
-  const clear = clearOf(found);
-  if (clear) return clear;
-  const shown = plain(truncate(text, 80));
-  if (found.length === 0) {
-    throw new UserError(
-      `I know no gym, PokéStop or power spot called "${shown}" here. Pick one from the list ` +
-        'that appears while you type, or say where in `details` alone.',
-    );
-  }
-  const named = found
-    .slice(0, SUGGESTIONS)
-    .map((choice) => `${plain(choice.title)} (${PLACE_WORDS[choice.kind]})`);
-  throw new UserError(
-    `Which place is "${shown}"? Pick one from the list that appears while you type: ` +
-      `${orList(named)}.`,
-  );
-}
-
-/** A place as the report shows it. */
-function spawnPlace(choice: PlaceChoice): SpawnPlace {
-  return {
-    kind: choice.kind,
-    title: choice.title,
-    address: choice.address,
-    lat: choice.point.lat,
-    lon: choice.point.lon,
-    image: choice.image,
-  };
-}
-
 /**
  * What can be known before anything is posted is refused here, so that a use that came to
  * nothing does not count against the limit: the place, the Pokémon, details that say nothing,
@@ -320,7 +192,7 @@ const requireSpawnReport: Guard = async (interaction, ctx) => {
     if ((interaction.options.getString('details') ?? '').trim() === '') {
       throw new UserError(SAY_WHERE);
     }
-    await wildPlace(interaction, ctx, interaction.options.getString('near'));
+    await namedPlace(interaction, ctx, interaction.options.getString('near'));
   }
 };
 
@@ -356,8 +228,10 @@ export const wildCommand: SimpleCommand = {
     .addStringOption((option) =>
       option
         .setName('near')
-        .setDescription('A gym, PokéStop or power spot it is near: pick from the list')
-        .setMaxLength(100)
+        .setDescription(
+          'A gym, PokéStop or power spot it is near (pick from the list), or a maps link',
+        )
+        .setMaxLength(MAX_PLACE_TEXT)
         .setAutocomplete(true),
     )
     .addStringOption((option) =>
@@ -382,7 +256,8 @@ export const wildCommand: SimpleCommand = {
       '. `details` says where it is and is needed: a report is of no use ' +
       'without it. `near` names a gym, PokéStop or power spot it is near: pick one from the ' +
       'list that appears while you type (your region’s first; each says its street or the gym ' +
-      'nearest to it), and the report shows it with a map link. `iv` says that you checked it ' +
+      'nearest to it), or paste a link to the place from a maps app, or its coordinates ' +
+      '(`40.4406, -79.9959`): the report shows it with a map link. `iv` says that you checked it ' +
       'and its IVs are perfect or zero' +
       (settings.features.notifications
         ? ', which also tells the members who asked for those. '
@@ -406,7 +281,7 @@ export const wildCommand: SimpleCommand = {
     if (details === '') throw new UserError(SAY_WHERE);
     const picked = interaction.options.getString('iv');
     const iv = IV_CHOICES.find((choice) => choice.value === picked)?.value;
-    const place = await wildPlace(interaction, ctx, interaction.options.getString('near'));
+    const place = await namedPlace(interaction, ctx, interaction.options.getString('near'));
     const guildId = guildIdOf(interaction);
     const outcome = await ctx.spawns.report({
       guildId,
@@ -415,7 +290,7 @@ export const wildCommand: SimpleCommand = {
       details: truncate(details, MAX_DETAILS),
       iv,
       reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
-      ...(place === undefined ? {} : { near: spawnPlace(place) }),
+      ...(place === undefined ? {} : { near: place }),
     });
     if (outcome.kind === 'no-channel') throw new UserError(CHANNEL_GONE);
     if (outcome.kind === 'refused') {
@@ -428,7 +303,7 @@ export const wildCommand: SimpleCommand = {
     // What was reported, IVs included: the member sees whether the choice was taken. The
     // channel is named by the link alone: Discord shows a message link as its channel.
     const ivs = iv === undefined ? '' : ` with ${IV_WORDS[iv]}`;
-    const near = place === undefined ? '' : ` near ${plain(place.title)}`;
+    const near = place === undefined ? '' : ` ${placeWords(place)}`;
     await answer(interaction, {
       content:
         `Reported: a wild ${plain(entry.name)}${ivs}${near}. ` +
diff --git a/src/commands/place-option.ts b/src/commands/place-option.ts
new file mode 100644
index 0000000000000000000000000000000000000000..182624ebbc0bccc117d8353462a14f43efabd959
--- /dev/null
+++ b/src/commands/place-option.ts
@@ -0,0 +1,197 @@
+import type { AppContext } from '../app-context.js';
+import type { LocatedInteraction } from '../discord/command.js';
+import { UserError } from '../discord/errors.js';
+import { guildIdOf, regionChannelOf } from '../discord/guards.js';
+import { readPin } from '../domain/geo/pin-input.js';
+import type { KnownPlace, Place } from '../domain/geo/place.js';
+import type { PlaceKind } from '../domain/search/place-merge.js';
+import { PLACE_KIND_WORDS } from '../render/place.js';
+import { plain, truncate } from '../render/text.js';
+import { clearOf, placeValue, readPlaceValue, type PlaceChoice } from '../services/place-finder.js';
+import { CHOICE_NAME, MAX_CHOICES, type Choice } from './choices.js';
+
+/**
+ * As much as an option that names a place takes: a maps link with all its data (a Google Maps
+ * place page is a few hundred characters) fits.
+ */
+export const MAX_PLACE_TEXT = 1_500;
+
+/** Said of a choice's value that names a place outside the server's regions. */
+export const NOT_HERE =
+  'That place is not in a region of this server. Pick one from the list that appears while you ' +
+  'type.';
+
+/** Said of a pin (a maps link, coordinates) outside the server's regions. */
+export const PIN_NOT_HERE =
+  'That pin is not in a region of this server. Give a place in the regions here.';
+
+/** Said of coordinates that are no place on earth. */
+export const NO_PLACE_ON_EARTH =
+  'Those are no coordinates on earth: give the latitude first, then the longitude ' +
+  '(`40.4406, -79.9959`).';
+
+/**
+ * Said of a short link (`maps.app.goo.gl`): the bot fetches nothing a member names, and tests use
+ * no network (Matt, 2026-10-17).
+ */
+export const SHORT_LINK =
+  'I do not follow short links. Open that one, and paste the address your browser shows then, ' +
+  'or drop a pin in Google Maps and paste the coordinates it shows.';
+
+/** Said of a link of a maps site that shows no one place (a search, a Street View). */
+export const NO_POINT =
+  'That link shows no one place: open the place itself and copy its address, or give its ' +
+  'coordinates.';
+
+/**
+ * Said of a choice's value whose place is gone since it was offered (an import deleted the
+ * Wayspot, or it is of another kind now; a gym deleted).
+ */
+export const PLACE_GONE = 'That place is gone from the list; pick it again.';
+
+/** As many places as a refusal suggests. */
+const SUGGESTIONS = 5;
+
+/** "A, B or C". */
+export function orList(names: readonly string[]): string {
+  const rest = [...names];
+  const last = rest.pop() ?? '';
+  return rest.length === 0 ? last : `${rest.join(', ')} or ${last}`;
+}
+
+/** Whether the place a choice's value names is still known, as that kind and by a title. */
+function stillKnown(ctx: AppContext, kind: PlaceKind, id: string): boolean {
+  if (kind === 'gym') return /^\d+$/u.test(id) && ctx.gyms.get(Number(id)) !== undefined;
+  const wayspot = ctx.wayspots.byId(id);
+  return wayspot?.kind === kind && wayspot.title.trim() !== '';
+}
+
+/**
+ * A place as a choice of a `near` option: `Fountain Square (PokéStop) · Market Street`, the
+ * title cut (never where it is) so that the whole fits a choice's name.
+ */
+export function placeLabel(choice: Pick<PlaceChoice, 'kind' | 'title' | 'where'>): string {
+  const suffix = ` (${PLACE_KIND_WORDS[choice.kind]})${choice.where === undefined ? '' : ` · ${choice.where}`}`;
+  const room = CHOICE_NAME - Math.min(suffix.length, CHOICE_NAME - 20);
+  return truncate(`${truncate(choice.title, room)}${suffix}`, CHOICE_NAME);
+}
+
+/** The row of the interaction's server, by which its regions are known. */
+function serverRow(interaction: LocatedInteraction, ctx: AppContext): Promise<number | undefined> {
+  return interaction.inGuild()
+    ? ctx.guilds.idFor(guildIdOf(interaction))
+    : Promise.resolve(undefined);
+}
+
+/**
+ * The choices of a `near` option (plan 8W-2): the gyms, PokéStops and power spots of the
+ * server's regions that fit what was typed (`PlaceFinder`), the member's region first, each
+ * saying where it is; the value is the place's `<kind>:<id>`. A maps link or coordinates are
+ * offered nothing: sent as typed, they are a pin.
+ */
+export async function nearChoices(
+  interaction: LocatedInteraction,
+  ctx: AppContext,
+  typed: string,
+): Promise<Choice[]> {
+  if (typed.trim() === '' || readPin(typed).kind !== 'none') return [];
+  const row = await serverRow(interaction, ctx);
+  if (row === undefined) return [];
+  return ctx.placeFinder
+    .find(row, regionChannelOf(interaction, ctx), typed)
+    .slice(0, MAX_CHOICES)
+    .map((choice) => ({ name: placeLabel(choice), value: placeValue(choice) }));
+}
+
+/**
+ * A choice as the place a member named: what it was when they named it (a snapshot), a gym by
+ * the name its post shows (`gymName`: the nickname first).
+ */
+function knownPlace(ctx: AppContext, choice: PlaceChoice): KnownPlace {
+  // A gym is named as its post names it: by its nickname, when it has one.
+  const gym = choice.kind === 'gym' ? ctx.gyms.get(Number(choice.id)) : undefined;
+  return {
+    kind: choice.kind,
+    id: choice.id,
+    title: gym ? gym.nickname || gym.name : choice.title,
+    lat: choice.point.lat,
+    lon: choice.point.lon,
+    // Nothing is none: an empty address or picture is not kept as one.
+    address: choice.address === '' ? null : choice.address,
+    image: choice.image === '' ? null : choice.image,
+  };
+}
+
+/**
+ * The place a `near` option names (`/wild near:`, `/meetup near:`): a choice
+ * (refused when its place is gone or of another kind now, `PLACE_GONE`, or not in a region of the
+ * server, `NOT_HERE`); a maps link or coordinates, which are a pin (`readPin`; refused outside
+ * the server's regions, `PIN_NOT_HERE`, as a short link, `SHORT_LINK`, and as numbers that are no
+ * place, `NO_PLACE_ON_EARTH`), named by the nearest place within 50 metres (`PlaceFinder.pin`);
+ * or typed text that means one place beyond doubt (`clearOf` what the one search,
+ * `PlaceFinder.find`, gave); otherwise the member is asked to pick, with up to five of what fits.
+ * Undefined without the option. A guard resolves it and the command again (a guard hands nothing
+ * on), one search each.
+ */
+export async function namedPlace(
+  interaction: LocatedInteraction,
+  ctx: AppContext,
+  value: string | null,
+  otherwise = 'or say where in `details` alone',
+): Promise<Place | undefined> {
+  const text = (value ?? '').trim();
+  if (text === '') return undefined;
+  const row = await serverRow(interaction, ctx);
+  const read = readPlaceValue(text);
+  if (read) {
+    if (!stillKnown(ctx, read.kind, read.id)) throw new UserError(PLACE_GONE);
+    const chosen = row === undefined ? undefined : ctx.placeFinder.chosen(row, text);
+    if (!chosen) throw new UserError(NOT_HERE);
+    return knownPlace(ctx, chosen);
+  }
+  const pin = readPin(text);
+  switch (pin.kind) {
+    case 'pin': {
+      const made =
+        row === undefined ? undefined : ctx.placeFinder.pin(row, pin.point, pin.linkName);
+      if (!made) throw new UserError(PIN_NOT_HERE);
+      return made;
+    }
+    case 'short-link':
+      throw new UserError(SHORT_LINK);
+    case 'out-of-range':
+      throw new UserError(NO_PLACE_ON_EARTH);
+    case 'no-point':
+      throw new UserError(NO_POINT);
+    case 'none':
+      break;
+  }
+  const regionChannelId = regionChannelOf(interaction, ctx);
+  const found = row === undefined ? [] : ctx.placeFinder.find(row, regionChannelId, text);
+  const clear = clearOf(found);
+  if (clear) return knownPlace(ctx, clear);
+  const shown = plain(truncate(text, 80));
+  if (found.length === 0) {
+    throw new UserError(
+      `I know no gym, PokéStop or power spot called "${shown}" here. Pick one from the list ` +
+        `that appears while you type, ${otherwise}.`,
+    );
+  }
+  const named = found
+    .slice(0, SUGGESTIONS)
+    .map((choice) => `${plain(choice.title)} (${PLACE_KIND_WORDS[choice.kind]})`);
+  throw new UserError(
+    `Which place is "${shown}"? Pick one from the list that appears while you type: ` +
+      `${orList(named)}.`,
+  );
+}
+
+/**
+ * How an answer names a place a member gave: `near Fountain Square`; a pin by the place it is
+ * near, the name its link gave (`at Blue Tent`), or as `at your pin`.
+ */
+export function placeWords(place: Place): string {
+  if (place.kind !== 'pin') return `near ${plain(place.title)}`;
+  if (place.near) return `near ${plain(place.near.title)}`;
+  return place.linkName === null ? 'at your pin' : `at ${plain(place.linkName)}`;
+}
diff --git a/src/domain/geo/location-input.ts b/src/domain/geo/location-input.ts
index 12a193e1412f0a4c3cc1d9816d6f73c006f85e35..7875d65bd7061ef06181ade0f261ca720f82e925 100644
--- a/src/domain/geo/location-input.ts
+++ b/src/domain/geo/location-input.ts
@@ -70,7 +70,7 @@ function fromDms(
  * or after it, with the letters of the compass, or as degrees, minutes and seconds. Undefined
  * for a text that is none of these.
  */
-function readPair(text: string): LocationReading | undefined {
+export function readPair(text: string): LocationReading | undefined {
   const plain = PAIR.exec(text);
   if (plain) return checked({ lat: Number(plain[1]), lon: Number(plain[2]) });
   const compass = COMPASS_PAIR.exec(text);
@@ -105,7 +105,7 @@ function wholeNumbers(text: string): boolean {
 }
 
 /** The address a text is, when it is one: with `https://` put before a bare host and path. */
-function asUrl(text: string): URL | undefined {
+export function asUrl(text: string): URL | undefined {
   const trimmed = text.trim();
   const address = /^https?:\/\//i.test(trimmed);
   // A space inside an address that was pasted (after the comma of its coordinates, in the name
@@ -124,7 +124,7 @@ function asUrl(text: string): URL | undefined {
   }
 }
 
-function isGoogle(host: string): boolean {
+export function isGoogle(host: string): boolean {
   return /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);
 }
 
diff --git a/src/domain/geo/pin-input.test.ts b/src/domain/geo/pin-input.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..01b9c895c098f6262e6b412000f93576e3229db5
--- /dev/null
+++ b/src/domain/geo/pin-input.test.ts
@@ -0,0 +1,135 @@
+import { describe, expect, it } from 'vitest';
+import { readPin } from './pin-input.js';
+
+const pin = (lat: number, lon: number, linkName: string | null = null) => ({
+  kind: 'pin',
+  point: { lat, lon },
+  linkName,
+});
+
+describe('readPin', () => {
+  it.each([
+    ['40.43812, -79.92306'],
+    ['40.43812,-79.92306'],
+    ['  40.43812 -79.92306  '],
+    ['40.43812° N, 79.92306° W'],
+  ])('reads typed coordinates %j', (text) => {
+    expect(readPin(text)).toEqual(pin(40.43812, -79.92306));
+  });
+
+  it('reads geo: addresses, with the label a phone gives the place', () => {
+    expect(readPin('geo:40.43812,-79.92306')).toEqual(pin(40.43812, -79.92306));
+    expect(readPin('geo:40.43812,-79.92306;u=35')).toEqual(pin(40.43812, -79.92306));
+    // Android shares a place as 0,0 with the place in its question.
+    expect(readPin('geo:0,0?q=40.43812,-79.92306(Blue%20Tent)')).toEqual(
+      pin(40.43812, -79.92306, 'Blue Tent'),
+    );
+    expect(readPin('GEO:40.43812,-79.92306?z=17')).toEqual(pin(40.43812, -79.92306));
+    expect(readPin('geo:95,10')).toEqual({ kind: 'out-of-range' });
+  });
+
+  it('reads Google Maps addresses: the pin of a place first, and the name it gives the place', () => {
+    // As the browser shows a place a member opened: the map's centre (`@`) is beside the pin.
+    expect(
+      readPin(
+        'https://www.google.com/maps/place/Blue+Tent/@40.4385,-79.9241,17z/data=!3m1!4b1!4m6' +
+          '!3m5!1s0x8834f2:0x1c5!8m2!3d40.43812!4d-79.92306!16s%2Fg%2F11c1',
+      ),
+    ).toEqual(pin(40.43812, -79.92306, 'Blue Tent'));
+    expect(
+      readPin('https://www.google.com/maps/place/Caf%C3%A9+%C3%89lan/@40.43812,-79.92306,17z/'),
+    ).toEqual(pin(40.43812, -79.92306, 'Café Élan'));
+    // A place given by its coordinates names nothing.
+    expect(
+      readPin(
+        "https://www.google.com/maps/place/40%C2%B026'17.2%22N+79%C2%B055'23.0%22W/@40.4,-79.9,17z",
+      ),
+    ).toMatchObject({ kind: 'pin', linkName: null });
+    // A bare map: its centre.
+    expect(readPin('https://www.google.com/maps/@40.43812,-79.92306,17z')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+    expect(readPin('https://www.google.com/maps?q=40.43812,-79.92306')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+    expect(readPin('https://www.google.com/maps/search/?api=1&query=40.43812%2C-79.92306')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+    expect(readPin('https://maps.google.com/?ll=40.43812,-79.92306&z=16')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+  });
+
+  it('reads Apple Maps: its place, coordinates it was asked for, or the search near them', () => {
+    expect(readPin('https://maps.apple.com/?ll=40.43812,-79.92306&q=Dropped%20Pin')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+    expect(readPin('https://maps.apple.com/?q=40.43812,-79.92306')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+    expect(readPin('https://maps.apple.com/?sll=40.43812,-79.92306&q=coffee')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+  });
+
+  it('reads OpenStreetMap: the marker first, else the middle of the map', () => {
+    expect(
+      readPin(
+        'https://www.openstreetmap.org/?mlat=40.43812&mlon=-79.92306#map=17/40.43900/-79.92400',
+      ),
+    ).toEqual(pin(40.43812, -79.92306));
+    expect(readPin('https://www.openstreetmap.org/#map=17/40.43812/-79.92306')).toEqual(
+      pin(40.43812, -79.92306),
+    );
+    expect(readPin('https://openstreetmap.org/#map=17/95.1/-79.9')).toEqual({
+      kind: 'out-of-range',
+    });
+  });
+
+  it('names a short link as one, and follows none', () => {
+    for (const text of [
+      'https://maps.app.goo.gl/AbC123xyz',
+      'maps.app.goo.gl/AbC123xyz?g_st=ic',
+      'https://goo.gl/maps/AbC123',
+      // What Apple Maps and OpenStreetMap share.
+      'https://maps.apple/p/AbC123xyz',
+      'https://osm.org/go/ZX3c~-',
+    ]) {
+      expect(readPin(text)).toEqual({ kind: 'short-link' });
+    }
+  });
+
+  it.each([
+    // A search, with the map's middle or without: the results are not one place.
+    'https://www.google.com/maps/search/coffee/@40.4407,-79.9558,15z',
+    'https://www.google.com/maps/search/?api=1&query=coffee',
+    'https://www.google.com/maps?q=coffee&ll=40.44,-79.95',
+    // Street View: where the camera stood, not a place.
+    'https://www.google.com/maps/@40.4440,-79.9532,3a,75y,90t/data=!3m6!1e1',
+    'https://www.google.com/maps/@?api=1&map_action=map&center=40.44,-79.95&zoom=15',
+    'https://www.google.com/maps/place/Big+Fountain',
+    'https://maps.apple.com/?q=coffee',
+    'https://www.openstreetmap.org/',
+    // A phone shares a place it knows only by its address so.
+    'geo:0,0?q=20+Market+Street,+Pittsburgh',
+    'geo:0,0',
+  ])('reads no place in the maps link %j', (text) => {
+    expect(readPin(text)).toEqual({ kind: 'no-point' });
+  });
+
+  it('refuses numbers that are no place on earth', () => {
+    expect(readPin('91.5, 10.25')).toEqual({ kind: 'out-of-range' });
+    expect(readPin('https://www.google.com/maps?q=40.4,-190')).toEqual({ kind: 'out-of-range' });
+  });
+
+  it.each([
+    'Fountain Square',
+    '40,44',
+    '40.43812',
+    'https://example.com/?q=40.43812,-79.92306',
+    'geo:',
+    'geo:a,b',
+  ])('reads no pin in %j: that is a name to search for, or nothing', (text) => {
+    expect(readPin(text)).toEqual({ kind: 'none' });
+  });
+});
diff --git a/src/domain/geo/pin-input.ts b/src/domain/geo/pin-input.ts
new file mode 100644
index 0000000000000000000000000000000000000000..662a5da58356b6dc58e2cfa596006940db652bad
--- /dev/null
+++ b/src/domain/geo/pin-input.ts
@@ -0,0 +1,161 @@
+import type { LatLon } from './lat-lon.js';
+import { asUrl, isGoogle, readLocation, readPair, type LocationReading } from './location-input.js';
+
+/**
+ * What a member's text says as a pin (Matt, 2026-10-17: a pasted maps link or typed coordinates
+ * is a pin wherever a place is named). `pin`: the point, and the name the link gives the place
+ * (`linkName`: Google's `/place/<name>/`, a `geo:` label), or null. `short-link`: an address that
+ * only leads to one (`maps.app.goo.gl`, `goo.gl/maps`), which the bot does not follow: it fetches
+ * nothing a member names. `out-of-range`: numbers that are no place on earth. `none`: no pin (a
+ * name to search for, or nothing).
+ */
+export type PinReading =
+  | { kind: 'pin'; point: LatLon; linkName: string | null }
+  | { kind: 'short-link' }
+  | { kind: 'out-of-range' }
+  /** A link of a maps app that shows no one place: a search, a Street View, a bare map site. */
+  | { kind: 'no-point' }
+  | { kind: 'none' };
+
+const NONE: PinReading = { kind: 'none' };
+const NO_POINT: PinReading = { kind: 'no-point' };
+const UNREADABLE: LocationReading = { kind: 'unreadable' };
+
+/** A reading of `location-input.ts` as a pin with this name. */
+function asPin(reading: LocationReading | undefined, linkName: string | null): PinReading {
+  switch (reading?.kind) {
+    case 'point':
+      return { kind: 'pin', point: reading.point, linkName };
+    case 'out-of-range':
+      return { kind: 'out-of-range' };
+    case 'short-link':
+      return { kind: 'short-link' };
+    default:
+      return NONE;
+  }
+}
+
+function decoded(text: string): string {
+  try {
+    return decodeURIComponent(text.replace(/\+/g, ' '));
+  } catch {
+    return text;
+  }
+}
+
+/** A name as one line: white space made single, at most 100 characters; null for none. */
+function nameOf(text: string): string | null {
+  const name = text.replace(/\s+/g, ' ').trim().slice(0, 100);
+  return name === '' ? null : name;
+}
+
+/**
+ * A `geo:` address (RFC 5870, and what Android shares): `geo:<lat>,<lon>[,<alt>][;…][?q=…]`. A
+ * phone shares a place as `geo:0,0?q=<lat>,<lon>(<label>)`: the question's coordinates and label
+ * then count.
+ */
+function readGeo(text: string): PinReading | undefined {
+  const match = /^geo:([^?;]*)(?:;[^?]*)?(?:\?(.*))?$/i.exec(text);
+  if (!match) return undefined;
+  const [, where = '', query = ''] = match;
+  const asked = new URLSearchParams(query).get('q');
+  if (asked !== null) {
+    const label = /\(([^()]*)\)\s*$/.exec(asked);
+    const pair = readPair(asked.replace(/\s*\([^()]*\)\s*$/, ''));
+    if (pair) return asPin(pair, label ? nameOf(label[1] ?? '') : null);
+  }
+  const [lat = '', lon = ''] = where.split(',');
+  const reading = readPair(`${lat},${lon}`);
+  // `geo:0,0` is a place known only by the address in its question (or none): no point.
+  if (reading?.kind === 'point' && reading.point.lat === 0 && reading.point.lon === 0) {
+    return NO_POINT;
+  }
+  return asPin(reading, null);
+}
+
+/** The name of the place a Google Maps address shows (`/place/<name>/…`), when it is no point. */
+function googlePlaceName(url: URL): string | null {
+  const segments = url.pathname.split('/');
+  const at = segments.indexOf('place');
+  const segment = at >= 0 ? decoded(segments[at + 1] ?? '') : '';
+  if (segment === '' || readPair(segment) !== undefined) return null;
+  return nameOf(segment);
+}
+
+/** The first of these query parameters that holds coordinates. */
+function fromParams(url: URL, names: readonly string[]): LocationReading | undefined {
+  for (const name of names) {
+    const value = url.searchParams.get(name);
+    const reading = value === null ? undefined : readPair(value);
+    if (reading) return reading;
+  }
+  return undefined;
+}
+
+/** OpenStreetMap: its marker (`mlat`, `mlon`), else the middle of the map (`#map=<z>/<lat>/<lon>`). */
+function readOsm(url: URL): LocationReading | undefined {
+  const lat = url.searchParams.get('mlat');
+  const lon = url.searchParams.get('mlon');
+  if (lat !== null && lon !== null) return readPair(`${lat},${lon}`);
+  const map = /(?:^#|&)map=\d+(?:\.\d+)?\/([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)/.exec(
+    url.hash,
+  );
+  return map ? readPair(`${map[1] ?? ''},${map[2] ?? ''}`) : undefined;
+}
+
+function isOsm(host: string): boolean {
+  return host === 'openstreetmap.org' || host === 'www.openstreetmap.org';
+}
+
+/**
+ * The short links of Apple Maps (`maps.apple/p/…`) and OpenStreetMap (`osm.org/go/…`), which
+ * `readLocation` does not know: like the Google Maps app's, they only lead to a place.
+ */
+function isOtherShortLink(url: URL): boolean {
+  const host = url.hostname.toLowerCase();
+  return (
+    (host === 'maps.apple' && url.pathname.length > 1) ||
+    ((host === 'osm.org' || host === 'www.osm.org') && /^\/go\/./.test(url.pathname))
+  );
+}
+
+/** Whether an address is one of a maps site: what it does not show as a point is no place. */
+function isMapsSite(url: URL): boolean {
+  const host = url.hostname.toLowerCase();
+  return (
+    (isGoogle(host) && (host.startsWith('maps.') || url.pathname.startsWith('/maps'))) ||
+    host === 'maps.apple.com' ||
+    isOsm(host) ||
+    host === 'intel.ingress.com'
+  );
+}
+
+/**
+ * Reads a pin from what a member typed or pasted (pure; nothing is followed or fetched):
+ * coordinates, a `geo:` address, a Google Maps address (as `readLocation` reads it: the pin of a
+ * place first, `!3d<lat>!4d<lon>`, then `q`, `query`, the place in the path, `ll` and `@`, the
+ * name of `/place/<name>/` as `linkName`), Apple Maps (`ll`, `coordinate`, then `q` with
+ * coordinates, then `sll`) or OpenStreetMap (`mlat`/`mlon`, `#map=`). A pin read from where a
+ * map was centred counts: a member who pastes a map means its middle. A link of a maps site that
+ * shows no one place (a search, a Street View) is `no-point`, as is `geo:0,0`; the short links
+ * of the Google Maps app, Apple Maps (`maps.apple/p/…`) and OpenStreetMap (`osm.org/go/…`) are
+ * `short-link`.
+ */
+export function readPin(text: string): PinReading {
+  const trimmed = text.trim();
+  const geo = readGeo(trimmed);
+  if (geo) return geo;
+  const url = asUrl(trimmed);
+  const host = url?.hostname.toLowerCase();
+  if (url && isOtherShortLink(url)) return { kind: 'short-link' };
+  const read =
+    url && host !== undefined && isOsm(host) ? (readOsm(url) ?? UNREADABLE) : readLocation(trimmed);
+  const reading =
+    read.kind === 'unreadable' && url && host === 'maps.apple.com'
+      ? (fromParams(url, ['q', 'sll']) ?? read)
+      : read;
+  if (reading.kind === 'unreadable') return url && isMapsSite(url) ? NO_POINT : NONE;
+  const linkName =
+    reading.kind === 'point' && url && host && isGoogle(host) ? googlePlaceName(url) : null;
+  return asPin(reading, linkName);
+}
diff --git a/src/domain/geo/place.ts b/src/domain/geo/place.ts
new file mode 100644
index 0000000000000000000000000000000000000000..eff32de75e50e06e676a6e17231ff1bb6228d07d
--- /dev/null
+++ b/src/domain/geo/place.ts
@@ -0,0 +1,37 @@
+import type { PlaceKind } from '../search/place-merge.js';
+
+/**
+ * A gym, PokéStop or power spot as a member named it (`/wild near:`, a meetup's place): its kind
+ * and id (a gym's number as text, a Wayspot's Wayfarer id), title, place, address line (a gym's
+ * `addressLine`, a Wayspot's `wayspotAddressLine`; null or empty for none) and picture (shown
+ * only as `wayspotPicture` allows), as it was when it was named: a snapshot (Matt, 2026-10-17),
+ * since an import may delete a Wayspot and staff a gym while it is shown.
+ */
+export interface KnownPlace {
+  kind: PlaceKind;
+  id: string;
+  title: string;
+  lat: number;
+  lon: number;
+  address: string | null;
+  image: string | null;
+}
+
+/**
+ * A pin: a place a member gave by a maps link or coordinates (Matt, 2026-10-17). `near` is the
+ * nearest gym, PokéStop or power spot within `PIN_NEAR_METRES` when it was set, `linkName` the
+ * place its link named (Google's `/place/<name>/`), each null for none.
+ */
+export interface DroppedPin {
+  kind: 'pin';
+  lat: number;
+  lon: number;
+  near: { kind: PlaceKind; title: string } | null;
+  linkName: string | null;
+}
+
+/** A place a member named: a known one, or a pin. */
+export type Place = KnownPlace | DroppedPin;
+
+/** A pin is named by the nearest place at most this far away (Matt, 2026-10-17). */
+export const PIN_NEAR_METRES = 50;
diff --git a/src/render/place.ts b/src/render/place.ts
new file mode 100644
index 0000000000000000000000000000000000000000..38f3ecd0b7343f76230df038264fd9b0d94d979f
--- /dev/null
+++ b/src/render/place.ts
@@ -0,0 +1,35 @@
+import type { DroppedPin, Place } from '../domain/geo/place.js';
+import type { PlaceKind } from '../domain/search/place-merge.js';
+import { mapMarkdown } from './raid-post.js';
+
+/** How each kind of place is named after its title: `Fountain Square (PokéStop)`. */
+export const PLACE_KIND_WORDS: Readonly<Record<PlaceKind, string>> = {
+  gym: 'gym',
+  stop: 'PokéStop',
+  powerspot: 'power spot',
+};
+
+/**
+ * A pin in one line (Matt, 2026-10-17): by its `label` when there is one (a meetup's `where`
+ * text), else the place it is near (`📍 Near **Fountain Square** (PokéStop)`), else the name its
+ * link gave, else `📍 Dropped pin`; then its Map. `text` makes what a member or a link wrote safe
+ * where it is shown (`plain`, `plainNoLinks`).
+ */
+export function pinLine(
+  pin: DroppedPin,
+  label: string | null,
+  text: (raw: string) => string,
+): string {
+  const map = mapMarkdown(pin);
+  if (label !== null && label !== '') return `📍 **${text(label)}** · ${map}`;
+  if (pin.near) {
+    return `📍 Near **${text(pin.near.title)}** (${PLACE_KIND_WORDS[pin.near.kind]}) · ${map}`;
+  }
+  if (pin.linkName !== null) return `📍 **${text(pin.linkName)}** · ${map}`;
+  return `📍 Dropped pin · ${map}`;
+}
+
+/** The picture of a place as it was named; none for a pin. */
+export function placeImage(place: Place | undefined): string | null {
+  return place === undefined || place.kind === 'pin' ? null : place.image;
+}
diff --git a/src/render/spawn.ts b/src/render/spawn.ts
index b30e25f45c87e5a1d170a1e533d711cec77bd60e..138ec3ecb4f7bd34febab653a4df587cc0981b81 100644
--- a/src/render/spawn.ts
+++ b/src/render/spawn.ts
@@ -9,7 +9,9 @@ import {
   type NamedMember,
 } from './text.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
-import { gymMapsUrl } from './raid-post.js';
+import type { Place } from '../domain/geo/place.js';
+import { PLACE_KIND_WORDS, pinLine, placeImage } from './place.js';
+import { mapMarkdown } from './raid-post.js';
 import { container, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /** The colour of a spawn report, as the legacy bot's. */
@@ -35,41 +37,28 @@ export function spawnFooter(notifications: boolean): string {
 }
 
 /**
- * The gym, PokéStop or power spot a reporter said the Pokémon is near (`/wild near:`, plan 8W-2):
- * its kind, title, address line, place and picture (shown only as `wayspotPicture` allows).
+ * The gym, PokéStop or power spot a reporter said the Pokémon is near (`/wild near:`, plan 8W-2),
+ * as it was then (a snapshot: the report is never shown anew), or a pin they gave by a maps link
+ * or coordinates (Matt, 2026-10-17).
  */
-export interface SpawnPlace {
-  kind: 'gym' | 'stop' | 'powerspot';
-  title: string;
-  /**
-   * Its address as one line (a gym's `addressLine`, a Wayspot's `wayspotAddressLine`); null or
-   * empty for none.
-   */
-  address: string | null;
-  lat: number;
-  lon: number;
-  image: string | null;
-}
-
-const PLACE_WORDS: Readonly<Record<SpawnPlace['kind'], string>> = {
-  gym: 'gym',
-  stop: 'PokéStop',
-  powerspot: 'power spot',
-};
+export type SpawnPlace = Place;
 
 /** Said in place of the address of a place that has none. */
 const NO_PLACE_ADDRESS = '(no address available)';
 
 /**
- * `Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood · [Map](<…>)`: the title and the address made plain without links (they reach other members' direct
- * messages; a place without an address says so, so that its picture never sits beside a bare
- * name), the kind, and the place's maps link.
+ * `Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood · [Map](<…>)`: the title and
+ * the address made plain without links (they reach other members' direct messages; a place
+ * without an address says so, so that its picture never sits beside a bare name), the kind, and
+ * the place's maps link. A pin is `pinLine` without a label (the report's details are its own
+ * line): `📍 Near **Fountain Square** (PokéStop) · [Map](<…>)`, `📍 Dropped pin · [Map](<…>)`.
  */
 export function nearLine(place: SpawnPlace): string {
+  if (place.kind === 'pin') return pinLine(place, null, plainNoLinks);
   const address = place.address === null || place.address === '' ? '' : plainNoLinks(place.address);
   return (
-    `Near **${plainNoLinks(place.title)}** (${PLACE_WORDS[place.kind]}) · ` +
-    `${address === '' ? NO_PLACE_ADDRESS : address} · [Map](<${gymMapsUrl(place)}>)`
+    `Near **${plainNoLinks(place.title)}** (${PLACE_KIND_WORDS[place.kind]}) · ` +
+    `${address === '' ? NO_PLACE_ADDRESS : address} · ${mapMarkdown(place)}`
   );
 }
 
@@ -109,7 +98,7 @@ function spawnBody(view: SpawnView, smallPrint: string): APIComponentInContainer
   const where = [whereText(view), ...(view.near ? [nearLine(view.near)] : [])]
     .filter((line) => line !== '')
     .join('\n');
-  const picture = wayspotPicture(view.near?.image);
+  const picture = wayspotPicture(placeImage(view.near));
   const text = `**Where**\n${where}`;
   return [
     ...(where === ''
diff --git a/src/services/place-finder.test.ts b/src/services/place-finder.test.ts
index 7c48378aa570099404f8358783de9dc3c9dff3d2..163662d44a94527e222799ed220bf275a4796bbf 100644
--- a/src/services/place-finder.test.ts
+++ b/src/services/place-finder.test.ts
@@ -38,6 +38,61 @@ async function finderWith(extra: { rows?: WayspotRow[]; gyms?: Gym[] } = {}) {
 }
 
 describe('PlaceFinder', () => {
+  it('makes a pin in the server’s regions, named by the nearest place within 50 metres', async () => {
+    const { finder } = await finderWith();
+    // The power spot by the library is nearer than the library itself (gym 1, 40.05, -80.05).
+    expect(finder.pin(1, { lat: 40.0503, lon: -80.0503 }, null)).toEqual({
+      kind: 'pin',
+      lat: 40.0503,
+      lon: -80.0503,
+      near: { kind: 'powerspot', title: 'Library Garden' },
+      linkName: null,
+    });
+    // On the other side the gym is nearer, named as its post names it (its nickname).
+    expect(finder.pin(1, { lat: 40.0499, lon: -80.0499 }, 'Blue Tent')).toEqual({
+      kind: 'pin',
+      lat: 40.0499,
+      lon: -80.0499,
+      near: { kind: 'gym', title: 'The Stacks' },
+      linkName: 'Blue Tent',
+    });
+    // Nothing within 50 metres: no name of a place.
+    expect(finder.pin(1, { lat: 40.03, lon: -80.09 }, null)?.near).toBeNull();
+    // Outside every region of the server: no pin.
+    expect(finder.pin(1, { lat: 41, lon: -81 }, null)).toBeUndefined();
+    expect(finder.pin(1, NORTH_PLACE, null)).toBeUndefined();
+    expect(finder.pin(2, { lat: 40.0503, lon: -80.0503 }, null)).toBeUndefined();
+  });
+
+  it('offers no Wayspot without a title, neither by its street nor by its value', async () => {
+    const { finder } = await finderWith({
+      rows: [
+        keptRow(8, {
+          title: '  ',
+          lat: 40.052,
+          lon: -80.052,
+          address: '16 Maple Avenue, Pinewood, PA 15999, USA',
+        }),
+      ],
+    });
+    expect(finder.find(1, WEST_CHANNEL, 'maple avenue').map((one) => one.id)).not.toContain(
+      wayspotId(8),
+    );
+    expect(finder.chosen(1, `stop:${wayspotId(8)}`)).toBeUndefined();
+  });
+
+  it('names a pin by no Wayspot outside the server’s regions, nor one without a title', async () => {
+    const { finder } = await finderWith({
+      rows: [
+        // Just across West's northern edge (40.10), some 33 metres from the pin.
+        keptRow(6, { title: 'Beyond the Border', lat: 40.1002, lon: -80.05 }),
+        // Nearer still, in the region, but called nothing.
+        keptRow(7, { title: '', lat: 40.0999, lon: -80.0501 }),
+      ],
+    });
+    expect(finder.pin(1, { lat: 40.0999, lon: -80.05 }, null)?.near).toBeNull();
+  });
+
   it('merges gyms, stops and power spots by fit, the member’s region first, then the kind', async () => {
     const { finder } = await finderWith();
     const found = finder.find(1, WEST_CHANNEL, 'fountain');
diff --git a/src/services/place-finder.ts b/src/services/place-finder.ts
index f78782c20c9b3ca6510540bc05bb7b4561606126..0bfb53bd1680af06e021cdb8fc216f03bf1cfab5 100644
--- a/src/services/place-finder.ts
+++ b/src/services/place-finder.ts
@@ -4,6 +4,8 @@ import { metresBetween } from '../domain/geo/distance.js';
 import { addressLine, geodataParts } from '../domain/geo/google.js';
 import { wayspotAddressLine } from '../domain/geo/wayfarer-address.js';
 import type { LatLon } from '../domain/geo/lat-lon.js';
+import { PIN_NEAR_METRES, type DroppedPin } from '../domain/geo/place.js';
+import { ringContains } from '../domain/geo/region-membership.js';
 import {
   clearPlace,
   extraWords,
@@ -142,7 +144,8 @@ export class PlaceFinder {
       const within = new Set<string>();
       for (const channelId of channels) {
         for (const wayspot of wayspots.inRegion(channelId)) {
-          if (wayspot.kind === kind) within.add(wayspot.id);
+          // A Wayspot called nothing is no place to name (its street alone would find it).
+          if (wayspot.kind === kind && wayspot.title.trim() !== '') within.add(wayspot.id);
         }
       }
       for (const match of indexes[kind].search(text, { within })) {
@@ -177,12 +180,63 @@ export class PlaceFinder {
       return described(gymChoice(gym, 'exact', false), this.gymsOf(channels));
     }
     const wayspot = this.options.wayspots.byId(read.id);
-    if (wayspot?.kind !== read.kind || !ours(this.options.wayspots.regionsOf(wayspot.id))) {
+    if (
+      wayspot?.kind !== read.kind ||
+      wayspot.title.trim() === '' ||
+      !ours(this.options.wayspots.regionsOf(wayspot.id))
+    ) {
       return undefined;
     }
     return described(wayspotChoice(wayspot, 'exact', false), this.gymsOf(channels));
   }
 
+  /**
+   * A pin at `point` (a member's maps link or coordinates), named by the nearest of the server's
+   * gyms and the kept PokéStops and power spots within `PIN_NEAR_METRES`, with the name its link
+   * gave; undefined when the point lies in no region of the server.
+   */
+  pin(guildId: number, point: LatLon, linkName: string | null): DroppedPin | undefined {
+    const regions = this.options.regions
+      .all()
+      .filter((region) => region.guildId === guildId && region.bounds !== null);
+    if (!regions.some((region) => region.bounds && ringContains(region.bounds, point))) {
+      return undefined;
+    }
+    const channels = new Set(regions.map((region) => region.channelId));
+    let near: { kind: PlaceKind; title: string; metres: number } | undefined;
+    for (const gym of this.gymsOf(channels).values()) {
+      // As a post names it: by its nickname, when it has one.
+      const title = (gym.nickname || gym.name).trim();
+      const metres = metresBetween(point, gym);
+      if (title !== '' && metres <= PIN_NEAR_METRES && (!near || metres < near.metres)) {
+        near = { kind: 'gym', title, metres };
+      }
+    }
+    // Only the server's own, as `find` offers them, and only one that is called something.
+    const { wayspots } = this.options;
+    const spot = wayspots
+      .near(point, PIN_NEAR_METRES, ['stop', 'powerspot'])
+      .find(
+        ({ wayspot }) =>
+          wayspot.title.trim() !== '' &&
+          wayspots.regionsOf(wayspot.id).some((channelId) => channels.has(channelId)),
+      );
+    if (spot && (!near || spot.metres < near.metres)) {
+      near = {
+        kind: spot.wayspot.kind,
+        title: spot.wayspot.title,
+        metres: spot.metres,
+      };
+    }
+    return {
+      kind: 'pin',
+      lat: point.lat,
+      lon: point.lon,
+      near: near ? { kind: near.kind, title: near.title } : null,
+      linkName,
+    };
+  }
+
   /** The channels of the server's regions with an outline. */
   private channelsOf(guildId: number): Set<string> {
     return new Set(
diff --git a/src/services/spawn-service.test.ts b/src/services/spawn-service.test.ts
index ffb5f63f0f3a5b9aff2ca3fb91dc34095c297207..07410d3bebabb438428f0d843574c4d439aeaf21 100644
--- a/src/services/spawn-service.test.ts
+++ b/src/services/spawn-service.test.ts
@@ -431,6 +431,7 @@ describe('SpawnService', () => {
       report(made.gateway.guildId, {
         near: {
           kind: 'stop',
+          id: '0123456789abcdef0123456789abcdef.16',
           title: 'Bench',
           lat: 40.05,
           lon: -80.05,
@@ -496,6 +497,7 @@ describe('the messages of a spawn report', () => {
 
   const NEAR = {
     kind: 'stop' as const,
+    id: '0123456789abcdef0123456789abcdef.16',
     title: 'Fountain *Square* https://example.com',
     lat: 40.05,
     lon: -80.05,
diff --git a/src/services/spawn-service.ts b/src/services/spawn-service.ts
index 387f25a5fd3031314ae92cac0d7251f9d36ec638..17be3422ee6a179231924edf26141a0f32b3613f 100644
--- a/src/services/spawn-service.ts
+++ b/src/services/spawn-service.ts
@@ -16,6 +16,7 @@ import {
   type SpawnPlace,
   type SpawnView,
 } from '../render/spawn.js';
+import { placeImage } from '../render/place.js';
 import type { NamedMember } from '../render/text.js';
 import { pokemonPicture } from '../domain/pogo/pokemon-icons.js';
 import type { GameDataProvider } from './game-data-service.js';
@@ -253,11 +254,12 @@ export class SpawnService {
     try {
       return await gateway.sendMessage(channelId, make(view));
     } catch (err) {
-      const pictured = view.image !== undefined || (view.near?.image ?? null) !== null;
+      const pictured = view.image !== undefined || placeImage(view.near) !== null;
       if (!pictured || !isRefusedBody(err)) throw err;
       log.warn({ err, channel: channelId }, 'Discord refused the picture of a spawn report');
       // Which of the two pictures it was is not said: both go.
-      const near = view.near && { ...view.near, image: null };
+      const near =
+        view.near?.kind === 'pin' ? view.near : view.near && { ...view.near, image: null };
       return gateway.sendMessage(channelId, make({ ...view, image: undefined, near }));
     }
   }
````

### Task 6: Plan 8D T6: Meetups: a place in the model, set once when the meetup is made

Prototype commit: `43d98b8f06cc093a4ce29a36f911650419641f3c`

MeetupDetails gains place: a gym, PokeStop or power spot as it was named
(a snapshot), or a pin (MeetupPlace = Place). It is set only when the
meetup is made (createMeetup takes it; Matt, 2026-10-17) and never
changes afterwards; what more there is to say about it goes in the
information (/info). The state document is version 10, which reads a
meetup of version 9 or older as one without a place and refuses a place
no meetup can have (out of range, an unknown kind, an empty picture).
placeSummary says a place in a few words for a direct message.

**Files:**

```
 src/db/repositories/history-recording.db.test.ts |   2 +-
 src/db/repositories/party-repository.db.test.ts  |  38 ++++++++++++++++++++++--
 src/domain/history/party-history.test.ts         |   7 +++--
 src/domain/party/meetup.test.ts                  |  35 ++++++++++++++++++++++
 src/domain/party/meetup.ts                       |  20 ++++++++++---
 src/domain/party/party-state.test.ts             | 102 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/domain/party/party-state.ts                  |  77 ++++++++++++++++++++++++++++++++++++++++++-----
 src/domain/party/party.ts                        |  10 +++++++
 src/render/place.ts                              |  32 ++++++++++++++------
 src/render/spawn.ts                              |   6 ++--
 10 files changed, 289 insertions(+), 40 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/domain/history/party-history.test.ts src/domain/party/meetup.test.ts src/domain/party/party-state.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/history-recording.db.test.ts src/db/repositories/party-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 43d98b8f06cc093a4ce29a36f911650419641f3c -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T6: Meetups: a place in the model, set once when the meetup is made`, the body above and the trailer, staging exactly
  `src/db/repositories/history-recording.db.test.ts src/db/repositories/party-repository.db.test.ts src/domain/history/party-history.test.ts src/domain/party/meetup.test.ts src/domain/party/meetup.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/render/place.ts src/render/spawn.ts`.

````diff
diff --git a/src/db/repositories/history-recording.db.test.ts b/src/db/repositories/history-recording.db.test.ts
index d6cf8efee6da30e76b106805ae80b0145f6f315c..7d4436579c63132d299655723c00570d7e274778 100644
--- a/src/db/repositories/history-recording.db.test.ts
+++ b/src/db/repositories/history-recording.db.test.ts
@@ -235,7 +235,7 @@ describe('the party history, written with the parties', () => {
     const told = await live([
       {
         ...meetup,
-        meetup: { description: `Ask ${BOB} first` },
+        meetup: { description: `Ask ${BOB} first`, place: null },
         groups: [{ id: 'A', label: `Ride with <@!${BOB}>` }],
       },
     ]);
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index a47f7c2eb818e2131728f4723a9e97d398539e83..d4a90c538324745bf17c408eaa363463d770eb03 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -78,7 +78,10 @@ describe('PartyRepository', () => {
     await expect(parties.findById(ID(9))).resolves.toBeUndefined();
   });
 
-  /** A meetup with times, a second attendee, a post and a description: every column in use. */
+  /**
+   * A meetup with times, a second attendee, a post, a description and a place (a pin named by
+   * a place near it and by its link): every column and every part of the document in use.
+   */
   function fullMeetup(n = 1): MeetupParty {
     const meetup = withAttendees(testMeetup({ id: ID(n), name: 'Picnic “by the lake” 🧺' }), {
       [ALICE]: { status: PartyStatus.Present, number: 2, remote: true },
@@ -99,10 +102,39 @@ describe('PartyRepository', () => {
       lastPossibleTime: PARTY_NOW + 180 * MINUTE,
       deletionTime: PARTY_NOW + 245 * MINUTE,
       timed: { ...meetup.timed, startTime: PARTY_NOW + 60 * MINUTE },
-      meetup: { description: 'Bring snacks.\nWe meet at the fountain. 🍪' },
+      meetup: {
+        description: 'Bring snacks.\nWe meet at the fountain. 🍪',
+        place: {
+          kind: 'pin',
+          lat: 40.438123,
+          lon: -79.923061,
+          near: { kind: 'stop', title: 'Fountain “Square” 🧺' },
+          linkName: 'Blue Tent',
+        },
+      },
     };
   }
 
+  it('keeps the place of a meetup that is a gym, PokéStop or power spot, as it was named', async () => {
+    const meetup: MeetupParty = {
+      ...fullMeetup(7),
+      meetup: {
+        description: null,
+        place: {
+          kind: 'powerspot',
+          id: '0123456789abcdef0123456789abcdef.16',
+          title: 'Café “Élan” Garden',
+          lat: 40.05,
+          lon: -80.05,
+          address: '12 Maple Avenue, Pinewood',
+          image: 'https://lh3.googleusercontent.com/garden',
+        },
+      },
+    };
+    await parties.insert(meetup);
+    expect(await parties.findById(meetup.id)).toEqual({ ok: true, party: meetup });
+  });
+
   it('stores a new meetup and reads it back exactly, by itself and in the list', async () => {
     const meetup = fullMeetup();
     await parties.insert(meetup);
@@ -131,7 +163,7 @@ describe('PartyRepository', () => {
       deletionTime: null,
       updatedAt: PARTY_NOW + MINUTE,
       timed: { name: 'Picnic', startTime: null },
-      meetup: { description: null },
+      meetup: { description: null, place: null },
     };
     expect(await parties.save(changed)).toBe(true);
     expect(await parties.findById(meetup.id)).toEqual({ ok: true, party: changed });
diff --git a/src/domain/history/party-history.test.ts b/src/domain/history/party-history.test.ts
index 992feb6107d4207240590072d29f6dc0d42375ea..b52327e9f92fbb0e0c39ebcb1057bb697015b8b0 100644
--- a/src/domain/history/party-history.test.ts
+++ b/src/domain/history/party-history.test.ts
@@ -286,7 +286,10 @@ describe('historyOfParty', () => {
     const meetup = testMeetup({ name: `Picnic with <@${BOB}>` });
     const labelled = {
       ...meetup,
-      meetup: { description: `Ask <@!${ALICE}> or ${BOB} <:pine:123456789012345678>` },
+      meetup: {
+        description: `Ask <@!${ALICE}> or ${BOB} <:pine:123456789012345678>`,
+        place: null,
+      },
       groups: [{ id: 'A' as const, label: `Ride with <@${CAROL}>` }],
     };
     const record = historyOfParty(endParty(labelled), {
@@ -313,7 +316,7 @@ describe('historyOfParty', () => {
   it('keeps a meetup with its name and words, at no gym', () => {
     const meetup = testMeetup();
     const record = historyOfParty(
-      endParty({ ...meetup, meetup: { description: 'Bring snacks' } }),
+      endParty({ ...meetup, meetup: { description: 'Bring snacks', place: null } }),
       { end: { how: 'clock' }, steps: [], optedIn: new Set(), describeBoss, shiny: null },
     );
     expect(record).toMatchObject({
diff --git a/src/domain/party/meetup.test.ts b/src/domain/party/meetup.test.ts
index ef569b14afe4fb418c02f3233fd496e7d27d42a5..8c4c2d668e21a632b05b6b79d2da89b3e400af7c 100644
--- a/src/domain/party/meetup.test.ts
+++ b/src/domain/party/meetup.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import { PARTY_NOW, REPORTER, testMeetup, testRaid } from '../../../test/support/parties.js';
 import { attendanceLimits, setRemote } from './attendance.js';
+import type { DroppedPin, KnownPlace } from '../geo/place.js';
 import { createMeetup, setDescription, type NewMeetup } from './meetup.js';
 import {
   hasGroups,
@@ -149,3 +150,37 @@ describe('setDescription', () => {
     expect(setDescription(set.party, 'Bring snacks.  ').party).toBe(set.party);
   });
 });
+
+describe('the place of a meetup', () => {
+  const STOP: KnownPlace = {
+    kind: 'stop',
+    id: '0123456789abcdef0123456789abcdef.16',
+    title: 'Fountain Square',
+    lat: 40.0601,
+    lon: -80.0601,
+    address: '20 Market Street, Pinewood',
+    image: 'https://lh3.googleusercontent.com/square',
+  };
+  const PIN: DroppedPin = {
+    kind: 'pin',
+    lat: 40.02,
+    lon: -80.02,
+    near: null,
+    linkName: 'Blue Tent',
+  };
+
+  it('is set when the meetup is made, and none without one', () => {
+    for (const place of [STOP, PIN]) {
+      const made = createMeetup({ ...fresh, place });
+      expect(made.ok && made.party.meetup).toEqual({ description: null, place });
+    }
+    expect(testMeetup().meetup).toEqual({ description: null, place: null });
+  });
+
+  it('stays as it was when the information is changed', () => {
+    const made = createMeetup({ ...fresh, place: STOP });
+    if (!made.ok) throw new Error(made.reason);
+    const set = setDescription(made.party, 'Bring snacks.');
+    expect(set.ok && set.party.meetup.place).toBe(STOP);
+  });
+});
diff --git a/src/domain/party/meetup.ts b/src/domain/party/meetup.ts
index 01c77341ac1441bc05722ccf8a39baa1ee92f765..f1360d6785afe537ec0db540068cfe010a68e80b 100644
--- a/src/domain/party/meetup.ts
+++ b/src/domain/party/meetup.ts
@@ -1,10 +1,22 @@
-import { MAX_MEETUP_DESCRIPTION, refused, type Change, type MeetupParty } from './party.js';
+import {
+  MAX_MEETUP_DESCRIPTION,
+  refused,
+  type Change,
+  type MeetupParty,
+  type MeetupPlace,
+} from './party.js';
 import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js';
 
-export type NewMeetup = NewTimedParty;
+/**
+ * A new meetup: its name, and where it is when the member who made it said (`/meetup near:`).
+ * The place is set once, here, and never changes afterwards (Matt, 2026-10-17).
+ */
+export interface NewMeetup extends NewTimedParty {
+  place?: MeetupPlace | null;
+}
 
 /**
- * A new meetup: a name and nothing else yet, with the member who made it signed up as
+ * A new meetup: a name and, when given, its place, with the member who made it signed up as
  * interested (as the legacy bot did; their automatic status is for raids they report and trains
  * they make). It names who made it, whatever they chose for those: they are the first trainer
  * in its list anyway. It has no times, so it counts as going on for a day (`OPEN_PARTY_HOURS`)
@@ -16,7 +28,7 @@ export function createMeetup(input: NewMeetup): Change<MeetupParty> {
   const meetup: MeetupParty = {
     ...newTimedParty(input, name),
     type: 'meetup',
-    meetup: { description: null },
+    meetup: { description: null, place: input.place ?? null },
   };
   return { ok: true, party: settled(meetup, input.now) };
 }
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index e63b526e24164a9637dbcbcc641dbef88d359271..61708adb07c544c9fe721937aa37d0a77ad577e2 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -9,6 +9,7 @@ import {
   testTrain,
   withAttendees,
 } from '../../../test/support/parties.js';
+import type { DroppedPin, KnownPlace } from '../geo/place.js';
 import { partyFromStored, partyMirrors, partyState, type PartyColumns } from './party-state.js';
 import {
   MAX_MEETUP_DESCRIPTION,
@@ -79,6 +80,17 @@ function columnsOf(party: Party): PartyColumns {
   return { ...columns, mirrorMessages: [] };
 }
 
+/** A PokéStop as a meetup keeps it: what it was when it was named. */
+const STOP: KnownPlace = {
+  kind: 'stop',
+  id: '0123456789abcdef0123456789abcdef.16',
+  title: 'Fountain Square',
+  lat: 40.0601,
+  lon: -80.0601,
+  address: '20 Market Street, Pinewood',
+  image: 'https://lh3.googleusercontent.com/square',
+};
+
 /** A meetup with everything a state document can hold for one. */
 function fullMeetup(): MeetupParty {
   const meetup = withAttendees(testMeetup(), {
@@ -99,7 +111,10 @@ function fullMeetup(): MeetupParty {
       { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'status' },
     ],
     timed: { name: 'Community Day picnic', startTime: PARTY_NOW + 3_600_000 },
-    meetup: { description: 'Bring snacks.\nWe meet at the fountain.' },
+    meetup: {
+      description: 'Bring snacks.\nWe meet at the fountain.',
+      place: STOP,
+    },
   };
 }
 
@@ -140,7 +155,7 @@ describe('party state', () => {
       party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
     });
     // Nothing was added to the document for it: the version is what it was.
-    expect(document.v).toBe(9);
+    expect(document.v).toBe(10);
     // There were no shadow EX raids, and there are no shadow elite raids: still refused.
     const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
     expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
@@ -155,7 +170,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(9);
+    expect(state.v).toBe(10);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -216,7 +231,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 10 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 11 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -285,11 +300,74 @@ describe('party state', () => {
     ]);
     // What a train will have too, and what only a meetup has.
     expect(state.timed).toEqual({ name: 'Community Day picnic', startTime: PARTY_NOW + 3_600_000 });
-    expect(state.meetup).toEqual({ description: 'Bring snacks.\nWe meet at the fountain.' });
-    // A meetup that was just made: no description, no start.
+    expect(state.meetup).toEqual({
+      description: 'Bring snacks.\nWe meet at the fountain.',
+      place: STOP,
+    });
+    // A meetup that was just made: no description, no place, no start.
     const fresh = partyState(testMeetup());
     expect(fresh.timed).toEqual({ name: 'Community Day picnic', startTime: null });
-    expect(fresh.meetup).toEqual({ description: null });
+    expect(fresh.meetup).toEqual({ description: null, place: null });
+  });
+
+  it('keeps every kind of place of a meetup, and reads a version 9 meetup as one without', () => {
+    const pins: DroppedPin[] = [
+      { kind: 'pin', lat: 40.02, lon: -80.02, near: null, linkName: null },
+      {
+        kind: 'pin',
+        lat: -33.8568,
+        lon: 151.2153,
+        near: { kind: 'powerspot', title: 'Library Garden' },
+        linkName: 'Blue Tent',
+      },
+    ];
+    const places: (MeetupParty['meetup']['place'] & object)[] = [
+      STOP,
+      { ...STOP, kind: 'gym', id: '12', address: null, image: null },
+      ...pins,
+    ];
+    for (const place of places) {
+      const meetup: MeetupParty = { ...fullMeetup(), meetup: { ...fullMeetup().meetup, place } };
+      expect(partyFromStored(columnsOf(meetup), stored(partyState(meetup)), [])).toEqual({
+        ok: true,
+        party: { ...meetup, mirrorMessages: [] },
+      });
+    }
+    // Version 9 knew no place: a meetup of it has none.
+    const meetup = fullMeetup();
+    const { place: _place, ...old } = partyState(meetup).meetup ?? {};
+    expect(
+      partyFromStored(
+        columnsOf(meetup),
+        stored({ ...partyState(meetup), v: 9, meetup: old }),
+        meetup.mirrorMessages,
+      ),
+    ).toEqual({
+      ok: true,
+      party: { ...meetup, meetup: { ...meetup.meetup, place: null } },
+    });
+  });
+
+  it('refuses a place no meetup can have, when read and when written', () => {
+    const problem = (columns: PartyColumns, state: unknown): string => {
+      const result = partyFromStored(columns, state, []);
+      return result.ok ? 'read' : result.problem;
+    };
+    const meetup = fullMeetup();
+    const state = stored(partyState(meetup)) as Record<string, unknown>;
+    const withPlace = (place: unknown): string =>
+      problem(columnsOf(meetup), { ...state, meetup: { ...meetup.meetup, place } });
+    expect(withPlace(null)).toBe('read');
+    expect(withPlace({ ...STOP, lat: 91 })).toMatch(/^state: /);
+    expect(withPlace({ ...STOP, kind: 'portal' })).toMatch(/^state: /);
+    expect(withPlace({ kind: 'pin', lat: 40, lon: -80, near: null })).toMatch(/^state: /);
+    expect(withPlace({ ...STOP, image: '' })).toMatch(/^state: /);
+    // Version 10 needs it: a document without it is damaged, not old.
+    const { place: _place, ...withoutPlace } = meetup.meetup;
+    expect(problem(columnsOf(meetup), { ...state, meetup: withoutPlace })).toMatch(/^state: /);
+    expect(() =>
+      partyState({ ...meetup, meetup: { ...meetup.meetup, place: { ...STOP, lon: 181 } } }),
+    ).toThrow(/cannot be stored/);
   });
 
   it('reports a row whose document is not of the kind its type says', () => {
@@ -818,19 +896,23 @@ describe('the state of a train', () => {
         ).toEqual({ ok: true, party: { ...train, train: { ...train.train, atEnd: 'finish' } } });
       }
     }
-    // A raid and a meetup of version 8 are read as they are.
+    // A raid of version 8 is read as it is, a meetup as one without a place.
     const raid = fullRaid();
     expect(
       partyFromStored(columnsOf(raid), stored({ ...partyState(raid), v: 8 }), raid.mirrorMessages),
     ).toEqual({ ok: true, party: raid });
     const meetup = fullMeetup();
+    const { description } = meetup.meetup;
     expect(
       partyFromStored(
         columnsOf(meetup),
-        stored({ ...partyState(meetup), v: 8 }),
+        stored({ ...partyState(meetup), v: 8, meetup: { description } }),
         meetup.mirrorMessages,
       ),
-    ).toEqual({ ok: true, party: meetup });
+    ).toEqual({
+      ok: true,
+      party: { ...meetup, meetup: { description, place: null } },
+    });
     // A damaged version 8 train is reported as before.
     const train = fullTrain();
     const { atEnd: _mode, ...details } = partyState(train).train ?? {};
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index 55fe5023d21c1d9a7ad0edd3a5afbe9cdeff1484..e8c485eaf431740d0b23429285ac1e13008be865 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -38,10 +38,12 @@ import { PartyStatus } from './status.js';
  * raid's `screenshot` (the screenshot it was reported from, and whether its time is a guess); a
  * raid of an earlier document has none. Version 9 (plan 8B-3) added a train's `atEnd` (what it
  * does at the last stop of its route); a train of an earlier document finishes its route there.
+ * Version 10 (plan 8D) added a meetup's `place` (a gym, PokéStop or power spot as it was named,
+ * or a pin); a meetup of an earlier document has none.
  * Documents of versions 1 to 3 are those of raids, and one of version 4 is that of a raid or a
  * meetup.
  */
-export const PARTY_STATE_VERSION = 9;
+export const PARTY_STATE_VERSION = 10;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -138,10 +140,39 @@ const timed = z.object({
   startTime: time.nullable(),
 });
 
-const meetup = z.object({
+/** A meetup's details as versions 4 to 9 wrote them: without its place. */
+const meetupV9 = z.object({
   description: z.string().min(1).max(MAX_MEETUP_DESCRIPTION).nullable(),
 });
 
+const placeKind = z.enum(['gym', 'stop', 'powerspot']);
+const latitude = z.number().min(-90).max(90);
+const longitude = z.number().min(-180).max(180);
+
+/** A gym, PokéStop or power spot as it was named, or a pin (`MeetupPlace`). */
+const place = z.union([
+  z.object({
+    kind: placeKind,
+    id: z.string().min(1).max(64),
+    title: z.string().min(1).max(255),
+    lat: latitude,
+    lon: longitude,
+    address: z.string().max(500).nullable(),
+    image: z.string().min(1).max(2048).nullable(),
+  }),
+  z.object({
+    kind: z.literal('pin'),
+    lat: latitude,
+    lon: longitude,
+    near: z.object({ kind: placeKind, title: z.string().min(1).max(255) }).nullable(),
+    linkName: z.string().min(1).max(100).nullable(),
+  }),
+]);
+
+const meetup = meetupV9.extend({
+  place: place.nullable(),
+});
+
 const gymId = z.number().int().positive();
 
 /** What does not hold of where a train is on its route, whatever the version of its document. */
@@ -258,6 +289,23 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 9, as plans 8B-3 to 8M-2F wrote it: read only. It is version 10 without a meetup's place. */
+const stateV9 = z
+  .object({
+    v: z.literal(9),
+    ...shared,
+    raid: raid.optional(),
+    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+    timed: timed.optional(),
+    meetup: meetupV9.optional(),
+    train: train.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 8, as plans 7B to 8B-2 wrote it: read only. It is version 9 without a train's mode. */
 const stateV8 = z
   .object({
@@ -266,7 +314,7 @@ const stateV8 = z
     raid: raid.optional(),
     makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
     timed: timed.optional(),
-    meetup: meetup.optional(),
+    meetup: meetupV9.optional(),
     train: trainV8.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
@@ -282,7 +330,7 @@ const stateV7 = z
     ...shared,
     makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
     timed: timed.optional(),
-    meetup: meetup.optional(),
+    meetup: meetupV9.optional(),
     train: trainV8.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
@@ -297,7 +345,7 @@ const stateV6 = z
     v: z.literal(6),
     ...shared,
     timed: timed.optional(),
-    meetup: meetup.optional(),
+    meetup: meetupV9.optional(),
     train: trainV8.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
@@ -315,7 +363,7 @@ const stateV5 = z
     v: z.literal(5),
     ...shared,
     timed: timed.optional(),
-    meetup: meetup.optional(),
+    meetup: meetupV9.optional(),
     train: trainV5.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
@@ -330,7 +378,7 @@ const stateV4 = z
     v: z.literal(4),
     ...shared,
     timed: timed.optional(),
-    meetup: meetup.optional(),
+    meetup: meetupV9.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
   })
@@ -383,14 +431,27 @@ function withAtEnd<T extends { train?: z.output<typeof trainV8> | undefined }>(o
   return old.train ? { ...old, train: { ...old.train, atEnd: 'finish' as const } } : old;
 }
 
+/** A meetup of a document before version 10 has no place. */
+function withPlace<T extends { meetup?: z.output<typeof meetupV9> | undefined }>(old: T) {
+  return old.meetup ? { ...old, meetup: { ...old.meetup, place: null } } : old;
+}
+
 /** Reads a stored document of any version this code knows, as the current version. */
 function readState(stored: unknown) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
   if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
+  const older = readStateV9(stored, version);
+  if (!older.success) return older;
+  return state.safeParse({ ...withPlace(older.data), v: PARTY_STATE_VERSION });
+}
+
+/** Reads a document of versions 1 to 9, upgraded to the shape of version 9. */
+function readStateV9(stored: unknown, version: unknown) {
+  if (version === 9) return stateV9.safeParse(stored);
   const older = readStateV8(stored, version);
   if (!older.success) return older;
-  return state.safeParse({ ...withAtEnd(older.data), v: PARTY_STATE_VERSION });
+  return stateV9.safeParse({ ...withAtEnd(older.data), v: 9 });
 }
 
 /** Reads a document of versions 1 to 8, upgraded to the shape of version 8. */
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 940c9bd47ad725688b919f58d44c265e85e8621d..cb122cfff4264c11da40add6036b75a2a6306c41 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -1,3 +1,4 @@
+import type { Place } from '../geo/place.js';
 import type { RaidTier } from '../pogo/raid-tier.js';
 import { PartyStatus } from './status.js';
 
@@ -243,8 +244,17 @@ export interface TimedDetails {
 export interface MeetupDetails {
   /** What the members wrote about it (`/info`), at most `MAX_MEETUP_DESCRIPTION` characters. */
   description: string | null;
+  /**
+   * Where it is, set once when it is made (`/meetup near:`; Matt, 2026-10-17): a gym, PokéStop or power
+   * spot as it was when it was named (a snapshot; the post shows it as it is now while it is
+   * still the same place, `shownPlace`), or a pin; null for none.
+   */
+  place: MeetupPlace | null;
 }
 
+/** The place of a meetup: a gym, PokéStop or power spot as it was named, or a pin. */
+export type MeetupPlace = Place;
+
 /** A meetup is at no gym and hatches from nothing; its `endTime` is when it ends. */
 export interface MeetupParty extends PartyCore {
   type: 'meetup';
diff --git a/src/render/place.ts b/src/render/place.ts
index 38f3ecd0b7343f76230df038264fd9b0d94d979f..484afa385981d3bf2ef6968d9633ac061a485380 100644
--- a/src/render/place.ts
+++ b/src/render/place.ts
@@ -10,18 +10,12 @@ export const PLACE_KIND_WORDS: Readonly<Record<PlaceKind, string>> = {
 };
 
 /**
- * A pin in one line (Matt, 2026-10-17): by its `label` when there is one (a meetup's `where`
- * text), else the place it is near (`📍 Near **Fountain Square** (PokéStop)`), else the name its
- * link gave, else `📍 Dropped pin`; then its Map. `text` makes what a member or a link wrote safe
+ * A pin in one line (Matt, 2026-10-17): by the place it is near (`📍 Near **Fountain Square**
+ * (PokéStop)`), else the name its link gave, else `📍 Dropped pin`; then its Map. `text` makes what a member or a link wrote safe
  * where it is shown (`plain`, `plainNoLinks`).
  */
-export function pinLine(
-  pin: DroppedPin,
-  label: string | null,
-  text: (raw: string) => string,
-): string {
+export function pinLine(pin: DroppedPin, text: (raw: string) => string): string {
   const map = mapMarkdown(pin);
-  if (label !== null && label !== '') return `📍 **${text(label)}** · ${map}`;
   if (pin.near) {
     return `📍 Near **${text(pin.near.title)}** (${PLACE_KIND_WORDS[pin.near.kind]}) · ${map}`;
   }
@@ -29,6 +23,26 @@ export function pinLine(
   return `📍 Dropped pin · ${map}`;
 }
 
+/**
+ * Where a meetup is in a few words, without markdown of its own (a direct message): `Near
+ * Fountain Square (PokéStop)`, a pin as `a pin near Fountain Square (PokéStop)`, else the name
+ * its link gave, else `a dropped pin`; undefined without a place. `text` makes what a member or
+ * a link wrote safe where it is shown.
+ */
+export function placeSummary(
+  place: Place | null,
+  text: (raw: string) => string,
+): string | undefined {
+  if (place === null) return undefined;
+  if (place.kind === 'pin') {
+    if (place.near) {
+      return `a pin near ${text(place.near.title)} (${PLACE_KIND_WORDS[place.near.kind]})`;
+    }
+    return place.linkName === null ? 'a dropped pin' : text(place.linkName);
+  }
+  return `Near ${text(place.title)} (${PLACE_KIND_WORDS[place.kind]})`;
+}
+
 /** The picture of a place as it was named; none for a pin. */
 export function placeImage(place: Place | undefined): string | null {
   return place === undefined || place.kind === 'pin' ? null : place.image;
diff --git a/src/render/spawn.ts b/src/render/spawn.ts
index 138ec3ecb4f7bd34febab653a4df587cc0981b81..6c18186cb4e134e915e8bdde962814049259d17e 100644
--- a/src/render/spawn.ts
+++ b/src/render/spawn.ts
@@ -50,11 +50,11 @@ const NO_PLACE_ADDRESS = '(no address available)';
  * `Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood · [Map](<…>)`: the title and
  * the address made plain without links (they reach other members' direct messages; a place
  * without an address says so, so that its picture never sits beside a bare name), the kind, and
- * the place's maps link. A pin is `pinLine` without a label (the report's details are its own
- * line): `📍 Near **Fountain Square** (PokéStop) · [Map](<…>)`, `📍 Dropped pin · [Map](<…>)`.
+ * the place's maps link. A pin is `pinLine` (the report's details are its own line):
+ * `📍 Near **Fountain Square** (PokéStop) · [Map](<…>)`, `📍 Dropped pin · [Map](<…>)`.
  */
 export function nearLine(place: SpawnPlace): string {
-  if (place.kind === 'pin') return pinLine(place, null, plainNoLinks);
+  if (place.kind === 'pin') return pinLine(place, plainNoLinks);
   const address = place.address === null || place.address === '' ? '' : plainNoLinks(place.address);
   return (
     `Near **${plainNoLinks(place.title)}** (${PLACE_KIND_WORDS[place.kind]}) · ` +
````

### Task 7: Plan 8D T7: Meetups: the place in the post, /meetup near:

Prototype commit: `d27f9188ee4ce21c37f1269f98de8cee8c9da93f`

A meetup's post says where it is under **Where**, after its heading block
and before Meeting Information: a gym, PokeStop or power spot as /wild's
report says one ("Near **X** (PokeStop) · address · [Map]", "(no address
available)" beside a picture alone), then a gym's notice, with the
place's picture beside them; a pin as "📍 Near **X** (kind)",
"📍 **<link's name>**" or "📍 Dropped pin" with its Map; nothing without
a place (what more there is to say goes under Meeting Information). The
place is shown as it is now while it is the same place (shownPlace: the
gym or the kept Wayspot by id, of the same kind, within PLACE_MOVE_METRES
25 m of the snapshot), else as it was named; the snapshot is never
rewritten. A gym edit shows the meetups at that gym anew
(GymUpkeep.showAnew), and a load of the kept Wayspots those near a
PokeStop or power spot (PartyService over WayspotProvider.whenChanged).

The DM brief of a meetup has its place in one line with the Map of its
point, and the plain-text DM of a start time ends with "Where: ...", the
place as the post shows it now (PartyService.placeOf). /meetup takes near
(autocomplete as /wild's, a maps link or coordinates a pin), refused
before the limit counts; the place is set once, when the meetup is made,
and never changes (Matt, 2026-10-17). /location stays for raids alone.

**Files:**

```
 src/app.ts                                  |   1 +
 src/commands/meetups/meetup.test.ts         |  89 +++++++++++++++++++++++++++++++++++++
 src/commands/meetups/meetup.ts              |  66 +++++++++++++++++++++++-----
 src/domain/geo/place.test.ts                |  36 +++++++++++++++
 src/domain/geo/place.ts                     |  18 ++++++++
 src/render/meetup-post.test.ts              | 163 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/render/meetup-post.ts                   | 155 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/render/notify-dm.ts                     |   7 ++-
 src/render/place.ts                         |  23 ++++++----
 src/services/gym-upkeep.test.ts             |  34 ++++++++++++--
 src/services/gym-upkeep.ts                  |   7 ++-
 src/services/notify-service.parties.test.ts |  42 +++++++++++++++++-
 src/services/notify-service.ts              |  14 +++++-
 src/services/party-service.meetup.test.ts   |  45 +++++++++++++++++++
 src/services/party-service.ts               |  64 +++++++++++++++++++++++++--
 15 files changed, 724 insertions(+), 40 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/meetups/meetup.test.ts src/domain/geo/place.test.ts src/render/meetup-post.test.ts src/services/gym-upkeep.test.ts src/services/notify-service.parties.test.ts src/services/party-service.meetup.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d27f9188ee4ce21c37f1269f98de8cee8c9da93f -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T7: Meetups: the place in the post, /meetup near:`, the body above and the trailer, staging exactly
  `src/app.ts src/commands/meetups/meetup.test.ts src/commands/meetups/meetup.ts src/domain/geo/place.test.ts src/domain/geo/place.ts src/render/meetup-post.test.ts src/render/meetup-post.ts src/render/notify-dm.ts src/render/place.ts src/services/gym-upkeep.test.ts src/services/gym-upkeep.ts src/services/notify-service.parties.test.ts src/services/notify-service.ts src/services/party-service.meetup.test.ts src/services/party-service.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index cdf5847a38c2fb304659d53d216fb7ec6aeb5251..8b8c589d7707c34f3aee379a916e12963c22b49c 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -297,6 +297,7 @@ export async function startApp(
   const users = new UserRepository(db, rowIds);
   const savedRoutes = new SavedRouteRepository(db);
   const partyService = new PartyService({
+    wayspots,
     store: parties,
     gateway: partyGateway,
     regions,
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index fa9c3ff1074d2ff7e30648c28289293c1ab5ff8a..be9a66cd00a78921beff285ab94fd18a4fcdc907 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -22,6 +22,8 @@ import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { commands } from '../index.js';
 import { FROM_A_REGION, meetup, MEETUP_THROTTLE } from './meetup.js';
 import { textDisplays } from '../../../test/support/messages.js';
+import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../../test/support/wayspots.js';
 
 const RAID_POST = '300000000000000055';
 
@@ -196,6 +198,93 @@ describe('/meetup', () => {
     expect(await made.answer('Third')).toMatch(/^You can use \/meetup again/);
   });
 
+  it('makes a meetup near a gym, PokéStop or power spot, or at a pin', async () => {
+    const made = await setup();
+    await made.run('Picnic', { options: { name: 'Picnic', near: 'gym:2' } });
+    expect(made.meetups()[0]?.meetup).toEqual({
+      description: null,
+      place: {
+        kind: 'gym',
+        id: '2',
+        title: 'Old Stone Fountain',
+        lat: 40.06,
+        lon: -80.06,
+        address: '12 Market Street, Pinewood, Pennsylvania 15999',
+        image: null,
+      },
+    });
+    const postId = made.meetups()[0]?.forumPostId ?? '';
+    expect(textDisplays(made.gateway.posts.get(postId)?.message)[1]).toMatch(
+      /^\*\*Where\*\*\nNear \*\*Old Stone Fountain\*\* \(gym\) · /,
+    );
+    await made.run('Lake picnic', { options: { name: 'Lake picnic', near: '40.02, -80.02' } });
+    const lake = made.meetups().find((party) => party.timed.name === 'Lake picnic');
+    expect(lake?.meetup.place).toMatchObject({ kind: 'pin', lat: 40.02 });
+  });
+
+  it('keeps a place without a picture or an address as having none', async () => {
+    const { wayspots } = await wayspotsWith([
+      keptRow(1, { title: 'Fountain Square', lat: 40.0601, lon: -80.0601, image: '', address: '' }),
+    ]);
+    const made = await setup({ wayspots });
+    await made.run('Picnic', { options: { name: 'Picnic', near: `stop:${wayspotId(1)}` } });
+    expect(made.meetups()[0]?.meetup.place).toMatchObject({ image: null, address: null });
+  });
+
+  it('takes no Wayspot without a title, picked or typed by its street, and makes no meetup', async () => {
+    const { wayspots } = await wayspotsWith([
+      keptRow(1, {
+        title: ' ',
+        lat: 40.0601,
+        lon: -80.0601,
+        address: '16 Maple Avenue, Pinewood, PA 15999, USA',
+      }),
+    ]);
+    const made = await setup({ wayspots });
+    await made.ctx.placeFinder.built();
+    const refusal = (near: string) => made.answer('Picnic', { options: { name: 'Picnic', near } });
+    expect(await refusal(`stop:${wayspotId(1)}`)).toBe(
+      'That place is gone from the list; pick it again.',
+    );
+    // Typed by its street, it is not among the places offered (a gym on that street is).
+    const typed = await refusal('16 Maple Avenue');
+    expect(typed).toMatch(/^Which place is "16 Maple Avenue"\?/);
+    expect(typed).not.toMatch(/(?:: |, | or )\(PokéStop\)/);
+    expect(made.meetups()).toEqual([]);
+  });
+
+  it('names a gym as its post does, by its nickname', async () => {
+    const made = await setup();
+    await made.run('Picnic', { options: { name: 'Picnic', near: 'gym:1' } });
+    expect(made.meetups()[0]?.meetup.place).toMatchObject({ kind: 'gym', title: 'The Stacks' });
+  });
+
+  it('refuses a place it cannot take, without counting it', async () => {
+    const made = await setup();
+    const refusal = (options: Record<string, string>) =>
+      made.answer('Picnic', { options: { name: 'Picnic', ...options } });
+    expect(await refusal({ near: 'https://maps.app.goo.gl/AbC123xyz' })).toMatch(
+      /^I do not follow short links\./,
+    );
+    expect(await refusal({ near: 'qwxzy' })).toBe(
+      'I know no gym, PokéStop or power spot called "qwxzy" here. Pick one from the list that ' +
+        'appears while you type, or leave `near` out and say where with `/info` in its post.',
+    );
+    expect(await refusal({ near: 'https://www.google.com/maps/search/coffee' })).toMatch(
+      /^That link shows no one place/,
+    );
+    expect(made.meetups()).toEqual([]);
+    await made.run('First');
+    await made.run('Second');
+    expect(made.meetups()).toHaveLength(MEETUP_THROTTLE.uses);
+  });
+
+  it('says in its help that near says where it is, once and for good', () => {
+    expect(meetup.help.details).toContain('`near`');
+    expect(meetup.help.details).toContain('cannot be changed afterwards');
+    expect(meetup.help.examples).toContain('/meetup name:Trade evening near:Fountain Square');
+  });
+
   it('refuses a name of nothing that can be seen', async () => {
     const made = await setup();
     expect(await made.answer('\u200b\u200b')).toBe('Give a name of 1 to 80 characters.');
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index d0b465cf4dfbb522f0effb29c3edd34033635166..f6d60eb45e73ed72d29c9fc320c7300360547e42 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -1,5 +1,5 @@
 import { SlashCommandBuilder } from 'discord.js';
-import type { SimpleCommand } from '../../discord/command.js';
+import type { Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
@@ -7,6 +7,7 @@ import type { Throttle } from '../../discord/throttle.js';
 import { MAX_PARTY_NAME } from '../../domain/party/party.js';
 import { NO_POST_MADE, problemText } from '../../render/activity.js';
 import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
+import { MAX_PLACE_TEXT, namedPlace, nearChoices } from '../place-option.js';
 
 /** Where `/meetup` works, said wherever it does not. */
 export const FROM_A_REGION = 'Create a meetup from a region channel.';
@@ -14,17 +15,30 @@ export const FROM_A_REGION = 'Create a meetup from a region channel.';
 /** As the legacy bot allowed: a meetup is a post that stays for days. */
 export const MEETUP_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };
 
+/** What a refusal of a place nobody can find offers instead. */
+const OR_INFO = 'or leave `near` out and say where with `/info` in its post';
+
 /**
  * `/meetup` is used in the text channel of a region, or in a post of its forum that is no
  * party, and the meetup then belongs to that region (`requirePlaceForNew`).
  */
 const requireMeetupPlace = requirePlaceForNew('meetup', FROM_A_REGION);
 
+/**
+ * Where the meetup is, refused before it is made so that a use that came to nothing does not
+ * count: a `near` that names no place it can take (`namedPlace`).
+ */
+const requireMeetupNear: Guard = async (interaction, ctx) => {
+  if (!interaction.isChatInputCommand()) return;
+  await namedPlace(interaction, ctx, interaction.options.getString('near'), OR_INFO);
+};
+
 /**
  * `/meetup` (spec 4.2): a meetup with a post of its own in the forum of the region it is made
- * in. It starts with its name and nothing else; its times and what there is to say about it are
- * set in its post (`/meet`, `/end`, `/info`). Who makes it is signed up as interested, and
- * named.
+ * in. It starts with its name, and where it is when the member says (`near`: a gym, PokéStop or
+ * power spot, or a pin from a maps link or coordinates; Matt, 2026-10-17): set once, here, and
+ * never changed afterwards. Its times and what there is to say about it are set in its post
+ * (`/meet`, `/end`, `/info`). Who makes it is signed up as interested, and named.
  */
 export const meetup: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -36,31 +50,53 @@ export const meetup: SimpleCommand = {
         .setDescription('What to call it, such as "Community Day picnic"')
         .setRequired(true)
         .setMaxLength(MAX_PARTY_NAME),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('near')
+        .setDescription(
+          'A gym, PokéStop or power spot it is near (pick from the list), or a maps link',
+        )
+        .setMaxLength(MAX_PLACE_TEXT)
+        .setAutocomplete(true),
     ),
   help: {
     category: 'meetup',
     details:
       'For anything that is not a raid at one gym: a Community Day in the park, a trade ' +
       'evening. Use it in the channel of a region; the meetup gets a post in the forum of that ' +
-      'region, and you are marked as interested. In the post, set when it starts with `/meet` ' +
-      'and when it ends with `/end`, say more about it with `/info`, and rename it with ' +
-      '`/name`. Members sign up with the buttons, as for a raid. A meetup is archived an hour ' +
-      'after it is over: after its end, or without one a day after its start. One without any ' +
-      'time goes a day after it was made, or after its last time was removed; its post says ' +
-      'when.',
-    examples: ['/meetup name:Community Day picnic'],
+      'region, and you are marked as interested. `near` says the gym, PokéStop or power spot ' +
+      'it is near (pick one from the list that appears while you type), or a place you paste ' +
+      'as a link from a maps app or as coordinates. The post shows the place with a map link; ' +
+      'it is set here and cannot be changed afterwards. In the post, set ' +
+      'when it starts with `/meet` and when it ends with `/end`, say more about it with ' +
+      '`/info`, and rename it with `/name`. Members sign up with the buttons, as for a raid. A ' +
+      'meetup is archived an hour after it is over: after its end, or without one a day after ' +
+      'its start. One without any time goes a day after it was made, or after its last time ' +
+      'was removed; its post says when.',
+    examples: [
+      '/meetup name:Community Day picnic',
+      '/meetup name:Trade evening near:Fountain Square',
+    ],
   },
-  guards: [requireGuild, requireMeetupPlace],
+  guards: [requireGuild, requireMeetupPlace, requireMeetupNear],
   defer: 'ephemeral',
   throttle: MEETUP_THROTTLE,
   async execute(interaction, ctx) {
     const regionChannelId = regionChannelOf(interaction, ctx);
     if (regionChannelId === undefined) throw new UserError(FROM_A_REGION);
+    const place = await namedPlace(
+      interaction,
+      ctx,
+      interaction.options.getString('near'),
+      OR_INFO,
+    );
     const outcome = await ctx.partyService.createMeetup({
       name: interaction.options.getString('name', true),
       creatorId: interaction.user.id,
       creator: memberInfo(interaction),
       regionChannelId,
+      ...(place === undefined ? {} : { place }),
     });
     // The guard has looked at all of these; what follows is for what changed in between.
     switch (outcome.kind) {
@@ -83,4 +119,10 @@ export const meetup: SimpleCommand = {
       }
     }
   },
+  async autocomplete(interaction, ctx) {
+    const focused = interaction.options.getFocused(true);
+    await interaction.respond(
+      focused.name === 'near' ? await nearChoices(interaction, ctx, focused.value) : [],
+    );
+  },
 };
diff --git a/src/domain/geo/place.test.ts b/src/domain/geo/place.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..94bc1023e5ffa3dddcbddab460731dfbe435b2bf
--- /dev/null
+++ b/src/domain/geo/place.test.ts
@@ -0,0 +1,36 @@
+import { describe, expect, it } from 'vitest';
+import { PLACE_MOVE_METRES, shownPlace, type KnownPlace } from './place.js';
+
+/** A PokéStop as a meetup kept it when it was named. */
+const SNAPSHOT: KnownPlace = {
+  kind: 'stop',
+  id: '0123456789abcdef0123456789abcdef.16',
+  title: 'Fountain Square',
+  lat: 40.06,
+  lon: -80.06,
+  address: '20 Market Street',
+  image: null,
+};
+
+/** A thousandth of a degree of latitude is about 111 metres. */
+const METRES = 1 / 111_000;
+
+describe('shownPlace', () => {
+  it('shows the place as it is now while it is the same place: renamed, a new picture', () => {
+    const now = {
+      ...SNAPSHOT,
+      title: 'Fountain Square Park',
+      image: 'https://lh3.googleusercontent.com/new',
+      address: '22 Market Street',
+      lat: SNAPSHOT.lat + 20 * METRES,
+    };
+    expect(shownPlace(SNAPSHOT, now)).toBe(now);
+    expect(PLACE_MOVE_METRES).toBe(25);
+  });
+
+  it('shows the place as it was named once it is gone, moved farther, or of another kind', () => {
+    expect(shownPlace(SNAPSHOT, undefined)).toBe(SNAPSHOT);
+    expect(shownPlace(SNAPSHOT, { ...SNAPSHOT, lat: SNAPSHOT.lat + 30 * METRES })).toBe(SNAPSHOT);
+    expect(shownPlace(SNAPSHOT, { ...SNAPSHOT, kind: 'powerspot' })).toBe(SNAPSHOT);
+  });
+});
diff --git a/src/domain/geo/place.ts b/src/domain/geo/place.ts
index eff32de75e50e06e676a6e17231ff1bb6228d07d..a8f4739b3f226066d0a7001bcc78e4ce1bdeaff3 100644
--- a/src/domain/geo/place.ts
+++ b/src/domain/geo/place.ts
@@ -1,4 +1,5 @@
 import type { PlaceKind } from '../search/place-merge.js';
+import { metresBetween } from './distance.js';
 
 /**
  * A gym, PokéStop or power spot as a member named it (`/wild near:`, a meetup's place): its kind
@@ -35,3 +36,20 @@ export type Place = KnownPlace | DroppedPin;
 
 /** A pin is named by the nearest place at most this far away (Matt, 2026-10-17). */
 export const PIN_NEAR_METRES = 50;
+
+/**
+ * A place that moved at most this far is still the place it was named as (as an import's
+ * `REFETCH_METRES`): farther, it is no longer where the members agreed to meet.
+ */
+export const PLACE_MOVE_METRES = 25;
+
+/**
+ * What a meetup shows of the place it was named at (Matt, 2026-10-17): the place as it is `now`
+ * (a rename, a new picture, an address show) while it still exists as the same kind within
+ * `PLACE_MOVE_METRES` of where it was named; the snapshot once it is gone, of another kind or
+ * moved farther. The snapshot itself is never rewritten.
+ */
+export function shownPlace(snapshot: KnownPlace, now: KnownPlace | undefined): KnownPlace {
+  if (now === undefined || now.kind !== snapshot.kind) return snapshot;
+  return metresBetween(snapshot, now) <= PLACE_MOVE_METRES ? now : snapshot;
+}
diff --git a/src/render/meetup-post.test.ts b/src/render/meetup-post.test.ts
index ffae2725eefa589850ee951a2c94b5b19624755a..880bff8639d28608c97dc8f3d90ef4ce2d6b25bf 100644
--- a/src/render/meetup-post.test.ts
+++ b/src/render/meetup-post.test.ts
@@ -8,8 +8,11 @@ import {
   componentCount,
   textDisplays,
   textOf,
+  thumbnailBeside,
   thumbnailOf,
+  thumbnailsOf,
 } from '../../test/support/messages.js';
+import { keptRow } from '../../test/support/wayspot-cases.js';
 import {
   ALICE,
   at,
@@ -24,8 +27,15 @@ import {
   withAttendees,
 } from '../../test/support/parties.js';
 import { decodeCustomId } from '../discord/custom-id.js';
+import type { DroppedPin, KnownPlace } from '../domain/geo/place.js';
 import { setDescription } from '../domain/party/meetup.js';
-import { endParty, type Attendee, type MeetupParty } from '../domain/party/party.js';
+import type { Wayspot } from '../domain/wayspots/kept.js';
+import {
+  endParty,
+  type Attendee,
+  type MeetupParty,
+  type MeetupPlace,
+} from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { meetupTags, meetupTitle, renderMeetupPost, type MeetupPostView } from './meetup-post.js';
 import {
@@ -37,7 +47,7 @@ import {
   TEXT_BUDGET,
   type RenderedPost,
 } from './party-post.js';
-import { renderRaidPost } from './raid-post.js';
+import { renderRaidPost, type PostGym } from './raid-post.js';
 import { LIMITS } from './text.js';
 
 const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
@@ -374,6 +384,155 @@ describe('the information of a meetup post', () => {
   });
 });
 
+describe('the Where of a meetup post', () => {
+  const MAPS = (lat: number, lon: number) =>
+    `[Map](<https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}>)`;
+  const STOP: KnownPlace = {
+    kind: 'stop',
+    id: '0123456789abcdef0123456789abcdef.16',
+    title: 'Fountain Square',
+    lat: 40.0601,
+    lon: -80.0601,
+    address: '20 Market Street, Pinewood',
+    image: 'https://lh3.googleusercontent.com/square',
+  };
+  const [, fountain] = testGyms();
+  const GYM: KnownPlace = {
+    kind: 'gym',
+    id: '2',
+    title: 'Old Stone Fountain',
+    lat: 40.06,
+    lon: -80.06,
+    address: '12 Market Street, Pinewood, Pennsylvania 15999',
+    image: null,
+  };
+  const pin = (near: DroppedPin['near'], linkName: string | null): DroppedPin => ({
+    kind: 'pin',
+    lat: 40.02,
+    lon: -80.02,
+    near,
+    linkName,
+  });
+
+  /** The test meetup made at this place. */
+  function placed(place: MeetupPlace | null): MeetupParty {
+    return testMeetup({ place });
+  }
+  const whereOf = (party: MeetupParty, extra: Partial<MeetupPostView> = {}) =>
+    block(renderMeetupPost(view(party, extra)), '**Where**');
+
+  it('says where a meetup near a PokéStop is, with its picture beside', () => {
+    const post = renderMeetupPost(view(described('Bring trade lists.', placed(STOP))));
+    // After the heading block, before what the meetup is for.
+    expect(textDisplays(post.message).slice(1, 3)).toEqual([
+      `**Where**\nNear **Fountain Square** (PokéStop) · 20 Market Street, Pinewood · ${MAPS(40.0601, -80.0601)}`,
+      '**Meeting Information**\nBring trade lists.',
+    ]);
+    expect(thumbnailBeside(post.message, '**Where**')).toBe(
+      'https://lh3.googleusercontent.com/square=s400',
+    );
+    expectSendable(post);
+  });
+
+  it('shows a gym or Wayspot as it is now while it is the same place, as it was named otherwise', () => {
+    const now: PostGym = {
+      ...fountain!,
+      name: 'Old Stone *Fountain* Plaza',
+      notice: 'Closed on Mondays',
+      imageUrl: 'https://lh3.googleusercontent.com/plaza',
+    };
+    const atGym = placed(GYM);
+    expect(whereOf(atGym, { gym: (id) => (id === 2 ? now : undefined) })).toBe(
+      `**Where**\nNear **Old Stone \\*Fountain\\* Plaza** (gym) · 12 Market Street, Pinewood, Pennsylvania 15999 · ${MAPS(40.06, -80.06)}\nClosed on Mondays`,
+    );
+    // Gone, or moved more than 25 metres: the place where the members agreed to meet.
+    const snapshot = `**Where**\nNear **Old Stone Fountain** (gym) · 12 Market Street, Pinewood, Pennsylvania 15999 · ${MAPS(40.06, -80.06)}`;
+    expect(whereOf(atGym, { gym: () => undefined })).toBe(snapshot);
+    expect(whereOf(atGym, { gym: () => ({ ...now, lat: 40.061 }) })).toBe(snapshot);
+    expect(whereOf(atGym)).toBe(snapshot);
+    // A kept Wayspot likewise.
+    const renamed: Wayspot = {
+      ...keptRow(16, { title: 'Fountain Square Park', lat: STOP.lat, lon: STOP.lon }),
+      id: STOP.id,
+      firstSeen: 0,
+      lastSeen: 0,
+    };
+    expect(
+      whereOf(placed(STOP), { wayspot: (id) => (id === STOP.id ? renamed : undefined) }),
+    ).toMatch(/^\*\*Where\*\*\nNear \*\*Fountain Square Park\*\* \(PokéStop\) · 16 Main St/);
+  });
+
+  it('says a pin by the place it is near, else its link’s name, else as dropped', () => {
+    expect(whereOf(placed(pin({ kind: 'stop', title: 'Fountain Square' }, 'Blue Tent')))).toBe(
+      `**Where**\n📍 Near **Fountain Square** (PokéStop) · ${MAPS(40.02, -80.02)}`,
+    );
+    expect(whereOf(placed(pin(null, 'Blue Tent')))).toBe(
+      `**Where**\n📍 **Blue Tent** · ${MAPS(40.02, -80.02)}`,
+    );
+    expect(whereOf(placed(pin(null, null)))).toBe(
+      `**Where**\n📍 Dropped pin · ${MAPS(40.02, -80.02)}`,
+    );
+    expect(thumbnailsOf(renderMeetupPost(view(placed(pin(null, null)))).message)).toEqual([]);
+  });
+
+  it('says nothing without a place: the information says where', () => {
+    expect(whereOf(described('Picnic shelter 3 in Frick Park'))).toBeUndefined();
+  });
+
+  it('says that a place beside its picture has no address, and only there', () => {
+    const post = renderMeetupPost(view(placed({ ...STOP, address: null })));
+    expect(block(post, '**Where**')).toBe(
+      `**Where**\nNear **Fountain Square** (PokéStop) · (no address available) · ${MAPS(40.0601, -80.0601)}`,
+    );
+    expect(textDisplays(postMessage(post.layout, { picture: false }))).toContain(
+      `**Where**\nNear **Fountain Square** (PokéStop) · ${MAPS(40.0601, -80.0601)}`,
+    );
+  });
+
+  it('gives a direct message the place in one line, without links, and its map', () => {
+    const brief = (party: MeetupParty) => renderMeetupPost(view(party)).brief;
+    expect(brief(placed(STOP))).toEqual({
+      accent: 0x3498db,
+      lines: [
+        '**Meetup: Community Day picnic**',
+        NO_TIME,
+        'Near **Fountain Square** (PokéStop) · 20 Market Street, Pinewood',
+        '1 trainer',
+      ],
+      map: 'https://www.google.com/maps/search/?api=1&query=40.0601%2C-80.0601',
+    });
+    expect(brief(placed(pin(null, 'see https://evil.example')))).toMatchObject({
+      lines: [expect.any(String), NO_TIME, '📍 **see https:\u200b//evil.example**', '1 trainer'],
+      map: 'https://www.google.com/maps/search/?api=1&query=40.02%2C-80.02',
+    });
+    expect(brief(testMeetup())).not.toHaveProperty('map');
+    expect(brief(testMeetup()).lines).toHaveLength(3);
+  });
+
+  it('stays a message Discord takes with the longest place and information', () => {
+    const longest: KnownPlace = {
+      ...STOP,
+      title: '*'.repeat(255),
+      address: '<'.repeat(255),
+      image: `https://lh3.googleusercontent.com/${'p'.repeat(200)}`,
+    };
+    const base = described('<'.repeat(1000), placed(longest));
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 400; n++) {
+      crowd[`300000000000${String(n).padStart(6, '0')}`] = {
+        number: 5,
+        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
+      };
+    }
+    const rendered = renderMeetupPost(view(withAttendees({ ...base, saved: true }, crowd)));
+    expectSendable(rendered);
+    for (const place of [pin({ kind: 'gym', title: '*'.repeat(255) }, null), null]) {
+      const other = { ...base, meetup: { ...base.meetup, place } };
+      expectSendable(renderMeetupPost(view(withAttendees(other, crowd))));
+    }
+  });
+});
+
 describe('the trainers of a meetup post', () => {
   it('lists them by status as a raid does, with head counts, remote and teams', () => {
     const meetup = withAttendees(testMeetup(), {
diff --git a/src/render/meetup-post.ts b/src/render/meetup-post.ts
index 0512640928aede5989cc714f5a176965d443e4ad..9ec79cab1250affc6b65982e0fa97a90a9e7872a 100644
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -1,7 +1,8 @@
-import { memberOf, type MeetupParty } from '../domain/party/party.js';
+import { memberOf, type MeetupParty, type MeetupPlace } from '../domain/party/party.js';
 import { nameOf } from '../domain/party/timed.js';
 import { bottomControls } from './party-controls.js';
 import {
+  cutText,
   ENDED_COLOUR,
   fittedLayout,
   KEPT_OPEN,
@@ -9,16 +10,157 @@ import {
   tidyTitle,
   trainerBlocks,
   trainerCount,
+  type Fit,
   type ForumTag,
   type PartyBrief,
+  type PostBlock,
   type PostLayout,
   type RenderedPost,
 } from './party-post.js';
-import { LIMITS, memberByName, plain, plainLines, truncate } from './text.js';
+import { addressLine } from '../domain/geo/google.js';
+import { shownPlace, type KnownPlace } from '../domain/geo/place.js';
+import { wayspotAddressLine } from '../domain/geo/wayfarer-address.js';
+import { wayspotPicture } from '../domain/wayspots/picture.js';
+import type { Wayspot } from '../domain/wayspots/kept.js';
+import { PLACE_KIND_WORDS, pinLine } from './place.js';
+import {
+  gymMapsUrl,
+  gymName,
+  LOCATION_ROOM,
+  mapMarkdown,
+  placeSection,
+  WHERE_HEADING,
+  type PostGym,
+} from './raid-post.js';
+import { LIMITS, memberByName, plain, plainLines, plainNoLinks, truncate } from './text.js';
 import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';
 
-/** What the post of a meetup is rendered from (see `TimedPostView`). */
-export type MeetupPostView = TimedPostView<MeetupParty>;
+/**
+ * What the post of a meetup is rendered from (see `TimedPostView`), with where the place of the
+ * meetup is now: the gym with an id (the gyms of the bot) and the kept Wayspot with an id
+ * (`ctx.wayspots`), each undefined when it is gone. Without them the place is shown as it was
+ * named.
+ */
+export interface MeetupPostView extends TimedPostView<MeetupParty> {
+  gym?: (id: number) => PostGym | undefined;
+  wayspot?: (id: string) => Wayspot | undefined;
+}
+
+/** A known place as it is shown: the place, and the notice of a gym as it is now. */
+interface ShownPlace {
+  place: KnownPlace;
+  notice: string | null;
+}
+
+/**
+ * The place of a meetup as its post shows it now (`placeNow`): what a direct message about it
+ * names, so that it says what the post says. Null without a place.
+ */
+export function meetupPlaceNow(view: MeetupPostView): MeetupPlace | null {
+  const { place } = view.party.meetup;
+  if (place === null || place.kind === 'pin') return place;
+  return placeNow(view, place).place;
+}
+
+/**
+ * The place a meetup was named at, as it is now while it is the same place (`shownPlace`: a
+ * rename, a new picture, address or notice show), else as it was named.
+ */
+function placeNow(view: MeetupPostView, snapshot: KnownPlace): ShownPlace {
+  let now: ShownPlace | undefined;
+  if (snapshot.kind === 'gym') {
+    const gym = /^\d+$/u.test(snapshot.id) ? view.gym?.(Number(snapshot.id)) : undefined;
+    if (gym) {
+      now = {
+        place: {
+          kind: 'gym',
+          id: snapshot.id,
+          title: gymName(gym),
+          lat: gym.lat,
+          lon: gym.lon,
+          address: addressLine(gym.geodata ?? null),
+          image: gym.imageUrl ?? null,
+        },
+        notice: gym.notice,
+      };
+    }
+  } else {
+    const wayspot = view.wayspot?.(snapshot.id);
+    if (wayspot) {
+      now = {
+        place: {
+          kind: wayspot.kind,
+          id: wayspot.id,
+          title: wayspot.title,
+          lat: wayspot.lat,
+          lon: wayspot.lon,
+          address: wayspotAddressLine(wayspot.address),
+          image: wayspot.image,
+        },
+        notice: null,
+      };
+    }
+  }
+  const shown = shownPlace(snapshot, now?.place);
+  return now !== undefined && shown === now.place ? now : { place: snapshot, notice: null };
+}
+
+/** `Near **Fountain Square** (PokéStop)`: a known place as the first words of its line. */
+function nearWords(place: KnownPlace, text: (raw: string) => string): string {
+  return `Near **${text(place.title)}** (${PLACE_KIND_WORDS[place.kind]})`;
+}
+
+/**
+ * Where the meetup is (Matt, 2026-10-17), under `**Where**` after its heading block: a gym,
+ * PokéStop or power spot as `nearLine` says it (`Near **<title>** (PokéStop) · <address> ·
+ * [Map](<…>)`, the address `NO_ADDRESS` beside a picture without one), then a gym's notice, with
+ * the place's picture beside them; a pin as `pinLine` says it. Nothing without a place: what
+ * more there is to say stands under "Meeting Information". A notice is cut through `fit.part`
+ * when the post is too long.
+ */
+function meetupWhere(view: MeetupPostView, fit: Fit): PostBlock[] {
+  const { place } = view.party.meetup;
+  if (place === null) return [];
+  if (place.kind === 'pin') {
+    return [{ type: 'text', content: `${WHERE_HEADING}\n${pinLine(place, plain)}` }];
+  }
+  const shown = placeNow(view, place);
+  const notice = shown.notice ? plainLines(shown.notice) : '';
+  return [
+    placeSection(fit, {
+      heading: WHERE_HEADING,
+      line: (address) =>
+        [
+          nearWords(shown.place, plain),
+          ...(address === '' ? [] : [address]),
+          mapMarkdown(shown.place),
+        ].join(' · '),
+      address: plain(shown.place.address ?? ''),
+      picture: wayspotPicture(shown.place.image),
+      under:
+        notice === '' ? [] : [fit.part((room) => cutText(notice, Math.min(room, LOCATION_ROOM)))],
+    }),
+  ];
+}
+
+/**
+ * The place of a meetup in one line for a direct message (the first line of its Where without
+ * its map, without links: `plainNoLinks`), and its point for the brief's Map; undefined without
+ * a place.
+ */
+function briefPlace(view: MeetupPostView): { line: string; map: string } | undefined {
+  const { place } = view.party.meetup;
+  if (place === null) return undefined;
+  if (place.kind === 'pin') {
+    return { line: pinLine(place, plainNoLinks, { map: false }), map: gymMapsUrl(place) };
+  }
+  const { place: shown } = placeNow(view, place);
+  const address = shown.address ? plainNoLinks(shown.address) : '';
+  return {
+    line: [nearWords(shown, plainNoLinks), ...(address === '' ? [] : [address])].join(' · '),
+    map: gymMapsUrl(shown),
+  };
+}
 
 /** `Meetup · Community Day picnic`: the title of the post, which is also how lists name it. */
 export function meetupTitle(party: MeetupParty): string {
@@ -61,6 +203,8 @@ function meetupLayout(view: MeetupPostView): PostLayout {
     blocks: [
       { type: 'text', content: header },
       { type: 'separator' },
+      ...meetupWhere(view, fit),
+      { type: 'separator' },
       ...(about === ''
         ? []
         : [{ type: 'text' as const, content: `**Meeting Information**\n${about}` }]),
@@ -82,13 +226,16 @@ function meetupLayout(view: MeetupPostView): PostLayout {
  */
 function meetupBrief(view: MeetupPostView): PartyBrief {
   const { party } = view;
+  const place = briefPlace(view);
   return {
     accent: colour(view),
     lines: [
       `**Meetup: ${plain(nameOf(party))}**`,
       view.closed ?? describeTimes(view),
+      ...(place === undefined ? [] : [place.line]),
       trainerCount(party),
     ],
+    ...(place?.map === undefined ? {} : { map: place.map }),
   };
 }
 
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index 9b8cb852ad7d25b275d8d7fcdcd84898f2b8b3a3..67c5656e179cced30ffe2f6b350f6f052dfb0176 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -232,16 +232,19 @@ export function meetingDmSentence(view: {
   time: string | null;
   heads: number;
   link: string;
+  /** Where a meetup is (`placeSummary`, without links), said last on a line of its own. */
+  place?: string | undefined;
 }): string {
+  const where = view.place === undefined ? '' : `\nWhere: ${view.place}`;
   const name = view.by === null ? undefined : memberName(view.by);
   if (view.time === null) {
     const done = view.what === 'meeting' ? 'cancelled' : 'removed';
     const by = name === undefined ? '' : ` (${done} by ${name})`;
-    return `No ${view.what} time any more for ${view.subject}${by}: ${view.link}`;
+    return `No ${view.what} time any more for ${view.subject}${by}: ${view.link}${where}`;
   }
   const by = name === undefined ? '' : ` (set by ${name})`;
   const verb = view.what === 'meeting' ? 'Meet' : 'Start';
-  return `${verb} at ${view.time} for ${view.subject}${by}. ${attending(view.heads)}: ${view.link}`;
+  return `${verb} at ${view.time} for ${view.subject}${by}. ${attending(view.heads)}: ${view.link}${where}`;
 }
 
 /** One reason a direct message came, as it is shown: its label, and the button that stops it. */
diff --git a/src/render/place.ts b/src/render/place.ts
index 484afa385981d3bf2ef6968d9633ac061a485380..f0497c2c55093b70e1243e9c0bad83b72d5d14a2 100644
--- a/src/render/place.ts
+++ b/src/render/place.ts
@@ -11,16 +11,21 @@ export const PLACE_KIND_WORDS: Readonly<Record<PlaceKind, string>> = {
 
 /**
  * A pin in one line (Matt, 2026-10-17): by the place it is near (`📍 Near **Fountain Square**
- * (PokéStop)`), else the name its link gave, else `📍 Dropped pin`; then its Map. `text` makes what a member or a link wrote safe
- * where it is shown (`plain`, `plainNoLinks`).
+ * (PokéStop)`), else the name its link gave, else `📍 Dropped pin`; then its Map, unless `map`
+ * is false (a direct message's brief, whose Map is a button). `text` makes what a member or a
+ * link wrote safe where it is shown (`plain`, `plainNoLinks`).
  */
-export function pinLine(pin: DroppedPin, text: (raw: string) => string): string {
-  const map = mapMarkdown(pin);
-  if (pin.near) {
-    return `📍 Near **${text(pin.near.title)}** (${PLACE_KIND_WORDS[pin.near.kind]}) · ${map}`;
-  }
-  if (pin.linkName !== null) return `📍 **${text(pin.linkName)}** · ${map}`;
-  return `📍 Dropped pin · ${map}`;
+export function pinLine(
+  pin: DroppedPin,
+  text: (raw: string) => string,
+  { map = true }: { map?: boolean } = {},
+): string {
+  const named = pin.near
+    ? `📍 Near **${text(pin.near.title)}** (${PLACE_KIND_WORDS[pin.near.kind]})`
+    : pin.linkName !== null
+      ? `📍 **${text(pin.linkName)}**`
+      : '📍 Dropped pin';
+  return map ? `${named} · ${mapMarkdown(pin)}` : named;
 }
 
 /**
diff --git a/src/services/gym-upkeep.test.ts b/src/services/gym-upkeep.test.ts
index 04e01ceb43db6f876bddc72a9e510c0217146ce1..bb34099d387eef15b85b8f89a726a88a83a0408f 100644
--- a/src/services/gym-upkeep.test.ts
+++ b/src/services/gym-upkeep.test.ts
@@ -3,7 +3,7 @@ import { watchEachTest } from '../../test/support/timers.js';
 import { FAKE_ADDRESS, FakeGeoGateway } from '../../test/support/geo.js';
 import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
 import { testGyms } from '../../test/support/gyms.js';
-import { testRaid, testTrain } from '../../test/support/parties.js';
+import { testMeetup, testRaid, testTrain } from '../../test/support/parties.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { metresBetween } from '../domain/geo/distance.js';
 import type { Party, TrainParty } from '../domain/party/party.js';
@@ -64,8 +64,36 @@ describe('GymUpkeep.gymChanged', () => {
     const raidElsewhere = testRaid({ id: '00000000-0000-4000-8000-000000000012', gymId: 3 });
     const trainThrough = onRoute(testTrain({ id: '00000000-0000-4000-8000-000000000013' }), [1, 2]);
     const trainElsewhere = onRoute(testTrain({ id: '00000000-0000-4000-8000-000000000014' }), [3]);
+    // A meetup at the gym shows it as it is now; one at another gym, or a pin, does not.
+    const place = {
+      title: 'Old Stone Fountain',
+      lat: 40.06,
+      lon: -80.06,
+      address: null,
+      image: null,
+    };
+    const meetupThere = testMeetup({
+      id: '00000000-0000-4000-8000-000000000015',
+      place: { kind: 'gym', id: '2', ...place },
+    });
+    const meetupElsewhere = testMeetup({
+      id: '00000000-0000-4000-8000-000000000016',
+      place: { kind: 'gym', id: '3', ...place },
+    });
+    const meetupAtStop = testMeetup({
+      id: '00000000-0000-4000-8000-000000000017',
+      place: { kind: 'stop', id: '2', ...place },
+    });
     const { upkeep, gyms, directory, changed } = await upkeepWith({
-      parties: [raidThere, raidElsewhere, trainThrough, trainElsewhere],
+      parties: [
+        raidThere,
+        raidElsewhere,
+        trainThrough,
+        trainElsewhere,
+        meetupThere,
+        meetupElsewhere,
+        meetupAtStop,
+      ],
     });
     await gyms.update(2, { notice: 'Closed for repairs' });
     expect(directory.get(2)?.notice).toBeNull();
@@ -74,7 +102,7 @@ describe('GymUpkeep.gymChanged', () => {
 
     expect(gym?.notice).toBe('Closed for repairs');
     expect(directory.get(2)?.notice).toBe('Closed for repairs');
-    expect(changed).toEqual([raidThere.id, trainThrough.id]);
+    expect(changed).toEqual([raidThere.id, trainThrough.id, meetupThere.id]);
   });
 
   it('answers undefined for a gym that is gone, and still tells the posts', async () => {
diff --git a/src/services/gym-upkeep.ts b/src/services/gym-upkeep.ts
index e4dfa097167b3c14c7e8125fc856565d51437821..534c4a2b34b0029d5c287284c25040e1ff258e72 100644
--- a/src/services/gym-upkeep.ts
+++ b/src/services/gym-upkeep.ts
@@ -174,7 +174,8 @@ export class GymUpkeep {
   /**
    * After anything about a gym changed (its texts, its flags, its place; also when it was added
    * or deleted): the directory reads it again, and every active party that shows it (a raid
-   * there, a train with it on its route) has its post rendered anew. Gives the gym as it is
+   * there, a train with it on its route, a meetup at it: `shownPlace`) has its post rendered
+   * anew. Gives the gym as it is
    * now; undefined when it is gone.
    */
   async gymChanged(id: number): Promise<Gym | undefined> {
@@ -189,7 +190,9 @@ export class GymUpkeep {
       for (const party of parties.active()) {
         const shows = isRaid(party)
           ? party.gymId === gymId
-          : isTrain(party) && party.train.route.includes(gymId);
+          : isTrain(party)
+            ? party.train.route.includes(gymId)
+            : party.meetup.place?.kind === 'gym' && party.meetup.place.id === String(gymId);
         if (shows) posts.changed(party.id);
       }
     } catch (err) {
diff --git a/src/services/notify-service.parties.test.ts b/src/services/notify-service.parties.test.ts
index a0bdfa6df2e944d52117f35a883f31ce388a5008..0da07ae8a45b48154185a5ac376b8f24baead3aa 100644
--- a/src/services/notify-service.parties.test.ts
+++ b/src/services/notify-service.parties.test.ts
@@ -3,7 +3,9 @@ import { watchEachTest } from '../../test/support/timers.js';
 import { classic, customIdsOf, dmBrief, dmSummary, linksOf } from '../../test/support/messages.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { MemoryNewTrains } from '../../test/support/new-trains.js';
-import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
+import { ALICE, at, BOB, CAROL, MINUTE, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
+import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../test/support/wayspots.js';
 import {
   createdMeetup,
   createdTrain,
@@ -559,6 +561,44 @@ describe('NotifyService: a meeting time', () => {
     expect(raid.dms.jobs).toEqual([]);
   });
 
+  it('says where a meetup is last in the message about its start, as its post says it now', async () => {
+    const { storage, wayspots } = await wayspotsWith([
+      keptRow(1, { title: 'Fountain Square', lat: 40.0601, lon: -80.0601 }),
+    ]);
+    const made = await createdMeetup(
+      {
+        place: {
+          kind: 'stop',
+          id: wayspotId(1),
+          title: 'Fountain Square',
+          lat: 40.0601,
+          lon: -80.0601,
+          address: null,
+          image: null,
+        },
+      },
+      { wayspots },
+    );
+    // An import renames the stop after the meetup was made.
+    await storage.saveFromImport(
+      {
+        upsert: [keptRow(1, { title: 'Fountain *Square* Park', lat: 40.0601, lon: -80.0601 })],
+        remove: [],
+      },
+      PARTY_NOW,
+    );
+    await wayspots.load();
+    await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
+    await made.timed.setStartTime(made.party.id, member(REPORTER, 'Rhea'), at('2026-10-13T16:00'));
+    await made.timed.flush();
+    await made.notify.flush();
+    const [sentence, where] = told(made, ALICE)[0] ?? [];
+    expect(sentence).toMatch(
+      /^Start at .* for the meetup Community Day picnic \(set by Rhea\)\. .*: https:\/\/\S+$/,
+    );
+    expect(where).toBe('Where: Near Fountain \\*Square\\* Park (PokéStop)');
+  });
+
   it('names another day with its date in the start of a meetup', async () => {
     const made = await createdMeetup();
     await made.attendance.signUp(made.party.id, member(ALICE, 'Alice'), PartyStatus.Coming);
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 4b57d64b48620d9449ecfcfe92f4eb841fa02b85..b69e88e16098b74000068cf90b36421b9bb31c1f 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -19,6 +19,9 @@ import {
 import {
   groupOf,
   headCount,
+  isMeetup,
+  type MeetupParty,
+  type MeetupPlace,
   isRaid,
   memberOf,
   membersWhere,
@@ -53,6 +56,7 @@ import {
 import type { PartyBrief } from '../render/party-post.js';
 import { gymName, shownBoss, type PostGym } from '../render/raid-post.js';
 import { spawnBrief, spawnSentence } from '../render/spawn.js';
+import { placeSummary } from '../render/place.js';
 import { clockOrDate, clockOrDay, plain, plainNoLinks, type NamedMember } from '../render/text.js';
 import { DM_PRIORITY, type DmPriority, type DmSender } from './dm-sender.js';
 import type { GameDataProvider } from './game-data-service.js';
@@ -110,7 +114,11 @@ export interface NotifyServiceOptions {
   /** The parties: an ended one is not announced, and what was told about it is forgotten. */
   store: Pick<PartyStore, 'get' | 'onChange'>;
   /** A party's post in brief as it is now (`PartyService.briefOf`). */
-  posts: { briefOf(party: Party): PartyBrief };
+  posts: {
+    briefOf(party: Party): PartyBrief;
+    /** A meetup's place as its post shows it now (`PartyService.placeOf`); else as it was named. */
+    placeOf?(party: MeetupParty): MeetupPlace | null;
+  };
   wants: Pick<WantStorage, 'wanting'>;
   gymTargets: Pick<GymTargetStorage, 'targeting'>;
   /** Who asked to hear of new trains, per server. */
@@ -562,6 +570,10 @@ export class NotifyService implements PartyNotifier {
           time: news.time,
           heads: news.heads,
           link: postLink(guildId, forumPostId),
+          // Where a meetup is, last, as its post shows it now.
+          place: isMeetup(party)
+            ? placeSummary(this.options.posts.placeOf?.(party) ?? party.meetup.place, plainNoLinks)
+            : undefined,
         }),
       }),
       priority: () => DM_PRIORITY.urgent,
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 12133160e2863c51049f160f09f0a089221f4449..7f8cdad2486ef6a5a3ae20a906997465c1bd56a0 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -14,9 +14,13 @@ import {
   at,
   BOB,
   MINUTE,
+  PARTY_NOW,
   REPORTER,
   testMeetup,
 } from '../../test/support/parties.js';
+import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../test/support/wayspots.js';
+import type { KnownPlace } from '../domain/geo/place.js';
 import {
   createdMeetup,
   gatewayWithMirrorChannels,
@@ -97,6 +101,47 @@ describe('PartyService.createMeetup', () => {
     ]);
   });
 
+  it('makes a meetup at a place, and shows the place as it is now, also after an import', async () => {
+    const stop: KnownPlace = {
+      kind: 'stop',
+      id: wayspotId(1),
+      title: 'Fountain Square',
+      lat: 40.0601,
+      lon: -80.0601,
+      address: null,
+      image: null,
+    };
+    const { storage, wayspots } = await wayspotsWith([
+      keptRow(1, { title: 'Fountain Square', lat: stop.lat, lon: stop.lon, address: null }),
+    ]);
+    const made = await createdMeetup({ place: stop }, { wayspots });
+    expect(made.party.meetup).toEqual({ description: null, place: stop });
+    const where = () =>
+      textDisplays(made.gateway.posts.get(made.postId)?.message).find((text) =>
+        text.startsWith('**Where**'),
+      );
+    expect(where()).toMatch(/^\*\*Where\*\*\nNear \*\*Fountain Square\*\* \(PokéStop\) · /);
+    // An import renames the stop: the post shows the new name, and the meetup keeps what it was
+    // named at.
+    await storage.saveFromImport(
+      {
+        upsert: [keptRow(1, { title: 'Fountain Square Park', lat: stop.lat, lon: stop.lon })],
+        remove: [],
+      },
+      PARTY_NOW,
+    );
+    await wayspots.load();
+    await made.service.flush();
+    expect(where()).toMatch(/^\*\*Where\*\*\nNear \*\*Fountain Square Park\*\* \(PokéStop\) · /);
+    expect(made.current().meetup.place).toEqual(stop);
+    // Once the service is closed (shutdown), a load shows nothing anew.
+    await made.service.close();
+    const edits = made.gateway.posts.get(made.postId)?.edits;
+    await wayspots.load();
+    await made.service.flush();
+    expect(made.gateway.posts.get(made.postId)?.edits).toBe(edits);
+  });
+
   it('links to the new post in the channel of the region, as a meetup', async () => {
     const made = await createdMeetup();
     const [link, ...others] = made.gateway.messagesIn(WEST_CHANNEL);
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 14fa9a15c0d5e4a0b718d3e80d9ca3b086d7d2b2..e3ea797f3436b68679ef89fa309647dcdf71cf18 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -28,6 +28,7 @@ import {
   partyWord,
   type Change,
   type MeetupParty,
+  type MeetupPlace,
   type Party,
   type RaidBossRef,
   type RaidParty,
@@ -47,7 +48,12 @@ import { raidEggPicture } from '../domain/pogo/raid-eggs.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
-import { meetupTitle, renderMeetupPost } from '../render/meetup-post.js';
+import {
+  meetupPlaceNow,
+  meetupTitle,
+  renderMeetupPost,
+  type MeetupPostView,
+} from '../render/meetup-post.js';
 import {
   FORUM_TAGS,
   layoutPicture,
@@ -79,6 +85,7 @@ import { RegionClosedError, type PartyStore } from './party-store.js';
 import type { Rehearsal } from './rehearsal.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
+import type { WayspotProvider } from './wayspot-directory.js';
 import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
 
 const MINUTE = 60_000;
@@ -168,7 +175,10 @@ export interface TimedRequest {
   regionChannelId: string;
 }
 
-export type MeetupRequest = TimedRequest;
+/** A meetup, with where it is when its maker said (`/meetup near:`): set once, never changed. */
+export interface MeetupRequest extends TimedRequest {
+  place?: MeetupPlace | null;
+}
 
 /** A train follows what its maker has set for the raids they report (`NewTrain`). */
 export interface TrainRequest extends TimedRequest {
@@ -305,6 +315,12 @@ export interface PartyServiceOptions {
    * but staff and its allowlist.
    */
   rehearsal?: Pick<Rehearsal, 'rehearses' | 'forumAccess' | 'settings'>;
+  /**
+   * The kept Wayspots: a meetup near a PokéStop or power spot shows it as it is now
+   * (`shownPlace`), and is shown anew after every change of what they are. Without them it
+   * shows the place as it was named.
+   */
+  wayspots?: Pick<WayspotProvider, 'byId' | 'whenChanged'>;
 }
 
 /**
@@ -402,6 +418,9 @@ export class PartyService {
       work: (regionId) => this.renderSummary(regionId),
       onError: (err, region) => options.log.error({ err, region }, 'could not update a summary'),
     });
+    options.wayspots?.whenChanged(() => {
+      this.wayspotsChanged();
+    });
   }
 
   /**
@@ -491,6 +510,40 @@ export class PartyService {
     };
   }
 
+  /**
+   * Everything the renderer needs to show a meetup as it is now: the gyms and the kept Wayspots,
+   * for its place as it is now (`shownPlace`).
+   */
+  meetupView(party: MeetupParty): MeetupPostView {
+    const { gyms, wayspots } = this.options;
+    return {
+      ...this.timedView(party),
+      gym: (id) => gyms.get(id),
+      ...(wayspots === undefined ? {} : { wayspot: (id: string) => wayspots.byId(id) }),
+    };
+  }
+
+  /**
+   * After the kept Wayspots changed (an import): the meetups near a PokéStop or power spot are
+   * shown anew, with the place as it is now (`shownPlace`).
+   */
+  private wayspotsChanged(): void {
+    // At shutdown nothing is shown anew any more.
+    if (this.closed) return;
+    for (const party of this.options.store.active()) {
+      const kind = isMeetup(party) ? party.meetup.place?.kind : undefined;
+      if (kind === 'stop' || kind === 'powerspot') this.changed(party.id);
+    }
+  }
+
+  /**
+   * The place of a meetup as its post shows it now (`meetupPlaceNow`): what a direct message about
+   * it names.
+   */
+  placeOf(party: MeetupParty): MeetupPlace | null {
+    return meetupPlaceNow(this.meetupView(party));
+  }
+
   /** Everything the renderer needs to show a train as it is now. */
   trainView(party: TrainParty): TrainPostView {
     const { gyms, raidBosses, gameData } = this.options;
@@ -513,7 +566,7 @@ export class PartyService {
       case 'raid':
         return renderRaidPost({ ...this.view(party), ...last });
       case 'meetup':
-        return renderMeetupPost({ ...this.timedView(party), ...last });
+        return renderMeetupPost({ ...this.meetupView(party), ...last });
       case 'train':
         return renderTrainPost({ ...this.trainView(party), ...last });
     }
@@ -701,7 +754,10 @@ export class PartyService {
    * never left active without a post, nor a post without its meetup.
    */
   createMeetup(request: MeetupRequest): Promise<MeetupOutcome> {
-    return this.createTimed(request, 'meetup', createMeetup);
+    const { place } = request;
+    return this.createTimed(request, 'meetup', (input) =>
+      createMeetup({ ...input, ...(place === undefined ? {} : { place }) }),
+    );
   }
 
   /**
````

### Task 8: Plan 8D T8: Docs and staging of 8D: Where, meetups' places, pins, Whole route

Prototype commit: `be348f7d7a16c6c33fa61d1e3ddbc892d1964a59`

parties-and-posts.md: the layout of a post rewritten (the heading block
with the boss's lines, Where with gymWhere and placeSection, no Map in
the bottom row, no elite mark), a meetup's place (set once by /meetup
near:, never changed; /location for raids alone) and its Where, the DM
sentence's place, state document version 10. trains.md: the post's Where,
the line of what lies ahead (routeAhead), Move train... on a finished
route, and Whole route. gyms-and-regions.md: who still sees the elite
mark. notifications-and-dms.md and wayfarer.md: pins in /wild near:,
short links and links without a place, the shared place option, the
snapshot, the meetups shown anew after an import. testing.md: meetups
with a place. The staging checklist 2026-10-17-phase-8d-staging.md.

**Files:**

```
 docs/architecture/gyms-and-regions.md                 |  4 ++--
 docs/architecture/notifications-and-dms.md            |  2 +-
 docs/architecture/parties-and-posts.md                | 12 +++++++-----
 docs/architecture/testing.md                          |  2 +-
 docs/architecture/trains.md                           |  6 +++---
 docs/architecture/wayfarer.md                         |  2 +-
 docs/superpowers/plans/2026-10-17-phase-8d-staging.md | 56 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 7 files changed, 71 insertions(+), 13 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff be348f7d7a16c6c33fa61d1e3ddbc892d1964a59 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8D T8: Docs and staging of 8D: Where, meetups' places, pins, Whole route`, the body above and the trailer, staging exactly
  `docs/architecture/gyms-and-regions.md docs/architecture/notifications-and-dms.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/trains.md docs/architecture/wayfarer.md docs/superpowers/plans/2026-10-17-phase-8d-staging.md`.

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 1b60ddba9c8b67699c3299c00a0fe8e138a8a524..ef10ee4260757546159f4b7866106fa7046748de 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -22,12 +22,12 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 - What Google knows of a place is behind `GeoGateway` (`src/services/geo-gateway.ts`; `GoogleGeo` calls the Geocoding API and Places API (New) with `fetch`, the key in the address of the one and a header of the other): each call answers a value, `none`, `no-key`, `denied` (remembered for an hour) or `failed`, never throws and never logs an address. The address parts also hold the address as Google writes it (`FORMATTED_ADDRESS`), which the search does not read and `addressLine` shows (`/gym show`); a row without it gets a line made of its parts. `GymUpkeep` (`gym-upkeep.ts`) keeps a gym's address parts, nearby places and nearest gym: the nearest gyms of the gyms concerned only (`nearestGymChanges`), the places of gyms whose nearest gym changed in a slow queue, a generation per gym so that a stale answer is never written. Without a key a gym is saved all the same. Tests use `FakeGeo` (`test/support/geo.ts`), `MemoryGyms` and `gymDirectoryWith` (`test/support/gym-store.ts`), `MemoryGymRemoval` and the service of `test/support/gym-admin.ts`; `partyServiceWith` gives all its services one gym list.
 - The texts of a gym are tidied and checked by `src/domain/gyms/gym-text.ts`: name and nickname must fit `varchar(255)` once entity-encoded (the encoder is passed in; the domain does not import `he`), control and direction characters are stripped (ZWNJ, ZWJ and the flag tag characters stay), keywords are lower case and unique. `/gym edit` writes only the fields that differ from what its form showed (`gymFormTexts`, `changedGymTexts`); a text too long for the form is left out of it, never cut. A gym is named beside its number by `gymWithId` (`src/render/gym-view.ts`), which cuts before it escapes and falls back to "Gym" for a name that shows as nothing.
 - The `gym` option of `/gym` (`src/commands/gyms/gym-option.ts`: `respondWithGyms`, `chosenGym`) is free text with autocomplete; a choice's value is `id:<n>`. Typed: `#123` and `id:123` are always ids; bare digits are an id unless no gym has it (a text search then) or another gym is called by those digits (refused, both listed); other text acts only on a clear hit (`clearGymHit`, shared with `/raid`). The questions and forms of `/gym` keep their state in `pendingGyms` (a `PendingRequests` of six hours) under the token of their custom ids, `gym:<token>:<action>`; a token that was answered is remembered, so a second press is only acknowledged; a refused form keeps what was typed behind "Open the form again".
-- A gym is an elite raid gym when either stored flag is set (`isEliteGym`, `src/domain/party/raid.ts`): the game renamed EX gyms, and everything a reader sees says "elite raid gym" (` · elite` in a train post's route). The columns `taggedEx` / `confirmedEx`, the mirror kind `ex` and `features.exGymChannel` keep their names; only the channel setting was renamed. Never decide on one flag alone.
+- A gym is an elite raid gym when either stored flag is set (`isEliteGym`, `src/domain/party/raid.ts`): the game renamed EX gyms, and everything staff see says "elite raid gym". Members are not told (plan 8D, Matt, 2026-10-17: it mattered for EX raids, not now): no post, train route, `/route show`, `/find-gym` view or `/targets` list marks it; staff's `/gym show`, `/gym elite`, `/region list`'s count, the `#elite-gym-raids` copies with their lead line and the `Elite` forum tag (the raid tier) keep it. The columns `taggedEx` / `confirmedEx`, the mirror kind `ex` and `features.exGymChannel` keep their names; only the channel setting was renamed. Never decide on one flag alone.
 - Gyms of one region shown by the same name (`src/domain/gyms/shared-names.ts`: the nickname where there is one, compared by letters and digits alone, so "P.N.C. Park" is "PNC Park"; the search is unchanged) are listed by `/gym duplicates` (in several private messages for a long list); `/gym add`, `/gym edit` and `/gym move` warn about such a pair without refusing (`namesakeNote`).
 
 ## Gym views and announcements
 
-- The views of a gym are components-v2 messages of `GYM_COLOUR` (`renderGymView`, staff: the heading `### [Name (Nickname)](<place>)`, the address Google gave and `regionsSentence`, the map, the description, `**Notice**`, `**Keywords:**`, `**Gym targets:**`, `**Elite raid gym:**`, `**Nearest gym:**`, nearby places and `Gym #<id> · <lat>, <lon>` in small print, a Map button; `renderMemberGymView` for `/find-gym`: "Elite raid gym" under the heading, the regions, the map, the description, the notice, **Raids now**, `Gym #<id>`, a Map button); every text is cut to its room (`SHOWN`, `HEADING`) so that the worst case is within `TEXT_BUDGET`: what staff or Google wrote is cut before it is escaped, the lines above a view are kept whole while they fit (`fitLines`, "…and N more lines"), and `namesakeNote` names its namesakes within `NAMESAKES_SHOWN`. Every message of the `/gym` flows is v2 from first to last (`gymQuestion` for questions and answers, `gymViewMessage(ctx, place, gym, lines, controls)` for a view with what a change did above it, `answerGym` and `sayGym` to show them); the answer of a change has no buttons but the Map link. Tests read them with `said` (the sentences above a view), `gymViewOf` (title, lines, facts, small print, pictures) and `gymOf` (`test/support/gym-commands.ts`).
+- The views of a gym are components-v2 messages of `GYM_COLOUR` (`renderGymView`, staff: the heading `### [Name (Nickname)](<place>)`, the address Google gave and `regionsSentence`, the map, the description, `**Notice**`, `**Keywords:**`, `**Gym targets:**`, `**Elite raid gym:**`, `**Nearest gym:**`, nearby places and `Gym #<id> · <lat>, <lon>` in small print, a Map button; `renderMemberGymView` for `/find-gym`: no elite mark, the regions, the map, the description, the notice, **Raids now**, `Gym #<id>`, a Map button); every text is cut to its room (`SHOWN`, `HEADING`) so that the worst case is within `TEXT_BUDGET`: what staff or Google wrote is cut before it is escaped, the lines above a view are kept whole while they fit (`fitLines`, "…and N more lines"), and `namesakeNote` names its namesakes within `NAMESAKES_SHOWN`. Every message of the `/gym` flows is v2 from first to last (`gymQuestion` for questions and answers, `gymViewMessage(ctx, place, gym, lines, controls)` for a view with what a change did above it, `answerGym` and `sayGym` to show them); the answer of a change has no buttons but the Map link. Tests read them with `said` (the sentences above a view), `gymViewOf` (title, lines, facts, small print, pictures) and `gymOf` (`test/support/gym-commands.ts`).
 - The view of `/gym show` has Edit…, Make elite / Not elite, Move… and Delete… beside its Map link (`viewControls`, `src/commands/gyms/view-controls.ts`): the custom-id kind `gymview`, `gymview:<gym id>:edit|move|delete`, `gymview:<gym id>:elite:1|0` (what Make elite / Not elite sets, so that a view drawn before somebody else changed the mark does what its label says) and the form `gymview:<gym id>:place` (titled by the gym's tidied name, cut to 38), nothing kept in memory, the guard of `/gym` and no throttle (as `/gym`), a gym gone or out of reach refused with `VIEW_GONE`. Edit… opens the form of `/gym edit` (`openEditForm`, `fromView`: its answer is a message of its own and the view stays; a refusal of it too, and the form opened again from that refusal is answered in its place); Make elite sets the mark and shows the view anew in place with what it did and the buttons as they now are (a gym gone during the press is said in the view's place); Move… opens a form of one input read by `readLocation` and answers as `/gym move` does (`moveGymTo`), Delete… with the question of `/gym delete` (`deleteQuestion`), both in a private message of their own (`deferReply`, then `answerGym`).
 - A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced. What changes the gym list in bulk (a Wayfarer import, the answers of its review queue, the deletion of the gyms beyond a scanned area) is one summary instead (`gymListSummary`, `src/render/gym-summary.ts`: what changed, never what made it (Matt, 2026-10-16), "Professor Pine has added 30 gyms, renamed 1, and moved 1.", the serial comma before the last of three or more; then, for an import, what it changed of the PokéStops and power spots, "It also added 120 PokéStops and 3 power spots, changed 4 PokéStops, and removed 2 power spots." (`wayfarer.md`), alone under the heading "The PokéStops and power spots changed" when no gym changed; counts of nothing are left out; a name changed only in spaces or capitals, `tidiesName`, is no rename): `GymAdminService.batch(place, source, work)` posts its summary at the end, the review's (`source` `review`, also `delete(…, 'review')`) gathered per server and posted `REVIEW_SUMMARY_MS` after the last answer (`flush` posts what waits). One gym added alone is `gymAnnouncement(gym, regions, map)`, a components-v2 message with its map (Matt, 2026-10-15: like `/find-gym`; `GymAdminOptions.maps`, fetched only once a channel was found, the announcement going without it when it fails); a deletion is `gymRemovedLine`. `announce` takes the messages to try in order: one Discord refuses (a file where the bot may not attach files, a map file gone) is followed by the next (the gym without its map); the map is fetched only once a channel was found, and a gym gone by then is not announced. The fake gateway's `refuseFiles` refuses a sent message with files.
 
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index c067a2792ba8672f6daae6bc9a0887f65fbc0b7d..ecc2439ff943855557fb93bcc468ac37e57c8468 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -23,5 +23,5 @@ What members ask to be told about (wants, gym targets, new trains, boss-set), ho
 ## Spawn reports
 
 - A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild`: a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning); a message Discord refuses with Invalid Form Body is sent once more without its picture (the Unown copy too), and the DM says when the report goes away as the report does (`SpawnNews.goneAt`); deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
-- `/wild near:` (plan 8W-2) names a gym, PokéStop or power spot of the server's regions: the option's autocomplete is `ctx.placeFinder` (`nearChoices`: `placeLabel` "Fountain Square (PokéStop) · Market Street", the title cut and never where it is; the member's region first), resolved in the command's guard so that a refusal does not count (`wildPlace`: a value whose place is gone or of another kind now is `PLACE_GONE` "That place is gone from the list; pick it again.", one outside the regions `NOT_HERE`; typed text only on `clearOf` of the one search, the one hit of every word; the guard and the command each resolve it, one search each, else "Which place is …?" with five suggestions); `details` stays required. The report carries it as `SpawnReport.near` (`SpawnPlace`): `nearLine` ("Near **<title>** (PokéStop) · <address> · [Map](<…>)": the address a gym's `addressLine`, a Wayspot's `wayspotAddressLine` (`wayfarer-address.ts`: as a gym made of it would show it, never the town, postal code and country Wayfarer repeats), "(no address available)" for none, so that the picture never sits beside a bare name; title and address through `plainNoLinks`) after the details under **Where**, with the place's picture beside them where `wayspotPicture` allows (the Pokémon's beside the head), in the sighting, the text report and the DM's brief alike; a message Discord refuses is sent once more without either picture.
+- `/wild near:` (plan 8W-2) names a gym, PokéStop or power spot of the server's regions: the option's autocomplete is `ctx.placeFinder` (`nearChoices`: `placeLabel` "Fountain Square (PokéStop) · Market Street", the title cut and never where it is; the member's region first), resolved in the command's guard so that a refusal does not count (`namedPlace`, `src/commands/place-option.ts`: a value whose place is gone or of another kind now is `PLACE_GONE` "That place is gone from the list; pick it again.", one outside the regions `NOT_HERE`; typed text only on `clearOf` of the one search, the one hit of every word; the guard and the command each resolve it, one search each, else "Which place is …?" with five suggestions); `details` stays required. A maps link or coordinates typed there are a pin (plan 8D, Matt, 2026-10-17; the option takes `MAX_PLACE_TEXT` 1,500 characters for long links, and its autocomplete offers nothing for one): `readPin` (`src/domain/geo/pin-input.ts`, pure, over `readLocation`: coordinates, `geo:` with a phone's label, Google Maps with the place's pin before the map's centre and `/place/<name>/` as `linkName`, Apple Maps `ll`, `coordinate`, `q`, `sll`, OpenStreetMap `mlat`/`mlon`, `#map=`) and `PlaceFinder.pin` (refused outside the server's regions, `PIN_NOT_HERE`; named by the nearest gym, PokéStop or power spot within 50 m); a short link (`maps.app.goo.gl`, `goo.gl/maps`, Apple's `maps.apple/p/…`, OpenStreetMap's `osm.org/go/…`) is refused with `SHORT_LINK` and never followed, a link of a maps site that shows no one place (a search, a Street View, `geo:0,0?q=<address>`) with `NO_POINT`, numbers that are no place with `NO_PLACE_ON_EARTH`; the autocomplete offers nothing for any of them. A pin is named by the nearest of the server's gyms (by its nickname, as its post) and of the kept PokéStops and power spots in the server's regions with a title. The option's helpers are `src/commands/place-option.ts` (`namedPlace`, `nearChoices`, `placeLabel`, `placeWords`), shared with `/meetup`. The report carries the place as a snapshot, `SpawnReport.near` (`SpawnPlace`, which is `Place`: never looked up again, the report is short-lived; a pin is `pinLine` without a label, `📍 Near **X** (PokéStop) · [Map](<…>)`, `📍 **<link's name>**` or `📍 Dropped pin`, without a picture): `nearLine` ("Near **<title>** (PokéStop) · <address> · [Map](<…>)": the address a gym's `addressLine`, a Wayspot's `wayspotAddressLine` (`wayfarer-address.ts`: as a gym made of it would show it, never the town, postal code and country Wayfarer repeats), "(no address available)" for none, so that the picture never sits beside a bare name; title and address through `plainNoLinks`) after the details under **Where**, with the place's picture beside them where `wayspotPicture` allows (the Pokémon's beside the head), in the sighting, the text report and the DM's brief alike; a message Discord refuses is sent once more without either picture.
 - Text a member typed that reaches other members' DMs or a spawn report goes through `plainNoLinks` (`src/render/text.ts`), which also breaks bare addresses; a member's name is always shown through it. `plain()` leaves an address alone (a meetup's description may link).
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 31c85a598b075ba90d5f251becf8b65bfe321895..15fff14d8ae34787351cad5a72c3ec8e7161147e 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -33,15 +33,17 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 - A timed party (a meetup or a train) has `party.timed` (`name`, `startTime`: one start for the whole party, not a group's meeting time) and changes through `ctx.timedParties` (`TimedPartyService`: `setName`, `setDescription`, `setStartTime`, `setEndTime`, `flush`) over the pure functions of `src/domain/party/timed.ts` (and `meetup.ts`). It is over at its end time; without one, a day after its start; without either, a day after it was made or its last time was removed (`latestTime(party, now)`, `settled`). The clock warns it `trainOrMeetupDeletionWarningTime` ahead, and an ended one is always shown as over. A new start is announced in the post gathered (one message a few seconds after the last change).
 - A meetup has one group and no completion: Done means leave (`finishParty`), `/group` and a group's meeting time are refused (`no-groups`, `party-wide-start`), its post has no Done and no Set time button, and its maker is always named.
+- A meetup's place (plan 8D, Matt, 2026-10-17) is `meetup.place` (`MeetupPlace`, `src/domain/geo/place.ts`: a `KnownPlace`, a gym, PokéStop or power spot as it was when it was named, a snapshot; or a `DroppedPin`, a point with the place `near` it within `PIN_NEAR_METRES` 50 and the `linkName` its maps link gave). It is set once, by `/meetup near:` when the meetup is made (`createMeetup`; `near` optional), and never changes afterwards (Matt, 2026-10-17): no command adds, changes or clears it, since a new public place would skip the moderators' check of plan 8S, and what more there is to say about where goes in the information (`/info`). `/location` is for raids alone. `near` is read by `namedPlace` (`src/commands/place-option.ts`, shared with `/wild near:`). The post shows the place as it is now while it is the same place (`shownPlace`: the gym by id from `MeetupPostView.gym`, the kept Wayspot from `MeetupPostView.wayspot`, of the same kind and within `PLACE_MOVE_METRES` 25 of the snapshot, so a rename, a new picture, address or a gym's notice show), else the snapshot; the stored place is never rewritten. A gym edit shows the meetups at it anew (`GymUpkeep.showAnew`), a load of the kept Wayspots those near a PokéStop or power spot (`PartyService` over `WayspotProvider.whenChanged`). Its Where, after the heading block and before "Meeting Information": a known place `Near **<title>** (<kind>) · <address> · [Map](…)` (the `NO_ADDRESS` rule of a raid's Where), a gym's notice under it, its picture beside; a pin `📍 Near **<title>** (<kind>)` (the nearest place within 50 m), else `📍 **<linkName>**`, else `📍 Dropped pin`, with its Map and no picture (`pinLine`, `src/render/place.ts`); nothing without a place. The DM brief has the first line of the Where without links or Map, and the place's point as its `map`; the DM of a start time names the place as the post shows it now (`PartyService.placeOf`, `meetupPlaceNow`).
 - A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`) over `resolvePartyTime`: never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
 
 ## How a post is rendered
 
-- What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`). A party's post is a components-v2 message (Matt, 2026-10-15): the renderer lays it out (`PostLayout`: an accent colour, a picture, blocks of text, sections with the picture or a button beside them, rows of buttons) and `postMessage(layout, variant)` (`src/render/party-post.ts`) makes it one container; `rendered.message` is `postMessage(layout)`, the whole message and the only place its parts are put together, and its other forms are variants of the layout (`picture: false` when Discord refuses the picture, `controls: false` for the last showing of an ended party, `move: false` and `lead` for a copy), never edits of the component tree. `rendered.brief` (`PartyBrief`: the post's accent and picture, a few of its lines, a raid's map address) is what a direct message shows of the party, made by the renderer that makes the post, so a line the post shows is worded once (`PartyService.briefOf`; plan 8B-1: the embed card and `party-card.ts` are gone). Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as is the heading of the boss block ("Hatches as Yveltal"), said once. A raid is called as the legacy bot called it (`raidWords`: "Level 5 raid", "Shadow Level 3 raid"; the titles of posts and their tags keep `T5`), and the statuses are Interested, Coming, Present and Complete. A message holds at most `MAX_COMPONENTS` (40, every nested component counted) and its text displays at most `TEXT_BUDGET` (4,000, assumed: Discord documents no total) less the room of a copy's line (`LEAD_ROOM`): `fittedLayout(build)` gives `build` a `Fit`: every list of members goes through `fit.list` and is cut down with the others when the post is too long (`fitLists`, "…and N more"), and as a last resort the other texts that can be long (a group's label, a gym's notes, where a train is, its route) go through `fit.part(room => …)` and are cut (`cutText`, "…"). A copy's line (`lead`) opens the post's first text, never a component of its own. The worst case of each kind, with every text needing escapes, is tested with every copy (`expectSendable`, `test/support/post-limits.ts`).
-- What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS`, `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut; what a post says about a gym under "Location Information" (`locationBlock`), with the gym's picture from Wayfarer beside it (plan 8W-2: `Gym.imageUrl` as a `PostThumbnail` accessory, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment (`=s1600`, `=w800-h600-k-no`) becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept; layout C, Matt, 2026-10-16: under the heading the gym's address line, `addressLine` made plain and cut to 200, then its notes; a block with a picture and no address says `(no address available)` (`NO_ADDRESS`), so the picture never sits beside the heading alone, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) that line goes with it, and the block when it said nothing else (`PostThumbnail.withoutPicture`: the part as it is without its picture, a text or none); a block without a picture stands, as before, only for notes, with the address added when there is one): a raid's post and its copies, and a train's current stop (its "Move train…" stays beside where the train is). The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more: a raid of five groups with every control).
+- What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`). A party's post is a components-v2 message (Matt, 2026-10-15): the renderer lays it out (`PostLayout`: an accent colour, a picture, blocks of text, sections with the picture or a button beside them, rows of buttons) and `postMessage(layout, variant)` (`src/render/party-post.ts`) makes it one container; `rendered.message` is `postMessage(layout)`, the whole message and the only place its parts are put together, and its other forms are variants of the layout (`picture: false` when Discord refuses the picture, `controls: false` for the last showing of an ended party, `move: false` and `lead` for a copy), never edits of the component tree. `rendered.brief` (`PartyBrief`: the post's accent and picture, a few of its lines, the map address of a raid's gym or a meetup's place) is what a direct message shows of the party, made by the renderer that makes the post, so a line the post shows is worded once (`PartyService.briefOf`; plan 8B-1: the embed card and `party-card.ts` are gone). Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as heads the boss's lines ("Hatches as Yveltal"), said once. A raid is called as the legacy bot called it (`raidWords`: "Level 5 raid", "Shadow Level 3 raid"; the titles of posts and their tags keep `T5`), and the statuses are Interested, Coming, Present and Complete. A message holds at most `MAX_COMPONENTS` (40, every nested component counted) and its text displays at most `TEXT_BUDGET` (4,000, assumed: Discord documents no total) less the room of a copy's line (`LEAD_ROOM`): `fittedLayout(build)` gives `build` a `Fit`: every list of members goes through `fit.list` and is cut down with the others when the post is too long (`fitLists`, "…and N more"), and as a last resort the other texts that can be long (a group's label, a gym's notes, where a train is, its route) go through `fit.part(room => …)` and are cut (`cutText`, "…"). A copy's line (`lead`) opens the post's first text, never a component of its own. The worst case of each kind, with every text needing escapes, is tested with every copy (`expectSendable`, `test/support/post-limits.ts`).
+- What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS`, `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut. Every post says where the party is under **Where** (plan 8D, Matt, 2026-10-17, like the `/wild` report's Where; the layout below).
+- The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
-- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its line (`statusButton`: Interested, Join, Here, Done), with several a "Join A" beside each group (`joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present, and a member who is asked whether they completed the raid, as they are; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (Leave, −1, +1, Remote, a raid's Map link; Set time; Screenshot feedback), every button with its emoji: buttons only, none depending on the time. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
-- A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), the address last.
+- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its line (`statusButton`: Interested, Join, Here, Done), with several a "Join A" beside each group (`joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present, and a member who is asked whether they completed the raid, as they are; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (Leave, −1, +1, Remote; Set time; Screenshot feedback; no Map: a post's one Map is in its Where, plan 8D), every button with its emoji: buttons only, none depending on the time. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
+- A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit.
 
@@ -59,7 +61,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, "Join B") are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
-- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 9 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; exactly the parts that fit the type must be present); versions 1 to 8 are still read (a train of them as `finish`).
+- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 10 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; exactly the parts that fit the type must be present); versions 1 to 9 are still read (a train of them before 9 as `finish`, a meetup of them before 10 without a place).
 
 ## The clock
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 0e942eef6f4e883579613d8a73c90085bdce9856..625642886b0f452903d3a7b52ef5b728a15fb99d 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -30,7 +30,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
 - Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`.
-- Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
+- Meetups in tests: `testMeetup()` (which takes `place`), `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`; a meetup with a place passes `place`, and a directory of kept Wayspots as the override `wayspots`, `wayspotsWith`). A meetup's post shows its place as it is now from `MeetupPostView.gym` and `.wayspot`; a test of the renderer passes them to see a place as it is now, and leaves them out for the snapshot. The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 
 ## The party history
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 4419b63188b139d2e501d0bed7fa44191dc533d8..7798dd5475f6319483a2128e13d11465ed014b5b 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -13,12 +13,12 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 - Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `reverse`, `setAtEnd`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its gym through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym is a stop only when it lies in a region of the train's server (`reaches`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
-- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), the panel's menu (the menu is only in the panel, which opens only for who may move the train, so `setAtEnd`'s `mayArrange` matters for a panel opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so the panel's control also carries `first`, the gym the route began with (`route-changed` otherwise). The post's route line says `, loops` / `, turns back at the end` on a route of two stops or more, and "Next gym" at the last stop `(round again)` / `(turning back)`; after a turn or a Reverse the route is listed in its stored order. The words of the modes are `src/render/train-words.ts`.
+- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), the panel's menu (the menu is only in the panel, which opens only for who may move the train, so `setAtEnd`'s `mayArrange` matters for a panel opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so the panel's control also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
 
 ## The post and the panel
 
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
-- A train's post has one grey button "Move train…" beside where the train is and goes next (`party:<id>:move`, `moveTrainButton`), which answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Move the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next, Previous and Skip also the gym they lead to), `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), a train without a route and one that ended get `panelNote` (no controls). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep `whereText`.
+- A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Then a row (a `controls` block: a section's one accessory is the picture): the grey "Move train…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; also on a finished route: Previous and Reverse take a Finish back) and on a route longer than `WHOLE_ROUTE_STOPS` "Whole route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then. "Move train…" answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Move the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next, Previous and Skip also the gym they lead to), `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), a train without a route and one that ended get `panelNote` (no controls). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep the panel's `whereText`. The DM brief of a train is unchanged (`placeLine`).
 
 ## Saved routes
 
@@ -26,4 +26,4 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 
 ## Copies in other regions
 
-- A train has a copy of its message in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`; `regionChannels` in `PartyMirrors`), only where the bot may post embeds (`PartyGateway.mayPost`, from the cache: without Embed Links Discord drops the embed instead of refusing). `PartyMirrors` keeps one newest copy per slot: the kind, and for `region` the kind in a channel. Such a copy is `renderMirror('region', …)`: a line at the top and the post with its controls but "Move train…" (the layout's `move: false`). A copy is sent again without its picture when Discord refuses that. A run of the shared queue that left something undone (a failed edit or send, a channel that refuses or is gone) is followed by one more for that party `RETRY_AFTER_MS` later, for a raid's copies too. On the fake gateway `noEmbeds` names the channels that lack the permission.
+- A train has a copy of its message in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`; `regionChannels` in `PartyMirrors`), only where the bot may post embeds (`PartyGateway.mayPost`, from the cache: without Embed Links Discord drops the embed instead of refusing). `PartyMirrors` keeps one newest copy per slot: the kind, and for `region` the kind in a channel. Such a copy is `renderMirror('region', …)`: a line at the top and the post with its controls but "Move train…" (the layout's `move: false`); it keeps "Whole route". A copy is sent again without its picture when Discord refuses that. A run of the shared queue that left something undone (a failed edit or send, a channel that refuses or is gone) is followed by one more for that party `RETRY_AFTER_MS` later, for a raid's copies too. On the fake gateway `noEmbeds` names the channels that lack the permission.
diff --git a/docs/architecture/wayfarer.md b/docs/architecture/wayfarer.md
index ba587bd553fb64c31a07ceea1a86621d986d0cf3..98e35435b5fabd187e2e658b4e80981b61af0ae1 100644
--- a/docs/architecture/wayfarer.md
+++ b/docs/architecture/wayfarer.md
@@ -29,7 +29,7 @@ The true list of gyms from Wayfarer: the export file and its parts, S2 cells, th
 ## The kept Wayspots
 
 - Every Wayspot of an applied import is kept (plan 8W-2): table `Wayspot` (migration `2026_10_16_017_wayspot`; a migration merged after it must sort after it, since Kysely refuses an earlier name once 017 ran on a database: 8H's is `2026_10_16_018_party_history`, 016 stays unused; first merge wins, the second renumbers above it, and only a merged migration, or one that already sorts after everything merged, is run on the dev database. The table: the Wayfarer id, `kind`, `formerKind` (the kind before an import last saw it as another; `stop` for a promoted stop), place, title and address plain (not entity-encoded: nothing legacy reads it; cut to 255), picture (`pictureOf`, the address as Wayfarer gives it; a message shows it through `wayspotPicture`: https, `=s400`), `firstSeen` (when an import first kept it: the import's time), `lastSeen` (when the scan of the newest file that saw it was made, `scanTimeOf`: the file's `finishedAt`, else `startedAt`, else the import's time, never later than the import's time: a file dated in the future would freeze its rows); not per server) behind `WayspotStorage` (`WayspotRepository`: `all`, `saveFromImport({ upsert, remove }, importedAt, scannedAt)` in one transaction of chunks of 500, `remove(ids)`; twin `MemoryWayspots`, both run `wayspotCases`). The pure part is `planKept` (`src/domain/wayspots/keep.ts`, rows `kept.ts`): every Wayspot of the file but those whose id is a Pine gym's `pogoId` (of any server) after the import, which live in `Gym` (a row of one is deleted); a kept row not in the file is deleted where the file covered its cell (`coveredCells`); a row last seen after the file's scan (another server's newer scan) is neither changed nor deleted nor counted (a week-old file does not undo a fresh scan; only a gym that is it now takes it), and one another scan saw after the file's scan started (`scanStartOf`: `startedAt`, else `finishedAt`, never later than the import) is not deleted (a row last seen exactly at the file's scan time is its own: an earlier import of the same scan); moves and renames are silent; `WayspotCounts` counts stops and power spots `added`, `changed` (kind, title, place, address or picture), `gone` (also a stop that became a gym), and `gyms` (kept Wayfarer gyms written, said nowhere and no reason to offer an import). The import reads the kept rows under its lock, writes them after the gyms (`Unrecorded` `wayspots` when it fails or they cannot be read; the gyms stand, and a gym added is then not known to have been a PokéStop) and stores the counts in its row as `wayspots*`; preview and outcome say them in one line (a preview that cannot read them logs it and says nothing of them), and an import that changes only stops and power spots is offered (`changesNothing`, `changesWayspots`). A Wayfarer gym whose adding failed stays a kept `gym` row. A review's Same as (`applyMatch`) and New gym delete the row of the Wayspot the gym now is; New gym gives the gym the kept row's picture. A Wayfarer gym added whose kept row was a stop (`wasStop`) is counted by `GymBatch.add(…, { promoted: true })`: the summary says "Professor Pine has added 12 gyms (3 of them were PokéStops)". The summary also says what the import changed of the stops and power spots (`planKept`'s `byKind`, `WayspotChanges`, given to the batch by `GymBatch.countWayspots` once they are written), each count by its kind: "It also added 120 PokéStops and 3 power spots, changed 4 PokéStops, and removed 2 power spots."; its `gone` is only what left Wayfarer's map, not a stop that became a gym (unlike `WayspotCounts.gone`, which the preview says): a stop Wayfarer now shows as a gym, taken by a Pine gym or not, is counted neither as removed nor as a stop. Its `changed` is only a new kind, a new title or a move over `NOTICED_MOVE_METRES` 10 (`noticeable`): a new address or picture alone is written but not said, so that routine re-imports post nothing (the preview's `changed` still counts them). Real export (43,057): `planKept` 0.2 s, the first write 1.9 s, a write of all again 1.2 s.
-- `ctx.wayspots` is `WayspotDirectory` (`src/services/wayspot-directory.ts`): loaded at start (after the regions) and after every applied import, empty until then; `byId`, `all`, `inRegion(channelId)`, `regionsOf(id)` (by the outlines, worked out again when `RegionDirectory.generation` changes), `near(point, metres, kinds?)`, `forget(ids)` (an id forgotten while a load reads stays forgotten when the load ends), a `generation` that changes with every load, forget and change of the regions (the region editor of 8M-2 rebuilds on it), and a `contentGeneration` that changes only with what the Wayspots are (every load; not the regions, not a forget: what is built of them passes over a forgotten one through `inRegion` and `byId`), with `whenChanged(listener)` called after each change of it (the search indexes of `PlaceFinder` are built on it).
+- `ctx.wayspots` is `WayspotDirectory` (`src/services/wayspot-directory.ts`): loaded at start (after the regions) and after every applied import, empty until then; `byId`, `all`, `inRegion(channelId)`, `regionsOf(id)` (by the outlines, worked out again when `RegionDirectory.generation` changes), `near(point, metres, kinds?)`, `forget(ids)` (an id forgotten while a load reads stays forgotten when the load ends), a `generation` that changes with every load, forget and change of the regions (the region editor of 8M-2 rebuilds on it), and a `contentGeneration` that changes only with what the Wayspots are (every load; not the regions, not a forget: what is built of them passes over a forgotten one through `inRegion` and `byId`), with `whenChanged(listener)` called after each change of it (the search indexes of `PlaceFinder` are built on it, and `PartyService` shows the meetups near a PokéStop or power spot anew, plan 8D). `near` also names a pin: `PlaceFinder.pin` takes the nearest gym of the server or kept PokéStop or power spot within 50 m.
 
 ## The review queue
 
diff --git a/docs/superpowers/plans/2026-10-17-phase-8d-staging.md b/docs/superpowers/plans/2026-10-17-phase-8d-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..a08cdecdc002c28fb5cd32e949342c0e8b17e8ca
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8d-staging.md
@@ -0,0 +1,56 @@
+# Phase 8D staging checklist: posts with a Where, meetups' places, pins, Whole route
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. The test server has regions of about a kilometre in Oakland and Squirrel Hill North, with 34 imported gyms that have Wayfarer pictures and addresses and 2,992 kept Wayspots: good ground for every step. The approved mockup is version 4 (`.superpowers/sdd/2026-10-17-phase-8d-post-where/mockup.html`); compare each post with its card. Since the mockup, Matt decided (2026-10-17) that a meetup's place is set only by `/meetup near:` when it is made and never changes, that a meetup has no free-text `where` (what more there is to say goes in `/info`), and that `/location` stays for raids alone.
+
+## Before
+
+1. Before deploying, make a meetup on the old code (no place). It stays without one after the deploy, its post without a Where (step 22).
+2. No migration: the party document is version 10, written by the bot itself (a meetup of version 9 reads as one without a place). Once the bot has written a version 10 document, a bot from before this plan cannot read that party: do not go back to an older branch on the dev database while a party written by this one is active.
+3. `/meetup` has a new option `near` and `/wild near:` takes 1,500 characters: register the commands again, only on Matt's go-ahead (`npm run deploy-commands -- --global`, or `./pine deploy-commands --global` in the stack; the dev application is registered globally only). A client may need a restart (Ctrl+R) to show the option. `/location` is unchanged: only `gym`, for raids.
+
+## Raids (cards 1 to 4)
+
+4. Report a hatched raid at a gym with a Wayfarer picture and a notice (`/gym edit` gives one a notice): the post opens with `### Level 5 raid against <boss>`, the times, then the boss's weaknesses, catch CP and moves in the same block, the boss's picture beside it. No gym name in the first line; the thread title still has it.
+5. Under **Where**: one line, the gym's name in bold (no link), its address, and a Map link that opens Google Maps at the gym and shows no preview card; the notice under it; the gym's picture beside the section. The bottom row has no Map button.
+6. An egg at the same gym whose boss is known (`/boss` on an egg): the egg's picture beside the heading, "Hatches as <boss>" heading the boss's lines inside the heading block.
+7. A raid at a gym without a picture or address (a gym added by hand): **Where** is the name and Map alone, no picture. A gym with a picture and no address (one deep in a park): "(no address available)" between them, the picture beside.
+8. Mark a gym elite (`/gym elite`): its raid post says nothing of it (no "elite raid gym" anywhere in the post), and the copy in `#elite-gym-raids` still comes with its line "A raid at an elite raid gym in #…". `/gym show` still says **Elite raid gym:** yes; `/find-gym` and `/targets` (with the gym targeted) say nothing of it.
+9. A remote-raid copy (`#remote-raids`) and the elite copy: the copy's line opens the first text, the post as above under it, its controls working.
+10. A DM about a raid (a want of its boss) still has its Map button.
+11. `/location gym:` in a raid's post moves it as before; `/location` in a train's or a meetup's post is refused ("…only works in the post of a raid").
+
+## Trains (cards 7 to 10)
+
+12. A train of seven stops (`/route add` seven of the test server's gyms) in each mode (`/train … at-end:`, or the panel's menu): at stop 2 the post says `**Where · stop 2 of 7**`, the stop's line with its address, Map, notice and picture, then in small print `Next: 3. … · 4. …, and 3 more to the end`, and a row of "🚂 Move train…" and "🗺️ Whole route".
+13. Walk it with the panel to the turns, and compare each line with card 7b: finish at 6 of 7 (`Next: 7. …, the last stop`), at 7 (`This is the last stop.`); loop at 6 (`Next: 7. … · 1. … (round again), and 4 more round the loop`) and at 7; turn back at 2 (`…, and 3 more to the end, where it turns back`), at 5 (`…, where it turns back`), at 6 (card 7c: `Next: 7. …, then back here, and 5 more back to the start`) and at 7 (`Next: 6. … (turning back) · 5. …, and 4 more back to the start`). After the turn the numbers are those of the route as stored then.
+14. Finish the long route: `**Where**`, `Route complete`, no small print; Move train… stays (Previous takes the Finish back, try it) and Whole route too.
+15. A train of three stops: `Route: 1. … · **2. …** · 3. …, loops` and no Whole route. Finish it: the same line without bold and without `, loops`, and Move train… still there.
+16. A train without a route: `No route yet: /route add adds a stop.` and Move train… alone.
+17. Whole route in the post: the route privately, exactly as `/route show` answers (every stop a maps link, the stop the train is at marked); pressed by a member who is not signed up too.
+18. The train's copy in another region's channel (a route with a stop there): no Move train…, Whole route answers privately.
+19. A train after a boss: its weaknesses and catch CP in the heading block. A DM brief of a new train is as before ("At …").
+
+## Meetups (cards 5 and 6)
+
+20. `/meetup name:… near:` pick a PokéStop with a picture: **Where** after the heading block, `Near **<stop>** (PokéStop) · <address> · Map`, the stop's picture beside; **Meeting Information** (`/info`) under it as before. `/help meetup` says `near` and that the place cannot be changed afterwards.
+21. A meetup at a gym with a nickname (`near:` that gym): `Near **<nickname>** (gym) · …`, its notice under the line, its picture. Rename the gym or give it a notice with `/gym edit`: the meetup's post shows the change within seconds. Move the gym more than 25 m (`/gym move`): the post goes back to the place as it was named.
+22. The meetup made before the deploy (step 1): no Where, everything else as before. Restart the bot with a meetup that has a place: its post is the same after the restart (the version 10 document read back).
+23. Paste a Google Maps link of a spot in the region into `near:` (open a place in Google Maps in a browser, copy the address bar): `📍 Near **<place>** (<kind>) · Map` when a gym, stop or power spot is within 50 m, else `📍 **<the link's place name>** · Map`, else `📍 Dropped pin · Map`. No picture. Typed coordinates (`40.4441, -79.9532`) likewise. On iOS and on Android: paste a link into `near:` while the autocomplete shows nothing, and send.
+24. A meetup without `near`: no Where; its information (`/info`) says where.
+25. `/meet` a start time on the meetup at a gym from step 21, renaming the gym with `/gym edit` first: the DM to the others ends with a line "Where: …", and that line shows the new name. No DM shows a meetup's brief today (the notifier sends none about meetups), so its Map button is seen nowhere.
+26. A stop renamed by an import while a meetup is there: only tests cover it (a fresh import on the test server would do it; skip unless one is due).
+
+## `/wild near:` with pins
+
+27. `/wild … near:` a Google Maps link of a spot in the region: the report's **Where** has the details, then `📍 Near **<place>** (<kind>) · Map` or `📍 Dropped pin · Map`; the answer says "near <place>" or "at your pin". The DM to a member who wants the Pokémon has the same line. Likewise typed coordinates, and an Apple Maps link (`https://maps.apple.com/?ll=…`).
+28. A short link from the Google Maps app (`https://maps.app.goo.gl/…`, as the app's Share gives it on a phone): refused with "I do not follow short links. Open that one, and paste the address your browser shows then, or drop a pin in Google Maps and paste the coordinates it shows."; a Google Maps search link: "That link shows no one place: …"; a link of a place outside the regions: "That pin is not in a region of this server."
+29. How long a full Google Maps address of a place is (the option takes 1,500 characters): note the longest seen.
+
+## Phone looks
+
+30. On the phone: a raid post (card 1), an egg (2), a gym without a picture (3), a copy (4), a meetup near a stop (5), a pin (6), a train of seven stops (7) and one without a route (9). Note how the Where line wraps, whether the Map link is easy to tap, and how the thumbnail sits beside **Where**.
+
+## Left open (to the follow-ups if not settled here)
+
+- Whether Discord on a phone shows the masked Map link in angle brackets without a preview, as on the desktop.
+- Whether "Whole route" should also show on a route of three stops or fewer (the mockup leaves it out; the line lists the route whole).
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8d HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8d-post-where.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other through the npm scripts.
2. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8D"), the Gantt chart and memory; tell the sessions of the web map (8M-4 builds on the pin reader) and of meetup safety (8S builds on the meetup's place) that 8D is merged.

## Staging checklist

`docs/superpowers/plans/2026-10-17-phase-8d-staging.md` (task 8): on the dev application and the test server, each step with Matt's go-ahead, starting with registering the commands again (`npm run deploy-commands -- --global`).
