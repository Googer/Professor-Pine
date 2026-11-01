# Phase 3C: A Train in the Regions It Stops In, and a Finish That Can Be Taken Back: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two things Matt asked for on 2026-10-12 after plan 3B. A mistaken Finish can be taken back: Previous on a finished route leads to the stop the train was at, not to the last stop. And a train can be joined from the other regions it stops in: a copy of its message, with the buttons to sign up, stands in the text channel of every other region of the server that a gym of its route lies in.

**Architecture:** `TrainDetails` gets `finishedFrom` (the gym id of the stop a move finished the route from; state document version 6), kept in one place (`withTrain` in `src/domain/party/train.ts`), and `stopAfter` / `targetOf` lead Previous there. The copies are a new mirror kind `region`; `PartyMirrors` keeps one newest copy per slot (the kind, and for `region` the kind in a channel) in its queue of the shared channels, and a run of that queue that left something undone is followed by one more ten minutes later. Signing up on a copy is what it is everywhere (`AttendanceService`, then `AccessService` lets the member into the forum).

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies, no migration; the state document goes from version 5 to 6, and `mirrorMessages` (a column of its own, not versioned) gets one more kind.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: section 9 (Phase 3), 5.2 (copies), 5.5 (the state document). The request is in `docs/superpowers/plans/phase-0-follow-ups.md`, "From Phase 3B", "Decided by Matt (2026-10-12)". The design brief with the rulings is the git-ignored `.superpowers/sdd/phase-3c-design.md`.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (2,631 unit tests at the end). Two reviewers went through that branch and a third through the fixes; what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **What a train remembers.** `train.finishedFrom` is the gym (not the stop number: it follows its gym through route edits like the current stop) the train was at when a move finished its route (Finish, or Next from the last stop). It is null whenever the route is not finished, for a route that an edit finished (the last, current stop was removed), and once that gym leaves the route. The state document checks that; version 5 is read as a train that remembers nothing.
2. **Previous from a finished route** leads to the remembered stop, and to the last stop when nothing is remembered. Going back to the remembered stop leaves who is Here as Here (Finish left them so, and nobody went anywhere); going back to the last stop without a memory puts Here back to Coming like any move to a gym.
3. **The panel.** Its Previous button carries where it leads, like Next and Skip (`party:<id>:previous:<place>:<target>`): a press that would lead elsewhere moves nothing and shows the panel anew ("That button no longer leads where it said."). On a finished route the panel and the answers to the moves say where Previous leads.
4. **The announcement is unchanged:** Finish and then Previous within the five seconds says nothing (the train is where it started); after a pause it says the train is moving back to that gym.
5. **Where a train has copies.** In the text channel of every region of the train's server that a gym of its route lies in (the whole route, also the stops behind it and on a finished route; a gym in several regions counts for all), except the train's own region, and only where the bot may post embeds (`PartyGateway.mayPost`: without Embed Links Discord would show the message without its embed). They come and go as the route changes and are deleted when the train ends.
6. **What a copy is.** The post's embed, above it "A raid train that stops in this region. Sign up here to follow it in its post: <#post>", and the post's buttons without the row "Move train…" (the copy is an invitation; the train is moved from its post). Signing up there lets a member of another region into the forum as everywhere.
7. **Trying again.** A copy in a shared channel whose edit or send failed, or whose channel refuses the bot or is gone, is tried again ten minutes later without waiting for the party to change (one timer per party). That holds for a raid's copies in the remote and EX channels too; nothing else about them changes.
8. **Not in this plan** (to the follow-ups file): the train in the pinned list of the other regions' forums; copies only for the stops ahead; telling a member who signed up on a copy where the post is; copies left when a deletion fails at the end; a way for a moderator to keep a copy out of a channel.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). Only `DiscordPartyGateway` calls discord.js for parties.
- Database changes are additive only (this plan has none); `src/db/types.ts` is generated, never edited by hand.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` and the fake interactions.
- A party is never mutated; it changes only through `PartyStore.update`. Never cast a party to a kind.
- Nothing is sent into or edited in a post after it was archived: Discord opens an archived post again for that.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Each task names the commit of the prototype it transcribes (branch `proto/phase-3c` of this repository). `git diff <that commit> -- src test` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting). Check its exit status, not only the end of its output.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. A train must never be stored in a state that cannot be read back: Task 1, the tests of `finishedFrom` in `train.test.ts` (every edit and move from a finished route with and without a memory) and of version 6 and the version 5 reader in `party-state.test.ts`.
2. A stale panel must move nothing: Task 1, the tests of the Previous target in `move.test.ts` (the remembered stop removed, another member finishing from another stop, a button drawn before this plan).
3. A raid's copies and the `/status` copy must behave as before: Task 2, `party-mirrors.test.ts` and `render/mirrors.test.ts` untouched over the slots and the retry.
4. Two copies of one train must not disturb each other, and nothing with live buttons may be left that nobody knows of: Task 2, `party-mirrors.region.test.ts` (a gym in two regions, a failed deletion or edit in one region, a channel without Embed Links, a channel that is gone, the end of a train while a copy is on its way, a restart).
5. A member who cannot see the forum must be able to sign up and get in, and nobody else is let in: Task 2, `party.train-copy.test.ts` (every button of a copy pressed by a shut-out member; a press after the train ended).

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
src/components/party.train-copy.test.ts  (create, task 2)
src/render/mirrors.region.test.ts  (create, task 2)
src/services/party-mirrors.region.test.ts  (create, task 2)
```

---

### Task 1: A Finish that can be taken back

**Files:**
- Modify: `src/commands/trains/move.test.ts`, `src/commands/trains/move.ts`, `src/db/repositories/party-repository.db.test.ts`, `src/domain/party/party-state.test.ts`, `src/domain/party/party-state.ts`, `src/domain/party/party.ts`, `src/domain/party/tick.train.test.ts`, `src/domain/party/train.test.ts`, `src/domain/party/train.ts`, `src/render/activity.test.ts`, `src/render/activity.ts`, `src/render/train-panel.ts`, `src/render/train-post.test.ts`, `src/services/train-service.test.ts`

**Interfaces:**
- Consumes: `TrainDetails`, `withTrain`, `moveTrain`, `targetOf` and the private `stopAfter` of `src/domain/party/train.ts`; the state document of plan 3B (version 5); `trainPanel` / `whereText` (`src/render/train-panel.ts`); `pressTrainPanel` (`src/commands/trains/move.ts`); `testTrain()`.
- Produces: `TrainDetails.finishedFrom: number | null`; `stopAfter(party, move): number` exported, with Previous from a finished route leading to the remembered stop; `withTrain` keeping the invariant of `finishedFrom` for every function of `train.ts`; `PARTY_STATE_VERSION` 6 with a reader for version 5; the panel's Previous button carrying its target (`party:<id>:previous:<place>:<target>`); the sentence of `route-changed` reworded; the panel's and the moves' words on a finished route.

The announcement of a movement is not changed; two tests pin what it says after Finish and Previous. `party-repository.db.test.ts` changes (a finished train with `finishedFrom` goes through MySQL).

Reference commit of the prototype for this task: `2bc9a40`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/trains/move.test.ts`:

```diff
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -143,14 +143,20 @@ describe('/next, /previous, /skip and /finish', () => {
       `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
     );
     expect(await made.answer('finish')).toBe(
-      'The train has finished its route of 4 stops. I am telling the others.',
+      `The train has finished its route of 4 stops. Previous takes it back to stop 2: ${STACKS}. ` +
+        'I am telling the others.',
     );
+    // Back from the end, the train is where it was when the route was finished.
     expect(await made.answer('previous')).toBe(
+      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
+    );
+    expect(await made.answer('skip')).toBe(
       `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop. I am telling the others.`,
     );
     // From the last stop, next finishes the route.
     expect(await made.answer('next')).toBe(
-      'The train has finished its route of 4 stops. I am telling the others.',
+      `The train has finished its route of 4 stops. Previous takes it back to stop 4: ${FOUNTAIN}. ` +
+        'I am telling the others.',
     );
     expect(made.current()).toMatchObject({ status: 'active', train: { stop: 4 } });
   });
@@ -349,7 +355,7 @@ describe('the button "Move train…" and its panel', () => {
     // Skip also where they lead: to gym 1, and past it to gym 7.
     const [row] = made.panel().components;
     expect(row?.components.map((button) => button.custom_id)).toEqual(
-      ['next:4:1', 'previous:4', 'skip:4:7', 'finish:4'].map(
+      ['next:4:1', 'previous:4:4', 'skip:4:7', 'finish:4'].map(
         (action) => `party:${made.party.id}:${action}`,
       ),
     );
@@ -412,7 +418,9 @@ describe('the button "Move train…" and its panel', () => {
     expect(sent(back.update).content).toMatch(/^The train is at stop 3 of 4/);
     const finished = await made.press('finish');
     expect(finished.update).toHaveBeenCalledWith(made.panel());
-    expect(sent(finished.update).content).toBe('The train has finished its route of 4 stops.');
+    expect(sent(finished.update).content).toBe(
+      `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL}.`,
+    );
     // The others are told once, where the train ended up.
     expect(await made.lines()).toEqual([
       `The train has finished its route. Moved by <@${ALICE}>.`,
@@ -472,17 +480,88 @@ describe('the button "Move train…" and its panel', () => {
     expect(made.current().train.stop).toBe(4);
     expect(pressed.update).toHaveBeenCalledWith({
       ...made.panel(),
-      content: 'The train has moved on meanwhile.\nThe train has finished its route of 4 stops.',
+      content:
+        'The train has moved on meanwhile.\nThe train has finished its route of 4 stops. ' +
+        `Previous takes it back to stop 1: ${BRIDGE}.`,
     });
-    // From the panel as it is now, Previous works.
+    // From the panel as it is now, Previous works: back to where Bob finished the route from.
     const back = await made.press('previous');
     expect(sent(back.update).content).toBe(
-      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop.`,
+      `The train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}.`,
     );
     // A button without the place it was drawn at (none is made so) moves nothing either.
     const bare = await made.click('previous');
     expect(sent(bare.update).content).toMatch(/^The train has moved on meanwhile\.\n/);
+    expect(made.current().train.stop).toBe(0);
+  });
+
+  it('takes a mistaken Finish back: Previous leads to the stop the train was at, and who is here stays here', async () => {
+    const made = await setup();
+    await made.press('next');
+    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
+    const finished = await made.press('finish');
+    expect(sent(finished.update).content).toBe(
+      `The train has finished its route of 4 stops. Previous takes it back to stop 2: ${STACKS}.`,
+    );
+    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: 1 });
+    const back = await made.press('previous');
+    expect(back.update).toHaveBeenCalledWith(made.panel());
+    expect(sent(back.update).content).toBe(
+      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`,
+    );
+    expect(made.current().train).toMatchObject({ stop: 1, finishedFrom: null });
+    // Nobody went anywhere.
+    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
+    // The same by the commands.
+    await made.run('finish');
+    expect(await made.answer('previous')).toBe(
+      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
+    );
+    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
+  });
+
+  it('does not take the train back to another stop than its Previous said', async () => {
+    const made = await setup();
+    await made.press('next');
+    await made.press('finish');
+    // Alice's panel says "Previous takes it back to The Stacks"; Bob takes that stop off.
+    await made.trains.removeStop(made.party.id, { id: BOB }, 2);
+    const pressed = await made.click('previous:end:1');
+    expect(made.current().train).toMatchObject({ route: [4, 7, 2], stop: 3 });
+    expect(pressed.update).toHaveBeenCalledWith({
+      ...made.panel(),
+      content:
+        'That button no longer leads where it said.\n' +
+        'The train has finished its route of 3 stops. ' +
+        `Previous takes it back to stop 3: ${FOUNTAIN}.`,
+    });
+    // A Previous without where it leads (none is made so) moves nothing either.
+    const bare = await made.click('previous:end');
     expect(made.current().train.stop).toBe(3);
+    expect(sent(bare.update).content).toMatch(/^That button no longer leads where it said\.\n/);
+    // The fresh button leads where the panel now says.
+    const back = await made.press('previous');
+    expect(sent(back.update).content).toBe(
+      `The train is at stop 3 of 3: ${FOUNTAIN}. It is the last stop.`,
+    );
+  });
+
+  it('does not take the train back to another stop when the route was finished anew meanwhile', async () => {
+    const made = await setup();
+    await made.press('next');
+    await made.press('finish');
+    // Alice's panel says "Previous takes it back to The Stacks". Bob takes the Finish back,
+    // moves on and finishes the route from the mural: no stop was added or removed.
+    const bob = { id: BOB };
+    await made.trains.move(made.party.id, bob, 'previous', false);
+    await made.trains.move(made.party.id, bob, 'next', false);
+    await made.trains.move(made.party.id, bob, 'finish', false);
+    const pressed = await made.click('previous:end:1');
+    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: 7 });
+    expect(sent(pressed.update).content).toBe(
+      'That button no longer leads where it said.\n' +
+        `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL}.`,
+    );
   });
 
   it('follows the gym, not the number of the stop: an edit that leaves the train where it is keeps the panel good', async () => {
@@ -513,7 +592,9 @@ describe('the button "Move train…" and its panel', () => {
     expect(made.current().train.stop).toBe(0);
     expect(pressed.update).toHaveBeenCalledWith({
       ...made.panel(),
-      content: `The route has changed meanwhile.\nThe train is at stop 1 of 3: ${BRIDGE}. Next is ${MURAL}.`,
+      content:
+        'That button no longer leads where it said.\n' +
+        `The train is at stop 1 of 3: ${BRIDGE}. Next is ${MURAL}.`,
     });
     // The fresh buttons lead where the panel now says.
     const next = await made.press('next');
@@ -523,11 +604,11 @@ describe('the button "Move train…" and its panel', () => {
     await skip.trains.removeStop(skip.party.id, { id: BOB }, 3);
     const skipped = await skip.click('skip:4:7');
     expect(skip.current().train.stop).toBe(0);
-    expect(sent(skipped.update).content).toMatch(/^The route has changed meanwhile\.\n/);
+    expect(sent(skipped.update).content).toMatch(/^That button no longer leads where it said\.\n/);
     // A Next or Skip without what it promised (none is made so) moves nothing either.
     const bare = await skip.click('next:4');
     expect(skip.current().train.stop).toBe(0);
-    expect(sent(bare.update).content).toMatch(/^The route has changed meanwhile\.\n/);
+    expect(sent(bare.update).content).toMatch(/^That button no longer leads where it said\.\n/);
   });
 
   it('keeps the ids of its buttons within what Discord takes, whatever the ids of the gyms', async () => {
@@ -548,7 +629,7 @@ describe('the button "Move train…" and its panel', () => {
     const pressed = await made.click('next:end');
     expect(pressed.update).toHaveBeenCalledWith({
       ...made.panel(),
-      content: 'The train has finished its route of 4 stops.',
+      content: `The train has finished its route of 4 stops. Previous takes it back to stop 1: ${BRIDGE}.`,
     });
     const first = await setup();
     const back = await first.click('previous:4');
```

Apply to `src/db/repositories/party-repository.db.test.ts`:

```diff
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -150,7 +150,13 @@ describe('PartyRepository', () => {
       groups: [{ id: 'A' }, { id: 'B', label: 'by car' }],
       defaultGroupId: 'B',
       timed: { ...train.timed, startTime: PARTY_NOW + 60 * MINUTE },
-      train: { route: [2, 1], stop: 1, conductorId: ALICE, boss: { key: 'yveltal' } },
+      train: {
+        route: [2, 1],
+        stop: 1,
+        finishedFrom: null,
+        conductorId: ALICE,
+        boss: { key: 'yveltal' },
+      },
     };
   }
 
@@ -178,7 +184,13 @@ describe('PartyRepository', () => {
     await parties.insert(train);
     const changed: TrainParty = {
       ...train,
-      train: { route: [1], stop: 1, conductorId: null, boss: { name: 'Newmon' } },
+      train: {
+        route: [1],
+        stop: 1,
+        finishedFrom: 1,
+        conductorId: null,
+        boss: { name: 'Newmon' },
+      },
       updatedAt: PARTY_NOW + 5,
     };
     expect(await parties.save(changed)).toBe(true);
```

