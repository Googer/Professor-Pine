# Phase 8M-5M: Meetups from the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member makes a meetup from Pine's live map (at a gym, a PokéStop or a pin, with exactly `/meetup`'s rules and the meetup safety), and its maker and staff change its name, information and times there; meetups are drawn at their place.

**Architecture:** Making goes only through `MeetupSafety.make` (plan 8S-1's one entry point), behind a shared `makeMeetupAs` that `/meetup`'s form uses too; the change commands' logic is shared the same way (`renameAs`, `startAs`, `endAs`, `describeAs`). The routes (`/api/meetups…`, `/api/stops`) are guarded as 8M-4's and 8M-5's (per-address limit and `postGuard` before the body, the member checks, access, the command's own checks, then its throttle); every change carries the value it was drawn from, refused inside the store when stale. The page adds the New meetup form with a pick mode (gyms, the view's PokéStops, pins) and the editor, held by 8M-4's `FormHold`.

**Tech Stack:** TypeScript 6.0, Fastify, Leaflet (all from 8M-1). No new package. One additive migration (020, `MeetupRequest.source`).

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` 3.7 (last bullet), with the later decisions of 8D (meetups have a place) and 8S-1 (place, start and information required; the place fixed; the safety; `docs/architecture/meetup-safety.md`). Ledger: `.superpowers/sdd/2026-10-17-phase-8m5m-meetups-from-the-map/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m5m` (worktree `var/proto-8m5m`, rebased onto `wayfarer` 7851ac99), one commit per task, each typechecked (root and page) with its area's tests green; on the tip the full check (7,427 tests), the build, the userscript build and the database suite (435) were green. An Opus review went through the whole prototype; its findings (one Important, seven Minor) are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-17; ledger), for Matt to look at:

1. **A meetup's place is a gym, a PokéStop or a pin** (Matt, 2026-10-17: never a power spot; the general `/meetup` rule is 8S's, merged as d293e74d). The map offers only those and refuses any other kind (422); PokéStops are shown in pick mode only, from the view's box, at most 300.
2. **One code path:** the map makes meetups only through `MeetupSafety.make`; `/meetup`'s checks before the form run in its order and cost nothing; then `MEETUP_THROTTLE`, shared with `/meetup`. A blocked member is pointed to `/meetup` (no Appeal on the map).
3. **The moderators' post says "on the map"**, kept on the request (migration 020) so every redraw keeps it.
4. **Who changes a meetup on the map:** its maker and staff (as raids in 8M-4); a start also needs a sign-up, as `/meet` does, so staff not signed up cannot change the start.
5. **No end time when making** (`/meetup` takes none; a held request has nowhere to keep one); it is set with the editor once the meetup is posted. "Sent to the moderators" is a 200 with `outcome: 'held'`.
6. **Meetups are drawn at their place** (a ring above the markers) as well as listed in the side panel; the region of a new meetup follows the place picked unless the member chose one.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md`, `meetup-safety.md` and `testing.md` ("How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network.** A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Nothing names a member on the map; nothing from data reaches the page as HTML; a member is never told why a place was refused or held.
- `src/db/types.ts` is generated: the task's diff carries it as `npm run db:codegen` wrote it; apply it as it is.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m5m`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock).
- Never `npm install`/`npm ci`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **The commands behave exactly as before** (`/meetup`, `/name`, `/info`, `/meet`, `/cancel-meet`, `/end`).
2. **Every outcome of `make` is handled**, refusals before the throttle cost nothing, and nothing tells a member why a place was refused or held.
3. **Places:** only gyms, stops and pins; snapshots identical to `/meetup`'s; `/api/stops` bounded and without power spots.
4. **Stale changes never act:** a changed meetup answers 409 with the meetup as it is now; who may change it; the throttle keys shared with the commands.
5. **Migration 020** is additive; the moderators' post keeps "on the map" through every redraw.

---

### Task 1: Meetups from the map: the commands' code paths shared, the map as a request's source

Prototype commit: `5991eb08d6d56231f0a29cde733d9d11d947c14a`

`makeMeetupAs` (over `MeetupSafety.make`, every outcome in `/meetup`'s words, `power-spot` included) and the change commands' `renameAs`, `startAs`, `endAs`, `describeAs`; `/meetup`, `/name`, `/meet`, `/cancel-meet`, `/end` and `/info` call them and behave as before. `TimedPartyService`'s changes take an optional `drawn` value checked inside the store (`changed-meanwhile`). A request's `source` ('map'), stored by migration 020 (`MeetupRequest.source`), so the moderators' post says "Asked by … on the map in <#region>" through every redraw.

**Files:**

```
 src/commands/meetups/info.ts                              |  37 +++++++++----
 src/commands/meetups/meetup.ts                            | 107 ++++++++++++++++++++++++++----------
 src/commands/parties/name.ts                              |  20 ++-----
 src/commands/parties/timed.ts                             | 162 +++++++++++++++++++++++++++++++++++++++++-------------
 src/db/migrations/2026_10_17_020_meetup_request_source.ts |  28 ++++++++++
 src/db/migrations/index.ts                                |   2 +
 src/db/migrator.db.test.ts                                |   1 +
 src/db/repositories/meetup-safety-repository.ts           |   3 +
 src/db/types.ts                                           |   1 +
 src/domain/meetups/records.ts                             |   8 +++
 src/domain/party/party.ts                                 |   7 ++-
 src/domain/party/timed.ts                                 |  10 ++++
 src/render/activity.ts                                    |   2 +
 src/render/meetup-safety.test.ts                          |  14 +++++
 src/render/meetup-safety.ts                               |   5 +-
 src/services/meetup-safety.test.ts                        |  11 ++++
 src/services/meetup-safety.ts                             |   4 ++
 src/services/timed-party-service.test.ts                  |  44 +++++++++++++++
 src/services/timed-party-service.ts                       |  37 ++++++++++---
 test/support/meetup-safety-cases.ts                       |   4 +-
 20 files changed, 398 insertions(+), 109 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/meetups/meetup.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/in-meetup.test.ts src/components/meetup-safety.test.ts src/render/meetup-safety.test.ts src/services/meetup-safety.blocks.test.ts src/services/meetup-safety.test.ts src/services/timed-party-service.test.ts test/support/meetup-safety.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/meetup-safety-repository.db.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/meetups/info.ts src/commands/meetups/meetup.ts src/commands/parties/name.ts src/commands/parties/timed.ts src/db/migrations/2026_10_17_020_meetup_request_source.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/meetup-safety-repository.ts src/db/types.ts src/domain/meetups/records.ts src/domain/party/party.ts src/domain/party/timed.ts src/render/activity.ts src/render/meetup-safety.test.ts src/render/meetup-safety.ts src/services/meetup-safety.test.ts src/services/meetup-safety.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts test/support/meetup-safety-cases.ts` and `npx eslint src/commands/meetups/info.ts src/commands/meetups/meetup.ts src/commands/parties/name.ts src/commands/parties/timed.ts src/db/migrations/2026_10_17_020_meetup_request_source.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/meetup-safety-repository.ts src/db/types.ts src/domain/meetups/records.ts src/domain/party/party.ts src/domain/party/timed.ts src/render/activity.ts src/render/meetup-safety.test.ts src/render/meetup-safety.ts src/services/meetup-safety.test.ts src/services/meetup-safety.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts test/support/meetup-safety-cases.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 5991eb08d6d56231f0a29cde733d9d11d947c14a -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Meetups from the map: the commands' code paths shared, the map as a request's source`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/meetups/info.ts src/commands/meetups/meetup.ts src/commands/parties/name.ts src/commands/parties/timed.ts src/db/migrations/2026_10_17_020_meetup_request_source.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/meetup-safety-repository.ts src/db/types.ts src/domain/meetups/records.ts src/domain/party/party.ts src/domain/party/timed.ts src/render/activity.ts src/render/meetup-safety.test.ts src/render/meetup-safety.ts src/services/meetup-safety.test.ts src/services/meetup-safety.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts test/support/meetup-safety-cases.ts`.

````diff
diff --git a/src/commands/meetups/info.ts b/src/commands/meetups/info.ts
index c233a6ac1ece25ac2742ad79d8b5674f6ef7410c..ed81ade98bdcea6d9e741824f4309c64fab0824d 100644
--- a/src/commands/meetups/info.ts
+++ b/src/commands/meetups/info.ts
@@ -14,9 +14,10 @@ import { UserError } from '../../discord/errors.js';
 import { partyOf, requireGuild, requireMeetup } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { MAX_MEETUP_DESCRIPTION, type MeetupParty } from '../../domain/party/party.js';
-import { problemText } from '../../render/activity.js';
 import { LIMITS, truncate } from '../../render/text.js';
+import type { Member } from '../../services/attendance-service.js';
 import { commandMeetup, partyOver } from '../parties/reply.js';
+import { timedAnswer, type TimedAnswer, type TimedChanging } from '../parties/timed.js';
 import { CHANGE_THROTTLE, changingMember } from '../raids/change.js';
 
 /** The custom-id kind of the form `/info` opens. */
@@ -162,18 +163,30 @@ async function submitted(
     throw refuse(partyOver({ type: 'meetup' }));
   }
   if (here.id !== partyId) throw new UserError(STALE_COMPONENT);
-  const outcome = await ctx.timedParties.setDescription(partyId, changingMember(interaction), text);
-  if (outcome.kind === 'gone') throw refuse(partyOver({ type: 'meetup' }));
-  if (outcome.kind === 'refused') {
-    throw refuse(problemText(outcome.reason, ctx.attendance.limits(), 'meetup'));
-  }
-  const cleared = outcome.party.meetup.description === null;
-  await interaction.reply({
-    content: !outcome.changed
+  const meetup = { id: partyId, type: 'meetup' } as const;
+  const answer = await describeAs(ctx, meetup, changingMember(interaction), text);
+  if (answer.kind !== 'ok') throw refuse(answer.text);
+  await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
+}
+
+/**
+ * `/info` as the member: what the post of a meetup says about it (anybody in the post may; a
+ * text of nothing but white space removes it), in its words. `drawn`: the information the change
+ * was drawn from (the live map), refused when the meetup has other by now.
+ */
+export async function describeAs(
+  ctx: TimedChanging,
+  party: Pick<MeetupParty, 'id' | 'type'>,
+  member: Member,
+  text: string,
+  drawn?: string | null,
+): Promise<TimedAnswer> {
+  const outcome = await ctx.timedParties.setDescription(party.id, member, text, drawn);
+  return timedAnswer(ctx, party, outcome, (ok) =>
+    !ok.changed
       ? 'Nothing changed: that is what the post says already.'
-      : cleared
+      : ok.party.meetup.description === null
         ? 'The post of this meetup has no information any more.'
         : 'The post of this meetup shows what you wrote, under "Meeting Information".',
-    flags: MessageFlags.Ephemeral,
-  });
+  );
 }
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index 75f2c1fbb51fb03646c2c1cfba7a8cc4e43d8cd1..c52635c344e59c392ca1645570839ed4f63ec77f 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -16,19 +16,21 @@ import type { Throttle } from '../../discord/throttle.js';
 import type { Place } from '../../domain/geo/place.js';
 import { mayRequestReview, type MeetupVerdict } from '../../domain/meetups/safety.js';
 import { tidyDescription } from '../../domain/party/meetup.js';
-import { MAX_PARTY_NAME } from '../../domain/party/party.js';
+import { MAX_PARTY_NAME, type MeetupParty } from '../../domain/party/party.js';
 import { NO_POST_MADE, problemText } from '../../render/activity.js';
 import { blockedAnswer } from '../../render/meetup-safety.js';
+import type { MakeAsk } from '../../services/meetup-safety.js';
 import { EXPIRED, PendingRequests } from '../../services/pending-requests.js';
 import {
   newPartyTimes,
-  noForumYet,
+  noForumWords,
   requirePlaceForNew,
   TIMED_TIME_HINT,
   typedTimedTime,
 } from '../parties/timed.js';
 import { MAX_PLACE_TEXT, namedPlace, nearChoices, type PlaceKindsOnly } from '../place-option.js';
 import { MEETUP_PLACE_KINDS } from '../../services/place-finder.js';
+import { DISCORD_NAMES, type ReportNames } from '../raids/report.js';
 import { INFO_INPUT, infoInput, refusedWithText } from './info.js';
 
 /** Where `/meetup` works, said wherever it does not. */
@@ -318,49 +320,94 @@ async function submitted(
   if (tidyDescription(text) === null) throw refuse(NO_INFORMATION);
   if (asked.startTime <= Date.now()) throw refuse(START_PASSED);
   await interaction.deferReply({ flags: MessageFlags.Ephemeral });
-  const outcome = await ctx.meetupSafety.make({
-    serverId: asked.serverId,
-    regionChannelId: asked.regionChannelId,
-    maker: { id: interaction.user.id, ...memberInfo(interaction) },
-    place: asked.place,
-    name: asked.name,
-    startTime: asked.startTime,
-    description: text,
-    staff: isStaff(interaction, ctx),
-  });
+  const answer = await makeMeetupAs(
+    ctx,
+    {
+      serverId: asked.serverId,
+      regionChannelId: asked.regionChannelId,
+      maker: { id: interaction.user.id, ...memberInfo(interaction) },
+      place: asked.place,
+      name: asked.name,
+      startTime: asked.startTime,
+      description: text,
+      staff: isStaff(interaction, ctx),
+    },
+    DISCORD_NAMES,
+  );
   // The guard has looked at most of these; what follows is for what changed in between.
-  switch (outcome.kind) {
+  switch (answer.kind) {
     case 'blocked':
       throw blockedRefusal(asked.serverId);
     case 'refused':
-      throw refuse(NO_MEETUP_HERE);
+      throw refuse(answer.text);
+    case 'held':
+      await interaction.editReply({ content: answer.text });
+      return;
+    case 'posted':
+      await interaction.editReply({
+        content:
+          `${answer.text} There, \`/meet\` changes when it starts, \`/end\` sets when it ends, ` +
+          'and `/info` changes what it says.',
+      });
+  }
+}
+
+/**
+ * What came of a meetup its maker asked to make (`makeMeetupAs`), in `/meetup`'s words: posted
+ * (with the meetup), held for the moderators (`MEETUP_HELD`), the maker blocked
+ * (`NO_MEETUPS_FOR_YOU`: on Discord with Appeal), or refused.
+ */
+export type MeetupMadeAnswer =
+  | { kind: 'posted'; party: MeetupParty; text: string }
+  | { kind: 'held'; text: string }
+  | { kind: 'blocked'; text: string }
+  | { kind: 'refused'; text: string };
+
+/**
+ * Makes a meetup as its maker asked, as the form of `/meetup` does (the live map calls it too,
+ * plan 8M-5M): `MeetupSafety.make` (the check of the place, the meetup or the moderators'
+ * request), its outcome in `/meetup`'s words. `names` says how the answer names the post and a
+ * region's channel (mentions on Discord; on the map no post and a channel by its name). The
+ * caller has counted the use against `MEETUP_THROTTLE`, and says what to do next.
+ */
+export async function makeMeetupAs(
+  ctx: Pick<AppContext, 'meetupSafety' | 'attendance'>,
+  ask: MakeAsk,
+  names: ReportNames,
+): Promise<MeetupMadeAnswer> {
+  const outcome = await ctx.meetupSafety.make(ask);
+  const refused = (text: string): MeetupMadeAnswer => ({ kind: 'refused', text });
+  switch (outcome.kind) {
+    case 'blocked':
+      return { kind: 'blocked', text: NO_MEETUPS_FOR_YOU };
+    case 'refused':
+      return refused(NO_MEETUP_HERE);
     case 'power-spot':
-      throw refuse(NO_POWER_SPOT);
+      return refused(NO_POWER_SPOT);
     case 'too-soon':
-      throw refuse(MEETUP_TOO_SOON);
+      return refused(MEETUP_TOO_SOON);
     case 'not-sent':
-      throw refuse(MEETUP_NOT_SENT);
+      return refused(MEETUP_NOT_SENT);
     case 'bad-name':
-      throw refuse(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
+      return refused(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
     case 'bad-description':
-      throw refuse(problemText('description-too-long', ctx.attendance.limits(), 'meetup'));
+      return refused(problemText('description-too-long', ctx.attendance.limits(), 'meetup'));
     case 'no-region':
-      throw refuse(FROM_A_REGION);
+      return refused(FROM_A_REGION);
     case 'no-forum':
-      throw refuse(noForumYet(outcome.region.channelId));
+      return refused(noForumWords(names.channel(outcome.region.channelId)));
     case 'no-post':
-      throw refuse(NO_POST_MADE);
+      return refused(NO_POST_MADE);
     case 'held':
-      await interaction.editReply({ content: MEETUP_HELD });
-      return;
+      return { kind: 'held', text: MEETUP_HELD };
     case 'posted': {
       const post = outcome.party.forumPostId;
-      await interaction.editReply({
-        content:
-          `Your meetup is made.${post === null ? '' : ` Its post is <#${post}>.`} ` +
-          'There, `/meet` changes when it starts, `/end` sets when it ends, and `/info` ' +
-          'changes what it says.',
-      });
+      const named = post === null ? undefined : names.post(post);
+      return {
+        kind: 'posted',
+        party: outcome.party,
+        text: `Your meetup is made.${named === undefined ? '' : ` Its post is ${named}.`}`,
+      };
     }
   }
 }
diff --git a/src/commands/parties/name.ts b/src/commands/parties/name.ts
index 721d48328849902f7fc6c6ecc5a31ab439926946..502b0b03ba5cc0412d5246c6d30e72967be71128 100644
--- a/src/commands/parties/name.ts
+++ b/src/commands/parties/name.ts
@@ -1,12 +1,10 @@
 import { SlashCommandBuilder } from 'discord.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { requireTimed } from '../../discord/guards.js';
-import { MAX_PARTY_NAME, partyWord } from '../../domain/party/party.js';
-import { nameOf } from '../../domain/party/timed.js';
-import { plain } from '../../render/text.js';
+import { MAX_PARTY_NAME } from '../../domain/party/party.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
 import { actingMember, commandTimed } from './reply.js';
-import { answerTimedChange } from './timed.js';
+import { renameAs, replyTimed } from './timed.js';
 
 /**
  * `/name` (spec 4.2): another name for the party of this post, when it is a party that has a
@@ -37,17 +35,7 @@ export const name: SimpleCommand = {
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandTimed(interaction, ctx);
-    const word = partyWord(party);
-    const outcome = await ctx.timedParties.setName(
-      party.id,
-      actingMember(interaction),
-      interaction.options.getString('name', true),
-    );
-    await answerTimedChange(interaction, ctx, party, outcome, (ok) => {
-      const called = `**${plain(nameOf(ok.party))}**`;
-      return ok.changed
-        ? `This ${word} is now called ${called}.`
-        : `This ${word} is called ${called} already.`;
-    });
+    const text = interaction.options.getString('name', true);
+    await replyTimed(interaction, await renameAs(ctx, party, actingMember(interaction), text));
   },
 };
diff --git a/src/commands/parties/timed.ts b/src/commands/parties/timed.ts
index 489375f1d3c1065df9a7560d3930dd2dbef06e0e..7e004e40b90b156b57b0e5cc8191998c89e9ab75 100644
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -5,12 +5,13 @@ import type { Guard } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { partyOf, regionChannelOf } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { partyWord, type TimedParty } from '../../domain/party/party.js';
-import { startTimeOf, tidyName } from '../../domain/party/timed.js';
+import { partyWord, type PartyProblem, type TimedParty } from '../../domain/party/party.js';
+import { nameOf, startTimeOf, tidyName } from '../../domain/party/timed.js';
 import { resolvePartyTime } from '../../domain/time/party-time.js';
 import { problemText } from '../../render/activity.js';
 import { clockOrDay, plain, timestamp, truncate } from '../../render/text.js';
 import type { TimedChangeOutcome } from '../../services/timed-party-service.js';
+import type { Member } from '../../services/attendance-service.js';
 import { between } from '../raids/raid-input.js';
 import { actingMember, partyOver } from './reply.js';
 
@@ -24,8 +25,6 @@ export const START_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };
 export const TIMED_TIME_HINT =
   'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';
 
-type Ok<Extra> = Extract<TimedChangeOutcome<Extra>, { kind: 'ok' }>;
-
 /** What a member is told who makes a train or meetup in a region that has no forum yet. */
 export function noForumYet(regionChannelId: string): string {
   return noForumWords(`<#${regionChannelId}>`);
@@ -144,47 +143,97 @@ export function typedTimedTime(
 }
 
 /** A time as an answer names it: with its date when it is not today, and how long until then. */
-function when(ctx: AppContext, time: number, now: number): string {
+function when(ctx: Pick<AppContext, 'config'>, time: number, now: number): string {
   return `${clockOrDay(time, now, ctx.config.settings.timezone)} (${timestamp(time, 'R')})`;
 }
 
 /**
- * Tells the member, privately, what came of a change to a timed party: what `words` makes of
- * it. A refusal and a party that has ended are thrown as `UserError`s, which name the kind of
- * `party`, the party as the command found it.
+ * What `/name`, `/meet`, `/cancel-meet`, `/end` (of a timed party) and `/info` need of the bot to
+ * change a timed party (plan 8M-5M: the live map calls the same functions): the timed parties,
+ * the limits of the words, the settings (the zone of the times).
  */
-export async function answerTimedChange<Extra>(
-  interaction: ChatInputCommandInteraction,
-  ctx: AppContext,
-  party: TimedParty,
-  outcome: TimedChangeOutcome<Extra>,
-  words: (ok: Ok<Extra>) => string,
-): Promise<void> {
-  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
+export type TimedChanging = Pick<AppContext, 'timedParties' | 'attendance' | 'config'>;
+
+/**
+ * What came of a change of a timed party, in the command's words: `ok`; `refused` with the
+ * service's reason (the map tells a change drawn from what the party no longer is by it,
+ * `changed-meanwhile`); `gone` for a party that has ended. A command throws what is not `ok` as
+ * a `UserError` (`replyTimed`); the map answers it.
+ */
+export type TimedAnswer =
+  | { kind: 'ok'; text: string }
+  | { kind: 'refused'; text: string; reason: PartyProblem }
+  | { kind: 'gone'; text: string };
+
+/** The answer of a change of `party`: `said` of what it came to, or the refusal, or over. */
+export function timedAnswer<Extra, P extends TimedParty>(
+  ctx: Pick<AppContext, 'attendance'>,
+  party: Pick<TimedParty, 'type'>,
+  outcome: TimedChangeOutcome<Extra, P>,
+  said: (ok: Extract<TimedChangeOutcome<Extra, P>, { kind: 'ok' }>) => string,
+): TimedAnswer {
+  if (outcome.kind === 'gone') return { kind: 'gone', text: partyOver(party) };
   if (outcome.kind === 'refused') {
-    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), partyWord(party)));
+    return {
+      kind: 'refused',
+      text: problemText(outcome.reason, ctx.attendance.limits(), partyWord(party)),
+      reason: outcome.reason,
+    };
   }
-  await interaction.reply({
-    content: words(outcome),
-    flags: MessageFlags.Ephemeral,
-  });
+  return { kind: 'ok', text: said(outcome) };
 }
 
 /**
- * `/meet` and `/cancel-meet` in the post of a timed party: sets when it starts, for everybody,
- * or removes the start (`time` null), and answers. The others are told a moment later, once the
- * start has stood for a few seconds (`TimedPartyService`).
+ * Tells the member, privately, what came of a change to a timed party: the answer's words; a
+ * refusal and a party that has ended are thrown as `UserError`s.
  */
-export async function changeStart(
+export async function replyTimed(
   interaction: ChatInputCommandInteraction,
-  ctx: AppContext,
+  answer: TimedAnswer,
+): Promise<void> {
+  if (answer.kind !== 'ok') throw new UserError(answer.text);
+  await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
+}
+
+/**
+ * `/name` as the member: another name for the train or meetup (anybody in the post may), in its
+ * words. `drawn`: the name the change was drawn from (the live map), refused when the party has
+ * another by now.
+ */
+export async function renameAs(
+  ctx: TimedChanging,
   party: TimedParty,
+  member: Member,
+  text: string,
+  drawn?: string,
+): Promise<TimedAnswer> {
+  const word = partyWord(party);
+  const outcome = await ctx.timedParties.setName(party.id, member, text, drawn);
+  return timedAnswer(ctx, party, outcome, (ok) => {
+    const called = `**${plain(nameOf(ok.party))}**`;
+    return ok.changed
+      ? `This ${word} is now called ${called}.`
+      : `This ${word} is called ${called} already.`;
+  });
+}
+
+/**
+ * `/meet` and `/cancel-meet` as the member in a timed party: when it starts, for everybody, or
+ * no start (`time` null), in their words. The others are told a moment later, once the start has
+ * stood for a few seconds (`TimedPartyService`). `drawn`: the start the change was drawn from
+ * (the live map).
+ */
+export async function startAs(
+  ctx: TimedChanging,
+  party: TimedParty,
+  member: Member,
   time: number | null,
-): Promise<void> {
-  const now = Date.now();
+  now: number,
+  drawn?: number | null,
+): Promise<TimedAnswer> {
   const word = partyWord(party);
-  const outcome = await ctx.timedParties.setStartTime(party.id, actingMember(interaction), time);
-  await answerTimedChange(interaction, ctx, party, outcome, (ok) => {
+  const outcome = await ctx.timedParties.setStartTime(party.id, member, time, drawn);
+  return timedAnswer(ctx, party, outcome, (ok) => {
     const start = startTimeOf(ok.party);
     const told = ok.changed && ok.others.length > 0 ? ' I am telling the others.' : '';
     if (start === null) {
@@ -198,24 +247,27 @@ export async function changeStart(
 }
 
 /**
- * `/end` in the post of a timed party: sets when it ends from what the member typed, or removes
- * the end (`none`, `cancel`, `unset`), and answers.
+ * `/end` as the member in a timed party: when it ends, from what they typed (`typedTimedTime`,
+ * whose refusal is thrown as a `UserError`), or no end (`none`, `cancel`, `unset`), in its words.
+ * `drawn`: the end the change was drawn from (the live map).
  */
-export async function changeEnd(
-  interaction: ChatInputCommandInteraction,
-  ctx: AppContext,
+export async function endAs(
+  ctx: TimedChanging,
   party: TimedParty,
+  member: Member,
   text: string,
-): Promise<void> {
-  const now = Date.now();
+  now: number,
+  drawn?: number | null,
+): Promise<TimedAnswer> {
   const word = partyWord(party);
   const typed = typedTimedTime(ctx, party, 'end', text, now);
   const outcome = await ctx.timedParties.setEndTime(
     party.id,
-    actingMember(interaction),
+    member,
     typed === 'unset' ? null : typed.at,
+    drawn,
   );
-  await answerTimedChange(interaction, ctx, party, outcome, (ok) => {
+  return timedAnswer(ctx, party, outcome, (ok) => {
     const end = ok.party.endTime;
     if (end === null) {
       return ok.changed
@@ -227,3 +279,35 @@ export async function changeEnd(
       : `This ${word} already ends at ${when(ctx, end, now)}.`;
   });
 }
+
+/**
+ * `/meet` and `/cancel-meet` in the post of a timed party: sets when it starts, for everybody,
+ * or removes the start (`time` null), and answers (`startAs`).
+ */
+export async function changeStart(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  party: TimedParty,
+  time: number | null,
+): Promise<void> {
+  await replyTimed(
+    interaction,
+    await startAs(ctx, party, actingMember(interaction), time, Date.now()),
+  );
+}
+
+/**
+ * `/end` in the post of a timed party: sets when it ends from what the member typed, or removes
+ * the end (`none`, `cancel`, `unset`), and answers (`endAs`).
+ */
+export async function changeEnd(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  party: TimedParty,
+  text: string,
+): Promise<void> {
+  await replyTimed(
+    interaction,
+    await endAs(ctx, party, actingMember(interaction), text, Date.now()),
+  );
+}
diff --git a/src/db/migrations/2026_10_17_020_meetup_request_source.ts b/src/db/migrations/2026_10_17_020_meetup_request_source.ts
new file mode 100644
index 0000000000000000000000000000000000000000..396620213a9ea0f41e18ad0eb558fbf49fdae73c
--- /dev/null
+++ b/src/db/migrations/2026_10_17_020_meetup_request_source.ts
@@ -0,0 +1,28 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Where a meetup held for the moderators was asked for (plan 8M-5M): `MeetupRequest.source` is
+ * `map` for a meetup asked for on the live map, null for `/meetup` (and every row from before).
+ * The moderators' post is drawn anew from the row at each decision and at expiry, so it says
+ * "on the map" only when the row keeps it.
+ *
+ * 020: after 8S-1's `019_meetup_safety`; renumbered at the merge if another branch took 020 first.
+ *
+ * Safe to run again after a failure half-way: the column is added only when it is missing.
+ */
+export const meetupRequestSource: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const existing = await sql<{ n: number }>`
+      select count(*) as n from information_schema.columns
+      where table_schema = database() and table_name = 'MeetupRequest'
+        and column_name = 'source'`.execute(db);
+    if (Number(existing.rows[0]?.n ?? 0) === 0) {
+      await sql`alter table MeetupRequest add column source varchar(8) default null`.execute(db);
+    }
+  },
+  async down() {
+    // Additive only: the column stays.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 0d18c715fe4869961fd8970adea27e1845074f81..70553bb4280b2b3410d06bed1432b2938e99b46b 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -18,6 +18,7 @@ import { webSession } from './2026_10_16_015_web_session.js';
 import { wayspot } from './2026_10_16_017_wayspot.js';
 import { partyHistory } from './2026_10_16_018_party_history.js';
 import { meetupSafety } from './2026_10_17_019_meetup_safety.js';
+import { meetupRequestSource } from './2026_10_17_020_meetup_request_source.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -43,4 +44,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_16_017_wayspot': wayspot,
   '2026_10_16_018_party_history': partyHistory,
   '2026_10_17_019_meetup_safety': meetupSafety,
+  '2026_10_17_020_meetup_request_source': meetupRequestSource,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index e35367e284352b46f9155a6adc5012d155999ac6..8a2376c30f875446754aaff2361267a5bc6383ae 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -166,6 +166,7 @@ describe('runMigrations', () => {
       '2026_10_16_017_wayspot',
       '2026_10_16_018_party_history',
       '2026_10_17_019_meetup_safety',
+      '2026_10_17_020_meetup_request_source',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/meetup-safety-repository.ts b/src/db/repositories/meetup-safety-repository.ts
index c3a6c56256e11021292976a56f0f0a0796920339..839cccf31abf496e98256ee0fddc8b9dcb1bacf0 100644
--- a/src/db/repositories/meetup-safety-repository.ts
+++ b/src/db/repositories/meetup-safety-repository.ts
@@ -164,6 +164,7 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
         status: 'pending',
         channelId: request.channelId,
         messageId: request.messageId,
+        source: request.source,
       })
       .execute();
   }
@@ -413,6 +414,8 @@ export class MeetupSafetyRepository implements MeetupSafetyStore {
       decidedByName: row.decidedByName,
       decidedAt: epoch(row.decidedAt),
       partyId: row.partyId,
+      // Anything but the one source known is `/meetup`'s.
+      source: row.source === 'map' ? 'map' : null,
     };
   }
 }
diff --git a/src/db/types.ts b/src/db/types.ts
index eb1caa350209c481c5dbd28ede2b0df3e0c64303..cf6f50de2809ad0a582effbca86dfc8bd733908f 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -201,6 +201,7 @@ export interface MeetupRequest {
   place: Json;
   regionChannelId: string;
   serverId: string;
+  source: string | null;
   startTime: string;
   status: string;
 }
diff --git a/src/domain/meetups/records.ts b/src/domain/meetups/records.ts
index fa6c0c2829088c33e909a2789a18f5ea69bb15e0..48609e68bea06478c7713a80d4acab303003d4d0 100644
--- a/src/domain/meetups/records.ts
+++ b/src/domain/meetups/records.ts
@@ -55,8 +55,16 @@ export interface MeetupRequestRecord {
   decidedAt: number | null;
   /** The meetup an approval made. */
   partyId: string | null;
+  /**
+   * Where the maker asked for it: `map`, the live map (plan 8M-5M), which its post says; null
+   * for `/meetup`.
+   */
+  source: RequestSource | null;
 }
 
+/** Where a meetup was asked for other than by `/meetup`: the live map. */
+export type RequestSource = 'map';
+
 /** A request as it is first stored: pending, with its post, without a decision. */
 export type NewMeetupRequest = Omit<
   MeetupRequestRecord,
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 17837ca1948e36bbe7d2128bbcef7b04750cb39b..43a62a9689de74fd68a9f854bd175630d9b7e7d7 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -486,7 +486,12 @@ export type PartyProblem =
    * The conductor role is no longer whose it was when a button was drawn (the live map): the
    * button would take it over or drop it from somebody it did not show.
    */
-  | 'conductor-changed';
+  | 'conductor-changed'
+  /**
+   * A change of a timed party drawn from a name, information or time it no longer has (the live
+   * map's meetup editor): another change came meanwhile.
+   */
+  | 'changed-meanwhile';
 
 /** A change that was not made. It has no `party`, which is how `PartyStore.update` knows. */
 export interface Refusal {
diff --git a/src/domain/party/timed.ts b/src/domain/party/timed.ts
index b4d821dd04c868b17ef5f2fb28fbb09355154a97..6488d9e4d65941cf622b46ab4c1b8962ba3c0d05 100644
--- a/src/domain/party/timed.ts
+++ b/src/domain/party/timed.ts
@@ -7,6 +7,7 @@ import {
   withLastPossibleTime,
   type Change,
   type PartyCore,
+  type Refusal,
   type TimedDetails,
   type TimedParty,
 } from './party.js';
@@ -96,6 +97,15 @@ export function nameOf(party: TimedParty): string {
   return party.timed.name;
 }
 
+/**
+ * Whether a change drawn from `drawn` (a name, information or time as the live map's editor
+ * showed it) still fits the party, whose value is `now`: the refusal `changed-meanwhile` when it
+ * is another by now, else undefined. Nothing drawn (`undefined`: the commands) always fits.
+ */
+export function asDrawn<T>(now: T, drawn: T | undefined): Refusal | undefined {
+  return drawn === undefined || drawn === now ? undefined : refused('changed-meanwhile');
+}
+
 /** When a timed party starts, for everybody; null while nobody has said. */
 export function startTimeOf(party: TimedParty): number | null {
   return party.timed.startTime;
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 9c7aea150726c7eef3dcb95db446de83aabe0a95..c78508e7142ead23e00e7f275e35fac772597c28 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -195,6 +195,8 @@ export function problemText(
       return 'The route changed meanwhile: here it is as it is now.';
     case 'conductor-changed':
       return 'The conductor of this train changed meanwhile: here it is as it is now.';
+    case 'changed-meanwhile':
+      return `This ${word} changed meanwhile: here it is as it is now.`;
   }
 }
 
diff --git a/src/render/meetup-safety.test.ts b/src/render/meetup-safety.test.ts
index 1f032b9eb0400ff9bc0d906b634e7ed07538840b..5dc93232acecbb7e8d1251c868fb5dda00fb0ced 100644
--- a/src/render/meetup-safety.test.ts
+++ b/src/render/meetup-safety.test.ts
@@ -66,6 +66,20 @@ describe('requestMessage', () => {
     expectV2Sendable(message);
   });
 
+  it('says that a meetup was asked for on the live map, before and after it is decided', () => {
+    const asked = `Asked by **Alice** (<@200000000000000002>) on the map in <#100000000000000001>`;
+    expect(textOf(requestMessage(pending({ source: 'map' })))).toContain(asked);
+    const decided = pending({
+      source: 'map',
+      status: 'refused',
+      decision: 'refuse',
+      decidedBy: '200000000000000009',
+      decidedAt: SAFETY_NOW,
+    });
+    expect(textOf(requestMessage(decided))).toContain(asked);
+    expect(textOf(requestMessage(pending()))).not.toContain('on the map');
+  });
+
   it('offers no ruling for a pin: Approve once, Refuse and Block member', () => {
     const message = requestMessage(pending({ place: SAFETY_PIN }));
     expect(textOf(message)).toContain(
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
index b77be27ad757e880a95e50da4a007ffc9c26cccb..d350ef20201693cb761056ac708a4290e526246a 100644
--- a/src/render/meetup-safety.ts
+++ b/src/render/meetup-safety.ts
@@ -309,7 +309,8 @@ export function requestOutcomeDm(
 
 /**
  * The moderators' post of a request (plan 8S-1): who asked (by `memberText`, so that a
- * moderator can open their profile), in which region, the meetup's name and start, where it is
+ * moderator can open their profile), whether on the live map (`source`, plan 8M-5M), in which
+ * region, the meetup's name and start, where it is
  * (the place's kind, title, address and Map, a pin as `pinLine` shows it; the Wayspot's picture
  * beside it), its information (never cut), and when the request expires; with the buttons of
  * `decisionsFor` while it waits, and what came of it afterwards (who decided, and `postId`, the
@@ -327,7 +328,7 @@ export function requestMessage(
     waiting ? '### Meetup waiting for approval' : '### Meetup request',
     `**${plain(request.name)}**`,
     `Starts ${timestamp(request.startTime, 'F')} (${timestamp(request.startTime, 'R')})`,
-    `Asked by ${maker} in <#${request.regionChannelId}>`,
+    `Asked by ${maker}${request.source === 'map' ? ' on the map' : ''} in <#${request.regionChannelId}>`,
   ].join('\n');
   const where = `**Where**\n${placeLine(request.place)}`;
   const picture = request.place.kind === 'pin' ? undefined : wayspotPicture(request.place.image);
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index 5c84a2c1fbc24ea66ebcc1d59bb28892d9edca74..22fe60d4687ba44a1b5040b6249d23c582f338a8 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -124,6 +124,17 @@ describe('MeetupSafety.submit', () => {
     expect(stored?.messageId).toBe(post?.id);
     expect(textOf(post?.message)).toContain('### Meetup waiting for approval');
     expect(buttonLabels(post?.message)).toContain('Approve');
+    expect(stored?.source).toBeNull();
+    expect(textOf(post?.message)).not.toContain('on the map');
+  });
+
+  it('keeps where a meetup was asked for, and its post says it was the live map', async () => {
+    const made = await meetupSafetyWith();
+    expect((await made.safety.submit({ ...asked(), source: 'map' })).kind).toBe('sent');
+    const [stored] = made.storage.requests.values();
+    expect(stored?.source).toBe('map');
+    const [post] = made.gateway.messagesIn(MOD_CHANNEL);
+    expect(textOf(post?.message)).toContain(` on the map in <#${WEST_CHANNEL}>`);
   });
 
   it('keeps nothing when the moderators’ channel is not there, and says so in the log', async () => {
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index 54549db468ba24db94345edeab4473f83cce8401..d46271ef8b197acf5832ce2b142cea1f88f596e4 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -9,6 +9,7 @@ import type {
   MeetupRequestRecord,
   MeetupSafetyStore,
   RequestDecision,
+  RequestSource,
 } from '../domain/meetups/records.js';
 import { isMeetup, type MeetupParty } from '../domain/party/party.js';
 import {
@@ -65,6 +66,8 @@ export interface RequestAsk {
   startTime: number;
   /** As typed: it is tidied as a meetup's information is. */
   description: string;
+  /** Asked for on the live map (plan 8M-5M): its post says so. Left out: `/meetup`. */
+  source?: RequestSource;
 }
 
 /** What came of asking the moderators. */
@@ -355,6 +358,7 @@ export class MeetupSafety {
       decidedByName: null,
       decidedAt: null,
       partyId: null,
+      source: ask.source ?? null,
     };
     let messageId: string | undefined;
     try {
diff --git a/src/services/timed-party-service.test.ts b/src/services/timed-party-service.test.ts
index 41062201159c40d914dc03551611cfdd6c4d64fb..951852f9e7666b8e9ea7615fe437bf2e7bc4fb3a 100644
--- a/src/services/timed-party-service.test.ts
+++ b/src/services/timed-party-service.test.ts
@@ -349,6 +349,50 @@ describe('TimedPartyService: a party that is no meetup, or no more', () => {
   });
 });
 
+describe('TimedPartyService: a change drawn from what the party was (the live map)', () => {
+  it('refuses each change whose value it was drawn from is no longer the party’s, and changes nothing', async () => {
+    const made = await withMembers();
+    await made.timed.setStartTime(made.party.id, alice, START);
+    await made.timed.setEndTime(made.party.id, alice, END);
+    await made.timed.setDescription(made.party.id, alice, 'Bring snacks.');
+    await settled(made);
+    const before = made.current();
+    const stale = { kind: 'refused', reason: 'changed-meanwhile' };
+    expect(await made.timed.setName(made.party.id, alice, 'Picnic', 'Another name')).toEqual(stale);
+    expect(await made.timed.setDescription(made.party.id, alice, 'x', null)).toEqual(stale);
+    expect(await made.timed.setStartTime(made.party.id, alice, START + HOUR, null)).toEqual(stale);
+    expect(await made.timed.setEndTime(made.party.id, alice, END + HOUR, END - HOUR)).toEqual(
+      stale,
+    );
+    expect(made.current()).toBe(before);
+  });
+
+  it('makes a change drawn from the party as it is', async () => {
+    const made = await withMembers();
+    await made.timed.setStartTime(made.party.id, alice, START);
+    await made.timed.setDescription(made.party.id, alice, 'Bring snacks.');
+    expect(
+      await made.timed.setName(made.party.id, alice, 'Picnic', 'Community Day picnic'),
+    ).toMatchObject({ kind: 'ok', changed: true });
+    expect(
+      await made.timed.setDescription(made.party.id, alice, 'Bring tea.', 'Bring snacks.'),
+    ).toMatchObject({ kind: 'ok', changed: true });
+    expect(await made.timed.setStartTime(made.party.id, alice, START + HOUR, START)).toMatchObject({
+      kind: 'ok',
+      changed: true,
+    });
+    expect(await made.timed.setEndTime(made.party.id, alice, END + HOUR, null)).toMatchObject({
+      kind: 'ok',
+      changed: true,
+    });
+    expect(made.current()).toMatchObject({
+      timed: { name: 'Picnic', startTime: START + HOUR },
+      endTime: END + HOUR,
+      meetup: { description: 'Bring tea.' },
+    });
+  });
+});
+
 describe('TimedPartyService: starts set while an announcement is on its way', () => {
   it('says every start once, and the last one last', async () => {
     const made = await withMembers();
diff --git a/src/services/timed-party-service.ts b/src/services/timed-party-service.ts
index 8ecb86eb5fb22a3c3a3038d4e0d02f35126d7fda..935b30d90c4ad9d95bdfffa69003dfcee04c1405 100644
--- a/src/services/timed-party-service.ts
+++ b/src/services/timed-party-service.ts
@@ -14,7 +14,14 @@ import {
 } from '../domain/party/party.js';
 import { setDescription } from '../domain/party/meetup.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { nameOf, setName, setStartTime, setTimedEnd, startTimeOf } from '../domain/party/timed.js';
+import {
+  asDrawn,
+  nameOf,
+  setName,
+  setStartTime,
+  setTimedEnd,
+  startTimeOf,
+} from '../domain/party/timed.js';
 import type { Logger } from '../log.js';
 import { doer } from '../render/activity.js';
 import { clockOrDay, LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
@@ -100,14 +107,21 @@ export class TimedPartyService {
 
   /**
    * Another name for the party; the title of its post follows with the next render. Anybody in
-   * the post may. Refused with `bad-name` for a text that is no name.
+   * the post may. Refused with `bad-name` for a text that is no name. `drawn`: the name the
+   * change was drawn from (the live map), refused with `changed-meanwhile` when the party has
+   * another by now; left out, none is asked (the commands).
    */
-  setName(partyId: string, member: Member, text: string): Promise<TimedChangeOutcome> {
+  setName(
+    partyId: string,
+    member: Member,
+    text: string,
+    drawn?: string,
+  ): Promise<TimedChangeOutcome> {
     return this.apply(
       partyId,
       member,
       isTimed,
-      (party) => setName(party, text),
+      (party) => asDrawn(nameOf(party), drawn) ?? setName(party, text),
       (party) => {
         const who = doer(party, member);
         const name = `**${plain(nameOf(party))}**`;
@@ -127,12 +141,13 @@ export class TimedPartyService {
     partyId: string,
     member: Member,
     text: string,
+    drawn?: string | null,
   ): Promise<TimedChangeOutcome<unknown, MeetupParty>> {
     return this.apply(
       partyId,
       member,
       isMeetup,
-      (party) => setDescription(party, text),
+      (party) => asDrawn(party.meetup.description, drawn) ?? setDescription(party, text),
       (party) =>
         party.meetup.description === null
           ? `${memberText(member)} removed the information.`
@@ -149,11 +164,12 @@ export class TimedPartyService {
     partyId: string,
     member: Member,
     time: number | null,
+    drawn?: number | null,
   ): Promise<TimedChangeOutcome<{ others: string[] }>> {
     let before: number | null = null;
     const outcome = await this.apply(partyId, member, isTimed, (party, now) => {
       before = startTimeOf(party);
-      return setStartTime(party, member.id, time, now);
+      return asDrawn(before, drawn) ?? setStartTime(party, member.id, time, now);
     });
     if (outcome.kind === 'ok' && outcome.changed) this.announceLater(partyId, before, member);
     return outcome;
@@ -163,12 +179,17 @@ export class TimedPartyService {
    * When the party ends, or no end any more with null. Anybody in the post may (as with the
    * legacy bot); refused when it would not lie after the start. The caller has checked the time.
    */
-  setEndTime(partyId: string, member: Member, time: number | null): Promise<TimedChangeOutcome> {
+  setEndTime(
+    partyId: string,
+    member: Member,
+    time: number | null,
+    drawn?: number | null,
+  ): Promise<TimedChangeOutcome> {
     return this.apply(
       partyId,
       member,
       isTimed,
-      (party, now) => setTimedEnd(party, time, now),
+      (party, now) => asDrawn(party.endTime, drawn) ?? setTimedEnd(party, time, now),
       (party) => {
         const who = doer(party, member);
         const word = partyWord(party);
diff --git a/test/support/meetup-safety-cases.ts b/test/support/meetup-safety-cases.ts
index a7b1d0474c1811e578d92b3a54936eff2518e932..f704caf0cb2e09f9223b7f755b3739d364d2a218 100644
--- a/test/support/meetup-safety-cases.ts
+++ b/test/support/meetup-safety-cases.ts
@@ -54,6 +54,7 @@ export function newRequest(n: number, overrides: Partial<NewMeetupRequest> = {})
     expiresAt: SAFETY_NOW + 23 * HOUR,
     channelId: '600000000000000001',
     messageId: `6000000000000${String(10_000 + n)}`,
+    source: null,
     ...overrides,
   };
 }
@@ -130,11 +131,12 @@ export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void
       decidedAt: null,
       partyId: null,
     });
-    await store.addRequest(newRequest(2, { makerTeam: null, makerName: null }));
+    await store.addRequest(newRequest(2, { makerTeam: null, makerName: null, source: 'map' }));
     expect(await store.request(requestId(2))).toMatchObject({
       makerTeam: null,
       makerName: null,
       place: LIBRARY,
+      source: 'map',
     });
     expect(await store.request(requestId(3))).toBeUndefined();
     expect(await store.request(requestId(1))).toMatchObject({
````

### Task 2: Meetups from the map: making a meetup

Prototype commit: `d85ed01c0db769c25e91356ccc6ad95f1b472054`

`POST /s/<guild>/api/meetups` `{ region, name, place, start, info }` (a place: a gym or PokéStop by id, or a pin): the per-address limit and `postGuard` before the body, the member checks, the region's forum, then `/meetup`'s checks in its order (name, block before the place, place, start, verdict, information), none counted; then `MEETUP_THROTTLE` and `makeMeetupAs` with `source: 'map'`. Places are snapshotted as `/meetup` makes them (`pickedPlace`; a pin named only by a gym or stop). A blocked member is pointed to `/meetup` (no Appeal on the map). `GET …/stops` gives the titled PokéStops of the server's regions in the view's box (never power spots), at most 300.

**Files:**

```
 src/app.ts                     |   3 +
 src/commands/meetups/meetup.ts |   6 +-
 src/commands/place-option.ts   |  20 +++-
 src/domain/web/meetup-data.ts  |  50 ++++++++++
 src/web/guild-routes.ts        |   4 +
 src/web/meetup-make.test.ts    | 439 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/meetup-routes.ts       | 381 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/server.ts              |   3 +
 test/support/web.ts            |  33 ++++++-
 9 files changed, 935 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/meetups/meetup.test.ts src/web/meetup-make.test.ts src/web/parties.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/commands/meetups/meetup.ts src/commands/place-option.ts src/domain/web/meetup-data.ts src/web/guild-routes.ts src/web/meetup-make.test.ts src/web/meetup-routes.ts src/web/server.ts test/support/web.ts` and `npx eslint src/app.ts src/commands/meetups/meetup.ts src/commands/place-option.ts src/domain/web/meetup-data.ts src/web/guild-routes.ts src/web/meetup-make.test.ts src/web/meetup-routes.ts src/web/server.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff d85ed01c0db769c25e91356ccc6ad95f1b472054 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Meetups from the map: making a meetup`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/commands/meetups/meetup.ts src/commands/place-option.ts src/domain/web/meetup-data.ts src/web/guild-routes.ts src/web/meetup-make.test.ts src/web/meetup-routes.ts src/web/server.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index d8636f9d300c88da3b8356375f58e123876d4512..d319924902d7f845a414dfc0a64351e0fd67b7f9 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -877,6 +877,9 @@ export async function startApp(
       },
       // Starting, arranging and moving trains on the map: what the train commands read and call.
       trains: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
+      // Making and changing meetups on the map: what /meetup, /name, /info, /meet and /end read
+      // and call.
+      meetups: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       now: () => Date.now(),
       log,
     });
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index c52635c344e59c392ca1645570839ed4f63ec77f..1d0ad0267dcbb29d64c29ba677af820ed8b54775 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -111,7 +111,11 @@ interface Asked {
  * The refusal of a verdict (a block is asked first, `MeetupSafety.blocked`, and refused with
  * `blockedRefusal`), or nothing when the meetup may go on (posted or held).
  */
-function refusalOf(verdict: MeetupVerdict, startTime: number, now: number): string | undefined {
+export function refusalOf(
+  verdict: MeetupVerdict,
+  startTime: number,
+  now: number,
+): string | undefined {
   if (verdict === 'refused') return NO_MEETUP_HERE;
   if (verdict === 'review' && !mayRequestReview(now, startTime)) return MEETUP_TOO_SOON;
   return undefined;
diff --git a/src/commands/place-option.ts b/src/commands/place-option.ts
index 2446eab62a5fbb905a48d2c4c0edceb9ced0f19c..7581ef4c8e44d5717c0c89017d855e013de915d5 100644
--- a/src/commands/place-option.ts
+++ b/src/commands/place-option.ts
@@ -80,7 +80,7 @@ export function orList(names: readonly string[]): string {
 }
 
 /** Whether the place a choice's value names is still known, as that kind and by a title. */
-function stillKnown(ctx: AppContext, kind: PlaceKind, id: string): boolean {
+function stillKnown(ctx: PlaceContext, kind: PlaceKind, id: string): boolean {
   if (kind === 'gym') return /^\d+$/u.test(id) && ctx.gyms.get(Number(id)) !== undefined;
   const wayspot = ctx.wayspots.byId(id);
   return wayspot?.kind === kind && wayspot.title.trim() !== '';
@@ -128,7 +128,7 @@ export async function nearChoices(
  * A choice as the place a member named: what it was when they named it (a snapshot), a gym by
  * the name its post shows (`gymName`: the nickname first).
  */
-function knownPlace(ctx: AppContext, choice: PlaceChoice): KnownPlace {
+function knownPlace(ctx: PlaceContext, choice: PlaceChoice): KnownPlace {
   // A gym is named as its post names it: by its nickname, when it has one.
   const gym = choice.kind === 'gym' ? ctx.gyms.get(Number(choice.id)) : undefined;
   return {
@@ -144,6 +144,22 @@ function knownPlace(ctx: AppContext, choice: PlaceChoice): KnownPlace {
   };
 }
 
+/** What naming a place by a pick needs: the gyms, the kept Wayspots, the search. */
+type PlaceContext = Pick<AppContext, 'gyms' | 'wayspots' | 'placeFinder'>;
+
+/**
+ * The place a pick names (`gym:7`, `stop:<Wayfarer id>`, as a choice of a `near` option has it),
+ * as `namedPlace` makes it: the same snapshot; undefined when it is gone, of another kind now, or
+ * in no region of the server (`row`). For the live map's meetups (plan 8M-5M), which pick a gym or a
+ * PokéStop on the map rather than by an option.
+ */
+export function pickedPlace(ctx: PlaceContext, row: number, value: string): KnownPlace | undefined {
+  const read = readPlaceValue(value);
+  if (!read || !stillKnown(ctx, read.kind, read.id)) return undefined;
+  const chosen = ctx.placeFinder.chosen(row, value);
+  return chosen && knownPlace(ctx, chosen);
+}
+
 /**
  * The place a `near` option names (`/wild near:`, `/meetup near:`): a choice
  * (refused when its place is gone or of another kind now, `PLACE_GONE`, or not in a region of the
diff --git a/src/domain/web/meetup-data.ts b/src/domain/web/meetup-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6669398bb2969fe218d2049d7f6f3d489025dddb
--- /dev/null
+++ b/src/domain/web/meetup-data.ts
@@ -0,0 +1,50 @@
+/**
+ * What the live map's meetups read and send (plan 8M-5M, spec 3.7), as the page reads it. Types
+ * and lists alone, with no import of the server's code: the page's bundle (`src/web/client/`)
+ * takes them.
+ */
+
+import type { MapMeetup } from './party-data.js';
+
+/**
+ * Where a new meetup is (`POST /s/<guild>/api/meetups`, `place`): a gym or a PokéStop by its kind
+ * and id (a gym's number as text, a stop's Wayfarer id), as a pick of `/meetup near:` names it,
+ * or a pin dropped on the map. Never a power spot (Matt, 2026-10-17): the map offers none, and
+ * the server refuses any other kind.
+ */
+export type MeetupPlaceBody = { kind: string; id: string } | { lat: number; lon: number };
+
+/**
+ * What making or changing a meetup answers: whether it was done, the command's words as plain
+ * text, what came of a making (`posted`, or `held` for the moderators: nothing is posted yet),
+ * and the meetup as the member now sees it on the map when there is one to show (also after a
+ * refusal of a change, so that the page draws it as it is now).
+ */
+export interface MeetupAnswer {
+  ok: boolean;
+  text: string;
+  outcome?: 'posted' | 'held';
+  meetup?: MapMeetup;
+}
+
+/**
+ * The changes of a meetup the map makes (`POST /s/<guild>/api/meetups/<id>/<change>`), each as
+ * its command does it: `name` (`/name`, body `{ drawn, name }`), `info` (`/info`, `{ drawn,
+ * info }`), `start` (`/meet`, `{ drawn, time }`; `cancel` removes it as `/meet time:cancel`
+ * does), `end` (`/end`, `{ drawn, time }`). Each carries the value it was drawn from (`drawn`, as the meetup's view gave it).
+ */
+export const MEETUP_CHANGES = ['name', 'info', 'start', 'end'] as const;
+export type MeetupChange = (typeof MEETUP_CHANGES)[number];
+
+/**
+ * The PokéStops of a server in a box of the map (`GET /s/<guild>/api/stops`), for picking a
+ * meetup's place: `[id, lat, lon, title]`, the nearest to the box's middle first, at most
+ * `MAX_MAP_STOPS`; `more` when the box holds more (the page asks to zoom in).
+ */
+export interface StopsView {
+  stops: Array<[string, number, number, string]>;
+  more: boolean;
+}
+
+/** As many stops as one answer of `/api/stops` gives. */
+export const MAX_MAP_STOPS = 300;
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 5ea4d8c65f963c6f9c460ede156ebf09eb6bbb3a..5159b9e8bcfdc244bb8fe06a6448be24f9741732 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -4,6 +4,7 @@ import { sendFailure, shortPage } from './answers.js';
 import { editorRoutes } from './editor-routes.js';
 import { etagMatches } from './geo-cache.js';
 import { mapMembers } from './map-members.js';
+import { meetupRoutes } from './meetup-routes.js';
 import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
 import { raidRoutes } from './raid-routes.js';
@@ -122,4 +123,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
 
   // Starting, arranging and moving trains on the live map (plan 8M-5): for the same members.
   trainRoutes(scope, map);
+
+  // Making and changing meetups on the live map (plan 8M-5M): for the same members.
+  meetupRoutes(scope, map);
 }
diff --git a/src/web/meetup-make.test.ts b/src/web/meetup-make.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..73548e9fa9b43fe930b5e493180bc7b225cba38c
--- /dev/null
+++ b/src/web/meetup-make.test.ts
@@ -0,0 +1,439 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import {
+  EAST_CHANNEL,
+  UNBOUNDED_CHANNEL,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../test/support/gyms.js';
+import { MOD } from '../../test/support/meetup-safety-cases.js';
+import {
+  MOD_CHANNEL,
+  meetupSafetyWith,
+  type SafetyOptions,
+} from '../../test/support/meetup-safety-service.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { textOf } from '../../test/support/messages.js';
+import { ALICE, at, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../test/support/wayspots.js';
+import {
+  FakeActingMembers,
+  meetupWebWith,
+  partyWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import {
+  MEETUP_HELD,
+  MEETUP_NOT_SENT,
+  MEETUP_THROTTLE,
+  MEETUP_TOO_SOON,
+  NO_INFORMATION,
+  NO_MEETUP_HERE,
+} from '../commands/meetups/meetup.js';
+import { Throttles } from '../discord/throttle.js';
+import { isMeetup, type MeetupParty } from '../domain/party/party.js';
+import { MAX_MAP_STOPS, type MeetupAnswer, type StopsView } from '../domain/web/meetup-data.js';
+import type { WayspotRow } from '../domain/wayspots/kept.js';
+import { MAP_PLACE_KINDS_ONLY, MAP_BLOCKED } from './meetup-routes.js';
+
+const MAKE = `/s/${FAKE_GUILD_ID}/api/meetups`;
+
+/** A PokéStop in West that no flagged word names, and one that a flagged word does. */
+const FOUNTAIN_STOP = keptRow(1, { lat: 40.061, lon: -80.061, title: 'Market Fountain' });
+const LIBRARY_STOP = keptRow(2, { lat: 40.062, lon: -80.062, title: 'Little Free Library' });
+/** A power spot in West, and a stop without a title. */
+const POWER_SPOT = keptRow(3, { lat: 40.063, lon: -80.063, kind: 'powerspot', title: 'Salon' });
+
+/**
+ * The map of a server with meetup safety (on, by default, with the moderators' channel) and the
+ * kept stops above: Alice and Bob members (Alice fetched fresh as `Alice` of team mystic), the
+ * clock the parties' own, the channels named `west` and `east`.
+ */
+async function making(
+  safety: SafetyOptions = {},
+  options: { throttles?: Throttles } = {},
+  stops: readonly WayspotRow[] = [],
+) {
+  const throttles = options.throttles ?? new Throttles();
+  const made = await meetupSafetyWith(safety);
+  const { wayspots } = await wayspotsWith([FOUNTAIN_STOP, LIBRARY_STOP, POWER_SPOT, ...stops]);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    parties: made.store,
+    regions: made.regions,
+    meetupSafety: made.safety,
+    wayspots,
+  });
+  await ctx.placeFinder.built();
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'mystic').add(BOB, 'Bob');
+  const names = new Map([
+    [WEST_CHANNEL, 'west'],
+    [EAST_CHANNEL, 'east'],
+    [UNBOUNDED_CHANNEL, 'unbounded'],
+  ]);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    meetups: meetupWebWith(ctx, { channelName: (id) => names.get(id) }),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const make = async (body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: MAKE,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<MeetupAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  const meetups = (): MeetupParty[] => made.store.active().filter(isMeetup);
+  return { made, ctx, web, acting, members, headers, make, meetups, throttles };
+}
+
+/** A meetup at a place, at six, in West, as the form sends it. */
+function asked(place: unknown, more: object = {}) {
+  return { region: 1, name: 'Picnic', place, start: '6pm', info: 'Bring snacks.', ...more };
+}
+
+describe('making a meetup on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('makes a meetup at a gym as /meetup does: the same snapshot of the place, its start and information, the maker signed up', async () => {
+    const map = await making();
+    web = map.web;
+    const answer = await map.make(asked({ kind: 'gym', id: '1' }));
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      outcome: 'posted',
+      text: 'Your meetup is made. Edit… in its popup changes its name, information and times.',
+      meetup: { kind: 'meetup', name: 'Picnic', startTime: at('2026-10-13T18:00') },
+    });
+    const [made] = map.meetups();
+    expect(made).toMatchObject({
+      forumChannelId: WEST_FORUM,
+      createdById: ALICE,
+      timed: { name: 'Picnic', startTime: at('2026-10-13T18:00') },
+      meetup: {
+        description: 'Bring snacks.',
+        // As `namedPlace` makes it: the gym by the name its post shows, the nickname first.
+        place: { kind: 'gym', id: '1', title: 'The Stacks', lat: 40.05, lon: -80.05 },
+      },
+    });
+    expect(answer.json.meetup?.id).toBe(made?.id);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({
+        msg: 'a meetup was made on the map',
+        user: ALICE,
+        guild: FAKE_GUILD_ID,
+        region: 1,
+        outcome: 'posted',
+      }),
+    );
+  });
+
+  it('makes one at a PokéStop as a pick of /meetup near: makes it', async () => {
+    const map = await making();
+    web = map.web;
+    const answer = await map.make(asked({ kind: 'stop', id: wayspotId(1) }));
+    expect(answer.status).toBe(200);
+    expect(map.meetups()[0]?.meetup.place).toEqual({
+      kind: 'stop',
+      id: wayspotId(1),
+      title: 'Market Fountain',
+      lat: 40.061,
+      lon: -80.061,
+      address: FOUNTAIN_STOP.address,
+      image: FOUNTAIN_STOP.image,
+    });
+  });
+
+  it('holds a pin for the moderators, whose post says it was asked for on the map', async () => {
+    const map = await making();
+    web = map.web;
+    const answer = await map.make(asked({ lat: 40.0805, lon: -80.0805 }));
+    expect(answer.status).toBe(200);
+    expect(answer.json).toEqual({ ok: true, outcome: 'held', text: MEETUP_HELD });
+    expect(map.meetups()).toEqual([]);
+    const [request] = map.made.storage.requests.values();
+    expect(request).toMatchObject({
+      source: 'map',
+      place: { kind: 'pin', lat: 40.0805, lon: -80.0805, linkName: null },
+      regionChannelId: WEST_CHANNEL,
+    });
+    const [post] = map.made.gateway.messagesIn(MOD_CHANNEL);
+    expect(textOf(post?.message)).toContain(` on the map in <#${WEST_CHANNEL}>`);
+  });
+
+  it('holds a flagged PokéStop too, and a pin is named by the nearest gym or stop alone', async () => {
+    const map = await making();
+    web = map.web;
+    expect((await map.make(asked({ kind: 'stop', id: wayspotId(2) }))).json.outcome).toBe('held');
+    // Beside the power spot alone: never named by it; beside a stop, by the stop.
+    await map.make(asked({ lat: 40.0631, lon: -80.0631 }));
+    // Past `/meetup`'s window of two a quarter of an hour.
+    map.web.clock.now += 16 * 60_000;
+    await map.make(asked({ lat: 40.0611, lon: -80.0611 }));
+    const pins = [...map.made.storage.requests.values()].map((request) => request.place);
+    expect(pins[1]).toMatchObject({ kind: 'pin', near: null });
+    expect(pins[2]).toMatchObject({
+      kind: 'pin',
+      near: { kind: 'stop', title: 'Market Fountain' },
+    });
+  });
+
+  it('refuses a power spot and any place that is no gym, PokéStop or pin, and counts none of it', async () => {
+    const map = await making();
+    web = map.web;
+    for (const kind of ['powerspot', 'portal']) {
+      const answer = await map.make(asked({ kind, id: wayspotId(3) }));
+      expect(answer.status).toBe(422);
+      expect(answer.json).toEqual({ ok: false, text: MAP_PLACE_KINDS_ONLY });
+    }
+    // A gym of no region of the server, a stop gone, a pin outside the regions.
+    expect((await map.make(asked({ kind: 'gym', id: '10' }))).status).toBe(422);
+    expect((await map.make(asked({ kind: 'stop', id: wayspotId(99) }))).status).toBe(422);
+    expect((await map.make(asked({ lat: 40.5, lon: -80.05 }))).status).toBe(422);
+    expect(map.throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW)).toBeUndefined();
+  });
+
+  it("refuses in /meetup's words what its guards refuse, before its limit: a place refused for good, a start too soon to review, a start it cannot read, a bad name, no information", async () => {
+    const map = await making();
+    web = map.web;
+    await map.made.storage.rule(FAKE_GUILD_ID, { kind: 'gym', id: '2' }, 'refuse', MOD);
+    const refused = await map.make(asked({ kind: 'gym', id: '2' }));
+    expect(refused).toMatchObject({ status: 422, json: { ok: false, text: NO_MEETUP_HERE } });
+    const soon = await map.make(asked({ lat: 40.08, lon: -80.08 }, { start: 'in 30' }));
+    expect(soon).toMatchObject({ status: 422, json: { ok: false, text: MEETUP_TOO_SOON } });
+    const unread = await map.make(asked({ kind: 'gym', id: '1' }, { start: 'whenever' }));
+    expect(unread.status).toBe(422);
+    expect(unread.json.text).toContain(
+      'I could not read "whenever" as the time the meetup starts.',
+    );
+    const blank = await map.make(asked({ kind: 'gym', id: '1' }, { name: '   ' }));
+    expect(blank).toMatchObject({
+      status: 422,
+      json: { text: 'Give a name of 1 to 80 characters.' },
+    });
+    const empty = await map.make(asked({ kind: 'gym', id: '1' }, { info: ' \n ' }));
+    expect(empty).toMatchObject({ status: 422, json: { ok: false, text: NO_INFORMATION } });
+    expect(map.meetups()).toEqual([]);
+    // None of them counted: both of the quarter-hour's meetups may still be made.
+    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
+    expect((await map.make(asked({ kind: 'gym', id: '3' }))).status).toBe(200);
+  });
+
+  it("counts a meetup in /meetup's own window, shared with the command", async () => {
+    const throttles = new Throttles();
+    throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW);
+    const map = await making({}, { throttles });
+    web = map.web;
+    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(200);
+    const third = await map.make(asked({ kind: 'gym', id: '3' }));
+    expect(third.status).toBe(429);
+    expect(third.json.error).toMatch(/^You can use \/meetup again in /);
+    expect(third.headers['retry-after']).toBeDefined();
+    expect(map.meetups()).toHaveLength(1);
+  });
+
+  it('tells a blocked member so without an Appeal, pointing them to /meetup, before reading the place, uncounted', async () => {
+    const map = await making();
+    web = map.web;
+    await map.made.storage.addBlock(FAKE_GUILD_ID, ALICE, MOD);
+    const answer = await map.make(asked({ kind: 'powerspot', id: wayspotId(3) }));
+    expect(answer).toMatchObject({ status: 403, json: { ok: false, text: MAP_BLOCKED } });
+    expect(MAP_BLOCKED).toContain('/meetup');
+    expect(map.throttles.use('meetup', ALICE, MEETUP_THROTTLE, PARTY_NOW)).toBeUndefined();
+  });
+
+  it('tells a member blocked after the check so, without an Appeal, and posts nothing', async () => {
+    const map = await making();
+    web = map.web;
+    // The route reads the block once and finds none; `make` reads it again and finds one.
+    const { storage } = map.made;
+    const block = storage.block.bind(storage);
+    let reads = 0;
+    storage.block = async (serverId, memberId) => {
+      reads += 1;
+      if (reads === 1) return undefined;
+      await storage.addBlock(serverId, memberId, MOD);
+      return block(serverId, memberId);
+    };
+    const answer = await map.make(asked({ kind: 'gym', id: '1' }));
+    expect(answer).toEqual({
+      status: 403,
+      json: { ok: false, text: MAP_BLOCKED },
+      headers: expect.anything() as unknown,
+    });
+    expect(map.meetups()).toEqual([]);
+  });
+
+  it("says in /meetup's words that the moderators could not be asked, and keeps nothing", async () => {
+    const map = await making({ channel: false });
+    web = map.web;
+    const answer = await map.make(asked({ lat: 40.0805, lon: -80.0805 }));
+    expect(answer).toMatchObject({ status: 422, json: { ok: false, text: MEETUP_NOT_SENT } });
+    expect(map.made.storage.requests.size).toBe(0);
+  });
+
+  it('says a region lost its forum when it did so while the meetup was being made', async () => {
+    const map = await making();
+    web = map.web;
+    // The forum is asked about last before the meetup is made: it goes then.
+    const { gateway, regions } = map.made;
+    const access = gateway.memberAccess.bind(gateway);
+    gateway.memberAccess = (forumId, memberId) => {
+      regions.rows = regions.rows.map((row) =>
+        row.id === 1 ? { ...row, forumChannelId: null } : row,
+      );
+      return access(forumId, memberId);
+    };
+    const answer = await map.make(asked({ kind: 'gym', id: '1' }));
+    expect(answer).toMatchObject({
+      status: 422,
+      json: {
+        ok: false,
+        text: 'The region #west has no forum yet. A moderator can create it with /admin setup-forums.',
+      },
+    });
+    expect(map.meetups()).toEqual([]);
+  });
+
+  it('lets staff skip the check: a pin of a moderator is posted at once', async () => {
+    const map = await making();
+    web = map.web;
+    map.members.standing(BOB, { roleNames: ['Moderator'], administrator: false });
+    map.acting.standing(BOB, { roleNames: ['Moderator'], administrator: false });
+    const answer = await map.make(
+      asked({ lat: 40.0805, lon: -80.0805 }),
+      await map.web.posting(BOB, 'Bob'),
+    );
+    expect(answer.json).toMatchObject({ ok: true, outcome: 'posted' });
+    expect(map.meetups()[0]?.meetup.place).toMatchObject({ kind: 'pin' });
+    expect(map.made.storage.requests.size).toBe(0);
+  });
+
+  it('posts every place at once while the safety is off', async () => {
+    const map = await making({ moderation: null });
+    web = map.web;
+    expect((await map.make(asked({ lat: 40.0805, lon: -80.0805 }))).json.outcome).toBe('posted');
+  });
+
+  it('knows the regions of this server alone, says a region has no forum, and keeps out who is barred from its forum', async () => {
+    const map = await making();
+    web = map.web;
+    expect((await map.make(asked({ kind: 'gym', id: '1' }, { region: 99 }))).status).toBe(404);
+    const unbounded = await map.make(asked({ kind: 'gym', id: '1' }, { region: 3 }));
+    expect(unbounded).toMatchObject({
+      status: 422,
+      json: {
+        ok: false,
+        text: 'The region #unbounded has no forum yet. A moderator can create it with /admin setup-forums.',
+      },
+    });
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.make(asked({ kind: 'gym', id: '1' }))).status).toBe(403);
+    // Any region of the server, whatever the place's: a meetup in East at a gym of West.
+    const east = await map.make(asked({ kind: 'gym', id: '1' }, { region: 2 }));
+    expect(east.status).toBe(200);
+  });
+
+  it('refuses a malformed body, and anybody who is no member or not logged in', async () => {
+    const map = await making();
+    web = map.web;
+    expect((await map.make({ ...asked({ kind: 'gym', id: '1' }), extra: 1 })).status).toBe(400);
+    expect((await map.make(asked({ gym: 1 }))).status).toBe(400);
+    const stranger = await map.web.posting('200000000000000099', 'Stranger');
+    expect((await map.make(asked({ kind: 'gym', id: '1' }), stranger)).status).toBe(403);
+    const answer = await map.web.app.inject({
+      method: 'POST',
+      url: MAKE,
+      headers: { 'content-type': 'application/json' },
+      payload: JSON.stringify(asked({ kind: 'gym', id: '1' })),
+    });
+    expect(answer.statusCode).toBe(403);
+    expect(map.meetups()).toEqual([]);
+  });
+});
+
+describe('the PokéStops of a box of the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  /** The stops in a box, asked by `cookie`. */
+  const stopsIn = async (map: TestWeb, cookie: string | undefined, box: string) => {
+    const answer = await map.app.inject({
+      method: 'GET',
+      url: `/s/${FAKE_GUILD_ID}/api/stops?${box}`,
+      headers: cookie === undefined ? {} : { cookie },
+    });
+    return { status: answer.statusCode, json: answer.json<StopsView>() };
+  };
+
+  it('gives a member the titled stops of the server in the box, nearest to its middle first, never a power spot', async () => {
+    const map = await making();
+    web = map.web;
+    const cookie = await map.web.loggedIn(ALICE, 'Alice');
+    const answer = await stopsIn(
+      map.web,
+      cookie,
+      'south=40.06&west=-80.07&north=40.07&east=-80.06',
+    );
+    expect(answer.status).toBe(200);
+    expect(answer.json).toEqual({
+      stops: [
+        [wayspotId(2), 40.062, -80.062, 'Little Free Library'],
+        [wayspotId(1), 40.061, -80.061, 'Market Fountain'],
+      ],
+      more: false,
+    });
+    const outside = await stopsIn(map.web, cookie, 'south=40.2&west=-80.1&north=40.3&east=-80.0');
+    expect(outside.json).toEqual({ stops: [], more: false });
+  });
+
+  it(`gives at most ${String(MAX_MAP_STOPS)}, and says there are more`, async () => {
+    const rows = Array.from({ length: MAX_MAP_STOPS + 5 }, (_, n) =>
+      keptRow(10 + n, { lat: 40.05 + n / 100_000, lon: -80.05 }),
+    );
+    const map = await making({}, {}, rows);
+    web = map.web;
+    const cookie = await map.web.loggedIn(ALICE, 'Alice');
+    const answer = await stopsIn(map.web, cookie, 'south=40&west=-80.1&north=40.1&east=-80');
+    expect(answer.json.stops).toHaveLength(MAX_MAP_STOPS);
+    expect(answer.json.more).toBe(true);
+  });
+
+  it('is for members alone, and refuses a box that is none', async () => {
+    const map = await making();
+    web = map.web;
+    const box = 'south=40&west=-80.1&north=40.1&east=-80';
+    expect((await stopsIn(map.web, undefined, box)).status).toBe(401);
+    const stranger = await map.web.loggedIn('200000000000000099', 'Stranger');
+    expect((await stopsIn(map.web, stranger, box)).status).toBe(403);
+    const cookie = await map.web.loggedIn(ALICE, 'Alice');
+    expect((await stopsIn(map.web, cookie, 'south=41&west=-80.1&north=40&east=-80')).status).toBe(
+      400,
+    );
+    expect((await stopsIn(map.web, cookie, 'south=x&west=-80.1&north=40&east=-80')).status).toBe(
+      400,
+    );
+  });
+});
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7c5b658863944f52c9a3f06d85d6b8e1eced8411
--- /dev/null
+++ b/src/web/meetup-routes.ts
@@ -0,0 +1,381 @@
+import type { FastifyInstance, FastifyReply } from 'fastify';
+import { z } from 'zod';
+import type { AppContext } from '../app-context.js';
+import {
+  makeMeetupAs,
+  MEETUP_THROTTLE,
+  NO_INFORMATION,
+  NO_MEETUPS_FOR_YOU,
+  refusalOf,
+} from '../commands/meetups/meetup.js';
+import {
+  newPartyTimes,
+  noForumWords,
+  TIMED_TIME_HINT,
+  typedTimedTime,
+} from '../commands/parties/timed.js';
+import { PIN_NOT_HERE, PLACE_GONE, pickedPlace } from '../commands/place-option.js';
+import type { ReportNames } from '../commands/raids/report.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import { UserError } from '../discord/errors.js';
+import type { MemberStanding } from '../discord/member-directory.js';
+import type { MemberAccess } from '../discord/party-gateway.js';
+import type { Place } from '../domain/geo/place.js';
+import { tidyDescription } from '../domain/party/meetup.js';
+import { MAX_MEETUP_DESCRIPTION, MAX_PARTY_NAME, type MeetupParty } from '../domain/party/party.js';
+import { tidyName } from '../domain/party/timed.js';
+import { MAX_MAP_STOPS, type MeetupAnswer, type StopsView } from '../domain/web/meetup-data.js';
+import type { MapMeetup } from '../domain/web/party-data.js';
+import { mapParty } from '../domain/web/party-view.js';
+import { problemText } from '../render/activity.js';
+import { MEETUP_PLACE_KINDS } from '../services/place-finder.js';
+import {
+  actingOnTheMap,
+  isMapBotStaff,
+  isMapStaff,
+  memberOrFailure,
+  throttledOnTheMap,
+  unreachableOnTheMap,
+} from './acting.js';
+import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
+import type { GuildRequest } from './guild-routes.js';
+import { pageWords } from './page-words.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+
+/**
+ * What the meetups of the live map read and call (plan 8M-5M): exactly what `/meetup` and its
+ * form, `/name`, `/info`, `/meet` and `/end` use (meetup safety, the timed parties, the limits of
+ * words, the settings, the regions), and what names a place as `/meetup near:` names it (the
+ * gyms, the kept Wayspots, the place search), so that the map shares their code paths.
+ */
+export type MeetupWebContext = Pick<
+  AppContext,
+  | 'meetupSafety'
+  | 'attendance'
+  | 'timedParties'
+  | 'config'
+  | 'regions'
+  | 'gyms'
+  | 'wayspots'
+  | 'placeFinder'
+>;
+
+/** What the meetups of the live map need beyond the parties' own (`PartyWebDeps`). */
+export interface MeetupWebDeps {
+  ctx: MeetupWebContext;
+  /** A channel's name as the bot sees it now: a region's, which an answer names. */
+  channelName(channelId: string): string | undefined;
+}
+
+/** The writes of meetups one address may send in a minute, whoever sends them. */
+export const MEETUP_WRITES_PER_ADDRESS_MINUTE = 30;
+
+/** The questions for the stops in a box one address may ask in a minute (each pan of the map). */
+const STOPS_PER_MINUTE = 60;
+
+/** The command a meetup made on the map counts as (`MEETUP_THROTTLE`, in its window). */
+export const MEETUP_COMMAND = 'meetup';
+
+/**
+ * What the map answers for a place that is no gym, PokéStop or pin (Matt, 2026-10-17: never a
+ * power spot; the map offers none).
+ */
+export const MAP_PLACE_KINDS_ONLY = 'A meetup can be at a gym, a PokéStop or a pin.';
+
+/**
+ * What a member blocked from making meetups is told on the map: the map has no Appeal button, so
+ * it points them to `/meetup` (8S-1's follow-up).
+ */
+export const MAP_BLOCKED = `${NO_MEETUPS_FOR_YOU} To appeal, use /meetup on Discord and press Appeal.`;
+
+/** What the map's answer adds after a meetup is made: how to change it there. */
+export const EDIT_IN_POPUP = 'Edit… in its popup changes its name, information and times.';
+
+/** A place picked on the map: a gym or stop by kind and id, or a pin dropped by a click. */
+const placeSchema = z.union([
+  z.object({ kind: z.string().min(1).max(20), id: z.string().min(1).max(60) }).strict(),
+  z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict(),
+]);
+
+/**
+ * The body of a new meetup: the region (by id, as `/api/geo` lists it), the name as `/meetup`
+ * takes it (blanks allowed so that they are refused in its words), the place, the start as its
+ * option takes it (up to 100), the information as its form takes it. Anything else is malformed.
+ */
+const makeBodySchema = z
+  .object({
+    region: z.number().int().positive(),
+    name: z.string().max(MAX_PARTY_NAME),
+    place: placeSchema,
+    start: z.string().max(100),
+    info: z.string().max(MAX_MEETUP_DESCRIPTION),
+  })
+  .strict();
+
+/** A box of the map, as Leaflet's bounds give it. */
+const boxSchema = z
+  .object({
+    south: z.coerce.number().min(-90).max(90),
+    west: z.coerce.number().min(-180).max(180),
+    north: z.coerce.number().min(-90).max(90),
+    east: z.coerce.number().min(-180).max(180),
+  })
+  .strict()
+  .refine((box) => box.south <= box.north && box.west <= box.east);
+
+/** A point kept to six decimals (about 10 cm), as the map's outlines and pins are. */
+const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;
+
+/** The Wayfarer kinds a pick on the map may name: a gym or a PokéStop (`MEETUP_PLACE_KINDS`). */
+function isMeetupKind(kind: string): boolean {
+  return (MEETUP_PLACE_KINDS as readonly string[]).includes(kind);
+}
+
+/**
+ * The meetups of the live map (spec 3.7): making one (`POST /s/<guild>/api/meetups`), which is
+ * `/meetup` and its form as the member in the region picked, at a gym, a PokéStop or a pin picked
+ * on the map, through meetup safety; and the PokéStops of a box of the map, to pick a place from
+ * (`GET /s/<guild>/api/stops`).
+ */
+export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { sessions, parties, meetups } = deps;
+  const { ctx } = meetups;
+
+  /** The words of a command as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, parties.zone, deps.now());
+
+  /** A region in a sentence: `#west` as its channel reads, else `Region 5`. */
+  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string => {
+    const name = meetups.channelName(region.channelId);
+    return name === undefined ? `Region ${region.id}` : `#${name}`;
+  };
+
+  /** How the map's answers name a post (not at all: the page shows the meetup) and a region. */
+  const names: ReportNames = {
+    post: () => undefined,
+    channel: (channelId) => {
+      const region = ctx.regions.byChannel(channelId);
+      return region ? regionInWords(region) : `#${meetups.channelName(channelId) ?? 'unknown'}`;
+    },
+  };
+
+  /** How the member stands to a forum; rejects while Discord cannot say. */
+  const accessTo = (forumId: string | null, userId: string): Promise<MemberAccess | undefined> =>
+    forumId === null ? Promise.resolve(undefined) : parties.forums.memberAccess(forumId, userId);
+
+  /** A meetup as the member sees it on the map now (`mapParty`): none without its post yet. */
+  const viewOf = (
+    guildId: string,
+    guildRow: number,
+    party: MeetupParty,
+    userId: string,
+    standing: MemberStanding,
+  ): MapMeetup | undefined => {
+    const shown = mapParty(party, {
+      guildId,
+      guildRow,
+      parties: [],
+      memberId: userId,
+      barred: new Set(),
+      now: deps.now(),
+      zone: parties.zone,
+      readOnly: false,
+      staff: isMapStaff(standing, userId, parties.ownerId),
+      botStaff: isMapBotStaff(standing, userId, parties.ownerId),
+      look: (raid) => parties.look(raid),
+      pictureOrigins: deps.pictureOrigins,
+    });
+    return shown?.kind === 'meetup' ? shown : undefined;
+  };
+
+  /** A refusal in the command's words, as text of the page. */
+  const refuse = (reply: FastifyReply, status: number, text: string, meetup?: MapMeetup) => {
+    const answer: MeetupAnswer = { ok: false, text: words(text), ...(meetup ? { meetup } : {}) };
+    return reply.code(status).send(answer);
+  };
+
+  /**
+   * The place a body names, as `/meetup near:` would name it (`pickedPlace`, `PlaceFinder.pin`
+   * with `MEETUP_PLACE_KINDS`, the same snapshots), or the refusal: a kind that is no gym or
+   * PokéStop, a gym or stop gone or of no region of the server, a pin outside its regions.
+   */
+  const placeOf = (
+    row: number,
+    body: z.infer<typeof placeSchema>,
+  ): { place: Place } | { refusal: string } => {
+    if ('kind' in body) {
+      if (!isMeetupKind(body.kind)) return { refusal: MAP_PLACE_KINDS_ONLY };
+      const place = pickedPlace(ctx, row, `${body.kind}:${body.id}`);
+      return place ? { place } : { refusal: PLACE_GONE };
+    }
+    const point = { lat: sixDecimals(body.lat), lon: sixDecimals(body.lon) };
+    const pin = ctx.placeFinder.pin(row, point, null, MEETUP_PLACE_KINDS);
+    return pin ? { place: pin } : { refusal: PIN_NOT_HERE };
+  };
+
+  const writeLimiter = new RateLimiter({ uses: MEETUP_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const writeGuards = [
+    limitedPerAddress(writeLimiter, { now: deps.now }),
+    postGuard(sessions, deps.settings.publicUrl),
+  ];
+
+  // A new meetup (spec 3.7): before the body is read (`onRequest`), the per-address limit and the
+  // guard of every POST. Then the session (403) and the body (400), who makes it
+  // (`actingOnTheMap`), the region (one of this server, else 404), its forum (none: `/meetup`'s
+  // words; barred 403; Discord unreachable 503), then what `/meetup`'s guards and form refuse, in
+  // their order and words (a bad name; a member blocked, 403 pointed to `/meetup`; the place; the
+  // start; the place refused for good, or a start too soon for the moderators; no information),
+  // and only then `/meetup`'s throttle in its window; then its code path as the member
+  // (`makeMeetupAs` over `MeetupSafety.make`), the request marked as the map's.
+  scope.post('/api/meetups', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const body = makeBodySchema.safeParse(request.body ?? {});
+    if (!body.success) return sendFailure(request, reply, 400);
+    const { guild } = request.params;
+    const { userId } = session;
+    const doing = 'made a meetup';
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting.sent;
+    const row = await parties.guilds.idFor(guild);
+    const region = ctx.regions.byId(body.data.region);
+    if (row === undefined || region === undefined || region.guildId !== row) {
+      return sendFailure(request, reply, 404);
+    }
+    if (region.forumChannelId === null) {
+      return refuse(reply, 422, noForumWords(regionInWords(region)));
+    }
+    try {
+      if ((await accessTo(region.forumChannelId, userId)) === 'barred') {
+        return sendFailure(request, reply, 403);
+      }
+    } catch (err) {
+      return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
+    }
+    if (tidyName(body.data.name) === undefined) {
+      return refuse(reply, 422, problemText('bad-name', ctx.attendance.limits(), 'meetup'));
+    }
+    const staff = isMapStaff(acting.standing, userId, parties.ownerId);
+    // Before the place and the start, as `/meetup` asks it: a blocked member hears of the block.
+    if (await ctx.meetupSafety.blocked(guild, userId, staff)) {
+      return refuse(reply, 403, MAP_BLOCKED);
+    }
+    const where = placeOf(row, body.data.place);
+    if ('refusal' in where) return refuse(reply, 422, where.refusal);
+    const now = deps.now();
+    let startTime: number;
+    try {
+      const typed = typedTimedTime(ctx, newPartyTimes('meetup', now), 'meet', body.data.start, now);
+      if (typed === 'unset') {
+        return refuse(reply, 422, `Give the time the meetup starts. ${TIMED_TIME_HINT}`);
+      }
+      startTime = typed.at;
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      return refuse(reply, 422, err.message);
+    }
+    // The block is read above: not again.
+    const verdict = await ctx.meetupSafety.verdict({
+      serverId: guild,
+      place: where.place,
+      makerId: userId,
+      staff,
+      blocked: false,
+    });
+    const refusal = refusalOf(verdict, startTime, now);
+    if (refusal !== undefined) return refuse(reply, 422, refusal);
+    if (tidyDescription(body.data.info) === null) return refuse(reply, 422, NO_INFORMATION);
+    const throttled = throttledOnTheMap(
+      deps,
+      reply,
+      { command: MEETUP_COMMAND },
+      userId,
+      MEETUP_THROTTLE,
+    );
+    if (throttled) return throttled;
+    const answer = await makeMeetupAs(
+      ctx,
+      {
+        serverId: guild,
+        regionChannelId: region.channelId,
+        maker: acting.member,
+        place: where.place,
+        name: body.data.name,
+        startTime,
+        description: body.data.info,
+        staff,
+        source: 'map',
+      },
+      names,
+    );
+    deps.log.info(
+      { user: userId, guild, region: region.id, outcome: answer.kind },
+      'a meetup was made on the map',
+    );
+    switch (answer.kind) {
+      case 'blocked':
+        return refuse(reply, 403, MAP_BLOCKED);
+      case 'refused':
+        return refuse(reply, 422, answer.text);
+      case 'held': {
+        const held: MeetupAnswer = { ok: true, outcome: 'held', text: words(answer.text) };
+        return reply.send(held);
+      }
+      case 'posted': {
+        const party = parties.store.get(answer.party.id);
+        const meetup =
+          party?.type === 'meetup' ? viewOf(guild, row, party, userId, acting.standing) : undefined;
+        const posted: MeetupAnswer = {
+          ok: true,
+          outcome: 'posted',
+          text: words(`${answer.text} ${EDIT_IN_POPUP}`),
+          ...(meetup ? { meetup } : {}),
+        };
+        return reply.send(posted);
+      }
+    }
+  });
+
+  // The PokéStops of a box of the map, to pick a meetup's place from (plan 8M-5M): members only
+  // (as the pick lists), those in a region of this server with a title, the nearest to the box's
+  // middle first, at most `MAX_MAP_STOPS` (`more` says there were more: the page asks to zoom
+  // in). Gyms are on the map already; power spots and other Wayspots are never offered.
+  const stopsLimiter = new RateLimiter({ uses: STOPS_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/stops',
+    { onRequest: limitedPerAddress(stopsLimiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const box = boxSchema.safeParse(request.query ?? {});
+      if (!box.success) return sendFailure(request, reply, 400);
+      const { guild } = request.params;
+      const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
+      if (refused) return refused;
+      const row = await parties.guilds.idFor(guild);
+      const { south, west, north, east } = box.data;
+      const middle = { lat: (south + north) / 2, lon: (west + east) / 2 };
+      const found = new Map<string, [string, number, number, string]>();
+      for (const region of ctx.regions.all()) {
+        if (region.guildId !== row || row === undefined || region.bounds === null) continue;
+        for (const stop of ctx.wayspots.inRegion(region.channelId)) {
+          if (stop.kind !== 'stop' || stop.title.trim() === '') continue;
+          if (stop.lat < south || stop.lat > north || stop.lon < west || stop.lon > east) continue;
+          found.set(stop.id, [stop.id, stop.lat, stop.lon, stop.title]);
+        }
+      }
+      const distance = ([, lat, lon]: [string, number, number, string]): number =>
+        (lat - middle.lat) ** 2 + (lon - middle.lon) ** 2;
+      const nearest = [...found.values()].sort((a, b) => distance(a) - distance(b));
+      const view: StopsView = {
+        stops: nearest.slice(0, MAX_MAP_STOPS),
+        more: nearest.length > MAX_MAP_STOPS,
+      };
+      return view;
+    },
+  );
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index b3f7ca5f640a1a66ddb9f0f5a1845b0e3aa1900d..ec00bed41193e0b9caa7f4635a645dbc119602f3 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -17,6 +17,7 @@ import type { GeoCache } from './geo-cache.js';
 import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
 import type { LoginLinks } from './login-links.js';
+import type { MeetupWebDeps } from './meetup-routes.js';
 import { HASHED_NAME, type WebAssets } from './page.js';
 import type { PartyWebDeps } from './party-routes.js';
 import type { RaidWebDeps } from './raid-routes.js';
@@ -57,6 +58,8 @@ export interface WebDeps {
   spawns: SpawnWebDeps;
   /** Starting, arranging and moving trains on the live map (plan 8M-5). */
   trains: TrainWebDeps;
+  /** Making and changing meetups on the live map (plan 8M-5M). */
+  meetups: MeetupWebDeps;
   now: () => number;
   log: Logger;
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index 9d2212b9a8ad37d725e00b06bba1b152dfb9e397..463c34bec990c3e052bb3df696abb3bfb3061a03 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -19,6 +19,7 @@ import type { ActingAnswer, ActingMembers, PartyWebDeps } from '../../src/web/pa
 import type { RaidWebContext, RaidWebDeps } from '../../src/web/raid-routes.js';
 import type { SpawnWebContext, SpawnWebDeps } from '../../src/web/spawn-routes.js';
 import type { TrainWebContext, TrainWebDeps } from '../../src/web/train-routes.js';
+import type { MeetupWebContext, MeetupWebDeps } from '../../src/web/meetup-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
@@ -240,7 +241,10 @@ const NO_PARTIES: PartyWebDeps = {
  * controls is `throttles` (one of the test's, to share with a router or fill beforehand).
  */
 export function partyWebWith(
-  made: Awaited<ReturnType<typeof partyServiceWith>>,
+  made: Pick<
+    Awaited<ReturnType<typeof partyServiceWith>>,
+    'gateway' | 'store' | 'service' | 'settings' | 'attendance'
+  >,
   options: { acting?: ActingMembers; throttles?: Throttles } = {},
 ): PartyWebDeps {
   return {
@@ -319,6 +323,30 @@ const NO_TRAINS: TrainWebDeps = {
   channelName: () => undefined,
 };
 
+/**
+ * Making and changing meetups on the map over a test's context (`createTestContext`, with
+ * `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of
+ * `meetupSafetyWith`, and `wayspots` for the stops), as the bot wires it. Pass as `meetups`.
+ * `channelName` names the channels the bot sees (none by default).
+ */
+export function meetupWebWith(
+  ctx: MeetupWebContext,
+  options: Partial<Omit<MeetupWebDeps, 'ctx'>> = {},
+): MeetupWebDeps {
+  return { ctx, channelName: () => undefined, ...options };
+}
+
+/** No meetups can be made or changed: a test that does passes `meetupWebWith`. */
+const NO_MEETUPS: MeetupWebDeps = {
+  ctx: new Proxy({} as MeetupWebContext, {
+    get(_target, property) {
+      if (typeof property === 'symbol' || property === 'then') return undefined;
+      throw new Error('no meetups in this test: give meetupWebWith');
+    },
+  }),
+  channelName: () => undefined,
+};
+
 /** No overwrite of a member's own keeps anybody out of a channel. */
 const NOBODY_KEPT_OUT: SpawnWebDeps['channels'] = { ownViewDenied: () => Promise.resolve(false) };
 
@@ -425,6 +453,8 @@ export interface WebTestOptions {
   spawns?: SpawnWebDeps;
   /** Starting, arranging and moving trains on the map (`trainWebWith`); none by default. */
   trains?: TrainWebDeps;
+  /** Making and changing meetups on the map (`meetupWebWith`); none by default. */
+  meetups?: MeetupWebDeps;
 }
 
 /**
@@ -551,6 +581,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     raids: options.raids ?? NO_RAIDS,
     spawns: options.spawns ?? NO_SPAWNS,
     trains: options.trains ?? NO_TRAINS,
+    meetups: options.meetups ?? NO_MEETUPS,
     now: () => clock.now,
     log,
   });
````

### Task 3: Meetups from the map: changing a meetup

Prototype commit: `3fcfe08918a2c6b2c52a4e23f6ea700a2a89cd8f`

`POST …/meetups/<id>/<name|info|start|end>`, each carrying the value it was drawn from: the maker or staff only, a stale value 409 with the meetup as it is now (also inside the store), each in its command's throttle window (a start in `/meet`'s, under the router's key: `variedThrottleKey`). `pageWords` renders a relative time.

**Files:**

```
 src/discord/router.ts         |  16 +++--
 src/domain/web/clock.ts       |  14 ++++
 src/domain/web/party-view.ts  |  14 ++++
 src/web/acting.ts             |  15 +++--
 src/web/meetup-change.test.ts | 286 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/meetup-routes.ts      | 247 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/page-words.test.ts    |  11 ++++
 src/web/page-words.ts         |  13 ++--
 8 files changed, 599 insertions(+), 17 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/discord/router.test.ts src/web/meetup-change.test.ts src/web/page-words.test.ts src/web/parties.test.ts src/web/train-move.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/discord/router.ts src/domain/web/clock.ts src/domain/web/party-view.ts src/web/acting.ts src/web/meetup-change.test.ts src/web/meetup-routes.ts src/web/page-words.test.ts src/web/page-words.ts` and `npx eslint src/discord/router.ts src/domain/web/clock.ts src/domain/web/party-view.ts src/web/acting.ts src/web/meetup-change.test.ts src/web/meetup-routes.ts src/web/page-words.test.ts src/web/page-words.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 3fcfe08918a2c6b2c52a4e23f6ea700a2a89cd8f -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Meetups from the map: changing a meetup`, the paragraph above as the body and the trailer, staging exactly
  `src/discord/router.ts src/domain/web/clock.ts src/domain/web/party-view.ts src/web/acting.ts src/web/meetup-change.test.ts src/web/meetup-routes.ts src/web/page-words.test.ts src/web/page-words.ts`.

````diff
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 26a09f50cad3ce127b45141e219a62147e288092..4484ef81904b7ecef1996d594dfb31590f7f1267 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -23,7 +23,7 @@ import { channelContext } from './channel-context.js';
 import { decodeCustomId, type CustomId } from './custom-id.js';
 import { UserError } from './errors.js';
 import { answerApart, deferLate, LATE_DEFER_MS } from './late-reply.js';
-import { Throttles, waitText } from './throttle.js';
+import { Throttles, waitText, type Throttle } from './throttle.js';
 import { REHEARSAL_REFUSAL } from '../services/rehearsal.js';
 
 export const STALE_COMPONENT = 'This control is no longer active.';
@@ -108,6 +108,15 @@ export function controlThrottleKey(kind: string): string {
   return `component:${kind}`;
 }
 
+/**
+ * The window of a command or control whose limit depends on the use (`throttle` a function, as
+ * `/meet`'s in a timed party): each limit is counted apart, under the key and the limit. The live
+ * map counts its uses there too (plan 8M-5M: a meetup's start in `/meet`'s).
+ */
+export function variedThrottleKey(key: string, throttle: Throttle): string {
+  return `${key}\n${throttle.perSeconds}/${throttle.uses}`;
+}
+
 export class InteractionRouter {
   private readonly commands = new Map<string, CommandModule>();
   private readonly components = new Map<string, ComponentHandler>();
@@ -248,7 +257,7 @@ export class InteractionRouter {
           : handler.throttle;
       if (throttle) {
         // The limits of a command that has several are counted apart, each under what it is.
-        const counted = varies ? `${key}\n${throttle.perSeconds}/${throttle.uses}` : key;
+        const counted = varies ? variedThrottleKey(key, throttle) : key;
         const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
         if (wait !== undefined) {
           throw new UserError(`You can use /${name} again in ${waitText(wait)}.`);
@@ -379,8 +388,7 @@ export class InteractionRouter {
         // A limit shared with a command counts in that command's window, as the command's uses
         // are counted; the others in the kind's own, each limit by itself where they vary.
         const key = controlThrottleKey(handler.kind);
-        const counted =
-          throttle.as ?? (varies ? `${key}\n${throttle.perSeconds}/${throttle.uses}` : key);
+        const counted = throttle.as ?? (varies ? variedThrottleKey(key, throttle) : key);
         const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
         if (wait !== undefined) {
           throw new UserError(
diff --git a/src/domain/web/clock.ts b/src/domain/web/clock.ts
index 2506c07d74bbf7061d42503bd04efbe26baec555..b56422430a1c7696bb7d49fd3705733b2c82ca42 100644
--- a/src/domain/web/clock.ts
+++ b/src/domain/web/clock.ts
@@ -20,3 +20,17 @@ export function clockTime(at: number, zone: string, now: number): string {
     }).format(at),
   );
 }
+
+/**
+ * How long until a moment, or since it, to the minute: `in 13 min`, `in 1 h 5 min`, `in 2 h`,
+ * `1 h 30 min ago`, `now` (what Discord's relative timestamps say, as the page words them).
+ */
+export function relativeTime(at: number, now: number): string {
+  const minutes = Math.round((at - now) / 60_000);
+  if (minutes === 0) return 'now';
+  const total = Math.abs(minutes);
+  const hours = Math.floor(total / 60);
+  const rest = total % 60;
+  const span = hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
+  return minutes > 0 ? `in ${span}` : `${span} ago`;
+}
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index c277e31422bbe32d3f67724ecd8866c767848c96..2b34ec3b64ebb26765e228a63d47c7370e8c6de2 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -160,6 +160,20 @@ export function mayChangeRaid(party: RaidParty, memberId: string, staff: boolean
   return staff || mayArrange(party, memberId);
 }
 
+/**
+ * Whether a member may change a meetup on the map (spec 3.7, "its maker and staff"; plan 8M-5M):
+ * the member who made it, or staff (an admin, a moderator, the bot's owner). The commands let
+ * anybody in the post change its name, information and end; the map, which crosses forums, asks
+ * more, as for raids. A start also needs what `/meet` asks, a sign-up (`mayArrange`).
+ */
+export function mayEditMeetup(
+  party: Pick<MeetupParty, 'createdById'>,
+  memberId: string,
+  staff: boolean,
+): boolean {
+  return staff || party.createdById === memberId;
+}
+
 function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid | null {
   const stage = raidStage(party, input.now);
   if (stage === 'ended') return null;
diff --git a/src/web/acting.ts b/src/web/acting.ts
index ccb31439a4afe4a56f7f13470f30304e3b6d8c0f..a5f67763ae6c29e028477dba1e2d33c692e739d0 100644
--- a/src/web/acting.ts
+++ b/src/web/acting.ts
@@ -1,7 +1,7 @@
 import type { FastifyReply, FastifyRequest } from 'fastify';
 import { isBotManagement, isManagement } from '../discord/guards.js';
 import type { MemberStanding } from '../discord/member-directory.js';
-import { controlThrottleKey } from '../discord/router.js';
+import { controlThrottleKey, variedThrottleKey } from '../discord/router.js';
 import { waitText, type Throttle } from '../discord/throttle.js';
 import type { Member } from '../services/attendance-service.js';
 import { sendFailure } from './answers.js';
@@ -135,16 +135,23 @@ export function isMapBotStaff(
 /**
  * Counts a write of the member in the router's window of a command (its name) or a control
  * (`controlThrottleKey`), as a use there counts: undefined when it may go on, or the answer sent
- * (429 with `Retry-After`, in the router's words: `words` of the wait).
+ * (429 with `Retry-After`, in the router's words: `words` of the wait). `varies`: the command's
+ * limit depends on where it is used (`/meet`), and the router counts this limit apart
+ * (`variedThrottleKey`).
  */
 export function throttledOnTheMap(
   deps: WebDeps,
   reply: FastifyReply,
-  key: { command: string } | { control: string },
+  key: { command: string; varies?: boolean } | { control: string },
   userId: string,
   throttle: Throttle,
 ): FastifyReply | undefined {
-  const counted = 'command' in key ? key.command : controlThrottleKey(key.control);
+  const counted =
+    'command' in key
+      ? key.varies === true
+        ? variedThrottleKey(key.command, throttle)
+        : key.command
+      : controlThrottleKey(key.control);
   const wait = deps.parties.throttles.use(counted, userId, throttle, deps.now());
   if (wait === undefined) return undefined;
   const error =
diff --git a/src/web/meetup-change.test.ts b/src/web/meetup-change.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6f9b46457a4aab70c99f238026de93e8b6c379f4
--- /dev/null
+++ b/src/web/meetup-change.test.ts
@@ -0,0 +1,286 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, at, BOB, CAROL, PARTY_NOW } from '../../test/support/parties.js';
+import { createdMeetup } from '../../test/support/party-service.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  meetupWebWith,
+  partyWebWith,
+  TEST_OWNER_ID,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { START_THROTTLE } from '../commands/parties/timed.js';
+import { CHANGE_THROTTLE } from '../commands/raids/change.js';
+import { variedThrottleKey } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { MeetupAnswer } from '../domain/web/meetup-data.js';
+import { NOT_YOURS } from './meetup-routes.js';
+
+const START = at('2026-10-13T18:00');
+const END = at('2026-10-13T20:00');
+
+/**
+ * A meetup made by Alice (signed up, as its maker is), starting at six, with information, on the
+ * map: Alice, Bob (not signed up), Carol (signed up) and the bot's owner (staff) members of the
+ * server, fetched fresh. The web server's clock is the parties' own.
+ */
+async function changing(options: { throttles?: Throttles } = {}) {
+  const made = await createdMeetup({
+    name: 'Picnic',
+    creatorId: ALICE,
+    creator: { name: 'Alice' },
+    startTime: START,
+    description: 'Bring snacks.',
+  });
+  await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
+  await made.attendance.flush();
+  const throttles = options.throttles ?? new Throttles();
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    parties: made.store,
+    regions: made.regions,
+  });
+  const members = new FakeMemberDirectory()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(CAROL, 'Carol')
+    .add(TEST_OWNER_ID, 'Owner');
+  const acting = new FakeActingMembers()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(CAROL, 'Carol')
+    .add(TEST_OWNER_ID, 'Owner');
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    meetups: meetupWebWith(ctx),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const change = async (what: string, body: unknown, sent = headers, partyId = made.party.id) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: `/s/${FAKE_GUILD_ID}/api/meetups/${partyId}/${what}`,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<MeetupAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  return { made, web, members, acting, headers, change, throttles };
+}
+
+describe('changing a meetup on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('renames it as /name does, in its words, the line in the post naming who did, the meetup as it is now', async () => {
+    const map = await changing();
+    web = map.web;
+    const answer = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text: 'This meetup is now called Park picnic.',
+      meetup: { kind: 'meetup', name: 'Park picnic' },
+    });
+    expect(map.made.current().timed.name).toBe('Park picnic');
+    await map.made.attendance.flush();
+    expect(map.made.said().join('\n')).toContain('renamed this meetup: **Park picnic**.');
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({
+        msg: 'a meetup was changed on the map',
+        user: ALICE,
+        guild: FAKE_GUILD_ID,
+        party: map.made.party.id,
+        change: 'name',
+        outcome: 'ok',
+      }),
+    );
+  });
+
+  it('sets and removes the information as /info does', async () => {
+    const map = await changing();
+    web = map.web;
+    const set = await map.change('info', { drawn: 'Bring snacks.', info: 'Bring tea.\nAnd cups.' });
+    expect(set.json).toMatchObject({
+      ok: true,
+      text: 'The post of this meetup shows what you wrote, under "Meeting Information".',
+    });
+    expect(map.made.current().meetup.description).toBe('Bring tea.\nAnd cups.');
+    const cleared = await map.change('info', { drawn: 'Bring tea.\nAnd cups.', info: '  ' });
+    expect(cleared.json.text).toBe('The post of this meetup has no information any more.');
+    expect(map.made.current().meetup.description).toBeNull();
+  });
+
+  it('sets the start as /meet reads and sets it, and the others are told', async () => {
+    const map = await changing();
+    web = map.web;
+    const answer = await map.change('start', { drawn: START, time: '7pm' });
+    expect(answer.status).toBe(200);
+    expect(answer.json.text).toBe(
+      'This meetup starts at 7:00 PM (in 5 h). I am telling the others.',
+    );
+    expect(map.made.current().timed.startTime).toBe(at('2026-10-13T19:00'));
+    await map.made.timed.flush();
+    expect(map.made.said().at(-1)).toContain(`<@${CAROL}>`);
+  });
+
+  it('sets and removes the end as /end does, and refuses a time it cannot read in its words', async () => {
+    const map = await changing();
+    web = map.web;
+    const set = await map.change('end', { drawn: null, time: '8pm' });
+    expect(set.status).toBe(200);
+    expect(map.made.current().endTime).toBe(END);
+    const unread = await map.change('end', { drawn: END, time: 'later' });
+    expect(unread.status).toBe(422);
+    expect(unread.json).toMatchObject({ ok: false, meetup: { endTime: END } });
+    expect(unread.json.text).toContain('I could not read "later" as the time the meetup ends.');
+    const removed = await map.change('end', { drawn: END, time: 'none' });
+    expect(removed.json.text).toBe('This meetup has no end time any more.');
+  });
+
+  it('refuses a change drawn from what the meetup no longer is, with the meetup as it is now, uncounted', async () => {
+    const throttles = new Throttles();
+    const map = await changing({ throttles });
+    web = map.web;
+    await map.made.timed.setName(map.made.party.id, { id: CAROL }, 'Lake picnic');
+    const stale = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
+    expect(stale.status).toBe(409);
+    expect(stale.json).toEqual({
+      ok: false,
+      text: 'This meetup changed meanwhile: here it is as it is now.',
+      meetup: expect.objectContaining({ name: 'Lake picnic' }) as unknown,
+    });
+    expect((await map.change('start', { drawn: null, time: '7pm' })).status).toBe(409);
+    expect((await map.change('info', { drawn: null, info: 'x' })).status).toBe(409);
+    expect((await map.change('end', { drawn: END, time: '9pm' })).status).toBe(409);
+    expect(map.made.current().timed.name).toBe('Lake picnic');
+    for (let use = 0; use < CHANGE_THROTTLE.uses; use += 1) {
+      expect(throttles.use('name', ALICE, CHANGE_THROTTLE, PARTY_NOW)).toBeUndefined();
+    }
+  });
+
+  it('refuses inside the store a change that another one overtook after the checks, with the meetup as it is now', async () => {
+    const map = await changing();
+    web = map.web;
+    // The forum is asked about before the change is checked and made: Carol's rename is on its
+    // way into the store meanwhile, ahead of Alice's.
+    const { gateway, timed } = map.made;
+    const access = gateway.memberAccess.bind(gateway);
+    let overtaken: Promise<unknown> | undefined;
+    gateway.memberAccess = (forumId, memberId) => {
+      overtaken ??= timed.setName(map.made.party.id, { id: CAROL }, 'Lake picnic');
+      return access(forumId, memberId);
+    };
+    const stale = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
+    await overtaken;
+    expect(stale.status).toBe(409);
+    expect(stale.json).toEqual({
+      ok: false,
+      text: 'This meetup changed meanwhile: here it is as it is now.',
+      meetup: expect.objectContaining({ name: 'Lake picnic' }) as unknown,
+    });
+    expect(map.made.current().timed.name).toBe('Lake picnic');
+  });
+
+  it('lets its maker and staff change it here, nobody else; a start only as /meet allows it, signed up', async () => {
+    const map = await changing();
+    web = map.web;
+    const bob = await map.change(
+      'name',
+      { drawn: 'Picnic', name: 'Mine' },
+      await map.web.posting(BOB, 'Bob'),
+    );
+    expect(bob).toMatchObject({ status: 403, json: { ok: false, text: NOT_YOURS } });
+    // Carol is signed up, but did not make it.
+    const carol = await map.web.posting(CAROL, 'Carol');
+    expect((await map.change('info', { drawn: 'Bring snacks.', info: 'x' }, carol)).status).toBe(
+      403,
+    );
+    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
+    expect(
+      (await map.change('name', { drawn: 'Picnic', name: 'Staff picnic' }, owner)).status,
+    ).toBe(200);
+    const start = await map.change('start', { drawn: START, time: '7pm' }, owner);
+    expect(start).toMatchObject({
+      status: 403,
+      json: { ok: false, text: 'You are not signed up for this meetup.' },
+    });
+    expect(map.made.current().timed).toMatchObject({ name: 'Staff picnic', startTime: START });
+  });
+
+  it("counts each change in its command's own window, a start in that of /meet in a meetup", async () => {
+    const throttles = new Throttles();
+    for (let use = 0; use < START_THROTTLE.uses; use += 1) {
+      throttles.use(variedThrottleKey('meet', START_THROTTLE), ALICE, START_THROTTLE, PARTY_NOW);
+    }
+    for (let use = 0; use < CHANGE_THROTTLE.uses; use += 1) {
+      throttles.use('name', ALICE, CHANGE_THROTTLE, PARTY_NOW);
+    }
+    const map = await changing({ throttles });
+    web = map.web;
+    const start = await map.change('start', { drawn: START, time: '7pm' });
+    expect(start.status).toBe(429);
+    expect(start.json.error).toMatch(/^You can use \/meet again in /u);
+    const name = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
+    expect(name.status).toBe(429);
+    expect(name.json.error).toMatch(/^You can use \/name again in /u);
+    // Another window.
+    expect((await map.change('end', { drawn: null, time: '8pm' })).status).toBe(200);
+  });
+
+  it('answers a meetup that is over or no meetup of this server as over, an unknown change 404, a malformed body 400, a barred member 403', async () => {
+    const map = await changing();
+    web = map.web;
+    expect((await map.change('place', { drawn: null })).status).toBe(404);
+    expect((await map.change('name', { name: 'x' })).status).toBe(400);
+    // A raid of the same store and server: no meetup.
+    const gym = gymsFixture().get(1);
+    if (!gym) throw new Error('the invented gyms have no gym 1');
+    const raid = await map.made.service.reportRaid({
+      gym,
+      reporterId: CAROL,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    if (raid.kind !== 'created') throw new Error(`the raid was not created: ${raid.kind}`);
+    expect(map.made.store.get(raid.party.id)?.status).toBe('active');
+    const notMeetup = await map.change(
+      'name',
+      { drawn: 'x', name: 'y' },
+      map.headers,
+      raid.party.id,
+    );
+    expect(notMeetup).toMatchObject({
+      status: 409,
+      json: { ok: false, text: 'This meetup is over.' },
+    });
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.change('name', { drawn: 'Picnic', name: 'x' })).status).toBe(403);
+    map.made.gateway.barred.clear();
+    await map.made.service.end(map.made.party.id);
+    const over = await map.change('name', { drawn: 'Picnic', name: 'x' });
+    expect(over).toEqual({
+      status: 409,
+      json: { ok: false, text: 'This meetup is over.' },
+      headers: expect.anything() as unknown,
+    });
+  });
+});
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index 7c5b658863944f52c9a3f06d85d6b8e1eced8411..9a8a055f5f4d611ca527ac3bb9ddbf20e8ea4a3b 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -1,6 +1,7 @@
-import type { FastifyInstance, FastifyReply } from 'fastify';
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
+import { describeAs } from '../commands/meetups/info.js';
 import {
   makeMeetupAs,
   MEETUP_THROTTLE,
@@ -8,12 +9,19 @@ import {
   NO_MEETUPS_FOR_YOU,
   refusalOf,
 } from '../commands/meetups/meetup.js';
+import { partyOver } from '../commands/parties/reply.js';
 import {
+  endAs,
   newPartyTimes,
   noForumWords,
+  renameAs,
+  START_THROTTLE,
+  startAs,
   TIMED_TIME_HINT,
   typedTimedTime,
+  type TimedAnswer,
 } from '../commands/parties/timed.js';
+import { CHANGE_THROTTLE } from '../commands/raids/change.js';
 import { PIN_NOT_HERE, PLACE_GONE, pickedPlace } from '../commands/place-option.js';
 import type { ReportNames } from '../commands/raids/report.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -22,11 +30,23 @@ import type { MemberStanding } from '../discord/member-directory.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import type { Place } from '../domain/geo/place.js';
 import { tidyDescription } from '../domain/party/meetup.js';
-import { MAX_MEETUP_DESCRIPTION, MAX_PARTY_NAME, type MeetupParty } from '../domain/party/party.js';
-import { tidyName } from '../domain/party/timed.js';
-import { MAX_MAP_STOPS, type MeetupAnswer, type StopsView } from '../domain/web/meetup-data.js';
+import {
+  isMeetup,
+  MAX_MEETUP_DESCRIPTION,
+  MAX_PARTY_NAME,
+  mayArrange,
+  type MeetupParty,
+} from '../domain/party/party.js';
+import { asDrawn, tidyName } from '../domain/party/timed.js';
+import {
+  MAX_MAP_STOPS,
+  MEETUP_CHANGES,
+  type MeetupAnswer,
+  type MeetupChange,
+  type StopsView,
+} from '../domain/web/meetup-data.js';
 import type { MapMeetup } from '../domain/web/party-data.js';
-import { mapParty } from '../domain/web/party-view.js';
+import { mapParty, mayEditMeetup } from '../domain/web/party-view.js';
 import { problemText } from '../render/activity.js';
 import { MEETUP_PLACE_KINDS } from '../services/place-finder.js';
 import {
@@ -339,6 +359,154 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
     }
   });
 
+  /** The active meetup of this server by id, as the store has it (an ended one is not there). */
+  const activeMeetup = async (guild: string, partyId: string) => {
+    const row = await parties.guilds.idFor(guild);
+    const party = parties.store.get(partyId);
+    return row !== undefined &&
+      party?.guildId === row &&
+      party.status === 'active' &&
+      isMeetup(party)
+      ? { row, party }
+      : undefined;
+  };
+
+  /**
+   * What a change of a meetup answers: 200 when it was made; 409 when the meetup has ended, or
+   * the change was drawn from what it no longer is; 422 for any other refusal; the words as text,
+   * and the meetup as the member sees it now (not once it has ended).
+   */
+  const changed = (
+    reply: FastifyReply,
+    guild: string,
+    row: number,
+    partyId: string,
+    userId: string,
+    standing: MemberStanding,
+    answer: TimedAnswer,
+  ) => {
+    const status =
+      answer.kind === 'ok'
+        ? 200
+        : answer.kind === 'gone' || answer.reason === 'changed-meanwhile'
+          ? 409
+          : 422;
+    const party = answer.kind === 'gone' ? undefined : parties.store.get(partyId);
+    const meetup =
+      party?.status === 'active' && isMeetup(party)
+        ? viewOf(guild, row, party, userId, standing)
+        : undefined;
+    const sent: MeetupAnswer = {
+      ok: answer.kind === 'ok',
+      text: words(answer.text),
+      ...(meetup ? { meetup } : {}),
+    };
+    return reply.code(status).send(sent);
+  };
+
+  // A change of a meetup (spec 3.7), as its command makes it: before the body is read, the
+  // per-address limit, the guard of every POST and a change the map knows (404 otherwise). Then
+  // the session (403) and the body (400), who changes it (`actingOnTheMap`), the meetup (an
+  // active meetup of this server as the store has it; anything else 409 as the commands answer
+  // it), its forum (barred 403; Discord unreachable 503), whether the member may change it here
+  // (its maker or staff: 403, with the meetup), a change drawn from what the meetup no longer is
+  // (409 with the meetup as it is now; the service checks it again inside the store), and what
+  // `/meet`'s guard refuses of a start (not signed up, 403; a time it cannot read, 422); only then
+  // the command's throttle in its window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE`; a start in
+  // `/meet`'s, `START_THROTTLE`); then its code path as the member, with the value drawn.
+  const knownChange = async (request: MeetupRequest, reply: FastifyReply) => {
+    if (!isMeetupChange(request.params.change)) return sendFailure(request, reply, 404);
+  };
+  scope.post(
+    '/api/meetups/:party/:change',
+    { onRequest: [...writeGuards, knownChange] },
+    async (request: MeetupRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const { guild, party: partyId, change } = request.params;
+      if (!isMeetupChange(change)) return sendFailure(request, reply, 404);
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const input = changeInput(change, request.body ?? {});
+      if (!input) return sendFailure(request, reply, 400);
+      const { userId } = session;
+      const doing = 'changed a meetup';
+      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+      if ('sent' in acting) return acting.sent;
+      const found = await activeMeetup(guild, partyId);
+      if (!found) return refuse(reply, 409, partyOver({ type: 'meetup' }));
+      const { row, party } = found;
+      try {
+        if ((await accessTo(party.forumChannelId, userId)) === 'barred') {
+          return sendFailure(request, reply, 403);
+        }
+      } catch (err) {
+        return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
+      }
+      const { member, standing } = acting;
+      const meetupNow = () => viewOf(guild, row, party, userId, standing);
+      const staff = isMapStaff(standing, userId, parties.ownerId);
+      if (!mayEditMeetup(party, userId, staff)) return refuse(reply, 403, NOT_YOURS, meetupNow());
+      // Checked here, uncounted, and again inside the store, for a change on its way meanwhile.
+      if (asDrawn(drawnOf(party, input.change), input.drawn) !== undefined) {
+        const stale = problemText('changed-meanwhile', ctx.attendance.limits(), 'meetup');
+        return refuse(reply, 409, stale, meetupNow());
+      }
+      const now = deps.now();
+      let start: number | null = null;
+      if (input.change === 'start') {
+        // As `/meet`'s guard: refused before its limit.
+        if (!mayArrange(party, userId)) {
+          const text = problemText('not-attending', ctx.attendance.limits(), 'meetup');
+          return refuse(reply, 403, text, meetupNow());
+        }
+        try {
+          const typed = typedTimedTime(ctx, party, 'meet', input.time, now);
+          start = typed === 'unset' ? null : typed.at;
+        } catch (err) {
+          if (!(err instanceof UserError)) throw err;
+          return refuse(reply, 422, err.message, meetupNow());
+        }
+      }
+      const throttled =
+        input.change === 'start'
+          ? throttledOnTheMap(
+              deps,
+              reply,
+              { command: 'meet', varies: true },
+              userId,
+              START_THROTTLE,
+            )
+          : throttledOnTheMap(deps, reply, { command: input.change }, userId, CHANGE_THROTTLE);
+      if (throttled) return throttled;
+      let answer: TimedAnswer;
+      try {
+        switch (input.change) {
+          case 'name':
+            answer = await renameAs(ctx, party, member, input.name, input.drawn);
+            break;
+          case 'info':
+            answer = await describeAs(ctx, party, member, input.info, input.drawn);
+            break;
+          case 'start':
+            answer = await startAs(ctx, party, member, start, now, input.drawn);
+            break;
+          case 'end':
+            answer = await endAs(ctx, party, member, input.time, now, input.drawn);
+            break;
+        }
+      } catch (err) {
+        // `/end`'s reader, after its limit as in the command.
+        if (!(err instanceof UserError)) throw err;
+        return refuse(reply, 422, err.message, meetupNow());
+      }
+      deps.log.info(
+        { user: userId, guild, party: party.id, change, outcome: answer.kind },
+        'a meetup was changed on the map',
+      );
+      return changed(reply, guild, row, party.id, userId, standing, answer);
+    },
+  );
+
   // The PokéStops of a box of the map, to pick a meetup's place from (plan 8M-5M): members only
   // (as the pick lists), those in a region of this server with a title, the nearest to the box's
   // middle first, at most `MAX_MAP_STOPS` (`more` says there were more: the page asks to zoom
@@ -379,3 +547,72 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
     },
   );
 }
+
+/** What the map answers a member who may not change a meetup there (spec 3.7). */
+export const NOT_YOURS = 'Only its maker and moderators can change this meetup here.';
+
+/** The value of a meetup a change is drawn from: its name, information, start or end. */
+function drawnOf(party: MeetupParty, change: MeetupChange): string | number | null {
+  switch (change) {
+    case 'name':
+      return party.timed.name;
+    case 'info':
+      return party.meetup.description;
+    case 'start':
+      return party.timed.startTime;
+    case 'end':
+      return party.endTime;
+  }
+}
+
+/** A time as `/meet` and `/end` take it. */
+const time = z.string().max(40);
+/** A start or end as the view gave it. */
+const drawnTime = z.number().int().nullable();
+
+/** The body of each change, as its command's option is, with the value drawn. */
+const CHANGE_BODIES = {
+  name: z.object({ drawn: z.string().max(MAX_PARTY_NAME), name: z.string().max(MAX_PARTY_NAME) }),
+  info: z.object({
+    drawn: z.string().max(MAX_MEETUP_DESCRIPTION).nullable(),
+    info: z.string().max(MAX_MEETUP_DESCRIPTION),
+  }),
+  start: z.object({ drawn: drawnTime, time }),
+  end: z.object({ drawn: drawnTime, time }),
+} as const;
+
+/** A change with what it carries. */
+type ChangeInput =
+  | ({ change: 'name' } & z.infer<typeof CHANGE_BODIES.name>)
+  | ({ change: 'info' } & z.infer<typeof CHANGE_BODIES.info>)
+  | ({ change: 'start' } & z.infer<typeof CHANGE_BODIES.start>)
+  | ({ change: 'end' } & z.infer<typeof CHANGE_BODIES.end>);
+
+/** The change a body asks for; undefined for a malformed body. */
+function changeInput(change: MeetupChange, body: unknown): ChangeInput | undefined {
+  switch (change) {
+    case 'name': {
+      const parsed = CHANGE_BODIES.name.strict().safeParse(body);
+      return parsed.success ? { change, ...parsed.data } : undefined;
+    }
+    case 'info': {
+      const parsed = CHANGE_BODIES.info.strict().safeParse(body);
+      return parsed.success ? { change, ...parsed.data } : undefined;
+    }
+    case 'start': {
+      const parsed = CHANGE_BODIES.start.strict().safeParse(body);
+      return parsed.success ? { change, ...parsed.data } : undefined;
+    }
+    case 'end': {
+      const parsed = CHANGE_BODIES.end.strict().safeParse(body);
+      return parsed.success ? { change, ...parsed.data } : undefined;
+    }
+  }
+}
+
+function isMeetupChange(value: string): value is MeetupChange {
+  return (MEETUP_CHANGES as readonly string[]).includes(value);
+}
+
+/** The address of a meetup's change. */
+type MeetupRequest = FastifyRequest<{ Params: { guild: string; party: string; change: string } }>;
diff --git a/src/web/page-words.test.ts b/src/web/page-words.test.ts
index 4a19ec309db90bb0afe2ed23f196889028ae26f7..0134aab03923fab792e31da205ddc4d8171ac819 100644
--- a/src/web/page-words.test.ts
+++ b/src/web/page-words.test.ts
@@ -21,6 +21,17 @@ describe('the words of a command as the map shows them (pageWords)', () => {
     );
   });
 
+  it("writes Discord's relative timestamps as how long until then, or since", () => {
+    const at = NOW + 4 * 60 * MINUTE + 30 * MINUTE;
+    expect(
+      pageWords(`This meetup starts at ${stamp(at, 't')} (${stamp(at, 'R')}).`, ZONE, NOW),
+    ).toBe('This meetup starts at 6:30 PM (in 4 h 30 min).');
+    expect(pageWords(stamp(NOW + 5 * MINUTE, 'R'), ZONE, NOW)).toBe('in 5 min');
+    expect(pageWords(stamp(NOW + 2 * 60 * MINUTE, 'R'), ZONE, NOW)).toBe('in 2 h');
+    expect(pageWords(stamp(NOW - 90 * MINUTE, 'R'), ZONE, NOW)).toBe('1 h 30 min ago');
+    expect(pageWords(stamp(NOW, 'R'), ZONE, NOW)).toBe('now');
+  });
+
   it("takes out the bot's own markdown and undoes the escapes of what members and feeds wrote", () => {
     expect(pageWords('Try `20` (minutes from now) or `6:15pm`.', ZONE, NOW)).toBe(
       'Try 20 (minutes from now) or 6:15pm.',
diff --git a/src/web/page-words.ts b/src/web/page-words.ts
index 9412abe08af5144a1a87d8776371b5cc0521ae10..b36fd7151e708b3d230d64aa399cf58332157ec2 100644
--- a/src/web/page-words.ts
+++ b/src/web/page-words.ts
@@ -1,8 +1,8 @@
-import { clockTime } from '../domain/web/clock.js';
+import { clockTime, relativeTime } from '../domain/web/clock.js';
 import { unplain } from '../render/text.js';
 
 /** A timestamp of Discord's (`<t:1760000000:t>`), which a page cannot show. */
-const TIMESTAMP = /<t:(-?\d+)(?::[tTdDfFR])?>/gu;
+const TIMESTAMP = /<t:(-?\d+)(?::([tTdDfFR]))?>/gu;
 
 /**
  * An escape (`\_`, `\\`: what members wrote is escaped), a masked link of the bot's
@@ -15,7 +15,8 @@ const ESCAPE_LINK_OR_MARKDOWN = /\\.|\[((?:\\.|[^\]\\])*)\]\((?:<[^>\s]*>|[^)\s]
 
 /**
  * The words of a command as the live map shows them, as plain text (plans 8M-4, 8M-5): Discord's
- * timestamps as clock times in the posts' zone (`clockTime`, as the page writes times), the
+ * timestamps as clock times in the posts' zone (`clockTime`, as the page writes times) and a
+ * relative one as how long until then or since (`relativeTime`, plan 8M-5M), the
  * bot's masked links as their text (the page links nothing of a command's words), the bot's own
  * markdown taken out (escapes kept as they are), then the escapes of what members and feeds
  * wrote undone (`unplain`). Pure.
@@ -23,7 +24,11 @@ const ESCAPE_LINK_OR_MARKDOWN = /\\.|\[((?:\\.|[^\]\\])*)\]\((?:<[^>\s]*>|[^)\s]
 export function pageWords(text: string, zone: string, now: number): string {
   return unplain(
     text
-      .replace(TIMESTAMP, (_stamp, seconds: string) => clockTime(Number(seconds) * 1000, zone, now))
+      .replace(TIMESTAMP, (_stamp, seconds: string, style: string | undefined) =>
+        style === 'R'
+          ? relativeTime(Number(seconds) * 1000, now)
+          : clockTime(Number(seconds) * 1000, zone, now),
+      )
       .replace(ESCAPE_LINK_OR_MARKDOWN, (match, linked: string | undefined) =>
         match.startsWith('\\') ? match : (linked ?? ''),
       ),
````

### Task 4: Meetups from the map: the view and the page

Prototype commit: `1cee4e0d9681c872bbcab7e24f8ddc5157e11eea`

`MapMeetup` gains its place (in words: "At …", "Near …", "At … (a pin)", "At a dropped pin"), information and `panel`; a meetup with a place is a ring on a pane of its own above the markers. "New meetup" and "Meetup here": a form whose region follows the picked place unless chosen; pick mode shows the view's PokéStops (debounced, the newest answer only) and takes a gym, a stop or a pin; the editor sends one change at a time and closes when the member may no longer change the meetup.

**Files:**

```
 src/domain/web/party-data.ts        |  27 ++++
 src/domain/web/party-view.test.ts   |  65 +++++++++
 src/domain/web/party-view.ts        |  33 +++++
 src/web/client/map.css              |  43 ++++++
 src/web/client/meetup-forms.test.ts | 414 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/meetup-forms.ts      | 548 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/meetup-ui.ts         | 397 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/parties.test.ts      |  32 +++++
 src/web/client/parties.ts           |  39 +++++-
 src/web/client/party-layer.ts       | 162 +++++++++++++++++++++--
 src/web/client/popup.ts             |   2 +-
 src/web/client/raid-ui.ts           |  12 +-
 src/web/client/train-forms.test.ts  |   2 +
 src/web/client/train-forms.ts       |   8 +-
 14 files changed, 1759 insertions(+), 25 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/meetup-forms.test.ts src/web/client/parties.test.ts src/web/client/train-forms.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/web/client/meetup-forms.test.ts src/web/client/meetup-forms.ts src/web/client/meetup-ui.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/popup.ts src/web/client/raid-ui.ts src/web/client/train-forms.test.ts src/web/client/train-forms.ts` and `npx eslint src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/web/client/meetup-forms.test.ts src/web/client/meetup-forms.ts src/web/client/meetup-ui.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/popup.ts src/web/client/raid-ui.ts src/web/client/train-forms.test.ts src/web/client/train-forms.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 1cee4e0d9681c872bbcab7e24f8ddc5157e11eea -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Meetups from the map: the view and the page`, the paragraph above as the body and the trailer, staging exactly
  `src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/web/client/map.css src/web/client/meetup-forms.test.ts src/web/client/meetup-forms.ts src/web/client/meetup-ui.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/popup.ts src/web/client/raid-ui.ts src/web/client/train-forms.test.ts src/web/client/train-forms.ts`.

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index be375c0eb9abbe78375adb5da4a45ecf957c5954..5ed96c962ad18648f4e702526e44b9134c07d2f9 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -142,6 +142,33 @@ export interface MapMeetup {
   endTime: number | null;
   link: string;
   attendance: MapAttendance;
+  /**
+   * Where it is (plan 8M-5M): the place it was made at, as it was named (a snapshot); null for a
+   * meetup made before places (8D).
+   */
+  place: MapMeetupPlace | null;
+  /** Its information as its maker wrote it (the post's "Meeting Information"), plain text. */
+  info: string | null;
+  /**
+   * The editor on the map for who may change it (plan 8M-5M: its maker and staff; never while
+   * read-only), null for anybody else: name, information and end, and the start (`start`) only
+   * for a member signed up, as `/meet` has it.
+   */
+  panel: { start: boolean } | null;
+}
+
+/**
+ * A meetup's place as the map shows it: its kind (a gym, a PokéStop, a power spot of a meetup
+ * made before they were refused, or a pin), where it is in words (`At The Stacks`, `Near
+ * Market Fountain` or `At Blue Tent (a pin)` for a pin, `At a dropped pin`), its point, and the
+ * gym's id for a gym (null otherwise).
+ */
+export interface MapMeetupPlace {
+  kind: 'gym' | 'stop' | 'powerspot' | 'pin';
+  words: string;
+  lat: number;
+  lon: number;
+  gymId: number | null;
 }
 
 /** A party of any kind, as the map shows it. */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 582f40e17cec3b63019b52681de1f7787fc1e234..bea0eea6b6c7d6b87d6deff9569a1e743c51e73a 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -218,12 +218,77 @@ describe('partyView', () => {
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
         },
+        // Made before 8D: no place; no information; not the member's to change.
+        place: null,
+        info: null,
+        panel: null,
       },
     ]);
     const finished = { ...train, train: { ...train.train, stop: 3 } };
     expect(partyView(input([finished])).trains[0]?.stop).toBeNull();
   });
 
+  it('shows a meetup at its place, with its information as written, and the editor for its maker and staff', () => {
+    const atGym = posted({
+      ...testMeetup({
+        createdById: ALICE,
+        place: {
+          kind: 'gym',
+          id: '2',
+          title: 'Old Stone Fountain',
+          lat: 40.06,
+          lon: -80.06,
+          address: '12 Market Street',
+          image: null,
+        },
+        description: 'Bring **snacks** <@1>\nand cups.',
+      }),
+    });
+    const [shown] = partyView(input([atGym])).meetups;
+    expect(shown).toMatchObject({
+      place: { kind: 'gym', words: 'At Old Stone Fountain', lat: 40.06, lon: -80.06, gymId: 2 },
+      // As written: the page sets it as text.
+      info: 'Bring **snacks** <@1>\nand cups.',
+      // Alice made it and is signed up: every change, the start too.
+      panel: { start: true },
+    });
+    const pin = posted({
+      ...testMeetup({
+        place: { kind: 'pin', lat: 40.08, lon: -80.08, near: null, linkName: 'Blue Tent' },
+      }),
+    });
+    const [atPin] = partyView(input([pin])).meetups;
+    expect(atPin?.place).toEqual({
+      kind: 'pin',
+      words: 'At Blue Tent (a pin)',
+      lat: 40.08,
+      lon: -80.08,
+      gymId: null,
+    });
+    // Not the maker: nothing to change, but for staff, who may not set a start unless signed up.
+    expect(atPin?.panel).toBeNull();
+    expect(partyView(input([pin], { staff: true })).meetups[0]?.panel).toEqual({ start: false });
+    expect(partyView(input([atGym], { readOnly: true })).meetups[0]?.panel).toBeNull();
+    const unnamed = posted({
+      ...testMeetup({
+        place: { kind: 'pin', lat: 40.08, lon: -80.08, near: null, linkName: null },
+      }),
+    });
+    expect(partyView(input([unnamed])).meetups[0]?.place?.words).toBe('At a dropped pin');
+    const nearStop = posted({
+      ...testMeetup({
+        place: {
+          kind: 'pin',
+          lat: 40.08,
+          lon: -80.08,
+          near: { kind: 'stop', title: 'Market Fountain' },
+          linkName: null,
+        },
+      }),
+    });
+    expect(partyView(input([nearStop])).meetups[0]?.place?.words).toBe('Near Market Fountain');
+  });
+
   it('names nobody: no reporter, maker, attendee or their ids, whatever their privacy', () => {
     const anonymous = withAttendees(
       { ...egg, anonymous: true, makerName: 'Rita Reporter' },
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 2b34ec3b64ebb26765e228a63d47c7370e8c6de2..90af25bf8d9b4c59c802dd8e3be1944bae64c626 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -27,6 +27,7 @@ import type {
   GroupCounts,
   MapAttendance,
   MapMeetup,
+  MapMeetupPlace,
   MapParty,
   MapPress,
   MapRaid,
@@ -257,6 +258,35 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
   };
 }
 
+/**
+ * A meetup's place as the map shows it (plan 8M-5M): the snapshot it was named as, in words: a
+ * gym or stop `At <title>`; a pin named by a gym or stop near it `Near <title>`, by the name
+ * its link gave `At <name> (a pin)`, else `At a dropped pin`.
+ */
+export function meetupPlaceOf(place: MeetupParty['meetup']['place']): MapMeetupPlace | null {
+  if (place === null) return null;
+  if (place.kind === 'pin') {
+    const words =
+      place.near !== null
+        ? `Near ${place.near.title}`
+        : place.linkName !== null
+          ? `At ${place.linkName} (a pin)`
+          : 'At a dropped pin';
+    return { kind: 'pin', words, lat: place.lat, lon: place.lon, gymId: null };
+  }
+  const gymId = place.kind === 'gym' && /^\d+$/u.test(place.id) ? Number(place.id) : null;
+  return { kind: place.kind, words: `At ${place.title}`, lat: place.lat, lon: place.lon, gymId };
+}
+
+/**
+ * The editor of a meetup on the map as the member may use it (plan 8M-5M): its maker and staff
+ * (`mayEditMeetup`), the start only signed up (`mayArrange`, as `/meet`); none while read-only.
+ */
+export function meetupPanelOf(party: MeetupParty, input: PartyViewInput): MapMeetup['panel'] {
+  if (input.readOnly || !mayEditMeetup(party, input.memberId, input.staff)) return null;
+  return { start: mayArrange(party, input.memberId) };
+}
+
 function meetupOf(party: MeetupParty, link: string, input: PartyViewInput): MapMeetup {
   return {
     kind: 'meetup',
@@ -266,6 +296,9 @@ function meetupOf(party: MeetupParty, link: string, input: PartyViewInput): MapM
     endTime: party.endTime,
     link,
     attendance: attendanceOf(party, input, false),
+    place: meetupPlaceOf(party.meetup.place),
+    info: party.meetup.description,
+    panel: meetupPanelOf(party, input),
   };
 }
 
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 7c3226bff88fd0e52e7ef80a6e607c2809a2c893..da2fdd5ae586f7a2584bea69d44dfcc6f6df9092 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -363,3 +363,46 @@ body {
   background: #d35400;
   color: #fff;
 }
+
+/* Meetups from the map (plan 8M-5M): "New meetup", "Meetup here", the form, the editor. */
+.new-meetup,
+.meetup-here,
+.meetup-actions .press {
+  margin-top: 6px;
+  margin-left: 4px;
+  padding: 3px 10px;
+  border: 1px solid #8a94a6;
+  border-radius: 4px;
+  background: #fff;
+  font: inherit;
+  cursor: pointer;
+}
+
+.new-meetup:disabled,
+.meetup-here:disabled,
+.meetup-actions .press:disabled {
+  opacity: 0.5;
+  cursor: default;
+}
+
+.meetup-here {
+  margin-left: 0;
+}
+
+.raid-form textarea {
+  flex: 1 1 100%;
+  max-width: 100%;
+  padding: 3px 6px;
+  font: inherit;
+  resize: vertical;
+}
+
+.meetup-place .picked,
+.meetup-place .picking {
+  flex: 1 1 140px;
+}
+
+.party-popup .info {
+  margin: 2px 0;
+  white-space: pre-line;
+}
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e75a319cc8e1a2cdd57dad3d9fc0b5d2aa9660cd
--- /dev/null
+++ b/src/web/client/meetup-forms.test.ts
@@ -0,0 +1,414 @@
+import { describe, expect, it, vi } from 'vitest';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { StopsView } from '../../domain/web/meetup-data.js';
+import type { MapMeetup } from '../../domain/web/party-data.js';
+import {
+  editorEnds,
+  gymPick,
+  meetupActions,
+  meetupAnswerOf,
+  meetupChangeBody,
+  meetupEditor,
+  meetupHereBox,
+  newMeetupBody,
+  newMeetupForm,
+  pinPick,
+  PlacePicking,
+  sendMeetupForm,
+  StopLoads,
+  stopPick,
+  type PickedPlace,
+} from './meetup-forms.js';
+import type { MapGym, PageNode } from './popup.js';
+
+const ZONE = 'America/New_York';
+/** 2026-10-13 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const HOUR = 3_600_000;
+
+/** West and East, side by side, as `/api/geo` gives them. */
+const REGIONS: GeoView['regions'] = [
+  {
+    id: 1,
+    name: 'west',
+    outline: [
+      [40.0, -80.1],
+      [40.1, -80.1],
+      [40.1, -80.0],
+      [40.0, -80.0],
+      [40.0, -80.1],
+    ],
+  },
+  {
+    id: 2,
+    name: 'east',
+    outline: [
+      [40.0, -80.0],
+      [40.1, -80.0],
+      [40.1, -79.9],
+      [40.0, -79.9],
+      [40.0, -80.0],
+    ],
+  },
+];
+
+const GYM: MapGym = {
+  id: 1,
+  name: 'Pinewood Public Library',
+  nickname: 'The Stacks',
+  lat: 40.05,
+  lon: -80.05,
+  regionIds: [1],
+  address: null,
+  description: null,
+  notice: null,
+};
+
+const MEETUP: MapMeetup = {
+  kind: 'meetup',
+  id: 'm1',
+  name: 'Picnic',
+  startTime: NOW + 4 * HOUR,
+  endTime: null,
+  link: 'https://discord.com/channels/1/2',
+  attendance: { groups: [], mine: null, actions: [] },
+  place: { kind: 'gym', words: 'At The Stacks', lat: 40.05, lon: -80.05, gymId: 1 },
+  info: 'Bring snacks.',
+  panel: { start: true },
+};
+
+function texts(node: PageNode): string[] {
+  return [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];
+}
+
+/** The nodes of a tree that have this attribute. */
+function withAttribute(node: PageNode, name: string): PageNode[] {
+  return [
+    ...(node.attributes?.[name] === undefined ? [] : [node]),
+    ...(node.children ?? []).flatMap((child) => withAttribute(child, name)),
+  ];
+}
+
+const VALUES = { name: 'Picnic', region: '1', start: '6pm', info: 'Bring snacks.' };
+
+describe('the places a meetup may be picked at on the map', () => {
+  it('names a gym as its post does, a PokéStop and a pin, each with the regions it lies in', () => {
+    expect(gymPick(GYM)).toEqual({
+      body: { kind: 'gym', id: '1' },
+      label: 'The Stacks (gym)',
+      regionIds: [1],
+    });
+    expect(stopPick(['abc.16', 40.05, -79.95, 'Market Fountain'], REGIONS)).toEqual({
+      body: { kind: 'stop', id: 'abc.16' },
+      label: 'Market Fountain (PokéStop)',
+      regionIds: [2],
+    });
+    expect(pinPick({ lat: 40.0512345678, lon: -80.0512345678 }, REGIONS)).toEqual({
+      body: { lat: 40.051235, lon: -80.051235 },
+      label: 'A pin at 40.05123, -80.05124',
+      regionIds: [1],
+    });
+  });
+
+  it('picks what is clicked only while picking, once, and opens no popup for it', () => {
+    const picked = vi.fn<(place: PickedPlace) => void>();
+    const picking = new PlacePicking(picked);
+    expect(picking.gym(GYM)).toBe(false);
+    picking.start();
+    expect(picking.picking).toBe(true);
+    expect(picking.point({ lat: 40.05, lon: -79.95 }, REGIONS)).toBe(true);
+    expect(picking.picking).toBe(false);
+    expect(picking.gym(GYM)).toBe(false);
+    picking.start();
+    expect(picking.stopClicked(['abc.16', 40.05, -79.95, 'Fountain'], REGIONS)).toBe(true);
+    picking.start();
+    picking.end();
+    expect(picking.gym(GYM)).toBe(false);
+    expect(picked.mock.calls.map(([place]) => place.label)).toEqual([
+      'A pin at 40.05000, -79.95000',
+      'Fountain (PokéStop)',
+    ]);
+  });
+});
+
+describe('the form of a new meetup', () => {
+  it('asks the name, the region (the place’s by default), the place, the start and the information', () => {
+    const form = newMeetupForm(REGIONS, gymPick(GYM));
+    expect(texts(form)).toEqual([
+      'New meetup',
+      'Name',
+      'Region',
+      'Pick the region',
+      'west',
+      'east',
+      'Place',
+      'The Stacks (gym)',
+      'Pick again',
+      'Starts',
+      'Information',
+      'Make the meetup',
+      'Cancel',
+    ]);
+    const selected = withAttribute(form, 'selected').map((node) => node.text);
+    expect(selected).toEqual(['west']);
+    // What was typed and a region the member chose stay when it is drawn anew.
+    const again = newMeetupForm(
+      REGIONS,
+      gymPick(GYM),
+      { ...VALUES, region: '2', info: 'x' },
+      false,
+      true,
+    );
+    expect(withAttribute(again, 'selected').map((node) => node.text)).toEqual(['east']);
+    expect(texts(again)).toContain('x');
+  });
+
+  it('follows the place picked with its region unless the member chose one', () => {
+    const regionOf = (form: PageNode) => withAttribute(form, 'selected').map((node) => node.text);
+    const east = stopPick(['abc.16', 40.05, -79.95, 'Market Fountain'], REGIONS);
+    // Drawn again with nothing chosen yet: the place's region.
+    expect(regionOf(newMeetupForm(REGIONS, gymPick(GYM), { ...VALUES, region: '' }))).toEqual([
+      'west',
+    ]);
+    // Picked again in East, the region drawn before not chosen: East.
+    expect(regionOf(newMeetupForm(REGIONS, east, { ...VALUES, region: '1' }))).toEqual(['east']);
+    // Chosen by the member: it stays whatever is picked.
+    expect(regionOf(newMeetupForm(REGIONS, east, { ...VALUES, region: '1' }, false, true))).toEqual(
+      ['west'],
+    );
+    // Chosen, then set back to none: the place's region again.
+    expect(regionOf(newMeetupForm(REGIONS, east, { ...VALUES, region: '' }, false, true))).toEqual([
+      'east',
+    ]);
+  });
+
+  it('says what to click while picking, and that a pin waits for a moderator', () => {
+    expect(texts(newMeetupForm(REGIONS, undefined, {}, true))).toContain(
+      'Click a gym, a PokéStop or a point of the map.',
+    );
+    expect(texts(newMeetupForm(REGIONS, undefined))).toContain('Pick on the map');
+    expect(texts(newMeetupForm(REGIONS, pinPick({ lat: 40.05, lon: -80.05 }, REGIONS)))).toContain(
+      "A meetup at a pin needs a moderator's approval before it is posted.",
+    );
+  });
+
+  it('sends what /meetup takes, and says first what is missing', () => {
+    expect(newMeetupBody(VALUES, gymPick(GYM))).toEqual({
+      body: {
+        region: 1,
+        name: 'Picnic',
+        place: { kind: 'gym', id: '1' },
+        start: '6pm',
+        info: 'Bring snacks.',
+      },
+    });
+    expect(newMeetupBody({ ...VALUES, name: ' ' }, gymPick(GYM))).toEqual({
+      text: 'Give the meetup a name first.',
+    });
+    expect(newMeetupBody({ ...VALUES, region: '' }, gymPick(GYM))).toEqual({
+      text: 'Pick the region first.',
+    });
+    expect(newMeetupBody(VALUES, undefined)).toEqual({ text: 'Pick its place on the map first.' });
+    expect(newMeetupBody({ ...VALUES, start: '' }, gymPick(GYM))).toEqual({
+      text: 'Say when it starts first.',
+    });
+    expect(newMeetupBody({ ...VALUES, info: '\n ' }, gymPick(GYM))).toEqual({
+      text: 'Say what there is to know first: where to meet, what to bring.',
+    });
+  });
+
+  it('is opened from a gym’s popup with the gym as its place', () => {
+    expect(withAttribute(meetupHereBox(7), 'data-meetup-here')[0]?.attributes).toMatchObject({
+      'data-meetup-here': '7',
+    });
+  });
+});
+
+describe('the editor of a meetup', () => {
+  it('is offered to who may change it', () => {
+    expect(texts({ tag: 'div', children: meetupActions(MEETUP) })).toEqual(['Edit…']);
+    expect(meetupActions({ ...MEETUP, panel: null })).toEqual([]);
+  });
+
+  it('shows its name and information to change, its times as they are, each with a Set', () => {
+    const editor = meetupEditor(MEETUP, ZONE, NOW);
+    expect(texts(editor)).toEqual([
+      'Edit Picnic',
+      'At The Stacks',
+      'Name',
+      'Set',
+      'Information',
+      'Bring snacks.',
+      'Set',
+      'Starts now: 6:00 PM',
+      'Starts',
+      'Set',
+      'Ends now: none',
+      'Ends',
+      'Set',
+      'Done',
+    ]);
+    expect(
+      withAttribute(editor, 'data-change').map((node) => node.attributes?.['data-change']),
+    ).toEqual(['name', 'info', 'start', 'end']);
+    // Not signed up: the start is not theirs to change.
+    const staff = meetupEditor({ ...MEETUP, panel: { start: false } }, ZONE, NOW);
+    expect(texts(staff)).toContain('Sign up for it to change when it starts.');
+    expect(
+      withAttribute(staff, 'data-change').map((node) => node.attributes?.['data-change']),
+    ).toEqual(['name', 'info', 'end']);
+  });
+
+  it('sends each change alone with the value it was drawn from', () => {
+    expect(meetupChangeBody('name', MEETUP, { name: ' Park picnic ' })).toEqual({
+      body: { drawn: 'Picnic', name: 'Park picnic' },
+    });
+    expect(meetupChangeBody('info', MEETUP, { info: '' })).toEqual({
+      body: { drawn: 'Bring snacks.', info: '' },
+    });
+    expect(meetupChangeBody('start', MEETUP, { start: '7pm' })).toEqual({
+      body: { drawn: NOW + 4 * HOUR, time: '7pm' },
+    });
+    expect(meetupChangeBody('end', MEETUP, { end: 'none' })).toEqual({
+      body: { drawn: null, time: 'none' },
+    });
+    expect(meetupChangeBody('end', MEETUP, {})).toEqual({ text: 'Say when it ends first.' });
+    expect(meetupChangeBody('name', MEETUP, { name: '' })).toEqual({
+      text: 'Give the meetup a name first.',
+    });
+  });
+});
+
+describe('the answers of the meetups’ addresses', () => {
+  it('reads whether it was done, what came of a making, and the meetup', () => {
+    expect(meetupAnswerOf({ ok: true, outcome: 'held', text: 'x' })).toEqual({
+      ok: true,
+      outcome: 'held',
+    });
+    expect(meetupAnswerOf({ ok: false, text: 'x', meetup: MEETUP })).toEqual({
+      ok: false,
+      meetup: MEETUP,
+    });
+    expect(meetupAnswerOf({ ok: true, meetup: { id: 1 } })).toEqual({ ok: true });
+    expect(meetupAnswerOf('nonsense')).toEqual({ ok: false });
+  });
+
+  it('closes the editor for a meetup that is gone, or that the member may no longer change', () => {
+    expect(editorEnds({ ok: false, status: 409 })).toBe(true);
+    expect(editorEnds({ ok: false, status: 409, meetup: MEETUP })).toBe(false);
+    expect(editorEnds({ ok: false, status: 429 })).toBe(false);
+    expect(editorEnds({ ok: false })).toBe(false);
+    // No longer staff (a 403 with the meetup), or not any more after a change that went through.
+    const notTheirs = { ...MEETUP, panel: null };
+    expect(editorEnds({ ok: false, status: 403, meetup: notTheirs })).toBe(true);
+    expect(editorEnds({ ok: true, status: 200, meetup: notTheirs })).toBe(true);
+  });
+
+  it('sends with the page’s token, and once more with a new one after a stale token’s 403', async () => {
+    const tokens: string[] = [];
+    const sent = await sendMeetupForm('old', {
+      post: (token) => {
+        tokens.push(token);
+        return Promise.resolve(
+          token === 'old'
+            ? { status: 403, body: { error: 'Forbidden' } }
+            : { status: 200, body: { ok: true, outcome: 'posted', text: 'Made.', meetup: MEETUP } },
+        );
+      },
+      me: () =>
+        Promise.resolve({
+          loggedIn: true,
+          name: 'Alice',
+          member: true,
+          csrf: 'new',
+          readOnly: false,
+        }),
+    });
+    expect(tokens).toEqual(['old', 'new']);
+    expect(sent).toEqual({
+      text: 'Made.',
+      csrf: 'new',
+      ok: true,
+      outcome: 'posted',
+      meetup: MEETUP,
+      status: 200,
+    });
+  });
+});
+
+describe('the PokéStops of "pick a place" mode (StopLoads)', () => {
+  /** Questions answered as the test says, a timer run by hand. */
+  function loads() {
+    const answers: Array<(view: StopsView) => void> = [];
+    const shown: StopsView[] = [];
+    const more: boolean[] = [];
+    let timer: { run: () => void; ms: number } | undefined;
+    const stopLoads = new StopLoads({
+      load: () =>
+        new Promise<StopsView>((resolve) => {
+          answers.push(resolve);
+        }),
+      show: (view) => shown.push(view),
+      more: (on) => more.push(on),
+      failed: () => undefined,
+      delayMs: 300,
+      setTimer: (run, ms) => {
+        timer = { run, ms };
+        return () => {
+          timer = undefined;
+        };
+      },
+    });
+    const fire = () => {
+      const due = timer;
+      timer = undefined;
+      due?.run();
+    };
+    return { stopLoads, answers, shown, more, fire, timer: () => timer };
+  }
+  const view = (n: number, many = false): StopsView => ({
+    stops: [[`s${n}`, 40, -80, `Stop ${n}`]],
+    more: many,
+  });
+
+  it('asks once the map has rested 300 ms, however often it moved', () => {
+    const { stopLoads, answers, fire, timer } = loads();
+    stopLoads.moved();
+    stopLoads.moved();
+    stopLoads.moved();
+    expect(answers).toHaveLength(0);
+    expect(timer()?.ms).toBe(300);
+    fire();
+    expect(answers).toHaveLength(1);
+  });
+
+  it('shows only the answer to the last question, and none once stopped', async () => {
+    const { stopLoads, answers, shown } = loads();
+    stopLoads.now();
+    stopLoads.now();
+    answers[1]?.(view(2));
+    answers[0]?.(view(1));
+    await stopLoads.idle();
+    expect(shown.map((one) => one.stops[0]?.[0])).toEqual(['s2']);
+    stopLoads.now();
+    stopLoads.stop();
+    answers[2]?.(view(3));
+    await stopLoads.idle();
+    expect(shown).toHaveLength(1);
+  });
+
+  it('says there are more only when that changes', async () => {
+    const { stopLoads, answers, more } = loads();
+    for (const [n, many] of [
+      [1, true],
+      [2, true],
+      [3, false],
+      [4, true],
+    ] as const) {
+      stopLoads.now();
+      answers[n - 1]?.(view(n, many));
+      await stopLoads.idle();
+    }
+    expect(more).toEqual([true, false, true]);
+  });
+});
diff --git a/src/web/client/meetup-forms.ts b/src/web/client/meetup-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e8e55c312064e0e77538fb0a0f9d630f1c9c1b76
--- /dev/null
+++ b/src/web/client/meetup-forms.ts
@@ -0,0 +1,548 @@
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import { clockTime } from '../../domain/web/clock.js';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { MeetupChange, MeetupPlaceBody, StopsView } from '../../domain/web/meetup-data.js';
+import type { MapMeetup } from '../../domain/web/party-data.js';
+import { pressParty, type PressSteps, type Pressed } from './parties.js';
+import type { MapGym, PageNode } from './popup.js';
+import { regionsAt, spawnPoint, type PointRegion } from './spawn-forms.js';
+
+/**
+ * Meetups on the live map (plan 8M-5M, spec 3.7), the parts that need no Leaflet: "New meetup"
+ * and "Meetup here", the place picked on the map (a gym, a PokéStop or a pin; never a power spot),
+ * the form of a new meetup and the editor of one, the bodies they send, reading an answer, and
+ * sending one with the page's CSRF token as a press is sent. Everything is a tree of nodes
+ * (`renderNode` sets every text as text). What a member types is read by the server with the
+ * commands' readers; the page only says what is missing.
+ */
+
+/** The longest name of a meetup (`/meetup`'s option). */
+const NAME_LENGTH = 80;
+/** The longest start `/meetup` takes, and the longest time `/meet` and `/end` take. */
+const START_LENGTH = 100;
+const TIME_LENGTH = 40;
+/** The longest information (`/info`'s form). */
+const INFO_LENGTH = 1_000;
+
+const button = (
+  text: string,
+  attributes: Record<string, string>,
+  className = 'press',
+): PageNode => ({
+  tag: 'button',
+  className,
+  text,
+  attributes: { type: 'button', ...attributes },
+});
+
+const option = (value: string, text: string, selected: boolean): PageNode => ({
+  tag: 'option',
+  text,
+  attributes: { value, ...(selected ? { selected: '' } : {}) },
+});
+
+const labelled = (text: string, ...children: PageNode[]): PageNode => ({
+  tag: 'label',
+  className: 'form-row',
+  children: [{ tag: 'span', text }, ...children],
+});
+
+const textInput = (
+  name: string,
+  length: number,
+  placeholder: string,
+  value?: string,
+): PageNode => ({
+  tag: 'input',
+  attributes: {
+    name,
+    type: 'text',
+    maxlength: String(length),
+    placeholder,
+    autocomplete: 'off',
+    ...(value === undefined || value === '' ? {} : { value }),
+  },
+});
+
+const infoArea = (value: string | undefined): PageNode => ({
+  tag: 'textarea',
+  attributes: {
+    name: 'info',
+    rows: '4',
+    maxlength: String(INFO_LENGTH),
+    placeholder: 'Where to meet, what to bring, how long it goes.',
+  },
+  ...(value === undefined ? {} : { text: value }),
+});
+
+/** The line under a form where its answer is said. */
+const answerLine: PageNode = { tag: 'div', className: 'form-answer', attributes: { hidden: '' } };
+
+/** A body to send, or what is missing. */
+export type MeetupBody = { body: Record<string, unknown> } | { text: string };
+
+/** "New meetup", beside "New train" in the side panel's box. */
+export function newMeetupButton(): PageNode {
+  return button('New meetup', { 'data-new-meetup': '' }, 'press new-meetup');
+}
+
+/** "Meetup here" in a gym's popup: the form of a new meetup with the gym as its place. */
+export function meetupHereBox(gymId: number): PageNode {
+  return {
+    tag: 'div',
+    className: 'meetup-box',
+    children: [button('Meetup here', { 'data-meetup-here': String(gymId) }, 'meetup-here')],
+  };
+}
+
+/**
+ * A place picked on the map for a new meetup: what the server is sent (`MeetupPlaceBody`), how
+ * the form names it, and the regions it lies in (the form's region by default: the first).
+ */
+export interface PickedPlace {
+  body: MeetupPlaceBody;
+  label: string;
+  regionIds: number[];
+}
+
+/** A gym picked (its dot, the marker of its raids, "Meetup here"). */
+export function gymPick(gym: MapGym): PickedPlace {
+  return {
+    body: { kind: 'gym', id: String(gym.id) },
+    label: `${gym.nickname !== null && gym.nickname !== '' ? gym.nickname : gym.name} (gym)`,
+    regionIds: [...gym.regionIds],
+  };
+}
+
+/** A PokéStop as `/api/stops` gives it: `[id, lat, lon, title]`. */
+export type MapStop = [string, number, number, string];
+
+/** A PokéStop picked in "pick a place" mode. */
+export function stopPick(stop: MapStop, regions: GeoView['regions']): PickedPlace {
+  const [id, lat, lon, title] = stop;
+  return {
+    body: { kind: 'stop', id },
+    label: `${title} (PokéStop)`,
+    regionIds: regionsAt({ lat, lon }, regions).map((region) => region.id),
+  };
+}
+
+/**
+ * A pin dropped by a click on the map in "pick a place" mode, to six decimals; a pin always waits
+ * for a moderator's approval (the form says so).
+ */
+export function pinPick(point: LatLon, regions: GeoView['regions']): PickedPlace {
+  const at = spawnPoint(point.lat, point.lon);
+  return {
+    body: { lat: at.lat, lon: at.lon },
+    label: `A pin at ${at.lat.toFixed(5)}, ${at.lon.toFixed(5)}`,
+    regionIds: regionsAt(at, regions).map((region) => region.id),
+  };
+}
+
+/** What the form of a new meetup holds, kept when it is drawn anew. */
+export interface NewMeetupValues {
+  name: string;
+  region: string;
+  start: string;
+  info: string;
+}
+
+/**
+ * The form of a new meetup, as `/meetup` takes it (spec 3.7): its name, the region it is made in
+ * (any region of the server; the first the place lies in, following each place picked, until the
+ * member chooses one: `regionChosen`), its place (picked on the map: "Pick on the map", or what
+ * was picked with "Pick again"; while picking, what to click and "Stop picking"), when it starts
+ * (required, as `/meetup start:` reads it), and its information (required, as `/meetup`'s form).
+ * `filled` is what the form drawn before held.
+ */
+export function newMeetupForm(
+  regions: readonly PointRegion[],
+  place: PickedPlace | undefined,
+  filled: Partial<NewMeetupValues> = {},
+  picking = false,
+  regionChosen = false,
+): PageNode {
+  const chosen = regionChosen && filled.region !== undefined && filled.region !== '';
+  const ofPlace = place?.regionIds[0];
+  const region = chosen
+    ? (filled.region ?? '')
+    : ofPlace === undefined
+      ? (filled.region ?? '')
+      : String(ofPlace);
+  const placeLine: PageNode = picking
+    ? {
+        tag: 'div',
+        className: 'hint picking',
+        text: 'Click a gym, a PokéStop or a point of the map.',
+      }
+    : { tag: 'div', className: 'picked', text: place?.label ?? 'No place yet.' };
+  const pinNote: PageNode[] =
+    place !== undefined && !('kind' in place.body) && !picking
+      ? [
+          {
+            tag: 'p',
+            className: 'hint',
+            text: "A meetup at a pin needs a moderator's approval before it is posted.",
+          },
+        ]
+      : [];
+  return {
+    tag: 'div',
+    className: 'raid-form meetup-form',
+    attributes: { 'data-form': 'meetup' },
+    children: [
+      { tag: 'strong', className: 'name', text: 'New meetup' },
+      labelled('Name', textInput('name', NAME_LENGTH, 'Such as Community Day picnic', filled.name)),
+      labelled('Region', {
+        tag: 'select',
+        attributes: { name: 'region' },
+        children: [
+          option('', 'Pick the region', region === ''),
+          ...regions.map((each) => option(String(each.id), each.name, String(each.id) === region)),
+        ],
+      }),
+      {
+        tag: 'div',
+        className: 'form-row meetup-place',
+        children: [
+          { tag: 'span', text: 'Place' },
+          placeLine,
+          picking
+            ? button('Stop picking', { 'data-pick': 'stop' })
+            : button(place === undefined ? 'Pick on the map' : 'Pick again', {
+                'data-pick': 'start',
+              }),
+        ],
+      },
+      ...pinNote,
+      labelled(
+        'Starts',
+        textInput('start', START_LENGTH, '6:30pm or 10-18 11am (month-day)', filled.start),
+      ),
+      labelled('Information', infoArea(filled.info)),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          button('Make the meetup', { 'data-submit': 'meetup' }),
+          button('Cancel', { 'data-cancel': '' }),
+        ],
+      },
+      answerLine,
+    ],
+  };
+}
+
+/** The body of a new meetup (`POST /s/<guild>/api/meetups`), or what is missing. */
+export function newMeetupBody(values: NewMeetupValues, place: PickedPlace | undefined): MeetupBody {
+  const name = values.name.trim();
+  if (name === '') return { text: 'Give the meetup a name first.' };
+  const region = Number(values.region);
+  if (values.region === '' || !Number.isInteger(region)) return { text: 'Pick the region first.' };
+  if (place === undefined) return { text: 'Pick its place on the map first.' };
+  const start = values.start.trim();
+  if (start === '') return { text: 'Say when it starts first.' };
+  if (values.info.trim() === '') {
+    return { text: 'Say what there is to know first: where to meet, what to bring.' };
+  }
+  return { body: { region, name, place: place.body, start, info: values.info } };
+}
+
+/** "Edit…" in a meetup's popup or item, for its maker and staff (`MapMeetup.panel`). */
+export function meetupActions(meetup: MapMeetup): PageNode[] {
+  return meetup.panel
+    ? [
+        {
+          tag: 'div',
+          className: 'meetup-actions',
+          children: [button('Edit…', { 'data-edit-meetup': meetup.id })],
+        },
+      ]
+    : [];
+}
+
+/** What the editor holds that the member typed, kept when it is drawn anew. */
+export type MeetupEditorFilled = Partial<Record<MeetupChange, string>>;
+
+/** A time as the editor says it now: `Now: 6:00 PM`, or that there is none. */
+function nowLine(words: string, at: number | null, zone: string, now: number): PageNode {
+  return {
+    tag: 'div',
+    className: 'hint',
+    text: at === null ? `${words}: none` : `${words}: ${clockTime(at, zone, now)}`,
+  };
+}
+
+/**
+ * The editor of a meetup on the map (spec 3.7), for its maker and staff: its name, its
+ * information, when it starts (only for a member signed up, as `/meet`; else why not) and when it
+ * ends (`none` removes it), each with a Set of its own that sends that change alone, and Done.
+ * `filled` is what the editor drawn before held; a field not typed in shows what the meetup has.
+ */
+export function meetupEditor(
+  meetup: MapMeetup,
+  zone: string,
+  now: number,
+  filled: MeetupEditorFilled = {},
+): PageNode {
+  const set = (change: MeetupChange): PageNode => button('Set', { 'data-change': change });
+  const start: PageNode[] = meetup.panel?.start
+    ? [
+        nowLine('Starts now', meetup.startTime, zone, now),
+        labelled(
+          'Starts',
+          textInput('start', TIME_LENGTH, '6:15pm, 10-17 6:15pm or in 30', filled.start),
+          set('start'),
+        ),
+      ]
+    : [
+        nowLine('Starts', meetup.startTime, zone, now),
+        { tag: 'p', className: 'hint', text: 'Sign up for it to change when it starts.' },
+      ];
+  return {
+    tag: 'div',
+    className: 'raid-form meetup-editor',
+    attributes: { 'data-form': 'meetup-edit', 'data-party': meetup.id },
+    children: [
+      { tag: 'strong', className: 'name', text: `Edit ${meetup.name}` },
+      ...(meetup.place ? [{ tag: 'div', className: 'hint', text: meetup.place.words }] : []),
+      labelled(
+        'Name',
+        textInput('name', NAME_LENGTH, 'Its name', filled.name ?? meetup.name),
+        set('name'),
+      ),
+      labelled('Information', infoArea(filled.info ?? meetup.info ?? ''), set('info')),
+      ...start,
+      nowLine('Ends now', meetup.endTime, zone, now),
+      labelled(
+        'Ends',
+        textInput('end', TIME_LENGTH, '8pm, in 90, or none', filled.end),
+        set('end'),
+      ),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [button('Done', { 'data-cancel': '' })],
+      },
+      answerLine,
+    ],
+  };
+}
+
+/**
+ * The body of a change of a meetup (`POST /s/<guild>/api/meetups/<id>/<change>`), with the
+ * value the editor drew it from (`drawn`), or what is missing.
+ */
+export function meetupChangeBody(
+  change: MeetupChange,
+  meetup: MapMeetup,
+  values: MeetupEditorFilled,
+): MeetupBody {
+  switch (change) {
+    case 'name': {
+      const name = (values.name ?? '').trim();
+      return name === ''
+        ? { text: 'Give the meetup a name first.' }
+        : { body: { drawn: meetup.name, name } };
+    }
+    case 'info':
+      // Empty removes it, as `/info` sent back empty does.
+      return { body: { drawn: meetup.info, info: values.info ?? '' } };
+    case 'start':
+    case 'end': {
+      const time = (values[change] ?? '').trim();
+      if (time === '')
+        return { text: `Say when it ${change === 'start' ? 'starts' : 'ends'} first.` };
+      return {
+        body: { drawn: change === 'start' ? meetup.startTime : meetup.endTime, time },
+      };
+    }
+  }
+}
+
+/**
+ * What the page takes of a meetup's answer: whether it was done, what came of a making, the
+ * status it came with (none when the connection broke), and the meetup as it is now.
+ */
+export interface MeetupAnswered {
+  ok: boolean;
+  outcome?: 'posted' | 'held';
+  status?: number;
+  meetup?: MapMeetup;
+}
+
+/**
+ * Reads an answer of the meetups' addresses. The meetup is the server's own view (`MapMeetup`);
+ * one that does not look like it (an id and a name) gives none.
+ */
+export function meetupAnswerOf(body: unknown): MeetupAnswered {
+  if (typeof body !== 'object' || body === null) return { ok: false };
+  const { ok, outcome, meetup } = body as { ok?: unknown; outcome?: unknown; meetup?: unknown };
+  const answered: MeetupAnswered = { ok: ok === true };
+  if (outcome === 'posted' || outcome === 'held') answered.outcome = outcome;
+  if (typeof meetup === 'object' && meetup !== null) {
+    const { id, name } = meetup as { id?: unknown; name?: unknown };
+    if (typeof id === 'string' && typeof name === 'string') answered.meetup = meetup as MapMeetup;
+  }
+  return answered;
+}
+
+/**
+ * Whether an answer closes the editor: the meetup is gone (409 without a meetup: it has ended,
+ * or is no meetup of this server), or the meetup it gives is no longer the member's to change
+ * (`panel` null: no longer staff, say). Any other answer leaves it open, drawn from the meetup the
+ * answer gives.
+ */
+export function editorEnds(answer: MeetupAnswered): boolean {
+  if (answer.meetup !== undefined) return answer.meetup.panel === null;
+  return !answer.ok && answer.status === 409;
+}
+
+/**
+ * Sends a meetup's form or change with the page's CSRF token as a press is sent (`pressParty`: a
+ * 403 of a stale token is tried once more with a new one): the words to say, the token now, the
+ * status of the last answer, and what it says of the meetup.
+ */
+export async function sendMeetupForm(
+  csrf: string,
+  steps: PressSteps,
+): Promise<Pressed & MeetupAnswered> {
+  let last: { status: number; body: unknown } | undefined;
+  const pressed = await pressParty(csrf, {
+    post: async (token) => {
+      const answer = await steps.post(token);
+      last = answer;
+      return answer;
+    },
+    me: () => steps.me(),
+  });
+  return {
+    ...pressed,
+    ...meetupAnswerOf(last?.body),
+    ...(last === undefined ? {} : { status: last.status }),
+  };
+}
+
+/**
+ * "Pick a place" mode (plan 8M-5M): started by the form's "Pick on the map", ended by a pick or
+ * "Stop picking". While it is on, a gym clicked (its dot, the marker of its raids), a PokéStop
+ * clicked or a point of the map clicked becomes the form's place, and the map opens no popup.
+ */
+export class PlacePicking {
+  private on = false;
+
+  constructor(private readonly picked: (place: PickedPlace) => void) {}
+
+  get picking(): boolean {
+    return this.on;
+  }
+
+  start(): void {
+    this.on = true;
+  }
+
+  end(): void {
+    this.on = false;
+  }
+
+  /** A gym clicked: picked while picking (true: no popup), else nothing (false). */
+  gym(gym: MapGym): boolean {
+    return this.take(() => gymPick(gym));
+  }
+
+  /** A PokéStop clicked. */
+  stopClicked(stop: MapStop, regions: GeoView['regions']): boolean {
+    return this.take(() => stopPick(stop, regions));
+  }
+
+  /** A point of the map clicked. */
+  point(point: LatLon, regions: GeoView['regions']): boolean {
+    return this.take(() => pinPick(point, regions));
+  }
+
+  private take(place: () => PickedPlace): boolean {
+    if (!this.on) return false;
+    this.on = false;
+    this.picked(place());
+    return true;
+  }
+}
+
+/** What `StopLoads` works with. */
+export interface StopLoadsDeps {
+  /** Asks for the PokéStops of the map's view as it is now. */
+  load(): Promise<StopsView>;
+  /** Shows them, to be picked. */
+  show(view: StopsView): void;
+  /** Whether the view holds more stops than are shown: called only when that changes. */
+  more(more: boolean): void;
+  /** The stops could not be loaded. */
+  failed(): void;
+  /** How long the map rests before its stops are asked for again (about 300 ms). */
+  delayMs: number;
+  /** Starts a timer; gives what cancels it. */
+  setTimer(run: () => void, ms: number): () => void;
+}
+
+/**
+ * The PokéStops of "pick a place" mode (plan 8M-5M): asked for at once as the mode starts
+ * (`now`), and once the map has rested `delayMs` after it moved (`moved`, however often it
+ * moved); the questions are numbered and only the answer to the last one is shown, none once the
+ * mode ended (`stop`); "zoom in" is said only when whether there are more changes.
+ */
+export class StopLoads {
+  private asked = 0;
+  private cancel: (() => void) | undefined;
+  private saidMore = false;
+  private readonly running = new Set<Promise<void>>();
+
+  constructor(private readonly deps: StopLoadsDeps) {}
+
+  /** Asks at once. */
+  now(): void {
+    this.cancel?.();
+    this.cancel = undefined;
+    this.asked += 1;
+    const mine = this.asked;
+    const run = this.deps
+      .load()
+      .then((view) => {
+        if (mine !== this.asked) return;
+        this.deps.show(view);
+        if (view.more !== this.saidMore) {
+          this.saidMore = view.more;
+          this.deps.more(view.more);
+        }
+      })
+      .catch(() => {
+        if (mine === this.asked) this.deps.failed();
+      })
+      .finally(() => {
+        this.running.delete(run);
+      });
+    this.running.add(run);
+  }
+
+  /** The map moved: asks once it has rested. */
+  moved(): void {
+    this.cancel?.();
+    this.cancel = this.deps.setTimer(() => {
+      this.cancel = undefined;
+      this.now();
+    }, this.deps.delayMs);
+  }
+
+  /** The mode ended: nothing waits, and no answer on its way is shown. */
+  stop(): void {
+    this.cancel?.();
+    this.cancel = undefined;
+    this.asked += 1;
+    this.saidMore = false;
+  }
+
+  /** Resolves once no question is on its way (for tests). */
+  async idle(): Promise<void> {
+    while (this.running.size > 0) await Promise.all([...this.running]);
+  }
+}
diff --git a/src/web/client/meetup-ui.ts b/src/web/client/meetup-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..12e5c975a13712a96c0a1f337d5861d2984abbf1
--- /dev/null
+++ b/src/web/client/meetup-ui.ts
@@ -0,0 +1,397 @@
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import { MEETUP_CHANGES, type MeetupChange, type StopsView } from '../../domain/web/meetup-data.js';
+import type { MapMeetup } from '../../domain/web/party-data.js';
+import { getJson, say } from './common.js';
+import {
+  editorEnds,
+  gymPick,
+  meetupChangeBody,
+  meetupEditor,
+  newMeetupBody,
+  newMeetupForm,
+  PlacePicking,
+  sendMeetupForm,
+  StopLoads,
+  type MapStop,
+  type MeetupAnswered,
+  type MeetupBody,
+  type MeetupEditorFilled,
+  type NewMeetupValues,
+  type PickedPlace,
+} from './meetup-forms.js';
+import type { Me } from './notice.js';
+import { renderNode, type MapGym } from './popup.js';
+import type { FormClaim, FormHold } from './raid-forms.js';
+import { fieldsOf, sayUnder } from './raid-ui.js';
+import { newTrainButton } from './train-forms.js';
+
+/**
+ * The meetups of the live map in the page (plan 8M-5M, spec 3.7): "New meetup" in the side
+ * panel's box (and "Meetup here" in a gym's popup, the gym as its place) opens the form of a new
+ * meetup there; "Pick on the map" puts the map in "pick a place" mode, in which a gym clicked (its
+ * dot or the marker of its raids), a PokéStop clicked (the stops of the view are shown meanwhile,
+ * from `/api/stops`) or a point of the map clicked becomes its place, and no popup opens; "Edit…"
+ * in a meetup's popup or item opens its editor in the box, whose every Set sends one change. One
+ * form at a time (`FormHold`, shared with the raid, spawn and train forms): both are forms of the
+ * box (`aside`), under which the list is drawn. After a success the map refreshes (`done`).
+ */
+export interface MeetupUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  /** The server's regions with their outlines, as `/api/geo` gives them. */
+  regions: GeoView['regions'];
+  /** The gyms by id, as `/api/geo` gives them. */
+  gyms: ReadonlyMap<number, MapGym>;
+  /** The form that is open, shared with the other forms. */
+  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'release'>;
+  /** The side panel's box, where the forms are drawn. */
+  tools: HTMLElement;
+  /** The posts' zone (`PartiesView.zone`), in which the editor shows the times. */
+  zone(): string;
+  /**
+   * The PokéStops of "pick a place" mode on the map: shown (each clicked calls `picked`), and the
+   * map's view as a box to ask them for; `moved` is called after the map moved, until `clear`.
+   */
+  stops: {
+    box(): { south: number; west: number; north: number; east: number };
+    show(stops: readonly MapStop[], picked: (stop: MapStop) => void): void;
+    clear(): void;
+    moved(run: () => void): () => void;
+  };
+  /** Closes the popup that is open (the forms are in the side panel). */
+  closePopup(): void;
+  /** After something went through: the list again, and the meetup's popup opened when given. */
+  done(meetup: MapMeetup | undefined): Promise<void>;
+  /** The list as the page has it, drawn anew at once (as picking starts and ends). */
+  redrawn(): void;
+}
+
+/** What the page says of a form while another one is open. */
+const FORM_OPEN = 'Close the form that is open first.';
+
+/** What the page says when the PokéStops cannot be loaded or there are more than it shows. */
+const NO_STOPS = 'The PokéStops could not be loaded. Click a gym or a point of the map.';
+const MORE_STOPS = 'Zoom in to see every PokéStop here.';
+
+/** How long the map rests after it moved before its PokéStops are asked for again. */
+const STOPS_REST_MS = 300;
+
+function isMeetupChange(value: string | undefined): value is MeetupChange {
+  return (MEETUP_CHANGES as readonly (string | undefined)[]).includes(value);
+}
+
+export function meetupUi(deps: MeetupUiDeps) {
+  const { guild, hold } = deps;
+
+  /** Sends a body to an address of the meetups with the page's token. */
+  const send = async (
+    url: string,
+    body: Record<string, unknown>,
+  ): Promise<{ text: string } & MeetupAnswered> => {
+    const sent = await sendMeetupForm(deps.csrf.get(), {
+      post: async (token) => {
+        const reply = await fetch(url, {
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+          body: JSON.stringify(body),
+        });
+        return {
+          status: reply.status,
+          body: (await reply.json().catch(() => undefined)) as unknown,
+        };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    deps.csrf.set(sent.csrf);
+    return sent;
+  };
+
+  /** Sends a form's body with its buttons off meanwhile; what is missing is said under it. */
+  const sendForm = async (form: HTMLElement, url: string, body: MeetupBody) => {
+    if ('text' in body) {
+      sayUnder(form, body.text);
+      return undefined;
+    }
+    const buttons = form.querySelectorAll('button');
+    for (const each of buttons) each.disabled = true;
+    const sent = await send(url, body.body);
+    for (const each of buttons) each.disabled = false;
+    return sent;
+  };
+
+  /** The box shows "New train" and "New meetup" again. */
+  const toolsIdle = (): void => {
+    deps.tools.replaceChildren(renderNode(newTrainButton(), document));
+  };
+
+  const regionList = () => deps.regions.map((region) => ({ id: region.id, name: region.name }));
+
+  /**
+   * The form of a new meetup, while it is open: its claim, its place, and whether the member chose
+   * its region (then a place picked leaves it; else the region follows the place).
+   */
+  let making:
+    { claim: FormClaim; place: PickedPlace | undefined; regionChosen: boolean } | undefined;
+  /** Stops the PokéStops following the map while picking. */
+  let stopFollowing: (() => void) | undefined;
+
+  const picking = new PlacePicking((place) => {
+    if (!making) return;
+    making.place = place;
+    endPicking();
+    drawMaking();
+  });
+
+  /**
+   * The PokéStops of the map's view, to be picked: asked for as picking starts and once the map
+   * has rested after it moved, only the last answer shown (`StopLoads`).
+   */
+  const stopLoads = new StopLoads({
+    load: () => {
+      const query = new URLSearchParams(
+        Object.entries(deps.stops.box()).map(([key, value]) => [key, String(value)]),
+      ).toString();
+      return getJson<StopsView>(`/s/${guild}/api/stops?${query}`);
+    },
+    show: (view) => {
+      if (!picking.picking) return;
+      deps.stops.show(view.stops, (stop) => {
+        picking.stopClicked(stop, deps.regions);
+      });
+    },
+    more: (more) => {
+      if (more) say(MORE_STOPS);
+    },
+    failed: () => {
+      say(NO_STOPS);
+    },
+    delayMs: STOPS_REST_MS,
+    setTimer: (run, ms) => {
+      const timer = window.setTimeout(run, ms);
+      return () => {
+        window.clearTimeout(timer);
+      };
+    },
+  });
+
+  const startPicking = (): void => {
+    picking.start();
+    deps.closePopup();
+    // The meetups' and trains' markers let clicks through to the gyms meanwhile.
+    deps.redrawn();
+    stopFollowing = deps.stops.moved(() => {
+      stopLoads.moved();
+    });
+    stopLoads.now();
+  };
+
+  const endPicking = (): void => {
+    picking.end();
+    stopLoads.stop();
+    stopFollowing?.();
+    stopFollowing = undefined;
+    deps.stops.clear();
+    deps.redrawn();
+  };
+
+  /** Draws the form of a new meetup anew, keeping what was typed. */
+  const drawMaking = (): void => {
+    if (!making) return;
+    const before = deps.tools.firstElementChild;
+    const filled: Partial<NewMeetupValues> =
+      before instanceof HTMLElement && before.dataset.form === 'meetup' ? fieldsOf(before) : {};
+    const form = renderNode(
+      newMeetupForm(regionList(), making.place, filled, picking.picking, making.regionChosen),
+      document,
+    );
+    form.addEventListener('click', (event) => {
+      madeClicked(form, event);
+    });
+    // A region the member picks stays whatever place is picked; none picked, it follows the place.
+    form.addEventListener('change', (event) => {
+      const target = event.target;
+      if (making && target instanceof HTMLSelectElement && target.name === 'region') {
+        making.regionChosen = target.value !== '';
+      }
+    });
+    deps.tools.replaceChildren(form);
+  };
+
+  const closeMaking = (): void => {
+    const open = making;
+    if (!open) return;
+    if (picking.picking) endPicking();
+    making = undefined;
+    toolsIdle();
+    hold.release(open.claim);
+  };
+
+  const madeClicked = (form: HTMLElement, event: Event): void => {
+    const target = event.target;
+    if (!(target instanceof HTMLButtonElement) || !making) return;
+    if (target.dataset.cancel !== undefined) {
+      closeMaking();
+      return;
+    }
+    if (target.dataset.pick === 'start') {
+      startPicking();
+      drawMaking();
+      return;
+    }
+    if (target.dataset.pick === 'stop') {
+      endPicking();
+      drawMaking();
+      return;
+    }
+    if (target.dataset.submit !== 'meetup') return;
+    const fields = fieldsOf(form);
+    const body = newMeetupBody(
+      {
+        name: fields.name ?? '',
+        region: fields.region ?? '',
+        start: fields.start ?? '',
+        info: fields.info ?? '',
+      },
+      making.place,
+    );
+    const open = making;
+    void sendForm(form, `/s/${guild}/api/meetups`, body).then(async (sent) => {
+      if (!sent) return;
+      if (!sent.ok || making !== open) {
+        sayUnder(form, sent.text);
+        return;
+      }
+      closeMaking();
+      say(sent.text);
+      await deps.done(sent.meetup);
+    });
+  };
+
+  /** The form of a new meetup in the side panel's box, with `place` when one is given. */
+  const openMaking = (place: PickedPlace | undefined): void => {
+    const claim = hold.take(false, true);
+    if (!claim) {
+      say(FORM_OPEN);
+      return;
+    }
+    deps.closePopup();
+    making = { claim, place, regionChosen: false };
+    drawMaking();
+  };
+
+  /** The editor of a meetup, while it is open. */
+  let editing: { claim: FormClaim; meetup: MapMeetup; filled: MeetupEditorFilled } | undefined;
+
+  const closeEditing = async (opened: MapMeetup | undefined): Promise<void> => {
+    const open = editing;
+    if (!open) return;
+    editing = undefined;
+    toolsIdle();
+    hold.release(open.claim);
+    await deps.done(opened);
+  };
+
+  /** Draws the editor anew from the meetup as the last answer gave it, keeping what was typed. */
+  const drawEditing = (): void => {
+    if (!editing) return;
+    const editor = renderNode(
+      meetupEditor(editing.meetup, deps.zone(), Date.now(), editing.filled),
+      document,
+    );
+    editor.addEventListener('click', (event) => {
+      editClicked(editor, event);
+    });
+    deps.tools.replaceChildren(editor);
+  };
+
+  const editClicked = (editor: HTMLElement, event: Event): void => {
+    const target = event.target;
+    if (!(target instanceof HTMLButtonElement) || !editing) return;
+    if (target.dataset.cancel !== undefined) {
+      void closeEditing(editing.meetup);
+      return;
+    }
+    const change = target.dataset.change;
+    if (!isMeetupChange(change)) return;
+    const open = editing;
+    open.filled = { ...open.filled, ...fieldsOf(editor) };
+    const body = meetupChangeBody(change, open.meetup, open.filled);
+    const url = `/s/${guild}/api/meetups/${encodeURIComponent(open.meetup.id)}/${change}`;
+    void sendForm(editor, url, body).then(async (sent) => {
+      if (!sent || editing !== open) {
+        if (sent) say(sent.text);
+        return;
+      }
+      // Gone, or no longer the member's to change (`panel` null): the editor closes.
+      if (editorEnds(sent)) {
+        say(sent.text);
+        await closeEditing(sent.meetup);
+        return;
+      }
+      if (sent.meetup) open.meetup = sent.meetup;
+      // A change made: its field shows the meetup's own value again.
+      if (sent.ok) {
+        const { [change]: _done, ...rest } = open.filled;
+        open.filled = rest;
+      }
+      drawEditing();
+      const drawn = deps.tools.firstElementChild;
+      if (drawn instanceof HTMLElement) sayUnder(drawn, sent.text);
+      else say(sent.text);
+      if (sent.ok) await deps.done(undefined);
+    });
+  };
+
+  const openEditing = (meetup: MapMeetup): void => {
+    const claim = hold.take(false, true);
+    if (!claim) {
+      say(FORM_OPEN);
+      return;
+    }
+    deps.closePopup();
+    editing = { claim, meetup, filled: {} };
+    drawEditing();
+  };
+
+  return {
+    /** A click on "New meetup": its form, without a place yet. */
+    newMeetupClicked(): void {
+      openMaking(undefined);
+    },
+
+    /** A click on "Meetup here" in a gym's popup: the form, the gym its place. */
+    meetupHereClicked(gym: MapGym): void {
+      openMaking(gymPick(gym));
+    },
+
+    /** A click on "Edit…" in a meetup's popup or item: its editor. */
+    editClicked(meetup: MapMeetup): void {
+      openEditing(meetup);
+    },
+
+    /** A gym clicked on the map: picked while picking (true: no popup), else nothing. */
+    gymClicked(gym: MapGym): boolean {
+      return picking.gym(gym);
+    },
+
+    /** A point of the map clicked: a pin while picking (true), else nothing. */
+    mapClicked(point: LatLon): boolean {
+      return picking.point(point, deps.regions);
+    },
+
+    /** Whether the map is in "pick a place" mode: the parties' markers let clicks through. */
+    picking(): boolean {
+      return picking.picking;
+    },
+
+    /** Whether the box holds a meetup's form: the list keeps it. */
+    inTools(): boolean {
+      return making !== undefined || editing !== undefined;
+    },
+  };
+}
+
+export type MeetupUi = ReturnType<typeof meetupUi>;
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index e812ef42a0b25b1359f85eda01a0498c5b867a93..e20be0a060edc83320fcddd21907e6101b30036a 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -6,6 +6,7 @@ import {
   gymPicture,
   gymRaidsPopup,
   meetupItem,
+  meetupPopup,
   Poller,
   PRESS_FAILED,
   pressLabel,
@@ -352,6 +353,9 @@ describe('trainPopup and meetupItem', () => {
       endTime: null,
       link: LINK,
       attendance: attendance({ mine: { status: 'interested', group: 'A' } }),
+      place: null,
+      info: null,
+      panel: null,
     };
     expect(texts(meetupItem(meetup, context))).toEqual([
       'Community Day picnic',
@@ -363,6 +367,34 @@ describe('trainPopup and meetupItem', () => {
       'Here',
       'Open the post',
     ]);
+    // At a place, with its information as text, and what the member may do of it after the
+    // buttons; Directions to its point.
+    const placed: MapMeetup = {
+      ...meetup,
+      place: { kind: 'gym', words: 'At The Stacks', lat: 40.05, lon: -80.05, gymId: 1 },
+      info: 'Bring <b>snacks</b>.\nAnd cups.',
+    };
+    const extras = [{ tag: 'button', text: 'Edit…' }];
+    expect(texts(meetupPopup(placed, context, extras))).toEqual([
+      'Community Day picnic',
+      'At The Stacks',
+      'Directions',
+      'Starts Wed, Oct 14, 2:00 PM',
+      'Bring <b>snacks</b>.\nAnd cups.',
+      'Interested 1 · Coming 3 · Here 2',
+      'You: Interested',
+      'Interested',
+      'Join',
+      'Here',
+      'Edit…',
+      'Open the post',
+    ]);
+    const pin: MapMeetup = {
+      ...placed,
+      place: { kind: 'pin', words: 'At a dropped pin', lat: 40.08, lon: -80.08, gymId: null },
+    };
+    expect(texts(meetupPopup(pin, context))[1]).toBe('At a dropped pin');
+    expect(meetupItem(placed, context).tag).toBe('li');
   });
 });
 
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 5631f142ea0e3c50d15032f2c4fc4843111077ff..a8624696228d1c9fba12e614de17bc450c8b1551 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -49,7 +49,10 @@ const PRESS_LABELS: Readonly<Record<MapPress['action'], string>> = {
   leave: 'Leave',
 };
 
-/** The label of a button, as the post has it: `Join B` for a group's. */
+/**
+ * The label of a button on the map, in words: `Join B` for a group's (the post's own shows the
+ * group's letter, "B", with an icon, plan 8D-G).
+ */
 export function pressLabel(press: MapPress): string {
   const label = PRESS_LABELS[press.action];
   return press.group === undefined ? label : `${label} ${press.group}`;
@@ -291,23 +294,51 @@ export function trainPopup(
   };
 }
 
-/** A meetup in the side panel: its name, start and end, who comes, the buttons, the post. */
-export function meetupItem(meetup: MapMeetup, context: ShowContext): PageNode {
+/** Where a meetup is and how to get there: its place and "Directions" to its point. */
+function meetupWhere(meetup: MapMeetup): PageNode[] {
+  const { place } = meetup;
+  if (!place) return [];
+  return [div('place', place.words), directionsLink({ lat: place.lat, lon: place.lon })];
+}
+
+/**
+ * A meetup's popup at its place on the map (plan 8M-5M), and its item in the side panel: its
+ * name, where it is with Directions, its start and end, its information as written (set as text),
+ * who comes, the buttons, then `extras` (`meetupActions`: "Edit…" for its maker and staff), the
+ * post.
+ */
+export function meetupPopup(
+  meetup: MapMeetup,
+  context: ShowContext,
+  extras: readonly PageNode[] = [],
+): PageNode {
   const when = (words: string, at: number | null) =>
     at === null ? [] : [div('time', `${words} ${clockTime(at, context.zone, context.now)}`)];
   return {
-    tag: 'li',
+    tag: 'div',
     className: 'party-popup meetup',
     children: [
       { tag: 'strong', className: 'name', text: meetup.name },
+      ...meetupWhere(meetup),
       ...when('Starts', meetup.startTime),
       ...when('Ends', meetup.endTime),
+      ...(meetup.info === null || meetup.info.trim() === '' ? [] : [div('info', meetup.info)]),
       ...attendanceNodes(meetup.id, meetup.attendance),
+      ...extras,
       ...postLink(meetup.link),
     ],
   };
 }
 
+/** A meetup in the side panel: as its popup (`meetupPopup`), as an item of the list. */
+export function meetupItem(
+  meetup: MapMeetup,
+  context: ShowContext,
+  extras: readonly PageNode[] = [],
+): PageNode {
+  return { ...meetupPopup(meetup, context, extras), tag: 'li' };
+}
+
 /** What the page says when a press did not get through. */
 export const PRESS_FAILED = 'That did not get through; try again.';
 
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index eeeed8a12cd8d45605ab2af2b118a7146535b7f5..7259ea601c45144f0dbb251da3007b25bce50267 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -2,12 +2,15 @@ import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import type { MapTrain, PartiesView } from '../../domain/web/party-data.js';
 import { byId, getJson, say } from './common.js';
+import { meetupActions, meetupHereBox } from './meetup-forms.js';
+import { meetupUi } from './meetup-ui.js';
 import type { Me } from './notice.js';
 import {
   countdown,
   gymPicture,
   gymRaidsPopup,
   meetupItem,
+  meetupPopup,
   Poller,
   pressParty,
   raidPopup,
@@ -34,7 +37,8 @@ import { trainUi } from './train-ui.js';
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
  * with raids (the picture of its first raid that has one, from the server only), whose popup
  * lists every raid there; trains as lines over their routes with the current stop marked;
- * meetups (and raids at gyms the map does not show) in the side panel; every popup and item a
+ * meetups at their place (plan 8M-5M) and in the side panel, raids at gyms the map does not show
+ * there too; every popup and item a
  * tree of nodes set as text (`renderNode`), with the buttons that apply. The list is asked for
  * every 20 seconds while the page is visible and at once after a press (`Poller`); the browser
  * revalidates it by its ETag (a 304 keeps what it has). A popup open when the list changes is
@@ -47,6 +51,11 @@ const COUNTDOWN_MS = 15_000;
 const RAID_COLOUR = '#c0392b';
 const TRAIN_COLOUR = '#d35400';
 const ICON_SIZE = 36;
+const MEETUP_COLOUR = '#8e44ad';
+const STOP_COLOUR = '#2980b9';
+/** The pane of the meetups' rings: above Leaflet's markers (600), below its tooltips (650). */
+const MEETUP_PANE = 'meetups';
+const MEETUP_PANE_Z = 625;
 
 /** Makes the elements of a node; a click on a button in them presses it. */
 type Draw = (node: PageNode) => HTMLElement;
@@ -114,6 +123,8 @@ export function showParties(
   mayReport: boolean,
 ): MapRaids {
   const layer = L.layerGroup().addTo(map);
+  // Leaflet sets the pane's place by its style from the script (no style element).
+  map.createPane(MEETUP_PANE).style.zIndex = String(MEETUP_PANE_Z);
   const panel = byId('parties');
   /** The trains' box at the top of the side panel: "New train", or the form or editor open. */
   const tools = document.createElement('div');
@@ -149,6 +160,13 @@ export function showParties(
   });
   const popups = new Map<string, L.Layer>();
 
+  /**
+   * A gym clicked on the map: while a meetup's place is picked it is the place, in route mode the
+   * next stop; true when its popup is not wanted.
+   */
+  const gymClicked = (gym: MapGym): boolean =>
+    meetupForms.gymClicked(gym) || trainForms.gymClicked(gym);
+
   const context = (): ShowContext => ({
     now: Date.now(),
     zone: view?.zone ?? 'UTC',
@@ -194,6 +212,12 @@ export function showParties(
       } else if (target.dataset.spawn !== undefined) {
         const gym = gyms.get(Number(target.dataset.spawn));
         if (gym) spawnForms.spawnClicked(target, gym);
+      } else if (target.dataset.meetupHere !== undefined) {
+        const gym = gyms.get(Number(target.dataset.meetupHere));
+        if (gym) meetupForms.meetupHereClicked(gym);
+      } else if (target.dataset.editMeetup !== undefined) {
+        const meetup = view?.meetups.find((each) => each.id === target.dataset.editMeetup);
+        if (meetup) meetupForms.editClicked(meetup);
       } else if (
         target.dataset.routeTrain !== undefined ||
         target.dataset.moveTrain !== undefined ||
@@ -247,19 +271,44 @@ export function showParties(
               }),
               keyboard: true,
             });
-      const extras = reportOffered(mayReport, next) ? [reportBox(gymId), spawnBox(gymId)] : [];
+      const extras = reportOffered(mayReport, next)
+        ? [reportBox(gymId), spawnBox(gymId), meetupHereBox(gymId)]
+        : [];
       withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context(), extras)).addTo(
         layer,
       );
-      // In route mode a gym with raids is a stop to add like any other, its popup not opened.
-      gymClicks(marker, () => trainForms.gymClicked(gym));
+      // In route mode a gym with raids is a stop to add like any other, its popup not opened;
+      // while a meetup's place is picked, it is the place.
+      gymClicks(marker, () => gymClicked(gym));
     }
     // Trains the map cannot draw (no route yet, or none of its gyms on the map) are listed; the
     // train being routed is left to route mode, which draws its stops as they are edited.
     const unplaced: MapTrain[] = [];
-    // While a train is routed, the other trains' lines and markers let clicks through to the gyms.
+    // While a train is routed or a meetup's place picked, the trains' and meetups' lines and
+    // markers let clicks through to the gyms and the map.
     const drawn = drawnTrains(next.trains, trainForms.routing()?.id);
-    const interactive = drawn.clickable;
+    const interactive = drawn.clickable && !meetupForms.picking();
+    // Meetups at their place (plan 8M-5M): at the gym as the map has it now, else the snapshot's
+    // point; listed in the side panel too. A ring without a fill, which takes clicks on its line
+    // alone: a gym's dot inside it stays a dot to click. On a pane of its own above the markers
+    // (a raid's picture, route mode's numbers), so that the ring is not hidden under them.
+    for (const meetup of next.meetups) {
+      const { place } = meetup;
+      if (!place) continue;
+      const gym = place.gymId === null ? undefined : gyms.get(place.gymId);
+      withPopup(
+        L.circleMarker(gym ? [gym.lat, gym.lon] : [place.lat, place.lon], {
+          radius: 12,
+          color: MEETUP_COLOUR,
+          weight: 4,
+          fill: false,
+          interactive,
+          pane: MEETUP_PANE,
+        }),
+        `meetup:${meetup.id}`,
+        () => meetupPopup(meetup, context(), meetupActions(meetup)),
+      ).addTo(layer);
+    }
     for (const train of drawn.trains) {
       const places = train.route.flatMap((id) => {
         const gym = gyms.get(id);
@@ -290,7 +339,7 @@ export function showParties(
       }
     }
     const items = [
-      ...next.meetups.map((meetup) => meetupItem(meetup, context())),
+      ...next.meetups.map((meetup) => meetupItem(meetup, context(), meetupActions(meetup))),
       ...unplaced.map((train): PageNode => ({
         ...trainPopup(train, context(), trainActions(train)),
         tag: 'li',
@@ -299,7 +348,7 @@ export function showParties(
     ];
     // "New train" (or the form or route editor open in its place) for a member who may; a form
     // open there stays whatever the list says.
-    const offered = reportOffered(mayReport, next) || trainForms.inTools();
+    const offered = reportOffered(mayReport, next) || trainForms.inTools() || meetupForms.inTools();
     keepTools<ChildNode>(panel, offered ? tools : undefined);
     if (items.length > 0) {
       const heading = document.createElement('h2');
@@ -451,9 +500,96 @@ export function showParties(
   });
   tools.addEventListener('click', (event) => {
     const target = event.target;
-    if (target instanceof HTMLButtonElement && target.dataset.newTrain !== undefined) {
-      trainForms.newTrainClicked();
-    }
+    if (!(target instanceof HTMLButtonElement)) return;
+    if (target.dataset.newTrain !== undefined) trainForms.newTrainClicked();
+    else if (target.dataset.newMeetup !== undefined) meetupForms.newMeetupClicked();
+  });
+
+  // Meetups (plan 8M-5M): "New meetup" in the side panel's box and "Meetup here" in a gym's popup
+  // open the form there; "Pick on the map" shows the PokéStops of the view (from `/api/stops`,
+  // asked again after the map moves) and takes a gym, a stop or a point clicked as the place;
+  // "Edit…" opens a meetup's editor there. Held like the other forms; after a success the list at
+  // once, and the meetup's popup opened.
+  const stopLayer = L.layerGroup().addTo(map);
+  const meetupForms = meetupUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    regions,
+    gyms,
+    hold,
+    tools,
+    zone: () => view?.zone ?? 'UTC',
+    stops: {
+      box: () => {
+        const bounds = map.getBounds();
+        return {
+          south: bounds.getSouth(),
+          west: bounds.getWest(),
+          north: bounds.getNorth(),
+          east: bounds.getEast(),
+        };
+      },
+      show: (stops, picked) => {
+        stopLayer.clearLayers();
+        for (const stop of stops) {
+          const [, lat, lon, title] = stop;
+          const marker = L.circleMarker([lat, lon], {
+            radius: 6,
+            weight: 2,
+            color: STOP_COLOUR,
+            fillOpacity: 0.8,
+          });
+          // The title as text of an element of ours: Leaflet sets a string as HTML.
+          marker.bindTooltip(renderNode({ tag: 'span', text: title }, document));
+          marker.on('click', (event: L.LeafletMouseEvent) => {
+            L.DomEvent.stop(event);
+            picked(stop);
+          });
+          marker.addTo(stopLayer);
+        }
+      },
+      clear: () => {
+        stopLayer.clearLayers();
+      },
+      moved: (run) => {
+        map.on('moveend', run);
+        return () => {
+          map.off('moveend', run);
+        };
+      },
+    },
+    closePopup: () => {
+      map.closePopup();
+    },
+    done: async (meetup) => {
+      if (meetup?.place) {
+        map.closePopup();
+        showing.openNext(`meetup:${meetup.id}`);
+      }
+      await poller.now();
+      const open = showing.key;
+      if (open !== undefined) popups.get(open)?.openPopup();
+    },
+    redrawn: () => {
+      if (view) hold.shown(view);
+    },
+  });
+  /** "Meetup here" for a gym's own popup (`gymControls`), which opens the form with the gym. */
+  const meetupHereControl = (gym: MapGym): HTMLElement => {
+    const box = renderNode(meetupHereBox(gym.id), document);
+    box.addEventListener('click', (event) => {
+      if (event.target instanceof HTMLButtonElement) meetupForms.meetupHereClicked(gym);
+    });
+    return box;
+  };
+  // A point of the map clicked while a meetup's place is picked: a pin there.
+  map.on('click', (event: L.LeafletMouseEvent) => {
+    meetupForms.mapClicked({ lat: event.latlng.lat, lon: event.latlng.lng });
   });
 
   const poller = new Poller({
@@ -497,9 +633,9 @@ export function showParties(
   return {
     gymControls: (gym) =>
       reportOffered(mayReport, view)
-        ? [raidForms.reportControl(gym), spawnForms.spawnControl(gym)]
+        ? [raidForms.reportControl(gym), spawnForms.spawnControl(gym), meetupHereControl(gym)]
         : [],
     editing: () => hold.editing,
-    gymClicked: (gym) => trainForms.gymClicked(gym),
+    gymClicked: (gym) => gymClicked(gym),
   };
 }
diff --git a/src/web/client/popup.ts b/src/web/client/popup.ts
index 26d1756ad89ae19ca99e8e7ba7138cd19c3cf9ac..8a33d52a6ad7fd9fed599e700a2f4ca3c7b4a532 100644
--- a/src/web/client/popup.ts
+++ b/src/web/client/popup.ts
@@ -59,7 +59,7 @@ export function addressLine(gym: MapGym): PageNode[] {
  * "Directions": Google Maps, a route to the gym's place, in a new tab that does not learn where
  * it came from.
  */
-export function directionsLink(gym: MapGym): PageNode {
+export function directionsLink(gym: Pick<MapGym, 'lat' | 'lon'>): PageNode {
   const directions = `https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lon}`;
   return {
     tag: 'a',
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 489aad48a0f8e588e4a4ec58cf8ae664254fb141..88222e97681b9cd9ac2f48c149903f01948726eb 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -46,12 +46,14 @@ export interface RaidUiDeps {
 
 /**
  * The controls that open a form ("Report raid", "Change…", "Report spawn here", and of trains
- * "New train", "Edit route", "Move…") under `root`, on or off.
+ * "New train", "Edit route", "Move…", and of meetups "New meetup", "Meetup here", "Edit…") under
+ * `root`, on or off.
  */
 export function formControls(root: ParentNode, on: boolean): void {
   for (const button of root.querySelectorAll<HTMLButtonElement>(
     'button[data-report], button[data-change-raid], button[data-spawn], ' +
-      'button[data-new-train], button[data-route-train], button[data-move-train]',
+      'button[data-new-train], button[data-route-train], button[data-move-train], ' +
+      'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup]',
   )) {
     button.disabled = !on;
   }
@@ -66,9 +68,9 @@ const NO_OPTIONS = 'The pick lists could not be loaded. Try again in a moment.';
 /** The values of a form's fields by name. */
 export function fieldsOf(form: HTMLElement): Record<string, string> {
   const values: Record<string, string> = {};
-  for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
-    'input[name], select[name]',
-  )) {
+  for (const field of form.querySelectorAll<
+    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
+  >('input[name], select[name], textarea[name]')) {
     values[field.name] = field.value;
   }
   return values;
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index e96f68d802c28589a5c024c8c6d702a335fa0dcd..2c0f399faaf4edad883a70eaabad31b9b1df4994 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -114,6 +114,8 @@ describe('starting a train (startForm, startBody)', () => {
         .map((one) => one.attributes?.value),
     ).toEqual(['finish']);
     expect(newTrainButton().children?.[0]?.attributes).toMatchObject({ 'data-new-train': '' });
+    // "New meetup" beside it (plan 8M-5M).
+    expect(newTrainButton().children?.[1]?.attributes).toMatchObject({ 'data-new-meetup': '' });
   });
 
   it('makes the body of a new train, or says what is missing', () => {
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index 54d9051e07f412fb19c54727ecfcc0b4dd99f866..9ff06df07a7dca763e1c9ffa28282f3e495e21a9 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -6,6 +6,7 @@ import {
   type RouteEdit,
   type SavedRouteView,
 } from '../../domain/web/train-data.js';
+import { newMeetupButton } from './meetup-forms.js';
 import { pressParty, type PressSteps, type Pressed } from './parties.js';
 import type { MapGym, PageNode } from './popup.js';
 
@@ -72,12 +73,15 @@ export function stopName(gym: MapGym | undefined, gymId: number): string {
   return gym.nickname !== null && gym.nickname !== '' ? gym.nickname : gym.name;
 }
 
-/** "New train" in the side panel, for a member while the map is not read-only. */
+/**
+ * "New train" in the side panel, for a member while the map is not read-only, and "New meetup"
+ * beside it (plan 8M-5M): the box the start form, route mode and the meetups' forms take.
+ */
 export function newTrainButton(): PageNode {
   return {
     tag: 'div',
     className: 'train-box',
-    children: [button('New train', { 'data-new-train': '' }, 'press new-train')],
+    children: [button('New train', { 'data-new-train': '' }, 'press new-train'), newMeetupButton()],
   };
 }
````

### Task 5: Meetups from the map: docs and staging checklist

Prototype commit: `d14c9840f61b8bae556f38788af0cc16f262aa87`

`web.md` ("Meetups on the map"), `meetup-safety.md`, `parties-and-posts.md`, `testing.md`; the staging checklist `docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md`.

**Files:**

```
 docs/architecture/meetup-safety.md                      |  4 ++--
 docs/architecture/parties-and-posts.md                  |  2 +-
 docs/architecture/testing.md                            |  1 +
 docs/architecture/web.md                                | 22 +++++++++++++++++-----
 docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md | 37 +++++++++++++++++++++++++++++++++++++
 5 files changed, 58 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/meetup-safety.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md`.
- [ ] **Step 4: Check the transcription:** `git diff d14c9840f61b8bae556f38788af0cc16f262aa87 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Meetups from the map: docs and staging checklist`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/meetup-safety.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md`.

````diff
diff --git a/docs/architecture/meetup-safety.md b/docs/architecture/meetup-safety.md
index 0d72f1e20b8af66d6c7517d02c13d31e8697a260..d5724512b6de23fa9304486a727c968e7f044456 100644
--- a/docs/architecture/meetup-safety.md
+++ b/docs/architecture/meetup-safety.md
@@ -13,13 +13,13 @@ A meetup at a place that might be private is held for a moderator before anythin
 ## `/meetup`
 
 - `/meetup name near start` (all required since 8S-1) is refused by its guards for everything that can be known before the form, so that a refusal does not count: no region or forum, a bad name, a member blocked in the server (`MeetupSafety.blocked`, asked before the place and the start are read, so that a blocked member hears of the block and not of a place or start they mistyped: `NO_MEETUPS_FOR_YOU`, with an Appeal button: `blockedRefusal`, a `UserError` with `answer`, which the router shows privately; the same before the form, on its submit and after a meetup made meanwhile), a place `namedPlace` cannot take, a start `typedTimedTime` cannot read for a meetup still to be made (`newPartyTimes('meetup', now)`), and the verdict (asked with `blocked: false`, the block not read twice): `refused` (`NO_MEETUP_HERE`, "A meetup can't be held there."), `review` with a start less than two hours ahead (`MEETUP_TOO_SOON`). Its throttle (`MEETUP_THROTTLE`, two a quarter of an hour) counts the command, so a form left unsent counts too, and requests count like meetups.
-- The guard keeps what it read for `execute` (a `WeakMap` by the interaction), so nothing is searched or checked twice before the form must open. The command then opens the form of the information (`meetupForm`, `infoInput` shared with `/info`: required here, at least one character; information of nothing but white space is refused, `NO_INFORMATION`), keeping what it was used with in a `PendingRequests` under the form's token for half an hour (`meetup:<token>:form`; a form open across a restart expires). On the submit (`meetupFormControls`) the reply is deferred privately and `MeetupSafety.make` does the rest, the one entry point for making a meetup with the safety (8M-5M's meetups from the web map call it too: the caller says whether the maker is `staff` and counts the use against its own throttle; a caller without Discord's answers has no Appeal button for a blocked maker and points them to `/meetup`). It refuses a name or information a meetup cannot have (`bad-name`, `bad-description`, white space alone too), asks the verdict again (a ruling or block may have come meanwhile: `refused`, `blocked`), then: allowed, `PartyService.createMeetup` with the start and information (`MeetupRequest.startTime`, `.description`; the meetup is made with them, so one post and no line announcing a start), and `closeIfBlocked` after it (`posted`, with the party); review, `submit` (`held`, the member told `MEETUP_HELD`, never why; or `too-soon`, `not-sent`, `blocked`); `createMeetup`'s own refusals (`no-region`, `no-forum`, `no-post`) come out as they are. `MeetupSafety.closeIfBlocked({ serverId, makerId, partyId, staff })` looks for a block once more after a meetup is made (one that came after the check, whose sweep of the maker's meetups ran before this one was there; never for staff): it closes the meetup as Block member does (`closed`; `close-failed` when that fails, logged, the meetup still up; `false` when not blocked or the block cannot be read), and the member gets the blocked answer. Refusals of the form give the typed information back (`refusedWithText`).
+- The guard keeps what it read for `execute` (a `WeakMap` by the interaction), so nothing is searched or checked twice before the form must open. The command then opens the form of the information (`meetupForm`, `infoInput` shared with `/info`: required here, at least one character; information of nothing but white space is refused, `NO_INFORMATION`), keeping what it was used with in a `PendingRequests` under the form's token for half an hour (`meetup:<token>:form`; a form open across a restart expires). On the submit (`meetupFormControls`) the reply is deferred privately and `MeetupSafety.make` does the rest, the one entry point for making a meetup with the safety (8M-5M's meetups from the web map call it too: the caller says whether the maker is `staff` and counts the use against its own throttle; a caller without Discord's answers has no Appeal button for a blocked maker and points them to `/meetup`). What the form does with the outcome is `makeMeetupAs` (each outcome in `/meetup`'s words), which the map calls too (`web.md`, "Meetups on the map"), and `refusalOf` is the verdict's refusal for `/meetup`'s guard and the map alike. It refuses a name or information a meetup cannot have (`bad-name`, `bad-description`, white space alone too), asks the verdict again (a ruling or block may have come meanwhile: `refused`, `blocked`), then: allowed, `PartyService.createMeetup` with the start and information (`MeetupRequest.startTime`, `.description`; the meetup is made with them, so one post and no line announcing a start), and `closeIfBlocked` after it (`posted`, with the party); review, `submit` (`held`, the member told `MEETUP_HELD`, never why; or `too-soon`, `not-sent`, `blocked`); `createMeetup`'s own refusals (`no-region`, `no-forum`, `no-post`) come out as they are. `MeetupSafety.closeIfBlocked({ serverId, makerId, partyId, staff })` looks for a block once more after a meetup is made (one that came after the check, whose sweep of the maker's meetups ran before this one was there; never for staff): it closes the meetup as Block member does (`closed`; `close-failed` when that fails, logged, the meetup still up; `false` when not blocked or the block cannot be read), and the member gets the blocked answer. Refusals of the form give the typed information back (`refusedWithText`).
 - A meetup is never at a power spot (Matt, 2026-10-17: they are poorly curated, and many are on private property such as home businesses): `/meetup near:` offers, finds and names a pin by gyms and PokéStops alone (`MEETUP_PLACE_KINDS`, `PlaceKindsOnly` in `src/commands/place-option.ts`) and refuses a picked power spot with `NO_POWER_SPOT`; `MeetupSafety.make` answers `power-spot` for one, staff too, before anything else, so the web map is held to it as well. A meetup stored before at a power spot stays as it is, and `meetupPlaceVerdict` still takes the kind.
 
 ## Requests and the moderators' post
 
 - `MeetupSafety.submit` sends the moderators' post into the channel `findChannel(regionChannelId, moderation)` finds, then stores the request with it (a UUID, `MeetupRequestRecord`, `src/domain/meetups/records.ts`; a request is never kept without its post); whatever fails (no channel, Discord refuses, the record: the post is then taken back) leaves nothing behind (`not-sent`: the member is told to try later, the reason is logged). A name or information a meetup cannot have is `bad-name` / `bad-description`. Once the request is kept, the maker's block is read again: a block that came after the check, whose sweep of the maker's pending requests ran before this one was kept, withdraws it at once (`withdrawn`, its post says so, no DM; `blocked`, the member gets the blocked answer); a block that cannot be read leaves the request to the moderators (an approval reads it again). A request expires at `requestExpiry(createdAt, startTime)`: 48 hours, or an hour before the start when that is sooner; one that would leave the moderators less than an hour is not made (`too-soon`). In rehearsal mode meetup safety gets a gateway of its own (`rehearsalModeratorsGateway`, `src/app.ts`) that lets its posts (requests and appeals) into a text channel of the moderators' channel's name, so the staff who rehearse see them (Matt, 2026-10-17); the rest of the bot goes through the rehearsal gateway, which lets nothing into that channel: the exception belongs to meetup safety's sends, not to the channel.
-- The post (`requestMessage`, `src/render/meetup-safety.ts`): `### Meetup waiting for approval`, the name, the start, who asked (`memberText`) in which region channel, **Where** (`nearLine`: kind, title and address cut to 100 and 200 characters, Map; a pin as `pinLine`; the Wayspot's picture beside it), **Information** (`plainLines`, never cut), when it expires, and the buttons: Approve, Approve once, Refuse, Refuse from now on, Block member (a pin: Approve once, Refuse, Block member). Custom ids `msafety:<request id>:<decision>`.
+- The post (`requestMessage`, `src/render/meetup-safety.ts`): `### Meetup waiting for approval`, the name, the start, who asked (`memberText`), "on the map" for a request of the live map (`MeetupRequestRecord.source`, `map` or null; `RequestAsk.source`; migration 020, plan 8M-5M), in which region channel, **Where** (`nearLine`: kind, title and address cut to 100 and 200 characters, Map; a pin as `pinLine`; the Wayspot's picture beside it), **Information** (`plainLines`, never cut), when it expires, and the buttons: Approve, Approve once, Refuse, Refuse from now on, Block member (a pin: Approve once, Refuse, Block member). Custom ids `msafety:<request id>:<decision>`.
 - The buttons (`meetupSafetyControls`, `src/components/meetup-safety.ts`) are for staff (`requireManagement`; others are refused privately and uncounted) with a throttle of their own (`SAFETY_THROTTLE`). The handler defers privately and asks `MeetupSafety.decide`, which reads the request from the database (a post from before a restart works): one conditional update `pending` → decided (`decideRequest`; Block member `blockMaker`), so the first press wins and a later one is told who decided what. Approve and Approve once read the maker's block again (one that came meanwhile wins: the request becomes `withdrawn`, its post says so, no meetup, no DM), then make the meetup as its maker asked (`createMeetup`, the maker's name and team as they were when they asked; a failure marks the request `failed` and says why to the moderator and the maker), and `closeIfBlocked` after it (`closed`: the request is `withdrawn` as above; `close-failed`: the meetup is up, so the approval is settled with it and its post shows it, the place ruled as for any approval, the failure logged, and the maker, blocked, gets no DM of the approval); Approve allows the place for good only once the meetup is made (`settleApproval`, then `rule`), Refuse from now on refuses it. A meetup made whose record fails is written once more (`settleApproval` retried). Every step after the decision is caught and logged (also the first look for a block, which `closeIfBlocked` repeats), so the post is always edited to the outcome without buttons and the maker always told by DM through `DmSender` (`requestOutcomeDm`: approved with Go to post, not approved, expired; never why).
 - Expiry runs with every tick of the party clock, in the background and one at a time (`PartySchedulerOptions.requests`, `MeetupSafety.expire`), also while the safety is off (requests made before it was turned off end): pending requests past `expiresAt` become `expired`, their posts edited, their makers told (a due row that cannot be read becomes `failed`, logged once); approvals left without their recorded meetup for five minutes (`strandedApprovals`) are settled with the meetup when one is active (the maker's, in the server, with the request's name and start: the bot stopped or the database failed after it was made; no DM; closed and `withdrawn` when the maker was blocked since), else become `failed`, posts edited, makers told; open appeals that are stale are closed (below). A press on a request whose time is up expires it instead of deciding it ("This request has expired: nobody decided in time.").
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 65338ee99ec5d061f307906343875ac61601a3c9..d57c976fbbb9c75325a681662f60c9c453391b49 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -31,7 +31,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Meetups and timed parties
 
-- A timed party (a meetup or a train) has `party.timed` (`name`, `startTime`: one start for the whole party, not a group's meeting time) and changes through `ctx.timedParties` (`TimedPartyService`: `setName`, `setDescription`, `setStartTime`, `setEndTime`, `flush`) over the pure functions of `src/domain/party/timed.ts` (and `meetup.ts`). It is over at its end time; without one, a day after its start; without either, a day after it was made or its last time was removed (`latestTime(party, now)`, `settled`). The clock warns it `trainOrMeetupDeletionWarningTime` ahead, and an ended one is always shown as over. A new start is announced in the post gathered (one message a few seconds after the last change).
+- A timed party (a meetup or a train) has `party.timed` (`name`, `startTime`: one start for the whole party, not a group's meeting time) and changes through `ctx.timedParties` (`TimedPartyService`: `setName`, `setDescription`, `setStartTime`, `setEndTime`, `flush`) over the pure functions of `src/domain/party/timed.ts` (and `meetup.ts`). Each of the four takes the value the change was drawn from (`drawn`, the live map's meetup editor, plan 8M-5M) and refuses it inside the store as `changed-meanwhile` when the party has another by now (`asDrawn`); the commands give none. What `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, answering `TimedAnswer`, which the commands reply with through `replyTimed`) and `describeAs` (`src/commands/meetups/info.ts`), the code paths the map shares. It is over at its end time; without one, a day after its start; without either, a day after it was made or its last time was removed (`latestTime(party, now)`, `settled`). The clock warns it `trainOrMeetupDeletionWarningTime` ahead, and an ended one is always shown as over. A new start is announced in the post gathered (one message a few seconds after the last change).
 - A meetup has one group and no completion: Done means leave (`finishParty`), `/group` and a group's meeting time are refused (`no-groups`, `party-wide-start`), its post has no Done and no Set time button, and its maker is always named.
 - A meetup's place (plan 8D, Matt, 2026-10-17) is `meetup.place` (`MeetupPlace`, `src/domain/geo/place.ts`: a `KnownPlace`, a gym or PokéStop as it was when it was named, a snapshot (a new meetup is never at a power spot: Matt, 2026-10-17, poorly curated and often on private property; `MEETUP_PLACE_KINDS`, and `PlaceKindsOnly` for `nearChoices` and `namedPlace`, whose pin is then named by no power spot either; one stored before stays as it is); or a `DroppedPin`, a point with the place `near` it within `PIN_NEAR_METRES` 50 and the `linkName` its maps link gave). It is set once, by `/meetup near:` when the meetup is made (`createMeetup`; `near` required since plan 8S-1, which also asks for the start and, in a form, the information, and holds a place that might be private for the moderators: `meetup-safety.md`; a meetup made before may have no place), and never changes afterwards (Matt, 2026-10-17): no command adds, changes or clears it, since a new public place would skip the moderators' check of plan 8S, and what more there is to say about where goes in the information (`/info`). `/location` is for raids alone. `near` is read by `namedPlace` (`src/commands/place-option.ts`, shared with `/wild near:`). The post shows the place as it is now while it is the same place (`shownPlace`: the gym by id from `MeetupPostView.gym`, the kept Wayspot from `MeetupPostView.wayspot`, of the same kind and within `PLACE_MOVE_METRES` 25 of the snapshot, so a rename, a new picture, address or a gym's notice show), else the snapshot; the stored place is never rewritten. A gym edit shows the meetups at it anew (`GymUpkeep.showAnew`), a load of the kept Wayspots those near a PokéStop or power spot (`PartyService` over `WayspotProvider.whenChanged`). Its Where, after the heading block and before "Meeting Information": a known place `Near **<title>** (<kind>) · <address> · [Map](…)` (the `NO_ADDRESS` rule of a raid's Where), a gym's notice under it, its picture beside; a pin `📍 Near **<title>** (<kind>)` (the nearest place within 50 m), else `📍 **<linkName>**`, else `📍 Dropped pin`, with its Map and no picture (`pinLine`, `src/render/place.ts`); nothing without a place. The DM brief has the first line of the Where without links or Map, and the place's point as its `map`; the DM of a start time names the place as the post shows it now (`PartyService.placeOf`, `meetupPlaceNow`).
 - A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`) over `resolvePartyTime` (for a meetup still to be made, `/meetup start:`, against `newPartyTimes('meetup', now)`): never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 6fd9fccde9f44a20bfdb875ff68d587284d596b5..5dd4d55125dd05effe97378ec30fac77e95bbd9b 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -55,6 +55,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`).
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
+- Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a power spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`); `meetup-ui.ts` and the map's side are tried at staging.
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode, the Move panel) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events, the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 412e8b5f39ee2227874aa882fc20c5334f2d24ef..5d445d15a5bbd3cafb890b613d8bd7d85408f535 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,12 +1,12 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters) or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
@@ -29,7 +29,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute; over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Move train panel in the window of the post's controls (as the post's panel counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute; over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Move train panel in the window of the post's controls (as the post's panel counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
 
 ## The public map
 
@@ -72,6 +72,18 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5; spec `docs/superpowe
 - **Words:** `pageWords` also writes the bot's masked links as their text (`whereText` links every stop), read in the same one pass from the left as escapes and markdown, so that a bracket a member escaped begins no link.
 - **The page** (`src/web/client/train-forms.ts`, pure: the start form and its body, a train's actions, the route editor and the bodies of its edits, the Move train panel and the body of a press, reading an answer, `sendTrainForm` over `pressParty`; the DOM side `train-ui.ts`): for a member while the map is not read-only, "New train" in a box at the top of the side panel (`#parties`, now shown for such a member also without parties) opens the start form there (name, region from `/api/geo`, start, mode); a train's popup (and its item in the side panel, where trains the map cannot draw are listed: no route yet, or none of its gyms on the map) gains `trainActions`: "Edit route" (`may.arrange`), "Move…" (`panel`), "Be the conductor", "Stop being the conductor" or "Take the conductor off", and "You are its conductor." / "It has a conductor.". **Route mode** ("Edit route", and at once after a new train is made by who may arrange it): the route editor in the side panel box (the stops numbered as stored, the train's marked; for who may arrange it (`may.arrange`) up, down, a "move to" list of every position (one `/route move`, so that a stop goes far in one edit) and remove per stop, rather than dragging; "Clear the route" for who may; the saved routes to load or forget; a name to save the route under; Done), the stops numbered on the map over a dashed line (`routeMarkers`; a `divIcon` whose `html` is an element of ours with the number as text, never a string), and a gym clicked (or Enter on a focused one), its dot or the marker of its raids, added as the next stop without its popup opening: Leaflet opens a bound popup before any handler of ours, so the gyms' layers have Leaflet's click and keypress handlers taken off and open their popup from ours, which in route mode adds the stop instead (`gymClicks`, `gymClicked`); a gym on the route already is said under the editor ("The Stacks is on the route already.", `routeEditBody`) and nothing is sent, and a double click whose clicks route mode took does not zoom the map. The edits run one at a time (`RouteEdits`): a gym clicked while an edit is on its way waits for its turn, its body made from the train the answer before gave (so quick clicks do not refuse each other as `route-edited` and burn the throttle), and the editor's controls but Done are off meanwhile; each answer redraws the editor and the numbers from the train it gives, also after a 409; an answer that the train is gone (409 without a train, `routeModeEnds`) ends route mode, any other without a train (429, 503, a broken connection) is said and changes nothing. **The panel** ("Move…") opens in the train's popup in place of its actions: where the train is, the moves with their targets, "Reverse the route", the mode with Set, Done; it stays open after a move, as the post's does, drawn anew from the answer's train with the words under it, also after a press that no longer fits; the list is asked for again after each move and drawn once the panel or its popup closes; Done draws the map with the train's popup open again, and so does a move after which the member may move it no more (no panel, also the 403 of who may, which carries the train); an answer that the train is gone (409 without a train, `routeModeEnds`) closes the panel, says it and draws the map with nothing opened. The conductor's buttons press at once with `conductorBody`. One form or mode at a time (`FormHold`, shared with the raid and spawn forms: route mode and the start form take it as forms of the trains' box (`take(false, true)`, `aside`), the panel as one of a popup or a side panel item; `formControls` also turns "New train", "Edit route" and "Move…" off). The list waits under a form, but for one of the trains' box, which a redraw of the side panel keeps in place (`keepTools`: a box already first is not taken out, only what follows it, so a field of the start form or the route editor keeps the focus); the route editor, drawn anew from each answer, keeps the name typed to save under and the saved route picked (`RouteEditorFilled`; the name is emptied once the route is saved): under route mode and the start form the list is drawn (the controls that open another form turned off again after each draw), and the line of the train being routed is left to route mode's numbers (`drawnTrains`), the other trains' lines and markers drawn `interactive: false` meanwhile (`clickable`), so that a gym under them stays a stop to click; as route mode starts and ends, the list the page has is drawn anew at once (`TrainUiDeps.redrawn`; the poller draws only a list that changed), so that the train's own line leaves the map with "Edit route" and comes back with Done.
 
+## Meetups on the map (plan 8M-5M)
+
+- **One code path per command** (spec 3.5, 3.7): what `/meetup`'s form does with `MeetupSafety.make`'s outcome is `makeMeetupAs` (`src/commands/meetups/meetup.ts`: the check of the place, the meetup or the moderators' request, each outcome in `/meetup`'s words, the post and a region's channel named by the caller's `ReportNames`); what `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, `TimedAnswer`: `ok`, `refused` with the reason, `gone`) and `describeAs` (`src/commands/meetups/info.ts`). The commands reply with them (`replyTimed`) or throw them; the map answers them. The web server is given what those commands read and call (`MeetupWebDeps.ctx`, `MeetupWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
+- **The view:** `MapMeetup` (`party-data.ts`) carries, besides 8M-3's name, times, link and attendance, its `place` (`meetupPlaceOf`, `party-view.ts`: the snapshot it was named as, its kind and point, the gym's id for a gym, and where it is in `words`: a gym or stop `At <title>`, a pin named by a gym or stop near it `Near <title>`, by its link's name `At <name> (a pin)`, else `At a dropped pin`; null for a meetup from before 8D), its `info` (the information as written; the page sets it as text) and `panel` (`meetupPanelOf`: the editor for who may change it on the map, `mayEditMeetup`, its maker or staff by `isMapStaff`; `start` only for a member signed up, as `/meet` has it; null for anybody else and while read-only). Nobody is named.
+- **Making one** `POST /s/<guild>/api/meetups`, body `{ region, name, place, start, info }` (strict: any region of the server by id; the name up to `/meetup`'s 80 characters, blanks allowed so that they are refused in its words; `place` a gym or a PokéStop as `{ kind, id }` (a gym's number as text, a stop's Wayfarer id) or a pin dropped on the map as `{ lat, lon }`, kept to six decimals; `start` as `/meetup start:` takes it, up to 100; `info` as its form takes it, up to `MAX_MEETUP_DESCRIPTION`). Before the body is read (`onRequest`): 30 a minute per address (`MEETUP_WRITES_PER_ADDRESS_MINUTE`, shared with the changes) and `postGuard`. Then, in this order: the session (403) and the body (400); who makes it (`actingOnTheMap`); the region (of this server, else 404); its forum (none: 422 in `/meetup`'s words, the region named `#name`; `barred` 403; Discord unreachable 503); what `/meetup`'s guards and form refuse, in their order and words, none counted: a bad name (422), a member blocked from making meetups in the server (`MeetupSafety.blocked` with `staff` of the member fetched fresh, asked before the place and the start, as `/meetup` asks it: 403 `MAP_BLOCKED`, "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal.", since the map has no Appeal button), the place (a kind that is no gym or PokéStop, a power spot among them: 422 `MAP_PLACE_KINDS_ONLY`, "A meetup can be at a gym, a PokéStop or a pin."; a gym or stop gone or of no region of the server: `PLACE_GONE`; a pin outside the regions: `PIN_NOT_HERE`), the start (`typedTimedTime` over `newPartyTimes('meetup', now)`, 422 in its words), the verdict asked with `blocked: false` (`refused`: `NO_MEETUP_HERE`; `review` with a start less than two hours ahead: `MEETUP_TOO_SOON`; `refusalOf`, shared with `/meetup`'s guard), information of nothing but white space (`NO_INFORMATION`); only then `/meetup`'s throttle in its window (`MEETUP_COMMAND`, `MEETUP_THROTTLE`: two a quarter of an hour from Discord and the map together); then `makeMeetupAs` as the member, the request marked as the map's (`RequestAsk.source: 'map'`, below). The place is named exactly as `/meetup near:` names it: a gym or stop through `pickedPlace` (`src/commands/place-option.ts`, the snapshot `namedPlace` makes of a pick: a gym by the name its post shows), a pin through `PlaceFinder.pin` with `MEETUP_PLACE_KINDS` (named by the nearest gym or stop within 50 m, never a power spot). The answer (`MeetupAnswer`, `src/domain/web/meetup-data.ts`): 200 `{ ok: true, outcome: 'posted', text: "Your meetup is made. Edit… in its popup changes its name, information and times.", meetup }` (the meetup as the map shows it to the member), 200 `{ ok: true, outcome: 'held', text: MEETUP_HELD }` (nothing posted: the moderators decide, the member is told by DM, never why; 200 rather than 202, since the page reads `outcome` either way), 403 for a block that came meanwhile, 422 `{ ok: false, text }` for every other refusal in `/meetup`'s words (`MeetupSafety.make`'s `power-spot` among them, which the map never sends). Logged at info: `{ user, guild, region, outcome }`, "a meetup was made on the map", never a text or the place.
+- **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 020 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
+- **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none 400): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power spots and other Wayspots are never offered; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
+- **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end, the map, which crosses forums, asks more, as for raids); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
+- **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeTime`, `src/domain/web/clock.ts`: "in 5 h", "1 h 30 min ago", "now"), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
+- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on a pane of its own, `meetups`, above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. Each Set sends its change alone (`meetupChangeBody`) with the value drawn; each answer draws the editor anew from the meetup it gives (what was typed in the other fields kept, the changed field back to the meetup's own value), its words under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
+- **Not in it:** a meetup's place cannot change after it is made (no route for it); a member cannot withdraw a pending request; Report on a meetup (8S-2); meetups on Campfire; the PokéStops are drawn only in "pick a place" mode, not from a zoom level up (a question per pan for every member, for little: left for staging to say whether it is wanted); an end given when the meetup is made (`/meetup` takes none, and a request kept for the moderators has no end: it is set with the editor once the meetup is posted).
+
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
@@ -87,5 +99,5 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5; spec `docs/superpowe
 ## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
-- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs`, `changeRaidTime`, `reportSpawnAs` and the functions of `train-changes.ts` are), with the command's own throttle per member (`throttledOnTheMap`), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write; a forum Discord cannot say anything of is `unreachableOnTheMap`, 503; a GET of a member's data asks `memberOrFailure`, all in `src/web/acting.ts`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
+- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs`, `changeRaidTime`, `reportSpawnAs`, the functions of `train-changes.ts`, `makeMeetupAs` and `renameAs` are), with the command's own throttle per member (`throttledOnTheMap`), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write; a forum Discord cannot say anything of is `unreachableOnTheMap`, 503; a GET of a member's data asks `memberOrFailure`, all in `src/web/acting.ts`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
 - Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown and masked links taken out, `unplain`); a press drawn from a state of a party that may have changed carries that state (a place, a target, the route) and the service refuses it inside the store, 409 with the party as it is now; a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`, `SpawnNames`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md b/docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..878166d38ccd215e6547864dac848b9ac70ea0b6
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md
@@ -0,0 +1,37 @@
+# Phase 8M-5M staging checklist: meetups from the live map
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role). It follows 8S-1's staging (`2026-10-17-phase-8s1-staging.md`): the `moderation` channel exists and the settings name it.
+
+## Before
+
+1. Migration 020 (`MeetupRequest.source`) on the dev database: `npm run migrate` (after 8S-1's 019). No command change in this plan (`/meetup`, `/name`, `/info`, `/meet`, `/cancel-meet`, `/end` keep their options, names, help and answers): no deploy. `npm run build` (it runs `npm run web:build`): a new `dist/web/assets/map-<hash>.js` and `map-<hash>.css`.
+2. Note a gym of West, a PokéStop of West whose title has no flagged word, and one whose title has one (or a little free library); Tester signed up for nothing.
+
+## Making a meetup
+
+3. Logged out, and as somebody who is no member (or without the map's member role): no "New meetup" in the side panel, no "Meetup here" in gyms' popups, no "Edit…".
+4. Tester logs in with `/maps`. The side panel's box shows "New train" and "New meetup". Click "New meetup": the form takes the box (Name, Region "Pick the region", Place "No place yet." with "Pick on the map", Starts, Information, "Make the meetup", Cancel); "New train", "Report raid", "Edit route", "Edit…" elsewhere are greyed out while it is open. "Make the meetup" with nothing: "Give the meetup a name first."; then each missing field in turn ("Pick the region first.", "Pick its place on the map first.", "Say when it starts first.", "Say what there is to know first: …").
+5. "Pick on the map": the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; blue dots appear for the PokéStops of the view (their titles on hover); no power spot among them (compare with the region editor's Wayspots). Pan and zoom: the dots follow; zoomed far out over a city, "Zoom in to see every PokéStop here." Click the gym of West: no popup opens; the form shows "<gym> (gym)" and the region West picked. "Pick again", click the PokéStop without a flagged word: "<title> (PokéStop)". "Pick again" on a gym of East: the region moves to East with it; choose West in the list by hand, then pick a gym of East again: West stays. Panning quickly while picking asks for the stops once the map rests (the dots do not flicker through older answers), and "Zoom in to see every PokéStop here." is said once, not at every pan. A train's line or a meetup's ring over a gym does not take the click while picking.
+6. Name "Staging meetup", Starts `6:30pm` (later today), Information of two lines, "Make the meetup": the notice says "Your meetup is made. Edit… in its popup changes its name, information and times."; the form closes, the map shows a purple ring at the stop with the meetup's popup open ("At <title>", Directions, "Starts 6:30 PM", the information on two lines, the counts, "You: Interested", the buttons, "Edit…", "Open the post"). On Discord: West's forum has the post, its Where the stop as `/meetup near:` would show it (title, address, picture), Tester named and interested, its start from the first.
+7. A meetup at a gym that shows a raid: the purple ring is drawn above the raid's picture, not hidden under it; a pin named by its link reads "At <name> (a pin)", an unnamed pin "At a dropped pin", one near a stop "Near <title>". "Meetup here" in another gym's popup (its own popup, and that of a gym that shows a raid): the form opens with that gym as its place. Region East picked by hand with a gym of West: the meetup goes into East's forum (any region of the server, as `/meetup` used in East's channel).
+8. A pin: "Pick on the map", click a point of the map away from gyms and stops: "A pin at 40.…, -79.…" and "A meetup at a pin needs a moderator's approval before it is posted."; Starts at least two hours ahead; make it: the notice says the meetup needs a moderator's approval (`MEETUP_HELD`); nothing is posted. In `moderation`: the request's post says "Asked by **Tester** (@Tester) on the map in #west"; Approve once: the meetup is posted, Tester is told by DM, the post still says "on the map". A pin near a PokéStop (within 50 m) is named "Near <title>" in the request; near a power spot alone, not by it.
+9. The flagged PokéStop: held as in step 8. A start within two hours at a pin: "A meetup there needs a moderator's approval, which takes time: pick a start at least two hours from now." (the form kept, nothing counted). A place refused for good (Refuse from now on on an earlier request): "A meetup can't be held there.".
+10. Googer (a moderator) makes one at a pin: posted at once (staff skip the check), nothing in `moderation`.
+11. Blocked: Googer presses Block member on a request of Tester's; Tester's next "Make the meetup": "You can't create meetups on this server. To appeal, use /meetup on Discord and press Appeal." (no Appeal button on the map); `/meetup` on Discord answers with Appeal. Lift the block afterwards (Appeal, Lift block).
+12. The limit: two meetups a quarter of an hour, from the map and `/meetup` together; the third: "You can use /meetup again in …". The refusals of steps 4 and 9 counted nothing.
+13. A place that is no gym, PokéStop or pin sent by hand (a power spot's Wayfarer id as `{ "kind": "powerspot", … }`) answers 422 "A meetup can be at a gym, a PokéStop or a pin."; covered by `meetup-make.test.ts`, try it only if convenient.
+
+## Changing a meetup
+
+14. Tester's meetup: "Edit…" in its popup (and in its item in the side panel) opens the editor in the box: Name and Information filled with what it has, "Starts now: 6:30 PM", Starts, "Ends now: none", Ends, each with Set, Done. Name "Staging picnic", Set: "This meetup is now called Staging picnic."; the post's title and its line ("Tester renamed this meetup: …") follow. Information changed, Set: "The post of this meetup shows what you wrote, under "Meeting Information"."; emptied: "The post of this meetup has no information any more.".
+15. Starts `7pm`, Set: "This meetup starts at 7:00 PM (in … h). I am telling the others." (no clock time twice); a few seconds later the post says the start with a ping for who is signed up and allows it, and they get the DM of a start time. Ends `9pm`, Set; Ends `none`, Set: "This meetup has no end time any more."; Ends `later`: "I could not read "later" as the time the meetup ends. …".
+16. Stale: with the editor open in Tester's browser, Googer renames the meetup on Discord with `/name`; then Tester's Set of the name: "This meetup changed meanwhile: here it is as it is now.", the editor drawn anew with Googer's name; nothing changed by Tester.
+17. Who: Googer (a moderator, not signed up) sees "Edit…" and may rename it; the start shows "Sign up for it to change when it starts." Bob-like members (signed up or not, not its maker) see no "Edit…"; a change sent by hand: 403 "Only its maker and moderators can change this meetup here.". The limits: ten names a minute (`/name`'s window, shared with Discord), three starts in three minutes (`/meet`'s window in a meetup, shared with `/meet` there; Starts `cancel` counts as `/meet time:cancel`, while `/cancel-meet` has a window of its own).
+18. A meetup ended (`/delete` in its post) while its editor is open: the next Set says "This meetup is over." and the editor closes. Googer's editor open while Googer loses the Moderator role: the next Set says "Only its maker and moderators can change this meetup here." and the editor closes.
+
+## Access, read-only, logs
+
+19. A forum Tester is kept out of (an overwrite for Tester that denies View Channel on West's forum): Tester's "Make the meetup" in West answers 403, in East goes through; the meetup in West is not on Tester's map. Remove the overwrite afterwards.
+20. While Discord cannot be reached (not staged: covered by the route tests of 8M-3 to 8M-5): no "New meetup", "Meetup here" or "Edit…"; writes 503.
+21. One form at a time: with the meetup form open, "Edit route", "Report raid", "Meetup here" and "Edit…" are greyed out; a right click on the map says "Close the form that is open first."; with route mode on, "New meetup" is greyed out.
+22. The bot's log: "a meetup was made on the map" (`user`, `guild`, `region`, `outcome`), "a meetup was changed on the map" (`party`, `change`, `outcome`); never a name, information or place.
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m5m HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `src/db/migrations/index.ts`: if plan 8T took migration 020 first, renumber this plan's to the next free number), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and no session holds it for staging. Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-5M": the decisions above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-5M.<n> <commit>` per task, then `review`), the ledger and memory; tell the sessions of 8S-2 and 8T.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-17-phase-8m5m-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: migration 020 on the dev database, `npm run build`, Matt starts the bot; two accounts and a moderators' channel: a meetup made from the map at a gym, at a PokéStop and at a pin (held for the moderators, the post saying "on the map"), changed from the map, its post and lines as from Discord.
