# Phase 3A: Party Kinds and Meetups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A party is no longer always a raid. Everything that was typed or worded for raids works for any kind of party, and the meetup is built end to end: `/meetup` makes one with its post in the region's forum, `/name` and `/info` change it, `/meet`, `/cancel-meet` and `/end` give it its times, members sign up with the same buttons and commands as in a raid, and the clock archives it. Trains (plan 3B) then need a third kind, not another generalisation.

**Architecture:** `Party` becomes the union `RaidParty | MeetupParty`. A meetup carries `timed: { name, startTime }`, the part a train will share (`TimedParty`), and `meetup: { description }`; the stored document gets version 4 with those parts beside `raid`. What is truly for raids narrows (`isRaid`, `requireRaid`, `commandRaid`); what any party has stays generic. `partyTick` dispatches on the kind: the raid's tick is the old body, a timed party's tick knows no stages and no completion questions. A timed party changes through `TimedPartyService` (`ctx.timedParties`) over pure functions in `src/domain/party/timed.ts`, as a raid changes through `RaidChangeService`. Rendering shared by all posts moves to `src/render/party-post.ts`; a meetup has its own renderer. Sentences name the party with `partyWord`, so no member of a meetup reads "raid".

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies, no migration (the `Party` table has had the `type` column since plan 2B); the state document goes from version 3 to 4.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: section 9 (Phase 3), the rows `train …` and `meetup, info` of 4.2, sections 5.1 to 5.3 and 5.5. Phase 3 is divided into two plans: **3A** (this one: party kinds and meetups) and **3B** (trains: route, conductor, movement, boss, groups, saved routes). Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, every paragraph that starts "**Phase 3 (trains and meetups):**". The legacy behaviour is digested in the git-ignored `.superpowers/sdd/phase-3-legacy-notes.md`.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (2,254 unit tests at the end, and 135 database tests). Two reviewers went through that branch and a third through the fixes; what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **The shape of a meetup.** `MeetupParty` has `timed: { name, startTime }` and `meetup: { description }`; `gymId` and `hatchTime` are null, `endTime` is its end. The start is one time for the whole party (the legacy `startTime`), not a group's meeting time. `TimedParty` is today `MeetupParty`; a train joins it in 3B with `timed` + `train`. State document version 4; versions 1 to 3 are still read, and the base branch cannot read a database this branch has written to (as with every version).
2. **One group, no completion.** A meetup has the group `A` for good: `/group` is refused there ("A meetup has no groups."), as is a group's meeting time. Done means leave (`/done` removes the member, as the legacy bot did); there is no completion question, no `Complete` status and no Done button. Remote and in person stay available. The maker is signed up as interested and is always named ("Created by"), whatever their raid privacy setting says.
3. **Times.** `/meet time` sets the start (the member must be signed up), `/cancel-meet` or `time:cancel` removes it; `/end time` sets the end and `time:none` removes it; anybody in the post may set the end. The end must be after the start. A new start is announced in the post with a ping for the signed-up members who allow it, gathered: one message a few seconds after the last change. `/meet` and `/cancel-meet` in a meetup are limited like `/shout` (3 per 180 seconds).
4. **How a typed time is read** (this leaves the legacy rule, which read times into the past; raids keep every result): for a train or meetup the start may lie from now on and the end from the later of now and the start; a time without a date is read on the day of the start while that day has not passed, otherwise today; of the possible readings the first that is not in the past wins, and readings on the next day are tried too (`1am` after an evening start is the next day). A start typed without am or pm at an hour from 1 to 6 is taken as the afternoon first (`6:15` is 18:15). An end without a date is read on the next day only when that is within twelve hours of the start (or of now); otherwise it is refused with the form that names the date. A bare number is an hour (`20` is 20:00); minutes need `in`. A refusal says on which day the text was read and shows the form with a date (`10-14 1pm`, month-day).
5. **When a meetup is over** (the legacy bot kept a meetup without an end time forever): `lastPossibleTime` is the end time; without one, a day after the start; without either, a day after the meetup was made or its last time was removed, whichever is later (Matt, 2026-10-11, refined by the review). The post of a meetup without any time says when it will be archived, and the first archive warning of a meetup without an end time pings its maker, when their settings allow it.
6. **Archiving.** After `lastPossibleTime` and `deletionGraceTime` comes the warning, then `trainOrMeetupDeletionWarningTime` (60 minutes) instead of a raid's ten. A running meetup is blue; red and the tag `Ended` apply once its end time has passed, and always in the last showing of an archived post ("This meetup is over." when it had no end time). A time set after the warning takes the warning away.
7. **On Discord.** `/meetup name` works where a region is known (its channel, its forum) and is refused in a party's post; a guard refuses what can be known beforehand, so a refused use does not count against 2 per 900 seconds. The post is titled `Meetup · <name>` with the tag `Meetup`; the link line is `New meetup: <#post>`. `/name` renames it (anybody; said in the post). `/info` opens a form with one paragraph field (at most 1,000 characters), prefilled; an empty form removes the text; a refused form gives the typed text back. The information is shown in the embed's description under **Information**, line by line through `plain()`, and is never cut. No copies in the remote and EX channels. The region's list shows meetups in a section of its own under the raids.
8. **Words.** `partyWord(party)` names the kind in every sentence both kinds can read. `requireParty` says "a raid or meetup"; raid-only commands and controls have `requireRaid` ("This is the post of a meetup: that only works in the post of a raid."). A click on a control of a party that has ended says "This raid is over." for what only a raid has (Done, a group, the completion answer, Set time) and "This has ended." otherwise.
9. **Framework changes.** A command's `throttle` may be a function of the interaction (as `defer` already may), for `/meet`, whose limit depends on the kind of post. `PartyStore.update` throws when a change returns a party of another kind. The fake gateway checks embeds against Discord's limits.
10. **Not in this plan:** trains and everything they need (3B), also "a party with a boss"; DMs and new-party notifications (Phase 4); importing legacy meetups (Phase 8); optional times on `/meetup`; a hand-deleted post is noticed only at the next render; two members editing `/info` at once (the later wins); the title "Active raids" of the pinned list; the help categories of the shared commands. These go to the follow-ups file.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). Repositories alone know column names. Only `DiscordPartyGateway` calls discord.js for parties.
- Database changes are additive only (this plan has none); `src/db/types.ts` is generated, never edited by hand.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` and the fake interactions.
- A party is never mutated; it changes only through `PartyStore.update`, whose callback is synchronous and decides inside.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`. Text written by members or by a feed is shown through `plain()`.
- Nothing is sent into or edited in a post after it was archived: Discord opens an archived post again for that.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context. Invisible characters in test strings are written as `\u` escapes: keep them as escapes (the Write tool turns an escape into the raw character; check with the transcription diff).
- Each task names the commit of the prototype it transcribes (branch `proto/phase-3a` of this repository). `git diff <that commit> -- src test` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting). Check its exit status, not only the end of its output.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash (Git Bash turns it into a path).

## Review Focus

1. A raid must behave exactly as before: Task 4, the tests of `tick.test.ts` unchanged over `raidTick`; Task 5, `raid-post.test.ts` unchanged over the moved rendering; Task 1, the raid tests of `party-time.test.ts`, which this plan does not touch; Task 2, `raid-only.test.ts` (every raid-only command and control refused in a meetup with a sentence, never an exception).
2. A meetup must never be archived while it is still to come, nor stay for good: Tasks 2 and 3, the tests of `latestTime` and `settled` in `timed.test.ts`; Task 4, "gives a meetup nobody gave a time a day from when it was made"; Task 6, "gives a meetup nobody gave a time a day, and says that a time keeps it open" through to the last showing, and removing the last time of an old meetup; Task 7, `/cancel-meet` and `/end time:none` on an old meetup.
3. A typed time must mean what the member means: Task 1, the cases of a meetup on a later day than it was made, an end after an evening start, a time that has passed today; Task 7, the same through `/meet` and `/end`, and the refusal that names the day and the dated form.
4. Nothing a member types may ping, break the post or be lost: Task 2, `tidyName` with invisible and right-to-left characters; Task 5, the information of 1,000 characters that all need escaping shown whole within the embed's limits, and `truncate` never leaving a lone backslash; Task 8, a refused `/info` form giving the text back.
5. No member of a meetup reads "raid", and no raid member a worse sentence than before: Task 7, "never calls the meetup a raid, whatever they try in its post" in `in-meetup.test.ts` (every command and control in a meetup post); Task 8, the same sweep with the new commands; the stale-control sentences in `components/party.test.ts`.

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
src/commands/raids/raid-only.test.ts  (create, task 2)
src/domain/party/meetup.test.ts  (create, task 2)
src/domain/party/meetup.ts  (create, task 2)
src/domain/party/timed.test.ts  (create, task 2)
src/domain/party/timed.ts  (create, task 2)
src/domain/party/tick.timed.test.ts  (create, task 4)
src/render/meetup-post.test.ts  (create, task 5)
src/render/meetup-post.ts  (create, task 5)
src/render/party-post.ts  (create, task 5)
src/services/party-scheduler.meetup.test.ts  (create, task 6)
src/services/party-service.meetup.test.ts  (create, task 6)
src/commands/parties/in-meetup.test.ts  (create, task 7)
src/commands/parties/timed.ts  (create, task 7)
src/services/timed-party-service.test.ts  (create, task 7)
src/services/timed-party-service.ts  (create, task 7)
src/commands/meetups/info.ts  (create, task 8)
src/commands/meetups/meetup.test.ts  (create, task 8)
src/commands/meetups/meetup.ts  (create, task 8)
src/commands/meetups/name-info.test.ts  (create, task 8)
src/commands/parties/name.ts  (create, task 8)
```

---

### Task 1: Time reading for timed parties

**Files:**
- Modify: `src/domain/time/party-time.test.ts`, `src/domain/time/party-time.ts`

**Interfaces:**
- Consumes: `resolvePartyTime` and its request (`src/domain/time/party-time.ts`, Phase 1A), which already knows `partyType: 'train' | 'meetup'`.
- Produces: For a party that is no raid: the window of a start begins now and that of an end at the later of now and the start; a time without a date is read on the start's day only while that day has not passed; the first reading that is not in the past wins, and next-day readings are tried; an out-of-range answer carries `read`, the moment the text was read as. Raids keep every result.

This is Phase 1A code that no command reached until now. Three of its old expectations change: a time that had passed today was refused and is now read as tomorrow's.

Reference commit of the prototype for this task: `cd943ca`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/domain/time/party-time.test.ts`:

```diff
--- a/src/domain/time/party-time.test.ts
+++ b/src/domain/time/party-time.test.ts
@@ -374,25 +374,141 @@ describe('resolvePartyTime: "at" before a clock time for trains and meetups', ()
   });
 });
 
-describe('resolvePartyTime: tomorrow is only guessed for standard raids', () => {
-  it('refuses a meetup meeting time that already passed today', () => {
-    const now = at('2026-10-10T19:00');
-    const party = { creationTime: now };
+describe('resolvePartyTime: a train or meetup is planned ahead', () => {
+  const timed = (
+    text: string,
+    parameter: 'meet' | 'end',
+    party: PartyTimeRequest['party'],
+    now = NOW,
+  ) => resolvePartyTime(request({ text, now, parameter, partyType: 'meetup', party }));
+  const time = (iso: string) => ({ kind: 'time', at: at(iso) });
+  // Saturday 10 October 2026, 14:00 is NOW; the party was made the day before.
+  const yesterday = at('2026-10-09T10:00');
+
+  it('reads a start that has passed today as tomorrow', () => {
+    // The legacy bot refused these; nobody plans a meetup for the past.
+    const evening = at('2026-10-10T19:00');
+    expect(timed('6', 'meet', { creationTime: evening }, evening)).toEqual(
+      time('2026-10-11T18:00'),
+    );
+    expect(timed('1pm', 'meet', { creationTime: NOW })).toEqual(time('2026-10-11T13:00'));
+    expect(timed('1', 'meet', { creationTime: NOW })).toEqual(time('2026-10-11T13:00'));
     expect(
-      resolvePartyTime(request({ text: '6', now, parameter: 'meet', partyType: 'meetup', party }))
-        .kind,
-    ).toBe('out-of-range');
+      resolvePartyTime(
+        request({
+          text: '120',
+          parameter: 'meet',
+          partyType: 'train',
+          party: { creationTime: NOW },
+        }),
+      ),
+    ).toEqual(time('2026-10-11T13:20'));
   });
 
-  it('refuses a train meeting time that already passed today', () => {
-    const party = { creationTime: NOW };
-    for (const text of ['1', '120']) {
-      expect(
-        resolvePartyTime(request({ text, parameter: 'meet', partyType: 'train', party })).kind,
-      ).toBe('out-of-range');
+  it('reads a start of 1 to 6 without "am" or "pm" as the afternoon before the night', () => {
+    const early = at('2026-10-10T00:30');
+    const fresh = { creationTime: early };
+    for (const hour of [1, 2, 3, 4, 5, 6]) {
+      expect(timed(String(hour), 'meet', fresh, early)).toEqual(
+        time(`2026-10-10T${String(hour + 12)}:00`),
+      );
     }
+    // Said with "am" it is the night; from 7 on the morning comes first, as it did.
+    expect(timed('1am', 'meet', fresh, early)).toEqual(time('2026-10-10T01:00'));
+    expect(timed('7', 'meet', fresh, early)).toEqual(time('2026-10-10T07:00'));
+    expect(timed('11', 'meet', fresh, early)).toEqual(time('2026-10-10T11:00'));
+    // With a date too.
+    expect(timed('10-14 6', 'meet', fresh, early)).toEqual(time('2026-10-14T18:00'));
+    expect(timed('10-14 6am', 'meet', fresh, early)).toEqual(time('2026-10-14T06:00'));
+    expect(timed('10-14 9', 'meet', fresh, early)).toEqual(time('2026-10-14T09:00'));
+  });
+
+  it('reads a new start on the day of a start that is still to come, afternoon first', () => {
+    // Typed on a Tuesday for a meetup that starts on Saturday at 18:00.
+    const tuesday = at('2026-10-06T15:00');
+    const party = { creationTime: at('2026-10-05T10:00'), startTime: at('2026-10-10T18:00') };
+    expect(timed('6:15', 'meet', party, tuesday)).toEqual(time('2026-10-10T18:15'));
+    expect(timed('5', 'meet', party, tuesday)).toEqual(time('2026-10-10T17:00'));
+  });
+
+  it('never reads a start into the past, also for a party made days ago', () => {
+    // 06:15 today lies after the party was made, and before now: the afternoon is meant.
+    expect(timed('6:15', 'meet', { creationTime: yesterday })).toEqual(time('2026-10-10T18:15'));
+    expect(timed('9am', 'meet', { creationTime: yesterday })).toEqual(time('2026-10-11T09:00'));
+  });
+
+  it('reads a new start today when the old start was on a day that has passed', () => {
+    const party = { creationTime: at('2026-10-08T10:00'), startTime: at('2026-10-09T18:00') };
+    expect(timed('7pm', 'meet', party)).toEqual(time('2026-10-10T19:00'));
+    expect(timed('6pm', 'end', party)).toEqual(time('2026-10-10T18:00'));
+  });
+
+  it('reads a new start on the day of the old one while that day is still to come', () => {
+    const party = { creationTime: yesterday, startTime: at('2026-10-12T18:00') };
+    expect(timed('7pm', 'meet', party)).toEqual(time('2026-10-12T19:00'));
+    expect(timed('10', 'meet', party)).toEqual(time('2026-10-12T10:00'));
+  });
+
+  it('reads an end after the start: the afternoon, or the day after', () => {
+    const afternoon = { creationTime: yesterday, startTime: at('2026-10-17T14:00') };
+    expect(timed('5', 'end', afternoon)).toEqual(time('2026-10-17T17:00'));
+    const night = { creationTime: yesterday, startTime: at('2026-10-17T22:00') };
+    expect(timed('1am', 'end', night)).toEqual(time('2026-10-18T01:00'));
+    // An end stays in the order of the clock: one in the night, not one in the afternoon.
+    expect(timed('1', 'end', night)).toEqual(time('2026-10-18T01:00'));
+  });
+
+  it('puts an end on the day after only within half a day of the start, or of now', () => {
+    const refused = (text: string, party: PartyTimeRequest['party'], read: string) => {
+      const result = timed(text, 'end', party);
+      expect(result).toMatchObject({ kind: 'out-of-range', read: at(read) });
+    };
+    // Starts today at 15:00: an end at 13:00 is a mistake, not tomorrow.
+    const today = { creationTime: NOW, startTime: at('2026-10-10T15:00') };
+    refused('1pm', today, '2026-10-10T13:00');
+    // Starts at 18:00: noon and 13:00 of the next day are too far.
+    const evening = { creationTime: NOW, startTime: at('2026-10-10T18:00') };
+    refused('12', evening, '2026-10-10T12:00');
+    refused('1pm', evening, '2026-10-10T13:00');
+    expect(timed('5', 'end', evening)).toEqual(time('2026-10-11T05:00'));
+    expect(timed('6am', 'end', evening)).toEqual(time('2026-10-11T06:00'));
+    refused('7am', evening, '2026-10-10T07:00');
+    // Without a start it is half a day from now (14:00).
+    refused('9am', { creationTime: NOW }, '2026-10-10T09:00');
+    expect(timed('1am', 'end', { creationTime: NOW })).toEqual(time('2026-10-11T01:00'));
+    expect(timed('2am', 'end', { creationTime: NOW })).toEqual(time('2026-10-11T02:00'));
+    refused('2:01am', { creationTime: NOW }, '2026-10-10T02:01');
+  });
+
+  it('refuses an end at or before the start that is given with its date', () => {
+    const party = { creationTime: yesterday, startTime: at('2026-10-17T14:00') };
+    expect(timed('10-17 1pm', 'end', party)).toEqual({
+      kind: 'out-of-range',
+      first: at('2026-10-17T14:00'),
+      last: at('2027-01-11T10:00'),
+    });
+    expect(timed('10-17 3pm', 'end', party)).toEqual(time('2026-10-17T15:00'));
+  });
+
+  it('says on which day a time without a date was read when no reading fits', () => {
+    // Made 93 days ago: the latest start is today 14:00, and 15:00 is past it on any day.
+    const old = { creationTime: NOW - 133_920 * 60_000 };
+    expect(timed('3pm', 'meet', old)).toEqual({
+      kind: 'out-of-range',
+      first: NOW,
+      last: NOW,
+      read: at('2026-10-10T15:00'),
+    });
+    // A text with a date says its own day.
+    expect(timed('10-11 3pm', 'meet', old)).toEqual({
+      kind: 'out-of-range',
+      first: NOW,
+      last: NOW,
+    });
   });
+});
 
+describe('resolvePartyTime: tomorrow is only guessed for standard raids and timed parties', () => {
   it('refuses a train end time that already passed today', () => {
     const party = { creationTime: NOW, startTime: at('2026-10-10T15:00') };
     expect(
```

Run: `npx vitest run --project unit src/domain/time/party-time.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/domain/time/party-time.ts`:

```diff
--- a/src/domain/time/party-time.ts
+++ b/src/domain/time/party-time.ts
@@ -54,9 +54,20 @@ export type PartyTimeResult =
   /** The member asked to clear the time ("unset", "cancel", "none"). */
   | { kind: 'unset' }
   | { kind: 'unparseable' }
-  | { kind: 'out-of-range'; first: number; last: number };
+  /**
+   * `read` is set for a clock time that was typed without a date for a train or meetup: the
+   * moment it was first taken for (its day is the day the text was read on), so that a refusal
+   * can say so.
+   */
+  | { kind: 'out-of-range'; first: number; last: number; read?: number };
 
 const MINUTE = 60_000;
+const HOUR = 60 * MINUTE;
+/**
+ * An end of a train or meetup that was typed without a date is read as the day after only when
+ * that is no later than this many hours after the start (or after now).
+ */
+const NEXT_DAY_END_HOURS = 12;
 const UNSET_WORDS = ['unset', 'cancel', 'none'];
 const HATCH_WORDS = ['hatch', 'start'];
 
@@ -111,8 +122,13 @@ function timeWindow(request: PartyTimeRequest): Window {
 
   if (parameter === 'end') {
     if (timed) {
+      // A train or meetup cannot end before it starts, nor in the past.
       const days = settings.maximumMeetupLeadtime + 1;
-      return { first: now, last: plusDays(creation, days, zone), maxMinutes: days * 1440 };
+      return {
+        first: Math.max(now, party?.startTime ?? now),
+        last: plusDays(creation, days, zone),
+        maxMinutes: days * 1440,
+      };
     }
     const total = incubation + hatched;
     return { first: now, last: creation + total * MINUTE, maxMinutes: total };
@@ -120,8 +136,10 @@ function timeWindow(request: PartyTimeRequest): Window {
 
   // Meeting time.
   if (timed) {
+    // From now on, not from when the party was made (as the legacy bot had it): a start that is
+    // typed is a start to come, and the first reading that fits must not be one in the past.
     const max = settings.maxMeetupLeadupDuration;
-    return { first: creation, last: creation + max * MINUTE, maxMinutes: max };
+    return { first: now, last: creation + max * MINUTE, maxMinutes: max };
   }
   const total = incubation + hatched;
   return {
@@ -134,21 +152,36 @@ function timeWindow(request: PartyTimeRequest): Window {
 /**
  * Every moment a typed clock time could mean, most likely first. Standard raids, whose windows
  * are under two hours, also get tomorrow's guesses (so 12:10 at 23:50 means ten past midnight),
- * yesterday's (so 11:50pm at 00:10 means twenty minutes ago) and "12:xx" read as "00:xx". Every other party has a window of hours or days, where a time
- * that has already passed today must stay out of range rather than silently become tomorrow's,
- * so those get exactly the legacy bot's candidates: today, next year, and the afternoon variants.
+ * yesterday's (so 11:50pm at 00:10 means twenty minutes ago) and "12:xx" read as "00:xx". An
+ * exclusive or elite raid has a window of hours or days, where a time that has already passed
+ * today must stay out of range rather than silently become tomorrow's, so those get exactly the
+ * legacy bot's candidates: today, next year, and the afternoon variants.
+ *
+ * A train or meetup is planned ahead, and its times are typed on other days than they mean. A
+ * time without a date is read on the day of the start while that day is today or still to come,
+ * otherwise today; and it also has the readings of the day after (a meetup that starts at 22:00
+ * ends at "1am" the next day; a start typed after its hour has passed today means tomorrow).
+ * The first reading inside the window wins, and the window never reaches into the past.
+ *
+ * Two things keep that from guessing too far. A start of 1 to 6 o'clock without "am" or "pm"
+ * is the afternoon before it is the night: nobody plans a meetup for one in the morning by
+ * typing "1". And an end is put on the day after only when that is within half a day of the
+ * start (or of now): "1pm" for a party that starts at three is a mistake, not tomorrow.
  */
 function candidates(clock: ClockInput, request: PartyTimeRequest, reference?: number): number[] {
   const { zone, parameter, partyType, raidKind } = request;
   const now = DateTime.fromMillis(request.now, { zone });
   const hasDate = clock.month !== undefined && clock.day !== undefined;
   const standardRaid = partyType === 'raid' && raidKind === 'standard';
+  const timed = partyType !== 'raid';
 
-  // A date-less meeting time, or end time of a train or meetup, falls on the reference day.
+  // A date-less meeting time, or end time of a train or meetup, falls on the reference day; for
+  // a train or meetup only while that day has not passed.
   const useReference =
     !hasDate &&
     reference !== undefined &&
-    (parameter === 'meet' || (parameter === 'end' && partyType !== 'raid'));
+    (parameter === 'meet' || (parameter === 'end' && timed)) &&
+    (!timed || DateTime.fromMillis(reference, { zone }).startOf('day') >= now.startOf('day'));
   const day = useReference ? DateTime.fromMillis(reference, { zone }) : now;
 
   // The day is moved before the wall-clock time is built, so a time that exists tomorrow but not
@@ -172,6 +205,26 @@ function candidates(clock: ClockInput, request: PartyTimeRequest, reference?: nu
   const afternoon = !clock.hasMeridiem && clock.hour < 12 ? clock.hour + 12 : undefined;
   const midnight = standardRaid && !clock.hasMeridiem && clock.hour === 12 ? 0 : undefined;
 
+  if (timed) {
+    const afternoonFirst = parameter === 'meet' && clock.hour >= 1 && clock.hour <= 6;
+    const hours =
+      afternoon === undefined
+        ? [clock.hour]
+        : afternoonFirst
+          ? [afternoon, clock.hour]
+          : [clock.hour, afternoon];
+    const millis = (times: DateTime[]): number[] =>
+      times.filter((time) => time.isValid).map((time) => time.toMillis());
+    // With a date: that day, this year or the next.
+    if (hasDate) return millis(hours.flatMap((hour) => [build(hour), build(hour, 1)]));
+    // Without: the day itself, then the day after; a year ahead is never within the window.
+    const sameDay = millis(hours.map((hour) => build(hour)));
+    const nextDay = millis(hours.map((hour) => build(hour, 0, 1)));
+    if (parameter !== 'end') return [...sameDay, ...nextDay];
+    const from = Math.max(request.now, request.party?.startTime ?? request.now);
+    return [...sameDay, ...nextDay.filter((time) => time <= from + NEXT_DAY_END_HOURS * HOUR)];
+  }
+
   const all = [build(clock.hour), build(clock.hour, 1)];
   if (afternoon !== undefined) all.push(build(afternoon), build(afternoon, 1));
   if (standardRaid && !hasDate) {
@@ -225,6 +278,7 @@ export function resolvePartyTime(request: PartyTimeRequest): PartyTimeResult {
 
   const possible: number[] = [];
   let tooLong = false;
+  let read: number | undefined;
   if (mode !== 'absolute') {
     const minutes = parseRelativeMinutes(text);
     if (minutes !== undefined && minutes < window.maxMinutes) {
@@ -237,7 +291,9 @@ export function resolvePartyTime(request: PartyTimeRequest): PartyTimeResult {
     clock ??= parseClockInput(text);
     if (clock) {
       const reference = (timed ? party?.startTime : party?.hatchTime) ?? undefined;
-      possible.push(...candidates(clock, request, reference));
+      const readings = candidates(clock, request, reference);
+      if (timed && clock.month === undefined && clock.day === undefined) read = readings[0];
+      possible.push(...readings);
     }
   }
 
@@ -248,7 +304,11 @@ export function resolvePartyTime(request: PartyTimeRequest): PartyTimeResult {
       : { kind: 'unparseable' };
   }
   const match = possible.find((time) => time >= window.first && time <= window.last);
-  return match === undefined
-    ? { kind: 'out-of-range', first: window.first, last: window.last }
-    : { kind: 'time', at: match };
+  if (match !== undefined) return { kind: 'time', at: match };
+  return {
+    kind: 'out-of-range',
+    first: window.first,
+    last: window.last,
+    ...(read === undefined ? {} : { read }),
+  };
 }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/time/party-time.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff cd943ca -- src test   # must print nothing
npx prettier --check src/domain/time/party-time.test.ts src/domain/time/party-time.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/domain/time/party-time.test.ts src/domain/time/party-time.ts
git commit -m "Time reading for timed parties: a time typed for a train or meetup is never read into the past" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,981 unit tests.

---

### Task 2: A party is a raid or a meetup

**Files:**
- Create: `src/commands/raids/raid-only.test.ts`, `src/domain/party/meetup.test.ts`, `src/domain/party/meetup.ts`, `src/domain/party/timed.test.ts`, `src/domain/party/timed.ts`
- Modify: `src/commands/parties/attendance.test.ts`, `src/commands/parties/meet.ts`, `src/commands/parties/reply.ts`, `src/commands/raids/boss.ts`, `src/commands/raids/change.ts`, `src/commands/raids/location.ts`, `src/components/party.test.ts`, `src/components/party.ts`, `src/db/repositories/party-repository.db.test.ts`, `src/discord/guards.test.ts`, `src/discord/guards.ts`, `src/domain/party/party-state.test.ts`, `src/domain/party/party-state.ts`, `src/domain/party/party.ts`, `src/domain/party/raid.test.ts`, `src/domain/party/raid.ts`, `src/domain/party/relocate.test.ts`, `src/domain/party/tick.test.ts`, `src/domain/party/tick.ts`, `src/render/activity.ts`, `src/render/summary.test.ts`, `src/services/attendance-service.test.ts`, `src/services/attendance-service.ts`, `src/services/party-lifecycle.db.test.ts`, `src/services/party-mirrors.test.ts`, `src/services/party-mirrors.ts`, `src/services/party-scheduler.test.ts`, `src/services/party-scheduler.ts`, `src/services/party-service.relocate.test.ts`, `src/services/party-service.test.ts`, `src/services/party-service.ts`, `src/services/party-store.test.ts`, `src/services/party-store.ts`, `src/services/raid-change-service.test.ts`, `src/services/raid-change-service.ts`, `test/support/parties.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: `PartyCore`, `RaidParty`, the state document (`party-state.ts`, version 3), `PartyRepository`, `PartyStore`, and every place that took `Party` to be a raid (the follow-ups' "Phase 3" paragraphs).
- Produces: `MeetupParty` (`timed: TimedDetails { name, startTime }`, `meetup: MeetupDetails { description }`), `Party = RaidParty | MeetupParty`, `TimedParty`, `isRaid` / `isTimed` / `isMeetup`, `asKindOf(original, changed)`, `partyWord(party)`, `hasGroups(party)`, `withLastPossibleTime`, `setSaved` and `endParty` in `party.ts`, `MAX_PARTY_NAME`, `MAX_MEETUP_DESCRIPTION`; state document version 4; `createMeetup(input): Change<MeetupParty>` (`meetup.ts`), `tidyName`, `nameOf`, `startTimeOf`, `latestTime(party, now)`, `settled` (`timed.ts`); `PartyStore.update` refuses a change of kind; the guards `requireRaid` and `raidOf`, `commandRaid` in `reply.ts`; `testMeetup()`, `asRaid()` in the test support.

Three places narrow to a raid only for now, because nothing makes a meetup before Task 6: the tick, `PartyService`'s rendering, and `/meet` and `/end`. Later tasks replace them. A row of type `train` stays unreadable, reported and left alone.

Reference commit of the prototype for this task: `a98b744`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/parties/attendance.test.ts`:

```diff
--- a/src/commands/parties/attendance.test.ts
+++ b/src/commands/parties/attendance.test.ts
@@ -7,8 +7,7 @@ import { reportedRaid } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import type { CommandModule } from '../../discord/command.js';
 import { InteractionRouter } from '../../discord/router.js';
-import { attendeeOf } from '../../domain/party/party.js';
-import { endParty } from '../../domain/party/tick.js';
+import { attendeeOf, endParty } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import type { RaidReport } from '../../services/party-service.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
```

Create `src/commands/raids/raid-only.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, testMeetup } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { TIME_INPUT } from '../../render/party-controls.js';
import { boss, moveset } from './boss.js';
import { duration, hatch } from './change.js';
import { location } from './location.js';

const POST = '300000000000000077';
const NOT_A_RAID = 'This is the post of a meetup: that only works in the post of a raid.';
const all: CommandModule[] = [hatch, duration, boss, moveset, location];

/** A meetup with a post, and the commands that are about a raid as such. */
async function inMeetup() {
  const meetup = { ...testMeetup(), forumChannelId: WEST_FORUM, forumPostId: POST };
  const made = await partyServiceWith([meetup]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: POST, thread: { parentId: WEST_FORUM }, userId: ALICE };
  const answer = async (commandName: string, options: Record<string, string | number>) =>
    sent((await handle(fakeChatInput({ commandName, ...where, options }))).reply).content;
  return { ...made, meetup, handle, answer, where };
}

describe('what is only for raids, in the post of a meetup', () => {
  it('refuses every command about a raid as such, naming the kind of post', async () => {
    const made = await inMeetup();
    expect(await made.answer('hatch', { time: '30' })).toBe(NOT_A_RAID);
    expect(await made.answer('duration', { minutes: 30 })).toBe(NOT_A_RAID);
    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(NOT_A_RAID);
    expect(await made.answer('moveset', { quick: 'snarl' })).toBe(NOT_A_RAID);
    expect(await made.answer('location', { gym: 'Library' })).toBe(NOT_A_RAID);
    // Nothing was written and nothing said.
    expect(made.store.get(made.meetup.id)).toBe(made.meetup);
    await made.attendance.flush();
    expect(made.gateway.messagesIn(POST)).toEqual([]);
  });

  it('offers no moves there', async () => {
    const made = await inMeetup();
    const typing = await made.handle(
      fakeAutocomplete({
        commandName: 'moveset',
        ...made.where,
        focused: '',
        focusedName: 'quick',
      }),
    );
    expect(typing.respond).toHaveBeenCalledWith([]);
  });

  it('refuses the "Set time" button and its form, which only a raid has', async () => {
    const made = await inMeetup();
    const click = await made.handle(
      fakeButton({ customId: `party:${made.meetup.id}:time`, ...made.where }),
    );
    expect(click.showModal).not.toHaveBeenCalled();
    expect(sent(click.reply).content).toBe(NOT_A_RAID);
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.meetup.id}:time:hatch`,
        ...made.where,
        fields: { [TIME_INPUT]: '30' },
      }),
    );
    expect(sent(form.reply).content).toBe(NOT_A_RAID);
    expect(made.store.get(made.meetup.id)).toBe(made.meetup);
  });
});
```

Apply to `src/components/party.test.ts`:

```diff
--- a/src/components/party.test.ts
+++ b/src/components/party.test.ts
@@ -14,9 +14,8 @@ import { createTestLogger } from '../../test/support/test-logger.js';
 import { WITHDRAWN_REPLY } from '../commands/parties/reply.js';
 import { ClickAnswers } from '../discord/click-answers.js';
 import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
-import { attendeeOf } from '../domain/party/party.js';
+import { attendeeOf, endParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { endParty } from '../domain/party/tick.js';
 import type { RaidReport } from '../services/party-service.js';
 import { partyButtons } from './party.js';
 
```

Apply to `src/db/repositories/party-repository.db.test.ts`:

```diff
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -5,14 +5,15 @@ import {
   ALICE,
   MINUTE,
   PARTY_NOW,
+  testMeetup,
   testRaid,
   testRaidRules,
   withAttendees,
 } from '../../../test/support/parties.js';
-import type { RaidParty } from '../../domain/party/party.js';
+import { endParty } from '../../domain/party/party.js';
+import type { MeetupParty, RaidParty } from '../../domain/party/party.js';
 import { setHatchTime } from '../../domain/party/raid.js';
 import { PartyStatus } from '../../domain/party/status.js';
-import { endParty } from '../../domain/party/tick.js';
 import type { DB } from '../types.js';
 import { PartyRepository } from './party-repository.js';
 
@@ -72,6 +73,75 @@ describe('PartyRepository', () => {
     await expect(parties.findById(ID(9))).resolves.toBeUndefined();
   });
 
+  /** A meetup with times, a second attendee, a post and a description: every column in use. */
+  function fullMeetup(n = 1): MeetupParty {
+    const meetup = withAttendees(testMeetup({ id: ID(n), name: 'Picnic “by the lake” 🧺' }), {
+      [ALICE]: { status: PartyStatus.Present, number: 2, remote: true },
+    });
+    return {
+      ...meetup,
+      forumChannelId: FORUM,
+      forumPostId: String(BigInt(POST) + BigInt(n)),
+      regionLinkMessageId: '1234567890123456600',
+      mirrorMessages: [
+        {
+          channelId: String(BigInt(POST) + BigInt(n)),
+          messageId: '1234567890123456501',
+          kind: 'status',
+        },
+      ],
+      endTime: PARTY_NOW + 180 * MINUTE,
+      lastPossibleTime: PARTY_NOW + 180 * MINUTE,
+      deletionTime: PARTY_NOW + 245 * MINUTE,
+      timed: { ...meetup.timed, startTime: PARTY_NOW + 60 * MINUTE },
+      meetup: { description: 'Bring snacks.\nWe meet at the fountain. 🍪' },
+    };
+  }
+
+  it('stores a new meetup and reads it back exactly, by itself and in the list', async () => {
+    const meetup = fullMeetup();
+    await parties.insert(meetup);
+    expect(await parties.findById(meetup.id)).toEqual({ ok: true, party: meetup });
+    expect(await parties.listActive()).toEqual({ parties: [meetup], unreadable: [] });
+    const row = await db
+      .selectFrom('Party')
+      .select(['type', 'gymId', 'hatchTime', 'endTime'])
+      .where('id', '=', meetup.id)
+      .executeTakeFirstOrThrow();
+    expect(row).toEqual({
+      type: 'meetup',
+      gymId: null,
+      hatchTime: null,
+      endTime: String(PARTY_NOW + 180 * MINUTE),
+    });
+  });
+
+  it('saves the changes of a meetup: its name, its times, its end', async () => {
+    const meetup = fullMeetup();
+    await parties.insert(meetup);
+    const changed: MeetupParty = {
+      ...meetup,
+      endTime: null,
+      lastPossibleTime: PARTY_NOW + 24 * 60 * MINUTE,
+      deletionTime: null,
+      updatedAt: PARTY_NOW + MINUTE,
+      timed: { name: 'Picnic', startTime: null },
+      meetup: { description: null },
+    };
+    expect(await parties.save(changed)).toBe(true);
+    expect(await parties.findById(meetup.id)).toEqual({ ok: true, party: changed });
+    expect(await parties.save(endParty(changed))).toBe(true);
+    expect(await parties.listActive()).toEqual({ parties: [], unreadable: [] });
+  });
+
+  it('reports a meetup row with what only a raid has, and leaves it alone', async () => {
+    await parties.insert(fullMeetup());
+    await sql`update Party set gymId = 1 where id = ${ID(1)}`.execute(db);
+    expect((await parties.listActive()).unreadable).toMatchObject([
+      { id: ID(1), problem: 'a meetup with a gym' },
+    ]);
+  });
+
   it('keeps a 19-digit post id and times beyond 32 bits exactly', async () => {
     const raid = { ...fullRaid(), forumPostId: '1234567890123456789', endTime: 1_800_000_000_123 };
     await parties.insert(raid);
```

Apply to `src/discord/guards.test.ts`:

```diff
--- a/src/discord/guards.test.ts
+++ b/src/discord/guards.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import { fakeAutocomplete, fakeChatInput } from '../../test/support/fake-interactions.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
-import { partyStoreWith, testRaid } from '../../test/support/parties.js';
+import { partyStoreWith, testMeetup, testRaid } from '../../test/support/parties.js';
 import { TestRegions } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { GuardableInteraction, LocatedInteraction } from './command.js';
@@ -12,6 +12,7 @@ import {
   isManagement,
   isPvpContext,
   partyOf,
+  raidOf,
   regionChannelOf,
   requireBotChannel,
   requireBotChannelOrRegion,
@@ -20,6 +21,7 @@ import {
   requireManagement,
   requireParty,
   requirePvpContext,
+  requireRaid,
   requireRegion,
 } from './guards.js';
 
@@ -220,4 +222,43 @@ describe('party posts', () => {
       'This only works in a server.',
     );
   });
+
+  const MEETUP_POST = '300000000000000002';
+
+  async function withRaidAndMeetup() {
+    const raid = { ...testRaid(), forumPostId: POST };
+    const meetup = { ...testMeetup(), forumPostId: MEETUP_POST };
+    const { store } = await partyStoreWith([raid, meetup]);
+    return { raid, meetup, ctx: createTestContext({ parties: store }).ctx };
+  }
+
+  it('requireParty passes in the post of a meetup too', async () => {
+    const { meetup, ctx: both } = await withRaidAndMeetup();
+    const inMeetup = as(fakeChatInput({ channelId: MEETUP_POST, thread: {} }));
+    expect(partyOf(inMeetup, both)).toBe(meetup);
+    expect(() => requireParty(inMeetup, both)).not.toThrow();
+  });
+
+  it('requireRaid passes in the post of a raid and names the kind of any other post', async () => {
+    const { ctx: both } = await withRaidAndMeetup();
+    expect(() =>
+      requireRaid(as(fakeChatInput({ channelId: POST, thread: {} })), both),
+    ).not.toThrow();
+    expect(() =>
+      requireRaid(as(fakeChatInput({ channelId: MEETUP_POST, thread: {} })), both),
+    ).toThrow('This is the post of a meetup: that only works in the post of a raid.');
+    expect(() => requireRaid(as(fakeChatInput({ channelId: WEST_CHANNEL })), both)).toThrow(
+      'Use this in the post of a raid that is still active.',
+    );
+    expect(() => requireRaid(as(fakeChatInput({ isDm: true })), both)).toThrow(
+      'This only works in a server.',
+    );
+  });
+
+  it('raidOf finds the raid of a post, and nothing in the post of a meetup', async () => {
+    const { raid, ctx: both } = await withRaidAndMeetup();
+    expect(raidOf(as(fakeChatInput({ channelId: POST, thread: {} })), both)).toBe(raid);
+    expect(raidOf(as(fakeChatInput({ channelId: MEETUP_POST, thread: {} })), both)).toBeUndefined();
+    expect(raidOf(as(fakeChatInput({ channelId: WEST_CHANNEL })), both)).toBeUndefined();
+  });
 });
```

Create `src/domain/party/meetup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PARTY_NOW, REPORTER, testMeetup, testRaid } from '../../../test/support/parties.js';
import { attendanceLimits, setRemote } from './attendance.js';
import { createMeetup, type NewMeetup } from './meetup.js';
import { isRaid, isTimed, MAX_PARTY_NAME, partyWord, remoteAllowed, type Party } from './party.js';
import { PartyStatus } from './status.js';

const HOUR = 3_600_000;
const ALICE = '200000000000000002';

const fresh: NewMeetup = {
  id: '00000000-0000-4000-8000-000000000009',
  guildId: 1,
  regionId: 2,
  createdById: REPORTER,
  name: 'Community Day picnic',
  now: PARTY_NOW,
};

describe('createMeetup', () => {
  it('makes a meetup with its name and nothing else, in the region it was made in', () => {
    const made = createMeetup(fresh);
    expect(made).toMatchObject({
      ok: true,
      party: {
        id: fresh.id,
        type: 'meetup',
        status: 'active',
        guildId: 1,
        regionId: 2,
        gymId: null,
        hatchTime: null,
        endTime: null,
        deletionTime: null,
        saved: false,
        forumPostId: null,
        createdById: REPORTER,
        anonymous: false,
        createdAt: PARTY_NOW,
        timed: { name: 'Community Day picnic', startTime: null },
        meetup: { description: null },
      },
    });
  });

  it('signs up who made it as interested, in the one group a meetup has', () => {
    const { attendees, groups, defaultGroupId } = testMeetup();
    expect(attendees).toEqual({
      [REPORTER]: { number: 1, status: PartyStatus.Interested, group: 'A', remote: false },
    });
    expect(groups).toEqual([{ id: 'A' }]);
    expect(defaultGroupId).toBe('A');
  });

  it('counts a meetup without times as going on for a day after it was made', () => {
    expect(testMeetup().lastPossibleTime).toBe(PARTY_NOW + 24 * HOUR);
  });

  it('tidies the name: one line, single spaces, no white space at the ends', () => {
    const made = createMeetup({ ...fresh, name: '  Community\n Day \t picnic ' });
    expect(made.ok && made.party.timed.name).toBe('Community Day picnic');
  });

  it('refuses a name that is empty or too long', () => {
    expect(createMeetup({ ...fresh, name: ' \n ' })).toEqual({ ok: false, reason: 'bad-name' });
    expect(createMeetup({ ...fresh, name: 'x'.repeat(MAX_PARTY_NAME) }).ok).toBe(true);
    expect(createMeetup({ ...fresh, name: 'x'.repeat(MAX_PARTY_NAME + 1) })).toEqual({
      ok: false,
      reason: 'bad-name',
    });
  });
});

describe('the kinds of party', () => {
  const raid: Party = testRaid();
  const meetup: Party = testMeetup();

  it('tells a raid from a meetup, which is a timed party', () => {
    expect([isRaid(raid), isTimed(raid)]).toEqual([true, false]);
    expect([isRaid(meetup), isTimed(meetup)]).toEqual([false, true]);
  });

  it('names each kind for a sentence', () => {
    expect(partyWord(raid)).toBe('raid');
    expect(partyWord(meetup)).toBe('meetup');
    expect(partyWord({ type: 'train' })).toBe('train');
  });

  it('lets members take part in a meetup remotely', () => {
    expect(remoteAllowed(meetup)).toBe(true);
    expect(remoteAllowed(testRaid({ tier: { level: 'Elite', shadow: false } }))).toBe(false);
    const limits = attendanceLimits({ maximumAdditionalAttendees: 5 });
    const remote = setRemote(testMeetup(), ALICE, true, {}, limits);
    expect(remote.ok && remote.party.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Interested,
      remote: true,
    });
  });
});
```

Apply to `src/domain/party/party-state.test.ts`:

```diff
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -4,11 +4,19 @@ import {
   BOB,
   PARTY_NOW,
   REPORTER,
+  testMeetup,
   testRaid,
   withAttendees,
 } from '../../../test/support/parties.js';
 import { partyFromStored, partyMirrors, partyState, type PartyColumns } from './party-state.js';
-import type { MirrorMessage, RaidParty } from './party.js';
+import {
+  MAX_MEETUP_DESCRIPTION,
+  MAX_PARTY_NAME,
+  type MeetupParty,
+  type MirrorMessage,
+  type Party,
+  type RaidParty,
+} from './party.js';
 import { PartyStatus } from './status.js';
 
 /** A raid with everything a state document can hold. */
@@ -48,19 +56,46 @@ function fullRaid(): RaidParty {
   };
 }
 
-function columnsOf(party: RaidParty): PartyColumns {
+function columnsOf(party: Party): PartyColumns {
   const {
     anonymous: _a,
     attendees: _b,
     groups: _c,
     defaultGroupId: _d,
-    raid: _e,
     prompts: _f,
-    ...columns
+    ...rest
   } = party;
+  // The parts of its kind (`raid`, `timed`, `meetup`) are in the document, not in a column.
+  const columns = Object.fromEntries(
+    Object.entries(rest).filter(([key]) => !['raid', 'timed', 'meetup'].includes(key)),
+  ) as PartyColumns;
   return { ...columns, mirrorMessages: [] };
 }
 
+/** A meetup with everything a state document can hold for one. */
+function fullMeetup(): MeetupParty {
+  const meetup = withAttendees(testMeetup(), {
+    [ALICE]: {
+      status: PartyStatus.Present,
+      number: 3,
+      remote: true,
+      name: 'Alice',
+      team: 'mystic',
+    },
+  });
+  return {
+    ...meetup,
+    endTime: PARTY_NOW + 7_200_000,
+    lastPossibleTime: PARTY_NOW + 7_200_000,
+    prompts: { completion: [], warning: '300000000000000004' },
+    mirrorMessages: [
+      { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'status' },
+    ],
+    timed: { name: 'Community Day picnic', startTime: PARTY_NOW + 3_600_000 },
+    meetup: { description: 'Bring snacks.\nWe meet at the fountain.' },
+  };
+}
+
 /**
  * What MySQL hands back for a JSON column: the document, parsed, with the keys of every object
  * sorted (MySQL keeps them by length, then by bytes).
@@ -90,7 +125,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(3);
+    expect(state.v).toBe(4);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -127,7 +162,7 @@ describe('party state', () => {
       return result.ok ? 'read' : result.problem;
     };
     expect(problem(state, { ...columns, type: 'train' })).toBe('a party of type "train"');
-    expect(problem({ ...state, v: 4 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 5 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -172,6 +207,119 @@ describe('party state', () => {
     expect(failed).toMatchObject({ ok: false, id: raid.id });
   });
 
+  it('brings a meetup back from storage exactly as it went in', () => {
+    const meetup = fullMeetup();
+    const back = partyFromStored(
+      columnsOf(meetup),
+      stored(partyState(meetup)),
+      stored(meetup.mirrorMessages),
+    );
+    expect(back).toEqual({ ok: true, party: meetup });
+  });
+
+  it('stores the parts of a meetup in the place of that of a raid', () => {
+    const state = partyState(fullMeetup());
+    expect(Object.keys(state).sort()).toEqual([
+      'anonymous',
+      'attendees',
+      'defaultGroupId',
+      'groups',
+      'meetup',
+      'prompts',
+      'timed',
+      'v',
+    ]);
+    // What a train will have too, and what only a meetup has.
+    expect(state.timed).toEqual({ name: 'Community Day picnic', startTime: PARTY_NOW + 3_600_000 });
+    expect(state.meetup).toEqual({ description: 'Bring snacks.\nWe meet at the fountain.' });
+    // A meetup that was just made: no description, no start.
+    const fresh = partyState(testMeetup());
+    expect(fresh.timed).toEqual({ name: 'Community Day picnic', startTime: null });
+    expect(fresh.meetup).toEqual({ description: null });
+  });
+
+  it('reports a row whose document is not of the kind its type says', () => {
+    const raid = fullRaid();
+    const meetup = fullMeetup();
+    const raidState = stored(partyState(raid)) as Record<string, unknown>;
+    const meetupState = stored(partyState(meetup)) as Record<string, unknown>;
+    const problem = (columns: PartyColumns, state: unknown): string => {
+      const result = partyFromStored(columns, state, []);
+      return result.ok ? 'read' : result.problem;
+    };
+    expect(problem(columnsOf(meetup), raidState)).toBe('a meetup without its name and start');
+    expect(problem(columnsOf(raid), meetupState)).toBe('a raid without its raid details');
+    const { timed, meetup: details } = meetupState;
+    expect(problem(columnsOf(meetup), { ...meetupState, timed: undefined })).toBe(
+      'a meetup without its name and start',
+    );
+    expect(problem(columnsOf(meetup), { ...meetupState, meetup: undefined })).toBe(
+      'a meetup without its meetup details',
+    );
+    expect(problem(columnsOf(raid), { ...raidState, timed })).toBe(
+      'a raid with a name and a start of its own',
+    );
+    expect(problem(columnsOf(raid), { ...raidState, meetup: details })).toBe(
+      'a raid with the details of a meetup',
+    );
+    expect(problem(columnsOf(meetup), { ...raidState, timed, meetup: details })).toBe(
+      'a meetup with the details of a raid',
+    );
+    // What only a raid has in its columns.
+    expect(problem({ ...columnsOf(meetup), gymId: 1 }, meetupState)).toBe('a meetup with a gym');
+    expect(problem({ ...columnsOf(meetup), hatchTime: PARTY_NOW }, meetupState)).toBe(
+      'a meetup with a hatch time',
+    );
+    expect(problem({ ...columnsOf(meetup), type: 'train' }, meetupState)).toBe(
+      'a party of type "train"',
+    );
+  });
+
+  it('refuses the details of a meetup that no meetup can have', () => {
+    const meetup = fullMeetup();
+    const state = stored(partyState(meetup)) as Record<string, unknown>;
+    const problem = (timed: object, details: object = {}): string => {
+      const result = partyFromStored(
+        columnsOf(meetup),
+        {
+          ...state,
+          timed: { ...meetup.timed, ...timed },
+          meetup: { ...meetup.meetup, ...details },
+        },
+        [],
+      );
+      return result.ok ? 'read' : result.problem;
+    };
+    expect(problem({})).toBe('read');
+    expect(problem({ name: '' })).toMatch(/^state: /);
+    expect(problem({ name: 'x'.repeat(MAX_PARTY_NAME) })).toBe('read');
+    expect(problem({ name: 'x'.repeat(MAX_PARTY_NAME + 1) })).toMatch(/^state: /);
+    expect(problem({ startTime: 1.5 })).toMatch(/^state: /);
+    expect(problem({ startTime: undefined })).toMatch(/^state: /);
+    expect(problem({}, { description: '' })).toMatch(/^state: /);
+    expect(problem({}, { description: 'x'.repeat(MAX_MEETUP_DESCRIPTION) })).toBe('read');
+    expect(problem({}, { description: 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1) })).toMatch(
+      /^state: /,
+    );
+  });
+
+  it('reads a version 3 document, which is always a raid', () => {
+    const raid = fullRaid();
+    const old = stored({ ...partyState(raid), v: 3 });
+    expect(partyFromStored(columnsOf(raid), old, stored(raid.mirrorMessages))).toEqual({
+      ok: true,
+      party: raid,
+    });
+    // Version 3 knew no meetups: such a row is not read as one.
+    const meetup = fullMeetup();
+    const impossible = stored({ ...partyState(meetup), v: 3 });
+    expect(partyFromStored(columnsOf(meetup), impossible, [])).toEqual({
+      ok: false,
+      id: meetup.id,
+      problem: 'a meetup without its name and start',
+    });
+  });
+
   it('reads a version 1 document as a party without names, teams and prompts', () => {
     const raid = withAttendees(testRaid(), { [ALICE]: { number: 2 } });
     const { prompts: _prompts, ...rest } = partyState(raid);
@@ -334,5 +482,14 @@ describe('writing a party state', () => {
   it('accepts every party the readers can read', () => {
     expect(() => partyState(fullRaid())).not.toThrow();
     expect(() => partyState(testRaid())).not.toThrow();
+    expect(() => partyState(fullMeetup())).not.toThrow();
+    expect(() => partyState(testMeetup())).not.toThrow();
+  });
+
+  it('throws for a meetup whose name could not be read back', () => {
+    const meetup = fullMeetup();
+    const nameless: MeetupParty = { ...meetup, timed: { ...meetup.timed, name: '' } };
+    expect(() => partyState(nameless)).toThrow(meetup.id);
+    expect(() => partyState(nameless)).toThrow(/name/);
   });
 });
```

Apply to `src/domain/party/raid.test.ts`:

```diff
--- a/src/domain/party/raid.test.ts
+++ b/src/domain/party/raid.test.ts
@@ -13,6 +13,7 @@ import {
 } from '../../../test/support/parties.js';
 import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
 import type { RaidBoss } from '../pogo/raid-bosses.js';
+import { setSaved } from './party.js';
 import type { RaidBossRef } from './party.js';
 import {
   blocksNewRaid,
@@ -25,7 +26,6 @@ import {
   setHatchedDuration,
   setHatchTime,
   setMoveset,
-  setSaved,
 } from './raid.js';
 import { PartyStatus } from './status.js';
 
```

Apply to `src/domain/party/relocate.test.ts`:

```diff
--- a/src/domain/party/relocate.test.ts
+++ b/src/domain/party/relocate.test.ts
@@ -11,8 +11,9 @@ import {
   withAttendees,
 } from '../../../test/support/parties.js';
 import { setMeetingTime } from './attendance.js';
+import { setSaved } from './party.js';
 import type { RaidParty } from './party.js';
-import { setHatchTime, setSaved } from './raid.js';
+import { setHatchTime } from './raid.js';
 import { carriedOver, relocatedRaid } from './relocate.js';
 import { PartyStatus } from './status.js';
 
```

Apply to `src/domain/party/tick.test.ts`:

```diff
--- a/src/domain/party/tick.test.ts
+++ b/src/domain/party/tick.test.ts
@@ -14,10 +14,11 @@ import { catalogueFixture } from '../../../test/support/game-data.js';
 import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
 import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
 import { loadSettings } from '../../config/settings.js';
+import { setSaved, endParty } from './party.js';
 import type { RaidParty } from './party.js';
-import { setEndTime, setHatchTime, setSaved } from './raid.js';
+import { setEndTime, setHatchTime } from './raid.js';
 import { PartyStatus } from './status.js';
-import { endParty, partyTick, tickAutoset, type TickInput } from './tick.js';
+import { partyTick, tickAutoset, type TickInput } from './tick.js';
 
 const rules = testRaidRules();
 /** Start-clear 10, grace 5, warning 10, completion timeout 5 minutes. */
```

Create `src/domain/party/timed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PARTY_NOW, testMeetup } from '../../../test/support/parties.js';
import { MAX_PARTY_NAME, type MeetupParty } from './party.js';
import { latestTime, nameOf, OPEN_PARTY_HOURS, settled, startTimeOf, tidyName } from './timed.js';

const HOUR = 3_600_000;
const DAY = OPEN_PARTY_HOURS * HOUR;

/** The test meetup with these times, as they are stored (nothing is brought up to date). */
function withTimes(startTime: number | null, endTime: number | null): MeetupParty {
  const meetup = testMeetup();
  return { ...meetup, endTime, timed: { ...meetup.timed, startTime } };
}

describe('tidyName', () => {
  it('keeps a name on one line with single spaces', () => {
    expect(tidyName('  Raid \n hour\tmeet ')).toBe('Raid hour meet');
  });

  it('knows no name in white space, nor in a text that is too long', () => {
    expect(tidyName('')).toBeUndefined();
    expect(tidyName(' \n\t ')).toBeUndefined();
    expect(tidyName('x'.repeat(MAX_PARTY_NAME))).toHaveLength(MAX_PARTY_NAME);
    expect(tidyName('x'.repeat(MAX_PARTY_NAME + 1))).toBeUndefined();
    // What counts is the length once it is tidied.
    expect(tidyName(`${'x'.repeat(MAX_PARTY_NAME)}   `)).toHaveLength(MAX_PARTY_NAME);
  });

  it('drops what cannot be seen: a name of zero-width spaces is no name', () => {
    expect(tidyName('\u200b')).toBeUndefined();
    expect(tidyName(' \u200b\ufeff \u2060 ')).toBeUndefined();
    expect(tidyName('Pic\u200bnic\u0007')).toBe('Picnic');
    // Such characters do not count towards the length either.
    expect(tidyName(`${'x'.repeat(MAX_PARTY_NAME)}\u200b\u200b`)).toHaveLength(MAX_PARTY_NAME);
  });

  it('drops a direction override, which would turn the title of the post around', () => {
    expect(tidyName('\u202ecinciP')).toBe('cinciP');
    expect(tidyName('a\u202db\u2066c\u2069d\u200ee\u200f')).toBe('abcde');
  });

  it('keeps the joiner that emoji are built with, and what is left of white space as one space', () => {
    const family = '\ud83d\udc69\u200d\ud83d\udc67';
    expect(tidyName(`${family} picnic`)).toBe(`${family} picnic`);
    expect(tidyName('a \u200b b')).toBe('a b');
  });
});

describe('what a timed party has', () => {
  it('gives its name and its start', () => {
    expect(nameOf(testMeetup({ name: 'Picnic' }))).toBe('Picnic');
    expect(startTimeOf(testMeetup())).toBeNull();
    expect(startTimeOf(withTimes(PARTY_NOW + HOUR, null))).toBe(PARTY_NOW + HOUR);
  });
});

describe('latestTime', () => {
  it('is the end time when there is one, whatever the start and whenever it is asked', () => {
    expect(latestTime(withTimes(null, PARTY_NOW + 2 * HOUR), PARTY_NOW)).toBe(PARTY_NOW + 2 * HOUR);
    expect(latestTime(withTimes(PARTY_NOW + HOUR, PARTY_NOW + 2 * HOUR), PARTY_NOW + 9 * DAY)).toBe(
      PARTY_NOW + 2 * HOUR,
    );
  });

  it('is a day after the start for a party without an end, whenever it is asked', () => {
    expect(OPEN_PARTY_HOURS).toBe(24);
    const open = withTimes(PARTY_NOW + 5 * HOUR, null);
    expect(latestTime(open, PARTY_NOW)).toBe(PARTY_NOW + 5 * HOUR + DAY);
    expect(latestTime(open, PARTY_NOW + 9 * DAY)).toBe(PARTY_NOW + 5 * HOUR + DAY);
  });

  it('is a day after it was made for a party that never had a time', () => {
    expect(latestTime(withTimes(null, null), PARTY_NOW)).toBe(PARTY_NOW + DAY);
  });

  it('is a day from now for a party that has no time left: not the day it was made', () => {
    expect(latestTime(withTimes(null, null), PARTY_NOW + 3 * DAY)).toBe(PARTY_NOW + 4 * DAY);
    // Never less than a day from when it was made.
    expect(latestTime(withTimes(null, null), PARTY_NOW - HOUR)).toBe(PARTY_NOW + DAY);
  });
});

describe('settled', () => {
  it('records the latest time', () => {
    const meetup = settled(withTimes(PARTY_NOW + HOUR, null), PARTY_NOW);
    expect(meetup.lastPossibleTime).toBe(PARTY_NOW + HOUR + DAY);
  });

  it('lets an archiving stand while the party is still over', () => {
    const late = PARTY_NOW + 3 * HOUR;
    const warned = { ...withTimes(PARTY_NOW, PARTY_NOW + HOUR), deletionTime: late + HOUR };
    expect(settled(warned, late).deletionTime).toBe(late + HOUR);
  });

  it('calls off an archiving once the party turns out to be still going on', () => {
    const late = PARTY_NOW + DAY + 1;
    const warned = { ...withTimes(null, null), deletionTime: PARTY_NOW + DAY + HOUR };
    // Somebody set a start for next week: it is no longer over.
    const later = { ...warned, timed: { ...warned.timed, startTime: PARTY_NOW + 7 * DAY } };
    expect(settled(later, late)).toMatchObject({
      deletionTime: null,
      lastPossibleTime: PARTY_NOW + 8 * DAY,
    });
  });
});
```

Apply to `src/render/summary.test.ts`:

```diff
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -8,9 +8,9 @@ import {
   testRaidRules,
   withAttendees,
 } from '../../test/support/parties.js';
+import { endParty } from '../domain/party/party.js';
 import type { RaidParty } from '../domain/party/party.js';
 import { setEndTime, setHatchTime } from '../domain/party/raid.js';
-import { endParty } from '../domain/party/tick.js';
 import { renderRegionLink, renderSummary, type ListedRaid } from './summary.js';
 
 const rules = testRaidRules();
```

Apply to `src/services/attendance-service.test.ts`:

```diff
--- a/src/services/attendance-service.test.ts
+++ b/src/services/attendance-service.test.ts
@@ -4,8 +4,7 @@ import { reportedRaid } from '../../test/support/party-service.js';
 import { decodeCustomId } from '../discord/custom-id.js';
 import { completeRaid } from '../domain/party/attendance.js';
 import { WITHDRAWN_LINE } from './attendance-service.js';
-import { attendeeOf } from '../domain/party/party.js';
-import { endParty } from '../domain/party/tick.js';
+import { attendeeOf, endParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
 
```

Apply to `src/services/party-lifecycle.db.test.ts`:

```diff
--- a/src/services/party-lifecycle.db.test.ts
+++ b/src/services/party-lifecycle.db.test.ts
@@ -1,7 +1,7 @@
 import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../test/support/migrated-db.js';
-import { ALICE, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
+import { ALICE, asRaid, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
 import { EAST_FORUM, REMOTE_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import {
   gatewayWithMirrorChannels,
@@ -102,7 +102,7 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     const second = await restarted(first);
     const loaded = second.store.get(id);
     expect(loaded).toEqual(first.store.get(id));
-    expect(loaded?.raid).toMatchObject({
+    expect(asRaid(loaded).raid).toMatchObject({
       boss: { key: 'yveltal' },
       fastMove: 'SNARL_FAST',
       hatchedDuration: 50,
@@ -125,7 +125,7 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     await second.attendance.flush();
     await second.service.flush();
     const caughtUp = second.store.get(id);
-    expect(caughtUp?.raid.stageSeen).toBe('ended');
+    expect(asRaid(caughtUp).raid.stageSeen).toBe('ended');
     expect(attendeeOf(caughtUp ?? outcome.party, BOB)?.status).toBe(PartyStatus.Complete);
     expect(caughtUp?.prompts.completion).toEqual([]);
     expect(caughtUp?.prompts.warning).not.toBeNull();
```

Apply to `src/services/party-mirrors.test.ts`:

```diff
--- a/src/services/party-mirrors.test.ts
+++ b/src/services/party-mirrors.test.ts
@@ -1,7 +1,7 @@
 import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
 import { EX_CHANNEL, REMOTE_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
-import { ALICE, at, MINUTE } from '../../test/support/parties.js';
+import { ALICE, asRaid, at, MINUTE } from '../../test/support/parties.js';
 import {
   gatewayWithMirrorChannels,
   reportedRaid,
@@ -110,7 +110,7 @@ describe('the copies of a raid in other channels', () => {
     const { gateway, store, service } = made;
     const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
     await store.update(made.party.id, (party) =>
-      setBoss(party, { tier: ELITE, boss: null }, service.rules(), made.clock.now),
+      setBoss(asRaid(party), { tier: ELITE, boss: null }, service.rules(), made.clock.now),
     );
     service.changed(made.party.id);
     await service.flush();
@@ -123,7 +123,7 @@ describe('the copies of a raid in other channels', () => {
     const made = await mirrored(yveltal, { gyms: gymsWithExLibrary() });
     const { gateway, store, service, clock } = made;
     await store.update(made.party.id, (party) => ({
-      party: setEndTime(party, at('2026-10-13T14:20'), service.rules(), clock.now),
+      party: setEndTime(asRaid(party), at('2026-10-13T14:20'), service.rules(), clock.now),
     }));
     service.changed(made.party.id);
     await service.flush();
@@ -374,7 +374,7 @@ describe('the copies of a raid: what can go wrong on the way', () => {
     const made = await mirrored(yveltal, NO_DELAY);
     const { gateway, service, attendance, store, clock } = made;
     await store.update(made.party.id, (party) => ({
-      party: setEndTime(party, at('2026-10-13T14:05'), service.rules(), clock.now),
+      party: setEndTime(asRaid(party), at('2026-10-13T14:05'), service.rules(), clock.now),
     }));
     service.changed(made.party.id);
     await service.flush();
@@ -410,7 +410,7 @@ describe('the copies of a raid: what can go wrong on the way', () => {
     const made = await mirrored(yveltal, NO_DELAY);
     const { gateway, service, store, clock, entries } = made;
     await store.update(made.party.id, (party) => ({
-      party: setEndTime(party, at('2026-10-13T14:20'), service.rules(), clock.now),
+      party: setEndTime(asRaid(party), at('2026-10-13T14:20'), service.rules(), clock.now),
     }));
     service.changed(made.party.id);
     await service.flush();
@@ -653,8 +653,8 @@ describe('the link line in the region channel', () => {
     expect(link?.message.content).toBe(`New raid: <#${postId}>`);
     await store.update(made.party.id, (party) =>
       setBoss(
-        party,
-        { tier: party.raid.tier, boss: { key: 'yveltal' } },
+        asRaid(party),
+        { tier: asRaid(party).raid.tier, boss: { key: 'yveltal' } },
         service.rules(),
         made.clock.now,
       ),
@@ -670,8 +670,8 @@ describe('the link line in the region channel', () => {
     gateway.gone.add(gateway.messagesIn(WEST_CHANNEL)[0]?.id ?? '');
     await store.update(made.party.id, (party) =>
       setBoss(
-        party,
-        { tier: party.raid.tier, boss: { key: 'yveltal' } },
+        asRaid(party),
+        { tier: asRaid(party).raid.tier, boss: { key: 'yveltal' } },
         service.rules(),
         made.clock.now,
       ),
```

Apply to `src/services/party-scheduler.test.ts`:

```diff
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it, vi } from 'vitest';
 import { WEST_FORUM } from '../../test/support/gyms.js';
-import { ALICE, at, BOB, CAROL, MINUTE } from '../../test/support/parties.js';
+import { ALICE, asRaid, at, BOB, CAROL, MINUTE } from '../../test/support/parties.js';
 import { reportedRaid, restarted } from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { setMeetingTime } from '../domain/party/attendance.js';
@@ -141,7 +141,7 @@ describe('PartyScheduler: hatch and end', () => {
     expect(warning).not.toBeNull();
     const later = END + 20 * MINUTE;
     await made.store.update(id, (party) => ({
-      party: setEndTime(party, later, made.service.rules(), made.clock.now),
+      party: setEndTime(asRaid(party), later, made.service.rules(), made.clock.now),
     }));
     expect(made.current().deletionTime).toBeNull();
     await tickAt(made, END + 7 * MINUTE);
@@ -162,7 +162,7 @@ describe('PartyScheduler: hatch and end', () => {
     // The tick is queued, and right behind it a correction of the end time.
     const ticking = made.scheduler.tick();
     const corrected = made.store.update(id, (party) => ({
-      party: setEndTime(party, END + 40 * MINUTE, made.service.rules(), made.clock.now),
+      party: setEndTime(asRaid(party), END + 40 * MINUTE, made.service.rules(), made.clock.now),
     }));
     await Promise.all([ticking, corrected]);
     await made.attendance.flush();
@@ -222,7 +222,7 @@ describe('PartyScheduler: hatch and end', () => {
     // The first party's post cannot take a line; the second must still hatch.
     made.gateway.gone.add(made.postId);
     await tickAt(made, HATCH);
-    expect(made.store.get(second.party.id)?.raid.stageSeen).toBe('hatched');
+    expect(asRaid(made.store.get(second.party.id)).raid.stageSeen).toBe('hatched');
     expect(made.gateway.posts.get(second.party.forumPostId ?? '')?.title).toBe(
       'Yveltal · Old Stone Fountain',
     );
@@ -316,7 +316,7 @@ describe('PartyScheduler: the warning in a busy post', () => {
     await chatter(made, WARN_AGAIN_AFTER - 1);
     const later = END + 30 * MINUTE;
     await made.store.update(id, (party) => ({
-      party: setEndTime(party, later, made.service.rules(), made.clock.now),
+      party: setEndTime(asRaid(party), later, made.service.rules(), made.clock.now),
     }));
     // A message while the raid runs on forgets the count.
     await chatter(made, 1);
@@ -465,7 +465,7 @@ describe('PartyScheduler: running', () => {
     const started = again.scheduler.start(waiting);
     await new Promise((resolve) => setImmediate(resolve));
     // Nothing happens before what it waits for: not a tick, not a call to Discord.
-    expect(again.store.get(made.party.id)?.raid.stageSeen).toBe('egg');
+    expect(asRaid(again.store.get(made.party.id)).raid.stageSeen).toBe('egg');
     expect(gateway.posts.get(postId)?.message).toEqual({ content: 'stale' });
     ready();
     await started;
@@ -473,7 +473,7 @@ describe('PartyScheduler: running', () => {
     await again.attendance.flush();
     await again.service.flush();
 
-    expect(again.store.get(made.party.id)?.raid.stageSeen).toBe('hatched');
+    expect(asRaid(again.store.get(made.party.id)).raid.stageSeen).toBe('hatched');
     expect(gateway.posts.get(postId)?.message.embeds).toHaveLength(1);
     expect(gateway.posts.get(postId)?.edits).toBe(1);
     expect(gateway.posts.get(open)?.archived).toBe(true);
```

Apply to `src/services/party-service.relocate.test.ts`:

```diff
--- a/src/services/party-service.relocate.test.ts
+++ b/src/services/party-service.relocate.test.ts
@@ -8,7 +8,7 @@ import {
   WEST_CHANNEL,
   WEST_FORUM,
 } from '../../test/support/gyms.js';
-import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
+import { ALICE, asRaid, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
 import {
   gatewayWithMirrorChannels,
   reportedRaid,
@@ -78,7 +78,7 @@ describe('PartyService.relocate', () => {
       endTime: before.endTime,
       attendees: before.attendees,
     });
-    expect(stored?.raid).toEqual(before.raid);
+    expect(asRaid(stored).raid).toEqual(before.raid);
     const post = made.gateway.posts.get(party.forumPostId ?? '');
     expect(post).toMatchObject({ forumId: EAST_FORUM, archived: false });
     expect(post?.title).toBe('Yveltal · Café Élan Fresco');
```

Apply to `src/services/party-service.test.ts`:

```diff
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -1,3 +1,4 @@
+import { endParty } from '../domain/party/party.js';
 import { RateLimitError } from 'discord.js';
 import { partyControls } from '../render/party-controls.js';
 import { describe, expect, it, vi } from 'vitest';
@@ -13,7 +14,7 @@ import {
 import { gymsFixture } from '../../test/support/providers.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
 import { FORUM_TAGS, renderRaidPost } from '../render/raid-post.js';
-import { ALICE, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
+import { ALICE, asRaid, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import {
   attendanceLimits,
@@ -22,7 +23,6 @@ import {
   setAttendance,
 } from '../domain/party/attendance.js';
 import { setBoss } from '../domain/party/raid.js';
-import { endParty } from '../domain/party/tick.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { RaidReport } from './party-service.js';
 
@@ -279,7 +279,7 @@ describe('PartyService: keeping posts up to date', () => {
     const { service, store, gateway, party, postId, tags, clock } = await withRaid();
     clock.now = at('2026-10-13T14:31');
     await store.update(party.id, (p) =>
-      setBoss(p, { tier: T5, boss: { key: 'yveltal' } }, service.rules(), clock.now),
+      setBoss(asRaid(p), { tier: T5, boss: { key: 'yveltal' } }, service.rules(), clock.now),
     );
     service.changed(party.id);
     await service.flush();
@@ -295,7 +295,7 @@ describe('PartyService: keeping posts up to date', () => {
     const { service, store, gateway, party, postId, clock } = await withRaid();
     const name = async (key: string) => {
       await store.update(party.id, (p) =>
-        setBoss(p, { tier: T5, boss: { key } }, service.rules(), clock.now),
+        setBoss(asRaid(p), { tier: T5, boss: { key } }, service.rules(), clock.now),
       );
       service.changed(party.id);
       await service.flush();
@@ -520,7 +520,12 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
     const { service, store, gateway, party, postId, entries } = await withRaidFor();
     gateway.rejectThumbnails = true;
     await store.update(party.id, (p) =>
-      setBoss(p, { tier: T5, boss: { key: 'yveltal' } }, service.rules(), at('2026-10-13T14:31')),
+      setBoss(
+        asRaid(p),
+        { tier: T5, boss: { key: 'yveltal' } },
+        service.rules(),
+        at('2026-10-13T14:31'),
+      ),
     );
     service.changed(party.id);
     await service.flush();
@@ -628,7 +633,7 @@ describe('PartyService: renders, tags and the summary', () => {
     now = made.clock.now,
   ) {
     await made.store.update(made.party.id, (p) =>
-      setBoss(p, { tier: T5, boss: { key } }, made.service.rules(), now),
+      setBoss(asRaid(p), { tier: T5, boss: { key } }, made.service.rules(), now),
     );
     made.service.changed(made.party.id);
     await made.service.flush();
@@ -949,7 +954,7 @@ describe('PartyService: rate limits and unchanged posts', () => {
 
   async function nameBoss(made: Awaited<ReturnType<typeof raid>>, key: string) {
     await made.store.update(made.party.id, (p) =>
-      setBoss(p, { tier: T5, boss: { key } }, made.service.rules(), made.clock.now),
+      setBoss(asRaid(p), { tier: T5, boss: { key } }, made.service.rules(), made.clock.now),
     );
     made.service.changed(made.party.id);
     await made.service.flush();
@@ -1037,7 +1042,12 @@ describe('PartyService: rate limits and unchanged posts', () => {
     made.gateway.renameLater.set(postId, 30_000);
     made.clock.now = at('2026-10-13T14:31');
     await made.store.update(outcome.party.id, (p) =>
-      setBoss(p, { tier: T5, boss: { key: 'yveltal' } }, made.service.rules(), made.clock.now),
+      setBoss(
+        asRaid(p),
+        { tier: T5, boss: { key: 'yveltal' } },
+        made.service.rules(),
+        made.clock.now,
+      ),
     );
     made.service.changed(outcome.party.id);
     await made.service.flush();
@@ -1058,7 +1068,12 @@ describe('PartyService: rate limits and unchanged posts', () => {
     made.gateway.renameLater.set(postId, 120_000);
     made.clock.now = at('2026-10-13T14:31');
     await made.store.update(outcome.party.id, (p) =>
-      setBoss(p, { tier: T5, boss: { key: 'yveltal' } }, made.service.rules(), made.clock.now),
+      setBoss(
+        asRaid(p),
+        { tier: T5, boss: { key: 'yveltal' } },
+        made.service.rules(),
+        made.clock.now,
+      ),
     );
     made.service.changed(outcome.party.id);
     await made.service.flush();
@@ -1129,7 +1144,7 @@ describe('PartyService: rate limits and unchanged posts', () => {
     const rendered = () => {
       const party = made.store.get(made.party.id);
       if (!party) throw new Error('the raid is gone');
-      return renderRaidPost(made.service.view(party)).message.components;
+      return renderRaidPost(made.service.view(asRaid(party))).message.components;
     };
     expect(components()).toEqual(partyControls(made.party));
     expect(components()).toHaveLength(2);
```

Apply to `src/services/party-store.test.ts`:

```diff
--- a/src/services/party-store.test.ts
+++ b/src/services/party-store.test.ts
@@ -8,15 +8,16 @@ import {
   PARTY_NOW,
   partyStoreWith,
   REPORTER,
+  testMeetup,
   testRaid,
   testRaidRules,
 } from '../../test/support/parties.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { attendanceLimits, leaveParty, setAttendance } from '../domain/party/attendance.js';
+import { endParty } from '../domain/party/party.js';
 import type { Party, RaidParty } from '../domain/party/party.js';
 import { setEndTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { endParty } from '../domain/party/tick.js';
 import { PartyStore } from './party-store.js';
 
 const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;
@@ -47,6 +48,40 @@ describe('PartyStore', () => {
     expect(entries.at(-1)).toMatchObject({ msg: 'parties loaded', parties: 2, unreadable: 0 });
   });
 
+  it('keeps meetups beside raids, and never takes one for the raid at a gym', async () => {
+    const raid = testRaid({ id: ID(1) });
+    const meetup = testMeetup({ id: ID(2), now: PARTY_NOW + MINUTE });
+    const { store, storage } = await partyStoreWith([raid]);
+    await store.add({ ...meetup, forumPostId: '300000000000000002' });
+
+    expect(store.active().map((party) => party.type)).toEqual(['raid', 'meetup']);
+    expect(store.byPost('300000000000000002')?.id).toBe(ID(2));
+    expect(store.inRegion(1).map((party) => party.id)).toEqual([ID(1), ID(2)]);
+    expect(store.raidAt(1, 'standard', PARTY_NOW)?.id).toBe(ID(1));
+
+    // A change of a meetup is written like any other, with the details of a meetup.
+    const joined = await store.update(ID(2), join(ALICE));
+    expect(joined).toMatchObject({ ok: true, written: true, party: { type: 'meetup' } });
+    expect(storage.rows.get(ID(2))).toMatchObject({
+      type: 'meetup',
+      timed: { name: 'Community Day picnic' },
+      attendees: { [ALICE]: { status: PartyStatus.Coming } },
+    });
+  });
+
+  it('refuses a change that would make a party another kind of party', async () => {
+    const raid = testRaid({ id: ID(1) });
+    const { store, storage } = await partyStoreWith([raid]);
+    const { timed, meetup } = testMeetup({ id: ID(1) });
+    await expect(
+      store.update(ID(1), (party) => ({
+        party: { ...party, type: 'meetup', gymId: null, hatchTime: null, timed, meetup },
+      })),
+    ).rejects.toThrow(`A change of raid ${ID(1)} returned a meetup`);
+    expect(store.get(ID(1))).toBe(raid);
+    expect(storage.writes).toEqual([]);
+  });
+
   it('logs rows it cannot read and carries on without them', async () => {
     const storage = new MemoryPartyStorage([testRaid()]);
     storage.listActive = () =>
```

Apply to `src/services/raid-change-service.test.ts`:

```diff
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -1,7 +1,16 @@
 import { describe, expect, it } from 'vitest';
 import { EAST_FORUM, WEST_CHANNEL } from '../../test/support/gyms.js';
-import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
-import { reportedRaid } from '../../test/support/party-service.js';
+import {
+  ALICE,
+  asRaid,
+  at,
+  BOB,
+  CAROL,
+  MINUTE,
+  REPORTER,
+  testMeetup,
+} from '../../test/support/parties.js';
+import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { certainMoves } from '../domain/party/raid.js';
@@ -43,6 +52,28 @@ async function secondRaid(made: Made, gymId: number, report: Partial<RaidReport>
   return outcome.party;
 }
 
+describe('RaidChangeService: a party that is no raid', () => {
+  it('answers gone and leaves the party alone: there is no such raid', async () => {
+    const meetup = { ...testMeetup(), forumPostId: '300000000000000077' };
+    const made = await partyServiceWith([meetup]);
+    const gym = gymsFixture().get(2);
+    if (!gym) throw new Error('no gym');
+    const gone = { kind: 'gone' };
+    expect(await made.raids.setHatchTime(meetup.id, alice, HATCH)).toEqual(gone);
+    expect(await made.raids.setEndTime(meetup.id, alice, END)).toEqual(gone);
+    expect(await made.raids.setDuration(meetup.id, alice, 30)).toEqual(gone);
+    expect(
+      await made.raids.setBoss(meetup.id, alice, { tier: T5, boss: null, label: 'T5 egg' }),
+    ).toEqual(gone);
+    expect(await made.raids.setMoveset(meetup.id, alice, { fastMove: 'SNARL_FAST' })).toEqual(gone);
+    expect(await made.raids.setGym(meetup.id, alice, gym.id)).toEqual(gone);
+    expect(made.store.get(meetup.id)).toBe(meetup);
+    expect(made.storage.writes).toEqual([]);
+    await made.attendance.flush();
+    expect(made.gateway.messagesIn('300000000000000077')).toEqual([]);
+  });
+});
+
 describe('RaidChangeService: times', () => {
   it('sets the hatch time, the end with it, shows the post anew and says who did it', async () => {
     const made = await reportedRaid();
@@ -567,7 +598,7 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     const made = await reportedRaid({ time: { hatch: HATCH } });
     // Two raids at one gym, as only a fault could leave them.
     const twin = await secondRaid(made, 2, { time: { hatch: HATCH } });
-    await made.store.update(twin.id, (party) => ({ party: { ...party, gymId: 1 } }));
+    await made.store.update(twin.id, (party) => ({ party: { ...asRaid(party), gymId: 1 } }));
     expect(await made.raids.setHatchTime(made.party.id, alice, HATCH + MINUTE)).toMatchObject({
       kind: 'ok',
       changed: true,
```

Apply to `test/support/parties.ts`:

```diff
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -3,7 +3,8 @@ import { DateTime } from 'luxon';
 import { loadSettings } from '../../src/config/settings.js';
 import type { PartyList, PartyStorage } from '../../src/db/repositories/party-repository.js';
 import { partyFromStored, partyMirrors, partyState } from '../../src/domain/party/party-state.js';
-import type { Attendee, Party, RaidParty } from '../../src/domain/party/party.js';
+import { createMeetup, type NewMeetup } from '../../src/domain/party/meetup.js';
+import type { Attendee, MeetupParty, Party, RaidParty } from '../../src/domain/party/party.js';
 import { createRaid, type NewRaid } from '../../src/domain/party/raid.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import { raidDurationRules, type RaidDurationRules } from '../../src/domain/time/raid-durations.js';
@@ -78,11 +79,35 @@ export function testRaid(
   );
 }
 
-/** The raid with these attendees added or replaced; each defaults to coming, alone, group A. */
-export function withAttendees(
-  party: RaidParty,
+/**
+ * A meetup called "Community Day picnic" in region 1, made at `PARTY_NOW` by `REPORTER`, who is
+ * signed up as interested. It has no times, and nothing of it exists on Discord yet.
+ */
+export function testMeetup(overrides: Partial<NewMeetup> = {}): MeetupParty {
+  const made = createMeetup({
+    id: '00000000-0000-4000-8000-000000000002',
+    guildId: 1,
+    regionId: 1,
+    createdById: REPORTER,
+    name: 'Community Day picnic',
+    now: PARTY_NOW,
+    ...overrides,
+  });
+  if (!made.ok) throw new Error(`bad test meetup: ${made.reason}`);
+  return made.party;
+}
+
+/** The party as the raid it is, for a test that reads or changes what only a raid has. */
+export function asRaid(party: Party | undefined): RaidParty {
+  if (party?.type !== 'raid') throw new Error(`not a raid: ${party?.type ?? 'no party'}`);
+  return party;
+}
+
+/** The party with these attendees added or replaced; each defaults to coming, alone, group A. */
+export function withAttendees<P extends Party>(
+  party: P,
   attendees: Record<string, Partial<Attendee>>,
-): RaidParty {
+): P {
   const added: Record<string, Attendee> = {};
   for (const [memberId, attendee] of Object.entries(attendees)) {
     added[memberId] = {
@@ -99,7 +124,11 @@ export function withAttendees(
 /** Throws unless the party reads back from its stored form exactly as it is. */
 function survivesStorage(party: Party): void {
   const { anonymous: _anonymous, attendees: _attendees, groups: _groups, ...rest } = party;
-  const { defaultGroupId: _defaultGroupId, raid: _raid, ...columns } = rest;
+  const { defaultGroupId: _defaultGroupId, prompts: _prompts, ...kept } = rest;
+  // The details of its kind are in the document, the rest are the columns.
+  const columns = Object.fromEntries(
+    Object.entries(kept).filter(([key]) => !['raid', 'timed', 'meetup'].includes(key)),
+  ) as typeof kept;
   const document: unknown = JSON.parse(JSON.stringify(partyState(party)));
   const mirrors: unknown = JSON.parse(JSON.stringify(partyMirrors(party)));
   const back = partyFromStored(columns, document, mirrors);
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -13,7 +13,7 @@ import { AccessService } from '../../src/services/access-service.js';
 import { PartyLines } from '../../src/services/party-lines.js';
 import { PartyScheduler } from '../../src/services/party-scheduler.js';
 import { AttendanceService } from '../../src/services/attendance-service.js';
-import type { Party } from '../../src/domain/party/party.js';
+import { isRaid, type Party, type RaidParty } from '../../src/domain/party/party.js';
 import { FORUM_TAGS } from '../../src/render/raid-post.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import {
@@ -296,10 +296,10 @@ export async function reportedRaid(
   await made.service.flush();
   const postId = outcome.party.forumPostId;
   if (postId === null) throw new Error('the raid has no post');
-  /** The party as it is stored now. */
-  const current = (): Party => {
+  /** The raid as it is stored now. */
+  const current = (): RaidParty => {
     const party = made.store.get(outcome.party.id);
-    if (!party) throw new Error('the raid is no longer active');
+    if (!party || !isRaid(party)) throw new Error('the raid is no longer active');
     return party;
   };
   /** The texts of the messages in the post that were not deleted, oldest first. */
```

Run: `npx vitest run --project unit src/commands/parties/attendance.test.ts src/commands/raids/raid-only.test.ts src/components/party.test.ts src/discord/guards.test.ts src/domain/party/meetup.test.ts src/domain/party/party-state.test.ts src/domain/party/raid.test.ts src/domain/party/relocate.test.ts src/domain/party/tick.test.ts src/domain/party/timed.test.ts src/render/summary.test.ts src/services/attendance-service.test.ts src/services/party-mirrors.test.ts src/services/party-scheduler.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-store.test.ts src/services/raid-change-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/parties/meet.ts`:

```diff
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -7,7 +7,7 @@ import { timestamp } from '../../render/text.js';
 import { IN_A_RAID_POST } from '../raids/change.js';
 import { typedPartyTime } from '../raids/raid-input.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { actingMember, answerOutcome, commandParty } from './reply.js';
+import { actingMember, answerOutcome, commandParty, commandRaid } from './reply.js';
 
 /**
  * Tighter than the other attendance commands: every change of a meeting time is a message that
@@ -38,7 +38,7 @@ export const meet: SimpleCommand = {
   guards: [requireParty],
   throttle: MEET_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandParty(interaction, ctx);
+    const party = commandRaid(interaction, ctx);
     const text = interaction.options.getString('time', true);
     const typed = typedPartyTime(ctx, party, 'meet', text, Date.now());
     const outcome = await ctx.attendance.setMeetingTime(
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -6,15 +6,17 @@ import {
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf } from '../../discord/guards.js';
+import { notARaid, partyOf } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import {
   headCount,
   isGroupId,
+  isRaid,
   type Attendee,
   type GroupId,
   type Party,
+  type RaidParty,
 } from '../../domain/party/party.js';
 import { problemText, standingReply } from '../../render/activity.js';
 import { truncate } from '../../render/text.js';
@@ -45,6 +47,16 @@ export function commandParty(interaction: ChatInputCommandInteraction, ctx: AppC
   return party;
 }
 
+/**
+ * The raid of the post a command was used in. The guard `requireRaid` has checked it; like
+ * `commandParty` this copes with a raid that ended in between.
+ */
+export function commandRaid(interaction: ChatInputCommandInteraction, ctx: AppContext): RaidParty {
+  const party = commandParty(interaction, ctx);
+  if (!isRaid(party)) throw new UserError(notARaid(party));
+  return party;
+}
+
 const NO_SUCH_GROUP = 'This raid has no such group.';
 
 /**
```

Apply to `src/commands/raids/boss.ts`:

```diff
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -2,12 +2,12 @@ import { SlashCommandBuilder, type AutocompleteInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, requireParty } from '../../discord/guards.js';
+import { raidOf, requireRaid } from '../../discord/guards.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { matchNamed } from '../../domain/search/word-match.js';
 import { problemText } from '../../render/activity.js';
 import { plain, truncate } from '../../render/text.js';
-import { commandParty } from '../parties/reply.js';
+import { commandRaid } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
 import { bossChoices, MAX_CHOICES, reportedBoss } from './raid-input.js';
 
@@ -31,10 +31,10 @@ export const boss: SimpleCommand = {
       `one charged move gets it set. ${IN_A_RAID_POST}`,
     examples: ['/boss pokemon:yveltal', '/boss pokemon:t3'],
   },
-  guards: [requireParty],
+  guards: [requireRaid],
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandParty(interaction, ctx);
+    const party = commandRaid(interaction, ctx);
     const reported = reportedBoss(ctx, interaction.options.getString('pokemon', true));
     const outcome = await ctx.raids.setBoss(party.id, changingMember(interaction), reported);
     await answerRaidChange(
@@ -67,7 +67,7 @@ function bossEntry(
   interaction: AutocompleteInteraction,
   ctx: AppContext,
 ): PokemonEntry | undefined {
-  const party = partyOf(interaction, ctx);
+  const party = raidOf(interaction, ctx);
   return party ? ctx.partyService.view(party).boss?.entry : undefined;
 }
 
@@ -116,10 +116,10 @@ export const moveset: SimpleCommand = {
       `boss can have. ${IN_A_RAID_POST}`,
     examples: ['/moveset quick:snarl charge:dark pulse', '/moveset charge:hurricane'],
   },
-  guards: [requireParty],
+  guards: [requireRaid],
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandParty(interaction, ctx);
+    const party = commandRaid(interaction, ctx);
     const quick = interaction.options.getString('quick');
     const charge = interaction.options.getString('charge');
     if (quick === null && charge === null) {
```

Apply to `src/commands/raids/change.ts`:

```diff
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -8,7 +8,7 @@ import {
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { requireParty } from '../../discord/guards.js';
+import { requireRaid } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import type { RaidParty } from '../../domain/party/party.js';
@@ -16,7 +16,7 @@ import { problemText } from '../../render/activity.js';
 import { timestamp } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
-import { commandParty, PARTY_OVER } from '../parties/reply.js';
+import { commandRaid, PARTY_OVER } from '../parties/reply.js';
 import { typedPartyTime } from './raid-input.js';
 
 /** How often one member may change a raid: each change edits the post and says a line in it. */
@@ -124,10 +124,10 @@ function timeCommand(
       details: `${details} ${IN_A_RAID_POST}`,
       examples: [`/${name} time:20`, `/${name} time:6:15pm`],
     },
-    guards: [requireParty],
+    guards: [requireRaid],
     throttle: CHANGE_THROTTLE,
     async execute(interaction, ctx) {
-      const party = commandParty(interaction, ctx);
+      const party = commandRaid(interaction, ctx);
       await changeTime(interaction, ctx, party, name, interaction.options.getString('time', true));
     },
   };
@@ -166,10 +166,10 @@ export const duration: SimpleCommand = {
       `moves. ${IN_A_RAID_POST}`,
     examples: ['/duration minutes:30'],
   },
-  guards: [requireParty],
+  guards: [requireRaid],
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandParty(interaction, ctx);
+    const party = commandRaid(interaction, ctx);
     const minutes = interaction.options.getInteger('minutes', true);
     const longest = ctx.config.settings.maxRaidHatchedDuration;
     if (minutes < 1 || minutes > longest) {
```

Apply to `src/commands/raids/location.ts`:

```diff
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -8,12 +8,12 @@ import {
 import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, regionChannelOf, requireParty } from '../../discord/guards.js';
+import { raidOf, regionChannelOf, requireRaid } from '../../discord/guards.js';
 import { blocksNewRaid, raidKindOf } from '../../domain/party/raid.js';
 import { problemText } from '../../render/activity.js';
 import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
-import { commandParty, PARTY_OVER } from '../parties/reply.js';
+import { commandRaid, PARTY_OVER } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
 import { gymChoices, reportedGym } from './raid-input.js';
 
@@ -58,10 +58,10 @@ export const location: SimpleCommand = {
       `signed up, and this post is closed with a link to it. ${IN_A_RAID_POST}`,
     examples: ['/location gym:Big Fountain'],
   },
-  guards: [requireParty],
+  guards: [requireRaid],
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandParty(interaction, ctx);
+    const party = commandRaid(interaction, ctx);
     const typed = interaction.options.getString('gym', true);
     const answer = reportedGym(ctx, regionChannelOf(interaction, ctx), typed);
     if (answer.kind === 'none') {
@@ -133,7 +133,7 @@ export const location: SimpleCommand = {
       regionName,
     );
     // Not the gyms the raid cannot move to (in no region of this server that has a forum).
-    const party = partyOf(interaction, ctx);
+    const party = raidOf(interaction, ctx);
     const reachable = (value: string): boolean => {
       const gym = ctx.gyms.get(Number(value.slice(2)));
       return !party || (gym !== undefined && ctx.raids.gymMove(party, gym).kind !== 'nowhere');
```

Apply to `src/components/party.ts`:

```diff
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -12,9 +12,9 @@ import { changeTime, timesAlready } from '../commands/raids/change.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
-import { managementRoleIds, partyOf, requireGuild } from '../discord/guards.js';
+import { managementRoleIds, notARaid, partyOf, requireGuild } from '../discord/guards.js';
 import { STALE_COMPONENT } from '../discord/router.js';
-import { isGroupId } from '../domain/party/party.js';
+import { isGroupId, isRaid } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { raidStage } from '../domain/party/raid.js';
 import {
@@ -120,6 +120,8 @@ export const partyButtons: ComponentHandler = {
       case 'time': {
         const party = ctx.parties.get(partyId);
         if (!party) throw new UserError(PARTY_OVER);
+        // Only the post of a raid has this button.
+        if (!isRaid(party)) throw new UserError(notARaid(party));
         if (party.hatchTime !== null) throw new UserError(timesAlready(party));
         if (raidStage(party, Date.now()) === 'ended') throw new UserError(RAID_IS_OVER);
         await interaction.showModal(
@@ -178,6 +180,7 @@ export const partyButtons: ComponentHandler = {
     }
     const party = ctx.parties.get(id.id);
     if (!party) throw new UserError(PARTY_OVER);
+    if (!isRaid(party)) throw new UserError(notARaid(party));
     // Somebody else set the time while the form was open: theirs stands, corrections are
     // deliberate (`/hatch`, `/end`).
     if (party.hatchTime !== null) throw new UserError(timesAlready(party));
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -1,6 +1,6 @@
 import type { AppContext } from '../app-context.js';
 import type { Settings } from '../config/index.js';
-import type { Party } from '../domain/party/party.js';
+import { isRaid, partyWord, type Party, type RaidParty } from '../domain/party/party.js';
 import { channelContext } from './channel-context.js';
 import type { Guard, LocatedInteraction } from './command.js';
 import { UserError } from './errors.js';
@@ -155,3 +155,25 @@ export const requireParty: Guard = (interaction, ctx) => {
     throw new UserError('Use this in the post of a raid that is still active.');
   }
 };
+
+/** What a member is told who uses something that is for raids in the post of another party. */
+export function notARaid(party: Pick<Party, 'type'>): string {
+  return `This is the post of a ${partyWord(party)}: that only works in the post of a raid.`;
+}
+
+/** The raid whose forum post an interaction came from; undefined in any other place. */
+export function raidOf(interaction: LocatedInteraction, ctx: AppContext): RaidParty | undefined {
+  const party = partyOf(interaction, ctx);
+  return party && isRaid(party) ? party : undefined;
+}
+
+/**
+ * For commands that are about a raid as such (its egg, boss, gym): `requireParty`, and the party
+ * of the post must be a raid. The sentence names the kind of post the member is in.
+ */
+export const requireRaid: Guard = (interaction, ctx) => {
+  assertGuild(interaction);
+  const party = partyOf(interaction, ctx);
+  if (!party) throw new UserError('Use this in the post of a raid that is still active.');
+  if (!isRaid(party)) throw new UserError(notARaid(party));
+};
```

Create `src/domain/party/meetup.ts`:

```ts
import { NO_PROMPTS, refused, type Change, type MeetupParty } from './party.js';
import { PartyStatus } from './status.js';
import { settled, tidyName } from './timed.js';

export interface NewMeetup {
  /** A fresh UUID. */
  id: string;
  guildId: number;
  /** The region it was made in: its post goes into that region's forum. */
  regionId: number;
  /** Snowflake of the member who makes it. */
  createdById: string;
  /** As the member typed it; it is tidied here (`tidyName`). */
  name: string;
  now: number;
}

/**
 * A new meetup: a name and nothing else yet, with the member who made it signed up as
 * interested (as the legacy bot did; their automatic status is for raids they report). It names
 * who made it, whatever they chose for the raids they report: they are the first trainer in its
 * list anyway. It has no times, so it counts as going on for a day (`OPEN_PARTY_HOURS`) until
 * somebody sets one. Refused with `bad-name` when the text is no name.
 */
export function createMeetup(input: NewMeetup): Change<MeetupParty> {
  const name = tidyName(input.name);
  if (name === undefined) return refused('bad-name');
  const { now } = input;
  const meetup: MeetupParty = {
    id: input.id,
    type: 'meetup',
    guildId: input.guildId,
    status: 'active',
    regionId: input.regionId,
    gymId: null,
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    createdById: input.createdById,
    anonymous: false,
    hatchTime: null,
    endTime: null,
    lastPossibleTime: null,
    deletionTime: null,
    saved: false,
    createdAt: now,
    updatedAt: now,
    attendees: {
      [input.createdById]: {
        number: 1,
        status: PartyStatus.Interested,
        group: 'A',
        remote: false,
      },
    },
    groups: [{ id: 'A' }],
    defaultGroupId: 'A',
    prompts: NO_PROMPTS,
    timed: { name, startTime: null },
    meetup: { description: null },
  };
  return { ok: true, party: settled(meetup, now) };
}
```

Apply to `src/domain/party/party-state.ts`:

```diff
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -2,7 +2,10 @@ import { z } from 'zod';
 import { RAID_LEVELS, raidTier } from '../pogo/raid-tier.js';
 import {
   GROUP_IDS,
+  isRaid,
   MAX_COMPLETION_PROMPTS,
+  MAX_MEETUP_DESCRIPTION,
+  MAX_PARTY_NAME,
   MAX_MEMBER_NAME,
   MIRROR_KINDS,
   TEAMS,
@@ -10,7 +13,6 @@ import {
   type MirrorMessage,
   type Party,
   type PartyCore,
-  type RaidDetails,
 } from './party.js';
 import { PartyStatus } from './status.js';
 
@@ -24,9 +26,13 @@ import { PartyStatus } from './status.js';
  * Version 2 (plan 2D-1) added an attendee's `name` and `team` and the party's `prompts`; a
  * version 1 document is read as one without them. Version 3 (plan 2D-2) added an attendee's
  * `askedBy` and made a completion question a record of its message and the members it asked; a
- * question of a version 2 document is read as one that asked nobody in particular.
+ * question of a version 2 document is read as one that asked nobody in particular. Version 4
+ * (plan 3A) added `timed` (the name and the start of a party that has them) and `meetup` (what
+ * only a meetup has) beside `raid`: a document has the parts that fit its party's type and no
+ * others. A train (plan 3B) will be `timed` and a part of its own. Documents of versions 1 to 3
+ * are those of raids.
  */
-export const PARTY_STATE_VERSION = 3;
+export const PARTY_STATE_VERSION = 4;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -90,6 +96,15 @@ const raid = z.object({
   stageSeen: z.enum(['egg', 'hatched', 'ended']),
 });
 
+const timed = z.object({
+  name: z.string().min(1).max(MAX_PARTY_NAME),
+  startTime: time.nullable(),
+});
+
+const meetup = z.object({
+  description: z.string().min(1).max(MAX_MEETUP_DESCRIPTION).nullable(),
+});
+
 /** What does not hold between the parts of a document, whatever its version. */
 function inconsistencies(value: {
   groups: { id: string }[];
@@ -119,6 +134,8 @@ const state = z
   .object({
     v: z.literal(PARTY_STATE_VERSION),
     ...shared,
+    timed: timed.optional(),
+    meetup: meetup.optional(),
     /**
      * A list, in the order the members signed up, and not an object by member: MySQL sorts the
      * keys of a JSON object, which would put the attendees in the order of their snowflakes.
@@ -130,6 +147,18 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 3, as plans 2D-2 to 2E-2 wrote it: read only. It is version 4 with `raid` alone. */
+const stateV3 = z
+  .object({
+    v: z.literal(3),
+    ...shared,
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 1, as plans 2B and 2C wrote it: read only, and upgraded when read. */
 const stateV1 = z
   .object({
@@ -178,6 +207,11 @@ function readState(stored: unknown) {
       },
     });
   }
+  if (version === 3) {
+    const old = stateV3.safeParse(stored);
+    if (!old.success) return old;
+    return state.safeParse({ ...old.data, v: PARTY_STATE_VERSION });
+  }
   return state.safeParse(stored);
 }
 
@@ -197,18 +231,18 @@ export type PartyColumns = Omit<
 };
 
 /**
- * The document to store for a party. It is checked by the schema the reader uses, and a party
- * that would not be read back throws: it is never written.
+ * The document to store for a party, with the parts of its own kind and no others. It is
+ * checked by the schema the reader uses, and a party that would not be read back throws: it is
+ * never written.
  */
 export function partyState(party: Party): PartyState {
-  const raidDetails: RaidDetails = party.raid;
   const document: PartyState = {
     v: PARTY_STATE_VERSION,
     anonymous: party.anonymous,
     attendees: Object.entries(party.attendees).map(([id, attendee]) => ({ ...attendee, id })),
     groups: [...party.groups],
     defaultGroupId: party.defaultGroupId,
-    raid: raidDetails,
+    ...(isRaid(party) ? { raid: party.raid } : { timed: party.timed, meetup: party.meetup }),
     prompts: {
       completion: party.prompts.completion.map(({ id, members }) => ({
         id,
@@ -240,8 +274,9 @@ export type StoredParty = { ok: true; party: Party } | { ok: false; id: string;
 
 /**
  * Puts a party together from its columns and the two JSON documents as the database returned
- * them. A row this version cannot read (a train before Phase 3, a newer state version, a
- * damaged document) is reported, never guessed at: the caller leaves such a row alone.
+ * them. A row this version cannot read (a train before plan 3B, a newer state version, a
+ * damaged document, a document with the details of another kind of party than its row says) is
+ * reported, never guessed at: the caller leaves such a row alone.
  */
 export function partyFromStored(
   columns: PartyColumns,
@@ -249,29 +284,48 @@ export function partyFromStored(
   storedMirrors: unknown,
 ): StoredParty {
   const fail = (problem: string): StoredParty => ({ ok: false, id: columns.id, problem });
-  if (columns.type !== 'raid') return fail(`a party of type "${columns.type}"`);
+  const { type } = columns;
+  if (type !== 'raid' && type !== 'meetup') return fail(`a party of type "${type}"`);
   const parsed = readState(storedState);
   if (!parsed.success) return fail(`state: ${z.prettifyError(parsed.error)}`);
   const mirrorMessages = mirrors.safeParse(storedMirrors);
   if (!mirrorMessages.success)
     return fail(`mirrorMessages: ${z.prettifyError(mirrorMessages.error)}`);
-  const { anonymous, groups, defaultGroupId, raid: raidDetails } = parsed.data;
-  if (!raidDetails) return fail('a raid without its raid details');
+  const { anonymous, groups, defaultGroupId } = parsed.data;
+  const { raid: raidDetails, timed: timedDetails, meetup: meetupDetails } = parsed.data;
   const attendees: Record<string, Attendee> = {};
   for (const { id, ...attendee } of parsed.data.attendees) attendees[id] = attendee;
   const messages: MirrorMessage[] = mirrorMessages.data;
+  const core = {
+    ...columns,
+    mirrorMessages: messages,
+    anonymous,
+    attendees,
+    groups,
+    defaultGroupId,
+    prompts: parsed.data.prompts,
+  };
+  if (type === 'raid') {
+    if (!raidDetails) return fail('a raid without its raid details');
+    if (timedDetails) return fail('a raid with a name and a start of its own');
+    if (meetupDetails) return fail('a raid with the details of a meetup');
+    return { ok: true, party: { ...core, type, raid: raidDetails } };
+  }
+  if (!timedDetails) return fail('a meetup without its name and start');
+  if (!meetupDetails) return fail('a meetup without its meetup details');
+  if (raidDetails) return fail('a meetup with the details of a raid');
+  // The columns of a raid: a meetup that had them would not be the party that was stored.
+  if (columns.gymId !== null) return fail('a meetup with a gym');
+  if (columns.hatchTime !== null) return fail('a meetup with a hatch time');
   return {
     ok: true,
     party: {
-      ...columns,
-      type: 'raid',
-      mirrorMessages: messages,
-      anonymous,
-      attendees,
-      groups,
-      defaultGroupId,
-      raid: raidDetails,
-      prompts: parsed.data.prompts,
+      ...core,
+      type,
+      gymId: null,
+      hatchTime: null,
+      timed: timedDetails,
+      meetup: meetupDetails,
     },
   };
 }
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -114,16 +114,20 @@ export interface PartyCore {
   status: PartyLifeStatus;
   /** Row id of the region the party is in; null once that region was deleted. */
   regionId: number | null;
+  /** The gym of a raid; null once that gym was deleted, and for a party that is at no gym. */
   gymId: number | null;
   /** The forum the post is in, and the post (a thread). Null until the post exists. */
   forumChannelId: string | null;
   forumPostId: string | null;
-  /** The "new raid at …" line in the region's text channel. */
+  /** The line in the region's text channel that links to the post ("New raid: …"). */
   regionLinkMessageId: string | null;
   mirrorMessages: readonly MirrorMessage[];
-  /** Snowflake of the member who reported it, also when the report is anonymous. */
+  /** Snowflake of the member who reported or made it, also when the report is anonymous. */
   createdById: string;
-  /** The reporter asked not to be named (`User.raidPrivacy`). */
+  /**
+   * The reporter of a raid asked not to be named (`User.raidPrivacy`). Always false for a
+   * meetup, which names who made it.
+   */
   anonymous: boolean;
   hatchTime: number | null;
   endTime: number | null;
@@ -185,8 +189,107 @@ export interface RaidParty extends PartyCore {
   raid: RaidDetails;
 }
 
-/** Trains and meetups join this union in Phase 3. */
-export type Party = RaidParty;
+/** The name of a party that has one has at most this many characters, once it is tidied. */
+export const MAX_PARTY_NAME = 80;
+/** What a form's paragraph input holds, and little enough to be shown whole in the post. */
+export const MAX_MEETUP_DESCRIPTION = 1000;
+
+/**
+ * What a party with a name and times of its own has, whatever its kind: a meetup, and a train
+ * from plan 3B (which adds `train` beside it as a meetup adds `meetup`). Its end is `endTime`.
+ */
+export interface TimedDetails {
+  /** One line, 1 to `MAX_PARTY_NAME` characters. */
+  name: string;
+  /** When the party starts, for everybody; the groups of such a party have no meeting times. */
+  startTime: number | null;
+}
+
+export interface MeetupDetails {
+  /** What the members wrote about it (`/info`), at most `MAX_MEETUP_DESCRIPTION` characters. */
+  description: string | null;
+}
+
+/** A meetup is at no gym and hatches from nothing; its `endTime` is when it ends. */
+export interface MeetupParty extends PartyCore {
+  type: 'meetup';
+  gymId: null;
+  hatchTime: null;
+  timed: TimedDetails;
+  meetup: MeetupDetails;
+}
+
+/** Trains join this union in plan 3B. */
+export type Party = RaidParty | MeetupParty;
+
+/**
+ * A party with `timed`: a name, a start time for everybody and an end that members set. What is
+ * written for a timed party (`timed.ts`) reads only that part, so it serves a train as it is.
+ */
+export type TimedParty = MeetupParty;
+
+export function isRaid(party: Party): party is RaidParty {
+  return party.type === 'raid';
+}
+
+export function isTimed(party: Party): party is TimedParty {
+  return party.type === 'meetup';
+}
+
+/**
+ * `changed` as the kind of party `original` is, for code that is written for one kind and gets
+ * the party back from the store, which holds every kind. A change never alters the kind of a
+ * party (`PartyStore.update` refuses one that does), so this only tells the compiler; it throws
+ * if that was ever broken.
+ */
+export function asKindOf<P extends Party>(original: P, changed: Party): P {
+  if (changed.type !== original.type || changed.id !== original.id) {
+    throw new Error(
+      `Party ${original.id} is a ${original.type}, not ${changed.type} ${changed.id}`,
+    );
+  }
+  return changed as P;
+}
+
+/**
+ * The party with the latest moment it can still be going on brought up to date. A scheduled
+ * archiving is called off when that moment turns out to lie ahead: the party is still going on.
+ * `deletionTime` belongs to the scheduler (`partyTick`) alone: it sets it when the party is
+ * over, and nothing else may schedule an archiving through it, or a corrected time would call
+ * that off too.
+ */
+export function withLastPossibleTime<P extends Party>(
+  party: P,
+  lastPossibleTime: number,
+  now: number,
+): P {
+  const deletionTime = lastPossibleTime > now ? null : party.deletionTime;
+  return { ...party, lastPossibleTime, deletionTime };
+}
+
+/** A moderator keeps the party (never archived automatically) or lets it go again. */
+export function setSaved<P extends { saved: boolean; deletionTime: number | null }>(
+  party: P,
+  saved: boolean,
+): P {
+  return { ...party, saved, deletionTime: saved ? null : party.deletionTime };
+}
+
+/** The party after its post was archived. */
+export function endParty<P extends { status: string }>(party: P): P & { status: 'ended' } {
+  return { ...party, status: 'ended' };
+}
+
+const PARTY_WORDS: Readonly<Record<PartyType, string>> = {
+  raid: 'raid',
+  train: 'train',
+  meetup: 'meetup',
+};
+
+/** What a kind of party is called in a sentence: `this raid`, `this meetup`. */
+export function partyWord(party: { type: PartyType }): string {
+  return PARTY_WORDS[party.type];
+}
 
 /** Why a change was refused. The commands turn these into sentences. */
 export type PartyProblem =
@@ -207,6 +310,8 @@ export type PartyProblem =
   | 'bad-duration'
   /** The member has completed the raid; how they come no longer matters. */
   | 'already-done'
+  /** A name that is empty or too long. */
+  | 'bad-name'
   /** Another raid of this kind already holds the gym. */
   | 'gym-taken'
   /** The gym lies in no region of the raid's server that has a forum for its post. */
@@ -262,5 +367,5 @@ export function membersWhere(
 
 /** Whether members may take part remotely. Elite raids are in person only. */
 export function remoteAllowed(party: Party): boolean {
-  return party.raid.tier.level !== 'Elite';
+  return !isRaid(party) || party.raid.tier.level !== 'Elite';
 }
```

Apply to `src/domain/party/raid.ts`:

```diff
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -11,6 +11,7 @@ import {
   NO_PROMPTS,
   refused,
   sameBoss,
+  withLastPossibleTime,
   type Attendee,
   type Change,
   type GroupId,
@@ -137,15 +138,12 @@ function latestWithoutTimes(party: RaidParty, rules: RaidDurationRules): number
 }
 
 /**
- * Brings what follows from the times up to date: the last possible time, and a scheduled
- * archiving is called off when the raid turns out to be still going on. `deletionTime` belongs
- * to the scheduler (`partyTick`) alone: it sets it when the raid is over, and nothing else may
- * schedule an archiving through it, or a corrected time would call that off too.
+ * Brings what follows from the times up to date: the last possible time, and with it a
+ * scheduled archiving, which is called off when the raid turns out to be still going on
+ * (`withLastPossibleTime`).
  */
 function settled(party: RaidParty, rules: RaidDurationRules, now: number): RaidParty {
-  const lastPossibleTime = party.endTime ?? latestWithoutTimes(party, rules);
-  const deletionTime = lastPossibleTime > now ? null : party.deletionTime;
-  return { ...party, lastPossibleTime, deletionTime };
+  return withLastPossibleTime(party, party.endTime ?? latestWithoutTimes(party, rules), now);
 }
 
 /** Minutes this raid lasts once hatched at `hatchTime`. */
@@ -372,11 +370,3 @@ export function setGym(
 ): { party: RaidParty; regionChanged: boolean } {
   return { party: { ...party, gymId, regionId }, regionChanged: regionId !== party.regionId };
 }
-
-/** A moderator keeps the party (never archived automatically) or lets it go again. */
-export function setSaved<P extends { saved: boolean; deletionTime: number | null }>(
-  party: P,
-  saved: boolean,
-): P {
-  return { ...party, saved, deletionTime: saved ? null : party.deletionTime };
-}
```

Apply to `src/domain/party/tick.ts`:

```diff
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -4,7 +4,15 @@ import type { RaidBoss } from '../pogo/raid-bosses.js';
 import type { RaidTier } from '../pogo/raid-tier.js';
 import type { RaidDurationRules } from '../time/raid-durations.js';
 import { askGroupWhetherComplete, completeUnanswered } from './attendance.js';
-import type { GroupId, PartyGroup, RaidBossRef, RaidParty, RaidStage } from './party.js';
+import {
+  isRaid,
+  type GroupId,
+  type Party,
+  type PartyGroup,
+  type RaidBossRef,
+  type RaidParty,
+  type RaidStage,
+} from './party.js';
 import { certainMoves, raidBossRef, raidStage, setBoss } from './raid.js';
 
 const MINUTE = 60_000;
@@ -45,8 +53,8 @@ export type TickEffect =
   /** Archive the post and call `endParty`. Comes alone, on every tick until the party is ended. */
   | { kind: 'end' };
 
-export interface TickResult {
-  party: RaidParty;
+export interface TickResult<P extends Party = Party> {
+  party: P;
   effects: TickEffect[];
   /**
    * The post must be shown anew: the tick changed the party, or the calendar day changed since
@@ -81,7 +89,14 @@ export function tickAutoset(bosses: {
  *
  * A party that is due to be archived gets that and nothing else.
  */
-export function partyTick(party: RaidParty, input: TickInput): TickResult {
+export function partyTick<P extends Party>(party: P, input: TickInput): TickResult<P>;
+export function partyTick(party: Party, input: TickInput): TickResult {
+  // Only raids have a clock so far: nothing makes another kind of party yet.
+  if (!isRaid(party)) return { party, effects: [], render: false };
+  return raidTick(party, input);
+}
+
+function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
   const { now, settings } = input;
   const effects: TickEffect[] = [];
   if (party.status !== 'active') return { party, effects, render: false };
@@ -160,8 +175,3 @@ export function partyTick(party: RaidParty, input: TickInput): TickResult {
 function withGroup(party: RaidParty, group: PartyGroup): RaidParty {
   return { ...party, groups: party.groups.map((g) => (g.id === group.id ? group : g)) };
 }
-
-/** The party after its post was archived. */
-export function endParty<P extends { status: string }>(party: P): P & { status: 'ended' } {
-  return { ...party, status: 'ended' };
-}
```

Create `src/domain/party/timed.ts`:

```ts
import { MAX_PARTY_NAME, withLastPossibleTime, type TimedParty } from './party.js';

const HOUR = 3_600_000;

/**
 * A timed party without an end time is taken to be over this long after its start. One that has
 * no start either has this long from when it was made, or from when its last time was taken
 * away. (The legacy bot had no such rule: a meetup without an end time stayed for good.)
 */
export const OPEN_PARTY_HOURS = 24;

/** The name of a timed party. */
export function nameOf(party: TimedParty): string {
  return party.timed.name;
}

/** When a timed party starts, for everybody; null while nobody has said. */
export function startTimeOf(party: TimedParty): number | null {
  return party.timed.startTime;
}

/**
 * A name as it is kept: on one line, runs of white space as one space, the ends trimmed, and
 * without characters that cannot be seen (control and format characters: a zero-width space is
 * no name, and a direction override would turn the title of the post around). The zero-width
 * joiner stays: emoji are built with it. Undefined for a text that is no name: nothing left, or
 * longer than a name may be.
 */
export function tidyName(text: string): string | undefined {
  const name = text
    .replace(/\s+/g, ' ')
    .replace(/(?!\u200d)[\p{Cc}\p{Cf}]/gu, '')
    .replace(/ +/g, ' ')
    .trim();
  return name === '' || name.length > MAX_PARTY_NAME ? undefined : name;
}

/**
 * The latest moment a timed party can still be going on, as it is worked out at `now`, when one
 * of its times has just been set or taken away: its end time when it has one; otherwise
 * `OPEN_PARTY_HOURS` after its start. A party with neither has that long from now, and never
 * less than from when it was made: taking the last time away from an old meetup gives it a day,
 * not the archive warning.
 */
export function latestTime(party: TimedParty, now: number): number {
  if (party.endTime !== null) return party.endTime;
  const from = startTimeOf(party) ?? Math.max(party.createdAt, now);
  return from + OPEN_PARTY_HOURS * HOUR;
}

/**
 * Brings what follows from the times up to date, as `raid.ts` does for a raid: the last possible
 * time, and with it a scheduled archiving, which is called off when the party turns out to be
 * still going on (`withLastPossibleTime`): a time that somebody sets after the warning takes
 * the warning away.
 */
export function settled<P extends TimedParty>(party: P, now: number): P {
  return withLastPossibleTime(party, latestTime(party, now), now);
}
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -2,6 +2,7 @@ import { MAX_GROUP_LABEL } from '../domain/party/attendance.js';
 import {
   GROUP_IDS,
   groupOf,
+  MAX_PARTY_NAME,
   type Attendee,
   type Party,
   type PartyProblem,
@@ -87,6 +88,8 @@ export function problemText(reason: PartyProblem, limits: { maxNumber: number })
       return 'That gym already has a raid like this one.';
     case 'not-a-move':
       return 'The boss of this raid does not have that move.';
+    case 'bad-name':
+      return `Give a name of 1 to ${MAX_PARTY_NAME} characters.`;
     case 'other-region':
       return (
         'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -30,6 +30,7 @@ import {
   refused,
   type Attendee,
   type Change,
+  isRaid,
   type GroupId,
   type Party,
   type PartyProblem,
@@ -184,7 +185,7 @@ export class AttendanceService {
   ): Promise<AttendanceOutcome<{ asked: string[]; wasComplete: boolean }>> {
     const now = this.now();
     const outcome = await this.apply(partyId, member, (party) =>
-      raidStage(party, now) === 'egg'
+      isRaid(party) && raidStage(party, now) === 'egg'
         ? refused('not-hatched')
         : completeRaid(party, member.id, now, this.options.settings.raidCompleteTimeout),
     );
```

Apply to `src/services/party-mirrors.ts`:

```diff
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -5,7 +5,7 @@ import {
   type OutgoingMessage,
   type PartyGateway,
 } from '../discord/party-gateway.js';
-import type { MirrorKind, MirrorMessage, RaidParty } from '../domain/party/party.js';
+import { isRaid, type MirrorKind, type MirrorMessage, type Party } from '../domain/party/party.js';
 import { raidMirrors } from '../domain/party/raid.js';
 import type { Logger } from '../log.js';
 import { renderMirror, type MirrorPlace } from '../render/mirrors.js';
@@ -24,7 +24,7 @@ export interface PartyMirrorsOptions {
   gyms: { get(id: number): { taggedEx: boolean; confirmedEx: boolean } | undefined };
   settings: Pick<Settings, 'features' | 'channels'>;
   /** What the post of a party shows now. */
-  render: (party: RaidParty) => RenderedPost;
+  render: (party: Party) => RenderedPost;
   log: Logger;
   now: () => number;
   /**
@@ -105,7 +105,7 @@ export class PartyMirrors {
     );
   }
 
-  private place(party: RaidParty, postId: string): MirrorPlace {
+  private place(party: Party, postId: string): MirrorPlace {
     const region = party.regionId === null ? undefined : this.options.regions.byId(party.regionId);
     return { postId, regionChannelId: region?.channelId };
   }
@@ -155,7 +155,7 @@ export class PartyMirrors {
    * A copy that somebody deleted is taken off the record. Never rejects.
    */
   private async sync(
-    party: RaidParty,
+    party: Party,
     rendered: RenderedPost,
     kinds: readonly MirrorKind[],
     wanted: ReadonlyMap<MirrorKind, string>,
@@ -219,7 +219,7 @@ export class PartyMirrors {
    * Brings the copy in the post (`/status`) up to date with what the post shows. Call it from
    * the render of the post, which runs once at a time per party. Never rejects.
    */
-  async syncStatus(party: RaidParty, rendered: RenderedPost): Promise<void> {
+  async syncStatus(party: Party, rendered: RenderedPost): Promise<void> {
     await this.sync(party, rendered, ['status'], new Map());
   }
 
@@ -236,7 +236,8 @@ export class PartyMirrors {
     // they are made again once there is one.
     const near = place.regionChannelId ?? party.forumChannelId ?? undefined;
     const wanted = new Map<MirrorKind, string>();
-    for (const kind of raidMirrors(party, gym, now())) {
+    // Only a raid has copies in the shared channels (they are the channels for raids).
+    for (const kind of isRaid(party) ? raidMirrors(party, gym, now()) : []) {
       const channelId = this.channelFor(kind, near);
       if (channelId !== undefined) wanted.set(kind, channelId);
     }
@@ -407,7 +408,7 @@ export class PartyMirrors {
    * Deletes every copy of the message of a party that has ended, also the one in its post, and
    * forgets what is kept for them. Never rejects.
    */
-  async remove(party: RaidParty): Promise<void> {
+  async remove(party: Party): Promise<void> {
     const { gateway, log } = this.options;
     for (const mirror of party.mirrorMessages) {
       this.sent.delete(mirror.messageId);
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -1,6 +1,6 @@
 import type { Settings } from '../config/settings.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
-import type { Party } from '../domain/party/party.js';
+import { isRaid, type Party } from '../domain/party/party.js';
 import { partyTick, tickAutoset, type TickEffect, type TickInput } from '../domain/party/tick.js';
 import type { Logger } from '../log.js';
 import { fitItems, plain, timestamp } from '../render/text.js';
@@ -236,6 +236,8 @@ export class PartyScheduler {
       case 'stage': {
         // Catching up over hatch and end at once says nothing: the raid is over.
         if (effect.from !== 'egg' || effect.to !== 'hatched' || postId === null) return;
+        // Only a raid has stages.
+        if (!isRaid(party)) return;
         const boss = posts.view(party).boss?.name;
         lines.say(
           postId,
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -11,17 +11,19 @@ import {
   type TagIds,
 } from '../discord/party-gateway.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
-import { membersWhere, type RaidBossRef, type RaidParty } from '../domain/party/party.js';
 import {
-  certainMoves,
-  createRaid,
-  setEndTime,
-  setHatchTime,
+  asKindOf,
+  isRaid,
+  membersWhere,
+  type Party,
+  type RaidBossRef,
+  type RaidParty,
   setSaved,
-} from '../domain/party/raid.js';
+  endParty,
+} from '../domain/party/party.js';
+import { certainMoves, createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
 import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { endParty } from '../domain/party/tick.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
@@ -206,7 +208,7 @@ export class PartyService {
       regions: options.regions,
       gyms: options.gyms,
       settings: options.settings,
-      render: (party) => renderRaidPost(this.view(party)),
+      render: (party) => this.rendered(party),
       log: options.log,
       now: this.now,
       ...(options.sharedDelayMs === undefined ? {} : { sharedDelayMs: options.sharedDelayMs }),
@@ -271,6 +273,16 @@ export class PartyService {
     };
   }
 
+  /**
+   * What the post of a party shows now. `closed` is the sentence of its last showing when
+   * somebody closed it (see `RaidPostView.closed`).
+   */
+  private rendered(party: Party, closed?: string): RenderedPost {
+    // Only raids have a post so far: nothing makes another kind of party yet.
+    if (!isRaid(party)) throw new Error(`Party ${party.id} is a ${party.type}: it has no post`);
+    return renderRaidPost({ ...this.view(party), ...(closed === undefined ? {} : { closed }) });
+  }
+
   /**
    * The region whose forum takes a raid at this gym, among the regions the gym lies in: the
    * region the report was made in; else a region of the same server; else, when the report names
@@ -415,9 +427,10 @@ export class PartyService {
           : applied;
       });
       if (signedUp?.written) this.changed(existingId);
+      const existing = signedUp?.party ?? store.get(existingId);
       return {
         kind: 'exists',
-        party: signedUp?.party ?? store.get(existingId) ?? stored.existing,
+        party: existing && isRaid(existing) ? existing : stored.existing,
         joined: signedUp?.joined ?? false,
       };
     }
@@ -491,7 +504,7 @@ export class PartyService {
   ): Promise<RelocateOutcome> {
     const { store, gateway, log } = this.options;
     const old = store.get(partyId);
-    if (!old) return { kind: 'gone' };
+    if (!old || !isRaid(old)) return { kind: 'gone' };
     const forumId = region.forumChannelId;
     if (forumId === null || region.guildId === null) return { kind: 'no-forum' };
     const raid = relocatedRaid(old, {
@@ -536,8 +549,9 @@ export class PartyService {
     let ended;
     try {
       ended = await store.update(partyId, (party) => {
-        seen.last = party;
-        return { party: endParty(party) };
+        const raid = asKindOf(old, party);
+        seen.last = raid;
+        return { party: endParty(raid) };
       });
     } catch (err) {
       // Both would stay active, one raid in two places: the new one goes again.
@@ -546,7 +560,8 @@ export class PartyService {
       throw err;
     }
     const source = seen.last;
-    if (!ended?.written || !source) {
+    const from = ended?.written ? ended.party : undefined;
+    if (!source || !from) {
       // It ended by itself in this very moment: what somebody closed does not come back.
       await this.takeBack(raid.id);
       return { kind: 'gone' };
@@ -554,21 +569,21 @@ export class PartyService {
     let party = created.party;
     try {
       const carried = await store.update(raid.id, (current) => {
-        const now = carriedOver(current, source, raid);
+        const now = carriedOver(asKindOf(raid, current), source, raid);
         return { party: by ? noteMember(now, by.id, by) : now };
       });
       party = carried?.party ?? party;
     } catch (err) {
       log.warn({ err, party: raid.id }, 'could not carry over what changed while a raid moved');
     }
-    this.ended(ended.party);
+    this.ended(from);
     if (moved) {
       const there = party;
       await this.answerBeforeClosing(raid.id, () => moved(there));
     }
-    await this.closePost(ended.party, words, said);
+    await this.closePost(from, words, said);
     this.changed(raid.id);
-    return { kind: 'moved', party, from: ended.party };
+    return { kind: 'moved', party, from };
   }
 
   /**
@@ -719,10 +734,10 @@ export class PartyService {
    * Ends a raid that cannot be shown, so that it does not block its gym. Gives the party as it
    * was when it ended; undefined when it could not be ended (it stays active) or was not active.
    */
-  private async abandon(partyId: string, failure: string): Promise<RaidParty | undefined> {
+  private async abandon(partyId: string, failure: string): Promise<Party | undefined> {
     const { store, log } = this.options;
     const postId = store.get(partyId)?.forumPostId;
-    let ended: RaidParty | undefined;
+    let ended: Party | undefined;
     try {
       const result = await store.update(partyId, (party) => ({ party: endParty(party) }));
       if (result?.written) ended = result.party;
@@ -806,7 +821,7 @@ export class PartyService {
    */
   async end(
     partyId: string,
-    onlyIf?: (party: RaidParty) => boolean,
+    onlyIf?: (party: Party) => boolean,
     closing: { lastWords?: string; left?: () => Promise<unknown> } = {},
   ): Promise<boolean> {
     const result = await this.options.store.update(partyId, (party) =>
@@ -930,7 +945,7 @@ export class PartyService {
   }
 
   /** Deletes the line that links to a party in its region's channel; a failure is a warning. */
-  private async deleteLinkLine(party: RaidParty): Promise<void> {
+  private async deleteLinkLine(party: Party): Promise<void> {
     const regionChannel =
       party.regionId === null ? undefined : this.options.regions.byId(party.regionId);
     const linkId = party.regionLinkMessageId;
@@ -950,7 +965,7 @@ export class PartyService {
    * post, unless they were `said` there already, and stand in the post's own message in the
    * place of the times. Never rejects.
    */
-  private async closePost(party: RaidParty, lastWords?: string, said = false): Promise<void> {
+  private async closePost(party: Party, lastWords?: string, said = false): Promise<void> {
     const { gateway, log } = this.options;
     const postId = party.forumPostId;
     const attempt = async (what: string, work: () => Promise<unknown>): Promise<void> => {
@@ -984,10 +999,7 @@ export class PartyService {
     }
     let there = true;
     // A raid that was closed says so in the post itself, in the place of its times.
-    const rendered = renderRaidPost({
-      ...this.view(party),
-      ...(lastWords === undefined ? {} : { closed: lastWords }),
-    });
+    const rendered = this.rendered(party, lastWords);
     await attempt('show an ended party one last time', async () => {
       const last = { ...rendered, message: { ...rendered.message, components: [] } };
       there = await this.editPostOf(party.id, postId, last);
@@ -1143,7 +1155,7 @@ export class PartyService {
   }
 
   /** Somebody deleted the post: the party is over (spec 7), and the thread goes if it is left. */
-  private async postGone(party: RaidParty, postId: string): Promise<void> {
+  private async postGone(party: Party, postId: string): Promise<void> {
     const { gateway, log } = this.options;
     log.warn({ party: party.id, post: postId }, 'a party post is gone; ending the party');
     const ended = await this.abandon(party.id, 'could not end a raid whose post is gone');
@@ -1183,7 +1195,7 @@ export class PartyService {
     const party = this.options.store.get(partyId);
     if (!party?.forumPostId) return;
     try {
-      await this.mirrors.syncStatus(party, renderRaidPost(this.view(party)));
+      await this.mirrors.syncStatus(party, this.rendered(party));
     } catch (err) {
       this.options.log.warn({ err, party: partyId }, 'could not update the copy in a post');
     }
@@ -1207,7 +1219,7 @@ export class PartyService {
     const party = store.get(partyId);
     if (!party?.forumPostId) return;
     const postId = party.forumPostId;
-    const rendered = renderRaidPost(this.view(party));
+    const rendered = this.rendered(party);
 
     // The tag ids first: they are part of what is compared with what was sent last.
     let wanted: string[] | undefined;
@@ -1305,10 +1317,10 @@ export class PartyService {
   /** The list of a region's raids, as its summary post shows it (also for `/status`). */
   summaryText(regionId: number): string {
     const now = this.now();
-    const raids = this.options.store.inRegion(regionId).map((party) => ({
-      party,
-      title: raidTitle(this.view(party)),
-    }));
+    const raids = this.options.store
+      .inRegion(regionId)
+      .filter(isRaid)
+      .map((party) => ({ party, title: raidTitle(this.view(party)) }));
     return renderSummary(raids, now);
   }
 
```

Apply to `src/services/party-store.ts`:

```diff
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -1,5 +1,5 @@
 import type { PartyStorage } from '../db/repositories/party-repository.js';
-import type { Party, RaidParty } from '../domain/party/party.js';
+import { isRaid, type Party, type RaidParty } from '../domain/party/party.js';
 import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
 import type { RaidKind } from '../domain/time/party-time.js';
 import type { Logger } from '../log.js';
@@ -127,9 +127,11 @@ export class PartyStore implements PartyProvider {
   }
 
   raidAt(gymId: number, kind: RaidKind, now: number): RaidParty | undefined {
-    return this.active().find(
-      (party) => party.gymId === gymId && raidKindOf(party) === kind && blocksNewRaid(party, now),
-    );
+    return this.active()
+      .filter(isRaid)
+      .find(
+        (party) => party.gymId === gymId && raidKindOf(party) === kind && blocksNewRaid(party, now),
+      );
   }
 
   /** Stores a new party. Rejects when the row cannot be written (its id or post already exists). */
@@ -159,8 +161,9 @@ export class PartyStore implements PartyProvider {
    *
    * A decision must be made inside `change`: a `get(id)` made before `update` may be out of date
    * by the time the change runs. Undefined also means "ended in the meantime", which handlers
-   * queued behind the scheduler will meet. Only what can change is written: `type`, `guildId`,
-   * `createdById` and `createdAt` must not be altered by a change.
+   * queued behind the scheduler will meet. Only what can change is written: `guildId`,
+   * `createdById` and `createdAt` must not be altered by a change, and one that alters `type`
+   * throws: a party is of one kind for good, which `asKindOf` relies on.
    */
   async update<R extends { party?: Party }>(
     id: string,
@@ -175,6 +178,8 @@ export class PartyStore implements PartyProvider {
       if (changed === undefined || changed === current) return { ...result, written: false };
       if (changed.id !== id)
         throw new Error(`A change of party ${id} returned party ${changed.id}`);
+      if (changed.type !== current.type)
+        throw new Error(`A change of ${current.type} ${id} returned a ${changed.type}`);
       const stamped: Party = { ...changed, updatedAt: Math.max(this.now(), current.updatedAt) };
       if (!(await this.options.storage.save(stamped))) {
         parties.delete(id);
```

Apply to `src/services/raid-change-service.ts`:

```diff
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -3,12 +3,15 @@ import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import { noteMember, releaseAsked } from '../domain/party/attendance.js';
 import {
+  asKindOf,
+  isRaid,
+  membersWhere,
   refused,
   type Change,
   type GroupId,
+  type Party,
   type PartyProblem,
   type RaidBossRef,
-  membersWhere,
   type RaidParty,
 } from '../domain/party/party.js';
 import {
@@ -279,7 +282,7 @@ export class RaidChangeService {
     const gym = gyms.get(gymId);
     if (!gym) throw new Error(`There is no gym ${gymId}`);
     const before = store.get(partyId);
-    if (!before) return { kind: 'gone' };
+    if (!before || !isRaid(before)) return { kind: 'gone' };
     const move = this.gymMove(before, gym);
     if (move.kind === 'local') return this.setGymInRegion(partyId, member, gym);
     if (move.kind === 'nowhere') return { kind: 'refused', reason: 'other-region' };
@@ -348,7 +351,8 @@ export class RaidChangeService {
 
   /**
    * Runs one change. The gyms the raid is at and may move to are locked for it, in one order,
-   * so that the check for another raid there and the write are one step.
+   * so that the check for another raid there and the write are one step. A party that is no
+   * raid is `gone`: there is no such raid.
    */
   private async apply(
     partyId: string,
@@ -361,14 +365,15 @@ export class RaidChangeService {
     // The raid can be moved to another gym between looking and locking: then look again.
     for (let attempt = 0; attempt < 3; attempt++) {
       const before = store.get(partyId);
-      if (!before) return { kind: 'gone' };
+      if (!before || !isRaid(before)) return { kind: 'gone' };
       const locked = [
         ...new Set([before.gymId, targetGym].filter((id): id is number => typeof id === 'number')),
       ].sort((a, b) => a - b);
       let moved = false;
       let meetings: string[] = [];
       let released = false;
-      const decide = (party: RaidParty): Decision => {
+      const decide = (stored: Party): Decision => {
+        const party = asKindOf(before, stored);
         if (party.gymId !== null && !locked.includes(party.gymId)) {
           moved = true;
           return { ok: true, party };
@@ -391,7 +396,7 @@ export class RaidChangeService {
         }
         return { ...changed, party: result };
       };
-      const update = (): ReturnType<typeof store.update<Decision>> => store.update(partyId, decide);
+      const update = () => store.update(partyId, decide);
       const result = await locked.reduceRight<() => Promise<Awaited<ReturnType<typeof update>>>>(
         (inner, gymId) => () => store.withGymLock(gymId, inner),
         update,
@@ -441,6 +446,7 @@ export class RaidChangeService {
     }
     return this.options.store
       .active()
+      .filter(isRaid)
       .find(
         (other) =>
           other.id !== after.id &&
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/attendance.test.ts src/commands/raids/raid-only.test.ts src/components/party.test.ts src/discord/guards.test.ts src/domain/party/meetup.test.ts src/domain/party/party-state.test.ts src/domain/party/raid.test.ts src/domain/party/relocate.test.ts src/domain/party/tick.test.ts src/domain/party/timed.test.ts src/render/summary.test.ts src/services/attendance-service.test.ts src/services/party-mirrors.test.ts src/services/party-scheduler.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-store.test.ts src/services/raid-change-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/party-repository.db.test.ts`, `src/services/party-lifecycle.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/party-repository.db.test.ts src/services/party-lifecycle.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff a98b744 -- src test   # must print nothing
npx prettier --check src/commands/parties/attendance.test.ts src/commands/parties/meet.ts src/commands/parties/reply.ts src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/location.ts src/commands/raids/raid-only.test.ts src/components/party.test.ts src/components/party.ts src/db/repositories/party-repository.db.test.ts src/discord/guards.test.ts src/discord/guards.ts src/domain/party/meetup.test.ts src/domain/party/meetup.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/domain/party/relocate.test.ts src/domain/party/tick.test.ts src/domain/party/tick.ts src/domain/party/timed.test.ts src/domain/party/timed.ts src/render/activity.ts src/render/summary.test.ts src/services/attendance-service.test.ts src/services/attendance-service.ts src/services/party-lifecycle.db.test.ts src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-service.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts test/support/parties.ts test/support/party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/parties/attendance.test.ts src/commands/parties/meet.ts src/commands/parties/reply.ts src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/location.ts src/commands/raids/raid-only.test.ts src/components/party.test.ts src/components/party.ts src/db/repositories/party-repository.db.test.ts src/discord/guards.test.ts src/discord/guards.ts src/domain/party/meetup.test.ts src/domain/party/meetup.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/domain/party/relocate.test.ts src/domain/party/tick.test.ts src/domain/party/tick.ts src/domain/party/timed.test.ts src/domain/party/timed.ts src/render/activity.ts src/render/summary.test.ts src/services/attendance-service.test.ts src/services/attendance-service.ts src/services/party-lifecycle.db.test.ts src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-service.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts test/support/parties.ts test/support/party-service.ts
git commit -m "A party is a raid or a meetup: the union, state document version 4, and every place that assumed a raid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,017 unit tests.

---

### Task 3: The domain of a meetup

**Files:**
- Modify: `src/domain/party/attendance.test.ts`, `src/domain/party/attendance.ts`, `src/domain/party/meetup.test.ts`, `src/domain/party/meetup.ts`, `src/domain/party/party.ts`, `src/domain/party/timed.test.ts`, `src/domain/party/timed.ts`, `src/render/activity.test.ts`, `src/render/activity.ts`, `src/services/attendance-service.test.ts`, `src/services/attendance-service.ts`

**Interfaces:**
- Consumes: Task 2's union and `timed.ts`; `attendance.ts`; `problemText` (`src/render/activity.ts`); `AttendanceService`.
- Produces: `setName`, `setStartTime`, `setTimedEnd`, `timedOver` (`timed.ts`); `setDescription` (`meetup.ts`); `finishParty` (Done: completes a raid, leaves any other party); the reasons `no-groups`, `party-wide-start`, `bad-name` and the others a timed party needs in `PartyProblem`; `completeRaid`, `askGroupWhetherComplete` and `completeUnanswered` typed for a raid; `problemText(reason, limits, word)`.

The end must be after the start. Without start and end the last possible time is a day after the meetup was made or after its last time was removed, whichever is later.

Reference commit of the prototype for this task: `0d74135`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/domain/party/attendance.test.ts`:

```diff
--- a/src/domain/party/attendance.test.ts
+++ b/src/domain/party/attendance.test.ts
@@ -6,7 +6,9 @@ import {
   MINUTE,
   PARTY_NOW,
   REPORTER,
+  testMeetup,
   testRaid,
+  testRaidRules,
   withAttendees,
 } from '../../../test/support/parties.js';
 import {
@@ -17,6 +19,7 @@ import {
   completeRaid,
   completeUnanswered,
   createGroup,
+  finishParty,
   joinGroup,
   labelGroup,
   leaveParty,
@@ -29,6 +32,7 @@ import {
   withdrawQuestions,
 } from './attendance.js';
 import { headCount, type Change, type RaidParty } from './party.js';
+import { setHatchTime } from './raid.js';
 import { PartyStatus } from './status.js';
 
 const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
@@ -831,3 +835,91 @@ describe('servedQuestions', () => {
     expect(servedQuestions(asked([old], { [CAROL]: { status: Present } }))).toEqual([old]);
   });
 });
+
+describe('finishParty', () => {
+  const hatched = withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
+    [ALICE]: { status: Present },
+    [BOB]: { status: Present },
+  });
+
+  it('completes a raid for the member and asks the others who are present', () => {
+    const change = finishParty(hatched, ALICE, PARTY_NOW, 5);
+    expect(change).toMatchObject({ ok: true, asked: [BOB], wasComplete: false, left: false });
+    expect(change).toEqual({ ...completeRaid(hatched, ALICE, PARTY_NOW, 5), left: false });
+  });
+
+  it('refuses while the raid is an egg, by its times or by how it was reported', () => {
+    const egg = withAttendees(testRaid(), { [ALICE]: { status: Present } });
+    expect(finishParty(egg, ALICE, PARTY_NOW, 5)).toEqual({ ok: false, reason: 'not-hatched' });
+    const timed = setHatchTime(egg, PARTY_NOW + 10 * MINUTE, testRaidRules(), PARTY_NOW);
+    expect(finishParty(timed, ALICE, PARTY_NOW + 9 * MINUTE, 5)).toEqual({
+      ok: false,
+      reason: 'not-hatched',
+    });
+    expect(finishParty(timed, ALICE, PARTY_NOW + 10 * MINUTE, 5).ok).toBe(true);
+  });
+
+  it('takes the member off a meetup: done means leave, and nobody is asked', () => {
+    const meetup = withAttendees(testMeetup(), {
+      [ALICE]: { status: Present },
+      [BOB]: { status: Present },
+    });
+    const change = finishParty(meetup, ALICE, PARTY_NOW, 5);
+    expect(change).toMatchObject({ ok: true, asked: [], wasComplete: false, left: true });
+    expect(change.ok && Object.keys(change.party.attendees)).toEqual([REPORTER, BOB]);
+    expect(change.ok && change.party.attendees[BOB]).toBe(meetup.attendees[BOB]);
+    expect(change).toEqual({
+      ...leaveParty(meetup, ALICE),
+      asked: [],
+      wasComplete: false,
+      left: true,
+    });
+  });
+
+  it('is only for somebody who is signed up, in either kind', () => {
+    const refusal = { ok: false, reason: 'not-attending' };
+    expect(finishParty(hatched, CAROL, PARTY_NOW, 5)).toEqual(refusal);
+    expect(finishParty(testMeetup(), CAROL, PARTY_NOW, 5)).toEqual(refusal);
+  });
+});
+
+describe('a meetup, which has one group for good', () => {
+  const meetup = withAttendees(testMeetup(), { [ALICE]: {} });
+  const noGroups = { ok: false, reason: 'no-groups' };
+
+  it('opens no second group', () => {
+    expect(createGroup(meetup, ALICE, limits)).toEqual(noGroups);
+  });
+
+  it('has no group to move to, not even its own', () => {
+    expect(joinGroup(meetup, ALICE, 'B', limits)).toEqual(noGroups);
+    expect(joinGroup(meetup, ALICE, 'A', limits)).toEqual(noGroups);
+    expect(joinGroup(meetup, CAROL, 'A', limits)).toEqual(noGroups);
+  });
+
+  it('takes no label', () => {
+    expect(labelGroup(meetup, ALICE, 'park side')).toEqual(noGroups);
+  });
+
+  it('takes no meeting time of a group: it starts for everybody at once', () => {
+    const partyWide = { ok: false, reason: 'party-wide-start' };
+    expect(setMeetingTime(meetup, ALICE, PARTY_NOW + MINUTE)).toEqual(partyWide);
+    expect(setMeetingTime(meetup, ALICE, null)).toEqual(partyWide);
+    expect(setMeetingTime(meetup, CAROL, null)).toEqual(partyWide);
+  });
+
+  it('still signs members up, with a head count, in group A', () => {
+    const joined = setAttendance(meetup, BOB, Coming, { number: 3, group: 'A' }, limits);
+    expect(joined.ok && joined.party.attendees[BOB]).toEqual({
+      number: 3,
+      status: Coming,
+      group: 'A',
+      remote: false,
+    });
+    expect(setAttendance(meetup, BOB, Coming, { group: 'B' }, limits)).toEqual({
+      ok: false,
+      reason: 'no-such-group',
+    });
+    expect(headCount(joined.ok ? joined.party : meetup)).toBe(5);
+  });
+});
```

Apply to `src/domain/party/meetup.test.ts`:

```diff
--- a/src/domain/party/meetup.test.ts
+++ b/src/domain/party/meetup.test.ts
@@ -1,8 +1,17 @@
 import { describe, expect, it } from 'vitest';
 import { PARTY_NOW, REPORTER, testMeetup, testRaid } from '../../../test/support/parties.js';
 import { attendanceLimits, setRemote } from './attendance.js';
-import { createMeetup, type NewMeetup } from './meetup.js';
-import { isRaid, isTimed, MAX_PARTY_NAME, partyWord, remoteAllowed, type Party } from './party.js';
+import { createMeetup, setDescription, type NewMeetup } from './meetup.js';
+import {
+  hasGroups,
+  isRaid,
+  isTimed,
+  MAX_MEETUP_DESCRIPTION,
+  MAX_PARTY_NAME,
+  partyWord,
+  remoteAllowed,
+  type Party,
+} from './party.js';
 import { PartyStatus } from './status.js';
 
 const HOUR = 3_600_000;
@@ -80,6 +89,11 @@ describe('the kinds of party', () => {
     expect([isRaid(meetup), isTimed(meetup)]).toEqual([false, true]);
   });
 
+  it('gives a raid groups and a meetup its one group for good', () => {
+    expect(hasGroups(raid)).toBe(true);
+    expect(hasGroups(meetup)).toBe(false);
+  });
+
   it('names each kind for a sentence', () => {
     expect(partyWord(raid)).toBe('raid');
     expect(partyWord(meetup)).toBe('meetup');
@@ -97,3 +111,41 @@ describe('the kinds of party', () => {
     });
   });
 });
+
+describe('setDescription', () => {
+  it('sets what the post says about the meetup, keeping its lines', () => {
+    const meetup = testMeetup();
+    const set = setDescription(
+      meetup,
+      '  Bring snacks.  \r\nWe meet at the fountain.\n\n\n\nSee you! ',
+    );
+    expect(set.ok && set.party.meetup.description).toBe(
+      'Bring snacks.\nWe meet at the fountain.\n\nSee you!',
+    );
+    expect(set.ok && { ...set.party, meetup: meetup.meetup }).toEqual(meetup);
+  });
+
+  it('removes it with a text of nothing but white space', () => {
+    const set = setDescription(testMeetup(), 'Bring snacks.');
+    if (!set.ok) throw new Error(set.reason);
+    const cleared = setDescription(set.party, ' \n ');
+    expect(cleared.ok && cleared.party.meetup.description).toBeNull();
+  });
+
+  it('refuses a text that is too long once it is tidied', () => {
+    const meetup = testMeetup();
+    expect(setDescription(meetup, `${'x'.repeat(MAX_MEETUP_DESCRIPTION)}  `).ok).toBe(true);
+    expect(setDescription(meetup, 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1))).toEqual({
+      ok: false,
+      reason: 'description-too-long',
+    });
+  });
+
+  it('returns the very same party when the text is what it was', () => {
+    const meetup = testMeetup();
+    expect(setDescription(meetup, '  ').party).toBe(meetup);
+    const set = setDescription(meetup, 'Bring snacks.');
+    if (!set.ok) throw new Error(set.reason);
+    expect(setDescription(set.party, 'Bring snacks.  ').party).toBe(set.party);
+  });
+});
```

Apply to `src/domain/party/timed.test.ts`:

```diff
--- a/src/domain/party/timed.test.ts
+++ b/src/domain/party/timed.test.ts
@@ -1,7 +1,26 @@
 import { describe, expect, it } from 'vitest';
-import { PARTY_NOW, testMeetup } from '../../../test/support/parties.js';
+import {
+  ALICE,
+  BOB,
+  MINUTE,
+  PARTY_NOW,
+  REPORTER,
+  testMeetup,
+  withAttendees,
+} from '../../../test/support/parties.js';
 import { MAX_PARTY_NAME, type MeetupParty } from './party.js';
-import { latestTime, nameOf, OPEN_PARTY_HOURS, settled, startTimeOf, tidyName } from './timed.js';
+import {
+  latestTime,
+  nameOf,
+  OPEN_PARTY_HOURS,
+  setName,
+  setStartTime,
+  setTimedEnd,
+  settled,
+  startTimeOf,
+  tidyName,
+  timedOver,
+} from './timed.js';
 
 const HOUR = 3_600_000;
 const DAY = OPEN_PARTY_HOURS * HOUR;
@@ -103,3 +122,198 @@ describe('settled', () => {
     });
   });
 });
+
+describe('timedOver', () => {
+  it('is over once its end time has passed, to the millisecond', () => {
+    const meetup = withTimes(PARTY_NOW, PARTY_NOW + HOUR);
+    expect(timedOver(meetup, PARTY_NOW + HOUR - 1)).toBe(false);
+    expect(timedOver(meetup, PARTY_NOW + HOUR)).toBe(true);
+  });
+
+  it('is never over without an end time, however long ago it started', () => {
+    expect(timedOver(withTimes(PARTY_NOW, null), PARTY_NOW + 30 * DAY)).toBe(false);
+    expect(timedOver(withTimes(null, null), PARTY_NOW + 30 * DAY)).toBe(false);
+  });
+});
+
+describe('setName', () => {
+  it('gives the party another name, tidied', () => {
+    const meetup = testMeetup();
+    const renamed = setName(meetup, '  Raid  hour\nmeet ');
+    expect(renamed.ok && nameOf(renamed.party)).toBe('Raid hour meet');
+    // Nothing else changed.
+    expect(renamed.ok && { ...renamed.party, timed: meetup.timed }).toEqual(meetup);
+  });
+
+  it('returns the very same party for the name it has', () => {
+    const meetup = testMeetup();
+    expect(setName(meetup, ' Community Day  picnic ')).toEqual({ ok: true, party: meetup });
+    expect(setName(meetup, 'Community Day picnic').party).toBe(meetup);
+  });
+
+  it('refuses a text that is no name', () => {
+    expect(setName(testMeetup(), '   ')).toEqual({ ok: false, reason: 'bad-name' });
+    expect(setName(testMeetup(), 'x'.repeat(MAX_PARTY_NAME + 1))).toEqual({
+      ok: false,
+      reason: 'bad-name',
+    });
+  });
+});
+
+describe('setStartTime', () => {
+  const START = PARTY_NOW + 3 * HOUR;
+  const meetup = withAttendees(testMeetup(), { [ALICE]: {}, [BOB]: {} });
+
+  it('sets the start for everybody, drops the seconds and tells the others', () => {
+    const set = setStartTime(meetup, ALICE, START + 45_678, PARTY_NOW);
+    expect(set).toMatchObject({ ok: true, others: [REPORTER, BOB] });
+    expect(set.ok && startTimeOf(set.party)).toBe(START);
+    // The groups have no meeting time: a meetup starts for everybody at once.
+    expect(set.ok && set.party.groups).toEqual([{ id: 'A' }]);
+  });
+
+  it('moves the last possible time: a day after the start while there is no end', () => {
+    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
+    expect(set.ok && set.party.lastPossibleTime).toBe(START + DAY);
+    const ending = { ...meetup, endTime: START + HOUR, lastPossibleTime: START + HOUR };
+    const withEnd = setStartTime(ending, ALICE, START, PARTY_NOW);
+    expect(withEnd.ok && withEnd.party.lastPossibleTime).toBe(START + HOUR);
+  });
+
+  it('is only for somebody who is signed up', () => {
+    expect(setStartTime(meetup, '200000000000000099', START, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'not-attending',
+    });
+    expect(setStartTime(meetup, '200000000000000099', null, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'not-attending',
+    });
+  });
+
+  it('refuses a start that does not lie before the end', () => {
+    const ending = { ...meetup, endTime: START };
+    expect(setStartTime(ending, ALICE, START - MINUTE, PARTY_NOW).ok).toBe(true);
+    expect(setStartTime(ending, ALICE, START, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'start-after-end',
+    });
+    // Seconds are dropped before the comparison.
+    expect(setStartTime(ending, ALICE, START - 1, PARTY_NOW).ok).toBe(true);
+    expect(setStartTime(ending, ALICE, START + HOUR, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'start-after-end',
+    });
+  });
+
+  it('removes the start with null, and tells the others', () => {
+    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
+    if (!set.ok) throw new Error(set.reason);
+    const removed = setStartTime(set.party, BOB, null, PARTY_NOW);
+    expect(removed).toMatchObject({ ok: true, others: [REPORTER, ALICE] });
+    expect(removed.ok && startTimeOf(removed.party)).toBeNull();
+    expect(removed.ok && removed.party.lastPossibleTime).toBe(PARTY_NOW + DAY);
+  });
+
+  it('gives an old meetup a day from now when its only time is taken away', () => {
+    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
+    if (!set.ok) throw new Error(set.reason);
+    // Three days on, long past the day it had from its start, and warned.
+    const late = START + 3 * DAY;
+    const warned = { ...set.party, deletionTime: late + HOUR };
+    const removed = setStartTime(warned, ALICE, null, late);
+    expect(removed).toMatchObject({
+      ok: true,
+      party: { lastPossibleTime: late + DAY, deletionTime: null },
+    });
+  });
+
+  it('returns the very same party, and tells nobody, when the start is what it was', () => {
+    const set = setStartTime(meetup, ALICE, START, PARTY_NOW);
+    if (!set.ok) throw new Error(set.reason);
+    const again = setStartTime(set.party, BOB, START + 30_000, PARTY_NOW);
+    expect(again).toEqual({ ok: true, party: set.party, others: [] });
+    expect(again.party).toBe(set.party);
+    expect(setStartTime(meetup, ALICE, null, PARTY_NOW).party).toBe(meetup);
+  });
+
+  it('takes a warning away: a start that makes the meetup go on calls the archiving off', () => {
+    const late = PARTY_NOW + DAY + HOUR;
+    const warned = { ...meetup, deletionTime: late + HOUR };
+    const set = setStartTime(warned, ALICE, late + 2 * HOUR, late);
+    expect(set.ok && set.party.deletionTime).toBeNull();
+    // A start in the past that leaves it over changes nothing about the archiving.
+    const past = setStartTime(warned, ALICE, PARTY_NOW + MINUTE, late);
+    expect(past.ok && past.party.deletionTime).toBe(late + HOUR);
+  });
+});
+
+describe('setTimedEnd', () => {
+  const START = PARTY_NOW + 3 * HOUR;
+  const END = START + 2 * HOUR;
+
+  it('sets the end, drops the seconds, and makes it the last possible time', () => {
+    const set = setTimedEnd(withTimes(START, null), END + 59_000, PARTY_NOW);
+    expect(set).toMatchObject({ ok: true, party: { endTime: END, lastPossibleTime: END } });
+  });
+
+  it('works for a meetup without a start, and for anybody (it asks for no member)', () => {
+    const set = setTimedEnd(testMeetup(), END, PARTY_NOW);
+    expect(set).toMatchObject({ ok: true, party: { endTime: END, lastPossibleTime: END } });
+  });
+
+  it('refuses an end that does not lie after the start', () => {
+    const started = withTimes(START, null);
+    expect(setTimedEnd(started, START - HOUR, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'end-before-start',
+    });
+    expect(setTimedEnd(started, START + 30_000, PARTY_NOW)).toEqual({
+      ok: false,
+      reason: 'end-before-start',
+    });
+    expect(setTimedEnd(started, START + MINUTE, PARTY_NOW).ok).toBe(true);
+  });
+
+  it('removes the end with null: the meetup is open again, for a day after its start', () => {
+    const ending = settled(withTimes(START, END), PARTY_NOW);
+    const open = setTimedEnd(ending, null, PARTY_NOW);
+    expect(open).toMatchObject({
+      ok: true,
+      party: { endTime: null, lastPossibleTime: START + DAY },
+    });
+  });
+
+  it('gives an old meetup without a start a day from now when its end is taken away', () => {
+    const ended = settled(withTimes(null, END), PARTY_NOW);
+    const late = END + 3 * DAY;
+    const open = setTimedEnd({ ...ended, deletionTime: late + HOUR }, null, late);
+    expect(open).toMatchObject({
+      ok: true,
+      party: { endTime: null, lastPossibleTime: late + DAY, deletionTime: null },
+    });
+    // With a start it is the start that counts, however long ago: it stays over.
+    const started = { ...settled(withTimes(START, END), PARTY_NOW), deletionTime: late + HOUR };
+    expect(setTimedEnd(started, null, late)).toMatchObject({
+      ok: true,
+      party: { lastPossibleTime: START + DAY, deletionTime: late + HOUR },
+    });
+  });
+
+  it('returns the very same party when the end is what it was', () => {
+    const ending = settled(withTimes(START, END), PARTY_NOW);
+    expect(setTimedEnd(ending, END + 1_000, PARTY_NOW).party).toBe(ending);
+    const open = testMeetup();
+    expect(setTimedEnd(open, null, PARTY_NOW).party).toBe(open);
+  });
+
+  it('takes a warning away when the new end lies ahead', () => {
+    const late = END + HOUR;
+    const warned = { ...settled(withTimes(START, END), PARTY_NOW), deletionTime: late + HOUR };
+    const longer = setTimedEnd(warned, late + 2 * HOUR, late);
+    expect(longer.ok && longer.party.deletionTime).toBeNull();
+    // Removing the end of a meetup that started less than a day ago does the same.
+    const open = setTimedEnd(warned, null, late);
+    expect(open.ok && open.party.deletionTime).toBeNull();
+  });
+});
```

Apply to `src/render/activity.test.ts`:

```diff
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -76,10 +76,39 @@ describe('problemText', () => {
       'gym-taken',
       'other-region',
       'not-a-move',
+      'no-groups',
+      'party-wide-start',
+      'bad-name',
+      'description-too-long',
+      'end-before-start',
+      'start-after-end',
     ];
     const texts = reasons.map((reason) => problemText(reason, { maxNumber: 21 }));
     for (const text of texts) expect(text).toMatch(/^[A-Z].*\.$/);
     expect(new Set(texts).size).toBe(reasons.length);
     expect(problemText('bad-count', { maxNumber: 21 })).toContain('from 1 to 21');
   });
+
+  it('names the kind of party where any kind can give the reason', () => {
+    const said = (reason: PartyProblem) => problemText(reason, { maxNumber: 21 }, 'meetup');
+    expect(said('not-attending')).toBe('You are not signed up for this meetup.');
+    expect(said('no-such-group')).toBe('This meetup has no such group.');
+    expect(said('no-groups')).toBe('A meetup has no groups.');
+    expect(said('party-wide-start')).toBe(
+      'A meetup starts for everybody at once: its groups have no meeting times.',
+    );
+    expect(said('too-many-groups')).toBe('A meetup cannot have more than five groups.');
+    expect(said('end-before-start')).toBe(
+      'A meetup cannot end before it starts. Give a later end, or change the start first with `/meet`.',
+    );
+    expect(said('start-after-end')).toBe(
+      'A meetup cannot start after it ends. Give an earlier start, or change the end first with `/end`.',
+    );
+    expect(said('bad-name')).toBe('Give a name of 1 to 80 characters.');
+    expect(said('description-too-long')).toBe('That is too long: keep it to 1000 characters.');
+    // Without a word it is a raid, as before.
+    expect(problemText('not-attending', { maxNumber: 21 })).toBe(
+      'You are not signed up for this raid.',
+    );
+  });
 });
```

Apply to `src/services/attendance-service.test.ts`:

```diff
--- a/src/services/attendance-service.test.ts
+++ b/src/services/attendance-service.test.ts
@@ -1,5 +1,13 @@
 import { describe, expect, it } from 'vitest';
-import { ALICE, BOB, CAROL, MINUTE, REPORTER, withAttendees } from '../../test/support/parties.js';
+import {
+  ALICE,
+  asRaid,
+  BOB,
+  CAROL,
+  MINUTE,
+  REPORTER,
+  withAttendees,
+} from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
 import { decodeCustomId } from '../discord/custom-id.js';
 import { completeRaid } from '../domain/party/attendance.js';
@@ -359,7 +367,7 @@ describe('AttendanceService: completing a raid', () => {
     await made.attendance.signUp(id, bob, PartyStatus.Present);
     await made.attendance.flush();
     const asked = await made.store.update(id, (party) =>
-      completeRaid(party, ALICE, made.clock.now, 5),
+      completeRaid(asRaid(party), ALICE, made.clock.now, 5),
     );
     made.storage.failing = new Error('the database is away');
     await expect(made.attendance.ask(asked?.party ?? made.current(), [BOB])).rejects.toThrow(
```

Run: `npx vitest run --project unit src/domain/party/attendance.test.ts src/domain/party/meetup.test.ts src/domain/party/timed.test.ts src/render/activity.test.ts src/services/attendance-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/domain/party/attendance.ts`:

```diff
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -2,6 +2,9 @@ import {
   attendeeOf,
   GROUP_IDS,
   groupOf,
+  hasGroups,
+  isRaid,
+  isTimed,
   MAX_MEMBER_NAME,
   membersWhere,
   refused,
@@ -12,8 +15,10 @@ import {
   type GroupId,
   type Party,
   type PartyGroup,
+  type RaidParty,
   type Team,
 } from './party.js';
+import { raidStage } from './raid.js';
 import { PartyStatus } from './status.js';
 
 const MINUTE = 60_000;
@@ -247,7 +252,7 @@ export function leaveParty<P extends Party>(party: P, memberId: string): Change<
  * `CompletePending` until `now + timeoutMinutes`, after which silence counts as yes. `except` is
  * the member whose Done asks them; it is recorded with each of them (`askedBy`).
  */
-function askPresent<P extends Party>(
+function askPresent<P extends RaidParty>(
   party: P,
   groupId: GroupId,
   except: string | undefined,
@@ -280,7 +285,7 @@ function askPresent<P extends Party>(
  * merely interested, or had already completed the raid (`wasComplete`, and then the very same
  * party comes back), asks nobody. Only for an attendee.
  */
-export function completeRaid<P extends Party>(
+export function completeRaid<P extends RaidParty>(
   party: P,
   memberId: string,
   now: number,
@@ -303,8 +308,29 @@ export function completeRaid<P extends Party>(
   };
 }
 
+/**
+ * A member is done with the party. In a raid that completes it (`completeRaid`), which is
+ * refused while the raid is an egg: nobody can have completed that. Any other party has nothing
+ * to complete, so done means leave, as with the legacy bot: the member is taken off (`left`),
+ * nobody is asked anything and nobody ever has the status `Complete`. Only for an attendee.
+ */
+export function finishParty<P extends Party>(
+  party: P,
+  memberId: string,
+  now: number,
+  timeoutMinutes: number,
+): Change<P, { asked: string[]; wasComplete: boolean; left: boolean }> {
+  if (!isRaid(party)) {
+    const gone = leaveParty(party, memberId);
+    return gone.ok ? { ...gone, asked: [], wasComplete: false, left: true } : gone;
+  }
+  if (raidStage(party, now) === 'egg') return refused('not-hatched');
+  const done = completeRaid(party, memberId, now, timeoutMinutes);
+  return done.ok ? { ...done, left: false } : done;
+}
+
 /** Asks the present members of a group, as after its meeting time (see `completeRaid`). */
-export function askGroupWhetherComplete<P extends Party>(
+export function askGroupWhetherComplete<P extends RaidParty>(
   party: P,
   groupId: GroupId,
   now: number,
@@ -390,7 +416,7 @@ export function servedQuestions(party: Party): CompletionQuestion[] {
  * Completes everybody whose time to answer has run out; `completed` lists them. A pending
  * attendee without a time (it cannot happen through these functions) counts as run out.
  */
-export function completeUnanswered<P extends Party>(
+export function completeUnanswered<P extends RaidParty>(
   party: P,
   now: number,
 ): { party: P; completed: string[] } {
@@ -413,7 +439,8 @@ export function completeUnanswered<P extends Party>(
 /**
  * Moves a member to a group. Somebody who is not signed up joins it as coming, alone. A member
  * who was asked whether they completed the raid has answered "not yet" by moving: they are
- * present again. Joining the group they are in changes nothing.
+ * present again. Joining the group they are in changes nothing. Refused with `no-groups` in a
+ * party that has its one group for good.
  */
 export function joinGroup<P extends Party>(
   party: P,
@@ -421,6 +448,7 @@ export function joinGroup<P extends Party>(
   groupId: GroupId,
   limits: AttendanceLimits,
 ): Change<P, { joined: boolean }> {
+  if (!hasGroups(party)) return refused('no-groups');
   const existing = attendeeOf(party, memberId);
   if (!existing) {
     return setAttendance(party, memberId, PartyStatus.Coming, { group: groupId }, limits);
@@ -442,6 +470,7 @@ export function createGroup<P extends Party>(
   memberId: string,
   limits: AttendanceLimits,
 ): Change<P, { group: GroupId; joined: boolean; others: string[] }> {
+  if (!hasGroups(party)) return refused('no-groups');
   const id = GROUP_IDS[party.groups.length];
   if (id === undefined) return refused('too-many-groups');
   const opened: P = { ...party, groups: [...party.groups, { id }], defaultGroupId: id };
@@ -460,6 +489,7 @@ export function labelGroup<P extends Party>(
   memberId: string,
   text: string,
 ): Change<P, { group: GroupId }> {
+  if (!hasGroups(party)) return refused('no-groups');
   const existing = attendeeOf(party, memberId);
   const group = existing && groupOf(party, existing.group);
   if (!group) return refused('not-attending');
@@ -477,13 +507,16 @@ export function labelGroup<P extends Party>(
  * Sets the meeting time of the member's own group, or removes it with null. `others` are the
  * attendees of that group who have not completed the raid, to be told; none when the time did
  * not change. The time is floored to the minute, like a hatch time; the caller has checked it
- * (`resolvePartyTime`). Only for an attendee.
+ * (`resolvePartyTime`). Only for an attendee. Refused with `party-wide-start` in a timed party,
+ * whether or not it has groups: such a party starts for everybody at once (`setStartTime` of
+ * `timed.ts`).
  */
 export function setMeetingTime<P extends Party>(
   party: P,
   memberId: string,
   time: number | null,
 ): Change<P, { group: GroupId; others: string[] }> {
+  if (isTimed(party)) return refused('party-wide-start');
   const existing = attendeeOf(party, memberId);
   const group = existing && groupOf(party, existing.group);
   if (!group) return refused('not-attending');
```

Apply to `src/domain/party/meetup.ts`:

```diff
--- a/src/domain/party/meetup.ts
+++ b/src/domain/party/meetup.ts
@@ -1,4 +1,10 @@
-import { NO_PROMPTS, refused, type Change, type MeetupParty } from './party.js';
+import {
+  MAX_MEETUP_DESCRIPTION,
+  NO_PROMPTS,
+  refused,
+  type Change,
+  type MeetupParty,
+} from './party.js';
 import { PartyStatus } from './status.js';
 import { settled, tidyName } from './timed.js';
 
@@ -62,3 +68,22 @@ export function createMeetup(input: NewMeetup): Change<MeetupParty> {
   };
   return { ok: true, party: settled(meetup, now) };
 }
+
+/**
+ * Sets what the post says about the meetup (`/info`); a text of nothing but white space removes
+ * it. The lines stay as they were typed, without white space at their ends and without more than
+ * one empty line in a row. Refused with `description-too-long`; the very same party comes back
+ * when the text is what it was.
+ */
+export function setDescription(party: MeetupParty, text: string): Change<MeetupParty> {
+  const tidy = text
+    .split(/\r\n|\r|\n/)
+    .map((line) => line.trimEnd())
+    .join('\n')
+    .replace(/\n{3,}/g, '\n\n')
+    .trim();
+  if (tidy.length > MAX_MEETUP_DESCRIPTION) return refused('description-too-long');
+  const description = tidy === '' ? null : tidy;
+  if (description === party.meetup.description) return { ok: true, party };
+  return { ok: true, party: { ...party, meetup: { ...party.meetup, description } } };
+}
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -291,6 +291,14 @@ export function partyWord(party: { type: PartyType }): string {
   return PARTY_WORDS[party.type];
 }
 
+/**
+ * Whether members can open groups in this kind of party, and move between them. A meetup has
+ * its one group for good (as with the legacy bot, whose group commands a meetup did not have).
+ */
+export function hasGroups(party: Party): boolean {
+  return party.type !== 'meetup';
+}
+
 /** Why a change was refused. The commands turn these into sentences. */
 export type PartyProblem =
   /** The member has no attendee record. */
@@ -310,8 +318,17 @@ export type PartyProblem =
   | 'bad-duration'
   /** The member has completed the raid; how they come no longer matters. */
   | 'already-done'
+  /** This kind of party has one group for good (a meetup). */
+  | 'no-groups'
+  /** The party starts for everybody at once: its groups have no meeting times of their own. */
+  | 'party-wide-start'
   /** A name that is empty or too long. */
   | 'bad-name'
+  | 'description-too-long'
+  /** The end would not lie after the start. */
+  | 'end-before-start'
+  /** The start would not lie before the end. */
+  | 'start-after-end'
   /** Another raid of this kind already holds the gym. */
   | 'gym-taken'
   /** The gym lies in no region of the raid's server that has a forum for its post. */
```

Apply to `src/domain/party/timed.ts`:

```diff
--- a/src/domain/party/timed.ts
+++ b/src/domain/party/timed.ts
@@ -1,5 +1,16 @@
-import { MAX_PARTY_NAME, withLastPossibleTime, type TimedParty } from './party.js';
+import {
+  attendeeOf,
+  MAX_PARTY_NAME,
+  membersWhere,
+  refused,
+  withLastPossibleTime,
+  type Change,
+  type TimedDetails,
+  type TimedParty,
+} from './party.js';
+import { PartyStatus } from './status.js';
 
+const MINUTE = 60_000;
 const HOUR = 3_600_000;
 
 /**
@@ -57,3 +68,71 @@ export function latestTime(party: TimedParty, now: number): number {
 export function settled<P extends TimedParty>(party: P, now: number): P {
   return withLastPossibleTime(party, latestTime(party, now), now);
 }
+
+/**
+ * Whether a timed party is over by the clock: its end time has passed. One without an end time
+ * never is: `latestTime` only tells the clean-up when to stop waiting for one.
+ */
+export function timedOver(party: TimedParty, now: number): boolean {
+  return party.endTime !== null && now >= party.endTime;
+}
+
+/** The party with this in the part that every timed party has. */
+function withTimed<P extends TimedParty>(party: P, change: Partial<TimedDetails>): P {
+  return { ...party, timed: { ...party.timed, ...change } };
+}
+
+/**
+ * Gives the party another name. Refused with `bad-name` for a text that is no name; the very
+ * same party comes back when it has that name already.
+ */
+export function setName<P extends TimedParty>(party: P, text: string): Change<P> {
+  const name = tidyName(text);
+  if (name === undefined) return refused('bad-name');
+  return { ok: true, party: name === nameOf(party) ? party : withTimed(party, { name }) };
+}
+
+/**
+ * Sets when the party starts, for everybody, or removes the start with null. Only for an
+ * attendee (as with the legacy bot). A start that does not lie before the end is refused. The
+ * time is floored to the minute; the caller has checked it (`resolvePartyTime`). `others` are
+ * the other attendees, to be told; none when the start did not change.
+ */
+export function setStartTime<P extends TimedParty>(
+  party: P,
+  memberId: string,
+  time: number | null,
+  now: number,
+): Change<P, { others: string[] }> {
+  if (!attendeeOf(party, memberId)) return refused('not-attending');
+  const startTime = time === null ? null : Math.floor(time / MINUTE) * MINUTE;
+  if (startTime !== null && party.endTime !== null && startTime >= party.endTime) {
+    return refused('start-after-end');
+  }
+  if (startTime === startTimeOf(party)) return { ok: true, party, others: [] };
+  const others = membersWhere(
+    party,
+    (attendee, other) => other !== memberId && attendee.status !== PartyStatus.Complete,
+  );
+  return { ok: true, party: settled(withTimed(party, { startTime }), now), others };
+}
+
+/**
+ * Sets when the party ends, or removes the end with null (the legacy bot stored a time of -1
+ * for that by mistake). Anybody may, as with the legacy bot. An end that does not lie after the
+ * start is refused. The time is floored to the minute; the caller has checked it. The very same
+ * party comes back when the end is what it was.
+ */
+export function setTimedEnd<P extends TimedParty>(
+  party: P,
+  time: number | null,
+  now: number,
+): Change<P> {
+  const endTime = time === null ? null : Math.floor(time / MINUTE) * MINUTE;
+  const startTime = startTimeOf(party);
+  if (endTime !== null && startTime !== null && endTime <= startTime) {
+    return refused('end-before-start');
+  }
+  if (endTime === party.endTime) return { ok: true, party };
+  return { ok: true, party: settled({ ...party, endTime }, now) };
+}
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -2,6 +2,7 @@ import { MAX_GROUP_LABEL } from '../domain/party/attendance.js';
 import {
   GROUP_IDS,
   groupOf,
+  MAX_MEETUP_DESCRIPTION,
   MAX_PARTY_NAME,
   type Attendee,
   type Party,
@@ -59,19 +60,30 @@ export function standingLine(
   return `<@${memberId}> is ${standing(party, attendee, options)}.`;
 }
 
-/** Why a change was refused, as a sentence for the member. */
-export function problemText(reason: PartyProblem, limits: { maxNumber: number }): string {
+/**
+ * Why a change was refused, as a sentence for the member. `word` is what the party is called
+ * (`partyWord`): the reasons that any kind of party can give name it.
+ */
+export function problemText(
+  reason: PartyProblem,
+  limits: { maxNumber: number },
+  word = 'raid',
+): string {
   switch (reason) {
     case 'not-attending':
-      return 'You are not signed up for this raid.';
+      return `You are not signed up for this ${word}.`;
     case 'no-such-group':
-      return 'This raid has no such group.';
+      return `This ${word} has no such group.`;
     case 'bad-count':
       return `Give the number of trainers including yourself, from 1 to ${limits.maxNumber}.`;
     case 'in-person-only':
       return 'Elite raids can only be done in person.';
     case 'too-many-groups':
-      return `A raid cannot have more than ${numberWord(GROUP_IDS.length)} groups.`;
+      return `A ${word} cannot have more than ${numberWord(GROUP_IDS.length)} groups.`;
+    case 'no-groups':
+      return `A ${word} has no groups.`;
+    case 'party-wide-start':
+      return `A ${word} starts for everybody at once: its groups have no meeting times.`;
     case 'not-pending':
       return 'You were not asked, or you have answered already.';
     case 'label-too-long':
@@ -90,6 +102,18 @@ export function problemText(reason: PartyProblem, limits: { maxNumber: number })
       return 'The boss of this raid does not have that move.';
     case 'bad-name':
       return `Give a name of 1 to ${MAX_PARTY_NAME} characters.`;
+    case 'description-too-long':
+      return `That is too long: keep it to ${MAX_MEETUP_DESCRIPTION} characters.`;
+    case 'end-before-start':
+      return (
+        `A ${word} cannot end before it starts. Give a later end, or change the start first ` +
+        'with `/meet`.'
+      );
+    case 'start-after-end':
+      return (
+        `A ${word} cannot start after it ends. Give an earlier start, or change the end first ` +
+        'with `/end`.'
+      );
     case 'other-region':
       return (
         'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -5,8 +5,8 @@ import {
   answerCompletion,
   attendanceLimits,
   changeNumber,
-  completeRaid,
   createGroup,
+  finishParty,
   joinGroup,
   labelGroup,
   leaveParty,
@@ -30,12 +30,10 @@ import {
   refused,
   type Attendee,
   type Change,
-  isRaid,
   type GroupId,
   type Party,
   type PartyProblem,
 } from '../domain/party/party.js';
-import { raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Logger } from '../log.js';
 import { standingLine } from '../render/activity.js';
@@ -49,6 +47,9 @@ export interface Member extends MemberInfo {
   id: string;
 }
 
+/** What a line callback of `apply` answers for the usual line: how the member stands now. */
+const STANDING = Symbol('standing');
+
 /** Said in the post when a question is taken back; the question itself is deleted. */
 export const WITHDRAWN_LINE = 'So the others who were asked whether they are done are here again.';
 
@@ -176,18 +177,20 @@ export class AttendanceService {
   }
 
   /**
-   * The member has completed the raid. The others of their group who are present are asked in
-   * the post whether they have too (`asked`). Refused while the raid is an egg.
+   * The member is done (`finishParty`). In a raid they have completed it: the others of their
+   * group who are present are asked in the post whether they have too (`asked`); refused while
+   * the raid is an egg. In any other party done means leave (`left`).
    */
   async done(
     partyId: string,
     member: Member,
-  ): Promise<AttendanceOutcome<{ asked: string[]; wasComplete: boolean }>> {
+  ): Promise<AttendanceOutcome<{ asked: string[]; wasComplete: boolean; left: boolean }>> {
     const now = this.now();
-    const outcome = await this.apply(partyId, member, (party) =>
-      isRaid(party) && raidStage(party, now) === 'egg'
-        ? refused('not-hatched')
-        : completeRaid(party, member.id, now, this.options.settings.raidCompleteTimeout),
+    const outcome = await this.apply(
+      partyId,
+      member,
+      (party) => finishParty(party, member.id, now, this.options.settings.raidCompleteTimeout),
+      (_party, result) => (result.left ? `<@${member.id}> has left.` : STANDING),
     );
     if (outcome.kind === 'ok' && outcome.asked.length > 0) {
       this.inBackground(this.ask(outcome.party, outcome.asked), partyId, 'ask who completed');
@@ -344,9 +347,9 @@ export class AttendanceService {
   /**
    * Runs one change of a member in a party. The member's name and team are noted with it. When
    * the change did something, the post gets a line: what `line` gives, or by default how the
-   * member stands now; `'none'` when the caller says it another way. A line has a key (the
-   * member's, unless `line` names another): a newer line with the same key takes the place of
-   * one that was not sent yet.
+   * member stands now (also when `line` answers `STANDING`); `'none'` when the caller says it
+   * another way. A line has a key (the member's, unless `line` names another): a newer line with
+   * the same key takes the place of one that was not sent yet.
    */
   private async apply<Extra>(
     partyId: string,
@@ -354,7 +357,10 @@ export class AttendanceService {
     change: (party: Party) => Change<Party, Extra>,
     line?:
       | 'none'
-      | ((party: Party, result: Extra) => string | { text: string; key: string } | undefined),
+      | ((
+          party: Party,
+          result: Extra,
+        ) => typeof STANDING | string | { text: string; key: string } | undefined),
   ): Promise<AttendanceOutcome<Extra>> {
     const { store, posts, lines } = this.options;
     const result = await store.update(partyId, (party) => {
@@ -375,9 +381,9 @@ export class AttendanceService {
     if (result.written) posts.changed(partyId);
     if (acted) {
       if (line !== 'none' && party.forumPostId !== null) {
-        const text = line
-          ? line(party, result)
-          : attendee && standingLine(party, member.id, attendee);
+        const given = line ? line(party, result) : STANDING;
+        const text =
+          given === STANDING ? attendee && standingLine(party, member.id, attendee) : given;
         if (typeof text === 'object') lines.say(party.forumPostId, text.text, text.key);
         else if (text) lines.say(party.forumPostId, text, `member:${member.id}`);
       }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/party/attendance.test.ts src/domain/party/meetup.test.ts src/domain/party/timed.test.ts src/render/activity.test.ts src/services/attendance-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 0d74135 -- src test   # must print nothing
npx prettier --check src/domain/party/attendance.test.ts src/domain/party/attendance.ts src/domain/party/meetup.test.ts src/domain/party/meetup.ts src/domain/party/party.ts src/domain/party/timed.test.ts src/domain/party/timed.ts src/render/activity.test.ts src/render/activity.ts src/services/attendance-service.test.ts src/services/attendance-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/domain/party/attendance.test.ts src/domain/party/attendance.ts src/domain/party/meetup.test.ts src/domain/party/meetup.ts src/domain/party/party.ts src/domain/party/timed.test.ts src/domain/party/timed.ts src/render/activity.test.ts src/render/activity.ts src/services/attendance-service.test.ts src/services/attendance-service.ts
git commit -m "The domain of a meetup: its name, description, start and end, and what attendance means in it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,052 unit tests.

---

### Task 4: The clock for both kinds

**Files:**
- Create: `src/domain/party/tick.timed.test.ts`
- Modify: `src/domain/party/tick.ts`

**Interfaces:**
- Consumes: `partyTick` (`tick.ts`), `TickInput`, `TickSettings`; `timedOver`, `latestTime`.
- Produces: `partyTick(party, input)` for any party: a shared prelude (not active; due to be archived), `raidTick` (the old body) and `timedTick` (no stages, no meeting times of groups, no completion; `render` when the start or the end passed since the previous tick or the day changed); the warning time of a timed party is `trainOrMeetupDeletionWarningTime`.

`tick.test.ts` is not touched: it is the proof that a raid's tick is what it was.

Reference commit of the prototype for this task: `a52abf8`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/party/tick.timed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  testMeetup,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { endParty, setSaved, type MeetupParty } from './party.js';
import { PartyStatus } from './status.js';
import { partyTick, type TickInput } from './tick.js';
import { OPEN_PARTY_HOURS, setStartTime, setTimedEnd } from './timed.js';

const rules = testRaidRules();
/** Grace 5 minutes; the warning of a raid 10, that of a train or meetup 60. */
const settings = loadSettings(TEST_SETTINGS_PATH);
const HOUR = 60 * MINUTE;
const DAY = OPEN_PARTY_HOURS * HOUR;

function tick(party: MeetupParty, now: number, extra: Partial<TickInput> = {}) {
  return partyTick(party, {
    now,
    previous: now - MINUTE,
    settings,
    rules,
    // A meetup never asks what an egg hatches as.
    autoset: () => {
      throw new Error('a meetup has no egg');
    },
    ...extra,
  });
}

function changed<T extends { ok: boolean; party?: MeetupParty }>(change: T): MeetupParty {
  if (!change.party) throw new Error('refused');
  return change.party;
}

const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
/** Made at 14:00 by the reporter; Alice set the start to 16:00 and the end to 18:00. */
const planned = changed(
  setTimedEnd(
    changed(setStartTime(withAttendees(testMeetup(), { [ALICE]: {} }), ALICE, START, PARTY_NOW)),
    END,
    PARTY_NOW,
  ),
);

describe('partyTick for a meetup: nothing but its start and its end', () => {
  it('does nothing while nothing is due: not before the start, nor between start and end', () => {
    for (const now of [PARTY_NOW + MINUTE, START - 1, START + MINUTE, END - MINUTE]) {
      expect(tick(planned, now)).toEqual({ party: planned, effects: [], render: false });
      expect(tick(planned, now).party).toBe(planned);
    }
  });

  it('has the post shown anew when the start time passes, once, and says nothing', () => {
    const at16 = tick(planned, START);
    expect(at16).toEqual({ party: planned, effects: [], render: true });
    expect(at16.party).toBe(planned);
    expect(tick(planned, START + MINUTE).render).toBe(false);
    expect(tick(planned, START + 3 * MINUTE, { previous: START - 2 * MINUTE }).render).toBe(true);
  });

  it('has the post shown anew when the end time passes, once, and says nothing', () => {
    const at18 = tick(planned, END);
    expect(at18).toEqual({ party: planned, effects: [], render: true });
    expect(at18.party).toBe(planned);
    expect(tick(planned, END + MINUTE)).toEqual({ party: planned, effects: [], render: false });
    // A tick that skipped over the end sees it too.
    expect(tick(planned, END + 3 * MINUTE, { previous: END - 2 * MINUTE }).render).toBe(true);
  });

  it('never asks anybody whether they are done, and never completes anybody', () => {
    // What a raid would be asked about: present members, and a meeting time that passed.
    const here = withAttendees(planned, {
      [ALICE]: { status: PartyStatus.Present },
      [BOB]: { status: PartyStatus.Present },
    });
    for (const now of [START + 11 * MINUTE, END, END + 4 * MINUTE]) {
      const result = tick(here, now);
      expect(result.effects).toEqual([]);
      expect(result.party).toBe(here);
    }
  });

  it('keeps a start that has passed: there is no meeting time to clear', () => {
    const result = tick(planned, START + 3 * HOUR - MINUTE, { previous: START });
    expect(result.party.timed.startTime).toBe(START);
    expect(result.party.groups).toEqual([{ id: 'A' }]);
  });
});

describe('partyTick for a meetup: archiving', () => {
  it('schedules it five minutes after the end, an hour ahead, with a warning', () => {
    expect(tick(planned, END + 5 * MINUTE).effects).toEqual([]);
    const now = END + 5 * MINUTE + 1;
    const result = tick(planned, now);
    expect(settings.trainOrMeetupDeletionWarningTime).toBe(60);
    expect(result.party.deletionTime).toBe(now + 60 * MINUTE);
    expect(result).toMatchObject({
      effects: [{ kind: 'warn', deletionTime: now + 60 * MINUTE }],
      render: true,
    });
    // Once scheduled, the next tick is quiet.
    expect(tick(result.party, now + MINUTE)).toEqual({
      party: result.party,
      effects: [],
      render: false,
    });
  });

  it('asks for the end at the archiving time, every tick until the party is ended', () => {
    const warned = tick(planned, END + 6 * MINUTE).party;
    const due = (warned.deletionTime ?? 0) + 1;
    expect(tick(warned, due - 2).effects).toEqual([]);
    const result = tick(warned, due);
    expect(result).toEqual({ party: warned, effects: [{ kind: 'end' }], render: false });
    expect(tick(warned, due + MINUTE).effects).toEqual([{ kind: 'end' }]);
    expect(tick(endParty(warned), due + MINUTE)).toMatchObject({ effects: [], render: false });
  });

  it('gives a meetup without an end a day from its start, then warns the same way', () => {
    const open = changed(
      setStartTime(withAttendees(testMeetup(), { [ALICE]: {} }), ALICE, START, PARTY_NOW),
    );
    expect(tick(open, START + DAY + 5 * MINUTE).effects).toEqual([]);
    const now = START + DAY + 6 * MINUTE;
    expect(tick(open, now)).toMatchObject({
      party: { deletionTime: now + 60 * MINUTE },
      effects: [{ kind: 'warn', deletionTime: now + 60 * MINUTE }],
    });
  });

  it('gives a meetup nobody gave a time a day from when it was made', () => {
    const untimed = testMeetup();
    expect(tick(untimed, PARTY_NOW + DAY + 5 * MINUTE).effects).toEqual([]);
    const now = PARTY_NOW + DAY + 6 * MINUTE;
    expect(tick(untimed, now).effects).toEqual([{ kind: 'warn', deletionTime: now + 60 * MINUTE }]);
  });

  it('starts over when a time that was set called the archiving off', () => {
    const untimed = testMeetup();
    const late = PARTY_NOW + DAY + 6 * MINUTE;
    const warned = tick(untimed, late).party;
    expect(warned.deletionTime).not.toBeNull();
    // Somebody says when it ends after all: it is going on again.
    const going = changed(setTimedEnd(warned, late + 2 * HOUR, late + MINUTE));
    expect(going.deletionTime).toBeNull();
    expect(tick(going, late + 2 * MINUTE).effects).toEqual([]);
    const again = late + 2 * HOUR + 6 * MINUTE;
    expect(tick(going, again).effects).toEqual([
      { kind: 'warn', deletionTime: again + 60 * MINUTE },
    ]);
  });

  it('never schedules or ends a meetup a moderator saved', () => {
    const saved = setSaved(planned, true);
    expect(tick(saved, END + 2 * DAY).effects).toEqual([]);
    const warned = tick(planned, END + 6 * MINUTE).party;
    const kept = setSaved(warned, true);
    expect(kept.deletionTime).toBeNull();
    expect(tick(kept, END + 3 * HOUR).effects).toEqual([]);
  });

  it('asks for the end and nothing else when both are due', () => {
    const stale = { ...planned, deletionTime: END - MINUTE };
    expect(tick(stale, END, { previous: null })).toEqual({
      party: stale,
      effects: [{ kind: 'end' }],
      render: false,
    });
  });
});

describe('partyTick for a meetup: the date', () => {
  it('shows the post anew when the day changed since the previous tick, or on the first tick', () => {
    const tomorrow = changed(setTimedEnd(testMeetup(), at('2026-10-15T18:00'), PARTY_NOW));
    const midnight = at('2026-10-14T00:00');
    expect(tick(tomorrow, midnight, { previous: midnight - MINUTE })).toEqual({
      party: tomorrow,
      effects: [],
      render: true,
    });
    expect(tick(tomorrow, midnight + MINUTE).render).toBe(false);
    expect(tick(tomorrow, PARTY_NOW + MINUTE, { previous: null }).render).toBe(true);
  });
});
```

Run: `npx vitest run --project unit src/domain/party/tick.timed.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/domain/party/tick.ts`:

```diff
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -12,14 +12,20 @@ import {
   type RaidBossRef,
   type RaidParty,
   type RaidStage,
+  type TimedParty,
 } from './party.js';
 import { certainMoves, raidBossRef, raidStage, setBoss } from './raid.js';
+import { startTimeOf } from './timed.js';
 
 const MINUTE = 60_000;
 
 export type TickSettings = Pick<
   Settings,
-  'startClearTime' | 'deletionGraceTime' | 'deletionWarningTime' | 'raidCompleteTimeout'
+  | 'startClearTime'
+  | 'deletionGraceTime'
+  | 'deletionWarningTime'
+  | 'trainOrMeetupDeletionWarningTime'
+  | 'raidCompleteTimeout'
 >;
 
 export interface TickInput {
@@ -42,7 +48,10 @@ export interface TickInput {
  * showing the post anew.
  */
 export type TickEffect =
-  /** The raid hatched or ended (or went back, after a time was corrected): post, tags, title. */
+  /**
+   * The raid hatched or ended (or went back, after a time was corrected): post, tags, title.
+   * Only a raid has stages; that a timed party has ended is only shown (`render`).
+   */
   | { kind: 'stage'; from: RaidStage; to: RaidStage; bossSet: boolean }
   /** These present members of a group are asked whether they completed the raid. */
   | { kind: 'ask-complete'; group: GroupId; members: string[] }
@@ -59,7 +68,8 @@ export interface TickResult<P extends Party = Party> {
   /**
    * The post must be shown anew: the tick changed the party, or the calendar day changed since
    * the previous tick (times are shown without a date only on the day itself), or this is the
-   * first tick after a start. False when the tick only asks for the end.
+   * first tick after a start, or the start or the end time of a timed party has passed since
+   * the previous tick. False when the tick only asks for the end.
    */
   render: boolean;
 }
@@ -78,31 +88,86 @@ export function tickAutoset(bosses: {
 }
 
 /**
- * Everything the clock does to a raid, as one pure step: given the party and the time, the
+ * Everything the clock does to a party, as one pure step: given the party and the time, the
  * party as it should be now and what the caller has to do about it.
  *
  * Every rule compares the time with what the party itself records (the stage its post shows, a
  * group's clear time, an attendee's time to answer, the archiving time), so one tick after the
  * bot was down for an hour applies everything that was missed, and a second tick straight after
- * it does nothing. The one thing that depends on the previous tick is the change of the
- * calendar day; the first tick after a start treats it as changed.
+ * it does nothing. What depends on the previous tick is only whether the post is shown anew:
+ * for the change of the calendar day, and for the start and the end of a timed party; the first
+ * tick after a start shows every post.
  *
- * A party that is due to be archived gets that and nothing else.
+ * A party that is due to be archived gets that and nothing else, whatever its kind. A raid then
+ * has its stages, the meeting times of its groups and the questions to those who are present
+ * (`raidTick`); a timed party has none of these (`timedTick`).
  */
 export function partyTick<P extends Party>(party: P, input: TickInput): TickResult<P>;
 export function partyTick(party: Party, input: TickInput): TickResult {
-  // Only raids have a clock so far: nothing makes another kind of party yet.
-  if (!isRaid(party)) return { party, effects: [], render: false };
-  return raidTick(party, input);
+  if (party.status !== 'active') return { party, effects: [], render: false };
+  if (!party.saved && party.deletionTime !== null && input.now >= party.deletionTime) {
+    return { party, effects: [{ kind: 'end' }], render: false };
+  }
+  return isRaid(party) ? raidTick(party, input) : timedTick(party, input);
 }
 
-function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
+/**
+ * The party with its archiving scheduled, `warningMinutes` ahead, once the last moment it can
+ * be going on is past by the grace time; the very same party while that is not so, or when it
+ * is scheduled already or a moderator keeps the party.
+ */
+function scheduled<P extends Party>(party: P, input: TickInput, warningMinutes: number): P {
   const { now, settings } = input;
+  const over = party.lastPossibleTime;
+  if (
+    party.saved ||
+    party.deletionTime !== null ||
+    over === null ||
+    now <= over + settings.deletionGraceTime * MINUTE
+  ) {
+    return party;
+  }
+  return { ...party, deletionTime: now + warningMinutes * MINUTE };
+}
+
+/** Whether the calendar day changed since the previous tick; the first tick takes it as changed. */
+function dayChanged(input: TickInput): boolean {
+  const { zone } = input.rules;
+  return (
+    input.previous === null ||
+    !DateTime.fromMillis(input.previous, { zone }).hasSame(
+      DateTime.fromMillis(input.now, { zone }),
+      'day',
+    )
+  );
+}
+
+/**
+ * The clock of a meetup (and of a train from plan 3B). There is no egg that hatches, no meeting
+ * time of a group to clear and nobody to ask whether they are done: only the archiving, which
+ * goes by the end time, or by the day a party without one is given (`latestTime`), and is
+ * announced `trainOrMeetupDeletionWarningTime` ahead, longer than for a raid.
+ *
+ * When the start or the end time passes, the post is shown anew (it says "started", then
+ * "ended", from then on), and nothing is said. That is known by the previous tick and not
+ * recorded in the party: the first tick after a start shows every post anyway.
+ */
+function timedTick(party: TimedParty, input: TickInput): TickResult<TimedParty> {
+  const { now, previous, settings } = input;
   const effects: TickEffect[] = [];
-  if (party.status !== 'active') return { party, effects, render: false };
-  if (!party.saved && party.deletionTime !== null && now >= party.deletionTime) {
-    return { party, effects: [{ kind: 'end' }], render: false };
+  const current = scheduled(party, input, settings.trainOrMeetupDeletionWarningTime);
+  if (current.deletionTime !== null && current !== party) {
+    effects.push({ kind: 'warn', deletionTime: current.deletionTime });
   }
+  const passed = (time: number | null): boolean =>
+    time !== null && previous !== null && previous < time && now >= time;
+  const shown = passed(startTimeOf(party)) || passed(party.endTime);
+  return { party: current, effects, render: current !== party || shown || dayChanged(input) };
+}
+
+function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
+  const { now, settings } = input;
+  const effects: TickEffect[] = [];
   let current = party;
 
   // The stage by the clock against the stage the post shows.
@@ -148,28 +213,14 @@ function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
     effects.push({ kind: 'completed', members: unanswered.completed });
   }
 
-  const over = current.lastPossibleTime;
-  if (
-    !current.saved &&
-    current.deletionTime === null &&
-    over !== null &&
-    now > over + settings.deletionGraceTime * MINUTE
-  ) {
-    const deletionTime = now + settings.deletionWarningTime * MINUTE;
-    current = { ...current, deletionTime };
-    effects.push({ kind: 'warn', deletionTime });
+  const warned = scheduled(current, input, settings.deletionWarningTime);
+  if (warned.deletionTime !== null && warned !== current) {
+    current = warned;
+    effects.push({ kind: 'warn', deletionTime: warned.deletionTime });
   }
 
   // Times are shown without a date only on the day itself.
-  const { zone } = input.rules;
-  const dayChanged =
-    input.previous === null ||
-    !DateTime.fromMillis(input.previous, { zone }).hasSame(
-      DateTime.fromMillis(now, { zone }),
-      'day',
-    );
-
-  return { party: current, effects, render: current !== party || dayChanged };
+  return { party: current, effects, render: current !== party || dayChanged(input) };
 }
 
 function withGroup(party: RaidParty, group: PartyGroup): RaidParty {
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/party/tick.timed.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff a52abf8 -- src test   # must print nothing
npx prettier --check src/domain/party/tick.timed.test.ts src/domain/party/tick.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/domain/party/tick.timed.test.ts src/domain/party/tick.ts
git commit -m "The clock for both kinds: partyTick dispatches on the type, and a meetup is warned an hour ahead" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,065 unit tests.

---

### Task 5: What a meetup shows

**Files:**
- Create: `src/render/meetup-post.test.ts`, `src/render/meetup-post.ts`, `src/render/party-post.ts`
- Modify: `src/commands/admin/setup-forums.test.ts`, `src/commands/parties/delete.test.ts`, `src/commands/parties/delete.ts`, `src/commands/raids/change.ts`, `src/commands/raids/raid-input.ts`, `src/commands/raids/raid.test.ts`, `src/render/mirrors.ts`, `src/render/party-controls.test.ts`, `src/render/party-controls.ts`, `src/render/raid-post.ts`, `src/render/summary.test.ts`, `src/render/summary.ts`, `src/render/text.test.ts`, `src/render/text.ts`, `src/services/party-mirrors.ts`, `src/services/party-service.test.ts`, `src/services/party-service.ts`, `src/services/raid-change-service.ts`, `test/support/fake-gateway.test.ts`, `test/support/fake-gateway.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: `renderRaidPost` and its helpers (`raid-post.ts`), `partyControls`, `renderSummary`, `renderRegionLink`, `text.ts`, `FakePartyGateway`.
- Produces: `src/render/party-post.ts` with what every post shares (`FORUM_TAGS`, `ForumTag`, `RenderedPost`, `PostEmoji`, `groupField(view, group, options)`, `inShownOrder`, `attendeeTexts`, `fitEmbed`, `tidyTitle`, `trainerCount`, `ENDED_COLOUR`, `KEPT_OPEN`), moved out of `raid-post.ts`; `renderMeetupPost(view: MeetupPostView)`, `meetupTitle`, `meetupTags` (`meetup-post.ts`); `partyControls(party)` without Done and Set time for a meetup; `renderSummary` with a section for meetups; `renderRegionLink(postId, word)`; `plainLines`, `timestamp` style `F`, `isFarOff`, `clockOrDate` in `text.ts`; `truncate` never leaves a lone backslash; the fake gateway checks an embed against Discord's limits.

The information stands in the embed's description under **Information** and is never cut. A meetup whose `status` is `ended` is shown as over whatever its times say. `raid-post.test.ts` keeps its expectations.

Reference commit of the prototype for this task: `669c6dc`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/admin/setup-forums.test.ts`:

```diff
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -11,7 +11,7 @@ import {
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { InteractionRouter } from '../../discord/router.js';
-import { FORUM_TAGS } from '../../render/raid-post.js';
+import { FORUM_TAGS } from '../../render/party-post.js';
 import { admin } from './index.js';
 
 async function setup() {
```

Apply to `src/commands/parties/delete.test.ts`:

```diff
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -55,7 +55,7 @@ async function setup() {
   const submit = (reason: string, extra: object = {}) =>
     handle(
       fakeModal({
-        customId: deletionForm(made.party.id).custom_id,
+        customId: deletionForm(made.party).custom_id,
         userId: ALICE,
         fields: { [DELETE_REASON_INPUT]: reason },
         guildRoleNames,
@@ -448,7 +448,7 @@ describe('requests to delete a raid: what can go wrong on the way', () => {
 
 describe('deletionForm', () => {
   it('stays within what Discord allows for a form', () => {
-    const form = deletionForm('00000000-0000-4000-8000-000000000001');
+    const form = deletionForm({ id: '00000000-0000-4000-8000-000000000001', type: 'raid' });
     expect(form.title.length).toBeLessThanOrEqual(45);
     expect(form.custom_id.length).toBeLessThanOrEqual(100);
     const rows = form.components as unknown as {
```

Apply to `src/commands/raids/raid.test.ts`:

```diff
--- a/src/commands/raids/raid.test.ts
+++ b/src/commands/raids/raid.test.ts
@@ -21,7 +21,7 @@ import { createTestContext } from '../../../test/support/test-context.js';
 import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
-import { FORUM_TAGS } from '../../render/raid-post.js';
+import { FORUM_TAGS } from '../../render/party-post.js';
 import { raid, raidControls } from './raid.js';
 
 const OTHER_MEMBER = '700000000000000002';
```

Create `src/render/meetup-post.test.ts`:

```ts
import type { APIEmbed } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  PARTY_ZONE,
  REPORTER,
  testMeetup,
  testRaid,
  withAttendees,
} from '../../test/support/parties.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { setDescription } from '../domain/party/meetup.js';
import { endParty, type Attendee, type MeetupParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { meetupTags, meetupTitle, renderMeetupPost, type MeetupPostView } from './meetup-post.js';
import { partyControls } from './party-controls.js';
import { KEPT_OPEN } from './party-post.js';
import { renderRaidPost } from './raid-post.js';
import { LIMITS } from './text.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const DAY = 24 * 60 * MINUTE;

const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');

function view(party: MeetupParty, extra: Partial<MeetupPostView> = {}): MeetupPostView {
  return { party, now: PARTY_NOW, zone: PARTY_ZONE, emoji, ...extra };
}

/** The test meetup with these times, as they are stored. */
function timed(start: number | null, end: number | null, base = testMeetup()): MeetupParty {
  return { ...base, endTime: end, timed: { ...base.timed, startTime: start } };
}

/** The line of the description that says the times: the second. */
function timesLine(party: MeetupParty, now = PARTY_NOW): string | undefined {
  return renderMeetupPost(view(party, { now })).embed.description?.split('\n')[1];
}

function field(embed: APIEmbed, name: RegExp) {
  return embed.fields?.find((f) => name.test(f.name));
}

function described(text: string, base = testMeetup()): MeetupParty {
  const set = setDescription(base, text);
  if (!set.ok) throw new Error(set.reason);
  return set.party;
}

/** The characters Discord counts towards the 6000 of one embed. */
function embedSize(embed: APIEmbed): number {
  return (
    (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0)
  );
}

const NO_TIME =
  'No time has been set yet: `/meet` sets the start. ' +
  `Without one this post is archived ${stamp(PARTY_NOW + DAY, 'R')}.`;

describe('meetupTitle and meetupTags', () => {
  it('titles the post with what it is and its name', () => {
    expect(meetupTitle(testMeetup())).toBe('Meetup · Community Day picnic');
    const long = meetupTitle(testMeetup({ name: 'x'.repeat(80) }));
    expect(long).toBe(`Meetup · ${'x'.repeat(80)}`);
    expect(long.length).toBeLessThanOrEqual(LIMITS.title);
  });

  it('tags it as a meetup, and as ended once its end time has passed', () => {
    expect(meetupTags(timed(START, END), PARTY_NOW)).toEqual(['Meetup']);
    expect(meetupTags(timed(START, END), END - 1)).toEqual(['Meetup']);
    expect(meetupTags(timed(START, END), END)).toEqual(['Meetup', 'Ended']);
    // Not by the day a meetup without an end is given, while it is still active.
    expect(meetupTags(timed(START, null), START + 30 * DAY)).toEqual(['Meetup']);
  });

  it('tags a meetup that has ended as ended, whatever its times', () => {
    expect(meetupTags(endParty(testMeetup()), PARTY_NOW)).toEqual(['Meetup', 'Ended']);
    expect(meetupTags(endParty(timed(START, null)), START + MINUTE)).toEqual(['Meetup', 'Ended']);
  });
});

describe('renderMeetupPost', () => {
  it('shows the name, what it is, that it has no time yet, who made it and who comes', () => {
    const rendered = renderMeetupPost(view(testMeetup()));
    expect(rendered.title).toBe('Meetup · Community Day picnic');
    expect(rendered.tags).toEqual(['Meetup']);
    expect(rendered.embed).toEqual({
      title: 'Community Day picnic',
      description: `**Meetup**\n${NO_TIME}\nCreated by <@${REPORTER}>.`,
      color: 0x3498db,
      fields: [{ name: 'Trainers (1)', value: `**Interested** <@${REPORTER}>` }],
    });
    expect(rendered.message).toEqual({
      embeds: [rendered.embed],
      components: partyControls(testMeetup()),
    });
  });

  it('is nothing like a raid: no gym link, no picture, another colour', () => {
    const { embed } = renderMeetupPost(view(testMeetup()));
    expect(embed.url).toBeUndefined();
    expect(embed.thumbnail).toBeUndefined();
    const raid = renderRaidPost({
      party: testRaid(),
      now: PARTY_NOW,
      gym: testGyms()[0],
      boss: undefined,
      catalogue: catalogueFixture(),
      showUnknownMoves: true,
      emoji,
      zone: PARTY_ZONE,
    });
    expect(embed.color).not.toBe(raid.embed.color);
  });

  it('makes a name plain in the embed and leaves it raw in the title of the post', () => {
    const rendered = renderMeetupPost(view(testMeetup({ name: '**Bold** @everyone <@1>' })));
    expect(rendered.title).toBe('Meetup · **Bold** @everyone <@1>');
    expect(rendered.embed.title).toBe('\\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>');
  });

  it('always names who made it, as the first trainer in its list does anyway', () => {
    // Not a state `createMeetup` makes: the post does not go by the flag of a raid report.
    const flagged = { ...testMeetup(), anonymous: true };
    expect(renderMeetupPost(view(flagged)).embed.description?.split('\n')[2]).toBe(
      `Created by <@${REPORTER}>.`,
    );
  });

  it('says that a moderator keeps it, but not in the last showing of a closed one', () => {
    const saved = { ...testMeetup(), saved: true };
    expect(renderMeetupPost(view(saved)).embed.description?.split('\n').at(-1)).toBe(KEPT_OPEN);
    const closed = renderMeetupPost(view(saved, { closed: 'This meetup was closed by <@9>.' }));
    expect(closed.embed.description).not.toContain(KEPT_OPEN);
  });
});

describe('the times of a meetup post', () => {
  it('tells a meetup without a time how to set one, and when the post goes without', () => {
    expect(timesLine(testMeetup())).toBe(NO_TIME);
    // Once the archiving is scheduled, that is the moment.
    const due = PARTY_NOW + DAY + 66 * MINUTE;
    expect(timesLine({ ...testMeetup(), deletionTime: due }, PARTY_NOW + DAY + 6 * MINUTE)).toBe(
      'No time has been set yet: `/meet` sets the start. ' +
        `Without one this post is archived ${stamp(due, 'R')}.`,
    );
    // A post a moderator keeps is not archived by itself.
    expect(timesLine({ ...testMeetup(), saved: true })).toBe(
      'No time has been set yet: `/meet` sets the start.',
    );
  });

  it('counts down to the start, and names the end after it', () => {
    expect(timesLine(timed(START, END))).toBe(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}. Ends at ${stamp(END)}.`,
    );
    expect(timesLine(timed(START, null))).toBe(`Starts ${stamp(START, 'R')}, at ${stamp(START)}.`);
  });

  it('counts down to the end once it has started', () => {
    expect(timesLine(timed(START, END), START)).toBe(
      `Started at ${stamp(START)}. Ends ${stamp(END, 'R')}, at ${stamp(END)}.`,
    );
    expect(timesLine(timed(START, END), START - 1)).toMatch(/^Starts /);
  });

  it('says how long ago a meetup without an end started', () => {
    expect(timesLine(timed(START, null), START + 30 * MINUTE)).toBe(
      `Started ${stamp(START, 'R')}, at ${stamp(START)}.`,
    );
  });

  it('counts down to the end of a meetup without a start', () => {
    expect(timesLine(timed(null, END))).toBe(`Ends ${stamp(END, 'R')}, at ${stamp(END)}.`);
  });

  it('shows the weekday and date of a time that is not today, and only of that one', () => {
    const tomorrow = at('2026-10-14T10:00');
    const dayAfter = at('2026-10-15T12:00');
    expect(timesLine(timed(tomorrow, dayAfter))).toBe(
      `Starts ${stamp(tomorrow, 'R')}, at ${stamp(tomorrow, 'F')}. Ends at ${stamp(dayAfter, 'F')}.`,
    );
    // On the day itself the clock time is enough for the start; the end is still another day.
    expect(timesLine(timed(tomorrow, dayAfter), at('2026-10-14T00:00'))).toBe(
      `Starts ${stamp(tomorrow, 'R')}, at ${stamp(tomorrow)}. Ends at ${stamp(dayAfter, 'F')}.`,
    );
    // A meetup that began yesterday says so with the date.
    expect(timesLine(timed(START, dayAfter), at('2026-10-14T09:00'))).toBe(
      `Started at ${stamp(START, 'F')}. Ends ${stamp(dayAfter, 'R')}, at ${stamp(dayAfter, 'F')}.`,
    );
  });

  it('is over once the end time has passed: red, tagged, and the end with its day', () => {
    const rendered = renderMeetupPost(view(timed(START, END), { now: END }));
    expect(rendered.embed.description?.split('\n')[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
    expect(rendered.embed.color).toBe(0xe74c3c);
    expect(rendered.tags).toEqual(['Meetup', 'Ended']);
    const before = renderMeetupPost(view(timed(START, END), { now: END - 1 }));
    expect(before.embed.color).toBe(0x3498db);
  });

  it('is not over by the day a meetup without an end is given: it only started long ago', () => {
    const late = START + 3 * DAY;
    const rendered = renderMeetupPost(view(timed(START, null), { now: late }));
    expect(rendered.embed.color).toBe(0x3498db);
    expect(rendered.tags).toEqual(['Meetup']);
    expect(rendered.embed.description?.split('\n')[1]).toBe(
      `Started ${stamp(START, 'R')}, at ${stamp(START, 'F')}.`,
    );
  });

  it('shows a meetup that has ended as over, also one that never had an end time', () => {
    // The last showing before the post is archived: it must not look as if it went on.
    for (const party of [testMeetup(), timed(START, null)]) {
      const rendered = renderMeetupPost(view(endParty(party), { now: START + 2 * DAY }));
      expect(rendered.embed.description?.split('\n').slice(0, 3)).toEqual([
        '**Meetup**',
        'This meetup is over.',
        `Created by <@${REPORTER}>.`,
      ]);
      expect(rendered.embed.color).toBe(0xe74c3c);
      expect(rendered.tags).toEqual(['Meetup', 'Ended']);
    }
    // With an end time it says when, also when that end still lay ahead (it was closed early).
    const early = renderMeetupPost(view(endParty(timed(START, END)), { now: START }));
    expect(early.embed.description?.split('\n')[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
    expect(early.embed.color).toBe(0xe74c3c);
  });

  it('says in the place of the times that it was closed, as ended whatever the clock says', () => {
    const closed = 'This meetup was closed by <@200000000000000009>.';
    const rendered = renderMeetupPost(view(timed(START, END), { closed }));
    expect(rendered.embed.description?.split('\n')).toEqual([
      '**Meetup**',
      closed,
      `Created by <@${REPORTER}>.`,
    ]);
    expect(rendered.embed.color).toBe(0xe74c3c);
    expect(rendered.tags).toEqual(['Meetup', 'Ended']);
    // One that had ended by the clock already is tagged once.
    expect(renderMeetupPost(view(timed(START, END), { closed, now: END })).tags).toEqual([
      'Meetup',
      'Ended',
    ]);
  });
});

describe('the information of a meetup post', () => {
  const information = (party: MeetupParty): string | undefined =>
    renderMeetupPost(view(party)).embed.description?.split('\n\n**Information**\n')[1];

  it('has no such heading while nobody wrote anything', () => {
    const { embed } = renderMeetupPost(view(testMeetup()));
    expect(embed.description).not.toContain('Information');
    expect(embed.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
  });

  it('shows what the members wrote under the head lines, line by line', () => {
    const { embed } = renderMeetupPost(
      view(described('Bring snacks.\n\nWe meet at the fountain.')),
    );
    expect(embed.description).toBe(
      `**Meetup**\n${NO_TIME}\nCreated by <@${REPORTER}>.\n\n` +
        '**Information**\nBring snacks.\n\nWe meet at the fountain.',
    );
    // It is no field: the trainers are the only one.
    expect(embed.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
  });

  it('puts it under the line that the post is kept', () => {
    const { embed } = renderMeetupPost(view({ ...described('Bring snacks.'), saved: true }));
    expect(embed.description?.split('\n').slice(3)).toEqual([
      KEPT_OPEN,
      '',
      '**Information**',
      'Bring snacks.',
    ]);
  });

  it('makes every line of it plain: no Markdown, no mention, no link to a channel', () => {
    expect(
      information(described('# Big\n> quoted **bold**\n@everyone <@123> <#456>\n- item')),
    ).toBe(
      '\\# Big\n\\> quoted \\*\\*bold\\*\\*\n@\u200beveryone <\u200b@123> <\u200b#456>\n\\- item',
    );
  });

  it('never cuts what a form accepts: a thousand characters that all need escaping', () => {
    // Every `<` that something follows gets a character after it: the text is twice as long.
    const { embed } = renderMeetupPost(view(described('<'.repeat(1000))));
    expect(information(described('<'.repeat(1000)))).toBe(`${'<\u200b'.repeat(999)}<`);
    expect((embed.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
    // The same for what is escaped with a backslash, a line each.
    expect(information(described('_\n'.repeat(500)))).toBe('\\_\n'.repeat(500).trimEnd());
  });

  it('stays an embed Discord takes with the longest text, the longest name and a crowd', () => {
    const base = described('<'.repeat(1000), testMeetup({ name: '<'.repeat(80) }));
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 400; n++) {
      crowd[`300000000000${String(n).padStart(6, '0')}`] = { number: 5, remote: true };
    }
    const { embed } = renderMeetupPost(view(withAttendees({ ...base, saved: true }, crowd)));
    expect((embed.title ?? '').length).toBeLessThanOrEqual(LIMITS.embedTitle);
    expect((embed.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
    expect(embedSize(embed)).toBeLessThanOrEqual(LIMITS.embedTotal);
    for (const f of embed.fields ?? []) expect(f.value.length).toBeLessThanOrEqual(1024);
    // The text is whole; it is the list of trainers that gives way.
    expect(embed.description?.endsWith(`${'<\u200b'.repeat(999)}<`)).toBe(true);
    expect(field(embed, /Trainers/)?.value).toMatch(/…and \d+ more/);
  });
});

describe('the trainers of a meetup post', () => {
  it('lists them by status as a raid does, with head counts, remote and teams', () => {
    const meetup = withAttendees(testMeetup(), {
      [ALICE]: { status: PartyStatus.Present, number: 3, team: 'mystic', name: 'Alice' },
      [BOB]: { status: PartyStatus.Coming, remote: true },
      [CAROL]: { status: PartyStatus.Coming, team: 'valor', name: 'Carol' },
    });
    const { embed } = renderMeetupPost(view(meetup));
    expect(field(embed, /Trainers/)).toEqual({
      name: 'Trainers (6)',
      value:
        `**Here** ❄️ <@${ALICE}> +2\n` +
        `**Coming** <@${BOB}> 🛰️, 🔥 <@${CAROL}>\n` +
        `**Interested** <@${REPORTER}>`,
    });
  });

  it('has no Done list and tells nobody to split up: there is no lobby', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 30; n++) crowd[`300000000000${String(n).padStart(6, '0')}`] = {};
    const { embed } = renderMeetupPost(view(withAttendees(testMeetup(), crowd)));
    expect(embed.fields?.map((f) => f.name)).toEqual(['Trainers (31)']);
    expect(field(embed, /Trainers/)?.value).not.toContain('lobby');
  });

  it('says so when nobody is signed up', () => {
    const empty = { ...testMeetup(), attendees: {} };
    expect(field(renderMeetupPost(view(empty)).embed, /Trainers/)).toEqual({
      name: 'Trainers (0)',
      value: 'Nobody yet.',
    });
  });
});

describe('the controls of a meetup post', () => {
  const labels = (party: MeetupParty) =>
    partyControls(party).map((row) =>
      row.components.map((component) => ('label' in component ? component.label : undefined)),
    );

  it('has no Done and no "Set time": Interested, Join, Here, Leave, then the head count', () => {
    expect(labels(testMeetup())).toEqual([
      ['Interested', 'Join', 'Here', 'Leave'],
      ['−1', '+1', 'Remote / in person'],
    ]);
  });

  it('names the meetup in every custom id, like the controls of a raid', () => {
    const meetup = testMeetup();
    for (const row of partyControls(meetup)) {
      for (const component of row.components) {
        if (!('custom_id' in component)) throw new Error('a control without a custom id');
        expect(decodeCustomId(component.custom_id)).toMatchObject({ kind: 'party', id: meetup.id });
      }
    }
  });

  it('is the same whatever its times', () => {
    expect(partyControls(timed(START, END))).toEqual(partyControls(testMeetup()));
  });
});
```

Apply to `src/render/party-controls.test.ts`:

```diff
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -12,6 +12,7 @@ import type { RaidParty } from '../domain/party/party.js';
 import { setHatchTime } from '../domain/party/raid.js';
 import {
   completionQuestion,
+  deletionForm,
   groupWords,
   isPartyAction,
   PARTY_ACTIONS,
@@ -177,3 +178,20 @@ describe('groupWords', () => {
     expect(groupWords({ id: 'B', label: '**park**' })).toBe('group B (\\*\\*park\\*\\*)');
   });
 });
+
+describe('deletionForm', () => {
+  it('names the kind of party it asks about, within the 45 characters of a title', () => {
+    const raid = deletionForm({ id: '00000000-0000-4000-8000-000000000001', type: 'raid' });
+    expect(raid.title).toBe('Ask the moderators to delete this raid');
+    const meetup = deletionForm({ id: '00000000-0000-4000-8000-000000000002', type: 'meetup' });
+    expect(meetup.title).toBe('Ask the moderators to delete this meetup');
+    expect(meetup.title.length).toBeLessThanOrEqual(45);
+    expect(JSON.stringify(meetup)).not.toMatch(/raid/i);
+    expect(decodeCustomId(meetup.custom_id)).toEqual({
+      kind: PARTY_KIND,
+      id: '00000000-0000-4000-8000-000000000002',
+      action: 'delete',
+      args: [],
+    });
+  });
+});
```

Apply to `src/render/summary.test.ts`:

```diff
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -4,14 +4,15 @@ import {
   at,
   MINUTE,
   PARTY_NOW,
+  testMeetup,
   testRaid,
   testRaidRules,
   withAttendees,
 } from '../../test/support/parties.js';
-import { endParty } from '../domain/party/party.js';
-import type { RaidParty } from '../domain/party/party.js';
+import type { MeetupParty, RaidParty } from '../domain/party/party.js';
 import { setEndTime, setHatchTime } from '../domain/party/raid.js';
-import { renderRegionLink, renderSummary, type ListedRaid } from './summary.js';
+import { endParty } from '../domain/party/party.js';
+import { renderRegionLink, renderSummary, type ListedMeetup, type ListedRaid } from './summary.js';
 
 const rules = testRaidRules();
 const ID = (n: number): string => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
@@ -103,3 +104,148 @@ describe('renderRegionLink', () => {
     expect(renderRegionLink('300000000000000001')).toBe('New raid: <#300000000000000001>');
   });
 });
+
+describe('renderSummary with meetups', () => {
+  const HOUR = 60 * MINUTE;
+  const stamp = (time: number) => `<t:${time / 1000}:R>`;
+  let posts = 0;
+
+  /** A meetup for the list, with a post, made `order` minutes after `PARTY_NOW`. */
+  function meetup(
+    order: number,
+    times: { start?: number; end?: number } = {},
+    change: (party: MeetupParty) => MeetupParty = (party) => party,
+  ): ListedMeetup {
+    const made = testMeetup({ id: ID(50 + order), now: PARTY_NOW + order * MINUTE });
+    const party: MeetupParty = change({
+      ...made,
+      forumPostId: `3000000000000001${String(posts++).padStart(2, '0')}`,
+      endTime: times.end ?? null,
+      timed: { ...made.timed, startTime: times.start ?? null },
+    });
+    return { party, title: `Meetup · ${party.timed.name}` };
+  }
+  const link = (listed: ListedMeetup) => `<#${listed.party.forumPostId ?? ''}>`;
+
+  it('lists them under the raids, under a heading of their own', () => {
+    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
+    const picnic = meetup(1, { start: PARTY_NOW + 2 * HOUR });
+    expect(renderSummary([raid], PARTY_NOW, [picnic]).split('\n')).toEqual([
+      '<#300000000000000001> · no time set · 1 trainer',
+      '',
+      '**Meetups**',
+      `${link(picnic)} · starts ${stamp(PARTY_NOW + 2 * HOUR)} · 1 trainer`,
+    ]);
+  });
+
+  it('still says that there is no raid when there are only meetups', () => {
+    const picnic = meetup(1);
+    expect(renderSummary([], PARTY_NOW, [picnic]).split('\n')).toEqual([
+      'No raids right now. Report one with `/raid`.',
+      '',
+      '**Meetups**',
+      `${link(picnic)} · no time set · 1 trainer`,
+    ]);
+  });
+
+  it('is the list it always was for a region without meetups', () => {
+    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
+    expect(renderSummary([raid], PARTY_NOW, [])).toBe(renderSummary([raid], PARTY_NOW));
+    expect(renderSummary([], PARTY_NOW, [])).toBe('No raids right now. Report one with `/raid`.');
+  });
+
+  it('says the time that matters: the start, then the end, or since when it goes on', () => {
+    const ahead = meetup(1, { start: PARTY_NOW + HOUR, end: PARTY_NOW + 3 * HOUR });
+    const going = meetup(2, { start: PARTY_NOW - HOUR, end: PARTY_NOW + HOUR });
+    const open = meetup(3, { start: PARTY_NOW - 2 * HOUR });
+    const endOnly = meetup(4, { end: PARTY_NOW + 5 * HOUR });
+    const crowd = meetup(5, {}, (party) => withAttendees(party, { [ALICE]: { number: 4 } }));
+    const lines = renderSummary([], PARTY_NOW, [ahead, going, open, endOnly, crowd]).split('\n');
+    expect(lines.slice(3)).toEqual([
+      `${link(open)} · started ${stamp(PARTY_NOW - 2 * HOUR)} · 1 trainer`,
+      `${link(going)} · ends ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
+      `${link(ahead)} · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
+      `${link(endOnly)} · ends ${stamp(PARTY_NOW + 5 * HOUR)} · 1 trainer`,
+      `${link(crowd)} · no time set · 5 trainers`,
+    ]);
+  });
+
+  it('orders them by their start, then those without one as they were made', () => {
+    const late = meetup(1, { start: PARTY_NOW + 5 * HOUR });
+    const second = meetup(3);
+    const first = meetup(2);
+    const soon = meetup(4, { start: PARTY_NOW + HOUR });
+    const lines = renderSummary([], PARTY_NOW, [late, second, first, soon]).split('\n');
+    expect(lines.slice(3).map((text) => text.split(' ')[0])).toEqual(
+      [soon, late, first, second].map(link),
+    );
+  });
+
+  it('leaves out meetups that are over, by the clock or for good', () => {
+    const over = meetup(1, { start: PARTY_NOW - 2 * HOUR, end: PARTY_NOW });
+    const ended = meetup(2, {}, (party) => endParty(party));
+    const going = meetup(3);
+    expect(renderSummary([], PARTY_NOW, [over, ended, going]).split('\n').slice(2)).toEqual([
+      '**Meetups**',
+      `${link(going)} · no time set · 1 trainer`,
+    ]);
+    // With none left there is no heading either.
+    expect(renderSummary([], PARTY_NOW, [over, ended])).toBe(
+      'No raids right now. Report one with `/raid`.',
+    );
+  });
+
+  it('names a meetup without a post by its title, made plain', () => {
+    const made = testMeetup({ name: '**Picnic**' });
+    const text = renderSummary([], PARTY_NOW, [{ party: made, title: 'Meetup · **Picnic**' }]);
+    expect(text.split('\n')[3]).toBe('**Meetup · \\*\\*Picnic\\*\\*** · no time set · 1 trainer');
+  });
+
+  it('gives the meetups the room that few raids leave', () => {
+    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg', '300000000000000001');
+    const meetups = Array.from({ length: 30 }, (_unused, n) => meetup(n));
+    const text = renderSummary([raid], PARTY_NOW, meetups);
+    expect(text.length).toBeLessThanOrEqual(2000);
+    const lines = text.split('\n');
+    // Every one of the thirty is listed: far more than their 600 characters alone would hold.
+    expect(lines.slice(3)).toHaveLength(30);
+    expect(lines.at(-1)).not.toMatch(/more$/);
+    expect(text.length).toBeGreaterThan(1200);
+  });
+
+  it('fills the message when there are more meetups than fit, and counts the rest', () => {
+    const meetups = Array.from({ length: 60 }, (_unused, n) => meetup(n));
+    const text = renderSummary([], PARTY_NOW, meetups);
+    expect(text.length).toBeLessThanOrEqual(2000);
+    expect(text.length).toBeGreaterThan(1900);
+    expect(text.split('\n').at(-1)).toMatch(/^…and \d+ more$/);
+  });
+
+  it('stays one message with many of both, and counts what it left out of each', () => {
+    const raids = Array.from({ length: 60 }, (_unused, n) =>
+      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000002${String(n).padStart(2, '0')}`),
+    );
+    const meetups = Array.from({ length: 30 }, (_unused, n) => meetup(n));
+    const text = renderSummary(raids, PARTY_NOW, meetups);
+    expect(text.length).toBeLessThanOrEqual(2000);
+    const lines = text.split('\n');
+    const heading = lines.indexOf('**Meetups**');
+    expect(lines[heading - 1]).toBe('');
+    // The raids give way to the meetups, which have their own room, and both say what is missing.
+    expect(lines[heading - 2]).toMatch(/^…and \d+ more$/);
+    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
+    expect(lines.slice(heading + 1, -1).length).toBeGreaterThan(5);
+    expect(lines.slice(0, heading - 2).length).toBeGreaterThan(15);
+  });
+});
+
+describe('renderRegionLink for a meetup', () => {
+  it('says what kind of party is new', () => {
+    expect(renderRegionLink('300000000000000001', 'meetup')).toBe(
+      'New meetup: <#300000000000000001>',
+    );
+    expect(renderRegionLink('300000000000000001', 'raid')).toBe(
+      renderRegionLink('300000000000000001'),
+    );
+  });
+});
```

Apply to `src/render/text.test.ts`:

```diff
--- a/src/render/text.test.ts
+++ b/src/render/text.test.ts
@@ -1,5 +1,15 @@
 import { describe, expect, it } from 'vitest';
-import { count, fitItems, plain, timestamp, titleCase, truncate } from './text.js';
+import {
+  clockOrDate,
+  count,
+  fitItems,
+  isFarOff,
+  plain,
+  plainLines,
+  timestamp,
+  titleCase,
+  truncate,
+} from './text.js';
 
 describe('plain', () => {
   it('escapes Markdown and tidies white space', () => {
@@ -91,3 +101,60 @@ describe('count and titleCase', () => {
     expect(titleCase('fairy')).toBe('Fairy');
   });
 });
+
+describe('truncate at an escape', () => {
+  it('never leaves a lone backslash at the cut', () => {
+    // Cut between the backslash and the star it escapes: the backslash goes too.
+    expect(truncate('ab\\*cd', 4)).toBe('ab…');
+    expect(truncate('\\*'.repeat(10), 6)).toBe('\\*\\*…');
+    expect(truncate('\\*'.repeat(10), 7)).toBe('\\*\\*\\*…');
+  });
+
+  it('keeps an escaped backslash, which is a pair', () => {
+    expect(truncate('ab\\\\cdef', 5)).toBe('ab\\\\…');
+    expect(truncate('a\\\\\\*cdef', 5)).toBe('a\\\\…');
+  });
+
+  it('stays within the limit, and leaves a text that fits alone', () => {
+    for (let limit = 2; limit < 12; limit++) {
+      expect(truncate('\\_'.repeat(8), limit).length).toBeLessThanOrEqual(limit);
+    }
+    expect(truncate('ends in one \\', 20)).toBe('ends in one \\');
+  });
+});
+
+describe('a time with its day', () => {
+  const NOW = 1_791_900_000_000;
+  const HOUR = 3_600_000;
+
+  it('is far off beyond half a day, before or after now', () => {
+    expect(isFarOff(NOW + 12 * HOUR, NOW)).toBe(false);
+    expect(isFarOff(NOW + 12 * HOUR + 1, NOW)).toBe(true);
+    expect(isFarOff(NOW - 12 * HOUR - 1, NOW)).toBe(true);
+  });
+
+  it('is named by the clock when it is near, with its date when it is far off', () => {
+    expect(clockOrDate(NOW + HOUR, NOW)).toBe(`<t:${(NOW + HOUR) / 1000}:t>`);
+    expect(clockOrDate(NOW + 30 * HOUR, NOW)).toBe(`<t:${(NOW + 30 * HOUR) / 1000}:f>`);
+    expect(timestamp(NOW, 'F')).toBe(`<t:${NOW / 1000}:F>`);
+  });
+});
+
+describe('plainLines', () => {
+  it('makes every line plain and keeps the lines', () => {
+    expect(plainLines('first *line*\nsecond  line\r\n> third')).toBe(
+      'first \\*line\\*\nsecond line\n\\> third',
+    );
+  });
+
+  it('keeps one empty line between lines at most, and none at the ends', () => {
+    expect(plainLines('\n\na\n\n\n\nb\n \n')).toBe('a\n\nb');
+    expect(plainLines(' \n\t\n')).toBe('');
+  });
+
+  it('leaves no way to start a mention, a heading or a list on a later line', () => {
+    expect(plainLines('ok\n# big\n- item\n1. one\n<@123>\n@here')).toBe(
+      'ok\n\\# big\n\\- item\n1\\. one\n<\u200b@123>\n@\u200bhere',
+    );
+  });
+});
```

Apply to `src/services/party-service.test.ts`:

```diff
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -13,7 +13,8 @@ import {
 } from '../../test/support/gyms.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
-import { FORUM_TAGS, renderRaidPost } from '../render/raid-post.js';
+import { FORUM_TAGS } from '../render/party-post.js';
+import { renderRaidPost } from '../render/raid-post.js';
 import { ALICE, asRaid, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import {
```

Apply to `test/support/fake-gateway.test.ts`:

```diff
--- a/test/support/fake-gateway.test.ts
+++ b/test/support/fake-gateway.test.ts
@@ -68,3 +68,83 @@ describe('FakePartyGateway: who can see a forum', () => {
     expect(fake.canSee(WEST_FORUM, ALICE)).toBe(true);
   });
 });
+
+describe('FakePartyGateway: the limits of an embed', () => {
+  const POST = '300000000000000001';
+  const field = (name: string, value: string) => ({ name, value });
+
+  async function sending(embed: object): Promise<string> {
+    const fake = new FakePartyGateway();
+    try {
+      await fake.sendMessage(POST, { embeds: [embed] });
+      return 'sent';
+    } catch (err) {
+      return err instanceof Error ? err.message : String(err);
+    }
+  }
+
+  it('takes an embed that is exactly as long as Discord allows', async () => {
+    expect(await sending({ title: 't'.repeat(256), description: 'd'.repeat(4096) })).toBe('sent');
+    expect(
+      await sending({
+        fields: Array.from({ length: 5 }, () => field('n'.repeat(176), 'v'.repeat(1024))),
+      }),
+    ).toBe('sent');
+    expect(await sending({ fields: Array.from({ length: 25 }, () => field('n', 'v')) })).toBe(
+      'sent',
+    );
+  });
+
+  it('refuses each part that is too long, as Discord does', async () => {
+    const refused = /^Invalid Form Body: /;
+    expect(await sending({ title: 't'.repeat(257) })).toMatch(refused);
+    expect(await sending({ description: 'd'.repeat(4097) })).toMatch(refused);
+    expect(await sending({ fields: [field('n'.repeat(257), 'v')] })).toMatch(refused);
+    expect(await sending({ fields: [field('n', 'v'.repeat(1025))] })).toMatch(refused);
+    expect(await sending({ fields: [field('n', '')] })).toMatch(refused);
+    expect(await sending({ fields: [field('', 'v')] })).toMatch(refused);
+    expect(await sending({ fields: Array.from({ length: 26 }, () => field('n', 'v')) })).toMatch(
+      refused,
+    );
+  });
+
+  it('refuses an embed of more than 6000 characters in all, and checks edits too', async () => {
+    const big = {
+      description: 'd'.repeat(4096),
+      fields: [field('n', 'v'.repeat(1024)), field('n', 'v'.repeat(879))],
+    };
+    expect(await sending(big)).toBe(
+      'Invalid Form Body: the embeds have at most 6000 characters in all, not 6001',
+    );
+    const fake = new FakePartyGateway();
+    const id = (await fake.sendMessage(POST, { content: 'hello' })) ?? '';
+    await expect(
+      fake.editMessage(POST, id, { embeds: [{ title: 't'.repeat(257) }] }),
+    ).rejects.toThrow('Invalid Form Body');
+  });
+
+  it('counts the 6000 over all embeds of a message, with footers and author names', async () => {
+    const half = { description: 'd'.repeat(3000) };
+    const fake = new FakePartyGateway();
+    await expect(fake.sendMessage(POST, { embeds: [half, half] })).resolves.toBeDefined();
+    await expect(
+      fake.sendMessage(POST, { embeds: [half, { description: 'd'.repeat(3001) }] }),
+    ).rejects.toThrow('the embeds have at most 6000 characters in all, not 6001');
+    expect(
+      await sending({ description: 'd'.repeat(4096), footer: { text: 'f'.repeat(1904) } }),
+    ).toBe('sent');
+    expect(
+      await sending({ description: 'd'.repeat(4096), footer: { text: 'f'.repeat(1905) } }),
+    ).toMatch(/not 6001$/);
+    expect(
+      await sending({ description: 'd'.repeat(4096), author: { name: 'a'.repeat(1905) } }),
+    ).toMatch(/not 6001$/);
+  });
+
+  it('refuses a field whose name or value is nothing but white space', async () => {
+    const refused = /^Invalid Form Body: /;
+    expect(await sending({ fields: [field('n', ' \n\t ')] })).toMatch(refused);
+    expect(await sending({ fields: [field('  ', 'v')] })).toMatch(refused);
+    expect(await sending({ fields: [field(' n ', ' v ')] })).toBe('sent');
+  });
+});
```

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -40,7 +40,10 @@ type Method = keyof PartyGateway;
  * posts. `gone` holds ids of things that were deleted by hand; `failing` makes the named methods
  * reject. `calls` lists every call in order, as `method id`.
  *
- * It is as strict as Discord where tests rely on it: a message needs content or an embed, a title
+ * It is as strict as Discord where tests rely on it: a message needs content or an embed, an
+ * embed keeps within its limits (title 256, description 4096, 25 fields with a name of 1 to 256
+ * and a value of 1 to 1024 characters that are not all white space, 6000 over all embeds of a
+ * message with footers and author names), a title
  * is 1 to 100 characters, a post has at most five tags, all of the forum, a forum has one pinned
  * post, and nothing can be sent into a forum. Like Discord, it opens an archived post again for
  * anything that is edited or sent in it. A message that was deleted, or whose id is in `gone`,
@@ -194,6 +197,48 @@ export class FakePartyGateway implements PartyGateway {
     if (!message.content && !message.embeds?.length) {
       throw new Error('Invalid Form Body: a message needs content or an embed');
     }
+    FakePartyGateway.checkEmbeds(message.embeds ?? []);
+  }
+
+  /**
+   * The limits of the embeds of a message, which Discord answers with "Invalid Form Body" when
+   * one is passed. The 6000 characters are counted over all embeds of the message together,
+   * with the footer's text and the author's name; a field whose name or value is nothing but
+   * white space is refused like an empty one.
+   */
+  private static checkEmbeds(embeds: NonNullable<OutgoingMessage['embeds']>): void {
+    const refuse = (what: string): never => {
+      throw new Error(`Invalid Form Body: ${what}`);
+    };
+    let total = 0;
+    for (const embed of embeds) {
+      const title = embed.title ?? '';
+      const description = embed.description ?? '';
+      const fields = embed.fields ?? [];
+      if (title.length > 256) {
+        refuse(`an embed title has at most 256 characters, not ${title.length}`);
+      }
+      if (description.length > 4096) {
+        refuse(`an embed description has at most 4096 characters, not ${description.length}`);
+      }
+      if (fields.length > 25) refuse(`an embed has at most 25 fields, not ${fields.length}`);
+      total += title.length + description.length;
+      total += (embed.footer?.text ?? '').length + (embed.author?.name ?? '').length;
+      for (const field of fields) {
+        if (field.name.trim() === '' || field.name.length > 256) {
+          refuse(
+            `a field name is 1 to 256 characters, not ${field.name.trim() === '' ? 0 : field.name.length}`,
+          );
+        }
+        if (field.value.trim() === '' || field.value.length > 1024) {
+          refuse(
+            `a field value is 1 to 1024 characters, not ${field.value.trim() === '' ? 0 : field.value.length}`,
+          );
+        }
+        total += field.name.length + field.value.length;
+      }
+    }
+    if (total > 6000) refuse(`the embeds have at most 6000 characters in all, not ${total}`);
   }
 
   private static checkTitle(title: string): void {
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -14,7 +14,7 @@ import { PartyLines } from '../../src/services/party-lines.js';
 import { PartyScheduler } from '../../src/services/party-scheduler.js';
 import { AttendanceService } from '../../src/services/attendance-service.js';
 import { isRaid, type Party, type RaidParty } from '../../src/domain/party/party.js';
-import { FORUM_TAGS } from '../../src/render/raid-post.js';
+import { FORUM_TAGS } from '../../src/render/party-post.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import {
   PartyService,
```

Run: `npx vitest run --project unit src/commands/admin/setup-forums.test.ts src/commands/parties/delete.test.ts src/commands/raids/raid.test.ts src/render/meetup-post.test.ts src/render/party-controls.test.ts src/render/summary.test.ts src/render/text.test.ts src/services/party-service.test.ts test/support/fake-gateway.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/parties/delete.ts`:

```diff
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -34,7 +34,7 @@ export const deleteRaid: SimpleCommand = {
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
     if (!isStaff(interaction, ctx)) {
-      await interaction.showModal(deletionForm(party.id));
+      await interaction.showModal(deletionForm(party));
       return;
     }
     const closed = await ctx.partyService.end(party.id, undefined, {
```

Apply to `src/commands/raids/change.ts`:

```diff
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -13,7 +13,7 @@ import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import type { RaidParty } from '../../domain/party/party.js';
 import { problemText } from '../../render/activity.js';
-import { timestamp } from '../../render/text.js';
+import { isFarOff, timestamp } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
 import { commandRaid, PARTY_OVER } from '../parties/reply.js';
@@ -39,7 +39,7 @@ export function changingMember(interaction: Changing): Member {
 export function timesText(party: RaidParty, now: number = Date.now()): string {
   const { hatchTime, endTime } = party;
   if (hatchTime === null || endTime === null) return 'It has no times yet.';
-  const style = Math.abs(hatchTime - now) > 12 * 3_600_000 ? 'f' : 't';
+  const style = isFarOff(hatchTime, now) ? 'f' : 't';
   return (
     `It ${hatchTime > now ? 'hatches' : 'hatched'} at ${timestamp(hatchTime, style)} and ` +
     `${endTime > now ? 'ends' : 'ended'} at ${timestamp(endTime, style)}.`
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -20,7 +20,7 @@ import { matchNamed } from '../../domain/search/word-match.js';
 import { resolvePartyTime } from '../../domain/time/party-time.js';
 import { longestRaidDurations, raidDurationRules } from '../../domain/time/raid-durations.js';
 import { UserError } from '../../discord/errors.js';
-import { plain, timestamp, truncate } from '../../render/text.js';
+import { isFarOff, plain, timestamp, truncate } from '../../render/text.js';
 
 const MINUTE = 60_000;
 /** Discord shows at most this many choices, each with a name of at most 100 characters. */
@@ -366,8 +366,7 @@ function gymLabel(gym: Gym, region: string | undefined): string {
  * not within half a day of now (an EX or elite raid).
  */
 function between(first: number, last: number, now: number): string {
-  const far = (time: number): boolean => Math.abs(time - now) > 12 * 60 * MINUTE;
-  const style = far(first) || far(last) ? 'f' : 't';
+  const style = isFarOff(first, now) || isFarOff(last, now) ? 'f' : 't';
   return `between ${timestamp(first, style)} and ${timestamp(last, style)}`;
 }
 
```

Create `src/render/meetup-post.ts`:

```ts
import type { APIEmbed } from 'discord.js';
import { DateTime } from 'luxon';
import type { MeetupParty } from '../domain/party/party.js';
import { nameOf, startTimeOf, timedOver } from '../domain/party/timed.js';
import { partyControls } from './party-controls.js';
import {
  ENDED_COLOUR,
  fitEmbed,
  groupField,
  KEPT_OPEN,
  tidyTitle,
  type ForumTag,
  type PostEmoji,
  type RenderedPost,
  type ShrinkableField,
} from './party-post.js';
import { LIMITS, plain, plainLines, timestamp, truncate } from './text.js';

/** The colour of the post of a meetup that is not over: none of the colours of a raid. */
const MEETUP_COLOUR = 0x3498db;

export interface MeetupPostView {
  party: MeetupParty;
  now: number;
  /** IANA zone in which "today" is judged (`settings.timezone`). */
  zone: string;
  /**
   * Set for the last showing of a meetup that staff closed (`/delete`): the sentence that says
   * so. It stands in the place of the times, and the post is shown as ended whatever the clock
   * says.
   */
  closed?: string;
  emoji: PostEmoji;
}

/** `Meetup · Community Day picnic`: the title of the post, which is also how lists name it. */
export function meetupTitle(party: MeetupParty): string {
  return tidyTitle(truncate(tidyTitle(`Meetup · ${nameOf(party)}`), LIMITS.title));
}

/**
 * Whether the post shows the meetup as over: its end time has passed, or the party has ended
 * (this is then the last showing before the post is archived, also of a meetup without an end
 * time whose day ran out: an archived post must not look as if the meetup were still going on).
 */
function shownAsOver(party: MeetupParty, now: number): boolean {
  return party.status === 'ended' || timedOver(party, now);
}

/** What it is, and that it has ended once it is over. */
export function meetupTags(party: MeetupParty, now: number): ForumTag[] {
  return ['Meetup', ...(shownAsOver(party, now) ? ['Ended' as const] : [])];
}

/**
 * When the meetup starts and ends. A clock time does not say which day it is, and a meetup is
 * often planned days ahead, so a time that is not today (in `zone`) is shown with its weekday
 * and date. The scheduler shows every post anew at midnight.
 *
 * A meetup without any time says what follows from that: the clean-up gives it a day, and the
 * post says when that day is over (`lastPossibleTime`; the warning comes a few minutes after
 * it and the archiving an hour after the warning, so the moment named is the earliest, and the
 * time of the archiving itself once it is scheduled).
 */
function describeTimes(view: MeetupPostView): string {
  const { party, now, zone } = view;
  const start = startTimeOf(party);
  const end = party.endTime;
  const today = DateTime.fromMillis(now, { zone });
  const at = (time: number): string =>
    timestamp(time, today.hasSame(DateTime.fromMillis(time, { zone }), 'day') ? 't' : 'F');
  if (shownAsOver(party, now)) {
    return end === null ? 'This meetup is over.' : `Ended at ${timestamp(end, 'F')}.`;
  }
  if (start === null && end === null) {
    const archived = party.deletionTime ?? party.lastPossibleTime;
    return (
      'No time has been set yet: `/meet` sets the start.' +
      (party.saved || archived === null
        ? ''
        : ` Without one this post is archived ${timestamp(archived, 'R')}.`)
    );
  }
  const parts: string[] = [];
  const started = start !== null && now >= start;
  if (start !== null) {
    if (!started) parts.push(`Starts ${timestamp(start, 'R')}, at ${at(start)}.`);
    // What is counted down to is said first in its sentence: once it has started, the end.
    else if (end !== null) parts.push(`Started at ${at(start)}.`);
    else parts.push(`Started ${timestamp(start, 'R')}, at ${at(start)}.`);
  }
  if (end !== null) {
    parts.push(
      start !== null && !started
        ? `Ends at ${at(end)}.`
        : `Ends ${timestamp(end, 'R')}, at ${at(end)}.`,
    );
  }
  return parts.join(' ');
}

/**
 * The forum post of a meetup: title, tags, the embed and the controls under it. Pure: the same
 * view gives the same post. It has what the post of a raid has without what belongs to a gym or
 * a boss: its name, its times, who made it, what the members wrote about it, and who comes.
 *
 * What the members wrote stands in the description, under a heading, and not in a field: a
 * field holds 1024 characters, and a text of the 1000 a form takes can be longer than that once
 * it is made plain. The description holds 4096, so nothing a member wrote is ever cut.
 */
export function renderMeetupPost(view: MeetupPostView): RenderedPost {
  const { party, now } = view;
  const over = view.closed !== undefined || shownAsOver(party, now);
  const information = party.meetup.description === null ? '' : plainLines(party.meetup.description);
  const description = [
    '**Meetup**',
    view.closed ?? describeTimes(view),
    // A meetup always names who made it.
    `Created by <@${party.createdById}>.`,
    // Not in the last showing of a meetup that was closed: that post is archived.
    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
    // A text of nothing but white space is empty once plain, and then has no heading either.
    ...(information === '' ? [] : ['', '**Information**', information]),
  ].join('\n');

  const fields: ShrinkableField[] = [];
  const single = party.groups.length === 1;
  for (const group of party.groups) {
    fields.push({
      field: groupField(view, group, { single, lobby: false }),
      shrink: (limit) => groupField(view, group, { single, lobby: false, limit }),
      rank: 1,
    });
  }

  // Embed titles render Markdown (a thread name does not, so the post's own title stays raw).
  const embedTitle = truncate(plain(nameOf(party)), LIMITS.embedTitle);
  const embedDescription = truncate(description, LIMITS.embedDescription);
  fitEmbed(embedTitle, embedDescription, fields);

  const embed: APIEmbed = {
    title: embedTitle,
    description: embedDescription,
    color: over ? ENDED_COLOUR : MEETUP_COLOUR,
    fields: fields.map((f) => f.field),
  };
  const tags = meetupTags(party, now);
  return {
    title: meetupTitle(party),
    tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
    embed,
    message: { embeds: [embed], components: partyControls(party) },
  };
}
```

Apply to `src/render/mirrors.ts`:

```diff
--- a/src/render/mirrors.ts
+++ b/src/render/mirrors.ts
@@ -1,20 +1,21 @@
 import type { OutgoingMessage } from '../discord/party-gateway.js';
 import type { MirrorKind } from '../domain/party/party.js';
-import type { RenderedPost } from './raid-post.js';
+import type { RenderedPost } from './party-post.js';
 
-/** Where a raid is, for the line above a copy of its message in another channel. */
+/** Where a party is, for the line above a copy of its message in another channel. */
 export interface MirrorPlace {
-  /** The raid's post. */
+  /** The party's post. */
   postId: string;
-  /** The text channel of the raid's region; undefined when the region is gone. */
+  /** The text channel of the party's region; undefined when the region is gone. */
   regionChannelId: string | undefined;
 }
 
 /**
- * A copy of a raid's message for another place (spec 5.2): the same embed and the same controls
- * as the first message of the post, so a member can sign up where they see it. In another
- * channel a line above it says what it is and links to the post; the copy at the bottom of the
- * post itself (`status`) needs none.
+ * A copy of a party's message for another place (spec 5.2): the same embed and the same
+ * controls as the first message of the post, so a member can sign up where they see it. The
+ * copy at the bottom of the post itself (`status`), which every kind of party can have, is the
+ * message as it is. The copies in another channel (`ex`, `remote`) are a raid's alone
+ * (`raidMirrors`): a line above them says what raid it is and links to the post.
  */
 export function renderMirror(
   kind: MirrorKind,
```

Apply to `src/render/party-controls.ts`:

```diff
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -10,9 +10,11 @@ import {
 import { encodeCustomId } from '../discord/custom-id.js';
 import {
   headCount,
+  isRaid,
+  partyWord,
   remoteAllowed,
+  type Party,
   type PartyGroup,
-  type RaidParty,
 } from '../domain/party/party.js';
 import { fitItems, plain, truncate } from './text.js';
 
@@ -68,7 +70,7 @@ function button(
 }
 
 /** `Group B (4)`, or `B: park side (4)` for a group with a label; the count is never cut off. */
-function groupLabel(party: RaidParty, group: PartyGroup): string {
+function groupLabel(party: Party, group: PartyGroup): string {
   const heads = ` (${headCount(party, group.id)})`;
   const label = group.label?.replace(/\s+/g, ' ').trim();
   const name = label ? `${group.id}: ${label}` : `Group ${group.id}`;
@@ -81,8 +83,12 @@ function groupLabel(party: RaidParty, group: PartyGroup): string {
  * and, when there is more than one group, a button per group to move there. Buttons and not a menu for the groups: a menu keeps showing each member
  * their last choice, also one that was refused. Nothing depends on the time, so the controls
  * never need an edit of their own: Done on an egg is refused when it is pressed.
+ *
+ * A meetup has no Done: there is nothing to complete in it, done would only mean leave, and
+ * Leave is there. It has no "Set time" either (its times are `/meet` and `/end`), and never a
+ * row of groups.
  */
-export function partyControls(party: RaidParty): Row[] {
+export function partyControls(party: Party): Row[] {
   const { id } = party;
   const rows: Row[] = [
     {
@@ -91,7 +97,7 @@ export function partyControls(party: RaidParty): Row[] {
         button(id, 'maybe', 'Interested', ButtonStyle.Secondary),
         button(id, 'join', 'Join', ButtonStyle.Primary),
         button(id, 'here', 'Here', ButtonStyle.Success),
-        button(id, 'done', 'Done', ButtonStyle.Secondary),
+        ...(isRaid(party) ? [button(id, 'done', 'Done', ButtonStyle.Secondary)] : []),
         button(id, 'leave', 'Leave', ButtonStyle.Danger),
       ],
     },
@@ -104,7 +110,9 @@ export function partyControls(party: RaidParty): Row[] {
           ? [button(id, 'remote', 'Remote / in person', ButtonStyle.Secondary)]
           : []),
         // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
-        ...(party.hatchTime === null ? [button(id, 'time', 'Set time', ButtonStyle.Primary)] : []),
+        ...(isRaid(party) && party.hatchTime === null
+          ? [button(id, 'time', 'Set time', ButtonStyle.Primary)]
+          : []),
       ],
     },
   ];
@@ -190,13 +198,17 @@ export const DELETE_REASON_INPUT = 'reason';
 export const MAX_DELETE_REASON = 500;
 
 /**
- * The form `/delete` opens for a member who is not staff: why the raid should be deleted. What
+ * The form `/delete` opens for a member who is not staff: why the party should be deleted. What
  * they write is put into the post for the moderators, who decide.
  */
-export function deletionForm(partyId: string): APIModalInteractionResponseCallbackData {
+export function deletionForm(
+  party: Pick<Party, 'id' | 'type'>,
+): APIModalInteractionResponseCallbackData {
+  const word = partyWord(party);
   return {
-    custom_id: encodeCustomId({ kind: PARTY_KIND, id: partyId, action: 'delete' }),
-    title: 'Ask the moderators to delete this raid',
+    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: 'delete' }),
+    // A title has at most 45 characters.
+    title: `Ask the moderators to delete this ${word}`,
     components: [
       {
         type: ComponentType.ActionRow,
@@ -209,7 +221,7 @@ export function deletionForm(partyId: string): APIModalInteractionResponseCallba
             required: true,
             min_length: 3,
             max_length: MAX_DELETE_REASON,
-            placeholder: 'A raid nobody comes to is no reason: it goes away by itself.',
+            placeholder: `A ${word} nobody comes to is no reason: it goes away by itself.`,
           },
         ],
       },
```

Create `src/render/party-post.ts`:

```ts
import type { APIEmbed, APIEmbedField } from 'discord.js';
import type { OutgoingMessage } from '../discord/party-gateway.js';
import {
  headCount,
  membersWhere,
  type Attendee,
  type Party,
  type PartyGroup,
  type Team,
} from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { count, LIMITS, plain, timestamp, truncate } from './text.js';

/** The names of the forum tags a post can carry (spec 5.1). At most five are applied. */
export const FORUM_TAGS = [
  'Egg',
  'Hatched',
  'Ended',
  'T1',
  'T3',
  'T5',
  'Mega',
  'Elite',
  'EX',
  'Shadow',
  'Train',
  'Meetup',
] as const;
export type ForumTag = (typeof FORUM_TAGS)[number];

/** A lobby holds this many trainers; a bigger group of a raid is told to split. */
const LOBBY_SIZE = 20;

/** The colour of the post of a party that is over, whatever its kind. */
export const ENDED_COLOUR = 0xe74c3c;

/** Said in the post of a party that a moderator keeps (`/admin save-party`). */
export const KEPT_OPEN = 'Kept open by a moderator: this post is not archived by itself.';

/** Emoji as message text (`<:pineshiny:123>`), or plain characters when the server has none. */
export interface PostEmoji {
  shiny: string;
  remote: string;
  teams: Readonly<Record<Team, string>>;
}

/** What the lists of trainers in a post are made from. */
export interface TrainersView {
  party: Party;
  emoji: PostEmoji;
}

/** What a forum post of a party shows. */
export interface RenderedPost {
  /** The post's title. */
  title: string;
  /** Names of the tags to apply. */
  tags: ForumTag[];
  embed: APIEmbed;
  /**
   * The whole first message, the one that is sent and edited: the embed and the controls. This
   * is the only place that builds it.
   */
  message: OutgoingMessage;
}

/** Runs of white space become one space and the ends are trimmed: Discord keeps titles so. */
export function tidyTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function attendeeText(memberId: string, attendee: Attendee, emoji: PostEmoji): string {
  const extra = attendee.number > 1 ? ` +${attendee.number - 1}` : '';
  return `<@${memberId}>${extra}${attendee.remote ? ` ${emoji.remote}` : ''}`;
}

/**
 * The texts of a list of members that is in shown order: each member, and the emoji of a team
 * once, before the first of its members (a server's own emoji is some thirty characters, which
 * for every trainer would halve what fits into a field).
 */
export function attendeeTexts(
  party: Party,
  memberIds: readonly string[],
  emoji: PostEmoji,
): string[] {
  let before: Team | undefined;
  return memberIds.map((id) => {
    const attendee = party.attendees[id];
    if (!attendee) return `<@${id}>`;
    const text = attendeeText(id, attendee, emoji);
    const first = attendee.team !== undefined && attendee.team !== before;
    before = attendee.team;
    return first && attendee.team ? `${emoji.teams[attendee.team]} ${text}` : text;
  });
}

const byName = new Intl.Collator('en', { sensitivity: 'base' });

/** Members without a team first, then the teams in this order (as the legacy bot listed them). */
const TEAM_ORDER: readonly (Team | undefined)[] = [undefined, 'instinct', 'mystic', 'valor'];

/**
 * The members of a list in the order they are shown: by team, then by the name the bot last saw
 * (members it has no name for come last), and for the rest the order they signed up in.
 */
export function inShownOrder(party: Party, memberIds: readonly string[]): string[] {
  const rank = (id: string): number => TEAM_ORDER.indexOf(party.attendees[id]?.team);
  const name = (id: string): string | undefined => party.attendees[id]?.name;
  return memberIds
    .map((id, index) => ({ id, index }))
    .sort((a, b) => {
      const byTeam = rank(a.id) - rank(b.id);
      if (byTeam !== 0) return byTeam;
      const [left, right] = [name(a.id), name(b.id)];
      if (left === undefined || right === undefined) {
        if (left !== right) return left === undefined ? 1 : -1;
        return a.index - b.index;
      }
      return byName.compare(left, right) || a.index - b.index;
    })
    .map(({ id }) => id);
}

export interface GroupFieldOptions {
  /** The party has only this group: the field is called "Trainers" unless the group has a label. */
  single: boolean;
  /** Tell a group that is bigger than a lobby to split up: for a raid. */
  lobby: boolean;
  /** The room the value may take; at most, and by default, what a field holds. */
  limit?: number;
}

/**
 * The field of one group: the trainers of a party, or of one of the groups of a raid. The lists
 * of Here, Coming and Interested share the room that is left (`limit`, at most 1024) after the
 * meeting line and the lobby note: when they do not all fit, the longest list is shortened
 * first, one trainer at a time from its end, and says how many it left out. Even with every list
 * cut down to that count the value can exceed a very small `limit`; it is then as short as it
 * can be.
 */
export function groupField(
  view: TrainersView,
  group: PartyGroup,
  options: GroupFieldOptions,
): APIEmbedField {
  const { party, emoji } = view;
  const { single, lobby, limit = LIMITS.fieldValue } = options;
  const heads = headCount(party, group.id);
  const label = group.label ? `: ${plain(group.label)}` : '';
  const name = truncate(
    `${single && !group.label ? 'Trainers' : `Group ${group.id}${label}`} (${heads})`,
    LIMITS.fieldName,
  );
  const lines: string[] = [];
  if (group.startTime !== undefined) {
    lines.push(`Meeting at ${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`);
  }
  if (lobby && heads > LOBBY_SIZE) {
    lines.push(`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`);
  }
  const kinds: [string, (attendee: Attendee) => boolean][] = [
    ['Here', (a) => a.status === PartyStatus.Present || a.status === PartyStatus.CompletePending],
    ['Coming', (a) => a.status === PartyStatus.Coming],
    ['Interested', (a) => a.status === PartyStatus.Interested],
  ];
  const sections: { title: string; texts: string[]; shown: number }[] = [];
  for (const [title, belongs] of kinds) {
    const members = inShownOrder(
      party,
      membersWhere(party, (a) => a.group === group.id && belongs(a)),
    );
    if (members.length === 0) continue;
    const texts = attendeeTexts(party, members, emoji);
    sections.push({ title, texts, shown: texts.length });
  }
  const sectionLine = (section: (typeof sections)[number]): string => {
    const kept = section.texts.slice(0, section.shown);
    const left = section.texts.length - section.shown;
    if (left > 0) kept.push(`…and ${left} more`);
    return `**${section.title}** ${kept.join(', ')}`;
  };
  const build = (): string => {
    const all = [...lines, ...sections.map(sectionLine)];
    return all.length > 0 ? all.join('\n') : 'Nobody yet.';
  };
  let value = build();
  while (value.length > limit) {
    let longest: (typeof sections)[number] | undefined;
    for (const section of sections) {
      if (
        section.shown > 0 &&
        (!longest || sectionLine(section).length > sectionLine(longest).length)
      ) {
        longest = section;
      }
    }
    if (!longest) break;
    longest.shown--;
    value = build();
  }
  // Not reachable (the lines are short), but a value Discord would refuse is the worse failure.
  return { name, value: truncate(value, LIMITS.fieldValue) };
}

/** A field whose attendee list can be made shorter: `shrink(limit)` is the field for that room. */
export interface ShrinkableField {
  field: APIEmbedField;
  shrink?: (limit: number) => APIEmbedField;
  /** Fields of a lower rank are shortened first. */
  rank: number;
}

function embedSize(title: string, description: string, fields: readonly ShrinkableField[]): number {
  let size = title.length + description.length;
  for (const { field } of fields) size += field.name.length + field.value.length;
  return size;
}

/**
 * Shortens the attendee lists until title, description and fields together fit what Discord
 * counts for one embed. The longest group field gives way first, the Done field last; no field
 * is dropped.
 */
export function fitEmbed(title: string, description: string, fields: ShrinkableField[]): void {
  const exhausted = new Set<ShrinkableField>();
  for (let over = embedSize(title, description, fields) - LIMITS.embedTotal; over > 0;) {
    const open = fields.filter((f) => f.shrink && !exhausted.has(f));
    const rank = Math.min(...open.map((f) => f.rank));
    const tier = open
      .filter((f) => f.rank === rank)
      .sort((a, b) => b.field.value.length - a.field.value.length);
    const top = tier[0];
    if (!top?.shrink) break;
    const current = top.field.value.length;
    const ties = tier.filter((f) => f.field.value.length === current).length;
    const next = tier.find((f) => f.field.value.length < current)?.field.value.length ?? 0;
    const step = Math.min(over, Math.max(current - next, Math.ceil(over / ties)));
    const shorter = top.shrink(current - step);
    if (shorter.value.length >= current) exhausted.add(top);
    else top.field = shorter;
    over = embedSize(title, description, fields) - LIMITS.embedTotal;
  }
}

/** How many trainers are expected in all, for lists of parties. */
export function trainerCount(party: Party): string {
  return count(headCount(party), 'trainer');
}
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -1,15 +1,6 @@
 import type { APIEmbed, APIEmbedField } from 'discord.js';
 import { DateTime } from 'luxon';
-import type { OutgoingMessage } from '../discord/party-gateway.js';
-import {
-  headCount,
-  membersWhere,
-  type Attendee,
-  type PartyGroup,
-  type RaidParty,
-  type RaidStage,
-  type Team,
-} from '../domain/party/party.js';
+import { membersWhere, type RaidParty, type RaidStage } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
@@ -17,34 +8,27 @@ import type { PokemonEntry } from '../domain/pogo/game-master.js';
 import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
 import { raidTierLabel, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
 import { partyControls } from './party-controls.js';
-import { count, fitItems, LIMITS, plain, timestamp, titleCase, truncate } from './text.js';
-
-/** The names of the forum tags a post can carry (spec 5.1). At most five are applied. */
-export const FORUM_TAGS = [
-  'Egg',
-  'Hatched',
-  'Ended',
-  'T1',
-  'T3',
-  'T5',
-  'Mega',
-  'Elite',
-  'EX',
-  'Shadow',
-  'Train',
-  'Meetup',
-] as const;
-export type ForumTag = (typeof FORUM_TAGS)[number];
-
-/** A lobby holds this many trainers; a bigger group is told to split. */
-const LOBBY_SIZE = 20;
+import {
+  attendeeTexts,
+  ENDED_COLOUR,
+  fitEmbed,
+  groupField,
+  inShownOrder,
+  KEPT_OPEN,
+  tidyTitle,
+  type ForumTag,
+  type PostEmoji,
+  type RenderedPost,
+  type ShrinkableField,
+} from './party-post.js';
+import { fitItems, LIMITS, plain, timestamp, titleCase, truncate } from './text.js';
 
 const HOUR = 3_600_000;
 
 const STAGE_COLOURS: Readonly<Record<RaidStage, number>> = {
   egg: 0xf1c40f,
   hatched: 0x2ecc71,
-  ended: 0xe74c3c,
+  ended: ENDED_COLOUR,
 };
 
 /** What the post needs to know of the gym (`Gym` of the gym repository has all of it). */
@@ -86,22 +70,7 @@ export interface RaidPostView {
    * It stands in the place of the times, and the post is shown as ended whatever the clock says.
    */
   closed?: string;
-  /** Emoji as message text (`<:pineshiny:123>`), or plain characters when the server has none. */
-  emoji: { shiny: string; remote: string; teams: Readonly<Record<Team, string>> };
-}
-
-/** What a forum post of a party shows. */
-export interface RenderedPost {
-  /** The post's title. */
-  title: string;
-  /** Names of the tags to apply. */
-  tags: ForumTag[];
-  embed: APIEmbed;
-  /**
-   * The whole first message, the one that is sent and edited: the embed and the controls. This
-   * is the only place that builds it.
-   */
-  message: OutgoingMessage;
+  emoji: PostEmoji;
 }
 
 /**
@@ -162,11 +131,6 @@ function tierWords(tier: RaidTier): string {
   return raidTierLabel(tier);
 }
 
-/** Runs of white space become one space and the ends are trimmed: Discord keeps titles so. */
-export function tidyTitle(text: string): string {
-  return text.replace(/\s+/g, ' ').trim();
-}
-
 /** `Yveltal · Big Fountain`, `T5 egg · Big Fountain`, `T5 raid · Big Fountain`. */
 export function raidTitle(view: Pick<RaidPostView, 'party' | 'gym' | 'boss' | 'now'>): string {
   const { party, boss } = view;
@@ -258,130 +222,6 @@ function bossField(
   };
 }
 
-function attendeeText(memberId: string, attendee: Attendee, emoji: RaidPostView['emoji']): string {
-  const extra = attendee.number > 1 ? ` +${attendee.number - 1}` : '';
-  return `<@${memberId}>${extra}${attendee.remote ? ` ${emoji.remote}` : ''}`;
-}
-
-/**
- * The texts of a list of members that is in shown order: each member, and the emoji of a team
- * once, before the first of its members (a server's own emoji is some thirty characters, which
- * for every trainer would halve what fits into a field).
- */
-function attendeeTexts(
-  party: RaidParty,
-  memberIds: readonly string[],
-  emoji: RaidPostView['emoji'],
-): string[] {
-  let before: Team | undefined;
-  return memberIds.map((id) => {
-    const attendee = party.attendees[id];
-    if (!attendee) return `<@${id}>`;
-    const text = attendeeText(id, attendee, emoji);
-    const first = attendee.team !== undefined && attendee.team !== before;
-    before = attendee.team;
-    return first && attendee.team ? `${emoji.teams[attendee.team]} ${text}` : text;
-  });
-}
-
-const byName = new Intl.Collator('en', { sensitivity: 'base' });
-
-/** Members without a team first, then the teams in this order (as the legacy bot listed them). */
-const TEAM_ORDER: readonly (Team | undefined)[] = [undefined, 'instinct', 'mystic', 'valor'];
-
-/**
- * The members of a list in the order they are shown: by team, then by the name the bot last saw
- * (members it has no name for come last), and for the rest the order they signed up in.
- */
-function inShownOrder(party: RaidParty, memberIds: readonly string[]): string[] {
-  const rank = (id: string): number => TEAM_ORDER.indexOf(party.attendees[id]?.team);
-  const name = (id: string): string | undefined => party.attendees[id]?.name;
-  return memberIds
-    .map((id, index) => ({ id, index }))
-    .sort((a, b) => {
-      const byTeam = rank(a.id) - rank(b.id);
-      if (byTeam !== 0) return byTeam;
-      const [left, right] = [name(a.id), name(b.id)];
-      if (left === undefined || right === undefined) {
-        if (left !== right) return left === undefined ? 1 : -1;
-        return a.index - b.index;
-      }
-      return byName.compare(left, right) || a.index - b.index;
-    })
-    .map(({ id }) => id);
-}
-
-/**
- * The field of one group. The lists of Here, Coming and Interested share the room that is left
- * (`limit`, at most 1024) after the meeting line and the lobby note: when they do not all fit,
- * the longest list is shortened first, one trainer at a time from its end, and says how many it
- * left out. Even with every list cut down to that count the value can exceed a very small
- * `limit`; it is then as short as it can be.
- */
-function groupField(
-  view: RaidPostView,
-  group: PartyGroup,
-  single: boolean,
-  limit: number = LIMITS.fieldValue,
-): APIEmbedField {
-  const { party, emoji } = view;
-  const heads = headCount(party, group.id);
-  const label = group.label ? `: ${plain(group.label)}` : '';
-  const name = truncate(
-    `${single && !group.label ? 'Trainers' : `Group ${group.id}${label}`} (${heads})`,
-    LIMITS.fieldName,
-  );
-  const lines: string[] = [];
-  if (group.startTime !== undefined) {
-    lines.push(`Meeting at ${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`);
-  }
-  if (heads > LOBBY_SIZE) {
-    lines.push(`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`);
-  }
-  const kinds: [string, (attendee: Attendee) => boolean][] = [
-    ['Here', (a) => a.status === PartyStatus.Present || a.status === PartyStatus.CompletePending],
-    ['Coming', (a) => a.status === PartyStatus.Coming],
-    ['Interested', (a) => a.status === PartyStatus.Interested],
-  ];
-  const sections: { title: string; texts: string[]; shown: number }[] = [];
-  for (const [title, belongs] of kinds) {
-    const members = inShownOrder(
-      party,
-      membersWhere(party, (a) => a.group === group.id && belongs(a)),
-    );
-    if (members.length === 0) continue;
-    const texts = attendeeTexts(party, members, emoji);
-    sections.push({ title, texts, shown: texts.length });
-  }
-  const sectionLine = (section: (typeof sections)[number]): string => {
-    const kept = section.texts.slice(0, section.shown);
-    const left = section.texts.length - section.shown;
-    if (left > 0) kept.push(`…and ${left} more`);
-    return `**${section.title}** ${kept.join(', ')}`;
-  };
-  const build = (): string => {
-    const all = [...lines, ...sections.map(sectionLine)];
-    return all.length > 0 ? all.join('\n') : 'Nobody yet.';
-  };
-  let value = build();
-  while (value.length > limit) {
-    let longest: (typeof sections)[number] | undefined;
-    for (const section of sections) {
-      if (
-        section.shown > 0 &&
-        (!longest || sectionLine(section).length > sectionLine(longest).length)
-      ) {
-        longest = section;
-      }
-    }
-    if (!longest) break;
-    longest.shown--;
-    value = build();
-  }
-  // Not reachable (the lines are short), but a value Discord would refuse is the worse failure.
-  return { name, value: truncate(value, LIMITS.fieldValue) };
-}
-
 /** The members who completed the raid, as many as fit into `limit`. */
 function doneField(
   view: RaidPostView,
@@ -398,46 +238,6 @@ function doneField(
   return { name: `Done (${heads})`, value: fitItems(texts, limit) };
 }
 
-/** A field whose attendee list can be made shorter: `shrink(limit)` is the field for that room. */
-interface ShrinkableField {
-  field: APIEmbedField;
-  shrink?: (limit: number) => APIEmbedField;
-  /** Fields of a lower rank are shortened first. */
-  rank: number;
-}
-
-function embedSize(title: string, description: string, fields: readonly ShrinkableField[]): number {
-  let size = title.length + description.length;
-  for (const { field } of fields) size += field.name.length + field.value.length;
-  return size;
-}
-
-/**
- * Shortens the attendee lists until title, description and fields together fit what Discord
- * counts for one embed. The longest group field gives way first, the Done field last; no field
- * is dropped.
- */
-function fitEmbed(title: string, description: string, fields: ShrinkableField[]): void {
-  const exhausted = new Set<ShrinkableField>();
-  for (let over = embedSize(title, description, fields) - LIMITS.embedTotal; over > 0;) {
-    const open = fields.filter((f) => f.shrink && !exhausted.has(f));
-    const rank = Math.min(...open.map((f) => f.rank));
-    const tier = open
-      .filter((f) => f.rank === rank)
-      .sort((a, b) => b.field.value.length - a.field.value.length);
-    const top = tier[0];
-    if (!top?.shrink) break;
-    const current = top.field.value.length;
-    const ties = tier.filter((f) => f.field.value.length === current).length;
-    const next = tier.find((f) => f.field.value.length < current)?.field.value.length ?? 0;
-    const step = Math.min(over, Math.max(current - next, Math.ceil(over / ties)));
-    const shorter = top.shrink(current - step);
-    if (shorter.value.length >= current) exhausted.add(top);
-    else top.field = shorter;
-    over = embedSize(title, description, fields) - LIMITS.embedTotal;
-  }
-}
-
 /**
  * The forum post of a raid: title, tags, the embed and the controls under it. Pure: the same view
  * gives the same post.
@@ -464,9 +264,7 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
     view.closed ?? describeTimes(view, stage),
     ...(party.anonymous ? [] : [`Reported by <@${party.createdById}>.`]),
     // Not in the last showing of a raid that was closed: that post is archived.
-    ...(party.saved && view.closed === undefined
-      ? ['Kept open by a moderator: this post is not archived by itself.']
-      : []),
+    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
   ].join('\n');
 
   const fields: ShrinkableField[] = [];
@@ -476,8 +274,8 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
   const single = party.groups.length === 1;
   for (const group of party.groups) {
     fields.push({
-      field: groupField(view, group, single),
-      shrink: (limit) => groupField(view, group, single, limit),
+      field: groupField(view, group, { single, lobby: true }),
+      shrink: (limit) => groupField(view, group, { single, lobby: true, limit }),
       rank: 1,
     });
   }
@@ -529,8 +327,3 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
     message: { embeds: [embed], components: partyControls(party) },
   };
 }
-
-/** How many trainers are expected in all, for lists of raids. */
-export function trainerCount(party: RaidParty): string {
-  return count(headCount(party), 'trainer');
-}
```

Apply to `src/render/summary.ts`:

```diff
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -1,6 +1,12 @@
-import type { RaidParty } from '../domain/party/party.js';
+import {
+  partyWord,
+  type MeetupParty,
+  type PartyType,
+  type RaidParty,
+} from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
-import { trainerCount } from './raid-post.js';
+import { startTimeOf, timedOver } from '../domain/party/timed.js';
+import { trainerCount } from './party-post.js';
 import { LIMITS, plain, timestamp } from './text.js';
 
 /** The title of the pinned post that lists a region's raids (spec 5.1). */
@@ -30,27 +36,43 @@ function line({ party, title }: ListedRaid, now: number): string {
   return `${post} · ${when} · ${trainerCount(party)}`;
 }
 
+/** A meetup for a list: the party and the title its post has. */
+export interface ListedMeetup {
+  party: MeetupParty;
+  title: string;
+}
+
+/** The heading of the meetups in a region's list, under its raids. */
+export const MEETUPS_HEADING = '**Meetups**';
 /**
- * The text of the summary post: the region's raids that have not ended by the clock, soonest
- * end first. A raid that has ended but whose post is still open is left out. What does not fit
- * into one message is counted in a last line.
+ * The room the meetups of a list are sure of, whatever the raids need: the raids are fitted
+ * into the rest of the message first, and the meetups then have all that the raids left.
  */
-export function renderSummary(raids: readonly ListedRaid[], now: number): string {
-  const going = raids
-    .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
-    .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
-  if (going.length === 0) return 'No raids right now. Report one with `/raid`.';
+const MEETUPS_ROOM = 600;
+
+function meetupLine({ party, title }: ListedMeetup, now: number): string {
+  const post = party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
+  const start = startTimeOf(party);
+  let when = 'no time set';
+  if (start !== null && now < start) when = `starts ${timestamp(start, 'R')}`;
+  else if (party.endTime !== null) when = `ends ${timestamp(party.endTime, 'R')}`;
+  else if (start !== null) when = `started ${timestamp(start, 'R')}`;
+  return `${post} · ${when} · ${trainerCount(party)}`;
+}
+
+/**
+ * As many of `texts`, one per line, as fit into `limit` characters; what does not fit is counted
+ * in a last line.
+ */
+function fitLines(texts: readonly string[], limit: number): string[] {
   const lines: string[] = [];
   let length = 0;
-  for (const [index, raid] of going.entries()) {
-    const text = line(raid, now);
-    const rest = going.length - index;
-    // Room is kept for the line that says how many were left out, unless this is the last raid
+  for (const [index, text] of texts.entries()) {
+    const rest = texts.length - index;
+    // Room is kept for the line that says how many were left out, unless this is the last one
     // and its own line fits: then nothing is left out.
     const fits =
-      rest === 1
-        ? length + text.length <= LIMITS.content
-        : length + text.length + 1 <= LIMITS.content - 30;
+      rest === 1 ? length + text.length <= limit : length + text.length + 1 <= limit - 30;
     if (!fits) {
       lines.push(`…and ${rest} more`);
       break;
@@ -58,7 +80,49 @@ export function renderSummary(raids: readonly ListedRaid[], now: number): string
     lines.push(text);
     length += text.length + 1;
   }
-  return lines.join('\n');
+  return lines;
+}
+
+/**
+ * The text of the summary post: the region's raids that have not ended by the clock, soonest
+ * end first. A raid that has ended but whose post is still open is left out. What does not fit
+ * into one message is counted in a last line.
+ *
+ * The region's meetups follow under a heading of their own, when there are any: those that are
+ * not over, by their start, then those without one in the order they were made. A region
+ * without meetups has the list it always had.
+ */
+export function renderSummary(
+  raids: readonly ListedRaid[],
+  now: number,
+  meetups: readonly ListedMeetup[] = [],
+): string {
+  const going = raids
+    .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
+    .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
+  const planned = meetups
+    .filter(({ party }) => party.status === 'active' && !timedOver(party, now))
+    .sort(
+      (a, b) =>
+        (startTimeOf(a.party) ?? Infinity) - (startTimeOf(b.party) ?? Infinity) ||
+        a.party.createdAt - b.party.createdAt,
+    );
+  const size = (texts: readonly string[]): number =>
+    texts.reduce((sum, text) => sum + text.length + 1, 0);
+  const meetupLines = planned.map((meetup) => meetupLine(meetup, now));
+  // The empty line and the heading above the meetups, each with its line break.
+  const heading = planned.length === 0 ? 0 : MEETUPS_HEADING.length + 2;
+  const wanted = planned.length === 0 ? 0 : heading + size(meetupLines);
+  const above =
+    going.length === 0
+      ? ['No raids right now. Report one with `/raid`.']
+      : fitLines(
+          going.map((raid) => line(raid, now)),
+          LIMITS.content - Math.min(wanted, MEETUPS_ROOM),
+        );
+  if (planned.length === 0) return above.join('\n');
+  const below = fitLines(meetupLines, LIMITS.content - size(above) - heading);
+  return [...above, '', MEETUPS_HEADING, ...below].join('\n');
 }
 
 /**
@@ -66,6 +130,6 @@ export function renderSummary(raids: readonly ListedRaid[], now: number): string
  * (spec 5.1). It is deleted when the party ends. Discord shows the link under the post's title,
  * as it is at that moment, so the line never needs an edit.
  */
-export function renderRegionLink(postId: string): string {
-  return `New raid: <#${postId}>`;
+export function renderRegionLink(postId: string, type: PartyType = 'raid'): string {
+  return `New ${partyWord({ type })}: <#${postId}>`;
 }
```

Apply to `src/render/text.ts`:

```diff
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -60,6 +60,19 @@ export function plain(text: string): string {
   );
 }
 
+/**
+ * Text of several lines that a member wrote (the information about a meetup), made safe like
+ * `plain`, line by line: the lines stay lines, with one empty line between them at most.
+ */
+export function plainLines(text: string): string {
+  return text
+    .split(/\r\n|\r|\n/)
+    .map(plain)
+    .join('\n')
+    .replace(/\n{3,}/g, '\n\n')
+    .trim();
+}
+
 /** `text`, cut to `limit` characters with an ellipsis when it is longer. Never splits a pair. */
 export function truncate(text: string, limit: number): string {
   if (text.length <= limit) return text;
@@ -68,14 +81,38 @@ export function truncate(text: string, limit: number): string {
     if (kept.length + character.length > limit - 1) break;
     kept += character;
   }
-  return `${kept.trimEnd()}…`;
+  kept = kept.trimEnd();
+  // A backslash that escaped the character after the cut would now escape the ellipsis, or
+  // stand there by itself: an odd run of them at the end loses its last.
+  const backslashes = /\\*$/.exec(kept)?.[0].length ?? 0;
+  if (backslashes % 2 === 1) kept = kept.slice(0, -1).trimEnd();
+  return `${kept}…`;
 }
 
-/** A moment as Discord shows it in each reader's own time zone: `<t:1760000000:t>`. */
-export function timestamp(ms: number, style: 't' | 'R' | 'f' | 'd' = 't'): string {
+/**
+ * A moment as Discord shows it in each reader's own time zone: `<t:1760000000:t>`. `t` is the
+ * clock time, `f` the date with it, `F` the weekday too, `R` how long until or since.
+ */
+export function timestamp(ms: number, style: 't' | 'R' | 'f' | 'F' | 'd' = 't'): string {
   return `<t:${Math.floor(ms / 1000)}:${style}>`;
 }
 
+const HALF_A_DAY = 12 * 3_600_000;
+
+/** Whether a time lies more than half a day from now: its clock time alone would not say which day. */
+export function isFarOff(time: number, now: number): boolean {
+  return Math.abs(time - now) > HALF_A_DAY;
+}
+
+/**
+ * A time as a sentence names it: the clock time, with the date when it is far off (an EX or
+ * elite raid, a meetup planned for another day, a clock time that was read as another day than
+ * the member meant).
+ */
+export function clockOrDate(time: number, now: number): string {
+  return timestamp(time, isFarOff(time, now) ? 'f' : 't');
+}
+
 /**
  * As many of `items` as fit into `limit` characters when joined with `separator`; when some do
  * not, the text ends with how many were left out. When not even the first item fits with that
```

Apply to `src/services/party-mirrors.ts`:

```diff
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -9,7 +9,7 @@ import { isRaid, type MirrorKind, type MirrorMessage, type Party } from '../doma
 import { raidMirrors } from '../domain/party/raid.js';
 import type { Logger } from '../log.js';
 import { renderMirror, type MirrorPlace } from '../render/mirrors.js';
-import type { RenderedPost } from '../render/raid-post.js';
+import type { RenderedPost } from '../render/party-post.js';
 import { Coalescer } from './coalescer.js';
 import type { PartyStore } from './party-store.js';
 
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -27,15 +27,13 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
+import { FORUM_TAGS, tidyTitle, type RenderedPost } from '../render/party-post.js';
 import {
-  FORUM_TAGS,
   raidTitle,
   renderRaidPost,
   shownAutoset,
   shownBoss,
-  tidyTitle,
   type RaidPostView,
-  type RenderedPost,
 } from '../render/raid-post.js';
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
 import { plain, withMentions } from '../render/text.js';
```

Apply to `src/services/raid-change-service.ts`:

```diff
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -31,7 +31,7 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import type { RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
-import { plain, timestamp } from '../render/text.js';
+import { clockOrDate, plain, timestamp } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import type { GameDataProvider } from './game-data-service.js';
 import type { PartyLines } from './party-lines.js';
@@ -39,8 +39,6 @@ import type { RelocateOutcome } from './party-service.js';
 import type { PartyStore } from './party-store.js';
 import type { RegionProvider } from './region-directory.js';
 
-const HOUR = 3_600_000;
-
 /**
  * What came of a change to a raid. `gone`: there is no such active raid. `refused`: the raid
  * stays as it was; for `gym-taken`, `other` is the raid that holds the gym. `ok`: the raid as it
@@ -136,7 +134,7 @@ export class RaidChangeService {
 
   /** A time as a line names it: the clock time, with the date when it is far off. */
   private when(time: number): string {
-    return timestamp(time, Math.abs(time - this.now()) > 12 * HOUR ? 'f' : 't');
+    return clockOrDate(time, this.now());
   }
 
   /** When the egg hatches (or hatched); the end follows. The caller has checked the time. */
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/setup-forums.test.ts src/commands/parties/delete.test.ts src/commands/raids/raid.test.ts src/render/meetup-post.test.ts src/render/party-controls.test.ts src/render/summary.test.ts src/render/text.test.ts src/services/party-service.test.ts test/support/fake-gateway.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 669c6dc -- src test   # must print nothing
npx prettier --check src/commands/admin/setup-forums.test.ts src/commands/parties/delete.test.ts src/commands/parties/delete.ts src/commands/raids/change.ts src/commands/raids/raid-input.ts src/commands/raids/raid.test.ts src/render/meetup-post.test.ts src/render/meetup-post.ts src/render/mirrors.ts src/render/party-controls.test.ts src/render/party-controls.ts src/render/party-post.ts src/render/raid-post.ts src/render/summary.test.ts src/render/summary.ts src/render/text.test.ts src/render/text.ts src/services/party-mirrors.ts src/services/party-service.test.ts src/services/party-service.ts src/services/raid-change-service.ts test/support/fake-gateway.test.ts test/support/fake-gateway.ts test/support/party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/admin/setup-forums.test.ts src/commands/parties/delete.test.ts src/commands/parties/delete.ts src/commands/raids/change.ts src/commands/raids/raid-input.ts src/commands/raids/raid.test.ts src/render/meetup-post.test.ts src/render/meetup-post.ts src/render/mirrors.ts src/render/party-controls.test.ts src/render/party-controls.ts src/render/party-post.ts src/render/raid-post.ts src/render/summary.test.ts src/render/summary.ts src/render/text.test.ts src/render/text.ts src/services/party-mirrors.ts src/services/party-service.test.ts src/services/party-service.ts src/services/raid-change-service.ts test/support/fake-gateway.test.ts test/support/fake-gateway.ts test/support/party-service.ts
git commit -m "What a meetup shows: its post, its controls, and its place in the region's list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,120 unit tests.

---

### Task 6: PartyService and the scheduler for both kinds

**Files:**
- Create: `src/services/party-scheduler.meetup.test.ts`, `src/services/party-service.meetup.test.ts`
- Modify: `src/app.ts`, `src/discord/party-gateway.ts`, `src/render/activity.test.ts`, `src/render/activity.ts`, `src/services/access-service.test.ts`, `src/services/party-scheduler.ts`, `src/services/party-service.test.ts`, `src/services/party-service.ts`, `test/support/parties.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: `PartyService` (`reportRaid`, `changed`, `end`, `closePost`, `summaryText`, `requestDeletion`), `PartyScheduler`, `PartyMirrors`, `renderMeetupPost`, `createMeetup` of the domain, `archiveWarning`.
- Produces: `PartyService.createMeetup({ regionChannelId, name, creator, … })` answering `created` with the party, or `no-region` / `no-forum` / `bad-name`; rendering by kind; the tags set at every end of a party that is no raid; `archiveWarning(party, …)` worded by kind, pinging the maker of a meetup without an end time once when their settings allow; `createdMeetup()` and `asMeetup()` in the test support; an access test with a meetup.

A meetup takes no gym lock and has no copies in the remote and EX channels. The guarantees of a report hold: never active without a post, the post undone when storing fails, a failed link line only a warning.

Reference commit of the prototype for this task: `9976fe5`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/render/activity.test.ts`:

```diff
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -2,7 +2,7 @@ import { describe, expect, it } from 'vitest';
 import { ALICE, testRaid, withAttendees } from '../../test/support/parties.js';
 import type { Attendee, PartyProblem, RaidParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { problemText, standing, standingLine, standingReply } from './activity.js';
+import { archiveWarning, problemText, standing, standingLine, standingReply } from './activity.js';
 
 const base: Attendee = { number: 1, status: PartyStatus.Coming, group: 'A', remote: false };
 const one = testRaid();
@@ -112,3 +112,30 @@ describe('problemText', () => {
     );
   });
 });
+
+describe('archiveWarning', () => {
+  const WHEN = 1_791_900_000_000;
+  const archive = `I will archive this post <t:${WHEN / 1000}:R>; it stays readable afterwards.`;
+
+  it('says that a raid is over, with or without an end time', () => {
+    expect(archiveWarning({ type: 'raid', endTime: WHEN - 600_000 }, WHEN)).toBe(
+      `This raid is over. ${archive}`,
+    );
+    expect(archiveWarning({ type: 'raid', endTime: null }, WHEN)).toBe(
+      `This raid is over. ${archive}`,
+    );
+  });
+
+  it('says that a meetup whose end time has passed is over', () => {
+    expect(archiveWarning({ type: 'meetup', endTime: WHEN - 3_900_000 }, WHEN)).toBe(
+      `This meetup is over. ${archive}`,
+    );
+  });
+
+  it('tells a meetup without an end time how to stay open', () => {
+    expect(archiveWarning({ type: 'meetup', endTime: null }, WHEN)).toBe(
+      `This meetup has no end time, so I take it to be over. ${archive} ` +
+        'A time set with `/meet` or `/end` keeps it open.',
+    );
+  });
+});
```

Apply to `src/services/access-service.test.ts`:

```diff
--- a/src/services/access-service.test.ts
+++ b/src/services/access-service.test.ts
@@ -2,7 +2,12 @@ import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
 import { EAST_CHANNEL, EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js';
 import { ALICE, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
-import { MemoryAccessGrants, reportedRaid, restarted } from '../../test/support/party-service.js';
+import {
+  createdMeetup,
+  MemoryAccessGrants,
+  reportedRaid,
+  restarted,
+} from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
@@ -487,3 +492,68 @@ describe('AccessService: over a restart, and the sweep', () => {
     await third.scheduler.stop();
   });
 });
+
+describe('AccessService: a meetup', () => {
+  /** Lets everything that is under way finish, for a meetup made through the service. */
+  async function done(made: Awaited<ReturnType<typeof createdMeetup>>): Promise<void> {
+    await made.attendance.flush();
+    await made.access.flush();
+    await made.service.flush();
+  }
+  const calls = (made: Awaited<ReturnType<typeof createdMeetup>>): string[] =>
+    made.gateway.calls.filter((call) => /^(admit|dismiss)Member /.test(call));
+
+  it('lets a member of another region into the forum of a meetup they sign up for', async () => {
+    const made = await createdMeetup();
+    made.gateway.shutOut(WEST_FORUM, ALICE);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Interested);
+    await done(made);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
+    expect(calls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
+    expect(await made.grants.list()).toEqual([
+      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: made.clock.now },
+    ]);
+  });
+
+  it('takes the access back when they leave, also by Done, which means leave there', async () => {
+    const made = await createdMeetup();
+    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
+    await done(made);
+    await made.attendance.leave(made.party.id, alice);
+    await made.attendance.done(made.party.id, bob);
+    await done(made);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
+    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
+    expect(calls(made).slice(2).sort()).toEqual([
+      `dismissMember ${WEST_FORUM} ${ALICE}`,
+      `dismissMember ${WEST_FORUM} ${BOB}`,
+    ]);
+    expect(await made.grants.list()).toEqual([]);
+  });
+
+  it('takes it back when the meetup ends, and lets in who makes one where they cannot see', async () => {
+    const made = await createdMeetup({ creatorId: CAROL });
+    // Whoever made it is signed up; a forum they cannot see is opened to them afterwards.
+    made.gateway.shutOut(WEST_FORUM, ALICE);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    await done(made);
+    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
+    await made.service.end(made.party.id);
+    await done(made);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
+    expect(await made.grants.list()).toEqual([]);
+
+    const other = await createdMeetup({}, {}, { gateway: made.gateway });
+    other.gateway.shutOut(WEST_FORUM, REPORTER);
+    const second = await other.service.createMeetup({
+      name: 'Second',
+      creatorId: REPORTER,
+      regionChannelId: '100000000000000001',
+    });
+    expect(second.kind).toBe('created');
+    await done(other);
+    expect(other.gateway.canSee(WEST_FORUM, REPORTER)).toBe(true);
+  });
+});
```

Create `src/services/party-scheduler.meetup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import {
  ALICE,
  asMeetup,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
} from '../../test/support/parties.js';
import { createdMeetup, restarted } from '../../test/support/party-service.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { setStartTime, setTimedEnd } from '../domain/party/timed.js';
import type { Member } from './attendance-service.js';
import { WARN_AGAIN_AFTER } from './party-scheduler.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

type Made = Awaited<ReturnType<typeof createdMeetup>>;

/** Runs the clock at a time and lets everything it started go out. */
async function tickAt(made: Made, time: number): Promise<void> {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.scheduler.whenIdle();
  await made.attendance.flush();
  await made.service.flush();
}

function tagsOf(made: Made): string[] {
  const names = Object.entries(made.tags[WEST_FORUM]);
  const applied = made.gateway.posts.get(made.postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

const lines = (made: Made): string[] => made.said().join('\n').split('\n').filter(Boolean);
const embed = (made: Made) => made.gateway.posts.get(made.postId)?.message.embeds?.[0];

/** A meetup from 16:00 to 18:00, with Alice and Bob here. */
async function planned(): Promise<Made> {
  const made = await createdMeetup();
  const id = made.party.id;
  await made.store.update(id, (party) => setStartTime(asMeetup(party), REPORTER, START, PARTY_NOW));
  await made.store.update(id, (party) => setTimedEnd(asMeetup(party), END, PARTY_NOW));
  await made.attendance.signUp(id, alice, PartyStatus.Present);
  await made.attendance.signUp(id, bob, PartyStatus.Present);
  await made.attendance.flush();
  await made.service.flush();
  return made;
}

describe('PartyScheduler: a meetup while it goes on', () => {
  it('does nothing while nothing is due', async () => {
    const made = await planned();
    // The first tick after a start looks at every post once.
    await tickAt(made, PARTY_NOW);
    const before = made.gateway.calls.length;
    const stored = made.current();
    await tickAt(made, PARTY_NOW + 5 * MINUTE);
    expect(made.current()).toBe(stored);
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('shows the post anew when the start time passes, and says nothing', async () => {
    const made = await planned();
    await tickAt(made, START - MINUTE);
    const stored = made.current();
    const said = lines(made);
    const edits = () => made.gateway.posts.get(made.postId)?.edits ?? 0;
    const before = edits();
    expect(embed(made)?.description).toContain(`Starts ${stamp(START, 'R')}`);
    await tickAt(made, START);
    expect(embed(made)?.description).toContain(
      `Started at ${stamp(START)}. Ends ${stamp(END, 'R')}, at ${stamp(END)}.`,
    );
    expect(edits()).toBe(before + 1);
    // Nothing is written and nothing said; long after the start nothing happens either.
    await tickAt(made, START + 11 * MINUTE);
    await tickAt(made, END - MINUTE);
    expect(made.current()).toBe(stored);
    expect(edits()).toBe(before + 1);
    expect(lines(made)).toEqual(said);
  });

  it('asks nobody whether they are done, and never counts anybody as done', async () => {
    const made = await planned();
    await tickAt(made, PARTY_NOW);
    await tickAt(made, END + 4 * MINUTE);
    expect(made.current().prompts.completion).toEqual([]);
    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Present);
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(lines(made).some((line) => /completed|done/.test(line))).toBe(false);
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.components ?? []).toEqual([]);
    }
  });

  it('shows the post as ended when the end time passes, and says nothing', async () => {
    const made = await planned();
    await tickAt(made, END - MINUTE);
    expect(tagsOf(made)).toEqual(['Meetup']);
    expect(embed(made)?.color).toBe(0x3498db);
    const said = lines(made);
    await tickAt(made, END);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    expect(embed(made)?.color).toBe(0xe74c3c);
    expect(embed(made)?.description).toContain(`Ended at ${stamp(END, 'F')}.`);
    expect(lines(made)).toEqual(said);
    // The title does not change with the end, and the controls stay until the archiving.
    expect(made.gateway.posts.get(made.postId)?.renames).toBe(0);
    expect(made.gateway.posts.get(made.postId)?.message.components?.length).toBe(2);
  });

  it('shows the date of its times once the day has changed', async () => {
    const made = await createdMeetup();
    const tomorrow = at('2026-10-14T10:00');
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, tomorrow, PARTY_NOW),
    );
    await tickAt(made, PARTY_NOW + MINUTE);
    expect(embed(made)?.description).toContain(`at ${stamp(tomorrow, 'F')}.`);
    await tickAt(made, at('2026-10-14T00:00'));
    expect(embed(made)?.description).toContain(`at ${stamp(tomorrow)}.`);
  });
});

describe('PartyScheduler: archiving a meetup', () => {
  it('warns five minutes after the end, an hour ahead, and archives the post then', async () => {
    const made = await planned();
    await tickAt(made, END + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = END + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const due = warnedAt + 60 * MINUTE;
    expect(made.current().deletionTime).toBe(due);
    expect(lines(made).at(-1)).toBe(
      `This meetup is over. I will archive this post ${stamp(due, 'R')}; it stays readable afterwards.`,
    );
    expect(made.current().prompts.warning).not.toBeNull();
    // Not after the ten minutes of a raid.
    await tickAt(made, warnedAt + 11 * MINUTE);
    expect(made.store.get(made.party.id)).toBeDefined();
    await tickAt(made, due - MINUTE);
    expect(made.store.get(made.party.id)).toBeDefined();
    await tickAt(made, due);
    expect(made.store.get(made.party.id)).toBeUndefined();
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(post?.message.components).toEqual([]);
    // The warning and the link line went with it.
    expect(made.said().some((text) => text.includes('I will archive'))).toBe(false);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('gives a meetup nobody gave a time a day, and says that a time keeps it open', async () => {
    const made = await createdMeetup();
    await tickAt(made, PARTY_NOW + DAY + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = PARTY_NOW + DAY + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const due = warnedAt + 60 * MINUTE;
    // The member who made it is told, with a ping: nothing else says that their meetup goes.
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content:
          'This meetup has no end time, so I take it to be over. ' +
          `I will archive this post ${stamp(due, 'R')}; it stays readable afterwards. ` +
          `A time set with \`/meet\` or \`/end\` keeps it open.\n<@${REPORTER}>`,
        mention: { users: [REPORTER] },
      },
    ]);
    // It is not shown as ended yet: nobody said that it has. The post says when it goes.
    expect(tagsOf(made)).toEqual(['Meetup']);
    expect(embed(made)?.color).toBe(0x3498db);
    expect(embed(made)?.description).toContain(
      `Without one this post is archived ${stamp(due, 'R')}.`,
    );
    await tickAt(made, due);
    expect(made.store.get(made.party.id)).toBeUndefined();
    // The archived post does not look as if the meetup were still going on.
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(post?.message.components).toEqual([]);
    expect(embed(made)?.description).toBe(
      `**Meetup**\nThis meetup is over.\nCreated by <@${REPORTER}>.`,
    );
    expect(embed(made)?.color).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
  });

  it('shows a meetup that only had a start as over too when its day has run out', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, START, PARTY_NOW),
    );
    await tickAt(made, START + DAY + 6 * MINUTE);
    await tickAt(made, START + DAY + 66 * MINUTE);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(embed(made)?.description?.split('\n')[1]).toBe('This meetup is over.');
    expect(embed(made)?.color).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('pings nobody for the warning when the maker does not allow it, or the meetup had an end', async () => {
    const quiet = await createdMeetup();
    quiet.userSettings.set(REPORTER, { mentions: false });
    await tickAt(quiet, PARTY_NOW + DAY + 6 * MINUTE);
    expect(quiet.gateway.messagesIn(quiet.postId).at(-1)?.message.mention).toBeUndefined();
    expect(quiet.said().at(-1)).not.toContain('<@');

    const ended = await planned();
    await tickAt(ended, END + 6 * MINUTE);
    expect(ended.gateway.messagesIn(ended.postId).at(-1)?.message).toEqual({
      content: `This meetup is over. I will archive this post ${stamp(END + 66 * MINUTE, 'R')}; it stays readable afterwards.`,
    });
  });

  it('pings the maker once: the warning that is said again pings nobody', async () => {
    const made = await createdMeetup();
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    for (let n = 0; n < WARN_AGAIN_AFTER; n++) made.scheduler.activity(made.postId);
    await made.scheduler.whenIdle();
    const [again, ...others] = made.gateway.messagesIn(made.postId);
    expect(others).toEqual([]);
    expect(again?.message.mention).toBeUndefined();
    expect(again?.message.content).toMatch(/^This meetup has no end time/);
  });

  it('gives an old meetup a day when its last time is taken away: no warning before', async () => {
    const made = await planned();
    const late = END + 3 * DAY;
    // Kept by nobody, long over, and warned.
    await tickAt(made, late);
    expect(made.current().deletionTime).not.toBeNull();
    await made.store.update(made.party.id, (party) => setTimedEnd(asMeetup(party), null, late));
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, null, late),
    );
    expect(made.current()).toMatchObject({ deletionTime: null, lastPossibleTime: late + DAY });
    await tickAt(made, late + MINUTE);
    expect(made.current().prompts.warning).toBeNull();
    expect(made.said().some((text) => text.includes('I will archive'))).toBe(false);
    await tickAt(made, late + DAY + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, late + DAY + 6 * MINUTE);
    expect(made.current().deletionTime).toBe(late + DAY + 66 * MINUTE);
  });

  it('does not archive a meetup whose end was set while the tick was deciding', async () => {
    const made = await planned();
    await tickAt(made, END + 6 * MINUTE);
    const due = made.current().deletionTime ?? 0;
    made.clock.now = due;
    // The tick is queued, and right behind it a later end.
    const ticking = made.scheduler.tick();
    const corrected = made.store.update(made.party.id, (party) =>
      setTimedEnd(asMeetup(party), due + 2 * HOUR, made.clock.now),
    );
    await Promise.all([ticking, corrected]);
    await made.scheduler.whenIdle();
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.current()).toMatchObject({ endTime: due + 2 * HOUR, deletionTime: null });
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('counts the day from the start of a meetup that has one', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, START, PARTY_NOW),
    );
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, START + DAY + 6 * MINUTE);
    expect(made.current().deletionTime).toBe(START + DAY + 66 * MINUTE);
  });

  it('takes the warning back when a time that is set says the meetup goes on', async () => {
    const made = await createdMeetup();
    const warnedAt = PARTY_NOW + DAY + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const warning = made.current().prompts.warning;
    expect(warning).not.toBeNull();
    // Somebody says when it ends after all.
    const later = warnedAt + 3 * HOUR;
    await made.store.update(made.party.id, (party) =>
      setTimedEnd(asMeetup(party), later, made.clock.now),
    );
    expect(made.current().deletionTime).toBeNull();
    await tickAt(made, warnedAt + MINUTE);
    expect(made.current().prompts.warning).toBeNull();
    expect(lines(made)).toEqual([]);
    expect(made.gateway.deleted).toContainEqual({ channelId: made.postId, messageId: warning });
    // Its hour is long past: nothing archives it before the new end.
    await tickAt(made, warnedAt + 2 * HOUR);
    expect(made.store.get(made.party.id)).toBeDefined();
    await tickAt(made, later + 6 * MINUTE);
    expect(lines(made).at(-1)).toMatch(/^This meetup is over\. I will archive this post/);
  });

  it('never archives a meetup a moderator keeps', async () => {
    const made = await planned();
    await made.service.keep(made.party.id, true, ALICE);
    await tickAt(made, END + 3 * DAY);
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.current().deletionTime).toBeNull();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('says the warning again below every fifth message, as in the post of a raid', async () => {
    const made = await planned();
    await tickAt(made, END + 6 * MINUTE);
    const first = made.current().prompts.warning;
    for (let n = 0; n < WARN_AGAIN_AFTER; n++) made.scheduler.activity(made.postId);
    await made.scheduler.whenIdle();
    const second = made.current().prompts.warning;
    expect(second).not.toBe(first);
    expect(made.gateway.deleted).toContainEqual({ channelId: made.postId, messageId: first });
    expect(made.said().filter((text) => text.startsWith('This meetup is over.'))).toHaveLength(1);
  });

  it('catches up after downtime: one tick shows the end, the next ones warn and archive', async () => {
    const made = await planned();
    const again = await restarted(made);
    const tick = async (time: number) => {
      again.clock.now = time;
      await again.scheduler.tick();
      await again.scheduler.whenIdle();
      await again.attendance.flush();
      await again.service.flush();
    };
    await tick(END + 2 * HOUR);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    const due = again.store.get(made.party.id)?.deletionTime ?? 0;
    expect(due).toBe(END + 3 * HOUR);
    await tick(due);
    expect(again.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });
});
```

Create `src/services/party-service.meetup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  EX_CHANNEL,
  REMOTE_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import {
  ALICE,
  asMeetup,
  at,
  BOB,
  MINUTE,
  REPORTER,
  testMeetup,
} from '../../test/support/parties.js';
import {
  createdMeetup,
  gatewayWithMirrorChannels,
  partyServiceWith,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { setDescription } from '../domain/party/meetup.js';
import { PartyStatus } from '../domain/party/status.js';
import { endParty } from '../domain/party/party.js';
import { setName, setStartTime, setTimedEnd } from '../domain/party/timed.js';
import { partyControls } from '../render/party-controls.js';
import { renderMeetupPost } from '../render/meetup-post.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');

type Made = Awaited<ReturnType<typeof createdMeetup>>;

/** The names of the tags a post carries. */
function tagsOf(made: Made, postId = made.postId): string[] {
  const names = Object.entries(made.tags[WEST_FORUM]);
  const applied = made.gateway.posts.get(postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

describe('PartyService.createMeetup', () => {
  it('stores the meetup and makes its post in the forum of the region it was made in', async () => {
    const made = await createdMeetup({ creator: { name: 'Rhea', team: 'valor' } });
    const { party, postId, gateway, store } = made;
    expect(party).toMatchObject({
      type: 'meetup',
      status: 'active',
      regionId: 1,
      guildId: 1,
      gymId: null,
      forumChannelId: WEST_FORUM,
      forumPostId: postId,
      createdById: REPORTER,
      anonymous: false,
      timed: { name: 'Community Day picnic', startTime: null },
      meetup: { description: null },
    });
    expect(store.get(party.id)).toEqual(party);
    expect(store.byPost(postId)?.id).toBe(party.id);
    // Who made it is signed up as interested, with the name and team the interaction said.
    expect(party.attendees).toEqual({
      [REPORTER]: {
        number: 1,
        status: PartyStatus.Interested,
        group: 'A',
        remote: false,
        name: 'Rhea',
        team: 'valor',
      },
    });
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Meetup · Community Day picnic' });
    expect(tagsOf(made)).toEqual(['Meetup']);
    expect(post?.message).toEqual(
      renderMeetupPost(made.service.meetupView(made.current())).message,
    );
    expect(post?.message.components).toEqual(partyControls(made.current()));
  });

  it('links to the new post in the channel of the region, as a meetup', async () => {
    const made = await createdMeetup();
    const [link, ...others] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(`New meetup: <#${made.postId}>`);
    expect(others).toEqual([]);
    expect(made.current().regionLinkMessageId).toBe(link?.id);
  });

  it('goes into the forum of the region whose channel it was made in', async () => {
    const made = await createdMeetup({ regionChannelId: EAST_CHANNEL });
    expect(made.party).toMatchObject({ regionId: 2, forumChannelId: EAST_FORUM });
    expect(made.gateway.posts.get(made.postId)?.forumId).toBe(EAST_FORUM);
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('edits nothing right after the post was made: what was sent is what it shows', async () => {
    const made = await createdMeetup();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ edits: 0, renames: 0, retags: 0 });
  });

  it('keeps meetups apart by nothing: two with one name are two meetups', async () => {
    const made = await createdMeetup();
    const second = await made.service.createMeetup({
      name: 'Community Day picnic',
      creatorId: ALICE,
      regionChannelId: WEST_CHANNEL,
    });
    expect(second.kind).toBe('created');
    expect(made.store.active().map((party) => party.type)).toEqual(['meetup', 'meetup']);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  it('makes nothing for a text that is no name', async () => {
    const made = await partyServiceWith();
    const request = { creatorId: REPORTER, regionChannelId: WEST_CHANNEL };
    expect(await made.service.createMeetup({ ...request, name: '   ' })).toEqual({
      kind: 'bad-name',
    });
    expect(await made.service.createMeetup({ ...request, name: 'x'.repeat(81) })).toEqual({
      kind: 'bad-name',
    });
    expect(made.storage.writes).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('says so for a channel that is no region, and for a region without a forum', async () => {
    const made = await partyServiceWith();
    const request = { name: 'Picnic', creatorId: REPORTER };
    expect(
      await made.service.createMeetup({ ...request, regionChannelId: '100000000000000099' }),
    ).toEqual({ kind: 'no-region' });
    expect(
      await made.service.createMeetup({ ...request, regionChannelId: UNBOUNDED_CHANNEL }),
    ).toEqual({ kind: 'no-forum', region: made.regions.byChannel(UNBOUNDED_CHANNEL) });
    expect(made.storage.writes).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('ends the meetup again when its post cannot be made', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('createPost', new Error('Discord is down'));
    await expect(
      made.service.createMeetup({
        name: 'Picnic',
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      }),
    ).rejects.toThrow('Discord is down');
    expect(made.store.active()).toEqual([]);
    expect([...made.storage.rows.values()].map((row) => row.status)).toEqual(['ended']);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('says that the region has no forum when the forum is gone, and leaves no meetup', async () => {
    const made = await partyServiceWith();
    made.gateway.gone.add(WEST_FORUM);
    const outcome = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    expect(outcome).toMatchObject({ kind: 'no-forum', region: { id: 1 } });
    expect(made.store.active()).toEqual([]);
  });

  it('makes the meetup all the same when the link line cannot be posted', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('sendMessage', new Error('no permission in the region channel'));
    const outcome = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    expect(outcome.party).toMatchObject({ forumChannelId: WEST_FORUM, regionLinkMessageId: null });
    expect(made.store.get(outcome.party.id)).toEqual(outcome.party);
    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(
      made.entries.some((entry) => entry.msg === 'could not post the link to a new meetup'),
    ).toBe(true);
  });

  it('makes nothing on Discord when the meetup cannot be stored', async () => {
    const made = await partyServiceWith();
    made.storage.failing = new Error('the database is away');
    await expect(
      made.service.createMeetup({
        name: 'Picnic',
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      }),
    ).rejects.toThrow('the database is away');
    made.storage.failing = undefined;
    expect(made.store.active()).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('ends a meetup that a stop left without a post, like a raid', async () => {
    const orphan = testMeetup();
    const made = await partyServiceWith([orphan]);
    await expect(made.service.endPartiesWithoutPost()).resolves.toBe(1);
    expect(made.store.active()).toEqual([]);
  });
});

describe('PartyService: the post of a meetup', () => {
  it('shows who signed up after a change', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 2 });
    await made.service.flush();
    const post = made.gateway.posts.get(made.postId);
    expect(post?.edits).toBe(1);
    expect(post?.message.embeds?.[0]?.fields).toEqual([
      {
        name: 'Trainers (3)',
        value: `**Coming** ❄️ <@${ALICE}> +1\n**Interested** <@${REPORTER}>`,
      },
    ]);
    // A render that would change nothing is not sent.
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
  });

  it('follows the name with its title, and shows times and information', async () => {
    const made = await createdMeetup();
    const { store, service, gateway, postId, clock } = made;
    await store.update(made.party.id, (party) => setName(asMeetup(party), 'Raid hour meet'));
    await store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, START, clock.now),
    );
    await store.update(made.party.id, (party) => setTimedEnd(asMeetup(party), END, clock.now));
    await store.update(made.party.id, (party) => setDescription(asMeetup(party), 'Bring snacks.'));
    service.changed(made.party.id);
    await service.flush();
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ title: 'Meetup · Raid hour meet', renames: 1 });
    const embed = post?.message.embeds?.[0];
    expect(embed?.title).toBe('Raid hour meet');
    expect(embed?.description).toContain(
      `Starts <t:${START / 1000}:R>, at <t:${START / 1000}:t>. Ends at <t:${END / 1000}:t>.`,
    );
    expect(embed?.description?.endsWith('\n\n**Information**\nBring snacks.')).toBe(true);
  });

  it('has no copies in the channels for remote raids and raids at EX gyms', async () => {
    const made = await createdMeetup(
      {},
      { renderDelayMs: 0, sharedDelayMs: 0 },
      { gateway: gatewayWithMirrorChannels() },
    );
    await made.attendance.setRemote(made.party.id, alice, true);
    await made.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(made.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('puts the meetup at the bottom of its post again for /status, and keeps that copy current', async () => {
    const made = await createdMeetup();
    expect(await made.service.showStatus(made.party.id)).toBe(true);
    await made.service.flush();
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: made.postId, messageId: copy?.id, kind: 'status' },
    ]);
    expect(copy?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.service.flush();
    const [updated] = made.gateway.messagesIn(made.postId);
    expect(updated?.message.embeds?.[0]?.fields?.[0]?.value).toContain(`<@${ALICE}>`);
    expect(updated?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
  });

  it('lists the meetup in the summary of its region, under the raids', async () => {
    const made = await createdMeetup();
    expect(made.service.summaryText(1).split('\n')).toEqual([
      'No raids right now. Report one with `/raid`.',
      '',
      '**Meetups**',
      `<#${made.postId}> · no time set · 1 trainer`,
    ]);
    expect(made.service.summaryText(2)).toBe('No raids right now. Report one with `/raid`.');
    const gym = gymsFixture().get(1);
    if (!gym) throw new Error('no gym');
    const raid = await made.service.reportRaid({
      gym,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Coming,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error(raid.kind);
    expect(made.service.summaryText(1).split('\n')).toEqual([
      `<#${raid.party.forumPostId ?? ''}> · no time set · 1 trainer`,
      '',
      '**Meetups**',
      `<#${made.postId}> · no time set · 1 trainer`,
    ]);
  });

  it('brings the pinned summary up to date when a meetup is made, changes and ends', async () => {
    const before = await partyServiceWith();
    const [west] = before.regions.rows;
    if (!west) throw new Error('no region');
    await before.service.ensureSummary(west);
    const summaryId = before.regions.byId(1)?.summaryMessageId ?? '';
    const text = () => before.gateway.posts.get(summaryId)?.message.content;
    expect(text()).toBe('No raids right now. Report one with `/raid`.');

    const outcome = await before.service.createMeetup({
      name: 'Picnic',
      creatorId: REPORTER,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    await before.service.flush();
    expect(text()).toContain(`<#${outcome.party.forumPostId ?? ''}> · no time set · 1 trainer`);

    await before.attendance.signUp(outcome.party.id, alice, PartyStatus.Coming);
    await before.service.flush();
    expect(text()).toContain('2 trainers');

    await before.service.end(outcome.party.id);
    await before.service.flush();
    expect(text()).toBe('No raids right now. Report one with `/raid`.');
  });
});

describe('PartyService: ending a meetup', () => {
  it('strips the controls, deletes the link line and the copy, and archives the post', async () => {
    const made = await createdMeetup();
    const { service, store, gateway, postId } = made;
    await service.showStatus(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(postId)).toHaveLength(1);

    expect(await service.end(made.party.id)).toBe(true);

    expect(store.get(made.party.id)).toBeUndefined();
    expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(post?.message.components).toEqual([]);
    expect(post?.message.embeds?.[0]?.title).toBe('Community Day picnic');
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(postId)).toEqual([]);
    expect(gateway.calls.filter((call) => call.endsWith(` ${postId}`)).at(-1)).toBe(
      `archivePost ${postId}`,
    );
  });

  it('says the last words, shows them in the place of the times, and tags the post as ended', async () => {
    const made = await createdMeetup();
    const words = 'This meetup was closed by <@200000000000000009>.';
    let answered = false;
    expect(
      await made.service.end(made.party.id, undefined, {
        lastWords: words,
        left: () => {
          answered = true;
          return Promise.resolve();
        },
      }),
    ).toBe(true);
    expect(answered).toBe(true);
    expect(made.said()).toEqual([words]);
    const post = made.gateway.posts.get(made.postId);
    expect(post?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(words);
    expect(post?.message.embeds?.[0]?.color).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
    expect(post).toMatchObject({ archived: true, locked: true });
  });

  it('ends only when the condition holds for the meetup as it is stored then', async () => {
    const made = await createdMeetup();
    expect(await made.service.end(made.party.id, (party) => party.saved)).toBe(false);
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(await made.service.end(made.party.id, (party) => party.type === 'meetup')).toBe(true);
  });

  it('ends the meetup when somebody deleted its post', async () => {
    const made = await createdMeetup();
    made.gateway.gone.add(made.postId);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('archives the open post of an ended meetup in its sweep', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(await made.service.sweepPosts()).toBe(1);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });
});

describe('PartyService: what is said about a meetup', () => {
  it('puts a request to delete it into the post, as a meetup, pinging the roles once', async () => {
    const made = await createdMeetup();
    const roles = ['500000000000000001'];
    expect(await made.service.requestDeletion(made.party.id, ALICE, 'Made twice', roles)).toBe(
      'asked',
    );
    const [request] = made.gateway.messagesIn(made.postId);
    expect(request?.message).toEqual({
      content: `<@&500000000000000001>: <@${ALICE}> asks for this meetup to be deleted.\n> Made twice`,
      mention: { roles },
    });
    expect(await made.service.requestDeletion(made.party.id, ALICE, 'Again', roles)).toBe(
      'already',
    );
  });

  it('keeps a meetup for a moderator, and the post says who did', async () => {
    const made = await createdMeetup();
    expect(await made.service.keep(made.party.id, true, ALICE)).toBe('kept');
    expect(made.current().saved).toBe(true);
    expect(made.said()).toEqual([
      `<@${ALICE}> keeps this post open: it will not be archived by itself.`,
    ]);
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
      'Kept open by a moderator',
    );
  });

  it('never moves a meetup to a gym: there is no such raid', async () => {
    const made = await createdMeetup();
    const gym = gymsFixture().get(8);
    const east = made.regions.byId(2);
    if (!gym || !east) throw new Error('no gym or region');
    expect(await made.service.relocate(made.party.id, gym, east)).toEqual({ kind: 'gone' });
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
  });
});

describe('PartyService: a meetup after a restart', () => {
  it('shows the post anew from what is stored, and finds the meetup by its post', async () => {
    const made = await createdMeetup();
    await made.store.update(made.party.id, (party) =>
      setStartTime(asMeetup(party), REPORTER, START, made.clock.now),
    );
    const again = await restarted(made);
    expect(again.store.byPost(made.postId)).toEqual(made.current());
    again.clock.now += MINUTE;
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(again.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
      `Starts <t:${START / 1000}:R>`,
    );
  });
});
```

Apply to `src/services/party-service.test.ts`:

```diff
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -383,7 +383,7 @@ describe('PartyService: the summary and tidying up', () => {
     const { service, store, entries } = await partyServiceWith([orphan, posted]);
     await expect(service.endPartiesWithoutPost()).resolves.toBe(1);
     expect(store.active().map((party) => party.id)).toEqual([posted.id]);
-    expect(entries.some((entry) => entry.msg === 'ended raids that had no post')).toBe(true);
+    expect(entries.some((entry) => entry.msg === 'ended parties that had no post')).toBe(true);
     await expect(service.endPartiesWithoutPost()).resolves.toBe(0);
   });
 });
```

Apply to `test/support/parties.ts`:

```diff
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -103,6 +103,12 @@ export function asRaid(party: Party | undefined): RaidParty {
   return party;
 }
 
+/** The party as the meetup it is, for a test that reads or changes what only a meetup has. */
+export function asMeetup(party: Party | undefined): MeetupParty {
+  if (party?.type !== 'meetup') throw new Error(`not a meetup: ${party?.type ?? 'no party'}`);
+  return party;
+}
+
 /** The party with these attendees added or replaced; each defaults to coming, alone, group A. */
 export function withAttendees<P extends Party>(
   party: P,
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -13,17 +13,30 @@ import { AccessService } from '../../src/services/access-service.js';
 import { PartyLines } from '../../src/services/party-lines.js';
 import { PartyScheduler } from '../../src/services/party-scheduler.js';
 import { AttendanceService } from '../../src/services/attendance-service.js';
-import { isRaid, type Party, type RaidParty } from '../../src/domain/party/party.js';
+import {
+  isRaid,
+  type MeetupParty,
+  type Party,
+  type RaidParty,
+} from '../../src/domain/party/party.js';
 import { FORUM_TAGS } from '../../src/render/party-post.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import {
   PartyService,
+  type MeetupRequest,
   type PartyServiceOptions,
   type RaidReport,
 } from '../../src/services/party-service.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { catalogueFixture } from './game-data.js';
-import { EAST_FORUM, EX_CHANNEL, REMOTE_CHANNEL, testRegions, WEST_FORUM } from './gyms.js';
+import {
+  EAST_FORUM,
+  EX_CHANNEL,
+  REMOTE_CHANNEL,
+  testRegions,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from './gyms.js';
 import { MemoryPartyStorage, PARTY_NOW, REPORTER } from './parties.js';
 import { gymsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
@@ -243,6 +256,7 @@ export async function partyServiceWith(
     lines,
     gateway,
     raidBosses,
+    users,
     settings,
     log,
     now,
@@ -307,3 +321,35 @@ export async function reportedRaid(
     made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
   return { ...made, party: outcome.party, postId, current, said };
 }
+
+/**
+ * A meetup made through the service, with its post on the fake gateway: "Community Day picnic",
+ * made in the channel of West by `REPORTER`, who is interested. It has no times.
+ */
+export async function createdMeetup(
+  request: Partial<MeetupRequest> = {},
+  overrides: Partial<PartyServiceOptions> = {},
+  kept?: Partial<Outliving>,
+) {
+  const made = await partyServiceWith([], overrides, kept);
+  const outcome = await made.service.createMeetup({
+    name: 'Community Day picnic',
+    creatorId: REPORTER,
+    regionChannelId: WEST_CHANNEL,
+    ...request,
+  });
+  if (outcome.kind !== 'created') throw new Error(`the meetup was not created: ${outcome.kind}`);
+  await made.service.flush();
+  const postId = outcome.party.forumPostId;
+  if (postId === null) throw new Error('the meetup has no post');
+  /** The meetup as it is stored now. */
+  const current = (): MeetupParty => {
+    const party = made.store.get(outcome.party.id);
+    if (party?.type !== 'meetup') throw new Error('the meetup is no longer active');
+    return party;
+  };
+  /** The texts of the messages in the post that were not deleted, oldest first. */
+  const said = (): string[] =>
+    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
+  return { ...made, party: outcome.party, postId, current, said };
+}
```

Run: `npx vitest run --project unit src/render/activity.test.ts src/services/access-service.test.ts src/services/party-scheduler.meetup.test.ts src/services/party-service.meetup.test.ts src/services/party-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -155,6 +155,7 @@ export async function startApp(
     lines,
     gateway: partyGateway,
     raidBosses,
+    users,
     settings: config.settings,
     log,
   });
```

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -517,7 +517,7 @@ export class DiscordPartyGateway implements PartyGateway {
       // The type is given, so discord.js does not look for the member in its cache.
       forum.permissionOverwrites.create(memberId, muted ? readOnly : ADMITTED, {
         type: OverwriteType.Member,
-        reason: 'Signed up for a raid in this forum',
+        reason: 'Signed up for a party in this forum',
       }),
     );
   }
@@ -540,7 +540,7 @@ export class DiscordPartyGateway implements PartyGateway {
     try {
       await forum.permissionOverwrites.delete(
         memberId,
-        'No longer signed up for a raid in this forum',
+        'No longer signed up for a party in this forum',
       );
     } catch (err) {
       const gone = hasCode(
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -4,12 +4,14 @@ import {
   groupOf,
   MAX_MEETUP_DESCRIPTION,
   MAX_PARTY_NAME,
+  partyWord,
   type Attendee,
   type Party,
   type PartyProblem,
 } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { groupWords } from './party-controls.js';
+import { timestamp } from './text.js';
 
 const STATUS_WORDS: Readonly<Record<Attendee['status'], string>> = {
   [PartyStatus.Interested]: 'interested',
@@ -19,6 +21,25 @@ const STATUS_WORDS: Readonly<Record<Attendee['status'], string>> = {
   [PartyStatus.Complete]: 'done',
 };
 
+/**
+ * What the post is told when its archiving is scheduled (and again while members go on writing
+ * in it). A raid is over by then, and so is a meetup whose end time has passed. A meetup without
+ * an end time has only been given its day: the post says that a time keeps it open, since any
+ * time that is set then calls the archiving off.
+ */
+export function archiveWarning(
+  party: Pick<Party, 'type' | 'endTime'>,
+  deletionTime: number,
+): string {
+  const word = partyWord(party);
+  const archive = `I will archive this post ${timestamp(deletionTime, 'R')}; it stays readable afterwards.`;
+  if (party.type === 'raid' || party.endTime !== null) return `This ${word} is over. ${archive}`;
+  return (
+    `This ${word} has no end time, so I take it to be over. ${archive} ` +
+    'A time set with `/meet` or `/end` keeps it open.'
+  );
+}
+
 export interface StandingOptions {
   /** Say "in person" for a member who is not remote: for the answer to switching it off. */
   sayInPerson?: boolean;
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -1,9 +1,11 @@
 import type { Settings } from '../config/settings.js';
+import type { UserSettings } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
-import { isRaid, type Party } from '../domain/party/party.js';
+import { isRaid, isTimed, type Party } from '../domain/party/party.js';
 import { partyTick, tickAutoset, type TickEffect, type TickInput } from '../domain/party/tick.js';
 import type { Logger } from '../log.js';
-import { fitItems, plain, timestamp } from '../render/text.js';
+import { archiveWarning } from '../render/activity.js';
+import { fitItems, plain, withMentions } from '../render/text.js';
 import type { AttendanceService } from './attendance-service.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyService } from './party-service.js';
@@ -25,6 +27,8 @@ export interface PartySchedulerOptions {
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
+  /** The members' settings: whether the maker of a meetup lets the bot ping them. */
+  users?: { get(snowflake: string): Promise<UserSettings> };
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -38,7 +42,8 @@ export interface PartySchedulerOptions {
  * The clock of the parties (spec 5.3). Every `cleanupInterval` it runs `partyTick` for each
  * active party inside the store and does what the tick asks for: shows the post anew, says that
  * an egg has hatched, asks a group after its meeting time, counts silence as done, warns that
- * the post will be archived, and ends the party.
+ * the post will be archived, and ends the party. A meetup asks only for the first and the last
+ * two of these.
  *
  * A tick compares the time with what each party records, so the first tick after a start
  * applies everything that was missed while the bot was down. The party is stored before
@@ -276,20 +281,37 @@ export class PartyScheduler {
     }
   }
 
+  /**
+   * Whom the first warning of a party pings: the member who made a timed party that has no end
+   * time, when they allow mentions. Nothing else tells them that their meetup is about to go
+   * (a raid is over by its times, which everybody saw). Nobody when the warning is said again.
+   */
+  private async warned(party: Party): Promise<string[]> {
+    const { users } = this.options;
+    if (!users || !isTimed(party) || party.endTime !== null) return [];
+    if (party.prompts.warning !== null) return [];
+    const settings = await users.get(party.createdById).catch(() => undefined);
+    return settings?.mentions === true ? [party.createdById] : [];
+  }
+
   /**
    * Says in the post when it will be archived, and remembers the message to remove it again. An
    * earlier warning that is still remembered is deleted: a post has one warning, the newest.
    */
   private async warn(partyId: string): Promise<void> {
     const { store, gateway } = this.options;
+    const before = store.get(partyId);
+    if (!before) return;
+    const pinged = await this.warned(before);
+    // Read again: the party may have changed, or ended, while the settings were read.
     const party = store.get(partyId);
     const postId = party?.forumPostId ?? null;
     if (!party || postId === null || party.deletionTime === null) return;
-    const messageId = await gateway.sendMessage(postId, {
-      content:
-        `This raid is over. I will archive this post ${timestamp(party.deletionTime, 'R')}; ` +
-        'it stays readable afterwards.',
-    });
+    const text = archiveWarning(party, party.deletionTime);
+    const messageId = await gateway.sendMessage(
+      postId,
+      pinged.length === 0 ? { content: text } : withMentions(text, pinged),
+    );
     if (messageId === undefined) return;
     const replaced: { id?: string } = {};
     let recorded = false;
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -11,10 +11,13 @@ import {
   type TagIds,
 } from '../discord/party-gateway.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
+import { createMeetup } from '../domain/party/meetup.js';
 import {
   asKindOf,
   isRaid,
   membersWhere,
+  partyWord,
+  type MeetupParty,
   type Party,
   type RaidBossRef,
   type RaidParty,
@@ -27,7 +30,8 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
-import { FORUM_TAGS, tidyTitle, type RenderedPost } from '../render/party-post.js';
+import { meetupTitle, renderMeetupPost, type MeetupPostView } from '../render/meetup-post.js';
+import { FORUM_TAGS, tidyTitle, type PostEmoji, type RenderedPost } from '../render/party-post.js';
 import {
   raidTitle,
   renderRaidPost,
@@ -47,6 +51,8 @@ import type { RaidEventProvider } from './raid-event-service.js';
 import type { RegionProvider } from './region-directory.js';
 
 const MINUTE = 60_000;
+/** Logged when a party that cannot be shown cannot be ended either. */
+const NO_POST = 'could not end a party without a post';
 /** Discord lets a thread be renamed twice in ten minutes. */
 const RENAMES = 2;
 const RENAME_WINDOW_MS = 10 * MINUTE;
@@ -90,6 +96,28 @@ export type ReportOutcome =
   /** The gym's region has no forum yet (`/admin setup-forums`). */
   | { kind: 'no-forum'; region: Region };
 
+/** A meetup that a member makes with `/meetup`. */
+export interface MeetupRequest {
+  /** As the member typed it. */
+  name: string;
+  /** Snowflake of the member who makes it. */
+  creatorId: string;
+  /** Their name and team, as the interaction said them: they are signed up as interested. */
+  creator?: MemberInfo;
+  /** The region channel it is made in: the post goes into the forum of that region. */
+  regionChannelId: string;
+}
+
+export type MeetupOutcome =
+  /** A new meetup with its post. */
+  | { kind: 'created'; party: MeetupParty }
+  /** The text is no name (`tidyName`). */
+  | { kind: 'bad-name' }
+  /** The channel is not the channel of a region of a server. */
+  | { kind: 'no-region' }
+  /** The region has no forum yet (`/admin setup-forums`). */
+  | { kind: 'no-forum'; region: Region };
+
 /** What came of moving a raid to a gym of another region. */
 export type RelocateOutcome =
   /** There is no such active raid. */
@@ -151,9 +179,9 @@ export interface PartyServiceOptions {
 }
 
 /**
- * Parties on Discord: creates the forum post of a reported raid, keeps posts and the pinned
- * summary of each forum up to date, and tidies up what went wrong half-way. The parties
- * themselves are in the store; this service is what talks to Discord about them.
+ * Parties on Discord: creates the forum post of a reported raid or a new meetup, keeps posts
+ * and the pinned summary of each forum up to date, and tidies up what went wrong half-way. The
+ * parties themselves are in the store; this service is what talks to Discord about them.
  */
 export class PartyService {
   private readonly now: () => number;
@@ -167,7 +195,7 @@ export class PartyService {
   private readonly renameTimers = new Map<string, { cancel: () => void; due: number }>();
   /** For summaries that wait for a rate limit: the same, by region. */
   private readonly summaryTimers = new Map<number, { cancel: () => void; due: number }>();
-  /** Raids whose post is being created: a second report of the gym waits for the outcome. */
+  /** Parties whose post is being created: a second report of a raid's gym waits for the outcome. */
   private readonly creating = new Map<string, Promise<void>>();
   /** A raid moves to another region once at a time. */
   private readonly moves = new KeyedLock<string>();
@@ -238,17 +266,32 @@ export class PartyService {
     return raidDurationRules(this.options.settings, this.options.raidEvents.events());
   }
 
+  /** The emoji of the server a party's post is in, or plain characters where it has none. */
+  private emoji(party: Party): PostEmoji {
+    const { gateway, settings } = this.options;
+    const where = party.forumChannelId;
+    const emoji = (name: string, fallback: string): string =>
+      (where === null ? undefined : gateway.emoji(where, name)) ?? fallback;
+    return {
+      shiny: emoji(settings.emoji.shiny, '✨'),
+      remote: emoji(settings.emoji.remote, '🛰️'),
+      // The server's own emoji of that name, as the legacy bot used them.
+      teams: {
+        instinct: emoji('instinct', '⚡'),
+        mystic: emoji('mystic', '❄️'),
+        valor: emoji('valor', '🔥'),
+      },
+    };
+  }
+
   /** Everything the renderer needs to show a raid as it is now. */
   view(party: RaidParty): RaidPostView {
-    const { gateway, gyms, raidBosses, gameData, settings } = this.options;
+    const { gyms, raidBosses, gameData, settings } = this.options;
     const catalogue = gameData.catalogue;
     const boss = shownBoss(party, catalogue, raidBosses.bosses());
     const hatchesAs = boss
       ? undefined
       : shownAutoset(party.raid.tier, raidBosses.autoset(party.raid.tier));
-    const where = party.forumChannelId;
-    const emoji = (name: string, fallback: string): string =>
-      (where === null ? undefined : gateway.emoji(where, name)) ?? fallback;
     return {
       party,
       now: this.now(),
@@ -258,27 +301,29 @@ export class PartyService {
       catalogue,
       showUnknownMoves: settings.showUnknownMoves,
       zone: settings.timezone,
-      emoji: {
-        shiny: emoji(settings.emoji.shiny, '✨'),
-        remote: emoji(settings.emoji.remote, '🛰️'),
-        // The server's own emoji of that name, as the legacy bot used them.
-        teams: {
-          instinct: emoji('instinct', '⚡'),
-          mystic: emoji('mystic', '❄️'),
-          valor: emoji('valor', '🔥'),
-        },
-      },
+      emoji: this.emoji(party),
+    };
+  }
+
+  /** Everything the renderer needs to show a meetup as it is now. */
+  meetupView(party: MeetupParty): MeetupPostView {
+    return {
+      party,
+      now: this.now(),
+      zone: this.options.settings.timezone,
+      emoji: this.emoji(party),
     };
   }
 
   /**
-   * What the post of a party shows now. `closed` is the sentence of its last showing when
-   * somebody closed it (see `RaidPostView.closed`).
+   * What the post of a party shows now, by the renderer of its kind. `closed` is the sentence
+   * of its last showing when somebody closed it (see `RaidPostView.closed`).
    */
   private rendered(party: Party, closed?: string): RenderedPost {
-    // Only raids have a post so far: nothing makes another kind of party yet.
-    if (!isRaid(party)) throw new Error(`Party ${party.id} is a ${party.type}: it has no post`);
-    return renderRaidPost({ ...this.view(party), ...(closed === undefined ? {} : { closed }) });
+    const last = closed === undefined ? {} : { closed };
+    return isRaid(party)
+      ? renderRaidPost({ ...this.view(party), ...last })
+      : renderMeetupPost({ ...this.meetupView(party), ...last });
   }
 
   /**
@@ -437,15 +482,47 @@ export class PartyService {
     return this.createTracked(raid, region, rendered);
   }
 
+  /**
+   * Makes a meetup with its post in the forum of the region it is made in (`/meetup`). Meetups
+   * are not kept apart by anything: two with one name are two meetups. Like a raid, a meetup is
+   * never left active without a post, nor a post without its meetup.
+   */
+  async createMeetup(request: MeetupRequest): Promise<MeetupOutcome> {
+    const { store, regions, log } = this.options;
+    const region = regions.byChannel(request.regionChannelId);
+    if (!region) return { kind: 'no-region' };
+    if (region.guildId === null) {
+      log.warn({ region: region.id }, 'a meetup was made in a region that belongs to no server');
+      return { kind: 'no-region' };
+    }
+    const forumId = region.forumChannelId;
+    if (forumId === null) return { kind: 'no-forum', region };
+    const made = createMeetup({
+      id: crypto.randomUUID(),
+      guildId: region.guildId,
+      regionId: region.id,
+      createdById: request.creatorId,
+      name: request.name,
+      now: this.now(),
+    });
+    if (!made.ok) return { kind: 'bad-name' };
+    const meetup = noteMember(made.party, request.creatorId, request.creator ?? {});
+    // The view does not depend on the stored row, so a renderer that fails stores nothing.
+    const rendered = this.rendered({ ...meetup, forumChannelId: forumId });
+    await store.add(meetup);
+    // The row exists; from here on a failure must not leave an active meetup without a post.
+    return this.createTracked(meetup, region, rendered);
+  }
+
   /** `createPostFor`, remembered while it runs: a report of the same gym waits for it. */
-  private async createTracked(
-    raid: RaidParty,
+  private async createTracked<P extends Party>(
+    party: P,
     region: Region,
     rendered: RenderedPost,
-  ): Promise<ReportOutcome> {
-    const creation = this.createPostFor(raid, region, rendered);
+  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region }> {
+    const creation = this.createPostFor(party, region, rendered);
     this.creating.set(
-      raid.id,
+      party.id,
       creation.then(
         () => undefined,
         () => undefined,
@@ -454,7 +531,7 @@ export class PartyService {
     try {
       return await creation;
     } finally {
-      this.creating.delete(raid.id);
+      this.creating.delete(party.id);
     }
   }
 
@@ -628,45 +705,49 @@ export class PartyService {
     return ids.filter((_id, index) => settings[index]?.mentions === true);
   }
 
-  /** Makes the post of a stored raid and records it; undoes the raid when that cannot be done. */
-  private async createPostFor(
-    raid: RaidParty,
+  /**
+   * Makes the post of a stored party and records it; undoes the party when that cannot be done.
+   * The link line in the region's channel says what kind of party is new.
+   */
+  private async createPostFor<P extends Party>(
+    fresh: P,
     region: Region,
     rendered: RenderedPost,
-  ): Promise<ReportOutcome> {
+  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region }> {
     const { store, gateway, log } = this.options;
     const forumId = region.forumChannelId ?? '';
+    const word = partyWord(fresh);
     let postId: string | undefined;
     let tagIds: string[];
     try {
       tagIds = PartyService.applied(rendered, await this.tagIds(forumId));
-      postId = await this.sendPost(raid.id, forumId, rendered, tagIds);
+      postId = await this.sendPost(fresh.id, forumId, rendered, tagIds);
     } catch (err) {
       this.dropTags(forumId);
-      await this.abandon(raid.id, 'could not end a raid without a post');
+      await this.abandon(fresh.id, NO_POST);
       throw err;
     }
     if (postId === undefined) {
       // The forum was deleted by hand: the region has none any more as far as reports go.
       this.dropTags(forumId);
-      await this.abandon(raid.id, 'could not end a raid without a post');
+      await this.abandon(fresh.id, NO_POST);
       return { kind: 'no-forum', region };
     }
     const post = postId;
     let posted;
     try {
-      posted = await store.update(raid.id, (party) => ({
+      posted = await store.update(fresh.id, (party) => ({
         party: { ...party, forumChannelId: forumId, forumPostId: post },
       }));
     } catch (err) {
-      await this.discard(raid.id, post);
+      await this.discard(fresh.id, post);
       throw err;
     }
     if (!posted) {
-      await this.discard(raid.id, post);
-      throw new Error('The raid ended while its post was being created');
+      await this.discard(fresh.id, post);
+      throw new Error(`The ${word} ended while its post was being created`);
     }
-    let party = posted.party as RaidParty;
+    let party = asKindOf(fresh, posted.party);
     // What was just sent is what the render requested below would send: it sends nothing.
     this.sent.set(post, {
       key: PartyService.sentKey(rendered, tagIds),
@@ -675,19 +756,19 @@ export class PartyService {
 
     try {
       const linkId = await gateway.sendMessage(region.channelId, {
-        content: renderRegionLink(post),
+        content: renderRegionLink(post, fresh.type),
       });
       if (linkId !== undefined) {
-        const linked = await store.update(raid.id, (current) => ({
+        const linked = await store.update(fresh.id, (current) => ({
           party: { ...current, regionLinkMessageId: linkId },
         }));
-        party = (linked?.party as RaidParty | undefined) ?? party;
+        if (linked?.party) party = asKindOf(fresh, linked.party);
       }
     } catch (err) {
-      log.warn({ err, party: raid.id }, 'could not post the link to a new raid');
+      log.warn({ err, party: fresh.id }, `could not post the link to a new ${word}`);
     }
     // Whoever signed up while the post was being made is shown by this render.
-    this.posts.request(raid.id);
+    this.posts.request(fresh.id);
     this.summaries.request(region.id);
     return { kind: 'created', party };
   }
@@ -718,19 +799,19 @@ export class PartyService {
     }
   }
 
-  /** Deletes a post that no stored raid has, and ends the raid. */
+  /** Deletes a post that no stored party has, and ends the party. */
   private async discard(partyId: string, postId: string): Promise<void> {
     try {
       await this.options.gateway.deletePost(postId);
     } catch (err) {
       this.options.log.error({ err, party: partyId, post: postId }, 'could not delete a lost post');
     }
-    await this.abandon(partyId, 'could not end a raid without a post');
+    await this.abandon(partyId, NO_POST);
   }
 
   /**
-   * Ends a raid that cannot be shown, so that it does not block its gym. Gives the party as it
-   * was when it ended; undefined when it could not be ended (it stays active) or was not active.
+   * Ends a party that cannot be shown, so that a raid does not block its gym. Gives the party as
+   * it was when it ended; undefined when it could not be ended (it stays active) or was not active.
    */
   private async abandon(partyId: string, failure: string): Promise<Party | undefined> {
     const { store, log } = this.options;
@@ -760,10 +841,12 @@ export class PartyService {
    */
   async endPartiesWithoutPost(): Promise<number> {
     const orphans = this.options.store.active().filter((party) => party.forumPostId === null);
-    for (const party of orphans)
-      await this.abandon(party.id, 'could not end a raid without a post');
+    for (const party of orphans) await this.abandon(party.id, NO_POST);
     if (orphans.length > 0) {
-      this.options.log.warn({ parties: orphans.map((p) => p.id) }, 'ended raids that had no post');
+      this.options.log.warn(
+        { parties: orphans.map((p) => p.id) },
+        'ended parties that had no post',
+      );
     }
     return orphans.length;
   }
@@ -927,13 +1010,16 @@ export class PartyService {
     roleIds: readonly string[],
   ): Promise<'gone' | 'already' | 'asked'> {
     // The party may have ended while this request waited for the earlier ones.
-    const postId = this.options.store.get(partyId)?.forumPostId;
-    if (!postId) return 'gone';
+    const party = this.options.store.get(partyId);
+    const postId = party?.forumPostId;
+    if (!party || !postId) return 'gone';
     if (state.asked.has(memberId)) return 'already';
     const roles = state.pinged ? [] : roleIds.slice(0, MAX_ROLE_PINGS);
     const whom = roles.length === 0 ? '' : `${roles.map((id) => `<@&${id}>`).join(' ')}: `;
     const sent = await this.options.gateway.sendMessage(postId, {
-      content: `${whom}<@${memberId}> asks for this raid to be deleted.\n> ${plain(reason)}`,
+      content:
+        `${whom}<@${memberId}> asks for this ${partyWord(party)} to be deleted.\n` +
+        `> ${plain(reason)}`,
       mention: { roles },
     });
     if (sent === undefined) return 'gone';
@@ -996,7 +1082,8 @@ export class PartyService {
       );
     }
     let there = true;
-    // A raid that was closed says so in the post itself, in the place of its times.
+    // A party that was closed says so in the post itself, in the place of its times; a meetup
+    // that ended is shown as over, whatever times it had (see `renderMeetupPost`).
     const rendered = this.rendered(party, lastWords);
     await attempt('show an ended party one last time', async () => {
       const last = { ...rendered, message: { ...rendered.message, components: [] } };
@@ -1007,9 +1094,11 @@ export class PartyService {
       return;
     }
     const forumId = party.forumChannelId;
-    if (lastWords !== undefined && forumId !== null) {
-      // The clock sets the Ended tag when a raid ends by itself; a closed raid gets it here.
-      await attempt('tag a closed party as ended', async () =>
+    if (forumId !== null && (lastWords !== undefined || !isRaid(party))) {
+      // The tags of the last showing. A raid that ran out has had `Ended` since its end time,
+      // which the clock showed; a party that was closed has not, nor has a meetup whose day ran
+      // out without an end time: any other party than a raid gets its tags at every end.
+      await attempt('tag an ended party as ended', async () =>
         gateway.setPostTags(postId, PartyService.applied(rendered, await this.tagIds(forumId))),
       );
     }
@@ -1156,7 +1245,7 @@ export class PartyService {
   private async postGone(party: Party, postId: string): Promise<void> {
     const { gateway, log } = this.options;
     log.warn({ party: party.id, post: postId }, 'a party post is gone; ending the party');
-    const ended = await this.abandon(party.id, 'could not end a raid whose post is gone');
+    const ended = await this.abandon(party.id, 'could not end a party whose post is gone');
     this.ended(party);
     // Only of a party that has really ended: one that stays active keeps its copies.
     if (ended) {
@@ -1312,14 +1401,20 @@ export class PartyService {
     else this.sent.delete(postId);
   }
 
-  /** The list of a region's raids, as its summary post shows it (also for `/status`). */
+  /**
+   * The list of a region's raids, and under them its meetups, as its summary post shows it
+   * (also for `/status`).
+   */
   summaryText(regionId: number): string {
     const now = this.now();
-    const raids = this.options.store
-      .inRegion(regionId)
+    const parties = this.options.store.inRegion(regionId);
+    const raids = parties
       .filter(isRaid)
       .map((party) => ({ party, title: raidTitle(this.view(party)) }));
-    return renderSummary(raids, now);
+    const meetups = parties
+      .filter((party): party is MeetupParty => party.type === 'meetup')
+      .map((party) => ({ party, title: meetupTitle(party) }));
+    return renderSummary(raids, now, meetups);
   }
 
   private async renderSummary(regionId: number): Promise<void> {
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/render/activity.test.ts src/services/access-service.test.ts src/services/party-scheduler.meetup.test.ts src/services/party-service.meetup.test.ts src/services/party-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 9976fe5 -- src test   # must print nothing
npx prettier --check src/app.ts src/discord/party-gateway.ts src/render/activity.test.ts src/render/activity.ts src/services/access-service.test.ts src/services/party-scheduler.meetup.test.ts src/services/party-scheduler.ts src/services/party-service.meetup.test.ts src/services/party-service.test.ts src/services/party-service.ts test/support/parties.ts test/support/party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app.ts src/discord/party-gateway.ts src/render/activity.test.ts src/render/activity.ts src/services/access-service.test.ts src/services/party-scheduler.meetup.test.ts src/services/party-scheduler.ts src/services/party-service.meetup.test.ts src/services/party-service.test.ts src/services/party-service.ts test/support/parties.ts test/support/party-service.ts
git commit -m "PartyService and the scheduler for both kinds: a meetup gets its post, its place in the summary and its end" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,170 unit tests.

---

### Task 7: The existing commands and controls in a meetup

**Files:**
- Create: `src/commands/parties/in-meetup.test.ts`, `src/commands/parties/timed.ts`, `src/services/timed-party-service.test.ts`, `src/services/timed-party-service.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/admin/save-party.test.ts`, `src/commands/admin/save-party.ts`, `src/commands/index.ts`, `src/commands/parties/attendance.test.ts`, `src/commands/parties/attendance.ts`, `src/commands/parties/delete.test.ts`, `src/commands/parties/delete.ts`, `src/commands/parties/group.ts`, `src/commands/parties/meet.ts`, `src/commands/parties/reply.ts`, `src/commands/parties/shout.test.ts`, `src/commands/parties/shout.ts`, `src/commands/parties/status.test.ts`, `src/commands/parties/status.ts`, `src/commands/raids/boss.ts`, `src/commands/raids/change.ts`, `src/commands/raids/location.ts`, `src/commands/raids/raid-input.ts`, `src/components/party.test.ts`, `src/components/party.ts`, `src/discord/command.ts`, `src/discord/guards.test.ts`, `src/discord/guards.ts`, `src/discord/router.test.ts`, `src/discord/router.ts`, `src/render/activity.test.ts`, `src/render/activity.ts`, `src/render/party-controls.ts`, `src/services/attendance-service.ts`, `src/services/party-lifecycle.db.test.ts`, `test/support/party-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: `timed.ts`, `typedPartyTime`, the commands of `src/commands/parties/` and `src/commands/raids/`, `src/components/party.ts`, the router (`src/discord/router.ts`, `command.ts`), `AppContext`.
- Produces: `TimedPartyService` (`ctx.timedParties`: `setStartTime`, `setEndTime`, `flush`; `TimedChangeOutcome`), with the gathered start announcement; `src/commands/parties/timed.ts` (`typedTimedTime`, `changeStart`, `changeEnd`, `answerTimedChange`, `START_THROTTLE`, `TIMED_TIME_HINT`); `/meet`, `/cancel-meet` and `/end` in a meetup; a command's `throttle` as a function of the interaction; `partyOver(party?)`, `leftWords`, `doneWords`, `typedGroup(ctx, party, text)` in `reply.ts`; `IN_A_PARTY_POST`; `deleteParty`; `in-meetup.test.ts`, which runs every command and control in a meetup post.

Slash command descriptions change with this task, so `npm run deploy-commands` is needed before staging (the controller's business, with Matt). Shutdown gets the step "start times" before "party lines".

Reference commit of the prototype for this task: `ee6f26b`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/admin/save-party.test.ts`:

```diff
--- a/src/commands/admin/save-party.test.ts
+++ b/src/commands/admin/save-party.test.ts
@@ -130,7 +130,7 @@ describe('/admin save-party', () => {
       { channelId: WEST_CHANNEL, thread: undefined },
     );
     expect(elsewhere.followUp).toHaveBeenCalledWith({
-      content: 'Use this in the post of a raid that is still active.',
+      content: 'Use this in the post of a raid or meetup that is still active.',
       flags: MessageFlags.Ephemeral,
     });
     expect(made.current().saved).toBe(false);
@@ -142,7 +142,7 @@ describe('/admin save-party', () => {
     const here = { guildChannelNames: { [WEST_FORUM]: 'west-raids' } };
     const none = await made.run({}, { ...outside, ...here });
     expect(sent(none.editReply).content).toBe(
-      'No post is kept. Use this in the post of a raid to keep it.',
+      'No post is kept. Use this in the post of a raid or meetup to keep it.',
     );
     await made.run();
     const listed = await made.run({}, { ...outside, ...here });
```

Apply to `src/commands/parties/attendance.test.ts`:

```diff
--- a/src/commands/parties/attendance.test.ts
+++ b/src/commands/parties/attendance.test.ts
@@ -199,11 +199,13 @@ describe('the attendance commands', () => {
     for (const command of all) {
       const extra = command === group ? { ...elsewhere, subcommand: 'new' } : elsewhere;
       expect(await made.answer(command.data.name, {}, extra)).toBe(
-        'Use this in the post of a raid that is still active.',
+        'Use this in the post of a raid or meetup that is still active.',
       );
     }
     await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
-    expect(await made.answer('join')).toBe('Use this in the post of a raid that is still active.');
+    expect(await made.answer('join')).toBe(
+      'Use this in the post of a raid or meetup that is still active.',
+    );
   });
 
   it('holds back a member who uses one command more than thirty times a minute', async () => {
```

Apply to `src/commands/parties/delete.test.ts`:

```diff
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -21,7 +21,7 @@ import {
   deletionForm,
   MAX_DELETE_REASON,
 } from '../../render/party-controls.js';
-import { deleteRaid } from './delete.js';
+import { deleteParty } from './delete.js';
 
 const yveltal = { boss: { key: 'yveltal' } } as const;
 const ADMIN_ROLE = '800000000000000001';
@@ -42,7 +42,7 @@ async function setup() {
     parties: made.store,
     regions: made.regions,
   });
-  const router = new InteractionRouter(ctx, [deleteRaid], [partyButtons]);
+  const router = new InteractionRouter(ctx, [deleteParty], [partyButtons]);
   const handle = async (interaction: FakeInteraction) => {
     await router.handle(interaction as never);
     return interaction;
```

Create `src/commands/parties/in-meetup.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  REPORTER,
} from '../../../test/support/parties.js';
import { createdMeetup } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { DELETE_REASON_INPUT, deletionForm } from '../../render/party-controls.js';
import { admin } from '../admin/index.js';
import { end } from '../raids/change.js';
import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
import { deleteParty } from './delete.js';
import { group } from './group.js';
import { cancelMeet, meet } from './meet.js';
import { shout } from './shout.js';
import { status, where } from './status.js';

const all: CommandModule[] = [
  join,
  maybe,
  here,
  notHere,
  done,
  leave,
  remote,
  local,
  group,
  meet,
  cancelMeet,
  end,
  status,
  where,
  shout,
  deleteParty,
  admin,
];
const HOUR = 60 * MINUTE;
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const ADMIN_ROLE = '800000000000000001';

beforeEach(() => {
  // The handlers read the clock themselves; the fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A meetup with its post, and every command and control that works in the post of a party. */
async function setup() {
  const made = await createdMeetup();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, [partyButtons]);
  /** Everything a member was told in this test, to look for words that do not belong. */
  const told: string[] = [];
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    for (const responder of [interaction.reply, interaction.editReply, interaction.followUp]) {
      for (const [payload] of responder.mock.calls) {
        const content = (payload as { content?: string } | undefined)?.content;
        if (content !== undefined) told.push(content);
      }
    }
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the post of the meetup, by Alice unless `extra` says otherwise. */
  const run = (
    commandName: string,
    options: Record<string, string | number | boolean> = {},
    extra: object = {},
  ) =>
    handle(
      fakeChatInput({
        commandName,
        ...where,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  /** What the member is told: the reply, or the edit of a command that takes its time. */
  const answer = async (
    commandName: string,
    options?: Record<string, string | number | boolean>,
    extra?: object,
  ): Promise<string | undefined> => {
    const used = await run(commandName, options, extra);
    // A refusal of a command that had been deferred comes as a follow-up.
    for (const responder of [used.reply, used.editReply, used.followUp]) {
      if (responder.mock.calls.length > 0) return sent(responder).content;
    }
    return undefined;
  };
  const click = (action: string, extra: object = {}) =>
    handle(
      fakeButton({
        customId: `party:${made.party.id}:${action}`,
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
        ...extra,
      }),
    );
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.timed.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const alice = () => attendeeOf(made.current(), ALICE);
  return { ...made, ctx, handle, run, answer, click, lines, alice, where, told };
}

describe('the attendance commands in the post of a meetup', () => {
  it('sign a member up and take them off again, in the words of a meetup', async () => {
    const made = await setup();
    expect(await made.answer('maybe')).toBe('You are interested.');
    expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
    expect(await made.answer('here')).toBe('You are here with 2 more.');
    expect(await made.answer('not-here')).toBe('You are interested with 2 more.');
    expect(await made.answer('remote')).toBe('You are interested with 2 more, remotely.');
    expect(await made.answer('local')).toBe('You are interested with 2 more, in person.');
    expect(made.alice()).toMatchObject({ status: PartyStatus.Interested, number: 3, group: 'A' });
    expect(await made.answer('leave')).toBe('You have left this meetup.');
    expect(made.alice()).toBeUndefined();
    expect(await made.answer('leave')).toBe('You are not signed up for this meetup.');
    expect(await made.answer('not-here')).toBe('You are not signed up for this meetup.');
  });

  it('/done means leave: the member is taken off, and nobody is asked anything', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Present);
    await made.run('here');
    expect(await made.answer('done')).toBe('You have left this meetup.');
    expect(made.alice()).toBeUndefined();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(made.current().prompts.completion).toEqual([]);
    expect(await made.lines()).toEqual([
      `<@${BOB}> is here.`,
      // The line of a member's standing is replaced by the newest: here, then gone.
      `<@${ALICE}> has left.`,
    ]);
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.components ?? []).toEqual([]);
    }
    expect(await made.answer('done')).toBe('You are not signed up for this meetup.');
  });

  it('take a head count but no group other than the one a meetup has', async () => {
    const made = await setup();
    expect(await made.answer('join', { group: 'A', count: 2 })).toBe('You are coming with 1 more.');
    expect(await made.answer('join', { group: 'B' })).toBe('This meetup has no such group.');
    expect(await made.answer('join', { group: 'the park' })).toBe('This meetup has no such group.');
    // The list of groups offers nothing: there is nothing to choose.
    const typing = await made.handle(
      fakeAutocomplete({ commandName: 'join', ...made.where, focused: '', focusedName: 'group' }),
    );
    expect(typing.respond).toHaveBeenCalledWith([]);
  });

  it('refuse every part of /group: a meetup has no groups', async () => {
    const made = await setup();
    await made.run('join');
    const before = made.current();
    for (const [subcommand, options] of [
      ['join', { letter: 'A' }],
      ['join', { letter: 'B' }],
      ['new', {}],
      ['label', { text: 'park side' }],
    ] as const) {
      expect(await made.answer('group', options, { subcommand })).toBe('A meetup has no groups.');
    }
    expect(made.current()).toBe(before);
  });
});

describe('the buttons of a meetup post', () => {
  it('sign up, count and leave like those of a raid', async () => {
    const made = await setup();
    expect(sent((await made.click('join')).reply).content).toBe('You are coming.');
    expect(sent((await made.click('more')).reply).content).toBe('You are coming with 1 more.');
    expect(sent((await made.click('remote')).reply).content).toBe(
      'You are coming with 1 more, remotely.',
    );
    expect(sent((await made.click('here')).reply).content).toBe(
      'You are here with 1 more, remotely.',
    );
    expect(sent((await made.click('leave')).reply).content).toBe('You have left this meetup.');
    expect(sent((await made.click('less')).reply).content).toBe(
      'You are not signed up for this meetup.',
    );
  });

  it('take a Done that somebody still has on screen as leave, and a group button as refused', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('group:A')).reply).content).toBe('A meetup has no groups.');
    expect(sent((await made.click('done')).reply).content).toBe('You have left this meetup.');
    expect(made.alice()).toBeUndefined();
    expect(sent((await made.click('answer:yes')).reply).content).toBe(
      'You were not asked, or you have answered already.',
    );
  });
});

describe('/meet, /cancel-meet and /end in the post of a meetup', () => {
  it('/meet sets when the meetup starts, for everybody, and tells the others', async () => {
    const made = await setup();
    await made.run('join');
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      `This meetup starts at ${stamp(START)} (${stamp(START, 'R')}). I am telling the others.`,
    );
    expect(made.current().timed.startTime).toBe(START);
    expect(made.current().groups).toEqual([{ id: 'A' }]);
    expect(await made.lines()).toEqual([
      `<@${ALICE}> is coming.`,
      `<@${ALICE}> set the start of this meetup: ${stamp(START)} (${stamp(START, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
      users: [REPORTER],
    });
    expect(made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}.`,
    );
    expect(await made.answer('meet', { time: '16:00' })).toBe(
      `This meetup already starts at ${stamp(START)} (${stamp(START, 'R')}).`,
    );
  });

  it('tells the others once of a start that was corrected right away', async () => {
    const made = await setup();
    await made.run('join');
    await made.run('meet', { time: '4pm' });
    await made.run('meet', { time: '5pm' });
    const five = at('2026-10-13T17:00');
    expect(await made.lines()).toEqual([
      `<@${ALICE}> is coming.`,
      `<@${ALICE}> set the start of this meetup: ${stamp(five)} (${stamp(five, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
  });

  it('/meet takes a date, minutes with "in", and reads a bare number as an hour', async () => {
    const made = await setup();
    await made.run('join');
    const friday = at('2026-10-16T18:30');
    expect(await made.answer('meet', { time: '10-16 6:30pm' })).toBe(
      `This meetup starts at ${stamp(friday, 'f')} (${stamp(friday, 'R')}). I am telling the others.`,
    );
    await made.run('meet', { time: 'in 45' });
    expect(made.current().timed.startTime).toBe(PARTY_NOW + 45 * MINUTE);
    await made.run('meet', { time: '20' });
    expect(made.current().timed.startTime).toBe(at('2026-10-13T20:00'));
  });

  it('/meet reads a time that has passed today as tomorrow, never as the past', async () => {
    const made = await setup();
    await made.run('join');
    // It is 14:00: nine o'clock this morning has passed, this evening has not.
    await made.run('meet', { time: '9' });
    expect(made.current().timed.startTime).toBe(at('2026-10-13T21:00'));
    await made.run('meet', { time: '1pm' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T13:00'));
  });

  it('reads times typed on a later day than the meetup was made, without "pm"', async () => {
    const made = await setup();
    await made.run('join');
    // The day after it was made, at 15:00.
    const tuesday = at('2026-10-14T15:00');
    vi.setSystemTime(tuesday);
    made.clock.now = tuesday;
    // Not 06:15 this morning, which lies after the meetup was made: 18:15 today.
    await made.run('meet', { time: '6:15' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T18:15'));
    // The end is after the start: "8" is 20:00, and "1" is one o'clock the next morning.
    await made.run('end', { time: '8' });
    expect(made.current().endTime).toBe(at('2026-10-14T20:00'));
    await made.run('end', { time: '1' });
    expect(made.current().endTime).toBe(at('2026-10-15T01:00'));
  });

  it('reads a new start today once the day of the old start has passed', async () => {
    const made = await setup();
    await made.run('join');
    await made.run('meet', { time: '6pm' });
    const next = at('2026-10-14T15:00');
    vi.setSystemTime(next);
    made.clock.now = next;
    // Yesterday 19:00 would be in the past, and would ping everybody for nothing.
    await made.run('meet', { time: '7pm' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T19:00'));
    expect(await made.answer('end', { time: '9pm' })).toBe(
      `This meetup ends at ${stamp(at('2026-10-14T21:00'))} (${stamp(at('2026-10-14T21:00'), 'R')}).`,
    );
  });

  it('/meet is for members who are signed up, as it was', async () => {
    const made = await setup();
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      'You are not signed up for this meetup.',
    );
    expect(await made.answer('cancel-meet')).toBe('You are not signed up for this meetup.');
    expect(made.current().timed.startTime).toBeNull();
  });

  it('explains a time it cannot read', async () => {
    const made = await setup();
    await made.run('join');
    const hint =
      'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';
    expect(await made.answer('meet', { time: 'soonish' })).toBe(
      `I could not read "soonish" as the time the meetup starts. ${hint}`,
    );
    expect(await made.answer('end', { time: 'whenever' })).toBe(
      `I could not read "whenever" as the time the meetup ends. ${hint}`,
    );
    expect(made.current().timed.startTime).toBeNull();
  });

  it('explains a time the meetup cannot have: with a date, by the range alone', async () => {
    const made = await setup();
    await made.run('join');
    const last = PARTY_NOW + 133_920 * MINUTE;
    expect(await made.answer('meet', { time: '10-12 6pm' })).toBe(
      '"10-12 6pm" cannot be the time the meetup starts: ' +
        `it must be between ${stamp(PARTY_NOW, 'f')} and ${stamp(last, 'f')}.`,
    );
  });

  it('says on which day it read a time without a date that fits on no day', async () => {
    const made = await setup();
    await made.run('join');
    // Ninety-three days on, to the minute the latest start: 15:00 is past it on any day.
    const late = PARTY_NOW + 133_920 * MINUTE;
    vi.setSystemTime(late);
    made.clock.now = late;
    const read = at('2027-01-14T15:00');
    expect(await made.answer('meet', { time: '3pm' })).toBe(
      `"3pm" cannot be the time the meetup starts: I read it as ${stamp(read, 'F')}, and ` +
        `it must be between ${stamp(late)} and ${stamp(late)}. ` +
        'For another day, give the date first, month-day: `1-14 3pm`.',
    );
  });

  it('/cancel-meet and "/meet cancel" remove the start, and the others are told that too', async () => {
    const made = await setup();
    await made.run('join');
    expect(await made.answer('cancel-meet')).toBe('This meetup had no start time.');
    await made.run('meet', { time: '4pm' });
    await made.timed.flush();
    expect(await made.answer('cancel-meet')).toBe(
      'This meetup has no start time any more. I am telling the others.',
    );
    expect(made.current().timed.startTime).toBeNull();
    expect((await made.lines()).at(-2)).toBe(`<@${ALICE}> removed the start time of this meetup.`);
    await made.run('meet', { time: '4pm' });
    expect(await made.answer('meet', { time: 'cancel' })).toBe(
      'This meetup has no start time any more. I am telling the others.',
    );
    // Set and removed again before anybody was told: there is nothing to tell.
    const said = made.said().length;
    await made.timed.flush();
    expect(made.said()).toHaveLength(said);
  });

  it('/end sets when the meetup ends, for anybody in the post, and "none" removes it', async () => {
    const made = await setup();
    // Alice is not signed up.
    expect(await made.answer('end', { time: '6pm' })).toBe(
      `This meetup ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    expect(made.current()).toMatchObject({ endTime: END, lastPossibleTime: END, hatchTime: null });
    expect(made.alice()).toBeUndefined();
    expect(await made.answer('end', { time: '18:00' })).toBe(
      `This meetup already ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    expect(await made.lines()).toEqual([
      `<@${ALICE}> set the end of this meetup: ${stamp(END)} (${stamp(END, 'R')}).`,
    ]);
    for (const word of ['none', 'cancel', 'unset']) {
      await made.run('end', { time: '6pm' });
      expect(await made.answer('end', { time: word })).toBe(
        'This meetup has no end time any more.',
      );
      expect(made.current().endTime).toBeNull();
    }
    expect(await made.answer('end', { time: 'none' })).toBe('This meetup had no end time.');
    expect(made.current().lastPossibleTime).toBe(PARTY_NOW + 24 * HOUR);
  });

  it('/end reads a time without a date on the day of the start, and names that day', async () => {
    const made = await setup();
    await made.run('join');
    await made.run('meet', { time: '10-16 6:30pm' });
    const end = at('2026-10-16T21:00');
    expect(await made.answer('end', { time: '9pm' })).toBe(
      `This meetup ends at ${stamp(end, 'f')} (${stamp(end, 'R')}).`,
    );
    expect((await made.lines()).at(-1)).toBe(
      `<@${ALICE}> set the end of this meetup: ${stamp(end, 'f')} (${stamp(end, 'R')}).`,
    );
  });

  it('refuses an end that is not after the start, and a start that is not before the end', async () => {
    const made = await setup();
    await made.run('join');
    await made.run('meet', { time: '4pm' });
    const last = at('2027-01-15T14:00');
    // An earlier hour of that day, said with its date, is before the start.
    expect(await made.answer('end', { time: '10-13 3:30pm' })).toBe(
      '"10-13 3:30pm" cannot be the time the meetup ends: ' +
        `it must be between ${stamp(START, 'f')} and ${stamp(last, 'f')}.`,
    );
    expect(await made.answer('end', { time: '10-13 4pm' })).toBe(
      'A meetup cannot end before it starts. Give a later end, or change the start first with `/meet`.',
    );
    // Without a date it is read on the day of the start, and not as the day after: that
    // would be nearly a day on, and is more likely a slip.
    expect(await made.answer('end', { time: '3:30pm' })).toBe(
      '"3:30pm" cannot be the time the meetup ends: ' +
        `I read it as ${stamp(at('2026-10-13T15:30'), 'F')}, and ` +
        `it must be between ${stamp(START, 'f')} and ${stamp(last, 'f')}. ` +
        'For another day, give the date first, month-day: `10-13 3:30pm`.',
    );
    expect(made.current().endTime).toBeNull();
    await made.run('end', { time: '6pm' });
    expect(await made.answer('meet', { time: '7pm' })).toBe(
      'A meetup cannot start after it ends. Give an earlier start, or change the end first with `/end`.',
    );
    expect(made.current()).toMatchObject({ endTime: END, timed: { startTime: START } });
  });

  it('gives an old meetup a day when its last time is removed', async () => {
    const made = await setup();
    await made.run('join');
    await made.run('meet', { time: '4pm' });
    await made.run('end', { time: '6pm' });
    const late = END + 3 * 24 * HOUR;
    vi.setSystemTime(late);
    made.clock.now = late;
    await made.run('end', { time: 'none' });
    await made.run('cancel-meet');
    expect(made.current()).toMatchObject({
      endTime: null,
      timed: { startTime: null },
      lastPossibleTime: late + 24 * HOUR,
      deletionTime: null,
    });
  });

  it('does not count a use of /meet or /cancel-meet that could not change anything', async () => {
    const made = await setup();
    // Not signed up, twice: refused before it is counted.
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      'You are not signed up for this meetup.',
    );
    expect(await made.answer('cancel-meet')).toBe('You are not signed up for this meetup.');
    await made.run('join');
    // A text that is no time, and a time the meetup cannot have.
    expect(await made.answer('meet', { time: 'soonish' })).toMatch(/^I could not read "soonish"/);
    expect(await made.answer('meet', { time: '10-12 6pm' })).toMatch(/cannot be the time/);
    // Three good ones still work; the fourth is the first that is held back.
    for (const time of ['4pm', '4:10pm', '4:20pm']) {
      expect(await made.answer('meet', { time })).toMatch(/^This meetup starts at/);
    }
    expect(await made.answer('meet', { time: '4:30pm' })).toBe(
      'You can use /meet again in 3 minutes.',
    );
    // `/cancel-meet` has its own three.
    expect(await made.answer('cancel-meet')).toMatch(/^This meetup has no start time any more/);
  });

  it('reads a start of 1 to 6 as the afternoon, also when it has passed today', async () => {
    const made = await setup();
    await made.run('join');
    // It is 14:00: one o'clock is tomorrow at 13:00, not in the night.
    await made.run('meet', { time: '1' });
    expect(made.current().timed.startTime).toBe(at('2026-10-14T13:00'));
    await made.run('meet', { time: '10-16 6' });
    expect(made.current().timed.startTime).toBe(at('2026-10-16T18:00'));
  });

  it('holds back a member who changes the start more than three times in three minutes', async () => {
    const made = await setup();
    await made.run('join');
    for (const time of ['4pm', '4:10pm', '4:20pm']) await made.run('meet', { time });
    expect(await made.answer('meet', { time: '4:30pm' })).toBe(
      'You can use /meet again in 3 minutes.',
    );
    expect(made.current().timed.startTime).toBe(at('2026-10-13T16:20'));
    // A minute on, when the limit of a raid's meeting time would be open again, it still holds.
    vi.setSystemTime(PARTY_NOW + 61_000);
    expect(await made.answer('meet', { time: '4:30pm' })).toBe(
      'You can use /meet again in 2 minutes.',
    );
  });
});

describe('the other commands in the post of a meetup', () => {
  it('/where says that a meetup is at no gym', async () => {
    const made = await setup();
    expect(await made.answer('where')).toBe('A meetup is at no gym, so there is no place to show.');
  });

  it('/shout tells everybody in the meetup, and says so when there is nobody else', async () => {
    const made = await setup();
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'You are not signed up for this meetup.',
    );
    await made.run('join');
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'Your message is in the post. I pinged 1 trainer.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@${ALICE}> to everybody in this meetup:\n> On my way\n<@${REPORTER}>`,
      mention: { users: [REPORTER] },
    });
    await made.attendance.leave(made.party.id, { id: REPORTER });
    expect(await made.answer('shout', { message: 'Anybody?' })).toBe(
      'Nobody else is signed up for this meetup, so I said nothing.',
    );
  });

  it('/status puts the meetup at the bottom of its post again', async () => {
    const made = await setup();
    expect(await made.answer('status')).toBe(
      'The meetup is at the bottom of the post again, with its buttons.',
    );
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(copy?.message.embeds?.[0]?.title).toBe('Community Day picnic');
    expect(copy?.message.components).toEqual(
      made.gateway.posts.get(made.postId)?.message.components,
    );
  });

  it('/status in the channel of the region lists the meetup under the raids', async () => {
    const made = await setup();
    expect(await made.answer('status', {}, { channelId: WEST_CHANNEL, thread: undefined })).toBe(
      'No raids right now. Report one with `/raid`.\n\n**Meetups**\n' +
        `<#${made.postId}> · no time set · 1 trainer`,
    );
  });

  it('/delete from staff closes the meetup: the post says who did it and is archived', async () => {
    const made = await setup();
    expect(await made.answer('delete', {}, { roleNames: ['Moderator'] })).toBe(
      'This meetup is closed: I am archiving and locking its post.',
    );
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.said().at(-1)).toBe(`This meetup was closed by <@${ALICE}>.`);
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true });
    expect(post?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(
      `This meetup was closed by <@${ALICE}>.`,
    );
    expect(await made.answer('join')).toBe(
      'Use this in the post of a raid or meetup that is still active.',
    );
  });

  it('/delete from anybody else asks why, and puts the request into the post as a meetup', async () => {
    const made = await setup();
    const used = await made.run('delete');
    expect(used.showModal).toHaveBeenCalledWith(deletionForm(made.party));
    const submit = (reason: string, userId = ALICE) =>
      made.handle(
        fakeModal({
          customId: deletionForm(made.party).custom_id,
          userId,
          fields: { [DELETE_REASON_INPUT]: reason },
          guildRoleNames: { [ADMIN_ROLE]: 'Admin' },
          ...made.where,
        }),
      );
    expect(sent((await submit('   ')).reply).content).toBe('Say why the meetup should be deleted.');
    expect(sent((await submit('Made twice')).editReply).content).toBe(
      'I have put your request into the post, for the moderators.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@&${ADMIN_ROLE}>: <@${ALICE}> asks for this meetup to be deleted.\n> Made twice`,
      mention: { roles: [ADMIN_ROLE] },
    });
    expect(sent((await submit('Again')).editReply).content).toBe(
      'You have already asked the moderators to delete this meetup.',
    );
    await made.service.end(made.party.id);
    expect(sent((await submit('Too late', CAROL)).reply).content).toBe(STALE_COMPONENT);
  });

  it('/admin save-party keeps the post of a meetup and lets it go again', async () => {
    const made = await setup();
    const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
    expect(await made.answer('admin', {}, staff)).toMatch(/^This post is kept/);
    expect(made.current().saved).toBe(true);
    expect(await made.answer('admin', { keep: false }, staff)).toBe(
      'This post is no longer kept: it is archived as usual once the meetup is over.',
    );
    expect(made.current().saved).toBe(false);
  });
});

describe('what a member of a meetup is told', () => {
  it('never calls the meetup a raid, whatever they try in its post', async () => {
    const made = await setup();
    const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
    const tries: [string, Record<string, string | number | boolean>?, object?][] = [
      ['leave'],
      ['done'],
      ['not-here'],
      ['meet', { time: '4pm' }],
      ['cancel-meet'],
      ['shout', { message: 'hello' }],
      ['join', { group: 'Z' }],
      ['join', { count: 99 }],
      ['join'],
      ['maybe'],
      ['here'],
      ['remote'],
      ['local'],
      ['group', {}, { subcommand: 'new' }],
      ['group', { letter: 'B' }, { subcommand: 'join' }],
      ['group', { text: 'x' }, { subcommand: 'label' }],
      ['meet', { time: 'gibberish' }],
      ['meet', { time: '1pm' }],
      ['meet', { time: '4pm' }],
      ['meet', { time: '4pm' }],
      ['end', { time: '3pm' }],
      ['end', { time: 'gibberish' }],
      ['end', { time: '6pm' }],
      ['end', { time: '6pm' }],
      ['meet', { time: '7pm' }],
      ['end', { time: 'none' }],
      ['end', { time: 'none' }],
      ['cancel-meet'],
      ['cancel-meet'],
      ['where'],
      ['shout', { message: 'hello' }],
      ['status'],
      ['admin', {}, staff],
      ['admin', {}, staff],
      ['admin', { keep: false }, staff],
      ['done'],
      ['delete', {}, { roleNames: ['Admin'] }],
    ];
    for (const [name, options, extra] of tries) await made.run(name, options, extra);
    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'leave']) {
      // The meetup is closed by now: a control that is still on screen says so, without a
      // kind, since nothing remembers what kind of party it was.
      await made.click(action);
    }
    expect(made.told.slice(-7)).toEqual(Array.from({ length: 7 }, () => 'This has ended.'));
    expect(made.told.length).toBeGreaterThanOrEqual(tries.length);
    // "raid or meetup" is said where the kind does not matter; a raid alone never.
    const wrong = made.told.filter((text) => /raid(?! or meetup)/i.test(text));
    expect(wrong).toEqual([]);
    await made.timed.flush();
    await made.attendance.flush();
    expect(made.said().filter((text) => /raid/i.test(text))).toEqual([]);
  });
});
```

Apply to `src/commands/parties/shout.test.ts`:

```diff
--- a/src/commands/parties/shout.test.ts
+++ b/src/commands/parties/shout.test.ts
@@ -145,7 +145,7 @@ describe('/shout', () => {
     });
     const elsewhere = await made.run('hello', { channelId: WEST_CHANNEL, thread: undefined });
     expect(sent(elsewhere.reply).content).toBe(
-      'Use this in the post of a raid that is still active.',
+      'Use this in the post of a raid or meetup that is still active.',
     );
     expect(made.gateway.messagesIn(made.postId)).toEqual([]);
   });
```

Apply to `src/commands/parties/status.test.ts`:

```diff
--- a/src/commands/parties/status.test.ts
+++ b/src/commands/parties/status.test.ts
@@ -84,7 +84,7 @@ describe('/status', () => {
     const made = await setup();
     const used = await made.run('status', { channelId: '600000000000000009' });
     expect(used.followUp).toHaveBeenCalledWith({
-      content: 'Use this in the channel of a region, or in the post of a raid.',
+      content: 'Use this in the channel of a region, or in the post of a raid or meetup.',
       flags: MessageFlags.Ephemeral,
     });
     // A region without an outline has no gyms and is not a place for raids.
```

Apply to `src/components/party.test.ts`:

```diff
--- a/src/components/party.test.ts
+++ b/src/components/party.test.ts
@@ -188,7 +188,13 @@ describe('the buttons of a party post', () => {
     const made = await setup();
     await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
     const click = await made.click('join');
-    expect(click.reply).toHaveBeenCalledWith(privately('This raid is over.'));
+    // The party has left the store, and a control names it by its id alone: what kind it was
+    // is no longer known, unless only a raid has such a control.
+    expect(click.reply).toHaveBeenCalledWith(privately('This has ended.'));
+    for (const action of ['done', 'group:A', 'answer:yes']) {
+      const raidOnly = await made.click(action);
+      expect(raidOnly.reply).toHaveBeenCalledWith(privately('This raid is over.'));
+    }
   });
 
   it('answers what it does not know as no longer active', async () => {
```

Apply to `src/discord/guards.test.ts`:

```diff
--- a/src/discord/guards.test.ts
+++ b/src/discord/guards.test.ts
@@ -213,7 +213,7 @@ describe('party posts', () => {
       requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), withRaid),
     ).not.toThrow();
     expect(() => requireParty(as(fakeChatInput({ channelId: WEST_CHANNEL })), withRaid)).toThrow(
-      'Use this in the post of a raid that is still active.',
+      'Use this in the post of a raid or meetup that is still active.',
     );
     expect(() => requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), ctx)).toThrow(
       UserError,
```

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -361,6 +361,71 @@ describe('InteractionRouter', () => {
     expect(execute).toHaveBeenCalledTimes(4);
   });
 
+  it('asks a command whose limit depends on where it is used, and counts each limit apart', async () => {
+    const { ctx } = createTestContext();
+    let now = 1_800_000_000_000;
+    const execute = ran();
+    const quick = { uses: 1, perSeconds: 60 };
+    const slow = { uses: 1, perSeconds: 180 };
+    const cmd = command({
+      throttle: (interaction) => (interaction.channelId === 'slow' ? slow : quick),
+      execute,
+    });
+    const router = new InteractionRouter(ctx, [cmd], [], { now: () => now });
+    const use = async (channelId: string) => {
+      const i = fakeChatInput({ channelId });
+      await router.handle(asInteraction(i));
+      return i;
+    };
+
+    await use('quick');
+    // The other limit has its own count.
+    await use('slow');
+    expect(execute).toHaveBeenCalledTimes(2);
+    expect(sent((await use('quick')).reply).content).toBe('You can use /test again in 1 minute.');
+    expect(sent((await use('slow')).reply).content).toBe('You can use /test again in 3 minutes.');
+    now += 61_000;
+    await use('quick');
+    expect(execute).toHaveBeenCalledTimes(3);
+    expect(sent((await use('slow')).reply).content).toBe('You can use /test again in 2 minutes.');
+  });
+
+  it('counts two limits of one length apart too', async () => {
+    const { ctx } = createTestContext();
+    const execute = ran();
+    const once = { uses: 1, perSeconds: 60 };
+    const twice = { uses: 2, perSeconds: 60 };
+    const cmd = command({
+      throttle: (interaction) => (interaction.channelId === 'once' ? once : twice),
+      execute,
+    });
+    const router = new InteractionRouter(ctx, [cmd], [], { now: () => 1_800_000_000_000 });
+    const use = async (channelId: string) => {
+      const i = fakeChatInput({ channelId });
+      await router.handle(asInteraction(i));
+      return i;
+    };
+    await use('once');
+    await use('twice');
+    // The use that was counted once has not used up one of the two.
+    await use('twice');
+    expect(execute).toHaveBeenCalledTimes(3);
+    expect(sent((await use('twice')).reply).content).toBe('You can use /test again in 1 minute.');
+    expect(sent((await use('once')).reply).content).toBe('You can use /test again in 1 minute.');
+  });
+
+  it('does not limit a use for which the command names no limit', async () => {
+    const { ctx } = createTestContext();
+    const execute = ran();
+    const router = new InteractionRouter(
+      ctx,
+      [command({ throttle: () => undefined, execute })],
+      [],
+    );
+    for (let n = 0; n < 5; n++) await router.handle(asInteraction(fakeChatInput()));
+    expect(execute).toHaveBeenCalledTimes(5);
+  });
+
   it('does not count a use that a guard refused, and throttles subcommands separately', async () => {
     const { ctx } = createTestContext();
     let allowed = false;
```

Apply to `src/render/activity.test.ts`:

```diff
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -83,10 +83,10 @@ describe('problemText', () => {
       'end-before-start',
       'start-after-end',
     ];
-    const texts = reasons.map((reason) => problemText(reason, { maxNumber: 21 }));
+    const texts = reasons.map((reason) => problemText(reason, { maxNumber: 21 }, 'raid'));
     for (const text of texts) expect(text).toMatch(/^[A-Z].*\.$/);
     expect(new Set(texts).size).toBe(reasons.length);
-    expect(problemText('bad-count', { maxNumber: 21 })).toContain('from 1 to 21');
+    expect(problemText('bad-count', { maxNumber: 21 }, 'raid')).toContain('from 1 to 21');
   });
 
   it('names the kind of party where any kind can give the reason', () => {
@@ -106,8 +106,8 @@ describe('problemText', () => {
     );
     expect(said('bad-name')).toBe('Give a name of 1 to 80 characters.');
     expect(said('description-too-long')).toBe('That is too long: keep it to 1000 characters.');
-    // Without a word it is a raid, as before.
-    expect(problemText('not-attending', { maxNumber: 21 })).toBe(
+    // For a raid it is the sentence it always was.
+    expect(problemText('not-attending', { maxNumber: 21 }, 'raid')).toBe(
       'You are not signed up for this raid.',
     );
   });
```

Apply to `src/services/party-lifecycle.db.test.ts`:

```diff
--- a/src/services/party-lifecycle.db.test.ts
+++ b/src/services/party-lifecycle.db.test.ts
@@ -2,7 +2,7 @@ import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../test/support/migrated-db.js';
 import { ALICE, asRaid, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
-import { EAST_FORUM, REMOTE_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { EAST_FORUM, REMOTE_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import {
   gatewayWithMirrorChannels,
   partyServiceWith,
@@ -233,4 +233,73 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     expect(await grants.list()).toEqual([]);
     expect(second.gateway.canSee(EAST_FORUM, ALICE)).toBe(false);
   });
+
+  it('keeps a meetup from /meetup to the archived post, over a restart', async () => {
+    const repository = new PartyRepository(db);
+    const first = await partyServiceWith([], {}, { database: repository });
+    const outcome = await first.service.createMeetup({
+      name: 'Community Day picnic 🧺',
+      creatorId: REPORTER,
+      creator: { name: 'Rhea', team: 'valor' },
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    const id = outcome.party.id;
+    const postId = outcome.party.forumPostId ?? '';
+    const start = at('2026-10-13T16:00');
+    const end = at('2026-10-13T18:00');
+    await first.attendance.signUp(id, alice, PartyStatus.Coming, { number: 2 });
+    await first.attendance.signUp(id, bob, PartyStatus.Present);
+    expect(await first.timed.setStartTime(id, alice, start)).toMatchObject({ kind: 'ok' });
+    expect(await first.timed.setEndTime(id, bob, end)).toMatchObject({ kind: 'ok' });
+    // Done means leave in a meetup.
+    expect(await first.attendance.done(id, bob)).toMatchObject({ kind: 'ok', left: true });
+    await first.timed.flush();
+    await first.attendance.flush();
+    await first.service.flush();
+
+    // What is in the table is what the services hold, and a meetup in every column.
+    const stored = await repository.findById(id);
+    expect(stored).toEqual({ ok: true, party: first.store.get(id) });
+    const row = await db
+      .selectFrom('Party')
+      .select(['type', 'gymId', 'hatchTime', 'endTime', 'lastPossibleTime', 'forumChannelId'])
+      .where('id', '=', id)
+      .executeTakeFirstOrThrow();
+    expect(row).toEqual({
+      type: 'meetup',
+      gymId: null,
+      hatchTime: null,
+      endTime: String(end),
+      lastPossibleTime: String(end),
+      forumChannelId: WEST_FORUM,
+    });
+
+    const second = await restarted(first);
+    const loaded = second.store.get(id);
+    expect(loaded).toEqual(first.store.get(id));
+    expect(loaded).toMatchObject({
+      type: 'meetup',
+      forumPostId: postId,
+      timed: { name: 'Community Day picnic 🧺', startTime: start },
+      meetup: { description: null },
+    });
+    expect(Object.keys(loaded?.attendees ?? {})).toEqual([REPORTER, ALICE]);
+    expect(attendeeOf(loaded ?? outcome.party, ALICE)).toMatchObject({ number: 2, name: 'Alice' });
+
+    // The clock catches up after the restart: ended, warned an hour ahead, archived.
+    second.clock.now = end + 6 * MINUTE;
+    await second.scheduler.start();
+    expect(second.store.get(id)?.deletionTime).toBe(end + 66 * MINUTE);
+    expect(second.store.get(id)?.prompts.warning).not.toBeNull();
+    second.clock.now = end + 66 * MINUTE;
+    await second.scheduler.tick();
+    await second.scheduler.stop();
+    expect(second.store.active()).toEqual([]);
+    expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
+    expect(await repository.findById(id)).toMatchObject({
+      ok: true,
+      party: { status: 'ended', type: 'meetup' },
+    });
+  });
 });
```

Create `src/services/timed-party-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALICE, at, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
import { createdMeetup, reportedRaid } from '../../test/support/party-service.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const HOUR = 60 * MINUTE;
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

type Made = Awaited<ReturnType<typeof createdMeetup>>;

/** Lets everything that is under way go out: the start message, the lines, the post. */
async function settled(made: Made): Promise<void> {
  await made.timed.flush();
  await made.attendance.flush();
  await made.service.flush();
}

/** A meetup with Alice and Bob coming, beside the member who made it. */
async function withMembers(): Promise<Made> {
  const made = await createdMeetup();
  await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
  await settled(made);
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  return made;
}

const edits = (made: Made): number => made.gateway.posts.get(made.postId)?.edits ?? 0;

describe('TimedPartyService.setStartTime', () => {
  it('sets the start for everybody, shows the post anew and tells the others with a ping', async () => {
    const made = await withMembers();
    const before = edits(made);
    const outcome = await made.timed.setStartTime(made.party.id, alice, START + 30_000);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, others: [REPORTER, BOB] });
    expect(made.current().timed.startTime).toBe(START);
    expect(made.current().lastPossibleTime).toBe(START + 24 * HOUR);
    await settled(made);
    expect(edits(made)).toBe(before + 1);
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content:
          `<@${ALICE}> set the start of this meetup: ${stamp(START)} (${stamp(START, 'R')}).\n` +
          `<@${REPORTER}> <@${BOB}>`,
        mention: { users: [REPORTER, BOB] },
      },
    ]);
  });

  it('pings only those who allow it, and names the day of a start that is far off', async () => {
    const made = await withMembers();
    made.userSettings.set(BOB, { mentions: false });
    made.userSettings.set(REPORTER, { mentionsGroups: false });
    await made.attendance.signUp(made.party.id, carol, PartyStatus.Interested);
    await settled(made);
    const friday = at('2026-10-16T18:00');
    await made.timed.setStartTime(made.party.id, alice, friday);
    await settled(made);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content:
        `<@${ALICE}> set the start of this meetup: ${stamp(friday, 'f')} (${stamp(friday, 'R')}).\n` +
        `<@${CAROL}>`,
      mention: { users: [CAROL] },
    });
  });

  it('is only for a member who is signed up', async () => {
    const made = await withMembers();
    expect(await made.timed.setStartTime(made.party.id, carol, START)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.timed.setStartTime(made.party.id, carol, null)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    await settled(made);
    expect(made.current().timed.startTime).toBeNull();
    expect(made.said()).toEqual([]);
  });

  it('refuses a start that is not before the end', async () => {
    const made = await withMembers();
    await made.timed.setEndTime(made.party.id, alice, END);
    expect(await made.timed.setStartTime(made.party.id, alice, END)).toEqual({
      kind: 'refused',
      reason: 'start-after-end',
    });
    expect(await made.timed.setStartTime(made.party.id, alice, END - MINUTE)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
  });

  it('says and writes nothing for the start the meetup already has', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    await settled(made);
    const writes = made.storage.writes.length;
    const said = made.said().length;
    const before = edits(made);
    const again = await made.timed.setStartTime(made.party.id, bob, START + 10_000);
    expect(again).toMatchObject({ kind: 'ok', changed: false, others: [] });
    await settled(made);
    expect(made.storage.writes).toHaveLength(writes);
    expect(made.said()).toHaveLength(said);
    expect(edits(made)).toBe(before);
  });

  it('removes the start with null, and tells the others that too', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    await settled(made);
    const removed = await made.timed.setStartTime(made.party.id, bob, null);
    expect(removed).toMatchObject({ kind: 'ok', changed: true, others: [REPORTER, ALICE] });
    expect(made.current().timed.startTime).toBeNull();
    await settled(made);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@${BOB}> removed the start time of this meetup.\n<@${REPORTER}> <@${ALICE}>`,
      mention: { users: [REPORTER, ALICE] },
    });
    expect(await made.timed.setStartTime(made.party.id, bob, null)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
  });

  it('notes the name and team of the member who set it', async () => {
    const made = await createdMeetup();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
    await made.timed.setStartTime(made.party.id, alice, START);
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ name: 'Alice', team: 'mystic' });
  });

  it('says nothing in the post of a meetup that ended while the settings were read', async () => {
    const made = await withMembers();
    const slow = { ...made.users };
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    made.users.get = async (snowflake) => {
      await gate;
      return slow.get(snowflake);
    };
    const outcome = await made.timed.setStartTime(made.party.id, alice, START);
    expect(outcome.kind).toBe('ok');
    await made.service.end(made.party.id);
    release();
    await settled(made);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});

describe('TimedPartyService.setEndTime', () => {
  it('sets the end, shows the post anew and says who did it, pinging nobody', async () => {
    const made = await withMembers();
    const before = edits(made);
    // Carol is not signed up: anybody in the post may set the end.
    const outcome = await made.timed.setEndTime(made.party.id, carol, END + 20_000);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
    expect(made.current()).toMatchObject({ endTime: END, lastPossibleTime: END });
    expect(attendeeOf(made.current(), CAROL)).toBeUndefined();
    await settled(made);
    expect(edits(made)).toBe(before + 1);
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      { content: `<@${CAROL}> set the end of this meetup: ${stamp(END)} (${stamp(END, 'R')}).` },
    ]);
  });

  it('removes the end with null', async () => {
    const made = await withMembers();
    await made.timed.setEndTime(made.party.id, alice, END);
    const removed = await made.timed.setEndTime(made.party.id, alice, null);
    expect(removed).toMatchObject({ kind: 'ok', changed: true, party: { endTime: null } });
    expect(made.current().lastPossibleTime).toBe(made.party.createdAt + 24 * HOUR);
    await settled(made);
    expect(made.said().join('\n').split('\n').at(-1)).toBe(
      `<@${ALICE}> removed the end time of this meetup.`,
    );
    expect(await made.timed.setEndTime(made.party.id, alice, null)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
  });

  it('refuses an end that is not after the start', async () => {
    const made = await withMembers();
    await made.timed.setStartTime(made.party.id, alice, START);
    expect(await made.timed.setEndTime(made.party.id, bob, START)).toEqual({
      kind: 'refused',
      reason: 'end-before-start',
    });
    expect(made.current().endTime).toBeNull();
  });

  it('says and writes nothing for the end the meetup already has', async () => {
    const made = await withMembers();
    await made.timed.setEndTime(made.party.id, alice, END);
    await settled(made);
    const writes = made.storage.writes.length;
    const said = made.said();
    expect(await made.timed.setEndTime(made.party.id, bob, END)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    await settled(made);
    expect(made.storage.writes).toHaveLength(writes);
    expect(made.said()).toEqual(said);
  });
});

describe('TimedPartyService: a party that is no meetup, or no more', () => {
  it('answers gone for a raid and leaves it alone', async () => {
    const made = await reportedRaid();
    const before = made.current();
    expect(await made.timed.setStartTime(made.party.id, { id: REPORTER }, START)).toEqual({
      kind: 'gone',
    });
    expect(await made.timed.setEndTime(made.party.id, alice, END)).toEqual({ kind: 'gone' });
    expect(made.current()).toBe(before);
    await made.attendance.flush();
    expect(made.said()).toEqual([]);
  });

  it('answers gone for a meetup that has ended, and for an id it does not know', async () => {
    const made = await withMembers();
    await made.service.end(made.party.id);
    expect(await made.timed.setStartTime(made.party.id, alice, START)).toEqual({ kind: 'gone' });
    expect(await made.timed.setEndTime(made.party.id, alice, END)).toEqual({ kind: 'gone' });
    expect(await made.timed.setEndTime('00000000-0000-4000-8000-00000000ffff', alice, END)).toEqual(
      { kind: 'gone' },
    );
  });
});
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -45,6 +45,7 @@ import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { PartyStore } from '../../src/services/party-store.js';
 import { RaidChangeService } from '../../src/services/raid-change-service.js';
+import { TimedPartyService } from '../../src/services/timed-party-service.js';
 
 /** The invented regions as a directory whose rows a test can change; `load` does nothing. */
 export class TestRegions {
@@ -163,7 +164,9 @@ export function restarted(made: Outliving, overrides: Partial<PartyServiceOption
  * and a clock a test can move (`clock.now`). Posts are brought up to date only by `flush()`.
  *
  * `attendance` is the attendance service over the same store and gateway; its lines go out only
- * by its own `flush()`. `userSettings` holds what differs from the defaults, by member.
+ * by its own `flush()`. `raids` and `timed` are the services for what members change about a
+ * raid and about a meetup; their lines go out with those of `attendance`, and `timed.flush()`
+ * waits for the message that announces a start time. `userSettings` holds what differs from the defaults, by member.
  * `scheduler` is the clock over all of it: it never runs by itself, a test calls `tick()`.
  * `access` lets members into forums they cannot see (on the fake gateway everybody sees every
  * forum unless `gateway.shutOut` says otherwise); it works on the side, `access.flush()` waits.
@@ -247,6 +250,17 @@ export async function partyServiceWith(
     log,
     now,
   });
+  const timed = new TimedPartyService({
+    store,
+    gateway,
+    posts: service,
+    lines,
+    users,
+    log,
+    now,
+    // Long enough that nothing is announced by itself during a test: `timed.flush()` does it.
+    announceDelayMs: 3_600_000,
+  });
   const raidBosses = overrides.raidBosses ?? raidBossesFixture();
   const scheduler = new PartyScheduler({
     store,
@@ -267,6 +281,7 @@ export async function partyServiceWith(
     access,
     grants,
     raids,
+    timed,
     scheduler,
     lines,
     users,
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -8,6 +8,7 @@ import type { DB } from '../../src/db/types.js';
 import type { AttendanceService } from '../../src/services/attendance-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
+import type { TimedPartyService } from '../../src/services/timed-party-service.js';
 import { catalogueFixture } from './game-data.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
@@ -61,6 +62,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'raids',
       'pass { raids, partyService, parties, regions } from partyServiceWith()',
     ),
+    timedParties: unavailable<TimedPartyService>(
+      'timedParties',
+      'pass { timedParties: timed, partyService, parties, regions } from partyServiceWith()',
+    ),
     // Every click is answered by itself; a test of bursts passes its own with a window.
     clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
```

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts src/commands/parties/attendance.test.ts src/commands/parties/delete.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/shout.test.ts src/commands/parties/status.test.ts src/components/party.test.ts src/discord/guards.test.ts src/discord/router.test.ts src/render/activity.test.ts src/services/timed-party-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -17,6 +17,7 @@ import type { RaidChangeService } from './services/raid-change-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionProvider } from './services/region-directory.js';
 import type { MapProvider } from './services/static-maps.js';
+import type { TimedPartyService } from './services/timed-party-service.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -34,14 +35,16 @@ export interface AppContext {
   readonly gyms: GymProvider;
   /** The regions: by id, by text channel and by forum. */
   readonly regions: RegionProvider;
-  /** The raids (later also trains and meetups) that have not ended. */
+  /** The raids and meetups (later also trains) that have not ended. */
   readonly parties: PartyProvider;
-  /** Parties on Discord: reporting a raid, keeping posts and summaries up to date. */
+  /** Parties on Discord: reporting a raid, making a meetup, keeping posts and summaries up to date. */
   readonly partyService: PartyService;
   /** What members do in a party: signing up, completing, groups. Buttons and commands use it. */
   readonly attendance: AttendanceService;
   /** What members change about a raid itself: times, length, boss, moves, gym. */
   readonly raids: RaidChangeService;
+  /** What members change about a meetup (a train later): its start and its end. */
+  readonly timedParties: TimedPartyService;
   /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
   readonly clickAnswers: ClickAnswers;
   /** A member's settings (the defaults for a member who never changed one). */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -35,6 +35,7 @@ import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidChangeService } from './services/raid-change-service.js';
+import { TimedPartyService } from './services/timed-party-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
 import { RegionDirectory } from './services/region-directory.js';
 import { StaticMaps } from './services/static-maps.js';
@@ -147,6 +148,14 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  const timedParties = new TimedPartyService({
+    store: parties,
+    gateway: partyGateway,
+    posts: partyService,
+    lines,
+    users,
+    log,
+  });
   const scheduler = new PartyScheduler({
     store: parties,
     posts: partyService,
@@ -203,6 +212,7 @@ export async function startApp(
     partyService,
     attendance,
     raids,
+    timedParties,
     clickAnswers,
     users,
     pokemon,
@@ -295,6 +305,7 @@ export async function startApp(
       },
       // Answers, lines and edits that are still waiting go out while Discord is connected.
       { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
+      { name: 'start times', timeoutMs: 5_000, run: () => timedParties.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
```

Apply to `src/commands/admin/save-party.ts`:

```diff
--- a/src/commands/admin/save-party.ts
+++ b/src/commands/admin/save-party.ts
@@ -1,9 +1,10 @@
 import { SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, requireManagement } from '../../discord/guards.js';
+import { IN_A_PARTY_POST, partyOf, requireManagement } from '../../discord/guards.js';
+import { partyWord } from '../../domain/party/party.js';
 import { fitItems } from '../../render/text.js';
-import { PARTY_OVER } from '../parties/reply.js';
+import { partyOver } from '../parties/reply.js';
 
 /**
  * `/admin save-party` (spec 5.2): the post it is used in is kept from the clock, which then
@@ -15,15 +16,15 @@ import { PARTY_OVER } from '../parties/reply.js';
 export const saveParty: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('save-party')
-    .setDescription('Keep this raid post from being archived by itself, or let it go again')
+    .setDescription('Keep this post from being archived by itself, or let it go again')
     .addBooleanOption((option) =>
       option.setName('keep').setDescription('False lets the post be archived as usual again'),
     ),
   help: {
     details:
-      'Use it in the post of a raid. A kept post stays open after the raid has ended: nothing ' +
-      'warns that it will be archived and nothing archives it, until you run this with ' +
-      '`keep:False` or close the raid with `/delete`. The post says who kept it. Used anywhere ' +
+      'Use it in the post of a raid or a meetup. A kept post stays open after that has ended: ' +
+      'nothing warns that it will be archived and nothing archives it, until you run this with ' +
+      '`keep:False` or close it with `/delete`. The post says who kept it. Used anywhere ' +
       'else without an option, it lists the posts that are kept. For admins and moderators.',
     examples: ['/admin save-party', '/admin save-party keep:False'],
   },
@@ -34,7 +35,7 @@ export const saveParty: SubcommandPart = {
     const option = interaction.options.getBoolean('keep');
     if (!party) {
       if (option !== null) {
-        throw new UserError('Use this in the post of a raid that is still active.');
+        throw new UserError(IN_A_PARTY_POST);
       }
       // The kept posts of this server: those in a forum this server has.
       const channels = interaction.inCachedGuild() ? interaction.guild.channels.cache : undefined;
@@ -51,19 +52,19 @@ export const saveParty: SubcommandPart = {
       await interaction.editReply({
         content:
           kept.length === 0
-            ? 'No post is kept. Use this in the post of a raid to keep it.'
+            ? 'No post is kept. Use this in the post of a raid or meetup to keep it.'
             : `Kept posts, which I will not archive by myself:\n${fitItems(kept, 1_900, '\n')}`,
       });
       return;
     }
     const keep = option ?? true;
     const outcome = await ctx.partyService.keep(party.id, keep, interaction.user.id);
-    if (outcome === 'gone') throw new UserError(PARTY_OVER);
+    if (outcome === 'gone') throw new UserError(partyOver(party));
     const answers = {
       kept:
         'This post is kept: I will not archive it by myself. `/delete` closes it, and ' +
         '`/admin save-party keep:False` gives it back to the clock.',
-      'let-go': 'This post is no longer kept: it is archived as usual once the raid is over.',
+      'let-go': `This post is no longer kept: it is archived as usual once the ${partyWord(party)} is over.`,
       unchanged: keep ? 'This post was kept already.' : 'This post was not kept.',
     };
     await interaction.editReply({ content: answers[outcome] });
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -2,7 +2,7 @@ import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
 import { group } from './parties/group.js';
-import { deleteRaid } from './parties/delete.js';
+import { deleteParty } from './parties/delete.js';
 import { cancelMeet, meet } from './parties/meet.js';
 import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
@@ -30,7 +30,7 @@ export const commands: readonly CommandModule[] = [
   status,
   where,
   shout,
-  deleteRaid,
+  deleteParty,
   hatch,
   end,
   duration,
```

Apply to `src/commands/parties/attendance.ts`:

```diff
--- a/src/commands/parties/attendance.ts
+++ b/src/commands/parties/attendance.ts
@@ -3,6 +3,7 @@ import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { requireParty } from '../../discord/guards.js';
 import type { AttendanceOptions } from '../../domain/party/attendance.js';
+import type { Party } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import {
   ACTION_THROTTLE,
@@ -10,6 +11,7 @@ import {
   answerOutcome,
   commandParty,
   doneWords,
+  leftWords,
   remoteWords,
   respondWithGroups,
   typedGroup,
@@ -28,7 +30,7 @@ function withCountAndGroup(name: string, description: string): SlashCommandBuild
     .addStringOption((option) =>
       option
         .setName('group')
-        .setDescription('The group to be in, when the raid has several')
+        .setDescription('The group to be in, when a raid has several')
         .setAutocomplete(true),
     );
   return builder;
@@ -37,16 +39,18 @@ function withCountAndGroup(name: string, description: string): SlashCommandBuild
 /** The head count and the group a member gave with a command; what was left out stays as it is. */
 function countAndGroup(
   interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  party: Party,
 ): Omit<AttendanceOptions, 'remote'> {
   const number = interaction.options.getInteger('count');
   const group = interaction.options.getString('group');
   return {
     ...(number === null ? {} : { number }),
-    ...(group === null ? {} : { group: typedGroup(group) }),
+    ...(group === null ? {} : { group: typedGroup(ctx, party, group) }),
   };
 }
 
-const IN_A_POST = 'Use it in the post of the raid.';
+const IN_A_POST = 'Use it in the post of the raid or meetup.';
 
 function signUpCommand(
   name: string,
@@ -69,9 +73,9 @@ function signUpCommand(
         party.id,
         actingMember(interaction),
         status,
-        countAndGroup(interaction),
+        countAndGroup(interaction, ctx, party),
       );
-      await answerOutcome(interaction, ctx, outcome);
+      await answerOutcome(interaction, ctx, party, outcome);
     },
     autocomplete: respondWithGroups,
   };
@@ -95,9 +99,9 @@ function remoteCommand(name: string, description: string, remote: boolean): Simp
         party.id,
         actingMember(interaction),
         remote,
-        countAndGroup(interaction),
+        countAndGroup(interaction, ctx, party),
       );
-      await answerOutcome(interaction, ctx, outcome, remoteWords);
+      await answerOutcome(interaction, ctx, party, outcome, remoteWords);
     },
     autocomplete: respondWithGroups,
   };
@@ -105,28 +109,28 @@ function remoteCommand(name: string, description: string, remote: boolean): Simp
 
 export const maybe = signUpCommand(
   'maybe',
-  'Say that you are interested in this raid',
+  'Say that you are interested in this raid or meetup',
   PartyStatus.Interested,
   'Marks you as interested.',
 );
 
 export const join = signUpCommand(
   'join',
-  'Say that you are coming to this raid',
+  'Say that you are coming to this raid or meetup',
   PartyStatus.Coming,
   'Marks you as coming.',
 );
 
 export const here = signUpCommand(
   'here',
-  'Say that you have arrived at this raid',
+  'Say that you have arrived at this raid or meetup',
   PartyStatus.Present,
   'Marks you as here.',
 );
 
 export const remote = remoteCommand(
   'remote',
-  'Say that you take part with a remote raid pass',
+  'Say that you take part remotely (in a raid: with a remote raid pass)',
   true,
 );
 
@@ -135,7 +139,7 @@ export const local = remoteCommand('local', 'Say that you take part in person',
 export const notHere: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('not-here')
-    .setDescription('Say that you are not at this raid after all'),
+    .setDescription('Say that you are not there after all'),
   help: {
     category: 'basic-raid',
     details: `Marks you as interested again after you said you were here. ${IN_A_POST}`,
@@ -145,37 +149,40 @@ export const notHere: SimpleCommand = {
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
     const outcome = await ctx.attendance.notHere(party.id, actingMember(interaction));
-    await answerOutcome(interaction, ctx, outcome);
+    await answerOutcome(interaction, ctx, party, outcome);
   },
 };
 
 export const leave: SimpleCommand = {
-  data: new SlashCommandBuilder().setName('leave').setDescription('Take yourself off this raid'),
-  help: { category: 'basic-raid', details: `Removes you from the raid. ${IN_A_POST}` },
+  data: new SlashCommandBuilder()
+    .setName('leave')
+    .setDescription('Take yourself off this raid or meetup'),
+  help: { category: 'basic-raid', details: `Removes you from the list. ${IN_A_POST}` },
   guards: [requireParty],
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
     const outcome = await ctx.attendance.leave(party.id, actingMember(interaction));
-    await answerOutcome(interaction, ctx, outcome, () => 'You have left this raid.');
+    await answerOutcome(interaction, ctx, party, outcome, leftWords);
   },
 };
 
 export const done: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('done')
-    .setDescription('Say that you have completed this raid'),
+    .setDescription('Say that you have completed this raid (in a meetup: that you leave)'),
   help: {
     category: 'basic-raid',
     details:
       'Marks you as done. The others of your group who are here are asked whether they are done ' +
-      `too; without an answer they count as done after a few minutes. ${IN_A_POST}`,
+      'too; without an answer they count as done after a few minutes. A meetup has nothing to ' +
+      `complete: there it takes you off the list, like \`/leave\`. ${IN_A_POST}`,
   },
   guards: [requireParty],
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
     const outcome = await ctx.attendance.done(party.id, actingMember(interaction));
-    await answerOutcome(interaction, ctx, outcome, doneWords);
+    await answerOutcome(interaction, ctx, party, outcome, doneWords);
   },
 };
```

Apply to `src/commands/parties/delete.ts`:

```diff
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -2,12 +2,13 @@ import { SlashCommandBuilder } from 'discord.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { isStaff, requireParty } from '../../discord/guards.js';
+import { isRaid, partyWord } from '../../domain/party/party.js';
 import { deletionForm } from '../../render/party-controls.js';
-import { IN_A_RAID_POST } from '../raids/change.js';
-import { commandParty, PARTY_OVER } from './reply.js';
+import { commandParty, partyOver } from './reply.js';
 
 /**
- * `/delete` (spec 4.2). From an admin, a moderator or the bot's owner it ends the raid at once:
+ * `/delete` (spec 4.2), for a raid and for a meetup alike; what follows says "raid".
+ * From an admin, a moderator or the bot's owner it ends the raid at once:
  * the post says who closed it and is archived and locked, the copies and the link line go, and
  * the gym is free for a new report. It is the tool for what the clock does not tidy up by itself
  * (a raid reported by mistake, a duplicate, a post in a state nobody foresaw), so it works on any
@@ -15,17 +16,17 @@ import { commandParty, PARTY_OVER } from './reply.js';
  * throttle. From anybody else it opens a form for the reason, which is put into the post for the
  * moderators; nothing else happens, and what limits that is in `PartyService.requestDeletion`.
  */
-export const deleteRaid: SimpleCommand = {
+export const deleteParty: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('delete')
-    .setDescription('Close this raid (moderators), or ask the moderators to'),
+    .setDescription('Close this raid or meetup (moderators), or ask the moderators to'),
   help: {
     category: 'raid-crud',
     details:
-      'Admins and moderators: closes the raid at once; its post is archived and locked and ' +
-      'stays readable. Everybody else: asks why the raid should be deleted and puts that into ' +
-      'the post for the moderators. A raid nobody comes to needs no deleting: it goes away by ' +
-      `itself after it ends. ${IN_A_RAID_POST}`,
+      'Admins and moderators: closes the raid or meetup at once; its post is archived and ' +
+      'locked and stays readable. Everybody else: asks why it should be deleted and puts that ' +
+      'into the post for the moderators. What nobody comes to needs no deleting: it goes away ' +
+      'by itself after it ends. Use it in the post of the raid or meetup.',
     examples: ['/delete'],
   },
   guards: [requireParty],
@@ -37,16 +38,18 @@ export const deleteRaid: SimpleCommand = {
       await interaction.showModal(deletionForm(party));
       return;
     }
+    const word = partyWord(party);
     const closed = await ctx.partyService.end(party.id, undefined, {
-      lastWords: `This raid was closed by <@${interaction.user.id}>.`,
+      lastWords: `This ${word} was closed by <@${interaction.user.id}>.`,
       // The answer goes out before the post is archived and locked: nothing may follow that.
       left: () =>
         interaction.editReply({
-          content:
-            'This raid is closed: its gym is free for a new report, and I am archiving and ' +
-            'locking its post.',
+          content: isRaid(party)
+            ? 'This raid is closed: its gym is free for a new report, and I am archiving and ' +
+              'locking its post.'
+            : `This ${word} is closed: I am archiving and locking its post.`,
         }),
     });
-    if (!closed) throw new UserError(PARTY_OVER);
+    if (!closed) throw new UserError(partyOver(party));
   },
 };
```

Apply to `src/commands/parties/group.ts`:

```diff
--- a/src/commands/parties/group.ts
+++ b/src/commands/parties/group.ts
@@ -29,9 +29,9 @@ const joinGroup: SubcommandPart = {
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
-    const letter = typedGroup(interaction.options.getString('letter', true));
+    const letter = typedGroup(ctx, party, interaction.options.getString('letter', true));
     const outcome = await ctx.attendance.joinGroup(party.id, actingMember(interaction), letter);
-    await answerOutcome(interaction, ctx, outcome);
+    await answerOutcome(interaction, ctx, party, outcome);
   },
   autocomplete: respondWithGroups,
 };
@@ -52,6 +52,7 @@ const newGroup: SubcommandPart = {
     await answerOutcome(
       interaction,
       ctx,
+      party,
       outcome,
       (ok) => `You opened group ${ok.group} and are in it.`,
     );
@@ -74,7 +75,7 @@ const labelGroup: SubcommandPart = {
     const party = commandParty(interaction, ctx);
     const text = interaction.options.getString('text') ?? '';
     const outcome = await ctx.attendance.labelGroup(party.id, actingMember(interaction), text);
-    await answerOutcome(interaction, ctx, outcome, (ok) => {
+    await answerOutcome(interaction, ctx, party, outcome, (ok) => {
       const group = groupOf(ok.party, ok.group);
       return group?.label
         ? `Your group is now ${groupWords(group)}.`
@@ -83,12 +84,16 @@ const labelGroup: SubcommandPart = {
   },
 };
 
-/** `/group`: the groups of a raid. */
+/**
+ * `/group`: the groups of a raid. A meetup has one group for good, so each part is refused
+ * there with that sentence (`no-groups`): it is the party that says so, not a guard, since a
+ * train will have groups again.
+ */
 export const group = commandGroup({
   data: new SlashCommandBuilder().setName('group').setDescription('The groups of this raid'),
   help: {
     category: 'basic-raid',
-    details: 'Use it in the post of the raid.',
+    details: 'Use it in the post of the raid. A meetup has no groups.',
   },
   guards: [requireParty],
   parts: [joinGroup, newGroup, labelGroup],
```

Apply to `src/commands/parties/meet.ts`:

```diff
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -1,13 +1,15 @@
 import { SlashCommandBuilder } from 'discord.js';
-import type { SimpleCommand } from '../../discord/command.js';
-import { requireParty } from '../../discord/guards.js';
-import { groupOf, membersWhere } from '../../domain/party/party.js';
+import type { Guard, SimpleCommand } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { partyOf, requireParty } from '../../discord/guards.js';
+import { attendeeOf, groupOf, isTimed, membersWhere, partyWord } from '../../domain/party/party.js';
+import { problemText } from '../../render/activity.js';
 import { groupWords } from '../../render/party-controls.js';
 import { timestamp } from '../../render/text.js';
-import { IN_A_RAID_POST } from '../raids/change.js';
 import { typedPartyTime } from '../raids/raid-input.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { actingMember, answerOutcome, commandParty, commandRaid } from './reply.js';
+import { actingMember, answerOutcome, commandParty } from './reply.js';
+import { changeStart, START_THROTTLE, typedTimedTime } from './timed.js';
 
 /**
  * Tighter than the other attendance commands: every change of a meeting time is a message that
@@ -15,38 +17,79 @@ import { actingMember, answerOutcome, commandParty, commandRaid } from './reply.
  */
 export const MEET_THROTTLE: Throttle = { uses: 3, perSeconds: 60 };
 
+/**
+ * The limit of `/meet` and `/cancel-meet` where they are used: in a timed party the start is
+ * for everybody, and telling of it pings everybody (`START_THROTTLE`, as for a shout).
+ */
+const meetThrottle: NonNullable<SimpleCommand['throttle']> = (interaction, ctx) => {
+  const party = partyOf(interaction, ctx);
+  return party && isTimed(party) ? START_THROTTLE : MEET_THROTTLE;
+};
+
+/**
+ * For `/meet` and `/cancel-meet` in a timed party: what can be known before the start is
+ * changed is refused here, so that a use that changed nothing does not count towards the three
+ * a member has in three minutes: a member who is not signed up, a text that is no time, a time
+ * the party cannot have. The handler reads the time again, and the service decides again.
+ */
+const requireStartChange: Guard = (interaction, ctx) => {
+  const party = partyOf(interaction, ctx);
+  if (!party || !isTimed(party) || !interaction.isChatInputCommand()) return;
+  if (!attendeeOf(party, interaction.user.id)) {
+    throw new UserError(problemText('not-attending', ctx.attendance.limits(), partyWord(party)));
+  }
+  const text = interaction.options.getString('time');
+  if (text !== null) typedTimedTime(ctx, party, 'meet', text, Date.now());
+};
+
+/**
+ * `/meet`. In a raid it is the meeting time of the member's group. A meetup has one group and
+ * starts for everybody at once: there it sets the start of the meetup (`changeStart`).
+ */
 export const meet: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('meet')
-    .setDescription('Set when your group meets for this raid')
+    .setDescription('Set when your group meets for this raid, or when this meetup starts')
     .addStringOption((option) =>
       option
         .setName('time')
-        .setDescription('Minutes from now (20), a clock time (6:15pm), or "hatch"')
+        .setDescription(
+          'Raid: minutes (20), a time (6:15pm) or "hatch". Meetup: 6:15pm, 10-17 6:15pm, in 30',
+        )
         .setRequired(true)
         .setMaxLength(40),
     ),
   help: {
     category: 'basic-raid',
     details:
-      'Sets the meeting time of the group you are in and tells the others of the group. The ' +
-      'time must lie between now (or the hatch) and the end of the raid; `hatch` means the ' +
-      `hatch time, \`cancel\` removes the meeting time. A while after it, those who are here ` +
-      `are asked whether they are done. ${IN_A_RAID_POST}`,
-    examples: ['/meet time:6:15pm', '/meet time:hatch'],
+      'In the post of a raid: sets the meeting time of the group you are in and tells the ' +
+      'others of the group. The time must lie between now (or the hatch) and the end of the ' +
+      'raid; `hatch` means the hatch time, `cancel` removes the meeting time. A while after it, ' +
+      'those who are here are asked whether they are done. In the post of a meetup: sets when ' +
+      'the meetup starts, for everybody, and tells the others who are signed up. Give a clock ' +
+      'time, a date and a time, or `in 30` for minutes from now (a bare number is an hour ' +
+      "there); `cancel` removes the start. A time without a date is read on today's date, or " +
+      'on the day of the start the meetup has; a date comes first, month-day (`10-14 6pm`). ' +
+      'You must be signed up.',
+    examples: ['/meet time:6:15pm', '/meet time:hatch', '/meet time:10-17 6:15pm'],
   },
-  guards: [requireParty],
-  throttle: MEET_THROTTLE,
+  guards: [requireParty, requireStartChange],
+  throttle: meetThrottle,
   async execute(interaction, ctx) {
-    const party = commandRaid(interaction, ctx);
+    const party = commandParty(interaction, ctx);
     const text = interaction.options.getString('time', true);
+    if (isTimed(party)) {
+      const start = typedTimedTime(ctx, party, 'meet', text, Date.now());
+      await changeStart(interaction, ctx, party, start === 'unset' ? null : start.at);
+      return;
+    }
     const typed = typedPartyTime(ctx, party, 'meet', text, Date.now());
     const outcome = await ctx.attendance.setMeetingTime(
       party.id,
       actingMember(interaction),
       typed === 'unset' ? null : typed.at,
     );
-    await answerOutcome(interaction, ctx, outcome, (ok) => {
+    await answerOutcome(interaction, ctx, party, outcome, (ok) => {
       const group = groupOf(ok.party, ok.group);
       const whose =
         ok.party.groups.length > 1 ? groupWords(group ?? { id: ok.group }) : 'your group';
@@ -69,17 +112,23 @@ export const meet: SimpleCommand = {
 export const cancelMeet: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('cancel-meet')
-    .setDescription('Remove the meeting time of your group'),
+    .setDescription('Remove the meeting time of your group, or the start time of this meetup'),
   help: {
     category: 'basic-raid',
-    details: `Removes the meeting time of the group you are in and tells the others. ${IN_A_RAID_POST}`,
+    details:
+      'In the post of a raid: removes the meeting time of the group you are in and tells the ' +
+      'others. In the post of a meetup: removes its start time. You must be signed up.',
   },
-  guards: [requireParty],
-  throttle: MEET_THROTTLE,
+  guards: [requireParty, requireStartChange],
+  throttle: meetThrottle,
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
+    if (isTimed(party)) {
+      await changeStart(interaction, ctx, party, null);
+      return;
+    }
     const outcome = await ctx.attendance.setMeetingTime(party.id, actingMember(interaction), null);
-    await answerOutcome(interaction, ctx, outcome, (ok) =>
+    await answerOutcome(interaction, ctx, party, outcome, (ok) =>
       ok.acted ? 'The meeting time is cancelled.' : 'There was no meeting time.',
     );
   },
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -5,24 +5,35 @@ import {
   type MessageComponentInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
+import { decodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { notARaid, partyOf } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import {
+  hasGroups,
   headCount,
   isGroupId,
   isRaid,
+  partyWord,
   type Attendee,
   type GroupId,
   type Party,
   type RaidParty,
 } from '../../domain/party/party.js';
 import { problemText, standingReply } from '../../render/activity.js';
+import { isRaidAction } from '../../render/party-controls.js';
 import { truncate } from '../../render/text.js';
 import type { AttendanceOutcome, Member } from '../../services/attendance-service.js';
 
-export const PARTY_OVER = 'This raid is over.';
+/**
+ * What a member is told about a party that has ended. Pass the party when it is known. One that
+ * is not at hand (it has left the store, and with it what kind it was) is spoken of without a
+ * kind.
+ */
+export function partyOver(party?: Pick<Party, 'type'>): string {
+  return party ? `This ${partyWord(party)} is over.` : 'This has ended.';
+}
 
 /**
  * How often one member may act on parties: per minute, for the buttons of a post together and
@@ -43,7 +54,7 @@ export function actingMember(
  */
 export function commandParty(interaction: ChatInputCommandInteraction, ctx: AppContext): Party {
   const party = partyOf(interaction, ctx);
-  if (!party) throw new UserError(PARTY_OVER);
+  if (!party) throw new UserError(partyOver());
   return party;
 }
 
@@ -52,21 +63,22 @@ export function commandParty(interaction: ChatInputCommandInteraction, ctx: AppC
  * `commandParty` this copes with a raid that ended in between.
  */
 export function commandRaid(interaction: ChatInputCommandInteraction, ctx: AppContext): RaidParty {
-  const party = commandParty(interaction, ctx);
+  const party = partyOf(interaction, ctx);
+  if (!party) throw new UserError(partyOver({ type: 'raid' }));
   if (!isRaid(party)) throw new UserError(notARaid(party));
   return party;
 }
 
-const NO_SUCH_GROUP = 'This raid has no such group.';
-
 /**
  * The group a member picked from the list or typed: its letter. `B`, `b`, `group b`, and what
- * the list shows (`Group B: park side (4)`) all mean B. Whether the raid has that group is for
- * the service to say.
+ * the list shows (`Group B: park side (4)`) all mean B. Whether the party has that group is for
+ * the service to say; `party` is only named in the refusal of a text that is no group at all.
  */
-export function typedGroup(text: string): GroupId {
+export function typedGroup(ctx: AppContext, party: Pick<Party, 'type'>, text: string): GroupId {
   const letter = /^(?:GROUP\s*)?([A-Z])(?:\s*[:(].*)?$/.exec(text.trim().toUpperCase())?.[1] ?? '';
-  if (!isGroupId(letter)) throw new UserError(NO_SUCH_GROUP);
+  if (!isGroupId(letter)) {
+    throw new UserError(problemText('no-such-group', ctx.attendance.limits(), partyWord(party)));
+  }
   return letter;
 }
 
@@ -79,7 +91,8 @@ export async function respondWithGroups(
   ctx: AppContext,
 ): Promise<void> {
   const party = partyOf(interaction, ctx);
-  if (!party) {
+  // Nothing either for a party that has its one group for good: there is nothing to choose.
+  if (!party || !hasGroups(party)) {
     await interaction.respond([]);
     return;
   }
@@ -110,16 +123,18 @@ export type Ok<Extra> = Extract<AttendanceOutcome<Extra>, { kind: 'ok' }>;
 /**
  * Tells the member, privately, what came of their action: how they stand now, or what `words`
  * makes of the outcome. A refusal and a party that has ended are thrown as `UserError`s, which
- * the router shows the same way.
+ * the router shows the same way. `party` is the party the action was for, as the command found
+ * it: a refusal and "it is over" name its kind.
  */
 export async function answerOutcome<Extra>(
   interaction: ChatInputCommandInteraction | MessageComponentInteraction,
   ctx: AppContext,
+  party: Pick<Party, 'type'>,
   outcome: AttendanceOutcome<Extra>,
   words?: (ok: Ok<Extra>) => string | undefined,
 ): Promise<void> {
   await interaction.reply({
-    content: outcomeContent(ctx, outcome, words),
+    content: outcomeContent(ctx, party, outcome, words),
     flags: MessageFlags.Ephemeral,
   });
 }
@@ -135,19 +150,29 @@ export async function answerClick<Extra>(
   outcome: AttendanceOutcome<Extra>,
   words?: (ok: Ok<Extra>) => string | undefined,
 ): Promise<void> {
-  const content = outcomeContent(ctx, outcome, words);
+  // A control names its party by id only. A party that refused is still there to be asked its
+  // kind; one that has ended is not. What only the post of a raid has (Done, the groups, the
+  // answers to the completion question) was a raid's; of anything else the kind is not known.
+  const action = decodeCustomId(interaction.customId)?.action;
+  const party =
+    ctx.parties.get(partyId) ??
+    (action !== undefined && isRaidAction(action) ? ({ type: 'raid' } as const) : undefined);
+  const content = outcomeContent(ctx, party, outcome, words);
   await ctx.clickAnswers.answer(`${partyId}:${interaction.user.id}`, interaction, content);
 }
 
 /** What the member is told for an outcome; a refusal and a party that has ended are thrown. */
 function outcomeContent<Extra>(
   ctx: AppContext,
+  party: Pick<Party, 'type'> | undefined,
   outcome: AttendanceOutcome<Extra>,
   words?: (ok: Ok<Extra>) => string | undefined,
 ): string {
-  if (outcome.kind === 'gone') throw new UserError(PARTY_OVER);
+  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
   if (outcome.kind === 'refused') {
-    throw new UserError(problemText(outcome.reason, ctx.attendance.limits()));
+    // A party that refused is in the store, so its kind is known; `party` is said otherwise.
+    const word = party ? partyWord(party) : 'party';
+    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), word));
   }
   return outcomeText(outcome as Ok<Extra>, words);
 }
@@ -159,7 +184,9 @@ export function outcomeText<Extra>(
 ): string {
   const said =
     words?.(ok) ??
-    (ok.attendee ? standingReply(ok.party, ok.attendee) : 'You are not signed up for this raid.');
+    (ok.attendee
+      ? standingReply(ok.party, ok.attendee)
+      : `You are not signed up for this ${partyWord(ok.party)}.`);
   return ok.withdrawn.length > 0 ? `${said} ${WITHDRAWN_REPLY}` : said;
 }
 
@@ -184,8 +211,22 @@ export function moreWords(ok: {
   return `${standingReply(ok.party, ok.attendee)} That is the most one member may bring.`;
 }
 
-/** What Done answers: whether the others were asked, or that nothing changed. */
-export function doneWords(ok: { asked: string[]; wasComplete: boolean }): string {
+/** What Leave answers. */
+export function leftWords(ok: { party: Party }): string {
+  return `You have left this ${partyWord(ok.party)}.`;
+}
+
+/**
+ * What Done answers: whether the others were asked, or that nothing changed. In a party where
+ * done means leave (a meetup), that the member has left.
+ */
+export function doneWords(ok: {
+  party: Party;
+  asked: string[];
+  wasComplete: boolean;
+  left: boolean;
+}): string {
+  if (ok.left) return leftWords(ok);
   if (ok.wasComplete) return 'You were done already.';
   return ok.asked.length === 0
     ? 'You are done.'
```

Apply to `src/commands/parties/shout.ts`:

```diff
--- a/src/commands/parties/shout.ts
+++ b/src/commands/parties/shout.ts
@@ -3,10 +3,10 @@ import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { requireParty } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
+import { partyWord } from '../../domain/party/party.js';
 import { problemText } from '../../render/activity.js';
 import { count } from '../../render/text.js';
-import { IN_A_RAID_POST } from '../raids/change.js';
-import { actingMember, commandParty, PARTY_OVER } from './reply.js';
+import { actingMember, commandParty, partyOver } from './reply.js';
 
 /** As the legacy bot allowed: a shout pings everybody who is signed up. */
 export const SHOUT_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };
@@ -15,13 +15,13 @@ export const SHOUT_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };
 export const MAX_SHOUT = 500;
 
 /**
- * `/shout` (spec 4.2): a member's message to everybody else who is signed up for the raid and
- * not done, said by the bot in the post so that it can ping them.
+ * `/shout` (spec 4.2): a member's message to everybody else who is signed up for the raid or
+ * meetup and not done, said by the bot in the post so that it can ping them.
  */
 export const shout: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('shout')
-    .setDescription('Tell everybody who is signed up for this raid something, with a ping')
+    .setDescription('Tell everybody who is signed up here something, with a ping')
     .addStringOption((option) =>
       option
         .setName('message')
@@ -32,10 +32,10 @@ export const shout: SimpleCommand = {
   help: {
     category: 'basic-raid',
     details:
-      'For members who are signed up for the raid. ' +
+      'For members who are signed up for the raid or meetup. ' +
       'Says your message in the post and pings everybody else who is signed up and not done, ' +
       'in every group, unless they switched such pings off. For what cannot wait: the lobby is ' +
-      `starting, the gym was wrong. ${IN_A_RAID_POST}`,
+      'starting, the gym was wrong. Use it in the post of the raid or meetup.',
     examples: ['/shout message:Starting the lobby in two minutes'],
   },
   guards: [requireParty],
@@ -45,15 +45,16 @@ export const shout: SimpleCommand = {
     const party = commandParty(interaction, ctx);
     const text = interaction.options.getString('message', true).trim();
     if (text === '') throw new UserError('Say what you want to tell them.');
+    const word = partyWord(party);
     const outcome = await ctx.attendance.shout(party.id, actingMember(interaction), text);
-    if (outcome.kind === 'gone') throw new UserError(PARTY_OVER);
+    if (outcome.kind === 'gone') throw new UserError(partyOver(party));
     if (outcome.kind === 'refused') {
-      throw new UserError(problemText(outcome.reason, ctx.attendance.limits()));
+      throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), word));
     }
     await interaction.editReply({
       content:
         outcome.kind === 'nobody'
-          ? 'Nobody else is signed up for this raid, so I said nothing.'
+          ? `Nobody else is signed up for this ${word}, so I said nothing.`
           : `Your message is in the post. I pinged ${count(outcome.pinged, 'trainer')}.`,
     });
   },
```

Apply to `src/commands/parties/status.ts`:

```diff
--- a/src/commands/parties/status.ts
+++ b/src/commands/parties/status.ts
@@ -1,34 +1,36 @@
 import { SlashCommandBuilder } from 'discord.js';
-import type { SimpleCommand } from '../../discord/command.js';
+import type { Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, regionChannelOf, requireGuild, requireParty } from '../../discord/guards.js';
+import { partyOf, regionChannelOf, requireGuild, requireRaid } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
+import { isRaid, partyWord } from '../../domain/party/party.js';
 import { gymMapsUrl } from '../../render/raid-post.js';
 import { plain } from '../../render/text.js';
 import { IN_A_RAID_POST } from '../raids/change.js';
-import { ACTION_THROTTLE, commandParty, PARTY_OVER } from './reply.js';
+import { ACTION_THROTTLE, commandRaid, partyOver } from './reply.js';
 
 /** Every use in a post sends a message with an embed into it. */
 export const STATUS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };
 
 /**
- * `/status` (spec 4.2). In the post of a raid: the raid's message once more at the bottom of the
- * post, with its buttons, where the lines of the bot and the chat have pushed the first message
- * out of sight; the copy of an earlier `/status` is deleted. In a region's channel or forum: the
- * list of that region's raids, for the member alone.
+ * `/status` (spec 4.2). In the post of a raid or a meetup: its message once more at the bottom
+ * of the post, with its buttons, where the lines of the bot and the chat have pushed the first
+ * message out of sight; the copy of an earlier `/status` is deleted. In a region's channel or
+ * forum: the list of that region's raids and meetups, for the member alone.
  */
 export const status: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('status')
     .setDescription(
-      'Show this raid again at the bottom of its post, or list the raids of a region',
+      'Show this raid or meetup again at the bottom of its post, or list what a region has',
     ),
   help: {
     category: 'basic-raid',
     details:
-      'In the post of a raid: puts the raid, with who is coming and the buttons, at the bottom ' +
-      'of the post again, so nobody has to scroll up. In the channel of a region: shows you the ' +
-      'raids of that region that are going on, as the pinned list of its forum does.',
+      'In the post of a raid or a meetup: puts it, with who is coming and the buttons, at the ' +
+      'bottom of the post again, so nobody has to scroll up. In the channel of a region: shows ' +
+      'you the raids of that region that are going on and its meetups, as the pinned list of ' +
+      'its forum does.',
     examples: ['/status'],
   },
   guards: [requireGuild],
@@ -37,21 +39,36 @@ export const status: SimpleCommand = {
   async execute(interaction, ctx) {
     const party = partyOf(interaction, ctx);
     if (party) {
-      if (!(await ctx.partyService.showStatus(party.id))) throw new UserError(PARTY_OVER);
+      if (!(await ctx.partyService.showStatus(party.id))) throw new UserError(partyOver(party));
       await interaction.editReply({
-        content: 'The raid is at the bottom of the post again, with its buttons.',
+        content: `The ${partyWord(party)} is at the bottom of the post again, with its buttons.`,
       });
       return;
     }
     const channelId = regionChannelOf(interaction, ctx);
     const region = channelId === undefined ? undefined : ctx.regions.byChannel(channelId);
     if (!region) {
-      throw new UserError('Use this in the channel of a region, or in the post of a raid.');
+      throw new UserError(
+        'Use this in the channel of a region, or in the post of a raid or meetup.',
+      );
     }
     await interaction.editReply({ content: ctx.partyService.summaryText(region.id) });
   },
 };
 
+/**
+ * For `/where`: the post of a party that is at a gym, which is a raid (and will be a train, at
+ * the gym it has reached). A meetup is at none, and the member is told that rather than that
+ * the command is for raids.
+ */
+const requireGym: Guard = (interaction, ctx) => {
+  const party = partyOf(interaction, ctx);
+  if (party && !isRaid(party)) {
+    throw new UserError(`A ${partyWord(party)} is at no gym, so there is no place to show.`);
+  }
+  return requireRaid(interaction, ctx);
+};
+
 /** `/where` (spec 4.2): where the raid's gym is, as a link and a map, for the member alone. */
 export const where: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -62,11 +79,11 @@ export const where: SimpleCommand = {
     details: `Shows you a link to the gym in Google Maps and a map of its surroundings. ${IN_A_RAID_POST}`,
     examples: ['/where'],
   },
-  guards: [requireParty],
+  guards: [requireGym],
   defer: 'ephemeral',
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandParty(interaction, ctx);
+    const party = commandRaid(interaction, ctx);
     const gym = party.gymId === null ? undefined : ctx.gyms.get(party.gymId);
     if (!gym) throw new UserError('I no longer know the gym of this raid.');
     // A nickname that was cleared to an empty text names nothing, so it is tested for truth.
```

Create `src/commands/parties/timed.ts`:

```ts
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { DateTime } from 'luxon';
import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import type { Throttle } from '../../discord/throttle.js';
import { partyWord, type TimedParty } from '../../domain/party/party.js';
import { startTimeOf } from '../../domain/party/timed.js';
import { resolvePartyTime } from '../../domain/time/party-time.js';
import { problemText } from '../../render/activity.js';
import { clockOrDate, plain, timestamp, truncate } from '../../render/text.js';
import type { TimedChangeOutcome } from '../../services/timed-party-service.js';
import { between } from '../raids/raid-input.js';
import { actingMember, partyOver } from './reply.js';

/**
 * How often one member may change the start of a timed party: as often as they may shout, since
 * it is the same thing to the others, a message that pings everybody who is signed up.
 */
export const START_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };

/** How a time is to be typed for a meetup: a bare number is an hour there, not minutes. */
export const TIMED_TIME_HINT =
  'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';

type Ok<Extra> = Extract<TimedChangeOutcome<Extra>, { kind: 'ok' }>;

/**
 * A time a member typed for a timed party that exists (a meetup; a train from plan 3B): when it
 * starts (`meet`) or when it ends. `'unset'` when the member asked to remove it (`cancel`,
 * `none`, `unset`). Throws a `UserError` for a text that is no time or lies outside what the
 * party can have: a start from now, an end from the start or from now, both within some three
 * months (`resolvePartyTime`, which reads a time without a date on today's date or on the day
 * of the start, and never into the past). The sibling of `typedPartyTime`, which is for a raid.
 *
 * A time without a date that fits on no day it could mean is refused with the day it was read
 * on, and with the way to name another: the member cannot see what "5" was taken for.
 */
export function typedTimedTime(
  ctx: AppContext,
  party: TimedParty,
  parameter: 'meet' | 'end',
  text: string,
  now: number,
): { at: number } | 'unset' {
  const { settings } = ctx.config;
  const result = resolvePartyTime({
    text,
    now,
    zone: settings.timezone,
    parameter,
    partyType: party.type,
    // Asked of every request; nothing about a timed party depends on it.
    raidKind: 'standard',
    party: {
      creationTime: party.createdAt,
      endTime: party.endTime,
      startTime: startTimeOf(party),
    },
    settings,
  });
  if (result.kind === 'unset') return 'unset';
  if (result.kind === 'time') return { at: result.at };
  const word = partyWord(party);
  const what = parameter === 'meet' ? `the time the ${word} starts` : `the time the ${word} ends`;
  const typed = plain(truncate(text, 80));
  if (result.kind === 'out-of-range') {
    const range = `it must be ${between(result.first, result.last, now)}`;
    if (result.read === undefined) {
      throw new UserError(`"${typed}" cannot be ${what}: ${range}.`);
    }
    const day = DateTime.fromMillis(result.read, { zone: settings.timezone });
    throw new UserError(
      `"${typed}" cannot be ${what}: I read it as ${timestamp(result.read, 'F')}, and ${range}. ` +
        `For another day, give the date first, month-day: \`${day.month}-${day.day} ${typed}\`.`,
    );
  }
  throw new UserError(`I could not read "${typed}" as ${what}. ${TIMED_TIME_HINT}`);
}

/** A time as an answer names it: with its date when it is far off, and how long until then. */
function when(time: number, now: number): string {
  return `${clockOrDate(time, now)} (${timestamp(time, 'R')})`;
}

/**
 * Tells the member, privately, what came of a change to a timed party: what `words` makes of
 * it. A refusal and a party that has ended are thrown as `UserError`s, which name the kind of
 * `party`, the party as the command found it.
 */
export async function answerTimedChange<Extra>(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TimedParty,
  outcome: TimedChangeOutcome<Extra>,
  words: (ok: Ok<Extra>) => string,
): Promise<void> {
  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
  if (outcome.kind === 'refused') {
    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), partyWord(party)));
  }
  await interaction.reply({
    content: words(outcome),
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * `/meet` and `/cancel-meet` in the post of a timed party: sets when it starts, for everybody,
 * or removes the start (`time` null), and answers. The others are told a moment later, once the
 * start has stood for a few seconds (`TimedPartyService`).
 */
export async function changeStart(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TimedParty,
  time: number | null,
): Promise<void> {
  const now = Date.now();
  const word = partyWord(party);
  const outcome = await ctx.timedParties.setStartTime(party.id, actingMember(interaction), time);
  await answerTimedChange(interaction, ctx, party, outcome, (ok) => {
    const start = startTimeOf(ok.party);
    const told = ok.changed && ok.others.length > 0 ? ' I am telling the others.' : '';
    if (start === null) {
      return ok.changed
        ? `This ${word} has no start time any more.${told}`
        : `This ${word} had no start time.`;
    }
    if (!ok.changed) return `This ${word} already starts at ${when(start, now)}.`;
    return `This ${word} starts at ${when(start, now)}.${told}`;
  });
}

/**
 * `/end` in the post of a timed party: sets when it ends from what the member typed, or removes
 * the end (`none`, `cancel`, `unset`), and answers.
 */
export async function changeEnd(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TimedParty,
  text: string,
): Promise<void> {
  const now = Date.now();
  const word = partyWord(party);
  const typed = typedTimedTime(ctx, party, 'end', text, now);
  const outcome = await ctx.timedParties.setEndTime(
    party.id,
    actingMember(interaction),
    typed === 'unset' ? null : typed.at,
  );
  await answerTimedChange(interaction, ctx, party, outcome, (ok) => {
    const end = ok.party.endTime;
    if (end === null) {
      return ok.changed
        ? `This ${word} has no end time any more.`
        : `This ${word} had no end time.`;
    }
    return ok.changed
      ? `This ${word} ends at ${when(end, now)}.`
      : `This ${word} already ends at ${when(end, now)}.`;
  });
}
```

Apply to `src/commands/raids/boss.ts`:

```diff
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -126,7 +126,7 @@ export const moveset: SimpleCommand = {
       throw new UserError('Give the fast move, the charged move, or both.');
     }
     const shown = ctx.partyService.view(party).boss;
-    if (!shown) throw new UserError(problemText('no-boss', ctx.attendance.limits()));
+    if (!shown) throw new UserError(problemText('no-boss', ctx.attendance.limits(), 'raid'));
     const { entry } = shown;
     if (!entry) throw new UserError(`I do not know the moves of ${plain(shown.name)} yet.`);
     const moves = {
```

Apply to `src/commands/raids/change.ts`:

```diff
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -8,15 +8,16 @@ import {
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { requireRaid } from '../../discord/guards.js';
+import { requireParty, requireRaid } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
-import type { RaidParty } from '../../domain/party/party.js';
+import { isTimed, type RaidParty } from '../../domain/party/party.js';
 import { problemText } from '../../render/activity.js';
 import { isFarOff, timestamp } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
-import { commandRaid, PARTY_OVER } from '../parties/reply.js';
+import { commandParty, commandRaid, partyOver } from '../parties/reply.js';
+import { changeEnd } from '../parties/timed.js';
 import { typedPartyTime } from './raid-input.js';
 
 /** How often one member may change a raid: each change edits the post and says a line in it. */
@@ -58,11 +59,11 @@ export async function answerRaidChange(
   said: (party: RaidParty) => string,
   same: string,
 ): Promise<void> {
-  if (outcome.kind === 'gone') throw new UserError(PARTY_OVER);
+  if (outcome.kind === 'gone') throw new UserError(partyOver({ type: 'raid' }));
   if (outcome.kind === 'refused') {
     const post = outcome.other?.forumPostId;
     throw new UserError(
-      problemText(outcome.reason, ctx.attendance.limits()) +
+      problemText(outcome.reason, ctx.attendance.limits(), 'raid') +
         (post ? ` Its post is <#${post}>.` : ''),
     );
   }
@@ -106,47 +107,70 @@ export async function changeTime(
   );
 }
 
-function timeCommand(
-  name: 'hatch' | 'end',
-  description: string,
-  option: string,
-  details: string,
-): SimpleCommand {
-  return {
-    data: new SlashCommandBuilder()
-      .setName(name)
-      .setDescription(description)
-      .addStringOption((o) =>
-        o.setName('time').setDescription(option).setRequired(true).setMaxLength(40),
-      ),
-    help: {
-      category: 'raid-crud',
-      details: `${details} ${IN_A_RAID_POST}`,
-      examples: [`/${name} time:20`, `/${name} time:6:15pm`],
-    },
-    guards: [requireRaid],
-    throttle: CHANGE_THROTTLE,
-    async execute(interaction, ctx) {
-      const party = commandRaid(interaction, ctx);
-      await changeTime(interaction, ctx, party, name, interaction.options.getString('time', true));
-    },
-  };
-}
-
-export const hatch = timeCommand(
-  'hatch',
-  'Set when the egg of this raid hatches',
-  'Minutes from now (20) or a clock time (6:15pm)',
-  'Sets the hatch time; the end follows from it. Give the minutes from now or a clock time.',
-);
+export const hatch: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('hatch')
+    .setDescription('Set when the egg of this raid hatches')
+    .addStringOption((o) =>
+      o
+        .setName('time')
+        .setDescription('Minutes from now (20) or a clock time (6:15pm)')
+        .setRequired(true)
+        .setMaxLength(40),
+    ),
+  help: {
+    category: 'raid-crud',
+    details:
+      'Sets the hatch time; the end follows from it. Give the minutes from now or a clock time. ' +
+      IN_A_RAID_POST,
+    examples: ['/hatch time:20', '/hatch time:6:15pm'],
+  },
+  guards: [requireRaid],
+  throttle: CHANGE_THROTTLE,
+  async execute(interaction, ctx) {
+    const party = commandRaid(interaction, ctx);
+    await changeTime(interaction, ctx, party, 'hatch', interaction.options.getString('time', true));
+  },
+};
 
-export const end = timeCommand(
-  'end',
-  'Set when this raid ends',
-  'Minutes from now (20) or a clock time (6:15pm)',
-  'Sets the end time; the hatch time follows from it. Give the minutes that are left or a ' +
-    'clock time.',
-);
+/**
+ * `/end`: when a raid ends (its hatch time follows), or when a meetup ends. In a meetup anybody
+ * in the post may set it, and `none` removes it (`changeEnd`).
+ */
+export const end: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('end')
+    .setDescription('Set when this raid or meetup ends')
+    .addStringOption((o) =>
+      o
+        .setName('time')
+        .setDescription(
+          'Raid: minutes left (20) or a time (6:15pm). Meetup: 6:15pm, 10-17 6:15pm, in 90, none',
+        )
+        .setRequired(true)
+        .setMaxLength(40),
+    ),
+  help: {
+    category: 'raid-crud',
+    details:
+      'In the post of a raid: sets the end time; the hatch time follows from it. Give the ' +
+      'minutes that are left or a clock time. In the post of a meetup: sets when it ends. Give ' +
+      'a clock time, a date and a time, or `in 90` for minutes from now (a bare number is an ' +
+      'hour there); `none` removes the end. A time without a date is read on the day the ' +
+      "meetup starts, or on today's date; a date comes first, month-day (`10-14 9pm`). A " +
+      'meetup without an end is taken to be over a day after it started; one without any time ' +
+      'is archived a day after it was made, or after its last time was removed.',
+    examples: ['/end time:20', '/end time:6:15pm', '/end time:10-17 9pm', '/end time:none'],
+  },
+  guards: [requireParty],
+  throttle: CHANGE_THROTTLE,
+  async execute(interaction, ctx) {
+    const party = commandParty(interaction, ctx);
+    const text = interaction.options.getString('time', true);
+    if (isTimed(party)) await changeEnd(interaction, ctx, party, text);
+    else await changeTime(interaction, ctx, party, 'end', text);
+  },
+};
 
 export const duration: SimpleCommand = {
   data: new SlashCommandBuilder()
```

Apply to `src/commands/raids/location.ts`:

```diff
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -13,7 +13,7 @@ import { blocksNewRaid, raidKindOf } from '../../domain/party/raid.js';
 import { problemText } from '../../render/activity.js';
 import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
-import { commandRaid, PARTY_OVER } from '../parties/reply.js';
+import { commandRaid, partyOver } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
 import { gymChoices, reportedGym } from './raid-input.js';
 
@@ -99,7 +99,7 @@ export const location: SimpleCommand = {
     if (other && other.id !== party.id) {
       const post = other.forumPostId;
       throw new UserError(
-        problemText('gym-taken', ctx.attendance.limits()) +
+        problemText('gym-taken', ctx.attendance.limits(), 'raid') +
           (post ? ` Its post is <#${post}>.` : ''),
       );
     }
@@ -191,11 +191,11 @@ export const locationControls: ComponentHandler = {
     }
     if (answered) return;
     if (outcome.kind === 'gone') {
-      await say(PARTY_OVER);
+      await say(partyOver({ type: 'raid' }));
     } else if (outcome.kind === 'refused') {
       const post = outcome.other?.forumPostId;
       await say(
-        `${NOT_MOVED} ${problemText(outcome.reason, ctx.attendance.limits())}` +
+        `${NOT_MOVED} ${problemText(outcome.reason, ctx.attendance.limits(), 'raid')}` +
           (post ? ` Its post is <#${post}>.` : ''),
       );
     } else {
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -365,7 +365,7 @@ function gymLabel(gym: Gym, region: string | undefined): string {
  * `between <t> and <t>`: the range a time must lie in, with the day only when an end of it is
  * not within half a day of now (an EX or elite raid).
  */
-function between(first: number, last: number, now: number): string {
+export function between(first: number, last: number, now: number): string {
   const style = isFarOff(first, now) || isFarOff(last, now) ? 'f' : 't';
   return `between ${timestamp(first, style)} and ${timestamp(last, style)}`;
 }
```

Apply to `src/components/party.ts`:

```diff
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -4,8 +4,9 @@ import {
   actingMember,
   answerClick,
   doneWords,
+  leftWords,
   moreWords,
-  PARTY_OVER,
+  partyOver,
   remoteWords,
 } from '../commands/parties/reply.js';
 import { changeTime, timesAlready } from '../commands/raids/change.js';
@@ -14,7 +15,7 @@ import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
 import { managementRoleIds, notARaid, partyOf, requireGuild } from '../discord/guards.js';
 import { STALE_COMPONENT } from '../discord/router.js';
-import { isGroupId, isRaid } from '../domain/party/party.js';
+import { isGroupId, isRaid, partyWord } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { raidStage } from '../domain/party/raid.js';
 import {
@@ -27,10 +28,11 @@ import {
 
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
- * question, and the "Set time" button of a raid without times with the form it opens. The party is named by the custom id, not by the channel, so the same controls work
- * on a copy of the message in another channel. Every click is answered privately, a burst of
- * clicks by one member with one answer (`answerClick`); what it changed is said in the post by
- * the attendance service.
+ * question, and the "Set time" button of a raid without times with the form it opens. The party
+ * is named by the custom id, not by the channel, so the same controls work on a copy of the
+ * message in another channel. Every click is answered privately, a burst of clicks by one
+ * member with one answer (`answerClick`); what it changed is said in the post by the attendance
+ * service.
  *
  * The throttle is one budget for all of them: generous for somebody adjusting a head count,
  * tight for somebody leaning on a button. It also holds back an answer to the completion
@@ -82,7 +84,7 @@ export const partyButtons: ComponentHandler = {
           ctx,
           partyId,
           await attendance.leave(partyId, member),
-          () => 'You have left this raid.',
+          leftWords,
         );
       case 'less':
         return answerClick(
@@ -119,8 +121,8 @@ export const partyButtons: ComponentHandler = {
       }
       case 'time': {
         const party = ctx.parties.get(partyId);
-        if (!party) throw new UserError(PARTY_OVER);
         // Only the post of a raid has this button.
+        if (!party) throw new UserError(partyOver({ type: 'raid' }));
         if (!isRaid(party)) throw new UserError(notARaid(party));
         if (party.hatchTime !== null) throw new UserError(timesAlready(party));
         if (raidStage(party, Date.now()) === 'ended') throw new UserError(RAID_IS_OVER);
@@ -153,9 +155,11 @@ export const partyButtons: ComponentHandler = {
     if (id.action === 'delete') {
       // The form opens only in the raid's own post, and its answer belongs there: a custom id
       // can be sent from anywhere, for any party.
-      if (partyOf(interaction, ctx)?.id !== id.id) throw new UserError(STALE_COMPONENT);
+      const here = partyOf(interaction, ctx);
+      if (here?.id !== id.id) throw new UserError(STALE_COMPONENT);
+      const word = partyWord(here);
       const reason = interaction.fields.getTextInputValue(DELETE_REASON_INPUT).trim();
-      if (reason === '') throw new UserError('Say why the raid should be deleted.');
+      if (reason === '') throw new UserError(`Say why the ${word} should be deleted.`);
       // Acknowledged first: the request is a message to Discord, which can take its time.
       await interaction.deferReply({ flags: MessageFlags.Ephemeral });
       const roles = managementRoleIds(interaction);
@@ -165,11 +169,11 @@ export const partyButtons: ComponentHandler = {
         reason,
         roles,
       );
-      if (asked === 'gone') throw new UserError(PARTY_OVER);
+      if (asked === 'gone') throw new UserError(partyOver(here));
       await interaction.editReply({
         content:
           asked === 'already'
-            ? 'You have already asked the moderators to delete this raid.'
+            ? `You have already asked the moderators to delete this ${word}.`
             : 'I have put your request into the post, for the moderators.',
       });
       return;
@@ -179,7 +183,7 @@ export const partyButtons: ComponentHandler = {
       throw new UserError(STALE_COMPONENT);
     }
     const party = ctx.parties.get(id.id);
-    if (!party) throw new UserError(PARTY_OVER);
+    if (!party) throw new UserError(partyOver({ type: 'raid' }));
     if (!isRaid(party)) throw new UserError(notARaid(party));
     // Somebody else set the time while the form was open: theirs stands, corrections are
     // deliberate (`/hatch`, `/end`).
```

Apply to `src/discord/command.ts`:

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -48,8 +48,15 @@ export interface CommandHandler {
   defer?:
     | Deferral
     | ((interaction: ChatInputCommandInteraction, ctx: AppContext) => Deferral | undefined);
-  /** How often one member may use this. A use counts once the guards have let it through. */
-  throttle?: Throttle;
+  /**
+   * How often one member may use this. A use counts once the guards have let it through. A
+   * function, asked after the guards, for a command whose uses cost more in one place than in
+   * another (`/meet` pings a group in a raid and everybody in a meetup); each limit it gives
+   * is counted by itself.
+   */
+  throttle?:
+    | Throttle
+    | ((interaction: ChatInputCommandInteraction, ctx: AppContext) => Throttle | undefined);
   execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
   autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void>;
 }
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -144,6 +144,9 @@ export function partyOf(interaction: LocatedInteraction, ctx: AppContext): Party
   return channelId === null ? undefined : ctx.parties.byPost(channelId);
 }
 
+/** What a member is told who uses a command for the post of a party anywhere else. */
+export const IN_A_PARTY_POST = 'Use this in the post of a raid or meetup that is still active.';
+
 /**
  * For commands that act on the party of the post they are used in. The guard does not hand the
  * party on, so a handler asks `partyOf` again and must cope with undefined: the party can end
@@ -151,9 +154,7 @@ export function partyOf(interaction: LocatedInteraction, ctx: AppContext): Party
  */
 export const requireParty: Guard = (interaction, ctx) => {
   assertGuild(interaction);
-  if (!partyOf(interaction, ctx)) {
-    throw new UserError('Use this in the post of a raid that is still active.');
-  }
+  if (!partyOf(interaction, ctx)) throw new UserError(IN_A_PARTY_POST);
 };
 
 /** What a member is told who uses something that is for raids in the post of another party. */
```

Apply to `src/discord/router.ts`:

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -108,8 +108,15 @@ export class InteractionRouter {
       }
       const { handler, name } = found;
       await runGuards(found.guards, interaction, this.ctx);
-      if (handler.throttle) {
-        const wait = this.throttles.use(name, interaction.user.id, handler.throttle, this.now());
+      const varies = typeof handler.throttle === 'function';
+      const throttle =
+        typeof handler.throttle === 'function'
+          ? handler.throttle(interaction, this.ctx)
+          : handler.throttle;
+      if (throttle) {
+        // The limits of a command that has several are counted apart, each under what it is.
+        const counted = varies ? `${name}\n${throttle.perSeconds}/${throttle.uses}` : name;
+        const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
         if (wait !== undefined) {
           throw new UserError(`You can use /${name} again in ${waitText(wait)}.`);
         }
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -88,7 +88,7 @@ export function standingLine(
 export function problemText(
   reason: PartyProblem,
   limits: { maxNumber: number },
-  word = 'raid',
+  word: string,
 ): string {
   switch (reason) {
     case 'not-attending':
```

Apply to `src/render/party-controls.ts`:

```diff
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -47,6 +47,14 @@ export function isPartyAction(value: string): value is PartyAction {
   return (PARTY_ACTIONS as readonly string[]).includes(value);
 }
 
+/** The actions that only the controls of a raid have: no other post shows them. */
+const RAID_ACTIONS: readonly PartyAction[] = ['done', 'group', 'answer', 'time'];
+
+/** Whether a control with this action can only have been a raid's. */
+export function isRaidAction(value: string): boolean {
+  return (RAID_ACTIONS as readonly string[]).includes(value);
+}
+
 /** Discord allows this many characters on a button. */
 const BUTTON_LABEL = 80;
 /** The names of a completion question are cut so that the whole message stays well under 2,000. */
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -27,6 +27,7 @@ import {
   groupOf,
   MAX_COMPLETION_PROMPTS,
   membersWhere,
+  partyWord,
   refused,
   type Attendee,
   type Change,
@@ -337,7 +338,7 @@ export class AttendanceService {
     // A message into the post of a party that has ended would open an archived post again.
     if (!store.get(partyId)) return { kind: 'gone' };
     const message = withMentions(
-      `<@${member.id}> to everybody in this raid:\n> ${plain(text)}`,
+      `<@${member.id}> to everybody in this ${partyWord(party)}:\n> ${plain(text)}`,
       pingable,
     );
     if ((await gateway.sendMessage(postId, message)) === undefined) return { kind: 'gone' };
```

Create `src/services/timed-party-service.ts`:

```ts
import type { UserSettings } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { noteMember } from '../domain/party/attendance.js';
import {
  isTimed,
  membersWhere,
  partyWord,
  type Change,
  type PartyProblem,
  type TimedParty,
} from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { setStartTime, setTimedEnd, startTimeOf } from '../domain/party/timed.js';
import type { Logger } from '../log.js';
import { clockOrDate, LIMITS, timestamp, withMentions } from '../render/text.js';
import type { Member } from './attendance-service.js';
import { KeyedLock } from './keyed-lock.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';

/**
 * What came of a change to a timed party. `gone`: there is no such active party of that kind (a
 * raid is none). `refused`: the party stays as it was. `ok`: the party as it is stored now;
 * `changed` is false when it already was so.
 */
export type TimedChangeOutcome<Extra = unknown> =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem }
  | ({ kind: 'ok'; party: TimedParty; changed: boolean } & Extra);

export interface TimedPartyServiceOptions {
  store: PartyStore;
  gateway: Pick<PartyGateway, 'sendMessage'>;
  /** Told after every stored change, to bring the post and the summary up to date. */
  posts: { changed(partyId: string): void };
  /** Where the lines go that ping nobody. */
  lines: Pick<PartyLines, 'say'>;
  /** The members' settings: who lets the bot ping them. */
  users: { get(snowflake: string): Promise<UserSettings> };
  log: Logger;
  now?: () => number;
  /**
   * How long after the last change of a party's start the others are told. Default five
   * seconds: a member who corrects what they typed is one message, with one ping.
   */
  announceDelayMs?: number;
}

/** A start whose announcement is waiting: what it was before, and who changed it last. */
interface PendingStart {
  before: number | null;
  by: string;
  cancel: () => void;
}

/**
 * What members change about a party that has a name and times of its own: a meetup, and a train
 * from plan 3B (`TimedParty`). It is to such a party what `RaidChangeService` is to a raid: every
 * method decides inside the store, has the post shown anew and says in the post who changed
 * what; the caller tells the member privately.
 *
 * A new start time is the one thing that pings: it is said in a message of its own to everybody
 * else who is signed up and allows it, as the meeting time of a group is in a raid. That message
 * is gathered: it goes out a few seconds after the last change, with the start as the store has
 * it then, so two quick changes are one ping, and the messages of one party never overtake each
 * other. Everything else is a line that pings nobody.
 */
export class TimedPartyService {
  private readonly now: () => number;
  /** The starts whose announcement is waiting for its delay, by party. */
  private readonly waiting = new Map<string, PendingStart>();
  /** The announcements of one party go out one after the other. */
  private readonly chain = new KeyedLock<string>();
  /** Announcements on their way; `flush` waits for them. */
  private readonly background = new Set<Promise<void>>();

  constructor(private readonly options: TimedPartyServiceOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** A time as a line names it: with its date when it is far off, and how long until then. */
  private when(time: number): string {
    return `${clockOrDate(time, this.now())} (${timestamp(time, 'R')})`;
  }

  /**
   * When the party starts, for everybody, or no start any more with null. Only for a member who
   * is signed up (`not-attending`); refused when it would not lie before the end. `others` are
   * the members who will be told. The caller has checked the time (`typedTimedTime`).
   */
  async setStartTime(
    partyId: string,
    member: Member,
    time: number | null,
  ): Promise<TimedChangeOutcome<{ others: string[] }>> {
    let before: number | null = null;
    const outcome = await this.apply(partyId, member, (party, now) => {
      before = startTimeOf(party);
      return setStartTime(party, member.id, time, now);
    });
    if (outcome.kind === 'ok' && outcome.changed) this.announceLater(partyId, before, member.id);
    return outcome;
  }

  /**
   * When the party ends, or no end any more with null. Anybody in the post may (as with the
   * legacy bot); refused when it would not lie after the start. The caller has checked the time.
   */
  setEndTime(partyId: string, member: Member, time: number | null): Promise<TimedChangeOutcome> {
    return this.apply(
      partyId,
      member,
      (party, now) => setTimedEnd(party, time, now),
      (party) =>
        party.endTime === null
          ? `<@${member.id}> removed the end time of this ${partyWord(party)}.`
          : `<@${member.id}> set the end of this ${partyWord(party)}: ${this.when(party.endTime)}.`,
    );
  }

  /**
   * Has the others told about the start of a party, once it has stood for `announceDelayMs`.
   * A change that comes sooner starts the wait anew; `before` stays the start as it was before
   * the first of them, so that a start that was put back is not announced at all.
   */
  private announceLater(partyId: string, before: number | null, by: string): void {
    const earlier = this.waiting.get(partyId);
    earlier?.cancel();
    const timer = setTimeout(() => {
      this.announceNow(partyId);
    }, this.options.announceDelayMs ?? 5_000);
    timer.unref();
    this.waiting.set(partyId, {
      before: earlier ? earlier.before : before,
      by,
      cancel: () => {
        clearTimeout(timer);
      },
    });
  }

  /** Sends the announcement that is waiting for a party, after those of it that are on their way. */
  private announceNow(partyId: string): void {
    const pending = this.waiting.get(partyId);
    if (!pending) return;
    pending.cancel();
    this.waiting.delete(partyId);
    const run = this.chain
      .run(partyId, () => this.announceStart(partyId, pending.before, pending.by))
      .catch((err: unknown) => {
        this.options.log.warn({ err, party: partyId }, 'could not announce a start time');
      })
      .finally(() => this.background.delete(run));
    this.background.add(run);
  }

  /**
   * Says the start a party has now, or that it has none any more, to everybody else who is
   * signed up; nothing when the start is what it was before the changes that led here.
   */
  private async announceStart(partyId: string, before: number | null, by: string): Promise<void> {
    const { store, gateway, users } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId ?? null;
    if (!party || !isTimed(party) || postId === null) return;
    const start = startTimeOf(party);
    if (start === before) return;
    const word = partyWord(party);
    const said =
      start === null
        ? `<@${by}> removed the start time of this ${word}.`
        : `<@${by}> set the start of this ${word}: ${this.when(start)}.`;
    const others = membersWhere(
      party,
      (attendee, id) => id !== by && attendee.status !== PartyStatus.Complete,
    );
    const settings = await Promise.all(others.map((id) => users.get(id).catch(() => undefined)));
    // The setting of a raid's meeting times: it is the same kind of news.
    const pingable = others
      .filter((_id, index) => {
        const found = settings[index];
        return found !== undefined && found.mentions && found.mentionsGroups;
      })
      .slice(0, LIMITS.pings);
    // A message into the post of a party that has ended would open an archived post again.
    if (!store.get(partyId)) return;
    await gateway.sendMessage(postId, withMentions(said, pingable));
  }

  /**
   * Runs one change. The member's name and team are noted with it when they are signed up.
   * `line` is said in the post, pinging nobody, when the change was stored.
   */
  private async apply<Extra>(
    partyId: string,
    member: Member,
    change: (party: TimedParty, now: number) => Change<TimedParty, Extra>,
    line?: (party: TimedParty) => string | undefined,
  ): Promise<TimedChangeOutcome<Extra>> {
    const { store, posts, lines } = this.options;
    type Decision = Change<TimedParty, Extra> | { ok?: undefined; party?: undefined };
    const result = await store.update(partyId, (party): Decision => {
      // A raid is no timed party: there is no such party.
      if (!isTimed(party)) return {};
      const changed = change(party, this.now());
      if (!changed.ok || changed.party === party) return changed;
      return { ...changed, party: noteMember(changed.party, member.id, member) };
    });
    if (result?.ok === undefined) return { kind: 'gone' };
    if (!result.ok) return { kind: 'refused', reason: result.reason };
    const { party } = result;
    if (result.written) {
      posts.changed(partyId);
      const text = line?.(party);
      if (text !== undefined && party.forumPostId !== null) lines.say(party.forumPostId, text);
    }
    const { ok: _ok, written: _written, ...rest } = result;
    return { ...(rest as unknown as Extra), kind: 'ok', party, changed: result.written };
  }

  /**
   * Sends the announcements that are waiting without waiting for their delay, and waits for
   * what is on its way. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    for (const partyId of [...this.waiting.keys()]) this.announceNow(partyId);
    while (this.background.size > 0) await Promise.all(this.background);
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts src/commands/parties/attendance.test.ts src/commands/parties/delete.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/shout.test.ts src/commands/parties/status.test.ts src/components/party.test.ts src/discord/guards.test.ts src/discord/router.test.ts src/render/activity.test.ts src/services/timed-party-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/services/party-lifecycle.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/services/party-lifecycle.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff ee6f26b -- src test   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/commands/admin/save-party.test.ts src/commands/admin/save-party.ts src/commands/index.ts src/commands/parties/attendance.test.ts src/commands/parties/attendance.ts src/commands/parties/delete.test.ts src/commands/parties/delete.ts src/commands/parties/group.ts src/commands/parties/in-meetup.test.ts src/commands/parties/meet.ts src/commands/parties/reply.ts src/commands/parties/shout.test.ts src/commands/parties/shout.ts src/commands/parties/status.test.ts src/commands/parties/status.ts src/commands/parties/timed.ts src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/location.ts src/commands/raids/raid-input.ts src/components/party.test.ts src/components/party.ts src/discord/command.ts src/discord/guards.test.ts src/discord/guards.ts src/discord/router.test.ts src/discord/router.ts src/render/activity.test.ts src/render/activity.ts src/render/party-controls.ts src/services/attendance-service.ts src/services/party-lifecycle.db.test.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts test/support/party-service.ts test/support/test-context.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/commands/admin/save-party.test.ts src/commands/admin/save-party.ts src/commands/index.ts src/commands/parties/attendance.test.ts src/commands/parties/attendance.ts src/commands/parties/delete.test.ts src/commands/parties/delete.ts src/commands/parties/group.ts src/commands/parties/in-meetup.test.ts src/commands/parties/meet.ts src/commands/parties/reply.ts src/commands/parties/shout.test.ts src/commands/parties/shout.ts src/commands/parties/status.test.ts src/commands/parties/status.ts src/commands/parties/timed.ts src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/location.ts src/commands/raids/raid-input.ts src/components/party.test.ts src/components/party.ts src/discord/command.ts src/discord/guards.test.ts src/discord/guards.ts src/discord/router.test.ts src/discord/router.ts src/render/activity.test.ts src/render/activity.ts src/render/party-controls.ts src/services/attendance-service.ts src/services/party-lifecycle.db.test.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts test/support/party-service.ts test/support/test-context.ts
git commit -m "The existing commands and controls in a meetup: its times, done as leave, and no sentence that says \"raid\"" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,219 unit tests.

---

### Task 8: The new commands: meetup, name and info

**Files:**
- Create: `src/commands/meetups/info.ts`, `src/commands/meetups/meetup.test.ts`, `src/commands/meetups/meetup.ts`, `src/commands/meetups/name-info.test.ts`, `src/commands/parties/name.ts`
- Modify: `src/app-context.ts`, `src/commands/index.ts`, `src/commands/parties/in-meetup.test.ts`, `src/commands/parties/reply.ts`, `src/commands/util/help-render.test.ts`, `src/components/index.ts`, `src/discord/guards.ts`, `src/domain/party/party.ts`, `src/services/party-service.ts`, `src/services/timed-party-service.test.ts`, `src/services/timed-party-service.ts`

**Interfaces:**
- Consumes: `PartyService.createMeetup`, `TimedPartyService`, `setName` and `setDescription` of the domain, `regionChannelOf`, the custom ids (`src/discord/custom-id.ts`), the fake interactions (`fakeModal`).
- Produces: `/meetup name` (`src/commands/meetups/meetup.ts`, with a guard that refuses beforehand what can be known), `/name name` (`src/commands/parties/name.ts`, for a party that has a name), `/info` with its form (`src/commands/meetups/info.ts`: `infoForm`, `infoControls`, kind `info`); `TimedPartyService.setName` and `setDescription`; the guards `requireTimed` and `requireMeetup`, `commandTimed`, `commandMeetup`; the three commands in `src/commands/index.ts` and the form in `src/components/index.ts`; help under the category `meetup`.

`A_TIMED_PARTY` in `guards.ts` is the one place where 3B adds the train to the sentence of `requireTimed`.

Reference commit of the prototype for this task: `fb5ea2b`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/meetups/meetup.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { ALICE, BOB, testRaid } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { AppContext } from '../../app-context.js';
import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { commands } from '../index.js';
import { FROM_A_REGION, meetup, MEETUP_THROTTLE } from './meetup.js';

const RAID_POST = '300000000000000055';

async function setup(overrides: Partial<AppContext> = {}) {
  const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
  const made = await partyServiceWith([raid]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
    ...overrides,
  });
  const router = new InteractionRouter(ctx, [meetup], []);
  /** `/meetup` by Alice, in the channel of West unless `extra` says otherwise. */
  const run = async (name: string, extra: object = {}): Promise<FakeInteraction> => {
    const interaction = fakeChatInput({
      commandName: 'meetup',
      channelId: WEST_CHANNEL,
      userId: ALICE,
      displayName: 'Alice',
      roleNames: ['Mystic'],
      options: { name },
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was told: the edit of the deferred answer, or what came in its place. */
  const answer = async (name: string, extra: object = {}): Promise<string | undefined> => {
    const used = await run(name, extra);
    for (const responder of [used.editReply, used.followUp, used.reply]) {
      if (responder.mock.calls.length > 0) return sent(responder).content;
    }
    return undefined;
  };
  const meetups = () => made.store.active().filter((party) => party.type === 'meetup');
  return { ...made, ctx, run, answer, meetups };
}

describe('/meetup', () => {
  it('makes a meetup with its post in the forum of the region, and links to it privately', async () => {
    const made = await setup();
    const used = await made.run('  Community Day   picnic ');
    const [party] = made.meetups();
    expect(party).toMatchObject({
      type: 'meetup',
      regionId: 1,
      forumChannelId: WEST_FORUM,
      createdById: ALICE,
      anonymous: false,
      timed: { name: 'Community Day picnic', startTime: null },
      meetup: { description: null },
    });
    // Who made it is interested, whatever their automatic status for raids.
    expect(party?.attendees).toEqual({
      [ALICE]: {
        number: 1,
        status: PartyStatus.Interested,
        group: 'A',
        remote: false,
        name: 'Alice',
        team: 'mystic',
      },
    });
    const postId = party?.forumPostId ?? '';
    expect(made.gateway.posts.get(postId)).toMatchObject({
      forumId: WEST_FORUM,
      title: 'Meetup · Community Day picnic',
    });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply).content).toBe(
      `Your meetup is made. Its post is <#${postId}>. There, \`/meet\` sets when it starts, ` +
        '`/end` when it ends, and `/info` what else there is to know.',
    );
    expect(made.gateway.messagesIn(WEST_CHANNEL).map((message) => message.message.content)).toEqual(
      [`New meetup: <#${postId}>`],
    );
  });

  it('works in a post of the forum that is no party, and the meetup belongs to that region', async () => {
    const made = await setup();
    // The pinned list of the forum of East, say: a thread whose parent is that forum.
    await made.run('Trade evening', {
      channelId: '300000000000000066',
      thread: { parentId: EAST_FORUM },
    });
    expect(made.meetups()[0]).toMatchObject({ regionId: 2, forumChannelId: EAST_FORUM });
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
  });

  it('is refused in the post of a party and anywhere that is no region', async () => {
    const made = await setup();
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('Picnic', inPost)).toBe(FROM_A_REGION);
    expect(await made.answer('Picnic', { channelId: '600000000000000009' })).toBe(FROM_A_REGION);
    expect(FROM_A_REGION).toBe('Create a meetup from a region channel.');
    expect(await made.answer('Picnic', { isDm: true })).toBe('This only works in a server.');
    expect(made.meetups()).toEqual([]);
  });

  it('says so when the region has no forum yet', async () => {
    const made = await setup();
    // The region without an outline has no forum; it is a region for the directory of gyms
    // only when gyms lie in it, so the channel is made one here.
    const gyms = { ...made.ctx.gyms, isRegion: (id: string) => id === UNBOUNDED_CHANNEL };
    const other = await setup({ gyms });
    // As often as it is tried: a use that is refused here is not counted.
    for (let n = 0; n < 3; n++) {
      expect(await other.answer('Picnic', { channelId: UNBOUNDED_CHANNEL })).toBe(
        `The region <#${UNBOUNDED_CHANNEL}> has no forum yet. ` +
          'A moderator can create it with `/admin setup-forums`.',
      );
    }
    expect(other.meetups()).toEqual([]);
  });

  it('refuses a name of nothing but white space, and one that is too long', async () => {
    const made = await setup();
    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('x'.repeat(81))).toBe('Give a name of 1 to 80 characters.');
    expect(made.meetups()).toEqual([]);
  });

  it('takes two meetups with one name: nothing keeps them apart', async () => {
    const made = await setup();
    await made.run('Picnic');
    await made.run('Picnic', { userId: BOB });
    // Both were made in the same moment, so their order is that of their ids.
    const makers = made.meetups().map((party) => party.createdById);
    expect(makers.sort()).toEqual([ALICE, BOB]);
    expect(new Set(made.meetups().map((party) => party.forumPostId)).size).toBe(2);
  });

  it('names who made it, whatever they chose for the raids they report', async () => {
    const users = {
      get: (snowflake: string) =>
        Promise.resolve({
          snowflake,
          ...DEFAULT_USER_SETTINGS,
          autoStatus: PartyStatus.Present,
          raidPrivacy: RaidPrivacy.Anonymous,
        }),
    };
    const made = await setup({ users });
    await made.run('Picnic');
    const [party] = made.meetups();
    expect(party?.anonymous).toBe(false);
    expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(post?.message.embeds?.[0]?.description?.split('\n')[2]).toBe(`Created by <@${ALICE}>.`);
  });

  it('lets a member make two in a quarter of an hour, as the legacy bot did', async () => {
    const made = await setup();
    expect(MEETUP_THROTTLE).toEqual({ uses: 2, perSeconds: 900 });
    await made.run('First');
    await made.run('Second');
    expect(await made.answer('Third')).toMatch(/^You can use \/meetup again in 1\d minutes\.$/);
    expect(made.meetups()).toHaveLength(2);
    // Another member is not held back.
    await made.run('Fourth', { userId: BOB });
    expect(made.meetups()).toHaveLength(3);
  });

  it('does not count a use that made nothing: what can be known beforehand is refused first', async () => {
    const made = await setup();
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('x'.repeat(81))).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('Picnic', inPost)).toBe(FROM_A_REGION);
    // None of them was acknowledged as a use that takes its time, and none was counted.
    await made.run('First');
    await made.run('Second');
    expect(made.meetups()).toHaveLength(2);
    expect(await made.answer('Third')).toMatch(/^You can use \/meetup again/);
  });

  it('refuses a name of nothing that can be seen', async () => {
    const made = await setup();
    expect(await made.answer('\u200b\u200b')).toBe('Give a name of 1 to 80 characters.');
    await made.run('\u202ePicnic');
    expect(made.meetups()[0]?.timed.name).toBe('Picnic');
  });

  it('is listed with the commands, under the meetups, with /name and /info', () => {
    const filed = commands.filter((command) => command.help.category === 'meetup');
    expect(filed.map((command) => command.data.name).sort()).toEqual(['info', 'meetup', 'name']);
    for (const command of filed) expect(command.help.details).toBeTruthy();
  });
});
```

Create `src/commands/meetups/name-info.test.ts`:

````ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, testRaid } from '../../../test/support/parties.js';
import { createdMeetup } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { components } from '../../components/index.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { name } from '../parties/name.js';
import { info, INFO_INPUT, INFO_KIND, infoControls, infoForm, refusedWithText } from './info.js';

const RAID_POST = '300000000000000055';
const NOT_A_MEETUP = 'This is the post of a raid: that only works in the post of a meetup.';
const NO_POST = 'Use this in the post of a meetup that is still active.';

/** The inputs of the one row of a form. */
function inputsOf(form: ReturnType<typeof infoForm>) {
  const rows = form.components as unknown as {
    components: { custom_id: string; value?: string; placeholder?: string }[];
  }[];
  return rows[0]?.components ?? [];
}

/** A meetup with its post, and beside it a raid that has one too. */
async function setup() {
  const made = await createdMeetup();
  const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
  await made.store.add(raid);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [name, info], [infoControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  const inRaid = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
  /** A command in the post of the meetup, by Alice unless `extra` says otherwise. */
  const run = (commandName: string, options: Record<string, string> = {}, extra: object = {}) =>
    handle(
      fakeChatInput({
        commandName,
        ...where,
        userId: ALICE,
        displayName: 'Alice',
        options,
        ...extra,
      }),
    );
  const answer = async (commandName: string, options?: Record<string, string>, extra?: object) =>
    sent((await run(commandName, options, extra)).reply).content;
  /** The form of `/info`, sent from the post of the meetup by Alice with this text. */
  const submit = (text: string, extra: object = {}) =>
    handle(
      fakeModal({
        customId: infoForm(made.current()).custom_id,
        userId: ALICE,
        displayName: 'Alice',
        fields: { [INFO_INPUT]: text },
        ...where,
        ...extra,
      }),
    );
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.timed.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const post = () => made.gateway.posts.get(made.postId);
  return { ...made, raid, ctx, handle, run, answer, submit, lines, post, where, inRaid };
}

describe('/name', () => {
  it('renames the meetup: the post says who did it, and its title follows', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '  Raid hour   meet ' })).toBe(
      'This meetup is now called **Raid hour meet**.',
    );
    expect(made.current().timed.name).toBe('Raid hour meet');
    expect(await made.lines()).toEqual([`<@${ALICE}> renamed this meetup: **Raid hour meet**.`]);
    expect(made.post()).toMatchObject({ title: 'Meetup · Raid hour meet', renames: 1 });
    expect(made.post()?.message.embeds?.[0]?.title).toBe('Raid hour meet');
    // Anybody in the post may: Alice is not signed up, and is not signed up by it.
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
  });

  it('answers privately, and says nothing for the name the meetup has', async () => {
    const made = await setup();
    const used = await made.run('name', { name: 'Community Day picnic' });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'This meetup is called **Community Day picnic** already.',
      flags: MessageFlags.Ephemeral,
    });
    expect(await made.lines()).toEqual([]);
    expect(made.post()?.renames).toBe(0);
  });

  it('makes the name plain where it is said, and keeps it as typed in the title', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '**Bold** @everyone' })).toBe(
      'This meetup is now called **\\*\\*Bold\\*\\* @\u200beveryone**.',
    );
    expect(await made.lines()).toEqual([
      `<@${ALICE}> renamed this meetup: **\\*\\*Bold\\*\\* @\u200beveryone**.`,
    ]);
    expect(made.post()?.title).toBe('Meetup · **Bold** @everyone');
  });

  it('refuses a text that is no name', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '   ' })).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('name', { name: 'x'.repeat(81) })).toBe(
      'Give a name of 1 to 80 characters.',
    );
    expect(made.current().timed.name).toBe('Community Day picnic');
  });

  it('keeps to the two renames Discord allows a post: the newest name shows later', async () => {
    const made = await setup();
    for (const next of ['One', 'Two', 'Three']) {
      await made.run('name', { name: next });
      await made.service.flush();
    }
    expect(made.current().timed.name).toBe('Three');
    expect(made.post()).toMatchObject({ title: 'Meetup · Two', renames: 2 });
    expect(made.post()?.message.embeds?.[0]?.title).toBe('Three');
    // Ten minutes on, the title catches up.
    made.clock.now += 10 * 60_000 + 1;
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(made.post()).toMatchObject({ title: 'Meetup · Three', renames: 3 });
  });

  it('is for the post of a meetup: not for a raid, and not for any other place', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: 'Picnic' }, made.inRaid)).toBe(NOT_A_MEETUP);
    expect(await made.answer('name', { name: 'Picnic' }, { channelId: WEST_CHANNEL })).toBe(
      NO_POST,
    );
    expect(made.store.get(made.raid.id)).toBe(made.raid);
    await made.service.end(made.party.id);
    expect(await made.answer('name', { name: 'Picnic' })).toBe(NO_POST);
  });
});

describe('/info', () => {
  it('opens a form with one paragraph, empty for a meetup nobody wrote about', async () => {
    const made = await setup();
    const used = await made.run('info');
    expect(used.reply).not.toHaveBeenCalled();
    expect(used.showModal).toHaveBeenCalledWith(infoForm(made.current()));
    const form = infoForm(made.current());
    expect(decodeCustomId(form.custom_id)).toEqual({
      kind: INFO_KIND,
      id: made.party.id,
      action: 'set',
      args: [],
    });
    expect(form.title.length).toBeLessThanOrEqual(45);
    expect(form.components).toHaveLength(1);
    const [input] = inputsOf(form);
    expect(input).toMatchObject({
      custom_id: INFO_INPUT,
      style: 2,
      required: false,
      max_length: 1000,
    });
    expect(input && 'value' in input).toBe(false);
    expect((input?.placeholder ?? '').length).toBeLessThanOrEqual(100);
  });

  it('shows what was sent in the post, says who changed it, and answers privately', async () => {
    const made = await setup();
    const sentForm = await made.submit('  Bring snacks.\n\nWe meet at the **fountain**. ');
    expect(sentForm.reply).toHaveBeenCalledWith({
      content: 'The post of this meetup shows what you wrote, under "Information".',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().meetup.description).toBe('Bring snacks.\n\nWe meet at the **fountain**.');
    expect(await made.lines()).toEqual([`<@${ALICE}> changed the information.`]);
    expect(made.post()?.message.embeds?.[0]?.description?.split('\n').slice(3)).toEqual([
      '',
      '**Information**',
      'Bring snacks.',
      '',
      'We meet at the \\*\\*fountain\\*\\*.',
    ]);
  });

  it('opens the form with the text as it is, for the next member to correct', async () => {
    const made = await setup();
    await made.submit('Bring snacks.');
    const used = await made.run('info', {}, { userId: BOB });
    expect(used.showModal).toHaveBeenCalledExactlyOnceWith(infoForm(made.current()));
    expect(inputsOf(infoForm(made.current()))[0]).toMatchObject({ value: 'Bring snacks.' });
  });

  it('removes the text when the form comes back empty, and says nothing when nothing changed', async () => {
    const made = await setup();
    expect(sent((await made.submit('  ')).reply).content).toBe(
      'Nothing changed: that is what the post says already.',
    );
    await made.submit('Bring snacks.');
    expect(sent((await made.submit('Bring snacks.  ')).reply).content).toBe(
      'Nothing changed: that is what the post says already.',
    );
    expect(sent((await made.submit(' \n ')).reply).content).toBe(
      'The post of this meetup has no information any more.',
    );
    expect(made.current().meetup.description).toBeNull();
    expect(await made.lines()).toEqual([
      `<@${ALICE}> changed the information.`,
      `<@${ALICE}> removed the information.`,
    ]);
    expect(made.post()?.message.embeds?.[0]?.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
  });

  it('is for anybody in the post, and signs nobody up', async () => {
    const made = await setup();
    await made.submit('Bring snacks.', { userId: BOB });
    expect(attendeeOf(made.current(), BOB)).toBeUndefined();
    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming);
    await made.submit('Bring more snacks.');
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ name: 'Alice' });
  });

  it('refuses a text that is too long, should one come past the form, and gives it back', async () => {
    const made = await setup();
    const long = `${'x'.repeat(990)} and the end`;
    const refusal = sent((await made.submit(long)).reply).content ?? '';
    expect(refusal).toBe(
      `That is too long: keep it to 1000 characters.\nWhat you wrote:\n\`\`\`\n${long}\n\`\`\``,
    );
    expect(made.current().meetup.description).toBeNull();
  });

  it('keeps a refusal within one message, and a code block typed into it from ending the block', () => {
    const cut = refusedWithText('No.', 'y'.repeat(3000));
    expect(cut.length).toBeLessThanOrEqual(2000);
    expect(cut.endsWith('…\n```')).toBe(true);
    const fenced = refusedWithText('No.', 'a ```js\ncode``` b');
    expect(fenced.match(/```/g)).toHaveLength(2);
    expect(refusedWithText('No.', '  ')).toBe('No.');
  });

  it('takes the form only from the post of that meetup', async () => {
    const made = await setup();
    const elsewhere = await made.submit('Elsewhere', {
      channelId: WEST_CHANNEL,
      thread: undefined,
    });
    expect(sent(elsewhere.reply).content).toBe(STALE_COMPONENT);
    const inRaid = await made.submit('In the raid', made.inRaid);
    expect(sent(inRaid.reply).content).toBe(STALE_COMPONENT);
    const other = await made.handle(
      fakeModal({
        customId: `${INFO_KIND}:${made.party.id}:other`,
        fields: { [INFO_INPUT]: 'x' },
        ...made.where,
      }),
    );
    expect(sent(other.reply).content).toBe(STALE_COMPONENT);
    expect(made.current().meetup.description).toBeNull();
  });

  it('says that the meetup is over when it ended while the form was open, and gives the text back', async () => {
    const made = await setup();
    const custom = infoForm(made.current()).custom_id;
    await made.service.end(made.party.id);
    const late = await made.handle(
      fakeModal({ customId: custom, fields: { [INFO_INPUT]: 'Bring snacks.' }, ...made.where }),
    );
    expect(sent(late.reply).content).toBe(
      'This meetup is over.\nWhat you wrote:\n```\nBring snacks.\n```',
    );
    // The same when its post is no longer in the cache.
    const uncached = await made.handle(
      fakeModal({
        customId: custom,
        fields: { [INFO_INPUT]: 'Bring snacks.' },
        channelId: made.postId,
        uncachedChannel: true,
      }),
    );
    expect(sent(uncached.reply).content).toMatch(/^This meetup is over\./);
  });

  it('is for the post of a meetup: not for a raid, and not for any other place', async () => {
    const made = await setup();
    const inRaid = await made.run('info', {}, made.inRaid);
    expect(inRaid.showModal).not.toHaveBeenCalled();
    expect(sent(inRaid.reply).content).toBe(NOT_A_MEETUP);
    expect(await made.answer('info', {}, { channelId: WEST_CHANNEL })).toBe(NO_POST);
  });

  it('has its form among the controls the router knows', () => {
    expect(components.map((handler) => handler.kind)).toContain(INFO_KIND);
    expect(new Set(components.map((handler) => handler.kind)).size).toBe(components.length);
  });
});
````

Apply to `src/commands/parties/in-meetup.test.ts`:

```diff
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -26,11 +26,14 @@ import { attendeeOf } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import { DELETE_REASON_INPUT, deletionForm } from '../../render/party-controls.js';
 import { admin } from '../admin/index.js';
+import { info, INFO_INPUT, infoControls, infoForm } from '../meetups/info.js';
+import { meetup } from '../meetups/meetup.js';
 import { end } from '../raids/change.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
 import { deleteParty } from './delete.js';
 import { group } from './group.js';
 import { cancelMeet, meet } from './meet.js';
+import { name } from './name.js';
 import { shout } from './shout.js';
 import { status, where } from './status.js';
 
@@ -51,6 +54,9 @@ const all: CommandModule[] = [
   where,
   shout,
   deleteParty,
+  name,
+  info,
+  meetup,
   admin,
 ];
 const HOUR = 60 * MINUTE;
@@ -78,7 +84,7 @@ async function setup() {
     parties: made.store,
     regions: made.regions,
   });
-  const router = new InteractionRouter(ctx, all, [partyButtons]);
+  const router = new InteractionRouter(ctx, all, [partyButtons, infoControls]);
   /** Everything a member was told in this test, to look for words that do not belong. */
   const told: string[] = [];
   const handle = async (interaction: FakeInteraction) => {
@@ -673,16 +679,43 @@ describe('what a member of a meetup is told', () => {
       ['admin', {}, staff],
       ['admin', { keep: false }, staff],
       ['done'],
-      ['delete', {}, { roleNames: ['Admin'] }],
+      ['name', { name: 'Evening picnic' }],
+      ['name', { name: 'Evening picnic' }],
+      ['name', { name: '   ' }],
+      ['meetup', { name: 'Another one' }],
+      ['meetup', { name: '   ' }],
     ];
-    for (const [name, options, extra] of tries) await made.run(name, options, extra);
+    for (const [command, options, extra] of tries) await made.run(command, options, extra);
+    // The form of `/info`: sent, sent again unchanged, and with more than it takes.
+    expect((await made.run('info')).showModal).toHaveBeenCalledOnce();
+    for (const text of ['Bring snacks.', 'Bring snacks.', 'x'.repeat(1001), '']) {
+      await made.handle(
+        fakeModal({
+          customId: infoForm(made.current()).custom_id,
+          userId: ALICE,
+          fields: { [INFO_INPUT]: text },
+          ...made.where,
+        }),
+      );
+    }
+    await made.run('delete', {}, { roleNames: ['Admin'] });
+    // A form that was still open when the meetup was closed.
+    await made.handle(
+      fakeModal({
+        customId: `info:${made.party.id}:set`,
+        userId: ALICE,
+        fields: { [INFO_INPUT]: 'Too late.' },
+        ...made.where,
+      }),
+    );
+    expect(made.told.at(-1)).toMatch(/^This meetup is over\./);
     for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'leave']) {
       // The meetup is closed by now: a control that is still on screen says so, without a
       // kind, since nothing remembers what kind of party it was.
       await made.click(action);
     }
     expect(made.told.slice(-7)).toEqual(Array.from({ length: 7 }, () => 'This has ended.'));
-    expect(made.told.length).toBeGreaterThanOrEqual(tries.length);
+    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 12);
     // "raid or meetup" is said where the kind does not matter; a raid alone never.
     const wrong = made.told.filter((text) => /raid(?! or meetup)/i.test(text));
     expect(wrong).toEqual([]);
```

Apply to `src/commands/util/help-render.test.ts`:

```diff
--- a/src/commands/util/help-render.test.ts
+++ b/src/commands/util/help-render.test.ts
@@ -128,6 +128,53 @@ describe('renderHelpOverview', () => {
     }
   });
 
+  it('still has room to describe every command of this bot, in every category', () => {
+    // A category that outgrows its field (1024 characters) falls back to names alone.
+    const { helpGroups } = loadSettings(TEST_SETTINGS_PATH);
+    const { fields = [] } = renderHelpOverview(commands, helpGroups, true).toJSON();
+    expect(fields.map((field) => field.name)).toEqual(
+      expect.arrayContaining(['Raid Basics', 'Raid Creation and Maintenance', 'Meetups']),
+    );
+    for (const field of fields) {
+      expect(field.value.length).toBeLessThanOrEqual(1024);
+      for (const line of field.value.split('\n')) expect(line).toMatch(/^`\/[a-z-]+` \S.*$/);
+    }
+    expect(fields.find((field) => field.name === 'Meetups')?.value.split('\n')).toEqual([
+      '`/info` Write what there is to know about this meetup, in a form',
+      '`/meetup` Create a meetup in this region, with a post of its own',
+      '`/name` Rename this meetup',
+    ]);
+  });
+
+  it('explains every command of this bot within what an embed holds', () => {
+    for (const command of commands) {
+      const json = renderCommandHelp(command).toJSON();
+      expect(json.title).toBe(`/${command.data.name}`);
+      expect((json.description ?? '').length).toBeLessThanOrEqual(4096);
+      for (const field of json.fields ?? []) expect(field.value.length).toBeLessThanOrEqual(1024);
+    }
+  });
+
+  it('explains the commands of a meetup: when it is archived, and how its times are read', () => {
+    const explained = (name: string): string => {
+      const command = commands.find((c) => c.data.name === name);
+      if (!command) throw new Error(`no command ${name}`);
+      const json = renderCommandHelp(command).toJSON();
+      expect(json.fields?.[0]).toMatchObject({ name: 'Usage' });
+      return json.description ?? '';
+    };
+    expect(explained('meetup')).toContain(
+      'a day after it was made, or after its last time was removed',
+    );
+    expect(explained('name')).toContain('renamed twice in ten minutes');
+    expect(explained('info')).toContain('A form opens with the text as it is now');
+    for (const name of ['meet', 'end']) {
+      expect(explained(name)).toContain('month-day');
+      expect(explained(name)).toContain("today's date");
+    }
+    expect(explained('end')).toContain('after its last time was removed');
+  });
+
   it('falls back to names only when descriptions would exceed what one embed holds', () => {
     const categories: HelpCategory[] = [
       'basic-raid',
```

Apply to `src/services/timed-party-service.test.ts`:

```diff
--- a/src/services/timed-party-service.test.ts
+++ b/src/services/timed-party-service.test.ts
@@ -217,6 +217,90 @@ describe('TimedPartyService.setEndTime', () => {
   });
 });
 
+describe('TimedPartyService.setName', () => {
+  it('renames the meetup, says who did it, and the title of the post follows', async () => {
+    const made = await withMembers();
+    // Carol is not signed up: anybody in the post may rename it.
+    const outcome = await made.timed.setName(made.party.id, carol, '  Raid hour   meet ');
+    expect(outcome).toMatchObject({
+      kind: 'ok',
+      changed: true,
+      party: { timed: { name: 'Raid hour meet' } },
+    });
+    await settled(made);
+    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
+      { content: `<@${CAROL}> renamed this meetup: **Raid hour meet**.` },
+    ]);
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({
+      title: 'Meetup · Raid hour meet',
+      renames: 1,
+    });
+    expect(made.service.summaryText(1)).toContain(`<#${made.postId}>`);
+  });
+
+  it('refuses a text that is no name, and does nothing for the name it has', async () => {
+    const made = await withMembers();
+    expect(await made.timed.setName(made.party.id, alice, '  ')).toEqual({
+      kind: 'refused',
+      reason: 'bad-name',
+    });
+    expect(await made.timed.setName(made.party.id, alice, 'x'.repeat(81))).toEqual({
+      kind: 'refused',
+      reason: 'bad-name',
+    });
+    const writes = made.storage.writes.length;
+    expect(await made.timed.setName(made.party.id, alice, ' Community Day  picnic ')).toMatchObject(
+      { kind: 'ok', changed: false },
+    );
+    await settled(made);
+    expect(made.storage.writes).toHaveLength(writes);
+    expect(made.said()).toEqual([]);
+    expect(made.gateway.posts.get(made.postId)?.renames).toBe(0);
+  });
+});
+
+describe('TimedPartyService.setDescription', () => {
+  it('sets what the post says about the meetup and says that it changed, not what to', async () => {
+    const made = await withMembers();
+    const outcome = await made.timed.setDescription(made.party.id, carol, ' Bring snacks.\n ');
+    expect(outcome).toMatchObject({
+      kind: 'ok',
+      changed: true,
+      party: { meetup: { description: 'Bring snacks.' } },
+    });
+    await settled(made);
+    expect(made.said()).toEqual([`<@${CAROL}> changed the information.`]);
+    expect(
+      made.gateway.posts
+        .get(made.postId)
+        ?.message.embeds?.[0]?.description?.endsWith('\n\n**Information**\nBring snacks.'),
+    ).toBe(true);
+  });
+
+  it('removes it with an empty text, refuses one that is too long, and knows no change', async () => {
+    const made = await withMembers();
+    expect(await made.timed.setDescription(made.party.id, alice, '')).toMatchObject({
+      kind: 'ok',
+      changed: false,
+    });
+    expect(await made.timed.setDescription(made.party.id, alice, 'x'.repeat(1001))).toEqual({
+      kind: 'refused',
+      reason: 'description-too-long',
+    });
+    await made.timed.setDescription(made.party.id, alice, 'Bring snacks.');
+    expect(await made.timed.setDescription(made.party.id, bob, '   ')).toMatchObject({
+      kind: 'ok',
+      changed: true,
+      party: { meetup: { description: null } },
+    });
+    await settled(made);
+    expect(made.said().join('\n').split('\n')).toEqual([
+      `<@${ALICE}> changed the information.`,
+      `<@${BOB}> removed the information.`,
+    ]);
+  });
+});
+
 describe('TimedPartyService: a party that is no meetup, or no more', () => {
   it('answers gone for a raid and leaves it alone', async () => {
     const made = await reportedRaid();
@@ -225,6 +309,8 @@ describe('TimedPartyService: a party that is no meetup, or no more', () => {
       kind: 'gone',
     });
     expect(await made.timed.setEndTime(made.party.id, alice, END)).toEqual({ kind: 'gone' });
+    expect(await made.timed.setName(made.party.id, alice, 'Picnic')).toEqual({ kind: 'gone' });
+    expect(await made.timed.setDescription(made.party.id, alice, 'x')).toEqual({ kind: 'gone' });
     expect(made.current()).toBe(before);
     await made.attendance.flush();
     expect(made.said()).toEqual([]);
```

Run: `npx vitest run --project unit src/commands/meetups/meetup.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/in-meetup.test.ts src/commands/util/help-render.test.ts src/services/timed-party-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -43,7 +43,7 @@ export interface AppContext {
   readonly attendance: AttendanceService;
   /** What members change about a raid itself: times, length, boss, moves, gym. */
   readonly raids: RaidChangeService;
-  /** What members change about a meetup (a train later): its start and its end. */
+  /** What members change about a meetup (a train later): its name, its times, what it says. */
   readonly timedParties: TimedPartyService;
   /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
   readonly clickAnswers: ClickAnswers;
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -1,9 +1,12 @@
 import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
+import { info } from './meetups/info.js';
+import { meetup } from './meetups/meetup.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
 import { group } from './parties/group.js';
 import { deleteParty } from './parties/delete.js';
 import { cancelMeet, meet } from './parties/meet.js';
+import { name } from './parties/name.js';
 import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
 import { boss, moveset } from './raids/boss.js';
@@ -16,6 +19,7 @@ import { help } from './util/help.js';
 export const commands: readonly CommandModule[] = [
   help,
   raid,
+  meetup,
   join,
   maybe,
   here,
@@ -37,5 +41,7 @@ export const commands: readonly CommandModule[] = [
   boss,
   moveset,
   location,
+  name,
+  info,
   admin,
 ];
```

Create `src/commands/meetups/info.ts`:

```ts
import {
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import { channelContext } from '../../discord/channel-context.js';
import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, requireGuild, requireMeetup } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MAX_MEETUP_DESCRIPTION, type MeetupParty } from '../../domain/party/party.js';
import { problemText } from '../../render/activity.js';
import { LIMITS, truncate } from '../../render/text.js';
import { commandMeetup, partyOver } from '../parties/reply.js';
import { CHANGE_THROTTLE, changingMember } from '../raids/change.js';

/** The custom-id kind of the form `/info` opens. */
export const INFO_KIND = 'info';
/** The id of the one input of that form. */
export const INFO_INPUT = 'text';

/**
 * The form of `/info`: one paragraph, with what the post says now already in it, so that a
 * member corrects a word without typing the rest again. Sent back empty, it removes the text.
 */
export function infoForm(party: MeetupParty): APIModalInteractionResponseCallbackData {
  return {
    custom_id: encodeCustomId({ kind: INFO_KIND, id: party.id, action: 'set' }),
    title: 'About this meetup',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: INFO_INPUT,
            label: 'Information',
            style: TextInputStyle.Paragraph,
            required: false,
            max_length: MAX_MEETUP_DESCRIPTION,
            placeholder: 'Where to meet, what to bring. Leave it empty to remove what is there.',
            ...(party.meetup.description === null ? {} : { value: party.meetup.description }),
          },
        ],
      },
    ],
  };
}

/**
 * A refusal of the form, with what the member typed given back to them: a form that was
 * refused is gone, and a paragraph is not typed twice gladly. The text is in a code block, cut
 * to what one message holds; a run of backticks in it cannot end the block.
 */
export function refusedWithText(refusal: string, text: string): string {
  const typed = text.trim().replace(/`{3,}/g, (run) => run.split('').join('\u200b'));
  if (typed === '') return refusal;
  const frame = `${refusal}\nWhat you wrote:\n\`\`\`\n\n\`\`\``;
  return `${refusal}\nWhat you wrote:\n\`\`\`\n${truncate(typed, LIMITS.content - frame.length)}\n\`\`\``;
}

/**
 * `/info` (spec 4.2): what the post of a meetup says about it, under "Information". It opens a
 * form with the text as it is; anybody in the post may change it, and the post says who did.
 * Of two members who have the form open at once the later one wins, with the text they started
 * from: nothing tells them that it changed meanwhile.
 */
export const info: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Write what there is to know about this meetup, in a form'),
  help: {
    category: 'meetup',
    details:
      'Use it in the post of the meetup. A form opens with the text as it is now: where to ' +
      'meet, what to bring, how long it goes. What you send is shown in the post under ' +
      '"Information"; sent back empty, it removes the text. The post says who changed it.',
    examples: ['/info'],
  },
  guards: [requireMeetup],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    await interaction.showModal(infoForm(commandMeetup(interaction, ctx)));
  },
};

/** The form of `/info`. */
export const infoControls: ComponentHandler = {
  kind: INFO_KIND,
  guards: [requireGuild],
  throttle: CHANGE_THROTTLE,

  async modal(interaction, id, ctx) {
    if (id.action !== 'set') throw new UserError(STALE_COMPONENT);
    const text = interaction.fields.getTextInputValue(INFO_INPUT);
    const refuse = (refusal: string): UserError => new UserError(refusedWithText(refusal, text));
    // The form opens only in the meetup's own post, and its answer belongs there: a custom id
    // can be sent from anywhere, for any party. A post without a party is the post of a meetup
    // that ended while the form was open: only a meetup has this form.
    const here = partyOf(interaction, ctx);
    if (!here) {
      // In a channel that is known to be no post, the form was never opened.
      const { isThread, baseChannelId } = channelContext(interaction);
      if (!isThread && baseChannelId !== undefined) throw new UserError(STALE_COMPONENT);
      throw refuse(partyOver({ type: 'meetup' }));
    }
    if (here.id !== id.id) throw new UserError(STALE_COMPONENT);
    const outcome = await ctx.timedParties.setDescription(id.id, changingMember(interaction), text);
    if (outcome.kind === 'gone') throw refuse(partyOver({ type: 'meetup' }));
    if (outcome.kind === 'refused') {
      throw refuse(problemText(outcome.reason, ctx.attendance.limits(), 'meetup'));
    }
    const cleared = outcome.party.meetup.description === null;
    await interaction.reply({
      content: !outcome.changed
        ? 'Nothing changed: that is what the post says already.'
        : cleared
          ? 'The post of this meetup has no information any more.'
          : 'The post of this meetup shows what you wrote, under "Information".',
      flags: MessageFlags.Ephemeral,
    });
  },
};
```

Create `src/commands/meetups/meetup.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { Guard, SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import { MAX_PARTY_NAME } from '../../domain/party/party.js';
import { tidyName } from '../../domain/party/timed.js';
import { problemText } from '../../render/activity.js';

/** Where `/meetup` works, said wherever it does not. */
export const FROM_A_REGION = 'Create a meetup from a region channel.';

/** As the legacy bot allowed: a meetup is a post that stays for days. */
export const MEETUP_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };

function noForum(regionChannelId: string): string {
  return (
    `The region <#${regionChannelId}> has no forum yet. ` +
    'A moderator can create it with `/admin setup-forums`.'
  );
}

/**
 * Everything that can be known before a meetup is made is refused here, in a guard, so that a
 * use that made nothing does not count towards the two a member has in a quarter of an hour.
 *
 * `/meetup` is used in the text channel of a region, or in a post of its forum that is no
 * party, and the meetup then belongs to that region. Not in the post of a party: a post is no
 * place to start another from (the legacy bot refused it in a party's channel too). The region
 * needs its forum, and the name must be one.
 */
const requireMeetupPlace: Guard = (interaction, ctx) => {
  const regionChannelId = regionChannelOf(interaction, ctx);
  if (partyOf(interaction, ctx) || regionChannelId === undefined) {
    throw new UserError(FROM_A_REGION);
  }
  const region = ctx.regions.byChannel(regionChannelId);
  if (!region) throw new UserError(FROM_A_REGION);
  if (region.forumChannelId === null) throw new UserError(noForum(regionChannelId));
  if (
    interaction.isChatInputCommand() &&
    tidyName(interaction.options.getString('name') ?? '') === undefined
  ) {
    throw new UserError(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
  }
};

/**
 * `/meetup` (spec 4.2): a meetup with a post of its own in the forum of the region it is made
 * in. It starts with its name and nothing else; its times and what there is to say about it are
 * set in its post (`/meet`, `/end`, `/info`). Who makes it is signed up as interested, and
 * named.
 */
export const meetup: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('meetup')
    .setDescription('Create a meetup in this region, with a post of its own')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('What to call it, such as "Community Day picnic"')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    ),
  help: {
    category: 'meetup',
    details:
      'For anything that is not a raid at one gym: a Community Day in the park, a trade ' +
      'evening. Use it in the channel of a region; the meetup gets a post in the forum of that ' +
      'region, and you are marked as interested. In the post, set when it starts with `/meet` ' +
      'and when it ends with `/end`, say more about it with `/info`, and rename it with ' +
      '`/name`. Members sign up with the buttons, as for a raid. A meetup is archived an hour ' +
      'after it is over: after its end, or without one a day after its start. One without any ' +
      'time goes a day after it was made, or after its last time was removed; its post says ' +
      'when.',
    examples: ['/meetup name:Community Day picnic'],
  },
  guards: [requireGuild, requireMeetupPlace],
  defer: 'ephemeral',
  throttle: MEETUP_THROTTLE,
  async execute(interaction, ctx) {
    const regionChannelId = regionChannelOf(interaction, ctx);
    if (regionChannelId === undefined) throw new UserError(FROM_A_REGION);
    const outcome = await ctx.partyService.createMeetup({
      name: interaction.options.getString('name', true),
      creatorId: interaction.user.id,
      creator: memberInfo(interaction),
      regionChannelId,
    });
    // The guard has looked at all of these; what follows is for what changed in between.
    switch (outcome.kind) {
      case 'bad-name':
        throw new UserError(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
      case 'no-region':
        throw new UserError(FROM_A_REGION);
      case 'no-forum':
        throw new UserError(noForum(outcome.region.channelId));
      case 'created': {
        const post = outcome.party.forumPostId;
        await interaction.editReply({
          content:
            `Your meetup is made.${post === null ? '' : ` Its post is <#${post}>.`} ` +
            'There, `/meet` sets when it starts, `/end` when it ends, and `/info` what else ' +
            'there is to know.',
        });
      }
    }
  },
};
```

Create `src/commands/parties/name.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { requireTimed } from '../../discord/guards.js';
import { MAX_PARTY_NAME, partyWord } from '../../domain/party/party.js';
import { nameOf } from '../../domain/party/timed.js';
import { plain } from '../../render/text.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { actingMember, commandTimed } from './reply.js';
import { answerTimedChange } from './timed.js';

/**
 * `/name` (spec 4.2): another name for the party of this post, when it is a party that has a
 * name: a meetup, and a train from plan 3B. Anybody in the post may; the post says who did it,
 * and its title follows (within what Discord allows: two renames of a post in ten minutes, the
 * newest name wins).
 */
export const name: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('name')
    .setDescription('Rename this meetup')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The new name')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    ),
  help: {
    category: 'meetup',
    details:
      'Use it in the post of the meetup. The post says who renamed it. The title of the post ' +
      'follows; Discord lets a post be renamed twice in ten minutes, so a third name within ' +
      'that time shows a little later.',
    examples: ['/name name:Community Day picnic, by the lake'],
  },
  guards: [requireTimed],
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTimed(interaction, ctx);
    const word = partyWord(party);
    const outcome = await ctx.timedParties.setName(
      party.id,
      actingMember(interaction),
      interaction.options.getString('name', true),
    );
    await answerTimedChange(interaction, ctx, party, outcome, (ok) => {
      const called = `**${plain(nameOf(ok.party))}**`;
      return ok.changed
        ? `This ${word} is now called ${called}.`
        : `This ${word} is called ${called} already.`;
    });
  },
};
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -7,19 +7,23 @@ import {
 import type { AppContext } from '../../app-context.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
-import { notARaid, partyOf } from '../../discord/guards.js';
+import { notAMeetup, notARaid, notTimed, partyOf } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import {
   hasGroups,
   headCount,
   isGroupId,
+  isMeetup,
   isRaid,
+  isTimed,
   partyWord,
   type Attendee,
   type GroupId,
+  type MeetupParty,
   type Party,
   type RaidParty,
+  type TimedParty,
 } from '../../domain/party/party.js';
 import { problemText, standingReply } from '../../render/activity.js';
 import { isRaidAction } from '../../render/party-controls.js';
@@ -69,6 +73,32 @@ export function commandRaid(interaction: ChatInputCommandInteraction, ctx: AppCo
   return party;
 }
 
+/**
+ * The timed party of the post a command was used in (`requireTimed` has checked it), as
+ * `commandRaid` gives the raid. It ended in between: it is a timed party that is over, which
+ * today can only be a meetup.
+ */
+export function commandTimed(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): TimedParty {
+  const party = partyOf(interaction, ctx);
+  if (!party) throw new UserError(partyOver({ type: 'meetup' }));
+  if (!isTimed(party)) throw new UserError(notTimed(party));
+  return party;
+}
+
+/** The meetup of the post a command was used in (`requireMeetup` has checked it). */
+export function commandMeetup(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): MeetupParty {
+  const party = partyOf(interaction, ctx);
+  if (!party) throw new UserError(partyOver({ type: 'meetup' }));
+  if (!isMeetup(party)) throw new UserError(notAMeetup(party));
+  return party;
+}
+
 /**
  * The group a member picked from the list or typed: its letter. `B`, `b`, `group b`, and what
  * the list shows (`Group B: park side (4)`) all mean B. Whether the party has that group is for
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,3 +1,4 @@
+import { infoControls } from '../commands/meetups/info.js';
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import type { ComponentHandler } from '../discord/command.js';
@@ -7,5 +8,6 @@ import { partyButtons } from './party.js';
 export const components: readonly ComponentHandler[] = [
   raidControls,
   locationControls,
+  infoControls,
   partyButtons,
 ];
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -1,6 +1,13 @@
 import type { AppContext } from '../app-context.js';
 import type { Settings } from '../config/index.js';
-import { isRaid, partyWord, type Party, type RaidParty } from '../domain/party/party.js';
+import {
+  isMeetup,
+  isRaid,
+  isTimed,
+  partyWord,
+  type Party,
+  type RaidParty,
+} from '../domain/party/party.js';
 import { channelContext } from './channel-context.js';
 import type { Guard, LocatedInteraction } from './command.js';
 import { UserError } from './errors.js';
@@ -157,9 +164,17 @@ export const requireParty: Guard = (interaction, ctx) => {
   if (!partyOf(interaction, ctx)) throw new UserError(IN_A_PARTY_POST);
 };
 
+/**
+ * What a member is told who uses something that is for one kind of party (`wanted`: `a raid`,
+ * `a meetup`) in the post of another: the sentence names the kind of post they are in.
+ */
+function wrongPost(party: Pick<Party, 'type'>, wanted: string): string {
+  return `This is the post of a ${partyWord(party)}: that only works in the post of ${wanted}.`;
+}
+
 /** What a member is told who uses something that is for raids in the post of another party. */
 export function notARaid(party: Pick<Party, 'type'>): string {
-  return `This is the post of a ${partyWord(party)}: that only works in the post of a raid.`;
+  return wrongPost(party, 'a raid');
 }
 
 /** The raid whose forum post an interaction came from; undefined in any other place. */
@@ -169,12 +184,39 @@ export function raidOf(interaction: LocatedInteraction, ctx: AppContext): RaidPa
 }
 
 /**
- * For commands that are about a raid as such (its egg, boss, gym): `requireParty`, and the party
- * of the post must be a raid. The sentence names the kind of post the member is in.
+ * A guard for commands that are about one kind of party: `requireParty`, and the party of the
+ * post must be of that kind (`wanted`: `a raid`, `a meetup`).
  */
-export const requireRaid: Guard = (interaction, ctx) => {
-  assertGuild(interaction);
-  const party = partyOf(interaction, ctx);
-  if (!party) throw new UserError('Use this in the post of a raid that is still active.');
-  if (!isRaid(party)) throw new UserError(notARaid(party));
-};
+function requirePartyOf(fits: (party: Party) => boolean, wanted: string): Guard {
+  return (interaction, ctx) => {
+    assertGuild(interaction);
+    const party = partyOf(interaction, ctx);
+    if (!party) throw new UserError(`Use this in the post of ${wanted} that is still active.`);
+    if (!fits(party)) throw new UserError(wrongPost(party, wanted));
+  };
+}
+
+/** For commands that are about a raid as such: its egg, boss, gym. */
+export const requireRaid: Guard = requirePartyOf(isRaid, 'a raid');
+
+/**
+ * The kinds of party that have a name and times of their own (`TimedParty`), as a sentence
+ * names where a command for them works. Plan 3B adds the train here: "a meetup or a train".
+ */
+export const A_TIMED_PARTY = 'a meetup';
+
+/** What a member is told who uses something that is for timed parties in the post of a raid. */
+export function notTimed(party: Pick<Party, 'type'>): string {
+  return wrongPost(party, A_TIMED_PARTY);
+}
+
+/** What a member is told who uses something that is for meetups in the post of another party. */
+export function notAMeetup(party: Pick<Party, 'type'>): string {
+  return wrongPost(party, 'a meetup');
+}
+
+/** For commands that are about a party with a name of its own (`/name`). */
+export const requireTimed: Guard = requirePartyOf(isTimed, A_TIMED_PARTY);
+
+/** For commands that are about a meetup as such (`/info`). */
+export const requireMeetup: Guard = requirePartyOf(isMeetup, 'a meetup');
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -236,6 +236,10 @@ export function isTimed(party: Party): party is TimedParty {
   return party.type === 'meetup';
 }
 
+export function isMeetup(party: Party): party is MeetupParty {
+  return party.type === 'meetup';
+}
+
 /**
  * `changed` as the kind of party `original` is, for code that is written for one kind and gets
  * the party back from the store, which holds every kind. A change never alters the kind of a
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -14,6 +14,7 @@ import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/at
 import { createMeetup } from '../domain/party/meetup.js';
 import {
   asKindOf,
+  isMeetup,
   isRaid,
   membersWhere,
   partyWord,
@@ -1411,9 +1412,7 @@ export class PartyService {
     const raids = parties
       .filter(isRaid)
       .map((party) => ({ party, title: raidTitle(this.view(party)) }));
-    const meetups = parties
-      .filter((party): party is MeetupParty => party.type === 'meetup')
-      .map((party) => ({ party, title: meetupTitle(party) }));
+    const meetups = parties.filter(isMeetup).map((party) => ({ party, title: meetupTitle(party) }));
     return renderSummary(raids, now, meetups);
   }
 
```

Apply to `src/services/timed-party-service.ts`:

```diff
--- a/src/services/timed-party-service.ts
+++ b/src/services/timed-party-service.ts
@@ -2,17 +2,21 @@ import type { UserSettings } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import { noteMember } from '../domain/party/attendance.js';
 import {
+  isMeetup,
   isTimed,
   membersWhere,
   partyWord,
   type Change,
+  type MeetupParty,
+  type Party,
   type PartyProblem,
   type TimedParty,
 } from '../domain/party/party.js';
+import { setDescription } from '../domain/party/meetup.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { setStartTime, setTimedEnd, startTimeOf } from '../domain/party/timed.js';
+import { nameOf, setName, setStartTime, setTimedEnd, startTimeOf } from '../domain/party/timed.js';
 import type { Logger } from '../log.js';
-import { clockOrDate, LIMITS, timestamp, withMentions } from '../render/text.js';
+import { clockOrDate, LIMITS, plain, timestamp, withMentions } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import { KeyedLock } from './keyed-lock.js';
 import type { PartyLines } from './party-lines.js';
@@ -23,10 +27,10 @@ import type { PartyStore } from './party-store.js';
  * raid is none). `refused`: the party stays as it was. `ok`: the party as it is stored now;
  * `changed` is false when it already was so.
  */
-export type TimedChangeOutcome<Extra = unknown> =
+export type TimedChangeOutcome<Extra = unknown, P extends TimedParty = TimedParty> =
   | { kind: 'gone' }
   | { kind: 'refused'; reason: PartyProblem }
-  | ({ kind: 'ok'; party: TimedParty; changed: boolean } & Extra);
+  | ({ kind: 'ok'; party: P; changed: boolean } & Extra);
 
 export interface TimedPartyServiceOptions {
   store: PartyStore;
@@ -83,6 +87,42 @@ export class TimedPartyService {
     return `${clockOrDate(time, this.now())} (${timestamp(time, 'R')})`;
   }
 
+  /**
+   * Another name for the party; the title of its post follows with the next render. Anybody in
+   * the post may. Refused with `bad-name` for a text that is no name.
+   */
+  setName(partyId: string, member: Member, text: string): Promise<TimedChangeOutcome> {
+    return this.apply(
+      partyId,
+      member,
+      isTimed,
+      (party) => setName(party, text),
+      (party) => `<@${member.id}> renamed this ${partyWord(party)}: **${plain(nameOf(party))}**.`,
+    );
+  }
+
+  /**
+   * What the post of a meetup says about it (`/info`); a text of nothing but white space
+   * removes it. Anybody in the post may. The line in the post says that it changed, not what
+   * to: the text is in the post itself. Only a meetup has it: any other party is `gone`.
+   */
+  setDescription(
+    partyId: string,
+    member: Member,
+    text: string,
+  ): Promise<TimedChangeOutcome<unknown, MeetupParty>> {
+    return this.apply(
+      partyId,
+      member,
+      isMeetup,
+      (party) => setDescription(party, text),
+      (party) =>
+        party.meetup.description === null
+          ? `<@${member.id}> removed the information.`
+          : `<@${member.id}> changed the information.`,
+    );
+  }
+
   /**
    * When the party starts, for everybody, or no start any more with null. Only for a member who
    * is signed up (`not-attending`); refused when it would not lie before the end. `others` are
@@ -94,7 +134,7 @@ export class TimedPartyService {
     time: number | null,
   ): Promise<TimedChangeOutcome<{ others: string[] }>> {
     let before: number | null = null;
-    const outcome = await this.apply(partyId, member, (party, now) => {
+    const outcome = await this.apply(partyId, member, isTimed, (party, now) => {
       before = startTimeOf(party);
       return setStartTime(party, member.id, time, now);
     });
@@ -110,6 +150,7 @@ export class TimedPartyService {
     return this.apply(
       partyId,
       member,
+      isTimed,
       (party, now) => setTimedEnd(party, time, now),
       (party) =>
         party.endTime === null
@@ -188,20 +229,22 @@ export class TimedPartyService {
   }
 
   /**
-   * Runs one change. The member's name and team are noted with it when they are signed up.
-   * `line` is said in the post, pinging nobody, when the change was stored.
+   * Runs one change of a party that `fits` (a timed party, or a meetup for what only a meetup
+   * has), decided inside the store; any other party is `gone`: there is no such party. The
+   * member's name and team are noted with it when they are signed up. `line` is said in the
+   * post, pinging nobody, when the change was stored.
    */
-  private async apply<Extra>(
+  private async apply<P extends TimedParty, Extra>(
     partyId: string,
     member: Member,
-    change: (party: TimedParty, now: number) => Change<TimedParty, Extra>,
-    line?: (party: TimedParty) => string | undefined,
-  ): Promise<TimedChangeOutcome<Extra>> {
+    fits: (party: Party) => party is P,
+    change: (party: P, now: number) => Change<P, Extra>,
+    line?: (party: P) => string | undefined,
+  ): Promise<TimedChangeOutcome<Extra, P>> {
     const { store, posts, lines } = this.options;
-    type Decision = Change<TimedParty, Extra> | { ok?: undefined; party?: undefined };
+    type Decision = Change<P, Extra> | { ok?: undefined; party?: undefined };
     const result = await store.update(partyId, (party): Decision => {
-      // A raid is no timed party: there is no such party.
-      if (!isTimed(party)) return {};
+      if (!fits(party)) return {};
       const changed = change(party, this.now());
       if (!changed.ok || changed.party === party) return changed;
       return { ...changed, party: noteMember(changed.party, member.id, member) };
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/meetups/meetup.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/in-meetup.test.ts src/commands/util/help-render.test.ts src/services/timed-party-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff fb5ea2b -- src test   # must print nothing
npx prettier --check src/app-context.ts src/commands/index.ts src/commands/meetups/info.ts src/commands/meetups/meetup.test.ts src/commands/meetups/meetup.ts src/commands/meetups/name-info.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/name.ts src/commands/parties/reply.ts src/commands/util/help-render.test.ts src/components/index.ts src/discord/guards.ts src/domain/party/party.ts src/services/party-service.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/commands/index.ts src/commands/meetups/info.ts src/commands/meetups/meetup.test.ts src/commands/meetups/meetup.ts src/commands/meetups/name-info.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/name.ts src/commands/parties/reply.ts src/commands/util/help-render.test.ts src/components/index.ts src/discord/guards.ts src/domain/party/party.ts src/services/party-service.ts src/services/timed-party-service.test.ts src/services/timed-party-service.ts
git commit -m "The new commands: /meetup, /name and /info with its form" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,254 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-3a HEAD -- src test` prints nothing; `npm run test:db` once, complete; `npm run build`.
2. Whole-branch review (Opus, high effort) of the eight commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for the union (`isRaid` / `isTimed` / `isMeetup`, `requireRaid` / `requireTimed` / `requireMeetup`, `commandRaid` / `commandTimed` / `commandMeetup`, `asKindOf`), `party.timed` and `ctx.timedParties` with `src/domain/party/timed.ts`, how a meetup's times are read and when it is over, `partyWord` / `partyOver` and `answerOutcome` with the party, a command's `throttle` as a function, `render/party-post.ts` and `renderMeetupPost`, `clockOrDate` / `plainLines`, the test support (`testMeetup()`, `createdMeetup()`, `asRaid()`, `asMeetup()`, the fake gateway's embed checks).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 3A" section (what 3B must pick up; what is left for Matt; the things named under "Not in this plan"). The spec ("as built" after 5.3 and in 5.5), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. Before: `npm run deploy-commands -- --guild <test server id>` (three new commands, changed descriptions). For the clock, use the settings copy of `var/stage/` with a short `trainOrMeetupDeletionWarningTime`.

- [ ] `/help`: "Meetups" lists `/meetup`, `/name`, `/info`, and every category still has its descriptions; `/help command:meetup` reads well.
- [ ] `/meetup name:Staging picnic` in a region channel: a private answer with the link; the post is in that region's forum, titled "Meetup · Staging picnic", tagged Meetup, blue; it says "Created by" and "No time has been set yet: `/meet` sets the start. Without one this post is archived in a day."; the region channel has "New meetup: …"; the pinned list has a Meetups section.
- [ ] `/meetup` in the post of a party, in a channel that is no region, and with a name of spaces: each is refused, and none counts: two more can be made; the third within a quarter of an hour is held back.
- [ ] The buttons of the post: Interested, Join, Here, Leave, −1, +1, Remote / in person. No Done, no "Set time". Each click is answered privately and said in the post.
- [ ] `/join count:3`, `/here`, `/not-here`, `/remote`, `/local`, `/leave`, `/done` (leaves), all in the words of a meetup. `/group new` says "A meetup has no groups."; the `group` option offers nothing.
- [ ] `/meet time:6:15pm` when signed up: the times line changes, and a message with a ping follows a few seconds later; twice quickly gives one message with the second time; `time:9am` in the afternoon is tomorrow's; `time:10-20 6:15pm` shows weekday and date; `time:in 30`; `time:20` is 20:00; a fourth `/meet` within three minutes is held back; `/meet` when not signed up is refused; `/cancel-meet`.
- [ ] `/end time:9pm` (the line gives the time and how far off it is); `/end time:1am` after an evening start is the next day; `/end time:none`; an end at or before the start is refused.
- [ ] The next day, in a meetup whose start was yesterday: `/meet time:7pm` gives today 19:00.
- [ ] `/name` twice (the title follows), a third time within ten minutes (the embed has the new name at once, the title a little later); a name with invisible characters is tidied.
- [ ] `/info`: the form is empty the first time and holds the text the second time; several lines stay several lines under **Information**; Markdown and `@everyone` are shown as text; a long text is shown whole; an empty form removes it.
- [ ] `/status` in the post (a copy at the bottom whose buttons work) and in the region channel (the list with the meetup).
- [ ] `/where`: "A meetup is at no gym…". `/hatch`, `/boss`, `/duration`, `/moveset`, `/location`: "This is the post of a meetup: that only works in the post of a raid."
- [ ] `/shout` alone; `/admin save-party` and `keep:False` (a kept meetup without a time does not say when it is archived).
- [ ] The clock with an end: red and tagged Ended at the end, warned five minutes later, archived after the warning time; a later `/end` after the warning takes the warning away within a minute.
- [ ] The clock without any time (shorten the day for the run): the warning says the meetup has no end time and pings the maker; once archived the post is red, tagged Ended, and says "This meetup is over."
- [ ] An old meetup with only a start: `/cancel-meet` gives it a day from then, no warning.
- [ ] `/delete` as staff: "This meetup was closed by …", Ended, archived and locked, the link line gone. Join on a stale copy of its message: "This has ended."
- [ ] `/info` open, staff closes the meetup, the form is sent: "This meetup is over." with the text given back.
- [ ] Restart the bot with a meetup open: its post is shown anew, the buttons work, the times stand.
- [ ] Raids once over lightly, since their paths moved: report one, join, Done on an egg (refused), `/end`, `/meet`, `/status`, `/delete`; Done on a raid that has ended says "This raid is over."
- [ ] What the fakes cannot show, to note down: how the weekday form of a time (`<t:…:F>`) reads in the post; whether a description of 1,000 characters with many lines reads well above the trainers; what Discord does with a form sent into an archived post.

Needs a second ordinary account: the ping of a new start time, and none with `mentionsGroups` off; `/shout` with a ping; `/delete` from a member (the form and the request say "meetup", the roles are pinged once); forum access for a member of another region, given on signing up and taken back on leaving; two members with `/info` open at once (the later wins).