Apply to `src/domain/party/party-state.test.ts`:

```diff
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -129,7 +129,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(5);
+    expect(state.v).toBe(6);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -169,7 +169,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 6 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 7 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -526,7 +526,13 @@ function fullTrain(): TrainParty {
     defaultGroupId: 'B',
     prompts: { completion: [], warning: '300000000000000004' },
     timed: { ...train.timed, startTime: PARTY_NOW + 3_600_000 },
-    train: { route: [4, 1, 7], stop: 1, conductorId: ALICE, boss: { key: 'yveltal' } },
+    train: {
+      route: [4, 1, 7],
+      stop: 1,
+      finishedFrom: null,
+      conductorId: ALICE,
+      boss: { key: 'yveltal' },
+    },
   };
 }
 
@@ -564,12 +570,14 @@ describe('the state of a train', () => {
     expect(state.train).toEqual({
       route: [4, 1, 7],
       stop: 1,
+      finishedFrom: null,
       conductorId: ALICE,
       boss: { key: 'yveltal' },
     });
     expect(partyState(testTrain()).train).toEqual({
       route: [],
       stop: 0,
+      finishedFrom: null,
       conductorId: null,
       boss: null,
     });
@@ -578,7 +586,13 @@ describe('the state of a train', () => {
   it('keeps a finished route, and a boss known only by the name of the feed', () => {
     const train: TrainParty = {
       ...fullTrain(),
-      train: { route: [4, 1, 7], stop: 3, conductorId: null, boss: { name: 'Newmon' } },
+      train: {
+        route: [4, 1, 7],
+        stop: 3,
+        finishedFrom: null,
+        conductorId: null,
+        boss: { name: 'Newmon' },
+      },
     };
     expect(partyFromStored(columnsOf(train), stored(partyState(train)), [])).toEqual({
       ok: true,
@@ -586,6 +600,72 @@ describe('the state of a train', () => {
     });
   });
 
+  it('keeps the stop a route was finished from, and only on a finished route that has that gym', () => {
+    const train = fullTrain();
+    const finished: TrainParty = { ...train, train: { ...train.train, stop: 3, finishedFrom: 1 } };
+    expect(partyState(finished).train).toMatchObject({ stop: 3, finishedFrom: 1 });
+    expect(partyFromStored(columnsOf(finished), stored(partyState(finished)), [])).toEqual({
+      ok: true,
+      party: finished,
+    });
+    const state = stored(partyState(finished)) as Record<string, unknown>;
+    const withTrain = (details: object): string =>
+      problem(columnsOf(train), { ...state, train: { ...finished.train, ...details } });
+    expect(withTrain({})).toBe('read');
+    expect(withTrain({ finishedFrom: null })).toBe('read');
+    expect(withTrain({ stop: 2 })).toMatch(/a route that is not finished remembers where it was/);
+    expect(withTrain({ finishedFrom: 9 })).toMatch(/finished from a gym that is not on it/);
+    expect(withTrain({ finishedFrom: 0 })).toMatch(/^state: /);
+    expect(withTrain({ finishedFrom: '1' })).toMatch(/^state: /);
+    expect(withTrain({ finishedFrom: undefined })).toMatch(/^state: /);
+    expect(withTrain({ route: [], stop: 0 })).toMatch(/not finished/);
+    // Such a train is never written either.
+    expect(() =>
+      partyState({ ...train, train: { ...train.train, stop: 1, finishedFrom: 4 } }),
+    ).toThrow(/cannot be stored/);
+    expect(() =>
+      partyState({ ...train, train: { ...train.train, stop: 3, finishedFrom: 9 } }),
+    ).toThrow(/cannot be stored/);
+  });
+
+  it('reads a version 5 document as a train that remembers no stop it finished from', () => {
+    const train = fullTrain();
+    const { finishedFrom: _finishedFrom, ...details } = partyState(train).train ?? {};
+    const old = stored({ ...partyState(train), v: 5, train: details });
+    expect(partyFromStored(columnsOf(train), old, [])).toEqual({ ok: true, party: train });
+    // Also one on a finished route: Previous leads to its last stop, as it did.
+    const finished: TrainParty = { ...train, train: { ...train.train, stop: 3 } };
+    const oldFinished = stored({ ...partyState(finished), v: 5, train: { ...details, stop: 3 } });
+    expect(partyFromStored(columnsOf(finished), oldFinished, [])).toEqual({
+      ok: true,
+      party: finished,
+    });
+    // What version 5 did not know is not read from it.
+    expect(problem(columnsOf(finished), stored({ ...partyState(finished), v: 5 }))).toBe('read');
+    const sneaked = partyFromStored(
+      columnsOf(finished),
+      stored({ ...partyState(finished), v: 5, train: { ...details, stop: 3, finishedFrom: 1 } }),
+      [],
+    );
+    expect(sneaked).toEqual({ ok: true, party: finished });
+    // A raid and a meetup of version 5 are read as they are.
+    const meetup = testMeetup();
+    expect(partyFromStored(columnsOf(meetup), stored({ ...partyState(meetup), v: 5 }), [])).toEqual(
+      { ok: true, party: meetup },
+    );
+    const raid = fullRaid();
+    expect(
+      partyFromStored(columnsOf(raid), stored({ ...partyState(raid), v: 5 }), raid.mirrorMessages),
+    ).toEqual({ ok: true, party: raid });
+    // A damaged one is reported.
+    expect(
+      problem(
+        columnsOf(train),
+        stored({ ...partyState(train), v: 5, train: { ...details, stop: 9 } }),
+      ),
+    ).toMatch(/the train is at a stop beyond its route/);
+  });
+
   it('reports a row whose document is not that of a train', () => {
     const train = fullTrain();
     const state = stored(partyState(train)) as Record<string, unknown>;
```

Apply to `src/domain/party/tick.train.test.ts`:

```diff
--- a/src/domain/party/tick.train.test.ts
+++ b/src/domain/party/tick.train.test.ts
@@ -54,7 +54,13 @@ const boarded: TrainParty = {
     [ALICE]: { status: PartyStatus.Present },
     [BOB]: { status: PartyStatus.Present },
   }),
-  train: { route: [4, 1, 7], stop: 0, conductorId: null, boss: { key: 'yveltal' } },
+  train: {
+    route: [4, 1, 7],
+    stop: 0,
+    finishedFrom: null,
+    conductorId: null,
+    boss: { key: 'yveltal' },
+  },
 };
 /** The same from 16:00 to 18:00. */
 const planned = changed(
```

Apply to `src/domain/party/train.test.ts`:

```diff
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -87,7 +87,7 @@ describe('createTrain', () => {
         saved: false,
         createdAt: PARTY_NOW,
         timed: { name: 'Saturday legendaries', startTime: null },
-        train: { route: [], stop: 0, conductorId: null, boss: null },
+        train: { route: [], stop: 0, finishedFrom: null, conductorId: null, boss: null },
       },
     });
   });
@@ -319,6 +319,7 @@ describe('clearRoute and replaceRoute', () => {
     expect(cleared.ok && cleared.party.train).toEqual({
       route: [],
       stop: 0,
+      finishedFrom: null,
       conductorId: ALICE,
       boss: { key: 'yveltal' },
     });
@@ -362,7 +363,7 @@ describe('moveTrain', () => {
     );
   });
 
-  it('goes back one stop, also from a finished route, and not from the first stop', () => {
+  it('goes back one stop, from a route that an edit finished to its last stop, and not from the first stop', () => {
     expect(moveTrain(onRoute([4, 1, 7], 2), ALICE, 'previous', false)).toMatchObject({
       ok: true,
       at: 1,
@@ -695,8 +696,9 @@ describe('Finish, and Next from the last stop', () => {
     const early = withAttendees(onRoute([4, 1, 7], 0), { [BOB]: { status: PartyStatus.Present } });
     const finished = moveTrain(early, ALICE, 'finish', false);
     expect(finished.ok && finished.party.attendees[BOB]?.status).toBe(PartyStatus.Present);
-    // Back from the end, the train goes to a gym again.
-    const back = finished.ok ? moveTrain(finished.party, ALICE, 'previous', false) : finished;
+    // Back from the end of a route that nothing is remembered of, the train goes to another gym.
+    const edited = withAttendees(onRoute([4, 1, 7], 3), { [BOB]: { status: PartyStatus.Present } });
+    const back = moveTrain(edited, ALICE, 'previous', false);
     expect(back.ok && back.party.attendees[BOB]?.status).toBe(PartyStatus.Coming);
   });
 });
@@ -796,7 +798,140 @@ describe('a move asked for with the stop it was promised to lead to', () => {
     expect(moveTrain(onRoute([4, 1], 0), ALICE, 'skip', false, '4', '7')).toEqual(
       refusal('no-stop-to-skip'),
     );
-    // Without a target (Previous, Finish, a command) only the place counts.
+    // Without a target (Finish, a command) only the place counts.
     expect(moveTrain(edited, ALICE, 'next', false, '4').ok).toBe(true);
   });
 });
+
+describe('a Finish that is taken back', () => {
+  /** The train after a change; throws when it was refused. */
+  const after = (change: Change<TrainParty>): TrainParty => {
+    if (!change.ok) throw new Error(`refused: ${change.reason}`);
+    return change.party;
+  };
+  /** A route of four stops that was finished from its second, gym 1. */
+  const finished = after(moveTrain(onRoute([4, 1, 7, 9], 1), ALICE, 'finish', false));
+
+  it('remembers the gym the train was at when a move finished its route', () => {
+    expect(finished.train).toMatchObject({ stop: 4, finishedFrom: 1 });
+    const last = after(moveTrain(onRoute([4, 1, 7], 2), ALICE, 'next', false));
+    expect(last.train).toMatchObject({ stop: 3, finishedFrom: 7 });
+    // Nothing is remembered on a route that is not finished.
+    expect(onRoute([4, 1, 7], 1).train.finishedFrom).toBeNull();
+    for (const move of ['next', 'skip'] as const) {
+      expect(
+        after(moveTrain(onRoute([4, 1, 7]), ALICE, move, false)).train.finishedFrom,
+      ).toBeNull();
+    }
+  });
+
+  it('goes back to that stop with Previous, and remembers nothing afterwards', () => {
+    expect(targetOf(finished, 'previous')).toBe('1');
+    const back = moveTrain(finished, ALICE, 'previous', false);
+    expect(back).toMatchObject({ ok: true, move: 'previous', at: 1, finished: false });
+    expect(after(back).train).toMatchObject({ route: [4, 1, 7, 9], stop: 1, finishedFrom: null });
+    // From there the train goes on as if nothing had happened.
+    expect(moveTrain(after(back), ALICE, 'next', false)).toMatchObject({ ok: true, at: 7 });
+    expect(moveTrain(after(back), ALICE, 'previous', false)).toMatchObject({ ok: true, at: 4 });
+  });
+
+  it('leaves who is here as here on the way back: nobody went anywhere', () => {
+    const train = withAttendees(onRoute([4, 1, 7, 9], 1), {
+      [BOB]: { status: PartyStatus.Present },
+    });
+    const end = after(moveTrain(train, ALICE, 'finish', false));
+    expect(end.attendees).toBe(train.attendees);
+    const back = after(moveTrain(end, ALICE, 'previous', false));
+    expect(currentStop(back)).toBe(1);
+    expect(back.attendees).toBe(train.attendees);
+    // A second Previous is a move to another gym like any other.
+    const further = after(moveTrain(back, ALICE, 'previous', false));
+    expect(further.attendees[BOB]?.status).toBe(PartyStatus.Coming);
+  });
+
+  it('puts who is here back to coming when the train goes back to another stop than it finished from', () => {
+    // The stop it finished from is no longer on the route: back to the last stop.
+    const train = withAttendees(finished, { [BOB]: { status: PartyStatus.Present } });
+    const forgotten = after(removeStop(train, ALICE, 2));
+    const back = after(moveTrain(forgotten, ALICE, 'previous', false));
+    expect(currentStop(back)).toBe(9);
+    expect(back.attendees[BOB]?.status).toBe(PartyStatus.Coming);
+  });
+
+  it('follows its gym when other stops are removed or moved', () => {
+    const removed = removeStop(finished, ALICE, 1);
+    expect(removed).toMatchObject({ ok: true, moved: false });
+    expect(after(removed).train).toMatchObject({ route: [1, 7, 9], stop: 3, finishedFrom: 1 });
+    expect(moveTrain(after(removed), ALICE, 'previous', false)).toMatchObject({ ok: true, at: 1 });
+    const moved = after(moveStop(finished, ALICE, 2, 4));
+    expect(moved.train).toMatchObject({ route: [4, 7, 9, 1], stop: 4, finishedFrom: 1 });
+    expect(targetOf(moved, 'previous')).toBe('1');
+    expect(after(moveTrain(moved, ALICE, 'previous', false)).train.stop).toBe(3);
+  });
+
+  it('is forgotten when its gym is taken off the route: Previous leads to the last stop', () => {
+    const removed = removeStop(finished, ALICE, 2);
+    // The train is where it was, at the end: that is no movement.
+    expect(removed).toMatchObject({ ok: true, gymId: 1, moved: false });
+    expect(after(removed).train).toMatchObject({ route: [4, 7, 9], stop: 3, finishedFrom: null });
+    expect(targetOf(after(removed), 'previous')).toBe('9');
+    expect(moveTrain(after(removed), ALICE, 'previous', false)).toMatchObject({ ok: true, at: 9 });
+  });
+
+  it('is not remembered for a route that an edit finished', () => {
+    const removed = removeStop(onRoute([4, 1, 7], 2), ALICE, 3);
+    expect(removed).toMatchObject({ ok: true, moved: true });
+    expect(after(removed).train).toMatchObject({ route: [4, 1], stop: 2, finishedFrom: null });
+    expect(targetOf(after(removed), 'previous')).toBe('1');
+  });
+
+  it('is forgotten when the train goes on, and with the route', () => {
+    const added = addStop(finished, ALICE, 2);
+    expect(added).toMatchObject({ ok: true, number: 5, moved: true });
+    expect(after(added).train).toMatchObject({ stop: 4, finishedFrom: null });
+    expect(moveTrain(after(added), ALICE, 'previous', false)).toMatchObject({ ok: true, at: 9 });
+    expect(after(clearRoute(finished, ALICE, true)).train).toMatchObject({
+      route: [],
+      stop: 0,
+      finishedFrom: null,
+    });
+    expect(after(replaceRoute(finished, ALICE, [4, 1, 7, 9])).train).toMatchObject({
+      route: [4, 1, 7, 9],
+      stop: 0,
+      finishedFrom: null,
+    });
+    // The one stop of a route, removed after the route was finished from it.
+    const single = after(moveTrain(onRoute([4]), ALICE, 'finish', false));
+    expect(after(removeStop(single, ALICE, 1)).train).toMatchObject({
+      route: [],
+      stop: 0,
+      finishedFrom: null,
+    });
+  });
+
+  it('stays through what is not about the route: the conductor and the boss', () => {
+    const led = after(setConductor(finished, ALICE));
+    expect(led.train.finishedFrom).toBe(1);
+    expect(after(clearConductor(led, ALICE, false)).train.finishedFrom).toBe(1);
+    expect(after(setTrainBoss(finished, { key: 'yveltal' })).train.finishedFrom).toBe(1);
+  });
+
+  it('refuses a Previous that would lead elsewhere than its control said', () => {
+    // The panel was drawn at the end with "back to gym 1"; gym 1 was removed since.
+    const forgotten = after(removeStop(finished, ALICE, 2));
+    expect(moveTrain(forgotten, ALICE, 'previous', false, 'end', '1')).toEqual(
+      refusal('route-changed'),
+    );
+    expect(moveTrain(forgotten, ALICE, 'previous', false, 'end', '9')).toMatchObject({
+      ok: true,
+      at: 9,
+    });
+    expect(moveTrain(finished, ALICE, 'previous', false, 'end', '1')).toMatchObject({
+      ok: true,
+      at: 1,
+    });
+    expect(moveTrain(finished, ALICE, 'previous', false, 'end', '9')).toEqual(
+      refusal('route-changed'),
+    );
+  });
+});
```

