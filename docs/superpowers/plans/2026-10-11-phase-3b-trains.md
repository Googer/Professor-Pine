# Phase 3B: Raid Trains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The raid train, built end to end as the third kind of party: `/train` makes one with its post in the region's forum, `/route` gives it a route of gyms (add, remove, move, clear, show, and saved routes to save, load and forget), `/conductor` names who moves it, `/next`, `/previous`, `/skip` and `/finish` (and the private panel behind the post's "Move train…" button) move it from stop to stop with an announcement that pings who wants it, `/boss` says what it is after, members sign up in groups with the same buttons and commands as in a raid, its times work like a meetup's, and the clock archives it. This finishes the building of Phase 3.

**Architecture:** `Party` becomes `RaidParty | MeetupParty | TrainParty`. A train carries `timed: { name, startTime }` (shared with the meetup; `TimedParty` is now a union) and `train: { route, stop, conductorId, boss }`; the stored document gets version 5. Everything that can happen to a train is a pure function in `src/domain/party/train.ts`; a route edit keeps the train at the gym it is at, and an edit that changes where the train is counts as a movement. A train changes on Discord through `TrainService` (`ctx.trains`), which decides inside the store, says a line and gathers the movement announcement (`Gathered`, taken out of `TimedPartyService`). The three older party services and the new one share one skeleton (`storedChange`). Saved routes live in the legacy table `SavedRoutes` behind `SavedRouteRepository`. The train has its own renderer (`renderTrainPost`) over what all posts share, and a private panel (`trainPanel`) whose buttons carry the place and target they were drawn for, so a stale press moves nothing.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies, no migration (`SavedRoutes` is a legacy table; the `Party` table has had the `type` column since plan 2B); the state document goes from version 4 to 5.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: section 9 (Phase 3), 4.1 (row 4), the row `train …` of 4.2, sections 5.1 to 5.3 and 5.5. Phase 3 is two plans: 3A (party kinds and meetups; complete) and **3B** (this one). Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, "For plan 3B (trains)" in "From Phase 3A". The legacy behaviour is digested in the git-ignored `.superpowers/sdd/phase-3-legacy-notes.md`; the design brief with the rulings is `.superpowers/sdd/phase-3b-design.md`.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (2,563 unit tests at the end, and 150 database tests). Two reviewers went through that branch and a third through the fixes; what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **The shape of a train.** `TrainParty` has `timed: { name, startTime }` and `train: { route, stop, conductorId, boss }`. `route` is a list of gym ids, no gym twice, at most 50; `stop` is the index of the current stop, and `stop === route.length` on a route that is not empty means the route is finished (the legacy `length + 1` state is gone). `conductorId` is a member's snowflake. `party.gymId` stays null: the gym of a train is its current stop. State document version 5; versions 1 to 4 are still read.
2. **Groups, one start, no completion.** A train has groups like a raid (up to five, `/group`, the group buttons) and one start for the whole party like a meetup (`/meet`, `/cancel-meet`; no "Set time", a group's own time is refused). Done means leave; there is no Done button. Whoever leaves and is the conductor stops being it, by any way of leaving. The maker is signed up as interested, is always named, and is not the conductor.
3. **The route.** Stops are appended; a gym already on the route is refused; a gym is found as `/location` finds one, and a gym of another region is added without a question. `/route remove stop` and `/route move from to` take stop numbers with autocomplete; `to` is the position afterwards. The current stop follows its gym through every edit. Anybody who is signed up may edit (staff also without being signed up); `/route clear` is for staff (bot management) and the conductor. `/route show` answers privately with the whole route.
4. **An edit that moves the train is a movement** (review ruling): removing the current stop, adding a stop to a finished route, and `/route load` need the right to move the train, put Here back to Coming and are announced. The first stop of an empty route is an ordinary edit: a train without a route is nowhere, so nothing moves and nobody is pinged.
5. **The conductor.** `/conductor set` makes the member who uses it the conductor (they must be signed up; taking over is allowed and said in the post); `/conductor clear` is for the conductor and staff. With a conductor only they and staff (admin, moderator, owner) move the train; without one anybody who is signed up, and staff always.
6. **Movement.** All four moves need a route. Next goes on, and from the last stop finishes the route; Previous goes back, also from finished to the last stop; Skip leaves the next stop out and needs a stop after it; Finish marks the route finished and changes no time. A move to a gym puts everybody who is Here back to Coming, keeping count, group and remote; finishing leaves them Here. The announcement is one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops` (never the mover), gathered for five seconds and worded by where the train is then, by gym and not by stop number; "back" only when every gathered step was Previous; a move taken back within the window says nothing. Earlier announcements stay.
7. **The panel** (Matt, 2026-10-11). The post has one grey button "Move train…" on a row of its own; it answers privately with where the train is, what comes next and the buttons Next · Previous · Skip · Finish (the impossible ones disabled), or with the refusal for who may not move it, or with one sentence on a train without a route. A press updates the panel in place. Each button carries the place it was drawn at, and Next and Skip the stop they lead to: a press that no longer fits moves nothing and shows the panel anew ("The train has moved on meanwhile." / "The route has changed meanwhile."), so two members pressing at once move the train once.
8. **The boss.** `/boss` in a train stores which Pokémon it is after, for the picture and the block with types, weaknesses and catch CP. A typed tier before a name is ignored, a tier alone is refused, any Pokémon the catalogue names outright is accepted also when it is not a current boss, and `none` takes the boss off. Nothing of a raid's `/boss` changes.
9. **Saved routes.** `/route save name` stores the route for the member and the train's region in the legacy table `SavedRoutes`; the same name (without case) replaces; at most 25 per member and region; an empty route and a name of the form `id:<n>` are refused. `/route load route` replaces the route and starts at the first stop, leaving out gyms that no longer exist and what does not fit, and saying so. `/route forget route` deletes one. The autocomplete's value is `id:<n>`, anything typed is a name.
10. **Times, clock, post.** A train's times are a meetup's (decisions 3 to 6 of plan 3A). The archive warning of a train without an end time pings the conductor, or the maker when there is none. The post is titled `Train · <name>` with the tag `Train`, shows the conductor, the times, the current and next stop as links, the route as a numbered list cut around the current stop, the boss, the current gym's notes and the groups; the region's list gets a section for trains; no copies in the remote and EX channels; `/where` gives the current stop.
11. **Not in this plan:** DMs for a new train and `/settings` (Phase 4); importing legacy trains (Phase 8); a deleted gym in a route (Phase 5); gathering a raid group's meeting announcement; a way back from a mistaken Finish to the stop it came from; the look of the posts (the pass before cutover). These go to the follow-ups file.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). Repositories alone know column names. Only `DiscordPartyGateway` calls discord.js for parties.
- Database changes are additive only (this plan has none); `src/db/types.ts` is generated, never edited by hand.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` and the fake interactions.
- A party is never mutated; it changes only through `PartyStore.update`, whose callback is synchronous and decides inside. Never cast a party to a kind.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`. Text written by members or by a feed is shown through `plain()`.
- Nothing is sent into or edited in a post after it was archived: Discord opens an archived post again for that.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context. Invisible characters in test strings are written as `\u` escapes: keep them as escapes (the Write tool turns an escape into the raw character; check with the transcription diff).
- Each task names the commit of the prototype it transcribes (branch `proto/phase-3b` of this repository). `git diff <that commit> -- src test` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting). Check its exit status, not only the end of its output.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash (Git Bash turns it into a path).

## Review Focus

1. A raid and a meetup must behave exactly as before: Task 1, the tests of the three services unchanged over `storedChange`; Task 5, `raid-post.test.ts` and `meetup-post.test.ts` unchanged over the shared rendering, and the summary tests without trains; Task 6, `timed-party-service.test.ts` unchanged over `Gathered`; Task 8, `raid-only.test.ts` and a raid's `/boss` tests unchanged.
2. The train must always be at the gym the members think it is at: Task 3, the tests of `addStop`, `removeStop`, `moveStop`, `replaceRoute` and `clearRoute` in `train.test.ts` (an earlier stop removed, the current one removed, the last one removed, a stop added to a finished route, the first stop of an empty route), and that no edit by a member who may not move the train changes its place.
3. Nobody may be pinged with something untrue, or twice: Task 6, the tests of the gathered announcement in `train-service.test.ts` (two moves in one window, a move taken back, a route edit, clear or load inside the window, "back" only after Previous alone, the mover and who does not allow it never pinged).
4. A stale control must move nothing: Task 9, `move.test.ts` (two panels pressed at once, a panel after the route changed, after the train ended, after the member left or a conductor was set, a press on a copy of the post's message, a burst within the click window).
5. No member of a train reads "raid" or "meetup" wrongly, and no raid-only command throws: Tasks 8 and 9, the sweep at the end of `in-train.test.ts` (every command and control in a train's post, with the odd `/boss` texts).

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
src/services/party-change.test.ts  (create, task 1)
src/services/party-change.ts  (create, task 1)
src/domain/party/train.test.ts  (create, task 2)
src/domain/party/train.ts  (create, task 2)
src/render/timed-post.ts  (create, task 2)
src/domain/party/tick.train.test.ts  (create, task 4)
src/render/train-panel.ts  (create, task 5)
src/render/train-post.test.ts  (create, task 5)
src/render/train-post.ts  (create, task 5)
src/services/gathered.test.ts  (create, task 6)
src/services/gathered.ts  (create, task 6)
src/services/party-service.train.test.ts  (create, task 6)
src/services/train-service.test.ts  (create, task 6)
src/services/train-service.ts  (create, task 6)
src/db/repositories/saved-route-repository.db.test.ts  (create, task 7)
src/db/repositories/saved-route-repository.ts  (create, task 7)
src/services/train-service.routes.test.ts  (create, task 7)
test/support/saved-routes.ts  (create, task 7)
src/commands/parties/in-train.test.ts  (create, task 8)
src/commands/trains/conductor.ts  (create, task 9)
src/commands/trains/move.test.ts  (create, task 9)
src/commands/trains/move.ts  (create, task 9)
src/commands/trains/route.test.ts  (create, task 9)
src/commands/trains/route.ts  (create, task 9)
src/commands/trains/train.test.ts  (create, task 9)
src/commands/trains/train.ts  (create, task 9)
```

---

### Task 1: One skeleton for a change of a party that is decided inside the store

**Files:**
- Create: `src/services/party-change.test.ts`, `src/services/party-change.ts`
- Modify: `src/services/attendance-service.ts`, `src/services/raid-change-service.ts`, `src/services/timed-party-service.ts`

**Interfaces:**
- Consumes: `PartyStore.update`, and the private `apply` methods of `AttendanceService`, `RaidChangeService` and `TimedPartyService`.
- Produces: `storedChange`, `StoredChange` and `anyParty` (`src/services/party-change.ts`): one change decided inside the store, with what the three services did around it (gone, refused with its reason, written or not). The three services use it; their behaviour and their tests are unchanged.

A refactoring only. The tests of the three services are not touched and must pass as they are; `RaidChangeService` keeps its gym locks around the change.

Reference commit of the prototype for this task: `1fb2bfd`.

- [ ] **Step 1: Write the failing tests**

Create `src/services/party-change.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { partyStoreWith, testMeetup, testRaid } from '../../test/support/parties.js';
import { isRaid, refused, setSaved } from '../domain/party/party.js';
import { anyParty, storedChange } from './party-change.js';

describe('storedChange', () => {
  it('stores what the change answers and hands on what else it said', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const stored = await storedChange(store, raid.id, isRaid, (party) => ({
      ok: true as const,
      party: setSaved(party, true),
      why: 'kept',
    }));
    expect(stored).toMatchObject({ kind: 'ok', written: true, extra: { why: 'kept' } });
    expect(stored.kind === 'ok' && stored.party).toBe(store.get(raid.id));
    expect(store.get(raid.id)?.saved).toBe(true);
    expect(storage.writes).toHaveLength(1);
  });

  it('says that nothing was written when the party comes back as it was', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const stored = await storedChange(store, raid.id, anyParty, (party) => ({
      ok: true as const,
      party,
    }));
    expect(stored).toEqual({ kind: 'ok', party: raid, written: false, extra: {} });
    expect(storage.writes).toEqual([]);
  });

  it('hands a refusal on whole, and writes nothing', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const stored = await storedChange(store, raid.id, isRaid, () => ({
      ...refused('gym-taken'),
      other: raid,
    }));
    expect(stored).toMatchObject({
      kind: 'refused',
      refusal: { reason: 'gym-taken', other: raid },
    });
    expect(storage.writes).toEqual([]);
  });

  it('finds no party where there is none, or one of another kind, without asking the change', async () => {
    const meetup = testMeetup();
    const { store } = await partyStoreWith([meetup]);
    const change = () => {
      throw new Error('not to be asked');
    };
    expect(await storedChange(store, meetup.id, isRaid, change)).toEqual({ kind: 'gone' });
    expect(await storedChange(store, 'no-such-party', anyParty, change)).toEqual({ kind: 'gone' });
    expect(store.get(meetup.id)).toBe(meetup);
  });
});
```

Run: `npx vitest run --project unit src/services/party-change.test.ts`
Expected: FAIL (`party-change.ts` does not exist yet).

- [ ] **Step 2: The implementation**

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -40,6 +40,7 @@ import type { Logger } from '../log.js';
 import { standingLine } from '../render/activity.js';
 import { completionQuestion, groupWords } from '../render/party-controls.js';
 import { LIMITS, plain, timestamp, withMentions } from '../render/text.js';
+import { anyParty, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -364,7 +365,8 @@ export class AttendanceService {
         ) => typeof STANDING | string | { text: string; key: string } | undefined),
   ): Promise<AttendanceOutcome<Extra>> {
     const { store, posts, lines } = this.options;
-    const result = await store.update(partyId, (party) => {
+    type Told = Extra & { acted: boolean; withdrawn: string[] };
+    const stored = await storedChange<Party, Told>(store, partyId, anyParty, (party) => {
       const changed = change(party);
       if (!changed.ok) return changed;
       const withdrawn = withdrawQuestions(changed.party);
@@ -375,14 +377,15 @@ export class AttendanceService {
         withdrawn: withdrawn.released,
       };
     });
-    if (!result) return { kind: 'gone' };
-    if (!result.ok) return { kind: 'refused', reason: result.reason };
-    const { party, acted, withdrawn } = result;
+    if (stored.kind === 'gone') return { kind: 'gone' };
+    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.refusal.reason };
+    const { party, extra } = stored;
+    const { acted, withdrawn } = extra;
     const attendee = attendeeOf(party, member.id);
-    if (result.written) posts.changed(partyId);
+    if (stored.written) posts.changed(partyId);
     if (acted) {
       if (line !== 'none' && party.forumPostId !== null) {
-        const given = line ? line(party, result) : STANDING;
+        const given = line ? line(party, extra) : STANDING;
         const text =
           given === STANDING ? attendee && standingLine(party, member.id, attendee) : given;
         if (typeof text === 'object') lines.say(party.forumPostId, text.text, text.key);
@@ -393,8 +396,7 @@ export class AttendanceService {
       lines.say(party.forumPostId, WITHDRAWN_LINE, `withdrawn:${member.id}`);
     }
     if (acted || withdrawn.length > 0) this.settleQuestions(party);
-    const { ok: _ok, written: _written, ...rest } = result;
-    return { ...(rest as unknown as Extra), kind: 'ok', party, attendee, acted, withdrawn };
+    return { ...extra, kind: 'ok', party, attendee, acted, withdrawn };
   }
 
   private inBackground(work: Promise<void>, partyId: string, what: string): void {
```

Create `src/services/party-change.ts`:

```ts
import type { Party, Refusal } from '../domain/party/party.js';
import type { PartyStore } from './party-store.js';

/**
 * What came of one change of a party that was decided inside the store. `gone`: there is no
 * such active party of the kind the change is for. `refused`: the party stays as it was;
 * `refusal` is what the change answered (its `reason`, and whatever else it said). `ok`: the
 * party as it is stored now, with what else the change answered (`extra`); `written` is false
 * when the party already was so.
 */
export type StoredChange<P extends Party, Extra, Refused extends Refusal = Refusal> =
  | { kind: 'gone' }
  | { kind: 'refused'; refusal: Refused }
  | { kind: 'ok'; party: P; written: boolean; extra: Extra };

/** For a change that any kind of party can have. */
export function anyParty(_party: Party): _party is Party {
  return true;
}

/**
 * Runs one change of a party inside the store: the skeleton that the services for what members
 * do share (`AttendanceService`, `RaidChangeService`, `TimedPartyService`, `TrainService`).
 * `change` gets the party as it is at that moment, when it `fits` (a party of another kind is
 * `gone`: there is no such party), and decides there; it answers what a function of
 * `src/domain/party` answers. What the caller does about the outcome (the post, the line in it,
 * the private answer) is its own.
 */
export async function storedChange<P extends Party, Extra, Refused extends Refusal = Refusal>(
  store: Pick<PartyStore, 'update'>,
  partyId: string,
  fits: (party: Party) => party is P,
  change: (party: P) => ({ ok: true; party: P } & Extra) | Refused,
): Promise<StoredChange<P, Extra, Refused>> {
  type Decision =
    ({ ok: true; party: P } & Extra) | Refused | { ok?: undefined; party?: undefined };
  const result = await store.update(partyId, (party): Decision =>
    fits(party) ? change(party) : {},
  );
  if (result?.ok === undefined) return { kind: 'gone' };
  if (!result.ok) return { kind: 'refused', refusal: result };
  const { ok: _ok, party, written, ...rest } = result;
  // What is left of the answer is what the change added to it: the one place that says so.
  return { kind: 'ok', party, written, extra: rest as unknown as Extra };
}
```

Apply to `src/services/raid-change-service.ts`:

```diff
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -3,16 +3,15 @@ import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import { noteMember, releaseAsked } from '../domain/party/attendance.js';
 import {
-  asKindOf,
   isRaid,
   membersWhere,
   refused,
   type Change,
   type GroupId,
-  type Party,
   type PartyProblem,
   type RaidBossRef,
   type RaidParty,
+  type Refusal,
 } from '../domain/party/party.js';
 import {
   blocksNewRaid,
@@ -34,6 +33,7 @@ import type { Logger } from '../log.js';
 import { clockOrDate, plain, timestamp } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import type { GameDataProvider } from './game-data-service.js';
+import { storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { RelocateOutcome } from './party-service.js';
 import type { PartyStore } from './party-store.js';
@@ -113,7 +113,9 @@ function meetingLines(fitted: ReturnType<typeof fitMeetingTimes>): string[] {
   ];
 }
 
-type Decision = Change<RaidParty> | (Change<RaidParty> & { other?: RaidParty });
+/** A refusal of a change of a raid: for `gym-taken` with the raid that holds the gym. */
+type RaidRefusal = Refusal & { other?: RaidParty };
+type Decision = { ok: true; party: RaidParty } | RaidRefusal;
 
 /**
  * What members change about a raid itself: its times, how long it lasts, its boss, the boss's
@@ -370,8 +372,7 @@ export class RaidChangeService {
       let moved = false;
       let meetings: string[] = [];
       let released = false;
-      const decide = (stored: Party): Decision => {
-        const party = asKindOf(before, stored);
+      const decide = (party: RaidParty): Decision => {
         if (party.gymId !== null && !locked.includes(party.gymId)) {
           moved = true;
           return { ok: true, party };
@@ -394,19 +395,17 @@ export class RaidChangeService {
         }
         return { ...changed, party: result };
       };
-      const update = () => store.update(partyId, decide);
-      const result = await locked.reduceRight<() => Promise<Awaited<ReturnType<typeof update>>>>(
+      const update = () =>
+        storedChange<RaidParty, unknown, RaidRefusal>(store, partyId, isRaid, decide);
+      const result = await locked.reduceRight<() => ReturnType<typeof update>>(
         (inner, gymId) => () => store.withGymLock(gymId, inner),
         update,
       )();
       if (moved) continue;
-      if (!result) return { kind: 'gone' };
-      if (!result.ok) {
-        return {
-          kind: 'refused',
-          reason: result.reason,
-          ...('other' in result && result.other ? { other: result.other } : {}),
-        };
+      if (result.kind === 'gone') return { kind: 'gone' };
+      if (result.kind === 'refused') {
+        const { reason, other } = result.refusal;
+        return { kind: 'refused', reason, ...(other ? { other } : {}) };
       }
       if (result.written) {
         posts.changed(partyId);
```

Apply to `src/services/timed-party-service.ts`:

```diff
--- a/src/services/timed-party-service.ts
+++ b/src/services/timed-party-service.ts
@@ -19,6 +19,7 @@ import type { Logger } from '../log.js';
 import { clockOrDay, LIMITS, plain, timestamp, withMentions } from '../render/text.js';
 import type { Member } from './attendance-service.js';
 import { KeyedLock } from './keyed-lock.js';
+import { storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -244,23 +245,20 @@ export class TimedPartyService {
     line?: (party: P) => string | undefined,
   ): Promise<TimedChangeOutcome<Extra, P>> {
     const { store, posts, lines } = this.options;
-    type Decision = Change<P, Extra> | { ok?: undefined; party?: undefined };
-    const result = await store.update(partyId, (party): Decision => {
-      if (!fits(party)) return {};
+    const stored = await storedChange<P, Extra>(store, partyId, fits, (party) => {
       const changed = change(party, this.now());
       if (!changed.ok || changed.party === party) return changed;
       return { ...changed, party: noteMember(changed.party, member.id, member) };
     });
-    if (result?.ok === undefined) return { kind: 'gone' };
-    if (!result.ok) return { kind: 'refused', reason: result.reason };
-    const { party } = result;
-    if (result.written) {
+    if (stored.kind === 'gone') return { kind: 'gone' };
+    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.refusal.reason };
+    const { party } = stored;
+    if (stored.written) {
       posts.changed(partyId);
       const text = line?.(party);
       if (text !== undefined && party.forumPostId !== null) lines.say(party.forumPostId, text);
     }
-    const { ok: _ok, written: _written, ...rest } = result;
-    return { ...(rest as unknown as Extra), kind: 'ok', party, changed: result.written };
+    return { ...stored.extra, kind: 'ok', party, changed: stored.written };
   }
 
   /**
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/party-change.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 1fb2bfd -- src test   # must print nothing
npx prettier --check src/services/attendance-service.ts src/services/party-change.test.ts src/services/party-change.ts src/services/raid-change-service.ts src/services/timed-party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/services/attendance-service.ts src/services/party-change.test.ts src/services/party-change.ts src/services/raid-change-service.ts src/services/timed-party-service.ts
git commit -m "One skeleton for a change of a party that is decided inside the store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,272 unit tests.

---

### Task 2: A party is a raid, a meetup or a train

**Files:**
- Create: `src/domain/party/train.test.ts`, `src/domain/party/train.ts`, `src/render/timed-post.ts`
- Modify: `src/app-context.ts`, `src/commands/admin/save-party.test.ts`, `src/commands/meetups/name-info.test.ts`, `src/commands/parties/attendance.test.ts`, `src/commands/parties/in-meetup.test.ts`, `src/commands/parties/reply.ts`, `src/commands/parties/shout.test.ts`, `src/commands/parties/timed.ts`, `src/db/repositories/party-repository.db.test.ts`, `src/discord/guards.test.ts`, `src/discord/guards.ts`, `src/domain/party/meetup.ts`, `src/domain/party/party-state.test.ts`, `src/domain/party/party-state.ts`, `src/domain/party/party.ts`, `src/domain/party/tick.ts`, `src/domain/party/timed.ts`, `src/render/meetup-post.ts`, `src/services/party-service.meetup.test.ts`, `src/services/party-service.ts`, `src/services/timed-party-service.ts`, `test/support/parties.ts`

**Interfaces:**
- Consumes: The union and the state document of plan 3A (`party.ts`, `party-state.ts`, version 4), `timed.ts`, `meetup.ts`, `meetup-post.ts`, the guards and `reply.ts`, and the places the follow-ups name as saying "meetup" for "timed party".
- Produces: `TrainParty` (`timed: TimedDetails`, `train: TrainDetails { route, stop, conductorId, boss }`), `Party = RaidParty | MeetupParty | TrainParty`, `TimedParty = MeetupParty | TrainParty`, `isTrain`, `MAX_ROUTE_STOPS`; state document version 5 (`PARTY_STATE_VERSION`); `newTimedParty` / `NewTimedParty` (`timed.ts`) under `createMeetup` and the new `createTrain(input): Change<TrainParty>` (`train.ts`, `NewTrain`); `src/render/timed-post.ts` (`TimedPostView`, `TIMED_COLOUR`, `shownAsOver`, `describeTimes`) taken out of the meetup renderer; `IN_A_PARTY_POST` and `A_TIMED_PARTY` naming all kinds; `partyWord` gives `train`; `testTrain()` and `asTrain()` in the test support.

Nothing makes a train before Task 6: until Task 5 `PartyService` cannot show one and says so by throwing. A row of type `train` is read from now on. Several existing sentences change because a third kind exists ("a raid, train or meetup"); their tests change with them.

Reference commit of the prototype for this task: `f9fa9bb`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/admin/save-party.test.ts`:

```diff
--- a/src/commands/admin/save-party.test.ts
+++ b/src/commands/admin/save-party.test.ts
@@ -130,7 +130,7 @@ describe('/admin save-party', () => {
       { channelId: WEST_CHANNEL, thread: undefined },
     );
     expect(elsewhere.followUp).toHaveBeenCalledWith({
-      content: 'Use this in the post of a raid or meetup that is still active.',
+      content: 'Use this in the post of a raid, train or meetup that is still active.',
       flags: MessageFlags.Ephemeral,
     });
     expect(made.current().saved).toBe(false);
```

Apply to `src/commands/meetups/name-info.test.ts`:

```diff
--- a/src/commands/meetups/name-info.test.ts
+++ b/src/commands/meetups/name-info.test.ts
@@ -21,6 +21,9 @@ import { info, INFO_INPUT, INFO_KIND, infoControls, infoForm, refusedWithText }
 const RAID_POST = '300000000000000055';
 const NOT_A_MEETUP = 'This is the post of a raid: that only works in the post of a meetup.';
 const NO_POST = 'Use this in the post of a meetup that is still active.';
+/** `/name` is for every party that has a name: a train as well. */
+const NOT_NAMED = 'This is the post of a raid: that only works in the post of a train or meetup.';
+const NO_NAMED_POST = 'Use this in the post of a train or meetup that is still active.';
 
 /** The inputs of the one row of a form. */
 function inputsOf(form: ReturnType<typeof infoForm>) {
@@ -149,13 +152,13 @@ describe('/name', () => {
 
   it('is for the post of a meetup: not for a raid, and not for any other place', async () => {
     const made = await setup();
-    expect(await made.answer('name', { name: 'Picnic' }, made.inRaid)).toBe(NOT_A_MEETUP);
+    expect(await made.answer('name', { name: 'Picnic' }, made.inRaid)).toBe(NOT_NAMED);
     expect(await made.answer('name', { name: 'Picnic' }, { channelId: WEST_CHANNEL })).toBe(
-      NO_POST,
+      NO_NAMED_POST,
     );
     expect(made.store.get(made.raid.id)).toBe(made.raid);
     await made.service.end(made.party.id);
-    expect(await made.answer('name', { name: 'Picnic' })).toBe(NO_POST);
+    expect(await made.answer('name', { name: 'Picnic' })).toBe(NO_NAMED_POST);
   });
 });
 
```

Apply to `src/commands/parties/attendance.test.ts`:

```diff
--- a/src/commands/parties/attendance.test.ts
+++ b/src/commands/parties/attendance.test.ts
@@ -199,12 +199,12 @@ describe('the attendance commands', () => {
     for (const command of all) {
       const extra = command === group ? { ...elsewhere, subcommand: 'new' } : elsewhere;
       expect(await made.answer(command.data.name, {}, extra)).toBe(
-        'Use this in the post of a raid or meetup that is still active.',
+        'Use this in the post of a raid, train or meetup that is still active.',
       );
     }
     await made.store.update(made.party.id, (party) => ({ party: endParty(party) }));
     expect(await made.answer('join')).toBe(
-      'Use this in the post of a raid or meetup that is still active.',
+      'Use this in the post of a raid, train or meetup that is still active.',
     );
   });
 
```

Apply to `src/commands/parties/in-meetup.test.ts`:

```diff
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -649,7 +649,7 @@ describe('the other commands in the post of a meetup', () => {
       `This meetup was closed by <@${ALICE}>.`,
     );
     expect(await made.answer('join')).toBe(
-      'Use this in the post of a raid or meetup that is still active.',
+      'Use this in the post of a raid, train or meetup that is still active.',
     );
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
-      'Use this in the post of a raid or meetup that is still active.',
+      'Use this in the post of a raid, train or meetup that is still active.',
     );
     expect(made.gateway.messagesIn(made.postId)).toEqual([]);
   });
```

Apply to `src/db/repositories/party-repository.db.test.ts`:

```diff
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -8,10 +8,11 @@ import {
   testMeetup,
   testRaid,
   testRaidRules,
+  testTrain,
   withAttendees,
 } from '../../../test/support/parties.js';
 import { endParty } from '../../domain/party/party.js';
-import type { MeetupParty, RaidParty } from '../../domain/party/party.js';
+import type { MeetupParty, RaidParty, TrainParty } from '../../domain/party/party.js';
 import { setHatchTime } from '../../domain/party/raid.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import type { DB } from '../types.js';
@@ -134,6 +135,66 @@ describe('PartyRepository', () => {
     expect(await parties.listActive()).toEqual({ parties: [], unreadable: [] });
   });
 
+  /** A train with times, a route it is half-way along, a conductor, a boss and two groups. */
+  function fullTrain(n = 1): TrainParty {
+    const train = withAttendees(testTrain({ id: ID(n), name: 'Saturday “legendaries” 🚂' }), {
+      [ALICE]: { status: PartyStatus.Present, number: 2, group: 'B' },
+    });
+    return {
+      ...train,
+      forumChannelId: FORUM,
+      forumPostId: String(BigInt(POST) + BigInt(n)),
+      regionLinkMessageId: '1234567890123456600',
+      endTime: PARTY_NOW + 180 * MINUTE,
+      lastPossibleTime: PARTY_NOW + 180 * MINUTE,
+      groups: [{ id: 'A' }, { id: 'B', label: 'by car' }],
+      defaultGroupId: 'B',
+      timed: { ...train.timed, startTime: PARTY_NOW + 60 * MINUTE },
+      train: { route: [2, 1], stop: 1, conductorId: ALICE, boss: { key: 'yveltal' } },
+    };
+  }
+
+  it('stores a new train and reads it back exactly, by itself and in the list', async () => {
+    const train = fullTrain();
+    await parties.insert(train);
+    expect(await parties.findById(train.id)).toEqual({ ok: true, party: train });
+    expect(await parties.listActive()).toEqual({ parties: [train], unreadable: [] });
+    const row = await db
+      .selectFrom('Party')
+      .select(['type', 'gymId', 'hatchTime', 'endTime'])
+      .where('id', '=', train.id)
+      .executeTakeFirstOrThrow();
+    // The gym of a train is the stop it is at, in the document: the column stays empty.
+    expect(row).toEqual({
+      type: 'train',
+      gymId: null,
+      hatchTime: null,
+      endTime: String(PARTY_NOW + 180 * MINUTE),
+    });
+  });
+
+  it('saves the changes of a train: its route, where it is, its conductor and boss', async () => {
+    const train = fullTrain();
+    await parties.insert(train);
+    const changed: TrainParty = {
+      ...train,
+      train: { route: [1], stop: 1, conductorId: null, boss: { name: 'Newmon' } },
+      updatedAt: PARTY_NOW + 5,
+    };
+    expect(await parties.save(changed)).toBe(true);
+    expect(await parties.findById(train.id)).toEqual({ ok: true, party: changed });
+    expect(await parties.save(endParty(changed))).toBe(true);
+    expect(await parties.listActive()).toEqual({ parties: [], unreadable: [] });
+  });
+
+  it('reports a train row whose document is that of a meetup, and leaves it alone', async () => {
+    await parties.insert(fullMeetup());
+    await sql`update Party set type = 'train' where id = ${ID(1)}`.execute(db);
+    expect((await parties.listActive()).unreadable).toMatchObject([
+      { id: ID(1), problem: 'a train without its train details' },
+    ]);
+  });
+
   it('reports a meetup row with what only a raid has, and leaves it alone', async () => {
     await parties.insert(fullMeetup());
     await sql`update Party set gymId = 1 where id = ${ID(1)}`.execute(db);
@@ -260,7 +321,8 @@ describe('PartyRepository', () => {
       },
       {
         id: ID(3),
-        problem: 'a party of type "train"',
+        // The row says train, its document is that of a raid.
+        problem: 'a train without its name and start',
         forumChannelId: null,
         forumPostId: null,
       },
```

Apply to `src/discord/guards.test.ts`:

```diff
--- a/src/discord/guards.test.ts
+++ b/src/discord/guards.test.ts
@@ -1,7 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import { fakeAutocomplete, fakeChatInput } from '../../test/support/fake-interactions.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
-import { partyStoreWith, testMeetup, testRaid } from '../../test/support/parties.js';
+import { partyStoreWith, testMeetup, testRaid, testTrain } from '../../test/support/parties.js';
 import { TestRegions } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { GuardableInteraction, LocatedInteraction } from './command.js';
@@ -19,10 +19,12 @@ import {
   requireBotManagement,
   requireGuild,
   requireManagement,
+  requireMeetup,
   requireParty,
   requirePvpContext,
   requireRaid,
   requireRegion,
+  requireTimed,
 } from './guards.js';
 
 const OWNER = '223456789012345678'; // TEST_ENV.OWNER_ID
@@ -213,7 +215,7 @@ describe('party posts', () => {
       requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), withRaid),
     ).not.toThrow();
     expect(() => requireParty(as(fakeChatInput({ channelId: WEST_CHANNEL })), withRaid)).toThrow(
-      'Use this in the post of a raid or meetup that is still active.',
+      'Use this in the post of a raid, train or meetup that is still active.',
     );
     expect(() => requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), ctx)).toThrow(
       UserError,
@@ -261,4 +263,30 @@ describe('party posts', () => {
     expect(raidOf(as(fakeChatInput({ channelId: MEETUP_POST, thread: {} })), both)).toBeUndefined();
     expect(raidOf(as(fakeChatInput({ channelId: WEST_CHANNEL })), both)).toBeUndefined();
   });
+
+  it('takes a train for a party and a timed party, and for neither a raid nor a meetup', async () => {
+    const TRAIN_POST = '300000000000000003';
+    const train = { ...testTrain(), forumPostId: TRAIN_POST };
+    const raid = { ...testRaid(), forumPostId: POST };
+    const { store } = await partyStoreWith([raid, train]);
+    const { ctx: both } = createTestContext({ parties: store });
+    const inTrain = as(fakeChatInput({ channelId: TRAIN_POST, thread: {} }));
+    expect(partyOf(inTrain, both)).toBe(train);
+    expect(() => requireParty(inTrain, both)).not.toThrow();
+    expect(() => requireTimed(inTrain, both)).not.toThrow();
+    expect(raidOf(inTrain, both)).toBeUndefined();
+    expect(() => requireRaid(inTrain, both)).toThrow(
+      'This is the post of a train: that only works in the post of a raid.',
+    );
+    expect(() => requireMeetup(inTrain, both)).toThrow(
+      'This is the post of a train: that only works in the post of a meetup.',
+    );
+    const inRaid = as(fakeChatInput({ channelId: POST, thread: {} }));
+    expect(() => requireTimed(inRaid, both)).toThrow(
+      'This is the post of a raid: that only works in the post of a train or meetup.',
+    );
+    expect(() => requireTimed(as(fakeChatInput({ channelId: WEST_CHANNEL })), both)).toThrow(
+      'Use this in the post of a train or meetup that is still active.',
+    );
+  });
 });
```

Apply to `src/domain/party/party-state.test.ts`:

```diff
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -6,16 +6,19 @@ import {
   REPORTER,
   testMeetup,
   testRaid,
+  testTrain,
   withAttendees,
 } from '../../../test/support/parties.js';
 import { partyFromStored, partyMirrors, partyState, type PartyColumns } from './party-state.js';
 import {
   MAX_MEETUP_DESCRIPTION,
   MAX_PARTY_NAME,
+  MAX_ROUTE_STOPS,
   type MeetupParty,
   type MirrorMessage,
   type Party,
   type RaidParty,
+  type TrainParty,
 } from './party.js';
 import { PartyStatus } from './status.js';
 
@@ -65,9 +68,10 @@ function columnsOf(party: Party): PartyColumns {
     prompts: _f,
     ...rest
   } = party;
-  // The parts of its kind (`raid`, `timed`, `meetup`) are in the document, not in a column.
+  // The parts of its kind (`raid`, `timed`, `meetup`, `train`) are in the document, not in a
+  // column.
   const columns = Object.fromEntries(
-    Object.entries(rest).filter(([key]) => !['raid', 'timed', 'meetup'].includes(key)),
+    Object.entries(rest).filter(([key]) => !['raid', 'timed', 'meetup', 'train'].includes(key)),
   ) as PartyColumns;
   return { ...columns, mirrorMessages: [] };
 }
@@ -125,7 +129,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(4);
+    expect(state.v).toBe(5);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -161,8 +165,11 @@ describe('party state', () => {
       const result = partyFromStored(c, s, m);
       return result.ok ? 'read' : result.problem;
     };
-    expect(problem(state, { ...columns, type: 'train' })).toBe('a party of type "train"');
-    expect(problem({ ...state, v: 5 })).toMatch(/^state: /);
+    expect(problem(state, { ...columns, type: 'carnival' })).toBe('a party of type "carnival"');
+    expect(problem(state, { ...columns, type: 'train' })).toBe(
+      'a train without its name and start',
+    );
+    expect(problem({ ...state, v: 6 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -271,7 +278,10 @@ describe('party state', () => {
       'a meetup with a hatch time',
     );
     expect(problem({ ...columnsOf(meetup), type: 'train' }, meetupState)).toBe(
-      'a party of type "train"',
+      'a train without its train details',
+    );
+    expect(problem({ ...columnsOf(meetup), type: 'carnival' }, meetupState)).toBe(
+      'a party of type "carnival"',
     );
   });
 
@@ -493,3 +503,161 @@ describe('writing a party state', () => {
     expect(() => partyState(nameless)).toThrow(/name/);
   });
 });
+
+/** A train with everything a state document can hold for one. */
+function fullTrain(): TrainParty {
+  const train = withAttendees(testTrain(), {
+    [ALICE]: {
+      status: PartyStatus.Present,
+      number: 2,
+      remote: true,
+      name: 'Alice',
+      team: 'mystic',
+    },
+    [BOB]: { group: 'B' },
+  });
+  return {
+    ...train,
+    forumChannelId: '300000000000000010',
+    forumPostId: '300000000000000011',
+    endTime: PARTY_NOW + 7_200_000,
+    lastPossibleTime: PARTY_NOW + 7_200_000,
+    groups: [{ id: 'A', label: 'drivers' }, { id: 'B' }],
+    defaultGroupId: 'B',
+    prompts: { completion: [], warning: '300000000000000004' },
+    timed: { ...train.timed, startTime: PARTY_NOW + 3_600_000 },
+    train: { route: [4, 1, 7], stop: 1, conductorId: ALICE, boss: { key: 'yveltal' } },
+  };
+}
+
+describe('the state of a train', () => {
+  const problem = (columns: PartyColumns, state: unknown): string => {
+    const result = partyFromStored(columns, state, []);
+    return result.ok ? 'read' : result.problem;
+  };
+
+  it('brings a train back from storage exactly as it went in', () => {
+    const train = fullTrain();
+    const back = partyFromStored(columnsOf(train), stored(partyState(train)), []);
+    expect(back).toEqual({ ok: true, party: train });
+    // One that was just made: no route, no conductor, no boss.
+    const fresh = testTrain();
+    expect(partyFromStored(columnsOf(fresh), stored(partyState(fresh)), [])).toEqual({
+      ok: true,
+      party: fresh,
+    });
+  });
+
+  it('stores the parts of a train: what every timed party has, and its own', () => {
+    const state = partyState(fullTrain());
+    expect(Object.keys(state).sort()).toEqual([
+      'anonymous',
+      'attendees',
+      'defaultGroupId',
+      'groups',
+      'prompts',
+      'timed',
+      'train',
+      'v',
+    ]);
+    expect(state.timed).toEqual({ name: 'Saturday legendaries', startTime: PARTY_NOW + 3_600_000 });
+    expect(state.train).toEqual({
+      route: [4, 1, 7],
+      stop: 1,
+      conductorId: ALICE,
+      boss: { key: 'yveltal' },
+    });
+    expect(partyState(testTrain()).train).toEqual({
+      route: [],
+      stop: 0,
+      conductorId: null,
+      boss: null,
+    });
+  });
+
+  it('keeps a finished route, and a boss known only by the name of the feed', () => {
+    const train: TrainParty = {
+      ...fullTrain(),
+      train: { route: [4, 1, 7], stop: 3, conductorId: null, boss: { name: 'Newmon' } },
+    };
+    expect(partyFromStored(columnsOf(train), stored(partyState(train)), [])).toEqual({
+      ok: true,
+      party: train,
+    });
+  });
+
+  it('reports a row whose document is not that of a train', () => {
+    const train = fullTrain();
+    const state = stored(partyState(train)) as Record<string, unknown>;
+    const meetupState = stored(partyState(testMeetup())) as Record<string, unknown>;
+    const raidState = stored(partyState(testRaid())) as Record<string, unknown>;
+    expect(problem(columnsOf(train), state)).toBe('read');
+    expect(problem(columnsOf(train), { ...state, train: undefined })).toBe(
+      'a train without its train details',
+    );
+    expect(problem(columnsOf(train), { ...state, timed: undefined })).toBe(
+      'a train without its name and start',
+    );
+    expect(problem(columnsOf(train), { ...state, meetup: meetupState.meetup })).toBe(
+      'a train with the details of a meetup',
+    );
+    expect(problem(columnsOf(train), { ...state, raid: raidState.raid })).toBe(
+      'a train with the details of a raid',
+    );
+    expect(problem(columnsOf(testMeetup()), { ...meetupState, train: state.train })).toBe(
+      'a meetup with the details of a train',
+    );
+    expect(problem(columnsOf(testRaid()), { ...raidState, train: state.train })).toBe(
+      'a raid with the details of a train',
+    );
+    // The gym of a train is the stop it is at: the column of a raid stays empty.
+    expect(problem({ ...columnsOf(train), gymId: 4 }, state)).toBe('a train with a gym');
+    expect(problem({ ...columnsOf(train), hatchTime: PARTY_NOW }, state)).toBe(
+      'a train with a hatch time',
+    );
+  });
+
+  it('refuses the details of a train that no train can have, when read and when written', () => {
+    const train = fullTrain();
+    const state = stored(partyState(train)) as Record<string, unknown>;
+    const withTrain = (details: object): string =>
+      problem(columnsOf(train), { ...state, train: { ...train.train, ...details } });
+    expect(withTrain({})).toBe('read');
+    expect(withTrain({ route: [4, 1, 4] })).toMatch(/a gym is on the route twice/);
+    expect(withTrain({ route: [4, 1.5] })).toMatch(/^state: /);
+    expect(withTrain({ route: [0] })).toMatch(/^state: /);
+    expect(withTrain({ route: ['4'] })).toMatch(/^state: /);
+    expect(withTrain({ stop: 4 })).toMatch(/the train is at a stop beyond its route/);
+    expect(withTrain({ stop: -1 })).toMatch(/^state: /);
+    expect(withTrain({ route: [], stop: 1 })).toMatch(/beyond its route/);
+    expect(withTrain({ route: [], stop: 0 })).toBe('read');
+    expect(withTrain({ conductorId: 'Alice' })).toMatch(/^state: /);
+    expect(withTrain({ conductorId: undefined })).toMatch(/^state: /);
+    expect(withTrain({ boss: {} })).toMatch(/^state: /);
+    const fifty = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1);
+    expect(withTrain({ route: fifty })).toBe('read');
+    expect(withTrain({ route: [...fifty, 51] })).toMatch(/^state: /);
+    // Such a train is never written either.
+    expect(() => partyState({ ...train, train: { ...train.train, route: [4, 4] } })).toThrow(
+      /cannot be stored/,
+    );
+    expect(() => partyState({ ...train, train: { ...train.train, stop: 9 } })).toThrow(
+      /cannot be stored/,
+    );
+  });
+
+  it('reads a version 4 document, which is a raid or a meetup and never a train', () => {
+    const meetup = testMeetup();
+    const old = stored({ ...partyState(meetup), v: 4 });
+    expect(partyFromStored(columnsOf(meetup), old, [])).toEqual({ ok: true, party: meetup });
+    const raid = fullRaid();
+    expect(
+      partyFromStored(columnsOf(raid), stored({ ...partyState(raid), v: 4 }), raid.mirrorMessages),
+    ).toEqual({ ok: true, party: raid });
+    // Version 4 knew no trains: what such a document says of one is not read.
+    const train = fullTrain();
+    expect(problem(columnsOf(train), stored({ ...partyState(train), v: 4 }))).toBe(
+      'a train without its train details',
+    );
+  });
+});
```

Create `src/domain/party/train.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PARTY_NOW,
  REPORTER,
  testMeetup,
  testRaid,
  testTrain,
} from '../../../test/support/parties.js';
import {
  hasGroups,
  isMeetup,
  isRaid,
  isTimed,
  isTrain,
  partyWord,
  remoteAllowed,
} from './party.js';
import { PartyStatus } from './status.js';
import { OPEN_PARTY_HOURS } from './timed.js';
import { createTrain } from './train.js';

const HOUR = 3_600_000;

describe('createTrain', () => {
  it('makes a train with its name and nothing else, in the region it was made in', () => {
    const made = createTrain({
      id: '00000000-0000-4000-8000-000000000009',
      guildId: 7,
      regionId: 2,
      createdById: REPORTER,
      name: 'Saturday legendaries',
      now: PARTY_NOW,
    });
    expect(made).toMatchObject({
      ok: true,
      party: {
        id: '00000000-0000-4000-8000-000000000009',
        type: 'train',
        guildId: 7,
        regionId: 2,
        status: 'active',
        // The column of a raid: the gym of a train is the stop it is at.
        gymId: null,
        hatchTime: null,
        endTime: null,
        forumPostId: null,
        createdById: REPORTER,
        anonymous: false,
        saved: false,
        createdAt: PARTY_NOW,
        timed: { name: 'Saturday legendaries', startTime: null },
        train: { route: [], stop: 0, conductorId: null, boss: null },
      },
    });
  });

  it('signs up who made it as interested in group A, and not as the conductor', () => {
    const train = testTrain();
    expect(train.attendees).toEqual({
      [REPORTER]: { number: 1, status: PartyStatus.Interested, group: 'A', remote: false },
    });
    expect(train.groups).toEqual([{ id: 'A' }]);
    expect(train.defaultGroupId).toBe('A');
    expect(train.train.conductorId).toBeNull();
  });

  it('counts a train without times as going on for a day after it was made', () => {
    expect(testTrain().lastPossibleTime).toBe(PARTY_NOW + OPEN_PARTY_HOURS * HOUR);
    expect(testTrain().deletionTime).toBeNull();
  });

  it('tidies the name as a meetup does, and refuses a text that is no name', () => {
    expect(testTrain({ name: '  Saturday \n  legendaries\t' }).timed.name).toBe(
      'Saturday legendaries',
    );
    const refusal = { ok: false, reason: 'bad-name' };
    const input = { id: 'x', guildId: 1, regionId: 1, createdById: REPORTER, now: PARTY_NOW };
    expect(createTrain({ ...input, name: '   ' })).toEqual(refusal);
    expect(createTrain({ ...input, name: 'x'.repeat(81) })).toEqual(refusal);
    expect(createTrain({ ...input, name: 'x'.repeat(80) }).ok).toBe(true);
  });
});

describe('a train among the kinds of party', () => {
  const [raid, meetup, train] = [testRaid(), testMeetup(), testTrain()];

  it('is a timed party like a meetup, and neither a raid nor a meetup', () => {
    expect([raid, meetup, train].map(isTimed)).toEqual([false, true, true]);
    expect([raid, meetup, train].map(isTrain)).toEqual([false, false, true]);
    expect([raid, meetup, train].map(isMeetup)).toEqual([false, true, false]);
    expect([raid, meetup, train].map(isRaid)).toEqual([true, false, false]);
  });

  it('has groups like a raid, and can be joined remotely', () => {
    expect([raid, meetup, train].map(hasGroups)).toEqual([true, false, true]);
    expect(remoteAllowed(train)).toBe(true);
  });

  it('is called a train in a sentence', () => {
    expect(partyWord(train)).toBe('train');
  });
});
```

Apply to `src/services/party-service.meetup.test.ts`:

```diff
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -78,9 +78,7 @@ describe('PartyService.createMeetup', () => {
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Meetup · Community Day picnic' });
     expect(tagsOf(made)).toEqual(['Meetup']);
-    expect(post?.message).toEqual(
-      renderMeetupPost(made.service.meetupView(made.current())).message,
-    );
+    expect(post?.message).toEqual(renderMeetupPost(made.service.timedView(made.current())).message);
     expect(post?.message.components).toEqual(partyControls(made.current()));
   });
 
```

Apply to `test/support/parties.ts`:

```diff
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -4,8 +4,16 @@ import { loadSettings } from '../../src/config/settings.js';
 import type { PartyList, PartyStorage } from '../../src/db/repositories/party-repository.js';
 import { partyFromStored, partyMirrors, partyState } from '../../src/domain/party/party-state.js';
 import { createMeetup, type NewMeetup } from '../../src/domain/party/meetup.js';
-import type { Attendee, MeetupParty, Party, RaidParty } from '../../src/domain/party/party.js';
+import type {
+  Attendee,
+  MeetupParty,
+  Party,
+  RaidParty,
+  TrainParty,
+} from '../../src/domain/party/party.js';
 import { createRaid, type NewRaid } from '../../src/domain/party/raid.js';
+import { createTrain, type NewTrain } from '../../src/domain/party/train.js';
+
 import { PartyStatus } from '../../src/domain/party/status.js';
 import { raidDurationRules, type RaidDurationRules } from '../../src/domain/time/raid-durations.js';
 import { PartyStore, type PartyProvider } from '../../src/services/party-store.js';
@@ -97,6 +105,31 @@ export function testMeetup(overrides: Partial<NewMeetup> = {}): MeetupParty {
   return made.party;
 }
 
+/**
+ * A raid train called "Saturday legendaries" in region 1, made at `PARTY_NOW` by `REPORTER`,
+ * who is signed up as interested. It has no route, no conductor, no boss and no times, and
+ * nothing of it exists on Discord yet.
+ */
+export function testTrain(overrides: Partial<NewTrain> = {}): TrainParty {
+  const made = createTrain({
+    id: '00000000-0000-4000-8000-000000000003',
+    guildId: 1,
+    regionId: 1,
+    createdById: REPORTER,
+    name: 'Saturday legendaries',
+    now: PARTY_NOW,
+    ...overrides,
+  });
+  if (!made.ok) throw new Error(`bad test train: ${made.reason}`);
+  return made.party;
+}
+
+/** The party as the train it is, for a test that reads or changes what only a train has. */
+export function asTrain(party: Party | undefined): TrainParty {
+  if (party?.type !== 'train') throw new Error(`not a train: ${party?.type ?? 'no party'}`);
+  return party;
+}
+
 /** The party as the raid it is, for a test that reads or changes what only a raid has. */
 export function asRaid(party: Party | undefined): RaidParty {
   if (party?.type !== 'raid') throw new Error(`not a raid: ${party?.type ?? 'no party'}`);
@@ -133,7 +166,7 @@ function survivesStorage(party: Party): void {
   const { defaultGroupId: _defaultGroupId, prompts: _prompts, ...kept } = rest;
   // The details of its kind are in the document, the rest are the columns.
   const columns = Object.fromEntries(
-    Object.entries(kept).filter(([key]) => !['raid', 'timed', 'meetup'].includes(key)),
+    Object.entries(kept).filter(([key]) => !['raid', 'timed', 'meetup', 'train'].includes(key)),
   ) as typeof kept;
   const document: unknown = JSON.parse(JSON.stringify(partyState(party)));
   const mirrors: unknown = JSON.parse(JSON.stringify(partyMirrors(party)));
```

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/attendance.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/shout.test.ts src/discord/guards.test.ts src/domain/party/party-state.test.ts src/domain/party/train.test.ts src/services/party-service.meetup.test.ts`
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
-  /** What members change about a meetup (a train later): its name, its times, what it says. */
+  /** What members change about a meetup or a train: its name, its times, what a meetup says. */
   readonly timedParties: TimedPartyService;
   /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
   readonly clickAnswers: ClickAnswers;
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -75,15 +75,15 @@ export function commandRaid(interaction: ChatInputCommandInteraction, ctx: AppCo
 
 /**
  * The timed party of the post a command was used in (`requireTimed` has checked it), as
- * `commandRaid` gives the raid. It ended in between: it is a timed party that is over, which
- * today can only be a meetup.
+ * `commandRaid` gives the raid. When it ended in between, nothing says any more whether it was
+ * a train or a meetup: it is spoken of without a kind.
  */
 export function commandTimed(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
 ): TimedParty {
   const party = partyOf(interaction, ctx);
-  if (!party) throw new UserError(partyOver({ type: 'meetup' }));
+  if (!party) throw new UserError(partyOver());
   if (!isTimed(party)) throw new UserError(notTimed(party));
   return party;
 }
```

Apply to `src/commands/parties/timed.ts`:

```diff
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -25,7 +25,7 @@ export const TIMED_TIME_HINT =
 type Ok<Extra> = Extract<TimedChangeOutcome<Extra>, { kind: 'ok' }>;
 
 /**
- * A time a member typed for a timed party that exists (a meetup; a train from plan 3B): when it
+ * A time a member typed for a timed party that exists (a meetup or a train): when it
  * starts (`meet`) or when it ends. `'unset'` when the member asked to remove it (`cancel`,
  * `none`, `unset`). Throws a `UserError` for a text that is no time or lies outside what the
  * party can have: a start from now, an end from the start or from now, both within some three
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -152,7 +152,8 @@ export function partyOf(interaction: LocatedInteraction, ctx: AppContext): Party
 }
 
 /** What a member is told who uses a command for the post of a party anywhere else. */
-export const IN_A_PARTY_POST = 'Use this in the post of a raid or meetup that is still active.';
+export const IN_A_PARTY_POST =
+  'Use this in the post of a raid, train or meetup that is still active.';
 
 /**
  * For commands that act on the party of the post they are used in. The guard does not hand the
@@ -201,9 +202,9 @@ export const requireRaid: Guard = requirePartyOf(isRaid, 'a raid');
 
 /**
  * The kinds of party that have a name and times of their own (`TimedParty`), as a sentence
- * names where a command for them works. Plan 3B adds the train here: "a meetup or a train".
+ * names where a command for them works.
  */
-export const A_TIMED_PARTY = 'a meetup';
+export const A_TIMED_PARTY = 'a train or meetup';
 
 /** What a member is told who uses something that is for timed parties in the post of a raid. */
 export function notTimed(party: Pick<Party, 'type'>): string {
```

Apply to `src/domain/party/meetup.ts`:

```diff
--- a/src/domain/party/meetup.ts
+++ b/src/domain/party/meetup.ts
@@ -1,25 +1,7 @@
-import {
-  MAX_MEETUP_DESCRIPTION,
-  NO_PROMPTS,
-  refused,
-  type Change,
-  type MeetupParty,
-} from './party.js';
-import { PartyStatus } from './status.js';
-import { settled, tidyName } from './timed.js';
+import { MAX_MEETUP_DESCRIPTION, refused, type Change, type MeetupParty } from './party.js';
+import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js';
 
-export interface NewMeetup {
-  /** A fresh UUID. */
-  id: string;
-  guildId: number;
-  /** The region it was made in: its post goes into that region's forum. */
-  regionId: number;
-  /** Snowflake of the member who makes it. */
-  createdById: string;
-  /** As the member typed it; it is tidied here (`tidyName`). */
-  name: string;
-  now: number;
-}
+export type NewMeetup = NewTimedParty;
 
 /**
  * A new meetup: a name and nothing else yet, with the member who made it signed up as
@@ -31,42 +13,12 @@ export interface NewMeetup {
 export function createMeetup(input: NewMeetup): Change<MeetupParty> {
   const name = tidyName(input.name);
   if (name === undefined) return refused('bad-name');
-  const { now } = input;
   const meetup: MeetupParty = {
-    id: input.id,
+    ...newTimedParty(input, name),
     type: 'meetup',
-    guildId: input.guildId,
-    status: 'active',
-    regionId: input.regionId,
-    gymId: null,
-    forumChannelId: null,
-    forumPostId: null,
-    regionLinkMessageId: null,
-    mirrorMessages: [],
-    createdById: input.createdById,
-    anonymous: false,
-    hatchTime: null,
-    endTime: null,
-    lastPossibleTime: null,
-    deletionTime: null,
-    saved: false,
-    createdAt: now,
-    updatedAt: now,
-    attendees: {
-      [input.createdById]: {
-        number: 1,
-        status: PartyStatus.Interested,
-        group: 'A',
-        remote: false,
-      },
-    },
-    groups: [{ id: 'A' }],
-    defaultGroupId: 'A',
-    prompts: NO_PROMPTS,
-    timed: { name, startTime: null },
     meetup: { description: null },
   };
-  return { ok: true, party: settled(meetup, now) };
+  return { ok: true, party: settled(meetup, input.now) };
 }
 
 /**
```

Apply to `src/domain/party/party-state.ts`:

```diff
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -2,11 +2,11 @@ import { z } from 'zod';
 import { RAID_LEVELS, raidTier } from '../pogo/raid-tier.js';
 import {
   GROUP_IDS,
-  isRaid,
   MAX_COMPLETION_PROMPTS,
   MAX_MEETUP_DESCRIPTION,
   MAX_PARTY_NAME,
   MAX_MEMBER_NAME,
+  MAX_ROUTE_STOPS,
   MIRROR_KINDS,
   TEAMS,
   type Attendee,
@@ -29,10 +29,11 @@ import { PartyStatus } from './status.js';
  * question of a version 2 document is read as one that asked nobody in particular. Version 4
  * (plan 3A) added `timed` (the name and the start of a party that has them) and `meetup` (what
  * only a meetup has) beside `raid`: a document has the parts that fit its party's type and no
- * others. A train (plan 3B) will be `timed` and a part of its own. Documents of versions 1 to 3
- * are those of raids.
+ * others. Version 5 (plan 3B) added `train` (the route, the stop the train is at, its conductor
+ * and its boss): a train is `timed` and `train`. Documents of versions 1 to 3 are those of
+ * raids, and one of version 4 is that of a raid or a meetup.
  */
-export const PARTY_STATE_VERSION = 4;
+export const PARTY_STATE_VERSION = 5;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -84,11 +85,14 @@ const tier = z
     error: 'this level has no shadow raids',
   });
 
+const bossRef = z.union([
+  z.object({ key: z.string().min(1) }),
+  z.object({ name: z.string().min(1) }),
+]);
+
 const raid = z.object({
   tier,
-  boss: z
-    .union([z.object({ key: z.string().min(1) }), z.object({ name: z.string().min(1) })])
-    .nullable(),
+  boss: bossRef.nullable(),
   reportedHatched: z.boolean(),
   fastMove: z.string().nullable(),
   chargedMove: z.string().nullable(),
@@ -105,6 +109,20 @@ const meetup = z.object({
   description: z.string().min(1).max(MAX_MEETUP_DESCRIPTION).nullable(),
 });
 
+const train = z
+  .object({
+    route: z.array(z.number().int().positive()).max(MAX_ROUTE_STOPS),
+    stop: z.number().int().nonnegative(),
+    conductorId: snowflake.nullable(),
+    boss: bossRef.nullable(),
+  })
+  .refine((value) => new Set(value.route).size === value.route.length, {
+    error: 'a gym is on the route twice',
+  })
+  .refine((value) => value.stop <= value.route.length, {
+    error: 'the train is at a stop beyond its route',
+  });
+
 /** What does not hold between the parts of a document, whatever its version. */
 function inconsistencies(value: {
   groups: { id: string }[];
@@ -136,6 +154,7 @@ const state = z
     ...shared,
     timed: timed.optional(),
     meetup: meetup.optional(),
+    train: train.optional(),
     /**
      * A list, in the order the members signed up, and not an object by member: MySQL sorts the
      * keys of a JSON object, which would put the attendees in the order of their snowflakes.
@@ -147,6 +166,20 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 4, as plan 3A wrote it: read only. It is version 5 without a train. */
+const stateV4 = z
+  .object({
+    v: z.literal(4),
+    ...shared,
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 3, as plans 2D-2 to 2E-2 wrote it: read only. It is version 4 with `raid` alone. */
 const stateV3 = z
   .object({
@@ -212,6 +245,11 @@ function readState(stored: unknown) {
     if (!old.success) return old;
     return state.safeParse({ ...old.data, v: PARTY_STATE_VERSION });
   }
+  if (version === 4) {
+    const old = stateV4.safeParse(stored);
+    if (!old.success) return old;
+    return state.safeParse({ ...old.data, v: PARTY_STATE_VERSION });
+  }
   return state.safeParse(stored);
 }
 
@@ -230,6 +268,21 @@ export type PartyColumns = Omit<
   type: string;
 };
 
+/** The parts of a document that the kind of the party has: exactly these, and no others. */
+function kindParts(party: Party): Pick<PartyState, 'raid' | 'timed' | 'meetup' | 'train'> {
+  switch (party.type) {
+    case 'raid':
+      return { raid: party.raid };
+    case 'meetup':
+      return { timed: party.timed, meetup: party.meetup };
+    case 'train':
+      return {
+        timed: party.timed,
+        train: { ...party.train, route: [...party.train.route] },
+      };
+  }
+}
+
 /**
  * The document to store for a party, with the parts of its own kind and no others. It is
  * checked by the schema the reader uses, and a party that would not be read back throws: it is
@@ -242,7 +295,7 @@ export function partyState(party: Party): PartyState {
     attendees: Object.entries(party.attendees).map(([id, attendee]) => ({ ...attendee, id })),
     groups: [...party.groups],
     defaultGroupId: party.defaultGroupId,
-    ...(isRaid(party) ? { raid: party.raid } : { timed: party.timed, meetup: party.meetup }),
+    ...kindParts(party),
     prompts: {
       completion: party.prompts.completion.map(({ id, members }) => ({
         id,
@@ -274,8 +327,8 @@ export type StoredParty = { ok: true; party: Party } | { ok: false; id: string;
 
 /**
  * Puts a party together from its columns and the two JSON documents as the database returned
- * them. A row this version cannot read (a train before plan 3B, a newer state version, a
- * damaged document, a document with the details of another kind of party than its row says) is
+ * them. A row this version cannot read (a kind of party it does not know, a newer state
+ * version, a damaged document, a document with the details of another kind of party than its row says) is
  * reported, never guessed at: the caller leaves such a row alone.
  */
 export function partyFromStored(
@@ -285,7 +338,9 @@ export function partyFromStored(
 ): StoredParty {
   const fail = (problem: string): StoredParty => ({ ok: false, id: columns.id, problem });
   const { type } = columns;
-  if (type !== 'raid' && type !== 'meetup') return fail(`a party of type "${type}"`);
+  if (type !== 'raid' && type !== 'meetup' && type !== 'train') {
+    return fail(`a party of type "${type}"`);
+  }
   const parsed = readState(storedState);
   if (!parsed.success) return fail(`state: ${z.prettifyError(parsed.error)}`);
   const mirrorMessages = mirrors.safeParse(storedMirrors);
@@ -293,6 +348,7 @@ export function partyFromStored(
     return fail(`mirrorMessages: ${z.prettifyError(mirrorMessages.error)}`);
   const { anonymous, groups, defaultGroupId } = parsed.data;
   const { raid: raidDetails, timed: timedDetails, meetup: meetupDetails } = parsed.data;
+  const trainDetails = parsed.data.train;
   const attendees: Record<string, Attendee> = {};
   for (const { id, ...attendee } of parsed.data.attendees) attendees[id] = attendee;
   const messages: MirrorMessage[] = mirrorMessages.data;
@@ -309,23 +365,25 @@ export function partyFromStored(
     if (!raidDetails) return fail('a raid without its raid details');
     if (timedDetails) return fail('a raid with a name and a start of its own');
     if (meetupDetails) return fail('a raid with the details of a meetup');
+    if (trainDetails) return fail('a raid with the details of a train');
     return { ok: true, party: { ...core, type, raid: raidDetails } };
   }
-  if (!timedDetails) return fail('a meetup without its name and start');
-  if (!meetupDetails) return fail('a meetup without its meetup details');
-  if (raidDetails) return fail('a meetup with the details of a raid');
-  // The columns of a raid: a meetup that had them would not be the party that was stored.
-  if (columns.gymId !== null) return fail('a meetup with a gym');
-  if (columns.hatchTime !== null) return fail('a meetup with a hatch time');
-  return {
-    ok: true,
-    party: {
-      ...core,
-      type,
-      gymId: null,
-      hatchTime: null,
-      timed: timedDetails,
-      meetup: meetupDetails,
-    },
-  };
+  // A timed party: a meetup or a train.
+  if (!timedDetails) return fail(`a ${type} without its name and start`);
+  if (type === 'meetup' && !meetupDetails) return fail('a meetup without its meetup details');
+  if (type === 'train' && !trainDetails) return fail('a train without its train details');
+  if (raidDetails) return fail(`a ${type} with the details of a raid`);
+  // The columns of a raid: a timed party that had them would not be the party that was stored
+  // (the gym of a train is the stop it is at, which is in the document).
+  if (columns.gymId !== null) return fail(`a ${type} with a gym`);
+  if (columns.hatchTime !== null) return fail(`a ${type} with a hatch time`);
+  const timedCore = { ...core, gymId: null, hatchTime: null, timed: timedDetails };
+  if (type === 'meetup') {
+    if (!meetupDetails) return fail('a meetup without its meetup details');
+    if (trainDetails) return fail('a meetup with the details of a train');
+    return { ok: true, party: { ...timedCore, type, meetup: meetupDetails } };
+  }
+  if (!trainDetails) return fail('a train without its train details');
+  if (meetupDetails) return fail('a train with the details of a meetup');
+  return { ok: true, party: { ...timedCore, type, train: trainDetails } };
 }
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -195,8 +195,8 @@ export const MAX_PARTY_NAME = 80;
 export const MAX_MEETUP_DESCRIPTION = 1000;
 
 /**
- * What a party with a name and times of its own has, whatever its kind: a meetup, and a train
- * from plan 3B (which adds `train` beside it as a meetup adds `meetup`). Its end is `endTime`.
+ * What a party with a name and times of its own has, whatever its kind: a meetup (which adds
+ * `meetup` beside it) and a train (which adds `train`). Its end is `endTime`.
  */
 export interface TimedDetails {
   /** One line, 1 to `MAX_PARTY_NAME` characters. */
@@ -219,27 +219,60 @@ export interface MeetupParty extends PartyCore {
   meetup: MeetupDetails;
 }
 
-/** Trains join this union in plan 3B. */
-export type Party = RaidParty | MeetupParty;
+/** A route has at most this many stops: more than a train gets to, and what one message lists. */
+export const MAX_ROUTE_STOPS = 50;
+
+/** What only a raid train has (the functions that change it are in `train.ts`). */
+export interface TrainDetails {
+  /** The gyms the train visits, by id, in order; no gym twice, at most `MAX_ROUTE_STOPS`. */
+  route: readonly number[];
+  /**
+   * The index of the stop the train is at, from 0. With a route that is not empty,
+   * `route.length` means the route is finished; an empty route has only 0.
+   */
+  stop: number;
+  /** Snowflake of the member who leads the train; null while nobody does. */
+  conductorId: string | null;
+  /** The Pokémon the train is after, when somebody said (`/boss`). */
+  boss: RaidBossRef | null;
+}
+
+/**
+ * A raid train: a timed party that moves along a route of gyms. `gymId` stays null (that column
+ * serves the rule of one raid per gym): the gym of a train is its current stop (`currentStop`).
+ */
+export interface TrainParty extends PartyCore {
+  type: 'train';
+  gymId: null;
+  hatchTime: null;
+  timed: TimedDetails;
+  train: TrainDetails;
+}
+
+export type Party = RaidParty | MeetupParty | TrainParty;
 
 /**
  * A party with `timed`: a name, a start time for everybody and an end that members set. What is
- * written for a timed party (`timed.ts`) reads only that part, so it serves a train as it is.
+ * written for a timed party (`timed.ts`) reads only that part, so it serves both kinds.
  */
-export type TimedParty = MeetupParty;
+export type TimedParty = MeetupParty | TrainParty;
 
 export function isRaid(party: Party): party is RaidParty {
   return party.type === 'raid';
 }
 
 export function isTimed(party: Party): party is TimedParty {
-  return party.type === 'meetup';
+  return party.type !== 'raid';
 }
 
 export function isMeetup(party: Party): party is MeetupParty {
   return party.type === 'meetup';
 }
 
+export function isTrain(party: Party): party is TrainParty {
+  return party.type === 'train';
+}
+
 /**
  * `changed` as the kind of party `original` is, for code that is written for one kind and gets
  * the party back from the store, which holds every kind. A change never alters the kind of a
@@ -290,14 +323,15 @@ const PARTY_WORDS: Readonly<Record<PartyType, string>> = {
   meetup: 'meetup',
 };
 
-/** What a kind of party is called in a sentence: `this raid`, `this meetup`. */
+/** What a kind of party is called in a sentence: `this raid`, `this train`, `this meetup`. */
 export function partyWord(party: { type: PartyType }): string {
   return PARTY_WORDS[party.type];
 }
 
 /**
- * Whether members can open groups in this kind of party, and move between them. A meetup has
- * its one group for good (as with the legacy bot, whose group commands a meetup did not have).
+ * Whether members can open groups in this kind of party, and move between them: in a raid and
+ * in a train. A meetup has its one group for good (as with the legacy bot, whose group commands
+ * a meetup did not have).
  */
 export function hasGroups(party: Party): boolean {
   return party.type !== 'meetup';
```

Apply to `src/domain/party/tick.ts`:

```diff
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -143,7 +143,7 @@ function dayChanged(input: TickInput): boolean {
 }
 
 /**
- * The clock of a meetup (and of a train from plan 3B). There is no egg that hatches, no meeting
+ * The clock of a timed party: a meetup or a train. There is no egg that hatches, no meeting
  * time of a group to clear and nobody to ask whether they are done: only the archiving, which
  * goes by the end time, or by the day a party without one is given (`latestTime`), and is
  * announced `trainOrMeetupDeletionWarningTime` ahead, longer than for a raid.
```

Apply to `src/domain/party/timed.ts`:

```diff
--- a/src/domain/party/timed.ts
+++ b/src/domain/party/timed.ts
@@ -2,9 +2,11 @@ import {
   attendeeOf,
   MAX_PARTY_NAME,
   membersWhere,
+  NO_PROMPTS,
   refused,
   withLastPossibleTime,
   type Change,
+  type PartyCore,
   type TimedDetails,
   type TimedParty,
 } from './party.js';
@@ -20,6 +22,66 @@ const HOUR = 3_600_000;
  */
 export const OPEN_PARTY_HOURS = 24;
 
+/** What it takes to make a timed party: a name and who makes it where. */
+export interface NewTimedParty {
+  /** A fresh UUID. */
+  id: string;
+  guildId: number;
+  /** The region it is made in: its post goes into that region's forum. */
+  regionId: number;
+  /** Snowflake of the member who makes it. */
+  createdById: string;
+  /** As the member typed it; it is tidied (`tidyName`). */
+  name: string;
+  now: number;
+}
+
+/**
+ * What every new timed party starts as, before the part of its own kind is added: a name and
+ * nothing else yet, with the member who made it signed up as interested in group A (as the
+ * legacy bot did; their automatic status is for raids they report). It names who made it,
+ * whatever they chose for the raids they report: they are the first trainer in its list anyway.
+ * It has no times: `settled` gives it its day.
+ */
+export function newTimedParty(
+  input: NewTimedParty,
+  name: string,
+): PartyCore & { gymId: null; hatchTime: null; timed: TimedDetails } {
+  const { now } = input;
+  return {
+    id: input.id,
+    guildId: input.guildId,
+    status: 'active',
+    regionId: input.regionId,
+    gymId: null,
+    forumChannelId: null,
+    forumPostId: null,
+    regionLinkMessageId: null,
+    mirrorMessages: [],
+    createdById: input.createdById,
+    anonymous: false,
+    hatchTime: null,
+    endTime: null,
+    lastPossibleTime: null,
+    deletionTime: null,
+    saved: false,
+    createdAt: now,
+    updatedAt: now,
+    attendees: {
+      [input.createdById]: {
+        number: 1,
+        status: PartyStatus.Interested,
+        group: 'A',
+        remote: false,
+      },
+    },
+    groups: [{ id: 'A' }],
+    defaultGroupId: 'A',
+    prompts: NO_PROMPTS,
+    timed: { name, startTime: null },
+  };
+}
+
 /** The name of a timed party. */
 export function nameOf(party: TimedParty): string {
   return party.timed.name;
```

Create `src/domain/party/train.ts`:

```ts
import { refused, type Change, type TrainParty } from './party.js';
import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js';

export type NewTrain = NewTimedParty;

/**
 * A new raid train: a name and nothing else yet. It has no route, no conductor and no boss; the
 * member who made it is signed up as interested and is not its conductor (as with the legacy
 * bot). Like a meetup it has no times, so it counts as going on for a day until somebody sets
 * one. Refused with `bad-name` when the text is no name.
 */
export function createTrain(input: NewTrain): Change<TrainParty> {
  const name = tidyName(input.name);
  if (name === undefined) return refused('bad-name');
  const train: TrainParty = {
    ...newTimedParty(input, name),
    type: 'train',
    train: { route: [], stop: 0, conductorId: null, boss: null },
  };
  return { ok: true, party: settled(train, input.now) };
}
```

Apply to `src/render/meetup-post.ts`:

```diff
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -1,7 +1,6 @@
 import type { APIEmbed } from 'discord.js';
-import { DateTime } from 'luxon';
 import type { MeetupParty } from '../domain/party/party.js';
-import { nameOf, startTimeOf, timedOver } from '../domain/party/timed.js';
+import { nameOf } from '../domain/party/timed.js';
 import { partyControls } from './party-controls.js';
 import {
   ENDED_COLOUR,
@@ -10,110 +9,25 @@ import {
   KEPT_OPEN,
   tidyTitle,
   type ForumTag,
-  type PostEmoji,
   type RenderedPost,
   type ShrinkableField,
 } from './party-post.js';
-import { LIMITS, plain, plainLines, timestamp, truncate } from './text.js';
+import { LIMITS, plain, plainLines, truncate } from './text.js';
+import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';
 
-const MINUTE = 60_000;
-
-/** The colour of the post of a meetup that is not over: none of the colours of a raid. */
-const MEETUP_COLOUR = 0x3498db;
-
-export interface MeetupPostView {
-  party: MeetupParty;
-  now: number;
-  /** IANA zone in which "today" is judged (`settings.timezone`). */
-  zone: string;
-  /**
-   * When the clean-up archives a meetup: `graceMinutes` after its last possible moment the
-   * warning is said (`settings.deletionGraceTime`), and `warningMinutes` after the warning the
-   * post is archived (`settings.trainOrMeetupDeletionWarningTime`).
-   */
-  archiving: { graceMinutes: number; warningMinutes: number };
-  /**
-   * Set for the last showing of a meetup that staff closed (`/delete`): the sentence that says
-   * so. It stands in the place of the times, and the post is shown as ended whatever the clock
-   * says.
-   */
-  closed?: string;
-  emoji: PostEmoji;
-}
+/** What the post of a meetup is rendered from (see `TimedPostView`). */
+export type MeetupPostView = TimedPostView<MeetupParty>;
 
 /** `Meetup · Community Day picnic`: the title of the post, which is also how lists name it. */
 export function meetupTitle(party: MeetupParty): string {
   return tidyTitle(truncate(tidyTitle(`Meetup · ${nameOf(party)}`), LIMITS.title));
 }
 
-/**
- * Whether the post shows the meetup as over: its end time has passed, or the party has ended
- * (this is then the last showing before the post is archived, also of a meetup without an end
- * time whose day ran out: an archived post must not look as if the meetup were still going on).
- */
-function shownAsOver(party: MeetupParty, now: number): boolean {
-  return party.status === 'ended' || timedOver(party, now);
-}
-
 /** What it is, and that it has ended once it is over. */
 export function meetupTags(party: MeetupParty, now: number): ForumTag[] {
   return ['Meetup', ...(shownAsOver(party, now) ? ['Ended' as const] : [])];
 }
 
-/**
- * When the meetup starts and ends. A clock time does not say which day it is, and a meetup is
- * often planned days ahead, so a time that is not today (in `zone`) is shown with its weekday
- * and date. The scheduler shows every post anew at midnight.
- *
- * A meetup without any time says what follows from that: the clean-up gives it a day, and the
- * post says when it is archived: the time of the archiving itself once it is scheduled
- * (`deletionTime`), and before that the earliest it can be, the end of that day
- * (`lastPossibleTime`) with the grace and the warning time after it. The clock runs in steps,
- * so that moment can pass before the archiving is scheduled or done: a moment that has passed
- * is never shown, the post says "soon" then.
- */
-function describeTimes(view: MeetupPostView): string {
-  const { party, now, zone } = view;
-  const start = startTimeOf(party);
-  const end = party.endTime;
-  const today = DateTime.fromMillis(now, { zone });
-  const at = (time: number): string =>
-    timestamp(time, today.hasSame(DateTime.fromMillis(time, { zone }), 'day') ? 't' : 'F');
-  if (shownAsOver(party, now)) {
-    return end === null ? 'This meetup is over.' : `Ended at ${timestamp(end, 'F')}.`;
-  }
-  if (start === null && end === null) {
-    const { graceMinutes, warningMinutes } = view.archiving;
-    const archived =
-      party.deletionTime ??
-      (party.lastPossibleTime === null
-        ? null
-        : party.lastPossibleTime + (graceMinutes + warningMinutes) * MINUTE);
-    return (
-      'No time has been set yet: `/meet` sets the start.' +
-      (party.saved || archived === null
-        ? ''
-        : ` Without one this post is archived ${archived > now ? timestamp(archived, 'R') : 'soon'}.`)
-    );
-  }
-  const parts: string[] = [];
-  const started = start !== null && now >= start;
-  if (start !== null) {
-    if (!started) parts.push(`Starts ${timestamp(start, 'R')}, at ${at(start)}.`);
-    // What is counted down to is said first in its sentence: once it has started, the end.
-    else if (end !== null) parts.push(`Started at ${at(start)}.`);
-    else parts.push(`Started ${timestamp(start, 'R')}, at ${at(start)}.`);
-  }
-  if (end !== null) {
-    parts.push(
-      start !== null && !started
-        ? `Ends at ${at(end)}.`
-        : `Ends ${timestamp(end, 'R')}, at ${at(end)}.`,
-    );
-  }
-  return parts.join(' ');
-}
-
 /**
  * The forum post of a meetup: title, tags, the embed and the controls under it. Pure: the same
  * view gives the same post. It has what the post of a raid has without what belongs to a gym or
@@ -156,7 +70,7 @@ export function renderMeetupPost(view: MeetupPostView): RenderedPost {
   const embed: APIEmbed = {
     title: embedTitle,
     description: embedDescription,
-    color: over ? ENDED_COLOUR : MEETUP_COLOUR,
+    color: over ? ENDED_COLOUR : TIMED_COLOUR,
     fields: fields.map((f) => f.field),
   };
   const tags = meetupTags(party, now);
```

Create `src/render/timed-post.ts`:

```ts
import { DateTime } from 'luxon';
import { partyWord, type TimedParty } from '../domain/party/party.js';
import { startTimeOf, timedOver } from '../domain/party/timed.js';
import type { PostEmoji } from './party-post.js';
import { timestamp } from './text.js';

const MINUTE = 60_000;

/** The colour of the post of a timed party that is not over: none of the colours of a raid. */
export const TIMED_COLOUR = 0x3498db;

/** What the post of a timed party (a meetup, a train) is rendered from, whatever its kind. */
export interface TimedPostView<P extends TimedParty = TimedParty> {
  party: P;
  now: number;
  /** IANA zone in which "today" is judged (`settings.timezone`). */
  zone: string;
  /**
   * When the clean-up archives a timed party: `graceMinutes` after its last possible moment the
   * warning is said (`settings.deletionGraceTime`), and `warningMinutes` after the warning the
   * post is archived (`settings.trainOrMeetupDeletionWarningTime`).
   */
  archiving: { graceMinutes: number; warningMinutes: number };
  /**
   * Set for the last showing of a party that staff closed (`/delete`): the sentence that says
   * so. It stands in the place of the times, and the post is shown as ended whatever the clock
   * says.
   */
  closed?: string;
  emoji: PostEmoji;
}

/**
 * Whether the post shows the party as over: its end time has passed, or the party has ended
 * (this is then the last showing before the post is archived, also of a party without an end
 * time whose day ran out: an archived post must not look as if it were still going on).
 */
export function shownAsOver(party: TimedParty, now: number): boolean {
  return party.status === 'ended' || timedOver(party, now);
}

/**
 * When a timed party starts and ends. A clock time does not say which day it is, and such a
 * party is often planned days ahead, so a time that is not today (in `zone`) is shown with its
 * weekday and date. The scheduler shows every post anew at midnight.
 *
 * A party without any time says what follows from that: the clean-up gives it a day, and the
 * post says when it is archived: the time of the archiving itself once it is scheduled
 * (`deletionTime`), and before that the earliest it can be, the end of that day
 * (`lastPossibleTime`) with the grace and the warning time after it. The clock runs in steps,
 * so that moment can pass before the archiving is scheduled or done: a moment that has passed
 * is never shown, the post says "soon" then.
 */
export function describeTimes(view: TimedPostView): string {
  const { party, now, zone } = view;
  const start = startTimeOf(party);
  const end = party.endTime;
  const today = DateTime.fromMillis(now, { zone });
  const at = (time: number): string =>
    timestamp(time, today.hasSame(DateTime.fromMillis(time, { zone }), 'day') ? 't' : 'F');
  if (shownAsOver(party, now)) {
    return end === null ? `This ${partyWord(party)} is over.` : `Ended at ${timestamp(end, 'F')}.`;
  }
  if (start === null && end === null) {
    const { graceMinutes, warningMinutes } = view.archiving;
    const archived =
      party.deletionTime ??
      (party.lastPossibleTime === null
        ? null
        : party.lastPossibleTime + (graceMinutes + warningMinutes) * MINUTE);
    return (
      'No time has been set yet: `/meet` sets the start.' +
      (party.saved || archived === null
        ? ''
        : ` Without one this post is archived ${archived > now ? timestamp(archived, 'R') : 'soon'}.`)
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
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -22,6 +22,7 @@ import {
   type Party,
   type RaidBossRef,
   type RaidParty,
+  type TimedParty,
   setSaved,
   endParty,
 } from '../domain/party/party.js';
@@ -31,7 +32,7 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
-import { meetupTitle, renderMeetupPost, type MeetupPostView } from '../render/meetup-post.js';
+import { meetupTitle, renderMeetupPost } from '../render/meetup-post.js';
 import { FORUM_TAGS, tidyTitle, type PostEmoji, type RenderedPost } from '../render/party-post.js';
 import {
   raidTitle,
@@ -42,6 +43,7 @@ import {
 } from '../render/raid-post.js';
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
 import { plain, withMentions } from '../render/text.js';
+import type { TimedPostView } from '../render/timed-post.js';
 import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { KeyedLock } from './keyed-lock.js';
@@ -306,8 +308,8 @@ export class PartyService {
     };
   }
 
-  /** Everything the renderer needs to show a meetup as it is now. */
-  meetupView(party: MeetupParty): MeetupPostView {
+  /** Everything the renderer needs to show a timed party (a meetup, a train) as it is now. */
+  timedView<P extends TimedParty>(party: P): TimedPostView<P> {
     const { settings } = this.options;
     return {
       party,
@@ -327,9 +329,15 @@ export class PartyService {
    */
   private rendered(party: Party, closed?: string): RenderedPost {
     const last = closed === undefined ? {} : { closed };
-    return isRaid(party)
-      ? renderRaidPost({ ...this.view(party), ...last })
-      : renderMeetupPost({ ...this.meetupView(party), ...last });
+    switch (party.type) {
+      case 'raid':
+        return renderRaidPost({ ...this.view(party), ...last });
+      case 'meetup':
+        return renderMeetupPost({ ...this.timedView(party), ...last });
+      case 'train':
+        // The post of a train comes with the next step of plan 3B; nothing makes a train yet.
+        throw new Error(`Party ${party.id} is a train, which cannot be shown yet`);
+    }
   }
 
   /**
```

Apply to `src/services/timed-party-service.ts`:

```diff
--- a/src/services/timed-party-service.ts
+++ b/src/services/timed-party-service.ts
@@ -61,8 +61,8 @@ interface PendingStart {
 }
 
 /**
- * What members change about a party that has a name and times of its own: a meetup, and a train
- * from plan 3B (`TimedParty`). It is to such a party what `RaidChangeService` is to a raid: every
+ * What members change about a party that has a name and times of its own: a meetup or a train
+ * (`TimedParty`). It is to such a party what `RaidChangeService` is to a raid: every
  * method decides inside the store, has the post shown anew and says in the post who changed
  * what; the caller tells the member privately.
  *
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/attendance.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/shout.test.ts src/discord/guards.test.ts src/domain/party/party-state.test.ts src/domain/party/train.test.ts src/services/party-service.meetup.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/party-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/party-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff f9fa9bb -- src test   # must print nothing
npx prettier --check src/app-context.ts src/commands/admin/save-party.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/attendance.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/reply.ts src/commands/parties/shout.test.ts src/commands/parties/timed.ts src/db/repositories/party-repository.db.test.ts src/discord/guards.test.ts src/discord/guards.ts src/domain/party/meetup.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/tick.ts src/domain/party/timed.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/meetup-post.ts src/render/timed-post.ts src/services/party-service.meetup.test.ts src/services/party-service.ts src/services/timed-party-service.ts test/support/parties.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/commands/admin/save-party.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/attendance.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/reply.ts src/commands/parties/shout.test.ts src/commands/parties/timed.ts src/db/repositories/party-repository.db.test.ts src/discord/guards.test.ts src/discord/guards.ts src/domain/party/meetup.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/tick.ts src/domain/party/timed.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/meetup-post.ts src/render/timed-post.ts src/services/party-service.meetup.test.ts src/services/party-service.ts src/services/timed-party-service.ts test/support/parties.ts
git commit -m "A party is a raid, a meetup or a train" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,286 unit tests.

---

### Task 3: The domain of a train: route, movement, conductor, boss

**Files:**
- Modify: `src/domain/party/attendance.ts`, `src/domain/party/party.ts`, `src/domain/party/train.test.ts`, `src/domain/party/train.ts`, `src/render/activity.test.ts`, `src/render/activity.ts`

**Interfaces:**
- Consumes: Task 2's `TrainParty` and `createTrain`; `attendance.ts` (`leaveParty`, `finishParty`); `problemText` (`src/render/activity.ts`).
- Produces: In `train.ts`: `routeFinished`, `currentStop`, `nextStop`, `placeOf` (the gym id of the current stop, `end` or `none`), `mayNotMove(party, memberId, staff)`, `addStop`, `removeStop`, `moveStop`, `clearRoute`, `replaceRoute` (each answering whether the train `moved`), `TRAIN_MOVES`, `TrainMove`, `isTrainMove`, `cannotMove`, `targetOf`, `moveTrain(party, member, move, staff, from?, target?)` with `TrainMoved`, `setConductor`, `clearConductor`, `setTrainBoss`; `bossOf(party)` in `party.ts`; `leaveParty` answering `conductorLeft`; the reasons a train needs in `PartyProblem` with their sentences.

The current stop follows its gym through every edit. An edit after which `placeOf` differs is a movement (it needs `mayNotMove` to pass and puts Here back to Coming), except the first stop of an empty route. `moveTrain` with `from` and `target` refuses a press that no longer fits (`train-moved-on`, `route-changed`).

Reference commit of the prototype for this task: `41561ee`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/domain/party/train.test.ts`:

```diff
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -1,23 +1,61 @@
 import { describe, expect, it } from 'vitest';
 import {
+  ALICE,
+  BOB,
+  CAROL,
   PARTY_NOW,
   REPORTER,
   testMeetup,
   testRaid,
   testTrain,
+  withAttendees,
 } from '../../../test/support/parties.js';
 import {
+  createGroup,
+  finishParty,
+  joinGroup,
+  labelGroup,
+  leaveParty,
+  setMeetingTime,
+  setNotHere,
+} from './attendance.js';
+import {
+  bossOf,
   hasGroups,
   isMeetup,
   isRaid,
   isTimed,
   isTrain,
+  MAX_ROUTE_STOPS,
   partyWord,
   remoteAllowed,
+  type Change,
+  type TrainDetails,
+  type TrainParty,
 } from './party.js';
 import { PartyStatus } from './status.js';
-import { OPEN_PARTY_HOURS } from './timed.js';
-import { createTrain } from './train.js';
+import { OPEN_PARTY_HOURS, setStartTime } from './timed.js';
+import {
+  addStop,
+  cannotMove,
+  clearConductor,
+  clearRoute,
+  createTrain,
+  currentStop,
+  isTrainMove,
+  mayNotMove,
+  moveStop,
+  moveTrain,
+  nextStop,
+  placeOf,
+  removeStop,
+  replaceRoute,
+  routeFinished,
+  setConductor,
+  setTrainBoss,
+  targetOf,
+  TRAIN_MOVES,
+} from './train.js';
 
 const HOUR = 3_600_000;
 
@@ -100,3 +138,665 @@ describe('a train among the kinds of party', () => {
     expect(partyWord(train)).toBe('train');
   });
 });
+
+/** A train on a route, at the stop with this index; Alice and Bob are signed up beside its maker. */
+function onRoute(route: number[], stop = 0, more: Partial<TrainDetails> = {}): TrainParty {
+  const train = withAttendees(testTrain(), { [ALICE]: {}, [BOB]: {} });
+  return { ...train, train: { ...train.train, route, stop, ...more } };
+}
+
+/** The route and the stop of what a change answered; throws when it was refused. */
+function where(change: Change<TrainParty>): { route: readonly number[]; stop: number } {
+  if (!change.ok) throw new Error(`refused: ${change.reason}`);
+  const { route, stop } = change.party.train;
+  return { route, stop };
+}
+
+const refusal = (reason: string) => ({ ok: false, reason });
+
+describe('where a train is', () => {
+  it('is at no gym without a route, at its current stop on one, and at none once finished', () => {
+    expect(currentStop(testTrain())).toBeUndefined();
+    expect(nextStop(testTrain())).toBeUndefined();
+    expect(routeFinished(testTrain())).toBe(false);
+    const train = onRoute([4, 1, 7], 1);
+    expect(currentStop(train)).toBe(1);
+    expect(nextStop(train)).toBe(7);
+    expect(routeFinished(train)).toBe(false);
+    const last = onRoute([4, 1, 7], 2);
+    expect(currentStop(last)).toBe(7);
+    expect(nextStop(last)).toBeUndefined();
+    const finished = onRoute([4, 1, 7], 3);
+    expect(currentStop(finished)).toBeUndefined();
+    expect(nextStop(finished)).toBeUndefined();
+    expect(routeFinished(finished)).toBe(true);
+  });
+});
+
+describe('addStop', () => {
+  it('appends a gym, and the first stop is where the train is', () => {
+    const first = addStop(testTrain(), REPORTER, 4);
+    expect(first).toMatchObject({ ok: true, number: 1 });
+    expect(where(first)).toEqual({ route: [4], stop: 0 });
+    const second = addStop(onRoute([4, 1], 1), ALICE, 7);
+    expect(second).toMatchObject({ ok: true, number: 3 });
+    expect(where(second)).toEqual({ route: [4, 1, 7], stop: 1 });
+  });
+
+  it('is for members who are signed up', () => {
+    expect(addStop(testTrain(), CAROL, 4)).toEqual(refusal('not-attending'));
+  });
+
+  it('refuses a gym that is on the route already, and a stop beyond what a route holds', () => {
+    expect(addStop(onRoute([4, 1]), ALICE, 1)).toEqual(refusal('already-on-route'));
+    const full = onRoute(Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1));
+    expect(addStop(full, ALICE, 99)).toEqual(refusal('route-full'));
+    const almost = onRoute(Array.from({ length: MAX_ROUTE_STOPS - 1 }, (_, index) => index + 1));
+    expect(addStop(almost, ALICE, 99).ok).toBe(true);
+  });
+
+  it('makes a train that had finished its route go on at the new stop', () => {
+    const more = addStop(onRoute([4, 1], 2), ALICE, 7);
+    expect(where(more)).toEqual({ route: [4, 1, 7], stop: 2 });
+    expect(more.ok && currentStop(more.party)).toBe(7);
+    expect(more.ok && routeFinished(more.party)).toBe(false);
+  });
+});
+
+describe('removeStop', () => {
+  it('takes a stop off by its number and says which gym it was', () => {
+    const removed = removeStop(onRoute([4, 1, 7]), ALICE, 2);
+    expect(removed).toMatchObject({ ok: true, gymId: 1 });
+    expect(where(removed)).toEqual({ route: [4, 7], stop: 0 });
+  });
+
+  it('keeps the train at its gym when an earlier or a later stop goes', () => {
+    // At gym 7 (the third stop); the legacy bot would have been at gym 9 afterwards.
+    const earlier = removeStop(onRoute([4, 1, 7, 9], 2), ALICE, 1);
+    expect(where(earlier)).toEqual({ route: [1, 7, 9], stop: 1 });
+    expect(earlier.ok && currentStop(earlier.party)).toBe(7);
+    const later = removeStop(onRoute([4, 1, 7, 9], 2), ALICE, 4);
+    expect(where(later)).toEqual({ route: [4, 1, 7], stop: 2 });
+  });
+
+  it('makes the stop after the current one current when the current one goes', () => {
+    const removed = removeStop(onRoute([4, 1, 7, 9], 1), ALICE, 2);
+    expect(where(removed)).toEqual({ route: [4, 7, 9], stop: 1 });
+    expect(removed.ok && currentStop(removed.party)).toBe(7);
+  });
+
+  it('finishes the route when the current stop was the last one', () => {
+    const removed = removeStop(onRoute([4, 1, 7], 2), ALICE, 3);
+    expect(where(removed)).toEqual({ route: [4, 1], stop: 2 });
+    expect(removed.ok && routeFinished(removed.party)).toBe(true);
+  });
+
+  it('keeps a finished route finished, and puts a train without stops at the start', () => {
+    expect(where(removeStop(onRoute([4, 1, 7], 3), ALICE, 1))).toEqual({ route: [1, 7], stop: 2 });
+    const emptied = removeStop(onRoute([4], 0), ALICE, 1);
+    expect(where(emptied)).toEqual({ route: [], stop: 0 });
+    expect(where(removeStop(onRoute([4], 1), ALICE, 1))).toEqual({ route: [], stop: 0 });
+    expect(emptied.ok && routeFinished(emptied.party)).toBe(false);
+  });
+
+  it('refuses a number the route does not have, and a member who is not signed up', () => {
+    const train = onRoute([4, 1, 7]);
+    for (const number of [0, 4, -1, 1.5, Number.NaN]) {
+      expect(removeStop(train, ALICE, number)).toEqual(refusal('no-such-stop'));
+    }
+    expect(removeStop(testTrain(), REPORTER, 1)).toEqual(refusal('no-such-stop'));
+    expect(removeStop(train, CAROL, 1)).toEqual(refusal('not-attending'));
+  });
+});
+
+describe('moveStop', () => {
+  it('moves a stop to the number it is to have, also to the end and to the start', () => {
+    const train = onRoute([4, 1, 7, 9], 3);
+    expect(where(moveStop(train, ALICE, 1, 4)).route).toEqual([1, 7, 9, 4]);
+    expect(where(moveStop(train, ALICE, 4, 1)).route).toEqual([9, 4, 1, 7]);
+    expect(where(moveStop(train, ALICE, 2, 3)).route).toEqual([4, 7, 1, 9]);
+    expect(where(moveStop(train, ALICE, 3, 2)).route).toEqual([4, 7, 1, 9]);
+    expect(moveStop(train, ALICE, 1, 4)).toMatchObject({ ok: true, gymId: 4 });
+  });
+
+  it('keeps the train at the gym it is at, whichever stop moves', () => {
+    // At gym 1, the second stop.
+    const train = onRoute([4, 1, 7, 9], 1);
+    const at = (change: Change<TrainParty>) => change.ok && currentStop(change.party);
+    // The current stop itself moves: the train goes with it.
+    expect(where(moveStop(train, ALICE, 2, 4))).toEqual({ route: [4, 7, 9, 1], stop: 3 });
+    // A stop from before it moves behind it, and one from behind it before it.
+    expect(where(moveStop(train, ALICE, 1, 3))).toEqual({ route: [1, 7, 4, 9], stop: 0 });
+    expect(where(moveStop(train, ALICE, 4, 1))).toEqual({ route: [9, 4, 1, 7], stop: 2 });
+    for (const [from, to] of [
+      [2, 4],
+      [1, 3],
+      [4, 1],
+      [3, 4],
+    ] as const) {
+      expect(at(moveStop(train, ALICE, from, to))).toBe(1);
+    }
+  });
+
+  it('keeps a finished route finished', () => {
+    expect(where(moveStop(onRoute([4, 1, 7], 3), ALICE, 1, 3))).toEqual({
+      route: [1, 7, 4],
+      stop: 3,
+    });
+  });
+
+  it('returns the very same party when the stop stays where it is', () => {
+    const train = onRoute([4, 1, 7]);
+    const same = moveStop(train, ALICE, 2, 2);
+    expect(same.ok && same.party).toBe(train);
+  });
+
+  it('refuses numbers the route does not have, and a member who is not signed up', () => {
+    const train = onRoute([4, 1, 7]);
+    expect(moveStop(train, ALICE, 0, 2)).toEqual(refusal('no-such-stop'));
+    expect(moveStop(train, ALICE, 2, 4)).toEqual(refusal('no-such-stop'));
+    expect(moveStop(train, ALICE, 2.5, 1)).toEqual(refusal('no-such-stop'));
+    expect(moveStop(train, CAROL, 1, 2)).toEqual(refusal('not-attending'));
+  });
+});
+
+describe('clearRoute and replaceRoute', () => {
+  it('clears the route for the conductor and for staff, and puts the train at the start', () => {
+    const train = onRoute([4, 1, 7], 2, { conductorId: ALICE });
+    expect(where(clearRoute(train, ALICE, false))).toEqual({ route: [], stop: 0 });
+    expect(where(clearRoute(train, CAROL, true))).toEqual({ route: [], stop: 0 });
+    expect(clearRoute(train, BOB, false)).toEqual(refusal('conductor-or-staff'));
+    // Without a conductor it is for staff alone.
+    expect(clearRoute(onRoute([4]), ALICE, false)).toEqual(refusal('conductor-or-staff'));
+    const empty = testTrain();
+    const same = clearRoute(empty, CAROL, true);
+    expect(same.ok && same.party).toBe(empty);
+  });
+
+  it('keeps the conductor and the boss when the route is cleared', () => {
+    const train = onRoute([4, 1], 1, { conductorId: ALICE, boss: { key: 'yveltal' } });
+    const cleared = clearRoute(train, ALICE, false);
+    expect(cleared.ok && cleared.party.train).toEqual({
+      route: [],
+      stop: 0,
+      conductorId: ALICE,
+      boss: { key: 'yveltal' },
+    });
+  });
+
+  it('replaces the route and starts at its first stop, wherever the train was', () => {
+    expect(where(replaceRoute(onRoute([4, 1, 7], 2), ALICE, [9, 7, 2]))).toEqual({
+      route: [9, 7, 2],
+      stop: 0,
+    });
+    expect(where(replaceRoute(onRoute([4], 1), ALICE, [4]))).toEqual({ route: [4], stop: 0 });
+    // The very same party when it has that route and is at its first stop.
+    const there = onRoute([9, 7, 2]);
+    const same = replaceRoute(there, ALICE, [9, 7, 2]);
+    expect(same.ok && same.party).toBe(there);
+  });
+
+  it('takes each gym of a loaded route once, and no more than a route holds', () => {
+    expect(where(replaceRoute(testTrain(), REPORTER, [4, 1, 4, 7, 1])).route).toEqual([4, 1, 7]);
+    const long = Array.from({ length: 60 }, (_, index) => index + 1);
+    expect(where(replaceRoute(testTrain(), REPORTER, long)).route).toHaveLength(MAX_ROUTE_STOPS);
+  });
+
+  it('refuses a route without a gym, and a member who is not signed up', () => {
+    expect(replaceRoute(onRoute([4]), ALICE, [])).toEqual(refusal('empty-route'));
+    expect(replaceRoute(onRoute([4]), CAROL, [1])).toEqual(refusal('not-attending'));
+  });
+});
+
+describe('moveTrain', () => {
+  it('goes to the next stop, and from the last one finishes the route', () => {
+    const train = onRoute([4, 1, 7]);
+    const second = moveTrain(train, ALICE, 'next', false);
+    expect(second).toMatchObject({ ok: true, move: 'next', at: 1, finished: false });
+    expect(where(second).stop).toBe(1);
+    const end = moveTrain(onRoute([4, 1, 7], 2), ALICE, 'next', false);
+    expect(end).toMatchObject({ ok: true, move: 'next', at: undefined, finished: true });
+    expect(where(end).stop).toBe(3);
+    expect(moveTrain(onRoute([4, 1, 7], 3), ALICE, 'next', false)).toEqual(
+      refusal('route-finished'),
+    );
+  });
+
+  it('goes back one stop, also from a finished route, and not from the first stop', () => {
+    expect(moveTrain(onRoute([4, 1, 7], 2), ALICE, 'previous', false)).toMatchObject({
+      ok: true,
+      at: 1,
+      finished: false,
+    });
+    const back = moveTrain(onRoute([4, 1, 7], 3), ALICE, 'previous', false);
+    expect(back).toMatchObject({ ok: true, at: 7, finished: false });
+    expect(where(back).stop).toBe(2);
+    expect(moveTrain(onRoute([4, 1, 7], 0), ALICE, 'previous', false)).toEqual(
+      refusal('at-first-stop'),
+    );
+  });
+
+  it('skips the next stop and names it, when there is a stop after it', () => {
+    const skipped = moveTrain(onRoute([4, 1, 7, 9]), ALICE, 'skip', false);
+    expect(skipped).toMatchObject({ ok: true, move: 'skip', at: 7, skipped: 1, finished: false });
+    expect(where(skipped).stop).toBe(2);
+    // From the second to last stop there is a next one, but none after it.
+    expect(moveTrain(onRoute([4, 1, 7, 9], 2), ALICE, 'skip', false)).toEqual(
+      refusal('no-stop-to-skip'),
+    );
+    expect(moveTrain(onRoute([4, 1, 7, 9], 3), ALICE, 'skip', false)).toEqual(
+      refusal('no-stop-to-skip'),
+    );
+    expect(moveTrain(onRoute([4, 1, 7, 9], 4), ALICE, 'skip', false)).toEqual(
+      refusal('no-stop-to-skip'),
+    );
+  });
+
+  it('finishes the route from any stop, once, and changes neither status nor times of the party', () => {
+    const train = onRoute([4, 1, 7], 1);
+    const finished = moveTrain(train, ALICE, 'finish', false);
+    expect(finished).toMatchObject({ ok: true, move: 'finish', at: undefined, finished: true });
+    expect(where(finished).stop).toBe(3);
+    expect(finished.ok && finished.party).toMatchObject({
+      status: 'active',
+      endTime: train.endTime,
+      lastPossibleTime: train.lastPossibleTime,
+      deletionTime: null,
+    });
+    expect(moveTrain(onRoute([4, 1, 7], 3), ALICE, 'finish', false)).toEqual(
+      refusal('route-finished'),
+    );
+  });
+
+  it('refuses every move on a train without a route', () => {
+    const train = withAttendees(testTrain(), { [ALICE]: {} });
+    for (const move of TRAIN_MOVES) {
+      expect(moveTrain(train, ALICE, move, false)).toEqual(refusal('no-route'));
+      expect(cannotMove(train, move)).toBe('no-route');
+    }
+  });
+
+  it('puts everybody who is here back to coming, keeping count, group, remote, name and team', () => {
+    const train: TrainParty = {
+      ...withAttendees(onRoute([4, 1, 7, 9], 1), {
+        [ALICE]: {
+          status: PartyStatus.Present,
+          number: 3,
+          group: 'B',
+          remote: true,
+          name: 'Alice',
+          team: 'valor',
+        },
+        [BOB]: { status: PartyStatus.Present },
+        [CAROL]: { status: PartyStatus.Interested, number: 2 },
+      }),
+      groups: [{ id: 'A' }, { id: 'B' }],
+    };
+    // Not Finish: there is nowhere to come to then.
+    for (const move of ['next', 'previous', 'skip'] as const) {
+      const moved = moveTrain(train, BOB, move, false);
+      if (!moved.ok) throw new Error(moved.reason);
+      expect(moved.party.attendees).toEqual({
+        [REPORTER]: train.attendees[REPORTER],
+        [ALICE]: { ...train.attendees[ALICE], status: PartyStatus.Coming },
+        [BOB]: { ...train.attendees[BOB], status: PartyStatus.Coming },
+        [CAROL]: train.attendees[CAROL],
+      });
+      // Who signed up first is still first.
+      expect(Object.keys(moved.party.attendees)).toEqual(Object.keys(train.attendees));
+    }
+  });
+
+  it('is for anybody who is signed up while there is no conductor, and for staff', () => {
+    const train = onRoute([4, 1, 7]);
+    expect(moveTrain(train, ALICE, 'next', false).ok).toBe(true);
+    expect(moveTrain(train, CAROL, 'next', false)).toEqual(refusal('not-attending'));
+    expect(moveTrain(train, CAROL, 'next', true).ok).toBe(true);
+    expect(mayNotMove(train, CAROL, false)).toBe('not-attending');
+    expect(mayNotMove(train, ALICE, false)).toBeUndefined();
+  });
+
+  it('is for the conductor and for staff alone once there is a conductor', () => {
+    const train = onRoute([4, 1, 7], 1, { conductorId: ALICE });
+    for (const move of TRAIN_MOVES) {
+      expect(moveTrain(train, BOB, move, false)).toEqual(refusal('not-conductor'));
+      expect(moveTrain(train, CAROL, move, false)).toEqual(refusal('not-conductor'));
+    }
+    expect(moveTrain(train, ALICE, 'next', false).ok).toBe(true);
+    expect(moveTrain(train, CAROL, 'previous', true).ok).toBe(true);
+  });
+
+  it('says who may not move before it says that the move cannot be made', () => {
+    expect(moveTrain(testTrain(), CAROL, 'next', false)).toEqual(refusal('not-attending'));
+    const led = onRoute([4], 1, { conductorId: ALICE });
+    expect(moveTrain(led, BOB, 'next', false)).toEqual(refusal('not-conductor'));
+  });
+
+  it('knows its moves by name', () => {
+    expect(TRAIN_MOVES.every(isTrainMove)).toBe(true);
+    expect(isTrainMove('join')).toBe(false);
+  });
+});
+
+describe('the conductor', () => {
+  it('is a member who is signed up and says so', () => {
+    const set = setConductor(onRoute([4]), ALICE);
+    expect(set).toMatchObject({ ok: true, previous: null });
+    expect(set.ok && set.party.train.conductorId).toBe(ALICE);
+    expect(setConductor(onRoute([4]), CAROL)).toEqual(refusal('not-attending'));
+  });
+
+  it('can be taken over from another conductor, whom the answer names', () => {
+    const led = onRoute([4], 0, { conductorId: ALICE });
+    const taken = setConductor(led, BOB);
+    expect(taken).toMatchObject({ ok: true, previous: ALICE });
+    expect(taken.ok && taken.party.train.conductorId).toBe(BOB);
+    const same = setConductor(led, ALICE);
+    expect(same.ok && same.party).toBe(led);
+  });
+
+  it('is taken off by themself or by staff, and by nobody else', () => {
+    const led = onRoute([4], 0, { conductorId: ALICE });
+    const own = clearConductor(led, ALICE, false);
+    expect(own).toMatchObject({ ok: true, previous: ALICE });
+    expect(own.ok && own.party.train.conductorId).toBeNull();
+    expect(clearConductor(led, CAROL, true)).toMatchObject({ ok: true, previous: ALICE });
+    expect(clearConductor(led, BOB, false)).toEqual(refusal('conductor-or-staff'));
+    const none = onRoute([4]);
+    const same = clearConductor(none, BOB, false);
+    expect(same).toMatchObject({ ok: true, previous: null });
+    expect(same.ok && same.party).toBe(none);
+  });
+});
+
+describe('the boss of a train', () => {
+  it('is the Pokémon the train is after, by key or by the name of the feed, or none', () => {
+    const train = testTrain();
+    expect(bossOf(train)).toBeNull();
+    const set = setTrainBoss(train, { key: 'yveltal' });
+    expect(set.ok && bossOf(set.party)).toEqual({ key: 'yveltal' });
+    const named = setTrainBoss(train, { name: 'Newmon' });
+    expect(named.ok && named.party.train.boss).toEqual({ name: 'Newmon' });
+    const again = set.ok ? setTrainBoss(set.party, { key: 'yveltal' }) : set;
+    expect(again.ok && set.ok && again.party).toBe(set.ok && set.party);
+    const none = set.ok ? setTrainBoss(set.party, null) : set;
+    expect(none.ok && none.party.train.boss).toBeNull();
+  });
+
+  it('is asked of every kind of party in one way', () => {
+    expect(bossOf(testRaid())).toBeNull();
+    expect(bossOf(testRaid({ boss: { key: 'yveltal' } }))).toEqual({ key: 'yveltal' });
+    expect(bossOf(testMeetup())).toBeNull();
+  });
+});
+
+describe('attendance in a train', () => {
+  const limits = { maxNumber: 6 };
+
+  it('has groups like a raid: open one, move between them, label them', () => {
+    const train = withAttendees(testTrain(), { [ALICE]: {} });
+    const opened = createGroup(train, ALICE, limits);
+    expect(opened).toMatchObject({ ok: true, group: 'B', others: [REPORTER] });
+    if (!opened.ok) throw new Error(opened.reason);
+    expect(opened.party.groups).toEqual([{ id: 'A' }, { id: 'B' }]);
+    expect(opened.party.attendees[ALICE]?.group).toBe('B');
+    const joined = joinGroup(opened.party, BOB, 'B', limits);
+    expect(joined.ok && joined.party.attendees[BOB]).toMatchObject({
+      group: 'B',
+      status: PartyStatus.Coming,
+    });
+    const labelled = labelGroup(opened.party, ALICE, 'by car');
+    expect(labelled.ok && labelled.party.groups[1]).toEqual({ id: 'B', label: 'by car' });
+    let five: TrainParty = train;
+    for (let n = 0; n < 4; n++) {
+      const more = createGroup(five, ALICE, limits);
+      if (!more.ok) throw new Error(more.reason);
+      five = more.party;
+    }
+    expect(createGroup(five, ALICE, limits)).toEqual(refusal('too-many-groups'));
+  });
+
+  it('starts for everybody at once: a group has no meeting time of its own', () => {
+    const train = withAttendees(testTrain(), { [ALICE]: {} });
+    expect(setMeetingTime(train, ALICE, PARTY_NOW + HOUR)).toEqual(refusal('party-wide-start'));
+    const started = setStartTime(train, ALICE, PARTY_NOW + HOUR, PARTY_NOW);
+    expect(started.ok && started.party.timed.startTime).toBe(PARTY_NOW + HOUR);
+    expect(started.ok && started.party.lastPossibleTime).toBe(
+      PARTY_NOW + HOUR + OPEN_PARTY_HOURS * HOUR,
+    );
+  });
+
+  it('takes done for leave: nobody is asked, and nobody is ever complete', () => {
+    const train = withAttendees(onRoute([4, 1]), { [BOB]: { status: PartyStatus.Present } });
+    const done = finishParty(train, ALICE, PARTY_NOW, 5);
+    expect(done).toMatchObject({ ok: true, asked: [], wasComplete: false, left: true });
+    expect(done.ok && Object.keys(done.party.attendees)).toEqual([REPORTER, BOB]);
+    expect(done.ok && done.party.attendees[BOB]?.status).toBe(PartyStatus.Present);
+    expect(done).not.toHaveProperty('conductorLeft');
+  });
+
+  it('frees the conductor who leaves, by leaving and by being done', () => {
+    const led = onRoute([4, 1], 1, { conductorId: ALICE });
+    const left = leaveParty(led, ALICE);
+    expect(left).toMatchObject({ ok: true, conductorLeft: true });
+    expect(left.ok && left.party.train).toEqual({ ...led.train, conductorId: null });
+    const done = finishParty(led, ALICE, PARTY_NOW, 5);
+    expect(done).toMatchObject({ ok: true, left: true, conductorLeft: true });
+    expect(done.ok && done.party.train.conductorId).toBeNull();
+  });
+
+  it('keeps the conductor when somebody else leaves, and says nothing of it', () => {
+    const led = onRoute([4, 1], 1, { conductorId: ALICE });
+    const left = leaveParty(led, BOB);
+    expect(left.ok && left.party.train).toBe(led.train);
+    expect(left).not.toHaveProperty('conductorLeft');
+    // In a raid and in a meetup nobody is a conductor.
+    expect(leaveParty(testRaid(), REPORTER)).not.toHaveProperty('conductorLeft');
+    expect(leaveParty(testMeetup(), REPORTER)).not.toHaveProperty('conductorLeft');
+  });
+
+  it('keeps the conductor who steps back to interested or goes remote', () => {
+    const led = onRoute([4], 0, { conductorId: ALICE });
+    const stepped = setNotHere(led, ALICE);
+    expect(stepped.ok && stepped.party.train.conductorId).toBe(ALICE);
+  });
+});
+
+describe('a route edit that changes where the train is', () => {
+  /** The same train with Bob here, remotely, with a guest. */
+  const withBobHere = (train: TrainParty): TrainParty =>
+    withAttendees(train, { [BOB]: { status: PartyStatus.Present, number: 2, remote: true } });
+  const bob = (change: Change<TrainParty>) => (change.ok ? change.party.attendees[BOB] : undefined);
+
+  it('is a movement: with a conductor only they and staff may remove the stop the train is at', () => {
+    const led = onRoute([4, 1, 7], 1, { conductorId: ALICE });
+    expect(removeStop(led, BOB, 2)).toEqual(refusal('not-conductor'));
+    expect(removeStop(led, ALICE, 2)).toMatchObject({ ok: true, gymId: 1, moved: true });
+    expect(removeStop(led, BOB, 2, true)).toMatchObject({ ok: true, moved: true });
+    // Another stop is anybody's who is signed up: the train stays where it is.
+    expect(removeStop(led, BOB, 1)).toMatchObject({ ok: true, gymId: 4, moved: false });
+    expect(removeStop(led, BOB, 3)).toMatchObject({ ok: true, gymId: 7, moved: false });
+    expect(removeStop(led, CAROL, 3)).toEqual(refusal('not-attending'));
+    // Without a conductor, anybody who is signed up may.
+    expect(removeStop(onRoute([4, 1, 7], 1), BOB, 2)).toMatchObject({ ok: true, moved: true });
+  });
+
+  it('puts who is here back to coming when the train is at another gym by it', () => {
+    const train = withBobHere(onRoute([4, 1, 7], 1));
+    const removed = removeStop(train, ALICE, 2);
+    expect(removed.ok && currentStop(removed.party)).toBe(7);
+    expect(bob(removed)).toEqual({ ...train.attendees[BOB], status: PartyStatus.Coming });
+    // Not when the train stays where it is.
+    expect(bob(removeStop(train, ALICE, 1))).toBe(train.attendees[BOB]);
+    expect(bob(moveStop(train, ALICE, 2, 3))).toBe(train.attendees[BOB]);
+  });
+
+  it('leaves who is here as they are when the edit finishes or empties the route', () => {
+    const last = withBobHere(onRoute([4, 1], 1));
+    const finished = removeStop(last, ALICE, 2);
+    expect(finished).toMatchObject({ ok: true, moved: true });
+    expect(finished.ok && routeFinished(finished.party)).toBe(true);
+    expect(bob(finished)).toBe(last.attendees[BOB]);
+    const only = withBobHere(onRoute([4], 0));
+    const emptied = removeStop(only, ALICE, 1);
+    expect(emptied).toMatchObject({ ok: true, moved: true });
+    expect(bob(emptied)).toBe(only.attendees[BOB]);
+  });
+
+  it('is a movement to add a stop to a finished route', () => {
+    const done = withBobHere(onRoute([4, 1], 2, { conductorId: ALICE }));
+    expect(addStop(done, BOB, 7)).toEqual(refusal('not-conductor'));
+    const on = addStop(done, ALICE, 7);
+    expect(on).toMatchObject({ ok: true, number: 3, moved: true });
+    expect(bob(on)?.status).toBe(PartyStatus.Coming);
+    expect(addStop(done, BOB, 7, true)).toMatchObject({ ok: true, moved: true });
+    // A stop added behind the train moves nothing, and is anybody's who is signed up.
+    const going = withBobHere(onRoute([4, 1], 0, { conductorId: ALICE }));
+    const added = addStop(going, BOB, 7);
+    expect(added).toMatchObject({ ok: true, number: 3, moved: false });
+    expect(bob(added)).toBe(going.attendees[BOB]);
+  });
+
+  it('always takes the right to move the train to load a route: it puts the train at the start', () => {
+    const led = withBobHere(onRoute([4, 1, 7], 1, { conductorId: ALICE }));
+    expect(replaceRoute(led, BOB, [9, 2])).toEqual(refusal('not-conductor'));
+    // Also for a route that would leave the train at the gym it is at.
+    expect(replaceRoute(led, BOB, [1, 2])).toEqual(refusal('not-conductor'));
+    const loaded = replaceRoute(led, ALICE, [9, 2]);
+    expect(loaded).toMatchObject({ ok: true, moved: true });
+    expect(bob(loaded)?.status).toBe(PartyStatus.Coming);
+    // Staff may, signed up or not; without a conductor anybody who is signed up.
+    expect(replaceRoute(led, CAROL, [9, 2], true)).toMatchObject({ ok: true, moved: true });
+    expect(replaceRoute(onRoute([4]), CAROL, [9])).toEqual(refusal('not-attending'));
+    // A route that begins where the train is leaves everybody as they are.
+    const same = replaceRoute(withBobHere(onRoute([4, 1], 0)), ALICE, [4, 9]);
+    expect(same).toMatchObject({ ok: true, moved: false });
+    expect(bob(same)?.status).toBe(PartyStatus.Present);
+    expect(replaceRoute(onRoute([9, 7, 2]), ALICE, [9, 7, 2])).toMatchObject({ moved: false });
+  });
+
+  it('says whether clearing the route took the train from where it was', () => {
+    const train = withBobHere(onRoute([4, 1], 1));
+    const cleared = clearRoute(train, CAROL, true);
+    expect(cleared).toMatchObject({ ok: true, moved: true });
+    expect(bob(cleared)).toBe(train.attendees[BOB]);
+    expect(clearRoute(testTrain(), CAROL, true)).toMatchObject({ ok: true, moved: false });
+  });
+});
+
+describe('Finish, and Next from the last stop', () => {
+  it('leave who is here as here: there is nowhere to come to', () => {
+    const train = withAttendees(onRoute([4, 1, 7], 2), { [BOB]: { status: PartyStatus.Present } });
+    for (const move of ['finish', 'next'] as const) {
+      const moved = moveTrain(train, ALICE, move, false);
+      expect(moved).toMatchObject({ ok: true, finished: true });
+      expect(moved.ok && moved.party.attendees).toBe(train.attendees);
+    }
+    const early = withAttendees(onRoute([4, 1, 7], 0), { [BOB]: { status: PartyStatus.Present } });
+    const finished = moveTrain(early, ALICE, 'finish', false);
+    expect(finished.ok && finished.party.attendees[BOB]?.status).toBe(PartyStatus.Present);
+    // Back from the end, the train goes to a gym again.
+    const back = finished.ok ? moveTrain(finished.party, ALICE, 'previous', false) : finished;
+    expect(back.ok && back.party.attendees[BOB]?.status).toBe(PartyStatus.Coming);
+  });
+});
+
+describe('a move asked for from where the train was seen', () => {
+  it('names where a train is: the gym of its stop, the end of its route, or nowhere yet', () => {
+    expect(placeOf(onRoute([4, 1, 7], 1))).toBe('1');
+    expect(placeOf(onRoute([4, 1, 7], 3))).toBe('end');
+    expect(placeOf(testTrain())).toBe('none');
+  });
+
+  it('is made only while the train is still there', () => {
+    const train = onRoute([4, 1, 7], 1);
+    expect(moveTrain(train, ALICE, 'next', false, '1')).toMatchObject({ ok: true, at: 7 });
+    expect(moveTrain(train, ALICE, 'next', false, '4')).toEqual(refusal('train-moved-on'));
+    expect(moveTrain(train, ALICE, 'previous', false, 'end')).toEqual(refusal('train-moved-on'));
+    expect(moveTrain(onRoute([4, 1], 2), ALICE, 'previous', false, 'end')).toMatchObject({
+      ok: true,
+    });
+    // The same number of the stop, but another gym: the route was edited.
+    expect(moveTrain(onRoute([4, 9, 7], 1), ALICE, 'next', false, '1')).toEqual(
+      refusal('train-moved-on'),
+    );
+    // Who may not move the train is told that first.
+    expect(moveTrain(train, CAROL, 'next', false, '4')).toEqual(refusal('not-attending'));
+    // Without it (a command), the move is made from wherever the train is.
+    expect(moveTrain(train, ALICE, 'next', false).ok).toBe(true);
+  });
+});
+
+describe('the first stop of a route', () => {
+  /** A train without a route, led by Alice, with Bob here. */
+  const empty: TrainParty = withAttendees(onRoute([], 0, { conductorId: ALICE }), {
+    [BOB]: { status: PartyStatus.Present },
+  });
+
+  it('is an ordinary edit: anybody who is signed up may add it, also with a conductor', () => {
+    const added = addStop(empty, BOB, 7);
+    expect(added).toMatchObject({ ok: true, number: 1, moved: false });
+    expect(added.ok && currentStop(added.party)).toBe(7);
+    // Nobody was on the way anywhere: who is here stays here.
+    expect(added.ok && added.party.attendees).toBe(empty.attendees);
+    expect(addStop(empty, CAROL, 7)).toEqual(refusal('not-attending'));
+  });
+
+  it('comes with a loaded route too, which still takes the right to move the train', () => {
+    expect(replaceRoute(empty, BOB, [9, 2])).toEqual(refusal('not-conductor'));
+    const loaded = replaceRoute(empty, ALICE, [9, 2]);
+    expect(loaded).toMatchObject({ ok: true, moved: false });
+    expect(loaded.ok && loaded.party.train).toMatchObject({ route: [9, 2], stop: 0 });
+    expect(loaded.ok && loaded.party.attendees).toBe(empty.attendees);
+  });
+});
+
+describe('staff who are not signed up', () => {
+  it('may add, remove and move stops, as they may move the train', () => {
+    const train = onRoute([4, 1, 7], 1, { conductorId: ALICE });
+    expect(addStop(train, CAROL, 9)).toEqual(refusal('not-attending'));
+    expect(addStop(train, CAROL, 9, true)).toMatchObject({ ok: true, number: 4 });
+    expect(removeStop(train, CAROL, 3)).toEqual(refusal('not-attending'));
+    expect(removeStop(train, CAROL, 3, true)).toMatchObject({ ok: true, gymId: 7 });
+    // Also the stop the train is at.
+    expect(removeStop(train, CAROL, 2, true)).toMatchObject({ ok: true, moved: true });
+    expect(moveStop(train, CAROL, 1, 3)).toEqual(refusal('not-attending'));
+    expect(where(moveStop(train, CAROL, 1, 3, true)).route).toEqual([1, 7, 4]);
+  });
+});
+
+describe('a move asked for with the stop it was promised to lead to', () => {
+  it('names where a move would take the train: the gym of that stop, or the end', () => {
+    const train = onRoute([4, 1, 7], 0);
+    expect(targetOf(train, 'next')).toBe('1');
+    expect(targetOf(train, 'skip')).toBe('7');
+    expect(targetOf(train, 'finish')).toBe('end');
+    expect(targetOf(onRoute([4, 1, 7], 2), 'next')).toBe('end');
+    expect(targetOf(onRoute([4, 1, 7], 1), 'previous')).toBe('4');
+    expect(targetOf(onRoute([4, 1, 7], 3), 'previous')).toBe('7');
+  });
+
+  it('is made only while the move still leads there', () => {
+    // The panel was drawn at gym 4 with "next is gym 1"; gym 1 was removed since.
+    const edited = onRoute([4, 7, 2], 0);
+    expect(moveTrain(edited, ALICE, 'next', false, '4', '1')).toEqual(refusal('route-changed'));
+    expect(moveTrain(edited, ALICE, 'next', false, '4', '7')).toMatchObject({ ok: true, at: 7 });
+    expect(moveTrain(edited, ALICE, 'skip', false, '4', '7')).toEqual(refusal('route-changed'));
+    expect(moveTrain(edited, ALICE, 'skip', false, '4', '2')).toMatchObject({ ok: true, at: 2 });
+    // A stop was added behind the last one: Next no longer finishes the route.
+    expect(moveTrain(onRoute([4, 1], 1), ALICE, 'next', false, '1', 'end')).toMatchObject({
+      ok: true,
+      finished: true,
+    });
+    expect(moveTrain(onRoute([4, 1, 7], 1), ALICE, 'next', false, '1', 'end')).toEqual(
+      refusal('route-changed'),
+    );
+    // A wrong place is said first, and a move that cannot be made at all before the target.
+    expect(moveTrain(edited, ALICE, 'next', false, '9', '1')).toEqual(refusal('train-moved-on'));
+    expect(moveTrain(onRoute([4, 1], 0), ALICE, 'skip', false, '4', '7')).toEqual(
+      refusal('no-stop-to-skip'),
+    );
+    // Without a target (Previous, Finish, a command) only the place counts.
+    expect(moveTrain(edited, ALICE, 'next', false, '4').ok).toBe(true);
+  });
+});
```

Apply to `src/render/activity.test.ts`:

```diff
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -111,6 +111,31 @@ describe('problemText', () => {
       'You are not signed up for this raid.',
     );
   });
+
+  it('says what a train refuses: its route, its moves, its conductor', () => {
+    const said = (reason: PartyProblem) => problemText(reason, { maxNumber: 21 }, 'train');
+    expect(said('not-attending')).toBe('You are not signed up for this train.');
+    expect(said('party-wide-start')).toBe(
+      'A train starts for everybody at once: its groups have no meeting times.',
+    );
+    expect(said('too-many-groups')).toBe('A train cannot have more than five groups.');
+    expect(said('no-route')).toBe('This train has no route yet. Add its stops with `/route add`.');
+    expect(said('route-finished')).toBe('This train has finished its route.');
+    expect(said('at-first-stop')).toBe('This train is at its first stop.');
+    expect(said('no-stop-to-skip')).toBe('There is no stop after the next one to skip to.');
+    expect(said('already-on-route')).toBe('That gym is on the route already.');
+    expect(said('route-full')).toBe('A route has at most 50 stops.');
+    expect(said('no-such-stop')).toBe('The route has no stop with that number.');
+    expect(said('empty-route')).toBe('That route has no stops.');
+    expect(said('not-conductor')).toBe(
+      'This train has a conductor: only they and the moderators can move it.',
+    );
+    expect(said('conductor-or-staff')).toBe(
+      'Only the conductor of this train and the moderators can do that.',
+    );
+    expect(said('train-moved-on')).toBe('The train has moved on meanwhile.');
+    expect(said('route-changed')).toBe('The route has changed meanwhile.');
+  });
 });
 
 describe('archiveWarning', () => {
```

Run: `npx vitest run --project unit src/domain/party/train.test.ts src/render/activity.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/domain/party/attendance.ts`:

```diff
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -5,6 +5,7 @@ import {
   hasGroups,
   isRaid,
   isTimed,
+  isTrain,
   MAX_MEMBER_NAME,
   membersWhere,
   refused,
@@ -240,11 +241,25 @@ export function setNotHere<P extends Party>(party: P, memberId: string): Change<
   };
 }
 
-/** Removes a member from the party. */
-export function leaveParty<P extends Party>(party: P, memberId: string): Change<P> {
+/** The party without this member as the conductor of a train; the very same party otherwise. */
+function withoutConductor<P extends Party>(party: P, memberId: string): P {
+  if (!isTrain(party) || party.train.conductorId !== memberId) return party;
+  return { ...party, train: { ...party.train, conductorId: null } };
+}
+
+/**
+ * Removes a member from the party. The conductor of a train who leaves stops being it
+ * (`conductorLeft`): a train is not led by somebody who is not on it.
+ */
+export function leaveParty<P extends Party>(
+  party: P,
+  memberId: string,
+): Change<P, { conductorLeft?: true }> {
   if (!attendeeOf(party, memberId)) return refused('not-attending');
   const { [memberId]: _left, ...attendees } = party.attendees;
-  return { ok: true, party: { ...party, attendees } };
+  const gone: P = { ...party, attendees };
+  const left = withoutConductor(gone, memberId);
+  return { ok: true, party: left, ...(left === gone ? {} : { conductorLeft: true as const }) };
 }
 
 /**
@@ -312,14 +327,15 @@ export function completeRaid<P extends RaidParty>(
  * A member is done with the party. In a raid that completes it (`completeRaid`), which is
  * refused while the raid is an egg: nobody can have completed that. Any other party has nothing
  * to complete, so done means leave, as with the legacy bot: the member is taken off (`left`),
- * nobody is asked anything and nobody ever has the status `Complete`. Only for an attendee.
+ * nobody is asked anything and nobody ever has the status `Complete`; the conductor of a train
+ * stops being it (`conductorLeft`, which the legacy bot forgot for done). Only for an attendee.
  */
 export function finishParty<P extends Party>(
   party: P,
   memberId: string,
   now: number,
   timeoutMinutes: number,
-): Change<P, { asked: string[]; wasComplete: boolean; left: boolean }> {
+): Change<P, { asked: string[]; wasComplete: boolean; left: boolean; conductorLeft?: true }> {
   if (!isRaid(party)) {
     const gone = leaveParty(party, memberId);
     return gone.ok ? { ...gone, asked: [], wasComplete: false, left: true } : gone;
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -163,6 +163,21 @@ export function sameBoss(a: RaidBossRef | null, b: RaidBossRef | null): boolean
   return 'name' in b && a.name === b.name;
 }
 
+/**
+ * The boss of a party that can have one: what a raid is against, and what a train is after.
+ * Null for a party without one, of whatever kind.
+ */
+export function bossOf(party: Party): RaidBossRef | null {
+  switch (party.type) {
+    case 'raid':
+      return party.raid.boss;
+    case 'train':
+      return party.train.boss;
+    case 'meetup':
+      return null;
+  }
+}
+
 export type RaidStage = 'egg' | 'hatched' | 'ended';
 
 export interface RaidDetails {
@@ -372,7 +387,31 @@ export type PartyProblem =
   /** The gym lies in no region of the raid's server that has a forum for its post. */
   | 'other-region'
   /** The boss of the raid does not have that move. */
-  | 'not-a-move';
+  | 'not-a-move'
+  /** The train has no route yet: there is nowhere to move it. */
+  | 'no-route'
+  /** The train has been through its whole route. */
+  | 'route-finished'
+  /** The train is at its first stop: there is none before it. */
+  | 'at-first-stop'
+  /** There is no stop after the next one. */
+  | 'no-stop-to-skip'
+  /** The gym is a stop of the route already. */
+  | 'already-on-route'
+  /** A route holds no more stops. */
+  | 'route-full'
+  /** The route has no stop with that number. */
+  | 'no-such-stop'
+  /** A route without a gym: nothing to load, nothing to save. */
+  | 'empty-route'
+  /** The train has a conductor, and only they and staff move it. */
+  | 'not-conductor'
+  /** Only the conductor of the train and staff may do this. */
+  | 'conductor-or-staff'
+  /** The train is no longer where the control that was pressed showed it. */
+  | 'train-moved-on'
+  /** The route was edited: the control that was pressed would lead elsewhere than it said. */
+  | 'route-changed';
 
 /** A change that was not made. It has no `party`, which is how `PartyStore.update` knows. */
 export interface Refusal {
```

Apply to `src/domain/party/train.ts`:

```diff
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -1,4 +1,15 @@
-import { refused, type Change, type TrainParty } from './party.js';
+import {
+  attendeeOf,
+  MAX_ROUTE_STOPS,
+  refused,
+  sameBoss,
+  type Attendee,
+  type Change,
+  type RaidBossRef,
+  type TrainDetails,
+  type TrainParty,
+} from './party.js';
+import { PartyStatus } from './status.js';
 import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js';
 
 export type NewTrain = NewTimedParty;
@@ -19,3 +30,407 @@ export function createTrain(input: NewTrain): Change<TrainParty> {
   };
   return { ok: true, party: settled(train, input.now) };
 }
+
+/**
+ * Whether the train has been through its whole route. A train without a route has not finished
+ * one: it has none yet.
+ */
+export function routeFinished(party: TrainParty): boolean {
+  const { route, stop } = party.train;
+  return route.length > 0 && stop >= route.length;
+}
+
+/**
+ * The gym the train is at: the id of its current stop. Undefined while it has no route, and
+ * once the route is finished. This is the gym of a train: `gymId` is not used for one.
+ */
+export function currentStop(party: TrainParty): number | undefined {
+  return party.train.route[party.train.stop];
+}
+
+/** The gym the train goes to next; undefined at the last stop and wherever there is no current one. */
+export function nextStop(party: TrainParty): number | undefined {
+  return currentStop(party) === undefined ? undefined : party.train.route[party.train.stop + 1];
+}
+
+/** The party with this in the part that only a train has. */
+function withTrain(party: TrainParty, change: Partial<TrainDetails>): TrainParty {
+  return { ...party, train: { ...party.train, ...change } };
+}
+
+/**
+ * The train with another route, at the gym it was at: the current stop follows its gym through
+ * every edit (the legacy bot kept the number, so removing an earlier stop moved the train on).
+ * When that gym is no longer on the route, the train is at the stop that took its place, which
+ * `fallback` names (an index of the new route). A finished route stays finished, and a train
+ * whose route is empty is at the start.
+ */
+function withRoute(party: TrainParty, route: readonly number[], fallback: number): TrainParty {
+  if (route.length === 0) return withTrain(party, { route, stop: 0 });
+  if (routeFinished(party)) return withTrain(party, { route, stop: route.length });
+  const at = currentStop(party);
+  const kept = at === undefined ? -1 : route.indexOf(at);
+  return withTrain(party, { route, stop: kept >= 0 ? kept : Math.min(fallback, route.length) });
+}
+
+/** A stop number as members give it (from 1) as an index of the route; undefined when there is none. */
+function stopIndex(party: TrainParty, number: number): number | undefined {
+  return Number.isInteger(number) && number >= 1 && number <= party.train.route.length
+    ? number - 1
+    : undefined;
+}
+
+/**
+ * Where a train is, as a word that an edit of the route does not change while the train stays
+ * there: the id of the gym of its current stop, `end` once the route is finished, `none` while
+ * it has no route. A control that moves the train carries it, so that a press is for the place
+ * the control was drawn at (`moveTrain`).
+ */
+export function placeOf(party: TrainParty): string {
+  const at = currentStop(party);
+  if (at !== undefined) return String(at);
+  return routeFinished(party) ? 'end' : 'none';
+}
+
+/**
+ * Why a member may not move the train, or undefined when they may: with a conductor, only the
+ * conductor and staff (`not-conductor`); without one, anybody who is signed up
+ * (`not-attending`), and staff. (The legacy bot knew the conductor by their user name.)
+ */
+export function mayNotMove(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): 'not-conductor' | 'not-attending' | undefined {
+  if (staff) return undefined;
+  const { conductorId } = party.train;
+  if (conductorId !== null) return conductorId === memberId ? undefined : 'not-conductor';
+  return attendeeOf(party, memberId) ? undefined : 'not-attending';
+}
+
+/** Everybody who is here is coming again: they are on their way to the next stop. */
+function allAboard(party: TrainParty): TrainParty {
+  let moved = false;
+  const attendees: Record<string, Attendee> = {};
+  for (const [memberId, attendee] of Object.entries(party.attendees)) {
+    const here = attendee.status === PartyStatus.Present;
+    moved ||= here;
+    // Count, group and remote stay (the legacy bot dropped remote here).
+    attendees[memberId] = here ? { ...attendee, status: PartyStatus.Coming } : attendee;
+  }
+  return moved ? { ...party, attendees } : party;
+}
+
+/**
+ * The train after it was taken to another place: everybody who is here is coming again when
+ * there is a gym to come to. At the end of its route, and without one, who is here stays here
+ * (as with the legacy bot's Finish: there is nowhere to come to).
+ */
+function arrived(party: TrainParty): TrainParty {
+  return currentStop(party) === undefined ? party : allAboard(party);
+}
+
+/**
+ * What an edit of the route comes to. An edit after which the train is somewhere else than
+ * before (at another gym, at the end of its route, or off it) is a movement of the train:
+ * `moved`. It takes the right to move the train (`mayNotMove`; `always` asks for that right
+ * whatever the edit does), and it puts who is here back to coming like a move (`arrived`). An
+ * edit that leaves the train where it is, is for whoever the caller let through.
+ *
+ * A train that had no route was nowhere: its first stop, or a route that is loaded into it, is
+ * an ordinary edit and no movement. Nobody was on the way anywhere, so who is here stays here.
+ */
+function edited<Extra>(
+  before: TrainParty,
+  after: TrainParty,
+  memberId: string,
+  staff: boolean,
+  extra: Extra,
+  always = false,
+): Change<TrainParty, Extra & { moved: boolean }> {
+  const moved = before.train.route.length > 0 && placeOf(before) !== placeOf(after);
+  if (moved || always) {
+    const problem = mayNotMove(before, memberId, staff);
+    if (problem) return refused(problem);
+  }
+  return { ok: true, party: moved ? arrived(after) : after, ...extra, moved };
+}
+
+/**
+ * Adds a gym to the end of the route. Only for a member who is signed up, and for staff
+ * (`not-attending`); a gym that is on the route already is refused (`already-on-route`), and so
+ * is a stop beyond what a route holds (`route-full`). A stop added to a finished route makes
+ * the train go on there: that is a movement of the train (`moved`, see `edited`). The first
+ * stop of a route is where the train then is, and is no movement. The caller has checked that
+ * there is such a gym.
+ */
+export function addStop(
+  party: TrainParty,
+  memberId: string,
+  gymId: number,
+  staff = false,
+): Change<TrainParty, { number: number; moved: boolean }> {
+  if (!staff && !attendeeOf(party, memberId)) return refused('not-attending');
+  const { route } = party.train;
+  if (route.includes(gymId)) return refused('already-on-route');
+  if (route.length >= MAX_ROUTE_STOPS) return refused('route-full');
+  // The stop the train is at keeps its number; a finished route has the new stop at that number.
+  const added = withTrain(party, { route: [...route, gymId] });
+  return edited(party, added, memberId, staff, { number: route.length + 1 });
+}
+
+/**
+ * Takes a stop off the route, by its number (from 1). Only for a member who is signed up, and
+ * for staff; a
+ * number the route does not have is refused (`no-such-stop`). The train stays at the gym it is
+ * at; when that very stop is removed, the one after it is the current one, or the route is
+ * finished when it was the last: that is a movement of the train (`moved`, see `edited`).
+ * `gymId` is the gym that was removed.
+ */
+export function removeStop(
+  party: TrainParty,
+  memberId: string,
+  number: number,
+  staff = false,
+): Change<TrainParty, { gymId: number; moved: boolean }> {
+  if (!staff && !attendeeOf(party, memberId)) return refused('not-attending');
+  const index = stopIndex(party, number);
+  const gymId = index === undefined ? undefined : party.train.route[index];
+  if (index === undefined || gymId === undefined) return refused('no-such-stop');
+  const route = party.train.route.filter((_gym, at) => at !== index);
+  // Only the current stop itself can be missing afterwards: what came after it is at its number.
+  return edited(party, withRoute(party, route, index), memberId, staff, { gymId });
+}
+
+/**
+ * Moves a stop to another place of the route: `from` is its number, `to` the number it has
+ * afterwards (so a stop can be moved to the end, which the legacy bot could not). Only for a
+ * member who is signed up, and for staff; numbers the route does not have are refused
+ * (`no-such-stop`). The
+ * train stays at the gym it is at, so this is never a movement of the train. The very same
+ * party comes back when nothing moves.
+ */
+export function moveStop(
+  party: TrainParty,
+  memberId: string,
+  from: number,
+  to: number,
+  staff = false,
+): Change<TrainParty, { gymId: number }> {
+  if (!staff && !attendeeOf(party, memberId)) return refused('not-attending');
+  const [source, target] = [stopIndex(party, from), stopIndex(party, to)];
+  const gymId = source === undefined ? undefined : party.train.route[source];
+  if (source === undefined || target === undefined || gymId === undefined) {
+    return refused('no-such-stop');
+  }
+  if (source === target) return { ok: true, party, gymId };
+  const route = party.train.route.filter((_gym, at) => at !== source);
+  route.splice(target, 0, gymId);
+  return { ok: true, party: withRoute(party, route, party.train.stop), gymId };
+}
+
+/**
+ * Whether a member may do what only the conductor and the staff may: clear the route, and take
+ * the conductor off. `staff` says whether the member is staff.
+ */
+function leads(party: TrainParty, memberId: string, staff: boolean): boolean {
+  return staff || party.train.conductorId === memberId;
+}
+
+/**
+ * Empties the route and puts the train at the start. Only for the conductor and for staff
+ * (`conductor-or-staff`). `moved` says whether that took the train from where it was; who is
+ * here stays here. The very same party comes back when there is no route.
+ */
+export function clearRoute(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): Change<TrainParty, { moved: boolean }> {
+  if (!leads(party, memberId, staff)) return refused('conductor-or-staff');
+  if (party.train.route.length === 0 && party.train.stop === 0) {
+    return { ok: true, party, moved: false };
+  }
+  const cleared = withTrain(party, { route: [], stop: 0 });
+  return { ok: true, party: cleared, moved: placeOf(party) !== placeOf(cleared) };
+}
+
+/**
+ * Replaces the route (a saved one that is loaded) and puts the train at its first stop. That
+ * always takes the right to move the train (`mayNotMove`), wherever the train ends up; when it
+ * is at another place than before, it is a movement (`moved`, see `edited`: not for a train
+ * that had no route). A gym that is
+ * named twice counts once, and what a route does not hold is left off; a route without any gym
+ * is refused (`empty-route`). The caller has left out the gyms that no longer exist. The very
+ * same party comes back when the train has that route already and is at its first stop.
+ */
+export function replaceRoute(
+  party: TrainParty,
+  memberId: string,
+  gymIds: readonly number[],
+  staff = false,
+): Change<TrainParty, { moved: boolean }> {
+  const problem = mayNotMove(party, memberId, staff);
+  if (problem) return refused(problem);
+  const route = [...new Set(gymIds)].slice(0, MAX_ROUTE_STOPS);
+  if (route.length === 0) return refused('empty-route');
+  const same =
+    party.train.stop === 0 &&
+    party.train.route.length === route.length &&
+    route.every((gymId, index) => party.train.route[index] === gymId);
+  if (same) return { ok: true, party, moved: false };
+  return edited(party, withTrain(party, { route, stop: 0 }), memberId, staff, {}, true);
+}
+
+/** The ways a train moves along its route. */
+export const TRAIN_MOVES = ['next', 'previous', 'skip', 'finish'] as const;
+export type TrainMove = (typeof TRAIN_MOVES)[number];
+
+export function isTrainMove(value: string): value is TrainMove {
+  return (TRAIN_MOVES as readonly string[]).includes(value);
+}
+
+/**
+ * Why the train cannot move this way from where it is, or undefined when it can. All of them
+ * need a route (`no-route`). `next` goes on from every stop (from the last one it finishes the
+ * route) and not from a finished route; `previous` goes back from everywhere but the first
+ * stop, also from a finished route to its last stop; `skip` needs a stop after the next one;
+ * `finish` is refused once the route is finished.
+ */
+export function cannotMove(
+  party: TrainParty,
+  move: TrainMove,
+): 'no-route' | 'route-finished' | 'at-first-stop' | 'no-stop-to-skip' | undefined {
+  const { route, stop } = party.train;
+  if (route.length === 0) return 'no-route';
+  switch (move) {
+    case 'next':
+    case 'finish':
+      return stop >= route.length ? 'route-finished' : undefined;
+    case 'previous':
+      return stop === 0 ? 'at-first-stop' : undefined;
+    case 'skip':
+      return stop + 2 < route.length ? undefined : 'no-stop-to-skip';
+  }
+}
+
+/** The stop a move takes the train to, as an index of the route; its length is the end. */
+function stopAfter(party: TrainParty, move: TrainMove): number {
+  const { route, stop } = party.train;
+  switch (move) {
+    case 'next':
+      return Math.min(stop + 1, route.length);
+    case 'previous':
+      return Math.max(stop - 1, 0);
+    case 'skip':
+      return Math.min(stop + 2, route.length);
+    case 'finish':
+      return route.length;
+  }
+}
+
+/**
+ * Where a move would take the train from where it is, as `placeOf` names a place: the id of the
+ * gym of that stop, or `end`. A control that promises a stop ("Next is …") carries it, so that
+ * a press leads there or nowhere (`moveTrain`).
+ */
+export function targetOf(party: TrainParty, move: TrainMove): string {
+  const gym = party.train.route[stopAfter(party, move)];
+  return gym === undefined ? 'end' : String(gym);
+}
+
+/** Where a move has taken the train. */
+export interface TrainMoved {
+  move: TrainMove;
+  /** The gym the train is at now; undefined when the route is finished. */
+  at: number | undefined;
+  /** The gym that was left out, for a skip. */
+  skipped?: number;
+  /** The move finished the route (`finish`, or `next` from the last stop). */
+  finished: boolean;
+}
+
+/**
+ * Moves the train along its route: to the next stop, back to the one before, past the next one,
+ * or to the end of the route. Refused for a member who may not move it (`mayNotMove`) and for a
+ * move that cannot be made from where the train is (`cannotMove`), in that order. A move to a
+ * gym puts everybody who is here back to coming; at the end of the route who is here stays
+ * here. Finishing the route does not end the party and changes none of its times (as with the
+ * legacy bot).
+ *
+ * `from` is where the train was when the member asked (`placeOf`), for a control that was drawn
+ * then: when the train is somewhere else by now, the move is refused (`train-moved-on`), so
+ * that two members who press Next on the same stop move the train once. `target` is where that
+ * control said the move would lead (`targetOf`): when the route was edited since and the move
+ * would lead elsewhere, it is refused too (`route-changed`). Without them (a command) the move
+ * is made from wherever the train is, to wherever it leads.
+ */
+export function moveTrain(
+  party: TrainParty,
+  memberId: string,
+  move: TrainMove,
+  staff: boolean,
+  from?: string,
+  target?: string,
+): Change<TrainParty, TrainMoved> {
+  const forbidden = mayNotMove(party, memberId, staff);
+  if (forbidden) return refused(forbidden);
+  if (from !== undefined && from !== placeOf(party)) return refused('train-moved-on');
+  const problem = cannotMove(party, move);
+  if (problem) return refused(problem);
+  if (target !== undefined && target !== targetOf(party, move)) return refused('route-changed');
+  const { route, stop } = party.train;
+  const to = stopAfter(party, move);
+  const moved = arrived(withTrain(party, { stop: to }));
+  const skipped = move === 'skip' ? route[stop + 1] : undefined;
+  return {
+    ok: true,
+    party: moved,
+    move,
+    at: currentStop(moved),
+    ...(skipped === undefined ? {} : { skipped }),
+    finished: routeFinished(moved),
+  };
+}
+
+/**
+ * Makes a member the conductor. They must be signed up (`not-attending`; the legacy bot did not
+ * ask). Taking it over from another conductor is allowed: somebody who went offline must be
+ * replaceable. `previous` is who was the conductor before; the very same party comes back for
+ * the member who is it already.
+ */
+export function setConductor(
+  party: TrainParty,
+  memberId: string,
+): Change<TrainParty, { previous: string | null }> {
+  if (!attendeeOf(party, memberId)) return refused('not-attending');
+  const previous = party.train.conductorId;
+  if (previous === memberId) return { ok: true, party, previous };
+  return { ok: true, party: withTrain(party, { conductorId: memberId }), previous };
+}
+
+/**
+ * Leaves the train without a conductor. Only the conductor themself and staff may
+ * (`conductor-or-staff`; with the legacy bot anybody could). `previous` is who was the
+ * conductor; the very same party comes back when there was none.
+ */
+export function clearConductor(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): Change<TrainParty, { previous: string | null }> {
+  const previous = party.train.conductorId;
+  if (previous === null) return { ok: true, party, previous };
+  if (!leads(party, memberId, staff)) return refused('conductor-or-staff');
+  return { ok: true, party: withTrain(party, { conductorId: null }), previous };
+}
+
+/**
+ * Sets which Pokémon the train is after, or none with null: for the picture and what the post
+ * says about that boss. It has no tier, no moves and no times: a train goes from raid to raid.
+ * The very same party comes back when the boss is what it was.
+ */
+export function setTrainBoss(party: TrainParty, boss: RaidBossRef | null): Change<TrainParty> {
+  if (sameBoss(party.train.boss, boss)) return { ok: true, party };
+  return { ok: true, party: withTrain(party, { boss }) };
+}
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -4,6 +4,7 @@ import {
   groupOf,
   MAX_MEETUP_DESCRIPTION,
   MAX_PARTY_NAME,
+  MAX_ROUTE_STOPS,
   partyWord,
   type Attendee,
   type Party,
@@ -140,6 +141,30 @@ export function problemText(
         'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
         'move there.'
       );
+    case 'no-route':
+      return 'This train has no route yet. Add its stops with `/route add`.';
+    case 'route-finished':
+      return 'This train has finished its route.';
+    case 'at-first-stop':
+      return 'This train is at its first stop.';
+    case 'no-stop-to-skip':
+      return 'There is no stop after the next one to skip to.';
+    case 'already-on-route':
+      return 'That gym is on the route already.';
+    case 'route-full':
+      return `A route has at most ${MAX_ROUTE_STOPS} stops.`;
+    case 'no-such-stop':
+      return 'The route has no stop with that number.';
+    case 'empty-route':
+      return 'That route has no stops.';
+    case 'not-conductor':
+      return 'This train has a conductor: only they and the moderators can move it.';
+    case 'conductor-or-staff':
+      return 'Only the conductor of this train and the moderators can do that.';
+    case 'train-moved-on':
+      return 'The train has moved on meanwhile.';
+    case 'route-changed':
+      return 'The route has changed meanwhile.';
   }
 }
 
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/party/train.test.ts src/render/activity.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 41561ee -- src test   # must print nothing
npx prettier --check src/domain/party/attendance.ts src/domain/party/party.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/activity.test.ts src/render/activity.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/domain/party/attendance.ts src/domain/party/party.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/activity.test.ts src/render/activity.ts
git commit -m "The domain of a train: route, movement, conductor, boss" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,343 unit tests.

---

### Task 4: The clock for a train, and whom its archive warning is meant for

**Files:**
- Create: `src/domain/party/tick.train.test.ts`
- Modify: `src/domain/party/tick.ts`, `src/services/party-scheduler.ts`

**Interfaces:**
- Consumes: `timedTick` (`tick.ts`), the scheduler's warning for a timed party without an end time (plan 3A).
- Produces: `timedTick` serving a train as it serves a meetup; `warningAddressee(party)` (`tick.ts`): the conductor of a train, otherwise the maker, only while signed up; the scheduler pings that member with the first warning.

A meetup's warning still goes to its maker; the tests of `tick.timed.test.ts` are unchanged.

Reference commit of the prototype for this task: `c710cb6`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/party/tick.train.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testMeetup,
  testRaid,
  testRaidRules,
  testTrain,
  withAttendees,
} from '../../../test/support/parties.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { leaveParty } from './attendance.js';
import { endParty, setSaved, type TrainParty } from './party.js';
import { PartyStatus } from './status.js';
import { partyTick, warningAddressee, type TickInput } from './tick.js';
import { OPEN_PARTY_HOURS, setStartTime, setTimedEnd } from './timed.js';
import { moveTrain, setConductor } from './train.js';

const rules = testRaidRules();
/** Grace 5 minutes; the warning of a raid 10, that of a train or meetup 60. */
const settings = loadSettings(TEST_SETTINGS_PATH);
const HOUR = 60 * MINUTE;
const DAY = OPEN_PARTY_HOURS * HOUR;

function tick(party: TrainParty, now: number, extra: Partial<TickInput> = {}) {
  return partyTick(party, {
    now,
    previous: now - MINUTE,
    settings,
    rules,
    // A train never asks what an egg hatches as.
    autoset: () => {
      throw new Error('a train has no egg');
    },
    ...extra,
  });
}

function changed<T extends { ok: boolean; party?: TrainParty }>(change: T): TrainParty {
  if (!change.party) throw new Error('refused');
  return change.party;
}

const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
/** A train on a route of three gyms, with Alice and Bob here. */
const boarded: TrainParty = {
  ...withAttendees(testTrain(), {
    [ALICE]: { status: PartyStatus.Present },
    [BOB]: { status: PartyStatus.Present },
  }),
  train: { route: [4, 1, 7], stop: 0, conductorId: null, boss: { key: 'yveltal' } },
};
/** The same from 16:00 to 18:00. */
const planned = changed(
  setTimedEnd(changed(setStartTime(boarded, ALICE, START, PARTY_NOW)), END, PARTY_NOW),
);

describe('partyTick for a train: the clock of a timed party', () => {
  it('does nothing while nothing is due', () => {
    for (const now of [PARTY_NOW + MINUTE, START - 1, START + MINUTE, END - MINUTE]) {
      expect(tick(planned, now)).toEqual({ party: planned, effects: [], render: false });
      expect(tick(planned, now).party).toBe(planned);
    }
  });

  it('has the post shown anew when the start and when the end passes, and says nothing', () => {
    expect(tick(planned, START)).toEqual({ party: planned, effects: [], render: true });
    expect(tick(planned, END)).toEqual({ party: planned, effects: [], render: true });
    expect(tick(planned, END + MINUTE).render).toBe(false);
  });

  it('never moves the train, asks nobody whether they are done and completes nobody', () => {
    for (const now of [START + 11 * MINUTE, END, END + 4 * MINUTE, END + DAY]) {
      const result = tick(planned, now);
      expect(result.party.train).toBe(planned.train);
      expect(result.party.attendees).toBe(planned.attendees);
      expect(result.effects.filter((effect) => effect.kind !== 'warn')).toEqual([]);
    }
  });

  it('is not over because its route is finished: only its times say so', () => {
    const finished = changed(moveTrain(planned, ALICE, 'finish', false));
    expect(tick(finished, START + HOUR)).toEqual({ party: finished, effects: [], render: false });
    const open = changed(moveTrain(boarded, ALICE, 'finish', false));
    expect(tick(open, PARTY_NOW + DAY).effects).toEqual([]);
    expect(open.lastPossibleTime).toBe(boarded.lastPossibleTime);
  });
});

describe('partyTick for a train: archiving', () => {
  it('schedules it five minutes after the end, an hour ahead, with a warning', () => {
    expect(tick(planned, END + 5 * MINUTE).effects).toEqual([]);
    const now = END + 5 * MINUTE + 1;
    const result = tick(planned, now);
    expect(result.party.deletionTime).toBe(now + 60 * MINUTE);
    expect(result).toMatchObject({
      effects: [{ kind: 'warn', deletionTime: now + 60 * MINUTE }],
      render: true,
    });
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
    expect(tick(warned, due)).toEqual({ party: warned, effects: [{ kind: 'end' }], render: false });
    expect(tick(warned, due + MINUTE).effects).toEqual([{ kind: 'end' }]);
    expect(tick(endParty(warned), due + MINUTE)).toMatchObject({ effects: [], render: false });
  });

  it('gives a train without an end a day from its start, and one without times a day from when it was made', () => {
    const open = changed(setStartTime(boarded, ALICE, START, PARTY_NOW));
    expect(tick(open, START + DAY + 5 * MINUTE).effects).toEqual([]);
    const now = START + DAY + 6 * MINUTE;
    expect(tick(open, now).effects).toEqual([{ kind: 'warn', deletionTime: now + 60 * MINUTE }]);
    const untimed = testTrain();
    expect(tick(untimed, PARTY_NOW + DAY + 5 * MINUTE).effects).toEqual([]);
    const late = PARTY_NOW + DAY + 6 * MINUTE;
    expect(tick(untimed, late).effects).toEqual([
      { kind: 'warn', deletionTime: late + 60 * MINUTE },
    ]);
  });

  it('starts over when a time that was set called the archiving off', () => {
    const late = PARTY_NOW + DAY + 6 * MINUTE;
    const warned = tick(testTrain(), late).party;
    expect(warned.deletionTime).not.toBeNull();
    const going = changed(setTimedEnd(warned, late + 2 * HOUR, late + MINUTE));
    expect(going.deletionTime).toBeNull();
    expect(tick(going, late + 2 * MINUTE).effects).toEqual([]);
  });

  it('never schedules or ends a train a moderator saved', () => {
    expect(tick(setSaved(planned, true), END + 2 * DAY).effects).toEqual([]);
  });
});

describe('warningAddressee', () => {
  it('is the conductor of a train without an end time, and its maker while it has none', () => {
    expect(warningAddressee(boarded)).toBe(REPORTER);
    const led = changed(setConductor(boarded, ALICE));
    expect(warningAddressee(led)).toBe(ALICE);
  });

  it('is nobody for a train that has an end time: everybody saw when it was over', () => {
    expect(warningAddressee(planned)).toBeUndefined();
    expect(warningAddressee(changed(setConductor(planned, ALICE)))).toBeUndefined();
  });

  it('is the maker again once the conductor has left, and nobody once the maker has left too', () => {
    const led = changed(setConductor(boarded, ALICE));
    const without = changed(leaveParty(led, ALICE));
    expect(warningAddressee(without)).toBe(REPORTER);
    expect(warningAddressee(changed(leaveParty(without, REPORTER)))).toBeUndefined();
    // A conductor leads the train also when its maker has left it.
    expect(warningAddressee(changed(leaveParty(led, REPORTER)))).toBe(ALICE);
  });

  it('is the maker of a meetup without an end time who is still signed up, and nobody for a raid', () => {
    expect(warningAddressee(testMeetup())).toBe(REPORTER);
    const left = leaveParty(testMeetup(), REPORTER);
    expect(left.ok && warningAddressee(left.party)).toBeUndefined();
    expect(warningAddressee(testRaid())).toBeUndefined();
  });
});
```

Run: `npx vitest run --project unit src/domain/party/tick.train.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/domain/party/tick.ts`:

```diff
--- a/src/domain/party/tick.ts
+++ b/src/domain/party/tick.ts
@@ -5,7 +5,10 @@ import type { RaidTier } from '../pogo/raid-tier.js';
 import type { RaidDurationRules } from '../time/raid-durations.js';
 import { askGroupWhetherComplete, completeUnanswered } from './attendance.js';
 import {
+  attendeeOf,
   isRaid,
+  isTimed,
+  isTrain,
   type GroupId,
   type Party,
   type PartyGroup,
@@ -130,6 +133,19 @@ function scheduled<P extends Party>(party: P, input: TickInput, warningMinutes:
   return { ...party, deletionTime: now + warningMinutes * MINUTE };
 }
 
+/**
+ * The member the first archive warning of a party is meant for, to be pinged when they allow it:
+ * of a timed party that has no end time, the conductor of a train when it has one, otherwise
+ * the member who made the party; and only somebody who is still signed up for it (who left it
+ * is not called back to it). Nothing else tells them that their party is about to go. Nobody
+ * for a party with an end time, and for a raid: those are over by times that everybody saw.
+ */
+export function warningAddressee(party: Party): string | undefined {
+  if (!isTimed(party) || party.endTime !== null) return undefined;
+  const lead = isTrain(party) ? (party.train.conductorId ?? party.createdById) : party.createdById;
+  return attendeeOf(party, lead) ? lead : undefined;
+}
+
 /** Whether the calendar day changed since the previous tick; the first tick takes it as changed. */
 function dayChanged(input: TickInput): boolean {
   const { zone } = input.rules;
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -1,8 +1,14 @@
 import type { Settings } from '../config/settings.js';
 import type { UserSettings } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
-import { attendeeOf, isRaid, isTimed, type Party } from '../domain/party/party.js';
-import { partyTick, tickAutoset, type TickEffect, type TickInput } from '../domain/party/tick.js';
+import { isRaid, type Party } from '../domain/party/party.js';
+import {
+  partyTick,
+  tickAutoset,
+  warningAddressee,
+  type TickEffect,
+  type TickInput,
+} from '../domain/party/tick.js';
 import type { Logger } from '../log.js';
 import { archiveWarning } from '../render/activity.js';
 import { fitItems, plain, withMentions } from '../render/text.js';
@@ -27,7 +33,7 @@ export interface PartySchedulerOptions {
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
-  /** The members' settings: whether the maker of a meetup lets the bot ping them. */
+  /** The members' settings: whether who leads a train or meetup lets the bot ping them. */
   users?: { get(snowflake: string): Promise<UserSettings> };
   settings: Settings;
   log: Logger;
@@ -42,8 +48,8 @@ export interface PartySchedulerOptions {
  * The clock of the parties (spec 5.3). Every `cleanupInterval` it runs `partyTick` for each
  * active party inside the store and does what the tick asks for: shows the post anew, says that
  * an egg has hatched, asks a group after its meeting time, counts silence as done, warns that
- * the post will be archived, and ends the party. A meetup asks only for the first and the last
- * two of these.
+ * the post will be archived, and ends the party. A meetup or a train asks only for the first
+ * and the last two of these.
  *
  * A tick compares the time with what each party records, so the first tick after a start
  * applies everything that was missed while the bot was down. The party is stored before
@@ -282,18 +288,16 @@ export class PartyScheduler {
   }
 
   /**
-   * Whom the first warning of a party pings: the member who made a timed party that has no end
-   * time, when they are still signed up for it (who left it is not called back to it) and
-   * allow mentions. Nothing else tells them that their meetup is about to go
-   * (a raid is over by its times, which everybody saw). Nobody when the warning is said again.
+   * Whom the first warning of a party pings: the member it is meant for (`warningAddressee`:
+   * the conductor of a train, or who made a train or meetup, that has no end time), when they
+   * allow mentions. Nobody when the warning is said again.
    */
   private async warned(party: Party): Promise<string[]> {
     const { users } = this.options;
-    if (!users || !isTimed(party) || party.endTime !== null) return [];
-    if (party.prompts.warning !== null) return [];
-    if (attendeeOf(party, party.createdById) === undefined) return [];
-    const settings = await users.get(party.createdById).catch(() => undefined);
-    return settings?.mentions === true ? [party.createdById] : [];
+    const addressee = warningAddressee(party);
+    if (!users || addressee === undefined || party.prompts.warning !== null) return [];
+    const settings = await users.get(addressee).catch(() => undefined);
+    return settings?.mentions === true ? [addressee] : [];
   }
 
   /**
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/party/tick.train.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff c710cb6 -- src test   # must print nothing
npx prettier --check src/domain/party/tick.train.test.ts src/domain/party/tick.ts src/services/party-scheduler.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/domain/party/tick.train.test.ts src/domain/party/tick.ts src/services/party-scheduler.ts
git commit -m "The clock for a train, and whom its archive warning is meant for" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,356 unit tests.

---

### Task 5: What a train shows: its post, the button that opens its panel, the region list

**Files:**
- Create: `src/render/train-panel.ts`, `src/render/train-post.test.ts`, `src/render/train-post.ts`
- Modify: `src/components/party.test.ts`, `src/components/party.ts`, `src/render/activity.test.ts`, `src/render/party-controls.ts`, `src/render/raid-post.ts`, `src/render/summary.test.ts`, `src/render/summary.ts`, `src/services/party-service.ts`

**Interfaces:**
- Consumes: `render/party-post.ts`, `timed-post.ts`, `raid-post.ts` (the boss block and the gym's notes), `party-controls.ts`, `summary.ts`, `PartyService`'s rendering, the party controls' handler.
- Produces: `renderTrainPost(view: TrainPostView)`, `TrainPlaces`, `trainTitle`, `trainTags`, `stopLink`, `routeLines`, `fitRoute` (`train-post.ts`); `trainPanel`, `whereText`, `movementText`, `Movement` (`train-panel.ts`); `bossFacts`, `gymNotes`, `gymName` shared from `raid-post.ts`; `partyButton`, `MOVE_TRAIN_LABEL` and the actions `move`, `next`, `previous`, `skip`, `finish` in `party-controls.ts`; `ListedTrain`, `TRAINS_HEADING` and a section for trains in `renderSummary`; `PartyService` rendering a train.

The five movement actions answer as stale in the controls' handler until Task 9 gives them their handler. Raid and meetup posts and the summary without trains are byte for byte what they were (their tests are unchanged).

Reference commit of the prototype for this task: `20c7dd8`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/components/party.test.ts`:

```diff
--- a/src/components/party.test.ts
+++ b/src/components/party.test.ts
@@ -191,7 +191,9 @@ describe('the buttons of a party post', () => {
     // The party has left the store, and a control names it by its id alone: what kind it was
     // is no longer known, unless only a raid has such a control.
     expect(click.reply).toHaveBeenCalledWith(privately('This has ended.'));
-    for (const action of ['done', 'group:A', 'answer:yes']) {
+    // A group button is no longer among them: a train has groups too.
+    expect((await made.click('group:A')).reply).toHaveBeenCalledWith(privately('This has ended.'));
+    for (const action of ['done', 'answer:yes']) {
       const raidOnly = await made.click(action);
       expect(raidOnly.reply).toHaveBeenCalledWith(privately('This raid is over.'));
     }
```

Apply to `src/render/activity.test.ts`:

```diff
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -163,4 +163,14 @@ describe('archiveWarning', () => {
         'A time set with `/meet` or `/end` keeps it open.',
     );
   });
+
+  it('says the same of a train, in its own word', () => {
+    expect(archiveWarning({ type: 'train', endTime: WHEN - 3_900_000 }, WHEN)).toBe(
+      `This train is over. ${archive}`,
+    );
+    expect(archiveWarning({ type: 'train', endTime: null }, WHEN)).toBe(
+      `This train has no end time, so I take it to be over. ${archive} ` +
+        'A time set with `/meet` or `/end` keeps it open.',
+    );
+  });
 });
```

Apply to `src/render/summary.test.ts`:

```diff
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -7,12 +7,19 @@ import {
   testMeetup,
   testRaid,
   testRaidRules,
+  testTrain,
   withAttendees,
 } from '../../test/support/parties.js';
-import type { MeetupParty, RaidParty } from '../domain/party/party.js';
+import type { MeetupParty, RaidParty, TrainParty } from '../domain/party/party.js';
 import { setEndTime, setHatchTime } from '../domain/party/raid.js';
 import { endParty } from '../domain/party/party.js';
-import { renderRegionLink, renderSummary, type ListedMeetup, type ListedRaid } from './summary.js';
+import {
+  renderRegionLink,
+  renderSummary,
+  type ListedMeetup,
+  type ListedRaid,
+  type ListedTrain,
+} from './summary.js';
 
 const rules = testRaidRules();
 const ID = (n: number): string => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
@@ -249,3 +256,113 @@ describe('renderRegionLink for a meetup', () => {
     );
   });
 });
+
+describe('renderSummary with trains', () => {
+  const HOUR = 60 * MINUTE;
+  const stamp = (time: number) => `<t:${time / 1000}:R>`;
+  let posts = 0;
+
+  /** A train for the list, with a post, made `order` minutes after `PARTY_NOW`. */
+  function train(
+    order: number,
+    details: Partial<TrainParty['train']> = {},
+    times: { start?: number; end?: number } = {},
+    at?: string,
+  ): ListedTrain {
+    const made = testTrain({ id: ID(70 + order), now: PARTY_NOW + order * MINUTE });
+    const party: TrainParty = {
+      ...made,
+      forumPostId: `3000000000000003${String(posts++).padStart(2, '0')}`,
+      endTime: times.end ?? null,
+      timed: { ...made.timed, startTime: times.start ?? null },
+      train: { ...made.train, ...details },
+    };
+    return { party, title: `Train · ${party.timed.name}`, at };
+  }
+  const link = (listed: ListedTrain) => `<#${listed.party.forumPostId ?? ''}>`;
+
+  it('lists them under the raids and above the meetups, each under its heading', () => {
+    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
+    const rolling = train(1, { route: [4, 1], stop: 1 }, { start: PARTY_NOW + HOUR }, 'The Stacks');
+    const picnic = { party: testMeetup(), title: 'Meetup · Community Day picnic' };
+    expect(renderSummary([raid], PARTY_NOW, [picnic], [rolling]).split('\n')).toEqual([
+      '<#300000000000000001> · no time set · 1 trainer',
+      '',
+      '**Trains**',
+      `${link(rolling)} · at The Stacks · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
+      '',
+      '**Meetups**',
+      '**Meetup · Community Day picnic** · no time set · 1 trainer',
+    ]);
+    expect(renderSummary([], PARTY_NOW, [], [rolling]).split('\n').slice(0, 3)).toEqual([
+      'No raids right now. Report one with `/raid`.',
+      '',
+      '**Trains**',
+    ]);
+  });
+
+  it('is the list it always was for a region without trains', () => {
+    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg', '300000000000000001');
+    const picnic = { party: testMeetup(), title: 'Meetup · Community Day picnic' };
+    expect(renderSummary([raid], PARTY_NOW, [picnic], []).split('\n')).toEqual([
+      '<#300000000000000001> · no time set · 1 trainer',
+      '',
+      '**Meetups**',
+      '**Meetup · Community Day picnic** · no time set · 1 trainer',
+    ]);
+  });
+
+  it('says where each train is: at a gym, without a route yet, or through with it', () => {
+    const none = train(1);
+    const going = train(2, { route: [4, 1], stop: 0 }, { end: PARTY_NOW + HOUR }, '**Bridge**');
+    const finished = train(3, { route: [4, 1], stop: 2 }, { start: PARTY_NOW - HOUR });
+    const gone = train(4, { route: [999], stop: 0 });
+    const lines = renderSummary([], PARTY_NOW, [], [none, going, finished, gone]).split('\n');
+    expect(lines.slice(3)).toEqual([
+      // By their start, then those without one as they were made.
+      `${link(finished)} · route finished · started ${stamp(PARTY_NOW - HOUR)} · 1 trainer`,
+      `${link(none)} · no route yet · no time set · 1 trainer`,
+      // The name of a gym is made plain.
+      `${link(going)} · at \\*\\*Bridge\\*\\* · ends ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
+      `${link(gone)} · at Unknown gym · no time set · 1 trainer`,
+    ]);
+  });
+
+  it('leaves out a train whose end has passed or that has ended, and names one without a post', () => {
+    const over = train(1, {}, { end: PARTY_NOW - MINUTE });
+    const ended = { ...train(2), party: endParty(train(2).party) };
+    expect(renderSummary([], PARTY_NOW, [], [over, ended])).toBe(
+      'No raids right now. Report one with `/raid`.',
+    );
+    const fresh = { party: testTrain({ name: '_Night_ train' }), title: 'Train · _Night_ train' };
+    expect(renderSummary([], PARTY_NOW, [], [fresh]).split('\n')[3]).toBe(
+      '**Train · \\_Night\\_ train** · no route yet · no time set · 1 trainer',
+    );
+  });
+
+  it('stays one message with many raids, trains and meetups, and counts what it left out of each', () => {
+    const raids = Array.from({ length: 60 }, (_unused, n) =>
+      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000002${String(n).padStart(2, '0')}`),
+    );
+    const trains = Array.from({ length: 40 }, (_unused, n) => train(n, { route: [4] }, {}, 'Gym'));
+    const meetups = Array.from({ length: 40 }, (_unused, n) => ({
+      party: {
+        ...testMeetup({ id: ID(n), now: PARTY_NOW + n }),
+        forumPostId: `3000000000000004${String(n).padStart(2, '0')}`,
+      },
+      title: 'Meetup',
+    }));
+    const text = renderSummary(raids, PARTY_NOW, meetups, trains);
+    expect(text.length).toBeLessThanOrEqual(2000);
+    expect(text.length).toBeGreaterThan(1850);
+    const lines = text.split('\n');
+    const [trainsAt, meetupsAt] = [lines.indexOf('**Trains**'), lines.indexOf('**Meetups**')];
+    expect(lines[trainsAt - 2]).toMatch(/^…and \d+ more$/);
+    expect(lines[meetupsAt - 2]).toMatch(/^…and \d+ more$/);
+    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
+    // Each of the three has a fair part of the message.
+    expect(trainsAt - 2).toBeGreaterThan(8);
+    expect(meetupsAt - trainsAt - 3).toBeGreaterThan(5);
+    expect(lines.length - meetupsAt - 2).toBeGreaterThan(5);
+  });
+});
```

Create `src/render/train-post.test.ts`:

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
  testTrain,
  withAttendees,
} from '../../test/support/parties.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import { decodeCustomId } from '../discord/custom-id.js';
import {
  endParty,
  MAX_ROUTE_STOPS,
  type TrainDetails,
  type TrainParty,
} from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { partyControls } from './party-controls.js';
import { KEPT_OPEN } from './party-post.js';
import { shownBoss, type PostGym } from './raid-post.js';
import { LIMITS } from './text.js';
import { movementText, trainPanel, whereText } from './train-panel.js';
import {
  fitRoute,
  renderTrainPost,
  routeLines,
  stopLink,
  trainTags,
  trainTitle,
  type TrainPostView,
} from './train-post.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const ARCHIVING = { graceMinutes: 5, warningMinutes: 60 };
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const catalogue = catalogueFixture();

const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
const gym = (id: number): PostGym | undefined => gyms.get(id);
const maps = (id: number): string => {
  const found = gyms.get(id);
  return `https://www.google.com/maps/search/?api=1&query=${found?.lat}%2C${found?.lon}`;
};

/** The test train on this route, at the stop with this index. */
function onRoute(route: number[], stop = 0, more: Partial<TrainDetails> = {}): TrainParty {
  const train = testTrain();
  return { ...train, train: { ...train.train, route, stop, ...more } };
}

function view(party: TrainParty, extra: Partial<TrainPostView> = {}): TrainPostView {
  return {
    party,
    now: PARTY_NOW,
    zone: PARTY_ZONE,
    archiving: ARCHIVING,
    emoji,
    gym,
    boss: shownBoss(party, catalogue, raidBossesFixture().bosses()),
    catalogue,
    ...extra,
  };
}

const lines = (party: TrainParty, extra: Partial<TrainPostView> = {}): string[] =>
  renderTrainPost(view(party, extra)).embed.description?.split('\n') ?? [];

function field(embed: APIEmbed, name: RegExp) {
  return embed.fields?.find((f) => name.test(f.name));
}

describe('trainTitle and trainTags', () => {
  it('titles the post with what it is and its name, within what a title takes', () => {
    expect(trainTitle(testTrain())).toBe('Train · Saturday legendaries');
    const long = trainTitle(testTrain({ name: 'x'.repeat(80) }));
    expect(long.length).toBeLessThanOrEqual(LIMITS.title);
  });

  it('tags it as a train, and as ended once its end time has passed or the party has ended', () => {
    const train = { ...testTrain(), endTime: END };
    expect(trainTags(train, PARTY_NOW)).toEqual(['Train']);
    expect(trainTags(train, END)).toEqual(['Train', 'Ended']);
    expect(trainTags(endParty(testTrain()), PARTY_NOW)).toEqual(['Train', 'Ended']);
    // Not because its route is finished.
    expect(trainTags(onRoute([4, 1], 2), PARTY_NOW)).toEqual(['Train']);
  });
});

describe('renderTrainPost', () => {
  it('shows a new train: what it is, that it has no time and no route, and who made it', () => {
    const post = renderTrainPost(view(testTrain()));
    expect(post.title).toBe('Train · Saturday legendaries');
    expect(post.tags).toEqual(['Train']);
    expect(post.embed.title).toBe('Saturday legendaries');
    expect(post.embed.color).toBe(0x3498db);
    expect(post.embed.thumbnail).toBeUndefined();
    expect(post.embed.description?.split('\n')).toEqual([
      '**Raid train**',
      'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
        `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`,
      `Created by <@${REPORTER}>.`,
      '',
      'No route yet: `/route add` adds a stop.',
    ]);
    expect(post.embed.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
    expect(post.message).toEqual({ embeds: [post.embed], components: partyControls(testTrain()) });
  });

  it('says its times as a meetup does, in the second line', () => {
    const train: TrainParty = {
      ...testTrain(),
      endTime: END,
      timed: { name: 'Saturday legendaries', startTime: START },
    };
    expect(lines(train)[1]).toBe(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}. Ends at ${stamp(END)}.`,
    );
    expect(lines(train, { now: END })[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
    expect(lines(endParty(testTrain()))[1]).toBe('This train is over.');
  });

  it('names the conductor when the train has one', () => {
    expect(lines(onRoute([4], 0, { conductorId: ALICE }))).toContain(`Conductor: <@${ALICE}>.`);
    expect(lines(onRoute([4])).some((line) => line.startsWith('Conductor'))).toBe(false);
  });

  it('links the stop the train is at and the one after it', () => {
    const first = lines(onRoute([4, 1, 7]));
    expect(first.slice(-2)).toEqual([
      `**Now at** [Veterans Memorial Bridge](${maps(4)})`,
      // A gym is called by its nickname when it has one.
      `**Next** [The Stacks](${maps(1)})`,
    ]);
    expect(lines(onRoute([4, 1, 7], 2)).slice(-2)).toEqual([
      '',
      `**Now at** [Harbor Lighthouse Mural](${maps(7)})`,
    ]);
  });

  it('says that the route is finished, and stays blue: only the times end a train', () => {
    const post = renderTrainPost(view(onRoute([4, 1, 7], 3)));
    expect(post.embed.description?.split('\n').at(-1)).toBe('The route is finished.');
    expect(post.embed.color).toBe(0x3498db);
    expect(post.tags).toEqual(['Train']);
    expect(field(post.embed, /^Route/)?.name).toBe('Route: 3 stops, finished');
  });

  it('lists the route: done stops struck through, the current one marked, EX gyms marked', () => {
    const exGyms = (id: number): PostGym | undefined => {
      const found = gym(id);
      return found && id === 7 ? { ...found, taggedEx: true } : found;
    };
    const post = renderTrainPost(view(onRoute([4, 1, 7, 2], 1), { gym: exGyms }));
    expect(field(post.embed, /^Route/)).toEqual({
      name: 'Route: stop 2 of 4',
      value: [
        '~~1\\. Veterans Memorial Bridge~~',
        '**2\\. The Stacks** (the train is here)',
        '3\\. Harbor Lighthouse Mural · EX gym',
        '4\\. Old Stone Fountain',
      ].join('\n'),
    });
  });

  it('names a gym that no longer exists as unknown, without a link', () => {
    const post = renderTrainPost(view(onRoute([999, 4])));
    expect(post.embed.description?.split('\n').slice(-2)).toEqual([
      '**Now at** Unknown gym',
      `**Next** [Veterans Memorial Bridge](${maps(4)})`,
    ]);
    expect(field(post.embed, /^Route/)?.value.split('\n')[0]).toBe(
      '**1\\. Unknown gym** (the train is here)',
    );
  });

  it('shows the boss the train is after as a raid shows it: name, picture, weaknesses, catch CP', () => {
    const train = onRoute([4], 0, { boss: { key: 'yveltal' } });
    const post = renderTrainPost(view(train));
    expect(post.embed.description?.split('\n')[0]).toMatch(
      /^\*\*Raid train\*\* after \*\*Yveltal\*\*/,
    );
    const boss = field(post.embed, /^Boss$/);
    expect(boss?.value).toMatch(/^\*\*Weak to\*\* /);
    expect(boss?.value).toMatch(/\*\*Catch CP\*\* \d+–\d+, boosted \d+–\d+/);
    // No moves: a train goes from raid to raid.
    expect(boss?.value).not.toMatch(/Moves/);
    const listed = raidBossesFixture()
      .bosses()
      .find((b) => b.entry?.key === 'yveltal');
    expect(post.embed.thumbnail?.url).toBe(listed?.image);
    expect(post.embed.fields?.[0]?.name).toBe('Boss');
  });

  it('names a boss the game master does not know, without a block about it', () => {
    const post = renderTrainPost(view(onRoute([4], 0, { boss: { name: 'New*mon' } })));
    expect(post.embed.description?.split('\n')[0]).toBe('**Raid train** after **New\\*mon**');
    expect(field(post.embed, /^Boss$/)).toBeUndefined();
  });

  it('says what there is to say about the gym the train is at', () => {
    const noted = (id: number): PostGym | undefined => {
      const found = gym(id);
      return found && id === 4
        ? { ...found, confirmedEx: true, notice: 'Mind the *traffic*' }
        : found;
    };
    const post = renderTrainPost(view(onRoute([4, 11]), { gym: noted }));
    expect(field(post.embed, /About this gym/)?.value).toBe(
      'This gym has hosted EX raids before.\nMind the \\*traffic\\*',
    );
    // At the next stop it is that gym's notice.
    const next = renderTrainPost(view(onRoute([4, 11], 1), { gym: noted }));
    expect(field(next.embed, /About this gym/)?.value).toBe('Park closes at dusk');
    // And nothing where the train is at no gym.
    expect(field(renderTrainPost(view(onRoute([4, 11], 2))).embed, /About/)).toBeUndefined();
    expect(field(renderTrainPost(view(onRoute([1]))).embed, /About/)).toBeUndefined();
  });

  it('lists the trainers by group, as a raid does', () => {
    const train: TrainParty = {
      ...withAttendees(onRoute([4]), {
        [ALICE]: { status: PartyStatus.Present, group: 'B', number: 2 },
        [BOB]: { status: PartyStatus.Coming, group: 'B', remote: true },
      }),
      groups: [{ id: 'A' }, { id: 'B', label: 'by car' }],
      defaultGroupId: 'B',
    };
    const post = renderTrainPost(view(train));
    expect(field(post.embed, /^Group A/)).toEqual({
      name: 'Group A (1)',
      value: `**Interested** <@${REPORTER}>`,
    });
    expect(field(post.embed, /^Group B/)).toEqual({
      name: 'Group B: by car (3)',
      value: `**Here** <@${ALICE}> +1\n**Coming** <@${BOB}> 🛰️`,
    });
  });

  it('shows a train that staff closed, or that was kept, as a meetup is shown', () => {
    const closed = renderTrainPost(
      view(endParty(onRoute([4])), { closed: 'Closed by a moderator.' }),
    );
    expect(closed.embed.description?.split('\n')[1]).toBe('Closed by a moderator.');
    expect(closed.embed.color).toBe(0xe74c3c);
    expect(closed.tags).toEqual(['Train', 'Ended']);
    const kept = { ...onRoute([4]), saved: true };
    expect(lines(kept)).toContain(KEPT_OPEN);
    expect(lines(kept, { closed: 'Closed.' })).not.toContain(KEPT_OPEN);
  });

  it('makes a name plain in the embed and keeps it raw in the title of the post', () => {
    const post = renderTrainPost(view(testTrain({ name: '**Bold** train' })));
    expect(post.title).toBe('Train · **Bold** train');
    expect(post.embed.title).toBe('\\*\\*Bold\\*\\* train');
  });

  it('stays an embed Discord takes with the longest route and a crowd in five groups', () => {
    const long = (id: number): PostGym => ({
      name: `${'Long gym name '.repeat(6)}${id}`,
      nickname: null,
      lat: 40,
      lon: -80,
      notice: 'n'.repeat(2000),
      taggedEx: true,
      confirmedEx: false,
    });
    const crowd: Record<string, { group: 'A' | 'B' | 'C' | 'D' | 'E' }> = {};
    for (let n = 0; n < 400; n++) {
      crowd[`4${String(n).padStart(17, '0')}`] = {
        group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
      };
    }
    const train: TrainParty = {
      ...withAttendees(
        onRoute(
          Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1),
          30,
          { boss: { key: 'yveltal' }, conductorId: CAROL },
        ),
        crowd,
      ),
      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: 'l'.repeat(100) })),
    };
    const { embed } = renderTrainPost(view(train, { gym: long }));
    const total =
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
    for (const f of embed.fields ?? []) {
      expect(f.value.length).toBeGreaterThan(0);
      expect(f.value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
      expect(f.name.length).toBeLessThanOrEqual(LIMITS.fieldName);
    }
    // The route keeps the stops around the one the train is at.
    const route = field(embed, /^Route/)?.value.split('\n') ?? [];
    expect(route[0]).toBe('…29 earlier stops');
    expect(route[1]).toMatch(/^~~30\\\. /);
    expect(route[2]).toMatch(/^\*\*31\\\. .*\(the train is here\)$/);
    expect(route.at(-1)).toMatch(/^…and \d+ more$/);
  });
});

describe('routeLines and fitRoute', () => {
  it('links every stop when asked to: with the address in brackets for a message', () => {
    const train = onRoute([4, 1], 1);
    expect(routeLines({ party: train, gym }, { links: true })).toEqual([
      `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
      `**2\\. [The Stacks](<${maps(1)}>)** (the train is here)`,
    ]);
    expect(routeLines({ party: train, gym }, { links: true, bare: true })[0]).toBe(
      `~~1\\. [Veterans Memorial Bridge](${maps(4)})~~`,
    );
    expect(routeLines({ party: testTrain(), gym })).toEqual([]);
  });

  it('makes a name plain, so that it cannot break the link it stands in', () => {
    const odd: PostGym = { ...(gym(4) as PostGym), name: 'A](http://x) *gym*', nickname: null };
    expect(stopLink(odd, true)).toBe(`[A\\]\\(http://x) \\*gym\\*](${maps(4)})`);
    // A bracket is escaped unless it is already: an even run of backslashes before it escapes
    // only itself.
    const slashed = (name: string) =>
      stopLink({ ...odd, name }, true).slice(1, -`](${maps(4)})`.length);
    expect(slashed('Mural ] end')).toBe('Mural \\] end');
    expect(slashed('Mural [x] end')).toBe('Mural \\[x\\] end');
    for (const name of ['Mural \\] end', 'Mural \\\\] end', 'a \\\\\\] b']) {
      // Whatever `plain` made of the backslashes, the bracket never ends the text of the link.
      expect(slashed(name)).toMatch(/^(?:[^\\\]]|\\.)*$/);
    }
  });

  it('gives a whole route when it fits, and otherwise the stops around the current one', () => {
    const all = Array.from({ length: 10 }, (_, index) => `${index + 1}. ${'x'.repeat(20)}`);
    expect(fitRoute(all, 3, 1000)).toBe(all.join('\n'));
    const cut = fitRoute(all, 5, 100).split('\n');
    expect(cut[0]).toBe('…4 earlier stops');
    expect(cut[1]).toBe(all[4]);
    expect(cut[2]).toBe(all[5]);
    expect(cut.at(-1)).toMatch(/^…and \d more$/);
    expect(cut.join('\n').length).toBeLessThanOrEqual(100);
    // At the start nothing is left out before it; once finished the last stops are shown.
    expect(fitRoute(all, 0, 100).split('\n')[0]).toBe(all[0]);
    expect(fitRoute(all, 10, 100).split('\n').slice(0, 2)).toEqual(['…8 earlier stops', all[8]]);
  });
});

describe('the controls of a train post', () => {
  const rows = (party: TrainParty) =>
    partyControls(party).map((row) =>
      row.components.map((component) => [
        'label' in component ? component.label : undefined,
        'custom_id' in component ? decodeCustomId(component.custom_id)?.action : undefined,
        'style' in component ? component.style : undefined,
      ]),
    );

  it('are those of a meetup, with one grey button in a last row that opens the panel', () => {
    const train = testTrain();
    expect(rows(train).map((row) => row.map(([label, action]) => [label, action]))).toEqual([
      [
        ['Interested', 'maybe'],
        ['Join', 'join'],
        ['Here', 'here'],
        ['Leave', 'leave'],
      ],
      [
        ['−1', 'less'],
        ['+1', 'more'],
        ['Remote / in person', 'remote'],
      ],
      [['Move train…', 'move']],
    ]);
    // Secondary: grey.
    expect(rows(train).at(-1)?.[0]?.[2]).toBe(2);
    const move = partyControls(train).at(-1)?.components[0];
    expect(move && 'custom_id' in move && decodeCustomId(move.custom_id)).toEqual({
      kind: 'party',
      id: train.id,
      action: 'move',
      args: [],
    });
  });

  it('have a row of groups between them once there are several, and the move button last', () => {
    const train: TrainParty = { ...testTrain(), groups: [{ id: 'A' }, { id: 'B' }] };
    const shown = rows(train);
    expect(shown).toHaveLength(4);
    expect(shown[2]?.map(([label, action]) => [label, action])).toEqual([
      ['Group A (1)', 'group'],
      ['Group B (0)', 'group'],
    ]);
    expect(shown[3]?.map(([, action]) => action)).toEqual(['move']);
  });

  it('are the same wherever the train is and whoever leads it', () => {
    const base = partyControls(onRoute([4, 1]));
    expect(partyControls(onRoute([4, 1], 2, { conductorId: ALICE }))).toEqual(base);
    expect(partyControls(testTrain())).toEqual(base);
  });
});

describe('trainPanel', () => {
  const buttons = (party: TrainParty) =>
    trainPanel({ party, gym }).components[0]?.components.map((button) => [
      button.label,
      decodeCustomId(button.custom_id)?.action,
      button.disabled ?? false,
    ]);

  it('says where the train is and what comes next, with the four moves', () => {
    const train = onRoute([4, 1, 7], 0);
    const panel = trainPanel({ party: train, gym });
    expect(panel.content).toBe(
      `The train is at stop 1 of 3: [Veterans Memorial Bridge](<${maps(4)}>). ` +
        `Next is [The Stacks](<${maps(1)}>).`,
    );
    expect(buttons(train)).toEqual([
      ['Next', 'next', false],
      // At the first stop there is none before it.
      ['Previous', 'previous', true],
      ['Skip', 'skip', false],
      ['Finish', 'finish', false],
    ]);
    for (const button of panel.components[0]?.components ?? []) {
      expect(decodeCustomId(button.custom_id)).toMatchObject({ kind: 'party', id: train.id });
    }
    const drawnAt = (party: TrainParty) =>
      trainPanel({ party, gym }).components[0]?.components.map(
        (button) => decodeCustomId(button.custom_id)?.args,
      );
    // Each button says where the train was when the panel was drawn: the gym of its stop. Next
    // and Skip also say where they lead: the gym of that stop, or the end of the route.
    expect(drawnAt(train)).toEqual([['4', '1'], ['4'], ['4', '7'], ['4']]);
    expect(drawnAt(onRoute([9, 4, 1], 1))).toEqual([['4', '1'], ['4'], ['4', 'end'], ['4']]);
    expect(drawnAt(onRoute([4, 1, 7], 2))).toEqual([['7', 'end'], ['7'], ['7', 'end'], ['7']]);
    expect(drawnAt(onRoute([4, 1, 7], 3))).toEqual([
      ['end', 'end'],
      ['end'],
      ['end', 'end'],
      ['end'],
    ]);
  });

  it('switches off what cannot be done from where the train is', () => {
    const disabled = (party: TrainParty) =>
      (buttons(party) ?? []).filter(([, , off]) => off).map(([, action]) => action);
    expect(disabled(onRoute([4, 1, 7], 1))).toEqual(['skip']);
    expect(disabled(onRoute([4, 1, 7, 2], 1))).toEqual([]);
    expect(disabled(onRoute([4, 1, 7], 2))).toEqual(['skip']);
    expect(disabled(onRoute([4, 1, 7], 3))).toEqual(['next', 'skip', 'finish']);
    expect(disabled(testTrain())).toEqual(['next', 'previous', 'skip', 'finish']);
  });

  it('says the last stop, a finished route and a train without a route', () => {
    expect(whereText({ party: onRoute([4, 1], 1), gym })).toBe(
      `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). It is the last stop.`,
    );
    expect(whereText({ party: onRoute([4, 1], 2), gym })).toBe(
      'The train has finished its route of 2 stops.',
    );
    expect(whereText({ party: testTrain(), gym })).toBe(
      'This train has no route yet. Add its stops with `/route add`.',
    );
  });
});

describe('movementText', () => {
  it('says where the train is going, with the link to the place, and who moved it', () => {
    expect(movementText({ kind: 'to', at: gym(1), by: ALICE })).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
    expect(movementText({ kind: 'back', at: gym(4), by: ALICE })).toBe(
      `The train is moving back to [Veterans Memorial Bridge](<${maps(4)}>). Moved by <@${ALICE}>.`,
    );
    expect(movementText({ kind: 'skip', at: gym(7), skipped: gym(1), by: BOB })).toBe(
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>), skipping **The Stacks**. ` +
        `Moved by <@${BOB}>.`,
    );
    expect(movementText({ kind: 'finished', by: BOB })).toBe(
      `The train has finished its route. Moved by <@${BOB}>.`,
    );
    expect(movementText({ kind: 'to', at: undefined, by: BOB })).toBe(
      `The train is moving to Unknown gym. Moved by <@${BOB}>.`,
    );
  });
});
```

Run: `npx vitest run --project unit src/components/party.test.ts src/render/activity.test.ts src/render/summary.test.ts src/render/train-post.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/components/party.ts`:

```diff
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -134,6 +134,13 @@ export const partyButtons: ComponentHandler = {
       case 'delete':
         // Only the form of `/delete` has this action.
         throw new UserError(STALE_COMPONENT);
+      case 'move':
+      case 'next':
+      case 'previous':
+      case 'skip':
+      case 'finish':
+        // The controls that move a train are handled from the step that brings `/next`.
+        throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
```

Apply to `src/render/party-controls.ts`:

```diff
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -11,6 +11,7 @@ import { encodeCustomId } from '../discord/custom-id.js';
 import {
   headCount,
   isRaid,
+  isTrain,
   partyWord,
   remoteAllowed,
   type Party,
@@ -25,7 +26,9 @@ export const PARTY_KIND = 'party';
  * What a control of a post does: the action part of its custom id. `group` carries the group's
  * letter as its argument, `answer` carries `yes` or `no` (the completion question). `time` is
  * the "Set time" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
- * form of `/delete` for members who are not staff; no button has it.
+ * form of `/delete` for members who are not staff; no button has it. `move` is the button
+ * "Move train…" of a train's post, which opens the panel whose buttons are `next`, `previous`,
+ * `skip` and `finish` (`train-panel.ts`).
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -40,6 +43,11 @@ export const PARTY_ACTIONS = [
   'answer',
   'time',
   'delete',
+  'move',
+  'next',
+  'previous',
+  'skip',
+  'finish',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -47,8 +55,11 @@ export function isPartyAction(value: string): value is PartyAction {
   return (PARTY_ACTIONS as readonly string[]).includes(value);
 }
 
-/** The actions that only the controls of a raid have: no other post shows them. */
-const RAID_ACTIONS: readonly PartyAction[] = ['done', 'group', 'answer', 'time'];
+/**
+ * The actions that only the controls of a raid have: no other post shows them. A group button
+ * is not among them: a train has groups too.
+ */
+const RAID_ACTIONS: readonly PartyAction[] = ['done', 'answer', 'time'];
 
 /** Whether a control with this action can only have been a raid's. */
 export function isRaidAction(value: string): boolean {
@@ -62,7 +73,7 @@ const QUESTION_NAMES = 1_700;
 
 type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
 
-function button(
+export function partyButton(
   partyId: string,
   action: PartyAction,
   label: string,
@@ -94,7 +105,9 @@ function groupLabel(party: Party, group: PartyGroup): string {
  *
  * A meetup has no Done: there is nothing to complete in it, done would only mean leave, and
  * Leave is there. It has no "Set time" either (its times are `/meet` and `/end`), and never a
- * row of groups.
+ * row of groups. A train is like a meetup in the first two, has its groups like a raid, and a
+ * last row of its own: "Move train…", which opens the panel that moves it along its route. It is
+ * always there, whoever looks: who may not move the train is told so when they press it.
  */
 export function partyControls(party: Party): Row[] {
   const { id } = party;
@@ -102,24 +115,24 @@ export function partyControls(party: Party): Row[] {
     {
       type: ComponentType.ActionRow,
       components: [
-        button(id, 'maybe', 'Interested', ButtonStyle.Secondary),
-        button(id, 'join', 'Join', ButtonStyle.Primary),
-        button(id, 'here', 'Here', ButtonStyle.Success),
-        ...(isRaid(party) ? [button(id, 'done', 'Done', ButtonStyle.Secondary)] : []),
-        button(id, 'leave', 'Leave', ButtonStyle.Danger),
+        partyButton(id, 'maybe', 'Interested', ButtonStyle.Secondary),
+        partyButton(id, 'join', 'Join', ButtonStyle.Primary),
+        partyButton(id, 'here', 'Here', ButtonStyle.Success),
+        ...(isRaid(party) ? [partyButton(id, 'done', 'Done', ButtonStyle.Secondary)] : []),
+        partyButton(id, 'leave', 'Leave', ButtonStyle.Danger),
       ],
     },
     {
       type: ComponentType.ActionRow,
       components: [
-        button(id, 'less', '−1', ButtonStyle.Secondary),
-        button(id, 'more', '+1', ButtonStyle.Secondary),
+        partyButton(id, 'less', '−1', ButtonStyle.Secondary),
+        partyButton(id, 'more', '+1', ButtonStyle.Secondary),
         ...(remoteAllowed(party)
-          ? [button(id, 'remote', 'Remote / in person', ButtonStyle.Secondary)]
+          ? [partyButton(id, 'remote', 'Remote / in person', ButtonStyle.Secondary)]
           : []),
         // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
         ...(isRaid(party) && party.hatchTime === null
-          ? [button(id, 'time', 'Set time', ButtonStyle.Primary)]
+          ? [partyButton(id, 'time', 'Set time', ButtonStyle.Primary)]
           : []),
       ],
     },
@@ -128,13 +141,22 @@ export function partyControls(party: Party): Row[] {
     rows.push({
       type: ComponentType.ActionRow,
       components: party.groups.map((group) =>
-        button(id, 'group', groupLabel(party, group), ButtonStyle.Secondary, [group.id]),
+        partyButton(id, 'group', groupLabel(party, group), ButtonStyle.Secondary, [group.id]),
       ),
     });
   }
+  if (isTrain(party)) {
+    rows.push({
+      type: ComponentType.ActionRow,
+      components: [partyButton(id, 'move', MOVE_TRAIN_LABEL, ButtonStyle.Secondary)],
+    });
+  }
   return rows;
 }
 
+/** The label of the button of a train's post that opens the panel to move it. */
+export const MOVE_TRAIN_LABEL = 'Move train…';
+
 /**
  * The question to members who were present when somebody of their group completed the raid, with
  * its two answers. The members are named as mentions, as many as fit; whom it may ping is the
@@ -158,8 +180,8 @@ export function completionQuestion(
       {
         type: ComponentType.ActionRow,
         components: [
-          button(partyId, 'answer', 'Yes, done', ButtonStyle.Success, ['yes']),
-          button(partyId, 'answer', 'Not yet', ButtonStyle.Secondary, ['no']),
+          partyButton(partyId, 'answer', 'Yes, done', ButtonStyle.Success, ['yes']),
+          partyButton(partyId, 'answer', 'Not yet', ButtonStyle.Secondary, ['no']),
         ],
       },
     ],
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -1,6 +1,13 @@
 import type { APIEmbed, APIEmbedField } from 'discord.js';
 import { DateTime } from 'luxon';
-import { membersWhere, type RaidParty, type RaidStage } from '../domain/party/party.js';
+import {
+  bossOf,
+  isRaid,
+  membersWhere,
+  type Party,
+  type RaidParty,
+  type RaidStage,
+} from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
@@ -74,20 +81,23 @@ export interface RaidPostView {
 }
 
 /**
- * The boss a party's reference stands for, with what the boss list knows about it (shiny,
- * picture): the list's boss of the same Pokémon in the raid's tier, or else in any tier.
+ * The boss a party's reference stands for (`bossOf`: what a raid is against, what a train is
+ * after), with what the boss list knows about it (shiny, picture): the list's boss of the same
+ * Pokémon in the raid's tier, or else in any tier. A train has no tier: the first listed counts.
  */
 export function shownBoss(
-  party: RaidParty,
+  party: Party,
   catalogue: PokemonCatalogue,
   bosses: readonly RaidBoss[],
 ): ShownBoss | undefined {
-  const ref = party.raid.boss;
+  const ref = bossOf(party);
   if (ref === null) return undefined;
+  const inTier = (boss: RaidBoss): boolean =>
+    isRaid(party) && sameRaidTier(boss.tier, party.raid.tier);
   if ('name' in ref) {
     // A boss the game master knew only after the party was made has an entry by now.
     const named = bosses.filter((boss) => boss.name === ref.name);
-    const listed = named.find((boss) => sameRaidTier(boss.tier, party.raid.tier)) ?? named[0];
+    const listed = named.find(inTier) ?? named[0];
     return {
       name: listed?.entry?.name ?? ref.name,
       ...(listed?.entry ? { entry: listed.entry } : {}),
@@ -97,7 +107,7 @@ export function shownBoss(
   }
   const entry = catalogue.byKey(ref.key);
   const same = bosses.filter((boss) => boss.entry !== undefined && boss.entry.key === entry?.key);
-  const listed = same.find((boss) => sameRaidTier(boss.tier, party.raid.tier)) ?? same[0];
+  const listed = same.find(inTier) ?? same[0];
   return {
     name: entry?.name ?? titleCase(ref.key),
     ...(entry ? { entry } : {}),
@@ -117,7 +127,7 @@ export function shownAutoset(tier: RaidTier, autoset: RaidBoss | undefined): Sho
   };
 }
 
-function gymName(gym: PostGym | undefined): string {
+export function gymName(gym: PostGym | undefined): string {
   // `||`: a nickname that was cleared to an empty text names nothing.
   return gym ? gym.nickname || gym.name : 'Unknown gym';
 }
@@ -187,6 +197,46 @@ function describeTimes(view: RaidPostView, stage: RaidStage): string {
   return `Ended at ${timestamp(endTime, 'f')}.`;
 }
 
+/**
+ * What the game master says about a Pokémon as a raid boss, line by line: what it is weak to,
+ * and the CP it is caught with (`shadow`: as a shadow raid boss). The post of a raid and that of
+ * a train both show it.
+ */
+export function bossFacts(
+  catalogue: PokemonCatalogue,
+  entry: PokemonEntry,
+  shadow: boolean,
+): string[] {
+  const lines: string[] = [];
+  const weaknesses = catalogue
+    .weaknesses(entry)
+    .map((weakness) => `${titleCase(weakness.type)}${weakness.multiplier > 1.6 ? ' ×2' : ''}`);
+  if (weaknesses.length > 0) lines.push(`**Weak to** ${weaknesses.join(', ')}`);
+  const cp = catalogue.raidCatchCp(entry, shadow);
+  const weather = catalogue.boostedIn(entry).map(titleCase).join(', ');
+  lines.push(
+    `**Catch CP** ${cp.min}–${cp.max}, boosted ${cp.minBoosted}–${cp.maxBoosted}` +
+      (weather === '' ? '' : ` (${weather})`),
+  );
+  return lines;
+}
+
+/**
+ * What a post says about the gym it is at: that it is an EX gym (not for an EX raid, which says
+ * so itself: `exRaid`), and the notice the moderators gave the gym. Empty when there is nothing.
+ */
+export function gymNotes(gym: PostGym | undefined, exRaid = false): string[] {
+  const notes: string[] = [];
+  if (gym && !exRaid) {
+    if (gym.confirmedEx) notes.push('This gym has hosted EX raids before.');
+    else if (gym.taggedEx) notes.push('This gym has the EX gym tag.');
+  }
+  // A notice of nothing but white space is empty once plain; Discord refuses an empty field value.
+  const notice = gym?.notice ? plain(gym.notice) : '';
+  if (notice !== '') notes.push(notice);
+  return notes;
+}
+
 /**
  * What is known of a boss, under `title`. `unknownMoves` says whether the moves line is shown
  * while no move is known; the boss an egg will hatch as (not the raid's own) has no moves line.
@@ -200,17 +250,7 @@ function bossField(
   const { catalogue, party } = view;
   const { entry } = boss;
   if (!entry) return undefined;
-  const lines: string[] = [];
-  const weaknesses = catalogue
-    .weaknesses(entry)
-    .map((weakness) => `${titleCase(weakness.type)}${weakness.multiplier > 1.6 ? ' ×2' : ''}`);
-  if (weaknesses.length > 0) lines.push(`**Weak to** ${weaknesses.join(', ')}`);
-  const cp = catalogue.raidCatchCp(entry, party.raid.tier.shadow);
-  const weather = catalogue.boostedIn(entry).map(titleCase).join(', ');
-  lines.push(
-    `**Catch CP** ${cp.min}–${cp.max}, boosted ${cp.minBoosted}–${cp.maxBoosted}` +
-      (weather === '' ? '' : ` (${weather})`),
-  );
+  const lines = bossFacts(catalogue, entry, party.raid.tier.shadow);
   const { fastMove, chargedMove } = party.raid;
   if (boss === view.boss && (unknownMoves || fastMove !== null || chargedMove !== null)) {
     const name = (id: string | null): string => (id && catalogue.move(id)?.name) ?? '????';
@@ -285,14 +325,7 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
     fields.push({ field: done, shrink: (limit) => doneField(view, limit) ?? done, rank: 2 });
   }
 
-  const location: string[] = [];
-  if (gym && party.raid.tier.level !== 'EX') {
-    if (gym.confirmedEx) location.push('This gym has hosted EX raids before.');
-    else if (gym.taggedEx) location.push('This gym has the EX gym tag.');
-  }
-  // A notice of nothing but white space is empty once plain; Discord refuses an empty field value.
-  const notice = gym?.notice ? plain(gym.notice) : '';
-  if (notice !== '') location.push(notice);
+  const location = gymNotes(gym, party.raid.tier.level === 'EX');
   if (location.length > 0) {
     fields.push({
       field: {
```

Apply to `src/render/summary.ts`:

```diff
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -3,9 +3,12 @@ import {
   type MeetupParty,
   type PartyType,
   type RaidParty,
+  type TimedParty,
+  type TrainParty,
 } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { startTimeOf, timedOver } from '../domain/party/timed.js';
+import { routeFinished } from '../domain/party/train.js';
 import { trainerCount } from './party-post.js';
 import { LIMITS, plain, timestamp } from './text.js';
 
@@ -45,19 +48,59 @@ export interface ListedMeetup {
 /** The heading of the meetups in a region's list, under its raids. */
 export const MEETUPS_HEADING = '**Meetups**';
 /**
- * The room the meetups of a list are sure of, whatever the raids need: the raids are fitted
- * into the rest of the message first, and the meetups then have all that the raids left.
+ * The room the trains and the meetups of a list are each sure of, whatever stands above them:
+ * the raids are fitted into the rest of the message first, and each section then has all that
+ * is left over what the sections after it are sure of.
  */
-const MEETUPS_ROOM = 600;
+const SECTION_ROOM = 600;
 
-function meetupLine({ party, title }: ListedMeetup, now: number): string {
-  const post = party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
+/** When a timed party starts or ends, whichever is said of it now. */
+function timedWhen(party: TimedParty, now: number): string {
   const start = startTimeOf(party);
-  let when = 'no time set';
-  if (start !== null && now < start) when = `starts ${timestamp(start, 'R')}`;
-  else if (party.endTime !== null) when = `ends ${timestamp(party.endTime, 'R')}`;
-  else if (start !== null) when = `started ${timestamp(start, 'R')}`;
-  return `${post} · ${when} · ${trainerCount(party)}`;
+  if (start !== null && now < start) return `starts ${timestamp(start, 'R')}`;
+  if (party.endTime !== null) return `ends ${timestamp(party.endTime, 'R')}`;
+  return start === null ? 'no time set' : `started ${timestamp(start, 'R')}`;
+}
+
+function postOf(party: TimedParty, title: string): string {
+  return party.forumPostId === null ? `**${plain(title)}**` : `<#${party.forumPostId}>`;
+}
+
+function meetupLine({ party, title }: ListedMeetup, now: number): string {
+  return `${postOf(party, title)} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
+}
+
+/** A train for a list: the party, the title its post has, and the name of the gym it is at. */
+export interface ListedTrain {
+  party: TrainParty;
+  title: string;
+  /** The name of its current stop, as the gym has it; undefined when it is at none. */
+  at?: string | undefined;
+}
+
+/** The heading of the trains in a region's list, under its raids and above its meetups. */
+export const TRAINS_HEADING = '**Trains**';
+
+/** Where a train is: at a gym, before its route, or through with it. */
+function trainLine({ party, title, at }: ListedTrain, now: number): string {
+  const where =
+    party.train.route.length === 0
+      ? 'no route yet'
+      : routeFinished(party)
+        ? 'route finished'
+        : `at ${plain(at ?? 'Unknown gym')}`;
+  return `${postOf(party, title)} · ${where} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
+}
+
+/** The timed parties of a list that are not over, by their start, then as they were made. */
+function planned<L extends { party: TimedParty }>(listed: readonly L[], now: number): L[] {
+  return listed
+    .filter(({ party }) => party.status === 'active' && !timedOver(party, now))
+    .sort(
+      (a, b) =>
+        (startTimeOf(a.party) ?? Infinity) - (startTimeOf(b.party) ?? Infinity) ||
+        a.party.createdAt - b.party.createdAt,
+    );
 }
 
 /**
@@ -88,41 +131,49 @@ function fitLines(texts: readonly string[], limit: number): string[] {
  * end first. A raid that has ended but whose post is still open is left out. What does not fit
  * into one message is counted in a last line.
  *
- * The region's meetups follow under a heading of their own, when there are any: those that are
- * not over, by their start, then those without one in the order they were made. A region
- * without meetups has the list it always had.
+ * The region's trains and then its meetups follow, each under a heading of their own, when
+ * there are any: those that are not over, by their start, then those without one in the order
+ * they were made. A region without either has the list it always had. Each of the two is sure
+ * of some room whatever stands above it (`SECTION_ROOM`), and has all that is left.
  */
 export function renderSummary(
   raids: readonly ListedRaid[],
   now: number,
   meetups: readonly ListedMeetup[] = [],
+  trains: readonly ListedTrain[] = [],
 ): string {
   const going = raids
     .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
     .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
-  const planned = meetups
-    .filter(({ party }) => party.status === 'active' && !timedOver(party, now))
-    .sort(
-      (a, b) =>
-        (startTimeOf(a.party) ?? Infinity) - (startTimeOf(b.party) ?? Infinity) ||
-        a.party.createdAt - b.party.createdAt,
-    );
   const size = (texts: readonly string[]): number =>
     texts.reduce((sum, text) => sum + text.length + 1, 0);
-  const meetupLines = planned.map((meetup) => meetupLine(meetup, now));
-  // The empty line and the heading above the meetups, each with its line break.
-  const heading = planned.length === 0 ? 0 : MEETUPS_HEADING.length + 2;
-  const wanted = planned.length === 0 ? 0 : heading + size(meetupLines);
-  const above =
+  const sections = [
+    { heading: TRAINS_HEADING, lines: planned(trains, now).map((train) => trainLine(train, now)) },
+    {
+      heading: MEETUPS_HEADING,
+      lines: planned(meetups, now).map((meetup) => meetupLine(meetup, now)),
+    },
+  ]
+    .filter((section) => section.lines.length > 0)
+    .map((section) => {
+      // The empty line and the heading above the section, each with its line break.
+      const head = section.heading.length + 2;
+      return { ...section, head, room: Math.min(head + size(section.lines), SECTION_ROOM) };
+    });
+  const reserved = (from: number): number =>
+    sections.slice(from).reduce((sum, section) => sum + section.room, 0);
+  const text =
     going.length === 0
       ? ['No raids right now. Report one with `/raid`.']
       : fitLines(
           going.map((raid) => line(raid, now)),
-          LIMITS.content - Math.min(wanted, MEETUPS_ROOM),
+          LIMITS.content - reserved(0),
         );
-  if (planned.length === 0) return above.join('\n');
-  const below = fitLines(meetupLines, LIMITS.content - size(above) - heading);
-  return [...above, '', MEETUPS_HEADING, ...below].join('\n');
+  for (const [index, section] of sections.entries()) {
+    const room = LIMITS.content - size(text) - section.head - reserved(index + 1);
+    text.push('', section.heading, ...fitLines(section.lines, room));
+  }
+  return text.join('\n');
 }
 
 /**
```

Create `src/render/train-panel.ts`:

```ts
import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
} from 'discord.js';
import {
  cannotMove,
  currentStop,
  nextStop,
  placeOf,
  routeFinished,
  targetOf,
  TRAIN_MOVES,
  type TrainMove,
} from '../domain/party/train.js';
import { partyButton } from './party-controls.js';
import { gymName, type PostGym } from './raid-post.js';
import { count, plain } from './text.js';
import { stopLink, type TrainPlaces } from './train-post.js';

const MOVE_LABELS: Readonly<Record<TrainMove, string>> = {
  next: 'Next',
  previous: 'Previous',
  skip: 'Skip',
  finish: 'Finish',
};

/**
 * Where a train is on its route and what comes next, as a member is told it: for the panel that
 * moves the train, and for the answer to a move.
 */
export function whereText(view: TrainPlaces): string {
  const { party } = view;
  const { route, stop } = party.train;
  if (route.length === 0) return 'This train has no route yet. Add its stops with `/route add`.';
  if (routeFinished(party)) {
    return `The train has finished its route of ${count(route.length, 'stop')}.`;
  }
  const [at, next] = [currentStop(party), nextStop(party)];
  const here = `The train is at stop ${stop + 1} of ${route.length}: ${stopLink(at === undefined ? undefined : view.gym(at))}.`;
  return next === undefined
    ? `${here} It is the last stop.`
    : `${here} Next is ${stopLink(view.gym(next))}.`;
}

/**
 * The panel the button "Move train…" of a train's post opens, for the member who pressed it
 * alone: where the train is and what comes next, and the four moves. A move that cannot be made
 * from where the train is has its button switched off. The buttons name the train by its id,
 * like every control of a post, and carry where the train was when the panel was drawn
 * (`placeOf`: the gym of its stop, which an edit of the route does not change while the train
 * stays there). Next and Skip also carry the stop they lead to (`targetOf`). A press decides
 * anew: on a panel that no longer shows where the train is, or whose Next would lead to another
 * stop than it says, it moves nothing, so two members who press Next on the same stop move the
 * train once.
 */
export function trainPanel(view: TrainPlaces): {
  content: string;
  components: APIActionRowComponent<APIButtonComponentWithCustomId>[];
} {
  const { party } = view;
  const place = placeOf(party);
  const styles: Readonly<Record<TrainMove, APIButtonComponentWithCustomId['style']>> = {
    next: ButtonStyle.Primary,
    previous: ButtonStyle.Secondary,
    skip: ButtonStyle.Secondary,
    finish: ButtonStyle.Secondary,
  };
  return {
    content: whereText(view),
    components: [
      {
        type: ComponentType.ActionRow,
        components: TRAIN_MOVES.map((move) => ({
          ...partyButton(party.id, move, MOVE_LABELS[move], styles[move], [
            place,
            // What the panel promises of Next and Skip ("Next is …") travels with them.
            ...(move === 'next' || move === 'skip' ? [targetOf(party, move)] : []),
          ]),
          ...(cannotMove(party, move) === undefined ? {} : { disabled: true }),
        })),
      },
    ],
  };
}

/** How a train got to where it is, for the message that tells the members. */
export interface Movement {
  /** On to a stop, back to one, on past one, or to the end of the route. */
  kind: 'to' | 'back' | 'skip' | 'finished';
  /** The gym the train is at now (not for `finished`); undefined for one that no longer exists. */
  at?: PostGym | undefined;
  /** The gym that was left out, for `skip`. */
  skipped?: PostGym | undefined;
  /** Snowflake of the member who moved the train. */
  by: string;
}

/**
 * What the post is told when the train has moved: where it is going, with the link to the
 * place, and who moved it. The mentions of the members are the caller's.
 */
export function movementText(movement: Movement): string {
  const by = `Moved by <@${movement.by}>.`;
  if (movement.kind === 'finished') return `The train has finished its route. ${by}`;
  const where = stopLink(movement.at);
  if (movement.kind === 'back') return `The train is moving back to ${where}. ${by}`;
  const skipping =
    movement.kind === 'skip' ? `, skipping **${plain(gymName(movement.skipped))}**` : '';
  return `The train is moving to ${where}${skipping}. ${by}`;
}
```

Create `src/render/train-post.ts`:

```ts
import type { APIEmbed } from 'discord.js';
import type { TrainParty } from '../domain/party/party.js';
import { nameOf } from '../domain/party/timed.js';
import { currentStop, nextStop, routeFinished } from '../domain/party/train.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import { partyControls } from './party-controls.js';
import {
  ENDED_COLOUR,
  fitEmbed,
  groupField,
  KEPT_OPEN,
  tidyTitle,
  type ForumTag,
  type RenderedPost,
  type ShrinkableField,
} from './party-post.js';
import {
  bossFacts,
  gymMapsUrl,
  gymName,
  gymNotes,
  type PostGym,
  type ShownBoss,
} from './raid-post.js';
import { count, fitItems, LIMITS, plain, truncate } from './text.js';
import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';

/** A train and the gyms of its route, for everything that shows where it is. */
export interface TrainPlaces {
  party: TrainParty;
  /** The gym with this id; undefined for one that no longer exists. */
  gym: (id: number) => PostGym | undefined;
}

/** What the post of a train is rendered from. */
export interface TrainPostView extends TimedPostView<TrainParty>, TrainPlaces {
  /** The Pokémon the train is after, resolved (`shownBoss`); undefined while nobody said. */
  boss: ShownBoss | undefined;
  catalogue: PokemonCatalogue;
}

/** `Train · Saturday legendaries`: the title of the post, which is also how lists name it. */
export function trainTitle(party: TrainParty): string {
  return tidyTitle(truncate(tidyTitle(`Train · ${nameOf(party)}`), LIMITS.title));
}

/** What it is, and that it has ended once it is over. */
export function trainTags(party: TrainParty, now: number): ForumTag[] {
  return ['Train', ...(shownAsOver(party, now) ? ['Ended' as const] : [])];
}

/**
 * A gym as a link to its place in Google Maps, under its name. `bare` is for an embed, where a
 * link shows no preview; in the text of a message the address stands in angle brackets so that
 * it shows none either. A gym that no longer exists is named as unknown, without a link.
 */
export function stopLink(gym: PostGym | undefined, bare = false): string {
  if (!gym) return plain(gymName(gym));
  // A bracket in the name would end the text of the link early. One that is escaped already
  // (an odd run of backslashes stands before it) stays; after an even run the backslashes
  // escape each other, and the bracket needs one of its own.
  const name = plain(gymName(gym)).replace(
    /(\\*)([[\]])/g,
    (whole, slashes: string, bracket: string) =>
      slashes.length % 2 === 1 ? whole : `${slashes}\\${bracket}`,
  );
  return bare ? `[${name}](${gymMapsUrl(gym)})` : `[${name}](<${gymMapsUrl(gym)}>)`;
}

/**
 * The route, one line per stop, numbered from 1: a stop the train has left is struck through,
 * the one it is at stands out and says so, and an EX gym is marked. With `links`, every stop is
 * a link to its place (for a message; `bare` as for `stopLink`).
 */
export function routeLines(
  view: TrainPlaces,
  options: { links?: boolean; bare?: boolean } = {},
): string[] {
  const { route, stop } = view.party.train;
  return route.map((gymId, index) => {
    const gym = view.gym(gymId);
    const name = options.links ? stopLink(gym, options.bare) : plain(gymName(gym));
    const ex = gym && (gym.taggedEx || gym.confirmedEx) ? ' · EX gym' : '';
    // The dot is escaped: a numbered list would count anew after a line that is cut out.
    const text = `${index + 1}\\. ${name}${ex}`;
    if (index < stop) return `~~${text}~~`;
    return index === stop ? `**${text}** (the train is here)` : text;
  });
}

/**
 * The lines of a route as one text of at most `limit` characters. A route that does not fit
 * keeps the stops around the current one: the stops before the one the train just left are
 * counted in a first line, and what does not fit after them in a last one.
 */
export function fitRoute(lines: readonly string[], stop: number, limit: number): string {
  const all = lines.join('\n');
  if (all.length <= limit) return all;
  const start = Math.max(0, Math.min(stop, lines.length - 1) - 1);
  const head = start > 0 ? `…${count(start, 'earlier stop')}\n` : '';
  return head + fitItems(lines.slice(start), limit - head.length, '\n');
}

/** Where the train is and where it goes next, as the lines of the post say it. */
function whereLines(view: TrainPostView): string[] {
  const { party } = view;
  if (party.train.route.length === 0) return ['No route yet: `/route add` adds a stop.'];
  if (routeFinished(party)) return ['The route is finished.'];
  const [at, next] = [currentStop(party), nextStop(party)];
  return [
    ...(at === undefined ? [] : [`**Now at** ${stopLink(view.gym(at), true)}`]),
    ...(next === undefined ? [] : [`**Next** ${stopLink(view.gym(next), true)}`]),
  ];
}

/**
 * The forum post of a raid train: title, tags, the embed and the controls under it. Pure: the
 * same view gives the same post. It has what the post of a meetup has (its name, its times, who
 * made it, who comes) and what a train has: its conductor, where it is and where it goes next,
 * its route, the Pokémon it is after, what there is to say about the gym it is at, and its
 * groups, as in a raid. There is no map: `/where` gives it.
 */
export function renderTrainPost(view: TrainPostView): RenderedPost {
  const { party, now, boss, emoji } = view;
  const over = view.closed !== undefined || shownAsOver(party, now);
  const { route, stop, conductorId } = party.train;
  const after = boss ? ` after **${plain(boss.name)}**${boss.shiny ? ` ${emoji.shiny}` : ''}` : '';
  const description = [
    `**Raid train**${after}`,
    view.closed ?? describeTimes(view),
    ...(conductorId === null ? [] : [`Conductor: <@${conductorId}>.`]),
    // A train always names who made it.
    `Created by <@${party.createdById}>.`,
    // Not in the last showing of a train that was closed: that post is archived.
    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
    '',
    ...whereLines(view),
  ].join('\n');

  const fields: ShrinkableField[] = [];
  if (boss?.entry) {
    fields.push({
      field: {
        name: 'Boss',
        // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
        value: truncate(bossFacts(view.catalogue, boss.entry, false).join('\n'), LIMITS.fieldValue),
      },
      rank: 0,
    });
  }
  if (route.length > 0) {
    fields.push({
      field: {
        name: routeFinished(party)
          ? `Route: ${count(route.length, 'stop')}, finished`
          : `Route: stop ${stop + 1} of ${route.length}`,
        value: fitRoute(routeLines(view), stop, LIMITS.fieldValue),
      },
      rank: 0,
    });
  }
  const single = party.groups.length === 1;
  for (const group of party.groups) {
    fields.push({
      field: groupField(view, group, { single, lobby: true }),
      shrink: (limit) => groupField(view, group, { single, lobby: true, limit }),
      rank: 1,
    });
  }
  const at = currentStop(party);
  const notes = at === undefined ? [] : gymNotes(view.gym(at));
  if (notes.length > 0) {
    fields.push({
      field: { name: 'About this gym', value: truncate(notes.join('\n'), LIMITS.fieldValue) },
      rank: 0,
    });
  }

  // Embed titles render Markdown (a thread name does not, so the post's own title stays raw).
  const embedTitle = truncate(plain(nameOf(party)), LIMITS.embedTitle);
  const embedDescription = truncate(description, LIMITS.embedDescription);
  fitEmbed(embedTitle, embedDescription, fields);

  const embed: APIEmbed = {
    title: embedTitle,
    description: embedDescription,
    color: over ? ENDED_COLOUR : TIMED_COLOUR,
    ...(boss?.image === undefined ? {} : { thumbnail: { url: boss.image } }),
    fields: fields.map((f) => f.field),
  };
  const tags = trainTags(party, now);
  return {
    title: trainTitle(party),
    tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
    embed,
    message: { embeds: [embed], components: partyControls(party) },
  };
}
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -16,6 +16,7 @@ import {
   asKindOf,
   isMeetup,
   isRaid,
+  isTrain,
   membersWhere,
   partyWord,
   type MeetupParty,
@@ -23,12 +24,14 @@ import {
   type RaidBossRef,
   type RaidParty,
   type TimedParty,
+  type TrainParty,
   setSaved,
   endParty,
 } from '../domain/party/party.js';
 import { certainMoves, createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
 import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
 import { PartyStatus } from '../domain/party/status.js';
+import { currentStop } from '../domain/party/train.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
@@ -44,6 +47,7 @@ import {
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
 import { plain, withMentions } from '../render/text.js';
 import type { TimedPostView } from '../render/timed-post.js';
+import { renderTrainPost, trainTitle, type TrainPostView } from '../render/train-post.js';
 import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { KeyedLock } from './keyed-lock.js';
@@ -323,6 +327,18 @@ export class PartyService {
     };
   }
 
+  /** Everything the renderer needs to show a train as it is now. */
+  trainView(party: TrainParty): TrainPostView {
+    const { gyms, raidBosses, gameData } = this.options;
+    const catalogue = gameData.catalogue;
+    return {
+      ...this.timedView(party),
+      gym: (id) => gyms.get(id),
+      boss: shownBoss(party, catalogue, raidBosses.bosses()),
+      catalogue,
+    };
+  }
+
   /**
    * What the post of a party shows now, by the renderer of its kind. `closed` is the sentence
    * of its last showing when somebody closed it (see `RaidPostView.closed`).
@@ -335,8 +351,7 @@ export class PartyService {
       case 'meetup':
         return renderMeetupPost({ ...this.timedView(party), ...last });
       case 'train':
-        // The post of a train comes with the next step of plan 3B; nothing makes a train yet.
-        throw new Error(`Party ${party.id} is a train, which cannot be shown yet`);
+        return renderTrainPost({ ...this.trainView(party), ...last });
     }
   }
 
@@ -1416,17 +1431,23 @@ export class PartyService {
   }
 
   /**
-   * The list of a region's raids, and under them its meetups, as its summary post shows it
-   * (also for `/status`).
+   * The list of a region's raids, and under them its trains and its meetups, as its summary
+   * post shows it (also for `/status`).
    */
   summaryText(regionId: number): string {
+    const { store, gyms } = this.options;
     const now = this.now();
-    const parties = this.options.store.inRegion(regionId);
+    const parties = store.inRegion(regionId);
     const raids = parties
       .filter(isRaid)
       .map((party) => ({ party, title: raidTitle(this.view(party)) }));
     const meetups = parties.filter(isMeetup).map((party) => ({ party, title: meetupTitle(party) }));
-    return renderSummary(raids, now, meetups);
+    const trains = parties.filter(isTrain).map((party) => {
+      const stop = currentStop(party);
+      const gym = stop === undefined ? undefined : gyms.get(stop);
+      return { party, title: trainTitle(party), at: gym && (gym.nickname || gym.name) };
+    });
+    return renderSummary(raids, now, meetups, trains);
   }
 
   private async renderSummary(regionId: number): Promise<void> {
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/components/party.test.ts src/render/activity.test.ts src/render/summary.test.ts src/render/train-post.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 20c7dd8 -- src test   # must print nothing
npx prettier --check src/components/party.test.ts src/components/party.ts src/render/activity.test.ts src/render/party-controls.ts src/render/raid-post.ts src/render/summary.test.ts src/render/summary.ts src/render/train-panel.ts src/render/train-post.test.ts src/render/train-post.ts src/services/party-service.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/components/party.test.ts src/components/party.ts src/render/activity.test.ts src/render/party-controls.ts src/render/raid-post.ts src/render/summary.test.ts src/render/summary.ts src/render/train-panel.ts src/render/train-post.test.ts src/render/train-post.ts src/services/party-service.ts
git commit -m "What a train shows: its post, the button that opens its panel, the region list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,388 unit tests.

---

### Task 6: Trains on Discord: createTrain, the train service, the clock

**Files:**
- Create: `src/services/gathered.test.ts`, `src/services/gathered.ts`, `src/services/party-service.train.test.ts`, `src/services/train-service.test.ts`, `src/services/train-service.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/services/access-service.test.ts`, `src/services/attendance-service.ts`, `src/services/party-service.ts`, `src/services/timed-party-service.ts`, `test/support/party-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Tasks 1 to 5; `PartyService.createMeetup`, `TimedPartyService` and its gathered start announcement, `AttendanceService`, the app context and `src/app.ts`.
- Produces: `Gathered` (`src/services/gathered.ts`: `later`, `drop`, `flush`) under `TimedPartyService` and the new service; `PartyService.createTrain(request: TrainRequest): Promise<TrainOutcome>` beside `createMeetup` (`TimedRequest`, `TimedOutcome`); `TrainService` (`ctx.trains`; `TrainServiceOptions`): `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `setConductor`, `clearConductor`, `setBoss`, `flush`, each answering a `TrainOutcome`, with the gathered movement announcement; the attendance service saying that the conductor left; `createdTrain()` in `test/support/party-service.ts`, `trains` in `partyServiceWith()` and the test context.

The announcement remembers the gym the train started from, not a stop number, and is dropped when a change leaves the route empty. `TrainService.flush()` runs at shutdown before the client is destroyed, like the timed parties' one.

Reference commit of the prototype for this task: `ade129e`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/services/access-service.test.ts`:

```diff
--- a/src/services/access-service.test.ts
+++ b/src/services/access-service.test.ts
@@ -4,6 +4,7 @@ import { EAST_CHANNEL, EAST_FORUM, WEST_FORUM } from '../../test/support/gyms.js
 import { ALICE, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
 import {
   createdMeetup,
+  createdTrain,
   MemoryAccessGrants,
   reportedRaid,
   restarted,
@@ -557,3 +558,61 @@ describe('AccessService: a meetup', () => {
     expect(other.gateway.canSee(WEST_FORUM, REPORTER)).toBe(true);
   });
 });
+
+describe('AccessService: a train', () => {
+  type Train = Awaited<ReturnType<typeof createdTrain>>;
+  async function done(made: Train): Promise<void> {
+    await made.trains.flush();
+    await made.attendance.flush();
+    await made.access.flush();
+    await made.service.flush();
+  }
+  const calls = (made: Train): string[] =>
+    made.gateway.calls.filter((call) => /^(admit|dismiss)Member /.test(call));
+
+  it('lets a member of another region into the forum of a train they sign up for', async () => {
+    const made = await createdTrain({ route: [4, 8] });
+    made.gateway.shutOut(WEST_FORUM, ALICE);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    await done(made);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
+    expect(calls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
+    expect(await made.grants.list()).toEqual([
+      { forumChannelId: WEST_FORUM, memberId: ALICE, guildId: 1, createdAt: made.clock.now },
+    ]);
+  });
+
+  it('keeps them in while the train moves, also to a gym of another region and past its route', async () => {
+    const made = await createdTrain({ route: [4, 8] });
+    made.gateway.shutOut(WEST_FORUM, ALICE);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
+    await done(made);
+    // Gym 8 lies in East: the post of the train stays in the forum of West.
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'finish', false);
+    await done(made);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
+    expect(calls(made)).toEqual([`admitMember ${WEST_FORUM} ${ALICE}`]);
+    expect(made.gateway.admitted.get(EAST_FORUM) ?? new Set()).toEqual(new Set());
+  });
+
+  it('takes the access back when they leave, also as the conductor and by Done, and when the train ends', async () => {
+    const made = await createdTrain({ route: [4] });
+    made.gateway.shutOut(WEST_FORUM, ALICE, BOB, CAROL);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
+    await made.attendance.signUp(made.party.id, { id: CAROL }, PartyStatus.Interested);
+    await made.trains.setConductor(made.party.id, alice);
+    await done(made);
+    await made.attendance.leave(made.party.id, alice);
+    await made.attendance.done(made.party.id, bob);
+    await done(made);
+    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
+    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
+    expect(made.gateway.canSee(WEST_FORUM, CAROL)).toBe(true);
+    await made.service.end(made.party.id);
+    await done(made);
+    expect(made.gateway.canSee(WEST_FORUM, CAROL)).toBe(false);
+    expect(await made.grants.list()).toEqual([]);
+  });
+});
```

Create `src/services/gathered.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { Gathered } from './gathered.js';

/** A gatherer whose messages are recorded; nothing goes out by itself during a test. */
function gatherer(delayMs = 3_600_000) {
  const sent: [string, string[]][] = [];
  const errors: [unknown, string][] = [];
  let failing: Error | undefined;
  const gathered = new Gathered<string[]>({
    delayMs,
    send: async (key, texts) => {
      await new Promise((resolve) => setImmediate(resolve));
      if (failing) throw failing;
      sent.push([key, texts]);
    },
    onError: (err, key) => errors.push([err, key]),
  });
  const add = (key: string, text: string) => {
    gathered.later(key, (earlier) => [...(earlier ?? []), text]);
  };
  return {
    gathered,
    sent,
    errors,
    add,
    fail: (err: Error | undefined) => {
      failing = err;
    },
  };
}

describe('Gathered', () => {
  it('sends nothing before the delay, and one message of several changes of a key', async () => {
    const made = gatherer();
    made.add('a', 'first');
    made.add('a', 'second');
    made.add('b', 'other');
    expect(made.sent).toEqual([]);
    await made.gathered.flush();
    expect(made.sent).toEqual([
      ['a', ['first', 'second']],
      ['b', ['other']],
    ]);
    // Nothing waits any more.
    await made.gathered.flush();
    expect(made.sent).toHaveLength(2);
  });

  it('sends by itself once nothing has changed for the delay', async () => {
    const made = gatherer(5);
    made.add('a', 'first');
    // However long the machine takes: until it is there.
    await vi.waitFor(() => {
      expect(made.sent).toEqual([['a', ['first']]]);
    });
    // What comes afterwards is a message of its own.
    made.add('a', 'later');
    await made.gathered.flush();
    expect(made.sent).toEqual([
      ['a', ['first']],
      ['a', ['later']],
    ]);
  });

  it('drops what waits for a key, and sends what comes afterwards as if nothing had waited', async () => {
    const made = gatherer();
    made.add('a', 'first');
    made.add('b', 'other');
    made.gathered.drop('a');
    made.gathered.drop('never waited');
    await made.gathered.flush();
    expect(made.sent).toEqual([['b', ['other']]]);
    made.add('a', 'later');
    await made.gathered.flush();
    // Not `['first', 'later']`: what was dropped is gone.
    expect(made.sent.at(-1)).toEqual(['a', ['later']]);
  });

  it('hands a failure to its owner and goes on with the next message', async () => {
    const made = gatherer();
    const down = new Error('Discord is down');
    made.fail(down);
    made.add('a', 'lost');
    await made.gathered.flush();
    expect(made.errors).toEqual([[down, 'a']]);
    made.fail(undefined);
    made.add('a', 'kept');
    await made.gathered.flush();
    expect(made.sent).toEqual([['a', ['kept']]]);
  });
});
```

Create `src/services/party-service.train.test.ts`:

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
import { ALICE, BOB, MINUTE, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
import {
  createdTrain,
  gatewayWithMirrorChannels,
  partyServiceWith,
  restarted,
} from '../../test/support/party-service.js';
import { PartyStatus } from '../domain/party/status.js';
import { partyControls } from '../render/party-controls.js';
import { renderTrainPost } from '../render/train-post.js';
import type { Member } from './attendance-service.js';
import { WARN_AGAIN_AFTER } from './party-scheduler.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** The names of the tags a post carries. */
function tagsOf(made: Made, forum: typeof WEST_FORUM | typeof EAST_FORUM = WEST_FORUM): string[] {
  const names = Object.entries(made.tags[forum]);
  const applied = made.gateway.posts.get(made.postId)?.tagIds ?? [];
  return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
}

const embed = (made: Made) => made.gateway.posts.get(made.postId)?.message.embeds?.[0];

/** Runs the clock at a time and lets everything it started go out. */
async function tickAt(made: Made, time: number): Promise<void> {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.scheduler.whenIdle();
  await made.attendance.flush();
  await made.service.flush();
}

describe('PartyService.createTrain', () => {
  it('stores the train and makes its post in the forum of the region it was made in', async () => {
    const made = await createdTrain({ creator: { name: 'Rhea', team: 'valor' } });
    const { party, postId, gateway, store } = made;
    expect(party).toMatchObject({
      type: 'train',
      status: 'active',
      regionId: 1,
      guildId: 1,
      gymId: null,
      forumChannelId: WEST_FORUM,
      forumPostId: postId,
      createdById: REPORTER,
      anonymous: false,
      timed: { name: 'Saturday legendaries', startTime: null },
      train: { route: [], stop: 0, conductorId: null, boss: null },
    });
    expect(store.get(party.id)).toEqual(party);
    expect(store.byPost(postId)?.id).toBe(party.id);
    // Who made it is signed up as interested, and is not the conductor.
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
    expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
    expect(tagsOf(made)).toEqual(['Train']);
    expect(post?.message).toEqual(renderTrainPost(made.service.trainView(made.current())).message);
    expect(post?.message.components).toEqual(partyControls(made.current()));
    expect(post).toMatchObject({ edits: 0, renames: 0, retags: 0 });
  });

  it('links to the new post in the channel of the region, as a train', async () => {
    const made = await createdTrain();
    const [link, ...others] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(`New train: <#${made.postId}>`);
    expect(others).toEqual([]);
    expect(made.current().regionLinkMessageId).toBe(link?.id);
  });

  it('makes nothing for a text that is no name, a channel that is no region, a region without a forum', async () => {
    const made = await partyServiceWith();
    const request = { creatorId: REPORTER, regionChannelId: WEST_CHANNEL };
    expect(await made.service.createTrain({ ...request, name: '   ' })).toEqual({
      kind: 'bad-name',
    });
    expect(
      await made.service.createTrain({
        ...request,
        name: 'T',
        regionChannelId: '100000000000000099',
      }),
    ).toEqual({ kind: 'no-region' });
    expect(
      await made.service.createTrain({ ...request, name: 'T', regionChannelId: UNBOUNDED_CHANNEL }),
    ).toMatchObject({ kind: 'no-forum', region: { id: 3 } });
    expect(made.storage.writes).toEqual([]);
    expect(made.gateway.calls).toEqual([]);
  });

  it('ends the train again when its post cannot be made', async () => {
    const made = await partyServiceWith();
    made.gateway.failing.set('createPost', new Error('Discord is down'));
    await expect(
      made.service.createTrain({
        name: 'Saturday legendaries',
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      }),
    ).rejects.toThrow('Discord is down');
    expect(made.store.active()).toEqual([]);
    expect([...made.storage.rows.values()].map((row) => row.status)).toEqual(['ended']);
  });
});

describe('PartyService: the post of a train', () => {
  it('stays in the forum of the region it was made in, wherever its route leads', async () => {
    // Gym 8 lies in East; the train was made in West.
    const made = await createdTrain({ route: [1, 8] });
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    await made.service.flush();
    expect(made.current()).toMatchObject({ regionId: 1, forumChannelId: WEST_FORUM, gymId: null });
    expect(made.gateway.posts.get(made.postId)?.forumId).toBe(WEST_FORUM);
    expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
    expect(embed(made)?.description).toContain('**Now at** [Café Élan Fresco](');
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
  });

  it('shows who signed up and where the train is after a change', async () => {
    const made = await createdTrain({ route: [4, 1] });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
    await made.service.flush();
    const fields = embed(made)?.fields ?? [];
    expect(fields.map((field) => field.name)).toEqual(['Route: stop 1 of 2', 'Trainers (2)']);
    expect(fields[1]?.value).toBe(`**Here** ❄️ <@${ALICE}>\n**Interested** <@${REPORTER}>`);
  });

  it('has no copies in the channels for remote raids and raids at EX gyms', async () => {
    const made = await createdTrain(
      { route: [4] },
      { renderDelayMs: 0, sharedDelayMs: 0 },
      { gateway: gatewayWithMirrorChannels() },
    );
    await made.attendance.setRemote(made.party.id, alice, true);
    await made.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(made.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('puts the train at the bottom of its post again for /status, with its buttons', async () => {
    const made = await createdTrain({ route: [4] });
    expect(await made.service.showStatus(made.party.id)).toBe(true);
    await made.service.flush();
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: made.postId, messageId: copy?.id, kind: 'status' },
    ]);
    expect(copy?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
    expect(copy?.message.components).toEqual(partyControls(made.current()));
  });

  it('lists the train in the summary of its region, with the gym it is at', async () => {
    const made = await createdTrain({ route: [4, 1] });
    expect(made.service.summaryText(1).split('\n')).toEqual([
      'No raids right now. Report one with `/raid`.',
      '',
      '**Trains**',
      `<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
    ]);
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    // A gym is called by its nickname when it has one.
    expect(made.service.summaryText(1).split('\n')[3]).toBe(
      `<#${made.postId}> · at The Stacks · no time set · 1 trainer`,
    );
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    expect(made.service.summaryText(1).split('\n')[3]).toBe(
      `<#${made.postId}> · route finished · no time set · 1 trainer`,
    );
    expect(made.service.summaryText(2)).toBe('No raids right now. Report one with `/raid`.');
  });
});

describe('PartyService: ending a train', () => {
  it('strips the controls, deletes the link line and archives the post as ended', async () => {
    const made = await createdTrain({ route: [4, 1] });
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(made.store.get(made.party.id)).toBeUndefined();
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(post?.message.components).toEqual([]);
    expect(embed(made)?.description?.split('\n')[1]).toBe('This train is over.');
    expect(embed(made)?.color).toBe(0xe74c3c);
    expect(tagsOf(made)).toEqual(['Ended', 'Train']);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('puts a request to delete it into the post, as a train', async () => {
    const made = await createdTrain();
    expect(await made.service.requestDeletion(made.party.id, ALICE, 'Made twice', [])).toBe(
      'asked',
    );
    expect(made.said().at(-1)).toBe(`<@${ALICE}> asks for this train to be deleted.\n> Made twice`);
  });
});

describe('PartyService: a train after a restart', () => {
  it('shows the post anew from what is stored: its route, its conductor, its boss', async () => {
    const made = await createdTrain({ route: [4, 1, 7] });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, alice);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.setBoss(made.party.id, alice, { boss: { key: 'yveltal' }, label: 'Yveltal' });
    await made.trains.flush();
    await made.attendance.flush();
    await made.service.flush();
    const shown = made.gateway.posts.get(made.postId)?.message;
    const again = await restarted(made);
    const train = again.store.byPost(made.postId);
    expect(train).toEqual(made.current());
    expect(train).toMatchObject({
      type: 'train',
      train: { route: [4, 1, 7], stop: 1, conductorId: ALICE, boss: { key: 'yveltal' } },
    });
    await again.scheduler.tick();
    await again.service.flush();
    expect(again.gateway.posts.get(made.postId)?.message).toEqual(shown);
  });
});

describe('PartyScheduler: a train', () => {
  it('gives a train nobody gave a time a day, and pings its maker with the warning', async () => {
    const made = await createdTrain({ route: [4, 1] });
    await tickAt(made, PARTY_NOW + DAY + 5 * MINUTE);
    expect(made.current().deletionTime).toBeNull();
    const warnedAt = PARTY_NOW + DAY + 6 * MINUTE;
    await tickAt(made, warnedAt);
    const due = warnedAt + 60 * MINUTE;
    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
      {
        content:
          'This train has no end time, so I take it to be over. ' +
          `I will archive this post ${stamp(due, 'R')}; it stays readable afterwards. ` +
          `A time set with \`/meet\` or \`/end\` keeps it open.\n<@${REPORTER}>`,
        mention: { users: [REPORTER] },
      },
    ]);
    expect(tagsOf(made)).toEqual(['Train']);
    await tickAt(made, due);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)).toMatchObject({
      archived: true,
      locked: true,
      reopened: 0,
    });
    expect(embed(made)?.description?.split('\n')[1]).toBe('This train is over.');
    expect(tagsOf(made)).toEqual(['Ended', 'Train']);
  });

  it('pings the conductor instead when the train has one, once', async () => {
    const made = await createdTrain({ route: [4, 1] });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, alice);
    await made.attendance.flush();
    for (const message of made.gateway.messagesIn(made.postId)) {
      await made.gateway.deleteMessage(made.postId, message.id);
    }
    await tickAt(made, PARTY_NOW + DAY + 6 * MINUTE);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
      users: [ALICE],
    });
    for (let n = 0; n < WARN_AGAIN_AFTER; n++) made.scheduler.activity(made.postId);
    await made.scheduler.whenIdle();
    const [again, ...others] = made.gateway.messagesIn(made.postId);
    expect(others).toEqual([]);
    expect(again?.message.mention).toBeUndefined();
  });

  it('pings nobody when the conductor does not allow it, or the train had an end', async () => {
    const quiet = await createdTrain();
    await quiet.attendance.signUp(quiet.party.id, bob, PartyStatus.Coming);
    await quiet.trains.setConductor(quiet.party.id, bob);
    quiet.userSettings.set(BOB, { mentions: false });
    await quiet.attendance.flush();
    await tickAt(quiet, PARTY_NOW + DAY + 6 * MINUTE);
    const warning = quiet.gateway.messagesIn(quiet.postId).at(-1)?.message;
    expect(warning?.content).toMatch(/^This train has no end time/);
    expect(warning?.mention).toBeUndefined();

    const ended = await createdTrain();
    const end = PARTY_NOW + 2 * HOUR;
    await ended.timed.setEndTime(ended.party.id, { id: REPORTER }, end);
    await ended.attendance.flush();
    await tickAt(ended, end + 6 * MINUTE);
    expect(ended.gateway.messagesIn(ended.postId).at(-1)?.message).toEqual({
      content: `This train is over. I will archive this post ${stamp(end + 66 * MINUTE, 'R')}; it stays readable afterwards.`,
    });
  });

  it('does not end a train because its route is finished', async () => {
    const made = await createdTrain({ route: [4] });
    await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
    await made.trains.flush();
    await tickAt(made, PARTY_NOW + 12 * HOUR);
    expect(made.current()).toMatchObject({ status: 'active', deletionTime: null });
    expect(tagsOf(made)).toEqual(['Train']);
  });
});
```

Create `src/services/train-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { testGyms } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
import { createdMeetup, createdTrain, reportedRaid } from '../../test/support/party-service.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { currentStop } from '../domain/party/train.js';
import type { Member } from './attendance-service.js';

const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const maker: Member = { id: REPORTER, name: 'Rae' };

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** Lets everything that is under way go out: the announcement of a move, the lines, the post. */
async function settled(made: Made): Promise<void> {
  await made.trains.flush();
  await made.attendance.flush();
  await made.service.flush();
}

/** A train on a route of these gyms, with Alice and Bob coming beside the member who made it. */
async function boarded(route: readonly number[] = [4, 1, 7, 2]): Promise<Made> {
  const made = await createdTrain({ route });
  await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
  await settled(made);
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  return made;
}

const edits = (made: Made): number => made.gateway.posts.get(made.postId)?.edits ?? 0;
const messages = (made: Made) =>
  made.gateway.messagesIn(made.postId).map((message) => message.message);
/** The first line of the last message that announced a movement (those carry mentions). */
const first = (made: Made): string =>
  (
    messages(made)
      .filter((message) => message.mention)
      .at(-1)?.content ?? ''
  ).split('\n')[0] ?? '';
const lines = (made: Made): string[] => made.said().join('\n').split('\n').filter(Boolean);

describe('TrainService: the route', () => {
  it('adds a stop for a member who is signed up, shows the post anew and says so in a line', async () => {
    const made = await boarded([4]);
    const before = edits(made);
    const outcome = await made.trains.addStop(made.party.id, alice, 1);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, number: 2 });
    expect(made.current().train).toMatchObject({ route: [4, 1], stop: 0 });
    // Who changed something is noted with their name and team, as everywhere.
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ name: 'Alice', team: 'mystic' });
    await settled(made);
    expect(edits(made)).toBe(before + 1);
    expect(messages(made)).toEqual([
      { content: `<@${ALICE}> added stop 2 to the route: **The Stacks**.` },
    ]);
    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
    expect(embed?.description).toContain(`**Next** [The Stacks](${maps(1)})`);
  });

  it('refuses a gym that is on the route, and a member who is not signed up, and says nothing', async () => {
    const made = await boarded();
    const before = made.current();
    expect(await made.trains.addStop(made.party.id, alice, 4)).toEqual({
      kind: 'refused',
      reason: 'already-on-route',
    });
    expect(await made.trains.addStop(made.party.id, carol, 5)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(made.current()).toBe(before);
    await settled(made);
    expect(messages(made)).toEqual([]);
  });

  it('removes and moves stops by their numbers, keeping the train at its gym', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    expect(currentStop(made.current())).toBe(1);
    const removed = await made.trains.removeStop(made.party.id, alice, 1);
    expect(removed).toMatchObject({ kind: 'ok', changed: true, gymId: 4 });
    expect(made.current().train).toMatchObject({ route: [1, 7, 2], stop: 0 });
    const moved = await made.trains.moveStop(made.party.id, bob, 1, 3);
    expect(moved).toMatchObject({ kind: 'ok', changed: true, gymId: 1 });
    expect(made.current().train).toMatchObject({ route: [7, 2, 1], stop: 2 });
    expect(currentStop(made.current())).toBe(1);
    expect(await made.trains.moveStop(made.party.id, bob, 2, 2)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    expect(await made.trains.removeStop(made.party.id, bob, 9)).toEqual({
      kind: 'refused',
      reason: 'no-such-stop',
    });
    await made.attendance.flush();
    expect(lines(made)).toEqual([
      `<@${ALICE}> took **Veterans Memorial Bridge** off the route.`,
      `<@${BOB}> moved **The Stacks** to stop 3 of the route.`,
    ]);
  });

  it('clears the route for staff and for the conductor, and for nobody else', async () => {
    const made = await boarded();
    expect(await made.trains.clearRoute(made.party.id, alice, false)).toEqual({
      kind: 'refused',
      reason: 'conductor-or-staff',
    });
    await made.trains.setConductor(made.party.id, alice);
    expect(await made.trains.clearRoute(made.party.id, alice, false)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(made.current().train).toMatchObject({ route: [], stop: 0, conductorId: ALICE });
    expect(await made.trains.clearRoute(made.party.id, carol, true)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    await made.attendance.flush();
    expect(lines(made).at(-1)).toBe(`<@${ALICE}> cleared the route.`);
  });
});

describe('TrainService.move', () => {
  it('moves the train, puts who is here back to coming and shows the post anew', async () => {
    const made = await boarded();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present, { remote: true });
    await settled(made);
    const before = edits(made);
    const outcome = await made.trains.move(made.party.id, alice, 'next', false);
    expect(outcome).toMatchObject({
      kind: 'ok',
      changed: true,
      move: 'next',
      at: 1,
      finished: false,
    });
    expect(made.current().train.stop).toBe(1);
    expect(attendeeOf(made.current(), BOB)).toMatchObject({
      status: PartyStatus.Coming,
      remote: true,
    });
    await made.service.flush();
    expect(edits(made)).toBe(before + 1);
  });

  it('tells the others where the train is going, in one message that pings those who allow it', async () => {
    const made = await boarded();
    made.userSettings.set(BOB, { mentionsTrainStops: false });
    await made.trains.move(made.party.id, alice, 'next', false);
    // Nothing goes out before the move has stood for a moment.
    expect(messages(made)).toEqual([]);
    await settled(made);
    expect(messages(made)).toEqual([
      {
        content:
          `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.\n` +
          `<@${REPORTER}>`,
        mention: { users: [REPORTER] },
      },
    ]);
  });

  it('does not ping who switched all mentions off, nor the member who moved the train', async () => {
    const made = await boarded();
    made.userSettings.set(REPORTER, { mentions: false });
    await made.trains.move(made.party.id, bob, 'next', false);
    await settled(made);
    expect(messages(made).at(-1)?.mention).toEqual({ users: [ALICE] });
  });

  it('says it also when nobody else is signed up: a line without a ping', async () => {
    const made = await createdTrain({ route: [4, 1] });
    await made.trains.move(made.party.id, maker, 'next', false);
    await settled(made);
    expect(messages(made)).toEqual([
      {
        content: `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${REPORTER}>.`,
        mention: { users: [] },
      },
    ]);
  });

  it('makes one message of Next pressed twice, saying where the train is then', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'next', false);
    await settled(made);
    expect(messages(made)).toHaveLength(1);
    expect(messages(made)[0]?.content).toBe(
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>). Moved by <@${ALICE}>.\n` +
        `<@${REPORTER}> <@${BOB}>`,
    );
  });

  it('says nothing of a move that was taken back right away', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    expect(messages(made)).toEqual([]);
    expect(made.current().train.stop).toBe(0);
  });

  it('words each move: back, past a stop, and the end of the route', async () => {
    const made = await boarded();
    const said = async (move: 'next' | 'previous' | 'skip' | 'finish'): Promise<string> => {
      await made.trains.move(made.party.id, alice, move, false);
      await settled(made);
      return (messages(made).at(-1)?.content ?? '').split('\n')[0] ?? '';
    };
    expect(await said('skip')).toBe(
      `The train is moving to [Harbor Lighthouse Mural](<${maps(7)}>), skipping **The Stacks**. ` +
        `Moved by <@${ALICE}>.`,
    );
    expect(await said('previous')).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
    expect(await said('finish')).toBe(`The train has finished its route. Moved by <@${ALICE}>.`);
    // Back from the end of the route to its last stop.
    expect(await said('previous')).toBe(
      `The train is moving back to [Old Stone Fountain](<${maps(2)}>). Moved by <@${ALICE}>.`,
    );
    expect(await said('next')).toBe(`The train has finished its route. Moved by <@${ALICE}>.`);
    // Earlier announcements stay: the post is a feed.
    expect(messages(made)).toHaveLength(5);
    // Finishing the route ends nothing.
    expect(made.current()).toMatchObject({ status: 'active', endTime: null, deletionTime: null });
  });

  it('refuses a move that cannot be made, and one by who may not, and announces nothing', async () => {
    const made = await boarded();
    const refusedWith = async (member: Member, move: 'previous' | 'next', staff = false) =>
      made.trains.move(made.party.id, member, move, staff);
    expect(await refusedWith(alice, 'previous')).toEqual({
      kind: 'refused',
      reason: 'at-first-stop',
    });
    expect(await refusedWith(carol, 'next')).toEqual({ kind: 'refused', reason: 'not-attending' });
    await made.trains.setConductor(made.party.id, alice);
    expect(await refusedWith(bob, 'next')).toEqual({ kind: 'refused', reason: 'not-conductor' });
    expect(made.current().train.stop).toBe(0);
    // Staff move it whoever leads it, signed up or not.
    expect(await refusedWith(carol, 'next', true)).toMatchObject({ kind: 'ok', at: 1 });
    const empty = await createdTrain();
    expect(await empty.trains.move(empty.party.id, maker, 'next', false)).toEqual({
      kind: 'refused',
      reason: 'no-route',
    });
    await settled(empty);
    expect(messages(empty)).toEqual([]);
  });

  it('says nothing into the post of a train that ended before the announcement went out', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.service.end(made.party.id);
    await settled(made);
    expect(messages(made)).toEqual([]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});

describe('TrainService: the conductor and the boss', () => {
  it('makes a member who is signed up the conductor, and says a takeover by name', async () => {
    const made = await boarded();
    expect(await made.trains.setConductor(made.party.id, carol)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.trains.setConductor(made.party.id, alice)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: null,
    });
    expect(await made.trains.setConductor(made.party.id, alice)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    expect(await made.trains.setConductor(made.party.id, bob)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: ALICE,
    });
    expect(made.current().train.conductorId).toBe(BOB);
    await settled(made);
    expect(lines(made)).toEqual([
      `<@${ALICE}> is the conductor of this train now.`,
      `<@${BOB}> is the conductor of this train now, in the place of <@${ALICE}>.`,
    ]);
    // A line pings nobody.
    expect(messages(made).every((message) => message.mention === undefined)).toBe(true);
    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
    expect(embed?.description).toContain(`Conductor: <@${BOB}>.`);
  });

  it('takes the conductor off for themself and for staff, and for nobody else', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    expect(await made.trains.clearConductor(made.party.id, bob, false)).toEqual({
      kind: 'refused',
      reason: 'conductor-or-staff',
    });
    expect(await made.trains.clearConductor(made.party.id, carol, true)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: ALICE,
    });
    await made.trains.setConductor(made.party.id, bob);
    expect(await made.trains.clearConductor(made.party.id, bob, false)).toMatchObject({
      kind: 'ok',
      changed: true,
      previous: BOB,
    });
    expect(await made.trains.clearConductor(made.party.id, bob, false)).toMatchObject({
      kind: 'ok',
      changed: false,
      previous: null,
    });
    await made.attendance.flush();
    expect(lines(made).filter((line) => /conductor/.test(line))).toEqual([
      `<@${ALICE}> is the conductor of this train now.`,
      `<@${CAROL}> took <@${ALICE}> off as the conductor of this train.`,
      `<@${BOB}> is the conductor of this train now.`,
      `<@${BOB}> is no longer the conductor of this train.`,
    ]);
  });

  it('frees the conductor who leaves, and the post says that the train has none', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    await made.attendance.flush();
    await made.attendance.leave(made.party.id, alice);
    expect(made.current().train.conductorId).toBeNull();
    await made.trains.setConductor(made.party.id, bob);
    await made.attendance.flush();
    // Done means leave on a train.
    await made.attendance.done(made.party.id, bob);
    expect(made.current().train.conductorId).toBeNull();
    await made.attendance.flush();
    expect(lines(made).filter((line) => /has left/.test(line))).toEqual([
      `<@${ALICE}> has left: this train has no conductor now.`,
      `<@${BOB}> has left: this train has no conductor now.`,
    ]);
    // Anybody who is signed up may move it again.
    expect(await made.trains.move(made.party.id, maker, 'next', false)).toMatchObject({
      kind: 'ok',
    });
  });

  it('sets the boss the train is after, which the post shows, and removes it again', async () => {
    const made = await boarded();
    const yveltal = { boss: { key: 'yveltal' }, label: 'Yveltal' };
    expect(await made.trains.setBoss(made.party.id, alice, yveltal)).toMatchObject({
      kind: 'ok',
      changed: true,
    });
    expect(await made.trains.setBoss(made.party.id, alice, yveltal)).toMatchObject({
      kind: 'ok',
      changed: false,
    });
    await settled(made);
    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
    expect(embed?.description).toMatch(/^\*\*Raid train\*\* after \*\*Yveltal\*\*/);
    expect(embed?.fields?.[0]?.name).toBe('Boss');
    await made.trains.setBoss(made.party.id, bob, { boss: null, label: '' });
    await made.attendance.flush();
    expect(lines(made)).toEqual([
      `<@${ALICE}> set the boss this train is after: **Yveltal**.`,
      `<@${BOB}> removed the boss of this train.`,
    ]);
    expect(made.current().train.boss).toBeNull();
  });
});

describe('TrainService: what is no train', () => {
  it('finds no train in a raid, in a meetup, or where there is no party', async () => {
    const raid = await reportedRaid();
    const before = raid.current();
    expect(await raid.trains.addStop(raid.party.id, maker, 4)).toEqual({ kind: 'gone' });
    expect(await raid.trains.move(raid.party.id, maker, 'next', true)).toEqual({ kind: 'gone' });
    expect(await raid.trains.setConductor(raid.party.id, maker)).toEqual({ kind: 'gone' });
    expect(raid.current()).toBe(before);
    const meetup = await createdMeetup();
    expect(await meetup.trains.setBoss(meetup.party.id, maker, { boss: null, label: '' })).toEqual({
      kind: 'gone',
    });
    expect(await meetup.trains.clearRoute('no-such-party', maker, true)).toEqual({ kind: 'gone' });
  });
});

describe('TrainService: the announcement goes by where the train is, not by the number of its stop', () => {
  it('says where the train went when an earlier stop is removed right after the move', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    // The train is at the first stop of the route again, by number: but it has moved.
    await made.trains.removeStop(made.party.id, bob, 1);
    expect(made.current().train).toMatchObject({ route: [1, 7, 2], stop: 0 });
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toHaveLength(1);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
  });

  it('says that the route is finished when a stop is removed right after Finish', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'finish', false);
    await made.trains.removeStop(made.party.id, bob, 1);
    await settled(made);
    expect(first(made)).toBe(`The train has finished its route. Moved by <@${ALICE}>.`);
  });

  it('says where a train that had finished went on to: back, and on to a stop that was added', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'finish', false);
    await settled(made);
    const before = messages(made).length;
    // Back to the last stop, a stop more, and on to it: the number of the stop is what it was.
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.addStop(made.party.id, bob, 3);
    await made.trains.move(made.party.id, alice, 'next', false);
    expect(made.current().train).toMatchObject({ route: [4, 1, 7, 2, 3], stop: 4 });
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toHaveLength(before + 1);
    expect(first(made)).toBe(
      `The train is moving to [St. Mary's Church](<${maps(3)}>). Moved by <@${ALICE}>.`,
    );
  });

  it('does not say "back" for a move forward whose target was then put at the front', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.moveStop(made.party.id, bob, 2, 1);
    expect(made.current().train).toMatchObject({ route: [1, 4, 7, 2], stop: 0 });
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
  });

  it('says "back" when the train went back and the gym it came from was then removed', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'skip', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.removeStop(made.party.id, bob, 3);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
  });

  it('says nothing when the route is cleared right after a move', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.clearRoute(made.party.id, carol, true);
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toEqual([]);
    expect(made.said().join('\n')).not.toMatch(/Unknown gym|moving/);
  });

  it('keeps "skipping" for one skip whose target is where the train is, and drops it otherwise', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.removeStop(made.party.id, bob, 1);
    await settled(made);
    expect(first(made)).toContain(', skipping **The Stacks**.');
    const other = await boarded();
    await other.trains.move(other.party.id, alice, 'skip', false);
    // The stop the train skipped to is removed: it is at the next one, which nothing skipped to.
    await other.trains.removeStop(other.party.id, alice, 3);
    await settled(other);
    expect(first(other)).toBe(
      `The train is moving to [Old Stone Fountain](<${maps(2)}>). Moved by <@${ALICE}>.`,
    );
  });
});

describe('TrainService: an edit of the route that changes where the train is', () => {
  it('is refused for who may not move the train, and other edits are not', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    await made.trains.move(made.party.id, alice, 'next', false);
    const notConductor = { kind: 'refused', reason: 'not-conductor' };
    expect(await made.trains.removeStop(made.party.id, bob, 2)).toEqual(notConductor);
    expect(await made.trains.removeStop(made.party.id, bob, 4)).toMatchObject({
      kind: 'ok',
      moved: false,
    });
    expect(await made.trains.addStop(made.party.id, bob, 3)).toMatchObject({
      kind: 'ok',
      moved: false,
    });
    await made.trains.move(made.party.id, alice, 'finish', false);
    expect(await made.trains.addStop(made.party.id, bob, 5)).toEqual(notConductor);
    // A moderator may, and so may the conductor.
    expect(await made.trains.addStop(made.party.id, bob, 5, true)).toMatchObject({
      kind: 'ok',
      moved: true,
    });
    expect(made.current().train.conductorId).toBe(ALICE);
  });

  it('announces the next gym once and puts who is here back to coming', async () => {
    const made = await boarded();
    await made.trains.setConductor(made.party.id, alice);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await settled(made);
    const before = messages(made).length;
    const outcome = await made.trains.removeStop(made.party.id, alice, 1);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, gymId: 4, moved: true });
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Coming);
    await settled(made);
    const said = messages(made).slice(before);
    expect(said.map((message) => message.content).sort()).toEqual([
      `<@${ALICE}> took **Veterans Memorial Bridge** off the route.`,
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.\n` +
        `<@${REPORTER}> <@${BOB}>`,
    ]);
  });

  it('announces that the route is finished when the last stop the train is at is removed', async () => {
    const made = await boarded([4, 1]);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await settled(made);
    await made.trains.removeStop(made.party.id, alice, 2);
    // Who is here stays here: there is nowhere to come to.
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    await settled(made);
    expect(first(made)).toBe(`The train has finished its route. Moved by <@${ALICE}>.`);
  });

  it('announces the stop a finished train goes on to', async () => {
    const made = await boarded([4]);
    await made.trains.move(made.party.id, alice, 'finish', false);
    await settled(made);
    await made.trains.addStop(made.party.id, bob, 1);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${BOB}>.`,
    );
  });
});

describe('TrainService.move from where the train was seen', () => {
  it('moves the train once when two members press Next on the same stop at the same moment', async () => {
    const made = await boarded();
    const both = await Promise.all([
      made.trains.move(made.party.id, alice, 'next', false, '4'),
      made.trains.move(made.party.id, bob, 'next', false, '4'),
    ]);
    expect(both.map((outcome) => outcome.kind).sort()).toEqual(['ok', 'refused']);
    expect(both.find((outcome) => outcome.kind === 'refused')).toEqual({
      kind: 'refused',
      reason: 'train-moved-on',
    });
    expect(made.current().train.stop).toBe(1);
    // Typed twice, `/next` moves twice: a command says where to go, not where from.
    await Promise.all([
      made.trains.move(made.party.id, alice, 'next', false),
      made.trains.move(made.party.id, bob, 'next', false),
    ]);
    expect(made.current().train.stop).toBe(3);
  });
});

describe('TrainService: the first stop of a route', () => {
  it('is said in a line and announced to nobody, also when a member adds it to a led train', async () => {
    const made = await createdTrain();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await made.trains.setConductor(made.party.id, alice);
    await settled(made);
    const before = messages(made).length;
    expect(await made.trains.addStop(made.party.id, bob, 4)).toMatchObject({
      kind: 'ok',
      changed: true,
      number: 1,
      moved: false,
    });
    expect(await made.trains.addStop(made.party.id, bob, 1)).toMatchObject({ moved: false });
    // Who is here stays here: nobody was on the way.
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    await settled(made);
    // Two lines, in one message or two, and nothing that announces a movement.
    const said = messages(made).slice(before);
    expect(said.every((message) => message.mention === undefined)).toBe(true);
    expect(said.flatMap((message) => (message.content ?? '').split('\n'))).toEqual([
      `<@${BOB}> added stop 1 to the route: **Veterans Memorial Bridge**.`,
      `<@${BOB}> added stop 2 to the route: **The Stacks**.`,
    ]);
  });

  it('announces nothing when the route is cleared and a first stop added in one window', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.clearRoute(made.party.id, carol, true);
    await made.trains.addStop(made.party.id, alice, 2);
    await settled(made);
    expect(messages(made).filter((message) => message.mention)).toEqual([]);
    // The same when the only stop is removed and another one added.
    const one = await boarded([4]);
    await one.trains.removeStop(one.party.id, alice, 1);
    await one.trains.addStop(one.party.id, alice, 2);
    await settled(one);
    expect(messages(one).filter((message) => message.mention)).toEqual([]);
  });
});

describe('TrainService: "back" is said only of going back', () => {
  it('says "moving to" when the train ends up at an earlier stop by other steps than Previous alone', async () => {
    const made = await boarded([4, 1]);
    // The stop the train is at is removed, Next finishes the route, Previous takes it back.
    await made.trains.removeStop(made.party.id, alice, 1);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    expect(currentStop(made.current())).toBe(1);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
  });

  it('says "back" for Previous, once or several times, and nothing else', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'finish', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
    );
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.move(made.party.id, alice, 'skip', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.move(made.party.id, alice, 'previous', false);
    // From The Stacks back to the bridge, by a detour: not all of it was going back.
    await settled(made);
    expect(first(made)).toBe(
      `The train is moving to [Veterans Memorial Bridge](<${maps(4)}>). Moved by <@${ALICE}>.`,
    );
  });
});

describe('TrainService: staff who are not signed up', () => {
  it('may edit the route as they may move the train', async () => {
    const made = await boarded();
    expect(await made.trains.addStop(made.party.id, carol, 3)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(await made.trains.addStop(made.party.id, carol, 3, true)).toMatchObject({ kind: 'ok' });
    expect(await made.trains.moveStop(made.party.id, carol, 5, 1, true)).toMatchObject({
      kind: 'ok',
      gymId: 3,
    });
    expect(await made.trains.removeStop(made.party.id, carol, 1, true)).toMatchObject({
      kind: 'ok',
      gymId: 3,
    });
    // Staff are not signed up by it.
    expect(attendeeOf(made.current(), CAROL)).toBeUndefined();
  });
});
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -18,6 +18,7 @@ import {
   type MeetupParty,
   type Party,
   type RaidParty,
+  type TrainParty,
 } from '../../src/domain/party/party.js';
 import { FORUM_TAGS } from '../../src/render/party-post.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
@@ -26,6 +27,7 @@ import {
   type MeetupRequest,
   type PartyServiceOptions,
   type RaidReport,
+  type TrainRequest,
 } from '../../src/services/party-service.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { catalogueFixture } from './game-data.js';
@@ -46,6 +48,7 @@ import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { PartyStore } from '../../src/services/party-store.js';
 import { RaidChangeService } from '../../src/services/raid-change-service.js';
 import { TimedPartyService } from '../../src/services/timed-party-service.js';
+import { TrainService } from '../../src/services/train-service.js';
 
 /** The invented regions as a directory whose rows a test can change; `load` does nothing. */
 export class TestRegions {
@@ -166,7 +169,9 @@ export function restarted(made: Outliving, overrides: Partial<PartyServiceOption
  * `attendance` is the attendance service over the same store and gateway; its lines go out only
  * by its own `flush()`. `raids` and `timed` are the services for what members change about a
  * raid and about a meetup; their lines go out with those of `attendance`, and `timed.flush()`
- * waits for the message that announces a start time. `userSettings` holds what differs from the defaults, by member.
+ * waits for the message that announces a start time. `trains` is the service for what members
+ * change about a train; `trains.flush()` waits for the message that says where a train is
+ * going. `userSettings` holds what differs from the defaults, by member.
  * `scheduler` is the clock over all of it: it never runs by itself, a test calls `tick()`.
  * `access` lets members into forums they cannot see (on the fake gateway everybody sees every
  * forum unless `gateway.shutOut` says otherwise); it works on the side, `access.flush()` waits.
@@ -262,6 +267,18 @@ export async function partyServiceWith(
     // Long enough that nothing is announced by itself during a test: `timed.flush()` does it.
     announceDelayMs: 3_600_000,
   });
+  const trains = new TrainService({
+    store,
+    gateway,
+    posts: service,
+    lines,
+    users,
+    gyms: gymsFixture(),
+    log,
+    now,
+    // As for a start time: `trains.flush()` sends what is waiting.
+    announceDelayMs: 3_600_000,
+  });
   const raidBosses = overrides.raidBosses ?? raidBossesFixture();
   const scheduler = new PartyScheduler({
     store,
@@ -283,6 +300,7 @@ export async function partyServiceWith(
     grants,
     raids,
     timed,
+    trains,
     scheduler,
     lines,
     users,
@@ -369,3 +387,46 @@ export async function createdMeetup(
     made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
   return { ...made, party: outcome.party, postId, current, said };
 }
+
+/**
+ * A raid train made through the service, with its post on the fake gateway: "Saturday
+ * legendaries", made in the channel of West by `REPORTER`, who is interested. It has no route,
+ * no conductor and no times. `route` puts it on these gyms, at the first of them.
+ */
+export async function createdTrain(
+  request: Partial<TrainRequest> & { route?: readonly number[] } = {},
+  overrides: Partial<PartyServiceOptions> = {},
+  kept?: Partial<Outliving>,
+) {
+  const made = await partyServiceWith([], overrides, kept);
+  const { route = [], ...asked } = request;
+  const outcome = await made.service.createTrain({
+    name: 'Saturday legendaries',
+    creatorId: REPORTER,
+    regionChannelId: WEST_CHANNEL,
+    ...asked,
+  });
+  if (outcome.kind !== 'created') throw new Error(`the train was not created: ${outcome.kind}`);
+  for (const gymId of route) {
+    const added = await made.trains.addStop(outcome.party.id, { id: REPORTER }, gymId);
+    if (added.kind !== 'ok') throw new Error(`gym ${gymId} was not added: ${added.kind}`);
+  }
+  await made.attendance.flush();
+  await made.service.flush();
+  const postId = outcome.party.forumPostId;
+  if (postId === null) throw new Error('the train has no post');
+  // What was said while the route was laid is not what a test looks at.
+  for (const message of made.gateway.messagesIn(postId)) {
+    await made.gateway.deleteMessage(postId, message.id);
+  }
+  /** The train as it is stored now. */
+  const current = (): TrainParty => {
+    const party = made.store.get(outcome.party.id);
+    if (party?.type !== 'train') throw new Error('the train is no longer active');
+    return party;
+  };
+  /** The texts of the messages in the post that were not deleted, oldest first. */
+  const said = (): string[] =>
+    made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
+  return { ...made, party: outcome.party, postId, current, said };
+}
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -9,6 +9,7 @@ import type { AttendanceService } from '../../src/services/attendance-service.js
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import type { TimedPartyService } from '../../src/services/timed-party-service.js';
+import type { TrainService } from '../../src/services/train-service.js';
 import { catalogueFixture } from './game-data.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
@@ -66,6 +67,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'timedParties',
       'pass { timedParties: timed, partyService, parties, regions } from partyServiceWith()',
     ),
+    trains: unavailable<TrainService>(
+      'trains',
+      'pass { trains, partyService, parties, regions } from partyServiceWith()',
+    ),
     // Every click is answered by itself; a test of bursts passes its own with a window.
     clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
```

Run: `npx vitest run --project unit src/services/access-service.test.ts src/services/gathered.test.ts src/services/party-service.train.test.ts src/services/train-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -18,6 +18,7 @@ import type { RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionProvider } from './services/region-directory.js';
 import type { MapProvider } from './services/static-maps.js';
 import type { TimedPartyService } from './services/timed-party-service.js';
+import type { TrainService } from './services/train-service.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -45,6 +46,8 @@ export interface AppContext {
   readonly raids: RaidChangeService;
   /** What members change about a meetup or a train: its name, its times, what a meetup says. */
   readonly timedParties: TimedPartyService;
+  /** What members change about a train as such: its route, where it is, its conductor, its boss. */
+  readonly trains: TrainService;
   /** The private answers to clicks on a post's controls, gathered per member (see `ClickAnswers`). */
   readonly clickAnswers: ClickAnswers;
   /** A member's settings (the defaults for a member who never changed one). */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -36,6 +36,7 @@ import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidChangeService } from './services/raid-change-service.js';
 import { TimedPartyService } from './services/timed-party-service.js';
+import { TrainService } from './services/train-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
 import { RegionDirectory } from './services/region-directory.js';
 import { StaticMaps } from './services/static-maps.js';
@@ -157,6 +158,15 @@ export async function startApp(
     log,
     zone: config.settings.timezone,
   });
+  const trains = new TrainService({
+    store: parties,
+    gateway: partyGateway,
+    posts: partyService,
+    lines,
+    users,
+    gyms,
+    log,
+  });
   const scheduler = new PartyScheduler({
     store: parties,
     posts: partyService,
@@ -214,6 +224,7 @@ export async function startApp(
     attendance,
     raids,
     timedParties,
+    trains,
     clickAnswers,
     users,
     pokemon,
@@ -307,6 +318,7 @@ export async function startApp(
       // Answers, lines and edits that are still waiting go out while Discord is connected.
       { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
       { name: 'start times', timeoutMs: 5_000, run: () => timedParties.flush() },
+      { name: 'train moves', timeoutMs: 5_000, run: () => trains.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -87,6 +87,13 @@ export interface AttendanceServiceOptions {
   now?: () => number;
 }
 
+/** What the post is told when a member has left; the conductor of a train leaves it without one. */
+function leftLine(memberId: string, result: { conductorLeft?: true }): string {
+  return result.conductorLeft
+    ? `<@${memberId}> has left: this train has no conductor now.`
+    : `<@${memberId}> has left.`;
+}
+
 function stillAsked(party: Party, members: readonly string[]): boolean {
   return members.some((id) => attendeeOf(party, id)?.status === PartyStatus.CompletePending);
 }
@@ -174,7 +181,7 @@ export class AttendanceService {
       partyId,
       member,
       (party) => leaveParty(party, member.id),
-      () => `<@${member.id}> has left.`,
+      (_party, result) => leftLine(member.id, result),
     );
   }
 
@@ -192,7 +199,7 @@ export class AttendanceService {
       partyId,
       member,
       (party) => finishParty(party, member.id, now, this.options.settings.raidCompleteTimeout),
-      (_party, result) => (result.left ? `<@${member.id}> has left.` : STANDING),
+      (_party, result) => (result.left ? leftLine(member.id, result) : STANDING),
     );
     if (outcome.kind === 'ok' && outcome.asked.length > 0) {
       this.inBackground(this.ask(outcome.party, outcome.asked), partyId, 'ask who completed');
```

Create `src/services/gathered.ts`:

```ts
import { KeyedLock } from './keyed-lock.js';

export interface GatheredOptions<T> {
  /** How long after the last change of a key its message goes out. */
  delayMs: number;
  /** Sends what was gathered for a key. What it throws goes to `onError`. */
  send: (key: string, gathered: T) => Promise<void>;
  onError: (err: unknown, key: string) => void;
}

/**
 * Messages that are gathered: a change that calls for a message does not send it at once but
 * lets it wait, and a change of the same key (a party) that comes sooner starts the wait anew,
 * so that several quick changes are one message with one ping, about how things stand then.
 * The messages of one key go out one after the other, never overtaking each other.
 *
 * What waits is lost when the process stops without `flush` (a clean shutdown calls it).
 */
export class Gathered<T> {
  /** What waits for its delay, by key. */
  private readonly waiting = new Map<string, { gathered: T; cancel: () => void }>();
  /** The messages of one key go out one after the other. */
  private readonly chain = new KeyedLock<string>();
  /** Messages on their way; `flush` waits for them. */
  private readonly background = new Set<Promise<void>>();

  constructor(private readonly options: GatheredOptions<T>) {}

  /**
   * Has the message of `key` sent once nothing has changed for the delay. `merge` gets what was
   * waiting for the key (undefined when nothing was) and answers what waits now.
   */
  later(key: string, merge: (earlier: T | undefined) => T): void {
    const earlier = this.waiting.get(key);
    earlier?.cancel();
    const timer = setTimeout(() => {
      this.now(key);
    }, this.options.delayMs);
    timer.unref();
    this.waiting.set(key, {
      gathered: merge(earlier?.gathered),
      cancel: () => {
        clearTimeout(timer);
      },
    });
  }

  /**
   * Forgets what waits for a key, unsent: for a change that makes what was gathered about it
   * meaningless. What is on its way already still goes out.
   */
  drop(key: string): void {
    this.waiting.get(key)?.cancel();
    this.waiting.delete(key);
  }

  /** Sends what waits for a key, after the messages of that key that are on their way. */
  private now(key: string): void {
    const pending = this.waiting.get(key);
    if (!pending) return;
    pending.cancel();
    this.waiting.delete(key);
    const run = this.chain
      .run(key, () => this.options.send(key, pending.gathered))
      .catch((err: unknown) => {
        this.options.onError(err, key);
      })
      .finally(() => this.background.delete(run));
    this.background.add(run);
  }

  /**
   * Sends everything that waits without waiting for its delay, and waits for what is on its
   * way. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    for (const key of [...this.waiting.keys()]) this.now(key);
    while (this.background.size > 0) await Promise.all(this.background);
  }
}
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -19,6 +19,7 @@ import {
   isTrain,
   membersWhere,
   partyWord,
+  type Change,
   type MeetupParty,
   type Party,
   type RaidBossRef,
@@ -31,7 +32,8 @@ import {
 import { certainMoves, createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
 import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { currentStop } from '../domain/party/train.js';
+import type { NewTimedParty } from '../domain/party/timed.js';
+import { createTrain, currentStop } from '../domain/party/train.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
@@ -103,8 +105,8 @@ export type ReportOutcome =
   /** The gym's region has no forum yet (`/admin setup-forums`). */
   | { kind: 'no-forum'; region: Region };
 
-/** A meetup that a member makes with `/meetup`. */
-export interface MeetupRequest {
+/** A timed party that a member makes: a meetup with `/meetup`, a train with `/train`. */
+export interface TimedRequest {
   /** As the member typed it. */
   name: string;
   /** Snowflake of the member who makes it. */
@@ -115,9 +117,12 @@ export interface MeetupRequest {
   regionChannelId: string;
 }
 
-export type MeetupOutcome =
-  /** A new meetup with its post. */
-  | { kind: 'created'; party: MeetupParty }
+export type MeetupRequest = TimedRequest;
+export type TrainRequest = TimedRequest;
+
+export type TimedOutcome<P extends TimedParty> =
+  /** A new party with its post. */
+  | { kind: 'created'; party: P }
   /** The text is no name (`tidyName`). */
   | { kind: 'bad-name' }
   /** The channel is not the channel of a region of a server. */
@@ -125,6 +130,9 @@ export type MeetupOutcome =
   /** The region has no forum yet (`/admin setup-forums`). */
   | { kind: 'no-forum'; region: Region };
 
+export type MeetupOutcome = TimedOutcome<MeetupParty>;
+export type TrainOutcome = TimedOutcome<TrainParty>;
+
 /** What came of moving a raid to a gym of another region. */
 export type RelocateOutcome =
   /** There is no such active raid. */
@@ -186,7 +194,7 @@ export interface PartyServiceOptions {
 }
 
 /**
- * Parties on Discord: creates the forum post of a reported raid or a new meetup, keeps posts
+ * Parties on Discord: creates the forum post of a reported raid, a new meetup or train, keeps posts
  * and the pinned summary of each forum up to date, and tidies up what went wrong half-way. The
  * parties themselves are in the store; this service is what talks to Discord about them.
  */
@@ -516,17 +524,35 @@ export class PartyService {
    * are not kept apart by anything: two with one name are two meetups. Like a raid, a meetup is
    * never left active without a post, nor a post without its meetup.
    */
-  async createMeetup(request: MeetupRequest): Promise<MeetupOutcome> {
+  createMeetup(request: MeetupRequest): Promise<MeetupOutcome> {
+    return this.createTimed(request, 'meetup', createMeetup);
+  }
+
+  /**
+   * Makes a raid train with its post in the forum of the region it is made in (`/train`), as a
+   * meetup is made: nothing keeps trains apart, and a train is never left active without a
+   * post, nor a post without its train. Its post stays in that forum wherever its route leads.
+   */
+  createTrain(request: TrainRequest): Promise<TrainOutcome> {
+    return this.createTimed(request, 'train', createTrain);
+  }
+
+  /** Makes a timed party of one kind (`make`) with its post; `word` names the kind in the log. */
+  private async createTimed<P extends TimedParty>(
+    request: TimedRequest,
+    word: string,
+    make: (input: NewTimedParty) => Change<P>,
+  ): Promise<TimedOutcome<P>> {
     const { store, regions, log } = this.options;
     const region = regions.byChannel(request.regionChannelId);
     if (!region) return { kind: 'no-region' };
     if (region.guildId === null) {
-      log.warn({ region: region.id }, 'a meetup was made in a region that belongs to no server');
+      log.warn({ region: region.id }, `a ${word} was made in a region that belongs to no server`);
       return { kind: 'no-region' };
     }
     const forumId = region.forumChannelId;
     if (forumId === null) return { kind: 'no-forum', region };
-    const made = createMeetup({
+    const made = make({
       id: crypto.randomUUID(),
       guildId: region.guildId,
       regionId: region.id,
@@ -535,12 +561,12 @@ export class PartyService {
       now: this.now(),
     });
     if (!made.ok) return { kind: 'bad-name' };
-    const meetup = noteMember(made.party, request.creatorId, request.creator ?? {});
+    const party = noteMember(made.party, request.creatorId, request.creator ?? {});
     // The view does not depend on the stored row, so a renderer that fails stores nothing.
-    const rendered = this.rendered({ ...meetup, forumChannelId: forumId });
-    await store.add(meetup);
-    // The row exists; from here on a failure must not leave an active meetup without a post.
-    return this.createTracked(meetup, region, rendered);
+    const rendered = this.rendered({ ...party, forumChannelId: forumId });
+    await store.add(party);
+    // The row exists; from here on a failure must not leave an active party without a post.
+    return this.createTracked(party, region, rendered);
   }
 
   /** `createPostFor`, remembered while it runs: a report of the same gym waits for it. */
```

Apply to `src/services/timed-party-service.ts`:

```diff
--- a/src/services/timed-party-service.ts
+++ b/src/services/timed-party-service.ts
@@ -18,7 +18,7 @@ import { nameOf, setName, setStartTime, setTimedEnd, startTimeOf } from '../doma
 import type { Logger } from '../log.js';
 import { clockOrDay, LIMITS, plain, timestamp, withMentions } from '../render/text.js';
 import type { Member } from './attendance-service.js';
-import { KeyedLock } from './keyed-lock.js';
+import { Gathered } from './gathered.js';
 import { storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
@@ -57,7 +57,6 @@ export interface TimedPartyServiceOptions {
 interface PendingStart {
   before: number | null;
   by: string;
-  cancel: () => void;
 }
 
 /**
@@ -75,14 +74,17 @@ interface PendingStart {
 export class TimedPartyService {
   private readonly now: () => number;
   /** The starts whose announcement is waiting for its delay, by party. */
-  private readonly waiting = new Map<string, PendingStart>();
-  /** The announcements of one party go out one after the other. */
-  private readonly chain = new KeyedLock<string>();
-  /** Announcements on their way; `flush` waits for them. */
-  private readonly background = new Set<Promise<void>>();
+  private readonly starts: Gathered<PendingStart>;
 
   constructor(private readonly options: TimedPartyServiceOptions) {
     this.now = options.now ?? (() => Date.now());
+    this.starts = new Gathered({
+      delayMs: options.announceDelayMs ?? 5_000,
+      send: (partyId, pending) => this.announceStart(partyId, pending.before, pending.by),
+      onError: (err, party) => {
+        options.log.warn({ err, party }, 'could not announce a start time');
+      },
+    });
   }
 
   /** A time as a line names it: with its date when it is not today, and how long until then. */
@@ -168,34 +170,7 @@ export class TimedPartyService {
    * the first of them, so that a start that was put back is not announced at all.
    */
   private announceLater(partyId: string, before: number | null, by: string): void {
-    const earlier = this.waiting.get(partyId);
-    earlier?.cancel();
-    const timer = setTimeout(() => {
-      this.announceNow(partyId);
-    }, this.options.announceDelayMs ?? 5_000);
-    timer.unref();
-    this.waiting.set(partyId, {
-      before: earlier ? earlier.before : before,
-      by,
-      cancel: () => {
-        clearTimeout(timer);
-      },
-    });
-  }
-
-  /** Sends the announcement that is waiting for a party, after those of it that are on their way. */
-  private announceNow(partyId: string): void {
-    const pending = this.waiting.get(partyId);
-    if (!pending) return;
-    pending.cancel();
-    this.waiting.delete(partyId);
-    const run = this.chain
-      .run(partyId, () => this.announceStart(partyId, pending.before, pending.by))
-      .catch((err: unknown) => {
-        this.options.log.warn({ err, party: partyId }, 'could not announce a start time');
-      })
-      .finally(() => this.background.delete(run));
-    this.background.add(run);
+    this.starts.later(partyId, (earlier) => ({ before: earlier ? earlier.before : before, by }));
   }
 
   /**
@@ -266,7 +241,6 @@ export class TimedPartyService {
    * what is on its way. For shutdown and for tests.
    */
   async flush(): Promise<void> {
-    for (const partyId of [...this.waiting.keys()]) this.announceNow(partyId);
-    while (this.background.size > 0) await Promise.all(this.background);
+    await this.starts.flush();
   }
 }
```

Create `src/services/train-service.ts`:

```ts
import type { UserSettings } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { noteMember } from '../domain/party/attendance.js';
import {
  isTrain,
  membersWhere,
  type Change,
  type PartyProblem,
  type RaidBossRef,
  type TrainParty,
} from '../domain/party/party.js';
import {
  addStop,
  clearConductor,
  clearRoute,
  currentStop,
  moveStop,
  moveTrain,
  removeStop,
  routeFinished,
  setConductor,
  setTrainBoss,
  type TrainMove,
  type TrainMoved,
} from '../domain/party/train.js';
import type { Logger } from '../log.js';
import { gymName, type PostGym } from '../render/raid-post.js';
import { LIMITS, plain, withMentions } from '../render/text.js';
import { movementText, type Movement } from '../render/train-panel.js';
import type { Member } from './attendance-service.js';
import { Gathered } from './gathered.js';
import { storedChange } from './party-change.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';

/**
 * What came of a change to a train. `gone`: there is no such active train (a raid or a meetup
 * is none). `refused`: the train stays as it was. `ok`: the train as it is stored now;
 * `changed` is false when it already was so.
 */
export type TrainOutcome<Extra = unknown> =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem }
  | ({ kind: 'ok'; party: TrainParty; changed: boolean } & Extra);

export interface TrainServiceOptions {
  store: PartyStore;
  gateway: Pick<PartyGateway, 'sendMessage'>;
  /** Told after every stored change, to bring the post and the summary up to date. */
  posts: { changed(partyId: string): void };
  /** Where the lines go that ping nobody. */
  lines: Pick<PartyLines, 'say'>;
  /** The members' settings: who lets the bot ping them when the train moves. */
  users: { get(snowflake: string): Promise<UserSettings> };
  /** The gyms, to name the stops. */
  gyms: { get(id: number): PostGym | undefined };
  log: Logger;
  now?: () => number;
  /**
   * How long after the last move of a train the members are told. Default five seconds: Next
   * pressed twice is one message, with one ping, that says where the train is then.
   */
  announceDelayMs?: number;
}

function placeNow(party: TrainParty): Place {
  return { gym: currentStop(party), finished: routeFinished(party), route: party.train.route };
}

/**
 * Movements of a train whose announcement is waiting: where the train was before the first of
 * them, by its gym and not by the number of its stop (an edit of the route changes the numbers
 * while the train stays where it is), and what the steps were.
 */
interface PendingMove {
  /** The gym the train was at before the first step; undefined when it was at none. */
  fromGym: number | undefined;
  /** Whether it had finished its route then, and the route it had. */
  fromFinished: boolean;
  fromRoute: readonly number[];
  /** How many steps are gathered: moves, and edits of the route that moved the train. */
  count: number;
  /** Every one of the steps was Previous: no other move, and no edit that moved the train. */
  onlyBack: boolean;
  /** The last step when it was a move; undefined when it was an edit of the route. */
  last: TrainMoved | undefined;
  /** Who moved the train last. */
  by: string;
}

/** Where a train is, taken inside a change, to tell afterwards whether the change moved it. */
interface Place {
  gym: number | undefined;
  finished: boolean;
  route: readonly number[];
}

/**
 * What members change about a raid train as such: its route, where it is on it, its conductor
 * and the boss it is after. It is to a train what `RaidChangeService` is to a raid (its name
 * and its times are `TimedPartyService`'s, its members `AttendanceService`'s): every method
 * decides inside the store, has the post shown anew and says in the post who changed what, in
 * a line that pings nobody; the caller tells the member privately.
 *
 * A movement of the train is the one thing that pings: everybody else who is signed up and
 * allows it (`mentions` and `mentionsTrainStops`) is told where the train is going, in a message
 * of its own. A movement is a move (`move`) and every edit of the route after which the train is
 * somewhere else (the stop it was at was removed, a stop was added to a finished route). That
 * message is gathered (`Gathered`): it goes out a few seconds after the last movement and says
 * where the train is then. Earlier ones stay in the post: it is a feed.
 */
export class TrainService {
  private readonly now: () => number;
  private readonly moves: Gathered<PendingMove>;

  constructor(private readonly options: TrainServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.moves = new Gathered({
      delayMs: options.announceDelayMs ?? 5_000,
      send: (partyId, pending) => this.announceMove(partyId, pending),
      onError: (err, party) => {
        options.log.warn({ err, party }, 'could not announce where a train is going');
      },
    });
  }

  /** A gym as a line names it. */
  private named(gymId: number): string {
    return `**${plain(gymName(this.options.gyms.get(gymId)))}**`;
  }

  /**
   * Adds a gym to the end of the route (`addStop`): for a member who is signed up; refused for
   * a gym that is on the route already. `number` is the number of the new stop. A stop added
   * to a finished route is where the train then goes (`moved`): that takes the right to move
   * the train (`staff` says whether the member is staff), and the others are told. The first
   * stop of a route is an ordinary edit: a line, and no announcement.
   */
  addStop(
    partyId: string,
    member: Member,
    gymId: number,
    staff = false,
  ): Promise<TrainOutcome<{ number: number; moved: boolean }>> {
    return this.movable(
      partyId,
      member,
      (party) => addStop(party, member.id, gymId, staff),
      (_party, added) =>
        `<@${member.id}> added stop ${added.number} to the route: ${this.named(gymId)}.`,
    );
  }

  /**
   * Takes the stop with this number off the route (`removeStop`); `gymId` is the gym it was.
   * Removing the stop the train is at moves the train (`moved`), as for `addStop`.
   */
  removeStop(
    partyId: string,
    member: Member,
    number: number,
    staff = false,
  ): Promise<TrainOutcome<{ gymId: number; moved: boolean }>> {
    return this.movable(
      partyId,
      member,
      (party) => removeStop(party, member.id, number, staff),
      (_party, removed) => `<@${member.id}> took ${this.named(removed.gymId)} off the route.`,
    );
  }

  /** Moves the stop with the number `from` to the number `to` (`moveStop`). */
  moveStop(
    partyId: string,
    member: Member,
    from: number,
    to: number,
    staff = false,
  ): Promise<TrainOutcome<{ gymId: number }>> {
    return this.apply(
      partyId,
      member,
      (party) => moveStop(party, member.id, from, to, staff),
      (_party, moved) =>
        `<@${member.id}> moved ${this.named(moved.gymId)} to stop ${to} of the route.`,
    );
  }

  /** Empties the route (`clearRoute`): for the conductor, and for staff (`staff`). */
  clearRoute(
    partyId: string,
    member: Member,
    staff: boolean,
  ): Promise<TrainOutcome<{ moved: boolean }>> {
    return this.movable(
      partyId,
      member,
      (party) => clearRoute(party, member.id, staff),
      () => `<@${member.id}> cleared the route.`,
    );
  }

  /**
   * Moves the train along its route (`moveTrain`): for the conductor and for staff, or without
   * a conductor for anybody who is signed up. Everybody who was here is coming again, unless the
   * route is finished by it. The others are told a moment later where the train is going.
   *
   * `from` is for a control that was drawn while the train was at some place (`placeOf`): the
   * move is refused (`train-moved-on`) when the train is no longer there. `target` is where
   * that control said the move leads (`targetOf`): refused (`route-changed`) when it no longer
   * does.
   */
  async move(
    partyId: string,
    member: Member,
    move: TrainMove,
    staff: boolean,
    from?: string,
    target?: string,
  ): Promise<TrainOutcome<TrainMoved>> {
    let start: Place | undefined;
    const outcome = await this.apply(partyId, member, (party) => {
      start = placeNow(party);
      return moveTrain(party, member.id, move, staff, from, target);
    });
    if (outcome.kind === 'ok' && outcome.changed && start) {
      const { party: _party, kind: _kind, changed: _changed, ...last } = outcome;
      this.movedFrom(partyId, start, member.id, last);
    }
    return outcome;
  }

  /**
   * Runs an edit of the route that can move the train (its change answers `moved`), and has the
   * others told where the train is when it did.
   */
  private async movable<Extra extends { moved: boolean }>(
    partyId: string,
    member: Member,
    change: (party: TrainParty) => Change<TrainParty, Extra>,
    line: (party: TrainParty, result: Extra) => string | undefined,
  ): Promise<TrainOutcome<Extra>> {
    let start: Place | undefined;
    const outcome = await this.apply(
      partyId,
      member,
      (party) => {
        start = placeNow(party);
        return change(party);
      },
      line,
    );
    if (outcome.kind === 'ok' && outcome.changed) {
      // A train without a route is nowhere: what was to be said of where it went is void, and
      // the first stop it gets afterwards is no movement.
      if (outcome.party.train.route.length === 0) this.moves.drop(partyId);
      else if (outcome.moved && start) this.movedFrom(partyId, start, member.id, undefined);
    }
    return outcome;
  }

  /** Notes a movement of a train for the announcement that is gathered. */
  private movedFrom(partyId: string, start: Place, by: string, last: TrainMoved | undefined): void {
    this.moves.later(partyId, (earlier) => ({
      fromGym: earlier ? earlier.fromGym : start.gym,
      fromFinished: earlier ? earlier.fromFinished : start.finished,
      fromRoute: earlier ? earlier.fromRoute : start.route,
      count: (earlier?.count ?? 0) + 1,
      onlyBack: (earlier?.onlyBack ?? true) && last?.move === 'previous',
      last,
      by,
    }));
  }

  /**
   * Makes the member the conductor (`setConductor`): they must be signed up, and may take it
   * over from another conductor, which the post says by name. `previous` is who it was before.
   */
  setConductor(
    partyId: string,
    member: Member,
  ): Promise<TrainOutcome<{ previous: string | null }>> {
    return this.apply(
      partyId,
      member,
      (party) => setConductor(party, member.id),
      (_party, set) =>
        set.previous === null
          ? `<@${member.id}> is the conductor of this train now.`
          : `<@${member.id}> is the conductor of this train now, in the place of <@${set.previous}>.`,
    );
  }

  /**
   * Leaves the train without a conductor (`clearConductor`): for the conductor themself, and
   * for staff. `previous` is who it was.
   */
  clearConductor(
    partyId: string,
    member: Member,
    staff: boolean,
  ): Promise<TrainOutcome<{ previous: string | null }>> {
    return this.apply(
      partyId,
      member,
      (party) => clearConductor(party, member.id, staff),
      (_party, cleared) =>
        cleared.previous === member.id || cleared.previous === null
          ? `<@${member.id}> is no longer the conductor of this train.`
          : `<@${member.id}> took <@${cleared.previous}> off as the conductor of this train.`,
    );
  }

  /**
   * The Pokémon the train is after, or none with null (`setTrainBoss`). Anybody in the post
   * may, as in a raid. `label` is how the line names the boss, made plain by the caller.
   */
  setBoss(
    partyId: string,
    member: Member,
    change: { boss: RaidBossRef | null; label: string },
  ): Promise<TrainOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => setTrainBoss(party, change.boss),
      () =>
        change.boss === null
          ? `<@${member.id}> removed the boss of this train.`
          : `<@${member.id}> set the boss this train is after: **${change.label}**.`,
    );
  }

  /**
   * How the train got from where it was before the movements that were gathered to where it is
   * now; undefined when there is nothing to tell. It goes by gyms: the numbers of the stops
   * change with every edit of the route.
   *
   * Nothing on an empty route, and nothing when the train is where it was (a move that was
   * taken back). A finished route is said unless it was finished before. "Back" is said of a
   * train that had finished and is at a gym of the route it had then, and otherwise only when
   * every step was Previous: after a Next, a Skip or an edit that moved the train, it is
   * "moving to" wherever it is. "Skipping" is said only of one Skip whose target is where the
   * train is.
   */
  private movement(party: TrainParty, pending: PendingMove): Movement | undefined {
    const { gyms } = this.options;
    const { route } = party.train;
    const { last, by } = pending;
    if (route.length === 0) return undefined;
    if (routeFinished(party)) return pending.fromFinished ? undefined : { kind: 'finished', by };
    const here = currentStop(party);
    if (here === undefined) return undefined;
    if (!pending.fromFinished && here === pending.fromGym) return undefined;
    const at = gyms.get(here);
    if (pending.count === 1 && last?.move === 'skip' && last.at === here) {
      const skipped = last.skipped === undefined ? undefined : gyms.get(last.skipped);
      return { kind: 'skip', at, skipped, by };
    }
    const back = pending.fromFinished ? pending.fromRoute.includes(here) : pending.onlyBack;
    return { kind: back ? 'back' : 'to', at, by };
  }

  /**
   * Says where a train is going to everybody else who is signed up; those who allow it are
   * pinged. It is said also when nobody else is signed up: the post is the record of the train.
   */
  private async announceMove(partyId: string, pending: PendingMove): Promise<void> {
    const { store, gateway, users } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId ?? null;
    if (!party || !isTrain(party) || postId === null) return;
    const movement = this.movement(party, pending);
    if (!movement) return;
    const others = membersWhere(party, (_attendee, id) => id !== pending.by);
    const settings = await Promise.all(others.map((id) => users.get(id).catch(() => undefined)));
    const pingable = others
      .filter((_id, index) => {
        const found = settings[index];
        return found !== undefined && found.mentions && found.mentionsTrainStops;
      })
      .slice(0, LIMITS.pings);
    // A message into the post of a party that has ended would open an archived post again.
    if (!store.get(partyId)) return;
    await gateway.sendMessage(postId, withMentions(movementText(movement), pingable));
  }

  /**
   * Runs one change of a train, decided inside the store; a party that is no train is `gone`.
   * The member's name and team are noted with it when they are signed up. `line` is said in the
   * post, pinging nobody, when the change was stored.
   */
  private async apply<Extra>(
    partyId: string,
    member: Member,
    change: (party: TrainParty, now: number) => Change<TrainParty, Extra>,
    line?: (party: TrainParty, result: Extra) => string | undefined,
  ): Promise<TrainOutcome<Extra>> {
    const { store, posts, lines } = this.options;
    const stored = await storedChange<TrainParty, Extra>(store, partyId, isTrain, (party) => {
      const changed = change(party, this.now());
      if (!changed.ok || changed.party === party) return changed;
      return { ...changed, party: noteMember(changed.party, member.id, member) };
    });
    if (stored.kind === 'gone') return { kind: 'gone' };
    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.refusal.reason };
    const { party } = stored;
    if (stored.written) {
      posts.changed(partyId);
      const text = line?.(party, stored.extra);
      if (text !== undefined && party.forumPostId !== null) lines.say(party.forumPostId, text);
    }
    return { ...stored.extra, kind: 'ok', party, changed: stored.written };
  }

  /**
   * Sends the announcements that are waiting without waiting for their delay, and waits for
   * what is on its way. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    await this.moves.flush();
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/access-service.test.ts src/services/gathered.test.ts src/services/party-service.train.test.ts src/services/train-service.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff ade129e -- src test   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/services/access-service.test.ts src/services/attendance-service.ts src/services/gathered.test.ts src/services/gathered.ts src/services/party-service.train.test.ts src/services/party-service.ts src/services/timed-party-service.ts src/services/train-service.test.ts src/services/train-service.ts test/support/party-service.ts test/support/test-context.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/app.ts src/services/access-service.test.ts src/services/attendance-service.ts src/services/gathered.test.ts src/services/gathered.ts src/services/party-service.train.test.ts src/services/party-service.ts src/services/timed-party-service.ts src/services/train-service.test.ts src/services/train-service.ts test/support/party-service.ts test/support/test-context.ts
git commit -m "Trains on Discord: createTrain, the train service, the clock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,446 unit tests.

---

### Task 7: Saved routes: the repository, a store in memory for tests, save, load, forget

**Files:**
- Create: `src/db/repositories/saved-route-repository.db.test.ts`, `src/db/repositories/saved-route-repository.ts`, `src/services/train-service.routes.test.ts`, `test/support/saved-routes.ts`
- Modify: `src/app.ts`, `src/services/train-service.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: The legacy table `SavedRoutes` (`src/db/types.ts`), `UserRepository`, `inTransaction`, Task 6's `TrainService` and `replaceRoute`.
- Produces: `SavedRouteRepository` (`list`, `get`, `save`, `remove`), `SavedRoute`, `SaveRouteOutcome`, `SavedRouteStorage`, `MAX_SAVED_ROUTES`, `routeGyms` (`src/db/repositories/saved-route-repository.ts`); `TrainService.saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`; `MemorySavedRoutes` (`test/support/saved-routes.ts`), `SAVED_ROUTE_CHOICE`; the repository wired in `src/app.ts`.

No schema change. Rows the legacy bot wrote (a null name, an empty `gyms`, ids as text, gyms that are gone) are read without failing. `save` and `remove` lock the member's `User` row first; whether that row exists is read before the transaction.

Reference commit of the prototype for this task: `f2f8444`.

- [ ] **Step 1: Write the failing tests**

Create `src/db/repositories/saved-route-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { MAX_SAVED_ROUTES, routeGyms, SavedRouteRepository } from './saved-route-repository.js';
import { UserRepository } from './user-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const WEST = 1;
const EAST = 2;

describe('SavedRouteRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let routes: SavedRouteRepository;
  let users: UserRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    routes = new SavedRouteRepository(db);
    users = new UserRepository(db);
    await sql`insert into Guild (id, snowflake) values (1, '412345678901234567')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788), (2, 1, 1234567890123456789)`.execute(
      db,
    );
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('SavedRoutes').execute();
    await db.deleteFrom('User').execute();
  });

  it('saves a route for a member and a region, and gives the member their row', async () => {
    expect(await routes.list(ALICE, WEST)).toEqual([]);
    expect(await users.idFor(ALICE)).toBeUndefined();
    const saved = await routes.save(ALICE, WEST, 'Downtown loop', [4, 1, 7]);
    expect(saved).toEqual({
      kind: 'saved',
      route: { id: expect.any(Number) as number, name: 'Downtown loop', gyms: [4, 1, 7] },
    });
    expect(await routes.list(ALICE, WEST)).toEqual([
      { id: saved.kind === 'saved' ? saved.route.id : 0, name: 'Downtown loop', gyms: [4, 1, 7] },
    ]);
    const row = await db.selectFrom('SavedRoutes').selectAll().executeTakeFirstOrThrow();
    // As the legacy bot wrote it: the member by their row id, the gyms as text.
    expect(row).toMatchObject({
      userId: await users.idFor(ALICE),
      region: WEST,
      name: 'Downtown loop',
      gyms: '4,1,7',
    });
  });

  it('keeps the settings of a member who has a row already', async () => {
    await users.update(ALICE, { mentionsTrainStops: false });
    const id = await users.idFor(ALICE);
    await routes.save(ALICE, WEST, 'Loop', [1]);
    expect(await users.idFor(ALICE)).toBe(id);
    expect((await users.get(ALICE)).mentionsTrainStops).toBe(false);
    expect(await db.selectFrom('User').select('id').execute()).toHaveLength(1);
  });

  it('uses up no id of the User table for a member who has a row', async () => {
    const alice = await users.ensure(ALICE);
    for (let n = 0; n < 3; n++) await routes.save(ALICE, WEST, `Route ${n}`, [n + 1]);
    await routes.save(ALICE, WEST, 'Route 1', [9]);
    // The next member gets the next id: saving did not take any in between.
    expect(await users.ensure(BOB)).toBe(alice + 1);
  });

  it('saves and removes at the same moment without one waiting for the other for good', async () => {
    const saved = await routes.save(ALICE, WEST, 'Loop', [1]);
    if (saved.kind !== 'saved') throw new Error(saved.kind);
    const [replaced, removed, another] = await Promise.all([
      routes.save(ALICE, WEST, 'Loop', [2]),
      routes.remove(ALICE, WEST, saved.route.id),
      routes.save(ALICE, WEST, 'Other', [3]),
    ]);
    // Whichever came first: the route was replaced and removed, or removed and saved anew.
    expect(['replaced', 'saved']).toContain(replaced.kind);
    expect(another.kind).toBe('saved');
    const left = (await routes.list(ALICE, WEST)).map((route) => route.name);
    expect(left).toEqual(removed && replaced.kind === 'replaced' ? ['Other'] : ['Loop', 'Other']);
  });

  it('lists the routes of one member in one region, by name', async () => {
    await routes.save(ALICE, WEST, 'River walk', [2, 3]);
    await routes.save(ALICE, WEST, 'Downtown loop', [4]);
    await routes.save(ALICE, EAST, 'Harbour', [8, 9]);
    await routes.save(BOB, WEST, 'Bob’s round', [5]);
    expect((await routes.list(ALICE, WEST)).map((route) => route.name)).toEqual([
      'Downtown loop',
      'River walk',
    ]);
    expect((await routes.list(ALICE, EAST)).map((route) => route.name)).toEqual(['Harbour']);
    expect((await routes.list(BOB, WEST)).map((route) => route.name)).toEqual(['Bob’s round']);
    expect(await routes.list(BOB, EAST)).toEqual([]);
  });

  it('replaces the route of the same name, whatever its case, and keeps its id', async () => {
    const first = await routes.save(ALICE, WEST, 'Downtown loop', [4, 1]);
    const again = await routes.save(ALICE, WEST, 'downtown LOOP', [7]);
    if (first.kind !== 'saved' || again.kind !== 'replaced') throw new Error('not replaced');
    expect(again.route).toEqual({ id: first.route.id, name: 'downtown LOOP', gyms: [7] });
    expect(await routes.list(ALICE, WEST)).toEqual([again.route]);
    // The same name in another region, or by another member, is another route.
    expect((await routes.save(ALICE, EAST, 'Downtown loop', [8])).kind).toBe('saved');
    expect((await routes.save(BOB, WEST, 'Downtown loop', [5])).kind).toBe('saved');
    expect(await routes.list(ALICE, WEST)).toEqual([again.route]);
  });

  it('holds twenty-five routes per member and region: the next is refused, a namesake replaced', async () => {
    for (let n = 0; n < MAX_SAVED_ROUTES; n++) {
      expect((await routes.save(ALICE, WEST, `Route ${n}`, [n + 1])).kind).toBe('saved');
    }
    expect(await routes.save(ALICE, WEST, 'One more', [1])).toEqual({ kind: 'full' });
    expect(await routes.list(ALICE, WEST)).toHaveLength(MAX_SAVED_ROUTES);
    expect((await routes.save(ALICE, WEST, 'Route 3', [9, 8])).kind).toBe('replaced');
    // Another region and another member have their own.
    expect((await routes.save(ALICE, EAST, 'One more', [1])).kind).toBe('saved');
    expect((await routes.save(BOB, WEST, 'One more', [1])).kind).toBe('saved');
  });

  it('saves one route when the same name is saved twice at once', async () => {
    const both = await Promise.all([
      routes.save(ALICE, WEST, 'Loop', [1]),
      routes.save(ALICE, WEST, 'Loop', [2]),
    ]);
    expect(both.map((outcome) => outcome.kind).sort()).toEqual(['replaced', 'saved']);
    expect(await routes.list(ALICE, WEST)).toHaveLength(1);
  });

  it('gets and removes a route only for the member and region it belongs to', async () => {
    const saved = await routes.save(ALICE, WEST, 'Downtown loop', [4, 1]);
    if (saved.kind !== 'saved') throw new Error(saved.kind);
    const { id } = saved.route;
    expect(await routes.get(ALICE, WEST, id)).toEqual(saved.route);
    expect(await routes.get(BOB, WEST, id)).toBeUndefined();
    expect(await routes.get(ALICE, EAST, id)).toBeUndefined();
    expect(await routes.get(ALICE, WEST, id + 99)).toBeUndefined();
    expect(await routes.remove(BOB, WEST, id)).toBeUndefined();
    expect(await routes.remove(ALICE, EAST, id)).toBeUndefined();
    expect(await routes.list(ALICE, WEST)).toHaveLength(1);
    expect(await routes.remove(ALICE, WEST, id)).toEqual(saved.route);
    expect(await routes.remove(ALICE, WEST, id)).toBeUndefined();
    expect(await routes.list(ALICE, WEST)).toEqual([]);
  });

  it('reads what the legacy bot wrote: no name, no gyms, a gym twice, what is no id', async () => {
    const userId = await users.ensure(ALICE);
    await sql`insert into SavedRoutes (userId, region, name, gyms) values
      (${userId}, 1, null, ''),
      (${userId}, 1, 'Twice', '12,45,12, 9'),
      (${userId}, 1, 'Odd', '7,,x,0,-3,[object Object],8'),
      (${userId}, 1, 'Twice', null)`.execute(db);
    expect((await routes.list(ALICE, WEST)).map(({ name, gyms }) => ({ name, gyms }))).toEqual([
      { name: '', gyms: [] },
      { name: 'Odd', gyms: [7, 8] },
      { name: 'Twice', gyms: [12, 45, 9] },
      { name: 'Twice', gyms: [] },
    ]);
    // Of two rows with one name (the legacy bot made such) the older one is replaced.
    const replaced = await routes.save(ALICE, WEST, 'Twice', [1, 2]);
    expect(replaced.kind).toBe('replaced');
    expect((await routes.list(ALICE, WEST)).map((route) => route.gyms)).toEqual([
      [],
      [7, 8],
      [1, 2],
      [],
    ]);
  });

  it('loses the routes of a region or a member that is deleted', async () => {
    await sql`insert into Region (id, guildId, channelId) values (9, 1, 1234567890123456000)`.execute(
      db,
    );
    await routes.save(ALICE, 9, 'Gone with it', [1]);
    await routes.save(ALICE, WEST, 'Stays', [1]);
    await sql`delete from Region where id = 9`.execute(db);
    expect(await db.selectFrom('SavedRoutes').select('name').execute()).toEqual([
      { name: 'Stays' },
    ]);
    await db.deleteFrom('User').execute();
    expect(await db.selectFrom('SavedRoutes').select('name').execute()).toEqual([]);
  });
});

describe('routeGyms', () => {
  it('reads ids separated by commas and leaves out what is none', () => {
    expect(routeGyms('12,45,9')).toEqual([12, 45, 9]);
    expect(routeGyms('')).toEqual([]);
    expect(routeGyms(null)).toEqual([]);
    expect(routeGyms(' 3 , 3,4,x,1e3,99999999999999999999')).toEqual([3, 4]);
  });
});
```

Create `src/services/train-service.routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, testGyms } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
import { createdMeetup, createdTrain } from '../../test/support/party-service.js';
import { MAX_SAVED_ROUTES } from '../db/repositories/saved-route-repository.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PostGym } from '../render/raid-post.js';
import type { Member } from './attendance-service.js';
import { TrainService } from './train-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const WEST = 1;

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** A train on a route, with Alice coming beside the member who made it. */
async function boarded(route: readonly number[] = [4, 1, 7]): Promise<Made> {
  const made = await createdTrain({ route });
  await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  return made;
}

const lines = async (made: Made): Promise<string[]> => {
  await made.attendance.flush();
  return made.said().join('\n').split('\n').filter(Boolean);
};

describe('TrainService.saveRoute', () => {
  it('saves the route of the train for the member and the region of the train', async () => {
    const made = await boarded();
    const before = made.current();
    const saved = await made.trains.saveRoute(made.party.id, alice, '  Downtown   loop ');
    expect(saved).toEqual({
      kind: 'saved',
      route: { id: expect.any(Number) as number, name: 'Downtown loop', gyms: [4, 1, 7] },
    });
    expect(made.routes.rows).toMatchObject([
      { memberId: ALICE, regionId: WEST, name: 'Downtown loop', gyms: [4, 1, 7] },
    ]);
    // It changes nothing about the train, and nothing is said.
    expect(made.current()).toBe(before);
    expect(await lines(made)).toEqual([]);
  });

  it('saves the whole route, wherever the train is on it, for anybody in the post', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'finish', false);
    expect(await made.trains.saveRoute(made.party.id, carol, 'Loop')).toMatchObject({
      kind: 'saved',
      route: { gyms: [4, 1, 7] },
    });
    expect(made.routes.rows[0]?.memberId).toBe(CAROL);
  });

  it('replaces the member’s route of the same name, and nobody else’s', async () => {
    const made = await boarded();
    const first = await made.trains.saveRoute(made.party.id, alice, 'Loop');
    await made.trains.saveRoute(made.party.id, bob, 'Loop');
    await made.trains.addStop(made.party.id, alice, 2);
    const again = await made.trains.saveRoute(made.party.id, alice, 'loop');
    expect(again).toMatchObject({ kind: 'replaced', route: { name: 'loop', gyms: [4, 1, 7, 2] } });
    expect(again.kind === 'replaced' && first.kind === 'saved' && again.route.id).toBe(
      first.kind === 'saved' && first.route.id,
    );
    expect(made.routes.rows.map((row) => [row.memberId, row.gyms.length])).toEqual([
      [ALICE, 4],
      [BOB, 3],
    ]);
  });

  it('refuses a train without a route, and a text that is no name', async () => {
    const made = await createdTrain();
    expect(await made.trains.saveRoute(made.party.id, alice, 'Loop')).toEqual({
      kind: 'refused',
      reason: 'empty-route',
    });
    const routed = await boarded();
    for (const name of ['   ', 'x'.repeat(81)]) {
      expect(await routed.trains.saveRoute(routed.party.id, alice, name)).toEqual({
        kind: 'refused',
        reason: 'bad-name',
      });
    }
    expect(routed.routes.rows).toEqual([]);
  });

  it('refuses the twenty-sixth route of a member in a region', async () => {
    const made = await boarded();
    for (let n = 0; n < MAX_SAVED_ROUTES; n++) made.routes.add(ALICE, WEST, `Route ${n}`, [1]);
    expect(await made.trains.saveRoute(made.party.id, alice, 'One more')).toEqual({ kind: 'full' });
    expect(await made.trains.saveRoute(made.party.id, alice, 'Route 7')).toMatchObject({
      kind: 'replaced',
    });
    expect(await made.trains.saveRoute(made.party.id, bob, 'One more')).toMatchObject({
      kind: 'saved',
    });
  });

  it('finds no train in a meetup, or where there is no party', async () => {
    const made = await createdMeetup();
    expect(await made.trains.saveRoute(made.party.id, alice, 'Loop')).toEqual({ kind: 'gone' });
    expect(await made.trains.saveRoute('no-such-party', alice, 'Loop')).toEqual({ kind: 'gone' });
    expect(await made.trains.savedRoutes(made.party.id, ALICE)).toEqual([]);
  });
});

describe('TrainService.loadRoute', () => {
  it('replaces the route by the saved one and starts at its first stop', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    const saved = made.routes.add(ALICE, WEST, 'River *walk*', [2, 3, 11]);
    const outcome = await made.trains.loadRoute(made.party.id, alice, saved.id);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, route: saved, missing: 0 });
    expect(made.current().train).toMatchObject({ route: [2, 3, 11], stop: 0 });
    expect((await lines(made)).at(-1)).toBe(
      `<@${ALICE}> loaded the route **River \\*walk\\***: 3 stops. The train is at the first.`,
    );
  });

  it('leaves out gyms that no longer exist, and says how many', async () => {
    const made = await boarded();
    const saved = made.routes.add(ALICE, WEST, 'Old round', [2, 998, 3, 999]);
    const outcome = await made.trains.loadRoute(made.party.id, alice, saved.id);
    expect(outcome).toMatchObject({ kind: 'ok', missing: 2 });
    expect(made.current().train.route).toEqual([2, 3]);
    const gone = made.routes.add(ALICE, WEST, 'All gone', [998, 999]);
    expect(await made.trains.loadRoute(made.party.id, alice, gone.id)).toEqual({
      kind: 'refused',
      reason: 'empty-route',
    });
    expect(made.current().train.route).toEqual([2, 3]);
  });

  it('is for a member who is signed up, and only with a route of their own for this region', async () => {
    const made = await boarded();
    const mine = made.routes.add(ALICE, WEST, 'Mine', [2]);
    const east = made.routes.add(ALICE, 2, 'Of East', [8]);
    const carols = made.routes.add(CAROL, WEST, 'Hers', [3]);
    expect(await made.trains.loadRoute(made.party.id, alice, east.id)).toEqual({ kind: 'none' });
    expect(await made.trains.loadRoute(made.party.id, alice, carols.id)).toEqual({ kind: 'none' });
    expect(await made.trains.loadRoute(made.party.id, alice, 12345)).toEqual({ kind: 'none' });
    expect(await made.trains.loadRoute(made.party.id, carol, carols.id)).toEqual({
      kind: 'refused',
      reason: 'not-attending',
    });
    expect(made.current().train.route).toEqual([4, 1, 7]);
    expect(await made.trains.loadRoute(made.party.id, alice, mine.id)).toMatchObject({
      kind: 'ok',
    });
  });

  it('goes by the region the train was made in', async () => {
    const made = await createdTrain({ regionChannelId: EAST_CHANNEL });
    const west = made.routes.add(REPORTER, WEST, 'Of West', [2]);
    const east = made.routes.add(REPORTER, 2, 'Of East', [8, 9]);
    expect(await made.trains.savedRoutes(made.party.id, REPORTER)).toEqual([east]);
    expect(await made.trains.loadRoute(made.party.id, { id: REPORTER }, west.id)).toEqual({
      kind: 'none',
    });
    expect(await made.trains.loadRoute(made.party.id, { id: REPORTER }, east.id)).toMatchObject({
      kind: 'ok',
    });
  });

  it('reads what the legacy bot left: a gym twice counts once, a route without a name is named so', async () => {
    const made = await boarded();
    const odd = made.routes.add(ALICE, WEST, '', [2, 3, 2]);
    expect(await made.trains.loadRoute(made.party.id, alice, odd.id)).toMatchObject({ kind: 'ok' });
    expect(made.current().train.route).toEqual([2, 3]);
    expect((await lines(made)).at(-1)).toContain('loaded a saved route without a name: 2 stops.');
  });
});

describe('TrainService: the saved routes of a member', () => {
  it('lists them by name for the region of the train, and forgets one', async () => {
    const made = await boarded();
    const river = made.routes.add(ALICE, WEST, 'River walk', [2, 3]);
    const downtown = made.routes.add(ALICE, WEST, 'downtown loop', [4]);
    made.routes.add(BOB, WEST, 'Bob’s', [5]);
    expect(await made.trains.savedRoutes(made.party.id, ALICE)).toEqual([downtown, river]);
    expect(await made.trains.forgetRoute(made.party.id, BOB, river.id)).toBeUndefined();
    expect(await made.trains.forgetRoute(made.party.id, ALICE, river.id)).toEqual(river);
    expect(await made.trains.forgetRoute(made.party.id, ALICE, river.id)).toBeUndefined();
    expect(await made.trains.savedRoutes(made.party.id, ALICE)).toEqual([downtown]);
    expect(made.routes.rows).toHaveLength(2);
  });
});

describe('TrainService.loadRoute as a movement of the train', () => {
  /** The messages in the post that announce a movement: those carry mentions. */
  const announced = async (made: Made): Promise<string[]> => {
    await made.trains.flush();
    await made.attendance.flush();
    return made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.mention)
      .map((message) => (message.message.content ?? '').split('\n')[0] ?? '');
  };

  it('takes the right to move the train: with a conductor only they and staff may load', async () => {
    const made = await boarded();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, alice);
    const saved = made.routes.add(BOB, WEST, 'Bob’s', [2, 3]);
    expect(await made.trains.loadRoute(made.party.id, bob, saved.id)).toEqual({
      kind: 'refused',
      reason: 'not-conductor',
    });
    expect(made.current().train.route).toEqual([4, 1, 7]);
    expect(await made.trains.loadRoute(made.party.id, bob, saved.id, true)).toMatchObject({
      kind: 'ok',
      moved: true,
    });
    expect(made.current().train).toMatchObject({ route: [2, 3], stop: 0, conductorId: ALICE });
  });

  it('puts who is here back to coming and tells the others where the train is', async () => {
    const made = await boarded();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    const saved = made.routes.add(ALICE, WEST, 'Other way', [2, 3]);
    await made.trains.loadRoute(made.party.id, alice, saved.id);
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Coming);
    expect(await announced(made)).toEqual([
      'The train is moving to [Old Stone Fountain](<https://www.google.com/maps/search/?api=1&query=40.06%2C-80.06>). ' +
        `Moved by <@${ALICE}>.`,
    ]);
  });

  it('says where the train is when a route is loaded right after a move: no "back", no unknown gym', async () => {
    const made = await boarded();
    // The saved route has the gym the train started from further on.
    const saved = made.routes.add(ALICE, WEST, 'Other way', [2, 3, 4]);
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.loadRoute(made.party.id, alice, saved.id);
    const said = await announced(made);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^The train is moving to \[Old Stone Fountain\]/);
  });

  it('says nothing of a route that begins where the train is', async () => {
    const made = await boarded();
    const saved = made.routes.add(ALICE, WEST, 'Same start', [4, 3]);
    expect(await made.trains.loadRoute(made.party.id, alice, saved.id)).toMatchObject({
      kind: 'ok',
      changed: true,
      moved: false,
    });
    expect(await announced(made)).toEqual([]);
  });
});

describe('TrainService.loadRoute into a train without a route', () => {
  it('is said in a line and announced to nobody, but takes the right to move the train', async () => {
    const made = await createdTrain();
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
    await made.trains.setConductor(made.party.id, alice);
    const bobs = made.routes.add(BOB, WEST, 'Bob’s', [2, 3]);
    const mine = made.routes.add(ALICE, WEST, 'Mine', [2, 3]);
    expect(await made.trains.loadRoute(made.party.id, bob, bobs.id)).toEqual({
      kind: 'refused',
      reason: 'not-conductor',
    });
    expect(await made.trains.loadRoute(made.party.id, alice, mine.id)).toMatchObject({
      kind: 'ok',
      changed: true,
      moved: false,
    });
    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
    await made.trains.flush();
    expect((await lines(made)).at(-1)).toBe(
      `<@${ALICE}> loaded the route **Mine**: 2 stops. The train is at the first.`,
    );
    expect(
      made.gateway.messagesIn(made.postId).filter((message) => message.message.mention),
    ).toEqual([]);
  });

  it('says "moving to", not "back", when a Previous is followed by a loaded route', async () => {
    const made = await boarded();
    await made.trains.move(made.party.id, alice, 'next', false);
    await made.trains.flush();
    const saved = made.routes.add(ALICE, WEST, 'Other way', [2, 3, 1]);
    await made.trains.move(made.party.id, alice, 'previous', false);
    await made.trains.loadRoute(made.party.id, alice, saved.id);
    await made.trains.flush();
    const said = made.gateway
      .messagesIn(made.postId)
      .filter((message) => message.message.mention)
      .map((message) => (message.message.content ?? '').split('\n')[0]);
    expect(said.at(-1)).toMatch(/^The train is moving to \[Old Stone Fountain\]/);
  });

  it('says the line of a route without a name as a sentence', async () => {
    const made = await boarded();
    const odd = made.routes.add(ALICE, WEST, '', [2, 3]);
    await made.trains.loadRoute(made.party.id, alice, odd.id);
    expect((await lines(made)).at(-1)).toBe(
      `<@${ALICE}> loaded a saved route without a name: 2 stops. The train is at the first.`,
    );
  });
});

describe('TrainService.saveRoute with a name that reads like a choice of the list', () => {
  it('refuses `id:` and digits, in any case', async () => {
    const made = await boarded();
    for (const name of ['id:7', 'ID:12', ' Id:0042 ']) {
      expect(await made.trains.saveRoute(made.party.id, alice, name)).toEqual({
        kind: 'refused',
        reason: 'name-like-choice',
      });
    }
    expect(made.routes.rows).toEqual([]);
    // What only looks a little like one is a name.
    for (const name of ['id:', 'id: 7', 'id:7a', 'grid:7']) {
      expect((await made.trains.saveRoute(made.party.id, alice, name)).kind).toBe('saved');
    }
  });
});

describe('TrainService.loadRoute with a route longer than a route may be', () => {
  it('cuts it to fifty stops and says how many did not fit', async () => {
    const made = await boarded();
    // Every gym exists for this service: the invented town has twelve.
    const trains = new TrainService({
      store: made.store,
      gateway: made.gateway,
      posts: made.service,
      lines: made.lines,
      users: made.users,
      gyms: { get: (id) => ({ ...testGyms()[0], id, name: `Gym ${id}` }) as PostGym },
      routes: made.routes,
      log: made.log,
      now: () => made.clock.now,
      announceDelayMs: 3_600_000,
    });
    const long = Array.from({ length: 53 }, (_, index) => 100 + index);
    const saved = made.routes.add(ALICE, WEST, 'Marathon', long);
    const outcome = await trains.loadRoute(made.party.id, alice, saved.id);
    expect(outcome).toMatchObject({ kind: 'ok', changed: true, missing: 0, cut: 3 });
    expect(made.current().train.route).toHaveLength(50);
    expect((await lines(made)).at(-1)).toBe(
      `<@${ALICE}> loaded the route **Marathon**: 50 stops. The train is at the first. ` +
        '3 more stops did not fit: a route has at most 50.',
    );
    const short = made.routes.add(ALICE, WEST, 'Short', [101, 102]);
    expect(await trains.loadRoute(made.party.id, alice, short.id)).toMatchObject({ cut: 0 });
  });
});
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -43,6 +43,7 @@ import { MemoryPartyStorage, PARTY_NOW, REPORTER } from './parties.js';
 import { gymsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
+import { MemorySavedRoutes } from './saved-routes.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { PartyStore } from '../../src/services/party-store.js';
@@ -149,6 +150,8 @@ export interface Outliving {
   clock: { now: number };
   tags: Record<typeof WEST_FORUM | typeof EAST_FORUM, Readonly<Record<string, string>>>;
   userSettings: Map<string, Partial<UserSettings>>;
+  /** The routes members saved. */
+  routes: MemorySavedRoutes;
   /** The storage the store really uses, when that is not the one in memory (a database test). */
   database: PartyStorage | undefined;
 }
@@ -267,6 +270,7 @@ export async function partyServiceWith(
     // Long enough that nothing is announced by itself during a test: `timed.flush()` does it.
     announceDelayMs: 3_600_000,
   });
+  const routes = kept?.routes ?? new MemorySavedRoutes();
   const trains = new TrainService({
     store,
     gateway,
@@ -274,6 +278,7 @@ export async function partyServiceWith(
     lines,
     users,
     gyms: gymsFixture(),
+    routes,
     log,
     now,
     // As for a start time: `trains.flush()` sends what is waiting.
@@ -301,6 +306,7 @@ export async function partyServiceWith(
     raids,
     timed,
     trains,
+    routes,
     scheduler,
     lines,
     users,
```

Create `test/support/saved-routes.ts`:

```ts
import {
  MAX_SAVED_ROUTES,
  type SavedRoute,
  type SavedRouteStorage,
  type SaveRouteOutcome,
} from '../../src/db/repositories/saved-route-repository.js';

interface Row extends SavedRoute {
  memberId: string;
  regionId: number;
}

function route({ id, name, gyms }: Row): SavedRoute {
  return { id, name, gyms: [...gyms] };
}

/**
 * The saved routes kept in memory as `SavedRouteRepository` keeps them, whose behaviour
 * saved-route-repository.db.test.ts pins down: a route belongs to a member and a region, a
 * namesake (whatever its case) is replaced, and a member has at most `MAX_SAVED_ROUTES` per
 * region. Set `failing` to make every call reject.
 */
export class MemorySavedRoutes implements SavedRouteStorage {
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

  private of(memberId: string, regionId: number): Row[] {
    return this.rows.filter((row) => row.memberId === memberId && row.regionId === regionId);
  }

  /** A row as the legacy bot may have left it, for a test: any name, any gyms. */
  add(memberId: string, regionId: number, name: string, gyms: number[]): SavedRoute {
    const row = { id: this.nextId++, memberId, regionId, name, gyms };
    this.rows.push(row);
    return route(row);
  }

  list(memberId: string, regionId: number): Promise<SavedRoute[]> {
    return this.attempt(() =>
      this.of(memberId, regionId)
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id - b.id)
        .map(route),
    );
  }

  get(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    return this.attempt(() => {
      const row = this.of(memberId, regionId).find((found) => found.id === id);
      return row && route(row);
    });
  }

  save(
    memberId: string,
    regionId: number,
    name: string,
    gyms: readonly number[],
  ): Promise<SaveRouteOutcome> {
    return this.attempt((): SaveRouteOutcome => {
      const mine = this.of(memberId, regionId);
      const same = mine.find((row) => row.name.toLowerCase() === name.toLowerCase());
      if (same) {
        same.name = name;
        same.gyms = [...gyms];
        return { kind: 'replaced', route: route(same) };
      }
      if (mine.length >= MAX_SAVED_ROUTES) return { kind: 'full' };
      return { kind: 'saved', route: this.add(memberId, regionId, name, [...gyms]) };
    });
  }

  remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    return this.attempt(() => {
      const row = this.of(memberId, regionId).find((found) => found.id === id);
      if (!row) return undefined;
      this.rows.splice(this.rows.indexOf(row), 1);
      return route(row);
    });
  }
}
```

Run: `npx vitest run --project unit src/services/train-service.routes.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -13,6 +13,7 @@ import { PartyRepository } from './db/repositories/party-repository.js';
 import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
+import { SavedRouteRepository } from './db/repositories/saved-route-repository.js';
 import { UserRepository } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
 import { ClickAnswers } from './discord/click-answers.js';
@@ -165,6 +166,7 @@ export async function startApp(
     lines,
     users,
     gyms,
+    routes: new SavedRouteRepository(db),
     log,
   });
   const scheduler = new PartyScheduler({
```

Create `src/db/repositories/saved-route-repository.ts`:

```ts
import type { Kysely } from 'kysely';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';

/** A member may keep this many routes per region: what one list of choices holds. */
export const MAX_SAVED_ROUTES = 25;

/** A route a member saved for a region, to load into a train later. */
export interface SavedRoute {
  /** The row id: what a choice of the list carries. */
  id: number;
  /** As the member named it; empty for a row of the legacy bot that has no name. */
  name: string;
  /** The gyms of the route, by id, in order. Some may no longer exist. */
  gyms: number[];
}

/** What came of saving a route: a new one, one that took the place of its namesake, or none. */
export type SaveRouteOutcome =
  | { kind: 'saved' | 'replaced'; route: SavedRoute }
  /** The member has `MAX_SAVED_ROUTES` routes in this region already. */
  | { kind: 'full' };

/** What the train service needs of the table; lets tests keep the routes in memory. */
export interface SavedRouteStorage {
  /** The member's routes of a region, by name. */
  list(memberId: string, regionId: number): Promise<SavedRoute[]>;
  /** One of the member's routes of a region; undefined for any other row. */
  get(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined>;
  /**
   * Saves a route under a name. A route of the same member and region with that name is
   * replaced; a new one is refused (`full`) when the member has the most they may have.
   */
  save(
    memberId: string,
    regionId: number,
    name: string,
    gyms: readonly number[],
  ): Promise<SaveRouteOutcome>;
  /** Deletes one of the member's routes of a region and gives it; undefined for any other row. */
  remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined>;
}

/**
 * The gyms of a stored route: ids separated by commas. The legacy bot wrote them as it had
 * them, so the text may be empty, hold a gym twice or hold what is no id: what is no id is left
 * out, and a gym counts once.
 */
export function routeGyms(text: string | null): number[] {
  const ids = (text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^\d{1,10}$/.test(part))
    .map(Number)
    .filter((id) => id > 0);
  return [...new Set(ids)];
}

function toRoute(row: { id: number; name: string | null; gyms: string | null }): SavedRoute {
  return { id: row.id, name: row.name ?? '', gyms: routeGyms(row.gyms) };
}

/**
 * The legacy table `SavedRoutes`: `userId` is the row id of the member in `User`, `region` the
 * row id of the region, `gyms` the gym ids as text. Members are named by their snowflake here;
 * a member without a `User` row has no routes, and gets the row when they save their first.
 */
export class SavedRouteRepository implements SavedRouteStorage {
  constructor(private readonly db: Kysely<DB>) {}

  private rows(db: Kysely<DB>, memberId: string, regionId: number) {
    return db
      .selectFrom('SavedRoutes')
      .innerJoin('User', 'User.id', 'SavedRoutes.userId')
      .where('User.userSnowflake', '=', memberId)
      .where('SavedRoutes.region', '=', regionId)
      .select(['SavedRoutes.id', 'SavedRoutes.name', 'SavedRoutes.gyms']);
  }

  /** The member's row of `User`, locked until the transaction ends; undefined when they have none. */
  private lockMember(trx: Kysely<DB>, memberId: string): Promise<{ id: number } | undefined> {
    return trx
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', memberId)
      .forUpdate()
      .executeTakeFirst();
  }

  async list(memberId: string, regionId: number): Promise<SavedRoute[]> {
    const rows = await this.rows(this.db, memberId, regionId)
      .orderBy('SavedRoutes.name')
      .orderBy('SavedRoutes.id')
      .execute();
    return rows.map(toRoute);
  }

  async get(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    const row = await this.rows(this.db, memberId, regionId)
      .where('SavedRoutes.id', '=', id)
      .executeTakeFirst();
    return row && toRoute(row);
  }

  async save(
    memberId: string,
    regionId: number,
    name: string,
    gyms: readonly number[],
  ): Promise<SaveRouteOutcome> {
    const text = gyms.join(',');
    // A row for the member is made only when they have none (as `UserRepository.ensure` does):
    // an insert that finds one uses up an id all the same. Looked for before the transaction,
    // and without a lock: inside it, a plain read would fix what the transaction sees before it
    // has the member's lock (it would then miss a route that a save just before it made), and a
    // locking read of a row that is not there makes two first saves wait for each other.
    const known = await this.db
      .selectFrom('User')
      .select('id')
      .where('userSnowflake', '=', memberId)
      .executeTakeFirst();
    return inTransaction(this.db, async (trx) => {
      if (!known) {
        await trx
          .insertInto('User')
          .values({ userSnowflake: memberId })
          .onDuplicateKeyUpdate({ userSnowflake: memberId })
          .execute();
      }
      // The member's row is locked: two saves of one member run one after the other, so that
      // neither the limit nor "one route per name" can be passed by both.
      const user = await this.lockMember(trx, memberId);
      if (!user) {
        throw new Error(
          known
            ? `User row for ${memberId} was deleted while their route was being saved`
            : `User row for ${memberId} vanished after insert`,
        );
      }
      const existing = await this.rows(trx, memberId, regionId).orderBy('SavedRoutes.id').execute();
      // The column compares names without regard to case, and so does this.
      const same = existing.find((row) => (row.name ?? '').toLowerCase() === name.toLowerCase());
      if (same) {
        await trx
          .updateTable('SavedRoutes')
          .set({ name, gyms: text })
          .where('id', '=', same.id)
          .execute();
        return { kind: 'replaced', route: { id: same.id, name, gyms: [...gyms] } };
      }
      if (existing.length >= MAX_SAVED_ROUTES) return { kind: 'full' };
      const inserted = await trx
        .insertInto('SavedRoutes')
        .values({ userId: user.id, region: regionId, name, gyms: text })
        .executeTakeFirstOrThrow();
      return { kind: 'saved', route: { id: Number(inserted.insertId), name, gyms: [...gyms] } };
    });
  }

  async remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined> {
    return inTransaction(this.db, async (trx) => {
      // The member's row first, as `save` takes it: both then wait for each other in one order.
      if (!(await this.lockMember(trx, memberId))) return undefined;
      const row = await this.rows(trx, memberId, regionId)
        .where('SavedRoutes.id', '=', id)
        .executeTakeFirst();
      if (!row) return undefined;
      await trx.deleteFrom('SavedRoutes').where('id', '=', row.id).execute();
      return toRoute(row);
    });
  }
}
```

Apply to `src/services/train-service.ts`:

```diff
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -1,8 +1,10 @@
+import type { SavedRoute, SavedRouteStorage } from '../db/repositories/saved-route-repository.js';
 import type { UserSettings } from '../db/repositories/user-repository.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import { noteMember } from '../domain/party/attendance.js';
 import {
   isTrain,
+  MAX_ROUTE_STOPS,
   membersWhere,
   type Change,
   type PartyProblem,
@@ -17,15 +19,17 @@ import {
   moveStop,
   moveTrain,
   removeStop,
+  replaceRoute,
   routeFinished,
   setConductor,
   setTrainBoss,
   type TrainMove,
   type TrainMoved,
 } from '../domain/party/train.js';
+import { tidyName } from '../domain/party/timed.js';
 import type { Logger } from '../log.js';
 import { gymName, type PostGym } from '../render/raid-post.js';
-import { LIMITS, plain, withMentions } from '../render/text.js';
+import { count, LIMITS, plain, withMentions } from '../render/text.js';
 import { movementText, type Movement } from '../render/train-panel.js';
 import type { Member } from './attendance-service.js';
 import { Gathered } from './gathered.js';
@@ -54,6 +58,8 @@ export interface TrainServiceOptions {
   users: { get(snowflake: string): Promise<UserSettings> };
   /** The gyms, to name the stops. */
   gyms: { get(id: number): PostGym | undefined };
+  /** The routes members saved (the table `SavedRoutes`). */
+  routes: SavedRouteStorage;
   log: Logger;
   now?: () => number;
   /**
@@ -63,6 +69,12 @@ export interface TrainServiceOptions {
   announceDelayMs?: number;
 }
 
+/**
+ * What the value of a choice of the list of saved routes looks like (`id:` and the id of a
+ * row): a route cannot be called so, and whatever else is typed for a route is a name.
+ */
+export const SAVED_ROUTE_CHOICE = /^id:\d+$/i;
+
 function placeNow(party: TrainParty): Place {
   return { gym: currentStop(party), finished: routeFinished(party), route: party.train.route };
 }
@@ -105,9 +117,12 @@ interface Place {
  * A movement of the train is the one thing that pings: everybody else who is signed up and
  * allows it (`mentions` and `mentionsTrainStops`) is told where the train is going, in a message
  * of its own. A movement is a move (`move`) and every edit of the route after which the train is
- * somewhere else (the stop it was at was removed, a stop was added to a finished route). That
- * message is gathered (`Gathered`): it goes out a few seconds after the last movement and says
- * where the train is then. Earlier ones stay in the post: it is a feed.
+ * somewhere else (the stop it was at was removed, a stop was added to a finished route, a route
+ * was loaded). That message is gathered (`Gathered`): it goes out a few seconds after the last
+ * movement and says where the train is then. Earlier ones stay in the post: it is a feed.
+ *
+ * It also keeps the routes members save (`saveRoute`, `loadRoute`, `forgetRoute`): a saved
+ * route belongs to the member and to the region the train was made in.
  */
 export class TrainService {
   private readonly now: () => number;
@@ -331,6 +346,104 @@ export class TrainService {
     );
   }
 
+  /**
+   * Saves the route the train has now for the member, under a name, for the region the train
+   * was made in (`SavedRouteStorage.save`): a route of theirs with that name is replaced, and
+   * a new one beyond what a member may keep is `full`. Anybody in the post may: it changes
+   * nothing about the train. Refused for a text that is no name (`bad-name`, tidied like the
+   * name of a party) and for a train without a route (`empty-route`).
+   */
+  async saveRoute(
+    partyId: string,
+    member: Member,
+    text: string,
+  ): Promise<
+    | { kind: 'gone' }
+    | { kind: 'refused'; reason: 'bad-name' | 'empty-route' | 'name-like-choice' }
+    | { kind: 'full' }
+    | { kind: 'saved' | 'replaced'; route: SavedRoute }
+  > {
+    const { store, routes } = this.options;
+    const party = store.get(partyId);
+    if (!party || !isTrain(party) || party.regionId === null) return { kind: 'gone' };
+    const name = tidyName(text);
+    if (name === undefined) return { kind: 'refused', reason: 'bad-name' };
+    // The list of saved routes names its choices so: such a name could not be told from one.
+    if (SAVED_ROUTE_CHOICE.test(name)) return { kind: 'refused', reason: 'name-like-choice' };
+    const { route } = party.train;
+    if (route.length === 0) return { kind: 'refused', reason: 'empty-route' };
+    return routes.save(member.id, party.regionId, name, route);
+  }
+
+  /** The routes the member saved for the region of this train, by name; none where there is no train. */
+  async savedRoutes(partyId: string, memberId: string): Promise<SavedRoute[]> {
+    const { store, routes } = this.options;
+    const party = store.get(partyId);
+    if (!party || !isTrain(party) || party.regionId === null) return [];
+    return routes.list(memberId, party.regionId);
+  }
+
+  /**
+   * Replaces the route of the train by one the member saved for its region, and puts the train
+   * at its first stop (`replaceRoute`): for who may move the train (`staff` says whether the
+   * member is staff). `none` when the member has no such route there. Gyms that no longer exist
+   * are left out (`missing` says how many), and so is what a route does not hold (`cut`); a
+   * route of which nothing is left is refused (`empty-route`). The others are told where the
+   * train is when that is somewhere else than before (`moved`).
+   */
+  async loadRoute(
+    partyId: string,
+    member: Member,
+    routeId: number,
+    staff = false,
+  ): Promise<
+    | TrainOutcome<{ route: SavedRoute; missing: number; cut: number; moved: boolean }>
+    | { kind: 'none' }
+  > {
+    const { store, routes, gyms } = this.options;
+    const before = store.get(partyId);
+    if (!before || !isTrain(before) || before.regionId === null) return { kind: 'gone' };
+    const route = await routes.get(member.id, before.regionId, routeId);
+    if (!route) return { kind: 'none' };
+    const existing = [...new Set(route.gyms)].filter((gymId) => gyms.get(gymId) !== undefined);
+    const missing = new Set(route.gyms).size - existing.length;
+    const cut = Math.max(0, existing.length - MAX_ROUTE_STOPS);
+    return this.movable(
+      partyId,
+      member,
+      (party) => {
+        const replaced = replaceRoute(party, member.id, existing, staff);
+        return replaced.ok ? { ...replaced, route, missing, cut } : replaced;
+      },
+      (party) =>
+        `<@${member.id}> loaded ` +
+        // A route of the legacy bot may have no name.
+        (route.name === ''
+          ? 'a saved route without a name'
+          : `the route **${plain(route.name)}**`) +
+        ': ' +
+        `${count(party.train.route.length, 'stop')}. The train is at the first.` +
+        (cut === 0
+          ? ''
+          : ` ${count(cut, 'more stop')} did not fit: a route has at most ${MAX_ROUTE_STOPS}.`),
+    );
+  }
+
+  /**
+   * Deletes one of the routes the member saved for the region of this train, and gives it;
+   * undefined when they have no such route there, or there is no such train.
+   */
+  async forgetRoute(
+    partyId: string,
+    memberId: string,
+    routeId: number,
+  ): Promise<SavedRoute | undefined> {
+    const { store, routes } = this.options;
+    const party = store.get(partyId);
+    if (!party || !isTrain(party) || party.regionId === null) return undefined;
+    return routes.remove(memberId, party.regionId, routeId);
+  }
+
   /**
    * How the train got from where it was before the movements that were gathered to where it is
    * now; undefined when there is nothing to tell. It goes by gyms: the numbers of the stops
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/services/train-service.routes.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/saved-route-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/saved-route-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff f2f8444 -- src test   # must print nothing
npx prettier --check src/app.ts src/db/repositories/saved-route-repository.db.test.ts src/db/repositories/saved-route-repository.ts src/services/train-service.routes.test.ts src/services/train-service.ts test/support/party-service.ts test/support/saved-routes.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app.ts src/db/repositories/saved-route-repository.db.test.ts src/db/repositories/saved-route-repository.ts src/services/train-service.routes.test.ts src/services/train-service.ts test/support/party-service.ts test/support/saved-routes.ts
git commit -m "Saved routes: the repository, a store in memory for tests, save, load, forget" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,467 unit tests.

---

### Task 8: The existing commands and controls in a train

**Files:**
- Create: `src/commands/parties/in-train.test.ts`
- Modify: `src/app-context.ts`, `src/commands/admin/save-party.test.ts`, `src/commands/admin/save-party.ts`, `src/commands/parties/attendance.ts`, `src/commands/parties/delete.ts`, `src/commands/parties/group.ts`, `src/commands/parties/meet.ts`, `src/commands/parties/name.ts`, `src/commands/parties/reply.ts`, `src/commands/parties/shout.ts`, `src/commands/parties/status.test.ts`, `src/commands/parties/status.ts`, `src/commands/parties/timed.ts`, `src/commands/raids/boss.ts`, `src/commands/raids/change.ts`, `src/commands/raids/raid-input.ts`, `src/commands/raids/raid-only.test.ts`, `src/commands/util/help-render.test.ts`, `src/discord/command.ts`, `src/discord/guards.ts`

**Interfaces:**
- Consumes: Tasks 2 to 7; the commands of `src/commands/parties/`, `raids/boss.ts`, `raid-input.ts`, `admin/save-party.ts`, the guards.
- Produces: `requireRaidOrTrain`, `A_RAID_OR_TRAIN`, `notARaidOrTrain` (`guards.ts`); `trainBoss` and `trainBossChoices` with `TrainBoss` (`raid-input.ts`; `reportedBoss` unchanged); `/boss`, `/where`, `/group`, `/done`, `/leave`, `/meet`, `/cancel-meet`, `/end`, `/name`, `/status`, `/shout`, `/delete` and `/admin save-party` working in a train's post in a train's words; the raid-only commands refused there with a sentence; `in-train.test.ts`.

A raid's `/boss` and `/raid` answer exactly as before. The sweep at the end of `in-train.test.ts` tries every command and control in a train's post and lets no sentence through that says "raid" or "meetup" wrongly.

Reference commit of the prototype for this task: `c142df9`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/admin/save-party.test.ts`:

```diff
--- a/src/commands/admin/save-party.test.ts
+++ b/src/commands/admin/save-party.test.ts
@@ -142,7 +142,7 @@ describe('/admin save-party', () => {
     const here = { guildChannelNames: { [WEST_FORUM]: 'west-raids' } };
     const none = await made.run({}, { ...outside, ...here });
     expect(sent(none.editReply).content).toBe(
-      'No post is kept. Use this in the post of a raid or meetup to keep it.',
+      'No post is kept. Use this in the post of a raid, train or meetup to keep it.',
     );
     await made.run();
     const listed = await made.run({}, { ...outside, ...here });
```

Create `src/commands/parties/in-train.test.ts`:

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
import { testGyms, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, at, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { DELETE_REASON_INPUT, deletionForm, TIME_INPUT } from '../../render/party-controls.js';
import { admin } from '../admin/index.js';
import { info, infoControls } from '../meetups/info.js';
import { boss, moveset } from '../raids/boss.js';
import { duration, end, hatch } from '../raids/change.js';
import { location, locationControls } from '../raids/location.js';
import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
import { deleteParty } from './delete.js';
import { group } from './group.js';
import { cancelMeet, meet } from './meet.js';
import { name } from './name.js';
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
  name,
  info,
  boss,
  moveset,
  hatch,
  duration,
  location,
  admin,
];
const START = at('2026-10-13T16:00');
const END = at('2026-10-13T18:00');
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const ADMIN_ROLE = '800000000000000001';
const NOT_A_RAID = 'This is the post of a train: that only works in the post of a raid.';

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};

beforeEach(() => {
  // The handlers read the clock themselves; the fake gateway needs the real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * A train with its post, on a route of three gyms unless `route` says otherwise, and every
 * command and control that was there before trains and works, or is refused, in its post.
 */
async function setup(route: readonly number[] = [4, 1, 7]) {
  const made = await createdTrain({ route });
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, [partyButtons, infoControls, locationControls]);
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
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the post of the train, by Alice unless `extra` says otherwise. */
  const run = (
    commandName: string,
    options: Record<string, string | number | boolean> = {},
    extra: object = {},
  ) =>
    handle(
      fakeChatInput({
        commandName,
        ...inPost,
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
    // The lines first: they were said before what is announced a moment later.
    await made.attendance.flush();
    await made.timed.flush();
    await made.trains.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const alice = () => attendeeOf(made.current(), ALICE);
  const embed = async () => {
    await made.service.flush();
    return made.gateway.posts.get(made.postId)?.message.embeds?.[0];
  };
  return { ...made, ctx, handle, run, answer, click, lines, alice, embed, inPost, told };
}

describe('the attendance commands in the post of a train', () => {
  it('sign a member up and take them off again, in the words of a train', async () => {
    const made = await setup();
    expect(await made.answer('maybe')).toBe('You are interested.');
    expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
    expect(await made.answer('here')).toBe('You are here with 2 more.');
    expect(await made.answer('not-here')).toBe('You are interested with 2 more.');
    expect(await made.answer('remote')).toBe('You are interested with 2 more, remotely.');
    expect(await made.answer('local')).toBe('You are interested with 2 more, in person.');
    expect(await made.answer('leave')).toBe('You have left this train.');
    expect(made.alice()).toBeUndefined();
    expect(await made.answer('leave')).toBe('You are not signed up for this train.');
    expect(await made.answer('not-here')).toBe('You are not signed up for this train.');
  });

  it('/done means leave: the member is taken off, and nobody is asked anything', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Present);
    await made.run('here');
    expect(await made.answer('done')).toBe('You have left this train.');
    expect(made.alice()).toBeUndefined();
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
    expect(made.current().prompts.completion).toEqual([]);
    expect(await made.lines()).toEqual([`<@${BOB}> is here.`, `<@${ALICE}> has left.`]);
    expect(await made.answer('done')).toBe('You are not signed up for this train.');
  });

  it('/leave and /done free the conductor, and the post says that the train has none', async () => {
    const made = await setup();
    await made.run('join');
    await made.trains.setConductor(made.party.id, { id: ALICE });
    expect(await made.answer('leave')).toBe('You have left this train.');
    expect(made.current().train.conductorId).toBeNull();
    await made.run('join');
    await made.trains.setConductor(made.party.id, { id: ALICE });
    await made.attendance.flush();
    expect(await made.answer('done')).toBe('You have left this train.');
    expect(made.current().train.conductorId).toBeNull();
    expect((await made.lines()).at(-1)).toBe(
      `<@${ALICE}> has left: this train has no conductor now.`,
    );
    expect((await made.embed())?.description).not.toContain('Conductor');
  });

  it('/group opens, joins and labels groups as in a raid', async () => {
    const made = await setup();
    await made.run('join');
    expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
      'You opened group B and are in it.',
    );
    expect(await made.answer('group', { text: 'by car' }, { subcommand: 'label' })).toBe(
      'Your group is now group B (by car).',
    );
    expect(await made.answer('group', { letter: 'A' }, { subcommand: 'join' })).toBe(
      'You are coming, in group A.',
    );
    expect(await made.answer('join', { group: 'B', count: 2 })).toBe(
      'You are coming with 1 more, in group B (by car).',
    );
    expect(await made.answer('join', { group: 'D' })).toBe('This train has no such group.');
    expect(made.current().groups).toEqual([{ id: 'A' }, { id: 'B', label: 'by car' }]);
    // The list of groups offers them.
    const typing = await made.handle(
      fakeAutocomplete({ commandName: 'join', ...made.inPost, focused: '', focusedName: 'group' }),
    );
    expect(typing.respond).toHaveBeenCalledWith([
      { name: 'Group A (1)', value: 'A' },
      { name: 'Group B: by car (2)', value: 'B' },
    ]);
    // The post has a row of group buttons now, above the button that moves the train.
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.message.components).toHaveLength(4);
    for (let n = 0; n < 3; n++) await made.run('group', {}, { subcommand: 'new' });
    expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
      'A train cannot have more than five groups.',
    );
  });
});

describe('the buttons of a train post', () => {
  it('sign up, count and leave like those of a raid, and move between groups', async () => {
    const made = await setup();
    expect(sent((await made.click('join')).reply).content).toBe('You are coming.');
    expect(sent((await made.click('more')).reply).content).toBe('You are coming with 1 more.');
    expect(sent((await made.click('remote')).reply).content).toBe(
      'You are coming with 1 more, remotely.',
    );
    expect(sent((await made.click('here')).reply).content).toBe(
      'You are here with 1 more, remotely.',
    );
    await made.attendance.newGroup(made.party.id, { id: REPORTER });
    expect(sent((await made.click('group:B')).reply).content).toBe(
      'You are here with 1 more, in group B, remotely.',
    );
    expect(sent((await made.click('leave')).reply).content).toBe('You have left this train.');
    expect(sent((await made.click('less')).reply).content).toBe(
      'You are not signed up for this train.',
    );
  });

  it('take a Done that somebody still has on screen as leave', async () => {
    const made = await setup();
    await made.click('join');
    expect(sent((await made.click('done')).reply).content).toBe('You have left this train.');
    expect(made.alice()).toBeUndefined();
    expect(sent((await made.click('answer:yes')).reply).content).toBe(
      'You were not asked, or you have answered already.',
    );
  });

  it('refuse "Set time" and its form, which only a raid has', async () => {
    const made = await setup();
    const clicked = await made.click('time');
    expect(clicked.showModal).not.toHaveBeenCalled();
    expect(sent(clicked.reply).content).toBe(NOT_A_RAID);
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.party.id}:time:hatch`,
        ...made.inPost,
        userId: ALICE,
        fields: { [TIME_INPUT]: '30' },
      }),
    );
    expect(sent(form.reply).content).toBe(NOT_A_RAID);
  });
});

describe('/meet, /cancel-meet, /end and /name in the post of a train', () => {
  it('/meet sets when the train starts, for everybody, and tells the others', async () => {
    const made = await setup();
    await made.run('join');
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      `This train starts at ${stamp(START)} (${stamp(START, 'R')}). I am telling the others.`,
    );
    expect(made.current().timed.startTime).toBe(START);
    // The start is the train's, not that of a group.
    expect(made.current().groups).toEqual([{ id: 'A' }]);
    expect(await made.lines()).toEqual([
      `<@${ALICE}> is coming.`,
      `<@${ALICE}> set the start of this train: ${stamp(START)} (${stamp(START, 'R')}).`,
      `<@${REPORTER}>`,
    ]);
    expect((await made.embed())?.description).toContain(
      `Starts ${stamp(START, 'R')}, at ${stamp(START)}.`,
    );
    expect(await made.answer('cancel-meet')).toBe(
      'This train has no start time any more. I am telling the others.',
    );
    expect(await made.answer('cancel-meet')).toBe('This train had no start time.');
  });

  it('/meet is for members who are signed up, and explains a time it cannot read', async () => {
    const made = await setup();
    expect(await made.answer('meet', { time: '4pm' })).toBe(
      'You are not signed up for this train.',
    );
    await made.run('join');
    expect(await made.answer('meet', { time: 'gibberish' })).toBe(
      'I could not read "gibberish" as the time the train starts. ' +
        'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).',
    );
  });

  it('/end sets when the train ends, for anybody in the post, and "none" removes it', async () => {
    const made = await setup();
    expect(await made.answer('end', { time: '6pm' })).toBe(
      `This train ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    expect(made.current()).toMatchObject({ endTime: END, lastPossibleTime: END });
    expect(await made.answer('end', { time: '18:00' })).toBe(
      `This train already ends at ${stamp(END)} (${stamp(END, 'R')}).`,
    );
    await made.run('join');
    expect(await made.answer('meet', { time: '7pm' })).toBe(
      'A train cannot start after it ends. Give an earlier start, or change the end first with `/end`.',
    );
    expect(await made.answer('end', { time: 'none' })).toBe('This train has no end time any more.');
    expect(made.current().endTime).toBeNull();
    expect(await made.lines()).toContain(`<@${ALICE}> removed the end time of this train.`);
  });

  it('/name renames the train, and the title of its post follows', async () => {
    const made = await setup();
    expect(await made.answer('name', { name: '  Sunday   legendaries ' })).toBe(
      'This train is now called **Sunday legendaries**.',
    );
    expect(await made.answer('name', { name: 'Sunday legendaries' })).toBe(
      'This train is called **Sunday legendaries** already.',
    );
    expect(await made.answer('name', { name: '   ' })).toBe('Give a name of 1 to 80 characters.');
    expect(await made.lines()).toEqual([`<@${ALICE}> renamed this train: **Sunday legendaries**.`]);
    expect(made.gateway.posts.get(made.postId)?.title).toBe('Train · Sunday legendaries');
  });
});

describe('/boss in the post of a train', () => {
  const NO_TIER =
    'A train has no tier: name the Pokémon it is after, such as `yveltal`, or `none` for no boss.';

  it('sets which Pokémon the train is after, and the post shows it', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(
      'This train is now after Yveltal.',
    );
    expect(made.current().train.boss).toEqual({ key: 'yveltal' });
    expect(await made.answer('boss', { pokemon: 'Yveltal (T5)' })).toBe(
      'This train is after Yveltal already.',
    );
    expect(await made.lines()).toEqual([
      `<@${ALICE}> set the boss this train is after: **Yveltal**.`,
    ]);
    const embed = await made.embed();
    expect(embed?.description).toMatch(/^\*\*Raid train\*\* after \*\*Yveltal\*\*/);
    expect(embed?.fields?.[0]).toMatchObject({ name: 'Boss' });
    expect(embed?.thumbnail?.url).toBeDefined();
    // Neither the times nor the route of the train have anything to do with it.
    expect(made.current()).toMatchObject({ endTime: null, hatchTime: null, gymId: null });
  });

  it('ignores a tier typed before the name: a train has none', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 't3 yveltal' })).toBe(
      'This train is now after Yveltal.',
    );
    for (const typed of ['shadow t5 yveltal', 'T5 Yveltal', 'tier 1 yveltal', 'shadow yveltal']) {
      expect(await made.answer('boss', { pokemon: typed })).toBe(
        'This train is after Yveltal already.',
      );
    }
    expect(made.current().train.boss).toEqual({ key: 'yveltal' });
  });

  it('takes a Pokémon that is not on the current boss list: a train may be planned ahead', async () => {
    const made = await setup();
    expect(made.ctx.raidBosses.bosses().some((listed) => listed.entry?.key === 'bulbasaur')).toBe(
      false,
    );
    expect(await made.answer('boss', { pokemon: 'bulbasaur' })).toBe(
      'This train is now after Bulbasaur.',
    );
    expect(made.current().train.boss).toEqual({ key: 'bulbasaur' });
    expect(await made.answer('boss', { pokemon: 't3 bulbasaur' })).toBe(
      'This train is after Bulbasaur already.',
    );
    const embed = await made.embed();
    expect(embed?.description).toMatch(/^\*\*Raid train\*\* after \*\*Bulbasaur\*\*/);
    // What the game master says of it is shown, though no list has a picture of it.
    expect(embed?.fields?.[0]).toMatchObject({ name: 'Boss' });
    expect(embed?.thumbnail).toBeUndefined();
  });

  it('asks which mega is meant, and takes the one that is named in full', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'mega charizard' })).toBe(
      '"mega charizard" could be Mega Charizard X or Mega Charizard Y: type the full name.',
    );
    expect(await made.answer('boss', { pokemon: 'mega charizard y' })).toBe(
      'This train is now after Mega Charizard Y.',
    );
    expect(made.current().train.boss).toEqual({ key: 'charizard_mega_y' });
  });

  it('offers the current bosses without eggs or tiers, then Pokémon by what was typed', async () => {
    const made = await setup();
    const offered = async (focused: string) => {
      const typing = await made.handle(
        fakeAutocomplete({ commandName: 'boss', ...made.inPost, focused, focusedName: 'pokemon' }),
      );
      return (typing.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
    };
    const all = await offered('');
    expect(all.length).toBeGreaterThan(5);
    expect(all.length).toBeLessThanOrEqual(25);
    expect(all.every((choice) => /^[pb]:/.test(choice.value))).toBe(true);
    expect(all.some((choice) => /egg|\(T\d\)/i.test(choice.name))).toBe(false);
    // Each Pokémon once, whatever tiers it is a boss in.
    expect(new Set(all.map((choice) => choice.value)).size).toBe(all.length);
    expect(all).toContainEqual({ name: 'Yveltal', value: 'p:yveltal' });
    expect(await made.answer('boss', { pokemon: 'p:yveltal' })).toBe(
      'This train is now after Yveltal.',
    );
    // A Pokémon that is no boss right now is found by its name.
    expect(await offered('bulba')).toContainEqual({ name: 'Bulbasaur', value: 'p:bulbasaur' });
    expect(await made.answer('boss', { pokemon: 'p:bulbasaur' })).toBe(
      'This train is now after Bulbasaur.',
    );
    // There are no eggs to pick.
    expect(await offered('t5 egg')).toEqual([]);
  });

  it('refuses the tier of an egg with a sentence: a train has no tier', async () => {
    const made = await setup();
    for (const typed of ['t5', 'e:T5:0', 'mega', 'shadow t3', 'tier 5 egg']) {
      expect(await made.answer('boss', { pokemon: typed })).toBe(NO_TIER);
    }
    expect(made.current().train.boss).toBeNull();
    expect(await made.lines()).toEqual([]);
  });

  it('takes "shadow" alone for no Pokémon: it is no name of a boss', async () => {
    const made = await setup();
    // The list has shadow bosses, which a raid finds by `shadow <name>`.
    expect(made.ctx.raidBosses.bosses().some((listed) => listed.tier.shadow)).toBe(true);
    expect(await made.answer('boss', { pokemon: 'shadow' })).toBe(
      'I do not know a Pokémon called "shadow". Pick one from the list.',
    );
    expect(await made.answer('boss', { pokemon: 'shad' })).toBe(
      'I do not know a Pokémon called "shad". Pick one from the list.',
    );
    expect(made.current().train.boss).toBeNull();
  });

  it('says so when the text names no Pokémon, without a word about raids or tiers', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'qqqqq' })).toBe(
      'I do not know a Pokémon called "qqqqq". Pick one from the list.',
    );
    expect(await made.answer('boss', { pokemon: 't3 qqqqq' })).toBe(
      'I do not know a Pokémon called "qqqqq". Pick one from the list.',
    );
    expect(await made.answer('boss', { pokemon: 'p:no_such_key' })).toBe(
      'I do not know that Pokémon any more. Pick again from the list.',
    );
    expect(made.current().train.boss).toBeNull();
  });

  it('takes the boss off again with "none"', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'none' })).toBe('This train was after no boss.');
    await made.run('boss', { pokemon: 'yveltal' });
    expect(await made.answer('boss', { pokemon: 'None' })).toBe(
      'This train is after no boss any more.',
    );
    expect(made.current().train.boss).toBeNull();
    expect((await made.lines()).at(-1)).toBe(`<@${ALICE}> removed the boss of this train.`);
  });
});

describe('/where in the post of a train', () => {
  it('shows the stop the train is at, as a link', async () => {
    const made = await setup();
    expect(await made.answer('where')).toBe(
      `**Veterans Memorial Bridge**\n[Open in Google Maps](<${maps(4)}>)`,
    );
    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
    expect(await made.answer('where')).toBe(
      `**The Stacks** (Pinewood Public Library)\n[Open in Google Maps](<${maps(1)}>)`,
    );
  });

  it('says so when the train is at no gym: before its route, and after it', async () => {
    const none = await setup([]);
    expect(await none.answer('where')).toBe(
      'This train has no route yet. Add its stops with `/route add`.',
    );
    const made = await setup([4]);
    await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
    expect(await made.answer('where')).toBe('This train has finished its route: it is at no gym.');
    const gone = await setup([999]);
    expect(await gone.answer('where')).toBe('I no longer know the gym this train is at.');
  });
});

describe('the other commands in the post of a train', () => {
  it('/shout tells everybody in the train, and says so when there is nobody else', async () => {
    const made = await setup();
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'You are not signed up for this train.',
    );
    await made.run('join');
    expect(await made.answer('shout', { message: 'On my way' })).toBe(
      'Your message is in the post. I pinged 1 trainer.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@${ALICE}> to everybody in this train:\n> On my way\n<@${REPORTER}>`,
      mention: { users: [REPORTER] },
    });
    await made.attendance.leave(made.party.id, { id: REPORTER });
    expect(await made.answer('shout', { message: 'Anybody?' })).toBe(
      'Nobody else is signed up for this train, so I said nothing.',
    );
  });

  it('/status puts the train at the bottom of its post again, with all its buttons', async () => {
    const made = await setup();
    expect(await made.answer('status')).toBe(
      'The train is at the bottom of the post again, with its buttons.',
    );
    const [copy] = made.gateway.messagesIn(made.postId);
    expect(copy?.message.embeds?.[0]?.title).toBe('Saturday legendaries');
    expect(copy?.message.components).toEqual(
      made.gateway.posts.get(made.postId)?.message.components,
    );
  });

  it('/status in the channel of the region lists the train under the raids', async () => {
    const made = await setup();
    expect(await made.answer('status', {}, { channelId: WEST_CHANNEL, thread: undefined })).toBe(
      'No raids right now. Report one with `/raid`.\n\n**Trains**\n' +
        `<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
    );
  });

  it('/delete from staff closes the train: the post says who did it and is archived', async () => {
    const made = await setup();
    expect(await made.answer('delete', {}, { roleNames: ['Moderator'] })).toBe(
      'This train is closed: I am archiving and locking its post.',
    );
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.said().at(-1)).toBe(`This train was closed by <@${ALICE}>.`);
    const post = made.gateway.posts.get(made.postId);
    expect(post).toMatchObject({ archived: true, locked: true });
    expect(post?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(
      `This train was closed by <@${ALICE}>.`,
    );
    expect(post?.message.components).toEqual([]);
  });

  it('/delete from anybody else asks why, and puts the request into the post as a train', async () => {
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
          ...made.inPost,
        }),
      );
    expect(sent((await submit('   ')).reply).content).toBe('Say why the train should be deleted.');
    expect(sent((await submit('Made twice')).editReply).content).toBe(
      'I have put your request into the post, for the moderators.',
    );
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
      content: `<@&${ADMIN_ROLE}>: <@${ALICE}> asks for this train to be deleted.\n> Made twice`,
      mention: { roles: [ADMIN_ROLE] },
    });
    expect(sent((await submit('Again')).editReply).content).toBe(
      'You have already asked the moderators to delete this train.',
    );
    await made.service.end(made.party.id);
    expect(sent((await submit('Too late', CAROL)).reply).content).toBe(STALE_COMPONENT);
  });

  it('/admin save-party keeps the post of a train and lets it go again', async () => {
    const made = await setup();
    const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
    expect(await made.answer('admin', {}, staff)).toMatch(/^This post is kept/);
    expect(made.current().saved).toBe(true);
    expect(await made.answer('admin', { keep: false }, staff)).toBe(
      'This post is no longer kept: it is archived as usual once the train is over.',
    );
    expect(made.current().saved).toBe(false);
  });
});

describe('what is only for raids or only for meetups, in the post of a train', () => {
  it('refuses every command about a raid as such, naming the kind of post', async () => {
    const made = await setup();
    const before = made.current();
    expect(await made.answer('hatch', { time: '30' })).toBe(NOT_A_RAID);
    expect(await made.answer('duration', { minutes: 30 })).toBe(NOT_A_RAID);
    expect(await made.answer('moveset', { quick: 'snarl' })).toBe(NOT_A_RAID);
    // The route of a train is its own: `/location` moves a raid.
    expect(await made.answer('location', { gym: 'Library' })).toBe(NOT_A_RAID);
    expect(await made.answer('info')).toBe(
      'This is the post of a train: that only works in the post of a meetup.',
    );
    expect(made.current()).toBe(before);
    expect(await made.lines()).toEqual([]);
  });

  it('offers no moves there, also when the train is after a boss', async () => {
    const made = await setup();
    await made.run('boss', { pokemon: 'yveltal' });
    const typing = await made.handle(
      fakeAutocomplete({
        commandName: 'moveset',
        ...made.inPost,
        focused: '',
        focusedName: 'quick',
      }),
    );
    expect(typing.respond).toHaveBeenCalledWith([]);
  });
});

describe('what a member of a train is told', () => {
  it('never calls the train a raid or a meetup, whatever they try in its post', async () => {
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
      ['group', { letter: 'A' }, { subcommand: 'join' }],
      ['group', { letter: 'E' }, { subcommand: 'join' }],
      ['group', { text: 'x' }, { subcommand: 'label' }],
      ['group', { text: 'x'.repeat(101) }, { subcommand: 'label' }],
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
      ['boss', { pokemon: 'yveltal' }],
      ['boss', { pokemon: 'yveltal' }],
      ['boss', { pokemon: 't5' }],
      ['boss', { pokemon: 'qqqqq' }],
      ['boss', { pokemon: 't3 yveltal' }],
      ['boss', { pokemon: 'shadow t5 yveltal' }],
      ['boss', { pokemon: 'bulbasaur' }],
      ['boss', { pokemon: 't3 bulbasaur' }],
      ['boss', { pokemon: 'mega charizard' }],
      ['boss', { pokemon: 't1 qqqqq' }],
      ['boss', { pokemon: 'star' }],
      ['boss', { pokemon: 'none' }],
      ['shout', { message: 'hello' }],
      ['status'],
      ['admin', {}, staff],
      ['admin', {}, staff],
      ['admin', { keep: false }, staff],
      ['name', { name: 'Evening train' }],
      ['name', { name: 'Evening train' }],
      ['name', { name: '   ' }],
      ['done'],
      ['where'],
    ];
    for (const [command, options, extra] of tries) await made.run(command, options, extra);
    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A', 'leave']) {
      await made.click(action);
    }
    await made.run('delete', {}, { roleNames: ['Admin'] });
    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A', 'leave']) {
      // The train is closed by now: a control that is still on screen says so, without a kind.
      await made.click(action);
    }
    expect(made.told.slice(-8)).toEqual(Array.from({ length: 8 }, () => 'This has ended.'));
    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 16);
    // A raid is named only where every kind is ("raid, train or meetup", "raid or train"), and
    // a meetup only beside the train ("train or meetup"). Nothing speaks of a tier or a report.
    const wrong = made.told.filter(
      (text) =>
        /raid(?!, train or meetup| or train)/i.test(text) || /(?<!train or )meetup/i.test(text),
    );
    expect(wrong).toEqual([]);
    expect(made.told.filter((text) => /\btiers?\b|report/i.test(text))).toEqual([
      'A train has no tier: name the Pokémon it is after, such as `yveltal`, or `none` for no boss.',
    ]);
    await made.timed.flush();
    await made.trains.flush();
    await made.attendance.flush();
    expect(made.said().filter((text) => /raid|meetup/i.test(text))).toEqual([]);
  });
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
-      content: 'Use this in the channel of a region, or in the post of a raid or meetup.',
+      content: 'Use this in the channel of a region, or in the post of a raid, train or meetup.',
       flags: MessageFlags.Ephemeral,
     });
     // A region without an outline has no gyms and is not a place for raids.
@@ -142,7 +142,9 @@ describe('/where', () => {
   it('is for the post of a raid that is going on', async () => {
     const made = await setup();
     const used = await made.run('where', { channelId: WEST_CHANNEL });
-    expect(sent(used.reply).content).toBe('Use this in the post of a raid that is still active.');
+    expect(sent(used.reply).content).toBe(
+      'Use this in the post of a raid or train that is still active.',
+    );
     expect(used.deferReply).not.toHaveBeenCalled();
   });
 });
```

Apply to `src/commands/raids/raid-only.test.ts`:

```diff
--- a/src/commands/raids/raid-only.test.ts
+++ b/src/commands/raids/raid-only.test.ts
@@ -50,7 +50,10 @@ describe('what is only for raids, in the post of a meetup', () => {
     const made = await inMeetup();
     expect(await made.answer('hatch', { time: '30' })).toBe(NOT_A_RAID);
     expect(await made.answer('duration', { minutes: 30 })).toBe(NOT_A_RAID);
-    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(NOT_A_RAID);
+    // A train has a boss too: `/boss` says so.
+    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(
+      'This is the post of a meetup: that only works in the post of a raid or train.',
+    );
     expect(await made.answer('moveset', { quick: 'snarl' })).toBe(NOT_A_RAID);
     expect(await made.answer('location', { gym: 'Library' })).toBe(NOT_A_RAID);
     // Nothing was written and nothing said.
```

Apply to `src/commands/util/help-render.test.ts`:

```diff
--- a/src/commands/util/help-render.test.ts
+++ b/src/commands/util/help-render.test.ts
@@ -142,7 +142,7 @@ describe('renderHelpOverview', () => {
     expect(fields.find((field) => field.name === 'Meetups')?.value.split('\n')).toEqual([
       '`/info` Write what there is to know about this meetup, in a form',
       '`/meetup` Create a meetup in this region, with a post of its own',
-      '`/name` Rename this meetup',
+      '`/name` Rename this train or meetup',
     ]);
   });
 
```

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts src/commands/parties/in-train.test.ts src/commands/parties/status.test.ts src/commands/raids/raid-only.test.ts src/commands/util/help-render.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -36,9 +36,9 @@ export interface AppContext {
   readonly gyms: GymProvider;
   /** The regions: by id, by text channel and by forum. */
   readonly regions: RegionProvider;
-  /** The raids and meetups (later also trains) that have not ended. */
+  /** The raids, trains and meetups that have not ended. */
   readonly parties: PartyProvider;
-  /** Parties on Discord: reporting a raid, making a meetup, keeping posts and summaries up to date. */
+  /** Parties on Discord: reporting a raid, making a train or meetup, keeping posts and summaries up to date. */
   readonly partyService: PartyService;
   /** What members do in a party: signing up, completing, groups. Buttons and commands use it. */
   readonly attendance: AttendanceService;
```

Apply to `src/commands/admin/save-party.ts`:

```diff
--- a/src/commands/admin/save-party.ts
+++ b/src/commands/admin/save-party.ts
@@ -22,7 +22,7 @@ export const saveParty: SubcommandPart = {
     ),
   help: {
     details:
-      'Use it in the post of a raid or a meetup. A kept post stays open after that has ended: ' +
+      'Use it in the post of a raid, a train or a meetup. A kept post stays open after that has ended: ' +
       'nothing warns that it will be archived and nothing archives it, until you run this with ' +
       '`keep:False` or close it with `/delete`. The post says who kept it. Used anywhere ' +
       'else without an option, it lists the posts that are kept. For admins and moderators.',
@@ -52,7 +52,7 @@ export const saveParty: SubcommandPart = {
       await interaction.editReply({
         content:
           kept.length === 0
-            ? 'No post is kept. Use this in the post of a raid or meetup to keep it.'
+            ? 'No post is kept. Use this in the post of a raid, train or meetup to keep it.'
             : `Kept posts, which I will not archive by myself:\n${fitItems(kept, 1_900, '\n')}`,
       });
       return;
```

Apply to `src/commands/parties/attendance.ts`:

```diff
--- a/src/commands/parties/attendance.ts
+++ b/src/commands/parties/attendance.ts
@@ -30,7 +30,7 @@ function withCountAndGroup(name: string, description: string): SlashCommandBuild
     .addStringOption((option) =>
       option
         .setName('group')
-        .setDescription('The group to be in, when a raid has several')
+        .setDescription('The group to be in, when a raid or train has several')
         .setAutocomplete(true),
     );
   return builder;
@@ -50,7 +50,7 @@ function countAndGroup(
   };
 }
 
-const IN_A_POST = 'Use it in the post of the raid or meetup.';
+const IN_A_POST = 'Use it in the post of the raid, train or meetup.';
 
 function signUpCommand(
   name: string,
@@ -109,21 +109,21 @@ function remoteCommand(name: string, description: string, remote: boolean): Simp
 
 export const maybe = signUpCommand(
   'maybe',
-  'Say that you are interested in this raid or meetup',
+  'Say that you are interested in this raid, train or meetup',
   PartyStatus.Interested,
   'Marks you as interested.',
 );
 
 export const join = signUpCommand(
   'join',
-  'Say that you are coming to this raid or meetup',
+  'Say that you are coming to this raid, train or meetup',
   PartyStatus.Coming,
   'Marks you as coming.',
 );
 
 export const here = signUpCommand(
   'here',
-  'Say that you have arrived at this raid or meetup',
+  'Say that you have arrived at this raid or meetup, or at the stop a train is at',
   PartyStatus.Present,
   'Marks you as here.',
 );
@@ -156,7 +156,7 @@ export const notHere: SimpleCommand = {
 export const leave: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('leave')
-    .setDescription('Take yourself off this raid or meetup'),
+    .setDescription('Take yourself off this raid, train or meetup'),
   help: { category: 'basic-raid', details: `Removes you from the list. ${IN_A_POST}` },
   guards: [requireParty],
   throttle: ACTION_THROTTLE,
@@ -170,12 +170,12 @@ export const leave: SimpleCommand = {
 export const done: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('done')
-    .setDescription('Say that you have completed this raid (in a meetup: that you leave)'),
+    .setDescription('Say that you have completed this raid (in a train or meetup: that you leave)'),
   help: {
     category: 'basic-raid',
     details:
       'Marks you as done. The others of your group who are here are asked whether they are done ' +
-      'too; without an answer they count as done after a few minutes. A meetup has nothing to ' +
+      'too; without an answer they count as done after a few minutes. A train or meetup has nothing to ' +
       `complete: there it takes you off the list, like \`/leave\`. ${IN_A_POST}`,
   },
   guards: [requireParty],
```

Apply to `src/commands/parties/delete.ts`:

```diff
--- a/src/commands/parties/delete.ts
+++ b/src/commands/parties/delete.ts
@@ -7,7 +7,7 @@ import { deletionForm } from '../../render/party-controls.js';
 import { commandParty, partyOver } from './reply.js';
 
 /**
- * `/delete` (spec 4.2), for a raid and for a meetup alike; what follows says "raid".
+ * `/delete` (spec 4.2), for every kind of party alike; what follows says "raid".
  * From an admin, a moderator or the bot's owner it ends the raid at once:
  * the post says who closed it and is archived and locked, the copies and the link line go, and
  * the gym is free for a new report. It is the tool for what the clock does not tidy up by itself
@@ -19,14 +19,14 @@ import { commandParty, partyOver } from './reply.js';
 export const deleteParty: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('delete')
-    .setDescription('Close this raid or meetup (moderators), or ask the moderators to'),
+    .setDescription('Close this raid, train or meetup (moderators), or ask the moderators to'),
   help: {
     category: 'raid-crud',
     details:
-      'Admins and moderators: closes the raid or meetup at once; its post is archived and ' +
+      'Admins and moderators: closes the raid, train or meetup at once; its post is archived and ' +
       'locked and stays readable. Everybody else: asks why it should be deleted and puts that ' +
       'into the post for the moderators. What nobody comes to needs no deleting: it goes away ' +
-      'by itself after it ends. Use it in the post of the raid or meetup.',
+      'by itself after it ends. Use it in the post of the raid, train or meetup.',
     examples: ['/delete'],
   },
   guards: [requireParty],
```

Apply to `src/commands/parties/group.ts`:

```diff
--- a/src/commands/parties/group.ts
+++ b/src/commands/parties/group.ts
@@ -16,7 +16,7 @@ import {
 const joinGroup: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('join')
-    .setDescription('Move to another group of this raid')
+    .setDescription('Move to another group of this raid or train')
     .addStringOption((option) =>
       option.setName('letter').setDescription('The group').setRequired(true).setAutocomplete(true),
     ),
@@ -39,11 +39,12 @@ const joinGroup: SubcommandPart = {
 const newGroup: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('new')
-    .setDescription('Open another group for this raid and move to it'),
+    .setDescription('Open another group for this raid or train and move to it'),
   help: {
     details:
-      'For a raid with more trainers than one lobby holds, or for trainers who want another ' +
-      'time. Later sign-ups land in the newest group. A raid has at most five groups.',
+      'For more trainers than one lobby holds, or for trainers who want to raid apart from ' +
+      'the others. Later sign-ups land in the newest group. A raid or train has at most five ' +
+      'groups.',
   },
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
@@ -85,15 +86,16 @@ const labelGroup: SubcommandPart = {
 };
 
 /**
- * `/group`: the groups of a raid. A meetup has one group for good, so each part is refused
- * there with that sentence (`no-groups`): it is the party that says so, not a guard, since a
- * train will have groups again.
+ * `/group`: the groups of a raid or a train. A meetup has one group for good, so each part is
+ * refused there with that sentence (`no-groups`): it is the party that says so, not a guard.
  */
 export const group = commandGroup({
-  data: new SlashCommandBuilder().setName('group').setDescription('The groups of this raid'),
+  data: new SlashCommandBuilder()
+    .setName('group')
+    .setDescription('The groups of this raid or train'),
   help: {
     category: 'basic-raid',
-    details: 'Use it in the post of the raid. A meetup has no groups.',
+    details: 'Use it in the post of the raid or train. A meetup has no groups.',
   },
   guards: [requireParty],
   parts: [joinGroup, newGroup, labelGroup],
```

Apply to `src/commands/parties/meet.ts`:

```diff
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -43,18 +43,18 @@ const requireStartChange: Guard = (interaction, ctx) => {
 };
 
 /**
- * `/meet`. In a raid it is the meeting time of the member's group. A meetup has one group and
- * starts for everybody at once: there it sets the start of the meetup (`changeStart`).
+ * `/meet`. In a raid it is the meeting time of the member's group. A train or a meetup starts
+ * for everybody at once: there it sets the start of the party (`changeStart`).
  */
 export const meet: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('meet')
-    .setDescription('Set when your group meets for this raid, or when this meetup starts')
+    .setDescription('Set when your group meets for this raid, or when this train or meetup starts')
     .addStringOption((option) =>
       option
         .setName('time')
         .setDescription(
-          'Raid: minutes (20), a time (6:15pm) or "hatch". Meetup: 6:15pm, 10-17 6:15pm, in 30',
+          'Raid: 20 (minutes), 6:15pm or "hatch". Train or meetup: 6:15pm, 10-17 6:15pm, in 30',
         )
         .setRequired(true)
         .setMaxLength(40),
@@ -65,10 +65,10 @@ export const meet: SimpleCommand = {
       'In the post of a raid: sets the meeting time of the group you are in and tells the ' +
       'others of the group. The time must lie between now (or the hatch) and the end of the ' +
       'raid; `hatch` means the hatch time, `cancel` removes the meeting time. A while after it, ' +
-      'those who are here are asked whether they are done. In the post of a meetup: sets when ' +
-      'the meetup starts, for everybody, and tells the others who are signed up. Give a clock ' +
+      'those who are here are asked whether they are done. In the post of a train or meetup: sets when ' +
+      'it starts, for everybody, and tells the others who are signed up. Give a clock ' +
       'time, a date and a time, or `in 30` for minutes from now (a bare number is an hour ' +
-      'there); `cancel` removes the start. A time without a date is read on the day the meetup ' +
+      'there); `cancel` removes the start. A time without a date is read on the day the party ' +
       'starts, or else the day it ends, while that day is still to come, and otherwise on ' +
       "today's date; a date comes first, month-day (`10-14 6pm`). " +
       'You must be signed up.',
@@ -113,12 +113,14 @@ export const meet: SimpleCommand = {
 export const cancelMeet: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('cancel-meet')
-    .setDescription('Remove the meeting time of your group, or the start time of this meetup'),
+    .setDescription(
+      'Remove the meeting time of your group, or the start time of this train or meetup',
+    ),
   help: {
     category: 'basic-raid',
     details:
       'In the post of a raid: removes the meeting time of the group you are in and tells the ' +
-      'others. In the post of a meetup: removes its start time. You must be signed up.',
+      'others. In the post of a train or meetup: removes its start time. You must be signed up.',
   },
   guards: [requireParty, requireStartChange],
   throttle: meetThrottle,
```

Apply to `src/commands/parties/name.ts`:

```diff
--- a/src/commands/parties/name.ts
+++ b/src/commands/parties/name.ts
@@ -10,14 +10,14 @@ import { answerTimedChange } from './timed.js';
 
 /**
  * `/name` (spec 4.2): another name for the party of this post, when it is a party that has a
- * name: a meetup, and a train from plan 3B. Anybody in the post may; the post says who did it,
+ * name: a train or a meetup. Anybody in the post may; the post says who did it,
  * and its title follows (within what Discord allows: two renames of a post in ten minutes, the
  * newest name wins).
  */
 export const name: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('name')
-    .setDescription('Rename this meetup')
+    .setDescription('Rename this train or meetup')
     .addStringOption((option) =>
       option
         .setName('name')
@@ -28,7 +28,7 @@ export const name: SimpleCommand = {
   help: {
     category: 'meetup',
     details:
-      'Use it in the post of the meetup. The post says who renamed it. The title of the post ' +
+      'Use it in the post of the train or meetup. The post says who renamed it. The title of the post ' +
       'follows; Discord lets a post be renamed twice in ten minutes, so a third name within ' +
       'that time shows a little later.',
     examples: ['/name name:Community Day picnic, by the lake'],
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -248,7 +248,7 @@ export function leftWords(ok: { party: Party }): string {
 
 /**
  * What Done answers: whether the others were asked, or that nothing changed. In a party where
- * done means leave (a meetup), that the member has left.
+ * done means leave (a train, a meetup), that the member has left.
  */
 export function doneWords(ok: {
   party: Party;
```

Apply to `src/commands/parties/shout.ts`:

```diff
--- a/src/commands/parties/shout.ts
+++ b/src/commands/parties/shout.ts
@@ -16,7 +16,7 @@ export const MAX_SHOUT = 500;
 
 /**
  * `/shout` (spec 4.2): a member's message to everybody else who is signed up for the raid or
- * meetup and not done, said by the bot in the post so that it can ping them.
+ * train or meetup and not done, said by the bot in the post so that it can ping them.
  */
 export const shout: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -32,10 +32,10 @@ export const shout: SimpleCommand = {
   help: {
     category: 'basic-raid',
     details:
-      'For members who are signed up for the raid or meetup. ' +
+      'For members who are signed up for the raid, train or meetup. ' +
       'Says your message in the post and pings everybody else who is signed up and not done, ' +
       'in every group, unless they switched such pings off. For what cannot wait: the lobby is ' +
-      'starting, the gym was wrong. Use it in the post of the raid or meetup.',
+      'starting, the gym was wrong. Use it in the post of the raid, train or meetup.',
     examples: ['/shout message:Starting the lobby in two minutes'],
   },
   guards: [requireParty],
```

Apply to `src/commands/parties/status.ts`:

```diff
--- a/src/commands/parties/status.ts
+++ b/src/commands/parties/status.ts
@@ -1,35 +1,41 @@
 import { SlashCommandBuilder } from 'discord.js';
 import type { Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, regionChannelOf, requireGuild, requireRaid } from '../../discord/guards.js';
+import {
+  partyOf,
+  regionChannelOf,
+  requireGuild,
+  requireRaidOrTrain,
+} from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { isRaid, partyWord } from '../../domain/party/party.js';
+import { isMeetup, isTrain, partyWord } from '../../domain/party/party.js';
+import { currentStop } from '../../domain/party/train.js';
+import { problemText } from '../../render/activity.js';
 import { gymMapsUrl } from '../../render/raid-post.js';
 import { plain } from '../../render/text.js';
-import { IN_A_RAID_POST } from '../raids/change.js';
-import { ACTION_THROTTLE, commandRaid, partyOver } from './reply.js';
+import { ACTION_THROTTLE, commandParty, partyOver } from './reply.js';
 
 /** Every use in a post sends a message with an embed into it. */
 export const STATUS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };
 
 /**
- * `/status` (spec 4.2). In the post of a raid or a meetup: its message once more at the bottom
+ * `/status` (spec 4.2). In the post of a party: its message once more at the bottom
  * of the post, with its buttons, where the lines of the bot and the chat have pushed the first
  * message out of sight; the copy of an earlier `/status` is deleted. In a region's channel or
- * forum: the list of that region's raids and meetups, for the member alone.
+ * forum: the list of that region's raids, trains and meetups, for the member alone.
  */
 export const status: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('status')
     .setDescription(
-      'Show this raid or meetup again at the bottom of its post, or list what a region has',
+      'Show this raid, train or meetup again at the bottom of its post, or list what a region has',
     ),
   help: {
     category: 'basic-raid',
     details:
-      'In the post of a raid or a meetup: puts it, with who is coming and the buttons, at the ' +
+      'In the post of a raid, a train or a meetup: puts it, with who is coming and the buttons, at the ' +
       'bottom of the post again, so nobody has to scroll up. In the channel of a region: shows ' +
-      'you the raids of that region that are going on and its meetups, as the pinned list of ' +
+      'you the raids of that region that are going on, its trains and its meetups, as the pinned list of ' +
       'its forum does.',
     examples: ['/status'],
   },
@@ -49,7 +55,7 @@ export const status: SimpleCommand = {
     const region = channelId === undefined ? undefined : ctx.regions.byChannel(channelId);
     if (!region) {
       throw new UserError(
-        'Use this in the channel of a region, or in the post of a raid or meetup.',
+        'Use this in the channel of a region, or in the post of a raid, train or meetup.',
       );
     }
     await interaction.editReply({ content: ctx.partyService.summaryText(region.id) });
@@ -57,35 +63,63 @@ export const status: SimpleCommand = {
 };
 
 /**
- * For `/where`: the post of a party that is at a gym, which is a raid (and will be a train, at
- * the gym it has reached). A meetup is at none, and the member is told that rather than that
- * the command is for raids.
+ * For `/where`: the post of a party that is at a gym, which is a raid, and a train at the stop
+ * it has reached. A meetup is at none, and the member is told that rather than that the command
+ * is for raids.
  */
 const requireGym: Guard = (interaction, ctx) => {
   const party = partyOf(interaction, ctx);
-  if (party && !isRaid(party)) {
+  if (party && isMeetup(party)) {
     throw new UserError(`A ${partyWord(party)} is at no gym, so there is no place to show.`);
   }
-  return requireRaid(interaction, ctx);
+  return requireRaidOrTrain(interaction, ctx);
 };
 
-/** `/where` (spec 4.2): where the raid's gym is, as a link and a map, for the member alone. */
+/**
+ * `/where` (spec 4.2): where the gym of the raid is, or the stop a train is at, as a link and a
+ * map, for the member alone.
+ */
 export const where: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('where')
-    .setDescription('Show where the gym of this raid is'),
+    .setDescription('Show where the gym of this raid is, or the stop this train is at'),
   help: {
     category: 'basic-raid',
-    details: `Shows you a link to the gym in Google Maps and a map of its surroundings. ${IN_A_RAID_POST}`,
+    details:
+      'Shows you a link to the gym in Google Maps and a map of its surroundings: the gym of a ' +
+      'raid, or the stop a train is at. Use it in the post of the raid or train.',
     examples: ['/where'],
   },
   guards: [requireGym],
   defer: 'ephemeral',
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandRaid(interaction, ctx);
-    const gym = party.gymId === null ? undefined : ctx.gyms.get(party.gymId);
-    if (!gym) throw new UserError('I no longer know the gym of this raid.');
+    const party = commandParty(interaction, ctx);
+    if (isMeetup(party)) {
+      throw new UserError(`A ${partyWord(party)} is at no gym, so there is no place to show.`);
+    }
+    let gymId: number | null | undefined;
+    if (isTrain(party)) {
+      // The gym of a train is the stop it is at; before its route and after it, it is at none.
+      gymId = currentStop(party);
+      if (gymId === undefined) {
+        throw new UserError(
+          party.train.route.length === 0
+            ? problemText('no-route', ctx.attendance.limits(), 'train')
+            : 'This train has finished its route: it is at no gym.',
+        );
+      }
+    } else {
+      gymId = party.gymId;
+    }
+    const gym = gymId === null ? undefined : ctx.gyms.get(gymId);
+    if (!gym) {
+      throw new UserError(
+        isTrain(party)
+          ? 'I no longer know the gym this train is at.'
+          : 'I no longer know the gym of this raid.',
+      );
+    }
     // A nickname that was cleared to an empty text names nothing, so it is tested for truth.
     const name = gym.nickname
       ? `**${plain(gym.nickname)}** (${plain(gym.name)})`
```

Apply to `src/commands/parties/timed.ts`:

```diff
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -18,7 +18,7 @@ import { actingMember, partyOver } from './reply.js';
  */
 export const START_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };
 
-/** How a time is to be typed for a meetup: a bare number is an hour there, not minutes. */
+/** How a time is to be typed for a train or meetup: a bare number is an hour there, not minutes. */
 export const TIMED_TIME_HINT =
   'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';
 
```

Apply to `src/commands/raids/boss.ts`:

```diff
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -1,20 +1,82 @@
-import { SlashCommandBuilder, type AutocompleteInteraction } from 'discord.js';
+import {
+  MessageFlags,
+  SlashCommandBuilder,
+  type AutocompleteInteraction,
+  type ChatInputCommandInteraction,
+} from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { raidOf, requireRaid } from '../../discord/guards.js';
+import {
+  notARaidOrTrain,
+  partyOf,
+  raidOf,
+  requireRaid,
+  requireRaidOrTrain,
+} from '../../discord/guards.js';
+import { isRaid, isTrain, type RaidBossRef, type TrainParty } from '../../domain/party/party.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { matchNamed } from '../../domain/search/word-match.js';
 import { problemText } from '../../render/activity.js';
 import { plain, truncate } from '../../render/text.js';
-import { commandRaid } from '../parties/reply.js';
+import { commandParty, commandRaid, partyOver } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
-import { bossChoices, MAX_CHOICES, reportedBoss } from './raid-input.js';
+import {
+  bossChoices,
+  MAX_CHOICES,
+  reportedBoss,
+  trainBoss,
+  trainBossChoices,
+} from './raid-input.js';
+
+/** What a member is told who gives a train the tier of an egg. */
+const NO_TIER =
+  'A train has no tier: name the Pokémon it is after, such as `yveltal`, or `none` for no boss.';
+
+/** The words that take the boss off a train again. */
+const NO_BOSS = new Set(['none', 'cancel', 'unset', 'clear']);
+
+/**
+ * `/boss` in the post of a train: which Pokémon the train is after, for the picture and what
+ * the post says about that boss. A train has no tier (it goes from raid to raid): a tier before
+ * a name is ignored and the tier of an egg is refused, and the Pokémon need not be a boss right
+ * now (`trainBoss`). `none` takes the boss off again.
+ */
+async function setTrainBoss(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  party: TrainParty,
+  text: string,
+): Promise<void> {
+  const member = changingMember(interaction);
+  let change: { boss: RaidBossRef | null; label: string };
+  if (NO_BOSS.has(text.trim().toLowerCase())) {
+    change = { boss: null, label: '' };
+  } else {
+    change = trainBoss(ctx, text, NO_TIER);
+  }
+  const outcome = await ctx.trains.setBoss(party.id, member, change);
+  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
+  if (outcome.kind === 'refused') {
+    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
+  }
+  const said =
+    change.boss === null
+      ? outcome.changed
+        ? 'This train is after no boss any more.'
+        : 'This train was after no boss.'
+      : outcome.changed
+        ? `This train is now after ${change.label}.`
+        : `This train is after ${change.label} already.`;
+  await interaction.reply({ content: said, flags: MessageFlags.Ephemeral });
+}
 
 export const boss: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('boss')
-    .setDescription('Set the boss of this raid, or the tier of its egg')
+    .setDescription(
+      'Set the boss of this raid or the tier of its egg, or the boss a train is after',
+    )
     .addStringOption((option) =>
       option
         .setName('pokemon')
@@ -28,14 +90,24 @@ export const boss: SimpleCommand = {
     details:
       'For an egg whose boss is known now, or a raid that was reported wrongly. The times stay ' +
       'as they are: naming the boss does not hatch the egg. A boss that has only one fast or ' +
-      `one charged move gets it set. ${IN_A_RAID_POST}`,
+      `one charged move gets it set. ${IN_A_RAID_POST} In the post of a train: says which ` +
+      'Pokémon the train is after, which the post then shows with its weaknesses and catch ' +
+      'CP. It may be any Pokémon, also one that is no boss right now; a train has no tier, ' +
+      'and `none` takes the boss off again.',
     examples: ['/boss pokemon:yveltal', '/boss pokemon:t3'],
   },
-  guards: [requireRaid],
+  guards: [requireRaidOrTrain],
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
-    const party = commandRaid(interaction, ctx);
-    const reported = reportedBoss(ctx, interaction.options.getString('pokemon', true));
+    const here = commandParty(interaction, ctx);
+    const text = interaction.options.getString('pokemon', true);
+    if (isTrain(here)) {
+      await setTrainBoss(interaction, ctx, here, text);
+      return;
+    }
+    if (!isRaid(here)) throw new UserError(notARaidOrTrain(here));
+    const party = here;
+    const reported = reportedBoss(ctx, text);
     const outcome = await ctx.raids.setBoss(party.id, changingMember(interaction), reported);
     await answerRaidChange(
       interaction,
@@ -49,7 +121,12 @@ export const boss: SimpleCommand = {
     );
   },
   async autocomplete(interaction, ctx) {
-    await interaction.respond(bossChoices(ctx, interaction.options.getFocused()));
+    const typed = interaction.options.getFocused();
+    // A train has no tier: its list has no eggs, and any Pokémon after the current bosses.
+    const here = partyOf(interaction, ctx);
+    await interaction.respond(
+      here && isTrain(here) ? trainBossChoices(ctx, typed) : bossChoices(ctx, typed),
+    );
   },
 };
 
```

Apply to `src/commands/raids/change.ts`:

```diff
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -134,18 +134,18 @@ export const hatch: SimpleCommand = {
 };
 
 /**
- * `/end`: when a raid ends (its hatch time follows), or when a meetup ends. In a meetup anybody
+ * `/end`: when a raid ends (its hatch time follows), or when a train or meetup ends. There anybody
  * in the post may set it, and `none` removes it (`changeEnd`).
  */
 export const end: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('end')
-    .setDescription('Set when this raid or meetup ends')
+    .setDescription('Set when this raid, train or meetup ends')
     .addStringOption((o) =>
       o
         .setName('time')
         .setDescription(
-          'Raid: minutes left (20) or a time (6:15pm). Meetup: 6:15pm, 10-17 6:15pm, in 90, none',
+          'Raid: minutes left (20) or 6:15pm. Train or meetup: 6:15pm, 10-17 6:15pm, in 90, none',
         )
         .setRequired(true)
         .setMaxLength(40),
@@ -154,12 +154,12 @@ export const end: SimpleCommand = {
     category: 'raid-crud',
     details:
       'In the post of a raid: sets the end time; the hatch time follows from it. Give the ' +
-      'minutes that are left or a clock time. In the post of a meetup: sets when it ends. Give ' +
+      'minutes that are left or a clock time. In the post of a train or meetup: sets when it ends. Give ' +
       'a clock time, a date and a time, or `in 90` for minutes from now (a bare number is an ' +
       'hour there); `none` removes the end. A time without a date is read on the day the ' +
-      'meetup starts, or else the day it ends, while that day is still to come, and otherwise ' +
+      'party starts, or else the day it ends, while that day is still to come, and otherwise ' +
       "on today's date; a date comes first, month-day (`10-14 9pm`). A " +
-      'meetup without an end is taken to be over a day after it started; one without any time ' +
+      'train or meetup without an end is taken to be over a day after it started; one without any time ' +
       'is archived a day after it was made, or after its last time was removed.',
     examples: ['/end time:20', '/end time:6:15pm', '/end time:10-17 9pm', '/end time:none'],
   },
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -331,6 +331,130 @@ export function reportedBoss(ctx: AppContext, value: string): ReportedBoss {
   );
 }
 
+/** A Pokémon as what a train is after: its reference, and its name made plain for a sentence. */
+export interface TrainBoss {
+  boss: RaidBossRef;
+  label: string;
+}
+
+const afterBoss = (boss: RaidBoss): TrainBoss => ({
+  boss: raidBossRef(boss),
+  label: plain(boss.entry?.name ?? boss.name),
+});
+
+const afterEntry = (entry: PokemonEntry): TrainBoss => ({
+  boss: { key: entry.key },
+  label: plain(entry.name),
+});
+
+/** The bosses of a list, each Pokémon once, whatever tiers it is a boss in. */
+function onePerPokemon(bosses: readonly RaidBoss[]): RaidBoss[] {
+  const seen = new Set<string>();
+  return bosses.filter((boss) => {
+    const identity = boss.entry ? `key:${boss.entry.key}` : `name:${boss.name}`;
+    if (seen.has(identity)) return false;
+    seen.add(identity);
+    return true;
+  });
+}
+
+/**
+ * The choices for the `pokemon` option of `/boss` in the post of a train: the current bosses,
+ * each Pokémon once and without its tier, narrowed to what was typed, and then any Pokémon that
+ * fits the text (a train may be planned for a boss that is coming). No eggs: a train has no
+ * tier.
+ */
+export function trainBossChoices(ctx: AppContext, typed: string): Choice[] {
+  const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
+  const fits = (name: string): boolean => {
+    const lower = name.toLowerCase();
+    return words.every((word) => lower.includes(word));
+  };
+  const choices = onePerPokemon(ctx.raidBosses.bosses())
+    .map((boss) => ({
+      name: boss.entry?.name ?? boss.name,
+      // A boss the game master does not know is found on the list again by its own key.
+      value: boss.entry ? `p:${boss.entry.key}` : `b:${boss.key}:${tierCode(boss.tier)}`,
+    }))
+    .filter((choice) => choice.value.length <= 100 && fits(choice.name));
+  if (words.length > 0) {
+    const listed = new Set(choices.map((choice) => choice.value));
+    for (const entry of ctx.pokemon.search(typed, { limit: MAX_CHOICES })) {
+      const value = `p:${entry.key}`;
+      if (!listed.has(value) && value.length <= 100) choices.push({ name: entry.name, value });
+    }
+  }
+  return choices
+    .slice(0, MAX_CHOICES)
+    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
+}
+
+/**
+ * The Pokémon the `pokemon` option of `/boss` names in the post of a train: a choice of the
+ * list, or typed text. A train has no tier, so none of what a tier means to a raid applies: a
+ * tier typed before a name is ignored, and a tier alone is refused with `noTier`. A current
+ * boss is found by its name as in a raid; any other Pokémon is taken when the text names it
+ * outright (`ctx.pokemon.exact`), also when it is no boss right now. Throws a `UserError` that
+ * says what would work, and never speaks of a raid, a tier to put first or a report.
+ */
+export function trainBoss(ctx: AppContext, value: string, noTier: string): TrainBoss {
+  const text = value.trim();
+  const bosses = ctx.raidBosses.bosses();
+  const [kind, ...parts] = text.split(':');
+  if (kind === 'e' && parts.length === 2 && tierFromCode(parts[0], parts[1])) {
+    throw new UserError(noTier);
+  }
+  if (kind === 'p' && parts.length === 1) {
+    const entry = ctx.gameData.catalogue.byKey(parts[0] ?? '');
+    if (entry) return afterEntry(entry);
+    throw new UserError('I do not know that Pokémon any more. Pick again from the list.');
+  }
+  if (kind === 'b' && parts.length === 3) {
+    const tier = tierFromCode(parts[1], parts[2]);
+    const boss = tier && bosses.find((b) => b.key === parts[0] && sameRaidTier(b.tier, tier));
+    if (boss) return afterBoss(boss);
+    throw new UserError('That boss is no longer on the list. Pick again from the list.');
+  }
+  /** The one Pokémon a text names in full: a current boss, or any Pokémon. */
+  const named = (name: string): TrainBoss | undefined => {
+    const [boss, ...more] = onePerPokemon(exactBosses(bosses, name, bossFullNames));
+    if (boss && more.length === 0) return afterBoss(boss);
+    const entry = compact(name).length > 1 ? ctx.pokemon.exact(name) : undefined;
+    return entry && afterEntry(entry);
+  };
+  const whole = named(text);
+  if (whole) return whole;
+  // `mega charizard` names two Pokémon, and is no tier with a name after it.
+  if (/^mega\b/i.test(text)) {
+    const megas = megaForms(ctx, text);
+    const [only] = megas;
+    if (only && megas.length === 1) return afterEntry(only);
+    if (megas.length > 1) throw couldBeEntries(text, megas);
+  }
+  const typedTier = leadingTier(text);
+  if (typedTier && typedTier.rest === '') throw new UserError(noTier);
+  // What is left once the words of a tier are gone, also a lone `shadow`.
+  const rest = (typedTier ? typedTier.rest : text).replace(/^shadow\s+/i, '');
+  const after = rest === text ? undefined : named(rest);
+  if (after) return after;
+  // By its name and key alone: `shadow <name>`, which finds a shadow boss for a raid, would
+  // make every shadow boss fit the word "shadow".
+  const names = (boss: RaidBoss): string[] => [boss.name, boss.key.replace(/_/g, ' ')];
+  const [first, ...others] = onePerPokemon(partialBosses(bosses, rest, names));
+  if (first && others.length === 0) return afterBoss(first);
+  if (first) {
+    const names = [first, ...others].slice(0, 3).map((boss) => afterBoss(boss).label);
+    const last = names.pop() ?? '';
+    throw new UserError(
+      `"${plain(truncate(rest, 80))}" could be ${names.join(', ')} or ${last}. ` +
+        'Pick one from the list.',
+    );
+  }
+  throw new UserError(
+    `I do not know a Pokémon called "${plain(truncate(rest, 80))}". Pick one from the list.`,
+  );
+}
+
 /**
  * The gyms a text names, seen from a region channel: the region's own and those just outside it,
  * as `ctx.gyms.search` orders them. When none of them has every word, the search goes on to the
```

Apply to `src/discord/command.ts`:

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -51,7 +51,7 @@ export interface CommandHandler {
   /**
    * How often one member may use this. A use counts once the guards have let it through. A
    * function, asked after the guards, for a command whose uses cost more in one place than in
-   * another (`/meet` pings a group in a raid and everybody in a meetup); each limit it gives
+   * another (`/meet` pings a group in a raid and everybody in a train or meetup); each limit it gives
    * is counted by itself.
    */
   throttle?:
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -200,6 +200,23 @@ function requirePartyOf(fits: (party: Party) => boolean, wanted: string): Guard
 /** For commands that are about a raid as such: its egg, boss, gym. */
 export const requireRaid: Guard = requirePartyOf(isRaid, 'a raid');
 
+/** The kinds of party that are at a gym and can have a boss, as a sentence names them. */
+export const A_RAID_OR_TRAIN = 'a raid or train';
+
+/** What a member is told who uses something that is for raids and trains in a meetup's post. */
+export function notARaidOrTrain(party: Pick<Party, 'type'>): string {
+  return wrongPost(party, A_RAID_OR_TRAIN);
+}
+
+/**
+ * For commands that are about the boss or the gym of a party (`/boss`, `/where`): a raid, and a
+ * train, which is after a boss and at the stop it has reached.
+ */
+export const requireRaidOrTrain: Guard = requirePartyOf(
+  (party) => !isMeetup(party),
+  A_RAID_OR_TRAIN,
+);
+
 /**
  * The kinds of party that have a name and times of their own (`TimedParty`), as a sentence
  * names where a command for them works.
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts src/commands/parties/in-train.test.ts src/commands/parties/status.test.ts src/commands/raids/raid-only.test.ts src/commands/util/help-render.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff c142df9 -- src test   # must print nothing
npx prettier --check src/app-context.ts src/commands/admin/save-party.test.ts src/commands/admin/save-party.ts src/commands/parties/attendance.ts src/commands/parties/delete.ts src/commands/parties/group.ts src/commands/parties/in-train.test.ts src/commands/parties/meet.ts src/commands/parties/name.ts src/commands/parties/reply.ts src/commands/parties/shout.ts src/commands/parties/status.test.ts src/commands/parties/status.ts src/commands/parties/timed.ts src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/raid-input.ts src/commands/raids/raid-only.test.ts src/commands/util/help-render.test.ts src/discord/command.ts src/discord/guards.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/app-context.ts src/commands/admin/save-party.test.ts src/commands/admin/save-party.ts src/commands/parties/attendance.ts src/commands/parties/delete.ts src/commands/parties/group.ts src/commands/parties/in-train.test.ts src/commands/parties/meet.ts src/commands/parties/name.ts src/commands/parties/reply.ts src/commands/parties/shout.ts src/commands/parties/status.test.ts src/commands/parties/status.ts src/commands/parties/timed.ts src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/raid-input.ts src/commands/raids/raid-only.test.ts src/commands/util/help-render.test.ts src/discord/command.ts src/discord/guards.ts
git commit -m "The existing commands and controls in a train" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,498 unit tests.

---

### Task 9: The new commands and buttons: train, route, conductor, next, previous, skip, finish

**Files:**
- Create: `src/commands/trains/conductor.ts`, `src/commands/trains/move.test.ts`, `src/commands/trains/move.ts`, `src/commands/trains/route.test.ts`, `src/commands/trains/route.ts`, `src/commands/trains/train.test.ts`, `src/commands/trains/train.ts`
- Modify: `src/commands/index.ts`, `src/commands/meetups/meetup.ts`, `src/commands/parties/in-train.test.ts`, `src/commands/parties/reply.ts`, `src/commands/parties/timed.ts`, `src/components/party.ts`, `src/discord/guards.ts`

**Interfaces:**
- Consumes: Tasks 2 to 8; `/meetup` (its guard `requirePlaceForNew` is shared from now on), `commandTimed`, the party controls' handler, `src/commands/index.ts`.
- Produces: `/train` (`trains/train.ts`: `train`, `TRAIN_THROTTLE`, `TRAIN_FROM_A_REGION`), `/route show|add|remove|move|clear|save|load|forget` (`trains/route.ts`), `/conductor set|clear` (`trains/conductor.ts`), `/next`, `/previous`, `/skip`, `/finish`, `openTrainPanel`, `pressTrainPanel`, `trainPlaces` (`trains/move.ts`); `requireTrain`, `trainOf`, `notATrain` (`guards.ts`), `commandTrain`, `noForumYet` (`reply.ts`); the movement actions of the party controls reaching the panel's handler; the help category `train`.

A panel press calls `update` on the panel itself and never goes through `answerClick`. Custom ids are `party:<id>:<move>:<place>[:<target>]` and stay under 100 characters. The saved-route option's value is `id:<n>`; anything else typed is a name.

Reference commit of the prototype for this task: `c0a8199`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/parties/in-train.test.ts`:

```diff
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -17,11 +17,16 @@ import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { attendeeOf } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import { DELETE_REASON_INPUT, deletionForm, TIME_INPUT } from '../../render/party-controls.js';
+import { trainPanel } from '../../render/train-panel.js';
 import { admin } from '../admin/index.js';
 import { info, infoControls } from '../meetups/info.js';
 import { boss, moveset } from '../raids/boss.js';
 import { duration, end, hatch } from '../raids/change.js';
 import { location, locationControls } from '../raids/location.js';
+import { conductor } from '../trains/conductor.js';
+import { finish, next, previous, skip } from '../trains/move.js';
+import { route } from '../trains/route.js';
+import { train } from '../trains/train.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
 import { deleteParty } from './delete.js';
 import { group } from './group.js';
@@ -54,6 +59,13 @@ const all: CommandModule[] = [
   hatch,
   duration,
   location,
+  route,
+  conductor,
+  next,
+  previous,
+  skip,
+  finish,
+  train,
   admin,
 ];
 const START = at('2026-10-13T16:00');
@@ -95,7 +107,12 @@ async function setup(route: readonly number[] = [4, 1, 7]) {
   const told: string[] = [];
   const handle = async (interaction: FakeInteraction) => {
     await router.handle(interaction as never);
-    for (const responder of [interaction.reply, interaction.editReply, interaction.followUp]) {
+    for (const responder of [
+      interaction.reply,
+      interaction.editReply,
+      interaction.followUp,
+      interaction.update,
+    ]) {
       for (const [payload] of responder.mock.calls) {
         const content = (payload as { content?: string } | undefined)?.content;
         if (content !== undefined) told.push(content);
@@ -653,6 +670,7 @@ describe('what is only for raids or only for meetups, in the post of a train', (
 describe('what a member of a train is told', () => {
   it('never calls the train a raid or a meetup, whatever they try in its post', async () => {
     const made = await setup();
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
     const staff = { subcommand: 'save-party', roleNames: ['Admin'] };
     const tries: [string, Record<string, string | number | boolean>?, object?][] = [
       ['leave'],
@@ -709,18 +727,86 @@ describe('what a member of a train is told', () => {
       ['name', { name: '   ' }],
       ['done'],
       ['where'],
+      // What only a train has.
+      ['route', {}, { subcommand: 'show' }],
+      ['route', { gym: 'g:2' }, { subcommand: 'add' }],
+      ['join'],
+      ['route', { gym: 'g:2' }, { subcommand: 'add' }],
+      ['route', { gym: 'g:2' }, { subcommand: 'add' }],
+      ['route', { gym: 'zzzz' }, { subcommand: 'add' }],
+      ['route', { gym: 'pinewood' }, { subcommand: 'add' }],
+      ['route', {}, { subcommand: 'show' }],
+      ['route', { stop: 9 }, { subcommand: 'remove' }],
+      ['route', { stop: 4 }, { subcommand: 'remove' }],
+      ['route', { from: 1, to: 3 }, { subcommand: 'move' }],
+      ['route', { from: 1, to: 9 }, { subcommand: 'move' }],
+      ['route', {}, { subcommand: 'clear' }],
+      ['route', { name: 'Loop' }, { subcommand: 'save' }],
+      ['route', { name: 'Loop' }, { subcommand: 'save' }],
+      ['route', { name: '   ' }, { subcommand: 'save' }],
+      ['route', { route: 'Loop' }, { subcommand: 'load' }],
+      ['route', { route: 'Nothing' }, { subcommand: 'load' }],
+      ['route', { route: 'Loop' }, { subcommand: 'forget' }],
+      ['route', { route: 'Loop' }, { subcommand: 'forget' }],
+      ['next'],
+      ['skip'],
+      ['skip'],
+      ['previous'],
+      ['previous'],
+      ['previous'],
+      ['finish'],
+      ['finish'],
+      ['next'],
+      ['conductor', {}, { subcommand: 'clear' }],
+      ['conductor', {}, { subcommand: 'set' }],
+      ['conductor', {}, { subcommand: 'set' }],
+      ['conductor', {}, { subcommand: 'set', userId: BOB }],
+      ['next', {}, { userId: BOB }],
+      ['conductor', {}, { subcommand: 'clear', userId: BOB }],
+      ['conductor', {}, { subcommand: 'clear' }],
+      ['route', {}, { subcommand: 'clear' }],
+      ['next'],
+      ['train', { name: 'Another one' }],
+      ['train', { name: '   ' }],
     ];
     for (const [command, options, extra] of tries) await made.run(command, options, extra);
-    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A', 'leave']) {
+    // The route was cleared above: the train gets one again, to be moved along.
+    for (const gymId of [4, 1, 7, 2])
+      await made.trains.addStop(made.party.id, { id: ALICE }, gymId);
+    /** A button of the panel as it would be drawn now: with where the train is, and where it leads. */
+    const drawn = (move: string): string => {
+      const buttons = trainPanel({ party: made.current(), gym: (id) => made.ctx.gyms.get(id) });
+      const id = buttons.components[0]?.components.find((button) =>
+        button.custom_id.startsWith(`party:${made.party.id}:${move}:`),
+      )?.custom_id;
+      if (id === undefined) throw new Error(`the panel has no button ${move}`);
+      return id.slice(`party:${made.party.id}:`.length);
+    };
+    const moves = ['next', 'previous', 'skip', 'finish', 'next'];
+    // Real moves, the last one refused: the route is finished by then.
+    await made.click('move');
+    for (const move of moves) await made.click(drawn(move));
+    expect(made.current().train.stop).toBe(4);
+    // A panel that was drawn before the train moved on.
+    await made.click('next:4:1');
+    for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A']) {
       await made.click(action);
     }
+    // The panel of a member who is not signed up, and of one who has left.
+    const panel = ['move', ...moves.map(drawn)];
+    for (const action of panel) await made.click(action, { userId: CAROL });
+    await made.click('leave');
+    for (const action of panel.slice(0, 3)) await made.click(action);
     await made.run('delete', {}, { roleNames: ['Admin'] });
     for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A', 'leave']) {
       // The train is closed by now: a control that is still on screen says so, without a kind.
       await made.click(action);
     }
     expect(made.told.slice(-8)).toEqual(Array.from({ length: 8 }, () => 'This has ended.'));
-    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 16);
+    // What only a train has knows that it was one. (By Bob: Alice has used up her clicks.)
+    for (const action of panel) await made.click(action, { userId: BOB });
+    expect(made.told.slice(-6)).toEqual(Array.from({ length: 6 }, () => 'This train is over.'));
+    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 36);
     // A raid is named only where every kind is ("raid, train or meetup", "raid or train"), and
     // a meetup only beside the train ("train or meetup"). Nothing speaks of a tier or a report.
     const wrong = made.told.filter(
```

Create `src/commands/trains/move.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeButton,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { testGyms, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { createdMeetup, createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { ClickAnswers } from '../../discord/click-answers.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { attendeeOf } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { trainPanel } from '../../render/train-panel.js';
import { conductor } from './conductor.js';
import { finish, next, previous, skip } from './move.js';

const all: CommandModule[] = [next, previous, skip, finish, conductor];

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};
const BRIDGE = `[Veterans Memorial Bridge](<${maps(4)}>)`;
const STACKS = `[The Stacks](<${maps(1)}>)`;
const MURAL = `[Harbor Lighthouse Mural](<${maps(7)}>)`;
const FOUNTAIN = `[Old Stone Fountain](<${maps(2)}>)`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A train on a route of four gyms, with Alice and Bob coming beside the member who made it. */
async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0) {
  const made = await createdTrain({ route });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const context =
    windowMs === 0 ? ctx : { ...ctx, clickAnswers: new ClickAnswers({ log: ctx.log, windowMs }) };
  const router = new InteractionRouter(context, all, [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command used in the post of the train, by Alice unless `extra` says otherwise. */
  const run = (commandName: string, extra: object = {}) =>
    handle(
      fakeChatInput({ commandName, ...inPost, userId: ALICE, displayName: 'Alice', ...extra }),
    );
  const answer = async (commandName: string, extra?: object): Promise<string | undefined> =>
    sent((await run(commandName, extra)).reply).content;
  /** A press on a control of the train, by Alice unless `extra` says otherwise. */
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
  /** The panel as it would be drawn now. */
  const panel = () => trainPanel({ party: made.current(), gym: (id) => ctx.gyms.get(id) });
  /** A press on a button of that panel: it carries where the train is, and where it leads. */
  const press = (move: string, extra: object = {}) => {
    const drawn = panel().components[0]?.components.find((button) =>
      button.custom_id.startsWith(`party:${made.party.id}:${move}:`),
    );
    if (!drawn) throw new Error(`the panel has no button ${move}`);
    return handle(
      fakeButton({
        customId: drawn.custom_id,
        channelId: made.postId,
        userId: ALICE,
        displayName: 'Alice',
        ...extra,
      }),
    );
  };
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.trains.flush();
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  return { ...made, ctx, handle, run, answer, click, press, lines, panel, inPost };
}

describe('/next, /previous, /skip and /finish', () => {
  it('/next moves the train to its next stop, tells the member where it is, and the others in the post', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
    const used = await made.run('next');
    expect(used.reply).toHaveBeenCalledWith({
      content: `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
      flags: MessageFlags.Ephemeral,
    });
    expect(made.current().train.stop).toBe(1);
    // Who was here is on the way to the next stop.
    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Coming);
    expect(await made.lines()).toEqual([
      `<@${BOB}> is here.`,
      `The train is moving to ${STACKS}. Moved by <@${ALICE}>.`,
      `<@${REPORTER}> <@${BOB}>`,
    ]);
    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
      users: [REPORTER, BOB],
    });
    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
    expect(embed?.description).toContain(`**Now at** [The Stacks](${maps(1)})`);
  });

  it('each says where the train is afterwards', async () => {
    const made = await setup();
    expect(await made.answer('skip')).toBe(
      `The train is at stop 3 of 4: ${MURAL}. Next is ${FOUNTAIN}. I am telling the others.`,
    );
    expect(await made.answer('previous')).toBe(
      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
    );
    expect(await made.answer('finish')).toBe(
      'The train has finished its route of 4 stops. I am telling the others.',
    );
    expect(await made.answer('previous')).toBe(
      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop. I am telling the others.`,
    );
    // From the last stop, next finishes the route.
    expect(await made.answer('next')).toBe(
      'The train has finished its route of 4 stops. I am telling the others.',
    );
    expect(made.current()).toMatchObject({ status: 'active', train: { stop: 4 } });
  });

  it('refuse a move that cannot be made, with the reason', async () => {
    const made = await setup();
    expect(await made.answer('previous')).toBe('This train is at its first stop.');
    await made.run('finish');
    expect(await made.answer('next')).toBe('This train has finished its route.');
    expect(await made.answer('finish')).toBe('This train has finished its route.');
    expect(await made.answer('skip')).toBe('There is no stop after the next one to skip to.');
    const empty = await setup([]);
    for (const command of ['next', 'previous', 'skip', 'finish']) {
      expect(await empty.answer(command)).toBe(
        'This train has no route yet. Add its stops with `/route add`.',
      );
    }
    expect(await empty.lines()).toEqual([]);
  });

  it('are for anybody who is signed up while there is no conductor', async () => {
    const made = await setup();
    expect(await made.answer('next', { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(await made.answer('next', { userId: BOB })).toMatch(/^The train is at stop 2 of 4/);
    // Moderators may, signed up or not.
    expect(await made.answer('next', { userId: CAROL, roleNames: ['Moderator'] })).toMatch(
      /^The train is at stop 3 of 4/,
    );
  });

  it('are for the conductor and the moderators alone once there is a conductor', async () => {
    const made = await setup();
    await made.trains.setConductor(made.party.id, { id: BOB });
    for (const command of ['next', 'previous', 'skip', 'finish']) {
      expect(await made.answer(command)).toBe(
        'This train has a conductor: only they and the moderators can move it.',
      );
    }
    expect(made.current().train.stop).toBe(0);
    expect(await made.answer('next', { userId: BOB })).toMatch(/^The train is at stop 2 of 4/);
    expect(await made.answer('next', { roleNames: ['Admin'] })).toMatch(
      /^The train is at stop 3 of 4/,
    );
    // A bot developer is no moderator of raids.
    expect(await made.answer('next', { roleNames: ['Bot Developer'] })).toBe(
      'This train has a conductor: only they and the moderators can move it.',
    );
  });

  it('do not say that the others are told when there are none', async () => {
    const made = await createdTrain({ route: [4, 1] });
    const { ctx } = createTestContext({
      partyService: made.service,
      attendance: made.attendance,
      trains: made.trains,
      parties: made.store,
      regions: made.regions,
    });
    const used = fakeChatInput({
      commandName: 'next',
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: REPORTER,
    });
    await new InteractionRouter(ctx, all, []).handle(used as never);
    expect(sent(used.reply).content).toBe(
      `The train is at stop 2 of 2: ${STACKS}. It is the last stop.`,
    );
  });

  it('hold back a member who moves the train more than ten times in a minute', async () => {
    const made = await setup();
    // Each command has its own count: ten times there and ten times back.
    for (let n = 0; n < 10; n++) {
      await made.run('next');
      await made.run('previous');
    }
    expect(await made.answer('next')).toBe('You can use /next again in 1 minute.');
    expect(made.current().train.stop).toBe(0);
  });

  it('work only in the post of a train', async () => {
    const made = await setup();
    expect(await made.answer('next', { channelId: '600000000000000009', thread: undefined })).toBe(
      'Use this in the post of a train that is still active.',
    );
    const meetup = await createdMeetup();
    const { ctx } = createTestContext({
      partyService: meetup.service,
      attendance: meetup.attendance,
      trains: meetup.trains,
      parties: meetup.store,
      regions: meetup.regions,
    });
    const router = new InteractionRouter(ctx, all, []);
    for (const [commandName, subcommand] of [
      ['next'],
      ['previous'],
      ['skip'],
      ['finish'],
      ['conductor', 'set'],
      ['conductor', 'clear'],
    ] as const) {
      const used = fakeChatInput({
        commandName,
        ...(subcommand ? { subcommand } : {}),
        channelId: meetup.postId,
        thread: { parentId: WEST_FORUM },
        userId: REPORTER,
      });
      await router.handle(used as never);
      expect(sent(used.reply).content).toBe(
        'This is the post of a meetup: that only works in the post of a train.',
      );
    }
  });
});

describe('/conductor', () => {
  it('set makes the member the conductor, and the post says so', async () => {
    const made = await setup();
    expect(await made.answer('conductor', { subcommand: 'set' })).toBe(
      'You are the conductor of this train. Only you and the moderators can move it now.',
    );
    expect(made.current().train.conductorId).toBe(ALICE);
    expect(await made.answer('conductor', { subcommand: 'set' })).toBe(
      'You are the conductor of this train already.',
    );
    expect(await made.lines()).toEqual([`<@${ALICE}> is the conductor of this train now.`]);
    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
    expect(embed?.description).toContain(`Conductor: <@${ALICE}>.`);
  });

  it('set takes over from another conductor, which the post says by name', async () => {
    const made = await setup();
    await made.run('conductor', { subcommand: 'set', userId: BOB });
    expect(await made.answer('conductor', { subcommand: 'set' })).toBe(
      `You are the conductor of this train, in the place of <@${BOB}>. ` +
        'Only you and the moderators can move it now.',
    );
    expect((await made.lines()).at(-1)).toBe(
      `<@${ALICE}> is the conductor of this train now, in the place of <@${BOB}>.`,
    );
    // No line pings anybody.
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.mention).toBeUndefined();
    }
  });

  it('set is for a member who is signed up', async () => {
    const made = await setup();
    expect(await made.answer('conductor', { subcommand: 'set', userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(made.current().train.conductorId).toBeNull();
  });

  it('clear is for the conductor themself and for the moderators', async () => {
    const made = await setup();
    expect(await made.answer('conductor', { subcommand: 'clear' })).toBe(
      'This train has no conductor. Anybody who is signed up can move it.',
    );
    await made.run('conductor', { subcommand: 'set', userId: BOB });
    expect(await made.answer('conductor', { subcommand: 'clear' })).toBe(
      'Only the conductor of this train and the moderators can do that.',
    );
    expect(await made.answer('conductor', { subcommand: 'clear', roleNames: ['Moderator'] })).toBe(
      'This train has no conductor any more. Anybody who is signed up can move it.',
    );
    await made.run('conductor', { subcommand: 'set', userId: BOB });
    expect(await made.answer('conductor', { subcommand: 'clear', userId: BOB })).toBe(
      'You are no longer the conductor of this train. Anybody who is signed up can move it.',
    );
    expect(made.current().train.conductorId).toBeNull();
    expect((await made.lines()).filter((line) => /took|no longer/.test(line))).toEqual([
      `<@${ALICE}> took <@${BOB}> off as the conductor of this train.`,
      `<@${BOB}> is no longer the conductor of this train.`,
    ]);
  });
});

describe('the button "Move train…" and its panel', () => {
  it('opens the panel privately: where the train is, what comes next, and the four moves', async () => {
    const made = await setup();
    const opened = await made.click('move');
    expect(opened.reply).toHaveBeenCalledWith({
      ...made.panel(),
      flags: MessageFlags.Ephemeral,
    });
    expect(sent(opened.reply).content).toBe(
      `The train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}.`,
    );
    // Every button says where the train was when the panel was drawn (at gym 4), and Next and
    // Skip also where they lead: to gym 1, and past it to gym 7.
    const [row] = made.panel().components;
    expect(row?.components.map((button) => button.custom_id)).toEqual(
      ['next:4:1', 'previous:4', 'skip:4:7', 'finish:4'].map(
        (action) => `party:${made.party.id}:${action}`,
      ),
    );
    // Opening it moves nothing and says nothing.
    expect(made.current().train.stop).toBe(0);
    expect(await made.lines()).toEqual([]);
  });

  it('gives who may not move the train the refusal instead of the panel', async () => {
    const made = await setup();
    const stranger = await made.click('move', { userId: CAROL });
    expect(stranger.reply).toHaveBeenCalledWith({
      content: 'You are not signed up for this train.',
      flags: MessageFlags.Ephemeral,
    });
    await made.trains.setConductor(made.party.id, { id: BOB });
    expect(sent((await made.click('move')).reply).content).toBe(
      'This train has a conductor: only they and the moderators can move it.',
    );
    // The conductor and a moderator get the panel.
    expect(sent((await made.click('move', { userId: BOB })).reply).components).toHaveLength(1);
    const moderator = await made.click('move', { userId: CAROL, roleNames: ['Moderator'] });
    expect(sent(moderator.reply).components).toHaveLength(1);
  });

  it('answers with the sentence alone on a train without a route: no panel of dead buttons', async () => {
    const made = await setup([]);
    const opened = await made.click('move');
    expect(opened.reply).toHaveBeenCalledWith({
      content: 'This train has no route yet. Add its stops with `/route add`.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('works on a copy of the message in another channel: the train is the one the button names', async () => {
    const made = await setup();
    const opened = await made.click('move', { channelId: '600000000000000099' });
    expect(sent(opened.reply).content).toMatch(/^The train is at stop 1 of 4/);
    const pressed = await made.press('next', { channelId: '600000000000000099' });
    expect(sent(pressed.update).content).toMatch(/^The train is at stop 2 of 4/);
  });

  it('a press moves the train and changes the panel itself, so that the conductor can go on', async () => {
    const made = await setup();
    const pressed = await made.press('next');
    expect(made.current().train.stop).toBe(1);
    // The panel is edited in place: no new answer, no acknowledgement that leaves it as it was.
    expect(pressed.update).toHaveBeenCalledWith(made.panel());
    expect(pressed.reply).not.toHaveBeenCalled();
    expect(pressed.deferUpdate).not.toHaveBeenCalled();
    expect(sent(pressed.update).content).toBe(
      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`,
    );
    // Each press is made with the buttons of the panel as it was just drawn.
    const skipped = await made.press('skip');
    expect(sent(skipped.update).content).toBe(
      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop.`,
    );
    const back = await made.press('previous');
    expect(sent(back.update).content).toMatch(/^The train is at stop 3 of 4/);
    const finished = await made.press('finish');
    expect(finished.update).toHaveBeenCalledWith(made.panel());
    expect(sent(finished.update).content).toBe('The train has finished its route of 4 stops.');
    // The others are told once, where the train ended up.
    expect(await made.lines()).toEqual([
      `The train has finished its route. Moved by <@${ALICE}>.`,
      `<@${REPORTER}> <@${BOB}>`,
    ]);
  });

  it('updates the panel with every press of a burst: none is swallowed into a gathered answer', async () => {
    // The answers to clicks on the post are gathered for two seconds here, as in the bot.
    const made = await setup([4, 1, 7, 2], 2_000);
    const joined = await made.click('more');
    expect(joined.reply).toHaveBeenCalledOnce();
    // A second click on the post within the window is only acknowledged...
    const again = await made.click('more');
    expect(again.deferUpdate).toHaveBeenCalledOnce();
    // ...but a press in the panel right after it changes the panel.
    const first = await made.press('next');
    const second = await made.press('next');
    for (const pressed of [first, second]) {
      expect(pressed.update).toHaveBeenCalledOnce();
      expect(pressed.deferUpdate).not.toHaveBeenCalled();
      expect(pressed.reply).not.toHaveBeenCalled();
    }
    expect(sent(second.update).content).toMatch(/^The train is at stop 3 of 4/);
    expect(made.current().train.stop).toBe(2);
    await made.ctx.clickAnswers.flush();
  });

  it('moves the train once when two members press Next on panels drawn at the same stop', async () => {
    const made = await setup();
    // Both panels were drawn while the train was at the bridge (gym 4).
    const [alice, bob] = await Promise.all([
      made.click('next:4:1'),
      made.click('next:4:1', { userId: BOB, displayName: 'Bob' }),
    ]);
    expect(made.current().train.stop).toBe(1);
    const moved = `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`;
    const texts = [sent(alice.update).content, sent(bob.update).content].sort();
    // One of them moved it; the other is shown where the train is now, with fresh buttons.
    expect(texts).toEqual([`The train has moved on meanwhile.\n${moved}`, moved].sort());
    for (const pressed of [alice, bob]) {
      expect(sent(pressed.update).components).toEqual(made.panel().components);
    }
    // A press on the fresh buttons moves it on.
    const next = await made.press('next', { userId: BOB });
    expect(sent(next.update).content).toMatch(/^The train is at stop 3 of 4/);
    // And `/next` typed twice still moves twice.
    await Promise.all([made.run('next'), made.run('next', { userId: BOB })]);
    expect(made.current().train.stop).toBe(4);
  });

  it('a panel that no longer shows where the train is does not move it', async () => {
    const made = await setup();
    // Bob moved the train to the end while Alice had the panel open at the first stop.
    await made.trains.move(made.party.id, { id: BOB }, 'finish', false);
    const pressed = await made.click('previous:4');
    expect(made.current().train.stop).toBe(4);
    expect(pressed.update).toHaveBeenCalledWith({
      ...made.panel(),
      content: 'The train has moved on meanwhile.\nThe train has finished its route of 4 stops.',
    });
    // From the panel as it is now, Previous works.
    const back = await made.press('previous');
    expect(sent(back.update).content).toBe(
      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop.`,
    );
    // A button without the place it was drawn at (none is made so) moves nothing either.
    const bare = await made.click('previous');
    expect(sent(bare.update).content).toMatch(/^The train has moved on meanwhile\.\n/);
    expect(made.current().train.stop).toBe(3);
  });

  it('follows the gym, not the number of the stop: an edit that leaves the train where it is keeps the panel good', async () => {
    const made = await setup();
    await made.press('next');
    // The train is at The Stacks (gym 1), which becomes the first stop.
    await made.trains.removeStop(made.party.id, { id: BOB }, 1);
    const pressed = await made.click('next:1:7');
    expect(sent(pressed.update).content).toBe(
      `The train is at stop 2 of 3: ${MURAL}. Next is ${FOUNTAIN}.`,
    );
    // The stop the train is at is removed: the panel drawn there is stale.
    await made.trains.removeStop(made.party.id, { id: BOB }, 2);
    const stale = await made.click('next:7');
    expect(sent(stale.update).content).toBe(
      `The train has moved on meanwhile.\nThe train is at stop 2 of 2: ${FOUNTAIN}. It is the last stop.`,
    );
    expect(made.current().train).toMatchObject({ route: [1, 2], stop: 1 });
  });

  it('does not move the train to another stop than the button promised', async () => {
    const made = await setup();
    // Alice's panel says "Next is The Stacks"; Bob takes The Stacks (gym 1) off the route.
    const opened = await made.click('move');
    expect(sent(opened.reply).content).toContain(`Next is ${STACKS}.`);
    await made.trains.removeStop(made.party.id, { id: BOB }, 2);
    const pressed = await made.click('next:4:1');
    expect(made.current().train.stop).toBe(0);
    expect(pressed.update).toHaveBeenCalledWith({
      ...made.panel(),
      content: `The route has changed meanwhile.\nThe train is at stop 1 of 3: ${BRIDGE}. Next is ${MURAL}.`,
    });
    // The fresh buttons lead where the panel now says.
    const next = await made.press('next');
    expect(sent(next.update).content).toMatch(/^The train is at stop 2 of 3/);
    // Skip promised the stop after the next one: the same.
    const skip = await setup();
    await skip.trains.removeStop(skip.party.id, { id: BOB }, 3);
    const skipped = await skip.click('skip:4:7');
    expect(skip.current().train.stop).toBe(0);
    expect(sent(skipped.update).content).toMatch(/^The route has changed meanwhile\.\n/);
    // A Next or Skip without what it promised (none is made so) moves nothing either.
    const bare = await skip.click('next:4');
    expect(skip.current().train.stop).toBe(0);
    expect(sent(bare.update).content).toMatch(/^The route has changed meanwhile\.\n/);
  });

  it('keeps the ids of its buttons within what Discord takes, whatever the ids of the gyms', async () => {
    const made = await setup();
    const far = { ...made.current().train, route: [4294967295, 4294967294, 4294967293], stop: 0 };
    await made.store.update(made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: far } : party,
    }));
    for (const button of made.panel().components[0]?.components ?? []) {
      expect(button.custom_id.length).toBeLessThanOrEqual(100);
    }
  });

  it('says one sentence for a press that cannot move a finished train', async () => {
    const made = await setup();
    await made.press('finish');
    // The button is switched off, but a press can still arrive.
    const pressed = await made.click('next:end');
    expect(pressed.update).toHaveBeenCalledWith({
      ...made.panel(),
      content: 'The train has finished its route of 4 stops.',
    });
    const first = await setup();
    const back = await first.click('previous:4');
    expect(sent(back.update).content).toBe(
      `This train is at its first stop.\nThe train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}.`,
    );
  });

  it('loses its buttons when the route is gone', async () => {
    const made = await setup();
    await made.trains.clearRoute(made.party.id, { id: BOB }, true);
    const pressed = await made.click('next:4');
    expect(pressed.update).toHaveBeenCalledWith({
      content: 'This train has no route yet. Add its stops with `/route add`.',
      components: [],
    });
  });

  it('loses its buttons for who may no longer move the train, and when the train has ended', async () => {
    const made = await setup();
    await made.trains.setConductor(made.party.id, { id: BOB });
    const refused = await made.press('next');
    expect(refused.update).toHaveBeenCalledWith({
      content: 'This train has a conductor: only they and the moderators can move it.',
      components: [],
    });
    expect(made.current().train.stop).toBe(0);
    await made.attendance.leave(made.party.id, { id: ALICE });
    await made.trains.clearConductor(made.party.id, { id: BOB }, false);
    const left = await made.press('next');
    expect(left.update).toHaveBeenCalledWith({
      content: 'You are not signed up for this train.',
      components: [],
    });
    await made.service.end(made.party.id);
    const over = await made.click('next:4', { userId: BOB });
    expect(over.update).toHaveBeenCalledWith({ content: 'This train is over.', components: [] });
    expect(sent((await made.click('move', { userId: BOB })).reply).content).toBe(
      'This train is over.',
    );
  });

  it('refuses the buttons of a train on a party that is none', async () => {
    const meetup = await createdMeetup();
    const before = meetup.current();
    const { ctx } = createTestContext({
      partyService: meetup.service,
      attendance: meetup.attendance,
      trains: meetup.trains,
      parties: meetup.store,
      regions: meetup.regions,
    });
    const router = new InteractionRouter(ctx, all, [partyButtons]);
    const press = async (action: string) => {
      const pressed = fakeButton({
        customId: `party:${meetup.party.id}:${action}`,
        channelId: meetup.postId,
        userId: REPORTER,
      });
      await router.handle(pressed as never);
      return pressed;
    };
    expect(sent((await press('move')).reply).content).toBe(STALE_COMPONENT);
    expect((await press('next:4')).update).toHaveBeenCalledWith({
      content: 'This train is over.',
      components: [],
    });
    expect(meetup.current()).toBe(before);
  });
});
```

Create `src/commands/trains/route.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, testGyms, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
import { createdMeetup, createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MAX_SAVED_ROUTES } from '../../db/repositories/saved-route-repository.js';
import { InteractionRouter } from '../../discord/router.js';
import { MAX_ROUTE_STOPS } from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { currentStop } from '../../domain/party/train.js';
import type { PostGym } from '../../render/raid-post.js';
import { LIMITS } from '../../render/text.js';
import { TrainService } from '../../services/train-service.js';
import { route } from './route.js';

const maps = (id: number): string => {
  const gym = testGyms().find((found) => found.id === id);
  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
};
const WEST = 1;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

type Options = Record<string, string | number | boolean>;

/** A train on a route of three gyms unless `stops` says otherwise, with Alice coming. */
async function setup(stops: readonly number[] = [4, 1, 7]) {
  const made = await createdTrain({ route: stops });
  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
  await made.attendance.flush();
  for (const message of made.gateway.messagesIn(made.postId)) {
    await made.gateway.deleteMessage(made.postId, message.id);
  }
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [route], []);
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** `/route <subcommand>` in the post of the train, by Alice unless `extra` says otherwise. */
  const run = async (subcommand: string, options: Options = {}, extra: object = {}) => {
    const used = fakeChatInput({
      commandName: 'route',
      subcommand,
      ...inPost,
      userId: ALICE,
      displayName: 'Alice',
      options,
      ...extra,
    });
    await router.handle(used as never);
    return used;
  };
  const answer = async (subcommand: string, options?: Options, extra?: object) =>
    sent((await run(subcommand, options, extra)).reply).content;
  /** The choices a list offers for what was typed into an option. */
  const choices = async (
    subcommand: string,
    focusedName: string,
    focused = '',
    extra: object = {},
  ): Promise<{ name: string; value: string | number }[]> => {
    const typing: FakeInteraction = fakeAutocomplete({
      commandName: 'route',
      subcommand,
      ...inPost,
      userId: ALICE,
      focused,
      focusedName,
      ...extra,
    });
    await router.handle(typing as never);
    return (typing.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string | number }[];
  };
  /** Everything said in the post, line by line, once all of it has gone out. */
  const lines = async (): Promise<string[]> => {
    await made.attendance.flush();
    await made.service.flush();
    return made.said().join('\n').split('\n').filter(Boolean);
  };
  const routeNow = () => made.current().train.route;
  return { ...made, partyLines: made.lines, ctx, run, answer, choices, lines, routeNow, inPost };
}

describe('/route show', () => {
  it('shows the whole route privately, each stop a link, without remembering anything', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    const used = await made.run('show');
    expect(used.reply).toHaveBeenCalledWith({
      content: [
        '**The route of Saturday legendaries**',
        `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
        `**2\\. [The Stacks](<${maps(1)}>)** (the train is here)`,
        `3\\. [Harbor Lighthouse Mural](<${maps(7)}>)`,
      ].join('\n'),
      flags: MessageFlags.Ephemeral,
    });
    expect(used.followUp).not.toHaveBeenCalled();
    // Nothing is put into the post, and the train is as it was.
    await made.trains.flush();
    expect((await made.lines()).filter((line) => /route/i.test(line))).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('is for anybody in the post, and says so when there is no route', async () => {
    const made = await setup();
    expect(await made.answer('show', {}, { userId: CAROL })).toMatch(/^\*\*The route of/);
    const empty = await setup([]);
    expect(await empty.answer('show')).toBe(
      'This train has no route yet. Add its stops with `/route add`.',
    );
  });

  it('shows the longest route whole, in as many messages as it takes', async () => {
    // Twelve gyms exist: the same links again and again are as long as fifty stops would be.
    const made = await setup();
    const { train } = made.current();
    const long = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => 1000 + index);
    await made.store.update(made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: { ...train, route: long } } : party,
    }));
    const gyms = {
      ...made.ctx.gyms,
      get: (id: number) => ({
        ...testGyms()[0],
        id,
        name: `Gym with a long name ${id}`,
        nickname: null,
      }),
    };
    const { ctx } = createTestContext({
      trains: made.trains,
      attendance: made.attendance,
      parties: made.store,
      regions: made.regions,
      gyms: gyms as never,
    });
    const used = fakeChatInput({ commandName: 'route', subcommand: 'show', ...made.inPost });
    await new InteractionRouter(ctx, [route], []).handle(used as never);
    const texts = [
      sent(used.reply).content ?? '',
      ...used.followUp.mock.calls.map(([payload]) => payload.content ?? ''),
    ];
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(LIMITS.content);
    for (const [payload] of used.followUp.mock.calls) {
      expect(payload.flags).toBe(MessageFlags.Ephemeral);
    }
    const stops = texts.join('\n').split('\n').slice(1);
    expect(stops).toHaveLength(MAX_ROUTE_STOPS);
    expect(stops[0]).toMatch(/^\*\*1\\\. \[Gym with a long name 1000\]/);
    expect(stops.at(-1)).toMatch(/^50\\\. \[Gym with a long name 1049\]/);
  });
});

describe('/route add', () => {
  it('adds a gym the member picked or named, and says which stop it is', async () => {
    const made = await setup();
    expect(await made.answer('add', { gym: 'g:2' })).toBe(
      '**Old Stone Fountain** is stop 4 of the route.',
    );
    expect(await made.answer('add', { gym: 'gazebo' })).toBe(
      '**Riverside Park Gazebo** is stop 5 of the route.',
    );
    expect(made.routeNow()).toEqual([4, 1, 7, 2, 11]);
    expect(currentStop(made.current())).toBe(4);
    expect(await made.lines()).toEqual([
      `<@${ALICE}> added stop 4 to the route: **Old Stone Fountain**.`,
      `<@${ALICE}> added stop 5 to the route: **Riverside Park Gazebo**.`,
    ]);
    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
    expect(embed?.fields?.find((field) => /^Route/.test(field.name))?.name).toBe(
      'Route: stop 1 of 5',
    );
  });

  it('takes a gym of another region without asking, and the post stays where it is', async () => {
    const made = await setup();
    // Gym 8 lies in East.
    expect(await made.answer('add', { gym: 'g:8' })).toBe(
      '**Café Élan Fresco** is stop 4 of the route.',
    );
    expect(made.current()).toMatchObject({ regionId: WEST, forumChannelId: WEST_FORUM });
    // The search goes on to the other regions when the train's own has nothing.
    expect(await made.answer('add', { gym: 'starbucks harbor' })).toBe(
      '**Starbucks** is stop 5 of the route.',
    );
    expect(made.routeNow().slice(-2)).toEqual([8, 9]);
  });

  it('says that the train is there when the stop is the first, or follows a finished route', async () => {
    const empty = await setup([]);
    expect(await empty.answer('add', { gym: 'g:4' })).toBe(
      '**Veterans Memorial Bridge** is stop 1 of the route. The train is there now.',
    );
    const made = await setup([4]);
    await made.trains.move(made.party.id, { id: ALICE }, 'finish', false);
    expect(await made.answer('add', { gym: 'g:1' })).toBe(
      '**The Stacks** is stop 2 of the route. The train is there now.',
    );
  });

  it('refuses a gym that is on the route, a member who is not signed up, and a full route', async () => {
    const made = await setup();
    expect(await made.answer('add', { gym: 'g:1' })).toBe('That gym is on the route already.');
    expect(await made.answer('add', { gym: 'g:2' }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(made.routeNow()).toEqual([4, 1, 7]);
    const full = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => 1000 + index);
    await made.store.update(made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: { ...party.train, route: full } } : party,
    }));
    expect(await made.answer('add', { gym: 'g:2' })).toBe('A route has at most 50 stops.');
  });

  it('acts only on a clear hit, and says what it found otherwise', async () => {
    const made = await setup();
    expect(await made.answer('add', { gym: 'zzzz' })).toBe(
      'I found no gym for "zzzz". Type part of its name and pick it from the list.',
    );
    expect(await made.answer('add', { gym: 'g:999' })).toMatch(/^I found no gym for/);
    expect(await made.answer('add', { gym: 'pinewood' })).toMatch(/^Several gyms fit "pinewood" /);
    expect(made.routeNow()).toEqual([4, 1, 7]);
  });

  it('offers the gyms of the region of the train first, without those on the route', async () => {
    const made = await setup();
    const offered = await made.choices('add', 'gym');
    expect(offered.map((choice) => choice.value)).not.toContain('g:4');
    expect(offered.map((choice) => choice.value)).not.toContain('g:1');
    expect(offered.map((choice) => choice.value)).toContain('g:2');
    // A gym of another region is offered with where it lies.
    const far = await made.choices('add', 'gym', 'fresco', {
      guildChannelNames: { [EAST_CHANNEL]: 'east' },
    });
    expect(far).toEqual([{ name: 'Café Élan Fresco · east', value: 'g:8' }]);
  });
});

describe('/route remove and /route move', () => {
  it('remove takes a stop off by its number, and the train stays at its gym', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    expect(await made.answer('remove', { stop: 1 })).toBe(
      '**Veterans Memorial Bridge** is off the route, which has 2 stops now.',
    );
    expect(made.current().train).toMatchObject({ route: [1, 7], stop: 0 });
    expect(currentStop(made.current())).toBe(1);
    expect(await made.answer('remove', { stop: 3 })).toBe(
      'The route has no stop with that number.',
    );
    expect(await made.answer('remove', { stop: 1 }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(await made.answer('remove', { stop: 2 })).toBe(
      '**Harbor Lighthouse Mural** is off the route, which has 1 stop now.',
    );
  });

  it('move puts a stop at the number it is to have, also at the end', async () => {
    const made = await setup();
    expect(await made.answer('move', { from: 1, to: 3 })).toBe(
      '**Veterans Memorial Bridge** is stop 3 of the route now.',
    );
    // The train was at the bridge, and still is.
    expect(made.current().train).toMatchObject({ route: [1, 7, 4], stop: 2 });
    expect(await made.answer('move', { from: 3, to: 3 })).toBe(
      '**Veterans Memorial Bridge** is stop 3 of the route already.',
    );
    expect(await made.answer('move', { from: 2, to: 4 })).toBe(
      'The route has no stop with that number.',
    );
    expect(await made.lines()).toEqual([
      `<@${ALICE}> moved **Veterans Memorial Bridge** to stop 3 of the route.`,
    ]);
  });

  it('lists the route for both, as numbers with names, narrowed by a number or by words', async () => {
    const made = await setup();
    const all = [
      { name: '1. Veterans Memorial Bridge', value: 1 },
      { name: '2. The Stacks', value: 2 },
      { name: '3. Harbor Lighthouse Mural', value: 3 },
    ];
    expect(await made.choices('remove', 'stop')).toEqual(all);
    expect(await made.choices('move', 'from')).toEqual(all);
    expect(await made.choices('move', 'to')).toEqual(all);
    expect(await made.choices('remove', 'stop', '2')).toEqual([all[1]]);
    expect(await made.choices('remove', 'stop', 'light mural')).toEqual([all[2]]);
    expect(await made.choices('remove', 'stop', 'zzz')).toEqual([]);
    expect(await made.choices('remove', 'stop', '9')).toEqual([]);
  });

  it('lists at most twenty-five stops, and finds those further on by their number', async () => {
    const made = await setup();
    const long = Array.from({ length: 30 }, (_, index) => (index % 12) + 1 + index * 100);
    await made.store.update(made.party.id, (party) => ({
      party: party.type === 'train' ? { ...party, train: { ...party.train, route: long } } : party,
    }));
    expect(await made.choices('remove', 'stop')).toHaveLength(25);
    const twos = await made.choices('remove', 'stop', '2');
    // The stop with that very number first, then those that begin with it.
    expect(twos.map((choice) => choice.value)).toEqual([2, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect((await made.choices('remove', 'stop', '30')).map((choice) => choice.value)).toEqual([
      30,
    ]);
  });
});

describe('/route clear', () => {
  it('is for the conductor, and for admins, moderators and bot developers', async () => {
    const made = await setup();
    expect(await made.answer('clear')).toBe(
      'Only the conductor of this train and the moderators can do that.',
    );
    expect(made.routeNow()).toEqual([4, 1, 7]);
    expect(await made.answer('clear', {}, { roleNames: ['Bot Developer'] })).toBe(
      'The route of this train is cleared.',
    );
    expect(made.current().train).toMatchObject({ route: [], stop: 0 });
    expect(await made.answer('clear', {}, { roleNames: ['Moderator'] })).toBe(
      'This train had no route.',
    );
    const led = await setup();
    await led.trains.move(led.party.id, { id: ALICE }, 'next', false);
    await led.trains.setConductor(led.party.id, { id: ALICE });
    expect(await led.answer('clear')).toBe('The route of this train is cleared.');
    // The train is at the start again: the first stop that is added is where it is.
    expect(await led.answer('add', { gym: 'g:2' })).toBe(
      '**Old Stone Fountain** is stop 1 of the route. The train is there now.',
    );
    expect((await led.lines()).filter((line) => /cleared/.test(line))).toEqual([
      `<@${ALICE}> cleared the route.`,
    ]);
  });
});

describe('/route save, load and forget', () => {
  it('save keeps the route for the member and the region, and says how to use it', async () => {
    const made = await setup();
    expect(await made.answer('save', { name: '  Downtown   loop ' })).toBe(
      'I saved this route as **Downtown loop**: 3 stops. `/route load` puts it into a train of ' +
        'this region.',
    );
    expect(made.routes.rows).toMatchObject([
      { memberId: ALICE, regionId: WEST, name: 'Downtown loop', gyms: [4, 1, 7] },
    ]);
    await made.trains.addStop(made.party.id, { id: ALICE }, 2);
    expect(await made.answer('save', { name: 'downtown loop' })).toBe(
      'I replaced your saved route **downtown loop** with this one: 4 stops.',
    );
    expect(made.routes.rows).toHaveLength(1);
    // Saving says nothing in the post.
    expect((await made.lines()).filter((line) => /saved/i.test(line))).toEqual([]);
  });

  it('save refuses a train without a route, a text that is no name, and a twenty-sixth route', async () => {
    const empty = await setup([]);
    expect(await empty.answer('save', { name: 'Loop' })).toBe(
      'This train has no route to save yet.',
    );
    const made = await setup();
    expect(await made.answer('save', { name: '   ' })).toBe('Give a name of 1 to 80 characters.');
    for (let n = 0; n < MAX_SAVED_ROUTES; n++) made.routes.add(ALICE, WEST, `Route ${n}`, [1]);
    expect(await made.answer('save', { name: 'One more' })).toBe(
      'You have 25 saved routes for this region, which is as many as you can keep. Remove one ' +
        'with `/route forget` first, or save under the name of one to replace it.',
    );
    expect(await made.answer('save', { name: 'Route 3' })).toMatch(/^I replaced your saved route/);
  });

  it('load lists the member’s routes of this region, and puts one into the train', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
    const river = made.routes.add(ALICE, WEST, 'River walk', [2, 3, 11]);
    const downtown = made.routes.add(ALICE, WEST, 'Downtown loop', [4]);
    made.routes.add(ALICE, 2, 'Of East', [8]);
    made.routes.add(BOB, WEST, 'Bob’s', [5]);
    expect(await made.choices('load', 'route')).toEqual([
      { name: 'Downtown loop (1 stop)', value: `id:${downtown.id}` },
      { name: 'River walk (3 stops)', value: `id:${river.id}` },
    ]);
    expect(await made.choices('load', 'route', 'riv')).toEqual([
      { name: 'River walk (3 stops)', value: `id:${river.id}` },
    ]);
    expect(await made.answer('load', { route: `id:${river.id}` })).toBe(
      'This train has the route **River walk** now: 3 stops. It is at the first.',
    );
    expect(made.current().train).toMatchObject({ route: [2, 3, 11], stop: 0 });
    // Typed by its name works too; the same route again changes nothing.
    expect(await made.answer('load', { route: 'river WALK' })).toBe(
      'This train has that route already, and is at its first stop.',
    );
    expect((await made.lines()).at(-1)).toBe(
      `<@${ALICE}> loaded the route **River walk**: 3 stops. The train is at the first.`,
    );
  });

  it('load leaves out gyms that no longer exist and says how many', async () => {
    const made = await setup();
    const one = made.routes.add(ALICE, WEST, 'Old round', [2, 998, 3]);
    const two = made.routes.add(ALICE, WEST, 'Older round', [998, 2, 999]);
    const none = made.routes.add(ALICE, WEST, 'All gone', [998, 999]);
    expect(await made.answer('load', { route: `id:${one.id}` })).toBe(
      'This train has the route **Old round** now: 2 stops. It is at the first. ' +
        'One gym of it no longer exists and was left out.',
    );
    expect(await made.answer('load', { route: `id:${two.id}` })).toBe(
      'This train has the route **Older round** now: 1 stop. It is at the first. ' +
        '2 gyms of it no longer exist and were left out.',
    );
    expect(await made.answer('load', { route: `id:${none.id}` })).toBe(
      'None of the gyms of that route exists any more.',
    );
    expect(made.routeNow()).toEqual([2]);
  });

  it('load takes only a route of the member’s own for this region, and a member who is signed up', async () => {
    const made = await setup();
    const none = 'You have no such saved route for this region. Pick one from the list.';
    const east = made.routes.add(ALICE, 2, 'Of East', [8]);
    const bobs = made.routes.add(BOB, WEST, 'Bob’s', [5]);
    const carols = made.routes.add(CAROL, WEST, 'Hers', [5]);
    expect(await made.answer('load', { route: `id:${east.id}` })).toBe(none);
    expect(await made.answer('load', { route: `id:${bobs.id}` })).toBe(none);
    expect(await made.answer('load', { route: 'Bob’s' })).toBe(none);
    expect(await made.answer('load', { route: 'id:99999' })).toBe(none);
    expect(await made.answer('load', { route: `id:${carols.id}` }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(made.routeNow()).toEqual([4, 1, 7]);
  });

  it('forget deletes one of the member’s saved routes, and no train is changed', async () => {
    const made = await setup();
    const river = made.routes.add(ALICE, WEST, 'River *walk*', [2, 3]);
    const bobs = made.routes.add(BOB, WEST, 'Bob’s', [5]);
    expect(await made.choices('forget', 'route')).toEqual([
      { name: 'River *walk* (2 stops)', value: `id:${river.id}` },
    ]);
    expect(await made.answer('forget', { route: `id:${bobs.id}` })).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
    expect(await made.answer('forget', { route: `id:${river.id}` })).toBe(
      'I forgot your saved route **River \\*walk\\***.',
    );
    expect(made.routes.rows.map((row) => row.memberId)).toEqual([BOB]);
    expect(made.routeNow()).toEqual([4, 1, 7]);
    expect(await made.choices('forget', 'route')).toEqual([]);
  });
});

describe('/route anywhere else', () => {
  it('works only in the post of a train', async () => {
    const made = await setup();
    const elsewhere = { channelId: '600000000000000009', thread: undefined };
    expect(await made.answer('show', {}, elsewhere)).toBe(
      'Use this in the post of a train that is still active.',
    );
    expect(await made.choices('remove', 'stop', '', elsewhere)).toEqual([]);
    expect(await made.choices('load', 'route', '', elsewhere)).toEqual([]);
    const meetup = await createdMeetup();
    const { ctx } = createTestContext({
      partyService: meetup.service,
      attendance: meetup.attendance,
      trains: meetup.trains,
      parties: meetup.store,
      regions: meetup.regions,
    });
    const router = new InteractionRouter(ctx, [route], []);
    for (const [subcommand, options] of [
      ['show', {}],
      ['add', { gym: 'g:1' }],
      ['remove', { stop: 1 }],
      ['move', { from: 1, to: 2 }],
      ['clear', {}],
      ['save', { name: 'Loop' }],
      ['load', { route: 'id:1' }],
      ['forget', { route: 'id:1' }],
    ] as const) {
      const used = fakeChatInput({
        commandName: 'route',
        subcommand,
        options,
        channelId: meetup.postId,
        thread: { parentId: WEST_FORUM },
        userId: REPORTER,
      });
      await router.handle(used as never);
      expect(sent(used.reply).content).toBe(
        'This is the post of a meetup: that only works in the post of a train.',
      );
    }
  });
});

describe('/route: what was found in review', () => {
  it('never takes a name for the id of a row: a choice of the list says that it is one', async () => {
    const made = await setup();
    const downtown = made.routes.add(ALICE, WEST, 'Downtown', [2, 3]);
    const one = made.routes.add(ALICE, WEST, '1', [5]);
    const year = made.routes.add(ALICE, WEST, '2026', [6, 11]);
    expect(downtown.id).toBe(1);
    expect(await made.choices('forget', 'route')).toEqual([
      { name: '1 (1 stop)', value: `id:${one.id}` },
      { name: '2026 (2 stops)', value: `id:${year.id}` },
      { name: 'Downtown (2 stops)', value: `id:${downtown.id}` },
    ]);
    // Typed, `1` is the route of that name, not the row with that id.
    expect(await made.answer('forget', { route: '1' })).toBe('I forgot your saved route **1**.');
    expect(made.routes.rows.map((row) => row.name)).toEqual(['Downtown', '2026']);
    expect(await made.answer('load', { route: '2026' })).toBe(
      'This train has the route **2026** now: 2 stops. It is at the first.',
    );
    expect(await made.answer('load', { route: String(downtown.id) })).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
    expect(await made.answer('load', { route: `id:${downtown.id}` })).toBe(
      'This train has the route **Downtown** now: 2 stops. It is at the first.',
    );
    expect(await made.answer('load', { route: 'id:x' })).toBe(
      'You have no such saved route for this region. Pick one from the list.',
    );
  });

  it('takes the right to move the train for an edit that changes where it is', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, { id: BOB });
    const conductorOnly = 'This train has a conductor: only they and the moderators can move it.';
    // The train is at the first stop: Alice may not remove that one, but any other.
    expect(await made.answer('remove', { stop: 1 })).toBe(conductorOnly);
    expect(await made.answer('remove', { stop: 3 })).toBe(
      '**Harbor Lighthouse Mural** is off the route, which has 2 stops now.',
    );
    expect(await made.answer('add', { gym: 'g:2' })).toBe(
      '**Old Stone Fountain** is stop 3 of the route.',
    );
    const saved = made.routes.add(ALICE, WEST, 'Mine', [3, 5]);
    expect(await made.answer('load', { route: `id:${saved.id}` })).toBe(conductorOnly);
    expect(made.current().train).toMatchObject({ route: [4, 1, 2], stop: 0 });
    // A moderator may, and the conductor.
    expect(await made.answer('remove', { stop: 1 }, { roleNames: ['Moderator'] })).toBe(
      '**Veterans Memorial Bridge** is off the route, which has 2 stops now. ' +
        'The train is at **The Stacks** now.',
    );
    await made.trains.move(made.party.id, { id: BOB }, 'finish', false);
    expect(await made.answer('add', { gym: 'g:6' })).toBe(conductorOnly);
    expect(await made.answer('add', { gym: 'g:6' }, { userId: BOB })).toBe(
      '**Maple Leaf Mosaic** is stop 3 of the route. The train is there now.',
    );
    expect(await made.answer('load', { route: `id:${saved.id}` }, { roleNames: ['Admin'] })).toBe(
      'This train has the route **Mine** now: 2 stops. It is at the first.',
    );
  });

  it('says where the train is when the stop it was at is removed', async () => {
    const made = await setup();
    await made.trains.move(made.party.id, { id: ALICE }, 'skip', false);
    expect(await made.answer('remove', { stop: 3 })).toBe(
      '**Harbor Lighthouse Mural** is off the route, which has 2 stops now. ' +
        'The train has finished its route.',
    );
  });

  it('puts "…" after the gyms that fit only when it left some out', async () => {
    const made = await setup();
    // Three gyms fit "maple", by their name or their street; "pinewood" is in the name of two and the address of all.
    expect(await made.answer('add', { gym: 'maple' })).toBe(
      'Several gyms fit "maple" (Maple Leaf Mosaic, Pinewood Public Library, Starbucks). Pick one from the list.',
    );
    expect(await made.answer('add', { gym: 'pinewood' })).toMatch(
      /^Several gyms fit "pinewood" \([^,]+, [^,]+, [^,…]+…\)\. Pick one from the list\.$/,
    );
  });

  it('names a saved route of the legacy bot that has no name in a sentence', async () => {
    const made = await setup();
    const odd = made.routes.add(ALICE, WEST, '', [2]);
    expect(await made.answer('load', { route: `id:${odd.id}` })).toBe(
      'This train has a saved route without a name as its route now: 1 stop. It is at the first.',
    );
    expect(await made.answer('forget', { route: `id:${odd.id}` })).toBe(
      'I forgot your saved route without a name.',
    );
  });

  it('says how many stops of a saved route did not fit into a route', async () => {
    const made = await setup();
    // Every gym exists for this service: the invented town has twelve.
    const trains = new TrainService({
      store: made.store,
      gateway: made.gateway,
      posts: made.service,
      lines: made.partyLines,
      users: made.users,
      gyms: { get: (id) => ({ ...testGyms()[0], id, name: `Gym ${id}` }) as PostGym },
      routes: made.routes,
      log: made.log,
      announceDelayMs: 3_600_000,
    });
    const { ctx } = createTestContext({
      trains,
      attendance: made.attendance,
      parties: made.store,
      regions: made.regions,
    });
    const saved = made.routes.add(ALICE, WEST, 'Marathon', [
      ...Array.from({ length: 52 }, (_, index) => 100 + index),
    ]);
    const used = fakeChatInput({
      commandName: 'route',
      subcommand: 'load',
      options: { route: `id:${saved.id}` },
      userId: ALICE,
      ...made.inPost,
    });
    await new InteractionRouter(ctx, [route], []).handle(used as never);
    expect(sent(used.reply).content).toBe(
      'This train has the route **Marathon** now: 50 stops. It is at the first. ' +
        '2 more stops did not fit: a route has at most 50.',
    );
  });
});

describe('/route: what the second review found', () => {
  it('lets anybody who is signed up add the first stop, also to a train with a conductor', async () => {
    const made = await setup([]);
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.trains.setConductor(made.party.id, { id: BOB });
    expect(await made.answer('add', { gym: 'g:4' })).toBe(
      '**Veterans Memorial Bridge** is stop 1 of the route. The train is there now.',
    );
    await made.trains.flush();
    // A line, and nothing that announces a movement.
    expect((await made.lines()).filter((line) => /moving/.test(line))).toEqual([]);
    for (const message of made.gateway.messagesIn(made.postId)) {
      expect(message.message.mention).toBeUndefined();
    }
  });

  it('lets a moderator who is not signed up add, remove and move stops', async () => {
    const made = await setup();
    const moderator = { userId: CAROL, roleNames: ['Moderator'] };
    expect(await made.answer('add', { gym: 'g:2' }, { userId: CAROL })).toBe(
      'You are not signed up for this train.',
    );
    expect(await made.answer('add', { gym: 'g:2' }, moderator)).toBe(
      '**Old Stone Fountain** is stop 4 of the route.',
    );
    expect(await made.answer('move', { from: 4, to: 2 }, moderator)).toBe(
      '**Old Stone Fountain** is stop 2 of the route now.',
    );
    expect(await made.answer('remove', { stop: 2 }, moderator)).toBe(
      '**Old Stone Fountain** is off the route, which has 3 stops now.',
    );
    expect(made.routeNow()).toEqual([4, 1, 7]);
  });

  it('refuses to save a route under a name that reads like a choice of the list', async () => {
    const made = await setup();
    for (const name of ['id:7', 'ID:12']) {
      expect(await made.answer('save', { name })).toBe(
        'A saved route cannot be called `id:` and a number: that is how the list of saved ' +
          'routes names its choices. Give it another name.',
      );
    }
    expect(made.routes.rows).toEqual([]);
  });
});
```

Create `src/commands/trains/train.test.ts`:

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
import { partyControls } from '../../render/party-controls.js';
import { commands } from '../index.js';
import { train, TRAIN_FROM_A_REGION, TRAIN_THROTTLE } from './train.js';

const RAID_POST = '300000000000000055';

async function setup(overrides: Partial<AppContext> = {}) {
  const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
  const made = await partyServiceWith([raid]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    trains: made.trains,
    parties: made.store,
    regions: made.regions,
    ...overrides,
  });
  const router = new InteractionRouter(ctx, [train], []);
  /** `/train` by Alice, in the channel of West unless `extra` says otherwise. */
  const run = async (name: string, extra: object = {}): Promise<FakeInteraction> => {
    const interaction = fakeChatInput({
      commandName: 'train',
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
  const trains = () => made.store.active().filter((party) => party.type === 'train');
  return { ...made, ctx, run, answer, trains };
}

describe('/train', () => {
  it('makes a train with its post in the forum of the region, and links to it privately', async () => {
    const made = await setup();
    const used = await made.run('  Saturday   legendaries ');
    const [party] = made.trains();
    expect(party).toMatchObject({
      type: 'train',
      regionId: 1,
      forumChannelId: WEST_FORUM,
      createdById: ALICE,
      anonymous: false,
      timed: { name: 'Saturday legendaries', startTime: null },
      train: { route: [], stop: 0, conductorId: null, boss: null },
    });
    // Who made it is interested in group A, and not its conductor.
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
    const post = made.gateway.posts.get(postId);
    expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
    // The post has the button that opens the panel to move the train.
    expect(post?.message.components).toEqual(party && partyControls(party));
    expect(post?.message.components?.at(-1)).toMatchObject({
      components: [{ label: 'Move train…', custom_id: `party:${party?.id ?? ''}:move` }],
    });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply).content).toBe(
      `Your train is made. Its post is <#${postId}>. There, \`/route add\` adds its stops, ` +
        '`/meet` sets when it starts, and `/conductor set` makes you its conductor.',
    );
    expect(made.gateway.messagesIn(WEST_CHANNEL).map((message) => message.message.content)).toEqual(
      [`New train: <#${postId}>`],
    );
  });

  it('works in a post of the forum that is no party, and the train belongs to that region', async () => {
    const made = await setup();
    await made.run('Harbour round', {
      channelId: '300000000000000066',
      thread: { parentId: EAST_FORUM },
    });
    expect(made.trains()[0]).toMatchObject({ regionId: 2, forumChannelId: EAST_FORUM });
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
  });

  it('is refused in the post of a party and anywhere that is no region', async () => {
    const made = await setup();
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('Round', inPost)).toBe(TRAIN_FROM_A_REGION);
    expect(await made.answer('Round', { channelId: '600000000000000009' })).toBe(
      TRAIN_FROM_A_REGION,
    );
    expect(TRAIN_FROM_A_REGION).toBe('Create a train from a region channel.');
    expect(await made.answer('Round', { isDm: true })).toBe('This only works in a server.');
    expect(made.trains()).toEqual([]);
  });

  it('says so when the region has no forum yet', async () => {
    const made = await setup();
    const gyms = { ...made.ctx.gyms, isRegion: (id: string) => id === UNBOUNDED_CHANNEL };
    const other = await setup({ gyms });
    expect(await other.answer('Round', { channelId: UNBOUNDED_CHANNEL })).toBe(
      `The region <#${UNBOUNDED_CHANNEL}> has no forum yet. ` +
        'A moderator can create it with `/admin setup-forums`.',
    );
    expect(other.trains()).toEqual([]);
  });

  it('refuses a text that is no name, and tidies what is one', async () => {
    const made = await setup();
    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('x'.repeat(81))).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('\u200b\u200b')).toBe('Give a name of 1 to 80 characters.');
    expect(made.trains()).toEqual([]);
    await made.run('\u202eRound');
    expect(made.trains()[0]).toMatchObject({ timed: { name: 'Round' } });
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
    await made.run('Round');
    const [party] = made.trains();
    expect(party?.anonymous).toBe(false);
    expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
    const post = made.gateway.posts.get(party?.forumPostId ?? '');
    expect(post?.message.embeds?.[0]?.description?.split('\n')[2]).toBe(`Created by <@${ALICE}>.`);
  });

  it('lets a member make two in a quarter of an hour, and does not count a use that made nothing', async () => {
    const made = await setup();
    expect(TRAIN_THROTTLE).toEqual({ uses: 2, perSeconds: 900 });
    const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
    expect(await made.answer('Round', inPost)).toBe(TRAIN_FROM_A_REGION);
    await made.run('First');
    await made.run('Second');
    expect(await made.answer('Third')).toMatch(/^You can use \/train again in 1\d minutes\.$/);
    expect(made.trains()).toHaveLength(2);
    // Another member is not held back.
    await made.run('Fourth', { userId: BOB });
    expect(made.trains()).toHaveLength(3);
  });

  it('is listed with the commands under the trains, with everything a train alone has', () => {
    const filed = commands.filter((command) => command.help.category === 'train');
    expect(filed.map((command) => command.data.name).sort()).toEqual([
      'conductor',
      'finish',
      'next',
      'previous',
      'route',
      'skip',
      'train',
    ]);
    for (const command of filed) expect(command.help.details).toBeTruthy();
  });
});
```

Run: `npx vitest run --project unit src/commands/parties/in-train.test.ts src/commands/trains/move.test.ts src/commands/trains/route.test.ts src/commands/trains/train.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -13,12 +13,17 @@ import { boss, moveset } from './raids/boss.js';
 import { location } from './raids/location.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
+import { conductor } from './trains/conductor.js';
+import { finish, next, previous, skip } from './trains/move.js';
+import { route } from './trains/route.js';
+import { train } from './trains/train.js';
 import { help } from './util/help.js';
 
 /** Every slash command. The router and the deploy script both read this list. */
 export const commands: readonly CommandModule[] = [
   help,
   raid,
+  train,
   meetup,
   join,
   maybe,
@@ -43,5 +48,11 @@ export const commands: readonly CommandModule[] = [
   location,
   name,
   info,
+  route,
+  conductor,
+  next,
+  previous,
+  skip,
+  finish,
   admin,
 ];
```

Apply to `src/commands/meetups/meetup.ts`:

```diff
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -1,12 +1,12 @@
 import { SlashCommandBuilder } from 'discord.js';
-import type { Guard, SimpleCommand } from '../../discord/command.js';
+import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
-import { partyOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
+import { regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { MAX_PARTY_NAME } from '../../domain/party/party.js';
-import { tidyName } from '../../domain/party/timed.js';
 import { problemText } from '../../render/activity.js';
+import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
 
 /** Where `/meetup` works, said wherever it does not. */
 export const FROM_A_REGION = 'Create a meetup from a region channel.';
@@ -14,37 +14,11 @@ export const FROM_A_REGION = 'Create a meetup from a region channel.';
 /** As the legacy bot allowed: a meetup is a post that stays for days. */
 export const MEETUP_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };
 
-function noForum(regionChannelId: string): string {
-  return (
-    `The region <#${regionChannelId}> has no forum yet. ` +
-    'A moderator can create it with `/admin setup-forums`.'
-  );
-}
-
 /**
- * Everything that can be known before a meetup is made is refused here, in a guard, so that a
- * use that made nothing does not count towards the two a member has in a quarter of an hour.
- *
  * `/meetup` is used in the text channel of a region, or in a post of its forum that is no
- * party, and the meetup then belongs to that region. Not in the post of a party: a post is no
- * place to start another from (the legacy bot refused it in a party's channel too). The region
- * needs its forum, and the name must be one.
+ * party, and the meetup then belongs to that region (`requirePlaceForNew`).
  */
-const requireMeetupPlace: Guard = (interaction, ctx) => {
-  const regionChannelId = regionChannelOf(interaction, ctx);
-  if (partyOf(interaction, ctx) || regionChannelId === undefined) {
-    throw new UserError(FROM_A_REGION);
-  }
-  const region = ctx.regions.byChannel(regionChannelId);
-  if (!region) throw new UserError(FROM_A_REGION);
-  if (region.forumChannelId === null) throw new UserError(noForum(regionChannelId));
-  if (
-    interaction.isChatInputCommand() &&
-    tidyName(interaction.options.getString('name') ?? '') === undefined
-  ) {
-    throw new UserError(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
-  }
-};
+const requireMeetupPlace = requirePlaceForNew('meetup', FROM_A_REGION);
 
 /**
  * `/meetup` (spec 4.2): a meetup with a post of its own in the forum of the region it is made
@@ -95,7 +69,7 @@ export const meetup: SimpleCommand = {
       case 'no-region':
         throw new UserError(FROM_A_REGION);
       case 'no-forum':
-        throw new UserError(noForum(outcome.region.channelId));
+        throw new UserError(noForumYet(outcome.region.channelId));
       case 'created': {
         const post = outcome.party.forumPostId;
         await interaction.editReply({
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -7,7 +7,7 @@ import {
 import type { AppContext } from '../../app-context.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
-import { notAMeetup, notARaid, notTimed, partyOf } from '../../discord/guards.js';
+import { notAMeetup, notARaid, notATrain, notTimed, partyOf } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import {
@@ -17,6 +17,7 @@ import {
   isMeetup,
   isRaid,
   isTimed,
+  isTrain,
   partyWord,
   type Attendee,
   type GroupId,
@@ -24,6 +25,7 @@ import {
   type Party,
   type RaidParty,
   type TimedParty,
+  type TrainParty,
 } from '../../domain/party/party.js';
 import { problemText, standingReply } from '../../render/activity.js';
 import { isRaidAction } from '../../render/party-controls.js';
@@ -88,6 +90,17 @@ export function commandTimed(
   return party;
 }
 
+/** The train of the post a command was used in (`requireTrain` has checked it). */
+export function commandTrain(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): TrainParty {
+  const party = partyOf(interaction, ctx);
+  if (!party) throw new UserError(partyOver({ type: 'train' }));
+  if (!isTrain(party)) throw new UserError(notATrain(party));
+  return party;
+}
+
 /** The meetup of the post a command was used in (`requireMeetup` has checked it). */
 export function commandMeetup(
   interaction: ChatInputCommandInteraction,
```

Apply to `src/commands/parties/timed.ts`:

```diff
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -1,10 +1,12 @@
 import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
 import { DateTime } from 'luxon';
 import type { AppContext } from '../../app-context.js';
+import type { Guard } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
+import { partyOf, regionChannelOf } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { partyWord, type TimedParty } from '../../domain/party/party.js';
-import { startTimeOf } from '../../domain/party/timed.js';
+import { startTimeOf, tidyName } from '../../domain/party/timed.js';
 import { resolvePartyTime } from '../../domain/time/party-time.js';
 import { problemText } from '../../render/activity.js';
 import { clockOrDay, plain, timestamp, truncate } from '../../render/text.js';
@@ -24,6 +26,43 @@ export const TIMED_TIME_HINT =
 
 type Ok<Extra> = Extract<TimedChangeOutcome<Extra>, { kind: 'ok' }>;
 
+/** What a member is told who makes a train or meetup in a region that has no forum yet. */
+export function noForumYet(regionChannelId: string): string {
+  return (
+    `The region <#${regionChannelId}> has no forum yet. ` +
+    'A moderator can create it with `/admin setup-forums`.'
+  );
+}
+
+/**
+ * The guard of a command that makes a timed party (`/meetup`, `/train`). Everything that can be
+ * known before the party is made is refused here, so that a use that made nothing does not
+ * count towards the two a member has in a quarter of an hour.
+ *
+ * Such a command is used in the text channel of a region, or in a post of its forum that is no
+ * party, and the party then belongs to that region. Not in the post of a party: a post is no
+ * place to start another from (the legacy bot refused it in a party's channel too);
+ * `fromARegion` says so. The region needs its forum, and the name must be one. `word` names
+ * the kind of party that is made.
+ */
+export function requirePlaceForNew(word: string, fromARegion: string): Guard {
+  return (interaction, ctx) => {
+    const regionChannelId = regionChannelOf(interaction, ctx);
+    if (partyOf(interaction, ctx) || regionChannelId === undefined) {
+      throw new UserError(fromARegion);
+    }
+    const region = ctx.regions.byChannel(regionChannelId);
+    if (!region) throw new UserError(fromARegion);
+    if (region.forumChannelId === null) throw new UserError(noForumYet(regionChannelId));
+    if (
+      interaction.isChatInputCommand() &&
+      tidyName(interaction.options.getString('name') ?? '') === undefined
+    ) {
+      throw new UserError(problemText('bad-name', ctx.attendance.limits(), word));
+    }
+  };
+}
+
 /**
  * A time a member typed for a timed party that exists (a meetup or a train): when it
  * starts (`meet`) or when it ends. `'unset'` when the member asked to remove it (`cancel`,
```

Create `src/commands/trains/conductor.ts`:

```ts
import { MessageFlags, SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { isStaff, requireTrain } from '../../discord/guards.js';
import { problemText } from '../../render/activity.js';
import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
import { CHANGE_THROTTLE } from '../raids/change.js';

const setConductor: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('set')
    .setDescription('Become the conductor of this train: the one who moves it'),
  help: {
    details:
      'You must be signed up. While a train has a conductor, only they and the moderators can ' +
      'move it along its route, so nobody moves it by accident. You can take over from ' +
      'another conductor (who may have gone offline); the post says so.',
    examples: ['/conductor set'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const outcome = await ctx.trains.setConductor(party.id, actingMember(interaction));
    if (outcome.kind === 'gone') throw new UserError(partyOver(party));
    if (outcome.kind === 'refused') {
      throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
    }
    const only = 'Only you and the moderators can move it now.';
    await interaction.reply({
      content: !outcome.changed
        ? 'You are the conductor of this train already.'
        : outcome.previous === null
          ? `You are the conductor of this train. ${only}`
          : `You are the conductor of this train, in the place of <@${outcome.previous}>. ${only}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

const clearConductor: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('clear')
    .setDescription('Stop being the conductor of this train (moderators: take the conductor off)'),
  help: {
    details:
      'Leaves the train without a conductor: anybody who is signed up can move it again. For ' +
      'the conductor themself, and for moderators. A conductor who leaves the train stops ' +
      'being it by that.',
    examples: ['/conductor clear'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const outcome = await ctx.trains.clearConductor(
      party.id,
      actingMember(interaction),
      isStaff(interaction, ctx),
    );
    if (outcome.kind === 'gone') throw new UserError(partyOver(party));
    if (outcome.kind === 'refused') {
      throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
    }
    const anybody = 'Anybody who is signed up can move it.';
    await interaction.reply({
      content: !outcome.changed
        ? `This train has no conductor. ${anybody}`
        : outcome.previous === interaction.user.id
          ? `You are no longer the conductor of this train. ${anybody}`
          : `This train has no conductor any more. ${anybody}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

/** `/conductor` (spec 4.2): who leads the train of this post, and with that who may move it. */
export const conductor = commandGroup({
  data: new SlashCommandBuilder()
    .setName('conductor')
    .setDescription('The conductor of this train: the one who moves it'),
  help: {
    category: 'train',
    details: 'Use it in the post of the train.',
  },
  guards: [requireTrain],
  parts: [setConductor, clearConductor],
});
```

Create `src/commands/trains/move.ts`:

```ts
import {
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { isStaff, requireTrain } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { isTrain, membersWhere, type TrainParty } from '../../domain/party/party.js';
import { mayNotMove, type TrainMove } from '../../domain/party/train.js';
import { problemText } from '../../render/activity.js';
import { trainPanel, whereText } from '../../render/train-panel.js';
import type { TrainPlaces } from '../../render/train-post.js';
import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
import { CHANGE_THROTTLE } from '../raids/change.js';

const A_TRAIN = { type: 'train' } as const;

/** A train with the gyms of its route, for what says where it is. */
export function trainPlaces(ctx: AppContext, party: TrainParty): TrainPlaces {
  return { party, gym: (id) => ctx.gyms.get(id) };
}

/** Why a train refused, as a sentence. */
function refusal(ctx: AppContext, reason: Parameters<typeof problemText>[0]): string {
  return problemText(reason, ctx.attendance.limits(), 'train');
}

/**
 * `/next`, `/previous`, `/skip` and `/finish`: moves the train of this post along its route and
 * tells the member where it is now. The others are told a moment later, in the post
 * (`TrainService.move`). With a conductor, only they and the staff may; without one, anybody who
 * is signed up.
 */
async function moveByCommand(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  move: TrainMove,
): Promise<void> {
  const party = commandTrain(interaction, ctx);
  const member = actingMember(interaction);
  const outcome = await ctx.trains.move(party.id, member, move, isStaff(interaction, ctx));
  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
  if (outcome.kind === 'refused') throw new UserError(refusal(ctx, outcome.reason));
  const others = membersWhere(outcome.party, (_attendee, id) => id !== member.id).length > 0;
  await interaction.reply({
    content: `${whereText(trainPlaces(ctx, outcome.party))}${others ? ' I am telling the others.' : ''}`,
    flags: MessageFlags.Ephemeral,
  });
}

function moveCommand(
  name: string,
  move: TrainMove,
  description: string,
  details: string,
): SimpleCommand {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description),
    help: {
      category: 'train',
      details:
        `${details} Everybody who was here is coming again (not once the route is ` +
        'finished: there is nowhere to come to), and the others are told where ' +
        'the train is going, with a ping for those who allow it. While the train has a ' +
        'conductor, only they and the moderators can move it; otherwise anybody who is signed ' +
        'up can. The same as the button "Move train…" on the post. Use it in the post of the ' +
        'train.',
      examples: [`/${name}`],
    },
    guards: [requireTrain],
    throttle: CHANGE_THROTTLE,
    execute: (interaction, ctx) => moveByCommand(interaction, ctx, move),
  };
}

export const next = moveCommand(
  'next',
  'next',
  'Move this train to its next stop',
  'Takes the train to the next stop of its route; from the last stop it finishes the route.',
);

export const previous = moveCommand(
  'previous',
  'previous',
  'Move this train back to the stop before',
  'Takes the train one stop back, also from the end of its route to the last stop.',
);

export const skip = moveCommand(
  'skip',
  'skip',
  'Move this train past its next stop, to the one after it',
  'Leaves the next stop out and takes the train to the one after it.',
);

export const finish = moveCommand(
  'finish',
  'finish',
  'Say that this train has finished its route',
  'Marks the route as finished. The train itself goes on until its end time: finishing the ' +
    'route does not close its post.',
);

/**
 * The button "Move train…" of a train's post: answers the member who pressed it, privately,
 * with the panel that moves the train. Who may not move it is told so in the place of the
 * panel, and so is everybody while the train has no route: there is nothing to move it along.
 * Not a click that is gathered (`answerClick`): every press gets a panel of its own.
 */
export async function openTrainPanel(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = ctx.parties.get(partyId);
  // Only the post of a train has this button.
  if (!party) throw new UserError(partyOver(A_TRAIN));
  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
  const problem = mayNotMove(party, interaction.user.id, isStaff(interaction, ctx));
  if (problem) throw new UserError(refusal(ctx, problem));
  if (party.train.route.length === 0) throw new UserError(refusal(ctx, 'no-route'));
  await interaction.reply({
    ...trainPanel(trainPlaces(ctx, party)),
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * A press on a button of the panel: moves the train, and changes the panel itself to how things
 * stand now, so that the member can go on from it. Never a gathered answer: this message is
 * the panel.
 *
 * `from` is where the train was when the panel was drawn, which the button carries. A panel
 * that no longer shows where the train is (somebody else moved it, the stop it was at was
 * removed) moves nothing: it says so and shows where the train is now, with fresh buttons, so
 * that two members who press Next on the same stop move the train once. A button without it
 * (none is made so) is taken the same way. `target` is where Next or Skip said it leads: when
 * the route was edited since and the move would lead to another stop, it moves nothing either
 * and says that the route has changed. The store decides, inside the change.
 *
 * A move that cannot be made from where the train is leaves the panel, with the reason above
 * where the train is (not for a finished route, which the panel says itself). A member who may
 * no longer move the train, a train without a route and a train that has ended lose the buttons.
 */
export async function pressTrainPanel(
  interaction: MessageComponentInteraction,
  ctx: AppContext,
  partyId: string,
  move: TrainMove,
  from: string | undefined,
  target?: string,
): Promise<void> {
  const member = actingMember(interaction);
  const staff = isStaff(interaction, ctx);
  // No place names an empty text: a press without one finds the train moved on. Next and Skip
  // also say where they lead, and a press without that finds the route changed.
  const promised = move === 'next' || move === 'skip' ? (target ?? '') : undefined;
  const outcome = await ctx.trains.move(partyId, member, move, staff, from ?? '', promised);
  if (outcome.kind === 'gone') {
    await interaction.update({ content: partyOver(A_TRAIN), components: [] });
    return;
  }
  if (outcome.kind === 'ok') {
    await interaction.update(trainPanel(trainPlaces(ctx, outcome.party)));
    return;
  }
  const why = refusal(ctx, outcome.reason);
  const party = ctx.parties.get(partyId);
  if (!party || !isTrain(party) || mayNotMove(party, member.id, staff)) {
    await interaction.update({ content: why, components: [] });
    return;
  }
  if (party.train.route.length === 0) {
    await interaction.update({ content: refusal(ctx, 'no-route'), components: [] });
    return;
  }
  const panel = trainPanel(trainPlaces(ctx, party));
  // That the route is finished is what the panel says of where the train is: once is enough.
  const content = outcome.reason === 'route-finished' ? panel.content : `${why}\n${panel.content}`;
  await interaction.update({ ...panel, content });
}
```

Create `src/commands/trains/route.ts`:

```ts
import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { MAX_SAVED_ROUTES, type SavedRoute } from '../../db/repositories/saved-route-repository.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import {
  isBotManagement,
  isStaff,
  memberRoleNames,
  regionChannelOf,
  requireTrain,
  trainOf,
} from '../../discord/guards.js';
import { MAX_PARTY_NAME, MAX_ROUTE_STOPS, type TrainParty } from '../../domain/party/party.js';
import { nameOf } from '../../domain/party/timed.js';
import { currentStop } from '../../domain/party/train.js';
import { problemText } from '../../render/activity.js';
import { gymName } from '../../render/raid-post.js';
import { count, LIMITS, plain, truncate } from '../../render/text.js';
import { routeLines } from '../../render/train-post.js';
import type { TrainOutcome } from '../../services/train-service.js';
import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { gymChoices, MAX_CHOICES, reportedGym } from '../raids/raid-input.js';
import { trainPlaces } from './move.js';

type Ok<Extra> = Extract<TrainOutcome<Extra>, { kind: 'ok' }>;

/**
 * What came of a change to a train, when it worked; a refusal and a train that has ended are
 * thrown as `UserError`s, as everywhere.
 */
function changed<Extra>(
  ctx: AppContext,
  party: TrainParty,
  outcome: TrainOutcome<Extra>,
): Ok<Extra> {
  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
  if (outcome.kind === 'refused') {
    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
  }
  return outcome;
}

function privately(interaction: ChatInputCommandInteraction, content: string): Promise<unknown> {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/** A gym as an answer names it. */
function named(ctx: AppContext, gymId: number): string {
  return `**${plain(gymName(ctx.gyms.get(gymId)))}**`;
}

/**
 * The route cut into texts that each fit one message, stop by stop: the whole route is shown,
 * however long it is, in as many messages as it takes.
 */
function routeMessages(heading: string, lines: readonly string[]): string[] {
  const messages: string[] = [];
  let text = heading;
  for (const line of lines) {
    if (text.length + 1 + line.length > LIMITS.content) {
      messages.push(text);
      text = line;
    } else {
      text += `\n${line}`;
    }
  }
  return [...messages, text];
}

const show: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('Show the whole route of this train, each stop with a link to its place'),
  help: {
    details:
      'Shows you every stop in order: those the train has left struck through, the one it is ' +
      'at marked, EX gyms marked, each a link to Google Maps. The post itself shows the route ' +
      'too, without the links.',
    examples: ['/route show'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    if (party.train.route.length === 0) {
      await privately(interaction, problemText('no-route', ctx.attendance.limits(), 'train'));
      return;
    }
    const heading = `**The route of ${plain(nameOf(party))}**`;
    const lines = routeLines(trainPlaces(ctx, party), { links: true });
    const [first = heading, ...more] = routeMessages(heading, lines);
    await privately(interaction, first);
    for (const content of more) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
  },
};

const add: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Add a gym to the end of the route of this train')
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('The gym: type part of its name and pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'You must be signed up (moderators need not be). The gym may lie in another region of ' +
      'this server: the list says where. A gym is on a route once, and a route has at most ' +
      `${MAX_ROUTE_STOPS} stops. A stop added to a route that was finished makes the train go ` +
      'on there, which moves the train: with a conductor only they and the moderators can do ' +
      'that, and the others are told.',
    examples: ['/route add gym:Big Fountain'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const typed = interaction.options.getString('gym', true);
    const answer = reportedGym(ctx, regionChannelOf(interaction, ctx), typed);
    if (answer.kind === 'none') {
      throw new UserError(
        `I found no gym for "${plain(truncate(typed, 80))}". Type part of its name and pick it from the list.`,
      );
    }
    if (answer.kind === 'several') {
      const names = answer.gyms.slice(0, 3).map((gym) => plain(gym.name));
      // The dots stand for gyms that are not named: only when there are such.
      const more = answer.gyms.length > names.length ? '…' : '';
      throw new UserError(
        `Several gyms fit "${plain(truncate(typed, 80))}" (${names.join(', ')}${more}). Pick one from the list.`,
      );
    }
    const { gym } = answer;
    const outcome = changed(
      ctx,
      party,
      await ctx.trains.addStop(
        party.id,
        actingMember(interaction),
        gym.id,
        isStaff(interaction, ctx),
      ),
    );
    const here = currentStop(outcome.party) === gym.id ? ' The train is there now.' : '';
    await privately(
      interaction,
      `${named(ctx, gym.id)} is stop ${outcome.number} of the route.${here}`,
    );
  },
  async autocomplete(interaction, ctx) {
    const regionName = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    const choices = gymChoices(
      ctx,
      regionChannelOf(interaction, ctx),
      interaction.options.getFocused(),
      regionName,
    );
    // Not the gyms that are on the route already.
    const onRoute = new Set(trainOf(interaction, ctx)?.train.route ?? []);
    await interaction.respond(
      choices.filter((choice) => !onRoute.has(Number(choice.value.slice(2)))),
    );
  },
};

/**
 * The stops of the route as choices of a list, `3. Name`, narrowed to what was typed: a number
 * means that stop, anything else is looked for in the names. The value of a choice is the
 * number of the stop.
 */
function stopChoices(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): { name: string; value: number }[] {
  const party = trainOf(interaction, ctx);
  if (!party) return [];
  const typed = String(interaction.options.getFocused()).trim().toLowerCase();
  const all = party.train.route.map((gymId, index) => {
    const name = gymName(ctx.gyms.get(gymId));
    return { name: truncate(`${index + 1}. ${name}`, 100), value: index + 1, words: name };
  });
  const words = typed.split(/\s+/).filter(Boolean);
  const found =
    typed === ''
      ? all
      : /^\d+$/.test(typed)
        ? // The stop with that number first, then those whose number begins with it.
          all
            .filter((choice) => String(choice.value).startsWith(typed))
            .sort((a, b) => Number(String(b.value) === typed) - Number(String(a.value) === typed))
        : all.filter((choice) => words.every((word) => choice.words.toLowerCase().includes(word)));
  return found.slice(0, MAX_CHOICES).map(({ name, value }) => ({ name, value }));
}

async function respondWithStops(interaction: AutocompleteInteraction, ctx: AppContext) {
  await interaction.respond(stopChoices(interaction, ctx));
}

const remove: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Take a stop off the route of this train')
    .addIntegerOption((option) =>
      option
        .setName('stop')
        .setDescription('The number of the stop: pick from the list')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'You must be signed up. The train stays at the gym it is at; when that very stop is ' +
      'removed, the one after it is the current one, which moves the train: with a conductor ' +
      'only they and the moderators can do that, and the others are told.',
    examples: ['/route remove stop:3'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const number = interaction.options.getInteger('stop', true);
    const outcome = changed(
      ctx,
      party,
      await ctx.trains.removeStop(
        party.id,
        actingMember(interaction),
        number,
        isStaff(interaction, ctx),
      ),
    );
    const left = outcome.party.train.route.length;
    // The stop the train was at is gone: where it is now.
    const at = currentStop(outcome.party);
    const where = !outcome.moved
      ? ''
      : at !== undefined
        ? ` The train is at ${named(ctx, at)} now.`
        : left > 0
          ? ' The train has finished its route.'
          : '';
    await privately(
      interaction,
      `${named(ctx, outcome.gymId)} is off the route, which has ${count(left, 'stop')} now.${where}`,
    );
  },
  autocomplete: respondWithStops,
};

const move: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('move')
    .setDescription('Move a stop to another place of the route of this train')
    .addIntegerOption((option) =>
      option
        .setName('from')
        .setDescription('The number of the stop to move: pick from the list')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('to')
        .setDescription('The number it is to have afterwards (the place of the stop you pick)')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'You must be signed up. `to` is the number the stop has afterwards, so the last number ' +
      'moves it to the end. The train stays at the gym it is at.',
    examples: ['/route move from:5 to:2'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const from = interaction.options.getInteger('from', true);
    const to = interaction.options.getInteger('to', true);
    const outcome = changed(
      ctx,
      party,
      await ctx.trains.moveStop(
        party.id,
        actingMember(interaction),
        from,
        to,
        isStaff(interaction, ctx),
      ),
    );
    await privately(
      interaction,
      outcome.changed
        ? `${named(ctx, outcome.gymId)} is stop ${to} of the route now.`
        : `${named(ctx, outcome.gymId)} is stop ${to} of the route already.`,
    );
  },
  autocomplete: respondWithStops,
};

const clear: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('clear')
    .setDescription('Remove every stop from the route of this train (conductor, moderators)'),
  help: {
    details:
      'For the conductor of the train, and for admins, moderators and bot developers. The ' +
      'train is then at the start again: the first stop that is added is where it is.',
    examples: ['/route clear'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    // As the legacy bot had it: clearing a route is for bot management, and for who leads it.
    const staff = isBotManagement(
      memberRoleNames(interaction),
      interaction.user.id,
      ctx.config.env.OWNER_ID,
    );
    const outcome = changed(
      ctx,
      party,
      await ctx.trains.clearRoute(party.id, actingMember(interaction), staff),
    );
    await privately(
      interaction,
      outcome.changed ? 'The route of this train is cleared.' : 'This train had no route.',
    );
  },
};

/** The name of a saved route as an answer shows it. A route that was just saved has one. */
function routeName(route: SavedRoute): string {
  return `**${plain(route.name)}**`;
}

const NO_SUCH_ROUTE = 'You have no such saved route for this region. Pick one from the list.';

/** What the value of a choice of the list of saved routes begins with, before the id of its row. */
const ROUTE_CHOICE = 'id:';

/**
 * The saved route an option names: a choice of the list (`id:` and the id of its row), or the
 * name of one of the member's routes of this region as it was typed. Anything that is no
 * choice of the list is a name, also digits alone: a member may call a route `1` or `2026`.
 * The service checks again that the row is the member's own and of this region.
 */
async function typedRoute(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TrainParty,
): Promise<number> {
  const text = interaction.options.getString('route', true).trim();
  if (text.startsWith(ROUTE_CHOICE)) {
    const id = text.slice(ROUTE_CHOICE.length);
    if (!/^\d{1,10}$/.test(id)) throw new UserError(NO_SUCH_ROUTE);
    return Number(id);
  }
  const mine = await ctx.trains.savedRoutes(party.id, interaction.user.id);
  const fits = mine.filter((route) => route.name.toLowerCase() === text.toLowerCase());
  const [only] = fits;
  if (!only || fits.length > 1) throw new UserError(NO_SUCH_ROUTE);
  return only.id;
}

/** The member's saved routes of the region of this train, as choices: `Name (3 stops)`. */
async function respondWithRoutes(interaction: AutocompleteInteraction, ctx: AppContext) {
  const party = trainOf(interaction, ctx);
  if (!party) {
    await interaction.respond([]);
    return;
  }
  const typed = String(interaction.options.getFocused()).trim().toLowerCase();
  const mine = await ctx.trains.savedRoutes(party.id, interaction.user.id);
  await interaction.respond(
    mine
      .filter((route) => route.name.toLowerCase().includes(typed))
      .slice(0, MAX_CHOICES)
      .map((route) => {
        const stops = ` (${count(route.gyms.length, 'stop')})`;
        return {
          name: `${truncate(route.name || 'Without a name', 100 - stops.length)}${stops}`,
          value: `${ROUTE_CHOICE}${route.id}`,
        };
      }),
  );
}

const save: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('save')
    .setDescription('Save the route of this train under a name, to use it for another train')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('What to call the saved route')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    ),
  help: {
    details:
      'The route is saved for you and for the region of this train; nobody else sees it. A ' +
      'route of yours with the same name is replaced. You can keep up to ' +
      `${MAX_SAVED_ROUTES} routes per region; \`/route forget\` removes one.`,
    examples: ['/route save name:Downtown loop'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const outcome = await ctx.trains.saveRoute(
      party.id,
      actingMember(interaction),
      interaction.options.getString('name', true),
    );
    switch (outcome.kind) {
      case 'gone':
        throw new UserError(partyOver(party));
      case 'refused':
        throw new UserError(
          outcome.reason === 'empty-route'
            ? 'This train has no route to save yet.'
            : outcome.reason === 'name-like-choice'
              ? 'A saved route cannot be called `id:` and a number: that is how the list of ' +
                'saved routes names its choices. Give it another name.'
              : problemText(outcome.reason, ctx.attendance.limits(), 'train'),
        );
      case 'full':
        throw new UserError(
          `You have ${MAX_SAVED_ROUTES} saved routes for this region, which is as many as you ` +
            'can keep. Remove one with `/route forget` first, or save under the name of one ' +
            'to replace it.',
        );
      case 'saved':
      case 'replaced': {
        const stops = count(outcome.route.gyms.length, 'stop');
        await privately(
          interaction,
          outcome.kind === 'saved'
            ? `I saved this route as ${routeName(outcome.route)}: ${stops}. ` +
                '`/route load` puts it into a train of this region.'
            : `I replaced your saved route ${routeName(outcome.route)} with this one: ${stops}.`,
        );
      }
    }
  },
};

const routeOption = (description: string) => (option: SlashCommandStringOption) =>
  option
    .setName('route')
    .setDescription(description)
    .setRequired(true)
    .setMaxLength(100)
    .setAutocomplete(true);

const load: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('load')
    .setDescription('Replace the route of this train by one you saved')
    .addStringOption(routeOption('One of your saved routes of this region: pick from the list')),
  help: {
    details:
      'The route of the train is replaced, and the train is at its first stop: that moves the ' +
      'train, so with a conductor only they and the moderators can do it, and otherwise you ' +
      'must be signed up. Gyms that no longer exist are left out.',
    examples: ['/route load route:Downtown loop'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const routeId = await typedRoute(interaction, ctx, party);
    const loaded = await ctx.trains.loadRoute(
      party.id,
      actingMember(interaction),
      routeId,
      isStaff(interaction, ctx),
    );
    if (loaded.kind === 'none') throw new UserError(NO_SUCH_ROUTE);
    if (loaded.kind === 'refused' && loaded.reason === 'empty-route') {
      throw new UserError('None of the gyms of that route exists any more.');
    }
    const outcome = changed(ctx, party, loaded);
    const stops = count(outcome.party.train.route.length, 'stop');
    const missing =
      outcome.missing === 0
        ? ''
        : ` ${outcome.missing === 1 ? 'One gym of it no longer exists and was' : `${outcome.missing} gyms of it no longer exist and were`} left out.`;
    const cut =
      outcome.cut === 0
        ? ''
        : ` ${count(outcome.cut, 'more stop')} did not fit: a route has at most ${MAX_ROUTE_STOPS}.`;
    // A route of the legacy bot may have no name.
    const has =
      outcome.route.name === ''
        ? 'a saved route without a name as its route now'
        : `the route ${routeName(outcome.route)} now`;
    await privately(
      interaction,
      outcome.changed
        ? `This train has ${has}: ${stops}. It is at the first.${missing}${cut}`
        : `This train has that route already, and is at its first stop.${missing}${cut}`,
    );
  },
  autocomplete: respondWithRoutes,
};

const forget: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('forget')
    .setDescription('Delete one of the routes you saved')
    .addStringOption(routeOption('One of your saved routes of this region: pick from the list')),
  help: {
    details: 'Deletes a route you saved for the region of this train. No train is changed by it.',
    examples: ['/route forget route:Downtown loop'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const routeId = await typedRoute(interaction, ctx, party);
    const gone = await ctx.trains.forgetRoute(party.id, interaction.user.id, routeId);
    if (!gone) throw new UserError(NO_SUCH_ROUTE);
    await privately(
      interaction,
      gone.name === ''
        ? 'I forgot your saved route without a name.'
        : `I forgot your saved route ${routeName(gone)}.`,
    );
  },
  autocomplete: respondWithRoutes,
};

/**
 * `/route` (spec 4.2): the route of the train of this post, and the routes a member saved.
 * Anybody who is signed up may change the route; clearing it is for the conductor and the staff.
 */
export const route = commandGroup({
  data: new SlashCommandBuilder()
    .setName('route')
    .setDescription('The route of this train: its stops, and the routes you saved'),
  help: {
    category: 'train',
    details:
      'Use it in the post of the train. The current stop follows its gym through every change ' +
      'of the route: the train stays where it is.',
  },
  guards: [requireTrain],
  parts: [show, add, remove, move, clear, save, load, forget],
});
```

Create `src/commands/trains/train.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { regionChannelOf, requireGuild } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import { MAX_PARTY_NAME } from '../../domain/party/party.js';
import { problemText } from '../../render/activity.js';
import { noForumYet, requirePlaceForNew } from '../parties/timed.js';

/** Where `/train` works, said wherever it does not. */
export const TRAIN_FROM_A_REGION = 'Create a train from a region channel.';

/** As the legacy bot allowed: a train is a post that stays for hours or days. */
export const TRAIN_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };

/**
 * `/train` (spec 4.2): a raid train with a post of its own in the forum of the region it is
 * made in. It starts with its name and nothing else; its route, its times, its conductor and the
 * boss it is after are set in its post. Who makes it is signed up as interested, and named; they
 * are not its conductor unless they say so.
 */
export const train: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('train')
    .setDescription('Create a raid train in this region, with a post of its own')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('What to call it, such as "Saturday legendaries"')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    ),
  help: {
    category: 'train',
    details:
      'For a group that goes from gym to gym. Use it in the channel of a region; the train gets ' +
      'a post in the forum of that region, and you are marked as interested. In the post, ' +
      '`/route add` adds the gyms it visits (also gyms of other regions), `/meet` sets when it ' +
      'starts and `/end` when it ends, `/boss` says which Pokémon it is after, and `/conductor ' +
      'set` makes you the one who moves it. Members sign up with the buttons, as for a raid, ' +
      'and the button "Move train…" or `/next` takes it to its next stop. A train is archived ' +
      'an hour after it is over: after its end, or without one a day after its start. One ' +
      'without any time goes a day after it was made; its post says when.',
    examples: ['/train name:Saturday legendaries'],
  },
  guards: [requireGuild, requirePlaceForNew('train', TRAIN_FROM_A_REGION)],
  defer: 'ephemeral',
  throttle: TRAIN_THROTTLE,
  async execute(interaction, ctx) {
    const regionChannelId = regionChannelOf(interaction, ctx);
    if (regionChannelId === undefined) throw new UserError(TRAIN_FROM_A_REGION);
    const outcome = await ctx.partyService.createTrain({
      name: interaction.options.getString('name', true),
      creatorId: interaction.user.id,
      creator: memberInfo(interaction),
      regionChannelId,
    });
    // The guard has looked at all of these; what follows is for what changed in between.
    switch (outcome.kind) {
      case 'bad-name':
        throw new UserError(problemText('bad-name', ctx.attendance.limits(), 'train'));
      case 'no-region':
        throw new UserError(TRAIN_FROM_A_REGION);
      case 'no-forum':
        throw new UserError(noForumYet(outcome.region.channelId));
      case 'created': {
        const post = outcome.party.forumPostId;
        await interaction.editReply({
          content:
            `Your train is made.${post === null ? '' : ` Its post is <#${post}>.`} ` +
            'There, `/route add` adds its stops, `/meet` sets when it starts, and `/conductor ' +
            'set` makes you its conductor.',
        });
      }
    }
  },
};
```

Apply to `src/components/party.ts`:

```diff
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -10,6 +10,7 @@ import {
   remoteWords,
 } from '../commands/parties/reply.js';
 import { changeTime, timesAlready } from '../commands/raids/change.js';
+import { openTrainPanel, pressTrainPanel } from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
@@ -28,7 +29,8 @@ import {
 
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
- * question, and the "Set time" button of a raid without times with the form it opens. The party
+ * question, the "Set time" button of a raid without times with the form it opens, and the
+ * button "Move train…" of a train with the panel it opens (`commands/trains/move.ts`). The party
  * is named by the custom id, not by the channel, so the same controls work on a copy of the
  * message in another channel. Every click is answered privately, a burst of clicks by one
  * member with one answer (`answerClick`); what it changed is said in the post by the attendance
@@ -135,12 +137,15 @@ export const partyButtons: ComponentHandler = {
         // Only the form of `/delete` has this action.
         throw new UserError(STALE_COMPONENT);
       case 'move':
+        // The button of a train's post that opens the panel to move it.
+        return openTrainPanel(interaction, ctx, partyId);
       case 'next':
       case 'previous':
       case 'skip':
       case 'finish':
-        // The controls that move a train are handled from the step that brings `/next`.
-        throw new UserError(STALE_COMPONENT);
+        // A button of that panel: it moves the train and changes the panel, never a gathered
+        // answer (`answerClick`), which would leave the panel as it was.
+        return pressTrainPanel(interaction, ctx, partyId, id.action, id.args[0], id.args[1]);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -4,9 +4,11 @@ import {
   isMeetup,
   isRaid,
   isTimed,
+  isTrain,
   partyWord,
   type Party,
   type RaidParty,
+  type TrainParty,
 } from '../domain/party/party.js';
 import { channelContext } from './channel-context.js';
 import type { Guard, LocatedInteraction } from './command.js';
@@ -238,3 +240,17 @@ export const requireTimed: Guard = requirePartyOf(isTimed, A_TIMED_PARTY);
 
 /** For commands that are about a meetup as such (`/info`). */
 export const requireMeetup: Guard = requirePartyOf(isMeetup, 'a meetup');
+
+/** What a member is told who uses something that is for trains in the post of another party. */
+export function notATrain(party: Pick<Party, 'type'>): string {
+  return wrongPost(party, 'a train');
+}
+
+/** For commands that are about a train as such: its route, its conductor, moving it. */
+export const requireTrain: Guard = requirePartyOf(isTrain, 'a train');
+
+/** The train whose forum post an interaction came from; undefined in any other place. */
+export function trainOf(interaction: LocatedInteraction, ctx: AppContext): TrainParty | undefined {
+  const party = partyOf(interaction, ctx);
+  return party && isTrain(party) ? party : undefined;
+}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/in-train.test.ts src/commands/trains/move.test.ts src/commands/trains/route.test.ts src/commands/trains/train.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff c0a8199 -- src test   # must print nothing
npx prettier --check src/commands/index.ts src/commands/meetups/meetup.ts src/commands/parties/in-train.test.ts src/commands/parties/reply.ts src/commands/parties/timed.ts src/commands/trains/conductor.ts src/commands/trains/move.test.ts src/commands/trains/move.ts src/commands/trains/route.test.ts src/commands/trains/route.ts src/commands/trains/train.test.ts src/commands/trains/train.ts src/components/party.ts src/discord/guards.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/index.ts src/commands/meetups/meetup.ts src/commands/parties/in-train.test.ts src/commands/parties/reply.ts src/commands/parties/timed.ts src/commands/trains/conductor.ts src/commands/trains/move.test.ts src/commands/trains/move.ts src/commands/trains/route.test.ts src/commands/trains/route.ts src/commands/trains/train.test.ts src/commands/trains/train.ts src/components/party.ts src/discord/guards.ts
git commit -m "The new commands and buttons: train, route, conductor, next, previous, skip, finish" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,563 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-3b HEAD -- src test` prints nothing; `npm run test:db` once, complete; `npm run build`.
2. Whole-branch review (Opus, high effort) of the nine commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for the train (`TrainParty`, `isTrain`, `requireTrain` / `commandTrain`, `requireRaidOrTrain`, `bossOf`), `ctx.trains` with `src/domain/party/train.ts` (the current stop follows its gym; an edit that moves the train is a movement; `placeOf` / `targetOf`), `storedChange`, `Gathered`, the panel and its custom ids, saved routes (`SavedRouteRepository`, `id:<n>`), `renderTrainPost` / `timed-post.ts`, `warningAddressee`, the test support (`testTrain()`, `asTrain()`, `createdTrain()`, `MemorySavedRoutes`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 3B" section (what is left open, what Phases 4, 5 and 8 must pick up, the things named under "Not in this plan"). The spec ("as built" for 4.1 row 4, the row `train …` of 4.2 and 5.5), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. Before: `npm run deploy-commands -- --guild <test server id>` (seven new commands, changed descriptions; note whether Discord accepts an integer option that has both a minimum and autocomplete). For the clock, use the settings copy of `var/stage/` with a short `trainOrMeetupDeletionWarningTime`. It comes after the staging of plan 3A.

- [ ] `/help`: "Trains" lists `/train`, `/route`, `/conductor`, `/next`, `/previous`, `/skip`, `/finish`; "Raid Basics" still shows descriptions (its field is close to Discord's limit).
- [ ] `/train name:Staging loop` in a region channel: a private answer with the link; the post is in that region's forum, titled "Train · Staging loop", tagged Train; it says "Created by", that there is no route yet and no time; the region channel has "New train: …"; the pinned list has a Trains section. Refused in a post and outside a region, and a refusal does not count against 2 per 900 seconds.
- [ ] The buttons of the post: Interested, Join, Here, Leave; −1, +1, Remote / in person; the group buttons once there are two groups; and on a row of its own the grey "Move train…". No Done, no "Set time".
- [ ] `/route add` three or four gyms (autocomplete, a gym of the other region, a gym twice: refused, a guess: offered as a choice). The first stop pings nobody. The post shows the current and the next stop as links and the numbered route; EX gyms are marked.
- [ ] `/route show`, `/route move from:3 to:1`, `/route remove stop:2` (the stop numbers offer the route; try typing words into the number option); the train stays at the gym it was at.
- [ ] "Move train…": the private panel with where the train is and what comes next; Next changes the panel in place; the impossible buttons are grey; Skip names the stop left out; Finish; Previous from finished. A few seconds after a move one message in the post names the gym with its link and who moved the train; Next pressed twice quickly gives one message.
- [ ] `/next`, `/previous`, `/skip`, `/finish` typed: the same, with a private answer naming the stop. On a train without a route each is refused with a sentence, and "Move train…" answers with one sentence and no buttons.
- [ ] A panel left open while the train is moved by a command: its next press moves nothing and shows the fresh panel with "The train has moved on meanwhile."; after the stop it promised was removed: "The route has changed meanwhile."
- [ ] `/conductor set` (the post names the conductor), `/conductor clear`; the conductor leaves with `/leave`, `/done` and the Leave button: "… has left: this train has no conductor now."
- [ ] Removing the current stop: the train is at the next gym, announced like a move; adding a stop to a finished route: the train continues there.
- [ ] `/route save name:Loop`, saving again under `loop` (replaced), `/route clear` (staff or conductor), `/route load` (the list offers the saved routes; the train is at the first stop), `/route forget`; a name `id:1` is refused; a row the legacy bot wrote, if the test database has one.
- [ ] `/boss pokemon:` in the train: the list has no eggs; a boss gives the picture and the block with weaknesses and catch CP; `t5 <name>` works, `t5` alone is refused, a Pokémon that is no current boss is accepted, `none` takes it off.
- [ ] `/where`: the current stop with its map; "no route yet" and "finished" as sentences. `/status` in the post (the copy's "Move train…" works) and in the region channel.
- [ ] `/group new`, `/group label`, the group buttons; `/meet time:6:15pm`, `/cancel-meet`, `/end time:9pm`, `/name`; `/hatch`, `/duration`, `/moveset`, `/location`, `/info` refused with a sentence that names the kind of post.
- [ ] The clock: with an end time (Ended, warned, archived); without any time (the warning pings the conductor, or the maker when there is none).
- [ ] `/delete` as staff; "Move train…" on a stale copy: "This train is over." (Join and Leave there: "This has ended."); a panel press after the train ended, also by staff, and whether it opens the archived post again.
- [ ] Restart the bot with a train open and a panel open: the post is shown anew, the panel's buttons still work.
- [ ] A raid and a meetup once over lightly, since their services moved onto the shared skeleton: join, `/boss`, `/end`, `/meet` in each.
- [ ] What the fakes cannot show, to note down: links written `[name](<url>)` in a message (a link, no preview) and `[name](url)` in the embed, also for a gym name with brackets; `1\.` shown as "1." and not as a list; strike-through around a link; the post with twenty stops and several groups on desktop and phone; `/route show` on a long route as several private messages in order; a press on a panel older than fifteen minutes; what a double click does.

Needs a second ordinary account: the movement ping, and none with `trainMovement` or `mentions` off (set in the database: `/settings` does not exist yet); "Moved by" not pinging the mover; with a conductor, the other account refused the moves, the panel and the removal of the current stop, and allowed another stop; the archive warning's ping; a member of another region signing up for a train (forum access given and taken back).
