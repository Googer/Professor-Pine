# Phase 8X-3: The Max Battle: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The third plan of max battles (design `docs/superpowers/specs/2026-10-20-max-battles-design.md`, sections 3, 4, 9, 10, 12): a max battle as a fourth kind of party, reported with `/max`. In detail:

- **The kind:** `MaxParty` (`type: 'max'`) at a Power Spot or an "Unlisted power spot" pin, with its boss and tier; `isTimed` named outright (meetup, train), `isBattle` for raids and max battles (Done completes); state document **version 13**; the battle clock shared with raids (warn and archive, no hatch); lobby sizes by tier (Dynamax 4, Gigantamax 100).
- **One battle per spot and server:** `PartyStore.maxAt` and `addMaxUnlessTaken` under a lock per spot (every pin shares one, a pin blocks pins within 50 m); `/end` moving an end later takes it too.
- **Always on** (Matt, 2026-10-21): `settings.maxBattles` has defaults for the whole block; every off path of 8X-2 is gone.
- **The default end** (design Q9, Matt, 2026-10-21): rotations are aligned to the hour and half-hour and a reported battle is already in progress, so the end is the next rotation boundary: the next :00 or :30 in a short event (a Max Battle Day), the next full hour in an all-day event (Max Monday, a Max Battle Weekend) and for a Gigantamax battle, otherwise the day's last battle time (21:00) or the start of a max event later that day (Q-B, provisional until Matt checks the 2026-10-24 Lake Trio day); never past the last battle time. A report under 5 minutes from its default end asks first in a dialog: "Until the next rotation" (first, picked) or the end about to pass; a plain confirmation when there is no later rotation. A typed `end:` never asks.
- **Big events** (Matt, 2026-10-21): ScrapedDuck's global Wild Area and GO Tour (and GO Fest Global, its type a guess) bring Gigantamax battles all day; during their hours `/max` lists the Gigantamax bosses first. The in-person city editions are out of scope.
- **Upcoming bosses** are dropped once the event naming them has ended; `AppContext.raidEvents` reaches the max and big events.
- **`/max boss: spot: [end:] [tier:]`**, `/boss`, `/end`, `/meet` and Meet… (5-minute times, Q10), `/where` and `/delete` in a max battle's post; the post (heading, picture, Where, groups `n/cap`, no Set time or Screenshot feedback, Remote kept), the forum tag `Max battle`, the summary's section, the DM brief; reports to the moderators.
- **Wants and DMs:** species and form wants fit a max battle's boss, never tier wants; at most one DM an hour per member, kind and boss (Q8), said in the DM.
- **History:** kind `max`, tier `D1`–`D5`/`G`, migration **025** (`PartyHistory.wayspotId`).

**Architecture:**

- **Domain:** `src/domain/party/party.ts` (`PARTY_TYPES`, `isBattle`, `isTimed`), `max.ts` (the kind, its spot, its changes), `party-state.ts` (v13), the battle clock; `src/domain/time/max-end.ts` (`defaultMaxEnd`, `maxRotation`, `nextRotationEnd`), `big-events.ts`; `withoutEndedUpcoming` beside the max boss list.
- **Store and services:** `PartyStore.maxAt` / `addMaxUnlessTaken` / `withSpotLock`; `PartyService.reportMax` (the join decided inside the update) and `maxView`; `MaxChangeService` (`ctx.maxBattles`: `setEnd`, `setBoss`); `RaidEventService.bigEvents()`; `PartyNotifier.maxReported` / `maxChanged` with the hour in a `BoundedMap`.
- **Discord:** `src/commands/max/` (`/max`, its input, the ending-soon dialog), the in-post commands, `src/render/max-post.ts` and `max-dialog.ts`, the summary, the moderators' post.
- **History:** migration `2026_10_21_025_max_battle_history`, `PartyHistory.wayspotId varchar(40) null`.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Vitest. No new dependency. **Migration 025** (typescript-migration and `wayfarer` end at 024; first merge wins). **Party state version 13**: rows written by this build are unreadable to an older bot. **Commands change** (`/max` new; `/boss`, `/end`, `/meet`, `/where` changed): deploy the commands again before staging.

**Spec:** the design above, the brief `.superpowers/sdd/8x-3-max-battle/design.md` and its ledger (Matt's decisions of 2026-10-21; git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8x3`, tip `c86000fb`), one commit per task, on `max-battles` c2701cff. Each commit typechecks and its unit tests pass; on the tip the full check (8307 tests), the build and the database suite (516) are clean.

**Reviews:** two Opus reviewers went through the prototype, one on the domain, store, time, settings and history, one on the commands, post and DMs (five Important: reporting a max battle to the moderators threw, `/max` could answer twice at the 5-minute mark, the join to a battle at the spot was decided outside the store, the one-DM hour was shared by Dynamax and Gigantamax, the dialog second-guessed a typed end; fifteen Minor), then a fix review (four Minor), then Matt's two answers (Gigantamax first during big events; a Dynamax day battle ends at a later event's start). Every finding is in the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **Tasks 4 and 5 swapped against the brief:** the post and `reportMax` come before `/max`, whose tests need them.
2. **Spot keys:** a Power Spot locks as `w<Wayfarer id>`; every pin shares the key `pin` (a pin blocks pins within 50 m). A maps link becomes the nearest known Power Spot within 50 m, else a pin, logged for staff (Q7).
3. **The ending-soon dialog** uses Discord's own Submit and Cancel; "ending soon" is strictly under 5 minutes (`ENDING_SOON_MINUTES`); a Submit re-checks everything and refuses an end already past. A report before 06:00 counts its rotation from 06:00.
4. **A join to a battle that ended while waiting** reports again once; if that one ended too, `/max` says "The max battle there has just ended: use `/max` again." and gives the use back.
5. **The one-DM hour** is in memory (20,000 entries), lost on a restart; two reports moments apart at different spots may both reach a member.
6. **`/boss` in a max battle** prefers the battle's own kind; a change between Dynamax and Gigantamax is refused.
7. **Not built:** the same ending-soon question for `/raid` (typed reports only, about 150 lines; a follow-up); a max battle on the map (8X-5).

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8x3`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. Apply the diffs with `git apply`, never retype them.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **Raids, meetups and trains are unchanged** but for "This has ended." on a gone party's Done, completion answer and Meet….
2. **The spot lock and the store:** one battle per spot and server, decided inside the store; no Discord call under a lock.
3. **The default end** on the recorded events: boundaries, the cap, before 06:00, a later event the same day, big events, zones and clock changes.
4. **State version 13 and migration 025:** versions 1–12 read as before; the migration additive and guarded.

### Task 1: 8X-3 task 1: the guards first (isTimed outright, battled kinds)

Prototype commit: `3854bc80c095114ba4529129d11d06abf5c004be`

isTimed names the timed kinds outright (meetup or train), so a kind added
later is no timed party by elimination (design 3.1, review 1). isBattle and
BattleParty (a raid now; a max battle from task 2): Done completes a battle
(finishParty, completeRaid, askGroupWhetherComplete, completeUnanswered take
a BattleParty; the egg refusal stays a raid's), and the post's Done button
shows for every battle.

Inventory: every isTimed, !isRaid, isRaid, requireRaid and hasGroups site,
and what a max battle does there (M = max battle).

isTimed
- party.ts isTimed: now meetup or train; M false.
- attendance.ts setMeetingTime: refuses timed parties; M may set a group's
  meeting time (design 3.1, useful at a Gigantamax spot).
- tick.ts warningAddressee: M none (it has an end everybody saw, as a raid).
- party-history.ts name, startTime: M null (no timed part).
- meet.ts throttle, guard, execute: M is no timed party: /meet sets the
  group's meeting time as in a raid (task 4 reads the time).
- change.ts /end: M gets its own branch in task 4 (within the day, never
  past the last battle time).
- reply.ts commandTimed, guards requireTimed (/name, /info ...): M refused.
- timed-party-service.ts: timed only; M never reaches it.
!isRaid / isRaid
- attendance.ts finishParty: now !isBattle; M completes (Done means done).
- party-controls.ts Done: isBattle; Set time and Screenshot stay raid-only;
  Meet... for M from task 4 (Q10).
- tick.ts partyTick dispatch: task 2 adds maxTick (warn and archive by the
  raid rule, the completion timeouts, no hatch).
- guards.ts requireRaid / raidOf, reply.ts commandRaid: M refused (/hatch,
  /duration, /moveset, /location, Set time); /boss and /end get max
  branches in task 4.
- boss.ts: /boss extended to M in task 4 (the tier follows the boss,
  Dynamax and Gigantamax never swap).
- components/party.ts Set time, Screenshot feedback: raid-only; M never
  shows those buttons.
- meet-dialog.ts: stale for a non-raid; task 4 admits M.
- render/group-dialogs.ts: a raid's meeting time as a clock time; task 5
  lets a max battle's show too.
- raid-post.ts shownBoss inTier: raid tiers; M has its own boss lookup.
- party-mirrors.ts raidMirrors: raid only; M has no copies (decision).
- party-scheduler.ts: a raid's stage lines and autoset; M has none.
- party-service.ts report exists, relocate, last words: M has its own
  report outcome (task 4); no relocate; last words as a raid's.
- raid-change-service.ts: raids only; M's changes are max branches of the
  change service (task 4).
- notify-service.ts: raid wants; task 6 adds the max battle's wants.
- domain/history party-history.ts took, raid details, boss; services
  party-history.ts bossKey: task 7 records M's tier and boss.
- gym-upkeep.ts: parties shown anew at a gym; M is at no gym.
- notifications/targets.ts, util/request.ts, util/counters.ts: gyms and raid
  counters; M has no gym (counters for M are 8X-6).
- raids/report.ts, web/raid-routes.ts, domain/web/party-view.ts: raids on
  the map; mapParty leaves M out until 8X-5.
- party.ts remoteAllowed: Remote stays on M (design 3.1).
- app.ts: the kept screenshots of raids; M has none.
- render/activity.ts partyOver: over for a raid or a party with an end; M
  has an end: as a raid.
- parties/delete.ts: words of a raid, else of a timed party; task 4 words
  M as a max battle.
hasGroups (type !== 'meetup')
- attendance.ts chooseGroup, joinGroup, joinInto, createGroup, joinStamped,
  labelGroup; group-dialogs.ts; reply.ts typedGroup; Group...: M has groups
  (A to E) and a lobby size, and Join fills them (8X-1).
By elimination (type switches)
- lobby.ts lobbySize and splitLobby, party-state.ts, party.ts bossOf and
  PARTY_WORDS, party-service.ts rendered: exhaustive switches the compiler
  makes task 2 extend. web/meetup-routes.ts, train-routes.ts: by type, M
  never matches.

**Files:**

```
 src/domain/party/attendance.ts | 20 +++++++++++---------
 src/domain/party/party.test.ts | 27 +++++++++++++++++++++++++++
 src/domain/party/party.ts      | 19 ++++++++++++++++++-
 src/render/party-controls.ts   |  6 +++---
 4 files changed, 59 insertions(+), 13 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/party/party.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3854bc80c095114ba4529129d11d06abf5c004be -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 task 1: the guards first (isTimed outright, battled kinds)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index bdd46a2789bb3404e99bd2bc8273c8ab4e9a0082..da7e99e94e429a5af18efab79beebbd36cba13d5 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -4,6 +4,7 @@ import {
   groupOf,
   groupOpened,
   hasGroups,
+  isBattle,
   isRaid,
   isTimed,
   isTrain,
@@ -19,7 +20,7 @@ import {
   type GroupId,
   type Party,
   type PartyGroup,
-  type RaidParty,
+  type BattleParty,
   type Team,
 } from './party.js';
 import { raidStage } from './raid.js';
@@ -381,7 +382,7 @@ export function leaveParty<P extends Party>(
  * `CompletePending` until `now + timeoutMinutes`, after which silence counts as yes. `except` is
  * the member whose Done asks them; it is recorded with each of them (`askedBy`).
  */
-function askPresent<P extends RaidParty>(
+function askPresent<P extends BattleParty>(
   party: P,
   groupId: GroupId,
   except: string | undefined,
@@ -414,7 +415,7 @@ function askPresent<P extends RaidParty>(
  * merely interested, or had already completed the raid (`wasComplete`, and then the very same
  * party comes back), asks nobody. Only for an attendee.
  */
-export function completeRaid<P extends RaidParty>(
+export function completeRaid<P extends BattleParty>(
   party: P,
   memberId: string,
   now: number,
@@ -438,8 +439,9 @@ export function completeRaid<P extends RaidParty>(
 }
 
 /**
- * A member is done with the party. In a raid that completes it (`completeRaid`), which is
- * refused while the raid is an egg: nobody can have completed that. Any other party has nothing
+ * A member is done with the party. In a battle (`isBattle`: a raid, a max battle) that completes
+ * it (`completeRaid`), which a raid refuses while it is an egg: nobody can have completed that.
+ * Any other party has nothing
  * to complete, so done means leave, as with the legacy bot: the member is taken off (`left`),
  * nobody is asked anything and nobody ever has the status `Complete`; the conductor of a train
  * stops being it (`conductorLeft`, which the legacy bot forgot for done). Only for an attendee.
@@ -450,17 +452,17 @@ export function finishParty<P extends Party>(
   now: number,
   timeoutMinutes: number,
 ): Change<P, { asked: string[]; wasComplete: boolean; left: boolean; conductorLeft?: true }> {
-  if (!isRaid(party)) {
+  if (!isBattle(party)) {
     const gone = leaveParty(party, memberId);
     return gone.ok ? { ...gone, asked: [], wasComplete: false, left: true } : gone;
   }
-  if (raidStage(party, now) === 'egg') return refused('not-hatched');
+  if (isRaid(party) && raidStage(party, now) === 'egg') return refused('not-hatched');
   const done = completeRaid(party, memberId, now, timeoutMinutes);
   return done.ok ? { ...done, left: false } : done;
 }
 
 /** Asks the present members of a group, as after its meeting time (see `completeRaid`). */
-export function askGroupWhetherComplete<P extends RaidParty>(
+export function askGroupWhetherComplete<P extends BattleParty>(
   party: P,
   groupId: GroupId,
   now: number,
@@ -546,7 +548,7 @@ export function servedQuestions(party: Party): CompletionQuestion[] {
  * Completes everybody whose time to answer has run out; `completed` lists them. A pending
  * attendee without a time (it cannot happen through these functions) counts as run out.
  */
-export function completeUnanswered<P extends RaidParty>(
+export function completeUnanswered<P extends BattleParty>(
   party: P,
   now: number,
 ): { party: P; completed: string[] } {
diff --git a/src/domain/party/party.test.ts b/src/domain/party/party.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f4c09c4897cc46d6900c050a8f2f0a72134dfb84
--- /dev/null
+++ b/src/domain/party/party.test.ts
@@ -0,0 +1,27 @@
+import { describe, expect, it } from 'vitest';
+import { testMeetup, testRaid, testTrain } from '../../../test/support/parties.js';
+import { hasGroups, isBattle, isTimed, type Party } from './party.js';
+
+/**
+ * A party of a kind this build does not know yet, as a later kind would come (a max battle, plan
+ * 8X-3): the guards must not take it for a timed party by elimination (design
+ * `2026-10-20-max-battles-design.md`, 3.1, review 1).
+ */
+function ofAnotherKind(): Party {
+  return { ...testRaid(), type: 'max' } as unknown as Party;
+}
+
+describe('the guards of the kinds of party', () => {
+  it('names the timed kinds outright: a meetup and a train, no other kind', () => {
+    expect([testRaid(), testMeetup(), testTrain()].map(isTimed)).toEqual([false, true, true]);
+    expect(isTimed(ofAnotherKind())).toBe(false);
+  });
+
+  it('calls a raid battled (Done completes it), a meetup and a train not', () => {
+    expect([testRaid(), testMeetup(), testTrain()].map(isBattle)).toEqual([true, false, false]);
+  });
+
+  it('gives groups to every kind but a meetup', () => {
+    expect([testRaid(), testMeetup(), testTrain()].map(hasGroups)).toEqual([true, false, true]);
+  });
+});
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index e36753002fc04c431b8cc50bd5a5a510e68f4fc0..6cc8e613cb3d6a6c94f0100ccd0311c898786043 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -423,8 +423,25 @@ export function isRaid(party: Party): party is RaidParty {
   return party.type === 'raid';
 }
 
+/**
+ * Named outright (design `2026-10-20-max-battles-design.md`, 3.1, review 1): a kind added later
+ * (a max battle) is no timed party by elimination, and code that reads `party.timed` never meets
+ * one without it.
+ */
 export function isTimed(party: Party): party is TimedParty {
-  return party.type !== 'raid';
+  return party.type === 'meetup' || party.type === 'train';
+}
+
+/**
+ * A party that is a battle (design `2026-10-20-max-battles-design.md`, 3.1, review 3): Done
+ * means the member completed it, not that they leave; its present members are asked whether
+ * they completed it (`completeRaid`, `askGroupWhetherComplete`, `completeUnanswered`). A raid,
+ * and from plan 8X-3 a max battle.
+ */
+export type BattleParty = RaidParty;
+
+export function isBattle(party: Party): party is BattleParty {
+  return party.type === 'raid';
 }
 
 export function isMeetup(party: Party): party is MeetupParty {
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 28e5417bab0736e11f933c578cd6735c0163e486..fa277bdda7c95a4d628d5dba665314a5a7a34269 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -10,7 +10,7 @@ import {
 } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import type { ControlIconName } from '../domain/pogo/game-icons.js';
-import { hasGroups, isRaid, remoteAllowed, type Party } from '../domain/party/party.js';
+import { hasGroups, isBattle, isRaid, remoteAllowed, type Party } from '../domain/party/party.js';
 import type { PostButton, PostEmoji } from './party-post.js';
 import { fitItems, plain } from './text.js';
 
@@ -304,7 +304,7 @@ export interface BottomOptions {
 /**
  * The rows of a post's controls (plan 8X-1B, decision 1; Matt, 2026-10-20): the same for one
  * group and several, and in raids and trains alike. Row 1 the statuses in legacy Pine's order,
- * Interested, Join, Here, Done (a raid's: elsewhere Done means leave) and Leave; row 2 Meet… (a
+ * Interested, Join, Here, Done (a battle's, `isBattle`: elsewhere Done means leave) and Leave; row 2 Meet… (a
  * raid with times), −1, +1 and Remote (not for an elite raid); both rows icons only (the lines of
  * the post start with the statuses' icons). Row 3 the buttons with a label, which open
  * something: Group… (where the party has groups), then for a raid "Set time" (in Meet…'s place
@@ -321,7 +321,7 @@ export function bottomControls(party: Party, options: BottomOptions): PostButton
     statusButton(party, 'interested', emoji),
     statusButton(party, 'coming', emoji),
     statusButton(party, 'present', emoji),
-    ...(raid ? [statusButton(party, 'complete', emoji)] : []),
+    ...(isBattle(party) ? [statusButton(party, 'complete', emoji)] : []),
     iconButton(emoji, 'pineleave', '👋', (icon) =>
       partyButton(id, 'leave', undefined, ButtonStyle.Danger, undefined, icon),
     ),
````

### Task 2: 8X-3 task 2: the max battle as a kind of party, its state and its spot

Prototype commit: `4153b038af1d12bf7b331fdaabaddacac04f7064`

MaxParty (type max: tier, boss, spot) beside the raid, the meetup and the
train, a battle (isBattle: Done completes it). Its spot is a power spot as it
was named (PowerSpot) or a pin, an Unlisted power spot (MaxSpot). The pure
functions of src/domain/party/max.ts: createMax, spotKey and sameSpot,
maxEnded and blocksNewMax, setMaxEnd (meeting times after it dropped),
setMaxBoss (the tier follows the boss; max-kind-change between Dynamax and
Gigantamax), maxSpotName.

- State document version 13 with the part max; versions 1 to 12 read as
  today (none is a max battle's). A max battle at a gym or PokéStop, of a
  tier Pine does not know, or with a gym column is refused.
- The clock: maxTick (battleClock shared with raidTick: meeting times, the
  question, the unanswered, the archiving warned deletionWarningTime ahead;
  the post shown anew when the end passes).
- lobbySize by tier (dynamax, gigantamax); no split-up note.
- PartyStore.maxAt(spot, now) and addMaxUnlessTaken under a KeyedLock of
  the spot (withSpotLock, whenIdle waits for it): a power spot by its
  Wayfarer id, every pin under one key, a pin blocking pins within 50 m.
- requireRaidOrTrain (/boss, /where) names its kinds outright, a max battle
  among them ("a raid, max battle or train").
- Until the post and /max tasks, nothing makes a max battle: /meet and /end
  refuse one as no raid, /boss as before, and the party service has no
  renderer for it yet (it throws); mapParty leaves max battles out (8X-5).
  The meeting-time DM names "the max battle at <spot>".

**Files:**

```
 src/commands/parties/meet.ts         |   5 +-
 src/commands/parties/status.test.ts  |   2 +-
 src/commands/raids/change.ts         |   6 +-
 src/commands/raids/raid-only.test.ts |   2 +-
 src/discord/guards.ts                |  12 +--
 src/domain/history/party-history.ts  |   2 +-
 src/domain/moderation/reports.ts     |   3 +-
 src/domain/party/lobby.test.ts       |   8 +-
 src/domain/party/lobby.ts            |  11 ++-
 src/domain/party/max.test.ts         | 243 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/max.ts              | 166 +++++++++++++++++++++++++++++++++++++
 src/domain/party/party-state.test.ts |  49 +++++++++--
 src/domain/party/party-state.ts      |  86 ++++++++++++++++++--
 src/domain/party/party.test.ts       |   4 +-
 src/domain/party/party.ts            |  72 +++++++++++++++--
 src/domain/party/tick.ts             |  51 ++++++++++--
 src/domain/web/party-view.ts         |   3 +
 src/render/activity.ts               |  10 ++-
 src/services/gym-upkeep.ts           |   6 +-
 src/services/notify-service.ts       |   3 +
 src/services/party-service.ts        |   3 +
 src/services/party-store.max.test.ts | 103 +++++++++++++++++++++++
 src/services/party-store.ts          |  58 ++++++++++++-
 test/support/parties.ts              |  60 +++++++++++++-
 24 files changed, 912 insertions(+), 56 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/status.test.ts src/commands/raids/raid-only.test.ts src/domain/party/lobby.test.ts src/domain/party/max.test.ts src/domain/party/party-state.test.ts src/domain/party/party.test.ts src/services/party-store.max.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4153b038af1d12bf7b331fdaabaddacac04f7064 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 task 2: the max battle as a kind of party, its state and its spot`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/meet.ts b/src/commands/parties/meet.ts
index a2ff850afbd42ab2bc5ff352f397df29a2eedcc8..b32f7bd9a148f7c7e8f57128ec27d217f2e7c987 100644
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -1,9 +1,10 @@
 import { SlashCommandBuilder } from 'discord.js';
 import type { ControlThrottle, Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, requireParty } from '../../discord/guards.js';
+import { notARaid, partyOf, requireParty } from '../../discord/guards.js';
 import {
   groupOf,
+  isRaid,
   isTimed,
   mayArrange,
   membersWhere,
@@ -104,6 +105,8 @@ export const meet: SimpleCommand = {
       await changeStart(interaction, ctx, party, start === 'unset' ? null : start.at);
       return;
     }
+    // A max battle's meeting time is read from its own times in plan 8X-3's /max task.
+    if (!isRaid(party)) throw new UserError(notARaid(party));
     const typed = typedPartyTime(ctx, party, 'meet', text, Date.now());
     const outcome = await ctx.attendance.setMeetingTime(
       party.id,
diff --git a/src/commands/parties/status.test.ts b/src/commands/parties/status.test.ts
index b6c45b1eb3a14bfd4e0072ab674b6440522f00c6..7ccb5256363196f9d435083b41b1c903dca8a67a 100644
--- a/src/commands/parties/status.test.ts
+++ b/src/commands/parties/status.test.ts
@@ -155,7 +155,7 @@ describe('/where', () => {
     const made = await setup();
     const used = await made.run('where', { channelId: WEST_CHANNEL });
     expect(sent(used.reply).content).toBe(
-      'Use this in the post of a raid or train that is still active.',
+      'Use this in the post of a raid, max battle or train that is still active.',
     );
     expect(used.deferReply).not.toHaveBeenCalled();
   });
diff --git a/src/commands/raids/change.ts b/src/commands/raids/change.ts
index 1e2bcbe22906a26b33d54957347ccd15687e154a..397c38b7c10565a0383cfda85bcf005f60a517b1 100644
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -8,10 +8,10 @@ import {
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { requireParty, requireRaid } from '../../discord/guards.js';
+import { notARaid, requireParty, requireRaid } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { isTimed, type RaidParty } from '../../domain/party/party.js';
+import { isRaid, isTimed, type RaidParty } from '../../domain/party/party.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
 import { commandParty, commandRaid } from '../parties/reply.js';
@@ -151,6 +151,8 @@ export const end: SimpleCommand = {
     const party = commandParty(interaction, ctx);
     const text = interaction.options.getString('time', true);
     if (isTimed(party)) await changeEnd(interaction, ctx, party, text);
+    // A max battle's end is changed in plan 8X-3's /max task.
+    else if (!isRaid(party)) throw new UserError(notARaid(party));
     else await changeTime(interaction, ctx, party, 'end', text);
   },
 };
diff --git a/src/commands/raids/raid-only.test.ts b/src/commands/raids/raid-only.test.ts
index 1f24a2475733fc331f0bca94028653cc632bdf48..c0646516f59f11388943f0a15dc35d3d9bc0a4d8 100644
--- a/src/commands/raids/raid-only.test.ts
+++ b/src/commands/raids/raid-only.test.ts
@@ -52,7 +52,7 @@ describe('what is only for raids, in the post of a meetup', () => {
     expect(await made.answer('duration', { minutes: 30 })).toBe(NOT_A_RAID);
     // A train has a boss too: `/boss` says so.
     expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(
-      'This is the post of a meetup: that only works in the post of a raid or train.',
+      'This is the post of a meetup: that only works in the post of a raid, max battle or train.',
     );
     expect(await made.answer('moveset', { quick: 'snarl' })).toBe(NOT_A_RAID);
     expect(await made.answer('location', { gym: 'Library' })).toBe(NOT_A_RAID);
diff --git a/src/discord/guards.ts b/src/discord/guards.ts
index e1ad31f879ffc339cf280495416c45d23bc5fac5..89075093712da7e86c46e1dec78a553a59c96260 100644
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -1,6 +1,7 @@
 import type { AppContext } from '../app-context.js';
 import type { Settings } from '../config/index.js';
 import {
+  isMax,
   isMeetup,
   isRaid,
   isTimed,
@@ -218,8 +219,8 @@ function requirePartyOf(fits: (party: Party) => boolean, wanted: string): Guard
 /** For commands that are about a raid as such: its egg, boss, gym. */
 export const requireRaid: Guard = requirePartyOf(isRaid, 'a raid');
 
-/** The kinds of party that are at a gym and can have a boss, as a sentence names them. */
-export const A_RAID_OR_TRAIN = 'a raid or train';
+/** The kinds of party that are at a place and can have a boss, as a sentence names them. */
+export const A_RAID_OR_TRAIN = 'a raid, max battle or train';
 
 /** What a member is told who uses something that is for raids and trains in a meetup's post. */
 export function notARaidOrTrain(party: Pick<Party, 'type'>): string {
@@ -227,11 +228,12 @@ export function notARaidOrTrain(party: Pick<Party, 'type'>): string {
 }
 
 /**
- * For commands that are about the boss or the gym of a party (`/boss`, `/where`): a raid, and a
- * train, which is after a boss and at the stop it has reached.
+ * For commands that are about the boss or the place of a party (`/boss`, `/where`): a raid, a
+ * max battle (plan 8X-3), and a train, which is after a boss and at the stop it has reached.
+ * Named outright: a kind added later is none of them by elimination.
  */
 export const requireRaidOrTrain: Guard = requirePartyOf(
-  (party) => !isMeetup(party),
+  (party) => isRaid(party) || isMax(party) || isTrain(party),
   A_RAID_OR_TRAIN,
 );
 
diff --git a/src/domain/history/party-history.ts b/src/domain/history/party-history.ts
index 11b54fbcf30ee98f9dec40882a0f9b3e78466d74..ff45266ec01611023f1a1cd08fa3e90b45c4ae29 100644
--- a/src/domain/history/party-history.ts
+++ b/src/domain/history/party-history.ts
@@ -21,7 +21,7 @@ import { currentStop, placeOf } from '../party/train.js';
  * ended becomes (`historyOfParty`). Members are named in it only with their opt-in.
  */
 
-export type HistoryKind = 'raid' | 'train' | 'meetup';
+export type HistoryKind = 'raid' | 'train' | 'meetup' | 'max';
 
 /** How far a member got, as the history says it (an attendee's status, worded for SQL). */
 export const HISTORY_STATUSES = ['interested', 'joined', 'here', 'done'] as const;
diff --git a/src/domain/moderation/reports.ts b/src/domain/moderation/reports.ts
index f086d439986ae13b3c4ed4c0c2f08848109d0ad0..224e7ee16065319fc21e6681d3ea86b5384634c7 100644
--- a/src/domain/moderation/reports.ts
+++ b/src/domain/moderation/reports.ts
@@ -2,6 +2,7 @@ import { z } from 'zod';
 import type { Place } from '../geo/place.js';
 import type { Decider } from '../meetups/records.js';
 import type { PartyType } from '../party/party.js';
+import { PARTY_TYPES } from '../party/party.js';
 import { placeDocument } from '../party/party-state.js';
 
 /**
@@ -105,7 +106,7 @@ export const reportSubject = z.discriminatedUnion('kind', [
   z.object({
     kind: z.literal('party'),
     partyId: z.string().min(1).max(36),
-    partyType: z.enum(['raid', 'meetup', 'train']),
+    partyType: z.enum(PARTY_TYPES),
     title: text(200),
     lines: z.array(text(1000)).max(10),
     regionChannelId: snowflake.nullable(),
diff --git a/src/domain/party/lobby.test.ts b/src/domain/party/lobby.test.ts
index f92f57b30a35554a6d1e47a8c3af87e60b3f5534..03e0960cdc8be4010b57bd0cfc1ea9701cb27432 100644
--- a/src/domain/party/lobby.test.ts
+++ b/src/domain/party/lobby.test.ts
@@ -28,8 +28,8 @@ describe('lobbySize', () => {
   });
 
   it('refuses a kind of party it does not know, rather than give it no size', () => {
-    const unknown = { ...testRaid(), type: 'max' } as unknown as Party;
-    expect(() => lobbySize(unknown, DEFAULT_LOBBIES)).toThrow(/max/);
+    const unknown = { ...testRaid(), type: 'carnival' } as unknown as Party;
+    expect(() => lobbySize(unknown, DEFAULT_LOBBIES)).toThrow(/carnival/);
   });
 });
 
@@ -42,8 +42,8 @@ describe('splitLobby', () => {
   });
 
   it('refuses a kind of party it does not know', () => {
-    const unknown = { ...testRaid(), type: 'max' } as unknown as Party;
-    expect(() => splitLobby(unknown, DEFAULT_LOBBIES)).toThrow(/max/);
+    const unknown = { ...testRaid(), type: 'carnival' } as unknown as Party;
+    expect(() => splitLobby(unknown, DEFAULT_LOBBIES)).toThrow(/carnival/);
   });
 });
 
diff --git a/src/domain/party/lobby.ts b/src/domain/party/lobby.ts
index af03a5e483ca0354882c9b303cc184aff08ed415..035c2bddfd20270dcb41253b17080f8048eaede8 100644
--- a/src/domain/party/lobby.ts
+++ b/src/domain/party/lobby.ts
@@ -1,3 +1,4 @@
+import { battleKindOf } from '../pogo/max-tier.js';
 import type { Party } from './party.js';
 
 /**
@@ -25,9 +26,11 @@ export const MAX_LOBBY = 100;
  * party before max battles. Where there is a size, Join fills the groups (`chooseGroup`) and a
  * group's line shows `3/4 coming`.
  */
-export function lobbySize(party: Party, _lobbies: Lobbies): number | undefined {
+export function lobbySize(party: Party, lobbies: Lobbies): number | undefined {
   switch (party.type) {
-    // Coming (plan 8X-3): a max battle, by its tier: `dynamax` or `gigantamax`.
+    // A max battle by its tier (plan 8X-3): a Dynamax lobby or a Gigantamax one.
+    case 'max':
+      return battleKindOf(party.max.tier) === 'gigantamax' ? lobbies.gigantamax : lobbies.dynamax;
     // A raid and a raid train choose their groups themselves (Q6): no size.
     case 'raid':
       return undefined;
@@ -51,7 +54,9 @@ export function lobbySize(party: Party, _lobbies: Lobbies): number | undefined {
  */
 export function splitLobby(party: Party, lobbies: Lobbies): number | undefined {
   switch (party.type) {
-    // Coming (plan 8X-3): a max battle has a `lobbySize` and no such note.
+    // A max battle has a `lobbySize` and no such note.
+    case 'max':
+      return undefined;
     case 'raid':
       return lobbies.raid;
     // Coming (plan 8X-4): only a raid train; a Dynamax train has none (its lobbies form on the
diff --git a/src/domain/party/max.test.ts b/src/domain/party/max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ddef4f46b40fb5b55cf51f0e2a4c7609874f9bbb
--- /dev/null
+++ b/src/domain/party/max.test.ts
@@ -0,0 +1,243 @@
+import { describe, expect, it } from 'vitest';
+import {
+  ALICE,
+  at,
+  BOB,
+  MINUTE,
+  PARTY_NOW,
+  TEST_PIN,
+  TEST_SPOT,
+  testMax,
+  testMeetup,
+  testRaid,
+  testRaidRules,
+  testTrain,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
+import { loadSettings } from '../../config/settings.js';
+import { finishParty } from './attendance.js';
+import { DEFAULT_LOBBIES, lobbySize, splitLobby } from './lobby.js';
+import {
+  blocksNewMax,
+  maxEnded,
+  maxSpotName,
+  sameSpot,
+  setMaxBoss,
+  setMaxEnd,
+  spotKey,
+  UNLISTED_SPOT,
+} from './max.js';
+import { partyFromStored, partyState, type PartyColumns } from './party-state.js';
+import { endParty, isBattle, isTimed, type MaxParty, type Party } from './party.js';
+import { PartyStatus } from './status.js';
+import { partyTick } from './tick.js';
+
+const settings = loadSettings(TEST_SETTINGS_PATH);
+const { Present, Coming, CompletePending, Complete } = PartyStatus;
+
+function columnsOf(party: Party): PartyColumns {
+  const { anonymous: _a, attendees: _b, groups: _c, defaultGroupId: _d, ...rest } = party;
+  const { prompts: _e, makerName: _f, ...kept } = rest;
+  const columns = Object.fromEntries(
+    Object.entries(kept).filter(
+      ([key]) => !['raid', 'timed', 'meetup', 'train', 'max'].includes(key),
+    ),
+  ) as PartyColumns;
+  return { ...columns, mirrorMessages: [] };
+}
+
+/** The document as MySQL hands it back (parsed JSON). */
+const stored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
+
+function tick(party: MaxParty, now: number, previous: number | null = now - MINUTE) {
+  return partyTick(party, {
+    now,
+    previous,
+    settings,
+    rules: testRaidRules(),
+    autoset: () => undefined,
+  });
+}
+
+describe('a max battle among the kinds of party', () => {
+  it('is a battle and no timed party', () => {
+    expect([testRaid(), testMax(), testMeetup(), testTrain()].map(isBattle)).toEqual([
+      true,
+      true,
+      false,
+      false,
+    ]);
+    expect(isTimed(testMax())).toBe(false);
+  });
+
+  it('holds a lobby of its tier: 4 for a Dynamax battle, 100 for a Gigantamax one', () => {
+    expect(lobbySize(testMax(), DEFAULT_LOBBIES)).toBe(4);
+    expect(lobbySize(testMax({ tier: 'G', boss: { key: 'machamp' } }), DEFAULT_LOBBIES)).toBe(100);
+    expect(lobbySize(testMax(), { raid: 20, dynamax: 5, gigantamax: 40 })).toBe(5);
+    expect(splitLobby(testMax(), DEFAULT_LOBBIES)).toBeUndefined();
+  });
+
+  it('is done when Done is pressed, and asks the others of the group who are here', () => {
+    const battle = withAttendees(testMax(), {
+      [ALICE]: { status: Coming },
+      [BOB]: { status: Present },
+    });
+    const done = finishParty(battle, ALICE, PARTY_NOW, 5);
+    expect(done).toMatchObject({ ok: true, left: false, asked: [BOB] });
+    expect(done.party?.attendees[ALICE]?.status).toBe(Complete);
+    expect(done.party?.attendees[BOB]?.status).toBe(CompletePending);
+  });
+});
+
+describe('its spot', () => {
+  it('is locked by the power spot, and by one key for every pin', () => {
+    expect(spotKey(TEST_SPOT)).toBe(`w${TEST_SPOT.id}`);
+    expect(spotKey(TEST_PIN)).toBe('pin');
+    expect(spotKey({ ...TEST_PIN, lat: 41 })).toBe('pin');
+  });
+
+  it('is the same spot as the same power spot, or a pin within 50 metres', () => {
+    expect(sameSpot(TEST_SPOT, { ...TEST_SPOT, title: 'Renamed' })).toBe(true);
+    expect(sameSpot(TEST_SPOT, { ...TEST_SPOT, id: 'other.16' })).toBe(false);
+    expect(sameSpot(TEST_PIN, { ...TEST_PIN, lat: TEST_PIN.lat + 0.0004 })).toBe(true);
+    expect(sameSpot(TEST_PIN, { ...TEST_PIN, lat: TEST_PIN.lat + 0.0006 })).toBe(false);
+    // A pin at a power spot's very place is still no power spot.
+    expect(sameSpot(TEST_PIN, { ...TEST_SPOT, lat: TEST_PIN.lat, lon: TEST_PIN.lon })).toBe(false);
+  });
+
+  it('is named by its title, or as an unlisted power spot', () => {
+    expect(maxSpotName(TEST_SPOT)).toBe('Gazebo of the Park');
+    expect(maxSpotName(TEST_PIN)).toBe(UNLISTED_SPOT);
+  });
+});
+
+describe('its times', () => {
+  const end = at('2026-10-13T21:00');
+
+  it('ends when it was made to end, and blocks its spot until then', () => {
+    const battle = testMax();
+    expect(battle.endTime).toBe(end);
+    expect(battle.lastPossibleTime).toBe(end);
+    expect([maxEnded(battle, end - 1), maxEnded(battle, end)]).toEqual([false, true]);
+    expect([blocksNewMax(battle, end - 1), blocksNewMax(battle, end)]).toEqual([true, false]);
+    expect(blocksNewMax(endParty(battle), PARTY_NOW)).toBe(false);
+  });
+
+  it('takes a new end, to the minute, and drops a meeting time after it', () => {
+    const battle = {
+      ...testMax(),
+      groups: [{ id: 'A' as const, startTime: at('2026-10-13T15:00') }],
+    };
+    const later = setMaxEnd(battle, at('2026-10-13T16:00') + 30_000, PARTY_NOW);
+    expect(later.party.endTime).toBe(at('2026-10-13T16:00'));
+    expect(later.removed).toEqual([]);
+    const sooner = setMaxEnd(battle, at('2026-10-13T14:30'), PARTY_NOW);
+    expect(sooner.party.groups).toEqual([{ id: 'A' }]);
+    expect(sooner.removed).toEqual(['A']);
+    expect(setMaxEnd(battle, battle.endTime ?? 0, PARTY_NOW).party).toBe(battle);
+  });
+});
+
+describe('its boss', () => {
+  it('follows the boss within Dynamax, the tier with it', () => {
+    const changed = setMaxBoss(testMax(), { key: 'sneasel' }, 'D1');
+    expect(changed).toMatchObject({ ok: true, changed: true });
+    expect(changed.party?.max).toMatchObject({ boss: { key: 'sneasel' }, tier: 'D1' });
+    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'D2')).toMatchObject({ changed: false });
+  });
+
+  it('never goes between Dynamax and Gigantamax', () => {
+    expect(setMaxBoss(testMax(), { key: 'machamp' }, 'G')).toEqual({
+      ok: false,
+      reason: 'max-kind-change',
+    });
+    const giga = testMax({ tier: 'G' });
+    expect(setMaxBoss(giga, { key: 'sneasel' }, 'D1')).toMatchObject({ reason: 'max-kind-change' });
+  });
+});
+
+describe('its clock (maxTick)', () => {
+  it('shows the post anew when its end passes, once', () => {
+    const battle = testMax({ endTime: at('2026-10-13T15:00') });
+    expect(tick(battle, at('2026-10-13T14:59')).render).toBe(false);
+    const passed = tick(battle, at('2026-10-13T15:00'));
+    expect(passed).toMatchObject({ effects: [], render: true });
+    expect(tick(battle, at('2026-10-13T15:01')).render).toBe(false);
+  });
+
+  it('asks a group whose meeting time passed whether they are done, as a raid', () => {
+    const battle = withAttendees(
+      { ...testMax(), groups: [{ id: 'A' as const, startTime: at('2026-10-13T14:10') }] },
+      { [ALICE]: { status: Present } },
+    );
+    // The meeting time stays shown ten minutes (startClearTime), then the group is asked.
+    const result = tick(battle, at('2026-10-13T14:21'));
+    expect(result.effects).toEqual([{ kind: 'ask-complete', group: 'A', members: [ALICE] }]);
+    expect(result.party.attendees[ALICE]?.status).toBe(CompletePending);
+  });
+
+  it('warns of the archiving and asks for the end as a raid, after its end', () => {
+    const battle = testMax({ endTime: at('2026-10-13T15:00') });
+    // Grace 5 minutes, warning 10.
+    const after = at('2026-10-13T15:05') + 1;
+    const warned = tick(battle, after);
+    expect(warned.effects).toEqual([{ kind: 'warn', deletionTime: after + 10 * MINUTE }]);
+    expect(tick(warned.party, after + 10 * MINUTE).effects).toEqual([{ kind: 'end' }]);
+  });
+});
+
+describe('the state of a max battle (version 13)', () => {
+  const full = (): MaxParty => ({
+    ...withAttendees(testMax({ anonymous: true }), {
+      [ALICE]: { status: Present, number: 2, remote: true, name: 'Alice', team: 'mystic' },
+    }),
+    groups: [
+      { id: 'A' },
+      { id: 'B', opened: PARTY_NOW + MINUTE, startTime: PARTY_NOW + 30 * MINUTE },
+    ],
+    defaultGroupId: 'B',
+  });
+
+  it('comes back from storage exactly as it went in, at a power spot and at a pin', () => {
+    const battle = full();
+    expect(partyState(battle)).toMatchObject({ v: 13, max: battle.max });
+    expect(partyFromStored(columnsOf(battle), stored(partyState(battle)), [])).toEqual({
+      ok: true,
+      party: battle,
+    });
+    const pinned: MaxParty = { ...battle, max: { ...battle.max, spot: TEST_PIN } };
+    expect(partyFromStored(columnsOf(pinned), stored(partyState(pinned)), [])).toEqual({
+      ok: true,
+      party: pinned,
+    });
+  });
+
+  it('refuses a max battle at a gym or a PokéStop, of an unknown tier, or of a document before 13', () => {
+    const battle = full();
+    const state = stored(partyState(battle)) as Record<string, unknown>;
+    const problem = (s: unknown, c: PartyColumns = columnsOf(battle)): string => {
+      const read = partyFromStored(c, s, []);
+      return read.ok ? 'read' : read.problem;
+    };
+    const max = battle.max;
+    expect(problem({ ...state, max: { ...max, spot: { ...TEST_SPOT, kind: 'stop' } } })).toMatch(
+      /^state: /,
+    );
+    expect(problem({ ...state, max: { ...max, tier: 'D6' } })).toMatch(/^state: /);
+    expect(problem({ ...state, max: undefined })).toBe(
+      'a max battle without its max battle details',
+    );
+    // A document of version 12 knew no max battles.
+    expect(problem({ ...state, v: 12 })).toBe('a max battle without its max battle details');
+    expect(problem(state, { ...columnsOf(battle), gymId: 3 })).toBe('a max battle with a gym');
+    // And no raid has a max battle's details.
+    const raid = testRaid();
+    expect(problem({ ...(stored(partyState(raid)) as object), max }, columnsOf(raid))).toBe(
+      'a raid with the details of a max battle',
+    );
+    expect(() => partyState({ ...battle, max: { ...max, tier: 'D9' as never } })).toThrow(
+      /cannot be stored/,
+    );
+  });
+});
diff --git a/src/domain/party/max.ts b/src/domain/party/max.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7d0ca6a7b1cf82dac87b673f20229eb7868b11d7
--- /dev/null
+++ b/src/domain/party/max.ts
@@ -0,0 +1,166 @@
+import { metresBetween } from '@pine/wayspot-core/distance';
+import { PIN_NEAR_METRES } from '../geo/place.js';
+import { battleKindOf, type MaxTier } from '../pogo/max-tier.js';
+import {
+  NO_PROMPTS,
+  refused,
+  sameBoss,
+  withLastPossibleTime,
+  type Attendee,
+  type Change,
+  type MaxParty,
+  type MaxSpot,
+  type RaidBossRef,
+} from './party.js';
+import { PartyStatus } from './status.js';
+
+const MINUTE = 60_000;
+
+/** What a reported max battle is made of (`createMax`). */
+export interface NewMax {
+  /** A fresh UUID. */
+  id: string;
+  guildId: number;
+  regionId: number;
+  /** Snowflake of the reporter. */
+  createdById: string;
+  anonymous: boolean;
+  /** The reporter's automatic status (`User.status`); not interested signs nobody up. */
+  autoStatus: PartyStatus;
+  tier: MaxTier;
+  boss: RaidBossRef;
+  spot: MaxSpot;
+  /** When it ends: the default end of its tier and event, or the end the report gave. */
+  endTime: number;
+  now: number;
+}
+
+/**
+ * The lock and the rule of one max battle per spot (`PartyStore.maxAt`): a power spot by its
+ * Wayfarer id (`w<id>`: no colon, as a custom id's part may hold, design 6.2), every pin by one
+ * key (`pin`), since a pin blocks the pins within `PIN_NEAR_METRES` of it, whatever their
+ * points: reports at pins are rare, and one lock for them all keeps the check and the write one
+ * step.
+ */
+export function spotKey(spot: MaxSpot): string {
+  return spot.kind === 'pin' ? 'pin' : `w${spot.id}`;
+}
+
+/**
+ * Whether two spots are one for the rule of one max battle per spot: the same power spot, or two
+ * pins within `PIN_NEAR_METRES` of each other.
+ */
+export function sameSpot(a: MaxSpot, b: MaxSpot): boolean {
+  if (a.kind === 'pin' || b.kind === 'pin') {
+    return a.kind === 'pin' && b.kind === 'pin' && metresBetween(a, b) <= PIN_NEAR_METRES;
+  }
+  return a.id === b.id;
+}
+
+/** Over by the clock: its end has come (a max battle always has one). */
+export function maxEnded(party: MaxParty, now: number): boolean {
+  return now >= (party.endTime ?? party.lastPossibleTime ?? Infinity);
+}
+
+/**
+ * Whether this max battle stands in the way of a new report at its spot (design 3.1, as
+ * `blocksNewRaid`): while it is active and its end has not come.
+ */
+export function blocksNewMax(party: MaxParty, now: number): boolean {
+  return party.status === 'active' && !maxEnded(party, now);
+}
+
+/** The time floored to the minute, as every time a member gives. */
+function minute(time: number): number {
+  return Math.floor(time / MINUTE) * MINUTE;
+}
+
+export function createMax(input: NewMax): MaxParty {
+  const { autoStatus, now } = input;
+  const attendees: Record<string, Attendee> = {};
+  if (
+    autoStatus === PartyStatus.Interested ||
+    autoStatus === PartyStatus.Coming ||
+    autoStatus === PartyStatus.Present
+  ) {
+    attendees[input.createdById] = { number: 1, status: autoStatus, group: 'A', remote: false };
+  }
+  const endTime = minute(input.endTime);
+  const boss: RaidBossRef =
+    'key' in input.boss ? { key: input.boss.key } : { name: input.boss.name };
+  const party: MaxParty = {
+    id: input.id,
+    type: 'max',
+    guildId: input.guildId,
+    status: 'active',
+    regionId: input.regionId,
+    gymId: null,
+    forumChannelId: null,
+    forumPostId: null,
+    regionLinkMessageId: null,
+    mirrorMessages: [],
+    createdById: input.createdById,
+    anonymous: input.anonymous,
+    hatchTime: null,
+    endTime,
+    lastPossibleTime: null,
+    deletionTime: null,
+    saved: false,
+    createdAt: now,
+    updatedAt: now,
+    attendees,
+    groups: [{ id: 'A' }],
+    defaultGroupId: 'A',
+    prompts: NO_PROMPTS,
+    max: { tier: input.tier, boss, spot: input.spot },
+  };
+  return withLastPossibleTime(party, endTime, now);
+}
+
+/**
+ * Sets when the max battle ends (`/end`), floored to the minute; the caller has checked the time
+ * (within the day, never past the last battle time). The very same party when nothing changes. A
+ * meeting time after the new end is removed (`removed`): the group would meet after the battle.
+ */
+export function setMaxEnd(
+  party: MaxParty,
+  time: number,
+  now: number,
+): { party: MaxParty; removed: string[] } {
+  const endTime = minute(time);
+  if (endTime === party.endTime) return { party, removed: [] };
+  const removed: string[] = [];
+  const groups = party.groups.map((group) => {
+    if (group.startTime === undefined || group.startTime <= endTime) return group;
+    const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
+    removed.push(group.id);
+    return rest;
+  });
+  return { party: withLastPossibleTime({ ...party, endTime, groups }, endTime, now), removed };
+}
+
+/**
+ * Sets the boss of a max battle (`/boss`, a rotation within an event; design 3.1): the tier
+ * follows the boss; a change between Dynamax and Gigantamax is refused (`max-kind-change`: the
+ * lobby size would jump; report anew). `changed` is false when boss and tier are what they were.
+ */
+export function setMaxBoss(
+  party: MaxParty,
+  boss: RaidBossRef,
+  tier: MaxTier,
+): Change<MaxParty, { changed: boolean }> {
+  if (battleKindOf(tier) !== battleKindOf(party.max.tier)) return refused('max-kind-change');
+  if (sameBoss(party.max.boss, boss) && party.max.tier === tier) {
+    return { ok: true, party, changed: false };
+  }
+  const ref: RaidBossRef = 'key' in boss ? { key: boss.key } : { name: boss.name };
+  return { ok: true, party: { ...party, max: { ...party.max, boss: ref, tier } }, changed: true };
+}
+
+/** What a pin of a max battle is called (design 3.2, Q7): a power spot Pine does not know. */
+export const UNLISTED_SPOT = 'Unlisted power spot';
+
+/** A max battle's spot by name: the power spot's title, or `UNLISTED_SPOT` for a pin. */
+export function maxSpotName(spot: MaxSpot): string {
+  return spot.kind === 'pin' ? UNLISTED_SPOT : spot.title;
+}
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index f53e6ad2eb3dfe0a736ebc580dec9328ebb456b0..e9e2592397da2a7efcd381fc97deeac33100c6a1 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -76,7 +76,9 @@ function columnsOf(party: Party): PartyColumns {
   // The parts of its kind (`raid`, `timed`, `meetup`, `train`) are in the document, not in a
   // column.
   const columns = Object.fromEntries(
-    Object.entries(rest).filter(([key]) => !['raid', 'timed', 'meetup', 'train'].includes(key)),
+    Object.entries(rest).filter(
+      ([key]) => !['raid', 'timed', 'meetup', 'train', 'max'].includes(key),
+    ),
   ) as PartyColumns;
   return { ...columns, mirrorMessages: [] };
 }
@@ -156,7 +158,7 @@ describe('party state', () => {
       party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
     });
     // Nothing was added to the document for it: the version is what it was.
-    expect(document.v).toBe(12);
+    expect(document.v).toBe(13);
     // There were no shadow EX raids, and there are no shadow elite raids: still refused.
     const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
     expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
@@ -171,7 +173,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(12);
+    expect(state.v).toBe(13);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -232,7 +234,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 13 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 14 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -971,7 +973,7 @@ describe('the state of a train', () => {
         ],
       },
     };
-    expect(partyState(split).v).toBe(12);
+    expect(partyState(split).v).toBe(13);
     expect(partyFromStored(columnsOf(split), stored(partyState(split)), [])).toEqual({
       ok: true,
       party: split,
@@ -1045,7 +1047,7 @@ describe('the state of a train', () => {
       attendees: {},
       mirrorMessages: [],
     };
-    expect(partyState(raid).v).toBe(12);
+    expect(partyState(raid).v).toBe(13);
     expect(partyFromStored(columnsOf(raid), stored(partyState(raid)), [])).toEqual({
       ok: true,
       party: raid,
@@ -1088,6 +1090,41 @@ describe('the state of a train', () => {
     });
   });
 
+  // Review A of 8X-3, X3-B-7: version 13 added only `max`; what 8X-1B wrote reads as it was.
+  it('reads a version 12 raid, train and meetup with their groups’ stamps as they were', () => {
+    const stamped = [
+      { id: 'A' as const },
+      { id: 'B' as const, opened: PARTY_NOW + 30_000 },
+      { id: 'C' as const, label: 'Fast', opened: PARTY_NOW + 60_000 },
+    ];
+    const raid: RaidParty = { ...fullRaid(), groups: stamped, defaultGroupId: 'C' };
+    const train = fullTrain();
+    const trainSplit: TrainParty = {
+      ...train,
+      groups: stamped,
+      defaultGroupId: 'C',
+      train: {
+        ...train.train,
+        splitOff: [
+          {
+            partyId: '00000000-0000-4000-8000-0000000000bb',
+            postId: '300000000000000021',
+            group: 'D',
+            opened: PARTY_NOW + 45_000,
+          },
+        ],
+      },
+    };
+    const meetup: MeetupParty = { ...fullMeetup(), groups: stamped, defaultGroupId: 'C' };
+    for (const party of [raid, trainSplit, meetup] as Party[]) {
+      const old = stored({ ...partyState(party), v: 12 });
+      expect(partyFromStored(columnsOf(party), old, stored(party.mirrorMessages))).toEqual({
+        ok: true,
+        party,
+      });
+    }
+  });
+
   it('reads a version 4 document, which is a raid or a meetup and never a train', () => {
     const meetup = testMeetup();
     const old = stored({ ...partyState(meetup), v: 4 });
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index 32fb5335b437517fdcad6b3b039d305b3e61960a..419381e608e35f3c195ee689b5834d3cc0f38e1e 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -1,5 +1,6 @@
 import { z } from 'zod';
 import { MAX_LINK_NAME, MAX_PLACE_TITLE } from '../geo/place.js';
+import { MAX_TIERS } from '../pogo/max-tier.js';
 import { RAID_LEVELS, RETIRED_EX_LEVEL, raidTier } from '../pogo/raid-tier.js';
 import {
   GROUP_IDS,
@@ -12,6 +13,7 @@ import {
   MIRROR_KINDS,
   TEAMS,
   TRAIN_AT_END,
+  isPartyType,
   type Attendee,
   type MirrorMessage,
   type Party,
@@ -46,11 +48,13 @@ import { PartyStatus } from './status.js';
  * `splitOff` (the groups split off it); a train of an earlier document has neither. Version 12
  * (plan 8X-1B) added a group's `opened` (when it was opened: a group nobody is in goes, and a
  * later one may take its letter), also kept with a group split off a train; a group of an
- * earlier document has none and counts as opened with the party (`groupOpened`).
+ * earlier document has none and counts as opened with the party (`groupOpened`). Version 13
+ * (plan 8X-3) added `max` (a max battle's tier, boss and spot), the details of a fourth kind of
+ * party; a document of an earlier version is never one of a max battle.
  * Documents of versions 1 to 3 are those of raids, and one of version 4 is that of a raid or a
  * meetup.
  */
-export const PARTY_STATE_VERSION = 12;
+export const PARTY_STATE_VERSION = 13;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -186,6 +190,18 @@ const meetup = meetupV9.extend({
   place: placeDocument.nullable(),
 });
 
+/**
+ * A max battle's details (version 13): its tier, its boss (always known) and its spot, a power
+ * spot as it was named or a pin (`MaxSpot`): a known place of another kind is none.
+ */
+const max = z.object({
+  tier: z.enum(MAX_TIERS),
+  boss: bossRef,
+  spot: placeDocument.refine((spot) => spot.kind === 'pin' || spot.kind === 'powerspot', {
+    error: 'a max battle is at a power spot or a pin',
+  }),
+});
+
 const gymId = z.number().int().positive();
 
 /** What does not hold of where a train is on its route, whatever the version of its document. */
@@ -344,6 +360,7 @@ const state = z
     timed: timed.optional(),
     meetup: meetup.optional(),
     train: train.optional(),
+    max: max.optional(),
     /**
      * A list, in the order the members signed up, and not an object by member: MySQL sorts the
      * keys of a JSON object, which would put the attendees in the order of their snowflakes.
@@ -355,6 +372,24 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 12, as plans 8X-1B and 8X-2 wrote it: read only. It is version 13 without `max`. */
+const stateV12 = z
+  .object({
+    v: z.literal(12),
+    ...shared,
+    groups: z.array(group).min(1).max(GROUP_IDS.length),
+    raid: raid.optional(),
+    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    train: train.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 11, as plans 8T to 8X-1 wrote it: read only. It is version 12 without stamps. */
 const stateV11 = z
   .object({
@@ -543,17 +578,28 @@ function withSplits<T extends { train?: z.output<typeof trainV10> | undefined }>
 
 /**
  * Reads a stored document of any version this code knows, as the current version. A document
- * before version 12 has groups without stamps, which count as opened with the party.
+ * before version 13 is never a max battle's.
  */
 function readState(stored: unknown) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
   if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
-  const older = readStateV11(stored, version);
+  const older = readStateV12(stored, version);
   if (!older.success) return older;
   return state.safeParse({ ...older.data, v: PARTY_STATE_VERSION });
 }
 
+/**
+ * Reads a document of versions 1 to 12, upgraded to the shape of version 12. A document before
+ * version 12 has groups without stamps, which count as opened with the party.
+ */
+function readStateV12(stored: unknown, version: unknown) {
+  if (version === 12) return stateV12.safeParse(stored);
+  const older = readStateV11(stored, version);
+  if (!older.success) return older;
+  return stateV12.safeParse({ ...older.data, v: 12 });
+}
+
 /** Reads a document of versions 1 to 11, upgraded to the shape of version 11. */
 function readStateV11(stored: unknown, version: unknown) {
   if (version === 11) return stateV11.safeParse(stored);
@@ -654,10 +700,12 @@ export type PartyColumns = Omit<
 };
 
 /** The parts of a document that the kind of the party has: exactly these, and no others. */
-function kindParts(party: Party): Pick<PartyState, 'raid' | 'timed' | 'meetup' | 'train'> {
+function kindParts(party: Party): Pick<PartyState, 'raid' | 'timed' | 'meetup' | 'train' | 'max'> {
   switch (party.type) {
     case 'raid':
       return { raid: party.raid };
+    case 'max':
+      return { max: { ...party.max, spot: { ...party.max.spot } } };
     case 'meetup':
       return { timed: party.timed, meetup: party.meetup };
     case 'train':
@@ -728,9 +776,7 @@ export function partyFromStored(
 ): StoredParty {
   const fail = (problem: string): StoredParty => ({ ok: false, id: columns.id, problem });
   const { type } = columns;
-  if (type !== 'raid' && type !== 'meetup' && type !== 'train') {
-    return fail(`a party of type "${type}"`);
-  }
+  if (!isPartyType(type)) return fail(`a party of type "${type}"`);
   const parsed = readState(storedState);
   if (!parsed.success) return fail(`state: ${z.prettifyError(parsed.error)}`);
   const mirrorMessages = mirrors.safeParse(storedMirrors);
@@ -739,6 +785,7 @@ export function partyFromStored(
   const { anonymous, makerName, groups, defaultGroupId } = parsed.data;
   const { raid: raidDetails, timed: timedDetails, meetup: meetupDetails } = parsed.data;
   const trainDetails = parsed.data.train;
+  const maxDetails = parsed.data.max;
   const attendees: Record<string, Attendee> = {};
   for (const { id, ...attendee } of parsed.data.attendees) attendees[id] = attendee;
   const messages: MirrorMessage[] = mirrorMessages.data;
@@ -757,8 +804,31 @@ export function partyFromStored(
     if (timedDetails) return fail('a raid with a name and a start of its own');
     if (meetupDetails) return fail('a raid with the details of a meetup');
     if (trainDetails) return fail('a raid with the details of a train');
+    if (maxDetails) return fail('a raid with the details of a max battle');
     return { ok: true, party: { ...core, type, raid: raidDetails } };
   }
+  if (type === 'max') {
+    if (!maxDetails) return fail('a max battle without its max battle details');
+    if (raidDetails || timedDetails || meetupDetails || trainDetails) {
+      return fail('a max battle with the details of another kind');
+    }
+    if (columns.gymId !== null) return fail('a max battle with a gym');
+    if (columns.hatchTime !== null) return fail('a max battle with a hatch time');
+    const { spot } = maxDetails;
+    // The refinement above says so; the type of a power spot is narrower than a known place's.
+    if (spot.kind !== 'pin' && spot.kind !== 'powerspot') return fail('a max battle at a gym');
+    return {
+      ok: true,
+      party: {
+        ...core,
+        type,
+        gymId: null,
+        hatchTime: null,
+        max: { ...maxDetails, spot: spot.kind === 'pin' ? spot : { ...spot, kind: spot.kind } },
+      },
+    };
+  }
+  if (maxDetails) return fail(`a ${type} with the details of a max battle`);
   // A timed party: a meetup or a train.
   if (!timedDetails) return fail(`a ${type} without its name and start`);
   if (type === 'meetup' && !meetupDetails) return fail('a meetup without its meetup details');
diff --git a/src/domain/party/party.test.ts b/src/domain/party/party.test.ts
index f4c09c4897cc46d6900c050a8f2f0a72134dfb84..9fdb5b76091009bc7e02cb95ff52c5468dbcc3e7 100644
--- a/src/domain/party/party.test.ts
+++ b/src/domain/party/party.test.ts
@@ -3,12 +3,12 @@ import { testMeetup, testRaid, testTrain } from '../../../test/support/parties.j
 import { hasGroups, isBattle, isTimed, type Party } from './party.js';
 
 /**
- * A party of a kind this build does not know yet, as a later kind would come (a max battle, plan
+ * A party of a kind this build does not know, as a later kind comes (a max battle came so in plan
  * 8X-3): the guards must not take it for a timed party by elimination (design
  * `2026-10-20-max-battles-design.md`, 3.1, review 1).
  */
 function ofAnotherKind(): Party {
-  return { ...testRaid(), type: 'max' } as unknown as Party;
+  return { ...testRaid(), type: 'carnival' } as unknown as Party;
 }
 
 describe('the guards of the kinds of party', () => {
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 6cc8e613cb3d6a6c94f0100ccd0311c898786043..d122277cfcce42613e693d7fa879d00ec615884b 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -1,4 +1,5 @@
-import type { Place } from '../geo/place.js';
+import type { DroppedPin, KnownPlace, Place } from '../geo/place.js';
+import type { MaxTier } from '../pogo/max-tier.js';
 import type { RaidTier } from '../pogo/raid-tier.js';
 import { PartyStatus } from './status.js';
 
@@ -158,7 +159,17 @@ export interface MirrorMessage {
 export const MIRROR_KINDS = ['ex', 'remote', 'status', 'region'] as const;
 export type MirrorKind = (typeof MIRROR_KINDS)[number];
 
-export type PartyType = 'raid' | 'train' | 'meetup';
+/**
+ * Every kind of party, in one list (review A of 8X-3, X3-B-1): the type, the stored party's check
+ * and the moderators' reports are built from it, so a kind added later reaches them all.
+ */
+export const PARTY_TYPES = ['raid', 'train', 'meetup', 'max'] as const;
+export type PartyType = (typeof PARTY_TYPES)[number];
+
+/** Whether a stored text names a kind of party. */
+export function isPartyType(value: string): value is PartyType {
+  return (PARTY_TYPES as readonly string[]).includes(value);
+}
 export type PartyLifeStatus = 'active' | 'ended';
 
 /** What every kind of party has. Times are epoch milliseconds. */
@@ -237,6 +248,8 @@ export function bossOf(party: Party): RaidBossRef | null {
       return party.raid.boss;
     case 'train':
       return party.train.boss;
+    case 'max':
+      return party.max.boss;
     case 'meetup':
       return null;
   }
@@ -411,7 +424,40 @@ export interface TrainParty extends PartyCore {
   train: TrainDetails;
 }
 
-export type Party = RaidParty | MeetupParty | TrainParty;
+/**
+ * Where a max battle is (design `2026-10-20-max-battles-design.md`, 3.1): a power spot as it was
+ * named (a snapshot, as a meetup's place: the post shows it as it is now while it is the same
+ * place, `shownPlace`), or a pin, an "Unlisted power spot" (Q7: a maps link or coordinates with
+ * no known power spot within `PIN_NEAR_METRES`).
+ */
+/** A power spot as a max battle keeps it: a known place of that kind. */
+export type PowerSpot = KnownPlace & { kind: 'powerspot' };
+
+export type MaxSpot = PowerSpot | DroppedPin;
+
+export interface MaxDetails {
+  /** Dynamax 1 to 5 stars, or Gigantamax (`MAX_TIERS`). */
+  tier: MaxTier;
+  /** Always known: there is no egg (design 1). */
+  boss: RaidBossRef;
+  spot: MaxSpot;
+}
+
+/**
+ * A max battle (plan 8X-3; design 3.1): a battle at a power spot or a pin, with groups of a lobby
+ * size by its tier, Done meaning completed (`isBattle`), and an end that is always set (the day's
+ * last battle time or earlier: `defaultMaxEnd`). `gymId` stays null (that column serves the one
+ * raid per gym rule; one max battle per spot is the store's, `PartyStore.maxAt`), and it hatches
+ * from nothing.
+ */
+export interface MaxParty extends PartyCore {
+  type: 'max';
+  gymId: null;
+  hatchTime: null;
+  max: MaxDetails;
+}
+
+export type Party = RaidParty | MeetupParty | TrainParty | MaxParty;
 
 /**
  * A party with `timed`: a name, a start time for everybody and an end that members set. What is
@@ -435,13 +481,17 @@ export function isTimed(party: Party): party is TimedParty {
 /**
  * A party that is a battle (design `2026-10-20-max-battles-design.md`, 3.1, review 3): Done
  * means the member completed it, not that they leave; its present members are asked whether
- * they completed it (`completeRaid`, `askGroupWhetherComplete`, `completeUnanswered`). A raid,
- * and from plan 8X-3 a max battle.
+ * they completed it (`completeRaid`, `askGroupWhetherComplete`, `completeUnanswered`). A raid or
+ * a max battle.
  */
-export type BattleParty = RaidParty;
+export type BattleParty = RaidParty | MaxParty;
 
 export function isBattle(party: Party): party is BattleParty {
-  return party.type === 'raid';
+  return party.type === 'raid' || party.type === 'max';
+}
+
+export function isMax(party: Party): party is MaxParty {
+  return party.type === 'max';
 }
 
 export function isMeetup(party: Party): party is MeetupParty {
@@ -500,6 +550,7 @@ const PARTY_WORDS: Readonly<Record<PartyType, string>> = {
   raid: 'raid',
   train: 'train',
   meetup: 'meetup',
+  max: 'max battle',
 };
 
 /** What a kind of party is called in a sentence: `this raid`, `this train`, `this meetup`. */
@@ -548,6 +599,13 @@ export type PartyProblem =
   | 'start-after-end'
   /** Another raid of this kind already holds the gym. */
   | 'gym-taken'
+  /** Another max battle already holds the spot (plan 8X-3: a later end of an ended one). */
+  | 'spot-taken'
+  /**
+   * A max battle's boss changed between Dynamax and Gigantamax (design 3.1): the lobby size would
+   * jump; it is reported anew.
+   */
+  | 'max-kind-change'
   /** The gym lies in no region of the raid's server that has a forum for its post. */
   | 'other-region'
   /** The post of a raid in the region it moves to went while it was being made: it stays. */
diff --git a/src/domain/party/tick.ts b/src/domain/party/tick.ts
index 2149ac0f3d8bee568839c6dc22134f93ee7a1f94..b0f6b83abf15210c98c584e828d477874e1f3d03 100644
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -6,10 +6,13 @@ import type { RaidDurationRules } from '../time/raid-durations.js';
 import { askGroupWhetherComplete, completeUnanswered } from './attendance.js';
 import {
   attendeeOf,
+  isMax,
   isRaid,
   isTimed,
   isTrain,
+  type BattleParty,
   type GroupId,
+  type MaxParty,
   type Party,
   type PartyGroup,
   type RaidBossRef,
@@ -111,7 +114,8 @@ export function partyTick(party: Party, input: TickInput): TickResult {
   if (!party.saved && party.deletionTime !== null && input.now >= party.deletionTime) {
     return { party, effects: [{ kind: 'end' }], render: false };
   }
-  return isRaid(party) ? raidTick(party, input) : timedTick(party, input);
+  if (isRaid(party)) return raidTick(party, input);
+  return isMax(party) ? maxTick(party, input) : timedTick(party, input);
 }
 
 /**
@@ -186,7 +190,7 @@ function timedTick(party: TimedParty, input: TickInput): TickResult<TimedParty>
 }
 
 function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
-  const { now, settings } = input;
+  const { now } = input;
   const effects: TickEffect[] = [];
   let current = party;
 
@@ -207,7 +211,26 @@ function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
     effects.push({ kind: 'stage', from, to, bossSet });
   }
 
-  // A meeting time stays shown for a while after it passed; then the group is asked.
+  // Nobody can have completed an egg (a meeting time from before the hatch was corrected).
+  current = battleClock(current, input, effects, (asked) => raidStage(asked, now) !== 'egg');
+  // Times are shown without a date only on the day itself.
+  return { party: current, effects, render: current !== party || dayChanged(input) };
+}
+
+/**
+ * What the clock does to a battle besides its stages (a raid's and a max battle's alike): a
+ * meeting time stays shown for a while after it passed, then the group is asked whether it is
+ * done (unless `mayAsk` says nobody can be: an egg); who did not answer in time counts as done;
+ * the archiving is scheduled and warned of as for a raid.
+ */
+function battleClock<P extends BattleParty>(
+  party: P,
+  input: TickInput,
+  effects: TickEffect[],
+  mayAsk: (party: P) => boolean,
+): P {
+  const { now, settings } = input;
+  let current = party;
   for (let group of current.groups) {
     if (group.startTime === undefined || now <= group.startTime) continue;
     if (group.startClearTime === undefined) {
@@ -217,8 +240,7 @@ function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
     if (group.startClearTime !== undefined && now > group.startClearTime) {
       const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
       current = withGroup(current, rest);
-      // Nobody can have completed an egg (a meeting time from before the hatch was corrected).
-      if (raidStage(current, now) === 'egg') continue;
+      if (!mayAsk(current)) continue;
       const asked = askGroupWhetherComplete(current, group.id, now, settings.raidCompleteTimeout);
       current = asked.party;
       if (asked.asked.length > 0) {
@@ -238,11 +260,24 @@ function raidTick(party: RaidParty, input: TickInput): TickResult<RaidParty> {
     current = warned;
     effects.push({ kind: 'warn', deletionTime: warned.deletionTime });
   }
+  return current;
+}
 
-  // Times are shown without a date only on the day itself.
-  return { party: current, effects, render: current !== party || dayChanged(input) };
+/**
+ * The clock of a max battle (plan 8X-3; design 3.1): no hatch and no stage of its own; the
+ * meeting times, the questions and the archiving as a raid's (`battleClock`, warned
+ * `deletionWarningTime` ahead). When its end passes the post is shown anew ("Ended", by the
+ * previous tick, as a timed party's end), and on a new day.
+ */
+function maxTick(party: MaxParty, input: TickInput): TickResult<MaxParty> {
+  const { now, previous } = input;
+  const effects: TickEffect[] = [];
+  const current = battleClock(party, input, effects, () => true);
+  const end = party.endTime;
+  const ended = end !== null && previous !== null && previous < end && now >= end;
+  return { party: current, effects, render: current !== party || ended || dayChanged(input) };
 }
 
-function withGroup(party: RaidParty, group: PartyGroup): RaidParty {
+function withGroup<P extends BattleParty>(party: P, group: PartyGroup): P {
   return { ...party, groups: party.groups.map((g) => (g.id === group.id ? group : g)) };
 }
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 5f6dad5ad90c075b4dabf75311cc7e520f25145b..cdbb22ee38a24679d76c6841df88dc6d140fae2c 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -2,6 +2,7 @@ import {
   attendeeOf,
   newestFirst,
   isRaid,
+  isTimed,
   mayArrange,
   type Attendee,
   type MeetupParty,
@@ -349,6 +350,8 @@ export function mapParty(party: Party, input: PartyViewInput): MapParty | null {
   if (input.barred.has(forumChannelId)) return null;
   const link = postLink(input.guildId, forumPostId);
   if (isRaid(party)) return raidOf(party, link, input);
+  // Max battles are drawn from plan 8X-5 (design 7).
+  if (!isTimed(party)) return null;
   if (timedOver(party, input.now)) return null;
   return party.type === 'train' ? trainOf(party, link, input) : meetupOf(party, link, input);
 }
diff --git a/src/render/activity.ts b/src/render/activity.ts
index ebe8375754062c33dcff5baae14e46057a201264..6bd676c5ccc1dc302e80f9e0318376a1689dcc04 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -129,9 +129,17 @@ export function problemText(
     case 'bad-duration':
       return 'A raid lasts at least 1 minute and not longer than a few hours.';
     case 'already-done':
-      return 'You are done with this raid. Use Join or Here if you are back.';
+      // A raid's or a max battle's: the battles have Done (`isBattle`).
+      return `You are done with this ${word === 'max battle' ? word : 'raid'}. Use Join or Here if you are back.`;
     case 'gym-taken':
       return 'That gym already has a raid like this one.';
+    case 'spot-taken':
+      return 'That spot has another max battle by now: this one stays as it is.';
+    case 'max-kind-change':
+      return (
+        'A Dynamax battle cannot become a Gigantamax one, nor the other way round (the lobby ' +
+        'size would change). Report the new battle with `/max`.'
+      );
     case 'not-a-move':
       return 'The boss of this raid does not have that move.';
     case 'bad-name':
diff --git a/src/services/gym-upkeep.ts b/src/services/gym-upkeep.ts
index 25950ce34b9f78928a45656ea568e9a89766e9fa..d6bc7326bfebf457add1fdd941d180b810f31b58 100644
--- a/src/services/gym-upkeep.ts
+++ b/src/services/gym-upkeep.ts
@@ -3,7 +3,7 @@ import type { Gym, GymStorage } from '../db/repositories/gym-repository.js';
 import { metresBetween } from '@pine/wayspot-core/distance';
 import { geodataJson, placesRadius, placesText } from '../domain/geo/google.js';
 import { nearestGymChanges, type NearestEvent } from '../domain/gyms/nearest.js';
-import { isRaid, isTrain, type Party } from '../domain/party/party.js';
+import { isMeetup, isRaid, isTrain, type Party } from '../domain/party/party.js';
 import type { Logger } from '../log.js';
 import type { GeoFailure, GeoGateway } from './geo-gateway.js';
 import { MemoryGymLookups, type GymLookups } from './gym-lookups.js';
@@ -197,7 +197,9 @@ export class GymUpkeep {
           ? party.gymId === gymId
           : isTrain(party)
             ? party.train.route.includes(gymId)
-            : party.meetup.place?.kind === 'gym' && party.meetup.place.id === String(gymId);
+            : isMeetup(party) &&
+              party.meetup.place?.kind === 'gym' &&
+              party.meetup.place.id === String(gymId);
         if (shows) posts.changed(party.id);
       }
     } catch (err) {
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index b69e88e16098b74000068cf90b36421b9bb31c1f..1f5302cf8467350efd31ce4a41bc07f56904c2d5 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -1,3 +1,4 @@
+import { maxSpotName } from '../domain/party/max.js';
 import type { Settings } from '../config/settings.js';
 import type { GymTargetStorage } from '../db/repositories/gym-notification-repository.js';
 import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
@@ -19,6 +20,7 @@ import {
 import {
   groupOf,
   headCount,
+  isMax,
   isMeetup,
   type MeetupParty,
   type MeetupPlace,
@@ -586,6 +588,7 @@ export class NotifyService implements PartyNotifier {
       const { gymId } = party;
       return `the raid at ${plainNoLinks(gymName(gymId === null ? undefined : this.options.gyms.get(gymId)))}`;
     }
+    if (isMax(party)) return `the max battle at ${plainNoLinks(maxSpotName(party.max.spot))}`;
     return `the ${party.type} ${plainNoLinks(party.timed.name)}`;
   }
 
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 20788691f484e263735531ea9493582d4d98c9b2..c38fa7efd9e04bd1bf4ece241257bc1cc5b0bc1d 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -756,6 +756,9 @@ export class PartyService {
         return renderMeetupPost({ ...this.meetupView(party), ...last });
       case 'train':
         return renderTrainPost({ ...this.trainView(party), ...last });
+      case 'max':
+        // Its renderer is plan 8X-3's post task; nothing makes a max battle before /max.
+        throw new Error(`No post for max battle ${party.id} yet`);
     }
   }
 
diff --git a/src/services/party-store.max.test.ts b/src/services/party-store.max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4db43a1812ff6443a3919f899975e2ffc6105606
--- /dev/null
+++ b/src/services/party-store.max.test.ts
@@ -0,0 +1,103 @@
+import { describe, expect, it } from 'vitest';
+import {
+  at,
+  MINUTE,
+  PARTY_NOW,
+  partyStoreWith,
+  TEST_PIN,
+  TEST_SPOT,
+  testMax,
+} from '../../test/support/parties.js';
+import { endParty, type MaxSpot } from '../domain/party/party.js';
+
+const ID = (n: number): string => `00000000-0000-4000-8000-00000000010${String(n)}`;
+
+/** Another power spot of the region. */
+const OTHER_SPOT: MaxSpot = { ...TEST_SPOT, id: 'beef0000beef0000beef0000beef0000.16' };
+
+/** A pin about 30 m from `TEST_PIN`, and one about 300 m away. */
+const NEAR_PIN: MaxSpot = { ...TEST_PIN, lat: 40.00227 };
+const FAR_PIN: MaxSpot = { ...TEST_PIN, lat: 40.0047 };
+
+describe('PartyStore: one max battle per spot (plan 8X-3)', () => {
+  it('finds the max battle at a power spot while its end has not come', async () => {
+    const battle = testMax({ id: ID(1), endTime: at('2026-10-13T14:30') });
+    const { store } = await partyStoreWith([battle]);
+    expect(store.maxAt(1, TEST_SPOT, PARTY_NOW)).toBe(battle);
+    expect(store.maxAt(1, OTHER_SPOT, PARTY_NOW)).toBeUndefined();
+    // Its end has come: it stands in nobody's way, though its post is still open.
+    expect(store.maxAt(1, TEST_SPOT, at('2026-10-13T14:30'))).toBeUndefined();
+  });
+
+  it('takes a pin for the spot of an active pin within 50 metres, not one farther', async () => {
+    const battle = testMax({ id: ID(1), spot: TEST_PIN });
+    const { store } = await partyStoreWith([battle]);
+    expect(store.maxAt(1, NEAR_PIN, PARTY_NOW)).toBe(battle);
+    expect(store.maxAt(1, FAR_PIN, PARTY_NOW)).toBeUndefined();
+    expect(store.maxAt(1, TEST_SPOT, PARTY_NOW)).toBeUndefined();
+  });
+
+  it('stores a reported max battle unless its spot has one, and then hands that one back', async () => {
+    const { store, storage } = await partyStoreWith();
+    const first = testMax({ id: ID(1) });
+    await expect(store.addMaxUnlessTaken(first, PARTY_NOW)).resolves.toEqual({
+      added: true,
+      party: first,
+    });
+    const second = testMax({ id: ID(2), boss: { key: 'sneasel' }, now: PARTY_NOW + MINUTE });
+    await expect(store.addMaxUnlessTaken(second, PARTY_NOW + MINUTE)).resolves.toEqual({
+      added: false,
+      existing: first,
+    });
+    expect([...storage.rows.keys()]).toEqual([ID(1)]);
+  });
+
+  it('lets two reports of one spot at once store one battle: the check and the write are one step', async () => {
+    const { store } = await partyStoreWith();
+    const outcomes = await Promise.all([
+      store.addMaxUnlessTaken(testMax({ id: ID(1) }), PARTY_NOW),
+      store.addMaxUnlessTaken(testMax({ id: ID(2) }), PARTY_NOW),
+      store.addMaxUnlessTaken(testMax({ id: ID(3), spot: NEAR_PIN }), PARTY_NOW),
+      store.addMaxUnlessTaken(testMax({ id: ID(4), spot: TEST_PIN }), PARTY_NOW),
+    ]);
+    expect(outcomes.map((outcome) => outcome.added)).toEqual([true, false, true, false]);
+    expect(store.active().map((party) => party.id)).toEqual([ID(1), ID(3)]);
+  });
+
+  // Review A, X3-B-6: a Wayfarer id is the same in every server that has the spot.
+  it('lets a battle at the spot stand in the way of its own server only', async () => {
+    const elsewhere = testMax({ id: ID(1), guildId: 2 });
+    const { store } = await partyStoreWith([elsewhere]);
+    expect(store.maxAt(1, TEST_SPOT, PARTY_NOW)).toBeUndefined();
+    expect(store.maxAt(2, TEST_SPOT, PARTY_NOW)).toBe(elsewhere);
+    const here = testMax({ id: ID(2) });
+    await expect(store.addMaxUnlessTaken(here, PARTY_NOW)).resolves.toEqual({
+      added: true,
+      party: here,
+    });
+  });
+
+  it('stores a new battle at a spot whose battle has ended, and finds an ended one nowhere', async () => {
+    const over = endParty(testMax({ id: ID(1) }));
+    const { store } = await partyStoreWith([over]);
+    const fresh = testMax({ id: ID(2) });
+    await expect(store.addMaxUnlessTaken(fresh, PARTY_NOW)).resolves.toEqual({
+      added: true,
+      party: fresh,
+    });
+  });
+
+  it('waits for a spot held by another change in whenIdle', async () => {
+    const { store } = await partyStoreWith();
+    let release!: () => void;
+    const held = store.withSpotLock(TEST_SPOT, () => new Promise<void>((r) => (release = r)));
+    let idle = false;
+    const waiting = store.whenIdle().then(() => (idle = true));
+    await Promise.resolve();
+    expect(idle).toBe(false);
+    release();
+    await held;
+    await waiting;
+    expect(idle).toBe(true);
+  });
+});
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index d84ae5cd4c63fa3b88195839170a2a00a5c94444..a5bc631775e09a4a5ebeda66602b16dfa55c4295 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -1,7 +1,15 @@
 import type { PartyForum, PartySave, PartyStorage } from '../db/repositories/party-repository.js';
 import type { HistoryNote, PartyEnd, PartyWrite } from '../domain/history/party-history.js';
 import { pruneGroups } from '../domain/party/attendance.js';
-import { isRaid, type Party, type RaidParty } from '../domain/party/party.js';
+import { blocksNewMax, sameSpot, spotKey } from '../domain/party/max.js';
+import {
+  isMax,
+  isRaid,
+  type MaxParty,
+  type MaxSpot,
+  type Party,
+  type RaidParty,
+} from '../domain/party/party.js';
 import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
 import type { RaidKind } from '../domain/time/party-time.js';
 import type { Logger } from '../log.js';
@@ -33,6 +41,13 @@ export interface PartyProvider {
    * or elite): one that has not ended by the clock.
    */
   raidAt(gymId: number, kind: RaidKind, now: number): RaidParty | undefined;
+  /**
+   * The max battle at this spot that stands in the way of a new report there (plan 8X-3; design
+   * 3.1): one whose end has not come, at the same power spot, or at a pin within 50 metres of
+   * this pin (`sameSpot`), of the same server (`guildId`, its row: a power spot's Wayfarer id is the
+   * same in every server that has it).
+   */
+  maxAt(guildId: number, spot: MaxSpot, now: number): MaxParty | undefined;
 }
 
 export interface PartyStoreOptions {
@@ -80,6 +95,8 @@ export class PartyStore implements PartyProvider {
   private readonly parties = new Map<string, Party>();
   private readonly locks = new KeyedLock<string>();
   private readonly gymLocks = new KeyedLock<number>();
+  /** By spot (`spotKey`): a power spot's Wayfarer id, one key for every pin. */
+  private readonly spotLocks = new KeyedLock<string>();
   private readonly listeners: PartyListener[] = [];
   /** The regions that take no new party (`closeRegion`). */
   private readonly closed = new Set<number>();
@@ -179,6 +196,15 @@ export class PartyStore implements PartyProvider {
       );
   }
 
+  maxAt(guildId: number, spot: MaxSpot, now: number): MaxParty | undefined {
+    return this.active()
+      .filter(isMax)
+      .find(
+        (party) =>
+          party.guildId === guildId && sameSpot(party.max.spot, spot) && blocksNewMax(party, now),
+      );
+  }
+
   /**
    * Stores a new party. Rejects when the row cannot be written (its id or post already exists),
    * and with a `RegionClosedError`, before anything is written, for a party of a region that
@@ -452,6 +478,34 @@ export class PartyStore implements PartyProvider {
     return this.gymLocks.run(gymId, work);
   }
 
+  /**
+   * Stores a reported max battle unless its spot has one of its server that has not ended by the
+   * clock (`maxAt`), which is then returned and nothing is stored: the one way a max battle is
+   * stored (design 3.1). The check and the insert happen under the spot's lock (`withSpotLock`,
+   * one lock for the spot in every server), so two reports cannot both find the spot free.
+   */
+  async addMaxUnlessTaken(
+    party: MaxParty,
+    now: number,
+  ): Promise<{ added: true; party: MaxParty } | { added: false; existing: MaxParty }> {
+    const { spot } = party.max;
+    return this.withSpotLock(spot, async () => {
+      const existing = this.maxAt(party.guildId, spot, now);
+      if (existing) return { added: false, existing };
+      await this.add(party);
+      return { added: true, party };
+    });
+  }
+
+  /**
+   * Runs `work` alone for this spot (`spotKey`: a power spot, or every pin at once): what can make
+   * a max battle block a spot (a report, an end moved later) checks and writes inside it, as for a
+   * gym (`withGymLock`, whose rules hold: not re-entrant, never across a call to Discord).
+   */
+  async withSpotLock<T>(spot: MaxSpot, work: () => Promise<T>): Promise<T> {
+    return this.spotLocks.run(spotKey(spot), work);
+  }
+
   /**
    * Those of these forum posts that are the post of a party that has ended, from the database:
    * ended parties are not kept in memory.
@@ -471,6 +525,6 @@ export class PartyStore implements PartyProvider {
 
   /** Resolves once every change and add in flight or waiting has finished (for shutdown). */
   async whenIdle(): Promise<void> {
-    await Promise.all([this.locks.whenIdle(), this.gymLocks.whenIdle()]);
+    await Promise.all([this.locks.whenIdle(), this.gymLocks.whenIdle(), this.spotLocks.whenIdle()]);
   }
 }
diff --git a/test/support/parties.ts b/test/support/parties.ts
index c9a4b7d79275d8a18f643350d702338aaf0ffa3b..8056344995d13077758c74fd9b83ac9d7477dcbf 100644
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -9,9 +9,13 @@ import type {
 } from '../../src/db/repositories/party-repository.js';
 import type { HistoryNote } from '../../src/domain/history/party-history.js';
 import { partyFromStored, partyMirrors, partyState } from '../../src/domain/party/party-state.js';
+import type { DroppedPin } from '../../src/domain/geo/place.js';
+import { createMax, type NewMax } from '../../src/domain/party/max.js';
 import { createMeetup, type NewMeetup } from '../../src/domain/party/meetup.js';
 import type {
   Attendee,
+  MaxParty,
+  PowerSpot,
   MeetupParty,
   Party,
   RaidParty,
@@ -131,6 +135,57 @@ export function testTrain(overrides: Partial<NewTrain> = {}): TrainParty {
   return made.party;
 }
 
+/**
+ * An invented power spot in region 1 (West), as a max battle names it: its Wayfarer id, title,
+ * place, address and picture.
+ */
+export const TEST_SPOT: PowerSpot = {
+  kind: 'powerspot',
+  id: 'c0ffee00c0ffee00c0ffee00c0ffee00.16',
+  title: 'Gazebo of the Park',
+  lat: 40.0005,
+  lon: -80.0005,
+  address: '1 Park Lane',
+  image: null,
+};
+
+/** A pin in region 1 that no known power spot is near: an "Unlisted power spot". */
+export const TEST_PIN: DroppedPin = {
+  kind: 'pin',
+  lat: 40.002,
+  lon: -80.002,
+  near: null,
+  linkName: null,
+};
+
+/**
+ * A Dynamax Machamp (2★) battle at `TEST_SPOT` in region 1, reported at `PARTY_NOW` by
+ * `REPORTER`, who is signed up as interested, ending at 21:00 that day (the default last battle
+ * time). Nothing of it exists on Discord yet.
+ */
+export function testMax(overrides: Partial<NewMax> = {}): MaxParty {
+  return createMax({
+    id: '00000000-0000-4000-8000-000000000004',
+    guildId: 1,
+    regionId: 1,
+    createdById: REPORTER,
+    anonymous: false,
+    autoStatus: PartyStatus.Interested,
+    tier: 'D2',
+    boss: { key: 'machamp' },
+    spot: TEST_SPOT,
+    endTime: at('2026-10-13T21:00'),
+    now: PARTY_NOW,
+    ...overrides,
+  });
+}
+
+/** The party as the max battle it is, for a test that reads or changes what only it has. */
+export function asMax(party: Party | undefined): MaxParty {
+  if (party?.type !== 'max') throw new Error(`not a max battle: ${party?.type ?? 'no party'}`);
+  return party;
+}
+
 /** The party as the train it is, for a test that reads or changes what only a train has. */
 export function asTrain(party: Party | undefined): TrainParty {
   if (party?.type !== 'train') throw new Error(`not a train: ${party?.type ?? 'no party'}`);
@@ -173,7 +228,9 @@ function survivesStorage(party: Party): void {
   const { defaultGroupId: _defaultGroupId, prompts: _prompts, ...kept } = rest;
   // The details of its kind are in the document, the rest are the columns.
   const columns = Object.fromEntries(
-    Object.entries(kept).filter(([key]) => !['raid', 'timed', 'meetup', 'train'].includes(key)),
+    Object.entries(kept).filter(
+      ([key]) => !['raid', 'timed', 'meetup', 'train', 'max'].includes(key),
+    ),
   ) as typeof kept;
   const document: unknown = JSON.parse(JSON.stringify(partyState(party)));
   const mirrors: unknown = JSON.parse(JSON.stringify(partyMirrors(party)));
@@ -365,5 +422,6 @@ export function noParties(): PartyProvider {
     active: () => [],
     inRegion: () => [],
     raidAt: () => undefined,
+    maxAt: () => undefined,
   };
 }
````

### Task 3: 8X-3 task 3: max battles always on, big events, the default end

Prototype commit: `52f2473b7bae05e200c33f2072215b8e32a154e4`

- Max battles are always on (Matt, 2026-10-21): settings.maxBattles has a
  default for every key (url MAX_BOSS_FEED_URL, refreshMinutes 360,
  firstBattle 06:00, lastBattle 21:00), as lobbies has; an old file, the
  test fixture and a converted one have max battles on. The off paths are
  gone: app.ts makes the MaxBossService always, ctx.maxBossAdmin is no
  longer optional, /admin boss lost "Max battles are off here" and
  maxAdminOf; NO_MAX_BOSSES moved to the test support.
- The big events (Wild Area, GO Tour, GO Fest Global; BIG_EVENT_TYPES):
  parseBigEventFeed reads the global editions only (in-person city editions
  are out of scope), RaidEventService.bigEvents(), bigEventAt. The fixture
  max-events.json gains the recorded feed's six wild-area and
  pokemon-go-tour entries unchanged; 8X-2's tests are as they were.
- The default end (design Q9, Matt 2026-10-21: rotations on the hour and
  half hour, a report is of a battle in progress): defaultMaxEnd, the next
  :00 or :30 in a short event, the next hour all day and for a Gigantamax
  battle in a big event or outside any event (GIGANTAMAX_OUTSIDE_EVENTS),
  else the last battle time; capped there; over at and after it; before the
  first battle the rotation counts from it. nextRotationEnd for the
  ending-soon dialog of /max.
- Upcoming bosses after their event: withoutEndedUpcoming leaves out of
  /max's list a boss the feed first had from an event's day on once that
  event stopped featuring it and no event names it now or later.
- AppContext.raidEvents is RaidEventProvider & MaxEventProvider.

**Files:**

```
 docs/architecture/utilities.md                          |   6 +-
 docs/guides/new-instance.md                             |   2 +-
 docs/superpowers/plans/2026-10-21-phase-8x2-staging.md  |  12 ++--
 docs/superpowers/specs/2026-10-20-max-battles-design.md |   6 +-
 src/app-context.ts                                      |  15 ++--
 src/app.ts                                              |  37 +++++-----
 src/commands/admin/boss-input.ts                        |  15 +---
 src/commands/admin/boss-list.test.ts                    |   5 +-
 src/commands/admin/boss-list.ts                         |  16 ++---
 src/commands/admin/boss-max.test.ts                     |  11 +--
 src/commands/admin/boss-overrides.ts                    |  40 +++++------
 src/config/settings.test.ts                             |  19 +++--
 src/config/settings.ts                                  |  21 ++++--
 src/domain/pogo/max-boss-list.after.test.ts             |  58 +++++++++++++++
 src/domain/pogo/max-boss-list.ts                        |  55 ++++++++++++++
 src/domain/time/big-events.test.ts                      |  85 ++++++++++++++++++++++
 src/domain/time/max-end.test.ts                         | 138 ++++++++++++++++++++++++++++++++++++
 src/domain/time/max-end.ts                              | 133 ++++++++++++++++++++++++++++++++++
 src/domain/time/max-events.ts                           |  66 +++++++++++++++++
 src/services/max-boss-service.test.ts                   |  54 ++++++++++++--
 src/services/max-boss-service.ts                        |  54 +++++++++-----
 src/services/raid-event-service.test.ts                 |  50 +++++++++++++
 src/services/raid-event-service.ts                      |  35 ++++++++-
 test/fixtures/max-events.json                           |  96 +++++++++++++++++++++++++
 test/support/boss-commands.ts                           |  11 +--
 test/support/max-events.ts                              |   5 +-
 test/support/raid-events.ts                             |  18 +++--
 test/support/test-context.ts                            |  19 +++--
 28 files changed, 934 insertions(+), 148 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/boss-list.test.ts src/commands/admin/boss-max.test.ts src/config/settings.test.ts src/domain/pogo/max-boss-list.after.test.ts src/domain/time/big-events.test.ts src/domain/time/max-end.test.ts src/services/max-boss-service.test.ts src/services/raid-event-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 52f2473b7bae05e200c33f2072215b8e32a154e4 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 task 3: max battles always on, big events, the default end`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 56bdc076b548ddaa5e9d342f3e7f78e8c1b8e830..f04e1cf1ea0283f58531085568fc051aff123c24 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -23,10 +23,12 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Staff change the raid boss list only through `ctx.raidBossAdmin` (`RaidBossService` as `RaidBossAdmin`: overrides, `feedBosses()`, `sync()`; override writes and the end of a sync run one at a time). A sync's change is `FeedChange` with `seen`, the difference of `effectiveBosses` before and after with the same overrides (`diffBosses`, `src/domain/pogo/boss-diff.ts`): what members see. `RaidBossAnnouncer` posts `seen` in every server's bot-updates channel when `settings.raidBosses.announceChanges`, and the out-of-date warning (time, never the error) in the moderators' channel; nothing before `ready()`, nothing after `close()`. A failed sync has a `kind` (never show `reason`). A new autoset for a tier replaces the tier's earlier one. A boss the game data does not know has a key starting with `UNKNOWN_KEY_PREFIX` (`~`), never equal to a catalogue key and never stored; `howIdentified` says how a feed boss was matched.
 - Both boss lists are one machine with two families (plan 8X-2): `BossFeedService<T>` (`src/services/boss-feed-service.ts`: the stored list at start, the first read when it is older than the refresh, retries, the out-of-date warning, override writes one at a time) with a `BossFeedFamily` (its noun in the log, its parser, its list in effect, its override rules); `RaidBossService` and `MaxBossService` are its families. The list rules (`familyBosses`, `familyOverrideKeys`, `familyReport`, `diffFeedIn`, `diffBossesIn`) take the family's tier operations (`RAID_OPS`, `MAX_OPS`); `effectiveBosses`, `bossReport` and the rest keep their raid signatures. The tables are kept apart per family by their levels (`RaidBossRepository`: every level but the max tiers, so the retired EX level stays the raids' to report; `MaxBossRepository`: `MAX_TIERS`): every read and write filters by the family, and an override without a tier (a shiny one for every tier) is a raid override.
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
-- Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; none while `settings.maxBattles` is absent, `NO_MAX_BOSSES`), staff's list from `ctx.maxBossAdmin` (undefined while off). The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too. `dynamaxPokemon` is not read. Max boss changes are not announced.
+- Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). `dynamaxPokemon` is not read. Max boss changes are not announced.
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own).
 - The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`, in memory: only a restart in the week after the feed dropped its Monday entirely loses the week's boss). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3): the featured bosses first, then 5 stars down to 1, Gigantamax last. A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
-- `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (refused while max battles are off, `maxAdminOf`; a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
+- The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
+- How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change), otherwise (a Dynamax battle on an ordinary day) the day's last battle time; always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), undefined at the cap.
+- `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
 - Pokémon nicknames change only through `ctx.nicknames` (`PokemonSearchService`: changes and reloads one at a time; `nicknameProblem` in `src/domain/pogo/nickname-rules.ts` refuses words other commands read, names and nicknames of other Pokémon; removal from every legacy row of the Pokémon; the column stays `, `-joined lower case).
 
 ## Pictures and emoji
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index ae81036e0f0e6ee198250f3ec7883dff1f97f054..7a42fa8c09173f0bf18724e37b61fb57b5095d9e 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -120,7 +120,7 @@ The settings that matter first:
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
 - `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.
 
-The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, which are still to come). Max battles are off until you add a `maxBattles` block, `"maxBattles": { "url": "https://fight.pokebattler.com/raids" }` (the max bosses are read from Pokebattler every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
+The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, which are still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
 
 ## 4. Start the bot
 
diff --git a/docs/superpowers/plans/2026-10-21-phase-8x2-staging.md b/docs/superpowers/plans/2026-10-21-phase-8x2-staging.md
index d2e191cec7f4a2f6cedd29c0cccc21938b72fffd..be3c189f0779a556c9bc79c2806d5b76cff90ba0 100644
--- a/docs/superpowers/plans/2026-10-21-phase-8x2-staging.md
+++ b/docs/superpowers/plans/2026-10-21-phase-8x2-staging.md
@@ -2,7 +2,7 @@
 
 Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Account: Googer (owner, staff). The dev bot and database are shared with other sessions: check and update `var/stage/TEST-SERVER-STATE.md` first (this build is 8X-1B's too: its party state version 12 is not readable by an older bot, see the 8X-1B checklist's step 1). No migration. The conventions are `docs/architecture/utilities.md`.
 
-`/max` does not exist yet (8X-3): this plan's bosses are seen only through `/admin boss` and the logs.
+This plan's bosses are seen through `/admin boss` and the logs (and, once 8X-3 is merged, `/max`'s list of bosses; max battles are then always on, step 4).
 
 ## The game data, version 6
 
@@ -13,16 +13,16 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 3. Deploy the commands again (`/admin boss` gains six tier choices and `sync max:`): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`. `/admin boss add|hide|shiny|list` offer 16 tiers (the raid tiers, then Dynamax 1★ … 5★, Gigantamax); `autoset` offers only the 10 raid tiers.
 
-## Max battles off
+## Without the `maxBattles` block
 
-4. With no `maxBattles` in the settings: `/admin boss list` shows no max section; `/admin boss add pokemon:Machamp tier:Gigantamax` and `/admin boss sync max:True` are refused ("Max battles are off here…"). The raid list, a raid sync and its announcement in the bot-updates channel are as before.
+4. Max battles are always on (8X-3, Matt, 2026-10-21: the block has its defaults, as `lobbies` has; there is no off switch). With no `maxBattles` in the settings: one request to Pokebattler after login at the default address, `/admin boss list` shows the max section after the raid bosses, `/admin boss add pokemon:Machamp tier:Gigantamax` is taken and `/admin boss sync max:True` reads the feed (or says it is unchanged). The raid list, a raid sync and its announcement in the bot-updates channel are as before.
 
-## Max battles on
+## The block written out
 
 5. Add `"maxBattles": { "url": "https://fight.pokebattler.com/raids" }` to `var/stage/settings.json` and start: one request to Pokebattler after login, no error, "max bosses updated" with about 60 names; note any warning ("the max boss feed names a Pokémon the game data does not know", "max boss feed entries were left out", "has a level Pine does not know"); "max event hours assumed" lists the past Max Monday; the raid boss sync ran too and the raid list is untouched. Does a later `/admin boss sync max:True` get a 304 (the feed's ETag or Last-Modified)?
 6. `/admin boss list`: raid bosses first, then "**Max bosses** · the feed was read …"; Dynamax 1★ … 4★ with their bosses; 5★ empty with Uxie, Mesprit and Azelf under Coming before 2026-10-24 (listed from that day); a long list split into follow-ups without a heading cut off from its bosses; `tier:Gigantamax` says the tier has no bosses.
 7. Overrides: `add pokemon:Machamp tier:Gigantamax`, `hide pokemon:Sneasel tier:Dynamax 1★`, `shiny pokemon:Machop can-be-shiny:True tier:Dynamax 2★`; `shiny pokemon:Machop can-be-shiny:False` without a tier says "in any raid tier" and leaves the 2★ Machop alone; `add pokemon:Sneasel tier:Gigantamax` warns that the game data does not list it as a Gigantamax boss, and stores it; `remove` offers raid and max overrides with one numbering, and removing one leaves the other family's alone. In `pine-dev-mysql`, `RaidBoss` and `RaidBossOverride`: the max rows have levels D1–G, the raid rows are unchanged.
-8. Restart with max battles on: no new Pokebattler read within 6 hours of the last; the max list and overrides come back; before 10-24 the trio is still under Coming; a raid `/admin boss sync` says the raid feed's own read time (a max read does not mask a stale raid feed).
+8. Restart: no new Pokebattler read within 6 hours of the last; the max list and overrides come back; before 10-24 the trio is still under Coming; a raid `/admin boss sync` says the raid feed's own read time (a max read does not mask a stale raid feed).
 9. Shutdown (one Ctrl+C) logs nothing past the max boss sync's 5 seconds.
 
 ## Over the following days
@@ -33,4 +33,4 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 ## After
 
-13. Remove `maxBattles` from the stage settings if other sessions' staging needs it off (8X-3 turns it on); update `var/stage/TEST-SERVER-STATE.md`; record the results in the follow-ups file ("From the staging run of 8X-2").
+13. The `maxBattles` block may stay in the stage settings (it only sets what the defaults are; max battles cannot be switched off since 8X-3); update `var/stage/TEST-SERVER-STATE.md`; record the results in the follow-ups file ("From the staging run of 8X-2").
diff --git a/docs/superpowers/specs/2026-10-20-max-battles-design.md b/docs/superpowers/specs/2026-10-20-max-battles-design.md
index b316c9c614267b6526ba67984c90796c361c27b0..99df98cd93531f9439a550b5487bc4d73e2c7925 100644
--- a/docs/superpowers/specs/2026-10-20-max-battles-design.md
+++ b/docs/superpowers/specs/2026-10-20-max-battles-design.md
@@ -135,7 +135,7 @@ Pokebattler's `GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=
 }
 ```
 
-`maxBattles` absent switches `/max` and the max bosses off (`enabled(config)`), as `raidBosses` does for raids.
+Max battles are always on (Matt, 2026-10-21: trains and meetups cannot be switched off, and `raidBosses` is a required block): `maxBattles` has these defaults, as `lobbies` has its, so an old settings file, the test settings and the converter's output all have max battles on; there is no off switch.
 
 ## 10. Data and migrations
 
@@ -145,7 +145,7 @@ Pokebattler's `GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=
 - **The featured boss** (review 8): ScrapedDuck's `max-mondays` and `max-battles` events are kept in a list of their own (not `RAID_EVENT_KINDS`, which feeds the raid durations) and their boss read from the name ("Dynamax Sneasel during Max Monday", "Dynamax Uxie, Mesprit, and Azelf Max Battle Day", "Gigantamax … Max Battle Day") through the Pokémon search; a name that does not parse features nothing (tested against a recorded fixture). **A Max Monday's boss is featured all week** (Matt, 2026-10-20: on the Monday nearly every Dynamax battle is it, and it stays the most common all week), from its Monday's start until the next Max Monday starts (7 days at most); a Max Battle Day or Weekend features its bosses during its own hours, before the week's boss. Every hour comes from ScrapedDuck; an event without hours whose id carries a date takes the clock hours of the nearest event of its kind (logged).
 - The Dynamax and Gigantamax lists of the game master (`pokemonExtendedSettings.breadOverrides[].breadMode`: `BREAD_MODE`, `BREAD_DOUGH_MODE` and its `_2` variant; found in 8X-2: `BREAD_POKEMON_SCALING_SETTINGS` lists only the 70 species with custom visuals) say what may be typed as a boss off the lists; `/max`'s `tier:` offers `D1` … `D5` and `G` (review 16).
 - **Migrations**: `PartyHistory.wayspotId varchar(40) null` (8X-3) and `PartyHistoryStop.wayspotId varchar(40) null` (8X-4), each in the plan that needs it, numbered at merge (025 or later; first merge wins). Additive and guarded.
-- No column for the max battle in `Party`: it is found in memory (`maxAt`). `settings.lobbies` has its defaults (an old settings file and the converter load unchanged); `maxBattles` absent switches max battles off.
+- No column for the max battle in `Party`: it is found in memory (`maxAt`). `settings.lobbies` and `settings.maxBattles` have their defaults (an old settings file and the converter load unchanged); max battles are always on.
 - No copies in the remote or elite channels for max battles (review 19); the `Max battle` forum tag is added by `ensureTags`.
 
 ## 11. Plans
@@ -176,7 +176,7 @@ All decided by Matt, 2026-10-20:
 - **Q8** A species want gives at most **one DM an hour per member and boss** for max battles, and that DM says so: "You won't be told about more Dynamax Machamp battles for an hour." (so a quiet hour does not look like broken notifications).
 
 Open for 8X-3 (Matt, 2026-10-20 night; settle when 8X-3 is planned):
-- **Q9 How long a max battle lasts.** Matt: Gigantamax battles, event days only in practice, do not follow the all-day rule (06:00–21:00) but a short rotation: 30 minutes during a Max Battle Day's three core hours for certain; outside them (the rest of the day) 30 or 60 minutes, not known. A search (2026-10-20) confirmed only the 30-minute rotation in the core hours (the Max Battle Day articles of the Pokémon GO wiki and Pokémon GO Hub, one older guide says 20–30 minutes) and that Max Monday's bosses rotate every hour all day; nothing on the hours outside; Reddit was not reached. The game's timer at a spot counts down to 21:00, so a reporter does not see the rotation. Claude's recommendation: the default end by the event the battle falls in: during a Max Battle Day's hours (8X-2 knows them) 30 minutes from the report, on a Max Monday 60 minutes, a Gigantamax battle outside an event's hours 60 minutes, otherwise 21:00 as above; `end:` and `/end` change it as now; Matt confirms the outside-hours rotation on the next Gigantamax day. **Matt (2026-10-20): the recommendation matches what he believes is right; he seeks confirmation of the outside-hours rotation.** The wiki's list of Max Battle Days (read by Matt, 2026-10-20): most are 14:00–17:00 (one 14:00–19:00, extended by Niantic), but the **Max Battle Weekends** (Dynamax legendaries, and Gigantamax inside larger events) run 06:00–21:00; the 30-minute rotation is stated for Max Battle Days only, and Matt has seen Gigantamax battles active before and after the three core hours. So the rule reads the event's own hours from the feed, never a fixed 14:00–17:00: an event of a few hours 30 minutes, an all-day event (Max Monday, a Max Battle Weekend) 60 minutes, until confirmed.
+- **Q9 How long a max battle lasts.** Matt: Gigantamax battles, event days only in practice, do not follow the all-day rule (06:00–21:00) but a short rotation: 30 minutes during a Max Battle Day's three core hours for certain; outside them (the rest of the day) 30 or 60 minutes, not known. A search (2026-10-20) confirmed only the 30-minute rotation in the core hours (the Max Battle Day articles of the Pokémon GO wiki and Pokémon GO Hub, one older guide says 20–30 minutes) and that Max Monday's bosses rotate every hour all day; nothing on the hours outside; Reddit was not reached. The game's timer at a spot counts down to 21:00, so a reporter does not see the rotation. Claude's recommendation: the default end by the event the battle falls in: during a Max Battle Day's hours (8X-2 knows them) 30 minutes from the report, on a Max Monday 60 minutes, a Gigantamax battle outside an event's hours 60 minutes, otherwise 21:00 as above; `end:` and `/end` change it as now; Matt confirms the outside-hours rotation on the next Gigantamax day. **Matt (2026-10-20): the recommendation matches what he believes is right; he seeks confirmation of the outside-hours rotation.** The wiki's list of Max Battle Days (read by Matt, 2026-10-20): most are 14:00–17:00 (one 14:00–19:00, extended by Niantic), but the **Max Battle Weekends** (Dynamax legendaries, and Gigantamax inside larger events) run 06:00–21:00; the 30-minute rotation is stated for Max Battle Days only, and Matt has seen Gigantamax battles active before and after the three core hours. So the rule reads the event's own hours from the feed, never a fixed 14:00–17:00: an event of a few hours 30 minutes, an all-day event (Max Monday, a Max Battle Weekend) 60 minutes, until confirmed. **Matt (2026-10-21): battles rotate on the hour and the half hour, and a reported battle is already on (there is no egg), so the default end is the boundary of the rotation it is in, never a span from the report:** inside a short event (a Max Battle Day of a few hours) the next :00 or :30; inside an all-day event (Max Monday, a Max Battle Weekend), and for a Gigantamax battle in a big event (Wild Area, GO Tour, GO Fest Global) or outside any event, the next full hour; otherwise (a Dynamax battle on an ordinary day) the last battle time, or the start of a max event later that day if sooner (Matt, 2026-10-21, Q-B: reported at 10:00 on a 14:00–17:00 Max Battle Day, until 14:00; to be checked on the lake trio day of 2026-10-24, whether Dynamax battles were up before 14:00); in a big event's hours `/max` lists the Gigantamax bosses first (Matt, 2026-10-21, Q-A); always capped at the last battle time; `end:` and `/end` change it within the day. A report not joining a battle whose end is less than five minutes away is asked about first (a dialog: until the next rotation, first, or until the end about to pass; only "Report it anyway?" where no later rotation is left, also a Dynamax battle at its event's last boundary); a typed `end:` is never asked about.
 - **Q10 Meet… for a max battle** (8X-1B left it to 8X-3): no in-game RSVP times exist for max battles (Matt, 2026-10-20). Claude's recommendation: the round 5-minute times of the next hour, up to the battle's end, and "No meeting time" when one is set. **Taken by Matt, 2026-10-20.**
 
 ## 13. Follow-ups (not in this work)
diff --git a/src/app-context.ts b/src/app-context.ts
index b4d48bf7dca4d5233d7e5981772c8e81b3ef68b1..12f900de0d0f48b858d8cfaecf575eb7c00e9941 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -28,7 +28,7 @@ import type { PokemonFinder, PokemonNicknames } from './services/pokemon-search-
 import type { MaxBossAdmin, MaxBossProvider } from './services/max-boss-service.js';
 import type { RaidBossAdmin, RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidChangeService } from './services/raid-change-service.js';
-import type { RaidEventProvider } from './services/raid-event-service.js';
+import type { MaxEventProvider, RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionAdminService } from './services/region-admin-service.js';
 import type { RegionProvider } from './services/region-directory.js';
 import type { SelfRoleService } from './services/self-role-service.js';
@@ -62,12 +62,15 @@ export interface AppContext {
   readonly raidBosses: RaidBossProvider;
   /** The boss list for staff (`/admin boss`): the feed as stored, the overrides, a sync now. */
   readonly raidBossAdmin: RaidBossAdmin;
-  /** The max bosses in effect (plan 8X-2): none while `settings.maxBattles` is absent. */
+  /** The max bosses in effect (plan 8X-2). */
   readonly maxBosses: MaxBossProvider;
-  /** The max boss list for staff (`/admin boss`); undefined while max battles are off. */
-  readonly maxBossAdmin: MaxBossAdmin | undefined;
-  /** Raid Hours and Raid Days from the events feed (see `raidDurationRules`). */
-  readonly raidEvents: RaidEventProvider;
+  /** The max boss list for staff (`/admin boss`). */
+  readonly maxBossAdmin: MaxBossAdmin;
+  /**
+   * Raid Hours and Raid Days from the events feed (see `raidDurationRules`), and its max events
+   * and big events (plan 8X-3: the featured bosses of `/max`, a max battle's default end).
+   */
+  readonly raidEvents: RaidEventProvider & MaxEventProvider;
   /** The gyms, and finding them by what members type. */
   readonly gyms: GymProvider;
   /** Gym administration (`/gym`): adding, changing, moving and deleting gyms. */
diff --git a/src/app.ts b/src/app.ts
index be2a5bc8f1937e21662529a2d58ee23bebcde624..90030f4ace02fc9178d2270292ceab12ec5ef192 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -86,7 +86,7 @@ import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossAnnouncer } from './services/raid-boss-announcer.js';
-import { MaxBossService, NO_MAX_BOSSES } from './services/max-boss-service.js';
+import { MaxBossService } from './services/max-boss-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidChangeService } from './services/raid-change-service.js';
 import { TimedPartyService } from './services/timed-party-service.js';
@@ -219,23 +219,20 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
-  // The max bosses (plan 8X-2), only with `settings.maxBattles`: Pokebattler's feed, beside the
+  // The max bosses (plan 8X-2; always on, Matt 2026-10-21): Pokebattler's feed, beside the
   // raid bosses in the same tables. Its changes are announced nowhere (the announcer listens to
   // the raid bosses), and the warning of a list out of date is only logged.
   const maxSettings = config.settings.maxBattles;
-  const maxBosses =
-    maxSettings === undefined
-      ? undefined
-      : new MaxBossService({
-          url: maxSettings.url,
-          refreshMs: maxSettings.refreshMinutes * MINUTE_MS,
-          staleAfterMs: MAX_BOSSES_STALE_AFTER_HOURS * HOUR_MS,
-          zone: config.settings.timezone,
-          store: new MaxBossRepository(db),
-          gameData,
-          fetch: (url, init) => fetch(url, init),
-          log,
-        });
+  const maxBosses = new MaxBossService({
+    url: maxSettings.url,
+    refreshMs: maxSettings.refreshMinutes * MINUTE_MS,
+    staleAfterMs: MAX_BOSSES_STALE_AFTER_HOURS * HOUR_MS,
+    zone: config.settings.timezone,
+    store: new MaxBossRepository(db),
+    gameData,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
   const raidEvents = new RaidEventService({
     url: config.settings.raidEvents.url,
     refreshMs: config.settings.raidEvents.refreshHours * HOUR_MS,
@@ -660,7 +657,7 @@ export async function startApp(
     checkpoint();
     // Reads the list of the last run from the database; the feed is read after the login.
     await raidBosses.load();
-    await maxBosses?.load();
+    await maxBosses.load();
     await gyms.load();
     // The gyms that waited for Google before a restart, and those that lack what it gives.
     await gymUpkeep.resume();
@@ -695,7 +692,7 @@ export async function startApp(
     gameData,
     raidBosses,
     raidBossAdmin: raidBosses,
-    maxBosses: maxBosses ?? NO_MAX_BOSSES,
+    maxBosses,
     maxBossAdmin: maxBosses,
     raidEvents,
     gyms,
@@ -856,7 +853,7 @@ export async function startApp(
   ctx.features = features;
   // The listeners of the boss list (`bossAnnouncer`) were attached before this call.
   raidBosses.startAutoSync();
-  maxBosses?.startAutoSync();
+  maxBosses.startAutoSync();
   raidEvents.start();
   // The clock waits for Discord, however long that takes: a post that cannot be asked for yet
   // would be taken for deleted. Then for the first read of the raid events (a raid that hatched
@@ -1018,8 +1015,8 @@ export async function startApp(
         name: 'max boss sync',
         timeoutMs: 5_000,
         run: async () => {
-          maxBosses?.stop();
-          await maxBosses?.whenIdle();
+          maxBosses.stop();
+          await maxBosses.whenIdle();
         },
       },
       {
diff --git a/src/commands/admin/boss-input.ts b/src/commands/admin/boss-input.ts
index 86bd084ee191c2503161840ebd56397a3e25cef4..34d632314d2d751d7dbc46561feac9f51911d33c 100644
--- a/src/commands/admin/boss-input.ts
+++ b/src/commands/admin/boss-input.ts
@@ -17,7 +17,6 @@ import {
 } from '../../domain/pogo/raid-tier.js';
 import { isMaxTier, MAX_TIERS, maxTierLabel, type MaxTier } from '../../domain/pogo/max-tier.js';
 import { searchTokens } from '../../domain/search/text.js';
-import type { MaxBossAdmin } from '../../services/max-boss-service.js';
 import { plain, truncate } from '../../render/text.js';
 import { CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../choices.js';
 import { namedPokemon } from '../pokemon-option.js';
@@ -113,16 +112,6 @@ export function tierOption(
       .addChoices(tiers.map((tier) => ({ name: bossTierLabel(tier), value: tierValue(tier) })));
 }
 
-/** The max boss list for staff; a `UserError` while max battles are off. */
-export function maxAdminOf(ctx: AppContext): MaxBossAdmin {
-  if (!ctx.maxBossAdmin) {
-    throw new UserError(
-      'Max battles are off here: the settings have no `maxBattles`, so there is no max boss list.',
-    );
-  }
-  return ctx.maxBossAdmin;
-}
-
 /** The `days` option: how long an override lasts. */
 export function daysOption(description: string) {
   return (option: SlashCommandIntegerOption): SlashCommandIntegerOption =>
@@ -229,8 +218,8 @@ export function chosenPokemon(ctx: AppContext, value: string): ChosenPokemon {
     const same = (one: BossIds): boolean => one.pokemonId === pokemonId && one.form === form;
     const max = ctx.maxBossAdmin;
     const feed: { name: string } | undefined =
-      ctx.raidBossAdmin.feedBosses().find(same) ?? max?.feedBosses().find(same);
-    const override = ctx.raidBossAdmin.overrides().find(same) ?? max?.overrides().find(same);
+      ctx.raidBossAdmin.feedBosses().find(same) ?? max.feedBosses().find(same);
+    const override = ctx.raidBossAdmin.overrides().find(same) ?? max.overrides().find(same);
     if (!feed && !override) {
       throw new UserError('That boss is no longer in the feed. Pick again from the list.');
     }
diff --git a/src/commands/admin/boss-list.test.ts b/src/commands/admin/boss-list.test.ts
index fcf73e8928d298f3de42b88c31e179af88c52085..e282e783db51b81979071a69329795cf85b8a075 100644
--- a/src/commands/admin/boss-list.test.ts
+++ b/src/commands/admin/boss-list.test.ts
@@ -186,7 +186,7 @@ describe('/admin boss list', () => {
     for (const text of texts) {
       expect(text.length).toBeLessThanOrEqual(2000);
       // No answer ends with a heading whose bosses are in the next.
-      expect(text.split('\n').at(-1)).toMatch(/^- /);
+      expect(text.split('\n').at(-1)).not.toMatch(/^\*\*/);
     }
     expect(texts.join('\n').match(/^- \*\*/gm)?.length).toBe(14 + 32);
   });
@@ -228,7 +228,8 @@ describe('/admin boss list', () => {
     const made = await bossCommandsWith({ empty: true });
     const text = textsOf(await made.use('boss', 'list')).join('\n');
     expect(text).toBe(
-      '**Raid bosses** · the feed has not been read yet\nThere are no raid bosses.',
+      '**Raid bosses** · the feed has not been read yet\nThere are no raid bosses.\n' +
+        '**Max bosses** · the feed has not been read yet\nThere are no max bosses.',
     );
   });
 });
diff --git a/src/commands/admin/boss-list.ts b/src/commands/admin/boss-list.ts
index cf8d391b80e889eb94fe82b9ea2efe04e5258a86..ff5c24f8b2aae7391ad6af0d52413dd2a6ca691b 100644
--- a/src/commands/admin/boss-list.ts
+++ b/src/commands/admin/boss-list.ts
@@ -35,7 +35,6 @@ import {
   BOSS_GROUP,
   bossTierLabel,
   isMaxBossTier,
-  maxAdminOf,
   readTier,
   tierOption,
   type BossTier,
@@ -122,15 +121,11 @@ function overrideLine(reported: ReportedOverride<BossTier>): string {
  * What `/admin boss list` says: when the feed was read and what it has that Pine does not know,
  * then the bosses tier by tier as members see them, each with where it came from and what acts
  * on it, then what is hidden and what acts on nothing. With `tier`, that tier only; a max tier
- * shows the max boss list (`maxListLines`), and without a tier it follows the raid bosses where
- * max battles are on.
+ * shows the max boss list (`maxListLines`), and without a tier it follows the raid bosses.
  */
 export function bossListLines(ctx: AppContext, now: number, tier?: BossTier): string[] {
   if (tier !== undefined && isMaxBossTier(tier)) return maxListLines(ctx, now, tier);
-  return [
-    ...raidListLines(ctx, now, tier),
-    ...(tier === undefined && ctx.maxBossAdmin ? maxListLines(ctx, now) : []),
-  ];
+  return [...raidListLines(ctx, now, tier), ...(tier === undefined ? maxListLines(ctx, now) : [])];
 }
 
 function raidListLines(ctx: AppContext, now: number, tier?: RaidTier): string[] {
@@ -183,13 +178,10 @@ function raidListLines(ctx: AppContext, now: number, tier?: RaidTier): string[]
  * The max boss list (plan 8X-2), said as the raid list is: when the feed was read, the bosses
  * tier by tier from D1 to G with where each came from and what acts on it, the bosses the feed
  * lists ahead of their start (`Coming`, with when they start), then what is hidden and what acts
- * on nothing. With `tier`, that tier only. While max battles are off, a line that says so.
+ * on nothing. With `tier`, that tier only.
  */
 function maxListLines(ctx: AppContext, now: number, tier?: MaxTier): string[] {
   const admin = ctx.maxBossAdmin;
-  if (!admin) {
-    return ['**Max bosses** · max battles are off here (the settings have no `maxBattles`).'];
-  }
   const feed = admin.feedBosses();
   const report = familyReport(
     MAX_OPS,
@@ -459,7 +451,7 @@ export const syncBosses: SubcommandPart = {
   throttle: { uses: 3, perSeconds: 60 },
   async execute(interaction, ctx) {
     if (interaction.options.getBoolean('max') === true) {
-      const admin = maxAdminOf(ctx);
+      const admin = ctx.maxBossAdmin;
       await sendLines(interaction, maxSyncLines(admin.lastSyncedAt, await admin.sync()));
       return;
     }
diff --git a/src/commands/admin/boss-max.test.ts b/src/commands/admin/boss-max.test.ts
index 4c948c6b21b6748ebbaa2f7c8184237b35fcb85a..d762da33261f6b005e431d28b882855362253845 100644
--- a/src/commands/admin/boss-max.test.ts
+++ b/src/commands/admin/boss-max.test.ts
@@ -18,9 +18,8 @@ afterEach(() => {
 
 async function withMax() {
   const made = await bossCommandsWith({ max: true });
-  if (!made.max) throw new Error('max battles are off');
   made.max.state.now = NOW;
-  return { ...made, max: made.max };
+  return made;
 }
 
 const tierChoices = (subcommand: string) => {
@@ -116,12 +115,6 @@ describe('/admin boss with a max tier', () => {
     expect(made.max.service.overrides()).toEqual([]);
   });
 
-  it('refuses a max tier while max battles are off', async () => {
-    const made = await bossCommandsWith();
-    const used = await made.use('boss', 'add', { pokemon: 'Machamp', tier: 'G' });
-    expect(textsOf(used).join('\n')).toMatch(/Max battles are off/);
-  });
-
   it('offers and removes overrides of both kinds by their number', async () => {
     const made = await withMax();
     await made.use('boss', 'add', { pokemon: 'Zekrom', tier: 'T5' });
@@ -160,8 +153,6 @@ describe('/admin boss list and sync with max battles', () => {
     expect(text).toContain('**Raid bosses**');
     expect(text).toContain('**Max bosses**');
     expect(text.indexOf('**Raid bosses**')).toBeLessThan(text.indexOf('**Max bosses**'));
-    const off = await bossCommandsWith();
-    expect(textsOf(await off.use('boss', 'list')).join('\n')).not.toContain('Max bosses');
   });
 
   it('reads the max boss feed on request', async () => {
diff --git a/src/commands/admin/boss-overrides.ts b/src/commands/admin/boss-overrides.ts
index 936b98583f20fbbdf0fbb4867e7656c332ee0e35..921d5f4adf1b56309af7c707104ed178dac13f97 100644
--- a/src/commands/admin/boss-overrides.ts
+++ b/src/commands/admin/boss-overrides.ts
@@ -23,7 +23,6 @@ import {
   DEFAULT_DAYS,
   expiryOf,
   isMaxBossTier,
-  maxAdminOf,
   readRaidTier,
   readTier,
   sameBossTier,
@@ -39,8 +38,7 @@ import { lasting } from './boss-list.js';
 const OVERRIDE_CHOICE = /^(?:id:|#)?(\d{1,10})$/;
 
 /**
- * The bosses in effect of both lists (plan 8X-2): the raid bosses, then the max bosses (none
- * while max battles are off).
+ * The bosses in effect of both lists (plan 8X-2): the raid bosses, then the max bosses.
  */
 function allBosses(ctx: AppContext): Boss<BossTier>[] {
   return [...ctx.raidBosses.bosses(), ...ctx.maxBosses.bosses()];
@@ -48,7 +46,7 @@ function allBosses(ctx: AppContext): Boss<BossTier>[] {
 
 /** The overrides in force of both lists; an id names one of either (one table). */
 function allOverrides(ctx: AppContext): BossOverride<BossTier>[] {
-  return [...ctx.raidBossAdmin.overrides(), ...(ctx.maxBossAdmin?.overrides() ?? [])];
+  return [...ctx.raidBossAdmin.overrides(), ...ctx.maxBossAdmin.overrides()];
 }
 
 /**
@@ -76,27 +74,21 @@ function reportedOverrides(ctx: AppContext): Map<number, ReportedOverride<BossTi
   const now = Date.now();
   const report = bossReport(admin.feedBosses(), admin.overrides(), ctx.gameData.catalogue, now);
   const max = ctx.maxBossAdmin;
-  const maxReport = max
-    ? familyReport(
-        MAX_OPS,
-        maxBossesAt,
-        max.feedBosses(),
-        max.overrides(),
-        ctx.gameData.catalogue,
-        now,
-      )
-    : undefined;
+  const maxReport = familyReport(
+    MAX_OPS,
+    maxBossesAt,
+    max.feedBosses(),
+    max.overrides(),
+    ctx.gameData.catalogue,
+    now,
+  );
   const all: ReportedOverride<BossTier>[] = [
     ...report.bosses.flatMap((one) => one.overrides),
     ...report.hidden,
     ...report.idle,
-    ...(maxReport
-      ? [
-          ...maxReport.bosses.flatMap((one) => one.overrides),
-          ...maxReport.hidden,
-          ...maxReport.idle,
-        ]
-      : []),
+    ...maxReport.bosses.flatMap((one) => one.overrides),
+    ...maxReport.hidden,
+    ...maxReport.idle,
   ];
   return new Map(all.map((one) => [one.override.id, one]));
 }
@@ -122,7 +114,7 @@ function describeOverride(override: BossOverride<BossTier>, name: string): strin
 
 /**
  * Stores an override for the member of staff in the list of its tier (a max tier's in the max
- * boss list, refused while max battles are off; one without a tier is a raid override),
+ * boss list; one without a tier is a raid override),
  * refusing what `addOverride` refuses with its own sentence.
  */
 async function store(
@@ -135,7 +127,7 @@ async function store(
   const { tier } = override;
   try {
     if (tier !== null && isMaxBossTier(tier)) {
-      return await maxAdminOf(ctx).addOverride({ ...override, ...ids, tier });
+      return await ctx.maxBossAdmin.addOverride({ ...override, ...ids, tier });
     }
     return await ctx.raidBossAdmin.addOverride({ ...override, ...ids, tier });
   } catch (err) {
@@ -529,7 +521,7 @@ export const removeOverride: SubcommandPart = {
     }
     const { override } = reported;
     const max = override.tier !== null && isMaxBossTier(override.tier);
-    const admin = max ? maxAdminOf(ctx) : ctx.raidBossAdmin;
+    const admin = max ? ctx.maxBossAdmin : ctx.raidBossAdmin;
     const removed = await admin.removeOverride(override.id);
     if (!removed) {
       throw new UserError(`There is no override #${id}. It may have lapsed or been removed.`);
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 45d19436b41cbb8a7684e70a2a1adda97652f891..f0772be87ed262ed7d0ac3b37fdc8be8577d305d 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -484,13 +484,23 @@ describe('loadSettings', () => {
     expect(() => loadSettings(unknown)).toThrow(/mega/);
   });
 
-  it('has max battles off without a maxBattles block, as the files of today have it', () => {
-    expect(loadSettings(REPO_SETTINGS).maxBattles).toBeUndefined();
-    expect(loadSettings('test/fixtures/settings.json').maxBattles).toBeUndefined();
+  it('has max battles on without a maxBattles block, with every default (Matt, 2026-10-21)', () => {
+    const defaults = {
+      url: 'https://fight.pokebattler.com/raids',
+      refreshMinutes: 360,
+      firstBattle: '06:00',
+      lastBattle: '21:00',
+    };
+    expect(loadSettings(REPO_SETTINGS).maxBattles).toEqual(defaults);
+    expect(loadSettings('test/fixtures/settings.json').maxBattles).toEqual(defaults);
+    const empty = writeSettings((s) => {
+      s.maxBattles = {};
+    });
+    expect(loadSettings(empty).maxBattles).toEqual(defaults);
   });
 
   it('takes maxBattles with its defaults: the feed read every 6 hours, battles 06:00 to 21:00', () => {
-    const url = 'https://fight.pokebattler.com/raids';
+    const url = 'https://example.test/raids';
     const file = writeSettings((s) => {
       s.maxBattles = { url };
     });
@@ -513,7 +523,6 @@ describe('loadSettings', () => {
   it('refuses a maxBattles block it cannot use', () => {
     const url = 'https://fight.pokebattler.com/raids';
     const cases: [Record<string, unknown>, RegExp][] = [
-      [{}, /url/],
       [{ url: 'ftp://example.test/raids' }, /url/],
       [{ url, refreshMinutes: 4 }, /refreshMinutes/],
       [{ url, refreshMinutes: 1441 }, /refreshMinutes/],
diff --git a/src/config/settings.ts b/src/config/settings.ts
index c38790983934507dfcbd805a8bb20238ac0fe5d0..06e7ca74eccc554906a971f8da27cce80dfb7e20 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -8,6 +8,9 @@ const minutes = z.number().int().positive();
 const milliseconds = z.number().int().positive();
 const seconds = z.number().int().positive();
 const lobby = z.number().int().min(MIN_LOBBY).max(MAX_LOBBY);
+
+/** Pokebattler's raid list, the max bosses' feed (`settings.maxBattles.url` unless set). */
+export const MAX_BOSS_FEED_URL = 'https://fight.pokebattler.com/raids';
 /** A time of day, `HH:MM` on a 24-hour clock (`7:30` is `07:30`). */
 const clockTime = z
   .string()
@@ -398,17 +401,18 @@ export const settingsSchema = z.strictObject({
     hatchedDuration: z.strictObject({ 'raid-hour': minutes, 'raid-day': minutes }),
   }),
   /**
-   * Max battles (plan 8X-2; design `2026-10-20-max-battles-design.md`, section 9). Absent: max
-   * bosses are off (no feed is read, `/admin boss` refuses the max tiers), as a file of before has it.
-   * `url` is Pokebattler's raid list (`https://fight.pokebattler.com/raids`, about 700 KB, which
-   * asks to be cached: read every `refreshMinutes`, 6 hours unless set), whose `RAID_LEVEL_1_MAX`
+   * Max battles (plan 8X-2; design `2026-10-20-max-battles-design.md`, section 9). Always on (Matt,
+   * 2026-10-21: trains, meetups and raid bosses cannot be switched off either): every key has a
+   * default, and a file without the block (one of before, a converted one) has them all.
+   * `url` is Pokebattler's raid list (`MAX_BOSS_FEED_URL`, about 700 KB, which asks to be
+   * cached: read every `refreshMinutes`, 6 hours unless set), whose `RAID_LEVEL_1_MAX`
    * to `RAID_LEVEL_5_MAX` are the Dynamax bosses and `RAID_LEVEL_6_MAX` the Gigantamax ones.
    * `firstBattle` and `lastBattle` are the hours of the day max battles can be fought, in
    * `timezone` (06:00 and 21:00 unless set): a max battle ends at the last one.
    */
   maxBattles: z
     .strictObject({
-      url: z.url({ protocol: /^https?$/ }),
+      url: z.url({ protocol: /^https?$/ }).default(MAX_BOSS_FEED_URL),
       refreshMinutes: z.number().int().min(5).max(1440).default(360),
       firstBattle: clockTime.default('06:00'),
       lastBattle: clockTime.default('21:00'),
@@ -417,7 +421,12 @@ export const settingsSchema = z.strictObject({
       error: 'must be later than firstBattle',
       path: ['lastBattle'],
     })
-    .optional(),
+    .default(() => ({
+      url: MAX_BOSS_FEED_URL,
+      refreshMinutes: 360,
+      firstBattle: '06:00',
+      lastBattle: '21:00',
+    })),
 });
 
 export type Settings = z.output<typeof settingsSchema>;
diff --git a/src/domain/pogo/max-boss-list.after.test.ts b/src/domain/pogo/max-boss-list.after.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8d593859210ce76ebb9a0951ab43eae2be3fce2a
--- /dev/null
+++ b/src/domain/pogo/max-boss-list.after.test.ts
@@ -0,0 +1,58 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import {
+  at,
+  MAX_FEED_READ_AT,
+  MAX_ZONE,
+  readPokebattlerFeed,
+} from '../../../test/support/max-bosses.js';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import { pokemonFixture } from '../../../test/support/providers.js';
+import { parseMaxEventFeed, type MaxEvent } from '../time/max-events.js';
+import { withoutEndedUpcoming } from './max-boss-list.js';
+import { maxBossesAt, parseMaxBossFeed } from './max-bosses.js';
+
+const catalogue = catalogueFixture();
+const pokemon = pokemonFixture();
+const exact = (text: string) => pokemon.exact(text);
+const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
+const feed = parseMaxBossFeed(readPokebattlerFeed(), catalogue, {
+  now: MAX_FEED_READ_AT,
+  zone: MAX_ZONE,
+}).bosses.map((boss) => ({ ...boss, firstSeen: Math.max(MAX_FEED_READ_AT, boss.startsAt ?? 0) }));
+
+/** The names of the list in effect at a time, the upcoming bosses past their event left out. */
+function namesAt(time: number, known: readonly MaxEvent[] = events): string[] {
+  const bosses = maxBossesAt(feed, [], catalogue, time);
+  return withoutEndedUpcoming(bosses, feed, known, exact, time, MAX_ZONE).map((boss) => boss.name);
+}
+
+describe('withoutEndedUpcoming: an upcoming boss after its event (plan 8X-3, change 4)', () => {
+  it('offers the lake trio on their Max Battle Day and leaves them out once it is over', () => {
+    // Pokebattler lists them ahead with a start and no end (2026-10-20).
+    expect(namesAt(at('2026-10-24T09:00'))).toEqual(expect.arrayContaining(['Uxie', 'Azelf']));
+    expect(namesAt(at('2026-10-24T16:59'))).toContain('Mesprit');
+    const after = namesAt(at('2026-10-24T17:00'));
+    expect(after).not.toContain('Uxie');
+    expect(after).not.toContain('Mesprit');
+    expect(after).not.toContain('Azelf');
+    // Every boss of the pool that came before the event stays.
+    expect(after).toContain('Sneasel');
+  });
+
+  it('keeps one a later event names', () => {
+    const again: MaxEvent = {
+      kind: 'max-battle',
+      name: 'Dynamax Uxie Max Battle Weekend',
+      start: at('2026-11-07T06:00'),
+      end: at('2026-11-08T21:00'),
+      short: false,
+      hoursAssumed: false,
+      featured: { gigantamax: false, names: ['Uxie'] },
+      id: 'uxie-weekend',
+    };
+    const after = namesAt(at('2026-10-25T12:00'), [...events, again]);
+    expect(after).toContain('Uxie');
+    expect(after).not.toContain('Azelf');
+  });
+});
diff --git a/src/domain/pogo/max-boss-list.ts b/src/domain/pogo/max-boss-list.ts
index d589d562f861b571a872e069247ba1309f0400a0..34302a5d0372799c1ee33c6cbf3e35ff59485568 100644
--- a/src/domain/pogo/max-boss-list.ts
+++ b/src/domain/pogo/max-boss-list.ts
@@ -1,3 +1,4 @@
+import { DateTime } from 'luxon';
 import type { PokemonCatalogue } from './catalogue.js';
 import { bossIdsOf } from './feed-lookup.js';
 import type { PokemonEntry } from './game-master.js';
@@ -95,6 +96,60 @@ export function maxBossChoices(
   ];
 }
 
+/**
+ * When a max event stops featuring its bosses (as `featuredAt` reads it): a Max Battle Day or
+ * Weekend at its end, a Max Monday when the next one starts or a week of the zone's clock after it.
+ */
+function featuredUntil(event: MaxEvent, events: readonly MaxEvent[], zone: string): number {
+  if (event.kind !== 'max-monday') return event.end;
+  const next = events.find((other) => other.kind === 'max-monday' && other.start > event.start);
+  const week = DateTime.fromMillis(event.start, { zone }).plus({ weeks: 1 }).toMillis();
+  return Math.min(next?.start ?? Infinity, week);
+}
+
+/**
+ * The list without the upcoming bosses whose event is over (plan 8X-3, change 4): Pokebattler
+ * gives no end in any max tier, so a boss it listed ahead of an event may stay listed after it.
+ * A boss is left out once an event that names it (in its kind: Dynamax or Gigantamax, each name
+ * read through the Pokémon search, `exact`) stopped featuring it (`featuredUntil`) by `now`, no
+ * event names it that features it now or later, and it came with that event: the feed first had
+ * it (`firstSeen`, which holds an upcoming boss's start) from the start of that event's day on.
+ * A boss of the pool from before the event (a Max Monday's Sneasel seen for weeks) stays.
+ */
+export function withoutEndedUpcoming(
+  bosses: readonly MaxBoss[],
+  feed: readonly { pokemonId: string; form: string | null; tier: MaxTier; firstSeen: number }[],
+  events: readonly MaxEvent[],
+  exact: (text: string) => PokemonEntry | undefined,
+  now: number,
+  zone: string,
+): MaxBoss[] {
+  const naming = (boss: MaxBoss): MaxEvent[] =>
+    events.filter(
+      (event) =>
+        event.featured !== undefined &&
+        event.featured.gigantamax === (boss.tier === 'G') &&
+        event.featured.names.some((name) => {
+          const entry = exact(name);
+          return entry !== undefined && entry.key === boss.entry?.key;
+        }),
+    );
+  return bosses.filter((boss) => {
+    if (!boss.entry) return true;
+    const named = naming(boss);
+    if (named.some((event) => featuredUntil(event, events, zone) > now)) return true;
+    const row = feed.find(
+      (one) => one.pokemonId === boss.pokemonId && one.form === boss.form && one.tier === boss.tier,
+    );
+    if (!row) return true;
+    const cameWith = named.some(
+      (event) =>
+        row.firstSeen >= DateTime.fromMillis(event.start, { zone }).startOf('day').toMillis(),
+    );
+    return !cameWith;
+  });
+}
+
 /**
  * What a Pokémon typed as a max boss can be (design sections 2 and 3.2): the list's bosses of
  * it (`listed`, whose tier is known), and the other tiers the game master lets it battle in
diff --git a/src/domain/time/big-events.test.ts b/src/domain/time/big-events.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c2bb528e7328a98b82e8f8cae44ff94e9eb9e305
--- /dev/null
+++ b/src/domain/time/big-events.test.ts
@@ -0,0 +1,85 @@
+import { describe, expect, it } from 'vitest';
+import { at, MAX_ZONE } from '../../../test/support/max-bosses.js';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import { BIG_EVENT_TYPES, bigEventAt, parseBigEventFeed, parseMaxEventFeed } from './max-events.js';
+
+const recorded = parseBigEventFeed(readMaxEventFeed(), MAX_ZONE);
+
+describe('parseBigEventFeed: the events with Gigantamax battles all day (plan 8X-3)', () => {
+  it('reads the global Wild Area and GO Tour of the recorded feed, in local time', () => {
+    expect(recorded).toEqual([
+      {
+        id: 'pokemon-go-wild-area-2026-global',
+        name: 'Pokémon GO Wild Area 2026: Global',
+        start: at('2026-11-14T10:00'),
+        end: at('2026-11-15T18:00'),
+      },
+      {
+        id: 'pokemon-go-tour-alola-global-2027',
+        name: 'Pokémon GO Tour: Alola - Global 2027',
+        start: at('2027-02-27T00:00'),
+        end: at('2027-02-28T23:59:59'),
+      },
+    ]);
+  });
+
+  it('leaves the in-person city editions out (Matt, 2026-10-21): another city, UTC times', () => {
+    const names = recorded.map((event) => event.name);
+    expect(names.some((name) => /Sendai|Mexico City|Kaohsiung|Los Angeles/.test(name))).toBe(false);
+  });
+
+  it('takes GO Fest Global by its kind, one line in a list of kinds', () => {
+    expect(BIG_EVENT_TYPES).toEqual(['wild-area', 'pokemon-go-tour', 'pokemon-go-fest']);
+    const fest = parseBigEventFeed(
+      [
+        {
+          eventID: 'pokemon-go-fest-2027-global',
+          eventType: 'pokemon-go-fest',
+          name: 'Pokémon GO Fest 2027: Global',
+          start: '2027-07-10T10:00:00.000',
+          end: '2027-07-11T18:00:00.000',
+        },
+      ],
+      MAX_ZONE,
+    );
+    expect(fest.map((event) => event.name)).toEqual(['Pokémon GO Fest 2027: Global']);
+  });
+
+  it('refuses what is no event of these: another kind, no hours, an end before the start', () => {
+    const feed = [
+      {
+        eventID: 'x-global',
+        eventType: 'community-day',
+        name: 'A',
+        start: '2026-11-01T10:00:00.000',
+        end: '2026-11-01T12:00:00.000',
+      },
+      { eventID: 'wild-area-global', eventType: 'wild-area', name: 'B', start: null, end: null },
+      {
+        eventID: 'wild-area-global-2',
+        eventType: 'wild-area',
+        name: 'C',
+        start: '2026-11-02T10:00:00.000',
+        end: '2026-11-01T10:00:00.000',
+      },
+    ];
+    expect(parseBigEventFeed(feed, MAX_ZONE)).toEqual([]);
+    expect(() => parseBigEventFeed({}, MAX_ZONE)).toThrow(/not a list/);
+  });
+
+  it('features nothing and keeps the max events as they were', () => {
+    // The Max Mondays and Max Battle Days of 8X-2 read as before.
+    expect(parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events).toHaveLength(7);
+  });
+});
+
+describe('bigEventAt', () => {
+  it('is the big event on at a time, its start included and its end not', () => {
+    expect(bigEventAt(recorded, at('2026-11-14T10:00'))?.name).toBe(
+      'Pokémon GO Wild Area 2026: Global',
+    );
+    expect(bigEventAt(recorded, at('2026-11-15T17:59'))).toBeDefined();
+    expect(bigEventAt(recorded, at('2026-11-15T18:00'))).toBeUndefined();
+    expect(bigEventAt(recorded, at('2026-11-14T09:59'))).toBeUndefined();
+  });
+});
diff --git a/src/domain/time/max-end.test.ts b/src/domain/time/max-end.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6b55de6e4683d35356db5eb97af9fbd025296d7b
--- /dev/null
+++ b/src/domain/time/max-end.test.ts
@@ -0,0 +1,138 @@
+import { describe, expect, it } from 'vitest';
+import { at, MAX_ZONE } from '../../../test/support/max-bosses.js';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import type { MaxTier } from '../pogo/max-tier.js';
+import { defaultMaxEnd, maxRotation, nextRotationEnd, type MaxEndInput } from './max-end.js';
+import { parseBigEventFeed, parseMaxEventFeed, type MaxEvent } from './max-events.js';
+
+const recorded = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
+const big = parseBigEventFeed(readMaxEventFeed(), MAX_ZONE);
+const hours = { firstBattle: '06:00', lastBattle: '21:00' };
+
+/** An all-day Max Monday, 06:00 to 21:00 on Monday 2026-10-26, as the feed has them. */
+const monday: MaxEvent = {
+  kind: 'max-monday',
+  name: 'Dynamax Sableye during Max Monday',
+  start: at('2026-10-26T06:00'),
+  end: at('2026-10-26T21:00'),
+  short: false,
+  hoursAssumed: false,
+  featured: { gigantamax: false, names: ['Sableye'] },
+  id: 'monday',
+};
+
+function input(tier: MaxTier, time: number, events: readonly MaxEvent[] = recorded): MaxEndInput {
+  return { tier, at: time, events, big, hours, zone: MAX_ZONE };
+}
+
+/** The default end of a report at a local time, or `over`. */
+function endAt(tier: MaxTier, local: string, events?: readonly MaxEvent[]): number | 'over' {
+  const decided = defaultMaxEnd(input(tier, at(local), events));
+  return decided.kind === 'over' ? 'over' : decided.end;
+}
+
+describe('maxRotation: how long a battle lasts at a spot (design Q9, Matt 2026-10-21)', () => {
+  it('rotates every half hour in a short event, every hour all day, never on an ordinary day', () => {
+    // The lake trio's Max Battle Day, 14:00 to 17:00: a few hours.
+    expect(maxRotation(input('D5', at('2026-10-24T15:10')))).toBe('half-hour');
+    expect(maxRotation(input('D1', at('2026-10-26T15:10'), [monday]))).toBe('hour');
+    expect(maxRotation(input('D2', at('2026-10-22T15:10')))).toBe('day');
+  });
+
+  it('rotates a Gigantamax battle every hour outside any event, and in a big event all day', () => {
+    expect(maxRotation(input('G', at('2026-10-22T15:10')))).toBe('hour');
+    // Wild Area 2026 Global: all day for a Gigantamax battle, a Dynamax one as on any day.
+    expect(maxRotation(input('G', at('2026-11-14T12:00')))).toBe('hour');
+    expect(maxRotation(input('D2', at('2026-11-14T12:00')))).toBe('day');
+    // A Max Battle Day of a few hours inside it: its own half hours.
+    const day: MaxEvent = {
+      ...monday,
+      kind: 'max-battle',
+      name: 'Gigantamax Machamp Max Battle Day',
+      start: at('2026-11-14T14:00'),
+      end: at('2026-11-14T17:00'),
+      short: true,
+    };
+    expect(maxRotation(input('G', at('2026-11-14T15:00'), [day]))).toBe('half-hour');
+  });
+
+  // Review A, X3-B-5: while the rule outside events is an hour, a big event changes nothing that
+  // shows; with another rule outside, the big event's hour still holds inside it.
+  it('tells a Gigantamax battle in a big event from one outside, whatever the rule outside', () => {
+    expect(maxRotation(input('G', at('2026-11-14T12:00')), 'half-hour')).toBe('hour');
+    expect(maxRotation(input('G', at('2026-10-22T15:10')), 'half-hour')).toBe('half-hour');
+    expect(maxRotation(input('D2', at('2026-10-22T15:10')), 'half-hour')).toBe('day');
+  });
+});
+
+describe('defaultMaxEnd: the boundary of the rotation the battle is in', () => {
+  it('ends a battle of a short event at the next half hour after the report', () => {
+    expect(endAt('D5', '2026-10-24T14:00')).toBe(at('2026-10-24T14:30'));
+    expect(endAt('D5', '2026-10-24T14:29')).toBe(at('2026-10-24T14:30'));
+    expect(endAt('D5', '2026-10-24T14:31')).toBe(at('2026-10-24T15:00'));
+    expect(endAt('D5', '2026-10-24T16:59')).toBe(at('2026-10-24T17:00'));
+  });
+
+  it('ends a battle of an all-day event at the next full hour, never past the last battle', () => {
+    expect(endAt('D1', '2026-10-26T14:00', [monday])).toBe(at('2026-10-26T15:00'));
+    expect(endAt('D1', '2026-10-26T14:31', [monday])).toBe(at('2026-10-26T15:00'));
+    expect(endAt('D1', '2026-10-26T20:45', [monday])).toBe(at('2026-10-26T21:00'));
+  });
+
+  it('ends a Gigantamax battle outside events at the next hour, a Dynamax one at 21:00', () => {
+    expect(endAt('G', '2026-10-22T10:20')).toBe(at('2026-10-22T11:00'));
+    expect(endAt('D2', '2026-10-22T10:20')).toBe(at('2026-10-22T21:00'));
+    expect(endAt('G', '2026-11-14T20:30')).toBe(at('2026-11-14T21:00'));
+  });
+
+  // Matt, 2026-10-21 (Q-B): the event's own battles replace the day's at its start.
+  it('ends a Dynamax battle of the day at the start of a max event later that day', () => {
+    // The lake trio's Max Battle Day, 14:00 to 17:00.
+    expect(endAt('D2', '2026-10-24T10:00')).toBe(at('2026-10-24T14:00'));
+    expect(endAt('D2', '2026-10-24T05:30')).toBe(at('2026-10-24T14:00'));
+    // After it, the day's last battle time again; a Gigantamax battle keeps its own hour.
+    expect(endAt('D2', '2026-10-24T17:10')).toBe(at('2026-10-24T21:00'));
+    expect(endAt('G', '2026-10-24T10:20')).toBe(at('2026-10-24T11:00'));
+    // An event of another day changes nothing.
+    expect(endAt('D2', '2026-10-23T10:00')).toBe(at('2026-10-23T21:00'));
+  });
+
+  it('takes a report before the first battle, its rotation counted from then', () => {
+    expect(endAt('D2', '2026-10-22T05:30')).toBe(at('2026-10-22T21:00'));
+    expect(endAt('G', '2026-10-22T05:30')).toBe(at('2026-10-22T07:00'));
+  });
+
+  it('refuses a report at or after the last battle time', () => {
+    expect(endAt('D2', '2026-10-22T21:00')).toBe('over');
+    expect(endAt('G', '2026-10-22T23:10')).toBe('over');
+    expect(defaultMaxEnd(input('D2', at('2026-10-22T21:30')))).toEqual({
+      kind: 'over',
+      first: '06:00',
+      last: '21:00',
+    });
+  });
+});
+
+describe('nextRotationEnd: one rotation later (the ending-soon dialog)', () => {
+  it('is the boundary after the end, by the same rule, capped at the last battle', () => {
+    expect(nextRotationEnd(at('2026-10-24T14:30'), input('D5', at('2026-10-24T14:29')))).toBe(
+      at('2026-10-24T15:00'),
+    );
+    expect(
+      nextRotationEnd(at('2026-10-26T15:00'), input('D1', at('2026-10-26T14:57'), [monday])),
+    ).toBe(at('2026-10-26T16:00'));
+    // An end typed off the boundaries goes to the next one.
+    expect(nextRotationEnd(at('2026-10-22T10:42'), input('G', at('2026-10-22T10:40')))).toBe(
+      at('2026-10-22T11:00'),
+    );
+  });
+
+  it('is none at the last battle time, nor for a battle that lasts the day', () => {
+    expect(
+      nextRotationEnd(at('2026-10-26T21:00'), input('D1', at('2026-10-26T20:57'), [monday])),
+    ).toBeUndefined();
+    expect(
+      nextRotationEnd(at('2026-10-22T21:00'), input('D2', at('2026-10-22T20:57'))),
+    ).toBeUndefined();
+  });
+});
diff --git a/src/domain/time/max-end.ts b/src/domain/time/max-end.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2b5b2c74bce9fa7a71d8ff09d461045c4f0170a9
--- /dev/null
+++ b/src/domain/time/max-end.ts
@@ -0,0 +1,133 @@
+import { DateTime } from 'luxon';
+import type { MaxTier } from '../pogo/max-tier.js';
+import { bigEventAt, maxEventAt, type BigEvent, type MaxEvent } from './max-events.js';
+
+/*
+ * How long a max battle lasts at a spot (design Q9, settled by Matt on 2026-10-20 and 2026-10-21):
+ * battles rotate on the hour and the half hour, and a battle reported is already on (there is no
+ * egg), so its default end is the boundary of the rotation it is in, never a span from the report.
+ */
+
+/** The hours of the day max battles can be fought (`settings.maxBattles`), `HH:MM` in the zone. */
+export interface BattleHours {
+  firstBattle: string;
+  lastBattle: string;
+}
+
+export interface MaxEndInput {
+  tier: MaxTier;
+  /** When the battle was reported (or is being changed). */
+  at: number;
+  /** The max events known (`MaxEventProvider.maxEvents`). */
+  events: readonly MaxEvent[];
+  /** The big events known (`MaxEventProvider.bigEvents`). */
+  big: readonly BigEvent[];
+  hours: BattleHours;
+  /** `settings.timezone`. */
+  zone: string;
+}
+
+/**
+ * How battles rotate at a spot at that moment: every half hour in a short event (a Max Battle Day
+ * of a few hours, `MaxEvent.short`), every hour in an all-day one (a Max Monday, a Max Battle
+ * Weekend) and, for a Gigantamax battle, in a big event (Wild Area, GO Tour, GO Fest: Matt,
+ * 2026-10-21) or outside any event; otherwise (a Dynamax battle on an ordinary day) not at all:
+ * it lasts the day (`day`). An event that is on wins over a big event (a Max Battle Day inside a
+ * Wild Area keeps its half hours).
+ */
+export type MaxRotation = 'half-hour' | 'hour' | 'day';
+
+/** The rotation of an all-day event: every hour. */
+const ALL_DAY: MaxRotation = 'hour';
+
+/**
+ * The rotation of a Gigantamax battle outside any event's hours: every hour until Matt has seen
+ * one on a Gigantamax day (design Q9: 30 or 60 minutes, not known). The one place to change it.
+ */
+export const GIGANTAMAX_OUTSIDE_EVENTS: MaxRotation = 'hour';
+
+/**
+ * The rotation of a battle (`MaxRotation`); `outside` is the rule of a Gigantamax battle outside
+ * any event's hours, `GIGANTAMAX_OUTSIDE_EVENTS` unless a test gives another (so that a big event
+ * is told from outside while both rotate every hour).
+ */
+export function maxRotation(
+  input: Pick<MaxEndInput, 'tier' | 'at' | 'events' | 'big'>,
+  outside: MaxRotation = GIGANTAMAX_OUTSIDE_EVENTS,
+): MaxRotation {
+  const event = maxEventAt(input.events, input.at);
+  if (event) return event.short ? 'half-hour' : ALL_DAY;
+  if (input.tier !== 'G') return 'day';
+  return bigEventAt(input.big, input.at) ? ALL_DAY : outside;
+}
+
+/** A clock time of the settings on the day of `time`, in the zone. */
+function clockOn(time: number, clock: string, zone: string): number {
+  const [hour, minute] = clock.split(':').map(Number);
+  return DateTime.fromMillis(time, { zone })
+    .set({ hour: hour ?? 0, minute: minute ?? 0, second: 0, millisecond: 0 })
+    .toMillis();
+}
+
+/** The last battle time of the day of `time` (`settings.maxBattles.lastBattle`). */
+export function lastBattleOn(time: number, hours: BattleHours, zone: string): number {
+  return clockOn(time, hours.lastBattle, zone);
+}
+
+/** The first boundary of the rotation strictly after `time`, in the zone's clock. */
+function boundaryAfter(time: number, rotation: 'half-hour' | 'hour', zone: string): number {
+  const local = DateTime.fromMillis(time, { zone });
+  const hour = local.startOf('hour');
+  if (rotation === 'hour') return hour.plus({ hours: 1 }).toMillis();
+  const half = hour.plus({ minutes: 30 });
+  return half.toMillis() > time ? half.toMillis() : hour.plus({ hours: 1 }).toMillis();
+}
+
+/**
+ * The end of a Dynamax battle of an ordinary day (rotation `day`): the day's last battle time,
+ * or the start of the next max event later that day, whichever comes first (Matt, 2026-10-21,
+ * Q-B: a Max Battle Day's bosses replace the day's at its start; the member can move the end
+ * with `/end`, or give another with `end:`). One rule, in one place: Matt checks on the lake trio
+ * day of 2026-10-24 whether Dynamax battles were up before 14:00, and it may be revisited.
+ */
+function dayBattleEnd(events: readonly MaxEvent[], from: number, last: number): number {
+  const starts = events.map((event) => event.start).filter((start) => start > from && start < last);
+  return Math.min(last, ...starts);
+}
+
+/**
+ * The default end of a max battle reported at `input.at` (design 3.1, Q9): the next boundary of
+ * its rotation after the report (`maxRotation`: the next :00 or :30 in a short event, the next
+ * full hour all day and for a Gigantamax battle), else the day's last battle time or the start of
+ * a max event later that day (`dayBattleEnd`, Q-B); never past the last battle time. A report before the first battle time is taken (a battle seen at 05:30 is
+ * there at 06:00), its rotation counted from the first battle; one at or after the last battle
+ * time is `over`, with the hours to say.
+ */
+export function defaultMaxEnd(
+  input: MaxEndInput,
+): { kind: 'end'; end: number } | { kind: 'over'; first: string; last: string } {
+  const { at, hours, zone } = input;
+  const last = lastBattleOn(at, hours, zone);
+  if (at >= last) return { kind: 'over', first: hours.firstBattle, last: hours.lastBattle };
+  const from = Math.max(at, clockOn(at, hours.firstBattle, zone));
+  const rotation = maxRotation({ ...input, at: from });
+  if (rotation === 'day') return { kind: 'end', end: dayBattleEnd(input.events, from, last) };
+  // Counted from the first battle, a report before it is in the rotation that begins then.
+  const end = from > at ? boundaryAfter(from, rotation, zone) : boundaryAfter(at, rotation, zone);
+  return { kind: 'end', end: Math.min(end, last) };
+}
+
+/**
+ * The end one rotation after `end` (the ending-soon dialog of `/max`: "Until the next rotation"):
+ * the next boundary after `end` by the rule at the report (`maxRotation`), capped at the last
+ * battle time; undefined where there is none later (the cap, or a battle that lasts the day).
+ */
+export function nextRotationEnd(end: number, input: MaxEndInput): number | undefined {
+  const rotation = maxRotation(input);
+  if (rotation === 'day') return undefined;
+  const next = Math.min(
+    boundaryAfter(end, rotation, input.zone),
+    lastBattleOn(end, input.hours, input.zone),
+  );
+  return next > end ? next : undefined;
+}
diff --git a/src/domain/time/max-events.ts b/src/domain/time/max-events.ts
index 3d4abdab739c4500e9afc151f79d901709a50cd8..b0b7555d8d9cf1f972e53b831b9b3a3d62255757 100644
--- a/src/domain/time/max-events.ts
+++ b/src/domain/time/max-events.ts
@@ -246,3 +246,69 @@ export function featuredAt(
   });
   return [...battles, ...weeks].filter(({ event }) => event.featured !== undefined);
 }
+
+/**
+ * The kinds of ScrapedDuck's events that bring Gigantamax battles nearly all day, over a day or
+ * two, sometimes several bosses at once (Matt, 2026-10-21): Wild Area, GO Tour, and GO Fest
+ * Global, whose kind is not in the feed of 2026-10-20 (`pokemon-go-fest` is a guess: one line to
+ * change). Raids act as usual during them; for a Gigantamax battle they are all-day events
+ * (`maxRotation`). Their names name no boss: they feature nothing.
+ */
+export const BIG_EVENT_TYPES = ['wild-area', 'pokemon-go-tour', 'pokemon-go-fest'] as const;
+
+/** A big event (`BIG_EVENT_TYPES`) of the global edition. Times are epoch milliseconds. */
+export interface BigEvent {
+  /** The feed's `eventID`, which says `global` for the global edition. */
+  id: string;
+  /** The feed's name. Shown to members: escape it. */
+  name: string;
+  start: number;
+  /** The first moment after it. */
+  end: number;
+}
+
+const bigItem = z.object({
+  eventID: z.string().max(200),
+  eventType: z.enum(BIG_EVENT_TYPES),
+  name: eventName,
+  start: z.string().max(40).nullable().optional(),
+  end: z.string().max(40).nullable().optional(),
+});
+
+/** The id of a global edition: `global` as one of its words. */
+const GLOBAL_ID = /(^|-)global(-|$)/i;
+/** A time with a zone of its own (`Z`, `+09:00`): an in-person edition's, whatever its id says. */
+const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i;
+
+/**
+ * The big events of the events feed (plan 8X-3), the global editions only (Matt, 2026-10-21):
+ * the in-person city editions (Sendai, Mexico City, Kaohsiung, Los Angeles) are in another city
+ * until one comes to a region Pine serves; the feed gives them UTC times (`Z`) and ids without
+ * `global`. A global edition's times are local, read in `zone`. One without hours, or that ends
+ * before it starts or lasts longer than eight days, is left out. In order of their start.
+ *
+ * Throws when the document is not a list of events at all, so that the caller keeps what it had.
+ */
+export function parseBigEventFeed(json: unknown, zone: string): BigEvent[] {
+  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
+  const events: BigEvent[] = [];
+  for (const value of json as unknown[]) {
+    const parsed = bigItem.safeParse(value);
+    if (!parsed.success) continue;
+    const { eventID: id, name, start: from, end: to } = parsed.data;
+    if (!GLOBAL_ID.test(id) || typeof from !== 'string' || typeof to !== 'string') continue;
+    if (ZONED_TIME.test(from) || ZONED_TIME.test(to)) continue;
+    const start = DateTime.fromISO(from, { zone });
+    const end = DateTime.fromISO(to, { zone });
+    if (!start.isValid || !end.isValid) continue;
+    const length = end.toMillis() - start.toMillis();
+    if (length <= 0 || length > MAX_EVENT_MS) continue;
+    events.push({ id, name, start: start.toMillis(), end: end.toMillis() });
+  }
+  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+}
+
+/** The big event on at `time` (its start included, its end not); undefined when none is. */
+export function bigEventAt(events: readonly BigEvent[], time: number): BigEvent | undefined {
+  return events.find((event) => event.start <= time && time < event.end);
+}
diff --git a/src/services/max-boss-service.test.ts b/src/services/max-boss-service.test.ts
index b0b0092251c803ab6ffccb2bb02095b18163c867..acbd4370270971f5d8664cd5a9f00ba159266724 100644
--- a/src/services/max-boss-service.test.ts
+++ b/src/services/max-boss-service.test.ts
@@ -11,8 +11,9 @@ import { maxBossServiceWith } from '../../test/support/max-boss-service.js';
 import { readMaxEventFeed } from '../../test/support/max-events.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { pokemonFixture } from '../../test/support/providers.js';
-import { parseMaxEventFeed } from '../domain/time/max-events.js';
-import { currentMaxBossChoices, NO_MAX_BOSSES } from './max-boss-service.js';
+import { parseBigEventFeed, parseMaxEventFeed } from '../domain/time/max-events.js';
+import { NO_MAX_BOSSES } from '../../test/support/test-context.js';
+import { currentMaxBossChoices } from './max-boss-service.js';
 
 describe('MaxBossService', () => {
   it('stores the feed and offers the bosses of the day, an upcoming one from its day', async () => {
@@ -94,7 +95,7 @@ describe('MaxBossService', () => {
     const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
     const deps = {
       maxBosses: service,
-      maxEvents: { maxEvents: () => events },
+      maxEvents: { maxEvents: () => events, bigEvents: () => [] },
       pokemon: pokemonFixture(),
       gameData: { catalogue: catalogueFixture() },
       zone: MAX_ZONE,
@@ -110,6 +111,51 @@ describe('MaxBossService', () => {
     expect(currentMaxBossChoices({ ...deps, maxBosses: NO_MAX_BOSSES }, state.now)).toEqual([]);
   });
 
+  // Matt, 2026-10-21 (Q-A): in a big event, Gigantamax battles are what is up all day.
+  it('lists the Gigantamax bosses first during a big event, and last outside one', async () => {
+    const { service } = await maxBossServiceWith();
+    await service.sync();
+    const feed = readMaxEventFeed();
+    const deps = {
+      maxBosses: service,
+      maxEvents: {
+        maxEvents: () => parseMaxEventFeed(feed, MAX_ZONE).events,
+        bigEvents: () => parseBigEventFeed(feed, MAX_ZONE),
+      },
+      pokemon: pokemonFixture(),
+      gameData: { catalogue: catalogueFixture() },
+      zone: MAX_ZONE,
+    };
+    const ids = { pokemonId: 'MACHAMP', form: null, createdBy: '123456789012345678' };
+    await service.addOverride({ ...ids, action: 'add', tier: 'G', shiny: null, expiresAt: null });
+    const kinds = (time: number) =>
+      currentMaxBossChoices(deps, time).map((one) => (one.boss.tier === 'G' ? 'G' : 'D'));
+    // Pokémon GO Wild Area 2026: Global, 2026-11-14 10:00 to 11-15 18:00.
+    const inside = kinds(at('2026-11-14T12:00'));
+    expect(inside[0]).toBe('G');
+    expect(inside.indexOf('D')).toBeGreaterThan(inside.lastIndexOf('G'));
+    const outside = kinds(at('2026-11-13T12:00'));
+    expect(outside.at(-1)).toBe('G');
+    expect(outside[0]).toBe('D');
+  });
+
+  it('offers an upcoming boss no more once its event is over (plan 8X-3)', async () => {
+    const { service, state } = await maxBossServiceWith();
+    await service.sync();
+    const events = parseMaxEventFeed(readMaxEventFeed(), MAX_ZONE).events;
+    const deps = {
+      maxBosses: service,
+      maxEvents: { maxEvents: () => events, bigEvents: () => [] },
+      pokemon: pokemonFixture(),
+      gameData: { catalogue: catalogueFixture() },
+      zone: MAX_ZONE,
+    };
+    state.now = at('2026-10-25T12:00');
+    const names = currentMaxBossChoices(deps, state.now).map((one) => one.name);
+    expect(names).not.toContain('Uxie · Dynamax 5★');
+    expect(names).toContain('Sneasel · Dynamax 1★');
+  });
+
   it('keeps a Gigantamax boss staff hid off the list during the event that names it', async () => {
     const { service, state } = await maxBossServiceWith();
     await service.sync();
@@ -126,7 +172,7 @@ describe('MaxBossService', () => {
     ).events;
     const deps = {
       maxBosses: service,
-      maxEvents: { maxEvents: () => events },
+      maxEvents: { maxEvents: () => events, bigEvents: () => [] },
       pokemon: pokemonFixture(),
       gameData: { catalogue: catalogueFixture() },
       zone: MAX_ZONE,
diff --git a/src/services/max-boss-service.ts b/src/services/max-boss-service.ts
index 5bfdeaa24a1b63fb66ff9fbf504c6f21a0c803a4..9ef29204cefcb6d008ecb0734827c10124294277 100644
--- a/src/services/max-boss-service.ts
+++ b/src/services/max-boss-service.ts
@@ -1,4 +1,4 @@
-import type { MaxBossStore } from '../db/repositories/raid-boss-repository.js';
+import type { MaxBossStore, StoredBoss } from '../db/repositories/raid-boss-repository.js';
 import {
   comingMaxBosses,
   MAX_OPS,
@@ -7,10 +7,14 @@ import {
   parseMaxBossFeed,
   type MaxBoss,
 } from '../domain/pogo/max-bosses.js';
-import { maxBossChoices, type MaxBossChoice } from '../domain/pogo/max-boss-list.js';
+import {
+  maxBossChoices,
+  withoutEndedUpcoming,
+  type MaxBossChoice,
+} from '../domain/pogo/max-boss-list.js';
 import type { MaxTier } from '../domain/pogo/max-tier.js';
 import { familyOverrideKeys } from '../domain/pogo/raid-bosses.js';
-import { featuredAt } from '../domain/time/max-events.js';
+import { bigEventAt, featuredAt } from '../domain/time/max-events.js';
 import type { GameDataProvider } from './game-data-service.js';
 import type { PokemonFinder } from './pokemon-search-service.js';
 import type { MaxEventProvider } from './raid-event-service.js';
@@ -32,11 +36,11 @@ export interface MaxBossOptions extends BossFeedOptions<MaxTier> {
   zone: string;
 }
 
-/** What handlers need of the max bosses (plan 8X-2; `/max` is plan 8X-3). */
+/** What handlers need of the max bosses (plan 8X-2; `/max`, plan 8X-3). */
 export interface MaxBossProvider {
   /**
    * The max bosses in effect now: the feed's list whose start has come, with the moderators'
-   * max overrides applied, from D1 to G, then by name. Empty while max battles are off.
+   * max overrides applied, from D1 to G, then by name.
    */
   bosses(): MaxBoss[];
   /**
@@ -46,40 +50,49 @@ export interface MaxBossProvider {
   coming(): MaxBoss[];
   /** The bosses (key and tier) that the hide overrides in force take off the list. */
   hidden(): { key: string; tier: MaxTier }[];
+  /**
+   * The feed as stored, with when each boss was first a boss (`firstSeen`): an upcoming boss is
+   * left out of `/max`'s list once its event is over (`withoutEndedUpcoming`, plan 8X-3).
+   */
+  feedBosses(): readonly StoredBoss<MaxTier>[];
 }
 
 /** What staff need of the max boss list beyond what handlers read (`/admin boss`). */
 export type MaxBossAdmin = BossAdmin<MaxTier>;
 
-/** The max bosses while max battles are off (`settings.maxBattles` absent): none. */
-export const NO_MAX_BOSSES: MaxBossProvider = {
-  bosses: () => [],
-  coming: () => [],
-  hidden: () => [],
-};
-
 /**
  * The max bosses `/max` offers at `now`, in their order (`maxBossChoices`): the featured bosses of
  * the max events of the events feed first (`featuredAt`: a Max Battle Day's during its hours, the
  * week's Max Monday's), each event's names read through the Pokémon search, then 5 stars down to
  * 1 and Gigantamax; an upcoming boss a featured event names from that event's start, and during
- * a featured event's hours a Gigantamax boss it names that the feed does not list. `zone` is
- * `settings.timezone`. Plan 8X-3 calls it with the bot's context.
+ * a featured event's hours a Gigantamax boss it names that the feed does not list; an upcoming
+ * boss whose event is over is left out (`withoutEndedUpcoming`). During a big event's hours
+ * (`bigEventAt`: Wild Area, GO Tour, GO Fest; Matt, 2026-10-21, Q-A) the Gigantamax bosses come
+ * first, ahead of the featured Dynamax ones, each part in its order. `zone` is `settings.timezone`.
  */
 export function currentMaxBossChoices(
   deps: {
     maxBosses: MaxBossProvider;
-    maxEvents: MaxEventProvider;
+    maxEvents: Pick<MaxEventProvider, 'maxEvents' | 'bigEvents'>;
     pokemon: Pick<PokemonFinder, 'exact'>;
     gameData: GameDataProvider;
     zone: string;
   },
   now: number,
 ): MaxBossChoice[] {
-  return maxBossChoices(
-    deps.maxBosses.bosses(),
-    featuredAt(deps.maxEvents.maxEvents(), now, deps.zone),
-    (text) => deps.pokemon.exact(text),
+  const events = deps.maxEvents.maxEvents();
+  const exact = (text: string) => deps.pokemon.exact(text);
+  const choices = maxBossChoices(
+    withoutEndedUpcoming(
+      deps.maxBosses.bosses(),
+      deps.maxBosses.feedBosses(),
+      events,
+      exact,
+      now,
+      deps.zone,
+    ),
+    featuredAt(events, now, deps.zone),
+    exact,
     {
       coming: deps.maxBosses.coming(),
       time: now,
@@ -87,6 +100,9 @@ export function currentMaxBossChoices(
       hidden: deps.maxBosses.hidden(),
     },
   );
+  if (!bigEventAt(deps.maxEvents.bigEvents(), now)) return choices;
+  const gigantamax = (choice: MaxBossChoice): boolean => choice.boss.tier === 'G';
+  return [...choices.filter(gigantamax), ...choices.filter((choice) => !gigantamax(choice))];
 }
 
 /**
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index ea2455582df3fe63acefac242cc9f1ee810f1b94..ac81d62a2360307609a87ddffc74f0cc69b8282c 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -366,4 +366,54 @@ describe('RaidEventService', () => {
       );
     });
   });
+
+  // Plan 8X-3: the big events with Gigantamax battles all day, of the same feed.
+  describe('the big events', () => {
+    it('keeps the global editions of a read, and those it had when a read fails', async () => {
+      let fail = false;
+      const feed = JSON.stringify(readMaxEventFeed());
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(fail ? reply(500) : reply(200, feed)));
+      const { events } = service(fetch, { now: () => at('2026-10-20T22:00') });
+      expect(events.bigEvents()).toEqual([]);
+      await events.refresh();
+      const names = events.bigEvents().map((event) => event.name);
+      expect(names).toEqual([
+        'Pokémon GO Wild Area 2026: Global',
+        'Pokémon GO Tour: Alola - Global 2027',
+      ]);
+      fail = true;
+      await events.refresh();
+      expect(events.bigEvents().map((event) => event.name)).toEqual(names);
+    });
+
+    // Review A of 8X-3, X3-B-5: ScrapedDuck may drop an event while it is on, as `mergedMax` keeps.
+    it('keeps a big event that has begun while it lasts, though a read no longer lists it', async () => {
+      const full = readMaxEventFeed() as { eventID?: string }[];
+      const wild = 'pokemon-go-wild-area-2026-global';
+      let feed = full;
+      let now = at('2026-11-14T12:00');
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, JSON.stringify(feed))));
+      const { events } = service(fetch, { now: () => now });
+      await events.refresh();
+      const ids = () => events.bigEvents().map((event) => event.id);
+      expect(ids()).toContain(wild);
+      // Dropped by the feed while it is on: still on.
+      feed = full.filter((item) => item.eventID !== wild);
+      now = at('2026-11-15T09:00');
+      await events.refresh();
+      expect(ids()).toContain(wild);
+      // Once it is over, a read that does not list it forgets it.
+      now = at('2026-11-15T19:00');
+      await events.refresh();
+      expect(ids()).not.toContain(wild);
+      // One that has not begun and is no longer listed was moved or cancelled: it goes at once.
+      const tour = 'pokemon-go-tour-alola-global-2027';
+      feed = full;
+      await events.refresh();
+      expect(ids()).toContain(tour);
+      feed = full.filter((item) => item.eventID !== tour);
+      await events.refresh();
+      expect(ids()).not.toContain(tour);
+    });
+  });
 });
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index b0eee8a80e0e3aa7be3b925b5426146e9dcc3655..82bc3968ff333645ab820a1cdbc8f40c9af893d1 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -1,6 +1,8 @@
 import { DateTime } from 'luxon';
 import {
+  parseBigEventFeed,
   parseMaxEventFeed,
+  type BigEvent,
   type MaxEvent,
   type ParsedMaxEvents,
 } from '../domain/time/max-events.js';
@@ -56,6 +58,12 @@ export interface RaidEventProvider {
 export interface MaxEventProvider {
   /** In order of their start; empty until the feed was read once. */
   maxEvents(): readonly MaxEvent[];
+  /**
+   * The big events with Gigantamax battles all day (plan 8X-3: Wild Area, GO Tour, GO Fest; the
+   * global editions), of the last good read with those on now that the feed has dropped since
+   * (`mergedBig`), in order of their start: a max battle's default end.
+   */
+  bigEvents(): readonly BigEvent[];
 }
 
 export type RefreshResult =
@@ -75,6 +83,7 @@ export type RefreshResult =
 export class RaidEventService implements RaidEventProvider, MaxEventProvider {
   private current: readonly RaidEvent[] = [];
   private currentMax: readonly MaxEvent[] = [];
+  private currentBig: readonly BigEvent[] = [];
   private readonly timeoutMs: number;
   private readonly retryMs: number;
   private controller: AbortController | undefined;
@@ -99,6 +108,10 @@ export class RaidEventService implements RaidEventProvider, MaxEventProvider {
     return this.currentMax;
   }
 
+  bigEvents(): readonly BigEvent[] {
+    return this.currentBig;
+  }
+
   /**
    * Reads the feed. Never rejects. Calls made while one is running share its result.
    */
@@ -150,6 +163,7 @@ export class RaidEventService implements RaidEventProvider, MaxEventProvider {
       const read = await this.readFeed();
       this.current = this.merged(read.raid);
       this.currentMax = this.mergedMax(read.max.events);
+      this.currentBig = this.mergedBig(read.big);
       this.tellOfHours(read.max);
     } catch (err) {
       if (err instanceof RefreshStopped) return { status: 'failed', reason: 'stopped' };
@@ -200,6 +214,20 @@ export class RaidEventService implements RaidEventProvider, MaxEventProvider {
     return [...read, ...dropped].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
   }
 
+  /**
+   * The big events just read, plus those known before that have begun and not ended, which the
+   * feed no longer lists (review A of 8X-3: as `mergedMax`, by the feed's id): a Wild Area dropped
+   * on its second day is still on. One that has not begun and is no longer listed was moved or
+   * cancelled, and one that is over is of no use: they go.
+   */
+  private mergedBig(read: readonly BigEvent[]): BigEvent[] {
+    const now = (this.options.now ?? Date.now)();
+    const kept = this.currentBig.filter(
+      (old) => old.start <= now && now < old.end && !read.some((event) => event.id === old.id),
+    );
+    return [...read, ...kept].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+  }
+
   /**
    * Each read: the max events whose hours were assumed, as information, and those without hours
    * that feature nothing although their date is today or later, as a warning, so that a feed
@@ -219,7 +247,11 @@ export class RaidEventService implements RaidEventProvider, MaxEventProvider {
     }
   }
 
-  private async readFeed(): Promise<{ raid: RaidEvent[]; max: ParsedMaxEvents }> {
+  private async readFeed(): Promise<{
+    raid: RaidEvent[];
+    max: ParsedMaxEvents;
+    big: BigEvent[];
+  }> {
     const { url } = this.options;
     const timeout = AbortSignal.timeout(this.timeoutMs);
     const controller = new AbortController();
@@ -253,6 +285,7 @@ export class RaidEventService implements RaidEventProvider, MaxEventProvider {
     return {
       raid: parseRaidEventFeed(json, this.options.zone),
       max: parseMaxEventFeed(json, this.options.zone),
+      big: parseBigEventFeed(json, this.options.zone),
     };
   }
 
diff --git a/test/fixtures/max-events.json b/test/fixtures/max-events.json
index 4d2e08c7755a29aff8805367180188520a0478ab..7faca952e76ce803c2b068c4915a6a9426272349 100644
--- a/test/fixtures/max-events.json
+++ b/test/fixtures/max-events.json
@@ -142,5 +142,101 @@
         "hasFieldResearchTasks": false
       }
     }
+  },
+  {
+    "eventID": "pokemon-go-wild-area-2026-sendai-japan",
+    "name": "Pokémon GO Wild Area 2026: Sendai • Tohoku",
+    "eventType": "wild-area",
+    "heading": "Wild Area",
+    "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-sendai-japan/",
+    "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-06-pokemon-go-wild-area-2026-sendai-japan/key-art.jpg",
+    "start": "2026-11-06T01:00:00.000Z",
+    "end": "2026-11-08T09:00:00.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-wild-area-2026-mexico-city",
+    "name": "Pokémon GO Wild Area 2026: Mexico City",
+    "eventType": "wild-area",
+    "heading": "Wild Area",
+    "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/",
+    "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-06-pokemon-go-wild-area-2026-mexico-city/key-art.jpg",
+    "start": "2026-11-06T16:00:00.000Z",
+    "end": "2026-11-09T00:00:00.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-wild-area-2026-global",
+    "name": "Pokémon GO Wild Area 2026: Global",
+    "eventType": "wild-area",
+    "heading": "Wild Area",
+    "link": "https://leekduck.com/events/pokemon-go-wild-area-2026-global/",
+    "image": "https://cdn.leekduck.com/assets/img/events/article-images/2026/2026-11-14-pokemon-go-wild-area-2026-global/key-art.jpg",
+    "start": "2026-11-14T10:00:00.000",
+    "end": "2026-11-15T18:00:00.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": true,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-tour-alola-kaohsiung-2027",
+    "name": "Pokémon GO Tour: Alola - Kaohsiung 2027",
+    "eventType": "pokemon-go-tour",
+    "heading": "Pokémon GO Tour",
+    "link": "https://leekduck.com/events/pokemon-go-tour-alola-kaohsiung-2027/",
+    "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+    "start": "2027-02-18T16:00:00.000Z",
+    "end": "2027-02-21T15:59:59.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-tour-alola-los-angeles-2027",
+    "name": "Pokémon GO Tour: Alola - Los Angeles 2027",
+    "eventType": "pokemon-go-tour",
+    "heading": "Pokémon GO Tour",
+    "link": "https://leekduck.com/events/pokemon-go-tour-alola-los-angeles-2027/",
+    "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+    "start": "2027-02-19T08:00:00.000Z",
+    "end": "2027-02-22T07:59:59.000Z",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
+  },
+  {
+    "eventID": "pokemon-go-tour-alola-global-2027",
+    "name": "Pokémon GO Tour: Alola - Global 2027",
+    "eventType": "pokemon-go-tour",
+    "heading": "Pokémon GO Tour",
+    "link": "https://leekduck.com/events/pokemon-go-tour-alola-global-2027/",
+    "image": "https://cdn.leekduck.com/assets/img/events/events-default-img.jpg",
+    "start": "2027-02-27T00:00:00.000",
+    "end": "2027-02-28T23:59:59.000",
+    "extraData": {
+      "generic": {
+        "hasSpawns": false,
+        "hasFieldResearchTasks": false
+      }
+    }
   }
 ]
diff --git a/test/support/boss-commands.ts b/test/support/boss-commands.ts
index e895484d4bcdc3a933c4cb9330b37b4d0b2e7dd2..c3d1bc15ebbcff477744f8fd0f0c3ef9593f0518 100644
--- a/test/support/boss-commands.ts
+++ b/test/support/boss-commands.ts
@@ -26,8 +26,8 @@ type OptionValue = string | number | boolean;
  * channel of West unless a call says otherwise. `use(group, subcommand, options)` runs a
  * subcommand (`group` null for one outside a group); `typing` asks for the list of an option.
  * `Date` is not faked: tests that read dates fake it themselves; the service has its own clock
- * (`bosses.state.now`). With `max` (plan 8X-2) max battles are on: a real `MaxBossService`
- * (`maxBossServiceWith`, its clock `max.state.now`) that has read the recorded Pokebattler feed, its
+ * (`bosses.state.now`). Max battles are always on: a real `MaxBossService` (`maxBossServiceWith`,
+ * its clock `max.state.now`); with `max` (plan 8X-2) it has read the recorded Pokebattler feed, its
  * override ids counted with the raid bosses' as in the one table.
  */
 export async function bossCommandsWith(
@@ -45,15 +45,16 @@ export async function bossCommandsWith(
     ...(options.empty ? { empty: true } : {}),
     ids,
   });
-  const max = options.max ? await maxBossServiceWith({ ids }) : undefined;
-  await max?.service.sync();
+  const max = await maxBossServiceWith({ ids });
+  if (options.max) await max.service.sync();
   const search = await nicknameSearchWith(options.nicknames ?? {});
   const { ctx, entries } = createTestContext({
     raidBosses: bosses.service,
     raidBossAdmin: bosses.service,
     pokemon: search.search,
     nicknames: search.search,
-    ...(max ? { maxBosses: max.service, maxBossAdmin: max.service } : {}),
+    maxBosses: max.service,
+    maxBossAdmin: max.service,
     ...options.context,
   });
   const router = new InteractionRouter(ctx, [admin], []);
diff --git a/test/support/max-events.ts b/test/support/max-events.ts
index 5be4222dd1187c1724183812f3886c88bf414534..ecad394be1c75b57ca2d989a2ecebefdf2164d46 100644
--- a/test/support/max-events.ts
+++ b/test/support/max-events.ts
@@ -7,7 +7,10 @@ const fixtures = path.resolve(import.meta.dirname, '../fixtures');
  * ScrapedDuck's events feed as downloaded on 2026-10-20 at 21:54, its max events kept unchanged
  * (six `max-mondays`, one of them "Dynamax Sneasel during Max Monday" without hours and one
  * "Max Monday: Pokémon to be announced"; one `max-battles`, the lake trio's Max Battle Day of
- * 2026-10-24 14:00 to 17:00), the `event` "Dynamax Trails" and one Raid Hour (Palkia, 2026-10-21).
+ * 2026-10-24 14:00 to 17:00), the `event` "Dynamax Trails" and one Raid Hour (Palkia, 2026-10-21);
+ * and (plan 8X-3) its three `wild-area` and three `pokemon-go-tour` events unchanged: the global
+ * Wild Area 2026 (2026-11-14 10:00 to 11-15 18:00) and GO Tour Alola (2027-02-27 to 28) in local
+ * time, and the in-person city editions in UTC.
  */
 export function readMaxEventFeed(): unknown {
   return JSON.parse(readFileSync(path.join(fixtures, 'max-events.json'), 'utf8'));
diff --git a/test/support/raid-events.ts b/test/support/raid-events.ts
index f0ee985be24b5fcf3a528aa2a00957b03fa448b5..2610d7f0450b54b4a4d559fe5694d4af190866bc 100644
--- a/test/support/raid-events.ts
+++ b/test/support/raid-events.ts
@@ -1,7 +1,8 @@
 import { readFileSync } from 'node:fs';
 import path from 'node:path';
 import { parseRaidEventFeed, type RaidEvent } from '../../src/domain/time/raid-events.js';
-import type { RaidEventProvider } from '../../src/services/raid-event-service.js';
+import type { BigEvent, MaxEvent } from '../../src/domain/time/max-events.js';
+import type { MaxEventProvider, RaidEventProvider } from '../../src/services/raid-event-service.js';
 
 const fixtures = path.resolve(import.meta.dirname, '../fixtures');
 
@@ -14,8 +15,17 @@ export function readRaidEventFeed(): unknown {
   return JSON.parse(readFileSync(path.join(fixtures, 'raid-events.json'), 'utf8'));
 }
 
-/** The Raid Hours and Raid Days of the fixture, read in the zone of the test settings. */
-export function raidEventsFixture(zone = 'America/New_York'): RaidEventProvider {
+/**
+ * The Raid Hours and Raid Days of the fixture, read in the zone of the test settings; no max
+ * event and no big event unless a test gives them (`max`, `big`: `parseMaxEventFeed`,
+ * `parseBigEventFeed` of `readMaxEventFeed()`, or events of its own).
+ */
+export function raidEventsFixture(
+  zone = 'America/New_York',
+  extra: { max?: readonly MaxEvent[]; big?: readonly BigEvent[] } = {},
+): RaidEventProvider & MaxEventProvider {
   const events: readonly RaidEvent[] = parseRaidEventFeed(readRaidEventFeed(), zone);
-  return { events: () => events };
+  const max = extra.max ?? [];
+  const big = extra.big ?? [];
+  return { events: () => events, maxEvents: () => max, bigEvents: () => big };
 }
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index e43192942b66cd963cf2e3d27f95de057ec2b284..f2e7b18ecdd0a01bf7d1ce6a0fe649e6167e2910 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -31,7 +31,7 @@ import { FakeIssues } from './issues.js';
 import { FakePokebattler } from './pokebattler.js';
 import { FakePlaces } from './places.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
-import { NO_MAX_BOSSES } from '../../src/services/max-boss-service.js';
+import type { MaxBossAdmin, MaxBossProvider } from '../../src/services/max-boss-service.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { selfRolesWith } from './roles.js';
@@ -67,6 +67,14 @@ function unavailable<T extends object>(name: string, hint: string): T {
   });
 }
 
+/** Max bosses of a test that names none: no boss, nothing coming, nothing hidden. */
+export const NO_MAX_BOSSES: MaxBossProvider = {
+  bosses: () => [],
+  coming: () => [],
+  hidden: () => [],
+  feedBosses: () => [],
+};
+
 /** An AppContext with real settings, the test env, a capturing logger and no database. */
 export function createTestContext(overrides: Partial<AppContext> = {}) {
   const { log, entries } = createTestLogger();
@@ -83,10 +91,13 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'raidBossAdmin',
       'pass { raidBosses: service, raidBossAdmin: service } from raidBossServiceWith()',
     ),
-    // Max battles are off, as in the test settings, unless a test passes
-    // { maxBosses: service, maxBossAdmin: service } from maxBossServiceWith().
+    // No max boss, unless a test passes { maxBosses: service, maxBossAdmin: service } from
+    // maxBossServiceWith().
     maxBosses: NO_MAX_BOSSES,
-    maxBossAdmin: undefined,
+    maxBossAdmin: unavailable<MaxBossAdmin>(
+      'maxBossAdmin',
+      'pass { maxBosses: service, maxBossAdmin: service } from maxBossServiceWith()',
+    ),
     raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
     gymAdmin: unavailable<GymAdminService>(
````

### Task 4: 8X-3 task 4: the max battle's post, its forum and the summary

Prototype commit: `c031bd21a75e9114d407735e82386891906bf7dd`

The post and the party service's side of a max battle (design 3.3), before
/max (task 5), which needs both.

- renderMaxPost (src/render/max-post.ts): the heading "### Dynamax Machamp
  (2★)" / "### Gigantamax Machamp" (shiny marked), "Until 21:00 (in …)" or
  "Ended at …" or why staff closed it, the boss's types and weaknesses (no
  catch CP, no moves), the boss's picture beside them (the Gigantamax picture
  where the game's icons have one: shownMaxBoss over maxBossPicture). Where:
  a power spot as a meetup's known place, "**<title>** (power spot) ·
  <address> · [Map]" with its Wayfarer picture, as it is now while it is the
  same place (spotNow, shownPlace); a pin "📍 **Unlisted power spot** ·
  [Map]". The groups with their lobby (8X-1), the controls of a battle
  (Done completes; Remote kept; no Set time, no Screenshot feedback), the
  reporter. Title "<battle> · <spot>", tags Max battle (+ Ended), the brief
  of a DM with the spot's line and Map.
- FORUM_TAGS gains Max battle (ensureTags adds it to the forums).
- The summary lists max battles under **Max battles** after the raids, 5
  stars down to 1, Gigantamax last, the soonest end first, and counts them.
- PartyService: maxView, the renderer of the kind, regionForSpot (the
  regions whose outlines hold the spot, the report's own first), reportMax
  (MaxReport, MaxReportOutcome: created, exists for the same boss and tier,
  which signs the reporter up with their automatic status, taken for
  another boss, no-region, no-forum, no-post, barred), max battles at a
  power spot shown anew after a load of the kept Wayspots; options.maxBosses
  for the shiny flag and the list's picture. The region link line says "New
  max battle: <#post>".
- raid-post.ts: weaknessLines and typesLine out of bossFacts.

**Files:**

```
 src/app.ts                              |   1 +
 src/render/max-post.test.ts             | 209 ++++++++++++++++++++++++++++++++++++++++
 src/render/max-post.ts                  | 272 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/moderation.ts                |   4 +-
 src/render/party-post.ts                |   1 +
 src/render/raid-post.ts                 |  52 +++++++---
 src/render/summary.test.ts              |  55 +++++++++++
 src/render/summary.ts                   |  46 ++++++++-
 src/services/moderation-reports.test.ts |  53 +++++++++-
 src/services/moderation-reports.ts      |   8 +-
 src/services/party-service.max.test.ts  | 180 ++++++++++++++++++++++++++++++++++
 src/services/party-service.ts           | 232 +++++++++++++++++++++++++++++++++++++++++++-
 test/support/party-service.ts           |  44 ++++++++-
 13 files changed, 1129 insertions(+), 28 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/max-post.test.ts src/render/summary.test.ts src/services/moderation-reports.test.ts src/services/party-service.max.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c031bd21a75e9114d407735e82386891906bf7dd -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 task 4: the max battle's post, its forum and the summary`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 90030f4ace02fc9178d2270292ceab12ec5ef192..5224a5cb5d25b1b66ef5e0d9dc328f27d0c38bed 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -339,6 +339,7 @@ export async function startApp(
     guilds,
     gyms,
     raidBosses,
+    maxBosses,
     gameData,
     raidEvents,
     users,
diff --git a/src/render/max-post.test.ts b/src/render/max-post.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9218a075f6fefd092526db77d11e6dac1a343d89
--- /dev/null
+++ b/src/render/max-post.test.ts
@@ -0,0 +1,209 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import {
+  accentOf,
+  buttonNames,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+  thumbnailsOf,
+} from '../../test/support/messages.js';
+import {
+  ALICE,
+  at,
+  BOB,
+  CAROL,
+  PARTY_NOW,
+  PARTY_ZONE,
+  TEST_PIN,
+  TEST_SPOT,
+  testMax,
+  withAttendees,
+} from '../../test/support/parties.js';
+import { expectSendable } from '../../test/support/post-limits.js';
+import { keptRow } from '../../test/support/wayspot-cases.js';
+import { endParty, type MaxParty } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { maxTags, maxTitle, renderMaxPost, type MaxPostView } from './max-post.js';
+import { ENDED_COLOUR, KEPT_OPEN } from './party-post.js';
+import { renderRegionLink } from './summary.js';
+
+const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
+const emoji = { shiny: '✨', remote: '🛰️', teams };
+const catalogue = catalogueFixture();
+const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
+const machamp = catalogue.byKey('machamp');
+const END = at('2026-10-13T21:00');
+
+function view(party: MaxParty, extra: Partial<MaxPostView> = {}): MaxPostView {
+  return {
+    party,
+    now: PARTY_NOW,
+    zone: PARTY_ZONE,
+    boss: {
+      name: 'Machamp',
+      ...(machamp ? { entry: machamp } : {}),
+      shiny: false,
+      image: 'https://example.test/machamp.png',
+    },
+    catalogue,
+    emoji,
+    lobbySize: party.max.tier === 'G' ? 100 : 4,
+    splitLobby: null,
+    ...extra,
+  };
+}
+
+const post = (party: MaxParty, extra: Partial<MaxPostView> = {}) =>
+  renderMaxPost(view(party, extra));
+
+describe('renderMaxPost: the heading (design 3.3)', () => {
+  it('names a Dynamax battle by its boss and stars, with its end, types and weaknesses', () => {
+    const [heading = ''] = textDisplays(post(testMax()).message);
+    const lines = heading.split('\n');
+    expect(lines[0]).toBe('### Dynamax Machamp (2★)');
+    expect(lines[1]).toBe(`Until ${stamp(END)} (${stamp(END, 'R')}).`);
+    expect(lines[2]).toBe('**Types** Fighting');
+    expect(lines[3]).toMatch(/^\*\*Weaknesses\*\* /);
+    // No catch CP and no moves (design 3.3: a follow-up if wanted).
+    expect(heading).not.toMatch(/Catch CP|Moveset/);
+  });
+
+  it('names a Gigantamax battle without stars, its picture beside the heading', () => {
+    const giga = testMax({ tier: 'G' });
+    const rendered = post(giga, {
+      boss: { name: 'Machamp', shiny: true, image: 'https://example.test/gmax.png' },
+    });
+    expect(textDisplays(rendered.message)[0]?.split('\n')[0]).toBe('### Gigantamax Machamp ✨');
+    expect(thumbnailOf(rendered.message)).toBe('https://example.test/gmax.png');
+  });
+
+  it('says when it ended, and is shown ended once its end has passed', () => {
+    const rendered = post(testMax(), { now: END });
+    expect(textDisplays(rendered.message)[0]?.split('\n')[1]).toBe(`Ended at ${stamp(END, 'f')}.`);
+    expect(accentOf(rendered.message)).toBe(ENDED_COLOUR);
+    expect(rendered.tags).toEqual(['Max battle', 'Ended']);
+    expect(post(testMax()).tags).toEqual(['Max battle']);
+  });
+
+  it('says why when staff closed it, and that a moderator keeps it open', () => {
+    const closed = post(testMax(), { closed: 'Closed by a moderator.' });
+    expect(textDisplays(closed.message)[0]?.split('\n')[1]).toBe('Closed by a moderator.');
+    expect(closed.tags).toEqual(['Max battle', 'Ended']);
+    expect(textOf(post({ ...testMax(), saved: true }).message)).toContain(KEPT_OPEN);
+  });
+});
+
+describe('renderMaxPost: Where', () => {
+  it('shows a power spot as a known place, with its address, Map and picture', () => {
+    const spot = { ...TEST_SPOT, image: 'https://lh3.googleusercontent.com/spot' };
+    const rendered = post(testMax({ spot }));
+    const where = textDisplays(rendered.message).find((text) => text.startsWith('**Where**'));
+    expect(where).toBe(
+      '**Where**\n**Gazebo of the Park** (power spot) · 1 Park Lane · ' +
+        '[Map](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
+    );
+    expect(thumbnailsOf(rendered.message)).toContain('https://lh3.googleusercontent.com/spot=s400');
+  });
+
+  it('shows the power spot as it is now while it is the same place', () => {
+    const now = keptRow(1, {
+      id: TEST_SPOT.id,
+      kind: 'powerspot',
+      title: 'Gazebo of the Old Park',
+      lat: TEST_SPOT.lat,
+      lon: TEST_SPOT.lon,
+    });
+    const rendered = post(testMax(), { wayspot: (id) => (id === TEST_SPOT.id ? now : undefined) });
+    expect(textOf(rendered.message)).toContain('**Gazebo of the Old Park** (power spot)');
+  });
+
+  it('shows a pin as an unlisted power spot with its Map', () => {
+    const rendered = post(testMax({ spot: TEST_PIN }));
+    const where = textDisplays(rendered.message).find((text) => text.startsWith('**Where**'));
+    expect(where).toBe(
+      '**Where**\n📍 **Unlisted power spot** · ' +
+        '[Map](<https://www.google.com/maps/search/?api=1&query=40.002%2C-80.002>)',
+    );
+  });
+});
+
+describe('renderMaxPost: groups, controls and the rest', () => {
+  it('counts each group against its lobby, and has Done but no Set time', () => {
+    const party = withAttendees(testMax(), {
+      [ALICE]: { status: PartyStatus.Coming, number: 3, name: 'Alice' },
+      [BOB]: { status: PartyStatus.Present, name: 'Bob', group: 'B' },
+      [CAROL]: { status: PartyStatus.Interested, name: 'Carol', group: 'B' },
+    });
+    const twoGroups: MaxParty = { ...party, groups: [{ id: 'A' }, { id: 'B' }] };
+    const text = textOf(post(twoGroups).message);
+    expect(text).toContain('**Group A** · 3/4 coming');
+    expect(text).toContain('**Group B** · 1/4 coming · 1 interested');
+    const names = buttonNames(post(twoGroups).message);
+    expect(names).toContain('🎉');
+    expect(names).not.toContain('Set time');
+    expect(names).not.toContain('Screenshot feedback');
+    expect(names).toContain('📡');
+  });
+
+  it('is titled by its boss and spot, and its link line names a max battle', () => {
+    expect(maxTitle(view(testMax()))).toBe('Dynamax Machamp (2★) · Gazebo of the Park');
+    expect(maxTitle(view(testMax({ spot: TEST_PIN, tier: 'G' })))).toBe(
+      'Gigantamax Machamp · Unlisted power spot',
+    );
+    expect(renderRegionLink('300000000000000001', 'max')).toBe(
+      'New max battle: <#300000000000000001>',
+    );
+    expect(maxTags(testMax(), PARTY_NOW)).toEqual(['Max battle']);
+  });
+
+  it('names who reported it unless they asked not to be named', () => {
+    const named = { ...testMax(), makerName: 'Rita' };
+    expect(textOf(post(named).message)).toContain('-# Reported by **Rita**');
+    expect(textOf(post({ ...named, anonymous: true }).message)).not.toContain('Reported by');
+  });
+
+  it('says in brief what it is, when it ends, where and how many come, with its Map', () => {
+    const { brief } = post({ ...testMax(), makerName: 'Rita' });
+    expect(brief.lines).toEqual([
+      '**Dynamax Machamp (2★)**',
+      `Until ${stamp(END)} (${stamp(END, 'R')}).`,
+      '**Gazebo of the Park** (power spot) · 1 Park Lane',
+      '1 trainer',
+    ]);
+    expect(brief.whereLine).toBe('**Gazebo of the Park** (power spot) · 1 Park Lane');
+    expect(brief.map).toBe('https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005');
+    expect(brief.picture).toBe('https://example.test/machamp.png');
+  });
+
+  it('fits Discord with every copy, at its worst', () => {
+    const many = Object.fromEntries(
+      Array.from({ length: 60 }, (_, n) => [
+        `2000000000000001${String(n).padStart(2, '0')}`,
+        {
+          status: PartyStatus.Coming,
+          name: '*_`~|>'.repeat(5).slice(0, 32),
+          group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5],
+          remote: true,
+          number: 3,
+        },
+      ]),
+    );
+    // Review B, B10: the spot's picture, an address that is all escapes, a reporter's name too.
+    const spot = {
+      ...TEST_SPOT,
+      title: '*'.repeat(255),
+      address: '*_`~|>'.repeat(84).slice(0, 500),
+      image: `https://lh3.googleusercontent.com/${'a'.repeat(1900)}`,
+    };
+    const party: MaxParty = {
+      ...withAttendees(testMax({ spot }), many),
+      makerName: '*_`~|>'.repeat(6).slice(0, 32),
+      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: '_'.repeat(100) })),
+    };
+    expect(thumbnailsOf(post(party).message)).toHaveLength(2);
+    expect(textOf(post(party).message)).toContain('-# Reported by ');
+    expectSendable(post(party));
+    expectSendable(post(endParty(party), { now: END }));
+  });
+});
diff --git a/src/render/max-post.ts b/src/render/max-post.ts
new file mode 100644
index 0000000000000000000000000000000000000000..724214113e09ab19fb34430fa2d81c88e7c2a4cf
--- /dev/null
+++ b/src/render/max-post.ts
@@ -0,0 +1,272 @@
+import { shownPlace, type KnownPlace } from '../domain/geo/place.js';
+import { wayspotAddressLine } from '../domain/geo/wayfarer-address.js';
+import { maxEnded, maxSpotName, UNLISTED_SPOT } from '../domain/party/max.js';
+import { memberOf, type MaxParty, type PowerSpot } from '../domain/party/party.js';
+import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import type { MaxBoss } from '../domain/pogo/max-bosses.js';
+import { maxBossTitle } from '../domain/pogo/max-tier.js';
+import { titleCase } from '../domain/pogo/names.js';
+import { maxBossPicture, type PokemonIcons } from '../domain/pogo/pokemon-icons.js';
+import type { WayspotRow } from '../domain/wayspots/kept.js';
+import { wayspotPicture } from '../domain/wayspots/picture.js';
+import { bottomControls } from './party-controls.js';
+import {
+  ENDED_COLOUR,
+  fittedLayout,
+  KEPT_OPEN,
+  renderedPost,
+  tidyTitle,
+  trainerBlocks,
+  trainerCount,
+  type Fit,
+  type ForumTag,
+  type PartyBrief,
+  type PostBlock,
+  type PostLayout,
+  type RenderedPost,
+  type TrainersView,
+} from './party-post.js';
+import { PLACE_KIND_WORDS } from './place.js';
+import {
+  gymMapsUrl,
+  mapMarkdown,
+  placeSection,
+  typesLine,
+  weaknessLines,
+  WHERE_HEADING,
+  type ShownBoss,
+} from './raid-post.js';
+import { LIMITS, memberByName, plain, plainNoLinks, timestamp, truncate } from './text.js';
+
+/** The colour of a max battle's post while it is on: the game's Dynamax red. */
+export const MAX_COLOUR = 0xd81b60;
+
+/** What the post of a max battle is rendered from (`PartyService.maxView`). */
+export interface MaxPostView extends TrainersView {
+  party: MaxParty;
+  now: number;
+  /** `settings.timezone`. */
+  zone: string;
+  /** The boss as it is shown: its name, catalogue entry, shiny flag and picture. */
+  boss: ShownBoss;
+  catalogue: PokemonCatalogue;
+  /**
+   * The kept Wayspot with an id (`ctx.wayspots`): a power spot is shown as it is now while it is
+   * the same place (`shownPlace`), else as it was named. Without it, as it was named.
+   */
+  wayspot?: (id: string) => WayspotRow | undefined;
+  /** The sentence of its last showing when staff closed it (`RaidPostView.closed`). */
+  closed?: string;
+}
+
+/**
+ * The boss of a max battle as its post shows it: the catalogue's entry of its reference (or the
+ * name a boss the game master does not know was reported by), shiny as the max boss list says of
+ * that boss in that tier, and its picture (design 3.3): the Gigantamax picture where the game's
+ * icons have one (`maxBossPicture`), else the species', else the list's.
+ */
+export function shownMaxBoss(
+  party: MaxParty,
+  catalogue: PokemonCatalogue,
+  bosses: readonly MaxBoss[],
+  icons?: PokemonIcons,
+): ShownBoss {
+  const ref = party.max.boss;
+  const { tier } = party.max;
+  const entry = 'key' in ref ? catalogue.byKey(ref.key) : undefined;
+  const listed = bosses.find(
+    (boss) =>
+      boss.tier === tier &&
+      (entry ? boss.entry?.key === entry.key : 'name' in ref && boss.name === ref.name),
+  );
+  const shown = entry ?? listed?.entry;
+  const image = maxBossPicture(shown, tier, { catalogue, icons }) ?? listed?.image;
+  return {
+    name: shown?.name ?? ('name' in ref ? ref.name : titleCase(ref.key)),
+    ...(shown ? { entry: shown } : {}),
+    shiny: listed?.shiny ?? false,
+    ...(image === undefined ? {} : { image }),
+  };
+}
+
+/** Shown as over: its end has passed, or staff closed it. */
+function shownOver(view: MaxPostView): boolean {
+  return view.closed !== undefined || maxEnded(view.party, view.now);
+}
+
+/** The power spot as it is now while it is the same place (`shownPlace`), else as named. */
+export function spotNow(
+  spot: PowerSpot,
+  wayspot: ((id: string) => WayspotRow | undefined) | undefined,
+): PowerSpot {
+  const kept = wayspot?.(spot.id);
+  if (!kept) return spot;
+  const now: KnownPlace = {
+    kind: kept.kind === 'powerspot' ? 'powerspot' : 'stop',
+    id: kept.id,
+    // A title gone blank is no name: the one it was named by stays.
+    title: kept.title.trim() === '' ? spot.title : kept.title,
+    lat: kept.lat,
+    lon: kept.lon,
+    address: wayspotAddressLine(kept.address),
+    image: kept.image,
+  };
+  const shown = shownPlace(spot, now);
+  return shown === now ? { ...now, kind: 'powerspot' } : spot;
+}
+
+/** `Dynamax Machamp (2★)`, `Gigantamax Machamp`: what the battle is (`maxBossTitle`). */
+function what(view: MaxPostView): string {
+  return maxBossTitle(view.boss.name, view.party.max.tier);
+}
+
+/** `Until 21:00 (in 3 hours).`, `Ended at …`, or why staff closed it. */
+function timesOf(view: MaxPostView): string {
+  if (view.closed !== undefined) return view.closed;
+  const end = view.party.endTime ?? view.party.lastPossibleTime ?? view.now;
+  return maxEnded(view.party, view.now)
+    ? `Ended at ${timestamp(end, 'f')}.`
+    : `Until ${timestamp(end)} (${timestamp(end, 'R')}).`;
+}
+
+/** The lines about the boss: its types and what it is weak to (no catch CP, no moves). */
+function bossLines(view: MaxPostView): string[] {
+  const { entry } = view.boss;
+  if (!entry) return [];
+  return [typesLine(entry, view.emoji), ...weaknessLines(view.catalogue, entry, view.emoji)];
+}
+
+/** `**Gazebo of the Park** (power spot)`: a spot's first words, made safe by `text`. */
+function spotWords(spot: PowerSpot, text: (raw: string) => string): string {
+  return `**${text(spot.title)}** (${PLACE_KIND_WORDS.powerspot})`;
+}
+
+/**
+ * Where the battle is (design 3.3), under `**Where**`: a power spot as a meetup's known place,
+ * `**<title>** (power spot) · <address> · [Map](<…>)` with its Wayfarer picture beside it
+ * (`placeSection`); a pin `📍 **Unlisted power spot** · [Map](<…>)` (Q7), without a picture.
+ */
+function maxWhere(view: MaxPostView, fit: Fit): PostBlock {
+  const { spot } = view.party.max;
+  if (spot.kind === 'pin') {
+    return {
+      type: 'text',
+      content: `${WHERE_HEADING}\n📍 **${UNLISTED_SPOT}** · ${mapMarkdown(spot)}`,
+    };
+  }
+  const shown = spotNow(spot, view.wayspot);
+  return placeSection(fit, {
+    heading: WHERE_HEADING,
+    line: (address) =>
+      [spotWords(shown, plain), ...(address === '' ? [] : [address]), mapMarkdown(shown)].join(
+        ' · ',
+      ),
+    address: plain(shown.address ?? ''),
+    picture: wayspotPicture(shown.image),
+    under: [],
+  });
+}
+
+/** The spot in one line for a direct message (no links, no Map), and its point for the Map. */
+function briefSpot(view: MaxPostView): { line: string; map: string } {
+  const { spot } = view.party.max;
+  if (spot.kind === 'pin') return { line: `📍 **${UNLISTED_SPOT}**`, map: gymMapsUrl(spot) };
+  const shown = spotNow(spot, view.wayspot);
+  const address = shown.address ? plainNoLinks(shown.address) : '';
+  return {
+    line: [spotWords(shown, plainNoLinks), ...(address === '' ? [] : [address])].join(' · '),
+    map: gymMapsUrl(shown),
+  };
+}
+
+/** `Dynamax Machamp (2★) · Gazebo of the Park`: the post's title; the spot gives way last. */
+export function maxTitle(view: Pick<MaxPostView, 'party' | 'boss' | 'wayspot'>): string {
+  const { spot } = view.party.max;
+  const name = spot.kind === 'pin' ? UNLISTED_SPOT : spotNow(spot, view.wayspot).title;
+  const where = truncate(tidyTitle(name), 60);
+  const battle = tidyTitle(maxBossTitle(view.boss.name, view.party.max.tier));
+  return tidyTitle(`${truncate(battle, LIMITS.title - where.length - 3)} · ${where}`);
+}
+
+/** Its forum tag (`Max battle`), and `Ended` once it is over. */
+export function maxTags(party: MaxParty, now: number): ForumTag[] {
+  return ['Max battle', ...(maxEnded(party, now) ? ['Ended' as const] : [])];
+}
+
+function colour(view: MaxPostView): number {
+  return shownOver(view) ? ENDED_COLOUR : MAX_COLOUR;
+}
+
+/**
+ * The post of a max battle laid out (design 3.3), as a raid's (plan 8D): what it is, its end, its
+ * boss's types and weaknesses, with the boss's picture beside them; Where (the spot); who comes,
+ * a group's heading counting its lobby; the controls (a battle's: Done completes; Remote kept; no
+ * Set time, no Screenshot feedback); who reported it.
+ */
+function maxLayout(view: MaxPostView): PostLayout {
+  const { party, boss } = view;
+  const shiny = boss.shiny ? ` ${view.emoji.shiny}` : '';
+  const header = [
+    `### ${plain(what(view))}${shiny}`,
+    timesOf(view),
+    // Not in the last showing of one that was closed: that post is archived.
+    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
+    ...bossLines(view),
+  ].join('\n');
+  return fittedLayout((fit) => ({
+    accent: colour(view),
+    ...(boss.image === undefined ? {} : { picture: boss.image }),
+    blocks: [
+      { type: 'section', content: header, accessory: 'picture' },
+      { type: 'separator' },
+      maxWhere(view, fit),
+      { type: 'separator' },
+      ...trainerBlocks(view, { complete: true, lobby: true, meetHint: false }, fit),
+      { type: 'separator' },
+      { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
+      ...(party.anonymous
+        ? []
+        : [
+            {
+              type: 'text' as const,
+              content: `-# Reported by ${memberByName(memberOf(party, party.createdById))}`,
+            },
+          ]),
+    ],
+  }));
+}
+
+/**
+ * The max battle in brief, for a direct message (design 3.3: as a raid's, the spot in the place
+ * of the gym): what it is, its end, where, how many come; the post's colour and picture, the
+ * spot's Map.
+ */
+function maxBrief(view: MaxPostView): PartyBrief {
+  const spot = briefSpot(view);
+  return {
+    accent: colour(view),
+    ...(view.boss.image === undefined ? {} : { picture: view.boss.image }),
+    lines: [`**${plain(what(view))}**`, timesOf(view), spot.line, trainerCount(view.party)],
+    whereLine: spot.line,
+    map: spot.map,
+  };
+}
+
+/**
+ * The forum post of a max battle: title, tags, the components-v2 message and the brief of a
+ * direct message. Pure: the same view gives the same post.
+ */
+export function renderMaxPost(view: MaxPostView): RenderedPost {
+  const tags = maxTags(view.party, view.now);
+  return renderedPost({
+    title: maxTitle(view),
+    tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
+    layout: maxLayout(view),
+    brief: maxBrief(view),
+  });
+}
+
+/** A max battle's spot by name, made safe for text that reaches DMs (`plainNoLinks`). */
+export function spotText(party: MaxParty): string {
+  return plainNoLinks(maxSpotName(party.max.spot));
+}
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index aa6f1ee7825cd31351b4b05c3ee4fd297f4aa28f..4b747ef820c031420855991c287f4c6e8022a88a 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -178,7 +178,9 @@ function reasonsText(reasons: readonly ReportReason[], room: number): string {
 /** The head of a party's report: what it is, its lines, who made it and in which region. */
 function partyHead(subject: PartySubject): string {
   const maker = memberText({ id: subject.makerId, name: subject.makerName ?? undefined });
-  const madeBy = subject.partyType === 'raid' ? 'Reported by' : 'Created by';
+  // A battle is reported (a raid, a max battle: plan 8X-3); a meetup or a train is made.
+  const madeBy =
+    subject.partyType === 'raid' || subject.partyType === 'max' ? 'Reported by' : 'Created by';
   const region = subject.regionChannelId === null ? '' : ` in <#${subject.regionChannelId}>`;
   return [
     `### Reported ${partyWord({ type: subject.partyType })}`,
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 904823762d2a2c038b78e771147db13badaf27c0..30c1ced1ede033ccc77237fec0e618faf54f1ac5 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -37,6 +37,7 @@ export const FORUM_TAGS = [
   'Shadow',
   'Train',
   'Meetup',
+  'Max battle',
 ] as const;
 export type ForumTag = (typeof FORUM_TAGS)[number];
 
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 672c139dc74812f1f4050365bc5bdbcf01ee27ac..823fbb867232cf0f39517d2f0432888049794179 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -9,6 +9,7 @@ import {
 } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import type { PokemonType } from '../domain/pogo/types.js';
 import { typeWord, WEATHER_ICON, weatherWord } from '../domain/pogo/game-icons.js';
 import {
   pokemonPicture,
@@ -253,6 +254,43 @@ function timesOf(view: RaidPostView, stage: RaidStage): string {
   return `Ended at ${timestamp(endTime, 'f')}.`;
 }
 
+/**
+ * Types as a line reads them: all by their icons, or all in words, as the weather (a sentence of
+ * both reads badly); `×2` after a double weakness.
+ */
+function typeList(
+  types: readonly { type: PokemonType; multiplier?: number }[],
+  emoji: Pick<PostEmoji, 'icon'>,
+): string {
+  const icons = types.map(({ type }) => emoji.icon?.(type));
+  const byIcon = icons.every((icon) => icon !== undefined);
+  return types
+    .map(
+      ({ type, multiplier }, index) =>
+        `${(byIcon ? icons[index] : undefined) ?? typeWord(type)}` +
+        `${(multiplier ?? 0) > 1.6 ? ' ×2' : ''}`,
+    )
+    .join(byIcon ? ' ' : ', ');
+}
+
+/** `**Weaknesses** …`: what a Pokémon is weak to, as a line of a post; none without weaknesses. */
+export function weaknessLines(
+  catalogue: PokemonCatalogue,
+  entry: PokemonEntry,
+  emoji: Pick<PostEmoji, 'icon'>,
+): string[] {
+  const types = catalogue.weaknesses(entry);
+  return types.length === 0 ? [] : [`**Weaknesses** ${typeList(types, emoji)}`];
+}
+
+/** `**Types** …`: a Pokémon's own types (a max battle's post, plan 8X-3). */
+export function typesLine(entry: PokemonEntry, emoji: Pick<PostEmoji, 'icon'>): string {
+  return `**Types** ${typeList(
+    entry.types.map((type) => ({ type })),
+    emoji,
+  )}`;
+}
+
 /**
  * What the game master says about a Pokémon as a raid boss, line by line: what it is weak to
  * (`×2` after a double weakness), and the CP it is caught with, plain and boosted, and in what
@@ -266,19 +304,7 @@ export function bossFacts(
   shadow: boolean,
   emoji: Pick<PostEmoji, 'icon'>,
 ): string[] {
-  const lines: string[] = [];
-  // All by their icons, or all in words, as the weather: a sentence of both reads badly.
-  const types = catalogue.weaknesses(entry);
-  const icons = types.map((weakness) => emoji.icon?.(weakness.type));
-  const byIcon = icons.every((icon) => icon !== undefined);
-  const weaknesses = types.map(
-    (weakness, index) =>
-      `${(byIcon ? icons[index] : undefined) ?? typeWord(weakness.type)}` +
-      `${weakness.multiplier > 1.6 ? ' ×2' : ''}`,
-  );
-  if (weaknesses.length > 0) {
-    lines.push(`**Weaknesses** ${weaknesses.join(byIcon ? ' ' : ', ')}`);
-  }
+  const lines = weaknessLines(catalogue, entry, emoji);
   const cp = catalogue.raidCatchCp(entry, shadow);
   const boosted = catalogue.boostedIn(entry);
   const weatherIcons = boosted.map((weather) => emoji.icon?.(WEATHER_ICON[weather]));
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index e290498c96718268e6c56a6132caeefdce8b67cf..ecbbfe84b137abf97b275406ba16653944a21fa9 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -5,6 +5,7 @@ import {
   at,
   MINUTE,
   PARTY_NOW,
+  testMax,
   testMeetup,
   testRaid,
   testRaidRules,
@@ -19,12 +20,14 @@ import { endParty } from '../domain/party/party.js';
 import { TEXT_BUDGET } from './party-post.js';
 import { LIST_COLOUR } from './v2.js';
 import { RAID_LEVELS, SHADOW_RAID_LEVELS } from '../domain/pogo/raid-tier.js';
+import type { MaxTier } from '../domain/pogo/max-tier.js';
 import {
   NOTHING_GOING,
   renderRegionLink,
   renderSummary,
   SUMMARY_TIERS,
   tierHeading,
+  type ListedMax,
   type ListedMeetup,
   type ListedRaid,
   type ListedTrain,
@@ -451,3 +454,55 @@ describe('renderSummary with trains', () => {
     expect(raidLines?.length).toBeGreaterThan(20);
   });
 });
+
+describe('renderSummary: max battles (plan 8X-3)', () => {
+  const max = (n: number, tier: MaxTier, end: string, post = true): ListedMax => ({
+    party: {
+      ...testMax({ id: ID(700 + n), tier, endTime: at(end), now: PARTY_NOW + n }),
+      forumPostId: post ? `30000000000000070${String(n)}` : null,
+    },
+    title: `Battle ${String(n)}`,
+  });
+
+  it('lists them after the raids under a heading of their own, by tier, the soonest end first', () => {
+    const raid = listed(testRaid(), 'T5 egg', '300000000000000001');
+    const message = renderSummary(
+      [raid],
+      PARTY_NOW,
+      [],
+      [],
+      [
+        max(1, 'D2', '2026-10-13T21:00'),
+        max(2, 'G', '2026-10-13T15:00'),
+        max(3, 'D5', '2026-10-13T14:30'),
+        max(4, 'D2', '2026-10-13T16:00', false),
+      ],
+    );
+    const texts = textDisplays(message);
+    expect(texts[0]).toBe('### Active raids\n1 raid · 4 max battles');
+    expect(linesUnder(message, '**Max battles**')).toEqual([
+      `<#300000000000000703> · Dynamax 5★ · ends <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
+      `**Battle 4** · Dynamax 2★ · ends <t:${at('2026-10-13T16:00') / 1000}:R> · 1 trainer`,
+      `<#300000000000000701> · Dynamax 2★ · ends <t:${at('2026-10-13T21:00') / 1000}:R> · 1 trainer`,
+      `<#300000000000000702> · Gigantamax · ends <t:${at('2026-10-13T15:00') / 1000}:R> · 1 trainer`,
+    ]);
+    const order = texts.map((text) => text.split('\n')[0]);
+    expect(order.indexOf('**Level 5**')).toBeLessThan(order.indexOf('**Max battles**'));
+  });
+
+  it('leaves out one whose end has passed, and counts what does not fit', () => {
+    const over = renderSummary(
+      [],
+      at('2026-10-13T21:00'),
+      [],
+      [],
+      [max(1, 'D2', '2026-10-13T21:00')],
+    );
+    expect(textDisplays(over)[0]).toBe(`### Active raids\n${NOTHING_GOING}`);
+    const many = Array.from({ length: 150 }, (_unused, n) => max(n, 'D1', '2026-10-13T20:00'));
+    const message = renderSummary([], PARTY_NOW, [], [], many);
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    expect(linesUnder(message, '**Max battles**')?.at(-1)).toMatch(/^…and \d+ more$/);
+    expectV2Sendable(message);
+  });
+});
diff --git a/src/render/summary.ts b/src/render/summary.ts
index 0c6f56b88f359a1d0a2733522ca7e3ddd05bd932..72f985ddea13b0bf20d8abf894006c8a0028c84d 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -1,5 +1,8 @@
+import { maxEnded } from '../domain/party/max.js';
+import { maxTierLabel } from '../domain/pogo/max-tier.js';
 import {
   partyWord,
+  type MaxParty,
   type MeetupParty,
   type PartyType,
   type RaidParty,
@@ -54,6 +57,26 @@ export function raidLine({ party, title }: ListedRaid, now: number): string {
   return `${post} · ${when} · ${trainerCount(party)}`;
 }
 
+/** A max battle for a list: the party and the title its post has (plan 8X-3). */
+export interface ListedMax {
+  party: MaxParty;
+  title: string;
+}
+
+/** The heading of the max battles in a region's list, after its raids (design 3.3). */
+export const MAX_BATTLES_HEADING = '**Max battles**';
+
+/** The order of the max battles in a list: 5 stars down to 1, Gigantamax last (as `/max`). */
+const MAX_LIST_ORDER = ['D5', 'D4', 'D3', 'D2', 'D1', 'G'] as const;
+
+/** A max battle in a list: its post, its tier, when it ends, how many come. */
+function maxLine({ party, title }: ListedMax): string {
+  const post = party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
+  const end = party.endTime ?? party.lastPossibleTime;
+  const when = end === null ? 'no time set' : `ends ${timestamp(end, 'R')}`;
+  return `${post} · ${maxTierLabel(party.max.tier)} · ${when} · ${trainerCount(party)}`;
+}
+
 /** A meetup for a list: the party and the title its post has. */
 export interface ListedMeetup {
   party: MeetupParty;
@@ -180,12 +203,14 @@ const sureRoom = (heading: string): number => heading.length + 1 + 20;
  * container, `### Active raids` with a count of what is going on (`5 raids · 2 trains · 1
  * meetup`, only the kinds there are; `NOTHING_GOING` when there is nothing), then the raids that
  * have not ended by the clock under a bold heading per tier (`SUMMARY_TIERS`, the soonest end
- * first in each; a raid that has ended but whose post is still open is left out), then the
- * trains and the meetups, each under its heading: those that are not over, by their start, then
- * those without one in the order they were made. One text display per tier and section, so the
- * component count stays small whatever is listed.
+ * first in each; a raid that has ended but whose post is still open is left out), then the max
+ * battles whose end has not come (plan 8X-3, `MAX_BATTLES_HEADING`: 5 stars down to 1,
+ * Gigantamax last, the soonest end first in each), then the trains and the meetups, each under
+ * its heading: those that are not over, by their start, then those without one in the order they
+ * were made. One text display per tier and section, so the component count stays small whatever
+ * is listed.
  *
- * All of it keeps within `TEXT_BUDGET`: the trains and the meetups are each sure of some room
+ * All of it keeps within `TEXT_BUDGET`: the max battles, the trains and the meetups are each sure of some room
  * (`SECTION_ROOM`), every tier below another of its heading and a line, and each has all that is
  * left over what the ones after it are sure of; what does not fit is counted (`…and N more`).
  */
@@ -194,14 +219,24 @@ export function renderSummary(
   now: number,
   meetups: readonly ListedMeetup[] = [],
   trains: readonly ListedTrain[] = [],
+  maxBattles: readonly ListedMax[] = [],
 ): V2Message {
   const going = raids
     .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
     .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
+  const maxOn = maxBattles
+    .filter(({ party }) => party.status === 'active' && !maxEnded(party, now))
+    .sort(
+      (a, b) =>
+        MAX_LIST_ORDER.indexOf(a.party.max.tier) - MAX_LIST_ORDER.indexOf(b.party.max.tier) ||
+        (a.party.endTime ?? 0) - (b.party.endTime ?? 0) ||
+        a.party.createdAt - b.party.createdAt,
+    );
   const plannedTrains = planned(trains, now);
   const plannedMeetups = planned(meetups, now);
   const counts = [
     ...(going.length > 0 ? [count(going.length, 'raid')] : []),
+    ...(maxOn.length > 0 ? [count(maxOn.length, 'max battle')] : []),
     ...(plannedTrains.length > 0 ? [count(plannedTrains.length, 'train')] : []),
     ...(plannedMeetups.length > 0 ? [count(plannedMeetups.length, 'meetup')] : []),
   ];
@@ -221,6 +256,7 @@ export function renderSummary(
     sure: (heading: string) => sureRoom(heading),
   }));
   const timed = [
+    { heading: MAX_BATTLES_HEADING, lines: maxOn.map((battle) => maxLine(battle)) },
     { heading: TRAINS_HEADING, lines: plannedTrains.map((train) => trainLine(train, now)) },
     { heading: MEETUPS_HEADING, lines: plannedMeetups.map((meetup) => meetupLine(meetup, now)) },
   ].map((section) => ({
diff --git a/src/services/moderation-reports.test.ts b/src/services/moderation-reports.test.ts
index 1427fedaf9fa6e64bf9ed4709185b2d6dea594fc..26afc51fba808bd49bb1e560a1bdb56f06789172 100644
--- a/src/services/moderation-reports.test.ts
+++ b/src/services/moderation-reports.test.ts
@@ -2,7 +2,16 @@ import { describe, expect, it } from 'vitest';
 import { WEST_CHANNEL } from '../../test/support/gyms.js';
 import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
 import { buttonsOf, textOf } from '../../test/support/messages.js';
-import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
+import {
+  ALICE,
+  at,
+  BOB,
+  CAROL,
+  PARTY_NOW,
+  REPORTER,
+  TEST_PIN,
+  TEST_SPOT,
+} from '../../test/support/parties.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import {
   REPORT_SERVER as SERVER,
@@ -10,6 +19,7 @@ import {
   reportsWith,
 } from '../../test/support/reports-service.js';
 import { MAX_REPORT_REASON } from '../domain/moderation/reports.js';
+import type { MaxSpot } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 
 describe('ModerationReports: a party reported', () => {
@@ -135,6 +145,47 @@ describe('ModerationReports: a party reported', () => {
     ]);
   });
 
+  // Plan 8X-3 (review A, X3-B-1): a max battle is a party a member can report.
+  it('takes a max battle at its power spot or its pin, reported by its reporter', async () => {
+    const made = await reportsWith();
+    const report = (spot: MaxSpot) =>
+      made.service.reportMax({
+        spot,
+        reporterId: REPORTER,
+        reporter: { name: 'Rita' },
+        anonymous: false,
+        autoStatus: PartyStatus.Interested,
+        tier: 'D2',
+        boss: { key: 'machamp' },
+        endTime: at('2026-10-13T21:00'),
+        regionChannelId: WEST_CHANNEL,
+      });
+    for (const [n, spot] of [TEST_SPOT, TEST_PIN].entries()) {
+      const battle = await report(spot);
+      if (battle.kind !== 'created') throw new Error(battle.kind);
+      const outcome = await made.reports.reportParty({
+        serverId: SERVER,
+        partyId: battle.party.id,
+        reporter: { id: BOB, name: 'Bob' },
+        reason: 'Nobody is there.',
+        roleIds: [],
+      });
+      expect(outcome.kind).toBe('sent');
+      const post = made.gateway.messagesIn(MOD_CHANNEL)[n]?.message;
+      expect(textOf(post)).toContain('### Reported max battle');
+      expect(textOf(post)).toContain(`Reported by **Rita** (<@${REPORTER}>)`);
+      expect(buttonsOf(post).map((button) => button.label)).toEqual([
+        'Close…',
+        'Dismiss',
+        'Go to post',
+      ]);
+      expect([...made.reportStore.reports.values()][n]?.subject).toMatchObject({
+        partyType: 'max',
+        place: spot.kind === 'pin' ? { kind: 'pin' } : { kind: 'powerspot', id: spot.id },
+      });
+    }
+  });
+
   it('opens anew a report whose post was never made', async () => {
     const made = await reportedMeetup();
     made.gateway.failing.set('sendMessage', new Error('Discord is away'));
diff --git a/src/services/moderation-reports.ts b/src/services/moderation-reports.ts
index abe1024d9206c252e3ee362eab4c698946c2f7d2..50e64ed049c085465374fe7112c5181348a3998a 100644
--- a/src/services/moderation-reports.ts
+++ b/src/services/moderation-reports.ts
@@ -20,7 +20,7 @@ import {
   type ReportStore,
 } from '../domain/moderation/reports.js';
 import type { Decider } from '../domain/meetups/records.js';
-import { isMeetup, isTrain, partyWord, type Party } from '../domain/party/party.js';
+import { isMax, isMeetup, isTrain, partyWord, type Party } from '../domain/party/party.js';
 import { currentStop } from '../domain/party/train.js';
 import { BoundedMap } from '../bounded-map.js';
 import type { Logger } from '../log.js';
@@ -737,9 +737,13 @@ export class ModerationReports {
     };
   }
 
-  /** Where a party is: a raid's gym, a train's current stop, a meetup's place as it is now. */
+  /**
+   * Where a party is: a raid's gym, a train's current stop, a meetup's place as it is now, a max
+   * battle's spot (a power spot as it was named, a pin as a pin: plan 8X-3).
+   */
   private placeOfParty(party: Party): Place | null {
     if (isMeetup(party)) return this.options.parties.placeOf(party);
+    if (isMax(party)) return party.max.spot;
     const gymId = isTrain(party) ? currentStop(party) : party.gymId;
     const gym = gymId === undefined || gymId === null ? undefined : this.options.gyms?.get(gymId);
     return gym === undefined ? null : gymPlace(gym);
diff --git a/src/services/party-service.max.test.ts b/src/services/party-service.max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0cecd9a75bdacb94b1a813b67454ed1970d0de65
--- /dev/null
+++ b/src/services/party-service.max.test.ts
@@ -0,0 +1,180 @@
+import { describe, expect, it } from 'vitest';
+import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { textDisplays, textOf } from '../../test/support/messages.js';
+import {
+  ALICE,
+  asMax,
+  at,
+  PARTY_NOW,
+  REPORTER,
+  TEST_PIN,
+  TEST_SPOT,
+  testMax,
+} from '../../test/support/parties.js';
+import { partyServiceWith, reportedMax } from '../../test/support/party-service.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { MaxReport } from './party-service.js';
+
+const END = at('2026-10-13T21:00');
+const SNEASEL = { key: 'sneasel' };
+
+function report(extra: Partial<MaxReport> = {}): MaxReport {
+  return {
+    spot: TEST_SPOT,
+    reporterId: REPORTER,
+    anonymous: false,
+    autoStatus: PartyStatus.Interested,
+    tier: 'D2',
+    boss: { key: 'machamp' },
+    endTime: END,
+    regionChannelId: WEST_CHANNEL,
+    ...extra,
+  };
+}
+
+describe('PartyService.reportMax (plan 8X-3)', () => {
+  it('makes a max battle with its post in the forum of the spot, tagged, with a link line', async () => {
+    const made = await reportedMax();
+    const post = made.gateway.posts.get(made.postId);
+    expect(post?.forumId).toBe(WEST_FORUM);
+    expect(post?.title).toBe('Dynamax Machamp (2★) · Gazebo of the Park');
+    expect(post?.tagIds).toEqual([made.tags[WEST_FORUM]['Max battle']]);
+    expect(textDisplays(post?.message)[0]).toMatch(/^### Dynamax Machamp \(2★\)/);
+    expect(made.gateway.messagesIn(WEST_CHANNEL).map((m) => m.message.content)).toEqual([
+      `New max battle: <#${made.postId}>`,
+    ]);
+    expect(made.current()).toMatchObject({ endTime: END, regionId: 1 });
+  });
+
+  it('signs a second reporter of the same boss up for the battle there', async () => {
+    const made = await reportedMax();
+    const again = await made.service.reportMax(
+      report({ reporterId: ALICE, autoStatus: PartyStatus.Coming }),
+    );
+    expect(again).toMatchObject({ kind: 'exists', joined: true, party: { id: made.party.id } });
+    expect(made.current().attendees[ALICE]?.status).toBe(PartyStatus.Coming);
+  });
+
+  it('refuses a report of another boss at the spot, naming the battle there', async () => {
+    const made = await reportedMax();
+    const other = await made.service.reportMax(report({ boss: { key: 'sneasel' }, tier: 'D1' }));
+    expect(other).toMatchObject({ kind: 'taken', party: { id: made.party.id } });
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  // Review B, B2: the boss there is decided inside the store, as the battle is when it is joined.
+  it('refuses to join a battle whose boss changed while the report waited', async () => {
+    const made = await reportedMax();
+    // The battle stands in another forum, so the report asks whether Alice may be put there.
+    await made.store.update(made.party.id, (party) => ({
+      party: { ...party, forumChannelId: EAST_FORUM },
+    }));
+    const outcome = await made.service.reportMax(
+      report({
+        reporterId: ALICE,
+        // Meanwhile a member changes the boss of the rotation (`/boss`).
+        mayJoin: async () => {
+          await made.store.update(made.party.id, (party) => {
+            const battle = asMax(party);
+            return { party: { ...battle, max: { ...battle.max, boss: SNEASEL, tier: 'D1' } } };
+          });
+          return true;
+        },
+      }),
+    );
+    expect(outcome).toMatchObject({
+      kind: 'taken',
+      party: { id: made.party.id, max: { boss: SNEASEL } },
+    });
+    expect(made.current().attendees[ALICE]).toBeUndefined();
+  });
+
+  // Fix review F2: the battle there ended while the report waited.
+  it('makes a new battle when the one it would join ended meanwhile, once', async () => {
+    const made = await reportedMax();
+    const moved = (id: string, extra: object) =>
+      made.store.update(id, (party) => ({ party: { ...party, ...extra } }));
+    await moved(made.party.id, { forumChannelId: EAST_FORUM });
+    const past = made.clock.now - 60_000;
+    const again = await made.service.reportMax(
+      report({
+        reporterId: ALICE,
+        mayJoin: async () => {
+          await moved(made.party.id, { endTime: past });
+          return true;
+        },
+      }),
+    );
+    expect(again).toMatchObject({ kind: 'created' });
+    const fresh = again.kind === 'created' ? again.party : undefined;
+    expect(fresh?.id).not.toBe(made.party.id);
+    expect(fresh?.attendees[ALICE]).toBeDefined();
+    expect(asMax(made.store.get(made.party.id)).attendees[ALICE]).toBeUndefined();
+  });
+
+  it('says the battle there has just ended when the one after it ends too', async () => {
+    const made = await reportedMax();
+    const moved = (id: string, extra: object) =>
+      made.store.update(id, (party) => ({ party: { ...party, ...extra } }));
+    await moved(made.party.id, { forumChannelId: EAST_FORUM });
+    const past = made.clock.now - 60_000;
+    const second = testMax({ id: '00000000-0000-4000-8000-0000000003a2', now: made.clock.now });
+    let asked = 0;
+    const outcome = await made.service.reportMax(
+      report({
+        reporterId: ALICE,
+        mayJoin: async () => {
+          asked += 1;
+          if (asked === 1) {
+            // The battle there ends, and another is reported at the spot at once.
+            await moved(made.party.id, { endTime: past });
+            await made.store.addMaxUnlessTaken(second, made.clock.now);
+            await moved(second.id, { forumChannelId: EAST_FORUM });
+          } else {
+            await moved(second.id, { endTime: past });
+          }
+          return true;
+        },
+      }),
+    );
+    expect(outcome).toEqual({ kind: 'ended' });
+    expect(asked).toBe(2);
+    expect(asMax(made.store.get(second.id)).attendees[ALICE]).toBeUndefined();
+  });
+
+  it('makes one at a pin, an unlisted power spot', async () => {
+    const made = await partyServiceWith();
+    const pinned = await made.service.reportMax(report({ spot: TEST_PIN }));
+    expect(pinned.kind).toBe('created');
+    await made.service.flush();
+    const id = pinned.kind === 'created' ? pinned.party.forumPostId : null;
+    expect(textOf(made.gateway.posts.get(id ?? '')?.message)).toContain(
+      '📍 **Unlisted power spot**',
+    );
+  });
+
+  it('refuses a spot outside the regions of the server, and a region without a forum', async () => {
+    const made = await partyServiceWith();
+    const far = await made.service.reportMax(report({ spot: { ...TEST_PIN, lat: 10, lon: 10 } }));
+    expect(far).toEqual({ kind: 'no-region' });
+    made.regions.rows = made.regions.rows.map((region) => ({ ...region, forumChannelId: null }));
+    expect((await made.service.reportMax(report())).kind).toBe('no-forum');
+  });
+
+  it('lists it in the summary of its region, after the raids', async () => {
+    const made = await reportedMax();
+    const texts = textDisplays(made.service.summaryMessage(1));
+    expect(texts[0]).toBe('### Active raids\n1 max battle');
+    expect(texts).toContainEqual(
+      `**Max battles**\n<#${made.postId}> · Dynamax 2★ · ends <t:${END / 1000}:R> · 1 trainer`,
+    );
+  });
+
+  it('puts a battle in the forum of the region the report was made in, of those the spot is in', async () => {
+    const made = await partyServiceWith();
+    // The spot lies in West only: a report from East's channel still goes to West's forum.
+    const fromEast = await made.service.reportMax(report({ regionChannelId: EAST_CHANNEL }));
+    expect(fromEast).toMatchObject({ kind: 'created', party: { regionId: 1 } });
+    expect(PARTY_NOW).toBeLessThan(END);
+  });
+});
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index c38fa7efd9e04bd1bf4ece241257bc1cc5b0bc1d..d7cb6df1bad8941ff61c562d679bb050311abb3e 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -23,13 +23,18 @@ import type { PartyEnd } from '../domain/history/party-history.js';
 import type { PostRemoval } from '../domain/moderation/reports.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import { lobbySize, splitLobby } from '../domain/party/lobby.js';
+import { blocksNewMax, createMax } from '../domain/party/max.js';
 import { createMeetup, tidyDescription } from '../domain/party/meetup.js';
 import type { PostsRefused } from '../domain/party/post-permissions.js';
 import {
   asKindOf,
+  isMax,
   isMeetup,
   isRaid,
   isTrain,
+  sameBoss,
+  type MaxParty,
+  type MaxSpot,
   membersWhere,
   partyWord,
   type Change,
@@ -72,6 +77,7 @@ import {
   type LeftOut,
   type MessageForms,
 } from './refused-files.js';
+import type { MaxTier } from '../domain/pogo/max-tier.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
@@ -99,6 +105,7 @@ import {
   type RaidPostView,
 } from '../render/raid-post.js';
 import { summaryRefusedWords } from '../render/activity.js';
+import { maxTitle, renderMaxPost, shownMaxBoss, type MaxPostView } from '../render/max-post.js';
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
 import { memberText, plain, withMentions, type NamedMember } from '../render/text.js';
 import type { TimedPostView } from '../render/timed-post.js';
@@ -112,10 +119,11 @@ import { PartyMirrors } from './party-mirrors.js';
 import { settingsOf } from './party-change.js';
 import { RegionClosedError, type PairChange, type PartyStore } from './party-store.js';
 import type { Rehearsal } from './rehearsal.js';
+import type { MaxBossProvider } from './max-boss-service.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
 import type { WayspotProvider } from './wayspot-directory.js';
-import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
+import { gymRegionsInGuild, regionsAtPoint, type RegionProvider } from './region-directory.js';
 
 const MINUTE = 60_000;
 /** Logged when a party that cannot be shown cannot be ended either. */
@@ -199,6 +207,60 @@ export interface RaidReport {
   mayJoin?: (forumId: string) => Promise<boolean>;
 }
 
+/**
+ * A max battle a member reports (`/max`, plan 8X-3): at a power spot or a pin, with its boss and
+ * tier, and its end (the default end of `defaultMaxEnd`, or the one the report gave), checked by
+ * the caller.
+ */
+export interface MaxReport {
+  spot: MaxSpot;
+  /** Snowflake of the reporter. */
+  reporterId: string;
+  /** The reporter's name and team, as the interaction said them. */
+  reporter?: MemberInfo;
+  anonymous: boolean;
+  /** The reporter's automatic status (`User.status`). */
+  autoStatus: PartyStatus;
+  tier: MaxTier;
+  boss: RaidBossRef;
+  endTime: number;
+  /** The region channel the report was made in: the battle goes to a region of that server. */
+  regionChannelId: string;
+  /**
+   * Asked, once the report would join the battle already at the spot, whether the reporter may
+   * be put in its forum, as `RaidReport.mayJoin`. Left out: every forum is fine.
+   */
+  mayJoin?: (forumId: string) => Promise<boolean>;
+}
+
+/** What `reportMax` decided inside the store about the battle a report joins (review B, B2). */
+type JoinStep =
+  /** It ended, or no longer holds the spot. */
+  | { outcome: 'over'; party?: never }
+  /** Its boss is another by now. */
+  | { outcome: 'other'; other: MaxParty; party?: never }
+  | { outcome: 'joined'; party: Party; joined: boolean };
+
+export type MaxReportOutcome =
+  /** A new max battle with its post. */
+  | { kind: 'created'; party: MaxParty }
+  /** The spot has a battle of this boss: `joined` says whether the reporter was signed up. */
+  | { kind: 'exists'; party: MaxParty; joined: boolean }
+  /** The spot has a battle of another boss (design Q3): nothing was done; `/boss` there. */
+  | { kind: 'taken'; party: MaxParty }
+  /** The spot lies in no region of this server. */
+  | { kind: 'no-region' }
+  /** The spot's region has no forum yet. */
+  | { kind: 'no-forum'; region: Region }
+  | NoPost
+  /** The battle there stands in a forum the reporter may not be put in (`mayJoin`). */
+  | { kind: 'barred' }
+  /**
+   * The battle the report would join ended while it waited, twice over (the one repeat used):
+   * nothing was done (fix review F2).
+   */
+  | { kind: 'ended' };
+
 /**
  * A party's post was not made, so nothing was kept: it went while it was being made, or the bot
  * may not make posts in the forum (`refused`: what it lacks there; plan 8S-3).
@@ -426,6 +488,11 @@ export interface PartyServiceOptions {
   guilds: { idFor(snowflake: string): Promise<number | undefined> };
   gyms: { get(id: number): Gym | undefined; regionsOf(gymId: number): string[] };
   raidBosses: RaidBossProvider;
+  /**
+   * The max bosses (plan 8X-3): whether a max battle's boss is shiny, its picture. Max battles
+   * are always on, so the bot always has them (a test without any passes `NO_MAX_BOSSES`).
+   */
+  maxBosses: Pick<MaxBossProvider, 'bosses'>;
   gameData: GameDataProvider;
   raidEvents: RaidEventProvider;
   /** The members' settings: who lets the bot ping them. Without it nobody is pinged. */
@@ -718,7 +785,12 @@ export class PartyService {
     // parties: a post shown after that shows the place as it is then anyway.
     if (this.closed || !this.options.store.isLoaded) return;
     for (const party of this.options.store.active()) {
-      const kind = isMeetup(party) ? party.meetup.place?.kind : undefined;
+      // A max battle at a power spot shows it as it is now too (plan 8X-3).
+      const kind = isMeetup(party)
+        ? party.meetup.place?.kind
+        : isMax(party)
+          ? party.max.spot.kind
+          : undefined;
       if (kind === 'stop' || kind === 'powerspot') this.changed(party.id);
     }
   }
@@ -757,9 +829,156 @@ export class PartyService {
       case 'train':
         return renderTrainPost({ ...this.trainView(party), ...last });
       case 'max':
-        // Its renderer is plan 8X-3's post task; nothing makes a max battle before /max.
-        throw new Error(`No post for max battle ${party.id} yet`);
+        return renderMaxPost({ ...this.maxView(party), ...last });
+    }
+  }
+
+  /** Everything the renderer needs to show a max battle as it is now (plan 8X-3). */
+  maxView(party: MaxParty): MaxPostView {
+    const { maxBosses, gameData, settings, wayspots } = this.options;
+    const { catalogue } = gameData;
+    return {
+      party,
+      now: this.now(),
+      zone: settings.timezone,
+      boss: shownMaxBoss(party, catalogue, maxBosses.bosses(), gameData.icons),
+      catalogue,
+      emoji: this.emoji(party),
+      ...(wayspots === undefined ? {} : { wayspot: (id: string) => wayspots.byId(id) }),
+      ...this.lobbiesOf(party),
+    };
+  }
+
+  /**
+   * The region whose forum takes a max battle at this spot (plan 8X-3), among the regions of the
+   * report's server whose outlines hold it (`regionsAtPoint`): the region the report was made in
+   * when it is one of them, else the first with a forum; `any` is the first of them, for "no
+   * forum yet". Neither for a spot outside the server's regions, or a channel of no region.
+   */
+  regionForSpot(spot: MaxSpot, regionChannelId: string): { region?: Region; any?: Region } {
+    const { regions } = this.options;
+    const invoking = regions.byChannel(regionChannelId);
+    if (invoking?.guildId === undefined || invoking.guildId === null) return {};
+    const lying = regionsAtPoint(regions.all(), invoking.guildId, spot);
+    const candidates = [
+      ...lying.filter((region) => region.id === invoking.id),
+      ...lying.filter((region) => region.id !== invoking.id),
+    ];
+    const region = candidates.find((candidate) => candidate.forumChannelId !== null);
+    return { ...(region ? { region } : {}), ...(candidates[0] ? { any: candidates[0] } : {}) };
+  }
+
+  /**
+   * Stores a reported max battle and creates its post (plan 8X-3; design 3.1, 3.2). The spot has
+   * one battle at a time (`PartyStore.addMaxUnlessTaken`): a report of the same boss and tier
+   * signs the reporter up for the battle there with their automatic status, unless they are
+   * already (`exists`); another boss is refused, the battle there named (`taken`, Q3). No active
+   * max battle is left without a post, and no post without its battle.
+   */
+  async reportMax(report: MaxReport): Promise<MaxReportOutcome> {
+    return this.reportMaxOnce(report, true);
+  }
+
+  private async reportMaxOnce(report: MaxReport, mayRepeat: boolean): Promise<MaxReportOutcome> {
+    const { store, log } = this.options;
+    const { region, any } = this.regionForSpot(report.spot, report.regionChannelId);
+    if (!region?.forumChannelId) {
+      return any ? { kind: 'no-forum', region: any } : { kind: 'no-region' };
     }
+    if (region.guildId === null) {
+      log.warn({ region: region.id }, 'a max battle was reported in a region of no server');
+      return { kind: 'no-region' };
+    }
+    const forumId = region.forumChannelId;
+    const now = this.now();
+    let battle = createMax({
+      id: crypto.randomUUID(),
+      guildId: region.guildId,
+      regionId: region.id,
+      createdById: report.reporterId,
+      anonymous: report.anonymous,
+      autoStatus: report.autoStatus,
+      tier: report.tier,
+      boss: report.boss,
+      spot: report.spot,
+      endTime: report.endTime,
+      now,
+    });
+    battle = noteMember(battle, report.reporterId, report.reporter ?? {});
+    // The view does not depend on the stored row, so a renderer that fails stores nothing.
+    const rendered = this.rendered({ ...battle, forumChannelId: forumId });
+
+    let stored: Awaited<ReturnType<PartyStore['addMaxUnlessTaken']>>;
+    try {
+      stored = await store.addMaxUnlessTaken(battle, now);
+    } catch (err) {
+      if (err instanceof RegionClosedError) return { kind: 'no-region' };
+      throw err;
+    }
+    if (!stored.added) {
+      const existingId = stored.existing.id;
+      const inFlight = this.creating.get(existingId);
+      if (inFlight) {
+        await inFlight;
+        // Its post was not made and the battle is gone: report again from the start, once.
+        if (!store.get(existingId) && mayRepeat) return this.reportMaxOnce(report, false);
+      }
+      const existing = store.get(existingId);
+      const there = existing && isMax(existing) ? existing : stored.existing;
+      const ofReport = (party: MaxParty): boolean =>
+        sameBoss(party.max.boss, report.boss) && party.max.tier === report.tier;
+      // Answered at once for a battle of another boss; the store decides again below.
+      if (!ofReport(there)) return { kind: 'taken', party: there };
+      const checked = there.forumChannelId;
+      if (
+        report.mayJoin &&
+        checked !== null &&
+        checked !== forumId &&
+        !(await report.mayJoin(checked))
+      ) {
+        return { kind: 'barred' };
+      }
+      // Decided inside the store (review B, B2): the boss the battle has by then (`/boss` may
+      // have changed it meanwhile), and whether it still holds the spot.
+      const signedUp = await store.update(existingId, (party): JoinStep => {
+        if (!isMax(party) || !blocksNewMax(party, this.now())) return { outcome: 'over' };
+        if (!ofReport(party)) return { outcome: 'other', other: party };
+        const applied = applyAutoStatus(
+          party,
+          report.reporterId,
+          report.autoStatus,
+          this.lobbySize(party),
+          this.now(),
+        );
+        return {
+          outcome: 'joined',
+          ...applied,
+          ...(applied.joined
+            ? { party: noteMember(applied.party, report.reporterId, report.reporter ?? {}) }
+            : {}),
+        };
+      });
+      if (signedUp === undefined || signedUp.outcome === 'over') {
+        // It ended meanwhile, and the spot is free: report again from the start, once.
+        if (mayRepeat) return this.reportMaxOnce(report, false);
+        // The one after it ended as well: said so, never `exists` about an ended battle.
+        return { kind: 'ended' };
+      }
+      if (signedUp.outcome === 'other') return { kind: 'taken', party: signedUp.other };
+      if (signedUp.written) this.changed(existingId);
+      const after = signedUp.party;
+      return {
+        kind: 'exists',
+        party: isMax(after) ? after : there,
+        joined: signedUp.joined,
+      };
+    }
+    // The row exists; from here on a failure must not leave an active battle without a post.
+    const created = await this.unlessRegionClosed(region, () =>
+      this.createTracked(battle, region, rendered),
+    );
+    if (created === undefined) return { kind: 'no-region' };
+    return created;
   }
 
   /**
@@ -2509,7 +2728,10 @@ export class PartyService {
       const gym = stop === undefined ? undefined : gyms.get(stop);
       return { party, title: trainTitle(party), at: gym && (gym.nickname || gym.name) };
     });
-    return renderSummary(raids, now, meetups, trains);
+    const maxBattles = parties
+      .filter(isMax)
+      .map((party) => ({ party, title: maxTitle(this.maxView(party)) }));
+    return renderSummary(raids, now, meetups, trains, maxBattles);
   }
 
   private async renderSummary(regionId: number): Promise<void> {
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index 7a4e225d63220b226786fb7be77cbe95d9011e2d..b02abee146a7c7c13fd8e3618395cb6aa4cb9d60 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -19,6 +19,7 @@ import { PartyScheduler } from '../../src/services/party-scheduler.js';
 import { AttendanceService } from '../../src/services/attendance-service.js';
 import {
   isRaid,
+  type MaxParty,
   type MeetupParty,
   type Party,
   type RaidParty,
@@ -28,6 +29,7 @@ import { FORUM_TAGS } from '../../src/render/party-post.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import {
   PartyService,
+  type MaxReport,
   type MeetupRequest,
   type PartyServiceOptions,
   type RaidReport,
@@ -51,12 +53,13 @@ import {
   WEST_CHANNEL,
   WEST_FORUM,
 } from './gyms.js';
-import { MemoryPartyStorage, PARTY_NOW, REPORTER } from './parties.js';
+import { at, MemoryPartyStorage, PARTY_NOW, REPORTER, TEST_SPOT } from './parties.js';
 import { gymsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { MemorySavedRoutes } from './saved-routes.js';
 import { createTestLogger } from './test-logger.js';
+import { NO_MAX_BOSSES } from './test-context.js';
 import { MemoryUsers } from './users.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { PartyHistory } from '../../src/services/party-history.js';
@@ -359,6 +362,7 @@ export async function partyServiceWith(
     regionStore: regions,
     gyms,
     raidBosses: raidBossesFixture(),
+    maxBosses: NO_MAX_BOSSES,
     gameData: { catalogue: catalogueFixture() },
     raidEvents: raidEventsFixture(),
     users,
@@ -578,6 +582,44 @@ export async function reportedRaid(
   return { ...made, party: outcome.party, postId, current, said };
 }
 
+/**
+ * A max battle reported through the service (plan 8X-3), with its post on the fake gateway: a
+ * Dynamax Machamp (2★) at `TEST_SPOT` (region West), by `REPORTER`, who is interested, in the
+ * channel of West, ending at 21:00 of the test day.
+ */
+export async function reportedMax(
+  report: Partial<MaxReport> = {},
+  overrides: ServiceOverrides = {},
+  kept?: Partial<Outliving>,
+) {
+  const made = await partyServiceWith([], overrides, kept);
+  const outcome = await made.service.reportMax({
+    spot: TEST_SPOT,
+    reporterId: REPORTER,
+    anonymous: false,
+    autoStatus: PartyStatus.Interested,
+    tier: 'D2',
+    boss: { key: 'machamp' },
+    endTime: at('2026-10-13T21:00'),
+    regionChannelId: WEST_CHANNEL,
+    ...report,
+  });
+  if (outcome.kind !== 'created') throw new Error(`the max battle was not made: ${outcome.kind}`);
+  await made.service.flush();
+  const postId = outcome.party.forumPostId;
+  if (postId === null) throw new Error('the max battle has no post');
+  /** The max battle as it is stored now. */
+  const current = (): MaxParty => {
+    const party = made.store.get(outcome.party.id);
+    if (party?.type !== 'max') throw new Error('the max battle is no longer active');
+    return party;
+  };
+  /** The texts of the messages in the post that were not deleted, oldest first. */
+  const said = (): string[] =>
+    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
+  return { ...made, party: outcome.party, postId, current, said };
+}
+
 /**
  * A meetup made through the service, with its post on the fake gateway: "Community Day picnic",
  * made in the channel of West by `REPORTER`, who is interested. It has no times.
````

### Task 5: 8X-3 task 5: max, and its boss, end and meeting time in the post

Prototype commit: `9ec3292a4dd1f7ec92b78a9677ad6bcd22534bd7`

- /max boss: spot: [tier:] [end:] (design 3.2): boss from the list of the
  moment (currentMaxBossChoices, the featured first; values m:<tier>:<key>)
  or a Pokémon typed in full ("Gigantamax " / "Dynamax " before it names the
  kind); tier: only for a boss on no list ("Which tier? Add `tier:`."),
  Gigantamax needs none. spot: a power spot of the server (PlaceFinder,
  power spots only, the member's region first), or a maps link or
  coordinates: the nearest power spot within 50 m (nearestPowerSpot), else
  a pin, an Unlisted power spot (Q7), said in the log for staff. end: as
  /end reads it, else the default end of the rotation (defaultMaxEnd); after
  the last battle time refused. Its guard reads all of it, refuses another
  boss at the spot (the battle there named, /boss there) and a forum the
  member is kept out of, before the throttle (MAX_THROTTLE, as /raid's).
- The ending-soon dialog (Matt, 2026-10-21): a new battle whose end is less
  than ENDING_SOON_MINUTES (5) away is asked about first, in a dialog (no
  deferral; the slow-read rule's clock checked before it opens): "Until the
  next rotation, 3:00 PM" first and picked, or "Until 2:30 PM (in 3
  minutes)"; with no later rotation (the last battle time) only "Report it
  anyway?". Its Submit (max:<token>:report, a PendingRequests token, the
  use carried on) decides again and reports; Cancel makes nothing. Joining
  the battle at the spot asks nothing.
- MaxChangeService (ctx.maxBattles): setEnd under the spot's lock
  (spot-taken where an ended battle's later end would share its spot), the
  meeting times after the new end cancelled; setBoss (the tier follows,
  max-kind-change between Dynamax and Gigantamax). /end and /boss in a max
  battle's post use them; /meet sets a group's meeting time from now to its
  end (typedMaxTime); /where shows the spot and its Map.
- Meet... for max battles (Q10): the round 5-minute times of the next hour
  up to the end, "No meeting time" when one is set; the button and the hint
  on the post.
- /delete's words for a max battle (its spot is free for a new report).

**Files:**

```
 src/app-context.ts                      |   3 +
 src/app.ts                              |   3 +
 src/commands/index.ts                   |   2 +
 src/commands/max/in-max.test.ts         | 209 ++++++++++++++++++++++
 src/commands/max/max-changes.ts         |  85 +++++++++
 src/commands/max/max-input.ts           | 310 ++++++++++++++++++++++++++++++++
 src/commands/max/max.test.ts            | 498 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/max/max.ts                 | 412 +++++++++++++++++++++++++++++++++++++++++++
 src/commands/parties/delete.ts          |  20 ++-
 src/commands/parties/meet-dialog.ts     |  24 ++-
 src/commands/parties/meet.ts            |  23 ++-
 src/commands/parties/reply.ts           |   5 +-
 src/commands/parties/status.ts          |  23 ++-
 src/commands/raids/boss.ts              |  29 ++-
 src/commands/raids/change.ts            |  11 +-
 src/components/index.ts                 |   2 +
 src/components/party.test.ts            |   7 +-
 src/domain/party/meet-times.ts          |  15 +-
 src/domain/time/max-end.test.ts         |  12 ++
 src/domain/time/max-end.ts              |  20 ++-
 src/render/group-dialogs.ts             |   4 +-
 src/render/max-dialog.ts                |  61 +++++++
 src/render/max-post.ts                  |   3 +-
 src/render/meet-dialog.ts               |   4 +-
 src/render/party-controls.test.ts       |   5 +-
 src/render/party-controls.ts            |  15 +-
 src/services/attendance-service.ts      |   7 +-
 src/services/max-change-service.test.ts |  74 ++++++++
 src/services/max-change-service.ts      | 172 ++++++++++++++++++
 src/services/party-service.max.test.ts  |   2 -
 src/services/place-finder.ts            |  18 ++
 src/web/party-press.test.ts             |   5 +-
 test/support/party-service.ts           |   3 +
 test/support/test-context.ts            |   5 +
 34 files changed, 2033 insertions(+), 58 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/in-max.test.ts src/commands/max/max.test.ts src/components/party.test.ts src/domain/time/max-end.test.ts src/render/party-controls.test.ts src/services/max-change-service.test.ts src/services/party-service.max.test.ts src/web/party-press.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9ec3292a4dd1f7ec92b78a9677ad6bcd22534bd7 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 task 5: max, and its boss, end and meeting time in the post`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 12f900de0d0f48b858d8cfaecf575eb7c00e9941..3d07337d48853e4356dc6b9577da1cdeec644684 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -28,6 +28,7 @@ import type { PokemonFinder, PokemonNicknames } from './services/pokemon-search-
 import type { MaxBossAdmin, MaxBossProvider } from './services/max-boss-service.js';
 import type { RaidBossAdmin, RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidChangeService } from './services/raid-change-service.js';
+import type { MaxChangeService } from './services/max-change-service.js';
 import type { MaxEventProvider, RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionAdminService } from './services/region-admin-service.js';
 import type { RegionProvider } from './services/region-directory.js';
@@ -104,6 +105,8 @@ export interface AppContext {
   readonly attendance: AttendanceService;
   /** What members change about a raid itself: times, length, boss, moves, gym. */
   readonly raids: RaidChangeService;
+  /** What members change about a max battle itself (plan 8X-3): its end and its boss. */
+  readonly maxBattles: MaxChangeService;
   /**
    * Meetup safety (plan 8S-1): the check of a meetup's place, the requests held for the
    * moderators and their decisions, blocks and appeals. Off without `settings.channels.moderation`.
diff --git a/src/app.ts b/src/app.ts
index 5224a5cb5d25b1b66ef5e0d9dc328f27d0c38bed..f538a662ea519e8bcfb6790a3720ca7aaf0a00e5 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -87,6 +87,7 @@ import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossAnnouncer } from './services/raid-boss-announcer.js';
 import { MaxBossService } from './services/max-boss-service.js';
+import { MaxChangeService } from './services/max-change-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidChangeService } from './services/raid-change-service.js';
 import { TimedPartyService } from './services/timed-party-service.js';
@@ -422,6 +423,7 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  const maxBattles = new MaxChangeService({ store: parties, posts: partyService, lines, log });
   const timedParties = new TimedPartyService({
     store: parties,
     gateway: partyGateway,
@@ -711,6 +713,7 @@ export async function startApp(
     partyService,
     attendance,
     raids,
+    maxBattles,
     timedParties,
     meetupSafety,
     reports,
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 770c12b6fef32152c749aeca84d44839df845404..d5e31318f1800573f83de4d26b8b47ad95786a7a 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -31,6 +31,7 @@ import { status, where } from './parties/status.js';
 import { boss, moveset } from './raids/boss.js';
 import { location } from './raids/location.js';
 import { duration, end, hatch } from './raids/change.js';
+import { max } from './max/max.js';
 import { raid } from './raids/raid.js';
 import { readScreenshot } from './screenshots/read-screenshot.js';
 import { bounds } from './regions/bounds.js';
@@ -60,6 +61,7 @@ export const messageCommands: readonly MessageCommand[] = [reportMessageCommand]
 export const commands: readonly CommandModule[] = [
   help,
   raid,
+  max,
   readScreenshot,
   train,
   meetup,
diff --git a/src/commands/max/in-max.test.ts b/src/commands/max/in-max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2d401893487122640c6bab3a45ac27568d9f4f77
--- /dev/null
+++ b/src/commands/max/in-max.test.ts
@@ -0,0 +1,209 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { dialogChoices, shownDialog } from '../../../test/support/dialogs.js';
+import {
+  fakeAutocomplete,
+  fakeButton,
+  fakeChatInput,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../../test/support/gyms.js';
+import { maxBossServiceWith } from '../../../test/support/max-boss-service.js';
+import { buttonNames } from '../../../test/support/messages.js';
+import {
+  ALICE,
+  at,
+  PARTY_NOW,
+  REPORTER,
+  TEST_PIN,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import { reportedMax } from '../../../test/support/party-service.js';
+import type { MaxReport } from '../../services/party-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { partyButtons } from '../../components/party.js';
+import type { CommandModule } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { done, join } from '../parties/attendance.js';
+import { meetControls } from '../parties/meet-dialog.js';
+import { meet } from '../parties/meet.js';
+import { deleteParty } from '../parties/delete.js';
+import { where } from '../parties/status.js';
+import { boss } from '../raids/boss.js';
+import { end, hatch } from '../raids/change.js';
+
+const all: CommandModule[] = [join, done, meet, end, hatch, boss, where, deleteParty];
+const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
+
+/** A Dynamax Machamp (2★) battle at the gazebo until 21:00 of the test day, and its commands. */
+async function setup(report: Partial<MaxReport> = {}) {
+  const made = await reportedMax(report);
+  const bosses = await maxBossServiceWith();
+  await bosses.service.sync();
+  bosses.state.now = at('2026-10-22T14:00');
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    maxBattles: made.maxes,
+    parties: made.store,
+    regions: made.regions,
+    maxBosses: bosses.service,
+    maxBossAdmin: bosses.service,
+  });
+  const router = new InteractionRouter(ctx, all, [partyButtons, meetControls]);
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const place = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
+  const answer = async (
+    commandName: string,
+    options: Record<string, string> = {},
+    user = REPORTER,
+  ): Promise<string | undefined> => {
+    const used = await handle(fakeChatInput({ commandName, ...place, userId: user, options }));
+    for (const responder of [used.reply, used.editReply, used.followUp]) {
+      if (responder.mock.calls.length > 0) return sent(responder).content;
+    }
+    return undefined;
+  };
+  return { ...made, ctx, handle, answer, place, bosses: bosses.service };
+}
+
+describe('the commands in the post of a max battle (plan 8X-3)', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('/end sets its end within the day, never past the last battle time', async () => {
+    const made = await setup();
+    expect(await made.answer('end', { time: '3pm' })).toBe(
+      `This max battle now ends at ${stamp(at('2026-10-13T15:00'))}.`,
+    );
+    expect(made.current().endTime).toBe(at('2026-10-13T15:00'));
+    expect(await made.answer('end', { time: '10pm' })).toMatch(
+      /^"10pm" cannot be the time the battle ends/,
+    );
+    expect(await made.answer('end', { time: 'none' })).toBe(
+      'A max battle always has an end: give the time it ends.',
+    );
+  });
+
+  it('/boss changes its boss within Dynamax, the tier with it, and refuses Gigantamax', async () => {
+    const made = await setup();
+    expect(await made.answer('boss', { pokemon: 'Sneasel' })).toBe(
+      'The boss of this max battle is now Dynamax Sneasel (1★).',
+    );
+    expect(made.current().max).toMatchObject({ boss: { key: 'sneasel' }, tier: 'D1' });
+    expect(await made.answer('boss', { pokemon: 'Gigantamax Machamp' })).toBe(
+      'A Dynamax battle cannot become a Gigantamax one, nor the other way round (the lobby size ' +
+        'would change). Report the new battle with `/max`.',
+    );
+  });
+
+  it('/meet sets the meeting time of the group, until the battle ends', async () => {
+    const made = await setup();
+    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
+      `The meeting time of your group is ${stamp(at('2026-10-13T14:45'))} (${stamp(at('2026-10-13T14:45'), 'R')}).`,
+    );
+    expect(await made.answer('meet', { time: '9:30pm' })).toMatch(
+      /^"9:30pm" cannot be a meeting time/,
+    );
+    expect(await made.answer('hatch', { time: '20' })).toMatch(/only works in the post of a raid/);
+  });
+
+  it('Meet… offers the round five-minute times of the next hour, up to its end', async () => {
+    const made = await setup();
+    await made.service.flush();
+    expect(buttonNames(made.gateway.posts.get(made.postId)?.message)).toContain('⏰');
+    const press = await made.handle(
+      fakeButton({
+        customId: encodeCustomId({ kind: 'party', id: made.party.id, action: 'meet', args: [] }),
+        channelId: made.postId,
+        userId: REPORTER,
+      }),
+    );
+    const times = dialogChoices(shownDialog(press)).map((choice) => choice.value);
+    expect(times).toHaveLength(12);
+    expect(times[0]).toBe(String(at('2026-10-13T14:05')));
+    expect(times.at(-1)).toBe(String(at('2026-10-13T15:00')));
+  });
+
+  it('Done completes the battle and asks the others of the group who are here', async () => {
+    const made = await setup();
+    await made.store.update(made.party.id, (party) => ({
+      party: withAttendees(party, {
+        [REPORTER]: { status: PartyStatus.Coming },
+        [ALICE]: { status: PartyStatus.Present },
+      }),
+    }));
+    expect(await made.answer('done')).toMatch(/done/i);
+    expect(made.current().attendees[REPORTER]?.status).toBe(PartyStatus.Complete);
+    expect(made.current().attendees[ALICE]?.status).toBe(PartyStatus.CompletePending);
+    // The question in the post names a max battle, not a raid.
+    await made.attendance.flush();
+    expect(made.said().some((text) => text.includes('have you completed this max battle?'))).toBe(
+      true,
+    );
+  });
+
+  it('/where shows the power spot with its map', async () => {
+    const made = await setup();
+    expect(await made.answer('where')).toBe(
+      '**Gazebo of the Park** (power spot)\n' +
+        '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
+    );
+  });
+
+  // Review B, B11: a pin is no power spot Pine knows.
+  it('/where shows a pin as an unlisted power spot with its map', async () => {
+    const made = await setup({ spot: TEST_PIN });
+    expect(await made.answer('where')).toBe(
+      '📍 **Unlisted power spot**\n' +
+        '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.002%2C-80.002>)',
+    );
+  });
+
+  // Review B, B7: a Gigantamax battle's boss is a Gigantamax boss.
+  it('/boss in a Gigantamax battle takes and offers bosses of its own kind', async () => {
+    const made = await setup({ tier: 'G' });
+    const ids = { pokemonId: 'MACHAMP', form: null, createdBy: REPORTER, expiresAt: null };
+    await made.bosses.addOverride({ ...ids, action: 'add', tier: 'D3', shiny: null });
+    await made.bosses.addOverride({ ...ids, action: 'add', tier: 'G', shiny: null });
+    expect(await made.answer('boss', { pokemon: 'Machamp' })).toBe(
+      'The boss of this max battle is Gigantamax Machamp already.',
+    );
+    const typing = await made.handle(
+      fakeAutocomplete({
+        commandName: 'boss',
+        ...made.place,
+        focusedName: 'pokemon',
+        focused: 'mach',
+      }),
+    );
+    const names = (typing.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.name);
+    expect(names.length).toBeGreaterThan(0);
+    expect(names.every((name) => name.includes('Gigantamax'))).toBe(true);
+  });
+
+  // Review B, B6: Done, its answers and Meet… are a battle's, not a raid's alone.
+  it('answers Done and Meet… of a battle that has ended without calling it a raid', async () => {
+    const made = await setup();
+    await made.service.end(made.party.id);
+    for (const action of ['done', 'meet']) {
+      const press = await made.handle(
+        fakeButton({
+          customId: encodeCustomId({ kind: 'party', id: made.party.id, action, args: [] }),
+          channelId: made.postId,
+          userId: REPORTER,
+        }),
+      );
+      expect(sent(press.reply).content).toBe('This has ended.');
+    }
+  });
+});
diff --git a/src/commands/max/max-changes.ts b/src/commands/max/max-changes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4179bec76839ff9f55d119c9e33427ca4562d110
--- /dev/null
+++ b/src/commands/max/max-changes.ts
@@ -0,0 +1,85 @@
+import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { UserError } from '../../discord/errors.js';
+import { memberInfo } from '../../discord/member-info.js';
+import type { MaxParty } from '../../domain/party/party.js';
+import { problemText } from '../../render/activity.js';
+import { timestamp } from '../../render/text.js';
+import type { MaxChangeOutcome } from '../../services/max-change-service.js';
+import { partyOver } from '../parties/reply.js';
+import { readMaxBoss, typedMaxTime } from './max-input.js';
+
+/*
+ * `/end` and `/boss` in the post of a max battle (plan 8X-3; design 3.1): read as `/max` reads
+ * them, changed through `ctx.maxBattles` (decided inside the store), answered privately.
+ */
+
+/** The words of a change that did not land: over, refused (the battle there named), or none. */
+function refusal(ctx: AppContext, outcome: MaxChangeOutcome): string | undefined {
+  if (outcome.kind === 'gone') return partyOver({ type: 'max' });
+  if (outcome.kind !== 'refused') return undefined;
+  const text = problemText(outcome.reason, ctx.attendance.limits(), 'max battle');
+  const post = outcome.other?.forumPostId;
+  return post ? `${text} Its battle is <#${post}>.` : text;
+}
+
+async function reply(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  outcome: MaxChangeOutcome,
+  said: (party: MaxParty) => string,
+  same: string,
+): Promise<void> {
+  const refused = refusal(ctx, outcome);
+  if (refused !== undefined || outcome.kind !== 'ok') throw new UserError(refused ?? partyOver());
+  await interaction.reply({
+    content: outcome.changed ? said(outcome.party) : same,
+    flags: MessageFlags.Ephemeral,
+  });
+}
+
+/** `/end` in a max battle's post: a time within its day, never past the last battle time. */
+export async function changeMaxEnd(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  party: MaxParty,
+  text: string,
+): Promise<void> {
+  const typed = typedMaxTime(ctx, 'end', text, Date.now(), party);
+  // An end cannot be removed (`typedMaxTime` refuses `none`).
+  if (typed === 'unset') throw new UserError('A max battle always has an end.');
+  const member = { id: interaction.user.id, ...memberInfo(interaction) };
+  const outcome = await ctx.maxBattles.setEnd(party.id, member, typed.at);
+  const when = (battle: MaxParty): string =>
+    battle.endTime === null ? 'no time' : timestamp(battle.endTime);
+  await reply(
+    interaction,
+    ctx,
+    outcome,
+    (battle) => `This max battle now ends at ${when(battle)}.`,
+    `This max battle ends at ${when(party)} already.`,
+  );
+}
+
+/**
+ * `/boss` in a max battle's post: a boss as `/max` reads it (`readMaxBoss`: a listed one, or a
+ * Pokémon the game lets battle so, with its tier); a change between Dynamax and Gigantamax is
+ * refused by the battle (`max-kind-change`).
+ */
+export async function changeMaxBoss(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  party: MaxParty,
+  text: string,
+): Promise<void> {
+  const read = readMaxBoss(ctx, text, null, Date.now(), party.max.tier);
+  const member = { id: interaction.user.id, ...memberInfo(interaction) };
+  const outcome = await ctx.maxBattles.setBoss(party.id, member, read);
+  await reply(
+    interaction,
+    ctx,
+    outcome,
+    () => `The boss of this max battle is now ${read.label}.`,
+    `The boss of this max battle is ${read.label} already.`,
+  );
+}
diff --git a/src/commands/max/max-input.ts b/src/commands/max/max-input.ts
new file mode 100644
index 0000000000000000000000000000000000000000..aaba746ea50411ba7f9a9d230d0a4ec1bd5869c6
--- /dev/null
+++ b/src/commands/max/max-input.ts
@@ -0,0 +1,310 @@
+import type { AppContext } from '../../app-context.js';
+import type { LocatedInteraction } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf } from '../../discord/guards.js';
+import { readPin } from '../../domain/geo/pin-input.js';
+import type { MaxParty, MaxSpot, PowerSpot, RaidBossRef } from '../../domain/party/party.js';
+import { typedMaxBoss } from '../../domain/pogo/max-boss-list.js';
+import type { MaxBoss } from '../../domain/pogo/max-bosses.js';
+import {
+  battleKindOf,
+  isMaxTier,
+  MAX_TIERS,
+  maxBossTitle,
+  maxTierLabel,
+  type BattleKind,
+  type MaxTier,
+} from '../../domain/pogo/max-tier.js';
+import { defaultMaxEnd, lastBattleOn, type MaxEndInput } from '../../domain/time/max-end.js';
+import { resolvePartyTime } from '../../domain/time/party-time.js';
+import { plain, truncate } from '../../render/text.js';
+import { currentMaxBossChoices } from '../../services/max-boss-service.js';
+import { placeValue } from '../../services/place-finder.js';
+import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
+import { namedPlace, pickedPlace, type PlaceKindsOnly } from '../place-option.js';
+import { between } from '../raids/raid-input.js';
+
+const MINUTE = 60_000;
+
+/*
+ * What `/max` reads (plan 8X-3; design 3.2): the boss and its tier, the spot, the end; shared by
+ * the command, its dialog and `/boss`, `/end`, `/meet` in a max battle's post.
+ */
+
+/** What the reading of a max battle needs of the bot. */
+export type MaxReading = Pick<
+  AppContext,
+  'config' | 'maxBosses' | 'raidEvents' | 'pokemon' | 'gameData'
+>;
+
+/** A max boss as a member named it: the reference to store, its tier, and how to say it. */
+export interface ReadMaxBoss {
+  boss: RaidBossRef;
+  tier: MaxTier;
+  /** `Dynamax Machamp (2★)`, made plain. */
+  label: string;
+}
+
+/** The value of a boss choice of `/max`: `m:<tier>:<key>` (at most 100 characters). */
+export function maxChoiceValue(boss: Pick<MaxBoss, 'tier' | 'key'>): string {
+  return `m:${boss.tier}:${boss.key}`;
+}
+
+/**
+ * The choices of `/max`'s `boss`: the list in its order (`currentMaxBossChoices`), narrowed; of
+ * one kind only for `/boss` in a battle (`kind`: a battle never changes kind, review B, B7).
+ */
+export function maxBossOptions(
+  ctx: MaxReading,
+  typed: string,
+  now: number,
+  kind?: BattleKind,
+): Choice[] {
+  const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
+  const fits = (name: string): boolean => words.every((word) => name.toLowerCase().includes(word));
+  return currentMaxBossChoices(maxDeps(ctx), now)
+    .filter((choice) => kind === undefined || battleKindOf(choice.boss.tier) === kind)
+    .filter((choice) => fits(choice.name))
+    .map((choice) => ({
+      name: truncate(choice.name, CHOICE_NAME),
+      value: maxChoiceValue(choice.boss),
+    }))
+    .filter((choice) => choice.value.length <= 100)
+    .slice(0, MAX_CHOICES);
+}
+
+/** What `currentMaxBossChoices` reads, from the bot's context. */
+function maxDeps(ctx: MaxReading) {
+  return {
+    maxBosses: ctx.maxBosses,
+    maxEvents: ctx.raidEvents,
+    pokemon: ctx.pokemon,
+    gameData: ctx.gameData,
+    zone: ctx.config.settings.timezone,
+  };
+}
+
+/** The tier option's choices: `D1` … `D5`, `G` (design section 10, review 16). */
+export const TIER_CHOICES = MAX_TIERS.map((tier) => ({ name: maxTierLabel(tier), value: tier }));
+
+/** Said when a boss on no list was typed without `tier:`. */
+export const WHICH_TIER = 'Which tier? Add `tier:`.';
+
+/** A reference of a listed boss: its catalogue key, or the feed's name. */
+function refOf(boss: MaxBoss): RaidBossRef {
+  return boss.entry ? { key: boss.entry.key } : { name: boss.name };
+}
+
+function read(boss: RaidBossRef, name: string, tier: MaxTier): ReadMaxBoss {
+  return { boss, tier, label: plain(maxBossTitle(name, tier)) };
+}
+
+/** A typed `Gigantamax Machamp` or `G-Max Machamp`, `Dynamax Machamp`: the kind and the rest. */
+function kindOfText(text: string): { gigantamax?: boolean; rest: string } {
+  const match = /^(gigantamax|g-?max|dynamax|d-?max)\s+(.+)$/i.exec(text.trim());
+  if (!match?.[1] || !match[2]) return { rest: text.trim() };
+  return { gigantamax: /^g/i.test(match[1]), rest: match[2] };
+}
+
+/**
+ * The boss a member picked or typed for a max battle (design 3.2): a choice of the list
+ * (`m:<tier>:<key>`, still on it); otherwise a Pokémon typed in full (`exact`, `Gigantamax ` or
+ * `Dynamax ` before it names the kind): its listed boss (Dynamax before Gigantamax, Gigantamax
+ * loses design conflicts; the tier `tier:` names when given), else, for a Pokémon the game master
+ * lets battle so, the tier `tier:` names (required then: `WHICH_TIER`), Gigantamax where it is
+ * named so (it has no stars to ask), else `fallback` where it may battle in it (`/boss` in a
+ * battle: its own tier). Refused with a sentence for anything else.
+ */
+export function readMaxBoss(
+  ctx: MaxReading,
+  text: string,
+  tierText: string | null,
+  now: number,
+  fallback?: MaxTier,
+): ReadMaxBoss {
+  const tier = tierText === null ? undefined : tierText.trim().toUpperCase();
+  if (tier !== undefined && !isMaxTier(tier)) {
+    throw new UserError('That is no max battle tier: pick one from the list.');
+  }
+  const bosses = ctx.maxBosses.bosses();
+  const picked = /^m:(D[1-5]|G):(.{1,95})$/.exec(text.trim());
+  if (picked) {
+    const pickedTier = picked[1] as MaxTier;
+    const key = picked[2];
+    const listed = [...bosses, ...ctx.maxBosses.coming()].find(
+      (boss) => boss.key === key && boss.tier === pickedTier,
+    );
+    const offered = currentMaxBossChoices(maxDeps(ctx), now).find(
+      (choice) => choice.boss.key === key && choice.boss.tier === pickedTier,
+    );
+    const boss = offered?.boss ?? listed;
+    if (!boss) throw new UserError('That boss is no longer on the list: pick it again.');
+    return read(refOf(boss), boss.name, boss.tier);
+  }
+  const { gigantamax, rest } = kindOfText(text);
+  const entry = ctx.pokemon.exact(rest);
+  const shown = plain(truncate(text.trim(), 80));
+  if (!entry) {
+    throw new UserError(
+      `I know no Pokémon called "${shown}". Pick a boss from the list that appears while you type.`,
+    );
+  }
+  const typed = typedMaxBoss(entry, bosses, ctx.gameData.catalogue);
+  // `/boss` in a battle (`fallback`) with a name that says no kind (review B, B7): a boss of the
+  // battle's own kind first, listed, else of its tier where the game lets it battle so; only then
+  // the rest, which the battle refuses with its reason (`max-kind-change`).
+  if (fallback !== undefined && gigantamax === undefined && tier === undefined) {
+    const own = (one: MaxTier): boolean => battleKindOf(one) === battleKindOf(fallback);
+    const mine = typed.listed.find((boss) => own(boss.tier));
+    if (mine) return read(refOf(mine), mine.name, mine.tier);
+    if (typed.others.includes(fallback)) return read({ key: entry.key }, entry.name, fallback);
+  }
+  const ofKind = (one: MaxTier): boolean =>
+    gigantamax === undefined || (one === 'G') === gigantamax;
+  const listed = typed.listed
+    .filter((boss) => ofKind(boss.tier) && (tier === undefined || boss.tier === tier))
+    .sort((a, b) => Number(a.tier === 'G') - Number(b.tier === 'G'));
+  const first = listed[0];
+  if (first) return read(refOf(first), first.name, first.tier);
+  const allowed = typed.others.filter(ofKind);
+  if (tier !== undefined && allowed.includes(tier))
+    return read({ key: entry.key }, entry.name, tier);
+  if (tier === undefined && gigantamax === true && allowed.includes('G')) {
+    return read({ key: entry.key }, entry.name, 'G');
+  }
+  if (tier === undefined && fallback !== undefined && allowed.includes(fallback)) {
+    return read({ key: entry.key }, entry.name, fallback);
+  }
+  if (allowed.length === 0 && typed.listed.every((boss) => !ofKind(boss.tier))) {
+    throw new UserError(`${plain(entry.name)} is no max battle boss in the game.`);
+  }
+  if (tier !== undefined) {
+    throw new UserError(`${plain(entry.name)} is no ${maxTierLabel(tier)} boss.`);
+  }
+  throw new UserError(WHICH_TIER);
+}
+
+/** `/max`'s `spot` takes power spots only (design 3.2). */
+const SPOTS_ONLY: PlaceKindsOnly = {
+  kinds: ['powerspot'],
+  refusal: 'A max battle is at a power spot: pick one from the list, or give a maps link.',
+};
+
+/**
+ * The spot a member named (design 3.2, Q7): a power spot of the list (`namedPlace`, power spots
+ * only: the member's region first), or typed outright; a maps link or coordinates are the
+ * nearest power spot within 50 metres (`PlaceFinder.nearestPowerSpot`), else a pin, an
+ * "Unlisted power spot". Refused as `namedPlace` refuses (`PLACE_GONE`, `NOT_HERE`,
+ * `PIN_NOT_HERE`, a short link…).
+ */
+export async function readSpot(
+  interaction: LocatedInteraction,
+  ctx: AppContext,
+  text: string,
+): Promise<MaxSpot> {
+  const place = await namedPlace(interaction, ctx, text, 'or give a maps link', SPOTS_ONLY);
+  if (!place) throw new UserError('Name the power spot of the battle.');
+  if (place.kind === 'powerspot') return place as PowerSpot;
+  if (place.kind !== 'pin') throw new UserError(SPOTS_ONLY.refusal);
+  const row = await ctx.guilds.idFor(guildIdOf(interaction));
+  const near = row === undefined ? undefined : ctx.placeFinder.nearestPowerSpot(row, place);
+  const known = near && row !== undefined ? pickedPlace(ctx, row, placeValue(near)) : undefined;
+  if (known?.kind === 'powerspot') return known as PowerSpot;
+  // An unlisted power spot (Q7): named by nothing else, whatever is near it.
+  return { kind: 'pin', lat: place.lat, lon: place.lon, near: null, linkName: place.linkName };
+}
+
+/** Whether a text is a maps link or coordinates (a pin): its autocomplete offers nothing. */
+export function isPinText(text: string): boolean {
+  return readPin(text).kind !== 'none';
+}
+
+/** What `defaultMaxEnd` and its dialog read: the events, the hours, the zone. */
+export function maxEndInput(ctx: MaxReading, tier: MaxTier, at: number): MaxEndInput {
+  const { settings } = ctx.config;
+  return {
+    tier,
+    at,
+    events: ctx.raidEvents.maxEvents(),
+    big: ctx.raidEvents.bigEvents(),
+    hours: settings.maxBattles,
+    zone: settings.timezone,
+  };
+}
+
+/** Said of a report at or after the last battle time (design 3.1). */
+export function battlesOver(ctx: Pick<AppContext, 'config'>): string {
+  const { firstBattle, lastBattle } = ctx.config.settings.maxBattles;
+  return `Max battles are over for today: they can be fought from ${firstBattle} to ${lastBattle}.`;
+}
+
+/**
+ * A time a member typed for a max battle (`end:` of `/max`, `/end` and `/meet` in its post):
+ * read as a raid's time is (`resolvePartyTime`: minutes from now, or a clock time), within the
+ * day of the battle (`from`: when it was reported, or now for a report): an end from now to the
+ * day's last battle time, a meeting time from now to the battle's end. `unset` for `cancel` (a
+ * meeting time; an end cannot be removed: refused). Throws a `UserError` for what is no such time.
+ */
+export function typedMaxTime(
+  ctx: Pick<AppContext, 'config'>,
+  parameter: 'end' | 'meet',
+  text: string,
+  now: number,
+  battle?: Pick<MaxParty, 'createdAt' | 'endTime'>,
+): { at: number } | 'unset' {
+  const { settings } = ctx.config;
+  const from = battle?.createdAt ?? now;
+  const last = lastBattleOn(from, settings.maxBattles, settings.timezone);
+  const until = parameter === 'end' ? last : (battle?.endTime ?? last);
+  const minutes = Math.max(1, Math.ceil((until - from) / MINUTE));
+  const result = resolvePartyTime({
+    text,
+    now,
+    zone: settings.timezone,
+    parameter,
+    partyType: 'raid',
+    raidKind: 'standard',
+    party: { creationTime: from, hatchTime: null, endTime: parameter === 'meet' ? until : null },
+    settings,
+    durations: { incubation: 0, hatched: minutes },
+  });
+  const what = parameter === 'end' ? 'the time the battle ends' : 'a meeting time';
+  const shown = plain(truncate(text, 80));
+  if (result.kind === 'unset') {
+    if (parameter === 'end') {
+      throw new UserError('A max battle always has an end: give the time it ends.');
+    }
+    return 'unset';
+  }
+  if (result.kind === 'time') {
+    if (result.at > until || result.at < now) {
+      throw new UserError(`"${shown}" cannot be ${what}: it must be ${between(now, until, now)}.`);
+    }
+    return { at: result.at };
+  }
+  if (result.kind === 'out-of-range') {
+    if (now >= until) throw new UserError(battlesOver(ctx));
+    throw new UserError(`"${shown}" cannot be ${what}: it must be ${between(now, until, now)}.`);
+  }
+  throw new UserError(
+    `I could not read "${shown}" as ${what}. Try \`20\` (minutes from now) or \`6:15pm\`.`,
+  );
+}
+
+/**
+ * The end of a reported max battle (design 3.1, Q9): the one `end:` gave, else the default end
+ * of its rotation (`defaultMaxEnd`); refused at or after the last battle time (`battlesOver`).
+ */
+export function reportedEnd(
+  ctx: MaxReading,
+  tier: MaxTier,
+  text: string | null,
+  now: number,
+): number {
+  const decided = defaultMaxEnd(maxEndInput(ctx, tier, now));
+  if (decided.kind === 'over') throw new UserError(battlesOver(ctx));
+  if (text === null || text.trim() === '') return decided.end;
+  const typed = typedMaxTime(ctx, 'end', text, now);
+  if (typed === 'unset') return decided.end;
+  return typed.at;
+}
diff --git a/src/commands/max/max.test.ts b/src/commands/max/max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e4741d3dd9eae972d4f34cdb6e7f2f5cedfb9236
--- /dev/null
+++ b/src/commands/max/max.test.ts
@@ -0,0 +1,498 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  dialogChoices,
+  dialogOf,
+  dialogTexts,
+  shownDialog,
+} from '../../../test/support/dialogs.js';
+import {
+  fakeAutocomplete,
+  FAKE_USER_ID,
+  fakeChatInput,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
+import { MAX_ZONE } from '../../../test/support/max-bosses.js';
+import { maxBossServiceWith } from '../../../test/support/max-boss-service.js';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import { ALICE, asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
+import { partyServiceWith } from '../../../test/support/party-service.js';
+import { raidEventsFixture } from '../../../test/support/raid-events.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { MemoryUsers } from '../../../test/support/users.js';
+import { keptRow } from '../../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../../test/support/wayspots.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { Throttles } from '../../discord/throttle.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { parseBigEventFeed, parseMaxEventFeed } from '../../domain/time/max-events.js';
+import { end } from '../raids/change.js';
+import { MAX_BARRED, MAX_ENDED, max, maxControls, maxReportWords } from './max.js';
+
+/** Thursday 2026-10-22, 14:00: an ordinary day, after the max feed was read (10-20). */
+const THURSDAY = at('2026-10-22T14:00');
+
+/** The power spot of `TEST_SPOT`, kept as the Wayfarer import keeps it. */
+const SPOT_ROW = keptRow(1, {
+  id: TEST_SPOT.id,
+  kind: 'powerspot',
+  title: 'Gazebo of the Park',
+  lat: TEST_SPOT.lat,
+  lon: TEST_SPOT.lon,
+  address: '1 Park Lane, Pinewood, PA 15000, USA',
+  image: null,
+});
+
+async function setup() {
+  const made = await partyServiceWith();
+  // The services read the faked Date, as the bot's read the clock (a battle is made when reported).
+  Object.defineProperty(made.clock, 'now', { get: () => Date.now() });
+  const bosses = await maxBossServiceWith();
+  await bosses.service.sync();
+  // The service's clock is the test's (Date is faked to the day of each test).
+  bosses.state.now = Date.now();
+  const { wayspots } = await wayspotsWith([SPOT_ROW]);
+  const feed = readMaxEventFeed();
+  const throttles = new Throttles();
+  const { ctx, entries } = createTestContext({
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    attendance: made.attendance,
+    maxBosses: bosses.service,
+    maxBossAdmin: bosses.service,
+    raidEvents: raidEventsFixture(MAX_ZONE, {
+      max: parseMaxEventFeed(feed, MAX_ZONE).events,
+      big: parseBigEventFeed(feed, MAX_ZONE),
+    }),
+    wayspots,
+    users: new MemoryUsers(made.userSettings),
+    maxBattles: made.maxes,
+  });
+  await ctx.placeFinder.built();
+  // `/end` too, in the post a report made (plan 8X-3, Q-B).
+  const router = new InteractionRouter(ctx, [max, end], [maxControls], { throttles });
+  const run = async (options: Record<string, string>, extra: object = {}) => {
+    const interaction = fakeChatInput({
+      commandName: 'max',
+      channelId: WEST_CHANNEL,
+      options,
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ...made, ctx, entries, router, run, handle, throttles };
+}
+
+/** What the member was told last: a follow-up, else the edit of the deferred answer, else the reply. */
+function told(interaction: FakeInteraction): string | undefined {
+  for (const responder of [interaction.followUp, interaction.editReply, interaction.reply]) {
+    if (responder.mock.calls.length > 0) return sent(responder).content;
+  }
+  return undefined;
+}
+
+describe('/max', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: THURSDAY });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reports a listed Dynamax boss at a power spot picked from the list, until 21:00', async () => {
+    const made = await setup();
+    const interaction = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
+    const [battle] = made.store.active();
+    expect(asMax(battle)).toMatchObject({
+      max: { tier: 'D2', boss: { key: 'machop' }, spot: { kind: 'powerspot', id: TEST_SPOT.id } },
+      endTime: at('2026-10-22T21:00'),
+      forumChannelId: WEST_FORUM,
+    });
+    expect(told(interaction)).toBe(
+      `Reported: Dynamax Machop (2★) at Gazebo of the Park, until <t:${at('2026-10-22T21:00') / 1000}:t>. ` +
+        `Its post is <#${battle?.forumPostId}>.`,
+    );
+  });
+
+  it('ends a Gigantamax battle outside events at the next full hour', async () => {
+    const made = await setup();
+    await made.run({ boss: 'Machamp', tier: 'G', spot: `powerspot:${TEST_SPOT.id}` });
+    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-22T15:00'));
+  });
+
+  it('asks the tier of a boss on no list, and refuses a Pokémon that is no max boss', async () => {
+    const made = await setup();
+    const asked = await made.run({ boss: 'Machamp', spot: `powerspot:${TEST_SPOT.id}` });
+    expect(told(asked)).toBe('Which tier? Add `tier:`.');
+    const withTier = await made.run({
+      boss: 'Machamp',
+      tier: 'D3',
+      spot: `powerspot:${TEST_SPOT.id}`,
+    });
+    expect(told(withTier)).toMatch(/^Reported: Dynamax Machamp \(3★\)/);
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('takes a maps link near a power spot as that spot, and one near none as a pin', async () => {
+    const made = await setup();
+    await made.run({ boss: 'Machop', spot: `${TEST_SPOT.lat}, ${TEST_SPOT.lon + 0.0002}` });
+    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ kind: 'powerspot' });
+    await made.run({ boss: 'Machop', spot: '40.05, -80.05' });
+    // Made within one millisecond: told apart by their spots, not by their order.
+    const pin = made.store
+      .active()
+      .map(asMax)
+      .find((one) => one.max.spot.kind === 'pin');
+    expect(pin?.max.spot).toEqual({
+      kind: 'pin',
+      lat: 40.05,
+      lon: -80.05,
+      near: null,
+      linkName: null,
+    });
+    expect(
+      made.entries.some(
+        (entry) => entry.msg === 'a max battle was reported at an unlisted power spot',
+      ),
+    ).toBe(true);
+  });
+
+  it('joins the battle of the same boss at the spot, and refuses another boss, uncounted', async () => {
+    const made = await setup();
+    await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
+    const [battle] = made.store.active();
+    const again = await made.run(
+      { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
+      { userId: ALICE },
+    );
+    expect(told(again)).toMatch(
+      /^There is already a max battle against it at Gazebo of the Park\./,
+    );
+    expect(asMax(made.store.get(battle?.id ?? '')).attendees[ALICE]?.status).toBe(
+      PartyStatus.Interested,
+    );
+    // Two members with a window each: the reporter and Alice, who joined (`Throttles.size` counts
+    // windows, not uses).
+    expect(made.throttles.size).toBe(2);
+    const other = await made.run(
+      { boss: 'Sneasel', spot: `powerspot:${TEST_SPOT.id}` },
+      { userId: BOB },
+    );
+    expect(told(other)).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: ' +
+        `<#${battle?.forumPostId}>. \`/boss\` there changes its boss.`,
+    );
+    expect(made.store.active()).toHaveLength(1);
+    // Refused by its guard: Bob's use was not counted (he has no window).
+    expect(made.throttles.size).toBe(2);
+  });
+
+  // Review B, B8: the battle there by its kind; `/boss` cannot change a kind, so no hint then.
+  it('names the battle there by its kind, and a pin as an unlisted power spot', async () => {
+    const made = await setup();
+    await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
+    const [battle] = made.store.active();
+    const giga = await made.run({ boss: 'Machamp', tier: 'G', spot: `powerspot:${TEST_SPOT.id}` });
+    expect(told(giga)).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: ' +
+        `<#${battle?.forumPostId}>.`,
+    );
+    await made.run({ boss: 'Machop', spot: '40.05, -80.05' });
+    const pinned = made.store
+      .active()
+      .map(asMax)
+      .find((one) => one.max.spot.kind === 'pin');
+    const near = await made.run({ boss: 'Sneasel', spot: '40.05, -80.0501' });
+    expect(told(near)).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at an unlisted power spot: ' +
+        `<#${pinned?.forumPostId}>. \`/boss\` there changes its boss.`,
+    );
+  });
+
+  // Review B, B10: a post the bot may not make is none of the member's doing.
+  it('does not count a report whose post the bot may not make', async () => {
+    const made = await setup();
+    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    for (let n = 0; n < 21; n++) {
+      const refused = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
+      expect(told(refused)).toMatch(/^I am not allowed to make posts in /);
+    }
+    made.gateway.refusePosts.delete(WEST_FORUM);
+    const reported = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
+    expect(told(reported)).toMatch(/^Reported: Dynamax Machop/);
+  });
+
+  // Fix review F2: the service's `ended`, rare enough to be met only through its words.
+  it('says that the battle there has just ended', async () => {
+    const made = await setup();
+    const ask = {
+      boss: { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' },
+      spot: TEST_SPOT,
+      end: at('2026-10-22T21:00'),
+      regionChannelId: WEST_CHANNEL,
+      joins: undefined,
+      guild: 1,
+      asks: false,
+    };
+    expect(maxReportWords(made.ctx, { kind: 'ended' }, ask, PartyStatus.Interested)).toBe(
+      MAX_ENDED,
+    );
+    expect(MAX_ENDED).toBe('The max battle there has just ended: use `/max` again.');
+  });
+
+  it('refuses a report after the last battle time', async () => {
+    const made = await setup();
+    vi.setSystemTime(at('2026-10-22T21:05'));
+    const late = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
+    expect(told(late)).toBe(
+      'Max battles are over for today: they can be fought from 06:00 to 21:00.',
+    );
+  });
+
+  it('refuses a member kept out of the forum the battle would be in', async () => {
+    const made = await setup();
+    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    const refused = await made.run(
+      { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
+      { userId: ALICE },
+    );
+    expect(told(refused)).toBe(MAX_BARRED);
+    expect(made.store.active()).toEqual([]);
+  });
+
+  it('offers the bosses of the moment and the power spots while one types', async () => {
+    const made = await setup();
+    const bosses = fakeAutocomplete({
+      commandName: 'max',
+      channelId: WEST_CHANNEL,
+      focusedName: 'boss',
+      focused: 'mach',
+    });
+    await made.handle(bosses);
+    const choices = bosses.respond.mock.calls[0]?.[0] as { name: string; value: string }[];
+    expect(choices.map((choice) => choice.name)).toEqual(['Machop · Dynamax 2★']);
+    const spots = fakeAutocomplete({
+      commandName: 'max',
+      channelId: WEST_CHANNEL,
+      focusedName: 'spot',
+      focused: 'gazebo',
+    });
+    await made.handle(spots);
+    const offered = spots.respond.mock.calls[0]?.[0] ?? [];
+    expect(offered.map((choice) => choice.value)).toEqual([`powerspot:${TEST_SPOT.id}`]);
+    expect(offered[0]?.name).toMatch(/^Gazebo of the Park \(power spot\)/);
+  });
+});
+
+describe('/max: a battle that ends soon (Matt, 2026-10-21)', () => {
+  beforeEach(() => {
+    // The lake trio's Max Battle Day, 14:00 to 17:00: its battles rotate on the half hour.
+    vi.useFakeTimers({ toFake: ['Date'], now: at('2026-10-24T14:27') });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('asks before it reports: until the next rotation first, or until the end about to pass', async () => {
+    const made = await setup();
+    const interaction = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` });
+    expect(interaction.deferReply).not.toHaveBeenCalled();
+    const dialog = shownDialog(interaction);
+    expect(dialogTexts(dialog)).toEqual([
+      'This max battle ends at 2:30 PM, in 3 minutes. Report it until the next rotation?',
+    ]);
+    expect(dialogChoices(dialog)).toEqual([
+      {
+        value: 'next',
+        label: 'Until the next rotation, 3:00 PM',
+        description: undefined,
+        picked: true,
+      },
+      {
+        value: 'soon',
+        label: 'Until 2:30 PM (in 3 minutes)',
+        description: undefined,
+        picked: false,
+      },
+    ]);
+    expect(made.store.active()).toEqual([]);
+    const submit = await made.handle(
+      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'next' } }),
+    );
+    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T15:00'));
+    expect(told(submit)).toMatch(/^Reported: Dynamax Uxie \(5★\) at Gazebo of the Park/);
+  });
+
+  it('reports it until the end about to pass when the member picks that', async () => {
+    const made = await setup();
+    const interaction = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` });
+    const dialog = shownDialog(interaction);
+    await made.handle(
+      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'soon' } }),
+    );
+    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T14:30'));
+  });
+
+  it('asks only whether to report it when no later rotation is left', async () => {
+    const made = await setup();
+    vi.setSystemTime(at('2026-10-24T20:57'));
+    const interaction = await made.run({
+      boss: 'Machamp',
+      tier: 'G',
+      spot: `powerspot:${TEST_SPOT.id}`,
+    });
+    const dialog = shownDialog(interaction);
+    expect(dialogTexts(dialog)).toEqual([
+      'This max battle ends at 9:00 PM, in 3 minutes. Report it anyway?\n\nSubmit reports it.',
+    ]);
+    expect(dialogChoices(dialog)).toEqual([]);
+    await made.handle(fakeModal({ customId: dialog.custom_id, form: dialog }));
+    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T21:00'));
+  });
+
+  // Review B, B1: decided once, by the guard, so a deferral that crosses the mark changes nothing.
+  it('reports without asking when the deferral crosses the five-minute mark', async () => {
+    const made = await setup();
+    vi.setSystemTime(at('2026-10-24T14:24') + 59_500);
+    const interaction = fakeChatInput({
+      commandName: 'max',
+      channelId: WEST_CHANNEL,
+      options: { boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` },
+    });
+    const defer = interaction.deferReply.getMockImplementation();
+    interaction.deferReply.mockImplementation((payload) => {
+      vi.setSystemTime(at('2026-10-24T14:25') + 1_000);
+      return defer ? defer(payload) : Promise.resolve();
+    });
+    await made.handle(interaction);
+    expect(interaction.showModal).not.toHaveBeenCalled();
+    expect(told(interaction)).toMatch(/^Reported: Dynamax Uxie \(5★\)/);
+    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T14:30'));
+  });
+
+  // Review B, B4 (Claude's call): a typed end is never second-guessed.
+  it('asks nothing of a report whose end was typed, however soon', async () => {
+    const made = await setup();
+    const typed = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}`, end: '3' });
+    expect(dialogOf(typed)).toBeUndefined();
+    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T14:30'));
+  });
+
+  // Review B, B12 (Claude's call): the next rotation as things are at the end.
+  it('asks only whether to report a Dynamax battle at the last boundary of its event', async () => {
+    const made = await setup();
+    vi.setSystemTime(at('2026-10-24T16:57'));
+    const interaction = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` });
+    const dialog = shownDialog(interaction);
+    expect(dialogTexts(dialog)).toEqual([
+      'This max battle ends at 5:00 PM, in 3 minutes. Report it anyway?\n\nSubmit reports it.',
+    ]);
+    expect(dialogChoices(dialog)).toEqual([]);
+  });
+
+  // Review B, B5: a Submit without the choice it was shown is a stale control.
+  it('refuses a Submit without its choice, and reports nothing', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` }));
+    const submit = await made.handle(fakeModal({ customId: dialog.custom_id }));
+    expect(told(submit)).toBe(STALE_COMPONENT);
+    expect(made.store.active()).toEqual([]);
+  });
+
+  // Review B, B10: the Submit decides again as things are then.
+  it('refuses at the Submit another boss reported there meanwhile', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` }));
+    await made.run(
+      { boss: 'Mesprit', spot: `powerspot:${TEST_SPOT.id}`, end: '30' },
+      { userId: ALICE },
+    );
+    const [there] = made.store.active();
+    const submit = await made.handle(
+      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'next' } }),
+    );
+    expect(told(submit)).toBe(
+      'There is already a max battle against Dynamax Mesprit (5★) at Gazebo of the Park: ' +
+        `<#${there?.forumPostId}>. \`/boss\` there changes its boss.`,
+    );
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('refuses at the Submit a member kept out of the forum since the question', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` }));
+    made.gateway.barred.set(WEST_FORUM, new Set([FAKE_USER_ID]));
+    const submit = await made.handle(
+      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'next' } }),
+    );
+    expect(told(submit)).toBe(MAX_BARRED);
+    expect(made.store.active()).toEqual([]);
+  });
+
+  it('asks nothing of a member who joins the battle at the spot', async () => {
+    const made = await setup();
+    const first = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}`, end: '30' });
+    expect(dialogOf(first)).toBeUndefined();
+    const joining = await made.run(
+      { boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` },
+      { userId: ALICE },
+    );
+    expect(dialogOf(joining)).toBeUndefined();
+    expect(told(joining)).toMatch(/^There is already a max battle against it/);
+  });
+});
+
+describe('/max: a Dynamax battle before a max event that day (Matt, 2026-10-21, Q-B)', () => {
+  beforeEach(() => {
+    // The morning of the lake trio's Max Battle Day, 14:00 to 17:00.
+    vi.useFakeTimers({ toFake: ['Date'], now: at('2026-10-24T10:00') });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('ends at the start of the event, and /end moves it later within the day', async () => {
+    const made = await setup();
+    const reported = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
+    expect(told(reported)).toMatch(/until <t:\d+:t>\./);
+    const [battle] = made.store.active();
+    expect(battle?.endTime).toBe(at('2026-10-24T14:00'));
+    const later = await made.handle(
+      fakeChatInput({
+        commandName: 'end',
+        channelId: battle?.forumPostId ?? '',
+        thread: { parentId: WEST_FORUM },
+        userId: FAKE_USER_ID,
+        options: { time: '6pm' },
+      }),
+    );
+    expect(told(later)).toBe(`This max battle now ends at <t:${at('2026-10-24T18:00') / 1000}:t>.`);
+    expect(made.store.get(battle?.id ?? '')?.endTime).toBe(at('2026-10-24T18:00'));
+  });
+
+  it('takes a later end given with end:', async () => {
+    const made = await setup();
+    await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}`, end: '6pm' });
+    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T18:00'));
+  });
+
+  it('asks before the event starts as before any end: the event’s first rotation is next', async () => {
+    const made = await setup();
+    vi.setSystemTime(at('2026-10-24T13:57'));
+    const dialog = shownDialog(
+      await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` }),
+    );
+    expect(dialogChoices(dialog).map((choice) => choice.label)).toEqual([
+      'Until the next rotation, 2:30 PM',
+      'Until 2:00 PM (in 3 minutes)',
+    ]);
+  });
+});
diff --git a/src/commands/max/max.ts b/src/commands/max/max.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6dbba46834c11efee21c5527f1e0331cf2b07165
--- /dev/null
+++ b/src/commands/max/max.ts
@@ -0,0 +1,412 @@
+import {
+  SlashCommandBuilder,
+  type ChatInputCommandInteraction,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler, Guard, SimpleCommand } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { deferSubmit, pickedOf, readInTime } from '../../discord/dialog.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, regionChannelOf, requireGuild, requireRegion } from '../../discord/guards.js';
+import { memberInfo } from '../../discord/member-info.js';
+import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
+import type { Throttle } from '../../discord/throttle.js';
+import { maxSpotName } from '../../domain/party/max.js';
+import { sameBoss, type MaxParty, type MaxSpot } from '../../domain/party/party.js';
+import { battleKindOf, maxBossTitle, type MaxTier } from '../../domain/pogo/max-tier.js';
+import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { endsSoon, nextRotationEnd } from '../../domain/time/max-end.js';
+import { noPostWords } from '../../render/activity.js';
+import {
+  ENDING_SOON,
+  endingSoonDialog,
+  MAX_END_INPUT,
+  MAX_KIND,
+  NEXT_ROTATION,
+} from '../../render/max-dialog.js';
+import { plain, timestamp } from '../../render/text.js';
+import type { Member } from '../../services/attendance-service.js';
+import type { MaxReportOutcome } from '../../services/party-service.js';
+import { PendingRequests } from '../../services/pending-requests.js';
+import {
+  isPinText,
+  maxBossOptions,
+  maxEndInput,
+  readMaxBoss,
+  readSpot,
+  reportedEnd,
+  TIER_CHOICES,
+  type ReadMaxBoss,
+} from './max-input.js';
+import { nearChoices } from '../place-option.js';
+
+/*
+ * `/max` (plan 8X-3; design 3.2): reports a max battle at a power spot, or at a pin, "Unlisted
+ * power spot" (Q7). What can be known before the work (the boss, the spot, the end, another boss
+ * at the spot, a forum the member is kept out of) is refused by its guard, before the throttle.
+ * A battle whose end is less than `ENDING_SOON_MINUTES` away is asked about first, in a dialog
+ * (Matt, 2026-10-21), whose Submit reports it; joining the battle at the spot asks nothing.
+ */
+
+/** The name `/max` is used and counted under. */
+export const MAX_COMMAND = 'max';
+
+/** How often one member may report a max battle: as raids (`RAID_THROTTLE`). */
+export const MAX_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };
+
+/** What `/max` is refused when the report would put the member in a forum barred to them. */
+export const MAX_BARRED =
+  'You cannot report a max battle at this spot: you are kept out of the forum its battle would be in.';
+
+/**
+ * What `/max` says when the battle a report would join ended while it waited, and the one after
+ * it too (fix review F2): nothing was done.
+ */
+export const MAX_ENDED = 'The max battle there has just ended: use `/max` again.';
+
+/** A report as its guard read it: what, where, until when, made where. */
+export interface MaxAsk {
+  boss: ReadMaxBoss;
+  spot: MaxSpot;
+  end: number;
+  regionChannelId: string;
+  /** The battle of this boss at the spot, which the report joins; undefined for a new one. */
+  joins: MaxParty | undefined;
+  /** The server's row (`ctx.guilds`): a spot holds one battle per server. */
+  guild: number | undefined;
+  /**
+   * Whether `/max` asks first (the ending-soon dialog): a new battle whose end, not typed, is
+   * less than `ENDING_SOON_MINUTES` away. Decided once, by the guard, and read by the deferral
+   * and the command alike (review B, B1: a clock read twice could cross the mark between them,
+   * and a dialog cannot follow a deferral). A typed `end:` is never asked about (B4).
+   */
+  asks: boolean;
+  /** When `/max` counted the use, for a failure that is none of the member's doing. */
+  countedAt?: number;
+  /** The end one rotation later, which the ending-soon dialog offered first. */
+  next?: number;
+}
+
+/** What each interaction's guard read: the command takes it (one reading in all). */
+const asked = new WeakMap<ChatInputCommandInteraction, MaxAsk>();
+
+/** The reports that wait for the ending-soon dialog's Submit. */
+const pending = new PendingRequests<MaxAsk>();
+
+/** `at Gazebo of the Park`, `at an unlisted power spot`: where a battle is, in a sentence. */
+function atSpot(spot: MaxSpot): string {
+  return spot.kind === 'pin' ? 'at an unlisted power spot' : `at ${plain(maxSpotName(spot))}`;
+}
+
+/**
+ * `There is already a max battle against Dynamax Sneasel (1★) at <spot>: <#post>. …` (design
+ * 3.1), with the hint of `/boss` only where it could make the battle the one reported: never
+ * between Dynamax and Gigantamax (`reported`: the tier of the report).
+ */
+export function takenWords(ctx: AppContext, party: MaxParty, reported: MaxTier): string {
+  const name = ctx.partyService.maxView(party).boss.name;
+  const title = maxBossTitle(name, party.max.tier);
+  const post = party.forumPostId === null ? 'its post is being made' : `<#${party.forumPostId}>`;
+  const hint =
+    battleKindOf(reported) === battleKindOf(party.max.tier)
+      ? ' `/boss` there changes its boss.'
+      : '';
+  return (
+    `There is already a max battle against ${plain(title)} ${atSpot(party.max.spot)}: ` +
+    `${post}.${hint}`
+  );
+}
+
+/** The battle that holds the spot now in the member's server (`PartyStore.maxAt`). */
+function battleThere(ctx: AppContext, ask: Pick<MaxAsk, 'guild' | 'spot'>, now: number) {
+  return ask.guild === undefined ? undefined : ctx.parties.maxAt(ask.guild, ask.spot, now);
+}
+
+/** Whether a battle there is one of another boss than the report's (design Q3). */
+function otherBoss(there: MaxParty, boss: ReadMaxBoss): boolean {
+  return !sameBoss(there.max.boss, boss.boss) || there.max.tier !== boss.tier;
+}
+
+/**
+ * Whether a report at this spot would put the member in a forum somebody keeps them out of, as
+ * `/raid` asks it (`reportBarred`): the forum a new battle would go to, and that of the battle at
+ * the spot. Rejects while Discord cannot say.
+ */
+async function maxBarred(ctx: AppContext, ask: MaxAsk, memberId: string): Promise<boolean> {
+  const forum = ctx.partyService.regionForSpot(ask.spot, ask.regionChannelId).region
+    ?.forumChannelId;
+  const there = ask.joins?.forumChannelId;
+  for (const forumId of new Set([forum, there])) {
+    if (forumId && (await ctx.partyService.memberAccess(forumId, memberId)) === 'barred') {
+      return true;
+    }
+  }
+  return false;
+}
+
+/**
+ * Reads the report (`readMaxBoss`, `readSpot`, `reportedEnd`) and refuses what can be known before
+ * the work: another boss at the spot (Q3, the battle there named), a forum the member is kept out
+ * of. Before the throttle, so that a refusal does not count.
+ */
+const requireMaxReport: Guard = async (interaction, ctx) => {
+  if (!interaction.isChatInputCommand()) return;
+  const now = Date.now();
+  const regionChannelId = regionChannelOf(interaction, ctx);
+  if (regionChannelId === undefined) return;
+  const boss = readMaxBoss(
+    ctx,
+    interaction.options.getString('boss', true),
+    interaction.options.getString('tier'),
+    now,
+  );
+  const spot = await readSpot(interaction, ctx, interaction.options.getString('spot', true));
+  const endText = interaction.options.getString('end');
+  const end = reportedEnd(ctx, boss.tier, endText, now);
+  const guild = await ctx.guilds.idFor(guildIdOf(interaction));
+  const there = battleThere(ctx, { guild, spot }, now);
+  if (there && otherBoss(there, boss)) throw new UserError(takenWords(ctx, there, boss.tier));
+  const typed = endText !== null && endText.trim() !== '';
+  const ask: MaxAsk = {
+    boss,
+    spot,
+    end,
+    regionChannelId,
+    joins: there,
+    guild,
+    asks: there === undefined && !typed && endsSoon(end, now),
+  };
+  if (await maxBarred(ctx, ask, interaction.user.id)) throw new UserError(MAX_BARRED);
+  asked.set(interaction, ask);
+};
+
+const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
+  [PartyStatus.Interested]: 'interested',
+  [PartyStatus.Coming]: 'coming',
+  [PartyStatus.Present]: 'here',
+};
+
+/** What `/max` tells the member came of a report. */
+export function maxReportWords(
+  ctx: AppContext,
+  outcome: MaxReportOutcome,
+  ask: MaxAsk,
+  autoStatus: PartyStatus,
+): string {
+  const at = atSpot(ask.spot);
+  const post = (party: MaxParty): string =>
+    party.forumPostId === null
+      ? ' It is being set up right now.'
+      : ` Its post is <#${party.forumPostId}>.`;
+  switch (outcome.kind) {
+    case 'created':
+      return (
+        `Reported: ${ask.boss.label} ${at}, until ${timestamp(ask.end)}.` + post(outcome.party)
+      );
+    case 'exists': {
+      const status = STATUS_WORDS[autoStatus];
+      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
+      return `There is already a max battle against it ${at}.${post(outcome.party)}${marked}`;
+    }
+    case 'taken':
+      return takenWords(ctx, outcome.party, ask.boss.tier);
+    case 'no-region':
+      return (
+        `${ask.spot.kind === 'pin' ? 'That unlisted power spot' : plain(maxSpotName(ask.spot))} ` +
+        'is not in any region of this server, so I have nowhere to post the battle.'
+      );
+    case 'no-forum':
+      return (
+        `The region <#${outcome.region.channelId}> has no raid forum yet. ` +
+        'A moderator can create it with `/admin setup-forums`.'
+      );
+    case 'no-post':
+      return noPostWords(outcome.refused, (id) => `<#${id}>`);
+    case 'barred':
+      return MAX_BARRED;
+    case 'ended':
+      return MAX_ENDED;
+  }
+}
+
+/**
+ * Reports the battle as the member (anonymous when their privacy says so, signed up by their
+ * automatic status) and answers with what came of it (`editReply`: the interaction is
+ * acknowledged). A pin is said in the log for staff (Q7: "a sign to us we need to re-scrape").
+ * No post made, or a battle there that ended twice while it waited, is none of the member's
+ * doing: the use goes back (`givesBack`).
+ */
+async function report(
+  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
+  ctx: AppContext,
+  ask: MaxAsk,
+): Promise<void> {
+  const member: Member = { id: interaction.user.id, ...memberInfo(interaction) };
+  const { id, ...reporter } = member;
+  const settings = await ctx.users.get(id);
+  const outcome = await ctx.partyService.reportMax({
+    spot: ask.spot,
+    reporterId: id,
+    reporter,
+    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+    autoStatus: settings.autoStatus,
+    tier: ask.boss.tier,
+    boss: ask.boss.boss,
+    endTime: ask.end,
+    regionChannelId: ask.regionChannelId,
+    mayJoin: async (forumId) => (await ctx.partyService.memberAccess(forumId, id)) !== 'barred',
+  });
+  if (outcome.kind === 'created' && ask.spot.kind === 'pin') {
+    ctx.log.info(
+      {
+        party: outcome.party.id,
+        lat: ask.spot.lat,
+        lon: ask.spot.lon,
+        boss: ask.boss.label,
+      },
+      'a max battle was reported at an unlisted power spot',
+    );
+  }
+  const content = maxReportWords(ctx, outcome, ask, settings.autoStatus);
+  await interaction.editReply({ content });
+  // Neither is the member's doing: the use goes back.
+  if (outcome.kind === 'no-post' || outcome.kind === 'ended') {
+    throw new UserError(content, { givesBack: true, said: true });
+  }
+}
+
+export const max: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('max')
+    .setDescription('Report a max battle at a power spot')
+    .addStringOption((option) =>
+      option
+        .setName('boss')
+        .setDescription('The boss: pick from the list, or type a Pokémon in full')
+        .setRequired(true)
+        .setMaxLength(100)
+        .setAutocomplete(true),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('spot')
+        .setDescription('The power spot: pick from the list, or paste a maps link or coordinates')
+        .setRequired(true)
+        .setMaxLength(1_500)
+        .setAutocomplete(true),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('tier')
+        .setDescription('Only for a boss on no list: its tier')
+        .addChoices(...TIER_CHOICES),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('end')
+        .setDescription('When it ends, if not the end of its rotation: 20 (minutes) or 2:30pm')
+        .setMaxLength(40),
+    ),
+  help: {
+    category: 'raid-crud',
+    details:
+      "Creates a post for a max battle in the raid forum of the spot's region. Pick the boss and " +
+      'the power spot from the lists that appear while you type (the bosses of an event that is ' +
+      'on come first); a Pokémon that can Dynamax may be typed in full, with `tier` when it is on ' +
+      'no list. A spot Pine does not know can be given as a maps link or coordinates: it becomes ' +
+      'an unlisted power spot. A battle lasts until the end of its rotation (the next half hour ' +
+      'in a short event, the next hour all day and for Gigantamax), otherwise until the last ' +
+      'battle of the day, or the start of a max event later that day; `end` sets another. If the spot already has a battle of that boss, you ' +
+      'are shown its post instead; one ending within five minutes is asked about first.',
+    examples: [
+      '/max boss:machamp spot:Gazebo',
+      '/max boss:gigantamax machamp spot:40.4406, -79.9959 end:20',
+    ],
+  },
+  guards: [requireRegion, requireMaxReport],
+  defer: (interaction) => (asked.get(interaction)?.asks ? undefined : 'ephemeral'),
+  throttle: MAX_THROTTLE,
+
+  async execute(interaction, ctx) {
+    const ask = asked.get(interaction);
+    if (!ask) throw new UserError('Use `/max` again.');
+    if (!ask.asks) {
+      await report(interaction, ctx, ask);
+      return;
+    }
+    const now = Date.now();
+    // Nothing is read for the dialog, but the guard's reads must have left Discord's three
+    // seconds for it (the slow-read rule): past them no dialog opens.
+    await readInTime(ctx.log, interaction, () => Promise.resolve());
+    const next = nextRotationEnd(ask.end, maxEndInput(ctx, ask.boss.tier, now));
+    const token = pending.put(interaction.user.id, {
+      ...ask,
+      countedAt: whenCounted(interaction) ?? now,
+      ...(next === undefined ? {} : { next }),
+    });
+    const { settings } = ctx.config;
+    await interaction.showModal(
+      endingSoonDialog({
+        customId: encodeCustomId({ kind: MAX_KIND, id: token, action: 'report', args: [] }),
+        end: ask.end,
+        next,
+        now,
+        zone: settings.timezone,
+      }),
+    );
+  },
+
+  async autocomplete(interaction, ctx) {
+    const focused = interaction.options.getFocused(true);
+    if (focused.name === 'boss') {
+      await interaction.respond(maxBossOptions(ctx, focused.value, Date.now()));
+      return;
+    }
+    if (focused.name === 'spot' && !isPinText(focused.value)) {
+      await interaction.respond(await nearChoices(interaction, ctx, focused.value, ['powerspot']));
+      return;
+    }
+    await interaction.respond([]);
+  },
+};
+
+/**
+ * The Submit of the ending-soon dialog (`max:<token>:report`): acknowledged privately, the
+ * report decided again as things are then (another boss at the spot, a forum the member is kept
+ * out of, the end chosen passed: refused), then made as `/max` makes it. It goes on with the use
+ * `/max` counted (`carriesOn`): a post not made gives it back there.
+ */
+export const maxControls: ComponentHandler = {
+  kind: MAX_KIND,
+  // A command's guards do not cover its controls: a Submit is of a server too (review B, B5).
+  guards: [requireGuild],
+  carriesOn: (interaction, id) => {
+    const waiting = pending.peek(id.id, interaction.user.id);
+    return typeof waiting === 'object' && waiting.value.countedAt !== undefined
+      ? { ...MAX_THROTTLE, as: MAX_COMMAND, countedAt: waiting.value.countedAt }
+      : undefined;
+  },
+
+  async modal(interaction, id, ctx) {
+    if (id.action !== 'report') throw new UserError('That question has expired. Use `/max` again.');
+    const taken = pending.take(id.id, interaction.user.id);
+    if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
+    if (taken === 'expired') throw new UserError('That question has expired. Use `/max` again.');
+    const ask = taken.value;
+    const choice = pickedOf(interaction, MAX_END_INPUT, [NEXT_ROTATION, ENDING_SOON] as const);
+    // A dialog that offered a choice and comes back without one is none Pine showed (B5).
+    if (ask.next !== undefined && choice === undefined) throw new UserError(STALE_COMPONENT);
+    await deferSubmit(interaction);
+    const now = Date.now();
+    const end = choice === NEXT_ROTATION && ask.next !== undefined ? ask.next : ask.end;
+    if (end <= now) throw new UserError('That battle has ended meanwhile: nothing was reported.');
+    const there = battleThere(ctx, ask, now);
+    if (there && otherBoss(there, ask.boss)) {
+      throw new UserError(takenWords(ctx, there, ask.boss.tier));
+    }
+    const decided: MaxAsk = { ...ask, end, joins: there };
+    if (await maxBarred(ctx, decided, interaction.user.id)) throw new UserError(MAX_BARRED);
+    await report(interaction, ctx, decided);
+  },
+};
diff --git a/src/commands/parties/delete.ts b/src/commands/parties/delete.ts
index fd4923f848e09b5cbe383371d590f3f679061072..96857848b8137867c349ecdae6e4d2a7455316b4 100644
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -33,17 +33,25 @@ export const CLOSE_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };
 export function closedWords(party: Pick<Party, 'type'>, removal: PostRemoval): string {
   const post =
     removal === 'delete' ? 'I am deleting its post.' : 'I am archiving and locking its post.';
-  return party.type === 'raid'
-    ? `This raid is closed: its gym is free for a new report, and ${post}`
-    : `This ${partyWord(party)} is closed: ${post}`;
+  if (party.type === 'raid')
+    return `This raid is closed: its gym is free for a new report, and ${post}`;
+  // A max battle frees its spot as a raid frees its gym (plan 8X-3).
+  if (party.type === 'max') {
+    return `This max battle is closed: its spot is free for a new report, and ${post}`;
+  }
+  return `This ${partyWord(party)} is closed: ${post}`;
 }
 
 /** What a moderator is told whose Delete post Discord refused: the post is archived instead. */
 export function refusedDeletion(party: Pick<Party, 'type'>): string {
   const archived = 'its post is archived: Discord refused to delete it; delete it yourself.';
-  return party.type === 'raid'
-    ? `This raid is closed: its gym is free for a new report, and ${archived}`
-    : `This ${partyWord(party)} is closed, and ${archived}`;
+  if (party.type === 'raid') {
+    return `This raid is closed: its gym is free for a new report, and ${archived}`;
+  }
+  if (party.type === 'max') {
+    return `This max battle is closed: its spot is free for a new report, and ${archived}`;
+  }
+  return `This ${partyWord(party)} is closed, and ${archived}`;
 }
 
 /** What a moderator is told who chose to delete a post the bot may not delete. */
diff --git a/src/commands/parties/meet-dialog.ts b/src/commands/parties/meet-dialog.ts
index 9e8b423b45a826935f0472a040475d898d20c8e2..2dd415b0ce7288e5795fb23d189e0ee99ffb3ebf 100644
--- a/src/commands/parties/meet-dialog.ts
+++ b/src/commands/parties/meet-dialog.ts
@@ -6,12 +6,15 @@ import { UserError } from '../../discord/errors.js';
 import { requireGuild } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { meetTimes } from '../../domain/party/meet-times.js';
+import { maxEnded } from '../../domain/party/max.js';
 import {
   attendeeOf,
+  isBattle,
   isGroupId,
   isRaid,
+  partyWord,
+  type BattleParty,
   type Party,
-  type RaidParty,
 } from '../../domain/party/party.js';
 import { raidStage } from '../../domain/party/raid.js';
 import { problemText } from '../../render/activity.js';
@@ -39,9 +42,12 @@ import { actingMember, outcomeWords, partyOver } from './reply.js';
 /** Said at a press for a raid without times (Set time shows in Meet…'s place then). */
 export const NO_TIMES = 'This raid has no times yet: Set time gives them.';
 
-/** Said when no time to meet is left before the raid ends. */
+/** Said when no time to meet is left before the raid (or max battle) ends. */
 export const NO_TIME_LEFT = 'There is no time left to meet before this raid ends.';
 
+/** The same of a max battle (plan 8X-3). */
+export const NO_TIME_LEFT_MAX = 'There is no time left to meet before this max battle ends.';
+
 /**
  * Why this member may not set a meeting time of this party now (the rules of `/meet`), or the
  * raid: a party that ended (as a raid's), one that is no raid, a member not signed up, a raid
@@ -52,11 +58,17 @@ function refusalOf(
   party: Party | undefined,
   memberId: string,
   now: number,
-): string | RaidParty {
-  if (!party) return partyOver({ type: 'raid' });
-  if (!isRaid(party)) return STALE_COMPONENT;
+): string | BattleParty {
+  // Gone, it may have been a raid or a max battle: spoken of without a kind (review B6).
+  if (!party) return partyOver();
+  // A raid's, and a max battle's (plan 8X-3; design Q10): every battle has Meet….
+  if (!isBattle(party)) return STALE_COMPONENT;
   if (!attendeeOf(party, memberId)) {
-    return problemText('not-attending', ctx.attendance.limits(), 'raid');
+    return problemText('not-attending', ctx.attendance.limits(), partyWord(party));
+  }
+  if (!isRaid(party)) {
+    if (maxEnded(party, now)) return partyOver(party);
+    return meetTimes(party, now).length === 0 ? NO_TIME_LEFT_MAX : party;
   }
   if (party.hatchTime === null) return NO_TIMES;
   if (raidStage(party, now) === 'ended') return RAID_IS_OVER;
diff --git a/src/commands/parties/meet.ts b/src/commands/parties/meet.ts
index b32f7bd9a148f7c7e8f57128ec27d217f2e7c987..7bb9d2e7f38672bc95375fcc68afb111651f7b49 100644
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -4,6 +4,7 @@ import { UserError } from '../../discord/errors.js';
 import { notARaid, partyOf, requireParty } from '../../discord/guards.js';
 import {
   groupOf,
+  isMax,
   isRaid,
   isTimed,
   mayArrange,
@@ -16,6 +17,7 @@ import { problemText } from '../../render/activity.js';
 import { groupWords } from '../../render/party-controls.js';
 import { timestamp } from '../../render/text.js';
 import { typedPartyTime } from '../raids/raid-input.js';
+import { typedMaxTime } from '../max/max-input.js';
 import { variedThrottleKey } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { actingMember, answerOutcome, commandParty } from './reply.js';
@@ -69,12 +71,14 @@ const requireStartChange: Guard = (interaction, ctx) => {
 export const meet: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('meet')
-    .setDescription('Set when your group meets for this raid, or when this train or meetup starts')
+    .setDescription(
+      'Set when your group meets for this raid or max battle, or when this train or meetup starts',
+    )
     .addStringOption((option) =>
       option
         .setName('time')
         .setDescription(
-          'Raid: 20 (minutes), 6:15pm or "hatch". Train or meetup: 6:15pm, 10-17 6:15pm, in 30',
+          'Raid: 20 (minutes), 6:15pm, "hatch"; max battle: 20, 6:15pm. Train, meetup: 6:15pm, in 30',
         )
         .setRequired(true)
         .setMaxLength(40),
@@ -86,7 +90,10 @@ export const meet: SimpleCommand = {
       'others of the group. The time must lie between now (or the hatch) and the end of the ' +
       'raid; `hatch` means the hatch time, `cancel` removes the meeting time (on the post, the ' +
       "button with the game's Select Time icon offers the in-game RSVP times). A while after it, " +
-      'those who are here are asked whether they are done. In the post of a train or meetup: sets when ' +
+      'those who are here are asked whether they are done. In the post of a max battle: the same, ' +
+      'but the time lies between now and the end of the battle, which has no hatch (no `hatch`; ' +
+      'the button offers the five-minute times of the next hour). In the post of a train or ' +
+      'meetup: sets when ' +
       'it starts, for everybody, and tells the others who are signed up. Give a clock ' +
       'time, a date and a time, or `in 30` for minutes from now (a bare number is an hour ' +
       'there); `cancel` removes the start. A time without a date is read on the day the party ' +
@@ -105,9 +112,13 @@ export const meet: SimpleCommand = {
       await changeStart(interaction, ctx, party, start === 'unset' ? null : start.at);
       return;
     }
-    // A max battle's meeting time is read from its own times in plan 8X-3's /max task.
-    if (!isRaid(party)) throw new UserError(notARaid(party));
-    const typed = typedPartyTime(ctx, party, 'meet', text, Date.now());
+    // A max battle's meeting time lies between now and its end (plan 8X-3).
+    const typed = isMax(party)
+      ? typedMaxTime(ctx, 'meet', text, Date.now(), party)
+      : isRaid(party)
+        ? typedPartyTime(ctx, party, 'meet', text, Date.now())
+        : undefined;
+    if (typed === undefined) throw new UserError(notARaid(party));
     const outcome = await ctx.attendance.setMeetingTime(
       party.id,
       actingMember(interaction),
diff --git a/src/commands/parties/reply.ts b/src/commands/parties/reply.ts
index 2da25e2a016fd64c721c4c5c8aff89c8108686d6..88b98767a4f25722dc3dc8a7543672faad13d260 100644
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -216,8 +216,9 @@ export async function answerClick<Extra>(
   words?: (ok: Ok<Extra>) => string | undefined,
 ): Promise<void> {
   // A control names its party by id only. A party that refused is still there to be asked its
-  // kind; one that has ended is not. What only the post of a raid has (Done, the groups, the
-  // answers to the completion question) was a raid's; of anything else the kind is not known.
+  // kind; one that has ended is not. What only the post of a raid has (Set time, Screenshot
+  // feedback: `isRaidAction`) was a raid's; of anything else the kind is not known (Done and the
+  // completion question's answers are a max battle's too).
   const action = decodeCustomId(interaction.customId)?.action;
   const party =
     ctx.parties.get(partyId) ??
diff --git a/src/commands/parties/status.ts b/src/commands/parties/status.ts
index efb6e69ee46f1184cd90eb1d897def856e5334be..7a0d6ede5ba4b5b60c23cf7539cb5e179bc6d411 100644
--- a/src/commands/parties/status.ts
+++ b/src/commands/parties/status.ts
@@ -9,7 +9,8 @@ import {
   requireRaidOrTrain,
 } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { isMeetup, isTrain, partyWord } from '../../domain/party/party.js';
+import { maxSpotName, UNLISTED_SPOT } from '../../domain/party/max.js';
+import { isMax, isMeetup, isTrain, partyWord } from '../../domain/party/party.js';
 import { currentStop } from '../../domain/party/train.js';
 import { problemText } from '../../render/activity.js';
 import { gymMapsUrl } from '../../render/raid-post.js';
@@ -83,12 +84,15 @@ const requireGym: Guard = (interaction, ctx) => {
 export const where: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('where')
-    .setDescription('Show where the gym of this raid is, or the stop this train is at'),
+    .setDescription(
+      'Show where the gym of this raid is, the spot of this max battle, or the stop of this train',
+    ),
   help: {
     category: 'basic-raid',
     details:
       'Shows you a link to the gym in Google Maps and a map of its surroundings: the gym of a ' +
-      'raid, or the stop a train is at. Use it in the post of the raid or train.',
+      'raid, or the stop a train is at; in the post of a max battle, its power spot with a link ' +
+      'to it. Use it in the post of the raid, max battle or train.',
     examples: ['/where'],
   },
   guards: [requireGym],
@@ -99,6 +103,19 @@ export const where: SimpleCommand = {
     if (isMeetup(party)) {
       throw new UserError(`A ${partyWord(party)} is at no gym, so there is no place to show.`);
     }
+    if (isMax(party)) {
+      // A max battle's spot (plan 8X-3): its name and Map; no map picture of a gym. A pin is no
+      // power spot Pine knows (review B, B11): its name alone says so.
+      const { spot } = party.max;
+      const name =
+        spot.kind === 'pin'
+          ? `📍 **${UNLISTED_SPOT}**`
+          : `**${plain(maxSpotName(spot))}** (power spot)`;
+      await interaction.editReply({
+        content: `${name}\n[Open in Google Maps](<${gymMapsUrl(spot)}>)`,
+      });
+      return;
+    }
     let gymId: number | null | undefined;
     if (isTrain(party)) {
       // The gym of a train is the stop it is at; before its route and after it, it is at none.
diff --git a/src/commands/raids/boss.ts b/src/commands/raids/boss.ts
index af90314e17c60a86d8c7c565ba915c6a5ee604bc..dc14a32604a4644d7f899468d274051a9e4e6274 100644
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -14,8 +14,17 @@ import {
   requireRaid,
   requireRaidOrTrain,
 } from '../../discord/guards.js';
-import { isRaid, isTrain, type RaidBossRef, type TrainParty } from '../../domain/party/party.js';
+import {
+  isMax,
+  isRaid,
+  isTrain,
+  type RaidBossRef,
+  type TrainParty,
+} from '../../domain/party/party.js';
+import { changeMaxBoss } from '../max/max-changes.js';
+import { maxBossOptions } from '../max/max-input.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import { battleKindOf } from '../../domain/pogo/max-tier.js';
 import { problemText } from '../../render/activity.js';
 import { truncate } from '../../render/text.js';
 import { MAX_CHOICES } from '../choices.js';
@@ -70,12 +79,12 @@ export const boss: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('boss')
     .setDescription(
-      'Set the boss of this raid or the tier of its egg, or the boss a train is after',
+      'Set the boss of this raid or max battle, the tier of an egg, or the boss a train is after',
     )
     .addStringOption((option) =>
       option
         .setName('pokemon')
-        .setDescription('The boss, or the tier of an egg: pick from the list')
+        .setDescription("The boss, or the tier of a raid's egg: pick from the list")
         .setRequired(true)
         .setMaxLength(100)
         .setAutocomplete(true),
@@ -88,7 +97,9 @@ export const boss: SimpleCommand = {
       `one charged move gets it set. ${IN_A_RAID_POST} In the post of a train: says which ` +
       'Pokémon the train is after, which the post then shows with its weaknesses and catch ' +
       'CP. It may be any Pokémon, also one that is no boss right now; a train has no tier, ' +
-      'and `none` takes the boss off again.',
+      'and `none` takes the boss off again. In the post of a max battle: the boss of the ' +
+      'rotation, picked from the max bosses (its tier follows it); a Dynamax battle cannot ' +
+      'become a Gigantamax one, nor the other way round.',
     examples: ['/boss pokemon:yveltal', '/boss pokemon:t3'],
   },
   guards: [requireRaidOrTrain],
@@ -100,6 +111,10 @@ export const boss: SimpleCommand = {
       await setTrainBoss(interaction, ctx, here, text);
       return;
     }
+    if (isMax(here)) {
+      await changeMaxBoss(interaction, ctx, here, text);
+      return;
+    }
     if (!isRaid(here)) throw new UserError(notARaidOrTrain(here));
     await replyRaidChange(
       interaction,
@@ -111,7 +126,11 @@ export const boss: SimpleCommand = {
     // A train has no tier: its list has no eggs, and any Pokémon after the current bosses.
     const here = partyOf(interaction, ctx);
     await interaction.respond(
-      here && isTrain(here) ? trainBossChoices(ctx, typed) : bossChoices(ctx, typed),
+      here && isTrain(here)
+        ? trainBossChoices(ctx, typed)
+        : here && isMax(here)
+          ? maxBossOptions(ctx, typed, Date.now(), battleKindOf(here.max.tier))
+          : bossChoices(ctx, typed),
     );
   },
 };
diff --git a/src/commands/raids/change.ts b/src/commands/raids/change.ts
index 397c38b7c10565a0383cfda85bcf005f60a517b1..bc80ff86a902acd3ff3c236e43e6e1f798c7bf62 100644
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -11,7 +11,8 @@ import { UserError } from '../../discord/errors.js';
 import { notARaid, requireParty, requireRaid } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { isRaid, isTimed, type RaidParty } from '../../domain/party/party.js';
+import { isMax, isRaid, isTimed, type RaidParty } from '../../domain/party/party.js';
+import { changeMaxEnd } from '../max/max-changes.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
 import { commandParty, commandRaid } from '../parties/reply.js';
@@ -122,7 +123,7 @@ export const hatch: SimpleCommand = {
 export const end: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('end')
-    .setDescription('Set when this raid, train or meetup ends')
+    .setDescription('Set when this raid, max battle, train or meetup ends')
     .addStringOption((o) =>
       o
         .setName('time')
@@ -136,7 +137,8 @@ export const end: SimpleCommand = {
     category: 'raid-crud',
     details:
       'In the post of a raid: sets the end time; the hatch time follows from it. Give the ' +
-      'minutes that are left or a clock time. In the post of a train or meetup: sets when it ends. Give ' +
+      'minutes that are left or a clock time. In the post of a max battle: sets when it ends, ' +
+      'within its day and never after the last battle time. In the post of a train or meetup: sets when it ends. Give ' +
       'a clock time, a date and a time, or `in 90` for minutes from now (a bare number is an ' +
       'hour there); `none` removes the end. A time without a date is read on the day the ' +
       'party starts, or else the day it ends, while that day is still to come, and otherwise ' +
@@ -151,7 +153,8 @@ export const end: SimpleCommand = {
     const party = commandParty(interaction, ctx);
     const text = interaction.options.getString('time', true);
     if (isTimed(party)) await changeEnd(interaction, ctx, party, text);
-    // A max battle's end is changed in plan 8X-3's /max task.
+    // A max battle's end, within its day (plan 8X-3).
+    else if (isMax(party)) await changeMaxEnd(interaction, ctx, party, text);
     else if (!isRaid(party)) throw new UserError(notARaid(party));
     else await changeTime(interaction, ctx, party, 'end', text);
   },
diff --git a/src/components/index.ts b/src/components/index.ts
index e233296792783b05c594bf34755057a55571c7f0..c9d695fe861a410de11b98e401fcb126245d9cf0 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -30,10 +30,12 @@ import { reportDecisionControls } from './moderation-reports.js';
 import { scriptAccessControls } from './script-access.js';
 import { partyButtons } from './party.js';
 import { meetControls } from '../commands/parties/meet-dialog.js';
+import { maxControls } from '../commands/max/max.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
 export const components: readonly ComponentHandler[] = [
   raidControls,
+  maxControls,
   locationControls,
   infoControls,
   meetupFormControls,
diff --git a/src/components/party.test.ts b/src/components/party.test.ts
index 8538c7baba8100fa990a8e584ff3898fd2356b05..a014fd775a17a86d5aa6e01459554bf594aef8db 100644
--- a/src/components/party.test.ts
+++ b/src/components/party.test.ts
@@ -204,13 +204,14 @@ describe('the buttons of a party post', () => {
     await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
     const click = await made.click('join');
     // The party has left the store, and a control names it by its id alone: what kind it was
-    // is no longer known, unless only a raid has such a control.
+    // is no longer known, unless only a raid has such a control (Set time, Screenshot feedback).
     expect(click.reply).toHaveBeenCalledWith(privately('This has ended.'));
     // A group button is no longer among them: a train has groups too.
     expect((await made.click('group:A')).reply).toHaveBeenCalledWith(privately('This has ended.'));
+    // Done and the completion question's answers are a max battle's too (plan 8X-3, review B6).
     for (const action of ['done', 'answer:yes']) {
-      const raidOnly = await made.click(action);
-      expect(raidOnly.reply).toHaveBeenCalledWith(privately('This raid is over.'));
+      const battles = await made.click(action);
+      expect(battles.reply).toHaveBeenCalledWith(privately('This has ended.'));
     }
   });
 
diff --git a/src/domain/party/meet-times.ts b/src/domain/party/meet-times.ts
index 84875a01ecd225ca8760900fb29e592fcbc81953..227517cc45fcbeaa9b10a570bbd0e9eab5299dcb 100644
--- a/src/domain/party/meet-times.ts
+++ b/src/domain/party/meet-times.ts
@@ -35,8 +35,12 @@ const GRID_AHEAD_MINUTES = 60;
  */
 export const MAX_MEET_TIMES = 24;
 
-/** What Meet… is drawn from of a raid: its times. */
+/**
+ * What Meet… is drawn from of a battle: its kind and its times. A max battle (plan 8X-3, design
+ * Q10) has no in-game RSVP times: it is offered the round clock times of the next hour alone.
+ */
 export interface MeetRaid {
+  type?: string;
   hatchTime: number | null;
   endTime: number | null;
 }
@@ -47,7 +51,7 @@ export interface MeetRaid {
  */
 export function rsvpTimes(raid: MeetRaid): number[] {
   const { hatchTime, endTime } = raid;
-  if (hatchTime === null || endTime === null) return [];
+  if (raid.type === 'max' || hatchTime === null || endTime === null) return [];
   const times: number[] = [];
   for (let time = hatchTime; time < endTime; time += RSVP_STEP_MINUTES * MINUTE) times.push(time);
   return times;
@@ -67,10 +71,13 @@ export interface MeetTime {
  * and before the end; with `set`, the group's meeting time where it is still to come, also off
  * that grid (one set through `/meet`). At most `MAX_MEET_TIMES`: the latest round clock times go
  * first, then, where even the RSVP times are too many (a long raid), the latest of them; never
- * the one set. Empty for a raid without times or with no time left.
+ * the one set. Empty for a raid without times or with no time left. A max battle (`type` max) has
+ * the round clock times alone, up to its end (design Q10).
  */
 export function meetTimes(raid: MeetRaid, now: number, set?: number): MeetTime[] {
-  const { hatchTime, endTime } = raid;
+  const { endTime } = raid;
+  // A max battle is on from when it is reported: there is no hatch to wait for.
+  const hatchTime = raid.type === 'max' ? -Infinity : raid.hatchTime;
   if (hatchTime === null || endTime === null) return [];
   const fits = (time: number): boolean => time > now && time >= hatchTime && time < endTime;
   const rsvp = rsvpTimes(raid).filter(fits);
diff --git a/src/domain/time/max-end.test.ts b/src/domain/time/max-end.test.ts
index 6b55de6e4683d35356db5eb97af9fbd025296d7b..f97f454efbfe14528c24278ceb9e3982a188ea24 100644
--- a/src/domain/time/max-end.test.ts
+++ b/src/domain/time/max-end.test.ts
@@ -135,4 +135,16 @@ describe('nextRotationEnd: one rotation later (the ending-soon dialog)', () => {
       nextRotationEnd(at('2026-10-22T21:00'), input('D2', at('2026-10-22T20:57'))),
     ).toBeUndefined();
   });
+
+  // Review B, B12 (Claude's call): the rule as things are at the end, not at the report.
+  it('is the rule at the end: none for a Dynamax battle past its event, an hour for Gigantamax', () => {
+    // The lake trio's Max Battle Day ends at 17:00: a Dynamax battle has no rotation after it.
+    expect(
+      nextRotationEnd(at('2026-10-24T17:00'), input('D5', at('2026-10-24T16:57'))),
+    ).toBeUndefined();
+    // A Gigantamax battle outside events rotates every hour.
+    expect(nextRotationEnd(at('2026-10-24T17:00'), input('G', at('2026-10-24T16:57')))).toBe(
+      at('2026-10-24T18:00'),
+    );
+  });
 });
diff --git a/src/domain/time/max-end.ts b/src/domain/time/max-end.ts
index 2b5b2c74bce9fa7a71d8ff09d461045c4f0170a9..97d7127758d1dfacc3860e624e7abd85902b1964 100644
--- a/src/domain/time/max-end.ts
+++ b/src/domain/time/max-end.ts
@@ -8,6 +8,18 @@ import { bigEventAt, maxEventAt, type BigEvent, type MaxEvent } from './max-even
  * egg), so its default end is the boundary of the rotation it is in, never a span from the report.
  */
 
+/**
+ * A max battle whose end is less than this many minutes away is asked about before `/max` makes
+ * it (Matt, 2026-10-21: the ending-soon dialog); joining one at the spot asks nothing. The one
+ * place to change it.
+ */
+export const ENDING_SOON_MINUTES = 5;
+
+/** Whether a new max battle's end is so near that `/max` asks first (`ENDING_SOON_MINUTES`). */
+export function endsSoon(end: number, now: number): boolean {
+  return end - now < ENDING_SOON_MINUTES * 60_000;
+}
+
 /** The hours of the day max battles can be fought (`settings.maxBattles`), `HH:MM` in the zone. */
 export interface BattleHours {
   firstBattle: string;
@@ -119,11 +131,13 @@ export function defaultMaxEnd(
 
 /**
  * The end one rotation after `end` (the ending-soon dialog of `/max`: "Until the next rotation"):
- * the next boundary after `end` by the rule at the report (`maxRotation`), capped at the last
- * battle time; undefined where there is none later (the cap, or a battle that lasts the day).
+ * the next boundary after `end` by the rule as things are at `end` (`maxRotation`; review B, B12:
+ * a Dynamax battle at the last boundary of its event has none after it, a Gigantamax one then
+ * rotates as outside events), capped at the last battle time; undefined where there is none later
+ * (the cap, or a battle that would then last the day).
  */
 export function nextRotationEnd(end: number, input: MaxEndInput): number | undefined {
-  const rotation = maxRotation(input);
+  const rotation = maxRotation({ ...input, at: end });
   if (rotation === 'day') return undefined;
   const next = Math.min(
     boundaryAfter(end, rotation, input.zone),
diff --git a/src/render/group-dialogs.ts b/src/render/group-dialogs.ts
index 1b738a7e4e89c261e6f631cd854ed581d7436323..3330004d40b9d05d5854e2538edcd2602b22978a 100644
--- a/src/render/group-dialogs.ts
+++ b/src/render/group-dialogs.ts
@@ -14,7 +14,7 @@ import {
   groupStamp,
   headCount,
   isGroupId,
-  isRaid,
+  isBattle,
   lobbyCount,
   partyWord,
   type GroupId,
@@ -101,7 +101,7 @@ export function groupDescription(view: GroupDialogView, group: PartyGroup): stri
       : someone
         ? count(headCount(party, group.id), 'trainer')
         : 'Nobody yet';
-  if (!isRaid(party)) return size;
+  if (!isBattle(party)) return size;
   const meeting =
     group.startTime === undefined
       ? 'no meeting time yet'
diff --git a/src/render/max-dialog.ts b/src/render/max-dialog.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1f9b4f817ab89563eb7dc4ff523f01aa0f6b2ccc
--- /dev/null
+++ b/src/render/max-dialog.ts
@@ -0,0 +1,61 @@
+import type { APIModalInteractionResponseCallbackData } from 'discord.js';
+import { dialog } from '../discord/dialog.js';
+import { clockText, count } from './text.js';
+
+/*
+ * The ending-soon question of `/max` (plan 8X-3; Matt, 2026-10-21): a max battle whose end is less
+ * than `ENDING_SOON_MINUTES` away is asked about before it is made, in a dialog: until the next
+ * rotation (one rotation later, first and picked: Android picks the first by itself) or until the
+ * end about to pass; where no later rotation is left (the last battle time), only whether to
+ * report it. Discord's Submit reports, its Cancel makes nothing.
+ */
+
+/** The custom-id kind of `/max`'s controls (its dialog's Submit). */
+export const MAX_KIND = 'max';
+/** The radio group of the ending-soon dialog, and its values. */
+export const MAX_END_INPUT = 'end';
+export const NEXT_ROTATION = 'next';
+export const ENDING_SOON = 'soon';
+
+/** `in 1 minute`, `in 4 minutes`: how far off an end is, to the minute (at least one). */
+function inMinutes(end: number, now: number): string {
+  return `in ${count(Math.max(1, Math.round((end - now) / 60_000)), 'minute')}`;
+}
+
+/**
+ * The dialog asked before a max battle that ends soon is reported (`customId` carries the
+ * report): with `next`, a choice of that end ("Until the next rotation, 3:00 PM", first and
+ * picked) or the one about to pass ("Until 2:30 PM (in 1 minute)"); without, the plain question.
+ */
+export function endingSoonDialog(input: {
+  customId: string;
+  end: number;
+  next: number | undefined;
+  now: number;
+  zone: string;
+}): APIModalInteractionResponseCallbackData {
+  const { customId, end, next, now, zone } = input;
+  const at = clockText(end, zone);
+  const question = `This max battle ends at ${at}, ${inMinutes(end, now)}.`;
+  if (next === undefined) {
+    return dialog({
+      customId,
+      title: 'Report a max battle',
+      text: `${question} Report it anyway?\n\nSubmit reports it.`,
+    });
+  }
+  return dialog({
+    customId,
+    title: 'Report a max battle',
+    text: `${question} Report it until the next rotation?`,
+    choice: {
+      id: MAX_END_INPUT,
+      label: 'Until when?',
+      picked: NEXT_ROTATION,
+      options: [
+        { value: NEXT_ROTATION, label: `Until the next rotation, ${clockText(next, zone)}` },
+        { value: ENDING_SOON, label: `Until ${at} (${inMinutes(end, now)})` },
+      ],
+    },
+  });
+}
diff --git a/src/render/max-post.ts b/src/render/max-post.ts
index 724214113e09ab19fb34430fa2d81c88e7c2a4cf..7338a1c96b3bcf367144ed4fda43eba745b216c2 100644
--- a/src/render/max-post.ts
+++ b/src/render/max-post.ts
@@ -221,7 +221,8 @@ function maxLayout(view: MaxPostView): PostLayout {
       { type: 'separator' },
       maxWhere(view, fit),
       { type: 'separator' },
-      ...trainerBlocks(view, { complete: true, lobby: true, meetHint: false }, fit),
+      // The hint names Meet…, which a max battle has while it is on.
+      ...trainerBlocks(view, { complete: true, lobby: true, meetHint: !shownOver(view) }, fit),
       { type: 'separator' },
       { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
       ...(party.anonymous
diff --git a/src/render/meet-dialog.ts b/src/render/meet-dialog.ts
index 20fd5bd801fdfd9794deb912ee8355a4f21a032b..ae82262a212e1fae097082b0b2b55356bc75bc77 100644
--- a/src/render/meet-dialog.ts
+++ b/src/render/meet-dialog.ts
@@ -2,7 +2,7 @@ import type { APIModalInteractionResponseCallbackData } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import { dialog, type DialogOption } from '../discord/dialog.js';
 import { meetTimes, type MeetTime } from '../domain/party/meet-times.js';
-import { groupOf, groupStamp, type GroupId, type RaidParty } from '../domain/party/party.js';
+import { groupOf, groupStamp, type BattleParty, type GroupId } from '../domain/party/party.js';
 import { clockText } from './text.js';
 
 /*
@@ -28,7 +28,7 @@ export const NO_MEETING = 'none';
 
 /** What Meet…'s dialog is drawn from. */
 export interface MeetDialogView {
-  party: RaidParty;
+  party: BattleParty;
   /** The member's own group. */
   groupId: GroupId;
   /** The settings' time zone: the choices name clock times. */
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 23a18e929dd9e48a3d9bd97ac700bcd6ef830c62..5b61db977586e939ef04ea274172791f02111086 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -238,7 +238,10 @@ describe('the controls of a post (plan 8X-1B: one layout for one group and sever
     // The letter Join of a post drawn before plan 8X-1B still works: a train has groups too.
     expect(isPartyAction('group')).toBe(true);
     expect(isRaidAction('group')).toBe(false);
-    expect(isRaidAction('meet')).toBe(true);
+    // Set time and Screenshot feedback only: Done, its answers and Meet… are a max battle's too.
+    expect(isRaidAction('time')).toBe(true);
+    expect(isRaidAction('shot')).toBe(true);
+    for (const battles of ['done', 'answer', 'meet']) expect(isRaidAction(battles)).toBe(false);
     expect(isRaidAction('regroup')).toBe(false);
   });
 });
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index fa277bdda7c95a4d628d5dba665314a5a7a34269..594964f00437a938004d46c88c06b45f877a981c 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -71,9 +71,10 @@ export function isPartyAction(value: string): value is PartyAction {
 
 /**
  * The actions that only the controls of a raid have: no other post shows them. A group button
- * is not among them: a train has groups too.
+ * is not among them: a train has groups too; nor are Done, the completion question's answers and
+ * Meet…: a max battle has them too (plan 8X-3, review B6).
  */
-const RAID_ACTIONS: readonly PartyAction[] = ['done', 'answer', 'time', 'shot', 'meet'];
+const RAID_ACTIONS: readonly PartyAction[] = ['time', 'shot'];
 
 /** Whether a control with this action can only have been a raid's. */
 export function isRaidAction(value: string): boolean {
@@ -327,8 +328,10 @@ export function bottomControls(party: Party, options: BottomOptions): PostButton
     ),
   ];
   const counts: PostButton[] = [
-    // A meeting time needs the raid's times (`/meet`'s rule).
-    ...(raid && raid.hatchTime !== null ? [meetButton(party, emoji)] : []),
+    // A meeting time needs the raid's times (`/meet`'s rule); a max battle always has its end.
+    ...((raid && raid.hatchTime !== null) || party.type === 'max'
+      ? [meetButton(party, emoji)]
+      : []),
     { button: partyButton(id, 'less', undefined, ButtonStyle.Secondary, undefined, '⬇️') },
     { button: partyButton(id, 'more', undefined, ButtonStyle.Secondary, undefined, '⬆️') },
     ...(remoteAllowed(party)
@@ -380,6 +383,8 @@ export function completionQuestion(
   partyId: string,
   members: readonly string[],
   timeoutMinutes: number,
+  /** What the party is called (`partyWord`): a raid, or a max battle (plan 8X-3). */
+  word = 'raid',
 ): { content: string; components: Row[] } {
   const minutes = timeoutMinutes === 1 ? '1 minute' : `${timeoutMinutes} minutes`;
   const names = fitItems(
@@ -388,7 +393,7 @@ export function completionQuestion(
   );
   return {
     content:
-      `${names}: have you completed this raid? ` +
+      `${names}: have you completed this ${word}? ` +
       `Without an answer within ${minutes} I will take it that you have.`,
     components: [
       {
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index 3a496386304e12132e595a34d0fef69401df690a..d1b21dd530ee64f38f524ad2bb1386f2cfb3bbca 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -600,7 +600,12 @@ export class AttendanceService {
     const { gateway, store, settings } = this.options;
     const postId = party.forumPostId;
     if (postId === null || members.length === 0) return;
-    const question = completionQuestion(party.id, members, settings.raidCompleteTimeout);
+    const question = completionQuestion(
+      party.id,
+      members,
+      settings.raidCompleteTimeout,
+      partyWord(party),
+    );
     let messageId: string | undefined;
     try {
       const users = await this.pingable(members, () => true);
diff --git a/src/services/max-change-service.test.ts b/src/services/max-change-service.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..22420cd78d66a056febd5f66434222642fbeba76
--- /dev/null
+++ b/src/services/max-change-service.test.ts
@@ -0,0 +1,74 @@
+import { describe, expect, it } from 'vitest';
+import { at, PARTY_NOW, REPORTER, TEST_SPOT, testMax } from '../../test/support/parties.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { blocksNewMax, sameSpot } from '../domain/party/max.js';
+import { isMax } from '../domain/party/party.js';
+
+const ID = (n: number): string => `00000000-0000-4000-8000-00000000020${String(n)}`;
+
+describe('MaxChangeService (plan 8X-3)', () => {
+  it('refuses an end moved later on an ended battle whose spot has another by now', async () => {
+    const over = testMax({
+      id: ID(1),
+      endTime: at('2026-10-13T13:30'),
+      now: at('2026-10-13T13:00'),
+    });
+    const fresh = testMax({ id: ID(2), endTime: at('2026-10-13T15:00') });
+    const made = await partyServiceWith([over, fresh]);
+    const outcome = await made.maxes.setEnd(ID(1), { id: REPORTER }, at('2026-10-13T16:00'));
+    expect(outcome).toMatchObject({ kind: 'refused', reason: 'spot-taken', other: { id: ID(2) } });
+    expect(made.store.get(ID(1))?.endTime).toBe(at('2026-10-13T13:30'));
+  });
+
+  // Review A, X3-B-7: an end moved later and a new report at the spot, at once.
+  it('lets an end moved later and a report at the same spot never both hold it', async () => {
+    const over = testMax({
+      id: ID(1),
+      endTime: at('2026-10-13T13:30'),
+      now: at('2026-10-13T13:00'),
+    });
+    const made = await partyServiceWith([over]);
+    const [moved, added] = await Promise.all([
+      made.maxes.setEnd(ID(1), { id: REPORTER }, at('2026-10-13T16:00')),
+      made.store.addMaxUnlessTaken(testMax({ id: ID(2) }), PARTY_NOW),
+    ]);
+    // Every active battle at the spot that blocks it: exactly one (fix review F3).
+    const holding = made.store
+      .active()
+      .filter(isMax)
+      .filter((party) => sameSpot(party.max.spot, TEST_SPOT) && blocksNewMax(party, PARTY_NOW));
+    expect(holding.map((party) => party.id)).toEqual([ID(1)]);
+    // The end moved first (it was asked first): the report found the spot taken.
+    expect(moved).toMatchObject({ kind: 'ok', changed: true });
+    expect(added).toMatchObject({ added: false, existing: { id: ID(1) } });
+  });
+
+  // Review A, X3-B-6: a battle at the spot in another server stands in nobody's way.
+  it('moves the end of a battle whose spot has a battle of another server', async () => {
+    const over = testMax({
+      id: ID(1),
+      endTime: at('2026-10-13T13:30'),
+      now: at('2026-10-13T13:00'),
+    });
+    const elsewhere = testMax({ id: ID(2), guildId: 2, endTime: at('2026-10-13T15:00') });
+    const made = await partyServiceWith([over, elsewhere]);
+    const outcome = await made.maxes.setEnd(ID(1), { id: REPORTER }, at('2026-10-13T16:00'));
+    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
+  });
+
+  it('moves the end of a battle that blocks its spot, and says so in its post', async () => {
+    const made = await partyServiceWith([
+      { ...testMax({ id: ID(1) }), forumPostId: '300000000000000201' },
+    ]);
+    const outcome = await made.maxes.setEnd(
+      ID(1),
+      { id: REPORTER, name: 'Rita' },
+      at('2026-10-13T15:00'),
+    );
+    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
+    await made.attendance.flush();
+    expect(made.gateway.messagesIn('300000000000000201').map((m) => m.message.content)).toEqual([
+      `**Rita** (<@${REPORTER}>) set the end time: <t:${at('2026-10-13T15:00') / 1000}:t>.`,
+    ]);
+  });
+});
diff --git a/src/services/max-change-service.ts b/src/services/max-change-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c26be41ecdde0f0a720069523ad3fda0f70fe331
--- /dev/null
+++ b/src/services/max-change-service.ts
@@ -0,0 +1,172 @@
+import { noteMember } from '../domain/party/attendance.js';
+import { blocksNewMax, sameSpot, setMaxBoss, setMaxEnd } from '../domain/party/max.js';
+import {
+  isMax,
+  refused,
+  type GroupId,
+  type MaxParty,
+  type PartyProblem,
+  type RaidBossRef,
+  type Refusal,
+} from '../domain/party/party.js';
+import type { MaxTier } from '../domain/pogo/max-tier.js';
+import type { Logger } from '../log.js';
+import { doer } from '../render/activity.js';
+import { timestamp } from '../render/text.js';
+import type { Member } from './attendance-service.js';
+import { storedChange } from './party-change.js';
+import type { PartyLines } from './party-lines.js';
+import type { PartyStore } from './party-store.js';
+
+/**
+ * What came of a change to a max battle. `gone`: there is no such active max battle. `refused`:
+ * it stays as it was; for `spot-taken`, `other` is the battle that holds the spot. `ok`: the
+ * battle as it is stored now; `changed` is false when it already was so.
+ */
+export type MaxChangeOutcome =
+  | { kind: 'gone' }
+  | { kind: 'refused'; reason: PartyProblem; other?: MaxParty }
+  | { kind: 'ok'; party: MaxParty; changed: boolean };
+
+export interface MaxChangeServiceOptions {
+  store: PartyStore;
+  /** Told after every stored change. */
+  posts: { changed(partyId: string): void };
+  lines: Pick<PartyLines, 'say'>;
+  log: Logger;
+  now?: () => number;
+}
+
+type MaxRefusal = Refusal & { other?: MaxParty };
+
+/** `<member> did`, or only what happened for a reporter who asked not to be named (`doer`). */
+function said(party: MaxParty, member: Member, did: string, happened: string): string {
+  const who = doer(party, member);
+  return who === undefined ? happened : `${who} ${did}`;
+}
+
+/**
+ * What members change about a max battle itself (plan 8X-3): its end (`/end`) and its boss
+ * (`/boss`, a rotation within an event; design 3.1). Each decides inside the store, has the post
+ * shown anew and says in the post who changed what, in a line that pings nobody; the caller tells
+ * the member privately. An end moved later is decided under the spot's lock (`withSpotLock`), so
+ * a battle that blocks the spot again never shares it with another (`spot-taken`).
+ */
+export class MaxChangeService {
+  private readonly now: () => number;
+
+  constructor(private readonly options: MaxChangeServiceOptions) {
+    this.now = options.now ?? (() => Date.now());
+  }
+
+  /**
+   * When the battle ends; the caller has checked the time (within the day, never past the last
+   * battle time: `typedMaxTime`). A meeting time after it is cancelled, said in the post.
+   */
+  async setEnd(partyId: string, member: Member, time: number): Promise<MaxChangeOutcome> {
+    const { store } = this.options;
+    const before = store.get(partyId);
+    if (!before || !isMax(before)) return { kind: 'gone' };
+    let removed: string[] = [];
+    return store.withSpotLock(before.max.spot, () =>
+      this.apply(
+        partyId,
+        member,
+        (party, now) => {
+          const set = setMaxEnd(party, time, now);
+          removed = set.removed;
+          if (set.party === party) return { ok: true, party };
+          const other = this.inTheWay(party, set.party, now);
+          return other ? { ...refused('spot-taken'), other } : { ok: true, party: set.party };
+        },
+        (party) => [
+          ...(party.endTime === null
+            ? []
+            : [
+                said(party, member, 'set the end time', 'The end time was set') +
+                  `: ${timestamp(party.endTime)}.`,
+              ]),
+          ...removed.map(
+            (id) =>
+              `The meeting time${party.groups.length > 1 ? ` of group ${id as GroupId}` : ''} ` +
+              'no longer fits the battle and is cancelled.',
+          ),
+        ],
+      ),
+    );
+  }
+
+  /**
+   * The boss of the battle, and its tier with it (`setMaxBoss`: never between Dynamax and
+   * Gigantamax, `max-kind-change`); `label` is how the line names it (`Dynamax Sneasel (1★)`),
+   * already made plain by the caller.
+   */
+  setBoss(
+    partyId: string,
+    member: Member,
+    change: { boss: RaidBossRef; tier: MaxTier; label: string },
+  ): Promise<MaxChangeOutcome> {
+    return this.apply(
+      partyId,
+      member,
+      (party) => {
+        const set = setMaxBoss(party, change.boss, change.tier);
+        return set.ok ? { ok: true, party: set.party } : set;
+      },
+      (party) => [
+        `${said(party, member, 'set the boss', 'The boss was set')}: **${change.label}**.`,
+      ],
+    );
+  }
+
+  /** Runs one change of a max battle inside the store, and tells of it when it was written. */
+  private async apply(
+    partyId: string,
+    member: Member,
+    change: (party: MaxParty, now: number) => { ok: true; party: MaxParty } | MaxRefusal,
+    lines: (party: MaxParty) => string[],
+  ): Promise<MaxChangeOutcome> {
+    const { store, posts } = this.options;
+    const result = await storedChange<MaxParty, unknown, MaxRefusal>(
+      store,
+      partyId,
+      isMax,
+      (party) => {
+        const changed = change(party, this.now());
+        if (!changed.ok || changed.party === party) return changed;
+        return { ...changed, party: noteMember(changed.party, member.id, member) };
+      },
+    );
+    if (result.kind === 'gone') return { kind: 'gone' };
+    if (result.kind === 'refused') {
+      const { reason, other } = result.refusal;
+      return { kind: 'refused', reason, ...(other ? { other } : {}) };
+    }
+    if (result.written) {
+      posts.changed(partyId);
+      const postId = result.party.forumPostId;
+      if (postId !== null)
+        for (const line of lines(result.party)) this.options.lines.say(postId, line);
+    }
+    return { kind: 'ok', party: result.party, changed: result.written };
+  }
+
+  /**
+   * The other max battle a changed one would share its spot with, both blocking it: an end moved
+   * later on a battle whose end had come, while another was reported there since; of its server
+   * only (`PartyStore.maxAt`).
+   */
+  private inTheWay(before: MaxParty, after: MaxParty, now: number): MaxParty | undefined {
+    if (!blocksNewMax(after, now) || blocksNewMax(before, now)) return undefined;
+    return this.options.store
+      .active()
+      .filter(isMax)
+      .find(
+        (other) =>
+          other.id !== after.id &&
+          other.guildId === after.guildId &&
+          sameSpot(other.max.spot, after.max.spot) &&
+          blocksNewMax(other, now),
+      );
+  }
+}
diff --git a/src/services/party-service.max.test.ts b/src/services/party-service.max.test.ts
index 0cecd9a75bdacb94b1a813b67454ed1970d0de65..e7e86b48a7c0104049effc997091fa521e73fb25 100644
--- a/src/services/party-service.max.test.ts
+++ b/src/services/party-service.max.test.ts
@@ -5,7 +5,6 @@ import {
   ALICE,
   asMax,
   at,
-  PARTY_NOW,
   REPORTER,
   TEST_PIN,
   TEST_SPOT,
@@ -175,6 +174,5 @@ describe('PartyService.reportMax (plan 8X-3)', () => {
     // The spot lies in West only: a report from East's channel still goes to West's forum.
     const fromEast = await made.service.reportMax(report({ regionChannelId: EAST_CHANNEL }));
     expect(fromEast).toMatchObject({ kind: 'created', party: { regionId: 1 } });
-    expect(PARTY_NOW).toBeLessThan(END);
   });
 });
diff --git a/src/services/place-finder.ts b/src/services/place-finder.ts
index 66b98b11146b9af3729de5d39a85bfaa9865cbec..a15b0c68158d5620382a586303a013755c5de470 100644
--- a/src/services/place-finder.ts
+++ b/src/services/place-finder.ts
@@ -274,6 +274,24 @@ export class PlaceFinder {
     };
   }
 
+  /**
+   * The nearest kept power spot of the server's regions within `PIN_NEAR_METRES` of a point, as a
+   * choice (plan 8X-3: a maps link or coordinates given to `/max` is the power spot there, else a
+   * pin, "Unlisted power spot"); only one called something. Undefined when there is none.
+   */
+  nearestPowerSpot(guildId: number, point: LatLon): PlaceChoice | undefined {
+    const channels = this.channelsOf(guildId);
+    const { wayspots } = this.options;
+    const spot = wayspots
+      .near(point, PIN_NEAR_METRES, ['powerspot'])
+      .find(
+        ({ wayspot }) =>
+          wayspot.title.trim() !== '' &&
+          wayspots.regionsOf(wayspot.id).some((channelId) => channels.has(channelId)),
+      );
+    return spot && described(wayspotChoice(spot.wayspot, 'exact', false), this.gymsOf(channels));
+  }
+
   /** The channels of the server's regions with an outline. */
   private channelsOf(guildId: number): Set<string> {
     return new Set(
diff --git a/src/web/party-press.test.ts b/src/web/party-press.test.ts
index 697720d910427cf8681c9e50118f9bab22b81e16..549987b1fd859a27b72d79384c656af4b950d055 100644
--- a/src/web/party-press.test.ts
+++ b/src/web/party-press.test.ts
@@ -162,11 +162,12 @@ describe('pressing the buttons of a party on the map', () => {
     const map = await onTheMap(await reportedRaid());
     web = map.web;
     await map.made.service.end(map.made.party.id);
-    // The party has left the store: what kind it was is known only from what only a raid has.
+    // The party has left the store: what kind it was is known only from what only a raid has,
+    // which no press of the map is (Done is a max battle's too: plan 8X-3, review B6).
     const raid = await map.post(press(map.made.party.id, 'join'));
     expect(raid.status).toBe(409);
     expect(raid.json).toEqual({ ok: false, text: 'This has ended.' });
-    expect((await map.post(press(map.made.party.id, 'done'))).json.text).toBe('This raid is over.');
+    expect((await map.post(press(map.made.party.id, 'done'))).json.text).toBe('This has ended.');
     expect((await map.post(press('00000000-0000-4000-8000-00000000ffff', 'here'))).json.text).toBe(
       'This has ended.',
     );
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index b02abee146a7c7c13fd8e3618395cb6aa4cb9d60..e99cda7330f8f7a2358eefa5c64602eeadb886b9 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -64,6 +64,7 @@ import { MemoryUsers } from './users.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { PartyHistory } from '../../src/services/party-history.js';
 import { PartyStore } from '../../src/services/party-store.js';
+import { MaxChangeService } from '../../src/services/max-change-service.js';
 import { RaidChangeService } from '../../src/services/raid-change-service.js';
 import { TimedPartyService } from '../../src/services/timed-party-service.js';
 import { TrainService } from '../../src/services/train-service.js';
@@ -459,6 +460,7 @@ export async function partyServiceWith(
     log,
     now,
   });
+  const maxes = new MaxChangeService({ store, posts: service, lines, log, now });
   const timed = new TimedPartyService({
     store,
     gateway,
@@ -512,6 +514,7 @@ export async function partyServiceWith(
     access,
     grants,
     raids,
+    maxes,
     timed,
     trains,
     routes,
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index f2e7b18ecdd0a01bf7d1ce6a0fe649e6167e2910..750743777739f76f2c02403a28e54a83961ead51 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -32,6 +32,7 @@ import { FakePokebattler } from './pokebattler.js';
 import { FakePlaces } from './places.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
 import type { MaxBossAdmin, MaxBossProvider } from '../../src/services/max-boss-service.js';
+import type { MaxChangeService } from '../../src/services/max-change-service.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { selfRolesWith } from './roles.js';
@@ -150,6 +151,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'attendance',
       'pass { attendance, partyService, parties, regions } from partyServiceWith()',
     ),
+    maxBattles: unavailable<MaxChangeService>(
+      'maxBattles',
+      'pass { maxBattles: made.maxes, … } from partyServiceWith() or reportedMax()',
+    ),
     raids: unavailable<RaidChangeService>(
       'raids',
       'pass { raids, partyService, parties, regions } from partyServiceWith()',
````

### Task 6: 8X-3 task 6: wants and DMs of max battles

Prototype commit: `566ac885b56d4c047f904af3759934c6da96960c`

- maxWantsFiring (design 2, decision 6; 3.4): a species or form want in
  raids (scope raid or both) fits a max battle's boss as a raid boss
  without shadow (pokemonWantFits); a tier want, a shadow want and a want of
  the spawns never do. Gym targets do not apply (a power spot is no gym).
- PartyNotifier.maxReported (PartyService.reportMax, once the post exists)
  and maxChanged (MaxChangeService, a boss that is another: a rotation by
  /boss). The DM: "A **Dynamax Machamp (2★)** battle has been reported at
  **<spot>** (#region) by **<reporter>**." / "The max battle at **<spot>**
  (#region) is now against **…**.", the post's brief and Map, the want's
  Stop button.
- The hour of Q8: a member is told of at most one max battle of a boss an
  hour (MAX_WANT_QUIET_MS), remembered in memory (a BoundedMap of 20,000,
  lost on a restart), and the DM says so in small print: "You won't be told
  about more Dynamax Machamp battles for an hour." (DmNews.note; the
  notifier's announcements gained a sent hook for it).

**Files:**

```
 src/app.ts                              |   8 ++-
 src/domain/notify/reasons.test.ts       |  21 +++++++
 src/domain/notify/reasons.ts            |  23 ++++++++
 src/render/notify-dm.ts                 |  40 ++++++++++++-
 src/services/max-change-service.ts      |   9 ++-
 src/services/notify-service.max.test.ts | 165 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/notify-service.ts          | 122 ++++++++++++++++++++++++++++++++++++++
 src/services/party-service.ts           |   4 ++
 test/support/party-service.ts           |   2 +-
 9 files changed, 390 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/notify/reasons.test.ts src/services/notify-service.max.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 566ac885b56d4c047f904af3759934c6da96960c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 task 6: wants and DMs of max battles`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index f538a662ea519e8bcfb6790a3720ca7aaf0a00e5..09502c2b592a3b4044a8de7ada41386502089448 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -423,7 +423,13 @@ export async function startApp(
     settings: config.settings,
     log,
   });
-  const maxBattles = new MaxChangeService({ store: parties, posts: partyService, lines, log });
+  const maxBattles = new MaxChangeService({
+    store: parties,
+    posts: partyService,
+    lines,
+    notify,
+    log,
+  });
   const timedParties = new TimedPartyService({
     store: parties,
     gateway: partyGateway,
diff --git a/src/domain/notify/reasons.test.ts b/src/domain/notify/reasons.test.ts
index 99393fdb239ad0cd2ca4bf90dc42503489b8b4de..95e82c46ceb0bca0660c65f94df1fcf7a1ace173 100644
--- a/src/domain/notify/reasons.test.ts
+++ b/src/domain/notify/reasons.test.ts
@@ -8,6 +8,7 @@ import {
 } from '../pogo/notification-target.js';
 import type { RaidLevel } from '../pogo/raid-tier.js';
 import {
+  maxWantsFiring,
   parseStopArgs,
   raidNumbers,
   raidWantsFiring,
@@ -164,6 +165,26 @@ describe('spawnWantsFiring', () => {
   });
 });
 
+describe('maxWantsFiring (plan 8X-3)', () => {
+  it('fires a species or form want in raids for its boss, never a tier, shadow or spawn want', () => {
+    const machamp = entryOf('machamp');
+    const wants = [
+      want(pokemonTarget(68)),
+      want(pokemonTarget(68), 'both'),
+      want(pokemonTarget(68), 'spawn'),
+      want(pokemonTarget(68, undefined, true)),
+      want(tier('T5')),
+      want(PERFECT, 'spawn'),
+      want(pokemonTarget(66)),
+    ];
+    expect(maxWantsFiring(catalogue, wants, machamp)).toEqual([
+      pokemonTarget(68),
+      pokemonTarget(68),
+    ]);
+    expect(maxWantsFiring(catalogue, wants, undefined)).toEqual([]);
+  });
+});
+
 describe('reasonKey', () => {
   it('is one text per reason, different for different reasons', () => {
     const keys = [
diff --git a/src/domain/notify/reasons.ts b/src/domain/notify/reasons.ts
index 903d10b40d2b1c80660d9b551b69abe4970fc51c..9d82cb33b89b594fbe6719eeda7dcbe231990a74 100644
--- a/src/domain/notify/reasons.ts
+++ b/src/domain/notify/reasons.ts
@@ -102,6 +102,29 @@ export function raidWantsFiring(
     .map((want) => want.target);
 }
 
+/**
+ * Those of a member's wants that are for a max battle's boss (plan 8X-3; design 2, decision 6;
+ * 3.4): a want for a Pokémon in raids (scope `raid` or `both`) that fits it as a raid boss
+ * without shadow (`pokemonWantFits`: the species in any form, the one form; a want for shadow
+ * raids or for a mega never). No tier want fires: every report names its boss. A boss the game
+ * data does not know fires nothing.
+ */
+export function maxWantsFiring(
+  catalogue: Pick<PokemonCatalogue, 'byKey'>,
+  wants: readonly Want[],
+  boss: { dex: number; key: string } | undefined,
+): NotificationTarget[] {
+  if (!boss) return [];
+  return wants
+    .filter(
+      (want) =>
+        want.scope !== 'spawn' &&
+        want.target.kind === 'pokemon' &&
+        pokemonWantFits(catalogue, want.target, boss, false),
+    )
+    .map((want) => want.target);
+}
+
 /** A reported wild Pokémon as far as wants are matched against it. */
 export interface SpawnSighting {
   /** The catalogue entry that was reported. */
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index 5c35200f8461e98d98a026e022a054a3431f155d..0e401a9e2dc0a9f3602ac3d6aa7a699d4842fe4b 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -12,7 +12,7 @@ import type { V2Message } from '../discord/party-gateway.js';
 import { stopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
 import { cutText, MAX_COMPONENTS, type PartyBrief } from './party-post.js';
-import { memberName, plain, type NamedMember } from './text.js';
+import { memberName, plain, plainNoLinks, type NamedMember } from './text.js';
 import {
   actionRow,
   container,
@@ -176,6 +176,38 @@ export function raidDmSentence(view: RaidDmView): string {
   }
 }
 
+/** What a direct message about a max battle says (plan 8X-3; design 3.3, 3.4). */
+export interface MaxDmView {
+  /** A report, or a boss the battle has now (`/boss`, a rotation). */
+  event: 'reported' | 'boss';
+  /** `Dynamax Machamp (2★)` (`maxBossTitle`). */
+  title: string;
+  /** The spot by name (`maxSpotName`). */
+  spot: string;
+  regionChannelId: string | undefined;
+  /** Who reported it; undefined for one who asked not to be named. */
+  reporter?: NamedMember | undefined;
+}
+
+/**
+ * The first line of a DM about a max battle, the spot in the place of a raid's gym: `A **Dynamax
+ * Machamp (2★)** battle has been reported at **Gazebo** (#west) by **Rita**.`, `The max battle
+ * at **Gazebo** (#west) is now against **Dynamax Sneasel (1★)**.`
+ */
+export function maxDmSentence(view: MaxDmView): string {
+  // The spot's and the boss's names reach other members' DMs: no address in them is a link.
+  const where = `**${plainNoLinks(view.spot)}**${inRegion(view.regionChannelId)}`;
+  const title = `**${plainNoLinks(view.title)}**`;
+  if (view.event === 'boss') return `The max battle at ${where} is now against ${title}.`;
+  const by = view.reporter ? ` by **${memberName(view.reporter)}**` : '';
+  return `A ${title} battle has been reported at ${where}${by}.`;
+}
+
+/** The note of a max battle's want DM (Q8): the hour in which no more of the boss is told. */
+export function maxHourNote(title: string): string {
+  return `You won't be told about more ${plainNoLinks(title.replace(/ \(\d★\)$/, ''))} battles for an hour.`;
+}
+
 /**
  * The first line for a member who is signed up for an egg that got its boss and asked to hear
  * that (`/settings boss-set`): what it hatched into, or will, said for them rather than as news
@@ -291,6 +323,11 @@ export interface DmNews {
   /** Undefined when the party could not be shown: the sentence stands alone then. */
   brief?: Pick<PartyBrief, 'accent' | 'picture' | 'pictureFile' | 'lines'> | undefined;
   links: readonly DmLink[];
+  /**
+   * Said last, in small print (a max battle's want: no more of that boss for an hour, plan
+   * 8X-3, Q8), so that a quiet hour does not look like broken notifications.
+   */
+  note?: string;
 }
 
 /** The colour of a direct message whose party could not be shown. */
@@ -360,6 +397,7 @@ export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Messa
       parts.push(textDisplay([...rest.map(label), ...(hint === '' ? [] : [hint])].join('\n')));
     }
   }
+  if (news.note !== undefined) parts.push(textDisplay(`-# ${news.note}`));
   return {
     v2: true,
     components: [container(brief?.accent ?? NEWS_COLOUR, parts)],
diff --git a/src/services/max-change-service.ts b/src/services/max-change-service.ts
index c26be41ecdde0f0a720069523ad3fda0f70fe331..d9a343735479fd1cc43d6adb20ebde56907b2fa6 100644
--- a/src/services/max-change-service.ts
+++ b/src/services/max-change-service.ts
@@ -15,6 +15,7 @@ import { doer } from '../render/activity.js';
 import { timestamp } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import { storedChange } from './party-change.js';
+import type { PartyNotifier } from './notify-service.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -33,6 +34,8 @@ export interface MaxChangeServiceOptions {
   /** Told after every stored change. */
   posts: { changed(partyId: string): void };
   lines: Pick<PartyLines, 'say'>;
+  /** Told of every stored change of a max battle, with the member who made it. */
+  notify?: Pick<PartyNotifier, 'maxChanged'>;
   log: Logger;
   now?: () => number;
 }
@@ -126,12 +129,14 @@ export class MaxChangeService {
     change: (party: MaxParty, now: number) => { ok: true; party: MaxParty } | MaxRefusal,
     lines: (party: MaxParty) => string[],
   ): Promise<MaxChangeOutcome> {
-    const { store, posts } = this.options;
+    const { store, posts, notify } = this.options;
+    const seen: { before?: MaxParty } = {};
     const result = await storedChange<MaxParty, unknown, MaxRefusal>(
       store,
       partyId,
       isMax,
       (party) => {
+        seen.before = party;
         const changed = change(party, this.now());
         if (!changed.ok || changed.party === party) return changed;
         return { ...changed, party: noteMember(changed.party, member.id, member) };
@@ -144,6 +149,8 @@ export class MaxChangeService {
     }
     if (result.written) {
       posts.changed(partyId);
+      // Every change of a max battle by a member ends here: the notifier sees what it is about.
+      if (seen.before) notify?.maxChanged(seen.before, result.party, member.id);
       const postId = result.party.forumPostId;
       if (postId !== null)
         for (const line of lines(result.party)) this.options.lines.say(postId, line);
diff --git a/src/services/notify-service.max.test.ts b/src/services/notify-service.max.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..10dec1d2f58ac1b407df43e1c0a09aa1e39c6cfc
--- /dev/null
+++ b/src/services/notify-service.max.test.ts
@@ -0,0 +1,165 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { dmReasons, dmSentence, linksOf, textDisplays } from '../../test/support/messages.js';
+import { ALICE, BOB, MINUTE, REPORTER, TEST_SPOT } from '../../test/support/parties.js';
+import { partyServiceWith, reportedMax } from '../../test/support/party-service.js';
+import { watchEachTest } from '../../test/support/timers.js';
+import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { postLink } from '../render/notify-dm.js';
+
+const MACHAMP = pokemonTarget(68);
+const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
+const OTHER_SPOT = { ...TEST_SPOT, id: 'beef0000beef0000beef0000beef0000.16', title: 'Old Mill' };
+const background = watchEachTest();
+
+type Kept = Awaited<ReturnType<typeof partyServiceWith>>;
+
+/** A max battle reported after `before` filled the wants: the first event the notifier sees. */
+async function reported(
+  before: (kept: Kept) => Promise<void>,
+  report: Parameters<typeof reportedMax>[0] = {},
+) {
+  const kept = await partyServiceWith();
+  await before(kept);
+  const made = await reportedMax(
+    { reporter: { name: 'Rita' }, ...report },
+    {},
+    {
+      storage: kept.storage,
+      gateway: kept.gateway,
+      regions: kept.regions,
+      clock: kept.clock,
+      tags: kept.tags,
+      wants: kept.wants,
+      gymTargets: kept.gymTargets,
+      userSettings: kept.userSettings,
+    },
+  );
+  await made.notify.flush();
+  return made;
+}
+
+describe('NotifyService: a max battle is reported (plan 8X-3, design 3.4)', () => {
+  it('tells who wants its species in raids, and says it tells no more of it for an hour', async () => {
+    const made = await reported(async ({ wants, gateway }) => {
+      await wants.set(ALICE, gateway.guildId, MACHAMP, 'raid');
+      // A tier want never fits a max battle; nor does a want of the spawns alone.
+      await wants.set(BOB, gateway.guildId, T5, 'raid');
+      await wants.set(BOB, gateway.guildId, MACHAMP, 'spawn');
+      await wants.set(REPORTER, gateway.guildId, MACHAMP, 'raid');
+    });
+    expect(made.dms.recipients).toEqual([ALICE]);
+    const [message] = made.dms.to(ALICE);
+    expect(dmSentence(message)).toBe(
+      `A **Dynamax Machamp (2★)** battle has been reported at **Gazebo of the Park** ` +
+        `(<#${WEST_CHANNEL}>) by **Rita**.`,
+    );
+    expect(dmReasons(message)).toEqual(['Machamp']);
+    expect(textDisplays(message).at(-1)).toBe(
+      "-# You won't be told about more Dynamax Machamp battles for an hour.",
+    );
+    expect(linksOf(message)).toEqual([
+      `Go to post ${postLink(made.gateway.guildId, made.postId)}`,
+      'Map https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005',
+    ]);
+  });
+
+  it('tells a member of one battle of a boss an hour, a battle of another boss at once', async () => {
+    const made = await reported(async ({ wants, gateway }) => {
+      await wants.set(ALICE, gateway.guildId, MACHAMP, 'raid');
+      await wants.set(ALICE, gateway.guildId, pokemonTarget(66), 'raid');
+    });
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    const report = {
+      reporterId: BOB,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: 'D2' as const,
+      boss: { key: 'machamp' },
+      endTime: made.party.endTime ?? 0,
+      regionChannelId: WEST_CHANNEL,
+    };
+    await made.service.reportMax({ ...report, spot: OTHER_SPOT });
+    await made.notify.flush();
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    // Machop is another boss.
+    await made.service.reportMax({
+      ...report,
+      spot: { ...OTHER_SPOT, id: 'feed0000feed0000feed0000feed0000.16' },
+      boss: { key: 'machop' },
+    });
+    await made.notify.flush();
+    expect(made.dms.to(ALICE)).toHaveLength(2);
+    // An hour after the first, a battle of Machamp is told again.
+    made.clock.now += 61 * MINUTE;
+    await made.service.reportMax({
+      ...report,
+      spot: { ...OTHER_SPOT, id: 'aaaa0000aaaa0000aaaa0000aaaa0000.16' },
+      endTime: made.clock.now + 60 * MINUTE,
+    });
+    await made.notify.flush();
+    expect(made.dms.to(ALICE)).toHaveLength(3);
+    await background.settle();
+  });
+
+  // Review B, B3: the hour is per boss and kind, as the DM names it ("Dynamax Machamp").
+  it('tells of a Gigantamax battle of a boss within the hour of a Dynamax one', async () => {
+    const made = await reported(async ({ wants, gateway }) => {
+      await wants.set(ALICE, gateway.guildId, MACHAMP, 'raid');
+    });
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    await made.service.reportMax({
+      spot: OTHER_SPOT,
+      reporterId: BOB,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: 'G',
+      boss: { key: 'machamp' },
+      endTime: made.party.endTime ?? 0,
+      regionChannelId: WEST_CHANNEL,
+    });
+    await made.notify.flush();
+    const told = made.dms.to(ALICE);
+    expect(told).toHaveLength(2);
+    expect(textDisplays(told[1]).at(-1)).toBe(
+      "-# You won't be told about more Gigantamax Machamp battles for an hour.",
+    );
+    await background.settle();
+  });
+
+  // Review B, B9: a spot's name reaches other members' DMs: no address in it is a link.
+  it('breaks the addresses in the name of the spot it tells of', async () => {
+    const made = await reported(
+      async ({ wants, gateway }) => {
+        await wants.set(ALICE, gateway.guildId, MACHAMP, 'raid');
+      },
+      { spot: { ...TEST_SPOT, title: 'Gazebo www.example.test' }, anonymous: true },
+    );
+    expect(dmSentence(made.dms.to(ALICE)[0])).toBe(
+      'A **Dynamax Machamp (2★)** battle has been reported at **Gazebo www.\u200Bexample.test** ' +
+        `(<#${WEST_CHANNEL}>).`,
+    );
+  });
+
+  it('tells who wants the boss a rotation brings, by /boss', async () => {
+    const made = await reported(async ({ wants, gateway }) => {
+      await wants.set(ALICE, gateway.guildId, pokemonTarget(215), 'raid');
+    });
+    expect(made.dms.to(ALICE)).toEqual([]);
+    await made.maxes.setBoss(
+      made.party.id,
+      { id: BOB },
+      {
+        boss: { key: 'sneasel' },
+        tier: 'D1',
+        label: 'Dynamax Sneasel (1★)',
+      },
+    );
+    await made.notify.flush();
+    expect(dmSentence(made.dms.to(ALICE)[0])).toBe(
+      `The max battle at **Gazebo of the Park** (<#${WEST_CHANNEL}>) is now against ` +
+        '**Dynamax Sneasel (1★)**.',
+    );
+  });
+});
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 1f5302cf8467350efd31ce4a41bc07f56904c2d5..bfe1566fca04a193533ce8fee79b59b4e189da25 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -9,6 +9,7 @@ import { MEMBERS_PER_LOOKUP } from '../discord/member-viewers.js';
 import type { OutgoingMessage } from '../discord/party-gateway.js';
 import {
   bossId,
+  maxWantsFiring,
   raidNumbers,
   raidWantsFiring,
   reasonKey,
@@ -22,6 +23,7 @@ import {
   headCount,
   isMax,
   isMeetup,
+  type MaxParty,
   type MeetupParty,
   type MeetupPlace,
   isRaid,
@@ -38,12 +40,16 @@ import { raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { startTimeOf } from '../domain/party/timed.js';
 import type { Want } from '../domain/pogo/notification-target.js';
+import { battleKindOf, maxBossTitle } from '../domain/pogo/max-tier.js';
 import { sameRaidTier } from '../domain/pogo/raid-tier.js';
+import { BoundedMap } from '../bounded-map.js';
 import { wantTargetLabel } from '../domain/pogo/wants.js';
 import type { Logger } from '../log.js';
 import {
   bossSetSentence,
   mapLink,
+  maxDmSentence,
+  maxHourNote,
   meetingDmSentence,
   notifyDm,
   postButton,
@@ -95,6 +101,10 @@ export interface PartyNotifier {
   raidMoved(from: RaidParty, to: RaidParty, actorId: string | null): void;
   /** A train was made and has its post. */
   trainCreated(party: TrainParty, actorId: string): void;
+  /** A max battle was reported and has its post (plan 8X-3). */
+  maxReported(party: MaxParty, actorId: string): void;
+  /** A max battle was changed and stored; the notifier looks whether its boss is another. */
+  maxChanged(before: MaxParty, after: MaxParty, actorId: string | null): void;
   /**
    * A member set or cancelled the meeting time of their group in a raid; `before` is the time
    * the group had. Not for a time the bot itself moved or cancelled because the raid changed.
@@ -153,6 +163,14 @@ export interface NotifyServiceOptions {
 const BATCH = MEMBERS_PER_LOOKUP;
 /** A message about a raid without an end time is not worth sending after this long. */
 const RAID_NEWS_MS = 60 * 60_000;
+
+/**
+ * A member is told of at most one max battle of a boss in this long (design Q8, Matt 2026-10-20):
+ * on a busy event day the same boss is at many spots, and the DM says so.
+ */
+export const MAX_WANT_QUIET_MS = 60 * 60_000;
+/** How many members' last max battle DMs of a boss are remembered (in memory: a restart forgets). */
+const MAX_HEARD_KEPT = 20_000;
 /** A message about a new train is not worth sending after this long. */
 const TRAIN_NEWS_MS = 60 * 60_000;
 /** A message that a time was taken away is not worth sending after this long. */
@@ -200,6 +218,8 @@ interface Announcement {
   /** The message for a member these reasons fired for; built once per set of reasons. */
   message(guildId: string, reasons: readonly NotifyReason[]): OutgoingMessage;
   priority(reasons: readonly NotifyReason[]): DmPriority;
+  /** Told of each member a message was put in line for (a max battle's hour, Q8). */
+  sent?(memberId: string): void;
 }
 
 /** What one member was already told about one party. */
@@ -238,6 +258,13 @@ export class NotifyService implements PartyNotifier {
   private readonly now: () => number;
   /** By party, by member: what they were already told. */
   private readonly told = new Map<string, Map<string, Told>>();
+  /**
+   * When a member was last told of a max battle of a boss (`<server row> <member> <kind> <boss>`),
+   * for the hour of Q8; in memory, lost on a restart. Read when the members are gathered and
+   * written when each message is put in line, so two reports of the boss moments apart, both
+   * gathered before either is sent, may both reach a member.
+   */
+  private readonly maxHeard = new BoundedMap<string, number>(MAX_HEARD_KEPT);
   private readonly lines = new KeyedLock<string>();
   private readonly background = new Set<Promise<void>>();
   private readonly snowflakes = new Map<number, string>();
@@ -305,6 +332,100 @@ export class NotifyService implements PartyNotifier {
     });
   }
 
+  maxReported(party: MaxParty, actorId: string): void {
+    this.safely('a reported max battle', () => {
+      if (!this.enabled) return;
+      this.announceMax(party, 'reported', actorId);
+    });
+  }
+
+  maxChanged(before: MaxParty, after: MaxParty, actorId: string | null): void {
+    this.safely('a changed max battle', () => {
+      if (!this.enabled || sameBoss(before.max.boss, after.max.boss)) return;
+      this.announceMax(after, 'boss', actorId);
+    });
+  }
+
+  /**
+   * Tells who wants a max battle's boss (plan 8X-3; design 3.4): a species or form want in raids
+   * (`maxWantsFiring`; no tier want, no gym target: a power spot is no gym), at most once an hour
+   * per member and boss (Q8: `MAX_WANT_QUIET_MS`, the DM says so), only once it has its post.
+   */
+  private announceMax(party: MaxParty, event: 'reported' | 'boss', actorId: string | null): void {
+    const { forumChannelId, forumPostId } = party;
+    if (forumChannelId === null || forumPostId === null) return;
+    const { regions, gameData, wants, posts, log } = this.options;
+    const ref = party.max.boss;
+    const entry = 'key' in ref ? gameData.catalogue.byKey(ref.key) : undefined;
+    const boss = entry && { dex: entry.dex, key: entry.key };
+    if (!boss) return;
+    // By boss and kind (review B, B3): a Gigantamax Machamp is told within the hour of a Dynamax
+    // one, as the DM's note names the kind.
+    const kind = battleKindOf(party.max.tier);
+    const heard = (id: string): string => `${String(party.guildId)} ${id} ${kind} ${bossId(ref)}`;
+    const eventAt = this.now();
+    const title = maxBossTitle(entry.name, party.max.tier);
+    let brief: { made?: PartyBrief | undefined } | undefined;
+    this.announce({
+      key: party.id,
+      partyId: party.id,
+      guild: party.guildId,
+      channelId: forumChannelId,
+      actorId,
+      eventAt,
+      expiresAt: party.endTime ?? party.lastPossibleTime ?? eventAt + RAID_NEWS_MS,
+      gather: async (guildId) => {
+        const wanting = new Map<string, readonly Want[]>();
+        try {
+          for (const found of await wants.wanting(guildId, [boss.dex])) {
+            wanting.set(found.memberId, found.wants);
+          }
+        } catch (err) {
+          log.warn({ err, party: party.id }, 'could not read who wants a max battle');
+        }
+        const now = this.now();
+        const quiet = (id: string): boolean => {
+          const last = this.maxHeard.get(heard(id));
+          return last !== undefined && now - last < MAX_WANT_QUIET_MS;
+        };
+        return {
+          ids: [...wanting.keys()].filter((id) => !quiet(id)),
+          reasonsOf: (id) =>
+            maxWantsFiring(gameData.catalogue, wanting.get(id) ?? [], boss).map(
+              (target): NotifyReason => ({ kind: 'want', target }),
+            ),
+        };
+      },
+      message: (guildId, reasons) => {
+        brief ??= { made: this.briefOf(posts, party) };
+        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
+        const map = brief.made?.map;
+        return notifyDm(
+          {
+            sentence: maxDmSentence({
+              event,
+              title,
+              spot: maxSpotName(party.max.spot),
+              regionChannelId: region?.channelId,
+              reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
+            }),
+            brief: brief.made,
+            links: [
+              postButton(postLink(guildId, forumPostId)),
+              ...(map === undefined ? [] : [mapLink(map)]),
+            ],
+            note: maxHourNote(title),
+          },
+          reasons.map((reason) => this.shown(guildId, reason)),
+        );
+      },
+      priority: () => DM_PRIORITY.normal,
+      sent: (id) => {
+        this.maxHeard.set(heard(id), this.now());
+      },
+    });
+  }
+
   raidChanged(before: RaidParty, after: RaidParty, actorId: string | null): void {
     this.safely('a changed raid', () => {
       if (!this.enabled) return;
@@ -899,6 +1020,7 @@ export class NotifyService implements PartyNotifier {
             eventAt: event.eventAt,
             expiresAt: event.expiresAt,
           });
+          event.sent?.(id);
           told += 1;
         }
       }
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index d7cb6df1bad8941ff61c562d679bb050311abb3e..ab4294c283bd8f212fef5cac47ba37a63f38fc86 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -978,6 +978,10 @@ export class PartyService {
       this.createTracked(battle, region, rendered),
     );
     if (created === undefined) return { kind: 'no-region' };
+    // Only now: the message links to the post. Nobody of a battle that has ended meanwhile.
+    if (created.kind === 'created' && store.get(created.party.id)) {
+      this.notifier?.maxReported(created.party, report.reporterId);
+    }
     return created;
   }
 
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index e99cda7330f8f7a2358eefa5c64602eeadb886b9..c823da24d99600cd1b91e7579947d85ba2898b17 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -460,7 +460,7 @@ export async function partyServiceWith(
     log,
     now,
   });
-  const maxes = new MaxChangeService({ store, posts: service, lines, log, now });
+  const maxes = new MaxChangeService({ store, posts: service, lines, notify, log, now });
   const timed = new TimedPartyService({
     store,
     gateway,
````

### Task 7: 8X-3 task 7: max battles in the party history, migration 025

Prototype commit: `00ce4d0edfde4857d6b030a4416fcd2a75e6354a`

- Migration 025 (2026_10_21_025_max_battle_history): PartyHistory.wayspotId
  varchar(40) null, added only when it is missing; src/db/types.ts
  regenerated (db:codegen). After typescript-migration's and wayfarer's 024;
  a 025 of wayfarer merged first renumbers this one.
- A max battle is recorded as any party (design 3.5): kind max, tier D1 to
  D5 or G, the boss columns, wayspotId the power spot's Wayfarer id (null at
  a pin), no gym; completed when somebody completed it (a battle, as a raid);
  shiny not looked up (null). The legacy import keeps wayspotId null.
- history.md: kind max, the max tiers, migration 025.

**Files:**

```
 docs/architecture/history.md                           |  5 ++--
 src/db/migrations/2026_10_21_025_max_battle_history.ts | 33 ++++++++++++++++++++++++
 src/db/migrations/index.ts                             |  2 ++
 src/db/migrator.db.test.ts                             |  1 +
 src/db/repositories/history-queries.db.test.ts         |  1 +
 src/db/repositories/history-recording.db.test.ts       | 48 +++++++++++++++++++++++++++++++++++
 src/db/repositories/history-repository.ts              |  1 +
 src/db/types.ts                                        |  1 +
 src/domain/history/legacy-party.test.ts                |  1 +
 src/domain/history/legacy-party.ts                     |  2 ++
 src/domain/history/party-history.test.ts               | 51 ++++++++++++++++++++++++++++++++++++++
 src/domain/history/party-history.ts                    | 31 ++++++++++++++++++++---
 12 files changed, 171 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/history/legacy-party.test.ts src/domain/history/party-history.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 00ce4d0edfde4857d6b030a4416fcd2a75e6354a -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 task 7: max battles in the party history, migration 025`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/history.md b/docs/architecture/history.md
index 75b378ec8b12d6f846b9e6cb8a8e4b91bf9e024c..39717bd765aaa7927f7266b744f8d52d8a36fd2f 100644
--- a/docs/architecture/history.md
+++ b/docs/architecture/history.md
@@ -2,15 +2,16 @@
 
 Every party that ends is kept in relational tables beside the live `Party` table (plan 8H; spec `2026-10-16-cutover-docker-history-design.md`, 4.3): what it was, where and when, how it ended and how many took part, in a form that plain SQL counts and groups. The legacy bot's parties are imported once from its files. Members are named only with their opt-in. Read before changing the history, its recording, the opt-in or the import, or before writing a statistic over it.
 
-## The tables (migrations 018 and 020)
+## The tables (migrations 018, 020 and 025)
 
-- `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train` or `meetup`. Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end, not by a split); `routeStops` (a train's route at the end); `splitFromId` (migration 020, below).
+- `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train`, `meetup` or `max` (a max battle, plan 8X-3). Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; a max battle's `D1` to `D5` or `G`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end, not by a split); `routeStops` (a train's route at the end); `splitFromId` (migration 020, below).
 - `PartyHistoryAttendee`: a row per member who signed up, in the order they did (`seq`): `memberId` only with their opt-in, else null (the row still counts); `status` at the end (null: they left before it), `furthest` (`interested`, `joined`, `here`, `done`; asked whether they completed it counts as `here`), `groupId`, `extras`, `remote`, `team`, and the times the bot saw (`signedUpAt`, `joinedAt`: first coming or further, `hereAt`, `doneAt`, `leftAt`; null in the legacy history); `splitOff` (migration 020: 1 for a member who left with a group split off the train, 0 otherwise).
 - `PartyHistoryGroup`: a row per group: `label`, `meetingTime` (the last one set, also after the clock cleared it; the steps of a group's meeting time name it by its letter and when it was opened, `B:<stamp>`, plan 8X-1B, since a group nobody is in goes and a later one may take its letter: a pruned B's time is never a new B's; a step of before the stamps names the letter alone and counts for that letter), `members` and `heads` at the end.
 - `PartyHistoryStop`: a row per stop a train made, in order (`seq`; a loop makes a gym's stop twice): `gymId` (null where the gym list no longer has it, with `legacyGymId`), `arrivedAt`, `leftAt` (null where not known: the first stop is reached at the train's start when it was laid earlier; a legacy train's stops have no times).
 - `HistoryOptIn`: a row per member and server (by snowflake, no foreign key) who opted in.
 - `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, a member who went with a group split off a train (`split`), where a train is, a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
 - Migration 020 (plan 8T): `PartyHistory.splitFromId`, in the record of a train that was split off another, that train's `partyId` (`char(36)`, null otherwise, no foreign key: a link only, each train is recorded on its own; Matt, 2026-10-17), with an index (`partyhistory_splitfromid_index`: the trains split off a train); `PartyHistoryAttendee.splitOff` (`tinyint(1) not null default 0`, written from `HistoryAttendee.splitOff`), so that SQL tells a member who went with a group from one who left. Each is added only when it is missing. `kind` of a step is `varchar(8)` since 018 and takes `split` as it is.
+- Migration 025 (plan 8X-3): `PartyHistory.wayspotId` (`varchar(40)`, null), the Wayfarer id of a max battle's power spot, null for one at a pin (an "Unlisted power spot") and for every other party; no foreign key (a Wayspot an import deletes stays named by its id). A max battle has no `gymId`, its boss in the boss columns as a raid's, `shiny` null (not looked up), and it took place (`completed`) when somebody completed it, as a raid. Added only when it is missing.
 - `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its record was written, for what still reads them (below): no member, no party id. Its rows are kept for good, as the ended `Party` rows were before: the post can be reopened by a late message any time.
 - Text a member wrote (a train's or meetup's name, a meetup's description, a group's label) is kept with every member it names written `@member` (`withoutMembers`, `src/domain/history/party-history.ts`; mentions and bare ids of 17 to 20 digits, an emoji's tag stays), live and legacy alike.
 - `createdById` of a raid whose reporter asked not to be named in the post (`anonymous`) is kept all the same when the reporter opted in to the history: a statistic shown to others later must honour `anonymous`.
diff --git a/src/db/migrations/2026_10_21_025_max_battle_history.ts b/src/db/migrations/2026_10_21_025_max_battle_history.ts
new file mode 100644
index 0000000000000000000000000000000000000000..62bef56e3379fe712803faefd6798406c7204e1c
--- /dev/null
+++ b/src/db/migrations/2026_10_21_025_max_battle_history.ts
@@ -0,0 +1,33 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Max battles in the party history (plan 8X-3; design `2026-10-20-max-battles-design.md`, 3.5,
+ * section 10): `PartyHistory.wayspotId`, the Wayfarer id of a max battle's power spot
+ * (`varchar(40)`: an id is 35 or 36 characters), null for one at a pin ("Unlisted power spot")
+ * and for every other party. No foreign key: a Wayspot an import deleted or made a gym stays
+ * named by its id, as a gym deleted later does. A max battle's `kind` is `max` and its `tier`
+ * `D1` … `D5` or `G` in the columns there are (`varchar`), which take them as they are.
+ *
+ * 025: after 8W-P's `024_script_access` (the newest of `typescript-migration` and `wayfarer` on
+ * 2026-10-21; a 025 of `wayfarer` merged first renumbers this one).
+ *
+ * Safe to run again after a failure half-way: the column is added only when it is missing.
+ */
+export const maxBattleHistory: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const existing = await sql<{ n: number }>`
+      select count(*) as n from information_schema.columns
+      where table_schema = database() and table_name = 'PartyHistory'
+        and column_name = 'wayspotId'`.execute(db);
+    if (Number(existing.rows[0]?.n ?? 0) === 0) {
+      await sql`alter table PartyHistory add column wayspotId varchar(40) null default null`.execute(
+        db,
+      );
+    }
+  },
+  async down() {
+    // Additive only: the column stays.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index e157c254b70fdc0208510b3317d562a111965289..316bfc0ee241f5625e56521c8a9a7e11c132be8d 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -23,6 +23,7 @@ import { meetupRequestSource } from './2026_10_17_021_meetup_request_source.js';
 import { moderationReports } from './2026_10_17_022_moderation_reports.js';
 import { meetupRequestFailure } from './2026_10_18_023_meetup_request_failure.js';
 import { scriptAccess } from './2026_10_19_024_script_access.js';
+import { maxBattleHistory } from './2026_10_21_025_max_battle_history.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -53,4 +54,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_17_022_moderation_reports': moderationReports,
   '2026_10_18_023_meetup_request_failure': meetupRequestFailure,
   '2026_10_19_024_script_access': scriptAccess,
+  '2026_10_21_025_max_battle_history': maxBattleHistory,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index ba63102fefa9c3da3c5f02de8a7a526315eec8df..4fef0e628a0d589c63b847595061917f9d3fc1d9 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -175,6 +175,7 @@ describe('runMigrations', () => {
       '2026_10_17_022_moderation_reports',
       '2026_10_18_023_meetup_request_failure',
       '2026_10_19_024_script_access',
+      '2026_10_21_025_max_battle_history',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/history-queries.db.test.ts b/src/db/repositories/history-queries.db.test.ts
index fb334d295a296b6c9e46167a897c623996f82bbf..3a5bb988c932b982c2f9b9d5e74a0c3c27ec6c25 100644
--- a/src/db/repositories/history-queries.db.test.ts
+++ b/src/db/repositories/history-queries.db.test.ts
@@ -62,6 +62,7 @@ function record(more: Partial<HistoryRecord>): HistoryRecord {
     regionId: 1,
     gymId: 1,
     legacyGymId: null,
+    wayspotId: null,
     name: null,
     description: null,
     tier: 'T5',
diff --git a/src/db/repositories/history-recording.db.test.ts b/src/db/repositories/history-recording.db.test.ts
index dce8ede695315301c21d683392ff55e94d707bf6..16e6f7ccc9a1defb727af13397d4234327808d72 100644
--- a/src/db/repositories/history-recording.db.test.ts
+++ b/src/db/repositories/history-recording.db.test.ts
@@ -8,6 +8,9 @@ import {
   MINUTE,
   PARTY_NOW,
   REPORTER,
+  TEST_PIN,
+  TEST_SPOT,
+  testMax,
   testMeetup,
   testRaid,
   testTrain,
@@ -161,6 +164,51 @@ describe('the party history, written with the parties', () => {
   }
   const ending = (party: Party, at: number): Party => ({ ...endParty(party), updatedAt: at });
 
+  it('records a max battle: its kind, tier and power spot, and no Wayspot for a pin (plan 8X-3)', async () => {
+    const battle = { ...testMax(), forumChannelId: FORUM, forumPostId: POST };
+    const ended = await live([
+      battle,
+      withAttendees(battle, { [ALICE]: { status: PartyStatus.Complete } }),
+    ]);
+    const last = ending(ended, T + 2 * MINUTE);
+    expect(await parties.save(last, noteOf(ended, last))).toBe(true);
+    const pinned = {
+      ...testMax({ id: SPLIT, spot: TEST_PIN, tier: 'G' }),
+      forumChannelId: FORUM,
+      forumPostId: '900000000000000003',
+    };
+    const over = await live([pinned]);
+    const gone = ending(over, T + MINUTE);
+    expect(await parties.save(gone, noteOf(over, gone))).toBe(true);
+    const rows = await db
+      .selectFrom('PartyHistory')
+      .select(['partyId', 'kind', 'tier', 'gymId', 'wayspotId', 'bossName', 'ending', 'endTime'])
+      .orderBy('id')
+      .execute();
+    expect(rows).toEqual([
+      {
+        partyId: battle.id,
+        kind: 'max',
+        tier: 'D2',
+        gymId: null,
+        wayspotId: TEST_SPOT.id,
+        bossName: 'Somebody',
+        ending: 'completed',
+        endTime: String(battle.endTime),
+      },
+      {
+        partyId: SPLIT,
+        kind: 'max',
+        tier: 'G',
+        gymId: null,
+        wayspotId: null,
+        bossName: 'Somebody',
+        ending: 'expired',
+        endTime: String(pinned.endTime),
+      },
+    ]);
+  });
+
   it('makes the steps of a party its record when it ends, then deletes its row', async () => {
     await optIn(ALICE);
     const raid = { ...testRaid(), forumChannelId: FORUM, forumPostId: POST };
diff --git a/src/db/repositories/history-repository.ts b/src/db/repositories/history-repository.ts
index ffc17506ad7106e7cf918c20ca2259566dd58d55..ec78cd45987fb8850da711190b05613cdd0c8f52 100644
--- a/src/db/repositories/history-repository.ts
+++ b/src/db/repositories/history-repository.ts
@@ -100,6 +100,7 @@ function historyRow(record: HistoryRecord): Insertable<DB['PartyHistory']> {
     anonymous: flag(record.anonymous),
     routeStops: record.routeStops,
     splitFromId: record.splitFromId,
+    wayspotId: record.wayspotId,
     ...historyCounts(record.attendees),
   };
 }
diff --git a/src/db/types.ts b/src/db/types.ts
index 0f5747658ccab7069eb8b1602323de75811faccf..59d8b78a7447bb04a44cc3d382ee04c254266a75 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -344,6 +344,7 @@ export interface PartyHistory {
   splitFromId: string | null;
   startTime: string | null;
   tier: string | null;
+  wayspotId: string | null;
 }
 
 export interface PartyHistoryAttendee {
diff --git a/src/domain/history/legacy-party.test.ts b/src/domain/history/legacy-party.test.ts
index 278f314d1f41e41c03b705b426ad680490c7d213..7dfc487f5a4a180c5a26b18580289d4a814edcd0 100644
--- a/src/domain/history/legacy-party.test.ts
+++ b/src/domain/history/legacy-party.test.ts
@@ -68,6 +68,7 @@ describe('legacyRecord', () => {
         regionId: 4,
         gymId: 17,
         legacyGymId: 17,
+        wayspotId: null,
         name: null,
         description: null,
         tier: 'T5',
diff --git a/src/domain/history/legacy-party.ts b/src/domain/history/legacy-party.ts
index ae5bcaccb19e95ecffb0a4c9e0518414f816a11a..8725b9f913a398793ba0ea32803ddff786fffad9 100644
--- a/src/domain/history/legacy-party.ts
+++ b/src/domain/history/legacy-party.ts
@@ -259,6 +259,8 @@ export function legacyRecord(raw: unknown, context: LegacyContext): LegacyRead {
       regionId: region?.regionId ?? null,
       gymId: legacyGymId !== null && context.gymExists(legacyGymId) ? legacyGymId : null,
       legacyGymId,
+      // The legacy bot knew no max battles.
+      wayspotId: null,
       name:
         kind === 'train'
           ? textOf(raw.trainName)
diff --git a/src/domain/history/party-history.test.ts b/src/domain/history/party-history.test.ts
index c4010012fe0a1d75877d0d6143092435844ed78a..3213887ae4c501279f54b8538f3641ea7ae56bcc 100644
--- a/src/domain/history/party-history.test.ts
+++ b/src/domain/history/party-history.test.ts
@@ -6,6 +6,9 @@ import {
   MINUTE,
   PARTY_NOW,
   REPORTER,
+  TEST_PIN,
+  TEST_SPOT,
+  testMax,
   testMeetup,
   testRaid,
   testTrain,
@@ -44,6 +47,54 @@ function train(stop: number, route: number[] = [11, 12, 13]): TrainParty {
   return { ...made, train: { ...made.train, route, stop } };
 }
 
+describe('historyOfParty: a max battle (plan 8X-3, design 3.5)', () => {
+  const record = (party: Party) =>
+    historyOfParty(
+      { ...endParty(party), updatedAt: T + 9 * MINUTE },
+      {
+        end: { how: 'clock' },
+        steps: stepsOf([party]),
+        optedIn: new Set(),
+        describeBoss,
+        shiny: null,
+      },
+    );
+
+  it('keeps its kind, tier, boss and the Wayspot of its power spot; no gym', () => {
+    const done = withAttendees(testMax({ boss: { key: 'yveltal' } }), {
+      [ALICE]: { status: PartyStatus.Complete },
+    });
+    expect(record(done)).toMatchObject({
+      kind: 'max',
+      tier: 'D2',
+      gymId: null,
+      wayspotId: TEST_SPOT.id,
+      boss: { key: 'yveltal', dex: 717, species: 'YVELTAL', form: null },
+      shadow: false,
+      mega: false,
+      elite: false,
+      hatchTime: null,
+      endTime: testMax().endTime,
+      ending: 'completed',
+      name: null,
+      startTime: null,
+    });
+  });
+
+  it('keeps no Wayspot for a pin, a Gigantamax tier as G, and is completed only when done', () => {
+    const pinned = testMax({ spot: TEST_PIN, tier: 'G' });
+    expect(record(pinned)).toMatchObject({ wayspotId: null, tier: 'G', ending: 'expired' });
+    // Here is not done: a battle takes place when somebody completed it, as a raid.
+    const here = withAttendees(pinned, { [ALICE]: { status: PartyStatus.Present } });
+    expect(record(here).ending).toBe('expired');
+  });
+
+  it('keeps no Wayspot for any other kind', () => {
+    expect(record(testRaid()).wayspotId).toBeNull();
+    expect(record(testMeetup()).wayspotId).toBeNull();
+  });
+});
+
 describe('partySteps', () => {
   it('notes the members a new party starts with', () => {
     expect(partySteps(undefined, testRaid(), T)).toEqual([
diff --git a/src/domain/history/party-history.ts b/src/domain/history/party-history.ts
index ff45266ec01611023f1a1cd08fa3e90b45c4ae29..92d17caa35969ae24c1df7493d5f14ec8402846c 100644
--- a/src/domain/history/party-history.ts
+++ b/src/domain/history/party-history.ts
@@ -1,6 +1,9 @@
 import {
   attendeeOf,
   groupStamp,
+  bossOf,
+  isBattle,
+  isMax,
   isRaid,
   isTimed,
   isTrain,
@@ -11,6 +14,7 @@ import {
   type Team,
 } from '../party/party.js';
 import { PartyStatus } from '../party/status.js';
+import type { MaxTier } from '../pogo/max-tier.js';
 import type { PokemonEntry } from '../pogo/game-master.js';
 import { currentStop, placeOf } from '../party/train.js';
 
@@ -41,7 +45,18 @@ export type PartyEnding = (typeof PARTY_ENDINGS)[number];
  * has dropped (`T2`, `T4`, `EX`).
  */
 export type HistoryTier =
-  'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'Mega' | 'MegaLegendary' | 'SuperMega' | 'Elite' | 'EX';
+  | 'T1'
+  | 'T2'
+  | 'T3'
+  | 'T4'
+  | 'T5'
+  | 'Mega'
+  | 'MegaLegendary'
+  | 'SuperMega'
+  | 'Elite'
+  | 'EX'
+  // A max battle's (plan 8X-3; design section 10: one spelling of the tiers).
+  | MaxTier;
 
 /**
  * Why a live party ended, as whoever ended it tells the store (`PartyStore.update`'s `ended`):
@@ -139,6 +154,11 @@ export interface HistoryRecord {
   regionId: number | null;
   gymId: number | null;
   legacyGymId: number | null;
+  /**
+   * The Wayspot (Wayfarer id) of a max battle's power spot (plan 8X-3, migration 025); null for a
+   * pin and for every other party.
+   */
+  wayspotId: string | null;
   name: string | null;
   description: string | null;
   tier: HistoryTier | null;
@@ -428,7 +448,8 @@ function endingOf(
   end: PartyEnd | undefined,
   attendees: readonly HistoryAttendee[],
 ): PartyEnding {
-  const took = isRaid(party)
+  // A battle (a raid, a max battle) took place when somebody completed it.
+  const took = isBattle(party)
     ? attendees.some((attendee) => attendee.furthest === 'done')
     : attendees.some((attendee) => attendee.furthest === 'here' || attendee.furthest === 'done');
   if (took) return 'completed';
@@ -484,7 +505,8 @@ export function historyOfParty(party: Party, input: HistoryInput): LiveRecord {
   const named = (id: string | null): string | null => (id !== null && optedIn.has(id) ? id : null);
   const raid = isRaid(party) ? party.raid : undefined;
   const level = raid?.tier.level;
-  const boss = isRaid(party) ? party.raid.boss : isTrain(party) ? party.train.boss : null;
+  const max = isMax(party) ? party.max : undefined;
+  const boss = bossOf(party);
   return {
     source: 'live',
     partyId: party.id,
@@ -493,9 +515,10 @@ export function historyOfParty(party: Party, input: HistoryInput): LiveRecord {
     regionId: party.regionId,
     gymId: party.gymId,
     legacyGymId: null,
+    wayspotId: max && max.spot.kind !== 'pin' ? max.spot.id : null,
     name: isTimed(party) ? withoutMembers(party.timed.name) : null,
     description: party.type === 'meetup' ? scrubbed(party.meetup.description) : null,
-    tier: level ?? null,
+    tier: level ?? max?.tier ?? null,
     shadow: raid?.tier.shadow ?? false,
     mega: level === 'Mega' || level === 'MegaLegendary' || level === 'SuperMega',
     elite: level === 'Elite',
````

### Task 8: 8X-3 docs: the max battle in the area files, the guides and the announcements

Prototype commit: `c86000fb2d53fad96c4c700ddae4deb84ce78eec`

- parties-and-posts.md: the fourth kind (MaxParty, isBattle, the guards
  named outright), a section "Max battles" (the spot, one battle per spot,
  reportMax, the default end and /end, the ending-soon dialog, the post),
  state version 13, lobbySize by tier, maxTick.
- notifications-and-dms.md: maxReported and maxChanged, the hour of Q8.
- discord-framework.md: /max's deferral and its dialog among the one-shot
  questions.
- utilities.md: readMaxBoss and the choices of /max.
- testing.md: testMax, TEST_SPOT, TEST_PIN, reportedMax, made.maxes,
  raidEventsFixture's max and big events, NO_MAX_BOSSES.
- The guides and the announcement drafts name /max.

**Files:**

```
 docs/architecture/discord-framework.md                       |  4 ++--
 docs/architecture/moderation.md                              |  2 +-
 docs/architecture/notifications-and-dms.md                   |  2 +-
 docs/architecture/parties-and-posts.md                       | 27 +++++++++++++++++----------
 docs/architecture/testing.md                                 |  2 +-
 docs/architecture/utilities.md                               |  6 +++---
 docs/architecture/web.md                                     |  2 +-
 docs/guides/migrating-a-legacy-instance.md                   |  2 +-
 docs/guides/new-instance.md                                  |  4 ++--
 docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md |  2 ++
 10 files changed, 31 insertions(+), 22 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated `); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c86000fb2d53fad96c4c700ddae4deb84ce78eec -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-3 docs: the max battle in the area files, the guides and the announcements`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 19ca3123dd66f26c0bc557c07dbe1089fc412f22..012d881032da021b0b0e50ae6e559e74bd130034 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -16,7 +16,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 ## The router and deferral
 
-- The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/counters`); a command that opens a dialog declares none (the dialog is its first answer). A component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/report` and of Report to moderators, `src/commands/parties/report.ts` and `report-message.ts`, and `deferSubmit` in the Submit of every one-shot dialog, below). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
+- The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/counters`; `/max`, plan 8X-3, which asks in a dialog about a new battle that ends within five minutes, and reads what its guard read, kept by the interaction); a command that opens a dialog declares none (the dialog is its first answer). A component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/report` and of Report to moderators, `src/commands/parties/report.ts` and `report-message.ts`, and `deferSubmit` in the Submit of every one-shot dialog, below). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 - Plan 8S-3: between the guards and the throttle the router asks `checks`, the window a form's submit counts in, of a command (`CommandHandler.checks`, a `ControlThrottle`: `as` its command, else the command's own), a message command and a control (`ComponentHandler.checks(interaction, id)`, the limit `throttle` gives the form, counted where the form is): while that window is full the use is refused (the window's words: "You can use /report again in …", "That was a lot of clicks…"), and either way nothing is counted (`Throttles.wait`), so nobody types into a form only to be refused. `/report` and Report to moderators check `/report`'s window (`REPORT_WINDOW`), Ask the moderators and Appeal their form's (`APPEAL_THROTTLE`). A handler's own check before its form is a quick read (whether the member reported it already: `moderation.md`); when it fails the form opens as before, and the submit's checks stay (two forms open at once, a restart between).
 - Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; `/location`'s dialog, whose Submit refused for no post in the other forum gives back the Submit and the use that opened it, plans 8S-4 and 8Q, the time carried in the dialog's custom id: `CHANGE_THROTTLE` as `location`; a move that landed and was answered before a later step failed is logged and keeps both counted; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids, and since 8S-4 the changes of a raid, in the window of their command). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
 
@@ -24,7 +24,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
-- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`) and the split of a train (`trains.md`); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/moderation.md b/docs/architecture/moderation.md
index a10cc35355a7711c9e0f152c67f5de17baccc83b..6aabab50f640d61459802a3b89bfd4cfe3e8b5fe 100644
--- a/docs/architecture/moderation.md
+++ b/docs/architecture/moderation.md
@@ -10,7 +10,7 @@ Members report a party or a single message to the moderators privately, the mode
 
 ## The moderators' post and its decisions
 
-- `reportMessage(report)` (`src/render/moderation.ts`): `### Reported meetup` (raid, train, message), what it is and when, who made it and where, **Where** (`placeLine`, a gym's official name beside its nickname), a meetup's **Information**, **Reasons** with every reporter (`memberText`, the words through `plain`; as many whole ones as fit, then "…and N more reasons"), and while open the buttons of `reportActions`: a raid or train Close… and Dismiss; a meetup Close…, Refuse place… (a gym or PokéStop, never a pin), Block maker… and Dismiss; a message Delete message and Dismiss; with Go to post / Go to message while it is there. Decided, it shows who decided what and when, without buttons.
+- `reportMessage(report)` (`src/render/moderation.ts`): `### Reported meetup` (raid, train, max battle, message), what it is and when, who made it and where ("Reported by" for a raid or a max battle, "Created by" for a meetup or a train; `subject.partyType` is of `PARTY_TYPES`, so a kind added later is read back), **Where** (`placeLine`, a gym's official name beside its nickname), a meetup's **Information**, **Reasons** with every reporter (`memberText`, the words through `plain`; as many whole ones as fit, then "…and N more reasons"), and while open the buttons of `reportActions`: a raid or train Close… and Dismiss; a meetup Close…, Refuse place… (a gym or PokéStop, never a pin), Block maker… and Dismiss; a message Delete message and Dismiss; with Go to post / Go to message while it is there. Decided, it shows who decided what and when, without buttons.
 - `reportDecisionControls` (kind `mreport`, `src/components/moderation-reports.ts`): staff alone (`requireManagement`, refused uncounted), `SAFETY_THROTTLE`. An action that ends a party asks first in a dialog (plan 8Q, `removalDialog` in `src/render/moderation.ts`): titled `Close this meetup`, `Refuse this place` or `Block the maker`, today's question as its text, and the required radio group `The post` with nothing picked, Archive post (`Keeps it readable and locked.`) or Delete post (`Removes it with everything written in it: …`); where the bot may not delete the post (`PartyService.mayDeletePost`) there is no choice, the text says the post will be archived and why (the forum named, `channelInDialog`), and the custom id carries `archive`. The report is read within `DIALOG_READ_MS` (`readInTime`, else the slow-read refusal) and one decided already is said at once without a dialog. Its Submit (`mreport:<id>:<action>[:archive]`, the same guards and throttle) is acknowledged privately and decided, the answer private; the post is redrawn for everybody as before. `ModerationReports.decide`: one conditional change of the report (`decideReport`, the first press wins; a later one is told who decided what; a question of an action pressed on a decided report says so at once), then its work with the party as it is now (its subject renewed): Refuse place… refuses the place for good with the report's post as the ruling's source (`MeetupSafety.refusePlace`), Block maker… blocks as Block member does (`MeetupSafety.blockMember`: the maker's name kept, one DM only for a new block, the maker's other meetups closed archived, this one left to the end, their pending requests withdrawn), then the party ends as `/delete` ends it (`PartyService.endAs` with "This meetup was closed by the moderators.", `removal`; the history records `cancelled`). Refuse place… on a meetup whose place is now a pin or none changes nothing (`no-place`, said so). Where a step of the work fails, the report is opened again (`reopenReport`: its buttons back) and `failed` tells the moderator what was done before it (a place refused, a maker blocked: they stay, and a second try finds them done) and whether the report is open again (if not, to close the party with `/delete`). `endAs` says how the post went: a deletion Discord refused archives it, which the report keeps as removal `denied` (`setRemoval`; the post says "archived: Discord refused to delete it") and the moderator is told ("archived: Discord refused to delete it; delete it yourself"); a party over between the press and the closing has its post deleted all the same when Delete post was chosen (`PartyService.deletePostOf`). Delete post where the bot lacks Manage Threads (`PartyGateway.mayDeletePost`, from the cache; by Submit, since the dialog offered it) is refused before anything changes (`may-not-delete`): the private answer says so with one button, Archive post (`mreport:<id>:<action>:archive`), which decides at once. The question's Delete post of before plan 8Q (`…:delete`) gets the router's stale answer. Delete message claims the report first (`decideReport` as `deleted`, so a Dismiss at the same moment wins or loses before anything is deleted), then deletes the message (`PartyGateway.deleteReported`: an archived post is opened for the deletion and archived again as it was, locked or not, also when the deletion fails, and only where the bot has Manage Threads there, else `not-allowed` before anything is opened; a refused archiving afterwards is logged and the deletion's result stands; a channel the bot cannot see, Missing Access, is `not-allowed`): `deleted`, `gone` when it was deleted first (`markGone`; the post says so); without Manage Messages the report is opened again and the moderator told to delete it themselves, and a deletion that fails opens it again too (`failed`). In rehearsal mode the rehearsal's gateway deletes a member's message only in the post of a rehearsed party (else `not-allowed`, logged).
 - A reported party that ends without a moderator (the clock, its maker, a move) ends its open report (`watch`: a listener of the store, the work on the side, `flush()` in tests): the post says it was over, without buttons. One that staff close with `/delete` ends so too, and then `closeControls` calls `closedByStaff(partyId, removal, by)`: it waits for that work, and the reports it ended (remembered by party) or still open are restated as closed by that moderator with how the post really went (`ReportStore.closeEnded`, conditional on `ended`; `denied` where Discord refused the deletion), so the post reads "Closed by …" and has no Go to post once the post is deleted.
 - In rehearsal mode the reports' posts go through meetup safety's gateway (`rehearsalModeratorsGateway`).
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 8245a25724c49ef4c99fc6f8f1d203a235cfbc1a..075b94bddcc7c4fda89d05b84c122b83b284d7d9 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -12,7 +12,7 @@ What members ask to be told about (wants, gym targets, new trains, boss-set), ho
 
 ## The notifier
 
-- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated`, `meetingTimeChanged`, `startTimeChanged`, `spawnReported`. Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
+- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: a species or form want in raids, never a tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated`, `meetingTimeChanged`, `startTimeChanged`, `spawnReported`. Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 
 ## Sending direct messages
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index abc3989f0d74d2addcbe371a84c3809bfd2e9239..704dd93e2b6962779ffad91c4857b8a875846a62 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -1,19 +1,19 @@
 # Parties and their posts
 
-A party is a raid, a meetup or a train: an immutable object changed by pure functions, kept by `PartyStore`, shown as a components-v2 post in its region's forum through `PartyGateway` and `PartyService`, with attendance, raid changes, the clock, lines in the post, copies in other channels, access for members of other regions and moves between regions. Trains have their own file (`trains.md`). Read before changing anything about parties, posts, attendance, raid changes, meetups or the scheduler.
+A party is a raid, a max battle, a meetup or a train: an immutable object changed by pure functions, kept by `PartyStore`, shown as a components-v2 post in its region's forum through `PartyGateway` and `PartyService`, with attendance, raid changes, the clock, lines in the post, copies in other channels, access for members of other regions and moves between regions. Trains have their own file (`trains.md`). Read before changing anything about parties, posts, attendance, raid changes, meetups or the scheduler.
 
 ## The model and the store
 
-- A party (a raid, a meetup or a train) is an immutable plain object (`src/domain/party/party.ts`). Everything that can happen to it is a pure function in `src/domain/party/` (`attendance.ts`, `raid.ts`) that returns a changed party with what came of it, or `{ ok: false, reason }` (`Change`); a function returns the very same object when nothing changed. Commands turn a `reason` into a sentence. Never mutate a party.
-- `Party` is a union, `RaidParty | MeetupParty | TrainParty`. Code that is about a raid narrows: `isRaid` in the domain and services, the guard `requireRaid` with `commandRaid(interaction, ctx)` in a handler, `raidOf` elsewhere; likewise `isTimed` / `requireTimed` / `commandTimed` and `isMeetup` / `requireMeetup` / `commandMeetup`. A change inside `PartyStore.update` keeps the kind (`asKindOf(original, changed)`; the store throws when the kind changes). Never cast to a kind.
-- What the clock does is `partyTick(party, input)` (`tick.ts`; it dispatches to `raidTick` or `timedTick`): it returns the party as it should be now, `effects` (`stage`, `ask-complete`, `completed`, `warn`, `end`) and `render`. It is idempotent and catches up after downtime by itself. `end` comes alone and repeats until the caller has ended the party with `endParty`.
-- A party changes only through `PartyStore.update(id, change)` (`src/services/party-store.ts`): one change at a time per party, written to the database first, then replaced in memory. `change` is synchronous and decides inside the callback (a `get` made earlier may be stale); the result has `written`. Two parties that must change together (a train's split: the old train loses the group, the new one is made to match) change through `PartyStore.updateBoth([id, id], change)`: `change(first, second)` gets both as they are (undefined for one that is not active: it decides) and returns `parties` in the same order, both written by one storage call in one transaction (`PartyStorage.saveBoth`; the notes as `save`'s: an end behind its savepoint inside the transaction, steps after the commit; a deadlock runs the whole transaction again, `retryOnDeadlock`, and one that persists or another loss of the transaction writes both rows again alone), memory replaced only after the commit, both before the listeners hear of either; a failed write leaves both as they were, a row that is gone writes neither. It takes both locks in the order of the ids, so a change of either waits for it and two such changes never deadlock; nothing inside it takes a lock again (`KeyedLock` is not re-entrant). A reported raid is stored only through `addRaidUnlessTaken`. Handlers read through `ctx.parties` (`get`, `byPost`, `active`, `inRegion`, `raidAt`).
+- A party (a raid, a meetup, a train or a max battle) is an immutable plain object (`src/domain/party/party.ts`). Everything that can happen to it is a pure function in `src/domain/party/` (`attendance.ts`, `raid.ts`) that returns a changed party with what came of it, or `{ ok: false, reason }` (`Change`); a function returns the very same object when nothing changed. Commands turn a `reason` into a sentence. Never mutate a party.
+- `Party` is a union, `RaidParty | MeetupParty | TrainParty | MaxParty`. Code that is about a raid narrows: `isRaid` in the domain and services, the guard `requireRaid` with `commandRaid(interaction, ctx)` in a handler, `raidOf` elsewhere; likewise `isTimed` / `requireTimed` / `commandTimed` and `isMeetup` / `requireMeetup` / `commandMeetup`, and `isMax` for a max battle. Every guard names its kinds outright (plan 8X-3: `isTimed` is a meetup or a train, `requireRaidOrTrain` a raid, max battle or train): a kind added later is none of them by elimination. A battle (`isBattle`, `BattleParty`: a raid or a max battle) is one where Done means the member completed it, and its present members are asked whether they did (`completeRaid`, `askGroupWhetherComplete`, `completeUnanswered`; the egg's refusal stays a raid's). A change inside `PartyStore.update` keeps the kind (`asKindOf(original, changed)`; the store throws when the kind changes). Never cast to a kind.
+- What the clock does is `partyTick(party, input)` (`tick.ts`; it dispatches to `raidTick`, `maxTick` or `timedTick`; a raid and a max battle share `battleClock`: the meeting times, the questions, the archiving warned `deletionWarningTime` ahead): it returns the party as it should be now, `effects` (`stage`, `ask-complete`, `completed`, `warn`, `end`) and `render`. It is idempotent and catches up after downtime by itself. `end` comes alone and repeats until the caller has ended the party with `endParty`.
+- A party changes only through `PartyStore.update(id, change)` (`src/services/party-store.ts`): one change at a time per party, written to the database first, then replaced in memory. `change` is synchronous and decides inside the callback (a `get` made earlier may be stale); the result has `written`. Two parties that must change together (a train's split: the old train loses the group, the new one is made to match) change through `PartyStore.updateBoth([id, id], change)`: `change(first, second)` gets both as they are (undefined for one that is not active: it decides) and returns `parties` in the same order, both written by one storage call in one transaction (`PartyStorage.saveBoth`; the notes as `save`'s: an end behind its savepoint inside the transaction, steps after the commit; a deadlock runs the whole transaction again, `retryOnDeadlock`, and one that persists or another loss of the transaction writes both rows again alone), memory replaced only after the commit, both before the listeners hear of either; a failed write leaves both as they were, a row that is gone writes neither. It takes both locks in the order of the ids, so a change of either waits for it and two such changes never deadlock; nothing inside it takes a lock again (`KeyedLock` is not re-entrant). A reported raid is stored only through `addRaidUnlessTaken`, a reported max battle only through `addMaxUnlessTaken` (below). Handlers read through `ctx.parties` (`get`, `byPost`, `active`, `inRegion`, `raidAt`, `maxAt`).
 - Groups (plan 8X-1B; design `2026-10-20-join-group-meet-buttons-design.md`): a party's groups are in the order they were opened, and each remembers when (`PartyGroup.opened`; a party's first group and every group of a document before version 12 count as opened with the party: `groupOpened`). A group nobody is in goes (decision 6, a wish of legacy Pine's): `pruneGroups` (`attendance.ts`, pure) drops a group no attendee of any status is in (who is interested and who is done count), unless it has a label or a meeting time, never the party's last group (of all empty ones the default group stays); the others keep their letters, and when the default group goes the newest left takes over (by `groupOpened`). `PartyStore.update` and `updateBoth` (both parties) run it on every change that returned a new party, never on a refusal or a change of nothing; it is silent (no line, no ping, the post shown anew). A new group takes `nextGroupId`'s letter (after the last in use, else the first free one), so a letter can be given again: whatever names a group across time names it by its letter and stamp (`groupStamp`, base 36; `stampedGroup` finds a group only while the letter is still that group): the custom ids of the dialogs about groups and Meet…'s, the train split's mark (`groupMark` is `<stamp>.<hash>`; a mark of a group that went, or whose letter a group opened since has, is `no-such-group`, worded as before; a label changed or another split since is `group-changed`), and the party history's meeting times (`history.md`). A group a change opens is stamped with `AttendanceLimits.now`, which the services give with every change (`limitsOf`; `applyAutoStatus` takes it too), and in any case after the party's last write and every group it has (`openedGroup`): stamps strictly increase, also within one millisecond. Who signs up without choosing a group is placed silently as before: +1, −1, Remote and the commands (`/join`, `/here` …, without `group`), and a report's automatic status, go where `setAttendance` puts a newcomer (`chooseGroup` with a lobby size, else the default group); only the post's Interested, Join and Here ask (below).
 - Every party that ends is recorded in the party history (`history.md`): the store asks `PartyHistory` for a note of each write, which the storage writes with the party, and a change that ends a party says why with `ended` in its result (`PartyEnd`: the scheduler `clock`, `PartyService.end` `cancelled` by default, a move `moved`, a party that never had its post `failed`). Once recorded, an ended party's `Party` row is deleted (it holds its members' ids; Matt, 2026-10-16): what reads ended parties (`endedPosts`, `partyForums`) also reads `EndedPartyPost`, and nothing may count on an ended row being there.
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
 - `PartyRepository` keeps what is searched by in columns and the rest in one versioned JSON document (`party-state.ts`), checked when written and when read; a row it cannot read is reported and left alone. Attendees are a list there, because MySQL sorts the keys of a JSON object. Any new field in the document is a new version with a reader for the old one.
-- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is only the size above which a group of a raid or a train is told to split up: `splitLobby(party, lobbies)`, a second exhaustive switch beside `lobbySize` (raid and train `lobbies.raid`, meetup none; 8X-4 adds the Dynamax train, none), `TrainersView.splitLobby`, null where a kind never splits up) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete. Where a party has a size, Join fills its groups: the services put `lobbySize` into the `AttendanceLimits` of each change (`AttendanceService.limitsOf(party)`; `PartyService` passes it to `applyAutoStatus`; both take `lobbySize` as an option, which tests use to give a raid a size), and `setAttendance` places a member who is not yet an attendee and names no group, whatever the status, and an Interested one who becomes Coming or Present (their own group while it has room for them) through `chooseGroup(party, member, heads, size)` (`attendance.ts`): the default group while they and their +1s fit, else the first group by letter with room, else a new group while there are fewer than five, opened silently (no line, no ping, unlike `createGroup`) and made the default, else the group with the most room, the first by letter on a tie, over its size; the member is never counted against their own group. A member larger than a lobby by themself goes straight to the group with the most room (no new group would hold them either), and a party without groups (a meetup) keeps its one. `+1` and Remote sign a new member up the same way. Nothing else moves anybody: a count or a change to Coming that puts a group over its size leaves them there, and `/group join`, Group…, the group a newcomer chose in the dialog "which group?" (plan 8X-1B), the letter Join of a post drawn before it and anything that names a group put the member where they asked, over the size if so. Without a size every change is what it was.
+- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is only the size above which a group of a raid or a train is told to split up: `splitLobby(party, lobbies)`, a second exhaustive switch beside `lobbySize` (raid and train `lobbies.raid`, meetup none; 8X-4 adds the Dynamax train, none), `TrainersView.splitLobby`, null where a kind never splits up) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold: a max battle's by its tier (`dynamax`, `gigantamax`; plan 8X-3), undefined for a raid, a raid train and a meetup (Q6); an exhaustive switch on the kind that the Gigantamax train (8X-4) fills in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete. Where a party has a size, Join fills its groups: the services put `lobbySize` into the `AttendanceLimits` of each change (`AttendanceService.limitsOf(party)`; `PartyService` passes it to `applyAutoStatus`; both take `lobbySize` as an option, which tests use to give a raid a size), and `setAttendance` places a member who is not yet an attendee and names no group, whatever the status, and an Interested one who becomes Coming or Present (their own group while it has room for them) through `chooseGroup(party, member, heads, size)` (`attendance.ts`): the default group while they and their +1s fit, else the first group by letter with room, else a new group while there are fewer than five, opened silently (no line, no ping, unlike `createGroup`) and made the default, else the group with the most room, the first by letter on a tie, over its size; the member is never counted against their own group. A member larger than a lobby by themself goes straight to the group with the most room (no new group would hold them either), and a party without groups (a meetup) keeps its one. `+1` and Remote sign a new member up the same way. Nothing else moves anybody: a count or a change to Coming that puts a group over its size leaves them there, and `/group join`, Group…, the group a newcomer chose in the dialog "which group?" (plan 8X-1B), the letter Join of a post drawn before it and anything that names a group put the member where they asked, over the size if so. Without a size every change is what it was.
 - How long a raid lasts comes from `raidDurationsAt` / `hatchTimeForEnd` / `longestRaidDurations` (`src/domain/time/raid-durations.ts`) with `raidDurationRules(settings, ctx.raidEvents.events())`: the configured durations, changed for a standard raid that hatches during a Raid Hour or Raid Day (`settings.raidEvents`; events come from the feed, and the weekly Raid Hour of the settings applies in a week for which the feed lists none). Pass `longestRaidDurations(...)` as `durations` to `resolvePartyTime`.
 
 ## Commands and controls in a post
@@ -22,7 +22,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - A time a member types for an existing raid is read by `typedPartyTime(ctx, party, 'hatch' | 'end' | 'meet', text, now)` (`src/commands/raids/raid-input.ts`); handlers read `Date.now()` themselves (their tests fake only `Date`). A boss with only one fast or one charged move has it set wherever a raid gets its boss (`certainMoves`: report, `/boss`, hatch).
 - The raid command for another gym is `/location`, not `/gym`: `/gym` is the gym administration of Phase 5, and one slash command cannot be both a command and a group of subcommands. A gym of another region of the same server moves the raid there: `/location` asks first (its own file, `src/commands/raids/location.ts`), in a dialog since plan 8Q: titled `Move the raid to another region`, today's question with the region's channel named (`#east`, `channelInDialog`; the answers keep their mentions) and `Submit moves it.`; refusals before asking (no such gym, several, a gym with such a raid, none of a region with a forum) stay private replies, and a move within the region asks nothing. The dialog carries the party and the gym (no pending request); its Submit (`locationControls.modal`, `requireGuild`) is acknowledged privately, refused as over (`This raid is over.`) unless the raid it names is the one of the post it is submitted in (`raidOf`), and moves the raid as the service decides then (`raids.setGym`), the answer (`This raid is now at … Its new post is …`) given before the old post closes; a refusal that is none of the member's doing gives back the Submit and the use of `/location` that opened the dialog (`carriesOn`, plan 8S-4: when it was counted is the custom id's last part, `location:<party id>:move:<gym id>:<counted at>`), and a failure after the move was answered is only logged. Command and Submit have no limit of their own (the `CHANGE_THROTTLE` of every change of a raid applies; Matt, 2026-10-11); the buttons of the question before plan 8Q (`location:<token>:yes|no`) get the router's stale answer.
 - A `group` option is free text with autocomplete of the groups the raid has (`respondWithGroups`), read by `typedGroup` (`src/commands/parties/reply.ts`); text that is no group is refused, never ignored.
-- Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`), otherwise "This has ended."
+- Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`: Set time and Screenshot feedback; Done, the completion question's answers and Meet… are a max battle's too, plan 8X-3), otherwise "This has ended.", also on the map and in Meet…'s refusal
 - Private answers to clicks on a post's controls go through `answerClick` (`ctx.clickAnswers`, `ClickAnswers`): the first click of a member on a party is answered with `reply`, later ones within two seconds are only acknowledged (`deferUpdate`), and the first answer is then edited to the answer of the last click. Only the first interaction of a burst may be given `editReply` (on a `deferUpdate`d click it would edit the post's own message). A refusal is thrown and shown at once. The test context answers every click by itself (window zero).
 
 ## Raids
@@ -31,6 +31,13 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
 - The post of an egg shows the game's egg (`raidEggName`, `src/domain/pogo/raid-eggs.ts`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture, the boss it names and where Where says it is (`place`: the gym's name as the post shows it, its point and address line; plan 8M-6), decided as for the post. The pictures are square (plan 8D-F, Matt, 2026-10-17: PokeMiners' icons are 112 by 128 and a phone crops a thumbnail to a square, cutting the egg's bottom off): `scripts/eggs/make-eggs.ts` (`npm run eggs:make`, the one step that downloads them, from `RAID_EGG_PICTURES_URL`'s pinned commit) padded each with transparency to a square of its longer side, the egg centred and unscaled, into `pictures/eggs/`, which is committed and in the image; nothing is fetched at run time, and `settings.raidEggPicturesUrl` is retired (`RETIRED_SETTINGS`). `EggPictures` (`src/services/egg-pictures.ts`, `PartyServiceOptions.eggPictures`) says where a post takes one from: once the web server listens (`src/app.ts` calls `serving()` when `startWebServer` answered true, so a port it could not take leaves the files) with `settings.web` at a public address that is not this machine's, the bot's own web server (`<publicUrl>/eggs/<name>.png?v=<8 hex>`, the start of the file's SHA-256, so that a cached picture never hides an egg made again; `web.md`); otherwise, and until then, the message carries the file and shows it as `attachment://<name>.png` (`RaidPostView.eggFile`, `PostLayout.pictureFile`, `PartyBrief.pictureFile`). Every post message says which files it has (`files`, `[]` when none: `postMessage`), and an edit that says so replaces the files the message had (`editAs` sends `attachments: []` and the files uploaded again; a conversion sends them through the REST route with `attachments` by index, `uploadsOf`), as Discord documents it: an edit keeps only the attachments it names. So the egg's file is uploaded again with every edit while it is an egg (some 22 KB), and the edit at hatch takes it away. A copy in another channel and the direct message's brief carry the same file. Where the bot may not attach files Discord answers Missing Permissions (50013), not Invalid Form Body: `isRefusedFile` (`src/discord/party-gateway.ts`, over `looksLikeRefusedFile`: 50013, 50035, 40005 or an error of reading the file, for a message that carries files) has a post, its edit and a copy sent once more without the file (`PostVariant.files: false`: the egg left out, pictures by address kept; `postForms`, `sendInForms`, `src/services/refused-files.ts`), and then in its other forms if Discord refuses one (`FormTrail`, below the controls); once a form without the file goes through (also one that needed plain emoji or no pictures as well), the forum, the post or the channel of copies is remembered for ten minutes (`RefusedFiles`, shared by `PartyService` and `PartyMirrors`), so that its next messages go without the file at once, with no refused call and no warning each time; a post made by its line of text after the first way had its file refused edits the line in without the file at once. Invalid Form Body is never noted as refused files (when a post is made it is taken as a refused first message; an edit or a copy refused so may have been refused for what it holds): only another refusal of the file is.
 
+## Max battles
+
+- A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
+- One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`.
+- How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind.
+- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …`, the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]`; the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
+
 ## Meetups and timed parties
 
 - A timed party (a meetup or a train) has `party.timed` (`name`, `startTime`: one start for the whole party, not a group's meeting time) and changes through `ctx.timedParties` (`TimedPartyService`: `setName`, `setDescription`, `setStartTime`, `setEndTime`, `flush`) over the pure functions of `src/domain/party/timed.ts` (and `meetup.ts`). Each of the four takes the value the change was drawn from (`drawn`, the live map's meetup editor, plan 8M-5M) and refuses it inside the store as `changed-meanwhile` when the party has another by now (`asDrawn`); the commands give none. What `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, answering `TimedAnswer`, which the commands reply with through `replyTimed`) and `describeAs` (`src/commands/meetups/info.ts`), the code paths the map shares. It is over at its end time; without one, a day after its start; without either, a day after it was made or its last time was removed (`latestTime(party, now)`, `settled`). The clock warns it `trainOrMeetupDeletionWarningTime` ahead, and an ended one is always shown as over. A new start is announced in the post gathered (one message a few seconds after the last change).
@@ -44,8 +51,8 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS` and `RETIRED_TAGS` (tags the bot once used: `/admin setup-forums` takes them off a forum, never a tag the server made), `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut. Every post says where the party is under **Where** (plan 8D, Matt, 2026-10-17, like the `/wild` report's Where; the layout below).
 - The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more) once the trainers' details are back inside their sections (below).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
-- The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 31 with Split group… (before, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody could move to another group.") under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
-- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a raid's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move train…, Split group…, Whole route, `trains.md`). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
+- The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 31 with Split group… (before, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody could move to another group.") under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
+- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move train…, Split group…, Whole route, `trains.md`). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group newest first (`newestFirst`), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) newest first, then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>` (`meetControls`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
@@ -65,7 +72,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup` (with a label, Group…), `labelGroup`; `joinChosen` and `joinStamped` (the Submits of the dialogs about groups), `lobbyOf` (a party's lobby size). Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, and the letter Join, "Join B", of a post drawn before plan 8X-1B, which still joins its letter, `joinInto`, or is refused as no such group once the letter is gone) are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
-- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 12 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; version 12 (plan 8X-1B): a group's `opened`, also kept with a `splitOff` entry; exactly the parts that fit the type must be present); versions 1 to 11 are still read (a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another, their groups before 12 opened with the party).
+- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 13 (plan 8X-3: the part `max`, a max battle's tier, boss and spot; plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; version 12 (plan 8X-1B): a group's `opened`, also kept with a `splitOff` entry; exactly the parts that fit the type must be present); versions 1 to 12 are still read (none of them a max battle; a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another, their groups before 12 opened with the party).
 
 ## The clock
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 8dbb3af96812f7169ea95f333f034d493c94b037..91f5e19e987313b539012af512a98fbd87293c12 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -30,7 +30,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Parties
 
-- Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
+- Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); max battles (plan 8X-3) with `testMax()` (a Dynamax Machamp at `TEST_SPOT` until 21:00), `TEST_PIN`, `asMax()`, and through the service with `reportedMax()` (`test/support/party-service.ts`; `made.maxes` is the `MaxChangeService`, `ctx.maxBattles`); `raidEventsFixture(zone, { max, big })` gives max and big events, none by default, and `NO_MAX_BOSSES` (`test/support/test-context.ts`) a provider of no max boss; its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
 - Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, and one in a category of 50 channels or a server of 500 as Discord refuses it (Invalid Form Body naming `parent_id`, `CHANNEL_PARENT_MAX_CHANNELS`; `serverFull()`, 30013), as `createTextChannel` answers `category-full` and `server-full` (plan 8S-4); `createCategory` with `like` (a category that continues another) copies that one's `categoryOverwrites` to the new category and records where it was placed (`placedAfter`, by id), answers `base-gone` when that one is not there (or in `gone`), and `refuseCopies` has it refused as `no-permission`, as Discord refuses a bot that may not set those overwrites, a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); a post and a message keep the names of their files (`attachments`: those sent, replaced by an edit whose message names its files, none too, kept by one that does not, and a thumbnail `attachment://` must name one of them), and `refuseFiles` refuses any send or edit that uploads a file with Missing Permissions (50013), as Discord answers a bot without Attach Files, counting each refusal in `filesRefused` (plan 8D-F), `rejectThumbnails` and `rejectCustomEmoji` refuse a thumbnail or a button's custom emoji with Invalid Form Body naming the field as Discord does (`….accessory.media.url`; `….emoji.id[COMPONENT_INVALID_EMOJI]`, which `refusedPart` reads), and `deletedEmojiIds` refuses only the custom emoji of those ids, as for an emoji deleted from the application (plan 8D-H); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`. A party with a lobby size before max battles exist (plan 8X-1): the override `{ lobbySize: () => 4 }` of `partyServiceWith`, `reportedRaid` or `createdTrain` gives every party of the test that size, for the party service (posts, `applyAutoStatus`) and the attendance service (Join's `chooseGroup`) alike; without it the settings' `lobbySize`, none for any party of today.
 - Meetups in tests: `testMeetup()` (which takes `place`), `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`; a meetup with a place passes `place`, and a directory of kept Wayspots as the override `wayspots`, `wayspotsWith`). A meetup's post shows its place as it is now from `MeetupPostView.gym` and `.wayspot`; a test of the renderer passes them to see a place as it is now, and leaves them out for the snapshot. The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index f04e1cf1ea0283f58531085568fc051aff123c24..c06997157f331014664e664900c2c346fbba3f28 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -25,9 +25,9 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
 - Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). `dynamaxPokemon` is not read. Max boss changes are not announced.
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own).
-- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`, in memory: only a restart in the week after the feed dropped its Monday entirely loses the week's boss). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3): the featured bosses first, then 5 stars down to 1, Gigantamax last. A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
-- The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
-- How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change), otherwise (a Dynamax battle on an ordinary day) the day's last battle time; always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), undefined at the cap.
+- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`, in memory: only a restart in the week after the feed dropped its Monday entirely loses the week's boss). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none, and in `/boss` the battle's own tier where the Pokémon may battle in it. A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
+- The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
+- How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
 - `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
 - Pokémon nicknames change only through `ctx.nicknames` (`PokemonSearchService`: changes and reloads one at a time; `nicknameProblem` in `src/domain/pogo/nickname-rules.ts` refuses words other commands read, names and nicknames of other Pokémon; removal from every legacy row of the Pokémon; the column stays `, `-joined lower case).
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index bbf99e8d8ec512104022fda74e8166057bf6a536..62090d6e156586f4b93027e496b2e8519b985fc7 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -43,7 +43,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
 - **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups newest first (`newestFirst`) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
-- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`; any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
+- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`; any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
 - **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 07b1aadb64f50b645a713ef66a06858bda98372b..408e63ae464571ac52f1eaf84b06de6039895f06 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -279,7 +279,7 @@ They can take a little while to show up in Discord.
 
 ### 4.10 Check that it works
 
-- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a train (`/train`); a meetup (`/meetup`).
+- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a power spot (`/max`); a train (`/train`); a meetup (`/meetup`).
 - A direct message: set a want (`/want`) and have somebody else report that boss.
 - A screenshot of a raid posted with a mention of the bot (the bot itself, not a role of the same name).
 
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index 7a42fa8c09173f0bf18724e37b61fb57b5095d9e..54ccca8adfb71820987a250063b8e1466b66352a 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -120,7 +120,7 @@ The settings that matter first:
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
 - `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.
 
-The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, which are still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
+The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
 
 ## 4. Start the bot
 
@@ -171,7 +171,7 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), its tags, and a pinned list of active raids. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
-Then try it: `/raid` in a region channel, the buttons in the post, `/train`, `/meetup`, `/want` and a report of that boss by somebody else. `/help` lists everything.
+Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a power spot: the power spots come with the Wayfarer import), `/train`, `/meetup`, `/want` and a report of that boss by somebody else. `/help` lists everything.
 
 ## 8. Running it
 
diff --git a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
index f675694eca3a972e0f12fe7eae09ed3edd68b241..0e6ffe7ace1b90600eb4e3b91d1f5cfbd54622a7 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
@@ -26,6 +26,7 @@ Next, **buttons instead of reactions**, with the icons you know. With several gr
 Then, **slash commands**. Type `/` and Discord shows you the list, with every option explained:
 
 - `/raid` reports a raid or an egg: `/raid boss:Mewtwo gym:Big Fountain time:6:15pm`
+- `/max` reports a Dynamax or Gigantamax battle at a power spot: `/max boss:Machamp spot:Gazebo` (or paste a maps link for a power spot Pine does not know)
 - `/join`, `/interested`, `/here`, `/done` and `/leave` work in a raid's post
 - `/train` and `/meetup` start a post of their own
 - `/want` and `/target` get you DMs for bosses and gyms; `/settings show` shows the rest of your settings
@@ -58,6 +59,7 @@ Pine has been rewritten from the ground up:
 - One forum post per raid, train and meetup, in a forum beside each region's channel, instead of a channel per raid
 - Buttons on the post instead of reactions, with the legacy reaction icons, in three rows at the bottom, the same for one group and several: Interested, Join, Here, Done, Leave; Meet… (the game's Select Time icon), −1, +1, Remote; Group… (and Set time while a raid has no times). A newcomer to a post of several groups is asked which group in a dialog; Group… moves a member or opens a group with a label; Meet… sets the group's meeting time from a list with the in-game RSVP times. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
 - Raid screenshots read with `/raid` or a mention of the bot
+- Max battles (`/max`) at power spots, with lobbies of 4 (Dynamax) and 100 (Gigantamax) that Join fills, the bosses from Pokebattler with the event's boss first, and wants of a species covering its max battles
 - Members report a raid, train, meetup or single message to your moderators privately (`/report`, or Apps › Report to moderators on a message); `/delete` is for staff and asks whether to archive the post or delete it
 - Gyms imported from Wayfarer (`/gym import`), regions from KML (`/region import`)
 - A history of every ended raid, train and meetup for statistics; members are named in it only if they opt in (`/settings history`)
````