Apply to `src/render/activity.test.ts`:

```diff
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -134,7 +134,7 @@ describe('problemText', () => {
       'Only the conductor of this train and the moderators can do that.',
     );
     expect(said('train-moved-on')).toBe('The train has moved on meanwhile.');
-    expect(said('route-changed')).toBe('The route has changed meanwhile.');
+    expect(said('route-changed')).toBe('That button no longer leads where it said.');
   });
 });
 
```

Apply to `src/render/train-post.test.ts`:

```diff
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -439,17 +439,20 @@ describe('trainPanel', () => {
       trainPanel({ party, gym }).components[0]?.components.map(
         (button) => decodeCustomId(button.custom_id)?.args,
       );
-    // Each button says where the train was when the panel was drawn: the gym of its stop. Next
-    // and Skip also say where they lead: the gym of that stop, or the end of the route.
-    expect(drawnAt(train)).toEqual([['4', '1'], ['4'], ['4', '7'], ['4']]);
-    expect(drawnAt(onRoute([9, 4, 1], 1))).toEqual([['4', '1'], ['4'], ['4', 'end'], ['4']]);
-    expect(drawnAt(onRoute([4, 1, 7], 2))).toEqual([['7', 'end'], ['7'], ['7', 'end'], ['7']]);
+    // Each button says where the train was when the panel was drawn: the gym of its stop. Next,
+    // Previous and Skip also say where they lead: the gym of that stop, or the end of the route.
+    expect(drawnAt(train)).toEqual([['4', '1'], ['4', '4'], ['4', '7'], ['4']]);
+    expect(drawnAt(onRoute([9, 4, 1], 1))).toEqual([['4', '1'], ['4', '9'], ['4', 'end'], ['4']]);
+    expect(drawnAt(onRoute([4, 1, 7], 2))).toEqual([['7', 'end'], ['7', '1'], ['7', 'end'], ['7']]);
+    // From the end, Previous leads to the last stop of a route that remembers no other...
     expect(drawnAt(onRoute([4, 1, 7], 3))).toEqual([
       ['end', 'end'],
-      ['end'],
+      ['end', '7'],
       ['end', 'end'],
       ['end'],
     ]);
+    // ...and otherwise to the stop the route was finished from.
+    expect(drawnAt(onRoute([4, 1, 7], 3, { finishedFrom: 4 }))?.[1]).toEqual(['end', '4']);
   });
 
   it('switches off what cannot be done from where the train is', () => {
@@ -466,8 +469,15 @@ describe('trainPanel', () => {
     expect(whereText({ party: onRoute([4, 1], 1), gym })).toBe(
       `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). It is the last stop.`,
     );
+    // A finished route says where Previous leads: to its last stop, or to the stop it was
+    // finished from.
     expect(whereText({ party: onRoute([4, 1], 2), gym })).toBe(
-      'The train has finished its route of 2 stops.',
+      'The train has finished its route of 2 stops. ' +
+        `Previous takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
+    );
+    expect(whereText({ party: onRoute([4, 1, 7], 3, { finishedFrom: 4 }), gym })).toBe(
+      'The train has finished its route of 3 stops. ' +
+        `Previous takes it back to stop 1: [Veterans Memorial Bridge](<${maps(4)}>).`,
     );
     expect(whereText({ party: testTrain(), gym })).toBe(
       'This train has no route yet. Add its stops with `/route add`.',
```

Apply to `src/services/train-service.test.ts`:

```diff
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -203,6 +203,40 @@ describe('TrainService.move', () => {
     );
   });
 
+  it('says nothing of a Finish that was taken back right away, and leaves who is here as here', async () => {
+    const made = await boarded();
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
+    await settled(made);
+    const before = messages(made).length;
+    const finished = await made.trains.move(made.party.id, alice, 'finish', false);
+    expect(finished).toMatchObject({ kind: 'ok', finished: true });
+    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: 1 });
+    const back = await made.trains.move(made.party.id, alice, 'previous', false);
+    expect(back).toMatchObject({ kind: 'ok', at: 1, finished: false });
+    await settled(made);
+    // The train is where it was before the two moves: there is nothing to tell.
+    expect(messages(made)).toHaveLength(before);
+    expect(made.current().train).toMatchObject({ stop: 1, finishedFrom: null });
+    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
+  });
+
+  it('says that the train is back at its stop when a Finish is taken back after a while', async () => {
+    const made = await boarded();
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
+    await made.trains.move(made.party.id, alice, 'finish', false);
+    await settled(made);
+    expect(first(made)).toBe(`The train has finished its route. Moved by <@${ALICE}>.`);
+    await made.trains.move(made.party.id, alice, 'previous', false);
+    await settled(made);
+    expect(first(made)).toBe(
+      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
+    );
+    // Who was here when the route was finished is still here: the train came back to them.
+    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
+  });
+
   it('says nothing of a move that was taken back right away', async () => {
     const made = await boarded();
     await made.trains.move(made.party.id, alice, 'next', false);
@@ -227,13 +261,19 @@ describe('TrainService.move', () => {
       `The train is moving back to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
     );
     expect(await said('finish')).toBe(`The train has finished its route. Moved by <@${ALICE}>.`);
-    // Back from the end of the route to its last stop.
+    // Back from the end of the route to the stop it was finished from.
     expect(await said('previous')).toBe(
-      `The train is moving back to [Old Stone Fountain](<${maps(2)}>). Moved by <@${ALICE}>.`,
+      `The train is moving back to [The Stacks](<${maps(1)}>). Moved by <@${ALICE}>.`,
     );
+    expect(await said('skip')).toBe(
+      `The train is moving to [Old Stone Fountain](<${maps(2)}>), skipping ` +
+        `**Harbor Lighthouse Mural**. Moved by <@${ALICE}>.`,
+    );
+    // From the last stop, Next finishes the route.
     expect(await said('next')).toBe(`The train has finished its route. Moved by <@${ALICE}>.`);
+    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: 2 });
     // Earlier announcements stay: the post is a feed.
-    expect(messages(made)).toHaveLength(5);
+    expect(messages(made)).toHaveLength(6);
     // Finishing the route ends nothing.
     expect(made.current()).toMatchObject({ status: 'active', endTime: null, deletionTime: null });
   });
@@ -423,7 +463,9 @@ describe('TrainService: the announcement goes by where the train is, not by the
 
   it('says where a train that had finished went on to: back, and on to a stop that was added', async () => {
     const made = await boarded();
-    await made.trains.move(made.party.id, alice, 'finish', false);
+    await made.trains.move(made.party.id, alice, 'skip', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
     await settled(made);
     const before = messages(made).length;
     // Back to the last stop, a stop more, and on to it: the number of the stop is what it was.
@@ -635,7 +677,10 @@ describe('TrainService: "back" is said only of going back', () => {
 
   it('says "back" for Previous, once or several times, and nothing else', async () => {
     const made = await boarded();
-    await made.trains.move(made.party.id, alice, 'finish', false);
+    // The route is finished from its last stop, by Next.
+    await made.trains.move(made.party.id, alice, 'skip', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
     await settled(made);
     await made.trains.move(made.party.id, alice, 'previous', false);
     await settled(made);
@@ -738,7 +783,10 @@ describe('TrainService: moves while an announcement is on its way', () => {
 
   it('keeps of two announcements made one where the first began, and what the steps were', async () => {
     const made = await boarded([4, 1, 7, 2]);
-    await made.trains.move(made.party.id, alice, 'finish', false);
+    // The route is finished from its last stop, by Next.
+    await made.trains.move(made.party.id, alice, 'skip', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
     await settled(made);
     const slow = slowAnnouncements(made);
     // Back to the last stop: on its way. Then back again, and back once more.
```

Run: `npx vitest run --project unit src/commands/trains/move.test.ts src/domain/party/party-state.test.ts src/domain/party/tick.train.test.ts src/domain/party/train.test.ts src/render/activity.test.ts src/render/train-post.test.ts src/services/train-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/trains/move.ts`:

```diff
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -53,11 +53,17 @@ async function moveByCommand(
   });
 }
 
+/**
+ * One of the four commands that move a train. `details` says what the move is; `stayHere` adds
+ * to the rule that everybody who was here is coming again a case of this move in which they
+ * stay here.
+ */
 function moveCommand(
   name: string,
   move: TrainMove,
   description: string,
   details: string,
+  stayHere = '',
 ): SimpleCommand {
   return {
     data: new SlashCommandBuilder().setName(name).setDescription(description),
@@ -65,7 +71,7 @@ function moveCommand(
       category: 'train',
       details:
         `${details} Everybody who was here is coming again (not once the route is ` +
-        'finished: there is nowhere to come to), and the others are told where ' +
+        `finished: there is nowhere to come to${stayHere}), and the others are told where ` +
         'the train is going, with a ping for those who allow it. While the train has a ' +
         'conductor, only they and the moderators can move it; otherwise anybody who is signed ' +
         'up can. The same as the button "Move train…" on the post. Use it in the post of the ' +
@@ -89,7 +95,9 @@ export const previous = moveCommand(
   'previous',
   'previous',
   'Move this train back to the stop before',
-  'Takes the train one stop back, also from the end of its route to the last stop.',
+  'Takes the train one stop back. From the end of its route it goes back to the stop it was ' +
+    'at when the route was finished, which takes a mistaken `/finish` back.',
+  '; and not when a `/finish` is taken back: the train is where they are',
 );
 
 export const skip = moveCommand(
@@ -140,9 +148,11 @@ export async function openTrainPanel(
  * that no longer shows where the train is (somebody else moved it, the stop it was at was
  * removed) moves nothing: it says so and shows where the train is now, with fresh buttons, so
  * that two members who press Next on the same stop move the train once. A button without it
- * (none is made so) is taken the same way. `target` is where Next or Skip said it leads: when
- * the route was edited since and the move would lead to another stop, it moves nothing either
- * and says that the route has changed. The store decides, inside the change.
+ * (none is made so) is taken the same way. `target` is where Next, Previous or Skip led when
+ * the panel was drawn: when the route was edited since and the move would lead to another stop,
+ * it moves nothing either and says that the button no longer leads where it said. So it does
+ * when the route was finished from another stop since, which changes where Previous leads
+ * without any edit. The store decides, inside the change.
  *
  * A move that cannot be made from where the train is leaves the panel, with the reason above
  * where the train is (not for a finished route, which the panel says itself). A member who may
@@ -158,9 +168,9 @@ export async function pressTrainPanel(
 ): Promise<void> {
   const member = actingMember(interaction);
   const staff = isStaff(interaction, ctx);
-  // No place names an empty text: a press without one finds the train moved on. Next and Skip
-  // also say where they lead, and a press without that finds the route changed.
-  const promised = move === 'next' || move === 'skip' ? (target ?? '') : undefined;
+  // No place names an empty text: a press without one finds the train moved on. Every move
+  // but Finish also says where it leads, and a press without that finds the route changed.
+  const promised = move === 'finish' ? undefined : (target ?? '');
   const outcome = await ctx.trains.move(partyId, member, move, staff, from ?? '', promised);
   if (outcome.kind === 'gone') {
     await interaction.update({ content: partyOver(A_TRAIN), components: [] });
```

Apply to `src/domain/party/party-state.ts`:

```diff
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -30,10 +30,12 @@ import { PartyStatus } from './status.js';
  * (plan 3A) added `timed` (the name and the start of a party that has them) and `meetup` (what
  * only a meetup has) beside `raid`: a document has the parts that fit its party's type and no
  * others. Version 5 (plan 3B) added `train` (the route, the stop the train is at, its conductor
- * and its boss): a train is `timed` and `train`. Documents of versions 1 to 3 are those of
- * raids, and one of version 4 is that of a raid or a meetup.
+ * and its boss): a train is `timed` and `train`. Version 6 (plan 3C) added a train's
+ * `finishedFrom` (the stop its route was finished from); a train of a version 5 document
+ * remembers none. Documents of versions 1 to 3 are those of raids, and one of version 4 is that
+ * of a raid or a meetup.
  */
-export const PARTY_STATE_VERSION = 5;
+export const PARTY_STATE_VERSION = 6;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -109,18 +111,53 @@ const meetup = z.object({
   description: z.string().min(1).max(MAX_MEETUP_DESCRIPTION).nullable(),
 });
 
-const train = z
+const gymId = z.number().int().positive();
+
+/** What does not hold of where a train is on its route, whatever the version of its document. */
+function routeProblems(value: { route: number[]; stop: number }): string[] {
+  const problems: string[] = [];
+  if (new Set(value.route).size !== value.route.length)
+    problems.push('a gym is on the route twice');
+  if (value.stop > value.route.length) problems.push('the train is at a stop beyond its route');
+  return problems;
+}
+
+/** The details of a train as version 5 wrote them: read only. */
+const trainV5 = z
   .object({
-    route: z.array(z.number().int().positive()).max(MAX_ROUTE_STOPS),
+    route: z.array(gymId).max(MAX_ROUTE_STOPS),
     stop: z.number().int().nonnegative(),
     conductorId: snowflake.nullable(),
     boss: bossRef.nullable(),
   })
-  .refine((value) => new Set(value.route).size === value.route.length, {
-    error: 'a gym is on the route twice',
+  .superRefine((value, context) => {
+    for (const message of routeProblems(value)) context.addIssue({ code: 'custom', message });
+  });
+
+const train = z
+  .object({
+    route: z.array(gymId).max(MAX_ROUTE_STOPS),
+    stop: z.number().int().nonnegative(),
+    finishedFrom: gymId.nullable(),
+    conductorId: snowflake.nullable(),
+    boss: bossRef.nullable(),
   })
-  .refine((value) => value.stop <= value.route.length, {
-    error: 'the train is at a stop beyond its route',
+  .superRefine((value, context) => {
+    for (const message of routeProblems(value)) context.addIssue({ code: 'custom', message });
+    const { route, stop, finishedFrom } = value;
+    if (finishedFrom === null) return;
+    // Only a finished route remembers the stop it was finished from, which is one of its own.
+    if (route.length === 0 || stop < route.length) {
+      context.addIssue({
+        code: 'custom',
+        message: 'a route that is not finished remembers where it was finished from',
+      });
+    } else if (!route.includes(finishedFrom)) {
+      context.addIssue({
+        code: 'custom',
+        message: 'the route was finished from a gym that is not on it',
+      });
+    }
   });
 
 /** What does not hold between the parts of a document, whatever its version. */
@@ -166,6 +203,24 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/**
+ * Version 5, as plan 3B wrote it: read only, and upgraded when read. Its train does not say
+ * where its route was finished from.
+ */
+const stateV5 = z
+  .object({
+    v: z.literal(5),
+    ...shared,
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    train: trainV5.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 4, as plan 3A wrote it: read only. It is version 5 without a train. */
 const stateV4 = z
   .object({
@@ -250,6 +305,17 @@ function readState(stored: unknown) {
     if (!old.success) return old;
     return state.safeParse({ ...old.data, v: PARTY_STATE_VERSION });
   }
+  if (version === 5) {
+    const old = stateV5.safeParse(stored);
+    if (!old.success) return old;
+    const { train: oldTrain, ...rest } = old.data;
+    return state.safeParse({
+      ...rest,
+      v: PARTY_STATE_VERSION,
+      // Previous on a finished route of such a train leads to the last stop, as it did.
+      ...(oldTrain ? { train: { ...oldTrain, finishedFrom: null } } : {}),
+    });
+  }
   return state.safeParse(stored);
 }
 
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -246,6 +246,14 @@ export interface TrainDetails {
    * `route.length` means the route is finished; an empty route has only 0.
    */
   stop: number;
+  /**
+   * The gym of the stop the train was at when a move finished its route (Finish, or Next from
+   * the last stop), by id: Previous leads back there, so that a mistaken Finish can be taken
+   * back. A gym and not an index, so that it follows its stop through the edits of the route.
+   * Null whenever the route is not finished, when an edit finished it (the last stop was
+   * removed under the train), and once that gym is no longer on the route.
+   */
+  finishedFrom: number | null;
   /** Snowflake of the member who leads the train; null while nobody does. */
   conductorId: string | null;
   /** The Pokémon the train is after, when somebody said (`/boss`). */
```

Apply to `src/domain/party/train.ts`:

```diff
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -26,7 +26,7 @@ export function createTrain(input: NewTrain): Change<TrainParty> {
   const train: TrainParty = {
     ...newTimedParty(input, name),
     type: 'train',
-    train: { route: [], stop: 0, conductorId: null, boss: null },
+    train: { route: [], stop: 0, finishedFrom: null, conductorId: null, boss: null },
   };
   return { ok: true, party: settled(train, input.now) };
 }
@@ -53,16 +53,28 @@ export function nextStop(party: TrainParty): number | undefined {
   return currentStop(party) === undefined ? undefined : party.train.route[party.train.stop + 1];
 }
 
-/** The party with this in the part that only a train has. */
+/**
+ * The party with this in the part that only a train has. The stop the route was finished from
+ * (`finishedFrom`) is kept only while it means something: on a finished route that still has
+ * that gym. Every other route forgets it here, so that no change of a train has to.
+ */
 function withTrain(party: TrainParty, change: Partial<TrainDetails>): TrainParty {
-  return { ...party, train: { ...party.train, ...change } };
+  const train = { ...party.train, ...change };
+  const { route, stop, finishedFrom } = train;
+  const remembered =
+    finishedFrom !== null &&
+    route.length > 0 &&
+    stop >= route.length &&
+    route.includes(finishedFrom);
+  return { ...party, train: remembered ? train : { ...train, finishedFrom: null } };
 }
 
 /**
  * The train with another route, at the gym it was at: the current stop follows its gym through
  * every edit (the legacy bot kept the number, so removing an earlier stop moved the train on).
  * When that gym is no longer on the route, the train is at the stop that took its place, which
- * `fallback` names (an index of the new route). A finished route stays finished, and a train
+ * `fallback` names (an index of the new route). A finished route stays finished and goes on
+ * remembering the stop it was finished from while that gym is on it (`withTrain`), and a train
  * whose route is empty is at the start.
  */
 function withRoute(party: TrainParty, route: readonly number[], fallback: number): TrainParty {
@@ -160,9 +172,9 @@ function edited<Extra>(
  * Adds a gym to the end of the route. Only for a member who is signed up, and for staff
  * (`not-attending`); a gym that is on the route already is refused (`already-on-route`), and so
  * is a stop beyond what a route holds (`route-full`). A stop added to a finished route makes
- * the train go on there: that is a movement of the train (`moved`, see `edited`). The first
- * stop of a route is where the train then is, and is no movement. The caller has checked that
- * there is such a gym.
+ * the train go on there: that is a movement of the train (`moved`, see `edited`), after which
+ * the stop it had finished from is forgotten. The first stop of a route is where the train
+ * then is, and is no movement. The caller has checked that there is such a gym.
  */
 export function addStop(
   party: TrainParty,
@@ -184,7 +196,9 @@ export function addStop(
  * for staff; a
  * number the route does not have is refused (`no-such-stop`). The train stays at the gym it is
  * at; when that very stop is removed, the one after it is the current one, or the route is
- * finished when it was the last: that is a movement of the train (`moved`, see `edited`).
+ * finished when it was the last: that is a movement of the train (`moved`, see `edited`), and
+ * no Finish that Previous could take back, so Previous then leads to the last stop. Previous
+ * also leads to the last stop once the stop a finished route was finished from is removed.
  * `gymId` is the gym that was removed.
  */
 export function removeStop(
@@ -294,8 +308,8 @@ export function isTrainMove(value: string): value is TrainMove {
  * Why the train cannot move this way from where it is, or undefined when it can. All of them
  * need a route (`no-route`). `next` goes on from every stop (from the last one it finishes the
  * route) and not from a finished route; `previous` goes back from everywhere but the first
- * stop, also from a finished route to its last stop; `skip` needs a stop after the next one;
- * `finish` is refused once the route is finished.
+ * stop, also from a finished route (`stopAfter` says where to); `skip` needs a stop after the
+ * next one; `finish` is refused once the route is finished.
  */
 export function cannotMove(
   party: TrainParty,
@@ -314,14 +328,29 @@ export function cannotMove(
   }
 }
 
-/** The stop a move takes the train to, as an index of the route; its length is the end. */
-function stopAfter(party: TrainParty, move: TrainMove): number {
+/**
+ * The stop a finished route was finished from, as an index of the route; undefined when the
+ * route is not finished or nothing is remembered of it.
+ */
+function finishedFromStop(party: TrainParty): number | undefined {
+  const { route, finishedFrom } = party.train;
+  if (!routeFinished(party) || finishedFrom === null) return undefined;
+  const index = route.indexOf(finishedFrom);
+  return index >= 0 ? index : undefined;
+}
+
+/**
+ * The stop a move takes the train to, as an index of the route; its length is the end.
+ * `previous` from a finished route leads to the stop the route was finished from, which takes
+ * a mistaken Finish back, and to the last stop when none is remembered.
+ */
+export function stopAfter(party: TrainParty, move: TrainMove): number {
   const { route, stop } = party.train;
   switch (move) {
     case 'next':
       return Math.min(stop + 1, route.length);
     case 'previous':
-      return Math.max(stop - 1, 0);
+      return finishedFromStop(party) ?? Math.max(stop - 1, 0);
     case 'skip':
       return Math.min(stop + 2, route.length);
     case 'finish':
@@ -331,8 +360,8 @@ function stopAfter(party: TrainParty, move: TrainMove): number {
 
 /**
  * Where a move would take the train from where it is, as `placeOf` names a place: the id of the
- * gym of that stop, or `end`. A control that promises a stop ("Next is …") carries it, so that
- * a press leads there or nowhere (`moveTrain`).
+ * gym of that stop, or `end`. A control that leads to a stop ("Next is …", "Previous takes it
+ * back to …") carries it, so that a press leads there or nowhere (`moveTrain`).
  */
 export function targetOf(party: TrainParty, move: TrainMove): string {
   const gym = party.train.route[stopAfter(party, move)];
@@ -358,6 +387,12 @@ export interface TrainMoved {
  * here. Finishing the route does not end the party and changes none of its times (as with the
  * legacy bot).
  *
+ * A move that finishes the route remembers the stop it was made from (`finishedFrom`), and
+ * Previous from the end leads back there: a Finish that was a mistake is taken back. Who is
+ * here stays here then as well, since the train is where they are and nobody went anywhere.
+ * From a finished route that remembers no stop, Previous leads to the last one like a move to
+ * any other gym.
+ *
  * `from` is where the train was when the member asked (`placeOf`), for a control that was drawn
  * then: when the train is somewhere else by now, the move is refused (`train-moved-on`), so
  * that two members who press Next on the same stop move the train once. `target` is where that
@@ -381,7 +416,10 @@ export function moveTrain(
   if (target !== undefined && target !== targetOf(party, move)) return refused('route-changed');
   const { route, stop } = party.train;
   const to = stopAfter(party, move);
-  const moved = arrived(withTrain(party, { stop: to }));
+  // Only a move that finishes the route leaves something to remember: the gym it was made at.
+  const finishedFrom = to >= route.length ? (route[stop] ?? null) : null;
+  const placed = withTrain(party, { stop: to, finishedFrom });
+  const moved = to === finishedFromStop(party) ? placed : arrived(placed);
   const skipped = move === 'skip' ? route[stop + 1] : undefined;
   return {
     ok: true,
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -164,7 +164,7 @@ export function problemText(
     case 'train-moved-on':
       return 'The train has moved on meanwhile.';
     case 'route-changed':
-      return 'The route has changed meanwhile.';
+      return 'That button no longer leads where it said.';
   }
 }
 
```

Apply to `src/render/train-panel.ts`:

```diff
--- a/src/render/train-panel.ts
+++ b/src/render/train-panel.ts
@@ -10,6 +10,7 @@ import {
   nextStop,
   placeOf,
   routeFinished,
+  stopAfter,
   targetOf,
   TRAIN_MOVES,
   type TrainMove,
@@ -28,14 +29,22 @@ const MOVE_LABELS: Readonly<Record<TrainMove, string>> = {
 
 /**
  * Where a train is on its route and what comes next, as a member is told it: for the panel that
- * moves the train, and for the answer to a move.
+ * moves the train, and for the answer to a move. Of a finished route it says where Previous
+ * leads, which is how a Finish that was a mistake is taken back: to the stop the train was at,
+ * or to the last stop of a route that remembers none.
  */
 export function whereText(view: TrainPlaces): string {
   const { party } = view;
   const { route, stop } = party.train;
   if (route.length === 0) return 'This train has no route yet. Add its stops with `/route add`.';
   if (routeFinished(party)) {
-    return `The train has finished its route of ${count(route.length, 'stop')}.`;
+    const back = stopAfter(party, 'previous');
+    const gymId = route[back];
+    return (
+      `The train has finished its route of ${count(route.length, 'stop')}. ` +
+      `Previous takes it back to stop ${back + 1}: ` +
+      `${stopLink(gymId === undefined ? undefined : view.gym(gymId))}.`
+    );
   }
   const [at, next] = [currentStop(party), nextStop(party)];
   const here = `The train is at stop ${stop + 1} of ${route.length}: ${stopLink(at === undefined ? undefined : view.gym(at))}.`;
@@ -50,10 +59,10 @@ export function whereText(view: TrainPlaces): string {
  * from where the train is has its button switched off. The buttons name the train by its id,
  * like every control of a post, and carry where the train was when the panel was drawn
  * (`placeOf`: the gym of its stop, which an edit of the route does not change while the train
- * stays there). Next and Skip also carry the stop they lead to (`targetOf`). A press decides
- * anew: on a panel that no longer shows where the train is, or whose Next would lead to another
- * stop than it says, it moves nothing, so two members who press Next on the same stop move the
- * train once.
+ * stays there). Next, Previous and Skip also carry the stop they lead to (`targetOf`). A press
+ * decides anew: on a panel that no longer shows where the train is, or whose move would lead to
+ * another stop than it did when the panel was drawn, it moves nothing, so two members who press
+ * Next on the same stop move the train once.
  */
 export function trainPanel(view: TrainPlaces): {
   content: string;
@@ -75,8 +84,9 @@ export function trainPanel(view: TrainPlaces): {
         components: TRAIN_MOVES.map((move) => ({
           ...partyButton(party.id, move, MOVE_LABELS[move], styles[move], [
             place,
-            // What the panel promises of Next and Skip ("Next is …") travels with them.
-            ...(move === 'next' || move === 'skip' ? [targetOf(party, move)] : []),
+            // Where a move leads travels with it ("Next is …", "Previous takes it back to …");
+            // Finish leads to the end of whatever route there is.
+            ...(move === 'finish' ? [] : [targetOf(party, move)]),
           ]),
           ...(cannotMove(party, move) === undefined ? {} : { disabled: true }),
         })),
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/trains/move.test.ts src/domain/party/party-state.test.ts src/domain/party/tick.train.test.ts src/domain/party/train.test.ts src/render/activity.test.ts src/render/train-post.test.ts src/services/train-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/party-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/party-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 2bc9a40 -- src test   # must print nothing
npx prettier --check src/commands/trains/move.test.ts src/commands/trains/move.ts src/db/repositories/party-repository.db.test.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/tick.train.test.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/activity.test.ts src/render/activity.ts src/render/train-panel.ts src/render/train-post.test.ts src/services/train-service.test.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/trains/move.test.ts src/commands/trains/move.ts src/db/repositories/party-repository.db.test.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/tick.train.test.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/activity.test.ts src/render/activity.ts src/render/train-panel.ts src/render/train-post.test.ts src/services/train-service.test.ts
git commit -m "A Finish that can be taken back: Previous leads to the stop the train was at" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,597 unit tests.

---

### Task 2: A copy of a train in the channel of every other region it stops in

**Files:**
- Create: `src/components/party.train-copy.test.ts`, `src/render/mirrors.region.test.ts`, `src/services/party-mirrors.region.test.ts`
- Modify: `src/commands/trains/route.test.ts`, `src/discord/party-gateway.test.ts`, `src/discord/party-gateway.ts`, `src/domain/party/party.ts`, `src/render/mirrors.ts`, `src/render/party-controls.ts`, `src/services/party-mirrors.ts`, `src/services/party-service.train.test.ts`, `test/support/fake-gateway.ts`

**Interfaces:**
- Consumes: Task 1's train; `PartyMirrors` (`sync`, `create`, `syncShared`), `renderMirror`, `partyControls`, `MIRROR_KINDS`, `PartyGateway` and `FakePartyGateway`, `GymDirectory.regionsOf`, `RegionDirectory.byChannel`.
- Produces: The mirror kind `region`; `PartyMirrors` keeping one newest copy per slot (the kind, for `region` the kind in a channel), with `regionChannels(party)` and one more run of the shared queue ten minutes after a run that left something undone; `PartyGateway.mayPost(channelId): boolean` (and `noEmbeds` on the fake); `renderMirror('region', …)` with `invitationControls(rows)` (`src/render/party-controls.ts`); `PartyMirrorsOptions.regions.byChannel` and `gyms.regionsOf`.

`party-mirrors.test.ts` and `render/mirrors.test.ts` are not touched and must pass as they are. `DiscordPartyGateway.mayPost` asks the cache only (no request to Discord); a channel it does not know counts as allowed.

Reference commit of the prototype for this task: `7a99de1`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/trains/route.test.ts`:

```diff
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -127,7 +127,8 @@ describe('/route show', () => {
     // Nothing is put into the post, and the train is as it was.
     await made.trains.flush();
     expect((await made.lines()).filter((line) => /route/i.test(line))).toEqual([]);
-    expect(made.current().mirrorMessages).toEqual([]);
+    // (The route has a stop in East, whose channel has a copy of the train: nothing else.)
+    expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['region']);
   });
 
   it('is for anybody in the post, and says so when there is no route', async () => {
```

Create `src/components/party.train-copy.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeButton, sent, type FakeInteraction } from '../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
import { createdTrain } from '../../test/support/party-service.js';
import { createTestContext } from '../../test/support/test-context.js';
import { decodeCustomId } from '../discord/custom-id.js';
import { InteractionRouter } from '../discord/router.js';
import { attendeeOf } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { partyButtons } from './party.js';

const DAVE = '200000000000000005';

/**
 * A train from West with a stop in East, and so with a copy of its message in East's channel.
 * It has two groups, so the copy has their buttons too.
 */
async function setup() {
  const made = await createdTrain({ route: [4, 7] });
  await made.attendance.newGroup(made.party.id, { id: REPORTER });
  await made.attendance.joinGroup(made.party.id, { id: REPORTER }, 'A');
  await made.attendance.flush();
  await made.service.flush();
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
  const router = new InteractionRouter(ctx, [], [partyButtons]);
  const copy = made.gateway
    .messagesIn(EAST_CHANNEL)
    .find((sent) => sent.message.embeds !== undefined);
  if (!copy) throw new Error('the train has no copy in the channel of East');
  const ids = (copy.message.components ?? []).flatMap((row) =>
    row.components.flatMap((control) => ('custom_id' in control ? [control.custom_id] : [])),
  );
  /** A press on the last button of the copy that has this action, by Alice unless said otherwise. */
  const press = async (action: string, userId = ALICE): Promise<FakeInteraction> => {
    const customId = ids.findLast((id) => decodeCustomId(id)?.action === action);
    if (customId === undefined) throw new Error(`the copy has no button ${action}`);
    const interaction = fakeButton({
      customId,
      channelId: EAST_CHANNEL,
      userId,
      displayName: userId === ALICE ? 'Alice' : 'Somebody',
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, press, ids };
}

const privately = (content: string) => ({ content, flags: MessageFlags.Ephemeral });

describe('the buttons of the copy of a train in another region', () => {
  it('sign a member up who cannot see the forum of the train, and let them into it', async () => {
    const made = await setup();
    made.gateway.shutOut(WEST_FORUM, ALICE);
    const joined = await made.press('join');
    expect(joined.reply).toHaveBeenCalledWith(privately('You are coming, in group B.'));
    expect(attendeeOf(made.current(), ALICE)).toMatchObject({
      status: PartyStatus.Coming,
      name: 'Alice',
    });
    await made.access.flush();
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(true);
    // The post says who came, like for a press on its own buttons.
    await made.attendance.flush();
    expect(made.said()).toEqual([`<@${ALICE}> is coming, in group B.`]);
  });

  it('have no button that moves the train', async () => {
    const made = await setup();
    expect(made.ids.map((id) => decodeCustomId(id)?.action)).not.toContain('move');
  });

  it('sign up and let in whoever presses Interested, Here, +1 or the button of a group', async () => {
    const made = await setup();
    const members = [ALICE, BOB, CAROL, DAVE];
    made.gateway.shutOut(WEST_FORUM, ...members);
    const answers: (string | undefined)[] = [];
    for (const [index, action] of ['maybe', 'here', 'more', 'group'].entries()) {
      const pressed = await made.press(action, members[index]);
      answers.push(sent(pressed.reply).content);
    }
    expect(answers).toEqual([
      'You are interested, in group B.',
      'You are here, in group B.',
      // +1 by somebody who is not signed up signs them up; so does the button of a group.
      'You are interested, in group B.',
      'You are coming, in group B.',
    ]);
    await made.access.flush();
    for (const member of members) {
      expect(attendeeOf(made.current(), member)).toBeDefined();
      expect(made.gateway.canSee(WEST_FORUM, member)).toBe(true);
    }
  });

  it('tell who presses Leave or −1 without being signed up so, and let nobody in', async () => {
    const made = await setup();
    made.gateway.shutOut(WEST_FORUM, ALICE, BOB);
    const left = await made.press('leave', ALICE);
    const less = await made.press('less', BOB);
    for (const pressed of [left, less]) {
      expect(pressed.reply).toHaveBeenCalledWith(
        privately('You are not signed up for this train.'),
      );
    }
    await made.access.flush();
    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
    expect(attendeeOf(made.current(), BOB)).toBeUndefined();
    expect(made.gateway.canSee(WEST_FORUM, ALICE)).toBe(false);
    expect(made.gateway.canSee(WEST_FORUM, BOB)).toBe(false);
    expect(made.gateway.calls.filter((call) => call.startsWith('admitMember'))).toEqual([]);
  });

  it('answer as a control of a party that has ended once the train is over', async () => {
    const made = await setup();
    await made.service.end(made.party.id);
    await made.service.flush();
    // The copy is deleted with the train; a press that was on its way still arrives.
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
    const late = await made.press('join');
    expect(late.reply).toHaveBeenCalledWith(privately('This has ended.'));
  });
});
```

Apply to `src/discord/party-gateway.test.ts`:

```diff
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -119,6 +119,14 @@ describe('FakePartyGateway', () => {
     expect(gateway.findChannel('100000000000000001', 'remote-raids')).toBeUndefined();
   });
 
+  it('says where the bot may post embeds: everywhere but in the channels a test names', () => {
+    const gateway = new FakePartyGateway();
+    expect(gateway.mayPost('500000000000000001')).toBe(true);
+    gateway.noEmbeds.add('500000000000000001');
+    expect(gateway.mayPost('500000000000000001')).toBe(false);
+    expect(gateway.mayPost('500000000000000002')).toBe(true);
+  });
+
   it('creates a forum with tags, posts in it, and keeps what was done to a post', async () => {
     const gateway = new FakePartyGateway();
     const forum = await gateway.createForum('100000000000000001', 'west-raids', ['Egg', 'T5']);
```

Create `src/render/mirrors.region.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import { PARTY_NOW, PARTY_ZONE, testRaid, testTrain } from '../../test/support/parties.js';
import { decodeCustomId } from '../discord/custom-id.js';
import type { TrainParty } from '../domain/party/party.js';
import { renderMirror } from './mirrors.js';
import { invitationControls, partyControls } from './party-controls.js';
import { renderRaidPost } from './raid-post.js';
import { renderTrainPost } from './train-post.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const gyms = new Map(testGyms().map((gym) => [gym.id, gym]));
const base = testTrain();
const train: TrainParty = {
  ...base,
  groups: [{ id: 'A' }, { id: 'B' }],
  train: { ...base.train, route: [4, 7] },
};
const rendered = renderTrainPost({
  party: train,
  now: PARTY_NOW,
  zone: PARTY_ZONE,
  archiving: { graceMinutes: 5, warningMinutes: 60 },
  emoji,
  gym: (id) => gyms.get(id),
  boss: undefined,
  catalogue: catalogueFixture(),
});
const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };

/** The actions of the buttons of a message, row by row. */
const actions = (components: ReturnType<typeof partyControls> | undefined): string[][] =>
  (components ?? []).map((row) =>
    row.components.map((control) =>
      'custom_id' in control ? (decodeCustomId(control.custom_id)?.action ?? '') : '',
    ),
  );

describe('renderMirror for the channel of a region a train stops in', () => {
  it('copies the embed under a line that invites to sign up, and promises neither the link nor access', () => {
    const copy = renderMirror('region', rendered, place);
    expect(copy.embeds).toEqual(rendered.message.embeds);
    expect(copy.content).toBe(
      'A raid train that stops in this region. ' +
        'Sign up here to follow it in its post: <#900000000000000001>',
    );
    // Wherever the train was made: the line names no other channel.
    expect(renderMirror('region', rendered, { ...place, regionChannelId: undefined })).toEqual(
      copy,
    );
  });

  it('has the controls of the post without the row that moves the train', () => {
    expect(actions(rendered.message.components)).toEqual([
      ['maybe', 'join', 'here', 'leave'],
      ['less', 'more', 'remote'],
      ['group', 'group'],
      ['move'],
    ]);
    const copy = renderMirror('region', rendered, place);
    expect(actions(copy.components)).toEqual([
      ['maybe', 'join', 'here', 'leave'],
      ['less', 'more', 'remote'],
      ['group', 'group'],
    ]);
    expect(copy.components).toEqual(rendered.message.components?.slice(0, 3));
    // The copy in the post itself is the message as it is.
    expect(renderMirror('status', rendered, place)).toBe(rendered.message);
  });
});

describe('invitationControls', () => {
  it('drops the row of the button that moves a train, and nothing else', () => {
    expect(actions(invitationControls(partyControls(train)))).toEqual([
      ['maybe', 'join', 'here', 'leave'],
      ['less', 'more', 'remote'],
      ['group', 'group'],
    ]);
    // The controls of a party that has no such button stay as they are.
    const raid = partyControls(testRaid());
    expect(invitationControls(raid)).toEqual(raid);
    expect(invitationControls([])).toEqual([]);
  });

  it('leaves the copies of a raid as they were', () => {
    const raid = renderRaidPost({
      party: testRaid(),
      now: PARTY_NOW,
      gym: testGyms()[0],
      boss: undefined,
      catalogue: catalogueFixture(),
      showUnknownMoves: true,
      zone: PARTY_ZONE,
      emoji,
    });
    expect(renderMirror('remote', raid, place).components).toEqual(raid.message.components);
  });
});
```

Create `src/services/party-mirrors.region.test.ts`:

```ts
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { EAST_CHANNEL, UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE, BOB, MINUTE, withAttendees } from '../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  reportedRaid,
  restarted,
  TestRegions,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { PartyStatus } from '../domain/party/status.js';
import { MOVE_TRAIN_LABEL } from '../render/party-controls.js';
import type { Member } from './attendance-service.js';
import { RETRY_AFTER_MS } from './party-mirrors.js';
import type { PartyServiceOptions } from './party-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
/** Every change is shown at once, as when changes come far apart. */
const NO_DELAY = { renderDelayMs: 0, sharedDelayMs: 0 };

type Made = Awaited<ReturnType<typeof createdTrain>>;

/** The copies of party messages in a channel: what was sent there with an embed. */
const copiesIn = (made: Pick<Made, 'gateway'>, channelId: string) =>
  made.gateway.messagesIn(channelId).filter((sent) => sent.message.embeds !== undefined);

/** The invented gyms, with the Library (gym 1) lying in these region channels. */
function gymsWithLibraryIn(...channels: string[]): PartyServiceOptions['gyms'] {
  const gyms = gymsFixture();
  return {
    get: (id) => gyms.get(id),
    regionsOf: (id) => (id === 1 ? channels : gyms.regionsOf(id)),
  };
}

function missingPermissions(): DiscordAPIError {
  const code = RESTJSONErrorCodes.MissingPermissions;
  return new DiscordAPIError(
    { code, message: 'Missing Permissions' },
    code,
    403,
    'POST',
    '/channels/x/messages',
    {},
  );
}

describe('the copies of a train in the regions it stops in', () => {
  it('puts a copy into the channel of another region the route has a stop in, with a line that invites', async () => {
    // The bridge and the Library are in West, where the train was made; the mural is in East.
    const made = await createdTrain({ route: [4, 1, 7] });
    const { gateway, postId } = made;
    const [copy] = copiesIn(made, EAST_CHANNEL);
    const post = gateway.posts.get(postId);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(copy?.message.content).toBe(
      `A raid train that stops in this region. Sign up here to follow it in its post: <#${postId}>`,
    );
    expect(copy?.message.embeds).toEqual(post?.message.embeds);
    expect(copy?.message.mention).toBeUndefined();
    expect(made.current().mirrorMessages).toEqual([
      { channelId: EAST_CHANNEL, messageId: copy?.id, kind: 'region' },
    ]);
    // The channel of its own region has the line that links to the post, and no copy.
    expect(copiesIn(made, WEST_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
  });

  it('carries the controls of the post without the button that moves the train', async () => {
    const made = await createdTrain({ route: [4, 7] });
    const [copy] = copiesIn(made, EAST_CHANNEL);
    const post = made.gateway.posts.get(made.postId)?.message.components ?? [];
    expect(JSON.stringify(post)).toContain(MOVE_TRAIN_LABEL);
    expect(copy?.message.components).toEqual(post.slice(0, -1));
    expect(JSON.stringify(copy?.message.components)).toContain(`party:${made.party.id}:join`);
    expect(JSON.stringify(copy?.message.components)).not.toContain(`party:${made.party.id}:move`);
    // The copy at the bottom of the post itself keeps it.
    await made.service.showStatus(made.party.id);
    await made.service.flush();
    const status = made.gateway.messagesIn(made.postId).at(-1);
    expect(status?.message.components).toEqual(post);
  });

  it('makes none for a train that stays in its own region, or has no route', async () => {
    const home = await createdTrain({ route: [4, 1, 2] });
    expect(home.current().mirrorMessages).toEqual([]);
    expect(copiesIn(home, EAST_CHANNEL)).toEqual([]);
    expect(copiesIn(home, WEST_CHANNEL)).toEqual([]);
    const empty = await createdTrain();
    expect(empty.current().mirrorMessages).toEqual([]);
  });

  it('makes none for a raid or a meetup', async () => {
    const raid = await reportedRaid({ boss: { key: 'yveltal' } });
    const meetup = await createdMeetup();
    for (const made of [raid, meetup]) {
      expect(made.current().mirrorMessages).toEqual([]);
      expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
      expect(copiesIn(made, WEST_CHANNEL)).toEqual([]);
    }
  });

  it('shows a change in the copy too, and edits nothing when nothing changed', async () => {
    const made = await createdTrain({ route: [4, 7] });
    const { gateway, attendance, service, postId } = made;
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const [copy] = copiesIn(made, EAST_CHANNEL);
    expect(copy?.edits).toBe(1);
    expect(JSON.stringify(copy?.message.embeds)).toContain(ALICE);
    expect(copy?.message.embeds).toEqual(gateway.posts.get(postId)?.message.embeds);
    const before = gateway.calls.length;
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.calls.slice(before).filter((call) => call.startsWith('edit'))).toEqual([]);
  });

  it('keeps the copy for a stop the train has left, and on a finished route', async () => {
    const made = await createdTrain({ route: [7, 4, 1] });
    const [copy] = copiesIn(made, EAST_CHANNEL);
    await made.trains.move(made.party.id, { id: made.party.createdById }, 'next', false);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    await made.trains.move(made.party.id, { id: made.party.createdById }, 'finish', false);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    expect(made.current().mirrorMessages).toHaveLength(1);
  });

  it('follows the route: a stop in another region brings a copy, its last stop there takes it away', async () => {
    const made = await createdTrain({ route: [4] });
    const maker: Member = { id: made.party.createdById };
    expect(made.current().mirrorMessages).toEqual([]);
    await made.trains.addStop(made.party.id, maker, 7);
    await made.trains.addStop(made.party.id, maker, 8);
    await made.service.flush();
    // Two stops in East are one copy there.
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    const [copy] = copiesIn(made, EAST_CHANNEL);
    await made.trains.removeStop(made.party.id, maker, 2);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    await made.trains.removeStop(made.party.id, maker, 2);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(made.gateway.deleted).toContainEqual({ channelId: EAST_CHANNEL, messageId: copy?.id });
    expect(made.current().mirrorMessages).toEqual([]);
    // And with the whole route.
    await made.trains.addStop(made.party.id, maker, 9);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    await made.trains.clearRoute(made.party.id, maker, true);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('has one copy in each region of a gym that lies in several, and keeps them all', async () => {
    const gyms = gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: [1] }, { gyms });
    const recorded = () =>
      made
        .current()
        .mirrorMessages.map(({ kind, channelId }) => `${kind} ${channelId}`)
        .sort();
    const both = [`region ${EAST_CHANNEL}`, `region ${UNBOUNDED_CHANNEL}`];
    expect(recorded()).toEqual(both);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, WEST_CHANNEL)).toEqual([]);
    // Neither counts as an earlier copy of the other: both stay, and both are kept up to date.
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(recorded()).toEqual(both);
    expect(made.gateway.deleted.filter((gone) => gone.channelId !== made.postId)).toEqual([]);
    for (const channelId of [EAST_CHANNEL, UNBOUNDED_CHANNEL]) {
      const [copy] = copiesIn(made, channelId);
      expect(copy?.edits).toBe(1);
      expect(JSON.stringify(copy?.message.embeds)).toContain(ALICE);
    }
  });

  it('leaves out a region of another server', async () => {
    const regions = new TestRegions();
    regions.rows = regions.rows.map((region) =>
      region.channelId === EAST_CHANNEL ? { ...region, guildId: 2 } : region,
    );
    const made = await createdTrain({ route: [4, 7] }, {}, { regions });
    expect(made.current().mirrorMessages).toEqual([]);
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
  });

  it('leaves no channel out once the region of the train is gone', async () => {
    const made = await createdTrain({ route: [4, 7] });
    await made.store.update(made.party.id, (party) => ({ party: { ...party, regionId: null } }));
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, WEST_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual([
      'region',
      'region',
    ]);
  });

  it('has a copy of each of two trains through one region', async () => {
    const first = await createdTrain({ route: [4, 7] });
    const second = await createdTrain({ name: 'Sunday megas', route: [8] }, {}, first);
    expect(copiesIn(first, EAST_CHANNEL)).toHaveLength(2);
    const [one] = first.current().mirrorMessages;
    const [two] = second.current().mirrorMessages;
    expect(one).toMatchObject({ kind: 'region', channelId: EAST_CHANNEL });
    expect(two).toMatchObject({ kind: 'region', channelId: EAST_CHANNEL });
    expect(one?.messageId).not.toBe(two?.messageId);
    // A change of one train leaves the copy of the other alone.
    await second.attendance.signUp(second.party.id, alice, PartyStatus.Coming);
    await second.service.flush();
    expect(copiesIn(first, EAST_CHANNEL)).toHaveLength(2);
    expect(first.gateway.deleted.filter((gone) => gone.channelId === EAST_CHANNEL)).toEqual([]);
  });
});

describe('the copies of a train: restarts, failures and the end', () => {
  it('keeps the copy over a restart: no second one, one edit, and then only for a change', async () => {
    const made = await createdTrain({ route: [4, 7] });
    const [copy] = copiesIn(made, EAST_CHANNEL);
    const again = await restarted(made);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(copiesIn(made, EAST_CHANNEL).map((sent) => sent.id)).toEqual([copy?.id]);
    expect(copiesIn(made, EAST_CHANNEL)[0]?.edits).toBe(1);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)[0]?.edits).toBe(1);
  });

  it('makes a copy anew that somebody deleted', async () => {
    const made = await createdTrain({ route: [4, 7] });
    const [first] = copiesIn(made, EAST_CHANNEL);
    made.gateway.gone.add(first?.id ?? '');
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    const copies = copiesIn(made, EAST_CHANNEL).filter((copy) => copy.id !== first?.id);
    expect(copies).toHaveLength(1);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: EAST_CHANNEL, messageId: copies[0]?.id, kind: 'region' },
    ]);
  });

  it('leaves a region channel alone for ten minutes that refused it, and the others go on', async () => {
    const gyms = gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
    const made = await createdTrain({}, { gyms });
    const { gateway, service, attendance, clock, entries } = made;
    const send = gateway.sendMessage.bind(gateway);
    let refuse = true;
    gateway.sendMessage = (channelId, message) =>
      channelId === EAST_CHANNEL && refuse
        ? Promise.reject(missingPermissions())
        : send(channelId, message);
    await made.trains.addStop(made.party.id, { id: made.party.createdById }, 1);
    await service.flush();
    for (let change = 0; change < 3; change++) {
      await attendance.changeNumber(made.party.id, { id: made.party.createdById }, 1);
      await service.flush();
    }
    const warnings = entries.filter((entry) => entry.level === 40);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.msg).toMatch(/I lack a permission in that channel/);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toMatchObject([
      { kind: 'region', channelId: UNBOUNDED_CHANNEL },
    ]);
    // Ten minutes later it is tried again, and by then the permission is there.
    refuse = false;
    clock.now += 10 * MINUTE;
    await attendance.changeNumber(made.party.id, { id: made.party.createdById }, 1);
    await service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toHaveLength(2);
  });

  it('deletes every copy when the train ends, before the post is archived', async () => {
    const gyms = gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: [1] }, { gyms });
    const copies = made.current().mirrorMessages;
    expect(copies).toHaveLength(2);
    const before = made.gateway.calls.length;
    await made.service.end(made.party.id);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toEqual([]);
    for (const { channelId, messageId } of copies) {
      expect(made.gateway.deleted).toContainEqual({ channelId, messageId });
    }
    const calls = made.gateway.calls.slice(before);
    expect(calls.at(-1)).toMatch(/^archivePost /);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });
});

describe('the copies of a train: a region channel where the bot may not post embeds', () => {
  const everywhere = () => gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);

  it('gets no copy, and nothing is sent there', async () => {
    const gateway = new FakePartyGateway();
    gateway.noEmbeds.add(UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: [1] }, { gyms: everywhere() }, { gateway });
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(gateway.calls.filter((call) => call === `sendMessage ${UNBOUNDED_CHANNEL}`)).toEqual([]);
    expect(gateway.messagesIn(UNBOUNDED_CHANNEL)).toEqual([]);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toMatchObject([
      { kind: 'region', channelId: EAST_CHANNEL },
    ]);
    // Nothing is wrong with that: no warning, and nothing to try again.
    expect(made.entries.filter((entry) => entry.level === 40 || entry.level === 50)).toEqual([]);
  });

  it('loses the copy it has, like a region the route has left, and the others stay', async () => {
    const made = await createdTrain({ route: [1] }, { gyms: everywhere() });
    const { gateway } = made;
    const [east] = copiesIn(made, EAST_CHANNEL);
    const [unbounded] = copiesIn(made, UNBOUNDED_CHANNEL);
    gateway.noEmbeds.add(EAST_CHANNEL);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(gateway.deleted).toContainEqual({ channelId: EAST_CHANNEL, messageId: east?.id });
    expect(copiesIn(made, UNBOUNDED_CHANNEL).map((copy) => copy.id)).toEqual([unbounded?.id]);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)[0]?.edits).toBe(1);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: UNBOUNDED_CHANNEL, messageId: unbounded?.id, kind: 'region' },
    ]);
    // Once the bot may post there again, the next change brings the copy back.
    gateway.noEmbeds.delete(EAST_CHANNEL);
    made.service.changed(made.party.id);
    await made.service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
  });
});

describe('the copies of a train: what fails in one region leaves the others alone', () => {
  const everywhere = () => gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
  const warnings = (made: Made) => made.entries.filter((entry) => entry.level === 40);

  it('leaves a region channel alone for ten minutes that is gone, with one line in the log', async () => {
    const gateway = new FakePartyGateway();
    gateway.gone.add(UNBOUNDED_CHANNEL);
    const made = await createdTrain({ route: [1] }, { gyms: everywhere() }, { gateway });
    const maker: Member = { id: made.party.createdById };
    for (let change = 0; change < 3; change++) {
      await made.attendance.changeNumber(made.party.id, maker, 1);
      await made.service.flush();
    }
    const sends = () => gateway.calls.filter((call) => call === `sendMessage ${UNBOUNDED_CHANNEL}`);
    expect(sends()).toHaveLength(1);
    expect(warnings(made)).toHaveLength(1);
    expect(warnings(made)[0]?.msg).toMatch(/there is no such channel/);
    expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toMatchObject([
      { kind: 'region', channelId: EAST_CHANNEL },
    ]);
    // Ten minutes later it is tried again.
    gateway.gone.delete(UNBOUNDED_CHANNEL);
    made.clock.now += 10 * MINUTE;
    await made.attendance.changeNumber(made.party.id, maker, 1);
    await made.service.flush();
    expect(sends()).toHaveLength(2);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
  });

  it('keeps on record a copy it could not delete, deletes the other, and uses it again when the route returns', async () => {
    const made = await createdTrain({ route: [4, 1] }, { gyms: everywhere() });
    const { gateway } = made;
    const maker: Member = { id: made.party.createdById };
    const [east] = copiesIn(made, EAST_CHANNEL);
    const [unbounded] = copiesIn(made, UNBOUNDED_CHANNEL);
    const remove = gateway.deleteMessage.bind(gateway);
    gateway.deleteMessage = (channelId, messageId) =>
      channelId === EAST_CHANNEL
        ? Promise.reject(new Error('Discord is down'))
        : remove(channelId, messageId);
    await made.trains.removeStop(made.party.id, maker, 2);
    await made.service.flush();
    // The copy in the other region went; the one that could not be deleted is still known.
    expect(gateway.deleted).toContainEqual({
      channelId: UNBOUNDED_CHANNEL,
      messageId: unbounded?.id,
    });
    expect(made.current().mirrorMessages).toEqual([
      { channelId: EAST_CHANNEL, messageId: east?.id, kind: 'region' },
    ]);
    expect(warnings(made).map((entry) => entry.msg)).toEqual([
      'could not delete a copy of a party message',
    ]);
    // The route comes back to both regions: the copy that stayed is the copy again.
    const before = gateway.calls.length;
    await made.trains.addStop(made.party.id, maker, 1);
    await made.service.flush();
    expect(gateway.calls.slice(before)).not.toContain(`sendMessage ${EAST_CHANNEL}`);
    expect(copiesIn(made, EAST_CHANNEL).map((copy) => copy.id)).toEqual([east?.id]);
    expect(east?.message.embeds).toEqual(gateway.posts.get(made.postId)?.message.embeds);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(
      made
        .current()
        .mirrorMessages.map((mirror) => mirror.channelId)
        .sort(),
    ).toEqual([EAST_CHANNEL, UNBOUNDED_CHANNEL]);
  });

  it('leaves no copy and does not open the post again when the train ends while a copy is on its way', async () => {
    const made = await createdTrain({ route: [4] }, NO_DELAY);
    const { gateway, service, postId } = made;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = gateway.sendMessage.bind(gateway);
    let onItsWay = false;
    gateway.sendMessage = async (channelId, message) => {
      if (channelId === EAST_CHANNEL) {
        onItsWay = true;
        await gate;
      }
      return send(channelId, message);
    };
    await made.trains.addStop(made.party.id, { id: made.party.createdById }, 7);
    await vi.waitFor(() => {
      expect(onItsWay).toBe(true);
    });
    const ended = service.end(made.party.id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    release();
    expect(await ended).toBe(true);
    await service.flush();
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, reopened: 0 });
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });
});

describe('the copies of a train: a failure is made good without a change of the train', () => {
  const everywhere = () => gymsWithLibraryIn(WEST_CHANNEL, EAST_CHANNEL, UNBOUNDED_CHANNEL);
  const warnings = (made: Made) => made.entries.filter((entry) => entry.level === 40);

  beforeEach(() => {
    // Only the timers: the fakes answer on `setImmediate`, and the clock of the services is
    // `made.clock`.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A train with a copy in two regions; edits of the one in East fail while `failing.on`. */
  async function withFailingEdits() {
    const made = await createdTrain({ route: [1] }, { gyms: everywhere(), ...NO_DELAY });
    const failing = { on: true };
    const edit = made.gateway.editMessage.bind(made.gateway);
    made.gateway.editMessage = (channelId, messageId, message) =>
      channelId === EAST_CHANNEL && failing.on
        ? Promise.reject(new Error('Discord is down'))
        : edit(channelId, messageId, message);
    /** Somebody signs up, without a line in the post: the copies are to show them. */
    const change = async (memberId: string): Promise<void> => {
      await made.store.update(made.party.id, (party) => ({
        party: withAttendees(party, { [memberId]: {} }),
      }));
      made.service.changed(made.party.id);
    };
    const east = () => copiesIn(made, EAST_CHANNEL)[0];
    const unbounded = () => copiesIn(made, UNBOUNDED_CHANNEL)[0];
    return { ...made, failing, change, east, unbounded };
  }

  it('makes a failed edit in one region again after ten minutes, and edits the other at once', async () => {
    const made = await withFailingEdits();
    const timers = vi.getTimerCount();
    await made.change(ALICE);
    await vi.waitFor(() => {
      expect(warnings(made)).toHaveLength(1);
      expect(made.unbounded()?.edits).toBe(1);
      // The run is over: it has asked for another.
      expect(vi.getTimerCount()).toBe(timers + 1);
    });
    expect(warnings(made)[0]?.msg).toBe('could not update a copy of a party message');
    expect(made.east()?.edits).toBe(0);
    // The copy whose edit failed is still the copy.
    expect(made.current().mirrorMessages).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(timers + 1);

    // A second failure asks for nothing more: one run is waiting already.
    await made.change(BOB);
    await vi.waitFor(() => {
      expect(warnings(made)).toHaveLength(2);
      expect(made.unbounded()?.edits).toBe(2);
      expect(vi.getTimerCount()).toBe(timers + 1);
    });

    // Ten minutes later the edit is made, although the train did not change again.
    made.failing.on = false;
    made.clock.now += RETRY_AFTER_MS;
    vi.advanceTimersByTime(RETRY_AFTER_MS);
    await vi.waitFor(() => {
      expect(made.east()?.edits).toBe(1);
    });
    expect(made.east()?.message.embeds).toEqual(made.unbounded()?.message.embeds);
    expect(JSON.stringify(made.east()?.message.embeds)).toContain(BOB);
    expect(made.unbounded()?.edits).toBe(2);
    await made.service.flush();
    // All is well: nothing more is waiting.
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('tries a channel again that refused it, a moment after the ten minutes are over and not before', async () => {
    // The channel of East refuses the bot from the start: the train has its copy elsewhere.
    const gateway = new FakePartyGateway();
    const send = gateway.sendMessage.bind(gateway);
    let refuse = true;
    let asked = 0;
    gateway.sendMessage = (channelId, message) => {
      if (channelId === EAST_CHANNEL) asked++;
      return channelId === EAST_CHANNEL && refuse
        ? Promise.reject(missingPermissions())
        : send(channelId, message);
    };
    const made = await createdTrain(
      { route: [1] },
      { gyms: everywhere(), ...NO_DELAY },
      { gateway },
    );
    expect(warnings(made)).toHaveLength(1);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    expect(made.current().mirrorMessages).toHaveLength(1);
    // A run that leaves the refusing channel alone asks for another.
    const timers = vi.getTimerCount();
    await made.store.update(made.party.id, (party) => ({
      party: withAttendees(party, { [ALICE]: {} }),
    }));
    made.service.changed(made.party.id);
    await vi.waitFor(() => {
      expect(copiesIn(made, UNBOUNDED_CHANNEL)[0]?.edits).toBe(1);
      expect(vi.getTimerCount()).toBe(timers + 1);
    });
    expect(copiesIn(made, EAST_CHANNEL)).toEqual([]);
    expect(asked).toBe(1);

    // One millisecond before the refusal ends nothing is tried: a run then would find the
    // channel still left alone, and wait all over again.
    refuse = false;
    made.clock.now += 10 * MINUTE - 1;
    vi.advanceTimersByTime(10 * MINUTE);
    await new Promise((resolve) => setImmediate(resolve));
    expect(vi.getTimerCount()).toBe(timers + 1);
    expect(asked).toBe(1);

    // A moment later the refusal is over, and the copy is sent without the train changing.
    made.clock.now += RETRY_AFTER_MS - 10 * MINUTE + 1;
    vi.advanceTimersByTime(RETRY_AFTER_MS - 10 * MINUTE);
    await vi.waitFor(() => {
      expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
      expect(made.current().mirrorMessages).toHaveLength(2);
      // All is well: the run asked for no other.
      expect(vi.getTimerCount()).toBe(timers);
    });
    expect(asked).toBe(2);
    expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
    await made.service.flush();
  });

  it('tries nothing again for a train that has ended meanwhile', async () => {
    const made = await withFailingEdits();
    const timers = vi.getTimerCount();
    await made.change(ALICE);
    await vi.waitFor(() => {
      expect(warnings(made)).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(timers + 1);
    });
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(vi.getTimerCount()).toBe(timers);
    const before = made.gateway.calls.length;
    made.clock.now += RETRY_AFTER_MS;
    vi.advanceTimersByTime(RETRY_AFTER_MS);
    await new Promise((resolve) => setImmediate(resolve));
    expect(made.gateway.calls.slice(before)).toEqual([]);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('asks for nothing after shutdown', async () => {
    const made = await withFailingEdits();
    const timers = vi.getTimerCount();
    await made.change(ALICE);
    await vi.waitFor(() => {
      expect(warnings(made)).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(timers + 1);
    });
    await made.service.flush();
    expect(vi.getTimerCount()).toBe(timers);
  });
});
```

Apply to `src/services/party-service.train.test.ts`:

```diff
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -138,7 +138,11 @@ describe('PartyService: the post of a train', () => {
     expect(made.gateway.posts.get(made.postId)?.forumId).toBe(WEST_FORUM);
     expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
     expect(embed(made)?.description).toContain('**Now at** [Café Élan Fresco](');
-    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
+    // East gets no line that links to a new train: only the copy for the stop there.
+    expect(made.gateway.messagesIn(EAST_CHANNEL).map((sent) => sent.message.content)).toEqual([
+      'A raid train that stops in this region. ' +
+        `Sign up here to follow it in its post: <#${made.postId}>`,
+    ]);
   });
 
   it('shows who signed up and where the train is after a change', async () => {
```

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -88,6 +88,8 @@ export class FakePartyGateway implements PartyGateway {
   rejectThumbnails = false;
   readonly calls: string[] = [];
   readonly channelNames = new Map<string, string>();
+  /** Channels in which the bot may not send messages with embeds: `mayPost` answers false. */
+  readonly noEmbeds = new Set<string>();
   readonly emojis = new Map<string, string>();
   /** By forum: the members whose roles do not let them see it. */
   readonly outsiders = new Map<string, Set<string>>();
@@ -465,6 +467,11 @@ export class FakePartyGateway implements PartyGateway {
     return undefined;
   }
 
+  /** The bot may post embeds everywhere but in the channels of `noEmbeds`. */
+  mayPost(channelId: string): boolean {
+    return !this.noEmbeds.has(channelId);
+  }
+
   emoji(_channelId: string, name: string): string | undefined {
     return this.emojis.get(name);
   }
```

Run: `npx vitest run --project unit src/commands/trains/route.test.ts src/components/party.train-copy.test.ts src/discord/party-gateway.test.ts src/render/mirrors.region.test.ts src/services/party-mirrors.region.test.ts src/services/party-service.train.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -142,6 +142,14 @@ export interface PartyGateway {
    * none (of several, the oldest).
    */
   findChannel(nearChannelId: string, name: string): string | undefined;
+  /**
+   * Whether the bot may send messages with embeds in a text channel, from the cache: what
+   * `findChannel` asks of the channels it finds. It is for text channels (the channels of
+   * regions): of a thread it would ask the channel the thread is in. A channel that is not in
+   * the cache counts as allowed, so that the send decides. Without the permission to embed, Discord does not refuse
+   * a message: it shows it without its embed.
+   */
+  mayPost(channelId: string): boolean;
   /**
    * A custom emoji, by name, of the server a channel is in, as message text (`<:name:id>`).
    * From the cache; undefined when the server has none of that name.
@@ -149,7 +157,7 @@ export interface PartyGateway {
   emoji(channelId: string, name: string): string | undefined;
 }
 
-/** What the bot needs in a channel to put a copy of a raid there. */
+/** What the bot needs in a channel to put a copy of a party's message there. */
 const CAN_POST = [
   PermissionFlagsBits.ViewChannel,
   PermissionFlagsBits.SendMessages,
@@ -577,6 +585,14 @@ export class DiscordPartyGateway implements PartyGateway {
     return found?.id;
   }
 
+  mayPost(channelId: string): boolean {
+    const channel = this.client.channels.cache.get(channelId);
+    if (!channel || channel.isDMBased()) return true;
+    const me = channel.guild.members.me;
+    // Unknown (the bot's own member is not cached) counts as allowed: Discord will say.
+    return me === null || (channel.permissionsFor(me)?.has(CAN_POST) ?? false);
+  }
+
   emoji(channelId: string, name: string): string | undefined {
     const channel = this.client.channels.cache.get(channelId);
     if (!channel || channel.isDMBased()) return undefined;
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -90,8 +90,10 @@ export interface PartyGroup {
  * A copy of the party's message besides the first message of its post (spec 5.2), with the same
  * controls. `ex` and `remote` are in the server's channels for raids at EX gyms and for raids
  * that can be joined remotely; `status` is the copy `/status` puts at the bottom of the post
- * itself (`channelId` is then the post). The newest of a kind counts; an earlier one stays
- * recorded until it has been deleted.
+ * itself (`channelId` is then the post). `region` is a train's copy in the text channel of
+ * another region its route has a stop in: one in each such channel. The newest of a kind (of a
+ * kind in a channel, for `region`) counts; an earlier one stays recorded until it has been
+ * deleted.
  */
 export interface MirrorMessage {
   channelId: string;
@@ -99,7 +101,7 @@ export interface MirrorMessage {
   kind: MirrorKind;
 }
 
-export const MIRROR_KINDS = ['ex', 'remote', 'status'] as const;
+export const MIRROR_KINDS = ['ex', 'remote', 'status', 'region'] as const;
 export type MirrorKind = (typeof MIRROR_KINDS)[number];
 
 export type PartyType = 'raid' | 'train' | 'meetup';
```

Apply to `src/render/mirrors.ts`:

```diff
--- a/src/render/mirrors.ts
+++ b/src/render/mirrors.ts
@@ -1,5 +1,6 @@
 import type { OutgoingMessage } from '../discord/party-gateway.js';
 import type { MirrorKind } from '../domain/party/party.js';
+import { invitationControls } from './party-controls.js';
 import type { RenderedPost } from './party-post.js';
 
 /** Where a party is, for the line above a copy of its message in another channel. */
@@ -16,6 +17,12 @@ export interface MirrorPlace {
  * copy at the bottom of the post itself (`status`), which every kind of party can have, is the
  * message as it is. The copies in another channel (`ex`, `remote`) are a raid's alone
  * (`raidMirrors`): a line above them says what raid it is and links to the post.
+ *
+ * `region` is the copy of a train in the channel of another region it stops in, for the members
+ * there, who may not see the forum the train's post is in: its line invites them to sign up,
+ * which lets them in unless somebody keeps them out. Until then Discord shows them the link as
+ * an unknown channel, so the line promises neither the link nor the access. Its controls are
+ * the post's without the button that moves the train (`invitationControls`).
  */
 export function renderMirror(
   kind: MirrorKind,
@@ -23,6 +30,15 @@ export function renderMirror(
   place: MirrorPlace,
 ): OutgoingMessage {
   if (kind === 'status') return rendered.message;
+  if (kind === 'region') {
+    return {
+      ...rendered.message,
+      content:
+        'A raid train that stops in this region. ' +
+        `Sign up here to follow it in its post: <#${place.postId}>`,
+      components: invitationControls(rendered.message.components ?? []),
+    };
+  }
   const region = place.regionChannelId === undefined ? '' : ` in <#${place.regionChannelId}>`;
   const what = kind === 'ex' ? 'A raid at a gym that can host EX raids' : 'A raid';
   return { ...rendered.message, content: `${what}${region}: <#${place.postId}>` };
```

Apply to `src/render/party-controls.ts`:

```diff
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -7,7 +7,7 @@ import {
   type APIComponentInMessageActionRow,
   type APIModalInteractionResponseCallbackData,
 } from 'discord.js';
-import { encodeCustomId } from '../discord/custom-id.js';
+import { decodeCustomId, encodeCustomId } from '../discord/custom-id.js';
 import {
   headCount,
   isRaid,
@@ -157,6 +157,19 @@ export function partyControls(party: Party): Row[] {
 /** The label of the button of a train's post that opens the panel to move it. */
 export const MOVE_TRAIN_LABEL = 'Move train…';
 
+/**
+ * The controls of a post for a copy of its message that invites members elsewhere to sign up
+ * (a train in the channel of another region it stops in): all of them but the row of "Move
+ * train…". A train is moved from its post, by who is there; the copy is for getting in.
+ */
+export function invitationControls(rows: readonly Row[]): Row[] {
+  const moves = (row: Row): boolean =>
+    row.components.some(
+      (control) => 'custom_id' in control && decodeCustomId(control.custom_id)?.action === 'move',
+    );
+  return rows.filter((row) => !moves(row));
+}
+
 /**
  * The question to members who were present when somebody of their group completed the raid, with
  * its two answers. The members are named as mentions, as many as fit; whom it may ping is the
```

Apply to `src/services/party-mirrors.ts`:

```diff
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -5,7 +5,14 @@ import {
   type OutgoingMessage,
   type PartyGateway,
 } from '../discord/party-gateway.js';
-import { isRaid, type MirrorKind, type MirrorMessage, type Party } from '../domain/party/party.js';
+import {
+  isRaid,
+  isTrain,
+  type MirrorKind,
+  type MirrorMessage,
+  type Party,
+  type TrainParty,
+} from '../domain/party/party.js';
 import { raidMirrors } from '../domain/party/raid.js';
 import type { Logger } from '../log.js';
 import { renderMirror, type MirrorPlace } from '../render/mirrors.js';
@@ -16,12 +23,29 @@ import type { PartyStore } from './party-store.js';
 const MINUTE = 60_000;
 /** A channel that refused the bot is left alone for this long, then tried again. */
 const REFUSED_FOR_MS = 10 * MINUTE;
+/**
+ * How long after a run that left something undone the copies of a party are gone through
+ * again: a moment longer than a refusal lasts. The refusal is measured by the clock of the
+ * services and this by a timer, and a run that came a millisecond before the refusal ended
+ * would leave the channel alone once more and wait all over again.
+ */
+export const RETRY_AFTER_MS = REFUSED_FOR_MS + 1_000;
 
 export interface PartyMirrorsOptions {
   store: PartyStore;
-  gateway: Pick<PartyGateway, 'sendMessage' | 'editMessage' | 'deleteMessage' | 'findChannel'>;
-  regions: { byId(id: number): { channelId: string } | undefined };
-  gyms: { get(id: number): { taggedEx: boolean; confirmedEx: boolean } | undefined };
+  gateway: Pick<
+    PartyGateway,
+    'sendMessage' | 'editMessage' | 'deleteMessage' | 'findChannel' | 'mayPost'
+  >;
+  regions: {
+    byId(id: number): { channelId: string } | undefined;
+    byChannel(channelId: string): { guildId: number | null } | undefined;
+  };
+  gyms: {
+    get(id: number): { taggedEx: boolean; confirmedEx: boolean } | undefined;
+    /** The region channels a gym lies in. */
+    regionsOf(gymId: number): string[];
+  };
   settings: Pick<Settings, 'features' | 'channels'>;
   /** What the post of a party shows now. */
   render: (party: Party) => RenderedPost;
@@ -29,8 +53,9 @@ export interface PartyMirrorsOptions {
   now: () => number;
   /**
    * How long the changes of one party are gathered into one edit of its copies in the server's
-   * shared channels. Default ten seconds: every raid of a server edits in those two channels,
-   * and Discord limits the edits per channel.
+   * shared channels. Default ten seconds: every raid of a server edits in those two channels
+   * (and every train of a region in the channels of its neighbours), and Discord limits the
+   * edits per channel.
    */
   sharedDelayMs?: number;
 }
@@ -47,24 +72,49 @@ function hasPicture(message: OutgoingMessage): boolean {
   return (message.embeds ?? []).some((embed) => embed.thumbnail !== undefined);
 }
 
+/** The kinds of copy that stand in other channels than the post, kept by the slower queue. */
+const SHARED_KINDS: readonly MirrorKind[] = ['ex', 'remote', 'region'];
+
+/** A copy a party should have: of this kind, in this channel. */
+interface WantedCopy {
+  kind: MirrorKind;
+  channelId: string;
+}
+
+/**
+ * What a party has one copy of: a kind, and for the copies in region channels (`region`) a
+ * kind in a channel, since a train has one in every region it stops in. Of several copies with
+ * the same slot the newest counts and the others are deleted.
+ */
+function slotOf(copy: WantedCopy): string {
+  return copy.kind === 'region' ? `region:${copy.channelId}` : copy.kind;
+}
+
 /**
  * The copies of a party's message besides the first message of its post (spec 5.2): one in the
  * server's channel for raids at EX gyms, one in its channel for raids that can be joined
- * remotely, and the one `/status` puts at the bottom of the post. Each carries the controls of
- * the post, which name the party in their custom ids, so a member signs up where they see it.
+ * remotely, one of a train in the text channel of every other region its route has a stop in,
+ * and the one `/status` puts at the bottom of the post. Each carries the controls of the post,
+ * which name the party in their custom ids, so a member signs up where they see it.
  *
  * The party's record (`mirrorMessages`) is the list of what exists: a copy is recorded as soon
  * as it is sent and taken off the record only once it is deleted, so that whatever fails on the
  * way is tried again with the next render and nothing with buttons is left that nobody knows
- * of. A kind has one copy; of several (a new one was sent, the old one could not be deleted
- * yet) the newest counts.
+ * of. A kind has one copy (the copies in region channels: one in each channel, `slotOf`); of
+ * several (a new one was sent, the old one could not be deleted yet) the newest counts.
  *
  * The copy in the post is brought up to date with the post itself (`syncStatus`). The copies in
  * the shared channels have a queue of their own (`changed`), slower than the
  * post's: all raids of a server edit in those channels, and a post must never wait for them.
+ * The copies of a train in region channels are kept by that queue too.
  *
  * A server without such a channel (by the names in `settings.channels`), with the feature
  * switched off, or with a channel the bot may not write in, simply has no copy there.
+ *
+ * A run of the queue that left something undone (an edit or a send failed, a channel was left
+ * alone because it refused the bot) is followed by one more for that party once the refusal is
+ * over (`retryLater`, `RETRY_AFTER_MS`), so that a copy does not stay out of date until the
+ * party happens to change again.
  */
 export class PartyMirrors {
   private readonly shared: Coalescer<string>;
@@ -72,8 +122,13 @@ export class PartyMirrors {
   private readonly sent = new Map<string, string>();
   /** `/status` calls that are under way, by party: the end of the party waits for them. */
   private readonly reposting = new Map<string, Set<Promise<unknown>>>();
-  /** Channels that refused the bot (a missing permission), and until when they are left alone. */
+  /**
+   * Channels that refused the bot (a missing permission, a channel that is gone), and until
+   * when they are left alone.
+   */
   private readonly refused = new Map<string, number>();
+  /** Parties whose copies are gone through once more, and the timer that will ask for it. */
+  private readonly retries = new Map<string, NodeJS.Timeout>();
 
   constructor(private readonly options: PartyMirrorsOptions) {
     this.shared = new Coalescer({
@@ -105,6 +160,31 @@ export class PartyMirrors {
     );
   }
 
+  /**
+   * The channels that take a copy of a train: the text channel of every region of the train's
+   * server that a gym of its route lies in, each once, without the channel of the region the
+   * train was made in (that one has the line that links to the post). The whole route counts,
+   * also the stops the train has left and those of a finished route: the copy stays until the
+   * train ends or the route no longer touches the region. A gym can lie in several regions.
+   * When the train's own region is gone, no channel is left out.
+   *
+   * A channel in which the bot may not post embeds is none of them: Discord would not refuse the
+   * copy there but show it without its embed, a line with buttons that says nothing of the
+   * train. A copy that stands in such a channel goes, like one of a region the route has left.
+   */
+  private regionChannels(party: TrainParty): string[] {
+    const { regions, gyms, gateway } = this.options;
+    const own = party.regionId === null ? undefined : regions.byId(party.regionId)?.channelId;
+    const channels = new Set<string>();
+    for (const gymId of party.train.route) {
+      for (const channelId of gyms.regionsOf(gymId)) {
+        if (channelId === own) continue;
+        if (regions.byChannel(channelId)?.guildId === party.guildId) channels.add(channelId);
+      }
+    }
+    return [...channels].filter((channelId) => gateway.mayPost(channelId));
+  }
+
   private place(party: Party, postId: string): MirrorPlace {
     const region = party.regionId === null ? undefined : this.options.regions.byId(party.regionId);
     return { postId, regionChannelId: region?.channelId };
@@ -123,7 +203,8 @@ export class PartyMirrors {
    * render. A channel that refuses the bot for lack of a permission is left alone for a while
    * (for edits and sends), and said once: every render of every raid would otherwise ask Discord
    * again and be refused. A failed deletion (`refuse` false) does not refuse the channel: it is
-   * tried again at every render, and must not extend the refusal for ever.
+   * tried again at every render, and must not extend the refusal for ever. False when the work
+   * failed.
    */
   private async attempt(
     what: string,
@@ -131,10 +212,11 @@ export class PartyMirrors {
     channelId: string,
     work: () => Promise<unknown>,
     refuse = true,
-  ): Promise<void> {
+  ): Promise<boolean> {
     const { log, now } = this.options;
     try {
       await work();
+      return true;
     } catch (err) {
       if (refuse && isMissingPermission(err)) {
         this.refused.set(channelId, now() + REFUSED_FOR_MS);
@@ -145,39 +227,48 @@ export class PartyMirrors {
       } else {
         log.warn({ err, party: partyId, channel: channelId }, `could not ${what}`);
       }
+      return false;
     }
   }
 
   /**
    * Brings the copies of these kinds up to date with `rendered`: edits those that would show
-   * something else, creates the ones in `wanted` (kind to channel) that the party lacks, and
-   * deletes the ones it should no longer have, as well as every copy of a kind but the newest.
-   * A copy that somebody deleted is taken off the record. Never rejects.
+   * something else, creates the ones in `wanted` that the party lacks, and deletes the ones it
+   * should no longer have, as well as every copy of a slot (`slotOf`) but the newest. A copy
+   * that somebody deleted is taken off the record. Never rejects.
+   *
+   * False when something is left to do that the next run can do without the party changing: an
+   * edit or a send failed, or a channel was left alone because it refused the bot. (A deletion
+   * that failed is tried with the next change; the copy stays on the record until then.)
    */
   private async sync(
     party: Party,
     rendered: RenderedPost,
     kinds: readonly MirrorKind[],
-    wanted: ReadonlyMap<MirrorKind, string>,
-  ): Promise<void> {
+    wanted: readonly WantedCopy[],
+  ): Promise<boolean> {
+    const { log, now } = this.options;
     const postId = party.forumPostId;
-    if (postId === null) return;
+    if (postId === null) return true;
+    let complete = true;
     const place = this.place(party, postId);
     const mine = party.mirrorMessages.filter((mirror) => kinds.includes(mirror.kind));
-    const newest = new Map<MirrorKind, MirrorMessage>();
-    for (const mirror of mine) newest.set(mirror.kind, mirror);
+    const newest = new Map<string, MirrorMessage>();
+    for (const mirror of mine) newest.set(slotOf(mirror), mirror);
+    const wantedIn = new Map(wanted.map((copy) => [slotOf(copy), copy.channelId]));
 
-    const have = new Set<MirrorKind>();
+    const have = new Set<string>();
     for (const mirror of mine) {
-      const current = newest.get(mirror.kind) === mirror;
-      // The copy in the post stays while it is in this post; one in a shared channel only while
+      const slot = slotOf(mirror);
+      const current = newest.get(slot) === mirror;
+      // The copy in the post stays while it is in this post; one in another channel only while
       // that channel takes it (an elite boss was named, the raid is over, the channel was
-      // replaced by another).
+      // replaced by another, the route of the train no longer has a stop in that region).
       const keep =
         current &&
         (mirror.kind === 'status'
           ? mirror.channelId === postId
-          : wanted.get(mirror.kind) === mirror.channelId);
+          : wantedIn.get(slot) === mirror.channelId);
       if (!keep) {
         // A deletion is always tried, also in a channel that refuses edits and sends.
         await this.attempt(
@@ -191,11 +282,12 @@ export class PartyMirrors {
       }
       // Not edited while its channel refuses the bot; it counts as there.
       if (this.isRefused(mirror.channelId)) {
-        have.add(mirror.kind);
+        have.add(slot);
+        complete = false;
         continue;
       }
       let gone = false;
-      await this.attempt(
+      const edited = await this.attempt(
         'update a copy of a party message',
         party.id,
         mirror.channelId,
@@ -204,15 +296,62 @@ export class PartyMirrors {
           if (gone) await this.forget(party.id, mirror);
         },
       );
+      complete &&= edited;
       // A copy whose edit failed is still there.
-      if (!gone) have.add(mirror.kind);
+      if (!gone) have.add(slot);
     }
-    for (const [kind, channelId] of wanted) {
-      if (have.has(kind) || this.isRefused(channelId)) continue;
-      await this.attempt('send a copy of a party message', party.id, channelId, () =>
-        this.create(party.id, kind, channelId, renderMirror(kind, rendered, place)),
+    for (const copy of wanted) {
+      const { kind, channelId } = copy;
+      if (have.has(slotOf(copy))) continue;
+      if (this.isRefused(channelId)) {
+        complete = false;
+        continue;
+      }
+      let noChannel = false;
+      const sent = await this.attempt(
+        'send a copy of a party message',
+        party.id,
+        channelId,
+        async () => {
+          const message = renderMirror(kind, rendered, place);
+          noChannel = (await this.create(party.id, kind, channelId, message)) === 'no-channel';
+        },
       );
+      complete &&= sent;
+      // A channel that is not there is left alone like one that refuses the bot, and said once:
+      // every run would otherwise send into it again.
+      if (sent && noChannel) {
+        this.refused.set(channelId, now() + REFUSED_FOR_MS);
+        log.warn(
+          { party: party.id, channel: channelId },
+          'could not send a copy of a party message: there is no such channel, or nothing can ' +
+            'be sent to it, and I leave it alone for a while',
+        );
+        complete = false;
+      }
     }
+    return complete;
+  }
+
+  /**
+   * Has the copies of a party gone through once more a moment after the time is over for which
+   * a channel that refused the bot is left alone (`RETRY_AFTER_MS`): what a run could not do is
+   * then done although the party did not change. One timer per party; nothing is asked for a party that has ended by then.
+   */
+  private retryLater(partyId: string): void {
+    if (this.retries.has(partyId)) return;
+    const timer = setTimeout(() => {
+      this.retries.delete(partyId);
+      if (this.options.store.get(partyId)) this.shared.request(partyId);
+    }, RETRY_AFTER_MS);
+    timer.unref();
+    this.retries.set(partyId, timer);
+  }
+
+  /** Nothing is left to try again for a party. */
+  private settled(partyId: string): void {
+    clearTimeout(this.retries.get(partyId));
+    this.retries.delete(partyId);
   }
 
   /**
@@ -220,28 +359,40 @@ export class PartyMirrors {
    * the render of the post, which runs once at a time per party. Never rejects.
    */
   async syncStatus(party: Party, rendered: RenderedPost): Promise<void> {
-    await this.sync(party, rendered, ['status'], new Map());
+    await this.sync(party, rendered, ['status'], []);
   }
 
-  /** One run of the queue of a party: its copies in the shared channels. */
+  /**
+   * One run of the queue of a party: its copies in other channels than its post. A raid has
+   * them in the server's shared channels, a train in the channels of the other regions it
+   * stops in, a meetup nowhere.
+   */
   private async syncShared(partyId: string): Promise<void> {
     const { store, gyms, now, render } = this.options;
     const party = store.get(partyId);
     const postId = party?.forumPostId;
-    if (!party || !postId) return;
+    if (!party || !postId) {
+      this.settled(partyId);
+      return;
+    }
     const rendered = render(party);
     const place = this.place(party, postId);
     const gym = party.gymId === null ? undefined : gyms.get(party.gymId);
     // Without a channel of the server to start from, no channel is found and the copies go;
     // they are made again once there is one.
     const near = place.regionChannelId ?? party.forumChannelId ?? undefined;
-    const wanted = new Map<MirrorKind, string>();
+    const wanted: WantedCopy[] = [];
     // Only a raid has copies in the shared channels (they are the channels for raids).
     for (const kind of isRaid(party) ? raidMirrors(party, gym, now()) : []) {
       const channelId = this.channelFor(kind, near);
-      if (channelId !== undefined) wanted.set(kind, channelId);
+      if (channelId !== undefined) wanted.push({ kind, channelId });
+    }
+    // Only a train has a route that can lead into other regions.
+    for (const channelId of isTrain(party) ? this.regionChannels(party) : []) {
+      wanted.push({ kind: 'region', channelId });
     }
-    await this.sync(party, rendered, ['ex', 'remote'], wanted);
+    if (await this.sync(party, rendered, SHARED_KINDS, wanted)) this.settled(partyId);
+    else this.retryLater(partyId);
   }
 
   /** Edits a copy unless it shows this already. False when the copy is gone. */
@@ -280,26 +431,27 @@ export class PartyMirrors {
   }
 
   /**
-   * Sends a copy and records it on the party, then deletes the earlier copies of its kind and
-   * takes each off the record once it is gone; one that cannot be deleted stays recorded, for
-   * the next render to try again. A copy that cannot be recorded (the party ended meanwhile,
-   * the write failed) is deleted again. False when nothing was recorded.
+   * Sends a copy and records it on the party, then deletes the earlier copies of its slot (its
+   * kind, and for a copy in a region channel that channel) and takes each off the record once
+   * it is gone; one that cannot be deleted stays recorded, for the next render to try again. A
+   * copy that cannot be recorded (the party ended meanwhile, the write failed) is deleted
+   * again: `unrecorded`. `no-channel` when there is no such channel to send to.
    */
   private async create(
     partyId: string,
     kind: MirrorKind,
     channelId: string,
     message: OutgoingMessage,
-  ): Promise<boolean> {
+  ): Promise<'recorded' | 'no-channel' | 'unrecorded'> {
     const { store, gateway, log } = this.options;
     const messageId = await this.send(channelId, message);
-    if (messageId === undefined) return false;
+    if (messageId === undefined) return 'no-channel';
     const mirror: MirrorMessage = { channelId, messageId, kind };
     let earlier: MirrorMessage[] = [];
     let recorded = false;
     try {
       const result = await store.update(partyId, (current) => {
-        earlier = current.mirrorMessages.filter((other) => other.kind === kind);
+        earlier = current.mirrorMessages.filter((other) => slotOf(other) === slotOf(mirror));
         return { party: { ...current, mirrorMessages: [...current.mirrorMessages, mirror] } };
       });
       recorded = result?.written ?? false;
@@ -315,7 +467,7 @@ export class PartyMirrors {
         }
       }
     }
-    if (!recorded) return false;
+    if (!recorded) return 'unrecorded';
     this.sent.set(messageId, JSON.stringify(message));
     for (const stale of earlier) {
       await this.attempt(
@@ -326,7 +478,7 @@ export class PartyMirrors {
         false,
       );
     }
-    return true;
+    return 'recorded';
   }
 
   /** Takes a copy off the party's record; the message itself is not touched. */
@@ -364,7 +516,7 @@ export class PartyMirrors {
       const postId = party?.forumPostId;
       if (!party || !postId) return false;
       const message = renderMirror('status', this.options.render(party), this.place(party, postId));
-      return this.create(partyId, 'status', postId, message);
+      return (await this.create(partyId, 'status', postId, message)) === 'recorded';
     })();
     const running = this.reposting.get(partyId) ?? new Set();
     running.add(run);
@@ -394,9 +546,14 @@ export class PartyMirrors {
     }
   }
 
-  /** Does what is waiting in the queues now. For shutdown and for tests. */
+  /**
+   * Does what is waiting in the queues now, and gives up what was to be tried again later, so
+   * that nothing is asked for afterwards. For shutdown and for tests.
+   */
   async flush(): Promise<void> {
     await this.shared.flush();
+    for (const timer of this.retries.values()) clearTimeout(timer);
+    this.retries.clear();
   }
 
   /** Parties with a run of their queue waiting or going on. */
@@ -406,10 +563,12 @@ export class PartyMirrors {
 
   /**
    * Deletes every copy of the message of a party that has ended, also the one in its post, and
-   * forgets what is kept for them. Never rejects.
+   * forgets what is kept for them, also that its copies were to be gone through again. Never
+   * rejects.
    */
   async remove(party: Party): Promise<void> {
     const { gateway, log } = this.options;
+    this.settled(party.id);
     for (const mirror of party.mirrorMessages) {
       this.sent.delete(mirror.messageId);
       try {
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/trains/route.test.ts src/components/party.train-copy.test.ts src/discord/party-gateway.test.ts src/render/mirrors.region.test.ts src/services/party-mirrors.region.test.ts src/services/party-service.train.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 7a99de1 -- src test   # must print nothing
npx prettier --check src/commands/trains/route.test.ts src/components/party.train-copy.test.ts src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/domain/party/party.ts src/render/mirrors.region.test.ts src/render/mirrors.ts src/render/party-controls.ts src/services/party-mirrors.region.test.ts src/services/party-mirrors.ts src/services/party-service.train.test.ts test/support/fake-gateway.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/trains/route.test.ts src/components/party.train-copy.test.ts src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/domain/party/party.ts src/render/mirrors.region.test.ts src/render/mirrors.ts src/render/party-controls.ts src/services/party-mirrors.region.test.ts src/services/party-mirrors.ts src/services/party-service.train.test.ts test/support/fake-gateway.ts
git commit -m "A copy of a train in the channel of every other region it stops in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 2,631 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-3c HEAD -- src test` prints nothing; `npm run test:db` once, complete; `npm run build`.
2. Whole-branch review (Opus, high effort) of the two commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `finishedFrom` (kept by `withTrain`; Previous from a finished route; state document version 6), the mirror kind `region` (one copy per region channel, `regionChannels`, `mayPost`, `invitationControls`, the retry of the shared queue).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 3C" section (what is left open, what Phase 5 must pick up, the things named under "Not in this plan"). The spec ("as built" for 5.2 and 5.5), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. It comes after the staging of plans 3A and 3B. `npm run deploy-commands` is needed only for the changed help text of `/previous` (no new command). The test server needs a second region with its channel and at least one gym.

A Finish taken back:

- [ ] "Move train…" after Finish from a middle stop: only Previous is enabled, and the text names the stop it leads back to. Pressing it shows that stop in the panel and "Now at" that gym in the post, and whoever was Here is still Here.
- [ ] Finish, then Previous within five seconds: no message in the post. Finish, wait for "has finished its route", then Previous: one "moving back to …" message.
- [ ] Finish; from a second panel (or with `/route remove`) take the remembered stop off; Previous on the first panel: "That button no longer leads where it said." and a fresh panel naming the last stop; that Previous puts Here back to Coming.
- [ ] `/finish` then `/previous` typed: the same answers. Next from the last stop, then Previous: back at the last stop, Here still Here.
- [ ] The panel at the first stop: Discord accepts the disabled Previous whose place and target are the same gym.
- [ ] Restart the bot with a finished train: Previous still leads to the remembered stop.

Copies in other regions:

- [ ] `/route add` a gym of the second region: within a few seconds its region channel has the train's message with the line above it and the buttons Interested, Join, Here, Leave, −1, +1, Remote, the group buttons when there are groups, and no "Move train…". The train's own region channel has only its "New train: …" line.
- [ ] The copy follows the post (a sign-up, a move, a new name) within about ten seconds; `/route remove` of that region's last stop deletes it; adding it again sends a new one.
- [ ] A gym where two regions overlap: both channels have a copy. Two trains through one region: two copies.
- [ ] A region channel where the bot has Send Messages but not Embed Links: no copy there, and nothing in the log; after the permission is given and the train next changes, the copy comes.
- [ ] A region channel the bot cannot see: one warning in the log, the other regions' copies unaffected, tried again after ten minutes.
- [ ] A copy deleted by hand: it comes back with the train's next change.
- [ ] The end of the train by the clock, by `/delete` and by deleting the post: every copy is gone, and the post is archived last and stays archived.
- [ ] A restart with copies up: no second copies; one deleted by hand while the bot was down comes back.
- [ ] To note down: how the copy looks in a busy region channel on desktop and phone, and whether edits of a copy that is hours old are slower.

Needs a second ordinary account that cannot see the forum of the train's region: how `<#post>` shows above the copy before signing up, and that it becomes a working link right after Join without a reload; Join, Interested, Here and +1 on the copy each sign up and give access to the post (visible and writable, the movement ping arrives); Leave takes the access back; Leave and −1 by somebody not signed up answer "You are not signed up for this train." and give none.
